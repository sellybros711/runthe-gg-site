/* GENERATOR for the daily 3x3 sports grid.
 *
 * Three row constraints, three column constraints, nine intersections. Name a
 * player who satisfies both. It is the purest form of the thing this arcade is
 * for: no wordplay, no pattern-spotting, just "who played for both of these",
 * answered out of what you actually know about sports history.
 *
 * THE ONE RULE THAT MATTERS
 * Every cell must be solvable by a normal fan. Not "an answer exists somewhere
 * in a 61,000-row register" — solvable, by someone who follows the sport. So a
 * grid is only built from RECOGNISABLE players (RTG_KNOWN), and every one of
 * the nine cells needs MIN_ANSWERS of them or the grid is thrown away and
 * redrawn. The register's deep cuts are for GRADING, where a rare correct
 * answer should score big; they are not what the puzzle is built from. Getting
 * that backwards is exactly what made three other games feel broken.
 *
 * Deterministic: same seed, same grid, so everyone plays the same board and the
 * archive can replay any past day.
 *
 *   GridDaily.build('2026-08-16', { entities: GRID_ENTITIES })
 *   → { rows:[c,c,c], cols:[c,c,c], cells:{ '0,0':[ids], ... }, sport }
 */
(function (root, factory) {
  var mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  else root.GridDaily = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SIZE = 3;
  var MIN_ANSWERS = 3;        // a cell a fan can actually fill
  var MIN_POOL = 8;           // a constraint nobody can name is not a constraint

  // ---- deterministic rng (same mulberry32/xmur3 the other games seed with) ----
  function xmur3(str) {
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= h >>> 16) >>> 0;
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
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // ---- what a constraint can be ----
  /* Every kind here is a fact about a career that a fan carries in their head.
     Deliberately no stat thresholds: "300+ home runs" is a lookup, not a memory,
     and the corpus cannot verify it anyway. */
  var KINDS = {
    team:    { label: function (v) { return v; },                       test: function (e, v) { return (e.t || []).indexOf(v) >= 0; } },
    col:     { label: function (v) { return v; },                       test: function (e, v) { return e.col === v; } },
    pos:     { label: function (v) { return v; },                       test: function (e, v) { return e.pos === v; } },
    award:   { label: function (v) { return v; },                       test: function (e, v) { return (e.aw || []).indexOf(v) >= 0; } },
    decade:  { label: function (v) { return v + 's'; },                 test: function (e, v) { return (e.decade || []).indexOf(v) >= 0; } }
  };
  function matches(e, c) { return KINDS[c.k].test(e, c.v); }
  function labelOf(c) { return KINDS[c.k].label(c.v); }
  function sameConstraint(a, b) { return a.k === b.k && a.v === b.v; }

  /* Collect every value of every kind that enough recognisable players share. */
  function inventory(pool) {
    var buckets = { team: {}, col: {}, pos: {}, award: {}, decade: {} };
    pool.forEach(function (e) {
      var seen = {};
      (e.t || []).forEach(function (t) { if (t && !seen['t' + t]) { seen['t' + t] = 1; (buckets.team[t] = buckets.team[t] || []).push(e); } });
      if (e.col) (buckets.col[e.col] = buckets.col[e.col] || []).push(e);
      if (e.pos) (buckets.pos[e.pos] = buckets.pos[e.pos] || []).push(e);
      (e.aw || []).forEach(function (a) { if (a && !seen['a' + a]) { seen['a' + a] = 1; (buckets.award[a] = buckets.award[a] || []).push(e); } });
      (e.decade || []).forEach(function (d) { if (!seen['d' + d]) { seen['d' + d] = 1; (buckets.decade[d] = buckets.decade[d] || []).push(e); } });
    });
    var out = { team: [], col: [], pos: [], award: [], decade: [] };
    Object.keys(buckets).forEach(function (k) {
      Object.keys(buckets[k]).forEach(function (v) {
        if (buckets[k][v].length >= MIN_POOL) {
          out[k].push({ k: k, v: k === 'decade' ? +v : v, members: buckets[k][v] });
        }
      });
    });
    return out;
  }

  function intersect(a, b) {
    var ids = {}; a.members.forEach(function (e) { ids[e.id] = e; });
    var out = [];
    b.members.forEach(function (e) { if (ids[e.id]) out.push(e); });
    return out;
  }

  /* Rows are teams. Franchises are the axis every fan has an instinct for, and
     a grid of two teams reads instantly without a legend. Columns mix in a
     college, a position, a decade or an award so the board is not nine
     "played for both" cells — that variety is what stops every grid feeling
     like the same grid. */
  function build(seed, sources) {
    sources = sources || {};
    var all = sources.entities || [];
    var known = (typeof window !== 'undefined' && window.RTG_KNOWN) || sources.known || function () { return true; };
    var rng = mulberry32(xmur3('grid-' + seed)());
    /* One league per board. Mixing them sounds like more variety and is the
       opposite: no NBA player ever played for the Cowboys, so every cross-sport
       cell is empty and the only column that survives is a decade — 82 of 90
       columns came back "played in the 1990s". A grid should read as one
       league's history, so the mixed mode picks a league for the day instead. */
    var sport = sources.sport || null;
    if (!sport) {
      var LEAGUES = ['NBA', 'NFL', 'MLB'];
      sport = LEAGUES[Math.floor(rng() * LEAGUES.length)];
    }
    var pool = all.filter(function (e) {
      if (e.sport !== sport) return false;
      if (!e.name || !(e.t || []).length) return false;
      return known(e);
    });
    if (pool.length < 60) return null;

    var inv = inventory(pool);
    if (inv.team.length < SIZE + 1) return null;

    // columns are drawn from teams plus whatever else the corpus supports well
    var colCandidates = inv.team.concat(inv.col, inv.pos, inv.award, inv.decade);

    for (var attempt = 0; attempt < 400; attempt++) {
      var rows = shuffle(inv.team, rng).slice(0, SIZE);
      if (rows.length < SIZE) return null;
      var cols = [], tried = shuffle(colCandidates, rng);
      for (var i = 0; i < tried.length && cols.length < SIZE; i++) {
        var c = tried[i];
        // never the same constraint twice, on either axis
        if (rows.some(function (r) { return sameConstraint(r, c); })) continue;
        if (cols.some(function (o) { return sameConstraint(o, c); })) continue;
        // every cell in this column has to be fillable
        var ok = rows.every(function (r) { return intersect(r, c).length >= MIN_ANSWERS; });
        if (ok) cols.push(c);
      }
      if (cols.length < SIZE) continue;

      var cells = {}, thin = false;
      for (var r = 0; r < SIZE && !thin; r++) {
        for (var q = 0; q < SIZE; q++) {
          var hit = intersect(rows[r], cols[q]);
          if (hit.length < MIN_ANSWERS) { thin = true; break; }
          cells[r + ',' + q] = hit.map(function (e) { return e.id; });
        }
      }
      if (thin) continue;

      return {
        seed: seed, sport: sport,
        rows: rows.map(function (c) { return { k: c.k, v: c.v, label: labelOf(c) }; }),
        cols: cols.map(function (c) { return { k: c.k, v: c.v, label: labelOf(c) }; }),
        cells: cells
      };
    }
    return null;
  }

  /* Does one player satisfy a given cell? The GAME asks this of the register,
     not of the corpus, so a deep cut counts — build() only ever decided what
     the puzzle asks, never what an answer is allowed to be. */
  function satisfies(player, rowC, colC) {
    return matches(player, rowC) && matches(player, colC);
  }

  return { SIZE: SIZE, MIN_ANSWERS: MIN_ANSWERS, build: build, satisfies: satisfies,
           matches: matches, labelOf: labelOf, inventory: inventory, KINDS: KINDS };
});
