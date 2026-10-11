# Local Gemma Assistant

A standalone Android chat app in the UKMLA_app repository. It has no UKMLA card database, retrieval layer, question bank, or Luna integration.

## Model and runtime

- **Gemma 4 E4B IT** using the same LiteRT-LM package format as Google AI Edge Gallery.
- Model file: `gemma-4-E4B-it.litertlm` (~3.66 GB).
- Official LiteRT-LM Android 0.18.0 runtime.
- GPU backend first; automatic CPU fallback if GPU initialization fails.
- 4,096-token context to keep phone memory use controlled.
- No INTERNET permission and no cloud inference fallback.
- Background foreground-service inference and offline Android TTS.

Android application sandboxing means this app cannot directly open Edge Gallery's private downloaded copy. Use the Model button to download/select the same public `.litertlm` package once for this app.

## Conversation design

LiteRT-LM handles the Gemma 4 chat template directly. The app supplies up to the last three completed exchanges as initial messages.

Medical mode adds one short system instruction:

> You are a concise medical study assistant. Give practical, cautious answers; use UK terminology when known, flag urgent red flags when relevant, and say when uncertain.

Thinking mode uses LiteRT-LM's native `ThinkingConfig`. Thought-channel content is handled separately by the runtime; the app stores/displays the normal response only.

Sampling:

- temperature 1.0
- top-p 0.95
- top-k 64
- Fast: up to 512 output tokens
- Think: up to 1,024 output tokens

## Build

The Android app depends on:

    implementation("com.google.ai.edge.litertlm:litertlm-android:0.18.0")

Build:

    base64 -d android-reader/preview.keystore.b64 > android-assistant/preview.keystore
    cd android-assistant
    gradle :app:testReleaseUnitTest :app:assembleRelease

Model: https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm
LiteRT-LM: https://github.com/google-ai-edge/LiteRT-LM
