#include <jni.h>
#include <llama.h>
#include <ggml-backend.h>
#include <atomic>
#include <string>
#include <vector>
#include <algorithm>
#include <thread>

static llama_model* model = nullptr;
static llama_context* ctx = nullptr;
static std::atomic<bool> cancelled{false};

static std::string str(JNIEnv* env, jstring s) {
    const char* p = env->GetStringUTFChars(s, nullptr);
    std::string r(p);
    env->ReleaseStringUTFChars(s, p);
    return r;
}

static void error(JNIEnv* e, const char* msg) {
    e->ThrowNew(e->FindClass("java/lang/IllegalStateException"), msg);
}

static ggml_backend_dev_t opencl_gpu() {
    for(size_t i=0;i<ggml_backend_dev_count();i++) {
        auto d=ggml_backend_dev_get(i);
        const auto type=ggml_backend_dev_type(d);
        if(type==GGML_BACKEND_DEVICE_TYPE_GPU || type==GGML_BACKEND_DEVICE_TYPE_IGPU) return d;
    }
    return nullptr;
}

extern "C" JNIEXPORT void JNICALL Java_uk_co_ukmla_reader_OpenClNative_cancel(JNIEnv*, jobject) {
    cancelled = true;
}

extern "C" JNIEXPORT void JNICALL Java_uk_co_ukmla_reader_OpenClNative_load(JNIEnv* e, jobject, jstring path) {
    if(ctx) { llama_free(ctx); ctx=nullptr; }
    if(model) { llama_model_free(model); model=nullptr; }

    llama_backend_init();
    auto gpu=opencl_gpu();
    if(!gpu) {
        error(e,"No usable OpenCL GPU device was found.");
        return;
    }

    const std::string modelPath=str(e,path);
    unsigned hc=std::thread::hardware_concurrency();
    int threads=std::max(4,std::min(8,(int)(hc ? hc : 6)));

    ggml_backend_dev_t devices[]={gpu,nullptr};
    auto mp=llama_model_default_params();
    mp.devices=devices;
    mp.n_gpu_layers=2;
    mp.load_mode=LLAMA_LOAD_MODE_MMAP;
    model=llama_model_load_from_file(modelPath.c_str(),mp);
    if(!model) {
        error(e,"OpenCL could not load the Qwen model.");
        return;
    }

    auto cp=llama_context_default_params();
    cp.n_ctx=4096;
    cp.n_batch=64;
    cp.n_ubatch=64;
    cp.n_threads=threads;
    cp.n_threads_batch=threads;
    cp.flash_attn_type=LLAMA_FLASH_ATTN_TYPE_DISABLED;
    cp.abort_callback=[](void*) { return cancelled.load(); };
    ctx=llama_init_from_model(model,cp);
    if(!ctx) {
        llama_model_free(model);
        model=nullptr;
        error(e,"OpenCL could not initialise the Qwen context.");
        return;
    }
}

extern "C" JNIEXPORT jbyteArray JNICALL Java_uk_co_ukmla_reader_OpenClNative_generate(JNIEnv* e, jobject, jstring input) {
    if(!ctx) { error(e,"OpenCL model is not loaded."); return nullptr; }
    cancelled=false;
    std::string prompt=str(e,input);
    auto vocab=llama_model_get_vocab(model);
    int n=-llama_tokenize(vocab,prompt.c_str(),prompt.size(),nullptr,0,true,true);
    if(n<=0 || n>3500) { error(e,"Selection is too long. Select a shorter passage."); return nullptr; }

    std::vector<llama_token> tokens(n);
    llama_tokenize(vocab,prompt.c_str(),prompt.size(),tokens.data(),n,true,true);
    llama_memory_clear(llama_get_memory(ctx),true);
    for(int i=0;i<n;i+=64) {
        if(cancelled) return e->NewByteArray(0);
        if(llama_decode(ctx,llama_batch_get_one(tokens.data()+i,std::min(64,n-i)))) {
            error(e,"OpenCL could not process this selection.");
            return nullptr;
        }
    }

    auto sampler=llama_sampler_chain_init(llama_sampler_chain_default_params());
    llama_sampler_chain_add(sampler,llama_sampler_init_top_k(40));
    llama_sampler_chain_add(sampler,llama_sampler_init_top_p(0.9f,1));
    llama_sampler_chain_add(sampler,llama_sampler_init_temp(0.5f));
    llama_sampler_chain_add(sampler,llama_sampler_init_dist(42));

    std::string out;
    for(int i=0;i<128 && !cancelled;i++) {
        llama_token token=llama_sampler_sample(sampler,ctx,-1);
        if(llama_vocab_is_eog(vocab,token)) break;
        char piece[512];
        int count=llama_token_to_piece(vocab,token,piece,sizeof(piece),0,true);
        if(count>0) out.append(piece,count);
        if(llama_decode(ctx,llama_batch_get_one(&token,1))) {
            llama_sampler_free(sampler);
            error(e,"OpenCL generation failed.");
            return nullptr;
        }
    }
    llama_sampler_free(sampler);
    if(cancelled) out.clear();

    jbyteArray result=e->NewByteArray(out.size());
    e->SetByteArrayRegion(result,0,out.size(),reinterpret_cast<const jbyte*>(out.data()));
    return result;
}
