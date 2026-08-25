'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * The only surface the interface has into the main process. Every channel is
 * listed explicitly - the renderer can never reach an arbitrary ipc channel,
 * and `ipcRenderer` itself is never exposed.
 */
contextBridge.exposeInMainWorld('nimbus', {
  getState: () => ipcRenderer.invoke('state:get'),

  theme: {
    set: (name) => ipcRenderer.invoke('theme:set', name),
    onChanged: (callback) => {
      const handler = (_event, payload) => callback(payload);
      ipcRenderer.on('theme:changed', handler);
      return () => ipcRenderer.removeListener('theme:changed', handler);
    }
  },

  /*
   * The renderer never names a path. It asks to open, and the main process puts
   * the picker up and reads whatever came back - so a compromised page cannot
   * read a file nobody chose.
   */
  files: {
    open: () => ipcRenderer.invoke('file:open'),
    save: (sheet) => ipcRenderer.invoke('file:save', sheet)
  }
});
