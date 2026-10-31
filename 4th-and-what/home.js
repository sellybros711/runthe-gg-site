/* 4th and What: Home.
 *
 * The page opens here (the owner, 2026-10-31: "there should be a homepage
 * that points you in the direction of your options whether you're looking
 * to play or build"). Two big doors, Play and Build, and the four other
 * places as tiles. The field at the top runs real plays from the concept
 * library, each one simulated by the engine against a defense, named, and
 * then the next.
 *
 * Decoration only: it saves nothing. It draws while Home is showing and the
 * tab is visible, and holds one still picture when the player asks for less
 * motion.
 *
 * Plain script, no exports.
 */
(function () {
  'use strict';
  var A = window.FAW_APP, E = window.FAW_ENGINE, R = window.FAW_ROUTES, T = window.FAW_TURF;
  var $ = function (id) { return document.getElementById(id); };
  var SHOW = [['Snag', 'gun3x1', 'cover3'], ['Mesh', 'gun2x2', 'cover1'], ['Inside Zone', 'iform', 'cover2'], ['Flood', 'gun3x1', 'cover3'], ['Smash', 'gun2x2', 'cover2']];
  var V = null, idx = 0, res = null, play = null, t = 0, last = 0, raf = 0, hold = 0;
  var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var SC = A.copy(A.SC); SC.ballOn = 50; SC.distance = 7; SC.down = 3; SC.ballX = E.FIELD_W / 2;

  function load() {
    var s = SHOW[idx % SHOW.length];
    play = R.apply(A.emptyPlay(s[1]), s[0]);
    res = E.run(SC, play, 4242 + idx * 7, { call: s[2] });
    t = res.pre && res.pre.length ? res.pre[0].t : 0; hold = 0;
    $('hName').textContent = A.nameFor(play) + ' · vs ' + A.CALL_LABEL[res.callKey];
  }
  function layout() {
    if (!V) V = T.view($('hField'), {});
    V.set({ BX: SC.ballX, Y0: 50, marker: 57, behind: 10, ahead: 24, across: T.across() });
    V.layout();
  }
  function frame(now) {
    raf = 0;
    if (A.current() !== 'home' || document.hidden) { last = 0; return; }
    if (!res) load();
    var end = res.frames[res.frames.length - 1].t;
    if (now && last) {
      var dt = (now - last) / 1000;
      if (t < end) t = Math.min(end, t + dt); else hold += dt;
    }
    last = now || 0;
    if (hold > 1.6) { idx++; load(); }
    V.field();
    if (still) V.play(play, { reads: true });
    else V.frame(res, t, { play: play, icons: true });
    if (!still) raf = requestAnimationFrame(frame);
  }
  function start() { layout(); if (!raf) { last = 0; raf = requestAnimationFrame(frame); } }

  A.on('home', start);
  window.addEventListener('resize', function () { if (A.current() === 'home') start(); });
  document.addEventListener('visibilitychange', function () { if (A.current() === 'home') start(); });
})();
