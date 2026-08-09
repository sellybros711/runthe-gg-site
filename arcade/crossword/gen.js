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
  // the given-name portion shown in a clue ("Barry" for "Barry Sanders",
  // "Tony La" for "Tony La Russa"), original case preserved; suffixes dropped.
  // The answer is the SURNAME, so naming the given part never leaks it.
  function givenOf(name) {
    var parts = String(name || '').trim().split(/\s+/);
    while (parts.length > 1 && SUFFIX[norm(parts[parts.length - 1])]) parts.pop();
    if (parts.length < 2) return null;
    return parts.slice(0, -1).join(' ');
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
  //
  // Every clue is anchored on the player's GIVEN name and ends in "___", the
  // standard crossword convention for a surname answer ("Lions great Barry
  // ___" -> SANDERS). The given name is not the answer, so it never leaks the
  // fill; it does make the clue specific instead of "NFL star of the '80s".
  function clueFor(word, rng) {
    var e = word.e;
    var fn = givenOf(e.name);
    if (!fn) return null;
    // Only players who share BOTH names are genuine rivals for a named clue;
    // a different first name already tells the solver who is meant.
    var fnKey = norm(fn);
    var rivals = (word.rivals || []).filter(function (r) { return norm(givenOf(r.name) || '') === fnKey; });
    var tn = (e.t && e.t[0]) ? nick(e.t[0]) : null;
    var jersey = (e.j && e.j.length) ? e.j[e.j.length - 1] : null;
    var dec = primaryDecade(e);
    var era = dec != null ? eraStr(dec) : null;
    var pos = e.pos ? e.pos.toLowerCase() : null;
    // Rich, team-anchored clues first (shuffled for variety across a grid);
    // the generic "star of the era / standout" wordings are a last resort,
    // right for individual-sport athletes (boxing, tennis, F1) with no team.
    var rich = [];
    if (e.hof && tn) rich.push({ t: tn + ' Hall of Famer ' + fn + ' ___', used: { sport: e.sport, hof: true, team: tn } });
    if (tn && pos) rich.push({ t: tn + ' ' + pos + ' ' + fn + ' ___', used: { team: tn, pos: e.pos } });
    if (pos && era) rich.push({ t: fn + ' ___, ' + e.sport + ' ' + pos + ' of the ' + era, used: { sport: e.sport, pos: e.pos, era: dec } });
    if (tn) rich.push({ t: tn + ' great ' + fn + ' ___', used: { team: tn } });
    if (e.hof) rich.push({ t: e.sport + ' Hall of Famer ' + fn + ' ___', used: { sport: e.sport, hof: true } });
    var lean = [];
    if (era) lean.push({ t: fn + ' ___, ' + e.sport + ' star of the ' + era, used: { sport: e.sport, era: dec } });
    lean.push({ t: e.sport + ' standout ' + fn + ' ___', used: { sport: e.sport } });
    var order = (rng ? shuffle(rich, rng) : rich).concat(lean);
    for (var i = 0; i < order.length; i++) {
      var got = tryDisambig(order[i], e, rivals, word.w);
      if (got) return got;
    }
    return null;
  }

  /* ---- team-nickname + sport-vocab pools ---------------------------------
   * Every crossword used to be eight rows of "<Team> great <First> ___" —
   * fine mechanics, one-note read. These two secondary pools mix in team
   * nicknames (CUBS/JETS/HEAT) and sport vocabulary (MVP/HOF/RBI/TDS) with
   * their own clue templates so a solved puzzle has real variety.
   * A pool item carries an optional `staticClue`; finalize() prefers it and
   * only falls back to the surname clue generator for player entries. */
  var VOCAB = [
    { w:'MVP',  clue:'Award you don’t share' },
    { w:'HOF',  clue:'Cooperstown or Canton, briefly' },
    { w:'ERA',  clue:'Pitcher’s earned mark' },
    { w:'RBI',  clue:'Rally payoff, briefly' },
    { w:'RBIS', clue:'Batter’s productivity, in the box score' },
    { w:'TDS',  clue:'End-zone tallies' },
    { w:'PPG',  clue:'Per-game scoring measure' },
    { w:'RPG',  clue:'Rebounding rate, in a box score' },
    { w:'APG',  clue:'Assists average, briefly' },
    { w:'NBA',  clue:'Silver’s league' },
    { w:'NFL',  clue:'Goodell’s league' },
    { w:'MLB',  clue:'Manfred’s league' },
    { w:'FGA',  clue:'Shot count, in an NBA game log' },
    { w:'FGS',  clue:'Made buckets, briefly' },
    { w:'OPS',  clue:'Batter’s slash-line kicker' },
    { w:'INT',  clue:'Cornerback’s takeaway, briefly' },
    { w:'INTS', clue:'Picks in an NFL box score' },
    { w:'AVG',  clue:'Batter’s three-digit calling card' },
    { w:'OTS',  clue:'Extra frames on the scoreboard, briefly' },
    { w:'REBS', clue:'Boards, briefly' },
    { w:'YARDS',clue:'Rusher’s currency' },
    { w:'BUNT', clue:'Small-ball tap' },
    { w:'DUNK', clue:'Rim-rocking finish' },
    { w:'ASSIST',clue:'Set-up credit, on hardwood or ice' },
    { w:'BLOCK',clue:'Denied shot' },
    { w:'STEAL',clue:'Interception, on the hardwood' },
    { w:'REBOUND',clue:'Board, spelled out' },
    { w:'PICK', clue:'A defensive back’s dream, or a set play under the hoop' },
    { w:'HOOK', clue:'Kareem’s signature shot, for short' },
    { w:'CURVE',clue:'Ball that breaks, for a pitcher' },
    { w:'SLIDER',clue:'A pitcher’s bending offering' },
    { w:'BALK', clue:'Illegal pitcher move that scores runners' },
    { w:'HITS', clue:'Batter’s basic count' },
    { w:'RUNS', clue:'What you score in baseball' },
    { w:'INNING',clue:'A ninth of a baseball game' },
    { w:'BASES',clue:'There are three of them to round' },
    { w:'FIELD',clue:'Playing surface, or a wide-open receiver’s space' },
    { w:'GOAL', clue:'What splits the uprights for three points' },
    { w:'YARD', clue:'Football’s basic distance unit' },
    { w:'FADE', clue:'Corner-of-the-endzone route' },
    { w:'POST', clue:'A receiver’s cut over the middle, or a hoops position' },
    { w:'REF',  clue:'Whistle-blower on the court' },
    { w:'UMP',  clue:'Home-plate authority' },
    { w:'TIED', clue:'Deadlocked, on the scoreboard' },
    { w:'WIN',  clue:'A W in the standings' },
    { w:'LOSS', clue:'An L in the standings' }
  ].map(function(v){ v.w=v.w.toUpperCase(); return v; });

  var TEAM_CLUE = {
    // City / regional flavor per nickname; no ambiguity across big-3 leagues.
    LIONS:['NFL','Detroit’s NFL team'],
    RAMS:['NFL','Sean McVay’s Los Angeles NFL team'],
    GIANTS:['NFL','Meadowlands NFL team, in a blue G helmet'],
    PANTHERS:['NFL','Carolina’s NFL team'],
    LAKERS:['NBA','Purple-and-gold LA hoopers'],
    SUNS:['NBA','Phoenix’s NBA team'],
    TEXANS:['NFL','Houston’s NFL team (est. 2002)'],
    JAGUARS:['NFL','Jacksonville’s NFL team'],
    BRONCOS:['NFL','Denver’s NFL team'],
    TITANS:['NFL','Tennessee’s NFL team'],
    RAIDERS:['NFL','Las Vegas NFL squad, formerly of Oakland'],
    PATRIOTS:['NFL','Foxborough’s NFL dynasty of the 2000s'],
    STEELERS:['NFL','Pittsburgh’s NFL team'],
    CHIEFS:['NFL','Kansas City’s NFL squad, with the arrowhead helmet'],
    CHARGERS:['NFL','LA’s AFC West team, with lightning bolts'],
    COWBOYS:['NFL','Big-D NFL team with a lone-star helmet'],
    EAGLES:['NFL','Philadelphia’s NFL team'],
    CARDINALS:['MLB','St. Louis’s NL club, with a bird on the bat'],
    CUBS:['MLB','Wrigley Field’s home nine'],
    METS:['MLB','Citi Field’s NL club, in blue and orange'],
    YANKEES:['MLB','27-time World Series champs, in pinstripes'],
    DODGERS:['MLB','LA’s NL team, formerly of Brooklyn'],
    GIANTSS:['MLB','San Francisco’s NL team (yes, that spelling)'],   // unused; nickname collides with NFL
    ORIOLES:['MLB','Baltimore’s AL bird-team'],
    ROYALS:['MLB','Kansas City’s AL team'],
    RANGERS:['MLB','Arlington-based AL team'],
    MARLINS:['MLB','Miami’s NL team, in teal'],
    BRAVES:['MLB','Atlanta’s NL team with the tomahawk'],
    PIRATES:['MLB','PNC Park’s home team'],
    PHILLIES:['MLB','Philadelphia’s NL team'],
    REDS:['MLB','Cincinnati’s NL club'],
    NATIONALS:['MLB','Washington’s NL team, 2019 champs'],
    ROCKIES:['MLB','Denver’s mile-high NL team'],
    PADRES:['MLB','San Diego’s NL team, in brown-and-gold'],
    MARINERS:['MLB','Seattle’s AL team'],
    ATHLETICS:['MLB','Oakland’s AL team, in green-and-gold'],
    ASTROS:['MLB','Houston’s AL team'],
    ANGELS:['MLB','Anaheim-based AL team'],
    GUARDIANS:['MLB','Cleveland’s AL team (post-2022 name)'],
    TIGERS:['MLB','Detroit’s AL team'],
    TWINS:['MLB','Minnesota’s AL team'],
    CELTICS:['NBA','Green-and-white Boston hoopers, TD Garden tenants'],
    KNICKS:['NBA','Madison Square Garden’s NBA team'],
    NETS:['NBA','Brooklyn’s NBA team'],
    BUCKS:['NBA','Milwaukee’s NBA team, 2021 champs'],
    HEAT:['NBA','South Beach NBA team'],
    HAWKS:['NBA','Atlanta’s NBA team'],
    HORNETS:['NBA','Charlotte’s NBA team, in teal-and-purple'],
    WIZARDS:['NBA','Washington’s NBA team'],
    THUNDER:['NBA','Oklahoma City’s NBA team'],
    JAZZ:['NBA','Salt Lake City’s NBA team, formerly of New Orleans'],
    PACERS:['NBA','Indianapolis’s NBA team'],
    NUGGETS:['NBA','Denver’s NBA team, 2023 champs'],
    KINGS:['NBA','Sacramento’s NBA team'],
    CLIPPERS:['NBA','LA’s other NBA team'],
    SPURS:['NBA','San Antonio’s NBA dynasty'],
    ROCKETS:['NBA','Houston’s NBA team'],
    GRIZZLIES:['NBA','Memphis’s NBA team'],
    MAGIC:['NBA','Orlando’s NBA team'],
    RAPTORS:['NBA','Toronto’s NBA team, 2019 champs'],
    PISTONS:['NBA','Detroit’s NBA team'],
    WARRIORS:['NBA','Bay Area NBA dynasty of the 2010s'],
    BILLS:['NFL','Buffalo’s NFL team, in the AFC East'],
    JETS:['NFL','NY gang, in the AFC East'],
    DOLPHINS:['NFL','Miami’s NFL team, in aqua-and-orange'],
    RAVENS:['NFL','Baltimore’s NFL team (nevermore!)'],
    BENGALS:['NFL','Cincinnati’s NFL team, in tiger stripes'],
    BROWNS:['NFL','Cleveland’s NFL team'],
    COLTS:['NFL','Indianapolis’s NFL team'],
    PACKERS:['NFL','Green Bay’s title-town NFL team'],
    VIKINGS:['NFL','Minnesota’s NFL team (Skol!)'],
    BEARS:['NFL','Chicago’s NFL team'],
    SAINTS:['NFL','New Orleans’s NFL team (Who Dat!)'],
    FALCONS:['NFL','Atlanta’s NFL team'],
    SEAHAWKS:['NFL','Seattle’s NFL team'],
    NINERS:['NFL','San Francisco’s NFL team, informally'],
    COMMANDERS:['NFL','Washington’s NFL team (post-2022 name)']
  };
  delete TEAM_CLUE.GIANTSS;   // helper only

  function buildTeamPool(){
    var out=[];
    Object.keys(TEAM_CLUE).forEach(function(w){
      if (w.length < 3 || w.length > 9) return;
      var d=TEAM_CLUE[w];
      out.push({ w:w, staticClue:{ text:d[1], facts:{ team:w, sport:d[0] } } });
    });
    return out;
  }
  function buildVocabPool(){
    return VOCAB.filter(function(v){ return v.w.length>=3 && v.w.length<=9; })
      .map(function(v){ return { w:v.w, staticClue:{ text:v.clue, facts:{} } }; });
  }

  /* ---- word pool ----------------------------------------------------------- */
  // one word per surname: {w, e (chosen — most famous), rivals (ALL other
  // corpus entities sharing the surname, any fame — ambiguity is checked
  // against everyone)}. Only surnames whose chosen player is fame>=4 and
  // provably disambiguable make the pool.
  // Only truly recognizable players can be crossword ANSWERS — a long snapper
  // named ___SANBORN isn't fillable from "Bills long snapper Garrison ___".
  // Modern era, plus one of: fame 5, NFL award/high pick, or NBA/MLB
  // longevity (8+ notable seasons). Same shape as Odd One Out's warmup gate.
  function isCwIcon(e) {
    var T = { NBA: 1, NFL: 1, MLB: 1 };
    if (!T[e.sport]) return false;
    var d = e.decade;
    if (!d || !d.length || d[d.length - 1] < 1990) return false;
    var f = e.f || 0;
    if (f >= 5) return true;
    if (f < 4) return false;
    if (e.sport === 'NFL') return (e.hp === 1) || (e.aw && e.aw.length > 0);
    return (e.ns || 0) >= 8;
  }
  function buildPool(corpus) {
    var by = {};
    (corpus || []).forEach(function (e) {
      if (!e || !e.name || !e.sport) return;
      if (e.pos && /unknown/i.test(e.pos)) return;
      if (!isCwIcon(e)) return;
      var s = surnameOf(e.name);
      if (!s || s.length < 3 || s.length > 9) return;
      (by[s] = by[s] || []).push(e);
    });
    var pool = [];
    Object.keys(by).sort().forEach(function (s) {
      var list = by[s].slice().sort(function (a, b) {
        return (b.f || 0) - (a.f || 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      });
      var w = { w: s, e: list[0], rivals: list.slice(1) };
      if (!clueFor(w, null)) return;                  // must clue + disambiguate
      pool.push(w);
    });
    return pool;
  }
  var _poolSrc = null, _poolCache = null;
  function getPool(corpus) {
    if (_poolSrc !== corpus) {
      _poolSrc = corpus;
      // Mixed pool: player surnames (deep pool + generated clues) plus static
      // team-nickname and sport-vocab entries. Non-surname items carry a
      // `staticClue` so finalize skips the surname clue generator for them.
      // Surnames outnumber team+vocab 100:1 in the corpus, so uniform random
      // sampling would rarely mix them in. Repeat the static entries enough
      // times that they become ~25% of pick weight — a typical 8-entry mini
      // averages 2 non-surname answers, breaking up the surname monotone.
      var surnames = buildPool(corpus);
      var team = buildTeamPool();
      var vocab = buildVocabPool();
      var mult = Math.max(6, Math.floor(surnames.length / ((team.length + vocab.length) * 3)));
      var boost = [];
      for (var m = 0; m < mult; m++) boost = boost.concat(team, vocab);
      _poolCache = surnames.concat(boost);
    }
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
      // team + vocab entries carry their clue directly; surnames go through
      // the disambiguating clue builder.
      var cl = p.w.staticClue || clueFor(p.w, rng);
      if (!cl) return null;
      entries.push({
        num: numAt[p.r + ',' + p.c], dir: p.dir, r: p.r, c: p.c,
        answer: p.w.w, clue: cl.text,
        // extra fields (engine ignores them): who the clue points at + the
        // facts it states, so tests can re-prove disambiguation.
        pid: p.w.e ? p.w.e.id : null, facts: cl.facts
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
