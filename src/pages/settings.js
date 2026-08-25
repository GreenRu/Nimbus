'use strict';

/*
 * The settings page.
 *
 * It reads preferences and writes them back, and nothing else - it cannot open
 * a file or see one. What Smart Mode adds is listed here from the command list
 * rather than typed out, so a command marked `smart` shows up in this
 * explanation the day it is added and not whenever somebody remembers.
 */

const bridge = window.nimbusPage;
const $ = (id) => document.getElementById(id);

let prefs = {};

/* ------------------------------------------------------------------ writing */

const set = async (patch) => {
  prefs = await bridge.prefs.set(patch);
  paint();
};

/** A switch that writes one preference. */
function toggle(id, key) {
  $(id).addEventListener('change', (event) => set({ [key]: event.target.checked }));
}

/** A slider that writes one preference, and shows its value beside it. */
function slider(id, key, format = String) {
  const input = $(id);
  const value = $(id + '-value');
  input.addEventListener('input', () => { value.textContent = format(input.value); });
  input.addEventListener('change', () => set({ [key]: Number(input.value) }));
}

toggle('line-numbers', 'lineNumbers');
toggle('wrap', 'wrap');
toggle('auto-indent', 'autoIndent');
toggle('auto-close', 'autoClose');
toggle('use-tabs', 'useTabs');
toggle('restore-session', 'restoreSession');
toggle('autosave', 'autosave');
toggle('smart-mode', 'smartMode');
slider('font-size', 'fontSize', (v) => v + 'px');
slider('tab-size', 'tabSize', (v) => v + (Number(v) === 1 ? ' space' : ' spaces'));

$('theme').addEventListener('change', async (event) => {
  await bridge.theme.set(event.target.value);
  prefs.theme = event.target.value;
});

/* ------------------------------------------------------------------ drawing */

function paint() {
  $('line-numbers').checked = prefs.lineNumbers !== false;
  $('wrap').checked = prefs.wrap !== false;
  $('auto-indent').checked = prefs.autoIndent !== false;
  $('auto-close').checked = prefs.autoClose !== false;
  $('use-tabs').checked = prefs.useTabs === true;
  $('restore-session').checked = prefs.restoreSession !== false;
  $('autosave').checked = prefs.autosave === true;
  $('smart-mode').checked = prefs.smartMode === true;

  $('font-size').value = prefs.fontSize || 13;
  $('font-size-value').textContent = (prefs.fontSize || 13) + 'px';
  $('tab-size').value = prefs.tabSize || 2;
  $('tab-size-value').textContent = (prefs.tabSize || 2) +
    (Number(prefs.tabSize) === 1 ? ' space' : ' spaces');

  // The settings that are themselves part of the technical layer.
  for (const row of document.querySelectorAll('.smart-only')) {
    row.hidden = prefs.smartMode !== true;
  }

  $('smart-note').textContent = prefs.smartMode
    ? 'On. The technical layer is showing.'
    : 'Off, so the program stays a text editor. Nothing is removed by leaving it ' +
      'off - these things simply are not in the way until you ask for them.';

  paintSmartList();
}

/**
 * What Smart Mode actually adds, taken from the command list.
 *
 * Written out by hand this would be wrong within a month. Read from the list,
 * it cannot be.
 */
function paintSmartList() {
  const list = $('smart-list');
  list.replaceChildren();

  const extras = window.NimbusCommands.COMMANDS.filter((c) => c.smart);
  for (const command of extras) {
    const row = document.createElement('div');
    row.textContent = command.note ? `${command.label} — ${command.note}` : command.label;
    list.appendChild(row);
  }

  for (const line of [
    'The encoding and line endings of the open file, in the strip along the bottom.',
    'Match case, whole word and regular expressions, in the find bar.',
    'Indenting with tab characters rather than spaces.'
  ]) {
    const row = document.createElement('div');
    row.textContent = line;
    list.appendChild(row);
  }
}

function paintThemes(state) {
  const select = $('theme');
  select.replaceChildren();

  const add = (value, label) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  };

  for (const name of state.themes || []) {
    add(name, name.charAt(0).toUpperCase() + name.slice(1));
  }
  for (const theme of state.pluginThemes || []) add(theme.id, theme.name);

  select.value = (state.theme && state.theme.theme) || 'sunset';
}

/* ------------------------------------------------------------------ plugins */

function paintPlugins({ plugins: list, problems }) {
  const root = $('plugin-list');
  root.replaceChildren();

  if (!list.length) {
    const empty = document.createElement('div');
    empty.className = 'row';
    empty.textContent = 'No plugins installed yet.';
    root.appendChild(empty);
  }

  for (const plugin of list) {
    const row = document.createElement('div');
    row.className = 'row';

    const cell = document.createElement('div');
    cell.className = 'grow';

    const name = document.createElement('b');
    name.textContent = `${plugin.name} ${plugin.version}`;

    const detail = document.createElement('small');
    const parts = [plugin.description].filter(Boolean);
    if (plugin.themes.length) parts.push(`${plugin.themes.length} theme${plugin.themes.length === 1 ? '' : 's'}`);
    if (plugin.pages.length) parts.push(`${plugin.pages.length} page${plugin.pages.length === 1 ? '' : 's'}`);
    detail.textContent = parts.join(' · ');

    cell.append(name, detail);

    // A plugin that asked for something Nimbus does not do is told so here
    // rather than left to wonder why nothing happened.
    if (plugin.refused.length) {
      const refused = document.createElement('small');
      refused.className = 'refused';
      refused.textContent = `Nimbus ignores its ${plugin.refused.join(', ')}: it does not run plugin code.`;
      cell.appendChild(refused);
    }

    const label = document.createElement('label');
    label.className = 'toggle';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = plugin.enabled;
    input.addEventListener('change', async () => {
      paintPlugins(await bridge.plugins.setEnabled(plugin.id, input.checked));
      const state = await bridge.getState();
      paintThemes(state);
    });
    label.append(input, document.createElement('span'));

    row.append(cell, label);
    root.appendChild(row);
  }

  $('plugin-problems').textContent = (problems || []).length
    ? 'Could not read: ' + problems.map((p) => `${p.folder} (${p.error})`).join('; ')
    : '';
}

$('plugin-folder').addEventListener('click', () => bridge.plugins.openFolder());
$('plugin-reload').addEventListener('click', async () => {
  paintPlugins(await bridge.plugins.reload());
});

/* ------------------------------------------------------------------ start */

bridge.theme.onChanged((theme) => window.SkyTheme.apply(theme));
bridge.prefs.onChanged((next) => { prefs = next; paint(); });

(async () => {
  const state = await bridge.getState();
  window.SkyTheme.apply(state.theme || { base: 'sunset' });
  prefs = state.prefs || {};
  paintThemes(state);
  paint();
  paintPlugins(await bridge.plugins.list());
})();
