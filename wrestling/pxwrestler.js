/* Run The Ropes: the wrestler, drawn as a pixel sprite.
 *
 * PROTOTYPE FOR APPROVAL. Nothing in the career game loads this file yet. It
 * exists so the sample sheet in wrestling/style/ can be judged before the full
 * system is built (PLAN.md, phase A).
 *
 * THE FAMILY IS RUN THE FLOOR'S. hoops/baller.js draws its player on a 44 by
 * 64 grid as a rig of shaded shapes: every part knows its own surface normal,
 * the light comes from the upper left, ramps turn cool in shadow and warm in
 * the light, a part in front draws a line on the part behind it, and the
 * outline is a dark shade of whatever it borders rather than a black ring. This
 * file copies that approach and those constants on purpose (it does not load or
 * change the hoops file), so the three career games read as one studio's work.
 *
 * WHAT IS DIFFERENT IS THE BODY. A basketball player is one shape. Wrestling is
 * a sport of shapes: a cruiserweight, an athlete, a heavyweight, a super
 * heavyweight and a giant all stand in the same ring. So the cell size and the
 * head are the hoops ones exactly (a head is 14 rows tall in both games) and
 * the canvas is wider and taller, 56 by 72, so a giant fits standing and a
 * cruiserweight can throw both arms over his head. Body height comes from the
 * build, never from scaling the art: a giant has more rows of leg, not bigger
 * pixels.
 *
 * window.RTR_PX, and node can require it for the option tables.
 */
(function(){
'use strict';

var W = 56, H = 72, CX = 28, SOLE = 68;

/* ─── what can be chosen ──────────────────────────────────────────────── */

var SKINS = ['#f7dcc4', '#f1c7a5', '#e3ad86', '#d19a6d', '#bd8458', '#a26c43', '#875637', '#6c432a', '#55321f', '#3f2416'];
var HAIR_COLORS = [
  ['black', '#1b1714'], ['darkbrown', '#3b2618'], ['brown', '#6a4425'], ['auburn', '#8a3b1d'], ['blonde', '#d6b05a'],
  ['platinum', '#e8e2cf'], ['grey', '#9a9a96'], ['red', '#c2302f'], ['blue', '#3a6fd8'], ['green', '#2fa86a'], ['pink', '#e06aa8'],
];
var BUILDS = [
  ['cruiser', 'Cruiserweight'], ['athletic', 'Athletic'], ['heavy', 'Heavyweight'], ['super', 'Super Heavyweight'], ['giant', 'Giant'],
];
var HAIRS = [
  ['bald', 'Bald'], ['buzz', 'Buzz'], ['short', 'Short'], ['slick', 'Slicked back'], ['long', 'Long'], ['mohawk', 'Mohawk'],
  ['pony', 'Ponytail'], ['afro', 'Afro'], ['mullet', 'Mullet'], ['topknot', 'Top knot'], ['dreads', 'Locs'], ['spiky', 'Spiked'],
  ['undercut', 'Undercut'], ['wild', 'Wild mane'], ['bun', 'Bun'], ['curls', 'Curls'], ['fauxhawk', 'Fauxhawk'], ['braids', 'Braids'],
  ['halfshave', 'Half shave'], ['frosted', 'Frosted tips'], ['waist', 'Waist length'], ['widow', 'Widow peak'], ['flames', 'Flame dye'],
  ['hornhair', 'Horn spikes'], ['swoop', 'Swoop'],
];
var FACIALS = [['none', 'Clean'], ['stubble', 'Stubble'], ['stache', 'Moustache'], ['goatee', 'Goatee'], ['beard', 'Beard'], ['longbeard', 'Long beard'],
  ['mutton', 'Mutton chops'], ['handlebar', 'Handlebar'], ['soul', 'Soul patch']];
var BOTTOMS = [['trunks', 'Trunks'], ['tights', 'Tights'], ['singlet', 'Singlet'], ['shorts', 'Fight shorts'], ['pants', 'Ring pants'], ['chaps', 'Chaps']];
var TOPS = [['none', 'Bare'], ['tank', 'Tank'], ['crop', 'Sports top'], ['tee', 'Ring tee'], ['rash', 'Rash guard'],
  ['suit', 'Bodysuit'], ['armor', 'Ring armor'], ['sash', 'Sash'], ['harness', 'Harness'], ['gi', 'Gi']];
var FIGURES = [['m', 'Frame A'], ['f', 'Frame B']];
var BOOTS = [['tall', 'Tall boots'], ['low', 'Low boots'], ['kick', 'Kick pads'], ['wraps', 'Barefoot wraps'], ['sneaks', 'Ring sneakers'],
  ['hightop', 'High tops'], ['platform', 'Platforms'], ['combat', 'Combat boots'], ['cowboy', 'Cowboy boots'], ['steel', 'Steel toes'], ['spiked', 'Spiked boots']];
var KNEES = [['none', 'None'], ['pads', 'Knee pads'], ['one', 'One pad']];
var ELBOWS = [['none', 'None'], ['pad', 'Elbow pad'], ['both', 'Both']];
var WRISTS = [['none', 'None'], ['tape', 'Wrist tape'], ['bands', 'Wristbands'], ['gloves', 'MMA gloves']];
var MASKS = [['none', 'None'], ['lucha', 'Full mask'], ['half', 'Half mask'], ['hood', 'Hood'], ['demon', 'Horned'], ['tiger', 'Striped cat'],
  ['skull', 'Bone'], ['phantom', 'Phantom'], ['jaguar', 'Spotted'], ['wolf', 'Wolf'], ['insect', 'Hornet'], ['bull', 'Bull'], ['crow', 'Carrion'],
  ['dragon', 'Dragon'], ['samurai', 'Menpo']];
var PAINTS = [['none', 'None'], ['bars', 'Eye bars'], ['skull', 'Skull'], ['split', 'Split'], ['star', 'Star eye'],
  ['tribal', 'Tribal'], ['cross', 'Cross'], ['visor', 'Visor band'], ['venom', 'Venom'], ['scar', 'Scar'], ['crimson', 'Crimson']];
var ENTRANCES = [['none', 'None'], ['robe', 'Robe'], ['jacket', 'Jacket'], ['cape', 'Cape'], ['vest', 'Vest'], ['duster', 'Long coat'], ['hoodie', 'Hoodie']];
var TATTOOS = [['none', 'None'], ['sleeve', 'Sleeve'], ['chest', 'Chest piece'], ['both', 'Sleeve and chest'], ['full', 'Full body'],
  ['tribal', 'Tribal'], ['neck', 'Neck'], ['barbwire', 'Barbed band'], ['leg', 'Leg piece'], ['back', 'Shoulder piece'], ['glyph', 'Chest glyph']];
var ACCS = [['none', 'None'], ['chain', 'Chain'], ['necklace', 'Pendant'], ['bandana', 'Bandana'], ['visor', 'Combat visor'], ['facemask', 'Face guard'],
  ['scarf', 'Ring scarf'], ['towel', 'Neck towel'], ['armband', 'Arm band'], ['tassels', 'Arm tassels'], ['armorpad', 'Shoulder plate'],
  ['spikes', 'Spiked pauldrons'], ['plume', 'Plume crest'], ['crown', 'Crown'], ['wings', 'Entrance wings']];
var PATTERNS = [['solid', 'Solid'], ['stripe', 'Side stripe'], ['split', 'Split'], ['flame', 'Flames'], ['stars', 'Stars'], ['gold', 'Gold trim'],
  ['bolt', 'Lightning'], ['check', 'Checker'], ['scales', 'Scales'], ['royal', 'Royal'], ['pinstripe', 'Pinstripe'], ['polka', 'Polka dots'],
  ['zigzag', 'Zig zag'], ['camo', 'Camo'], ['gradient', 'Fade'], ['tigerstripe', 'Tiger stripes'], ['web', 'Web']];
var AURAS = [['none', 'None'], ['spark', 'Sparks'], ['smoke', 'Smoke'], ['flame', 'Flame'], ['storm', 'Storm'], ['halo', 'Halo'], ['ice', 'Frost'],
  ['neon', 'Neon'], ['void', 'Void'], ['pyro', 'Pyro'], ['gilded', 'Gilded']];
var BELTS = [['none', 'None'], ['waist', 'On the waist'], ['shoulder', 'Over the shoulder']];
var POSES = ['idle', 'flex', 'point', 'raise', 'stance'];

function ids(list){ return list.map(function(x){ return x[0]; }); }
/* the newer hairstyles are drawn on the shape of an older one, plus their own detail */
var HAIRBASE = { undercut: 'slick', wild: 'long', bun: 'short', curls: 'afro', fauxhawk: 'mohawk', braids: 'dreads', halfshave: 'short',
  frosted: 'spiky', waist: 'long', widow: 'slick', flames: 'spiky', hornhair: 'short', swoop: 'slick' };
var AURA_COL = { spark: ['#ffd84a', '#fff3b0'], smoke: ['#7d8088', '#c2c4c9'], flame: ['#ef6a1f', '#ffd34a'], storm: ['#4f82f5', '#d9e6ff'],
  halo: ['#f2c14e', '#fff0b8'], ice: ['#6fd0ea', '#e6fbff'], neon: ['#ff4fd8', '#7ef9ff'], void: ['#5b2a86', '#a678d6'],
  pyro: ['#ff5a1f', '#ffd84a'], gilded: ['#e3a92f', '#fff0b8'] };
function cellHash(x, y, k){ return ((x * 73856093) ^ (y * 19349663) ^ ((k || 0) * 83492791)) >>> 0; }
var DEFAULT = {
  build: 'athletic', skin: 3, hair: 'short', hc: 0, facial: 'none', bottom: 'trunks', top: 'none', boots: 'tall',
  knees: 'none', elbows: 'none', wrists: 'tape', mask: 'none', paint: 'none', entrance: 'none', tattoo: 'none', belt: 'none',
  gear: '#c6392c', trim: '#f2d27a', bootc: '', shades: false, mood: 'neutral', figure: 'm', acc: 'none', pattern: 'solid', aura: 'none',
};
var LISTS = { build: BUILDS, hair: HAIRS, facial: FACIALS, bottom: BOTTOMS, top: TOPS, boots: BOOTS, knees: KNEES, elbows: ELBOWS,
  wrists: WRISTS, mask: MASKS, paint: PAINTS, entrance: ENTRANCES, tattoo: TATTOOS, belt: BELTS, figure: FIGURES,
  acc: ACCS, pattern: PATTERNS, aura: AURAS };

/* Anything unrecognised falls back to the default for that one key, so an old
   save, a hand edit or a look from another version is always drawable. */
function normal(look){
  var o = look || {}, out = {};
  out.skin = Number.isFinite(+o.skin) ? Math.max(0, Math.min(SKINS.length - 1, Math.round(+o.skin))) : DEFAULT.skin;
  out.hc = Number.isFinite(+o.hc) ? Math.max(0, Math.min(HAIR_COLORS.length - 1, Math.round(+o.hc))) : DEFAULT.hc;
  Object.keys(LISTS).forEach(function(k){ out[k] = ids(LISTS[k]).indexOf(o[k]) >= 0 ? o[k] : DEFAULT[k]; });
  var hex = /^#[0-9a-f]{6}$/i;
  out.gear = hex.test(o.gear || '') ? o.gear : DEFAULT.gear;
  out.trim = hex.test(o.trim || '') ? o.trim : DEFAULT.trim;
  out.bootc = hex.test(o.bootc || '') ? o.bootc : '';
  out.shades = !!o.shades;
  out.mood = ['neutral', 'scowl', 'grin'].indexOf(o.mood) >= 0 ? o.mood : DEFAULT.mood;
  return out;
}

function hash(s){
  var h = 2166136261 >>> 0;
  s = String(s);
  for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

/* ─── colour (the hoops ramp, unchanged) ─────────────────────────────── */

function rgb(hex){
  var h = String(hex || '#888').replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  var n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function hexOf(c){ return '#' + c.map(function(v){ v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); }).join(''); }
function mix(a, b, t){ var x = rgb(a), y = rgb(b); return hexOf(x.map(function(v, i){ return v + (y[i] - v) * t; })); }
function lum(hex){
  var c = rgb(hex).map(function(v){ v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a, b){ var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
function inkOn(bg, want){
  if (want && contrast(bg, want) >= 2.6) return want;
  return contrast(bg, '#ffffff') >= contrast(bg, '#111111') ? '#ffffff' : '#111111';
}
function hsl(hex){
  var c = rgb(hex).map(function(v){ return v / 255; });
  var mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]), l = (mx + mn) / 2, h = 0, s = 0, d = mx - mn;
  if (d > 1e-6) {
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === c[0] ? (c[1] - c[2]) / d + (c[1] < c[2] ? 6 : 0) : mx === c[1] ? (c[2] - c[0]) / d + 2 : (c[0] - c[1]) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}
function fromHsl(h, s, l){
  h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
  var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  var f = function(t){ t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return hexOf([f(h / 360 + 1 / 3), f(h / 360), f(h / 360 - 1 / 3)].map(function(v){ return v * 255; }));
}
function toward(h, goal, by){ var d = ((goal - h + 540) % 360) - 180; return h + Math.max(-by, Math.min(by, d)); }
function ramp(hex, cool, soft){
  var c = hsl(hex), h = c[0], s = c[1], l = c[2];
  if (l < 0.15) { l = 0.15 + l * 0.4; s = Math.max(s, 0.18); if (c[1] < 0.08) h = 222; }
  if (s < 0.08) { h = 220; s = 0.06 + s; }
  var cg = cool == null ? 238 : cool;
  if (soft) {
    var ss = Math.min(s, 0.55);
    return [
      fromHsl(toward(h, cg, 10), ss * 0.62, l * 0.6),
      fromHsl(toward(h, cg, 5), ss * 0.78, l * 0.8),
      fromHsl(h, s, l),
      fromHsl(toward(h, 52, 4), s * 0.92, l + (1 - l) * 0.18),
      fromHsl(toward(h, 52, 8), s * 0.8, l + (1 - l) * 0.4),
    ];
  }
  return [
    fromHsl(toward(h, cg, 28), Math.min(1, s * 1.08 + 0.06), l * 0.46),
    fromHsl(toward(h, cg, 14), Math.min(1, s * 1.05 + 0.03), l * 0.72),
    fromHsl(h, s, l),
    fromHsl(toward(h, 52, 7), s * 0.98, l + (1 - l) * 0.2),
    fromHsl(toward(h, 52, 13), s * 0.9, l + (1 - l) * 0.46),
  ];
}

/* ─── the rig (the hoops rig, on a bigger grid) ──────────────────────── */

var LIGHT = (function(){ var v = [-0.52, -0.6, 0.6], n = Math.hypot(v[0], v[1], v[2]); return v.map(function(x){ return x / n; }); })();
var INK = '#0d1019';
function grid(fill){ var g = []; for (var y = 0; y < H; y++) g.push(new Array(W).fill(fill === undefined ? null : fill)); return g; }
function tube(pts){
  return function(px, py){
    var best = null;
    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], ll = dx * dx + dy * dy;
      var t = ll ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / ll)) : 0;
      var qx = a[0] + dx * t, qy = a[1] + dy * t, r = a[2] + (b[2] - a[2]) * t;
      var ex = px - qx, ey = py - qy, d = Math.hypot(ex, ey);
      if (d <= r && (!best || d / r < best[2])) best = [ex / r, ey / r, d / r];
    }
    return best ? [best[0], best[1]] : null;
  };
}
function ellipse(cx, cy, rx, ry){ return function(px, py){ var u = (px - cx) / rx, v = (py - cy) / ry; return u * u + v * v <= 1 ? [u, v] : null; }; }
function rows(y0, y1, hw, cx, flat){
  var fy = flat == null ? 0.55 : flat;
  return function(px, py){
    var y = Math.floor(py);
    if (y < y0 || y > y1) return null;
    var w = hw(y), c = cx == null ? CX : typeof cx === 'function' ? cx(y) : cx;
    if (w == null || Math.abs(px - c) > w) return null;
    return [(px - c) / (w + 0.4), fy * ((py - (y0 + y1 + 1) / 2) / ((y1 - y0 + 1) / 2))];
  };
}
function Rig(){ this.pid = grid(-1); this.lev = grid(0); this.col = grid(null); this.parts = []; }
Rig.prototype.add = function(name, o, shape){
  var id = this.parts.length;
  this.parts.push({ name: name, ramp: o.ramp, group: o.group || name, line: o.line !== false });
  var fl = o.flat == null ? 1 : o.flat, ao = o.ao || 0, lift = o.lift || 0;
  for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
    if (o.clip && !o.clip(x, y)) continue;
    var n = shape(x + 0.5, y + 0.5);
    if (!n) continue;
    var nx = n[0] * fl, ny = n[1] * fl, nn = nx * nx + ny * ny;
    if (nn > 1) { var k = 1 / Math.sqrt(nn); nx *= k; ny *= k; nn = 1; }
    var nz = Math.sqrt(1 - nn);
    var l = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2] - ao + lift;
    this.pid[y][x] = id;
    this.lev[y][x] = l > 0.9 ? 4 : l > 0.66 ? 3 : l > 0.22 ? 2 : l > -0.16 ? 1 : 0;
  }
  return id;
};
Rig.prototype.set = function(x, y, c){ x = Math.floor(x); y = Math.floor(y); if (x >= 0 && x < W && y >= 0 && y < H && this.pid[y][x] >= 0 && c) this.col[y][x] = c; };
Rig.prototype.level = function(x, y, k){ x = Math.floor(x); y = Math.floor(y); if (y < 0 || y >= H || x < 0 || x >= W) return; var p = this.pid[y][x]; if (p >= 0) this.col[y][x] = this.parts[p].ramp[Math.max(0, Math.min(4, k))]; };
Rig.prototype.name = function(x, y){ x = Math.floor(x); y = Math.floor(y); return x >= 0 && x < W && y >= 0 && y < H && this.pid[y][x] >= 0 ? this.parts[this.pid[y][x]].name : null; };
Rig.prototype.shadeRun = function(){
  for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) { var p = this.pid[y][x]; if (p >= 0) this.col[y][x] = this.parts[p].ramp[this.lev[y][x]]; }
};

/* ─── bodies ──────────────────────────────────────────────────────────── */

/* Every number is in cells and measured down from the top of the head, so the
   head is the same 14 rows on every build, the way it is in hoops.
     sh  the shoulder line        ws  the waist        kn  the knee        so  the sole
     sw  shoulder half width      cw  chest            ww  waist           bel belly bulge
     ar  upper arm radius         lr  thigh radius     jaw extra jaw width              */
var BODY = {
  cruiser:  { sh: 18.4, ws: 30.0, kn: 41.5, so: 52.5, sw: 8.6,  cw: 8.4,  ww: 6.7, bel: 0,   ar: 1.95, lr: 2.35, jaw: 0 },
  athletic: { sh: 18.4, ws: 31.0, kn: 43.5, so: 55.5, sw: 10.3, cw: 10.0, ww: 7.6, bel: 0,   ar: 2.4,  lr: 2.75, jaw: 0.2 },
  heavy:    { sh: 18.6, ws: 32.0, kn: 44.5, so: 56.5, sw: 11.5, cw: 11.4, ww: 9.6, bel: 1.0, ar: 2.85, lr: 3.15, jaw: 0.5 },
  super:    { sh: 18.8, ws: 32.5, kn: 44.5, so: 56.0, sw: 11.9, cw: 12.4, ww: 11.0, bel: 2.6, ar: 3.05, lr: 3.55, jaw: 0.9 },
  giant:    { sh: 18.8, ws: 34.0, kn: 48.5, so: 61.5, sw: 11.8, cw: 11.3, ww: 9.2, bel: 0.6, ar: 2.9,  lr: 3.2,  jaw: 0.7 },
};

/* ─── paint ───────────────────────────────────────────────────────────── */

/* Paint the whole figure into a grid of colours. opts:
     pose   idle, flex, point, raise or stance
     frame  0 or 1, the breath
     age    greys the hair from 36 and softens the build from 40
     parts  true hands back part names instead of colours (for the guards) */
function paint(look, opts){
  var L = normal(look), o = opts || {};
  var pose = POSES.indexOf(o.pose) >= 0 ? o.pose : 'idle';
  var age = +o.age || 0;
  var B = Object.assign({}, BODY[L.build]);
  /* frame B: narrower shoulders and waist, wider at the hip, a sports top
     whenever nothing else is worn up top, softer jaw */
  var fem = L.figure === 'f';
  if (fem) { B.sw *= 0.86; B.cw *= 0.9; B.ww *= 0.88; B.ar *= 0.86; B.lr *= 0.95; B.jaw = Math.max(0, B.jaw - 0.6); B.so -= 1.5; B.bel *= 0.6; }
  if (fem && L.top === 'none' && L.bottom !== 'singlet') L.top = 'crop';
  var top0 = Math.round(SOLE - B.so);            /* the top row of the head */
  var Y = function(v){ return top0 + v; };
  var shY = Y(B.sh), wsY = Math.round(Y(B.ws)), knY = Y(B.kn), anY = Y(B.so - 3.2);

  var skinHex = SKINS[L.skin], SK = ramp(skinHex, 355, true);
  var hairHex = HAIR_COLORS[L.hc][1];
  if (age >= 36) hairHex = mix(hairHex, '#cfcfca', Math.min(0.8, (age - 35) / 12));
  var HR = ramp(hairHex, 250);
  var natural = L.hc >= 7 ? HAIR_COLORS[1][1] : L.hc === 5 || L.hc === 6 ? HAIR_COLORS[4][1] : HAIR_COLORS[L.hc][1];
  var beardHex = mix(natural, '#000000', 0.1);
  if (age >= 36) beardHex = mix(beardHex, '#d4d4cf', Math.min(0.85, (age - 35) / 11));
  var BR = ramp(beardHex, 250);
  var GR = ramp(L.gear), TR = ramp(contrast(L.gear, L.trim) < 1.35 ? inkOn(L.gear) : L.trim);
  var bootHex = L.bootc || (L.boots === 'sneaks' || L.boots === 'hightop' ? '#ecebe6' : L.boots === 'combat' ? '#2c2e2a' : L.boots === 'cowboy' ? '#6b4429' : L.gear);
  var BT = ramp(bootHex), WH = ramp('#ecebe6'), TAPE = ramp('#e9e6dc'), BLK = ramp('#1c1f27');
  var GOLD = ramp('#e3a92f', 18), STRAP = ramp('#2a1d18'), GEM = ramp('#d8304a');
  var INKR = ramp('#24324a', 250);
  if (L.pattern === 'gold' || L.pattern === 'royal') TR = GOLD;
  if (L.hair === 'flames') HR = ramp('#e2502a', 20);
  var METAL = ramp('#a9b2bd', 230), BONE = ramp('#e8dfc6', 40), FIRE = ramp('#ef6a1f', 20);
  var FULLM = L.mask !== 'none' && L.mask !== 'half' && L.mask !== 'phantom' && L.mask !== 'samurai';
  var COATED = L.entrance === 'robe' || L.entrance === 'jacket' || L.entrance === 'duster' || L.entrance === 'hoodie';
  var pantsLike = L.bottom === 'pants' || L.bottom === 'chaps';
  var GI = ramp(mix(L.gear, '#efe9dc', 0.78));
  var PANTS = L.bottom === 'chaps' ? ramp('#5b3a24', 250) : L.top === 'gi' ? GI : ramp(mix(L.gear, '#1a1c22', 0.35));
  var am = age >= 40 ? Math.min(1.2, (age - 39) * 0.12) : 0;   /* the build softens: a belly, not a dad bod */

  var R = new Rig();
  var at = function(x, y){ return R.name(x, y); };

  /* ── torso shape: traps, chest, lats tapering to the waist, a belly ── */
  var neckY = Y(14.2);
  var thw = function(y){
    if (y < Math.floor(shY) - 2 || y > wsY) return null;
    var t = (y - (shY - 2)) / (wsY - (shY - 2));     /* 0 at the traps, 1 at the waist */
    var w;
    if (t < 0.12) w = 3.4 + (B.sw - 3.4) * (t / 0.12);
    else if (t < 0.4) w = B.sw - (B.sw - B.cw) * ((t - 0.12) / 0.28);
    else w = B.cw + (B.ww - B.cw) * ((t - 0.4) / 0.6);
    var bel = B.bel + am;
    if (bel > 0) w += bel * Math.exp(-Math.pow((t - 0.8) / 0.22, 2));
    return w;
  };

  /* ── where the joints are ── */
  var arm = {};
  [-1, 1].forEach(function(s){
    var sx = CX + s * (B.sw - 0.9), a;
    if (pose === 'flex') a = { el: [CX + s * (B.sw + 5.2), shY + 0.8], wr: [CX + s * (B.sw + 4.3), shY - 6.0], fist: [CX + s * (B.sw + 3.4), shY - 8.0] };
    else if (pose === 'raise') a = { el: [CX + s * (B.sw + 3.0), shY - 8.6], wr: [CX + s * (B.sw + 1.8), shY - 19.4], fist: [CX + s * (B.sw + 1.2), shY - Math.min(22.4, shY - 5.6)] };
    else if (pose === 'point' && s === 1) a = { el: [CX + B.sw + 2.6, shY - 6.0], wr: [CX + B.sw + 3.2, shY - 12.5], fist: [CX + B.sw + 3.4, shY - 14.6], point: true };
    else if (pose === 'point' && s === -1) a = { el: [CX - B.sw - 3.6, shY + 7.0], wr: [CX - B.ww - 1.2, wsY - 1.8], fist: [CX - B.ww - 0.4, wsY - 0.8], hip: true };
    else if (pose === 'stance') a = { el: [CX + s * (B.sw + 2.6), shY + 8.6], wr: [CX + s * (B.sw - 1.4), shY + 12.0], fist: [CX + s * (B.sw - 2.4), shY + 12.4] };
    else a = { el: [CX + s * (B.sw + 1.4), shY + 9.5], wr: [CX + s * (B.sw + 1.0), shY + 17.0], fist: [CX + s * (B.sw + 0.9), shY + 19.0] };
    a.sh = [sx, shY + 0.6];
    arm[s] = a;
  });
  var wide = pose === 'stance' ? 1.6 : 0;
  var leg = {};
  [-1, 1].forEach(function(s){
    var hx = CX + s * (B.ww * 0.52 + 0.4 + (fem ? 0.6 : 0)), kx = hx + s * (0.6 + wide), fx = kx + s * (0.3 + wide * 0.4);
    leg[s] = { hip: [hx, wsY + 2.5], knee: [kx, knY], ank: [fx, anY], foot: fx + s * 0.8 };
  });

  /* ── behind everything: the cape, the hair that hangs ── */
  if (L.entrance === 'cape') {
    R.add('cape', { ramp: GR, group: 'cape', line: false, lift: -0.1 }, function(px, py){
      var y = Math.floor(py); if (y < shY - 1 || y > knY + 6) return null;
      var t = (y - (shY - 1)) / (knY + 6 - (shY - 1)), w = B.sw + 1.6 + t * 6.5;
      var dx = px - CX; if (Math.abs(dx) > w) return null;
      return [dx / (w + 0.5), 0.05];
    });
  }
  var hs = FULLM ? 'masked' : L.hair, hb = HAIRBASE[hs] || hs;
  var hy = top0;
  var hl = hs === 'waist' ? 33 : 23;
  if (hb === 'long' || hb === 'dreads') R.add('hairback', { ramp: HR, group: 'hair', line: false }, rows(hy + 4, hy + hl, function(y){
    var w = y < hy + hl - 4 ? 7.0 : 7.0 - (y - hy - hl + 5) * 0.8;
    return hs === 'wild' ? w + (cellHash(y, 3) % 3) * 0.6 - 0.2 : w; }, CX, 0.3));
  if (hs === 'halfshave') R.add('hairback', { ramp: HR, group: 'hair', line: false, clip: function(x){ return x + 0.5 < CX - 0.5; } }, rows(hy + 4, hy + 19, function(y){ return y < hy + 15 ? 7.0 : 7.0 - (y - hy - 14) * 0.9; }, CX, 0.3));
  if (hb === 'mullet') R.add('hairback', { ramp: HR, group: 'hair', line: false }, rows(hy + 8, hy + 20, function(y){ return y < hy + 17 ? 6.6 : 6.6 - (y - hy - 16) * 1.1; }, CX, 0.3));
  if (hb === 'afro') R.add('hairback', { ramp: HR, group: 'hair', line: false, flat: 0.9 }, hs === 'curls' ? ellipse(CX, hy + 4.8, 7.9, 6.4) : ellipse(CX, hy + 4.4, 9.2, 7.6));
  if (hb === 'pony') R.add('hairback', { ramp: HR, group: 'hair', line: false }, tube([[CX + 4.6, hy + 4, 1.9], [CX + 6.6, hy + 9, 1.6], [CX + 6.2, hy + 17, 1.0]]));
  if (L.entrance === 'hoodie') R.add('hood', { ramp: GR, group: 'coat', line: false, lift: -0.15, clip: function(x, y){ return y >= hy - 1; } }, ellipse(CX, hy + 6.4, 7.8, 7.6));
  if (L.acc === 'wings') [-1, 1].forEach(function(s){
    R.add('wing' + s, { ramp: ramp(mix(L.trim, '#ffffff', 0.35)), group: 'wing', line: false }, function(px, py){
      var dx = (px - CX) * s, y = py; if (dx < B.sw - 2 || dx > B.sw + 13) return null;
      var u = dx - (B.sw - 2), top = shY - 7 + u * 0.15, bot = shY + 12 - u * 0.75 + ((Math.floor(px) % 3) === 0 ? 1 : 0);
      return y >= top && y <= bot ? [s * u / 15, (y - top) / (bot - top + 1) - 0.4] : null;
    });
  });

  /* ── legs, then what covers them ── */
  var lr = B.lr;
  [-1, 1].forEach(function(s){
    var g = leg[s], gp = 'leg' + s;
    var pts = [[g.hip[0], g.hip[1], lr + 0.4], [g.knee[0], g.knee[1] - 2, lr], [g.knee[0], g.knee[1], lr * 0.82], [g.ank[0], g.ank[1], lr * 0.62]];
    R.add('leg' + s, { ramp: SK, group: gp }, tube(pts));
    var full = L.bottom === 'tights' || pantsLike;
    if (full) R.add('tights' + s, { ramp: pantsLike ? PANTS : GR, group: gp, lift: -0.08 }, tube(pts.map(function(p){ return [p[0], p[1], p[2] + (pantsLike ? 0.55 : 0.12)]; })));
    if (L.bottom === 'shorts' || L.bottom === 'singlet') {
      var cut = L.bottom === 'shorts' ? g.knee[1] - 2.2 : wsY + 6.5;
      R.add('thigh' + s, { ramp: GR, group: gp, lift: -0.08, clip: function(x, y){ return y <= cut; } }, tube(pts.map(function(p){ return [p[0], p[1], p[2] + 0.25]; })));
    }
    /* boots: tall laces to under the knee, low ones to the ankle, kick pads over the shin */
    var bootTop = ['tall', 'kick', 'platform', 'steel', 'spiked'].indexOf(L.boots) >= 0 ? g.knee[1] + 2.2 : L.boots === 'cowboy' ? g.knee[1] + 4.2
      : L.boots === 'combat' || L.boots === 'hightop' ? g.ank[1] - 4.2 : g.ank[1] - 1.4;
    if (L.boots !== 'wraps') {
      R.add('boot' + s, { ramp: BT, group: 'boot' + s, clip: function(x, y){ return y >= bootTop; } },
        tube([[g.knee[0], g.knee[1] + 1, lr * 0.9], [g.ank[0], g.ank[1], lr * 0.78], [g.ank[0] + s * 0.2, SOLE - 1.5, lr * 0.75]]));
      R.add('foot' + s, { ramp: BT, group: 'boot' + s }, rows(SOLE - 3, SOLE - 1, function(y){ return y === SOLE - 3 ? lr * 0.85 : lr * 0.95 + 0.6; }, g.foot, 0.4));
      R.add('sole' + s, { ramp: L.boots === 'sneaks' || L.boots === 'hightop' ? WH : L.boots === 'platform' ? TR : BLK, group: 'boot' + s, line: false },
        rows(L.boots === 'platform' ? SOLE - 1 : SOLE, SOLE, function(){ return lr * 0.95 + 0.9; }, g.foot, 0));
      if (L.boots === 'steel') R.add('toe' + s, { ramp: METAL, group: 'boot' + s, line: false }, rows(SOLE - 3, SOLE - 2, function(){ return lr * 0.7; }, g.foot, 0.4));
      if (L.boots === 'spiked') for (var sk = 0; sk < 3; sk++) R.add('spike' + s + sk, { ramp: METAL, group: 'spike' }, ellipse(g.knee[0] + s * (lr * 0.85 + 0.7), g.knee[1] + 4 + sk * 3, 0.9, 0.6));
      if (L.boots === 'kick') R.add('kick' + s, { ramp: TR, group: 'kick' + s }, rows(Math.floor(g.knee[1] + 1), Math.floor(g.ank[1]), function(){ return lr * 0.62; }, function(y){ return g.knee[0] + (g.ank[0] - g.knee[0]) * ((y - g.knee[1]) / (g.ank[1] - g.knee[1])) - s * 0.3; }, 0.25));
    } else {
      R.add('foot' + s, { ramp: SK, group: gp }, rows(SOLE - 2, SOLE, function(y){ return y === SOLE ? lr + 0.4 : lr * 0.8 + 0.4; }, g.foot, 0.4));
      R.add('wrap' + s, { ramp: TAPE, group: gp, line: false }, rows(Math.floor(g.ank[1] - 1), SOLE - 1, function(){ return lr * 0.82 + 0.3; }, g.ank[0], 0.3));
    }
    var padOn = L.knees === 'pads' || (L.knees === 'one' && s === -1);
    if (padOn) R.add('knee' + s, { ramp: L.boots === 'kick' ? TR : ramp(mix(bootHex, '#000000', 0.15)), group: 'knee' + s }, ellipse(g.knee[0], g.knee[1] + 0.2, lr + 0.5, 2.4));
  });

  /* ── the torso, and what is worn on it ── */
  R.add('neck', { ramp: SK, group: 'body', line: false, ao: 0.32 }, rows(Math.floor(neckY), Math.floor(shY), function(){ return 2.9 + (B.sw - 9) * 0.45; }, CX, 0.1));
  R.add('torso', { ramp: SK, group: 'body', line: false }, rows(Math.floor(shY) - 2, wsY, thw, CX, 0.14));
  /* the bottoms: trunks sit on the hip and cut high, the singlet runs up in straps */
  var trunkTop = wsY - 0.5, trunkBot = wsY + (L.bottom === 'trunks' ? 4.6 : 5.6);
  R.add('trunks', { ramp: L.bottom === 'pants' ? PANTS : GR, group: 'trunks', lift: -0.1 }, function(px, py){
    var y = Math.floor(py); if (y < trunkTop || y > trunkBot) return null;
    var w = (thw(wsY) || B.ww) + 0.3 + (fem ? 1.2 : 0) - Math.max(0, y - wsY - 1) * (L.bottom === 'trunks' ? 0.25 : 0.05), dx = px - CX, ad = Math.abs(dx);
    if (ad > w) return null;
    if (L.bottom === 'trunks' && y > wsY + 2 && ad > w - (y - wsY - 2) * 0.9 && ad > 1.2) return null;
    return [dx / (w + 0.5), 0.05];
  });
  var topBody = L.top !== 'none' && L.top !== 'sash' && L.top !== 'harness';
  var TOPR = !topBody ? GR : L.top === 'tee' ? ramp(mix(L.trim, '#1a1c22', 0.15)) : L.top === 'rash' ? ramp(mix(L.gear, '#101216', 0.45))
    : L.top === 'armor' ? ramp(mix(L.gear, '#8f99a6', 0.45)) : L.top === 'gi' ? GI : GR;
  if (L.bottom === 'singlet' || topBody) {
    var strap = L.bottom === 'singlet' && !topBody;
    var tee = L.top === 'tee' || L.top === 'rash' || L.top === 'suit' || L.top === 'armor' || L.top === 'gi';
    R.add('top', { ramp: TOPR, group: 'top', line: false, lift: -0.1 }, function(px, py){
      var y = Math.floor(py), w = thw(y); if (w == null || y > wsY) return null;
      var dx = px - CX, ad = Math.abs(dx);
      if (ad > w + 0.1) return null;
      if (L.top === 'crop' && y > shY + (wsY - shY) * 0.5) return null;
      if (L.top === 'gi' && y < shY + 9 && ad < 3.4 - (y - shY) * 0.38) return null;
      if (!tee) {
        var neckCut = y < shY + 3 ? 3.4 - (y - shY) * 0.2 : 0;
        if (y < shY + 1 && ad > (strap ? 4.6 : 6.4)) return null;
        if (y < shY + 3 && ad < neckCut) return null;
        if (y < shY + 5 && ad > w - 1.6) return null;
      } else if (y < shY - 0.5 && ad < 2.6) return null;
      return [dx / (w + 0.6), 0.05];
    });
  }

  if (L.top === 'gi') R.add('gibelt', { ramp: BLK, group: 'gibelt' }, function(px, py){ var y = Math.floor(py), w = (thw(wsY) || B.ww) + 0.8; return y >= wsY - 1 && y <= wsY && Math.abs(px - CX) <= w ? [(px - CX) / (w + 0.5), 0] : (y > wsY && y <= wsY + 4 && Math.abs(px - CX - 2.2) < 0.8 ? [0.3, 0] : null); });
  if (L.top === 'sash') R.add('sash', { ramp: TR, group: 'sash' }, tube([[CX + B.sw - 2.2, shY - 0.6, 1.7], [CX - B.ww + 1.2, wsY - 0.6, 1.7]]));
  if (L.top === 'harness') {
    [-1, 1].forEach(function(s){ R.add('hstrap' + s, { ramp: STRAP, group: 'harness' }, tube([[CX + s * (B.sw - 2.4), shY - 0.4, 0.9], [CX - s * (B.ww - 1.6), wsY - 1.2, 0.9]])); });
    R.add('hring', { ramp: METAL, group: 'harness' }, ellipse(CX, shY + (wsY - shY) * 0.5 - 0.5, 1.6, 1.6));
  }

  /* ── the championship belt on the waist ── */
  var beltOn = L.belt === 'waist' && pose !== 'raise';
  if (beltOn) {
    R.add('strap', { ramp: STRAP, group: 'belt' }, function(px, py){ var y = Math.floor(py), w = (thw(wsY) || B.ww) + 0.7; return y >= wsY - 1 && y <= wsY + 1 && Math.abs(px - CX) <= w ? [(px - CX) / (w + 0.5), 0] : null; });
    [-1, 1].forEach(function(s){ R.add('side' + s, { ramp: GOLD, group: 'belt' }, ellipse(CX + s * (B.ww - 0.6), wsY, 1.5, 1.4)); });
    R.add('plate', { ramp: GOLD, group: 'belt' }, ellipse(CX, wsY - 0.2, 4.6, 3.3));
    R.add('gem', { ramp: GEM, group: 'gem', line: false }, ellipse(CX, wsY - 0.4, 1.1, 1.0));
  }
  if (L.belt === 'shoulder') {
    R.add('sstrap', { ramp: STRAP, group: 'belt' }, tube([[CX + B.sw - 1.8, shY - 0.4, 1.2], [CX - B.cw * 0.4, wsY - 3.5, 1.2]]));
    R.add('splate', { ramp: GOLD, group: 'belt' }, ellipse(CX + 2.2, shY + 5.2, 3.6, 2.8));
    R.add('sgem', { ramp: GEM, group: 'gem', line: false }, ellipse(CX + 2.2, shY + 5.0, 0.9, 0.9));
  }

  /* ── the entrance gear over the body ── */
  if (COATED || L.entrance === 'vest') {
    var hem = L.entrance === 'robe' ? knY + 3 : L.entrance === 'duster' ? knY + 6 : L.entrance === 'jacket' || L.entrance === 'hoodie' ? wsY + 3 : wsY + 0.5;
    R.add('coat', { ramp: GR, group: 'coat', lift: -0.1 }, function(px, py){
      var y = Math.floor(py); if (y < shY - 1 || y > hem) return null;
      var w = y <= wsY ? (thw(y) || B.ww) + 0.9 : (thw(wsY) || B.ww) + 0.9 + (y - wsY) * (L.entrance === 'robe' || L.entrance === 'duster' ? 0.45 : 0.2);
      var dx = px - CX, ad = Math.abs(dx), open = y < shY + 1 ? 2.8 : 2.0 + Math.max(0, (y - shY) * (L.entrance === 'vest' ? 0.28 : 0.16));
      if (ad > w || ad < open) return null;
      return [dx / (w + 0.6), 0.05];
    });
  }

  /* ── the head ── */
  var HW = [3.0, 4.5, 5.2, 5.6, 5.8, 5.9, 5.9, 5.9, 5.8, 5.6, 5.2, 4.6, 3.8, 2.6];
  var hhw = function(y){ var v = HW[y - hy]; return v == null ? null : v + (y - hy >= 8 ? B.jaw * ((y - hy - 7) / 6) : 0); };
  [-1, 1].forEach(function(s){ R.add('ear' + s, { ramp: SK, group: 'head', line: false }, ellipse(CX + s * 6.1, hy + 7.6, 1.1, 1.9)); });
  R.add('head', { ramp: SK, group: 'head' }, rows(hy, hy + 13, hhw, CX, 0.6));

  /* ── the arms: the side further from the light first ── */
  [1, -1].forEach(function(s){
    var A = arm[s], g = 'arm' + s, sleeved = COATED || L.top === 'tee' || L.top === 'rash' || L.top === 'suit' || L.top === 'gi';
    var SLR = COATED || L.top === 'suit' ? GR : L.top === 'tee' ? ramp(mix(L.trim, '#1a1c22', 0.15)) : L.top === 'gi' ? GI : ramp(mix(L.gear, '#101216', 0.45));
    var r0 = B.ar + 0.25, r1 = B.ar * 0.86, r2 = B.ar * 0.66;
    var flexed = pose === 'flex';
    R.add('delt' + s, { ramp: SK, group: g }, ellipse(A.sh[0] + s * 0.3, A.sh[1] - 0.3, B.ar + 0.9, B.ar + 0.8));
    var bic = [(A.sh[0] + A.el[0]) / 2 + (flexed ? 0 : 0), (A.sh[1] + A.el[1]) / 2 - (flexed ? 0.9 : 0), r0 + (flexed ? 0.9 : 0.25)];
    R.add('upper' + s, { ramp: SK, group: g }, tube([[A.sh[0], A.sh[1], r0], bic, [A.el[0], A.el[1], r1]]));
    var mid = [A.el[0] * 0.5 + A.wr[0] * 0.5, A.el[1] * 0.5 + A.wr[1] * 0.5, r1 * 1.05];
    R.add('fore' + s, { ramp: SK, group: g }, tube([[A.el[0], A.el[1], r1 * 0.95], mid, [A.wr[0], A.wr[1], r2]]));
    if (sleeved) {
      var sleeveEnd = L.entrance === 'robe' || L.entrance === 'duster' || L.top === 'suit' ? 1.0 : L.entrance === 'jacket' || L.entrance === 'hoodie' ? 0.92 : 0.45;
      var sp = function(t){ return [A.sh[0] + (A.wr[0] - A.sh[0]) * t, A.sh[1] + (A.wr[1] - A.sh[1]) * t]; };
      R.add('sleeve' + s, { ramp: SLR, group: g, lift: -0.08 }, tube([[A.sh[0], A.sh[1], r0 + 0.8], [A.el[0], A.el[1], r1 + 0.6], [sp(sleeveEnd)[0] * 0.5 + A.el[0] * 0.5 * (sleeveEnd < 0.6 ? 1 : 0) + (sleeveEnd < 0.6 ? 0 : sp(sleeveEnd)[0] * 0.5), sleeveEnd < 0.6 ? A.el[1] - (A.el[1] - A.sh[1]) * 0.2 : sp(sleeveEnd)[1], r2 + 0.7]]));
    }
    var padOn = L.elbows === 'both' || (L.elbows === 'pad' && s === 1);
    if (padOn && !sleeved) R.add('elbow' + s, { ramp: BLK, group: g }, ellipse(A.el[0], A.el[1], r1 + 0.6, r1 + 0.5));
    if (L.wrists !== 'none' && !(sleeved && (L.entrance === 'robe' || L.entrance === 'duster'))) {
      var wcol = L.wrists === 'tape' ? TAPE : L.wrists === 'gloves' ? BLK : TR;
      R.add('wrist' + s, { ramp: wcol, group: g, line: false }, tube([[A.wr[0] + (A.el[0] - A.wr[0]) * 0.22, A.wr[1] + (A.el[1] - A.wr[1]) * 0.22, r2 + 0.35], [A.wr[0], A.wr[1], r2 + 0.3]]));
    }
    var fr = Math.max(1.8, B.ar * 0.82);
    R.add('fist' + s, { ramp: L.wrists === 'gloves' ? BLK : SK, group: g }, ellipse(A.fist[0], A.fist[1], fr, fr + 0.2));
    if (A.point) R.add('finger' + s, { ramp: SK, group: g }, tube([[A.fist[0], A.fist[1] - 1, 0.7], [A.fist[0] + 0.4, A.fist[1] - 4.2, 0.6]]));
  });

  /* ── what is worn over the arms and shoulders ── */
  if (L.top === 'armor' || L.acc === 'armorpad' || L.acc === 'spikes') [-1, 1].forEach(function(s){
    if (L.acc === 'armorpad' && s === 1 && L.top !== 'armor') return;
    var A = arm[s];
    R.add('pad' + s, { ramp: METAL, group: 'pad' + s }, ellipse(A.sh[0] + s * 0.4, A.sh[1] - 0.6, B.ar + 1.7, B.ar + 1.2));
    if (L.acc === 'spikes') for (var k = -1; k <= 1; k++) R.add('pspike' + s + k, { ramp: METAL, group: 'pad' + s }, tube([[A.sh[0] + s * 0.4 + k * 1.6, A.sh[1] - 2.2, 0.7], [A.sh[0] + s * 0.9 + k * 2.0, A.sh[1] - 4.6, 0.3]]));
  });
  if (L.acc === 'armband' || L.acc === 'tassels') { var A1 = arm[1], my = [A1.sh[0] * 0.45 + A1.el[0] * 0.55, A1.sh[1] * 0.45 + A1.el[1] * 0.55];
    R.add('armband', { ramp: TR, group: 'armband' }, tube([[my[0], my[1] - 0.6, B.ar + 0.45], [my[0], my[1] + 0.6, B.ar + 0.45]]));
    if (L.acc === 'tassels') for (var tq = -1; tq <= 1; tq++) R.add('tassel' + tq, { ramp: TR, group: 'tassel', line: false }, tube([[my[0] + 1.2 + tq * 0.9, my[1] + 1.2, 0.45], [my[0] + 2.0 + tq * 0.9, my[1] + 4.2, 0.4]])); }
  if (L.acc === 'towel') R.add('towel', { ramp: WH, group: 'towel' }, tube([[CX + B.sw - 1.6, shY - 1.2, 1.7], [CX + B.sw - 3.4, shY + 4, 1.6], [CX + 3.6, wsY - 4, 1.4]]));
  if (L.acc === 'scarf') { R.add('scarf', { ramp: TR, group: 'scarf' }, rows(Math.floor(neckY) + 1, Math.floor(shY) + 1, function(){ return 3.6 + (B.sw - 9) * 0.45; }, CX, 0.2));
    R.add('scarft', { ramp: TR, group: 'scarf' }, tube([[CX - 2.2, shY + 1, 1.2], [CX - 2.8, shY + 9, 1.0]])); }

  /* ── the belt held over the head ── */
  if (pose === 'raise' && L.belt !== 'none') {
    var bx0 = arm[-1].fist[0], bx1 = arm[1].fist[0], byy = arm[1].fist[1] + 0.4;
    R.add('rstrap', { ramp: STRAP, group: 'rbelt' }, rows(Math.floor(byy - 1), Math.floor(byy + 1), function(){ return (bx1 - bx0) / 2 - 0.4; }, CX, 0.3));
    R.add('rplate', { ramp: GOLD, group: 'rbelt' }, ellipse(CX, byy - 0.2, 5.0, 3.6));
    R.add('rgem', { ramp: GEM, group: 'gem', line: false }, ellipse(CX, byy - 0.4, 1.2, 1.1));
    [-1, 1].forEach(function(s){ R.add('rfist' + s, { ramp: SK, group: 'arm' + s }, ellipse(arm[s].fist[0], arm[s].fist[1], Math.max(1.8, B.ar * 0.82), Math.max(1.8, B.ar * 0.82) + 0.2)); });
  }

  /* ── hair, facial hair, the mask, over the head ── */
  var onHead = function(px, py){ var y = Math.floor(py), w = hhw(y); return w != null && Math.abs(px - CX) <= w; };
  var sphere = function(cy, r){ return function(px, py){ return [(px - CX) / r, (py - cy) / r]; }; };
  var dome = function(fn){ return function(px, py){ return fn(px, py) ? sphere(hy + 5, 7.2)(px, py) : null; }; };
  var topOf = function(yb){ return function(px, py){ return onHead(px, py) && py < yb; }; };
  var sides = function(y0, y1, inner){ return function(px, py){ return onHead(px, py) && py >= y0 && py < y1 && Math.abs(px - CX) > inner; }; };
  var fadeR = ramp(mix(hairHex, skinHex, 0.55), 250);
  if (hb === 'buzz') R.add('hair', { ramp: ramp(mix(hairHex, skinHex, 0.35), 250), group: 'hair', line: false }, dome(function(px, py){ return topOf(hy + 3.6)(px, py) || sides(hy + 3.6, hy + 6.6, 4.7)(px, py); }));
  else if (hb === 'short' || hb === 'pony' || hb === 'topknot') {
    R.add('hairf', { ramp: fadeR, group: 'hair', line: false }, dome(sides(hy + 3.4, hy + 8.2, 4.6)));
    R.add('hair', { ramp: HR, group: 'hair' }, dome(function(px, py){ return topOf(hy + 3.8)(px, py) || (Math.floor(py) === hy - 1 && Math.abs(px - CX) <= 3.4); }));
    if (hb === 'topknot') R.add('knot', { ramp: HR, group: 'hair' }, ellipse(CX + 0.4, hy - 2.2, 2.3, 1.9));
    if (hs === 'bun') R.add('knot', { ramp: HR, group: 'hair' }, ellipse(CX, hy - 1.4, 3.0, 2.4));
    if (hs === 'hornhair') [-1, 1].forEach(function(s){ R.add('knot' + s, { ramp: HR, group: 'hair' }, tube([[CX + s * 3.4, hy + 1.2, 1.6], [CX + s * 5.4, hy - 2.6, 1.0], [CX + s * 6.0, hy - 4.6, 0.5]])); });
    if (hs === 'halfshave') R.add('hairside', { ramp: HR, group: 'hair', clip: function(x){ return x + 0.5 < CX; } }, dome(sides(hy + 3.4, hy + 11.4, 4.4)));
  } else if (hb === 'slick') {
    if (hs === 'undercut') R.add('hairf', { ramp: fadeR, group: 'hair', line: false }, dome(sides(hy + 3.4, hy + 8.2, 4.6)));
    R.add('hair', { ramp: HR, group: 'hair' }, dome(function(px, py){
      var ad = Math.abs(px - CX);
      if (hs === 'widow' && py < hy + 5.2 && ad < 1.1 && onHead(px, py)) return true;
      if (hs === 'swoop' && py >= hy + 3 && py < hy + 5.6 && px > CX - 5.6 && px < CX + 1.2 && onHead(px, py)) return true;
      return topOf(hy + 3.4)(px, py) || (hs !== 'undercut' && sides(hy + 3.4, hy + 7.4, 4.9)(px, py)) || (Math.floor(py) === hy - 1 && ad <= 4.2); }));
  } else if (hb === 'mohawk') {
    R.add('hairf', { ramp: fadeR, group: 'hair', line: false }, dome(sides(hy + 1, hy + 7.4, 2.0)));
    R.add('hair', { ramp: HR, group: 'hair' }, function(px, py){ var y = Math.floor(py), ad = Math.abs(px - CX + 0.2); var fx = hs === 'fauxhawk'; return y >= hy - (fx ? 2 : 4) && y <= hy + 3 && ad <= (fx ? (y < hy - 1 ? 1.9 : 2.7) : (y < hy - 2 ? 1.2 : 1.7)) ? [(px - CX) / 2.4, -0.4] : null; });
  } else if (hb === 'afro') {
    R.add('hair', { ramp: HR, group: 'hair', line: false }, dome(function(px, py){ return topOf(hy + 3.8)(px, py) || sides(hy + 3.8, hy + 6.6, 4.6)(px, py); }));
  } else if (hb === 'long' || hb === 'dreads' || hb === 'mullet') {
    R.add('hair', { ramp: HR, group: 'hair' }, dome(function(px, py){ return topOf(hy + 3.8)(px, py) || (Math.floor(py) === hy - 1 && Math.abs(px - CX) <= 3.4) || sides(hy + 3.8, hy + (hb === 'mullet' ? 7.4 : 11.4), 4.6)(px, py); }));
  } else if (hb === 'spiky') {
    R.add('hair', { ramp: HR, group: 'hair' }, function(px, py){
      var y = Math.floor(py), x = Math.floor(px), ad = Math.abs(px - CX);
      if (onHead(px, py) && py < hy + 3.6) return sphere(hy + 5, 7.2)(px, py);
      if (y >= hy - (hs === 'flames' ? 5 : 3) && y < hy && ad <= 5.2 && ((x + (hy - y)) % 3 === 0 || y === hy - 1)) return [(px - CX) / 6, -0.6];
      return null;
    });
  }
  if (L.facial === 'goatee') R.add('beard', { ramp: BR, group: 'beard', line: false }, function(px, py){ var y = Math.floor(py), ad = Math.abs(px - CX); return (y === hy + 10 && ad <= 2.4 && onHead(px, py)) || (y >= hy + 12 && y <= hy + 14 && ad <= (y === hy + 14 ? 1.4 : 1.9)) ? sphere(hy + 7, 7)(px, py) : null; });
  else if (L.facial === 'beard' || L.facial === 'longbeard') R.add('beard', { ramp: BR, group: 'beard', line: false }, function(px, py){
    var y = Math.floor(py), ad = Math.abs(px - CX), extra = L.facial === 'longbeard' ? 4 : 0;
    if (!onHead(px, py) && !(y >= hy + 14 && y <= hy + 14 + extra && ad <= 3.0 - (y - hy - 14) * 0.5)) return null;
    var on = (y >= hy + 6 && y <= hy + 9 && ad > 4.6) || (y === hy + 10 && (ad > 4.0 || ad <= 2.4)) || (y === hy + 11 && ad > 2.6) || y >= hy + 12;
    return on ? sphere(hy + 7, 7.2)(px, py) : null;
  });
  else if (L.facial === 'mutton') R.add('beard', { ramp: BR, group: 'beard', line: false }, function(px, py){ var y = Math.floor(py); return onHead(px, py) && y >= hy + 6 && y <= hy + 11 && Math.abs(px - CX) > 3.6 ? sphere(hy + 7, 7.2)(px, py) : null; });
  if (L.mask !== 'none') {
    var MK = L.mask === 'hood' || L.mask === 'crow' ? ramp(mix(L.gear, '#141218', 0.72)) : L.mask === 'skull' || L.mask === 'phantom' ? ramp('#e9e4d6')
      : L.mask === 'samurai' ? ramp(mix(L.gear, '#1a1a1f', 0.4)) : GR;
    R.add('mask', { ramp: MK, group: 'mask', line: false }, dome(function(px, py){
      if (!onHead(px, py) && !(FULLM && Math.floor(py) === hy - 1 && Math.abs(px - CX) <= 3.4)) return false;
      if (L.mask === 'half') return py >= hy + 2 && py < hy + 9;
      if (L.mask === 'phantom') return px < CX + 0.5 && py >= hy + 1;
      if (L.mask === 'samurai') return py >= hy + 9.2;
      return py < hy + (L.mask === 'hood' ? 14 : 12.2);
    }));
    var both = function(f){ [-1, 1].forEach(f); };
    if (L.mask === 'hood') R.add('maskx', { ramp: MK, group: 'mask' }, tube([[CX, hy, 2.6], [CX + 0.6, hy - 3.4, 0.6]]));
    if (L.mask === 'demon') both(function(s){ R.add('maskx' + s, { ramp: TR, group: 'mask' }, tube([[CX + s * 3.8, hy + 1, 1.3], [CX + s * 5.4, hy - 2.6, 0.9], [CX + s * 4.8, hy - 5, 0.4]])); });
    if (L.mask === 'bull') both(function(s){ R.add('maskx' + s, { ramp: BONE, group: 'maskx' }, tube([[CX + s * 5.2, hy + 3, 1.3], [CX + s * 8.4, hy + 1.2, 0.9], [CX + s * 9.4, hy - 1.6, 0.5]])); });
    if (L.mask === 'wolf' || L.mask === 'tiger') both(function(s){ R.add('maskx' + s, { ramp: MK, group: 'mask' }, tube([[CX + s * 4.2, hy + 0.8, 1.7], [CX + s * 5.0, hy - 2.8, 0.45]])); });
    if (L.mask === 'insect') both(function(s){ R.add('maskx' + s, { ramp: BLK, group: 'maskx', line: false }, tube([[CX + s * 1.6, hy - 0.6, 0.5], [CX + s * 3.8, hy - 4.6, 0.45]])); });
    if (L.mask === 'dragon') R.add('maskx', { ramp: TR, group: 'mask' }, function(px, py){ var y = Math.floor(py), ad = Math.abs(px - CX); return y >= hy - 3 && y < hy && ad <= 1.4 - (hy - 1 - y) * 0.3 ? [(px - CX) / 2, -0.5] : null; });
  }
  if (L.acc === 'facemask') R.add('guard', { ramp: ramp(mix(L.gear, '#15161b', 0.55)), group: 'guard', line: false }, dome(function(px, py){ return onHead(px, py) && py >= hy + 9.2; }));
  if (L.acc === 'bandana') {
    R.add('band', { ramp: TR, group: 'band', line: false }, dome(function(px, py){ return onHead(px, py) && py >= hy + 2 && py < hy + 4; }));
    R.add('bandt', { ramp: TR, group: 'band' }, tube([[CX + 5.8, hy + 3, 1.0], [CX + 7.6, hy + 6, 0.7]]));
  }
  if (L.acc === 'crown') R.add('crown', { ramp: GOLD, group: 'crown' }, function(px, py){
    var y = Math.floor(py), ad = Math.abs(px - CX); if (ad > 4.6) return null;
    if (y === hy - 1 || y === hy) return [(px - CX) / 5, 0];
    return (y === hy - 2 || y === hy - 3) && (Math.floor(ad) === 0 || Math.floor(ad) === 2 || Math.floor(ad) === 4) ? [(px - CX) / 5, -0.4] : null; });
  if (L.acc === 'plume') [-2, 0, 2].forEach(function(k){ R.add('plume' + k, { ramp: k ? TR : GR, group: 'plume' }, tube([[CX + k * 0.6, hy + 0.5, 1.0], [CX + k * 1.4, hy - 3.0, 0.9], [CX + k * 2.0, hy - 4.6, 0.4]])); });

  R.shadeRun();

  /* ── detail over the shading ── */
  /* the trim: waistband, a stripe down the hip, piping on a coat */
  for (var y1 = 0; y1 < H; y1++) for (var x1 = 0; x1 < W; x1++) {
    var n1 = at(x1, y1);
    if (n1 === 'trunks') {
      var ad1 = Math.abs(x1 + 0.5 - CX);
      if (y1 === Math.ceil(trunkTop)) R.set(x1, y1, TR[x1 < CX ? 3 : 2]);
      else if (y1 === Math.floor(trunkBot) && L.bottom !== 'trunks') R.level(x1, y1, R.lev[y1][x1] - 1);
      if (L.bottom === 'trunks' && ad1 < 0.9 && y1 > trunkTop + 1) R.level(x1, y1, R.lev[y1][x1] - 1);
    }
    if (/^tights|^thigh/.test(n1 || '')) {
      var s1 = n1.slice(-2) === '-1' ? -1 : 1, lg = leg[s1];
      var outer = lg.knee[0] + s1 * (lr - 0.2);
      if (Math.abs(x1 + 0.5 - outer) < 0.8 && !pantsLike) R.set(x1, y1, TR[s1 < 0 ? 3 : 1]);
    }
    if (n1 === 'coat') {
      var nb = [at(x1 - 1, y1), at(x1 + 1, y1)];
      if (nb.indexOf('torso') >= 0 || nb.indexOf('trunks') >= 0 || nb.indexOf('top') >= 0 || nb.indexOf('strap') >= 0 || nb.indexOf('plate') >= 0) R.set(x1, y1, TR[x1 < CX ? 3 : 2]);
    }
    if (n1 === 'cape') { if (y1 >= knY + 5) R.set(x1, y1, TR[2]); }
    if (/^boot/.test(n1 || '') && (L.boots === 'tall' || L.boots === 'combat' || L.boots === 'cowboy')) {
      var s2 = n1.slice(-2) === '-1' ? -1 : 1, lg2 = leg[s2];
      if (Math.abs(x1 + 0.5 - lg2.ank[0]) < 0.6 && y1 < lg2.ank[1] && (y1 % 2 === 0)) R.set(x1, y1, L.boots === 'combat' ? WH[1] : L.boots === 'cowboy' ? GOLD[2] : TR[2]);
      if (y1 === Math.ceil(lg2.knee[1] + 2.2)) R.set(x1, y1, TR[x1 < lg2.knee[0] ? 3 : 1]);
    }
  }
  /* the pattern, over every part cut from the gear colour */
  if (L.pattern !== 'solid' && L.pattern !== 'gold') {
    var gearPart = function(n){ return /^(trunks|tights|thigh|coat|cape)/.test(n) || ((n === 'top' || /^sleeve/.test(n)) && TOPR === GR); };
    for (var yp = 0; yp < H; yp++) for (var xp2 = 0; xp2 < W; xp2++) {
      var np = at(xp2, yp); if (!np || !gearPart(np)) continue;
      var lvp = R.lev[yp][xp2], cp = R.col[yp][xp2], hp = cellHash(xp2, yp), pt = L.pattern;
      if (pt === 'stripe' && np === 'trunks' && Math.abs(Math.abs(xp2 + 0.5 - CX) - (B.ww - 0.6)) < 0.7) R.set(xp2, yp, TR[2]);
      else if (pt === 'split' && xp2 + 0.5 < CX) R.set(xp2, yp, TR[Math.min(4, lvp)]);
      else if (pt === 'flame') { var base = np === 'trunks' ? trunkBot : /^(tights|thigh)/.test(np) ? Math.min(knY + 4, SOLE - 6) : wsY + 2;
        var tip = base - 1 - (Math.floor(xp2 * 1.7) % 3) - (xp2 % 2); if (yp >= tip) R.set(xp2, yp, yp >= base ? FIRE[4] : FIRE[Math.min(4, lvp + 1)]); }
      else if (pt === 'stars' && hp % 11 === 0) R.set(xp2, yp, TR[4]);
      else if (pt === 'royal' && hp % 13 === 0) R.set(xp2, yp, GEM[2]);
      else if (pt === 'bolt' && (xp2 + Math.floor(yp / 2) * 2) % 7 === 0) R.set(xp2, yp, TR[3]);
      else if (pt === 'check' && ((xp2 >> 1) + (yp >> 1)) % 2) R.set(xp2, yp, mix(cp, TR[1], 0.6));
      else if (pt === 'scales' && yp % 2 === 0 && (xp2 + ((yp >> 1) & 1)) % 3 === 0) R.level(xp2, yp, lvp - 1);
      else if (pt === 'pinstripe' && xp2 % 3 === 0) R.set(xp2, yp, mix(cp, TR[2], 0.5));
      else if (pt === 'polka' && hp % 9 === 0) R.set(xp2, yp, TR[3]);
      else if (pt === 'zigzag' && (xp2 + Math.abs((yp % 4) - 2)) % 4 === 0) R.set(xp2, yp, TR[2]);
      else if (pt === 'camo') { var cv = cellHash(xp2 >> 1, yp >> 1) % 3; if (cv === 0) R.set(xp2, yp, mix(cp, '#3d4a2c', 0.6)); else if (cv === 1) R.set(xp2, yp, mix(cp, '#6b6a45', 0.45)); }
      else if (pt === 'gradient') R.set(xp2, yp, mix(cp, TR[2], Math.max(0, Math.min(0.7, (yp - shY) / (SOLE - shY)))));
      else if (pt === 'tigerstripe' && (xp2 + yp + (hp % 2)) % 4 === 0) R.set(xp2, yp, mix(cp, INK, 0.62));
      else if (pt === 'web' && (((xp2 - Math.floor(CX)) % 4 === 0) || (yp % 4 === 0 && hp % 3))) R.set(xp2, yp, mix(cp, TR[3], 0.45));
    }
  }
  /* the body: a pec line, abs on the lean builds, a navel on the big ones */
  var bare = (L.top === 'none' || L.top === 'sash' || L.top === 'harness') && L.bottom !== 'singlet' && !COATED;
  if (bare) {
    var pecY = Math.floor(shY + (wsY - shY) * 0.34);
    for (var xp = 0; xp < W; xp++) {
      var adp = Math.abs(xp + 0.5 - CX);
      if (at(xp, pecY) === 'torso' && adp > 0.6 && adp < B.cw - 1.6) R.level(xp, pecY, R.lev[pecY][xp] - 1);
      if (at(xp, pecY - 1) === 'torso' && adp > 1.2 && adp < B.cw - 2.4 && xp < CX) R.level(xp, pecY - 1, Math.min(4, R.lev[pecY - 1][xp] + 1));
    }
    for (var yc = pecY - 3; yc < wsY - 1; yc++) if (at(Math.floor(CX), yc) === 'torso') R.level(Math.floor(CX), yc, R.lev[yc][Math.floor(CX)] - 1);
    if (B.bel + am < 1.2) {
      for (var ya = pecY + 3; ya < wsY - 1; ya += 2) for (var xa = Math.floor(CX - 3); xa <= Math.floor(CX + 2); xa++) if (at(xa, ya) === 'torso' && xa !== Math.floor(CX)) R.level(xa, ya, R.lev[ya][xa] - 1);
    } else {
      R.set(Math.floor(CX), wsY - 3, SK[0]);
    }
  }
  /* tattoos: a sleeve of ink on the far arm, a piece across the chest */
  if (L.tattoo !== 'none') {
    for (var yt = 0; yt < H; yt++) for (var xt = 0; xt < W; xt++) {
      var nt = at(xt, yt), hh = ((xt * 73856093) ^ (yt * 19349663)) >>> 0;
      if ((L.tattoo === 'sleeve' || L.tattoo === 'both') && (nt === 'upper-1' || nt === 'delt-1') && (hh % 3 !== 0)) R.set(xt, yt, mix(R.col[yt][xt], INKR[1], 0.62));
      var tz = L.tattoo, inkOn1 = function(){ R.set(xt, yt, mix(R.col[yt][xt], INKR[1], 0.6)); };
      if (tz === 'full' && /^(upper|fore|delt|leg)/.test(nt || '') && hh % 3 !== 0) inkOn1();
      if (tz === 'full' && nt === 'torso' && Math.abs(xt + 0.5 - CX) > 1.4 && yt > shY + 1 && yt < wsY - 2 && hh % 3 === 0) inkOn1();
      if (tz === 'tribal' && (nt === 'upper-1' || nt === 'delt-1' || nt === 'fore-1') && ((xt + yt) % 3 === 0 || (xt - yt + 99) % 4 === 0)) R.set(xt, yt, mix(R.col[yt][xt], INKR[0], 0.82));
      if (tz === 'neck' && nt === 'neck' && hh % 2) inkOn1();
      if (tz === 'barbwire' && nt === 'upper1' && Math.abs(yt - (arm[1].sh[1] + arm[1].el[1]) / 2) < 1.2 && (xt + yt) % 2) R.set(xt, yt, mix(R.col[yt][xt], INKR[0], 0.8));
      if (tz === 'leg' && nt === 'leg1' && yt > leg[1].hip[1] + 2 && yt < leg[1].knee[1] - 1 && hh % 3 !== 0) inkOn1();
      if (tz === 'back' && (nt === 'delt1' || (nt === 'upper1' && yt < shY + 3)) && hh % 2) inkOn1();
      if (tz === 'glyph' && nt === 'torso') { var gx = Math.floor(xt + 0.5 - CX + 5), gy = Math.floor(yt - shY - 2);
        var GL = ['111', '010', '111', '101', '111']; if (gx >= 0 && gx < 3 && gy >= 0 && gy < 5 && GL[gy][gx] === '1') R.set(xt, yt, mix(R.col[yt][xt], INKR[0], 0.75)); }
      if ((L.tattoo === 'chest' || L.tattoo === 'both') && nt === 'torso' && Math.abs(xt + 0.5 - CX - 3.6) < 2.4 && yt > shY + 1 && yt < shY + 6 && hh % 2) R.set(xt, yt, mix(R.col[yt][xt], INKR[1], 0.55));
    }
  }
  /* the mask's trim: rings round the eyes, a crest up the middle */
  if (FULLM || L.mask === 'phantom') {
    var mk = L.mask, DK = '#17141b', AMB = ramp('#e7b52c', 30);
    for (var ym = hy - 1; ym < hy + 14; ym++) for (var xm = 0; xm < W; xm++) {
      if (at(xm, ym) !== 'mask') continue;
      var dx = xm + 0.5 - CX, dy = ym - hy, ad = Math.abs(dx), lv = R.lev[ym][xm], hq = cellHash(xm, ym);
      var eyeL = Math.abs(dx + 3.2) < 2.4, eyeR = Math.abs(dx - 2.8) < 2.4, eyeRow = dy >= 6 && dy <= 8, eye = eyeRow && (eyeL || eyeR);
      var mouth = dy >= 10 && dy <= 11 && ad < 1.8;
      if (mk === 'lucha') {
        if (eye) R.set(xm, ym, TR[dx < 0 ? 3 : 2]);
        if (ad < 0.8 && dy < 6) R.set(xm, ym, TR[2]);
        if (dy === 4 && ad > 1 && ad < 4.6) R.set(xm, ym, TR[1]);
      } else if (mk === 'hood') { if (eye && dy === 7) R.set(xm, ym, DK); }
      else if (mk === 'demon') { if (eye) R.set(xm, ym, GEM[dx < 0 ? 3 : 2]); if (ad < 0.8 && dy < 6) R.set(xm, ym, TR[1]); if (mouth && xm % 2) R.set(xm, ym, '#f3efe6'); }
      else if (mk === 'tiger') { if (!eye && ad > 1.2 && (dy + Math.floor(ad)) % 3 === 0 && dy < 10) R.set(xm, ym, mix(R.col[ym][xm], INK, 0.7)); if (eye) R.set(xm, ym, TR[3]); }
      else if (mk === 'skull') { if (eyeRow && (Math.abs(dx + 3.1) < 1.9 || Math.abs(dx - 2.7) < 1.9)) R.set(xm, ym, DK); if (dy === 9 && Math.abs(dx + 0.2) < 1.2) R.set(xm, ym, DK); if (dy === 11 && ad < 2.4) R.set(xm, ym, xm % 2 ? DK : MK[3]); }
      else if (mk === 'phantom') { if (eyeRow && eyeL) R.set(xm, ym, DK); if (Math.abs(dx) < 0.9) R.set(xm, ym, MK[1]); }
      else if (mk === 'jaguar') { if (!eye && hq % 7 === 0) R.set(xm, ym, mix(R.col[ym][xm], INK, 0.65)); if (dy >= 9 && ad < 2.6) R.set(xm, ym, TR[Math.min(4, lv + 1)]); if (eye) R.set(xm, ym, TR[2]); }
      else if (mk === 'wolf') { if (dy >= 9 && ad < 3) R.set(xm, ym, MK[Math.min(4, lv + 1)]); if (eye) R.set(xm, ym, TR[2]); }
      else if (mk === 'insect') { if (eyeRow && (eyeL || eyeR)) R.set(xm, ym, AMB[dx < 0 ? 4 : 2]); if ((dy === 2 || dy === 4) && ad < 4.6) R.set(xm, ym, TR[1]); }
      else if (mk === 'bull') { if (eye) R.set(xm, ym, TR[2]); if (dy >= 10 && ad < 2.2) R.set(xm, ym, MK[0]); }
      else if (mk === 'crow') { if (eye) R.set(xm, ym, GEM[2]); if (dy >= 8 && dy <= 12 && ad < (dy - 7) * 0.55) R.set(xm, ym, BONE[Math.min(4, lv)]); }
      else if (mk === 'dragon') { if (!eye && (xm + (ym & 1)) % 3 === 0) R.level(xm, ym, lv - 1); if (eye) R.set(xm, ym, TR[3]); }
      if (mouth && mk !== 'skull' && mk !== 'demon' && mk !== 'phantom' && mk !== 'crow' && mk !== 'bull' && mk !== 'hood') R.set(xm, ym, SK[1]);
    }
  }
  if (L.mask === 'samurai') for (var ys2 = hy + 9; ys2 < hy + 14; ys2++) for (var xs2 = 0; xs2 < W; xs2++) {
    if (at(xs2, ys2) !== 'mask') continue;
    if (ys2 === hy + 10) R.set(xs2, ys2, TR[2]); else if (ys2 >= hy + 12 && xs2 % 2) R.level(xs2, ys2, R.lev[ys2][xs2] - 1);
  }
  if (L.mask === 'half') {
    for (var yh = hy + 2; yh < hy + 9; yh++) for (var xh = 0; xh < W; xh++) {
      if (at(xh, yh) !== 'mask') continue;
      var dxh = xh + 0.5 - CX;
      if (yh === hy + 2 || yh === hy + 8) R.set(xh, yh, TR[2]);
      if (yh - hy >= 6 && yh - hy <= 7 && (Math.abs(dxh + 3.2) < 2.2 || Math.abs(dxh - 2.8) < 2.2)) R.set(xh, yh, TR[1]);
    }
  }

  /* the face (hoops rows, shifted to this head) */
  var dark = '#16110e', white = '#f3efe6';
  var ex = function(dx){ return Math.floor(CX) + dx; };
  var brow = L.hair === 'bald' || L.hc === 5 ? SK[0] : mix(HR[0], SK[0], 0.2);
  var browL = L.mood === 'scowl' ? [hy + 6, hy + 5, hy + 5] : L.mood === 'grin' ? [hy + 4, hy + 5, hy + 5] : [hy + 5, hy + 5, hy + 5];
  if (!FULLM) {
    [-5, -4, -3].forEach(function(dx, i){ R.set(ex(dx), browL[2 - i], brow); });
    [2, 3, 4].forEach(function(dx, i){ R.set(ex(dx), browL[i], brow); });
  }
  [-4, -3, 2, 3].forEach(function(dx){ if (at(ex(dx), hy + 6) === 'head') R.set(ex(dx), hy + 6, SK[1]); });
  if (fem) { R.set(ex(-5), hy + 6, dark); R.set(ex(4), hy + 6, dark); }
  R.set(ex(-4), hy + 7, white); R.set(ex(-3), hy + 7, dark); R.set(ex(2), hy + 7, dark); R.set(ex(3), hy + 7, white);
  if (L.shades) { [-5, -4, -3, -2, 1, 2, 3, 4].forEach(function(dx){ R.set(ex(dx), hy + 7, dx === -5 || dx === 1 ? '#3b4252' : '#11141b'); R.set(ex(dx), hy + 6, '#11141b'); }); R.set(ex(-1), hy + 6, '#11141b'); R.set(ex(0), hy + 6, '#11141b'); }
  R.set(ex(-1), hy + 7, SK[3]); R.set(ex(-1), hy + 8, SK[3]); R.set(ex(0), hy + 8, SK[1]);
  R.set(ex(-1), hy + 9, SK[0]); R.set(ex(0), hy + 9, SK[0]); R.set(ex(-2), hy + 9, SK[1]);
  if (L.mood === 'grin') { [-2, -1, 0, 1].forEach(function(dx){ R.set(ex(dx), hy + 11, dx === -2 || dx === 1 ? mix(SK[0], dark, 0.3) : white); }); R.set(ex(-3), hy + 10, SK[0]); R.set(ex(2), hy + 10, SK[0]); }
  else if (L.mood === 'scowl') { [-2, -1, 0, 1].forEach(function(dx){ R.set(ex(dx), hy + 11, mix(SK[0], dark, 0.45)); }); R.set(ex(-3), hy + 12, SK[0]); R.set(ex(2), hy + 12, SK[0]); }
  else { R.set(ex(-2), hy + 11, SK[0]); R.set(ex(-1), hy + 11, mix(SK[0], dark, 0.35)); R.set(ex(0), hy + 11, mix(SK[0], dark, 0.35)); R.set(ex(1), hy + 11, SK[0]); }
  R.set(ex(-1), hy + 12, SK[3]);
  if (L.facial === 'stache' || L.facial === 'beard' || L.facial === 'longbeard' || L.facial === 'goatee' || L.facial === 'handlebar') {
    for (var mx2 = -3; mx2 <= 2; mx2++) if (L.facial !== 'goatee' || Math.abs(mx2 + 0.5) < 2) R.set(ex(mx2), hy + 10, BR[mx2 < 0 ? 2 : 1]);
  }
  if (L.facial === 'handlebar') { R.set(ex(-4), hy + 10, BR[2]); R.set(ex(3), hy + 10, BR[1]); R.set(ex(-5), hy + 9, BR[2]); R.set(ex(4), hy + 9, BR[1]); }
  if (L.facial === 'soul') { R.set(ex(-1), hy + 12, BR[1]); R.set(ex(0), hy + 12, BR[1]); }
  if (L.acc === 'visor') [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4].forEach(function(dx){ R.set(ex(dx), hy + 6, '#16323d'); R.set(ex(dx), hy + 7, dx < -2 ? '#7fe3f2' : '#2b8fa6'); });
  if (L.acc === 'chain' || L.acc === 'necklace') {
    for (var cxp = -4; cxp <= 4; cxp++) { var cy = Math.floor(shY + 1 + (4 - Math.abs(cxp)) * (L.acc === 'chain' ? 0.75 : 0.6));
      if (at(ex(cxp), cy) === 'torso' || at(ex(cxp), cy) === 'top') R.set(ex(cxp), cy, L.acc === 'chain' ? GOLD[(cxp & 1) ? 3 : 1] : GOLD[2]); }
    if (L.acc === 'necklace') { R.set(ex(0), Math.floor(shY + 4), GEM[2]); R.set(ex(-1), Math.floor(shY + 4), GEM[3]); }
  }
  if (L.mask === 'samurai') for (var ysm = hy + 2; ysm <= hy + 3; ysm++) for (var xsm = 0; xsm < W; xsm++) if (at(xsm, ysm) === 'head' || /^hair/.test(at(xsm, ysm) || '')) R.set(xsm, ysm, TR[ysm === hy + 2 ? 3 : 1]);
  if (L.facial === 'stubble') {
    for (var ys = hy + 8; ys <= hy + 13; ys++) for (var xs = 0; xs < W; xs++) {
      if (at(xs, ys) !== 'head') continue;
      var ads = Math.abs(xs + 0.5 - CX);
      if ((ys >= hy + 10 || ads > 4.4) && (xs + ys) % 2 === 0 && !(ys === hy + 11 && ads < 2.2)) R.set(xs, ys, mix(R.col[ys][xs], BR[1], 0.5));
    }
  }
  /* face paint, over the skin only */
  if (L.paint !== 'none' && !FULLM) {
    var PNT = L.paint === 'skull' ? ramp('#ecebe6') : L.paint === 'venom' ? ramp('#3a1a4a') : L.paint === 'crimson' ? ramp('#a21d22') : L.paint === 'scar' ? ramp(mix(skinHex, '#c4505a', 0.45)) : ramp(L.trim);
    for (var yq = hy; yq < hy + 14; yq++) for (var xq = 0; xq < W; xq++) {
      if (at(xq, yq) !== 'head') continue;
      var dq = xq + 0.5 - CX, rq = yq - hy, cur = R.col[yq][xq];
      if (cur === white || cur === dark) continue;
      if (L.paint === 'bars' && (rq === 8 || rq === 9) && Math.abs(dq) > 1.5 && Math.abs(dq) < 5) R.set(xq, yq, PNT[rq === 8 ? 2 : 1]);
      if (L.paint === 'split' && dq < 0) R.set(xq, yq, PNT[Math.min(4, R.lev[yq][xq])]);
      if (L.paint === 'star' && Math.abs(dq - 2.6) + Math.abs(rq - 7) * 0.8 < 2.6 && !(Math.abs(dq - 2.6) < 1 && rq === 7)) R.set(xq, yq, PNT[2]);
      if (L.paint === 'tribal' && dq < -0.6 && rq >= 3 && rq <= 12 && ((xq + yq) % 3 === 0 || (rq === 9 && dq < -2))) R.set(xq, yq, PNT[0]);
      if (L.paint === 'cross' && ((Math.abs(dq + 0.2) < 0.9 && rq >= 1 && rq <= 12) || (rq === 4 && Math.abs(dq) < 4.2))) R.set(xq, yq, PNT[1]);
      if (L.paint === 'visor' && rq >= 6 && rq <= 8) R.set(xq, yq, PNT[rq === 6 ? 3 : 1]);
      if (L.paint === 'venom' && (((rq >= 5 && rq <= 8) && (Math.abs(dq + 3.1) < 2.4 || Math.abs(dq - 2.7) < 2.4)) || (rq >= 9 && rq <= 10 && (Math.abs(dq + 3.6) < 0.6 || Math.abs(dq - 3.2) < 0.6)))) R.set(xq, yq, PNT[1]);
      if (L.paint === 'scar' && rq >= 4 && rq <= 10 && Math.abs((dq + 3.0) - (rq - 7) * 0.45) < 0.55) R.set(xq, yq, PNT[1]);
      if (L.paint === 'crimson' && rq >= 3 && rq <= 5 + (xq % 4) * 1.5 && (xq % 3 === 0 || (rq < 5 && Math.abs(dq) < 3))) R.set(xq, yq, PNT[rq < 5 ? 2 : 1]);
      if (L.paint === 'skull') {
        var sock = (rq >= 6 && rq <= 8) && (Math.abs(dq + 3.1) < 1.9 || Math.abs(dq - 2.7) < 1.9);
        var nose = rq === 9 && Math.abs(dq + 0.2) < 1.2;
        var teeth = rq === 11 && Math.abs(dq + 0.3) < 2.4;
        R.set(xq, yq, sock || nose ? '#17141b' : teeth ? (xq % 2 ? '#17141b' : PNT[3]) : PNT[Math.min(4, R.lev[yq][xq])]);
      }
    }
  }

  /* hair texture */
  for (var y7 = 0; y7 < H; y7++) for (var x8 = 0; x8 < W; x8++) {
    var n7 = at(x8, y7);
    if (!n7 || !/^hair|^knot/.test(n7) || n7 === 'hairf') continue;
    var lv = R.lev[y7][x8], h7 = (((x8 * 73856093) ^ (y7 * 19349663)) >>> 0) % 7;
    if (hs === 'frosted' && y7 < hy + 1) { R.set(x8, y7, lv > 1 ? '#f4ead0' : '#cdbd93'); continue; }
    if (hs === 'flames' && y7 < hy) { R.set(x8, y7, y7 < hy - 2 ? '#ffd34a' : '#ff9a2e'); continue; }
    if (hs === 'braids') { if ((x8 + y7) % 3 === 0) R.level(x8, y7, lv - 1); else if ((x8 - y7 + 99) % 3 === 0) R.level(x8, y7, lv + 1); continue; }
    if (hb === 'afro') { if (h7 === 0) R.level(x8, y7, lv + 1); else if (h7 === 3 || h7 === 5) R.level(x8, y7, lv - 1); }
    else if (hb === 'dreads') { if (x8 % 2) R.level(x8, y7, lv - 1); else if (y7 % 3 === 0) R.level(x8, y7, lv + 1); }
    else if (hb === 'long' || hb === 'mullet' || hb === 'pony') { if (x8 % 2 === 0 && y7 > hy + 3) R.level(x8, y7, lv - 1); }
    else if (hb === 'slick') { if ((x8 + y7) % 4 === 0) R.level(x8, y7, lv + 1); }
    else { if ((x8 * 3 + y7 * 5) % 7 === 0) R.level(x8, y7, lv + 1); else if ((x8 + y7 * 2) % 5 === 0) R.level(x8, y7, lv - 1); }
  }
  for (var x9 = 0; x9 < W; x9++) for (var y9 = hy + 1; y9 < hy + 8; y9++) {
    var up = at(x9, y9 - 1);
    if (at(x9, y9) === 'head' && up && /^hair/.test(up) && up !== 'hairf') R.level(x9, y9, R.lev[y9][x9] - 1);
  }
  /* knuckles on a closed fist, the gold's shine */
  [-1, 1].forEach(function(s){
    var A = arm[s], fy = Math.floor(A.fist[1] + (pose === 'idle' ? 1.0 : -0.8));
    for (var xk = Math.floor(A.fist[0] - 1); xk <= Math.floor(A.fist[0] + 1); xk++) if (at(xk, fy) === 'fist' + s && (xk + fy) % 2) R.level(xk, fy, 0);
  });
  ['plate', 'splate', 'rplate'].forEach(function(nm){
    for (var yg = 0; yg < H; yg++) for (var xg = 0; xg < W; xg++) if (at(xg, yg) === nm && at(xg - 1, yg) !== nm && at(xg, yg - 1) === nm) { R.set(xg + 1, yg, GOLD[4]); return; }
  });

  /* ── the breath: everything above the knees drops a cell ── */
  if (o.frame === 1) {
    var kneeRow = Math.floor(knY) - 1;
    for (var fy2 = kneeRow; fy2 >= 1; fy2--) { R.pid[fy2] = R.pid[fy2 - 1].slice(); R.col[fy2] = R.col[fy2 - 1].slice(); }
    R.pid[0] = new Array(W).fill(-1); R.col[0] = new Array(W).fill(null);
  }
  if (o.parts) return R.pid.map(function(r){ return r.map(function(p){ return p < 0 ? null : R.parts[p].name; }); });

  /* ── a line where a part in front meets the part behind (hoops pass) ── */
  var out = grid();
  var dirs = [[-1, 0, 0], [0, -1, 0], [1, 0, 1], [0, 1, 1]];
  for (var y13 = 0; y13 < H; y13++) for (var x13 = 0; x13 < W; x13++) {
    var p = R.pid[y13][x13];
    if (p < 0) continue;
    var me = R.parts[p], c = R.col[y13][x13];
    for (var k = 0; k < 4; k++) {
      var qx = x13 + dirs[k][0], qy = y13 + dirs[k][1];
      if (qx < 0 || qx >= W || qy < 0 || qy >= H) continue;
      var q = R.pid[qy][qx];
      if (q <= p) continue;
      var them = R.parts[q];
      if (!them.line || them.group === me.group) continue;
      c = me.ramp[dirs[k][2] ? 1 : 0];
      if (!dirs[k][2]) break;
    }
    out[y13][x13] = c;
  }
  /* ── the outline: a dark shade of what it borders (hoops pass) ── */
  var fin = grid();
  var probe = [[1, 0, true], [0, 1, true], [-1, 0, false], [0, -1, false]];
  for (var y14 = 0; y14 < H; y14++) for (var x14 = 0; x14 < W; x14++) {
    if (out[y14][x14]) { fin[y14][x14] = out[y14][x14]; continue; }
    var nbr = null, litSide = false;
    for (var k2 = 0; k2 < 4; k2++) {
      var ax = x14 + probe[k2][0], ay = y14 + probe[k2][1];
      if (ax < 0 || ax >= W || ay < 0 || ay >= H || R.pid[ay][ax] < 0) continue;
      if (!nbr || probe[k2][2]) { nbr = R.parts[R.pid[ay][ax]]; litSide = probe[k2][2]; }
    }
    if (nbr) fin[y14][x14] = mix(nbr.ramp[0], INK, litSide ? 0.5 : 0.76);
  }
  /* ── the aura: loose pixels round the silhouette, a halo over the head ── */
  var AC = AURA_COL[L.aura];
  if (AC) {
    var near = function(x, y, r){ for (var j = -r; j <= r; j++) for (var i = -r; i <= r; i++) { var xx = x + i, yy = y + j; if (xx >= 0 && xx < W && yy >= 0 && yy < H && R.pid[yy][xx] >= 0) return true; } return false; };
    for (var ya = 1; ya < H - 1; ya++) for (var xa = 1; xa < W - 1; xa++) {
      if (fin[ya][xa]) continue;
      if (L.aura === 'halo') { var hx = (xa + 0.5 - CX) / 6.2, hyv = (ya + 0.5 - (hy - 2.6)) / 1.5, rr = hx * hx + hyv * hyv; if (rr > 0.55 && rr < 1.25) fin[ya][xa] = AC[ya < hy - 2.6 ? 1 : 0]; continue; }
      if (L.aura === 'pyro' && ya < SOLE - 12) continue;
      if (!near(xa, ya, 2)) continue;
      var ha = cellHash(xa, ya, (o.frame || 0) + 7), dense = (L.aura === 'smoke' || L.aura === 'void') ? (ya > shY ? 3 : 5) : 6;
      if (ha % dense === 0) fin[ya][xa] = AC[(ha >> 3) & 1];
    }
  }
  return fin;
}

/* ─── to the screen (the hoops pipeline) ──────────────────────────────── */

var CACHE = {}, KEYS = [];
function keyOf(look, o){ return JSON.stringify([normal(look), o.pose, o.age || 0, o.frame || 0, o.scale || 4, o.shadow !== false, !!o.flip]); }
function canvas(look, opts){
  var o = opts || {};
  var s = Math.max(1, Math.round(o.scale || 4));
  var cv = document.createElement('canvas');
  cv.width = W * s; cv.height = H * s;
  var ctx = cv.getContext('2d');
  if (o.shadow !== false) {
    ctx.fillStyle = 'rgba(0,0,0,.30)';
    ctx.beginPath(); ctx.ellipse(CX * s, (SOLE + 1.1) * s, 13 * s, 1.5 * s, 0, 0, Math.PI * 2); ctx.fill();
  }
  var g = paint(look, o);
  for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
    var c = g[y][o.flip ? W - 1 - x : x];
    if (!c) continue;
    ctx.fillStyle = c;
    ctx.fillRect(x * s, y * s, s, s);
  }
  return cv;
}
function url(look, opts){
  var o = opts || {}, k = keyOf(look, o);
  if (CACHE[k]) return CACHE[k];
  var u = canvas(look, o).toDataURL('image/png');
  CACHE[k] = u; KEYS.push(k);
  if (KEYS.length > 400) delete CACHE[KEYS.shift()];
  return u;
}
function img(look, opts, cls){
  var o = Object.assign({}, opts || {});
  o.frame = 0;
  var a = url(look, o), still = !!o.still, b = still ? a : url(look, Object.assign({}, o, { frame: 1 }));
  var s = o.scale || 4;
  return '<img class="rtr-px' + (cls ? ' ' + cls : '') + '" src="' + a + '"' + (still ? '' : ' data-b0="' + a + '" data-b1="' + b + '"')
    + ' width="' + (W * s) + '" height="' + (H * s) + '" alt="" draggable="false">';
}
var timer = null, flip = 0;
function breathe(){
  if (timer || typeof window === 'undefined') return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches) return;
  timer = setInterval(function(){
    flip ^= 1;
    var list = document.querySelectorAll('img.rtr-px[data-b0]');
    for (var i = 0; i < list.length; i++) list[i].src = list[i].getAttribute(flip ? 'data-b1' : 'data-b0');
    var ims = document.querySelectorAll('image.rtr-px[data-b0]');
    for (var j = 0; j < ims.length; j++) ims[j].setAttribute('href', ims[j].getAttribute(flip ? 'data-b1' : 'data-b0'));
  }, 720);
}


/* ─── the game's saved looks ──────────────────────────────────────────
   The career game stores looks in its own older shape (hex skin and hair,
   one attire, one accessory, and so on) and every cosmetic a player owns is
   keyed on those ids. Nothing is rewritten in a save: the old look is read
   here, at draw time, into the closest new look. So an owned item can never
   be lost to a conversion, and a value with no pixel version yet falls back
   to its nearest neighbour until one is drawn. DESIGN.md section 10. */
function nearest(hex, list, get){
  var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '')); if (!m) return -1;
  var n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255, best = -1, bd = 1e9;
  list.forEach(function(it, i){
    var q = parseInt(get(it).slice(1), 16), d = Math.pow(r - (q >> 16), 2) + Math.pow(g - ((q >> 8) & 255), 2) + Math.pow(b - (q & 255), 2);
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}
var LEG = {
  facial: { beard: 'beard', stache: 'stache', goatee: 'goatee', fullbeard: 'longbeard', mutton: 'mutton', handlebar: 'handlebar', soul: 'soul' },
  paint: { warrior: 'bars', eyeblack: 'bars', tribal: 'tribal', visorpaint: 'visor', skull: 'skull', venom: 'venom', halfpaint: 'split',
    crossface: 'cross', scar: 'scar', bloodied: 'crimson' },
  mask: { lucha: 'lucha', half: 'half', hood: 'hood', demon: 'demon', tiger: 'tiger', skullmask: 'skull', phantom: 'phantom', jaguar: 'jaguar',
    wolf: 'wolf', insect: 'insect', bull: 'bull', crow: 'crow', dragon: 'dragon', samurai: 'samurai' },
  boots: { tall: 'tall', short: 'low', pads: 'kick', wraps: 'wraps', barefoot: 'wraps', sneak: 'sneaks', hightop: 'hightop', platform: 'platform',
    goldboot: 'tall', combat: 'combat', cowboy: 'cowboy', steel: 'steel', spiked: 'spiked' },
  tattoo: { sleeve: 'sleeve', chest: 'chest', full: 'full', tribalink: 'tribal', barbwire: 'barbwire', neck: 'neck', kanji: 'glyph', leg: 'leg', back: 'back' },
  acc: { chain: 'chain', necklace: 'necklace', bandana: 'bandana', visor: 'visor', facemask: 'facemask', scarf: 'scarf', towel: 'towel',
    armband: 'armband', tassels: 'tassels', armorpad: 'armorpad', spikes: 'spikes', feather: 'plume', crown: 'crown', wings: 'wings' },
  build: { lean: 'cruiser', athletic: 'athletic', heavy: 'heavy' },
};
function fromLegacy(L){
  L = L || {};
  if (L.v === 2) return normal(L);                    // already a new look
  var o = {}, a = L.attire || 'trunks', acc = L.acc || '';
  o.build = BODY[L.build] ? L.build : (LEG.build[L.build] || 'athletic');
  o.figure = L.figure === 'f' ? 'f' : 'm';
  var si = nearest(L.skin, SKINS, function(x){ return x; }); o.skin = si < 0 ? DEFAULT.skin : si;
  var hi = nearest(L.hair, HAIR_COLORS, function(x){ return x[1]; }); o.hc = hi < 0 ? 0 : hi;
  o.hair = ids(HAIRS).indexOf(L.hairStyle) >= 0 ? L.hairStyle : 'short';
  var f = L.face || 'none';
  o.facial = LEG.facial[f] || 'none';
  o.paint = LEG.paint[f] || 'none';
  o.mask = LEG.mask[L.mask] || 'none';
  o.bottom = 'trunks'; o.top = 'none'; o.entrance = 'none';
  if (['trunks', 'tights', 'singlet', 'shorts', 'chaps'].indexOf(a) >= 0) o.bottom = a;
  else if (a === 'tank' || a === 'crop' || a === 'sash' || a === 'harness') o.top = a;
  else if (['jacket', 'robe', 'vest', 'duster', 'hoodie'].indexOf(a) >= 0) o.entrance = a;
  else if (a === 'bodysuit') { o.bottom = 'tights'; o.top = 'suit'; }
  else if (a === 'armor') { o.bottom = 'tights'; o.top = 'armor'; }
  else if (a === 'gi') { o.bottom = 'pants'; o.top = 'gi'; }
  else if (a === 'ref') { o.bottom = 'pants'; o.top = 'tee'; }
  o.boots = LEG.boots[L.boots] || 'tall';
  if (L.boots === 'goldboot') o.bootc = '#e0b341';
  o.wrists = acc === 'gloves' ? 'gloves' : acc === 'wrist' ? 'tape' : 'none';
  o.elbows = acc === 'elbow' ? 'pad' : 'none';
  o.knees = acc === 'knee' ? 'pads' : 'none';
  o.shades = acc === 'shades';
  if (acc === 'cape' && o.entrance === 'none') o.entrance = 'cape';
  o.belt = acc === 'belt' ? 'waist' : 'none';
  o.acc = LEG.acc[acc] || 'none';
  o.tattoo = LEG.tattoo[L.tattoo] || 'none';
  o.pattern = L.pattern || 'solid';
  o.aura = L.aura && L.aura !== 'none' ? L.aura : f === 'mist' ? 'smoke' : 'none';       // the mist spray is an effect round the figure now
  o.gear = L.gear; o.trim = L.trim;
  if (a === 'ref') { o.gear = '#23232b'; o.trim = '#f4e8db'; o.pattern = 'solid'; }
  o.mood = L.mood || 'neutral';
  return normal(o);
}

/* The game's call sites pass a frame and one of its own pose names, and lay
   the result out in a fixed SVG box per frame. This keeps every one of them
   working: the same box, with the sprite placed in it. */
var GAME_POSE = { stand: 'idle', ready: 'stance', guard: 'stance', run: 'stance', runBack: 'stance', grapple: 'stance', lockup: 'stance',
  strike: 'point', wind: 'stance', chop: 'point', clothes: 'point', kick: 'stance', bigboot: 'stance', stomp: 'stance', lift: 'raise', carry: 'raise',
  press: 'raise', held: 'idle', vert: 'idle', climb: 'raise', kneel: 'stance', taunt: 'point', torso: 'flex', celebrate: 'raise', point: 'point',
  stagger: 'idle', reel: 'idle', corner: 'idle', whip: 'point', ropes: 'stance', raised: 'raise', dive: 'raise', splash: 'idle',
  refIdle: 'idle', refWatch: 'stance', refUp: 'raise', refDown: 'point', refNo: 'point', refRaise: 'raise' };
var LYING = { prone: 1, proneUp: 1, pin: 1, submit: 1, bridge: 1, splash: 1, held: 0 };
var BOX = { head: [17, -7, 30, 36], legs: [14, 40, 36, 50], wide: [-24, -14, 112, 118], full: [-6, -8, 76, 104] };
var K = 1.55, OX = 32 - CX * K, OY = 89 - SOLE * K;   // the old figure stood at x 32, soles on y 89, crown near y 1; at 1.55 a raised fist still clears the top of the full box
function svg(L, opt){
  opt = opt || {};
  var look = fromLegacy(L);
  if (opt.belt && opt.belt.carry) look.belt = opt.belt.carry === 'shoulder' ? 'shoulder' : 'waist';
  var gp = opt.pose || 'stand', pose = GAME_POSE[gp] || (POSES.indexOf(gp) >= 0 ? gp : 'idle');
  if (opt.belt && opt.belt.carry === 'hand') pose = 'raise';
  var lying = !!LYING[gp];
  var box = opt.frame === 'head' ? BOX.head : opt.frame === 'legs' ? BOX.legs : (opt.frame === 'action' || lying) ? BOX.wide : BOX.full;
  var o = { pose: pose, scale: 2, shadow: opt.frame !== 'head' && !lying, flip: !!opt.flip };
  var a = url(look, o), b = opt.still ? a : url(look, Object.assign({}, o, { frame: 1 }));
  var w = W * K, h = H * K, tf = lying ? ' transform="rotate(-90 32 ' + (OY + h * 0.62).toFixed(1) + ')"' : '';
  var t = opt.title ? '<title>' + String(opt.title).replace(/[<>&"]/g, '') + '</title>' : '';
  return '<svg viewBox="' + box.join(' ') + '" xmlns="http://www.w3.org/2000/svg" class="pxfig">' + t
    + '<image class="rtr-px" href="' + a + '"' + (opt.still ? '' : ' data-b0="' + a + '" data-b1="' + b + '"')
    + ' x="' + OX.toFixed(2) + '" y="' + OY.toFixed(2) + '" width="' + w.toFixed(2) + '" height="' + h.toFixed(2) + '"'
    + ' preserveAspectRatio="none" style="image-rendering:pixelated"' + tf + '/></svg>';
}

var API = {
  W: W, H: H, SOLE: SOLE, POSES: POSES, BODY: BODY, DEFAULT: DEFAULT, LISTS: LISTS,
  SKINS: SKINS, HAIR_COLORS: HAIR_COLORS, FIGURES: FIGURES,
  normal: normal, hash: hash, ramp: ramp, mix: mix, contrast: contrast, inkOn: inkOn,
  paint: paint, canvas: canvas, url: url, img: img, breathe: breathe,
  fromLegacy: fromLegacy, svg: svg,
};
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') { window.RTR_PX = API; breathe(); }
})();
