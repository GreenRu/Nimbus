'use strict';

const { app } = require('electron');
const fs = require('fs');
const path = require('path');

/**
 * The plugin host.
 *
 * A plugin is a folder with a `plugin.json` beside whatever files it names, and
 * the manifest is **declarative**: it says what it wants added and the program
 * adds it. There is no plugin code in the main process, and there is not going
 * to be - that is the whole security model rather than a detail of it.
 *
 * ---------------------------------------------------------------------------
 * What Nimbus does not offer, on purpose
 * ---------------------------------------------------------------------------
 *
 * Stratus lets a plugin inject scripts, because a browser has somewhere safe to
 * put them: a web page's isolated world, where a plugin can see the page and
 * nothing else. Nimbus has no such place. Its only renderer is the interface
 * itself, and a script injected there would have the run of the editor, the
 * open files and the bridge to the disk.
 *
 * So Nimbus takes `themes` and `pages` and refuses `scripts`. A plugin can
 * change how the program looks and add a page of its own; it cannot change what
 * the program does. That is a real limit, and it stays until there is somewhere
 * safe to run the code - not until somebody wants the feature.
 */

const ACCEPTED = ['themes', 'pages'];
const REFUSED = ['scripts', 'styles', 'commands', 'toolbar', 'shortcuts'];

class PluginHost {
  constructor(store) {
    this.store = store;
    this.plugins = [];
    this.problems = [];
    this.load();
  }

  /** Where plugins are looked for: the ones that ship, then the ones installed. */
  get folders() {
    return [
      path.join(__dirname, '..', '..', 'plugins'),
      path.join(app.getPath('userData'), 'plugins')
    ];
  }

  get enabled() {
    const on = this.store.get('enabledPlugins');
    return Array.isArray(on) ? on : [];
  }

  load() {
    this.plugins = [];
    this.problems = [];

    for (const folder of this.folders) {
      let entries;
      try {
        entries = fs.readdirSync(folder, { withFileTypes: true }).filter((e) => e.isDirectory());
      } catch {
        continue;   // a folder that is not there is not a problem
      }

      for (const entry of entries) {
        const dir = path.join(folder, entry.name);
        const manifest = path.join(dir, 'plugin.json');
        if (!fs.existsSync(manifest)) continue;

        try {
          const parsed = JSON.parse(fs.readFileSync(manifest, 'utf8'));
          const plugin = this._check(parsed, dir);
          // One installed replaces one that ships with the same name.
          this.plugins = this.plugins.filter((p) => p.id !== plugin.id);
          this.plugins.push(plugin);
        } catch (err) {
          /*
           * A broken manifest must never take the program down, and must never
           * fail silently either - it goes on a list the settings page shows.
           */
          this.problems.push({ folder: entry.name, error: String(err.message || err) });
        }
      }
    }
  }

  /** Read a manifest strictly. Anything unexpected is said out loud, not ignored. */
  _check(manifest, dir) {
    if (!manifest || typeof manifest.id !== 'string' || !/^[a-z0-9-]+$/.test(manifest.id)) {
      throw new Error('a plugin needs an id of lower-case letters, numbers and dashes');
    }

    const refused = REFUSED.filter((key) => manifest[key]);
    const themes = Array.isArray(manifest.themes) ? manifest.themes : [];
    const pages = manifest.pages && typeof manifest.pages === 'object' ? manifest.pages : {};

    return {
      id: manifest.id,
      name: String(manifest.name || manifest.id),
      version: String(manifest.version || '0.0.0'),
      description: String(manifest.description || ''),
      dir,
      themes: themes.filter((t) => t && typeof t.id === 'string'),
      pages,
      /** What this plugin asked for that Nimbus does not do. Shown, not hidden. */
      refused
    };
  }

  /** What the settings page shows. */
  list() {
    return this.plugins.map((p) => ({
      id: p.id,
      name: p.name,
      version: p.version,
      description: p.description,
      enabled: this.enabled.includes(p.id),
      themes: p.themes.map((t) => t.id),
      pages: Object.keys(p.pages),
      refused: p.refused
    })).concat();
  }

  setEnabled(id, on) {
    const next = new Set(this.enabled);
    if (on) next.add(id);
    else next.delete(id);
    this.store.set('enabledPlugins', [...next]);
    return this.list();
  }

  /** Every theme on offer, from the plugins that are switched on. */
  themes() {
    const out = [];
    for (const plugin of this.plugins) {
      if (!this.enabled.includes(plugin.id)) continue;
      for (const theme of plugin.themes) {
        out.push({
          id: `${plugin.id}:${theme.id}`,
          name: String(theme.name || theme.id),
          base: theme.base === 'dusk' ? 'dusk' : 'sunset',
          variables: theme.variables && typeof theme.variables === 'object' ? theme.variables : {}
        });
      }
    }
    return out;
  }

  /** Pages the enabled plugins contribute, as addresses. */
  pages() {
    const out = {};
    for (const plugin of this.plugins) {
      if (!this.enabled.includes(plugin.id)) continue;
      for (const [address, file] of Object.entries(plugin.pages)) {
        if (!/^nimbus:\/\/[a-z0-9-]+$/i.test(address)) continue;
        const full = path.join(plugin.dir, String(file));
        // A page must live inside its own plugin, not somewhere up the tree.
        if (!full.startsWith(plugin.dir)) continue;
        out[address.toLowerCase()] = full;
      }
    }
    return out;
  }
}

module.exports = { PluginHost, ACCEPTED, REFUSED };
