# Clara Android signing — one-time GitHub setup

Clara v2.0.2 uses a stable development signing certificate so later debug APKs can install as upgrades. Both Clara and Clara Study use the same certificate but retain distinct Android package IDs.

The repository contains only `clara-dev.p12.enc.b64` (an encrypted PKCS12 keystore). The plaintext key is not published. Unlocking requires the private GitHub Actions repository secret `CLARA_SIGNING_PASSWORD`.

## Activate

1. Open the repository Settings > Secrets and variables > Actions > New repository secret.
2. Name: `CLARA_SIGNING_PASSWORD`.
3. Paste the signing password supplied privately with the setup.
4. Open Actions > Clara Android APK > Run workflow. Select `codex/pocketgemma-apk` and run it.
5. Once successful, open Releases and download the Clara Study APK directly. The workflow also uploads downloadable artifacts.

The workflow fails if the secret is unavailable or the certificate changes unexpectedly. Do not work around that check with a fresh Android debug keystore.

Pinned signer SHA-256:
`56:6B:49:30:C1:F9:3D:FE:E7:3E:2B:48:29:72:04:CC:C4:6D:97:83:E8:AA:40:30:C5:FF:CB:04:E3:7E:30:4A`

Keep the password in a secure backup. Never add it to source files, issues, PRs or Actions logs. Every future version must retain the signer and increase Android `versionCode`.

## Important one-time migration

Apps already installed from older GitHub Actions builds have unrelated signing certificates. They cannot be updated with the newly fixed identity; Android refuses mismatched update signatures. Do not uninstall either app if it contains a Gemma download, saved conversations or flashcards you need. Once you have installed the first stable-signed build, future versions signed by this certificate can be upgraded in place.

The Github Release step only runs after manually selecting **Run workflow**, providing a direct .apk link that does not depend on ChatGPT Library.
