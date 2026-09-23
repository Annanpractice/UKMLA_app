# Local Qwen Assistant

A separate Android app in the UKMLA_app repository. It is not a UKMLA reader and has no card database, retrieval layer, question bank, or Luna integration.

The goal is to expose the existing Qwen3 4B Q4_K_M model as directly and efficiently as possible on a phone.

## Runtime design

- Qwen3 4B Q4_K_M GGUF (~2.5 GB), imported locally.
- CPU-only llama.cpp, adaptive 4-8 threads, 4,096 context, 512 batch.
- No INTERNET permission and no cloud fallback.
- Generation runs in an Android foreground service, so it can continue while another app is in front.
- Android offline TextToSpeech can read completed answers.

## Prompt design

General mode: no system prompt. The app sends bounded chat history plus the current user message.

Medical mode adds one short system message:

> You are a concise medical study assistant. Give practical, cautious answers; use UK terminology when known, flag urgent red flags when relevant, and say when uncertain.

Medical mode is a convenience profile, not an authoritative guideline source. Verify patient-specific clinical decisions against current local guidance.

Only the last three completed exchanges are supplied to Qwen, and only their final answers are retained. This reduces prompt-prefill cost and follows Qwen's recommendation not to put prior thinking content back into conversation history.

## Thinking

Qwen3 officially supports per-turn soft switches:

- Fast: /no_think
- Think: /think

The app does not invent a chain-of-thought prompt. In Think mode it allows Qwen's native <think>...</think> phase, discards that scratch reasoning from chat history, and displays only the final answer.

Sampling follows the Qwen3 model card:

- Fast: temperature 0.7, top-p 0.8, top-k 20.
- Think: temperature 0.6, top-p 0.95, top-k 20.

Phone-oriented output budgets are deliberately smaller than server-oriented recommendations:

- Fast: 160 generated tokens.
- Think: 384 generated tokens.

Think mode may therefore stop before a final answer on unusually complex tasks; the app reports that explicitly.

## Build

Uses the same pinned llama.cpp commit and public preview signing key as the offline-reader experiments, but a separate Android application ID: uk.co.qwen.assistant.

Build steps:

    mkdir -p android-assistant/vendor/llama.cpp
    curl --fail -L https://github.com/ggml-org/llama.cpp/archive/ec91ab5add06555970f98d9c5361d884f3f530f8.tar.gz | tar xz --strip-components=1 -C android-assistant/vendor/llama.cpp
    base64 -d android-reader/preview.keystore.b64 > android-assistant/preview.keystore
    cd android-assistant
    gradle :app:testReleaseUnitTest :app:assembleRelease

Qwen3 model card: https://huggingface.co/Qwen/Qwen3-4B-GGUF
llama.cpp: https://github.com/ggml-org/llama.cpp
