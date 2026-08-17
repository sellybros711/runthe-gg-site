/* sportegories.js — the Sportegories engine (window.RTG_SPORTEGORIES).
 *
 * Consumes arcade/sportegories-data.js and provides everything the future game
 * page needs, with no DOM dependencies so it can be unit-tested in node:
 *
 *   RTG_SPORTEGORIES.daily(dateStr)   -> today's puzzle (letter + 8 categories)
 *   RTG_SPORTEGORIES.practice(seed)   -> an unranked random puzzle
 *   RTG_SPORTEGORIES.check(puz, i, s) -> grade one typed answer
 *   RTG_SPORTEGORIES.suggest(prefix)  -> typeahead over ALL players
 *
 * ANSWER RULES (see the design spec):
 *   - A full name is required. "Chris" alone is rejected; "Chris Bosh" is not.
 *   - The rolled letter may match the FIRST or the LAST name.
 *   - Every name-word that starts with the letter is a point: "Barry Bonds"
 *     on B scores 2.
 *   - Rarer answers score more (fame-derived today, real crowd data later).
 *   - The same player can only be used once per puzzle.
 */
(function (root, factory) {
  var mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.RTG_SPORTEGORIES = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var D = null;             // raw data file
  var P = [];               // decoded players
  var BY_KEY = null;        // "first|last" -> [playerIdx]
  var SUFFIX = { jr: 1, sr: 1, ii: 1, iii: 1, iv: 1, v: 1 };

  // ---------- text ----------
  function normTok(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]/g, '');
  }
  function tokens(s) { return String(s || '').trim().split(/\s+/).map(normTok).filter(Boolean); }
  /* Strip trailing suffixes but never drop the only name we have. */
  function trimSuffix(t) { var o = t.slice(); while (o.length > 2 && SUFFIX[o[o.length - 1]]) o.pop(); return o; }
  function keyOf(toks) {
    var t = trimSuffix(toks); if (!t.length) return null;
    return t.length === 1 ? t[0] + '|' + t[0] : t[0] + '|' + t[t.length - 1];
  }

  // ---------- load ----------
  function data() {
    if (D) return D;
    D = (typeof window !== 'undefined' && window.RTG_SPORTEGORIES_DATA) ||
        (typeof self !== 'undefined' && self.RTG_SPORTEGORIES_DATA) || null;
    if (D) decode();
    return D;
  }
  function setData(d) { D = d; decode(); return D; }        // node/test injection

  function decode() {
    P = D.players.map(function (r, i) {
      var toks = tokens(r[0]), t = trimSuffix(toks);
      return {
        idx: i, name: r[0], sport: D.sports[r[1]], pos: r[2] >= 0 ? D.pos[r[2]] : null,
        teams: r[3].map(function (x) { return D.teams[x]; }),
        col: r[4] >= 0 ? D.cols[r[4]] : null,
        aw: r[5].map(function (x) { return D.awards[x]; }),
        decBits: r[6], act: !!(r[7] & 1), dp1: !!(r[7] & 2), tpart: !!(r[7] & 4), f: r[8], st: r[9] || null,
        first: t[0] || '', last: t.length > 1 ? t[t.length - 1] : (t[0] || ''), toks: t
      };
    });
    BY_KEY = {};
    P.forEach(function (p) {
      var k = p.first + '|' + p.last;
      (BY_KEY[k] = BY_KEY[k] || []).push(p.idx);
    });
  }

  // ---------- predicate evaluation (mirrors the builder) ----------
  function bitCount(n) { n = n | 0; var c = 0; while (n) { n &= n - 1; c++; } return c; }
  function test(p, pr) {
    if (pr.all) { for (var i = 0; i < pr.all.length; i++) if (!test(p, pr.all[i])) return false; return true; }
    switch (pr.k) {
      case 'sport': return p.sport === pr.v;
      case 'pos': return p.pos === pr.v;
      case 'team': return p.teams.indexOf(pr.v) >= 0;
      case 'award': return p.aw.indexOf(pr.v) >= 0;
      case 'awardRe': return p.aw.some(function (a) { return a.indexOf(pr.v) >= 0; });
      case 'col': return p.col === pr.v;
      case 'conf': return !!p.col && (D.conf[pr.v] || []).indexOf(p.col) >= 0;
      case 'stat': return !!p.st && p.st[pr.v] != null && p.st[pr.v] >= pr.min;
      case 'decade': return !!(p.decBits & (1 << Math.round((pr.v - D.dec0) / 10)));
      case 'act': return p.act;
      case 'draft1': return p.dp1;
      case 'teams': return p.teams.length >= pr.min;
      // Loyalty and longevity. A career shape is a far better category than a
      // decade tag: "never played for another team" is a fact fans argue about,
      // "played in the 2010s" is just a filter.
      // tpart marks a record whose team list came from today's roster only. One
      // team listed for a ten-year veteran is a snapshot, not a one-town career.
      case 'teamsMax': return !p.tpart && p.teams.length > 0 && p.teams.length <= pr.max;
      // AT MOST n vs EXACTLY n. Any label that says a number out loud needs
      // the second one, or it accepts everyone below the number too.
      case 'teamsExact': return !p.tpart && p.teams.length === pr.n;
      case 'decades': return bitCount(p.decBits) >= pr.min;
      default: return false;
    }
  }

  /* Tri-state evaluation: true / false / NULL, where null means a field this
   * category needs is missing from OUR record — not that the player fails it.
   *
   * test() above answers yes/no, which is right for building a puzzle and
   * wrong for judging an answer. We hold a college for 49% of recognizable
   * players, an award list for 38%, and a career stat for 12%. Evaluating
   * those as plain booleans meant "Played college at Virginia" told half the
   * people who named a correct answer that it "doesn't fit", and a points
   * threshold told 88% of them. The player is being marked wrong for a hole in
   * our file.
   *
   * Null routes to the live check instead, which can resolve exactly these
   * fields from a public source (college P69, awards P166, teams P54). So the
   * game confirms the answer rather than rejecting it.
   *
   * Award and stat lists are confirm-only even when present: ours are
   * incomplete, so a missing Pro Bowl is not evidence it never happened. */
  function evalTri(p, pr) {
    if (pr.all) {
      var unknown = false;
      for (var i = 0; i < pr.all.length; i++) {
        var v = evalTri(p, pr.all[i]);
        if (v === false) return false;          // a real contradiction settles it
        if (v === null) unknown = true;
      }
      return unknown ? null : true;
    }
    switch (pr.k) {
      // always present on every record
      case 'sport':    return p.sport === pr.v;
      case 'act':      return !!p.act;
      case 'decades':  return bitCount(p.decBits) >= pr.min ? true : null;
      case 'decade':   return p.decBits ? !!(p.decBits & (1 << Math.round((pr.v - D.dec0) / 10))) : null;
      // present most of the time; absence is not a no
      case 'pos':      return p.pos ? (p.pos === pr.v) : null;
      case 'team':     return p.teams.length ? (p.teams.indexOf(pr.v) >= 0) : null;
      case 'col':      return p.col ? (p.col === pr.v) : null;
      case 'conf':     return p.col ? ((D.conf[pr.v] || []).indexOf(p.col) >= 0) : null;
      case 'teams':    return p.teams.length >= pr.min ? true : null;
      case 'teamsMax': return (!p.tpart && p.teams.length > 0) ? (p.teams.length <= pr.max) : null;
      case 'teamsExact':return (!p.tpart && p.teams.length > 0) ? (p.teams.length === pr.n) : null;
      // our lists are partial, so they can confirm but never deny
      case 'award':    return p.aw.indexOf(pr.v) >= 0 ? true : null;
      case 'awardRe':  return p.aw.some(function (a) { return a.indexOf(pr.v) >= 0; }) ? true : null;
      case 'stat':     return (p.st && p.st[pr.v] != null) ? (p.st[pr.v] >= pr.min) : null;
      case 'draft1':   return p.dp1 ? true : null;
      default:         return null;
    }
  }

  // ---------- rarity ----------
  /* Fame -> the Immaculate-Grid-style "% of players who said this" estimate.
   * Swapped for real crowd data once the daily aggregate exists. */
  var PCT_BY_FAME = { 5: 62, 4: 38, 3: 20, 2: 9, 1: 4, 0: 2 };
  function rarityOf(p) {
    var pct = PCT_BY_FAME[Math.max(0, Math.min(5, p.f || 0))];
    var bonus = pct >= 40 ? 0 : pct >= 15 ? 1 : 2;
    return { pct: pct, bonus: bonus, tier: bonus === 0 ? 'Common' : bonus === 1 ? 'Uncommon' : 'Rare', est: true };
  }

  // ---------- seeded rng ----------
  function hash(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) {
    var a = seed >>> 0;
    return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }

  // ---------- puzzle generation ----------
  var CATS_PER = 8;
  var LETTER_MIN_CATS = 120;     // don't roll a letter the library can barely serve
  var TIER_PLAN = [0, 0, 1, 1, 2, 1, 1, 2];   // 2 anchor, 4 mid, 2 hard
  /* Sport mix. The library is football-heavy by nature (NFL rosters churn), so
   * bias the draw toward basketball and away from baseball, and cap any one
   * sport so a day can't turn into an all-MLB card. */
  var SPORT_W = { NBA: 2.4, ANY: 1.2, NFL: 1.0, MLB: 0.5 };
  var SPORT_CAP = { MLB: 2, NFL: 3, NBA: 4, ANY: 3 };

  /* How many letters a category can serve at all.
   *
   * Uniform drawing quietly favoured the broadest categories: an era category
   * is viable for all 25 letters, while "Played for the Cleveland Browns" only
   * works for the handful of letters that franchise covers. So the broad ones
   * showed up in every day's option list and ate ~10% of all slots, which is
   * why one wording kept recurring. Damping by sqrt(breadth) evens that out
   * without banning anything - a category that fits everywhere is still
   * eligible everywhere, it just stops crowding out the specific ones. */
  var _breadth = null;
  function breadthOf(c) {
    if (!_breadth) {
      _breadth = {};
      var letters = D.letters || [];
      for (var i = 0; i < letters.length; i++) {
        var ids = D.byLetter[letters[i]] || [];
        for (var j = 0; j < ids.length; j++) _breadth[ids[j]] = (_breadth[ids[j]] || 0) + 1;
      }
    }
    return _breadth[c.i] || 1;
  }
  function wOf(c) {
    return (SPORT_W[c.s || 'ANY'] || 1) / Math.sqrt(breadthOf(c));
  }

  function viableFor(L) {
    var l = L.toLowerCase(), ids = D.byLetter[L] || [];
    return ids.map(function (i) { return D.cats[i]; });
  }
  /* The letters a puzzle can actually roll — also the wheel's segments, so the
   * spin shows exactly the pool the draw comes from. */
  function wheelLetters() {
    if (!data()) return [];
    return (D.letters || []).filter(function (L) { return (D.byLetter[L] || []).length >= LETTER_MIN_CATS; });
  }
  /* ---------- the daily letter: a weighted DECK, not a fresh roll ----------
   *
   * An independent weighted roll each day is "fair" and feels rigged: over a
   * year it produced 18 back-to-back repeats and long stretches leaning on the
   * same few letters, which reads as "it's always B or C". Random clumps;
   * people notice clumps.
   *
   * So build a deck instead. Each letter gets copies proportional to how well
   * the library serves it (the same n^2 weighting as before, so S still beats
   * N over the long run), the deck is shuffled once per cycle from a cycle
   * seed, and consecutive days walk it. Every letter's long-run frequency is
   * unchanged, but a letter cannot come back until the deck does — and the
   * shuffle is de-clumped so the same letter never lands twice in a row,
   * including across a cycle boundary. */
  var DECK_TARGET = 120;
  var _deckCache = {};
  function letterDeck(cycle) {
    if (_deckCache[cycle]) return _deckCache[cycle];
    var pick = (D.letters || []).filter(function (L) { return (D.byLetter[L] || []).length >= LETTER_MIN_CATS; });
    var w = pick.map(function (L) { var n = (D.byLetter[L] || []).length; return n * n; });
    var tot = w.reduce(function (a, b) { return a + b; }, 0) || 1;
    var deck = [];
    for (var i = 0; i < pick.length; i++) {
      var copies = Math.max(1, Math.round(DECK_TARGET * w[i] / tot));
      for (var c = 0; c < copies; c++) deck.push(pick[i]);
    }
    var r = rng(hash('sportegories:deck:' + cycle));
    for (var j = deck.length - 1; j > 0; j--) {
      var k = Math.floor(r() * (j + 1)), t = deck[j]; deck[j] = deck[k]; deck[k] = t;
    }
    // de-clump: push any adjacent duplicate forward to the next unlike slot
    for (var a = 1; a < deck.length; a++) {
      if (deck[a] !== deck[a - 1]) continue;
      for (var b = a + 1; b < deck.length; b++) {
        if (deck[b] !== deck[a] && deck[b] !== deck[a - 1]) {
          var tmp = deck[a]; deck[a] = deck[b]; deck[b] = tmp; break;
        }
      }
    }
    _deckCache[cycle] = deck;
    return deck;
  }
  var LETTER_EPOCH = Date.UTC(2026, 6, 22);           // 2026-07-22, the archive floor
  function letterForDate(dateStr) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ''));
    if (!m) return null;
    var day = Math.floor((Date.UTC(+m[1], +m[2] - 1, +m[3]) - LETTER_EPOCH) / 86400000);
    var probe = letterDeck(0);
    if (!probe.length) return null;
    var n = probe.length;
    var cycle = Math.floor(day / n);
    var idx = ((day % n) + n) % n;
    var deck = letterDeck(cycle);
    var L = deck[idx];
    // a cycle boundary can still butt two identical letters together
    if (idx === 0 && cycle > 0) {
      var prev = letterDeck(cycle - 1);
      if (prev.length && prev[prev.length - 1] === L && deck.length > 1) L = deck[1];
    }
    return L;
  }

  function build(seed, forcedLetter) {
    if (!data()) return null;
    var r = rng(seed);
    var pick = (D.letters || []).filter(function (L) { return (D.byLetter[L] || []).length >= LETTER_MIN_CATS; });
    var L;
    if (forcedLetter && pick.indexOf(forcedLetter) >= 0) {
      L = forcedLetter;                    // dailies walk the deck
    } else {
      // practice keeps the plain weighted roll - there is no sequence to space
      var w = pick.map(function (Lx) { var n = (D.byLetter[Lx] || []).length; return n * n; });
      var tot = w.reduce(function (a, b) { return a + b; }, 0), roll = r() * tot;
      L = pick[pick.length - 1];
      for (var wi = 0; wi < pick.length; wi++) { roll -= w[wi]; if (roll <= 0) { L = pick[wi]; break; } }
    }
    var avail = viableFor(L);
    var out = [], used = {}, byTag = {}, bySport = {};
    function freeSport(c) { return (bySport[c.s || 'ANY'] || 0) < (SPORT_CAP[c.s || 'ANY'] || 3); }
    function draw(opts) {                       // weighted by sport AND breadth
      var tot = 0, i;
      for (i = 0; i < opts.length; i++) tot += wOf(opts[i]);
      var roll = r() * tot;
      for (i = 0; i < opts.length; i++) { roll -= wOf(opts[i]); if (roll <= 0) return opts[i]; }
      return opts[opts.length - 1];
    }
    TIER_PLAN.forEach(function (want) {
      var opts = avail.filter(function (c) {
        return !used[c.i] && c.t === want && (byTag[c.g] || 0) < 2 && freeSport(c);
      });
      if (!opts.length) opts = avail.filter(function (c) { return !used[c.i] && (byTag[c.g] || 0) < 2 && freeSport(c); });
      if (!opts.length) opts = avail.filter(function (c) { return !used[c.i] && freeSport(c); });
      if (!opts.length) opts = avail.filter(function (c) { return !used[c.i]; });
      if (!opts.length) return;
      var c = draw(opts);
      used[c.i] = 1; byTag[c.g] = (byTag[c.g] || 0) + 1;
      bySport[c.s || 'ANY'] = (bySport[c.s || 'ANY'] || 0) + 1;
      out.push({ i: c.i, label: c.l, tier: c.t, axis: c.g, sport: c.s || 'ANY', pool: c.n, valid: (D.viab[c.i] || {})[L.toLowerCase()] || 0 });
    });
    return { letter: L, cats: out, seed: seed };
  }
  function daily(dateStr) { return build(hash('sportegories:' + dateStr), letterForDate(dateStr)); }
  function practice(seed) { return build(hash('sportegories:practice:' + (seed == null ? Math.floor(Math.random() * 1e9) : seed))); }

  // ---------- grading ----------
  /* Returns:
   *   { ok:false, reason:'empty'|'fullname'|'letter'|'unknown'|'category'|'dup', msg }
   *   reason 'unknown' carries live:true — the name is absent from OUR data,
   *   which livecheck.js can still resolve against the wider world.
   *   { ok:true, player, points, base, allit, rarity:{pct,bonus} } */
  function check(puz, catIndex, text, usedPlayers) {
    if (!data()) return { ok: false, reason: 'nodata', msg: 'Data not loaded.' };
    var cat = puz.cats[catIndex];
    if (!cat) return { ok: false, reason: 'nocat', msg: 'No such category.' };
    var L = puz.letter.toLowerCase();
    var toks = tokens(text);
    if (!toks.length) return { ok: false, reason: 'empty', msg: '' };

    var t = trimSuffix(toks);
    if (t.length < 2) return { ok: false, reason: 'fullname', msg: 'Enter the full name — first and last.' };

    // Letter first: a wrong letter is wrong whoever they are, and settling it
    // here means an unknown name only reaches the live check when it could
    // still have scored.
    if (t[0][0] !== L && t[t.length - 1][0] !== L) {
      return { ok: false, reason: 'letter', msg: 'Needs to start with ' + puz.letter + '.' };
    }

    /* Absent from our file. This game is about deep cuts, so our file is never
     * the boundary of who counts — the miss goes to the live check, and even
     * the fallback wording claims only that WE couldn't confirm them. */
    var ids = BY_KEY[keyOf(toks)] || [];
    if (!ids.length) {
      return { ok: false, reason: 'unknown', live: true, msg: 'Couldn’t verify that one.' };
    }

    // Among same-named players, take any that satisfies the category. A player
    // we simply lack a field for is not a wrong answer — send it to the live
    // check rather than calling it one.
    var def = D.cats[cat.i], hit = null, unsure = false;
    for (var i = 0; i < ids.length; i++) {
      var p = P[ids[i]], v = evalTri(p, def.p);
      if (v === true) { hit = p; break; }
      if (v === null) unsure = true;
    }
    if (!hit) {
      if (unsure) return { ok: false, reason: 'unknown', live: true, msg: 'Couldn’t verify that one.' };
      return { ok: false, reason: 'category', msg: 'Doesn’t fit this category.' };
    }
    if (usedPlayers && usedPlayers[hit.idx]) return { ok: false, reason: 'dup', msg: 'Already used this player.' };

    // every name-word starting with the letter is a point ("Barry Bonds" = 2)
    var allit = 0;
    for (var j = 0; j < t.length; j++) if (t[j][0] === L) allit++;
    var rar = rarityOf(hit);
    return {
      ok: true, player: { idx: hit.idx, name: hit.name, sport: hit.sport, f: hit.f },
      base: allit, allit: allit, rarity: rar, points: allit + rar.bonus
    };
  }

  /* How many words of a typed name lead with the puzzle's letter. Exposed so
   * the live check can score an outside player on the same scale. */
  function letterHits(puz, text) {
    var L = puz.letter.toLowerCase(), t = trimSuffix(tokens(text)), n = 0;
    for (var i = 0; i < t.length; i++) if (t[i][0] === L) n++;
    return n;
  }

  // ---------- typeahead ----------
  /* Deliberately searches ALL players, never the category's answers — a
   * category-filtered suggester would hand the player the answer. */
  function suggest(prefix, limit) {
    if (!data()) return [];
    var q = normTok(prefix), out = [];
    if (q.length < 2) return out;
    for (var i = 0; i < P.length && out.length < (limit || 8); i++) {
      var p = P[i];
      if (p.first.indexOf(q) === 0 || p.last.indexOf(q) === 0 || (p.first + p.last).indexOf(q) === 0) out.push(p.name);
    }
    return out;
  }

  // ---------- answers (for the post-game reveal) ----------
  function answersFor(puz, catIndex, limit) {
    if (!data()) return [];
    var cat = puz.cats[catIndex], def = D.cats[cat.i], L = puz.letter.toLowerCase();
    return P.filter(function (p) {
      return (p.first[0] === L || p.last[0] === L) && test(p, def.p);
    }).sort(function (a, b) { return (b.f || 0) - (a.f || 0); })
      .slice(0, limit || 10).map(function (p) { return p.name; });
  }

  function scoreOf(results) {
    return results.reduce(function (n, r) { return n + (r && r.ok ? r.points : 0); }, 0);
  }

  return {
    setData: setData, data: function () { return data(); },
    daily: daily, practice: practice, build: build, wheelLetters: wheelLetters,
    check: check, suggest: suggest, answersFor: answersFor, score: scoreOf,
    letterHits: letterHits,
    test: test, evalTri: evalTri, rarityOf: rarityOf, CATS_PER: CATS_PER
  };
});
