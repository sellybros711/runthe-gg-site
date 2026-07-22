/* =============================================================================
 * RunTheGrid / Daily Match — generator / engine
 *
 * Two ways to get a board, same output shape:
 *   buildFromDB(date, entities)  — the real thing: discovers categories from the
 *       tagged entity DB via an inverted index, samples 5 under the spec's
 *       spread rules, assigns a unique 25-tile board, tunes trap density.
 *   generateDaily(date, bank)    — authored fallback: picks a hand-verified board
 *       from data.js when the DB can't satisfy a given day.
 *   daily(date, {entities, bank}) — try the DB, fall back to the bank.
 *
 * The fairness backbone in both paths: solve() proves EXACTLY ONE valid
 * assignment before a board is ever returned. Runs in the browser and Node.
 * ========================================================================== */
(function (root, factory) {
  var mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  else root.GridGen = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---- deterministic RNG (identical puzzle per date, dry-runnable) --------- */
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
  function seededRandom(seedStr) { return mulberry32(xmur3('runthe-grid-' + seedStr)()); }
  function shuffle(arr, rng) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  /* ---- uniqueness solver (§4): count complete assignments, abort at 2 ------ */
  function solve(board) {
    var catIds = board.categories.map(function (c) { return c.id; });
    var cap = {}; catIds.forEach(function (id) { cap[id] = 5; });
    var tiles = board.tiles.map(function (t) {
      return { id: t.id, fits: t.fits.filter(function (f) { return cap.hasOwnProperty(f); }) };
    });
    var assign = {}, found = [];
    function dfs(remaining) {
      if (found.length >= 2) return;
      if (remaining.length === 0) { var s = {}; for (var k in assign) s[k] = assign[k]; found.push(s); return; }
      var bestIdx = 0, bestOpts = Infinity, bestList = null;
      for (var i = 0; i < remaining.length; i++) {
        var opts = remaining[i].fits.filter(function (f) { return cap[f] > 0; });
        if (opts.length < bestOpts) { bestOpts = opts.length; bestIdx = i; bestList = opts; }
        if (bestOpts === 0) break;
      }
      if (bestOpts === 0) return;
      var tile = remaining[bestIdx];
      var rest = remaining.slice(0, bestIdx).concat(remaining.slice(bestIdx + 1));
      for (var o = 0; o < bestList.length; o++) {
        var cat = bestList[o];
        cap[cat]--; assign[tile.id] = cat; dfs(rest); cap[cat]++; delete assign[tile.id];
        if (found.length >= 2) return;
      }
    }
    dfs(tiles);
    return { count: found.length, solution: found[0] || null };
  }
  function isUnique(board) { return solve(board).count === 1; }

  function trapEdges(board) {
    var extra = 0;
    board.tiles.forEach(function (t) {
      var inBoard = t.fits.filter(function (f) { return board.categories.some(function (c) { return c.id === f; }); });
      extra += Math.max(0, inBoard.length - 1);
    });
    return extra;
  }

  /* ---- difficulty scoring (§6) --------------------------------------------- */
  function categoryDifficulty(cat, board) {
    var sol = board.solution[cat.id] || [];
    var byId = {}; board.tiles.forEach(function (t) { byId[t.id] = t; });
    var fames = sol.map(function (id) { return (byId[id] || {}).fame || 3; });
    var avgFame = fames.reduce(function (a, b) { return a + b; }, 0) / (fames.length || 1);
    var trapsTouching = sol.reduce(function (n, id) {
      var t = byId[id]; if (!t) return n;
      var inB = t.fits.filter(function (f) { return board.categories.some(function (c) { return c.id === f; }); });
      return n + Math.max(0, inB.length - 1);
    }, 0);
    var singleSport = sol.every(function (id) { return (byId[id] || {}).sport === (byId[sol[0]] || {}).sport; });
    var d = (100 - avgFame * 15) + (cat.family === 'wordplay' ? 15 : 0) + (trapsTouching * 8) + (singleSport ? -10 : 0);
    return Math.max(0, Math.min(100, d));
  }
  function scoreBoard(board) {
    var scored = board.categories.map(function (c) { return { cat: c, difficulty: categoryDifficulty(c, board) }; });
    scored.sort(function (a, b) { return a.difficulty - b.difficulty; });
    var bd = scored.reduce(function (s, x) { return s + x.difficulty; }, 0) / scored.length;
    return { ranked: scored, boardDifficulty: bd };
  }
  var LANE_COLORS = ['#35C4CD', '#6EE84E', '#EBA61F', '#F06A5A', '#A98CF5'];
  function parTimes(bd) { var easy = 120 + bd * 1.2; return { easy: Math.round(easy), hard: Math.round(easy * 1.7) }; }

  /* ---- shared finalize: board internal shape -> day object ----------------- */
  function finalizeBoard(board, rng, dateStr) {
    var scored = scoreBoard(board);
    var lanes = scored.ranked.map(function (r, i) {
      return {
        id: r.cat.id, name: r.cat.name, short: r.cat.short || r.cat.name,
        family: r.cat.family, sport: r.cat.sport, difficulty: Math.round(r.difficulty),
        color: LANE_COLORS[i], rank: i
      };
    });
    var tiles = shuffle(board.tiles, rng).map(function (t) {
      return { id: t.id, name: t.name, sport: t.sport, fits: t.fits.slice() };
    });
    var solutionByCat = {};
    lanes.forEach(function (l) { solutionByCat[l.id] = (board.solution[l.id] || []).slice(); });
    return {
      date: dateStr, boardId: board.id, lanes: lanes, tiles: tiles, solution: solutionByCat,
      boardDifficulty: Math.round(scored.boardDifficulty), par: parTimes(scored.boardDifficulty),
      traps: trapEdges(board), source: board.source || 'authored'
    };
  }

  /* ---- authored fallback (data.js bank) ------------------------------------ */
  function generateDaily(dateStr, bank) {
    var rng = seededRandom(dateStr);
    var dayNum = Math.floor(Date.parse(dateStr + 'T00:00:00Z') / 86400000);
    var idx = ((dayNum % bank.length) + bank.length) % bank.length;
    var board = bank[idx]; board.source = 'authored';
    return finalizeBoard(board, rng, dateStr);
  }

  /* =========================================================================
   * DATA-DRIVEN GENERATOR (§3–§5)
   * ======================================================================= */

  var POS_LABEL = {
    'Quarterback': 'Quarterbacks', 'Running Back': 'Running Backs', 'Wide Receiver': 'Wide Receivers',
    'Tight End': 'Tight Ends', 'Defensive Back': 'Defensive Backs', 'Defensive Line': 'Defensive Linemen',
    'Guard': 'Guards', 'Forward': 'Forwards', 'Center': 'Centers',
    'Pitcher': 'Pitchers', 'Catcher': 'Catchers', 'Shortstop': 'Shortstops', 'First Base': 'First Basemen',
    'Outfield': 'Outfielders', 'Designated Hitter': 'Designated Hitters'
  };
  var AWARD_LABEL = {
    'NBA MVP': 'NBA MVP Winners', 'NFL MVP': 'NFL MVP Winners', 'MLB MVP': 'MLB MVP Winners',
    'Finals MVP': 'NBA Finals MVP Winners', 'Super Bowl MVP': 'Super Bowl MVP Winners',
    'Cy Young': 'Cy Young Winners', 'Rookie of the Year': 'Rookie of the Year Winners',
    'Offensive Rookie of the Year': 'Offensive Rookie of the Year', 'Defensive Player of the Year': 'Defensive Player of the Year',
    'Scoring Champion': 'Scoring Champions', 'World Series Champion': 'World Series Champions', 'Hall of Fame': 'Hall of Famers'
  };

  function deriveWordplay(name) {
    var parts = name.replace(/[.,]/g, '').split(/\s+/);
    var suf = { Jr: 1, Sr: 1, II: 1, III: 1, IV: 1 };
    var last = parts[parts.length - 1];
    if (suf[last] && parts.length > 1) last = parts[parts.length - 2];
    var first = parts[0];
    return { surname: last, initials: (first[0] + last[0]).toUpperCase(), allit: first[0].toUpperCase() === last[0].toUpperCase() };
  }

  // discover every candidate category from the tags
  function enumerate(entities) {
    var cats = {};
    function add(key, name, family, ent) {
      var c = cats[key] || (cats[key] = { id: key, name: name, family: family, members: [], sports: {}, fames: [] });
      c.members.push(ent.id); c.sports[ent.sport] = 1; c.fames.push(ent.f);
    }
    entities.forEach(function (ent) {
      (ent.t || []).forEach(function (team) { add('team:' + team, team, 'career', ent); });
      (ent.j || []).forEach(function (n) { add('jersey:' + n, 'Wore No. ' + n, 'career', ent); });
      if (ent.dy) add('draft:' + ent.dy, ent.dy + ' Draft Class', 'career', ent);
      if (ent.dp === 1) add('pick1', 'No. 1 Overall Picks', 'career', ent);
      if (ent.col) add('col:' + ent.col, 'Played College at ' + ent.col, 'career', ent);
      if (ent.b) add('born:' + ent.b, 'Born in ' + ent.b, 'career', ent);
      if (ent.pos) add('pos:' + ent.pos, POS_LABEL[ent.pos] || (ent.pos + 's'), 'career', ent);
      (ent.aw || []).forEach(function (a) { add('award:' + a, AWARD_LABEL[a] || a, 'achievement', ent); });
      (ent.ml || []).forEach(function (m) { add('mile:' + m, m, 'statistical', ent); });
      var w = deriveWordplay(ent.name);
      add('surname:' + w.surname, 'Surname: ' + w.surname, 'wordplay', ent);
      add('initials:' + w.initials, 'Initials: ' + w.initials, 'wordplay', ent);
      if (w.allit) add('allit', 'Alliterative Names', 'wordplay', ent);
    });
    Object.keys(cats).forEach(function (k) {
      var c = cats[k]; var sk = Object.keys(c.sports); c.sport = sk.length === 1 ? sk[0] : 'multi';
    });
    return cats;
  }

  function viable(catsMap, opts) {
    opts = opts || {};
    var min = opts.min || 5, max = opts.max || 60, floor = opts.avgFame || 2.5, anchors = opts.anchors || 2;
    return Object.keys(catsMap).map(function (k) { return catsMap[k]; }).filter(function (c) {
      if (c.members.length < min || c.members.length > max) return false;
      var avg = c.fames.reduce(function (a, b) { return a + b; }, 0) / c.fames.length;
      if (avg < floor) return false;
      if (c.fames.filter(function (f) { return f >= 4; }).length < anchors) return false;
      return true;
    });
  }

  function subset(a, b) { var s = {}; b.forEach(function (x) { s[x] = 1; }); return a.every(function (x) { return s[x]; }); }

  // pick 5 categories: >=3 families (<=2 each), >=2 distinct lead sports, no nesting,
  // limited pairwise overlap so lanes stay distinguishable.
  function pickCategories(cats, rng) {
    for (var attempt = 0; attempt < 400; attempt++) {
      var order = shuffle(cats, rng), chosen = [], fams = {};
      for (var i = 0; i < order.length && chosen.length < 5; i++) {
        var c = order[i];
        if ((fams[c.family] || 0) >= 2) continue;
        var bad = chosen.some(function (o) {
          if (subset(o.members, c.members) || subset(c.members, o.members)) return true; // nesting
          var os = {}; o.members.forEach(function (x) { os[x] = 1; });
          var overlap = c.members.filter(function (x) { return os[x]; }).length;
          return overlap > 3; // near-duplicate lanes
        });
        if (bad) continue;
        chosen.push(c); fams[c.family] = (fams[c.family] || 0) + 1;
      }
      if (chosen.length < 5) continue;
      if (Object.keys(fams).length < 3) continue;
      var lead = {}; chosen.forEach(function (c) { if (c.sport !== 'multi') lead[c.sport] = 1; });
      if (Object.keys(lead).length < 2) continue;
      return chosen;
    }
    return null;
  }

  // choose 5 disjoint entities per category (an SDR), preferring recognizable names
  function assignBoard(chosen, rng, entMap) {
    var cats = chosen.slice().sort(function (a, b) { return a.members.length - b.members.length; });
    var used = {}, sol = {};
    function fame(id) { return (entMap[id] || {}).f || 3; }
    function pick(i) {
      if (i === cats.length) return true;
      var c = cats[i];
      var avail = shuffle(c.members.filter(function (id) { return !used[id]; }), rng);
      avail.sort(function (x, y) { return fame(y) - fame(x); });
      return choose(c, avail, 0, [], i);
    }
    function choose(c, avail, start, acc, i) {
      if (acc.length === 5) {
        sol[c.id] = acc.slice();
        if (pick(i + 1)) return true;
        delete sol[c.id]; return false;
      }
      for (var k = start; k < avail.length; k++) {
        var id = avail[k]; if (used[id]) continue;
        acc.push(id); used[id] = 1;
        if (choose(c, avail, k + 1, acc, i)) return true;
        acc.pop(); delete used[id];
      }
      return false;
    }
    return pick(0) ? sol : null;
  }

  function makeBoard(chosen, sol, entMap) {
    var chosenIds = [];
    chosen.forEach(function (c) { (sol[c.id] || []).forEach(function (id) { chosenIds.push(id); }); });
    var catIndex = {}; chosen.forEach(function (c) { var s = {}; c.members.forEach(function (m) { s[m] = 1; }); catIndex[c.id] = s; });
    var tiles = chosenIds.map(function (id) {
      var ent = entMap[id];
      var fits = chosen.filter(function (c) { return catIndex[c.id][id]; }).map(function (c) { return c.id; });
      return { id: id, name: ent.name, sport: ent.sport, fame: ent.f, fits: fits };
    });
    return {
      id: 'db-' + chosen.map(function (c) { return c.id; }).join('|'),
      source: 'generated',
      categories: chosen.map(function (c) { return { id: c.id, name: c.name, short: c.short, family: c.family, sport: c.sport }; }),
      tiles: tiles, solution: sol
    };
  }

  // full data-driven build for a date; null if it can't satisfy constraints
  function buildFromDB(dateStr, entities, opts) {
    opts = opts || {};
    var rng = seededRandom('db-' + dateStr);
    var entMap = {}; entities.forEach(function (e) { entMap[e.id] = e; });
    var cats = viable(enumerate(entities), opts);
    if (cats.length < 5) return null;
    var best = null;
    for (var attempt = 0; attempt < 120; attempt++) {
      var chosen = pickCategories(cats, rng); if (!chosen) continue;
      var sol = assignBoard(chosen, rng, entMap); if (!sol) continue;
      var board = makeBoard(chosen, sol, entMap);
      var r = solve(board); if (r.count !== 1) continue;
      var traps = trapEdges(board);
      if (traps >= 3 && traps <= 6) return finalizeBoard(board, rng, dateStr);
      if (!best || Math.abs(traps - 4) < Math.abs(best.traps - 4)) best = { board: board, traps: traps };
    }
    return best ? finalizeBoard(best.board, rng, dateStr) : null;
  }

  // top-level: prefer the generator, fall back to the authored bank
  function daily(dateStr, sources) {
    sources = sources || {};
    if (sources.entities) {
      var d = buildFromDB(dateStr, sources.entities, sources.opts);
      if (d) return d;
    }
    return generateDaily(dateStr, sources.bank || []);
  }

  return {
    seededRandom: seededRandom, shuffle: shuffle,
    solve: solve, isUnique: isUnique, trapEdges: trapEdges,
    scoreBoard: scoreBoard, categoryDifficulty: categoryDifficulty, parTimes: parTimes,
    finalizeBoard: finalizeBoard, generateDaily: generateDaily,
    enumerate: enumerate, viable: viable, deriveWordplay: deriveWordplay,
    pickCategories: pickCategories, buildFromDB: buildFromDB, daily: daily,
    LANE_COLORS: LANE_COLORS
  };
});
