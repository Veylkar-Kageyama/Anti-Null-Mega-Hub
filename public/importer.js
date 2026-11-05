import * as THREE from 'three';
import { readEmulatorSaveState, serializeEmulatorSave } from './emulator-save.mjs';

const MAX_PLACE_FILE_BYTES = 5 * 1024 ** 3;
const PLACE_UPLOAD_CHUNK_BYTES = 8 * 1024 ** 2;
const MAX_PARTS = 600;
const MAX_ASSETS = 400;
const SUPPORTED_PARTS = new Set(['Part', 'MeshPart', 'WedgePart', 'CornerWedgePart', 'TrussPart', 'UnionOperation']);
const RESOURCE_CLASSES = new Set(['Script', 'LocalScript', 'ModuleScript', 'Sound', 'Decal', 'Texture', 'MeshPart', 'SpecialMesh', 'Animation']);

const make = (tag, className = '', text = '') => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex > 0 ? 1 : 0)} ${units[unitIndex]}`;
}

function uploadPlaceFile(file, onProgress) {
  const uploadId = crypto.randomUUID();
  const totalChunks = Math.ceil(file.size / PLACE_UPLOAD_CHUNK_BYTES);
  const token = sessionStorage.getItem('antiNullToken');
  const authorization = token ? `Bearer ${token}` : '';
  return (async () => {
    try {
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
        const start = chunkIndex * PLACE_UPLOAD_CHUNK_BYTES;
        const chunk = file.slice(start, Math.min(start + PLACE_UPLOAD_CHUNK_BYTES, file.size));
        const result = await new Promise((resolve, reject) => {
          const request = new XMLHttpRequest();
          request.open('POST', '/api/imports/place-chunk');
          request.responseType = 'json';
          if (authorization) request.setRequestHeader('Authorization', authorization);
          request.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable) {
              const chunkLoaded = Math.min(chunk.size, event.loaded / event.total * chunk.size);
              onProgress(start + chunkLoaded, file.size);
            }
          });
          request.upload.addEventListener('load', () => {
            onProgress(start + chunk.size, file.size, chunkIndex === totalChunks - 1);
          });
          request.addEventListener('load', () => {
            if (request.status >= 200 && request.status < 300) resolve(request.response);
            else if (request.status === 413) reject(new Error('The upload service rejected an 8 MB file chunk (HTTP 413).'));
            else reject(new Error(request.response?.error || `Binary import failed with HTTP ${request.status}.`));
          });
          request.addEventListener('error', () => reject(new Error('Network error while uploading the binary place.')));
          request.addEventListener('abort', () => reject(new Error('Binary place upload was cancelled.')));
          const formData = new FormData();
          formData.append('uploadId', uploadId);
          formData.append('originalName', file.name);
          formData.append('totalSize', String(file.size));
          formData.append('chunkIndex', String(chunkIndex));
          formData.append('totalChunks', String(totalChunks));
          formData.append('file', chunk, file.name);
          request.send(formData);
        });
        if (chunkIndex === totalChunks - 1) {
          if (!result?.project) throw new Error('The server did not return the imported place.');
          return result.project;
        }
      }
    } catch (error) {
      try {
        const headers = authorization ? { Authorization: authorization } : {};
        await fetch(`/api/imports/place-chunk/${encodeURIComponent(uploadId)}`, { method: 'DELETE', headers });
      } catch (cleanupError) {
        console.warn(`Place upload cleanup request failed: ${cleanupError.message}`);
      }
      throw error;
    }
  })();
}

function child(parent, name) {
  return Array.from(parent?.children || []).find((item) => item.tagName === name) || null;
}

function numberChild(parent, name, fallback) {
  const value = Number(child(parent, name)?.textContent);
  return Number.isFinite(value) ? value : fallback;
}

function propertyMap(item) {
  const properties = child(item, 'Properties');
  const values = new Map();
  for (const property of Array.from(properties?.children || [])) {
    const name = property.getAttribute('name');
    if (name) values.set(name, property);
  }
  return values;
}

function propertyText(properties, name, fallback = '') {
  return properties.has(name) ? properties.get(name).textContent.trim() : fallback;
}

function parseVector(node, names, fallback) {
  if (!node) return [...fallback];
  return names.map((name, index) => numberChild(node, name, fallback[index]));
}

function parseColor(properties) {
  const color3 = properties.get('Color3');
  if (color3) {
    const red = Math.round(Math.max(0, Math.min(1, numberChild(color3, 'R', 0.6))) * 255);
    const green = Math.round(Math.max(0, Math.min(1, numberChild(color3, 'G', 0.6))) * 255);
    const blue = Math.round(Math.max(0, Math.min(1, numberChild(color3, 'B', 0.6))) * 255);
    return `#${[red, green, blue].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
  }
  const packed = properties.get('Color3uint8');
  if (packed) {
    const value = Number(packed.textContent);
    if (Number.isInteger(value) && value >= 0) {
      const integer = value >>> 0;
      return `#${[(integer >> 16) & 255, (integer >> 8) & 255, integer & 255].map((part) => part.toString(16).padStart(2, '0')).join('')}`;
    }
  }
  return '#999999';
}

function parseCFrame(node) {
  if (!node) return { position: [0, 0, 0], rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1] };
  const rotation = [
    numberChild(node, 'R00', 1), numberChild(node, 'R01', 0), numberChild(node, 'R02', 0),
    numberChild(node, 'R10', 0), numberChild(node, 'R11', 1), numberChild(node, 'R12', 0),
    numberChild(node, 'R20', 0), numberChild(node, 'R21', 0), numberChild(node, 'R22', 1)
  ];
  return { position: parseVector(node, ['X', 'Y', 'Z'], [0, 0, 0]), rotation };
}

function readAssetReference(value) {
  const text = String(value || '').trim();
  if (!text || text === 'null' || text === 'rbxasset://') return '';
  return text.slice(0, 200);
}

function classifyResource(instance, properties) {
  const className = instance.getAttribute('class') || 'Instance';
  const name = propertyText(properties, 'Name', className).slice(0, 120);
  if (['Script', 'LocalScript', 'ModuleScript'].includes(className)) {
    return { kind: 'script', name, reference: 'Source omitted; scripts are never executed.' };
  }
  const propertiesByClass = [
    [['Sound'], 'SoundId', 'audio'],
    [['Decal', 'Texture'], 'Texture', 'image'],
    [['MeshPart', 'SpecialMesh'], 'MeshId', 'mesh'],
    [['Animation'], 'AnimationId', 'animation']
  ];
  const assets = [];
  for (const [classes, propertyName, kind] of propertiesByClass) {
    if (!classes.includes(className)) continue;
    const reference = readAssetReference(propertyText(properties, propertyName));
    if (reference) assets.push({ kind, name, reference });
    if (className === 'MeshPart' || className === 'SpecialMesh') {
      const texture = readAssetReference(propertyText(properties, 'TextureID') || propertyText(properties, 'TextureId'));
      if (texture) assets.push({ kind: 'image', name: `${name} texture`, reference: texture });
    }
  }
  return assets;
}

export function parseRbxlx(xml, sourceName) {
  if (typeof xml !== 'string' || xml.length > MAX_PLACE_FILE_BYTES) throw new Error('The XML place file is empty or exceeds the 5 GB limit.');
  if (/<!DOCTYPE/i.test(xml)) throw new Error('XML document types are not accepted in imported place files.');
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  if (document.querySelector('parsererror') || document.documentElement?.tagName !== 'roblox') {
    throw new Error('This is not a valid XML-format Roblox place. Choose a valid .rbxlx file or import a binary .rbxl separately.');
  }
  const instances = Array.from(document.getElementsByTagName('Item'));
  if (!instances.length) throw new Error('The place must contain at least one instance.');
  const scene = [];
  const resources = [];
  let scripts = 0;
  let sounds = 0;
  for (const instance of instances) {
    const className = instance.getAttribute('class') || 'Instance';
    const properties = propertyMap(instance);
    const name = propertyText(properties, 'Name', className).slice(0, 120);
    if (SUPPORTED_PARTS.has(className)) {
      if (scene.length >= MAX_PARTS) throw new Error(`This place has more than ${MAX_PARTS} renderable parts. Reduce the scene and export it again.`);
      const cframe = parseCFrame(properties.get('CFrame') || properties.get('WorldPivotData'));
      const positionNode = properties.get('Position');
      const sizeNode = properties.get('size') || properties.get('Size');
      const size = parseVector(sizeNode, ['X', 'Y', 'Z'], [4, 1, 2]);
      const shapeToken = Number(propertyText(properties, 'Shape', '1'));
      const shape = className === 'WedgePart' ? 'Wedge'
        : className === 'CornerWedgePart' ? 'CornerWedge'
          : shapeToken === 0 ? 'Ball' : shapeToken === 2 ? 'Cylinder' : 'Block';
      scene.push({
        name,
        className,
        position: positionNode ? parseVector(positionNode, ['X', 'Y', 'Z'], cframe.position) : cframe.position,
        size: size.map((value) => Math.max(0.05, Math.min(100000, value))),
        rotation: cframe.rotation,
        color: parseColor(properties),
        transparency: Math.max(0, Math.min(1, Number(propertyText(properties, 'Transparency', '0')) || 0)),
        shape
      });
    }
    if (RESOURCE_CLASSES.has(className)) {
      const found = classifyResource(instance, properties);
      resources.push(...found);
      if (className === 'Sound') sounds += 1;
      if (['Script', 'LocalScript', 'ModuleScript'].includes(className)) scripts += 1;
      if (resources.length > MAX_ASSETS) throw new Error(`This place has more than ${MAX_ASSETS} external or script references.`);
    }
  }
  const uniqueResources = [...new Map(resources.map((resource) => [`${resource.kind}:${resource.name}:${resource.reference}`, resource])).values()];
  const title = sourceName.replace(/\.(rbxlx|rbxl)$/i, '').slice(0, 80) || 'Imported Place';
  return {
    title,
    sourceName: sourceName.slice(0, 180),
    sourceFormat: 'rbxlx',
    scene,
    assets: uniqueResources,
    summary: { instances: instances.length, parts: scene.length, scripts, sounds }
  };
}

function renderPreview(canvasHost, place, playButton, playHelp, restoredState = null) {
  canvasHost.replaceChildren();
  playButton.disabled = !place.scene.length;
  playButton.textContent = 'WALK PLACE';
  playHelp.textContent = 'Preview controls: drag to orbit, scroll to zoom. Walk mode: WASD / arrows to move, Space to jump, drag to look.';
  if (!place.scene.length) {
    canvasHost.append(make('p', 'import-empty-preview', 'No supported physical parts were found in this place.'));
    return () => {};
  }
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#111720');
  const camera = new THREE.PerspectiveCamera(52, 1, 0.05, 1500);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  canvasHost.append(renderer.domElement);
  scene.add(new THREE.HemisphereLight('#d5d9ee', '#242b35', 2));
  const sun = new THREE.DirectionalLight('#ffffff', 2.2);
  sun.position.set(-80, 120, 90);
  sun.castShadow = true;
  scene.add(sun);
  const root = new THREE.Group();
  scene.add(root);
  const bounds = new THREE.Box3();
  const objects = [];
  for (const part of place.scene) {
    const geometry = part.shape === 'Ball' ? new THREE.SphereGeometry(0.5, 12, 8)
      : part.shape === 'Cylinder' ? new THREE.CylinderGeometry(0.5, 0.5, 1, 12)
        : new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      color: part.color,
      roughness: 0.84,
      transparent: part.transparency > 0,
      opacity: 1 - part.transparency
    }));
    mesh.name = part.name;
    mesh.position.fromArray(part.position);
    mesh.scale.fromArray(part.size);
    const rotation = part.rotation;
    const matrix = new THREE.Matrix4().set(
      rotation[0], rotation[1], rotation[2], 0,
      rotation[3], rotation[4], rotation[5], 0,
      rotation[6], rotation[7], rotation[8], 0,
      0, 0, 0, 1
    );
    mesh.quaternion.setFromRotationMatrix(matrix);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    bounds.expandByObject(mesh);
    objects.push(mesh);
  }
  const center = bounds.getCenter(new THREE.Vector3());
  root.position.sub(center);
  root.updateMatrixWorld(true);
  const size = bounds.getSize(new THREE.Vector3());
  const maxExtent = Math.max(size.x, size.y, size.z, 12);
  camera.near = Math.max(0.01, maxExtent / 100000);
  camera.far = Math.max(1500, maxExtent * 8);
  camera.updateProjectionMatrix();
  let yaw = restoredState?.yaw ?? Math.PI / 4;
  let pitch = restoredState?.pitch ?? 0.35;
  let distance = restoredState?.distance ?? maxExtent * 2.2;
  let dragging = false;
  let lastPointer = null;
  let playing = false;
  let verticalVelocity = 0;
  let jumpRequested = false;
  const keys = new Set();
  const platforms = place.scene.filter((part) =>
    part.size[0] >= 12 && part.size[2] >= 12 && part.size[1] <= Math.min(part.size[0], part.size[2]) * 0.2
  );
  platforms.sort((a, b) => b.size[0] * b.size[2] - a.size[0] * a.size[2]);
  const spawnPlatform = platforms[0];
  const spawnPosition = new THREE.Vector3(
    (spawnPlatform?.position[0] ?? center.x) - center.x,
    (spawnPlatform ? spawnPlatform.position[1] + spawnPlatform.size[1] / 2 : center.y) - center.y,
    (spawnPlatform?.position[2] ?? center.z) - center.z
  );
  const player = new THREE.Group();
  const avatar = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.55, 1.35, 4, 8),
    new THREE.MeshStandardMaterial({ color: '#67e8d0', roughness: 0.72 })
  );
  avatar.position.y = 1.23;
  avatar.castShadow = true;
  player.add(avatar);
  player.position.fromArray(restoredState?.position || spawnPosition.toArray());
  player.visible = restoredState?.playing === true;
  playing = player.visible;
  playButton.textContent = playing ? 'STOP WALKING' : 'WALK PLACE';
  if (playing) playHelp.textContent = 'WASD / arrows: move · Space: jump · drag: look · scroll: camera distance';
  scene.add(player);
  const groundRay = new THREE.Raycaster();
  groundRay.far = 6;
  let frame = 0;
  let running = true;
  let previous = 0;

  const resize = () => {
    const { width, height } = canvasHost.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  const onPointerDown = (event) => {
    if (event.button !== 0) return;
    dragging = true;
    lastPointer = { x: event.clientX, y: event.clientY };
    renderer.domElement.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event) => {
    if (!dragging || !lastPointer) return;
    yaw += (event.clientX - lastPointer.x) * 0.006;
    pitch = THREE.MathUtils.clamp(pitch + (event.clientY - lastPointer.y) * 0.004, -0.2, 1.2);
    lastPointer = { x: event.clientX, y: event.clientY };
  };
  const onPointerUp = () => { dragging = false; lastPointer = null; };
  const onWheel = (event) => {
    distance = THREE.MathUtils.clamp(distance + event.deltaY * 0.4, maxExtent * 0.12, maxExtent * 8);
  };
  const onKeyDown = (event) => {
    if (!playing) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) event.preventDefault();
    keys.add(event.key.toLowerCase());
    if (event.key === ' ' && !event.repeat) jumpRequested = true;
  };
  const onKeyUp = (event) => keys.delete(event.key.toLowerCase());
  const onBlur = () => {
    keys.clear();
    jumpRequested = false;
  };
  const stopPlaying = () => {
    playing = false;
    keys.clear();
    jumpRequested = false;
    player.visible = false;
    playButton.textContent = 'WALK PLACE';
    playHelp.textContent = 'Preview controls: drag to orbit, scroll to zoom. Walk mode: WASD / arrows to move, Space to jump, drag to look.';
  };
  const togglePlaying = () => {
    playing = !playing;
    keys.clear();
    jumpRequested = false;
    if (playing) {
      player.position.copy(spawnPosition);
      verticalVelocity = 0;
      player.visible = true;
      playButton.textContent = 'STOP WALKING';
      playHelp.textContent = 'WASD / arrows: move · Space: jump · drag: look · scroll: camera distance';
    } else {
      stopPlaying();
    }
  };
  playButton.addEventListener('click', togglePlaying);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerup', onPointerUp);
  renderer.domElement.addEventListener('pointercancel', onPointerUp);
  renderer.domElement.addEventListener('wheel', onWheel, { passive: true });
  const observer = new ResizeObserver(resize);
  observer.observe(canvasHost);
  resize();
  const animate = (now) => {
    if (!running) return;
    const delta = Math.min((now - previous) / 1000, 0.05) || 1 / 60;
    previous = now;
    let target = new THREE.Vector3();
    if (playing) {
      const forwardX = -Math.cos(yaw);
      const forwardZ = -Math.sin(yaw);
      const rightX = -forwardZ;
      const rightZ = forwardX;
      let moveX = 0;
      let moveZ = 0;
      if (keys.has('w') || keys.has('arrowup')) { moveX += forwardX; moveZ += forwardZ; }
      if (keys.has('s') || keys.has('arrowdown')) { moveX -= forwardX; moveZ -= forwardZ; }
      if (keys.has('d') || keys.has('arrowright')) { moveX += rightX; moveZ += rightZ; }
      if (keys.has('a') || keys.has('arrowleft')) { moveX -= rightX; moveZ -= rightZ; }
      const magnitude = Math.hypot(moveX, moveZ);
      if (magnitude) {
        const speed = keys.has('shift') ? 24 : 12;
        player.position.x += moveX / magnitude * speed * delta;
        player.position.z += moveZ / magnitude * speed * delta;
      }
      if (jumpRequested && Math.abs(verticalVelocity) < 0.01) verticalVelocity = 15;
      jumpRequested = false;
      verticalVelocity -= 32 * delta;
      player.position.y += verticalVelocity * delta;
      const rayOrigin = player.position.clone().add(new THREE.Vector3(0, 3, 0));
      groundRay.set(rayOrigin, new THREE.Vector3(0, -1, 0));
      const ground = groundRay.intersectObjects(root.children, false)
        .find((hit) => hit.object.visible && hit.point.y <= player.position.y + 2.9);
      if (ground && verticalVelocity <= 0 && player.position.y <= ground.point.y + 0.15) {
        player.position.y = ground.point.y;
        verticalVelocity = 0;
      }
      if (player.position.y < -maxExtent * 2) {
        player.position.copy(spawnPosition);
        verticalVelocity = 0;
      }
      target = player.position.clone().add(new THREE.Vector3(0, 1.3, 0));
    }
    const cameraDistance = playing ? THREE.MathUtils.clamp(distance * 0.008, 8, 24) : distance;
    camera.position.set(
      target.x + Math.cos(yaw) * Math.cos(pitch) * cameraDistance,
      target.y + Math.sin(pitch) * cameraDistance,
      target.z + Math.sin(yaw) * Math.cos(pitch) * cameraDistance
    );
    camera.lookAt(target);
    renderer.render(scene, camera);
    frame = window.requestAnimationFrame(animate);
  };
  frame = window.requestAnimationFrame(animate);
  const dispose = () => {
    running = false;
    window.cancelAnimationFrame(frame);
    observer.disconnect();
    playButton.removeEventListener('click', togglePlaying);
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    playButton.disabled = true;
    playButton.textContent = 'WALK PLACE';
    playHelp.textContent = '';
    renderer.domElement.removeEventListener('pointerdown', onPointerDown);
    renderer.domElement.removeEventListener('pointermove', onPointerMove);
    renderer.domElement.removeEventListener('pointerup', onPointerUp);
    renderer.domElement.removeEventListener('pointercancel', onPointerUp);
    renderer.domElement.removeEventListener('wheel', onWheel);
    scene.traverse((object) => {
      if (!object.isMesh) return;
      object.geometry.dispose();
      if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
      else object.material.dispose();
    });
    renderer.dispose();
  };
  dispose.getState = () => ({
    version: 1,
    position: player.position.toArray(),
    yaw,
    pitch,
    distance,
    playing
  });
  return dispose;
}

export function initializeImporter({ api } = {}) {
  const shell = document.querySelector('#import-shell');
  if (!shell) return;
  let place = null;
  let projectId = null;
  let runtimeState = null;
  let saveDirectory = null;
  let isSaving = false;
  let disposePreview = () => {};
  const heading = make('div', 'import-heading');
  const title = make('input', 'import-title');
  title.maxLength = 80;
  title.placeholder = 'Imported place name';
  title.setAttribute('aria-label', 'Imported project title');
  const toolbar = make('div', 'import-toolbar');
  const fileInput = make('input', 'import-file-input');
  fileInput.type = 'file';
  fileInput.accept = '.rbxl,.rbxlx,application/xml,text/xml';
  fileInput.setAttribute('aria-label', 'Choose Roblox Studio place file');
  const choose = make('button', 'primary-button circuit-cut', 'CHOOSE PLACE FILE');
  choose.type = 'button';
  const save = make('button', 'secondary-button circuit-cut', 'SAVE TO A-NULL');
  save.type = 'button';
  save.disabled = true;
  const chooseSaveFolder = make('button', 'secondary-button circuit-cut', 'CHOOSE LOCAL SAVE FOLDER');
  chooseSaveFolder.type = 'button';
  const saveRecovery = make('button', 'secondary-button circuit-cut', 'SAVE RECOVERY NOW');
  saveRecovery.type = 'button';
  saveRecovery.disabled = true;
  const loadRecovery = make('button', 'secondary-button circuit-cut', 'LOAD .RBXLX RECOVERY');
  loadRecovery.type = 'button';
  const status = make('p', 'import-status', 'Choose a .rbxl or .rbxlx place file to begin.');
  const saveStatus = make('p', 'import-save-status', 'Local recovery saves are available in the Windows desktop app.');
  saveStatus.setAttribute('role', 'status');
  saveStatus.setAttribute('aria-live', 'polite');
  const notice = make('p', 'import-notice', '.rbxl and .rbxlx uploads are limited to 5 GB and processed on the A‑Null server. The geometry-only walker shows up to 600 supported parts; up to 400 asset references are listed. Roblox scripts are not executed and linked media is not downloaded, so this is not a full Roblox game runtime.');
  const creatorGames = make('section', 'import-creator-games');
  creatorGames.append(
    make('h2', '', 'FIND THESE GAMES ON ROBLOX'),
    make('p', 'small muted', 'Bridger: WESTERN and AUT are not bundled or mirrored here. Use Roblox or an official creator link to play them; import only an authorized Studio export.')
  );
  const creatorGameLinks = make('div', 'import-creator-game-links');
  for (const name of ['Bridger: WESTERN', 'AUT (A Universal Time)']) {
    const link = make('a', 'secondary-button circuit-cut', `SEARCH ROBLOX: ${name}`);
    link.href = `https://www.roblox.com/search/experiences?${new URLSearchParams({ keyword: name })}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    creatorGameLinks.append(link);
  }
  creatorGames.append(creatorGameLinks);
  const catalogLink = make('a', 'secondary-button circuit-cut import-catalog-link', 'OPEN FILE SEARCH IN A NEW TAB ↗');
  catalogLink.href = '/catalog.html';
  catalogLink.target = '_blank';
  let catalogWindow = null;
  catalogLink.addEventListener('click', (event) => {
    event.preventDefault();
    catalogWindow = window.open(catalogLink.href, '_blank');
    if (!catalogWindow) {
      showMessage('Allow pop-ups to open the file catalog in a new tab.', true);
    }
  });
  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin || event.source !== catalogWindow ||
        event.data?.type !== 'anti-null-catalog-auth-request') return;
    catalogWindow.postMessage({
      type: 'anti-null-catalog-auth',
      token: sessionStorage.getItem('antiNullToken')
    }, window.location.origin);
  });
  const body = make('div', 'import-layout');
  const library = make('aside', 'import-library');
  const list = make('div', 'import-project-list');
  const previewColumn = make('section', 'import-preview-column');
  const previewControls = make('div', 'import-preview-controls');
  const playButton = make('button', 'secondary-button circuit-cut', 'WALK PLACE');
  playButton.type = 'button';
  playButton.disabled = true;
  const fullscreen = make('button', 'secondary-button circuit-cut', 'FULLSCREEN PREVIEW');
  fullscreen.type = 'button';
  fullscreen.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement === canvasHost) await document.exitFullscreen();
      else await canvasHost.requestFullscreen();
    } catch (error) {
      showMessage(`FULLSCREEN UNAVAILABLE: ${error.message}`, true);
    }
  });
  document.addEventListener('fullscreenchange', () => {
    fullscreen.textContent = document.fullscreenElement === canvasHost ? 'EXIT FULLSCREEN' : 'FULLSCREEN PREVIEW';
  });
  previewControls.append(playButton, fullscreen);
  const canvasHost = make('div', 'import-preview');
  const playHelp = make('p', 'import-play-help');
  const summary = make('div', 'import-summary');
  const resources = make('div', 'import-resources');
  heading.append(title);
  toolbar.append(choose, fileInput, save, chooseSaveFolder, saveRecovery, loadRecovery);
  library.append(make('h2', '', 'MY IMPORTS'), list);
  previewColumn.append(previewControls, canvasHost, playHelp, summary, resources);
  body.append(library, previewColumn);
  shell.append(heading, toolbar, status, saveStatus, notice, creatorGames, catalogLink, body);

  function showMessage(text, error = false) {
    status.textContent = text;
    status.classList.toggle('error', error);
  }

  function renderMetadata() {
    summary.replaceChildren();
    resources.replaceChildren();
    if (!place) {
      summary.append(make('p', 'import-empty-preview', 'Choose a place file or select a saved import to preview it.'));
      return;
    }
    const stats = [
      `INSTANCES ${place.summary.instances}`,
      place.summary.previewTruncated
        ? `PREVIEW PARTS ${place.summary.parts} OF ${place.summary.totalParts}`
        : `SUPPORTED PARTS ${place.summary.parts}`,
      `SCRIPTS OMITTED ${place.summary.scripts}`,
      `SOUNDS ${place.summary.sounds}`
    ];
    if (place.summary.omittedAssets > 0) stats.push(`ASSET REFERENCES OMITTED ${place.summary.omittedAssets}`);
    for (const value of stats) summary.append(make('span', 'import-stat', value));
    resources.append(make('h3', '', 'ASSET REFERENCES'));
    if (!place.assets.length) {
      resources.append(make('p', 'small muted', 'No linked media or scripts were found.'));
      return;
    }
    const listNode = make('ul', 'import-resource-list');
    for (const asset of place.assets) {
      const item = make('li');
      item.append(make('strong', '', asset.kind.toUpperCase()), make('span', '', asset.name), make('code', '', asset.reference));
      listNode.append(item);
    }
    resources.append(listNode);
  }

  function displayPlace(nextPlace, id = null) {
    disposePreview();
    place = nextPlace;
    projectId = id;
    runtimeState = place.runtimeSave || null;
    title.value = place.title;
    save.disabled = false;
    saveRecovery.disabled = !place.scene?.length || !window.antiNull?.saveEmulatorFile;
    disposePreview = renderPreview(canvasHost, place, playButton, playHelp, runtimeState);
    renderMetadata();
  }

  function updateSaveStatus(text, error = false) {
    saveStatus.textContent = text;
    saveStatus.classList.toggle('error', error);
  }

  async function saveRecoveryFile(automatic = false) {
    if (!place || !window.antiNull?.saveEmulatorFile) {
      updateSaveStatus('Local recovery saves require the Windows desktop app.', true);
      return;
    }
    if (!saveDirectory) {
      updateSaveStatus('Choose a local save folder to enable automatic recovery saves.', true);
      return;
    }
    if (isSaving) return;
    runtimeState = disposePreview.getState?.() || runtimeState;
    if (!runtimeState) {
      updateSaveStatus('The preview is not ready to save yet.', true);
      return;
    }
    isSaving = true;
    saveRecovery.disabled = true;
    chooseSaveFolder.disabled = true;
    loadRecovery.disabled = true;
    choose.disabled = true;
    fileInput.disabled = true;
    save.disabled = true;
    title.disabled = true;
    updateSaveStatus('SAVING RECOVERY FILE… PLEASE KEEP THE APP OPEN.');
    try {
      const content = serializeEmulatorSave(place, runtimeState);
      const result = await window.antiNull.saveEmulatorFile({ title: place.title, content });
      updateSaveStatus(`${automatic ? 'AUTO-SAVED' : 'SAVED'} ${result.fileName} · ${new Date(result.savedAt).toLocaleTimeString()}`);
    } catch (error) {
      updateSaveStatus(`RECOVERY SAVE FAILED: ${error.message}`, true);
    } finally {
      isSaving = false;
      saveRecovery.disabled = !place?.scene?.length || !window.antiNull?.saveEmulatorFile;
      chooseSaveFolder.disabled = false;
      loadRecovery.disabled = false;
      choose.disabled = false;
      fileInput.disabled = false;
      save.disabled = !place;
      title.disabled = false;
    }
  }

  chooseSaveFolder.addEventListener('click', async () => {
    if (!window.antiNull?.chooseEmulatorSaveFolder) {
      updateSaveStatus('Choose a local save folder from the Windows desktop app.', true);
      return;
    }
    try {
      const selected = await window.antiNull.chooseEmulatorSaveFolder();
      if (!selected) return;
      saveDirectory = selected;
      updateSaveStatus(`AUTO-SAVE FOLDER: ${saveDirectory} · SAVES EVERY 60 SECONDS`);
      saveRecovery.disabled = !place?.scene?.length;
    } catch (error) {
      updateSaveStatus(`SAVE FOLDER SELECTION FAILED: ${error.message}`, true);
    }
  });
  saveRecovery.addEventListener('click', () => saveRecoveryFile());
  loadRecovery.addEventListener('click', async () => {
    if (!window.antiNull?.loadEmulatorFile) {
      updateSaveStatus('Loading local recovery files requires the Windows desktop app.', true);
      return;
    }
    try {
      const selected = await window.antiNull.loadEmulatorFile();
      if (!selected) return;
      const recovered = parseRbxlx(selected.content, selected.fileName);
      const xmlDocument = new DOMParser().parseFromString(selected.content, 'application/xml');
      recovered.runtimeSave = readEmulatorSaveState(xmlDocument);
      if (!recovered.runtimeSave) throw new Error('This .rbxlx file has no A-Null emulator recovery data.');
      displayPlace(recovered);
      showMessage(`Recovered ${recovered.title} from ${selected.fileName}.`);
      updateSaveStatus(`RECOVERED ${selected.fileName} · READY TO AUTO-SAVE EVERY 60 SECONDS`);
    } catch (error) {
      updateSaveStatus(`RECOVERY LOAD FAILED: ${error.message}`, true);
    }
  });

  async function loadProjects() {
    list.replaceChildren(make('p', 'small muted', 'Loading account imports…'));
    try {
      const { projects } = await api('/api/imports');
      list.replaceChildren();
      if (!projects.length) list.append(make('p', 'small muted', 'No saved imports yet.'));
      for (const project of projects) {
        const row = make('div', 'import-project-row');
        const open = make('button', 'import-project-open', project.title);
        open.type = 'button';
        open.addEventListener('click', async () => {
          try {
            const result = await api(`/api/imports/${encodeURIComponent(project.id)}`);
            displayPlace(result.project, result.project.id);
            showMessage(`Loaded ${result.project.title} from your A‑Null account.`);
          } catch (error) {
            showMessage(`Could not load import: ${error.message}`, true);
          }
        });
        const remove = make('button', 'import-project-remove', '×');
        remove.type = 'button';
        remove.setAttribute('aria-label', `Delete ${project.title}`);
        remove.addEventListener('click', async () => {
          try {
            await api(`/api/imports/${encodeURIComponent(project.id)}`, { method: 'DELETE' });
            if (projectId === project.id) {
              disposePreview();
              place = null;
              projectId = null;
              runtimeState = null;
              canvasHost.replaceChildren();
              title.value = '';
              save.disabled = true;
              saveRecovery.disabled = true;
              playButton.disabled = true;
              renderMetadata();
            }
            await loadProjects();
          } catch (error) {
            showMessage(`Could not delete import: ${error.message}`, true);
          }
        });
        row.append(open, remove);
        list.append(row);
      }
    } catch (error) {
      list.replaceChildren(make('p', 'small muted', 'Account imports could not be loaded.'));
      showMessage(`IMPORT LIBRARY UNAVAILABLE: ${error.message}`, true);
    }
  }

  choose.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (!/\.(rbxl|rbxlx)$/i.test(file.name)) {
      showMessage('Choose a .rbxl or .rbxlx Roblox Studio place file.', true);
      fileInput.value = '';
      return;
    }
    if (file.size > MAX_PLACE_FILE_BYTES) {
      showMessage('File exceeds the 5 GB import limit.', true);
      fileInput.value = '';
      return;
    }
    try {
      showMessage(`Uploading ${file.name} (${formatBytes(file.size)})…`);
      const project = await uploadPlaceFile(file, (loaded, total, decoding = false) => {
        if (decoding) showMessage(`Upload complete. Decoding ${file.name} on the server…`);
        else showMessage(`Uploading ${file.name}: ${formatBytes(loaded)} / ${formatBytes(total)} (${Math.floor(loaded / total * 100)}%)`);
      });
      displayPlace(project);
      showMessage(`Read ${file.name}. Walk the supported geometry; use local recovery for timed .rbxlx saves.`);
    } catch (error) {
      showMessage(`IMPORT FAILED: ${error.message}`, true);
    } finally {
      fileInput.value = '';
    }
  });

  title.addEventListener('input', () => {
    if (place) place.title = title.value.trim().slice(0, 80) || 'Imported Place';
  });
  save.addEventListener('click', async () => {
    if (!place) return;
    const project = { ...place, title: title.value.trim().slice(0, 80) || 'Imported Place' };
    save.disabled = true;
    try {
      const result = projectId
        ? await api(`/api/imports/${encodeURIComponent(projectId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(project) })
        : await api('/api/imports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(project) });
      displayPlace(result.project, result.project.id);
      showMessage(`Saved ${result.project.title} to your A‑Null account.`);
      await loadProjects();
    } catch (error) {
      showMessage(`SAVE FAILED: ${error.message}`, true);
    } finally {
      save.disabled = false;
    }
  });

  window.addEventListener('app:viewchange', (event) => {
    if (event.detail?.view === 'import') {
      if (place && !canvasHost.querySelector('canvas')) {
        disposePreview = renderPreview(canvasHost, place, playButton, playHelp, runtimeState);
      }
      loadProjects();
    } else if (place) {
      runtimeState = disposePreview.getState?.() || runtimeState;
      disposePreview();
      canvasHost.replaceChildren(make('p', 'import-empty-preview', 'Preview paused while you are away.'));
    }
  });

  window.addEventListener('beforeunload', (event) => {
    if (!isSaving) return;
    event.preventDefault();
    event.returnValue = '';
  });
  window.setInterval(() => {
    if (place && saveDirectory) saveRecoveryFile(true);
  }, 60_000);

  renderMetadata();
  if (window.antiNull?.getEmulatorSaveFolder) {
    window.antiNull.getEmulatorSaveFolder().then((directory) => {
      saveDirectory = directory;
      if (directory) updateSaveStatus(`AUTO-SAVE FOLDER: ${directory} · SAVES EVERY 60 SECONDS`);
      else updateSaveStatus('Choose a local save folder to enable automatic recovery saves.');
    }).catch((error) => updateSaveStatus(`SAVE FOLDER STATUS UNAVAILABLE: ${error.message}`, true));
  } else {
    chooseSaveFolder.disabled = true;
    loadRecovery.disabled = true;
    updateSaveStatus('Local recovery saves are available in the Windows desktop app.');
  }
  loadProjects();
}
