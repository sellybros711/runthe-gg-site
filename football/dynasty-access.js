/* WHO CAN SEE DYNASTY. The list and the flag live in one file for the whole bundle, at
 * /assets/bundle-access.js, and this is the NFL game's handle on it.
 *
 * Dynasty is one roster carried through as many real NFL seasons as you can survive: the men
 * you keep age into their own next year, at whatever those years actually were, you pay for
 * them at whatever they turn out to be worth, and the owner wants more wins every autumn than
 * he wanted last one. Miss his bar twice and the run is over.
 *
 * IT USED TO OWN THE LIST, and it used to say so: "A COPY OF fullteam-access.js AND
 * DELIBERATELY SO ... When a third mode wants this, merge them." Commish Simulator, in the
 * college game, is the third mode, and it is sold with this one as a single product at a
 * single price. Three flags is a launch that can half happen, and a bundle where one half
 * opens and the other says it is in testing is a bug the customer finds first. So the three
 * lists became one. They were byte-for-byte identical on the day it happened, which is the
 * only reason it was an edit rather than a migration.
 *
 * The file, the flag and every identifier in it still say `dynasty`, which was the mode's
 * name while it was being built. That is a name in the code and not on the screen.
 *
 * FAIL CLOSED IF THE SHARED FILE IS BLOCKED, which is the rule this file already held: a
 * missing script hides an unannounced mode rather than opening it. Keeping a second copy of
 * the list here as a fallback is the drift the merge was for.
 *
 * THIS IS STILL A FEATURE FLAG, NOT A PERMISSION. It ships in the page, readable by anybody
 * who opens the console and forgeable by anybody who wants to bother. That is fine for hiding
 * an unannounced game mode and would NOT be fine for anything that is sold. What somebody
 * bought is a row in public.subscriptions, written by the Stripe webhook under the service
 * role; this file must never be what stands between a player and a product they paid for.
 */
(function (root) {
  'use strict';

  var B = root.PS_BUNDLE_ACCESS
    || (typeof require === 'function' ? require('../assets/bundle-access.js') : null);

  var EMPTY = [];

  function isTester(name) { return !!B && B.isTester(name); }
  function isTesterId(id) { return !!B && B.isTesterId(id); }

  /* THE ONE QUESTION EVERYTHING ASKS. Takes the auth state whole rather than a name, so
     adding a third way onto the list later does not mean editing every caller. */
  function dynastyAllowed(who) { return !!B && B.allowed(who); }

  /* WHETHER THIS ACCOUNT IS TREATED AS HAVING PAID WITHOUT PAYING. Separate from the question
     above: after the bundle launches, allowed() is true for everybody and this is true for
     the comp list alone. See canPlayClubDynasty() in index.html, which is the one function
     that learns about the paid tier. */
  function dynastyComped(who) { return !!B && B.comped(who); }

  var api = {
    TESTERS: B ? B.TESTERS : EMPTY,
    TESTER_IDS: B ? B.TESTER_IDS : EMPTY,
    LIVE: !!B && B.LIVE,
    isTester: isTester,
    isTesterId: isTesterId,
    allowed: dynastyAllowed,
    comped: dynastyComped,
  };

  root.PS_DYNASTY_ACCESS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
