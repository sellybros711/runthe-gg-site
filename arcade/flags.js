/* flags.js: feature flags for the arcade's content changes (window.RTGFlags).
 *
 *   RTGFlags.on('ramp')   -> true or false
 *
 * Every Phase 2 change to what a game deals (who appears, in what order, which
 * options, which categories, which crossword) sits behind a flag here, so it
 * can be switched on when it has been looked at, and off again without a
 * deploy of the games themselves.
 *
 * HOW A FLAG TURNS ON, first match wins:
 *   1. a preview on this device: ?flags=ramp,decoys turns those on and
 *      ?flags=-ramp turns one off. It is remembered (rtg:flags) so it holds
 *      across pages; ?flags=reset forgets it.
 *   2. `since`: on for everybody from that date (YYYY-MM-DD, the player's own
 *      calendar day, the same day the daily boards use).
 *   3. `pct`: on for that share of devices, picked by a stable per-device
 *      number. ONLY for flags that do not change a shared daily board.
 *
 * WHY A DATE AND NOT A PERCENTAGE FOR MOST OF THESE
 * The daily boards are the same for everybody, which is what makes the
 * leaderboard fair. A flag that changed the daily for half the players would
 * put two different puzzles on one board. So a flag that shapes a daily
 * switches on for everybody at once, on a day, and `pct` stays at 0.
 */
(function (root, factory) {
  var mod = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.RTGFlags = mod;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  var FLAGS = {
    // Run games open on household names and get harder as the run goes on:
    // Career Path, Alma Mater, Number Game, Odd One Out, High Low.
    ramp:      { since: null, pct: 0, daily: true },
    // Multiple-choice options from the same league, a similar era, and the
    // same position or region: Career Path, Alma Mater, Odd One Out.
    decoys:    { since: null, pct: 0, daily: true },
    // Sportegories daily board: broad categories any fan can answer, the
    // "played for X and three other franchises" kind retired, at least four
    // Anchor categories a day.
    broadcats: { since: null, pct: 0, daily: true },
    // The dense mini crossword (every letter crossed) in place of the sparse
    // layout.
    densecw:   { since: null, pct: 0, daily: true }
  };

  var KEY = 'rtg:flags';
  function store() { try { return root.localStorage || null; } catch (e) { return null; } }
  function readLocal() {
    var ls = store(); if (!ls) return {};
    try { var v = JSON.parse(ls.getItem(KEY) || '{}'); return (v && typeof v === 'object') ? v : {}; } catch (e) { return {}; }
  }
  function writeLocal(v) { var ls = store(); if (!ls) return; try { ls.setItem(KEY, JSON.stringify(v)); } catch (e) {} }

  // A preview in the address bar is taken once, on load, and remembered.
  (function readUrl() {
    try {
      var q = root.location && root.location.search;
      if (!q) return;
      var m = /[?&]flags=([^&]*)/.exec(q);
      if (!m) return;
      var raw = decodeURIComponent(m[1] || '');
      if (raw === 'reset') { var ls = store(); if (ls) ls.removeItem(KEY); return; }
      var cur = readLocal();
      raw.split(',').forEach(function (t) {
        t = t.trim(); if (!t) return;
        if (t.charAt(0) === '-') cur[t.slice(1)] = false; else cur[t] = true;
      });
      writeLocal(cur);
    } catch (e) {}
  })();

  function today(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function bucket() {
    var ls = store(), id = null;
    try { id = ls && ls.getItem('rtg:flagbucket'); } catch (e) {}
    if (!id) { id = String(Math.floor(Math.random() * 100)); try { if (ls) ls.setItem('rtg:flagbucket', id); } catch (e) {} }
    return +id;
  }

  /* on(name, date): date is the puzzle day being dealt, so an archive board
     from before the switch is dealt the way it was on its own day. */
  function on(name, date) {
    var f = FLAGS[name];
    if (!f) return false;
    var local = readLocal();
    if (typeof local[name] === 'boolean') return local[name];
    if (f.since && (date || today()) >= f.since) return true;
    if (!f.daily && f.pct > 0) return bucket() < f.pct;
    return false;
  }

  function all(date) {
    var out = {};
    Object.keys(FLAGS).forEach(function (k) { out[k] = on(k, date); });
    return out;
  }

  return { on: on, all: all, FLAGS: FLAGS, _today: today };
});
