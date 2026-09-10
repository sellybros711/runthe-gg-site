/* WHO CAN SEE COMMISH SIMULATOR. The list and the flag now live in one file for the whole
 * bundle, at /assets/bundle-access.js, and this is the college game's handle on it.
 *
 * IT USED TO OWN THE LIST. Commish Simulator is sold with Dynasty as one product at one
 * price, and until that was true it was reasonable for this file to carry its own three
 * names and its own COMMISH_LIVE flag beside football's two copies of the same three names.
 * It is not reasonable now: three flags is a launch that can half happen, and a bundle where
 * one half opens and the other says it is in testing is a bug the customer finds first.
 *
 * So the policy moved and the handle stayed. Two pages ask this question, /cfb/ to decide
 * whether to draw the card and /cfb/commish/ to decide whether to open the door, and both go
 * on asking PS_CFB_COMMISH_ACCESS exactly as before. What changed is where the answer comes
 * from.
 *
 * FAIL CLOSED IF THE SHARED FILE IS BLOCKED, which is the same rule football's two access
 * files hold. A missing script is not permission: it is one card fewer on a modes sheet and a
 * door that stays shut, and both of those are recoverable. The alternative is keeping a
 * second copy of the list here as a fallback, which is the drift this file was merged to end.
 */
(function (root) {
  'use strict';

  var B = root.PS_BUNDLE_ACCESS
    || (typeof require === 'function' ? require('../../assets/bundle-access.js') : null);

  var EMPTY = [];

  function isTester(name) { return !!B && B.isTester(name); }
  function isTesterId(id) { return !!B && B.isTesterId(id); }

  /* THE ONE QUESTION BOTH PAGES ASK. Takes the auth state whole, or a bare username, which is
     what the first version took and what a caller that has not been updated still sends. */
  function commishAllowed(who) { return !!B && B.allowed(who); }

  /* WHETHER THIS ACCOUNT IS TREATED AS HAVING PAID WITHOUT PAYING. Separate from the question
     above on purpose: after the bundle launches, allowed() is true for everybody and this is
     true for the comp list alone. The purchase itself is a database row, not this file. */
  function commishComped(who) { return !!B && B.comped(who); }

  /* WHAT TO SEND TO GET ADDED, in the words the gate screen uses. */
  function identityOf(who) {
    if (!who || !who.signedIn) return null;
    return { name: who.name || null, userId: who.userId || null };
  }

  var api = {
    /* The shared arrays themselves rather than copies, so a test that arms this object and
       pushes its own name onto TESTERS is putting that name on the real list, which is the
       gate the guards are meant to be walking through. */
    TESTERS: B ? B.TESTERS : EMPTY,
    TESTER_IDS: B ? B.TESTER_IDS : EMPTY,
    LIVE: !!B && B.LIVE,
    isTester: isTester,
    isTesterId: isTesterId,
    allowed: commishAllowed,
    comped: commishComped,
    identityOf: identityOf,
  };

  root.PS_CFB_COMMISH_ACCESS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
