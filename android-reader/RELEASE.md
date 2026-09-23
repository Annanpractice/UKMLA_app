Native Android offline reading companion. The existing UKMLA app, Luna, question generation and quality checkpoints are unchanged.

**v0.1.6 adds background CPU inference.** Qwen3 4B still runs through the same CPU-only llama.cpp path as 0.1.5, but generation now runs inside a user-started Android foreground service. Once you press Explain/Summarise, you can switch to another app and the model continues running. The ongoing notification includes a Stop action; when generation finishes, UKMLA posts an **Answer ready** notification that opens the completed response.

Android 14+ requires long-running foreground work to declare a service type. This preview uses the platform’s `specialUse` foreground-service type specifically for user-started on-device LLM inference. Android 13+ also asks for notification permission so the work/result notifications can appear in the notification drawer. If notifications are denied, Android still permits the foreground service, but the ready alert may not appear in the drawer.

**Inference remains CPU only:** adaptive 4–8 CPU threads, 4,096 context, 512-token batch, 128-token response cap. OpenCL and Vulkan remain disabled. The model can stay loaded in-process between answers to avoid unnecessary reloads.

The UKMLA-style interface and local Android TextToSpeech remain unchanged.

**Install/update:** download `UKMLA-Offline-Reader-v0.1.6-arm64.apk` and install it over 0.1.5. The application ID and preview signing key are unchanged, so Android should update it in place and preserve the imported GGUF. Do not uninstall or clear app storage if you want to keep the model.

**Background-use test:** start a real explanation, grant notification permission when asked, immediately switch to another app, and leave UKMLA in the background. The “UKMLA is generating locally” notification should remain present. When generation completes, it should change to an “Answer ready” notification; tapping it should reopen the finished response.

Includes 983 existing UKMLA cards and 1,258 selected public-domain NCI Dictionary of Cancer Terms entries. AI explanations remain separate from validated revision content. The APK still has no INTERNET permission and no online inference fallback.

The build checks CPU JNI compilation, database integrity, APK signing, absence of INTERNET permission and Android emulator smoke tests. Actual long-duration S24 Ultra background inference still requires on-device testing.
