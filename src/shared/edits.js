'use strict';

/**
 * What Nimbus can do to a piece of text, and remembering it.
 *
 * Every operation here is pure: it takes a state - the text and where the
 * selection is - and returns a new one. Nothing reaches for the document, so
 * all of it can be tested by calling it, which is the only reason the awkward
 * cases (a selection that ends exactly on a line break, an outdent on a line
 * with no indent left) are covered at all.
 *
 * A state is `{ text, start, end }`, where start and end are character offsets
 * into the text, the way a textarea reports them.
 */
(function (global) {
  const NL = String.fromCharCode(10);

  /* ------------------------------------------------------------------ lines */

  /** The whole lines a selection touches, as character offsets. */
  function lineSpan(text, start, end) {
    const from = text.lastIndexOf(NL, start - 1) + 1;

    let to = text.indexOf(NL, end);
    if (to === -1) to = text.length;

    /*
     * A selection that ends exactly at the start of a line has not touched that
     * line - dragging down to it stops there. Without this, "delete line" on
     * one line takes two, which is the sort of thing nobody reports and
     * everybody notices.
     */
    if (end > start && end === text.lastIndexOf(NL, end - 1) + 1) {
      to = end - 1;
    }
    return { from, to };
  }

  /** Which line a position is on, counting from one. */
  function lineOf(text, pos) {
    return text.slice(0, pos).split(NL).length;
  }

  /** The offset of the start of a line, counting from one. */
  function startOfLine(text, line) {
    const lines = text.split(NL);
    const n = Math.max(1, Math.min(line, lines.length));
    return lines.slice(0, n - 1).reduce((at, l) => at + l.length + 1, 0);
  }

  /* ------------------------------------------------------- what to comment with */

  const LINE_TOKENS = [
    [/\.(js|jsx|ts|tsx|c|h|cpp|cs|java|go|rs|swift|kt|php|scss|less)$/i, '//'],
    [/\.(py|rb|sh|bash|zsh|pl|r|yml|yaml|toml|ini|conf|cfg|env|gitignore)$/i, '#'],
    [/\.(sql|lua|hs|elm|ada)$/i, '--'],
    [/\.(lisp|clj|scm)$/i, ';'],
    [/\.(bat|cmd)$/i, 'REM ']
  ];

  const WRAP_TOKENS = [
    [/\.(html|htm|xml|svg|vue|md|markdown)$/i, ['<!--', '-->']],
    [/\.css$/i, ['/*', '*/']]
  ];

  /**
   * How this file says "ignore this line".
   *
   * A plain text file has no such thing, so `#` stands in: it is the least
   * surprising mark in a file that has no rules, and it is what most people
   * reach for.
   */
  function commentStyle(fileName) {
    const name = String(fileName || '');
    for (const [pattern, token] of LINE_TOKENS) {
      if (pattern.test(name)) return { line: token };
    }
    for (const [pattern, pair] of WRAP_TOKENS) {
      if (pattern.test(name)) return { open: pair[0], close: pair[1] };
    }
    return { line: '#' };
  }

  /* ------------------------------------------------------------- operations */

  /** Copy the touched lines in below themselves. */
  function duplicateLines(state) {
    const { text, start, end } = state;
    const { from, to } = lineSpan(text, start, end);
    const block = text.slice(from, to);
    const shift = block.length + 1;
    return {
      text: text.slice(0, to) + NL + block + text.slice(to),
      start: start + shift,
      end: end + shift
    };
  }

  /** Take the touched lines out entirely. */
  function deleteLines(state) {
    const { text, start, end } = state;
    const { from, to } = lineSpan(text, start, end);
    // Take the line break with it, or deleting the last line leaves a blank one.
    const cutTo = to < text.length ? to + 1 : to;
    const cutFrom = cutTo > text.length - 1 && from > 0 ? from - 1 : from;
    const next = text.slice(0, cutFrom) + text.slice(cutTo);
    const at = Math.min(cutFrom, next.length);
    return { text: next, start: at, end: at };
  }

  /** Swap the touched lines with the one above or below. */
  function moveLines(state, direction) {
    const { text, start, end } = state;
    const { from, to } = lineSpan(text, start, end);

    if (direction < 0) {
      if (from === 0) return state;
      const above = text.lastIndexOf(NL, from - 2) + 1;
      const block = text.slice(from, to);
      const over = text.slice(above, from - 1);
      const next = text.slice(0, above) + block + NL + over + text.slice(to);
      const shift = from - above;
      return { text: next, start: start - shift, end: end - shift };
    }

    if (to >= text.length) return state;
    let belowEnd = text.indexOf(NL, to + 1);
    if (belowEnd === -1) belowEnd = text.length;
    const block = text.slice(from, to);
    const under = text.slice(to + 1, belowEnd);
    const next = text.slice(0, from) + under + NL + block + text.slice(belowEnd);
    const shift = under.length + 1;
    return { text: next, start: start + shift, end: end + shift };
  }

  /**
   * Push the text right.
   *
   * With nothing selected this is just an indent's worth of space where the
   * caret is - which is what Tab means when you are typing. With a selection it
   * moves every line, which is what Tab means when you are tidying.
   */
  function indent(state, unit) {
    const { text, start, end } = state;
    const pad = unit || '  ';

    if (start === end) {
      return {
        text: text.slice(0, start) + pad + text.slice(start),
        start: start + pad.length,
        end: start + pad.length
      };
    }

    const { from, to } = lineSpan(text, start, end);
    const block = text.slice(from, to).split(NL).map((line) => pad + line).join(NL);
    const added = pad.length;
    const lines = text.slice(from, to).split(NL).length;
    return {
      text: text.slice(0, from) + block + text.slice(to),
      start: start + added,
      end: end + added * lines
    };
  }

  /** Pull the text back left, by an indent or by whatever is there. */
  function outdent(state, unit) {
    const { text, start, end } = state;
    const pad = unit || '  ';
    const { from, to } = lineSpan(text, start, end);

    let firstRemoved = 0;
    let removed = 0;
    const block = text.slice(from, to).split(NL).map((line, i) => {
      let take = 0;
      if (line.startsWith('\t')) take = 1;
      else {
        while (take < pad.length && line[take] === ' ') take += 1;
      }
      if (i === 0) firstRemoved = take;
      removed += take;
      return line.slice(take);
    }).join(NL);

    return {
      text: text.slice(0, from) + block + text.slice(to),
      start: Math.max(from, start - firstRemoved),
      end: Math.max(from, end - removed)
    };
  }

  /**
   * Comment the touched lines out, or bring them back.
   *
   * Adding wins ties: if any line is not commented, the whole block gets
   * commented, so pressing it twice on a mixed block is never a no-op.
   */
  function toggleComment(state, style) {
    const { text, start, end } = state;
    const { from, to } = lineSpan(text, start, end);
    const lines = text.slice(from, to).split(NL);
    const real = lines.filter((l) => l.trim() !== '');
    if (!real.length) return state;

    let block;
    if (style.line) {
      const token = style.line;
      const allOut = real.every((l) => l.trim().startsWith(token));
      block = lines.map((line) => {
        if (line.trim() === '') return line;
        if (allOut) {
          const at = line.indexOf(token);
          return line.slice(0, at) + line.slice(at + token.length).replace(/^ /, '');
        }
        const lead = line.match(/^\s*/)[0];
        return lead + token + ' ' + line.slice(lead.length);
      }).join(NL);
    } else {
      const { open, close } = style;
      const allOut = real.every((l) => l.trim().startsWith(open) && l.trim().endsWith(close));
      block = lines.map((line) => {
        if (line.trim() === '') return line;
        const lead = line.match(/^\s*/)[0];
        const body = line.slice(lead.length);
        if (allOut) {
          return lead + body.slice(open.length, body.length - close.length).trim();
        }
        return lead + open + ' ' + body + ' ' + close;
      }).join(NL);
    }

    const next = text.slice(0, from) + block + text.slice(to);
    // Keep the whole block selected, since that is what was acted on.
    return { text: next, start: from, end: from + block.length };
  }

  /** Upper or lower case, over the selection or the word the caret is in. */
  function changeCase(state, upper) {
    let { text, start, end } = state;
    if (start === end) {
      while (start > 0 && /\w/.test(text[start - 1])) start -= 1;
      while (end < text.length && /\w/.test(text[end])) end += 1;
      if (start === end) return state;
    }
    const piece = text.slice(start, end);
    const changed = upper ? piece.toUpperCase() : piece.toLowerCase();
    return { text: text.slice(0, start) + changed + text.slice(end), start, end };
  }

  /** Today, written the way this computer writes it. */
  function insertDate(state, when) {
    const now = when || new Date();
    const stamp = now.toLocaleDateString(undefined, {
      year: 'numeric', month: 'long', day: 'numeric'
    });
    const { text, start, end } = state;
    const at = start + stamp.length;
    return { text: text.slice(0, start) + stamp + text.slice(end), start: at, end: at };
  }

  /** Take the trailing spaces off every line. */
  function trimTrailing(state) {
    const lines = state.text.split(NL);
    const next = lines.map((l) => l.replace(/[ \t]+$/, '')).join(NL);
    const at = Math.min(state.start, next.length);
    return { text: next, start: at, end: Math.min(state.end, next.length) };
  }

  /* --------------------------------------------------------------- finding */

  /**
   * Build the matcher a search box describes.
   *
   * Returns null for a pattern that cannot be read - a half-written regular
   * expression while it is still being typed - so the caller can say so rather
   * than throw.
   */
  function searcher(query, { regex = false, caseSensitive = false, wholeWord = false } = {}) {
    if (!query) return null;
    const flags = 'g' + (caseSensitive ? '' : 'i');
    let source = regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (wholeWord) source = '\\b(?:' + source + ')\\b';
    try {
      return new RegExp(source, flags);
    } catch {
      return null;
    }
  }

  /** Every match, as offsets. */
  function findAll(text, pattern) {
    if (!pattern) return [];
    const out = [];
    pattern.lastIndex = 0;
    let m = pattern.exec(text);
    while (m) {
      out.push({ start: m.index, end: m.index + m[0].length });
      // A pattern that can match nothing would otherwise never move on.
      if (m[0] === '') pattern.lastIndex += 1;
      m = pattern.exec(text);
    }
    return out;
  }

  /**
   * The match after `from`, wrapping round to the start.
   *
   * `from` is the start of the current selection, never its end. Going
   * backwards from the end of the match you are sitting on finds that same
   * match again, and "find previous" appears not to work.
   */
  function nextMatch(matches, from, backwards) {
    if (!matches.length) return -1;
    if (backwards) {
      for (let i = matches.length - 1; i >= 0; i--) {
        if (matches[i].start < from) return i;
      }
      return matches.length - 1;
    }
    for (let i = 0; i < matches.length; i++) {
      if (matches[i].start >= from) return i;
    }
    return 0;
  }

  /* --------------------------------------------------------------- history */

  /**
   * Undo and redo, per sheet.
   *
   * Each entry is a whole snapshot of the text. For files of the size this
   * editor is for that costs nothing worth measuring, and it makes the awkward
   * part - undoing an operation that changed six lines at once - the same code
   * as undoing a keystroke.
   *
   * Typing coalesces: a run of keystrokes close together becomes one entry, so
   * undo takes back a word rather than a letter. Anything that is not typing
   * always starts a new entry, so an operation is never half-undone.
   */
  class History {
    constructor(state, { limit = 400, coalesceMs = 700 } = {}) {
      this.stack = [{ ...state }];
      this.at = 0;
      this.limit = limit;
      this.coalesceMs = coalesceMs;
      this.lastKind = 'start';
      this.lastAt = 0;
    }

    get canUndo() { return this.at > 0; }
    get canRedo() { return this.at < this.stack.length - 1; }
    get current() { return this.stack[this.at]; }

    /** @param {'type'|'edit'} kind */
    push(state, kind = 'edit', now = Date.now()) {
      const top = this.stack[this.at];
      if (top && top.text === state.text) {
        // Only the selection moved; remember that, but do not make it undoable.
        this.stack[this.at] = { ...state };
        return false;
      }

      const runOn = kind === 'type' && this.lastKind === 'type' &&
        now - this.lastAt < this.coalesceMs;

      this.lastKind = kind;
      this.lastAt = now;

      if (runOn) {
        this.stack[this.at] = { ...state };
        return true;
      }

      // Anything undone and then departed from is gone for good.
      this.stack.length = this.at + 1;
      this.stack.push({ ...state });
      if (this.stack.length > this.limit) this.stack.shift();
      this.at = this.stack.length - 1;
      return true;
    }

    /** Start a fresh entry next time, whatever was happening before. */
    seal() {
      this.lastKind = 'edit';
    }

    undo() {
      if (!this.canUndo) return null;
      this.at -= 1;
      this.seal();
      return { ...this.stack[this.at] };
    }

    redo() {
      if (!this.canRedo) return null;
      this.at += 1;
      this.seal();
      return { ...this.stack[this.at] };
    }
  }

  global.NimbusEdits = {
    NL,
    lineSpan,
    lineOf,
    startOfLine,
    commentStyle,
    duplicateLines,
    deleteLines,
    moveLines,
    indent,
    outdent,
    toggleComment,
    changeCase,
    insertDate,
    trimTrailing,
    searcher,
    findAll,
    nextMatch,
    History
  };
})(typeof window === 'undefined' ? globalThis : window);
