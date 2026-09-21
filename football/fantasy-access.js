/* WHO CAN SEE FANTASY CHALLENGE, in one file, because more than one thing asks.
 *
 * The mode is a weekly lineup: QB, RB, RB, WR, WR, TE, drafted off spins from the men whose
 * clubs play that week, priced on what they have done this season, and scored on what they
 * actually do on Sunday. Half PPR. Everybody who plays a given week meets the same board and
 * the same prices, and one lineup a week is submitted.
 *
 * IT IS NOT LAUNCHED. FANTASY_LIVE is false, so the door is built for a tester and for
 * nobody else.
 *
 * A COPY OF dynasty-access.js, WHICH IS ITSELF A COPY OF fullteam-access.js, and that file
 * says in as many words "when a third mode wants this, merge them". This is the third mode
 * and they are NOT merged, which is a deferral rather than an oversight. Both of the others
 * ship LIVE = true, so their allowed() answers yes before it reads anything and the only
 * live reader of either list is canPlayClubDynasty(), which comps One Franchise to a tester
 * holding no premium row. Merging three files means editing two LAUNCHED modes, their two
 * checkers and every caller in index.html, in the middle of building a third, and the way
 * that fails is a door that is never built, which throws nothing and reports nothing. The
 * merge is worth doing on the day this flag goes true, when all three are the same shape
 * again and none of them is half written.
 *
 * NO EMAIL ADDRESSES IN THIS FILE. It is served to anybody who asks for it at
 * runthe.gg/football/fantasy-access.js, so anything written here is published. A username is
 * already public, because it is printed on the leaderboard. An account id is opaque. An
 * email address is neither.
 *
 * THIS IS A FEATURE FLAG, NOT A PERMISSION, AND THAT IS WORTH SAYING PLAINLY RATHER THAN
 * IMPLYING OTHERWISE. The file ships to every visitor, the list is readable by anybody who
 * opens the console, and the door is one line of javascript away for anybody who wants to
 * bother. What it buys is that a stranger browsing the front page does not find an
 * unfinished mode. It is the same gate the unlisted games run on, and it is not access
 * control. The moment a week's board is worth something (a prize, a board somebody wants to
 * be top of, an entry that has to be counted), the thing that decides has to be the server,
 * inside the function that records the entry, and this file must not be what stands between
 * a player and it.
 */
(function (root) {
  'use strict';

  /* Usernames, as typed on the leaderboard. Lowercased when matched, because set_username
     stores the casing somebody typed and an exact-case match silently misses them. */
  /* IDENTICAL TO DYNASTY'S AND FULL TEAM'S, deliberately, and that rule is written up in
     fullteam-access.js: the two drifted once and the symptom was a tester signed in on a Pro
     account asking why one unannounced mode was missing from a page offering them the other
     one two buttons lower. Nothing failed, because a door that is never built throws
     nothing. If a name belongs on one of the three lists and not the others, write down
     why. */
  var FANTASY_TESTERS = [
    'malikwillislover',
    'runnyj',
    'slimeyb3',
    'csel8',      /* holds no premium row */
    'jordantest', /* holds no premium row */
  ];

  /* Supabase account ids, for an account with no username chosen. */
  var FANTASY_TESTER_IDS = [];

  /* FALSE: THE MODE IS BEING BUILT. Turning it true needs the week's board, the entry table
     and the settle job all deployed, and the order matters in one direction only: the board
     is read before a week starts and the settle job runs after it ends, so a flag turned on
     against a database with no entry table lets somebody draft a lineup that is refused on
     submit, which is the failure with no symptom that both of the other two flags carry a
     note about. Draft first, submit later, and the gap between them is a whole week. */
  var FANTASY_LIVE = false;

  function isTester(name) {
    return FANTASY_TESTERS.indexOf(String(name || '').toLowerCase()) >= 0;
  }

  function isTesterId(id) {
    return !!id && FANTASY_TESTER_IDS.indexOf(String(id)) >= 0;
  }

  /* THE ONE QUESTION EVERYTHING ASKS. Takes the auth state whole rather than a name, so
     adding a third way onto the list later does not mean editing every caller. */
  function fantasyAllowed(who) {
    if (FANTASY_LIVE) return true;
    if (typeof who === 'string' || who == null) return isTester(who);
    return isTester(who.name) || isTesterId(who.userId);
  }

  var api = {
    TESTERS: FANTASY_TESTERS,
    TESTER_IDS: FANTASY_TESTER_IDS,
    LIVE: FANTASY_LIVE,
    isTester: isTester,
    isTesterId: isTesterId,
    allowed: fantasyAllowed,
  };

  root.PS_FANTASY_ACCESS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
