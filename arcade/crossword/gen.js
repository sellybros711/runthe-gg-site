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
 * browser; Node callers pass the corpus as forDate's 2nd arg).
 *
 * CLUES NAME NOBODY. Not the surname (that is the answer) and, since this
 * rewrite, not the given name either. "Hank ___, who broke the home run
 * record in 1974" is not a clue, it is a fill-in-the-blank with the answer
 * printed beside it: the solver reads "Hank" and writes AARON without ever
 * meeting the trivia. So a clue is now a description that has to be SOLVED,
 * "Braves slugger who broke the home run record in 1974 under a mountain of
 * hate mail", built from a team-and-role anchor plus either a hand-written
 * moment (cluebank.js) or the player's own facts.
 *
 * Dropping the given name makes every same-surname player a rival, not just
 * the ones who share a first name, so the clue keeps gaining facts (jersey,
 * era, team, position) until it fits the chosen player ONLY. A clue two
 * players could wear is rejected outright.
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
  function hasTeam(x, n) {
    return (x.t || []).some(function (t) { return nick(t) === n; });
  }
  function factsFit(x, used) {
    if (used.sport && x.sport !== used.sport) return false;
    if (used.hof && !x.hof) return false;
    if (used.team && !hasTeam(x, used.team)) return false;
    if (used.jersey != null && (x.j || []).indexOf(used.jersey) < 0) return false;
    if (used.era != null && (x.decade || []).indexOf(used.era) < 0) return false;
    if (used.pos && x.pos !== used.pos) return false;
    // a career path: the rival has to have worn every club the clue lists
    if (used.teams && !used.teams.every(function (n) { return hasTeam(x, n); })) return false;
    // one club, and only that one
    if (used.only && ((x.t || []).length !== 1 || nick(x.t[0]) !== used.only)) return false;
    if (used.col && colKey(x.col) !== used.col) return false;
    return true;
  }
  // colleges are spelled several ways across the sources ("Miami (FL)", "Ole
  // Miss"); compare on a stripped key, the way Alma Mater does
  function colKey(c) {
    return c ? String(c).toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z]/g, '') : null;
  }
  function ambiguous(used, rivals) {
    for (var i = 0; i < rivals.length; i++) if (factsFit(rivals[i], used)) return true;
    return false;
  }
  function merge(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; for (k in b) o[k] = b[k]; return o; }

  /* one base template + escalating disambiguators; null if a rival still fits.
     The extra facts are appended as plain comma clauses, the way a real
     crossword narrows a clue ("Dodgers second baseman, All-Star of the 1980s"),
     rather than the old bracketed shorthand. */
  function tryDisambig(cand, e, rivals, surname) {
    var text = cand.t, used = merge(cand.used, {});
    var jersey = (e.j && e.j.length) ? e.j[e.j.length - 1] : null;
    var dec = primaryDecade(e);
    var tn = (e.t && e.t[0]) ? nick(e.t[0]) : null;
    var guard = 0;
    while (ambiguous(used, rivals) && guard++ < 5) {
      if (tn && !used.team) { text += ', of the ' + tn; used.team = tn; continue; }
      if (dec != null && used.era == null) { text += ', ' + eraStr(dec); used.era = dec; continue; }
      if (e.pos && !used.pos) { text += ', a ' + e.pos.toLowerCase(); used.pos = e.pos; continue; }
      if (jersey != null && used.jersey == null) { text += ', who wore ' + jersey; used.jersey = jersey; continue; }
      if (e.col && !used.col) { text += ', out of ' + colName(e.col); used.col = colKey(e.col); continue; }
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
  // A clue is an ANCHOR plus a FACT. The anchor says who we are looking at in
  // the language a fan uses ("Braves slugger", "Bulls Hall of Famer", "Chargers
  // center"); the fact is either a hand-written moment from cluebank.js or the
  // player's own record. Nobody is named: the surname is the answer, and the
  // given name used to be printed right next to it.
  // ---- accolades: a player is only a valid answer if they have a real
  // distinction (award / All-Pro / All-Star / champion / HOF / milestone), and
  // the clue names it. Sources: entity.aw + entity.ml + awards.js (RTG_AWARDS).
  function awardsOf(e) {
    var out = (e.aw && e.aw.length) ? e.aw.slice() : [];
    try {
      var A = root && root.RTG_AWARDS;
      if (A && A.players && e.name) {
        var rec = A.players[e.sport + '|' + String(e.name).toLowerCase()];
        if (rec && rec.aw && rec.aw.length) out = out.concat(rec.aw);
      }
    } catch (x) {}
    return out;
  }
  // The single most impressive award, phrased to read as a noun in an anchor:
  // "Braves MVP", "Yankees Gold Glove winner".
  var AWARD_RANK = [
    [/finals mvp/i, 'Finals MVP'], [/super bowl mvp/i, 'Super Bowl MVP'], [/world series mvp/i, 'World Series MVP'],
    [/\bmvp\b/i, 'MVP'], [/cy young/i, 'Cy Young winner'], [/defensive player/i, 'Defensive Player of the Year'],
    [/all-?pro/i, 'All-Pro'], [/pro bowl/i, 'Pro Bowler'], [/all-?star/i, 'All-Star'],
    [/gold glove/i, 'Gold Glove winner'], [/silver slugger/i, 'Silver Slugger'],
    [/rookie of the year/i, 'Rookie of the Year'], [/champion|title|world series|super bowl|finals/i, 'champion']
  ];
  function awardPhrase(e) {
    var a = awardsOf(e);
    for (var i = 0; i < AWARD_RANK.length; i++)
      for (var j = 0; j < a.length; j++)
        if (AWARD_RANK[i][0].test(a[j])) return AWARD_RANK[i][1];
    return null;
  }
  // Eligible as a crossword answer only with a genuine distinction.
  function hasDistinction(e) {
    return !!(e && (e.hof || (e.ml && e.ml.length) || awardPhrase(e)));
  }

  /* A hand-written predicate from cluebank.js ("who broke the home run record
     in 1974 under a mountain of hate mail"), when this player has one. Returned
     raw so the caller can hang it off an anchor.

     These skip the rival-disambiguation walk on purpose: that machinery exists
     to stop two same-surname players from wearing the same fact list, and a
     clue naming one specific moment can only ever describe one of them. The
     bank's own validator guarantees the surname never appears in the text. */
  function curatedPredicate(e, rng) {
    try {
      var B = root && root.RTG_CLUES;
      if (!B || !B.has(e.sport, e.name)) return null;
      var list = B.get(e.sport, e.name);
      if (!list.length) return null;
      var pick = rng ? Math.floor(rng() * list.length) : 0;
      return list[pick].x;
    } catch (x) { return null; }
  }
  function hasCurated(e) {
    try { return !!(root && root.RTG_CLUES && e && root.RTG_CLUES.has(e.sport, e.name)); }
    catch (x) { return false; }
  }

  /* The anchors a clue can open with, richest first. Each carries the facts it
     states so the rival check can prove no second player wears the same set.
     "Braves Hall of Famer", "Chargers center", "MLB Gold Glove winner". */
  /* THE SHAPES A CLUE CAN TAKE.
   *
   * "Chargers offensive lineman and Pro Bowler of the 2000s" is true, unique in
   * our file, and still not much of a puzzle: it is a category with a decade
   * stapled on, and four of them in one grid read as the same clue four times.
   * A fan does not search their memory by honour, they search it by CAREER.
   *
   * So the record gets read for the things that actually single a man out, in
   * rough order of how much they give:
   *
   *   the clubs he moved between   819 of 1,078 answers have two or more
   *   a whole career at one club   259 of them, and it is the most memorable
   *                                fact about every one of those careers
   *   the number on his back       736 have exactly one on file
   *   where he came from           540 carry a college
   *
   * Each anchor carries a `kind`, and finalize() keeps one grid from using the
   * same kind twice, so a puzzle reads as eight different questions. */
  function anchors(e) {
    var teams = (e.t || []).filter(Boolean);
    var tn = teams.length ? nick(teams[0]) : null;
    var pos = e.pos ? e.pos.toLowerCase() : null;
    var dist = awardPhrase(e);
    var role = pos || (e.sport + ' player');
    var out = [];

    /* The path. Three clubs in the order he wore them is the single most
       identifying thing we hold about a well-travelled career, and it is the
       question Career Path is built on. */
    /* Distinct clubs, in the order he first joined them. A second spell at an
       old club is the same club: "played for the Trail Blazers, Bucks and Trail
       Blazers" is what listing them raw produced for Lillard, and Aaron came
       out with the Braves twice. */
    var seenClub = {}, path = [];
    teams.forEach(function (t) {
      var n = nick(t);
      if (n && !seenClub[n]) { seenClub[n] = 1; path.push(n); }
    });
    /* The decade goes in FRONT of these two, never on the end: a career shape
       already finishes on a relative clause, and " of the 1990s" tacked after
       it lands on the last club rather than on the man. */
    var d0 = primaryDecade(e), eraS = d0 != null ? eraStr(d0) : null;
    if (path.length >= 3) {
      var three = path.slice(0, 3);
      out.push({ kind: 'path', t: cap(role) + ' who played for the ' + list(three),
                 used: { sport: e.sport, pos: e.pos || null, teams: three } });
      if (eraS) out.push({ kind: 'path', t: cap(role) + ' of the ' + eraS + ' who played for the ' + list(three),
                 used: { sport: e.sport, pos: e.pos || null, teams: three, era: d0 } });
    }
    /* One club, all of it. Rarer than it sounds and never forgotten by the
       people who watched it. `ns` is notable seasons rather than an exact
       career length, so the sentence never puts a number on it. */
    if (teams.length === 1 && (e.ns || 0) >= 8) {
      out.push({ kind: 'oneclub', t: cap(role) + ' who spent his whole career with the ' + tn,
                 used: { sport: e.sport, pos: e.pos || null, only: tn, team: tn } });
      if (eraS) out.push({ kind: 'oneclub', t: cap(role) + ' of the ' + eraS + ' who spent his whole career with the ' + tn,
                 used: { sport: e.sport, pos: e.pos || null, only: tn, team: tn, era: d0 } });
    }
    /* PAST TENSE, ALWAYS, WHEREVER A CLUB APPEARS.
       "Timberwolves center in number 32" is a claim about today's roster, and
       our team list is a CAREER: the man it described had already moved to New
       York. Every club anchor below therefore leads with the player and puts
       the club inside a relative clause, which is true of a man who left in
       2024 and equally true of one who never has. The decade goes in front of
       him for the same reason it does on the path shapes: hang it off the end
       and it lands on the club instead. */
    function clubAnchor(kind, head, tail, used) {
      out.push({ kind: kind, t: head + ' ' + tail, used: used });
      if (eraS) out.push({ kind: kind, t: head + ' of the ' + eraS + ' ' + tail,
                           used: merge(used, { era: d0 }) });
    }
    // the number, when the file holds exactly one and cannot be picking wrong
    if (tn && pos && e.j && e.j.length === 1) {
      clubAnchor('number', cap(pos), 'who wore number ' + e.j[0] + ' for the ' + tn,
                 { team: tn, pos: e.pos, jersey: e.j[0] });
    }
    /* "Otterbein product who played outfielder for the Reds" is not a sentence
       anybody says. The man and his position first, where a fan starts, then
       the school, then the club that narrows it. */
    if (e.col && tn && pos) {
      out.push({ kind: 'college', t: cap(pos) + ' out of ' + colName(e.col) + ' who played for the ' + tn,
                 used: { team: tn, pos: e.pos, col: colKey(e.col) } });
    }
    // A Hall of Famer is retired by definition, so this one club-first phrasing
    // cannot claim a roster spot he does not hold.
    if (e.hof && tn) out.push({ kind: 'hofclub', t: tn + ' Hall of Famer', used: { sport: e.sport, hof: true, team: tn } });
    if (tn && pos && dist) clubAnchor('clubaward', dist, 'who played ' + pos + ' for the ' + tn, { team: tn, pos: e.pos, aw: true });
    if (tn && dist) clubAnchor('clubaward', dist, 'who played for the ' + tn, { team: tn, aw: true });
    if (tn && pos) clubAnchor('clubpos', cap(pos), 'who played for the ' + tn, { team: tn, pos: e.pos });
    if (e.hof) out.push({ kind: 'league', t: e.sport + ' Hall of Famer', used: { sport: e.sport, hof: true } });
    if (dist) out.push({ kind: 'league', t: e.sport + ' ' + dist, used: { sport: e.sport, aw: true } });
    if (pos) out.push({ kind: 'league', t: e.sport + ' ' + pos, used: { sport: e.sport, pos: e.pos } });
    return out;
  }
  /* Which anchors can take " of the 1990s" on the end. Only the ones that
     finish on a plain noun phrase: hang it off a number or a club list and the
     decade lands on the wrong noun. The club shapes are absent because they
     build their own era variant in anchors(), where the decade can go in front
     of the man rather than after his club. */
  var ERA_OK = { hofclub: 1, league: 1 };
  function cap(s) { return String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1); }
  function list(a) {
    return a.length < 2 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
  }
  // "Miami (FL)" is a database spelling, not something anybody says
  function colName(c) { return String(c || '').replace(/\s*\(.*?\)\s*/g, '').trim(); }

  /* How much a clue actually gives the solver. The club is worth the most: a
     fan searching their memory starts from a team and a position, never from
     "NFL Pro Bowler". Anything under MIN_INFO is not a clue, it is a category,
     and the word simply loses its place in the pool rather than being asked
     with "MLB All-Star" written beside it. */
  function infoScore(used) {
    return (used.team ? 3 : 0) + (used.pos ? 2 : 0) + (used.aw || used.hof ? 2 : 0) +
           (used.era != null ? 1 : 0) + (used.ml ? 2 : 0) + (used.curated ? 6 : 0) +
           // a club list and a one-club career are worth more than the club
           // alone, which is the whole reason they exist
           (used.teams ? 2 + 2 * used.teams.length : 0) + (used.only ? 5 : 0) +
           (used.jersey != null ? 2 : 0) + (used.col ? 2 : 0);
  }
  var MIN_INFO = 5;

  function clueFor(word, rng, seen) {
    var e = word.e;
    if (!givenOf(e.name)) return null;         // single-name entries never qualify
    /* Every same-surname player is a rival now. The old code only guarded
       against players who ALSO shared a first name, because the first name was
       printed in the clue and did the separating. Nothing prints it any more,
       so the clue itself has to do that work. */
    var rivals = word.rivals || [];
    var anch = anchors(e);
    if (!anch.length) return null;
    var hand = curatedPredicate(e, rng);
    var dec = primaryDecade(e);
    var era = dec != null ? eraStr(dec) : null;
    var ml0 = (e.ml && e.ml.length) ? e.ml[0] : null;

    /* A hand-written moment identifies one man on its own, so it skips the
       rival walk. It takes a LEAGUE-level anchor, never a club one: the club we
       hold is his FIRST, and half these moments happened somewhere else. "Twins
       Hall of Famer who walked off consecutive nights to start the greatest
       comeback in postseason history" is two true facts making one false
       sentence, and it was the shape this produced for Ortiz, Bosh and Lynch.
       An anchor whose award is the same one the moment is about ("MVP whose MVP
       speech ...") is passed over too: the sentence should not say it twice. */
    if (hand) {
      var handLC = hand.toLowerCase();
      var league = anch.filter(function (a) {
        return !a.used.team && !a.used.teams && !a.used.only;
      });
      for (var h = 0; h < league.length; h++) {
        var a = league[h];
        if (a.used.aw && handLC.indexOf(a.t.split(' ').slice(-1)[0].toLowerCase()) >= 0 && h + 1 < league.length) continue;
        var text = a.t + ' ' + hand;
        if (text.toUpperCase().indexOf(word.w) >= 0) continue;    // never leak the answer
        return { text: text, facts: merge(a.used, { curated: true }), kind: 'moment' };
      }
    }

    /* No moment on file, so the facts have to carry it, and the richest
       combination wins rather than a random one: "Chargers center, Pro Bowl
       pick of the 2000s" is a clue a fan can work back from, "NFL Pro Bowler"
       is not. Ties are broken at random so a grid is not eight sentences of
       identical shape. */
    var cands = [];
    anch.forEach(function (a) {
      if (ml0) cands.push({ kind: a.kind, t: a.t + ', ' + ml0, used: merge(a.used, { ml: true }) });
      /* An era belongs on a thin anchor and clutters a rich one: "Running back
         who played for the 49ers, Colts and Dolphins of the 2000s" reads as if
         the clubs had the decade, not the man. */
      if (era && ERA_OK[a.kind]) {
        cands.push({ kind: a.kind, t: a.t + ' of the ' + era, used: merge(a.used, { era: dec }) });
      }
      cands.push(a);
    });
    cands = cands.filter(function (c) { return infoScore(c.used) >= MIN_INFO; });
    var jitter = rng ? shuffle(cands, rng) : cands;
    /* Richest first, but a shape this grid has already used drops behind
       everything it outscores by less than a shape's worth. Eight true clues
       that all read "<Club> <position> and Pro Bowler of the <decade>" is one
       clue asked eight times, which is the complaint that started this. */
    jitter.sort(function (x, y) {
      var sx = infoScore(x.used) - (seen && seen[x.kind] ? 4 : 0);
      var sy = infoScore(y.used) - (seen && seen[y.kind] ? 4 : 0);
      return sy - sx;
    });
    for (var i = 0; i < jitter.length; i++) {
      var got = tryDisambig(jitter[i], e, rivals, word.w);
      if (got) { got.kind = jitter[i].kind; return got; }
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
  // Only truly recognizable players can be crossword ANSWERS. .star (from the
  // stars.js overlay) is the primary signal — hand-curated list of ~700 NBA /
  // NFL / MLB names any casual sports fan would know. Auto-detected fallback
  // for anyone not on the curated list, so a rising legend still qualifies.
  /* Three NFL positions a generated clue cannot rescue, and one door out.

     Everything the generator knows about a player is club, position, decade,
     honour, number and school. For a lineman that assembles into "Titans
     offensive lineman and Pro Bowler of the 2000s", and for a specialist into
     "Vikings punter of the 2010s": true, unique in our file, and unanswerable.
     Between them they held 151 of the 1,078 surnames in the pool and put a
     ROOS, a STEUSSIE or a MCBRIAR into roughly one grid in four.

     What a fan actually remembers about a kicker is never the résumé, it is
     the kick: the blizzard, the 66-yarder, the chip shot he shanked in the
     cold. So the door out is a hand-written clue from cluebank.js, and that
     is the whole test. It is the proof the man has a moment worth asking
     about, and it is the only shape of clue that asks about it. Write one for
     Jason Kelce or Shane Lechler and he is back in the pool the same day. */
  function playableRole(e) {
    if (e.sport !== 'NFL') return true;
    var p = e.pos || '';
    if (!/offensive lineman|^center$|^guard$|^tackle$|^kicker$|^punter$/i.test(p)) return true;
    return hasCurated(e);
  }
  function isCwIcon(e) {
    var T = { NBA: 1, NFL: 1, MLB: 1 };
    if (!T[e.sport]) return false;
    if (!hasDistinction(e)) return false;   // must have a real accolade to earn a clue
    if (!playableRole(e)) return false;
    if (e.star) return true;
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
  // How many extra copies of each hand-clued player go into the pick pool.
  // Tuned against a 365-day run — see scripts/check-cluebank.mjs, which reports
  // the resulting share of curated clue slots.
  var CURATED_WEIGHT = 14;
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
      // Weight players who have a HAND-WRITTEN clue far above the rest. This
      // does double duty: the puzzle reads better (a real moment instead of
      // "NFL Pro Bowler Jack ___"), and it stops the grid filling up with
      // technically-eligible players no casual fan could name. The long tail
      // stays in the pool so the generator never starves on a hard grid — it
      // just stops being the default.
      var handed = surnames.filter(function (w) { return hasCurated(w.e); });
      if (handed.length) {
        for (var h = 0; h < CURATED_WEIGHT; h++) surnames = surnames.concat(handed);
      }
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
    var seenKind = {};                 // clue shapes already spent on this grid
    for (var j = 0; j < placements.length; j++) {
      var p = placements[j];
      // team + vocab entries carry their clue directly; surnames go through
      // the disambiguating clue builder.
      var cl = p.w.staticClue || clueFor(p.w, rng, seenKind);
      if (!cl) return null;
      if (cl.kind) seenKind[cl.kind] = 1;
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
