import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

const token = sessionStorage.getItem('antiNullToken');
if (!token) location.replace('/');

const assetLibrary = [
  { name: 'Void Tower', category: 'Void-Structures', kind: 'part', color: '#7b4dff' },
  { name: 'Arc Panel', category: 'Void-Structures', kind: 'part', color: '#3a8dff' },
  { name: 'Rune Crystal', category: 'Atmospherics', kind: 'part', color: '#f472b6' },
  { name: 'Nebula Orb', category: 'Atmospherics', kind: 'sphere', color: '#82e1ff' },
  { name: 'Drone NPC', category: 'NPCs', kind: 'rig', color: '#8ec5ff' },
  { name: 'Light Beam', category: 'Atmospherics', kind: 'light', color: '#fdd977' }
];

const state = {
  selected: null,
  selectedScript: null,
  selectedGroup: null,
  scriptFiles: [],
  scene: null,
  renderer: null,
  camera: null,
  controls: null,
  transform: null,
  workspace: null,
  lighting: null,
  scriptsRoot: null,
  raycaster: new THREE.Raycaster(),
  pointer: new THREE.Vector2(),
  assetSearch: ''
};

function api(url, options = {}) {
  return fetch(url, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) } }).then(async (response) => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Request failed.');
    return data;
  });
}

function setupSceneRoots() {
  state.workspace = new THREE.Group();
  state.workspace.name = 'Workspace';
  state.lighting = new THREE.Group();
  state.lighting.name = 'Lighting';
  state.scriptsRoot = new THREE.Group();
  state.scriptsRoot.name = 'Scripts';
  state.scene.add(state.workspace, state.lighting, state.scriptsRoot);
}

function createScriptFile(name = 'NewScript') {
  const file = { id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`, name, content: '// Write your script here\n' };
  state.scriptFiles.push(file);
  state.selectedScript = file;
  renderScriptFiles();
  document.getElementById('studio-script').value = file.content;
  return file;
}

function renderScriptFiles() {
  const list = document.getElementById('script-file-list');
  list.innerHTML = '';
  if (!state.scriptFiles.length) {
    const empty = document.createElement('div');
    empty.className = 'script-file empty';
    empty.textContent = 'No script files';
    list.appendChild(empty);
    return;
  }
  state.scriptFiles.forEach((file) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `script-file${state.selectedScript?.id === file.id ? ' active' : ''}`;
    item.textContent = file.name;
    item.addEventListener('click', () => {
      state.selectedScript = file;
      document.getElementById('studio-script').value = file.content;
      renderScriptFiles();
    });
    list.appendChild(item);
  });
}

function createDataObject(name, kind, color = '#7c4dff') {
  const object = new THREE.Object3D();
  object.userData = {
    editable: true,
    kind,
    material: color,
    anchored: false,
    canCollide: true,
    tag: name,
    sourceAsset: null,
    scriptId: null,
    custom: {}
  };
  object.name = name;
  return object;
}

function addMesh(kind, data = {}) {
  const color = data.color || '#7c4dff';
  const object = kind === 'sphere' ? new THREE.Mesh(new THREE.SphereGeometry(0.8, 32, 32), new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.25 })) :
    new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.7, 1.7), new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.25 }));
  object.name = data.name || `${kind === 'sphere' ? 'Sphere' : 'Part'} ${state.workspace.children.length + 1}`;
  object.userData = {
    editable: true,
    kind: kind === 'sphere' ? 'sphere' : 'part',
    material: color,
    anchored: false,
    canCollide: true,
    tag: object.name,
    sourceAsset: null,
    scriptId: null,
    custom: {}
  };
  applyTransform(object, data.transform || {});
  state.workspace.add(object);
  selectObject(object);
  setSaveState('Unsaved');
  renderTree();
}

function addGroup(data = {}) {
  const group = new THREE.Group();
  group.name = data.name || `FragmentGroup ${state.workspace.children.length + 1}`;
  group.userData = {
    editable: true,
    kind: 'group',
    material: '#7c4dff',
    anchored: false,
    canCollide: false,
    tag: group.name,
    sourceAsset: null,
    scriptId: null,
    custom: {}
  };
  applyTransform(group, data.transform || {});
  state.workspace.add(group);
  selectObject(group);
  renderTree();
}

function addRig(data = {}) {
  const rig = new THREE.Group();
  rig.name = data.name || `Rig ${state.workspace.children.length + 1}`;
  rig.userData = {
    editable: true,
    kind: 'rig',
    material: '#8ec5ff',
    anchored: false,
    canCollide: true,
    tag: rig.name,
    sourceAsset: null,
    scriptId: null,
    custom: { rig: true }
  };

  const torso = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.4, 0.7), new THREE.MeshStandardMaterial({ color: '#9ecaff' }));
  torso.name = 'Torso';
  torso.userData = { editable: true, kind: 'part', material: '#9ecaff', anchored: false, canCollide: true, tag: 'Torso', sourceAsset: null, scriptId: null, custom: {} };
  torso.position.set(0, 1.2, 0);
  rig.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 24), new THREE.MeshStandardMaterial({ color: '#f3d7b4' }));
  head.name = 'Head';
  head.userData = { editable: true, kind: 'part', material: '#f3d7b4', anchored: false, canCollide: true, tag: 'Head', sourceAsset: null, scriptId: null, custom: {} };
  head.position.set(0, 2.2, 0);
  rig.add(head);

  applyTransform(rig, data.transform || {});
  state.workspace.add(rig);
  selectObject(rig);
  renderTree();
}

function addLight(data = {}) {
  const light = new THREE.PointLight(data.color || '#f7d77a', 2.5, 25);
  light.name = data.name || `Light ${state.workspace.children.length + 1}`;
  light.userData = {
    editable: true,
    kind: 'light',
    material: data.color || '#f7d77a',
    anchored: false,
    canCollide: false,
    tag: light.name,
    sourceAsset: null,
    scriptId: null,
    custom: {}
  };
  applyTransform(light, data.transform || {});
  state.workspace.add(light);
  selectObject(light);
  renderTree();
}

function applyTransform(object, transform = {}) {
  const position = transform.position || {};
  const rotation = transform.rotation || {};
  const scale = transform.scale || {};
  if (position.x !== undefined) object.position.x = position.x;
  if (position.y !== undefined) object.position.y = position.y;
  if (position.z !== undefined) object.position.z = position.z;
  if (rotation.x !== undefined) object.rotation.x = rotation.x;
  if (rotation.y !== undefined) object.rotation.y = rotation.y;
  if (rotation.z !== undefined) object.rotation.z = rotation.z;
  if (scale.x !== undefined) object.scale.x = scale.x;
  if (scale.y !== undefined) object.scale.y = scale.y;
  if (scale.z !== undefined) object.scale.z = scale.z;
}

function selectObject(object) {
  state.selected = object;
  if (object) {
    state.transform.attach(object);
    document.getElementById('studio-selected-kind').textContent = object.userData?.kind?.toUpperCase() || 'INSTANCE';
  }
  renderProperties();
  updateCoordinates();
  renderTree();
}

function deleteSelected() {
  if (!state.selected || !state.workspace) return;
  state.workspace.remove(state.selected);
  state.transform.detach();
  state.selected = null;
  document.getElementById('studio-selected-kind').textContent = 'None';
  renderProperties();
  updateCoordinates();
  renderTree();
  setSaveState('Unsaved');
}

function createNestedTree(object, depth = 0) {
  const wrapper = document.createElement('div');
  wrapper.className = 'tree-node';
  wrapper.style.marginLeft = `${depth * 12}px`;

  const row = document.createElement('button');
  row.type = 'button';
  row.className = `tree-entry${state.selected === object ? ' selected' : ''}`;
  row.innerHTML = `<span>${object.userData?.kind === 'light' ? '◉' : object.userData?.kind === 'group' ? '▣' : '◌'} ${object.name}</span><span class="tree-actions">×</span>`;
  row.addEventListener('click', (event) => {
    if (event.target.matches('.tree-actions')) return;
    selectObject(object);
  });

  const remove = row.querySelector('.tree-actions');
  remove.addEventListener('click', (event) => {
    event.stopPropagation();
    const parent = object.parent;
    if (parent) parent.remove(object);
    if (state.selected === object) { state.selected = null; }
    renderTree();
    renderProperties();
    setSaveState('Unsaved');
  });

  wrapper.appendChild(row);
  if (object.children && object.children.length) {
    const children = document.createElement('div');
    object.children.forEach((child) => {
      if (child.userData?.editable !== false) children.appendChild(createNestedTree(child, depth + 1));
    });
    wrapper.appendChild(children);
  }
  return wrapper;
}

function renderTree() {
  const tree = document.getElementById('studio-scene-tree');
  tree.innerHTML = '';
  if (!state.workspace) return;
  const root = document.createElement('div');
  root.className = 'tree-root-box';
  root.appendChild(createNestedTree(state.workspace, 0));
  tree.appendChild(root);
}

function renderProperties() {
  const container = document.getElementById('studio-properties');
  container.innerHTML = '';
  if (!state.selected) {
    container.innerHTML = '<div class="empty-state">Select an instance to inspect its properties.</div>';
    return;
  }

  const object = state.selected;
  const addField = (label, value, onChange, type = 'number') => {
    const row = document.createElement('label');
    row.className = 'property-row';
    const title = document.createElement('span');
    title.textContent = label;
    const input = document.createElement('input');
    input.type = type;
    input.value = type === 'number' ? Number(value).toFixed(2) : value;
    if (type === 'number') {
      input.step = '0.1';
      input.addEventListener('change', () => {
        const parsed = Number(input.value);
        if (Number.isFinite(parsed)) onChange(parsed);
      });
    } else {
      input.addEventListener('change', () => onChange(input.value));
    }
    row.append(title, input);
    container.appendChild(row);
  };

  const section = document.createElement('div');
  section.className = 'property-section';
  section.innerHTML = '<h4>Appearance</h4>';
  const appearance = document.createElement('div');
  appearance.className = 'property-group';
  appearance.appendChild(addPropertyField('Name', object.name, (value) => { object.name = value; renderTree(); }, 'text'));
  if (object.material?.color || object.userData?.material) {
    const colorValue = object.material ? `#${object.material.color.getHexString()}` : object.userData.material;
    appearance.appendChild(addPropertyField('Color', colorValue, (value) => {
      if (object.material && object.material.color) object.material.color.set(value);
      object.userData.material = value;
    }, 'color'));
  }
  appearance.appendChild(addPropertyField('Material', object.userData?.material || 'Standard', (value) => {
    object.userData.material = value;
    if (object.material) {
      if (value === 'Neon') object.material.emissive = new THREE.Color('#6ee7ff');
      if (value === 'Glass') object.material.transparent = true; object.material.opacity = 0.45;
      if (value === 'Matte') object.material.transparent = false;
    }
  }, 'text'));
  appearance.appendChild(addPropertyField('Transparency', object.material?.opacity ?? 0, (value) => {
    if (object.material) {
      object.material.transparent = true;
      object.material.opacity = Math.min(Math.max(value, 0), 1);
    }
  }));
  section.appendChild(appearance);
  container.appendChild(section);

  const transformSection = document.createElement('div');
  transformSection.className = 'property-section';
  transformSection.innerHTML = '<h4>Transform</h4>';
  const transformGroup = document.createElement('div');
  transformGroup.className = 'property-group';
  for (const axis of ['x', 'y', 'z']) {
    transformGroup.appendChild(addPropertyField(`Position ${axis.toUpperCase()}`, object.position[axis], (value) => { object.position[axis] = value; updateCoordinates(); }, 'number'));
    transformGroup.appendChild(addPropertyField(`Rotation ${axis.toUpperCase()}`, THREE.MathUtils.radToDeg(object.rotation[axis]), (value) => { object.rotation[axis] = THREE.MathUtils.degToRad(value); }, 'number'));
    transformGroup.appendChild(addPropertyField(`Scale ${axis.toUpperCase()}`, object.scale[axis], (value) => { object.scale[axis] = value; }, 'number'));
  }
  transformSection.appendChild(transformGroup);
  container.appendChild(transformSection);

  const behaviorSection = document.createElement('div');
  behaviorSection.className = 'property-section';
  behaviorSection.innerHTML = '<h4>Behavior</h4>';
  const behaviorGroup = document.createElement('div');
  behaviorGroup.className = 'property-group';
  behaviorGroup.appendChild(addPropertyField('Anchored', object.userData?.anchored ? 'true' : 'false', (value) => {
    object.userData.anchored = String(value).toLowerCase() === 'true';
  }, 'text'));
  behaviorGroup.appendChild(addPropertyField('CanCollide', object.userData?.canCollide ? 'true' : 'false', (value) => {
    object.userData.canCollide = String(value).toLowerCase() === 'true';
  }, 'text'));
  behaviorSection.appendChild(behaviorGroup);
  container.appendChild(behaviorSection);

  const dataSection = document.createElement('div');
  dataSection.className = 'property-section';
  dataSection.innerHTML = '<h4>Data</h4>';
  const dataGroup = document.createElement('div');
  dataGroup.className = 'property-group';
  dataGroup.appendChild(addPropertyField('Tag', object.userData?.tag || object.name, (value) => { object.userData.tag = value; }, 'text'));
  dataGroup.appendChild(addPropertyField('Custom Name', object.name, (value) => { object.name = value; renderTree(); }, 'text'));
  dataSection.appendChild(dataGroup);
  container.appendChild(dataSection);

  const scriptButton = document.createElement('button');
  scriptButton.type = 'button';
  scriptButton.className = 'primary-btn full';
  scriptButton.textContent = 'Open Script Link';
  scriptButton.addEventListener('click', () => {
    const file = state.scriptFiles[0] || createScriptFile(`${object.name}Script`);
    state.selectedScript = file;
    document.getElementById('studio-script').value = file.content;
    renderScriptFiles();
  });
  container.appendChild(scriptButton);

  function addPropertyField(label, value, onChange, type = 'text') {
    const row = document.createElement('label');
    row.className = 'property-row';
    const title = document.createElement('span');
    title.textContent = label;
    const input = document.createElement('input');
    input.type = type;
    input.value = String(value ?? '');
    if (type === 'number') {
      input.step = '0.1';
      input.addEventListener('change', () => { const parsed = Number(input.value); if (Number.isFinite(parsed)) onChange(parsed); });
    } else {
      input.addEventListener('change', () => onChange(input.value));
    }
    row.append(title, input);
    return row;
  }
}

function updateCoordinates() {
  const el = document.getElementById('studio-coordinates');
  if (!state.selected) {
    el.textContent = 'X 0.00   Y 0.00   Z 0.00';
    return;
  }
  const { x, y, z } = state.selected.position;
  el.textContent = `X ${x.toFixed(2)}   Y ${y.toFixed(2)}   Z ${z.toFixed(2)}`;
}

function buildAssetLibrary() {
  const list = document.getElementById('asset-category-list');
  const categories = [...new Set(assetLibrary.map((asset) => asset.category))];
  list.innerHTML = '';
  categories.forEach((category) => {
    const label = document.createElement('div');
    label.className = 'asset-category';
    label.textContent = category;
    const items = document.createElement('div');
    items.className = 'asset-items';
    assetLibrary.filter((asset) => asset.category === category).forEach((asset) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'asset-item';
      item.draggable = true;
      item.textContent = asset.name;
      item.dataset.asset = JSON.stringify(asset);
      item.addEventListener('dragstart', (event) => {
        event.dataTransfer.setData('application/json', JSON.stringify(asset));
      });
      item.addEventListener('click', () => {
        if (asset.kind === 'light') addLight({ color: asset.color, name: asset.name });
        else if (asset.kind === 'rig') addRig({ name: asset.name });
        else if (asset.kind === 'sphere') addMesh('sphere', { name: asset.name, color: asset.color });
        else addMesh('cube', { name: asset.name, color: asset.color });
      });
      items.appendChild(item);
    });
    list.appendChild(label);
    list.appendChild(items);
  });

  const search = document.getElementById('asset-search');
  search.addEventListener('input', (event) => {
    state.assetSearch = event.target.value.toLowerCase();
    list.querySelectorAll('.asset-item').forEach((item) => {
      const name = item.textContent.toLowerCase();
      item.style.display = name.includes(state.assetSearch) ? 'block' : 'none';
    });
  });

  const viewport = document.getElementById('studio-viewport');
  viewport.addEventListener('dragover', (event) => event.preventDefault());
  viewport.addEventListener('drop', (event) => {
    event.preventDefault();
    const payload = event.dataTransfer.getData('application/json');
    if (!payload) return;
    const asset = JSON.parse(payload);
    if (asset.kind === 'light') addLight({ color: asset.color, name: asset.name, transform: { position: { x: 0, y: 3, z: 0 } } });
    else if (asset.kind === 'rig') addRig({ name: asset.name, transform: { position: { x: 0, y: 0, z: 0 }} });
    else if (asset.kind === 'sphere') addMesh('sphere', { name: asset.name, color: asset.color, transform: { position: { x: 0, y: 2, z: 0 } } });
    else addMesh('cube', { name: asset.name, color: asset.color, transform: { position: { x: 0, y: 2, z: 0 } } });
  });
}

function initScene() {
  const container = document.getElementById('studio-viewport');
  state.scene = new THREE.Scene();
  state.scene.background = new THREE.Color('#101822');

  const hemi = new THREE.HemisphereLight(0xc4b5fd, 0x0d1522, 1.8);
  state.scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(5, 10, 5);
  state.scene.add(sun);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: '#1d2435', metalness: 0.25, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1;
  state.scene.add(floor);

  const grid = new THREE.GridHelper(40, 40, 0x6d5ef7, 0x2a3146);
  state.scene.add(grid);

  setupSceneRoots();

  state.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
  state.camera.position.set(7.5, 6, 10.5);

  state.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  state.renderer.shadowMap.enabled = true;
  state.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  container.appendChild(state.renderer.domElement);

  state.controls = new OrbitControls(state.camera, state.renderer.domElement);
  state.controls.enableDamping = true;
  state.controls.target.set(0, 0.5, 0);

  state.transform = new TransformControls(state.camera, state.renderer.domElement);
  state.scene.add(state.transform);
  state.transform.addEventListener('dragging-changed', (event) => { state.controls.enabled = !event.value; });
  state.transform.addEventListener('objectChange', () => {
    updateCoordinates();
    renderProperties();
    setSaveState('Unsaved');
  });

  state.renderer.domElement.addEventListener('pointerdown', (event) => {
    const rect = state.renderer.domElement.getBoundingClientRect();
    state.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    state.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    state.raycaster.setFromCamera(state.pointer, state.camera);
    const hits = state.raycaster.intersectObjects(state.workspace.children, true);
    const hit = hits[0];
    if (!hit) {
      state.transform.detach();
      state.selected = null;
      renderProperties();
      updateCoordinates();
      return;
    }
    const target = hit.object.userData?.editable ? hit.object : hit.object.parent;
    if (target) selectObject(target);
  });

  document.querySelectorAll('[data-tool]').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('[data-tool]').forEach((item) => item.classList.toggle('active', item === button));
      const selectedMode = button.dataset.tool;
      if (selectedMode === 'select') {
        state.transform.showX = false; state.transform.showY = false; state.transform.showZ = false; state.transform.setMode('translate');
      } else {
        state.transform.showX = true; state.transform.showY = true; state.transform.showZ = true;
        state.transform.setMode(selectedMode);
      }
    });
  });

  window.addEventListener('resize', resizeRenderer);
  addMesh('cube', { name: 'Block', color: '#7c4dff', transform: { position: { x: 0, y: 0, z: 0 } } });
  addLight({ name: 'VoidLight', color: '#f7d77a', transform: { position: { x: 5, y: 3, z: 2 } } });
  renderTree();
  renderProperties();
  resizeRenderer();
  document.getElementById('studio-viewport-loading').remove();

  const animate = () => {
    requestAnimationFrame(animate);
    state.controls.update();
    state.renderer.render(state.scene, state.camera);
  };
  animate();
}

function resizeRenderer() {
  const container = document.getElementById('studio-viewport');
  if (!container || !state.renderer || !state.camera) return;
  const width = container.clientWidth;
  const height = container.clientHeight;
  state.camera.aspect = width / height;
  state.camera.updateProjectionMatrix();
  state.renderer.setSize(width, height, false);
}

function setSaveState(value) {
  document.getElementById('studio-save-state').textContent = value;
}

function bindGlobalEvents() {
  document.getElementById('studio-back-home').addEventListener('click', () => location.href = '/dashboard.html');
  document.getElementById('studio-save-scene').addEventListener('click', saveScene);
  document.getElementById('studio-open-scene').addEventListener('click', loadScene);
  document.getElementById('studio-add-cube').addEventListener('click', () => addMesh('cube', { name: 'Part', color: '#7c4dff' }));
  document.getElementById('studio-add-sphere').addEventListener('click', () => addMesh('sphere', { name: 'Sphere', color: '#82e1ff' }));
  document.getElementById('studio-add-light').addEventListener('click', () => addLight({ name: 'Light', color: '#f7d77a' }));
  document.getElementById('studio-add-rig').addEventListener('click', () => addRig({ name: 'Rig' }));
  document.getElementById('studio-add-folder').addEventListener('click', () => addGroup({ name: 'Folder' }));
  document.getElementById('studio-add-object').addEventListener('click', () => addMesh('cube', { name: 'Part', color: '#7c4dff' }));
  document.getElementById('studio-delete-selection').addEventListener('click', deleteSelected);
  document.getElementById('studio-group-selected').addEventListener('click', () => {
    if (!state.selected) return;
    const group = new THREE.Group();
    group.name = `${state.selected.name}Group`;
    group.userData = { editable: true, kind: 'group', anchored: false, canCollide: false, tag: group.name, material: '#7c4dff', custom: {} };
    state.selected.parent.add(group);
    state.selected.parent.remove(state.selected);
    group.add(state.selected);
    state.selected = group;
    renderTree();
    renderProperties();
    setSaveState('Unsaved');
  });
  document.getElementById('studio-ungroup-selected').addEventListener('click', () => {
    if (!state.selected || state.selected.userData?.kind !== 'group') return;
    const parent = state.selected.parent;
    const children = [...state.selected.children];
    children.forEach((child) => state.selected.remove(child));
    parent.add(...children);
    parent.remove(state.selected);
    state.selected = children[0] || null;
    renderTree();
    renderProperties();
    setSaveState('Unsaved');
  });
  document.getElementById('studio-anchor-toggle').addEventListener('click', () => {
    if (!state.selected) return;
    state.selected.userData.anchored = !state.selected.userData.anchored;
    renderProperties();
    setSaveState('Unsaved');
  });
  document.getElementById('studio-material-manager').addEventListener('click', () => {
    if (!state.selected) return;
    const next = prompt('Choose a material: Standard, Neon, Glass, Matte', state.selected.userData.material || 'Standard');
    if (!next) return;
    state.selected.userData.material = next;
    renderProperties();
  });
  document.getElementById('studio-game-settings').addEventListener('click', () => {
    const worldName = prompt('World name', 'Anti-Null World') || 'Anti-Null World';
    const worldDescription = prompt('World description', 'A cinematic creator realm.') || 'A cinematic creator realm.';
    state.scene.userData = { worldName, worldDescription };
    document.getElementById('studio-scene-name').textContent = worldName;
  });
  document.getElementById('studio-new-script-file').addEventListener('click', () => createScriptFile('Script'));
  document.getElementById('studio-run-script').addEventListener('click', runScript);
  document.getElementById('studio-import-model').addEventListener('click', importModel);
  document.getElementById('studio-script').addEventListener('input', (event) => {
    if (state.selectedScript) state.selectedScript.content = event.target.value;
  });
  document.addEventListener('keydown', (event) => {
    if (event.target.matches('input, textarea, select')) return;
    const map = { q: 'select', w: 'translate', e: 'rotate', r: 'scale' };
    if (map[event.key.toLowerCase()]) {
      const button = document.querySelector(`[data-tool="${map[event.key.toLowerCase()]}"]`);
      button?.click();
    }
    if (event.key === 'Delete' || event.key === 'Backspace') deleteSelected();
  });
}

async function saveScene() {
  const worldData = {
    format: 'anti-null-scene',
    version: 2,
    savedAt: new Date().toISOString(),
    worldName: document.getElementById('studio-scene-name').textContent,
    scripts: state.scriptFiles,
    scene: state.scene.toJSON()
  };
  const blob = new Blob([JSON.stringify(worldData)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${(document.getElementById('studio-scene-name').textContent || 'AntiNullScene').replace(/\s+/g, '_')}.anull`;
  link.click();
  URL.revokeObjectURL(link.href);
  setSaveState('Saved');
}

async function loadScene() {
  try {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.anull';
    const file = await new Promise((resolve) => {
      input.onchange = () => resolve(input.files?.[0] || null);
      input.click();
    });
    if (!file) return;
    const parsed = JSON.parse(await file.text());
    const data = parsed.scene || parsed;
    if (!data) throw new Error('Not a valid .anull scene.');
    const scene = new THREE.ObjectLoader().parse(data);
    while (state.scene.children.length) state.scene.remove(state.scene.children[0]);
    state.scene.add(scene);
    state.workspace = scene.getObjectByName('Workspace') || new THREE.Group();
    state.lighting = scene.getObjectByName('Lighting') || new THREE.Group();
    state.scriptsRoot = scene.getObjectByName('Scripts') || new THREE.Group();
    setupSceneRoots();
    state.scene.add(state.workspace, state.lighting, state.scriptsRoot);
    if (parsed.scripts) {
      state.scriptFiles = parsed.scripts;
      state.selectedScript = state.scriptFiles[0] || null;
      if (state.selectedScript) document.getElementById('studio-script').value = state.selectedScript.content;
    }
    state.selected = null;
    renderTree();
    renderProperties();
    updateCoordinates();
    setSaveState('Saved');
  } catch (error) {
    alert(error.message || 'Could not load scene.');
  }
}

async function importModel() {
  try {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.obj,.gltf,.glb';
    const file = await new Promise((resolve) => {
      input.onchange = () => resolve(input.files?.[0] || null);
      input.click();
    });
    if (!file) return;
    const url = URL.createObjectURL(file);
    let root;
    if (file.name.toLowerCase().endsWith('.obj')) {
      root = await new Promise((resolve, reject) => new OBJLoader().load(url, resolve, undefined, reject));
    } else {
      root = await new Promise((resolve, reject) => new GLTFLoader().load(url, (result) => resolve(result.scene), undefined, reject));
    }
    URL.revokeObjectURL(url);
    root.name = file.name;
    root.userData = { editable: true, kind: 'model', material: '#7c4dff', anchored: false, canCollide: true, tag: file.name };
    state.workspace.add(root);
    selectObject(root);
    renderTree();
    setSaveState('Unsaved');
  } catch (error) {
    alert(error.message || 'Could not import model.');
  }
}

function runScript() {
  const source = document.getElementById('studio-script').value;
  const language = document.getElementById('studio-script-language').value;
  const output = document.getElementById('studio-script-output');
  if (!source.trim()) return;
  if (language === 'lua') {
    output.textContent = 'Lua is enabled for later integration with Fengari. Script output is now displayed in the console.';
    return;
  }
  const workerCode = `self.onmessage = (event) => {
    const lines = [];
    const consoleApi = {
      log: (...args) => lines.push(args.map(String).join(' ')),
      warn: (...args) => lines.push(args.map(String).join(' ')),
      error: (...args) => lines.push(args.map(String).join(' '))
    };
    try {
      new Function('console', '"use strict";\n' + event.data)(consoleApi);
      postMessage({ lines });
    } catch (error) {
      postMessage({ lines: [...lines, error.message] });
    }
  }`;

  const blobUrl = URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' }));
  const worker = new Worker(blobUrl);
  const timer = setTimeout(() => {
    worker.terminate();
    output.textContent = 'Script execution timed out.';
  }, 2000);
  worker.onmessage = ({ data }) => {
    clearTimeout(timer);
    worker.terminate();
    URL.revokeObjectURL(blobUrl);
    output.textContent = data.lines.join('\n') || 'Script completed.';
  };
  worker.postMessage(source);
}

async function initialize() {
  try {
    const result = await api('/api/me');
    if (!result.user || !result.user.hasHammers) {
      alert('The Creator Hub requires the Creator\'s Hammer.');
      location.href = '/dashboard.html';
      return;
    }
    buildAssetLibrary();
    createScriptFile('MainScript');
    initScene();
    bindGlobalEvents();
    renderTree();
    renderProperties();
  } catch (_error) {
    sessionStorage.clear();
    location.replace('/');
  }
}

initialize();
