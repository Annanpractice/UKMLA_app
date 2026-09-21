# UKMLA GPU Tester 0.1.1

Separate Android ARM64 diagnostic APK. It does not replace or change the UKMLA reader, Luna or card/question pipeline. Development signed; no internet permission.

This build follows the Samsung SM-S928B results from 0.1.0: CPU completed normally; Vulkan with 4 offloaded layers reached prompt processing but the Adreno driver rejected the quantised FP16-accumulation compute pipeline; optimized OpenCL with 4 layers completed prompt prefill and sampled the first token, then the worker disappeared during the first generation decode.

1. Download and install `UKMLA-GPU-Tester-v0.1.1-arm64.apk`.
2. Close the reader to free model memory. Open **UKMLA GPU Tester**.
3. Select the existing local Qwen3 GGUF. It is opened read-only with no model copy.
4. For the next diagnostic sequence, choose **1 GPU layer** and run **OPENCL (Adreno)**. Copy the report.
5. Still at **1 GPU layer**, run **OPENCL (generic)**. Copy the report.
6. Only if one of those completes cleanly should 2 layers be tried. Do not jump to 8/16/all while the 1-layer result is unresolved.

The optimized OpenCL backend explicitly enables `GGML_OPENCL_USE_ADRENO_KERNELS`. The generic OpenCL backend explicitly disables both `GGML_OPENCL_USE_ADRENO_KERNELS` and `GGML_OPENCL_USE_ADRENO_BIN_KERNELS`. This makes the comparison meaningful while leaving the model, prompt, context, batch size and sampling identical.

Generation diagnostics are persisted before and after every token sample and every `llama_decode()` call. If the worker is killed inside a driver/runtime call, the last durable `GEN step ...` line should identify the boundary where execution stopped.

Every test uses the same fixed prompt, 4 CPU threads, context 2048, batch/ubatch 64, flash attention disabled, greedy sampling and at most 32 output tokens. GPU tests never silently retry on CPU. Partial GPU offload still uses CPU for remaining layers and some operations; native logs show actual placement.

The report includes device/build information, available memory, backend/device logs, model/context/prompt/generation stages, timings, output and Android process-exit information where available. Vulkan additionally records driver/version limits. Ordinary native worker crashes are isolated from the tester UI; a system-wide driver failure can still affect the whole device. This is not unrestricted system logcat.

OpenCL uses the phone's optional `libOpenCL.so`, declared in the manifest. The link-time ICD loader is not packaged. Vulkan remains an upstream-default baseline in this build; the purpose of 0.1.1 is to isolate the OpenCL generation failure before introducing additional Vulkan workarounds.

Compilation, Android lint, native library packaging, APK signature, absence of internet permission and worker-process isolation are checked in CI. Physical Adreno correctness and performance still require the phone test.

Pinned llama.cpp: `ec91ab5add06555970f98d9c5361d884f3f530f8`. CPU, optimized OpenCL, generic OpenCL and Vulkan are separate native libraries, and only the selected backend is loaded into a fresh `:probe` process.
