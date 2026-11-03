'use strict';

const authForm = document.querySelector('#auth-form');
if (authForm) {
  const message = document.querySelector('#auth-message');
  const submitButton = document.querySelector('#auth-submit');
  const signupFields = [...document.querySelectorAll('.signup-only')];
  const tabs = [...document.querySelectorAll('[data-auth-mode]')];
  let mode = 'login';
  const showMessage = (text, error = false) => {
    message.textContent = text;
    message.classList.toggle('error', error);
  };
  tabs.forEach((tab) => tab.addEventListener('click', () => {
    mode = tab.dataset.authMode;
    tabs.forEach((item) => item.classList.toggle('active', item === tab));
    signupFields.forEach((field) => field.classList.toggle('hidden', mode !== 'signup'));
    document.querySelector('#password').autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
    submitButton.innerHTML = mode === 'signup' ? 'Request approval <span>↗</span>' : 'Establish connection <span>↗</span>';
    showMessage('');
  }));
  authForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    submitButton.disabled = true;
    showMessage('Contacting the realm...');
    const data = Object.fromEntries(new FormData(authForm));
    try {
      const response = await fetch(`/api/auth/${mode === 'signup' ? 'signup' : 'login'}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The request could not be completed.');
      if (result.pending) {
        showMessage(result.message || 'Your request is pending administrator approval.');
        return;
      }
      sessionStorage.setItem('antiNullToken', result.token);
      sessionStorage.setItem('antiNullUser', JSON.stringify(result.user));
      location.href = '/dashboard.html';
    } catch (error) {
      showMessage(error.message === 'Failed to fetch' ? 'Realm unavailable. Configure and start the database service.' : error.message, true);
    } finally { submitButton.disabled = false; }
  });

  const bootstrapPanel = document.querySelector('#bootstrap-panel');
  fetch('/api/status').then((response) => response.json()).then((status) => {
    document.querySelector('#system-status').textContent = status.database ? 'DATABASE LINKED' : 'DATABASE OFFLINE';
    if (status.bootstrapAvailable) bootstrapPanel.classList.remove('hidden');
  }).catch(() => { document.querySelector('#system-status').textContent = 'REALM UNAVAILABLE'; });

  document.querySelector('#bootstrap-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button');
    button.disabled = true;
    const body = {
      email: document.querySelector('#bootstrap-email').value,
      username: document.querySelector('#bootstrap-name').value,
      token: document.querySelector('#bootstrap-secret').value,
      password: document.querySelector('#bootstrap-password').value
    };
    try {
      const response = await fetch('/api/bootstrap', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Admin setup failed.');
      sessionStorage.setItem('antiNullToken', result.token);
      sessionStorage.setItem('antiNullUser', JSON.stringify(result.user));
      location.href = '/dashboard.html';
    } catch (error) { showMessage(error.message, true); }
    finally { button.disabled = false; }
  });
}
