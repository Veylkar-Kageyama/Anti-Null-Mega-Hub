const SAVE_VERSION = 1;
const MAX_SAVED_PARTS = 600;

function escapeXml(value) {
  return String(value).replace(/[<>&'"]/g, (character) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;'
  })[character]);
}

function encodeBase64(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function normalizeState(value) {
  if (!value || value.version !== SAVE_VERSION || !Array.isArray(value.position) ||
      value.position.length !== 3 ||
      value.position.some((number) => typeof number !== 'number' || !Number.isFinite(number) || Math.abs(number) > 100000) ||
      !['yaw', 'pitch', 'distance'].every((key) => typeof value[key] === 'number' && Number.isFinite(value[key]))) {
    throw new Error('This .rbxlx file does not contain valid A-Null emulator recovery data.');
  }
  return {
    version: SAVE_VERSION,
    position: value.position,
    yaw: value.yaw,
    pitch: Math.max(-0.2, Math.min(1.2, value.pitch)),
    distance: Math.max(1, Math.min(1000000, value.distance)),
    playing: value.playing === true
  };
}

function serializePart(part, index) {
  const [red, green, blue] = part.color.slice(1).match(/.{2}/g).map((value) => parseInt(value, 16) / 255);
  const rotation = part.rotation;
  const className = part.className === 'WedgePart' || part.shape === 'Wedge'
    ? 'WedgePart'
    : part.className === 'CornerWedgePart' || part.shape === 'CornerWedge'
      ? 'CornerWedgePart'
      : 'Part';
  const shape = part.shape === 'Ball' ? 0 : part.shape === 'Cylinder' ? 2 : 1;
  const vector = (name, value) =>
    `<Vector3 name="${name}"><X>${value[0]}</X><Y>${value[1]}</Y><Z>${value[2]}</Z></Vector3>`;
  const rows = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8]
  ];
  const orientation = rows.map((row, rowIndex) =>
    row.map((column, columnIndex) => `<R${rowIndex}${columnIndex}>${rotation[column]}</R${rowIndex}${columnIndex}>`).join('')
  ).join('');
  return `<Item class="${className}" referent="RBXPart${index}"><Properties><string name="Name">${escapeXml(part.name)}</string>${vector('size', part.size)}<CoordinateFrame name="CFrame"><X>${part.position[0]}</X><Y>${part.position[1]}</Y><Z>${part.position[2]}</Z>${orientation}</CoordinateFrame><Color3 name="Color3"><R>${red}</R><G>${green}</G><B>${blue}</B></Color3><float name="Transparency">${part.transparency}</float><bool name="Anchored">true</bool><bool name="CanCollide">true</bool><token name="Shape">${shape}</token></Properties></Item>`;
}

export function serializeEmulatorSave(project, runtimeState) {
  if (!project || !Array.isArray(project.scene) || project.scene.length > MAX_SAVED_PARTS) {
    throw new Error(`Local .rbxlx recovery currently supports up to ${MAX_SAVED_PARTS} preview parts.`);
  }
  const state = normalizeState({ ...runtimeState, version: SAVE_VERSION });
  const name = String(project.title || 'Imported Place').slice(0, 80);
  const emulatorValue = encodeBase64(state);
  const parts = project.scene.map(serializePart).join('');
  return `<?xml version="1.0" encoding="utf-8"?><roblox version="4"><Item class="Workspace" referent="RBXWorkspace"><Properties><string name="Name">Workspace</string></Properties>${parts}</Item><Item class="ReplicatedStorage" referent="RBXReplicatedStorage"><Properties><string name="Name">ReplicatedStorage</string></Properties><Item class="Folder" referent="RBXEmulatorSave"><Properties><string name="Name">A-Null Emulator Recovery</string></Properties><Item class="StringValue" referent="RBXEmulatorState"><Properties><string name="Name">AntiNullEmulatorStateV1</string><string name="Value">${emulatorValue}</string></Properties></Item><Item class="StringValue" referent="RBXEmulatorTitle"><Properties><string name="Name">ImportedPlaceTitle</string><string name="Value">${escapeXml(name)}</string></Properties></Item></Item></Item></roblox>`;
}

export function readEmulatorSaveState(document) {
  const marker = Array.from(document.querySelectorAll('Item[class="StringValue"]')).find((item) => {
    const properties = item.querySelector(':scope > Properties');
    const name = properties?.querySelector(':scope > string[name="Name"]');
    return name?.textContent === 'AntiNullEmulatorStateV1';
  });
  if (!marker) return null;
  const value = marker.querySelector(':scope > Properties > string[name="Value"]')?.textContent?.trim();
  if (!value || value.length > 4096) throw new Error('The emulator recovery data in this .rbxlx file is invalid.');
  let decoded;
  try {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    decoded = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error('The emulator recovery data in this .rbxlx file could not be decoded.');
  }
  return normalizeState(decoded);
}
