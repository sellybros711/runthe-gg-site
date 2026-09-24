/* WHO CAN SEE FANTASY CHALLENGE, in one file, because more than one thing asks.
 *
 * The mode is a weekly lineup: QB, RB, RB, WR, WR, TE, drafted off spins from the men whose
 * clubs play that week, priced on what they have done this season, and scored on what they
 * actually do on Sunday. Half PPR. Everybody who plays a given week meets the same board and
 * the same prices, and one lineup a week is submitted.
 *
 * IT IS LAUNCHED, IN BETA, AND WHAT IT ASKS FOR IS AN ACCOUNT. FANTASY_LIVE is true, so
 * the door is built for everybody. What decides whether it OPENS is whether somebody is
 * signed in, and those are two different questions kept apart on purpose.
 *
 * ─── TWO QUESTIONS, AND THE SECOND ONE IS THE SERVER'S ANYWAY ──────────────────────
 *
 *      whether the door is DRAWN      show()      so everybody finds the mode
 *      whether it OPENS               allowed()   so nothing drafts that cannot enter
 *
 * That is the Commish door's rule and the One Franchise lock's, arriving at a third mode.
 * A guest gets the same door wearing a padlock, and pressing it goes to sign in, because a
 * mode a stranger cannot see is a mode a stranger never hears about, and a store you can
 * only reach by being refused is a wall.
 *
 * THE SIGNED IN RULE IS NOT THIS FILE'S TO ENFORCE AND IT IS NOT PRETENDING TO BE.
 * `fantasy_submit` refuses a signed out entry itself, in the one place that can: there is
 * a prize, so the entry is the server's and this file is a courtesy. What it buys is that
 * a guest is told BEFORE drafting five lineups rather than at the last press of the fifth,
 * which is the one screen a wall costs something real on. The paragraph at the bottom of
 * this header said the moment a week's board was worth something the thing that decides
 * had to be the server, inside the function that records the entry. It is, and this stays
 * a feature flag.
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
 * AND THAT DAY HAS COME AND THE MERGE IS STILL DEFERRED, which is a decision rather than
 * the oversight it would look like. All three flags are true now, so the lists decide
 * nothing and merging them is safe in a way it was not. What stops it tonight is that this
 * one is no longer the same shape as the other two: it has a show/allow split they do not
 * have, because it is the only mode here that asks for an account. Merging means teaching
 * the other two a question they never ask, in the hours before a week locks, and the way
 * that fails is a door that is never built, which throws nothing and reports nothing. Do
 * it on a day with nothing on the clock.
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

  /* TRUE: THE MODE IS LAUNCHED, IN BETA. It was false while it was being built, and the
     note here said turning it true needs the week's board, the entry table and the settle
     job all deployed, because a flag turned on against a database with no entry table lets
     somebody draft a lineup that is refused on submit, which is the failure with no
     symptom. All of that is deployed: 109 through 114, the preflight reads ALL PRESENT,
     and the live week has its row in `fantasy_weeks` and its prices under it.
     THIS FLAG NEEDS THAT CHAIN. Against a database missing it the mode draws a wheel and
     refuses every submit, and the only screen that says so is the last one. */
  var FANTASY_LIVE = true;

  function isTester(name) {
    return FANTASY_TESTERS.indexOf(String(name || '').toLowerCase()) >= 0;
  }

  function isTesterId(id) {
    return !!id && FANTASY_TESTER_IDS.indexOf(String(id)) >= 0;
  }

  function onList(who) {
    if (typeof who === 'string' || who == null) return isTester(who);
    return isTester(who.name) || isTesterId(who.userId);
  }

  function signedIn(who) {
    return !!who && typeof who === 'object' && !!who.signedIn;
  }

  /* WHETHER THE DOOR IS DRAWN. Launched, that is everybody, signed in or not: a guest who
     cannot see the mode is a guest who never learns it exists, and the locked door is what
     sends them to the one thing that opens it. Before launch it was the tester list, and it
     still is if the flag goes back. */
  function fantasyShow(who) {
    return FANTASY_LIVE || onList(who);
  }

  /* WHETHER IT OPENS. An account, always: an entry belongs to one, the board prints a name,
     and `fantasy_submit` refuses a signed out lineup itself. Before launch it also wanted
     the list, so a tester who signed out got the locked door rather than the mode.
     TAKES THE AUTH STATE WHOLE rather than a name, so adding a third way onto the list
     later does not mean editing every caller. A bare name cannot say whether somebody is
     signed in, so it answers no: the only caller that ever passed one was asking about the
     list, and refusing is the safe direction at a door with a prize behind it. */
  function fantasyAllowed(who) {
    if (!signedIn(who)) return false;
    return FANTASY_LIVE || onList(who);
  }

  var api = {
    TESTERS: FANTASY_TESTERS,
    TESTER_IDS: FANTASY_TESTER_IDS,
    LIVE: FANTASY_LIVE,
    isTester: isTester,
    isTesterId: isTesterId,
    show: fantasyShow,
    allowed: fantasyAllowed,
  };

  root.PS_FANTASY_ACCESS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
