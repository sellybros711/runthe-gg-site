/* Run The Arcade - shared icon family. Mostly the games, plus the few marks the
 * arcade needs around them (see the note beside `ticket`).
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
    // Common Ground - grouped tiles (2x2)
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
    /* Not a game, and here on purpose: these two are the marks the arcade needs
       OUTSIDE a game tile, and they belong to the same family as the eight above
       rather than to whichever file drew them first.

       The ticket is the Arcade Card's mark everywhere the card is named, so it
       has to be one drawing. card.js and mycard.js each carry a byte-identical
       private copy of it, both commented "same family as RTGIcons" while this
       file did not have it. Point those at this one next time either is opened;
       a fourth copy is how three marks start disagreeing.

       Two things about it are measured rather than inherited, because the marks
       here are read at 15px in a button and the original was a blob at that
       size. The stroke is 1.9 rather than the family's 2.2: a ticket is the only
       glyph in the set that encloses a narrow interior, and 2.2 closed it up.
       And the perforation is three drawn dashes rather than a stroke-dasharray,
       which was the first thing to disappear: the wrapper asks for square caps,
       so each 2-long dash grew 2.2 of cap and the gaps filled in. */
    ticket: '<g stroke-width="1.9">' +
            '<path d="M2.6 6.4h18.8v4a1.6 1.6 0 0 0 0 3.2v4H2.6v-4a1.6 1.6 0 0 0 0-3.2z"/>' +
            '<path d="M15 8.2v1.6M15 11.2v1.6M15 14.2v1.6" stroke-linecap="butt"/></g>',
    // Invite a friend - one figure, and the plus is the one being added
    invite: '<circle cx="9" cy="7" r="3.4"/><path d="M3.2 20.6v-1.1a5.8 5.8 0 0 1 11.6 0v1.1"/><path d="M20 9.5v5.6M17.2 12.3h5.6"/>',
  };
  // route hub cards through the same keys the games use
  var ALIAS = { cross: 'crossword', odd: 'oddone', alma: 'almamater' };

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
