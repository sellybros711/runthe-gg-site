/* =============================================================================
 * RunTheGrid — generator / engine
 * Daily Sports Matching Puzzle ("The Draft Board") for RunThe.GG
 *
 * This file is the fairness backbone. It:
 *   1. Turns a calendar date into a deterministic RNG (same puzzle for everyone,
 *      forever — no puzzle rows ever need to be stored, only results).
 *   2. Picks the day's board from the authored board bank (see data.js).
 *   3. VERIFIES that board has exactly ONE valid complete assignment before it
 *      is ever shown. Without this a player can be "right" and told they're
 *      wrong — so it runs at load time in the browser, every day, no exceptions.
 *   4. Scores category difficulty, orders the lanes, and sets par time.
 *
 * Runs in the browser (attaches window.GridGen) and in Node (module.exports),
 * so the same code powers the game and the QA harness (verify.js).
 *
 * The FULL spec (design doc §5) generates boards from an inverted index over a
 * ~600-entity tagged database. The prototype ships an authored, solver-verified
 * board bank instead; growing the database and letting selectBoard() build from
 * the index is the documented path to the full generator. The solver, the
 * difficulty model and the RNG below are the real thing and are reused as-is.
 * ========================================================================== */
(function (root, factory) {
  var mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  else root.GridGen = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---- deterministic RNG: xmur3 seed -> mulberry32 stream -------------------
   * sha256 in the spec is overkill for tile shuffling; a fast integer hash gives
   * the same guarantee (identical puzzle per date, dry-runnable for any future
   * day) without pulling crypto into a static page. */
  function xmur3(str) {
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return h >>> 0;
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
  function seededRandom(seedStr) {
    var seed = xmur3('runthe-grid-' + seedStr)();
    return mulberry32(seed);
  }
  function shuffle(arr, rng) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* ---- the solver (design doc §4): count complete assignments, abort at 2 ----
   * Every one of the 25 tiles must land in exactly one lane it fits; every lane
   * must receive exactly 5. That is an exact cover. We only ever need to know
   * "is the solution count 1 or >1", so we DFS the most-constrained tile first
   * and bail the instant a second full assignment appears. n=25 -> microseconds.
   *
   * board.tiles: [{ id, fits:[catId,...] }]   (fits = the graph edges)
   * board.categories: [{ id }]                (5 lanes, capacity 5 each)
   * returns { count, solution }  where count is capped at 2. */
  function solve(board) {
    var catIds = board.categories.map(function (c) { return c.id; });
    var cap = {}; catIds.forEach(function (id) { cap[id] = 5; });

    var tiles = board.tiles.map(function (t) {
      return { id: t.id, fits: t.fits.filter(function (f) { return cap.hasOwnProperty(f); }) };
    });

    var assign = {};            // tileId -> catId (in the first solution found)
    var found = [];             // up to 2 solutions
    var order = tiles.slice();  // we re-sort dynamically for constraint pruning

    function placedCount() { var n = 0; catIds.forEach(function (id) { n += (5 - cap[id]); }); return n; }

    function dfs(remaining) {
      if (found.length >= 2) return;            // already ambiguous, stop
      if (remaining.length === 0) {
        var snap = {}; for (var k in assign) snap[k] = assign[k];
        found.push(snap);
        return;
      }
      // most-constrained tile: fewest lanes with capacity left
      var bestIdx = 0, bestOpts = Infinity, bestList = null;
      for (var i = 0; i < remaining.length; i++) {
        var opts = remaining[i].fits.filter(function (f) { return cap[f] > 0; });
        if (opts.length < bestOpts) { bestOpts = opts.length; bestIdx = i; bestList = opts; }
        if (bestOpts === 0) break;              // dead end -> prune immediately
      }
      if (bestOpts === 0) return;               // this tile can't be placed
      var tile = remaining[bestIdx];
      var rest = remaining.slice(0, bestIdx).concat(remaining.slice(bestIdx + 1));
      for (var o = 0; o < bestList.length; o++) {
        var cat = bestList[o];
        cap[cat]--; assign[tile.id] = cat;
        dfs(rest);
        cap[cat]++; delete assign[tile.id];
        if (found.length >= 2) return;
      }
    }
    dfs(order);
    return { count: found.length, solution: found[0] || null };
  }

  function isUnique(board) { return solve(board).count === 1; }

  /* ---- trap density (design doc §5): extra edges beyond the 25 the solution
   * uses. An entity with two fits genuinely belongs to two categories but only
   * one global arrangement works — that's deduction, not a gotcha. Target 3–6. */
  function trapEdges(board) {
    var extra = 0;
    board.tiles.forEach(function (t) {
      var inBoard = t.fits.filter(function (f) {
        return board.categories.some(function (c) { return c.id === f; });
      });
      extra += Math.max(0, inBoard.length - 1);
    });
    return extra;
  }

  /* ---- difficulty scoring (design doc §6) -----------------------------------
   * Score each category 0–100, rank ascending, assign lane colours easiest ->
   * hardest. Board difficulty (mean) sets par time. */
  function categoryDifficulty(cat, board) {
    var sol = board.solution[cat.id] || [];
    var tilesById = {}; board.tiles.forEach(function (t) { tilesById[t.id] = t; });
    var fames = sol.map(function (id) { return (tilesById[id] || {}).fame || 3; });
    var avgFame = fames.reduce(function (a, b) { return a + b; }, 0) / (fames.length || 1);

    var trapsTouching = sol.reduce(function (n, id) {
      var t = tilesById[id]; if (!t) return n;
      var inBoard = t.fits.filter(function (f) {
        return board.categories.some(function (c) { return c.id === f; });
      });
      return n + Math.max(0, inBoard.length - 1);
    }, 0);

    var singleSport = sol.every(function (id) {
      return (tilesById[id] || {}).sport === (tilesById[sol[0]] || {}).sport;
    });

    var d = (100 - avgFame * 15)
          + (sol.length < 12 ? 0 : 0)                 // bucket size N/A in prototype
          + (cat.family === 'wordplay' ? 15 : 0)
          + (trapsTouching * 8)
          + (singleSport ? -10 : 0);
    return Math.max(0, Math.min(100, d));
  }

  function scoreBoard(board) {
    var scored = board.categories.map(function (c) {
      return { cat: c, difficulty: categoryDifficulty(c, board) };
    });
    scored.sort(function (a, b) { return a.difficulty - b.difficulty; }); // easy -> hard
    var boardDifficulty = scored.reduce(function (s, x) { return s + x.difficulty; }, 0) / scored.length;
    return { ranked: scored, boardDifficulty: boardDifficulty };
  }

  // lane colours, easiest -> hardest (design doc §6)
  var LANE_COLORS = ['#35C4CD', '#6EE84E', '#EBA61F', '#F06A5A', '#A98CF5'];

  function parTimes(boardDifficulty) {
    var easy = 120 + boardDifficulty * 1.2;   // ~120–240s
    return { easy: Math.round(easy), hard: Math.round(easy * 1.7) };
  }

  /* ---- daily board selection ------------------------------------------------
   * Deterministic pick from the authored bank with a no-immediate-repeat guard,
   * then a seeded tile shuffle. Both Easy and Hard use the identical 25 tiles +
   * 5 categories (design doc §1). Difficulty ranking is computed even in Hard
   * (where the order is hidden) because it still drives par time and colours. */
  function generateDaily(dateStr, bank) {
    var rng = seededRandom(dateStr);
    // rotate the bank by day-number so consecutive days differ
    var dayNum = Math.floor(Date.parse(dateStr + 'T00:00:00Z') / 86400000);
    var idx = ((dayNum % bank.length) + bank.length) % bank.length;
    var board = bank[idx];

    var scored = scoreBoard(board);
    var ranked = scored.ranked;
    var laneOrder = ranked.map(function (r, i) {
      return {
        id: r.cat.id,
        name: r.cat.name,
        short: r.cat.short || r.cat.name,
        family: r.cat.family,
        sport: r.cat.sport,
        difficulty: Math.round(r.difficulty),
        color: LANE_COLORS[i],
        rank: i
      };
    });

    var tiles = shuffle(board.tiles, rng).map(function (t) {
      return { id: t.id, name: t.name, sport: t.sport, fits: t.fits.slice() };
    });

    var solutionByCat = {};
    laneOrder.forEach(function (lane) {
      solutionByCat[lane.id] = (board.solution[lane.id] || []).slice();
    });

    return {
      date: dateStr,
      boardId: board.id,
      lanes: laneOrder,                 // easy -> hard, coloured
      tiles: tiles,                     // shuffled pool
      solution: solutionByCat,          // catId -> [tileId x5]
      boardDifficulty: Math.round(scored.boardDifficulty),
      par: parTimes(scored.boardDifficulty),
      traps: trapEdges(board)
    };
  }

  return {
    seededRandom: seededRandom,
    shuffle: shuffle,
    solve: solve,
    isUnique: isUnique,
    trapEdges: trapEdges,
    scoreBoard: scoreBoard,
    categoryDifficulty: categoryDifficulty,
    parTimes: parTimes,
    generateDaily: generateDaily,
    LANE_COLORS: LANE_COLORS
  };
});
