/* Last Shot's ads (Ads Agent, 2026-10-30, the owner: "put ads down the side banner of last shot
 * and 4th and what, and a sticky ad at the bottom", and "build both now but switch on as part of
 * launch commit"; switched on 2026-11-23, the owner: "ads on at launch").
 *
 * ON. web/play.html carries the Consent Mode defaults, adsbygoogle.js and /assets/rtg-ads.js in its
 * head (check-posture.mjs ADS is true), so:
 *  - THE BOTTOM BANNER (closeable, 300x50, last-shot-sticky) sits under the app on every screen,
 *    play included (the owner's exception for this game). It never covers the game: the app, the
 *    full screen sheets and the toast all end above it (web/play.html, body.rtg-sticky-on), so the
 *    court shrinks to fit and Run It, the result card's buttons, the Daily's Take your shot and the
 *    3D shot cam stay clear of it. An unfilled banner takes no height.
 *  - THE TWO DESKTOP RAILS (160x600, last-shot-rail-left and -right) stand beside the column, 150px
 *    clear, pinned to the window because the page itself never scrolls. The column is 560px under
 *    900px wide and 1100px from there up, so a rail needs a window about 1720px wide (1100 + 2 x
 *    (150 + 160)): a 1920 screen has them, a 1440 laptop does not. rtg-ads.js measures the column
 *    on every resize and builds or removes them.
 * /assets/rtg-ads.js owns how both look and behave. The ids are recorded in scripts/ad-units.json
 * (where: last-shot/m/ads.js, the built copy check-adsense reads).
 */
(function () {
  'use strict';
  var STICKY_SLOT = { sticky: '2020128758' };                          // last-shot-sticky
  var RAIL_SLOTS = { left: '6615473173', right: '6587553014' };        // last-shot-rail-left, last-shot-rail-right
  function go() {
    if (!window.RTG_ADS) return;
    RTG_ADS.sticky(true, STICKY_SLOT.sticky, 'last-shot');
    RTG_ADS.rails(true, RAIL_SLOTS, function () { return document.querySelector('.app'); }, { fixed: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
