Native Android offline reading companion. The existing UKMLA app, Luna, question generation and quality checkpoints are unchanged.

**v0.1.4 GPU integration:** the reader now tries the generic llama.cpp OpenCL backend first on ARM64, using the configuration that completed cleanly on the Galaxy S24 Ultra: **2 GPU layers, Adreno-specific OpenCL kernels disabled, 4,096 context, 64-token batch/ubatch and flash attention off**. OpenCL runs in a separate `:inference` process. If the OpenCL library/device/model/context cannot initialise, or the GPU worker exits, the same request is retried through the existing CPU backend. The APK does not package `libOpenCL.so`; Android/Qualcomm supplies it when available.

The unstable paths found during testing remain disabled: Vulkan failed during quantised pipeline creation, and the Adreno-optimised OpenCL kernels became unstable above one offloaded layer. Generic OpenCL completed the 1-, 2-, 4- and 8-layer diagnostic runs; 2 layers gave the best observed short-test time and is therefore the initial reader default.

**v0.1.4 UKMLA skin:** the old gold reader skin has been replaced with the actual v2 UKMLA visual language from the web app: near-black/navy background, cyan/blue accent, serif reading text, translucent navy cards, the UK brand tile and a compact bottom navigation bar. The home screen now mirrors the card-atlas hierarchy rather than using a generic medical-app layout.

Generated local-LLM answers retain **Read answer** and **Stop** controls using Android's installed offline-capable TextToSpeech voice. The reader still has no INTERNET permission.

**Install/update:** download `UKMLA-Offline-Reader-v0.1.4-arm64.apk` and install it over the existing preview. It uses the same application ID and preview signing key, so Android should update the app in place and preserve the imported GGUF. Do not clear app storage if you want to keep the imported model. Android 9+ ARM64.

**Enable AI once:** open Model → Download recommended GGUF (Qwen3 4B Q4_K_M, approximately 2.5 GB) → Import GGUF from device. Keep about 5 GB free during import. The APK has no INTERNET permission; the initial model download opens in your browser.

**Use:** search a short term, or open a card and press/hold to select text → Explain / Summarise. Follow-ups remain in the current reading session and are not saved.

Includes 983 existing UKMLA cards and 1,258 selected public-domain NCI Dictionary of Cancer Terms entries. NCI wording is US-oriented and not a comprehensive UK medical dictionary. AI explanations remain separate from validated revision content.

The build checks Kotlin/native compilation, the generic OpenCL library dependency, database integrity, APK signing, absence of internet permission and emulator smoke tests. Actual S24 Ultra OpenCL latency, crash fallback and medical answer quality still require this APK to be tested on the phone.
