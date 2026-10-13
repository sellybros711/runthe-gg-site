/* THE ROOMS, DRAWN.
 *
 * setlist/venues.js says which rooms there are and how each is earned. This says what each one looks
 * like. A room is everything around the band: the ground, what stands behind the stage, the sky or the
 * ceiling, how many people fit and where they stand, and the lights that belong to the place. The band
 * and its gear are the same in every room, so the band always looks like itself; only the stage house
 * around them is sized to the room (RIGS).
 *
 * Every room is built from the stage's own kit (K, handed in by stage.js): solids in feet, splatted and
 * painted by PXHD, so a pub and a canyon are lit and outlined exactly like the lawn.
 *
 * A ROOM HAS NO NAME HERE EITHER. Its key is an id and its comments say what it is drawn from; nothing
 * in this file reaches the screen as words.
 *
 * WHAT A ROOM IS
 *   sky      'open' (day into night over the show) or 'indoor' (house lights, then dark)
 *   skyMap   optional, turns the show's progress into the sky's: a room that lives at sunset
 *   rig      which stage house it gets, a key of RIGS
 *   far      the ground stops here, hidden behind whatever stands at the back
 *   ground   the colour of the floor at (x, y), or null to leave it empty for the sky
 *   build    everything else in the back layer, once
 *   floor    where the crowd stands: y0 to y1, its half width and gap at y, cells to keep clear,
 *            how full it gets (`capacity`), how deep the crowd shot's rail-to-back runs (`deep`) and
 *            the row its back sits on (`back`)
 *   light    per frame, pools of light on the world (the room's own lamps)
 *   beam     per frame, cones in the haze
 *   glow     per frame, what glows by itself
 *
 * THE SIGNATURE MOMENT. Each room has one thing that belongs to it and is made of light the stage
 * already has: a pool, a glowing dot, a cone. They live in light/beam/glow and are keyed off the
 * night (`F.night`), the song (`F.e`, `F.p`) and the beat (`F.pulse`), never off a score.
 */

/* The stage house each kind of room gets. The deck, the riser and the band's gear never move.
   `fixY`/`fixZ` is where the row of movers hangs; `wallZ` is how tall the back wall is.

   THERE IS NO SCREEN BEHIND THE BAND. Goose tours a light rig, not video: flown diamond pods of truss,
   each one full of movers and pixel battens. `pods` is where each hangs over the deck, as [x, z] of its
   centre in feet, with `podR` the half width of the diamond and `podY` how far upstage it hangs. */
const PODS_V = [[-11.5, 16.2], [-6.9, 14.4], [-2.3, 12.6], [2.3, 12.6], [6.9, 14.4], [11.5, 16.2]];
export const RIGS = {
  // Outdoor shed and arena: the truss on two towers with the PA hung off them, six pods in a V.
  shed:    { towers: true, truss: true, trussZ: 21.5, wallZ: 19.5, fixY: -.8, fixZ: 20.3, pods: PODS_V, podR: 2.2, podY: -12.6 },
  // A theatre: the same truss, wall and pods, no towers. The room's own proscenium frames it.
  theatre: { towers: false, truss: true, trussZ: 20, wallZ: 19.5, fixY: -.8, fixZ: 18.8, pods: PODS_V, podR: 2.2, podY: -12.6 },
  // A bar: a low back wall and no truss. Three small pods on chains, and a pipe of cans along the wall.
  club:    { towers: false, truss: false, trussZ: 12.5, wallZ: 12.5, fixY: -14.4, fixZ: 12.1,
             pods: [[-6.4, 10.4], [0, 11.1], [6.4, 10.4]], podR: 1.25, podY: -13.2 },
};

const SHIRTS = ['#e8505f', '#3f86d8', '#f2efe6', '#4fb36e', '#9b5fd0', '#2e3140', '#ef8a3c', '#2fb3c0',
  '#c7c065', '#7d5a44', '#ec7aa8', '#5fc4a0'];
const GREENS = ['#4f9a48', '#5aab50', '#3f8640'];

/* The default crowd: packed at the rail and thinning toward the back, room to see the ground between
   people the way the putt putt world shows its grass. */
const OPEN_FLOOR = { y0: 5.5, y1: 44, half: y => 19 + (y - 5) * .42, gap: y => 2.9 + (y - 5) * .05,
  capacity: 1, deep: 42.5, back: 47 };

function tree(K, x, y, r, h, greens = GREENS){
  const { G, cyl, ell, hash } = K;
  cyl(G, x, y, .7, 0, h * .55, 'x:#7a5236', null);
  ell(G, x, y, h, r, r * .9, r * .82, (px, py, pz) => 'x:' + greens[(hash(Math.floor(px * 1.5), Math.floor(pz * 1.5), 2) * 3) | 0]);
  ell(G, x - r * .5, y + .4, h - r * .35, r * .6, r * .55, r * .55, 'x:' + greens[1]);
  ell(G, x + r * .55, y + .3, h - r * .3, r * .6, r * .55, r * .5, 'x:' + greens[0]);
}

// ── the lawn ───────────────────────────────────────────────────────────────
/* A lawn in front of an outdoor stage, the way the Bend photos look: a treeline behind, lamp posts up
   the side paths, string lights over the grass and a merch tent at the back. */
const TENT = { x0: 15, x1: 22, y0: 42, y1: 47, z: 6.2 };
const inTent = (x, y, pad = 0) => x > TENT.x0 - pad && x < TENT.x1 + pad && y > TENT.y0 - pad && y < TENT.y1 + pad + 1;
const LAMPS = [[-31.8, -2], [31.8, -2], [-31.8, 18], [31.8, 18], [-31.8, 38], [31.8, 38]];

function grassAt(K, x, y){
  const { hash } = K;
  const n = hash(Math.floor(x * 2.5), Math.floor(y * 2.5), 3), p = hash(Math.floor(x / 2), Math.floor(y / 2), 5);
  if (n < .018) return ['#f4e9f2', '#f6d65a', '#e98bb4'][(n * 1000 | 0) % 3];
  if (p < .25) return '#79bc58';
  if (n > .85) return '#93d06c';
  return '#86c661';
}

const lawn = {
  sky: 'open', rig: 'shed', far: -40,
  ground(K, x, y){
    let col = grassAt(K, x, y);
    if (y > -20 && y < -16 && Math.abs(x) < 26) col = '#b9a78a';
    if (y > 1 && y < 3.2 && Math.abs(x) < 17) col = '#a8a29a';
    if (Math.abs(x) > 30 && Math.abs(x) < 33.5 && y > -10) col = (Math.floor(y * 2) % 2) ? '#d9cfba' : '#cfc4ad';
    return col;
  },
  build(K){
    const { G, rand, box, cap, cyl, ell } = K;
    // Blankets at the back of the lawn, where the people who came to sit, sit.
    for (let k = 0; k < 14; k++){
      const x = -26 + rand() * 52, y = 34 + rand() * 14;
      const c = SHIRTS[(rand() * SHIRTS.length) | 0], c2 = SHIRTS[(rand() * SHIRTS.length) | 0];
      if (inTent(x, y, 3)) continue;
      box(G, x - 2, x + 2, y - 1.4, y + 1.4, 0, .05, (px, py) => 'x:' + ((Math.floor(px) + Math.floor(py)) % 2 ? c : c2));
    }
    /* The merch tent at the back of the lawn, stage right: a striped canopy on four poles, a rack of
       shirts on the back wall and a counter out front. The last row of the crowd is named after it. */
    {
      const T = TENT;
      box(G, T.x0, T.x1, T.y0, T.y0 + .3, 0, T.z, (x, y, z, f) => {
        if (f === 'front' && z > 2.6 && z < 5.2){
          const k = Math.floor((x - T.x0) / 1.15);
          if ((x - T.x0) % 1.15 > .25 && k > 0 && k < 6) return 'x:' + SHIRTS[(k * 5) % SHIRTS.length];
        }
        return 'x:#e9e2d2';
      });
      for (const [x, y] of [[T.x0, T.y0], [T.x1, T.y0], [T.x0, T.y1], [T.x1, T.y1]]) cap(G, [x, y, 0], [x, y, T.z], .1, 'x:#d8d4cc');
      box(G, T.x0 - .3, T.x1 + .3, T.y0 - .3, T.y1 + .3, T.z, T.z + .5,
        x => 'x:' + (Math.floor((x - T.x0) * 1.1) % 2 ? '#f6f1e4' : '#e8505f'));
      box(G, T.x0 + .6, T.x1 - .6, T.y1 - 1.3, T.y1 - .3, 0, 2.4, (x, y, z, f) => 'x:' + (f === 'top' ? '#8a6a54' : '#5e4636'));
    }
    /* A treeline right across the back, close enough that its canopy hides where the lawn ends and low
       enough that the sky shows over it. Uneven on purpose: a skyline of equal trees reads as a fence. */
    for (let x = K.X0 - 3; x <= K.X1 + 3; x += 5.6 + rand() * 1.8){
      tree(K, x, -27 - rand() * 6, 5 + rand() * 1.6, 6.5 + rand() * 3.5);
    }
    for (const [x, y, r, h] of [[-21, -34, 6, 11], [19, -35, 6.5, 12],
      [-40, -18, 6, 14], [40, -18, 6, 13], [-40, 4, 5.5, 14], [41, 6, 5.5, 14],
      [-42, 26, 6, 15], [42, 30, 6, 15], [-38, 46, 5, 13], [40, 50, 5.5, 14]]) tree(K, x, y, r, h);
    // Lamp posts up the side paths.
    for (const [x, y] of LAMPS){
      cyl(G, x, y, .22, 0, 11, 'x:#3a3a44', null);
      ell(G, x, y, 11.4, .6, .6, .5, 'x:#f6efd8', { gloss: 2 });
    }
  },
  floor: Object.assign({}, OPEN_FLOOR, { skip: (x, y) => inTent(x, y, 1.5) }),
  light(F){
    // Lamp posts and the strings over the lawn, coming on with the dusk.
    for (const [x, y] of LAMPS) F.pool(x, y, 0, 30, [255, 206, 140], .5 * F.night);
    for (const yy of [14, 30]) for (let x = -30; x <= 30; x += 4.8) F.pool(x, yy, 0, 14, [255, 200, 130], .13 * F.night);
    // The bulbs under the merch tent.
    F.pool((TENT.x0 + TENT.x1) / 2, TENT.y1 - 1, 0, 34, [255, 214, 150], .55 * F.night);
  },
  glow(F){
    for (const [x, y] of LAMPS) F.dot(x, y, 11.4, [255, 236, 190], .35 + .65 * F.night, 2, 2, -1, -1);
    for (const yy of [14, 30]){
      for (let x = -30; x <= 30; x += 2.4){
        const sag = 1.6 * (1 - (x / 30) ** 2);
        const tw = .75 + .25 * Math.sin(F.t * 2.3 + x * 1.7 + yy);
        F.dot(x, yy, 13 - sag, [255, 214, 150], (.25 + .75 * F.night) * tw);
      }
    }
    for (let x = TENT.x0 + .6; x <= TENT.x1 - .6; x += 1.6) F.dot(x, TENT.y1 + .2, TENT.z - .2, [255, 222, 160], .4 + .6 * F.night);
  },
};


// ── shared pieces for rooms with a roof ─────────────────────────────────────
const plank = (K, x, y, a, b) => {
  const k = Math.floor(x * 1.25), h = K.hash(k, Math.floor(y / 6 + k * 3), 11);
  return h < .33 ? a : h < .66 ? b : PXMIX(a, b);
};
// A cheap midpoint of two hex colours, so a floor can carry three tones without a palette per room.
function PXMIX(a, b){
  const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const A = p(a), B = p(b);
  return '#' + A.map((v, i) => Math.round((v + B[i]) / 2).toString(16).padStart(2, '0')).join('');
}
const brick = (K, x, z, a, b, mortar) => {
  const row = Math.floor(z * 2.4), off = row % 2 ? .55 : 0, col = Math.floor((x + off) * 1.1);
  const fz = z * 2.4 - row, fx = (x + off) * 1.1 - col;
  if (fz < .16 || fx < .1) return mortar;
  return K.hash(col, row, 4) < .5 ? a : b;
};
/* A table and two stools, the furniture of a bar room. */
function barTable(K, x, y, top){
  const { G, cyl } = K;
  cyl(G, x, y, .18, 0, 3, 'x:#2c2420', null);
  cyl(G, x, y, 1.1, 3, 3.25, 'x:#4a3426', 'x:' + top, { gloss: 1 });
  for (const dx of [-1.8, 1.8]){
    cyl(G, x + dx, y + .2, .12, 0, 2.1, 'x:#3a3030', null);
    cyl(G, x + dx, y + .2, .55, 2.1, 2.35, 'x:#7a2a26', 'x:#9a3a32');
  }
}

// ── the pub ─────────────────────────────────────────────────────────────────
/* A long narrow bar room in Norwalk, where the band played most in the early years: brick, dark
   wood, a green wainscot with a brass rail, a dartboard and old framed pictures, pendant lamps, and
   the bar running across the back of the room. The stage is a low corner of it: no truss, three small pods. */
const pubWall = (K, x, z) => {
  if (z < 4.2) return z > 3.9 ? '#c8a042' : (Math.floor(x * 1.6) % 2 ? '#2f5a3e' : '#2a5238');
  if (z > 24) return (Math.floor(x / 4) % 2 ? '#3a2a20' : '#33251d');
  if (Math.abs(z - 24) < .5) return '#2a1c16';
  return brick(K, x, z, '#8a3e2c', '#7a3426', '#4a2a22');
};
const pub = {
  sky: 'indoor', rig: 'club', far: -21, ceiling: '#1a120e', dither: .03, dofZ: 30,
  rigOver: { wall: (x, y, z, f) => 'x:' + (f === 'top' ? '#3a2a20' : (Math.floor(x * 1.4) % 2 ? '#2a1e18' : '#241a14')) },
  ground(K, x, y){
    if (y > 38) return plank(K, x, y, '#4a3022', '#523626');
    return plank(K, x, y, '#5c3c28', '#664430');
  },
  build(K){
    const { G, box, wall, cyl, ell, cap, rand } = K;
    // The back wall, brick to the beams and dark planks above, covering everything the sky would be.
    wall(-20.5, K.X0 - 2, K.X1 + 2, 0, 70, (x, z) => {
      // Framed pictures over the stage, and a dartboard stage right.
      for (const [px, pz, w, h] of [[-9, 16, 3.2, 2.4], [-4.5, 17.2, 2.4, 3], [4.5, 16.6, 3.4, 2.6], [9.5, 17, 2.4, 3.2],
        [-28, 12, 3.4, 2.8], [-34, 13, 2.6, 3.2], [28, 11.5, 3.6, 2.6], [34, 13.5, 2.4, 3]]){
        if (Math.abs(x - px) < w / 2 && Math.abs(z - pz) < h / 2){
          const ix = Math.abs(x - px) > w / 2 - .3 || Math.abs(z - pz) > h / 2 - .3;
          if (ix) return '#c8a042';
          return ['#6a7a5a', '#8a7058', '#5a6a7a', '#7a6248'][Math.floor(K.hash(Math.floor(x * 2), Math.floor(z * 2), 7) * 4)];
        }
      }
      const dx = x, dz = z - 20.5, d = Math.hypot(dx, dz);
      if (d < 2){
        if (d < .25) return '#c83030';
        const ring = Math.floor(d * 4), seg = Math.floor((Math.atan2(dz, dx) + 4) * 3.2);
        if (d > 1.75) return '#1a1414';
        return ring % 2 ? (seg % 2 ? '#e8dcc0' : '#1a1414') : (seg % 2 ? '#2a8a3a' : '#c83030');
      }
      return pubWall(K, x, z);
    });
    // The bar across the back of the room: a long counter, its brass foot rail, stools, and the
    // shelves of bottles behind it.
    box(G, -22, 22, 45, 47, 0, 3.6, (x, y, z, f) => f === 'top' ? 'x:#3a2418' : (z < .6 ? 'x:#c8a042' : 'x:' + (Math.floor(x * 1.2) % 2 ? '#5a3624' : '#4e2e1e')), { gloss: 1 });
    for (let x = -20; x <= 20; x += 3.2){
      cyl(G, x, 43.6, .12, 0, 2.4, 'x:#3a3030', null);
      cyl(G, x, 43.6, .62, 2.4, 2.65, 'x:#7a2a26', 'x:#9a3a32');
    }
    wall(50, -24, 24, 0, 9.5, (x, z) => {
      const shelf = Math.floor(z / 2.2), fz = z / 2.2 - shelf;
      if (fz < .12) return '#3a2418';
      if (shelf >= 1 && shelf <= 3 && fz > .2 && fz < .85){
        const k = Math.floor((x + 30) * 2.6);
        if (K.hash(k, shelf, 3) < .82 && ((x + 30) * 2.6) % 1 > .25)
          return ['#2a6a3a', '#7a3a1a', '#c8a042', '#3a4a7a', '#8a8a92', '#6a2a2a'][(K.hash(k, shelf, 9) * 6) | 0];
      }
      return Math.abs(x) < 3 && z > 6.8 ? '#c8a042' : '#2c1c14';
    });
    // Booths down the stage left wall, tables down stage right.
    for (const y of [14, 22, 30]){
      box(G, -46, -38, y - 1.4, y + 1.4, 0, 2.2, 'x:#6a2620');
      box(G, -46, -38, y + 1.4, y + 2.2, 0, 4.4, 'x:#5a201c');
      box(G, -45, -39, y - 3.6, y - 1.6, 0, 3, (x2, y2, z2, f) => 'x:' + (f === 'top' ? '#4a3022' : '#3a2418'));
    }
    for (const [x, y] of [[36, 12], [40, 22], [35, 30], [41, 38]]) barTable(K, x, y, '#5a3a26');
    // Pendant lamps hanging into the room.
    for (const [x, y] of PUB_LAMPS){
      cap(G, [x, y, 17.4], [x, y, 15.6], .05, 'x:#1a1414');
      ell(G, x, y, 15.2, .9, .9, .55, 'x:#2a4a32', { gloss: 1 }, (u, v, w) => w > -.2);
    }
  },
  floor: { y0: 5.5, y1: 41.5, half: y => 15 + (y - 5) * .36, gap: y => 2.8 + (y - 5) * .05,
    capacity: .85, deep: 40, back: 47, skip: (x, y) => x < -36 || x > 33 },
  light(F){
    for (const [x, y] of PUB_LAMPS) F.pool(x, y, 0, 26, [255, 196, 120], .32 + .18 * F.H);
    // The bar's own light along the back.
    for (let x = -18; x <= 18; x += 6) F.pool(x, 47, 3.6, 18, [255, 190, 110], .45);
  },
  glow(F){
    for (const [x, y] of PUB_LAMPS) F.dot(x, y, 14.7, [255, 214, 150], .65 + .25 * F.H, 2, 1, -1, 0);
    // The bottles behind the bar catch the light from the stage and wink on the beat.
    for (let k = 0; k < 18; k++){
      const x = -20 + k * 2.35, z = 3.4 + (k % 3) * 2.2;
      const tw = .5 + .5 * Math.sin(F.t * 1.6 + k * 2.1);
      F.dot(x, 50, z, F.p[k % 2], (.2 + .35 * F.L * (1 - F.H)) * tw);
    }
  },
};
const PUB_LAMPS = [[-24, 6], [-24, 20], [-24, 34], [24, 6], [24, 20], [24, 34], [-8, 24], [8, 24], [0, 38]];

// ── the studio ──────────────────────────────────────────────────────────────
/* A live room in a recording studio in Norwalk, dressed for the holiday show that started there:
   pine plank walls with grey sound panels, rugs on a concrete floor, a tree stage right, a wreath
   over the band and coloured bulbs strung across the wall. */
const STUDIO_TREE = { x: 19, y: -4 };
const studio = {
  sky: 'indoor', rig: 'club', far: -21, ceiling: '#140e0a', dither: .04, dofZ: 30, indoor: [126, 110, 132],
  rigOver: { wall: (x, y, z, f) => 'x:' + (f === 'top' ? '#4a3626' : (Math.floor(x * 1.2) % 2 ? '#6a4a30' : '#62442c')) },
  ground(K, x, y){
    // Three rugs laid over each other on the concrete, the way a live room is.
    for (const [cx, cy, rx, ry, a, b] of [[-14, 18, 12, 9, '#7a2a2a', '#c89a4a'], [12, 26, 13, 10, '#2a4a6a', '#c8b48a'],
      [-2, 36, 15, 8, '#5a3a5a', '#d8a85a']]){
      const u = (x - cx) / rx, v = (y - cy) / ry;
      if (Math.abs(u) < 1 && Math.abs(v) < 1){
        if (Math.abs(u) > .9 || Math.abs(v) > .88) return b;
        return (Math.floor(Math.abs(u) * 6 + Math.abs(v) * 6) % 2) ? a : PXMIX(a, b);
      }
    }
    return K.hash(Math.floor(x * 1.5), Math.floor(y * 1.5), 2) < .5 ? '#8a8682' : '#828078';
  },
  build(K){
    const { G, box, wall, cyl, ell, cap } = K;
    wall(-20.5, K.X0 - 2, K.X1 + 2, 0, 70, (x, z) => {
      // The wreath, dead centre over the band.
      const d = Math.hypot(x, z - 18.5);
      if (d > 2 && d < 3.4) return K.hash(Math.floor(x * 3), Math.floor(z * 3), 5) < .2 ? '#c83030' : (d < 2.7 ? '#2a6a34' : '#3a8a40');
      if (Math.abs(x) < .8 && z < 16.4 && z > 15) return '#c83030';
      // Sound panels in a grid.
      const gx = ((x + 60) % 7), gz = (z % 7);
      if (z > 6 && z < 30 && gx > .8 && gx < 6.2 && gz > .8 && gz < 6.2 && Math.abs(x) > 5) return '#6a6870';
      if (z > 34) return Math.floor(x / 3) % 2 ? '#3a2a1e' : '#34261a';
      return plank({ hash: K.hash }, x, z * 3, '#b8864e', '#a8783e');
    });
    // The tree, stage right: a stack of cones, a star, and presents under it.
    const T = STUDIO_TREE;
    cyl(G, T.x, T.y, .4, 0, 1.6, 'x:#5a3a22', null);
    for (let k = 0; k < 5; k++){
      const z = 1.4 + k * 2.1, r = 3.4 - k * .6;
      ell(G, T.x, T.y, z + 1, r, r, 1.6, (px, py, pz) => 'x:' + (K.hash(Math.floor(px * 3), Math.floor(pz * 3) + k * 7, 8) < .1
        ? ['#e84a4a', '#f2c84a', '#4a8ae8', '#e8e8f0'][(K.hash(Math.floor(px * 3), k, 3) * 4) | 0] : '#2e7a3a'));
    }
    ell(G, T.x, T.y, 12.6, .55, .55, .55, 'x:#f6d24a', { gloss: 2 });
    for (const [dx, dy, c] of [[-2, 2, '#c83030'], [1.6, 2.4, '#3a6ac8'], [0, 3.4, '#e8c84a'], [2.6, .8, '#4aa85a']])
      box(G, T.x + dx - .6, T.x + dx + .6, T.y + dy - .6, T.y + dy + .6, 0, 1.1, (x, y, z, f) => 'x:' + (Math.abs(x - T.x - dx) < .12 || f === 'top' && Math.abs(y - T.y - dy) < .12 ? '#f2efe6' : c));
    // A couch and a lamp at the back of the room, and amp cases down the stage left wall.
    box(G, -12, 2, 44, 47, 0, 2.2, 'x:#5a4a6a');
    box(G, -12, 2, 46.2, 47.2, 0, 4.4, 'x:#4e405e');
    box(G, -13.4, -12, 44, 47.2, 0, 3.2, 'x:#4e405e'); box(G, 2, 3.4, 44, 47.2, 0, 3.2, 'x:#4e405e');
    cyl(G, 6, 45.6, .1, 0, 6, 'x:#2a2a30', null); ell(G, 6, 45.6, 6.4, .9, .9, .7, 'x:#e8d8a8');
    for (const y of [8, 16, 24, 32]) box(G, -44, -38, y - 2, y + 2, 0, 3.6, (x, y2, z, f) => 'x:' + (f === 'top' ? '#2a2a30' : (z > 3.2 || z < .3 ? '#8a8a92' : '#24242a')));
    for (const [x, y] of [[32, 14], [38, 30]]) box(G, x - 3, x + 3, y - 2, y + 2, 0, 2.6, 'x:#3a3a44');
  },
  floor: { y0: 5.5, y1: 42, half: y => 14 + (y - 5) * .38, gap: y => 3 + (y - 5) * .05,
    capacity: .75, deep: 40, back: 47, skip: (x, y) => (x > 26) || (x < -36) || (y > 41 && x > -14 && x < 7) },
  light(F){
    F.pool(STUDIO_TREE.x, STUDIO_TREE.y, 0, 36, [255, 200, 140], .35);
    F.pool(6, 45.6, 0, 26, [255, 210, 150], .5);
    for (const x of [-30, -15, 15, 30]) F.pool(x, 22, 0, 30, [255, 196, 130], .18 + .12 * F.H);
  },
  glow(F){
    // Coloured bulbs strung in swags across the wall, chasing round the room on the beat.
    const C = [[255, 80, 80], [255, 210, 80], [80, 150, 255], [90, 230, 120]];
    for (let x = -46; x <= 46; x += 1.6){
      const sw = ((x + 46) % 12) / 12, sag = 2.2 * Math.sin(sw * Math.PI);
      const k = Math.round((x + 46) / 1.6);
      const on = .45 + .55 * ((k + F.beatN) % 4 === 0 ? 1 : .5);
      F.dot(x, -20.4, 27 - sag, C[k % 4], on);
    }
    // The tree's own lights twinkle, and the star.
    for (let k = 0; k < 24; k++){
      const lv = k % 5, ang = k * 2.4, r = 3.2 - lv * .6;
      const tw = Math.max(0, Math.sin(F.t * 2.2 + k * 1.7));
      F.dot(STUDIO_TREE.x + Math.cos(ang) * r * .8, STUDIO_TREE.y + Math.sin(ang) * .5 + 1, 2.4 + lv * 2.1, C[k % 4], .3 + .7 * tw);
    }
    F.halo(STUDIO_TREE.x, STUDIO_TREE.y, 12.6, 9, [255, 220, 120], .55 + .25 * F.pulse);
    // Snow from a machine over the crowd, white flecks drifting down through the light.
    for (let k = 0; k < 40; k++){
      const x = -24 + ((k * 37) % 48), y = 4 + ((k * 13) % 34);
      const z = 22 - ((F.t * (1.4 + (k % 5) * .2) + k * 3.1) % 20);
      F.dot(x + Math.sin(F.t + k) * .8, y, z, [245, 248, 255], .35 + .2 * F.L);
    }
  },
};

// ── the theatre in Port Chester ─────────────────────────────────────────────
/* A 1920s movie palace: a gilded proscenium with red velvet drapes, cream and gold walls, boxes
   down both sides, a domed ceiling with a chandelier over the floor, and seats behind the GA floor.
   Its signature is the light on the walls: the room is famous for colour thrown across the plaster,
   so the song's palette drifts over the walls and the dome in big soft blooms. */
const capWall = (K, x, z) => {
  const ax = Math.abs(x);
  // The proscenium: a gold band round the stage opening, flat sides and a shallow arch.
  const archTop = 27 + 3 * Math.cos(Math.min(1, ax / 19) * Math.PI / 2);
  if (ax > 17 && ax < 19.6 && z < archTop) return K.hash(Math.floor(x * 3), Math.floor(z * 3), 6) < .25 ? '#e8c45a' : '#c89a3a';
  if (ax < 19.6 && z > archTop - 2.4 && z < archTop) return K.hash(Math.floor(x * 3), Math.floor(z * 3), 6) < .25 ? '#e8c45a' : '#c89a3a';
  // Drapes either side of the opening and a swag across the top.
  if (ax > 15.4 && ax <= 17 && z < archTop - 2.4) return Math.floor(x * 2.4) % 2 ? '#8a1a22' : '#7a141c';
  if (ax <= 17 && z > archTop - 5.2 && z <= archTop - 2.4) return Math.floor(x * 1.2 + Math.sin(x) ) % 2 ? '#8a1a22' : '#9a2028';
  if (ax < 17 && z < archTop) return '#1a1016';
  // The dome: coffers in gold on cream, going up into the dark.
  if (z > 33) {
    const cx = ((x + 60) % 6), cz = ((z - 33) % 5);
    if (cx < .6 || cz < .6) return '#b88a3a';
    return z > 48 ? '#4a3a32' : '#d8c8a4';
  }
  // Wall panels: cream with gold frames and red fields.
  const px = ((ax - 19.6) % 8), pz = z;
  if (pz > 4 && pz < 26 && px > 1 && px < 7){
    if (px < 1.4 || px > 6.6 || pz < 4.4 || pz > 25.6) return '#c89a3a';
    return '#8a2a2a';
  }
  return z < 3.4 ? '#5a2a22' : '#d8c8a4';
};
const CAP_CHAND = [-27, 27];
const cap_ = {
  sky: 'indoor', rig: 'theatre', far: -22, ceiling: '#1a1210', dither: .03, dofZ: 40, indoor: [124, 108, 132],
  ground(K, x, y){
    // Seats at the back, the GA floor in front of them, and red carpet down both aisles.
    if (y > 39){
      const r = (y - 39) % 2.2;
      if (Math.abs(x) < 2.2) return '#7a1a22';
      return r < .6 ? '#3a1a1a' : (Math.floor(x * 1.4) % 2 ? '#9a2028' : '#8a1a22');
    }
    if (Math.abs(x) > 30) return '#7a1a22';
    return plank(K, x, y, '#4a3426', '#523a2a');
  },
  build(K){
    const { G, box, wall, ell, cap } = K;
    wall(-21.5, K.X0 - 2, K.X1 + 2, 0, 80, (x, z) => capWall(K, x, z));
    // Boxes down both sides, two levels, gilt rails and red fronts.
    for (const s of [-1, 1]) for (const [z0, y0, y1] of [[7, -10, 24], [15, -14, 18]]){
      const xa = s < 0 ? -48 : 34, xb = s < 0 ? -34 : 48;
      box(K.G, xa, xb, y0, y1, z0 - 1, z0, (x, y, z, f) => 'x:' + (f === 'top' ? '#7a1a22' : '#c89a3a'));
      box(K.G, xa, xb, y1 - .4, y1, z0, z0 + 2.2, (x, y, z, f) => 'x:' + (z > z0 + 1.8 ? '#e8c45a' : '#8a1a22'));
    }
    // Chandeliers over the house, either side of the stage.
    for (const cx of CAP_CHAND){
      for (let k = 0; k < 3; k++) ell(G, cx, 2, 24 - k * 1.3, 2.4 - k * .6, 1.4 - k * .3, .7, 'x:#e8c45a', { gloss: 2 });
      ell(G, cx, 2, 21.6, .6, .6, 1, 'x:#f6e8b0', { gloss: 2 });
    }
  },
  floor: { y0: 5.5, y1: 37, half: y => 17 + (y - 5) * .3, gap: y => 2.8 + (y - 5) * .05,
    capacity: 1, deep: 36, back: 40 },
  light(F){
    // The projections: the night's colours thrown across the plaster in slow blooms.
    const a = (.35 + .25 * F.e) * (1 - F.H * .7);
    for (let k = 0; k < 5; k++){
      const x = -36 + k * 18 + Math.sin(F.t * .21 + k * 2) * 7, z = 30 + Math.sin(F.t * .17 + k) * 8;
      F.pool(x, -21.4, z, 70, F.p[k % 2], a, 1.1);
    }
    for (const cx of CAP_CHAND) F.pool(cx, 8, 0, 60, [255, 220, 160], .3 + .3 * F.H);
    for (const s of [-1, 1]) for (const y of [-6, 6, 16]) F.pool(s * 40, y, 8, 20, [255, 200, 130], .3);
  },
  glow(F){
    for (const cx of CAP_CHAND){
      F.halo(cx, 2, 22, 16, [255, 226, 160], .5 + .3 * F.H);
      for (let k = 0; k < 10; k++){
        const ang = k / 10 * Math.PI * 2;
        F.dot(cx + Math.cos(ang) * 2.2, 2 + Math.sin(ang) * 1.2, 23.4, [255, 236, 190], .8);
      }
    }
    // Footlights along the lip of the stage, the old theatre's own.
    for (let x = -13; x <= 13; x += 1.3) F.dot(x, .3, 4.1, [255, 220, 160], .35 + .3 * F.H);
  },
};

// ── the church in Nashville ─────────────────────────────────────────────────
/* A red brick tabernacle turned concert hall: curved wooden pews on the floor, a wraparound
   balcony, a plain plaster stage wall and tall arched windows of coloured glass either side. The
   glass is the signature: it glows, and the colour it throws lands on the pews. */
const WINDOWS = [-40, -30, 30, 40];
const glass = (x, z, wx) => {
  const u = x - wx, top = 19 + Math.sqrt(Math.max(0, 9 - u * u)) * .9;
  if (Math.abs(u) > 3 || z < 5 || z > top) return null;
  if (Math.abs(u) > 2.6 || z < 5.4 || z > top - .4) return '#3a2a22';
  const cell = Math.floor((u + 3) * 1.4) + Math.floor(z * .9) * 7;
  return ['#c83a3a', '#e8b83a', '#3a6ac8', '#4aa86a', '#9a4ac8', '#e87a3a'][cell % 6];
};
const ryman = {
  sky: 'indoor', rig: 'theatre', far: -22, ceiling: '#1a1210', dither: .03, dofZ: 40, indoor: [122, 108, 120],
  rigOver: { wall: (x, y, z, f) => 'x:' + (f === 'top' ? '#4a3626' : (Math.floor(z * 1.4) % 2 ? '#6a4a34' : '#5e422e')) },
  ground(K, x, y){
    // Pews in shallow arcs facing the stage, an aisle up each side.
    const yy = y + x * x * .004;
    if (yy > 6 && Math.abs(x) < 34 && Math.abs(Math.abs(x) - 12) > 1.6){
      const r = (yy - 6) % 3.4;
      if (r < .5) return '#3a2216';
      if (r < 1.6) return Math.floor(x * 1.1) % 2 ? '#a8723e' : '#9a6838';
    }
    return plank(K, x, y, '#6a4a32', '#62442e');
  },
  build(K){
    const { G, box, wall } = K;
    wall(-21.5, K.X0 - 2, K.X1 + 2, 0, 80, (x, z) => {
      for (const wx of WINDOWS){ const g = glass(x, z, wx); if (g) return g; }
      const ax = Math.abs(x);
      if (ax < 19 && z < 24) return z > 22.8 ? '#c8b48a' : (ax > 17.6 ? '#8a5a3a' : '#e8dcc0');
      if (z > 34) return Math.floor(x / 5) % 2 ? '#5a3a2a' : '#4e3224';
      return brick(K, x, z, '#9a4a34', '#8a402c', '#5a3226');
    });
    // The balcony: a curved front of wood with a gold rail, high across the back and down the sides.
    for (const s of [-1, 1]) box(G, s < 0 ? -48 : 36, s < 0 ? -36 : 48, -12, 40, 11, 13.6,
      (x, y, z, f) => 'x:' + (f === 'top' ? '#7a5a3a' : (z > 13.2 ? '#d8b04a' : '#6a4a32')));
  },
  floor: { y0: 5.5, y1: 44, half: y => 18 + (y - 5) * .34, gap: y => 3.1 + (y - 5) * .05,
    capacity: .95, deep: 42.5, back: 47 },
  light(F){
    // The colour through the glass, falling on the pews, stronger when the song is.
    for (const wx of WINDOWS){
      const c = WINDOWS.indexOf(wx) % 2 ? [255, 150, 90] : [120, 150, 255];
      F.pool(wx * .8, 12, 0, 60, c, .22 + .25 * F.e, .5);
      F.pool(wx, -21.4, 13, 24, [255, 230, 190], .3);
    }
    F.pool(0, 20, 0, 90, [255, 214, 160], .12 + .2 * F.H);
  },
  glow(F){
    // The glass glows on its own: a soft halo per window, breathing slowly.
    for (const wx of WINDOWS) F.halo(wx, -21.4, 13, 22, wx < 0 ? [140, 120, 255] : [255, 140, 90], .18 + .14 * Math.sin(F.t * .7 + wx));
  },
};

// ── the music hall in Midtown ───────────────────────────────────────────────
/* The great proscenium of nested arches, gold to coral, opening out from the stage like a sunrise
   over a sea of red seats. Coves between the arches carry their own light, and that is the moment:
   the coves light up ring by ring, outward, on the beat. */
const RINGS = [21, 26, 31, 36, 41, 46];
// The arches are squashed upright so the whole sunburst sits in what the camera sees over the stage.
const RADIO_SQ = 1.9;
const radio = {
  sky: 'indoor', rig: 'theatre', far: -22, ceiling: '#140c10', dither: .02, dofZ: 50, indoor: [128, 104, 118],
  ground(K, x, y){
    if (Math.abs(x) < 2 || Math.abs(x) > 34) return '#5a1a22';
    const r = (y - 4) % 2.4;
    if (y > 4) return r < .7 ? '#2a1214' : (Math.floor(x * 1.3) % 2 ? '#a82430' : '#962028');
    return '#3a1a1c';
  },
  build(K){
    const { wall } = K;
    // The arches, set on one plane behind the stage house, each a band with a dark cove inside it.
    wall(-21.5, K.X0 - 2, K.X1 + 2, 0, 80, (x, z) => {
      const d = Math.hypot(x, z * RADIO_SQ);
      for (let i = 0; i < RINGS.length; i++){
        const r0 = RINGS[i] - 5, r1 = RINGS[i];
        if (d >= r0 && d < r1){
          const t = (d - r0) / 5;
          if (t > .82) return '#2a1416';
          const base = ['#e8b05a', '#e8a052', '#e2904a', '#d88044', '#cc703e', '#c0623a'][i];
          return t < .2 ? PXMIX(base, '#fff0c0') : base;
        }
      }
      if (d < 16) return '#1a0e10';
      return '#7a3a2a';
    });
  },
  floor: { y0: 5.5, y1: 44, half: y => 18 + (y - 5) * .36, gap: y => 2.9 + (y - 5) * .05,
    capacity: 1, deep: 42.5, back: 47 },
  light(F){
    F.pool(0, -21.4, 16, 140, mixc3(F.p[0], [255, 200, 140], .5), .25 + .25 * F.e);
    F.pool(0, 20, 0, 120, [255, 190, 150], .1 + .25 * F.H);
  },
  glow(F){
    // Each cove is a line of light round its arch. One ring at a time runs brighter, outward.
    const lead = F.beatN % RINGS.length;
    for (let i = 0; i < RINGS.length; i++){
      const r = RINGS[i] - .6, hot = i === lead ? 1 : .35;
      const c = i % 2 ? F.p[0] : F.p[1];
      for (let a = 0; a <= Math.PI; a += .7 / r){
        F.dot(Math.cos(a) * r, -21.3, Math.sin(a) * r / RADIO_SQ, c, (.25 + .6 * hot * (1 - F.H * .6)) * (.6 + .4 * F.L));
      }
    }
  },
};
function mixc3(a, b, t){ return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

// ── the rocks ───────────────────────────────────────────────────────────────
/* An amphitheatre cut between two great slabs of red sandstone, stone rows climbing toward you and
   the plain opening out behind the stage, with a city's lights coming up on it after dark. The
   rocks catch the rig's colour, and the city is the moment: it twinkles in when the sun goes. */
function rnoise(x, y, s){
  // Smooth value noise for the stone, so a slab is a mass rather than a staircase.
  const xi = Math.floor(x), yi = Math.floor(y), u = x - xi, v = y - yi;
  const h = (i, j) => ((Math.imul(i * 374761393 + j * 668265263 + s * 982451653, 1274126177) >>> 0) / 4294967296);
  const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
  return h(xi, yi) * (1 - su) * (1 - sv) + h(xi + 1, yi) * su * (1 - sv) + h(xi, yi + 1) * (1 - su) * sv + h(xi + 1, yi + 1) * su * sv;
}
/* The height of stone at (x, y): two slabs, the stage left one taller, leaning out over the rows,
   their inner faces ragged. Zero where there is no rock. */
const rockAt = (x, y) => {
  const ax = Math.abs(x), left = x < 0;
  const inner = 19 + (y + 30) * .1 + rnoise(y * .15, left ? 1 : 7, 3) * 5;
  if (ax < inner || y < -44 || y > 32) return 0;
  const peak = left ? 50 : 40, mid = left ? -14 : -4;
  const body = peak * Math.max(0, 1 - ((y - mid) / 40) ** 2);
  const rise = Math.min(1, (ax - inner) / 6);
  return Math.max(0, body * rise * (.82 + .3 * rnoise(x * .12, y * .12, 9)));
};
const rocks = {
  sky: 'open', rig: 'shed', far: -78, dither: .06,
  skyMap: p => Math.min(1, p * 1.05),
  ground(K, x, y){
    if (y < -24){
      // The plain, out past the stage: dusty green fading to blue haze.
      const t = Math.min(1, (-24 - y) / 50);
      return K.hash(Math.floor(x), Math.floor(y), 4) < .3 ? PXMIX('#7a8a5a', '#8a9ab0') : (t > .5 ? '#7a8aa0' : '#8a8a62');
    }
    if (y > 3){
      // The stone rows, each a bench edge and a band of walkway.
      const r = (y - 3) % 2.3;
      if (Math.abs(x) < 1.6) return '#a86a4a';
      return r < .45 ? '#7a4a36' : r < 1.1 ? '#c88a64' : '#b87a58';
    }
    return '#a87458';
  },
  build(K){
    const { G, box } = K;
    // Each slab is a field of stone columns, a fraction of a foot wide, so its face is a surface.
    // The strata run across it with a tilt, the way the real ones lean.
    const stone = (px, py, pz, f) => {
      const b = pz * .55 + px * .18 + rnoise(px * .2, pz * .2, 5) * 1.6;
      const band = ((Math.floor(b) % 4) + 4) % 4;
      if (f === 'top') return 'x:' + (band % 2 ? '#c8784e' : '#bc6c46');
      return 'x:' + ['#b4553a', '#a84a32', '#c0603e', '#9c442e'][band];
    };
    for (let x = K.X0 - 2; x <= K.X1 + 2; x += .5){
      for (let y = -44; y <= 32; y += .8){
        const h = rockAt(x + .25, y + .4);
        if (h < 1) continue;
        // Only the face the column in front of it leaves showing is drawn, so no gap opens below.
        const hf = rockAt(x + .25, y + 1.2);
        box(G, x, x + .5, y, y + .8, Math.max(0, Math.min(h - 1, hf - .4)), h, stone);
      }
    }
    // Pines along the plain's near edge.
    for (let x = -18; x <= 18; x += 3.4) if (Math.abs(x) > 2) {
      K.cyl(G, x, -28, .3, 0, 2, 'x:#4a3424', null);
      K.ell(G, x, -28, 4, 1.4, 1.4, 2.6, 'x:#3a5a3a');
    }
  },
  floor: { y0: 5.5, y1: 44, half: y => 16 + (y - 5) * .26, gap: y => 2.9 + (y - 5) * .04,
    capacity: 1, deep: 42.5, back: 47 },
  light(F){
    // The rig washes the faces of both rocks in the song's colour once it is dark.
    for (const s of [-1, 1]) for (const z of [14, 30]){
      F.pool(s * 26, -6, z, 70, F.p[(s + 1) / 2], (.18 + .3 * F.e) * F.dark * (1 - F.H));
    }
    // Low sun on the stone before dark.
    F.pool(-30, -10, 30, 120, [255, 170, 110], .25 * (1 - F.night));
  },
  glow(F){
    // The city out on the plain. Thousands of lights, coming up as the sun goes down.
    if (F.night < .1) return;
    for (let k = 0; k < 140; k++){
      const x = -16 + ((k * 53) % 320) / 10, y = -60 + ((k * 29) % 300) / 10 - Math.abs(x) * .2;
      const tw = .55 + .45 * Math.sin(F.t * (1.2 + (k % 7) * .3) + k);
      F.dot(x, y, 0, k % 9 === 0 ? [255, 240, 200] : [255, 196, 120], F.night * .85 * tw);
    }
  },
};

// ── the arena above Penn Station ────────────────────────────────────────────
/* A round arena: the bowl of seats climbing on every side, the dark round ceiling with its cables
   running to the centre, and the ring of light that runs all the way round the bowl. The ring is
   the moment: it chases round in the song's colours. The upper bowl twinkles with phones. */
const GR = { rx: 46, rz: 11, cz: 15 };
const garden = {
  sky: 'indoor', rig: 'shed', far: -22, ceiling: '#06060c', dither: .02, dofZ: 50, indoor: [104, 100, 132],
  ground(K, x, y){
    const ax = Math.abs(x);
    // The floor, then the bowl: sections of seats in rows, separated by aisles.
    const bowl = Math.max(ax - 32, y - 43, -y - 20);
    if (bowl < 0) return y > -1 && y < 3.6 ? '#2a2a34' : '#3a3a48';
    const r = bowl % 2.2, sec = Math.floor((x + 60) / 7 + (y + 60) / 7);
    if (sec % 5 === 0 && r > 1.6) return '#4a4a5a';
    return r < .55 ? '#1a1a26' : (bowl > 12 ? '#3a4a7a' : '#2a3a6a');
  },
  build(K){
    const { wall } = K;
    // The ceiling, seen from the floor: a great dark disc, cables to the middle, the ring round it.
    wall(-21.5, K.X0 - 2, K.X1 + 2, 0, 90, (x, z) => {
      if (z < 6) return null;
      const u = x / GR.rx, v = (z - GR.cz) / GR.rz, d = Math.hypot(u, v);
      if (d > 1.12) return '#16141e';
      if (d > 1.02) return '#2a2a36';
      const a = Math.atan2(v, u), spoke = Math.abs(((a * 24 / Math.PI) % 1 + 1) % 1 - .5) < .07;
      if (d < .16) return '#3a3a46';
      return spoke ? '#4a4a58' : '#1e1c28';
    });
  },
  floor: { y0: 5.5, y1: 40, half: y => 19 + (y - 5) * .3, gap: y => 2.8 + (y - 5) * .05,
    capacity: 1, deep: 39, back: 43 },
  light(F){
    F.pool(0, 20, 0, 140, [200, 210, 255], .1 + .3 * F.H);
    for (const s of [-1, 1]) F.pool(s * 40, 10, 0, 90, F.p[(s + 1) / 2], .15 + .2 * F.e);
  },
  glow(F){
    // The ring of light round the bowl, chasing in the song's colours.
    const n = 96, ph = F.t * (.6 + F.e * 1.2);
    for (let k = 0; k < n; k++){
      const a = k / n * Math.PI * 2, x = Math.cos(a) * GR.rx * 1.07, z = GR.cz + Math.sin(a) * GR.rz * 1.07;
      if (z < 6) continue;
      const chase = .5 + .5 * Math.sin(a * 4 - ph * 3);
      F.dot(x, -21.4, z, F.p[k % 2], (.3 + .7 * chase) * (1 - F.H * .5), 2, 1);
    }
    // Phones in the upper bowl.
    for (let k = 0; k < 90; k++){
      const s = k % 2 ? 1 : -1, x = s * (36 + ((k * 7) % 12)), y = -16 + ((k * 23) % 60);
      const tw = Math.max(0, Math.sin(F.t * 1.3 + k * 1.9));
      F.dot(x, y, 0, [220, 236, 255], .5 * tw * (1 - F.H));
    }
    F.halo(0, -21.4, GR.cz, 30, [190, 200, 255], .08);
  },
};

// ── the beach ───────────────────────────────────────────────────────────────
/* A stage on the sand by the sea in Mexico: palms either side, the ocean behind the band with the
   sun going down into it, and a pool at the back. This room lives at sunset, so its sky stays gold
   for most of the night, and the sun on the water is the moment. */
const palm = (K, x, y, lean, h) => {
  const { G, cap, ell } = K;
  const top = [x + lean, y, h];
  cap(G, [x, y, 0], [x + lean * .5, y, h * .55], .42, 'x:#8a6a48');
  cap(G, [x + lean * .5, y, h * .55], top, .34, 'x:#8a6a48');
  for (let k = 0; k < 7; k++){
    const a = k / 7 * Math.PI * 2, dx = Math.cos(a) * 3.4, dy = Math.sin(a) * 2;
    ell(G, top[0] + dx * .55, top[1] + dy * .55, h - .6 - Math.abs(Math.sin(a)) * .4, 2.2, .7, .35, 'x:' + (k % 2 ? '#3a8a3a' : '#2e7a34'));
  }
  ell(G, top[0], top[1], h + .2, .9, .9, .6, 'x:#3a7a34');
};
// The sun sets stage left of the band, so the stage house never hides it.
const CABO_SUN = -24;
const cabo = {
  sky: 'open', rig: 'shed', far: -80, dither: .05,
  // Gold for most of the night: the show starts in the afternoon and is still at sunset by Set II.
  skyMap: p => p < .2 ? p * 2 : Math.min(.74, .4 + (p - .2) * .5),
  ground(K, x, y){
    if (y < -26) {
      // The sea, and the line of surf where it meets the beach.
      if (y > -30) return K.hash(Math.floor(x * 2), Math.floor(y * 3), 3) < .5 ? '#e8f0f0' : '#b8dce0';
      return K.hash(Math.floor(x * .8), Math.floor(y * 2), 5) < .2 ? '#4aa0c0' : (y < -55 ? '#2a6a9a' : '#3a86b0');
    }
    // The pool at the back, and the deck round it.
    if (y > 41 && Math.abs(x - 22) < 12) return Math.abs(x - 22) > 10.6 || y < 42.4 ? '#e8dcc8' : (K.hash(Math.floor(x), Math.floor(y * 2), 2) < .2 ? '#7ad8e8' : '#4ac0d8');
    return K.hash(Math.floor(x * 2), Math.floor(y * 2), 7) < .25 ? '#e8cc98' : '#dcbc88';
  },
  build(K){
    for (const [x, y, l, h] of [[-24, -16, -2, 17], [-31, -6, 2.4, 15], [-38, 8, -1.6, 18], [-26, 30, 2, 14],
      [24, -18, 2, 18], [32, -4, -2.4, 15], [39, 12, 1.6, 17], [41, 30, -2, 14]]) palm(K, x, y, l, h);
    // Loungers by the pool.
    for (let x = 12; x <= 32; x += 4) K.box(K.G, x - .8, x + .8, 46, 49.6, 0, 1, 'x:#f2efe6');
  },
  floor: { y0: 5.5, y1: 40, half: y => 18 + (y - 5) * .32, gap: y => 3 + (y - 5) * .05,
    capacity: .9, deep: 39, back: 47 },
  light(F){
    const gold = 1 - F.night;
    F.pool(0, -40, 0, 160, [255, 170, 100], .35 * gold);
    F.pool(22, 46, 0, 40, [120, 220, 240], .35 * F.night);
  },
  glow(F){
    // The sun, low over the water behind the band, and its path on the sea.
    const sink = Math.min(1, Math.max(0, (F.skyP - .3) / .5));
    const sz = 6 - sink * 7;
    if (sz > -1){
      F.halo(CABO_SUN, -47, Math.max(0, sz), 40, [255, 160, 90], .6 * (1 - sink * .7));
      F.halo(CABO_SUN, -47, Math.max(0, sz), 10, [255, 236, 190], .9 * (1 - sink * .6));
    }
    for (let k = 0; k < 60; k++){
      const y = -46 + (k % 30) * .6, x = CABO_SUN * (1 - (y + 46) / 30) + Math.sin(k * 3.7) * (2 + (y + 78) * .15);
      const tw = Math.max(0, Math.sin(F.t * 2 + k * 1.3));
      F.dot(x, y, 0, [255, 210, 140], .7 * tw * (1 - sink * .6));
    }
    // Torches along the edge of the sand once it is dark.
    for (const s of [-1, 1]) for (const y of [0, 14, 28]) {
      F.dot(s * 30, y, 5, [255, 170, 80], (.4 + .4 * Math.sin(F.t * 7 + y)) * F.night, 1, 2);
      F.light(s * 30, y, 0, 22, [255, 160, 80], .35 * F.night);
    }
  },
};

// ── shared pieces for the second wave ───────────────────────────────────────
/* A mountain or hill line seen behind the stage: a wall at depth y whose top is a ridge, null above
   it so the sky shows. `col(x, z, top)` paints the face. */
function ridge(K, y, peaks, col, seed = 1){
  const top = x => {
    let h = 0;
    for (const [px, ph, pw] of peaks){ const d = Math.max(0, 1 - Math.abs(x - px) / pw); h = Math.max(h, ph * d * (2 - d) * .9 + ph * .1 * d); }
    return h + rnoise(x * .35, seed, seed) * 2.2 + rnoise(x * 1.3, seed + 1, seed) * .9;
  };
  K.wall(y, K.X0 - 2, K.X1 + 2, 0, 60, (x, z) => { const t = top(x); return z > t ? null : col(x, z, t); });
}
/* Grass in a room's own three greens, with stones or flowers scattered through it, so two outdoor rooms
   differ even where a phone only sees the ground. */
function meadow(K, x, y, [a, b, c], dots = [], rate = .02){
  const n = K.hash(Math.floor(x * 2.5), Math.floor(y * 2.5), 3), p = K.hash(Math.floor(x / 2), Math.floor(y / 2), 5);
  if (dots.length && n < rate) return dots[(n * 997 | 0) % dots.length];
  return p < .25 ? b : (n > .85 ? c : a);
}
const LIGHTS = (x0, x1, step) => { const o = []; for (let x = x0; x <= x1 + .01; x += step) o.push(x); return o; };

// ── the band's own rec center ───────────────────────────────────────────────
/* A school gym turned studio for a run of nights in 2020 that nobody could come to: a painted court,
   a hoop on the back wall, folding bleachers, and cameras where the crowd would be. The tally lights
   on the cameras are the moment: red when they are live, which is always. */
const REC_CAMS = [[-9, 14], [9, 14], [0, 30], [-22, 24], [22, 22]];
const rec = {
  sky: 'indoor', rig: 'club', far: -21, ceiling: '#1c1a1a', dither: .02, dofZ: 34, indoor: [150, 140, 126],
  rigOver: { wall: (x, y, z, f) => 'x:' + (f === 'top' ? '#6a5a44' : (Math.floor(z * 1.5) % 2 ? '#8a6a44' : '#7e6040')) },
  ground(K, x, y){
    // Maple boards, the key painted in front of the stage and the centre circle out on the floor.
    const r = Math.hypot(x, (y - 26) * 1.1);
    if (Math.abs(r - 9) < .3 || Math.abs(y - 26) < .2 || Math.abs(Math.abs(x) - 38) < .25) return '#f2efe6';
    if (Math.abs(x) < 8 && y > 1 && y < 13) return Math.abs(Math.abs(x) - 7.8) < .25 || Math.abs(y - 12.8) < .25 ? '#f2efe6' : '#2a4a8a';
    return plank(K, x, y, '#c89a5e', '#d4a868');
  },
  build(K){
    const { G, box, wall, cyl, cap } = K;
    // Block walls painted in two tones, a stripe in the school's colour, banners up high.
    wall(-20.5, K.X0 - 2, K.X1 + 2, 0, 70, (x, z) => {
      for (const bx of [-30, -20, 20, 30]) if (Math.abs(x - bx) < 2.6 && z > 15 && z < 23)
        return z < 15.6 ? '#c89a3a' : (Math.floor((x - bx + 3) * 1.5) % 2 ? '#2a4a8a' : '#3a5a9a');
      // The backboard and hoop, over the stage.
      if (Math.abs(x) < 3.4 && z > 21 && z < 24.8) return Math.abs(x) > 3 || z < 21.4 || z > 24.4 ? '#c83a2a' : '#f2efe6';
      if (z > 30) return '#3a3632';
      if (Math.abs(z - 9) < .6) return '#2a4a8a';
      const row = Math.floor(z * 1.2), col = Math.floor((x + (row % 2) * .9) * .55);
      return (z * 1.2 - row < .1 || ((x + (row % 2) * .9) * .55) - col < .05) ? '#b8b0a2' : (z < 9 ? '#d8d0c0' : '#e6e0d2');
    });
    for (let k = 0; k < 9; k++) cyl(G, Math.cos(k / 9 * Math.PI * 2) * 1.2, -20, .06, 19.2, 20.6, 'x:#f2efe6', null);
    // Folded bleachers down both side walls.
    for (const s of [-1, 1]) for (let r = 0; r < 4; r++)
      box(G, s < 0 ? -47 + r * 1.6 : 40 - r * 1.6, s < 0 ? -40 + r * 1.6 : 47 - r * 1.6, -8, 40, r * 1.4, r * 1.4 + 1.4,
        (x, y, z, f) => 'x:' + (f === 'top' ? '#a87a4a' : '#5a4a3a'));
    // The cameras on their tripods.
    for (const [x, y] of REC_CAMS){
      for (const [dx, dy] of [[-.8, .6], [.8, .6], [0, -.9]]) cap(G, [x + dx, y + dy, 0], [x, y, 4.6], .07, 'x:#2a2a2e');
      box(G, x - .7, x + .7, y - 1.2, y + .6, 4.6, 5.8, 'x:#1e1e22', { gloss: 1 });
    }
  },
  floor: { y0: 6, y1: 34, half: y => 12 + (y - 5) * .3, gap: y => 6 + (y - 5) * .2,
    capacity: .12, deep: 30, back: 40, skip: (x, y) => REC_CAMS.some(([cx, cy]) => Math.abs(x - cx) < 3 && Math.abs(y - cy) < 3) },
  light(F){
    for (const x of [-24, -8, 8, 24]) for (const y of [6, 26]) F.pool(x, y, 0, 36, [255, 236, 200], .25 + .35 * F.H);
  },
  glow(F){
    for (const [x, y] of REC_CAMS) F.dot(x, y + .6, 5.6, [255, 50, 40], .7 + .3 * Math.sin(F.t * 2 + x), 1, 1);
    for (const x of [-24, -8, 8, 24]) for (const y of [6, 26]) F.dot(x, y, 30, [255, 246, 220], .4 + .5 * F.H, 3, 1);
  },
};

// ── the bar in Burlington ──────────────────────────────────────────────────
/* A low bar room with a pressed tin ceiling, a checker floor worn through in front of the stage and
   a long bar down stage right. It only opens after midnight. Its moment is the neon behind the bar,
   tubes in plain shapes that buzz and flicker with the beat. */
const NEON = [[-30, 13, '#ff4a6a'], [-22, 15, '#4ad8ff'], [24, 14, '#ffd84a'], [33, 12, '#7aff6a']];
const nectars = {
  sky: 'indoor', rig: 'club', far: -21, ceiling: '#141016', dither: .03, dofZ: 30, indoor: [112, 96, 128],
  ground(K, x, y){
    const c = (Math.floor(x / 1.6) + Math.floor(y / 1.6)) % 2;
    const worn = Math.hypot(x, y - 10) < 12 && K.hash(Math.floor(x * 2), Math.floor(y * 2), 3) < .25;
    if (worn) return '#4a3a34';
    return c ? '#2a2026' : '#6a5e5a';
  },
  build(K){
    const { G, box, wall, cyl } = K;
    wall(-20.5, K.X0 - 2, K.X1 + 2, 0, 70, (x, z) => {
      // Pressed tin up top, dark paint below, and the neon shapes on the wall.
      for (const [nx, nz] of NEON){
        const u = x - nx, v = z - nz;
        if (Math.abs(Math.hypot(u, v * 1.3) - 2.4) < .22 || (Math.abs(u) < 1.6 && Math.abs(v) < .18)) return '#e8e0e8';
      }
      if (z > 25){ const a = ((x + 60) % 2.4), b = ((z - 25) % 2.4); return a < .3 || b < .3 ? '#6a6268' : (Math.hypot(a - 1.35, b - 1.35) < .5 ? '#8a8288' : '#7a7278'); }
      if (z < 4) return '#3a2228';
      return Math.floor(x * 1.2) % 2 ? '#2a1e26' : '#261a22';
    });
    // The bar down stage right, with stools.
    box(G, 34, 38, -6, 42, 0, 3.6, (x, y, z, f) => f === 'top' ? 'x:#2a1a14' : (z < .6 ? 'x:#a8a0a8' : 'x:#4a2e22'), { gloss: 1 });
    for (let y = -2; y <= 40; y += 3.2){ cyl(G, 32.2, y, .12, 0, 2.4, 'x:#a8a0a8', null); cyl(G, 32.2, y, .6, 2.4, 2.65, 'x:#1e1a1e', 'x:#3a3238'); }
    for (const [x, y] of [[-34, 10], [-38, 22], [-33, 32]]) barTable(K, x, y, '#2a2226');
  },
  floor: { y0: 5.5, y1: 40, half: y => 14 + (y - 5) * .34, gap: y => 2.8 + (y - 5) * .05,
    capacity: .9, deep: 38, back: 44, skip: (x, y) => x > 30 || x < -30 },
  light(F){
    for (const [x, , c] of NEON) F.pool(x, -20.4, 12, 22, hex3(c), .35);
    F.pool(36, 18, 3.6, 40, [255, 180, 120], .35);
  },
  glow(F){
    for (const [nx, nz, c] of NEON){
      const flick = (F.beatN + nx) % 7 === 0 ? .4 : 1;
      F.halo(nx, -20.4, nz, 7, hex3(c), .45 * flick);
      for (let k = 0; k < 14; k++){ const a = k / 14 * Math.PI * 2; F.dot(nx + Math.cos(a) * 2.4, -20.3, nz + Math.sin(a) * 1.85, hex3(c), .9 * flick); }
    }
  },
};
function hex3(h){ return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); }

// ── the bowling alley in Brooklyn ───────────────────────────────────────────
/* A big warehouse room with a stage at one end and bowling lanes down stage left, the lanes lit
   from under their arrows, pins at the far end. The moment is a ball going down a lane on the beat
   and the pins answering. */
const LANES = [-37, -32.5, -28];
const bowl = {
  sky: 'indoor', rig: 'theatre', far: -21, ceiling: '#120c10', dither: .03, dofZ: 34, indoor: [118, 100, 120],
  rigOver: { wall: (x, y, z, f) => 'x:' + (f === 'top' ? '#3a2a24' : (Math.floor(z * 2.4) % 2 ? '#6a3226' : '#5e2c22')) },
  ground(K, x, y){
    // The lanes: pale maple with their gutters, the arrows partway down.
    for (const lx of LANES){
      if (Math.abs(x - lx) < 2.2){
        if (Math.abs(x - lx) > 1.75) return '#2a2226';
        if (y > 12 && y < 14 && Math.abs(x - lx) < .4) return '#c83a3a';
        return Math.floor((x - lx) * 3) % 2 ? '#e0b880' : '#d8ae72';
      }
    }
    if (x < -25.5) return '#1e1a20';
    return plank(K, x, y, '#3a2a26', '#42302a');
  },
  build(K){
    const { G, box, wall, cyl } = K;
    wall(-21.5, K.X0 - 2, K.X1 + 2, 0, 70, (x, z) => {
      if (z > 30) return Math.floor(x / 6) % 2 ? '#1e1418' : '#22181c';
      // The pin decks at the end of the lanes, lit white.
      for (const lx of LANES) if (Math.abs(x - lx) < 2 && z < 6) return z < 1 ? '#1a1416' : '#f2ece0';
      return brick(K, x, z, '#7a3426', '#6a2e22', '#3a2420');
    });
    for (const lx of LANES) for (const [dx, dy] of [[0, 0], [-.5, -.5], [.5, -.5], [-1, -1], [0, -1], [1, -1]])
      cyl(G, lx + dx, -19 + dy, .16, 0, 1.2, 'x:#f6f2ea', 'x:#e83a3a');
    // The return racks and seats at the near end of the lanes.
    for (const lx of LANES) box(G, lx - 1.2, lx + 1.2, 41, 44, 0, 2.2, (x, y, z, f) => 'x:' + (f === 'top' ? '#2a2a3a' : '#c83a3a'), { gloss: 1 });
  },
  floor: { y0: 5.5, y1: 40, half: y => 17 + (y - 5) * .28, gap: y => 2.8 + (y - 5) * .05,
    capacity: 1, deep: 38, back: 44, skip: (x, y) => x < -24 },
  light(F){
    for (const lx of LANES) F.pool(lx, 10, 0, 50, [190, 220, 255], .35, .3);
    F.pool(20, 20, 0, 80, [255, 190, 140], .1 + .25 * F.H);
  },
  glow(F){
    // A ball rolls down one lane per bar; when it lands the pins flash.
    const lane = LANES[F.beatN % 3], ph = (F.t * .7) % 1;
    F.dot(lane, 40 - ph * 58, .4, [255, 90, 160], .9, 2, 2);
    for (const lx of LANES) F.halo(lx, -19, 1, 5, [255, 255, 255], lx === lane && ph > .9 ? .8 : .2);
    for (const lx of LANES) for (let y = 0; y < 40; y += 4) F.dot(lx - 1.9, y, .1, [120, 200, 255], .35);
  },
};

// ── the old theatre in Norwalk ─────────────────────────────────────────────
/* A small downtown theatre from the twenties in the band's home town: a deco proscenium of stepped
   silver fins, walls in deep blue, a fan of light over the stage. The fan is the moment: its rays
   light one after another with the song. */
const wallst = {
  sky: 'indoor', rig: 'theatre', far: -22, ceiling: '#0c1018', dither: .03, dofZ: 40, indoor: [104, 112, 140],
  ground(K, x, y){
    if (y > 38){ const r = (y - 38) % 2.2; if (Math.abs(x) < 2.2) return '#2a2a5a'; return r < .6 ? '#141a2a' : (Math.floor(x * 1.4) % 2 ? '#2a3a6a' : '#24325e'); }
    if (Math.abs(x) > 30) return '#2a2a5a';
    return plank(K, x, y, '#3a2e2a', '#42342e');
  },
  build(K){
    const { wall, box, G } = K;
    wall(-21.5, K.X0 - 2, K.X1 + 2, 0, 80, (x, z) => {
      const ax = Math.abs(x);
      // The fan over the opening.
      const fz = z - 20, fd = Math.hypot(x, fz);
      if (fz > 0 && fd < 11){
        const ray = Math.floor((Math.atan2(fz, x) / Math.PI) * 11);
        return fd < 2 ? '#e8e8f2' : (ray % 2 ? '#a8b0c8' : '#5a6a9a');
      }
      // Stepped silver fins framing the stage.
      for (let k = 0; k < 4; k++) if (ax > 17 + k * 1.6 && ax < 18 + k * 1.6 && z < 24 - k * 2) return k % 2 ? '#c8ccd8' : '#9aa0b4';
      if (ax < 17 && z < 20) return '#0e0c14';
      if (z > 32) return '#141a2e';
      if (z > 4 && z < 26 && ((ax - 24) % 8 + 8) % 8 < .5) return '#a8b0c8';
      return z < 3 ? '#1a1a3a' : '#2a3466';
    });
    for (const s of [-1, 1]) box(G, s < 0 ? -48 : 36, s < 0 ? -36 : 48, -12, 26, 10, 12.4,
      (x, y, z, f) => 'x:' + (f === 'top' ? '#2a2a5a' : (z > 12 ? '#c8ccd8' : '#24325e')));
  },
  floor: { y0: 5.5, y1: 36, half: y => 16 + (y - 5) * .3, gap: y => 2.8 + (y - 5) * .05,
    capacity: .95, deep: 35, back: 40 },
  light(F){
    F.pool(0, -21.4, 26, 40, F.p[1], .3 + .2 * F.e);
    for (const s of [-1, 1]) F.pool(s * 30, -21.4, 14, 30, [170, 180, 255], .25);
    F.pool(0, 20, 0, 90, [220, 220, 255], .1 + .25 * F.H);
  },
  glow(F){
    const lead = F.beatN % 11;
    for (let k = 0; k < 11; k++){
      const a = (k + .5) / 11 * Math.PI, hot = k === lead ? 1 : .25;
      for (let r = 3; r < 11; r += 1.6) F.dot(Math.cos(a) * r, -21.3, 20 + Math.sin(a) * r, F.p[k % 2], (.2 + .7 * hot) * (1 - F.H * .5));
    }
  },
};

// ── the ballroom in Denver ─────────────────────────────────────────────────
/* A new black box ballroom: raw concrete, a steel ceiling grid, a tiered floor stepping up to a rail at
   the back, and tall bars of white light down the side walls. The bars are the moment: they run like
   a level meter with the song. */
const MBARS = LIGHTS(-46, -24, 3.2).concat(LIGHTS(24, 46, 3.2));
const mission = {
  sky: 'indoor', rig: 'theatre', far: -22, ceiling: '#0a0a0e', dither: .02, dofZ: 44, indoor: [112, 112, 124],
  rigOver: { wall: (x, y, z, f) => 'x:' + (f === 'top' ? '#3a3a40' : (Math.floor(z / 2) % 2 ? '#26262c' : '#2a2a30')) },
  ground(K, x, y){
    if (y > 30){ const t = Math.floor((y - 30) / 3); return (y - 30) % 3 < .3 ? '#c8c8d0' : ['#5a5a62', '#62626a', '#6a6a72'][t % 3]; }
    const n = K.hash(Math.floor(x * 1.4), Math.floor(y * 1.4), 5);
    return n < .2 ? '#6a6a70' : '#727278';
  },
  build(K){
    const { wall } = K;
    wall(-21.5, K.X0 - 2, K.X1 + 2, 0, 80, (x, z) => {
      if (z > 28){ const a = ((x + 60) % 4), b = ((z - 28) % 4); return a < .25 || b < .25 ? '#3a3a42' : '#121216'; }
      for (const bx of MBARS) if (Math.abs(x - bx) < .5 && z > 2 && z < 24) return '#d8d8e0';
      const n = K.hash(Math.floor(x * .8), Math.floor(z * .8), 7);
      return Math.floor(z / 4) % 2 ? (n < .3 ? '#56565c' : '#5e5e64') : (n < .3 ? '#62626a' : '#68686e');
    });
  },
  floor: { y0: 5.5, y1: 42, half: y => 19 + (y - 5) * .32, gap: y => 2.8 + (y - 5) * .05,
    capacity: 1, deep: 40, back: 45 },
  light(F){
    for (const s of [-1, 1]) F.pool(s * 34, -21.4, 12, 46, F.p[(s + 1) / 2], .2 + .25 * F.e);
    F.pool(0, 22, 0, 120, [220, 220, 240], .08 + .3 * F.H);
  },
  glow(F){
    const lvl = .3 + .7 * F.e * (.6 + .4 * F.pulse);
    for (const bx of MBARS){
      const top = 2 + 22 * Math.min(1, lvl * (.75 + .25 * Math.sin(bx + F.t * 3)));
      for (let z = 2.5; z < top; z += 1.4) F.dot(bx, -21.3, z, z > 18 ? F.p[0] : [240, 240, 255], .6 * (1 - F.H * .5), 1, 2);
    }
  },
};

// ── the drive-in on a farm ──────────────────────────────────────────────────
/* A hayfield in 2020, the crowd in pods beside their cars in rows, round bales and a red barn at the
   edge, the woods behind. The moment is the headlights: every car flashes its lights on the beat. */
const CARS = [];
for (const y of [14, 24, 34, 44]) for (let x = -36; x <= 36; x += 9) CARS.push([x + (y % 20 ? 3 : 0), y]);
const CAR_COLS = ['#c83a3a', '#3a6ac8', '#e8e0d0', '#2a2a30', '#4a8a4a', '#c8a03a', '#8a8a92'];
const farm = {
  sky: 'open', rig: 'shed', far: -46, dither: .02,
  ground(K, x, y){
    if (y > 8 && Math.abs(((y - 9) % 10) - 9.2) < .8) return '#c8b48a';   // the lanes between rows
    // Cut hay in stripes running away from the stage.
    const n = K.hash(Math.floor(x * 3), Math.floor(y * .6), 3);
    return Math.floor(x * .5) % 2 ? (n < .3 ? '#b8a85e' : '#c4b468') : (n < .3 ? '#a89a52' : '#b0a258');
  },
  build(K){
    const { G, box, ell, cyl, rand } = K;
    for (const [x, y] of CARS){
      const c = CAR_COLS[(K.hash(x, y, 5) * CAR_COLS.length) | 0];
      box(G, x - 2.2, x + 2.2, y - 1.4, y + 1.6, .5, 2.2, 'x:' + c, { gloss: 1 });
      box(G, x - 1.5, x + 1.5, y - .6, y + 1.2, 2.2, 3.4, (px, py, pz, f) => 'x:' + (f === 'front' ? '#3a4a5a' : c), { gloss: 1 });
      for (const dx of [-1.5, 1.5]) cyl(G, x + dx, y + 1.65, .5, .1, .6, 'x:#1a1a1e', null);
    }
    // The barn at the edge of the field, stage right, and bales.
    box(G, 32, 46, -30, -20, 0, 9, (x, y, z, f) => 'x:' + (f === 'top' ? '#5a2a22' : (Math.abs(x - 39) < 2 && z < 6 ? '#e8e0d0' : '#a8302a')));
    box(G, 31, 47, -31, -19, 9, 10.4, 'x:#4a3a36');
    for (const [x, y] of [[-30, -10], [-35, -4], [26, -6], [-24, -20], [40, -2]]) cyl(G, x, y, 1.8, 0, 3, 'x:#c8a858', 'x:#d8b868');
    for (let x = K.X0 - 3; x <= K.X1 + 3; x += 5 + rand() * 2) if (x < 28 || x > 48) tree(K, x, -38 - rand() * 5, 5 + rand() * 1.4, 7 + rand() * 3);
  },
  floor: { y0: 5.5, y1: 46, half: y => 34 + (y - 5) * .2, gap: y => 4.5 + (y - 5) * .06,
    capacity: .55, deep: 44, back: 48, skip: (x, y) => CARS.some(([cx, cy]) => Math.abs(x - cx) < 3.2 && Math.abs(y - cy) < 2.4) },
  light(F){
    F.pool(0, 20, 0, 160, [255, 200, 140], .2 * (1 - F.night));
  },
  glow(F){
    const on = F.night * (F.beatN % 2 ? .9 : .35);
    for (const [x, y] of CARS) for (const dx of [-1.6, 1.6]) F.dot(x + dx, y - 1.45, 1.4, [255, 246, 210], on, 1, 1);
  },
};

// ── the music bowl in New Haven ─────────────────────────────────────────────
/* An old tennis bowl in the band's home state turned outdoor stage: a low ring of concrete stands
   round a grass floor, the trees of the park looking in over the rim. Its moment is the stand lights
   on their tall poles, coming on as one when the sun goes. */
const WV_POLES = [[-40, -14], [40, -14], [-44, 22], [44, 22]];
const westville = {
  sky: 'open', rig: 'shed', far: -44, dither: .04,
  ground(K, x, y){
    // The concrete stands: rows stepping up round the sides and back.
    const bowl = Math.max(Math.abs(x) - 30, y - 42, -y - 24);
    if (bowl > 0){ const r = bowl % 1.8; return r < .35 ? '#8a8a84' : (r < .8 ? '#b8b4aa' : '#c8c4ba'); }
    return grassAt(K, x, y);
  },
  build(K){
    const { G, cyl, ell, rand } = K;
    for (let x = K.X0 - 3; x <= K.X1 + 3; x += 5 + rand() * 2) tree(K, x, -36 - rand() * 5, 5.5 + rand() * 1.5, 9 + rand() * 4);
    for (const [x, y] of WV_POLES){
      cyl(G, x, y, .3, 0, 22, 'x:#6a6a72', null);
      K.box(G, x - 2.4, x + 2.4, y - .3, y + .3, 21, 23.4, 'x:#3a3a42');
    }
  },
  floor: Object.assign({}, OPEN_FLOOR, { half: y => 20 + (y - 5) * .24 }),
  light(F){
    for (const [x, y] of WV_POLES) F.pool(x * .6, y + 18, 0, 70, [230, 240, 255], .3 * F.night);
  },
  glow(F){
    for (const [x, y] of WV_POLES) for (let k = 0; k < 4; k++) F.dot(x - 1.8 + k * 1.2, y + .35, 22.2, [240, 248, 255], .25 + .75 * F.night, 1, 2);
    for (const [x, y] of WV_POLES) F.halo(x, y, 22.2, 10, [220, 236, 255], .3 * F.night);
  },
};

// ── the pavilion in Saratoga ────────────────────────────────────────────────
/* A summer pavilion in a state park: white posts holding up the roof down both sides of the seats,
   the lawn climbing behind, and tall pines all round. Fireflies come out over the lawn as it gets
   dark, and they are the moment. */
const spac = {
  sky: 'open', rig: 'shed', far: -44, dither: .04,
  ground(K, x, y){
    // Seats in rows under the roof, then the lawn.
    if (y > 4 && y < 28 && Math.abs(x) < 30){
      if (Math.abs(x) < 1.6 || Math.abs(Math.abs(x) - 18) < 1.2) return '#8a7a6a';
      const r = (y - 4) % 2.3; return r < .6 ? '#2a3a2e' : (Math.floor(x * 1.3) % 2 ? '#2e6a4a' : '#2a6244');
    }
    return grassAt(K, x, y);
  },
  build(K){
    const { G, cyl, box, ell, rand } = K;
    const PINE = ['#2a5a3a', '#244e34', '#30623e'];
    const pine = (x, y, h) => {
      cyl(G, x, y, .5, 0, h * .3, 'x:#5a3a28', null);
      for (let k = 0; k < 4; k++) ell(G, x, y, h * (.35 + k * .17), 3.2 - k * .6, 3 - k * .55, 1.6, 'x:' + PINE[k % 3]);
    };
    for (let x = K.X0 - 3; x <= K.X1 + 3; x += 4.2 + rand() * 1.4) pine(x, -32 - rand() * 6, 15 + rand() * 6);
    for (const s of [-1, 1]) for (const y of [-16, 4, 30]) pine(s * (42 + rand() * 4), y, 16 + rand() * 4);
    // The roof's posts, white, down both sides of the seats, and its edge across the back of them.
    for (const s of [-1, 1]) for (const y of [2, 10, 18, 26]) cyl(G, s * 31, y, .5, 0, 16, 'x:#f2efe6', null);
    for (const s of [-1, 1]) box(G, s < 0 ? -33 : 29, s < 0 ? -29 : 33, 0, 28, 16, 17.4, (x, y, z, f) => 'x:' + (f === 'top' ? '#6a5a4a' : '#e8e2d4'));
  },
  floor: Object.assign({}, OPEN_FLOOR, { half: y => 19 + (y - 5) * .34 }),
  light(F){
    for (const s of [-1, 1]) for (const y of [6, 22]) F.pool(s * 26, y, 0, 26, [255, 210, 150], .35 * F.night);
  },
  glow(F){
    if (F.night < .2) return;
    for (let k = 0; k < 70; k++){
      const x = -40 + ((k * 37) % 80) + Math.sin(F.t * .3 + k) * 2, y = 28 + ((k * 17) % 22), z = 2 + ((k * 7) % 5) + Math.sin(F.t * .5 + k * 2);
      F.dot(x, y, z, [210, 255, 120], F.night * Math.max(0, Math.sin(F.t * 1.1 + k * 2.7)) * .9);
    }
  },
};

// ── the theatre in the hills over Los Angeles ───────────────────────────────
/* A stone stage in a canyon of the hills: a row of columns behind the band, the wooded slope rising
   on both sides and the sky going violet over the ridge. The columns are the moment, washed in warm
   light that turns to the song's colours after dark. */
const GREEK_COLS = [-30, -26, -22, -18, 18, 22, 26, 30];
const greek = {
  sky: 'open', rig: 'shed', far: -40, dither: .05,
  ground(K, x, y){
    if (y > 4){
      // Seats climbing toward you in arcs, grey stone aisles.
      const yy = y + x * x * .003, r = (yy - 4) % 2.4;
      if (Math.abs(x) < 1.6 || Math.abs(Math.abs(x) - 20) < 1.4) return '#a89a88';
      return r < .5 ? '#4a3a32' : (Math.floor(x) % 2 ? '#7a4a3a' : '#724436');
    }
    return '#c8b89c';
  },
  build(K){
    const { G, cyl, box, wall, rand } = K;
    // The hillside behind, dark chaparral with a road switching up it.
    ridge(K, -24, [[-38, 26, 30], [-10, 22, 22], [22, 30, 26], [46, 24, 24]], (x, z, t) => {
      const n = K.hash(Math.floor(x * 1.2), Math.floor(z * 1.2), 3);
      if (Math.abs(z - (8 + Math.sin(x * .2) * 3)) < .3) return '#c8b090';
      return z > t - 1.2 ? '#4a5a3a' : (n < .3 ? '#3a4a30' : '#42523a');
    }, 3);
    for (const x of GREEK_COLS){
      cyl(G, x, -18, .9, 0, 15, 'x:#e8dcc4', null);
      box(G, x - 1.3, x + 1.3, -19.3, -16.7, 15, 16, 'x:#d8ccb4');
    }
    for (const s of [-1, 1]) box(G, s < 0 ? -32 : 16, s < 0 ? -16 : 32, -19.6, -16.4, 16, 17.6, (x, y, z, f) => 'x:' + (f === 'top' ? '#c8bca4' : '#e2d6be'));
    for (const s of [-1, 1]) for (let y = -10; y < 46; y += 7 + rand() * 3) tree(K, s * (40 + rand() * 6), y, 4.5, 9 + rand() * 4, ['#3a5a34', '#466a3c', '#2e4e2a']);
  },
  floor: { y0: 5.5, y1: 44, half: y => 17 + (y - 5) * .34, gap: y => 2.9 + (y - 5) * .05,
    capacity: 1, deep: 42.5, back: 47 },
  light(F){
    for (const x of GREEK_COLS) F.pool(x, -16.5, 6, 18, F.dark > .4 ? F.p[x > 0 ? 1 : 0] : [255, 200, 140], .45);
  },
  glow(F){
    for (const x of GREEK_COLS) F.dot(x, -16.4, .6, [255, 214, 160], .6 * F.night, 2, 1);
    for (let k = 0; k < 40; k++) F.dot(-46 + k * 2.4, -23.8, 4 + (k * 7) % 9, [255, 210, 150], .4 * F.night * (.5 + .5 * Math.sin(F.t + k)));
  },
};

// ── the river bend in Montana ───────────────────────────────────────────────
/* A grass bowl on a bend of a river in the mountains: the water running behind the stage, gold hills
   and pines beyond, nothing else for miles. A full moon comes up over the hills, and that is the
   moment. */
const KH_MOON = 21;
const kettle = {
  sky: 'open', rig: 'shed', far: -60, dither: .05,
  ground(K, x, y){
    if (y < -20 && y > -25){
      if (y > -20.8 || y < -24.4) return '#8a7a5a';
      return K.hash(Math.floor(x * 1.5), Math.floor(y * 2), 5) < .15 ? '#7ab0c8' : '#3a7a9a';
    }
    if (y <= -25) return '#b8a060';
    return meadow(K, x, y, ['#a8aa5a', '#9a9c50', '#b8b866'], ['#d8c070', '#7a7a48']);
  },
  build(K){
    const { G, ell, cyl, rand } = K;
    ridge(K, -27, [[-44, 18, 30], [-14, 13, 22], [14, 16, 24], [44, 20, 28]], (x, z, t) =>
      K.hash(Math.floor(x), Math.floor(z), 4) < .25 ? '#a08a4a' : (z > t - 4 ? '#c8a858' : '#b89a50'), 4);
    for (let k = 0; k < 26; k++){
      const x = K.X0 + rand() * (K.X1 - K.X0), y = -25.5 - rand() * 1, h = 5 + rand() * 4;
      cyl(G, x, y, .4, 0, h * .3, 'x:#5a3a28', null);
      for (let j = 0; j < 3; j++) ell(G, x, y, h * (.4 + j * .2), 2.2 - j * .5, 2 - j * .4, 1.4, 'x:' + ['#2a4a32', '#30543a', '#264430'][j]);
    }
  },
  floor: Object.assign({}, OPEN_FLOOR),
  light(F){
    F.pool(KH_MOON, -22, 0, 60, [190, 210, 255], .3 * F.night);
  },
  glow(F){
    const rise = Math.min(1, Math.max(0, (F.skyP - .45) / .4));
    if (rise <= 0) return;
    const z = 8 + rise * 12;
    F.halo(KH_MOON, -27.5, z, 26, [200, 220, 255], .45 * rise);
    F.halo(KH_MOON, -27.5, z, 5, [255, 252, 236], .95 * rise);
    for (let k = 0; k < 24; k++) F.dot(KH_MOON + Math.sin(k * 2.3) * 3, -24.2 + (k % 8) * .5, 0, [230, 240, 255], .7 * rise * Math.max(0, Math.sin(F.t * 2 + k)));
  },
};

// ── the lake in the high mountains ──────────────────────────────────────────
/* A little amphitheatre on the shore of a mountain lake: the water behind the stage, a range of snow
   peaks beyond it, and at nine thousand feet the clearest sky anywhere. The moment is the peaks
   catching the last pink light, then the stars coming out over them. */
const dillon = {
  sky: 'open', rig: 'shed', far: -60, dither: .04,
  ground(K, x, y){
    if (y < -19){
      if (y > -19.8) return '#c8b89a';
      return K.hash(Math.floor(x * .8), Math.floor(y * 2), 5) < .12 ? '#6aa8c8' : '#2a6a8a';
    }
    if (rnoise(x * .4, y * .4, 8) > .78) return K.hash(Math.floor(x * 2), Math.floor(y * 2), 2) < .5 ? '#8a8a90' : '#9a9aa2';
    return meadow(K, x, y, ['#6aa85a', '#5e9a50', '#7ab868'], ['#c8a8e8', '#f2f2f2', '#e8d86a'], .035);
  },
  build(K){
    const { rand } = K;
    ridge(K, -27, [[-46, 24, 18], [-28, 30, 16], [-6, 22, 16], [14, 28, 18], [36, 32, 18]], (x, z, t) => {
      if (z > 17 + rnoise(x * .5, 2, 2) * 4 && z > t - 9) return K.hash(Math.floor(x * 2), Math.floor(z * 2), 3) < .2 ? '#d8dce8' : '#f2f4fa';
      return K.hash(Math.floor(x), Math.floor(z), 6) < .3 ? '#5a6278' : '#6a7288';
    }, 6);
    for (let x = K.X0 - 3; x <= K.X1 + 3; x += 3.5 + rand() * 2){
      const y = -26 - rand() * .6, h = 4 + rand() * 3;
      K.cyl(K.G, x, y, .3, 0, h * .3, 'x:#4a3424', null);
      for (let j = 0; j < 3; j++) K.ell(K.G, x, y, h * (.4 + j * .2), 1.8 - j * .4, 1.6 - j * .35, 1.3, 'x:' + ['#244a34', '#2a5238', '#1e402c'][j]);
    }
  },
  floor: Object.assign({}, OPEN_FLOOR),
  light(F){
    // Alpenglow on the snow, before dark.
    const pink = Math.max(0, 1 - Math.abs(F.skyP - .45) * 4);
    F.pool(0, -27, 26, 160, [255, 150, 170], .5 * pink);
  },
  glow(F){
    if (F.night < .3) return;
    for (let k = 0; k < 120; k++){
      const x = -48 + ((k * 41) % 960) / 10, z = 30 + ((k * 23) % 140) / 10;
      F.dot(x, -27.5, z, [240, 244, 255], F.night * (.4 + .6 * Math.abs(Math.sin(F.t * .8 + k * 1.7))));
    }
  },
};

// ── the canyon in Washington ────────────────────────────────────────────────
/* A lawn on the lip of a river canyon: the stage at the edge, the far wall of basalt in bands of
   brown and violet, the river a ribbon far down. The canyon itself is the moment: the bands catch
   the sunset one after another, and the river holds the last of the light. */
const gorge = {
  sky: 'open', rig: 'shed', far: -70, dither: .04,
  skyMap: p => Math.min(1, p * 1.1),
  ground(K, x, y){
    if (y < -19){
      // Over the lip: the drop, the river far below, the far wall rising out of it.
      if (y > -20.5) return '#6a5a48';
      return Math.abs(y + 23 + Math.sin(x * .1) * .8) < .9 ? '#4a8aa8' : (K.hash(Math.floor(x * .5), Math.floor(y), 3) < .3 ? '#4a3a32' : '#3e302a');
    }
    return meadow(K, x, y, ['#5aa04e', '#4e9244', '#68ae58']);
  },
  build(K){
    ridge(K, -25.5, [[-48, 26, 40], [-10, 22, 40], [30, 28, 40]], (x, z, t) => {
      const b = Math.floor((z + rnoise(x * .2, 4, 4) * 1.6) / 2.2);
      if (z > t - .8) return '#a89060';
      return ['#7a4a3a', '#5a3a44', '#8a5a40', '#6a4448', '#946a48'][((b % 5) + 5) % 5];
    }, 7);
  },
  floor: Object.assign({}, OPEN_FLOOR, { half: y => 22 + (y - 5) * .36 }),
  light(F){
    const gold = Math.max(0, 1 - Math.abs(F.skyP - .5) * 2.4);
    for (let k = 0; k < 6; k++) F.pool(-40 + k * 16, -25.4, 4 + k * 3.5, 40, [255, 150 - k * 10, 90], .35 * gold);
  },
  glow(F){
    for (let k = 0; k < 40; k++){
      const x = -46 + k * 2.4, y = -23 + Math.sin(x * .1) * .8;
      F.dot(x, y, 0, F.night > .6 ? [180, 200, 255] : [255, 200, 140], .5 * Math.max(0, Math.sin(F.t + k * 1.9)));
    }
  },
};

// ── the salt shed in Chicago ────────────────────────────────────────────────
/* A salt warehouse on the river turned music hall: walls of corrugated steel, and the great timber
   roof trusses that give it its shape meeting in a peak high over the stage. The trusses are the
   moment, lit from below in the song's colours, one bay after another. */
const SHED_BAYS = [-36, -24, -12, 0, 12, 24, 36];
const saltshed = {
  sky: 'indoor', rig: 'theatre', far: -22, ceiling: '#0e0c0c', dither: .03, dofZ: 50, indoor: [120, 110, 112],
  ground(K, x, y){
    if (y > 32){ const r = (y - 32) % 2.4; return r < .5 ? '#2a2420' : '#5a4a3e'; }
    const n = K.hash(Math.floor(x * 1.2), Math.floor(y * 1.2), 5);
    return n < .2 ? '#5a5652' : '#625e58';
  },
  build(K){
    const { wall } = K;
    wall(-21.5, K.X0 - 2, K.X1 + 2, 0, 80, (x, z) => {
      // The gable: the roof line rising to a peak over the stage, timber diagonals inside it.
      const roof = 26 - Math.abs(x) * .3;
      if (z > roof + 1.4) return '#0e0c0c';
      if (z > roof) return '#6a4a30';
      for (const bx of SHED_BAYS){
        const u = x - bx;
        if (Math.abs(u) < .55 && z > 9) return '#8a6040';
        if (z > 9 && Math.abs(Math.abs(u) - (z - 9) * .7) < .45 && Math.abs(u) < 6) return '#7a5638';
      }
      if (Math.abs(z - 9) < .6) return '#8a6040';
      // Corrugated steel below, ribbed and rusting toward the floor.
      const rib = Math.floor(x * 2.4) % 2;
      return z < 3 ? (rib ? '#6a4a3a' : '#5a3e32') : (rib ? '#7a7a7e' : '#6a6a6e');
    });
  },
  floor: { y0: 5.5, y1: 40, half: y => 20 + (y - 5) * .3, gap: y => 2.8 + (y - 5) * .05,
    capacity: 1, deep: 38, back: 44 },
  light(F){
    F.pool(0, 20, 0, 140, [255, 220, 180], .08 + .3 * F.H);
  },
  glow(F){
    const lead = F.beatN % SHED_BAYS.length;
    SHED_BAYS.forEach((bx, i) => {
      const hot = i === lead ? 1 : .3, c = F.p[i % 2];
      F.halo(bx, -21.4, 17, 9, c, (.2 + .4 * hot) * (1 - F.H * .6));
      for (let z = 10; z < 26 - Math.abs(bx) * .3; z += 1.4) F.dot(bx, -21.3, z, c, (.2 + .6 * hot) * (1 - F.H * .6));
    });
  },
};

// ── the saucer in Virginia ──────────────────────────────────────────────────
/* A round concrete coliseum that looks like it landed: inside, the bowl of seats, and the ribbed
   concrete roof flaring out in great fins over everyone. In December it is the place for a party,
   and the moment is the fins themselves lighting up like a mirror ball turning. */
const HAMP_FINS = 26;
const hampton = {
  sky: 'indoor', rig: 'shed', far: -22, ceiling: '#0a0a10', dither: .02, dofZ: 50, indoor: [106, 104, 128],
  ground(K, x, y){
    const ax = Math.abs(x), bowl = Math.max(ax - 30, y - 42, -y - 20);
    if (bowl < 0) return '#3a3842';
    const r = bowl % 2.2;
    return r < .55 ? '#1a1a22' : (Math.floor((x + 60) / 8) % 2 ? '#8a3a3a' : '#7a3234');
  },
  build(K){
    const { wall } = K;
    // The roof seen from inside: fins of concrete radiating from a ring high over the floor.
    wall(-21.5, K.X0 - 2, K.X1 + 2, 0, 90, (x, z) => {
      if (z < 6) return null;
      const u = x, v = (z - 6) * 2.2, a = Math.atan2(v, u), d = Math.hypot(u, v);
      if (d < 18) return '#141418';
      const fin = Math.abs(((a / Math.PI * HAMP_FINS) % 1 + 1) % 1 - .5) < .14;
      return fin ? (d < 24 ? '#a8a8ae' : '#8a8a92') : (d < 24 ? '#3a3a44' : '#2a2a34');
    });
  },
  floor: { y0: 5.5, y1: 40, half: y => 19 + (y - 5) * .3, gap: y => 2.8 + (y - 5) * .05,
    capacity: 1, deep: 39, back: 43 },
  light(F){
    for (const s of [-1, 1]) F.pool(s * 34, 12, 0, 80, F.p[(s + 1) / 2], .12 + .25 * F.e);
    F.pool(0, 20, 0, 120, [220, 220, 255], .08 + .3 * F.H);
  },
  glow(F){
    // Spots off a mirror ball, wheeling over the fins.
    for (let k = 0; k < 70; k++){
      const a = (k / 70) * Math.PI + F.t * .25, d = 20 + (k * 7) % 28;
      const x = Math.cos(a) * d, z = 6 + Math.sin(a) * d / 2.2;
      if (z < 7) continue;
      F.dot(x, -21.3, z, k % 3 ? [255, 255, 255] : F.p[k % 2], (.35 + .5 * F.pulse) * (1 - F.H * .7));
    }
    F.dot(0, 2, 26, [255, 255, 255], .9, 2, 2);
    F.halo(0, 2, 26, 6, [230, 236, 255], .5);
  },
};

// ── the tennis stadium in Queens ───────────────────────────────────────────
/* An old concrete tennis stadium from the twenties: a tall horseshoe of stands with arched openings
   along the top, under an open sky on the flight path. The moment is the planes: their lights cross
   the sky, slowly, all night. */
const forest = {
  sky: 'open', rig: 'shed', far: -24, dither: .03,
  ground(K, x, y){
    const ax = Math.abs(x), bowl = Math.max(ax - 32, y - 44);
    if (bowl > 0){ const r = bowl % 1.9; return r < .4 ? '#7a766c' : (r < .9 ? '#a8a296' : '#b4aea2'); }
    return meadow(K, x, y, ['#5e9a4a', '#56904a', '#68a656']);
  },
  build(K){
    const { wall } = K;
    // The far stand behind the stage, rising in rows to its row of arches.
    wall(-22, K.X0 - 2, K.X1 + 2, 0, 19, (x, z) => {
      if (z > 15.4){
        const u = ((x + 60) % 4) - 2, arch = z < 18 - Math.max(0, Math.abs(u) - 1.1) * 1.4 && Math.abs(u) < 1.4;
        return arch ? null : '#c8c2b4';
      }
      if (z > 14.6) return '#9a9488';
      const r = z % 1.4;
      return r < .3 ? '#7a766c' : (Math.floor(x * .25) % 6 === 0 ? '#8a8478' : '#b4aea2');
    });
  },
  floor: Object.assign({}, OPEN_FLOOR, { half: y => 22 + (y - 5) * .24 }),
  light(F){
    for (const s of [-1, 1]) F.pool(s * 36, 20, 6, 60, [255, 220, 170], .3 * F.night);
  },
  glow(F){
    if (F.night < .15) return;
    for (let k = 0; k < 3; k++){
      const ph = ((F.t * .03 + k * .37) % 1), x = -60 + ph * 120, z = 20.5 + k * 1.4 + Math.sin(ph * 3) * .8;
      const blink = Math.sin(F.t * 6 + k) > .6 ? 1 : .2;
      F.dot(x, -23, z, [255, 255, 255], .9 * F.night);
      F.dot(x - .8, -23, z, [255, 60, 60], blink * F.night);
      F.dot(x + .8, -23, z, [60, 255, 120], blink * F.night * .7);
    }
  },
};

// ── the resort in the Riviera Maya ─────────────────────────────────────────
/* A winter run on the Caribbean: white sand, the hotel's lit balconies stage left and right, palms,
   and the sea behind the band under a big moon. The moon's path on the water is the moment. */
const MP_MOON = 14;
const moon = {
  sky: 'open', rig: 'shed', far: -60, dither: .03,
  skyMap: p => Math.min(1, .55 + p * .6),
  ground(K, x, y){
    if (y < -19){
      if (y > -20.6) return K.hash(Math.floor(x * 2), Math.floor(y * 3), 3) < .5 ? '#f2f6f6' : '#c8e8ea';
      return K.hash(Math.floor(x * .8), Math.floor(y * 2), 5) < .18 ? '#4ac8d0' : (y < -24 ? '#1a8aa0' : '#2aa8b8');
    }
    return K.hash(Math.floor(x * 2), Math.floor(y * 2), 7) < .25 ? '#f2ead8' : '#e8decc';
  },
  build(K){
    const { G, box } = K;
    // The hotel wings, white, balcony over balcony.
    for (const s of [-1, 1]) box(G, s < 0 ? -48 : 34, s < 0 ? -34 : 48, -18, 4, 0, 26, (x, y, z, f) => {
      if (f === 'top') return 'x:#d8d2c4';
      return 'x:' + (z % 3.2 < .5 ? '#c8c2b4' : (Math.floor(x * .6) % 2 ? '#f2eee4' : '#eae4d8'));
    });
    for (const [x, y, l, h] of [[-28, -12, 2, 16], [-31, 8, -1.6, 15], [-27, 28, 2, 14], [28, -12, -2, 17], [31, 10, 1.6, 15], [28, 30, -2, 14]]) palm(K, x, y, l, h);
  },
  floor: { y0: 5.5, y1: 42, half: y => 17 + (y - 5) * .3, gap: y => 3 + (y - 5) * .05,
    capacity: .95, deep: 40, back: 46 },
  light(F){
    F.pool(MP_MOON, -22, 0, 70, [200, 220, 255], .35 * F.night);
    for (const s of [-1, 1]) F.pool(s * 33, -6, 6, 30, [255, 200, 140], .35 * F.night);
  },
  glow(F){
    F.halo(MP_MOON, -26, 22, 26, [200, 220, 255], .4 * F.night);
    F.halo(MP_MOON, -26, 22, 4.5, [255, 252, 236], .95 * F.night);
    for (let k = 0; k < 50; k++){
      const y = -20.8 - (k % 10) * .5, x = MP_MOON + Math.sin(k * 2.9) * (1 + (k % 10) * .25);
      F.dot(x, y, 0, [230, 240, 255], .8 * F.night * Math.max(0, Math.sin(F.t * 2.2 + k * 1.7)));
    }
    // The balconies, lit window by window.
    for (const s of [-1, 1]) for (let k = 0; k < 24; k++){
      const z = 1.6 + (k % 8) * 3.2, x = s * (36 + (k >> 3) * 4);
      if ((k * 7) % 5 < 3) F.dot(x, 4.1, z, [255, 210, 150], .5 * F.night, 2, 1);
    }
  },
};

// ── the hollow in Tennessee ─────────────────────────────────────────────────
/* A stage in a hollow by a cave: a wall of mossy limestone behind and round the band, hardwoods
   hanging over the rim, and a mist that never quite lifts. The lanterns strung along the rock are
   the moment, warm against the stone once it is dark. */
const caverns = {
  sky: 'open', rig: 'theatre', far: -24, dither: .04,
  ground(K, x, y){
    if (Math.abs(x) > 34 && rnoise(x * .3, y * .3, 4) > .45) return K.hash(Math.floor(x), Math.floor(y), 2) < .5 ? '#7a8a6a' : '#8a947a';
    return meadow(K, x, y, ['#4e7a44', '#466e3e', '#58864c'], ['#3a5a34', '#6a5a44'], .04);
  },
  build(K){
    const { wall, rand } = K;
    // The rock behind and round the stage, banded and mossed, its rim ragged against the sky.
    wall(-21.5, K.X0 - 2, K.X1 + 2, 0, 60, (x, z) => {
      const rim = 21.5 + rnoise(x * .15, 2, 2) * 6;
      if (z > rim) return null;
      const n = rnoise(x * .4, z * .4, 6), moss = rnoise(x * .25, z * .25, 9) > .55;
      if (moss) return n < .4 ? '#4a6a3a' : '#5a7a44';
      const band = Math.floor(z * .9 + n * 2) % 3;
      return ['#8a8a7e', '#9a9a8c', '#7a7a70'][(band + 3) % 3];
    });
    for (const s of [-1, 1]) for (let y = -14; y < 48; y += 5 + rand() * 3) tree(K, s * (40 + rand() * 6), y, 5, 10 + rand() * 6, ['#3a6a34', '#44763c', '#30602c']);
  },
  floor: Object.assign({}, OPEN_FLOOR, { half: y => 17 + (y - 5) * .28, capacity: .9 }),
  light(F){
    for (let k = 0; k < 10; k++) F.pool(-36 + k * 8, -21.4, 19, 16, [255, 200, 130], .3 * F.night);
    F.pool(0, -21.4, 22, 40, F.p[0], .2 + .2 * F.e);
  },
  glow(F){
    for (let k = 0; k < 24; k++){
      const x = -44 + k * 3.8, z = 20.5 - Math.abs(Math.sin(k * .7)) * 1.4;
      F.dot(x, -21.3, z, [255, 210, 140], (.3 + .7 * F.night) * (.8 + .2 * Math.sin(F.t * 3 + k)), 1, 2);
    }
    // Mist hanging over the crowd, lit by the stage.
    for (let k = 0; k < 8; k++) F.halo(-30 + k * 9 + Math.sin(F.t * .2 + k) * 3, 20 + (k % 3) * 8, 3, 14, mixc3(F.p[k % 2], [255, 255, 255], .6), .08);
  },
};

export const ROOMS = { lawn, pub, studio, cap: cap_, ryman, radio, rocks, garden, cabo,
  rec, nectars, bowl, wallst, mission, farm, westville, spac, greek, kettle, dillon, gorge,
  saltshed, hampton, forest, moon, caverns };
