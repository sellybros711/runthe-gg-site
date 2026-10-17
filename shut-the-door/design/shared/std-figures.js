/* Shut The Door design mockups: the posed figures. MOCKUP CODE, never loaded by the game.

   A figure is built from a pose in its own frame (x to his right, y the way he faces, z up, feet)
   by two bone IK for the arms and legs, and dressed by kind: a batter with helmet and bat, a
   catcher in his gear and crouch, an umpire, the pitcher seen from behind, and the pitching coach.
   Proportions are a 6 foot 2 player's. Generic uniforms in team colours: no logos, no numbers,
   no likenesses. One global, STD_FIG. */
(function () {
  'use strict';
  const T = window.STD3D;
  const { add, sub, mul, dot, cross, norm, lerp, rot, D2R, cone, ell, box, figure } = T;

  function ik(a, t, l1, l2, pole) {
    let d = sub(t, a); let dl = Math.hypot(d[0], d[1], d[2]);
    const max = (l1 + l2) * 0.999; if (dl > max) { t = add(a, mul(d, max / dl)); d = sub(t, a); dl = max; }
    const dir = mul(d, 1 / dl), x = (l1 * l1 - l2 * l2 + dl * dl) / (2 * dl), h = Math.sqrt(Math.max(l1 * l1 - x * x, 0));
    let pp = sub(pole, mul(dir, dot(pole, dir))); pp = norm(pp);
    return [add(add(a, mul(dir, x)), mul(pp, h)), t];
  }
  // a frame from yaw (about up, + turns to his left), pitch (+ leans forward), roll (+ tips to his right)
  function frame(base, yaw, pitch, roll) {
    let [r, f, u] = base;
    if (yaw) { r = rot(r, u, yaw * D2R); f = rot(f, u, yaw * D2R); }
    if (pitch) { f = rot(f, r, -pitch * D2R); u = rot(u, r, -pitch * D2R); }
    if (roll) { r = rot(r, f, roll * D2R); u = rot(u, f, roll * D2R); }
    return [r, f, u];
  }

  /* Build the skeleton in world space. P is the pose (local feet), W the placement {pos, fwd}. */
  function skeleton(P, W) {
    const F = norm([W.fwd[0], W.fwd[1], 0]), R = [F[1], -F[0], 0], U = [0, 0, 1];
    const at = (l) => add(W.pos, add(add(mul(R, l[0]), mul(F, l[1])), mul(U, l[2])));
    const vec = (l) => add(add(mul(R, l[0]), mul(F, l[1])), mul(U, l[2]));
    const S = P.scale || 1;
    const pel = at(P.pelvis);
    const fp = frame([R, F, U], P.hipYaw || 0, P.hipPitch || 0, P.hipRoll || 0);
    const ft = frame(fp, P.torsoYaw || 0, P.torsoPitch || 0, P.torsoRoll || 0);
    const fh = frame(ft, P.headYaw || 0, P.headPitch || 0, P.headRoll || 0);
    const up = (fr, k) => mul(fr[2], k * S), rt = (fr, k) => mul(fr[0], k * S), fw = (fr, k) => mul(fr[1], k * S);
    const chest = add(add(pel, up(ft, 1.18)), fw(ft, 0.04));
    const neck = add(pel, up(ft, 1.86));
    const shL = add(add(add(pel, up(ft, 1.62)), rt(ft, -0.66)), fw(ft, -0.02)), shR = add(add(add(pel, up(ft, 1.62)), rt(ft, 0.66)), fw(ft, -0.02));
    const head = add(add(neck, up(fh, 0.5)), fw(fh, 0.06));
    const hipL = add(add(pel, rt(fp, -0.34)), up(fp, -0.16)), hipR = add(add(pel, rt(fp, 0.34)), up(fp, -0.16));
    const knPole = (s) => P.kneePole ? norm(vec(P.kneePole[s])) : F;
    const [knL, anL] = ik(hipL, at(P.footL), 1.55 * S, 1.48 * S, knPole(0));
    const [knR, anR] = ik(hipR, at(P.footR), 1.55 * S, 1.48 * S, knPole(1));
    const elPole = (s) => P.elbowPole ? norm(vec(P.elbowPole[s])) : mul(U, -1);
    const [elL, wrL] = ik(shL, at(P.handL), 1.05 * S, 0.98 * S, elPole(0));
    const [elR, wrR] = ik(shR, at(P.handR), 1.05 * S, 0.98 * S, elPole(1));
    const toeDir = (s) => norm(vec(P.toe ? P.toe[s] : [0, 1, 0]));
    return { pel, chest, neck, head, shL, shR, hipL, hipR, knL, knR, anL, anR, elL, elR, wrL, wrR, fp, ft, fh, F, R, U, at, vec, toeL: toeDir(0), toeR: toeDir(1), S };
  }

  /* The body: skin, uniform regions and shoes, blended into one surface. K: kit material names. */
  function body(B, K, o) {
    o = o || {};
    const S = B.S, parts = [], ax = (fr) => [fr[0], fr[1], fr[2]];
    // torso
    parts.push(ell(add(B.pel, mul(B.fp[2], 0.02)), ax(B.fp), [0.6 * S, 0.43 * S, 0.44 * S], K.pants));
    parts.push(ell(add(add(B.pel, mul(B.fp[1], -0.16 * S)), mul(B.fp[2], -0.12 * S)), ax(B.fp), [0.56 * S, 0.36 * S, 0.36 * S], K.pants));
    parts.push(ell(add(B.pel, mul(B.ft[2], 0.62 * S)), ax(B.ft), [0.52 * S, 0.37 * S, 0.44 * S], K.jersey));
    parts.push(ell(add(B.chest, mul(B.ft[1], 0.03)), ax(B.ft), [0.7 * S, 0.43 * S, 0.5 * S], K.jersey));
    // the belt, a thin band at the waist
    if (K.belt) parts.push(ell(add(B.pel, mul(B.ft[2], 0.28 * S)), ax(B.ft), [0.55 * S, 0.41 * S, 0.07 * S], K.belt, { g: 0 }));
    // the trapezius, from the neck out to the shoulders
    parts.push(ell(add(add(B.pel, mul(B.ft[2], 1.66 * S)), mul(B.ft[1], -0.06 * S)), ax(B.ft), [0.52 * S, 0.27 * S, 0.2 * S], K.jersey));
    // neck and head
    parts.push(cone(B.neck, add(B.head, mul(B.fh[2], -0.25)), 0.19 * S, 0.17 * S, K.skin));
    parts.push(ell(B.head, ax(B.fh), [0.29 * S, 0.33 * S, 0.37 * S], K.skin));
    parts.push(ell(add(add(B.head, mul(B.fh[1], 0.13 * S)), mul(B.fh[2], -0.19 * S)), ax(B.fh), [K.stache ? 0.25 * S : 0.22 * S, 0.21 * S, 0.2 * S], K.skin)); // jaw
    parts.push(ell(add(add(B.head, mul(B.fh[1], 0.31 * S)), mul(B.fh[2], -0.05 * S)), ax(B.fh), [0.045 * S, 0.06 * S, 0.09 * S], K.skin)); // nose
    for (const s of [-1, 1]) parts.push(ell(add(add(B.head, mul(B.fh[0], s * 0.28 * S)), mul(B.fh[1], -0.02)), ax(B.fh), [0.05 * S, 0.08 * S, 0.11 * S], K.skin));
    if (K.beard) parts.push(ell(add(add(B.head, mul(B.fh[1], 0.17 * S)), mul(B.fh[2], -0.2 * S)), ax(B.fh), [0.225 * S, 0.2 * S, 0.19 * S], K.beard, { g: 0 }));
    if (K.stache) parts.push(ell(add(add(B.head, mul(B.fh[1], 0.3 * S)), mul(B.fh[2], -0.175 * S)), ax(B.fh), [0.16 * S, 0.075 * S, 0.05 * S], K.stache, { g: 0 }));
    if (K.hairSide) parts.push(ell(add(add(B.head, mul(B.fh[1], -0.06 * S)), mul(B.fh[2], -0.02 * S)), ax(B.fh), [0.305 * S, 0.3 * S, 0.24 * S], K.hairSide, { g: 0, cut: [[...B.fh[1], dot(B.fh[1], add(B.head, mul(B.fh[1], 0.12 * S)))]] }));
    if (K.eye) for (const s2 of [-1, 1]) {
      // the eyes under the brow, and the brow
      parts.push(ell(add(add(add(B.head, mul(B.fh[1], 0.255 * S)), mul(B.fh[2], 0.03 * S)), mul(B.fh[0], s2 * 0.115 * S)), ax(B.fh), [0.06 * S, 0.04 * S, 0.042 * S], K.eye, { g: 0 }));
      parts.push(ell(add(add(add(B.head, mul(B.fh[1], 0.27 * S)), mul(B.fh[2], 0.11 * S)), mul(B.fh[0], s2 * 0.12 * S)), ax(B.fh), [0.08 * S, 0.035 * S, 0.022 * S], K.brow || K.stache || K.eye, { g: 0 }));
    }
    // arms: shoulder cap, the sleeve to mid upper arm, then the undershirt or skin
    for (const s of ['L', 'R']) {
      const sh = B['sh' + s], el = B['el' + s], wr = B['wr' + s];
      parts.push(ell(add(sh, mul(B.ft[2], -0.04 * S)), ax(B.ft), [0.23 * S, 0.23 * S, 0.22 * S], K.jersey));
      const mid = lerp(sh, el, o.shortSleeve ? 0.45 : 0.62);
      parts.push(cone(sh, mid, 0.22 * S, 0.19 * S, K.jersey));
      parts.push(cone(mid, el, 0.17 * S, 0.145 * S, K.sleeve || K.jersey));
      parts.push(cone(el, wr, 0.15 * S, 0.105 * S, K.forearm || K.sleeve || K.skin));
    }
    // legs: pants to the calf, then socks, then shoes
    for (const s of ['L', 'R']) {
      const hp = B['hip' + s], kn = B['kn' + s], an = B['an' + s], toe = s === 'L' ? B.toeL : B.toeR;
      parts.push(cone(hp, kn, 0.33 * S, 0.21 * S, K.pants));
      const calf = lerp(kn, an, K.socksHigh ? 0.3 : 0.86);
      parts.push(cone(kn, calf, 0.2 * S, K.socksHigh ? 0.19 * S : 0.15 * S, K.pants));
      parts.push(cone(calf, an, K.socksHigh ? 0.17 * S : 0.15 * S, 0.12 * S, K.socks || K.pants));
      // a calf muscle under the cloth
      parts.push(ell(add(lerp(kn, an, 0.32), mul(toe, -0.06)), [norm(cross(toe, [0, 0, 1])), toe, [0, 0, 1]], [0.17 * S, 0.17 * S, 0.33 * S], K.socksHigh ? K.socks : K.pants));
      const fc = add(add(an, mul(toe, 0.3 * S)), [0, 0, -0.14 * S]);
      const fr = norm(cross(toe, [0, 0, 1]));
      parts.push(ell(add(fc, [0, 0, 0.02]), [fr, toe, [0, 0, 1]], [0.15 * S, 0.43 * S, 0.12 * S], K.shoe, { g: 0 }));
    }
    return parts;
  }
  function hand(B, s, K, kind, dirOverride) {
    const S = B.S, wr = B['wr' + s], el = B['el' + s];
    const d = dirOverride ? norm(dirOverride) : norm(sub(wr, el));
    const side = norm(cross(d, [0, 0, 1]));
    const up = norm(cross(side, d));
    const c = add(wr, mul(d, 0.2 * S));
    return ell(c, [side, d, up], [0.09 * S, 0.2 * S, 0.14 * S], kind || K.skin);
  }

  /* headgear */
  function helmet(B, K, flapSide) {
    const S = B.S, fh = B.fh, h = B.head, ax = [fh[0], fh[1], fh[2]];
    const parts = [];
    const c = add(h, mul(fh[2], 0.07 * S));
    parts.push(ell(c, ax, [0.36 * S, 0.41 * S, 0.37 * S], K.helmet, { g: 0, cut: [planeBelow(c, fh[2], -0.05 * S, fh[1], 0.25)] }));
    // the brim, out over the eyes
    parts.push(ell(add(add(c, mul(fh[1], 0.36 * S)), mul(fh[2], 0.02 * S)), ax, [0.3 * S, 0.17 * S, 0.035 * S], K.helmet, { g: 0 }));
    if (flapSide) parts.push(ell(add(add(c, mul(fh[0], flapSide * 0.29 * S)), mul(fh[2], -0.2 * S)), ax, [0.1 * S, 0.24 * S, 0.22 * S], K.helmet, { g: 0 }));
    return parts;
  }
  function planeBelow(c, up, off, fwd, tilt) {
    // a plane through c + up*off, normal -up tilted so the cut rises toward the back
    const n = norm(add(mul(up, -1), mul(fwd, tilt || 0)));
    const p0 = add(c, mul(up, off));
    return [n[0], n[1], n[2], dot(n, p0)];
  }
  function cap(B, K) {
    const S = B.S, fh = B.fh, h = B.head, ax = [fh[0], fh[1], fh[2]];
    const c = add(h, mul(fh[2], 0.1 * S));
    return [
      ell(c, ax, [0.315 * S, 0.355 * S, 0.33 * S], K.cap, { g: 0, cut: [planeBelow(c, fh[2], -0.02 * S, fh[1], 0.15)] }),
      ell(add(add(c, mul(fh[1], 0.36 * S)), mul(fh[2], -0.01 * S)), [fh[0], norm(add(fh[1], mul(fh[2], -0.25))), fh[2]], [0.25 * S, 0.24 * S, 0.03 * S], K.capBill || K.cap, { g: 0 }),
    ];
  }
  function catcherHelmet(B, K) {
    const S = B.S, fh = B.fh, h = B.head, ax = [fh[0], fh[1], fh[2]];
    const c = add(h, mul(fh[1], 0.02 * S));
    return [
      ell(add(c, mul(fh[2], 0.04 * S)), ax, [0.39 * S, 0.43 * S, 0.43 * S], K.gear, { g: 0, cut: [[...mul(fh[1], 1), dot(fh[1], add(c, mul(fh[1], 0.2 * S)))]] }),
      ell(add(c, mul(fh[1], 0.12 * S)), ax, [0.36 * S, 0.38 * S, 0.45 * S], K.cage, { g: 0 }),
      ell(add(add(c, mul(fh[1], 0.2 * S)), mul(fh[2], -0.48 * S)), ax, [0.17 * S, 0.06 * S, 0.17 * S], K.cage, { g: 0 }), // the throat guard
    ];
  }
  function bat(grip, dir, K, S) {
    dir = norm(dir); S = S || 1;
    const knob = add(grip, mul(dir, -0.16 * S)), end = add(knob, mul(dir, 2.85 * S));
    return [
      ell(knob, [norm(cross(dir, [0, 0, 1])), dir, norm(cross(cross(dir, [0, 0, 1]), dir))], [0.075 * S, 0.03 * S, 0.075 * S], K.bat, { g: 0 }),
      cone(knob, add(knob, mul(dir, 1.25 * S)), 0.045 * S, 0.05 * S, K.bat, { g: 0 }),
      cone(add(knob, mul(dir, 1.25 * S)), add(knob, mul(dir, 2.1 * S)), 0.05 * S, 0.105 * S, K.bat, { g: 0 }),
      cone(add(knob, mul(dir, 2.1 * S)), end, 0.105 * S, 0.11 * S, K.bat, { g: 0 }),
    ];
  }

  /* ------------------------------------------------------------- the people */
  // Every pose is in the figure's own frame: x to his right, y where he faces, z up.
  const POSES = {
    // a left handed batter: he faces the plate (his y), his right shoulder at the pitcher (his +x)
    batStance: {
      pelvis: [-0.1, -0.2, 2.72], hipYaw: -8, hipPitch: 12, torsoYaw: -14, torsoPitch: 14, torsoRoll: -3, headYaw: 68, headPitch: 6, headRoll: 6,
      footR: [1.15, 0.15, 0.28], footL: [-1.45, -0.05, 0.28], toe: [[0.25, 1, 0], [-0.1, 1, 0]], kneePole: [[-0.4, 1, 0], [0.5, 1, 0]],
      handL: [-0.62, 0.55, 4.5], handR: [-0.5, 0.62, 4.58], elbowPole: [[-0.6, 0.2, -1], [0.4, 0.3, -1]],
      bat: { grip: [-0.6, 0.6, 4.45], dir: [-0.42, -0.35, 0.84] },
    },
    batStride: {
      pelvis: [-0.25, -0.22, 2.62], hipYaw: -14, hipPitch: 14, torsoYaw: -22, torsoPitch: 15, torsoRoll: -5, headYaw: 72, headPitch: 6, headRoll: 8,
      footR: [1.75, 0.2, 0.3], footL: [-1.5, -0.05, 0.28], toe: [[0.35, 1, 0], [-0.1, 1, 0]], kneePole: [[-0.3, 1, 0], [0.6, 1, 0.1]],
      handL: [-0.92, 0.42, 4.55], handR: [-0.8, 0.5, 4.62], elbowPole: [[-0.6, 0.1, -1], [0.3, 0.3, -1]],
      bat: { grip: [-0.9, 0.46, 4.5], dir: [-0.22, -0.55, 0.81] },
    },
    batSwing: {
      pelvis: [0.15, -0.15, 2.55], hipYaw: 52, hipPitch: 12, torsoYaw: 52, torsoPitch: 20, torsoRoll: -14, headYaw: -18, headPitch: 22, headRoll: 0,
      footR: [1.8, 0.25, 0.3], footL: [-1.35, 0.05, 0.36], toe: [[0.6, 1, 0], [0.2, 1, 0.35]], kneePole: [[0.1, 1, 0], [1, 1, 0]],
      handL: [0.85, 1.55, 3.05], handR: [0.95, 1.45, 3.2], elbowPole: [[0, -0.2, -1], [0.3, -0.5, -1]],
      bat: { grip: [0.9, 1.5, 3.1], dir: [0.98, 0.6, -0.05] },
    },
    // the catcher in his crouch, mitt up as the target
    crouch: {
      pelvis: [0, -0.35, 1.45], hipPitch: 6, torsoPitch: 18, headPitch: -12,
      footL: [-0.95, -0.1, 0.28], footR: [0.95, -0.1, 0.28], toe: [[-0.45, 1, 0], [0.45, 1, 0]], kneePole: [[-0.6, 1, 0.3], [0.6, 1, 0.3]],
      handL: [-0.25, 1.35, 2.35], handR: [0.55, 0.35, 1.7], elbowPole: [[-1, -0.2, -0.6], [1, -0.3, -0.5]],
    },
    // the umpire behind him, in the slot, hands braced
    ump: {
      pelvis: [0, -0.5, 2.6], hipPitch: 24, torsoPitch: 30, headPitch: -28,
      footL: [-1.15, -0.2, 0.28], footR: [1.15, -0.05, 0.28], toe: [[-0.4, 1, 0], [0.4, 1, 0]], kneePole: [[-0.6, 1, 0], [0.6, 1, 0]],
      handL: [-0.62, 0.6, 2.25], handR: [0.62, 0.65, 2.25], elbowPole: [[-1, -0.4, 0], [1, -0.4, 0]],
    },
    // the pitcher, seen from behind: his y faces the plate
    set: {
      pelvis: [0, 0, 3.15], torsoPitch: 4, headPitch: 4, headYaw: 0,
      footL: [-0.45, 0.2, 0.28], footR: [0.45, -0.1, 0.28], toe: [[-0.1, 1, 0], [0.4, 1, 0]],
      handL: [-0.1, 0.55, 4.45], handR: [0.1, 0.55, 4.4], elbowPole: [[-1, 0, -0.6], [1, 0, -0.6]],
    },
    release: {
      pelvis: [-0.3, 2.0, 2.45], hipYaw: 30, hipPitch: 12, torsoYaw: 18, torsoPitch: 30, torsoRoll: -16, headPitch: -18, headYaw: -10,
      footL: [-0.5, 4.7, -0.05], footR: [0.4, 0.4, 0.5], toe: [[0.1, 1, 0], [0.9, 0.2, -0.5]], kneePole: [[0, 1, 0], [0.4, 1, 0.3]],
      handL: [-0.35, 2.55, 4.15], handR: [0.8, 3.95, 5.75], elbowPole: [[-1, -0.3, -0.6], [1, -0.2, -0.3]],
    },
    follow: {
      pelvis: [-0.3, 2.9, 2.4], hipYaw: 48, hipPitch: 26, torsoYaw: 36, torsoPitch: 52, torsoRoll: -10, headPitch: -40, headYaw: -18,
      footL: [-0.5, 4.7, -0.05], footR: [0.2, 1.6, 0.9], toe: [[0.1, 1, 0], [0.6, 0.2, -0.8]], kneePole: [[0, 1, 0], [0.4, 0.6, 0.6]],
      handL: [-0.9, 2.9, 3.0], handR: [-1.1, 4.5, 2.4], elbowPole: [[-1, -0.3, -0.3], [0.2, 0.2, -1]],
    },
    // the coach, a bust leaning on the rail
    coach: {
      pelvis: [0, 0, 3.05], torsoPitch: 2, torsoYaw: 8, headYaw: -10, headPitch: -9, headRoll: 3, scale: 1.0,
      footL: [-0.5, 0, 0.28], footR: [0.5, 0, 0.28],
      handL: [0.42, 0.62, 4.12], handR: [-0.4, 0.66, 4.26], elbowPole: [[-1, 0.2, -0.7], [1, 0.2, -0.7]],
    },
  };
  function blend(a, b, t) { // pose interpolation, number by number
    const o = {};
    for (const k of Object.keys(a)) {
      const x = a[k], y = b[k];
      if (typeof x === 'number') o[k] = x + ((y === undefined ? x : y) - x) * t;
      else if (Array.isArray(x)) o[k] = blendArr(x, y || x, t);
      else if (x && typeof x === 'object') o[k] = blend(x, y || x, t);
      else o[k] = x;
    }
    for (const k of Object.keys(b)) if (!(k in o)) o[k] = typeof b[k] === 'number' ? b[k] * t : b[k];
    return o;
  }
  function blendArr(a, b, t) { return a.map((v, i) => Array.isArray(v) ? blendArr(v, b[i], t) : v + (b[i] - v) * t); }

  function build(kind, kit, place, pose) {
    const P = typeof pose === 'string' ? POSES[pose] : pose;
    const B = skeleton(P, place), K = kit, parts = [];
    if (kind === 'batter') {
      parts.push(...body(B, K));
      parts.push(...helmet(B, K, K.flap || 1));
      if (P.bat) {
        const grip = B.at(P.bat.grip), dir = B.vec(P.bat.dir);
        parts.push(...bat(grip, dir, K, B.S));
        parts.push(hand(B, 'L', K, K.glove, dir), hand(B, 'R', K, K.glove, dir));
      }
    } else if (kind === 'catcher') {
      parts.push(...body(B, K));
      parts.push(...catcherHelmet(B, K));
      // chest protector: a domed plate over the chest and belly
      { const pc = add(add(B.chest, mul(B.ft[1], 0.33)), mul(B.ft[2], -0.16));
        parts.push(ell(pc, [B.ft[0], B.ft[1], B.ft[2]], [0.5, 0.11, 0.66], K.gear, { g: 0, cut: [[...B.ft[1].map((v) => -v), -dot(B.ft[1], pc)]] }));
        parts.push(ell(add(pc, mul(B.ft[2], 0.5)), [B.ft[0], B.ft[1], B.ft[2]], [0.3, 0.2, 0.14], K.gear, { g: 0 })); }
      // shin guards, knee to instep, with a knee cup
      for (const s of ['L', 'R']) {
        const kn = B['kn' + s], an = B['an' + s], toe = s === 'L' ? B.toeL : B.toeR;
        const sd = norm(sub(an, kn)), fwd = norm(sub(toe, mul(sd, dot(toe, sd))));
        parts.push(cone(add(kn, mul(fwd, 0.06)), add(an, mul(fwd, 0.12)), 0.22, 0.16, K.gear, { g: 0 }));
        parts.push(ell(add(kn, mul(fwd, 0.1)), [norm(cross(sd, fwd)), fwd, mul(sd, -1)], [0.2, 0.14, 0.22], K.gear, { g: 0 }));
      }
      // the mitt, open to the pitcher
      const wl = B.wrL, md = norm(add(B.F, [0, 0, 0.25]));
      parts.push(ell(add(add(wl, mul(md, 0.08)), [0, 0, 0.24]), [B.R, md, norm(cross(B.R, md))], [0.42, 0.13, 0.45], K.mitt, { g: 0 }));
      parts.push(ell(add(add(wl, mul(md, 0.19)), [0, 0, 0.22]), [B.R, md, norm(cross(B.R, md))], [0.25, 0.04, 0.27], K.mittIn || K.mitt, { g: 0 }));
      parts.push(hand(B, 'R', K, K.skin));
    } else if (kind === 'ump') {
      parts.push(...body(B, K));
      parts.push(...catcherHelmet(B, Object.assign({}, K, { gear: K.mask })));
      parts.push(ell(add(B.chest, mul(B.ft[1], 0.18)), [B.ft[0], B.ft[1], B.ft[2]], [0.74, 0.45, 0.64], K.jersey)); // protector under the shirt
      parts.push(hand(B, 'L', K, K.skin), hand(B, 'R', K, K.skin));
    } else if (kind === 'pitcher') {
      parts.push(...body(B, K));
      parts.push(...cap(B, K));
      parts.push(ell(add(add(B.head, mul(B.fh[1], -0.06)), mul(B.fh[2], -0.06)), [B.fh[0], B.fh[1], B.fh[2]], [0.285, 0.3, 0.27], K.hair || K.cap, { g: 0, cut: [[...B.fh[1], dot(B.fh[1], add(B.head, mul(B.fh[1], 0.02)))]] }));
      // the glove on his left hand
      const wl = B.wrL, gd = norm(sub(wl, B.elL));
      parts.push(ell(add(wl, mul(gd, 0.24)), [norm(cross(gd, [0, 0, 1])), gd, norm(cross(cross(gd, [0, 0, 1]), gd))], [0.24, 0.36, 0.16], K.glove, { g: 0 }));
      parts.push(hand(B, 'R', K, K.skin));
    } else if (kind === 'coach') {
      parts.push(...body(B, K));
      parts.push(...cap(B, K));
      parts.push(hand(B, 'L', K, K.skin), hand(B, 'R', K, K.skin));
      if (K.board && 0) parts.push(T.box(add(add(B.pel, mul(B.F, 1.1)), [0, 0, 0.95]), [B.R, norm(add(B.F, [0, 0, 0.9])), norm(cross(B.R, norm(add(B.F, [0, 0, 0.9]))))], [0.6, 0.03, 0.8], 0.03, K.board, { g: 0 }));
    }
    return figure(parts, { kind, B });
  }

  // The ball's world position in the pitcher's hand, for the release frame.
  function handPos(fig, s) { return fig.B['wr' + (s || 'R')]; }

  window.STD_FIG = { POSES, build, blend, handPos, skeleton };
})();
