/* Shut The Door, converged direction: the characters. MOCKUP CODE, never loaded by the live game,
   but written the way the game would ship it.

   The pipeline is RunTheTour's (golf/golfer3d.js into PXHD in golf/index.html):
     1. a posed 3D model built from round cones, ellipsoids and boxes (the body blended smooth)
     2. rasterised at the sprite's OWN low resolution, one ray per cell, through the scene's camera
        (so a sprite drops into the scene in perspective), giving each cell a part, a normal, a depth
     3. faces stamped on the head's surface as pixel features (eyes, brows, mouth, eye black, stubble),
        with a depth check, as golfer3d's put() does
     4. painted by a port of PXHD.paint: five step hue shifted ramps, one light from the top left,
        contact shadows, inner contours, and the soft outline one cell INSIDE the silhouette in the
        part's own shadow colour
     5. cached per (character, pose, camera), and drawn scaled up with image-rendering: pixelated
   Proportions are stylized (Super Mega Baseball, Backyard Baseball): a big head with a real face,
   big hands and feet, a barrel chest, short legs. Generic uniforms, no logos, no likenesses.
   One global, STD_CH. */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ vectors */
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = (a) => Math.hypot(a[0], a[1], a[2]);
  const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const rot = (v, axis, ang) => { axis = norm(axis); const c = Math.cos(ang), s = Math.sin(ang); return add(add(mul(v, c), mul(cross(axis, v), s)), mul(axis, dot(axis, v) * (1 - c))); };
  const D2R = Math.PI / 180;
  const sum = (...v) => v.reduce(add);

  /* ------------------------------------------------------------------ primitives (as golfer3d) */
  function cone(a, b, r1, r2, m, o) {
    const ba = sub(b, a), l2 = Math.max(dot(ba, ba), 1e-6), rr = r1 - r2;
    return Object.assign({ t: 0, ax: a[0], ay: a[1], az: a[2], bx: ba[0], by: ba[1], bz: ba[2], l2, rr, a2: l2 - rr * rr, il2: 1 / l2, r1, r2, m, g: 1, c: lerp(a, b, 0.5), R: Math.sqrt(l2) / 2 + Math.max(r1, r2) }, o || {});
  }
  function ell(c, ax, r, m, o) { return Object.assign({ t: 1, cx: c[0], cy: c[1], cz: c[2], u: ax, r0: r[0], r1: r[1], r2: r[2], m, g: 1, c, R: Math.max(r[0], r[1], r[2]) }, o || {}); }
  function box(c, ax, h, rad, m, o) { return Object.assign({ t: 2, cx: c[0], cy: c[1], cz: c[2], u: ax, h0: h[0], h1: h[1], h2: h[2], rad, m, g: 0, c, R: Math.hypot(h[0], h[1], h[2]) + rad }, o || {}); }
  function evalPart(P, x, y, z) {
    let d;
    if (P.t === 0) {
      const pax = x - P.ax, pay = y - P.ay, paz = z - P.az;
      const yv = pax * P.bx + pay * P.by + paz * P.bz, zv = yv - P.l2;
      const qx = pax * P.l2 - P.bx * yv, qy = pay * P.l2 - P.by * yv, qz = paz * P.l2 - P.bz * yv;
      const x2 = qx * qx + qy * qy + qz * qz, y2 = yv * yv * P.l2, z2 = zv * zv * P.l2;
      const k = Math.sign(P.rr) * P.rr * P.rr * x2;
      if (Math.sign(zv) * P.a2 * z2 > k) d = Math.sqrt(x2 + z2) * P.il2 - P.r2;
      else if (Math.sign(yv) * P.a2 * y2 < k) d = Math.sqrt(x2 + y2) * P.il2 - P.r1;
      else d = (Math.sqrt(x2 * P.a2 * P.il2) + yv * P.rr) * P.il2 - P.r1;
    } else if (P.t === 1) {
      const dx = x - P.cx, dy = y - P.cy, dz = z - P.cz, u = P.u;
      const a = (dx * u[0][0] + dy * u[0][1] + dz * u[0][2]) / P.r0, b = (dx * u[1][0] + dy * u[1][1] + dz * u[1][2]) / P.r1, c = (dx * u[2][0] + dy * u[2][1] + dz * u[2][2]) / P.r2;
      const k0 = Math.sqrt(a * a + b * b + c * c), k1 = Math.sqrt(a * a / (P.r0 * P.r0) + b * b / (P.r1 * P.r1) + c * c / (P.r2 * P.r2));
      d = k1 < 1e-9 ? -Math.min(P.r0, P.r1, P.r2) : k0 * (k0 - 1) / k1;
    } else {
      const dx = x - P.cx, dy = y - P.cy, dz = z - P.cz, u = P.u;
      const qa = Math.abs(dx * u[0][0] + dy * u[0][1] + dz * u[0][2]) - P.h0 + P.rad, qb = Math.abs(dx * u[1][0] + dy * u[1][1] + dz * u[1][2]) - P.h1 + P.rad, qc = Math.abs(dx * u[2][0] + dy * u[2][1] + dz * u[2][2]) - P.h2 + P.rad;
      d = Math.hypot(Math.max(qa, 0), Math.max(qb, 0), Math.max(qc, 0)) + Math.min(Math.max(qa, qb, qc), 0) - P.rad;
    }
    if (P.cut) for (const C of P.cut) { const s = x * C[0] + y * C[1] + z * C[2] - C[3]; if (s > d) d = s; }
    return d;
  }
  let MAT = '';
  function evalFig(F, x, y, z) {
    let dB = 1e9, rawB = 1e9, mB = '', dH = 1e9, mH = '';
    const K = F.K;
    for (const P of F.parts) {
      const lb = Math.sqrt((x - P.c[0]) ** 2 + (y - P.c[1]) ** 2 + (z - P.c[2]) ** 2) - P.R;
      if (lb > Math.min(dB, dH) + K) continue;
      const d = evalPart(P, x, y, z);
      if (P.g) { if (d < rawB) { rawB = d; mB = P.m; } const h = Math.max(K - Math.abs(dB - d), 0) / K; dB = Math.min(dB, d) - h * h * K * 0.25; }
      else if (d < dH) { dH = d; mH = P.m; }
    }
    if (dB < dH) { MAT = mB; return dB; } MAT = mH; return dH;
  }
  function figure(parts, o) {
    let c = [0, 0, 0]; for (const p of parts) c = add(c, p.c); c = mul(c, 1 / parts.length);
    let R = 0; for (const p of parts) R = Math.max(R, len(sub(p.c, c)) + p.R);
    return Object.assign({ parts, c, R: R + 0.05, K: 0.12 }, o || {});
  }

  /* ------------------------------------------------------------------ camera */
  function camera(pos, look, frameW, cssW, cssH) {
    const f = norm(sub(look, pos)), r = norm(cross(f, [0, 0, 1])), u = cross(r, f), dist = len(sub(look, pos));
    const fpx = cssW / (frameW / dist);
    return { pos, f, r, u, fpx, cssW, cssH, dist,
      ray(sx, sy) { const dx = (sx - cssW / 2) / fpx, dy = -(sy - cssH / 2) / fpx; return norm(add(f, add(mul(r, dx), mul(u, dy)))); },
      project(p) { const q = sub(p, pos), z = dot(q, f); return [cssW / 2 + dot(q, r) / z * fpx, cssH / 2 - dot(q, u) / z * fpx, z]; },
      scaleAt(p) { return fpx / dot(sub(p, pos), f); } };
  }

  /* ------------------------------------------------------------------ PXHD's colour (ported) */
  const hexRgb = (h) => { h = String(h || '#888888').replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0]; };
  const rgbHsl = ([r, g, b]) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2;
    if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; } return [h, s, l]; };
  const hslHex = (h, s, l) => { h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
    const f = (n) => { const k = (n + h / 30) % 12, a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
    return '#' + [f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join(''); };
  const mix = (a, b, t) => { const A = hexRgb(a), B = hexRgb(b); return '#' + A.map((v, i) => Math.max(0, Math.min(255, Math.round(v + (B[i] - v) * t))).toString(16).padStart(2, '0')).join(''); };
  const lum = (h) => rgbHsl(hexRgb(h))[2];
  const _r = new Map();
  function ramp(hex, o) { o = o || {}; const key = hex + '|' + (o.skin ? 1 : 0) + '|' + (o.spread || 1); let r = _r.get(key); if (r) return r;
    const sp = o.spread || 1, COOL = o.skin ? '#5a2338' : '#2a2a68', WARM = o.skin ? '#fff0d0' : '#fff7dc';
    const dk = (a, c) => mix(mix(hex, '#000000', a * sp), COOL, c), lt = (a, w) => mix(mix(hex, '#ffffff', a * sp), WARM, w);
    const sat = (c, k) => { const [hh, ss, ll] = rgbHsl(hexRgb(c)); return hslHex(hh, Math.min(1, ss * k), ll); };
    r = o.skin ? [dk(0.3, 0.22), dk(0.13, 0.1), hex, lt(0.12, 0.1), lt(0.26, 0.2)] : [sat(dk(0.34, 0.2), 1.08), sat(dk(0.15, 0.1), 1.05), hex, lt(0.16, 0.1), lt(0.34, 0.24)];
    _r.set(key, r); return r; }
  function skinRamp(hex) { const l = lum(hex); const r = ramp(hex, { skin: 1, spread: l < 0.3 ? 0.55 : 0.9 }).slice(); if (l < 0.3) { r[3] = mix(hex, '#e8b48a', 0.16); r[4] = mix(hex, '#f4cfa8', 0.3); } return r; }
  function hairRamp(hex) { const l = lum(hex); const r = ramp(hex, { spread: l < 0.2 ? 0.55 : 1 }).slice(); if (l < 0.2) { r[3] = mix(hex, '#8a7a9a', 0.28); r[4] = mix(hex, '#b8aac8', 0.45); } return r; }
  // the light is PXHD's: from the top left, toward the viewer
  const LIGHT = (() => { const v = [-0.55, -0.72, 0.72], l = Math.hypot(...v); return v.map((a) => a / l); })();
  function toneOf(n, gloss, bias) {
    const d = n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2] + (bias || 0);
    let t = d > 0.94 ? (gloss ? 4 : 3) : d > 0.8 ? 3 : d > 0.4 ? 2 : d > 0.08 ? 1 : 0;
    if (gloss > 1 && d > 0.88) t = 4; return t;
  }

  /* ------------------------------------------------------------------ the rig */
  function ik(a, t, l1, l2, pole) {
    let d = sub(t, a); let dl = len(d); const max = (l1 + l2) * 0.999; if (dl > max) { t = add(a, mul(d, max / dl)); d = sub(t, a); dl = max; }
    const dir = mul(d, 1 / dl), x = (l1 * l1 - l2 * l2 + dl * dl) / (2 * dl), h = Math.sqrt(Math.max(l1 * l1 - x * x, 0));
    const pp = norm(sub(pole, mul(dir, dot(pole, dir)))); return [add(add(a, mul(dir, x)), mul(pp, h)), t];
  }
  function frame(base, yaw, pitch, roll) {
    let [r, f, u] = base;
    if (yaw) { r = rot(r, u, yaw * D2R); f = rot(f, u, yaw * D2R); }
    if (pitch) { f = rot(f, r, -pitch * D2R); u = rot(u, r, -pitch * D2R); }
    if (roll) { r = rot(r, f, roll * D2R); u = rot(u, f, roll * D2R); }
    return [r, f, u];
  }
  /* Stylized lengths, feet. A 6 foot figure with a big head and short legs. */
  const L = { thigh: 1.22, shin: 1.12, uarm: 0.98, farm: 0.9, spine: 1.62, neck: 0.16, headR: 0.52 };
  function skeleton(P, W, B) {
    const S = B.scale || 1, F = norm([W.fwd[0], W.fwd[1], 0]), R = [F[1], -F[0], 0], U = [0, 0, 1];
    const at = (l) => sum(W.pos, mul(R, l[0]), mul(F, l[1]), mul(U, l[2]));
    const vec = (l) => sum(mul(R, l[0]), mul(F, l[1]), mul(U, l[2]));
    const pel = at(P.pelvis);
    const fp = frame([R, F, U], P.hipYaw || 0, P.hipPitch || 0, P.hipRoll || 0);
    const ft = frame(fp, P.torsoYaw || 0, P.torsoPitch || 0, P.torsoRoll || 0);
    const fh = frame(ft, P.headYaw || 0, P.headPitch || 0, P.headRoll || 0);
    const w = B.w || 1;
    const neck = add(pel, mul(ft[2], L.spine * S));
    const shY = L.spine * S - 0.14;
    const shL = sum(pel, mul(ft[2], shY), mul(ft[0], -0.7 * w * S)), shR = sum(pel, mul(ft[2], shY), mul(ft[0], 0.7 * w * S));
    const head = sum(neck, mul(fh[2], (L.neck + L.headR * 0.9) * S), mul(fh[1], 0.04));
    const hipL = sum(pel, mul(fp[0], -0.34 * w * S), mul(fp[2], -0.12)), hipR = sum(pel, mul(fp[0], 0.34 * w * S), mul(fp[2], -0.12));
    const kp = (s) => P.kneePole ? norm(vec(P.kneePole[s])) : F;
    const [knL, anL] = ik(hipL, at(P.footL), L.thigh * S, L.shin * S, kp(0));
    const [knR, anR] = ik(hipR, at(P.footR), L.thigh * S, L.shin * S, kp(1));
    const ep = (s) => P.elbowPole ? norm(vec(P.elbowPole[s])) : mul(U, -1);
    const [elL, wrL] = ik(shL, at(P.handL), L.uarm * S, L.farm * S, ep(0));
    const [elR, wrR] = ik(shR, at(P.handR), L.uarm * S, L.farm * S, ep(1));
    const toe = (s) => norm(vec(P.toe ? P.toe[s] : [0, 1, 0]));
    return { pel, neck, head, shL, shR, hipL, hipR, knL, knR, anL, anR, elL, elR, wrL, wrR, fp, ft, fh, F, R, U, at, vec, toeL: toe(0), toeR: toe(1), S };
  }

  /* ------------------------------------------------------------------ the body */
  // B: a build { w width, belly 0..1, limb thickness, scale, jaw width, nose size }
  // K: the kit's material names
  function body(Sk, K, B, o) {
    o = o || {};
    const S = Sk.S, w = B.w || 1, bl = B.belly || 0, lt = B.limb || 1, parts = [], ax = (f) => [f[0], f[1], f[2]];
    const ft = Sk.ft, fp = Sk.fp, fh = Sk.fh;
    // the trunk: hips, belly, a barrel chest, the trapezius
    parts.push(ell(add(Sk.pel, mul(fp[2], 0.02)), ax(fp), [0.6 * w * S, 0.45 * w * S, 0.44 * S], K.pants));
    parts.push(ell(sum(Sk.pel, mul(fp[1], -0.16 * S), mul(fp[2], -0.08)), ax(fp), [0.56 * w * S, 0.4 * S, 0.36 * S], K.pants));
    parts.push(ell(sum(Sk.pel, mul(ft[2], 0.6 * S), mul(ft[1], 0.07 * bl)), ax(ft), [0.58 * w * (1 + 0.14 * bl) * S, 0.46 * w * (1 + 0.34 * bl) * S, 0.5 * S], K.jersey));
    parts.push(ell(sum(Sk.pel, mul(ft[2], 1.16 * S), mul(ft[1], 0.04)), ax(ft), [0.74 * w * S, 0.48 * w * S, 0.52 * S], K.jersey));
    parts.push(ell(sum(Sk.pel, mul(ft[2], 1.5 * S), mul(ft[1], -0.05)), ax(ft), [0.55 * w * S, 0.32 * S, 0.22 * S], K.jersey));
    if (K.belt) parts.push(ell(add(Sk.pel, mul(ft[2], 0.3 * S)), ax(ft), [0.62 * w * (1 + 0.1 * bl) * S, 0.47 * w * (1 + 0.25 * bl) * S, 0.075 * S], K.belt, { g: 0 }));
    if (K.piping) parts.push(cone(sum(Sk.pel, mul(ft[2], 0.36 * S), mul(ft[1], 0.47 * w * (1 + 0.3 * bl) * S)), sum(Sk.neck, mul(ft[1], 0.36 * w * S), mul(ft[2], -0.18)), 0.035, 0.035, K.piping, { g: 0 }));
    // neck and head
    parts.push(cone(Sk.neck, add(Sk.head, mul(fh[2], -0.3 * S)), 0.24 * S, 0.22 * S, K.skin));
    const hr = L.headR * S, jw = B.jaw || 1, ns = B.nose || 1;
    parts.push(ell(Sk.head, ax(fh), [0.9 * hr, 0.94 * hr, hr], K.skin));
    parts.push(ell(sum(Sk.head, mul(fh[1], 0.14 * hr), mul(fh[2], -0.42 * hr)), ax(fh), [0.72 * hr * jw, 0.7 * hr, 0.56 * hr], K.skin));
    parts.push(ell(sum(Sk.head, mul(fh[1], 0.92 * hr), mul(fh[2], -0.12 * hr)), ax(fh), [0.17 * hr * ns, 0.2 * hr * ns, 0.2 * hr * ns], K.skin)); // the nose
    for (const s of [-1, 1]) parts.push(ell(sum(Sk.head, mul(fh[0], s * 0.88 * hr), mul(fh[1], -0.04), mul(fh[2], -0.06 * hr)), ax(fh), [0.12 * hr, 0.2 * hr, 0.26 * hr], K.skin));
    if (K.beard) parts.push(ell(sum(Sk.head, mul(fh[1], 0.2 * hr), mul(fh[2], -0.52 * hr)), ax(fh), [0.74 * hr * jw, 0.7 * hr, 0.5 * hr], K.beard, { g: 0, cut: [[...fh[2], dot(fh[2], add(Sk.head, mul(fh[2], -0.3 * hr)))]] }));
    if (K.goatee) parts.push(ell(sum(Sk.head, mul(fh[1], 0.62 * hr), mul(fh[2], -0.78 * hr)), ax(fh), [0.26 * hr, 0.2 * hr, 0.22 * hr], K.goatee, { g: 0 }));
    // the hair that shows below a cap or helmet: the nape and the sideburns
    if (K.hair && !o.noHair) parts.push(ell(sum(Sk.head, mul(fh[1], -0.12 * hr), mul(fh[2], -0.08 * hr)), ax(fh), [0.94 * hr, 0.9 * hr, 0.86 * hr], K.hair, { g: 0, cut: [[...fh[1], dot(fh[1], add(Sk.head, mul(fh[1], 0.36 * hr)))]] }));
    // arms: the sleeve, then the undershirt, then a big hand or glove
    for (const s of ['L', 'R']) {
      const sh = Sk['sh' + s], el = Sk['el' + s], wr = Sk['wr' + s];
      parts.push(ell(add(sh, mul(ft[2], -0.04)), ax(ft), [0.28 * w * lt * S, 0.28 * lt * S, 0.26 * lt * S], K.jersey));
      const mid = lerp(sh, el, o.shortSleeve ? 0.5 : 0.62);
      parts.push(cone(sh, mid, 0.25 * lt * S, 0.22 * lt * S, K.jersey));
      parts.push(cone(mid, el, 0.19 * lt * S, 0.17 * lt * S, K.sleeve || K.jersey));
      parts.push(cone(el, wr, 0.17 * lt * S, 0.13 * lt * S, K.forearm || K.sleeve || K.skin));
    }
    // legs: baggy pants to below the knee, high socks, big cleats
    for (const s of ['L', 'R']) {
      const hp = Sk['hip' + s], kn = Sk['kn' + s], an = Sk['an' + s], toe = s === 'L' ? Sk.toeL : Sk.toeR;
      parts.push(cone(hp, kn, 0.36 * lt * S, 0.25 * lt * S, K.pants));
      const calf = lerp(kn, an, K.socks ? 0.42 : 0.86);
      parts.push(cone(kn, calf, 0.25 * lt * S, 0.22 * lt * S, K.pants));
      parts.push(cone(calf, an, 0.19 * lt * S, 0.14 * lt * S, K.socks || K.pants));
      const fr = norm(cross(toe, [0, 0, 1]));
      parts.push(ell(sum(an, mul(toe, 0.24 * S), [0, 0, -0.1 * S]), [fr, toe, [0, 0, 1]], [0.21 * S, 0.46 * S, 0.17 * S], K.shoe, { g: 0 }));
    }
    return parts;
  }
  function hand(Sk, s, m, dir, size) {
    const S = Sk.S, wr = Sk['wr' + s], el = Sk['el' + s], d = dir ? norm(dir) : norm(sub(wr, el));
    const side = norm(cross(d, [0, 0, 1])), up = norm(cross(side, d)), k = size || 1;
    return ell(add(wr, mul(d, 0.18 * S)), [side, d, up], [0.15 * k * S, 0.21 * k * S, 0.19 * k * S], m, { g: 0 });
  }
  const plane = (n, p) => { n = norm(n); return [n[0], n[1], n[2], dot(n, p)]; };
  function helmet(Sk, K, flap) {
    const S = Sk.S, fh = Sk.fh, hr = L.headR * S, c = add(Sk.head, mul(fh[2], 0.12 * hr)), ax = [fh[0], fh[1], fh[2]];
    const out = [ell(c, ax, [1.04 * hr, 1.1 * hr, 0.98 * hr], K.helmet, { g: 0, gloss: 2, cut: [plane(add(mul(fh[2], -1), mul(fh[1], 0.45)), add(c, mul(fh[2], -0.18 * hr)))] }),
      ell(sum(c, mul(fh[1], 0.95 * hr), mul(fh[2], 0.06 * hr)), [fh[0], norm(add(fh[1], mul(fh[2], -0.15))), fh[2]], [0.78 * hr, 0.42 * hr, 0.07 * hr], K.helmet, { g: 0, gloss: 2 })];
    if (flap) out.push(ell(sum(c, mul(fh[0], flap * 0.84 * hr), mul(fh[2], -0.5 * hr), mul(fh[1], 0.1 * hr)), ax, [0.26 * hr, 0.56 * hr, 0.5 * hr], K.helmet, { g: 0, gloss: 2 }));
    return out;
  }
  function cap(Sk, K, o) {
    o = o || {};
    const S = Sk.S, fh = Sk.fh, hr = L.headR * S, c = add(Sk.head, mul(fh[2], 0.2 * hr)), ax = [fh[0], fh[1], fh[2]];
    const bill = norm(add(fh[1], mul(fh[2], o.billDown == null ? -0.28 : -o.billDown)));
    return [ell(c, ax, [0.97 * hr, 1.02 * hr, 0.86 * hr], K.cap, { g: 0, cut: [plane(add(mul(fh[2], -1), mul(fh[1], 0.25)), add(c, mul(fh[2], -0.1 * hr)))] }),
      ell(sum(c, mul(bill, 0.96 * hr), mul(fh[2], -0.08 * hr)), [fh[0], bill, norm(cross(fh[0], bill))], [0.74 * hr, 0.66 * hr, 0.07 * hr], K.capBill || K.cap, { g: 0 }),
      ell(add(c, mul(fh[2], 0.84 * hr)), ax, [0.1 * hr, 0.1 * hr, 0.06 * hr], K.capBill || K.cap, { g: 0 })];
  }
  function mask(Sk, K, mat) {
    const S = Sk.S, fh = Sk.fh, hr = L.headR * S, ax = [fh[0], fh[1], fh[2]];
    return [ell(add(Sk.head, mul(fh[2], 0.1 * hr)), ax, [1.05 * hr, 1.08 * hr, 1.08 * hr], mat, { g: 0, gloss: 1, cut: [plane(fh[1], add(Sk.head, mul(fh[1], 0.3 * hr)))] }),
      ell(add(Sk.head, mul(fh[1], 0.36 * hr)), ax, [0.98 * hr, 0.86 * hr, 1.08 * hr], 'cage', { g: 0 })];
  }
  function bat(grip, dir, K, S) {
    dir = norm(dir); S = S || 1; const knob = add(grip, mul(dir, -0.18 * S)), side = norm(cross(dir, [0.0001, 0, 1]));
    return [ell(knob, [side, dir, norm(cross(side, dir))], [0.09 * S, 0.035 * S, 0.09 * S], K.bat, { g: 0 }),
      cone(knob, add(knob, mul(dir, 1.3 * S)), 0.055 * S, 0.06 * S, K.bat, { g: 0, gloss: 1 }),
      cone(add(knob, mul(dir, 1.3 * S)), add(knob, mul(dir, 2.15 * S)), 0.06 * S, 0.125 * S, K.bat, { g: 0, gloss: 1 }),
      cone(add(knob, mul(dir, 2.15 * S)), add(knob, mul(dir, 2.9 * S)), 0.125 * S, 0.13 * S, K.bat, { g: 0, gloss: 1 })];
  }

  /* ------------------------------------------------------------------ poses
     In the figure's own frame: x to his right, y the way he faces, z up, feet. */
  const POSES = {
    // a left handed batter faces the plate; his right shoulder points at the pitcher (+x)
    stance: { pelvis: [-0.1, -0.15, 2.38], hipYaw: -8, hipPitch: 14, torsoYaw: -16, torsoPitch: 16, torsoRoll: -4, headYaw: 72, headPitch: 4, headRoll: 6,
      footR: [1.15, 0.12, 0.26], footL: [-1.4, -0.05, 0.26], toe: [[0.3, 1, 0], [-0.1, 1, 0]], kneePole: [[-0.4, 1, 0], [0.6, 1, 0]],
      handL: [-0.62, 0.62, 4.15], handR: [-0.5, 0.7, 4.24], elbowPole: [[-0.7, 0.3, -1], [0.5, 0.3, -1]], bat: { grip: [-0.6, 0.66, 4.1], dir: [-0.38, -0.3, 0.88] } },
    load: { pelvis: [-0.3, -0.18, 2.3], hipYaw: -18, hipPitch: 15, torsoYaw: -26, torsoPitch: 16, torsoRoll: -6, headYaw: 76, headPitch: 4, headRoll: 8,
      footR: [1.05, 0.12, 0.62], footL: [-1.45, -0.05, 0.26], toe: [[0.2, 1, -0.3], [-0.1, 1, 0]], kneePole: [[-0.2, 1, 0], [0.4, 1, 0.5]],
      handL: [-0.98, 0.42, 4.25], handR: [-0.86, 0.5, 4.32], elbowPole: [[-0.7, 0.1, -1], [0.3, 0.3, -1]], bat: { grip: [-0.95, 0.46, 4.2], dir: [-0.2, -0.55, 0.81] } },
    contact: { pelvis: [0.12, -0.1, 2.25], hipYaw: 50, hipPitch: 12, torsoYaw: 40, torsoPitch: 18, torsoRoll: -12, headYaw: 8, headPitch: 18, headRoll: 0,
      footR: [1.75, 0.2, 0.26], footL: [-1.3, 0.05, 0.34], toe: [[0.6, 1, 0], [0.3, 1, 0.4]], kneePole: [[0.2, 1, 0], [1, 1, 0]],
      handL: [0.55, 1.45, 2.95], handR: [0.7, 1.4, 3.05], elbowPole: [[-0.2, -0.3, -1], [0.4, -0.5, -1]], bat: { grip: [0.62, 1.42, 2.98], dir: [0.55, 0.85, -0.12] } },
    follow: { pelvis: [0.2, -0.05, 2.38], hipYaw: 80, hipPitch: 8, torsoYaw: 70, torsoPitch: 10, torsoRoll: -8, headYaw: -10, headPitch: 12,
      footR: [1.75, 0.2, 0.26], footL: [-1.1, 0.1, 0.45], toe: [[0.7, 1, 0], [0.6, 1, 0.6]], kneePole: [[0.3, 1, 0], [1, 1, 0.3]],
      handL: [-0.2, 0.3, 4.55], handR: [0.05, 0.25, 4.45], elbowPole: [[1, 0.4, -0.4], [0.8, 0.8, -0.6]], bat: { grip: [-0.1, 0.28, 4.5], dir: [-0.85, -0.45, -0.3] } },
    whiff: { pelvis: [0.4, 0.1, 2.05], hipYaw: 56, hipPitch: 26, torsoYaw: 44, torsoPitch: 38, torsoRoll: -20, headYaw: 10, headPitch: 34, headRoll: -10,
      footR: [1.95, 0.3, 0.26], footL: [-1.2, 0.0, 0.4], toe: [[0.6, 1, 0], [0.4, 1, 0.5]], kneePole: [[0.2, 1, 0.1], [1, 1, 0.2]],
      handL: [1.2, 1.65, 2.15], handR: [1.35, 1.55, 2.3], elbowPole: [[0, -0.3, -1], [0.3, -0.5, -1]], bat: { grip: [1.25, 1.6, 2.2], dir: [0.95, 0.15, -0.55] } },
    // the catcher: set, receiving (the mitt where the ball is), framing (the mitt turned into the zone)
    cSet: { pelvis: [0, -0.3, 1.32], hipPitch: 6, torsoPitch: 16, headPitch: -12,
      footL: [-0.95, -0.1, 0.26], footR: [0.95, -0.1, 0.26], toe: [[-0.45, 1, 0], [0.45, 1, 0]], kneePole: [[-0.6, 1, 0.3], [0.6, 1, 0.3]],
      handL: [-0.35, 1.1, 2.3], handR: [0.6, 0.4, 1.55], elbowPole: [[-1, -0.2, -0.6], [1, -0.3, -0.5]] },
    // the umpire: the set behind the catcher, the strike call, a ball (no call, hands down)
    uSet: { pelvis: [0, -0.5, 2.4], hipPitch: 24, torsoPitch: 30, headPitch: -28,
      footL: [-1.15, -0.2, 0.26], footR: [1.15, -0.05, 0.26], toe: [[-0.4, 1, 0], [0.4, 1, 0]], kneePole: [[-0.6, 1, 0], [0.6, 1, 0]],
      handL: [-0.62, 0.62, 2.1], handR: [0.62, 0.66, 2.1], elbowPole: [[-1, -0.4, 0], [1, -0.4, 0]] },
    uStrike: { pelvis: [0.1, -0.3, 2.6], hipYaw: -30, hipPitch: 4, torsoYaw: -20, torsoPitch: 4, headYaw: 30, headPitch: 0,
      footL: [-0.7, 0, 0.26], footR: [0.7, 0.1, 0.26], toe: [[-0.3, 1, 0], [0.3, 1, 0]],
      handL: [-0.6, 0.55, 3.0], handR: [1.25, 0.1, 5.6], elbowPole: [[-1, 0, -0.5], [1, -0.5, 0.2]] },
    uBall: { pelvis: [0, -0.3, 2.62], torsoPitch: 3, headPitch: 0,
      footL: [-0.8, 0, 0.26], footR: [0.8, 0, 0.26], toe: [[-0.3, 1, 0], [0.3, 1, 0]],
      handL: [-0.75, 0.1, 2.65], handR: [0.75, 0.1, 2.65], elbowPole: [[-1, 0, -0.5], [1, 0, -0.5]] },
    // the pitcher, from behind (his y faces the plate)
    pSet: { pelvis: [0, 0, 2.62], hipYaw: 0, torsoPitch: 4, headPitch: 6,
      footL: [-0.5, 0.25, 0.26], footR: [0.5, -0.1, 0.26], toe: [[-0.1, 1, 0], [0.4, 1, 0]],
      handL: [-0.05, 0.6, 3.95], handR: [0.1, 0.62, 3.9], elbowPole: [[-1, 0, -0.6], [1, 0, -0.6]] },
    pKick: { pelvis: [0.05, 0, 2.68], hipYaw: 70, torsoYaw: 20, torsoPitch: -4, headYaw: -86, headPitch: 6,
      footR: [0.45, -0.1, 0.26], footL: [-0.4, 0.5, 2.75], toe: [[0, 0.4, -1], [0.4, 1, 0]], kneePole: [[0.2, 1, 0.3], [0.4, 1, 0]],
      handL: [-0.1, 0.55, 4.0], handR: [0.05, 0.5, 3.9], elbowPole: [[-1, 0, -0.6], [1, 0, -0.6]] },
    pRelease: { pelvis: [-0.3, 2.0, 2.15], hipYaw: 30, hipPitch: 12, torsoYaw: 18, torsoPitch: 30, torsoRoll: -16, headPitch: -18, headYaw: -10,
      footL: [-0.5, 4.3, -0.05], footR: [0.4, 0.4, 0.5], toe: [[0.1, 1, 0], [0.9, 0.2, -0.5]], kneePole: [[0, 1, 0], [0.4, 1, 0.3]],
      handL: [-0.4, 2.55, 3.65], handR: [0.85, 3.7, 5.25], elbowPole: [[-1, -0.3, -0.6], [1, -0.2, -0.3]] },
    pFollow: { pelvis: [-0.3, 2.7, 2.05], hipYaw: 48, hipPitch: 26, torsoYaw: 36, torsoPitch: 52, torsoRoll: -10, headPitch: -40, headYaw: -18,
      footL: [-0.5, 4.3, -0.05], footR: [0.2, 1.5, 0.85], toe: [[0.1, 1, 0], [0.6, 0.2, -0.8]], kneePole: [[0, 1, 0], [0.4, 0.6, 0.6]],
      handL: [-0.85, 2.7, 2.7], handR: [-1.0, 4.2, 2.1], elbowPole: [[-1, -0.3, -0.3], [0.2, 0.2, -1]] },
    // the coach: arms folded, or a hand at the chin
    coach: { pelvis: [0, 0, 2.62], torsoPitch: 3, headPitch: -8, headYaw: -12, headRoll: 3,
      footL: [-0.5, 0, 0.26], footR: [0.5, 0, 0.26], handL: [0.45, 0.66, 3.55], handR: [-0.42, 0.7, 3.7], elbowPole: [[-1, 0.2, -0.7], [1, 0.2, -0.7]] },
    coachThink: { pelvis: [0, 0, 2.62], torsoPitch: 3, headPitch: -4, headYaw: -18, headRoll: -6,
      footL: [-0.5, 0, 0.26], footR: [0.5, 0, 0.26], handL: [0.4, 0.62, 3.5], handR: [0.12, 0.62, 4.15], elbowPole: [[-1, 0.2, -0.7], [1, 0.2, -1]] },
  };
  function catcherPose(mitt, low) {
    const p = JSON.parse(JSON.stringify(POSES.cSet)); p.handL = mitt; const k = Math.max(0, low || 0);
    p.torsoPitch += k * 16; p.headPitch -= k * 14; p.pelvis[2] -= k * 0.1; return p;
  }

  /* ------------------------------------------------------------------ kits and people */
  const SKIN = ['#f1c7a3', '#e2ad86', '#c98e66', '#a8714f', '#875438', '#5f3a27'];
  const HAIR = ['#1c1714', '#3a271c', '#6b4a2f', '#a0773f', '#c9c4bb', '#2a2a2e'];
  const TEAM = {
    us: { jersey: '#c9ccd2', pants: '#c3c6cc', sleeve: '#1d4f96', socks: '#1d4f96', cap: '#1d4f96', helmet: '#1d4f96', piping: '#1d4f96', belt: '#1d4f96' },   // the Dodgers on the road, generic
    them: { jersey: '#f3f1ea', pants: '#efede6', sleeve: '#1f4e93', socks: '#1f4e93', cap: '#1f4e93', helmet: '#1f4e93', piping: '#c8322b', belt: '#1f4e93' },  // the home side, generic
  };
  /* A person: a build, a face, and a way of standing. Generic people, not anybody real. */
  const PEOPLE = {
    slugger: { skin: 2, hair: 0, build: { w: 1.18, belly: 0.5, limb: 1.12, scale: 1.04, jaw: 1.16, nose: 1.15 }, beard: true, brows: 'thick', eyes: 'set', eyeBlack: true },
    lefty: { skin: 1, hair: 2, build: { w: 0.98, belly: 0.1, limb: 0.96, scale: 1.0, jaw: 0.98, nose: 1.0 }, goatee: true, brows: 'flat', eyes: 'set', eyeBlack: true },
    slap: { skin: 4, hair: 0, build: { w: 0.9, belly: 0, limb: 0.92, scale: 0.96, jaw: 0.92, nose: 0.95 }, brows: 'arched', eyes: 'bright' },
    vet: { skin: 0, hair: 4, build: { w: 1.08, belly: 0.75, limb: 1.04, scale: 1.0, jaw: 1.08, nose: 1.3 }, stache: true, brows: 'bushy', eyes: 'squint' },
    kid: { skin: 3, hair: 1, build: { w: 0.94, belly: 0, limb: 0.94, scale: 0.98, jaw: 0.9, nose: 0.9 }, brows: 'flat', eyes: 'bright', blush: true },
    big: { skin: 5, hair: 0, build: { w: 1.28, belly: 0.9, limb: 1.2, scale: 1.08, jaw: 1.2, nose: 1.1 }, beard: true, brows: 'thick', eyes: 'set' },
    catcher: { skin: 3, hair: 1, build: { w: 1.14, belly: 0.4, limb: 1.1, scale: 1.0, jaw: 1.1, nose: 1.1 }, stubble: true, brows: 'thick', eyes: 'set' },
    ump: { skin: 1, hair: 4, build: { w: 1.16, belly: 0.9, limb: 1.06, scale: 1.02, jaw: 1.14, nose: 1.2 }, stache: true, brows: 'bushy', eyes: 'squint' },
    pitcher: { skin: 1, hair: 0, build: { w: 1.0, belly: 0.1, limb: 1.0, scale: 1.02, jaw: 1.0, nose: 1.0 }, brows: 'flat', eyes: 'set' },
    coach: { skin: 1, hair: 4, build: { w: 1.12, belly: 0.8, limb: 1.04, scale: 1.0, jaw: 1.12, nose: 1.35 }, stache: true, brows: 'bushy', eyes: 'squint' },
  };

  /* Build a character. who: a PEOPLE key or object. role: batter, catcher, ump, pitcher, coach.
     place: {pos, fwd}. pose: a POSES key or a pose. o: {bats, team, expr, mitt} */
  function build(role, who, place, pose, o) {
    o = o || {};
    const per = typeof who === 'string' ? PEOPLE[who] : who, B = per.build;
    const P = typeof pose === 'string' ? POSES[pose] : pose;
    const Sk = skeleton(P, place, B);
    const team = TEAM[o.team || (role === 'batter' ? 'them' : 'us')];
    const pal = { skin: SKIN[per.skin], hair: HAIR[per.hair] };
    const K = { skin: 'skin', hair: 'hair', jersey: 'jersey', pants: 'pants', sleeve: 'sleeve', forearm: 'sleeve', socks: 'socks', shoe: 'shoe', belt: 'belt', piping: 'piping', helmet: 'helmet', cap: 'cap', bat: 'bat', glove: 'bglove', beard: per.beard ? 'hair' : null, goatee: per.goatee ? 'hair' : null };
    const cols = { jersey: team.jersey, pants: team.pants, sleeve: team.sleeve, socks: team.socks, shoe: '#22232a', belt: team.belt, piping: team.piping, helmet: team.helmet, cap: team.cap, bat: '#c99a5c', bglove: '#2c2d33', mitt: '#7a4a24', mittIn: '#a8703c', cage: '#2a2c31', mask: '#2a2c31', gear: team.helmet, board: '#d8cdb2' };
    let parts = [], noHair = false;
    if (role === 'umpire' || role === 'ump') { Object.assign(cols, { jersey: '#1d2433', sleeve: '#1d2433', pants: '#7a7f88', socks: '#1a1b20', belt: '#141518', piping: null }); K.piping = null; K.forearm = 'sleeve'; }
    if (role === 'coach') { Object.assign(cols, { jersey: team.cap, sleeve: team.cap, pants: team.pants, belt: '#141518' }); K.forearm = 'sleeve'; K.piping = 'zip'; cols.zip = '#e9ecf2'; }
    if (role === 'pitcher' || role === 'coach') K.forearm = 'sleeve';
    parts = body(Sk, K, B, { noHair });
    const hr = L.headR * Sk.S;
    if (role === 'batter') {
      parts.push(...helmet(Sk, K, 1));
      if (P.bat) { const grip = Sk.at(P.bat.grip), dir = Sk.vec(P.bat.dir); parts.push(...bat(grip, dir, K, Sk.S)); parts.push(hand(Sk, 'L', 'bglove', dir, 1.05), hand(Sk, 'R', 'bglove', dir, 1.05)); }
      else parts.push(hand(Sk, 'L', 'bglove'), hand(Sk, 'R', 'bglove'));
    } else if (role === 'catcher') {
      parts.push(...mask(Sk, K, 'gear'));
      const pc = sum(Sk.pel, mul(Sk.ft[2], 1.0), mul(Sk.ft[1], 0.42 * (B.w || 1)));
      parts.push(ell(pc, [Sk.ft[0], Sk.ft[1], Sk.ft[2]], [0.64, 0.14, 0.74], 'gear', { g: 0, gloss: 1, cut: [[...Sk.ft[1].map((v) => -v), -dot(Sk.ft[1], pc)]] }));
      for (const s of ['L', 'R']) {
        const kn = Sk['kn' + s], an = Sk['an' + s], toe = s === 'L' ? Sk.toeL : Sk.toeR, sd = norm(sub(an, kn)), fw = norm(sub(toe, mul(sd, dot(toe, sd))));
        parts.push(cone(add(kn, mul(fw, 0.08)), add(an, mul(fw, 0.14)), 0.27, 0.19, 'gear', { g: 0, gloss: 1 }));
        parts.push(ell(add(kn, mul(fw, 0.12)), [norm(cross(sd, fw)), fw, mul(sd, -1)], [0.25, 0.17, 0.26], 'gear', { g: 0, gloss: 1 }));
      }
      const wl = Sk.wrL, md = norm(add(Sk.F, [0, 0, 0.3]));
      parts.push(ell(sum(wl, mul(md, 0.1), [0, 0, 0.26]), [Sk.R, md, norm(cross(Sk.R, md))], [0.5, 0.16, 0.54], 'mitt', { g: 0 }));
      parts.push(ell(sum(wl, mul(md, 0.22), [0, 0, 0.26]), [Sk.R, md, norm(cross(Sk.R, md))], [0.3, 0.05, 0.34], 'mittIn', { g: 0 }));
      parts.push(hand(Sk, 'R', 'skin'));
    } else if (role === 'umpire' || role === 'ump') {
      parts.push(...mask(Sk, K, 'mask'));
      parts.push(ell(sum(Sk.pel, mul(Sk.ft[2], 1.15), mul(Sk.ft[1], 0.22)), [Sk.ft[0], Sk.ft[1], Sk.ft[2]], [0.8, 0.5, 0.62], 'jersey'));
      parts.push(hand(Sk, 'L', 'skin'), hand(Sk, 'R', 'skin', null, P === POSES.uStrike ? 1.15 : 1));
    } else if (role === 'pitcher') {
      parts.push(...cap(Sk, K));
      const wl = Sk.wrL, gd = norm(sub(wl, Sk.elL));
      parts.push(ell(add(wl, mul(gd, 0.26)), [norm(cross(gd, [0, 0, 1])), gd, norm(cross(cross(gd, [0, 0, 1]), gd))], [0.3, 0.42, 0.18], 'mitt', { g: 0 }));
      parts.push(hand(Sk, 'R', 'skin'));
      // a stripe of piping down the back and across the shoulders reads as a uniform from behind
      parts.push(cone(sum(Sk.pel, mul(Sk.ft[2], 0.4), mul(Sk.ft[1], -0.44)), sum(Sk.neck, mul(Sk.ft[1], -0.3), mul(Sk.ft[2], -0.12)), 0.035, 0.035, 'piping', { g: 0 }));
    } else if (role === 'coach') {
      parts.push(...cap(Sk, K, { billDown: 0.18 }));
      parts.push(hand(Sk, 'L', 'skin'), hand(Sk, 'R', 'skin'));
    }
    const F = figure(parts, { role, per, Sk, pal, cols, hr, expr: o.expr || (role === 'batter' ? 'focus' : 'neutral'), masked: role === 'catcher' || role === 'ump' || role === 'umpire', bats: o.bats || 'L' });
    if (o.bats === 'R') mirrorX(F);
    return F;
  }
  /* A right handed batter is the left handed one reflected across the middle of the plate. */
  function mirrorX(F) {
    const fx = (v) => [-v[0], v[1], v[2]];
    for (const P of F.parts) {
      if (P.t === 0) { P.ax = -P.ax; P.bx = -P.bx; } else { P.cx = -P.cx; P.u = P.u.map(fx); }
      P.c = fx(P.c); if (P.cut) P.cut = P.cut.map((C) => [-C[0], C[1], C[2], C[3]]);
    }
    F.c = fx(F.c); const Sk = F.Sk; Sk.head = fx(Sk.head); Sk.fh = [fx(Sk.fh[0]).map((v) => -v), fx(Sk.fh[1]), fx(Sk.fh[2])];
    return F;
  }

  /* ------------------------------------------------------------------ the raster */
  /* Rasterise a figure through cam at `cell` css px a cell. Returns the cells it covers: part,
     normal (screen space: x right, y down, z toward the viewer), depth. Only the cells inside the
     figure's projected bounding circle are cast. */
  function raster(F, cam, cell) {
    const pc = cam.project(F.c), rad = F.R * cam.scaleAt(F.c) * 1.05;
    const x0 = Math.max(0, Math.floor((pc[0] - rad) / cell)), y0 = Math.max(0, Math.floor((pc[1] - rad) / cell));
    const x1 = Math.min(Math.ceil(cam.cssW / cell), Math.ceil((pc[0] + rad) / cell)), y1 = Math.min(Math.ceil(cam.cssH / cell), Math.ceil((pc[1] + rad) / cell));
    const W = Math.max(0, x1 - x0), H = Math.max(0, y1 - y0), cells = new Array(W * H).fill(null);
    const o = cam.pos, e = 0.004;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const d = cam.ray((x0 + i + 0.5) * cell, (y0 + j + 0.5) * cell);
      const ox = o[0] - F.c[0], oy = o[1] - F.c[1], oz = o[2] - F.c[2], b = ox * d[0] + oy * d[1] + oz * d[2], h = b * b - (ox * ox + oy * oy + oz * oz - F.R * F.R);
      if (h < 0) continue; const sq = Math.sqrt(h); let t = Math.max(0, -b - sq); const t1 = -b + sq;
      for (let s = 0; s < 90 && t < t1; s++) {
        const px = o[0] + d[0] * t, py = o[1] + d[1] * t, pz = o[2] + d[2] * t, dd = evalFig(F, px, py, pz);
        if (dd < 0.003) {
          const m = MAT;
          const n = norm([
            evalFig(F, px + e, py - e, pz - e) - evalFig(F, px - e, py - e, pz + e) - evalFig(F, px - e, py + e, pz - e) + evalFig(F, px + e, py + e, pz + e),
            -evalFig(F, px + e, py - e, pz - e) - evalFig(F, px - e, py - e, pz + e) + evalFig(F, px - e, py + e, pz - e) + evalFig(F, px + e, py + e, pz + e),
            -evalFig(F, px + e, py - e, pz - e) + evalFig(F, px - e, py - e, pz + e) - evalFig(F, px - e, py + e, pz - e) + evalFig(F, px + e, py + e, pz + e)]);
          const sn = [dot(n, cam.r), -dot(n, cam.u), -dot(n, cam.f)];
          // the gloss flag of the part that was hit (helmets, the bat, the mask's frame)
          let gl = 0; for (const P of F.parts) if (P.m === m && P.gloss) { gl = P.gloss; break; }
          cells[j * W + i] = { m, n: sn, z: t, gloss: gl, p: [px, py, pz] }; break;
        }
        t += Math.max(dd * 0.8, 0.002);
      }
    }
    return { x0, y0, W, H, cells };
  }

  /* ------------------------------------------------------------------ paint (PXHD.paint, ported) */
  function rampFor(F, m) {
    const c = F.cols, p = F.pal;
    if (m === 'skin') return skinRamp(p.skin);
    if (m === 'hair') return hairRamp(p.hair);
    if (m === 'cage') return ramp('#3a3d44');
    const hex = c[m]; return hex ? ramp(hex) : ramp('#ff00ff');
  }
  function paint(F, R) {
    const { W, H, cells } = R, T = new Int8Array(W * H).fill(-1), out = new Array(W * H).fill(null);
    for (let k = 0; k < W * H; k++) { const c = cells[k]; if (c) T[k] = toneOf(c.n, c.gloss, c.m === 'skin' ? 0.06 : c.m === 'hair' ? -0.14 : 0); }
    const at = (i, j) => (i < 0 || j < 0 || i >= W || j >= H) ? null : cells[j * W + i];
    // contact shadows: a cell just below or beside a nearer, different part is one tone darker
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const c = at(i, j); if (!c) continue;
      for (const [dx, dy] of [[0, -1], [1, 0], [-1, 0]]) { const o = at(i + dx, j + dy); if (o && o.m !== c.m && o.z < c.z - 0.05) { T[j * W + i] = Math.max(0, T[j * W + i] - 1); break; } } }
    for (let k = 0; k < W * H; k++) { const c = cells[k]; if (c) out[k] = rampFor(F, c.m)[T[k]]; }
    // the inner contour: where a nearer part meets a farther one, the nearer edge takes its shadow tone
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const c = at(i, j); if (!c) continue;
      for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0]]) { const o = at(i + dx, j + dy); if (o && o.m !== c.m && o.z > c.z + 0.05) { out[j * W + i] = rampFor(F, c.m)[Math.min(T[j * W + i], 1)]; break; } } }
    // the soft outline one cell inside the silhouette, in the part's own shadow colour (no dark outer ring)
    const edits = [];
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const c = at(i, j); if (!c) continue;
      const empty = (dx, dy) => !at(i + dx, j + dy), sh = empty(0, 1) || empty(1, 0), lit = empty(0, -1) || empty(-1, 0); if (!sh && !lit) continue;
      const r = rampFor(F, c.m), t = T[j * W + i]; edits.push([j * W + i, sh ? r[Math.max(0, Math.min(t - 1, 1))] : r[Math.max(0, Math.min(t - 1, 2))]]); }
    for (const [k, col] of edits) out[k] = col;
    return out;
  }

  /* ------------------------------------------------------------------ faces
     Stamped on the head's surface after the paint, as golfer3d's put() does: a feature lands only
     on a cell of skin (or the mask's cage) whose depth is the head's. Sizes follow the head's size
     in cells, so a face reads at every scale. */
  const EXPR = {
    neutral: { brow: 0, eye: 'open', mouth: 'flat' },
    focus: { brow: 1, eye: 'open', mouth: 'flat' },
    whiff: { brow: -1, eye: 'wide', mouth: 'o' },
    pleased: { brow: -1, eye: 'happy', mouth: 'smile' },
    thinking: { brow: 'one', eye: 'side', mouth: 'smirk' },
    wince: { brow: 1, eye: 'shut', mouth: 'grit' },
    yell: { brow: 1, eye: 'open', mouth: 'yell' },
  };
  function face(F, cam, cell, R, out) {
    const Sk = F.Sk, fh = Sk.fh, hr = F.hr, per = F.per, ex = EXPR[F.expr] || EXPR.neutral;
    const sc = cam.scaleAt(Sk.head) * hr / cell;           // the head's radius in cells
    const toCam = norm(sub(cam.pos, Sk.head));
    if (dot(fh[1], toCam) < -0.15) return;                  // seen from behind: no face
    const C = (P) => { const s = cam.project(P); return [Math.floor(s[0] / cell) - R.x0, Math.floor(s[1] / cell) - R.y0, s[2]]; };
    const onFace = (x, z, y) => sum(Sk.head, mul(fh[0], x * hr), mul(fh[1], (y == null ? Math.sqrt(Math.max(0.05, 1 - x * x - z * z)) * 0.95 : y) * hr), mul(fh[2], z * hr));
    const ok = (i, j, zz) => { if (i < 0 || j < 0 || i >= R.W || j >= R.H) return false; const c = R.cells[j * R.W + i];
      return c && (c.m === 'skin' || c.m === 'cage' || c.m === 'hair') && Math.abs(c.z - zz) < hr * 1.1; };
    const put = (i, j, zz, col) => { if (ok(i, j, zz)) out[j * R.W + i] = col; };
    const skinR = skinRamp(F.pal.skin), hairR = hairRamp(F.pal.hair);
    const DARK = '#1b1418', WHITE = '#f5efe4', BROW = hairR[0], MOUTH = mix(skinR[0], '#5a1f2a', 0.55), TEETH = '#f6f1e6';
    const big = sc >= 9, mid = sc >= 6.2;
    const ew = big ? 3 : 2, eh = big ? 3 : mid ? 2 : 1;
    // which way the face points on screen, for the pupils and the side of the head we see
    const fs = cam.project(add(Sk.head, mul(fh[1], hr))), hs = cam.project(Sk.head), look = Math.sign(fs[0] - hs[0]) || 1;
    const eyes = [];
    for (const s of [-1, 1]) {
      const P = onFace(s * 0.36, 0.08), nrm = norm(sub(P, Sk.head));
      if (dot(nrm, toCam) < 0.12) continue;
      const [ci, cj, zz] = C(P); eyes.push([ci, cj, zz, s]);
      const x0 = ci - (ew >> 1), y0 = cj - (eh >> 1);
      if (ex.eye === 'shut') { put(x0, y0 + 1, zz, DARK); put(x0 + 1, y0, zz, DARK); if (ew > 2) put(x0 + 2, y0 + 1, zz, DARK); continue; }
      if (ex.eye === 'happy') { put(x0, y0 + 1, zz, DARK); put(x0 + 1, y0, zz, DARK); if (ew > 2) put(x0 + 2, y0 + 1, zz, DARK); else put(x0 + 1, y0 + 1, zz, DARK); continue; }
      const hh = per.eyes === 'squint' && ex.eye !== 'wide' ? Math.max(1, eh - 1) : ex.eye === 'wide' ? eh + 1 : eh;
      const yy = y0 + (eh - hh);
      for (let a = 0; a < ew; a++) for (let b = 0; b < hh; b++) put(x0 + a, yy + b, zz, (hh > 1 && ew > 1) ? WHITE : DARK);
      if (hh > 1 && ew > 1) {
        // the pupil: toward where he looks (the face's side), a full column, with a glint on big heads
        const pcx = ex.eye === 'side' ? x0 + ew - 1 : look > 0 ? x0 + ew - 1 : x0;
        for (let b = (ex.eye === 'wide' ? 1 : 0); b < hh; b++) put(pcx, yy + b, zz, DARK);
        if (big && ew > 2) for (let b = 0; b < hh; b++) put(x0 + 1, yy + b, zz, b === 0 ? WHITE : DARK);
      }
    }
    // brows: three cells, the inner end lower when focused or wincing, higher when surprised
    const eyeMid = eyes.length ? eyes.reduce((a, e) => a + e[0], 0) / eyes.length : 0;
    for (const [ci, cj, zz, s] of eyes) {
      const by = cj - (eh >> 1) - (big ? 2 : 1) - (per.brows === 'arched' ? 1 : 0);
      const inner = ci < eyeMid || (eyes.length === 1 && look * 1 > 0) ? 1 : -1; // +1: the inner end is to the right
      const tilt = ex.brow === 'one' ? (s > 0 ? -1 : 0) : ex.brow;
      const bw = per.brows === 'bushy' || per.brows === 'thick' ? ew + 1 : ew;
      for (let a = 0; a < bw; a++) {
        const x = ci - (bw >> 1) + a, isInner = inner > 0 ? a === bw - 1 : a === 0;
        const yb = by + (isInner && tilt === 1 ? 1 : 0) - (isInner && tilt === -1 ? 1 : 0) - (ex.brow === 'one' && s > 0 && !isInner ? 1 : 0);
        put(x, yb, zz, BROW); if (per.brows === 'bushy' || per.brows === 'thick') put(x, yb - 1, zz, BROW);
      }
    }
    // eye black, under each eye
    if (per.eyeBlack) for (const [ci, cj, zz] of eyes) for (let a = -1; a < ew - 1; a++) put(ci + a, cj + (eh >> 1) + 1 + (big ? 1 : 0), zz, '#141216');
    // the mouth
    const MP = onFace(0, -0.5), mn = norm(sub(MP, Sk.head));
    if (dot(mn, toCam) > 0.05) {
      const [mi, mj, zz] = C(MP), mw = big ? 4 : 3, x0 = mi - (mw >> 1) + (look > 0 ? 1 : 0);
      const m = ex.mouth;
      if (m === 'flat') for (let a = 0; a < mw; a++) put(x0 + a, mj, zz, MOUTH);
      else if (m === 'smile') { put(x0 - 1, mj - 1, zz, MOUTH); for (let a = 0; a < mw; a++) put(x0 + a, mj, zz, MOUTH); put(x0 + mw, mj - 1, zz, MOUTH); if (big) for (let a = 1; a < mw - 1; a++) put(x0 + a, mj + 1, zz, TEETH); }
      else if (m === 'o') { for (let a = 0; a < 2; a++) for (let b = 0; b < (big ? 3 : 2); b++) put(mi + a - (look > 0 ? 0 : 1), mj + b, zz, MOUTH); }
      else if (m === 'grit') { for (let a = 0; a < mw + 1; a++) { put(x0 + a, mj, zz, TEETH); put(x0 + a, mj - 1, zz, MOUTH); put(x0 + a, mj + 1, zz, MOUTH); } }
      else if (m === 'smirk') { for (let a = 0; a < mw; a++) put(x0 + a, mj - (a === mw - 1 ? 1 : 0), zz, MOUTH); }
      else if (m === 'yell') { for (let a = 0; a < mw; a++) for (let b = 0; b < (big ? 3 : 2); b++) put(x0 + a, mj + b, zz, b === 0 ? TEETH : MOUTH); }
      // a moustache over it
      if (per.stache) for (let a = -1; a < mw + 1; a++) { put(x0 + a, mj - 1, zz, hairR[1]); if (big) put(x0 + a, mj - 2, zz, hairR[2]); }
    }
    // stubble: a speckle of the hair's shadow over the jaw
    if (per.stubble) for (let j = 0; j < R.H; j++) for (let i = 0; i < R.W; i++) { const c = R.cells[j * R.W + i]; if (!c || c.m !== 'skin') continue;
      const q = sub(c.p, Sk.head), up = dot(q, fh[2]) / hr, fw = dot(q, fh[1]) / hr; if (up < -0.35 && fw > 0.1 && ((i + j) & 1) === 0) out[j * R.W + i] = mix(out[j * R.W + i], hairR[1], 0.5); }
    // blush on a young face
    if (per.blush) for (const [ci, cj, zz, s] of eyes) put(ci + (s > 0 ? 1 : -1), cj + eh + 1, zz, mix(skinR[2], '#e0586a', 0.3));
    // the mask's cage over everything on the face: bars every other column and every third row
    if (F.masked) for (let j = 0; j < R.H; j++) for (let i = 0; i < R.W; i++) { const c = R.cells[j * R.W + i]; if (!c || c.m !== 'cage') continue;
      const bar = (i % 2 === 0) || (j % 3 === 0); if (bar) out[j * R.W + i] = ramp('#3a3d44')[c.n[0] < 0 ? 3 : 1]; else if (!out[j * R.W + i] || out[j * R.W + i] === ramp('#3a3d44')[T0(c)]) out[j * R.W + i] = skinR[1]; }
  }
  const T0 = (c) => toneOf(c.n, c.gloss, 0);

  /* ------------------------------------------------------------------ the sprite, cached */
  const CACHE = new Map(); let LAST_MS = 0;
  function sprite(F, cam, cell, key) {
    if (key && CACHE.has(key)) return CACHE.get(key);
    const t0 = performance.now();
    const R = raster(F, cam, cell), out = paint(F, R);
    // the cage shows the face behind it: under the bars, the gaps are the skin's shadow
    if (F.masked) for (let k = 0; k < out.length; k++) { const c = R.cells[k]; if (c && c.m === 'cage') out[k] = skinRamp(F.pal.skin)[1]; }
    face(F, cam, cell, R, out);
    const cv = document.createElement('canvas'); cv.width = R.W; cv.height = R.H; const g = cv.getContext('2d');
    for (let k = 0; k < out.length; k++) if (out[k]) { g.fillStyle = out[k]; g.fillRect(k % R.W, Math.floor(k / R.W), 1, 1); }
    const depth = new Float32Array(R.W * R.H).fill(1e9); for (let k = 0; k < out.length; k++) if (R.cells[k]) depth[k] = R.cells[k].z;
    const S = { cv, x0: R.x0, y0: R.y0, W: R.W, H: R.H, depth, ms: performance.now() - t0, cells: R.cells.filter(Boolean).length };
    LAST_MS = S.ms; if (key) CACHE.set(key, S); return S;
  }
  /* Composite sprites onto a low resolution canvas by depth, cell by cell (catcher over umpire). */
  function composite(g, sprites, W, H) {
    const zb = new Float32Array(W * H).fill(1e9), img = g.getImageData(0, 0, W, H), d = img.data;
    for (const S of sprites) {
      const sd = S.cv.getContext('2d').getImageData(0, 0, S.W, S.H).data;
      for (let j = 0; j < S.H; j++) for (let i = 0; i < S.W; i++) {
        const X = S.x0 + i, Y = S.y0 + j; if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
        const k = j * S.W + i; if (sd[k * 4 + 3] === 0) continue; const z = S.depth[k], K2 = Y * W + X;
        if (z >= zb[K2]) continue; zb[K2] = z; d[K2 * 4] = sd[k * 4]; d[K2 * 4 + 1] = sd[k * 4 + 1]; d[K2 * 4 + 2] = sd[k * 4 + 2]; d[K2 * 4 + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  }
  /* A soft ground shadow under a figure, in cells, before the sprites go on. */
  function groundShadow(g, cam, cell, p, rx, ry) {
    const s = cam.project(p), sc = cam.scaleAt(p) / cell; g.save(); g.fillStyle = 'rgba(30,20,10,0.28)';
    const cx = s[0] / cell, cy = s[1] / cell, a = rx * sc, b = Math.max(1, ry * sc * 0.35);
    for (let j = Math.floor(cy - b); j <= Math.ceil(cy + b); j++) for (let i = Math.floor(cx - a); i <= Math.ceil(cx + a); i++) if (((i + 0.5 - cx) / a) ** 2 + ((j + 0.5 - cy) / b) ** 2 <= 1) g.fillRect(i, j, 1, 1);
    g.restore();
  }

  window.STD_CH = { POSES, PEOPLE, TEAM, SKIN, HAIR, EXPR, build, mirrorX, catcherPose, camera, sprite, composite, groundShadow, ramp, skinRamp, mix, raster, paint, CACHE, last: () => LAST_MS, L };
})();
