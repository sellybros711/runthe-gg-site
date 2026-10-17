/* Shut The Door: the pitch, animated.
 *
 * window.STD_ANIM.play(scene, opts) -> Promise. One pitch from the set to the
 * call, in under about three seconds, and a tap anywhere skips to the end.
 *
 *   windup   set, leg kick, the arm back, release
 *   flight   the ball flies its pitch's SHAPE and lands at pitchResult.actual,
 *            which is where it really crossed after the miss. The target cell
 *            stays lit on the grid, so a miss is plain to see.
 *   the bat  a take holds, a swing loads and comes through at the ball's height
 *   the end  into the mitt (which slides from the target to where it went),
 *            off the bat foul and back over the screen, or in play toward the
 *            camera along its spray; then the call.
 *
 * The break: a straight line toward (landing - break), plus the break arriving
 * late (t^k), so the ball ends exactly where the engine says. The break comes
 * from the arsenal's own pfxX and pfxZ, mirrored for the pitcher's view, with
 * gravity's drop for the speed: a four-seamer at 98 barely drops, a slider
 * dives and slides away.
 */
(function () {
'use strict';
var C = window.STD_CONTRACT;

var LATE = { ride: 2, run: 2.2, cut: 2.6, sweep: 2.2, slide: 2.8, drop: 2.2, fade: 2.6, split: 3.6, float: 2 };

function breakPx(ap, ppf) {
  /* pfx in inches, catcher's view; the screen is mirrored, so x flips */
  var velo = ap.velo || 92;
  var grav = 16 + Math.max(0, 100 - velo) * 1.25;          // inches of drop a spinless ball would add
  var vx = -(ap.pfxX || 0), vz = (ap.pfxZ || 0) - grav;      // screen: right is +, up is +
  var k = 0.55;                                             // drawn a little under life size
  return { x: vx / 12 * ppf * k, y: -vz / 12 * ppf * k };
}

function ease(t) { return 1 - Math.pow(1 - t, 1.55); }

/* opts: {pr: PitchResult, ap: ArsenalPitch, hooks: {call(text, kind), sound(name)}, quick} */
function play(scene, opts) {
  var pr = opts.pr, ap = opts.ap || {}, hooks = opts.hooks || {};
  var L = scene.L, b = L.b;
  var target = scene.cellCenter(pr.call.cell);
  var land = scene.toScreen(pr.actual);
  var rel = scene.releaseAt('release');
  var brk = breakPx(ap, L.gppf);
  var late = LATE[ap.shape || C.SHAPE_OF[pr.call.type]] || 2.2;
  var velo = pr.velo || ap.velo || 92;
  var speed = opts.quick ? 0.55 : 1;
  var T_REL = 470 * speed;
  var FLIGHT = Math.max(330, Math.min(640, 330 + (100 - velo) * 14)) * speed;
  var T_ARR = T_REL + FLIGHT;
  var inPlay = pr.result === 'in_play';
  var caught = pr.result === 'ball' || pr.result === 'called_strike' || pr.result === 'swinging_strike' || pr.result === 'foul_tip';
  var T_END = T_ARR + (inPlay ? 1350 : pr.result === 'foul' ? 1000 : 900) * speed;
  var row = C.rowOf(pr.actualCell);
  var swingPose = row <= 1 ? 'swingHi' : row >= 3 ? 'swingLo' : 'swingMid';
  var r0 = Math.max(4, b * 1.7), r1 = Math.max(3, 0.121 * L.gppf);
  var trail = [];
  var called = false, popped = false;

  function words() {
    var res = pr.result;
    if (res === 'in_play') return [pr.inPlay ? pr.inPlay.text : 'in play', 'play'];
    if (res === 'hit_by_pitch') return ['hit by pitch', 'ball'];
    if (res === 'ball') return [pr.paOver ? 'ball four' : 'ball', 'ball'];
    if (res === 'foul') return ['foul', 'foul'];
    if (pr.paOver) return [res === 'called_strike' ? 'strike three. caught looking' : 'strike three', 'strike'];
    return [res === 'swinging_strike' ? 'swing and a miss' : res === 'foul_tip' ? 'foul tip' : 'strike', 'strike'];
  }

  function ballAt(t) {
    var u = ease(t), k = Math.pow(t, late);
    var x = rel.x + (land.x - brk.x - rel.x) * u + brk.x * k;
    var y = rel.y + (land.y - brk.y - rel.y) * u + brk.y * k;
    /* a float wobbles */
    if (ap.shape === 'float') x += Math.sin(t * 18) * b * 0.6 * (1 - t);
    return { x: x, y: y, r: r0 + (r1 - r0) * u };
  }

  /* after contact: where an in-play ball goes. Spray 0 is centre field, which
     is behind the camera; negative is assumed to be the left field side (see
     CONTRACT_REQUESTS.md). Left field is behind the pitcher's right, the
     screen's right in this view. */
  function offBat(t) {
    var ip = pr.inPlay || { bb: 'line', spray: 0 };
    var dir = -(ip.spray || 0) / 45;                // -1..1, screen x
    var bb = ip.bb;
    var x = land.x, y = land.y, r = r1;
    if (pr.result === 'foul') {
      x += (land.x < L.W / 2 ? -1 : 1) * t * L.W * 0.35;
      y -= t * L.H * 0.9;
      r = r1 * (1 - 0.5 * t);
    } else if (bb === 'ground') {
      x += -dir * t * L.W * 0.7;
      y += t * L.H * 0.6 - Math.abs(Math.sin(t * 9)) * b * 6 * (1 - t);
      r = r1 * (1 + 2.2 * t);
    } else if (bb === 'popup') {
      y -= Math.sin(t * Math.PI * 0.5) * L.H * 1.0;
      r = r1 * (1 - 0.4 * t);
    } else if (bb === 'fly') {
      x += -dir * t * L.W * 0.6;
      y -= t * L.H * 1.1;
      r = r1 * (1 + 1.6 * t);
    } else {
      x += -dir * t * L.W * 0.8;
      y += t * L.H * 0.25;
      r = r1 * (1 + 3.5 * t);
    }
    return { x: x, y: y, r: r };
  }

  function mittAt(t) {
    /* the catcher sets up on the target and reaches for where it went */
    var u = Math.max(0, Math.min(1, (t - T_ARR + FLIGHT * 0.35) / (FLIGHT * 0.35)));
    var m = { x: target.x + (land.x - target.x) * u, y: target.y + (land.y - target.y) * u };
    return caught ? m : target;
  }

  function frameAt(t) {
    var f = { marker: null, ball: null, umpire: 'set' };
    f.pitcher = t < 120 * speed ? 'set' : t < 300 * speed ? 'kick' : t < 430 * speed ? 'cock' : t < T_REL + 60 ? 'release' : 'follow';
    if (pr.batter === 'swing') {
      f.batter = t < 220 * speed ? 'stance' : t < T_ARR - 70 * speed ? 'load' : t < T_ARR + 110 * speed ? swingPose : 'follow';
    } else {
      f.batter = t < 260 * speed ? 'stance' : t < T_ARR + 60 * speed ? 'load' : 'stance';
    }
    f.mitt = mittAt(t);
    if (t >= T_REL && t < T_ARR) {
      var bl = ballAt((t - T_REL) / FLIGHT);
      trail.push({ x: bl.x, y: bl.y, r: bl.r }); if (trail.length > 4) trail.shift();
      bl.trail = trail.slice(0, -1);
      bl.shadow = true;
      f.ball = bl;
    } else if (t >= T_ARR) {
      f.marker = land;
      if (!caught && pr.result !== 'hit_by_pitch') {
        var tt = Math.min(1, (t - T_ARR) / (inPlay ? 700 * speed : 520 * speed));
        if (tt < 1) f.ball = offBat(tt);
      }
      if (pr.result === 'called_strike' && t > T_ARR + 120 * speed) f.umpire = 'strike';
      if (pr.paOver && (pr.result === 'swinging_strike' || pr.result === 'foul_tip') && t > T_ARR + 150 * speed) f.umpire = 'strike';
    } else if (t >= 300 * speed) {
      f.ball = null;
    }
    if (t >= T_ARR && t < T_ARR + 90 && (caught || inPlay)) f.shake = (caught ? 1 : 2) * (t % 40 < 20 ? 1 : -1);
    return f;
  }

  return new Promise(function (done) {
    var start = null, raf = 0, finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(raf);
      document.removeEventListener('pointerdown', skip, true);
      if (!called) { called = true; var w = words(); if (hooks.call) hooks.call(w[0], w[1]); }
      var f = frameAt(T_END);
      f.ball = null; f.pitcher = 'set'; f.batter = 'stance';
      scene.draw(f);
      done();
    }
    function skip(e) {
      if (e && e.target && e.target.closest && e.target.closest('header, .sheet')) return;
      finish();
    }
    function tick(now) {
      if (finished) return;
      if (start == null) start = now;
      var t = now - start;
      if (!popped && t >= T_ARR) {
        popped = true;
        if (hooks.sound) hooks.sound(caught ? 'pop' : pr.result === 'hit_by_pitch' ? 'thud' : 'crack');
      }
      if (!called && t >= T_ARR + 120 * speed) {
        called = true;
        var w = words();
        if (hooks.call) hooks.call(w[0], w[1]);
      }
      scene.draw(frameAt(t));
      if (t >= T_END) { finish(); return; }
      raf = requestAnimationFrame(tick);
    }
    document.addEventListener('pointerdown', skip, true);
    if (hooks.sound) hooks.sound('whoosh', T_REL);
    raf = requestAnimationFrame(tick);
  });
}

window.STD_ANIM = { play: play, breakPx: breakPx };
})();
