/* WHO CAN SEE FULL TEAM, in one file, because more than one thing asks.
 *
 * The mode is twelve men, six a side, one shared cap, and it is the first paid mode in
 * this game. Today it is neither paid nor announced: it is a preview for named accounts.
 *
 * MODELLED ON cfb/commish/access.js RATHER THAN ON DEFENSE_TESTERS, and the difference is
 * the point. The defense draft kept its list inline in index.html because exactly one
 * thing asked. This mode is asked about by the home screen button, by beginFullDraft, and
 * by beginDraft's own belt-and-braces check, and a list written three times is a list that
 * drifts: add a name to the door and not to the button and the tester never finds the
 * mode.
 *
 * TWO WAYS TO BE ON THE LIST, and the second exists because the first silently failed for
 * Commish. A username is what somebody typed on the leaderboard. It is NOT their email
 * address, their login, or anything derivable from those, and an account that signed in
 * with Google and never chose a name has no username at all. An account id is the uuid
 * Supabase issues, it exists from the moment the account does, and it can be read off the
 * profile screen.
 *
 * NO EMAIL ADDRESSES IN THIS FILE. It is served to anybody who asks for it at
 * runthe.gg/football/fullteam-access.js, so anything written here is published. A username
 * is already public, because it is printed on the leaderboard. An account id is opaque. An
 * email address is neither.
 *
 * THIS IS A FEATURE FLAG, NOT A PERMISSION. The list ships in the page, readable by anybody
 * who opens the console and forgeable by anybody who wants to bother. That is fine for
 * hiding an unannounced game mode and would NOT be fine for anything that is sold. When
 * Full Team is actually behind a payment, the thing that decides has to be the database,
 * inside ps_submit_run, and this file must not be what stands between a player and a
 * product they paid for.
 */
(function (root) {
  'use strict';

  /* Usernames, as typed on the leaderboard. Lowercased when matched, because set_username
     stores the casing somebody typed and an exact-case match silently misses them. */
  var FULLTEAM_TESTERS = [
    'malikwillislover',
    'runnyj',
    'slimeyb3',
  ];

  /* Supabase account ids, for an account with no username chosen. */
  var FULLTEAM_TESTER_IDS = [];

  /* FALSE UNTIL THE MIGRATION IS RUN, and that is the truth about the mode rather than
     caution. ps_runs_run_mode_ck lists the recordable modes by name, so until it is
     widened to include 'fullteam' the database REJECTS every full team run outright: the
     mode plays perfectly and every season it produces vanishes on submit.
     Flipping this to true opens the mode to everybody in one edit. */
  var FULLTEAM_LIVE = false;

  function isTester(name) {
    return FULLTEAM_TESTERS.indexOf(String(name || '').toLowerCase()) >= 0;
  }

  function isTesterId(id) {
    return !!id && FULLTEAM_TESTER_IDS.indexOf(String(id)) >= 0;
  }

  /* THE ONE QUESTION EVERYTHING ASKS. Takes the auth state whole rather than a name, so
     adding a third way onto the list later does not mean editing every caller. */
  function fullTeamAllowed(who) {
    if (FULLTEAM_LIVE) return true;
    if (typeof who === 'string' || who == null) return isTester(who);
    return isTester(who.name) || isTesterId(who.userId);
  }

  var api = {
    TESTERS: FULLTEAM_TESTERS,
    TESTER_IDS: FULLTEAM_TESTER_IDS,
    LIVE: FULLTEAM_LIVE,
    isTester: isTester,
    isTesterId: isTesterId,
    allowed: fullTeamAllowed,
  };

  root.PS_FULLTEAM_ACCESS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
