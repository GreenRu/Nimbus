'use strict';

const { app } = require('electron');
const fs = require('fs');
const path = require('path');

/**
 * Preferences, in one JSON file in the user-data directory.
 *
 * Defaults are merged over whatever is on disk, so a key added in a later
 * version appears with its default rather than as undefined. **Keys on disk are
 * permanent**: renaming one costs a migration, and a migration that goes wrong
 * costs somebody their work.
 */
const DEFAULTS = {
  theme: 'sunset',                    // 'sunset', 'dusk', or a plugin's own
  window: { width: 1100, height: 760 },

  /*
   * Smart Mode. Off, and the program is a text editor: sheets, words, lines.
   * On, and the technical layer appears - encodings, line endings, the sharper
   * find options. Nothing is ever taken away by leaving it off; it is only kept
   * out of the way of somebody who did not ask for it.
   */
  smartMode: false,

  wrap: true,
  lineNumbers: true,
  tabSize: 2,
  useTabs: false,
  autoIndent: true,
  autoClose: true,
  fontSize: 13,

  autosave: false,
  restoreSession: true,
  session: [],                        // what was open, to put back next launch
  recent: [],                         // paths, newest first
  enabledPlugins: []                  // opt-in, always
};

class Store {
  constructor(fileName = 'state.json') {
    this.file = path.join(app.getPath('userData'), fileName);
    this.data = { ...DEFAULTS, ...this._read() };
  }

  _read() {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      return {};
    }
  }

  get(key) {
    return this.data[key];
  }

  set(key, value) {
    this.data[key] = value;
    this.save();
    return value;
  }

  /** Remember a file that was opened. Newest first, no duplicates, capped. */
  remember(filePath) {
    if (!filePath) return;
    const recent = [filePath, ...this.data.recent.filter((p) => p !== filePath)];
    this.data.recent = recent.slice(0, 20);
    this.save();
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (err) {
      console.error('[nimbus] could not save preferences:', err.message);
    }
  }
}

module.exports = { Store, DEFAULTS };
