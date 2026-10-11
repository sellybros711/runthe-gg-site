/* MythiBall 3D prototype: the animations.

   A pose is a handful of numbers (see Character.apply in rig.js) and a clip
   is a list of poses on a clock. Sampling runs a Catmull-Rom curve through
   the keys, so a swing passes THROUGH its contact pose on an arc instead of
   cornering at it, which is most of what makes a keyed swing read as a swing.

   Everything is authored for a RIGHT-handed character in its own frame:
   it faces +z, its left is +x. A batter stands with +z toward the plate and
   +x toward the pitcher, so his front (left) shoulder points at the mound.
   A lefty is the same clip through mirror(). */

export const STAND = {
  p: [0, 0.97, 0], pr: [0, 0, 0], cr: [0.04, 0, 0], hr: [0, 0, 0],
  lh: [0.42, -1.55, 0.12], rh: [-0.42, -1.55, 0.12],
  lf: [0.32, 0, 0], rf: [-0.32, 0, 0], lfy: 0, rfy: 0, lfp: 0, rfp: 0,
};

const VEC = ['p', 'pr', 'cr', 'hr', 'lh', 'rh', 'lf', 'rf'];
const NUM = ['lfy', 'rfy', 'lfp', 'rfp'];

function full(k, prev) { const o = Object.assign({}, prev || STAND, k); if (k.bat) o.bat = { g: k.bat.g, d: k.bat.d }; else if (!('bat' in k) && prev && prev.bat) o.bat = prev.bat; return o; }

export function clip(keys, opts = {}) {
  const out = []; let prev = null;
  for (const k of keys) { const f = full(k, prev); f.t = k.t; out.push(f); prev = f; }
  return Object.assign({ keys: out, dur: out[out.length - 1].t }, opts);
}

const cr = (a, b, c, d, t) => { const t2 = t * t, t3 = t2 * t; return 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3); };
function lerpArr(A, B, C, Dd, t, curve) { return A.map((_, i) => curve ? cr(A[i], B[i], C[i], Dd[i], t) : B[i] + (C[i] - B[i]) * t); }

export function sample(c, time) {
  const K = c.keys; let t = c.loop ? ((time % c.dur) + c.dur) % c.dur : Math.max(0, Math.min(c.dur, time));
  let i = 0; while (i < K.length - 2 && K[i + 1].t <= t) i++;
  const B = K[i], C = K[Math.min(i + 1, K.length - 1)];
  const A = K[Math.max(0, i - 1)], Dd = K[Math.min(i + 2, K.length - 1)];
  let u = C.t > B.t ? (t - B.t) / (C.t - B.t) : 1; u = Math.max(0, Math.min(1, u));
  if (C.ease === 'in') u = u * u; else if (C.ease === 'out') u = 1 - (1 - u) * (1 - u); else if (C.ease === 'snap') u = u * u * u;
  const P = { glove: C.glove != null ? (u < 0.5 ? B.glove : C.glove) : B.glove, prop: B.prop, bunt: B.bunt || C.bunt, showBat: B.showBat };
  const curve = c.curve !== false;
  for (const k of VEC) P[k] = lerpArr(A[k], B[k], C[k], Dd[k], u, curve);
  for (const k of NUM) P[k] = B[k] + (C[k] - B[k]) * u;
  if (B.bat && C.bat) {
    const g = lerpArr(A.bat ? A.bat.g : B.bat.g, B.bat.g, C.bat.g, Dd.bat ? Dd.bat.g : C.bat.g, u, curve);
    const d = lerpArr(B.bat.d, B.bat.d, C.bat.d, C.bat.d, u, false);
    P.bat = { g, d };
  }
  return P;
}

export function blend(P, Q, w) {
  if (w <= 0) return P; if (w >= 1) return Q;
  const R = Object.assign({}, Q);
  for (const k of VEC) R[k] = P[k].map((v, i) => v + (Q[k][i] - v) * w);
  for (const k of NUM) R[k] = P[k] + (Q[k] - P[k]) * w;
  if (P.bat && Q.bat) R.bat = { g: P.bat.g.map((v, i) => v + (Q.bat.g[i] - v) * w), d: P.bat.d.map((v, i) => v + (Q.bat.d[i] - v) * w) };
  return R;
}

export function mirror(P) {
  const fx = (a) => [-a[0], a[1], a[2]], fr = (a) => [a[0], -a[1], -a[2]];
  const R = Object.assign({}, P);
  R.p = fx(P.p); R.pr = fr(P.pr); R.cr = fr(P.cr); R.hr = fr(P.hr);
  R.lh = fx(P.rh); R.rh = fx(P.lh); R.lf = fx(P.rf); R.rf = fx(P.lf);
  R.lfy = -P.rfy; R.rfy = -P.lfy; R.lfp = P.rfp; R.rfp = P.lfp;
  if (P.bat) R.bat = { g: fx(P.bat.g), d: fx(P.bat.d) };
  return R;
}

/* ------------------------------------------------------------ batting */
const B0 = { g: [-0.55, 3.75, -0.12], d: [-0.42, 0.82, -0.38] };
export const STANCE = { p: [0, 0.88, 0], pr: [0.12, -0.25, 0], cr: [0.12, -0.15, 0], hr: [0.15, 1.55, 0.08], lf: [1.05, 0, 0.1], rf: [-1.0, 0, -0.05], bat: B0 };

export const STANCE_IDLE = clip([
  Object.assign({ t: 0 }, STANCE),
  Object.assign({ t: 0.7 }, STANCE, { bat: { g: [-0.58, 3.82, -0.16], d: [-0.36, 0.84, -0.42] }, p: [0, 0.875, 0] }),
  Object.assign({ t: 1.4 }, STANCE),
], { loop: true });

/* Stride: the front foot lifts as the pitcher releases and comes down as the
   ball is halfway, which is when a real hitter's weight is loaded. */
export const STRIDE = clip([
  Object.assign({ t: 0 }, STANCE),
  Object.assign({ t: 0.35 }, STANCE, { p: [-0.18, 0.9, 0], pr: [0.12, -0.5, 0], cr: [0.12, -0.25, 0], hr: [0.15, 1.85, 0.08], lf: [0.75, 0.38, 0.12], bat: { g: [-0.82, 3.88, -0.32], d: [-0.22, 0.76, -0.62] } }),
  Object.assign({ t: 0.7 }, STANCE, { p: [0.12, 0.85, 0], pr: [0.14, -0.42, 0], cr: [0.12, -0.28, 0], hr: [0.15, 1.8, 0.08], lf: [1.55, 0, 0.18], bat: { g: [-0.78, 3.72, -0.3], d: [-0.22, 0.78, -0.6] } }),
]);
export const LOADED = sample(STRIDE, 99);

/* contact at t = 0.11. dy moves the swing plane up or down to the aim, so the
   bat really goes where the player put it. */
export const CONTACT_T = 0.11;
export function swingClip(dy = 0) {
  const L = LOADED, s = (y) => y + dy;
  return clip([
    Object.assign({ t: 0 }, L),
    Object.assign({ t: 0.055, ease: 'in' }, L, { p: [0.2, 0.84, 0], pr: [0.18, 0.4, 0], cr: [0.15, -0.05, 0], hr: [0.15, 1.2, 0.05], bat: { g: [-0.3, s(3.1), 0.25], d: [-0.35, 0.12 - dy * 0.15, -0.93] }, rfp: 0.2 }),
    Object.assign({ t: CONTACT_T, ease: 'snap' }, L, { p: [0.25, 0.84, 0], pr: [0.15, 1.05, -0.05], cr: [0.15, 0.22, 0.1], hr: [0.2, 0.3, 0.05], bat: { g: [0.45, s(2.85), 0.95], d: [-0.05, -0.06 - dy * 0.12, 1] }, rfy: 0.9, rfp: 0.5, rf: [-0.95, 0.12, -0.05] }),
    Object.assign({ t: 0.17, ease: 'out' }, L, { p: [0.25, 0.86, 0], pr: [0.12, 1.4, -0.05], cr: [0.08, 0.38, 0.1], hr: [0.15, -0.1, 0], bat: { g: [1.05, s(3.1), 0.6], d: [0.85, 0.15, 0.5] }, rfy: 1.3, rfp: 0.6, rf: [-0.9, 0.18, 0] }),
    Object.assign({ t: 0.32 }, L, { p: [0.25, 0.92, 0], pr: [0.05, 1.55, 0], cr: [0, 0.5, 0], hr: [0.1, -0.15, 0], bat: { g: [0.35, 4.3, -0.4], d: [-0.6, -0.45, -0.66] }, rfy: 1.5, rfp: 0.7, rf: [-0.85, 0.2, 0] }),
    Object.assign({ t: 0.75 }, L, { p: [0.25, 0.94, 0], pr: [0.05, 1.5, 0], cr: [0, 0.45, 0], hr: [0.1, -0.1, 0], bat: { g: [0.3, 4.2, -0.4], d: [-0.62, -0.42, -0.66] }, rfy: 1.5, rfp: 0.6, rf: [-0.85, 0.15, 0] }),
  ]);
}
export const BUNT = clip([
  Object.assign({ t: 0 }, STANCE),
  Object.assign({ t: 0.25, ease: 'out' }, STANCE, { p: [0.1, 0.8, 0], pr: [0.22, 1.3, 0], cr: [0.12, 0.15, 0], hr: [0.2, 0.05, 0], lf: [0.45, 0, 0.55], rf: [0.2, 0, -0.55], lfy: 1.4, rfy: 1.4, bunt: true, bat: { g: [0.95, 3.05, -0.35], d: [0.02, 0.12, 1] } }),
  Object.assign({ t: 1.2 }, STANCE, { p: [0.1, 0.8, 0], pr: [0.22, 1.3, 0], cr: [0.12, 0.15, 0], hr: [0.2, 0.05, 0], lf: [0.45, 0, 0.55], rf: [0.2, 0, -0.55], lfy: 1.4, rfy: 1.4, bunt: true, bat: { g: [0.95, 3.0, -0.35], d: [0.02, 0.14, 1] } }),
]);

/* ------------------------------------------------------------ pitching */
/* The arm slot is the tell. Same timing for every pitch; the curveball comes
   from higher, the slider from lower and wider, the changeup looks like the
   fastball (that is what a changeup is for). */
export const SLOTS = { fb: [0, 0], ch: [0, 0], cu: [0.35, 0.18], sl: [-0.75, -0.55] };
export const RELEASE_T = 0.86;
export function pitchClip(type = 'fb') {
  const [hy, hx] = SLOTS[type] || SLOTS.fb;
  const SET = { p: [0, 0.96, 0], pr: [0, 0, 0], cr: [0.08, 0, 0], hr: [0, 0, 0], lh: [0.12, -0.75, 0.55], rh: [-0.06, -0.75, 0.55], glove: true, lf: [0.35, 0, 0], rf: [-0.35, 0, 0] };
  return clip([
    Object.assign({ t: 0 }, SET),
    Object.assign({ t: 0.22 }, SET, { lh: [0.12, -0.3, 0.6], rh: [-0.05, -0.3, 0.6], p: [0, 0.98, -0.1] }),
    Object.assign({ t: 0.5, ease: 'out' }, SET, { p: [0, 1.0, 0], pr: [0, -1.35, 0], cr: [-0.05, -0.05, 0], hr: [0, 1.25, 0], lh: [0.1, -0.55, 0.5], rh: [-0.02, -0.55, 0.5], lf: [-0.25, 1.45, 0.4], lfp: 0.6, rf: [0, 0, 0], rfy: -1.35, lfy: -0.8 }),
    Object.assign({ t: 0.68 }, SET, { p: [0, 0.84, 1.0], pr: [0.08, -1.15, 0], cr: [0.02, -0.3, 0], hr: [0, 1.4, 0], lh: [1.15, 0.1, 0.2], rh: [-1.1, -0.15 + hy * 0.4, -0.15], lf: [0.15, 0, 2.6], lfy: -0.2, rf: [0, 0, 0], rfy: -1.35 }),
    Object.assign({ t: 0.78 }, SET, { p: [0, 0.8, 1.6], pr: [0.15, -0.45, 0], cr: [0.12, -0.4, 0], hr: [0, 0.85, 0], lh: [0.75, -0.2, 0.55], rh: [-0.7 + hx, 0.95 + hy, -0.4], lf: [0.15, 0, 2.6], lfy: -0.2, rf: [-0.05, 0.1, 0.1], rfy: -1.1, rfp: 0.4 }),
    Object.assign({ t: RELEASE_T, ease: 'snap' }, SET, { p: [0, 0.78, 2.0], pr: [0.32, 0.1, 0], cr: [0.45, 0.12, 0], hr: [-0.4, -0.15, 0], lh: [0.45, -0.45, 0.35], rh: [-0.35 + hx, 1.05 + hy, 0.75], lf: [0.15, 0, 2.6], lfy: -0.1, rf: [-0.2, 0.3, 0.6], rfy: -0.6, rfp: 0.8 }),
    Object.assign({ t: 1.02, ease: 'out' }, SET, { p: [0.05, 0.72, 2.3], pr: [0.55, 0.35, 0], cr: [0.6, 0.35, 0], hr: [-0.75, -0.3, 0], lh: [0.5, -0.6, 0.15], rh: [0.55, -1.25, 0.55], lf: [0.15, 0, 2.6], rf: [-0.4, 0.95, -0.4], rfp: 1.2 }),
    Object.assign({ t: 1.45 }, SET, { p: [0, 0.86, 2.2], pr: [0.25, 0, 0], cr: [0.2, 0, 0], hr: [-0.15, 0, 0], lh: [0.42, -0.95, 0.75], rh: [-0.42, -1.0, 0.65], lf: [0.85, 0, 2.3], rf: [-0.85, 0, 2.1], lfy: 0, rfy: 0 }),
  ]);
}

/* ------------------------------------------------------------ fielding */
export const READY = Object.assign({}, STAND, { p: [0, 0.78, 0], pr: [0.5, 0, 0], cr: [0.25, 0, 0], hr: [-0.55, 0, 0], lf: [0.85, 0, 0], rf: [-0.85, 0, 0], lfy: -0.2, rfy: 0.2, lh: [0.38, -1.2, 0.85], rh: [-0.38, -1.25, 0.8], glove: true });
export const READY_CLIP = clip([Object.assign({ t: 0 }, READY), Object.assign({ t: 0.6 }, READY, { p: [0, 0.76, 0.05] }), Object.assign({ t: 1.2 }, READY)], { loop: true });
export const CATCHER = Object.assign({}, STAND, { p: [0, 0.48, 0], pr: [0.2, 0, 0], cr: [0.15, 0, 0], hr: [-0.2, 0, 0], lf: [1.0, 0, 0.35], rf: [-1.0, 0, 0.35], lfy: -0.5, rfy: 0.5, lh: [0.3, -0.6, 1.0], rh: [-0.45, -1.1, 0.4], glove: true });

export function runPose(phase, speed) {
  const s = Math.max(0.2, Math.min(1.3, speed)), st = 1.15 * s, lift = 0.75 * s, sn = Math.sin(phase), cs = Math.cos(phase);
  const foot = (ph) => [0, Math.max(0, Math.cos(ph)) ** 1.3 * lift, Math.sin(ph) * st];
  const lf = foot(phase), rf = foot(phase + Math.PI); lf[0] = 0.28; rf[0] = -0.28;
  const sw = 0.55 * s;
  return Object.assign({}, STAND, {
    p: [0, 0.9 - 0.05 * Math.abs(Math.cos(2 * phase)) * s, 0], pr: [0.12 + 0.18 * s, -0.18 * sn, 0], cr: [0.08 + 0.1 * s, 0.32 * sn, 0], hr: [-0.15 * s, -0.2 * sn, 0],
    lh: [0.5, -0.95 + 0.25 * Math.max(0, -sn), -sw * sn + 0.15], rh: [-0.5, -0.95 + 0.25 * Math.max(0, sn), sw * sn + 0.15],
    lf, rf, lfp: -0.6 * Math.max(0, cs) + 0.3 * Math.max(0, -sn), rfp: -0.6 * Math.max(0, -cs) + 0.3 * Math.max(0, sn),
  });
}

export function throwClip() {
  const R = READY;
  return clip([
    Object.assign({ t: 0 }, R, { p: [0, 0.85, 0], pr: [0.2, 0, 0], cr: [0.1, 0, 0], hr: [0, 0, 0] }),
    Object.assign({ t: 0.16, ease: 'out' }, R, { p: [0, 0.86, -0.3], pr: [0.1, -1.2, 0], cr: [0.05, -0.3, 0], hr: [0, 1.3, 0], lh: [1.0, 0.15, 0.25], rh: [-0.75, 0.75, -0.45], lf: [0.2, 0.3, 1.2], rf: [-0.2, 0, -0.4], rfy: -1.2 }),
    Object.assign({ t: 0.3, ease: 'snap' }, R, { p: [0, 0.8, 0.7], pr: [0.35, 0.15, 0], cr: [0.4, 0.15, 0], hr: [-0.35, -0.1, 0], lh: [0.45, -0.4, 0.3], rh: [-0.35, 0.95, 0.8], lf: [0.2, 0, 1.5], rf: [-0.3, 0.3, 0.2], rfp: 0.7 }),
    Object.assign({ t: 0.5, ease: 'out' }, R, { p: [0, 0.78, 1.0], pr: [0.45, 0.3, 0], cr: [0.45, 0.3, 0], hr: [-0.5, -0.2, 0], lh: [0.45, -0.6, 0.2], rh: [0.45, -1.15, 0.5], lf: [0.2, 0, 1.5], rf: [-0.4, 0.75, -0.3], rfp: 1.1 }),
    Object.assign({ t: 0.9 }, R, { p: [0, 0.9, 1.0], pr: [0.15, 0, 0], cr: [0.1, 0, 0], hr: [0, 0, 0], lf: [0.6, 0, 1.2], rf: [-0.6, 0, 1.0] }),
  ]);
}
export const THROW_RELEASE = 0.3;

export function diveClip(side = 1) {
  const D0 = Object.assign({}, READY, { p: [0, 0.78, 0] });
  const out = Object.assign({}, READY, { p: [side * 1.6, 0.42, 0.4], pr: [0.6, 0, -side * 1.15], cr: [0.1, 0, -side * 0.2], hr: [-0.3, 0, side * 0.6], lh: [side * 1.15, 0.55, 0.35], rh: [-side * 0.2, 0.3, 0.6], lf: [side * 0.3, 0.55, -0.6], rf: [-side * 0.5, 0.15, -0.3] });
  const land = Object.assign({}, out, { p: [side * 2.4, 0.18, 0.6], pr: [1.35, 0, -side * 1.3], hr: [-0.6, 0, side * 0.5], lf: [side * 0.6, 0.25, -1.4], rf: [-side * 0.2, 0.15, -1.1] });
  return clip([Object.assign({ t: 0 }, D0), Object.assign({ t: 0.18, ease: 'out' }, out), Object.assign({ t: 0.4, ease: 'in' }, land), Object.assign({ t: 1.2 }, land)]);
}

export const SLIDE = clip([
  Object.assign({ t: 0 }, runPose(0, 1)),
  Object.assign({ t: 0.18, ease: 'out' }, STAND, { p: [0, 0.32, 0], pr: [-1.0, 0, 0], cr: [-0.25, 0, 0], hr: [0.6, 0, 0], lf: [0.15, 0.05, 1.75], rf: [-0.3, 0, 0.55], lfp: -0.6, rfp: 0.3, lh: [0.6, 0.35, 0.25], rh: [-0.6, 0.35, 0.25] }),
  Object.assign({ t: 0.8 }, STAND, { p: [0, 0.3, 0], pr: [-1.05, 0, 0], cr: [-0.25, 0, 0], hr: [0.6, 0, 0], lf: [0.15, 0.05, 1.75], rf: [-0.3, 0, 0.55], lfp: -0.6, rfp: 0.3, lh: [0.6, 0.4, 0.2], rh: [-0.6, 0.4, 0.2] }),
]);

/* ------------------------------------------------------------ moments */
export const CHEER = clip([
  Object.assign({ t: 0 }, STAND, { lh: [0.65, 0.6, 0.15], rh: [-0.65, 0.6, 0.15], p: [0, 0.92, 0], hr: [-0.25, 0, 0] }),
  Object.assign({ t: 0.22, ease: 'out' }, STAND, { lh: [0.55, 1.15, 0.05], rh: [-0.55, 1.15, 0.05], p: [0, 1.12, 0], lf: [0.3, 0.6, -0.2], rf: [-0.3, 0.55, -0.25], lfp: 0.5, rfp: 0.5, hr: [-0.4, 0, 0], cr: [-0.1, 0, 0] }),
  Object.assign({ t: 0.44, ease: 'in' }, STAND, { lh: [0.65, 0.6, 0.15], rh: [-0.65, 0.6, 0.15], p: [0, 0.88, 0], hr: [-0.25, 0, 0] }),
], { loop: true });
export const SLUMP = clip([
  Object.assign({ t: 0 }, STAND),
  Object.assign({ t: 0.5, ease: 'out' }, STAND, { p: [0, 0.95, 0], pr: [0.05, 0, 0], cr: [0.4, 0, 0.05], hr: [0.5, 0.1, 0], lh: [0.25, -1.4, 0.45], rh: [-0.25, -1.4, 0.45] }),
  Object.assign({ t: 2.2 }, STAND, { p: [0, 0.95, 0], pr: [0.05, 0, 0], cr: [0.42, 0, 0.05], hr: [0.55, -0.1, 0], lh: [0.25, -1.4, 0.45], rh: [-0.25, -1.4, 0.45] }),
]);
export const IDLE = clip([
  Object.assign({ t: 0 }, STAND),
  Object.assign({ t: 1.2 }, STAND, { p: [0, 0.965, 0], cr: [0.06, 0.03, 0], lh: [0.43, -1.53, 0.14], rh: [-0.43, -1.53, 0.14], hr: [0.02, 0.1, 0] }),
  Object.assign({ t: 2.4 }, STAND),
], { loop: true });
export const SIGNATURE = clip([
  Object.assign({ t: 0 }, STAND, { prop: true }),
  Object.assign({ t: 0.45, ease: 'out' }, STAND, { prop: true, rh: [-0.6, 0.95, 0.35], lh: [0.6, -0.4, 0.5], pr: [0, -0.3, 0], cr: [-0.1, -0.2, 0], hr: [-0.2, 0.2, 0], lf: [0.5, 0, 0.3], rf: [-0.4, 0, -0.2] }),
  Object.assign({ t: 1.4 }, STAND, { prop: true, rh: [-0.55, 1.0, 0.3], lh: [0.6, -0.35, 0.5], pr: [0, -0.3, 0], cr: [-0.12, -0.2, 0], hr: [-0.25, 0.2, 0], lf: [0.5, 0, 0.3], rf: [-0.4, 0, -0.2] }),
  Object.assign({ t: 2.0 }, STAND, { prop: true }),
], { loop: true });
