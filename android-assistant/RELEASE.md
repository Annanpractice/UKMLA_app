**Local Qwen 3.5 9B Test 0.1.0**

A side-by-side Android test build for **Qwen3.5-9B Q4_K_M**. It uses a different application ID from the working Local Qwen Assistant, so installing this APK does not overwrite the existing Qwen3 app or its model/chat data.

Model target:

- Qwen/Qwen3.5-9B, Apache-2.0.
- Text-only LM Studio Community Q4_K_M GGUF, approximately 5.63 GB.
- Model download: lmstudio-community/Qwen3.5-9B-GGUF/Qwen3.5-9B-Q4_K_M.gguf.
- The model is copied into this test app's private storage on import; keep roughly 7 GB free while importing.

Runtime:

- Current pinned llama.cpp commit with Qwen3.5 support and later ARM fixes: `836d57176dc699a726c55418e4f96b8ca628e1bf`.
- CPU only, adaptive 4-8 threads.
- 4,096 context.
- 256 batch / 256 ubatch.
- Memory-mapped model loading.
- Flash attention explicitly disabled for this Android test.
- Background foreground-service generation, Stop action and Answer ready notification.
- No INTERNET permission and no cloud fallback.

Prompting:

Qwen3.5 does **not** officially support Qwen3's `/think` and `/no_think` soft switches. This build instead follows the Qwen3.5 chat template's hard thinking switch:

- Fast: generation begins after an empty `<think>...</think>` block, disabling thinking.
- Think: generation begins inside `<think>` and only the final answer after `</think>` is shown/stored.
- Only the last three completed exchanges are carried forward, and prior thinking text is never placed into history.
- General mode has no system prompt.
- Medical mode adds one short clinical-study instruction.

Phone-oriented output budgets:

- Fast: up to 512 generated tokens.
- Think: up to 1,024 generated tokens.
- The budget shrinks automatically when required to remain inside the 4,096-token context window.

Sampling uses the Qwen3.5 team's recommended top-k/top-p/temperature values for general tasks: Fast 20/0.8/0.7; Think 20/0.95/1.0. Presence penalty is not forced in this minimal JNI test build.

The app keeps the Markdown bold renderer and local Android TTS from the existing assistant; `**` markers are displayed as bold and removed before speech.

This is an experiment. The build can verify compilation and Android packaging, but whether a 5.63 GB Qwen3.5-9B quant loads, remains stable and is acceptably fast on the Galaxy S24 Ultra must be established on the device.
