/* LAB: THE GROUNDS, as a room (2026-10-29).
 *
 * Layout B, drawn the way the band is: every booth is solids in feet from the stage's own kit (K),
 * splatted and painted by PXHD, so a tour bus and a food truck are lit, shaded and outlined exactly
 * like the band and the lawn they stand on. It is a room in the rooms.js sense, rendered by the real
 * stage.js, with the lawn's ground and sky and the shed's stage house.
 *
 * Two arrangements of the same buildings: a phone sees about 47 feet across and the lawn running
 * seventy feet back, so they stand in rows down the lawn; a wide screen sees 72 feet across and only
 * the front of the lawn, so they stand either side of it.
 *
 * Lab only. Nothing in the game imports this.
 */
import { ROOMS } from '../rooms.js?v=4';

const SHIRTS = ['#e0443a', '#3a7ad8', '#f4cc2c', '#37c5d5', '#ff6fc1', '#f6f1e4', '#7fd06a', '#a982f3'];

/* Where each door stands, per arrangement: [x0, x1, y0, y1, height] in feet. The page hangs a sign
   over each one from these same numbers. */
export const SPOTS = {
  tall: {
    foh:     [-4, 4, 21, 24, 5],
    bus:     [-16.5, -6, 32, 36, 6],
    trailer: [4.5, 16.5, 32, 36, 5],
    records: [-16.5, -10, 45, 49, 5],
    food:    [-4.5, 4.5, 45, 49, 6],
    box:     [10.5, 16.5, 45, 48, 6],
    gate:    [-16, -2, 58, 60, 8],
    board:   [4, 11, 59, 61, 10],
  },
  wide: {
    board:   [-22, -15, -4, -2, 14],
    bus:     [-36, -22, 2, 7, 8],
    trailer: [22, 35, 2, 7, 7],
    records: [-34, -26, 12, 16, 6],
    food:    [-35, -25, 21, 25, 7],
    foh:     [-4, 4, 21, 24, 5],
    box:     [26, 33, 12, 15, 7],
    gate:    [20, 36, 22, 24, 9],
  },
};
const pad = 1.6;
const inSpot = (S, x, y) => Object.values(S).some(([x0, x1, y0, y1]) => x > x0 - pad && x < x1 + pad && y > y0 - pad && y < y1 + pad + 1.5);

// ── the buildings ─────────────────────────────────────────────────────────
function tree(K, x, y, r, h){
  const { G, cyl, ell, hash } = K, greens = ['#2f6b3a', '#3e8446', '#285a33'];
  cyl(G, x, y, .7, 0, h * .55, 'x:#7a5236', null);
  ell(G, x, y, h, r, r * .9, r * .82, (px, py, pz) => 'x:' + greens[(hash(Math.floor(px * 1.5), Math.floor(pz * 1.5), 2) * 3) | 0]);
  ell(G, x - r * .5, y + .4, h - r * .35, r * .6, r * .55, r * .55, 'x:' + greens[1]);
}
/* The tour bus: a long magenta coach, a row of tinted windows, a gold stripe, two wheels, the
   destination sign lit on the roof. */
function bus(K, [x0, x1, y0, y1, h]){
  const { G, box, cyl } = K, wheel = [x0 + 2.6, x1 - 2.6];
  box(G, x0, x1, y0, y1, .6, h - 1, (x, y, z, f) => {
    if (f === 'top') return 'x:#e9e4d6';
    if (wheel.some(w => (x - w) ** 2 + (z - .9) ** 2 < 1.3)) return (x - wheel[0]) ** 2 + (z - .9) ** 2 < .25 || (x - wheel[1]) ** 2 + (z - .9) ** 2 < .25 ? 'x:#8a8498' : 'x:#15101f';
    if (z > 3.9 && z < 5.6 && ((x - x0) % 2.1) > .35 && x > x0 + 1 && x < x1 - .6) return 'x:#9fd0e6';
    if (z > 2.2 && z < 2.6) return 'x:#f4cc2c';
    if (x > x1 - 2.2 && z > 1 && z < 5.6) return z > 3.9 ? 'x:#bfe3f0' : 'x:#7a2248';
    return 'x:#9a2f5e';
  }, { gloss: 1 });
  box(G, x0 + 4, x1 - 4, y0 + 1.6, y0 + 2.2, h - 1, h, (x, y, z, f) => f === 'top' ? 'x:#3a2a18' : 'x:#1a0e08');
  for (const w of wheel) cyl(G, w, y1 - .2, .25, 0, .6, 'x:#15101f', null);
}
/* The green room: a cream trailer with a star on the door, and a rail of the band's outfits outside. */
function trailer(K, [x0, x1, y0, y1, h]){
  const { G, box, cap } = K;
  const tx1 = x1 - 4;
  box(G, x0, tx1, y0, y1, .8, h - .8, (x, y, z, f) => {
    if (f === 'top') return 'x:#c9c2b2';
    if (x > tx1 - 3 && x < tx1 - 1 && z > .9 && z < 5) return (Math.abs(x - (tx1 - 2)) < .35 && Math.abs(z - 3.8) < .35) ? 'x:#F2B632' : 'x:#7553D0';
    if (x > x0 + 1 && x < x0 + 4.4 && z > 3 && z < 4.8) return 'x:#8fb4d8';
    if (z < 1.3) return 'x:#9a9484';
    return 'x:#e6e0d0';
  }, { gloss: 1 });
  box(G, x0 + .5, tx1 - .5, y0 + .5, y1 - .5, h - .8, h - .4, 'x:#b8b2a2');
  // The rail of clothes beside it, in the band's own colours.
  const rx0 = tx1 + .6, rx1 = x1;
  cap(G, [rx0, y1 - .6, 0], [rx0, y1 - .6, 5.2], .08, 'x:#9a9aa8'); cap(G, [rx1, y1 - .6, 0], [rx1, y1 - .6, 5.2], .08, 'x:#9a9aa8');
  cap(G, [rx0, y1 - .6, 5.2], [rx1, y1 - .6, 5.2], .07, 'x:#9a9aa8');
  ['#d8402e', '#3f8f9a', '#f2c43a', '#9a4ab8', '#7a9cc8'].forEach((c, i) => {
    const x = rx0 + .4 + i * (rx1 - rx0 - .8) / 4;
    box(G, x - .3, x + .3, y1 - .9, y1 - .4, 2.4, 5, 'x:' + c);
  });
}
/* A stall: a striped canopy on four poles, a counter, and whatever it sells on the counter. */
function stall(K, [x0, x1, y0, y1, h], stripe, wares){
  const { G, box, cap } = K;
  for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) cap(G, [x, y, 0], [x, y, h - 1], .09, 'x:#d8d4cc');
  box(G, x0, x1, y0, y0 + .3, 0, h - 1, 'x:#2b2440');
  box(G, x0 - .3, x1 + .3, y0 - .3, y1 + .3, h - 1, h - .5, x => 'x:' + (Math.floor((x - x0) * 1.1) % 2 ? '#f6f1e4' : stripe));
  box(G, x0 + .5, x1 - .5, y1 - 1.4, y1 - .3, 0, 2.6, (x, y, z, f) => 'x:' + (f === 'top' ? '#8a6a54' : '#5e4636'));
  wares(x0, x1, y1);
}
function records(K, s){
  const { G, box } = K;
  stall(K, s, '#D13F86', (x0, x1, y1) => {
    // Sleeves standing in two crates on the counter, and posters on the back wall.
    for (let i = 0; i < 9; i++){ const x = x0 + 1 + i * (x1 - x0 - 2) / 8; box(G, x - .18, x + .18, y1 - 1.1, y1 - .6, 2.6, 3.7 + (i % 3) * .2, 'x:' + SHIRTS[i % SHIRTS.length]); }
    for (let i = 0; i < 3; i++){ const x = x0 + 1.6 + i * 2.6; box(G, x, x + 1.8, s[2] + .3, s[2] + .4, 3, 5, 'x:' + SHIRTS[(i * 3 + 1) % SHIRTS.length]); }
  });
}
/* The food truck: yellow, an open serving hatch under a striped awning, the menu board beside it. */
function food(K, [x0, x1, y0, y1, h]){
  const { G, box, cyl } = K;
  box(G, x0, x1, y0, y1, .6, h - 1, (x, y, z, f) => {
    if (f === 'top') return 'x:#e0a82e';
    if (x > x0 + 1.4 && x < x1 - 3 && z > 3 && z < 5.4) return z > 4.9 ? 'x:#2a2230' : (Math.floor(x * 2) % 3 ? 'x:#1b1726' : 'x:#f6f2ea');
    if ((x - (x0 + 2)) ** 2 + (z - .9) ** 2 < 1.1 || (x - (x1 - 2)) ** 2 + (z - .9) ** 2 < 1.1) return 'x:#15101f';
    if (z < 1.4) return 'x:#c9940f';
    return 'x:#F2B632';
  }, { gloss: 1 });
  box(G, x0 + 1, x1 - 2.6, y1, y1 + 1.4, 5.6, 6, x => 'x:' + (Math.floor((x - x0) * 1.3) % 2 ? '#f6f1e4' : '#e0443a'));
  box(G, x1 - 2.4, x1 - .6, y1 + .2, y1 + .4, 2.6, 5.4, (x, y, z) => 'x:' + (z > 5 ? '#4a3a2a' : (Math.floor(z * 3) % 2 ? '#1b1726' : '#3a3550')));
  cyl(G, x0 + 1.2, y0 + 1.5, .3, h - 1, h + .4, 'x:#6a6a72', null);
}
/* The box office: a little violet booth, its window lit, a roof that overhangs it. */
function boxOffice(K, [x0, x1, y0, y1, h]){
  const { G, box } = K;
  box(G, x0, x1, y0, y1, 0, h - 1.2, (x, y, z, f) => {
    if (f === 'top') return 'x:#5a3eaa';
    if (x > x0 + 1.2 && x < x1 - 1.2 && z > 3 && z < 5) return 'x:#ffe9a0';
    if (x > x0 + 1.2 && x < x1 - 1.2 && z > 2.6 && z < 3) return 'x:#f6f2ea';
    return Math.floor(x * 1.4) % 2 ? 'x:#7553D0' : 'x:#6a49c2';
  }, { gloss: 1 });
  box(G, x0 - .6, x1 + .6, y0 - .4, y1 + .8, h - 1.2, h - .6, 'x:#f6f2ea');
}
/* The gate: two posts and a banner across, with the rooms' posters pasted up either side. */
function gate(K, [x0, x1, y0, y1, h]){
  const { G, box } = K;
  for (const px of [x0, x1 - 1.2]) box(G, px, px + 1.2, y0, y1, 0, h - 2, 'x:#4a4258');
  box(G, x0, x1, y0, y1, h - 2.4, h, (x, y, z, f) => f === 'top' ? 'x:#0b6e7a' : (z < h - 2 ? 'x:#0b6e7a' : 'x:#1F9AAA'));
  // Posters, the rooms you can earn, along the fence either side.
  const P = ['#5a8a5a', '#6a4a8a', '#8a5a3a', '#3a5a8a'];
  P.forEach((c, i) => { const x = x0 + 1.8 + i * ((x1 - x0 - 3.6) / 4); box(G, x, x + 2.6, y1, y1 + .2, 2, 5.4, (xx, yy, z) => 'x:' + (z > 4.9 ? '#f6f2ea' : c)); });
}
/* The big screen on its tower: the board's top three, lit. */
function screen(K, [x0, x1, y0, y1, h]){
  const { G, box, cap } = K, cx = (x0 + x1) / 2;
  cap(G, [cx, y0 + 1, 0], [cx, y0 + 1, h - 4], .3, 'x:#3a3550');
  box(G, x0, x1, y0, y1, h - 4.6, h, (x, y, z, f) => {
    if (f === 'top' || x < x0 + .4 || x > x1 - .4 || z < h - 4.2 || z > h - .4) return 'x:#15121f';
    const row = Math.floor((h - .4 - z) / 1.2), len = [5, 4, 3][row] || 0;
    return (x - x0 - .7 < len && ((h - .4 - z) % 1.2) > .3) ? (row ? 'x:#37C5D5' : 'x:#F2B632') : 'x:#0e2a3a';
  });
}
/* The soundboard: a small tent in the middle of the lawn, the desk, and last night's setlist taped to it. */
function foh(K, [x0, x1, y0, y1, h]){
  const { G, box, cap } = K;
  for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) cap(G, [x, y, 0], [x, y, h - .8], .08, 'x:#d8d4cc');
  box(G, x0 - .3, x1 + .3, y0 - .3, y1 + .3, h - .8, h - .4, x => 'x:' + (Math.floor((x - x0) * 1.4) % 2 ? '#e9e4d6' : '#5a4a8a'));
  box(G, x0 + .6, x1 - .6, y0 + 1, y1 - .6, 0, 2.8, (x, y, z, f) => {
    if (f === 'top') return Math.floor(x * 3) % 2 ? 'x:#2a2a34' : 'x:#15121f';
    if (x > x1 - 2.4 && x < x1 - 1 && z > 1 && z < 2.5) return 'x:#F7F1E3';
    return 'x:#2a2440';
  });
}

// ── the rooms ─────────────────────────────────────────────────────────────
function room(arr){
  const S = SPOTS[arr], lawn = ROOMS.lawn, wide = arr === 'wide';
  const lamps = wide ? [[-40, 10], [40, 10], [-19, 24], [17, 26]] : [[-16, 26], [16, 26], [-7.5, 42], [7.5, 42]];
  return {
    sky: 'open', rig: 'shed', far: -40,
    ground(K, x, y){
      // The lawn's own grass, with a beaten path from the gate up to the soundboard.
      const g = S.gate, path = wide ? (x > 4 && x < 22 && Math.abs(y - 23) < 1.4) : (Math.abs(x + 1) < 2 && y > 24 && y < 58);
      if (path) return (Math.floor(x * 2 + y) % 3) ? '#b9a78a' : '#a8977a';
      return lawn.ground(K, x, y);
    },
    build(K){
      const { G, cyl, ell } = K;
      for (let x = K.X0 - 3; x <= K.X1 + 3; x += 5.6 + K.rand() * 1.8) tree(K, x, -27 - K.rand() * 6, 5 + K.rand() * 1.6, 6.5 + K.rand() * 3.5);
      for (const [x, y] of lamps){ cyl(G, x, y, .22, 0, 11, 'x:#3a3a44', null); ell(G, x, y, 11.4, .6, .6, .5, 'x:#f6efd8', { gloss: 2 }); }
      bus(K, S.bus); trailer(K, S.trailer); records(K, S.records); food(K, S.food);
      boxOffice(K, S.box); gate(K, S.gate); screen(K, S.board); foh(K, S.foh);
      if (wide) screen(K, [15, 22, -4, -2, 14]);
    },
    floor: { y0: 5.5, y1: wide ? 19 : 19, half: y => wide ? 14 + (y - 5) * .16 : 17, gap: y => 2.9 + (y - 5) * .05,
      capacity: 1, deep: 18, back: wide ? 26 : 70, skip: (x, y) => inSpot(S, x, y) },
    light(F){
      for (const [x, y] of lamps) F.pool(x, y, 0, 30, [255, 206, 140], .5 * F.night);
      for (const k of ['food', 'box', 'records', 'trailer']){ const [x0, x1, , y1] = S[k]; F.pool((x0 + x1) / 2, y1 + 1, 0, 34, [255, 214, 150], .5 * F.night); }
    },
    glow(F){
      for (const [x, y] of lamps) F.dot(x, y, 11.4, [255, 236, 190], .35 + .65 * F.night, 2, 2, -1, -1);
      const b = S.bus; for (let x = b[0] + 4.4; x < b[1] - 4.2; x += .8) F.dot(x, b[3] - 2.8, b[4] - .4, [255, 179, 71], .9);
      const f = S.food; for (let x = f[0] + 1; x <= f[1] - 2.6; x += 1.1) F.dot(x, f[3] + 1.4, 6, [255, 222, 160], .4 + .6 * F.night);
    },
  };
}
export const GROUNDS = { tall: room('tall'), wide: room('wide') };
