/* fame.js: how famous a player is, as a number (window.RTGFame).
 *
 *   RTGFame.of(entity)    -> 0 to 100
 *   RTGFame.tier(entity)  -> 'household' | 'known' | 'solid' | 'deep'
 *   RTGFame.rank(list)    -> the same list, most famous first (stable)
 *
 * WHY A NUMBER
 * Until now the arcade had one yes-or-no answer to "would a fan know this
 * name" (RTG_KNOWN in data.js). That is the right question for building a
 * pool and the wrong one for ordering it: a run that should open on Jordan
 * and work down to Nick Van Exel needs to know that Jordan is further up
 * than Van Exel, and both pass RTG_KNOWN.
 *
 * WHERE IT COMES FROM
 * Only signals the record already carries. Nothing here is invented:
 *   - the curated tiers in stars.js (icons, then stars): a person decided
 *     these names are recognisable, and they outrank anything automatic;
 *   - the Hall of Fame;
 *   - league MVP, then the other headline awards (Finals, World Series and
 *     Super Bowl MVP, Cy Young, Player of the Year, Rookie of the Year);
 *   - All-Star or Pro Bowl (a Pro Bowl counts fully only for a quarterback,
 *     back, receiver or tight end: the NFL sends about ninety players a year
 *     and most of them are linemen nobody outside their city could name);
 *   - Gold Glove and Silver Slugger, a little;
 *   - the round-number career clubs (3,000 hits, 500 home runs, 30,000
 *     points), which are career totals in the only form this file holds them;
 *   - how long the career was, capped, because longevity alone is not fame;
 *   - a top draft pick;
 *   - recency: a 2010s player is better known to today's fan than a 1950s
 *     one with the same résumé, and an active one more so.
 *
 * WHAT IS MISSING, SAID PLAINLY
 * The record holds no championship rings and no selection counts (a player
 * is "an All-Star", not "a 14-time All-Star"). Both would sharpen this. Until
 * they are in the data the curated tiers carry most of the weight at the top.
 */
(function (root, factory) {
  var mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.RTGFame = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var LEAGUE_MVP = /^(NBA|NFL|MLB) MVP$/;
  var BIG = /^(Finals MVP|World Series MVP|Super Bowl MVP|Cy Young|Defensive Player of the Year|Offensive Player of the Year)$/;
  var ROOKIE = /Rookie of the Year$/;
  var SELECT = /^(NBA All-Star|MLB All-Star|All-Star)$/;
  var PROBOWL = /^Pro Bowl$/;
  var GLOVE = /^(Gold Glove|Silver Slugger)$/;
  var NFL_SKILL = /^(Quarterback|Running Back|Wide Receiver|Tight End)$/i;

  function decades(e) { return Array.isArray(e.decade) ? e.decade : []; }

  /* The curated icon list, read straight from stars.js. A raw f of 5 is not
     the same thing: the scraped files set it on players nobody curated, and
     reading it as "icon" put second-year tight ends beside Jerry Rice. */
  var ICONS = null;
  function norm(n) { return String(n || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
  function isIcon(e) {
    if (!ICONS) {
      ICONS = {};
      var S = (typeof self !== 'undefined' ? self : this).RTG_STARS;
      if (S) ['NBA', 'NFL', 'MLB'].forEach(function (sp) {
        ((S[sp] && S[sp].icons) || []).forEach(function (n) { ICONS[sp + '|' + norm(n)] = 1; });
      });
    }
    return !!ICONS[e.sport + '|' + norm(e.name)];
  }

  function parts(e) {
    var aw = (e.aw || []), ml = (e.ml || []);
    // Some records carry the Hall of Fame as an award string and no flag.
    var p = { icon: isIcon(e), star: !!e.star, hof: !!e.hof || aw.indexOf('Hall of Fame') !== -1, mvp: 0, big: 0, rook: 0, sel: 0, glove: 0, ml: ml.length ? 1 : 0 };
    for (var i = 0; i < aw.length; i++) {
      var a = String(aw[i]);
      if (LEAGUE_MVP.test(a)) p.mvp = 1;
      else if (BIG.test(a)) p.big++;
      else if (ROOKIE.test(a)) p.rook = 1;
      else if (SELECT.test(a)) p.sel = 2;
      else if (PROBOWL.test(a)) p.sel = Math.max(p.sel, (e.sport !== 'NFL' || NFL_SKILL.test(e.pos || '')) ? 2 : 1);
      else if (GLOVE.test(a)) p.glove = 1;
    }
    return p;
  }

  function score(e) {
    if (!e) return 0;
    var p = parts(e), s = 0;
    if (p.icon) s += 30; else if (p.star) s += 15;
    if (p.hof) s += 30;
    s += p.mvp * 18 + Math.min(p.big, 2) * 6 + p.rook * 5 + (p.sel === 2 ? 9 : p.sel === 1 ? 3 : 0) + p.glove * 3 + p.ml * 8;
    s += Math.min(e.ns | 0, 20) * 0.5;               // up to 10 for a long career
    if (e.dp === 1) s += 5; else if (e.hp) s += 2;
    var d = decades(e), last = d.length ? d[d.length - 1] : 0;
    if (last >= 2020) s += 8; else if (last >= 2010) s += 6; else if (last >= 2000) s += 4; else if (last >= 1990) s += 2;
    if (e.act) s += 3;

    /* Floors. A sum is the wrong shape at the very top: a league MVP, a Hall
       of Famer who was also an All-Star, and a curated star with a headline
       award are household names whatever the rest of the record says. */
    /* The icon list is broader than the word suggests (the NFL one carries
       current starters at every position), so it lifts a player to the top
       only with a headline credential beside it. */
    var credit = p.mvp || p.big || p.hof || p.ml || p.sel === 2;
    var floor = 0;
    if (p.mvp || (p.icon && credit)) floor = 70;
    else if (p.hof && (p.sel || p.big || p.ml)) floor = 60;
    else if ((p.icon || p.star) && (p.big || p.rook) && (d.length && d[d.length - 1] >= 2000)) floor = 56;
    else if (p.hof || p.icon) floor = 40;
    return Math.max(floor, Math.min(100, Math.round(s)));
  }

  function of(e) {
    if (!e) return 0;
    if (typeof e._fame === 'number') return e._fame;
    var v = score(e);
    try { Object.defineProperty(e, '_fame', { value: v, enumerable: false, configurable: true, writable: true }); } catch (x) {}
    return v;
  }

  /* The cut points were read off the corpus, not chosen: 'household' is
     roughly the curated icons plus the MVP and Hall of Fame stars, 'known' the
     All-Star and Pro Bowl regulars, 'solid' the long careers with a credential,
     'deep' everybody else. scripts/check-fame.mjs prints the distribution. */
  var CUT = { household: 55, known: 35, solid: 20 };
  function tier(e) {
    var v = of(e);
    return v >= CUT.household ? 'household' : v >= CUT.known ? 'known' : v >= CUT.solid ? 'solid' : 'deep';
  }

  function rank(list) {
    return (list || []).map(function (e, i) { return { e: e, i: i, f: of(e) }; })
      .sort(function (a, b) { return (b.f - a.f) || (a.i - b.i); })
      .map(function (x) { return x.e; });
  }

  /* THE RAMP every run-style game shares.
   *
   * RTGFame.bandFor(k) -> which fame band question k (0-based) is drawn from.
   *   0 household, 1 known, 2 solid, 3 deep.
   * The first three questions are household names, by the brief. The rest of
   * the opening stays household too, then the run gets harder: a typical run
   * ends somewhere in the teens, so the bands turn over early. Keyed on the
   * question number, not on how long the run could be, because a run is
   * scored on how far it gets and the ramp has to be the same however it ends.
   */
  var ORDER = ['household', 'known', 'solid', 'deep'];
  var STEPS = [8, 16, 28];
  var OPEN = 3, MARQUEE = 70;
  function bandFor(k) { return k < STEPS[0] ? 0 : k < STEPS[1] ? 1 : k < STEPS[2] ? 2 : 3; }

  /* RTGFame.pick(pool, k, rng, skip) -> one entity for question k.
   * Draws from the wanted band, then the next easier, then the next harder,
   * skipping anything skip(e) rejects (already used, unusable this round). The
   * draw within a band uses the caller's rng, so a seeded daily stays the same
   * for everybody. rng returns [0,1). */
  var CACHE = typeof WeakMap === 'function' ? new WeakMap() : null;
  function bandsOf(pool) {
    var b = CACHE && CACHE.get(pool);
    if (b) return b;
    b = [[], [], [], []];
    b.marquee = [];
    pool.forEach(function (e) { b[ORDER.indexOf(tier(e))].push(e); if (of(e) >= MARQUEE) b.marquee.push(e); });
    if (CACHE) CACHE.set(pool, b);
    return b;
  }
  function pick(pool, k, rng, skip) {
    if (!pool || !pool.length) return null;
    rng = rng || Math.random;
    var bands = bandsOf(pool), want = bandFor(k), tryOrder = [];
    // The opening three are the marquee names: league MVPs and the curated
    // icons with a headline credential. A household name is not quite enough
    // to open a run on; Ben Zobrist is one, and he is not the first name
    // anybody should meet.
    if (k < OPEN) tryOrder.push('marquee');
    for (var d = want; d >= 0; d--) tryOrder.push(d);
    for (var u = want + 1; u < 4; u++) tryOrder.push(u);
    for (var t = 0; t < tryOrder.length; t++) {
      var list = bands[tryOrder[t]];
      if (!list.length) continue;
      // a few random tries first (cheap), then a scan, so a band that is
      // mostly used up still yields what is left
      for (var r = 0; r < 12; r++) {
        var e = list[Math.floor(rng() * list.length)];
        if (!skip || !skip(e)) return e;
      }
      var start = Math.floor(rng() * list.length);
      for (var i = 0; i < list.length; i++) {
        var x = list[(start + i) % list.length];
        if (!skip || !skip(x)) return x;
      }
    }
    return null;
  }

  /* n questions in ramp order: pick() run forward with no repeats. */
  function ramp(pool, n, rng) {
    var used = {}, out = [];
    for (var k = 0; k < n; k++) {
      var e = pick(pool, k, rng, function (x) { return used[key(x)]; });
      if (!e) break;
      used[key(e)] = 1; out.push(e);
    }
    return out;
  }
  /* PLAUSIBLE OPTIONS. RTGFame.alike(a, b) -> 0 to 5, how believable b is as
   * a wrong answer beside a: the same era (their decades overlap: 2, or are
   * next to each other: 1), the same position family (2) and the same
   * position (1). Callers keep the league match themselves. An option that
   * scores 0 can be ruled out without knowing anything: a 1950s catcher
   * offered beside a 2010s shortstop. */
  var FAMILY = {
    'NBA|Point Guard': 'G', 'NBA|Shooting Guard': 'G', 'NBA|Guard': 'G',
    'NBA|Small Forward': 'F', 'NBA|Power Forward': 'F', 'NBA|Forward': 'F', 'NBA|Center': 'C',
    'NFL|Quarterback': 'QB', 'NFL|Running Back': 'RB', 'NFL|Fullback': 'RB',
    'NFL|Wide Receiver': 'REC', 'NFL|Tight End': 'REC',
    'NFL|Offensive Lineman': 'OL', 'NFL|Center': 'OL', 'NFL|Defensive Lineman': 'DL', 'NFL|Linebacker': 'LB',
    'NFL|Cornerback': 'DB', 'NFL|Safety': 'DB', 'NFL|Kicker': 'K', 'NFL|Punter': 'K',
    'MLB|Pitcher': 'P', 'MLB|Catcher': 'C', 'MLB|First Baseman': 'IF', 'MLB|Second Baseman': 'IF',
    'MLB|Shortstop': 'IF', 'MLB|Third Baseman': 'IF', 'MLB|Outfielder': 'OF', 'MLB|Center Fielder': 'OF',
    'MLB|Designated Hitter': 'IF'
  };
  function posFamily(e) { return (e && FAMILY[e.sport + '|' + e.pos]) || null; }
  function eraScore(a, b) {
    var da = decades(a), db = decades(b);
    if (!da.length || !db.length) return 1;           // unknown: do not punish
    for (var i = 0; i < da.length; i++) if (db.indexOf(da[i]) !== -1) return 2;
    for (var j = 0; j < da.length; j++) if (db.indexOf(da[j] - 10) !== -1 || db.indexOf(da[j] + 10) !== -1) return 1;
    return 0;
  }
  function alike(a, b) {
    if (!a || !b) return 0;
    var s = eraScore(a, b), fa = posFamily(a), fb = posFamily(b);
    if (fa && fb && fa === fb) s += 2;
    else if (!fa || !fb) s += 1;                      // position unknown on one side
    if (a.pos && b.pos && a.pos === b.pos) s += 1;
    return s;
  }

  function key(e) { return e.id || (e.sport + '|' + e.name); }

  return { of: of, score: score, tier: tier, rank: rank, bandFor: bandFor, pick: pick, ramp: ramp, alike: alike, posFamily: posFamily, eraScore: eraScore, CUT: CUT, STEPS: STEPS, OPEN: OPEN, MARQUEE: MARQUEE };
});
