/* Shut The Door: the live field minimap. window.STD_MINIMAP.
 *
 * The field from above, the way a broadcast draws it: home plate at the bottom, centre field at the
 * top, left field on the left. After each play the minimap shows, and each in-play pitch of the
 * outing puts one dot where the ball was hit to. A take, a strike or a foul adds no dot.
 *
 *   var mini = STD_MINIMAP.create(el);  builds the field into el (a div over the scene)
 *   mini.show(pitchResult);             after a play: shows the field, and a dot if the ball was in play
 *   mini.reset();                       a new outing: the field goes, the dots go
 *   mini.live(list, inPlay)             every frame of a 3D play: the runners and the ball move (list is
 *                                       3d/inplay.js fieldAt: runners { p, out, alpha } and list.ball,
 *                                       field feet). inPlay shows the field at contact. Read only.
 *   mini.settle(bases)                  after a 3D play: the moving dots go, the engine's bases light
 *                                       (the bases bit mask, 1 first, 2 second, 4 third)
 * With no 3D (the 2D fallback, reduced motion) ui.js calls neither, and the minimap is as it was.
 *   STD_MINIMAP.spot(inPlay)            { x, y } in feet from home, or null. Pure. (tests use it)
 *
 * What the dot is made of, and what it is not:
 *   direction  the spray angle, which the data measured: degrees from centre, negative the left field
 *              side (CONTRACT.md section 6). A spray past 45 degrees is outside the foul lines, so it
 *              gets no dot.
 *   distance   an ESTIMATE from exit velocity and launch angle. Nothing measured. It is not shown as
 *              a number anywhere, and the dot is a plain dot.
 *   colour     one neutral accent. The batting club's colours are not in the data on this page, so the
 *              minimap does not invent them.
 */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var FAIR = 45;                       // the foul lines, in degrees of spray
  var FPS = 1.4667;                    // feet per second for each mph
  var G = 32.2;                        // ft/s/s
  var FENCE = 400, LINE = 330;         // ft: centre field, and down the lines
  /* where each kind of ball usually comes down, in feet from home. The estimate is held to it. */
  var BAND = { line: [90, 330], fly: [120, 420], popup: [30, 140] };
  var FADE_MS = 1800;                  // a new dot stays bright this long, then fades
  var NEW_DOT = { r: 20 };
  var RUN_R = 17, BALL_R = 11;         // model units: the live runner and ball dots
  var REACH = 425;                     // ft: a ball past the drawn field is held at its edge
  /* the base paths in feet from home: home, first, second, third, home (inplay-plan.js BASE) */
  var B = 90 * Math.SQRT1_2;
  var PATH = [[0, 0], [B, B], [0, 2 * B], [-B, B], [0, 0]];             // model units: 500 wide, drawn at about 0.15 px a unit on a phone

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  /* ESTIMATE of how far the ball comes down, in feet. A ball's range with no drag is v^2 sin 2a / g,
     about twice what a real ball covers, so it is halved. A ground ball is fielded close, so it
     follows exit velocity instead. Each kind is then held to its band. */
  function estimateFt(bb, ev, la) {
    if (bb === 'ground') return clamp(ev * 1.3, 40, 160);
    var v = ev * FPS, a = clamp(la, 0, 80) * Math.PI / 180;
    var air = 0.5 * v * v * Math.sin(2 * a) / G;
    var band = BAND[bb] || BAND.fly;
    return clamp(air, band[0], band[1]);
  }

  /* where a batted ball landed on the field, in feet from home (x: right, y: out to centre), or null
     when it has no place on the field (no batted-ball data, or outside the lines) */
  function spot(ip) {
    if (!ip || ip.spray == null || ip.ev == null || ip.la == null || !ip.bb) return null;
    if (Math.abs(ip.spray) > FAIR) return null;
    var ft = estimateFt(ip.bb, ip.ev, ip.la);
    var th = ip.spray * Math.PI / 180;
    return { x: round1(ft * Math.sin(th)), y: round1(ft * Math.cos(th)) };
  }
  function round1(v) { return Math.round(v * 10) / 10; }

  /* a place on the paths (0 home, 1..3 the bases, 4 home again) in feet from home. Pure. */
  function pathFt(p) {
    p = clamp(+p || 0, 0, 4);
    var k = Math.min(3, Math.floor(p)), t = p - k, a = PATH[k], c = PATH[k + 1];
    return { x: round1(a[0] + (c[0] - a[0]) * t), y: round1(a[1] + (c[1] - a[1]) * t) };
  }

  /* the field in feet, with y flipped for SVG (SVG y runs down; the field runs out from home) */
  function P(x, y) { return x + ' ' + (-y); }
  /* the static field. The fence is a quadratic through (0, FENCE) from the two corners: its control
     point sits at 2 * FENCE - the corners' height, so the curve's middle lands on FENCE. */
  function fieldMarkup() {
    var lx = LINE * Math.SQRT1_2, ctrl = 2 * FENCE - lx;
    var inf = 95, in45 = inf * Math.SQRT1_2, b = 90 * Math.SQRT1_2;
    var fence = 'M' + P(-lx, lx) + ' Q' + P(0, ctrl) + ' ' + P(lx, lx);
    var base = function (x, y, n) { return '<rect class="mm-base" data-base="' + n + '" x="-7" y="-7" width="14" height="14" transform="translate(' + x + ' ' + (-y) + ') rotate(45)"/>'; };
    return '' +
      '<path class="mm-grass" d="M' + P(0, 0) + ' L' + P(-lx, lx) + ' Q' + P(0, ctrl) + ' ' + P(lx, lx) + ' Z"/>' +
      '<path class="mm-dirt" d="M' + P(0, 0) + ' L' + P(-in45, in45) + ' A' + inf + ' ' + inf + ' 0 0 1 ' + P(in45, in45) + ' Z"/>' +
      '<path class="mm-line" d="M' + P(0, 0) + ' L' + P(-lx, lx) + ' M' + P(0, 0) + ' L' + P(lx, lx) + '"/>' +
      '<path class="mm-fence" d="' + fence + '"/>' +
      '<path class="mm-path" d="M' + P(0, 0) + ' L' + P(b, b) + ' L' + P(0, 2 * b) + ' L' + P(-b, b) + ' Z"/>' +
      '<circle class="mm-mound" cx="0" cy="-60.5" r="9"/>' +
      base(b, b, 1) + base(0, 2 * b, 2) + base(-b, b, 3) +
      '<path class="mm-plate" d="M-9 -2 L9 -2 L9 5 L0 11 L-9 5 Z"/>';
  }

  function create(el) {
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '-250 -430 500 470');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.innerHTML = fieldMarkup() + '<g class="mm-dots"></g><g class="mm-live"></g>';
    el.appendChild(svg);
    var dots = svg.querySelector('.mm-dots'), liveG = svg.querySelector('.mm-live');
    var bases = svg.querySelectorAll('.mm-base');
    var timers = [], runs = [], ball = null;

    function circle(cls, r) {
      var c = document.createElementNS(NS, 'circle');
      c.setAttribute('class', cls); c.setAttribute('r', r);
      liveG.appendChild(c);
      return c;
    }
    function clearLive() { liveG.innerHTML = ''; runs = []; ball = null; svg.classList.remove('mm-moving'); }
    function light(mask) {
      for (var i = 0; i < bases.length; i++) bases[i].classList.toggle('on', !!(mask & (1 << i)));
    }

    function reset() {
      timers.forEach(clearTimeout); timers = [];
      dots.innerHTML = '';
      clearLive();
      light(0);
      svg.classList.remove('mm-lit');
      el.hidden = true;
    }

    /* a frame of the 3D play: one dot a runner where he is on the paths, one for the ball. Only reads. */
    function live(list, inPlay) {
      if (!list) return;
      if (inPlay) el.hidden = false;
      if (el.hidden) return;
      svg.classList.add('mm-lit', 'mm-moving');
      light(0);
      while (runs.length < list.length) runs.push(circle('mm-run', RUN_R));
      while (runs.length > list.length) liveG.removeChild(runs.pop());
      list.forEach(function (r, i) {
        var q = pathFt(r.p), c = runs[i];
        c.setAttribute('cx', q.x); c.setAttribute('cy', -q.y);
        c.setAttribute('opacity', r.alpha == null ? 1 : r.alpha);
        c.classList.toggle('out', !!r.out);
      });
      var b = list.ball;
      if (b && isFinite(b.x) && isFinite(b.y)) {
        if (!ball) ball = circle('mm-ball', BALL_R);
        var d = Math.hypot(b.x, b.y), k = d > REACH ? REACH / d : 1;
        ball.setAttribute('cx', round1(b.x * k)); ball.setAttribute('cy', round1(-b.y * k));
      } else if (ball) { liveG.removeChild(ball); ball = null; }
    }

    /* the play is over: the moving dots go and the bases the engine says are taken light */
    function settle(mask) {
      clearLive();
      svg.classList.add('mm-lit');
      light(mask | 0);
    }

    /* after a play: the field shows, and a dot if the ball was in play and has a place on the field */
    function show(pr) {
      el.hidden = false;
      if (!pr || pr.result !== 'in_play') return false;
      var p = spot(pr.inPlay);
      if (!p) return false;
      var prev = dots.querySelectorAll('.mm-dot.now');
      for (var i = 0; i < prev.length; i++) prev[i].classList.remove('now');
      var c = document.createElementNS(NS, 'circle');
      c.setAttribute('class', 'mm-dot now');
      c.setAttribute('cx', p.x);
      c.setAttribute('cy', -p.y);
      c.setAttribute('r', NEW_DOT.r);
      c.setAttribute('data-n', pr.n == null ? '' : String(pr.n));
      c.setAttribute('data-bb', pr.inPlay.bb);
      dots.appendChild(c);
      timers.push(setTimeout(function () { c.classList.remove('now'); }, FADE_MS));
      return true;
    }

    el.hidden = true;
    return { show: show, reset: reset, live: live, settle: settle, dots: function () { return dots.querySelectorAll('.mm-dot').length; } };
  }

  window.STD_MINIMAP = { create: create, spot: spot, estimateFt: estimateFt, pathFt: pathFt, FAIR: FAIR };
})();
