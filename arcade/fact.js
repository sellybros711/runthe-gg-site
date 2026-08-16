/* fact.js: one line of history after every answer (window.RTGFact).
 *
 *   RTGFact.of(entity, {seed, skip})  ->  "Wore No. 23 in Cleveland, then 6 in Miami."
 *
 * WHY THIS EXISTS
 * The arcade holds teams, colleges, awards, decades, draft slots and jersey
 * numbers on every player, and until now showed a player none of it once the
 * round ended. A quiz that tells you nothing back is a quiz. A line of real
 * history after each answer makes it a place you learn something, and it
 * lands hardest exactly where people quit: on a wrong answer, which otherwise
 * gives them a red box and nothing else.
 *
 * THE RULE: EVERY LINE IS DERIVABLE FROM THE RECORD.
 * No superlatives we cannot check, no "only two players ever", no rankings.
 * If the entity does not carry the fact, the line does not get written. A
 * confident-sounding invention would be worse than silence, because the whole
 * point is that people trust what they read here.
 *
 * No pronouns either. We do not hold anyone's pronouns, and a career reads
 * perfectly well without them.
 */
(function (root, factory) {
  var mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.RTGFact = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function uniq(a) {
    var seen = {}, out = [];
    (a || []).forEach(function (x) { if (x && !seen[x]) { seen[x] = 1; out.push(x); } });
    return out;
  }
  /* City-or-nickname short form, so a jersey line reads "23 in Cleveland"
     rather than "23 with the Cleveland Cavaliers". Last word for the ones
     whose nickname is the famous half, first words otherwise. */
  function shortTeam(t) {
    var s = String(t || '');
    var m = /^(.*?)\s+(\S+)$/.exec(s);
    return m ? m[1] : s;
  }
  function num(n) {
    var W = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
             'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
             'seventeen', 'eighteen', 'nineteen', 'twenty'];
    return (n >= 0 && n <= 20) ? W[n] : String(n);
  }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function list(a) {
    if (a.length === 1) return a[0];
    if (a.length === 2) return a[0] + ' and ' + a[1];
    return a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
  }
  var LEAGUE = { NBA: 'NBA', NFL: 'NFL', MLB: 'MLB' };

  /* Each builder returns a sentence or null. `kind` lets a game suppress the
     one thing its round just showed: Career Path should not answer "who was
     that" with the team list the player was staring at. */
  var BUILDERS = [
    { kind: 'milestone', weight: 10, make: function (e) {
      if (!e.ml || !e.ml.length) return null;
      return e.name + ' is in the ' + e.ml[0] + '.';
    } },
    { kind: 'draft', weight: 9, make: function (e) {
      if (e.dp !== 1) return null;
      var t = uniq(e.t);
      return 'Taken first overall' + (t.length ? ', by the ' + t[0] : '') + '.';
    } },
    { kind: 'teams', weight: 8, make: function (e) {
      var t = uniq(e.t);
      if (t.length < 5) return null;
      return cap(num(t.length)) + ' franchises in all, from the ' + t[0] + ' to the ' + t[t.length - 1] + '.';
    } },
    { kind: 'teams', weight: 8, make: function (e) {
      var t = uniq(e.t);
      if (t.length !== 1 || (e.ns || 0) < 9) return null;
      return num(e.ns) + ' seasons, one uniform: the ' + t[0] + '.';
    } },
    { kind: 'decade', weight: 7, make: function (e) {
      var d = e.decade || [];
      if (d.length < 4) return null;
      return 'On the field across ' + num(d.length) + ' decades, from the ' + d[0] + 's to the ' + d[d.length - 1] + 's.';
    } },
    { kind: 'award', weight: 7, make: function (e) {
      var aw = (e.aw || []).filter(function (a) { return /MVP|Cy Young|Rookie of the Year|Defensive Player|Offensive Player|Triple Crown|Scoring Champ/i.test(a); });
      if (!aw.length) return null;
      return e.name + ': ' + list(uniq(aw).slice(0, 2)) + '.';
    } },
    { kind: 'hof', weight: 6, make: function (e) {
      if (!e.hof) return null;
      var c = uniq(e.t), d = e.decade || [];
      // "A Hall of Famer." on its own says almost nothing, so always carry a
      // second clause: the one-club career, the era, or where they came from.
      if (c.length === 1) return 'A Hall of Famer, all of it with the ' + c[0] + '.';
      if (d.length >= 2) return 'A Hall of Famer, ' + d[0] + 's into the ' + d[d.length - 1] + 's.';
      if (e.col) return 'A Hall of Famer, out of ' + e.col + '.';
      return 'A Hall of Famer' + (e.pos ? ' at ' + e.pos.toLowerCase() : '') + '.';
    } },
    { kind: 'jersey', weight: 5, make: function (e) {
      var j = uniq(e.j), t = uniq(e.t);
      if (!j.length) return null;
      if (j.length >= 2 && t.length >= 2) {
        return 'Wore ' + j[0] + ' in ' + shortTeam(t[0]) + ', then ' + j[1] + ' in ' + shortTeam(t[1]) + '.';
      }
      if (j.length >= 2) return 'Wore ' + list(j.slice(0, 3).map(String)) + ' over the years.';
      return 'Wore No. ' + j[0] + (t.length ? ' for the ' + t[0] : '') + '.';
    } },
    { kind: 'col', weight: 5, make: function (e) {
      if (!e.col) return null;
      return (e.pos ? 'A ' + e.pos.toLowerCase() + ' out of ' + e.col : 'Played college ball at ' + e.col) + '.';
    } },
    { kind: 'nat', weight: 4, make: function (e) {
      if (!e.nat || e.nat === 'United States') return null;
      return 'One of the ' + (LEAGUE[e.sport] || e.sport) + ' names to come out of ' + e.nat + '.';
    } },
    { kind: 'award', weight: 4, make: function (e) {
      var aw = uniq(e.aw || []).filter(function (a) { return !/Hall of Fame/i.test(a); });
      if (aw.length < 3) return null;
      return list(aw.slice(0, 3)) + ', all on the same résumé.';
    } },
    { kind: 'seasons', weight: 3, make: function (e) {
      if ((e.ns || 0) < 16) return null;
      return num(e.ns) + ' seasons in the ' + (LEAGUE[e.sport] || e.sport) + '.';
    } },
    { kind: 'teams', weight: 3, make: function (e) {
      var t = uniq(e.t);
      if (t.length < 2 || t.length > 4) return null;
      return 'Career stops: ' + list(t) + '.';
    } },
    { kind: 'pos', weight: 3, make: function (e) {
      var t = uniq(e.t), d = e.decade || [];
      if (!e.pos || !t.length || !d.length) return null;
      return 'A ' + e.pos.toLowerCase() + ', first suited up for the ' + t[0] + ' in the ' + d[0] + 's.';
    } },
    { kind: 'active', weight: 3, make: function (e) {
      var d = e.decade || [];
      if (!e.act || d.length < 2) return null;
      return 'Still going, and has been since the ' + d[0] + 's.';
    } },
    { kind: 'decade', weight: 2, make: function (e) {
      var d = e.decade || [];
      if (!d.length) return null;
      return 'First seen in the ' + d[0] + 's.';
    } }
  ];

  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  /* Pick among everything this record can actually support, weighted so the
     interesting facts surface first but the same player does not produce the
     identical line every time they appear. */
  function of(e, opts) {
    if (!e) return null;
    opts = opts || {};
    var skip = opts.skip || {};
    var cands = [];
    for (var i = 0; i < BUILDERS.length; i++) {
      var b = BUILDERS[i];
      if (skip[b.kind]) continue;
      var s = null;
      try { s = b.make(e); } catch (_) { s = null; }
      if (s) cands.push({ w: b.weight, s: s, kind: b.kind });
    }
    if (!cands.length) return null;
    /* Only the best band competes, so a jersey line never beats a milestone.
       The band is three wide rather than one: a single-width band meant the
       same player produced the same two sentences forever, and a player whose
       only top-tier fact was "A Hall of Famer" never got to mention anything
       else about themselves. */
    var top = cands.reduce(function (m, c) { return Math.max(m, c.w); }, 0);
    var best = cands.filter(function (c) { return c.w >= top - 2; });
    var h = hash(String(e.id || e.name || '') + '|' + String(opts.seed == null ? '' : opts.seed));
    return best[h % best.length].s;
  }

  function kindsFor(e) {
    var out = {};
    BUILDERS.forEach(function (b) { try { if (b.make(e)) out[b.kind] = 1; } catch (_) {} });
    return Object.keys(out);
  }

  return { of: of, kindsFor: kindsFor, _builders: BUILDERS };
});
