/* WHO CAN SEE COMMISH SIMULATOR, in one file, because two pages now ask.
 *
 * The mode lives at /cfb/commish/ and it is reached from a card inside the game at
 * /cfb/. Both of those have to agree about who is on the list, and a list written twice
 * is a list that drifts: add a name to the door and not to the card and the tester never
 * finds the mode; add it to the card and not the door and they find a locked door with
 * their name on the other side. So the list is here and both pages load it.
 *
 * The shape is the one supabase/80_football_defense_mode.sql writes down: a name list in
 * the page and a LIVE flag. Flipping COMMISH_LIVE opens the mode to everybody AND puts
 * the card on the modes sheet for everybody, in one edit, which is the point of this file.
 *
 * LOWERCASED, because set_username stores the casing somebody typed and an exact-case
 * match silently misses them. 72_comp_passes.sql hit this and wrote it down.
 */
(function (root) {
  'use strict';

  var COMMISH_TESTERS = ['sellybros711'];
  var COMMISH_LIVE = false;

  function isTester(name) {
    return COMMISH_TESTERS.indexOf(String(name || '').toLowerCase()) >= 0;
  }

  /* THE ONE QUESTION BOTH PAGES ASK. `name` is the signed-in username or null. */
  function commishAllowed(name) {
    return COMMISH_LIVE || isTester(name);
  }

  var api = {
    TESTERS: COMMISH_TESTERS,
    LIVE: COMMISH_LIVE,
    isTester: isTester,
    allowed: commishAllowed,
  };

  root.PS_CFB_COMMISH_ACCESS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
