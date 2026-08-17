# UKMLA App

Standalone UKMLA revision HTML app repository.

## Card importing

The card importer is intentionally data-first so adding a card does not require editing analytics or the legacy HTML deck.

- **AI / Claude / ChatGPT prompt:** [`CARD_IMPORT_PROMPT.md`](CARD_IMPORT_PROMPT.md)
- **Permanent imported-card source:** `data_sources/manual-cards.json`
- **Validator / append tool:** `python scripts/import_cards.py <payload.json>`
- **GitHub input portal:** open a new issue and choose **Import UKMLA cards**.
- **In-app importer:** Cards → **+ Add / import card** supports a manual form, pasted JSON, and `.json` upload.

All routes use schema `ukmla-card-import-v1`. Imported cards receive an immutable `manual-*` ID and are merged into the same condition/topic model used by coverage and learning analytics.

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
