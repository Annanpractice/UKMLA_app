Native Android offline reading companion. The existing UKMLA app, Luna, question generation and quality checkpoints are unchanged.

**v0.1.5 restores the original CPU inference path.** OpenCL and Vulkan are not used by the reader. Model loading and generation run through the same CPU-only llama.cpp JNI path that worked before the GPU experiments.

The newer UKMLA-style interface remains: near-black/navy background, cyan/blue accent, serif reading text, translucent navy cards, the UK brand tile and compact bottom navigation. Local Android TextToSpeech also remains available.

**Install/update:** download `UKMLA-Offline-Reader-v0.1.5-arm64.apk` and install it over 0.1.4. The version code is higher and the signing key/application ID are unchanged, so Android should update it in place and preserve the imported GGUF. Do not uninstall or clear app storage if you want to keep the model.

**Inference:** CPU only, adaptive 4–8 CPU threads, 4,096 context, 512-token batch, 128-token response cap. No INTERNET permission and no online inference fallback.

Includes 983 existing UKMLA cards and 1,258 selected public-domain NCI Dictionary of Cancer Terms entries. AI explanations remain separate from validated revision content.

The build checks CPU JNI compilation, database integrity, APK signing, absence of INTERNET permission and Android emulator smoke tests.
