Native Android offline reading companion. The existing UKMLA app, Luna, question generation and quality checkpoints are unchanged.

**v0.1.2 stability change:** stable inference is CPU-only. Vulkan GPU offload is disabled after an on-device crash on the test S24 Ultra. The shorter contextual prompt, adaptive 4–8 CPU threads, 512-token batching and 128-token response cap remain. Vulkan wiring is retained only behind an explicit experimental build switch and is not present in the normal release path.

**Install/update:** download `UKMLA-Offline-Reader-v0.1.2-arm64.apk` and install it over the existing preview. It uses the same application ID and preview signing key, so Android should update the app in place and preserve the imported GGUF. Do not clear app storage if you want to keep the imported model. Android 9+ ARM64.

**Enable AI once:** open Model & info → Download recommended GGUF (Qwen3 4B Q4_K_M, approximately 2.5 GB) → Import GGUF from device. Keep about 5 GB free for import. The APK has no INTERNET permission; the initial model download opens in your browser.

**Use:** Search a short term, or open a card and press/hold to select text → Explain / Summarise. Contextual lookups are intentionally brief. Follow-ups remain in the current reading session and are not saved.

Includes 983 existing UKMLA cards and 1,258 selected public-domain NCI Dictionary of Cancer Terms entries. NCI wording is US-oriented and not a comprehensive UK medical dictionary. AI explanations remain separate from validated revision content.

The build checks compilation, prompt handling, database integrity, APK signing, absence of internet permission and emulator smoke tests. On-device latency, memory use and medical answer quality still require testing.
