/* lbgate.js — hide the leaderboard until today's game is finished.
 *
 * On every game page the daily/all-time leaderboard rail (.lb, and Match's
 * .mlb) is covered by a "finish to unlock" note until the game's result
 * overlay appears — then it's revealed with the live board already populated
 * underneath (no sample→live flicker). The rail keeps its layout slot the
 * whole time (contents are hidden with visibility, not display), so nothing
 * shifts. Self-contained; degrades to "always shown" if anything is missing.
 */
(function () {
  'use strict';
  var m = /\/arcade\/([a-z]+)\//.exec(location.pathname || '');
  var G = m && m[1];
  var GAMES = { table:1, match:1, career:1, oddone:1, rankit:1, almamater:1, guess:1, crossword:1, wordsearch:1 };
  if (!G || !GAMES[G]) return;

  // Inject the gate CSS as soon as this script parses (before the game boots),
  // so the sample board never flashes. Revealed by adding body.rtg-lbdone.
  var s = document.createElement('style'); s.id = 'rtg-lbgate-css';
  s.textContent =
    '.lb,.mlb{position:relative;}' +
    'body:not(.rtg-lbdone) .lb>*,body:not(.rtg-lbdone) .mlb>*{visibility:hidden;}' +
    'body:not(.rtg-lbdone) .lb::after,body:not(.rtg-lbdone) .mlb::after{' +
      'content:"Finish today\\2019s game to see the leaderboard";position:absolute;inset:0;' +
      'display:flex;align-items:center;justify-content:center;text-align:center;padding:20px;' +
      'font:800 12.5px/1.5 var(--f,system-ui,sans-serif);color:var(--mut,#A9B8CB);}';
  (document.head || document.documentElement).appendChild(s);

  var done = false;
  function reveal() { if (done) return; done = true; document.body.classList.add('rtg-lbdone'); }
  function shown(el) {
    // scrims are position:fixed (offsetParent is always null), so judge by the
    // hidden flag + computed display/visibility only.
    if (!el) return false;
    if (el.classList.contains('hidden') || el.hasAttribute('hidden')) return false;
    var cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
  }
  function overlayVisible() {
    var els = document.querySelectorAll('#scrim, .scrim, #resultModal');
    for (var i = 0; i < els.length; i++) if (shown(els[i])) return true;
    return false;
  }
  function tick() { if (!done && overlayVisible()) reveal(); }
  function start() {
    tick();                       // already played today → result overlay is up → reveal now
    if (done) return;
    try {
      var mo = new MutationObserver(tick);
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'hidden', 'style'], subtree: true });
    } catch (e) {}
    var n = 0, iv = setInterval(function () { tick(); if (done || ++n > 80) clearInterval(iv); }, 250);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
