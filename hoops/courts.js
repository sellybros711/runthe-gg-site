/* Run The Floor: arenas.
 *
 * An arena is the floor the draft is played on and the building around it, and
 * it is a thing an account EARNS. Thirteen of them, each a nod to a kind of
 * place a fan already carries a picture of, and none of them named for a real
 * one: the names, banners and logos of real arenas belong to other people, so
 * every one here is drawn from what makes the place itself (a parquet floor,
 * a chain-link fence, windows onto the mountains) and given a name of its own.
 * That is baseball/parks.js's rule, and this file is that one's shape.
 *
 * UNLOCKS ARE DERIVED, NEVER STORED. Every rule is a question about the career
 * the badge cabinet already reads (runs, rings, playoffs, the best record, the
 * badges earned, the mode feats) plus whether the account is Pro. So an arena
 * is retroactive, follows the account wherever the career goes, and cannot be
 * lost by clearing site data. A guest plays in the home arena; everything else
 * asks for an account, because the badges a guest would need are an account's.
 *
 * TWO HALVES, AND THE CAMERA DECIDES HOW MUCH OF EACH YOU SEE. The FLOOR is a
 * set of CSS custom properties the page's own floor rule reads (the wood, the
 * paint, the lines, the apron) plus a surface name that swaps the plank layers
 * for parquet, asphalt, sport tiles or glass. The SCENE is an SVG of the far end
 * of the building, drawn behind the basket. The overhead camera looks straight
 * down and sees only the floor; the three-quarter camera tilts the floor away
 * from the reader and the scene stands up behind it.
 *
 * THE TILT IS ONE ANSWER IN TWO PLACES, and this file is where it lives. The
 * page tilts the floor with a CSS transform built from TQ, and places the five
 * spots with project(), which is the same perspective written as arithmetic.
 * The spots are NOT inside the tilted layer on purpose: text in a rotated plane
 * is foreshortened and blurred, and a name is the one thing on a court that has
 * to be read. hoops/check-arenas.mjs puts a marker on the tilted floor under
 * every spot and holds the two to a pixel, because two copies of one picture
 * drift the first time either is tuned.
 *
 * Browser: window.RTF_COURTS. Node: require('./courts.js').
 */
'use strict';
(function () {

const COURTS_API_VERSION = 1;

/* The three-quarter camera. `tilt` is how far the floor leans away, `persp` the
   viewing distance in court widths. A lower camera (bigger tilt, shorter
   distance) buys more building and costs floor: at 30 degrees and 1.8 widths
   the floor keeps about three quarters of the box, which is what five discs and
   their names need on a phone. */
const TQ = { tilt: 30, persp: 1.8 };

/* Where a point on the floor lands once the floor is tilted.
   x, y: percent of the court box, as the flat court has always used them.
   ratio: the box's height over its width.
   Returns percent of the box, and the scale a thing standing there is drawn at.

   The transform is perspective(d) rotateX(a) about the bottom centre of the box.
   A point u across and v up from that origin (v negative) goes to depth
   z = v sin a, height v cos a, and is scaled by d / (d - z). */
function project(x, y, ratio) {
  const a = TQ.tilt * Math.PI / 180;
  const v = (y / 100 - 1) * ratio;          // in court widths, negative is away
  const s = TQ.persp / (TQ.persp - v * Math.sin(a));
  return {
    x: 50 + (x - 50) * s,
    y: 100 + (y - 100) * Math.cos(a) * s,
    s,
  };
}
/* Where the far edge of the floor lands, which is where the building starts. */
function farEdge(ratio) { return project(50, 0, ratio).y; }

/* ─── the catalogue ───
   `need` answers how far along the account is and `of` is the target. `pro`
   arenas are the account tier's. `i` is { signed, pro, badges, c } where c is
   the career object the page keeps. */
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
const feat = (c, k) => num(c && c.feats && c.feats[k]);

const ARENAS = [
  { id: 'home', name: 'The Hardwood', nod: 'Maple, a painted lane and a full house.',
    rarity: 'Starter', unlock: { label: 'Yours from the opening tip', free: true } },
  { id: 'rec', name: 'Rec Center', nod: 'Pull-out bleachers and a clock on the wall.',
    rarity: 'Common', unlock: { label: 'Finish a run', need: (i) => num(i.c && i.c.runs), of: 1 } },
  { id: 'blacktop', name: 'The Blacktop', nod: 'Asphalt, a chain-link fence and the block.',
    rarity: 'Common', unlock: { label: 'Earn 5 badges', need: (i) => i.badges, of: 5 } },
  { id: 'parquet', name: 'The Parquet', nod: 'Old boards laid in squares, banners in the rafters.',
    rarity: 'Rare', unlock: { label: 'Make the playoffs 3 times', need: (i) => num(i.c && i.c.playoffs), of: 3 } },
  { id: 'sunset', name: 'Sunset Hall', nod: 'Purple and gold under the spotlights.',
    rarity: 'Rare', unlock: { label: 'Win 60 games in a run', need: (i) => num(i.c && i.c.bestWins), of: 60 } },
  { id: 'fieldhouse', name: 'The Fieldhouse', nod: 'Brick, steel trusses and light through tall windows.',
    rarity: 'Rare', unlock: { label: 'Win 10 straight in Conquest', need: (i) => feat(i.c, 'cq.best'), of: 10 } },
  { id: 'boardwalk', name: 'Boardwalk', nod: 'A beach court with the ocean behind the hoop.',
    rarity: 'Epic', unlock: { label: 'Solve Six Passes at par', need: (i) => feat(i.c, 'ps.par'), of: 1 } },
  { id: 'altitude', name: 'Altitude', nod: 'Glass walls onto snow and pines.',
    rarity: 'Epic', unlock: { label: 'Win a title in Fix History', need: (i) => feat(i.c, 'fx.title'), of: 1 } },
  { id: 'rooftop', name: 'The Rooftop', nod: 'A court on the roof, the skyline lit up.',
    rarity: 'Epic', unlock: { label: 'Win a ring', need: (i) => num(i.c && i.c.rings), of: 1 } },
  { id: 'cathedral', name: 'The Cathedral', nod: 'A dark bowl, one light, twenty thousand people.',
    rarity: 'Legendary', unlock: { label: 'Earn 40 badges', need: (i) => i.badges, of: 40 } },
  { id: 'banners', name: 'Banner Hall', nod: 'Every wall hung with a title.',
    rarity: 'Legendary', unlock: { label: 'Win 3 rings', need: (i) => num(i.c && i.c.rings), of: 3 } },
  { id: 'neon', name: 'Neon Court', nod: 'A black floor and a pink sun.',
    rarity: 'Pro', unlock: { label: 'Run The Floor Pro', pro: true } },
  { id: 'glass', name: 'The Glass', nod: 'A lit floor and ribbon boards all the way round.',
    rarity: 'Pro', unlock: { label: 'Run The Floor Pro', pro: true } },
];
const BY_ID = Object.fromEntries(ARENAS.map((a) => [a.id, a]));

/* info: { signed, pro, badges, c }. Returns { ok, have, of, label, guest }. */
function status(arena, info) {
  const u = arena.unlock;
  if (u.free) return { ok: true, label: u.label };
  if (!info || !info.signed) return { ok: false, guest: true,
    label: u.pro ? 'Sign in and get Pro' : 'Sign in and ' + u.label.charAt(0).toLowerCase() + u.label.slice(1) };
  if (u.pro) return { ok: !!info.pro, label: u.label };
  let have = 0;
  try { have = Math.max(0, Number(u.need(info)) || 0); } catch (_) { have = 0; }
  return { ok: have >= u.of, have: Math.min(have, u.of), of: u.of, label: u.label };
}
function unlockedIds(info) { return ARENAS.filter((a) => status(a, info).ok).map((a) => a.id); }

/* ─── the floors ───
   Every colour is a literal, because the floor is the sport rather than the
   page's theme. `surf` swaps the plank layers; everything else is a custom
   property the page's floor rule reads. */
const FLOOR_BASE = {
  surf: 'wood',
  m: ['#8a5c2c', '#744d23', '#553519', '#402714'],
  paint: ['rgba(138,52,20,.62)', 'rgba(112,42,16,.5)'],
  line: 'rgba(255,255,255,.62)',
  apron: ['rgba(0,0,0,.30)', 'rgba(0,0,0,.52)'],
  light: 'rgba(255,190,120,.20)',
  rim: 'rgba(240,120,45,.9)',
  wall: '#0f141d',
  /* what the floor sits in once it is tilted: the dark boards past the lines,
     or the ground round an outdoor court */
  surround: '#150f09',
};
const FLOOR = {
  home: {},
  rec: { surround: '#5e5a50', m: ['#caa36c', '#b88f58', '#9c7443', '#7d5a33'], paint: ['rgba(38,72,150,.62)', 'rgba(30,58,128,.52)'],
    line: 'rgba(255,255,255,.7)', light: 'rgba(255,245,220,.18)', wall: '#d9d2bf' },
  blacktop: { surround: '#34373b', surf: 'asphalt', m: ['#4c4f55', '#43464b', '#383b40', '#2c2e32'],
    paint: ['rgba(150,40,40,.55)', 'rgba(120,32,32,.48)'], line: 'rgba(245,245,240,.72)',
    apron: ['rgba(0,0,0,.18)', 'rgba(0,0,0,.34)'], light: 'rgba(255,240,210,.10)', rim: 'rgba(230,110,40,.95)', wall: '#8fbde3' },
  parquet: { surround: '#0f1510', surf: 'parquet', m: ['#b07a3e', '#9a6732', '#7a4f25', '#5c3a1a'],
    paint: ['rgba(20,96,58,.66)', 'rgba(14,78,46,.56)'], line: 'rgba(255,255,255,.7)', wall: '#11160f' },
  sunset: { surround: '#1b0d2a', m: ['#c99a4c', '#b3843c', '#8f6628', '#6d4b1b'], paint: ['rgba(86,36,130,.68)', 'rgba(66,26,104,.58)'],
    line: 'rgba(255,221,120,.72)', light: 'rgba(255,210,120,.24)', rim: 'rgba(250,190,60,.95)', wall: '#1a0f28' },
  fieldhouse: { surround: '#3a2a1c', m: ['#a06a33', '#8b5a2a', '#6c4520', '#503217'], paint: ['rgba(122,30,34,.62)', 'rgba(98,24,28,.52)'],
    line: 'rgba(255,250,235,.66)', light: 'rgba(255,225,170,.22)', wall: '#6d3a2a' },
  boardwalk: { surround: '#c9b38a', surf: 'court', m: ['#d9c7a3', '#cdb892', '#b9a27a', '#a38c66'],
    paint: ['rgba(20,128,140,.62)', 'rgba(14,104,116,.54)'], line: 'rgba(255,255,255,.85)',
    apron: ['rgba(180,150,100,.30)', 'rgba(150,120,80,.45)'], light: 'rgba(255,220,170,.16)', wall: '#f2b27a' },
  altitude: { surround: '#1a2230', m: ['#b98a55', '#a57746', '#835b33', '#634225'], paint: ['rgba(30,86,150,.62)', 'rgba(22,66,124,.52)'],
    line: 'rgba(255,255,255,.7)', light: 'rgba(210,230,255,.16)', wall: '#a9c7e4' },
  rooftop: { surround: '#0e1830', surf: 'court', m: ['#28456e', '#233d62', '#1c3252', '#152640'],
    paint: ['rgba(232,110,40,.66)', 'rgba(200,88,30,.56)'], line: 'rgba(255,255,255,.8)',
    apron: ['rgba(10,20,40,.35)', 'rgba(5,10,25,.55)'], light: 'rgba(120,170,255,.14)', wall: '#0b1224' },
  cathedral: { surround: '#07090e', m: ['#6a4526', '#57381e', '#3e2715', '#2a1a0d'], paint: ['rgba(24,52,120,.68)', 'rgba(16,40,96,.58)'],
    line: 'rgba(255,255,255,.66)', light: 'rgba(255,240,215,.30)', wall: '#07090e' },
  banners: { surround: '#120e08', m: ['#9a6a36', '#86592b', '#684220', '#4c3016'], paint: ['rgba(196,150,40,.62)', 'rgba(164,122,30,.52)'],
    line: 'rgba(255,255,255,.66)', light: 'rgba(255,215,130,.22)', rim: 'rgba(240,190,60,.95)', wall: '#15110a' },
  neon: { surround: '#0a0414', surf: 'glass', m: ['#1a0f2c', '#150c24', '#10091c', '#0a0612'],
    paint: ['rgba(255,60,170,.42)', 'rgba(200,40,140,.34)'], line: 'rgba(60,240,240,.85)',
    apron: ['rgba(0,0,0,.25)', 'rgba(0,0,0,.5)'], light: 'rgba(255,80,190,.22)', rim: 'rgba(60,240,240,.95)', wall: '#12081f' },
  glass: { surround: '#030812', surf: 'glass', m: ['#10213a', '#0d1b31', '#0a1527', '#070f1c'],
    paint: ['rgba(60,150,255,.40)', 'rgba(40,120,220,.32)'], line: 'rgba(235,245,255,.86)',
    apron: ['rgba(0,0,0,.22)', 'rgba(0,0,0,.45)'], light: 'rgba(120,190,255,.26)', rim: 'rgba(255,140,60,.95)', wall: '#050b16' },
};
function floorOf(id) { return Object.assign({}, FLOOR_BASE, FLOOR[BY_ID[id] ? id : 'home'] || {}); }
/* The custom properties, as one inline style string. */
function floorVars(id) {
  const F = floorOf(id);
  return '--m0:' + F.m[0] + ';--m1:' + F.m[1] + ';--m2:' + F.m[2] + ';--m3:' + F.m[3] +
    ';--paint1:' + F.paint[0] + ';--paint2:' + F.paint[1] + ';--line:' + F.line +
    ';--apron1:' + F.apron[0] + ';--apron2:' + F.apron[1] + ';--arena-light:' + F.light +
    ';--rimc:' + F.rim + ';--wall:' + F.wall + ';--surround:' + F.surround;
}

/* ─── drawing helpers, for the scenes ───
   A scene is drawn in a 100 by 40 box and FITTED by its height, so the whole
   building is always in view, however wide the court is. What a wide court
   shows beside the box is the same building carried on: every backdrop runs
   from X0 to X1, and the one thing each arena is about sits in the middle. */
const X0 = -200, X1 = 300;
const f = (n) => (Math.round(n * 100) / 100).toString();
function rng(seed) { let s = seed % 2147483647; if (s <= 0) s += 2147483646; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
const SHIRTS = ['#c9483a', '#efe4c8', '#3d5f94', '#d9a93a', '#f7f5ef', '#2f6b3f', '#8a3a8a', '#e07b39', '#2b2f38'];

/* A crowd, as a pattern: rows of heads on a tiered stand. */
function crowd(c, name, colors, seed, o) {
  o = o || {};
  const w = 24, rows = o.rows || 5, dx = o.dx || 1.2, dy = o.dy || 1.1, r = o.r || 0.36;
  const R = rng(seed); let s = '';
  for (let y = 0; y < rows; y++) for (let x = 0; x < Math.round(w / dx); x++) {
    if (R() < (o.empty == null ? 0.12 : o.empty)) continue;
    const cx = x * dx + dx / 2 + (y % 2) * dx / 2, cy = y * dy + dy / 2;
    const col = colors[Math.floor(R() * colors.length)];
    s += '<rect x="' + f(cx - r * 1.1) + '" y="' + f(cy + r * 0.6) + '" width="' + f(r * 2.2) + '" height="' + f(r * 1.4) + '" fill="' + col + '" opacity=".8"/>' +
      '<circle cx="' + f(cx) + '" cy="' + f(cy) + '" r="' + f(r * 0.72) + '" fill="' + (o.skin || '#c89a78') + '" opacity="' + f(0.55 + R() * 0.35) + '"/>';
  }
  const rule = o.rule === false ? '' : '<line x1="0" y1="' + f(rows * dy - 0.05) + '" x2="' + w + '" y2="' + f(rows * dy - 0.05) + '" stroke="rgba(0,0,0,.35)" stroke-width=".3"/>';
  return '<pattern id="' + c.id(name) + '" width="' + w + '" height="' + f(rows * dy) + '" patternUnits="userSpaceOnUse"' +
    (o.tf ? ' patternTransform="' + o.tf + '"' : '') + '>' + s + rule + '</pattern>';
}
function grad(c, name, stops, vertical) {
  return '<linearGradient id="' + c.id(name) + '" x1="0" y1="0" x2="' + (vertical === false ? '1' : '0') + '" y2="' + (vertical === false ? '0' : '1') + '">' +
    stops.map((s, i) => '<stop offset="' + (s[1] == null ? i / (stops.length - 1) : s[1]) + '" stop-color="' + s[0] + '"/>').join('') + '</linearGradient>';
}
/* The courtside board along the baseline, which is where the scene meets the floor. */
function courtside(c, fill, glow, seed) {
  const R = rng(seed || 3); let s = '<rect x="-200" y="36.4" width="500" height="3.6" fill="' + fill + '"/>';
  for (let x = X0 + 2; x < X1; x += 8 + R() * 4) s += '<rect x="' + f(x) + '" y="37.2" width="' + f(3 + R() * 3) + '" height="1.1" rx=".3" fill="' + glow + '" opacity="' + f(0.35 + R() * 0.4) + '"/>';
  return s + '<rect x="-200" y="36.4" width="500" height=".35" fill="rgba(255,255,255,.18)"/>';
}
/* A hanging scoreboard: four faces reduced to the one facing us. */
function jumbo(c, x, y, w, face, glow) {
  const h = w * 0.46;
  return '<line x1="' + f(x) + '" y1="0" x2="' + f(x) + '" y2="' + f(y) + '" stroke="#2a3140" stroke-width=".35"/>' +
    '<rect x="' + f(x - w / 2) + '" y="' + f(y) + '" width="' + f(w) + '" height="' + f(h) + '" rx=".6" fill="#171c26" stroke="#2c3444" stroke-width=".35"/>' +
    '<rect x="' + f(x - w / 2 + 0.8) + '" y="' + f(y + 0.8) + '" width="' + f(w - 1.6) + '" height="' + f(h - 1.9) + '" rx=".3" fill="' + face + '"/>' +
    '<rect x="' + f(x - w / 2 + 0.8) + '" y="' + f(y + h - 1) + '" width="' + f(w - 1.6) + '" height=".5" fill="' + glow + '"/>' +
    '<text x="' + f(x) + '" y="' + f(y + h * 0.56) + '" text-anchor="middle" font-family="Anton,Impact,sans-serif" font-size="' + f(h * 0.34) + '" fill="' + glow + '" opacity=".9">88 - 86</text>';
}
/* A title banner hanging from the rafters. */
function banner(x, y, w, h, fill, trim, star) {
  return '<path d="M ' + f(x) + ',' + f(y) + ' h ' + f(w) + ' v ' + f(h) + ' l ' + f(-w / 2) + ',' + f(w * 0.28) + ' l ' + f(-w / 2) + ',' + f(-w * 0.28) + ' Z" fill="' + fill + '"/>' +
    '<rect x="' + f(x + w * 0.14) + '" y="' + f(y + h * 0.18) + '" width="' + f(w * 0.72) + '" height="' + f(h * 0.1) + '" fill="' + trim + '"/>' +
    '<rect x="' + f(x + w * 0.14) + '" y="' + f(y + h * 0.62) + '" width="' + f(w * 0.72) + '" height="' + f(h * 0.08) + '" fill="' + trim + '" opacity=".7"/>' +
    (star ? '<circle cx="' + f(x + w / 2) + '" cy="' + f(y + h * 0.42) + '" r="' + f(w * 0.16) + '" fill="' + trim + '"/>' : '');
}
function lightRow(y, n, glow) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const x = X0 + 4 + i * ((X1 - X0 - 8) / (n - 1));
    s += '<rect x="' + f(x - 1.4) + '" y="' + f(y) + '" width="2.8" height="1" rx=".2" fill="#2a3140"/>' +
      '<circle cx="' + f(x) + '" cy="' + f(y + 0.5) + '" r=".42" fill="' + glow + '"/>' +
      '<ellipse cx="' + f(x) + '" cy="' + f(y + 2.4) + '" rx="3.4" ry="2" fill="' + glow + '" opacity=".08"/>';
  }
  return s;
}
function cloud(x, y, s, a) {
  return '<g fill="rgba(255,255,255,' + (a == null ? 0.85 : a) + ')"><ellipse cx="' + f(x) + '" cy="' + f(y) + '" rx="' + f(3 * s) + '" ry="' + f(1.1 * s) + '"/>' +
    '<ellipse cx="' + f(x - 1.6 * s) + '" cy="' + f(y - 0.5 * s) + '" rx="' + f(1.6 * s) + '" ry="' + f(s) + '"/>' +
    '<ellipse cx="' + f(x + 1.1 * s) + '" cy="' + f(y - 0.8 * s) + '" rx="' + f(1.8 * s) + '" ry="' + f(1.3 * s) + '"/></g>';
}
function stars(n, seed, maxY) {
  n = n * 3;
  const R = rng(seed); let s = '';
  for (let i = 0; i < n; i++) s += '<circle cx="' + f(X0 + R() * (X1 - X0)) + '" cy="' + f(R() * (maxY || 14)) + '" r="' + f(0.1 + R() * 0.18) + '" fill="rgba(255,255,255,' + f(0.4 + R() * 0.6) + ')"/>';
  return s;
}
function skyline(y, color, seed, lit, dense) {
  const R = rng(seed); let s = '', x = X0;
  while (x < X1) {
    const w = 3 + R() * (dense ? 4 : 6), h = 6 + R() * 13;
    s += '<rect x="' + f(x) + '" y="' + f(y - h) + '" width="' + f(w) + '" height="' + f(h + 2) + '" fill="' + color + '"/>';
    if (lit) for (let wy = y - h + 1; wy < y - 0.5; wy += 1.4) for (let wx = x + 0.6; wx < x + w - 0.6; wx += 1.2)
      if (R() < 0.45) s += '<rect x="' + f(wx) + '" y="' + f(wy) + '" width=".55" height=".6" fill="' + lit + '" opacity="' + f(0.5 + R() * 0.5) + '"/>';
    x += w + R() * 0.8;
  }
  return s;
}
/* A stand of seats in a bowl: a trapezoid in the stand colour, the crowd over it. */
function bowl(c, top, bot, fill, crowdName) {
  const P = X0 + ',' + f(bot) + ' ' + X1 + ',' + f(bot) + ' ' + X1 + ',' + f(top) + ' ' + X0 + ',' + f(top);
  return '<polygon points="' + P + '" fill="' + fill + '"/>' + (crowdName ? '<polygon points="' + P + '" fill="' + c.url(crowdName) + '"/>' : '');
}

/* ─── the scenes ───
   c: { id(name), url(name) }. Drawn in a 100 by 40 box whose bottom edge is the
   far baseline, so y 40 is where the floor starts and y 0 is the rafters. */
const SCENE = {};

SCENE.home = (c) => ({
  defs: crowd(c, 'cr', SHIRTS, 7) + crowd(c, 'cr2', SHIRTS, 19, { rows: 4, r: 0.3, dx: 1, dy: 0.95 }) +
    grad(c, 'dk', [['#0b0f17'], ['#1a2230']]),
  art: '<rect x="-200" width="500" height="40" fill="' + c.url('dk') + '"/>' +
    bowl(c, 6, 24, '#141a24', 'cr2') + '<rect x="-200" y="23.6" width="500" height=".6" fill="#0a0d13"/>' +
    bowl(c, 24.2, 36.4, '#1b2230', 'cr') +
    lightRow(1.2, 8, '#fff6d8') + jumbo(c, 50, 3.2, 20, '#0d2a4a', '#ffb347') +
    courtside(c, '#0e1219', '#f0782d', 5),
});

SCENE.rec = (c) => {
  /* cinder blocks, as a pattern: two courses, the second offset by half a block */
  const blocks = '<rect x="' + X0 + '" width="' + (X1 - X0) + '" height="36" fill="' + c.url('blk') + '"/>';
  let pen = '';
  const cols = ['#c9483a', '#2b58a8', '#e3b33d', '#2f7a47'];
  for (let i = -12; i < 25; i++) pen += '<path d="M ' + f(6 + i * 8) + ',4.2 l 3.6,0 l -1.8,4.2 Z" fill="' + cols[(i + 12) % 4] + '"/>';
  let bl = '';
  for (let r = 0; r < 7; r++) bl += '<rect x="-200" y="' + f(22 + r * 2) + '" width="500" height="1.2" fill="' + (r % 2 ? '#b98c55' : '#c99b62') + '"/>' +
    '<rect x="-200" y="' + f(23.2 + r * 2) + '" width="500" height=".8" fill="rgba(0,0,0,.28)"/>';
  return {
    defs: crowd(c, 'cr', SHIRTS, 31, { rows: 7, dy: 2, dx: 1.9, empty: 0.55, r: 0.42 }) +
      '<pattern id="' + c.id('blk') + '" width="3.2" height="3.2" patternUnits="userSpaceOnUse">' +
      '<rect x=".1" y=".1" width="3" height="1.4" fill="rgba(0,0,0,.04)"/><rect x="-1.5" y="1.7" width="3" height="1.4" fill="rgba(0,0,0,.04)"/>' +
      '<rect x="1.7" y="1.7" width="3" height="1.4" fill="rgba(0,0,0,.04)"/></pattern>',
    art: '<rect x="-200" width="500" height="40" fill="#e2dccb"/>' + blocks +
      '<rect x="-200" y="0" width="500" height="2.4" fill="#cfc7b1"/>' +
      '<line x1="-200" y1="4" x2="300" y2="4" stroke="#8b8577" stroke-width=".2"/>' + pen +
      /* high windows */
      [-58, -40, -22, -4, 14, 32, 68, 86, 104, 122, 140, 158].map((x) => '<rect x="' + (x - 4) + '" y="9.5" width="8" height="5" fill="#a6cde8" stroke="#8b8577" stroke-width=".4"/><line x1="' + x + '" y1="9.5" x2="' + x + '" y2="14.5" stroke="#8b8577" stroke-width=".3"/>').join('') +
      /* the clock and the exit sign */
      '<circle cx="50" cy="12" r="3" fill="#f7f5ef" stroke="#3a3a3a" stroke-width=".4"/><path d="M 50,12 l 0,-2 M 50,12 l 1.4,.8" stroke="#222" stroke-width=".3"/>' +
      '<rect x="88" y="17.5" width="4.4" height="1.8" rx=".2" fill="#1f7a3a"/><text x="90.2" y="18.9" text-anchor="middle" font-family="Arial,sans-serif" font-size="1.3" fill="#e9ffe9">EXIT</text>' +
      '<rect x="-200" y="20.4" width="500" height="16" fill="#7a5a37"/>' + bl +
      '<rect x="-200" y="20.4" width="500" height="16" fill="' + c.url('cr') + '"/>' +
      '<rect x="-200" y="36.4" width="500" height="3.6" fill="#6d6a60"/><rect x="-200" y="36.4" width="500" height=".3" fill="rgba(255,255,255,.25)"/>',
  };
};

SCENE.blacktop = (c) => {
  let bricks = '';
  const houses = [[-100, 16, '#9c5a3e'], [-84, 14, '#7a4030'], [-70, 15, '#8f503a'], [-55, 13, '#6f3b2c'], [-42, 15, '#a0603f'], [-27, 14, '#8a4a36'], [-13, 13, '#9c5a3e'], [0, 16, '#8a4a36'], [16, 13, '#9c5a3e'], [29, 15, '#7a4030'], [62, 14, '#8f503a'], [76, 12, '#6f3b2c'], [88, 12, '#a0603f'], [100, 15, '#7a4030'], [115, 13, '#8f503a'], [128, 16, '#6f3b2c'], [144, 14, '#9c5a3e'], [158, 15, '#8a4a36'], [173, 13, '#7a4030'], [186, 14, '#a0603f']];
  for (const [x, w, col] of houses) {
    const top = 12 + (x % 5);
    bricks += '<rect x="' + x + '" y="' + top + '" width="' + w + '" height="' + (36 - top) + '" fill="' + col + '"/>' +
      '<rect x="' + x + '" y="' + f(top - 1) + '" width="' + w + '" height="1" fill="#3b2b24"/>';
    for (let wx = x + 1.4; wx < x + w - 1.6; wx += 3.2) for (let wy = top + 2; wy < 32; wy += 4)
      bricks += '<rect x="' + f(wx) + '" y="' + f(wy) + '" width="1.8" height="2.4" fill="#2c3440"/><rect x="' + f(wx) + '" y="' + f(wy) + '" width="1.8" height=".4" fill="#e6dccb"/>';
  }
  /* the water tower and the trees */
  const tower = '<g transform="translate(47,5)"><path d="M -2,6 L -2.4,12 M 2,6 L 2.4,12" stroke="#4a3526" stroke-width=".4"/>' +
    '<rect x="-3.2" y="0" width="6.4" height="6" rx=".6" fill="#8a6440"/><path d="M -3.6,0 L 0,-2.6 L 3.6,0 Z" fill="#6a4a2e"/></g>';
  let trees = '';
  const R = rng(13);
  for (let i = 0; i < 9; i++) { const x = 44 + R() * 18, y = 22 + R() * 6; trees += '<circle cx="' + f(x) + '" cy="' + f(y) + '" r="' + f(3 + R() * 2) + '" fill="' + (R() < 0.5 ? '#3f7a32' : '#346a2a') + '"/>'; }
  return {
    defs: grad(c, 'sky', [['#7fb6e3'], ['#d9ecf7']]) +
      '<pattern id="' + c.id('fence') + '" width="1.6" height="1.6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
      '<rect width="1.6" height="1.6" fill="none" stroke="rgba(200,205,210,.75)" stroke-width=".16"/></pattern>',
    art: '<rect x="-200" width="500" height="40" fill="' + c.url('sky') + '"/>' + cloud(20, 6, 1.1, 0.8) + cloud(78, 4, 0.9, 0.7) +
      tower + bricks + trees +
      '<rect x="-200" y="30" width="500" height="6.4" fill="#5f6368"/>' +
      /* the chain-link fence on its posts */
      '<rect x="-200" y="14" width="500" height="22.4" fill="' + c.url('fence') + '"/>' +
      [-100, -84, -67, -50, -33, -16, 0, 16, 33, 50, 67, 84, 100, 116, 133, 150, 167, 184, 200].map((x) => '<rect x="' + f(x - 0.35) + '" y="13" width=".7" height="23.4" fill="#9aa1a8"/>').join('') +
      '<rect x="-200" y="13.6" width="500" height=".5" fill="#9aa1a8"/>' +
      '<rect x="-200" y="36.4" width="500" height="3.6" fill="#3a3d42"/>',
  };
};

SCENE.parquet = (c) => {
  let bn = '';
  for (let i = -9; i < 19; i++) bn += banner(9 + i * 9.4, 1.6, 6, 9.5, (i + 9) % 3 === 2 ? '#1f6b43' : '#f4f1e6', (i + 9) % 3 === 2 ? '#f4f1e6' : '#1f6b43', true);
  return {
    defs: crowd(c, 'cr', ['#1f6b43', '#f4f1e6', '#1f6b43', '#d9a93a', '#2b2f38', '#c9483a'], 23) +
      grad(c, 'dk', [['#0c110d'], ['#1b241c']]),
    art: '<rect x="-200" width="500" height="40" fill="' + c.url('dk') + '"/>' +
      '<rect x="-200" y="0" width="500" height="1.2" fill="#2c3a2e"/>' + bn +
      bowl(c, 17, 36.4, '#1d2a20', 'cr') +
      /* the old scoreboard with its bulbs */
      '<rect x="40" y="12.6" width="20" height="4" fill="#101410" stroke="#3a4a3c" stroke-width=".3"/>' +
      Array.from({ length: 16 }, (_, i) => '<circle cx="' + f(41.3 + i * 1.16) + '" cy="14.6" r=".32" fill="' + (i % 5 === 2 ? '#1a2a1c' : '#ffcf5a') + '"/>').join('') +
      courtside(c, '#0f1510', '#f4f1e6', 9),
  };
};

SCENE.sunset = (c) => {
  let beams = '';
  [[-30, 8], [-12, -6], [18, -12], [36, 6], [64, -6], [82, 12], [112, 6], [130, -8]].forEach(([x, lean]) => {
    beams += '<path d="M ' + x + ',0 L ' + f(x + lean - 7) + ',36 L ' + f(x + lean + 7) + ',36 Z" fill="rgba(255,226,150,.08)"/>';
  });
  let bn = '';
  for (let i = 0; i < 6; i++) bn += banner(22 + i * 10, 1.4, 5.6, 8, '#ffcf4a', '#5a2a82', true);
  return {
    defs: crowd(c, 'cr', ['#5a2a82', '#ffcf4a', '#f7f5ef', '#5a2a82', '#2b2f38', '#ffcf4a'], 41) +
      grad(c, 'dk', [['#1c0c2e'], ['#361a52']]),
    art: '<rect x="-200" width="500" height="40" fill="' + c.url('dk') + '"/>' + stars(40, 5, 10) + bn +
      bowl(c, 14, 36.4, '#2a1540', 'cr') + beams + lightRow(0.6, 7, '#ffe7a8') +
      jumbo(c, 50, 2.4, 16, '#2a1244', '#ffcf4a') + courtside(c, '#1b0d2a', '#ffcf4a', 11),
  };
};

SCENE.fieldhouse = (c) => {
  /* brick, as a pattern of two courses */
  const bricks = '<rect x="' + X0 + '" width="' + (X1 - X0) + '" height="36" fill="' + c.url('brk') + '"/>';
  let win = '';
  [-52, -34, -16, 0, 16, 32, 50, 68, 84, 100, 116, 134, 152].forEach((x) => {
    win += '<path d="M ' + (x - 4.5) + ',18 L ' + (x - 4.5) + ',7 Q ' + x + ',2.4 ' + (x + 4.5) + ',7 L ' + (x + 4.5) + ',18 Z" fill="#e8eef2" stroke="#4a2a1e" stroke-width=".5"/>' +
      '<path d="M ' + x + ',3.6 L ' + x + ',18 M ' + (x - 4.5) + ',12 L ' + (x + 4.5) + ',12" stroke="#4a2a1e" stroke-width=".3"/>' +
      '<path d="M ' + (x - 4.5) + ',18 L ' + (x - 9) + ',36 L ' + (x + 1) + ',36 L ' + (x + 4.5) + ',18 Z" fill="rgba(255,238,200,.07)"/>';
  });
  let truss = '<rect x="-200" y="0" width="500" height="1.4" fill="#2a2a2a"/>';
  for (let x = X0; x < X1; x += 4) truss += '<path d="M ' + x + ',1.4 L ' + (x + 2) + ',0 L ' + (x + 4) + ',1.4" fill="none" stroke="#3a3a3a" stroke-width=".25"/>';
  let bl = '';
  for (let r = 0; r < 6; r++) bl += '<rect x="-200" y="' + f(24.4 + r * 2) + '" width="500" height="1.3" fill="' + (r % 2 ? '#8e6436' : '#a07240') + '"/>';
  return {
    defs: crowd(c, 'cr', ['#7a1e22', '#efe4c8', '#2b2f38', '#d9a93a', '#7a1e22'], 29, { rows: 6, dy: 2, dx: 1.5, empty: 0.28 }) +
      '<pattern id="' + c.id('brk') + '" width="5.6" height="2.4" patternUnits="userSpaceOnUse">' +
      '<rect x=".08" y=".08" width="2.64" height="1.04" fill="rgba(0,0,0,.07)"/><rect x="2.88" y=".08" width="2.64" height="1.04" fill="rgba(0,0,0,.02)"/>' +
      '<rect x="-1.32" y="1.28" width="2.64" height="1.04" fill="rgba(0,0,0,.03)"/><rect x="1.48" y="1.28" width="2.64" height="1.04" fill="rgba(0,0,0,.06)"/>' +
      '<rect x="4.28" y="1.28" width="2.64" height="1.04" fill="rgba(0,0,0,.03)"/></pattern>',
    art: '<rect x="-200" width="500" height="40" fill="#7a4232"/>' + bricks + win + truss +
      '<rect x="-200" y="24" width="500" height="12.4" fill="#5d4128"/>' + bl +
      '<rect x="-200" y="24" width="500" height="12.4" fill="' + c.url('cr') + '"/>' +
      '<rect x="-200" y="36.4" width="500" height="3.6" fill="#3a2a1c"/>',
  };
};

SCENE.boardwalk = (c) => {
  let palms = '';
  [[-40, 23, 1], [-22, 26, -1], [10, 22, 1], [22, 26, -1], [80, 21, 1], [92, 25, -1], [124, 24, 1], [142, 22, -1]].forEach(([x, top, d]) => {
    palms += '<path d="M ' + x + ',36 Q ' + f(x + d * 1.5) + ',' + f((36 + top) / 2) + ' ' + f(x + d * 0.8) + ',' + top + '" fill="none" stroke="#5c4028" stroke-width=".8"/>';
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2, ex = x + d * 0.8 + Math.cos(a) * 5, ey = top + Math.sin(a) * 2.4 + 1.2;
      palms += '<path d="M ' + f(x + d * 0.8) + ',' + top + ' Q ' + f((x + d * 0.8 + ex) / 2) + ',' + f(top - 1.6) + ' ' + f(ex) + ',' + f(ey) + '" fill="none" stroke="#2f6b3f" stroke-width=".9"/>';
    }
  });
  return {
    defs: grad(c, 'sky', [['#ff9a62', 0], ['#ffc98b', 0.45], ['#9fd0e8', 1]]) + grad(c, 'sea', [['#2d7fa6'], ['#1a5a7a']]) +
      '<radialGradient id="' + c.id('sun') + '"><stop offset="0" stop-color="rgba(255,240,190,1)"/><stop offset=".35" stop-color="rgba(255,200,120,.6)"/><stop offset="1" stop-color="rgba(255,200,120,0)"/></radialGradient>',
    art: '<rect x="-200" width="500" height="40" fill="' + c.url('sky') + '"/>' +
      '<circle cx="62" cy="21" r="10" fill="' + c.url('sun') + '"/><circle cx="62" cy="21" r="3" fill="#fff4cf"/>' +
      cloud(24, 8, 1, 0.6) + cloud(84, 11, 0.8, 0.5) +
      '<rect x="-200" y="22" width="500" height="9" fill="' + c.url('sea') + '"/>' +
      '<path d="M 50,22.2 L 58,22.2 L 60,31 L 48,31 Z" fill="rgba(255,220,160,.35)"/>' +
      /* the pier and its lamp posts */
      '<rect x="70" y="24" width="70" height=".8" fill="#6b4a2e"/>' +
      Array.from({ length: 13 }, (_, i) => '<rect x="' + f(71 + i * 5.4) + '" y="24.8" width=".5" height="4" fill="#5a3c24"/>').join('') +
      '<rect x="-200" y="31" width="500" height="5.4" fill="#e8d3a2"/>' + palms +
      '<rect x="-200" y="36.4" width="500" height="3.6" fill="#cdb488"/><rect x="-200" y="36.4" width="500" height=".3" fill="rgba(255,255,255,.3)"/>',
  };
};

SCENE.altitude = (c) => {
  let pines = '';
  const R = rng(21);
  for (let i = 0; i < 64; i++) {
    const x = X0 + i * 4.8 + R() * 2, h = 5 + R() * 4;
    pines += '<path d="M ' + f(x) + ',' + f(30 - h) + ' L ' + f(x + 2.2) + ',30 L ' + f(x - 2.2) + ',30 Z" fill="' + (R() < 0.5 ? '#244a36' : '#1c3d2c') + '"/>';
  }
  const mullions = [-100, -80, -60, -40, -20, 0, 20, 40, 60, 80, 100, 120, 140, 160, 180, 200].map((x) => '<rect x="' + f(x - 0.4) + '" y="0" width=".8" height="30" fill="#394656"/>').join('');
  return {
    defs: grad(c, 'sky', [['#5f9ed6'], ['#dcebf7']]) + crowd(c, 'cr', ['#1e4f8f', '#f4f1e6', '#c9483a', '#e3b33d', '#2b2f38'], 37, { rows: 3 }),
    art: '<rect x="-200" width="500" height="40" fill="' + c.url('sky') + '"/>' + cloud(30, 5, 1, 0.8) +
      '<path d="M -100,22 L -80,10 L -64,18 L -44,8 L -20,19 L 0,24 L 12,12 L 20,17 L 34,6 L 46,16 L 56,9 L 70,19 L 82,8 L 100,20 L 118,9 L 136,18 L 152,7 L 176,17 L 200,12 L 200,30 L -100,30 Z" fill="#8aa3bd"/>' +
      '<path d="M 34,6 L 30,10 L 33,9.4 L 36,11 L 38.4,8.8 Z M 82,8 L 78.4,11.6 L 81.4,11 L 84,12.6 L 86,10.4 Z M 56,9 L 53,12 L 56,11.4 L 58.6,12.6 Z" fill="#f7fbff"/>' +
      '<path d="M -100,26 L -70,19 L -40,24 L -12,18 L 0,28 L 18,20 L 30,24 L 50,17 L 66,24 L 84,19 L 100,25 L 124,18 L 150,24 L 176,19 L 200,24 L 200,30 L -100,30 Z" fill="#6f8aa6"/>' +
      pines + mullions + '<rect x="-200" y="0" width="500" height="1.6" fill="#394656"/>' +
      '<rect x="-200" y="29.6" width="500" height="6.8" fill="#2b3442"/><rect x="-200" y="29.6" width="500" height="6.8" fill="' + c.url('cr') + '"/>' +
      courtside(c, '#1a2230', '#7ec3ff', 17),
  };
};

SCENE.rooftop = (c) => ({
  defs: grad(c, 'sky', [['#0a1330'], ['#2a3a6a']]),
  art: '<rect x="-200" width="500" height="40" fill="' + c.url('sky') + '"/>' + stars(60, 9, 18) +
    '<circle cx="84" cy="7" r="2.6" fill="#f3efe0"/><circle cx="85.1" cy="6.4" r="2.2" fill="#12204a"/>' +
    skyline(30, '#152046', 3, '#ffd98a') + skyline(33, '#0d1633', 8, '#ffe7b0', true) +
    /* a water tower on the next roof */
    '<g transform="translate(18,17)"><path d="M -1.6,5 L -2,10 M 1.6,5 L 2,10" stroke="#2c2a33" stroke-width=".35"/><rect x="-2.6" y="0" width="5.2" height="5" rx=".5" fill="#3a3140"/><path d="M -3,0 L 0,-2.1 L 3,0 Z" fill="#2c2432"/></g>' +
    /* the fence round the roof */
    '<rect x="-200" y="33.4" width="500" height="3" fill="rgba(150,160,180,.18)"/>' +
    Array.from({ length: 61 }, (_, i) => '<rect x="' + f(X0 + i * 5 - 0.2) + '" y="32.6" width=".4" height="3.8" fill="#6a7390"/>').join('') +
    '<rect x="-200" y="32.6" width="500" height=".4" fill="#6a7390"/>' +
    '<rect x="-200" y="36.4" width="500" height="3.6" fill="#101a33"/>',
});

SCENE.cathedral = (c) => ({
  defs: crowd(c, 'cr', SHIRTS, 51, { rows: 7, r: 0.3, dx: 0.95, dy: 0.9, empty: 0.04, skin: '#8a6a58' }) +
    '<radialGradient id="' + c.id('spot') + '" cx="50%" cy="100%" r="70%"><stop offset="0" stop-color="rgba(255,244,220,.34)"/><stop offset="1" stop-color="rgba(255,244,220,0)"/></radialGradient>',
  art: '<rect x="-200" width="500" height="40" fill="#05070b"/>' +
    bowl(c, 8, 36.4, '#0c0f16', 'cr') +
    '<rect x="-200" y="7.4" width="500" height="1" fill="#1b2230"/>' +
    Array.from({ length: 90 }, (_, i) => '<circle cx="' + f(X0 + 2 + i * 3.3) + '" cy="7.9" r=".22" fill="#fff4d8"/>').join('') +
    /* one cone of light onto the floor */
    '<path d="M 46,0 L 54,0 L 72,40 L 28,40 Z" fill="' + c.url('spot') + '"/>' +
    jumbo(c, 50, 1.2, 14, '#0a0e18', '#9fc4ff') + courtside(c, '#07090e', '#9fc4ff', 13),
});

SCENE.banners = (c) => {
  let bn = '';
  for (let row = 0; row < 2; row++) for (let i = -11; i < 23; i++)
    bn += banner(3 + i * 8.8 + row * 4.4, 1.2 + row * 8.2, 5, 6.8, row ? '#f4f1e6' : '#c89628', row ? '#c89628' : '#f4f1e6', true);
  return {
    defs: crowd(c, 'cr', ['#c89628', '#f4f1e6', '#2b2f38', '#c89628', '#8a3a3a'], 61),
    art: '<rect x="-200" width="500" height="40" fill="#120e08"/>' + bn +
      bowl(c, 20, 36.4, '#1d1810', 'cr') + lightRow(18.6, 9, '#ffe2a0') + courtside(c, '#120e08', '#c89628', 21),
  };
};

SCENE.neon = (c) => {
  let grid = '';
  for (let i = -8; i <= 20; i++) grid += '<line x1="' + f(50 + (i - 6) * 3) + '" y1="26" x2="' + f(50 + (i - 6) * 16) + '" y2="36.4" stroke="#ff4fa3" stroke-width=".18" opacity=".7"/>';
  [27, 28.6, 30.6, 33.2].forEach((y) => { grid += '<line x1="' + X0 + '" y1="' + y + '" x2="' + X1 + '" y2="' + y + '" stroke="#ff4fa3" stroke-width=".18" opacity=".6"/>'; });
  let sunBands = '';
  [16, 18.4, 20.6, 22.6, 24.4].forEach((y, k) => { sunBands += '<rect x="36" y="' + y + '" width="28" height="' + f(0.5 + k * 0.18) + '" fill="#1a0b2e"/>'; });
  return {
    defs: grad(c, 'sky', [['#0d0520'], ['#3a0f4a', 0.7], ['#ff4fa3', 1]]) + grad(c, 'sun', [['#ffe36b'], ['#ff4fa3']]),
    art: '<rect x="-200" width="500" height="40" fill="' + c.url('sky') + '"/>' + stars(30, 4, 12) +
      '<circle cx="50" cy="20" r="11" fill="' + c.url('sun') + '"/>' + sunBands +
      skyline(26, '#12072a', 14, '#2de2d6', true) +
      '<rect x="-200" y="26" width="500" height="10.4" fill="#120828"/>' + grid +
      '<rect x="-200" y="36.4" width="500" height="3.6" fill="#0a0414"/><rect x="-200" y="36.4" width="500" height=".35" fill="#2de2d6"/>',
  };
};

SCENE.glass = (c) => {
  let ribbon = '';
  for (let x = X0; x < X1; x += 6) ribbon += '<rect x="' + x + '" y="21.2" width="4" height="1.2" fill="#6ec2ff" opacity=".7"/>';
  return {
    defs: crowd(c, 'cr', ['#1d3a66', '#e9f2ff', '#6ec2ff', '#2b2f38', '#1d3a66'], 71) + grad(c, 'dk', [['#02060d'], ['#0b1a30']]),
    art: '<rect x="-200" width="500" height="40" fill="' + c.url('dk') + '"/>' +
      bowl(c, 4, 20.6, '#0c1830', 'cr') +
      '<rect x="-200" y="20.6" width="500" height="2.4" fill="#061022"/>' + ribbon +
      bowl(c, 23, 36.4, '#0f1f3a', 'cr') +
      '<rect x="-200" y="3.4" width="500" height=".5" fill="#6ec2ff" opacity=".8"/>' +
      jumbo(c, 50, 0.8, 18, '#051428', '#6ec2ff') + courtside(c, '#030812', '#6ec2ff', 29),
  };
};

/* The scene for an arena, as an SVG string. Every id carries the suffix AND the
   arena's id, so thirteen of them on one sheet beside a court never paint each
   other: a gradient id shared by two SVGs on one page resolves to whichever
   came first, and nothing says so. */
function scene(id, sfx) {
  const arena = BY_ID[id] ? id : 'home';
  const tag = (sfx || 's') + '-' + arena;
  const c = { id: (n) => n + '-' + tag, url: (n) => 'url(#' + n + '-' + tag + ')' };
  const s = (SCENE[arena] || SCENE.home)(c);
  return '<svg class="scene-svg" viewBox="0 0 100 40" preserveAspectRatio="xMidYMax meet" aria-hidden="true" data-arena="' + arena + '">' +
    '<defs>' + (s.defs || '') + '</defs>' + s.art + '</svg>';
}

/* A thumbnail for the shelf: the scene with a slice of the floor under it,
   drawn in one SVG so a card needs no CSS court at all. */
function preview(id, sfx) {
  const arena = BY_ID[id] ? id : 'home';
  const F = floorOf(arena);
  const tag = (sfx || 'pv') + '-' + arena;
  const c = { id: (n) => n + '-' + tag, url: (n) => 'url(#' + n + '-' + tag + ')' };
  const s = (SCENE[arena] || SCENE.home)(c);
  /* The floor, in the same perspective as the court: a trapezoid from the far
     baseline out to the near edge, the lane painted on it. */
  const fl = grad(c, 'fl', [[F.m[3]], [F.m[1], 0.5], [F.m[0]]]);
  const floor = '<polygon points="8,40 92,40 108,62 -8,62" fill="' + c.url('fl') + '"/>' +
    '<polygon points="41,40 59,40 62,52 38,52" fill="' + F.paint[0] + '"/>' +
    '<polygon points="41,40 59,40 62,52 38,52" fill="none" stroke="' + F.line + '" stroke-width=".5"/>' +
    '<path d="M 16,40 Q 50,72 84,40" fill="none" stroke="' + F.line + '" stroke-width=".5"/>' +
    '<line x1="-8" y1="62" x2="8" y2="40" stroke="' + F.line + '" stroke-width=".4"/><line x1="92" y1="40" x2="108" y2="62" stroke="' + F.line + '" stroke-width=".4"/>' +
    '<rect x="47" y="31" width="6" height="4" fill="rgba(255,255,255,.88)" stroke="#333" stroke-width=".3"/>' +
    '<ellipse cx="50" cy="36.2" rx="1.8" ry=".6" fill="none" stroke="' + F.rim + '" stroke-width=".45"/>';
  return '<svg class="arena-pv" viewBox="0 0 100 62" preserveAspectRatio="xMidYMid slice" aria-hidden="true" data-arena="' + arena + '">' +
    '<defs>' + (s.defs || '') + fl + '</defs>' + s.art + floor + '</svg>';
}

const api = { COURTS_API_VERSION, TQ, project, farEdge, ARENAS, BY_ID, status, unlockedIds,
  floorOf, floorVars, scene, preview, FLOOR };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.RTF_COURTS = api;
})();
