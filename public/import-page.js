import { initializeArcade } from './games.js';
import { initializeImporter } from './importer.js';

function requestAuthentication() {
  if (!window.opener) return Promise.reject(new Error('Open the Import workspace from your signed-in A‑Null Hub tab.'));
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener('message', receiveAuthentication);
      reject(new Error('Authentication was not received. Reopen this workspace from the Hub.'));
    }, 5000);
    function receiveAuthentication(event) {
      if (event.origin !== window.location.origin || event.source !== window.opener ||
          event.data?.type !== 'anti-null-import-auth' || typeof event.data.token !== 'string') return;
      window.clearTimeout(timeout);
      window.removeEventListener('message', receiveAuthentication);
      resolve(event.data);
    }
    window.addEventListener('message', receiveAuthentication);
    window.opener.postMessage({ type: 'anti-null-import-auth-request' }, window.location.origin);
  });
}

async function initialize() {
  const errorNode = document.querySelector('#import-page-error');
  try {
    let token = sessionStorage.getItem('antiNullToken');
    let user = JSON.parse(sessionStorage.getItem('antiNullUser') || '{}');
    if (!token) {
      const auth = await requestAuthentication();
      token = auth.token;
      user = auth.user || user;
      sessionStorage.setItem('antiNullToken', token);
      sessionStorage.setItem('antiNullUser', JSON.stringify(user));
    }
    const api = async (url, options = {}) => {
      const response = await fetch(url, {
        ...options,
        headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Request failed with HTTP ${response.status}.`);
      return data;
    };
    const account = await api('/api/me');
    user = account.user;
    sessionStorage.setItem('antiNullUser', JSON.stringify(user));
    document.querySelector('#import-user').textContent = user.username;
    initializeImporter({ api, user });
    const socket = typeof window.io === 'function' ? window.io({ auth: { token } }) : null;
    initializeArcade({ api, socket, user, shell: document.querySelector('#import-game-shell') });
    wireWorkspaceTabs();
    window.dispatchEvent(new CustomEvent('app:viewchange', { detail: { view: 'import' } }));
  } catch (error) {
    errorNode.textContent = error.message;
    errorNode.classList.remove('hidden');
  }
}

function wireWorkspaceTabs() {
  const tabs = [
    { button: document.querySelector('#import-tab-button'), panel: document.querySelector('#import-tab-panel'), view: 'import' },
    { button: document.querySelector('#games-tab-button'), panel: document.querySelector('#games-tab-panel'), view: 'arcade' }
  ];
  for (const tab of tabs) {
    tab.button.addEventListener('click', () => {
      for (const current of tabs) {
        const active = current === tab;
        current.button.classList.toggle('active', active);
        current.button.setAttribute('aria-selected', String(active));
        current.panel.classList.toggle('hidden', !active);
        current.panel.setAttribute('aria-hidden', String(!active));
      }
      window.dispatchEvent(new CustomEvent('app:viewchange', { detail: { view: tab.view } }));
    });
  }
}

initialize();
