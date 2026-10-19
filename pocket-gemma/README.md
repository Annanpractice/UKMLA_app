# Clara v1.7 — notification briefing and voice selection

Standalone Android chat app using the official LiteRT-LM 0.17.1 runtime and the Gemma 4 E4B LiteRT-LM model.

## Step 1: notification briefing

- The **Briefing** screen starts in mock mode with two clearly fictional notification examples. This lets the tool flow be exercised without granting notification access.
- Live mode uses Android's `NotificationListenerService`. Android requires the user to enable this special access in system settings. The app displays active notification apps and lets the user select which apps can be included in a briefing.
- The model can request one read-only `list_notifications` tool with a bounded `limit` of 1–20. Clara manually validates and executes that request; automatic tool execution is disabled.
- Live results are restricted to currently active notifications Android exposes. They are not a complete notification or message history. Notification text is treated as untrusted quoted content.
- The response card shows the source app, time, title and visible text used for its answer. Raw notification text and source cards are not written to saved chat history or app logs. The generated summary itself is retained as a normal local chat response.
- No notification reply, call, microphone or other notification action is part of this step.

The remaining phone test is to run a structured synthetic prompt set (the design calls for 50 prompts) in mock mode, then verify access, app filtering, and source grounding with live notifications on the target phone. This workspace cannot validate actual Gemma tool-call reliability or Samsung notification behavior without the phone.

## Existing chat features

- Download manager flow for the pinned 3.66 GB Gemma 4 E4B model. The model is stored in app storage and can be used offline after download.
- Before loading, exact file size and SHA-256 are checked against the pinned model; incomplete or damaged files are removed.
- Streaming response fragments are accumulated so the full assistant answer remains visible.
- LiteRT-LM inference controls: GPU/CPU backend, context tokens (2,000–32,000), Top-K, Top-P, temperature, thinking, speculative decoding/MTP, and editable system prompt.
- Multi-turn chats and settings are stored locally. Thinking output is displayed separately and excluded from ordinary restored conversation history.
- Attach images and audio files through Android's picker. Attachments are copied to app-private storage and restored with saved conversations.
- Android TextToSpeech Read aloud and Stop controls, plus a Voice dialog for selecting among installed offline voices. Clara remembers the selected voice and falls back to a system-language offline voice if it is unavailable.
- Sherpa-ONNX can be used as the speech provider after its Android TTS engine and a compatible voice model are installed and selected in Android's text-to-speech settings. Restart Clara after changing the system TTS engine so the available voices refresh. Speech remains on-device when an offline Sherpa voice is selected.

## Build

Open the project in Android Studio, allow Gradle sync, and build the `app` debug variant. The debug APK is written to `app/build/outputs/apk/debug/app-debug.apk`.

Requirements: Android SDK platform 36, Java 17, Kotlin 2.4.0, Android Gradle Plugin 8.13.0, and LiteRT-LM 0.17.1.

## Install and test

The app uses application ID `app.clara.assistant`. A v1.7 APK must be signed with the same key as the installed version to install as an in-place update. If Android reports **App not installed**, check the signing certificate or remove the old app first (removing it deletes its private model and chat data).

On first run, download the model, wait for completion, then tap **Load model**. GPU is attempted by default; switch to CPU in Settings if initialization fails. GPU inference, multimodal decoding, notification tool calling and offline TTS voice availability require testing on the target phone.

## Prototype limits

- This is a debug prototype, not a Play Store release.
- Notification access is broad at the Android permission layer. The app-level allowlist filters which active notifications are sent to the local model.
- Generation runs in the app process and is not guaranteed to continue if Android kills the app in the background.
- TTS pause/resume is not wired yet; Read aloud and Stop are available.
- Chats and settings use Android app-private storage but are not encrypted separately.
