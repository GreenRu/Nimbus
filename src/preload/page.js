'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const listen = (channel) => (callback) => {
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

/**
 * The bridge for Nimbus's own pages - at the moment, settings.
 *
 * Narrower than the editor's: a page reads preferences and writes them back,
 * and knows what commands exist so it can describe what it is changing. It can
 * neither open a file nor see one.
 */
contextBridge.exposeInMainWorld('nimbusPage', {
  getState: () => ipcRenderer.invoke('state:get'),
  commands: () => ipcRenderer.invoke('commands:list'),

  prefs: {
    set: (patch) => ipcRenderer.invoke('prefs:set', patch),
    onChanged: listen('prefs:changed')
  },

  theme: {
    set: (name) => ipcRenderer.invoke('theme:set', name),
    onChanged: listen('theme:changed')
  },

  plugins: {
    list: () => ipcRenderer.invoke('plugins:list'),
    setEnabled: (id, on) => ipcRenderer.invoke('plugins:set', id, on),
    reload: () => ipcRenderer.invoke('plugins:reload'),
    openFolder: () => ipcRenderer.invoke('plugins:folder')
  }
});
