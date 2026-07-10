# Firebase Realtime Database setup for UKMLA App

This repo now includes `remote-sync.js`. It gives the HTML app a shared JSON/progress sync layer using Firebase Realtime Database.

## 1. Add the script to the HTML

In `index.html`, add this just before `</body>`:

```html
<script src="remote-sync.js"></script>
```

The script watches and syncs these browser storage keys:

- `ukmlaQuizProgressV1`
- `ukmlaAspectStatusV2`
- `ukmlaAiPromptCheckedV1`
- `ukmlaAiDecisionDataV1`

## 2. Create Firebase project

Create a Firebase project, add a Web App, then create a Realtime Database.

Copy the Firebase web config JSON. It looks like:

```js
{
  "apiKey": "...",
  "authDomain": "...firebaseapp.com",
  "databaseURL": "https://...firebasedatabase.app",
  "projectId": "...",
  "storageBucket": "...",
  "messagingSenderId": "...",
  "appId": "..."
}
```

This config is not a private service-account key, but database rules still matter.

## 3. Database rules for simple share-link editing

For a private-notes project where only people with the long random pad URL should edit, use a long unguessable Pad ID, for example:

`ukmla-4Jq9QYF2vHc8nLz6WmRpT3xA`

Basic temporary rules:

```json
{
  "rules": {
    "ukmlaPads": {
      "$pad": {
        ".read": "$pad.matches(/^[A-Za-z0-9_-]{24,90}$/)",
        ".write": "$pad.matches(/^[A-Za-z0-9_-]{24,90}$/)"
      }
    }
  }
}
```

These are convenience rules, not strong user authentication. Anyone who has the Firebase config and pad ID can read/write that pad.

## 4. Use it

Open the app, expand **Remote sync / shared notes**, paste the Firebase config JSON, choose the same Pad ID on each device, then press **Connect**.

Use **Push this device** to seed Firebase from the current browser. Other connected devices will receive the update and reload if auto-reload is enabled.

## 5. Keep JSON export/import

Keep using the app’s built-in JSON export/import as a manual backup.
