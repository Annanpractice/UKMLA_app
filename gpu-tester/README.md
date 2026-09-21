# UKMLA GPU Tester 0.1.0

Separate Android ARM64 diagnostic APK. It does not replace or change the UKMLA reader, Luna or card/question pipeline. Development signed; no internet permission.

1. Download and install `UKMLA-GPU-Tester-v0.1.0-arm64.apk` from this release.
2. Close the reader to free its model memory. Open **UKMLA GPU Tester**.
3. Tap **Select existing GGUF** and choose the downloaded Qwen3 GGUF in **Downloads**. It is opened read-only, with no duplicate model copy. A model only inside the reader's private storage cannot be opened by another app; select the original download instead. Cloud-provider streams may not be seekable.
4. Run **CPU** first, then **OpenCL**, then **Vulkan**, separately. Start at **4 GPU layers**. Keep the screen open. Each worker has a five-minute limit and a Stop button.
5. Tap **Copy diagnostic report** and paste it into chat. Copy each test before starting another. **Save full report** writes a text file through Android's picker.

Every test uses the same harmless fixed prompt, 4 CPU threads, context 2048, batch/ubatch 64, flash attention disabled, greedy sampling and at most 32 output tokens. Choose 8/16/all GPU layers only after a successful smaller test. Partial GPU offload still uses CPU for remaining layers and some operations; native logs show actual placement. No automatic CPU retry masks GPU failure.

The report includes device/build information, available memory, backend/device logs, model/context/prompt/generation stages, timings, output and Android process-exit information where available. Vulkan additionally records the numeric driver version and limits. Logs persist across tester restarts. Ordinary native worker crashes are separate from the UI; a system-wide driver failure can still affect the whole device. Normal termination/Stop can produce a signal exit; the report records that distinction. This is not unrestricted system logcat and does not guarantee a full native stack trace.

OpenCL uses the phone's optional `libOpenCL.so`, declared in the manifest. Some firmware does not expose it to APKs; a library-unavailable report is a useful result, not proof that the GPU itself is unsupported. Vulkan uses upstream defaults without adopting the unqualified Adreno draft workaround.

Compilation, Android lint, library packaging, APK signature and absence of internet permission are checked in CI. Physical Adreno correctness, performance and crash behaviour cannot be qualified by those checks: this APK exists to collect that evidence on the phone. The generated sentence is only a smoke test, not numerical backend validation.

Pinned llama.cpp: `ec91ab5add06555970f98d9c5361d884f3f530f8`. See `tools/build-native.sh` for pinned Khronos dependencies. CPU, OpenCL and Vulkan are separate statically linked native libraries, and only the selected one is loaded into a fresh `:probe` process. The original public preview signing key is used for this separate development application ID; it is not a production signing secret. Third-party notices are bundled in APK assets.
