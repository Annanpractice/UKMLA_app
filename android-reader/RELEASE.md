Native Android offline reading companion. The existing UKMLA app, Luna, question generation and quality checkpoints are unchanged.

**v0.1.3 UI + speech:** the native reader now borrows the established UKMLA web visual language: navy gradient background, dark translucent panels, pale text, rounded controls and the gold accent. This remains a native Android UI rather than a WebView.

Generated local-LLM answers now include **Read answer** and **Stop** controls. Speech is provided by Android's installed `TextToSpeech` engine, but the reader only selects voices Android marks as not requiring a network connection. If no offline voice is installed, speech remains unavailable. The reader does not add INTERNET permission.

Stable inference remains CPU-only after the v0.1.1 Vulkan crash on the S24 Ultra. The shorter contextual prompt, adaptive 4–8 CPU threads, 512-token batching and 128-token response cap remain. Vulkan wiring stays behind an explicit experimental build switch.

**Install/update:** download `UKMLA-Offline-Reader-v0.1.3-arm64.apk` and install it over the existing preview. It uses the same application ID and preview signing key, so Android should update the app in place and preserve the imported GGUF. Do not clear app storage if you want to keep the imported model. Android 9+ ARM64.

**Enable AI once:** open Model & info → Download recommended GGUF (Qwen3 4B Q4_K_M, approximately 2.5 GB) → Import GGUF from device. Keep about 5 GB free during import. The APK has no INTERNET permission; the initial model download opens in your browser.

**Use:** search a short term, or open a card and press/hold to select text → Explain / Summarise. Contextual lookups are intentionally brief. After a local answer appears, choose **Read answer** to have the phone speak the generated explanation. Follow-ups remain in the current reading session and are not saved.

Includes 983 existing UKMLA cards and 1,258 selected public-domain NCI Dictionary of Cancer Terms entries. NCI wording is US-oriented and not a comprehensive UK medical dictionary. AI explanations remain separate from validated revision content.

The build checks compilation, prompt handling, database integrity, APK signing, absence of internet permission and emulator smoke tests. On-device latency, TTS behaviour and medical answer quality still require testing.
