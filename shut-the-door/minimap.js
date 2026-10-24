/* Shut The Door: the live field minimap. window.STD_MINIMAP.
 *
 * The field from above, the way a broadcast draws it: home plate at the bottom, centre field at the
 * top, left field on the left. After each play the minimap shows, and each in-play pitch of the
 * outing puts one dot where the ball was hit to. A take, a strike or a foul adds no dot.
 *
 *   var mini = STD_MINIMAP.create(el);  builds the field into el (a div over the scene)
 *   mini.show(pitchResult);             after a play: shows the field, and a dot if the ball was in play
 *   mini.reset();                       a new outing: the field goes, the dots go
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
  var NEW_DOT = { r: 20 };             // model units: 500 wide, drawn at about 0.15 px a unit on a phone

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

  /* the field in feet, with y flipped for SVG (SVG y runs down; the field runs out from home) */
  function P(x, y) { return x + ' ' + (-y); }
  /* the static field. The fence is a quadratic through (0, FENCE) from the two corners: its control
     point sits at 2 * FENCE - the corners' height, so the curve's middle lands on FENCE. */
  function fieldMarkup() {
    var lx = LINE * Math.SQRT1_2, ctrl = 2 * FENCE - lx;
    var inf = 95, in45 = inf * Math.SQRT1_2, b = 90 * Math.SQRT1_2;
    var fence = 'M' + P(-lx, lx) + ' Q' + P(0, ctrl) + ' ' + P(lx, lx);
    var base = function (x, y) { return '<rect class="mm-base" x="-7" y="-7" width="14" height="14" transform="translate(' + x + ' ' + (-y) + ') rotate(45)"/>'; };
    return '' +
      '<path class="mm-grass" d="M' + P(0, 0) + ' L' + P(-lx, lx) + ' Q' + P(0, ctrl) + ' ' + P(lx, lx) + ' Z"/>' +
      '<path class="mm-dirt" d="M' + P(0, 0) + ' L' + P(-in45, in45) + ' A' + inf + ' ' + inf + ' 0 0 1 ' + P(in45, in45) + ' Z"/>' +
      '<path class="mm-line" d="M' + P(0, 0) + ' L' + P(-lx, lx) + ' M' + P(0, 0) + ' L' + P(lx, lx) + '"/>' +
      '<path class="mm-fence" d="' + fence + '"/>' +
      '<path class="mm-path" d="M' + P(0, 0) + ' L' + P(b, b) + ' L' + P(0, 2 * b) + ' L' + P(-b, b) + ' Z"/>' +
      '<circle class="mm-mound" cx="0" cy="-60.5" r="9"/>' +
      base(b, b) + base(0, 2 * b) + base(-b, b) +
      '<path class="mm-plate" d="M-9 -2 L9 -2 L9 5 L0 11 L-9 5 Z"/>';
  }

  function create(el) {
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '-250 -430 500 470');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.innerHTML = fieldMarkup() + '<g class="mm-dots"></g>';
    el.appendChild(svg);
    var dots = svg.querySelector('.mm-dots');
    var timers = [];

    function reset() {
      timers.forEach(clearTimeout); timers = [];
      dots.innerHTML = '';
      el.hidden = true;
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
    return { show: show, reset: reset, dots: function () { return dots.querySelectorAll('.mm-dot').length; } };
  }

  window.STD_MINIMAP = { create: create, spot: spot, estimateFt: estimateFt, FAIR: FAIR };
})();
