/* Run The Diamond: ballparks.
 *
 * A ballpark is the backdrop the draft is played on, and it is a thing an
 * account EARNS. Thirteen of them, each a nod to a park a fan already carries a
 * picture of, and none of them named for it: the names, signs and logos of real
 * parks belong to other people, so every one here is drawn from what makes the
 * place itself (ivy on brick, a green wall in left, fountains, a bay) and given
 * a name of its own.
 *
 * UNLOCKS ARE DERIVED, NEVER STORED, which is the badge cabinet's design arriving
 * at a second shelf. Every rule is a question about the same account-scoped rows
 * the cabinet reads (plus whether the account is Pro), so a park is retroactive,
 * follows the account to a new device, and cannot be lost by clearing site data.
 * A guest plays on the home park; everything else asks for an account, because
 * the rows a guest files are not anybody's.
 *
 * THE FIELD IS THE SPORT AND THE BACKDROP IS THE PARK. Every park draws the same
 * diamond at the same coordinates, so the chips in DIAMOND_SPOTS stand where they
 * always stood; what a park changes is the grass, the dirt, the wall and
 * everything behind it. Every colour is a literal, because the field is not the
 * page's theme: a day game is a day game at night.
 *
 * The drawing area above the diamond is extended by `sky` units (viewBox y from
 * -sky), so the draft field has room for a skyline without moving a single chip:
 * the page maps a chip's 68-unit y into the taller box. The home page hero passes
 * sky 0 and always draws the home park.
 *
 * Browser: window.RTD_PARKS. Node: require('./parks.js').
 */
'use strict';
(function () {

const SKY = 10;
/* The lower camera: the ground is squashed toward home by K with home plate at A,
   and the wall face stands WALL_H units tall. The page's DIAMOND_SPOTS are this
   same projection, so the three are exported for the checker to hold them. */
const GROUND_K = 0.85, GROUND_A = 60.5, WALL_H = 6;

/* ─── the catalogue ───
   `need` answers how far along the account is; `of` is the target. A park with no
   `of` is a yes or no. `pro` parks are the account tier's. */
const PARKS = [
  { id: 'home', name: 'The Diamond', nod: 'The park every run starts in.',
    rarity: 'Starter', unlock: { label: 'Yours from the first pitch', free: true } },
  { id: 'cornfield', name: 'The Cornfield', nod: 'Golden hour on a farm in Iowa.',
    rarity: 'Common', unlock: { label: 'Play a season', need: (i) => i.ctx.n, of: 1 } },
  { id: 'ivy', name: 'Ivy Corner', nod: 'Ivy on brick and rooftop bleachers.',
    rarity: 'Common', unlock: { label: 'Earn 5 badges', need: (i) => i.badges, of: 5 } },
  { id: 'warehouse', name: 'Warehouse Yard', nod: 'A brick warehouse down the right field line.',
    rarity: 'Rare', unlock: { label: 'Reach October', need: (i) => i.ctx.octobers, of: 1 } },
  { id: 'ravine', name: 'The Ravine', nod: 'Palms, hills and a zigzag roof at dusk.',
    rarity: 'Rare', unlock: { label: 'Win 90 games in a season', need: (i) => i.ctx.best.wins, of: 90 } },
  { id: 'fountains', name: 'Fountain Park', nod: 'Water dancing beyond the fence.',
    rarity: 'Rare', unlock: { label: 'Earn 15 badges', need: (i) => i.badges, of: 15 } },
  { id: 'bayside', name: 'Bayside', nod: 'Splash hits into the bay.',
    rarity: 'Epic', unlock: { label: 'Play all 7 modes', need: (i) => Object.keys(i.ctx.modeRuns || {}).length, of: 7 } },
  { id: 'milehigh', name: 'Mile High', nod: 'Snow on the peaks, pines in center.',
    rarity: 'Epic', unlock: { label: 'Win 100 games in a season', need: (i) => i.ctx.best.wins, of: 100 } },
  { id: 'frieze', name: 'The Frieze', nod: 'A white frieze, three decks and the train.',
    rarity: 'Epic', unlock: { label: 'Win the World Series', need: (i) => i.ctx.titles, of: 1 } },
  { id: 'monster', name: 'The Monster', nod: 'The tall green wall in left.',
    rarity: 'Legendary', unlock: { label: 'Earn 40 badges', need: (i) => i.badges, of: 40 } },
  { id: 'horseshoe', name: 'The Horseshoe', nod: 'A 1920s bathtub park, in sepia.',
    rarity: 'Legendary', unlock: { label: 'Play 25 seasons', need: (i) => i.ctx.n, of: 25 } },
  { id: 'dome', name: 'The Dome', nod: 'Turf, a ribbed roof and a light show.',
    rarity: 'Pro', unlock: { label: 'Run The Diamond Pro', pro: true } },
  { id: 'neon', name: 'Neon Nights', nod: 'Pink and teal over the water.',
    rarity: 'Pro', unlock: { label: 'Run The Diamond Pro', pro: true } },
];
const BY_ID = Object.fromEntries(PARKS.map((p) => [p.id, p]));

/* info: { signed, pro, badges, ctx } where ctx is RTD_ACH.buildCtx over the
   account's own rows. Returns { ok, have, of, label }. */
function status(park, info) {
  const u = park.unlock;
  if (u.free) return { ok: true, label: u.label };
  /* A guest is told the one thing standing between them and every park: an
     account. "Sign in and ..." reads as one step, and a Pro park names Pro
     rather than lower-casing a product name. */
  if (!info || !info.signed) return { ok: false, guest: true,
    label: u.pro ? 'Sign in and get Pro' : 'Sign in and ' + u.label.charAt(0).toLowerCase() + u.label.slice(1) };
  if (u.pro) return { ok: !!info.pro, label: u.label };
  let have = 0;
  try { have = Math.max(0, Number(u.need(info)) || 0); } catch (_) { have = 0; }
  return { ok: have >= u.of, have: Math.min(have, u.of), of: u.of, label: u.label };
}
function unlockedIds(info) { return PARKS.filter((p) => status(p, info).ok).map((p) => p.id); }

/* ─── drawing helpers ─── */
const f = (n) => (Math.round(n * 100) / 100).toString();
function rng(seed) { let s = seed % 2147483647; if (s <= 0) s += 2147483646; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
/* A curve through both corners, as the wall and the track are drawn. */
const curve = (y0, apex) => 'M 0,' + y0 + ' Q 50,' + (2 * apex - y0) + ' 100,' + y0;
function curveY(x, y0, apex) { const t = x / 100, c = 2 * apex - y0; return (1 - t) * (1 - t) * y0 + 2 * t * (1 - t) * c + t * t * y0; }

/* The home palette. Every park starts from this and overrides what it changes. */
const BASE = {
  grass: ['#4c9e3a', '#3f8f31', '#347a29'], foul: '#2f7026', mow: 'diag',
  dirt: ['#d2ad6e', '#b48a52'], mound: ['#dcb97c', '#a97f48'], track: '#a67d4a', skin: true,
  wall: ['#23523a', '#163826'], wallLine: '#e8c820', pads: true, pole: '#e8c820',
  chalk: 1, sky: ['#1c2330', '#34404f'], wallTop: [11.4, 5.0], night: false,
};

function crowdPattern(id, colors, seed, opts) {
  opts = opts || {};
  const w = 21, rows = opts.rows || 6, dx = opts.dx || 1.05, dy = opts.dy || 0.95, r = opts.r || 0.3;
  const R = rng(seed); let s = '';
  for (let y = 0; y < rows; y++) for (let x = 0; x < Math.round(w / dx); x++) {
    if (R() < (opts.empty == null ? 0.18 : opts.empty)) continue;
    s += '<circle cx="' + f(x * dx + dx / 2 + (y % 2) * dx / 2) + '" cy="' + f(y * dy + dy / 2) + '" r="' + r +
      '" fill="' + colors[Math.floor(R() * colors.length)] + '" opacity="' + f(0.55 + R() * 0.4) + '"/>';
  }
  const rule = opts.rule === false ? '' : '<line x1="0" y1="' + f(rows * dy - 0.02) + '" x2="' + w + '" y2="' + f(rows * dy - 0.02) + '" stroke="rgba(0,0,0,.35)" stroke-width="0.25"/>';
  return '<pattern id="' + id + '" width="' + w + '" height="' + f(rows * dy) + '" patternUnits="userSpaceOnUse">' + s + rule + '</pattern>';
}
const SHIRTS = ['#c9483a', '#efe4c8', '#3d5f94', '#d9a93a', '#f7f5ef', '#2f6b3f', '#8a3a8a', '#e07b39'];

/* ─── the backdrops ───
   c: { id(name) -> unique id, url(name), sky, wy(x) the wall top at x,
        band(a,b) the region a to b units above the wall top, up(off) that curve }.
   Everything drawn here is clipped to the region above the wall. */
const BACK = {};

BACK.home = (c) => ({
  defs: crowdPattern(c.id('crowd'), SHIRTS, 7) +
    '<linearGradient id="' + c.id('st') + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c2330"/><stop offset="1" stop-color="#34404f"/></linearGradient>' +
    '<linearGradient id="' + c.id('sh') + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(0,0,0,.6)"/><stop offset=".6" stop-color="rgba(0,0,0,0)"/></linearGradient>',
  art:
    '<rect x="0" y="' + -c.sky + '" width="100" height="30" fill="' + c.url('st') + '"/>' +
    '<rect x="0" y="' + -c.sky + '" width="100" height="30" fill="' + c.url('crowd') + '"/>' +
    '<rect x="0" y="' + -c.sky + '" width="100" height="22" fill="' + c.url('sh') + '"/>' +
    /* the roof and its lights */
    '<rect x="0" y="' + -c.sky + '" width="100" height="2.2" fill="#10151f"/>' +
    lightBank(c, 14, -c.sky + 1.2, 10) + lightBank(c, 86, -c.sky + 1.2, 10),
});

function lightBank(c, x, y, w) {
  let s = '<rect x="' + f(x - w / 2) + '" y="' + f(y - 1) + '" width="' + w + '" height="1.8" rx=".3" fill="#2a3240"/>';
  for (let i = 0; i < 6; i++) s += '<circle cx="' + f(x - w / 2 + 1 + i * (w - 2) / 5) + '" cy="' + f(y - 0.1) + '" r=".45" fill="#fffbe6"/>';
  return s + '<ellipse cx="' + x + '" cy="' + f(y + 1.5) + '" rx="' + f(w * 0.9) + '" ry="3" fill="rgba(255,248,210,.16)"/>';
}
function skyRect(c, top, bottom, id) {
  return { defs: '<linearGradient id="' + c.id(id || 'sky') + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + top + '"/><stop offset="1" stop-color="' + bottom + '"/></linearGradient>',
    art: '<rect x="0" y="' + -c.sky + '" width="100" height="40" fill="' + c.url(id || 'sky') + '"/>' };
}
function cloud(x, y, s, a) {
  a = a == null ? 0.85 : a;
  return '<g fill="rgba(255,255,255,' + a + ')"><ellipse cx="' + x + '" cy="' + y + '" rx="' + f(3 * s) + '" ry="' + f(1.1 * s) + '"/>' +
    '<ellipse cx="' + f(x - 1.6 * s) + '" cy="' + f(y - 0.5 * s) + '" rx="' + f(1.6 * s) + '" ry="' + f(1 * s) + '"/>' +
    '<ellipse cx="' + f(x + 1.1 * s) + '" cy="' + f(y - 0.8 * s) + '" rx="' + f(1.8 * s) + '" ry="' + f(1.3 * s) + '"/></g>';
}
function stars(c, n, seed) {
  const R = rng(seed); let s = '';
  for (let i = 0; i < n; i++) s += '<circle cx="' + f(R() * 100) + '" cy="' + f(-c.sky + R() * 9) + '" r="' + f(0.08 + R() * 0.16) + '" fill="rgba(255,255,255,' + f(0.4 + R() * 0.6) + ')"/>';
  return s;
}
/* Grandstand along the wall between two x, `h` units tall, crowd inside. */
function stand(c, x0, x1, h, fill, crowdUrl, roof) {
  const pts = [];
  for (let i = 0; i <= 10; i++) { const x = x0 + (x1 - x0) * i / 10; pts.push(f(x) + ',' + f(c.wy(x) + 0.3)); }
  for (let i = 10; i >= 0; i--) { const x = x0 + (x1 - x0) * i / 10; pts.push(f(x) + ',' + f(c.wy(x) - h)); }
  const P = pts.join(' ');
  let s = '<polygon points="' + P + '" fill="' + fill + '"/>';
  if (crowdUrl) s += '<polygon points="' + P + '" fill="' + crowdUrl + '"/>';
  if (roof) {
    const top = [];
    for (let i = 0; i <= 10; i++) { const x = x0 + (x1 - x0) * i / 10; top.push(f(x) + ',' + f(c.wy(x) - h)); }
    s += '<polyline points="' + top.join(' ') + '" fill="none" stroke="' + roof + '" stroke-width="1"/>';
  }
  return s;
}

/* A band a to b units above the wall, between two x. */
function strip(c, x0, x1, a, b, fill) {
  const pts = [];
  for (let i = 0; i <= 10; i++) { const x = x0 + (x1 - x0) * i / 10; pts.push(f(x) + ',' + f(c.wy(x) - a)); }
  for (let i = 10; i >= 0; i--) { const x = x0 + (x1 - x0) * i / 10; pts.push(f(x) + ',' + f(c.wy(x) - b)); }
  return '<polygon points="' + pts.join(' ') + '" fill="' + fill + '"/>';
}

BACK.cornfield = (c) => {
  const sky = skyRect(c, '#7fb3d9', '#f7d59a');
  const R = rng(11); let stalks = '';
  for (let i = 0; i < 120; i++) {
    const x = i * (100 / 120) + R() * 0.5, base = c.wy(x) + 0.4, top = base - 4.2 - R() * 1.6;
    stalks += '<line x1="' + f(x) + '" y1="' + f(base) + '" x2="' + f(x + (R() - 0.5) * 0.6) + '" y2="' + f(top) + '" stroke="' + (R() < 0.5 ? '#9b8a2e' : '#b8a24a') + '" stroke-width=".35"/>' +
      '<path d="M ' + f(x) + ',' + f(top + 1.4) + ' q ' + f(1.1 + R()) + ',' + f(-0.3) + ' ' + f(1.6 + R()) + ',' + f(0.9) + '" fill="none" stroke="#6d8a2a" stroke-width=".3"/>' +
      (R() < 0.35 ? '<ellipse cx="' + f(x + 0.2) + '" cy="' + f(top + 0.6) + '" rx=".25" ry=".7" fill="#f0cf5a"/>' : '');
  }
  let corn = '';
  const pts = []; for (let i = 0; i <= 20; i++) { const x = i * 5; pts.push(f(x) + ',' + f(c.wy(x) + 0.4)); }
  for (let i = 20; i >= 0; i--) { const x = i * 5; pts.push(f(x) + ',' + f(c.wy(x) - 3.8)); }
  corn = '<polygon points="' + pts.join(' ') + '" fill="#8a7a2a"/>';
  return {
    defs: sky.defs + '<radialGradient id="' + c.id('sun') + '"><stop offset="0" stop-color="rgba(255,236,170,.95)"/><stop offset=".25" stop-color="rgba(255,214,120,.55)"/><stop offset="1" stop-color="rgba(255,214,120,0)"/></radialGradient>',
    art: sky.art +
      '<circle cx="78" cy="-3" r="11" fill="' + c.url('sun') + '"/><circle cx="78" cy="-3" r="2.2" fill="#fff4cf"/>' +
      cloud(24, -6, 1.1, 0.7) + cloud(55, -8, 0.8, 0.55) +
      /* the tree line, then the farm, then the corn in front of both */
      '<path d="M 0,2 Q 6,-1.5 12,1 Q 18,-2 26,0.5 Q 34,-1 40,1.5 L 40,8 L 0,8 Z" fill="#3f5a2a"/>' +
      '<path d="M 60,1.2 Q 68,-1.8 76,0.8 Q 86,-1.2 100,1 L 100,8 L 60,8 Z" fill="#46632f"/>' +
      /* farmhouse with a porch */
      '<g transform="translate(13,-1.6)"><rect x="0" y="0" width="7" height="4.2" fill="#f4efe2"/><path d="M -0.6,0.2 L 3.5,-2.6 L 7.6,0.2 Z" fill="#9a3a2c"/>' +
      '<rect x="1" y="1.2" width="1.1" height="1.2" fill="#6d8fb0"/><rect x="4.8" y="1.2" width="1.1" height="1.2" fill="#6d8fb0"/><rect x="3" y="2" width="1.1" height="2.2" fill="#7a5a3a"/></g>' +
      /* windmill */
      '<g transform="translate(88,-3)"><path d="M -0.4,7 L 0,0 L 0.4,7" fill="none" stroke="#e8e2d2" stroke-width=".35"/>' +
      '<g stroke="#e8e2d2" stroke-width=".3">' + [0, 45, 90, 135, 180, 225, 270, 315].map((a) => '<line x1="0" y1="0" x2="' + f(Math.cos(a * Math.PI / 180) * 2) + '" y2="' + f(Math.sin(a * Math.PI / 180) * 2) + '"/>').join('') + '</g></g>' +
      corn + stalks,
  };
};

BACK.ivy = (c) => {
  const sky = skyRect(c, '#6fb4e6', '#d4ebf8');
  const bricks = ['#8a3b2a', '#9c4a34', '#7a3324', '#a55a3e'];
  let roofs = '';
  const R = rng(5);
  /* apartment rooftops beyond the bleachers, each with its own little deck */
  const blocks = [[0, 13, 6], [13, 12, 7.5], [26, 11, 5.8], [63, 12, 6.6], [76, 11, 8], [88, 12, 6.4]];
  for (const [x, w, h] of blocks) {
    const base = c.wy(x + w / 2) - 3.6, top = base - h;
    roofs += '<rect x="' + x + '" y="' + f(top) + '" width="' + w + '" height="' + f(h + 4) + '" fill="' + bricks[Math.floor(R() * bricks.length)] + '"/>';
    for (let wx = x + 1; wx < x + w - 1; wx += 2.2) for (let wy = top + 1.6; wy < base - 0.5; wy += 1.8)
      roofs += '<rect x="' + f(wx) + '" y="' + f(wy) + '" width="1" height=".9" fill="rgba(30,30,40,.55)"/>';
    /* rooftop bleacher deck with a crowd */
    roofs += '<path d="M ' + x + ',' + f(top) + ' l ' + f(w * 0.2) + ',-1.6 l ' + f(w * 0.6) + ',0 l ' + f(w * 0.2) + ',1.6 Z" fill="#5d6a74"/>' +
      '<rect x="' + f(x + w * 0.22) + '" y="' + f(top - 2.3) + '" width="' + f(w * 0.56) + '" height=".8" fill="' + c.url('crowd') + '"/>';
  }
  /* the hand-turned scoreboard in center, with a clock on top */
  const sbw = 22, sbx = 50 - sbw / 2, sby = -7.4;
  let cells = '';
  for (let r = 0; r < 3; r++) for (let k = 0; k < 10; k++)
    cells += '<rect x="' + f(sbx + 1 + k * 2) + '" y="' + f(sby + 2.1 + r * 1.7) + '" width="1.5" height="1.2" fill="' + (R() < 0.55 ? '#f4f1e8' : '#0e2e1c') + '"/>';
  return {
    defs: sky.defs + crowdPattern(c.id('crowd'), SHIRTS, 17, { rows: 1, dy: 0.8, r: 0.28, rule: false }) +
      crowdPattern(c.id('bl'), SHIRTS, 23) +
      '<pattern id="' + c.id('ivy') + '" width="3" height="2" patternUnits="userSpaceOnUse"><rect width="3" height="2" fill="#2d5e27"/>' +
      '<circle cx=".6" cy=".5" r=".55" fill="#3f7a32"/><circle cx="1.9" cy="1.2" r=".6" fill="#224c1f"/><circle cx="2.6" cy=".3" r=".4" fill="#4b8a3a"/><circle cx="1" cy="1.6" r=".45" fill="#356c2c"/></pattern>',
    art: sky.art + cloud(18, -7.2, 1, 0.9) + cloud(80, -8.3, 0.8, 0.8) + roofs +
      /* open bleachers wrapping the outfield, sun on the crowd */
      stand(c, 0, 100, 4.2, '#6b7076', c.url('bl')) +
      /* the scoreboard */
      '<rect x="' + f(sbx) + '" y="' + f(sby) + '" width="' + sbw + '" height="7.6" fill="#1f4d2e" stroke="#15361f" stroke-width=".3"/>' +
      '<rect x="' + f(sbx + 1) + '" y="' + f(sby + 0.5) + '" width="' + (sbw - 2) + '" height="1.1" fill="#15361f"/>' + cells +
      '<rect x="48.4" y="' + f(sby - 3) + '" width="3.2" height="3" fill="#1f4d2e"/><circle cx="50" cy="' + f(sby - 1.5) + '" r="1.1" fill="#f4f1e8"/>' +
      '<path d="M 50,' + f(sby - 1.5) + ' l 0,-.7 M 50,' + f(sby - 1.5) + ' l .5,.2" stroke="#1f2a22" stroke-width=".18"/>' +
      '<line x1="50" y1="' + f(sby - 3) + '" x2="50" y2="' + f(sby - 6.5) + '" stroke="#ddd" stroke-width=".15"/>' +
      '<path d="M 50,' + f(sby - 6.5) + ' l 2.2,.5 l -2.2,.5 Z" fill="#c9483a"/>',
  };
};
/* Ivy Corner's wall IS the ivy. */
const IVY_WALL = (c) => '<path d="' + c.wallPath + '" fill="' + c.url('ivy') + '"/>' +
  '<path d="' + c.wallTopPath + '" fill="none" stroke="#7a3a2a" stroke-width=".55"/>';

BACK.warehouse = (c) => {
  const sky = skyRect(c, '#8fbde3', '#f2d6ae');
  const R = rng(9); let city = '';
  const towers = [[36, 4, 13], [41, 3, 9], [45, 5, 15], [51, 3, 11], [55, 4.5, 17], [60, 3.5, 12]];
  for (const [x, w, h] of towers) {
    const base = 4;
    city += '<rect x="' + x + '" y="' + f(base - h) + '" width="' + w + '" height="' + (h + 4) + '" fill="#6b7f95"/>';
    for (let wy = base - h + 1; wy < base; wy += 1.6) city += '<rect x="' + f(x + 0.6) + '" y="' + f(wy) + '" width="' + f(w - 1.2) + '" height=".35" fill="rgba(255,236,190,.35)"/>';
  }
  /* the warehouse: long, brick, a hundred windows, down the right field line */
  const wx0 = 60, wx1 = 100, top = -6.5;
  let wh = '<polygon points="' + wx0 + ',' + f(c.wy(wx0) - 3) + ' ' + wx0 + ',' + f(top + 1) + ' ' + wx1 + ',' + f(top - 1.5) + ' ' + wx1 + ',' + f(c.wy(wx1)) + '" fill="#8e412c"/>';
  for (let x = wx0 + 1; x < wx1 - 0.8; x += 1.6) {
    const t = (x - wx0) / (wx1 - wx0), ytop = top + 1 + (top - 1.5 - top - 1) * t;
    for (let y = ytop + 1.2; y < c.wy(x) - 3.4; y += 2.1) wh += '<rect x="' + f(x) + '" y="' + f(y) + '" width=".8" height="1.2" rx=".35" fill="' + (R() < 0.15 ? '#f3d58a' : '#3a2620') + '"/>';
  }
  wh += '<line x1="' + wx0 + '" y1="' + f(top + 1) + '" x2="' + wx1 + '" y2="' + f(top - 1.5) + '" stroke="#5e2a1c" stroke-width=".7"/>';
  return {
    defs: sky.defs + crowdPattern(c.id('crowd'), ['#2f5d45', '#f2ece0', '#c9483a', '#e0a94a', '#3d5f94'], 31),
    art: sky.art + cloud(20, -8, 0.9, 0.8) + city + wh +
      stand(c, 0, 62, 7.5, '#264a39', c.url('crowd'), '#e8e1cf') +
      /* flags on the warehouse roof */
      [70, 80, 90].map((x, i) => '<line x1="' + x + '" y1="' + f(top - 0.6 - i * 0.6) + '" x2="' + x + '" y2="' + f(top - 4 - i * 0.6) + '" stroke="#ddd" stroke-width=".15"/>' +
        '<rect x="' + x + '" y="' + f(top - 4 - i * 0.6) + '" width="2" height="1.2" fill="' + ['#c9483a', '#f2ece0', '#e07b39'][i] + '"/>').join(''),
  };
};

BACK.ravine = (c) => {
  const sky = skyRect(c, '#4b3f86', '#f4a08e');
  const palm = (x, y, s) => '<g transform="translate(' + x + ',' + y + ') scale(' + s + ')"><path d="M 0,0 Q .6,-4 .2,-8" fill="none" stroke="#2a1f35" stroke-width=".45"/>' +
    [[-3, -7.4], [3, -7.6], [-2.4, -9.6], [2.6, -9.4], [0, -10.4]].map(([dx, dy]) => '<path d="M .2,-8 Q ' + f(dx / 2) + ',' + f(dy - 1.4) + ' ' + dx + ',' + dy + '" fill="none" stroke="#2a1f35" stroke-width=".5"/>').join('') + '</g>';
  /* the zigzag pavilion roof, white, over each outfield corner */
  const zig = (x0, x1) => { let d = 'M ' + x0 + ',' + f(c.wy(x0) - 5); for (let x = x0, k = 0; x <= x1; x += 2, k++) d += ' L ' + f(x) + ',' + f(c.wy(x) - 5 - (k % 2 ? 1.1 : 0)); return '<path d="' + d + '" fill="none" stroke="#f7f3ea" stroke-width=".6"/>'; };
  const seats = ['#f2d27a', '#e98b6c', '#6fb1d9', '#b8d59a'];
  return {
    defs: sky.defs + crowdPattern(c.id('crowd'), seats.concat(['#f7f5ef', '#2a3a5a']), 41),
    art: sky.art + '<circle cx="30" cy="-4" r="2.2" fill="rgba(255,226,190,.8)"/>' +
      /* two ridges of hills, far then near */
      '<path d="M 0,-1 Q 15,-7 30,-2 Q 45,-6 60,-1.5 Q 78,-8 100,-2 L 100,12 L 0,12 Z" fill="#6b5f7c"/>' +
      '<path d="M 0,2 Q 20,-3 38,2 Q 55,-2 72,2.5 Q 86,-1 100,1.5 L 100,12 L 0,12 Z" fill="#4f6a4a"/>' +
      palm(34, 3.2, 0.55) + palm(40, 3.8, 0.45) + palm(62, 3.6, 0.5) + palm(67, 3.2, 0.58) +
      stand(c, 0, 26, 5, '#2a3a5a', c.url('crowd')) + stand(c, 74, 100, 5, '#2a3a5a', c.url('crowd')) +
      zig(0, 26) + zig(74, 100),
  };
};

BACK.fountains = (c) => {
  const sky = skyRect(c, '#3b5c9e', '#f6a55a');
  let jets = '';
  for (let i = 0; i < 9; i++) {
    const x = 20 + i * 7.5, base = c.wy(x) - 0.6, h = 5 + (i % 3) * 1.8;
    jets += '<path d="M ' + f(x - 0.7) + ',' + f(base) + ' Q ' + f(x) + ',' + f(base - h * 1.6) + ' ' + f(x + 0.7) + ',' + f(base) + '" fill="' + c.url('jet') + '"/>' +
      '<ellipse cx="' + f(x) + '" cy="' + f(base - h * 0.8) + '" rx="1.3" ry="' + f(h * 0.25) + '" fill="rgba(255,255,255,.18)"/>';
  }
  /* the crown on top of the scoreboard */
  const crown = 'M 44,-6 L 45.5,-9 L 47.5,-6.6 L 50,-10 L 52.5,-6.6 L 54.5,-9 L 56,-6 Z';
  return {
    defs: sky.defs + crowdPattern(c.id('crowd'), ['#3d6fb4', '#f2ece0', '#d9a93a', '#2a3a5a', '#c9483a'], 53) +
      '<linearGradient id="' + c.id('jet') + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(255,255,255,.95)"/><stop offset="1" stop-color="rgba(160,215,255,.5)"/></linearGradient>',
    art: sky.art + cloud(22, -8, 0.9, 0.55) + cloud(78, -7, 1, 0.5) +
      /* the pool along the fence */
      stand(c, 16, 84, 1.4, '#3a8fc9') + jets +
      stand(c, 0, 18, 6.5, '#2e5a93', c.url('crowd')) + stand(c, 82, 100, 6.5, '#2e5a93', c.url('crowd')) +
      '<rect x="44.5" y="-6" width="11" height="8" rx=".6" fill="#1b2a44" stroke="#d9a93a" stroke-width=".35"/>' +
      '<rect x="45.5" y="-5" width="9" height="4" fill="#0f1a2e"/><rect x="46" y="-4.4" width="3" height="1" fill="#f6a55a"/><rect x="50" y="-4.4" width="4" height="1" fill="#6fb1d9"/>' +
      '<rect x="46" y="-2.8" width="8" height=".6" fill="rgba(255,255,255,.4)"/>' +
      '<path d="' + crown + '" fill="#e6b93f" stroke="#a87e1c" stroke-width=".25"/>',
  };
};

BACK.bayside = (c) => {
  const sky = skyRect(c, '#88a9c8', '#f2c7a2');
  let waves = '';
  for (let y = 1; y < 9; y += 1.3) for (let x = 55 + (y % 2) * 2; x < 100; x += 5) waves += '<path d="M ' + f(x) + ',' + f(y) + ' q 1,-.4 2,0" fill="none" stroke="rgba(255,255,255,.4)" stroke-width=".18"/>';
  const boat = (x, y, s) => '<g transform="translate(' + x + ',' + y + ') scale(' + s + ')"><path d="M -1.4,0 L 1.4,0 L 1,.6 L -1,.6 Z" fill="#f2ece0"/><path d="M 0,0 L 0,-3 L 1.4,-.2 Z" fill="#f7f5ef"/><path d="M -.1,-.2 L -.1,-2.4 L -1.1,-.2 Z" fill="#e07b39"/></g>';
  /* the bridge: two towers and the cables sagging between them */
  const bridge = '<g stroke="#9aa3ad" fill="none"><path d="M 58,-1 Q 70,3 82,-1 Q 90,2 100,0" stroke-width=".25"/>' +
    '<line x1="58" y1="-4.5" x2="58" y2="2.2" stroke-width=".6"/><line x1="82" y1="-4.5" x2="82" y2="2.2" stroke-width=".6"/>' +
    '<path d="M 48,2.2 L 100,2.2" stroke-width=".4"/></g>';
  return {
    defs: sky.defs + crowdPattern(c.id('crowd'), ['#1f2a36', '#f2ece0', '#e07b39', '#c9483a', '#3d5f94'], 61) +
      '<linearGradient id="' + c.id('bay') + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5f86a8"/><stop offset="1" stop-color="#2f5a7e"/></linearGradient>',
    art: sky.art + cloud(30, -8, 1.3, 0.5) + cloud(55, -6.5, 1.1, 0.4) +
      '<path d="M 40,0.5 Q 60,-1.5 100,-0.5 L 100,14 L 40,14 Z" fill="#7c93a6"/>' + bridge +
      '<rect x="45" y="1.5" width="55" height="14" fill="' + c.url('bay') + '"/>' + waves +
      boat(66, 5.2, 0.8) + boat(80, 6.4, 0.9) + boat(92, 4.2, 0.6) +
      stand(c, 0, 50, 7, '#1f2a36', c.url('crowd')) +
      /* the brick arcade along the water in right */
      stand(c, 82, 100, 2.6, '#8b3a2a') +
      [84, 87.5, 91, 94.5, 98].map((x) => '<path d="M ' + x + ',' + f(c.wy(x) + 0.2) + ' l 0,-1.4 a .9,.9 0 0 1 1.8,0 l 0,1.4 Z" fill="#2f5a7e"/>').join('') +
      /* the giant old glove in left */
      '<g transform="translate(12,-4.2) rotate(-12)"><path d="M -3.2,3 Q -4,-1 -2.6,-3 Q -2,-4 -1.2,-2.4 L -.8,-4.6 Q 0,-5.4 .6,-4.4 L .8,-2.2 L 1.6,-4 Q 2.4,-4.6 2.8,-3.6 L 2.6,-1 Q 3.8,-1.8 4,-.6 Q 3.6,2 2.2,3.4 Z" fill="#a8683a" stroke="#6a3f22" stroke-width=".25"/>' +
      '<path d="M -1.6,1 Q .4,-.4 2,1" fill="none" stroke="#6a3f22" stroke-width=".2"/></g>',
  };
};

BACK.milehigh = (c) => {
  const sky = skyRect(c, '#3a79cf', '#c7e3f6');
  const peaks = 'M 0,4 L 8,-3.5 L 13,0 L 22,-8 L 30,-1 L 38,-5.5 L 46,0.5 L 56,-7 L 64,-1.5 L 74,-9 L 84,-2 L 92,-5 L 100,-1 L 100,12 L 0,12 Z';
  const snow = [[22, -8, 3], [56, -7, 2.6], [74, -9, 3.2], [38, -5.5, 2], [92, -5, 2]].map(([x, y, w]) =>
    '<path d="M ' + f(x - w) + ',' + f(y + w * 0.95) + ' L ' + x + ',' + y + ' L ' + f(x + w) + ',' + f(y + w * 0.9) + ' L ' + f(x + w * 0.4) + ',' + f(y + w * 0.6) + ' L ' + f(x) + ',' + f(y + w * 0.95) + ' L ' + f(x - w * 0.4) + ',' + f(y + w * 0.6) + ' Z" fill="#f4f7fb"/>').join('');
  let pines = '';
  const R = rng(71);
  for (let i = 0; i < 22; i++) {
    const x = 36 + i * 1.3 + R() * 0.6, b = c.wy(x) + 0.2, h = 3 + R() * 2.4;
    pines += '<path d="M ' + f(x - 0.9) + ',' + f(b) + ' L ' + f(x) + ',' + f(b - h) + ' L ' + f(x + 0.9) + ',' + f(b) + ' Z" fill="' + (R() < 0.5 ? '#1f4a2e' : '#2b5c38') + '"/>';
  }
  return {
    defs: sky.defs + crowdPattern(c.id('crowd'), ['#6b3fa0', '#f2ece0', '#1f2a36', '#c9483a', '#9a9aa2'], 83),
    art: sky.art + '<path d="' + peaks + '" fill="#6f7f9a"/>' + snow +
      '<path d="M 0,3.5 Q 25,0 50,3 Q 75,0.5 100,3 L 100,12 L 0,12 Z" fill="#4c6b4f"/>' +
      stand(c, 0, 36, 6.2, '#2a2f3a', c.url('crowd')) + stand(c, 64, 100, 6.2, '#2a2f3a', c.url('crowd')) +
      /* the one purple row, a mile up */
      strip(c, 0, 36, 3.2, 3.9, '#6b3fa0') + strip(c, 64, 100, 3.2, 3.9, '#6b3fa0') +
      pines,
  };
};

BACK.frieze = (c) => {
  const sky = skyRect(c, '#070f24', '#1b2b56');
  let frieze = '';
  for (let x = 0; x < 100; x += 2) if (x < 34 || x >= 66) frieze += '<path d="M ' + x + ',' + f(-c.sky + 3.2) + ' q 1,1.8 2,0" fill="none" stroke="#eef0f4" stroke-width=".45"/>';
  let flashes = '';
  const R = rng(97);
  for (let i = 0; i < 40; i++) flashes += '<circle cx="' + f(R() * 100) + '" cy="' + f(-c.sky + 4 + R() * 12) + '" r=".16" fill="#fff"/>';
  /* the gap in center, and the elevated train beyond it */
  const train = '<rect x="36" y="-2.5" width="28" height=".6" fill="#3a4050"/>' +
    [37, 43, 49, 55].map((x) => '<rect x="' + x + '" y="-4.4" width="5.4" height="1.9" rx=".3" fill="#b8bec8"/>' +
      '<rect x="' + f(x + 0.5) + '" y="-4" width="4.4" height=".6" fill="#f3d58a"/>').join('') +
    [38, 46, 54, 62].map((x) => '<line x1="' + x + '" y1="-1.9" x2="' + x + '" y2="4" stroke="#3a4050" stroke-width=".4"/>').join('');
  return {
    defs: sky.defs + crowdPattern(c.id('crowd'), ['#1c2a4a', '#f2ece0', '#9aa3ad', '#c9483a', '#3d5f94'], 101, { dy: 0.85 }),
    art: sky.art + stars(c, 30, 3) +
      '<rect x="30" y="-4" width="40" height="10" fill="#27314a"/>' +
      [32, 36, 60, 64, 67].map((x, i) => '<rect x="' + x + '" y="' + (-1 - i % 3) + '" width="2.6" height="8" fill="#303b57"/>').join('') + train +
      /* three decks wrapping both lines, the frieze along the roof */
      stand(c, 0, 34, 16, '#16213c', c.url('crowd')) + stand(c, 66, 100, 16, '#16213c', c.url('crowd')) +
      '<rect x="0" y="' + -c.sky + '" width="34" height="3" fill="#10182c"/><rect x="66" y="' + -c.sky + '" width="34" height="3" fill="#10182c"/>' +
      [0, 66].map((x) => '<rect x="' + x + '" y="' + f(-c.sky + 6.6) + '" width="34" height=".5" fill="#0c1222"/><rect x="' + x + '" y="' + f(-c.sky + 11) + '" width="34" height=".5" fill="#0c1222"/>').join('') +
      frieze +
      flashes + lightBank(c, 14, -c.sky + 1.4, 12) + lightBank(c, 86, -c.sky + 1.4, 12),
  };
};

BACK.monster = (c) => {
  const sky = skyRect(c, '#7cb7e2', '#d8ecf7');
  const R = rng(113); let city = '';
  for (let x = 0; x < 100; x += 4 + R() * 3) {
    const w = 3 + R() * 4, h = 6 + R() * 8;
    city += '<rect x="' + f(x) + '" y="' + f(3 - h) + '" width="' + f(w) + '" height="' + f(h + 6) + '" fill="' + (R() < 0.5 ? '#9a5a44' : '#8a6a58') + '"/>';
    for (let wy = 3 - h + 1; wy < 3; wy += 1.5) city += '<rect x="' + f(x + 0.5) + '" y="' + f(wy) + '" width="' + f(w - 1) + '" height=".35" fill="rgba(40,30,30,.35)"/>';
  }
  /* the big sign on a rooftop lattice behind left: a diamond, lit */
  const sign = '<g transform="translate(22,-7)"><path d="M -2,6 L -1,1.5 M 2,6 L 1,1.5 M -1.6,4 L 1.6,4" stroke="#6a6f78" stroke-width=".25"/>' +
    '<rect x="-3.4" y="-2.2" width="6.8" height="4.4" rx=".3" fill="#f7f5ef" stroke="#b9182b" stroke-width=".3"/>' +
    '<path d="M 0,-1.6 L 1.6,0 L 0,1.6 L -1.6,0 Z" fill="#b9182b"/><path d="M 0,-.8 L .8,0 L 0,.8 L -.8,0 Z" fill="#3d5f94"/></g>';
  return {
    defs: sky.defs + crowdPattern(c.id('crowd'), SHIRTS, 127),
    art: sky.art + cloud(60, -8, 1.1, 0.8) + city + sign +
      stand(c, 36, 100, 6, '#27313d', c.url('crowd'), '#1a2029'),
  };
};
/* The Monster's wall climbs out of the standard one in left, with the hand-slotted
   scoreboard on it and seats along its top. */
const MONSTER_FRONT = (c) => {
  const x1 = 38, top = -2.2;
  const pts = []; for (let i = 0; i <= 12; i++) { const x = x1 * i / 12; pts.push(f(x) + ',' + f(c.wy(x) + 0.2)); }
  pts.push(f(x1) + ',' + f(top + 1.6), '0,' + f(top));
  let slots = '';
  for (let r = 0; r < 2; r++) for (let k = 0; k < 9; k++) slots += '<rect x="' + f(6 + k * 2.2) + '" y="' + f(top + 3 + r * 1.6) + '" width="1.5" height="1.1" fill="' + ((k + r) % 3 ? '#f4f1e8' : '#0e2e1c') + '"/>';
  return '<polygon points="' + pts.join(' ') + '" fill="#1f5a3a"/>' +
    '<polygon points="' + pts.join(' ') + '" fill="' + c.url('pads') + '" opacity=".6"/>' +
    '<rect x="5" y="' + f(top + 2.2) + '" width="21" height="4.4" fill="#174a2f"/>' + slots +
    /* the ladder up its face */
    '<g stroke="#e9eee8" stroke-width=".15">' + [0, 1, 2, 3, 4, 5, 6].map((k) => '<line x1="30" y1="' + f(top + 2 + k * 0.9) + '" x2="30.8" y2="' + f(top + 2 + k * 0.9) + '"/>').join('') +
    '<line x1="30" y1="' + f(top + 2) + '" x2="30" y2="' + f(c.wy(30)) + '"/><line x1="30.8" y1="' + f(top + 2) + '" x2="30.8" y2="' + f(c.wy(30.8)) + '"/></g>' +
    /* seats on top of it */
    '<polygon points="0,' + f(top) + ' ' + x1 + ',' + f(top + 1.6) + ' ' + x1 + ',' + f(top - 1.4) + ' 0,' + f(top - 3) + '" fill="#2a2f3a"/>' +
    '<polygon points="0,' + f(top) + ' ' + x1 + ',' + f(top + 1.6) + ' ' + x1 + ',' + f(top - 1.4) + ' 0,' + f(top - 3) + '" fill="' + c.url('crowd') + '"/>' +
    '<line x1="0" y1="' + f(top) + '" x2="' + x1 + '" y2="' + f(top + 1.6) + '" stroke="#e8c820" stroke-width=".35"/>';
};

BACK.horseshoe = (c) => {
  const sky = skyRect(c, '#cdb98f', '#ece0c2');
  /* two decks with posts, green paint gone olive, a crowd in hats and dark coats */
  let posts = '';
  for (let x = 1; x < 100; x += 3.2) posts += '<line x1="' + f(x) + '" y1="' + f(c.wy(x) - 5.6) + '" x2="' + f(x) + '" y2="' + f(c.wy(x) - 0.5) + '" stroke="#3f4a2c" stroke-width=".3"/>';
  return {
    defs: sky.defs + crowdPattern(c.id('crowd'), ['#3a3226', '#5a4a36', '#e8dcc0', '#7a6a4e', '#2a241c'], 139),
    art: sky.art +
      '<path d="M 0,-2 Q 50,-6 100,-2 L 100,12 L 0,12 Z" fill="#b9a67c"/>' +
      stand(c, 0, 100, 14, '#4c5534', c.url('crowd'), '#353d24') +
      '<path d="M 0,' + f(c.wy(0) - 7.6) + ' Q 50,' + f(2 * c.wy(50) - c.wy(0) - 7.6) + ' 100,' + f(c.wy(100) - 7.6) + '" fill="none" stroke="#353d24" stroke-width=".8"/>' +
      posts +
      /* the clubhouse in deep center, and its flags */
      '<rect x="42" y="' + f(c.wy(50) - 7) + '" width="16" height="7.4" fill="#8a7a5a"/>' +
      [44, 47, 50, 53, 56].map((x) => '<rect x="' + x + '" y="' + f(c.wy(50) - 5.6) + '" width="1.4" height="1.6" fill="#3a3226"/>').join('') +
      '<path d="M 41,' + f(c.wy(50) - 7) + ' L 50,' + f(c.wy(50) - 9.4) + ' L 59,' + f(c.wy(50) - 7) + ' Z" fill="#6a5a40"/>' +
      [46, 54].map((x) => '<line x1="' + x + '" y1="' + f(c.wy(50) - 8.4) + '" x2="' + x + '" y2="' + f(c.wy(50) - 12) + '" stroke="#3a3226" stroke-width=".15"/><rect x="' + x + '" y="' + f(c.wy(50) - 12) + '" width="1.8" height="1" fill="#8a3a2a"/>').join(''),
  };
};

BACK.dome = (c) => {
  let ribs = '';
  for (let x = -40; x <= 140; x += 8) ribs += '<path d="M 50,' + f(-c.sky - 30) + ' Q ' + f(50 + (x - 50) * 0.4) + ',' + f(-c.sky) + ' ' + f(x) + ',12" fill="none" stroke="rgba(210,220,235,.35)" stroke-width=".25"/>';
  for (let y = -c.sky + 1.5; y < 8; y += 2.5) ribs += '<path d="M 0,' + f(y + 3) + ' Q 50,' + f(y - 4) + ' 100,' + f(y + 3) + '" fill="none" stroke="rgba(210,220,235,.25)" stroke-width=".2"/>';
  /* the long scoreboard across center, lit in bands of colour */
  const bars = ['#e5484d', '#f59e0b', '#fde047', '#4ade80', '#38bdf8', '#a78bfa'];
  let board = '<rect x="24" y="-7.5" width="52" height="7" rx=".4" fill="#101521" stroke="#3a4152" stroke-width=".3"/>';
  bars.forEach((col, i) => { board += '<rect x="' + f(25 + i * 8.4) + '" y="-6.6" width="7.4" height="2" fill="' + col + '"/>'; });
  for (let k = 0; k < 24; k++) board += '<circle cx="' + f(26 + k * 2.1) + '" cy="-2.6" r=".45" fill="' + bars[k % bars.length] + '" opacity=".85"/>';
  return {
    defs: '<linearGradient id="' + c.id('roof') + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b2130"/><stop offset="1" stop-color="#3b4458"/></linearGradient>' +
      crowdPattern(c.id('crowd'), ['#e0643a', '#f2ece0', '#c9483a', '#f59e0b', '#3d5f94'], 151),
    art: '<rect x="0" y="' + -c.sky + '" width="100" height="30" fill="' + c.url('roof') + '"/>' + ribs +
      [15, 35, 65, 85].map((x) => '<ellipse cx="' + x + '" cy="' + f(-c.sky + 1) + '" rx="3" ry=".6" fill="rgba(255,250,225,.8)"/>').join('') +
      stand(c, 0, 100, 5.5, '#b84a2a', c.url('crowd')) + board,
  };
};

BACK.neon = (c) => {
  const sky = skyRect(c, '#150a2c', '#4a1660');
  const R = rng(163); let city = '';
  for (let x = 0; x < 100; x += 3 + R() * 3) {
    const w = 2 + R() * 3.5, h = 5 + R() * 11, col = R() < 0.5 ? '#ff4fa3' : '#2de2d6';
    city += '<rect x="' + f(x) + '" y="' + f(2 - h) + '" width="' + f(w) + '" height="' + f(h + 6) + '" fill="#1c1236" stroke="' + col + '" stroke-width=".18"/>';
    for (let wy = 2 - h + 1; wy < 2; wy += 1.4) if (R() < 0.5) city += '<rect x="' + f(x + 0.5) + '" y="' + f(wy) + '" width=".6" height=".5" fill="' + col + '" opacity=".7"/>';
  }
  const palm = (x, y) => '<g transform="translate(' + x + ',' + y + ') scale(.5)"><path d="M 0,0 Q .6,-4 .2,-8" fill="none" stroke="#0c0618" stroke-width=".6"/>' +
    [[-3, -7.4], [3, -7.6], [-2.4, -9.6], [2.6, -9.4]].map(([dx, dy]) => '<path d="M .2,-8 Q ' + f(dx / 2) + ',' + f(dy - 1.4) + ' ' + dx + ',' + dy + '" fill="none" stroke="#0c0618" stroke-width=".6"/>').join('') + '</g>';
  /* the home run sculpture in center: arcs, a sun and a leaping fish, lit */
  const sculpt = '<g transform="translate(50,' + f(c.wy(50) - 0.2) + ')">' +
    '<path d="M -6,0 Q -6,-6 0,-7 Q 6,-6 6,0" fill="none" stroke="#2de2d6" stroke-width=".7"/>' +
    '<path d="M -4,0 Q -4,-4 0,-4.8 Q 4,-4 4,0" fill="none" stroke="#ff4fa3" stroke-width=".7"/>' +
    '<circle cx="0" cy="-7.8" r="1.6" fill="#ffb347"/>' +
    '<path d="M -2.6,-2.2 Q 0,-4.4 2.4,-2 L 3.4,-3 L 3.2,-1.3 Q 0,-.4 -2.6,-2.2 Z" fill="#2de2d6"/></g>';
  return {
    defs: sky.defs + crowdPattern(c.id('crowd'), ['#2de2d6', '#ff4fa3', '#f2ece0', '#ffb347', '#1c1236'], 173) +
      '<radialGradient id="' + c.id('glow') + '"><stop offset="0" stop-color="rgba(255,79,163,.45)"/><stop offset="1" stop-color="rgba(255,79,163,0)"/></radialGradient>',
    art: sky.art + stars(c, 24, 9) + city + '<ellipse cx="50" cy="0" rx="18" ry="8" fill="' + c.url('glow') + '"/>' +
      '<rect x="0" y="0" width="100" height="14" fill="rgba(20,40,80,.55)"/>' +
      palm(8, 2.5) + palm(92, 2.5) +
      stand(c, 0, 34, 6, '#0f5c63', c.url('crowd')) + stand(c, 66, 100, 6, '#0f5c63', c.url('crowd')) + sculpt,
  };
};

/* Each park's field palette, over BASE. */
const LOOK = {
  home: {},
  cornfield: { grass: ['#6aa84a', '#5a9a3c', '#4a8a31'], foul: '#4f8a34', mow: 'bands', dirt: ['#c9a06a', '#a98252'],
    wall: ['#e9e3d3', '#cfc6b0'], wallLine: '#f7f5ef', pads: false, pole: '#f7f5ef', wallTop: [12.3, 6.1], wallH: 1.4 },
  ivy: { wallTop: [10.4, 4.0], wallH: 6.6, wallArt: IVY_WALL, pads: false, wallLine: '#7a3a2a' },
  warehouse: { grass: ['#52a23e', '#43923a', '#357e2c'], mow: 'bands', wall: ['#1f4a33', '#14331f'] },
  ravine: { dirt: ['#c99a6a', '#a87a4e'], wall: ['#1f4f8f', '#163a6b'], mow: 'bands' },
  fountains: { wall: ['#1f4f8f', '#163a6b'], grass: ['#55a843', '#45963a', '#377e2c'] },
  bayside: { wall: ['#1f3a2e', '#142a20'], dirt: ['#caa57a', '#a98556'] },
  milehigh: { wall: ['#233148', '#172234'], mow: 'bands', grass: ['#4fa43e', '#419534', '#337c2a'] },
  frieze: { wall: ['#1c2a4a', '#121c33'], night: true, grass: ['#3f9a38', '#338a30', '#2a7427'] },
  monster: { front: MONSTER_FRONT, wall: ['#1f5a3a', '#16442b'] },
  horseshoe: { grass: ['#8fa55a', '#7d9448', '#6a8038'], foul: '#6a7e3c', dirt: ['#cdb488', '#aa9064'], mound: ['#d6bf92', '#a88f64'],
    track: '#9a8666', wall: ['#4c5534', '#353d24'], wallLine: '#e8dcc0', pole: '#e8dcc0', mow: 'none', pads: false },
  dome: { grass: ['#3cae4c', '#35a044', '#2e9140'], foul: '#2e9140', mow: 'none', skin: false,
    dirt: ['#c0704a', '#9c5636'], mound: ['#c77a52', '#9c5636'], track: '#2a7a38', wall: ['#1f4f8f', '#163a6b'] },
  neon: { wall: ['#0f6e70', '#0a4f51'], wallLine: '#ff4fa3', pole: '#2de2d6', night: true, grass: ['#3a9a3c', '#308a32', '#277428'] },
};

/* ─── the field, for a park ─── */
function markings(parkId, sfx, sky) {
  const park = BY_ID[parkId] ? parkId : 'home';
  const P = Object.assign({}, BASE, LOOK[park] || {});
  sfx = (sfx || 'f') + '-' + park;
  sky = sky == null ? 0 : sky;
  const id = (n) => n + '-' + sfx, url = (n) => 'url(#' + n + '-' + sfx + ')';
  const wh = 'rgba(255,255,255,';
  const fpL = 3, fpR = 97, hx = 50, hy = 62.6, bY = 38.8, bL = 27.15, bR = 72.85, tY = 19, mY = 40.2;
  /* A LOWER CAMERA. The ground is drawn in its own flat coordinates and then
     squashed toward home plate by GROUND_K, anchored with the plate at GROUND_A:
     the diamond comes out wider than it is tall, the outfield shallower, and the
     room that frees at the top goes to a taller wall. Everything on the grass is
     inside that one transform; the wall, the poles and the backdrop are drawn in
     screen coordinates around it. The chips in the page's DIAMOND_SPOTS are the
     same projection, worked out by hand, which check-parks holds together. */
  const ground = 'translate(0,' + GROUND_A + ') scale(1,' + GROUND_K + ') translate(0,' + -hy + ')';
  const gy = (y) => GROUND_A - (hy - y) * GROUND_K;
  const y0b = gy(13.6), apb = gy(7.2);              // the foot of the wall, on screen
  const H = P.wallH == null ? WALL_H : P.wallH;     // how tall the wall face stands
  const y0t = y0b - H, apt = apb - H;               // its top
  const wallBot = curve(y0b, apb), wallTop = curve(y0t, apt), trackIn = curve(15.9, 9.6);
  const wallPath = wallBot + ' L 100,' + y0t + ' Q 50,' + (2 * apt - y0t) + ' 0,' + y0t + ' Z';
  const fair = 'M ' + hx + ',' + hy + ' L 0,10.47 L 0,' + (-sky - 40) + ' L 100,' + (-sky - 40) + ' L 100,10.47 Z';
  const above = wallTop + ' L 100,' + -sky + ' L 0,' + -sky + ' Z';
  /* The backdrops were authored against the old wall top, so they are shifted
     down by how far the top moved, and told where the wall is in their own
     terms. Whatever a backdrop leaves uncovered at the very top is its sky. */
  const [wt0, wtA] = P.wallTop;
  const shift = apt - wtA;
  const c = { id, url, sky, P, wallPath, wallTopPath: wallTop, wy: (x) => curveY(x, y0t, apt) - shift };
  const back = (BACK[park] || BACK.home)(c);
  const infield = 'M 50,57.4 L 68.3,' + bY + ' L 50,23.4 L 31.7,' + bY + ' Z';
  const mow = P.mow === 'diag'
    ? '<rect x="0" y="-60" width="100" height="140" fill="' + url('mowa') + '"/><rect x="0" y="-60" width="100" height="140" fill="' + url('mowb') + '"/>'
    : P.mow === 'bands' ? '<rect x="0" y="-60" width="100" height="140" fill="' + url('bands') + '"/>' : '';
  const chalk = (a) => wh + (a * P.chalk) + ')';
  return '<div class="turf"></div><div class="lit"></div>' +
    '<svg class="diamond-svg" viewBox="0 ' + -sky + ' 100 ' + (68 + sky) + '" preserveAspectRatio="none" data-park="' + park + '">' +
    '<defs>' +
      '<clipPath id="' + id('fair') + '"><path d="' + fair + '"/></clipPath>' +
      '<clipPath id="' + id('above') + '"><path d="' + above + '"/></clipPath>' +
      '<radialGradient id="' + id('grass') + '" cx="50%" cy="45%" r="70%">' +
        '<stop offset="0%" stop-color="' + P.grass[0] + '"/><stop offset="60%" stop-color="' + P.grass[1] + '"/>' +
        '<stop offset="100%" stop-color="' + P.grass[2] + '"/></radialGradient>' +
      '<pattern id="' + id('mowa') + '" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45 50 62.6)">' +
        '<rect width="3.5" height="7" fill="rgba(255,255,255,.055)"/></pattern>' +
      '<pattern id="' + id('mowb') + '" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(-45 50 62.6)">' +
        '<rect width="3.5" height="7" fill="rgba(0,0,0,.045)"/></pattern>' +
      '<pattern id="' + id('bands') + '" width="100" height="6" patternUnits="userSpaceOnUse">' +
        '<rect width="100" height="3" fill="rgba(255,255,255,.06)"/></pattern>' +
      '<radialGradient id="' + id('dirt') + '" cx="50%" cy="45%" r="60%">' +
        '<stop offset="0%" stop-color="' + P.dirt[0] + '"/><stop offset="100%" stop-color="' + P.dirt[1] + '"/></radialGradient>' +
      '<radialGradient id="' + id('mound') + '" cx="50%" cy="40%" r="60%">' +
        '<stop offset="0%" stop-color="' + P.mound[0] + '"/><stop offset="100%" stop-color="' + P.mound[1] + '"/></radialGradient>' +
      '<linearGradient id="' + id('wall') + '" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="' + P.wall[0] + '"/><stop offset="100%" stop-color="' + P.wall[1] + '"/></linearGradient>' +
      '<linearGradient id="' + id('drop') + '" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="rgba(0,0,0,.28)"/><stop offset="100%" stop-color="rgba(0,0,0,0)"/></linearGradient>' +
      '<radialGradient id="' + id('pool') + '" cx="50%" cy="55%" r="65%">' +
        '<stop offset="0%" stop-color="rgba(0,0,0,0)"/><stop offset="100%" stop-color="rgba(0,8,30,.32)"/></radialGradient>' +
      '<pattern id="' + id('pads') + '" width="5" height="68" patternUnits="userSpaceOnUse">' +
        '<line x1="4.8" y1="0" x2="4.8" y2="68" stroke="rgba(0,0,0,.35)" stroke-width="0.22"/></pattern>' +
      (back.defs || '') +
    '</defs>' +
    /* foul territory, then fair grass, mown */
    '<rect x="0" y="' + -sky + '" width="100" height="' + (68 + sky) + '" fill="' + P.foul + '"/>' +
    '<g transform="' + ground + '">' +
    '<rect x="0" y="-60" width="100" height="140" fill="' + P.foul + '"/>' +
    '<g clip-path="' + url('fair') + '">' +
      '<rect x="0" y="-60" width="100" height="140" fill="' + url('grass') + '"/>' + mow +
      '<path d="' + trackIn + ' L 100,-60 L 0,-60 Z" fill="' + P.track + '"/>' +
      '<path d="' + trackIn + '" fill="none" stroke="rgba(0,0,0,.18)" stroke-width="0.25"/>' +
      (P.skin ? '<circle cx="50" cy="' + mY + '" r="23.2" fill="' + url('dirt') + '"/>' +
        '<circle cx="50" cy="' + mY + '" r="23.2" fill="none" stroke="rgba(90,60,25,.35)" stroke-width="0.3"/>' : '') +
    '</g>' +
    (P.skin ? '<path d="' + infield + '" fill="' + url('grass') + '"/>' +
      (P.mow === 'diag' ? '<path d="' + infield + '" fill="' + url('mowa') + '"/>' : '') +
      '<path d="' + infield + '" fill="none" stroke="rgba(60,40,15,.28)" stroke-width="0.25"/>' : '') +
    '<circle cx="' + bL + '" cy="' + bY + '" r="2.6" fill="' + url('dirt') + '"/>' +
    '<circle cx="' + bR + '" cy="' + bY + '" r="2.6" fill="' + url('dirt') + '"/>' +
    '<circle cx="' + hx + '" cy="' + hy + '" r="4.8" fill="' + url('dirt') + '"/>' +
    '<circle cx="50" cy="' + tY + '" r="2.4" fill="' + url('dirt') + '"/>' +
    '<ellipse cx="50" cy="' + (mY + 0.5) + '" rx="3.7" ry="3.5" fill="rgba(0,0,0,.18)"/>' +
    '<circle cx="50" cy="' + mY + '" r="3.4" fill="' + url('mound') + '"/>' +
    '<rect x="49.1" y="' + (mY - 0.35) + '" width="1.8" height=".5" rx=".1" fill="' + wh + '.95)"/>' +
    /* chalk: the foul lines, the boxes at the plate, the on-deck circles */
    '<line x1="' + hx + '" y1="' + hy + '" x2="' + fpL + '" y2="13.6" stroke="' + chalk(0.9) + '" stroke-width="0.42"/>' +
    '<line x1="' + hx + '" y1="' + hy + '" x2="' + fpR + '" y2="13.6" stroke="' + chalk(0.9) + '" stroke-width="0.42"/>' +
    '<rect x="45.7" y="60.6" width="2" height="3.8" fill="none" stroke="' + chalk(0.75) + '" stroke-width="0.28"/>' +
    '<rect x="52.3" y="60.6" width="2" height="3.8" fill="none" stroke="' + chalk(0.75) + '" stroke-width="0.28"/>' +
    '<path d="M 48.3,64.6 L 48.3,67.4 L 51.7,67.4 L 51.7,64.6" fill="none" stroke="' + chalk(0.6) + '" stroke-width="0.25"/>' +
    '<circle cx="23" cy="61" r="1.5" fill="rgba(0,0,0,.14)" stroke="' + chalk(0.55) + '" stroke-width="0.25"/>' +
    '<circle cx="77" cy="61" r="1.5" fill="rgba(0,0,0,.14)" stroke="' + chalk(0.55) + '" stroke-width="0.25"/>' +
    '<g fill="rgba(0,0,0,.22)">' +
      '<rect x="' + (bL - 0.9) + '" y="' + (bY - 0.6) + '" width="1.9" height="1.9" transform="rotate(45 ' + bL + ' ' + (bY + 0.35) + ')"/>' +
      '<rect x="' + (bR - 0.9) + '" y="' + (bY - 0.6) + '" width="1.9" height="1.9" transform="rotate(45 ' + bR + ' ' + (bY + 0.35) + ')"/>' +
      '<rect x="49.1" y="' + (tY - 0.6) + '" width="1.9" height="1.9" transform="rotate(45 50 ' + (tY + 0.35) + ')"/>' +
    '</g>' +
    '<rect x="' + (bL - 0.95) + '" y="' + (bY - 0.95) + '" width="1.9" height="1.9" rx=".15" transform="rotate(45 ' + bL + ' ' + bY + ')" fill="#fbfaf5"/>' +
    '<rect x="' + (bR - 0.95) + '" y="' + (bY - 0.95) + '" width="1.9" height="1.9" rx=".15" transform="rotate(45 ' + bR + ' ' + bY + ')" fill="#fbfaf5"/>' +
    '<rect x="49.05" y="' + (tY - 0.95) + '" width="1.9" height="1.9" rx=".15" transform="rotate(45 50 ' + tY + ')" fill="#fbfaf5"/>' +
    '<path d="M 48.8,61.8 L 51.2,61.8 L 51.2,62.9 L 50,64 L 48.8,62.9 Z" fill="#fbfaf5" stroke="rgba(0,0,0,.2)" stroke-width="0.12"/>' +
    '</g>' +
    (P.night ? '<rect x="0" y="' + -sky + '" width="100" height="' + (68 + sky) + '" fill="' + url('pool') + '"/>' : '') +
    /* everything behind the wall */
    '<g clip-path="' + url('above') + '">' +
      '<rect x="0" y="' + -sky + '" width="100" height="' + (y0b + sky) + '" fill="' + (back.top ||
        (/stop offset="0" stop-color="([^"]+)"/.exec(back.defs || '') || [])[1] || '#1c2330') + '"/>' +
      '<g transform="translate(0,' + f(shift) + ')">' + back.art + '</g></g>' +
    /* the wall */
    (P.wallArt ? P.wallArt(c) :
      '<path d="' + wallPath + '" fill="' + url('wall') + '"/>' + (P.pads ? '<path d="' + wallPath + '" fill="' + url('pads') + '"/>' : '')) +
    '<path d="' + wallTop + '" fill="none" stroke="' + P.wallLine + '" stroke-width="0.4"/>' +
    '<path d="' + wallBot + '" fill="none" stroke="rgba(0,0,0,.45)" stroke-width="0.3"/>' +
    '<path d="' + curve(y0b + 1.2, apb + 1.2) + ' L 100,' + y0b + ' Q 50,' + (2 * apb - y0b) + ' 0,' + y0b + ' Z" fill="' + url('drop') + '"/>' +
    (P.front ? '<g transform="translate(0,' + f(shift) + ')">' + P.front(c) + '</g>' : '') +
    '<line x1="' + fpL + '" y1="' + (-sky) + '" x2="' + fpL + '" y2="' + f(y0b) + '" stroke="' + P.pole + '" stroke-width="1.1"/>' +
    '<line x1="' + fpR + '" y1="' + (-sky) + '" x2="' + fpR + '" y2="' + f(y0b) + '" stroke="' + P.pole + '" stroke-width="1.1"/>' +
    '</svg><div class="vig"></div>';
}

const api = { PARKS, BY_ID, SKY, GROUND_K, GROUND_A, status, unlockedIds, markings, LOOK };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.RTD_PARKS = api;
})();
