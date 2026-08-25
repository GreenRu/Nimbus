'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

const listen = (channel) => (callback) => {
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

/**
 * The only surface the interface has into the main process. Every channel is
 * listed explicitly - the renderer can never reach an arbitrary ipc channel,
 * and `ipcRenderer` itself is never exposed.
 */
contextBridge.exposeInMainWorld('nimbus', {
  getState: () => ipcRenderer.invoke('state:get'),

  theme: {
    set: (name) => ipcRenderer.invoke('theme:set', name),
    onChanged: listen('theme:changed')
  },

  prefs: {
    set: (patch) => ipcRenderer.invoke('prefs:set', patch),
    onChanged: listen('prefs:changed')
  },

  /*
   * The renderer never names a path of its own invention. It asks to open, and
   * the main process puts the picker up and reads whatever came back. The one
   * exception is `read`, which takes a path the main process itself handed over
   * earlier - from the picker, from a dropped file, or from the saved session.
   */
  files: {
    open: () => ipcRenderer.invoke('file:open'),
    read: (path) => ipcRenderer.invoke('file:read', path),
    save: (sheet) => ipcRenderer.invoke('file:save', sheet),
    print: (sheet) => ipcRenderer.invoke('file:print', sheet),
    /** A dropped file's path. The renderer cannot work this out for itself. */
    pathOf: (file) => {
      try {
        return webUtils.getPathForFile(file);
      } catch {
        return '';
      }
    },
    onChanged: listen('file:changed'),
    /** Opened by the menu, by a second launch, or by a file dropped on the icon. */
    onOpened: listen('file:opened')
  },

  /** The menu bar sends the name of whatever was chosen, and nothing else. */
  onCommand: listen('command'),

  session: {
    keep: (sheets) => ipcRenderer.send('session:keep', sheets)
  },

  window: {
    fullScreen: () => ipcRenderer.send('window:full-screen'),
    settings: () => ipcRenderer.send('window:settings'),
    /**
     * The window asks before it shuts, so unsaved work is never lost quietly.
     * The handler returns true to let it close.
     */
    onClosing: (handler) => {
      ipcRenderer.on('window:closing', async () => {
        let ok = true;
        try {
          ok = await handler();
        } catch {
          ok = false;   // if asking went wrong, keep the window rather than lose work
        }
        ipcRenderer.send('window:closing-answer', ok === true);
      });
    }
  }
});
