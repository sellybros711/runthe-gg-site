/* THE STAGE.
 *
 * The night, drawn in Run The Tour's putt putt style: a small 3D world seen from above at 42 degrees,
 * painted by the same renderer (PXHD, lifted out of golf by scripts/setlist/extract_pxhd.mjs), so the
 * light from the top left, the five step hue shifted ramps, the contact shadows and the soft outline
 * inside each shape are exactly the golf world's. Chunky pixels, chibi people, a lawn you could putt on.
 *
 * The venue is a lawn in front of an outdoor stage, the way the Bend photos look, and the show runs from
 * daylight into night: Set I in the sun, the set break at dusk, Set II and the encore under the rig.
 *
 * IT IS A RENDERER AND NOTHING ELSE. Every cue it is handed comes out of showBeats(), which comes out of
 * the result that was already scored, so the picture can never disagree with the scorecard. Nothing in
 * here reads a song, a score or a rule. scripts/setlist/check_data.mjs holds that line.
 *
 * HOW IT IS DRAWN. Everything is solids in feet (x east, y toward you, z up), splatted into a grid of
 * cells, each with a material and the way its surface faces. PXHD paints that grid. The world is drawn
 * once into two layers (what stands behind the band, and the gear in front of it); the band and the
 * crowd are small worlds of their own, drawn once per pose and stood in place every frame. Light that
 * moves (the screen, the rig, the dusk) is laid over the top.
 *
 * THE BAND IS DRAWN FROM ITS GEAR. A face is two dots. What a fan knows is the yellow kit on its riser,
 * the keys stage left, the rug, the hats and where each player stands. No likeness, and no copy of
 * anybody's artwork: the kick drum head is an abstract swirl.
 *
 * SHOT LIKE AN HD-2D GAME. The pixels stay pixels; what is around them is a console's: a real sky over
 * the treeline (noon blue, a dusk, a night with stars, a moon and the rig glowing up behind the trees),
 * tilt shift depth of field so the stage is the one sharp thing, a vignette and a grade, backlights
 * firing over the band into the crowd, smoke on the deck, dust in the beams, fireflies, confetti on a
 * bustout and the final, spark fountains for a night that went off, and a camera that kicks on both.
 * A device that cannot keep up drops the decoration first (`lite`), never the light or the people.
 *
 * VENUES are a table so the next one is a row. A venue changes the room and how many people it holds.
 * It never changes a score.
 */
import PXHD from './pxhd.js?v=1';

export const VENUES = {
  lawn: { name: 'The Lawn', capacity: 1 },
};

// ── the camera ─────────────────────────────────────────────────────────────
const ART = 0.2;                       // feet per pixel
const ELEV = 42, D2R = Math.PI / 180;
const SE = Math.sin(ELEV * D2R), CE = Math.cos(ELEV * D2R);
const X0 = -48, X1 = 48;               // the world, west to east, in feet
const WPX = Math.round((X1 - X0) / ART);
/* The world reaches 120 rows higher than it used to, so the trees behind the stage stand whole and the
   sky shows over them. Everything above the treeline is left empty, and the sky is drawn into it. */
const OY = 270, HPX = 520;             // pixel row of y=0,z=0, and the world's height in pixels
const LAWN_FAR = -40;                  // the lawn stops here, hidden behind the treeline
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
function canvas(w, h){ const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

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
function personParts(G, P, pose, facing){
  const th = turnOf(facing), cs = Math.round(Math.cos(th)), sn = Math.round(Math.sin(th)), swap = sn !== 0;
  const T = (x, y, z) => [x * cs - y * sn, x * sn + y * cs, z];
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
  if (pose.seated){
    for (const s2 of [-1, 1]){
      C([s2 * .38, 0, 1.45], [s2 * .38, .95, 1.45], .3, pants);
      C([s2 * .38, .95, 1.45], [s2 * .38, .95, .35], .28, pants);
      E(s2 * .38, 1.07, .2, .32, .45, .22, shoes, { gloss: 1 });
    }
  } else {
    C([-.38, 0, .35], [-.38, 0, 1.55], .3, pants);
    C([.38, 0, .35], [.38, 0, 1.55], .3, pants);
    E(-.38, .12, .2, .32, .45, .22, shoes, { gloss: 1 });
    E(.38, .12, .2, .32, .45, .22, shoes, { gloss: 1 });
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
function face(G, P, facing){
  const th = turnOf(facing), cs = Math.round(Math.cos(th)), sn = Math.round(Math.sin(th));
  const at = (x, y, z) => { const wx = x * cs - y * sn, wy = x * sn + y * cs;
    return { i: Math.floor(sx(wx) - G.ox), j: Math.floor(sy(wy, z) - G.oy), seen: wy > .25 }; };
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
  if (Math.cos(turnOf(facing)) > -.5) face(G, P, facing);
  return paint(G);
}

// Poses, as hand positions in feet about the feet, facing you.
const CROWD_POSES = {
  down:  { L: [-.95, .15, 1.75], R: [.95, .15, 1.75] },
  up:    { L: [-1.05, .1, 5.9], R: [1.05, .1, 5.9] },
  one:   { L: [-.95, .15, 1.75], R: [1.0, .15, 6.1] },
  clap:  { L: [-.25, .4, 5.7], R: [.25, .4, 5.7] },
  phone: { L: [-.95, .15, 1.75], R: [.85, .2, 5.6], extra: (E) => E(.85, .2, 6.05, .22, .1, .32, 'x:#2a2c36') },
};
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
  const g = m => [0, 1, 2, 3].map(f => personSprite(m.look, {
    L: [m.bass ? 1.4 : 1.15, .9, m.bass ? 3.05 : 2.85],
    R: [-.55, .95, [2.25, 1.85, 2.15, 2.45][f]],
    extra: guitarExtra(m) }, false));
  const stick = (hand, up, C) => C(hand, [hand[0] * .6, hand[1] + 1.1, hand[2] + (up ? .9 : -.2)], .07, 'x:#e0c08a');
  const D = [[[-1.0, .9, 2.6], [1.0, .9, 3.6]], [[-1.0, .9, 3.6], [1.0, .9, 2.6]], [[-1.05, .9, 3.0], [1.05, .9, 3.0]], [[-1.2, .7, 4.6], [1.2, .7, 4.6]]];
  return {
    guitar: g(BAND.guitar),
    bass: g(BAND.bass),
    keys: keysFrames(),
    drums: D.map(([l, r], f) => personSprite(BAND.drums.look, {
      L: l, R: r, extra: (E, C) => { stick(l, f !== 0 && f !== 2, C); stick(r, f === 0 || f === 3, C); } }, false)),
  };
}

// ── the venue ──────────────────────────────────────────────────────────────
const DECK = { x0: -14, x1: 14, y0: -14.5, y1: 0, z: 4 };
const SCREEN = { x0: -10.5, x1: 10.5, y: -14.6, z0: 8.4, z1: 16.6 };
const TRUSS_Z = 21.5;
const FIX = Array.from({ length: 10 }, (_, i) => -12.6 + i * 2.8);
const LAMPS = [[-31.8, -2], [31.8, -2], [-31.8, 18], [31.8, 18], [-31.8, 38], [31.8, 38]];

function grassAt(x, y){
  const n = hash(Math.floor(x * 2.5), Math.floor(y * 2.5), 3), p = hash(Math.floor(x / 2), Math.floor(y / 2), 5);
  if (n < .018) return ['#f4e9f2', '#f6d65a', '#e98bb4'][(n * 1000 | 0) % 3];
  if (p < .25) return '#79bc58';
  if (n > .85) return '#93d06c';
  return '#86c661';
}

function buildBack(rand){
  const G = new Grid(WPX, HPX, 0, 0);
  const up = camN(0, 0, 1), nUp = () => up;
  // The lawn, every cell, then everything else stood on it.
  for (let j = 0; j < HPX; j++){
    const y = (j + .5 - OY) * ART / SE;
    if (y < LAWN_FAR) continue;
    for (let i = 0; i < WPX; i++){
      const x = X0 + (i + .5) * ART;
      let col = grassAt(x, y);
      if (y > -20 && y < -16 && Math.abs(x) < 26) col = '#b9a78a';
      if (y > 1 && y < 3.2 && Math.abs(x) < 17) col = '#a8a29a';
      if (Math.abs(x) > 30 && Math.abs(x) < 33.5 && y > -10) col = (Math.floor(y * 2) % 2) ? '#d9cfba' : '#cfc4ad';
      G.S.g[j][i] = { m: 'x:' + col, n: nUp, z: depth(y, 0), dt: hash(i >> 1, j >> 1, 9) < .12 ? -1 : 0,
        gloss: 0, bias: 0, t: null, tag: '' };
      G.Z[j * WPX + i] = depth(y, 0);
    }
  }
  // Blankets at the back of the lawn, where the people who came to sit, sit.
  for (let k = 0; k < 14; k++){
    const x = -26 + rand() * 52, y = 34 + rand() * 14;
    const c = SHIRTS[(rand() * SHIRTS.length) | 0], c2 = SHIRTS[(rand() * SHIRTS.length) | 0];
    box(G, x - 2, x + 2, y - 1.4, y + 1.4, 0, .05, (px, py) => 'x:' + ((Math.floor(px) + Math.floor(py)) % 2 ? c : c2));
  }
  // Trees round the lawn and a stand of them behind the stage.
  const greens = ['#4f9a48', '#5aab50', '#3f8640'];
  const tree = (x, y, r, h) => {
    cyl(G, x, y, .7, 0, h * .55, 'x:#7a5236', null);
    ell(G, x, y, h, r, r * .9, r * .82, (px, py, pz) => 'x:' + greens[(hash(Math.floor(px * 1.5), Math.floor(pz * 1.5), 2) * 3) | 0]);
    ell(G, x - r * .5, y + .4, h - r * .35, r * .6, r * .55, r * .55, 'x:#5aab50');
    ell(G, x + r * .55, y + .3, h - r * .3, r * .6, r * .55, r * .5, 'x:#4f9a48');
  };
  /* A treeline right across the back, close enough that its canopy hides where the lawn ends and low
     enough that the sky shows over it. Uneven on purpose: a skyline of equal trees reads as a fence. */
  for (let x = X0 - 3; x <= X1 + 3; x += 5.6 + rand() * 1.8){
    tree(x, -27 - rand() * 6, 5 + rand() * 1.6, 6.5 + rand() * 3.5);
  }
  for (const [x, y, r, h] of [[-21, -34, 6, 11], [19, -35, 6.5, 12],
    [-40, -18, 6, 14], [40, -18, 6, 13], [-40, 4, 5.5, 14], [41, 6, 5.5, 14],
    [-42, 26, 6, 15], [42, 30, 6, 15], [-38, 46, 5, 13], [40, 50, 5.5, 14]]) tree(x, y, r, h);
  // Lamp posts up the side paths.
  for (const [x, y] of LAMPS){
    cyl(G, x, y, .22, 0, 11, 'x:#3a3a44', null);
    ell(G, x, y, 11.4, .6, .6, .5, 'x:#f6efd8', { gloss: 2 });
  }
  // The stage house: the back wall, the screen's frame, the deck, its skirt and the drum riser.
  box(G, -15.5, 15.5, -16, -14.8, 0, 19.5, (x, y, z, f) => 'x:' + (f === 'top' ? '#4a4652' : (Math.floor(x * 2) % 2 ? '#3a3742' : '#34313c')));
  box(G, SCREEN.x0 - .5, SCREEN.x1 + .5, -14.8, -14.6, SCREEN.z0 - .5, SCREEN.z1 + .5, 'x:#1c1b22');
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
  for (const s of [-1, 1]){
    for (const dy of [-.6, .6]) for (const dx of [-.6, .6]) cap(G, [s * 15.6 + dx, -.8 + dy, 0], [s * 15.6 + dx, -.8 + dy, TRUSS_Z], .12, 'x:#9ea0aa');
    for (let z = 1; z < TRUSS_Z; z += 1.4) cap(G, [s * 15.6 - .6, -.2, z], [s * 15.6 + .6, -.2, z + 1.2], .07, 'x:#8a8c96');
    box(G, s * 17.6 - 1.4, s * 17.6 + 1.4, -1.6, -.2, 9, 18.5, (x, y, z, f) => f === 'top' ? 'x:#3a3a42'
      : 'x:' + ((Math.floor(z * 2.2) % 3 === 0) ? '#4a4a54' : '#2c2c34'));
  }
  for (const dy of [-.6, .6]) for (const dz of [-.5, .5]) cap(G, [-16.2, -.8 + dy, TRUSS_Z + dz], [16.2, -.8 + dy, TRUSS_Z + dz], .12, 'x:#a8aab4');
  for (let x = -16; x < 16; x += 1.2) cap(G, [x, -.2, TRUSS_Z - .5], [x + 1.1, -.2, TRUSS_Z + .5], .06, 'x:#8a8c96');
  for (const fx of FIX) ell(G, fx, -.8, TRUSS_Z - 1, .35, .35, .4, 'x:#2a2a32', { gloss: 1 });
  return paint(G);
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

// ── the stage ──────────────────────────────────────────────────────────────
const PALETTES = {
  jam:    [[160, 100, 255], [70, 220, 235]],
  peak:   [[255, 80, 180], [240, 240, 255]],
  cover:  [[255, 112, 96], [80, 225, 205]],
  encore: [[245, 245, 255], [255, 100, 130]],
  ballad: [[80, 130, 255], [170, 120, 255]],
  opener: [[90, 235, 140], [240, 240, 255]],
  closer: [[70, 215, 225], [255, 90, 190]],
  house:  [[170, 160, 220], [120, 180, 230]],
};
const ROTATION = ['jam', 'closer', 'ballad', 'cover', 'opener', 'peak'];

/* The sky does the lighting. A multiply over the whole world: white at noon, warm through the
   afternoon, rose at dusk and blue at night, keyed to how far through the show the night is. */
const SKY = [
  [0, [255, 255, 255]], [.35, [255, 238, 216]], [.5, [236, 176, 166]], [.62, [112, 104, 160]], [1, [58, 62, 112]],
];
function skyAt(p){
  for (let i = 1; i < SKY.length; i++){
    if (p <= SKY[i][0]){
      const [a, ca] = SKY[i - 1], [b, cb] = SKY[i];
      return mixc(ca, cb, (p - a) / (b - a));
    }
  }
  return SKY[SKY.length - 1][1];
}

export function createStage(view, opts = {}){
  const venue = VENUES[opts.venue] || VENUES.lawn;
  const reduce = !!opts.reduce;
  const rand = mulberry32((opts.seed | 0) || 7);

  const back = buildBack(rand);
  const front = buildFront();
  const frames = bandFrames();

  // The crowd: twenty eight kinds of person, several hundred people, back to front.
  const variants = Array.from({ length: 28 }, () => crowdVariant(rand));
  const spriteCache = new Map();
  const spriteOf = (vi, pose) => {
    const key = vi + ':' + pose;
    let s = spriteCache.get(key);
    if (!s){
      const v = variants[vi];
      s = personSprite(v, pose === 'sign' ? signPose(v) : CROWD_POSES[pose], true);
      spriteCache.set(key, s);
    }
    return s;
  };
  const crowd = [];
  /* Room to see the lawn between people, the way the putt putt world shows its ground: packed at the
     rail and thinning toward the blankets at the back. */
  for (let y = 5.5; y < 44; y += 2.3 + (y - 5) * .02){
    const half = 19 + (y - 5) * .42, gap = 2.9 + (y - 5) * .05;
    for (let x = -half; x < half; x += gap + rand() * 1.2){
      crowd.push({ x: x + (rand() - .5) * .5, y: y + (rand() - .5) * .5,
        v: (rand() * variants.length) | 0, t: Math.min(1, (y - 5) / 40 * .6 + rand() * .45),
        phase: rand() * Math.PI * 2, jumpy: .4 + rand() * .6,
        phone: rand() < .55, sign: rand() < .035, pose: 'down', until: 0 });
    }
  }
  crowd.sort((a, b) => a.y - b.y);
  // Everybody's first pose up front, so the first frame is not a stall.
  for (let vi = 0; vi < variants.length; vi++) spriteOf(vi, 'down');

  // The screen is a light: a grid of LED cells drawn every frame.
  const LED = { w: Math.round((SCREEN.x1 - SCREEN.x0) / ART / 2), h: Math.round((SCREEN.z1 - SCREEN.z0) * CE / ART / 2) };
  const led = canvas(LED.w, LED.h);
  const ledG = led.getContext('2d');
  const ledImg = ledG.createImageData(LED.w, LED.h);
  const SCR = { x: Math.round(sx(SCREEN.x0)), y: Math.round(sy(SCREEN.y, SCREEN.z1)) };

  const out = view.getContext('2d');
  /* Five buffers, all the size of what the camera sees. `g` is the world as it is painted; `lg` the
     light falling on it, multiplied in, so a beam's pool turns the rug and the people under it its own
     colour; `eg` what glows of its own accord (the screen, lenses, bulbs, phones and the beams in the
     haze), added on top; and two small ones the glow is blurred through for the bloom. */
  let buf = canvas(4, 4), g = buf.getContext('2d');
  let lmap = canvas(4, 4), lg = lmap.getContext('2d');
  let emit = canvas(4, 4), eg = emit.getContext('2d');
  let beams = canvas(4, 4), bg = beams.getContext('2d');
  let bloomA = canvas(2, 2), bloomB = canvas(1, 1);
  /* THE BLOOM IS ITS OWN SMALL CANVAS, stretched over the picture by the browser and blended in with
     `screen`. Drawn at full screen resolution every frame it cost five times the rest of the frame put
     together (measured: 83ms against 17), because scaling three million pixels twice a frame is work a
     canvas does on the CPU. Scaled by CSS it is the compositor's job, which is what a GPU is for. */
  const glow = document.createElement('canvas');
  glow.setAttribute('aria-hidden', 'true');
  glow.style.cssText = view.style.cssText;
  Object.assign(glow.style, { pointerEvents: 'none', imageRendering: 'auto', mixBlendMode: 'screen' });
  if (view.parentElement) view.parentElement.insertBefore(glow, view.nextSibling);
  const gg = glow.getContext('2d');
  /* DEPTH OF FIELD, the tilt shift every HD-2D game is shot with: the treeline behind the stage and the
     back of the lawn go soft, and the stage between them is pin sharp. It is the picture downsampled and
     stretched back up by the browser, laid over the sharp one through a CSS mask, so it costs the page one
     small drawImage a frame and the compositor the rest. */
  const dof = document.createElement('canvas');
  dof.setAttribute('aria-hidden', 'true');
  let dofA = canvas(2, 2);
  /* The grade: a vignette that pulls the eye to the stage, and a cool wash in the corners at night. A
     div over the picture rather than pixels in it, so it is free. */
  const vig = document.createElement('div');
  vig.setAttribute('aria-hidden', 'true');
  vig.style.cssText = 'position:absolute; inset:0; pointer-events:none;';
  if (view.parentElement){
    view.parentElement.insertBefore(dof, view.nextSibling);
    view.parentElement.insertBefore(vig, glow.nextSibling);
  }
  const dc = dof.getContext('2d');
  let k = 1, visW = 4, visH = 4, camX = 0, camY = 0;
  /* Haze: soft blobs of smoke the beams are seen through, so a beam is never a flat triangle. */
  const haze = canvas(64, 64);
  {
    const hg = haze.getContext('2d'), im = hg.createImageData(64, 64);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++){
      let v = 0, a = 1, f = 1 / 16;
      for (let o = 0; o < 3; o++){
        const X = x * f, Y = y * f, xi = Math.floor(X), yi = Math.floor(Y), u = X - xi, w = Y - yi;
        const r = (i, j) => hash(((i % (64 * f)) + 64 * f) % (64 * f), ((j % (64 * f)) + 64 * f) % (64 * f), o + 40);
        const su = u * u * (3 - 2 * u), sw = w * w * (3 - 2 * w);
        v += a * (r(xi, yi) * (1 - su) * (1 - sw) + r(xi + 1, yi) * su * (1 - sw) + r(xi, yi + 1) * (1 - su) * sw + r(xi + 1, yi + 1) * su * sw);
        a *= .5; f *= 2;
      }
      im.data[(y * 64 + x) * 4 + 3] = Math.round(255 * clamp01(.25 + (v / 1.75) * .95));
    }
    hg.putImageData(im, 0, 0);
  }
  let hazePat = null;

  const st = {
    pal: PALETTES.house, palFrom: PALETTES.house, palT: 1,
    light: 0, lightWant: 0, house: 1, houseWant: 1,
    energy: .2, energyWant: .2, density: .8, densityWant: .8,
    sky: 0, skyWant: 0,
    band: false, encore: false, bow: false,
    signsUntil: 0, flashUntil: 0, jumpUntil: 0, segueUntil: 0, strobeUntil: 0, mode: 0, rot: 0,
  };
  let raf = 0, dead = false, last = 0, now = performance.now(), pdt = 0;
  /* A phone that cannot draw all of this at thirty frames a second drops the decoration first: the
     dust, the fireflies and the shadows under the crowd. The light, the band and the crowd stay. */
  let costMs = 0, lite = false;

  /* The sky over the treeline: stars, a moon and the day's clouds, fixed by the seed so a replay of the
     same night has the same sky. Rows are world rows, everything above the trees. */
  // The horizon is the bottom of the canopy; the sky runs from the top of the shot down to it.
  const SKY_ROWS = sy(-30, 11);
  const stars = Array.from({ length: 150 }, () => ({ x: rand() * WPX, y: rand(),
    b: .35 + rand() * .65, tw: rand() * 6.3, big: rand() < .08 }));
  const clouds = Array.from({ length: 7 }, () => ({ x: rand() * WPX, y: rand(), w: 22 + rand() * 34, v: .6 + rand() * 1.2 }));

  /* Particles, in feet. Confetti falls lit by whatever is lighting the room; sparks and the dust in the
     beams glow on their own. Nothing here is spawned when motion is reduced. */
  const confetti = [], sparks = [], motes = [];
  for (let i = 0; i < 46; i++) motes.push({ x: -14 + rand() * 28, y: -13 + rand() * 16, z: 5 + rand() * 15,
    ph: rand() * 6.3, s: .2 + rand() * .5 });
  const flies = Array.from({ length: 22 }, () => ({ x: (rand() < .5 ? -1 : 1) * (22 + rand() * 22),
    y: -14 + rand() * 60, z: 1 + rand() * 4, ph: rand() * 6.3 }));
  let sparkUntil = 0, shakeUntil = 0, shakeAmp = 0, shook = '';
  /* A camera that kicks on the big moments, the way a game sells a hit: a few screen pixels for a
     quarter of a second, applied to the picture's layers together so the bloom and the blur stay on it. */
  function shake(){
    let tr = '0px 0px';
    if (!reduce && now < shakeUntil){
      const f = (shakeUntil - now) / 320, a = shakeAmp * f * f;
      tr = `${(Math.sin(now * .09) * a).toFixed(1)}px ${(Math.cos(now * .113) * a).toFixed(1)}px`;
    }
    if (tr === shook) return;
    shook = tr;
    for (const el of [view, dof, glow]) el.style.translate = tr;
  }
  const FETTI = ['#ff4f7a', '#ffd23f', '#3fd0ff', '#8a5bff', '#5be08a', '#ffffff', '#ff8a3c'];
  /* Every colour a piece can show, worked out once: its face and its back, at eight levels of the
     room's light. A colour string built per piece per frame was the most expensive line in the frame. */
  const FETTI_SH = FETTI.map(c => [0, .35].map(b => Array.from({ length: 8 }, (_, l) =>
    PXHD.mix(PXHD.mix(c, '#000000', b), '#000000', 1 - (.45 + .55 * l / 7)))));
  function burst(n){
    if (reduce) return;
    if (lite) n = n >> 1;
    for (let i = 0; i < n; i++){
      confetti.push({ x: -15 + Math.random() * 30, y: -3 + Math.random() * 6, z: TRUSS_Z - .5,
        vx: (Math.random() - .5) * 5, vy: 2 + Math.random() * 6, vz: 3 + Math.random() * 6,
        c: (Math.random() * FETTI.length) | 0, ph: Math.random() * 6.3, f: 3 + Math.random() * 5 });
    }
    if (confetti.length > 600) confetti.splice(0, confetti.length - 600);
  }
  // A shadow under everybody on the lawn, so a crowd stands on the grass instead of floating over it.
  const shade = canvas(12, 5);
  {
    const sg = shade.getContext('2d'), gr = sg.createRadialGradient(6, 2.5, 0, 6, 2.5, 6);
    gr.addColorStop(0, 'rgba(10,6,20,.42)'); gr.addColorStop(.7, 'rgba(10,6,20,.2)'); gr.addColorStop(1, 'rgba(10,6,20,0)');
    sg.setTransform(1, 0, 0, .42, 0, 1.45); sg.fillStyle = gr; sg.beginPath(); sg.arc(6, 2.5, 6, 0, 7); sg.fill();
  }

  function fit(){
    const dpr = window.devicePixelRatio || 1;
    const host = view.parentElement || document.body;
    const cw = host.clientWidth || window.innerWidth, ch = host.clientHeight || window.innerHeight;
    const devW = Math.round(cw * dpr), devH = Math.round(ch * dpr);
    /* Chunky, the way the putt putt world is: about 115 pixels across a phone, so a person is twenty
       pixels tall and three or four screen pixels make one of theirs. Never so small a scale that the
       screen would see past the edge of the world. */
    k = Math.max(1, Math.min(Math.floor(devW / 140), Math.floor(devH / 260)));
    k = Math.max(k, Math.ceil(devW / WPX), Math.ceil(devH / HPX));
    visW = Math.ceil(devW / k); visH = Math.ceil(devH / k);
    view.width = visW * k; view.height = visH * k;
    view.style.width = (visW * k / dpr) + 'px';
    view.style.height = (visH * k / dpr) + 'px';
    buf = canvas(visW, visH); g = buf.getContext('2d');
    lmap = canvas(visW, visH); lg = lmap.getContext('2d');
    emit = canvas(visW, visH); eg = emit.getContext('2d');
    beams = canvas(visW, visH); bg = beams.getContext('2d');
    bloomA = canvas(Math.ceil(visW / 3), Math.ceil(visH / 3));
    bloomB = canvas(Math.ceil(visW / 9), Math.ceil(visH / 9));
    glow.width = Math.ceil(visW / 2); glow.height = Math.ceil(visH / 2);
    /* The grade is on the picture and on its soft copy, never on the bloom, which is light added
       on top and would only be pushed into white. */
    view.style.filter = 'saturate(1.14) contrast(1.06)';
    glow.style.cssText = view.style.cssText;
    Object.assign(glow.style, { pointerEvents: 'none', imageRendering: 'auto', mixBlendMode: 'screen',
      width: view.style.width, height: view.style.height, filter: 'none' });
    hazePat = bg.createPattern(haze, 'repeat');
    camX = Math.round(sx(0) - visW / 2);
    /* THE SHOT. The front of the deck sits a little under halfway down a phone and a little lower on
       a wide screen, so there is always sky over the trees and lawn under the rail. */
    const tall = visH / visW > 1.4;
    camY = Math.round(Math.min(Math.max(0, DECK_FRONT - (tall ? .47 : .56) * visH), HPX - visH));
    dofA = canvas(Math.max(1, Math.ceil(visW / 3)), Math.max(1, Math.ceil(visH / 3)));
    dof.width = Math.ceil(visW / 4); dof.height = Math.ceil(visH / 4);
    dof.style.cssText = view.style.cssText;
    // Sharp from just above the back wall to a few rows into the crowd; soft beyond, either side.
    const pc = r => (100 * (r - camY) / visH).toFixed(1) + '%';
    const a0 = pc(BACK_TOP - 10), a1 = pc(BACK_TOP + 6), b0 = pc(sy(22, 0)), b1 = pc(sy(44, 0));
    const mask = `linear-gradient(to bottom, #000 0%, #000 ${a0}, transparent ${a1}, transparent ${b0}, rgba(0,0,0,.7) ${b1}, rgba(0,0,0,.7) 100%)`;
    Object.assign(dof.style, { pointerEvents: 'none', imageRendering: 'auto', maskImage: mask, webkitMaskImage: mask,
      width: view.style.width, height: view.style.height });
    draw();
  }
  const DECK_FRONT = sy(0, DECK.z), BACK_TOP = sy(-16, 19.5);

  function palette(){
    const t = clamp01(st.palT);
    return [mixc(st.palFrom[0], st.pal[0], t), mixc(st.palFrom[1], st.pal[1], t)];
  }

  function screen(c2, p, t, pulse){
    const d = ledImg.data, e = st.energy, L = st.light, mode = Math.floor(st.mode / 3) % 4;
    for (let y = 0; y < LED.h; y++){
      for (let x = 0; x < LED.w; x++){
        const u = x / LED.w - .5, v = y / LED.h - .5;
        let s;
        if (mode === 0) s = .5 + .5 * Math.sin(Math.hypot(u * 2.4, v) * 16 - t * (2 + e * 4));
        else if (mode === 1) s = (1 - y / LED.h) < Math.abs(Math.sin((x >> 1) * 1.7 + t * (1 + e * 3))) ? 1 : .1;
        else if (mode === 2) s = .5 + .5 * Math.sin(u * 8 + t * 1.3) * Math.cos(v * 6 - t * 1.1 + Math.sin(u * 4 + t));
        else s = ((x * 7 + y * 13 + ((t * 6) | 0)) % 17 === 0) ? 1 : .12;
        const c = mixc(p[0], p[1], .5 + .5 * Math.sin(u * 3 + t * .5));
        // Held under white, or a pale palette turns the wall into one blown out lamp.
        const lit = (.12 + .6 * s) * (.3 + .7 * Math.max(L, .25)) * (1 - st.house * .55) * (.82 + .18 * pulse);
        const i = (y * LED.w + x) * 4;
        d[i] = c[0] * lit; d[i + 1] = c[1] * lit; d[i + 2] = c[2] * lit; d[i + 3] = 255;
      }
    }
    ledG.putImageData(ledImg, 0, 0);
    c2.imageSmoothingEnabled = false;
    c2.drawImage(led, SCR.x, SCR.y, LED.w * 2, LED.h * 2);
    /* An LED wall is a grid of dots, not stripes: every other column and row dimmed, so it reads as
       a matrix up close and as a picture from the lawn. */
    c2.globalCompositeOperation = 'destination-out';
    c2.fillStyle = 'rgba(0,0,0,.22)';
    for (let x = SCR.x + 1; x < SCR.x + LED.w * 2; x += 2) c2.fillRect(x, SCR.y, 1, LED.h * 2);
    for (let y = SCR.y + 1; y < SCR.y + LED.h * 2; y += 2) c2.fillRect(SCR.x, y, LED.w * 2, 1);
    c2.globalCompositeOperation = 'lighter';
  }

  const P2 = (x, y, z) => [Math.round(sx(x)), Math.round(sy(y, z))];

  /* A cone of light from a lens to where it lands: brightest at the lens and thinning as it spreads,
     the way a beam in haze looks. Drawn into the beam layer, which the haze then breaks up. */
  function cone(c2, a, b, r, c, al){
    const grad = c2.createLinearGradient(a[0], a[1], b[0], b[1]);
    grad.addColorStop(0, rgb(c, Math.min(1, al * 1.6)));
    grad.addColorStop(.6, rgb(c, al * .6));
    grad.addColorStop(1, rgb(c, al * .25));
    c2.fillStyle = grad;
    c2.beginPath(); c2.moveTo(a[0] - 1, a[1]); c2.lineTo(a[0] + 1, a[1]); c2.lineTo(b[0] + r, b[1]); c2.lineTo(b[0] - r, b[1]); c2.closePath(); c2.fill();
  }
  /* A soft pool of light, squashed by the camera's angle when it lies on the ground. */
  function pool(c2, x, y, r, c, al, flat = .6){
    if (al <= .003) return;
    const grad = c2.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, rgb(c, Math.min(1, al))); grad.addColorStop(.45, rgb(c, Math.min(1, al) * .45)); grad.addColorStop(1, rgb(c, 0));
    c2.save(); c2.translate(x, y); c2.scale(1, flat); c2.translate(-x, -y);
    c2.fillStyle = grad; c2.beginPath(); c2.arc(x, y, r, 0, Math.PI * 2); c2.fill(); c2.restore();
  }
  // A four point glint on a lens that is pointed at you, the way a mover reads in a photo.
  function glint(c2, x, y, c, a, len){
    c2.fillStyle = rgb([255, 255, 255], Math.min(1, a));
    c2.fillRect(x, y, 1, 1);
    for (let i = 1; i <= len; i++){
      const f = a * (1 - i / (len + 1));
      c2.fillStyle = rgb(mixc(c, [255, 255, 255], .5), f);
      c2.fillRect(x - i, y, 1, 1); c2.fillRect(x + i, y, 1, 1); c2.fillRect(x, y - i, 1, 1); c2.fillRect(x, y + i, 1, 1);
    }
  }

  const PLAYERS = [['keys', BAND.keys], ['guitar', BAND.guitar], ['bass', BAND.bass], ['drums', BAND.drums]];

  function drawBand(t){
    if (!st.band) return;
    // Real tempo: two frames a beat at the song's own bpm, the same clock the lights pulse on.
    const beat = t * (86 + st.energy * 46) / 60;
    PLAYERS.forEach(([role, m], i) => {
      let fr = frames[role], at = m;
      if (role === 'keys'){
        // A keys player moves between rigs every few songs, not every song, or the compressed
        // night reads as a timelapse of him running round the riser.
        const where = KEY_SEQ[Math.floor(st.mode / 3) % KEY_SEQ.length];
        fr = frames.keys[where];
        if (where === 'guitar') at = { x: m.stand.x, y: m.stand.y, z: m.z };
      }
      let f = ((beat * 2 + i * .7) | 0) % fr.length;
      if (st.energy < .3 && role !== 'drums') f = (beat | 0) % 2 ? 0 : 2;
      if (st.bow) f = role === 'drums' ? 3 : 1;
      const bob = st.energy > .45 && Math.sin(t * (4 + st.energy * 4) + i) > .4 ? 1 : 0;
      const [px, py] = P2(at.x, at.y, at.z);
      g.drawImage(fr[f % fr.length], px - PAX, py - PAY - bob);
    });
  }

  function drawCrowd(t){
    const e = st.energy, lit = st.house > .5;
    const jumping = now < st.jumpUntil, signs = now < st.signsUntil;
    const top = camY - 20, bot = camY + visH + 50, lft = camX - 20, rgt = camX + visW + 20;
    for (const c of crowd){
      c.px = null;
      if (c.t > st.density * venue.capacity) continue;
      const [px, py] = P2(c.x, c.y, 0);
      if (py < top || py > bot || px < lft || px > rgt) continue;
      // A pose is held for a while and then reconsidered, so the lawn never moves in lockstep.
      if (now > c.until){
        const r = Math.random();
        let pose = 'down';
        if (st.band && !lit){
          if (signs && c.sign) pose = 'sign';
          else if (st.encore && c.phone && r < .55) pose = 'phone';
          else if (st.bow || jumping) pose = r < .7 ? 'up' : 'clap';
          else if (r < e * .55) pose = r < e * .3 ? 'up' : r < e * .42 ? 'one' : 'clap';
        }
        c.pose = pose;
        c.until = now + 1500 + Math.random() * 3500;
      }
      const hop = st.band && !lit && (jumping || e > .7)
        ? Math.round(Math.max(0, Math.sin(t * (5 + e * 3) + c.phase)) * 2 * c.jumpy) : 0;
      const sway = st.band && !lit && e > .35 ? Math.round(Math.sin(t * 1.5 + c.phase)) : 0;
      const wander = lit ? Math.round(Math.sin(t * .4 + c.phase) * 2) : 0;
      c.px = px + sway + wander; c.py = py - hop;
      if (!lite) g.drawImage(shade, px + sway + wander - 6, py - 2);
      g.drawImage(spriteOf(c.v, c.pose), c.px - PAX, c.py - PAY);
    }
  }

  const tallShot = () => visH / visW > 1.4;

  /* THE SKY, drawn behind the world with destination-over, so it only shows where the treeline leaves
     the picture empty and through the haze of anything light that is already there. Noon blue, a pink
     and orange dusk, and a deep night with the rig's glow coming up behind the trees. */
  function drawSky(t, night, p, show, L){
    const dusk = clamp01(1 - Math.abs(st.sky - .52) / .2);
    const span = Math.max(8, SKY_ROWS - camY), MOON = { x: camX + Math.round(visW * .78), y: camY + 9 };
    g.setTransform(1, 0, 0, 1, -camX, -camY);
    g.globalCompositeOperation = 'destination-over';
    // Stars first: destination-over puts each later layer further back.
    if (night > .05){
      // One colour and an alpha per star: building a colour string for each one every frame is most
      // of what the sky would cost.
      g.fillStyle = '#ebf0ff';
      for (const s2 of stars){
        if (s2.x < camX - 2 || s2.x > camX + visW + 2) continue;
        const a = night * s2.b * (.6 + .4 * Math.sin(t * 1.7 + s2.tw));
        const sy2 = (camY + s2.y * span) | 0;
        g.globalAlpha = a; g.fillRect(s2.x | 0, sy2, 1, 1);
        if (s2.big && a > .4){ g.globalAlpha = a * .4; g.fillRect((s2.x | 0) - 1, sy2, 3, 1); g.fillRect(s2.x | 0, sy2 - 1, 1, 3); }
      }
      g.globalAlpha = 1;
      // The moon, with its own halo, and a couple of darker seas so it reads as the moon at this size.
      const mA = clamp01(night * 1.3);
      g.fillStyle = rgb([140, 150, 190], .5 * mA); g.fillRect(MOON.x + 2, MOON.y + 2, 2, 2); g.fillRect(MOON.x - 2, MOON.y - 1, 2, 1);
      g.fillStyle = rgb([248, 244, 226], mA);
      g.beginPath(); g.arc(MOON.x, MOON.y, 5, 0, 7); g.fill();
      const mh = g.createRadialGradient(MOON.x, MOON.y, 3, MOON.x, MOON.y, 26);
      mh.addColorStop(0, rgb([200, 210, 255], .35 * mA)); mh.addColorStop(1, rgb([200, 210, 255], 0));
      g.fillStyle = mh; g.fillRect(MOON.x - 26, MOON.y - 26, 52, 52);
    }
    // Clouds by day, going pink at dusk.
    if (night < .9){
      const cc = mixc([255, 255, 255], [255, 170, 160], dusk);
      for (const c of clouds){
        const x = ((c.x + t * c.v) % (WPX + 80)) - 40, cy = camY + 5 + c.y * Math.max(2, span - 14);
        g.fillStyle = rgb(cc, .85 * (1 - night));
        g.fillRect(x | 0, cy | 0, c.w | 0, 4);
        g.fillRect((x + c.w * .15) | 0, (cy - 3) | 0, (c.w * .45) | 0, 3);
        g.fillRect((x + c.w * .5) | 0, (cy - 5) | 0, (c.w * .3) | 0, 5);
        g.fillStyle = rgb(mixc(cc, [150, 160, 200], .35), .7 * (1 - night));
        g.fillRect((x + 2) | 0, (cy + 4) | 0, (c.w - 4) | 0, 1);
      }
    }
    // The rig lights the bottom of the sky over the stage once it is dark.
    if (show && night > .1){
      const [gx] = P2(0, -16, 0);
      const rg = g.createRadialGradient(gx, SKY_ROWS, 4, gx, SKY_ROWS, 150);
      rg.addColorStop(0, rgb(p[0], .4 * night * (.4 + .6 * L))); rg.addColorStop(1, rgb(p[0], 0));
      g.fillStyle = rg; g.fillRect(gx - 150, SKY_ROWS - 150, 300, 160);
    }
    const top = mixc(mixc([92, 160, 232], [74, 66, 140], dusk), [6, 8, 26], night);
    const hor = mixc(mixc([196, 228, 246], [250, 158, 112], dusk), [30, 30, 74], night);
    const sk = g.createLinearGradient(0, camY, 0, SKY_ROWS);
    sk.addColorStop(0, rgb(top)); sk.addColorStop(1, rgb(hor));
    g.fillStyle = sk; g.fillRect(camX, camY, visW, Math.max(1, SKY_ROWS - camY + 40));
    g.setTransform(1, 0, 0, 1, 0, 0);
  }

  function draw(){
    const t = now / 1000, p = palette();
    const L = st.light, H = st.house, e = st.energy;
    const night = clamp01((st.sky - .45) / .4);
    // The beat. Everything that pulses pulses on it, and it quickens with the song.
    const bpm = 86 + e * 46, ph = t * bpm / 60, beatN = Math.floor(ph), pulse = Math.exp(-(ph - beatN) * 4.5);
    const show = st.band && H < .5;
    // How much the rig can be seen: hardly in the sun, fully once it is dark.
    const dark = .22 + night * .78;

    // 1. THE WORLD as it is painted.
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, visW, visH);
    g.drawImage(back, camX, camY, visW, visH, 0, 0, visW, visH);
    g.translate(-camX, -camY);
    if (st.band){
      g.fillStyle = 'rgba(30,20,40,.35)';
      for (const [, m] of PLAYERS){ const [px, py] = P2(m.x, m.y, m.z); g.beginPath(); g.ellipse(px, py, 5, 2, 0, 0, 7); g.fill(); }
    }
    drawBand(t);
    g.drawImage(front, camX, camY, visW, visH, camX, camY, visW, visH);
    drawCrowd(t);

    // 2. THE LIGHT falling on it. The sky is the floor of it; the rig adds to it.
    lg.setTransform(1, 0, 0, 1, 0, 0);
    lg.globalCompositeOperation = 'source-over';
    const sky = skyAt(st.sky);
    lg.fillStyle = rgb(H > .5 ? mixc(sky, [246, 232, 210], H * night * .6) : sky);
    lg.fillRect(0, 0, visW, visH);
    lg.translate(-camX, -camY);
    lg.globalCompositeOperation = 'lighter';
    const beamA = (.05 + e * .1) * L * (1 - H) * dark;
    const spot = mixc([255, 240, 222], p[1], .3);
    if (show){
      // A wash across the deck in the song's colour, breathing on the beat.
      const [wx, wy] = P2(0, -7, DECK.z);
      pool(lg, wx, wy, 95, mixc(p[0], [255, 255, 255], .35), (.18 + .32 * L) * dark * (.75 + .25 * pulse), .55);
      // The screen throws its colour onto the back of the deck.
      const [sx2, sy2] = P2(0, -13, DECK.z);
      pool(lg, sx2, sy2, 70, mixc(p[0], p[1], .5), .3 * L * dark, .4);
      // A key light on every player, so the band is the brightest thing in the room.
      for (const [, m] of PLAYERS){
        const [px, py] = P2(m.x, m.y, m.z);
        pool(lg, px, py - 8, 15, spot, (.45 + .35 * L) * dark, 1.2);
      }
      // Spill off the stage onto the front of the lawn.
      const [fx, fy] = P2(0, 6, 0);
      pool(lg, fx, fy, 150, mixc(p[0], [255, 255, 255], .5), .3 * L * dark, .4);
    }
    // Lamp posts and the strings over the lawn, coming on with the dusk.
    for (const [x, y] of LAMPS){
      const [px, py] = P2(x, y, 0);
      pool(lg, px, py, 30, [255, 206, 140], .5 * night);
    }
    for (const yy of [14, 30]){
      for (let x = -30; x <= 30; x += 4.8){
        const [px, py] = P2(x, yy, 0);
        pool(lg, px, py, 14, [255, 200, 130], .13 * night);
      }
    }

    // 3. THE BEAMS, worked out once and used twice: where each lands lights the ground under it, and
    //    the cone itself glows in the haze.
    bg.setTransform(1, 0, 0, 1, 0, 0);
    bg.globalCompositeOperation = 'source-over';
    bg.clearRect(0, 0, visW, visH);
    bg.translate(-camX, -camY);
    bg.globalCompositeOperation = 'lighter';
    const strobe = now < st.strobeUntil && (Math.floor(ph * 2) % 2 === 0);
    if (beamA > .008){
      const sp = .25 + e * .6;
      FIX.forEach((fx, i) => {
        const [px, py] = P2(fx, -.8, TRUSS_Z - 1.2);
        const col = p[(i + beatN) % 2];
        const tx = fx + Math.sin(t * sp + i * .8) * (3 + e * 6) * (i % 2 ? 1 : -1);
        const deep = e > .6 && i % 3 === 0;
        const ty = deep ? 8 + Math.sin(t * sp * .7 + i) * 6 : -9 + (i * 13) % 8;
        const b = P2(tx, ty, deep ? 0 : DECK.z);
        const a = beamA * (.7 + .5 * pulse);
        cone(bg, [px, py + 1], b, 5 + e * 4, col, a);
        pool(lg, b[0], b[1], 12 + e * 4, col, a * 4.5);
      });
      // Uplights at the lip of the deck, fanning into the sky when the song has earned them.
      if (e > .45){
        for (let i = 0; i < 6; i++){
          const base = P2(-12 + i * 4.8, -.4, DECK.z);
          const ang = Math.sin(t * (.25 + e * .4) + i * 1.3) * .5 + (i - 2.5) * .12;
          cone(bg, base, [base[0] + Math.sin(ang) * 90, base[1] - Math.cos(ang) * 120], 8, p[(i + beatN + 1) % 2], beamA * (e - .3) * 1.8);
        }
      }
      if (now < st.segueUntil){
        const f = 1 - (st.segueUntil - now) / 1500;
        const b2 = P2(-14 + f * 28, -2, DECK.z);
        cone(bg, P2(0, -.8, TRUSS_Z), b2, 12, [255, 255, 255], .3 * Math.sin(f * Math.PI) * dark);
        pool(lg, b2[0], b2[1], 26, [255, 255, 255], .5 * Math.sin(f * Math.PI) * dark);
      }
    }
    /* BACKLIGHTS on the roof of the stage house, firing over the band and out across the lawn: the
       shot every concert film is made of. Where they land they sweep the crowd. */
    if (show && e > .3){
      const bk = beamA * (e - .2) * 1.6;
      for (let i = 0; i < 6; i++){
        const x0 = -12.5 + i * 5;
        const a = P2(x0, -15.2, 19.8);
        const tx = x0 * .6 + Math.sin(t * (.35 + e * .5) + i * 1.9) * (8 + e * 8);
        const ty = 14 + Math.sin(t * (.27 + e * .3) + i * 1.1) * 10;
        const b = P2(tx, ty, 0);
        const col = p[(i + beatN + 1) % 2];
        cone(bg, a, b, 9 + e * 7, col, bk);
        pool(lg, b[0], b[1], 16 + e * 6, col, bk * 3.2, .5);
      }
    }
    /* Smoke on the deck and rolling off the lip, lit in the song's colour. Laid into the beam layer, so
       the haze below breaks it into the same drifting smoke the beams are seen through. */
    if (show){
      const sc = mixc(p[0], [255, 255, 255], .45), sa = .2 * dark * (.6 + .4 * L);
      const [sx0, sy0] = P2(0, -.5, DECK.z), [, sy1] = P2(0, -7, DECK.z);
      pool(bg, sx0, sy0, 90, sc, sa, .32);
      pool(bg, sx0, sy1, 70, sc, sa * .6, .3);
    }
    // The haze: the beams are only seen where there is smoke to see them in.
    if (hazePat){
      bg.globalCompositeOperation = 'destination-in';
      bg.save();
      bg.translate(Math.round(t * 3) % 64, Math.round(t * -1.5) % 64);
      bg.fillStyle = hazePat; bg.fillRect(camX - 64, camY - 64, visW + 128, visH + 128);
      bg.restore();
    }

    // 4. LIGHT THE WORLD: what is painted, times the light on it.
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'multiply';
    g.drawImage(lmap, 0, 0);
    // The light only lands on the world. Over the treeline there is nothing for it to land on.
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(back, camX, camY, visW, visH, 0, 0, visW, visH);

    // Confetti, lit by the room it falls through.
    if (confetti.length){
      g.globalCompositeOperation = 'source-over';
      g.translate(-camX, -camY);
      const lvl = Math.round(7 * clamp01((.55 + .45 * Math.max(L * (1 - H), 1 - night) - .45) / .55));
      for (let i = confetti.length - 1; i >= 0; i--){
        const q = confetti[i];
        q.vz = Math.max(-4.2, q.vz - 9 * pdt);
        q.x += (q.vx + Math.sin(t * q.f + q.ph) * 1.6) * pdt; q.y += q.vy * pdt; q.z += q.vz * pdt;
        q.vx *= 1 - .6 * pdt; q.vy *= 1 - .4 * pdt;
        if (q.z <= 0){ confetti.splice(i, 1); continue; }
        const [cx, cy] = P2(q.x, q.y, q.z);
        const flip = Math.sin(t * q.f * 1.7 + q.ph) > 0;
        g.fillStyle = FETTI_SH[q.c][flip ? 0 : 1][lvl]; g.fillRect(cx, cy, flip ? 2 : 1, 1);
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
    }

    // 5. WHAT GLOWS: the screen, lenses, bulbs, phones, and the beams in their haze.
    eg.setTransform(1, 0, 0, 1, 0, 0);
    eg.globalCompositeOperation = 'source-over';
    eg.clearRect(0, 0, visW, visH);
    eg.translate(-camX, -camY);
    eg.globalCompositeOperation = 'lighter';
    screen(eg, p, t, pulse);
    FIX.forEach((fx, i) => {
      const [px, py] = P2(fx, -.8, TRUSS_Z - 1.2);
      const col = strobe ? [255, 255, 255] : p[(i + beatN) % 2];
      const on = (strobe ? 1 : (.35 + .65 * L) * (.65 + .35 * pulse)) * (show || L > .1 ? 1 : .3);
      eg.fillStyle = rgb(col, on); eg.fillRect(px - 1, py, 2, 1);
      if (on > .5 && night > .3 && (i + beatN) % 3 === 0) glint(eg, px, py, col, on * night, 2 + (pulse > .6 ? 1 : 0));
    });
    // Par cans along the lip of the deck, chasing.
    for (let i = 0; i < 9; i++){
      const [px, py] = P2(-12 + i * 3, .1, DECK.z + .3);
      const ch = .5 + .5 * Math.sin(ph * Math.PI + i * .9);
      eg.fillStyle = rgb(p[i % 2], (.25 + .75 * ch) * L * (show ? 1 : .2));
      eg.fillRect(px, py, 1, 1);
    }
    for (const [x, y] of LAMPS){
      const [px, py] = P2(x, y, 11.4);
      eg.fillStyle = rgb([255, 236, 190], .35 + .65 * night); eg.fillRect(px - 1, py - 1, 2, 2);
    }
    for (const yy of [14, 30]){
      for (let x = -30; x <= 30; x += 2.4){
        const sag = 1.6 * (1 - (x / 30) ** 2);
        const [px, py] = P2(x, yy, 13 - sag);
        const tw = .75 + .25 * Math.sin(t * 2.3 + x * 1.7 + yy);
        eg.fillStyle = rgb([255, 214, 150], (.25 + .75 * night) * tw);
        eg.fillRect(px, py, 1, 1);
      }
    }
    if (st.encore && H < .5){
      for (const c of crowd){
        if (c.pose !== 'phone' || c.px == null) continue;
        const fl = .8 + .2 * Math.sin(t * 4 + c.phase);
        const qx = c.px - Math.round(.85 / ART), qy = c.py - Math.round(6.05 * CE / ART);
        eg.fillStyle = rgb([230, 242, 255], fl); eg.fillRect(qx, qy, 1, 2);
        pool(lg, qx, qy + 6, 8, [190, 215, 255], .25 * fl);
      }
    }
    // The backlights' lenses on the roof, pointed straight at you.
    if (show && e > .3){
      for (let i = 0; i < 6; i++){
        const [px, py] = P2(-12.5 + i * 5, -15.2, 19.8);
        const col = strobe ? [255, 255, 255] : p[(i + beatN + 1) % 2];
        const on = (e - .2) * L * (.6 + .4 * pulse);
        eg.fillStyle = rgb(col, Math.min(1, on * 1.3)); eg.fillRect(px - 1, py, 3, 1);
        if (night > .3 && on > .35) glint(eg, px, py, col, on * night, 3);
      }
    }
    // Dust drifting in the light over the deck.
    if (show && L > .2 && !lite){
      eg.fillStyle = rgb(mixc(p[0], [255, 255, 255], .6));
      for (const m of motes){
        const mx = m.x + Math.sin(t * m.s + m.ph) * 1.5, mz = m.z + Math.sin(t * m.s * .7 + m.ph * 2) * 1.2;
        const [px, py] = P2(mx, m.y, mz);
        eg.globalAlpha = .18 * L * dark * (.5 + .5 * Math.sin(t * 2 + m.ph));
        eg.fillRect(px, py, 1, 1);
      }
      eg.globalAlpha = 1;
    }
    // Fireflies out at the edges of the lawn once it is dark.
    if (night > .25 && !lite){
      for (const f of flies){
        const fx = f.x + Math.sin(t * .3 + f.ph) * 3, fy = f.y + Math.cos(t * .23 + f.ph) * 3, fz = f.z + Math.sin(t * .9 + f.ph) * .8;
        const bl = Math.max(0, Math.sin(t * 1.3 + f.ph * 3)) ** 3;
        if (bl < .05) continue;
        const [px, py] = P2(fx, fy, fz);
        eg.fillStyle = '#d2ff78'; eg.globalAlpha = bl * night * .9; eg.fillRect(px, py, 1, 1);
      }
      eg.globalAlpha = 1;
    }
    // Sparks: fountains at the lip of the deck for the last song of a night that went off.
    if (!reduce && now < sparkUntil){
      for (const x of [-11, -4, 4, 11]) for (let n = 0; n < 3; n++){
        sparks.push({ x: x + (Math.random() - .5) * .4, y: .2, z: DECK.z + .4, vx: (Math.random() - .5) * 3,
          vy: (Math.random() - .3) * 2, vz: 13 + Math.random() * 9, life: .7 + Math.random() * .6 });
      }
    }
    for (let i = sparks.length - 1; i >= 0; i--){
      const q = sparks[i];
      q.vz -= 30 * pdt; q.x += q.vx * pdt; q.y += q.vy * pdt; q.z += q.vz * pdt; q.life -= pdt;
      if (q.life <= 0 || q.z < 0){ sparks.splice(i, 1); continue; }
      const [px, py] = P2(q.x, q.y, q.z);
      eg.fillStyle = q.life > .45 ? '#fff6d8' : q.life > .2 ? '#ffc060' : '#ff8a28';
      eg.globalAlpha = Math.min(1, q.life * 1.8);
      eg.fillRect(px, py, 1, 1);
    }
    eg.globalAlpha = 1;
    eg.setTransform(1, 0, 0, 1, 0, 0);
    eg.drawImage(beams, 0, 0);
    g.globalCompositeOperation = 'lighter';
    g.drawImage(emit, 0, 0);
    // The wall is the biggest light in the room; at full strength in the bloom it fogs the band out.
    eg.globalCompositeOperation = 'destination-out';
    eg.fillStyle = 'rgba(0,0,0,.55)';
    eg.fillRect(SCR.x - camX, SCR.y - camY, LED.w * 2, LED.h * 2);
    eg.globalCompositeOperation = 'source-over';
    drawSky(t, night, p, show, L);
    g.globalCompositeOperation = 'source-over';
    if (now < st.flashUntil){
      g.fillStyle = rgb([255, 255, 255], .4 * (st.flashUntil - now) / 260);
      g.fillRect(0, 0, visW, visH);
    }

    // 6. ON TO THE SCREEN: the pixels whole, then the bloom over them at the screen's own resolution,
    //    which is what makes a lens or a beam read as light rather than as a coloured shape.
    out.globalCompositeOperation = 'source-over';
    out.imageSmoothingEnabled = false;
    out.drawImage(buf, 0, 0, visW * k, visH * k);
    // The soft copy for the depth of field: a third, then a quarter, so it is round rather than blocky.
    const da = dofA.getContext('2d');
    da.globalCompositeOperation = 'copy'; da.imageSmoothingEnabled = true; da.imageSmoothingQuality = 'high';
    da.drawImage(buf, 0, 0, dofA.width, dofA.height);
    dc.globalCompositeOperation = 'copy'; dc.imageSmoothingEnabled = true; dc.imageSmoothingQuality = 'high';
    dc.drawImage(dofA, 0, 0, dof.width, dof.height);
    const vc = mixc([18, 8, 34], mixc(p[0], [10, 6, 24], .75), night * (1 - H));
    const va = (.32 + .3 * night).toFixed(2);
    vig.style.background = `radial-gradient(ellipse 85% 75% at 50% ${tallShot() ? 38 : 42}%, transparent 52%, ${rgb(vc, va)} 100%)`;
    const ba = bloomA.getContext('2d'), bb = bloomB.getContext('2d');
    ba.globalCompositeOperation = 'copy'; ba.imageSmoothingEnabled = true;
    ba.drawImage(emit, 0, 0, bloomA.width, bloomA.height);
    bb.globalCompositeOperation = 'copy'; bb.imageSmoothingEnabled = true;
    bb.drawImage(bloomA, 0, 0, bloomB.width, bloomB.height);
    gg.globalCompositeOperation = 'copy'; gg.imageSmoothingEnabled = true; gg.imageSmoothingQuality = 'high';
    gg.globalAlpha = .55 + .25 * night;
    gg.drawImage(bloomA, 0, 0, glow.width, glow.height);
    gg.globalCompositeOperation = 'lighter';
    gg.globalAlpha = .5 + .35 * night;
    gg.drawImage(bloomB, 0, 0, glow.width, glow.height);
    gg.globalAlpha = 1;
    out.globalAlpha = 1;
    out.globalCompositeOperation = 'source-over';
    shake();
  }

  function ease(dt){
    const f = 1 - Math.pow(.03, dt);
    st.light += (st.lightWant - st.light) * f;
    st.house += (st.houseWant - st.house) * f;
    st.energy += (st.energyWant - st.energy) * f;
    st.density += (st.densityWant - st.density) * f * .5;
    st.sky += (st.skyWant - st.sky) * f * .35;
    if (st.palT < 1) st.palT = Math.min(1, st.palT + dt / 1.2);
  }

  function frame(ts){
    if (dead) return;
    if (!view.isConnected){ destroy(); return; }
    raf = requestAnimationFrame(frame);
    // Thirty frames a second: people move on the beat, not per frame.
    if (ts - last < 32) return;
    const dt = Math.min(.1, (ts - (last || ts)) / 1000);
    last = ts; now = ts;
    ease(dt);
    pdt = dt;
    const t0 = performance.now();
    draw();
    pdt = 0;
    costMs = costMs * .92 + (performance.now() - t0) * .08;
    if (!lite && costMs > 24) lite = true;
  }

  function setPalette(name){
    const next = PALETTES[name] || PALETTES.jam;
    if (next === st.pal) return;
    st.palFrom = palette(); st.pal = next; st.palT = 0;
  }

  const DENSITY = { hot: 1, warm: .8, cold: .52 };

  /* The whole interface. The page hands over what happened; the stage decides only how it looks.
     `progress` is how far through the night the show is, and it is what sets the sun. */
  function cue(ev){
    const ts = performance.now();
    if (ev.progress != null) st.skyWant = clamp01(ev.progress);
    if (ev.kind === 'set'){
      st.band = true; st.bow = false; st.encore = !!ev.encore;
      st.houseWant = 0; st.lightWant = .5; st.energyWant = .3;
      setPalette(ev.encore ? 'encore' : 'house');
      st.jumpUntil = ts + 1200;
    } else if (ev.kind === 'song'){
      st.band = true; st.houseWant = 0;
      st.lightWant = .55 + ev.energy * .45;
      st.energyWant = clamp01(ev.energy + (ev.jam ? .25 : 0));
      setPalette(ev.palette || ROTATION[st.rot++ % ROTATION.length]);
      st.mode++;
      if (ev.segue) st.segueUntil = ts + 1500;
      if (ev.bustout){ burst(150); shakeUntil = ts + 320; shakeAmp = 3; st.signsUntil = ts + 3400; st.jumpUntil = ts + 2000; st.flashUntil = ts + 260; st.strobeUntil = ts + 1600; }
      if (ev.grade) st.densityWant = DENSITY[ev.grade] || .8;
    } else if (ev.kind === 'time'){
      if (!ev.last){ st.band = false; st.houseWant = .85; st.lightWant = 0; st.energyWant = .15; }
    } else if (ev.kind === 'final'){
      st.band = true; st.bow = true; st.skyWant = 1;
      st.houseWant = 0; st.lightWant = 1; st.energyWant = ev.grade === 'cold' ? .4 : 1;
      st.densityWant = DENSITY[ev.grade] || .8;
      st.flashUntil = ts + 260;
      if (ev.grade !== 'cold'){ st.jumpUntil = ts + 3000; st.strobeUntil = ts + 1400; burst(240); sparkUntil = ts + 2600; shakeUntil = ts + 320; shakeAmp = 4; }
    }
    // The lawn only rethinks its poses all at once when something big happens. Reset on every song,
    // a night of one second songs had the whole crowd changing pose every second.
    if (ev.kind !== 'song' || ev.bustout) for (const c of crowd) c.until = 0;
    if (reduce || ev.instant){
      st.light = st.lightWant; st.house = st.houseWant; st.energy = st.energyWant;
      st.density = st.densityWant; st.sky = st.skyWant; st.palT = 1; st.flashUntil = 0;
      now = ts; draw();
    }
  }

  function destroy(){
    dead = true;
    if (glow.parentElement) glow.remove();
    if (dof.parentElement) dof.remove();
    if (vig.parentElement) vig.remove();
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', fit);
  }

  window.addEventListener('resize', fit);
  fit();
  if (!reduce) raf = requestAnimationFrame(frame);
  return { cue, destroy, fit, sprites: frames };
}
