# UKMLA App

Standalone UKMLA revision HTML app repository.

## Current deployment setup

This repo now includes:

- `.github/workflows/pages.yml` — GitHub Pages deployment workflow.
- `remote-sync.js` — optional Firebase Realtime Database sync helper.
- `FIREBASE_SETUP.md` — setup notes and sample rules.

## To use with the full app

1. Ensure the full UKMLA app is committed as `index.html`.
2. Add this just before `</body>` in `index.html`:

```html
<script src="remote-sync.js"></script>
```

3. Enable GitHub Pages from repository Settings. Use **GitHub Actions** as the source if prompted.
4. Create a Firebase Realtime Database project and paste the web config into the app’s **Remote sync / shared notes** panel.
5. Use a long random Pad ID for anyone-with-the-link editing.

## Security note

Do not commit Firebase private service-account keys. Browser apps should only use the public Firebase web config plus locked-down database rules. A long Pad ID is convenient, but not the same as authenticated access.
