/* 4th and What's ads (Ads Agent, 2026-10-30, the owner: "put ads down the side banner of last
 * shot and 4th and what, and a sticky ad at the bottom", and "build both now but switch on as part
 * of launch commit").
 *
 * READY, NOT ON. This file is loaded now and does nothing, because the page carries no ad tag
 * until launch (check-posture.mjs holds that). The launch commit adds the Consent Mode defaults,
 * adsbygoogle.js and /assets/rtg-ads.js to the head, and from then on:
 *  - the closeable bottom banner sits on every screen, play included (the owner's exception for
 *    this game).
 *  - the two desktop rails stand beside the column (.views), 150px clear, wherever the window has
 *    room (the studio layout is up to 1500px wide, so only on a very wide window).
 * BEFORE LAUNCH: the page was rebuilt on 2026-10-31 (the studio, app.js and game.js), after the
 * 2026-10-30 fit that kept Snap It above the banner. That fit went with the old clipboard.js. The
 * launch commit must measure the new screens with the banner filled and keep every play control
 * above it, as the rest of the site does.
 * /assets/rtg-ads.js owns how both look and behave.
 */
(function () {
  'use strict';
  /* THE UNITS EXIST (the owner made them, 2026-10-30). The launch commit puts these ids in the two
     tables below and records them in scripts/ad-units.json; until then the tables stay zeros, because
     the posture check counts the registry naming this game as a link to it:
       fourth-sticky 6590975339, fourth-rail-left 2380267585, fourth-rail-right 8614503443 */
  var STICKY_SLOT = { sticky: '0000000000' };                          // fourth-sticky
  var RAIL_SLOTS = { left: '0000000000', right: '0000000000' };        // fourth-rail-left, fourth-rail-right
  function go() {
    if (!window.RTG_ADS) return;
    RTG_ADS.sticky(true, STICKY_SLOT.sticky, 'fourth');
    RTG_ADS.rails(true, RAIL_SLOTS, function () { return document.querySelector('.views'); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
