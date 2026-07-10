/* Routes only OpenAI Responses API calls from ai-quiz.js through a user-configured proxy.
   The temporary OpenAI key remains in memory and is sent to the proxy for one request.
*/
(function () {
  'use strict';

  const CONFIG_KEY = 'ukmlaAiQuizConfigV1';
  const originalFetch = window.fetch.bind(window);

  function loadConfig() {
    try {
      const value = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
      return value && typeof value === 'object' ? value : {};
    } catch (_) {
      return {};
    }
  }

  function saveProxyUrl(url) {
    const config = loadConfig();
    config.proxyUrl = String(url || '').trim();
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  }

  function proxyUrl() {
    const input = document.getElementById('aiq-proxy');
    return String(input?.value || loadConfig().proxyUrl || '').trim();
  }

  function injectProxyField() {
    const grid = document.querySelector('#ai-generated-quiz .aiq-grid');
    if (!grid || document.getElementById('aiq-proxy')) return;

    const label = document.createElement('label');
    label.innerHTML = `Quiz proxy URL
      <input id="aiq-proxy" type="url" spellcheck="false" autocomplete="off"
        placeholder="https://your-worker.workers.dev">
      <span class="aiq-key-note">Saved locally. The API key itself is not saved.</span>`;
    grid.appendChild(label);

    const input = label.querySelector('#aiq-proxy');
    input.value = loadConfig().proxyUrl || '';
    input.addEventListener('change', () => saveProxyUrl(input.value));
    input.addEventListener('blur', () => saveProxyUrl(input.value));
  }

  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : input?.url;
    if (url !== 'https://api.openai.com/v1/responses') {
      return originalFetch(input, init);
    }

    const endpoint = proxyUrl();
    if (!endpoint) {
      return Promise.reject(new Error('Enter the quiz proxy URL before generating.'));
    }

    const headers = new Headers(init?.headers || {});
    const authorization = headers.get('Authorization') || '';
    const apiKey = authorization.replace(/^Bearer\s+/i, '').trim();
    if (!apiKey) {
      return Promise.reject(new Error('No temporary OpenAI API key was supplied.'));
    }

    saveProxyUrl(endpoint);
    return originalFetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-OpenAI-Key': apiKey
      },
      body: init?.body
    });
  };

  function start() {
    injectProxyField();
    const observer = new MutationObserver(injectProxyField);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
