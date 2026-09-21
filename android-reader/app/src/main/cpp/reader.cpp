#include <jni.h>
#include <llama.h>
#include <atomic>
#include <string>
#include <vector>
#include <algorithm>
static llama_model* model = nullptr;
static llama_context* ctx = nullptr;
static std::atomic<bool> cancelled{false};
static std::string str(JNIEnv* env, jstring s) { const char* p = env->GetStringUTFChars(s, nullptr); std::string r(p); env->ReleaseStringUTFChars(s,p); return r; }
static void error(JNIEnv* e, const char* msg) { e->ThrowNew(e->FindClass("java/lang/IllegalStateException"),msg); }
extern "C" JNIEXPORT void JNICALL Java_uk_co_ukmla_reader_Native_cancel(JNIEnv*, jobject) { cancelled = true; }
extern "C" JNIEXPORT void JNICALL Java_uk_co_ukmla_reader_Native_load(JNIEnv* e, jobject, jstring path) {
    if(ctx) { llama_free(ctx); ctx=nullptr; } if(model) { llama_model_free(model); model=nullptr; }
    llama_backend_init();
    auto mp=llama_model_default_params(); mp.n_gpu_layers=0;
    model=llama_model_load_from_file(str(e,path).c_str(),mp);
    if(!model) { error(e,"Could not load this GGUF. Import the recommended Qwen3 4B Q4_K_M model."); return; }
    auto cp=llama_context_default_params(); cp.n_ctx=4096; cp.n_batch=256; cp.n_threads=4; cp.n_threads_batch=4;
    cp.abort_callback=[](void*) { return cancelled.load(); };
    ctx=llama_init_from_model(model,cp);
    if(!ctx) error(e,"Not enough memory to create the model context. Close other apps and retry.");
}
extern "C" JNIEXPORT jbyteArray JNICALL Java_uk_co_ukmla_reader_Native_generate(JNIEnv* e, jobject, jstring input) {
    if(!ctx) { error(e,"Import a GGUF model first."); return nullptr; }
    cancelled=false;
    std::string prompt=str(e,input);
    auto vocab=llama_model_get_vocab(model);
    int n=-llama_tokenize(vocab,prompt.c_str(),prompt.size(),nullptr,0,true,true);
    if(n>3500) { error(e,"Selection is too long. Select a shorter passage."); return nullptr; }
    std::vector<llama_token> tokens(n);
    llama_tokenize(vocab,prompt.c_str(),prompt.size(),tokens.data(),n,true,true);
    llama_memory_clear(llama_get_memory(ctx),true);
    for(int i=0;i<n;i+=256) {
        if(cancelled) return e->NewByteArray(0);
        if(llama_decode(ctx,llama_batch_get_one(tokens.data()+i,std::min(256,n-i)))) { error(e,"Model could not process this selection."); return nullptr; }
    }
    auto sampler=llama_sampler_chain_init(llama_sampler_chain_default_params());
    llama_sampler_chain_add(sampler,llama_sampler_init_top_k(40));
    llama_sampler_chain_add(sampler,llama_sampler_init_top_p(0.9f,1));
    llama_sampler_chain_add(sampler,llama_sampler_init_temp(0.6f));
    llama_sampler_chain_add(sampler,llama_sampler_init_dist(42));
    std::string out;
    for(int i=0;i<320 && !cancelled;i++) {
        llama_token token=llama_sampler_sample(sampler,ctx,-1);
        if(llama_vocab_is_eog(vocab,token)) break;
        char piece[512]; int count=llama_token_to_piece(vocab,token,piece,sizeof(piece),0,true);
        if(count>0) out.append(piece,count);
        if(llama_decode(ctx,llama_batch_get_one(&token,1))) break;
    }
    llama_sampler_free(sampler);
    if(cancelled) out.clear();
    jbyteArray result=e->NewByteArray(out.size()); e->SetByteArrayRegion(result,0,out.size(),reinterpret_cast<const jbyte*>(out.data())); return result;
}
