# Nimbus

A small text editor with a sky behind it.

Nimbus is the second program in **[Ozone](https://github.com/GreenRu/Ozone)**, a
family of small, cloud-themed desktop programs. It is the rain cloud — the one
that actually produces something. What it shares with the rest, and what it may
not do, is the
[Ozone house style](https://github.com/GreenRu/Ozone/blob/main/docs/HOUSE-STYLE.md).

> **Early.** What is here is the shell, and it runs: the window, both themes,
> the sheet strip, line numbers, a word count, and opening and saving real
> files. The editing surface is a plain `<textarea>` for now — no syntax
> highlighting, no find, no plugin host yet. See
> [What is not built](#what-is-not-built).

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

The button at the top of the sidebar switches between them, and the choice is
remembered. The window controls are drawn by the system and cannot take a CSS
variable, so the sky colour is passed to `setTitleBarOverlay` separately —
`THEMES` in `src/main/index.js` is where both halves meet.

## What it does

- **Sheets.** Several open at once, each a cloud in the left column, drawn by
  the same generator the whole family uses and seeded so one keeps its own shape.
  A dot appears when there is unsaved work.
- **Open and save.** `Ctrl+O`, `Ctrl+S`, `Ctrl+Shift+S` for save-as. The
  renderer never names a path: it asks, and the main process puts the picker up
  and reads whatever came back.
- **Line numbers** on their own rule, and a status strip with the cursor
  position and a word count.

| Key | Does |
| --- | --- |
| `Ctrl+N` | New sheet |
| `Ctrl+O` | Open a file |
| `Ctrl+S` / `Ctrl+Shift+S` | Save / save as |

## Building

```bash
npm install
npm start
```

```bash
npm run icon        # redraw assets/icon.ico from the palette
npm run package     # a folder under dist/
```

## Layout

```
src/
  main/
    index.js       the window, the themes, and every file the program touches
    store.js       preferences in one JSON file in the user-data directory
  preload/
    chrome.js      the context bridge - every channel listed by hand
  renderer/        the interface: sidebar, sheet strip, paper, status
  shared/          loaded by the interface and by the program's own pages
    clouds.js        the cloud silhouette generator (shared with Stratus)
    theme.js         applying a theme; takes its pair of names from the program
plugins/           nothing yet - see below
tools/make-icon.ps1
```

Three kinds of code that never blur: `main/` owns all state and every privileged
call, `preload/` is the only bridge, `renderer/` draws state and owns none of it.
The window is `contextIsolation: true`, `nodeIntegration: false`,
`sandbox: true`, and `ipcRenderer` is never exposed.

## What is not built

Honestly, so nobody goes looking:

- **No plugin host.** The house style says to port it before you need it,
  precisely so that adding one later does not mean unpicking every assumption
  about who may touch state. It is the next thing.
- **No syntax highlighting, find, or undo history beyond the textarea's own.**
- **No `nimbus://` internal pages**, so no settings page — the theme button is
  the only preference with a control.
- **Only one test suite.** 22 assertions covering the window, both themes, the
  sheet strip, the rule and the word count, and that the bridge exposes exactly
  three things. Suites live outside the repository, as they do in Stratus, whose
  `docs/TESTING.md` is the pattern.
- **`theme.js` here takes its pair of theme names from the program**, which
  Stratus's copy does not yet do. Bring Stratus's into line next time it is
  touched, so the shared file is genuinely shared.

## Licence

GPL-3.0-or-later.
