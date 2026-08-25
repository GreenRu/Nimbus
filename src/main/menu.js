'use strict';

const { Menu } = require('electron');

/**
 * The application menu, built from the same list of commands the palette and
 * the shortcuts use.
 *
 * Nothing here decides what a command does or what its shortcut is; it only
 * arranges them. That is the point of one list: a menu cannot fall out of step
 * with the keyboard, because neither of them holds the truth.
 *
 * The menu sends the command's name to the window and stops. Electron would
 * happily run the accelerator itself, but then a shortcut would behave
 * differently depending on whether the menu was open, and the renderer already
 * has to handle keys it presses inside the text.
 */

/** Electron writes accelerators its own way. */
function accelerator(accel) {
  if (!accel) return undefined;
  return accel
    .replace(/^Ctrl\+/, 'CommandOrControl+')
    .replace(/\bUp\b/, 'Up')
    .replace(/\bDown\b/, 'Down');
}

function build({ commands, smartMode, send, recent, openRecent }) {
  const available = commands.available(smartMode);
  const groups = commands.grouped(available);
  const item = (id) => {
    const command = commands.byId.get(id);
    if (!command) return null;
    return {
      label: command.label,
      accelerator: accelerator(command.accel),
      click: () => send(command.id)
    };
  };

  const fileItems = groups.find((g) => g.name === 'File');
  const template = [];

  template.push({
    label: 'File',
    submenu: [
      ...(fileItems ? fileItems.items.map((c) => item(c.id)).filter(Boolean) : []),
      { type: 'separator' },
      {
        label: 'Recent files',
        enabled: recent.length > 0,
        submenu: recent.length
          ? recent.map((p) => ({ label: p, click: () => openRecent(p) }))
          : [{ label: 'Nothing yet', enabled: false }]
      },
      { type: 'separator' },
      { role: 'quit', label: 'Quit Nimbus' }
    ]
  });

  for (const group of groups) {
    if (group.name === 'File') continue;
    template.push({
      label: group.name === 'Smart' ? 'Smart Mode' : group.name,
      submenu: group.items.map((c) => item(c.id)).filter(Boolean)
    });
  }

  template.push({
    label: 'Help',
    submenu: [
      { label: 'Nimbus is part of Ozone', enabled: false },
      { label: 'Find a command', accelerator: 'CommandOrControl+Shift+P', click: () => send('view.palette') }
    ]
  });

  return Menu.buildFromTemplate(template);
}

module.exports = { build, accelerator };
