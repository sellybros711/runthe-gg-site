/* Run The Ropes 3D: the moves.

   A move is two bodies on one clock. A clip names, for the attacker (A) and
   the defender (D), a list of keys: a time, a pose, and where the body's root
   stands in the MOVE FRAME. The move frame starts with A at the origin facing
   +x and D a lockup's distance away on +x facing back, so every move is
   authored once and the stage turns it to wherever the two of them are.

   A LIFT IS AN ATTACHMENT, NEVER A NUMBER. A cruiserweight slamming a giant and
   a giant slamming a cruiserweight are the same clip, so a body that is held
   gives no position at all: it names a point on the other body (`on`: hands,
   chest, pelvis) and an offset, and the stage puts the held body's pelvis
   there every frame after the lifter is posed. Written as coordinates, the
   giant floats a foot off his opponent's shoulders.

   `fx` is a list of cues on the same clock: hit (the moment the game's own
   hit() fires, which moves the damage bar and writes the log), shake, dust,
   rope, cam, slow. The game's choreography decided which family a move is
   (strike, runner, slam, suplex, aerial, submission, technical, hardcore,
   showman); the move's NAME picks a variant inside the family, so a
   "Piledriver" and a "Body Slam" are both slams and look different. */

const H = Math.PI / 2, PI = Math.PI;

/* ------------------------------------------------------------- helpers */
const k = (t, pose, x, o) => Object.assign({ t, pose, x: x || 0, y: 0, z: 0, yaw: 0 }, o || {});
const kd = (t, pose, x, o) => Object.assign({ t, pose, x: x || 0, y: 0, z: 0, yaw: PI }, o || {});
const G = 2.6;   /* the lockup distance between two pelvises */

/* D thrown down onto the back: off his feet, an arc, the canvas */
function bumpBack(t0, x0, x1, opt = {}) {
  const yaw = opt.yaw == null ? PI : opt.yaw, t1 = t0 + (opt.dur || 0.34);
  return [
    kd(t0, 'reel', x0, { yaw }),
    kd(t0 + (t1 - t0) * 0.45, Object.assign({}, { base: 'prone', p: [0, 0.5, 0] }), (x0 + x1) / 2, { yaw, y: opt.air == null ? 1.1 : opt.air, ease: 'out' }),
    kd(t1, 'prone', x1, { yaw, ease: 'in' }),
  ];
}

/* ------------------------------------------------------------- families */
const STRIKES = {
  punch: () => ({
    dur: 1.05,
    A: [k(0, 'ready', 0), k(0.16, 'wind', 0.15, { ease: 'out' }), k(0.3, 'strike', 0.55, { ease: 'snap' }), k(0.55, 'strike', 0.5), k(0.95, 'ready', 0.3, { ease: 'inout' })],
    D: [kd(0, 'ready', G), kd(0.3, 'ready', G), kd(0.36, 'reel', G + 0.55, { ease: 'snap' }), kd(0.75, 'stagger', G + 0.9, { ease: 'out' }), kd(1.05, 'ready', G + 0.7)],
    fx: [{ t: 0.31, hit: 1 }, { t: 0.31, shake: 0.25 }],
  }),
  chop: () => ({
    dur: 1.1,
    A: [k(0, 'ready', 0), k(0.2, 'wind', 0.2, { ease: 'out' }), k(0.36, 'chop', 0.55, { ease: 'snap' }), k(0.7, 'chop', 0.5), k(1.05, 'ready', 0.3)],
    D: [kd(0, 'ready', G), kd(0.36, 'ready', G), kd(0.42, 'stagger', G + 0.6, { ease: 'snap' }), kd(1.1, 'ready', G + 0.6)],
    fx: [{ t: 0.37, hit: 1 }, { t: 0.37, shake: 0.3 }],
  }),
  kick: () => ({
    dur: 1.1,
    A: [k(0, 'ready', 0), k(0.18, 'ready', 0.2), k(0.34, 'kick', 0.4, { ease: 'snap' }), k(0.62, 'kick', 0.35), k(1.0, 'ready', 0.25)],
    D: [kd(0, 'ready', G), kd(0.34, 'ready', G), kd(0.4, 'stagger', G + 0.7, { ease: 'snap' }), kd(1.1, 'ready', G + 0.6)],
    fx: [{ t: 0.35, hit: 1 }, { t: 0.35, shake: 0.3 }],
  }),
  forearm: () => ({
    dur: 1.0,
    A: [k(0, 'ready', 0), k(0.22, 'wind', 0.1), k(0.34, 'strike', 0.7, { ease: 'snap' }), k(1.0, 'ready', 0.3)],
    D: [kd(0, 'ready', G), kd(0.34, 'ready', G), kd(0.4, 'reel', G + 0.8, { ease: 'snap' }), kd(1.0, 'stagger', G + 0.9)],
    fx: [{ t: 0.35, hit: 1 }, { t: 0.35, shake: 0.35 }],
  }),
};

const RUNNERS = {
  clothesline: (c) => ({
    dur: 1.85,
    A: [k(0, 'ready', 0), k(0.12, 'runBack', -0.4, { yaw: PI }), k(0.45, 'run', -c.back, { yaw: PI }), k(0.55, 'ropes', -c.back - 0.4, { yaw: PI }), k(0.66, 'run', -c.back + 0.2),
      k(1.0, 'run', G - 1.4), k(1.08, 'clothes', G - 0.8, { ease: 'snap' }), k(1.35, 'clothes', G - 0.2), k(1.85, 'ready', G - 0.4)],
    D: [kd(0, 'ready', G), kd(0.6, 'ready', G), kd(1.04, 'stagger', G), ...bumpBack(1.09, G + 0.2, G + 1.6, { dur: 0.4, air: 1.4 }), kd(1.85, 'prone', G + 1.6)],
    fx: [{ t: 0.55, rope: 'back', s: 0.8 }, { t: 1.08, hit: 2 }, { t: 1.08, slow: 0.45, d: 0.22 }, { t: 1.49, dust: 'D' }, { t: 1.49, shake: 0.6 }, { t: 0.9, cam: 'track' }],
  }),
  bigboot: (c) => ({
    dur: 1.75,
    A: [k(0, 'ready', 0), k(0.12, 'runBack', -0.4, { yaw: PI }), k(0.45, 'run', -c.back, { yaw: PI }), k(0.55, 'ropes', -c.back - 0.4, { yaw: PI }), k(0.66, 'run', -c.back + 0.2),
      k(0.98, 'run', G - 1.7), k(1.06, 'bigboot', G - 1.3, { ease: 'snap' }), k(1.3, 'bigboot', G - 1.1), k(1.75, 'ready', G - 1.0)],
    D: [kd(0, 'ready', G), kd(1.02, 'stagger', G), ...bumpBack(1.07, G + 0.2, G + 1.8, { dur: 0.42, air: 1.5 }), kd(1.75, 'prone', G + 1.8)],
    fx: [{ t: 0.55, rope: 'back', s: 0.8 }, { t: 1.06, hit: 2 }, { t: 1.06, slow: 0.45, d: 0.25 }, { t: 1.49, dust: 'D' }, { t: 1.49, shake: 0.65 }],
  }),
  spear: (c) => ({
    dur: 1.6,
    A: [k(0, 'ready', 0), k(0.4, 'ready', -1.6), k(0.75, 'run', -0.8), k(0.98, 'run', G - 1.3, { base: 'run', pr: [0.85, 0, 0], p: [0, 0.6, 0] }),
      k(1.1, { base: 'splat', p: [0, 0.6, 0] }, G - 0.1, { y: 0.6, ease: 'snap' }), k(1.3, 'splash', G + 0.8, { ease: 'in' }), k(1.6, 'kneel', G + 0.6)],
    D: [kd(0, 'ready', G), kd(1.0, 'stagger', G), ...bumpBack(1.04, G + 0.4, G + 1.9, { dur: 0.26, air: 0.8 }), kd(1.6, 'prone', G + 1.9)],
    fx: [{ t: 1.04, hit: 2 }, { t: 1.04, slow: 0.4, d: 0.2 }, { t: 1.3, dust: 'D' }, { t: 1.3, shake: 0.8 }],
  }),
  dropkick: (c) => ({
    dur: 1.7,
    A: [k(0, 'ready', 0), k(0.3, 'run', -1.2, { yaw: PI }), k(0.5, 'run', -0.4), k(0.8, 'run', G - 2.2),
      k(1.0, { base: 'bigboot', pr: [-1.2, 0, 0], lf: [0.3, -0.2, 0.9], rf: [-0.3, -0.2, 0.9] }, G - 1.4, { y: 1.6, ease: 'out' }),
      k(1.3, 'prone', G - 1.6, { yaw: 0, ease: 'in' }), k(1.7, 'proneUp', G - 1.6)],
    D: [kd(0, 'ready', G), kd(1.0, 'ready', G), ...bumpBack(1.02, G + 0.2, G + 1.7, { dur: 0.35, air: 1.2 }), kd(1.7, 'prone', G + 1.7)],
    fx: [{ t: 1.0, hit: 2 }, { t: 1.0, slow: 0.4, d: 0.22 }, { t: 1.3, dust: 'A' }, { t: 1.37, dust: 'D' }, { t: 1.37, shake: 0.7 }],
  }),
};

const SLAMS = {
  /* the body slam: scoop him onto your chest, turn him over, drop him flat */
  bodyslam: () => ({
    dur: 1.6,
    A: [k(0, 'ready', 0), k(0.28, 'grapple', 0.9), k(0.62, 'lift', 0.9, { ease: 'inout' }), k(0.9, 'lift', 0.9), k(1.12, 'kneel', 1.0, { ease: 'in' }), k(1.6, 'ready', 0.7)],
    D: [kd(0, 'ready', G), kd(0.28, 'guard', 1.9), kd(0.62, 'held', 0, { on: 'chest', off: [0.25, 1.1, 0], yaw: H, ease: 'inout' }),
      kd(0.9, 'held', 0, { on: 'chest', off: [0.35, 1.25, 0], yaw: H }), kd(1.14, 'prone', 2.4, { yaw: H, ease: 'in' }), kd(1.6, 'prone', 2.4, { yaw: H })],
    fx: [{ t: 1.14, hit: 2 }, { t: 1.14, dust: 'D' }, { t: 1.14, shake: 0.7 }, { t: 0.6, cam: 'low' }],
  }),
  /* the gorilla press: all the way over the head, a beat up there, then dropped */
  press: () => ({
    dur: 2.2,
    A: [k(0, 'ready', 0), k(0.28, 'grapple', 0.9), k(0.62, 'lift', 0.9), k(1.0, 'press', 0.9, { ease: 'inout' }), k(1.5, 'press', 0.9), k(1.72, 'lift', 0.9, { ease: 'in' }), k(2.2, 'ready', 0.6)],
    D: [kd(0, 'ready', G), kd(0.28, 'guard', 1.9), kd(0.62, 'held', 0, { on: 'chest', off: [0.3, 1.0, 0], yaw: H }),
      kd(1.0, { base: 'held', pr: [H, 0, 0], lf: [0.4, -0.98, 0], rf: [-0.4, -0.98, 0] }, 0, { on: 'hands', off: [0, 0.6, 0], yaw: H, ease: 'inout' }),
      kd(1.5, { base: 'held', pr: [H, 0, 0] }, 0, { on: 'hands', off: [0, 0.7, 0], yaw: H }), kd(1.76, 'splat', 2.2, { yaw: H, ease: 'in' }), kd(2.2, 'splat', 2.2, { yaw: H })],
    fx: [{ t: 1.0, cam: 'low' }, { t: 1.76, hit: 2 }, { t: 1.76, dust: 'D' }, { t: 1.76, shake: 0.9 }, { t: 1.76, slow: 0.5, d: 0.15 }],
  }),
  /* the powerbomb: hooked over the shoulders, up high, driven down on the back */
  powerbomb: () => ({
    dur: 2.0,
    A: [k(0, 'ready', 0), k(0.3, 'grapple', 1.0, { base: 'grapple', pr: [0.8, 0, 0] }), k(0.75, 'lift', 0.9), k(1.2, 'press', 0.9, { ease: 'inout' }), k(1.46, 'kneel', 1.0, { ease: 'in' }), k(2.0, 'kneel', 1.0)],
    D: [kd(0, 'ready', G), kd(0.3, 'stagger', 1.7), kd(0.75, { base: 'held', pr: [-0.3, 0, 0], lf: [0.45, -0.6, 0.6], rf: [-0.45, -0.6, 0.6] }, 0, { on: 'chest', off: [0.4, 0.9, 0] }),
      kd(1.2, { base: 'held', pr: [-0.4, 0, 0], lf: [0.5, -0.5, 0.7], rf: [-0.5, -0.5, 0.7] }, 0, { on: 'hands', off: [0.1, 0.3, 0] }),
      kd(1.48, 'prone', 1.9, { ease: 'in', yaw: 0 }), kd(2.0, 'prone', 1.9, { yaw: 0 })],
    fx: [{ t: 1.0, cam: 'low' }, { t: 1.48, hit: 2 }, { t: 1.48, dust: 'D' }, { t: 1.48, shake: 1 }, { t: 1.48, slow: 0.4, d: 0.22 }],
  }),
  /* the piledriver: upside down between the knees, both sat down hard */
  piledriver: () => ({
    dur: 1.9,
    A: [k(0, 'ready', 0), k(0.3, 'grapple', 1.0, { base: 'grapple', pr: [0.9, 0, 0] }), k(0.8, 'lift', 1.0), k(1.1, 'lift', 1.0), k(1.36, 'kneel', 1.0, { ease: 'in', p: [0, 0.32, 0], pr: [-0.1, 0, 0] }), k(1.9, 'kneel', 1.0)],
    D: [kd(0, 'ready', G), kd(0.3, 'stagger', 1.75, { base: 'stagger', pr: [1.2, 0, 0] }), kd(0.8, 'vert', 0, { on: 'chest', off: [0.75, 0.2, 0] }), kd(1.1, 'vert', 0, { on: 'chest', off: [0.75, 0.25, 0] }),
      kd(1.38, 'vert', 0, { on: 'chest', off: [0.72, 0.05, 0], ease: 'in' }), kd(1.6, 'prone', 1.9, { yaw: PI }), kd(1.9, 'prone', 1.9)],
    fx: [{ t: 0.85, cam: 'low' }, { t: 1.38, hit: 2 }, { t: 1.38, shake: 1 }, { t: 1.38, dust: 'A' }, { t: 1.38, slow: 0.35, d: 0.25 }],
  }),
  /* the DDT: a front facelock and both fall back, his head planted */
  ddt: () => ({
    dur: 1.5,
    A: [k(0, 'ready', 0), k(0.3, 'grapple', 0.95, { base: 'grapple', lh: [0.3, -0.6, 1.2], rh: [-0.3, -0.7, 1.2] }), k(0.62, { base: 'prone', p: [0, 0.6, 0] }, 0.3, { y: 0.7, ease: 'in' }), k(0.82, 'prone', 0.1, { ease: 'in' }), k(1.5, 'proneUp', 0.1)],
    D: [kd(0, 'ready', G), kd(0.3, 'stagger', 1.8, { base: 'stagger', pr: [1.1, 0, 0] }), kd(0.82, 'splat', 1.4, { ease: 'in' }), kd(1.5, 'splat', 1.5)],
    fx: [{ t: 0.82, hit: 2 }, { t: 0.82, shake: 0.85 }, { t: 0.82, dust: 'D' }, { t: 0.82, slow: 0.4, d: 0.2 }],
  }),
};

const SUPLEXES = {
  /* the vertical suplex: lifted upside down, held up there, then over */
  vertical: () => ({
    dur: 2.0,
    A: [k(0, 'ready', 0), k(0.3, 'lockup', 0.9), k(0.72, 'lift', 0.75, { pr: [-0.35, 0, 0] }), k(1.2, 'lift', 0.7, { base: 'lift', pr: [-0.5, 0, 0] }), k(1.5, 'bridge', 0.4, { ease: 'in' }), k(2.0, 'bridge', 0.4)],
    D: [kd(0, 'ready', G), kd(0.3, 'lockup', 1.9), kd(0.72, 'vert', 0, { on: 'chest', off: [0.45, 1.3, 0], ease: 'inout' }), kd(1.2, 'vert', 0, { on: 'chest', off: [0.25, 1.5, 0] }),
      kd(1.52, 'prone', -1.4, { yaw: PI, ease: 'in' }), kd(2.0, 'prone', -1.5)],
    fx: [{ t: 0.75, cam: 'low' }, { t: 1.52, hit: 2 }, { t: 1.52, dust: 'D' }, { t: 1.52, shake: 0.8 }],
  }),
  /* the German: from behind, a waist lock, a high arc and a bridge */
  german: () => ({
    dur: 1.6,
    A: [k(0, 'ready', 0), k(0.3, 'grapple', 2.6, { yaw: 0 }), k(0.55, 'grapple', 3.5, { base: 'grapple', lh: [0.4, -0.9, 1.0], rh: [-0.4, -0.9, 1.0] }), k(0.9, 'bridge', 3.2, { ease: 'in', yaw: 0 }), k(1.6, 'bridge', 3.2)],
    D: [kd(0, 'ready', G), kd(0.3, 'stagger', G + 1.6, { yaw: 0 }), kd(0.55, 'stagger', G + 1.9, { yaw: 0 }),
      kd(0.74, 'vert', 0, { on: 'chest', off: [-0.6, 1.0, 0], yaw: 0 }), kd(0.92, { base: 'prone', pr: [H, 0, 0] }, 1.4, { yaw: 0, ease: 'in' }), kd(1.6, 'splat', 1.4, { yaw: 0 })],
    fx: [{ t: 0.92, hit: 2 }, { t: 0.92, dust: 'D' }, { t: 0.92, shake: 0.9 }, { t: 0.9, slow: 0.4, d: 0.2 }],
  }),
  /* the belly to belly: chest to chest, a hip toss straight over the top */
  belly: () => ({
    dur: 1.45,
    A: [k(0, 'ready', 0), k(0.3, 'lockup', 1.0), k(0.6, 'lift', 0.9, { pr: [-0.4, 0, 0] }), k(0.86, 'prone', 0.2, { ease: 'in' }), k(1.45, 'proneUp', 0.3)],
    D: [kd(0, 'ready', G), kd(0.3, 'lockup', 1.95), kd(0.6, { base: 'vert', pr: [PI * 0.6, 0, 0] }, 0, { on: 'chest', off: [0.4, 1.1, 0] }), kd(0.9, 'prone', -1.6, { ease: 'in' }), kd(1.45, 'prone', -1.7)],
    fx: [{ t: 0.9, hit: 2 }, { t: 0.9, dust: 'D' }, { t: 0.9, shake: 0.8 }],
  }),
};

const AERIALS = {
  splash: (c) => ({
    dur: 2.55,
    A: [k(0, 'ready', 0), k(0.5, 'run', c.corner[0] - c.cin[0], { z: c.corner[1] - c.cin[1], yaw: c.cyaw }), k(0.8, 'climb', c.corner[0], { z: c.corner[1], y: c.top, yaw: c.cyaw + PI }),
      k(1.4, 'climb', c.corner[0], { z: c.corner[1], y: c.top, yaw: c.cyaw + PI }), k(1.62, 'dive', (c.corner[0] + c.dx) / 2, { z: (c.corner[1] + c.dz) / 2, y: c.top + 1.6, yaw: c.cyaw + PI, ease: 'out' }),
      k(1.86, 'splash', c.dx, { z: c.dz, y: 0.35, yaw: c.dyaw, ease: 'in' }), k(2.55, 'proneUp', c.dx - 0.6, { z: c.dz, yaw: c.dyaw })],
    D: [kd(0, 'ready', G), kd(0.3, 'stagger', G + 0.4), kd(0.5, 'prone', c.dx, { z: c.dz, yaw: c.dyaw - H }), kd(2.55, 'prone', c.dx, { z: c.dz, yaw: c.dyaw - H })],
    fx: [{ t: 0.85, cam: 'corner' }, { t: 1.4, cam: 'air' }, { t: 1.86, hit: 2 }, { t: 1.86, shake: 1 }, { t: 1.86, dust: 'D' }, { t: 1.6, slow: 0.55, d: 0.25 }],
  }),
  elbow: (c) => ({
    dur: 2.5,
    A: [k(0, 'ready', 0), k(0.5, 'run', c.corner[0] - c.cin[0], { z: c.corner[1] - c.cin[1], yaw: c.cyaw }), k(0.8, 'climb', c.corner[0], { z: c.corner[1], y: c.top, yaw: c.cyaw + PI }),
      k(1.35, 'point', c.corner[0], { z: c.corner[1], y: c.top + 0.2, yaw: c.cyaw + PI }), k(1.6, { base: 'dive', rh: [-0.4, 0.2, 1.0] }, (c.corner[0] + c.dx) / 2, { z: (c.corner[1] + c.dz) / 2, y: c.top + 1.3, yaw: c.cyaw + PI, ease: 'out' }),
      k(1.84, 'splash', c.dx, { z: c.dz, y: 0.4, yaw: c.dyaw, ease: 'in' }), k(2.5, 'proneUp', c.dx - 0.5, { z: c.dz, yaw: c.dyaw })],
    D: [kd(0, 'ready', G), kd(0.3, 'stagger', G + 0.4), kd(0.5, 'prone', c.dx, { z: c.dz, yaw: c.dyaw - H }), kd(2.5, 'prone', c.dx, { z: c.dz, yaw: c.dyaw - H })],
    fx: [{ t: 0.85, cam: 'corner' }, { t: 1.35, cam: 'air' }, { t: 1.84, hit: 2 }, { t: 1.84, shake: 1 }, { t: 1.84, dust: 'D' }, { t: 1.56, slow: 0.5, d: 0.28 }],
  }),
  /* the moonsault: off the top facing the corner, a full backflip onto him */
  moonsault: (c) => ({
    dur: 2.7,
    A: [k(0, 'ready', 0), k(0.5, 'run', c.corner[0] - c.cin[0], { z: c.corner[1] - c.cin[1], yaw: c.cyaw }), k(0.85, 'climb', c.corner[0], { z: c.corner[1], y: c.top, yaw: c.cyaw }),
      k(1.4, 'climb', c.corner[0], { z: c.corner[1], y: c.top, yaw: c.cyaw }),
      k(1.62, { base: 'dive', pr: [-PI * 0.9, 0, 0] }, c.corner[0] * 0.6 + c.dx * 0.4, { z: c.corner[1] * 0.6 + c.dz * 0.4, y: c.top + 1.9, yaw: c.cyaw, ease: 'out' }),
      k(1.82, { base: 'dive', pr: [-PI * 1.55, 0, 0] }, c.corner[0] * 0.25 + c.dx * 0.75, { z: c.corner[1] * 0.25 + c.dz * 0.75, y: c.top + 0.9, yaw: c.cyaw }),
      k(2.0, { base: 'splash', pr: [-PI * 1.5, 0, 0] }, c.dx, { z: c.dz, y: 0.35, yaw: c.cyaw, ease: 'in' }), k(2.7, { base: 'splash', pr: [-PI * 1.5, 0, 0] }, c.dx, { z: c.dz, y: 0.35, yaw: c.cyaw })],
    D: [kd(0, 'ready', G), kd(0.3, 'stagger', G + 0.4), kd(0.5, 'prone', c.dx, { z: c.dz, yaw: c.dyaw - H }), kd(2.7, 'prone', c.dx, { z: c.dz, yaw: c.dyaw - H })],
    fx: [{ t: 0.9, cam: 'corner' }, { t: 1.4, cam: 'air' }, { t: 2.0, hit: 2 }, { t: 2.0, shake: 1 }, { t: 2.0, dust: 'D' }, { t: 1.55, slow: 0.45, d: 0.4 }],
  }),
};

const HOLDS = {
  /* a hold applied to a man on the canvas: kneel over him and wrench */
  armbar: () => ({
    dur: 1.6, hold: true,
    A: [k(0, 'ready', 0), k(0.3, 'grapple', 0.9), k(0.7, 'submit', 1.2, { ease: 'inout' }), k(1.6, 'submit', 1.2)],
    D: [kd(0, 'ready', G), kd(0.3, 'guard', 1.9), ...bumpBack(0.36, 2.0, 2.4, { dur: 0.32, air: 0.5 }), kd(1.6, 'prone', 2.4)],
    fx: [{ t: 0.72, hit: 1 }, { t: 0.72, cam: 'hold' }],
  }),
  /* the crab: stood over his legs, turned over and sat back on him */
  crab: () => ({
    dur: 1.8, hold: true,
    A: [k(0, 'ready', 0), k(0.3, 'grapple', 0.6), k(0.8, 'stand', 1.0, { yaw: PI, base: 'lift', pr: [0.15, 0, 0], lh: [0.35, -1.1, 0.8], rh: [-0.35, -1.1, 0.8] }), k(1.2, 'stand', 1.1, { yaw: PI, base: 'kneel', p: [0, 0.7, 0], pr: [-0.3, 0, 0], lh: [0.35, -0.9, 0.9], rh: [-0.35, -0.9, 0.9] }), k(1.8, 'stand', 1.1, { yaw: PI, base: 'kneel', p: [0, 0.7, 0], pr: [-0.35, 0, 0] })],
    D: [kd(0, 'ready', G), kd(0.3, 'stagger', 1.9), ...bumpBack(0.36, 2.0, 2.6, { dur: 0.3, air: 0.5 }), kd(0.9, 'splat', 2.6, { yaw: PI }),
      kd(1.2, { base: 'splat', lf: [0.25, -0.5, -0.8], rf: [-0.25, -0.5, -0.8], lk: -1.2, rk: -1.2 }, 2.6, { yaw: PI }), kd(1.8, { base: 'splat', lf: [0.25, -0.45, -0.85], rf: [-0.25, -0.45, -0.85], lk: -1.2, rk: -1.2, hr: [-0.6, 0, 0] }, 2.6, { yaw: PI })],
    fx: [{ t: 1.2, hit: 1 }, { t: 1.2, cam: 'hold' }],
  }),
  /* the chinlock: sat behind him on the mat, an arm across his throat */
  chinlock: () => ({
    dur: 1.6, hold: true,
    A: [k(0, 'ready', 0), k(0.35, 'grapple', 2.9, { yaw: 0 }), k(0.75, { base: 'kneel', p: [0, 0.4, 0], lh: [0.25, -0.2, 0.9], rh: [-0.3, -0.25, 0.9] }, 3.6, { yaw: PI }), k(1.6, { base: 'kneel', p: [0, 0.4, 0], lh: [0.2, -0.15, 0.85], rh: [-0.3, -0.2, 0.85] }, 3.6, { yaw: PI })],
    D: [kd(0, 'ready', G), kd(0.35, 'stagger', G + 0.2), kd(0.75, { base: 'proneUp', pr: [-0.35, 0, 0], p: [0, 0.18, 0], lf: [0.4, -0.95, 0.1], rf: [-0.4, -0.95, 0.1], hr: [-0.3, 0, 0], lh: [0.4, 0.2, 0.6], rh: [-0.4, 0.2, 0.6] }, G + 0.2, { yaw: PI, ease: 'in' }),
      kd(1.6, { base: 'proneUp', pr: [-0.4, 0, 0], p: [0, 0.18, 0], lf: [0.4, -0.95, 0.1], rf: [-0.4, -0.95, 0.1], hr: [-0.4, 0, 0], lh: [0.4, 0.25, 0.6], rh: [-0.4, 0.25, 0.6] }, G + 0.2, { yaw: PI })],
    fx: [{ t: 0.78, hit: 1 }, { t: 0.78, cam: 'hold' }],
  }),
};

const TECHNICAL = {
  /* an Irish whip into the ropes and a drop on the rebound */
  whip: (c) => ({
    dur: 2.0,
    A: [k(0, 'ready', 0), k(0.25, 'grapple', 0.8), k(0.45, 'whip', 0.6), k(1.15, 'ready', 0.6), k(1.32, 'clothes', 1.1, { ease: 'snap' }), k(2.0, 'ready', 1.0)],
    D: [kd(0, 'ready', G), kd(0.25, 'guard', 1.75), kd(0.5, 'run', c.fwd * 0.5, { yaw: 0 }), kd(0.75, 'ropes', c.fwd, { yaw: 0 }), kd(0.88, 'run', c.fwd - 0.4), kd(1.25, 'run', 2.3),
      ...bumpBack(1.32, 2.0, 0.9, { dur: 0.36, air: 1.2, yaw: PI }), kd(2.0, 'prone', 0.9)],
    fx: [{ t: 0.76, rope: 'front', s: 0.9 }, { t: 1.32, hit: 1 }, { t: 1.68, dust: 'D' }, { t: 1.68, shake: 0.5 }],
  }),
  /* the snap suplex: a fast arc, no hang time */
  snap: () => ({
    dur: 1.35,
    A: [k(0, 'ready', 0), k(0.25, 'lockup', 0.9), k(0.5, 'lift', 0.75, { pr: [-0.4, 0, 0] }), k(0.74, 'prone', 0.3, { ease: 'in' }), k(1.35, 'proneUp', 0.3)],
    D: [kd(0, 'ready', G), kd(0.25, 'lockup', 1.9), kd(0.5, { base: 'vert', pr: [PI * 0.7, 0, 0] }, 0, { on: 'chest', off: [0.3, 1.2, 0] }), kd(0.76, 'prone', -1.4, { ease: 'in' }), kd(1.35, 'prone', -1.5)],
    fx: [{ t: 0.76, hit: 1 }, { t: 0.76, dust: 'D' }, { t: 0.76, shake: 0.6 }],
  }),
  /* the arm drag: a spin and a flip, and he lands on his back */
  armdrag: () => ({
    dur: 1.35,
    A: [k(0, 'ready', 0), k(0.25, 'lockup', 0.9), k(0.55, 'kneel', 1.2, { yaw: -0.8 }), k(1.35, 'ready', 1.0, { yaw: 0 })],
    D: [kd(0, 'ready', G), kd(0.25, 'lockup', 1.9), kd(0.45, { base: 'dive', pr: [-0.8, 0, 0] }, 1.6, { y: 1.6, ease: 'out', yaw: PI * 0.5 }), kd(0.65, 'prone', 0.5, { ease: 'in', yaw: PI * 0.2 }), kd(1.35, 'proneUp', 0.6, { yaw: PI * 0.2 })],
    fx: [{ t: 0.65, hit: 1 }, { t: 0.65, dust: 'D' }, { t: 0.65, shake: 0.5 }],
  }),
};

const HARDCORE = {
  /* chops into the corner, then the boots go in */
  stomps: () => ({
    dur: 1.9,
    A: [k(0, 'ready', 0), k(0.2, 'wind', 0.2), k(0.34, 'chop', 0.6, { ease: 'snap' }), k(0.7, 'ready', 0.9), k(0.9, 'stomp', 1.3), k(1.05, 'ready', 1.3, { ease: 'snap' }), k(1.2, 'stomp', 1.3), k(1.35, 'ready', 1.3, { ease: 'snap' }), k(1.9, 'ready', 1.0)],
    D: [kd(0, 'ready', G), kd(0.34, 'ready', G), kd(0.4, 'reel', G + 0.4, { ease: 'snap' }), ...bumpBack(0.6, G + 0.4, G + 0.5, { dur: 0.25, air: 0.3 }), kd(1.9, 'prone', G + 0.5, { yaw: PI })],
    fx: [{ t: 0.35, hit: 2 }, { t: 0.35, shake: 0.4 }, { t: 1.05, shake: 0.4 }, { t: 1.35, shake: 0.5 }, { t: 1.35, dust: 'D' }],
  }),
};

const SHOWMAN = {
  showoff: () => ({
    dur: 2.1,
    A: [k(0, 'ready', 0), k(0.3, 'taunt', -0.4, { yaw: 0.9 }), k(0.85, 'point', -0.3, { yaw: 0.2 }), k(1.25, 'run', 0.9), k(1.42, 'strike', 0.7, { ease: 'snap' }), k(2.1, 'celebrate', 0.6)],
    D: [kd(0, 'ready', G), kd(1.42, 'ready', G), kd(1.48, 'reel', G + 0.6, { ease: 'snap' }), kd(2.1, 'stagger', G + 0.9)],
    fx: [{ t: 0.4, cam: 'face' }, { t: 1.43, hit: 1 }, { t: 1.43, shake: 0.4 }],
  }),
};

export const FAMILIES = { strike: STRIKES, runner: RUNNERS, slam: SLAMS, suplex: SUPLEXES, aerial: AERIALS, submission: HOLDS, technical: TECHNICAL, hardcore: HARDCORE, showman: SHOWMAN };

/* the move's name picks the variant: a few words that mean one picture */
const BY_NAME = [
  [/spear|tackle|gore/i, 'runner', 'spear'], [/drop ?kick|missile/i, 'runner', 'dropkick'], [/boot|kick ?to|superkick/i, 'runner', 'bigboot'],
  [/lariat|clothesline/i, 'runner', 'clothesline'],
  [/power ?bomb|sitout|bomb/i, 'slam', 'powerbomb'], [/pile ?driver|tombstone/i, 'slam', 'piledriver'], [/ddt|facebuster|driver/i, 'slam', 'ddt'],
  [/press/i, 'slam', 'press'], [/slam/i, 'slam', 'bodyslam'],
  [/german|release/i, 'suplex', 'german'], [/belly|overhead/i, 'suplex', 'belly'], [/snap/i, 'technical', 'snap'], [/suplex/i, 'suplex', 'vertical'],
  [/moonsault|shooting star|450|flip/i, 'aerial', 'moonsault'], [/elbow|headbutt/i, 'aerial', 'elbow'], [/splash|frog|senton/i, 'aerial', 'splash'],
  [/crab|sharpshoot|boston|scorpion/i, 'submission', 'crab'], [/chin|sleeper|choke|crossface|dragon|lock/i, 'submission', 'chinlock'], [/arm ?bar|key ?lock|kimura/i, 'submission', 'armbar'],
  [/arm ?drag|hurricanrana|rana/i, 'technical', 'armdrag'], [/whip|irish/i, 'technical', 'whip'],
  [/chop/i, 'strike', 'chop'], [/kick/i, 'strike', 'kick'], [/forearm|elbow smash|uppercut/i, 'strike', 'forearm'],
  [/stomp|curb/i, 'hardcore', 'stomps'],
];

/* pick a clip: the family the game chose, the variant the name asks for if it
   belongs to that family (or to a family that looks right for it), else a
   variant chosen off the name so the same move always looks the same */
export function pick(family, name) {
  const fam = FAMILIES[family] ? family : 'strike';
  for (const [re, f, v] of BY_NAME) {
    if (re.test(name || '') && (f === fam || COMPAT[fam] && COMPAT[fam].includes(f))) return { family: f, variant: v, make: FAMILIES[f][v] };
  }
  const vs = Object.keys(FAMILIES[fam]); let h = 0; for (const ch of String(name || family)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const v = vs[h % vs.length];
  return { family: fam, variant: v, make: FAMILIES[fam][v] };
}
const COMPAT = { strike: ['runner', 'strike'], runner: ['runner', 'strike'], slam: ['slam', 'suplex'], suplex: ['suplex', 'slam', 'technical'],
  technical: ['technical', 'suplex', 'submission'], submission: ['submission'], aerial: ['aerial'], hardcore: ['hardcore', 'strike'], showman: ['showman', 'strike', 'runner'] };

export function allClips() { const out = []; for (const f in FAMILIES) for (const v in FAMILIES[f]) out.push([f, v]); return out; }
