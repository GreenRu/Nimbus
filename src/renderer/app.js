'use strict';

/*
 * The interface.
 *
 * It draws state and owns none of it: the sheets live here only as what is on
 * screen, and anything touching the disk goes through the bridge. Nothing in
 * this file reads or writes a file itself.
 */

const api = window.nimbus;
const $ = (id) => document.getElementById(id);

const el = {
  list: $('sheet-list'),
  foot: $('foot'),
  rule: $('rule'),
  paper: $('paper'),
  where: $('where'),
  counts: $('counts'),
  theme: $('theme')
};

/** The open sheets, and which one is on the paper. */
const state = {
  sheets: [{ id: 1, name: 'untitled', path: '', text: '', dirty: false }],
  activeId: 1,
  theme: 'sunset',
  themes: ['sunset', 'dusk'],
  nextId: 2
};

const active = () => state.sheets.find((s) => s.id === state.activeId);

/* ---------------------------------------------------------------- the strip */

function renderSheets() {
  el.list.replaceChildren();

  for (const sheet of state.sheets) {
    const button = document.createElement('button');
    button.className = 'sheet' + (sheet.id === state.activeId ? ' on' : '') +
      (sheet.dirty ? ' dirty' : '');
    button.title = sheet.path || 'Not saved anywhere yet';

    const name = document.createElement('span');
    name.className = 'sheet-name';
    name.textContent = sheet.name;

    const dot = document.createElement('span');
    dot.className = 'sheet-dot';
    dot.title = 'Not saved yet';

    button.append(name, dot);
    button.addEventListener('click', () => {
      if (sheet.id === state.activeId) return;
      stash();
      state.activeId = sheet.id;
      draw();
    });

    el.list.appendChild(button);

    // A cloud, like everything else in the family. Seeded by which sheet it is,
    // so one keeps its own shape instead of re-rolling on every render.
    window.CloudShape.buildLobes(button, `sheet-${sheet.id}`, {
      width: button.offsetWidth,
      base: 22,
      spacing: 70,
      minLobes: 2,
      maxLobes: 4,
      overhang: 0,
      widthRatio: [1.4, 2.4]
    });
  }

  const n = state.sheets.length;
  el.foot.textContent = `${n} sheet${n === 1 ? '' : 's'}`;
}

/* ----------------------------------------------------------------- the paper */

/** Keep whatever is on the paper before the paper is used for something else. */
function stash() {
  const sheet = active();
  if (sheet) sheet.text = el.paper.value;
}

function draw() {
  const sheet = active();
  el.paper.value = sheet ? sheet.text : '';
  renderSheets();
  renderRule();
  renderStatus();
  el.paper.focus();
}

function renderRule() {
  const lines = el.paper.value.split('\n').length;
  const numbers = [];
  for (let i = 1; i <= lines; i++) numbers.push(i);
  el.rule.textContent = numbers.join('\n');
}

function renderStatus() {
  const upto = el.paper.value.slice(0, el.paper.selectionStart);
  const line = upto.split('\n').length;
  const column = upto.length - upto.lastIndexOf('\n');
  el.where.textContent = `Line ${line}, column ${column}`;

  const words = el.paper.value.trim() ? el.paper.value.trim().split(/\s+/).length : 0;
  el.counts.textContent = `${words} word${words === 1 ? '' : 's'}`;
}

el.paper.addEventListener('input', () => {
  const sheet = active();
  if (sheet && !sheet.dirty) {
    sheet.dirty = true;
    renderSheets();
  }
  renderRule();
  renderStatus();
});

el.paper.addEventListener('keyup', renderStatus);
el.paper.addEventListener('click', renderStatus);

// The rule has to follow the text it is numbering.
el.paper.addEventListener('scroll', () => {
  el.rule.scrollTop = el.paper.scrollTop;
});

/* --------------------------------------------------------------- the buttons */

$('new').addEventListener('click', () => {
  stash();
  const sheet = { id: state.nextId++, name: 'untitled', path: '', text: '', dirty: false };
  state.sheets.push(sheet);
  state.activeId = sheet.id;
  draw();
});

$('open').addEventListener('click', async () => {
  const result = await api.files.open();
  if (!result || result.cancelled) return;
  if (!result.ok) return;

  stash();
  const sheet = {
    id: state.nextId++,
    name: result.name,
    path: result.path,
    text: result.text,
    dirty: false
  };
  state.sheets.push(sheet);
  state.activeId = sheet.id;
  draw();
});

async function save(saveAs = false) {
  stash();
  const sheet = active();
  if (!sheet) return;

  const result = await api.files.save({ path: sheet.path, text: sheet.text, saveAs });
  if (!result || result.cancelled || !result.ok) return;

  sheet.path = result.path;
  sheet.name = result.name;
  sheet.dirty = false;
  renderSheets();
}

$('save').addEventListener('click', () => save(false));

/* ----------------------------------------------------------------- the theme */

function paintTheme(name) {
  state.theme = name;
  window.SkyTheme.apply({ base: name });
  // The button offers the other one, and says which.
  const other = state.themes.find((t) => t !== name) || 'dusk';
  el.theme.title = other.charAt(0).toUpperCase() + other.slice(1);
  el.theme.setAttribute('aria-label', `Switch to ${other}`);
}

el.theme.addEventListener('click', async () => {
  const other = state.themes.find((t) => t !== state.theme) || 'dusk';
  paintTheme(await api.theme.set(other));
});

api.theme.onChanged(({ base }) => paintTheme(base));

/* ------------------------------------------------------------------ keyboard */

window.addEventListener('keydown', (event) => {
  if (!event.ctrlKey && !event.metaKey) return;
  const key = event.key.toLowerCase();

  if (key === 's') { event.preventDefault(); save(event.shiftKey); }
  if (key === 'o') { event.preventDefault(); $('open').click(); }
  if (key === 'n') { event.preventDefault(); $('new').click(); }
});

/* --------------------------------------------------------------------- start */

(async () => {
  const saved = await api.getState();
  state.themes = saved.themes || state.themes;
  paintTheme(saved.theme || 'sunset');
  el.paper.wrap = saved.wrap === false ? 'off' : 'soft';
  draw();
})();
