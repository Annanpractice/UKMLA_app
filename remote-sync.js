/* UKMLA Firebase remote sync layer.
   Include this file near the end of index.html:
   <script src="remote-sync.js"></script>

   It syncs these localStorage keys:
   - ukmlaQuizProgressV1
   - ukmlaAspectStatusV2
   - ukmlaAiPromptCheckedV1
   - ukmlaAiDecisionDataV1
*/
(function () {
  'use strict';

  const WATCHED_KEYS = [
    'ukmlaQuizProgressV1',
    'ukmlaAspectStatusV2',
    'ukmlaAiPromptCheckedV1',
    'ukmlaAiDecisionDataV1'
  ];

  const FIREBASE_CONFIG_KEY = 'ukmlaFirebaseConfigV1';
  const PAD_ID_KEY = 'ukmlaRemotePadIdV1';
  const AUTO_RELOAD_KEY = 'ukmlaRemoteAutoReloadV1';
  const DEVICE_ID_KEY = 'ukmlaRemoteDeviceIdV1';
  const DEFAULT_PAD_ID = 'ukmla-main';

  let connected = false;
  let applyingRemote = false;
  let dbApi = null;
  let db = null;
  let padRef = null;
  let pushTimer = null;
  let lastPushedHash = '';
  let lastRemoteHash = '';

  const originalSetItem = localStorage.setItem.bind(localStorage);
  const originalRemoveItem = localStorage.removeItem.bind(localStorage);

  function deviceId() {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = 'device-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
      originalSetItem(DEVICE_ID_KEY, id);
    }
    return id;
  }

  function safePadId(raw) {
    return String(raw || DEFAULT_PAD_ID).replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 90) || DEFAULT_PAD_ID;
  }

  function stateFromLocalStorage() {
    const values = {};
    WATCHED_KEYS.forEach(key => {
      const value = localStorage.getItem(key);
      if (value !== null) values[key] = value;
    });
    return {
      updatedAt: Date.now(),
      origin: deviceId(),
      values
    };
  }

  function hashValues(values) {
    try { return JSON.stringify(values || {}); }
    catch (e) { return String(Date.now()); }
  }

  function status(text) {
    const el = document.getElementById('ukmla-remote-status');
    if (el) el.textContent = text;
  }

  function autoReloadEnabled() {
    return localStorage.getItem(AUTO_RELOAD_KEY) !== 'false';
  }

  function dispatchImportedEvents() {
    document.dispatchEvent(new Event('aiPromptCheckedImported'));
    document.dispatchEvent(new Event('aiDecisionDataImported'));
    document.dispatchEvent(new Event('ukmlaRemoteDataImported'));
  }

  function applyRemoteState(remoteState) {
    if (!remoteState || !remoteState.values || typeof remoteState.values !== 'object') return false;
    const remoteHash = hashValues(remoteState.values);
    if (remoteHash === lastRemoteHash) return false;
    lastRemoteHash = remoteHash;

    applyingRemote = true;
    WATCHED_KEYS.forEach(key => {
      if (Object.prototype.hasOwnProperty.call(remoteState.values, key)) {
        originalSetItem(key, String(remoteState.values[key]));
      } else {
        originalRemoveItem(key);
      }
    });
    applyingRemote = false;
    dispatchImportedEvents();
    return true;
  }

  async function pushLocalNow() {
    if (!connected || !dbApi || !padRef) {
      status('Remote sync is not connected.');
      return;
    }
    const state = stateFromLocalStorage();
    lastPushedHash = hashValues(state.values);
    await dbApi.set(padRef, state);
    status('Pushed this device to Firebase at ' + new Date().toLocaleTimeString() + '.');
  }

  function schedulePush() {
    if (!connected || applyingRemote) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      pushLocalNow().catch(err => status('Firebase push failed: ' + err.message));
    }, 900);
  }

  localStorage.setItem = function (key, value) {
    originalSetItem(key, value);
    if (WATCHED_KEYS.includes(key)) schedulePush();
  };

  localStorage.removeItem = function (key) {
    originalRemoveItem(key);
    if (WATCHED_KEYS.includes(key)) schedulePush();
  };

  async function connectRemote() {
    let config = null;
    const rawConfig = localStorage.getItem(FIREBASE_CONFIG_KEY) || '';
    try {
      config = JSON.parse(rawConfig);
    } catch (e) {
      status('Paste valid Firebase web config JSON first.');
      return;
    }
    if (!config || !config.apiKey || !config.databaseURL || !config.projectId) {
      status('Firebase config needs apiKey, databaseURL and projectId.');
      return;
    }

    status('Connecting to Firebase...');
    const appMod = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
    dbApi = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js');
    const app = appMod.initializeApp(config);
    db = dbApi.getDatabase(app);
    const padId = safePadId(localStorage.getItem(PAD_ID_KEY) || DEFAULT_PAD_ID);
    padRef = dbApi.ref(db, 'ukmlaPads/' + padId + '/state');
    connected = true;

    dbApi.onValue(padRef, snapshot => {
      const remoteState = snapshot.val();
      if (!remoteState) {
        status('Connected. Remote pad is empty; use “Push this device”.');
        return;
      }
      if (remoteState.origin === deviceId()) {
        status('Connected. This device is up to date.');
        return;
      }
      const changed = applyRemoteState(remoteState);
      if (changed) {
        status('Remote update received at ' + new Date().toLocaleTimeString() + '.');
        if (autoReloadEnabled()) {
          status('Remote update received. Reloading to apply it...');
          setTimeout(() => window.location.reload(), 1200);
        }
      }
    }, error => {
      status('Firebase listener failed: ' + error.message);
    });

    status('Connected to Firebase pad: ' + padId + '.');
  }

  function pullRemoteOnce() {
    if (!connected || !dbApi || !padRef) {
      status('Remote sync is not connected.');
      return;
    }
    dbApi.get(padRef).then(snapshot => {
      const remoteState = snapshot.val();
      if (!remoteState) {
        status('Remote pad is empty.');
        return;
      }
      const changed = applyRemoteState(remoteState);
      status(changed ? 'Pulled remote data. Reloading...' : 'Remote data already matches this browser.');
      if (changed) setTimeout(() => window.location.reload(), 800);
    }).catch(err => status('Firebase pull failed: ' + err.message));
  }

  function makePanel() {
    if (document.getElementById('ukmla-remote-sync-panel')) return;
    const panel = document.createElement('details');
    panel.id = 'ukmla-remote-sync-panel';
    panel.style.cssText = 'margin:12px 0;padding:12px;border:1px solid #d8dee9;border-radius:12px;background:#fff;box-shadow:0 4px 14px rgba(15,23,42,.06);';
    panel.innerHTML = `
      <summary style="cursor:pointer;font-weight:700">Remote sync / shared notes</summary>
      <div style="display:grid;gap:10px;margin-top:10px">
        <label style="display:grid;gap:4px">Pad ID
          <input id="ukmla-remote-pad-id" style="padding:8px;border:1px solid #cbd5e1;border-radius:8px" placeholder="long-random-share-id" />
        </label>
        <label style="display:grid;gap:4px">Firebase web config JSON
          <textarea id="ukmla-firebase-config" rows="5" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" placeholder='{"apiKey":"...","authDomain":"...","databaseURL":"...","projectId":"...","appId":"..."}'></textarea>
        </label>
        <label style="display:flex;gap:8px;align-items:center">
          <input id="ukmla-auto-reload" type="checkbox" /> Auto-reload when another device changes this pad
        </label>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button id="ukmla-connect-remote" type="button">Connect</button>
          <button id="ukmla-push-remote" type="button">Push this device</button>
          <button id="ukmla-pull-remote" type="button">Pull remote</button>
          <button id="ukmla-disable-remote" type="button">Disable remote</button>
        </div>
        <div id="ukmla-remote-status" style="font-size:.92rem;color:#475569">Remote sync not connected.</div>
      </div>`;

    const target = document.querySelector('.decision-panel') || document.querySelector('main') || document.body.firstElementChild;
    if (target && target.parentNode) target.parentNode.insertBefore(panel, target.nextSibling);
    else document.body.prepend(panel);

    const padInput = document.getElementById('ukmla-remote-pad-id');
    const configBox = document.getElementById('ukmla-firebase-config');
    const autoReloadBox = document.getElementById('ukmla-auto-reload');
    padInput.value = localStorage.getItem(PAD_ID_KEY) || DEFAULT_PAD_ID;
    configBox.value = localStorage.getItem(FIREBASE_CONFIG_KEY) || '';
    autoReloadBox.checked = autoReloadEnabled();

    padInput.addEventListener('input', () => originalSetItem(PAD_ID_KEY, safePadId(padInput.value)));
    configBox.addEventListener('input', () => originalSetItem(FIREBASE_CONFIG_KEY, configBox.value.trim()));
    autoReloadBox.addEventListener('change', () => originalSetItem(AUTO_RELOAD_KEY, autoReloadBox.checked ? 'true' : 'false'));
    document.getElementById('ukmla-connect-remote').addEventListener('click', () => connectRemote().catch(err => status('Firebase connect failed: ' + err.message)));
    document.getElementById('ukmla-push-remote').addEventListener('click', () => pushLocalNow().catch(err => status('Firebase push failed: ' + err.message)));
    document.getElementById('ukmla-pull-remote').addEventListener('click', pullRemoteOnce);
    document.getElementById('ukmla-disable-remote').addEventListener('click', () => {
      connected = false;
      status('Remote sync disabled for this page load.');
    });
  }

  document.addEventListener('DOMContentLoaded', makePanel);
})();
