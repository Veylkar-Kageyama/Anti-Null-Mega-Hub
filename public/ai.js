import { downloadPdf, downloadText, downloadZip } from './ai-files.mjs';

const MODE_DESCRIPTIONS = {
  creative: 'Brainstorm stories, characters, and fresh ideas.',
  logical: 'Break down questions, compare options, and check assumptions.',
  'extended-thought': 'Work through complex questions and provide a clear, detailed rationale summary.',
  code: 'Write, explain, and debug focused code snippets.',
  'complex-code': 'Plan and solve larger coding tasks with attention to architecture and edge cases.',
  research: 'Search the live web more deeply, compare sources, and include citations.'
};

const make = (tag, className = '', text = '') => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

function trimContext(messages) {
  const kept = [];
  let total = 0;
  for (const message of [...messages].reverse()) {
    if (kept.length >= 13 || total + message.content.length > 16000) break;
    kept.unshift(message);
    total += message.content.length;
  }
  return kept;
}

function downloadImage(dataUrl) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = 'anti-null-generated-image.png';
  link.click();
}

export function initializeAi({ api }) {
  const modeSelect = document.querySelector('#ai-mode');
  const description = document.querySelector('#ai-mode-description');
  const status = document.querySelector('#ai-status');
  const messagesNode = document.querySelector('#ai-messages');
  const form = document.querySelector('#ai-form');
  const input = document.querySelector('#ai-input');
  const send = document.querySelector('#ai-send');
  const clear = document.querySelector('#ai-clear');
  const filesInput = document.querySelector('#ai-files');
  const filesLabel = document.querySelector('#ai-attachment-list');
  const attach = document.querySelector('#ai-attach');
  const generateImage = document.querySelector('#ai-generate-image');
  const earnCredits = document.querySelector('#ai-earn-credits');
  const credits = document.querySelector('#ai-credits');
  const conversations = new Map();
  const conversationFiles = new Map();
  let pendingFiles = [];
  let rewardUrl = null;
  let busy = false;

  function currentMessages() {
    return conversations.get(modeSelect.value) || [];
  }

  function updateCredits(value) {
    if (Number.isInteger(value) && value >= 0) credits.textContent = String(value);
  }

  function renderConversation() {
    messagesNode.replaceChildren();
    for (const message of currentMessages()) {
      const article = make('article', `ai-message ai-message-${message.role}`);
      article.append(make('strong', 'ai-message-label', message.role === 'user' ? 'YOU' : 'ANTI-NULL AI'));
      if (message.content) article.append(make('p', 'ai-message-content', message.content));
      if (message.attachments?.length) {
        article.append(make('p', 'ai-message-attachments', `ATTACHED: ${message.attachments.map((file) => file.name).join(', ')}`));
      }
      if (message.image) {
        const image = make('img', 'ai-generated-image');
        image.src = message.image;
        image.alt = message.content || 'AI-generated image';
        article.append(image);
        const saveImage = make('button', 'secondary-button circuit-cut', 'DOWNLOAD PNG');
        saveImage.type = 'button';
        saveImage.addEventListener('click', () => downloadImage(message.image));
        article.append(saveImage);
      }
      if (message.sources?.length) {
        const list = make('ul', 'ai-sources');
        for (const source of message.sources) {
          const item = make('li');
          const link = make('a', '', source.title);
          link.href = source.url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          item.append(link);
          list.append(item);
        }
        article.append(list);
      }
      if (message.role === 'assistant' && message.content) {
        const actions = make('div', 'ai-artifact-actions');
        for (const [label, action] of [
          ['DOWNLOAD .TXT', () => downloadText(message.content)],
          ['DOWNLOAD .PDF', () => downloadPdf(message.content, message.sources)],
          ['DOWNLOAD .ZIP', () => downloadZip(message.content, message.sources, message.image)]
        ]) {
          const button = make('button', 'secondary-button circuit-cut', label);
          button.type = 'button';
          button.addEventListener('click', action);
          actions.append(button);
        }
        article.append(actions);
      }
      messagesNode.append(article);
    }
    messagesNode.scrollTop = messagesNode.scrollHeight;
  }

  function setStatus(text, error = false) {
    status.textContent = text;
    status.classList.toggle('error', error);
  }

  function setBusy(value) {
    busy = value;
    send.disabled = value;
    generateImage.disabled = value;
    modeSelect.disabled = value;
    clear.disabled = value;
    attach.disabled = value;
  }

  async function refreshStatus() {
    const result = await api('/api/ai/status');
    updateCredits(result.credits);
    rewardUrl = result.rewardAvailable ? result.rewardUrl : null;
    earnCredits.classList.toggle('hidden', !rewardUrl);
    setStatus(!result.available
      ? 'AI is not configured. The server administrator must set OPENAI_API_KEY.'
      : !result.credits && !rewardUrl
        ? 'OpenAI is ready, but no credits or verified reward offerwall are available yet.'
        : 'OpenAI is ready. Chat uses 1 credit; image generation uses 2 credits.');
  }

  modeSelect.addEventListener('change', () => {
    description.textContent = MODE_DESCRIPTIONS[modeSelect.value];
    renderConversation();
  });

  clear.addEventListener('click', () => {
    conversations.set(modeSelect.value, []);
    conversationFiles.set(modeSelect.value, new Map());
    renderConversation();
    setStatus('New conversation ready.');
  });

  attach.addEventListener('click', () => filesInput.click());
  filesInput.addEventListener('change', () => {
    const files = Array.from(filesInput.files || []);
    if (files.length > 4 || files.reduce((total, file) => total + file.size, 0) > 20 * 1024 * 1024) {
      filesInput.value = '';
      pendingFiles = [];
      filesLabel.textContent = 'Select up to 4 files, with 20 MB total.';
      setStatus('Attachments are limited to 4 files and 20 MB total.', true);
      return;
    }
    pendingFiles = files;
    filesLabel.textContent = files.length
      ? files.map((file) => `${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`).join(' · ')
      : 'Images, PDFs, Office, spreadsheets, text and code · 4 files, 20 MB total';
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const prompt = input.value.trim() || (pendingFiles.length ? 'Please review the attached files and help me understand them.' : '');
    if (!prompt || busy) return;

    const mode = modeSelect.value;
    const uploaded = pendingFiles;
    const messages = trimContext([
      ...currentMessages(),
      {
        role: 'user',
        content: prompt,
        attachments: uploaded.map((file) => ({ id: crypto.randomUUID(), name: file.name }))
      }
    ]);
    const filesById = new Map(conversationFiles.get(mode) || []);
    messages[messages.length - 1].attachments?.forEach((attachment, index) => filesById.set(attachment.id, uploaded[index]));
    const attachmentIds = messages.flatMap((message) => message.attachments || []).map((file) => file.id);
    const referencedFiles = messages.flatMap((message) => message.attachments || [])
      .map((attachment) => filesById.get(attachment.id))
      .filter(Boolean);
    if (referencedFiles.length !== attachmentIds.length || referencedFiles.length > 4 ||
        referencedFiles.reduce((total, file) => total + file.size, 0) > 20 * 1024 * 1024) {
      setStatus('This conversation is limited to 4 attached files and 20 MB total. Start a new chat to attach different files.', true);
      return;
    }
    conversations.set(mode, messages);
    setBusy(true);
    setStatus('Searching the web and consulting OpenAI…');
    renderConversation();
    try {
      const body = new FormData();
      body.append('mode', mode);
      body.append('messages', JSON.stringify(messages.map(({ role, content, attachments }) => ({ role, content, attachments }))));
      body.append('fileAttachmentIds', JSON.stringify(attachmentIds));
      for (let index = 0; index < attachmentIds.length; index += 1) {
        const file = filesById.get(attachmentIds[index]);
        if (file) body.append('files', file, file.name);
      }
      const result = await api('/api/ai/chat', { method: 'POST', body });
      conversationFiles.set(mode, filesById);
      conversations.set(mode, [
        ...messages,
        { role: 'assistant', content: result.reply, sources: result.sources }
      ].slice(-12));
      pendingFiles = [];
      filesInput.value = '';
      filesLabel.textContent = 'Images, PDFs, Office, spreadsheets, text and code · 4 files, 20 MB total';
      input.value = '';
      updateCredits(result.credits);
      renderConversation();
      setStatus('Reply received.');
    } catch (error) {
      conversations.set(mode, messages.slice(0, -1));
      renderConversation();
      setStatus(error.message, true);
      if (error.message.includes('AI credit')) refreshStatus().catch((refreshError) => setStatus(refreshError.message, true));
    } finally {
      setBusy(false);
      input.focus();
    }
  });

  generateImage.addEventListener('click', async () => {
    const prompt = input.value.trim();
    if (!prompt || busy) {
      if (!prompt) setStatus('Describe the image you want to generate first.', true);
      return;
    }
    if (prompt.length > 2000) {
      setStatus('Image prompts must be 2,000 characters or fewer.', true);
      return;
    }
    setBusy(true);
    setStatus('Generating image with OpenAI…');
    try {
      const result = await api('/api/ai/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });
      const mode = modeSelect.value;
      conversations.set(mode, [
        ...currentMessages(),
        { role: 'user', content: `Generate an image: ${prompt}` },
        { role: 'assistant', content: `Generated image for: ${prompt}`, image: result.image }
      ].slice(-12));
      input.value = '';
      updateCredits(result.credits);
      renderConversation();
      setStatus('Image generated. Download the PNG.');
    } catch (error) {
      setStatus(error.message, true);
      if (error.message.includes('AI credit')) refreshStatus().catch((refreshError) => setStatus(refreshError.message, true));
    } finally {
      setBusy(false);
      input.focus();
    }
  });

  earnCredits.addEventListener('click', () => {
    if (!rewardUrl) {
      setStatus('The server has not configured a verified reward offerwall.', true);
      return;
    }
    const windowRef = window.open(rewardUrl, '_blank');
    if (!windowRef) {
      setStatus('Allow pop-ups to open the reward offerwall.', true);
      return;
    }
    windowRef.opener = null;
    setStatus('Complete an offer, then refresh your credits.');
  });

  document.querySelector('#ai-refresh-credits').addEventListener('click', () => {
    refreshStatus().then(() => setStatus('Credits refreshed.')).catch((error) => setStatus(error.message, true));
  });

  refreshStatus().catch((error) => setStatus(error.message, true));
  renderConversation();
}
