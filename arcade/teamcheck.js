/* teamcheck.js: "was he there?", for answers our own file cannot settle.
 *
 * Chain and Roll Call both ask a question about a roster: were these two men
 * teammates, was this man on that club that season. Both answer it from
 * arcade/teammates.js, which is fast, exact and INCOMPLETE. It is built from
 * jersey stints, and a stint we never scraped reads exactly like a fact that
 * never happened. Adrian Beltre and Jason Varitek were Red Sox together in
 * 2010; the file had Beltre's Boston year and no Varitek at all, so Chain told
 * a player who was right that he was wrong.
 *
 * A missing row is not a denial. So when our file cannot confirm, this asks
 * livecheck.js (the same /api/player-check the Sportegories live check uses,
 * Wikidata P54 with its start and end qualifiers) and answers from that.
 *
 * Three outcomes, and the middle one is the point:
 *   true   the source puts him there                 -> accept
 *   false  the source has his clubs and none is that -> a genuine miss
 *   null   we could not reach it, or it knows him but not the years
 *          -> the caller decides, and every caller here is generous, because
 *             the alternative is telling someone their right answer is wrong
 *
 * window.RTGTeamCheck. Everything is guarded and every path is a promise, so a
 * page with no network degrades to "our file said no" rather than throwing.
 */
(function (root, factory) {
  var mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  if (root) root.RTGTeamCheck = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---- club names -------------------------------------------------------
     Ours are full ("Boston Red Sox"); Wikidata's are usually full too, but it
     also carries "Red Sox", era names and the odd minor-league affiliate. Match
     on the full string first, then on the nickname, which is the part a
     relocation keeps. */
  var MULTI = ['red sox', 'white sox', 'blue jays', 'red wings', 'maple leafs',
    'golden knights', 'trail blazers', 'blue jackets'];
  function norm(s) {
    return String(s || '').normalize ? String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
      : String(s || '').toLowerCase().trim();
  }
  function nick(team) {
    var t = norm(team);
    for (var i = 0; i < MULTI.length; i++) {
      if (t.length >= MULTI[i].length && t.slice(-MULTI[i].length) === MULTI[i]) return MULTI[i];
    }
    var parts = t.split(' ');
    return parts[parts.length - 1] || t;
  }
  /* Same club, allowing for the two ways the labels differ: a bare nickname
     ("Red Sox" for "Boston Red Sox") and a franchise that moved or was renamed
     ("Anaheim Angels", "Florida Marlins").

     Two cities with the same nickname are a real thing across leagues, the
     Giants and the Jets and the Cardinals and the Kings, so this pair is only
     ever compared after the caller has established both men played the same
     sport. Inside one league a nickname is unique. */
  function sameClub(a, b) {
    if (!a || !b) return false;
    var na = norm(a), nb = norm(b);
    if (na === nb) return true;
    var ka = nick(na), kb = nick(nb);
    return !!ka && ka === kb;
  }

  function overlaps(a0, a1, b0, b1) {
    if (a0 == null || b0 == null) return null;        // undated: cannot say
    var ae = a1 == null ? 9999 : a1, be = b1 == null ? 9999 : b1;
    return !(a0 > be || b0 > ae);
  }

  /* The sport a profile is for, read off Wikidata's occupation labels. The
     answer typed into Chain is a name, and a name can be two men in two
     leagues (the NFL's Chris Davis and the MLB one). Settling the sport first
     is what makes it safe to match clubs by nickname below. */
  var OCC = {
    NFL: /american football|gridiron/i,
    MLB: /baseball/i,
    NBA: /basketball/i
  };
  function sportFits(prof, sport) {
    if (!sport || !OCC[sport]) return true;
    var occ = (prof.occupations || []).concat(prof.sports || []).join(' | ');
    if (!occ) return true;                       // nothing on file: do not deny
    if (OCC[sport].test(occ)) return true;
    // it says an occupation, and none of them is this sport
    var other = false;
    for (var k in OCC) if (OCC.hasOwnProperty(k) && k !== sport && OCC[k].test(occ)) other = true;
    return !other;
  }

  // ---- the live source ---------------------------------------------------
  function live(name) {
    try {
      var L = (typeof window !== 'undefined' && window.RTG_LIVECHECK) || null;
      if (!L || !L.lookup) return Promise.resolve(null);
      var key = String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
      return L.lookup([name]).then(function (map) {
        var p = map && map[key];
        return (p && p.found) ? p : null;
      })['catch'](function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }

  /* ---- one club two men shared, if any ----------------------------------
     Pure, and the only place either game decides what "teammates" means. Both
     sides are stints in our own shape ({team, y0, y1}); a live profile is
     converted into that shape by clubs() below, so the rule is written once.

     A live row often carries the club and no years. Refusing those would
     reinstate the failure this module exists to fix, so an undated match is
     accepted and comes back flagged, and a dated one always wins over it. */
  function linkOf(a, b) {
    var best = null;
    (a || []).forEach(function (x) {
      (b || []).forEach(function (y) {
        if (!sameClub(x.team, y.team)) return;
        var o = overlaps(x.y0, x.y1, y.y0, y.y1);
        if (o === true) {
          var y0 = Math.max(x.y0, y.y0);
          var y1 = Math.min(x.y1 == null ? y.y1 : x.y1, y.y1 == null ? x.y1 : y.y1);
          if (!best || !best.dated || (y1 - y0) > (best.y1 - best.y0)) {
            best = { team: y.team || x.team, y0: y0, y1: y1, dated: true };
          }
        } else if (o === null && !best) {
          best = { team: y.team || x.team, y0: null, y1: null, dated: false };
        }
      });
    });
    return best;
  }

  /* ---- a player's clubs, from the live source ----------------------------
     Returns our stint shape so the caller can treat a live player exactly like
     one of our own. null when the source cannot place them at all, which the
     caller must not read as "this person is invented". */
  function clubs(name, sport) {
    return live(name).then(function (p) {
      if (!p) return null;
      /* Found, but he is somebody else: the NFL's Chris Davis when the chain is
         a baseball one. Comes back named rather than as a flat null, because
         "we could not find him" and "that is the wrong league's player" are
         different things to be told. */
      if (!sportFits(p, sport)) return { name: p.name || name, wrongSport: true, stints: [] };
      var st = (p.teams || []).map(function (t) {
        return { team: t.name, y0: t.start == null ? null : +t.start, y1: t.end == null ? null : +t.end };
      });
      if (!st.length) return { name: p.name || name, noClubs: true, stints: [] };
      return { name: p.name || name, stints: st, live: true };
    });
  }

  /* ---- was this player on that club, that season? ------------------------
     Roll Call, where the season is the whole question. An undated club row
     answers null rather than true: "he played there at some point" is not what
     a board asking about 2019 wants. */
  function onClubIn(name, team, year, sport) {
    return live(name).then(function (p) {
      if (!p) return { ok: null, why: 'unreachable' };
      if (!sportFits(p, sport)) return { ok: false, why: 'different sport', name: p.name };
      var rows = (p.teams || []).filter(function (t) { return sameClub(t.name, team); });
      if (!rows.length) return { ok: false, why: 'never there', name: p.name };
      for (var i = 0; i < rows.length; i++) {
        if (overlaps(rows[i].start, rows[i].end, year, year) === true) {
          return { ok: true, why: 'confirmed', name: p.name, span: rows[i] };
        }
      }
      var undated = rows.some(function (r) { return r.start == null; });
      return { ok: undated ? null : false, why: undated ? 'no years on file' : 'different years',
               name: p.name, span: rows[0] };
    });
  }

  return { clubs: clubs, linkOf: linkOf, onClubIn: onClubIn, sameClub: sameClub,
           _norm: norm, _nick: nick, _sportFits: sportFits };
});
