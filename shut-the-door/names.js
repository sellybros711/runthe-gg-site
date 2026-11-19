/* Shut The Door: the short name a player reads, for every hitter and pitcher (the owner, 2026-11-02:
 * "Witt Jr.", not "Jr." and not "Witt"). One helper for the play by play, the coach, the box score
 * and the lesson.
 *
 * The name after the first, so a suffix stays with the surname: "Bobby Witt Jr." is "Witt Jr.",
 * "Ken Griffey Sr." is "Griffey Sr.", "Jose De Leon" is "De Leon". A one word name is itself.
 *
 * versus(name) is the result's you against the real game in the closer's short name (the owner,
 * 2026-11-10): "you vs Uehara", then "Uehara did better" or "you did better". A tie keeps "you
 * matched history". With no name it is the real game, exactly as before: never "them", never a blank.
 *
 * Browser: window.STD_NAMES (before lesson.js, box-ui.js and ui.js). Node: require('./names.js').
 */
(function () {
  'use strict';
  function shortName(n) {
    var p = String(n == null ? '' : n).trim().split(/\s+/).filter(Boolean);
    return p.length > 1 ? p.slice(1).join(' ') : (p[0] || '');
  }
  var REAL = { label: 'you vs the real game', beat: 'you rewrote history', matched: 'you matched history', lost: 'history did better' };
  function versus(name) {
    var last = shortName(name);
    if (!last) return { label: REAL.label, beat: REAL.beat, matched: REAL.matched, lost: REAL.lost };
    return { label: 'you vs ' + last, beat: 'you did better', matched: REAL.matched, lost: last + ' did better' };
  }
  var api = { shortName: shortName, versus: versus };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.STD_NAMES = api;
})();
