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

const { app, BrowserWindow, ipcMain, dialog, nativeTheme, Menu, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { Store } = require('./store');
const files = require('./files');
const urls = require('./urls');
const appMenu = require('./menu');
const { PluginHost } = require('./plugins');

require('../shared/commands.js');
const Commands = globalThis.NimbusCommands;

/*
 * The app's name decides where its profile lives, so it is set before anything
 * reads a path - and before app-ready, because Chromium reads from that
 * directory as it initialises.
 */
app.setName('Nimbus');

/**
 * Nimbus's two palettes.
 *
 * These are only the colours the *window controls* need: the system draws those
 * and takes a colour rather than a variable, so they cannot come from the
 * stylesheet. Everything else lives in `src/renderer/styles.css`, and the two
 * have to be kept in step by hand.
 */
const THEMES = {
  sunset: { sky: '#efa079', text: '#5b3229', dark: false },
  dusk: { sky: '#2b2340', text: '#d6cbe8', dark: true }
};

/** What the renderer is allowed to change, and how each is read. */
const PREFS = {
  theme: (v) => (THEMES[v] || plugins?.themes().some((t) => t.id === v) ? v : 'sunset'),
  smartMode: Boolean,
  wrap: Boolean,
  lineNumbers: Boolean,
  useTabs: Boolean,
  autoIndent: Boolean,
  autoClose: Boolean,
  autosave: Boolean,
  restoreSession: Boolean,
  tabSize: (v) => Math.max(1, Math.min(8, Number(v) || 2)),
  fontSize: (v) => Math.max(9, Math.min(28, Number(v) || 13))
};

let store;
let plugins;
/** @type {BrowserWindow|null} */
let win = null;
/** @type {Map<string, BrowserWindow>} */
const pageWindows = new Map();
/** Files named on the command line, handed over once the window is up. */
let openWith = [];
/** Set once the renderer has agreed the window may shut. */
let mayClose = false;
/** Paths being watched for changes underneath us, by path. */
const watchers = new Map();

const themeOf = (name) => THEMES[name] || THEMES.sunset;

/** The base a theme sits on - a plugin's theme names one of the two built in. */
function baseOf(name) {
  if (THEMES[name]) return name;
  const offered = plugins ? plugins.themes().find((t) => t.id === name) : null;
  return offered ? offered.base : 'sunset';
}

function themePayload() {
  const name = store.get('theme');
  const base = baseOf(name);
  const offered = plugins ? plugins.themes().find((t) => t.id === name) : null;
  return { theme: name, base, variables: offered ? offered.variables : {} };
}

function applyTheme() {
  const payload = themePayload();
  const colours = themeOf(payload.base);
  nativeTheme.themeSource = colours.dark ? 'dark' : 'light';

  for (const target of [win, ...pageWindows.values()]) {
    if (!target || target.isDestroyed()) continue;
    try {
      target.setTitleBarOverlay({ color: colours.sky, symbolColor: colours.text, height: 40 });
    } catch {
      // Only Windows draws an overlay; elsewhere there is nothing to colour.
    }
    target.webContents.send('theme:changed', payload);
  }
}

/* ============================================================
   Windows
   ============================================================ */

function createWindow() {
  const bounds = store.get('window') || {};
  const colours = themeOf(baseOf(store.get('theme')));

  win = new BrowserWindow({
    width: bounds.width || 1100,
    height: bounds.height || 760,
    minWidth: 640,
    minHeight: 420,
    backgroundColor: colours.sky,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: colours.sky, symbolColor: colours.text, height: 40 },
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

  /*
   * Ask the window before shutting it. The renderer knows what is unsaved and
   * has somewhere to ask about it; the main process knows neither.
   */
  win.on('close', (event) => {
    if (mayClose || win.webContents.isDestroyed()) return;
    event.preventDefault();
    win.webContents.send('window:closing');
  });

  win.on('closed', () => {
    win = null;
    for (const w of pageWindows.values()) if (!w.isDestroyed()) w.close();
  });
}

/** One of the program's own pages, in a window of its own. */
function openPage(address) {
  const file = urls.resolve(address);
  if (!file) return null;

  const existing = pageWindows.get(address);
  if (existing && !existing.isDestroyed()) {
    existing.focus();
    return existing;
  }

  const colours = themeOf(baseOf(store.get('theme')));
  const page = new BrowserWindow({
    width: 640,
    height: 760,
    parent: win || undefined,
    backgroundColor: colours.sky,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: colours.sky, symbolColor: colours.text, height: 40 },
    title: urls.titleOf(address),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'page.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  page.setMenu(null);
  page.loadFile(file);
  page.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  page.on('closed', () => pageWindows.delete(address));
  pageWindows.set(address, page);
  return page;
}

/* ============================================================
   Watching what is open
   ============================================================ */

/**
 * Notice when a file changes underneath us.
 *
 * Only Smart Mode is ever told, because "the file on disk is not what you have"
 * is a technical fact and not an emergency. The watching happens regardless, so
 * turning Smart Mode on does not require reopening anything.
 */
function watch(paths) {
  for (const [p, watcher] of watchers) {
    if (paths.includes(p)) continue;
    watcher.close();
    watchers.delete(p);
  }

  for (const p of paths) {
    if (!p || watchers.has(p)) continue;
    try {
      const watcher = fs.watch(p, { persistent: false }, () => {
        if (win && !win.isDestroyed()) win.webContents.send('file:changed', { path: p });
      });
      watchers.set(p, watcher);
    } catch {
      // A file on a drive that has gone away is not worth a crash.
    }
  }
}

/* ============================================================
   The menu
   ============================================================ */

function rebuildMenu() {
  const menu = appMenu.build({
    commands: Commands,
    smartMode: store.get('smartMode') === true,
    recent: (store.get('recent') || []).slice(0, 10),
    send: (id) => win && !win.isDestroyed() && win.webContents.send('command', id),
    openRecent: async (p) => {
      if (!win || win.isDestroyed()) return;
      win.webContents.send('file:opened', await readSafely(p));
    }
  });
  Menu.setApplicationMenu(menu);
}

async function readSafely(file) {
  try {
    const result = files.read(file);
    store.remember(file);
    return result;
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}

/* ============================================================
   What the renderer may ask for
   ============================================================ */

function registerIpc() {
  ipcMain.handle('state:get', () => {
    const taken = openWith;
    openWith = [];
    return {
      themes: Object.keys(THEMES),
      pluginThemes: plugins.themes().map((t) => ({ id: t.id, name: t.name })),
      prefs: currentPrefs(),
      theme: themePayload(),
      session: store.get('restoreSession') !== false ? store.get('session') || [] : [],
      openWith: taken
    };
  });

  function currentPrefs() {
    const out = {};
    for (const key of Object.keys(PREFS)) out[key] = store.get(key);
    return out;
  }

  ipcMain.handle('theme:set', (_event, name) => {
    const known = THEMES[name] || plugins.themes().some((t) => t.id === name);
    const chosen = known ? name : 'sunset';
    store.set('theme', chosen);
    applyTheme();
    return chosen;
  });

  /** Preferences, filtered: a renderer cannot invent a setting or a value. */
  ipcMain.handle('prefs:set', (_event, patch = {}) => {
    for (const [key, value] of Object.entries(patch)) {
      const read = PREFS[key];
      if (!read) continue;
      store.set(key, read(value));
    }
    if ('smartMode' in patch) rebuildMenu();

    const prefs = currentPrefs();
    // Everyone that draws from a preference hears about it, including whichever
    // window did not make the change.
    for (const target of [win, ...pageWindows.values()]) {
      if (target && !target.isDestroyed()) target.webContents.send('prefs:changed', prefs);
    }
    return prefs;
  });

  // --- files -------------------------------------------------------------------

  ipcMain.handle('file:open', async () => {
    const picked = await dialog.showOpenDialog(win, {
      title: 'Open a file',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Text', extensions: ['txt', 'md', 'markdown', 'json', 'js', 'ts', 'css', 'html', 'py', 'yml', 'yaml'] },
        { name: 'Every file', extensions: ['*'] }
      ]
    });
    if (picked.canceled || !picked.filePaths.length) return { cancelled: true };
    const result = await readSafely(picked.filePaths[0]);
    // Anything picked beyond the first is opened alongside it.
    for (const extra of picked.filePaths.slice(1)) {
      if (win && !win.isDestroyed()) win.webContents.send('file:opened', await readSafely(extra));
    }
    rebuildMenu();
    return result;
  });

  ipcMain.handle('file:read', async (_event, file) => readSafely(String(file || '')));

  ipcMain.handle('file:save', async (_event, sheet = {}) => {
    let file = typeof sheet.path === 'string' ? sheet.path : '';

    if (!file || sheet.saveAs) {
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
      const result = files.write(file, String(sheet.text || ''), {
        encoding: sheet.encoding, eol: sheet.eol
      });
      store.remember(file);
      rebuildMenu();
      return result;
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  });

  /**
   * Printing.
   *
   * The window is the editor, so printing it would print the sidebar and the
   * sky. The text goes into a page of its own, off screen, which is printed and
   * thrown away.
   */
  ipcMain.handle('file:print', async (_event, sheet = {}) => {
    const sheet_ = { name: String(sheet.name || 'untitled'), text: String(sheet.text || '') };
    const escape = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const html = '<!doctype html><meta charset="utf-8"><title>' + escape(sheet_.name) + '</title>' +
      '<style>body{margin:24px;font:12px/1.5 "Cascadia Code",Consolas,monospace;white-space:pre-wrap;' +
      'overflow-wrap:break-word}</style><body>' + escape(sheet_.text);

    const printer = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
    try {
      await printer.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
      const done = await new Promise((resolve) => {
        printer.webContents.print({ silent: false, printBackground: false }, (ok, reason) => {
          resolve({ ok, reason });
        });
      });
      return done.ok ? { ok: true } : { ok: false, error: done.reason || 'cancelled' };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    } finally {
      if (!printer.isDestroyed()) printer.destroy();
    }
  });

  // --- the session ---------------------------------------------------------------

  ipcMain.on('session:keep', (_event, sheets) => {
    const list = Array.isArray(sheets) ? sheets.slice(0, 40) : [];
    store.set('session', list);
    watch(list.map((s) => s && s.path).filter(Boolean));
  });

  // --- the window ------------------------------------------------------------------

  ipcMain.on('window:full-screen', () => {
    if (win && !win.isDestroyed()) win.setFullScreen(!win.isFullScreen());
  });

  ipcMain.on('window:settings', () => openPage('nimbus://settings'));
  ipcMain.on('page:open', (_event, address) => openPage(String(address || '')));

  ipcMain.on('window:closing-answer', (_event, ok) => {
    if (!win || win.isDestroyed()) return;
    if (!ok) return;
    mayClose = true;
    win.close();
  });

  // --- plugins -----------------------------------------------------------------------

  ipcMain.handle('plugins:list', () => ({ plugins: plugins.list(), problems: plugins.problems }));
  ipcMain.handle('plugins:set', (_event, id, on) => {
    const list = plugins.setEnabled(String(id || ''), Boolean(on));
    urls.setPluginPages(plugins.pages());
    applyTheme();
    return { plugins: list, problems: plugins.problems };
  });
  ipcMain.handle('plugins:reload', () => {
    plugins.load();
    urls.setPluginPages(plugins.pages());
    return { plugins: plugins.list(), problems: plugins.problems };
  });
  ipcMain.handle('plugins:folder', () => {
    const folder = path.join(app.getPath('userData'), 'plugins');
    fs.mkdirSync(folder, { recursive: true });
    shell.openPath(folder);
    return folder;
  });

  /** The settings page needs the list of commands to describe what it changes. */
  ipcMain.handle('commands:list', () => ({
    commands: Commands.COMMANDS,
    smartMode: store.get('smartMode') === true
  }));
}

/* ============================================================
   Start
   ============================================================ */

/** Files named on the command line - double-clicking one in the file explorer. */
function filesFromArgv(argv) {
  return argv.slice(1)
    .filter((a) => a && !a.startsWith('-') && !a.endsWith('.js'))
    .filter((a) => {
      try {
        return fs.statSync(a).isFile();
      } catch {
        return false;
      }
    });
}

const single = app.requestSingleInstanceLock();
if (!single) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.focus();
    for (const file of filesFromArgv(argv)) {
      readSafely(file).then((result) => win.webContents.send('file:opened', result));
    }
  });

  app.whenReady().then(() => {
    store = new Store();
    plugins = new PluginHost(store);
    urls.setPluginPages(plugins.pages());
    openWith = filesFromArgv(process.argv);

    registerIpc();
    rebuildMenu();
    createWindow();
    applyTheme();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  for (const watcher of watchers.values()) watcher.close();
  watchers.clear();
  if (process.platform !== 'darwin') app.quit();
});

module.exports = { THEMES, currentWindow: () => win, pageWindow: (a) => pageWindows.get(a) };
