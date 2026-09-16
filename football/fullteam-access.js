/* WHO CAN SEE FULL TEAM, in one file, because more than one thing asks.
 *
 * The mode is twelve men, six a side, one shared cap. It is LAUNCHED: open to everybody,
 * one run a day for a free account, unlimited for an account holding ps_premium.
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
 * THIS IS A FEATURE FLAG, NOT A PERMISSION, and after launch it is neither: with the flag
 * true, allowed() answers yes to everybody and nothing reads the list at all. It is kept
 * because turning the flag back off is how the mode gets closed again, and a list rebuilt
 * from memory in that moment would be the wrong list.
 * WHAT IS SOLD IS NOT GATED HERE AND NEVER WAS. The door is free to everybody and the
 * METER behind it is the product. dailyOn() in index.html is what stops counting, and it
 * stops because dynastyOwned() found a premium_unlocks row through premium_products().
 * WORTH KNOWING: ps_attempt_spend does not check ownership itself. It enforces the COUNT,
 * so nobody can fake having runs left, but a client that simply never calls it is never
 * metered. The limit is honest rather than sealed. That is a revenue question and not a
 * correctness one, and sealing it means teaching the spend function to read the row.
 */
(function (root) {
  'use strict';

  /* Usernames, as typed on the leaderboard. Lowercased when matched, because set_username
     stores the casing somebody typed and an exact-case match silently misses them. */
  /* KEEP THIS LIST AND DYNASTY'S IDENTICAL UNLESS THERE IS A REASON NOT TO, and write the
     reason down when there is. They drifted once and the symptom was a tester signed in on
     a Pro account asking why Full Team was missing from a front page that was offering them
     Dynasty two buttons lower. csel8 and jordantest had been added to dynasty-access.js and
     not here, so the two unannounced modes on one page disagreed about who was previewing
     them. Nothing failed: a door that is never built throws nothing.

     It also sends the reader to the wrong question. Neither list has anything to do with
     Pro. What premium buys is that the mode stops COUNTING runs (see dailyOn and
     fullTeamSold); what these names buy is that the door is BUILT at all. An account can
     hold every unlock the store sells and still be served a page with no Full Team on it,
     which is exactly what happened. */
  var FULLTEAM_TESTERS = [
    'malikwillislover',
    'runnyj',
    'slimeyb3',
    'csel8',      /* the free-view tester: sees the premium doors, holds no premium row */
    'jordantest', /* second free-view tester: same shape as csel8, no premium row */
  ];

  /* Supabase account ids, for an account with no username chosen. */
  var FULLTEAM_TESTER_IDS = [];

  /* TRUE: THE MODE IS LAUNCHED. It was false because ps_runs_run_mode_ck lists the
     recordable modes by name and rejected every full team run outright, which is a mode
     that plays perfectly and loses every season on submit with nothing said to the player.
     93_football_fullteam_mode.sql widened the constraint and 97_football_gauntlet_mode.sql
     moved the list into ps_football_modes(), so the rows land. 105_fullteam_daily.sql is
     what makes it one run a day for a free account and unlimited for a buyer.
     THIS FLAG NEEDS THOSE MIGRATIONS DEPLOYED. Against a database without them the mode is
     open and silently records nothing, which no error anywhere reports. */
  var FULLTEAM_LIVE = true;

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
