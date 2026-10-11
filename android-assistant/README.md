# Local Gemma Assistant

A separate Android app in the UKMLA_app repository. It has no card database, retrieval layer, question bank, or Luna integration.

The goal is to run Gemma 4 E4B IT locally on the phone with a deliberately small interface.

## Runtime design

- Gemma 4 E4B IT Q4_K_M GGUF (~5.34 GB), imported locally.
- CPU-only llama.cpp, adaptive 4-8 threads, 4,096 context, 512 batch.
- No INTERNET permission and no cloud fallback.
- Generation runs in an Android foreground service, so it can continue while another app is in front.
- Android offline TextToSpeech can read completed answers.

The Gemma model downloaded inside Google AI Edge Gallery is packaged for Google's LiteRT/MediaPipe runtime and is held in Edge Gallery's Android sandbox. This app therefore imports the llama.cpp-compatible GGUF build separately.

## Prompt design

Gemma 4 uses its native turn format. General mode adds no clinical instruction. Medical mode adds one short system instruction:

> You are a concise medical study assistant. Give practical, cautious answers; use UK terminology when known, flag urgent red flags when relevant, and say when uncertain.

Only the last three completed exchanges are supplied to the model.

## Thinking

Gemma 4 thinking is enabled with the official `<|think|>` system control token. The app strips the model's thought channel and stores/displays only the final answer.

Sampling follows Google's Gemma 4 recommendation:

- temperature 1.0
- top-p 0.95
- top-k 64

Phone-oriented output limits:

- Fast: 512 generated tokens.
- Think: 1,024 generated tokens.
- Output is also capped by the remaining 4,096-token context.

## Build

The Android build pins llama.cpp commit `5c8854fd88319125125dc4b836c98b1b215b0f23`.

    mkdir -p android-assistant/vendor/llama.cpp
    curl --fail -L https://github.com/ggml-org/llama.cpp/archive/5c8854fd88319125125dc4b836c98b1b215b0f23.tar.gz | tar xz --strip-components=1 -C android-assistant/vendor/llama.cpp
    base64 -d android-reader/preview.keystore.b64 > android-assistant/preview.keystore
    cd android-assistant
    gradle :app:testReleaseUnitTest :app:assembleRelease

Gemma 4 model: https://huggingface.co/google/gemma-4-E4B-it
GGUF: https://huggingface.co/ggml-org/gemma-4-E4B-it-GGUF
llama.cpp: https://github.com/ggml-org/llama.cpp
