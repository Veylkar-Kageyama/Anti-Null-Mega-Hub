'use strict';

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { parseBinaryPlace, parseXmlPlaceFile } = require('./server');
const MAX_FILE_BYTES = 5 * 1024 ** 3;

process.once('message', async ({ filePath, originalName } = {}) => {
  try {
    if (typeof filePath !== 'string' || typeof originalName !== 'string') {
      throw new Error('The place import request is invalid.');
    }
    const extension = path.extname(originalName).toLowerCase();
    const { size } = await fs.stat(filePath);
    if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_FILE_BYTES) {
      throw new Error('Place files must be between 1 byte and 5 GB.');
    }
    if (extension === '.rbxlx') {
      const project = await parseXmlPlaceFile(filePath, originalName);
      process.send({ ok: true, project }, () => process.exit(0));
      return;
    }
    if (extension !== '.rbxl') throw new Error('Choose a .rbxl or .rbxlx place file.');
    const file = await fs.open(filePath, 'r');
    let expandedBytes = 0;
    try {
      if (size < 32) throw new Error('Binary place files must be at least 32 bytes.');
      const signatureAndHeader = Buffer.alloc(32);
      const headerRead = await file.read(signatureAndHeader, 0, signatureAndHeader.length, 0);
      const expectedSignature = Buffer.from([0x3c, 0x72, 0x6f, 0x62, 0x6c, 0x6f, 0x78, 0x21, 0x89, 0xff, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
      if (headerRead.bytesRead !== 32 || !signatureAndHeader.subarray(0, 16).equals(expectedSignature)) {
        throw new Error('This is not a valid binary Roblox place file.');
      }
      const classCount = signatureAndHeader.readUInt32LE(16);
      const instanceCount = signatureAndHeader.readUInt32LE(20);
      if (!classCount || classCount > 10000 || !instanceCount || instanceCount > 10000) {
        throw new Error('Binary place files are limited to 10,000 classes and instances.');
      }
      let offset = 32;
      let chunkCount = 0;
      let ended = false;
      while (offset < size) {
        if (size - offset < 16 || ++chunkCount > 10000) throw new Error('The binary place contains an invalid chunk table.');
        const chunkHeader = Buffer.alloc(16);
        const chunkRead = await file.read(chunkHeader, 0, chunkHeader.length, offset);
        if (chunkRead.bytesRead !== chunkHeader.length) throw new Error('The binary place contains a truncated chunk header.');
        const name = chunkHeader.toString('ascii', 0, 4);
        const compressedLength = chunkHeader.readUInt32LE(4);
        const uncompressedLength = chunkHeader.readUInt32LE(8);
        const reserved = chunkHeader.readUInt32LE(12);
        const payloadLength = compressedLength || uncompressedLength;
        if (reserved !== 0 || uncompressedLength > MAX_FILE_BYTES || payloadLength > size - offset - 16) {
          throw new Error('The binary place contains an invalid or oversized chunk.');
        }
        expandedBytes += uncompressedLength;
        if (expandedBytes > MAX_FILE_BYTES) throw new Error('The expanded binary place exceeds the 5 GB parsing limit.');
        offset += 16 + payloadLength;
        if (name === 'END\u0000') {
          ended = true;
          break;
        }
      }
      if (!ended || offset !== size) throw new Error('The binary place is incomplete or contains trailing data.');
    } finally {
      await file.close();
    }
    const estimatedMemory = Math.ceil(size * 2 + expandedBytes + 512 * 1024 ** 2);
    if (estimatedMemory > os.freemem()) {
      throw new Error('This place needs more free memory to decode than this server currently has. Try a machine with more RAM.');
    }
    const buffer = await fs.readFile(filePath);
    const project = parseBinaryPlace(buffer, originalName);
    process.send({ ok: true, project }, () => process.exit(0));
  } catch (error) {
    process.send({ ok: false, error: error.message }, () => process.exit(1));
  }
});
