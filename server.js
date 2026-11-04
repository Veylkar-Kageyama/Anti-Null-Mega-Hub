'use strict';

require('dotenv').config();
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { fork } = require('node:child_process');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const rbxReader = require('rbx-reader');
const { SaxesParser } = require('saxes');

const app = express();
app.set('trust proxy', 1);
const httpServer = http.createServer(app);
httpServer.requestTimeout = 60 * 60 * 1000;
const io = new Server(httpServer, { maxHttpBufferSize: 1e6 });
const uploadDir = process.env.UPLOAD_DIR || path.join(os.homedir(), '.anti-null', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({
  email: { type: String, unique: true, required: true, lowercase: true, trim: true },
  username: { type: String, required: true, trim: true, minlength: 3, maxlength: 24 },
  passwordHash: { type: String, required: true },
  bio: { type: String, maxlength: 250, default: '' },
  avatar: { type: String, default: '' },
  role: { type: String, default: 'Member' },
  roleColor: { type: String, default: '#a66bff' },
  approved: { type: Boolean, default: false },
  hasHammers: { type: Boolean, default: false },
  isAdmin: { type: Boolean, default: false },
  muted: { type: Boolean, default: false },
  banned: { type: Boolean, default: false }
}, { timestamps: true }));

const Message = mongoose.models.Message || mongoose.model('Message', new mongoose.Schema({
  room: { type: String, required: true, index: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  senderName: String,
  text: { type: String, maxlength: 4000, default: '' },
  attachment: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
}));

const Group = mongoose.models.Group || mongoose.model('Group', new mongoose.Schema({
  name: { type: String, required: true, maxlength: 50 },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true }));

const GAME_ECHOES = {
  'velvet-static': { name: 'Velvet Static', glyph: '≈', type: 'HUSH', tones: [0, 2, 1] },
  'lantern-drift': { name: 'Lantern Drift', glyph: '◇', type: 'GLOW', tones: [2, 0, 2] },
  'tin-lullaby': { name: 'Tin Lullaby', glyph: '⌁', type: 'METAL', tones: [1, 1, 0] },
  'rain-circuit': { name: 'Rain Circuit', glyph: '╱', type: 'TIDE', tones: [0, 1, 2] },
  'morrow-hum': { name: 'Morrow Hum', glyph: '∿', type: 'DUSK', tones: [2, 1, 0] },
  'paper-comet': { name: 'Paper Comet', glyph: '✳', type: 'WIND', tones: [1, 2, 1] },
  'cinder-fox': { name: 'Cinderfox', glyph: '⌁', type: 'EMBER', tones: [2, 0, 1] },
  'mossback-grazer': { name: 'Mossback Grazer', glyph: '▰', type: 'MOSS', tones: [0, 1, 1] },
  'glasswing-moth': { name: 'Glasswing Moth', glyph: '✧', type: 'PRISM', tones: [1, 0, 2] },
  'brinekip': { name: 'Brinekip', glyph: '◉', type: 'BRINE', tones: [0, 2, 0] },
  'thunder-ram': { name: 'Thunder Ram', glyph: '⟁', type: 'STORM', tones: [2, 2, 0] },
  'dusk-owl': { name: 'Dusk Owl', glyph: '◒', type: 'SHADE', tones: [1, 2, 0] }
};

const GameProfile = mongoose.models.GameProfile || mongoose.model('GameProfile', new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', unique: true, required: true },
  xp: { type: Number, min: 0, default: 0 },
  credits: { type: Number, min: 0, default: 0 },
  echoes: { type: [String], default: [] },
  storyChapter: { type: Number, min: 1, max: 999, default: 1 },
  routeChoices: [{
    choiceId: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
  }],
  settings: {
    music: { type: Number, min: 0, max: 1, default: 0.25 },
    effects: { type: Number, min: 0, max: 1, default: 0.65 }
  },
  activeEchoChallenge: {
    challengeId: String,
    echoId: String,
    expiresAt: Date
  },
  rewardClaims: [{
    claimId: { type: String, required: true },
    gameId: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true }));

const ImportedProject = mongoose.models.ImportedProject || mongoose.model('ImportedProject', new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, maxlength: 80 },
  sourceName: { type: String, required: true, maxlength: 180 },
  sourceFormat: { type: String, enum: ['rbxlx', 'rbxl'], required: true },
  sourceUrl: { type: String, maxlength: 300, default: '' },
  license: { type: String, maxlength: 40, default: 'User-provided' },
  catalogFileId: { type: String, maxlength: 600, default: '' },
  scene: { type: [mongoose.Schema.Types.Mixed], default: [] },
  assets: { type: [mongoose.Schema.Types.Mixed], default: [] },
  summary: {
    instances: { type: Number, min: 0, default: 0 },
    parts: { type: Number, min: 0, default: 0 },
    scripts: { type: Number, min: 0, default: 0 },
    sounds: { type: Number, min: 0, default: 0 }
  }
}, { timestamps: true }));

const APP_OWNER = {
  email: 'jskeltonjr2010@gmail.com',
  password: 'DandadanOka9!',
  username: 'Veylkar'
};

const announcementStore = [];

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
const arcadeLimiter = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });
const binaryImportLimiter = rateLimit({ windowMs: 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false });
const importCatalogLimiter = rateLimit({ windowMs: 60 * 1000, limit: 2, standardHeaders: true, legacyHeaders: false });
const importCatalogCache = new Map();
const MAX_PLACE_UPLOAD_BYTES = 5 * 1024 ** 3;
let activeBinaryImports = 0;
const placeFileUpload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (_req, file, done) => done(null, `anull-place-${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`)
  }),
  limits: { fileSize: MAX_PLACE_UPLOAD_BYTES, files: 1 },
  fileFilter: (_req, file, done) => done(/\.(rbxl|rbxlx)$/i.test(file.originalname) ? null : new Error('Choose a .rbxl or .rbxlx Roblox place file.'))
});
const IMPORT_LICENSES = new Map([
  ['MIT', 'mit'],
  ['Apache-2.0', 'apache-2.0'],
  ['BSD-3-Clause', 'bsd-3-clause'],
  ['BSD-2-Clause', 'bsd-2-clause'],
  ['CC0-1.0', 'cc0-1.0'],
  ['Unlicense', 'unlicense']
]);
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'", "'unsafe-inline'"], styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:', 'blob:'], mediaSrc: ["'self'", 'blob:'], connectSrc: ["'self'", 'ws:', 'wss:'],
    objectSrc: ["'none'"], frameAncestors: ["'none'"]
  } }, crossOriginEmbedderPolicy: false
}));
app.use(express.json({ limit: '1mb' }));
app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules/three/build')));
app.use('/vendor/three-addons', express.static(path.join(__dirname, 'node_modules/three/examples/jsm')));
app.use('/vendor', express.static(path.join(__dirname, 'node_modules')));
app.use('/uploads', express.static(uploadDir, { dotfiles: 'deny', fallthrough: false }));
app.use(express.static(path.join(__dirname, 'public')));

function publicUser(user) {
  return {
    id: String(user._id), email: user.email, username: user.username, bio: user.bio,
    avatar: user.avatar, role: user.role, roleColor: user.roleColor,
    approved: user.approved, hasHammers: user.hasHammers, isAdmin: user.isAdmin
  };
}
function signToken(user) {
  const secret = process.env.JWT_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET is required in production.');
  return jwt.sign({ sub: String(user._id) }, secret || 'local-development-secret-change-me', { expiresIn: '7d' });
}
async function ensureOwnerAccount() {
  if (!mongoose.connection.readyState) return null;
  const email = APP_OWNER.email.toLowerCase();
  let owner = await User.findOne({ email });
  if (!owner) {
    owner = await User.create({
      email,
      username: APP_OWNER.username,
      passwordHash: await bcrypt.hash(APP_OWNER.password, 12),
      approved: true,
      hasHammers: true,
      isAdmin: true,
      role: 'Owner',
      roleColor: '#f5b942'
    });
    return owner;
  }
  owner.email = email;
  owner.username = APP_OWNER.username;
  owner.passwordHash = await bcrypt.hash(APP_OWNER.password, 12);
  owner.approved = true;
  owner.hasHammers = true;
  owner.isAdmin = true;
  owner.role = 'Owner';
  owner.roleColor = '#f5b942';
  await owner.save();
  return owner;
}
async function requireAuth(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const claims = jwt.verify(token, process.env.JWT_SECRET || 'local-development-secret-change-me');
    const user = await User.findById(claims.sub);
    if (!user || !user.approved || user.banned) return res.status(401).json({ error: 'Account unavailable.' });
    req.user = user;
    next();
  } catch (_error) { res.status(401).json({ error: 'Authentication required.' }); }
}
function requireAdmin(req, res, next) {
  if (!req.user?.isAdmin) return res.status(403).json({ error: 'Administrator access required.' });
  next();
}
function requireMongo(_req, res, next) {
  if (mongoose.connection.readyState !== 1) return res.status(503).json({ error: 'Database is not connected. Configure MONGODB_URI and restart.' });
  next();
}
async function getOrCreateGameProfile(userId) {
  const existing = await GameProfile.findOne({ user: userId });
  if (existing) return existing;
  try {
    return await GameProfile.create({ user: userId });
  } catch (error) {
    if (error.code !== 11000) throw error;
    return GameProfile.findOne({ user: userId });
  }
}
async function addEchoToGameProfile(userId, echoId) {
  await getOrCreateGameProfile(userId);
  const updated = await GameProfile.findOneAndUpdate({
    user: userId,
    echoes: { $ne: echoId }
  }, {
    $addToSet: { echoes: echoId },
    $inc: { xp: 20, credits: 5 }
  }, { new: true });
  return Boolean(updated);
}
async function recordStoryChoice(userId, choiceId) {
  const profile = await getOrCreateGameProfile(userId);
  return GameProfile.findOneAndUpdate({
    _id: profile._id,
    storyChapter: { $lt: 999 }
  }, {
    $inc: { storyChapter: 1 },
    $push: { routeChoices: { $each: [{ choiceId }], $slice: -100 } }
  }, { new: true });
}
function publicGameProfile(profile) {
  return {
    xp: profile.xp,
    level: Math.floor(profile.xp / 100) + 1,
    credits: profile.credits,
    echoes: profile.echoes,
    storyChapter: profile.storyChapter,
    routeChoices: (profile.routeChoices || []).slice(-20).map((choice) => choice.choiceId),
    settings: profile.settings
  };
}
function findCachedCatalogFile(fileId) {
  return [...importCatalogCache.values()]
    .filter((cached) => cached.expiresAt > Date.now())
    .flatMap((cached) => cached.files)
    .find((file) => file.id === fileId);
}
function validateBinaryPlaceBuffer(buffer) {
  const signature = Buffer.from([0x3c, 0x72, 0x6f, 0x62, 0x6c, 0x6f, 0x78, 0x21, 0x89, 0xff, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
  if (buffer.length < 32 || !buffer.subarray(0, 16).equals(signature)) {
    throw new Error('This is not a valid binary Roblox place file.');
  }
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const classCount = view.getUint32(16, true);
  const instanceCount = view.getUint32(20, true);
  if (!classCount || classCount > 10000 || !instanceCount || instanceCount > 10000) {
    throw new Error('Binary place files are limited to 10,000 classes and instances.');
  }

  let offset = 32;
  let chunkCount = 0;
  let decompressedBytes = 0;
  let ended = false;
  while (offset < buffer.length) {
    if (buffer.length - offset < 16 || ++chunkCount > 10000) throw new Error('The binary place contains an invalid chunk table.');
    const name = buffer.toString('ascii', offset, offset + 4);
    const compressedLength = view.getUint32(offset + 4, true);
    const uncompressedLength = view.getUint32(offset + 8, true);
    const reserved = view.getUint32(offset + 12, true);
    const payloadLength = compressedLength || uncompressedLength;
    if (reserved !== 0 || uncompressedLength > 5 * 1024 ** 3 ||
        payloadLength > buffer.length - offset - 16) {
      throw new Error('The binary place contains an invalid or oversized chunk.');
    }
    decompressedBytes += uncompressedLength;
    if (decompressedBytes > 5 * 1024 ** 3) throw new Error('The expanded binary place exceeds the 5 GB parsing limit.');
    offset += 16 + payloadLength;
    if (name === 'END\u0000') {
      ended = true;
      break;
    }
  }
  if (!ended || offset !== buffer.length) throw new Error('The binary place is incomplete or contains trailing data.');
}
function parseBinaryPlace(buffer, originalName) {
  validateBinaryPlaceBuffer(buffer);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const parsed = rbxReader.parseBuffer(arrayBuffer);
  if (!Array.isArray(parsed.instances) || !parsed.instances.length || parsed.instances.length > 10000) {
    throw new Error('The binary place does not contain a supported instance tree.');
  }
  const sourceName = path.posix.basename(String(originalName || '').replace(/\\/g, '/')).slice(0, 180);
  if (!/\.rbxl$/i.test(sourceName) || /[\u0000-\u001f]/.test(sourceName)) throw new Error('Choose a valid .rbxl file.');
  const scene = [];
  const assets = [];
  const readProperty = (instance, name) => instance.getProperty(name, true);
  const vector3 = (value, fallback) => {
    const values = Array.isArray(value) ? value : value && typeof value === 'object'
      ? [value.x ?? value.X, value.y ?? value.Y, value.z ?? value.Z]
      : null;
    return values?.length === 3 && values.every((number) => typeof number === 'number' && Number.isFinite(number))
      ? values
      : [...fallback];
  };
  const addAsset = (kind, name, value) => {
    const reference = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
    if (reference && reference !== 'null' && reference.length <= 200) assets.push({ kind, name: name.slice(0, 120), reference });
    if (assets.length > 400) throw new Error('The binary place contains more than 400 external asset references.');
  };
  let scripts = 0;
  let sounds = 0;
  for (const instance of parsed.instances) {
    const className = instance.ClassName;
    const name = String(instance.Name || className).slice(0, 120);
    if (['Part', 'MeshPart', 'WedgePart', 'CornerWedgePart', 'TrussPart', 'UnionOperation'].includes(className)) {
      if (scene.length >= 600) throw new Error('The binary place contains more than 600 supported parts.');
      const cframe = readProperty(instance, 'CFrame');
      const cframePosition = Array.isArray(cframe) && cframe.length >= 3 ? cframe.slice(0, 3) : [0, 0, 0];
      const position = vector3(readProperty(instance, 'Position'), cframePosition);
      const size = vector3(readProperty(instance, 'Size'), [4, 1, 2]).map((value) => Math.max(0.05, Math.min(100000, value)));
      const cframeRotation = Array.isArray(cframe) && cframe.length >= 12 ? cframe.slice(3, 12) : [1, 0, 0, 0, 1, 0, 0, 0, 1];
      const color = vector3(readProperty(instance, 'Color3') ?? readProperty(instance, 'Color'), [0.6, 0.6, 0.6])
        .map((value) => Math.round(Math.max(0, Math.min(1, value)) * 255).toString(16).padStart(2, '0')).join('');
      const rawShape = Number(readProperty(instance, 'Shape'));
      const shape = className === 'WedgePart' ? 'Wedge'
        : className === 'CornerWedgePart' ? 'CornerWedge'
          : rawShape === 0 ? 'Ball' : rawShape === 2 ? 'Cylinder' : 'Block';
      const rawTransparency = Number(readProperty(instance, 'Transparency'));
      scene.push({
        name,
        className,
        position,
        size,
        rotation: cframeRotation,
        color: `#${color}`,
        transparency: Number.isFinite(rawTransparency) ? Math.max(0, Math.min(1, rawTransparency)) : 0,
        shape
      });
    }
    if (['Script', 'LocalScript', 'ModuleScript'].includes(className)) {
      scripts += 1;
      assets.push({ kind: 'script', name, reference: 'Source omitted; scripts are never executed.' });
    } else if (className === 'Sound') {
      sounds += 1;
      addAsset('audio', name, readProperty(instance, 'SoundId'));
    } else if (['Decal', 'Texture'].includes(className)) {
      addAsset('image', name, readProperty(instance, 'Texture'));
    } else if (['MeshPart', 'SpecialMesh'].includes(className)) {
      addAsset('mesh', name, readProperty(instance, 'MeshId'));
      addAsset('image', `${name} texture`, readProperty(instance, 'TextureID') ?? readProperty(instance, 'TextureId'));
    } else if (className === 'Animation') {
      addAsset('animation', name, readProperty(instance, 'AnimationId'));
    }
    if (assets.length > 400) throw new Error('The binary place contains more than 400 script and asset references.');
  }
  const uniqueAssets = [...new Map(assets.map((asset) => [`${asset.kind}:${asset.name}:${asset.reference}`, asset])).values()];
  return {
    title: sourceName.replace(/\.rbxl$/i, '').slice(0, 80) || 'Imported Place',
    sourceName,
    sourceFormat: 'rbxl',
    scene,
    assets: uniqueAssets,
    summary: { instances: parsed.instances.length, parts: scene.length, scripts, sounds }
  };
}
async function parseXmlPlaceFile(filePath, originalName) {
  const sourceName = path.posix.basename(String(originalName || '').replace(/\\/g, '/')).slice(0, 180);
  if (!/\.rbxlx$/i.test(sourceName) || /[\u0000-\u001f]/.test(sourceName)) throw new Error('Choose a valid .rbxlx file.');
  const scene = [];
  const assets = [];
  let instances = 0;
  let scripts = 0;
  let sounds = 0;
  let documentRoot = '';
  let sawRoot = false;
  let activeItems = [];
  const maxInstances = 10000;
  const maxTextPerItem = 1024 * 1024;
  const maxNodesPerItem = 20000;
  const maxNesting = 128;
  const xmlChild = (node, name) => node.children.find((item) => item.tagName === name) || null;
  const xmlNumberChild = (node, name, fallback) => {
    const value = Number(xmlChild(node, name)?.textContent);
    return Number.isFinite(value) ? value : fallback;
  };
  const xmlPropertyText = (properties, name, fallback = '') => properties.has(name)
    ? String(properties.get(name).textContent || '').trim()
    : fallback;
  const xmlVector = (node, names, fallback) => node
    ? names.map((name, index) => xmlNumberChild(node, name, fallback[index]))
    : [...fallback];
  const addAsset = (kind, name, value) => {
    const reference = String(value || '').trim();
    if (!reference || reference === 'null' || reference === 'rbxasset://') return;
    assets.push({ kind, name: name.slice(0, 120), reference: reference.slice(0, 200) });
    if (assets.length > 400) throw new Error('The place contains more than 400 external or script references.');
  };
  const processItem = (item) => {
    instances += 1;
    if (instances > maxInstances) throw new Error('The place must contain no more than 10,000 instances.');
    const className = String(item.attributes.class || 'Instance');
    const propertiesNode = xmlChild(item, 'Properties');
    const properties = new Map((propertiesNode?.children || [])
      .filter((property) => property.attributes.name)
      .map((property) => [property.attributes.name, property]));
    const name = xmlPropertyText(properties, 'Name', className).slice(0, 120);
    const read = (property) => xmlPropertyText(properties, property);
    if (['Part', 'MeshPart', 'WedgePart', 'CornerWedgePart', 'TrussPart', 'UnionOperation'].includes(className)) {
      if (scene.length >= 600) throw new Error('The place contains more than 600 supported parts.');
      const cframe = properties.get('CFrame') || properties.get('WorldPivotData');
      const cframePosition = cframe
        ? ['X', 'Y', 'Z'].map((axis) => xmlNumberChild(cframe, axis, 0))
        : [0, 0, 0];
      const rotation = cframe ? [
        xmlNumberChild(cframe, 'R00', 1), xmlNumberChild(cframe, 'R01', 0), xmlNumberChild(cframe, 'R02', 0),
        xmlNumberChild(cframe, 'R10', 0), xmlNumberChild(cframe, 'R11', 1), xmlNumberChild(cframe, 'R12', 0),
        xmlNumberChild(cframe, 'R20', 0), xmlNumberChild(cframe, 'R21', 0), xmlNumberChild(cframe, 'R22', 1)
      ] : [1, 0, 0, 0, 1, 0, 0, 0, 1];
      const position = properties.get('Position')
        ? xmlVector(properties.get('Position'), ['X', 'Y', 'Z'], cframePosition)
        : cframePosition;
      const size = xmlVector(properties.get('size') || properties.get('Size'), ['X', 'Y', 'Z'], [4, 1, 2]);
      if ([...position, ...size, ...rotation].some((value) => !Number.isFinite(value) || Math.abs(value) > 100000)) {
        throw new Error('The place contains invalid geometry values.');
      }
      const color3 = properties.get('Color3');
      const colorNode = color3 || properties.get('Color3uint8');
      const color = colorNode
        ? ['R', 'G', 'B'].map((channel, index) => {
          const value = color3 ? xmlNumberChild(colorNode, channel, 0.6) : Number(colorNode.textContent) >>> (16 - index * 8) & 255;
          return Math.round(Math.max(0, Math.min(1, color3 ? value : value / 255)) * 255).toString(16).padStart(2, '0');
        }).join('')
        : '999999';
      const shapeToken = Number(read('Shape') || 1);
      const shape = className === 'WedgePart' ? 'Wedge'
        : className === 'CornerWedgePart' ? 'CornerWedge'
          : shapeToken === 0 ? 'Ball' : shapeToken === 2 ? 'Cylinder' : 'Block';
      const rawTransparency = Number(read('Transparency') || 0);
      scene.push({
        name, className, position,
        size: size.map((value) => Math.max(0.05, Math.min(100000, value))),
        rotation, color: `#${color}`,
        transparency: Number.isFinite(rawTransparency) ? Math.max(0, Math.min(1, rawTransparency)) : 0,
        shape
      });
    }
    if (['Script', 'LocalScript', 'ModuleScript'].includes(className)) {
      scripts += 1;
      addAsset('script', name, 'Source omitted; scripts are never executed.');
    } else if (className === 'Sound') {
      sounds += 1;
      addAsset('audio', name, read('SoundId'));
    } else if (['Decal', 'Texture'].includes(className)) {
      addAsset('image', name, read('Texture'));
    } else if (['MeshPart', 'SpecialMesh'].includes(className)) {
      addAsset('mesh', name, read('MeshId'));
      addAsset('image', `${name} texture`, read('TextureID') || read('TextureId'));
    } else if (className === 'Animation') {
      addAsset('animation', name, read('AnimationId'));
    }
  };
  return new Promise((resolve, reject) => {
    const parser = new SaxesParser({ xmlns: false });
    const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    let settled = false;
    const finish = (error, project) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve(project);
    };
    const fail = (error) => {
      stream.destroy();
      finish(error);
    };
    parser.on('doctype', () => fail(new Error('XML document types are not accepted in imported place files.')));
    parser.on('error', fail);
    parser.on('opentag', (tag) => {
      if (!sawRoot) {
        sawRoot = true;
        documentRoot = tag.name;
        if (documentRoot !== 'roblox') fail(new Error('This is not a valid XML-format Roblox place.'));
        return;
      }
      if (tag.name === 'Item') {
        if (instances + activeItems.length >= maxInstances) {
          fail(new Error('The place must contain no more than 10,000 instances.'));
          return;
        }
        const root = { tagName: 'Item', attributes: tag.attributes, children: [], textContent: '' };
        activeItems.push({ root, nodes: [root], nodeCount: 1, textLength: 0 });
        return;
      }
      const context = activeItems[activeItems.length - 1];
      if (!context) return;
      if (context.nodes.length >= maxNesting || ++context.nodeCount > maxNodesPerItem) {
        fail(new Error('An instance in the XML place exceeds parser structure limits.'));
        return;
      }
      const node = { tagName: tag.name, attributes: tag.attributes, children: [], textContent: '' };
      context.nodes[context.nodes.length - 1].children.push(node);
      context.nodes.push(node);
    });
    const handleText = (text) => {
      const context = activeItems[activeItems.length - 1];
      if (!context) return;
      if (context.nodes.some((node) => String(node.attributes?.name || '').toLowerCase() === 'source')) return;
      context.textLength += Buffer.byteLength(text, 'utf8');
      if (context.textLength > maxTextPerItem) {
        fail(new Error('A single XML instance contains more than 1 MB of parsed property text.'));
        return;
      }
      const node = context.nodes[context.nodes.length - 1];
      if (node) node.textContent += text;
    };
    parser.on('text', handleText);
    parser.on('cdata', handleText);
    parser.on('closetag', (tag) => {
      if (tag.name === 'Item') {
        const context = activeItems.pop();
        if (!context) return;
        processItem(context.root);
        const parent = activeItems[activeItems.length - 1];
        if (parent) parent.textLength += context.textLength;
        return;
      }
      const context = activeItems[activeItems.length - 1];
      if (!context || context.nodes.length <= 1) return;
      const closed = context.nodes.pop();
      const parent = context.nodes[context.nodes.length - 1];
      if (parent && !context.nodes.some((node) => String(node.attributes?.name || '').toLowerCase() === 'source')) {
        parent.textContent += closed.textContent;
      }
    });
    stream.on('data', (chunk) => {
      try { parser.write(chunk); } catch (error) { fail(error); }
    });
    stream.on('error', fail);
    stream.on('end', () => {
      try {
        parser.close();
        if (documentRoot !== 'roblox' || !sawRoot || activeItems.length || !instances) {
          throw new Error('The XML place is empty or incomplete.');
        }
        const uniqueAssets = [...new Map(assets.map((asset) =>
          [`${asset.kind}:${asset.name}:${asset.reference}`, asset]
        )).values()];
        finish(null, {
          title: sourceName.replace(/\.rbxlx$/i, '').slice(0, 80) || 'Imported Place',
          sourceName,
          sourceFormat: 'rbxlx',
          scene,
          assets: uniqueAssets,
          summary: { instances, parts: scene.length, scripts, sounds }
        });
      } catch (error) {
        fail(error);
      }
    });
  });
}
function reserveBinaryImport(req, res, next) {
  if (activeBinaryImports >= 1) return res.status(503).json({ error: 'Another binary place is being processed. Try again when it finishes.' });
  activeBinaryImports += 1;
  req.binaryImportReserved = true;
  next();
}
function releaseBinaryImport(req) {
  if (!req.binaryImportReserved) return;
  req.binaryImportReserved = false;
  activeBinaryImports = Math.max(0, activeBinaryImports - 1);
}
function parseBinaryPlaceInWorker(filePath, originalName) {
  return new Promise((resolve, reject) => {
    const worker = fork(path.join(__dirname, 'binary-import-worker.js'), [], {
      stdio: ['ignore', 'ignore', 'ignore', 'ipc']
    });
    let completed = false;
    const finish = (error, project) => {
      if (completed) return;
      completed = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve(project);
    };
    const timeout = setTimeout(() => {
      worker.kill();
      finish(new Error('Binary place processing timed out. Try a smaller place or a machine with more resources.'));
    }, 60 * 60 * 1000);
    worker.once('error', (error) => finish(error));
    worker.once('message', (result) => {
      if (result?.ok && result.project) finish(null, result.project);
      else finish(new Error(typeof result?.error === 'string' ? result.error : 'Binary place processing failed.'));
    });
    worker.once('exit', (code, signal) => {
      if (!completed) finish(new Error(`Binary place processor exited unexpectedly (${signal || code}).`));
    });
    worker.send({ filePath, originalName }, (error) => {
      if (error) {
        worker.kill();
        finish(error);
      }
    });
  });
}
function sanitizeImportedProject(body, trustedProject = null) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Provide an imported project.');
  if (!['rbxlx', 'rbxl'].includes(body.sourceFormat)) throw new Error('Only RBXLX and RBXL imports can be saved.');
  const expectedExtension = body.sourceFormat === 'rbxl' ? /\.rbxl$/i : /\.rbxlx$/i;
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 80) : '';
  const sourceName = typeof body.sourceName === 'string' ? path.posix.basename(body.sourceName.replace(/\\/g, '/')).slice(0, 180) : '';
  if (!title || !sourceName || !Array.isArray(body.scene) || !Array.isArray(body.assets)) {
    throw new Error('Project title, source file, scene, and asset inventory are required.');
  }
  if (!expectedExtension.test(sourceName) || /[\u0000-\u001f]/.test(title + sourceName)) {
    throw new Error(`Use a valid ${body.sourceFormat.toUpperCase()} source filename and project title.`);
  }
  if (body.scene.length > 600 || body.assets.length > 400) {
    throw new Error('Imports are limited to 600 supported parts and 400 asset references.');
  }
  const scene = body.scene.map((part) => {
    if (!part || typeof part !== 'object' || !['Part', 'MeshPart', 'WedgePart', 'CornerWedgePart', 'TrussPart', 'UnionOperation'].includes(part.className)) {
      throw new Error('The imported scene contains an unsupported part.');
    }
    if (typeof part.name !== 'string' || part.name.length > 120 || !Array.isArray(part.position) || part.position.length !== 3 ||
        !Array.isArray(part.size) || part.size.length !== 3 || !Array.isArray(part.rotation) || part.rotation.length !== 9 ||
        [...part.position, ...part.size, ...part.rotation].some((value) => typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 100000) ||
        part.size.some((value) => value <= 0) || typeof part.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(part.color) ||
        typeof part.transparency !== 'number' || !Number.isFinite(part.transparency) || part.transparency < 0 || part.transparency > 1 ||
        !['Block', 'Ball', 'Cylinder', 'Wedge', 'CornerWedge'].includes(part.shape)) {
      throw new Error('The imported scene contains invalid geometry or material data.');
    }
    return {
      name: part.name,
      className: part.className,
      position: part.position,
      size: part.size,
      rotation: part.rotation,
      color: part.color,
      transparency: part.transparency,
      shape: part.shape
    };
  });
  const assets = body.assets.map((asset) => {
    if (!asset || typeof asset !== 'object' || !['image', 'mesh', 'audio', 'animation', 'script', 'other'].includes(asset.kind) ||
        typeof asset.name !== 'string' || asset.name.length > 120 ||
        typeof asset.reference !== 'string' || asset.reference.length > 200 ||
        /[\u0000-\u001f]/.test(asset.reference)) {
      throw new Error('The imported project contains an invalid asset reference.');
    }
    return { kind: asset.kind, name: asset.name, reference: asset.reference };
  });
  const summary = body.summary && typeof body.summary === 'object' ? body.summary : {};
  const counts = {};
  for (const key of ['instances', 'parts', 'scripts', 'sounds']) {
    if (!Number.isInteger(summary[key]) || summary[key] < 0 || summary[key] > 10000) throw new Error('The import summary is invalid.');
    counts[key] = summary[key];
  }
  if (!counts.instances || counts.parts !== scene.length || counts.parts > counts.instances ||
      counts.scripts > counts.instances || counts.sounds > counts.instances) {
    throw new Error('The import summary does not match the saved scene.');
  }
  const sourceUrl = typeof body.sourceUrl === 'string' ? body.sourceUrl.slice(0, 300) : '';
  const license = typeof body.license === 'string' ? body.license.slice(0, 40) : 'User-provided';
  const catalogFileId = typeof body.catalogFileId === 'string' ? body.catalogFileId.slice(0, 600) : '';
  if (sourceUrl) {
    let parsedSource;
    try { parsedSource = new URL(sourceUrl); } catch { throw new Error('The project source link is invalid.'); }
    if (parsedSource.protocol !== 'https:' || parsedSource.hostname !== 'github.com' || !/^\/[\w.-]+\/[\w.-]+\/?$/.test(parsedSource.pathname) ||
        !IMPORT_LICENSES.has(license) || !catalogFileId) {
      throw new Error('Catalog imports must retain their GitHub repository link and recognized redistribution-friendly license.');
    }
    const cachedEntry = findCachedCatalogFile(catalogFileId);
    const entryMatches = (entry) => entry && entry.sourceUrl === sourceUrl &&
      entry.license === license && entry.fileName === sourceName;
    if (!entryMatches(cachedEntry) && !(
      trustedProject?.catalogFileId === catalogFileId &&
      trustedProject.sourceUrl === sourceUrl &&
      trustedProject.license === license &&
      trustedProject.sourceName === sourceName
    )) {
      throw new Error('Catalog source and license must match a verified catalog entry.');
    }
  } else if (license !== 'User-provided' || catalogFileId) {
    throw new Error('A project license requires its GitHub repository source link.');
  }
  const project = { title, sourceName, sourceFormat: 'rbxlx', sourceUrl, license, catalogFileId, scene, assets, summary: counts };
  if (Buffer.byteLength(JSON.stringify(project), 'utf8') > 450000) throw new Error('The imported project is too large to save.');
  return project;
}
async function findLicensedPlaceFiles(searchTerm, requestedLicense) {
  const cacheKey = `${searchTerm.toLowerCase()}:${requestedLicense || 'all'}`;
  const cached = importCatalogCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.files;

  const githubHeaders = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Anti-Null-Mega-Hub-Import-Catalog'
  };
  const searchUrl = new URL('https://api.github.com/search/repositories');
  searchUrl.searchParams.set('q', `roblox ${searchTerm} in:name,description,readme${requestedLicense ? ` license:${IMPORT_LICENSES.get(requestedLicense)}` : ''}`);
  searchUrl.searchParams.set('sort', 'updated');
  searchUrl.searchParams.set('per_page', '50');
  const searchResponse = await fetch(searchUrl, { headers: githubHeaders, signal: AbortSignal.timeout(8000) });
  if (!searchResponse.ok) throw new Error(`GitHub repository search returned ${searchResponse.status}.`);
  const searchResult = await searchResponse.json();
  const candidates = (searchResult.items || [])
    .filter((repo) => IMPORT_LICENSES.has(repo.license?.spdx_id) &&
      (!requestedLicense || repo.license.spdx_id === requestedLicense) && repo.default_branch)
    .slice(0, 20);
  let nextCandidate = 0;
  const fileResults = [];
  async function inspectRepositories() {
    while (nextCandidate < candidates.length && fileResults.length < 100) {
      const repo = candidates[nextCandidate++];
      const repoPath = repo.full_name.split('/').map(encodeURIComponent).join('/');
      const treeUrl = `https://api.github.com/repos/${repoPath}/git/trees/${encodeURIComponent(repo.default_branch)}?recursive=1`;
      const response = await fetch(treeUrl, { headers: githubHeaders, signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error(`GitHub repository tree returned ${response.status}.`);
      const tree = await response.json();
      for (const file of (tree.tree || [])) {
        if (file.type !== 'blob' || file.path.length > 400 || !/\.rbxlx$/i.test(file.path) || !Number.isInteger(file.size) || file.size > 15 * 1024 * 1024) continue;
        const [owner, name] = repo.full_name.split('/');
        const encodedPath = file.path.split('/').map(encodeURIComponent).join('/');
        fileResults.push({
          id: `${repo.full_name}:${file.path}`,
          title: path.parse(file.path).name,
          fileName: path.basename(file.path),
          repository: repo.full_name,
          description: String(repo.description || 'Community Roblox place file.').slice(0, 220),
          license: repo.license.spdx_id,
          licenseName: repo.license.name,
          sourceUrl: `https://github.com/${repo.full_name}`,
          downloadUrl: `https://raw.githubusercontent.com/${owner}/${name}/${encodeURIComponent(repo.default_branch)}/${encodedPath}`,
          fileSize: file.size
        });
        if (fileResults.length >= 100) break;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(5, candidates.length) }, () => inspectRepositories()));
  const files = fileResults;
  importCatalogCache.set(cacheKey, { files, expiresAt: Date.now() + 10 * 60 * 1000 });
  if (importCatalogCache.size > 100) {
    const oldestKey = importCatalogCache.keys().next().value;
    importCatalogCache.delete(oldestKey);
  }
  return files;
}
app.get('/api/status', (_req, res) => res.json({ database: mongoose.connection.readyState === 1, bootstrapAvailable: Boolean(process.env.INITIAL_ADMIN_TOKEN && process.env.INITIAL_ADMIN_EMAIL) }));
app.post('/api/auth/signup', authLimiter, requireMongo, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  if (!/^\S+@\S+\.\S+$/.test(email) || username.length < 3 || username.length > 24 || password.length < 12) {
    return res.status(400).json({ error: 'Use a valid email, a 3-24 character username, and a password of at least 12 characters.' });
  }
  try {
    if (email === APP_OWNER.email.toLowerCase()) {
      const owner = await ensureOwnerAccount();
      return res.status(201).json({ token: signToken(owner), user: publicUser(owner), pending: false, message: 'Owner access granted.' });
    }
    const user = await User.create({ email, username, passwordHash: await bcrypt.hash(password, 12) });
    res.status(201).json({ pending: true, user: publicUser(user), message: 'Your request is pending administrator approval.' });
  } catch (error) {
    res.status(error.code === 11000 ? 409 : 400).json({ error: error.code === 11000 ? 'Email already registered.' : 'Could not create account.' });
  }
});
app.post('/api/auth/login', authLimiter, requireMongo, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (email === APP_OWNER.email.toLowerCase() && password === APP_OWNER.password) {
    const owner = await ensureOwnerAccount();
    return res.json({ token: signToken(owner), user: publicUser(owner) });
  }
  const user = await User.findOne({ email });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ error: 'Email or password is incorrect.' });
  if (user.banned) return res.status(403).json({ error: 'This account has been banned.' });
  if (!user.approved) return res.status(403).json({ pending: true, error: 'Your account is awaiting administrator approval.' });
  res.json({ token: signToken(user), user: publicUser(user) });
});
app.post('/api/bootstrap', authLimiter, requireMongo, async (req, res) => {
  const configuredEmail = String(process.env.INITIAL_ADMIN_EMAIL || '').trim().toLowerCase();
  const configuredToken = process.env.INITIAL_ADMIN_TOKEN || '';
  const supplied = String(req.body.token || '');
  const validToken = configuredToken && supplied.length === configuredToken.length && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(configuredToken));
  if (!validToken || String(req.body.email || '').trim().toLowerCase() !== configuredEmail) return res.status(403).json({ error: 'Bootstrap credentials are invalid.' });
  if (await User.exists({ isAdmin: true })) return res.status(409).json({ error: 'An administrator already exists.' });
  const password = String(req.body.password || '');
  const username = String(req.body.username || '').trim();
  if (password.length < 12 || username.length < 3 || username.length > 24) return res.status(400).json({ error: 'Choose a 12+ character password and a 3-24 character username.' });
  try {
    const user = await User.create({ email: configuredEmail, username, passwordHash: await bcrypt.hash(password, 12), approved: true, hasHammers: true, isAdmin: true, role: 'Administrator', roleColor: '#f5b942' });
    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  } catch (_error) { res.status(409).json({ error: 'That admin account already exists.' }); }
});
app.get('/api/me', requireMongo, requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));
app.patch('/api/profile', requireMongo, requireAuth, async (req, res) => {
  if (typeof req.body.bio === 'string') req.user.bio = req.body.bio.slice(0, 250);
  if (typeof req.body.avatar === 'string' && /^\/uploads\/[\w.-]+$/.test(req.body.avatar)) req.user.avatar = req.body.avatar;
  await req.user.save();
  res.json({ user: publicUser(req.user) });
});
app.get('/api/games/profile', arcadeLimiter, requireMongo, requireAuth, async (req, res) => {
  const profile = await getOrCreateGameProfile(req.user._id);
  res.json({ profile: publicGameProfile(profile) });
});
app.get('/api/imports', arcadeLimiter, requireMongo, requireAuth, async (req, res) => {
  const projects = await ImportedProject.find({ user: req.user._id })
    .select('title sourceName sourceFormat summary createdAt updatedAt')
    .sort({ updatedAt: -1 })
    .limit(40)
    .lean();
  res.json({ projects: projects.map((project) => ({ ...project, id: String(project._id) })) });
});
app.post('/api/imports/parse-place', binaryImportLimiter, requireMongo, requireAuth, reserveBinaryImport, placeFileUpload.single('file'), (req, res) => {
  if (!req.file) {
    releaseBinaryImport(req);
    return res.status(400).json({ error: 'Choose a .rbxl or .rbxlx file to import.' });
  }
  void (async () => {
    try {
      const project = await parseBinaryPlaceInWorker(req.file.path, req.file.originalname);
      res.json({ project });
    } catch (error) {
      console.warn(`Roblox place import rejected: ${error.message}`);
      if (!res.headersSent) res.status(400).json({ error: `Place could not be decoded: ${error.message}` });
    } finally {
      releaseBinaryImport(req);
      try {
        await fs.promises.rm(req.file.path, { force: true });
      } catch (error) {
        console.error(`Temporary binary place cleanup failed: ${error.message}`);
      }
    }
  })();
});
app.get('/api/import-catalog', importCatalogLimiter, requireMongo, requireAuth, async (req, res) => {
  const searchTerm = String(req.query.q || '').replace(/[^a-zA-Z0-9 _.-]/g, '').trim().replace(/\s+/g, ' ').slice(0, 60) || 'place file';
  const license = String(req.query.license || '');
  if (license && !IMPORT_LICENSES.has(license)) return res.status(400).json({ error: 'Choose a supported redistribution-friendly license filter.' });
  try {
    const files = await findLicensedPlaceFiles(searchTerm, license);
    res.set('Cache-Control', 'private, max-age=60');
    res.json({
      files,
      searchTerm,
      licenses: [...IMPORT_LICENSES.keys()],
      notice: 'Only public repositories with recognized redistribution-friendly licenses are listed. Verify the file is covered by its repository license and retain attribution.'
    });
  } catch (error) {
    console.error(`Import catalog search failed: ${error.message}`);
    res.status(502).json({ error: 'The authorized-file catalog is temporarily unavailable. Try again later.' });
  }
});
app.get('/api/import-catalog/file', arcadeLimiter, requireMongo, requireAuth, async (req, res) => {
  const fileId = String(req.query.id || '');
  const entry = findCachedCatalogFile(fileId);
  if (!entry || !/^https:\/\/raw\.githubusercontent\.com\/[\w.-]+\/[\w.-]+\//.test(entry.downloadUrl)) {
    return res.status(404).json({ error: 'That catalog entry has expired. Search again to refresh the list.' });
  }
  try {
    const response = await fetch(entry.downloadUrl, { signal: AbortSignal.timeout(12000), redirect: 'error' });
    if (!response.ok) return res.status(502).json({ error: `The source file could not be downloaded (${response.status}).` });
    const contentLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > 15 * 1024 * 1024) {
      return res.status(413).json({ error: 'The source file exceeds the 15 MB import limit.' });
    }
    const reader = response.body.getReader();
    const chunks = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > 15 * 1024 * 1024) {
        await reader.cancel();
        return res.status(413).json({ error: 'The source file exceeds the 15 MB import limit.' });
      }
      chunks.push(Buffer.from(value));
    }
    res.type('text/plain').send(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    console.error(`Import catalog file download failed: ${error.message}`);
    res.status(502).json({ error: 'The source file could not be downloaded. Try again later.' });
  }
});
app.get('/api/imports/:id', arcadeLimiter, requireMongo, requireAuth, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Imported project not found.' });
  const project = await ImportedProject.findOne({ _id: req.params.id, user: req.user._id }).lean();
  if (!project) return res.status(404).json({ error: 'Imported project not found.' });
  res.json({ project: { ...project, id: String(project._id) } });
});
app.post('/api/imports', arcadeLimiter, requireMongo, requireAuth, async (req, res) => {
  let projectData;
  try {
    projectData = sanitizeImportedProject(req.body);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  const project = await ImportedProject.create({ ...projectData, user: req.user._id });
  res.status(201).json({ project: { ...project.toObject(), id: String(project._id) } });
});
app.patch('/api/imports/:id', arcadeLimiter, requireMongo, requireAuth, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Imported project not found.' });
  const existing = await ImportedProject.findOne({ _id: req.params.id, user: req.user._id }).lean();
  if (!existing) return res.status(404).json({ error: 'Imported project not found.' });
  let projectData;
  try {
    projectData = sanitizeImportedProject(req.body, existing);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  const project = await ImportedProject.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { $set: projectData },
    { new: true, runValidators: true }
  ).lean();
  if (!project) return res.status(404).json({ error: 'Imported project not found.' });
  res.json({ project: { ...project, id: String(project._id) } });
});
app.delete('/api/imports/:id', arcadeLimiter, requireMongo, requireAuth, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Imported project not found.' });
  const deleted = await ImportedProject.findOneAndDelete({ _id: req.params.id, user: req.user._id });
  if (!deleted) return res.status(404).json({ error: 'Imported project not found.' });
  res.json({ deleted: true });
});
app.patch('/api/games/settings', arcadeLimiter, requireMongo, requireAuth, async (req, res) => {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const updates = {};
  for (const key of ['music', 'effects']) {
    if (body[key] === undefined) continue;
    if (typeof body[key] !== 'number' || !Number.isFinite(body[key]) || body[key] < 0 || body[key] > 1) {
      return res.status(400).json({ error: `The ${key} setting must be a number from 0 to 1.` });
    }
    updates[`settings.${key}`] = body[key];
  }
  if (!Object.keys(updates).length) return res.status(400).json({ error: 'At least one valid setting is required.' });
  const profile = await getOrCreateGameProfile(req.user._id);
  for (const [path, value] of Object.entries(updates)) {
    const [parent, key] = path.split('.');
    profile[parent][key] = value;
  }
  await profile.save();
  res.json({ settings: profile.settings });
});
app.post('/api/games/story/choice', arcadeLimiter, requireMongo, requireAuth, async (req, res) => {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const choiceId = body.choiceId;
  if (!['listen', 'hold', 'cross'].includes(choiceId)) return res.status(400).json({ error: 'Choose a valid route through the seam.' });
  const updatedProfile = await recordStoryChoice(req.user._id, choiceId);
  if (!updatedProfile) return res.status(409).json({ error: 'Your story chapter is already at its limit.' });
  res.json({ profile: publicGameProfile(updatedProfile) });
});
app.post('/api/games/echoes/challenge', arcadeLimiter, requireMongo, requireAuth, async (req, res) => {
  const profile = await getOrCreateGameProfile(req.user._id);
  const available = Object.entries(GAME_ECHOES).filter(([id]) => !profile.echoes.includes(id));
  if (!available.length) return res.status(409).json({ error: 'You have cataloged every known sound-form.' });
  const requestedEchoId = req.body?.echoId;
  const selectedEcho = typeof requestedEchoId === 'string'
    ? available.find(([id]) => id === requestedEchoId)
    : available[Math.floor(Math.random() * available.length)];
  if (!selectedEcho) return res.status(409).json({ error: 'That signal is no longer available to catch.' });
  const [echoId, echo] = selectedEcho;
  const challengeId = crypto.randomUUID();
  profile.activeEchoChallenge = { challengeId, echoId, expiresAt: new Date(Date.now() + 2 * 60 * 1000) };
  await profile.save();
  res.status(201).json({
    challengeId,
    echo: { id: echoId, name: echo.name, glyph: echo.glyph, type: echo.type },
    trace: echo.tones
  });
});
app.post('/api/games/echoes/claim', arcadeLimiter, requireMongo, requireAuth, async (req, res) => {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const { challengeId, trace } = body;
  if (typeof challengeId !== 'string' || !Array.isArray(trace) || trace.length !== 3 || trace.some((tone) => !Number.isInteger(tone) || tone < 0 || tone > 2)) {
    return res.status(400).json({ error: 'A valid challenge and three-tone trace are required.' });
  }
  const profile = await getOrCreateGameProfile(req.user._id);
  const challenge = profile.activeEchoChallenge;
  if (!challenge || challenge.challengeId !== challengeId || challenge.expiresAt <= new Date()) {
    return res.status(409).json({ error: 'That scan expired. Start a new scan.' });
  }
  const echo = GAME_ECHOES[challenge.echoId];
  if (!echo || trace.some((tone, index) => tone !== echo.tones[index])) {
    await GameProfile.updateOne(
      { user: req.user._id, 'activeEchoChallenge.challengeId': challengeId },
      { $unset: { activeEchoChallenge: '' } }
    );
    return res.status(400).json({ error: 'The trace did not match. The echo slipped away.' });
  }
  const updatedProfile = await GameProfile.findOneAndUpdate({
    user: req.user._id,
    echoes: { $ne: challenge.echoId },
    'activeEchoChallenge.challengeId': challengeId,
    'activeEchoChallenge.expiresAt': { $gt: new Date() }
  }, {
    $addToSet: { echoes: challenge.echoId },
    $inc: { xp: 20, credits: 5 },
    $unset: { activeEchoChallenge: '' }
  }, { new: true });
  if (!updatedProfile) return res.status(409).json({ error: 'That scan expired or has already been cataloged.' });
  res.status(201).json({ echo: { id: challenge.echoId, name: echo.name, glyph: echo.glyph, type: echo.type }, profile: publicGameProfile(updatedProfile) });
});
app.post('/api/games/rewards', arcadeLimiter, requireMongo, requireAuth, async (req, res) => {
  const gameRewards = {
    'fracture-run': { xp: 25, credits: 10 },
    'archive-walk': { xp: 15, credits: 5 },
    'beat-relay': { xp: 10, credits: 3 },
    'echo-cabinet': { xp: 10, credits: 3 },
    'ashen-frontier': { xp: 20, credits: 8 }
  };
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const { gameId, claimId } = body;
  if (!gameRewards[gameId] || typeof claimId !== 'string' || !/^[0-9a-f-]{36}$/i.test(claimId)) {
    return res.status(400).json({ error: 'The game completion claim is invalid.' });
  }
  const profile = await getOrCreateGameProfile(req.user._id);
  const now = new Date();
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  await GameProfile.updateOne({ _id: profile._id }, { $pull: { rewardClaims: { createdAt: { $lte: cutoff } } } });
  profile.rewardClaims = profile.rewardClaims.filter((claim) => claim.createdAt > cutoff);
  if (profile.rewardClaims.some((claim) => claim.claimId === claimId)) return res.status(409).json({ error: 'That completion was already recorded.' });
  if (profile.rewardClaims.filter((claim) => claim.gameId === gameId).length >= 12) return res.status(429).json({ error: 'Daily reward limit reached for this game.' });
  const reward = gameRewards[gameId];
  const updatedProfile = await GameProfile.findOneAndUpdate({
    _id: profile._id,
    rewardClaims: { $not: { $elemMatch: { claimId } } }
  }, {
    $push: { rewardClaims: { claimId, gameId, createdAt: now } },
    $inc: { xp: reward.xp, credits: reward.credits }
  }, { new: true });
  if (!updatedProfile) return res.status(409).json({ error: 'That completion was already recorded.' });
  res.status(201).json({ reward, profile: publicGameProfile(updatedProfile) });
});
const storage = multer.diskStorage({ destination: uploadDir, filename: (_req, file, done) => done(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`) });
const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 }, fileFilter: (_req, file, done) => {
  const allowed = /^(image\/(png|jpeg|webp|gif)|audio\/(mpeg|wav|ogg)|model\/(gltf\+json)|application\/octet-stream)$/;
  done(allowed.test(file.mimetype) ? null : new Error('Unsupported file type.'), allowed.test(file.mimetype));
} });
app.post('/api/upload', requireMongo, requireAuth, upload.single('file'), (req, res) => res.status(201).json({ url: `/uploads/${req.file.filename}`, name: req.file.originalname, mimeType: req.file.mimetype }));
app.get('/api/announcements', requireMongo, requireAuth, async (_req, res) => {
  res.json({ announcements: announcementStore.slice(0, 25) });
});
app.post('/api/announcements', requireMongo, requireAuth, requireAdmin, (req, res) => {
  const text = String(req.body.text || '').trim().slice(0, 2000);
  if (!text) return res.status(400).json({ error: 'Announcement text is required.' });
  const announcement = { id: crypto.randomUUID(), text, author: req.user.username, createdAt: new Date().toISOString() };
  announcementStore.unshift(announcement);
  if (announcementStore.length > 50) announcementStore.length = 50;
  io.emit('announcement', announcement);
  res.status(201).json({ announcement });
});
app.get('/api/messages', requireMongo, requireAuth, async (req, res) => {
  const room = String(req.query.room || 'global');
  if (!(await canJoinRoom(req.user, room))) return res.status(403).json({ error: 'You are not a member of this room.' });
  const messages = await Message.find({ room }).sort({ createdAt: -1 }).limit(100).lean();
  res.json({ messages: messages.reverse() });
});
app.get('/api/users', requireMongo, requireAuth, async (_req, res) => {
  const users = await User.find({ approved: true, banned: false }).select('username email avatar role').sort({ username: 1 }).lean();
  res.json({ users: users.map((user) => ({ id: String(user._id), email: user.email, username: user.username, avatar: user.avatar, role: user.role })) });
});
app.get('/api/admin/pending', requireMongo, requireAuth, requireAdmin, async (_req, res) => {
  const users = await User.find({ approved: false }).select('email username createdAt').sort({ createdAt: 1 }).lean();
  res.json({ users });
});
app.patch('/api/admin/users/:id', requireMongo, requireAuth, requireAdmin, async (req, res) => {
  const allowed = ['approved', 'hasHammers', 'banned', 'muted'];
  const update = {};
  for (const key of allowed) if (typeof req.body[key] === 'boolean') update[key] = req.body[key];
  const user = await User.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
  if (!user) return res.status(404).json({ error: 'User not found.' });
  if (user.banned) io.to(`user:${user.id}`).emit('account:revoked');
  res.json({ user: publicUser(user) });
});
app.post('/api/admin/broadcast', requireMongo, requireAuth, requireAdmin, (req, res) => {
  const text = String(req.body.text || '').trim().slice(0, 500);
  if (!text) return res.status(400).json({ error: 'Broadcast text is required.' });
  io.emit('void-toast', { text, createdAt: new Date().toISOString() });
  res.status(202).json({ sent: true });
});
app.post('/api/admin/glitch', requireMongo, requireAuth, requireAdmin, (_req, res) => {
  io.emit('reality-glitch', { createdAt: new Date().toISOString() });
  res.status(202).json({ ok: true });
});
app.post('/api/groups', requireMongo, requireAuth, async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 50);
  if (!name) return res.status(400).json({ error: 'Group name is required.' });
  const group = await Group.create({ name, members: [req.user._id] });
  res.status(201).json({ group: { id: String(group._id), name: group.name } });
});
app.use((error, req, res, _next) => {
  releaseBinaryImport(req);
  if (req.file?.path) {
    fs.promises.rm(req.file.path, { force: true }).catch((cleanupError) => {
      console.error(`Temporary binary place cleanup failed: ${cleanupError.message}`);
    });
  }
  const isMulterError = error instanceof multer.MulterError;
  const status = isMulterError ? (error.code === 'LIMIT_FILE_SIZE' ? 413 : 400) : 500;
  res.status(status).json({
    error: isMulterError
      ? error.code === 'LIMIT_FILE_SIZE' ? 'Place files are limited to 5 GB.' : error.message
      : 'The request could not be completed.'
  });
});

async function canJoinRoom(user, room) {
  if (room === 'global') return true;
  if (room.startsWith('dm:')) {
    const ids = room.slice(3).split(':');
    return ids.length === 2 && ids.includes(String(user._id)) && Boolean(await User.exists({ _id: { $in: ids }, approved: true, banned: false }));
  }
  if (room.startsWith('group:')) return Boolean(await Group.exists({ _id: room.slice(6), members: user._id }));
  return false;
}

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    const claims = jwt.verify(token, process.env.JWT_SECRET || 'local-development-secret-change-me');
    const user = await User.findById(claims.sub);
    if (!user || !user.approved || user.banned) return next(new Error('Unauthorized'));
    socket.data.user = user;
    next();
  } catch (_error) { next(new Error('Unauthorized')); }
});
const GAME_LOBBY_MODES = new Set(['fracture-run', 'resonance-grove']);
const gameLobbies = new Map();
const gameActionTimes = new Map();
const frontierPlayers = new Map();

function leaveFrontier(socket) {
  const player = frontierPlayers.get(socket.id);
  if (!player) return;
  frontierPlayers.delete(socket.id);
  socket.data.frontierOnline = false;
  socket.leave('frontier-world');
  io.to('frontier-world').emit('frontier:player:left', { id: socket.id });
}

function gameLobbyView(lobby) {
  const state = lobby.sharedState;
  return {
    id: lobby.id,
    gameId: lobby.gameId,
    hostId: lobby.hostId,
    players: [...lobby.players.values()].map(({ id, username, isAdmin, isOwner, character }) => ({ id, username, isAdmin, isOwner, character })),
    createdAt: lobby.createdAt,
    worldRevision: lobby.worldRevision,
    world: lobby.gameId === 'fracture-run'
      ? {
          chapter: state.chapter,
          positions: state.positions,
          decisionCount: Object.keys(state.decisions).length,
          lastOutcome: state.lastOutcome,
          teamShields: lobby.teamShields,
          overdriveActive: lobby.overdriveUntil > Date.now()
        }
      : {
          echo: state.echoId ? { id: state.echoId, ...GAME_ECHOES[state.echoId] } : null,
          traceLength: state.trace.length,
          targetTrace: state.echoId ? GAME_ECHOES[state.echoId].tones : [],
          discoveries: state.discoveries.length,
          teamShields: lobby.teamShields,
          overdriveActive: lobby.overdriveUntil > Date.now()
        }
  };
}

function createLobbyState(gameId, playerId) {
  if (gameId === 'fracture-run') {
    return {
      chapter: 1,
      positions: { [playerId]: { x: 2, y: 2 } },
      decisions: {},
      lastOutcome: 'A new route opens across the fractured sky.'
    };
  }
  const echoIds = Object.keys(GAME_ECHOES);
  return {
    echoId: echoIds[Math.floor(Math.random() * echoIds.length)],
    trace: [],
    discoveries: []
  };
}

function announceGameLobbies() {
  const lobbies = [...gameLobbies.values()].map(gameLobbyView);
  io.emit('arcade:lobbies:update', lobbies);
}

function leaveGameLobby(socket) {
  const lobbyId = socket.data.arcadeLobbyId;
  if (!lobbyId) return;
  const lobby = gameLobbies.get(lobbyId);
  socket.data.arcadeLobbyId = null;
  socket.leave(`arcade:${lobbyId}`);
  if (!lobby) return;
  const playerId = String(socket.data.user._id);
  lobby.players.delete(playerId);
  delete lobby.sharedState.positions?.[playerId];
  delete lobby.sharedState.decisions?.[playerId];
  if (!lobby.players.size) gameLobbies.delete(lobbyId);
  else {
    if (!lobby.players.has(lobby.hostId)) lobby.hostId = lobby.players.keys().next().value;
    io.to(`arcade:${lobbyId}`).emit('arcade:lobby:update', gameLobbyView(lobby));
  }
  announceGameLobbies();
}

function consumeGameAction(socket) {
  const now = Date.now();
  const history = (gameActionTimes.get(socket.id) || []).filter((time) => now - time < 1000);
  if (history.length >= 8) return false;
  history.push(now);
  gameActionTimes.set(socket.id, history);
  return true;
}

io.on('connection', (socket) => {
  const user = socket.data.user;
  socket.join(`user:${user.id}`);
  socket.on('frontier:join', (done = () => {}) => {
    const reply = typeof done === 'function' ? done : () => {};
    const alreadyJoined = Boolean(socket.data.frontierOnline);
    if (!alreadyJoined && frontierPlayers.size >= 120) return reply({ error: 'The frontier is at capacity. Try again shortly.' });
    const player = frontierPlayers.get(socket.id) || {
      id: socket.id,
      username: user.username,
      x: 0,
      z: 0
    };
    frontierPlayers.set(socket.id, player);
    socket.data.frontierOnline = true;
    socket.join('frontier-world');
    reply({ players: [...frontierPlayers.values()].filter((item) => item.id !== socket.id) });
    if (!alreadyJoined) socket.to('frontier-world').emit('frontier:player:joined', player);
  });
  socket.on('frontier:move', (position = {}) => {
    const player = frontierPlayers.get(socket.id);
    if (!player || !socket.data.frontierOnline || !consumeGameAction(socket)) return;
    if (!Number.isFinite(position.x) || !Number.isFinite(position.z) || Math.abs(position.x) > 68 || Math.abs(position.z) > 68) return;
    player.x = position.x;
    player.z = position.z;
    socket.to('frontier-world').emit('frontier:player:moved', player);
  });
  socket.on('frontier:leave', () => leaveFrontier(socket));
  socket.on('arcade:lobbies:list', (done = () => {}) => {
    if (typeof done === 'function') done({ lobbies: [...gameLobbies.values()].map(gameLobbyView) });
  });
  socket.on('arcade:lobby:create', (payload = {}, done = () => {}) => {
    const reply = typeof done === 'function' ? done : () => {};
    if (!GAME_LOBBY_MODES.has(payload?.gameId)) return reply({ error: 'Choose a supported arcade game.' });
    if (Date.now() - (socket.data.lastLobbyCreate || 0) < 5000) return reply({ error: 'Wait a few seconds before hosting another room.' });
    if (gameLobbies.size >= 100) return reply({ error: 'The arcade is at capacity. Try again shortly.' });
    socket.data.lastLobbyCreate = Date.now();
    leaveGameLobby(socket);
    const id = crypto.randomUUID();
    const isOwner = user.email === APP_OWNER.email.toLowerCase() && user.role === 'Owner';
    const player = {
      id: String(user._id),
      username: user.username,
      isAdmin: Boolean(user.isAdmin),
      isOwner,
      character: isOwner ? 'Prime Architect' : user.isAdmin ? 'Rift Warden' : 'Field Pilot'
    };
    const lobby = {
      id,
      gameId: payload.gameId,
      hostId: player.id,
      players: new Map([[player.id, player]]),
      createdAt: new Date().toISOString(),
      worldRevision: 0,
      sharedState: createLobbyState(payload.gameId, player.id),
      teamShields: 0,
      overdriveUntil: 0
    };
    gameLobbies.set(id, lobby);
    socket.data.arcadeLobbyId = id;
    socket.join(`arcade:${id}`);
    const view = gameLobbyView(lobby);
    reply({ lobby: view });
    socket.emit('arcade:lobby:update', view);
    announceGameLobbies();
  });
  socket.on('arcade:lobby:join', (payload = {}, done = () => {}) => {
    const reply = typeof done === 'function' ? done : () => {};
    const lobby = typeof payload?.id === 'string' ? gameLobbies.get(payload.id) : null;
    if (!lobby) return reply({ error: 'That arcade room is no longer available.' });
    if (!consumeGameAction(socket)) return reply({ error: 'Please wait before joining another room.' });
    const playerId = String(user._id);
    if (lobby.players.has(playerId) && socket.data.arcadeLobbyId === lobby.id) return reply({ lobby: gameLobbyView(lobby) });
    if (lobby.players.size >= 4 && !lobby.players.has(playerId)) return reply({ error: 'That arcade room is full.' });
    leaveGameLobby(socket);
    const player = {
      id: playerId,
      username: user.username,
      isAdmin: Boolean(user.isAdmin),
      isOwner: user.email === APP_OWNER.email.toLowerCase() && user.role === 'Owner',
      character: user.email === APP_OWNER.email.toLowerCase() && user.role === 'Owner' ? 'Prime Architect' : user.isAdmin ? 'Rift Warden' : 'Field Pilot'
    };
    lobby.players.set(playerId, player);
    if (lobby.gameId === 'fracture-run' && !lobby.sharedState.positions[playerId]) {
      lobby.sharedState.positions[playerId] = { x: 2, y: 2 };
    }
    socket.data.arcadeLobbyId = lobby.id;
    socket.join(`arcade:${lobby.id}`);
    const view = gameLobbyView(lobby);
    reply({ lobby: view });
    io.to(`arcade:${lobby.id}`).emit('arcade:lobby:update', view);
    announceGameLobbies();
  });
  socket.on('arcade:lobby:leave', (done = () => {}) => {
    leaveGameLobby(socket);
    if (typeof done === 'function') done({ ok: true });
  });
  socket.on('arcade:lobby:action', async (payload = {}, done = () => {}) => {
    const reply = typeof done === 'function' ? done : () => {};
    const lobbyId = socket.data.arcadeLobbyId;
    const lobby = lobbyId && gameLobbies.get(lobbyId);
    if (!lobby || !lobby.players.has(String(user._id)) || !consumeGameAction(socket)) return reply({ error: 'Action unavailable. Please wait or rejoin the room.' });
    const action = payload?.action;
    let safeAction;
    if (lobby.gameId === 'fracture-run' && action?.type === 'move' && ['north', 'south', 'east', 'west'].includes(action.direction)) {
      safeAction = { type: 'move', direction: action.direction };
    } else if (lobby.gameId === 'fracture-run' && action?.type === 'choice' && ['hold', 'listen', 'cross'].includes(action.choiceId)) {
      safeAction = { type: 'choice', choiceId: action.choiceId };
    } else if (lobby.gameId === 'resonance-grove' && lobby.sharedState.echoId && action?.type === 'tune' && Number.isInteger(action.tone) && action.tone >= 0 && action.tone <= 2) {
      safeAction = { type: 'tune', tone: action.tone };
    }
    if (!safeAction) return reply({ error: 'That action is not valid for this game.' });
    let activity;
    let progressionSaved = true;
    if (lobby.gameId === 'fracture-run' && safeAction.type === 'move') {
      const position = lobby.sharedState.positions[String(user._id)] || { x: 2, y: 2 };
      const distance = lobby.overdriveUntil > Date.now() ? 2 : 1;
      const next = { ...position };
      if (safeAction.direction === 'north') next.y -= distance;
      if (safeAction.direction === 'south') next.y += distance;
      if (safeAction.direction === 'east') next.x += distance;
      if (safeAction.direction === 'west') next.x -= distance;
      next.x = Math.max(0, Math.min(10, next.x));
      next.y = Math.max(0, Math.min(10, next.y));
      lobby.sharedState.positions[String(user._id)] = next;
      activity = `${user.username} moved ${safeAction.direction}.`;
    } else if (lobby.gameId === 'fracture-run' && safeAction.type === 'choice') {
      lobby.sharedState.decisions[String(user._id)] = safeAction.choiceId;
      if (Object.keys(lobby.sharedState.decisions).length >= lobby.players.size) {
        const votes = Object.values(lobby.sharedState.decisions);
        const selected = ['listen', 'hold', 'cross'].sort((a, b) =>
          votes.filter((vote) => vote === b).length - votes.filter((vote) => vote === a).length
        )[0];
        lobby.sharedState.chapter += 1;
        lobby.sharedState.lastOutcome = `The team chose to ${selected}. Chapter ${lobby.sharedState.chapter} begins.`;
        lobby.sharedState.decisions = {};
        for (const playerId of lobby.players.keys()) {
          try {
            if (!await recordStoryChoice(playerId, selected)) progressionSaved = false;
          } catch (error) {
            progressionSaved = false;
            console.error(`Co-op story progression save failed: ${error.message}`);
          }
        }
      }
      activity = `${user.username} chose ${safeAction.choiceId}.`;
    } else if (lobby.gameId === 'resonance-grove') {
      lobby.sharedState.trace.push(safeAction.tone);
      activity = `${user.username} tuned ${['LOW', 'MID', 'HIGH'][safeAction.tone]}.`;
      if (lobby.sharedState.trace.length === 3) {
        const echoId = lobby.sharedState.echoId;
        const echo = GAME_ECHOES[echoId];
        const matched = Boolean(echo && lobby.sharedState.trace.every((tone, index) => tone === echo.tones[index]));
        if (matched) {
          lobby.sharedState.trace = [];
          lobby.sharedState.discoveries.push(echoId);
          activity = `The team cataloged ${echo.name}.`;
          for (const playerId of lobby.players.keys()) {
            try {
              await addEchoToGameProfile(playerId, echoId);
            } catch (error) {
              progressionSaved = false;
              console.error(`Co-op echo progression save failed: ${error.message}`);
            }
          }
          const nextEchoIds = Object.keys(GAME_ECHOES).filter((id) => !lobby.sharedState.discoveries.includes(id));
          lobby.sharedState.echoId = nextEchoIds.length ? nextEchoIds[Math.floor(Math.random() * nextEchoIds.length)] : null;
        } else {
          if (lobby.teamShields > 0) {
            lobby.teamShields -= 1;
            lobby.sharedState.trace = [];
            activity = 'A team shield absorbed the missed trace. The same sound-form remains in range.';
          } else {
            lobby.sharedState.trace = [];
            const alternatives = Object.keys(GAME_ECHOES).filter((id) =>
              id !== echoId && !lobby.sharedState.discoveries.includes(id)
            );
            lobby.sharedState.echoId = alternatives.length ? alternatives[Math.floor(Math.random() * alternatives.length)] : echoId;
            activity = 'The shared trace missed. A new sound-form drifts into range.';
          }
        }
      }
    }
    const lobbyView = gameLobbyView(lobby);
    io.to(`arcade:${lobby.id}`).emit('arcade:lobby:update', lobbyView);
    io.to(`arcade:${lobby.id}`).emit('arcade:lobby:action', {
      lobbyId: lobby.id,
      playerId: String(user._id),
      username: user.username,
      gameId: lobby.gameId,
      action: safeAction,
      activity,
      world: lobbyView.world,
      createdAt: new Date().toISOString()
    });
    reply({ ok: true, progressionSaved });
  });
  socket.on('arcade:admin-action', async (payload = {}, done = () => {}) => {
    const reply = typeof done === 'function' ? done : () => {};
    try {
      const currentUser = await User.findById(user._id).select('email role isAdmin banned');
      if (!currentUser || currentUser.banned || !currentUser.isAdmin) return reply({ error: 'Administrator access required.' });
      const lobby = typeof payload?.lobbyId === 'string' ? gameLobbies.get(payload.lobbyId) : null;
      if (!lobby || !socket.rooms.has(`arcade:${lobby.id}`)) return reply({ error: 'Join that arcade room before using an ability.' });
      if (!['stabilize', 'overdrive'].includes(payload?.ability)) return reply({ error: 'Unknown administrator ability.' });
      if (!consumeGameAction(socket)) return reply({ error: 'Please wait before using another administrator ability.' });
      if (payload.ability === 'stabilize') lobby.teamShields = Math.min(9, lobby.teamShields + 3);
      else lobby.overdriveUntil = Date.now() + 60_000;
      io.to(`arcade:${lobby.id}`).emit('arcade:lobby:update', gameLobbyView(lobby));
      io.to(`arcade:${lobby.id}`).emit('arcade:admin-effect', { ability: payload.ability, actor: user.username });
      reply({ ok: true });
    } catch (error) {
      console.error(`Arcade admin action failed: ${error.message}`);
      reply({ error: 'The administrator ability could not be used.' });
    }
  });
  socket.on('arcade:owner-recompile', async (payload = {}, done = () => {}) => {
    const reply = typeof done === 'function' ? done : () => {};
    try {
      const currentUser = await User.findById(user._id).select('email role banned');
      if (!currentUser || currentUser.banned || currentUser.email !== APP_OWNER.email.toLowerCase() || currentUser.role !== 'Owner') {
        return reply({ error: 'This world ability is reserved for the Owner.' });
      }
      const lobby = typeof payload?.lobbyId === 'string' ? gameLobbies.get(payload.lobbyId) : null;
      if (!lobby || !socket.rooms.has(`arcade:${lobby.id}`)) return reply({ error: 'Join that arcade room before using the ability.' });
      if (!consumeGameAction(socket)) return reply({ error: 'Please wait before using another owner ability.' });
      lobby.worldRevision += 1;
      lobby.sharedState = createLobbyState(lobby.gameId, lobby.hostId);
      if (lobby.gameId === 'fracture-run') {
        for (const playerId of lobby.players.keys()) lobby.sharedState.positions[playerId] = { x: 2, y: 2 };
      }
      lobby.teamShields = 0;
      lobby.overdriveUntil = 0;
      io.to(`arcade:${lobby.id}`).emit('arcade:lobby:update', gameLobbyView(lobby));
      io.to(`arcade:${lobby.id}`).emit('arcade:world-recompiled', { revision: lobby.worldRevision, actor: user.username });
      reply({ ok: true });
    } catch (error) {
      console.error(`Arcade world recompile failed: ${error.message}`);
      reply({ error: 'The world could not be recompiled.' });
    }
  });
  socket.on('room:join', async (room, done = () => {}) => {
    if (typeof room !== 'string' || room.length > 100 || !(await canJoinRoom(user, room))) return done({ error: 'Room access denied.' });
    for (const joined of socket.rooms) {
      if (joined !== socket.id && joined !== `user:${user.id}` && !joined.startsWith('arcade:')) socket.leave(joined);
    }
    socket.join(room);
    const messages = await Message.find({ room }).sort({ createdAt: -1 }).limit(100).lean();
    done({ messages: messages.reverse() });
  });
  socket.on('chat:send', async (payload = {}, done = () => {}) => {
    if (user.muted) return done({ error: 'Your account is muted.' });
    const room = String(payload.room || 'global');
    const text = String(payload.text || '').trim().slice(0, 4000);
    const attachment = typeof payload.attachment === 'string' ? payload.attachment.trim() : '';
    if ((!text && !attachment) || !(await canJoinRoom(user, room)) || !socket.rooms.has(room)) return done({ error: 'Message could not be sent.' });
    const message = await Message.create({ room, sender: user._id, senderName: user.username, text, attachment });
    const item = { id: String(message._id), room, sender: String(user._id), senderName: user.username, text, attachment, createdAt: message.createdAt.toISOString() };
    io.to(room).emit('chat:message', item);
    done({ ok: true });
  });
  socket.on('call:signal', async ({ room, signal } = {}) => {
    if (typeof room === 'string' && signal && await canJoinRoom(user, room) && socket.rooms.has(room)) socket.to(room).emit('call:signal', { from: String(user._id), signal });
  });
  socket.on('disconnect', () => {
    leaveGameLobby(socket);
    leaveFrontier(socket);
    gameActionTimes.delete(socket.id);
  });
});

async function startServer({ port = Number(process.env.PORT) || 0 } = {}) {
  await new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, '0.0.0.0', resolve);
  });
  const address = httpServer.address();
  if (process.env.MONGODB_URI) {
    mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 })
      .then(ensureOwnerAccount)
      .catch((error) => {
        console.error('MongoDB connection or account initialization failed. Check MONGODB_URI and Atlas network access.');
        console.error(error.message);
      });
  } else {
    console.warn('MongoDB is not configured. Configure MONGODB_URI to enable accounts and social features.');
  }
  return { url: `http://127.0.0.1:${address.port}`, close: () => httpServer.close() };
}

if (require.main === module) {
  startServer({ port: Number(process.env.PORT) || 4174 })
    .then(({ url }) => console.log(`Anti-Null server listening at ${url}`))
    .catch((error) => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { startServer, parseBinaryPlace, parseXmlPlaceFile };
