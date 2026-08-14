/* sportegories.js — the Sportegories engine (window.RTG_SPORTEGORIES).
 *
 * NOT WIRED INTO THE SITE YET. No page loads this; the game is still in
 * development and stays unreachable until it's explicitly launched.
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
        decBits: r[6], act: !!(r[7] & 1), dp1: !!(r[7] & 2), f: r[8], st: r[9] || null,
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
      case 'teamsMax': return p.teams.length > 0 && p.teams.length <= pr.max;
      case 'decades': return bitCount(p.decBits) >= pr.min;
      default: return false;
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
  function build(seed) {
    if (!data()) return null;
    var r = rng(seed);
    var pick = (D.letters || []).filter(function (L) { return (D.byLetter[L] || []).length >= LETTER_MIN_CATS; });
    // Weight by how well the library serves each letter, so common letters come
    // up far more than the thin ones - a uniform roll made N and V as likely
    // as S, which is not how a Scattergories die feels.
    var w = pick.map(function (L) { var n = (D.byLetter[L] || []).length; return n * n; });
    var tot = w.reduce(function (a, b) { return a + b; }, 0), roll = r() * tot, L = pick[pick.length - 1];
    for (var wi = 0; wi < pick.length; wi++) { roll -= w[wi]; if (roll <= 0) { L = pick[wi]; break; } }
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
  function daily(dateStr) { return build(hash('sportegories:' + dateStr)); }
  function practice(seed) { return build(hash('sportegories:practice:' + (seed == null ? Math.floor(Math.random() * 1e9) : seed))); }

  // ---------- grading ----------
  /* Returns:
   *   { ok:false, reason:'empty'|'fullname'|'unknown'|'letter'|'category'|'dup', msg }
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

    var ids = BY_KEY[keyOf(toks)] || [];
    if (!ids.length) return { ok: false, reason: 'unknown', msg: 'No player by that name.' };

    // letter must lead the first or the last name
    if (t[0][0] !== L && t[t.length - 1][0] !== L) {
      return { ok: false, reason: 'letter', msg: 'Needs to start with ' + puz.letter + '.' };
    }
    // among same-named players, take any that satisfies the category
    var def = D.cats[cat.i], hit = null;
    for (var i = 0; i < ids.length; i++) { var p = P[ids[i]]; if (test(p, def.p)) { hit = p; break; } }
    if (!hit) return { ok: false, reason: 'category', msg: 'Doesn’t fit this category.' };
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
    test: test, rarityOf: rarityOf, CATS_PER: CATS_PER
  };
});
