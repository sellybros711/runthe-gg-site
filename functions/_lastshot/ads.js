/* Last Shot's ads (Ads Agent, 2026-10-30, the owner: "put ads down the side banner of last shot
 * and 4th and what, and a sticky ad at the bottom", and "build both now but switch on as part of
 * launch commit").
 *
 * READY, NOT ON. Served with the page's modules (build/pages.mjs) and does nothing, because the
 * page carries no ad tag while it is testers only. The launch commit adds the Consent Mode
 * defaults, adsbygoogle.js and /assets/rtg-ads.js to web/play.html, and from then on:
 *  - the closeable bottom banner sits under the court on every screen, play included (the owner's
 *    exception for this game). The app ends above it (web/play.html, body.rtg-sticky-on), so the
 *    court shrinks to fit and Run It is never under it.
 *  - the two desktop rails stand beside the 560px column, 150px clear, pinned to the window
 *    because the page itself never scrolls.
 * /assets/rtg-ads.js owns how both look and behave.
 */
(function () {
  'use strict';
  /* THE UNITS EXIST (the owner made them, 2026-10-30). The launch commit puts these ids in the two
     tables below and records them in scripts/ad-units.json; until then the tables stay zeros, because
     the posture check counts the registry naming this game as a link to it:
       last-shot-sticky 2020128758, last-shot-rail-left 6615473173, last-shot-rail-right 6587553014 */
  var STICKY_SLOT = { sticky: '0000000000' };                          // last-shot-sticky
  var RAIL_SLOTS = { left: '0000000000', right: '0000000000' };        // last-shot-rail-left, last-shot-rail-right
  function go() {
    if (!window.RTG_ADS) return;
    RTG_ADS.sticky(true, STICKY_SLOT.sticky, 'last-shot');
    RTG_ADS.rails(true, RAIL_SLOTS, function () { return document.querySelector('.app'); }, { fixed: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
