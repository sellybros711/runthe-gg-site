/* =============================================================================
 * RunTheGrid / Daily Crossword — infinite daily generator
 *
 * window.RTG_CWGEN.forDate('YYYY-MM-DD') -> puzzle in the exact puzzles.js
 * schema the engine consumes ({id,date,size,rows,entries:[{num,dir,r,c,
 * answer,clue}],...}), or null (page then falls back to the bank rotation).
 *
 * Deterministic: seeded from 'cwgen-'+date with the same xmur3/mulberry32
 * PRNGs the other games use — same date, same puzzle, on every device.
 *
 * Fills are SURNAMES (A-Z, len 3-9) drawn from window.GRID_ENTITIES
 * (grid/match/entities.js — must be loaded before this script in the
 * browser; Node callers pass the corpus as forDate's 2nd arg). Clues are
 * built from corpus facts (sport / first team / pos / jersey / era / HOF)
 * and NEVER contain the name. When two corpus players share a surname the
 * clue keeps gaining facts (jersey, era, team, position) until it fits the
 * chosen player ONLY — a clue both could wear is rejected outright.
 *
 * Grid: small dense mini (7-9), criss-cross placement — seed across word,
 * then grow by intersecting perpendicular placements (budgeted backtracking).
 * Every entry crosses >=1 other; leftover cells become blocks; by
 * construction every maximal run of >=2 white cells is exactly one entry.
 * ========================================================================== */
(function (root, factory) {
  var mod = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  if (root) root.RTG_CWGEN = mod;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  /* ---- deterministic RNG (copied from grid/match/generator.js) ------------ */
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

  /* ---- surnames ------------------------------------------------------------ */
  var SUFFIX = { JR: 1, SR: 1, II: 1, III: 1, IV: 1, V: 1 };
  function norm(s) {
    s = String(s);
    try { s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) {}
    return s.toUpperCase().replace(/[^A-Z]/g, '');
  }
  // last name token (suffixes like Jr./III dropped); single-token names are
  // skipped — their "surname" IS the whole famous name, which a clue must
  // never effectively hand over.
  function surnameOf(name) {
    var parts = String(name || '').trim().split(/\s+/);
    while (parts.length > 1 && SUFFIX[norm(parts[parts.length - 1])]) parts.pop();
    if (parts.length < 2) return null;
    return norm(parts[parts.length - 1]) || null;
  }

  /* ---- clue building ------------------------------------------------------- */
  var MULTI_NICKS = ['Red Sox', 'White Sox', 'Blue Jays', 'Red Wings', 'Maple Leafs',
    'Golden Knights', 'Trail Blazers', 'Blue Jackets'];
  function nick(team) {
    team = String(team || '').trim();
    for (var i = 0; i < MULTI_NICKS.length; i++) {
      var m = MULTI_NICKS[i];
      if (team.length > m.length && team.slice(-m.length) === m) return m;
    }
    var parts = team.split(/\s+/);
    return parts[parts.length - 1] || team;
  }
  function primaryDecade(e) {
    var d = e.decade;
    if (!d || !d.length) return null;
    return d[Math.floor((d.length - 1) / 2)];
  }
  function eraStr(d) { return d >= 2000 ? d + 's' : "'" + String(d).slice(2) + 's'; }

  // does entity x fit every fact the clue states? (used to prove the clue
  // cannot also describe a same-surname rival)
  function factsFit(x, used) {
    if (used.sport && x.sport !== used.sport) return false;
    if (used.hof && !x.hof) return false;
    if (used.team && !(x.t || []).some(function (t) { return nick(t) === used.team; })) return false;
    if (used.jersey != null && (x.j || []).indexOf(used.jersey) < 0) return false;
    if (used.era != null && (x.decade || []).indexOf(used.era) < 0) return false;
    if (used.pos && x.pos !== used.pos) return false;
    return true;
  }
  function ambiguous(used, rivals) {
    for (var i = 0; i < rivals.length; i++) if (factsFit(rivals[i], used)) return true;
    return false;
  }
  function merge(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; for (k in b) o[k] = b[k]; return o; }

  // one base template + escalating disambiguators; null if a rival still fits
  function tryDisambig(cand, e, rivals, surname) {
    var text = cand.t, used = merge(cand.used, {});
    var jersey = (e.j && e.j.length) ? e.j[e.j.length - 1] : null;
    var dec = primaryDecade(e);
    var tn = (e.t && e.t[0]) ? nick(e.t[0]) : null;
    var guard = 0;
    while (ambiguous(used, rivals) && guard++ < 5) {
      if (jersey != null && used.jersey == null) { text += ' — #' + jersey; used.jersey = jersey; continue; }
      if (dec != null && used.era == null) { text += ' (' + eraStr(dec) + ')'; used.era = dec; continue; }
      if (tn && !used.team) { text += ', ' + tn; used.team = tn; continue; }
      if (e.pos && !used.pos) { text += ' — ' + e.pos; used.pos = e.pos; continue; }
      return null;
    }
    if (ambiguous(used, rivals)) return null;
    if (text.toUpperCase().indexOf(surname) >= 0) return null;   // never leak the answer
    return { text: text, facts: used };
  }

  // clue for a pool word. rng picks among templates (pass null for a
  // deterministic eligibility probe — succeeds iff ANY template works, so a
  // word that passes the probe always clues at build time too).
  function clueFor(word, rng) {
    var e = word.e, rivals = word.rivals;
    var tn = (e.t && e.t[0]) ? nick(e.t[0]) : null;
    var jersey = (e.j && e.j.length) ? e.j[e.j.length - 1] : null;
    var dec = primaryDecade(e);
    var era = dec != null ? eraStr(dec) : null;
    var cands = [];
    if (e.hof && tn) cands.push({ t: e.sport + ' Hall of Famer, ' + tn, used: { sport: e.sport, hof: true, team: tn } });
    if (tn && jersey != null) cands.push({ t: tn + ' legend — #' + jersey, used: { team: tn, jersey: jersey } });
    if (e.pos && era) cands.push({ t: e.sport + ' ' + e.pos + ' of the ' + era, used: { sport: e.sport, pos: e.pos, era: dec } });
    if (tn && e.pos) cands.push({ t: tn + ' ' + e.pos, used: { team: tn, pos: e.pos } });
    if (era) cands.push({ t: e.sport + ' star of the ' + era, used: { sport: e.sport, era: dec } });
    if (!cands.length) return null;
    var order = rng ? shuffle(cands, rng) : cands;
    for (var i = 0; i < order.length; i++) {
      var got = tryDisambig(order[i], e, rivals, word.w);
      if (got) return got;
    }
    return null;
  }

  /* ---- word pool ----------------------------------------------------------- */
  // one word per surname: {w, e (chosen — most famous), rivals (ALL other
  // corpus entities sharing the surname, any fame — ambiguity is checked
  // against everyone)}. Only surnames whose chosen player is fame>=4 and
  // provably disambiguable make the pool.
  function buildPool(corpus) {
    var by = {};
    (corpus || []).forEach(function (e) {
      if (!e || !e.name || !e.sport) return;
      var s = surnameOf(e.name);
      if (!s || s.length < 3 || s.length > 9) return;
      (by[s] = by[s] || []).push(e);
    });
    var pool = [];
    Object.keys(by).sort().forEach(function (s) {
      var list = by[s].slice().sort(function (a, b) {
        return (b.f || 0) - (a.f || 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      });
      if ((list[0].f || 0) < 4) return;               // prefer names people know
      var w = { w: s, e: list[0], rivals: list.slice(1) };
      if (!clueFor(w, null)) return;                  // must clue + disambiguate
      pool.push(w);
    });
    return pool;
  }
  var _poolSrc = null, _poolCache = null;
  function getPool(corpus) {
    if (_poolSrc !== corpus) { _poolSrc = corpus; _poolCache = buildPool(corpus); }
    return _poolCache;
  }

  /* ---- grid placement (criss-cross legality) -------------------------------
   * A word may sit on the grid iff: in bounds; the cells just before its
   * start and after its end are empty; every cell either matches an existing
   * letter (a crossing) or is empty with BOTH perpendicular neighbors empty.
   * This guarantees each maximal run of >=2 whites is exactly one entry.
   * Returns crossing count, or null when illegal. */
  function canPlace(grid, S, w, r, c, dir) {
    var dr = dir === 'D' ? 1 : 0, dc = dir === 'A' ? 1 : 0;
    var L = w.length, endR = r + dr * (L - 1), endC = c + dc * (L - 1);
    if (r < 0 || c < 0 || endR >= S || endC >= S) return null;
    var br = r - dr, bc = c - dc;
    if (br >= 0 && bc >= 0 && br < S && bc < S && grid[br][bc]) return null;
    var ar = endR + dr, ac = endC + dc;
    if (ar >= 0 && ac >= 0 && ar < S && ac < S && grid[ar][ac]) return null;
    var crosses = 0;
    for (var i = 0; i < L; i++) {
      var rr = r + dr * i, cc = c + dc * i, g = grid[rr][cc];
      if (g) { if (g !== w[i]) return null; crosses++; }
      else {
        var n1r = rr + dc, n1c = cc + dr, n2r = rr - dc, n2c = cc - dr;
        if (n1r >= 0 && n1c >= 0 && n1r < S && n1c < S && grid[n1r][n1c]) return null;
        if (n2r >= 0 && n2c >= 0 && n2r < S && n2c < S && grid[n2r][n2c]) return null;
      }
    }
    if (crosses === L) return null;   // fully contained in existing letters
    return crosses;
  }
  function writeWord(grid, p) {
    var dr = p.dir === 'D' ? 1 : 0, dc = p.dir === 'A' ? 1 : 0;
    for (var i = 0; i < p.w.w.length; i++) grid[p.r + dr * i][p.c + dc * i] = p.w.w[i];
  }
  function regrid(grid, S, placements) {
    for (var r = 0; r < S; r++) for (var c = 0; c < S; c++) grid[r][c] = null;
    placements.forEach(function (p) { writeWord(grid, p); });
  }

  // grow a grid: seed across word, then budgeted random intersecting
  // placements with drop-the-last-word backtracking when stuck.
  function tryBuild(rng, pool, S, target) {
    var words = shuffle(pool, rng).filter(function (w) { return w.w.length <= S; });
    if (words.length < 20) return null;
    var grid = []; for (var r = 0; r < S; r++) grid.push(new Array(S).fill(null));
    var used = {}, placements = [];
    function place(w, dir, rr, cc) {
      var p = { w: w, dir: dir, r: rr, c: cc };
      placements.push(p); used[w.w] = 1; writeWord(grid, p);
    }
    var seed = null;
    for (var i = 0; i < words.length; i++) {
      var L = words[i].w.length;
      if (L >= 5 && L <= Math.min(8, S)) { seed = words[i]; break; }
    }
    if (!seed) seed = words[0];
    place(seed, 'A', Math.floor(S / 2), Math.floor((S - seed.w.length) / 2));

    var budget = 2600, fails = 0;
    while (placements.length < target && budget-- > 0) {
      var anchor = placements[Math.floor(rng() * placements.length)];
      var k = Math.floor(rng() * anchor.w.w.length);
      var arr = anchor.r + (anchor.dir === 'D' ? k : 0);
      var acc = anchor.c + (anchor.dir === 'A' ? k : 0);
      var ch = anchor.w.w[k];
      var cand = words[Math.floor(rng() * words.length)];
      var ok = false;
      if (!used[cand.w]) {
        var idxs = [];
        for (var q = 0; q < cand.w.length; q++) if (cand.w[q] === ch) idxs.push(q);
        if (idxs.length) {
          var off = idxs[Math.floor(rng() * idxs.length)];
          var dir2 = anchor.dir === 'A' ? 'D' : 'A';
          var nr = dir2 === 'D' ? arr - off : arr;
          var nc = dir2 === 'A' ? acc - off : acc;
          if (canPlace(grid, S, cand.w, nr, nc, dir2) != null) { place(cand, dir2, nr, nc); ok = true; }
        }
      }
      if (ok) { fails = 0; continue; }
      if (++fails > 220 && placements.length > 2) {   // backtrack a step
        var last = placements.pop(); delete used[last.w.w];
        regrid(grid, S, placements); fails = 0;
      }
    }
    if (placements.length < 6 || placements.length > 10) return null;
    // every entry must cross >=1 other (the seed earns its crossings late)
    var hit = {};
    for (var a = 0; a < placements.length; a++) {
      for (var b = a + 1; b < placements.length; b++) {
        if (placements[a].dir === placements[b].dir) continue;
        var A = placements[a].dir === 'A' ? placements[a] : placements[b];
        var D = placements[a].dir === 'A' ? placements[b] : placements[a];
        if (D.c >= A.c && D.c < A.c + A.w.w.length && A.r >= D.r && A.r < D.r + D.w.w.length) {
          hit[a] = 1; hit[b] = 1;
        }
      }
    }
    for (var e2 = 0; e2 < placements.length; e2++) if (!hit[e2]) return null;
    return { S: S, grid: grid, placements: placements };
  }

  /* ---- finalize into the puzzles.js schema --------------------------------- */
  function finalize(b, rng, dateStr) {
    var S = b.S, grid = b.grid, placements = b.placements;
    // standard numbering: row-major scan; each start cell gets the next number
    var num = 0, numAt = {};
    for (var r = 0; r < S; r++) for (var c = 0; c < S; c++) {
      for (var i = 0; i < placements.length; i++) {
        if (placements[i].r === r && placements[i].c === c) { numAt[r + ',' + c] = ++num; break; }
      }
    }
    var entries = [];
    for (var j = 0; j < placements.length; j++) {
      var p = placements[j];
      var cl = clueFor(p.w, rng);
      if (!cl) return null;
      entries.push({
        num: numAt[p.r + ',' + p.c], dir: p.dir, r: p.r, c: p.c,
        answer: p.w.w, clue: cl.text,
        // extra fields (engine ignores them): who the clue points at + the
        // facts it states, so tests can re-prove disambiguation.
        pid: p.w.e.id, facts: cl.facts
      });
    }
    entries.sort(function (a, b2) { return a.dir === b2.dir ? a.num - b2.num : (a.dir === 'A' ? -1 : 1); });
    var rows = [];
    for (var r2 = 0; r2 < S; r2++) {
      var line = '';
      for (var c2 = 0; c2 < S; c2++) line += grid[r2][c2] || '#';
      rows.push(line);
    }
    return {
      id: 'gen-' + dateStr, date: dateStr, size: S, rows: rows,
      theme: entries.length, entries: entries,
      difficulty: Math.round((2 + (S - 7) * 0.4) * 100) / 100,
      sport: 'multi', generated: true
    };
  }

  /* ---- public API ----------------------------------------------------------
   * corpusOpt is for Node/tests; the page relies on window.GRID_ENTITIES. */
  function forDate(dateStr, corpusOpt) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ''))) return null;
    var corpus = corpusOpt || (root && root.GRID_ENTITIES) || [];
    if (!corpus.length) return null;
    var pool = getPool(corpus);
    if (pool.length < 40) return null;
    var rng = mulberry32(xmur3('cwgen-' + dateStr)());
    for (var att = 0; att < 14; att++) {           // one rng stream: deterministic
      var S = 7 + Math.floor(rng() * 3);           // 7-9
      var target = 7 + Math.floor(rng() * 4);      // aim 7-10 entries (6 accepted)
      var b = tryBuild(rng, pool, S, target);
      if (b) {
        var p = finalize(b, rng, dateStr);
        if (p) return p;
      }
    }
    return null;
  }

  return {
    forDate: forDate,
    _internal: { surnameOf: surnameOf, buildPool: buildPool, nick: nick, eraStr: eraStr, factsFit: factsFit }
  };
});
