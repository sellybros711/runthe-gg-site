/* ONE FLIP FOR THE BUNDLE, because two games are sold together and must arrive together.
 *
 * Dynasty (in the NFL game) and Commish Simulator (in the college game) are one product with
 * one price. Until today each carried its own copy of the same three tester names and its own
 * LIVE flag, in football/dynasty-access.js, football/fullteam-access.js and
 * cfb/commish/access.js. Three identical lists is three chances to add somebody to two of
 * them, and three flags is a launch that can half happen: flip one, ship a bundle where one
 * half opens and the other says it is in testing, and the first person to notice is a
 * customer who paid for both.
 *
 * dynasty-access.js invited exactly this, in its own words: "A COPY OF fullteam-access.js AND
 * DELIBERATELY SO ... When a third mode wants this, merge them." Commish is the third mode.
 *
 * The three lists were byte-for-byte identical when they were merged, so nothing about who
 * can see what changed on the day this file arrived. That is the only reason it could be done
 * in one edit rather than as a migration.
 *
 * ---- THE TWO QUESTIONS, WHICH ARE NOT THE SAME QUESTION ----
 *
 * allowed(who)  May this account see the mode at all? That is the LAUNCH flag. While it is
 *               false the modes are unannounced and only named testers get in; when it flips
 *               everybody does, and everybody plays the free tier.
 *
 * comped(who)   Is this account treated as having paid, without having paid? That is the
 *               tester list again, and it is deliberately a SEPARATE call, because after the
 *               launch flip those two questions have different answers for almost everybody:
 *               allowed is true for the whole world and comped is true for three people.
 *
 * WHAT IS NOT HERE IS WHETHER SOMEBODY BOUGHT IT. This file is served to anybody who asks for
 * it at runthe.gg/assets/bundle-access.js, so everything in it is published and forgeable by
 * anybody who opens a console. That is fine for hiding an unannounced mode and it is NOT fine
 * for deciding who gets a thing they paid for. The purchase is a row in public.subscriptions,
 * written only by the Stripe webhook under the service role and read back through PostgREST
 * with the buyer's own token. See ownsBundle() in cfb/commish/index.html for the seam, and
 * docs/commish-simulator-plan.md for the rollout it implements: a new price in the same
 * Stripe product, an entitlement check alongside arcade_card_active, and comp passes for
 * testers.
 *
 * NO EMAIL ADDRESSES IN THIS FILE, for the same reason the three files it replaces said so: a
 * username is already public because it is printed on the leaderboard, an account id is
 * opaque, and an email address is neither.
 */
(function (root) {
  'use strict';

  /* Usernames, as typed on the leaderboard. Lowercased when matched, because set_username
     stores the casing somebody typed and an exact-case match silently misses them. */
  var BUNDLE_TESTERS = [
    'malikwillislover',
    'runnyj',
    'slimeyb3',
  ];

  /* Supabase account ids, for an account that signed in with Google and never chose a name.
     The gate screen at /cfb/commish/ prints the signed-in account's id so it can be read off
     and added here. */
  var BUNDLE_TESTER_IDS = [];

  /* THE FLIP. False until both halves are finished and both migrations are run. Turning it
     true opens Dynasty, Full Team and Commish Simulator to everybody in one edit, and puts
     their cards on both games' home screens, because every one of those surfaces reads this
     file rather than a copy of it.

     It is not the paywall. After this is true the modes are visible and playable at the free
     tier; what is sold is the paid half of each, and that is decided by the database. */
  var BUNDLE_LIVE = false;

  function isTester(name) {
    return BUNDLE_TESTERS.indexOf(String(name || '').toLowerCase()) >= 0;
  }

  function isTesterId(id) {
    return !!id && BUNDLE_TESTER_IDS.indexOf(String(id)) >= 0;
  }

  /* Either way onto the list, from an auth state or a bare username. A bare string is still
     accepted because that is what the three files this replaces took, and a caller that has
     not been updated should keep working rather than silently match everybody. */
  function onList(who) {
    if (typeof who === 'string' || who == null) return isTester(who);
    return isTester(who.name) || isTesterId(who.userId);
  }

  /* MAY THIS ACCOUNT SEE THE MODE AT ALL. The launch flag, or a tester while it is false. */
  function allowed(who) {
    if (BUNDLE_LIVE) return true;
    return onList(who);
  }

  /* IS THIS ACCOUNT TREATED AS HAVING PAID. Never the flag: launching the bundle does not
     give it away. Only the comp list, and after that only the database. */
  function comped(who) {
    return onList(who);
  }

  /* WHAT TO SEND TO GET ADDED, in the words the gate screen uses. Kept beside the list so the
     instruction and the thing it is about cannot drift apart. */
  function identityOf(who) {
    if (!who || !who.signedIn) return null;
    return { name: who.name || null, userId: who.userId || null };
  }

  var api = {
    TESTERS: BUNDLE_TESTERS,
    TESTER_IDS: BUNDLE_TESTER_IDS,
    LIVE: BUNDLE_LIVE,
    isTester: isTester,
    isTesterId: isTesterId,
    allowed: allowed,
    comped: comped,
    identityOf: identityOf,
  };

  root.PS_BUNDLE_ACCESS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
