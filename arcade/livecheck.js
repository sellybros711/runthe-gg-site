/* livecheck.js — grade Sportegories answers that aren't in our corpus.
 *
 * The corpus is 9,400 players and every active pro is in it, so a name that
 * misses is a genuine deep cut — a retired backup, a cup-of-coffee career.
 * Exactly the answer this game exists to reward. It used to be told "No player
 * by that name", which is a lie, and scored as if the player had made it up.
 * This module does the honest thing: ask whether the person exists, pull the
 * facts of their career, and decide whether those facts satisfy the category.
 *
 * Three outcomes, and the middle one matters most:
 *
 *   true   the facts confirm the category  -> score it
 *   false  the facts contradict it         -> no points, "doesn't fit"
 *   null   we can't tell from the facts    -> no points, and we SAY so
 *
 * null is not a failure mode, it's the design. Wikidata knows who a player
 * played for; it does not know that they have 300 career home runs, and it
 * lists maybe a third of the All-Star selections that actually happened. If an
 * unverifiable category scored on the honour system, every stat and award
 * category in the game would be worth free points to anyone who typed any real
 * athlete's name. So we only award points we can stand behind, and we tell the
 * player which of the two reasons they got nothing.
 *
 * Absence of evidence is treated as absence of evidence throughout: a missing
 * award claim returns null, not false. The only negatives we trust are ones
 * where the data we do have positively contradicts the category.
 *
 * Network lives here too, but injectable (setFetch) so the whole file runs in
 * node without one.
 */
(function (root, factory) {
  var mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.RTG_LIVECHECK = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ENDPOINT = '/api/player-check';
  var _fetch = null;
  var _now = null;                 // test seam for "is this player active"
  var _engine = null;              // node has no window to find RTG_SPORTEGORIES on

  function fetchFn() {
    if (_fetch) return _fetch;
    if (typeof fetch === 'function') return fetch;
    return null;
  }
  function year() { return _now || new Date().getUTCFullYear(); }

  // ---------- text ----------
  function norm(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function tokensOf(s) { var n = norm(s); return n ? n.split(' ') : []; }
  /* Does `a` start with all of `b`'s tokens? Token-wise so "illinois" matches
   * "illinois urbana champaign" but not "illinoisan". */
  function tokenPrefix(a, b) {
    if (!a.length || !b.length || b.length > a.length) return false;
    for (var i = 0; i < b.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  // ---------- vocab, derived from the game's own data ----------
  /* Every mapping below is built from sportegories-data.js rather than typed
   * out, so it can never drift from the corpus it has to agree with. */
  var V = null;
  function vocab(D) {
    if (V && V.D === D) return V;
    var teamSport = {}, teamCanon = {}, colByCore = {}, posCanon = {};
    D.teams.forEach(function (t) { teamCanon[norm(t)] = t; });
    /* Relocations and renames, from the generator's own map (D.alias). An
       outside player's profile names the franchise as it was at the time, so a
       Rams career comes back as "St. Louis Rams" and the corpus now only knows
       "Rams". Without this the team is unrecognised and silently dropped, which
       reads as "we cannot tell" on a category the player has clearly met. */
    var AL = D.alias || {};
    Object.keys(AL).forEach(function (old) { teamCanon[norm(old)] = AL[old]; });
    // team -> league, counted across the corpus so a shared name resolves to
    // whichever league actually uses it
    var tally = {};
    D.players.forEach(function (r) {
      var sp = D.sports[r[1]];
      r[3].forEach(function (x) {
        var t = D.teams[x]; if (!t) return;
        (tally[t] = tally[t] || {})[sp] = (tally[t][sp] || 0) + 1;
      });
    });
    Object.keys(tally).forEach(function (t) {
      var best = null, n = -1;
      for (var s in tally[t]) if (tally[t][s] > n) { n = tally[t][s]; best = s; }
      teamSport[norm(t)] = best;
    });
    D.cols.forEach(function (c) {
      var k = colCore(c);
      (colByCore[k] = colByCore[k] || []).push(c);
    });
    D.pos.forEach(function (p) { posCanon[norm(p)] = p; });
    V = { D: D, teamSport: teamSport, teamCanon: teamCanon, colByCore: colByCore, posCanon: posCanon };
    return V;
  }

  /* College names are the one place our vocab and the outside world disagree
   * hard: we say "Illinois", the world says "University of Illinois Urbana-
   * Champaign". Reduce both to a core and match by token prefix. */
  function colCore(s) {
    var n = norm(s)
      .replace(/^the /, '')
      .replace(/^university of /, '')
      .replace(/ university$/, '')
      .replace(/ college$/, '')
      .replace(/ cc$/, '')
      .replace(/ community$/, '')
      .replace(/^univ /, '');
    return n.trim();
  }
  /* Abbreviations and nicknames our data uses that no reduction will reach. */
  var COL_ALIAS = {
    'southern california': ['USC', 'Southern California'],
    'usc': ['USC', 'Southern California'],
    'louisiana state': ['LSU', 'Louisiana State'],
    'lsu': ['LSU', 'Louisiana State'],
    'brigham young': ['BYU', 'Brigham Young'],
    'byu': ['BYU', 'Brigham Young'],
    'texas christian': ['TCU', 'Texas Christian'],
    'tcu': ['TCU', 'Texas Christian'],
    'central florida': ['UCF', 'Central Florida'],
    'ucf': ['UCF', 'Central Florida'],
    'mississippi': ['Mississippi', 'Ole Miss'],
    'ole miss': ['Mississippi', 'Ole Miss'],
    'pittsburgh': ['Pittsburgh', 'Pitt'],
    'pitt': ['Pittsburgh', 'Pitt'],
    'connecticut': ['Connecticut', 'UConn'],
    'uconn': ['Connecticut', 'UConn'],
    'southern methodist': ['SMU', 'Southern Methodist'],
    'smu': ['SMU', 'Southern Methodist'],
    'nevada las vegas': ['UNLV', 'Nevada-Las Vegas'],
    'unlv': ['UNLV', 'Nevada-Las Vegas'],
    'california los angeles': ['UCLA'],
    'ucla': ['UCLA'],
    'miami': ['Miami', 'Miami (FL)', 'Miami (Fla.)'],
    'california berkeley': ['California', 'Cal'],
    'texas at austin': ['Texas'],
    'texas austin': ['Texas'],
    'north carolina at chapel hill': ['North Carolina'],
    'north carolina chapel hill': ['North Carolina'],
    'illinois urbana champaign': ['Illinois'],
    'michigan ann arbor': ['Michigan'],
    'wisconsin madison': ['Wisconsin'],
    'minnesota twin cities': ['Minnesota'],
    'washington seattle': ['Washington'],
    'colorado boulder': ['Colorado'],
    'massachusetts amherst': ['Massachusetts', 'UMass'],
    'nebraska lincoln': ['Nebraska'],
    'missouri columbia': ['Missouri'],
    'arkansas fayetteville': ['Arkansas'],
    'tennessee knoxville': ['Tennessee'],
    'kentucky lexington': ['Kentucky'],
    'oklahoma norman': ['Oklahoma'],
    'florida gainesville': ['Florida'],
    'georgia athens': ['Georgia'],
    'alabama tuscaloosa': ['Alabama'],
    'iowa iowa city': ['Iowa'],
    'kansas lawrence': ['Kansas'],
    'oregon eugene': ['Oregon'],
    'arizona tucson': ['Arizona'],
    'utah salt lake city': ['Utah']
  };

  /* Which of our vocab colleges could this outside label mean? Returns every
   * plausible entry, not one guess — the predicate only needs to know whether
   * its own answer is in the set, so ambiguity between "Miami" and "Miami (FL)"
   * costs nothing. */
  function collegesFor(label, vb) {
    var core = colCore(label);
    if (!core) return [];
    if (COL_ALIAS[core]) {
      return COL_ALIAS[core].filter(function (c) { return vb.colByCore[colCore(c)]; })
        .concat(vb.colByCore[core] || []).filter(uniq);
    }
    if (vb.colByCore[core]) return vb.colByCore[core].slice();
    // token-prefix: "illinois urbana champaign" -> "Illinois"
    var toks = core.split(' '), out = [];
    Object.keys(vb.colByCore).forEach(function (k) {
      if (k && tokenPrefix(toks, k.split(' '))) out = out.concat(vb.colByCore[k]);
    });
    return out.filter(uniq);
  }
  function uniq(v, i, a) { return a.indexOf(v) === i; }

  /* Positions. Wikidata is finer-grained than we are (it says "defensive end",
   * we say "Defensive Lineman"), so fold its vocabulary into ours. */
  var POS_ALIAS = {
    'defensive end': 'Defensive Lineman', 'defensive tackle': 'Defensive Lineman',
    'nose tackle': 'Defensive Lineman', 'edge rusher': 'Defensive Lineman',
    'offensive tackle': 'Offensive Lineman', 'offensive guard': 'Offensive Lineman',
    'tackle': 'Offensive Lineman', 'guard american football': 'Offensive Lineman',
    'center american football': 'Offensive Lineman', 'long snapper': 'Offensive Lineman',
    'left fielder': 'Outfielder', 'right fielder': 'Outfielder', 'center fielder': 'Outfielder',
    'starting pitcher': 'Pitcher', 'relief pitcher': 'Pitcher', 'closer': 'Pitcher',
    'placekicker': 'Kicker', 'place kicker': 'Kicker',
    'strong safety': 'Safety', 'free safety': 'Safety', 'defensive back': 'Safety',
    'inside linebacker': 'Linebacker', 'outside linebacker': 'Linebacker',
    'middle linebacker': 'Linebacker',
    'halfback': 'Running Back', 'tailback': 'Running Back',
    'wide receiver': 'Wide Receiver', 'split end': 'Wide Receiver', 'flanker': 'Wide Receiver',
    'combo guard': 'Guard', 'swingman': 'Forward', 'stretch four': 'Power Forward',
    'centre basketball': 'Center', 'goalkeeper': 'Goaltender', 'goalie': 'Goaltender'
  };
  function positionsFor(labels, vb) {
    var out = [];
    labels.forEach(function (l) {
      var n = norm(l);
      if (POS_ALIAS[n]) out.push(POS_ALIAS[n]);
      else if (vb.posCanon[n]) out.push(vb.posCanon[n]);
    });
    return out.filter(uniq);
  }

  /* Awards. Wikidata's names are formal; ours are how fans say them. */
  var AWARD_RULES = [
    [/hall of fame/, 'Hall of Fame'],
    [/nba.*most valuable player|most valuable player.*nba/, 'NBA MVP'],
    [/nba finals most valuable player|finals mvp/, 'Finals MVP'],
    [/nba all-?star/, 'NBA All-Star'],
    [/nba defensive player of the year/, 'Defensive Player of the Year'],
    [/nba rookie of the year/, 'Rookie of the Year'],
    [/(ap |nfl )?(most valuable player).*(nfl|football)|nfl most valuable player/, 'NFL MVP'],
    [/super bowl most valuable player|super bowl mvp/, 'Super Bowl MVP'],
    [/pro bowl/, 'Pro Bowl'],
    [/nfl offensive player of the year/, 'Offensive Player of the Year'],
    [/nfl defensive player of the year/, 'Defensive Player of the Year'],
    [/offensive rookie of the year/, 'Offensive Rookie of the Year'],
    [/defensive rookie of the year/, 'Defensive Rookie of the Year'],
    [/cy young/, 'Cy Young'],
    [/gold glove/, 'Gold Glove'],
    [/silver slugger/, 'Silver Slugger'],
    [/world series most valuable player|world series mvp/, 'World Series MVP'],
    [/(mlb|major league baseball).*most valuable player/, 'MLB MVP'],
    [/(mlb|major league baseball) all-?star|all-?star game.*baseball/, 'MLB All-Star'],
    [/rookie of the year/, 'Rookie of the Year']
  ];
  function awardsFor(labels) {
    var out = [];
    labels.forEach(function (l) {
      var n = norm(l).replace(/ /g, ' ');
      for (var i = 0; i < AWARD_RULES.length; i++) {
        if (AWARD_RULES[i][0].test(n)) { out.push(AWARD_RULES[i][1]); return; }
      }
    });
    return out.filter(uniq);
  }

  /* Sport, from the leagues the recognised teams belong to. Occupation labels
   * are only a fallback: "basketball player" is true of a EuroLeague player
   * too, and our tag means the league, not the game. */
  var OCC_SPORT = {
    'basketball player': 'NBA', 'american football player': 'NFL',
    'baseball player': 'MLB', 'ice hockey player': 'NHL',
    'association football player': 'Soccer', 'tennis player': 'Tennis',
    'golfer': 'Golf', 'boxer': 'Boxing', 'racing driver': null,
    'mixed martial artist': 'UFC', 'professional wrestler': 'Pro Wrestling'
  };

  // ---------- the shaped view of one outside player ----------
  function shape(profile, D) {
    var vb = vocab(D);
    var teams = [], stints = [];
    (profile.teams || []).forEach(function (t) {
      var canon = vb.teamCanon[norm(t.name)];
      if (!canon) return;                       // college/national/youth sides drop out here
      if (teams.indexOf(canon) < 0) teams.push(canon);
      stints.push({ team: canon, start: t.start, end: t.end, sport: vb.teamSport[norm(canon)] || null });
    });
    var sports = [];
    stints.forEach(function (s) { if (s.sport && sports.indexOf(s.sport) < 0) sports.push(s.sport); });
    var occSports = [];
    (profile.occupations || []).concat(profile.sports || []).forEach(function (o) {
      var s = OCC_SPORT[norm(o)];
      if (s && occSports.indexOf(s) < 0) occSports.push(s);
    });
    var colleges = [];
    (profile.colleges || []).forEach(function (c) { colleges = colleges.concat(collegesFor(c, vb)); });
    return {
      name: profile.name || '',
      teams: teams, stints: stints, sports: sports, occSports: occSports,
      positions: positionsFor(profile.positions || [], vb),
      hadPositions: (profile.positions || []).length > 0,
      colleges: colleges.filter(uniq),
      hadColleges: (profile.colleges || []).length > 0,
      awards: awardsFor(profile.awards || []),
      died: !!profile.died,
      // undefined when the source doesn't know; only the register asserts it
      active: (typeof profile.active === 'boolean') ? profile.active : null
    };
  }

  function decadesOf(s) {
    var out = {};
    s.stints.forEach(function (st) {
      if (st.start == null) return;
      var end = st.end == null ? st.start : st.end;
      for (var y = Math.floor(st.start / 10) * 10; y <= end; y += 10) out[y] = 1;
    });
    return Object.keys(out).map(Number);
  }
  function datedStints(s) { return s.stints.filter(function (st) { return st.start != null; }); }

  /* Positions come in at two grains. Basketball-Reference records a career as
     G / F / C, MLB's StatsAPI says "Outfielder", and the categories ask for
     "Point Guard" and "Left Fielder". Knowing someone is a guard neither proves
     nor disproves that he is a point guard, so:
       exact match                          -> true
       we know the specific, want the broad -> true   (a point guard IS a guard)
       we know the broad, want a specific   -> null   (say so, don't guess)
     Anything else is a real contradiction and stays false. */
  var POS_FAMILY = {
    'Guard': ['Point Guard', 'Shooting Guard'],
    'Forward': ['Small Forward', 'Power Forward'],
    'Outfielder': ['Left Fielder', 'Center Fielder', 'Right Fielder'],
    'Pitcher': ['Starting Pitcher', 'Relief Pitcher'],
    'Offensive Lineman': ['Offensive Tackle'],
    'Defensive Lineman': ['Defensive End', 'Defensive Tackle'],
    'Kicker': ['Place Kicker']
  };
  function posMatch(known, want) {
    if (known.indexOf(want) >= 0) return true;
    var kids = POS_FAMILY[want];
    // want is the broad one: any specific we hold under it confirms it
    if (kids) for (var i = 0; i < kids.length; i++) if (known.indexOf(kids[i]) >= 0) return true;
    // want is a specific: holding only its family is not an answer either way
    for (var fam in POS_FAMILY) {
      if (POS_FAMILY[fam].indexOf(want) >= 0 && known.indexOf(fam) >= 0) return null;
    }
    return false;
  }

  // ---------- the verdict ----------
  /* true / false / null, where null means "the facts we have don't settle it". */
  /* Which predicates can be given the benefit of the doubt, and which cannot.
     A gap on a POSITION or a COLLEGE means we hold partial evidence and simply
     cannot resolve the last step — we know he is a guard, the category wants a
     shooting guard. A gap on an AWARD means the opposite: award data is so
     incomplete that those predicates are confirm-only by design, so `null` is
     their normal state and accepting it would hand a free point to any real
     player for "Hall of Fame Center". Same for stats. */
  var SOFT_GAP = { pos: 1, col: 1, conf: 1, team: 1, teams: 1, teamsMax: 1, teamsExact: 1, decades: 1, act: 1 };
  /* The roster-shaped predicates. Their `null` does not mean "we know nothing":
     it means "the roster we have cannot refute this", which is worth something
     when there IS a roster and nothing at all when there isn't. */
  var ROSTER_PRED = { teams: 1, teamsMax: 1, teamsExact: 1 };

  function verdict(s, pr, gaps) {
    if (pr.all) {
      var unknown = false;
      for (var i = 0; i < pr.all.length; i++) {
        var v = verdict(s, pr.all[i], gaps);
        if (v === false) return false;          // one contradiction sinks the whole clause
        if (v === null) unknown = true;
      }
      return unknown ? null : true;
    }
    if (gaps) gaps.seen = (gaps.seen || 0) + 1;
    var _v = predicate(s, pr);
    if (_v === null && gaps) {
      (gaps.kinds || (gaps.kinds = [])).push(pr.k);
      /* Evidence only when the roster we pulled AGREES with the claim. A roster
         SHORTER than the claim is not evidence for it: David Robinson comes
         back with one franchise, and one franchise is not two. */
      if (ROSTER_PRED[pr.k] && s.teams && s.teams.length) {
        var rn = s.teams.length, fits =
          pr.k === 'teamsExact' ? (rn === pr.n) :
          pr.k === 'teamsMax'   ? (rn <= pr.max) :
                                  (rn >= (pr.min || 0));
        if (fits) gaps.solid = true;
      }
    }
    if (_v === true && gaps) gaps.confirmed = (gaps.confirmed || 0) + 1;
    return _v;
  }

  /* Whether an unresolved clause deserves the point anyway: every gap has to be
     a soft one, and we must have positively confirmed something else about the
     player — otherwise "real athlete" alone would satisfy any category. */
  function softPass(gaps) {
    if (!gaps || !gaps.kinds || !gaps.kinds.length) return false;
    /* "Confirmed something else" is the right guard for a multi-clause
       category and impossible for a single-clause one: there IS no other
       clause to confirm. "Played for exactly two franchises" is one predicate,
       so every correct answer outside our file was told we could not verify it
       - which is what Rodney Stuckey (Pistons, Pacers) got.
       A pulled roster counts as the evidence instead. Not a free pass: an empty
       roster still fails, and a roster LONGER than the category allows is
       refuted outright a few lines up. */
    if (!gaps.confirmed && !gaps.solid) return false;
    for (var i = 0; i < gaps.kinds.length; i++) if (!SOFT_GAP[gaps.kinds[i]]) return false;
    return true;
  }

  function predicate(s, pr) {
    switch (pr.k) {
      case 'sport':
        if (s.sports.length) return s.sports.indexOf(pr.v) >= 0;
        if (s.occSports.length) return s.occSports.indexOf(pr.v) >= 0 ? true : false;
        return null;

      case 'team':
        // A negative here is trustworthy only once we've seen a real roster.
        return s.teams.length ? s.teams.indexOf(pr.v) >= 0 : null;

      case 'pos':
        if (s.positions.length) return posMatch(s.positions, pr.v);
        return null;

      case 'col':
        if (s.colleges.length) return s.colleges.indexOf(pr.v) >= 0;
        return null;

      case 'conf': {
        if (!s.colleges.length || !V) return null;
        var list = V.D.conf[pr.v] || [];
        return s.colleges.some(function (c) { return list.indexOf(c) >= 0; });
      }

      case 'award':
        // Award lists are chronically incomplete out there — a Pro Bowl that
        // isn't listed didn't not happen. Confirm, never deny.
        return s.awards.indexOf(pr.v) >= 0 ? true : null;
      case 'awardRe':
        return s.awards.some(function (a) { return a.indexOf(pr.v) >= 0; }) ? true : null;

      case 'teams':
        // Rosters under-report, they don't over-report: enough teams proves the
        // claim, too few proves nothing.
        return s.teams.length >= pr.min ? true : null;

      case 'teamsMax':
        // "Never left one franchise" is a claim about a complete career, which
        // is exactly what we can't establish. We can only refute it.
        return s.teams.length > pr.max ? false : null;

      case 'teamsExact':
        // Same asymmetry: rosters under-report, so seeing n proves nothing on
        // its own, but seeing more than n settles it.
        return s.teams.length > pr.n ? false : null;

      case 'decade': {
        var ds = decadesOf(s);
        return ds.indexOf(pr.v) >= 0 ? true : null;
      }
      case 'decades':
        return decadesOf(s).length >= pr.min ? true : null;

      case 'act': {
        if (s.died) return false;
        // A source that actually knows beats any inference from stint dates —
        // a long tenure with no end date is not evidence of retirement.
        if (s.active !== null && s.active !== undefined) return s.active;
        /* Read the LATEST stint, not any stint. An open-ended spell is the
           source saying "still there" however long ago it began; anchoring on
           the start date instead made a long tenure look like a retirement. */
        var dated = datedStints(s);
        if (!dated.length) return null;
        var latest = dated.reduce(function (a, b) { return b.start > a.start ? b : a; });
        if (latest.end == null) return true;
        if (latest.end < year() - 3) return false;      // demonstrably retired
        return null;
      }

      // No public structured source settles these, so we never pretend to.
      case 'stat': return null;
      case 'draft1': return null;
      default: return null;
    }
  }

  // ---------- network ----------
  var cache = Object.create(null);

  /* Our own register, turned into the same profile shape the endpoint returns,
     so shape()/verdict() below don't care where the facts came from.

     One real difference: the register holds a career span, not per-team dates.
     That is exactly right for "played in the 2010s" and for counting teams, and
     it is why an active player's last stint is left open-ended — otherwise a
     current player would read as retired. */
  var OCC_OF = { NFL: 'American football player', MLB: 'baseball player', NBA: 'basketball player' };
  function split(v) { return String(v == null ? '' : v).split('|').filter(Boolean); }

  function fromRegister(rows) {
    var byKey = {};
    rows.forEach(function (r) {
      var teams = split(r.teams).map(function (t) {
        return { name: t, start: r.first_season || null, end: r.active ? null : (r.last_season || null) };
      });
      var prof = {
        found: true, name: r.name, source: 'register',
        occupations: [OCC_OF[r.sport]].filter(Boolean),
        // pos and college are '|'-joined for the same reason teams is: a swingman
        // is listed "F-C" and a transfer went to two schools, and both facts
        // matter when the answer is graded.
        sports: [], positions: split(r.pos), colleges: split(r.college),
        awards: [],                       // the register carries no honours
        teams: teams, died: false,
        active: !!r.active               // known, not inferred from stint dates
      };
      // Two players can share a key; keep whichever we know the most about.
      var cur = byKey[r.name_key];
      if (!cur || teams.length > cur.teams.length) byKey[r.name_key] = prof;
    });
    return byKey;
  }

  /* Every unresolved answer is a hole in the register with a name on it, and
     the player just told us where it is. Fire-and-forget: the game never waits
     on this and never shows an error for it — a failed report must not cost
     anyone a point. Dedup per session so one card can't spam a category. */
  var _sent = {};
  function D_LABEL(i) {
    try {
      var SP = _engine || (typeof window !== 'undefined' && window.RTG_SPORTEGORIES) || null;
      var D = SP && SP.data();
      return (D && D.cats[i] && D.cats[i].l) || String(i);
    } catch (e) { return String(i); }
  }
  var _reportUrl = '/api/answer-gap';
  function setReportUrl(u) { _reportUrl = u; }
  function report(text, puz, i, kind, gapKinds) {
    try {
      var cat = puz && puz.cats && puz.cats[i];
      var k = kind + '|' + String(text).toLowerCase() + '|' + (cat ? cat.i : '?');
      if (_sent[k]) return; _sent[k] = 1;
      var row = {
        answer: String(text || '').slice(0, 60),
        category: cat && D_LABEL(cat.i),
        letter: puz ? puz.letter : null,
        kind: kind,                         // 'soft' (counted) or 'unverified' (not)
        gaps: (gapKinds || []).slice(0, 6).join(',')
      };
      // board.js already holds the anon key and the REST base, so there is no
      // second endpoint to keep alive; the fallback is only for tests.
      var B = (typeof window !== 'undefined' && window.RTG_BOARD) || null;
      if (B && B.logGap) { B.logGap(row); return; }
      var f = fetchFn(); if (!f) return;
      f(_reportUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(row) })['catch'](function () {});
    } catch (e) {}
  }

  function lookup(names) {
    var want = [], out = {};
    names.forEach(function (n) {
      var k = String(n || '').trim().toLowerCase().replace(/\s+/g, ' ');
      if (!k) return;
      if (k in cache) out[k] = cache[k];
      else if (want.indexOf(k) < 0) want.push(n);
    });
    if (!want.length) return Promise.resolve(out);

    /* Ask our own register first. It is complete, structured, first-party and
       one hop away; Wikidata is the fallback for whatever it has never heard
       of (other leagues, college-only careers, the genuinely obscure). */
    return ours(want).then(function (hit) {
      var left = want.filter(function (n) {
        var k = norm2(n);
        if (hit[k]) { cache[k] = hit[k]; out[k] = hit[k]; return false; }
        return true;
      });
      if (!left.length) return out;
      return wiki(left, out);
    });
  }

  function norm2(n) { return String(n || '').trim().toLowerCase().replace(/\s+/g, ' '); }

  /* name -> the "first|last" key the register is indexed on, matching
     keyOf() in sportegories.js so both sides agree on what a name is. */
  function regKey(n) {
    var SUF = { jr: 1, sr: 1, ii: 1, iii: 1, iv: 1, v: 1 };
    var t = String(n || '').trim().split(/\s+/)
      .map(function (x) { return norm(x).replace(/ /g, ''); }).filter(Boolean);
    while (t.length > 2 && SUF[t[t.length - 1]]) t.pop();
    if (!t.length) return null;
    return t.length === 1 ? t[0] + '|' + t[0] : t[0] + '|' + t[t.length - 1];
  }

  function ours(names) {
    var B = (typeof window !== 'undefined' && window.RTG_BOARD) || null;
    if (!B || !B.registerLookup) return Promise.resolve({});
    var keys = [], back = {};
    names.forEach(function (n) { var k = regKey(n); if (k) { keys.push(k); back[k] = n; } });
    if (!keys.length) return Promise.resolve({});
    return B.registerLookup(keys).then(function (rows) {
      var byKey = fromRegister(rows || []), out = {};
      Object.keys(byKey).forEach(function (k) {
        if (back[k]) out[norm2(back[k])] = byKey[k];
      });
      return out;
    })['catch'](function () { return {}; });
  }

  function wiki(want, out) {
    var f = fetchFn();
    if (!f) return Promise.resolve(out);
    return f(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ names: want })
    }).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    }).then(function (j) {
      var ps = (j && j.players) || {};
      for (var k in ps) { cache[k] = ps[k]; out[k] = ps[k]; }
      return out;
    }).catch(function () { return out; });   // fail soft: caller keeps its corpus verdict
  }

  // ---------- grading an unknown answer ----------
  /* pending: [{ i, text }] — the answers check() flagged as live:true.
   * Resolves to { <i>: result } in the same shape check() returns, so the game
   * can drop them straight into its results array. */
  function resolve(puz, pending, usedNames) {
    var SP = _engine ||
             (typeof window !== 'undefined' && window.RTG_SPORTEGORIES) ||
             (typeof root !== 'undefined' && root.RTG_SPORTEGORIES) || null;
    if (!SP || !pending || !pending.length) return Promise.resolve({});
    var D = SP.data();
    if (!D) return Promise.resolve({});
    var used = usedNames || {};

    return lookup(pending.map(function (p) { return p.text; })).then(function (map) {
      var out = {};
      pending.forEach(function (p) {
        var key = String(p.text || '').trim().toLowerCase().replace(/\s+/g, ' ');
        var prof = map[key];
        if (!prof || !prof.found) {
          // Not "no player by that name" — we don't get to declare who exists.
          // We looked in two places and came up empty; a typo is the likeliest
          // reason, so point at that instead of at the player.
          out[p.i] = { ok: false, reason: 'unknown', live: 'missing',
            msg: 'Couldn’t find them — check the spelling?' };
          return;
        }
        var s = shape(prof, D);
        var nk = norm(s.name || p.text);
        if (used[nk]) {
          out[p.i] = { ok: false, reason: 'dup', live: 'dup', msg: 'Already used this player.' };
          return;
        }
        var gaps = {};
        var v = verdict(s, D.cats[puz.cats[p.i].i].p, gaps);
        if (v === false) {
          out[p.i] = { ok: false, reason: 'category', live: 'no',
            msg: 'Doesn’t fit this category.' };
          return;
        }
        /* Scoring nothing for an answer that is probably right is the worst of
           the three outcomes: it reads as the game being broken, and it is our
           data that fell short, not the player's knowledge. So when every gap
           is a soft one and we confirmed something else about them, give the
           point — and record it, because that answer is exactly the row the
           register is missing. */
        if (v === null && softPass(gaps)) {
          var mk = SP.letterHits(puz, p.text);
          used[nk] = 1;
          out[p.i] = {
            ok: true, live: 'soft', unverified: true,
            player: { idx: -1, name: s.name || p.text, sport: s.sports[0] || s.occSports[0] || null, f: 0, key: nk },
            base: mk, allit: mk, points: mk,
            rarity: { pct: 20, bonus: 0, tier: 'Counted', est: true, live: true },
            msg: 'Counted — we couldn’t double-check this one.'
          };
          report(p.text, puz, p.i, 'soft', gaps.kinds);
          return;
        }
        if (v === null) {
          out[p.i] = { ok: false, reason: 'unverified', live: 'maybe',
            msg: 'Real player — we couldn’t verify this category.' };
          report(p.text, puz, p.i, 'unverified', gaps.kinds);
          return;
        }
        used[nk] = 1;                           // two of these can't be the same person either
        var m = SP.letterHits(puz, p.text);     // letter rule was already passed
        // Outside the corpus is, by definition, off the beaten path: a verified
        // answer nobody's file has scores as rare.
        var rar = { pct: 2, bonus: 2, tier: 'Rare', est: true, live: true };
        out[p.i] = {
          ok: true, live: 'yes',
          player: { idx: -1, name: s.name || p.text, sport: s.sports[0] || s.occSports[0] || null, f: 0, key: nk },
          base: m, allit: m, rarity: rar, points: m + rar.bonus
        };
      });
      return out;
    });
  }

  return {
    softPass: softPass, setReportUrl: setReportUrl,
    resolve: resolve, lookup: lookup, verdict: verdict, shape: shape,
    collegesFor: collegesFor, colCore: colCore,
    setFetch: function (f) { _fetch = f; },
    setEngine: function (e) { _engine = e; },
    setYear: function (y) { _now = y; },
    setEndpoint: function (u) { ENDPOINT = u; },
    clearCache: function () { cache = Object.create(null); }
  };
});
