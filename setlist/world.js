/* THE WORLD: everything the stage is built from, and nothing that moves.
 *
 * The camera, the solids and the grid they are splatted into, the chibi person, the band and their
 * gear, and the venue's two painted layers (what stands behind the band, and the gear in front of
 * it). Moved out of stage.js on 2026-10-27, unchanged, so that three things can share one source:
 *
 *   stage.js         draws the night (light, crowd, band motion) over these layers
 *   world-worker.js  builds a room's layers off the main thread, so a show opens without a stall
 *   the menus        stand the same band, in the same frames, behind Segue's own screens
 *
 * It is a builder and nothing else. It reads no song, no score and no rule, and
 * scripts/setlist/check_data.mjs holds that line for this file as it does for stage.js.
 */
import PXHD from './pxhd.js?v=2';

// ── the camera ─────────────────────────────────────────────────────────────
const ART = 0.2;                       // feet per pixel
const ELEV = 42, D2R = Math.PI / 180;
const SE = Math.sin(ELEV * D2R), CE = Math.cos(ELEV * D2R);
const X0 = -48, X1 = 48;               // the world, west to east, in feet
const WPX = Math.round((X1 - X0) / ART);
/* The world reaches 120 rows higher than it used to, so the trees behind the stage stand whole and the
   sky shows over them. Everything above the treeline is left empty, and the sky is drawn into it. */
const OY = 270, HPX = 520;             // pixel row of y=0,z=0, and the world's height in pixels
const sx = x => (x - X0) / ART;
const sy = (y, z) => (y * SE - z * CE) / ART + OY;
const depth = (y, z) => y * CE + z * SE;
// A world normal, turned into the screen's frame, which is what PXHD lights.
const camN = (nx, ny, nz) => {
  const v0 = nx, v1 = -nz * CE + ny * SE, v2 = nz * SE + ny * CE, l = Math.hypot(v0, v1, v2) || 1;
  return [v0 / l, v1 / l, v2 / l];
};

// ── colour ─────────────────────────────────────────────────────────────────
const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
function hash(x, y, s){
  let h = (x * 374761393 + y * 668265263 + s * 982451653) | 0;
  h = Math.imul(h ^ h >>> 13, 1274126177);
  return ((h ^ h >>> 16) >>> 0) / 4294967296;
}
function mulberry32(a){
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
/* A canvas. In a worker there is no document, so the world is drawn into an OffscreenCanvas there:
   world-worker.js builds a room off the main thread with this same code. */
function canvas(w, h){
  if (typeof document === 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}

/* Materials. 'x:' is an ordinary surface on PXHD's ramp, 'k:' skin, 'h:' hair, and 'f:' a flat colour
   that takes no light at all (pupils, a mouth). */
const rampCache = new Map();
function rampOf(c){
  const m = c.m;
  let r = rampCache.get(m);
  if (r) return r;
  const kind = m.slice(0, 2), hex = m.slice(2);
  r = kind === 'k:' ? PXHD.skinRamp(hex) : kind === 'h:' ? PXHD.hairRamp(hex)
    : kind === 'f:' ? hex : PXHD.ramp(hex);
  rampCache.set(m, r);
  return r;
}

// ── splatting solids into a grid ───────────────────────────────────────────
/* A grid of cells over some window of the world. `put` keeps the nearest surface for each cell, the
   z-buffer every 3D renderer has. A cell (i, j) is world pixel (i + ox, j + oy). The world itself is
   one big grid; a person is a small one. */
function Grid(w, h, ox, oy){
  this.S = new PXHD.Sprite(w, h);
  this.w = w; this.h = h; this.ox = ox; this.oy = oy;
  this.Z = new Float32Array(w * h).fill(-1e9);
}
Grid.prototype.put = function(x, y, z, m, n, o){
  const i = Math.floor(sx(x) - this.ox), j = Math.floor(sy(y, z) - this.oy);
  if (i < 0 || j < 0 || i >= this.w || j >= this.h) return;
  const D = depth(y, z), k = j * this.w + i;
  if (D <= this.Z[k]) return;
  this.Z[k] = D;
  const nn = camN(n[0], n[1], n[2]);
  this.S.g[j][i] = { m, n: () => nn, z: D, dt: (o && o.dt) || 0, gloss: (o && o.gloss) || 0,
    bias: (o && o.bias) || 0, t: null, tag: '', noCast: (o && o.noCast) || 0 };
};
const STEP = ART * 0.45;
const fn = mat => typeof mat === 'function' ? mat : () => mat;

/* A box: its top and its front, the two faces a camera above and in front of it can see. `mat` is a
   colour or a function of the point that answers one, which is how a rug or a grille gets its pattern. */
function box(G, x0, x1, y0, y1, z0, z1, mat, o){
  const m = fn(mat);
  for (let x = x0; x <= x1; x += STEP){
    for (let y = y0; y <= y1; y += STEP) G.put(x, y, z1, m(x, y, z1, 'top'), [0, 0, 1], o);
    for (let z = z0; z <= z1; z += STEP) G.put(x, y1, z, m(x, y1, z, 'front'), [0, 1, 0], o);
  }
}
/* An ellipsoid, sampled over its whole surface. `cut(u, v, w)` is asked in the ellipsoid's own unit
   frame, so hair can cover the back and top of a head and leave the face. */
function ell(G, cx, cy, cz, rx, ry, rz, mat, o, cut){
  const m = fn(mat);
  const R = Math.max(rx, ry, rz), nT = Math.ceil(2 * Math.PI * R / STEP), nP = Math.ceil(Math.PI * R / STEP);
  for (let a = 0; a <= nP; a++){
    const ph = a / nP * Math.PI, sp = Math.sin(ph), cp = Math.cos(ph);
    const nt = Math.max(4, Math.ceil(nT * sp));
    for (let b = 0; b < nt; b++){
      const th = b / nt * 2 * Math.PI, u = sp * Math.cos(th), v = sp * Math.sin(th), w = cp;
      if (cut && !cut(u, v, w)) continue;
      const x = cx + u * rx, y = cy + v * ry, z = cz + w * rz;
      G.put(x, y, z, m(x, y, z, u, v, w), [u / rx, v / ry, w / rz], o);
    }
  }
}
/* A capsule from a to b: limbs, poles, a guitar's neck, a drumstick. */
function cap(G, a, b, r, mat, o){
  const m = fn(mat);
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...d) || 1e-6;
  const u = d.map(v => v / L);
  const t0 = Math.abs(u[2]) < .9 ? [0, 0, 1] : [1, 0, 0];
  let p = [u[1] * t0[2] - u[2] * t0[1], u[2] * t0[0] - u[0] * t0[2], u[0] * t0[1] - u[1] * t0[0]];
  const pl = Math.hypot(...p); p = p.map(v => v / pl);
  const q = [u[1] * p[2] - u[2] * p[1], u[2] * p[0] - u[0] * p[2], u[0] * p[1] - u[1] * p[0]];
  const nl = Math.max(1, Math.ceil(L / STEP)), nc = Math.max(6, Math.ceil(2 * Math.PI * r / STEP));
  for (let i = 0; i <= nl; i++){
    const t = i / nl, c = [a[0] + d[0] * t, a[1] + d[1] * t, a[2] + d[2] * t];
    for (let k = 0; k < nc; k++){
      const th = k / nc * 2 * Math.PI, cs = Math.cos(th), sn = Math.sin(th);
      const n = [p[0] * cs + q[0] * sn, p[1] * cs + q[1] * sn, p[2] * cs + q[2] * sn];
      const x = c[0] + n[0] * r, y = c[1] + n[1] * r, z = c[2] + n[2] * r;
      G.put(x, y, z, m(x, y, z), n, o);
    }
  }
  for (const e of [a, b]) ell(G, e[0], e[1], e[2], r, r, r, mat, o);
}
/* A standing cylinder: a drum shell, a tree trunk, a light pole. */
function cyl(G, cx, cy, r, z0, z1, side, top, o){
  const ms = fn(side);
  const nc = Math.max(8, Math.ceil(2 * Math.PI * r / STEP));
  for (let z = z0; z <= z1; z += STEP){
    for (let k = 0; k < nc; k++){
      const th = k / nc * 2 * Math.PI, nx = Math.cos(th), ny = Math.sin(th);
      G.put(cx + nx * r, cy + ny * r, z, ms(cx + nx * r, cy + ny * r, z, th), [nx, ny, 0], o);
    }
  }
  if (top){
    const mt = fn(top);
    for (let x = -r; x <= r; x += STEP) for (let y = -r; y <= r; y += STEP)
      if (x * x + y * y <= r * r) G.put(cx + x, cy + y, z1, mt(x, y), [0, 0, 1], o);
  }
}

function paint(G){
  const c = canvas(G.w, G.h);
  G.S.paint(c.getContext('2d'), 1, rampOf);
  return c;
}

// ── people ─────────────────────────────────────────────────────────────────
/* A chibi person, the putt putt world's proportions: a big round head on a small body, about five and
   a half feet in all. Built facing you (+y); a person seen from behind is the same person turned. */
const SKINS = ['#f2cfae', '#e3b48b', '#c58c5e', '#9a6644', '#6e4630'];
const HAIRS = ['#3a2a22', '#6b4428', '#a87a44', '#22202a', '#d8b47a', '#8e3a26', '#b4b4bc'];
const SHIRTS = ['#e8505f', '#3f86d8', '#f2efe6', '#4fb36e', '#9b5fd0', '#2e3140', '#ef8a3c', '#2fb3c0',
  '#c7c065', '#7d5a44', '#ec7aa8', '#5fc4a0'];
const DYE = ['#f05a7e', '#ffd04a', '#4ac0e6', '#9b5ff0', '#5fd47a'];

/* `facing` turns the model about its feet: 0 faces you, PI is its back to you, and a quarter turn
   either way is side on. Only quarter turns, so an ellipsoid's radii simply swap. */
function turnOf(facing){ return typeof facing === 'number' ? facing : facing ? Math.PI : 0; }
/* How far a person sitting on the grass drops: everything above the hips comes down this many feet. */
const GROUND_DROP = 1.25;
function personParts(G, P, pose, facing){
  const th = turnOf(facing), cs = Math.round(Math.cos(th)), sn = Math.round(Math.sin(th)), swap = sn !== 0;
  const dz = pose.ground ? GROUND_DROP : 0;
  const T = (x, y, z) => [x * cs - y * sn, x * sn + y * cs, z - dz];
  const E = (x, y, z, rx, ry, rz, m, o, cut) => {
    const [a, b, c] = T(x, y, z);
    ell(G, a, b, c, swap ? ry : rx, swap ? rx : ry, rz, m, o, cut ? (u, v, w) => cut(u * cs + v * sn, -u * sn + v * cs, w) : null);
  };
  const C = (a, b, r, m, o) => cap(G, T(...a), T(...b), r, m, o);
  const skin = 'k:' + P.skin, hair = 'h:' + P.hair, shoes = 'x:' + P.shoes;
  /* A painted suit: cream canvas with marker doodles all over it, the way the keys player's is. */
  const doodle = base => (x, y, z) => {
    const h = hash(Math.floor(x * 5) + 40, Math.floor(z * 5) + Math.floor(y * 5) * 9, 21);
    return 'x:' + (h < .13 ? ['#d8402e', '#3f8a4a', '#3a62c4', '#e08a2a', '#7a4ab0'][(h * 100 | 0) % 5] : base);
  };
  const pants = P.doodle ? doodle(P.pants) : 'x:' + P.pants;
  const shirt = P.doodle ? doodle(P.shirt) : P.dye
    ? (x, y, z) => 'x:' + DYE[(Math.floor(Math.hypot(x, z - 2.3) * 3.2 + P.dye) % DYE.length + DYE.length) % DYE.length]
    : P.stripe ? (x, y, z) => 'x:' + (Math.floor(z * 3) % 2 ? P.shirt : P.stripe)
    : 'x:' + P.shirt;
  // Legs and shoes. Sitting, the thighs run forward and the shins drop to the deck.
  if (pose.ground){
    // On the grass: knees up, feet out in front. Written in standing feet, so they add the drop back.
    for (const s2 of [-1, 1]){
      C([s2 * .38, 0, 1.45], [s2 * .42, .9, 1.95], .3, pants);
      C([s2 * .42, .9, 1.95], [s2 * .38, 1.45, dz + .3], .28, pants);
      E(s2 * .38, 1.6, dz + .2, .32, .45, .22, shoes, { gloss: 1 });
    }
  } else if (pose.seated){
    for (const s2 of [-1, 1]){
      C([s2 * .38, 0, 1.45], [s2 * .38, .95, 1.45], .3, pants);
      C([s2 * .38, .95, 1.45], [s2 * .38, .95, .35], .28, pants);
      E(s2 * .38, 1.07, .2, .32, .45, .22, shoes, { gloss: 1 });
    }
  } else {
    /* `step` walks: -1 or 1 puts one foot forward and lifted and the other back. Zero, or none, is the
       square stance every other pose stands in, drawn exactly as it always was. */
    const sp = pose.step || 0;
    if (!sp){
      C([-.38, 0, .35], [-.38, 0, 1.55], .3, pants);
      C([.38, 0, .35], [.38, 0, 1.55], .3, pants);
      E(-.38, .12, .2, .32, .45, .22, shoes, { gloss: 1 });
      E(.38, .12, .2, .32, .45, .22, shoes, { gloss: 1 });
    } else for (const s2 of [-1, 1]){
      const f = sp * s2, up = Math.max(0, f) * .24;
      C([s2 * .38, 0, 1.55], [s2 * .38, f * .34, .35 + up], .3, pants);
      E(s2 * .38, .12 + f * .34, .2 + up, .32, .45, .22, shoes, { gloss: 1 });
    }
  }
  // Body.
  E(0, 0, 2.3, .78, .55, .92, shirt);
  if (P.vest) E(0, .02, 2.35, .8, .57, .86, 'x:' + P.vest, {}, (u, v, w) => Math.abs(u) > .35 && v > -.2);
  // Head, neck, ears.
  C([0, 0, 3.1], [0, 0, 3.4], .25, skin);
  E(0, 0, 4.25, 1.18, 1.08, 1.12, skin);
  E(-1.12, 0, 4.15, .2, .22, .28, skin);
  E(1.12, 0, 4.15, .2, .22, .28, skin);
  // Hair: over the top and back of the head; longer styles fall behind the shoulders.
  const cut = { long: (u, v, w) => w > .1 || v < 0, curly: (u, v, w) => w > -.1 || v < .1 }[P.style]
    || ((u, v, w) => w > .15 || v < -.2);
  if (P.style === 'shag'){
    // A big shag of curls: over the brow and down past the ears, the face left open.
    // Two tones of brown so the curls read as curls rather than a helmet.
    const curl = (x, y, z) => 'h:' + (hash(Math.floor(x * 6) + 60, Math.floor(z * 6) + Math.floor(y * 6) * 5, 33) < .35
      ? PXHD.mix(P.hair, '#c08a52', .35) : P.hair);
    E(0, -.02, 4.32, 1.26, 1.16, 1.18, curl, {}, (u, v, w) => w > .32 || v < -.1 || (Math.abs(u) > .78 && (v < .3 || w > .05)));
    E(0, -.25, 4.42, 1.38, 1.2, 1.24, curl, {}, (u, v, w) => v < 0 || w > .55);
  } else if (P.style !== 'bald') E(0, -.02, 4.32, 1.24, 1.14, 1.16, hair, {}, cut);
  if (P.style === 'long') E(0, -.55, 3.35, 1.05, .5, 1.05, hair);
  if (P.style === 'curly') E(0, -.05, 4.45, 1.42, 1.3, 1.25, hair, {}, (u, v, w) => w > -.25 || v < 0);
  if (P.style === 'bun') E(0, -.5, 5.35, .45, .45, .42, hair);
  if (P.style === 'pony') C([0, -.95, 4.6], [0, -1.2, 3.5], .26, hair);
  if (P.beard) E(0, .45, 3.75, .95, .7, .62, hair, {}, (u, v, w) => v > .1 && w < .25);
  // Hats.
  if (P.hat){
    const hm = 'x:' + P.hatC;
    if (P.hat === 'brim'){ E(0, 0, 5.05, 1.62, 1.5, .13, hm); E(0, 0, 5.35, 1.05, .98, .62, hm, {}, (u, v, w) => w > -.1); }
    else if (P.hat === 'bucket'){ E(0, 0, 4.85, 1.6, 1.5, .2, hm); E(0, 0, 5.05, 1.12, 1.05, .6, hm, {}, (u, v, w) => w > -.1); }
    else if (P.hat === 'beanie') E(0, -.02, 4.5, 1.27, 1.17, 1.2, hm, {}, (u, v, w) => w > .2);
    else {
      E(0, -.02, 4.5, 1.26, 1.16, 1.18, hm, {}, (u, v, w) => w > .22);
      E(0, (P.hat === 'capback' ? -1 : 1) * 1.1, 4.82, .82, .62, .1, hm);
    }
  }
  // Arms. A pose is two hands; the elbow sits halfway, pushed a little outward.
  const arm = (s, hand) => {
    const sh = [s * .72, 0, 2.95], mid = [(sh[0] + hand[0]) / 2 + s * .25, (sh[1] + hand[1]) / 2, (sh[2] + hand[2]) / 2];
    C(sh, mid, .24, P.sleeveless ? skin : shirt);
    C(mid, hand, .21, skin);
    E(hand[0], hand[1], hand[2], .24, .24, .24, skin);
  };
  arm(-1, pose.L);
  arm(1, pose.R);
  if (pose.extra) pose.extra(E, C, T, G);
}

/* Two dots and a mouth, set onto the face after it is drawn, the way the golf golfer gets its own.
   Turned side on, only the near eye shows. Glasses are a dark rim either side of an eye; a mustache
   is a short dark bar over the mouth. */
function face(G, P, facing, dz = 0){
  const th = turnOf(facing), cs = Math.round(Math.cos(th)), sn = Math.round(Math.sin(th));
  const at = (x, y, z) => { const wx = x * cs - y * sn, wy = x * sn + y * cs;
    return { i: Math.floor(sx(wx) - G.ox), j: Math.floor(sy(wy, z - dz) - G.oy), seen: wy > .25 }; };
  const rim = 'f:#241c22';
  for (const s of [-1, 1]){
    const e = at(s * .42, 1.02, 4.25);
    if (!e.seen) continue;
    if (P.glasses){ G.S.set(e.i - 1, e.j, rim, 0, { noCast: 1 }); G.S.set(e.i + 1, e.j, rim, 0, { noCast: 1 }); G.S.set(e.i, e.j - 1, rim, 0, { noCast: 1 }); }
    G.S.set(e.i, e.j, 'f:#2a1c22', 0, { noCast: 1 });
  }
  if (P.mustache){
    for (const dx of [-.3, 0, .3]){ const m = at(dx, 1.06, 3.86); if (m.seen) G.S.set(m.i, m.j, 'f:' + PXHD.mix(P.hair, '#000000', .25), 0, { noCast: 1 }); }
  } else if (!P.beard){
    const m = at(0, 1.05, 3.72);
    if (m.seen) G.S.set(m.i, m.j, 'f:' + PXHD.mix(P.skin, '#7a2a34', .35), 0, { noCast: 1 });
  }
}

/* A person as a sprite: drawn into their own small grid and painted. (PAX, PAY) is the cell their
   feet stand on, so they can be stood anywhere in the world. */
const PW = 34, PH = 46, PAX = 17, PAY = 38;
function personSprite(P, pose, facing){
  const G = new Grid(PW, PH, sx(0) - PAX, OY - PAY);
  personParts(G, P, pose, facing);
  if (Math.cos(turnOf(facing)) > -.5) face(G, P, facing, pose.ground ? GROUND_DROP : 0);
  return paint(G);
}

// Poses, as hand positions in feet about the feet, facing you.
const CROWD_POSES = {
  down:  { L: [-.95, .15, 1.75], R: [.95, .15, 1.75] },
  up:    { L: [-1.05, .1, 5.9], R: [1.05, .1, 5.9] },
  one:   { L: [-.95, .15, 1.75], R: [1.0, .15, 6.1] },
  clap:  { L: [-.25, .4, 5.7], R: [.25, .4, 5.7] },
  phone: { L: [-.95, .15, 1.75], R: [.85, .2, 5.6], extra: (E) => E(.85, .2, 6.05, .22, .1, .32, 'x:#2a2c36') },
  // On the grass for a ballad, or the set break: hands on the knees. Written in standing feet.
  sit:   { ground: true, L: [-.62, .95, 2.15], R: [.62, .95, 2.15] },
};
/* A glow stick held up in the encore, in one of four colours the person keeps all night. The stage
   adds the glow round it; the stick itself is painted like everything else. */
const GLOWS = ['#8cff6a', '#ff6ad8', '#6af0ff', '#ffe96a'];
const GLOW_HAND = [1.0, .15, 6.1];
function glowPose(v){
  const col = 'x:' + GLOWS[v.glow | 0];
  return { L: [-.95, .15, 1.75], R: GLOW_HAND, extra: (E, C) => C([1.0, .15, 6.2], [1.08, .15, 7.3], .16, col) };
}
/* A sign is a board over the head, held in both hands, drawn on the person's own grid so it is lit
   and outlined like everything else. */
function signPose(v){
  return { L: [-1.0, .1, 5.7], R: [1.0, .1, 5.7], extra: (E, C, T, G) => {
    for (let x = -1.7; x <= 1.7; x += STEP) for (let z = 5.7; z <= 7.4; z += STEP){
      const [a, b] = T(x, .15, z);
      const col = Math.abs(z - 6.85) < .18 && Math.abs(x) < 1.3 ? v.sign[0]
        : Math.abs(z - 6.25) < .14 && Math.abs(x + .2) < 1.0 ? v.sign[1] : '#f6f1e4';
      G.put(a, b, z, 'x:' + col, [0, 1, 0], { noCast: 1 });
    }
  } };
}

function crowdVariant(rand){
  const pick = a => a[(rand() * a.length) | 0];
  const top = rand();
  return {
    skin: pick(SKINS), hair: pick(HAIRS),
    style: pick(['short', 'short', 'long', 'bun', 'curly', 'pony', 'bald', 'long']),
    hat: rand() < .32 ? pick(['cap', 'capback', 'bucket', 'beanie', 'brim']) : null, hatC: pick(SHIRTS),
    shirt: pick(SHIRTS), dye: top < .3 ? 1 + ((rand() * 4) | 0) : 0, stripe: top > .85 ? pick(SHIRTS) : null,
    pants: pick(['#4a5a7e', '#3b4258', '#6b5a48', '#2e2e38', '#8a7a62']), shoes: pick(['#f0ece2', '#2e2a30', '#c0473c']),
    sign: [pick(SHIRTS), pick(SHIRTS)],
  };
}

// ── the band ───────────────────────────────────────────────────────────────
const BAND = {
  /* Keys sits on a stool inside three boards (one each side and one behind) and turns between them,
     and for some songs stands up with a red guitar. Big curls, round glasses, a mustache, and the
     painted cream suit. */
  keys:   { x: -9, y: -8.0, z: 4, stand: { x: -9, y: -6.3 }, axe: '#c8302c', bass: false,
    look: { skin: SKINS[1], hair: '#5a3a24', style: 'shag', glasses: true, mustache: true, doodle: true,
      shirt: '#efe6cf', pants: '#e8dec4', shoes: '#3a2e28' } },
  guitar: { x: -3, y: -4.6, z: 4, look: { skin: SKINS[1], hair: HAIRS[0], style: 'short', beard: true, hat: 'capback', hatC: '#ece6d8',
    shirt: '#9cc0e8', dye: 2, pants: '#6b5640', shoes: '#4a3e36' }, axe: '#f2e8d8', bass: false },
  bass:   { x: 2.6, y: -5.6, z: 4, look: { skin: SKINS[0], hair: HAIRS[4], style: 'long', shirt: '#c9c9d2', pants: '#2c3044', shoes: '#2a2a30' },
    axe: '#b04a32', bass: true },
  drums:  { x: 8.4, y: -10.4, z: 5.2, look: { skin: SKINS[1], hair: HAIRS[0], style: 'short', beard: true, hat: 'brim', hatC: '#5a4a40',
    shirt: '#3d5878', vest: '#5a7da6', sleeveless: true, pants: '#30303a', shoes: '#2a2a30' } },
};

function guitarExtra(m){
  return (E, C) => {
    E(-.2, .8, 2.0, .98, .22, .74, 'x:' + m.axe, { gloss: 1 });
    E(-.62, .96, 1.95, .36, .1, .3, 'x:' + (m.bass ? '#2a2226' : '#f8f4ea'));
    const tip = m.bass ? [2.25, .85, 3.75] : [1.85, .85, 3.4];
    C([.5, .88, 2.25], tip, .12, 'x:#8a5a34');
    E(tip[0] + .12, tip[1], tip[2] + .1, .2, .08, .14, 'x:' + (m.bass ? '#2a2226' : '#efe6d4'));
  };
}
/* The keys player's four places: a board to his right, one to his left, one behind him, and the red
   guitar. Two frames a board, hands rising and falling; the guitar strums like the other two. */
const KEY_TURN = { right: -Math.PI / 2, left: Math.PI / 2, back: Math.PI };
function keysFrames(){
  const k = BAND.keys, out = {};
  for (const [st2, th] of Object.entries(KEY_TURN)){
    out[st2] = [0, 1].map(f => personSprite(k.look, { seated: true,
      L: [-.5, 1.18, f ? 2.62 : 2.75], R: [.5, 1.18, f ? 2.75 : 2.62] }, th));
  }
  out.guitar = [0, 1, 2, 3].map(f => personSprite(k.look, {
    L: [1.15, .9, 2.85], R: [-.55, .95, [2.25, 1.85, 2.15, 2.45][f]], extra: guitarExtra(k) }, 0));
  return out;
}
// Which of his four places he is at, song by song. Mostly keys, the guitar now and then.
const KEY_SEQ = ['right', 'left', 'right', 'back', 'guitar', 'left', 'back', 'right', 'left', 'guitar'];

function bandFrames(){
  const strum = (m, f) => ({ L: [m.bass ? 1.4 : 1.15, .9, m.bass ? 3.05 : 2.85],
    R: [-.55, .95, [2.25, 1.85, 2.15, 2.45][f]], extra: guitarExtra(m) });
  const g = m => [0, 1, 2, 3].map(f => personSprite(m.look, strum(m, f), false));
  const down = CROWD_POSES.down, up = CROWD_POSES.up;
  const stick = (hand, up, C) => C(hand, [hand[0] * .6, hand[1] + 1.1, hand[2] + (up ? .9 : -.2)], .07, 'x:#e0c08a');
  const D = [[[-1.0, .9, 2.6], [1.0, .9, 3.6]], [[-1.0, .9, 3.6], [1.0, .9, 2.6]], [[-1.05, .9, 3.0], [1.05, .9, 3.0]], [[-1.2, .7, 4.6], [1.2, .7, 4.6]]];
  return {
    guitar: g(BAND.guitar),
    bass: g(BAND.bass),
    keys: keysFrames(),
    drums: D.map(([l, r], f) => personSprite(BAND.drums.look, {
      L: l, R: r, extra: (E, C) => { stick(l, f !== 0 && f !== 2, C); stick(r, f === 0 || f === 3, C); } }, false)),
    /* Walking on, off, to the front and back: two steps each, the strings still holding their
       instruments. The keys player walks with his hands free, and the drummer without his sticks. */
    walk: {
      guitar: [-1, 1].map(st => personSprite(BAND.guitar.look, Object.assign(strum(BAND.guitar, 0), { step: st }), 0)),
      bass: [-1, 1].map(st => personSprite(BAND.bass.look, Object.assign(strum(BAND.bass, 0), { step: st }), 0)),
      keys: [-1, 1].map(st => personSprite(BAND.keys.look, Object.assign({}, down, { step: st }), 0)),
      drums: [-1, 1].map(st => personSprite(BAND.drums.look, Object.assign({}, down, { step: st }), 0)),
    },
    // In a jam the guitar and the bass turn to each other: the guitar east, the bass west.
    face: {
      guitar: [0, 1, 2, 3].map(f => personSprite(BAND.guitar.look, strum(BAND.guitar, f), -Math.PI / 2)),
      bass: [0, 1, 2, 3].map(f => personSprite(BAND.bass.look, strum(BAND.bass, f), Math.PI / 2)),
    },
    // The bow: the two with their hands free throw them up.
    cheer: { keys: personSprite(BAND.keys.look, up, 0), drums: personSprite(BAND.drums.look, up, 0) },
  };
}

// ── the venue ──────────────────────────────────────────────────────────────
const DECK = { x0: -14, x1: 14, y0: -14.5, y1: 0, z: 4 };
/* The movers along the truss, west to east. */
const FIX = Array.from({ length: 10 }, (_, i) => -12.6 + i * 2.8);
/* The kit a room is built with: the stage's own solids and its painter, so every room is lit and
   outlined the way the lawn is. */
function kit(G, rand){
  /* A flat wall facing you at depth y, filled a screen pixel at a time rather than splatted: a back
     wall the width of the world is three quarters of a million samples through `box`, and this is
     one per pixel it covers. `fn(x, z)` answers its colour, or null to leave the pixel alone. */
  const wallN = camN(0, 1, 0), nWall = () => wallN;
  function wall(y, x0, x1, z0, z1, fn, o){
    const i0 = Math.max(0, Math.floor(sx(x0))), i1 = Math.min(G.w - 1, Math.ceil(sx(x1)));
    const j0 = Math.max(0, Math.floor(sy(y, z1))), j1 = Math.min(G.h - 1, Math.ceil(sy(y, z0)));
    for (let j = j0; j <= j1; j++){
      const z = (y * SE - (j + .5 - OY) * ART) / CE;
      if (z < z0 || z > z1) continue;
      const D = depth(y, z);
      for (let i = i0; i <= i1; i++){
        const x = X0 + (i + .5) * ART;
        if (x < x0 || x > x1) continue;
        const k = j * G.w + i;
        if (D <= G.Z[k]) continue;
        const col = fn(x, z);
        if (!col) continue;
        G.Z[k] = D;
        G.S.g[j][i] = { m: col.indexOf(':') === 1 ? col : 'x:' + col, n: nWall, z: D, dt: (o && o.dt) || 0,
          gloss: (o && o.gloss) || 0, bias: 0, t: null, tag: '', noCast: (o && o.noCast) || 0 };
      }
    }
  }
  return { G, rand, box, ell, cap, cyl, wall, hash, STEP, ART, X0, X1, DECK,
    up: camN(0, 0, 1), sx, sy, depth };
}

function buildBack(rand, R, RIG){
  const G = new Grid(WPX, HPX, 0, 0);
  const K = kit(G, rand);
  const up = K.up, nUp = () => up;
  // The ground, every cell, then everything else stood on it.
  const far = R.far == null ? -40 : R.far, dither = R.dither == null ? .12 : R.dither;
  for (let j = 0; j < HPX; j++){
    const y = (j + .5 - OY) * ART / SE;
    if (y < far) continue;
    for (let i = 0; i < WPX; i++){
      const x = X0 + (i + .5) * ART;
      const col = R.ground(K, x, y, i, j);
      if (!col) continue;
      G.S.g[j][i] = { m: col.indexOf(':') === 1 ? col : 'x:' + col, n: nUp, z: depth(y, 0),
        dt: hash(i >> 1, j >> 1, 9) < dither ? -1 : 0, gloss: 0, bias: 0, t: null, tag: '' };
      G.Z[j * WPX + i] = depth(y, 0);
    }
  }
  R.build(K);
  buildRig(G, RIG);
  return paint(G);
}

/* The four corners of a diamond pod, top, right, bottom and left, as [x, z]. */
function podCorners(cx, cz, r){ return [[cx, cz + r], [cx + r, cz], [cx, cz - r], [cx - r, cz]]; }

/* The stage house, sized to the room: the back wall, the light pods, the deck and its riser, the
   keys player's stool and third board, the amps, and the towers and truss where the room has them. */
function buildRig(G, RIG){
  // The stage house: the back wall, the deck, its skirt and the drum riser.
  box(G, -15.5, 15.5, -16, -14.8, 0, RIG.wallZ, RIG.wall || ((x, y, z, f) => 'x:' + (f === 'top' ? '#4a4652' : (Math.floor(x * 2) % 2 ? '#3a3742' : '#34313c'))));
  buildPods(G, RIG);
  box(G, DECK.x0, DECK.x1, DECK.y0, DECK.y1, 0, DECK.z, (x, y, z, f) => {
    if (f === 'front') return 'x:' + (Math.floor(x * 1.5) % 2 ? '#26232c' : '#2d2a34');
    // Planks running away from you, and the rug in the middle of them.
    if (Math.abs(x) < 6.5 && y > -9.5 && y < -1.2){
      if (Math.abs(x) > 6.1 || y < -9.1 || y > -1.6) return 'x:#6e2620';
      const d = Math.abs(x) * .8 + Math.abs(y + 5.35) * 1.4, b = Math.floor(d * 1.8) % 5;
      return 'x:' + (b === 0 ? '#e0a650' : b === 2 ? '#3a4a8a' : '#a83a2c');
    }
    return 'x:' + (Math.floor(x * 1.4) % 2 ? '#8a6a54' : '#7e604c');
  });
  box(G, 4.6, 12.6, -13.6, -7.6, DECK.z, DECK.z + 1.2, (x, y, z, f) => 'x:' + (f === 'top' ? '#5a4f62' : '#2e2a36'));
  // The keys player's third board, behind his stool, and the stool he turns on.
  // Longer than the other two, so its ends show past his curls from out front.
  keysBoard(G, BAND.keys.x, BAND.keys.y - 1.75, 'x', '#3a3e48', 5.4);
  cyl(G, BAND.keys.x, BAND.keys.y, .14, DECK.z, DECK.z + 1.3, 'x:#7a7a84', null);
  cyl(G, BAND.keys.x, BAND.keys.y, .62, DECK.z + 1.3, DECK.z + 1.5, 'x:#2a2a30', 'x:#3a3a42');
  // Amps along the back.
  for (const [x, w] of [[-4.6, 1.6], [-2.8, 1.6], [3.4, 2.2]]){
    box(G, x - w / 2, x + w / 2, -13.4, -12.4, DECK.z, DECK.z + 2.1, (px, py, pz, f) => f === 'top' ? 'x:#2e2b30'
      : 'x:' + ((Math.floor(pz * 6) % 2) ? '#5a524a' : '#4c4640'));
  }
  // Side towers, the PA hung off them, and the truss across the top.
  const TRUSS_Z = RIG.trussZ;
  if (RIG.towers) for (const s of [-1, 1]){
    for (const dy of [-.6, .6]) for (const dx of [-.6, .6]) cap(G, [s * 15.6 + dx, -.8 + dy, 0], [s * 15.6 + dx, -.8 + dy, TRUSS_Z], .12, 'x:#9ea0aa');
    for (let z = 1; z < TRUSS_Z; z += 1.4) cap(G, [s * 15.6 - .6, -.2, z], [s * 15.6 + .6, -.2, z + 1.2], .07, 'x:#8a8c96');
    box(G, s * 17.6 - 1.4, s * 17.6 + 1.4, -1.6, -.2, 9, 18.5, (x, y, z, f) => f === 'top' ? 'x:#3a3a42'
      : 'x:' + ((Math.floor(z * 2.2) % 3 === 0) ? '#4a4a54' : '#2c2c34'));
  }
  if (RIG.truss){
    for (const dy of [-.6, .6]) for (const dz of [-.5, .5]) cap(G, [-16.2, -.8 + dy, TRUSS_Z + dz], [16.2, -.8 + dy, TRUSS_Z + dz], .12, 'x:#a8aab4');
    for (let x = -16; x < 16; x += 1.2) cap(G, [x, -.2, TRUSS_Z - .5], [x + 1.1, -.2, TRUSS_Z + .5], .06, 'x:#8a8c96');
  } else {
    // No truss: a pipe along the top of the back wall carries the cans.
    cap(G, [-15, RIG.fixY, RIG.fixZ + .45], [15, RIG.fixY, RIG.fixZ + .45], .1, 'x:#6a6a74');
  }
  for (const fx of FIX) ell(G, fx, RIG.fixY, RIG.fixZ + .2, .35, .35, .4, 'x:#2a2a32', { gloss: 1 });
}

/* THE PODS. Each is a diamond of box truss hung on a chain: two chords along every edge with the
   lacing between them, a block at every corner, a mover under the bottom and side corners and one
   more hung in the middle. The pixels along the truss and the beams out of the movers are drawn every
   frame (podPixels, and the beams in frame()); this is only the steel. */
function buildPods(G, RIG){
  const Y = RIG.podY, r = RIG.podR, top = RIG.truss ? RIG.trussZ : RIG.wallZ;
  const rad = Math.max(.05, r * .04);
  for (const [cx, cz] of RIG.pods){
    const C = podCorners(cx, cz, r);
    cap(G, [cx, Y, cz + r + .3], [cx, Y, top], rad * .7, 'x:#55555e');
    for (let k = 0; k < 4; k++){
      const [ax, az] = C[k], [bx, bz] = C[(k + 1) % 4];
      for (const dy of [-.28, .28]) cap(G, [ax, Y + dy, az], [bx, Y + dy, bz], rad, 'x:#a8aab4');
      const n = Math.max(3, Math.round(Math.hypot(bx - ax, bz - az) / .55));
      for (let i = 0; i < n; i++){
        const u0 = i / n, u1 = (i + 1) / n;
        cap(G, [ax + (bx - ax) * u0, Y - .28, az + (bz - az) * u0], [ax + (bx - ax) * u1, Y + .28, az + (bz - az) * u1], rad * .55, 'x:#8a8c96');
      }
    }
    for (const [x, z] of C) box(G, x - .3, x + .3, Y - .32, Y + .32, z - .3, z + .3, 'x:#7a7c86');
    for (const [x, z] of [C[1], C[2], C[3]]) ell(G, x, Y + .1, z - .55, .34, .34, .38, 'x:#2a2a32', { gloss: 1 });
    ell(G, cx, Y + .1, cz, .4, .4, .44, 'x:#26262e', { gloss: 1 });
  }
}

/* A keyboard on an X stand at sitting height. `along` is the way its keys run: 'x' across the stage
   for the board behind him, 'y' toward you for the two either side of him. */
function keysBoard(G, x, y, along, body, L = 3.4){
  const Z = DECK.z, top = Z + 2.7, W = .95;
  const [hx, hy] = along === 'x' ? [L / 2, W / 2] : [W / 2, L / 2];
  box(G, x - hx, x + hx, y - hy, y + hy, top - .35, top, (px, py, pz, f) => {
    const a = along === 'x' ? px - x : py - y, c = along === 'x' ? py - y : px - x;
    if (f === 'top' && Math.abs(a) < L / 2 - .2 && Math.abs(c) < W / 2 - .18){
      const k = ((Math.floor(a * 5) % 7) + 7) % 7;
      return (k === 2 || k === 4 || k === 6) && c < .02 ? 'x:#26242a' : 'x:#f4f1ea';
    }
    return 'x:' + body;
  }, { gloss: 1 });
  const e = along === 'x' ? [[-L / 2 + .5, 0], [L / 2 - .5, 0]] : [[0, -1.2], [0, 1.2]];
  for (const [dx, dy] of e){
    cap(G, [x + dx - .3, y + dy, Z], [x + dx + .3, y + dy, top - .4], .07, 'x:#6a6a74');
    cap(G, [x + dx + .3, y + dy, Z], [x + dx - .3, y + dy, top - .4], .07, 'x:#6a6a74');
  }
}

/* What stands in front of a player: the keys rig, the kit, mic stands, wedges, the barricade. Drawn
   after the band so a player is behind their gear, the way they are on a real stage. */
function buildFront(){
  const G = new Grid(WPX, HPX, 0, 0);
  const Z = DECK.z;
  // The keys player's boards either side of him. The one behind him is in the back layer.
  keysBoard(G, BAND.keys.x + 1.65, BAND.keys.y, 'y', '#d23c3a');
  keysBoard(G, BAND.keys.x - 1.65, BAND.keys.y, 'y', '#2c2a32');
  // The kit: yellow shells, cymbals, and the kick facing you with a swirl painted on it.
  const yel = (x, y, z, th) => 'x:' + (Math.sin(th || 0) > .6 ? '#c9a218' : '#f4cc2c');
  const drum = (x, y, r, z0, z1) => cyl(G, x, y, r, z0, z1, yel, 'x:#efeadc', { gloss: 1 });
  const RZ = DECK.z + 1.2;
  drum(6.9, -8.6, .7, RZ + 1.6, RZ + 2.3); drum(9.7, -8.6, .7, RZ + 1.6, RZ + 2.3);
  drum(11.5, -7.8, .95, RZ, RZ + 1.8); drum(5.4, -7.6, .75, RZ + .8, RZ + 1.4);
  for (const [x, y, z, r] of [[5.6, -8.8, RZ + 3.4, 1.15], [11.6, -9.6, RZ + 3.9, 1.35], [4.6, -7.8, RZ + 2.0, .8], [12.6, -8.2, RZ + 3.0, 1.0]]){
    cap(G, [x, y, RZ], [x, y, z], .06, 'x:#9a9aa4');
    ell(G, x, y, z, r, r * .9, .07, 'x:#d8ae5a', { gloss: 2 });
  }
  // The kick lies on its side: a shell running toward you and the painted head at its end.
  const kx = 8.3, ky = -7.4, kz = RZ + 1.25, kr = 1.25;
  for (let y = ky - 1.6; y <= ky; y += STEP){
    for (let k = 0; k < 60; k++){
      const th = k / 60 * 2 * Math.PI, nx = Math.cos(th), nz = Math.sin(th);
      G.put(kx + nx * kr, y, kz + nz * kr, 'x:' + (nz < -.4 ? '#c9a218' : '#f4cc2c'), [nx, 0, nz], { gloss: 1 });
    }
  }
  for (let x = -kr; x <= kr; x += STEP) for (let z = -kr; z <= kr; z += STEP){
    const d = Math.hypot(x, z);
    if (d > kr) continue;
    let m;
    if (d > kr - .22) m = 'x:#f4cc2c';
    else {
      const a = Math.atan2(z, x) + d * 2.4;
      m = 'x:' + ['#e8573c', '#3c62d6', '#4ec4d8', '#f6ecd4'][((Math.floor(a / 1.1) % 4) + 4) % 4];
    }
    G.put(kx + x, ky + .02, kz + z, m, [0, 1, 0], { gloss: 1 });
  }
  // Mic stands in front of the strings, wedges at the lip, and pedalboards.
  for (const [x, y] of [[-2.7, -3.0], [2.9, -4.0]]){
    cap(G, [x, y, Z], [x, y, Z + 4.4], .06, 'x:#a8a8b2');
    ell(G, x, y + .1, Z + 4.5, .15, .2, .15, 'x:#2a2a30');
  }
  for (const x of [-3.2, 2.8, -8.4]){
    box(G, x - 1.1, x + 1.1, -1.6, -.5, Z, Z + .7, (px, py, pz, f) => f === 'top' ? 'x:#3a3840' : 'x:#22212a');
  }
  for (const [x, y] of [[-3.2, -2.6], [2.5, -3.6]]){
    box(G, x - 1, x + 1, y - .3, y + .3, Z, Z + .2, px => 'x:' + ['#e85a5a', '#5ad48a', '#f2f2f2', '#5a7ae8'][Math.floor((px - x + 1) * 2) & 3]);
  }
  // The barricade between the pit and the lawn.
  for (let x = -16; x <= 16; x += .9) cap(G, [x, 3.4, 0], [x, 3.4, 3.2], .06, 'x:#b8bac4');
  cap(G, [-16.2, 3.4, 3.3], [16.2, 3.4, 3.3], .12, 'x:#c8cad4');
  return paint(G);
}

/* THE BAND'S MOTION, one function for every place the band is drawn, so the show and the menus can
   never disagree about how a player moves. Given the frames, a player, the clock and the room's mood,
   it answers which frame to draw, where the player stands, and how far he bobs. Real tempo: two frames
   a beat at the song's own bpm, the same clock the lights pulse on. */
const PLAYERS = [['keys', BAND.keys], ['guitar', BAND.guitar], ['bass', BAND.bass], ['drums', BAND.drums]];
function bandPose(frames, i, t, mood){
  const [role, m] = PLAYERS[i], energy = mood.energy;
  const beat = t * (86 + energy * 46) / 60;
  let fr = frames[role], at = m;
  if (role === 'keys'){
    // A keys player moves between rigs every few songs, not every song, or the compressed
    // night reads as a timelapse of him running round the riser.
    const where = KEY_SEQ[Math.floor(mood.mode / 3) % KEY_SEQ.length];
    fr = frames.keys[where];
    if (where === 'guitar') at = { x: m.stand.x, y: m.stand.y, z: m.z };
  }
  let f = ((beat * 2 + i * .7) | 0) % fr.length;
  if (energy < .3 && role !== 'drums') f = (beat | 0) % 2 ? 0 : 2;
  if (mood.bow) f = role === 'drums' ? 3 : 1;
  const bob = energy > .45 && Math.sin(t * (4 + energy * 4) + i) > .4 ? 1 : 0;
  return { role, img: fr[f % fr.length], at, bob, f: f % fr.length, onGuitar: at !== m };
}

/* A room's rig: its kind's defaults with the room's own overrides. */
function rigFor(R, RIGS){ return Object.assign({}, RIGS[R.rig] || RIGS.shed, R.rigOver || {}); }

/* A room's two painted layers and the band's frames: a second of work on a phone, which is why the
   worker exists. Both the worker and the main-thread fallback call this. */
function buildWorld(R, RIG, seed, withCrowd){
  const w = { back: buildBack(mulberry32(seed), R, RIG), front: buildFront(), frames: bandFrames() };
  if (withCrowd) w.crowd = crowdSprites(seed);
  return w;
}

/* EVERY CROWD SPRITE A NIGHT CAN SHOW, keyed 'variant:pose'. The twenty eight kinds of person are the
   first twenty eight draws of the night's crowd generator, exactly as stage.js draws them, so the
   worker can paint them all in advance and nobody is built mid-song. */
const CROWD_KINDS = 40;
/* The first twenty eight come off the night's own crowd stream, as they always have, so where everybody
   stands does not move. The rest come off a stream of their own, as does each kind's glow stick. */
function crowdVariants(rand, seed){
  const more = mulberry32(seed ^ 0x2c1b3c6d), out = [];
  for (let vi = 0; vi < CROWD_KINDS; vi++) out.push(crowdVariant(vi < 28 ? rand : more));
  for (const v of out) v.glow = (more() * GLOWS.length) | 0;
  return out;
}
const CROWD_POSE_KEYS = [...Object.keys(CROWD_POSES), 'sign', 'glow'];
function crowdPose(v, pose){ return pose === 'sign' ? signPose(v) : pose === 'glow' ? glowPose(v) : CROWD_POSES[pose]; }
function crowdSprites(seed){
  const out = {}, vs = crowdVariants(mulberry32(seed ^ 0x5bd1e995), seed);
  vs.forEach((v, vi) => { for (const pose of CROWD_POSE_KEYS) out[vi + ':' + pose] = personSprite(v, crowdPose(v, pose), true); });
  return out;
}

export {
  ART, ELEV, SE, X0, WPX, OY, sx, sy, depth, camN, rgb, mixc, clamp01, hash, mulberry32, canvas, rampCache, rampOf, Grid, STEP, fn, box, ell, cap, cyl, paint, SKINS, HAIRS, SHIRTS, DYE, turnOf, personParts, face, PW, personSprite, CROWD_POSES, signPose, crowdVariant, BAND, guitarExtra, KEY_TURN, keysFrames, KEY_SEQ, bandFrames, DECK, FIX, kit, buildBack, podCorners, buildRig, buildPods, keysBoard, buildFront, D2R, CE, X1, HPX, PH, PAX, PAY,
  PLAYERS, bandPose, buildWorld, rigFor, crowdSprites, CROWD_KINDS, crowdVariants, crowdPose, GLOWS, GLOW_HAND,
};
