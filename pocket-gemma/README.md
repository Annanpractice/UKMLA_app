# Clara v2.0 — offline flashcards with Socratic tutoring

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
- Android TextToSpeech Read aloud and Stop controls. Voice settings explicitly enumerate installed TTS engine packages and offline English voices, permit testing, and lock an exact engine/voice pair across app restarts. If the requested engine is unavailable or Android silently switches providers, Clara reports an error rather than substituting Google.
- Sherpa-ONNX / Next-gen Kaldi can be chosen directly in Clara after installing an Android TTS service that exposes it. The voice list is populated only from that engine. Engines that do not enumerate voices can be tested using their default voice.

## Conversation history

- History provides a Delete action for each saved conversation and a Clear all action. Both require confirmation.
- Deleting the active conversation resets the visible chat and its Gemma conversation context; deleting an inactive conversation keeps the active chat.
- Clear all removes all stored conversations without deleting the separately downloaded Gemma model or app preferences.
- Clara deletes copied attachment files belonging exclusively to deleted conversations from its private attachments directory, leaving files still referenced by other chats untouched.
- Destructive chat actions are disabled while model loading or generating is in progress.
- The empty current chat is not saved automatically. This prevents a cleared history from immediately repopulating with a placeholder.

## Offline UKMLA flashcards and Socratic tutor

- **Cards** opens a native Compose study screen within Clara; this is the existing `app.clara.assistant` app, not a new app identity.
- Import a local `.json` or `.cards` export from the legacy [flashcard-app](https://github.com/Annanpractice/flashcard-app). Handles `{cards,understood,mastered}` and `seen`, or an array of cards. Existing topics, HTML formatting, data-URI images and progress categories are retained offline.
- Cards and mastery changes are persisted as `clara-flashcards.json` in Clara's private files, separate from the 3.66 GB Gemma model and chat history. A new import intentionally replaces the prior deck; a failed import does not.
- Each card can be revealed, read aloud by the selected offline TTS engine, marked understood/mastered/again, or discussed with Clara.
- **Discuss this card** creates a dedicated Gemma conversation containing the question and reference answer as tutoring context; the visible user message is a brief card label, while the actual prompt preserves context across chat reopening.
- The in-app tutoring prompt is editable and stored locally; the default asks one targeted Socratic question at a time and withholds the full answer until appropriate.
- Tutor replies can be spoken aloud with Clara's selected TTS engine. Replies are also visible in chat. A **Mic reply** button requests spoken dictation through an installed Android recognition app and automatically submits the transcript to local Gemma.
- Dictation requests an offline English recognizer, but Android notes that recognition providers may ignore that preference or use the network. Fully offline speech recognition requires a separately verified local recognizer.
- Imported JSON and rich card content are not automatically treated as instructions by the app. The card viewer blocks JavaScript and external file/network access.
- Imports support up to 100 MB and 20,000 cards. This is an initial integration requiring device testing, particularly very large image decks.
- This update retains the Android application ID, but in-place installation also requires the same signing certificate as the installed version. GitHub's current debug build has no persistent signing key, so an update may be rejected without recovering the original certificate.

## Build

Open the project in Android Studio, allow Gradle sync, and build the `app` debug variant. The debug APK is written to `app/build/outputs/apk/debug/app-debug.apk`.

Requirements: Android SDK platform 36, Java 17, Kotlin 2.4.0, Android Gradle Plugin 8.13.0, and LiteRT-LM 0.17.1.

## Install and test

Clara v2.0 retains the application ID (`app.clara.assistant`) and installs separately from Pocket Gemma, with its own model and chat storage.

On first run, download the model, wait for completion, then tap **Load model**. GPU is attempted by default; switch to CPU in Settings if initialization fails. GPU inference, multimodal decoding, notification tool calling and offline TTS voice availability require testing on the target phone.

## Prototype limits

- This is a debug prototype, not a Play Store release.
- Notification access is broad at the Android permission layer. The app-level allowlist filters which active notifications are sent to the local model.
- Generation runs in the app process and is not guaranteed to continue if Android kills the app in the background.
- TTS pause/resume is not wired yet; Read aloud and Stop are available.
- Chats and settings use Android app-private storage but are not encrypted separately.
