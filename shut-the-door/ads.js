/* Shut The Door's ads (Ads Agent, 2026-11-01, the owner: "add ads to shut the door because we are
 * going to flip it live today. I want them in optimal locations that do not interfere with
 * gameplay. There also should be a video ad for guests in survivor mode in between each round and
 * pro users will bypass the video ads", and "we like sticky ads on the bottom").
 *
 * READY UNTIL LAUNCH. The page carries no ad tag while check-posture.mjs holds it unlisted, so
 * every call here does nothing. The launch commit adds the Consent Mode defaults, adsbygoogle.js
 * (with the H5 games ad break shim) and /assets/rtg-ads.js to the head, and from then on:
 *  - THE BOTTOM BANNER (closeable, 300x50) sits on the home, the result, the board and the
 *    Survivor screen. Never on the mound, and never on the two tap-to-skip moments (his team's
 *    half, #s-half, and the moment between Survivor spots, #s-next): a tap anywhere there is play,
 *    so a banner would catch it.
 *  - THE TWO DESKTOP RAILS stand beside the column on the same screens, 150px clear.
 *  - THE VIDEO BREAK: between two Survivor spots, a player who is not Pro gets one H5 games ad
 *    break (adBreak, type 'next'). Google decides whether an ad plays (frequency caps, and none at
 *    all until the account is approved for H5 games ads); either way the next spot starts when the
 *    break is done. A Pro player never calls it.
 * /assets/rtg-ads.js owns how the banner and the rails look and behave.
 */
(function () {
  'use strict';
  var STICKY_SLOT = { sticky: '0000000000' };                          // shut-the-door-sticky
  var RAIL_SLOTS = { left: '0000000000', right: '0000000000' };        // shut-the-door-rail-left, shut-the-door-rail-right
  var ON = ['s-home', 's-result', 's-board', 's-surv'];

  function screen(id) {
    if (!window.RTG_ADS) return;
    var on = ON.indexOf(id) >= 0;
    RTG_ADS.sticky(on, STICKY_SLOT.sticky, 'shut-the-door');
    RTG_ADS.rails(on, RAIL_SLOTS, function () { return document.querySelector('.app'); });
  }

  /* Resolves when the next spot may start. If no ad starts within BREAK_WAIT the break is treated
     as done, so a slow or blocked ad never holds the run; once an ad has started, it waits for
     Google's adBreakDone. */
  var BREAK_WAIT = 2500;
  function between(pro) {
    return new Promise(function (res) {
      if (pro || typeof window.adBreak !== 'function') return res();
      var done = false, started = false;
      var fin = function () { if (done) return; done = true; res(); };
      var t = setTimeout(function () { if (!started) fin(); }, BREAK_WAIT);
      try {
        window.adBreak({
          type: 'next',
          name: 'survivor-next',
          beforeAd: function () { started = true; clearTimeout(t); },
          afterAd: function () {},
          adBreakDone: function () { clearTimeout(t); fin(); }
        });
      } catch (e) { clearTimeout(t); fin(); }
    });
  }

  window.STD_ADS = { screen: screen, between: between };
})();
