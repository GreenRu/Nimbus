'use strict';

/*
 * The interface.
 *
 * It draws state and owns none of it: the sheets live here only as what is on
 * screen, and anything touching the disk goes through the bridge. Nothing in
 * this file reads or writes a file itself.
 *
 * Nimbus draws no native views, so - unlike the rest of the family - the
 * interface may cover its own content freely. The palette, the menus and the
 * questions are ordinary elements, and that is the whole reason they are short.
 */

const api = window.nimbus;
const Edits = window.NimbusEdits;
const Commands = window.NimbusCommands;
const NL = Edits.NL;
const $ = (id) => document.getElementById(id);

const el = {
  body: document.body,
  list: $('sheet-list'),
  foot: $('foot'),
  rule: $('rule'),
  paper: $('paper'),
  marks: $('marks'),
  mirror: $('mirror'),
  where: $('where'),
  selected: $('selected'),
  counts: $('counts'),
  theme: $('theme'),
  statusSmart: $('status-smart'),
  encoding: $('encoding'),
  lineEndings: $('line-endings'),
  findBar: $('find-bar'),
  findWhat: $('find-what'),
  findCount: $('find-count'),
  findSmart: $('find-smart'),
  replaceBar: $('replace-bar'),
  replaceWith: $('replace-with'),
  paletteOverlay: $('palette-overlay'),
  paletteInput: $('palette-input'),
  paletteList: $('palette-list'),
  paletteNote: $('palette-note'),
  context: $('context'),
  askOverlay: $('ask-overlay'),
  askTitle: $('ask-title'),
  askBody: $('ask-body'),
  askInput: $('ask-input'),
  askRow: $('ask-row'),
  toast: $('toast')
};

/** Everything on screen. Preferences are a copy of what the store holds. */
const state = {
  sheets: [],
  activeId: 0,
  closed: [],            // sheets that were shut, newest first
  nextId: 1,
  themes: ['sunset', 'dusk'],
  prefs: {
    theme: 'sunset',
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
    encoding: 'utf8',
    lineEndings: 'lf'
  },
  find: { open: false, replacing: false, matches: [], index: -1, case: false, word: false, regex: false }
};

const active = () => state.sheets.find((s) => s.id === state.activeId) || null;
const smart = () => state.prefs.smartMode === true;

/* ============================================================
   Sheets
   ============================================================ */

function makeSheet({ name = 'untitled', path = '', text = '', encoding = 'utf8', eol = 'lf' } = {}) {
  return {
    id: state.nextId++,
    name,
    path,
    text,
    saved: text,             // what is on disk, for knowing when it differs
    sel: { start: 0, end: 0 },
    scroll: 0,
    encoding,
    eol,
    history: new Edits.History({ text, start: 0, end: 0 })
  };
}

const isDirty = (sheet) => sheet && sheet.text !== sheet.saved;

const CLOSE_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" ' +
  'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

/**
 * What the strip would look like right now.
 *
 * Redrawing it on every keystroke throws away the hover the pointer is sitting
 * in - which takes the close button out from under it mid-click - and re-rolls
 * every cloud for nothing. So it is only rebuilt when something it draws has
 * actually changed.
 */
function stripSignature() {
  return state.sheets
    .map((s) => [s.id, s.name, isDirty(s) ? 'd' : '', s.id === state.activeId ? 'a' : ''].join(':'))
    .join('|');
}

let lastStrip = null;

function renderSheets(force = false) {
  // Mid-drag the strip belongs to the pointer: rebuilding it would drop the
  // cloud being carried.
  if (drag && drag.active) return;

  const signature = stripSignature();
  if (!force && signature === lastStrip) return;
  lastStrip = signature;

  el.list.replaceChildren();

  for (const sheet of state.sheets) {
    const button = document.createElement('button');
    button.className = 'sheet' + (sheet.id === state.activeId ? ' on' : '') +
      (isDirty(sheet) ? ' dirty' : '');
    button.title = sheet.path || 'Not saved anywhere yet';
    button.dataset.id = String(sheet.id);

    const name = document.createElement('span');
    name.className = 'sheet-name';
    name.textContent = sheet.name;

    // The dot and the close share a corner: the dot says there is unsaved work,
    // and hovering swaps it for the way to close the sheet. Two things in one
    // place, because they are never both what you want at once.
    const dot = document.createElement('span');
    dot.className = 'sheet-dot';
    dot.title = 'Not saved yet';

    const close = document.createElement('span');
    close.className = 'sheet-close';
    close.setAttribute('role', 'button');
    close.title = 'Close ' + sheet.name + ' (Ctrl+W)';
    close.innerHTML = CLOSE_ICON;
    close.addEventListener('click', (event) => {
      event.stopPropagation();
      closeSheet(sheet.id);
    });

    button.append(name, dot, close);
    button.addEventListener('click', (event) => {
      if (event.target.closest('.sheet-close')) return;
      show(sheet.id);
    });
    button.addEventListener('auxclick', (event) => {
      if (event.button === 1) closeSheet(sheet.id);   // middle click, as everywhere
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

/* ------------------------------------------------- carrying one to a new place */

/**
 * Dragging a sheet up or down the sky.
 *
 * The same way Stratus moves its clouds, and deliberately so: the cloud comes
 * out of the flow and follows the pointer, and a gap of its own size takes its
 * place. The gap is a real element, so the sheets around it move by the strip's
 * own layout rather than by anything here working out where they should go.
 */
let drag = null;

el.list.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  const button = event.target.closest('.sheet');
  if (!button || event.target.closest('.sheet-close')) return;

  drag = {
    id: Number(button.dataset.id),
    el: button,
    startY: event.clientY,
    // Where in the cloud it was taken hold of, so it does not jump on lift.
    grabbedAt: event.clientY - button.getBoundingClientRect().top,
    active: false
  };
});

function liftSheet(event) {
  const box = drag.el.getBoundingClientRect();

  const gap = document.createElement('div');
  gap.className = 'sheet-gap';
  gap.style.height = box.height + 'px';
  el.list.insertBefore(gap, drag.el);

  drag.gap = gap;
  drag.active = true;
  drag.el.classList.add('dragging');
  drag.el.style.width = box.width + 'px';
  drag.el.style.left = box.left + 'px';
  drag.el.style.top = (event.clientY - drag.grabbedAt) + 'px';
  document.body.classList.add('dragging-cloud');
}

window.addEventListener('pointermove', (event) => {
  if (!drag) return;
  if (!drag.active) {
    // A few pixels of slack, so a click on a sheet is not a tiny drag.
    if (Math.abs(event.clientY - drag.startY) < 6) return;
    liftSheet(event);
  }

  drag.el.style.top = (event.clientY - drag.grabbedAt) + 'px';

  // Where it would land: the first sheet whose middle is below the pointer.
  const others = [...el.list.children].filter((n) => n !== drag.el && n !== drag.gap);
  const before = others.find((n) => {
    const box = n.getBoundingClientRect();
    return event.clientY < box.top + box.height / 2;
  });

  if (before) el.list.insertBefore(drag.gap, before);
  else el.list.appendChild(drag.gap);
});

window.addEventListener('pointerup', () => {
  if (!drag) return;
  const held = drag;
  drag = null;
  if (!held.active) return;

  const index = [...el.list.children].filter((n) => n !== held.el).indexOf(held.gap);

  // Settle into the gap before letting go of it, so the cloud arrives rather
  // than teleports.
  const landing = held.gap.getBoundingClientRect();
  held.el.classList.add('landing');
  held.el.style.top = landing.top + 'px';
  held.el.style.left = landing.left + 'px';

  const release = () => {
    held.el.classList.remove('dragging', 'landing');
    held.el.style.width = '';
    held.el.style.left = '';
    held.el.style.top = '';
    held.gap.remove();
    document.body.classList.remove('dragging-cloud');

    if (index >= 0) moveSheet(held.id, index);
  };

  held.el.addEventListener('transitionend', release, { once: true });
  setTimeout(release, 260);
});

/** Put a sheet at a new place in the order. */
function moveSheet(id, index) {
  const at = state.sheets.findIndex((s) => s.id === id);
  if (at === -1) return;
  const [sheet] = state.sheets.splice(at, 1);
  state.sheets.splice(Math.max(0, Math.min(index, state.sheets.length)), 0, sheet);
  renderSheets(true);
}

/** Keep whatever is on the paper before the paper is used for something else. */
function stash() {
  const sheet = active();
  if (!sheet) return;
  sheet.text = el.paper.value;
  sheet.sel = { start: el.paper.selectionStart, end: el.paper.selectionEnd };
  sheet.scroll = el.paper.scrollTop;
}

function show(id) {
  if (id === state.activeId) return;
  stash();
  state.activeId = id;
  draw();
}

function addSheet(sheet, { quiet = false } = {}) {
  stash();
  state.sheets.push(sheet);
  state.activeId = sheet.id;
  if (!quiet) draw();
  return sheet;
}

async function closeSheet(id) {
  const sheet = state.sheets.find((s) => s.id === id);
  if (!sheet) return false;
  if (sheet.id === state.activeId) stash();

  if (isDirty(sheet)) {
    const answer = await ask({
      title: `Save ${sheet.name}?`,
      body: 'This sheet has changes that are not written to disk yet.',
      buttons: [
        { id: 'save', label: 'Save', primary: true },
        { id: 'discard', label: 'Close without saving', danger: true },
        { id: 'cancel', label: 'Keep it open' }
      ]
    });
    if (answer === 'cancel' || answer === null) return false;
    if (answer === 'save') {
      const saved = await save(sheet, false);
      if (!saved) return false;
    }
  }

  const at = state.sheets.indexOf(sheet);
  state.sheets.splice(at, 1);
  // Enough to open it again, but not its undo history: that belonged to a
  // session that has ended.
  state.closed.unshift({ name: sheet.name, path: sheet.path, text: sheet.text,
    saved: sheet.saved, encoding: sheet.encoding, eol: sheet.eol });
  state.closed = state.closed.slice(0, 12);

  if (!state.sheets.length) state.sheets.push(makeSheet());
  if (state.activeId === id) {
    state.activeId = (state.sheets[at] || state.sheets[state.sheets.length - 1]).id;
  }
  draw(true);
  return true;
}

function reopenClosed() {
  const last = state.closed.shift();
  if (!last) {
    toast('Nothing has been closed yet.');
    return;
  }
  const sheet = makeSheet(last);
  sheet.saved = last.saved;
  addSheet(sheet);
}

/* ============================================================
   The paper
   ============================================================ */

/**
 * Put a state on the paper and remember it.
 *
 * Everything that changes the text goes through here, so there is exactly one
 * place that keeps the textarea, the sheet and the undo history in agreement.
 */
function apply(next, kind = 'edit') {
  const sheet = active();
  if (!sheet) return;

  el.paper.value = next.text;
  el.paper.selectionStart = next.start;
  el.paper.selectionEnd = next.end;
  sheet.text = next.text;
  sheet.sel = { start: next.start, end: next.end };
  sheet.history.push(next, kind);

  afterChange();
}

/** Whatever is on the paper this instant. */
const reading = () => ({
  text: el.paper.value,
  start: el.paper.selectionStart,
  end: el.paper.selectionEnd
});

/** An operation from `edits.js`, run on the paper. */
function run(operation) {
  const sheet = active();
  if (!sheet) return;
  const before = reading();
  const after = operation(before);
  if (!after || after.text === before.text) {
    // Nothing changed - keep the selection it asked for and leave it there.
    if (after) {
      el.paper.selectionStart = after.start;
      el.paper.selectionEnd = after.end;
    }
    return;
  }
  apply(after, 'edit');
  el.paper.focus();
}

function afterChange() {
  renderRule();
  renderStatus();
  renderSheets();
  refreshFind();
  scheduleAutosave();
}

/* --------------------------------------------------------- the line numbers */

/**
 * The numbers down the side.
 *
 * With wrapping off, line N is row N and this is a count. With wrapping on it
 * is not: one long line occupies several rows, and a number printed per line
 * drifts further from the text with every one. So the rows each line actually
 * takes are measured, in a hidden copy laid out at the same width and metrics,
 * and the number is followed by that many blank rows.
 */
const RULE_LIMIT = 4000;   // past this, measuring every line costs more than it is worth

function renderRule() {
  if (!state.prefs.lineNumbers) {
    el.rule.hidden = true;
    return;
  }
  el.rule.hidden = false;

  const text = el.paper.value;
  const lines = text.split(NL);

  if (!state.prefs.wrap || lines.length > RULE_LIMIT) {
    el.rule.textContent = lines.map((_, i) => i + 1).join(NL);
    return;
  }

  /*
   * Twice, and the second time is not belt and braces.
   *
   * The rule is a flex sibling of the paper, so drawing it changes how wide the
   * paper is - a line count that grows from 99 to 100 widens the rule and
   * narrows the text. A vertical scrollbar appearing does the same. Either way
   * the width the rows were measured at is no longer the width they are laid
   * out at, and lines near the edge gain a row the rule does not know about.
   * Measuring again at the settled width fixes it; a third pass has never
   * changed anything, because the rule's width only moves when the digit count
   * does.
   */
  let width = -1;
  for (let pass = 0; pass < 2 && width !== el.paper.clientWidth; pass++) {
    width = el.paper.clientWidth;
    measureRule(text, lines, width);
  }
}

/** One pass: lay the text out at `width` and give each line its rows. */
/**
 * Lay the text out in the hidden twin, at a given width.
 *
 * A break and then something on the far side of it: the break gives the last
 * line a bottom to measure against, and the mark after it is there because a
 * trailing newline on its own does not reliably make a row. Which way that
 * falls decides whether the row count is right or one short, and a zero-width
 * space settles it by being something rather than nothing.
 *
 * It is written as an escape on purpose. An invisible character sitting in the
 * source is the kind of thing that costs somebody an afternoon.
 */
const MIRROR_END = NL + '\u200b';

function fillMirror(text, width) {
  el.mirror.style.width = width + 'px';
  el.mirror.textContent = text + MIRROR_END;
  return el.mirror.firstChild;
}

function measureRule(text, lines, width) {
  const style = getComputedStyle(el.paper);
  const lineHeight = parseFloat(style.lineHeight);
  const node = fillMirror(text, width);
  const range = document.createRange();
  const topOf = (offset) => {
    range.setStart(node, offset);
    range.setEnd(node, offset);
    return range.getBoundingClientRect().top;
  };

  /*
   * How many rows the whole thing came to, less the one the trailing newline
   * adds. The last line's share is whatever is left over rather than another
   * measurement: a range collapsed at the very end of a text node that ends in
   * a newline returns an empty rectangle, which reads as a wild negative and
   * was quietly becoming one row - four short over sixty lines, and the numbers
   * drifting up the page from there.
   */
  const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
  // Less the one row the mark on the far side of the last break occupies.
  const totalRows = Math.max(lines.length,
    Math.round((el.mirror.offsetHeight - padY) / lineHeight) - 1);

  const out = [];
  let offset = 0;
  let previous = topOf(0);
  let used = 0;

  for (let i = 0; i < lines.length; i++) {
    offset += lines[i].length + 1;

    let rows;
    if (i === lines.length - 1) {
      rows = Math.max(1, totalRows - used);
    } else {
      const next = topOf(Math.min(offset, node.length));
      rows = Math.max(1, Math.round((next - previous) / lineHeight));
      previous = next;
    }

    used += rows;
    out.push(String(i + 1));
    for (let r = 1; r < rows; r++) out.push('');
  }
  el.rule.textContent = out.join(NL);
}

/* ------------------------------------------------------------- the status */

function renderStatus() {
  const text = el.paper.value;
  const start = el.paper.selectionStart;
  const end = el.paper.selectionEnd;

  const upto = text.slice(0, start);
  const line = upto.split(NL).length;
  const column = upto.length - upto.lastIndexOf(NL);
  el.where.textContent = `Line ${line}, column ${column}`;

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  el.counts.textContent = `${words} word${words === 1 ? '' : 's'}`;

  if (end > start) {
    const picked = end - start;
    el.selected.textContent = `${picked} character${picked === 1 ? '' : 's'} picked`;
  } else {
    el.selected.textContent = '';
  }

  const sheet = active();
  el.statusSmart.hidden = !smart();
  if (sheet && smart()) {
    el.encoding.textContent = sheet.encoding === 'utf8' ? 'UTF-8'
      : sheet.encoding === 'utf16le' ? 'UTF-16' : 'Latin-1';
    el.lineEndings.textContent = sheet.eol === 'crlf' ? 'CRLF' : 'LF';
  }

  renderLineGlow(line);
}

/** The line the caret is on, lit behind the text. */
function renderLineGlow(line) {
  el.marks.replaceChildren();
  if (state.find.open) return;      // while finding, the matches matter more

  const style = getComputedStyle(el.paper);
  const lineHeight = parseFloat(style.lineHeight);
  const padTop = parseFloat(style.paddingTop);

  // With wrapping on, the caret's row is not its line, so it is measured the
  // same way the rule is rather than assumed.
  let row = line - 1;
  if (state.prefs.wrap) {
    const node = fillMirror(el.paper.value, el.paper.clientWidth);
    const range = document.createRange();
    const at = Math.min(el.paper.selectionStart, node.length);
    range.setStart(node, at);
    range.setEnd(node, at);
    const top = range.getBoundingClientRect().top;
    range.setStart(node, 0);
    range.setEnd(node, 0);
    row = Math.round((top - range.getBoundingClientRect().top) / lineHeight);
  }

  const glow = document.createElement('div');
  glow.className = 'line-glow';
  glow.style.top = (padTop + row * lineHeight - el.paper.scrollTop) + 'px';
  el.marks.appendChild(glow);
}

/**
 * @param {boolean} [force] redraw the strip even if it looks unchanged - for a
 *   reorder, where the sheets are the same sheets in a different order and the
 *   signature alone cannot tell.
 */
function draw(force = false) {
  const sheet = active();
  el.paper.value = sheet ? sheet.text : '';
  if (sheet) {
    el.paper.selectionStart = sheet.sel.start;
    el.paper.selectionEnd = sheet.sel.end;
    el.paper.scrollTop = sheet.scroll;
  }
  renderSheets(force);
  renderRule();
  renderStatus();
  refreshFind();
  el.paper.focus();
}

/* ============================================================
   Typing
   ============================================================ */

el.paper.addEventListener('input', () => {
  const sheet = active();
  if (!sheet) return;
  const now = reading();
  sheet.text = now.text;
  sheet.sel = { start: now.start, end: now.end };
  sheet.history.push(now, 'type');
  afterChange();
});

const restatus = () => renderStatus();
el.paper.addEventListener('keyup', restatus);
el.paper.addEventListener('click', restatus);
el.paper.addEventListener('select', restatus);

// The rule has to follow the text it is numbering.
el.paper.addEventListener('scroll', () => {
  el.rule.scrollTop = el.paper.scrollTop;
  renderStatus();
});

window.addEventListener('resize', () => {
  renderRule();
  renderStatus();
});

/**
 * The keys that mean something inside the text itself.
 *
 * Tab and Enter are handled here rather than as commands because they have to
 * beat the textarea's own behaviour, and because what they do depends on what
 * is selected.
 */
el.paper.addEventListener('keydown', (event) => {
  const unit = state.prefs.useTabs ? '\t' : ' '.repeat(state.prefs.tabSize);

  if (event.key === 'Tab') {
    event.preventDefault();
    run((s) => (event.shiftKey ? Edits.outdent(s, unit) : Edits.indent(s, unit)));
    return;
  }

  if (event.key === 'Enter' && state.prefs.autoIndent && !event.shiftKey) {
    const now = reading();
    const lineStart = now.text.lastIndexOf(NL, now.start - 1) + 1;
    const lead = (now.text.slice(lineStart, now.start).match(/^[ \t]*/) || [''])[0];
    if (lead) {
      event.preventDefault();
      const insert = NL + lead;
      apply({
        text: now.text.slice(0, now.start) + insert + now.text.slice(now.end),
        start: now.start + insert.length,
        end: now.start + insert.length
      }, 'edit');
    }
    return;
  }

  // Typing an opening bracket around a selection wraps it; on its own it
  // closes itself. Backspace between an empty pair takes both.
  const PAIRS = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' };
  if (state.prefs.autoClose && PAIRS[event.key]) {
    const now = reading();
    if (now.end > now.start) {
      event.preventDefault();
      const inner = now.text.slice(now.start, now.end);
      apply({
        text: now.text.slice(0, now.start) + event.key + inner + PAIRS[event.key] + now.text.slice(now.end),
        start: now.start + 1,
        end: now.end + 1
      }, 'edit');
      return;
    }
    const after = now.text[now.start] || '';
    if (!/[\w"'`]/.test(after)) {
      event.preventDefault();
      apply({
        text: now.text.slice(0, now.start) + event.key + PAIRS[event.key] + now.text.slice(now.start),
        start: now.start + 1,
        end: now.start + 1
      }, 'edit');
      return;
    }
  }

  if (state.prefs.autoClose && event.key === 'Backspace') {
    const now = reading();
    if (now.start === now.end && now.start > 0) {
      const before = now.text[now.start - 1];
      const after = now.text[now.start];
      if (PAIRS[before] && PAIRS[before] === after) {
        event.preventDefault();
        apply({
          text: now.text.slice(0, now.start - 1) + now.text.slice(now.start + 1),
          start: now.start - 1,
          end: now.start - 1
        }, 'edit');
      }
    }
  }
});

/* ============================================================
   What the program can do
   ============================================================ */

const acts = {
  'file.new': () => addSheet(makeSheet()),
  'file.open': () => openFile(),
  'file.save': () => save(active(), false),
  'file.saveAs': () => save(active(), true),
  'file.close': () => closeSheet(state.activeId),
  'file.reopen': () => reopenClosed(),
  'file.print': () => printSheet(),

  'edit.undo': () => stepHistory('undo'),
  'edit.redo': () => stepHistory('redo'),
  'edit.cut': () => document.execCommand('cut'),
  'edit.copy': () => document.execCommand('copy'),
  'edit.paste': () => document.execCommand('paste'),
  'edit.selectAll': () => { el.paper.select(); renderStatus(); },

  'find.open': () => openFind(false),
  'find.replace': () => openFind(true),
  'find.next': () => step(false),
  'find.previous': () => step(true),
  'find.goToLine': () => goToLine(),

  'edit.indent': () => run((s) => Edits.indent(s, indentUnit())),
  'edit.outdent': () => run((s) => Edits.outdent(s, indentUnit())),
  'edit.duplicateLine': () => run(Edits.duplicateLines),
  'edit.deleteLine': () => run(Edits.deleteLines),
  'edit.moveLineUp': () => run((s) => Edits.moveLines(s, -1)),
  'edit.moveLineDown': () => run((s) => Edits.moveLines(s, 1)),
  'edit.toggleComment': () => run((s) => Edits.toggleComment(s, Edits.commentStyle(active()?.name))),
  'edit.upperCase': () => run((s) => Edits.changeCase(s, true)),
  'edit.lowerCase': () => run((s) => Edits.changeCase(s, false)),
  'edit.insertDate': () => run((s) => Edits.insertDate(s)),
  'edit.trimWhitespace': () => run(Edits.trimTrailing),

  'view.zoomIn': () => zoom(1),
  'view.zoomOut': () => zoom(-1),
  'view.zoomReset': () => zoom(0),
  'view.wrap': () => setPref('wrap', !state.prefs.wrap),
  'view.lineNumbers': () => setPref('lineNumbers', !state.prefs.lineNumbers),
  'view.sidebar': () => el.body.classList.toggle('no-sidebar'),
  'view.fullScreen': () => api.window.fullScreen(),
  'view.palette': () => openPalette(),
  'view.settings': () => api.window.settings(),

  'smart.encoding': () => chooseEncoding(),
  'smart.lineEndings': () => chooseLineEndings(),
  'smart.reload': () => reloadFromDisk()
};

const indentUnit = () => (state.prefs.useTabs ? '\t' : ' '.repeat(state.prefs.tabSize));

function does(id) {
  const command = Commands.byId.get(id);
  if (!command) return;
  if (command.smart && !smart()) {
    offerSmartMode(command);
    return;
  }
  const act = acts[id];
  if (act) act();
}

/**
 * Someone asked for something that only exists in Smart Mode.
 *
 * Refusing outright would be unhelpful and turning it on for them would be
 * presumptuous, so it says what the setting is and offers to switch it on.
 */
async function offerSmartMode(command) {
  const answer = await ask({
    title: 'That one lives in Smart Mode',
    body: `"${command.label}" is part of the technical layer, which is switched off ` +
      'so it stays out of the way. Turning it on adds encodings, line endings and ' +
      'the sharper find options. Nothing is taken away.',
    buttons: [
      { id: 'on', label: 'Turn Smart Mode on', primary: true },
      { id: 'no', label: 'Leave it off' }
    ]
  });
  if (answer !== 'on') return;
  await setPref('smartMode', true);
  does(command.id);
}

function stepHistory(which) {
  const sheet = active();
  if (!sheet) return;
  stash();
  const next = which === 'undo' ? sheet.history.undo() : sheet.history.redo();
  if (!next) {
    toast(which === 'undo' ? 'Nothing left to undo.' : 'Nothing to redo.');
    return;
  }
  el.paper.value = next.text;
  el.paper.selectionStart = next.start;
  el.paper.selectionEnd = next.end;
  sheet.text = next.text;
  sheet.sel = { start: next.start, end: next.end };
  afterChange();
  el.paper.focus();
}

/* ============================================================
   Files
   ============================================================ */

async function openFile() {
  const result = await api.files.open();
  if (!result || result.cancelled) return;
  if (!result.ok) {
    toast(`That file could not be read: ${result.error}`);
    return;
  }
  openText(result);
}

function openText(result) {
  const already = state.sheets.find((s) => s.path && s.path === result.path);
  if (already) {
    show(already.id);
    return already;
  }
  return addSheet(makeSheet({
    name: result.name, path: result.path, text: result.text,
    encoding: result.encoding, eol: result.eol
  }));
}

async function save(sheet, saveAs) {
  if (!sheet) return false;
  if (sheet.id === state.activeId) stash();

  const result = await api.files.save({
    path: sheet.path, text: sheet.text, saveAs,
    encoding: sheet.encoding, eol: sheet.eol
  });
  if (!result || result.cancelled) return false;
  if (!result.ok) {
    toast(`That could not be saved: ${result.error}`);
    return false;
  }

  sheet.path = result.path;
  sheet.name = result.name;
  sheet.saved = sheet.text;
  renderSheets();
  toast(`Saved ${sheet.name}`);
  return true;
}

async function printSheet() {
  const sheet = active();
  if (!sheet) return;
  stash();
  const result = await api.files.print({ name: sheet.name, text: sheet.text });
  if (result && result.error) toast(`That could not be printed: ${result.error}`);
}

async function reloadFromDisk() {
  const sheet = active();
  if (!sheet || !sheet.path) {
    toast('This sheet has never been saved, so there is nothing to reload.');
    return;
  }
  if (isDirty(sheet)) {
    const answer = await ask({
      title: `Throw away the changes to ${sheet.name}?`,
      body: 'Reloading takes the file as it is on disk. What is not saved will be lost.',
      buttons: [
        { id: 'yes', label: 'Reload anyway', danger: true },
        { id: 'no', label: 'Keep my changes', primary: true }
      ]
    });
    if (answer !== 'yes') return;
  }
  const result = await api.files.read(sheet.path);
  if (!result || !result.ok) {
    toast('That file could not be read.');
    return;
  }
  sheet.text = result.text;
  sheet.saved = result.text;
  sheet.encoding = result.encoding;
  sheet.eol = result.eol;
  sheet.history = new Edits.History({ text: result.text, start: 0, end: 0 });
  sheet.sel = { start: 0, end: 0 };
  draw();
}

/** Dropping a file on the window opens it. */
window.addEventListener('dragover', (event) => event.preventDefault());
window.addEventListener('drop', async (event) => {
  event.preventDefault();
  const paths = [...(event.dataTransfer?.files || [])].map((f) => api.files.pathOf(f)).filter(Boolean);
  for (const path of paths) {
    const result = await api.files.read(path);
    if (result && result.ok) openText(result);
  }
});

/* --------------------------------------------------------------- autosave */

let autosaveTimer = null;
function scheduleAutosave() {
  if (!state.prefs.autosave) return;
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    for (const sheet of state.sheets) {
      // Only sheets that already live somewhere: autosave must never have to
      // ask where to put something.
      if (sheet.path && isDirty(sheet)) save(sheet, false);
    }
  }, 1500);
}

/* ============================================================
   Finding
   ============================================================ */

function openFind(withReplace) {
  state.find.open = true;
  state.find.replacing = Boolean(withReplace) || state.find.replacing;
  el.findBar.hidden = false;
  el.replaceBar.hidden = !state.find.replacing;
  el.findSmart.hidden = !smart();

  const picked = el.paper.value.slice(el.paper.selectionStart, el.paper.selectionEnd);
  if (picked && !picked.includes(NL)) el.findWhat.value = picked;

  refreshFind();
  el.findWhat.focus();
  el.findWhat.select();
}

function closeFind() {
  state.find.open = false;
  el.findBar.hidden = true;
  el.replaceBar.hidden = true;
  renderStatus();
  el.paper.focus();
}

function refreshFind() {
  if (!state.find.open) return;
  const query = el.findWhat.value;
  const pattern = Edits.searcher(query, {
    regex: state.find.regex, caseSensitive: state.find.case, wholeWord: state.find.word
  });

  if (query && !pattern) {
    state.find.matches = [];
    el.findCount.textContent = 'not a pattern';
    el.findCount.classList.add('none');
    return;
  }

  state.find.matches = Edits.findAll(el.paper.value, pattern);
  const n = state.find.matches.length;
  el.findCount.classList.toggle('none', Boolean(query) && n === 0);
  if (!query) el.findCount.textContent = '';
  else if (!n) el.findCount.textContent = 'none';
  else {
    const at = state.find.index >= 0 && state.find.index < n ? state.find.index + 1 : 1;
    el.findCount.textContent = `${at} of ${n}`;
  }
}

function step(backwards) {
  if (!state.find.open) {
    openFind(false);
    return;
  }
  refreshFind();
  const { matches } = state.find;
  if (!matches.length) return;

  const from = backwards ? el.paper.selectionStart : el.paper.selectionEnd;
  const index = Edits.nextMatch(matches, from, backwards);
  state.find.index = index;
  const match = matches[index];

  el.paper.focus();
  el.paper.setSelectionRange(match.start, match.end);
  scrollToCaret();
  refreshFind();
  renderStatus();
}

/** Bring the caret into view, since setting a selection does not. */
function scrollToCaret() {
  const style = getComputedStyle(el.paper);
  const lineHeight = parseFloat(style.lineHeight);
  const line = el.paper.value.slice(0, el.paper.selectionStart).split(NL).length;
  const wanted = (line - 1) * lineHeight;
  const view = el.paper.clientHeight;
  if (wanted < el.paper.scrollTop || wanted > el.paper.scrollTop + view - lineHeight * 2) {
    el.paper.scrollTop = Math.max(0, wanted - view / 2);
    el.rule.scrollTop = el.paper.scrollTop;
  }
}

function replaceOne() {
  refreshFind();
  const { matches } = state.find;
  if (!matches.length) return;

  const start = el.paper.selectionStart;
  const end = el.paper.selectionEnd;
  const on = matches.find((m) => m.start === start && m.end === end);
  if (!on) {
    step(false);
    return;
  }
  const now = reading();
  const with_ = el.replaceWith.value;
  apply({
    text: now.text.slice(0, on.start) + with_ + now.text.slice(on.end),
    start: on.start + with_.length,
    end: on.start + with_.length
  }, 'edit');
  step(false);
}

function replaceAll() {
  refreshFind();
  const { matches } = state.find;
  if (!matches.length) {
    toast('Nothing to replace.');
    return;
  }
  const now = reading();
  const with_ = el.replaceWith.value;
  let text = now.text;
  for (let i = matches.length - 1; i >= 0; i--) {
    text = text.slice(0, matches[i].start) + with_ + text.slice(matches[i].end);
  }
  apply({ text, start: Math.min(now.start, text.length), end: Math.min(now.start, text.length) }, 'edit');
  toast(`Replaced ${matches.length} ${matches.length === 1 ? 'one' : 'of them'}.`);
}

el.findWhat.addEventListener('input', () => { state.find.index = -1; refreshFind(); });
el.findWhat.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') { event.preventDefault(); step(event.shiftKey); }
  if (event.key === 'Escape') { event.preventDefault(); closeFind(); }
});
el.replaceWith.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') { event.preventDefault(); replaceOne(); }
  if (event.key === 'Escape') { event.preventDefault(); closeFind(); }
});

$('find-next').addEventListener('click', () => step(false));
$('find-prev').addEventListener('click', () => step(true));
$('find-close').addEventListener('click', closeFind);
$('find-open').addEventListener('click', () => does('find.open'));
$('find-toggle-replace').addEventListener('click', () => {
  state.find.replacing = !state.find.replacing;
  el.replaceBar.hidden = !state.find.replacing;
  if (state.find.replacing) el.replaceWith.focus();
});
$('replace-one').addEventListener('click', replaceOne);
$('replace-all').addEventListener('click', replaceAll);

for (const [id, key] of [['find-case', 'case'], ['find-word', 'word'], ['find-regex', 'regex']]) {
  $(id).addEventListener('click', () => {
    state.find[key] = !state.find[key];
    $(id).setAttribute('aria-pressed', String(state.find[key]));
    state.find.index = -1;
    refreshFind();
  });
}

async function goToLine() {
  const total = el.paper.value.split(NL).length;
  const answer = await ask({
    title: 'Go to line',
    body: `This sheet has ${total} line${total === 1 ? '' : 's'}.`,
    input: { placeholder: 'Line number', value: '' },
    buttons: [{ id: 'go', label: 'Go', primary: true }, { id: 'cancel', label: 'Cancel' }]
  });
  if (answer === null || answer.id !== 'go') return;
  const line = Number(answer.value);
  if (!Number.isFinite(line) || line < 1) return;
  const at = Edits.startOfLine(el.paper.value, line);
  el.paper.focus();
  el.paper.setSelectionRange(at, at);
  scrollToCaret();
  renderStatus();
}

/* ============================================================
   The palette
   ============================================================ */

let paletteAt = 0;

function openPalette() {
  el.paletteOverlay.hidden = false;
  el.paletteInput.value = '';
  paletteAt = 0;
  renderPalette();
  el.paletteInput.focus();
}

function closePalette() {
  el.paletteOverlay.hidden = true;
  el.paper.focus();
}

/**
 * What the palette offers.
 *
 * With Smart Mode off it holds the everyday commands - copying, saving,
 * finding - because that is what somebody looking for a command is usually
 * after. Typing still searches everything that exists, so nothing is hidden
 * from a person who knows what they want.
 */
function paletteItems() {
  const query = el.paletteInput.value.trim().toLowerCase();
  const pool = query ? Commands.available(smart()) : Commands.offered(smart());
  if (!query) return pool;
  return pool.filter((c) => c.label.toLowerCase().includes(query) ||
    c.group.toLowerCase().includes(query) ||
    c.id.toLowerCase().includes(query));
}

function renderPalette() {
  const items = paletteItems();
  paletteAt = Math.max(0, Math.min(paletteAt, items.length - 1));
  el.paletteList.replaceChildren();

  for (const [i, command] of items.entries()) {
    const button = document.createElement('button');
    button.className = 'palette-item' + (i === paletteAt ? ' on' : '');
    button.dataset.id = command.id;

    const label = document.createElement('span');
    label.className = 'grow';
    label.textContent = command.label;
    button.appendChild(label);

    if (command.smart) {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = 'smart';
      button.appendChild(tag);
    }
    if (command.accel) {
      const key = document.createElement('kbd');
      key.textContent = command.accel;
      button.appendChild(key);
    }

    button.addEventListener('click', () => { closePalette(); does(command.id); });
    el.paletteList.appendChild(button);
  }

  el.paletteNote.textContent = items.length ? '' : 'Nothing by that name.';
}

el.paletteInput.addEventListener('input', () => { paletteAt = 0; renderPalette(); });
el.paletteInput.addEventListener('keydown', (event) => {
  const items = paletteItems();
  if (event.key === 'ArrowDown') { event.preventDefault(); paletteAt += 1; renderPalette(); }
  if (event.key === 'ArrowUp') { event.preventDefault(); paletteAt -= 1; renderPalette(); }
  if (event.key === 'Escape') { event.preventDefault(); closePalette(); }
  if (event.key === 'Enter') {
    event.preventDefault();
    const command = items[paletteAt];
    if (command) { closePalette(); does(command.id); }
  }
});
el.paletteOverlay.addEventListener('pointerdown', (event) => {
  if (event.target === el.paletteOverlay) closePalette();
});

/* ============================================================
   Right-clicking the text
   ============================================================ */

const CONTEXT = ['edit.cut', 'edit.copy', 'edit.paste', null, 'edit.selectAll',
  null, 'edit.duplicateLine', 'edit.deleteLine', 'edit.toggleComment',
  null, 'find.open', 'view.palette'];

el.paper.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  el.context.replaceChildren();

  for (const id of CONTEXT) {
    if (id === null) {
      el.context.appendChild(document.createElement('hr'));
      continue;
    }
    const command = Commands.byId.get(id);
    if (!command || (command.smart && !smart())) continue;

    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.id = id;
    const label = document.createElement('span');
    label.textContent = command.label;
    button.appendChild(label);
    if (command.accel) {
      const key = document.createElement('kbd');
      key.textContent = command.accel;
      button.appendChild(key);
    }
    button.addEventListener('click', () => { hideContext(); does(id); });
    el.context.appendChild(button);
  }

  el.context.hidden = false;
  const box = el.context.getBoundingClientRect();
  el.context.style.left = Math.min(event.clientX, innerWidth - box.width - 8) + 'px';
  el.context.style.top = Math.min(event.clientY, innerHeight - box.height - 8) + 'px';
});

const hideContext = () => { el.context.hidden = true; };
window.addEventListener('pointerdown', (event) => {
  if (!el.context.contains(event.target)) hideContext();
}, true);
window.addEventListener('blur', hideContext);

/* ============================================================
   Being asked something
   ============================================================ */

let answering = null;

/**
 * A question, answered in the window rather than by a system dialog - which
 * cannot be themed and looks like it belongs to a different program.
 *
 * Resolves to the chosen button's id, or `{ id, value }` when there is a field.
 * Escape resolves to null, which every caller treats as "leave it alone".
 */
function ask({ title, body, buttons, input }) {
  el.askTitle.textContent = title;
  el.askBody.textContent = body || '';
  el.askRow.replaceChildren();

  el.askInput.hidden = !input;
  if (input) {
    el.askInput.value = input.value || '';
    el.askInput.placeholder = input.placeholder || '';
  }

  return new Promise((resolve) => {
    const done = (id) => {
      el.askOverlay.hidden = true;
      answering = null;
      if (id === null) resolve(null);
      else resolve(input ? { id, value: el.askInput.value } : id);
      el.paper.focus();
    };
    answering = done;

    for (const button of buttons) {
      const node = document.createElement('button');
      node.textContent = button.label;
      if (button.primary) node.classList.add('primary');
      if (button.danger) node.classList.add('danger');
      node.addEventListener('click', () => done(button.id));
      el.askRow.appendChild(node);
    }

    el.askOverlay.hidden = false;
    (input ? el.askInput : el.askRow.querySelector('.primary') || el.askRow.firstChild)?.focus();
  });
}

el.askInput.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || !answering) return;
  event.preventDefault();
  const primary = el.askRow.querySelector('.primary') || el.askRow.firstChild;
  primary?.click();
});

/* ============================================================
   Preferences
   ============================================================ */

async function setPref(key, value) {
  state.prefs[key] = value;
  applyPrefs();
  await api.prefs.set({ [key]: value });
}

/** Everything a preference changes about how the window looks. */
function applyPrefs() {
  const p = state.prefs;
  document.documentElement.style.setProperty('--text-size', p.fontSize + 'px');
  el.paper.classList.toggle('wrap', p.wrap !== false);
  el.paper.style.tabSize = String(p.tabSize);
  el.rule.hidden = !p.lineNumbers;
  el.findSmart.hidden = !smart() || !state.find.open;
  el.statusSmart.hidden = !smart();
  renderRule();
  renderStatus();
}

function zoom(direction) {
  const next = direction === 0 ? 13
    : Math.max(9, Math.min(28, state.prefs.fontSize + direction));
  setPref('fontSize', next);
}

function paintTheme(name) {
  state.prefs.theme = name;
  window.SkyTheme.apply({ base: name });
  const other = state.themes.find((t) => t !== name) || 'dusk';
  el.theme.title = other.charAt(0).toUpperCase() + other.slice(1);
  el.theme.setAttribute('aria-label', `Switch to ${other}`);
}

el.theme.addEventListener('click', async () => {
  const other = state.themes.find((t) => t !== state.prefs.theme) || 'dusk';
  paintTheme(await api.theme.set(other));
});

api.theme.onChanged(({ base }) => paintTheme(base));

/** The settings page changed something, so take it as read and redraw. */
api.prefs.onChanged((prefs) => {
  Object.assign(state.prefs, prefs);
  if (prefs.theme) paintTheme(prefs.theme);
  applyPrefs();
  renderSheets();
});

async function chooseEncoding() {
  const sheet = active();
  if (!sheet) return;
  const answer = await ask({
    title: 'How is this file encoded?',
    body: 'UTF-8 unless you know otherwise. Changing this changes how the file is ' +
      'written the next time it is saved.',
    buttons: [
      { id: 'utf8', label: 'UTF-8', primary: sheet.encoding === 'utf8' },
      { id: 'utf16le', label: 'UTF-16' },
      { id: 'latin1', label: 'Latin-1' },
      { id: 'cancel', label: 'Cancel' }
    ]
  });
  if (!answer || answer === 'cancel') return;
  sheet.encoding = answer;
  renderStatus();
}

async function chooseLineEndings() {
  const sheet = active();
  if (!sheet) return;
  const answer = await ask({
    title: 'How should lines end?',
    body: 'Windows programs usually expect CRLF. Almost everything else expects LF.',
    buttons: [
      { id: 'lf', label: 'LF', primary: sheet.eol === 'lf' },
      { id: 'crlf', label: 'CRLF' },
      { id: 'cancel', label: 'Cancel' }
    ]
  });
  if (!answer || answer === 'cancel') return;
  sheet.eol = answer;
  renderStatus();
}

el.encoding.addEventListener('click', chooseEncoding);
el.lineEndings.addEventListener('click', chooseLineEndings);

/* ============================================================
   A word about what just happened
   ============================================================ */

let toastTimer = null;
function toast(message) {
  el.toast.textContent = message;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, 2600);
}

/* ============================================================
   The keyboard
   ============================================================ */

/** "Ctrl+Shift+P" against a real key press. */
function matches(accel, event) {
  if (!accel) return false;
  const parts = accel.split('+');
  const key = parts[parts.length - 1].toLowerCase();
  const wantCtrl = parts.includes('Ctrl');
  const wantShift = parts.includes('Shift');
  const wantAlt = parts.includes('Alt');

  if (Boolean(event.ctrlKey || event.metaKey) !== wantCtrl) return false;
  if (Boolean(event.shiftKey) !== wantShift) return false;
  if (Boolean(event.altKey) !== wantAlt) return false;

  const pressed = event.key.toLowerCase();
  if (key === 'up') return pressed === 'arrowup';
  if (key === 'down') return pressed === 'arrowdown';
  if (key === 'tab') return pressed === 'tab';
  // The digit keys report themselves, so "=" and "-" work whichever row they
  // were pressed on.
  return pressed === key;
}

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (!el.paletteOverlay.hidden) { closePalette(); return; }
    if (!el.context.hidden) { hideContext(); return; }
    if (!el.askOverlay.hidden && answering) { answering(null); return; }
    if (state.find.open) { closeFind(); return; }
  }

  // A question is being answered; nothing else may act.
  if (!el.askOverlay.hidden || !el.paletteOverlay.hidden) return;

  // Tab inside the text belongs to the text, and is handled there.
  const inText = event.target === el.paper;
  for (const command of Commands.available(smart())) {
    if (!command.accel) continue;
    if (command.accel === 'Tab' || command.accel === 'Shift+Tab') continue;
    if (!matches(command.accel, event)) continue;
    // Redo answers to two shortcuts, because both are muscle memory somewhere.
    event.preventDefault();
    does(command.id);
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    does('edit.redo');
    return;
  }

  if (inText) return;
});

/* ============================================================
   Start
   ============================================================ */

$('new').addEventListener('click', () => does('file.new'));
$('open').addEventListener('click', () => does('file.open'));
$('save').addEventListener('click', () => does('file.save'));
$('settings').addEventListener('click', () => does('view.settings'));

/** Anything left open last time, and anything opened by double-clicking a file. */
async function start() {
  const saved = await api.getState();
  state.themes = saved.themes || state.themes;
  Object.assign(state.prefs, saved.prefs || {});
  paintTheme(state.prefs.theme || 'sunset');

  const restored = Array.isArray(saved.session) ? saved.session : [];
  for (const item of restored) {
    const sheet = makeSheet(item);
    sheet.saved = item.saved !== undefined ? item.saved : item.text;
    state.sheets.push(sheet);
  }
  if (!state.sheets.length) state.sheets.push(makeSheet());
  state.activeId = state.sheets[0].id;

  applyPrefs();
  draw();

  for (const path of saved.openWith || []) {
    const result = await api.files.read(path);
    if (result && result.ok) openText(result);
  }
}

/**
 * What to put back next time.
 *
 * Sheets that live in a file are remembered by their path. A sheet with
 * unsaved work has that work kept too, because losing it to a restart is
 * exactly what the setting is meant to prevent.
 */
function session() {
  return state.sheets.map((s) => ({
    name: s.name,
    path: s.path,
    text: isDirty(s) || !s.path ? s.text : '',
    saved: isDirty(s) || !s.path ? s.saved : '',
    encoding: s.encoding,
    eol: s.eol
  })).filter((s) => s.path || s.text);
}

window.addEventListener('beforeunload', () => {
  stash();
  api.session.keep(state.prefs.restoreSession ? session() : []);
});

/** The main process asks before it closes, so nothing is lost silently. */
api.window.onClosing(async () => {
  stash();
  const dirty = state.sheets.filter(isDirty);
  if (!dirty.length) return true;

  const answer = await ask({
    title: dirty.length === 1 ? `Save ${dirty[0].name}?` : `Save ${dirty.length} sheets?`,
    body: 'There is work here that is not written to disk yet.',
    buttons: [
      { id: 'save', label: 'Save them', primary: true },
      { id: 'discard', label: 'Close without saving', danger: true },
      { id: 'cancel', label: 'Stay open' }
    ]
  });
  if (answer === 'cancel' || answer === null) return false;
  if (answer === 'save') {
    for (const sheet of dirty) {
      const ok = await save(sheet, false);
      if (!ok) return false;
    }
  }
  return true;
});

/** The menu bar chose something. It sends a name and nothing else. */
api.onCommand((id) => does(id));

/** Opened from the recent list, by a second launch, or by the file explorer. */
api.files.onOpened((result) => {
  if (result && result.ok) openText(result);
  else if (result && result.error) toast(`That file could not be read: ${result.error}`);
});

/** A file changed underneath us. Only Smart Mode is told; it is a technical fact. */
api.files.onChanged(({ path }) => {
  if (!smart()) return;
  const sheet = state.sheets.find((s) => s.path === path);
  if (!sheet) return;
  toast(`${sheet.name} has changed on disk. Reload it from the command list.`);
});

start();
