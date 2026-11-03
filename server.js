'use strict';

require('dotenv').config();
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const cors = require('cors');
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
const io = new Server(httpServer, {
  maxHttpBufferSize: 1e6,
  cors: { origin: process.env.CORS_ORIGIN || '*' }
});
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

const APP_OWNER = {
  email: 'jskeltonjr2010@gmail.com',
  password: 'DandadanOka9!',
  username: 'Veylkar'
};

const announcementStore = [];

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
app.disable('x-powered-by');
app.use(cors());
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
io.on('connection', (socket) => {
  const user = socket.data.user;
  socket.join(`user:${user.id}`);
  socket.on('room:join', async (room, done = () => {}) => {
    if (typeof room !== 'string' || room.length > 100 || !(await canJoinRoom(user, room))) return done({ error: 'Room access denied.' });
    for (const joined of socket.rooms) if (joined !== socket.id && joined !== `user:${user.id}`) socket.leave(joined);
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
});

async function connectToMongo(uri, shouldStop) {
  if (/[<>]/.test(uri)) {
    console.error('MONGO_URI still contains a placeholder. Replace it with the complete connection string from MongoDB Atlas.');
    return;
  }
  let retryDelayMs = 1000;
  while (!shouldStop()) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
      break;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (error?.code === 8000 || error?.codeName === 'AuthenticationFailed' || /bad auth|authentication failed/i.test(message)) {
        console.error('MongoDB authentication failed. Check that MONGO_URI uses a valid Atlas database user and URL-encoded credentials.');
        return;
      }
      console.error(`MongoDB connection failed; retrying in ${retryDelayMs}ms: ${message}`);
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, retryDelayMs);
        timer.unref();
      });
      retryDelayMs = Math.min(retryDelayMs * 2, 30000);
    }
  }
  if (shouldStop() || mongoose.connection.readyState !== 1) return;
  try {
    await ensureOwnerAccount();
  } catch (error) {
    console.error(`MongoDB connected, but account initialization failed: ${error.message}`);
  }
}

async function startServer({ port = Number(process.env.PORT) || 3000 } = {}) {
  await new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, '0.0.0.0', resolve);
  });
  const address = httpServer.address();
  let isClosing = false;
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (mongoUri) {
    connectToMongo(mongoUri, () => isClosing).catch((error) => {
      console.error(`MongoDB initialization failed: ${error.message}`);
    });
  } else {
    console.warn('MongoDB is not configured. Configure MONGO_URI to enable accounts and social features.');
  }
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => {
      isClosing = true;
      return httpServer.close();
    }
  };
}

if (require.main === module) {
  startServer()
    .then(({ url }) => console.log(`Anti-Null server listening at ${url}`))
    .catch((error) => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { startServer };
