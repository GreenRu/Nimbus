'use strict';

/**
 * Wearing a theme.
 *
 * A theme is one of the program's two built-in palettes, and - when a plugin is
 * offering one - a set of variables laid over the top of it. The base decides
 * everything the stylesheets do not name explicitly; the variables replace the
 * colours that are named.
 *
 * Every program in Ozone ships a pair named for a time of day that suits it -
 * Stratus has day and night, Nimbus has sunset and dusk - so the pair is
 * configured here rather than written into the module. The variable names
 * underneath are the same everywhere, which is what lets a theme written for one
 * program be read in another.
 *
 * Applied the same way in the interface and in the program's own pages, so a
 * theme that only fills in half its palette still leaves something you can read.
 */

(function () {
  let applied = [];

  // Nimbus's pair. The lighter one is the default, here and everywhere.
  let bases = { light: 'sunset', dark: 'dusk' };

  /** Name the program's two palettes. Called once, at load. */
  function configure(pair) {
    if (pair && pair.light && pair.dark) bases = { light: pair.light, dark: pair.dark };
  }

  /**
   * @param {{ base?: string, variables?: Record<string, string> }} theme
   */
  function apply(theme) {
    const root = document.documentElement;
    const payload = typeof theme === 'string' ? { base: theme } : (theme || {});

    root.dataset.theme = payload.base === bases.dark ? bases.dark : bases.light;

    // Clear what the last theme set before setting this one, or a variable it
    // dropped would linger.
    for (const name of applied) root.style.removeProperty(name);
    applied = [];

    const vars = payload.variables || {};
    for (const [name, value] of Object.entries(vars)) {
      if (!/^--[a-z0-9-]{1,40}$/i.test(name)) continue;
      if (typeof value !== 'string' || /[{};]/.test(value)) continue;
      root.style.setProperty(name, value);
      applied.push(name);
    }
  }

  window.SkyTheme = { apply, configure, bases: () => ({ ...bases }) };
})();
