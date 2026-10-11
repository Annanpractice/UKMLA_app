**Local Gemma Assistant 0.2.0**

The standalone local-chat experiment now uses **Gemma 4 E4B IT Q4_K_M** instead of Qwen3 4B.

Changes:

- Gemma 4 E4B IT Q4_K_M GGUF (~5.34 GB).
- Native Gemma 4 turn formatting.
- Think mode uses Gemma 4's official `<|think|>` control token.
- Internal thought-channel output is discarded; only the final answer is displayed/stored.
- Gemma-recommended sampling: temperature 1.0, top-p 0.95, top-k 64.
- Fast output limit 512 tokens; Think output limit 1,024 tokens.
- 4,096-token phone-oriented context retained.
- Updated llama.cpp pin with Gemma 4 support.
- Existing background inference, Stop control, local history and offline TTS retained.
- No INTERNET permission and no cloud fallback.

**Important:** the copy of Gemma downloaded inside Google AI Edge Gallery cannot simply be opened by this app. Edge Gallery uses a different runtime/package and its model lives in another Android app sandbox. Use the Model button to download/import the llama.cpp-compatible Gemma 4 E4B IT Q4_K_M GGUF.

The Android application ID is intentionally unchanged so this preview updates the existing Local Qwen test app in place.
