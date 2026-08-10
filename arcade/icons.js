/* Run The Arcade - shared game icon family.
 * One consistent look: monochrome, thick square-cut strokes, minimal geometry,
 * drawn on a 24x24 grid, colored via `currentColor` so each icon inherits its
 * surrounding accent. No team logos, no images.
 *
 * Usage:
 *   RTGIcons.get('career')                      -> decorative (aria-hidden), inherits font-size
 *   RTGIcons.get('career', {label:'Career Path'})-> labelled (role="img")
 *   RTGIcons.get('career', {size:28})            -> explicit px size
 * Returns an <svg> string; inject with innerHTML. Defined synchronously so a
 * page's inline script can call it during first render.
 */
(function () {
  'use strict';
  // inner markup only (shared <svg> wrapper added by get())
  var P = {
    // Number Game - a jersey wearing the number
    table: '<path d="M8.6 3.4 4.6 5.4 3.1 9.6 6 10.6 6 20.6 18 20.6 18 10.6 20.9 9.6 19.4 5.4 15.4 3.4"/><path d="M8.6 3.4c.7 2 2 3 3.4 3s2.7-1 3.4-3"/><text x="12" y="17.2" text-anchor="middle" font-size="7" font-weight="900" font-family="Archivo, system-ui, sans-serif" fill="currentColor" stroke="none">26</text>',
    // Daily Match - grouped tiles (2x2)
    match: '<rect x="4" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/>',
    // Career Path - connected team stops on a route
    career: '<path d="M5 5v7a2 2 0 0 0 2 2h6a2 2 0 0 1 2 2v3"/><rect x="3" y="3" width="4" height="4"/><rect x="17" y="17" width="4" height="4"/><rect x="11" y="10" width="4" height="4"/>',
    // Odd One Out - three grouped, one cut apart
    oddone: '<circle cx="7" cy="7" r="2.6"/><circle cx="14" cy="7" r="2.6"/><circle cx="7" cy="14" r="2.6"/><rect x="15" y="15" width="6" height="6"/>',
    // Rank It - ordered steps / podium
    rankit: '<rect x="3.5" y="14" width="5" height="6"/><rect x="9.5" y="9" width="5" height="11"/><rect x="15.5" y="5" width="5" height="15"/>',
    // Guess the Player - mystery player card
    guess: '<rect x="5" y="3.5" width="14" height="17" rx="1"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.4 2.3c-.9.4-1.4 1-1.4 2"/><path d="M11.5 16.5v.01"/>',
    // Alma Mater - college pennant
    almamater: '<path d="M6 3.5v17"/><path d="M6 4.5 L20 8 L6 11.5 Z"/>',
    // Daily Crossword - scoreboard grid (one filled cell)
    crossword: '<rect x="4" y="4" width="16" height="16"/><path d="M4 12h16M12 4v16"/><rect x="4" y="4" width="8" height="8" fill="currentColor" stroke="none" opacity=".9"/>',
    // Daily Word Search - magnifier over letters
    wordsearch: '<circle cx="10" cy="10" r="6"/><path d="M14.5 14.5 L20 20"/><path d="M8 10h4M10 8v4"/>'
  };
  // route hub cards through the same keys the games use
  var ALIAS = { word: 'wordsearch', cross: 'crossword', odd: 'oddone', alma: 'almamater' };

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function get(name, opts) {
    opts = opts || {};
    var key = ALIAS[name] || name;
    var inner = P[key];
    if (!inner) return '';
    var size = opts.size ? (' width="' + (+opts.size) + '" height="' + (+opts.size) + '"') : ' width="1em" height="1em"';
    var a11y = opts.label ? (' role="img" aria-label="' + esc(opts.label) + '"') : ' aria-hidden="true" focusable="false"';
    var cls = opts.className ? (' class="' + esc(opts.className) + '"') : '';
    return '<svg' + cls + size + a11y + ' viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2.2" stroke-linecap="square" stroke-linejoin="miter">' + inner + '</svg>';
  }

  window.RTGIcons = { get: get, KEYS: Object.keys(P) };
})();
