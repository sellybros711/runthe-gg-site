/* 4th and What: Home.
 *
 * The page opens here (the owner, 2026-10-31): the 4TH & WHAT banner, then
 * "Draw a play" (the game) beside "Playbook Builder", then the footer. The
 * banner's field runs real plays from the concept library, each simulated
 * by the engine against a defense, named, and then the next.
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
  /* THE PACKAGE (the owner, 2026-11-01: "a package of hundreds of plays that
     rotate on the front screen"): every concept on every formation, both
     ways, with and without jet motion, each against a defense drawn at random.
     A play with no read and no run is left out. The order is shuffled on each
     visit, so the front screen is never the same twice. */
  var V = null, idx = 0, res = null, play = null, t = 0, last = 0, raf = 0, hold = 0, PACK = null;
  var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var SC = A.copy(A.SC); SC.ballOn = 50; SC.distance = 7; SC.down = 3; SC.ballX = E.FIELD_W / 2;
  var F = window.FAW_FORMATIONS;

  function jet(p) {
    var S = R.sides(p), id = (S.strongList || S.right)[1] || (S.strongList || S.right)[0];
    if (!id) return null;
    var O = F.place(p.formation, p.moved), a = O[id], o = a[0] < 0 ? -1 : 1, end = [-o * 2, -2.4];
    var q = A.copy(p), r = null; q.routes.forEach(function (x) { if (x.who === id) r = x; });
    if (r) { var dx = end[0] - a[0], dy = end[1] - a[1]; r.pts = r.pts.map(function (z) { return [z[0] + dx, z[1] + dy]; }); }
    q.motion = { who: id, type: 'jet', pts: [end] };
    return q;
  }
  function pack() {
    if (PACK) return PACK;
    PACK = [];
    F.SETS.forEach(function (s) {
      R.CONCEPTS.forEach(function (c) {
        var base = R.apply(A.emptyPlay(s.id), c.name);
        if (!((base.handoff && base.handoff.to) || base.targets.length)) return;
        var flipped = window.FAW_STUDIO && window.FAW_STUDIO.flip ? window.FAW_STUDIO.flip(base) : null;
        [base, flipped].forEach(function (p) {
          if (!p) return;
          PACK.push(p);
          if (c.kind === 'pass') { var m = jet(p); if (m) PACK.push(m); }
        });
      });
    });
    for (var i = PACK.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), x = PACK[i]; PACK[i] = PACK[j]; PACK[j] = x; }
    return PACK;
  }
  function load() {
    var P = pack();
    play = P[idx % P.length];
    var call = E.CALL_KEYS[Math.floor(Math.random() * E.CALL_KEYS.length)];
    res = E.run(SC, play, Math.floor(Math.random() * 1e9), { call: call });
    t = res.pre && res.pre.length ? res.pre[0].t : 0; hold = 0;
    $('hName').textContent = A.nameFor(play) + ' · vs ' + A.CALL_LABEL[res.callKey];
  }
  function layout() {
    if (!V) V = T.view($('hField'), {});
    V.set({ BX: SC.ballX, Y0: 50, marker: 57, behind: 9, ahead: window.innerWidth < 700 ? 26 : 17, across: T.across() });
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
  window.FAW_HOME = { size: function () { return pack().length; } };
  window.addEventListener('resize', function () { if (A.current() === 'home') start(); });
  document.addEventListener('visibilitychange', function () { if (A.current() === 'home') start(); });
})();
