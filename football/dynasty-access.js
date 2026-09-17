/* WHO CAN SEE DYNASTY, in one file, because more than one thing asks.
 *
 * Dynasty is one roster carried through as many real NFL seasons as you can survive:
 * the men you keep age into their own next year, at whatever those years actually were,
 * you pay for them at whatever they turn out to be worth, and the owner wants more wins
 * every autumn than he wanted last one. Miss his bar twice and the run is over. It is
 * LAUNCHED: open to everybody, one season a day for a free account, unlimited for an
 * account holding ps_premium.
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
  /* STILL LOAD-BEARING AFTER LAUNCH, which is not obvious and is the reason this note
     exists. allowed() answers true for everybody now, so nothing reads this list to decide
     who SEES Dynasty. canPlayClubDynasty() in index.html still reads isTester and
     isTesterId directly, because One Franchise Dynasty is a PAID mode and the list is what
     lets a tester who holds no row go on testing it. So these five accounts are comped One
     Franchise, and emptying the list takes that away rather than doing nothing.
     It follows that csel8 and jordantest are no longer clean not-bought views of that one
     mode. They are still clean everywhere else, and the real not-bought view is now what
     every visitor gets. */
  var DYNASTY_TESTERS = [
    'malikwillislover',
    'runnyj',
    'slimeyb3',
    'csel8',      /* holds no premium row */
    'jordantest', /* holds no premium row */
  ];

  /* Supabase account ids, for an account with no username chosen. */
  var DYNASTY_TESTER_IDS = [];

  /* TRUE: THE MODE IS LAUNCHED. It was false while the mode was being built, because a
     dynasty files a row per season and until ps_runs could hold one every season it played
     was thrown away on submit. 97_football_gauntlet_mode.sql widened ps_football_modes()
     to know 'dynasty' and 101_dynasty_seasons.sql meters it in seasons, so the rows land.
     THIS FLAG NEEDS THOSE MIGRATIONS DEPLOYED. Turning it on against a database that has
     not had them is the one failure with no symptom: the mode plays perfectly and every
     season vanishes on submit, and the player is told nothing.
     IT ALSO MOVES EVERY GOAT RANK ON THE SITE, by design. achievements.js gates the
     Dynasty shelf on this flag, so the catalog grows and crest.js divides by a bigger
     number for everybody at once. Nobody replays anything: a rank is derived, so the
     seasons already played count the moment the shelf appears. */
  var DYNASTY_LIVE = true;

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
