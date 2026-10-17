/* 4th and What: the players, drawn the way Putt Putt Tour draws its golfer.
 *
 * golf/golfer3d.js poses a small 3D model and hands every cell to PXHD, the
 * renderer that paints the profile golfer, the putt putt holes and Segue's
 * stage: five step ramps (cool shadows, warm lights), contact shadows, the
 * inner contour where one part overlaps another, and a soft outline one cell
 * INSIDE the silhouette in the part's own shadow colour (the owner's rule: no
 * dark outer ring). The model only decides WHAT is in each cell and which way
 * its surface faces. This file is that, for a football player: helmet and
 * facemask, shoulder pads, jersey, pants, socks, cleats and the ball.
 *
 * PXHD is not copied. The page imports the generated module Segue already
 * uses (setlist/pxhd.js, kept in step with golf by
 * scripts/setlist/extract_pxhd.mjs) and hands it to init(). Without it,
 * sprite() answers null and the stage falls back to flat tokens.
 *
 * The man is traced, not drawn by hand, because the camera sits behind the
 * offense and the drawn play sends players every way: one description of the
 * body gives every heading and every pose. A render is cached, so a frame of
 * play is a lookup.
 *
 * Units are feet. He stands on the origin, y up, facing +z, his right hand
 * toward +x. Plain script: window.FAW_RIG in the browser, module.exports in
 * node (grid() needs no canvas).
 */
(function (root) {
  'use strict';

  var PX = null;
  function init(pxhd) { PX = pxhd && pxhd.Sprite ? pxhd : null; return !!PX; }

  /* Two generic sides, no real team. Offense in red and gold, defense in
     road white and navy, so they never blur together on green. */
  var TEAMS = {
    offense: { helmet: '#e3ab2f', stripe: '#8e1c14', jersey: '#c8392a', trim: '#fff0cc', pants: '#efe2bf', socks: '#8e1c14', glove: '#f1ede4' },
    defense: { helmet: '#21407c', stripe: '#f4f0e6', jersey: '#f1ede4', trim: '#21407c', pants: '#21407c', socks: '#21407c', glove: '#21407c' }
  };
  var SKINS = ['#8d5524', '#c68642', '#e0ac69', '#f1c27d', '#5c3a1e', '#a86b3c'];
  /* What each material does under the light: gloss lifts a hard shell. */
  var GLOSS = { helmet: 2, stripe: 2, mask: 1, ball: 1, post: 2 };

  /* ---------- shapes, as signed distances ---------- */

  function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }
  function len3(x, y, z) { return Math.sqrt(x * x + y * y + z * z); }
  function sph(c, r) { return function (p) { return len3(p[0] - c[0], p[1] - c[1], p[2] - c[2]) - r; }; }
  function ell(c, r) {
    return function (p) {
      var a = (p[0] - c[0]) / r[0], b = (p[1] - c[1]) / r[1], d = (p[2] - c[2]) / r[2];
      var k0 = len3(a, b, d), k1 = len3(a / r[0], b / r[1], d / r[2]);
      return k1 > 1e-6 ? k0 * (k0 - 1) / k1 : -Math.min(r[0], r[1], r[2]);
    };
  }
  /* A limb: a round cone from a (radius ra) to b (radius rb). */
  function cone(a, b, ra, rb) {
    var bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2], ll = bx * bx + by * by + bz * bz || 1;
    return function (p) {
      var px = p[0] - a[0], py = p[1] - a[1], pz = p[2] - a[2];
      var t = clamp01((px * bx + py * by + pz * bz) / ll);
      return len3(px - bx * t, py - by * t, pz - bz * t) - (ra + (rb - ra) * t);
    };
  }
  function rbox(c, h, r) {
    return function (p) {
      var qx = Math.abs(p[0] - c[0]) - h[0] + r, qy = Math.abs(p[1] - c[1]) - h[1] + r, qz = Math.abs(p[2] - c[2]) - h[2] + r;
      return len3(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
    };
  }

  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function scale(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
  /* Turn v forward (toward +z) by t about the x axis. */
  function pitch(v, t) { var c = Math.cos(t), s = Math.sin(t); return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c]; }
  /* Turn v out to the side by t about the z axis. */
  function roll(v, t) { var c = Math.cos(t), s = Math.sin(t); return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]]; }

  /* ---------- the body ---------- */

  /* A pose is a handful of angles (radians) and offsets:
       lean   the upper body tipped forward from the hips
       drop   how far the hips sit down (feet)
       legs   { L: [hip, knee], R: [hip, knee] }   hip swing forward, knee bend
       arms   { L: [fwd, out, elbow], R: [...] }   shoulder forward, out to the side, elbow bend
       ball   'tuck' | 'cocked' | 'hands' | 'hand' | null
       body   the whole man tipped forward about his feet (laid out, lying down)
       lift   the whole man raised off the ground by this much */
  /* STYLISED, AS A 16 BIT SPORTS GAME DRAWS A MAN: a big helmet, shoulder
     pads well wider than the hips, short strong legs. Real proportions read
     as a thin stick at this size; these read as a football player. B holds
     every length, in feet, so the stance, the run and the tackle all agree. */
  var B = { pelvis: 2.55, thigh: 1.08, shin: 1.02, hipW: 0.4, waist: 0.72, chest: 1.32, pads: 1.72, padW: 1.32,
    neck: 1.95, head: 2.45, helmet: 0.74, shoulder: 1.6, shW: 1.18, upper: 0.92, fore: 0.86 };
  function build(o, big) {
    var W = big ? 1.2 : 1, G = big ? 1.15 : 1;
    var parts = [];
    var put = function (f, m) { parts.push([f, m]); };
    var lean = o.lean || 0, drop = (o.drop || 0) * 0.8;
    var pelvis = [0, B.pelvis - drop, 0];

    ['L', 'R'].forEach(function (side) {
      var s = side === 'R' ? 1 : -1, lg = (o.legs && o.legs[side]) || [0, 0.1];
      var hip = add(pelvis, [s * B.hipW * W, -0.12, 0]);
      var knee = add(hip, pitch([0, -B.thigh, 0], lg[0]));
      var shin = pitch([0, -B.shin, 0], lg[0] - lg[1]);
      var ankle = add(knee, shin);
      put(cone(hip, knee, 0.4 * G, 0.31 * G), 'pants');
      put(cone(knee, add(knee, scale(shin, 0.3)), 0.3 * G, 0.27 * G), 'pants');
      put(cone(add(knee, scale(shin, 0.28)), ankle, 0.26 * G, 0.2), 'socks');
      var toe = add(ankle, pitch([0, -0.1, 0.46], lg[0] - lg[1] * 0.5));
      put(cone(add(ankle, [0, -0.08, -0.1]), toe, 0.21, 0.18), 'shoe');
    });
    put(ell(add(pelvis, [0, 0.05, 0]), [0.66 * W, 0.4, 0.46 * G]), 'pants');

    var up = function (v) { return add(pelvis, pitch(v, lean)); };
    put(ell(up([0, B.waist, 0.02]), [0.66 * W * G, 0.5, 0.46 * G]), 'jersey');
    put(ell(up([0, B.chest, 0]), [0.92 * W, 0.56, 0.6 * G]), 'jersey');
    put(ell(up([0, B.pads, 0]), [B.padW * W, 0.4, 0.78]), 'jersey');
    put(ell(up([0, B.pads - 0.1, 0.02]), [B.padW * W + 0.03, 0.12, 0.76]), 'trim');
    put(cone(up([0, B.neck - 0.2, 0]), up([0, B.neck + 0.1, 0.05]), 0.26, 0.24), 'skin');
    var head = up([0, B.head, 0.06]);
    put(sph(head, B.helmet), 'helmet');
    put(rbox(add(head, pitch([0, -0.26, 0.68], lean)), [0.38, 0.24, 0.1], 0.06), 'mask');

    ['L', 'R'].forEach(function (side) {
      var s = side === 'R' ? 1 : -1, am = (o.arms && o.arms[side]) || [0.05, 0.12, 0.3];
      var sh = up([s * B.shW * W, B.shoulder, 0]);
      var elbow = add(sh, pitch(roll([0, -B.upper, 0], s * am[1]), am[0] + lean));
      var fore = pitch(roll([0, -B.fore, 0], s * am[1] * 0.6), am[0] + am[2] + lean);
      var hand = add(elbow, fore);
      put(cone(sh, elbow, 0.36 * G, 0.29 * G), 'jersey');
      put(cone(elbow, hand, 0.27 * G, 0.22), 'skin');
      put(sph(add(hand, scale(fore, 0.1)), 0.25), 'glove');
      if ((o.ball === 'hand' || o.ball === 'cocked') && side === 'R') ballAt(add(hand, scale(fore, 0.3)), o.ball === 'cocked' ? 0.6 : 1.2);
    });
    if (o.ball === 'tuck') ballAt(up([1.02 * W, 0.85, 0.42]), 0.25);
    if (o.ball === 'hands') ballAt(up([0, 1.7, 1.45]), 1.57);

    /* The ball: an ellipsoid along its own axis, tipped by tilt from forward
       toward up. A little big, as the man is. */
    function ballAt(c, tilt) {
      var ax = pitch([0, 0, 1], -tilt);
      put(function (p) {
        var d = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
        var along = d[0] * ax[0] + d[1] * ax[1] + d[2] * ax[2];
        var r = len3(d[0] - ax[0] * along, d[1] - ax[1] * along, d[2] - ax[2] * along);
        return len3(r / 0.33, along / 0.55, 0) * 0.33 - 0.33;
      }, 'ball');
    }
    return { parts: parts, head: head };
  }

  /* ---------- the poses ---------- */

  var STRIDE = function (l, r) { return { L: l, R: r }; };
  var POSES = {
    idle: [{ lean: 0.06, legs: STRIDE([0.04, 0.1], [-0.04, 0.1]), arms: { L: [0.1, 0.18, 0.3], R: [0.1, 0.18, 0.3] } }],
    stance: [{ lean: 0.5, drop: 0.55, legs: STRIDE([0.55, 1.15], [0.45, 1.05]), arms: { L: [-0.2, 0.15, 0.9], R: [-0.2, 0.15, 0.9] } }],
    /* A lineman's three point stance: hips back, a hand on the ground. */
    stance3: [{ lean: 1.12, drop: 0.95, legs: STRIDE([0.75, 1.55], [0.55, 1.35]), arms: { L: [-0.75, 0.25, 0.55], R: [-0.85, 0.08, 0.05] } }],
    run: [
      { lean: 0.28, drop: 0.12, legs: STRIDE([0.75, 0.5], [-0.55, 1.15]), arms: { L: [-0.6, 0.12, 1.3], R: [0.85, 0.12, 1.2] } },
      { lean: 0.26, drop: 0.02, legs: STRIDE([0.2, 1.4], [0.05, 0.25]), arms: { L: [0.1, 0.12, 1.2], R: [0.1, 0.12, 1.2] } },
      { lean: 0.28, drop: 0.12, legs: STRIDE([-0.55, 1.15], [0.75, 0.5]), arms: { L: [0.85, 0.12, 1.2], R: [-0.6, 0.12, 1.3] } },
      { lean: 0.26, drop: 0.02, legs: STRIDE([0.05, 0.25], [0.2, 1.4]), arms: { L: [0.1, 0.12, 1.2], R: [0.1, 0.12, 1.2] } }
    ],
    block: [
      { lean: 0.55, drop: 0.5, legs: STRIDE([0.55, 1.0], [-0.25, 0.7]), arms: { L: [0.75, 0.3, 0.35], R: [0.75, 0.3, 0.35] } },
      { lean: 0.6, drop: 0.55, legs: STRIDE([-0.2, 0.7], [0.55, 1.0]), arms: { L: [0.85, 0.3, 0.25], R: [0.85, 0.3, 0.25] } }
    ],
    catch: [{ lean: 0.1, legs: STRIDE([0.45, 0.6], [-0.35, 0.8]), arms: { L: [2.2, 0.2, 0.25], R: [2.2, 0.2, 0.25] }, ball: 'hands' }],
    carry: [
      { lean: 0.32, drop: 0.12, legs: STRIDE([0.75, 0.5], [-0.55, 1.15]), arms: { L: [-0.6, 0.15, 1.3], R: [0.35, 0.15, 1.9] }, ball: 'tuck' },
      { lean: 0.3, drop: 0.02, legs: STRIDE([0.2, 1.4], [0.05, 0.25]), arms: { L: [0.1, 0.15, 1.2], R: [0.35, 0.15, 1.9] }, ball: 'tuck' },
      { lean: 0.32, drop: 0.12, legs: STRIDE([-0.55, 1.15], [0.75, 0.5]), arms: { L: [0.85, 0.15, 1.2], R: [0.35, 0.15, 1.9] }, ball: 'tuck' },
      { lean: 0.3, drop: 0.02, legs: STRIDE([0.05, 0.25], [0.2, 1.4]), arms: { L: [0.1, 0.15, 1.2], R: [0.35, 0.15, 1.9] }, ball: 'tuck' }
    ],
    /* The QB: the ball cocked by his ear, then the release. */
    throw: [
      { lean: 0.02, drop: 0.15, legs: STRIDE([0.45, 0.4], [-0.3, 0.5]), arms: { L: [1.0, 0.3, 0.5], R: [2.6, 0.35, -1.6] }, ball: 'cocked' },
      { lean: 0.32, drop: 0.1, legs: STRIDE([0.5, 0.35], [-0.5, 0.9]), arms: { L: [-0.2, 0.3, 0.8], R: [1.55, 0.05, 0.1] } }
    ],
    dive: [{ lean: 0.3, body: 1.15, lift: 1.4, legs: STRIDE([-0.2, 0.4], [-0.35, 0.7]), arms: { L: [2.5, 0.25, 0.1], R: [2.5, 0.25, 0.1] } }],
    down: [{ lean: 0.05, body: 1.52, lift: 0.75, legs: STRIDE([0.1, 0.3], [-0.15, 0.5]), arms: { L: [2.0, 0.6, 0.6], R: [1.0, 0.8, 0.9] } }]
  };

  /* ---------- the trace ---------- */

  /* The camera looks down `pitch` radians at a man turned by yaw degrees:
     yaw 0 shows his face, 180 his back, 90 his right side. k is cells per
     foot. The stage passes its own camera's tilt and scale, so a man stands
     on the turf the way the turf is drawn. */
  function trace(pose, opt) {
    return traceModel(build(pose, !!opt.big), opt, pose.body || 0, pose.lift || 0,
      { wide: 8.2, tall: 6.8, deep: 4.6, near: 4.8 });
  }
  /* box: how far the model reaches, in feet: wide across, tall up, deep
     away from the camera, near toward it. */
  function traceModel(model, opt, tip, lift, box) {
    var k = opt.k || 4.33, ph = opt.pitch == null ? 0.7 : opt.pitch;
    var yaw = (opt.yaw || 0) * Math.PI / 180, cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(ph), sp = Math.sin(ph);
    var parts = model.parts, n = parts.length, reach = box.reach || 6.5;
    var W = Math.ceil(box.wide * k) | 1, below = Math.ceil(box.near * sp * k) + 2;
    var H = Math.ceil((box.tall * cp + box.deep * sp) * k) + below;
    var footRow = H - below, footCol = (W - 1) / 2;

    function model3(vx, vu, vd) {
      var y = vu * cp + vd * sp, zr = -vu * sp + vd * cp;
      var p = [vx * cy - zr * sy, y - lift, vx * sy + zr * cy];
      return tip ? pitch(p, -tip) : p;
    }
    function sdf(q) {
      var best = 1e9, mat = null;
      for (var i = 0; i < n; i++) { var d = parts[i][0](q); if (d < best) { best = d; mat = parts[i][1]; } }
      return [best, mat];
    }
    var cells = new Array(W * H);
    var e = 0.06;
    for (var r = 0; r < H; r++) {
      var vu = (footRow - r) / k;
      for (var c = 0; c < W; c++) {
        var vx = (c - footCol) / k, vd = reach, hit = null, steps = 0, q;
        while (vd > -reach && steps++ < 96) {
          q = model3(vx, vu, vd);
          var s = sdf(q);
          if (s[0] < 0.02) { hit = s; break; }
          vd -= Math.max(s[0], 0.035);
        }
        if (!hit) continue;
        var m = hit[1];
        if (m === 'helmet' && model.head && Math.abs(q[0]) < 0.17 && q[1] > model.head[1] - 0.1) m = 'stripe';
        if (m === 'ball' && Math.abs(q[0]) < 0.07) m = 'lace';
        var at = function (ax, au, ad) { return sdf(model3(ax, au, ad))[0]; };
        var nx = at(vx + e, vu, vd) - at(vx - e, vu, vd);
        var nu = at(vx, vu + e, vd) - at(vx, vu - e, vd);
        var nd = at(vx, vu, vd + e) - at(vx, vu, vd - e);
        var nl = len3(nx, nu, nd) || 1;
        /* PXHD's frame: x right, y DOWN the screen, z toward the viewer.
           Nearer is a larger z, as in golfer3d.js. */
        cells[r * W + c] = { m: m, n: [nx / nl, -nu / nl, nd / nl], z: vd };
      }
    }
    return { w: W, h: H, footX: footCol, footY: footRow, cells: cells };
  }

  /* ---------- the public API ---------- */

  function frames(name) { return POSES[name] || POSES.idle; }
  function frameCount(name) { return frames(name).length; }
  function poseOf(o) { var fs = frames(o.pose); return fs[((o.frame | 0) % fs.length + fs.length) % fs.length]; }
  function grid(o) { return trace(poseOf(o), o); }

  /* Headings snap to sixteen, so a play draws each direction once. */
  var FACINGS = 16;
  function snapYaw(deg) { var st = 360 / FACINGS; return ((Math.round(deg / st) * st) % 360 + 360) % 360; }

  /* A sprite is cached by everything that changes it. Size snaps to a third
     of a cell a foot and the camera's tilt to a few degrees, so a play needs
     a few dozen traces, not one a frame. */
  var cache = {}, family = {}, count = 0;
  function norm(o) {
    return { pose: o.pose || 'idle', frame: o.frame | 0, yaw: snapYaw(o.yaw || 0), team: o.team || 'offense', skin: o.skin | 0, big: !!o.big,
      k: Math.round((o.k || 4.33) * 3) / 3, pitch: Math.round((o.pitch == null ? 0.7 : o.pitch) / 0.06) * 0.06 };
  }
  function keyOf(n) { return [n.pose, n.frame, n.yaw, n.team, n.skin, n.big ? 1 : 0, n.k.toFixed(3), n.pitch.toFixed(2)].join('|'); }
  function cached(o) { return !!cache[keyOf(norm(o))]; }
  /* The nearest sprite already traced for this pose, side and size of man,
     scaled to stand in until the exact one is ready. */
  function nearest(o) {
    var n = norm(o), fam = family[[n.pose, n.frame, n.team, n.big ? 1 : 0].join('|')], best = null, bs = 1e9;
    if (!fam) fam = family[[n.pose, 0, n.team, n.big ? 1 : 0].join('|')];
    if (!fam) return null;
    for (var i = 0; i < fam.length; i++) {
      var e = fam[i], dy = Math.abs(((e.yaw - n.yaw) % 360 + 540) % 360 - 180), s2 = dy / 22.5 + Math.abs(e.k - n.k) * 2;
      if (s2 < bs) { bs = s2; best = e; }
    }
    if (!best) return null;
    var k = n.k / best.k;
    return { canvas: best.s.canvas, footX: best.s.footX, footY: best.s.footY, w: best.s.w, h: best.s.h, scale: k };
  }
  function sprite(o) {
    if (!PX || typeof document === 'undefined') return null;
    var n = norm(o), yaw = n.yaw, kq = n.k, pq = n.pitch, key = keyOf(n);
    if (cache[key]) return cache[key];
    var g = trace(poseOf(o), { k: kq, pitch: pq, yaw: yaw, big: o.big });
    var t = TEAMS[o.team] || TEAMS.offense;
    var R = {
      helmet: PX.ramp(t.helmet), stripe: PX.ramp(t.stripe), mask: PX.ramp('#c9ced6', { spread: 0.8 }),
      jersey: PX.ramp(t.jersey), trim: PX.ramp(t.trim), pants: PX.ramp(t.pants), socks: PX.ramp(t.socks),
      skin: PX.skinRamp(SKINS[((o.skin | 0) % SKINS.length + SKINS.length) % SKINS.length]),
      shoe: PX.ramp('#24262e', { spread: 0.7 }), glove: PX.ramp(t.glove || '#f1ede4', { spread: 0.7 }), ball: PX.ramp('#8a4b22'), lace: PX.ramp('#f4efe4', { spread: 0.6 })
    };
    var cv = paintGrid(g, R);
    if (++count > 2500) { cache = {}; family = {}; count = 0; }
    var out = cache[key] = { canvas: cv, footX: g.footX, footY: g.footY, w: g.w, h: g.h };
    var fk = [n.pose, n.frame, n.team, n.big ? 1 : 0].join('|');
    (family[fk] = family[fk] || []).push({ yaw: yaw, k: kq, s: out });
    return out;
  }

  /* Paint a traced grid with PXHD, each material on its ramp. */
  function paintGrid(g, R) {
    var S = new PX.Sprite(g.w, g.h);
    for (var i = 0; i < g.cells.length; i++) {
      var c = g.cells[i]; if (!c) continue;
      S.g[(i / g.w) | 0][i % g.w] = { m: c.m, n: (function (v) { return function () { return v; }; })(c.n), z: c.z, dt: 0,
        gloss: GLOSS[c.m] || 0, bias: 0, t: null, noCast: 0, tag: '' };
    }
    var cv = document.createElement('canvas'); cv.width = g.w; cv.height = g.h;
    S.paint(cv.getContext('2d'), 1, function (c) { return R[c.m] || '#ff00ff'; });
    return cv;
  }

  /* The goalpost at the back of the end zone, as the camera sees it: the
     padded base pole behind the end line, the gooseneck, the crossbar ten
     feet up and the uprights thirty feet above it, with the wind ribbons.
     Its origin is the ground under the middle of the crossbar. */
  var GP = null;
  function goalpost(opt) {
    if (!PX || typeof document === 'undefined') return null;
    if (GP && GP.k === opt.k) return GP;
    var parts = [], put = function (f, m) { parts.push([f, m]); };
    var back = -6, bar = 10, half = 9.25, top = 40, r = 0.42;
    put(cone([0, 0, back], [0, 6, back], 0.75, 0.75), 'pad');
    put(cone([0, 6, back], [0, bar, back], r, r), 'post');
    put(cone([0, bar, back], [0, bar, 0], r, r), 'post');
    put(cone([-half, bar, 0], [half, bar, 0], r, r), 'post');
    put(cone([-half, bar, 0], [-half, top, 0], r * 0.85, r * 0.8), 'post');
    put(cone([half, bar, 0], [half, top, 0], r * 0.85, r * 0.8), 'post');
    put(rbox([-half - 0.5, top - 0.6, 0], [0.5, 0.9, 0.08], 0.05), 'ribbon');
    put(rbox([half + 0.5, top - 0.6, 0], [0.5, 0.9, 0.08], 0.05), 'ribbon');
    /* the model faces +z, which is toward the camera: yaw 0 */
    var g = traceModel({ parts: parts }, { k: opt.k, pitch: opt.pitch, yaw: 0 }, 0, 0,
      { wide: 2 * half + 3, tall: top + 2, deep: 2, near: 8, reach: 30 });
    var R = { post: PX.ramp('#f2c230'), pad: PX.ramp('#21407c'), ribbon: PX.ramp('#e0533d') };
    GP = { k: opt.k, canvas: paintGrid(g, R), footX: g.footX, footY: g.footY };
    return GP;
  }

  /* Draw a man with his feet on (x, y). */
  function draw(ctx, o, x, y) {
    var s = sprite(o); if (!s) return false;
    ctx.drawImage(s.canvas, Math.round(x - s.footX), Math.round(y - s.footY));
    return true;
  }

  var API = { init: init, goalpost: goalpost, cached: cached, nearest: nearest, TEAMS: TEAMS, SKINS: SKINS, POSES: Object.keys(POSES), FACINGS: FACINGS,
    frameCount: frameCount, grid: grid, sprite: sprite, draw: draw, snapYaw: snapYaw };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.FAW_RIG = API;
})(typeof window !== 'undefined' ? window : this);
