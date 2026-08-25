# Architecture

The shared reasoning behind all of it is the
[Ozone house style](https://github.com/GreenRu/Ozone/blob/main/docs/HOUSE-STYLE.md).
This page records what is particular to Nimbus.

## The three kinds of code

| | Runs in | May |
| --- | --- | --- |
| `src/main/` | Node | Everything: the disk, the dialogs, the windows |
| `src/preload/` | The bridge | Only what it lists by hand |
| `src/renderer/` | The interface | Draw state, and ask for things |
| `src/shared/` | Both | Hold data and pure functions, and reach for nothing |

The window is `contextIsolation: true`, `nodeIntegration: false`,
`sandbox: true`. `ipcRenderer` is never exposed; the preloads build an object
with a named function per channel.

## One list of commands

`src/shared/commands.js` is data: a name, a label, a shortcut, and two flags.
The renderer attaches a function to each name, the menu bar is built from it,
the palette searches it, the context menu picks from it, and the settings page
reads it to explain what Smart Mode adds.

That is the whole reason it exists. Four things that each hold their own copy of
"what this program can do" drift apart the first week somebody adds a command,
and the one that drifts is never the one being looked at.

The menu bar does not run anything: it sends the command's name to the window.
Electron would happily run the accelerator itself, but then a shortcut would
behave differently depending on whether the menu was open, and the renderer
already handles the keys it presses inside the text.

## Smart Mode

Two flags on each command carry it:

- `basic` — an everyday one. These are what the palette offers unprompted with
  Smart Mode off. Typing still searches everything that exists.
- `smart` — with Smart Mode off, `available()` does not return it at all. Its
  shortcut does not fire and it is in no menu. A command nobody can see is a
  command nobody can be confused by.

Asking for a `smart` command anyway — from a saved shortcut, or a plugin later —
does not silently work and does not silently fail: `offerSmartMode` says what
the setting is and offers to turn it on.

## The editor is a textarea, and what that costs

The editing surface is a plain `<textarea>`. That buys correct text input,
selection, the clipboard, spell-check and accessibility for nothing, and it
costs three things that had to be built back:

**Undo.** The textarea's own history dies when its value is set from script, and
belongs to the box rather than to the sheet. So `edits.js` keeps a history per
sheet: whole snapshots, a run of typing coalesced into one entry, and anything
that is not typing always its own entry. Every change goes through `apply()`,
which is the single place the textarea, the sheet and the history agree.

**The line numbers, when lines wrap.** A wrapped line occupies several rows, so
a number printed per line drifts further from the text with every one. The rows
each line really takes are measured in `#mirror`, a hidden copy laid out at the
same width and metrics.

Two things about that measurement were wrong before they were right, and both
are worth knowing:

- The rule is a **flex sibling** of the paper, so drawing the rule changes how
  wide the paper is, which changes the wrapping. One pass measures at a width
  that no longer applies. It is measured twice.
- A range collapsed at the **very end** of a text node that ends in a newline
  returns an empty rectangle, which read as a wild negative and was quietly
  becoming one row — four rows short over sixty lines. The last line now takes
  whatever height is left over rather than being measured directly, and the
  mirror ends with a zero-width space so the trailing newline reliably makes a
  row to subtract.

**The current line.** A textarea cannot light one, so `#marks` sits behind it
with a single bar positioned from the caret's row — measured, again, because
with wrapping the caret's row is not its line.

## The renderer never names a path

`files.open()` takes no argument. It asks, the main process puts the picker up,
reads whatever came back and hands over the text. `files.read(path)` is the one
exception, and it only ever takes a path the main process itself handed out
earlier — from the picker, from a dropped file, or from the saved session.

This is the same rule Stratus applies to origins: a renderer that can name a
target can ask for something nobody chose.

## Encodings

`src/main/files.js` reads a file into the one kind of text the editor works in —
UTF-8, lines ending in a single newline — and writes it back the way it came.

A byte-order mark settles the encoding. Failing that, a run of zero bytes in the
odd positions is UTF-16 that forgot to say so, and anything that survives being
read as UTF-8 is UTF-8; only what fails that is Latin-1, since Latin-1 can never
fail and so proves nothing.

None of this is *shown* unless Smart Mode is on. All of it happens regardless,
because getting it wrong silently corrupts the file.

## Windows, and why there are no views

Nimbus has no `WebContentsView` anywhere. The law the rest of the family lives
under — that the interface cannot draw over content — does not apply, so the
palette, the context menu and the questions are ordinary elements, and that is
the whole reason they are short.

The program's own pages are separate windows, addressed as `nimbus://settings`
through `src/main/urls.js`, so that a plugin can contribute one without knowing
where anything lives on disk.

## Closing

The main process asks before it shuts. It knows nothing about what is unsaved
and has nowhere to ask; the renderer knows both. `win.on('close')` cancels the
close and sends `window:closing`; the renderer answers, and only a true answer
sets `mayClose` and closes for real.

## Plugins

Declarative manifests, and **no plugin code runs anywhere**. Stratus can inject
scripts because a browser has an isolated world to put them in. Nimbus's only
renderer is the interface itself, and a script there would have the run of the
editor, the open files and the bridge to the disk.

So the host takes `themes` and `pages` and refuses `scripts`, `styles`,
`commands`, `toolbar` and `shortcuts` — and a manifest that asked for one of
those is told so in Settings rather than quietly ignored. That limit stays until
there is somewhere safe to run the code, not until somebody wants the feature.
