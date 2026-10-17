/* Shut The Door design mockups: a small signed distance renderer for the park and the figures.

   MOCKUP CODE. Nothing in shut-the-door/design/ is loaded by the live game.

   The figures are posed 3D models (round cones, ellipsoids and rounded boxes, the body smoothly
   blended), ray marched per pixel and lit: a key light with soft shadows, a hemisphere fill,
   ambient occlusion, a rim light and a specular glint. The park is analytic (the ground plane
   painted by position, the backstop, the stands as a raked plane of seats). One render pass
   gives colour, depth, material and figure id per cell, and a finish turns that into the look:
     smooth  a lit render, tone mapped (the broadcast and the clean looks)
     pixel   per material five step colour ramps, ordered dither and a soft outline in the
             material's own shadow colour (Putt Putt's PXHD paint, on a finer, truer model)
   Units are feet. x is Statcast's plate_x (catcher's view: +x is the catcher's right, the first
   base side), y runs from the front of the plate toward the mound, z is up. The camera looks
   from behind the mound, so +x lands on the left of the screen: the pitcher's view mirror falls
   out of the projection with no special case.

   One global, STD3D. */
(function () {
  'use strict';

  /* ---------------------------------------------------------------- vectors */
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = (a) => Math.hypot(a[0], a[1], a[2]);
  const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const rot = (v, axis, ang) => {
    axis = norm(axis); const c = Math.cos(ang), s = Math.sin(ang);
    return add(add(mul(v, c), mul(cross(axis, v), s)), mul(axis, dot(axis, v) * (1 - c)));
  };
  const D2R = Math.PI / 180;
  const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  function hash2(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
  const toLin = (c) => c.map((x) => Math.pow(x, 2.2));

  /* ---------------------------------------------------------------- parts */
  // A part is one primitive: t 0 round cone, 1 ellipsoid, 2 rounded box. g 1 = in the smooth body group.
  function cone(a, b, r1, r2, m, o) {
    const ba = sub(b, a), l2 = Math.max(dot(ba, ba), 1e-6), rr = r1 - r2;
    const P = { t: 0, ax: a[0], ay: a[1], az: a[2], bx: ba[0], by: ba[1], bz: ba[2], l2, rr, a2: l2 - rr * rr, il2: 1 / l2, r1, r2, m, g: 1 };
    const c = lerp(a, b, 0.5); P.c = c; P.R = Math.sqrt(l2) / 2 + Math.max(r1, r2);
    return Object.assign(P, o || {});
  }
  function ell(c, ax, r, m, o) { // ax: three unit axes, r: three radii
    const P = { t: 1, cx: c[0], cy: c[1], cz: c[2], u: ax, r0: r[0], r1: r[1], r2: r[2], m, g: 1, c, R: Math.max(r[0], r[1], r[2]) };
    return Object.assign(P, o || {});
  }
  function box(c, ax, h, rad, m, o) {
    const P = { t: 2, cx: c[0], cy: c[1], cz: c[2], u: ax, h0: h[0], h1: h[1], h2: h[2], rad, m, g: 0, c, R: Math.hypot(h[0], h[1], h[2]) + rad };
    return Object.assign(P, o || {});
  }
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
      const a = (dx * u[0][0] + dy * u[0][1] + dz * u[0][2]) / P.r0;
      const b = (dx * u[1][0] + dy * u[1][1] + dz * u[1][2]) / P.r1;
      const c = (dx * u[2][0] + dy * u[2][1] + dz * u[2][2]) / P.r2;
      const k0 = Math.sqrt(a * a + b * b + c * c), k1 = Math.sqrt(a * a / (P.r0 * P.r0) + b * b / (P.r1 * P.r1) + c * c / (P.r2 * P.r2));
      d = k1 < 1e-9 ? -Math.min(P.r0, P.r1, P.r2) : k0 * (k0 - 1) / k1;
    } else {
      const dx = x - P.cx, dy = y - P.cy, dz = z - P.cz, u = P.u;
      const qa = Math.abs(dx * u[0][0] + dy * u[0][1] + dz * u[0][2]) - P.h0 + P.rad;
      const qb = Math.abs(dx * u[1][0] + dy * u[1][1] + dz * u[1][2]) - P.h1 + P.rad;
      const qc = Math.abs(dx * u[2][0] + dy * u[2][1] + dz * u[2][2]) - P.h2 + P.rad;
      const ma = Math.max(qa, 0), mb = Math.max(qb, 0), mc = Math.max(qc, 0);
      d = Math.sqrt(ma * ma + mb * mb + mc * mc) + Math.min(Math.max(qa, qb, qc), 0) - P.rad;
    }
    if (P.cut) { // keep the side of each plane where n.p - d0 <= 0
      for (const C of P.cut) { const s = x * C[0] + y * C[1] + z * C[2] - C[3]; if (s > d) d = s; }
    }
    if (P.shell) d = Math.abs(d) - P.shell;
    return d;
  }

  /* A figure: parts plus a bounding sphere. K is the body's blend radius. */
  function figure(parts, opts) {
    let c = [0, 0, 0]; for (const p of parts) c = add(c, p.c); c = mul(c, 1 / parts.length);
    let R = 0; for (const p of parts) R = Math.max(R, len(sub(p.c, c)) + p.R);
    return Object.assign({ parts, c, R: R + 0.05, K: 0.09, id: 0, alpha: 1 }, opts || {});
  }
  let MAT_OUT = 0;
  function evalFig(F, x, y, z) {
    let dB = 1e9, rawB = 1e9, mB = 0, dH = 1e9, mH = 0;
    const K = F.K, parts = F.parts;
    for (let i = 0; i < parts.length; i++) {
      const P = parts[i];
      const lb = Math.sqrt((x - P.c[0]) ** 2 + (y - P.c[1]) ** 2 + (z - P.c[2]) ** 2) - P.R;
      const best = dB < dH ? dB : dH;
      if (lb > best + K) continue;
      const d = evalPart(P, x, y, z);
      if (P.g) {
        if (d < rawB) { rawB = d; mB = P.m; }
        const h = Math.max(K - Math.abs(dB - d), 0) / K; dB = Math.min(dB, d) - h * h * K * 0.25;
      } else if (d < dH) { dH = d; mH = P.m; }
    }
    if (dB < dH) { MAT_OUT = mB; return dB; }
    MAT_OUT = mH; return dH;
  }
  function raySphere(o, d, c, R) {
    const ox = o[0] - c[0], oy = o[1] - c[1], oz = o[2] - c[2];
    const b = ox * d[0] + oy * d[1] + oz * d[2], cc = ox * ox + oy * oy + oz * oz - R * R, h = b * b - cc;
    if (h < 0) return null; const s = Math.sqrt(h); return [-b - s, -b + s];
  }

  /* ---------------------------------------------------------------- camera */
  function camera(pos, look, frameW, cssW, cssH, rollDeg) {
    const f = norm(sub(look, pos)); let r = norm(cross(f, [0, 0, 1])); let u = cross(r, f);
    if (rollDeg) { r = rot(r, f, rollDeg * D2R); u = rot(u, f, rollDeg * D2R); }
    const dist = len(sub(look, pos));
    const pxPerRad = cssW / (frameW / dist);       // a small angle camera: frameW feet across at the look point
    const fpx = pxPerRad;                          // focal length in css px
    return {
      pos, f, r, u, fpx, cssW, cssH, dist,
      ray(sx, sy) { const dx = (sx - cssW / 2) / fpx, dy = -(sy - cssH / 2) / fpx; return norm(add(f, add(mul(r, dx), mul(u, dy)))); },
      project(p) { const q = sub(p, pos), z = dot(q, f); return [cssW / 2 + dot(q, r) / z * fpx, cssH / 2 - dot(q, u) / z * fpx, z]; },
      scaleAt(p) { const z = dot(sub(p, pos), f); return fpx / z; },  // css px per foot at p
    };
  }

  /* ---------------------------------------------------------------- the park */
  // A look gives the light, the palette of the ground and stands, and the finish.
  function groundColor(L, x, y) {
    const G = L.ground;
    const py = y + 0.708;                       // the plate's centre
    const rPlate = Math.hypot(x, py);
    // home plate, the pentagon
    if (y <= 0 && y >= -1.417 && Math.abs(x) <= 0.708 && (y >= -0.708 || Math.abs(x) <= 0.708 - (-0.708 - y))) return [G.plate, 7];
    // the mound
    const rm = Math.hypot(x, y - 59);
    if (rm < 9) { if (Math.abs(y - 60.5) < 0.25 && Math.abs(x) < 1) return [G.chalk, 6]; return [shadeDirt(G.dirt, x, y, 1), 2]; }
    // chalk: batter's boxes (6in off the plate, 4ft wide, 6ft long), catcher's box, foul lines
    const lw = 0.17, boxY0 = -0.708 - 3, boxY1 = -0.708 + 3;
    for (const s of [-1, 1]) {
      const xi = s * (0.708 + 0.5), xo = s * (0.708 + 4.5);
      const inY = y > boxY0 - lw / 2 && y < boxY1 + lw / 2;
      const ax = Math.abs(x);
      if (inY && (Math.abs(ax - Math.abs(xi)) < lw / 2 || Math.abs(ax - Math.abs(xo)) < lw / 2) && Math.sign(x) === s) return [G.chalk, 6];
      if (Math.sign(x) === s && ax > Math.abs(xi) - lw / 2 && ax < Math.abs(xo) + lw / 2 && (Math.abs(y - boxY0) < lw / 2 || Math.abs(y - boxY1) < lw / 2)) return [G.chalk, 6];
    }
    if (y < boxY0 && y > boxY0 - 8 && Math.abs(Math.abs(x) - 1.79) < lw / 2) return [G.chalk, 6];
    if (Math.abs(y - (boxY0 - 8)) < lw / 2 && Math.abs(x) < 1.79) return [G.chalk, 6];
    // foul lines run out from the plate's back corners at 45 degrees
    if (y > -0.708 && Math.abs(Math.abs(x) - (y + 0.708)) < lw * 0.7 && Math.abs(x) > 4.7) return [G.chalk, 6];
    if (rPlate < 13) return [shadeDirt(G.dirt, x, y, 0), 2];
    if (y < -48) return [shadeDirt(G.track, x, y, 0), 2];
    // the cut-outs along the base lines
    const along = (y + 0.708 + Math.abs(x)) / Math.SQRT2, off = Math.abs((y + 0.708) - Math.abs(x)) / Math.SQRT2;
    if (y > -0.708 && along > 8 && off < 3.0) return [shadeDirt(G.dirt, x, y, 0), 2];
    // grass, mowed in stripes
    const band = Math.floor((x + y) / 7.5) + Math.floor((y - x) / 7.5);
    const n = vnoise(x * 1.7, y * 1.7) * 0.06 + vnoise(x * 9, y * 9) * 0.04;
    const k = (band & 1 ? G.stripe : 0) + n;
    return [mix3(G.grass, G.grass2, k), 1];
  }
  function shadeDirt(c, x, y, mound) {
    const n = vnoise(x * 2.2, y * 2.2) * 0.5 + vnoise(x * 11, y * 11) * 0.35 + hash2(Math.floor(x * 30), Math.floor(y * 30)) * 0.15;
    const k = 0.9 + n * 0.18 - (mound ? 0.03 : 0);
    return [c[0] * k, c[1] * k, c[2] * k];
  }
  // the mound: 10 inches high, a flat table round the rubber falling away to its edge 9 ft out
  function groundH(x, y) { const r = Math.hypot(x, y - 59); return r >= 9 ? 0 : 0.83 * smooth(9, 2.6, r); }
  const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  // The stands: a padded wall at y = WALL_Y, then rows raked up and back.
  const WALL_Y = -56, WALL_H = 3.4, ROW_D = 2.9, ROW_H = 1.45;
  function crowdColor(L, x, s, blur, seed) {
    // s: distance up the rake from the top of the wall, in feet along the slope's run
    const C = L.crowd;
    if (blur <= 0.01) return crowdSample(C, x, s);
    let acc = [0, 0, 0], n = 0;
    for (let i = 0; i < 16; i++) {
      const a = i * 2.39996 + seed, rr = blur * Math.sqrt((i + 0.5) / 16);
      const c = crowdSample(C, x + Math.cos(a) * rr, s + Math.sin(a) * rr * 0.6);
      acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]; n++;
    }
    return [acc[0] / n, acc[1] / n, acc[2] / n];
  }
  function crowdSample(C, x, s) {
    const row = Math.floor(s / ROW_D), fv = s / ROW_D - row;
    const sw = 1.75, off = (row & 1) * 0.5, seat = Math.floor(x / sw + off), fu = x / sw + off - seat;
    const h = hash2(seat, row), h2 = hash2(seat * 7 + 3, row * 13 + 1), h3 = hash2(seat + 91, row + 17);
    const tier = row * ROW_H;
    let base = C.seat;
    if (fv > 0.82) base = C.riser;                                     // the riser between rows
    else if (h < C.full) {
      // a fan: shirt in the lower part of the cell, the head above it
      const shirt = C.shirts[Math.floor(h2 * C.shirts.length)], skin = C.skins[Math.floor(h3 * C.skins.length)];
      const cx = fu - 0.5 + (h2 - 0.5) * 0.14, head = Math.hypot(cx * 1.0, (fv - 0.64) * 1.2);
      const sh = Math.abs(cx) - (0.27 + Math.min(0.08, (0.5 - fv) * 0.3));
      if (head < 0.16) base = (h3 > 0.82 ? C.capC : skin);
      else if (fv < 0.52 && fv > 0.0 && sh < 0 && !(fv > 0.44 && Math.abs(cx) > 0.2)) base = shirt;
      else base = C.seat;
      if (C.flash && h2 > 0.996 && head < 0.2) base = C.flash;
    }
    const fade = Math.min(1, tier / 70);
    return mix3(base, C.haze, fade * C.hazeK);
  }

  /* ---------------------------------------------------------------- render */
  function render(canvas, S) {
    const cssW = S.cssW, cssH = S.cssH, res = S.res || 1;
    const W = Math.max(1, Math.round(cssW * res)), H = Math.max(1, Math.round(cssH * res));
    const cam = S.cam, L = S.look, figs = S.figures || [];
    const col = new Float32Array(W * H * 3), alb = new Float32Array(W * H * 3), depth = new Float32Array(W * H), mat = new Int16Array(W * H), fid = new Int16Array(W * H), lev = new Float32Array(W * H);
    const KEY = norm(L.key), RIM = L.rim ? norm(L.rim) : null;
    const keyC = toLin(L.keyColor).map((v) => v * L.keyI), sky = toLin(L.sky).map((v) => v * L.ambI), gnd = toLin(L.groundBounce).map((v) => v * L.ambI);
    const rimC = L.rim ? toLin(L.rimColor).map((v) => v * L.rimI) : null;
    const MATS = S.mats, MLIST = S.matList;
    figs.forEach((F, i) => { F.id = i + 1; });
    const pixAng = 1 / (cam.fpx * res);

    const sceneD = (x, y, z, skip) => { let d = 1e9; for (const F of figs) { if (F === skip || F.noShadow) continue; const lb = Math.hypot(x - F.c[0], y - F.c[1], z - F.c[2]) - F.R; if (lb > d) continue; const e = lb > 0.6 ? lb : evalFig(F, x, y, z); if (e < d) d = e; } return d; };
    function softShadow(o, Ld, tmax, k) {
      let res0 = 1;
      for (const F of figs) {
        if (F.noShadow) continue;
        const hit = raySphere(o, Ld, F.c, F.R); if (!hit || hit[1] < 0) continue;
        let t = Math.max(0.03, hit[0]); const t1 = Math.min(hit[1], tmax);
        for (let i = 0; i < 40 && t < t1; i++) {
          const d = evalFig(F, o[0] + Ld[0] * t, o[1] + Ld[1] * t, o[2] + Ld[2] * t);
          if (d < 0.004) return 0;
          res0 = Math.min(res0, k * d / t); t += Math.max(d * 0.85, 0.02);
        }
      }
      return clamp(res0, 0, 1);
    }

    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const idx = j * W + i;
        const sx = (i + 0.5) / res, sy = (j + 0.5) / res;
        const d = cam.ray(sx, sy), o = cam.pos;
        // environment first: ground plane, wall, stands
        let tEnv = 1e9, envCol = null, envMat = -1, envLev = 0.5;
        if (d[2] < 0) {
          let tg = -o[2] / d[2];
          for (let it = 0; it < 5; it++) { const gx = o[0] + d[0] * tg, gy = o[1] + d[1] * tg; tg = (groundH(gx, gy) - o[2]) / d[2]; }
          const gy = o[1] + d[1] * tg;
          if (gy > WALL_Y) { tEnv = tg; }
        }
        const tw = (WALL_Y - o[1]) / d[1];
        if (tw > 0 && tw < tEnv) {
          const wz = o[2] + d[2] * tw;
          if (wz >= 0 && wz <= WALL_H) { tEnv = tw; envMat = -3; }
          else if (wz > WALL_H) {
            // the raked stands: z = WALL_H + (WALL_Y - y) * ROW_H / ROW_D
            const kk = ROW_H / ROW_D;
            const ts = (WALL_H + (WALL_Y - o[1]) * kk - o[2]) / (d[2] + d[1] * kk);
            if (ts > 0) { tEnv = ts; envMat = -2; }
          }
        }
        // figures
        let tHit = tEnv, hitF = null, hitM = 0;
        for (const F of figs) {
          const h = raySphere(o, d, F.c, F.R); if (!h || h[1] < 0 || h[0] > tHit) continue;
          let t = Math.max(h[0], 0); const t1 = Math.min(h[1], tHit);
          for (let s = 0; s < 110 && t < t1; s++) {
            const px = o[0] + d[0] * t, py = o[1] + d[1] * t, pz = o[2] + d[2] * t;
            const dd = evalFig(F, px, py, pz);
            if (dd < Math.max(0.0015, t * pixAng * 0.35)) { if (t < tHit) { tHit = t; hitF = F; hitM = MAT_OUT; } break; }
            t += dd * 0.8;
          }
        }
        let c, m = -1, lv = 0.5;
        if (!hitF && S.transparent) { fid[idx] = 0; depth[idx] = 1e9; mat[idx] = -99; col[idx * 3] = col[idx * 3 + 1] = col[idx * 3 + 2] = 0; continue; }
        if (hitF) {
          const p = [o[0] + d[0] * tHit, o[1] + d[1] * tHit, o[2] + d[2] * tHit];
          const e = 0.0025, F = hitF;
          const n = norm([
            evalFig(F, p[0] + e, p[1] - e, p[2] - e) * 1 + evalFig(F, p[0] - e, p[1] - e, p[2] + e) * -1 + evalFig(F, p[0] - e, p[1] + e, p[2] - e) * -1 + evalFig(F, p[0] + e, p[1] + e, p[2] + e),
            evalFig(F, p[0] + e, p[1] - e, p[2] - e) * -1 + evalFig(F, p[0] - e, p[1] - e, p[2] + e) * -1 + evalFig(F, p[0] - e, p[1] + e, p[2] - e) * 1 + evalFig(F, p[0] + e, p[1] + e, p[2] + e),
            evalFig(F, p[0] + e, p[1] - e, p[2] - e) * -1 + evalFig(F, p[0] - e, p[1] - e, p[2] + e) * 1 + evalFig(F, p[0] - e, p[1] + e, p[2] - e) * -1 + evalFig(F, p[0] + e, p[1] + e, p[2] + e),
          ]);
          evalFig(F, p[0], p[1], p[2]); m = hitM;
          const M = MLIST[m] || MLIST[0];
          let base = M.lin;
          if (M.pattern) base = M.pattern(p, n, base);
          // ambient occlusion from the whole scene
          let ao = 0, w = 1;
          for (let k = 1; k <= 4; k++) { const h = 0.05 * k * k; const q = add(p, mul(n, h)); ao += (h - Math.min(h, sceneD(q[0], q[1], q[2], null))) * w; w *= 0.62; }
          ao = clamp(1 - ao * 2.2, 0.25, 1);
          const nl = dot(n, KEY), wrap = clamp((nl + L.wrap) / (1 + L.wrap), 0, 1);
          const sh0 = nl > -0.2 ? softShadow(add(p, mul(n, 0.02)), KEY, 14, L.shadowK) : 0, sh = (L.shadowFloor || 0) + (1 - (L.shadowFloor || 0)) * sh0;
          const hemi = n[2] * 0.5 + 0.5;
          const amb = [gnd[0] + (sky[0] - gnd[0]) * hemi, gnd[1] + (sky[1] - gnd[1]) * hemi, gnd[2] + (sky[2] - gnd[2]) * hemi];
          const vdir = mul(d, -1);
          const hv = norm(add(KEY, vdir)), spec = Math.pow(Math.max(dot(n, hv), 0), M.shin || 24) * (M.spec || 0.04) * sh;
          const fres = Math.pow(1 - Math.max(dot(n, vdir), 0), 3);
          let rim = 0; if (RIM) rim = Math.max(dot(n, RIM), 0) * (0.35 + fres * 1.6);
          const direct = wrap * sh;
          c = [
            base[0] * (amb[0] * ao + keyC[0] * direct) + spec * keyC[0] + (rimC ? rimC[0] * rim * (0.4 + base[0]) : 0),
            base[1] * (amb[1] * ao + keyC[1] * direct) + spec * keyC[1] + (rimC ? rimC[1] * rim * (0.4 + base[1]) : 0),
            base[2] * (amb[2] * ao + keyC[2] * direct) + spec * keyC[2] + (rimC ? rimC[2] * rim * (0.4 + base[2]) : 0),
          ];
          lv = clamp(0.12 + 0.5 * ao * hemi + 0.75 * direct + 0.25 * rim * (L.rimLev || 1), 0, 1.4);
          if (F.alpha < 1 || F.tint) {
            // a faint figure: blend over what is behind (computed cheaply as the environment colour)
            c._fade = F.alpha;
          }
          fid[idx] = F.id; depth[idx] = tHit; mat[idx] = m; lev[idx] = lv; alb[idx * 3] = base[0]; alb[idx * 3 + 1] = base[1]; alb[idx * 3 + 2] = base[2];
        } else {
          fid[idx] = 0; depth[idx] = tEnv;
          const p = [o[0] + d[0] * tEnv, o[1] + d[1] * tEnv, o[2] + d[2] * tEnv];
          if (envMat === -2) {
            const sUp = (WALL_Y - p[1]) * Math.hypot(1, ROW_H / ROW_D);
            const blur = L.dof ? L.dof * (tEnv - cam.dist) / cam.dist : 0;
            c = toLin(crowdColor(L, p[0], sUp, blur, hash2(i, j) * 6.283));
            c = mul(c, L.crowd.light);
            m = -2; lv = 0.4;
          } else if (envMat === -3) {
            const wc = toLin(L.wall); const seam = Math.abs(((p[0] / 8) % 1 + 1) % 1 - 0.5) > 0.485 ? 0.75 : 1;
            const top = p[2] > WALL_H - 0.25 ? 1.6 : 1;
            const blur = L.dof ? L.dof * (tEnv - cam.dist) / cam.dist : 0;
            c = mul(wc, L.wallLight * seam * top * (1 - Math.min(0.3, blur * 0.05)));
            if (L.wallBand && p[2] > 1.6 && p[2] < 3.3) c = mul(toLin(L.wallBand), L.wallLight * (blur > 0.2 ? 0.9 : 1));
            m = -3; lv = 0.4;
          } else if (tEnv < 1e8) {
            const gc = groundColor(L, p[0], p[1]);
            let gcol = toLin(gc[0]);
            // figure shadows and contact darkening on the ground
            let sh = 1;
            for (const F of figs) {
              if (F.noShadow) continue;
              const h = raySphere(p, KEY, F.c, F.R); if (!h || h[1] < 0) continue;
              sh = Math.min(sh, (L.shadowFloor || 0) * 0.6 + (1 - (L.shadowFloor || 0) * 0.6) * softShadow(add(p, [0, 0, 0.01]), KEY, 30, L.shadowK));
              break;
            }
            let near = 1;
            for (const F of figs) { if (F.noShadow) continue; const lb = Math.hypot(p[0] - F.c[0], p[1] - F.c[1], p[2] - F.c[2]) - F.R; if (lb < 0.5) { const dd = evalFig(F, p[0], p[1], p[2] + 0.05); near = Math.min(near, 0.55 + 0.45 * smooth(0.0, 0.7, dd)); } }
            const nl = Math.max(KEY[2], 0);
            const lit = L.groundAmb + L.groundKey * nl * sh;
            c = [gcol[0] * (lit * keyC[0] / L.keyI * 1 + 0) * near, gcol[1] * (lit * keyC[1] / L.keyI) * near, gcol[2] * (lit * keyC[2] / L.keyI) * near];
            if (L.groundTint) c = mix3(c, toLin(L.groundTint), L.groundTintK);
            // a pool of light round the plate under the night lights
            if (L.pool) { const r = Math.hypot(p[0] - L.pool[0], p[1] - L.pool[1]); const k = 1 + L.pool[3] * Math.exp(-(r * r) / (L.pool[2] * L.pool[2])); c = mul(c, k); }
            m = -1 - gc[1] * 0; mat[idx] = -10 - gc[1]; lv = clamp(0.3 + 0.6 * sh * near, 0, 1);
            depth[idx] = tEnv;
          } else {
            c = toLin(L.skyTop); m = -4; lv = 0.5;
          }
          if (m !== undefined && mat[idx] === 0) mat[idx] = m;
          lev[idx] = lv;
        }
        col[idx * 3] = c[0]; col[idx * 3 + 1] = c[1]; col[idx * 3 + 2] = c[2];
      }
    }
    const out = { W, H, col, alb, depth, mat, fid, lev, cam, res };
    finish(canvas, S, out);
    return out;
  }

  /* ---------------------------------------------------------------- finishes */
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);
  function tone(c, L) {
    const e = L.exposure || 1; let r = c[0] * e, g = c[1] * e, b = c[2] * e;
    if (L.aces) { const f = (x) => clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0, 1); r = f(r); g = f(g); b = f(b); }
    else { r = r / (1 + r * 0.15); g = g / (1 + g * 0.15); b = b / (1 + b * 0.15); }
    r = Math.pow(clamp(r, 0, 1), 1 / 2.2); g = Math.pow(clamp(g, 0, 1), 1 / 2.2); b = Math.pow(clamp(b, 0, 1), 1 / 2.2);
    if (L.sat !== undefined) { const y = 0.3 * r + 0.59 * g + 0.11 * b; r = y + (r - y) * L.sat; g = y + (g - y) * L.sat; b = y + (b - y) * L.sat; }
    if (L.grade) { r = r * L.grade[0]; g = g * L.grade[1]; b = b * L.grade[2]; }
    if (L.lift) { r = L.lift[0] + r * (1 - L.lift[0]); g = L.lift[1] + g * (1 - L.lift[1]); b = L.lift[2] + b * (1 - L.lift[2]); }
    return [clamp(r, 0, 1), clamp(g, 0, 1), clamp(b, 0, 1)];
  }
  function finish(canvas, S, R) {
    const { W, H, col, alb, fid, depth, lev, mat } = R, L = S.look, Fn = L.finish || {};
    const img = new ImageData(W, H), px = img.data;
    const MLIST = S.matList;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const idx = j * W + i;
      let c;
      if (Fn.type === 'toon' && fid[idx]) {
        // banded light on the albedo: shadow, mid, lit, and a highlight
        const lv = lev[idx], a = [alb[idx * 3], alb[idx * 3 + 1], alb[idx * 3 + 2]];
        const k = lv < Fn.b0 ? Fn.k0 : lv < Fn.b1 ? Fn.k1 : lv < Fn.b2 ? Fn.k2 : Fn.k3;
        const tint = lv < Fn.b0 ? Fn.shadowTint : [1, 1, 1];
        c = tone([a[0] * k * tint[0], a[1] * k * tint[1], a[2] * k * tint[2]], L);
      } else c = tone([col[idx * 3], col[idx * 3 + 1], col[idx * 3 + 2]], L);
      if (Fn.type === 'toon') {
        const f = fid[idx];
        let ink = 0;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]) {
          const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
          const k2 = jj * W + ii;
          if (f && (fid[k2] !== f ? depth[k2] > depth[idx] : depth[k2] - depth[idx] > 0.35)) ink = Math.max(ink, 1);
          else if (f && fid[k2] === f && mat[k2] !== mat[idx] && mat[k2] > mat[idx]) ink = Math.max(ink, Fn.inner || 0.5);
        }
        if (ink) { const ic = Fn.ink; c = [c[0] + (ic[0] - c[0]) * ink, c[1] + (ic[1] - c[1]) * ink, c[2] + (ic[2] - c[2]) * ink]; }
      }
      if (Fn.type === 'pixel') {
        // quantize each channel to the ramp, dithered: a palette look without a fixed palette
        const q = Fn.levels || 6, th = BAYER[(j & 3) * 4 + (i & 3)] * (Fn.dither || 0.9);
        c = c.map((v) => clamp(Math.round(v * q + th) / q, 0, 1));
        // the outline: a figure cell next to the background or a nearer figure takes its own shadow colour
        const f = fid[idx];
        if (f) {
          let edge = false;
          for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
            const k = jj * W + ii;
            if (fid[k] !== f || depth[k] - depth[idx] > 0.9) { if (!(fid[k] === f) && depth[k] < depth[idx]) continue; edge = true; break; }
          }
          if (edge) { const M = MLIST[mat[idx]] || MLIST[0]; const o = M.outline || [0.12, 0.1, 0.14]; c = [c[0] * 0.35 + o[0] * 0.65, c[1] * 0.35 + o[1] * 0.65, c[2] * 0.35 + o[2] * 0.65]; }
        }
      }
      if (L.vignette) { const dx = (i / W - 0.5), dy = (j / H - 0.5); const v = 1 - L.vignette * (dx * dx + dy * dy) * 2.2; c = c.map((x) => x * v); }
      if (L.grain) { const g = (hash2(i * 3 + 1, j * 5 + 7) - 0.5) * L.grain; c = c.map((x) => x + g); }
      px[idx * 4] = c[0] * 255; px[idx * 4 + 1] = c[1] * 255; px[idx * 4 + 2] = c[2] * 255; px[idx * 4 + 3] = (S.transparent && !fid[idx]) ? 0 : 255;
    }
    const dpr = S.dpr || window.devicePixelRatio || 1;
    canvas.width = Math.round(S.cssW * dpr); canvas.height = Math.round(S.cssH * dpr);
    canvas.style.width = S.cssW + 'px'; canvas.style.height = S.cssH + 'px';
    const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H; tmp.getContext('2d').putImageData(img, 0, 0);
    const g = canvas.getContext('2d');
    g.imageSmoothingEnabled = Fn.type !== 'pixel'; g.imageSmoothingQuality = 'high';
    g.drawImage(tmp, 0, 0, canvas.width, canvas.height);
    if (L.bloom) {
      // a cheap bloom: the bright parts, blurred and added
      const b = document.createElement('canvas'); b.width = Math.ceil(W / 2); b.height = Math.ceil(H / 2);
      const bg = b.getContext('2d'); bg.filter = `brightness(${L.bloom.gain || 1}) contrast(${L.bloom.contrast || 3}) blur(${L.bloom.blur || 4}px)`;
      bg.drawImage(tmp, 0, 0, b.width, b.height);
      g.save(); g.globalCompositeOperation = 'screen'; g.globalAlpha = L.bloom.alpha || 0.25; g.drawImage(b, 0, 0, canvas.width, canvas.height); g.restore();
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* ---------------------------------------------------------------- materials */
  function materials(defs) {
    // defs: name -> {c:'#hex', spec, shin, outline:'#hex', pattern}
    const list = [], idx = {};
    for (const k of Object.keys(defs)) {
      const d = defs[k], c = hex(d.c);
      const o = d.outline ? hex(d.outline) : [c[0] * 0.3, c[1] * 0.28, c[2] * 0.36];
      idx[k] = list.length; list.push({ name: k, lin: toLin(c), spec: d.spec, shin: d.shin, outline: o, pattern: d.pattern });
    }
    return { list, idx };
  }

  /* ---------------------------------------------------------------- the pitch */
  // Flight from a release point to a plate point (y = 0) under gravity plus the pitch's own
  // movement. pfx is inches of break over the flight in the catcher's view (as Statcast reports
  // it, against a spinless ball), so the spin acceleration is 2 * pfx / T^2.
  function pitchPath(rel, plate, velo, pfxX, pfxZ, n) {
    const ft = 1.4667 * velo * 0.92, dist = rel[1] - 1.417 / 2 * 0;
    const T = rel[1] / ft;
    const ax = 2 * (pfxX / 12) / (T * T), az = 2 * (pfxZ / 12) / (T * T) - 32.17;
    const vx = (plate[0] - rel[0] - 0.5 * ax * T * T) / T, vz = (plate[2] - rel[2] - 0.5 * az * T * T) / T, vy = -rel[1] / T;
    const pts = [], spinless = [];
    for (let k = 0; k <= n; k++) {
      const t = T * k / n;
      pts.push([rel[0] + vx * t + 0.5 * ax * t * t, rel[1] + vy * t, rel[2] + vz * t + 0.5 * az * t * t]);
      spinless.push([rel[0] + vx * t, rel[1] + vy * t, rel[2] + vz * t - 0.5 * 32.17 * t * t]);
    }
    return { pts, spinless, T };
  }

  window.STD3D = { add, sub, mul, dot, cross, len, norm, lerp, rot, D2R, cone, ell, box, figure, camera, render, materials, pitchPath, hex, clamp, vnoise, hash2, evalFig, WALL_Y };
})();
