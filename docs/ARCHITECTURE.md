# Architecture

Small enough, for now, that this page can be short. The shared reasoning behind
all of it is the
[Ozone house style](https://github.com/GreenRu/Ozone/blob/main/docs/HOUSE-STYLE.md);
this page only records what is particular to Nimbus.

## The three kinds of code

| | Runs in | May |
| --- | --- | --- |
| `src/main/` | Node | Everything: the disk, the dialogs, the window |
| `src/preload/` | The bridge | Only what it lists by hand |
| `src/renderer/` | The interface | Draw state, and ask for things |

The window is `contextIsolation: true`, `nodeIntegration: false`,
`sandbox: true`. `ipcRenderer` is never exposed; `src/preload/chrome.js` builds
an object with a named function per channel.

## The renderer never names a path

`files.open()` takes no argument. It asks, the main process puts the picker up,
reads whatever came back and hands over the text. `files.save(sheet)` passes the
path the main process itself gave out earlier, or nothing at all for a sheet
that has never been written — in which case a picker decides.

This is the same rule Stratus applies to origins: a renderer that can name a
target can ask for something nobody chose.

## Themes

Two palettes, `sunset` and `dusk`, and the lighter one is the default.

They exist in two places because they have to. `src/renderer/styles.css` holds
the variables everything is drawn from; `THEMES` in `src/main/index.js` holds
just the sky and symbol colours, because the window controls are drawn by the
system and take a colour rather than a variable. **Keep them in step** — the
comment above each says so.

`src/shared/theme.js` is configured with the program's pair of names rather than
having them written in, which is what lets the same file serve every program in
the family.

## The sheet strip

Sheets live in the renderer as what is on screen: id, name, path, text, and
whether there is unsaved work. The paper is one `<textarea>`, so switching
sheets stashes what is on it first. That is the whole trick, and it is written
down here because it is the thing most likely to be broken by accident.

Each sheet is a cloud, from `src/shared/clouds.js`, seeded by its id so a sheet
keeps its own shape instead of re-rolling on every render.

## Not here yet

No plugin host, no `nimbus://` pages, no test suites. When the editing surface
stops being a `<textarea>`, the thing to watch for is the rule beside it: it is
a separate scrolling element kept in step by hand.
