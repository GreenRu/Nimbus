# Nimbus

A small text editor with a sky behind it.

Nimbus is the second program in **[Ozone](https://github.com/GreenRu/Ozone)**, a
family of small, cloud-themed desktop programs. It is the rain cloud — the one
that actually produces something. What it shares with the rest, and what it may
not do, is the
[Ozone house style](https://github.com/GreenRu/Ozone/blob/main/docs/HOUSE-STYLE.md).

- [Sunset and dusk](#sunset-and-dusk)
- [Smart Mode](#smart-mode)
- [What it does](#what-it-does)
- [Every shortcut](#every-shortcut)
- [Building](#building)
- [Layout](#layout)
- [What is not built](#what-is-not-built)

## Sunset and dusk

Every Ozone program ships two themes, named for a time of day that suits it,
over the same variable names — so a theme written for one is comprehensible in
another. Stratus has day and night. Nimbus has **sunset** and **dusk**: the hour
there is still enough light to write by, and then the lamp coming on.

| | Sky | Paper | Accent |
| --- | --- | --- | --- |
| **Sunset** (default) | `#efa079` → `#f9d6b6` | `#fff6ee` | `#d4663c` |
| **Dusk** | `#2b2340` → `#120e1c` | `#171226` | `#e0885f` |

Dusk is the same variables at different values, never a filter, and it keeps the
last of the sunset as its accent so the two read as one evening rather than as
two programs. The icon is drawn from the sunset palette by
`tools/make-icon.ps1`, with rain falling out from under the cloud.

## Smart Mode

Nimbus is a text editor. It is not a place to learn what a byte-order mark is.

So the technical layer is **off by default**, and Smart Mode is the switch that
brings it out. Nothing is removed by leaving it off — every shortcut still works
and every command still runs — but the things that need you to already know what
they mean are not put in front of you.

| Off | On |
| --- | --- |
| Line, column, word count | …and the file's encoding and line endings, switchable |
| Find, with a count | …and match case, whole word, regular expressions |
| An indent size | …and whether to indent with tabs or spaces |
| The everyday commands in the palette | …and every command there is, marked |

Ask for something that lives in Smart Mode while it is off and the program says
so and offers to turn it on, rather than refusing or silently doing it anyway.
The switch is in **Settings**, which also lists exactly what it adds — read from
the command list itself, so the list cannot go stale.

## What it does

- **Sheets.** Several open at once, each a cloud in the left column, drawn by
  the same generator the whole family uses and seeded so one keeps its own shape.
  **Drag one up or down** to reorder them, and **close one from the cloud
  itself** — the × shares its corner with the unsaved dot, since you never want
  both at once. Middle-click closes one too, and a sheet with unsaved work asks
  before it goes.
- **Undo that belongs to the sheet.** A run of typing collapses into one step,
  an operation is always its own step, and switching sheets and back does not
  lose the history — which is the one thing a plain text box cannot do.
- **Find and replace**, with a live count, wrapping, and replace-all as a single
  undoable step.
- **The line operations** you would expect: duplicate, delete, move up and down,
  indent and outdent a whole selection, comment out — with the comment mark
  chosen from the file's own extension, so a `.py` gets `#` and a `.js` gets `//`.
- **A command palette** on `Ctrl+Shift+P`, which is also where you go to find out
  what a program can do.
- **Line numbers that stay level with the text**, even wrapped: how many rows
  each line really takes is measured, not assumed.
- **Files** open, save, save-as, print, drag-and-drop, a recent list, and a
  session that comes back — with unsaved work — next launch.
- **Encodings handled quietly.** UTF-8, UTF-16 with or without a mark, and
  Latin-1 for bytes that cannot be anything else; CRLF is read and written back
  as it was found. You are only *told* about any of it in Smart Mode.

## Every shortcut

| Key | Does |
| --- | --- |
| `Ctrl+N` / `Ctrl+O` / `Ctrl+S` / `Ctrl+Shift+S` | New sheet, open, save, save as |
| `Ctrl+W` / `Ctrl+Shift+T` | Close a sheet, reopen the last closed one |
| `Ctrl+P` | Print |
| `Ctrl+Z` / `Ctrl+Y` / `Ctrl+Shift+Z` | Undo, redo |
| `Ctrl+X` `Ctrl+C` `Ctrl+V` `Ctrl+A` | Cut, copy, paste, select all |
| `Ctrl+F` / `F3` / `Shift+F3` / `Ctrl+H` | Find, next, previous, replace |
| `Ctrl+G` | Go to line |
| `Tab` / `Shift+Tab` | Indent, outdent |
| `Ctrl+D` / `Ctrl+Shift+K` | Duplicate the line, delete it |
| `Alt+↑` / `Alt+↓` | Move the line up or down |
| `Ctrl+/` | Comment out |
| `Ctrl+=` / `Ctrl+-` / `Ctrl+0` | Bigger, smaller, normal |
| `Alt+Z` | Wrap long lines |
| `Ctrl+B` / `F11` | Show or hide the sheets, full screen |
| `Ctrl+Shift+P` / `Ctrl+,` | Find a command, settings |

They are defined once, in `src/shared/commands.js`, and the menu bar, the
palette, the context menu and the keyboard all read from that one list — so a
shortcut cannot say one thing in the menu and do another on the keyboard.

## Building

```bash
npm install
npm start
```

```bash
npm run shortcut    # a desktop shortcut, no packaging needed
npm run icon        # redraw assets/icon.ico from the palette
npm run package     # a folder under dist/
```

The shortcut launches Nimbus through the stock `electron.exe` in `node_modules`
rather than a packaged build. Windows 11's Smart App Control blocks executables
that are both unsigned and unknown to its reputation graph — a freshly packaged
build is exactly that, while the stock binary's hash is on millions of machines.
No packaging, no signing, and no security setting weakened.

## Layout

```
src/
  main/
    index.js       the window, the themes, and every file the program touches
    files.js       reading and writing text: encodings and line endings
    store.js       preferences in one JSON file in the user-data directory
    urls.js        nimbus:// addresses for the program's own pages
    menu.js        the application menu, built from the command list
    plugins.js     the plugin host - declarative manifests only
  preload/
    chrome.js      the editor's bridge - every channel listed by hand
    page.js        the narrower bridge the program's own pages get
  renderer/        the interface: sidebar, sheets, paper, find, palette
  pages/           settings
  shared/          loaded by the interface, the pages, and the main process
    commands.js      everything the program can do, as data
    edits.js         the text operations and the undo history, as pure functions
    clouds.js        the cloud silhouette generator (shared with Stratus)
    theme.js         applying a theme; takes its pair of names from the program
plugins/           nothing bundled yet
tools/             make-icon.ps1, make-shortcut.ps1
```

Three kinds of code that never blur: `main/` owns all state and every privileged
call, `preload/` is the only bridge, `renderer/` draws state and owns none of it.
The window is `contextIsolation: true`, `nodeIntegration: false`,
`sandbox: true`, and `ipcRenderer` is never exposed.

`edits.js` is pure — every operation takes `{ text, start, end }` and returns a
new one — which is why the awkward cases are actually covered: a selection that
ends exactly on a line break, an outdent on a line with nothing left to outdent,
a search pattern half-typed.

## What is not built

Honestly, so nobody goes looking:

- **Plugins can add themes and pages, and cannot run code.** Stratus lets a
  plugin inject scripts because a browser has an isolated world to put them in.
  Nimbus has no such place — its only renderer is the interface itself — so the
  answer is no rather than "carefully". A manifest asking for `scripts` is told
  so in Settings rather than ignored.
- **No syntax highlighting.** The editing surface is still a `<textarea>`.
- **No multiple cursors, no split view, no file tree.**
- **`theme.js` here takes its pair of theme names from the program**, which
  Stratus's copy does not yet do. Bring Stratus's into line next time it is
  touched, so the shared file is genuinely shared.

## Testing

Five suites, 153 assertions, run the way the whole family runs them — as scripts
the program's own runtime executes. They live outside the repository; Stratus's
`docs/TESTING.md` is the pattern.

| Suite | Covers |
| --- | --- |
| `editstest.js` | 52 — the text operations and the undo history, in plain node |
| `filestest.js` | 16 — encodings and line endings, round-tripped |
| `nimbusfull.js` | 60 — the editor end to end, Smart Mode, and the settings page |
| `sheetstest.js` | 20 — closing and dragging sheets, with a real mouse as well as a dispatched one |
| `rulecheck.js` | 5 — the numbers keeping step with the lines |

## Icons

From [css.gg](https://css.gg) by Astrit, tag `2.1.1`, under the MIT licence. The
set is shared across the family and lives in
[Ozone/icons](https://github.com/GreenRu/Ozone/tree/main/icons); `src/shared/icons.js`
here is generated from it and committed, so this repository stands on its own.

Later css.gg releases are licensed for non-commercial use only, which cannot
ship in a GPL program - hence the pinned version.

The program's own cloud mark is not from the set and is drawn by hand.

## Licence

GPL-3.0-or-later.
