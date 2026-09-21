#include <jni.h>
#include <llama.h>
#include <ggml-backend.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/stat.h>
#include <chrono>
#include <string>
#include <vector>
#include <cstdio>
#include <stdexcept>
#include <algorithm>
#include <cstdlib>
#ifdef PROBE_VULKAN
#include <vulkan/vulkan.h>
#endif
using Clock=std::chrono::steady_clock;
static int logfd=-1;
static void stage(const char* text) { fprintf(stderr,"\nSTAGE: %s\n",text);fflush(stderr);if(logfd>=0)fsync(logfd); }
static double seconds(Clock::time_point t) { return std::chrono::duration<double>(Clock::now()-t).count(); }
extern "C" JNIEXPORT jbyteArray JNICALL Java_uk_co_ukmla_gputester_ProbeNative_run(JNIEnv* e,jobject,jint fd,jstring logfile,jint layers) {
 const char* p=e->GetStringUTFChars(logfile,nullptr);logfd=open(p,O_WRONLY|O_APPEND|O_CREAT,0600);e->ReleaseStringUTFChars(logfile,p);
 if(logfd<0) { e->ThrowNew(e->FindClass("java/lang/IllegalStateException"),"Cannot open native log");return nullptr; }
 dup2(logfd,STDERR_FILENO);dup2(logfd,STDOUT_FILENO);setvbuf(stderr,nullptr,_IONBF,0);setvbuf(stdout,nullptr,_IONBF,0);
 llama_model* model=nullptr;llama_context* ctx=nullptr;llama_sampler* sampler=nullptr;
 std::string result;
 try {
  stage("validate seekable GGUF descriptor");
  struct stat st{};fstat(fd,&st);fprintf(stderr,"Model bytes: %lld\n",(long long)st.st_size);
  char magic[4];if(lseek(fd,0,SEEK_SET)<0 || pread(fd,magic,4,0)!=4 || std::string(magic,4)!="GGUF") throw std::runtime_error("Select a local, seekable GGUF in Downloads; cloud streams are not supported");
  const bool gpu=std::string(PROBE_BACKEND)!="cpu";
  fprintf(stderr,"Backend compiled: %s; requested layers=%d; threads=4; context=2048; batch=64; ubatch=64; flash attention=OFF; output cap=32\n",PROBE_BACKEND,layers);
  // Deliberately use upstream defaults for Vulkan features; record a clean baseline before driver-specific workarounds.
  stage("backend initialisation and device enumeration");
#ifdef PROBE_VULKAN
  VkApplicationInfo app{VK_STRUCTURE_TYPE_APPLICATION_INFO};app.apiVersion=VK_API_VERSION_1_1;
  VkInstanceCreateInfo ci{VK_STRUCTURE_TYPE_INSTANCE_CREATE_INFO};ci.pApplicationInfo=&app;
  VkInstance instance=VK_NULL_HANDLE;VkResult vr=vkCreateInstance(&ci,nullptr,&instance);
  fprintf(stderr,"Vulkan instance result: %d\n",vr);
  if(vr==VK_SUCCESS) {
   uint32_t nd=0;vkEnumeratePhysicalDevices(instance,&nd,nullptr);std::vector<VkPhysicalDevice> ds(nd);
   if(nd)vkEnumeratePhysicalDevices(instance,&nd,ds.data());
   for(auto d:ds) { VkPhysicalDeviceProperties pr{};vkGetPhysicalDeviceProperties(d,&pr);
    fprintf(stderr,"Vulkan GPU=%s vendor=%u device=%u driverVersion=%u apiVersion=%u maxStorageBufferRange=%u sharedMemory=%u\n",pr.deviceName,pr.vendorID,pr.deviceID,pr.driverVersion,pr.apiVersion,pr.limits.maxStorageBufferRange,pr.limits.maxComputeSharedMemorySize);
   }
   vkDestroyInstance(instance,nullptr);
  }
#endif
  const auto begin=Clock::now();llama_backend_init();
  ggml_backend_dev_t selected=nullptr;
  for(size_t i=0;i<ggml_backend_dev_count();i++) {
   auto d=ggml_backend_dev_get(i);auto type=ggml_backend_dev_type(d);
   fprintf(stderr,"Device: %s | %s | type=%d\n",ggml_backend_dev_name(d),ggml_backend_dev_description(d),(int)type);
   if((gpu && (type==GGML_BACKEND_DEVICE_TYPE_GPU || type==GGML_BACKEND_DEVICE_TYPE_IGPU)) || (!gpu && type==GGML_BACKEND_DEVICE_TYPE_CPU)) { if(!selected)selected=d; }
  }
  if(!selected) throw std::runtime_error("Requested backend has no usable device. No CPU fallback was attempted.");
  ggml_backend_dev_t devices[]={selected,nullptr};
  auto mp=llama_model_default_params();mp.devices=devices;mp.n_gpu_layers=gpu?layers:0;mp.use_mmap=true;
  stage("model loading");const auto loadStart=Clock::now();
  std::string path="/proc/self/fd/"+std::to_string(fd);model=llama_model_load_from_file(path.c_str(),mp);
  if(!model)throw std::runtime_error("Model loading failed; see preceding native log");
  fprintf(stderr,"Model loading seconds: %.3f\n",seconds(loadStart));
  auto cp=llama_context_default_params();cp.n_ctx=2048;cp.n_batch=64;cp.n_ubatch=64;cp.n_threads=4;cp.n_threads_batch=4;cp.flash_attn_type=LLAMA_FLASH_ATTN_TYPE_DISABLED;
  stage("context allocation");ctx=llama_init_from_model(model,cp);if(!ctx)throw std::runtime_error("Context allocation failed");
  const std::string prompt="<|im_start|>system\nAnswer briefly. /no_think<|im_end|>\n<|im_start|>user\nWhat is the capital of France? Answer in one short sentence. /no_think<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n";
  auto vocab=llama_model_get_vocab(model);int n=-llama_tokenize(vocab,prompt.c_str(),prompt.size(),nullptr,0,true,true);if(n<=0 || n>1024)throw std::runtime_error("Unexpected tokenizer result");
  std::vector<llama_token> tokens(n);llama_tokenize(vocab,prompt.c_str(),prompt.size(),tokens.data(),n,true,true);
  stage("prompt processing");auto prefill=Clock::now();
  for(int i=0;i<n;i+=64)if(llama_decode(ctx,llama_batch_get_one(tokens.data()+i,std::min(64,n-i))))throw std::runtime_error("Prompt decoding failed");
  fprintf(stderr,"Prompt tokens: %d; prefill seconds: %.3f\n",n,seconds(prefill));
  stage("answer generation");sampler=llama_sampler_init_greedy();auto gen=Clock::now();int count=0;
  for(int i=0;i<32;i++) {
   auto token=llama_sampler_sample(sampler,ctx,-1);if(llama_vocab_is_eog(vocab,token))break;
   if(count==0)fprintf(stderr,"Time to first output token from test start: %.3f seconds\n",seconds(begin));
   char piece[512];int size=llama_token_to_piece(vocab,token,piece,sizeof(piece),0,true);if(size>0)result.append(piece,size);count++;
   if(llama_decode(ctx,llama_batch_get_one(&token,1)))throw std::runtime_error("Generation decoding failed");
  }
  fprintf(stderr,"Generated tokens: %d; generation seconds: %.3f; total seconds: %.3f\n",count,seconds(gen),seconds(begin));
  fprintf(stderr,"OUTPUT: %s\n",result.c_str());stage("inference completed; releasing model");
 } catch(const std::exception& ex) { result="TEST ERROR: "+std::string(ex.what());fprintf(stderr,"%s\n",result.c_str()); }
 if(sampler)llama_sampler_free(sampler);if(ctx)llama_free(ctx);if(model)llama_model_free(model);
 stage("native test complete");auto a=e->NewByteArray(result.size());e->SetByteArrayRegion(a,0,result.size(),reinterpret_cast<const jbyte*>(result.data()));return a;
}
