/* UKMLA Firebase remote sync layer.
   Clean baked setup: config + pad ID are stored here, so the app only shows
   Push to server / Pull from server buttons.
*/
(function () {
  'use strict';

  const WATCHED_KEYS = [
    'ukmlaQuizProgressV1',
    'ukmlaAspectStatusV2',
    'ukmlaAiPromptCheckedV1',
    'ukmlaAiDecisionDataV1',
    'ukmlaAiGeneratedQuizSetsV1',
    'ukmlaAiQuizConfigV1'
  ];

  const FIREBASE_CONFIG = {
    apiKey: 'AIzaSyAwakZ-niGTksbsx9y2T3OlQ50k3BpBH54',
    authDomain: 'ukmla-7c2d8.firebaseapp.com',
    databaseURL: 'https://ukmla-7c2d8-default-rtdb.firebaseio.com/',
    projectId: 'ukmla-7c2d8',
    storageBucket: 'ukmla-7c2d8.firebasestorage.app',
    messagingSenderId: '973464495744',
    appId: '1:973464495744:web:06221b2afeecc135a6a865'
  };

  const PAD_ID = 'ukmla-4Jq9QYF2vHc8nLz6WmRpT3xA';
  const DEVICE_ID_KEY = 'ukmlaRemoteDeviceIdV1';

  let connected = false;
  let dbApi = null;
  let db = null;
  let padRef = null;
  let isBusy = false;

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
    return String(raw || PAD_ID).replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 90) || PAD_ID;
  }

  function stateFromLocalStorage() {
    const values = {};
    WATCHED_KEYS.forEach(key => {
      const value = localStorage.getItem(key);
      if (value !== null) values[key] = value;
    });
    return { updatedAt: Date.now(), origin: deviceId(), values };
  }

  function hashValues(values) {
    try { return JSON.stringify(values || {}); }
    catch (e) { return String(Date.now()); }
  }

  function status(text) {
    const el = document.getElementById('ukmla-cloud-status');
    if (el) el.textContent = text;
  }

  function setBusy(value) {
    isBusy = value;
    ['ukmla-cloud-push', 'ukmla-cloud-pull'].forEach(id => {
      const button = document.getElementById(id);
      if (button) button.disabled = value || !connected;
    });
  }

  function dispatchImportedEvents() {
    document.dispatchEvent(new Event('aiPromptCheckedImported'));
    document.dispatchEvent(new Event('aiDecisionDataImported'));
    document.dispatchEvent(new Event('ukmlaRemoteDataImported'));
  }

  function applyRemoteState(remoteState) {
    if (!remoteState || !remoteState.values || typeof remoteState.values !== 'object') return false;
    const before = {};
    WATCHED_KEYS.forEach(key => { before[key] = localStorage.getItem(key); });
    WATCHED_KEYS.forEach(key => {
      if (Object.prototype.hasOwnProperty.call(remoteState.values, key)) originalSetItem(key, String(remoteState.values[key]));
      else originalRemoveItem(key);
    });
    const after = {};
    WATCHED_KEYS.forEach(key => { after[key] = localStorage.getItem(key); });
    const changed = hashValues(before) !== hashValues(after);
    if (changed) dispatchImportedEvents();
    return changed;
  }

  async function connectRemote() {
    if (connected) return;
    status('Connecting to Firebase...');
    const appMod = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
    dbApi = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js');
    const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(FIREBASE_CONFIG);
    db = dbApi.getDatabase(app);
    padRef = dbApi.ref(db, 'ukmlaPads/' + safePadId(PAD_ID) + '/state');
    connected = true;
    setBusy(false);
    status('Connected to cloud pad. Use Push or Pull when needed.');
  }

  async function pushLocalNow() {
    if (!connected || !dbApi || !padRef) { status('Cloud sync is not connected yet.'); return; }
    setBusy(true);
    try {
      await dbApi.set(padRef, stateFromLocalStorage());
      status('Pushed this device to server at ' + new Date().toLocaleTimeString() + '.');
    } catch (err) { status('Push failed: ' + err.message); }
    finally { setBusy(false); }
  }

  async function pullRemoteNow() {
    if (!connected || !dbApi || !padRef) { status('Cloud sync is not connected yet.'); return; }
    setBusy(true);
    try {
      const snapshot = await dbApi.get(padRef);
      const remoteState = snapshot.val();
      if (!remoteState) { status('Server pad is empty. Use Push to seed it from this device.'); return; }
      const changed = applyRemoteState(remoteState);
      if (changed) {
        status('Pulled server data. Reloading...');
        setTimeout(() => window.location.reload(), 700);
      } else status('Server already matches this browser.');
    } catch (err) { status('Pull failed: ' + err.message); }
    finally { setBusy(false); }
  }

  function makeCloudBar() {
    if (document.getElementById('ukmla-cloud-sync-bar')) return;
    const bar = document.createElement('section');
    bar.id = 'ukmla-cloud-sync-bar';
    bar.setAttribute('aria-label', 'UKMLA cloud sync');
    bar.style.cssText = ['margin:0','padding:.75rem max(1.2rem, 4vw)','border-bottom:1px solid #d8d0c4','background:#fffefa','display:flex','gap:.65rem','align-items:center','flex-wrap:wrap','box-shadow:0 4px 14px rgba(29,27,24,.05)'].join(';');
    bar.innerHTML = `<strong style="margin-right:.2rem">Cloud sync</strong><button id="ukmla-cloud-pull" type="button" disabled>Pull from server</button><button id="ukmla-cloud-push" type="button" disabled>Push to server</button><span id="ukmla-cloud-status" style="color:#70695f;font-size:.92rem">Cloud sync loading...</span>`;
    const header = document.querySelector('header.header');
    if (header && header.parentNode) header.parentNode.insertBefore(bar, header.nextSibling);
    else document.body.prepend(bar);
    document.getElementById('ukmla-cloud-push').addEventListener('click', pushLocalNow);
    document.getElementById('ukmla-cloud-pull').addEventListener('click', pullRemoteNow);
    connectRemote().catch(err => { connected = false; setBusy(false); status('Firebase connect failed: ' + err.message); });
  }

  function loadAiQuizInterface() {
    if (document.querySelector('script[data-ukmla-ai-quiz]')) return;
    const script = document.createElement('script');
    script.src = 'ai-quiz.js';
    script.defer = true;
    script.dataset.ukmlaAiQuiz = '1';
    script.onerror = () => status('AI quiz interface could not be loaded.');
    document.head.appendChild(script);
  }

  document.addEventListener('DOMContentLoaded', () => {
    makeCloudBar();
    loadAiQuizInterface();
  });
})();
