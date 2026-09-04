/* WHO CAN SEE DYNASTY, in one file, because more than one thing asks.
 *
 * Dynasty is one roster carried through as many real NFL seasons as you can survive:
 * the men you keep age into their own next year, at whatever those years actually were,
 * you pay for them at whatever they turn out to be worth, and the owner wants more wins
 * every autumn than he wanted last one. Miss his bar twice and the run is over. Today it
 * is neither paid nor announced: it is a preview for named accounts.
 *
 * The file, the flag and every identifier in it still say `dynasty`, which was the mode's
 * name while it was being built. That is a name in the code and not on the screen, and the
 * screen is the only place it matters: renaming it would touch the run object, the page,
 * two checkers and a database column to change nothing anybody can see.
 *
 * A COPY OF fullteam-access.js AND DELIBERATELY SO. Both are feature flags for unannounced
 * modes, both are asked about by the home screen button and by the two functions behind it,
 * and the alternative to a second file is a shared one with a mode argument, which is a
 * layer of indirection over eleven lines. When a third mode wants this, merge them.
 *
 * NO EMAIL ADDRESSES IN THIS FILE. It is served to anybody who asks for it at
 * runthe.gg/football/dynasty-access.js, so anything written here is published. A username
 * is already public, because it is printed on the leaderboard. An account id is opaque. An
 * email address is neither.
 *
 * THIS IS A FEATURE FLAG, NOT A PERMISSION. The list ships in the page, readable by anybody
 * who opens the console and forgeable by anybody who wants to bother. That is fine for
 * hiding an unannounced game mode and would NOT be fine for anything that is sold. When a
 * dynasty is actually behind a payment, the thing that decides has to be the database,
 * inside ps_submit_run, and this file must not be what stands between a player and a
 * product they paid for.
 */
(function (root) {
  'use strict';

  /* Usernames, as typed on the leaderboard. Lowercased when matched, because set_username
     stores the casing somebody typed and an exact-case match silently misses them. */
  var DYNASTY_TESTERS = [
    'malikwillislover',
    'runnyj',
    'slimeyb3',
  ];

  /* Supabase account ids, for an account with no username chosen. */
  var DYNASTY_TESTER_IDS = [];

  /* FALSE UNTIL THE MODE IS FINISHED AND THE MIGRATION IS RUN, and that is the truth about
     it rather than caution. A dynasty submits a row per season against a dynasty id, and
     until ps_runs carries those columns every season it plays is thrown away on submit.
     Flipping this to true opens the mode to everybody in one edit. */
  var DYNASTY_LIVE = false;

  function isTester(name) {
    return DYNASTY_TESTERS.indexOf(String(name || '').toLowerCase()) >= 0;
  }

  function isTesterId(id) {
    return !!id && DYNASTY_TESTER_IDS.indexOf(String(id)) >= 0;
  }

  /* THE ONE QUESTION EVERYTHING ASKS. Takes the auth state whole rather than a name, so
     adding a third way onto the list later does not mean editing every caller. */
  function dynastyAllowed(who) {
    if (DYNASTY_LIVE) return true;
    if (typeof who === 'string' || who == null) return isTester(who);
    return isTester(who.name) || isTesterId(who.userId);
  }

  var api = {
    TESTERS: DYNASTY_TESTERS,
    TESTER_IDS: DYNASTY_TESTER_IDS,
    LIVE: DYNASTY_LIVE,
    isTester: isTester,
    isTesterId: isTesterId,
    allowed: dynastyAllowed,
  };

  root.PS_DYNASTY_ACCESS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
