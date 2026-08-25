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
  theme: 'sunset',                    // 'sunset' or 'dusk', or a plugin's own
  window: { width: 1100, height: 760 },
  wrap: true,
  tabSize: 2,
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
