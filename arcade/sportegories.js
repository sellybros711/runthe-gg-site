/* sportegories.js: the Sportegories engine (window.RTG_SPORTEGORIES).
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
        /* The position his club lists him at THIS season, when it differs
           from the career label. Both are true and either proves a
           category: Jalen Williams is a Small Forward by career and a
           Guard on today's roster, and he was being refused for
           "Active NBA Guard" on the strength of the older one. */
        rpos: (r[10] != null && r[10] >= 0) ? D.pos[r[10]] : null,
        first: t[0] || '', last: t.length > 1 ? t[t.length - 1] : (t[0] || ''), toks: t
      };
    });
    BY_KEY = {};
    P.forEach(function (p) {
      var k = p.first + '|' + p.last;
      (BY_KEY[k] = BY_KEY[k] || []).push(p.idx);
    });
    /* NBA career totals summed from every season since 1973-74
       (scripts/build-sportegories.mjs, NBA CAREER TOTALS). They fill a stat
       the record does not have, never replace one it does, and they can only
       under-count, so evalTri lets them prove a line and only deny one when
       the whole career is in the file and well short of it. Dikembe Mutombo's
       11,706 is what "10,000+ NBA points" was missing. Applied before the
       join below, so every name of a man gets them. */
    /* _x: an exact career total entered by hand (before 1973-74), judged
       like any curated stat. _o: curated numbers the season file shows are
       wrong (Luol Deng's 15,208 points are 13,394), replaced by the file's. */
    (D.dst || []).forEach(function (row) {
      var p = P[row[0]], o = row[1]; if (!p || !o) return;
      Object.keys(o).forEach(function (k) {
        if (k.charAt(0) === '_') return;
        p.st = p.st || {};
        if (p.st[k] != null && !(o._o && o._o.indexOf(k) >= 0)) return;
        p.st[k] = o[k];
        if (!o._x) (p.dst = p.dst || {})[k] = o._f ? 2 : 1;   // 2: the whole career is counted
        if (o._m != null) p.dstM = o._m;
        if (o._p != null) p.dstP = o._p;
      });
    });
    /* A man the sources write two ways is two records, each holding part of
       him (scripts/sportegories-people.mjs says how they are found). Penny
       Hardaway had the All-Star years and Anfernee Hardaway had Memphis, so
       each name failed a category the other passed. Joined here, at load, so
       the board a day gets never moves: every record carries the union of
       all of them, any name finds them all, and naming him twice is a
       duplicate. A man can be three records (the corpus twice and a roster
       row), so the pairs are gathered into groups first; joined pair by pair,
       the first record would miss the third one's facts. */
    var up = {};
    var find = function (i) { while (up[i] != null && up[i] !== i) i = up[i]; return i; };
    (D.same || []).forEach(function (pr) {
      if (!P[pr[0]] || !P[pr[1]]) return;
      var ra = find(pr[0]), rb = find(pr[1]);
      if (ra !== rb) { var lo = Math.min(ra, rb); up[ra] = lo; up[rb] = lo; }
    });
    var group = {};
    Object.keys(up).forEach(function (k) { var r = find(+k); (group[r] = group[r] || []).indexOf(+k) < 0 && group[r].push(+k); });
    Object.keys(group).forEach(function (r) {
      var g = group[r].map(function (i) { return P[i]; });
      var u = function (lists) { var o = []; lists.forEach(function (l) { (l || []).forEach(function (v) { if (o.indexOf(v) < 0) o.push(v); }); }); return o; };
      var teams = u(g.map(function (p) { return p.teams; })), aw = u(g.map(function (p) { return p.aw; }));
      var first = function (f) { for (var i = 0; i < g.length; i++) if (g[i][f]) return g[i][f]; return g[0][f]; };
      var col = first('col'), pos = first('pos'), rpos = first('rpos');
      // every stat any of the records holds, and whether it was summed
      var st = null, dst = null;
      g.forEach(function (p) {
        Object.keys(p.st || {}).forEach(function (k) {
          if (p.st[k] == null) return;
          st = st || {};
          if (st[k] == null || (dst && dst[k] && !(p.dst && p.dst[k]))) {
            st[k] = p.st[k];
            if (p.dst && p.dst[k]) (dst = dst || {})[k] = p.dst[k]; else if (dst) delete dst[k];
          }
        });
      });
      var bits = 0, act = 0, f = 0;
      g.forEach(function (p) { bits |= p.decBits; act = act || p.act; f = Math.max(f, p.f || 0); });
      var person = Math.min.apply(null, g.map(function (p) { return p.idx; }));
      g.forEach(function (p) {
        p.teams = teams; p.aw = aw;
        if (!p.col) p.col = col;
        if (!p.pos) p.pos = pos;
        if (!p.rpos) p.rpos = rpos;
        if (st) p.st = st;
        p.dst = dst;
        if (dst) p.dstM = Math.max.apply(null, g.map(function (q) { return q.dstM || 0; }));
        g.forEach(function (q) { if (q.dstP != null) p.dstP = Math.max(p.dstP || 0, q.dstP); });
        p.decBits = bits; p.act = act; p.f = f; p.person = person;
      });
      g.forEach(function (p) {
        var ids = BY_KEY[p.first + '|' + p.last];
        g.forEach(function (o) { if (ids.indexOf(o.idx) < 0) ids.push(o.idx); });
      });
    });
  }

  // ---------- predicate evaluation (mirrors the builder) ----------
  function bitCount(n) { n = n | 0; var c = 0; while (n) { n &= n - 1; c++; } return c; }

  /* A generic position is not a contradiction of a specific one.
   *
   * Half the NBA corpus is recorded as plain "Forward" or "Guard" (542 of
   * 1076), because that is what the source says. Comparing pos by string
   * equality meant "NBA Power Forward" accepted only the records carrying the
   * long label, and told anyone who answered Thaddeus Young, a power forward by
   * any reading, that he does not fit the category.
   *
   * posProves is what we can demonstrate: this record IS that position, or sits
   * under it. It is what builds a category, so the counts and the post-game
   * answer list stay honest. posAllows adds the other direction, a generic
   * record against a specific ask, and belongs only to judging: see evalTri.
   *
   * The parent map ships inside the data file so the engine and the builder
   * cannot drift; the fallback keeps an older cached payload working. */
  function posParent(v) { return ((D && D.posParent) || {})[v]; }
  function posProves(have, want) { return !!have && (have === want || posParent(have) === want); }
  function posAllows(have, want) { return posProves(have, want) || posParent(want) === have; }
  // Either label proves it: the career one, or the one his club lists today.
  function posProves2(p, want) { return posProves(p.pos, want) || posProves(p.rpos, want); }
  function posAllows2(p, want) { return posAllows(p.pos, want) || (!!p.rpos && posAllows(p.rpos, want)); }
  function test(p, pr) {
    if (pr.all) { for (var i = 0; i < pr.all.length; i++) if (!test(p, pr.all[i])) return false; return true; }
    switch (pr.k) {
      case 'sport': return p.sport === pr.v;
      case 'pos': return posProves2(p, pr.v);
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
   * category needs is missing from OUR record, not that the player fails it.
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
  /* What a man still playing can have added since the totals were summed:
     the games played so far this season (a season opens about 21 October and
     its 82 games run to mid April), at his rate last season plus five. Zero
     before the opener, so the day after a refresh he is judged like anyone. */
  function seasonSoFar(p, stat) {
    if (p.dstP == null || !D.nbaThrough) return 0;
    var open = Date.UTC(D.nbaThrough, 9, 21), now = Date.now();
    if (now <= open) return 0;
    var games = Math.min(82, Math.ceil((now - open) / 864e5 * 82 / 174));
    var rate = stat === 'nba_points' ? p.dstP + 5 : 15;
    return Math.round(games * rate);
  }
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
      /* POSITION CONFIRMS, IT DOES NOT DENY.
       *
       * A player wrote in: "Outfielder who played for 3+ teams", answer Bobby
       * Bonilla, told it did not fit. He played for eight clubs and spent more
       * of his career in the outfield than anywhere else. We hold him as a
       * Third Baseman, because we hold exactly ONE position for every player
       * and 1,776 of 1,776 MLB records carry a single label.
       *
       * A career is not one position. Bonilla played third and the outfield,
       * Ohtani pitches and hits, a safety covers the slot, and Jalen Williams
       * is a forward by career label and the guard his club lists him at. So a
       * label that disagrees is not evidence against: it is one of several,
       * and the one we happened to write down.
       *
       * This is the same rule the awards two lines down already follow, for
       * the same reason, in the same words: ours are partial, so they can
       * confirm but never deny. A mismatch goes to the live check, which reads
       * ALL of a player's positions from a public source and can settle it.
       * The puzzle BUILDER still requires proof (test() uses posProves2), so
       * this loosens judging without loosening what gets asked. */
      case 'pos':      return posAllows2(p, pr.v) ? true : null;
      case 'team':     return p.teams.length ? (p.teams.indexOf(pr.v) >= 0) : null;
      case 'col':      return p.col ? (p.col === pr.v) : null;
      case 'conf':     return p.col ? ((D.conf[pr.v] || []).indexOf(p.col) >= 0) : null;
      case 'teams':    return p.teams.length >= pr.min ? true : null;
      case 'teamsMax': return (!p.tpart && p.teams.length > 0) ? (p.teams.length <= pr.max) : null;
      case 'teamsExact':return (!p.tpart && p.teams.length > 0) ? (p.teams.length === pr.n) : null;
      // our lists are partial, so they can confirm but never deny
      case 'award':    return p.aw.indexOf(pr.v) >= 0 ? true : null;
      case 'awardRe':  return p.aw.some(function (a) { return a.indexOf(pr.v) >= 0; }) ? true : null;
      case 'stat':
        if (!p.st || p.st[pr.v] == null) return null;
        if (p.st[pr.v] >= pr.min) return true;
        /* A summed total under-counts: a season under 20 games or 12 minutes
           is not in the file (Michael Jordan's 18 games in 1986 and 17 in
           1995 are 860 points), and a man still playing adds to it all
           season. The build says how far short each one can be (dstM): 400
           for a career with no hole in it, more for one with a hole, and a
           season's worth more for a man still playing. Short by more than
           that is a real no; inside it, nobody can say. */
        if (p.dst && p.dst[pr.v]) {
          var m = (p.dstM != null ? p.dstM : Math.min(1000, pr.min * 0.1)) + seasonSoFar(p, pr.v);
          return (p.dst[pr.v] === 2 && p.st[pr.v] < pr.min - m) ? false : null;
        }
        return false;
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
  /* Flag 'broadcats' (flags.js). A board any fan can start on: four Anchor
     categories (the tier the build gives to categories with 200+ known
     answers: positions, eras, the big awards, the big conferences), three
     Mid and one Hard. The labels stay Anchor, Mid and Hard. */
  var TIER_PLAN_BROAD = [0, 0, 1, 0, 1, 0, 2, 1];   // 4 anchor, 3 mid, 1 hard
  /* Retired from the daily board under the same flag: categories that count
     franchises ("Played for the Miami Heat and 3 other franchises", "Played
     for 4+ franchises", "Cornerback who played for 3+ teams", "Played for
     exactly two franchises"). A fan cannot answer them
     from memory, and franchise counts are the field the data gets wrong most
     often (relocations, a week on a practice squad). "Never played for
     another franchise" stays: that one a fan does know. */
  var RETIRED = /\b\d\+ (teams|franchises)\b|\bother franchises?\b|exactly two franchises/i;
  function broadOn(dateStr) {
    var F = (typeof self !== 'undefined' ? self : this).RTGFlags;
    try { return !!(F && F.on && F.on('broadcats', dateStr)); } catch (e) { return false; }
  }
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
  /* The letters a puzzle can actually roll. Also the wheel's segments, so the
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
   * unchanged, but a letter cannot come back until the deck does, and the
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

  /* Flag 'fullstats' (flags.js). A stat category goes on a board only if we
     hold that stat for every player a fan could name for it. The owner's
     rule, after "10,000+ NBA points" could not verify Dikembe Mutombo: a
     category we put up cannot be missing the answer. NBA points are summed
     from every season (and hand-entered before 1973-74); the MLB and NFL
     stats are still career leaders only (181 of 1,134 recognizable hitters
     have a hit total), so their categories stay off the board until that
     data is whole. Answers to them still score in practice and archives. */
  var STAT_SURE = { nba_points: 1 };
  function statsOf(pr, out) {
    out = out || [];
    if (!pr) return out;
    if (pr.k === 'stat') out.push(pr.v);
    (pr.all || []).forEach(function (q) { statsOf(q, out); });
    return out;
  }
  function sureCat(c) { return statsOf(c.p).every(function (k) { return STAT_SURE[k]; }); }
  function sureOn(dateStr) {
    var F = (typeof self !== 'undefined' ? self : this).RTGFlags;
    try { return !!(F && F.on && F.on('fullstats', dateStr)); } catch (e) { return false; }
  }

  function build(seed, forcedLetter, broad, sure) {
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
    if (broad) avail = avail.filter(function (c) { return !RETIRED.test(c.l); });
    if (sure) avail = avail.filter(sureCat);
    var out = [], used = {}, byTag = {}, bySport = {};
    function freeSport(c) { return (bySport[c.s || 'ANY'] || 0) < (SPORT_CAP[c.s || 'ANY'] || 3); }
    function draw(opts) {                       // weighted by sport AND breadth
      var tot = 0, i;
      for (i = 0; i < opts.length; i++) tot += wOf(opts[i]);
      var roll = r() * tot;
      for (i = 0; i < opts.length; i++) { roll -= wOf(opts[i]); if (roll <= 0) return opts[i]; }
      return opts[opts.length - 1];
    }
    (broad ? TIER_PLAN_BROAD : TIER_PLAN).forEach(function (want) {
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
      out.push({ i: c.i, label: eraLabel(c.l, c.s), tier: c.t, axis: c.g, sport: c.s || 'ANY', pool: c.n, valid: (D.viab[c.i] || {})[L.toLowerCase()] || 0 });
    });
    return { letter: L, cats: out, seed: seed };
  }
  /* A team category accepts every era of its franchise (the data's alias
     table files the Houston Oilers under the Titans), so the label names every
     era too: "Played for the Houston Oilers / Tennessee Titans", not a 2022
     name for a 1980s career. Labels that already use a shared nickname
     ("the Raiders") are left as they are. franchise.js is optional here. */
  /* The names the players this file accepts for a club actually played
     under, worked out from each one's decades. So the label promises exactly
     what the check accepts: the 76ers read "Syracuse Nationals / Philadelphia
     76ers" only if a Syracuse-era player is in the file. */
  var UNDER = null;
  function namesUnder(sport, team) {
    var F = (typeof self !== 'undefined' ? self : this).RTGFranchise;
    if (!UNDER) {
      UNDER = {};
      (P || []).forEach(function (p) {
        var bits = p.decBits || 0, lo = null, hi = null;
        for (var b = 0; b < 16; b++) if (bits & (1 << b)) { var y = D.dec0 + 10 * b; if (lo == null) lo = y; hi = y + 9; }
        p.teams.forEach(function (t) {
          var k = p.sport + '|' + t, n = (lo != null && F) ? F.nameAt(p.sport, t, lo, hi) : t;
          var m = UNDER[k] = UNDER[k] || {};
          m[n] = (m[n] || 0) + 1;
        });
      });
    }
    // The two names most of these players wore; a name only a handful wore
    // (the Cleveland Naps) does not get to stand for the club.
    var m = UNDER[sport + '|' + team];
    if (!m) return [team];
    var ns = Object.keys(m).sort(function (a, b) { return m[b] - m[a]; });
    return ns.filter(function (n, i) { return i < 2 && (i === 0 || m[n] >= 2); });
  }
  function eraLabel(lab, sport) {
    var F = (typeof self !== 'undefined' ? self : this).RTGFranchise;
    if (!F || !F.franchiseLabel || !F._F || !sport || !F._F[sport]) return lab;
    var keys = Object.keys(F._F[sport]).sort(function (a, b) { return b.length - a.length; });
    for (var k = 0; k < keys.length; k++) {
      var at = lab.indexOf('the ' + keys[k]);
      if (at < 0) continue;
      var end = at + 4 + keys[k].length, after = lab.charAt(end);
      if (after && /[A-Za-z]/.test(after)) continue;
      var nl = F.label(sport, keys[k], namesUnder(sport, keys[k]));
      return nl && nl !== keys[k] ? lab.slice(0, at + 4) + nl + lab.slice(end) : lab;
    }
    return lab;
  }
  function daily(dateStr) { return build(hash('sportegories:' + dateStr), letterForDate(dateStr), broadOn(dateStr), sureOn(dateStr)); }
  function practice(seed) { return build(hash('sportegories:practice:' + (seed == null ? Math.floor(Math.random() * 1e9) : seed)), null, broadOn(), sureOn()); }

  // ---------- grading ----------
  /* Returns:
   *   { ok:false, reason:'empty'|'fullname'|'letter'|'unknown'|'category'|'dup', msg }
   *   reason 'unknown' carries live:true: the name is absent from OUR data,
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
    if (t.length < 2) return { ok: false, reason: 'fullname', msg: 'Enter the full name. First and last.' };

    // Letter first: a wrong letter is wrong whoever they are, and settling it
    // here means an unknown name only reaches the live check when it could
    // still have scored.
    /* SAY WHICH NAME. This read "Needs to start with B.", which is the only
       place in the game that states the letter rule WITHOUT saying either name
       will do, and it is the place a player reads it at the exact moment they
       have got it wrong. Every other surface says first or last: the play
       screen header, the how-to, the demo caption. A player wrote in asking
       for it to be made clear, twice. It was clear everywhere except here. */
    if (t[0][0] !== L && t[t.length - 1][0] !== L) {
      return { ok: false, reason: 'letter',
               msg: 'First or last name has to start with ' + puz.letter + '.' };
    }

    /* Absent from our file. This game is about deep cuts, so our file is never
     * the boundary of who counts. The miss goes to the live check, and even
     * the fallback wording claims only that WE couldn't confirm them. */
    var ids = BY_KEY[keyOf(toks)] || [];

    /* A CHALLENGE THAT WAS WON IS A FACT, and it outranks our file. Somebody
       challenged this name against this category, the server looked it up live
       and the record books said yes. Every later card takes it as an answer
       rather than asking our file, which was the thing that got it wrong. Set
       only under the 'challenge' flag (setRulings), so nothing here moves for
       anybody else. */
    var ruled = rulingFor(toks, D.cats[cat.i]);
    if (ruled) {
      if (usedPlayers) {
        for (var w = 0; w < ids.length; w++) {
          if (usedPlayers[ids[w]]) return { ok: false, reason: 'dup', msg: 'Already used this player.' };
        }
      }
      return creditOf(puz, ids, text);
    }

    if (!ids.length) {
      return { ok: false, reason: 'unknown', live: true, msg: 'Couldn’t verify that one.' };
    }

    // Among same-named players, take any that satisfies the category. A player
    // we simply lack a field for is not a wrong answer. Send it to the live
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
    /* One name, one answer. Now that a name can be several people (the Bills
       quarterback and the Jaguars linebacker are both Josh Allen), an index
       check would let the same typed text score in two categories by matching
       a different man each time. The player wrote it once, so any same-named
       record already used settles it. */
    if (usedPlayers) {
      for (var u = 0; u < ids.length; u++) {
        if (usedPlayers[ids[u]]) return { ok: false, reason: 'dup', msg: 'Already used this player.' };
      }
    }

    // every name-word starting with the letter is a point ("Barry Bonds" = 2)
    var allit = 0;
    for (var j = 0; j < t.length; j++) if (t[j][0] === L) allit++;
    var rar = rarityOf(hit);
    return {
      ok: true, player: { idx: hit.idx, name: hit.name, sport: hit.sport, f: hit.f },
      base: allit, allit: allit, rarity: rar, points: allit + rar.bonus
    };
  }

  /* ---------- challenges ----------
   * A ruling is { a: nameKey, c: category label }. Keyed on the NAME, not on a
   * record, the way check() already is: a name that is several people counts
   * if any of them fits, so a ruling on "josh|allen" against a Bills category
   * holds for whoever typed it. Keyed on the LABEL, not the index, because an
   * index moves when the library is rebuilt and a label means the same thing. */
  var RULED = Object.create(null);
  function nameKey(text) { return keyOf(tokens(text)); }
  function setRulings(list) {
    RULED = Object.create(null);
    (list || []).forEach(function (r) { if (r && r.a && r.c) RULED[r.a + '#' + r.c] = 1; });
    return Object.keys(RULED).length;
  }
  function rulingFor(toks, def) { var k = keyOf(toks); return !!(k && def && RULED[k + '#' + def.l]); }
  /* What a won challenge scores: the letter points, plus the rarity of the man
     if our file knows him, or the outside-the-file rate livecheck.js uses. */
  function creditOf(puz, ids, text) {
    var allit = letterHits(puz, text), hit = ids.length ? P[ids[0]] : null;
    var rar = hit ? rarityOf(hit) : { pct: 2, bonus: 2, tier: 'Rare', est: true };
    return {
      ok: true, ruled: true,
      player: hit ? { idx: hit.idx, name: hit.name, sport: hit.sport, f: hit.f }
                  : { idx: -1, name: String(text || '').trim(), sport: null, f: 0 },
      base: allit, allit: allit, rarity: rar, points: allit + rar.bonus
    };
  }
  function credit(puz, catIndex, text) {
    if (!data()) return null;
    return creditOf(puz, BY_KEY[nameKey(text)] || [], text);
  }

  /* How many words of a typed name lead with the puzzle's letter. Exposed so
   * the live check can score an outside player on the same scale. */
  function letterHits(puz, text) {
    var L = puz.letter.toLowerCase(), t = trimSuffix(tokens(text)), n = 0;
    for (var i = 0; i < t.length; i++) if (t[i][0] === L) n++;
    return n;
  }

  // ---------- typeahead ----------
  /* Deliberately searches ALL players, never the category's answers. A
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
    /* One NAME per suggestion, not one record. A player who is held twice
       (the merge keeps a career record and a coarser one, so James Harden is
       both a Shooting Guard and a Guard) was offered twice in the same
       breath: "Could have said: James Harden, James Harden, Ja Morant".
       Deduped on the name, keeping the first and therefore the famous one,
       because the list is already sorted by fame. */
    var seen = {}, out = [];
    var hits = P.filter(function (p) {
      return (p.first[0] === L || p.last[0] === L) && test(p, def.p);
    }).sort(function (a, b) { return (b.f || 0) - (a.f || 0); });
    /* And one per MAN: Penny and Anfernee Hardaway are one record pair, so
       the reveal names him once, by the first of the two it reaches. */
    for (var i = 0; i < hits.length && out.length < (limit || 10); i++) {
      var n = hits[i].name, who = hits[i].person != null ? '#' + hits[i].person : n.toLowerCase();
      if (seen[n.toLowerCase()] || seen[who]) continue;
      seen[n.toLowerCase()] = 1; seen[who] = 1; out.push(n);
    }
    return out;
  }

  function scoreOf(results) {
    return results.reduce(function (n, r) { return n + (r && r.ok ? r.points : 0); }, 0);
  }

  return {
    setData: setData, data: function () { return data(); },
    daily: daily, practice: practice, build: build, wheelLetters: wheelLetters,
    check: check, suggest: suggest, answersFor: answersFor, score: scoreOf,
    letterHits: letterHits,
    nameKey: nameKey, setRulings: setRulings, credit: credit,
    test: test, evalTri: evalTri, rarityOf: rarityOf, CATS_PER: CATS_PER, STAT_SURE: STAT_SURE, sureCat: sureCat, players: function () { return P; }
  };
});
