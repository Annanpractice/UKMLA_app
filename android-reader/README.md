# UKMLA Offline Reader

Standalone native Kotlin reading companion for the existing UKMLA card app. It does not change Luna, question generation, or the revision quality-checkpoint pipeline.

- 983 bundled card snapshots and 1,258 selected public-domain NCI glossary definitions in read-only SQLite/FTS4.
- One-to-three-word queries prioritise matching dictionary entries; longer queries rank card context by overlapping meaningful terms. Exact titles win. Selected source cards remain in context.
- Explain/Summarise in selectable card text and Android PROCESS_TEXT integration.
- Optional unverified model suggestion when retrieval finds nothing. No displayed private chain of thought.
- Bounded follow-up conversation in memory, discarded when starting another reading session.
- Pinned llama.cpp CPU JNI runtime; Qwen3 4B Q4_K_M recommended. Qwen ChatML/non-thinking prompt: arbitrary GGUF architectures/templates are not supported.
- Model imported through the Android document picker; no network permission or online inference fallback. The browser handles the initial download separately. Model is excluded from APK, Git and Actions storage.

## Build

Java 17, Gradle 8.11.1, Android SDK 35, NDK 27.2.12479018, CMake 3.22.1. The workflow installs dependencies and publishes a prerelease APK without accumulating Actions APK artifacts.

From repository root:

```sh
python scripts/build_v2_data.py
python scripts/normalise_v2_data.py
python android-reader/tools/build_database.py
mkdir -p android-reader/vendor/llama.cpp
curl --fail -L https://github.com/ggml-org/llama.cpp/archive/ec91ab5add06555970f98d9c5361d884f3f530f8.tar.gz | tar xz --strip-components=1 -C android-reader/vendor/llama.cpp
base64 -d android-reader/preview.keystore.b64 > android-reader/preview.keystore
cd android-reader
gradle :app:testReleaseUnitTest :app:assembleRelease
```

The checked-in preview key is intentionally a **public development key**, not a production secret. Replace signing before distributing production builds. Do not reuse this key for another app. The application disables Android backup; no user clinical data should be entered.

## Provenance and licences

Existing UKMLA card content stays governed by this repository's terms. This export is a dated snapshot, not a live clinical reference update. NCI definitions: National Cancer Institute Dictionary of Cancer Terms, retrieved 2026-09-21. Text-only subset, exact source URLs in `reference/nci-glossary.json`. Reuse policy: https://www.cancer.gov/policies/copyright-reuse (government text is copyright-free unless otherwise indicated; logos/media not included). US terminology, not an exhaustive UK medical dictionary.

llama.cpp MIT: https://github.com/ggml-org/llama.cpp/blob/ec91ab5add06555970f98d9c5361d884f3f530f8/LICENSE
Qwen3 model (separate download) Apache 2.0: https://huggingface.co/Qwen/Qwen3-4B-GGUF

## Acceptance checks on S24 Ultra

1. Import the recommended model, then enable airplane mode and restart the app.
2. Search “ataxia”, “heart failure”, and a phrase from a card. Check definitions/source titles and select text → Explain/Summarise.
3. Search an unmatched string; verify no sources are claimed and a possible meaning is only offered, labelled unverified.
4. Ask follow-ups, stop an answer, rotate, background/reopen, and repeat. Check memory/temperature and that the UI remains responsive.
5. Clinician-review representative explanations and ambiguous abbreviations. Reject hallucinated source citations, unsafe dosage claims, or confidently wrong meanings.

Device benchmarks and clinical validation are not established by the CI build. The reader uses the stable CPU inference path only; Vulkan and OpenCL acceleration are not enabled. Context is limited to four retrieved snippets with a short conversation and 128 generated tokens. AI output never writes into the source cards or question bank.
