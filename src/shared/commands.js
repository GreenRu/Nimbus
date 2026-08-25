'use strict';

/**
 * Everything Nimbus can be asked to do, in one list.
 *
 * This is data, not behaviour: a name, what to call it on screen, its shortcut,
 * and who it is for. The renderer attaches a function to each name, the menu
 * bar is built from it, the palette searches it, and the settings page reads it.
 * One list means those four can never drift apart, which is the only way three
 * of them stay right when the fourth changes.
 *
 * `basic` marks the commands an ordinary person needs. Those are what the
 * palette offers when Smart Mode is off - copy, paste, save, find. Everything
 * else is still there, still bound to its shortcut, and still reachable; it
 * simply is not put in front of somebody who did not ask for it.
 *
 * `smart` marks a command that only appears at all in Smart Mode - the ones
 * that need you to know what an encoding is before the question means anything.
 *
 * Loaded as a plain script by the interface and the program's own pages, and
 * required by the main process to build the menu - so it attaches to whatever
 * global it finds rather than using modules. One list, read from both sides.
 */
(function (global) {
  /**
   * @typedef {object} Command
   * @property {string} id     what the code calls it
   * @property {string} label  what a person calls it
   * @property {string} group  which part of the menu it belongs to
   * @property {string} [accel] its shortcut, written the way it is shown
   * @property {boolean} [basic] offered without being asked for
   * @property {boolean} [smart] only exists in Smart Mode
   * @property {string} [note]  a line of explanation where the label is not enough
   */

  /** @type {Command[]} */
  const COMMANDS = [
    // --- sheets and files -----------------------------------------------------
    { id: 'file.new', label: 'New sheet', group: 'File', accel: 'Ctrl+N', basic: true },
    { id: 'file.open', label: 'Open a file', group: 'File', accel: 'Ctrl+O', basic: true },
    { id: 'file.save', label: 'Save', group: 'File', accel: 'Ctrl+S', basic: true },
    { id: 'file.saveAs', label: 'Save as', group: 'File', accel: 'Ctrl+Shift+S', basic: true },
    { id: 'file.close', label: 'Close sheet', group: 'File', accel: 'Ctrl+W', basic: true },
    { id: 'file.reopen', label: 'Reopen closed sheet', group: 'File', accel: 'Ctrl+Shift+T', basic: true },
    { id: 'file.print', label: 'Print', group: 'File', accel: 'Ctrl+P', basic: true },

    // --- undoing and the clipboard --------------------------------------------
    { id: 'edit.undo', label: 'Undo', group: 'Edit', accel: 'Ctrl+Z', basic: true },
    { id: 'edit.redo', label: 'Redo', group: 'Edit', accel: 'Ctrl+Y', basic: true },
    { id: 'edit.cut', label: 'Cut', group: 'Edit', accel: 'Ctrl+X', basic: true },
    { id: 'edit.copy', label: 'Copy', group: 'Edit', accel: 'Ctrl+C', basic: true },
    { id: 'edit.paste', label: 'Paste', group: 'Edit', accel: 'Ctrl+V', basic: true },
    { id: 'edit.selectAll', label: 'Select all', group: 'Edit', accel: 'Ctrl+A', basic: true },

    // --- finding --------------------------------------------------------------
    { id: 'find.open', label: 'Find', group: 'Find', accel: 'Ctrl+F', basic: true },
    { id: 'find.next', label: 'Find next', group: 'Find', accel: 'F3', basic: true },
    { id: 'find.previous', label: 'Find previous', group: 'Find', accel: 'Shift+F3', basic: true },
    { id: 'find.replace', label: 'Find and replace', group: 'Find', accel: 'Ctrl+H', basic: true },
    { id: 'find.goToLine', label: 'Go to line', group: 'Find', accel: 'Ctrl+G', basic: true },

    // --- working on lines ------------------------------------------------------
    { id: 'edit.indent', label: 'Indent', group: 'Edit', accel: 'Tab', basic: true },
    { id: 'edit.outdent', label: 'Outdent', group: 'Edit', accel: 'Shift+Tab', basic: true },
    { id: 'edit.duplicateLine', label: 'Duplicate line', group: 'Edit', accel: 'Ctrl+D' },
    { id: 'edit.deleteLine', label: 'Delete line', group: 'Edit', accel: 'Ctrl+Shift+K' },
    { id: 'edit.moveLineUp', label: 'Move line up', group: 'Edit', accel: 'Alt+Up' },
    { id: 'edit.moveLineDown', label: 'Move line down', group: 'Edit', accel: 'Alt+Down' },
    { id: 'edit.toggleComment', label: 'Comment out', group: 'Edit', accel: 'Ctrl+/' },
    { id: 'edit.upperCase', label: 'Make upper case', group: 'Edit' },
    { id: 'edit.lowerCase', label: 'Make lower case', group: 'Edit' },
    { id: 'edit.insertDate', label: 'Insert the date', group: 'Edit' },
    {
      id: 'edit.trimWhitespace',
      label: 'Trim spaces off the ends of lines',
      group: 'Edit',
      smart: true
    },

    // --- looking at it ---------------------------------------------------------
    { id: 'view.zoomIn', label: 'Bigger text', group: 'View', accel: 'Ctrl+=', basic: true },
    { id: 'view.zoomOut', label: 'Smaller text', group: 'View', accel: 'Ctrl+-', basic: true },
    { id: 'view.zoomReset', label: 'Normal text size', group: 'View', accel: 'Ctrl+0', basic: true },
    { id: 'view.wrap', label: 'Wrap long lines', group: 'View', accel: 'Alt+Z', basic: true },
    { id: 'view.lineNumbers', label: 'Line numbers', group: 'View' },
    { id: 'view.sidebar', label: 'Show the sheets', group: 'View', accel: 'Ctrl+B', basic: true },
    { id: 'view.fullScreen', label: 'Full screen', group: 'View', accel: 'F11', basic: true },
    { id: 'view.palette', label: 'Find a command', group: 'View', accel: 'Ctrl+Shift+P', basic: true },
    { id: 'view.settings', label: 'Settings', group: 'View', accel: 'Ctrl+,', basic: true },

    // --- the technical layer ----------------------------------------------------
    {
      id: 'smart.encoding',
      label: 'Change how the file is encoded',
      group: 'Smart',
      smart: true,
      note: 'UTF-8 unless you know you need otherwise.'
    },
    {
      id: 'smart.lineEndings',
      label: 'Change the line endings',
      group: 'Smart',
      smart: true,
      note: 'Windows uses CRLF; almost everything else uses LF.'
    },
    {
      id: 'smart.reload',
      label: 'Reload from disk',
      group: 'Smart',
      smart: true,
      note: 'Throws away unsaved work in this sheet.'
    }
  ];

  const byId = new Map(COMMANDS.map((c) => [c.id, c]));

  /**
   * The commands that exist right now.
   *
   * With Smart Mode off, the technical ones are not merely hidden - they are not
   * there. A command nobody can see is a command nobody can be confused by.
   */
  function available(smartMode) {
    return smartMode ? COMMANDS.slice() : COMMANDS.filter((c) => !c.smart);
  }

  /**
   * What the palette offers unprompted.
   *
   * Plain mode shows the everyday ones: copying, pasting, saving, finding. Smart
   * Mode shows everything, because by then you have said you want it.
   */
  function offered(smartMode) {
    return smartMode ? COMMANDS.slice() : COMMANDS.filter((c) => c.basic);
  }

  /** Group them in the order the groups are listed, for a menu or a page. */
  function grouped(list) {
    const order = ['File', 'Edit', 'Find', 'View', 'Smart'];
    return order
      .map((name) => ({ name, items: list.filter((c) => c.group === name) }))
      .filter((g) => g.items.length);
  }

  global.NimbusCommands = { COMMANDS, byId, available, offered, grouped };
})(typeof window === 'undefined' ? globalThis : window);
