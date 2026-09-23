**Local Qwen Assistant 0.1.0**

A new standalone Android app for the same Qwen3 4B Q4_K_M model used in the offline-reader work. It is separate from UKMLA and contains no UKMLA content or retrieval logic.

Core behaviour:

- General-purpose local chat interface.
- CPU-only llama.cpp inference.
- Fast mode uses Qwen's native /no_think switch.
- Think mode uses Qwen's native /think switch and shows only the final answer.
- Optional Medical mode adds a single short clinical instruction; General mode adds no system prompt.
- Only three previous completed exchanges are carried into the next prompt.
- Completed conversation turns are stored locally on the device.
- Background foreground-service inference: switch apps while Qwen works, then return from the Answer ready notification.
- Stop action in the app and notification.
- Offline Android TTS for completed answers.
- No INTERNET permission and no online inference fallback.

Phone-oriented limits:

- 4,096 context.
- Fast: 160 generated tokens, temperature 0.7 / top-p 0.8 / top-k 20.
- Think: 384 generated tokens, temperature 0.6 / top-p 0.95 / top-k 20.
- Adaptive 4-8 CPU threads.
- Model stays loaded in-process between requests where Android keeps the service process alive.

Model setup:

This is a separate Android application ID and sandbox, so import the Qwen3 4B Q4_K_M GGUF once inside this app. If the original downloaded GGUF is still on the phone, select that file. Android will copy it into the assistant's private storage.

Medical mode is intended as a concise study/support profile, not a substitute for current clinical guidance or professional judgement.
