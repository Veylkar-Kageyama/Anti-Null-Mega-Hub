const form = document.querySelector('#catalog-search');
const queryInput = document.querySelector('#catalog-query');
const licenseInput = document.querySelector('#catalog-license');
const status = document.querySelector('#catalog-status');
const results = document.querySelector('#catalog-results');
const notice = document.querySelector('#catalog-notice');
const supportedLicenses = new Set(['MIT', 'Apache-2.0', 'BSD-3-Clause', 'BSD-2-Clause', 'CC0-1.0', 'Unlicense']);
let token = sessionStorage.getItem('antiNullToken');

function make(tag, className = '', text = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

if (token) {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void search();
  });
} else if (window.opener) {
  form.querySelector('button').disabled = true;
  status.textContent = 'Connecting to your A‑Null session…';
  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin || event.source !== window.opener ||
        event.data?.type !== 'anti-null-catalog-auth' || typeof event.data.token !== 'string') return;
    token = event.data.token;
    sessionStorage.setItem('antiNullToken', token);
    form.querySelector('button').disabled = false;
    status.textContent = 'Search to browse available .rbxlx files.';
  });
  window.opener.postMessage({ type: 'anti-null-catalog-auth-request' }, location.origin);
} else {
  status.textContent = 'Sign in to browse the licensed file catalog.';
  form.querySelector('button').disabled = true;
}

async function request(url, responseType = 'json') {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const content = responseType === 'text'
    ? await response.text()
    : await response.json().catch(() => ({}));
  if (!response.ok) {
    let message = 'Request failed.';
    if (responseType === 'text') {
      try { message = JSON.parse(content).error || message; } catch {}
    } else message = content.error || message;
    throw new Error(message);
  }
  return content;
}

async function search() {
  const button = form.querySelector('button');
  button.disabled = true;
  status.textContent = 'Searching licensed public repositories…';
  results.replaceChildren();
  try {
    const parameters = new URLSearchParams({
      q: queryInput.value.trim(),
      license: licenseInput.value
    });
    const response = await request(`/api/import-catalog?${parameters}`);
    const files = Array.isArray(response.files) ? response.files : [];
    status.textContent = `${files.length} .rbxlx file${files.length === 1 ? '' : 's'} found.`;
    notice.textContent = response.notice || 'Check each source repository for license terms and attribution requirements.';
    if (!files.length) {
      results.append(make('p', 'small muted', 'No matching .rbxlx files found. Try a broader search.'));
      return;
    }
    for (const file of files) {
      if (!file || typeof file.id !== 'string' || typeof file.fileName !== 'string' ||
          !supportedLicenses.has(file.license) || typeof file.sourceUrl !== 'string' ||
          !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(file.sourceUrl)) continue;
      const card = make('article', 'import-catalog-card');
      const heading = make('div', 'import-catalog-card-heading');
      heading.append(
        make('h2', '', file.title || file.fileName),
        make('span', 'import-catalog-license-tag', file.licenseName || file.license)
      );
      const source = make('a', 'import-catalog-source', file.repository || 'Source repository');
      source.href = file.sourceUrl;
      source.target = '_blank';
      source.rel = 'noopener noreferrer';
      const description = make('p', 'import-catalog-description', file.description || 'Community place file.');
      const sizeText = Number.isFinite(file.fileSize) ? `${(file.fileSize / (1024 * 1024)).toFixed(2)} MB` : 'Size unavailable';
      const download = make('button', 'primary-button circuit-cut', 'DOWNLOAD .RBXLX');
      download.type = 'button';
      download.addEventListener('click', async () => {
        download.disabled = true;
        status.textContent = `Downloading ${file.fileName}…`;
        try {
          const parameters = new URLSearchParams({ id: file.id });
          const xml = await request(`/api/import-catalog/file?${parameters}`, 'text');
          const url = URL.createObjectURL(new Blob([xml], { type: 'application/xml' }));
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = file.fileName;
          anchor.click();
          window.setTimeout(() => URL.revokeObjectURL(url), 1000);
          status.textContent = `Downloaded ${file.fileName}.`;
        } catch (error) {
          status.textContent = `Download failed: ${error.message}`;
          status.classList.add('error');
        } finally {
          download.disabled = false;
        }
      });
      const footer = make('div', 'import-catalog-card-footer');
      footer.append(source, make('span', 'small muted', `${file.license} · ${sizeText}`), download);
      card.append(heading, description, footer);
      results.append(card);
    }
  } catch (error) {
    status.textContent = `Catalog unavailable: ${error.message}`;
    status.classList.add('error');
  } finally {
    button.disabled = false;
  }
}
