/* 4th and What: the play, shown.
 *
 *   FAW_LIVE.show(canvas, result, ui) -> { skip() }
 *
 * The engine has already decided everything; this only draws its frames.
 * The stadium is drawn once per spot of the ball (stage.js) and kept. Each
 * frame copies it, then draws the lines, the goalpost, the players' shadows,
 * the players far to near, and the ball with its shadow.
 *
 * THE PICTURE IS SMALL ON PURPOSE: 260 cells across, shown with
 * image-rendering: pixelated, so every cell is a hard pixel. Players are
 * traced by rig.js at the size the camera sees them, cached, and at most a
 * few new ones are traced a frame; until a size is ready the nearest one
 * already traced stands in.
 *
 * Legible on purpose: a beat at the set, the picture slows near the throw,
 * the catch and the tackle, and captions say what just happened.
 *
 * Plain script: window.FAW_LIVE.
 */
(function (root) {
  'use strict';
  var W = 260, H = 400, BIG = 1.35, BUDGET_MS = 7;
  var scenes = {};

  function stageFor(BX, Y0, PX) {
    var key = BX + '|' + Y0 + '|' + (PX ? 1 : 0);
    if (scenes[key]) return scenes[key];
    var ST = root.FAW_STAGE, cam = ST.camera(W, H, BX, Y0);
    return (scenes[key] = { cam: cam, bg: ST.render(cam, { pxhd: PX }) });
  }
  /* Build the stadium for a spot ahead of time, while the clipboard is up. */
  function prepare(BX, Y0) { try { stageFor(BX, Y0, root.FAW_PXHD || null); } catch (e) {} }

  /* ---------- the sprites, on a budget ---------- */
  var spent = 0, frameStart = 0;
  function sprite(o) {
    var R = root.FAW_RIG;
    if (R.cached(o)) return R.sprite(o);
    if (performance.now() - frameStart < BUDGET_MS) return R.sprite(o);
    /* over budget: the nearest one already traced stands in. A man with no
       sprite of his kind at all is traced now, so nobody is ever a blank. */
    return R.nearest(o) || R.sprite(o);
  }

  function show(canvas, res, ui) {
    var ctx = canvas.getContext('2d');
    canvas.width = W; canvas.height = H;
    ctx.imageSmoothingEnabled = false;
    var PX = root.FAW_PXHD || null, R = root.FAW_RIG, ST = root.FAW_STAGE, T = root.FAW_CONFIG.TUNING;
    if (PX) R.init(PX);
    var sc = stageFor(res.BX, res.Y0, PX), cam = sc.cam;
    var frames = res.frames, ids = res.ids, dt = res.dt;
    var lastT = frames[frames.length - 1].t;
    var SET = 0.75;                                 /* the beat at the line before the snap */
    var t = -SET, raf = 0, done = false, prev = 0, capAt = -1;
    var slows = res.events.filter(function (e) { return /throw|catch|incomplete|sack|td|spot|broken|fumble|checkdown/.test(e.kind); })
      .map(function (e) { return { t: e.t, k: e.kind === 'throw' || e.kind === 'checkdown' ? T.slow.throw : e.kind === 'catch' || e.kind === 'incomplete' ? T.slow.catch : T.slow.tackle }; });
    function rate(tt) { var k = 1; slows.forEach(function (s) { if (Math.abs(tt - s.t) < T.slow.window) k = Math.min(k, s.k); }); return k; }

    function frameAt(tt) {
      var i = Math.max(0, Math.min(frames.length - 2, Math.floor(tt / dt))), a = frames[i], b = frames[i + 1], u = Math.max(0, Math.min(1, (tt - a.t) / dt));
      return { a: a, b: b, u: u };
    }

    function draw(tt) {
      frameStart = performance.now();
      ctx.drawImage(sc.bg, 0, 0);
      var line = function (Y, col) { var a = cam.pr([-1, Y, 0]), b = cam.pr([ST.FIELD_W + 1, Y, 0]); if (!a || !b) return; ctx.fillStyle = col; ctx.fillRect(Math.round(a[0]), Math.round(a[1]) - 1, Math.round(b[0] - a[0]), 2); };
      line(res.Y0, 'rgba(74,163,255,.85)'); if (res.marker < 100) line(res.marker, 'rgba(255,210,63,.95)');
      ST.goalpost(ctx, cam, PX);
      var F = frameAt(Math.max(0, tt)), pre = tt < 0;
      var P = ids.map(function (e, j) {
        var pa = F.a.p[j], pb = F.b.p[j], x = pa[0] + (pb[0] - pa[0]) * F.u, y = pa[1] + (pb[1] - pa[1]) * F.u;
        var pose = pa[2], fr = pa[3], head = pa[4];
        if (pre) { pose = e.role === 'ol' || e.role === 'dl' ? 'stance3' : (e.id === 'QB' ? 'idle' : 'stance'); fr = 0; x = frames[0].p[j][0]; y = frames[0].p[j][1]; head = e.side === 'O' ? 0 : 180; }
        return { e: e, x: x, y: y, pose: pose, frame: fr, head: head };
      });
      P.forEach(function (p) { var s = cam.pr([p.x, p.y, 0]), k = cam.scaleAt(p.x, p.y); if (s && k) ST.shadow(ctx, s[0], s[1], k.k * 3 * 1.6 * BIG); });
      P.sort(function (a, b) { return b.y - a.y; }).forEach(function (p) {
        var s = cam.pr([p.x, p.y, 0]), k = cam.scaleAt(p.x, p.y); if (!s || !k) return;
        var o = { pose: p.pose, frame: p.frame, team: p.e.side === 'O' ? 'offense' : 'defense', big: p.e.big, skin: skinOf(p.e.id), k: k.k * BIG, pitch: k.pitch, yaw: 180 - (p.head - k.yawTo) };
        var spr = PX ? sprite(o) : null;
        if (spr) {
          var sx = spr.scale || 1;
          ctx.drawImage(spr.canvas, Math.round(s[0] - spr.footX * sx), Math.round(s[1] - spr.footY * sx), Math.round(spr.w * sx), Math.round(spr.h * sx));
        } else token(ctx, s, k.k * BIG, o.team);
      });
      /* the ball */
      var ba = F.a.ball, bb = F.b.ball, bx = ba[0] + (bb[0] - ba[0]) * F.u, by = ba[1] + (bb[1] - ba[1]) * F.u, bz = ba[2] + (bb[2] - ba[2]) * F.u;
      if (pre) { bx = frames[0].ball[0]; by = frames[0].ball[1]; bz = 0.15; }
      if (!F.a.held || pre) {
        var g = cam.pr([bx, by, 0]), a = cam.pr([bx, by, bz]);
        if (g && a) {
          ctx.fillStyle = 'rgba(16,30,60,.38)'; ctx.fillRect(Math.round(g[0]) - 1, Math.round(g[1]), 3, 1);
          ctx.fillStyle = '#7a4320'; ctx.fillRect(Math.round(a[0]) - 2, Math.round(a[1]) - 1, 4, 3);
          ctx.fillStyle = '#f4efe4'; ctx.fillRect(Math.round(a[0]) - 1, Math.round(a[1]), 2, 1);
        }
      }
      ST.vignette(ctx, W, H);
      ui.pressure(pre || res.isRun ? 0 : F.a.pressure);
    }

    function caption(tt) {
      if (tt < 0) { ui.caption(tt < -SET * 0.45 ? 'Set.' : 'Hut.'); return; }
      for (var i = res.events.length - 1; i >= 0; i--) {
        var e = res.events[i];
        if (e.t <= tt) { if (i !== capAt) { capAt = i; ui.caption(e.text); } return; }
      }
      if (capAt !== -2) { capAt = -2; ui.caption(''); }
    }

    function tick(now) {
      if (done) return;
      var real = prev ? Math.min(0.05, (now - prev) / 1000) : 0; prev = now;
      t += real * (t < 0 ? 1 : rate(t));
      if (t >= lastT) { t = lastT; draw(t); caption(t); finish(); return; }
      draw(t); caption(t);
      raf = root.requestAnimationFrame(tick);
    }
    function finish() { if (done) return; done = true; root.cancelAnimationFrame(raf); setTimeout(function () { ui.done(res); }, 250); }
    /* the set is drawn in full before the clock starts: every man's stance traced */
    frameStart = performance.now() + 1e9;
    draw(-SET);
    raf = root.requestAnimationFrame(tick);
    return {
      skip: function () { if (done) return; t = lastT; draw(t); caption(t); ui.caption(res.events.length ? res.events[res.events.length - 1].text : ''); finish(); },
      stop: function () { done = true; root.cancelAnimationFrame(raf); }
    };
  }

  /* the same skin for a player every snap */
  function skinOf(id) { var h = 0; for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0; return Math.abs(h) % 6; }

  /* without PXHD: a plain token in the team's colour */
  function token(ctx, s, k, team) {
    var r = Math.max(2, Math.round(k * 1.2));
    ctx.fillStyle = team === 'offense' ? '#c8392a' : '#f1ede4';
    ctx.fillRect(Math.round(s[0] - r), Math.round(s[1] - r * 3), r * 2, r * 3);
    ctx.fillStyle = team === 'offense' ? '#e3ab2f' : '#21407c';
    ctx.fillRect(Math.round(s[0] - r * 0.7), Math.round(s[1] - r * 4.1), Math.round(r * 1.4), Math.round(r * 1.3));
  }

  root.FAW_LIVE = { show: show, prepare: prepare, W: W, H: H };
})(typeof window !== 'undefined' ? window : this);
