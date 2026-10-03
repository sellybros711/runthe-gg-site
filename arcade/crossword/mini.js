/* mini.js: the dense mini crossword (window.RTG_CWMINI).
 *
 *   RTG_CWMINI.forDate('YYYY-MM-DD') -> a puzzle in the puzzles.js schema
 *   ({id, date, size, rows, entries:[{num, dir, r, c, answer, clue}]}), or
 *   null, in which case the page falls back to gen.js as it always has.
 *
 * Behind the `densecw` flag (flags.js). With the flag off nothing calls this.
 *
 * WHAT MAKES IT A MINI
 *  - 5x5, or 6x6 with the corners blocked, from TEMPLATES below.
 *  - Every white cell sits in an across entry AND a down entry, and every
 *    entry is three to five letters. So every letter is crossed.
 *  - At most two answers are PLAYERS (gen.js's pool, clued the way gen.js clues
 *    them). Those are the clues that need real knowledge. Two players never
 *    cross each other, so every letter of a player answer is also a letter of
 *    an everyday word or a sports term: the hard clue can always be got from
 *    the crossings.
 *  - Everything else comes from data/mini-words.js: everyday words and sports
 *    terms with one-line clues.
 *
 * Deterministic: seeded from 'cwmini-' + date with the same xmur3/mulberry32
 * the other games use, so a day is the same grid on every device and in the
 * archive. scripts/check-crossword-mini.mjs is the validator.
 */
(function (root, factory) {
  var mod = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  if (root) root.RTG_CWMINI = mod;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  function xmur3(str) {
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16; return h >>> 0;
    };
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rng) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  /* Every symmetric block pattern of 5x5 and 6x6 in which every entry is
     three to five letters and every white cell connects. Enumerated once,
     offline (the 6x6 has to block its corners because the list has no six
     letter words). The fully open 5x5 is left out: ten crossing five letter
     words almost never fill from a list this size. */
  var TEMPLATES = [
    '#..../...../...../...../....#',
    '##.../...../...../...../...##',
    '....#/...../...../...../#....',
    '#...#/...../...../...../#...#',
    '...##/...../...../...../##...',
    '#..../#..../...../....#/....#',
    '##.../#..../...../....#/...##',
    '##.../##.../...../...##/...##',
    '....#/....#/...../#..../#....',
    '...##/....#/...../#..../##...',
    '...##/...##/...../##.../##...',
    '###.../#...../#...../.....#/.....#/...###',
    '###.../##..../#...../.....#/....##/...###',
    '...###/.....#/.....#/#...../#...../###...',
    '...###/....##/.....#/#...../##..../###...'
  ].map(function (t) { return t.split('/'); });

  function slotsOf(rows) {
    var S = rows.length, out = [];
    for (var r = 0; r < S; r++) {
      var c = 0;
      while (c < S) {
        if (rows[r][c] === '#') { c++; continue; }
        var s = c; while (c < S && rows[r][c] !== '#') c++;
        out.push({ dir: 'A', r: r, c: s, len: c - s });
      }
    }
    for (var c2 = 0; c2 < S; c2++) {
      var r2 = 0;
      while (r2 < S) {
        if (rows[r2][c2] === '#') { r2++; continue; }
        var s2 = r2; while (r2 < S && rows[r2][c2] !== '#') r2++;
        out.push({ dir: 'D', r: s2, c: c2, len: r2 - s2 });
      }
    }
    out.forEach(function (sl, i) {
      sl.i = i; sl.cells = [];
      for (var k = 0; k < sl.len; k++) sl.cells.push([sl.r + (sl.dir === 'D' ? k : 0), sl.c + (sl.dir === 'A' ? k : 0)]);
    });
    // which slots cross which (by shared cell)
    out.forEach(function (a) {
      a.cross = [];
      out.forEach(function (b) {
        if (a === b || a.dir === b.dir) return;
        for (var x = 0; x < a.cells.length; x++) for (var y = 0; y < b.cells.length; y++) {
          if (a.cells[x][0] === b.cells[y][0] && a.cells[x][1] === b.cells[y][1]) a.cross.push(b.i);
        }
      });
    });
    return out;
  }

  /* ---- the word list ------------------------------------------------------ */
  var _lex = null;
  function lexicon() {
    if (_lex) return _lex;
    var src = (root && root.RTG_MINIWORDS) || [];
    var byLen = {}, idx = {}, clue = {};
    src.forEach(function (row) {
      var w = row[0], L = w.length;
      if (!/^[A-Z]{3,5}$/.test(w) || clue[w]) return;
      clue[w] = { text: row[1], kind: row[2] };
      (byLen[L] = byLen[L] || []).push(w);
      for (var i = 0; i < L; i++) {
        var k = L + ':' + i + w[i];
        (idx[k] = idx[k] || []).push(w);
      }
    });
    _lex = { byLen: byLen, idx: idx, clue: clue, n: Object.keys(clue).length };
    return _lex;
  }

  /* ---- the fill ------------------------------------------------------------
     Most-constrained slot first, candidates in a seeded order, a node budget so
     a hopeless template gives up quickly and the next one is tried. */
  function fill(rows, slots, grid, used, lex, rng, budget) {
    var nodes = 0;
    function pat(s) { var p = ''; for (var k = 0; k < s.len; k++) p += grid[s.cells[k][0]][s.cells[k][1]] || '.'; return p; }
    function cands(s) {
      var p = pat(s);
      if (p.indexOf('.') < 0) return null;
      var best = null;
      for (var k = 0; k < p.length; k++) {
        if (p[k] === '.') continue;
        var lst = lex.idx[s.len + ':' + k + p[k]] || [];
        if (!best || lst.length < best.length) best = lst;
      }
      best = best || lex.byLen[s.len] || [];
      var out = [];
      for (var b = 0; b < best.length; b++) {
        var w = best[b];
        if (used[w]) continue;
        var ok = true;
        for (var q = 0; q < p.length; q++) if (p[q] !== '.' && p[q] !== w[q]) { ok = false; break; }
        if (ok) out.push(w);
      }
      return out;
    }
    function full(s) { var p = pat(s); return p.indexOf('.') < 0 ? p : null; }
    function rec() {
      if (++nodes > budget) return false;
      var pick = null, pc = null, made = {};
      for (var i = 0; i < slots.length; i++) {
        if (slots[i].fixed) continue;
        var c = cands(slots[i]);
        if (c === null) {
          // filled by crossings alone: it has to be a real word, and a new one
          var f = full(slots[i]);
          if (!lex.clue[f] || used[f] || made[f]) return false;
          made[f] = 1;
          continue;
        }
        if (!pick || c.length < pc.length) { pick = slots[i]; pc = c; if (!c.length) return false; }
      }
      if (!pick) return true;
      var order = shuffle(pc, rng);
      for (var o = 0; o < order.length; o++) {
        var w = order[o], saved = [];
        for (var k = 0; k < pick.len; k++) { var rc = pick.cells[k]; saved.push(grid[rc[0]][rc[1]]); grid[rc[0]][rc[1]] = w[k]; }
        used[w] = 1; pick.fixed = true;
        if (rec()) return true;
        pick.fixed = false; delete used[w];
        for (var k2 = 0; k2 < pick.len; k2++) { var rc2 = pick.cells[k2]; grid[rc2[0]][rc2[1]] = saved[k2]; }
        if (nodes > budget) return false;
      }
      return false;
    }
    return rec();
  }

  function famous(w) {
    var F = root && root.RTGFame;
    if (!F || !w.e) return true;
    // The hard clue should still be about a name a fan has heard of.
    return F.tier(w.e) === 'household';
  }

  /* One attempt: a template, up to two players placed first in slots that do
     not cross, then the rest from the word list. */
  function attempt(rows, players, want, lex, rng) {
    var S = rows.length;
    var slots = slotsOf(rows);
    var grid = rows.map(function (row) { return row.split('').map(function (ch) { return ch === '#' ? '#' : null; }); });
    var used = {}, deep = {};
    var open = shuffle(slots.filter(function (s) { return s.len >= 4; }), rng);
    for (var d = 0; d < want && open.length; d++) {
      var slot = null;
      for (var q = 0; q < open.length; q++) {
        var ok = true;
        for (var z in deep) if (open[q].cross.indexOf(+z) >= 0) ok = false;
        if (ok) { slot = open[q]; open.splice(q, 1); break; }
      }
      if (!slot) break;
      var fits = players.filter(function (p) {
        if (p.w.length !== slot.len || used[p.w] || lex.clue[p.w]) return false;
        for (var k = 0; k < slot.len; k++) { var g = grid[slot.cells[k][0]][slot.cells[k][1]]; if (g && g !== p.w[k]) return false; }
        return true;
      });
      if (!fits.length) break;
      var pl = fits[Math.floor(rng() * fits.length)];
      for (var k3 = 0; k3 < slot.len; k3++) grid[slot.cells[k3][0]][slot.cells[k3][1]] = pl.w[k3];
      used[pl.w] = 1; slot.fixed = true; deep[slot.i] = pl;
    }
    if (!fill(rows, slots, grid, used, lex, rng, 4000)) return null;
    return { S: S, rows: rows, slots: slots, grid: grid, deep: deep };
  }

  function finalize(b, rng, dateStr) {
    var S = b.S, lex = lexicon();
    var starts = {};
    b.slots.forEach(function (s) { starts[s.r + ',' + s.c] = 1; });
    var num = 0, numAt = {};
    for (var r = 0; r < S; r++) for (var c = 0; c < S; c++) if (starts[r + ',' + c]) numAt[r + ',' + c] = ++num;
    var gen = root && root.RTG_CWGEN;
    var entries = [];
    for (var i = 0; i < b.slots.length; i++) {
      var s = b.slots[i], w = '';
      for (var k = 0; k < s.len; k++) w += b.grid[s.cells[k][0]][s.cells[k][1]];
      var e = { num: numAt[s.r + ',' + s.c], dir: s.dir, r: s.r, c: s.c, answer: w, clue: null };
      var pl = b.deep[s.i];
      if (pl) {
        var cl = gen && gen.miniClue ? gen.miniClue(pl, rng) : null;
        if (!cl) return null;
        e.clue = cl.text; e.deep = 1; e.pid = pl.e.id; e.facts = cl.facts;
      } else {
        var lc = lex.clue[w];
        if (!lc) return null;
        e.clue = lc.text; e.kind = lc.kind;
      }
      entries.push(e);
    }
    entries.sort(function (a, z) { return a.dir === z.dir ? a.num - z.num : (a.dir === 'A' ? -1 : 1); });
    var rows = b.grid.map(function (row) { return row.join(''); });
    return {
      id: 'mini-' + dateStr, date: dateStr, size: S, rows: rows,
      theme: entries.filter(function (x) { return x.deep; }).length,
      entries: entries, difficulty: S === 5 ? 1.2 : 1.5,
      sport: 'multi', generated: true, mini: true
    };
  }

  function forDate(dateStr, corpusOpt) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ''))) return null;
    var lex = lexicon();
    if (lex.n < 500) return null;
    var gen = root && root.RTG_CWGEN;
    var players = (gen && gen.miniPlayers) ? gen.miniPlayers(dateStr, corpusOpt).filter(famous) : [];
    var rng = mulberry32(xmur3('cwmini-' + dateStr)());
    var order = shuffle(TEMPLATES, rng);
    // two players most days, one some days, none only if nothing else fills
    var wants = rng() < 0.6 ? [2, 1, 0] : [1, 2, 0];
    for (var w = 0; w < wants.length; w++) {
      for (var t = 0; t < order.length; t++) {
        for (var tries = 0; tries < 3; tries++) {
          var b = attempt(order[t], players, wants[w], lex, rng);
          if (!b) continue;
          var p = finalize(b, rng, dateStr);
          if (p) return p;
        }
      }
    }
    return null;
  }

  return { forDate: forDate, TEMPLATES: TEMPLATES, _internal: { slotsOf: slotsOf, lexicon: lexicon } };
});
