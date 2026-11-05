'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('antiNull', Object.freeze({
  chooseAsset: (kind) => ipcRenderer.invoke('app:choose-asset', kind),
  getEmulatorSaveFolder: () => ipcRenderer.invoke('app:get-emulator-save-folder'),
  chooseEmulatorSaveFolder: () => ipcRenderer.invoke('app:choose-emulator-save-folder'),
  saveEmulatorFile: (payload) => ipcRenderer.invoke('app:save-emulator-file', payload),
  loadEmulatorFile: () => ipcRenderer.invoke('app:load-emulator-file'),
  onMenuAction: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, action) => callback(action);
    ipcRenderer.on('menu:action', listener);
    return () => ipcRenderer.removeListener('menu:action', listener);
  }
}));
