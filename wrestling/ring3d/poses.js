/* Run The Ropes 3D: the poses.

   Every pose name the match engine already asks for (poseSet and fmv in
   index.html) has a pose here, so a beat the 3D ring has no special clip for
   still puts the bodies in the shape the game meant. A pose is a handful of
   numbers (see Wrestler.apply in rig.js); a clip is poses on a clock, sampled
   on a Catmull-Rom curve so a strike passes THROUGH its contact pose on an arc
   instead of cornering at it.

   Every pose is authored in the body's own frame: it faces +z, its left is +x.
   A lying body is a pelvis rotation (pr x of minus a quarter turn is flat on
   the back with the head toward -z, plus a quarter turn is face down), so the
   whole body turns with it and the stage only has to put the root on the mat. */

const H = Math.PI / 2;
const D2 = (a) => a * Math.PI / 180;

export const STAND = {
  p: [0, 1, 0], pr: [0, 0, 0], cr: [0, 0, 0], hr: [0, 0, 0],
  lh: [0.52, -1.75, 0.18], rh: [-0.52, -1.75, 0.18],
  lf: [0.42, -0.99, 0.04], rf: [-0.42, -0.99, 0.04], pl: 1, lk: 0, rk: 0,
};
const VEC = ['p', 'pr', 'cr', 'hr', 'lh', 'rh', 'lf', 'rf'];
const NUM = ['pl', 'lk', 'rk', 'lfp', 'rfp'];
const pose = (o) => Object.assign({}, STAND, o);

/* the ring stance a wrestler stands in between moves: knees bent, weight
   forward, hands up and open, leading with the left */
const READY = pose({ p: [0, 0.9, 0], pr: [0.18, 0.2, 0], cr: [0.1, -0.15, 0], hr: [-0.12, -0.05, 0],
  lh: [0.55, -0.55, 1.0], rh: [-0.45, -0.75, 0.85], lf: [0.62, -0.92, 0.45], rf: [-0.5, -0.92, -0.38], lk: 0.4, rk: 0.4 });

export const POSES = {
  stand: STAND,
  ready: READY,
  stance: READY,
  run: pose({ p: [0, 0.94, 0.1], pr: [0.3, 0, 0], cr: [0.1, 0, 0], lh: [0.6, -1.0, -0.6], rh: [-0.6, -0.9, 0.9], lf: [0.3, -0.85, 0.85], rf: [-0.3, -0.9, -0.7], pl: 0.8, lk: 0.6 }),
  runBack: pose({ p: [0, 0.95, 0], pr: [-0.12, 0, 0], lh: [0.6, -1.2, 0.5], rh: [-0.6, -1.2, 0.5], lf: [0.4, -0.95, -0.4], rf: [-0.4, -0.95, 0.3] }),
  walk: pose({ p: [0, 0.98, 0], pr: [0.05, 0, 0], lh: [0.6, -1.65, -0.35], rh: [-0.6, -1.65, 0.4], lf: [0.38, -0.97, 0.45], rf: [-0.38, -0.97, -0.4] }),
  lockup: pose({ p: [0, 0.9, 0.2], pr: [0.42, 0, 0], cr: [0.15, 0, 0], hr: [0.15, 0, 0], lh: [0.6, 0.15, 1.45], rh: [-0.6, -0.1, 1.45], lf: [0.6, -0.9, -0.15], rf: [-0.6, -0.9, -0.85], lk: 0.4, rk: 0.4 }),
  grapple: pose({ p: [0, 0.88, 0.1], pr: [0.38, 0, 0], cr: [0.12, 0, 0], lh: [0.45, -0.2, 1.45], rh: [-0.45, -0.35, 1.4], lf: [0.65, -0.88, 0.1], rf: [-0.65, -0.88, -0.6], lk: 0.4, rk: 0.4 }),
  guard: pose({ p: [0, 0.9, -0.05], pr: [-0.05, 0, 0], cr: [0.2, 0, 0], hr: [0.35, 0, 0], lh: [0.25, 0.65, 0.75], rh: [-0.25, 0.6, 0.75], lf: [0.5, -0.92, 0.2], rf: [-0.5, -0.92, -0.3] }),
  whip: pose({ p: [0, 0.92, 0], pr: [0.1, 0.6, 0], cr: [0, 0.4, 0], lh: [1.6, -0.6, 0.9], rh: [0.9, -0.7, 1.0], lf: [0.6, -0.92, 0.3], rf: [-0.5, -0.92, -0.4] }),
  ropes: pose({ p: [0, 0.98, 0], pr: [0.05, 0, 0], lh: [1.05, 0.2, -0.2], rh: [-1.05, 0.2, -0.2], lf: [0.4, -0.98, 0], rf: [-0.4, -0.98, 0] }),
  wind: pose({ p: [0, 0.92, -0.1], pr: [-0.05, -0.55, 0], cr: [0, -0.5, 0], hr: [0, 0.6, 0], lh: [0.6, -0.4, 0.9], rh: [-1.15, 0.45, -0.75], lf: [0.55, -0.92, 0.5], rf: [-0.5, -0.92, -0.45] }),
  strike: pose({ p: [0, 0.9, 0.3], pr: [0.22, 0.45, 0], cr: [0.1, 0.4, 0], hr: [-0.1, -0.5, 0], lh: [0.55, -0.55, 0.55], rh: [-0.05, 0.25, 2.05], lf: [0.5, -0.9, 0.7], rf: [-0.5, -0.92, -0.5], lk: 0.5 }),
  chop: pose({ p: [0, 0.9, 0.2], pr: [0.2, 0.5, 0], cr: [0.1, 0.5, 0], hr: [0, -0.5, 0], lh: [0.6, -0.8, 0.4], rh: [0.15, 0.0, 1.95], lf: [0.5, -0.9, 0.6], rf: [-0.5, -0.92, -0.5] }),
  clothes: pose({ p: [0, 0.92, 0.3], pr: [0.25, -0.2, 0], cr: [0, -0.3, 0], lh: [1.9, 0.05, 0.4], rh: [-0.6, -1.0, 0.2], lf: [0.5, -0.9, 0.7], rf: [-0.5, -0.92, -0.6] }),
  bigboot: pose({ p: [0, 0.97, -0.25], pr: [-0.42, 0, 0], cr: [0.15, 0, 0], hr: [0.25, 0, 0], lh: [0.85, -1.0, -0.4], rh: [-0.85, -0.9, -0.3], lf: [0.25, -0.15, 0.98], rf: [-0.35, -0.99, -0.2], pl: 0, lk: -0.9 }),
  kick: pose({ p: [0, 0.96, -0.15], pr: [-0.25, 0.3, 0.1], cr: [0.12, 0.2, 0], lh: [0.7, -0.6, 0.6], rh: [-0.8, -0.8, -0.2], lf: [0.4, -0.97, -0.1], rf: [0.1, -0.35, 0.85], pl: 0, rk: -0.6 }),
  stomp: pose({ p: [0, 0.95, 0.1], pr: [0.28, 0, 0], cr: [0.2, 0, 0], hr: [0.3, 0, 0], lh: [0.7, -0.9, 0.5], rh: [-0.7, -0.9, 0.5], lf: [0.45, -0.95, -0.2], rf: [-0.3, -0.45, 0.7], pl: 0, rk: 0.6 }),
  lift: pose({ p: [0, 0.86, 0], pr: [-0.12, 0, 0], cr: [-0.18, 0, 0], hr: [-0.25, 0, 0], lh: [0.55, 0.45, 0.65], rh: [-0.55, 0.45, 0.65], lf: [0.62, -0.86, 0.15], rf: [-0.62, -0.86, -0.15], lk: 0.3, rk: 0.3 }),
  press: pose({ p: [0, 0.94, 0], pr: [-0.08, 0, 0], cr: [-0.1, 0, 0], hr: [-0.45, 0, 0], lh: [0.6, 2.05, 0.15], rh: [-0.6, 2.05, 0.15], lf: [0.6, -0.94, 0.1], rf: [-0.6, -0.94, -0.1] }),
  carry: pose({ p: [0, 0.94, 0], pr: [0.05, 0, 0], cr: [-0.05, 0, 0], lh: [0.6, 0.3, 0.6], rh: [-0.6, 0.1, 0.7], lf: [0.5, -0.94, 0.15], rf: [-0.5, -0.94, -0.15] }),
  /* the body being lifted: limp, knees bent, arms hanging. The stage holds the
     pelvis where the lifter's hands are and lays the body across them. */
  held: pose({ p: [0, 1, 0], pr: [H * 0.95, 0, 0], cr: [-0.25, 0, 0], hr: [-0.4, 0, 0], lh: [0.75, -1.4, 0.6], rh: [-0.75, -1.4, 0.6], lf: [0.4, -0.8, 0.5], rf: [-0.4, -0.85, 0.35], pl: 0, lk: 0.6, rk: 0.6 }),
  /* upside down for the vertical suplex: legs to the roof, arms reaching */
  vert: pose({ p: [0, 1, 0], pr: [Math.PI * 0.98, 0, 0], cr: [0.05, 0, 0], hr: [0.2, 0, 0], lh: [0.7, -1.3, 0.3], rh: [-0.7, -1.3, 0.3], lf: [0.35, -0.97, 0.15], rf: [-0.35, -0.97, -0.1], pl: 0 }),
  reel: pose({ p: [0, 0.95, -0.35], pr: [-0.42, -0.2, 0.08], cr: [-0.25, 0, 0], hr: [-0.45, 0.2, 0], lh: [1.25, 0.5, -0.2], rh: [-1.3, 0.2, 0.2], lf: [0.5, -0.94, 0.55], rf: [-0.45, -0.9, -0.15], pl: 0.9 }),
  stagger: pose({ p: [0, 0.88, 0], pr: [0.42, 0.25, 0.1], cr: [0.25, 0.1, 0], hr: [0.25, 0.3, 0], lh: [0.55, -1.45, 0.55], rh: [-0.75, -1.2, 0.35], lf: [0.65, -0.88, 0.25], rf: [-0.45, -0.88, -0.35], lk: 0.5, rk: 0.4 }),
  kneel: pose({ p: [0, 0.45, 0], pr: [0.22, 0, 0], cr: [0.25, 0, 0], hr: [0.15, 0, 0], lh: [0.7, -1.35, 0.6], rh: [-0.7, -1.35, 0.6], lf: [0.55, -0.55, 0.9], rf: [-0.45, -0.25, -0.95], pl: 0, lk: 1.6, rk: 0.6 }),
  /* flat on the back, head toward -z */
  prone: pose({ p: [0, 0.13, 0], pr: [-H, 0, 0], cr: [0, 0, 0], hr: [-0.15, 0.3, 0], lh: [1.05, -1.45, 0.2], rh: [-1.1, -1.2, 0.25], lf: [0.45, -0.98, 0.05], rf: [-0.5, -0.96, 0.1], pl: 0 }),
  /* the same, starting to stir: up on one elbow, a knee raised */
  proneUp: pose({ p: [0, 0.14, 0], pr: [-H * 0.78, 0, 0.05], cr: [0.25, 0, 0], hr: [0.25, 0, 0], lh: [1.0, -1.15, -0.6], rh: [-0.9, -1.25, -0.35], lf: [0.45, -0.7, 0.55], rf: [-0.5, -0.96, 0.1], pl: 0, lk: 1.2 }),
  /* face down, spread on the canvas */
  splat: pose({ p: [0, 0.13, 0], pr: [H, 0, 0], cr: [0, 0, 0], hr: [-0.2, 0.4, 0], lh: [1.3, -0.6, 0.2], rh: [-1.3, -0.6, 0.2], lf: [0.55, -0.98, 0], rf: [-0.55, -0.98, 0], pl: 0 }),
  /* the cover: laid across the man on the mat, an arm hooking his leg */
  pin: pose({ p: [0, 0.3, 0], pr: [H * 0.92, 0, 0], cr: [0.05, 0, 0], hr: [-0.35, 0.5, 0], lh: [1.1, -0.8, 0.5], rh: [-0.8, -1.1, 0.7], lf: [0.65, -0.85, -0.5], rf: [-0.6, -0.92, -0.25], pl: 0, lk: 1.2, rk: 1.0 }),
  /* a hold applied from above: kneeling over him, hands locked down on him */
  submit: pose({ p: [0, 0.55, 0], pr: [0.65, 0, 0], cr: [0.3, 0, 0], hr: [0.1, 0, 0], lh: [0.35, -1.3, 1.1], rh: [-0.35, -1.3, 1.1], lf: [0.6, -0.55, 0.7], rf: [-0.55, -0.4, -0.75], pl: 0, lk: 1.6, rk: 0.6 }),
  /* the suplex bridge: on the back of the head and the feet, belly to the roof */
  bridge: pose({ p: [0, 0.62, -0.2], pr: [-H * 1.12, 0, 0], cr: [-0.45, 0, 0], hr: [-0.7, 0, 0], lh: [0.5, 0.6, 0.9], rh: [-0.5, 0.6, 0.9], lf: [0.55, -0.62, 0.95], rf: [-0.55, -0.62, 0.95], pl: 0, lk: 1.4, rk: 1.4 }),
  /* on the top turnbuckle: crouched, balanced, hands on the top rope */
  climb: pose({ p: [0, 0.62, -0.1], pr: [0.45, 0, 0], cr: [0.25, 0, 0], hr: [-0.15, 0, 0], lh: [0.85, -0.9, 0.5], rh: [-0.85, -0.9, 0.5], lf: [0.5, -0.62, 0.55], rf: [-0.5, -0.62, 0.55], pl: 1, lk: 1.2, rk: 1.2 }),
  /* in the air: arms spread, body flat, flying face first */
  dive: pose({ p: [0, 1, 0], pr: [H * 0.9, 0, 0], cr: [-0.1, 0, 0], hr: [-0.55, 0, 0], lh: [1.7, 0.2, 0.3], rh: [-1.7, 0.2, 0.3], lf: [0.4, -0.98, -0.05], rf: [-0.4, -0.98, -0.05], pl: 0 }),
  /* the splash landing: flat on top of him, arms and legs wide */
  splash: pose({ p: [0, 0.4, 0], pr: [H, 0, 0], cr: [0, 0, 0], hr: [-0.3, 0, 0], lh: [1.5, -0.4, 0.1], rh: [-1.5, -0.4, 0.1], lf: [0.65, -0.95, 0], rf: [-0.65, -0.95, 0], pl: 0 }),
  taunt: pose({ p: [0, 0.97, 0], pr: [-0.1, 0, 0], cr: [-0.12, 0, 0], hr: [-0.25, 0, 0], lh: [1.25, 0.95, 0.2], rh: [-1.25, 0.95, 0.2], lf: [0.55, -0.97, 0.1], rf: [-0.55, -0.97, -0.05] }),
  point: pose({ p: [0, 0.98, 0], pr: [-0.04, 0.2, 0], cr: [0, 0.15, 0], hr: [-0.1, -0.2, 0], lh: [0.6, -1.6, 0.3], rh: [-0.45, 0.65, 1.8], lf: [0.45, -0.98, 0.15], rf: [-0.45, -0.98, -0.1] }),
  flex: pose({ p: [0, 0.96, 0], pr: [-0.05, 0, 0], cr: [-0.1, 0, 0], hr: [-0.15, 0, 0], lh: [1.25, 0.35, 0.1], rh: [-1.25, 0.35, 0.1], lf: [0.6, -0.96, 0.05], rf: [-0.6, -0.96, 0.05] }),
  celebrate: pose({ p: [0, 1, 0], pr: [-0.12, 0, 0], cr: [-0.15, 0, 0], hr: [-0.4, 0, 0], lh: [0.75, 2.0, 0.25], rh: [-0.75, 2.0, 0.25], lf: [0.5, -1, 0.05], rf: [-0.5, -1, -0.05] }),
  raised: pose({ p: [0, 1, 0], pr: [-0.08, 0, 0], cr: [-0.1, 0, 0], hr: [-0.3, 0, 0], lh: [0.5, 2.05, 0.15], rh: [-0.6, -1.6, 0.25], lf: [0.45, -1, 0.05], rf: [-0.45, -1, -0.05] }),
  corner: pose({ p: [0, 0.92, -0.2], pr: [-0.28, 0, 0], cr: [-0.1, 0, 0], hr: [0.25, 0, 0], lh: [1.15, 0.3, -0.7], rh: [-1.15, 0.3, -0.7], lf: [0.55, -0.92, 0.25], rf: [-0.55, -0.92, 0.2] }),
  /* entrance walk: tall, chest out */
  strut: pose({ p: [0, 1, 0], pr: [-0.06, 0, 0], cr: [-0.1, 0, 0], hr: [-0.1, 0, 0], lh: [0.75, -1.5, 0.3], rh: [-0.75, -1.5, 0.3], lf: [0.4, -1, 0.2], rf: [-0.4, -1, -0.2] }),
  /* the referee */
  refIdle: pose({ p: [0, 0.97, 0], pr: [0.06, 0, 0], lh: [0.5, -1.55, 0.6], rh: [-0.5, -1.55, 0.6], lf: [0.5, -0.97, 0.05], rf: [-0.5, -0.97, -0.05] }),
  refWatch: pose({ p: [0, 0.78, 0], pr: [0.6, 0, 0], cr: [0.2, 0, 0], hr: [-0.5, 0, 0], lh: [0.55, -1.25, 0.95], rh: [-0.55, -1.25, 0.95], lf: [0.65, -0.8, 0.15], rf: [-0.65, -0.8, 0.15], lk: 0.5, rk: 0.5 }),
  /* down on the mat beside the cover, hand raised for the count */
  refUp: pose({ p: [0, 0.2, 0], pr: [H * 0.86, 0, 0], cr: [-0.35, 0, 0], hr: [-0.75, 0, 0], lh: [0.7, -0.6, 0.5], rh: [-0.5, 1.6, 0.3], lf: [0.4, -0.98, 0], rf: [-0.4, -0.98, 0], pl: 0 }),
  refDown: pose({ p: [0, 0.2, 0], pr: [H * 0.9, 0, 0], cr: [-0.3, 0, 0], hr: [-0.7, 0, 0], lh: [0.7, -0.6, 0.5], rh: [-0.55, -0.9, 1.2], lf: [0.4, -0.98, 0], rf: [-0.4, -0.98, 0], pl: 0 }),
  refNo: pose({ p: [0, 0.95, 0], pr: [0.05, 0, 0], lh: [1.7, 0.1, 0.4], rh: [-1.7, 0.1, 0.4], lf: [0.55, -0.95, 0.05], rf: [-0.55, -0.95, -0.05] }),
  refRaise: pose({ p: [0, 0.99, 0], pr: [-0.04, 0, 0], lh: [0.5, 2.0, 0.25], rh: [-0.5, -1.6, 0.25], lf: [0.5, -0.99, 0.05], rf: [-0.5, -0.99, -0.05] }),
};

/* what the pose means for where the body is: lying poses sit on the canvas
   whatever height the stage was asked for, and a pose that belongs high in
   the air (a climb, a dive) carries its own idea of elevation */
export const LYING = new Set(['prone', 'proneUp', 'splat', 'pin', 'submit', 'bridge', 'splash', 'refUp', 'refDown']);
export const AIR = new Set(['dive', 'held', 'vert']);

/* -------------------------------------------------------------- sampling */
export function get(name) { return POSES[name] || POSES[ALIAS[name]] || READY; }
const ALIAS = { idle: 'ready', bump: 'reel', flat: 'prone' };

export function lerpPose(A, B, t) {
  const R = {};
  for (const k of VEC) { const a = A[k] || STAND[k], b = B[k] || STAND[k]; R[k] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  for (const k of NUM) { const a = A[k] == null ? (STAND[k] || 0) : A[k], b = B[k] == null ? (STAND[k] || 0) : B[k]; R[k] = a + (b - a) * t; }
  return R;
}
/* a pose with a little life in it: breathing for a standing body, and a heave
   for one lying hurt. phase is seconds; hurt is 0..1 */
export function alive(P, phase, hurt = 0) {
  const R = Object.assign({}, P), b = Math.sin(phase * 2.6) * (0.012 + hurt * 0.02);
  R.cr = [P.cr[0] - b * 2, P.cr[1], P.cr[2]];
  R.lh = [P.lh[0], P.lh[1] + b * 1.5, P.lh[2]]; R.rh = [P.rh[0], P.rh[1] + b * 1.5, P.rh[2]];
  if (P.pl > 0.5) R.p = [P.p[0], P.p[1] - Math.abs(b) * 0.6, P.p[2]];
  return R;
}
export const ease = {
  linear: (t) => t,
  inout: (t) => t * t * (3 - 2 * t),
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  snap: (t) => 1 - Math.pow(1 - t, 3),
  back: (t) => { const s = 1.4; return 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2); },
};
export { D2 };
