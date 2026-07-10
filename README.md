# UKMLA App

Standalone UKMLA revision HTML app repository.

Recommended deployment path:

1. Upload the main HTML app as `index.html`.
2. Enable GitHub Pages from `main` / root.
3. Add Firebase Realtime Database only when remote shared notes/progress are needed.

Security note: do not commit Firebase private service-account keys. Browser apps should only use the public Firebase web config plus locked-down database rules.
