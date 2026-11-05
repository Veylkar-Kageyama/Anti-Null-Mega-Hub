const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { startServer } = require('./server');

let mainWindow;
let hubServer;
let emulatorSaveDirectory = null;
const trustedWebContents = new Set();
const MAX_EMULATOR_SAVE_BYTES = 100 * 1024 * 1024;

function assertTrustedRenderer(event) {
  if (!hubServer || !trustedWebContents.has(event.sender)) {
    throw new Error('The local save request did not come from the A-Null app.');
  }
  try {
    if (new URL(event.senderFrame.url).origin !== new URL(hubServer.url).origin) {
      throw new Error('The local save request did not come from the A-Null app.');
    }
  } catch {
    throw new Error('The local save request did not come from the A-Null app.');
  }
}

function getSavePreferencePath() {
  return path.join(app.getPath('userData'), 'emulator-save-preferences.json');
}

async function loadSaveDirectory() {
  try {
    const preferences = JSON.parse(await fs.readFile(getSavePreferencePath(), 'utf8'));
    if (typeof preferences.directory !== 'string') return;
    const directory = await fs.realpath(preferences.directory);
    if ((await fs.stat(directory)).isDirectory()) emulatorSaveDirectory = directory;
  } catch (error) {
    if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) {
      console.warn(`Could not restore the emulator save folder: ${error.message}`);
    }
  }
}

async function chooseEmulatorSaveDirectory(event) {
  assertTrustedRenderer(event);
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: emulatorSaveDirectory || app.getPath('documents'),
    title: 'Choose a folder for local .rbxlx recovery saves'
  });
  if (result.canceled || !result.filePaths[0]) return null;
  emulatorSaveDirectory = await fs.realpath(result.filePaths[0]);
  await fs.writeFile(getSavePreferencePath(), JSON.stringify({ directory: emulatorSaveDirectory }), 'utf8');
  return emulatorSaveDirectory;
}

async function saveEmulatorFile(event, { title, content } = {}) {
  assertTrustedRenderer(event);
  if (!emulatorSaveDirectory) throw new Error('Choose a local save folder before saving.');
  if (typeof content !== 'string' || Buffer.byteLength(content, 'utf8') > MAX_EMULATOR_SAVE_BYTES ||
      !/^\s*<\?xml\b/i.test(content) || !/<roblox\b/i.test(content)) {
    throw new Error('The .rbxlx recovery content is invalid or too large.');
  }
  const safeTitle = String(title || 'Imported Place')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/[. ]+$/g, '')
    .slice(0, 80) || 'Imported Place';
  const fileName = `${safeTitle}.rbxlx`;
  const directory = await fs.realpath(emulatorSaveDirectory);
  if (!(await fs.stat(directory)).isDirectory()) {
    emulatorSaveDirectory = null;
    throw new Error('The chosen save folder is no longer available. Choose it again.');
  }
  const destination = path.join(directory, fileName);
  const temporary = path.join(directory, `.${safeTitle}.${crypto.randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' });
    await fs.rename(temporary, destination);
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => {});
    throw new Error(`Could not write ${fileName}: ${error.message}`);
  }
  return { fileName, savedAt: new Date().toISOString() };
}

async function loadEmulatorFile(event) {
  assertTrustedRenderer(event);
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    defaultPath: emulatorSaveDirectory || app.getPath('documents'),
    filters: [{ name: 'Roblox XML place and emulator recovery', extensions: ['rbxlx'] }],
    title: 'Load local .rbxlx recovery save'
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  const { size } = await fs.stat(filePath);
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_EMULATOR_SAVE_BYTES) {
    throw new Error('The selected .rbxlx file is empty or exceeds the 100 MB local recovery limit.');
  }
  return { fileName: path.basename(filePath), content: await fs.readFile(filePath, 'utf8') };
}

function sendMenuAction(action) {
  mainWindow?.webContents.send('menu:action', action);
}

function configureAppWindow(browserWindow) {
  const contents = browserWindow.webContents;
  trustedWebContents.add(contents);
  contents.setWindowOpenHandler(({ url }) => {
    let target;
    try { target = new URL(url); } catch { return { action: 'deny' }; }
    if (target.protocol === 'https:') {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    const appOrigin = hubServer && new URL(hubServer.url).origin;
    if (target.origin === appOrigin && ['/import.html', '/catalog.html'].includes(target.pathname)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
          }
        }
      };
    }
    return { action: 'deny' };
  });
  contents.on('did-create-window', (childWindow) => configureAppWindow(childWindow));
  browserWindow.once('closed', () => trustedWebContents.delete(contents));
}

function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'New Scene', accelerator: 'CmdOrCtrl+N', click: () => sendMenuAction('scene:new') },
        { label: 'Open Scene...', accelerator: 'CmdOrCtrl+O', click: () => sendMenuAction('scene:open') },
        { label: 'Save Scene', accelerator: 'CmdOrCtrl+S', click: () => sendMenuAction('scene:save') },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'togglefullscreen' }, { type: 'separator' }, { role: 'toggleDevTools', visible: !app.isPackaged }] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#140126',
    title: 'Anti-Null: Mega Hub',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  configureAppWindow(mainWindow);
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
  await mainWindow.loadURL(hubServer.url);
}

ipcMain.handle('app:choose-asset', async (_event, kind) => {
  const filters = {
    image: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
    model: [{ name: '3D Models', extensions: ['glb', 'gltf', 'obj'] }],
    audio: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg'] }],
    scene: [{ name: 'Anti-Null Scene', extensions: ['anull'] }]
  };
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: filters[kind] || [{ name: 'All Files', extensions: ['*'] }]
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('app:get-emulator-save-folder', (event) => {
  assertTrustedRenderer(event);
  return emulatorSaveDirectory;
});
ipcMain.handle('app:choose-emulator-save-folder', chooseEmulatorSaveDirectory);
ipcMain.handle('app:save-emulator-file', saveEmulatorFile);
ipcMain.handle('app:load-emulator-file', loadEmulatorFile);

app.whenReady().then(async () => {
  await loadSaveDirectory();
  buildMenu();
  hubServer = await startServer({ host: '127.0.0.1' });
  await createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch((error) => {
  dialog.showErrorBox('Anti-Null could not start', error.message);
  app.quit();
});

app.on('before-quit', () => hubServer?.close());
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
