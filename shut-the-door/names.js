/* Shut The Door: the short name a player reads, for every hitter and pitcher (the owner, 2026-11-02:
 * "Witt Jr.", not "Jr." and not "Witt"). One helper for the play by play, the coach, the box score
 * and the lesson.
 *
 * The name after the first, so a suffix stays with the surname: "Bobby Witt Jr." is "Witt Jr.",
 * "Ken Griffey Sr." is "Griffey Sr.", "Jose De Leon" is "De Leon". A one word name is itself.
 *
 * Browser: window.STD_NAMES (before lesson.js, box-ui.js and ui.js). Node: require('./names.js').
 */
(function () {
  'use strict';
  function shortName(n) {
    var p = String(n == null ? '' : n).trim().split(/\s+/).filter(Boolean);
    return p.length > 1 ? p.slice(1).join(' ') : (p[0] || '');
  }
  var api = { shortName: shortName };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.STD_NAMES = api;
})();
