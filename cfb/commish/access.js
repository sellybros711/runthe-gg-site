/* WHO CAN SEE COMMISH SIMULATOR, in one file, because two pages ask.
 *
 * The mode lives at /cfb/commish/ and it is reached from a card inside the game at
 * /cfb/. Both of those have to agree about who is on the list, and a list written twice
 * is a list that drifts: add a name to the door and not to the card and the tester never
 * finds the mode; add it to the card and not the door and they find a locked door with
 * their name on the other side. So the list is here and both pages load it.
 *
 * The shape is the one supabase/80_football_defense_mode.sql writes down: a list in the
 * page and a LIVE flag. COMMISH_LIVE is now TRUE, which opened the mode to everybody, put
 * the card on the modes sheet for everybody, and turned on the Go Pro card at /cfb/, all
 * out of this one line. That third one is the easy one to forget: the college game gates
 * its OFFER on commishOn() too, on the argument that a card taking money for a shut door
 * is worse than no card, so nothing on that page could be bought while this was false.
 *
 * TWO WAYS TO BE ON THE LIST, and the second one exists because the first one silently
 * failed. A username is what somebody typed on the leaderboard, and it is NOT their email
 * address, their login, or anything you can work out from those. The first version of this
 * list had a username guessed from an email address and it matched nobody: the card refused
 * to draw, the door refused to open, and both were behaving correctly. Worse, an account
 * that signed in with Google and never chose a name has NO username at all, so there is
 * nothing to write down for it.
 *
 * So an account id counts too. It is the uuid Supabase issues, it exists from the moment
 * the account does, and it is what the gate screen shows you about your own account so it
 * can be read off and added here.
 *
 * NO EMAIL ADDRESSES IN THIS FILE. It is served to anybody who asks for it at
 * runthe.gg/cfb/commish/access.js, so anything written here is published. A username is
 * already public, because it is printed on the leaderboard. An account id is opaque. An
 * email address is neither, and putting one here would publish it.
 */
(function (root) {
  'use strict';

  /* Usernames, as typed on the leaderboard. Lowercased when matched, because set_username
     stores the casing somebody typed and an exact-case match silently misses them.
     72_comp_passes.sql hit this and wrote it down. */
  var COMMISH_TESTERS = [
    'malikwillislover',
    'runnyj',
    'slimeyb3',
    'csel8',      /* the free-view tester: through the door, but holds no premium row */
    'jordantest', /* second free-view tester: same shape as csel8, no premium row */
  ];

  /* Supabase account ids. For an account with no username chosen, this is the only way on
     the list. The gate screen at /cfb/commish/ prints the signed-in account's id. */
  var COMMISH_TESTER_IDS = [];

  /* TRUE: THE MODE IS LAUNCHED. It is one season every 24 hours for a free account and
     unlimited for an account holding cfb_premium, and 104_commish_free_clock.sql is what
     counts that. Unlike the two football flags this one needs no migration to be safe:
     Commish writes its own tables (95, 96) rather than a ps_runs row, so against a
     database missing 104 the mode works and the free clock does not, which fails toward
     giving away seasons rather than toward losing them. */
  var COMMISH_LIVE = true;

  function isTester(name) {
    return COMMISH_TESTERS.indexOf(String(name || '').toLowerCase()) >= 0;
  }

  function isTesterId(id) {
    return !!id && COMMISH_TESTER_IDS.indexOf(String(id)) >= 0;
  }

  /* THE ONE QUESTION BOTH PAGES ASK. Takes the auth state whole rather than a name, so
     adding a third way onto the list later does not mean editing both callers. A bare
     string is still accepted, because that is what the first version took and a caller
     that has not been updated should keep working rather than match everybody. */
  function commishAllowed(who) {
    if (COMMISH_LIVE) return true;
    if (typeof who === 'string' || who == null) return isTester(who);
    return isTester(who.name) || isTesterId(who.userId);
  }

  /* WHAT TO SEND TO GET ADDED, in the words the gate screen uses. Kept beside the list so
     the instruction and the thing it is about cannot drift apart. */
  function identityOf(who) {
    if (!who || !who.signedIn) return null;
    return { name: who.name || null, userId: who.userId || null };
  }

  var api = {
    TESTERS: COMMISH_TESTERS,
    TESTER_IDS: COMMISH_TESTER_IDS,
    LIVE: COMMISH_LIVE,
    isTester: isTester,
    isTesterId: isTesterId,
    allowed: commishAllowed,
    identityOf: identityOf,
  };

  root.PS_CFB_COMMISH_ACCESS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
