'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { parseXmlPlaceFile } = require('../server');

const project = {
  title: 'Recovery Test',
  scene: [{
    name: 'Floor & safe',
    className: 'Part',
    position: [1, 2, 3],
    size: [10, 1, 8],
    rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    color: '#34abef',
    transparency: 0,
    shape: 'Block'
  }]
};
const runtimeState = { position: [1.5, 2, 3], yaw: 0.75, pitch: 0.25, distance: 18, playing: true };

async function withSaveFile(xml, action) {
  const filePath = path.join(os.tmpdir(), `anti-null-recovery-${process.pid}-${Date.now()}.rbxlx`);
  try {
    await fs.writeFile(filePath, xml, 'utf8');
    return await action(filePath);
  } finally {
    await fs.rm(filePath, { force: true });
  }
}

test('generated RBXLX restores supported geometry and emulator state', async () => {
  const { serializeEmulatorSave } = await import('../public/emulator-save.mjs');
  const xml = serializeEmulatorSave(project, runtimeState);
  const recovered = await withSaveFile(xml, (filePath) => parseXmlPlaceFile(filePath, path.basename(filePath)));

  assert.equal(recovered.scene.length, 1);
  assert.equal(recovered.scene[0].name, 'Floor & safe');
  assert.equal(recovered.scene[0].color, '#34abef');
  assert.deepEqual(recovered.runtimeSave, { version: 1, ...runtimeState });
});

test('recovery parser rejects corrupted emulator metadata', async () => {
  const { serializeEmulatorSave } = await import('../public/emulator-save.mjs');
  const xml = serializeEmulatorSave(project, runtimeState).replace(
    /(<string name="Value">)[^<]+/,
    '$1!!!!'
  );
  await withSaveFile(xml, async (filePath) => {
    await assert.rejects(parseXmlPlaceFile(filePath, path.basename(filePath)), /recovery metadata is invalid/);
  });
});

test('recovery writer rejects invalid player state', async () => {
  const { serializeEmulatorSave } = await import('../public/emulator-save.mjs');
  assert.throws(() => serializeEmulatorSave(project, { ...runtimeState, position: [Infinity, 0, 0] }), /valid A-Null emulator recovery data/);
});
