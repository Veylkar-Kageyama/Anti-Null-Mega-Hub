import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import Cropper from 'cropperjs';
import { initializeArcade } from './games.js';

const token = sessionStorage.getItem('antiNullToken');
if (!token) location.replace('/');
const headers = () => ({ Authorization: `Bearer ${token}` });
const api = async (url, options = {}) => {
  const response = await fetch(url, { ...options, headers: { ...headers(), ...options.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
};
const toast = (text, error = false) => {
  const item = document.createElement('div');
  item.className = `toast${error ? ' error' : ''}`;
  item.textContent = text;
  document.querySelector('#toast-stack').append(item);
  window.setTimeout(() => item.remove(), 4200);
};
const user = JSON.parse(sessionStorage.getItem('antiNullUser') || '{}');
const state = { room: 'global', selected: null, cropper: null, socket: null, sceneReady: false, assets: [] };
const setText = (selector, value) => { const element = document.querySelector(selector); if (element) element.textContent = value; };

async function initialize() {
  try {
    const result = await api('/api/me');
    Object.assign(user, result.user);
    sessionStorage.setItem('antiNullUser', JSON.stringify(user));
  } catch (_error) { sessionStorage.clear(); location.replace('/'); return; }
  setText('#user-callsign', user.username);
  setText('#welcome-callsign', user.username);
  setText('#user-role', user.role.toUpperCase());
  setText('#hammer-status', user.hasHammers ? 'GRANTED' : 'NOT GRANTED');
  setText('#avatar-button', user.username.slice(0, 2).toUpperCase());
  document.querySelector('#forge-lock-indicator').classList.toggle('hidden', user.hasHammers);
  document.querySelector('.admin-link').classList.toggle('hidden', !user.isAdmin);
  document.querySelector('#forge-locked').classList.toggle('hidden', user.hasHammers);
  if (user.isAdmin) {
    document.querySelector('#announcement-compose').classList.remove('hidden');
    await loadPending();
  }
  wireNavigation();
  wireClock();
  await loadAnnouncements();
  await initializeSocket();
  wireForge();
  wireVault();
  wireProfile();
  wireAdmin();
  wireMenu();
  initializeArcade({ api, socket: state.socket, user });
}

function wireNavigation() {
  document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => {
    const view = button.dataset.view;
    if (view === 'forge') {
      if (!user.hasHammers) {
        document.querySelector('#forge-locked').classList.remove('hidden');
        toast("The Forge requires the Creator's Hammer.");
        return;
      }
      window.location.href = '/studio.html';
      return;
    }
    document.querySelectorAll('.view-panel').forEach((panel) => panel.classList.toggle('active', panel.id === `view-${view}`));
    document.querySelectorAll('.rail-link').forEach((link) => link.classList.toggle('active', link.dataset.view === view));
    window.dispatchEvent(new CustomEvent('app:viewchange', { detail: { view } }));
    if (view === 'frequency') document.querySelector('#chat-input').focus();
  }));
  document.querySelector('#signout-button').addEventListener('click', () => {
    state.socket?.disconnect();
    sessionStorage.clear();
    location.replace('/');
  });
  document.querySelector('#reality-glitch').addEventListener('click', () => triggerGlitch());
}

function wireClock() {
  const clock = document.querySelector('#utc-clock');
  const update = () => { clock.textContent = `${new Intl.DateTimeFormat(undefined, { timeZoneName: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date())} LOCAL`; };
  update();
  setInterval(update, 1000);
}

async function loadAnnouncements() {
  try {
    const { announcements } = await api('/api/announcements');
    const feed = document.querySelector('#chronicle-feed');
    feed.replaceChildren();
    if (!announcements.length) feed.innerHTML = '<div class="empty-state glass-panel circuit-cut">No announcements have reached the realm.</div>';
    for (const announcement of announcements) {
      const article = document.createElement('article');
      article.className = 'chronicle-item glass-panel circuit-cut';
      const time = document.createElement('time');
      time.textContent = `${new Date(announcement.createdAt).toLocaleString()} / ${announcement.author}`;
      const text = document.createElement('p');
      text.textContent = announcement.text;
      article.append(time, text);
      feed.prepend(article);
    }
    if (announcements[0]) setText('#latest-announcement', announcements[0].text);
  } catch (error) { toast(error.message, true); }
}

async function initializeSocket() {
  if (typeof window.io !== 'function') { setText('#socket-status', 'UNAVAILABLE'); return; }
  state.socket = window.io({ auth: { token } });
  state.socket.on('connect', () => {
    setText('#socket-status', 'CONNECTED');
    document.querySelector('#socket-status').classList.add('connected');
    joinRoom(state.room);
  });
  state.socket.on('disconnect', () => { setText('#socket-status', 'RECONNECTING'); document.querySelector('#socket-status').classList.remove('connected'); });
  state.socket.on('connect_error', () => setText('#socket-status', 'AUTH ERROR'));
  state.socket.on('chat:message', renderMessage);
  state.socket.on('announcement', (announcement) => {
    toast(`Chronicle: ${announcement.text}`);
    loadAnnouncements();
  });
  state.socket.on('void-toast', ({ text }) => toast(text));
  state.socket.on('account:revoked', () => { sessionStorage.clear(); location.replace('/'); });
  state.socket.on('reality-glitch', triggerGlitch);
}

function joinRoom(room) {
  state.room = room;
  const list = document.querySelector('#message-list');
  list.replaceChildren();
  state.socket?.emit('room:join', room, (result) => {
    if (result?.error) { toast(result.error, true); return; }
    result?.messages?.forEach(renderMessage);
  });
  setText('#chat-title', room === 'global' ? 'Global signal' : room.startsWith('dm:') ? 'Private signal' : 'Group signal');
  document.querySelectorAll('.room-option').forEach((item) => item.classList.toggle('active', item.dataset.room === room));
}

function formatMessageDay(date) {
  const day = date.getDate();
  const suffix = day % 100 >= 11 && day % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[day % 10] || 'th');
  const weekday = date.toLocaleDateString(undefined, { weekday: 'long' });
  const month = date.toLocaleDateString(undefined, { month: 'long' });
  return `${weekday}, ${month} ${day}${suffix}`;
}

function renderMessage(message) {
  if (message.room !== state.room) return;
  const date = new Date(message.createdAt);
  const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  const list = document.querySelector('#message-list');
  const lastMessage = list.querySelector('.message:last-of-type');
  if (!lastMessage || lastMessage.dataset.dateKey !== dateKey) {
    const divider = document.createElement('div');
    divider.className = 'message-day-divider';
    divider.setAttribute('role', 'separator');
    const label = document.createElement('time');
    label.dateTime = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    label.textContent = formatMessageDay(date);
    divider.append(label);
    list.append(divider);
  }
  const article = document.createElement('article');
  article.className = 'message';
  article.dataset.dateKey = dateKey;
  const meta = document.createElement('div');
  meta.className = 'message-meta';
  const name = document.createElement('strong');
  name.textContent = message.senderName || 'Creator';
  const time = document.createElement('time');
  time.dateTime = message.createdAt;
  time.textContent = date.toLocaleTimeString();
  meta.append(name, time);
  article.append(meta);
  if (message.text) { const text = document.createElement('p'); text.textContent = message.text; article.append(text); }
  if (message.attachment) {
    const media = message.attachment;
    const element = media.match(/\.(mp3|wav|ogg)$/i) ? document.createElement('audio') : document.createElement('img');
    element.src = media;
    if (element instanceof HTMLAudioElement) element.controls = true;
    else { element.alt = 'Shared image'; element.style.maxWidth = '220px'; }
    article.append(element);
  }
  list.append(article);
  list.scrollTop = list.scrollHeight;
}

document.querySelector('#chat-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = document.querySelector('#chat-input');
  const text = input.value.trim();
  if (!text || !state.socket?.connected) return;
  state.socket.emit('chat:send', { room: state.room, text }, (result) => { if (result?.error) toast(result.error, true); });
  input.value = '';
});
document.querySelector('#room-id').addEventListener('change', (event) => joinRoom(event.target.value));
document.querySelector('#direct-room').addEventListener('click', async () => {
  try {
    const { users } = await api('/api/users');
    const choices = users.filter((item) => item.id !== user.id);
    if (!choices.length) return toast('No other creators are available.');
    const target = choices.find((item) => item.username.toLowerCase() === prompt(`Send a private signal to:\n${choices.map((item) => item.username).join('\n')}`)?.trim().toLowerCase());
    if (!target) return;
    const room = `dm:${[user.id, target.id].sort().join(':')}`;
    joinRoom(room);
  } catch (error) { toast(error.message, true); }
});
document.querySelector('#new-group').addEventListener('click', async () => {
  const name = prompt('Name this private group (members can be added from its room settings).');
  if (!name?.trim()) return;
  try {
    const { group } = await api('/api/groups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    const option = document.createElement('option');
    option.value = `group:${group.id}`;
    option.textContent = group.name;
    document.querySelector('#room-id').append(option);
    joinRoom(option.value);
  } catch (error) { toast(error.message, true); }
});
document.querySelector('#attach-message').addEventListener('click', async () => {
  try {
    const selected = await chooseAsset('image');
    if (!selected) return;
    const file = await selectedToFile(selected);
    const form = new FormData();
    form.append('file', file);
    const upload = await api('/api/upload', { method: 'POST', body: form });
    state.socket.emit('chat:send', { room: state.room, text: '', attachment: upload.url }, (result) => { if (result?.error) toast(result.error, true); });
  } catch (error) { toast(error.message, true); }
});

let renderer;
let scene;
let camera;
let orbitControls;
let transformControls;
let workspace;
let raycaster;
let pointer;
function wireForge() {
  if (!user.hasHammers) return;
  initScene();
  document.querySelectorAll('[data-tool]').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('[data-tool]').forEach((item) => item.classList.toggle('active', item === button));
    transformControls.setMode(button.dataset.tool === 'select' ? 'translate' : button.dataset.tool);
    transformControls.showX = button.dataset.tool !== 'select';
    transformControls.showY = button.dataset.tool !== 'select';
    transformControls.showZ = button.dataset.tool !== 'select';
  }));
  document.querySelector('#add-cube').addEventListener('click', () => addMesh('cube'));
  document.querySelector('#add-sphere').addEventListener('click', () => addMesh('sphere'));
  document.querySelector('#add-light').addEventListener('click', addLight);
  document.querySelector('#add-object').addEventListener('click', () => addMesh('cube'));
  document.querySelector('#delete-object').addEventListener('click', deleteSelected);
  document.querySelector('#import-model').addEventListener('click', importModel);
  document.querySelector('#import-asset').addEventListener('click', importAnyAsset);
  document.querySelector('#save-scene').addEventListener('click', saveScene);
  document.querySelector('#load-scene').addEventListener('click', loadScene);
  document.querySelector('#run-script').addEventListener('click', runScript);
  document.querySelectorAll('[data-menu-action]').forEach((button) => button.addEventListener('click', () => {
    if (button.dataset.menuAction === 'new') { workspace.clear(); addMesh('cube'); }
    else toast(`${button.textContent} menu is available from the desktop menu bar.`);
    renderTree();
  }));
  document.addEventListener('keydown', (event) => {
    if (event.target.matches('input,textarea,select')) return;
    const keyModes = { q: 'select', w: 'translate', e: 'rotate', r: 'scale' };
    if (keyModes[event.key.toLowerCase()]) document.querySelector(`[data-tool="${keyModes[event.key.toLowerCase()]}"]`)?.click();
    if (event.key === 'Delete' || event.key === 'Backspace') deleteSelected();
  });
  renderTree();
}
function initScene() {
  if (state.sceneReady) return;
  const container = document.querySelector('#viewport');
  scene = new THREE.Scene();
  scene.background = new THREE.Color('#0c0316');
  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
  camera.position.set(7, 6, 9);
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  container.prepend(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xc9a8ff, 0x160626, 2));
  const keyLight = new THREE.DirectionalLight(0xffffff, 3);
  keyLight.position.set(4, 8, 5);
  scene.add(keyLight);
  const grid = new THREE.GridHelper(40, 40, 0x5c2d91, 0x291543);
  scene.add(grid);
  workspace = new THREE.Group();
  workspace.name = 'Workspace';
  scene.add(workspace);
  orbitControls = new OrbitControls(camera, renderer.domElement);
  orbitControls.enableDamping = true;
  transformControls = new TransformControls(camera, renderer.domElement);
  transformControls.addEventListener('dragging-changed', (event) => { orbitControls.enabled = !event.value; });
  transformControls.addEventListener('objectChange', () => { renderProperties(); updateCoordinates(); setSaveState('UNSAVED'); });
  scene.add(transformControls.getHelper());
  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();
  renderer.domElement.addEventListener('pointerdown', selectFromViewport);
  window.addEventListener('resize', resizeRenderer);
  const animate = () => {
    requestAnimationFrame(animate);
    orbitControls.update();
    renderer.render(scene, camera);
  };
  animate();
  addMesh('cube');
  state.sceneReady = true;
  document.querySelector('#viewport-loading').remove();
  resizeRenderer();
}
function resizeRenderer() {
  const container = document.querySelector('#viewport');
  if (!renderer || !container.clientWidth || !container.clientHeight) return;
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight, false);
}
function addMesh(kind, data = {}) {
  const geometry = kind === 'sphere' ? new THREE.SphereGeometry(0.75, 32, 24) : new THREE.BoxGeometry(1.25, 1.25, 1.25);
  const material = new THREE.MeshStandardMaterial({ color: data.color || '#8d35ff', roughness: 0.38, metalness: 0.35 });
  const object = new THREE.Mesh(geometry, material);
  object.name = data.name || `${kind === 'sphere' ? 'Sphere' : 'Cube'} ${workspace.children.filter((item) => item.userData.editable).length + 1}`;
  object.userData = { editable: true, kind };
  applyTransform(object, data.transform);
  workspace.add(object);
  selectObject(object);
  renderTree();
  setSaveState('UNSAVED');
}
function addLight(data = {}) {
  const light = new THREE.PointLight(data.color || '#dcbcff', 2, 20);
  light.name = data.name || 'Point Light';
  light.userData = { editable: true, kind: 'light' };
  light.position.set(2, 3, 1);
  applyTransform(light, data.transform);
  workspace.add(light);
  selectObject(light);
  renderTree();
}
function applyTransform(object, transform = {}) {
  if (!transform) return;
  for (const axis of ['x', 'y', 'z']) {
    if (Number.isFinite(transform.position?.[axis])) object.position[axis] = transform.position[axis];
    if (Number.isFinite(transform.rotation?.[axis])) object.rotation[axis] = transform.rotation[axis];
    if (Number.isFinite(transform.scale?.[axis])) object.scale[axis] = transform.scale[axis];
  }
}
function selectFromViewport(event) {
  if (event.button !== 0 || !renderer) return;
  const bounds = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(workspace.children, true);
  const hit = hits.find((item) => item.object.userData.editable || item.object.parent?.userData.editable);
  if (hit) selectObject(hit.object.userData.editable ? hit.object : hit.object.parent);
}
function selectObject(object) {
  state.selected = object;
  transformControls.attach(object);
  setText('#selected-type', object.userData.kind.toUpperCase());
  renderTree();
  renderProperties();
  updateCoordinates();
}
function deleteSelected() {
  if (!state.selected || !workspace) return;
  transformControls.detach();
  workspace.remove(state.selected);
  state.selected.geometry?.dispose();
  if (state.selected.material?.dispose) state.selected.material.dispose();
  state.selected = null;
  setText('#selected-type', 'NO SELECTION');
  renderTree();
  renderProperties();
  setSaveState('UNSAVED');
}
function renderTree() {
  const tree = document.querySelector('#scene-tree');
  if (!tree || !workspace) return;
  tree.replaceChildren();
  workspace.children.filter((object) => object.userData.editable).forEach((object) => {
    const row = document.createElement('div');
    row.className = `scene-object${state.selected === object ? ' selected' : ''}`;
    const name = document.createElement('span');
    name.textContent = `${object.userData.kind === 'light' ? '☼' : '◇'} ${object.name}`;
    const remove = document.createElement('button');
    remove.type = 'button'; remove.textContent = '×'; remove.title = 'Delete object';
    remove.addEventListener('click', (event) => { event.stopPropagation(); selectObject(object); deleteSelected(); });
    row.append(name, remove);
    row.addEventListener('click', () => selectObject(object));
    tree.append(row);
  });
}
function renderProperties() {
  const content = document.querySelector('#properties-content');
  content.replaceChildren();
  if (!state.selected) { content.innerHTML = '<div class="empty-properties">Select an object to inspect its attributes.</div>'; return; }
  const object = state.selected;
  const addInput = (label, value, onChange, type = 'number') => {
    const row = document.createElement('label'); row.className = 'property-row';
    const title = document.createElement('span'); title.textContent = label;
    const input = document.createElement('input'); input.type = type; input.value = type === 'number' ? Number(value).toFixed(2) : value;
    if (type === 'number') { input.step = '0.1'; input.addEventListener('change', () => { const number = Number(input.value); if (Number.isFinite(number)) { onChange(number); setSaveState('UNSAVED'); updateCoordinates(); } }); }
    else input.addEventListener('change', () => onChange(input.value));
    row.append(title, input); content.append(row);
  };
  addInput('Name', object.name, (value) => { object.name = value; renderTree(); setSaveState('UNSAVED'); }, 'text');
  for (const prop of ['position', 'rotation', 'scale']) {
    for (const axis of ['x', 'y', 'z']) {
      const title = `${prop[0].toUpperCase()} ${axis.toUpperCase()}`;
      addInput(title, prop === 'rotation' ? THREE.MathUtils.radToDeg(object[prop][axis]) : object[prop][axis], (value) => {
        object[prop][axis] = prop === 'rotation' ? THREE.MathUtils.degToRad(value) : value;
      });
    }
  }
  const material = object.material;
  if (material?.color) addInput('Color', `#${material.color.getHexString()}`, (value) => { material.color.set(value); setSaveState('UNSAVED'); }, 'color');
  if (object.isLight) addInput('Intensity', object.intensity, (value) => { object.intensity = value; });
}
function updateCoordinates() {
  if (!state.selected) return;
  const { x, y, z } = state.selected.position;
  setText('#coordinates', `X ${x.toFixed(2)}   Y ${y.toFixed(2)}   Z ${z.toFixed(2)}`);
}
function setSaveState(value) { setText('#save-state', value); }
async function importModel() {
  try {
    const selected = await chooseAsset('model');
    if (!selected) return;
    const file = await selectedToFile(selected);
    const url = URL.createObjectURL(file);
    const extension = file.name.split('.').pop().toLowerCase();
    const loaded = await new Promise((resolve, reject) => {
      if (extension === 'obj') new OBJLoader().load(url, resolve, undefined, reject);
      else new GLTFLoader().load(url, (result) => resolve(result.scene), undefined, reject);
    });
    URL.revokeObjectURL(url);
    loaded.name = file.name;
    loaded.userData = { ...loaded.userData, editable: true, kind: 'model' };
    workspace.add(loaded);
    selectObject(loaded);
    renderTree();
    setSaveState('UNSAVED');
  } catch (error) { toast(error.message, true); }
}
async function importAnyAsset() {
  try {
    const kind = prompt('Import asset type: image, audio, or model', 'image')?.toLowerCase();
    if (!['image', 'audio', 'model'].includes(kind)) return;
    if (kind === 'model') return importModel();
    const selected = await chooseAsset(kind);
    if (!selected) return;
    const file = await selectedToFile(selected);
    const form = new FormData(); form.append('file', file);
    const result = await api('/api/upload', { method: 'POST', body: form });
    state.assets.push(result);
    renderAssets();
  } catch (error) { toast(error.message, true); }
}
function renderAssets() {
  const list = document.querySelector('#asset-list'); list.replaceChildren();
  if (!state.assets.length) { list.innerHTML = '<span class="muted small">No imported assets</span>'; return; }
  state.assets.forEach((asset) => { const row = document.createElement('a'); row.className = 'asset-item'; row.href = asset.url; row.target = '_blank'; row.rel = 'noopener'; row.textContent = asset.name; list.append(row); });
}
async function saveScene() {
  try {
    const data = { format: 'anti-null-scene', version: 1, savedAt: new Date().toISOString(), scene: scene.toJSON() };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'untitled.anull'; link.click(); URL.revokeObjectURL(link.href);
    setSaveState('SAVED');
  } catch (error) { toast(`Could not save scene: ${error.message}`, true); }
}
async function loadScene() {
  try {
    const file = await chooseAsset('scene');
    if (!file) return;
    const parsed = JSON.parse(await file.text());
    if (parsed.format !== 'anti-null-scene' || !parsed.scene) throw new Error('This is not a valid .anull scene.');
    scene = new THREE.ObjectLoader().parse(parsed.scene);
    workspace = scene.getObjectByName('Workspace');
    if (!workspace) throw new Error('The scene has no Workspace root.');
    transformControls.detach();
    state.selected = null;
    orbitControls.object = camera;
    renderer.render(scene, camera);
    renderTree(); renderProperties(); setSaveState('SAVED'); resizeRenderer();
    setText('#scene-name', file.name);
  } catch (error) { toast(error.message, true); }
}
async function chooseAsset(kind) {
  if (window.antiNull?.chooseAsset) return window.antiNull.chooseAsset(kind);
  const input = document.createElement('input'); input.type = 'file';
  input.accept = kind === 'model' ? '.obj,.gltf,.glb' : kind === 'scene' ? '.anull' : kind === 'audio' ? 'audio/*' : 'image/*';
  return new Promise((resolve) => { input.onchange = () => resolve(input.files?.[0] || null); input.click(); });
}
async function selectedToFile(selected) {
  if (selected instanceof File) return selected;
  const bytes = Uint8Array.from(atob(selected.data), (character) => character.charCodeAt(0));
  return new File([bytes], selected.name, { type: selected.mimeType || 'application/octet-stream' });
}
async function runScript() {
  const source = document.querySelector('#script-source').value;
  const output = document.querySelector('#script-output');
  const language = document.querySelector('#script-language').value;
  if (!source.trim()) return;
  if (language === 'lua') {
    if (!window.fengari?.load) { output.textContent = 'Fengari runtime unavailable. Install dependencies and restart the app.'; return; }
    try {
      const result = window.fengari.load(source);
      output.textContent = result === undefined ? 'Lua script completed.' : String(result);
    } catch (error) { output.textContent = error.message; }
    return;
  }
  const workerSource = `self.onmessage=({data})=>{const lines=[];const safeConsole={log:(...v)=>lines.push(v.map(String).join(' ')),warn:(...v)=>lines.push(v.map(String).join(' ')),error:(...v)=>lines.push(v.map(String).join(' '))};try{(new Function('console', '"use strict";\\n'+data))(safeConsole);postMessage({lines})}catch(e){postMessage({error:e.message,lines})}}`;
  const url = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
  const worker = new Worker(url);
  const timeout = setTimeout(() => { worker.terminate(); URL.revokeObjectURL(url); output.textContent = 'Execution stopped after 2 seconds.'; }, 2000);
  worker.onmessage = ({ data }) => { clearTimeout(timeout); worker.terminate(); URL.revokeObjectURL(url); output.textContent = data.error ? `${data.lines.join('\n')}\n${data.error}` : (data.lines.join('\n') || 'Script completed.'); };
  worker.postMessage(source);
}

function wireVault() {
  document.querySelector('#vault-upload').addEventListener('click', () => document.querySelector('#vault-file').click());
  document.querySelector('#vault-file').addEventListener('change', async (event) => {
    const file = event.target.files?.[0]; if (!file) return;
    const card = document.createElement('article'); card.className = 'vault-card circuit-cut';
    const name = document.createElement('strong'); name.textContent = file.name;
    const detail = document.createElement('small'); detail.textContent = `${(file.size / 1024).toFixed(1)} KB / local session`;
    card.append(name, detail); document.querySelector('#vault-items').replaceChildren(card); event.target.value = '';
  });
}

function wireProfile() {
  const dialog = document.querySelector('#profile-dialog');
  document.querySelector('#avatar-button').addEventListener('click', () => {
    document.querySelector('#profile-bio').value = user.bio || '';
    setText('#bio-count', `${(user.bio || '').length} / 250`);
    dialog.showModal();
  });
  document.querySelector('#profile-bio').addEventListener('input', (event) => setText('#bio-count', `${event.target.value.length} / 250`));
  document.querySelector('#choose-avatar').addEventListener('click', () => chooseAsset('image').then(async (selected) => {
    if (!selected) return;
    const file = await selectedToFile(selected);
    const image = document.querySelector('#avatar-preview');
    image.src = URL.createObjectURL(file);
    image.onload = () => { state.cropper?.destroy(); state.cropper = new Cropper(image, { aspectRatio: 1, viewMode: 1, autoCropArea: 1 }); };
  }).catch((error) => toast(error.message, true)));
  document.querySelector('#save-profile').addEventListener('click', async () => {
    try {
      let avatar = user.avatar;
      if (state.cropper) {
        const blob = await new Promise((resolve) => state.cropper.getCroppedCanvas({ width: 512, height: 512 }).toBlob(resolve, 'image/jpeg', 0.88));
        const form = new FormData(); form.append('file', blob, 'avatar.jpg');
        avatar = (await api('/api/upload', { method: 'POST', body: form })).url;
      }
      const { user: updated } = await api('/api/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bio: document.querySelector('#profile-bio').value, avatar }) });
      Object.assign(user, updated); sessionStorage.setItem('antiNullUser', JSON.stringify(user));
      dialog.close(); toast('Profile synchronized.');
    } catch (error) { toast(error.message, true); }
  });
}

async function wireAdmin() {
  if (!user.isAdmin) return;
  document.querySelector('#post-announcement').addEventListener('click', async () => {
    const text = document.querySelector('#announcement-text').value.trim(); if (!text) return;
    try { await api('/api/announcements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }); document.querySelector('#announcement-text').value = ''; }
    catch (error) { toast(error.message, true); }
  });
  document.querySelector('#send-broadcast').addEventListener('click', async () => {
    const text = document.querySelector('#broadcast-text').value.trim(); if (!text) return;
    try { await api('/api/admin/broadcast', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }); document.querySelector('#broadcast-text').value = ''; toast('Broadcast transmitted.'); }
    catch (error) { toast(error.message, true); }
  });
  document.querySelector('#admin-glitch').addEventListener('click', async () => {
    try { await api('/api/admin/glitch', { method: 'POST' }); }
    catch (error) { toast(error.message, true); }
  });
}

async function loadPending() {
  try {
    const { users } = await api('/api/admin/pending');
    const list = document.querySelector('#pending-users'); list.replaceChildren();
    if (!users.length) { list.innerHTML = '<div class="empty-state">No access requests are waiting.</div>'; return; }
    users.forEach((candidate) => {
      const row = document.createElement('div'); row.className = 'pending-user';
      const identity = document.createElement('div');
      const name = document.createElement('strong'); name.textContent = candidate.username;
      const email = document.createElement('small'); email.textContent = candidate.email;
      identity.append(name, email);
      const actions = document.createElement('div'); actions.className = 'pending-actions';
      const approve = document.createElement('button'); approve.textContent = 'APPROVE';
      approve.addEventListener('click', () => moderate(candidate._id, { approved: true }));
      const hammer = document.createElement('button'); hammer.textContent = 'APPROVE + HAMMER';
      hammer.addEventListener('click', () => moderate(candidate._id, { approved: true, hasHammers: true }));
      actions.append(approve, hammer); row.append(identity, actions); list.append(row);
    });
  } catch (error) { toast(error.message, true); }
}
async function moderate(id, changes) {
  try { await api(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes) }); await loadPending(); }
  catch (error) { toast(error.message, true); }
}
function triggerGlitch() {
  document.body.classList.remove('glitch-active');
  void document.body.offsetWidth;
  document.body.classList.add('glitch-active');
  window.setTimeout(() => document.body.classList.remove('glitch-active'), 1600);
}
function wireMenu() {
  window.antiNull?.onMenuAction((action) => {
    if (action === 'scene:new') { if (workspace) { workspace.clear(); addMesh('cube'); } }
    if (action === 'scene:save') saveScene();
    if (action === 'scene:open') loadScene();
  });
}

initialize();
