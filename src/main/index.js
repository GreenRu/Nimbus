/*
 * Nimbus - a small text editor with a sky behind it.
 * Copyright (C) 2026 Sutton Sager
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option)
 * any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
 * more details.
 *
 * You should have received a copy of the GNU General Public License along with
 * this program. If not, see <https://www.gnu.org/licenses/>.
 */

'use strict';

const { app, BrowserWindow, ipcMain, dialog, nativeTheme, Menu } = require('electron');
const fs = require('fs');
const path = require('path');
const { Store } = require('./store');

/*
 * The app's name decides where its profile lives, so it is set before anything
 * reads a path - and before app-ready, because Chromium reads from that
 * directory as it initialises.
 */
app.setName('Nimbus');

/**
 * Nimbus's two palettes. The lighter one is the default, here and in every
 * other program in the family. These values are the sky the *window controls*
 * are painted with - the system draws those and needs a colour rather than a
 * variable, so they cannot come from the stylesheet.
 */
const THEMES = {
  sunset: { sky: '#efa079', text: '#5b3229', dark: false },
  dusk: { sky: '#2b2340', text: '#d6cbe8', dark: true }
};

let store;
/** @type {BrowserWindow|null} */
let win = null;

function themeOf(name) {
  return THEMES[name] || THEMES.sunset;
}

function applyTheme(name) {
  const theme = themeOf(name);
  nativeTheme.themeSource = theme.dark ? 'dark' : 'light';
  if (win && !win.isDestroyed()) {
    try {
      win.setTitleBarOverlay({ color: theme.sky, symbolColor: theme.text, height: 40 });
    } catch {
      // Only Windows draws an overlay; elsewhere there is nothing to colour.
    }
    win.webContents.send('theme:changed', { base: name });
  }
}

function createWindow() {
  const bounds = store.get('window') || {};
  const theme = themeOf(store.get('theme'));

  win = new BrowserWindow({
    width: bounds.width || 1100,
    height: bounds.height || 760,
    minWidth: 640,
    minHeight: 420,
    backgroundColor: theme.sky,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: theme.sky, symbolColor: theme.text, height: 40 },
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'chrome.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  win.on('resize', () => {
    if (!win || win.isDestroyed()) return;
    const [width, height] = win.getSize();
    store.set('window', { width, height });
  });

  win.on('closed', () => { win = null; });
}

/**
 * The only surface the interface has into the main process, and the only place
 * the disk is touched. Every channel is listed by hand; the renderer can never
 * reach an arbitrary one.
 */
function registerIpc() {
  ipcMain.handle('state:get', () => ({
    theme: store.get('theme'),
    themes: Object.keys(THEMES),
    wrap: store.get('wrap') !== false,
    tabSize: Number(store.get('tabSize')) || 2,
    recent: store.get('recent')
  }));

  ipcMain.handle('theme:set', (_event, name) => {
    const chosen = THEMES[name] ? name : 'sunset';
    store.set('theme', chosen);
    applyTheme(chosen);
    return chosen;
  });

  /** Open a file the person picked. The renderer never names a path itself. */
  ipcMain.handle('file:open', async () => {
    const picked = await dialog.showOpenDialog(win, {
      title: 'Open a file',
      properties: ['openFile'],
      filters: [
        { name: 'Text', extensions: ['txt', 'md', 'markdown', 'json', 'js', 'css', 'html'] },
        { name: 'Every file', extensions: ['*'] }
      ]
    });
    if (picked.canceled || !picked.filePaths.length) return { cancelled: true };

    const file = picked.filePaths[0];
    try {
      const text = fs.readFileSync(file, 'utf8');
      store.remember(file);
      return { ok: true, path: file, name: path.basename(file), text };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  });

  /**
   * Save. A sheet that has never been written asks where to go; one that has a
   * path of its own is written straight back to it.
   */
  ipcMain.handle('file:save', async (_event, payload = {}) => {
    let file = typeof payload.path === 'string' ? payload.path : '';

    if (!file || payload.saveAs) {
      const picked = await dialog.showSaveDialog(win, {
        title: 'Save',
        defaultPath: file || 'untitled.txt',
        filters: [{ name: 'Text', extensions: ['txt', 'md', 'json'] },
          { name: 'Every file', extensions: ['*'] }]
      });
      if (picked.canceled || !picked.filePath) return { cancelled: true };
      file = picked.filePath;
    }

    try {
      fs.writeFileSync(file, String(payload.text || ''), 'utf8');
      store.remember(file);
      return { ok: true, path: file, name: path.basename(file) };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  });
}

app.whenReady().then(() => {
  store = new Store();
  registerIpc();
  Menu.setApplicationMenu(null);
  createWindow();
  applyTheme(store.get('theme'));

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

module.exports = { THEMES, currentWindow: () => win };
