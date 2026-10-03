/*
 * Theme bootstrap — loaded as a *blocking* classic script in <head> so the
 * correct theme is on <html> before first paint (no flash of the wrong theme).
 * Kept dependency-free and outside the module graph for that reason.
 *
 * Themes: hex (default) | clean | clean-dark | brutalist | terminal.
 * Resolution: a valid stored choice wins; otherwise the default (hex).
 * CSP note: same-origin 'self' script, so it satisfies the strict script-src.
 */
(function () {
  'use strict';
  var STORAGE_KEY = 'spellcast-theme';
  var DEFAULT_THEME = 'hex';
  var THEMES = ['clean', 'clean-dark', 'hex', 'brutalist', 'terminal'];
  var root = document.documentElement;

  // Map legacy values (old light/dark toggle, and the pre-rename "persona5").
  var LEGACY = { light: 'clean', dark: 'clean-dark', persona5: 'hex' };

  function readStored() {
    var v;
    try { v = localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
    if (v && LEGACY[v]) v = LEGACY[v];
    return THEMES.indexOf(v) !== -1 ? v : null;
  }

  function apply(theme) {
    root.setAttribute('data-theme', theme);
  }

  // Set initial theme immediately (runs during head parse, before <body> paints).
  apply(readStored() || DEFAULT_THEME);

  // Wire up the picker once the DOM is ready.
  document.addEventListener('DOMContentLoaded', function () {
    var picker = document.getElementById('theme-picker');
    if (!picker) return;

    picker.value = root.getAttribute('data-theme') || DEFAULT_THEME;
    picker.addEventListener('change', function () {
      var next = THEMES.indexOf(picker.value) !== -1 ? picker.value : DEFAULT_THEME;
      apply(next);
      try { localStorage.setItem(STORAGE_KEY, next); } catch (e) { /* private mode */ }
    });
  });
})();
