const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require('electron');
const path = require('node:path');
const { startServer } = require('./server');

let mainWindow;
let hubServer;

function sendMenuAction(action) {
  mainWindow?.webContents.send('menu:action', action);
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

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
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

app.whenReady().then(async () => {
  buildMenu();
  hubServer = await startServer();
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
