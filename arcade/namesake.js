/* namesake.js: is this roster row the same man as this corpus record?
 * (window.RTGNamesake)
 *
 *   RTGNamesake.isNamesake(ent, row, rosterYear)   true when they are two men
 *
 * The roster feed (rosters.js) and the corpus meet by name and sport, and a
 * name and a sport are not a person. The Browns signed a rookie linebacker
 * named Justin Jefferson out of Alabama, and Alma Mater put him on the
 * Vikings receiver's card with "Offensive Player of the Year" under it. A
 * player wrote in. Guess the Player had the same hole the other way round:
 * a cornerback named Chris Johnson on the Dolphins made the retired Titans
 * running back a "current" player, eligible to be the day's answer.
 *
 * samePerson() in data.js is no help here: the feed's positions are coarse
 * ("Guard") and its club is today's, so James Harden on the Cavaliers would
 * fail it. So: a shared club or number is the same man. Otherwise he is a
 * namesake when the corpus man was done before 2010, when one plays offense
 * and the other defense, or when the corpus career began years before this
 * man's first season.
 *
 * Lifted out of arcade/almamater/index.html unchanged, so both games ask the
 * one question the same way.
 */
(function (root, factory) {
  var mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.RTGNamesake = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var API_VERSION = 1;
  var NFL_D = /linebacker|defensive|cornerback|safety|nose tackle|edge/i;
  var NFL_O = /quarterback|running back|wide receiver|tight end|offensive|tackle|guard|center|fullback/i;
  function nflSide(pos) { pos = String(pos || ''); return NFL_D.test(pos) ? 'D' : NFL_O.test(pos) ? 'O' : ''; }
  function has(arr, v) { return v != null && v !== '' && (arr || []).indexOf(v) !== -1; }
  // the year the roster file describes, from its "updated" stamp
  function rosterYear(rosters) {
    var y = parseInt(String((rosters || {}).updated || '').slice(0, 4), 10);
    return y > 1900 ? y : new Date().getFullYear();
  }
  // e: a corpus record {t, j, decade, pos}. p: a roster row {s, t, j, p, exp}.
  function isNamesake(e, p, year) {
    if (!e || !p) return false;
    if (has(e.t, p.t) || has(e.j, p.j)) return false;
    var d = e.decade || [];
    if (d.length && d[d.length - 1] < 2010) return true;
    if (p.s === 'NFL') { var a = nflSide(e.pos), b = nflSide(p.p); if (a && b && a !== b) return true; }
    var y = year || new Date().getFullYear();
    if (d.length && typeof p.exp === 'number' && d[0] + 9 < y - p.exp - 1) return true;
    return false;
  }
  return { API_VERSION: API_VERSION, isNamesake: isNamesake, rosterYear: rosterYear, nflSide: nflSide };
});
