**Local Gemma Assistant 0.2.0**

The standalone local chat app now uses **Gemma 4 E4B IT through Google's LiteRT-LM runtime**, matching the model package format used by Google AI Edge Gallery.

- `gemma-4-E4B-it.litertlm` (~3.66 GB).
- LiteRT-LM Android 0.18.0.
- GPU-first inference with automatic CPU fallback.
- Native Gemma 4 conversation templating.
- Native thinking configuration; thought-channel content is not added to stored chat history.
- Temperature 1.0, top-p 0.95, top-k 64.
- Fast output cap 512 tokens; Think cap 1,024 tokens.
- 4,096-token phone-oriented context.
- Background inference, Stop control, local chat history and offline TTS retained.
- No INTERNET permission and no cloud fallback.

Because Android isolates each application's private files, the app cannot directly reuse the bytes already stored inside Edge Gallery. The Model button opens the same public LiteRT-LM model download; import that `.litertlm` file once.

The application ID remains `uk.co.qwen.assistant` intentionally so this preview upgrades the earlier local-assistant test installation in place.
