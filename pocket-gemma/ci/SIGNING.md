# Clara experimental Android signing (automatic GitHub builds)

**No GitHub repository secret, manual password, or signing setup is required.**

The GitHub Actions workflow at `.github/workflows/pocketgemma-android.yml` restores a **fixed development-only Android debug keystore** from `pocket-gemma/ci/study-debug.keystore.b64` before each build. Android's normal debug signing configuration then signs both Clara and Clara Study with that same certificate. The workflow verifies APK signatures and publishes downloadable `.apk` files under GitHub Releases when successful.

This was chosen to make repeated experimental builds consistent with zero setup. Because this repository is **public**, the development signing key is also public. **It is not secure for production builds, sensitive workloads, or distributing the app to other people.** A proper production release must instead use a protected signing key.

## Building and downloading

1. Push changes to `codex/pocketgemma-apk`. GitHub Actions builds both APK variants automatically.
2. Open https://github.com/Annanpractice/UKMLA_app/releases and select the newest Clara Study development release.
3. Download the `Clara-...-Study.apk` file directly to the phone.

The version code is derived from the GitHub Actions run number, ensuring later successful runs have larger codes. Future APKs built from the same persisted development keystore can update one another in place.

## One-time Android certificate mismatch

Apps installed from earlier GitHub builds were signed using randomly generated debug certificates. Android does not allow them to be updated with a differently signed APK. **Do not uninstall an existing Clara or Clara Study containing your downloaded model, chats or decks without first protecting that data.** If an older Clara Study has no data to preserve, it may be uninstalled once, and the new consistently signed Study APK can be installed.

This process does **not** recover the signing certificates of older APKs. It only provides continuity from the newly established experimental signing identity onwards.
