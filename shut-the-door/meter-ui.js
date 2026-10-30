/* Shut The Door: the release meter on the page, the combo (the owner, 2026-10-26: "Vertical bar for
 * power, and then the ring around the circle starts to go for accuracy and you have to tap when it is
 * as close to the circle as you can for the most accuracy").
 *
 * window.STD_METER_UI, after meter.js. meter.js keeps every number (the power sweep, the ring's
 * speed at that power, the bands, q, perfect, the word); this file is only how the meter looks and
 * takes the tap. The Strike Zone brand, its tokens and its two faces.
 *
 * THREE PARTS.
 *   the column  power, a vertical bar beside the zone on the side away from the hitter, off the
 *               zone, the batter and the plate (it carries data-hud, so the glove keeps off it too).
 *               It goes once the release is stopped (the power it set stays in the panel).
 *               A fill runs up through soft, normal and max and back; the tap stops it (e, 0..1).
 *               Its top is perfect power (meter.js PERFECT_E). Shown only when STD_METER.POWER.
 *   the ring    the release. It is not there until power is set (the owner's rule). Then it closes
 *               onto the aim point at the speed power sets (meter.js ringMs(e): max is fastest), past
 *               it and back, until the tap. The target circle sits on the crosshair with the soft
 *               band and the bright band around it as rings. q is qOf(ringErrAt(t, e), command, e).
 *   the panel   over the pitch buttons and the throw button, as before: the verb, the pitch and the
 *               spot, the two stops as they land, and the big thumb target. A tap anywhere on it (or
 *               on the column) is the stop; space or enter on a keyboard.
 *
 * SMOOTH (the owner, 2026-10-26: "the meter is laggy"). Frames write transforms only: the column's
 * fill slides in a clip, its needle is a rail slid by translate3d, the ring is one element scaled
 * down from its widest (so it stays crisp). Where each one is comes from the clock (the stage's
 * elapsed ms through meter.js), never a frame count, and a stop reads the tap's own timestamp, so a
 * dropped frame never moves e or q. The mound holds still meanwhile (stage.js hush, from ui.js).
 *
 * PERFECT AND PERFECT (the owner, 2026-10-26: "something that's a little more baseball themed"),
 * execution only, never the grade, under a second and never over the pitch. Both stops perfect
 * (meter.js perfectOf): the red stitches of a baseball light up round the aim point and spin a
 * quarter turn as they open and fade, with a sharp double buzz like a mitt's pop; in flight the ball
 * leaves a slight gold sparkle (3d/pitch.js buildSparkle, from the same perfectOf on the call). One
 * perfect: the stitches flash smaller, still, with a short buzz. Reduced motion: the stitches only
 * fade in and out, nothing moves. The ring fades a beat after the stop, so the pitch is seen.
 *
 * THE CUE (the owner, 2026-10-30: "It needs to be clear you must tap the bottom bar to time your
 * pitches"). The panel says so itself, on the panel, while it waits for a tap: "tap to set power"
 * with "stop it where you want it" under it, then "tap to release" with "as the ring hits the
 * circle". A dot with a signal ring breathes beside it so the panel reads as live; on a mouse and
 * keyboard "or press space" follows it, with a key cap. It never opens anything: it is the panel's own words,
 * and it goes the moment the tap lands (the one quiet word takes its place, as before). Once a
 * player has finished QUIET_AFTER releases (a count in localStorage, std_meter_taps) the panel is
 * the quiet one again: the verb and the call on top, and "tap" in the lit step. No storage, the
 * cue stays.
 *
 * create(el) -> { el, run(opts), cancel(), hide(), running(), stage() }
 *   run({ command, verb, label, practice, repeat, place, quick, onSnap, onStage, onPerfect }) resolves
 *   { q, err, word, e, perfect } on the release (e only with power), or null when cancelled.
 *   place: { aim: the aim layer's box, x, y: the crosshair's centre, side: 'left' or 'right' (the
 *   column's side, away from the hitter) }, all in viewport px.
 */
(function () {
'use strict';
var C = window.STD_CONTRACT, MT = window.STD_METER;
if (!MT) return;

var LOCK_MS = 260;          // the pause between the power stop and the ring, so the lock is seen
var GUARD_MS = 120;         // a tap this soon after a stage starts is the tap that started it, or a bounce
var FADE_MS = 380;          // the ring holds this long after the release, then fades off the pitch
var COL_W = 40, GAP = 12, EDGE = 16;
var RT = 24;                // the target circle's radius, round the crosshair
var QUIET_AFTER = 10;       // releases finished before the cue steps down to a quiet "tap"
var TAPS_KEY = 'std_meter_taps';
var CUE = { effort: ['tap to set power', 'stop it where you want it'], acc: ['tap to release', 'as the ring hits the circle'] };

function tapsUsed() { try { return Math.max(0, parseInt(localStorage.getItem(TAPS_KEY), 10) || 0); } catch (e) { return 0; } }
function countTap() { try { localStorage.setItem(TAPS_KEY, String(Math.min(999, tapsUsed() + 1))); } catch (e) {} }

function effortOn() { return MT.EFFORT === true; }
function reduced() { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
function buzz(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }
function zoneOf(e) { return e >= MT.PERFECT_E ? 'perfect' : e < 1 / 3 ? 'soft' : e < 2 / 3 ? 'normal' : 'max'; }
function pct(x) { return (Math.max(0, Math.min(1, x)) * 100).toFixed(3) + '%'; }
function ty(x, f) { x.style.transform = 'translate3d(0,' + (f * 100).toFixed(3) + '%,0)'; }
function anim(x, kf, ms) { if (reduced() || !x.animate) return; try { x.animate(kf, { duration: ms, easing: 'cubic-bezier(.2,.8,.3,1)' }); } catch (e) {} }
/* a baseball's two seams round the target, each with its red stitches (a V every few px along it) */
function seams() {
  var S = RT + 14, out = '';
  function cub(p, t) { var u = 1 - t; return [u * u * u * p[0] + 3 * u * u * t * p[2] + 3 * u * t * t * p[4] + t * t * t * p[6], u * u * u * p[1] + 3 * u * u * t * p[3] + 3 * u * t * t * p[5] + t * t * t * p[7]]; }
  [-1, 1].forEach(function (sd) {
    var p = [sd * S * 0.62, -S * 0.78, sd * S * 0.18, -S * 0.3, sd * S * 0.18, S * 0.3, sd * S * 0.62, S * 0.78];
    out += '<path class="rm-seam" d="M' + p[0] + ' ' + p[1] + 'C' + p.slice(2).join(' ') + '"/>';
    for (var k = 1; k < 10; k++) {
      var a = cub(p, k / 10), b = cub(p, k / 10 + 0.01), dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l * 4.5, ny = dx / l * 4.5, tx = dx / l * 2.2, ty0 = dy / l * 2.2;
      out += '<path class="rm-stitch" d="M' + (a[0] + nx - tx).toFixed(1) + ' ' + (a[1] + ny - ty0).toFixed(1) + 'L' + a[0].toFixed(1) + ' ' + a[1].toFixed(1) + 'L' + (a[0] - nx - tx).toFixed(1) + ' ' + (a[1] - ny - ty0).toFixed(1) + '"/>';
    }
  });
  return '<svg class="rm-seams" viewBox="' + (-S - 8) + ' ' + (-S - 8) + ' ' + (2 * S + 16) + ' ' + (2 * S + 16) + '" aria-hidden="true">' +
    '<circle class="rm-hide" cx="0" cy="0" r="' + S + '"/>' + out + '</svg>';
}

function create(el) {
  el.classList.add('relm');
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '-1');
  el.innerHTML =
    '<div class="rm-cue" aria-hidden="true"><i class="rm-tap"></i><span class="rm-cue-t"><b></b><span class="rm-sub"><small></small><span class="rm-key">or press <kbd>space</kbd></span></span></span></div>' +
    '<div class="rm-head"><b class="rm-verb"></b><span class="rm-call"></span><span class="rm-word" aria-live="polite"></span></div>' +
    '<div class="rm-steps"><div class="rm-step rm-s-pow"><b>power</b><span></span></div><div class="rm-step rm-s-rel"><b>release</b><span></span></div></div>';
  var q = function (s, root) { return (root || el).querySelector(s); };
  var cueB = q('.rm-cue-t b'), cueS = q('.rm-cue-t small');
  var verb = q('.rm-verb'), call = q('.rm-call'), word = q('.rm-word');
  var sPow = q('.rm-s-pow'), sRel = q('.rm-s-rel'), vPow = q('.rm-s-pow span'), vRel = q('.rm-s-rel span');
  var host = (el.closest && el.closest('.screen')) || document.body;

  var col = document.createElement('div');
  col.className = 'rm-col';
  col.setAttribute('data-hud', '');
  col.hidden = true;
  col.innerHTML = '<i class="rm-cclip"><i class="rm-cfill"><i class="rm-cgrad"></i></i></i><span class="rm-czones"><i></i><i></i><i></i></span>' +
    '<i class="rm-ccap"></i><i class="rm-ctop"></i><i class="rm-cneedle"></i><i class="rm-lock"></i><span class="rm-clbl">power</span>';
  host.appendChild(col);
  var ccap = q('.rm-ccap', col), cfill = q('.rm-cfill', col), cgrad = q('.rm-cgrad', col), cneedle = q('.rm-cneedle', col), clock = q('.rm-lock', col), ctop = q('.rm-ctop', col);

  var ring = document.createElement('div');
  ring.className = 'rm-ring';
  ring.hidden = true;
  ring.innerHTML = '<svg class="rm-rsvg" aria-hidden="true"></svg><i class="rm-rmove"></i>' + seams();
  host.appendChild(ring);
  var rsvg = q('.rm-rsvg', ring), rmove = q('.rm-rmove', ring), seam = q('.rm-seams', ring);

  var live = null, geo = { R0: 150, K: 180 }, fadeT = 0;

  function setStage(s) {
    el.dataset.stage = s;
    el.setAttribute('aria-label', s === 'effort' ? 'Power. Tap to set it.' : 'Release. Tap when the ring hits the circle.');
    sPow.classList.toggle('on', s === 'effort'); sRel.classList.toggle('on', s === 'acc');
    /* the cue says the tap on the panel for this stop; the quiet panel says "tap" in the lit step */
    var c = CUE[s] || CUE.acc;
    cueB.textContent = c[0]; cueS.textContent = c[1];
    if (!el.classList.contains('cue')) {
      if (s === 'effort') vPow.textContent = 'tap';
      else { vRel.textContent = 'tap'; if (vPow.textContent === 'tap') vPow.textContent = '-'; }
    }
    if (live && live.opts.onStage) live.opts.onStage(s);
  }
  /* the ring's radius at pos (0..1 of its travel): R0 at the start, the target at the mark, a straight map */
  function rad(pos) { return Math.max(0, RT + (MT.MARK - pos) * geo.K); }
  function placeRing(pos) { rmove.style.transform = 'scale(' + (Math.max(0.001, rad(pos) / geo.R0)).toFixed(4) + ')'; }
  function placeEffort(e) {
    ty(cfill, 1 - e); ty(cgrad, e - 1); ty(cneedle, -e);
    var z = zoneOf(e);
    if (col.dataset.zone !== z) col.dataset.zone = z;
  }
  /* where the column and the ring go: beside the aim layer on the side away from the hitter, kept
     on screen; the ring centred on the crosshair, as wide as the screen allows */
  function layout(place) {
    var W = window.innerWidth || 390, Hs = window.innerHeight || 844;
    var a = place && place.aim, x = place && place.x, y = place && place.y;
    if (!a) a = { left: W / 2 - 80, right: W / 2 + 80, top: Hs * 0.4, bottom: Hs * 0.4 + 200, width: 160, height: 200 };
    if (x == null) { x = (a.left + a.right) / 2; y = (a.top + a.bottom) / 2; }
    /* beside the strike zone itself (the aim layer's middle 3x3; its shadow cells are already aimed) */
    var z = (place && place.zone) || a;
    var h = Math.max(150, Math.min(240, a.height));
    /* on the away side, closing the gap down to 4 px before it would ever go to the hitter's side */
    function fit(r) {
      var l = r ? z.right + GAP : z.left - GAP - COL_W;
      l = Math.max(EDGE, Math.min(W - EDGE - COL_W, l));
      var ok = r ? l >= z.right + 4 : l + COL_W <= z.left - 4;
      return ok ? l : null;
    }
    var right = place && place.side === 'right';
    var left = fit(right);
    if (left == null) left = fit(!right);
    if (left == null) left = right ? W - EDGE - COL_W : EDGE;
    col.style.left = left + 'px'; col.style.top = (a.top + (a.height - h) / 2) + 'px'; col.style.height = h + 'px';
    geo.R0 = Math.max(110, Math.min(170, Math.min(W, Hs) * 0.4));
    geo.K = (geo.R0 - RT) / MT.MARK;
    ring.style.left = x + 'px'; ring.style.top = y + 'px';
    rmove.style.width = rmove.style.height = (2 * geo.R0) + 'px';
    rmove.style.margin = (-geo.R0) + 'px 0 0 ' + (-geo.R0) + 'px';
  }
  /* the target circle and the two bands round it, drawn once a pitch (they do not move) */
  function drawBands(e) {
    var b = MT.ringBands(live.opts.command, e, live.quick), R = geo.R0, out = '';
    function annulus(cls, half) {
      var r0 = rad(MT.MARK + half), r1 = rad(MT.MARK - half);
      return '<circle class="' + cls + '" cx="0" cy="0" r="' + ((r0 + r1) / 2).toFixed(2) + '" stroke-width="' + Math.max(1.5, r1 - r0).toFixed(2) + '"/>';
    }
    out += annulus('rm-rgood', b.good) + annulus('rm-rbest', b.best) + '<circle class="rm-rtarget" cx="0" cy="0" r="' + RT + '"/>';
    rsvg.setAttribute('viewBox', (-R) + ' ' + (-R) + ' ' + (2 * R) + ' ' + (2 * R));
    rsvg.style.width = rsvg.style.height = (2 * R) + 'px';
    rsvg.style.margin = (-R) + 'px 0 0 ' + (-R) + 'px';
    rsvg.innerHTML = out;
  }
  function tick(now) {
    if (!live || live.done) return;
    var t = Math.max(0, now - live.t0);
    if (live.stage === 'effort') placeEffort(MT.powerAt(t, live.quick));
    else if (live.stage === 'acc') placeRing(MT.ringAt(t, live.e, live.quick).pos);
    live.raf = requestAnimationFrame(tick);
  }
  function startAcc() {
    if (!live) return;
    live.stage = 'acc';
    drawBands(live.e);
    placeRing(0);
    ring.hidden = false;
    ring.classList.remove('is-out', 'is-best', 'is-perfect');
    live.t0 = performance.now();
    setStage('acc');
  }
  function burst(x, big) {
    x.classList.remove('go'); x.classList.toggle('big', !!big);
    if (reduced() || !x.animate) return;
    x.animate(big ? [{ opacity: 1, transform: 'scale(.35)' }, { opacity: .9, offset: .35 }, { opacity: 0, transform: 'scale(2.6)' }]
      : [{ opacity: 1, transform: 'scale(.5)' }, { opacity: 0, transform: 'scale(1.5)' }], { duration: big ? 620 : 420, easing: 'cubic-bezier(.15,.85,.3,1)' });
  }
  function stop(ts) {
    if (!live || live.done) return;
    var t = (ts || performance.now()) - live.t0;
    if (t < GUARD_MS) return;
    if (live.stage === 'effort') {
      var e = MT.powerAt(t, live.quick);
      live.e = e;
      live.stage = 'lock';
      placeEffort(e);
      clock.style.top = pct(1 - e);
      burst(clock, false);
      col.classList.add('is-set');
      vPow.textContent = zoneOf(e);
      if (e >= MT.PERFECT_E) {
        col.classList.add('is-perfect'); sPow.classList.add('perfect');
        anim(ctop, [{ transform: 'scaleY(1)', opacity: 1 }, { transform: 'scaleY(1.6)', opacity: 1, offset: .3 }, { transform: 'scaleY(1)', opacity: 1 }], 360);
        buzz(18);
      }
      live.lockT = setTimeout(startAcc, LOCK_MS);
      if (live.opts.onStage) live.opts.onStage('acc');
      return;
    }
    if (live.stage !== 'acc') return;
    live.done = true;
    cancelAnimationFrame(live.raf);
    var n = MT.ringAt(t, live.e, live.quick);
    placeRing(n.pos);
    var err = MT.ringErrAt(t, live.e, live.quick);
    var qq = live.e == null ? MT.qOf(err, live.opts.command, undefined, live.quick) : MT.qOf(err, live.opts.command, live.e, live.quick);
    var w = MT.wordOf(qq, err), pf = MT.perfectOf(live.e, qq);
    el.classList.add('is-done');
    el.classList.toggle('is-best', qq >= MT.BEST_Q);
    el.classList.toggle('is-good', qq >= MT.GOOD_Q && qq < MT.BEST_Q);
    ring.classList.toggle('is-best', qq >= MT.BEST_Q);
    col.hidden = true;                        // power is in the panel now; the pitch gets the field
    var extra = live.opts.practice && C.spreadOf ? ' · miss ' + C.spreadOf(qq, live.opts.repeat).toFixed(2) + 'x' : '';
    word.textContent = w + extra;
    vRel.textContent = 'q ' + qq.toFixed(2);
    countTap();
    if (pf.release) sRel.classList.add('perfect');
    if (qq >= MT.BEST_Q && live.opts.onSnap) live.opts.onSnap(qq);
    celebrate(pf);
    /* the ring holds a beat on the stop, then gets off the pitch */
    clearTimeout(fadeT);
    fadeT = setTimeout(function () { ring.classList.add('is-out'); }, FADE_MS);
    var res = live.resolve, out = { q: qq, err: Math.round(err), word: w, perfect: pf };
    if (live.e != null) out.e = live.e;
    detach();
    res(out);
  }
  /* the stitches light up: both perfect, they open and spin a quarter turn; one, a small still flash */
  function celebrate(pf) {
    var level = pf.both ? 2 : pf.release ? 1 : 0;
    if (!level) return;
    if (live.opts.onPerfect) live.opts.onPerfect(level);
    ring.classList.toggle('is-perfect', level === 2);
    el.classList.toggle('is-perfect', level === 2);
    buzz(level === 2 ? [14, 36, 42] : 16);
    if (!seam.animate) return;
    var kf = reduced() ? [{ opacity: 0 }, { opacity: 1, offset: .25 }, { opacity: 0 }]
      : level === 2 ? [{ opacity: 0, transform: 'scale(.7) rotate(0deg)' }, { opacity: 1, transform: 'scale(1) rotate(40deg)', offset: .3 }, { opacity: 0, transform: 'scale(1.55) rotate(95deg)' }]
        : [{ opacity: 0, transform: 'scale(.85)' }, { opacity: .85, transform: 'scale(.95)', offset: .35 }, { opacity: 0, transform: 'scale(1.05)' }];
    try { seam.animate(kf, { duration: level === 2 ? 700 : 420, easing: 'cubic-bezier(.2,.8,.3,1)' }); } catch (x) {}
  }
  function onDown(e) {
    e.preventDefault();
    var now = performance.now(), ts = e.timeStamp;
    stop(typeof ts === 'number' && ts > 0 && Math.abs(now - ts) < 500 ? ts : now);
  }
  function onKey(e) {
    if (!live || live.done) return;
    if (e.key === 'Escape') { e.preventDefault(); cancel(); return; }
    if (e.repeat) return;
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); stop(performance.now()); }
  }
  function detach() {
    el.removeEventListener('pointerdown', onDown);
    col.removeEventListener('pointerdown', onDown);
    document.removeEventListener('keydown', onKey, true);
  }
  function cancel() {
    if (!live) return;
    cancelAnimationFrame(live.raf);
    clearTimeout(live.lockT);
    var res = live.resolve;
    detach();
    live = null;
    hide();
    res(null);
  }
  function hide() {
    el.hidden = true; col.hidden = true; ring.hidden = true;
    clearTimeout(fadeT);
    el.classList.remove('is-done', 'is-best', 'is-good', 'is-perfect');
    col.classList.remove('is-set', 'is-perfect');
    ring.classList.remove('is-out', 'is-best', 'is-perfect');
    sPow.classList.remove('perfect', 'on'); sRel.classList.remove('perfect', 'on');
    word.textContent = ''; vPow.textContent = ''; vRel.textContent = '';
    live = null;
  }
  function run(opts) {
    if (live) cancel();
    hide();
    try { seam.getAnimations().forEach(function (a) { a.cancel(); }); } catch (x) {}
    var eff = effortOn();
    el.classList.toggle('two', eff);
    el.classList.toggle('cue', tapsUsed() < QUIET_AFTER);
    sPow.hidden = !eff;
    verb.textContent = opts.verb || 'release';
    call.textContent = opts.label || '';
    vPow.textContent = eff ? '-' : ''; vRel.textContent = '-';
    el.hidden = false;
    layout(opts.place);
    /* QUICK DELIVERY (opts.quick, the slide step): meter.js says how high power goes (powerCap, from
       its QUICK) and the needle turns there (powerAt); the top of the column above it is greyed out
       and perfect power goes with it. The ring is quicker the same way (ringMs). */
    var cap = MT.powerCap ? MT.powerCap(!!opts.quick) : 1;
    ccap.style.height = ((1 - cap) * 100).toFixed(2) + '%';
    col.classList.toggle('is-capped', cap < 1);
    return new Promise(function (resolve) {
      live = { t0: performance.now(), opts: opts, resolve: resolve, done: false, raf: 0, e: null, quick: !!opts.quick, stage: eff ? 'effort' : 'acc' };
      if (eff) { col.hidden = false; placeEffort(0); setStage('effort'); }
      else startAcc();
      el.addEventListener('pointerdown', onDown);
      col.addEventListener('pointerdown', onDown);
      document.addEventListener('keydown', onKey, true);
      try { el.focus({ preventScroll: true }); } catch (x) {}
      live.raf = requestAnimationFrame(tick);
    });
  }
  return { el: el, col: col, ring: ring, run: run, cancel: cancel, hide: hide,
    running: function () { return !!(live && !live.done); },
    stage: function () { return live && !live.done ? (live.stage === 'lock' ? 'acc' : live.stage) : null; } };
}

window.STD_METER_UI = { create: create, effortOn: effortOn, QUIET_AFTER: QUIET_AFTER, TAPS_KEY: TAPS_KEY };
})();
