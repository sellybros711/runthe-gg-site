/* 4th and What: the stadium, and the camera that looks at it.
 *
 * The look is Putt Putt Tour's console look (golf/putt/hole3d.js and the
 * vault's golf-putt-rendering note): every surface on PXHD's five step ramps,
 * sun shadows from a low sun in the upper left with a dithered edge, haze
 * over the far end, a light grade and a vignette. The picture is drawn small,
 * in cells, and the page shows it with image-rendering: pixelated, so every
 * cell is a hard pixel on any screen.
 *
 * THE CAMERA is a real perspective camera, high behind the offense and
 * looking downfield, the way a console football game frames a snap: the
 * near players are bigger, the far end zone and the stands fall away toward
 * the horizon. A world point is yards: X across the field (0 is the left
 * sideline, 53.33 the right), Y downfield from the offense's own goal line
 * (the end zone it attacks is 100 to 110), Z up.
 *
 * Everything that stands still (the turf and its paint, the end zone, the
 * walls, the stands and the crowd) is worked out per cell from the geometry
 * in closed form, so a frame of it is one pass and needs no meshes. It is
 * drawn once per camera; a play keeps one camera, so a frame of play copies
 * it and draws the players, their shadows, the goalpost and the ball over it.
 *
 * Plain script: window.FAW_STAGE. The goalpost and the players come from
 * FAW_RIG, painted by PXHD.
 */
(function (root) {
  'use strict';

  var FIELD_W = 160 / 3;
  /* The stands: a padded wall, then rows of seats rising on a slope, then a
     back wall. On both sides and behind the far end zone. */
  var SIDE_OFF = 8.5, END_OFF = 117, WALL = 1.2, SLOPE = 0.62, DEPTH = 22, ROW = 0.8;
  var TOP = WALL + SLOPE * DEPTH;

  /* PXHD's light, which it does not export (hole3d.js keeps a copy for the
     same reason): screen x right, y down, z toward the viewer. Change one,
     change both. A flat face takes the ramp step PXHD's paint would give it. */
  var LIGHT = (function () { var v = [-0.55, -0.72, 0.72], l = Math.hypot(v[0], v[1], v[2]); return v.map(function (a) { return a / l; }); })();
  function toneN(n) { var d = n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]; return d > 0.8 ? 3 : d > 0.4 ? 2 : d > 0.08 ? 1 : 0; }
  /* The sun, low in the upper left: toward -X and a little downfield. */
  var SUN = (function () { var v = [-0.86, 0.3, Math.tan(30 * Math.PI / 180)], l = Math.hypot(v[0], v[1], v[2]); return v.map(function (a) { return a / l; }); })();

  function hash(x, y) { var h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function rgb(h) { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }

  /* ---------- the camera ---------- */

  /* A camera behind the line, looking downfield. W and H are cells. */
  function camera(W, H, X, Ylos, opt) {
    opt = opt || {};
    var back = opt.back || 16, high = opt.high || 28, ahead = opt.ahead || 16, hfov = (opt.fov || 46) * Math.PI / 180;
    var pos = [X, Ylos - back, high];
    var dy = ahead + back, dz = -high, L = Math.hypot(dy, dz);
    var F = [0, dy / L, dz / L], U = [0, -dz / L, dy / L], Rt = [1, 0, 0];
    var f = (W / 2) / Math.tan(hfov / 2);
    function pr(p) {
      var v = [p[0] - pos[0], p[1] - pos[1], (p[2] || 0) - pos[2]];
      var z = v[0] * F[0] + v[1] * F[1] + v[2] * F[2];
      if (z < 0.1) return null;
      return [W / 2 + f * (v[0] * Rt[0]) / z, H / 2 - f * (v[1] * U[1] + v[2] * U[2]) / z, z];
    }
    function ray(sx, sy) {
      var a = (sx - W / 2) / f, b = (H / 2 - sy) / f;
      var d = [Rt[0] * a + F[0], F[1] + U[1] * b, F[2] + U[2] * b], l = Math.hypot(d[0], d[1], d[2]);
      return [d[0] / l, d[1] / l, d[2] / l];
    }
    /* How many cells per foot a man stands at this point, and how far down
       the camera looks at him: the rig traces him to match. */
    function scaleAt(X2, Y2) {
      var p = pr([X2, Y2, 0]); if (!p) return null;
      var v = [X2 - pos[0], Y2 - pos[1], -pos[2]];
      return { k: f / p[2] / 3, pitch: Math.atan2(pos[2], Math.hypot(v[0], v[1])), yawTo: Math.atan2(v[0], v[1]) * 180 / Math.PI };
    }
    return { W: W, H: H, pos: pos, f: f, pr: pr, ray: ray, scaleAt: scaleAt };
  }

  /* ---------- the stands, in closed form ---------- */

  /* Each bank of stands is measured by d, yards past its wall's face. Its
     height is WALL at the face, rising SLOPE a yard, to TOP at DEPTH. */
  var BANKS = [
    { d: function (p) { return -SIDE_OFF - p[0]; }, dd: function (r) { return -r[0]; }, n: [1, 0, 0], along: 1 },
    { d: function (p) { return p[0] - FIELD_W - SIDE_OFF; }, dd: function (r) { return r[0]; }, n: [-1, 0, 0], along: 1 },
    { d: function (p) { return p[1] - END_OFF; }, dd: function (r) { return r[1]; }, n: [0, -1, 0], along: 0 }
  ];
  function bankH(d) { return d < 0 ? 0 : d > DEPTH ? 0 : WALL + SLOPE * d; }
  /* The stadium's footprint: past it there is only sky. */
  var OUT_X0 = -SIDE_OFF - DEPTH, OUT_X1 = FIELD_W + SIDE_OFF + DEPTH, OUT_Y = END_OFF + DEPTH;
  function inside(X, Y) { return X >= OUT_X0 && X <= OUT_X1 && Y <= OUT_Y; }
  function heightAt(X, Y) { if (!inside(X, Y)) return 0; var p = [X, Y]; return Math.max(bankH(BANKS[0].d(p)), bankH(BANKS[1].d(p)), bankH(BANKS[2].d(p))); }

  /* The nearest hit of a ray on one bank: its wall face, its slope or its
     back. Returns [t, kind] or null. */
  function hitBank(B, o, r) {
    var d0 = B.d(o), dd = B.dd(r), best = null;
    var take = function (t, kind) { if (t > 1e-4 && (!best || t < best[0])) best = [t, kind]; };
    if (Math.abs(dd) > 1e-9) {
      var t1 = -d0 / dd, z1 = o[2] + r[2] * t1;
      if (z1 >= 0 && z1 <= WALL) take(t1, 'wall');
      var t3 = (DEPTH - d0) / dd, z3 = o[2] + r[2] * t3;
      if (z3 >= 0 && z3 <= TOP) take(t3, 'back');
    }
    var den = r[2] - SLOPE * dd;
    if (Math.abs(den) > 1e-9) {
      var t2 = (WALL + SLOPE * d0 - o[2]) / den, d2 = d0 + dd * t2;
      if (d2 >= 0 && d2 <= DEPTH) take(t2, 'slope');
    }
    if (!best) return null;
    var p = [o[0] + r[0] * best[0], o[1] + r[1] * best[0], o[2] + r[2] * best[0]];
    if (!inside(p[0] + (B.n[0] ? -B.n[0] * 0.01 : 0), p[1] - B.n[1] * 0.01)) return null;
    /* where two banks meet, the higher one is the one there */
    if (heightAt(p[0], p[1]) > p[2] + 0.05 && best[1] === 'slope') return null;
    return best;
  }
  function hitStands(o, r) {
    var best = null;
    for (var i = 0; i < 3; i++) { var h = hitBank(BANKS[i], o, r); if (h && (!best || h[0] < best[0])) best = [h[0], h[1], i]; }
    return best;
  }
  function inShadow(p) {
    var o = [p[0] + SUN[0] * 0.05, p[1] + SUN[1] * 0.05, p[2] + SUN[2] * 0.05];
    return !!hitStands(o, SUN);
  }

  /* ---------- the pixel fonts ---------- */

  var DIGITS = {
    '0': ['111', '101', '101', '101', '111'], '1': ['010', '110', '010', '010', '111'],
    '2': ['111', '001', '111', '100', '111'], '3': ['111', '001', '111', '001', '111'],
    '4': ['101', '101', '111', '001', '001'], '5': ['111', '100', '111', '001', '111']
  };
  var LETTERS = {
    '4': ['10010', '10010', '10010', '11111', '00010', '00010', '00010'],
    T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
    H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
    A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
    N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
    D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
    W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
    ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000']
  };
  var EZ_TEXT = '4TH AND WHAT';
  /* The end zone's letters, read from the field: 1 on a letter, 2 on its rim. */
  function ezLetter(X, Y) {
    var px = 0.66, tw = EZ_TEXT.length * 6 * px - px, x0 = FIELD_W / 2 - tw / 2;
    var row = Math.floor((107.8 - Y) / px), col = Math.floor((X - x0) / px);
    var test = function (r, c) {
      if (r < 0 || r > 6 || c < 0) return false;
      var i = Math.floor(c / 6), k = c % 6; if (i >= EZ_TEXT.length || k > 4) return false;
      return LETTERS[EZ_TEXT[i]][r][k] === '1';
    };
    if (test(row, col)) return 1;
    for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) if (test(row + dr, col + dc)) return 2;
    return 0;
  }
  /* The yard numbers: 2 yards tall, bottoms toward their sideline, tops 9 in. */
  function yardNumber(X, Y) {
    var left = X < FIELD_W / 2, d = left ? X : FIELD_W - X;
    if (d < 7 || d > 9) return 0;
    var t = Math.round(Y / 10) * 10; if (t < 10 || t > 90) return 0;
    var s = String(t <= 50 ? t : 100 - t), along = left ? -(Y - t) : Y - t, px = 0.4;
    var c = Math.floor((along + 1.8) / px), r = 4 - Math.floor((d - 7) / px);
    if (r < 0 || r > 4) return 0;
    var di = c >= 0 && c < 3 ? 0 : c >= 6 && c < 9 ? 1 : -1, k = di === 0 ? c : c - 6;
    if (di < 0 || di >= s.length) return 0;
    return DIGITS[s[di]][r][k] === '1' ? 1 : 0;
  }

  /* ---------- colour ---------- */

  function palette(PX) {
    var rr = function (h, sp) { return (PX ? PX.ramp(h, sp ? { spread: sp } : undefined) : [h, h, h, h, h]).map(rgb); };
    return {
      turfA: rr('#3f8f45'), turfB: rr('#489b4d'), apron: rr('#357a3b'), paint: rr('#f2efe6', 0.5),
      ez: rr('#21407c'), ezText: rr('#f2efe6', 0.5), ezRim: rr('#e3ab2f'),
      wall: rr('#22385f'), wallTrim: rr('#e3ab2f'), seat: rr('#5d6a7c', 0.8), concrete: rr('#a3a9b0', 0.7), back: rr('#2b3446'),
      /* the home crowd: mostly red, some white and gold, a few road fans */
      crowd: ['#b8402f', '#b8402f', '#a53628', '#c24a36', '#e8e1d2', '#d9a43a', '#b8402f', '#2c4878', '#3b3f4a'].map(function (h) { return rr(h, 0.7); }),
      skin: ['#8d5524', '#c68642', '#e0ac69', '#f1c27d', '#5c3a1e'].map(function (h) { return (PX ? PX.skinRamp(h) : [h, h, h, h, h]).map(rgb); }),
      skyTop: rgb('#6fa9dc'), skyLow: rgb('#f3dcb0'), haze: rgb('#e9e0c8')
    };
  }

  /* ---------- the picture ---------- */

  function render(cam, opt) {
    opt = opt || {};
    var PX = opt.pxhd || null, P = palette(PX), W = cam.W, H = cam.H;
    var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d'), img = ctx.createImageData(W, H), d = img.data;
    var o = cam.pos;
    /* a flat face's step, by its world normal, in PXHD's frame */
    var toneW = function (n) {
      var F = cam.ray(W / 2, H / 2), U = [0, -F[2], F[1]];
      return toneN([n[0], -(n[1] * U[1] + n[2] * U[2]), -(n[0] * F[0] + n[1] * F[1] + n[2] * F[2])]);
    };
    var tUp = toneW([0, 0, 1]), tRiserEnd = toneW([0, -1, 0]), tRiserL = toneW([1, 0, 0]), tRiserR = toneW([-1, 0, 0]);
    var tSlopeEnd = toneW([0, -SLOPE, 1]), tSlopeL = toneW([SLOPE, 0, 1]), tSlopeR = toneW([-SLOPE, 0, 1]);

    for (var sy = 0; sy < H; sy++) {
      for (var sx = 0; sx < W; sx++) {
        var r = cam.ray(sx + 0.5, sy + 0.5), i4 = (sy * W + sx) * 4, col, dist = 1e9, shadow = false;
        var tg = r[2] < 0 ? -o[2] / r[2] : 1e9;
        var hs = hitStands(o, r);
        if (hs && hs[0] < tg) {
          /* the stands */
          var t = hs[0], p = [o[0] + r[0] * t, o[1] + r[1] * t, o[2] + r[2] * t], B = BANKS[hs[2]];
          var dd = B.d(p), along = B.along ? p[1] : p[0], end = hs[2] === 2, left = hs[2] === 0;
          dist = t;
          if (hs[1] === 'wall') {
            var tw = end ? tRiserEnd : left ? tRiserL : tRiserR;
            col = (p[2] > WALL * 0.78 ? P.wallTrim : P.wall)[tw];
            if (p[2] < WALL * 0.78 && Math.floor(along / 4) % 6 === 0 && p[2] > WALL * 0.3) col = P.wallTrim[tw];
          } else if (hs[1] === 'back') {
            col = P.back[end ? tRiserEnd : left ? tRiserL : tRiserR];
          } else {
            /* a row of seats: the riser faces the field, the tread faces up,
               and most seats hold a fan in the home colours */
            var row = Math.floor(dd / ROW), f = (dd - row * ROW) / ROW;
            var seat = Math.floor(along / 0.6), hh = hash(seat * 7 + 3 + hs[2] * 1000, row * 13 + 1);
            var riser = f < 0.42, tR = riser ? (end ? tRiserEnd : left ? tRiserL : tRiserR) : (end ? tSlopeEnd : left ? tSlopeL : tSlopeR);
            /* an aisle of steps every 14 seats, and a walkway halfway up */
            var aisle = ((seat % 14) + 14) % 14 < 2, walk = row === 13;
            var full = hh < 0.8 && row > 0 && !aisle && !walk;
            if (full) {
              var c9 = P.crowd[Math.floor(hh * 97) % P.crowd.length];
              col = riser ? c9[Math.max(0, tR - 1)] : c9[tR];
              if (!riser && f > 0.78) col = P.skin[Math.floor(hash(seat, row * 3) * 5)][Math.min(4, tR + 1)];
              /* a few fans on their feet, arms up, flicker by seat */
              if (riser && f < 0.12 && hash(seat * 5, row) > 0.93) col = P.skin[Math.floor(hash(seat, row) * 5)][3];
            } else col = riser ? P.seat[tR] : P.concrete[tR];
          }
          shadow = inShadow(p);
        } else if (tg < 1e9 && inside(o[0] + r[0] * tg, o[1] + r[1] * tg)) {
          /* the ground */
          var X = o[0] + r[0] * tg, Y = o[1] + r[1] * tg;
          dist = tg;
          /* how much ground one cell covers here, so a line thinner than a
             cell is drawn faint rather than dropped or doubled */
          var fpY = Math.max(0.02, tg / cam.f * Math.hypot(r[1], r[2]) / Math.max(0.05, -r[2]));
          var fpX = Math.max(0.02, tg / cam.f);
          var onField = X >= 0 && X <= FIELD_W && Y >= -10 && Y <= 110;
          var ramp = !onField ? P.apron : Y >= 100 ? P.ez : (Math.floor(Y / 5) % 2 ? P.turfB : P.turfA);
          /* the nap: a tuft here and there, a step lighter or darker */
          var nap = hash(sx * 3 + 1, sy * 7 + 2), ti = tUp;
          if (nap > 0.985) ti = Math.min(4, ti + 1); else if (nap < 0.012) ti = Math.max(0, ti - 1);
          col = ramp[ti];
          var cover = 0, ink = null;
          var lineY = function (yy, w) { var e = Math.abs(Y - yy), span = Math.max(w, fpY) / 2; if (e < span) cover = Math.max(cover, Math.min(1, w / fpY)); };
          var lineX = function (xx, w, y0, y1) { if (Y < y0 || Y > y1) return; var e = Math.abs(X - xx), span = Math.max(w, fpX) / 2; if (e < span) cover = Math.max(cover, Math.min(1, w / fpX)); };
          if (Y >= -10 && Y <= 110) { lineX(-1, 2, -10, 110); lineX(FIELD_W + 1, 2, -10, 110); }
          if (onField) {
            if (Y <= 100.2) lineY(Math.round(Y / 5) * 5, Math.abs(Math.round(Y / 5) * 5 - 100) < 0.1 || Math.round(Y / 5) === 0 ? 0.22 : 0.11);
            lineY(110, 0.22);
            if (Y > 0.3 && Y < 99.7 && Math.round(Y) % 5 !== 0) {
              var yi = Math.round(Y), hx = [0.33, 23.58, 29.75, FIELD_W - 0.33];
              for (var q = 0; q < 4; q++) if (Math.abs(X - hx[q]) < 0.34) lineY(yi, 0.11);
            }
            if (Y < 100 && yardNumber(X, Y)) cover = Math.max(cover, 0.95);
            if (Y >= 100 && Y < 110) { var Lt = ezLetter(X, Y); if (Lt === 1) ink = P.ezText; else if (Lt === 2) ink = P.ezRim; }
          }
          if (ink) col = ink[tUp];
          if (cover > 0) { var pc = P.paint[tUp]; col = [0, 1, 2].map(function (k) { return col[k] + (pc[k] - col[k]) * cover; }); }
          shadow = inShadow([X, Y, 0]);
        } else {
          /* the sky, with a few pixel clouds */
          var tt = Math.max(0, Math.min(1, (sy + 0.5) / (H * 0.25)));
          col = [0, 1, 2].map(function (k) { return P.skyTop[k] + (P.skyLow[k] - P.skyTop[k]) * tt; });
          var cl = hash(Math.floor((sx + sy * 0.3) / 11), Math.floor(sy / 3));
          if (cl > 0.92) col = col.map(function (v) { return v + (255 - v) * 0.5; });
          d[i4] = col[0]; d[i4 + 1] = col[1]; d[i4 + 2] = col[2]; d[i4 + 3] = 255;
          continue;
        }
        var R = col[0], G = col[1], Bc = col[2];
        /* THE CONSOLE PASS: relight, never move a pixel. Cool, dim shadow
           with a dithered edge; haze with distance; a light grade. */
        if (shadow) { R = R * 0.6 + 16; G = G * 0.64 + 16; Bc = Bc * 0.72 + 36; }
        else { R = R * 1.05 + 5; G = G * 1.02 + 3; }
        var hz = Math.max(0, Math.min(0.55, (dist - 45) / 120));
        R += (P.haze[0] - R) * hz; G += (P.haze[1] - G) * hz; Bc += (P.haze[2] - Bc) * hz;
        var lum = 0.3 * R + 0.59 * G + 0.11 * Bc;
        R = (lum + (R - lum) * 1.12 - 128) * 1.05 + 128; G = (lum + (G - lum) * 1.12 - 128) * 1.05 + 128; Bc = (lum + (Bc - lum) * 1.12 - 128) * 1.05 + 128;
        d[i4] = R; d[i4 + 1] = G; d[i4 + 2] = Bc; d[i4 + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }

  /* ---------- what is drawn every frame ---------- */

  /* A player's shadow, cast down and to the right by the low sun. */
  function shadow(ctx, x, y, w) {
    ctx.fillStyle = 'rgba(16,30,60,0.34)';
    var rx = Math.max(3, Math.round(w * 0.55)), ry = Math.max(1, Math.round(w * 0.18));
    for (var j = -ry; j <= ry; j++) for (var i = -rx; i <= rx; i++) {
      var u = i / rx, v = j / ry, e = u * u + v * v;
      if (e > 1 || (e > 0.55 && ((i + j) & 1))) continue;
      ctx.fillRect(Math.round(x + i + rx * 0.45), Math.round(y + j), 1, 1);
    }
  }

  /* The goalpost, as thick lines of PXHD ramp colour: posts round and lit
     from the left, so it reads as a solid thing at any distance. */
  function goalpost(ctx, cam, PX) {
    var R = (PX ? PX.ramp('#f2c230') : ['#8a6a10', '#c49a1e', '#f2c230', '#f8dc70', '#fff2b8']);
    var pad = (PX ? PX.ramp('#21407c') : ['#0f2040', '#18305a', '#21407c', '#3d5c98', '#6a86bb']);
    var mid = FIELD_W / 2, half = 18.5 / 6, bar = 10 / 3, top = bar + 10;
    function bar3(a, b, rad, rp) {
      var p = cam.pr(a), q = cam.pr(b); if (!p || !q) return;
      var w = Math.max(1, cam.f / ((p[2] + q[2]) / 2) * rad * 2), n = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]));
      for (var i = 0; i <= n; i++) {
        var t = i / Math.max(1, n), x = p[0] + (q[0] - p[0]) * t, y = p[1] + (q[1] - p[1]) * t;
        for (var k = 0; k < Math.round(w); k++) {
          var f = Math.round(w) <= 1 ? 2 : k === 0 ? 3 : k === Math.round(w) - 1 ? 1 : 2;
          ctx.fillStyle = rp[f]; ctx.fillRect(Math.round(x - w / 2 + k), Math.round(y), 1, 1);
        }
      }
    }
    var back = 112;
    bar3([mid, back, 0], [mid, back, 2], 0.25, pad);
    bar3([mid, back, 2], [mid, back, bar], 0.14, R);
    bar3([mid, back, bar], [mid, 110, bar], 0.14, R);
    bar3([mid - half, 110, bar], [mid + half, 110, bar], 0.12, R);
    bar3([mid - half, 110, bar], [mid - half, 110, top], 0.11, R);
    bar3([mid + half, 110, bar], [mid + half, 110, top], 0.11, R);
  }

  function vignette(ctx, W, H) {
    var g = ctx.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.38, W / 2, H * 0.55, Math.max(W, H) * 0.78);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(10,14,30,0.32)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  var API = { FIELD_W: FIELD_W, camera: camera, render: render, shadow: shadow, goalpost: goalpost, vignette: vignette, heightAt: heightAt };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.FAW_STAGE = API;
})(typeof window !== 'undefined' ? window : this);
