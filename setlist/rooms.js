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
   `fixY`/`fixZ` is where the row of movers hangs; `wallZ` is how tall the back wall is. */
export const RIGS = {
  // Outdoor shed and arena: the truss on two towers with the PA hung off them.
  shed:    { towers: true, screen: true, truss: true, trussZ: 21.5, wallZ: 19.5, fixY: -.8, fixZ: 20.3 },
  // A theatre: the same truss and wall, no towers, the room's own proscenium frames it.
  theatre: { towers: false, screen: true, truss: true, trussZ: 20, wallZ: 19.5, fixY: -.8, fixZ: 18.8 },
  // A bar: a low back wall, no truss, no screen, a pipe of cans along the top of the wall.
  club:    { towers: false, screen: false, truss: false, trussZ: 12.5, wallZ: 12.5, fixY: -14.4, fixZ: 12.1 },
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
   the bar running across the back of the room. The stage is a low corner of it: no truss, no screen. */
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

export const ROOMS = { lawn, pub, studio, cap: cap_, ryman, radio, rocks, garden, cabo };
