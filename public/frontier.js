import * as THREE from 'three';

const glyphs = ['●', '◆', '▲'];
const fauna = [
  { id: 'cinder-fox', name: 'Cinderfox', type: 'EMBER', body: '#a95b3d', accent: '#f0a36d', scale: 0.8, speed: 1.8, ears: true, tail: true },
  { id: 'mossback-grazer', name: 'Mossback Grazer', type: 'MOSS', body: '#62775a', accent: '#a4a96b', scale: 1.2, speed: 0.65, horns: true },
  { id: 'glasswing-moth', name: 'Glasswing Moth', type: 'PRISM', body: '#78969a', accent: '#c9d8c3', scale: 0.75, speed: 1.1, wings: true },
  { id: 'brinekip', name: 'Brinekip', type: 'BRINE', body: '#4f8990', accent: '#93c8bb', scale: 0.78, speed: 1.25, ears: true },
  { id: 'thunder-ram', name: 'Thunder Ram', type: 'STORM', body: '#767b87', accent: '#d8b274', scale: 1.1, speed: 0.9, horns: true },
  { id: 'dusk-owl', name: 'Dusk Owl', type: 'SHADE', body: '#555869', accent: '#b5a2c4', scale: 0.85, speed: 0.85, wings: true }
];
const fragmentLocations = [
  new THREE.Vector3(-15, 0, -11),
  new THREE.Vector3(12, 0, -18),
  new THREE.Vector3(19, 0, 13)
];

const make = (tag, className = '', text = '') => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

function box(parent, size, color, position, materialOptions = {}) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(...size),
    new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...materialOptions })
  );
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

function makeCritter(species) {
  const group = new THREE.Group();
  const { scale, body, accent } = species;
  box(group, [0.85 * scale, 0.68 * scale, 1.05 * scale], body, [0, 0.62 * scale, 0]);
  box(group, [0.6 * scale, 0.58 * scale, 0.58 * scale], body, [0, 1.07 * scale, -0.5 * scale]);
  box(group, [0.34 * scale, 0.2 * scale, 0.2 * scale], accent, [0, 0.98 * scale, -0.81 * scale]);
  box(group, [0.08 * scale, 0.08 * scale, 0.08 * scale], '#20232b', [0.2 * scale, 1.16 * scale, -0.78 * scale]);
  box(group, [0.08 * scale, 0.08 * scale, 0.08 * scale], '#20232b', [-0.2 * scale, 1.16 * scale, -0.78 * scale]);
  for (const x of [-0.25, 0.25]) {
    for (const z of [-0.34, 0.34]) box(group, [0.2 * scale, 0.45 * scale, 0.2 * scale], body, [x * scale, 0.24 * scale, z * scale]);
  }
  if (species.ears) {
    box(group, [0.18 * scale, 0.52 * scale, 0.18 * scale], accent, [0.2 * scale, 1.48 * scale, -0.48 * scale]);
    box(group, [0.18 * scale, 0.52 * scale, 0.18 * scale], accent, [-0.2 * scale, 1.48 * scale, -0.48 * scale]);
  }
  if (species.horns) {
    box(group, [0.18 * scale, 0.46 * scale, 0.18 * scale], accent, [0.39 * scale, 1.45 * scale, -0.5 * scale]).rotation.z = -0.45;
    box(group, [0.18 * scale, 0.46 * scale, 0.18 * scale], accent, [-0.39 * scale, 1.45 * scale, -0.5 * scale]).rotation.z = 0.45;
  }
  if (species.wings) {
    box(group, [0.72 * scale, 0.1 * scale, 0.46 * scale], accent, [0.55 * scale, 0.79 * scale, 0]);
    box(group, [0.72 * scale, 0.1 * scale, 0.46 * scale], accent, [-0.55 * scale, 0.79 * scale, 0]);
  }
  if (species.tail) box(group, [0.25 * scale, 0.25 * scale, 0.78 * scale], accent, [0, 0.66 * scale, 0.76 * scale]);
  group.userData.speciesId = species.id;
  return group;
}

function makePlayer() {
  const group = new THREE.Group();
  box(group, [0.8, 1.05, 0.45], '#354b50', [0, 1.05, 0]);
  box(group, [0.7, 0.66, 0.68], '#b88f6d', [0, 1.94, 0]);
  box(group, [0.74, 0.16, 0.72], '#272d35', [0, 2.3, 0]);
  box(group, [0.24, 0.22, 0.1], '#d7bd8e', [0, 1.08, -0.27]);
  box(group, [0.24, 0.82, 0.34], '#292f38', [-0.23, 0.4, 0]);
  box(group, [0.24, 0.82, 0.34], '#292f38', [0.23, 0.4, 0]);
  return group;
}

export function initializeFrontier(screen, { api, onCaptured, collection } = {}) {
  const shell = make('div', 'frontier-shell');
  const canvasHost = make('div', 'frontier-canvas-host');
  const hud = make('div', 'frontier-hud');
  const region = make('p', 'frontier-region', 'DUSTWAKE / THE LOW COUNTRY');
  const progress = make('p', 'frontier-progress', '');
  const prompt = make('p', 'frontier-prompt', 'WASD / ARROWS MOVE  ·  MOUSE DRAG LOOK  ·  E CATCH / INTERACT');
  const action = make('button', 'arcade-button frontier-action', 'CATCH NEARBY');
  action.type = 'button';
  action.disabled = true;
  const message = make('p', 'frontier-message', 'Follow the blue-hour trail. The local fauna are wary but curious.');
  const capturePanel = make('div', 'frontier-capture hidden');
  const mobileControls = make('div', 'frontier-mobile-controls');
  const controls = [['▲', 0, -1], ['◀', -1, 0], ['▼', 0, 1], ['▶', 1, 0]];
  const pressed = new Set();
  const directionKeys = new Map([
    ['ArrowUp', 'w'], ['ArrowDown', 's'], ['ArrowLeft', 'a'], ['ArrowRight', 'd'],
    ['w', 'w'], ['s', 's'], ['a', 'a'], ['d', 'd']
  ]);
  let renderer;
  let frame = 0;
  let previousTime = 0;
  let player;
  let camera;
  let scene;
  let yaw = Math.PI;
  let zoom = 9;
  let dragging = false;
  let lastPointer = null;
  let target = null;
  let challenge = null;
  let captureInput = [];
  let capturing = false;
  let rewardSaved = false;
  let rewardSaving = false;
  let fragmentCount = 0;
  const fragments = [];
  const creatures = [];
  const remotePilots = new Map();
  let frontierJoined = false;
  let lastNetworkUpdate = 0;
  let disposed = false;

  shell.append(canvasHost, hud);
  hud.append(region, progress, prompt, action, message, capturePanel);
  for (const [label, dx, dz] of controls) {
    const button = make('button', 'arcade-button frontier-move', label);
    button.type = 'button';
    const keyX = dx < 0 ? 'a' : dx > 0 ? 'd' : '';
    const keyZ = dz < 0 ? 'w' : dz > 0 ? 's' : '';
    const down = (event) => {
      event.preventDefault();
      if (keyX) pressed.add(keyX);
      if (keyZ) pressed.add(keyZ);
    };
    const up = () => {
      if (keyX) pressed.delete(keyX);
      if (keyZ) pressed.delete(keyZ);
    };
    button.addEventListener('pointerdown', down);
    button.addEventListener('pointerup', up);
    button.addEventListener('pointercancel', up);
    button.addEventListener('pointerleave', up);
    mobileControls.append(button);
  }
  shell.append(mobileControls);
  screen.append(shell);

  function caughtIds() {
    const owned = collection?.() || [];
    return new Set(owned);
  }

  function refreshProgress() {
    const owned = caughtIds();
    const untracked = creatures.filter((creature) => !creature.caught && !owned.has(creature.species.id)).length;
    progress.textContent = `WILD FAUNA ${fauna.length - untracked}/${fauna.length}  ·  WAYGLASS ${fragmentCount}/3`;
    if (fragmentCount === 3 && !rewardSaved && !rewardSaving) {
      const rewardButton = make('button', 'arcade-button frontier-reward', 'RECORD TRAIL FINDINGS');
      rewardButton.type = 'button';
      rewardButton.addEventListener('click', claimTrailReward);
      if (!hud.querySelector('.frontier-reward')) hud.insertBefore(rewardButton, message);
    }
  }

  async function claimTrailReward() {
    if (!api || rewardSaving || rewardSaved) return;
    rewardSaving = true;
    const rewardButton = hud.querySelector('.frontier-reward');
    if (rewardButton) rewardButton.disabled = true;
    try {
      const result = await api('/api/games/rewards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: 'ashen-frontier', claimId: crypto.randomUUID() })
      });
      rewardSaved = true;
      onCaptured?.(result.profile);
      message.textContent = `TRAIL RECORDED  ·  +${result.reward.xp} XP  ·  +${result.reward.credits} CREDITS`;
      rewardButton?.remove();
    } catch (error) {
      message.textContent = `TRAIL SAVE FAILED: ${error.message}`;
      if (rewardButton) rewardButton.disabled = false;
    } finally {
      rewardSaving = false;
    }
  }

  function startCapture() {
    if (!target || target.caught || capturing || caughtIds().has(target.species.id)) return;
    if (!api) {
      message.textContent = 'Reconnect to the pilot record before catching wildlife.';
      return;
    }
    capturing = true;
    action.disabled = true;
    const selected = target;
    api('/api/games/echoes/challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ echoId: selected.species.id })
    }).then((result) => {
      challenge = result;
      captureInput = [];
      capturePanel.replaceChildren(
        make('p', 'frontier-capture-title', `${selected.species.name.toUpperCase()} / MATCH THE TRACE`),
        make('p', 'frontier-trace', result.trace.map((tone) => glyphs[tone]).join('  '))
      );
      const pads = make('div', 'rhythm-pads');
      glyphs.forEach((glyph, tone) => {
        const pad = make('button', `arcade-button tone-button tone-${tone}`, `${glyph} ${['LOW', 'MID', 'HIGH'][tone]}`);
        pad.type = 'button';
        pad.addEventListener('click', () => enterCaptureTone(tone, selected));
        pads.append(pad);
      });
      capturePanel.append(pads, make('p', 'frontier-capture-hint', 'Remember the three notes. The animal is waiting nearby.'));
      capturePanel.classList.remove('hidden');
      message.textContent = `You approached ${selected.species.name}. It answers with a three-note call.`;
      capturing = false;
      updateTarget();
    }).catch((error) => {
      message.textContent = `CATCH FAILED: ${error.message}`;
      capturing = false;
      updateTarget();
    });
  }

  async function enterCaptureTone(tone, selected) {
    if (!challenge || !target || target !== selected || target.position.distanceTo(player.position) > 5.2) {
      challenge = null;
      capturePanel.classList.add('hidden');
      message.textContent = 'The animal wandered out of reach. Track it and try again.';
      return;
    }
    captureInput.push(tone);
    const hint = capturePanel.querySelector('.frontier-capture-hint');
    if (hint) hint.textContent = `TRACE ${captureInput.length}/3  ·  ${captureInput.map((item) => glyphs[item]).join(' ')}`;
    if (captureInput.length < 3) return;
    const matches = captureInput.every((item, index) => item === challenge.trace[index]);
    if (!matches) {
      captureInput = [];
      if (hint) hint.textContent = 'The call slipped away. Listen and try the trace again.';
      return;
    }
    const activeChallenge = challenge;
    challenge = null;
    capturePanel.classList.add('hidden');
    capturing = true;
    try {
      const result = await api('/api/games/echoes/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId: activeChallenge.challengeId, trace: captureInput })
      });
      selected.caught = true;
      selected.group.visible = false;
      onCaptured?.(result.profile);
      message.textContent = `${selected.species.name.toUpperCase()} JOINED YOUR FIELD CATALOG  ·  +20 XP / +5 CREDITS`;
      refreshProgress();
    } catch (error) {
      message.textContent = `CATALOG SAVE FAILED: ${error.message}`;
    } finally {
      capturing = false;
      updateTarget();
    }
  }

  function updateTarget() {
    if (!player) return;
    const previousTarget = target;
    const owned = caughtIds();
    let nearest = null;
    let distance = 5.2;
    for (const creature of creatures) {
      if (creature.caught || owned.has(creature.species.id)) continue;
      const nextDistance = creature.position.distanceTo(player.position);
      if (nextDistance < distance) {
        nearest = creature;
        distance = nextDistance;
      }
    }
    target = nearest;
    action.disabled = !nearest || capturing || Boolean(challenge);
    action.textContent = nearest ? `CATCH ${nearest.species.name.toUpperCase()}  [E]` : 'CATCH NEARBY';
    if (nearest && nearest !== previousTarget && !challenge && !capturing) {
      message.textContent = `${nearest.species.name} is nearby. Move closer and press E to begin the catch.`;
    }
  }

  function updateRemotePilot(pilot) {
    if (!scene || !pilot || typeof pilot.id !== 'string' || pilot.id === socket?.id) return;
    let remote = remotePilots.get(pilot.id);
    if (!remote) {
      const avatar = makePlayer();
      const tint = new THREE.Color().setHSL((pilot.id.length * 0.137) % 1, 0.28, 0.56);
      avatar.traverse((object) => {
        if (!object.isMesh) return;
        object.material = object.material.clone();
        object.material.color.lerp(tint, 0.42);
      });
      const labelCanvas = document.createElement('canvas');
      labelCanvas.width = 256;
      labelCanvas.height = 64;
      const labelContext = labelCanvas.getContext('2d');
      if (!labelContext) return;
      labelContext.fillStyle = 'rgba(17, 26, 30, .84)';
      labelContext.fillRect(0, 0, labelCanvas.width, labelCanvas.height);
      labelContext.strokeStyle = '#d9c9a8';
      labelContext.strokeRect(1, 1, labelCanvas.width - 2, labelCanvas.height - 2);
      labelContext.fillStyle = '#f1e7d2';
      labelContext.font = '22px monospace';
      labelContext.textAlign = 'center';
      labelContext.fillText(String(pilot.username || 'PILOT').slice(0, 18), labelCanvas.width / 2, 40);
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(labelCanvas), transparent: true }));
      label.position.y = 3.2;
      label.scale.set(2.6, 0.65, 1);
      avatar.add(label);
      scene.add(avatar);
      remote = { avatar, target: new THREE.Vector3() };
      remotePilots.set(pilot.id, remote);
    }
    remote.target.set(pilot.x || 0, 0, pilot.z || 0);
  }

  function removeRemotePilot(id) {
    const remote = remotePilots.get(id);
    if (!remote) return;
    scene.remove(remote.avatar);
    remote.avatar.traverse((object) => {
      if (object.isMesh) {
        object.geometry.dispose();
        if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
        else object.material.dispose();
      } else if (object.isSprite) {
        object.material.map?.dispose();
        object.material.dispose();
      }
    });
    remotePilots.delete(id);
  }

  function joinFrontier() {
    if (!socket?.connected || frontierJoined) return;
    socket.emit('frontier:join', (result) => {
      if (result?.error) {
        message.textContent = `ONLINE FRONTIER UNAVAILABLE: ${result.error}`;
        return;
      }
      frontierJoined = true;
      for (const pilot of result?.players || []) updateRemotePilot(pilot);
      if (player) {
        socket.emit('frontier:move', { x: player.position.x, z: player.position.z });
        message.textContent = `${remotePilots.size + 1} PILOT${remotePilots.size ? 'S' : ''} IN THE FRONTIER.`;
      }
    });
  }

  function onFrontierConnect() {
    frontierJoined = false;
    joinFrontier();
  }

  function onFrontierDisconnect() {
    frontierJoined = false;
    challenge = null;
    capturing = false;
    capturePanel.classList.add('hidden');
    for (const id of remotePilots.keys()) removeRemotePilot(id);
    message.textContent = 'NETWORK LOST. EXPLORATION CONTINUES OFFLINE.';
  }

  function onRemotePilotLeft({ id }) {
    removeRemotePilot(id);
  }

  function addScenery() {
    const groundGeometry = new THREE.PlaneGeometry(150, 150, 48, 48);
    const positions = groundGeometry.attributes.position;
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const z = positions.getY(index);
      positions.setZ(index, Math.sin(x * 0.11) * Math.cos(z * 0.09) * 0.38 + Math.sin((x + z) * 0.045) * 0.55);
    }
    groundGeometry.computeVertexNormals();
    const ground = new THREE.Mesh(groundGeometry, new THREE.MeshStandardMaterial({ color: '#626660', roughness: 1, flatShading: true }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.2;
    ground.receiveShadow = true;
    scene.add(ground);

    for (let index = 0; index < 38; index += 1) {
      const angle = index * 2.399;
      const radius = 9 + (index % 8) * 5;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      if (Math.hypot(x, z) < 8) continue;
      const height = 0.8 + (index % 4) * 0.3;
      const stone = box(scene, [1.4 + (index % 3) * 0.35, height, 1.2 + (index % 2) * 0.35], index % 3 ? '#4f5656' : '#66554b', [x, height / 2 - 0.1, z]);
      stone.rotation.y = (index % 7) * 0.21;
      if (index % 4 === 0) box(scene, [0.42, 2.8, 0.42], '#494d50', [x + 2.3, 1.3, z - 1.5]);
    }

    fragmentLocations.forEach((position, index) => {
      const shard = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.65, 0),
        new THREE.MeshStandardMaterial({ color: '#e5b675', emissive: '#78502d', emissiveIntensity: 0.8, flatShading: true })
      );
      shard.position.set(position.x, 1.05, position.z);
      shard.rotation.z = index * 0.4;
      scene.add(shard);
      fragments.push({ mesh: shard, position, collected: false });
    });
  }

  function initializeScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color('#738087');
    scene.fog = new THREE.FogExp2('#738087', 0.012);
    camera = new THREE.PerspectiveCamera(58, 1, 0.1, 170);
    camera.position.set(0, 7, 9);
    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    canvasHost.append(renderer.domElement);
    scene.add(new THREE.HemisphereLight('#d5d9d4', '#292e33', 2));
    const sun = new THREE.DirectionalLight('#f0c99a', 2.1);
    sun.position.set(-25, 34, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    scene.add(sun);
    addScenery();

    player = makePlayer();
    player.position.set(0, 0, 0);
    player.traverse((object) => { if (object.isMesh) object.castShadow = true; });
    scene.add(player);

    const owned = caughtIds();
    fauna.forEach((species, index) => {
      const angle = index * (Math.PI * 2 / fauna.length) + 0.2;
      const position = new THREE.Vector3(Math.cos(angle) * 15, 0, Math.sin(angle) * 15);
      const group = makeCritter(species);
      group.position.copy(position);
      group.rotation.y = Math.PI + angle;
      group.traverse((object) => { if (object.isMesh) object.castShadow = true; });
      scene.add(group);
      creatures.push({
        species,
        group,
        position,
        destination: position.clone().add(new THREE.Vector3(Math.sin(angle) * 5, 0, Math.cos(angle) * 4)),
        nextWander: 0,
        caught: owned.has(species.id),
        phase: index * 1.7
      });
      if (owned.has(species.id)) group.visible = false;
    });
    resize();
  }

  function resize() {
    if (!renderer) return;
    const { width, height } = canvasHost.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function tick(now) {
    if (disposed || !renderer) return;
    const delta = Math.min((now - previousTime) / 1000, 0.04);
    previousTime = now;
    const forward = Number(pressed.has('s')) - Number(pressed.has('w'));
    const sideways = Number(pressed.has('d')) - Number(pressed.has('a'));
    if (!challenge && (forward || sideways)) {
      const length = Math.hypot(forward, sideways) || 1;
      const speed = 7.5 * delta / length;
      const dx = Math.sin(yaw) * forward - Math.cos(yaw) * sideways;
      const dz = Math.cos(yaw) * forward + Math.sin(yaw) * sideways;
      player.position.x = THREE.MathUtils.clamp(player.position.x + dx * speed, -68, 68);
      player.position.z = THREE.MathUtils.clamp(player.position.z + dz * speed, -68, 68);
      player.rotation.y = Math.atan2(dx, dz) + Math.PI;
    }
    if (socket?.connected && frontierJoined && now - lastNetworkUpdate >= 200) {
      socket.emit('frontier:move', { x: player.position.x, z: player.position.z });
      lastNetworkUpdate = now;
    }
    for (const remote of remotePilots.values()) {
      remote.avatar.position.lerp(remote.target, 1 - Math.exp(-10 * delta));
    }
    const elapsed = now / 1000;
    for (const creature of creatures) {
      if (creature.caught) continue;
      creature.group.position.y = Math.sin(elapsed * 2.1 + creature.phase) * 0.07;
      if (challenge && target === creature) continue;
      const distance = creature.position.distanceTo(player.position);
      if (distance < 7 && elapsed > creature.nextWander) {
        const angle = Math.random() * Math.PI * 2;
        creature.destination.set(
          THREE.MathUtils.clamp(creature.position.x + Math.cos(angle) * (4 + Math.random() * 5), -64, 64),
          0,
          THREE.MathUtils.clamp(creature.position.z + Math.sin(angle) * (4 + Math.random() * 5), -64, 64)
        );
        creature.nextWander = elapsed + 2 + Math.random() * 3;
      }
      if (distance < 2.8) {
        const away = creature.position.clone().sub(player.position).normalize();
        creature.destination.copy(creature.position).addScaledVector(away, 4);
      }
      const deltaToGoal = creature.destination.clone().sub(creature.position);
      deltaToGoal.y = 0;
      if (deltaToGoal.length() > 0.15) {
        deltaToGoal.normalize();
        creature.position.addScaledVector(deltaToGoal, creature.species.speed * delta);
        creature.group.rotation.y = Math.atan2(deltaToGoal.x, deltaToGoal.z) + Math.PI;
      }
      creature.group.position.x = creature.position.x;
      creature.group.position.z = creature.position.z;
    }
    for (const fragment of fragments) {
      if (fragment.collected) continue;
      fragment.mesh.rotation.y += delta * 0.8;
      fragment.mesh.position.y = 1.05 + Math.sin(elapsed * 1.8 + fragment.position.x) * 0.16;
      if (player.position.distanceTo(fragment.position) < 2.1) {
        fragment.collected = true;
        fragment.mesh.visible = false;
        fragmentCount += 1;
        message.textContent = `WAYGLASS ${fragmentCount}/3 RECOVERED. ${fragmentCount === 3 ? 'RETURN TO YOUR FIELD RECORD.' : 'ANOTHER TRACE IS NEARBY.'}`;
        refreshProgress();
      }
    }
    updateTarget();
    action.disabled = !target || capturing || Boolean(challenge);
    if (target && !challenge && !capturing) message.dataset.nearby = target.species.name;

    const cameraOffset = new THREE.Vector3(-Math.sin(yaw) * zoom, zoom * 0.72, -Math.cos(yaw) * zoom);
    const cameraTarget = player.position.clone().add(cameraOffset);
    camera.position.lerp(cameraTarget, 1 - Math.exp(-5 * delta));
    camera.lookAt(player.position.x, 1.1, player.position.z);
    renderer.render(scene, camera);
    frame = window.requestAnimationFrame(tick);
  }

  function onKeyDown(event) {
    const key = directionKeys.get(event.key);
    if (key) {
      pressed.add(key);
      event.preventDefault();
    }
    if (event.key.toLowerCase() === 'e' && !event.repeat) startCapture();
  }

  function onKeyUp(event) {
    const key = directionKeys.get(event.key);
    if (key) pressed.delete(key);
  }

  function onPointerDown(event) {
    if (event.target !== renderer.domElement || event.button !== 0) return;
    dragging = true;
    lastPointer = { x: event.clientX, y: event.clientY };
    renderer.domElement.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event) {
    if (!dragging || !lastPointer) return;
    yaw += (event.clientX - lastPointer.x) * 0.006;
    lastPointer = { x: event.clientX, y: event.clientY };
  }

  function onPointerUp() {
    dragging = false;
    lastPointer = null;
  }

  function onWheel(event) {
    zoom = THREE.MathUtils.clamp(zoom + event.deltaY * 0.008, 5, 16);
  }

  let resizeObserver;
  try {
    initializeScene();
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvasHost);
  } catch (error) {
    shell.replaceChildren(make('p', 'arcade-status', `3D FRONTIER COULD NOT START: ${error.message}`));
    renderer?.dispose();
    return () => {};
  }
  action.addEventListener('click', startCapture);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('resize', resize);
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerup', onPointerUp);
  renderer.domElement.addEventListener('pointercancel', onPointerUp);
  renderer.domElement.addEventListener('wheel', onWheel, { passive: true });
  socket?.on('frontier:player:joined', updateRemotePilot);
  socket?.on('frontier:player:moved', updateRemotePilot);
  socket?.on('frontier:player:left', onRemotePilotLeft);
  socket?.on('connect', onFrontierConnect);
  socket?.on('disconnect', onFrontierDisconnect);
  joinFrontier();
  refreshProgress();
  frame = window.requestAnimationFrame(tick);

  return () => {
    disposed = true;
    window.cancelAnimationFrame(frame);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('resize', resize);
    resizeObserver?.disconnect();
    action.removeEventListener('click', startCapture);
    socket?.off('frontier:player:joined', updateRemotePilot);
    socket?.off('frontier:player:moved', updateRemotePilot);
    socket?.off('frontier:player:left', onRemotePilotLeft);
    socket?.off('connect', onFrontierConnect);
    socket?.off('disconnect', onFrontierDisconnect);
    socket?.emit('frontier:leave');
    for (const id of remotePilots.keys()) removeRemotePilot(id);
    if (renderer) {
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onPointerUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      scene.traverse((object) => {
        if (object.isMesh) {
          object.geometry.dispose();
          if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
          else object.material.dispose();
        }
      });
      renderer.dispose();
    }
    pressed.clear();
  };
}
