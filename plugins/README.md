# Plugins

Nothing here yet. Nimbus has no plugin host.

When it gets one it takes the same shape as every other program in Ozone: a
folder with a declarative `plugin.json` beside whatever files it names, no
plugin code in the main process at all, and everything switched off until
switched on. The contract is in the
[Ozone house style](https://github.com/GreenRu/Ozone/blob/main/docs/HOUSE-STYLE.md#plugins),
and Stratus's `plugins/` has three working examples to copy.
