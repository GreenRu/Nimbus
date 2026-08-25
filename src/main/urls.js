'use strict';

const path = require('path');

/**
 * The program's own pages.
 *
 * `nimbus://settings` is an address rather than a file path so that a plugin
 * can add one of its own without knowing where anything lives on disk, and so
 * that nothing outside this file ever names a path into the application
 * directory.
 */
const INTERNAL_PAGES = {
  'nimbus://settings': path.join(__dirname, '..', 'pages', 'settings.html')
};

/** Pages plugins have contributed, filled in by the plugin host. */
let PLUGIN_PAGES = {};

function setPluginPages(pages) {
  PLUGIN_PAGES = { ...pages };
}

function internalPages() {
  return { ...PLUGIN_PAGES, ...INTERNAL_PAGES };
}

/** The file behind an address, or null if there is not one. */
function resolve(address) {
  const key = String(address || '').trim().toLowerCase();
  return internalPages()[key] || null;
}

/** What to put in a window's title bar for an address. */
function titleOf(address) {
  const key = String(address || '').trim().toLowerCase();
  if (key === 'nimbus://settings') return 'Settings';
  const name = key.replace(/^nimbus:\/\//, '').replace(/[-_]/g, ' ');
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : 'Nimbus';
}

module.exports = { INTERNAL_PAGES, internalPages, setPluginPages, resolve, titleOf };
