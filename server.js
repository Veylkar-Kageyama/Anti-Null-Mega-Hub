'use strict';

require('dotenv').config();
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { Server } = require('socket.io');

const app = express();
app.set('trust proxy', 1);
const httpServer = http.createServer(app);
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

const APP_OWNER = {
  email: 'jskeltonjr2010@gmail.com',
  password: 'DandadanOka9!',
  username: 'Veylkar'
};

const announcementStore = [];

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
const arcadeLimiter = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });
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
app.use((error, _req, res, _next) => {
  const status = error instanceof multer.MulterError ? 400 : 500;
  res.status(status).json({ error: status === 400 ? error.message : 'The request could not be completed.' });
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

module.exports = { startServer };
