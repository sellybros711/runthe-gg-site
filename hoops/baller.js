/* Run The Floor: the player, drawn.
 *
 * Run The Tour draws its golfer as a pixel grid painted in his own colours,
 * and this is that idea arriving at a basketball career: one invented man on a
 * 44 by 64 grid, in the colours of whoever he plays for, with the number he
 * picked on his chest. window.RTF_BALLER, and node can require it for the
 * tables (drawing needs a canvas, so node only reads the options).
 *
 * THE LOOK IS A FEW SHORT VALUES AND THIS FILE IS THE ONLY READER OF THEM.
 * career.js keeps them on the life through a whitelist and knows nothing
 * else, so a look from another device, an old save or a hand edit is always
 * drawable: anything this file does not recognise falls back to a default
 * rather than to a blank. normal() is that rule, written once.
 *
 * ONLY THE INVENTED ARE DRAWN. The player and his draft-class rival are made
 * up, so they have faces. A real NBA player is never drawn here, and nobody
 * on a real roster gets a look hashed from his name: the line career.js holds
 * for storylines, held for pictures too.
 *
 * IT IS BUILT THE WAY A SPRITE ARTIST BUILDS ONE, and the rig section below
 * says how. The first version painted rectangles in flat colours and ringed
 * them in black, which reads as a diagram of a man: a box torso, two-pixel
 * sticks for arms, a square head. Reported as looking poorly made, and it was.
 */
(function(){
'use strict';

var W = 44, H = 64;

/* ─── what can be chosen ──────────────────────────────────────────────── */

var SKINS = ['#f6d6bb', '#efc39f', '#dfa77d', '#c88c60', '#aa6f45', '#8b5735', '#6c4027', '#4b2c19'];
var HAIR_COLORS = [
  ['black', '#1b1714'], ['darkbrown', '#3b2618'], ['brown', '#6a4425'], ['auburn', '#8a3b1d'],
  ['blonde', '#d6b05a'], ['platinum', '#e6e0cc'], ['red', '#c2302f'], ['blue', '#3a6fd8'],
];
var HAIRS = [
  ['fade', 'Fade'], ['buzz', 'Buzz'], ['afro', 'Afro'], ['twists', 'Twists'], ['braids', 'Cornrows'],
  ['flattop', 'Flat top'], ['curly', 'Curly top'], ['bun', 'Bun'], ['long', 'Long'], ['bald', 'Bald'],
];
var BEARDS = [['none', 'Clean'], ['stubble', 'Stubble'], ['goatee', 'Goatee'], ['full', 'Full']];
var BANDS = [['none', 'None'], ['white', 'White'], ['black', 'Black'], ['club', 'Team'], ['red', 'Red']];
var SLEEVES = [['none', 'None'], ['white', 'White'], ['black', 'Black'], ['club', 'Team']];
var SHOES = [['white', 'White'], ['black', 'Black'], ['club', 'Team'], ['red', 'Red'], ['gold', 'Gold']];
var BUILDS = [['lean', 'Lean'], ['standard', 'Standard'], ['strong', 'Muscular']];
/* How each build is put together, read by the skeleton, the model and
   handAt alike. bw widens the shoulders and chest, am thickens the limbs, dl
   is the deltoid's radius. Standard and Lean are a basketball body: long and
   narrow. Only Muscular carries the broad shoulders and the round delts. The
   id stays 'strong' because it is in saves; only the label changed. */
var BODY = { lean: { bw: -1.5, am: -0.42, dl: 1.45 }, standard: { bw: -0.95, am: -0.26, dl: 1.65 }, strong: { bw: 0.1, am: 0.06, dl: 2.2 } };
function bodyOf(b){ return BODY[b] || BODY.standard; }
var FACELESS = '#4a5266';
var FIXED = { white: '#f2f2f0', black: '#1d1f24', red: '#d13a32', gold: '#e8b33c' };

function ids(list){ return list.map(function(x){ return x[0]; }); }
var DEFAULT = { skin: 3, hair: 'fade', hc: 0, beard: 'none', band: 'none', sleeve: 'none', shoes: 'white', build: 'standard' };

/* Anything unrecognised falls back to the default for that one key. */
function normal(look){
  var o = look || {}, out = {};
  out.skin = Number.isFinite(+o.skin) ? Math.max(0, Math.min(SKINS.length - 1, Math.round(+o.skin))) : DEFAULT.skin;
  out.hc = Number.isFinite(+o.hc) ? Math.max(0, Math.min(HAIR_COLORS.length - 1, Math.round(+o.hc))) : DEFAULT.hc;
  out.hair = ids(HAIRS).indexOf(o.hair) >= 0 ? o.hair : DEFAULT.hair;
  out.beard = ids(BEARDS).indexOf(o.beard) >= 0 ? o.beard : DEFAULT.beard;
  /* facial hair colour, chosen apart from the hair; -1 (or absent) is the
     natural colour that goes with the hair, which is what every look had before */
  out.bc = o.bc != null && o.bc !== '' && Number.isFinite(+o.bc) && +o.bc >= 0 && +o.bc < HAIR_COLORS.length ? Math.round(+o.bc) : -1;
  out.band = ids(BANDS).indexOf(o.band) >= 0 ? o.band : DEFAULT.band;
  out.sleeve = ids(SLEEVES).indexOf(o.sleeve) >= 0 ? o.sleeve : DEFAULT.sleeve;
  out.shoes = ids(SHOES).indexOf(o.shoes) >= 0 ? o.shoes : DEFAULT.shoes;
  out.build = ids(BUILDS).indexOf(o.build) >= 0 ? o.build : DEFAULT.build;
  /* height in inches and weight in pounds. 0 is a 6'7" wing at the weight a
     man that tall usually carries. They shape the body and never the face. */
  out.ht = Number.isFinite(+o.ht) && +o.ht > 0 ? Math.max(66, Math.min(92, Math.round(+o.ht))) : 0;
  out.wt = Number.isFinite(+o.wt) && +o.wt > 0 ? Math.max(140, Math.min(360, Math.round(+o.wt))) : 0;
  return out;
}

function hash(s){
  var h = 2166136261 >>> 0;
  s = String(s);
  for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
/* A look off a seed, for a new player before he chooses and for the rival,
   who always looks the same because his name always hashes the same. Hair
   colour leans natural: the dyed two are one look in sixteen. */
function lookFor(seed){
  var h = hash('look:' + seed), b = function(n){ return (h >>> n) & 0xff; };
  var hc = b(4) % 16;
  return normal({
    skin: b(0) % SKINS.length,
    hair: HAIRS[b(8) % HAIRS.length][0],
    hc: hc < 7 ? 0 : hc < 10 ? 1 : hc < 12 ? 2 : hc < 13 ? 3 : hc < 14 ? 4 : hc < 15 ? 5 : 6 + (b(20) & 1),
    beard: BEARDS[b(12) % 6 < 3 ? 0 : b(12) % BEARDS.length][0],
    band: b(16) % 5 === 0 ? BANDS[1 + b(17) % 4][0] : 'none',
    sleeve: b(24) % 4 === 0 ? SLEEVES[1 + b(25) % 3][0] : 'none',
    shoes: SHOES[b(28) % SHOES.length][0],
    build: BUILDS[b(14) % 3][0],
  });
}

/* ─── colour ──────────────────────────────────────────────────────────── */

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
/* The number has to read on the jersey. A club's second colour is the right
   ink most of the time and wrong for a few, where white or black takes over. */
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
/* Turn a hue toward another the short way round, by at most `by` degrees. */
function toward(h, goal, by){
  var d = ((goal - h + 540) % 360) - 180;
  return h + Math.max(-by, Math.min(by, d));
}

/* ─── the model ───────────────────────────────────────────────────────────

   THE PLAYER IS A SMALL 3D MODEL, PAINTED THE WAY RUN THE TOUR PAINTS ITS
   GOLFER. Run The Tour's profile golfer (PXHD in golf/index.html) is drawn as
   lit volumes: every pixel knows which part it is and which way that part
   faces, and one paint step turns that into colour. Its course golfer is a
   posable 3D model put through the same paint step. This is that, for a
   basketball player: rounded volumes (a head, a chest, limbs as round cones,
   hands, shoes, hair) posed in three dimensions, looked at from a little
   above, and every pixel is traced into the model to find the part it lands
   on and the direction its surface faces. Then the golf game's paint step,
   copied rather than imitated:
     five step ramps that drift cool in shadow and warm in the light (skin
       drifts red-violet), one light from the top left,
     a contact shadow on a part where one in front of it overlaps it,
     an inner contour on the front part where it crosses a part behind,
     and a soft outline one pixel INSIDE the silhouette, in the part's own
       shadow colour: no dark outer ring,
     dot eyes, brows and a little blush.
   The grid is still 44 by 64 and every pose and frame keeps its name, so
   every screen that draws the player draws this one.

   A MOVING FRAME IS THE SAME MODEL WITH ITS JOINTS ELSEWHERE. An arm is two
   angles, the upper arm and the forearm, measured from straight down, outward
   positive, 180 straight up, negative across the body, the way the frames
   were always written. fs foreshortens the forearm, which in a model is the
   forearm turned toward the camera rather than drawn shorter. */
var DIGITS = {
  0: ['0110', '1001', '1001', '1001', '1001', '0110'], 1: ['0110', '1110', '0110', '0110', '0110', '1111'],
  2: ['0110', '1001', '0001', '0110', '1000', '1111'], 3: ['1110', '0001', '0110', '0001', '0001', '1110'],
  4: ['0011', '0101', '1001', '1111', '0001', '0001'], 5: ['1111', '1000', '1110', '0001', '0001', '1110'],
  6: ['0110', '1000', '1110', '1001', '1001', '0110'], 7: ['1111', '0001', '0010', '0010', '0100', '0100'],
  8: ['0110', '1001', '0110', '1001', '1001', '0110'], 9: ['0110', '1001', '1001', '0111', '0001', '0110'],
};
var DIG35 = {
  0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'], 2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '011', '001', '111'], 4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '010', '010', '010'], 8: ['111', '101', '111', '101', '111'],
  9: ['111', '101', '111', '001', '111'],
};
var CX = 22;

/* ── each club's jersey design ──
   Keyed by the club's own two colours, which is all a caller hands the
   painter, so every screen gets the design without learning a club code.
   classic: trim on the openings only. double: a second, inner line in the
   third colour. side: panels down the sides of the jersey and the shorts.
   pin: pinstripes. sash: a band across the body. band: two stripes across
   the chest under the number. fade: stripes thickening down the jersey. */
var KITS = {
  'E03A3E|C1D32F': 'side', '007A33|BA9653': 'double', '000000|FFFFFF': 'side', 'CE1141|000000': 'double',
  '1D1160|00788C': 'pin', '860038|FDBB30': 'band', '00538C|B8C4CA': 'side', '0E2240|FEC524': 'fade',
  'C8102E|1D42BA': 'band', '1D428A|FFC72C': 'classic', 'CE1141|C4CED4': 'sash', '002D62|FDBB30': 'pin',
  'C8102E|1D428A': 'side', '552583|FDB927': 'double', '5D76A9|F5B112': 'side', '98002E|F9A01B': 'fade',
  '00471B|EEE1C6': 'side', '0C2340|78BE20': 'pin', '0C2340|C8102E': 'side', '006BB6|F58426': 'double',
  '007AC1|EF3B24': 'fade', '0077C0|C4CED4': 'pin', '006BB6|ED174C': 'double', '1D1160|E56020': 'fade',
  'E03A3E|000000': 'sash', '5A2D81|63727A': 'side', '000000|C4CED4': 'side', '002B5C|F9A01B': 'fade',
  '002B5C|E31837': 'band', '00653A|FFC200': 'double', '002A60|DA2032': 'band', '00B2A9|BC7844': 'side',
  '00778B|280071': 'pin', 'F47B20|000000': 'double', 'E35205|00285E': 'sash',
};
var KIT_IDS = ['classic', 'double', 'side', 'pin', 'sash', 'band', 'fade'];
function kitOf(c1, c2, want){
  if (want && KIT_IDS.indexOf(want) >= 0) return want;
  var k = String(c1 || '').replace('#', '').toUpperCase() + '|' + String(c2 || '').replace('#', '').toUpperCase();
  if (KITS[k]) return KITS[k];
  if (!c1) return 'classic';
  var h = 0; for (var i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
  return KIT_IDS[h % KIT_IDS.length];
}

/* ── the golf game's ramps, as PXHD writes them ── */
function rgbHsl(c){ var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), h = 0, s = 0, l = (mx + mn) / 2;
  if (mx !== mn) { var d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
  return [h, s, l]; }
function hslHex(h, s, l){ h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
  var f = function(n){ var k = (n + h / 30) % 12, a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
  return hexOf([f(0), f(8), f(4)]); }
function hl(hex){ return rgbHsl(rgb(hex))[2]; }
var RAMPS = {};
function ramp(hex, o){
  o = o || {};
  var key = hex + '|' + (o.skin ? 1 : 0) + '|' + (o.spread || 1), r = RAMPS[key];
  if (r) return r;
  var sp = o.spread || 1, COOL = o.skin ? '#5a2338' : '#2a2a68', WARM = o.skin ? '#fff0d0' : '#fff7dc';
  var dk = function(a, c){ return mix(mix(hex, '#000000', a * sp), COOL, c); }, lt = function(a, w){ return mix(mix(hex, '#ffffff', a * sp), WARM, w); };
  var sat = function(c, k){ var t = rgbHsl(rgb(c)); return hslHex(t[0], Math.min(1, t[1] * k), t[2]); };
  r = o.skin ? [dk(0.30, 0.22), dk(0.13, 0.10), hex, lt(0.12, 0.10), lt(0.26, 0.20)]
    : [sat(dk(0.34, 0.20), 1.08), sat(dk(0.15, 0.10), 1.05), hex, lt(0.16, 0.10), lt(0.34, 0.24)];
  if (Object.keys(RAMPS).length > 600) RAMPS = {};
  RAMPS[key] = r;
  return r;
}
function skinRamp(hex){ var l = hl(hex), r = ramp(hex, { skin: 1, spread: l < 0.3 ? 0.55 : 0.9 }).slice();
  if (l < 0.3) { r[3] = mix(hex, '#e8b48a', 0.16); r[4] = mix(hex, '#f4cfa8', 0.30); } return r; }
function hairRamp(hex){ var l = hl(hex), r = ramp(hex, { spread: l < 0.2 ? 0.55 : 1 }).slice();
  if (l < 0.2) { r[3] = mix(hex, '#8a7a9a', 0.28); r[4] = mix(hex, '#b8aac8', 0.45); } return r; }

/* ── the camera: a little above, looking down, the floor where it was ── */
var PITCH = 30 * Math.PI / 180, CP = Math.cos(PITCH), SN = Math.sin(PITCH), GY = 58.2;  /* the floor, three cells up: from above, the near foot reaches lower on screen */
/* THE 3/4 CORNER CAMERA. The camera looks down 30 degrees, and the man is
   turned YAW about his own vertical axis, so he is seen from the front corner
   rather than straight on: one shoulder near, one far, the depth of his chest
   and the top of his head all in the picture. DEF_YAW is how he stands on
   every screen that does not say otherwise; the court turns him to face along
   the court (paint's opts.yaw). Everything that puts a point on the screen
   (the tracer, the face, the number, a hand, a held ball) goes through rotV,
   so they can never disagree about where he is. */
var DEF_YAW = 35, YAW = DEF_YAW, CY = Math.cos(DEF_YAW * Math.PI / 180), SY = Math.sin(DEF_YAW * Math.PI / 180);
function setYaw(d){ d = d == null || !isFinite(+d) ? DEF_YAW : +d; YAW = d; CY = Math.cos(d * Math.PI / 180); SY = Math.sin(d * Math.PI / 180); }
function rotV(v){ var rx = v[0] * CY + v[2] * SY, rz = -v[0] * SY + v[2] * CY; return [rx, v[1] * CP + rz * SN, -v[1] * SN + rz * CP]; }
/* OX sets him a cell left of the middle: from this corner his dribbling hand
   reaches further out to the right than anything reaches to the left */
var OX = -1;
function toView(p){ var v = rotV([p[0] - CX, p[1] - GY, p[2]]); return [CX + OX + v[0], GY + v[1], v[2]]; }
function toWorld(q){ var x = q[0] - CX - OX, y = q[1] - GY, z = q[2], dy = y * CP - z * SN, rz = y * SN + z * CP;
  return [CX + x * CY - rz * SY, GY + dy, x * SY + rz * CY]; }
var LIGHT = (function(){ var v = [-0.55, -0.72, 0.72], l = Math.hypot(v[0], v[1], v[2]); return v.map(function(a){ return a / l; }); })();

/* ── shapes, as distances ── */
function clamp01(t){ return t < 0 ? 0 : t > 1 ? 1 : t; }
function sph(c, r){ return function(p){ return Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) - r; }; }
function ell(c, r){ return function(p){
  var a = (p[0] - c[0]) / r[0], b = (p[1] - c[1]) / r[1], d = (p[2] - c[2]) / r[2];
  var k0 = Math.hypot(a, b, d), k1 = Math.hypot(a / r[0], b / r[1], d / r[2]);
  return k1 > 1e-6 ? k0 * (k0 - 1) / k1 : -Math.min(r[0], r[1], r[2]); }; }
/* a round cone: a limb, thick at one end and thinner at the other */
function cone(a, b, ra, rb){
  var bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2], ll = bx * bx + by * by + bz * bz || 1;
  return function(p){
    var px = p[0] - a[0], py = p[1] - a[1], pz = p[2] - a[2];
    var t = clamp01((px * bx + py * by + pz * bz) / ll);
    return Math.hypot(px - bx * t, py - by * t, pz - bz * t) - (ra + (rb - ra) * t);
  };
}
function rbox(c, h, r){ return function(p){
  var qx = Math.abs(p[0] - c[0]) - h[0] + r, qy = Math.abs(p[1] - c[1]) - h[1] + r, qz = Math.abs(p[2] - c[2]) - h[2] + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r; }; }
function smin(a, b, k){ var h = clamp01(0.5 + 0.5 * (b - a) / k); return b + (a - b) * h - k * h * (1 - h); }
function cut(f, keep){ return function(p){ return Math.max(f(p), keep(p)); }; }       /* keep(p) <= 0 inside what stays */
function minus(f, g){ return function(p){ return Math.max(f(p), -g(p)); }; }
function uni(fs){ return function(p){ var d = 1e9; for (var i = 0; i < fs.length; i++) { var v = fs[i](p); if (v < d) d = v; } return d; }; }

/* ── the poses ── */
var DOWN = [9, 4], UP = [156, 183];
function fr(R, Lft, more){ var o = { a: { '1': R, '-1': Lft } }; for (var k in more || {}) o[k] = more[k]; return o; }
var SETS = {
  walk: [
    fr([14, 10], [-8, -10], { lift: { '1': 2 }, dip: 1 }),
    fr(DOWN, DOWN, { lift: { '-1': 1 } }),
    fr([-8, -10], [14, 10], { lift: { '-1': 2 }, dip: 1 }),
    fr(DOWN, DOWN, { lift: { '1': 1 } }),
  ],
  dribble: [
    fr([25, 10], [30, 40, 1, 0.6], { dip: 2, sp: 1 }),
    fr([18, 32], [30, 40, 1, 0.6], { dip: 2, sp: 1 }),
    fr([22, 4], [30, 40, 1, 0.6], { dip: 2, sp: 1 }),
    fr([18, 32], [30, 40, 1, 0.6], { dip: 2, sp: 1 }),
  ],
  /* gather, rise, release, follow-through, land */
  shot: [
    fr([20, -110], [20, -112], { dip: 3 }),
    fr([150, 200], [150, 205], { lift: { '1': 1, '-1': 1 } }),
    fr([165, 182], [150, 212], { lift: { '1': 2, '-1': 2 } }),
    fr([160, 176, 1, 1, 1.2, 1.6], [130, 170], { lift: { '1': 2, '-1': 2 } }),
    fr([25, 20], [25, 20], { dip: 2 }),
  ],
  /* the last step, the load, the rise, the slam, hanging on the rim */
  dunk: [
    fr([15, -100], [15, -104], { lift: { '1': 2 }, dip: 1 }),
    fr([15, -40], [15, -44], { dip: 4 }),
    fr([165, 176], [165, 178], { lift: { '1': 3, '-1': 3 } }),
    fr([160, 140], [160, 144], { lift: { '1': 3, '-1': 3 } }),
    fr([170, 181], [170, 183], { lift: { '1': 4, '-1': 4 } }),
  ],
  /* the crouch, the rise, the swat, the landing */
  block: [
    fr([20, 15], [20, 15], { dip: 3 }),
    fr([150, 170], [30, 38, 1, 0.5], { lift: { '1': 2, '-1': 2 } }),
    fr([172, 181], [38, 48, 1, 0.4], { lift: { '1': 3, '-1': 3 } }),
    fr([28, 18], [28, 18], { dip: 2 }),
  ],
  /* a fist, a scream, a point at the crowd, a flex */
  cheer: [
    fr(UP, DOWN),
    fr([140, 170], [140, 170]),
    fr([142, 168], DOWN),
    fr([85, 180], [85, 180]),
  ],
  /* hands on hips, hands on head, hands on knees */
  sad: [
    fr([40, -45], [40, -45]),
    fr([140, 230], [140, 230]),
    fr([10, -25, 1, 0.85], [10, -25, 1, 0.85], { dip: 4 }),
  ],
  /* the hand held out toward the man you are meeting, then the pump */
  shake: [
    fr(DOWN, [30, 40, 1, 0.45]),
    fr(DOWN, [30, 60, 1, 0.45]),
    fr(DOWN, [30, 48, 1, 0.45]),
  ],
  wave: [
    fr([140, 190], DOWN),
    fr([140, 170], DOWN),
    fr([140, 160], DOWN),
  ],
};
/* A standing dribble for the cutscene stage, eight frames off one phase
   (BOUNCE_AT). The ball is NOT in these frames: live() draws it every display
   frame with real easing, locked to this hand while they touch. So the arm
   only has to hit its key poses. Frame 0 is the catch with the hand high, 1
   and 2 push the ball down and let it go, 3 follows through, 4 to 7 bring the
   hand back up to wait for it. The knees give a little on the push. */
var BOUNCE_ARM = [[20, 54, 1, 0.58], [22, 32, 1, 0.8], [24, 12, 1, 1], [24, 4], [23, 18, 1, 0.92], [21, 34, 1, 0.76], [20, 48, 1, 0.62], [20, 56, 1, 0.56]];
var BOUNCE_DIP = [0.6, 1.2, 1.5, 1.3, 0.9, 0.6, 0.4, 0.4];
SETS.bounce = BOUNCE_ARM.map(function(a, i){ return fr(a, [14, 10], { dip: BOUNCE_DIP[i], sp: 0.7 }); });
var ANIM = {};
Object.keys(SETS).forEach(function(k){ SETS[k].forEach(function(f, i){ ANIM[k + i] = f; }); });
/* The six standing poses, in the same angles. */
var STILL = {
  stand: fr([12, 6], [12, 6]),
  suit: fr([10, 5], [10, 5]),
  cap: fr([10, 5], [10, 5]),
  up: fr([148, 176], [148, 176]),
  trophy: fr([16, -84, 1, 0.5], [16, -84, 1, 0.5]),
  ball: fr([17, 38, 1, 0.75], [12, 6]),
};

/* ── the body, from his height and weight ──

   A BASKETBALL PLAYER IS LONG. The figure used to be three and a third heads
   tall, which is a mascot. It is about four and a half now: the head is 0.7
   of what it was and the legs carry most of the height, the way they do on a
   real roster. And the body is HIS: the engine has always given a career a
   height and a weight (they move his ratings), and now they move the drawing.
     Height lengthens the legs most, the torso less and the head not at all,
       because a tall man is not a scaled up short one. A taller frame is a
       little wider too.
     Weight is measured against what a man that tall usually carries
       (typicalWt is career.js's wtFor). Over it, the chest, the waist, the
       thighs and the arms fill out, and the waist most; under it, all of it
       thins. Build (lean, standard, muscular) is still the shoulders. */
var BASE_HT = 79, HEAD_K = 0.53;
function typicalWt(ht){ return Math.round((195 + (ht - 75) * 8) / 5) * 5; }
function metrics(L){
  var ht = (L && L.ht) || BASE_HT, wt = (L && L.wt) || typicalWt(ht), h = ht / BASE_HT;
  var gw = Math.max(-3, Math.min(4, (wt - typicalWt(ht)) / 10));
  var legs = 27.8 * Math.pow(h, 1.35), torso = 18.6 * Math.pow(h, 0.85);
  return { ht: ht, wt: wt, h: h, gw: gw, legs: legs, torso: torso, ts: torso / 19, ls: legs / 22.2, sw: 1 + (h - 1) * 0.55, k: HEAD_K };
}

/* The skeleton for a pose, in world cells (x right, y down, z toward the
   camera). bw widens the shoulders, am thickens the limbs, by build; MX is
   the body (metrics). */
function skeleton(f, bw, am, breath, MX){
  MX = MX || metrics(null);
  var dip = f.dip || 0, sp = f.sp || 0, up = typeof breath === 'number' ? breath : breath ? 1 : 0, ts = MX.ts, sw = MX.sw, g = MX.gw;
  var hipY = GY - MX.legs, neckY = hipY - MX.torso, ankY = GY - 4.0;
  var J = { dip: dip, MX: MX };
  J.head = [CX, neckY - 6.5 * MX.k + dip + up, 0.6 * MX.k];
  J.neck = [CX, neckY + dip + up, 0];
  J.chest = [CX, neckY + 7.2 * ts + dip + up, 0];
  J.waist = [CX, neckY + 15.6 * ts + dip, 0];
  J.arm = {}; J.leg = {};
  /* hanging, the fingertips reach the middle of the thigh, whatever his
     height: the wrist at the seat of the shorts, the elbow at the waist */
  var shY = neckY + 2.6 * ts, kneeY0 = (hipY + ankY) / 2 + 0.6;
  var as = Math.max(0.85, (hipY + 0.62 * (kneeY0 - hipY) - shY) / 16.7);
  /* but an arm straight up must still fit under the top of the canvas,
     measured on screen, where the camera looking down foreshortens every
     height. THAT LIMIT IS FOR A RAISED ARM ONLY: applied to every pose it
     bound at the default height and left every man with arms ending at his
     hips. So an arm keeps its full length while the hand is below the
     shoulder and eases down to the limit as it rises. */
  var asUp = Math.min(as, (GY + (shY - GY) * CP - 4.6) / (19.0 * CP));
  [-1, 1].forEach(function(s){
    var p = f.a[String(s)] || DOWN;
    var sh = [CX + s * ((6.9 + bw * 0.8) * sw + Math.max(0, g) * 0.3 - Math.max(0, -g) * 0.15), shY + dip + up, 0];
    var r1 = p[0] * Math.PI / 180, r2 = p[1] * Math.PI / 180;
    var f1 = p[2] == null ? 1 : p[2], f2 = p[3] == null ? 1 : p[3];
    /* how high the hand reaches, as a share of the arm: nought at the
       shoulder, one straight up */
    var rise = -(Math.cos(r1) * 7.6 * f1 + Math.cos(r2) * 7.0 * f2) / 14.6;
    var ua0 = as + (asUp - as) * clamp01(rise / 0.7), ua, el, wr, hd;
    var reach = function(ua){
      var L1 = 7.6 * ua, L2 = 7.0 * ua;
      /* foreshortened means turned toward the camera, the length kept. A limb
         that crosses the body passes in FRONT of it, so it comes forward by how
         far across it reaches: drawn flat it went into the chest and vanished,
         and a hand over the head went behind the hair. */
      var acr1 = Math.sin(r1) < 0 ? Math.min(1, -Math.sin(r1) * 1.4) : 0, acr2 = Math.sin(r2) < 0 ? Math.min(1, -Math.sin(r2) * 1.4) : 0;
      el = [sh[0] + s * Math.sin(r1) * L1 * f1, sh[1] + Math.cos(r1) * L1 * f1, L1 * Math.sqrt(Math.max(0, 1 - f1 * f1)) + acr1 * 4.2];
      wr = [el[0] + s * Math.sin(r2) * L2 * f2, el[1] + Math.cos(r2) * L2 * f2, el[2] + L2 * Math.sqrt(Math.max(0, 1 - f2 * f2)) + acr2 * (6.2 - el[2] * 0.4)];
      var hl2 = 2.1 * Math.min(1.1, ua);
      hd = [wr[0] + s * Math.sin(r2) * hl2 * f2 + s * (p[4] || 0), wr[1] + Math.cos(r2) * hl2 * f2 + (p[5] || 0), wr[2] + hl2 * Math.sqrt(Math.max(0, 1 - f2 * f2))];
      /* a heavy man's thighs are thicker, so a hand at his side or on his knees
         is held out in front of them rather than lost inside them */
      if (g > 0 && hd[1] > hipY - 2) { hd = [hd[0] + s * g * 0.42, hd[1], hd[2] + g * 0.8]; wr = [wr[0] + s * g * 0.22, wr[1], wr[2] + g * 0.42]; }
    };
    /* and a long arm held out to the side, a heavy man's most of all, must
       keep its hand on the canvas: it gives back length a little at a time
       until the hand is inside the grid on screen */
    for (var k = 0; k < 8; k++) { ua = ua0 * (1 - k * 0.04); reach(ua); var vx = toView(hd)[0]; if (vx > 2.6 && vx < W - 3.6) break; }
    J.arm[s] = { sh: sh, el: el, wr: wr, hand: hd, hang: Math.abs(p[1]) < 30 };
    var lf = f.lift ? f.lift[String(s)] || 0 : 0;
    var hw = (3.9 + g * 0.22) * sw;
    var hip = [CX + s * hw, hipY + dip, 0];
    var ank = [CX + s * ((4.6 + sp) * sw + g * 0.18), ankY - lf * 1.25, 0.2 + lf * 0.3];
    /* a crouch or a lifted foot bends the knee forward */
    var bend = dip * 0.7 + lf * 0.9;
    var kn = [CX + s * ((4.4 + sp * 0.6) * sw + g * 0.2), (hip[1] + ank[1]) / 2 + 0.6, 0.6 + bend];
    J.leg[s] = { hip: hip, kn: kn, ank: ank, lf: lf };
  });
  return J;
}

/* where a held ball's centre sits across: just outside the hand, and never
   so far out that a heavy man's ball leaves the grid */
function heldX(hx){ return Math.min(hx + 1.4, W - 1.6 - 3.7); }

/* ── the model for one pose and one look ── */
function build(L, o, J){
  var suit = o.suit, cap = o.cap, pose = o.pose;
  var BD = bodyOf(L.build), bw = BD.bw, am = BD.am;
  var MX = J.MX || metrics(L), g = MX.gw, ts = MX.ts, ls = MX.ls, sw = MX.sw;
  var P = [];
  /* n: the part's name, g: which piece of the body it is (lines are drawn
     between pieces, never inside one), m: its material, or a function of
     where it was hit, f: the shape, b: a bounding sphere for culling */
  var add = function(n, g, m, f, c, r, x){ var p = { n: n, g: g, m: m, f: f, c: c, r: r }; for (var k in x || {}) p[k] = x[k]; P.push(p); return p; };
  var H = J.head, hx = H[0], hy = H[1], hz = H[2];
  var HR = [7.3, 8.6, 7.6];
  var local = function(p){ return [p[0] - hx, p[1] - hy, p[2] - hz]; };
  var ST = o.st || null;

  /* legs: skin and socks under the shorts, or trousers */
  [-1, 1].forEach(function(s){
    var G = J.leg[s];
    if (ST) {
      add('trouser' + s, 'leg' + s, streetLegMat(G, s), streetLegF(G, s), G.kn, 12 * ls);
    } else if (!suit) {
      var legMat = function(p){
        var y = p[1] - (G.ank[1] - 57.4);
        /* crew socks, with the club's two colours ringed near the top */
        if (y > 53.4) return y < 54.2 ? 'sock' : y < 54.9 ? 'jersey' : y < 55.6 ? 'trim' : 'sock';
        return 'skin';
      };
      /* a calf: the shin swells behind, a third of the way down, and the
         ankle is narrow. A straight cone reads as a pipe. */
      var cr = Math.max(1.4, 2.3 + am + g * 0.16), ca = [G.kn[0] + (G.ank[0] - G.kn[0]) * 0.32, G.kn[1] + (G.ank[1] - G.kn[1]) * 0.32, G.kn[2] + (G.ank[2] - G.kn[2]) * 0.32 - 0.5];
      var legF = uni([cone(G.hip, G.kn, Math.max(1.6, 2.6 + am + g * 0.36), Math.max(1.5, 2.1 + am + g * 0.22)), cone(G.kn, G.ank, cr * 0.9, Math.max(1.0, 1.45 + am * 0.5 + g * 0.08))]);
      var calfF = ell(ca, [cr * 1.08, 3.2 * ls, cr * 1.1]);
      add('leg' + s, 'leg' + s, legMat, function(p){ return smin(legF(p), calfF(p), 1.4); }, G.kn, 10 * ls);
    } else {
      add('trouser' + s, 'leg' + s, 'trouser', uni([cone([G.hip[0], G.hip[1] - 2, 0], G.kn, 3.4 + g * 0.25, 3.0 + g * 0.15), cone(G.kn, G.ank, 3.0 + g * 0.1, 2.7)]), G.kn, 12 * ls);
    }
    /* the shoe: a rounded toe box on a flat sole */
    var a = G.ank, fx = a[0] + s * 0.3, fy = a[1] + 2.4, fz = a[2] + 1.3, fl = a[1] + 4.0;
    var shoeF, shoeM;
    if (suit) {
      shoeF = cut(ell([fx, fy, fz], [2.4, 1.9, 3.9]), function(p){ return p[1] - fl; });
      shoeM = function(p){ return p[1] - a[1] > 3.35 ? 'sole' : { m: 'shoe', gloss: 2 }; };
    } else {
      /* A BASKETBALL SNEAKER, NOT AN EGG: a flat cupsole with a rounded toe,
         a low toe box, a tall heel counter and a padded high-top collar
         around the ankle. Then what makes it read as a shoe: the white
         midsole with a tread line, laces up the vamp, a stripe down the
         side and a heel tab. */
      var soleF = rbox([fx, fl - 0.5, fz + 0.05], [2.1, 0.5, 3.6], 0.45);
      var toeF = ell([fx, fl - 1.45, fz + 1.45], [2.0, 1.3, 2.4]);
      var heelF = rbox([fx, fl - 2.3, fz - 1.0], [1.95, 1.8, 2.25], 1.0);
      var collarF = ST && ST.shoes && ST.shoes.k === 'hitop' ? ell([fx, a[1] - 0.5, fz - 1.2], [2.05, 2.5, 2.05]) : ell([fx, a[1] + 0.5, fz - 1.3], [1.95, 1.5, 1.95]);
      shoeF = function(p){ return Math.min(soleF(p), smin(smin(toeF(p), heelF(p), 1.3), collarF(p), 0.9)); };
      shoeM = function(p){
        var ly = p[1] - a[1], dz = p[2] - fz, dx = Math.abs(p[0] - fx);
        if (ly > 3.62) return { m: 'shoe', dt: -1 };
        if (ly > 2.95) return 'sole';
        if (ly < 0.8) return { m: 'shoe', dt: -1 };
        if (dz < -3.0 && ly < 2.4) return 'trim';
        if (dx < 0.55 && dz > -0.8 && dz < 1.6 && ly < 2.4) return Math.floor((dz + 3) * 1.4) % 2 ? { m: 'lace', t: 4 } : { m: 'lace', t: 1 };
        if (dx > 1.45 && dz > -2.2 && dz < 2.6 && Math.abs(ly - (2.3 - dz * 0.32)) < 0.42) return 'trim';
        return 'shoe';
      };
    }
    add('shoe' + s, 'shoe' + s, shoeM, shoeF, [fx, fy, fz], 6.2, { gloss: 1 });
  });

  /* the torso: a chest and a waist, one smooth body */
  /* the chest and the waist fill out with weight, the waist (and the belly
     in front of it) most */
  var cR = [(6.9 + bw) * sw + g * 0.48, 5.8 * ts, (6.9 + bw) * sw * 0.64 + g * 0.42], wR = [(6.0 + bw * 0.4) * sw + g * 0.72, 5.0 * ts, (6.0 + bw * 0.4) * sw * 0.7 + Math.max(0, g) * 0.8 + Math.min(0, g) * 0.3];
  var C0 = J.chest, W0 = J.waist;
  /* a body, not a barrel: the ribcage and the waist, the two pecs over the
     front of the ribs, the lats flaring under the arms behind, and the
     shoulder blades. From the 3/4 corner the depth is half of what is seen. */
  var pecs = [-1, 1].map(function(s){ return ell([CX + s * 2.5 * sw, C0[1] - 1.6 * ts, cR[2] - 1.3], [2.6 * sw + Math.max(0, bw) * 0.5, 2.0 * ts, 1.4 + Math.max(0, bw) * 0.3]); });
  var lats = [-1, 1].map(function(s){ return ell([CX + s * (cR[0] - 2.2), C0[1] + 0.6 * ts, -1.2], [2.4, 4.4 * ts, 2.6]); });
  var blades = [-1, 1].map(function(s){ return ell([CX + s * 3.0 * sw, C0[1] - 2.2 * ts, -cR[2] + 1.0], [2.6, 2.6 * ts, 1.4]); });
  var torsoF = function(p){ var d = smin(ell(C0, cR)(p), ell(W0, wR)(p), 2.2);
    for (var i = 0; i < 2; i++) { d = smin(d, pecs[i](p), 1.2); d = smin(d, lats[i](p), 1.4); d = smin(d, blades[i](p), 1.0); }
    return d; };
  var bodyN = function(p){ return p; };
  if (ST) streetTorso();
  else if (!suit) {
    var kit = o.kit || 'classic', nres = o.res || 1;
    /* the number, on the cloth itself: a 3 by 5 numeral laid on the front of
       the chest in the body's own units, so it turns with the chest and
       foreshortens with the camera the way a printed number does. A cell is
       never smaller than a pixel and a half, or the pitch drops whole rows of
       a digit; at a portrait's single resolution there is no room for that,
       and the number is stamped on the screen instead (paint0). */
    var ncs = Math.max(0.7 * ts, 1.5 / nres), nlen = (o.num || '').length, nTop = C0[1] - 1.6 * ts;
    var numAt = function(p){
      if (nres < 2 || !nlen || p[2] < 1.0) return false;
      var u = (p[0] - CX) / ncs + (nlen * 4 - 1) / 2, v = (p[1] - nTop) / ncs;
      if (v < 0 || v >= 5 || u < 0) return false;
      var di = Math.floor(u / 4), cu = Math.floor(u - di * 4);
      if (di >= nlen || cu > 2) return false;
      var DG = DIG35[o.num[di]];
      return !!DG && DG[Math.floor(v)][cu] === '1';
    };
    /* the number sits on clean cloth: no stripe runs through it */
    var numClear = function(p){
      if (!nlen || p[2] < 0.5) return false;
      var u = (p[0] - CX) / ncs, v = (p[1] - nTop) / ncs, hw = (nlen * 4 - 1) / 2 + 1;
      return Math.abs(u) < hw && v > -1 && v < 6;
    };
    /* the club's design, laid over the body: the second colour as a pattern */
    var pinG = Math.max(1.4, 2.4 / nres), pinW = Math.max(0.32, 0.9 / nres);
    var patAt = function(p, y, sx){
      var dx = Math.abs(sx);
      if (kit === 'side') return Math.atan2(Math.abs(p[2]), dx) < 0.34 && y > 29.6;
      if (kit === 'pin') { var q = ((sx / pinG) % 1 + 1) % 1; return Math.abs(q - 0.5) * pinG < pinW / 2 && y > 25.6; }
      if (kit === 'sash') return Math.abs(y - (33.0 - sx * 0.62)) < 0.95 && p[2] > -1.0;
      if (kit === 'band') return (y > 32.0 && y < 32.9) || (y > 33.5 && y < 34.0);
      if (kit === 'fade') { if (y < 32.2) return false; var f = ((y * 1.3) % 1 + 1) % 1; return f < Math.min(0.9, (y - 32.2) * 0.16 + 0.12); }
      return false;
    };
    var torsoMat = function(p){
      var sx = p[0] - CX, dx = Math.abs(sx), y = 29.2 + (p[1] - C0[1]) / ts, front = p[2] > 0.6;
      /* an NBA jersey, not a vest: a high round crew neck that sits just
         under the collarbone, straps as wide as a hand from the collar to
         the shoulder, and an armhole cut no lower than the chest. Each
         opening is edged in one band of the second colour, and a club that
         trims twice gets an inner line of the third. */
      var edge = cR[0], strapOut = Math.min(6.6, edge - 0.9);
      var nd = front ? 1.15 : 0.35, nw = 2.75;
      var neck = function(w){ var t = dx / w; return t < 1 ? 23.9 + nd * (1 - t * t) : -1; };
      if (y < neck(nw)) return 'skin';
      if (y < neck(nw + 0.75) + (kit === 'double' ? 1.05 : 0.7)) return kit === 'double' && y > neck(nw + 0.75) + 0.55 ? 'third' : 'trim';
      var ax = edge + 0.9, rx = ax - strapOut, ry = 5.0, ay = 24.6;
      var ae = Math.pow((dx - ax) / rx, 2) + Math.pow((y - ay) / ry, 2);
      if (y < 24.9 && dx > strapOut) return 'skin';
      if (ae < 1) return 'skin';
      if (ae < (kit === 'double' ? 1.5 : 1.34)) return kit === 'double' && ae > 1.3 ? 'third' : 'trim';
      if (numAt(p)) return { m: 'ink', dt: 1 };
      if (!numClear(p) && patAt(p, y, sx)) return 'pat';
      return 'jersey';
    };
    add('torso', 'torso', torsoMat, torsoF, [CX, (C0[1] + W0[1]) / 2, 0], 11 * Math.max(1, ts, sw) + Math.max(0, g));
    /* the shorts: wide and long, cut into two legs at the seat, and as long
       on a tall man as on a short one, to just above the knee */
    var sy0 = W0[1] - 0.2, sd = 3.6 * ts, sl = 7.0 * ls;
    var shW = (6.4 + bw * 0.4) * sw + g * 0.6, lr0 = 3.7 + g * 0.36, lr1 = 3.3 + g * 0.24;
    var shortsF = uni([ell([CX, sy0 + 2.6 * ts, 0], [shW, 4.2 * ts, 4.8 + Math.max(0, g) * 0.45]),
      cone([CX - 3.7 * sw, sy0 + 3.0 * ts, 0], [J.leg[-1].kn[0] + 0.4, sy0 + sd + sl, J.leg[-1].kn[2] * 0.6], lr0, lr1),
      cone([CX + 3.7 * sw, sy0 + 3.0 * ts, 0], [J.leg[1].kn[0] - 0.4, sy0 + sd + sl, J.leg[1].kn[2] * 0.6], lr0, lr1)]);
    /* the side stripe runs down the outside of each leg: one band, not a panel */
    var stripe = function(p){ var s1 = p[0] < CX ? -1 : 1, kx = J.leg[s1].kn[0] - s1 * 0.4, t = clamp01((p[1] - sy0 - 3.0 * ts) / Math.max(1, sd + sl - 3.0 * ts));
      var cx = CX + s1 * 3.7 * sw + (kx - CX - s1 * 3.7 * sw) * t, r = lr0 + (lr1 - lr0) * t; return Math.abs(p[0] - cx) > r - 0.85 && Math.abs(p[0] - cx) <= r + 0.3 && p[2] > -1.5 && (p[0] - cx) * s1 > 0; };
    add('shorts', 'shorts', function(p){
      var y = p[1] - sy0, dx = Math.abs(p[0] - CX);
      if (y < 1.2) return 'trim';
      if (y > sd + sl - 0.6) return { m: 'jersey', dt: -1 };
      if (y > 2.4 && stripe(p)) return kit === 'double' && Math.abs(p[2]) < 0.5 ? 'third' : 'trim';
      if (kit === 'side' && y > 2.4 && Math.atan2(Math.abs(p[2]), dx) < 0.42) return 'pat';
      if (kit === 'pin' && y > 1.6) { var q = (((p[0] - CX) / pinG) % 1 + 1) % 1; if (Math.abs(q - 0.5) * pinG < pinW / 2) return 'pat'; }
      return 'jersey';
    }, cut(shortsF, function(p){ return Math.max(sy0 - p[1], p[1] - (sy0 + sd + sl + 0.2)); }), [CX, sy0 + (sd + sl) / 2, 0], 6 + (sd + sl) / 2 + Math.max(0, g));
  } else {
    var jR = [cR[0] + 0.8, cR[1] + 0.4, cR[2] + 0.7], jW = [wR[0] + 1.2, 6.4 * ts, wR[2] + 0.9];
    var jacketF = function(p){ return smin(ell(C0, jR)(p), ell([CX, W0[1] + 1.4 * ts, 0], jW)(p), 2.4); };
    add('jacket', 'torso', function(p){
      var dx = p[0] - CX, ad = Math.abs(dx), y = 29.2 + (p[1] - C0[1]) / ts, front = p[2] > 1.2;
      var vee = y > 34 ? -1 : 3.4 - (y - 23) * 0.3;
      if (front && ad < vee) {
        if (ad < 0.95 && y > 24.4) return { m: 'tie', t: y < 25.4 ? 3 : dx < 0 ? 2 : 1 };
        return { m: 'shirt', dt: y < 24.4 ? 1 : 0 };
      }
      if (front && ad < vee + 1.3) return { m: 'jacket', dt: dx < 0 ? 1 : -1 };
      if (front && ad < 0.6 && (Math.abs(y - 35.2) < 0.5 || Math.abs(y - 38.4) < 0.5)) return { m: 'jacket', t: 0 };
      if (front && dx > 4.4 && dx < 6.0 && y > 25.6 && y < 26.8) return 'pocket';
      return 'jacket';
    }, cut(jacketF, function(p){ return p[1] - (W0[1] + 5.6 * ts); }), [CX, (C0[1] + W0[1]) / 2 + 1, 0], 13 * Math.max(1, ts, sw) + Math.max(0, g));
  }
  /* the neck: short, narrow under the jaw and flaring into the traps at the
     base, so it reads as part of the shoulders rather than a tube */
  var nb = Math.max(0, bw * 0.3);
  var neckF = function(p){ return smin(cone([CX, J.neck[1] - 2.2, -0.5], [CX, J.neck[1] + 1.2 * ts, -0.5], 1.95 + nb + g * 0.1, 2.6 + nb + g * 0.15)(p),
    ell([CX, J.neck[1] + 2.4 * ts, -0.9], [3.3 + nb * 1.6 + g * 0.25, 1.3, 1.9])(p), 1.4); };
  /* the same piece as the torso, so no contour line is drawn where they meet */
  add('neck', 'torso', 'skin', neckF, J.neck, 7, { bias: -0.25 });
  if (ST) streetNeck();

  /* the arms: a shoulder, an upper arm, a forearm, a hand */
  [-1, 1].forEach(function(s){
    var A = J.arm[s], sleeved = !suit && o.sleeve && s === 1;
    var mat = suit ? 'jacket' : sleeved ? 'sleeve' : 'skin';
    var r0 = Math.max(1.3, (suit ? 2.5 : 2.0) + am + g * 0.24), r1 = Math.max(1.2, (suit ? 2.1 : 1.7) + am * 0.8 + g * 0.17), r2 = Math.max(1.05, (suit ? 1.95 : 1.5) + am * 0.6 + g * 0.08);
    if (ST) { var ai = streetArm(A); mat = ai.m; r0 += ai.r; r1 += ai.r; r2 += ai.r * 0.8; }
    if (!suit) add('delt' + s, 'arm' + s, ST ? (ai.d || 'skin') : sleeved ? 'sleeve' : 'skin', sph([A.sh[0] - s * 0.7, A.sh[1] + 2.0, 0], BD.dl * 0.85 + g * 0.1 + (ST ? ai.r : 0)), A.sh, 3.5);
    /* an arm has a shape: the bicep swells half way down, a little, so the shoulder stays narrow, the
       forearm is thickest just under the elbow and narrows to the wrist */
    /* the arm starts just under the shoulder point, so its cap does not rise above the shoulder line */
    var sh0 = [A.sh[0] + (A.el[0] - A.sh[0]) * 0.1, A.sh[1] + (A.el[1] - A.sh[1]) * 0.1, A.sh[2] + (A.el[2] - A.sh[2]) * 0.1];
    var bi = [A.sh[0] + (A.el[0] - A.sh[0]) * 0.5, A.sh[1] + (A.el[1] - A.sh[1]) * 0.5, A.sh[2] + (A.el[2] - A.sh[2]) * 0.5];
    var fo = [A.el[0] + (A.wr[0] - A.el[0]) * 0.25, A.el[1] + (A.wr[1] - A.el[1]) * 0.25, A.el[2] + (A.wr[2] - A.el[2]) * 0.25];
    var armF = suit ? uni([cone(A.sh, A.el, r0, r1), cone(A.el, A.wr, r1, r2)])
      : function(p){ return smin(smin(cone(sh0, A.el, r0 * 0.74, r1 * 0.9)(p), ell(bi, [r0 * 0.92, r0 * 1.3, r0 * 0.92])(p), 1.4), smin(cone(A.el, A.wr, r1 * 0.96, r2 * 0.8)(p), ell(fo, [r1 * 1.02, r1 * 1.6, r1 * 1.0])(p), 2.0), 0.8); };
    add('arm' + s, 'arm' + s, suit ? function(p){
      var t = Math.hypot(p[0] - A.wr[0], p[1] - A.wr[1], p[2] - A.wr[2]);
      return t < 1.3 ? 'cuff' : 'jacket';
    } : mat, armF, A.el, 10);
    /* a hand grows with the man: a fixed size was lost inside a big man's jacket */
    var hk = sw * (1 + Math.max(0, g) * 0.05);
    add('hand' + s, 'arm' + s, 'skin', ell(A.hand, [1.55 * hk, 2.0 * hk, 1.4 * hk]), A.hand, 3 * hk, { hand: s });
  });

  /* what he is holding */
  if (pose === 'ball') {
    var hd = J.arm[1].hand, bc = [heldX(hd[0]), hd[1] + 3.2, hd[2] + 1.0];
    add('ball', 'ball', function(p){
      var u = p[0] - bc[0], v = p[1] - bc[1], w = p[2] - bc[2];
      if (Math.abs(v + u * 0.1) < 0.45 || Math.abs(u - v * 0.15) < 0.45 || Math.abs(Math.hypot(u + 5.2, v) - 3.9) < 0.42) return { m: 'ball', t: 0 };
      return 'ball';
    }, sph(bc, 3.7), bc, 3.9, { gloss: 1 });
  }
  if (pose === 'trophy') {
    var tc = [CX, (J.arm[1].hand[1] + J.arm[-1].hand[1]) / 2, Math.max(J.arm[1].hand[2], J.arm[-1].hand[2]) + 1.2];
    var trophy = uni([sph([tc[0], tc[1] - 8.6, tc[2]], 3.3), cone([tc[0], tc[1] - 5.4, tc[2]], [tc[0], tc[1] - 2.8, tc[2]], 2.6, 1.3),
      cone([tc[0], tc[1] - 2.8, tc[2]], [tc[0], tc[1] + 1.4, tc[2]], 1.2, 1.9), rbox([tc[0], tc[1] + 2.6, tc[2]], [3.2, 1.0, 2.6], 0.5)]);
    add('trophy', 'trophy', function(p){
      var y = p[1] - tc[1];
      if (y > -5.6 && y < -3.0 && (Math.floor(p[0]) + Math.floor(p[1])) % 2) return { m: 'gold', dt: -1 };
      return 'gold';
    }, trophy, [tc[0], tc[1] - 3, tc[2]], 9, { gloss: 2 });
  }

  /* the head and the ears. Everything from here down is drawn at the size it
     always was around the head's centre and then scaled to HEAD_K, so every
     hairstyle, the beard, the band and the cap shrink with the head exactly */
  var headFrom = P.length;
  var headF = ell(H, HR);
  [-1, 1].forEach(function(s){ add('ear' + s, 'head', 'skin', ell([hx + s * 7.0, hy + 1.2, hz - 0.8], [1.3, 2.0, 1.2]), [hx + s * 7, hy + 1, hz], 2.6); });
  /* A HEAD IS NOT A BALL. Seen from the corner a ball with dots on it looks
     away from you; what says which way a face points is its profile. So the
     skull carries a jaw and a chin that come forward under it, a brow ridge,
     cheekbones and a nose that stands off the face and catches the light. */
  var faceF = (function(){
    var jaw = ell([hx, hy + 3.6, hz + 2.4], [5.4, 3.6, 4.8]);
    var chin = ell([hx, hy + 6.4, hz + 4.6], [2.4, 1.7, 2.0]);
    var brow = ell([hx, hy - 1.9, hz + 5.6], [5.0, 1.3, 2.0]);
    var cheeks = [-1, 1].map(function(s){ return ell([hx + s * 3.6, hy + 1.6, hz + 4.9], [1.9, 1.6, 1.8]); });
    var nose = cone([hx, hy - 0.2, hz + 7.2], [hx, hy + 2.3, hz + 7.9], 0.45, 0.75);
    return function(p){ var d = smin(headF(p), jaw(p), 1.6); d = smin(d, chin(p), 1.0); d = smin(d, brow(p), 0.9);
      d = smin(d, cheeks[0](p), 0.8); d = smin(d, cheeks[1](p), 0.8); return smin(d, nose(p), 0.5); };
  })();
  add('head', 'head', 'skin', faceF, H, 9.4, { bias: 0.06 });

  /* hair: every style a volume over the head */
  var hs = L.hair, hatK = ST && ST.hat ? ST.hat.k : '';
  if (cap || hatK) hs = hs === 'afro' ? 'afrocap' : hs === 'long' || hs === 'twists' || hs === 'bald' ? hs : 'buzz';
  var shellF = function(t){ return ell(H, [HR[0] + t, HR[1] + t, HR[2] + t]); };
  /* what of the head the hair covers: above the hairline, the sides down
     past the temples, and all of the back */
  var hairline = function(p, low){ var l = local(p);
    if (l[1] < -4.3 + Math.max(0, -l[2]) * 0.35) return true;
    if (l[2] < -1.0 && l[1] < (low || 3.0)) return true;
    return Math.abs(l[0]) > 5.6 && l[1] < -0.6 && l[2] < 3.0; };
  var onHair = function(f, low){ return function(p){ return hairline(p, low) ? f(p) : Math.max(f(p), 0.6); }; };
  /* a hairline is higher at the front than at the sides, so the forehead
     shows: the cut climbs as it comes round to the face */
  var frontCut = function(p, at){ var l = local(p); return l[1] + at + Math.max(0, l[2] - 2.5) * 0.45; };
  var hairMat = function(fn){ return fn ? function(p){ return fn(local(p)); } : 'hair'; };
  var hb = { gloss: 1, bias: -0.12 };
  if (hs === 'fade' || hs === 'flattop' || hs === 'curly') {
    add('hairf', 'hair', function(p){ var l = local(p); return l[1] > -4.4 && Math.abs(l[0]) > 4.8 ? { m: 'fade', dt: (Math.floor(p[0]) + Math.floor(p[1])) % 2 ? 0 : -1 } : 'hair'; },
      onHair(shellF(0.45)), H, 9, hb);
  }
  if (hs === 'fade') add('hair', 'hair', hairMat(), cut(shellF(1.3), function(p){ return frontCut(p, 3.6); }), H, 9.5, hb);
  else if (hs === 'flattop') add('hair', 'hair', hairMat(function(l){ return l[1] < -10.2 ? { m: 'hair', dt: 1 } : (Math.floor(l[0] + 30) % 3 === 0 ? { m: 'hair', dt: -1 } : 'hair'); }),
    (function(a, b){ return function(p){ return smin(a(p), b(p), 1.0); }; })(cut(shellF(0.9), function(p){ return frontCut(p, 3.4); }), rbox([hx, hy - 8.6, hz - 0.3], [6.4, 3.0, 5.8], 1.1)), [hx, hy - 6, hz], 10, hb);
  else if (hs === 'curly') {
    var bumps = [shellF(0.9)];
    [[-4, -8, 2], [0, -9, 2.6], [4, -8, 2], [-6, -5, 1], [6, -5, 1], [-2, -8, -2.4], [2.4, -8, -2.6], [0, -6.4, 4.2], [-4.6, -6, 3.2], [4.6, -6, 3.2], [-5.6, -6.4, -2.4], [5.6, -6.4, -2.4]].forEach(function(b){
      bumps.push(sph([hx + b[0], hy + b[1], hz + b[2]], 2.5)); });
    add('hair', 'hair', 'hair', cut(uni(bumps), function(p){ return frontCut(p, 3.4); }), [hx, hy - 6, hz], 11, hb);
  }
  else if (hs === 'buzz') add('hair', 'hair', 'buzz', onHair(shellF(0.35)), H, 9, { bias: -0.2 });
  else if (hs === 'braids') add('hair', 'hair', hairMat(function(l){ var r = Math.floor(l[0] + 30.5) % 3; return r === 0 ? { m: 'scalp' } : { m: 'hair', dt: (Math.floor(l[1] + l[2] * 0.4 + 40) + r) % 2 ? 1 : -1 }; }),
    onHair(shellF(0.6)), H, 9, hb);
  else if (hs === 'bun') {
    add('hair', 'hair', hairMat(function(l){ return Math.floor(Math.abs(l[0])) % 2 && l[1] < -4 ? { m: 'hair', dt: -1 } : 'hair'; }), onHair(shellF(0.6)), H, 9, hb);
    add('bun', 'hair', 'hair', sph([hx, hy - 9.6, hz - 2.4], 3.0), [hx, hy - 9.6, hz - 2.4], 3.2, hb);
  }
  else if (hs === 'afro' || hs === 'afrocap') {
    var big = hs === 'afro' ? ell([hx, hy - 3.6, hz - 0.8], [10.0, 9.2, 9.0]) : ell([hx, hy - 1.8, hz - 1.2], [9.2, 6.6, 8.0]);
    var faceHole = function(p){ var l = local(p); return Math.max(-l[1] - 4.6, l[1] - 9, Math.abs(l[0]) - 6.4, -l[2]); };
    add('hair', 'hair', function(p){ return (Math.floor(p[0] * 0.7) * 7 + Math.floor(p[1] * 0.7) * 13) % 5 === 0 ? { m: 'hair', dt: 1 } : (Math.floor(p[0]) * 3 + Math.floor(p[1]) * 5) % 7 === 0 ? { m: 'hair', dt: -1 } : 'hair'; },
      minus(big, faceHole), [hx, hy - 3, hz], 11, hb);
  }
  else if (hs === 'twists') {
    var ropes = [onHair(shellF(0.9), 5)];
    for (var i = 0; i < 9; i++) { var an = -1.9 + i * (3.8 / 8), rx = Math.sin(an) * 7.6, rz = -Math.cos(an) * 5.4 + 1.0;
      if (Math.abs(rx) < 4 && rz > 0) continue;
      ropes.push(cone([hx + rx, hy - 3, hz + rz], [hx + rx * 1.05, hy + 5.4 + (i % 2), hz + rz - 0.6], 1.4, 1.1)); }
    add('hair', 'hair', function(p){ var c = Math.floor(Math.atan2(p[0] - hx, -(p[2] - hz)) * 3 + 20); return (c + Math.floor(p[1] * 0.9)) % 3 === 0 ? { m: 'hair', dt: -1 } : 'hair'; },
      uni(ropes), [hx, hy, hz], 12, hb);
  }
  else if (hs === 'long') {
    add('hair', 'hair', 'hair', uni([onHair(shellF(1.0), 6),
      ell([hx, hy + 4.6, hz - 3.6], [7.0, 9.0, 3.2]),
      cone([hx - 6.4, hy - 2.6, hz + 0.6], [hx - 6.6, hy + 7.8, hz - 0.6], 1.9, 1.6),
      cone([hx + 6.4, hy - 2.6, hz + 0.6], [hx + 6.6, hy + 7.8, hz - 0.6], 1.9, 1.6)]), [hx, hy + 2, hz], 13, hb);
  }
  /* facial hair */
  if (L.beard === 'goatee') add('beard', 'beard', 'beard', ell([hx, hy + 7.0, hz + 5.2], [2.0, 1.7, 1.4]), [hx, hy + 7, hz + 5], 2.4);
  else if (L.beard === 'full') add('beard', 'beard', 'beard', cut(shellF(0.55), function(p){ var l = local(p);
    return Math.max(2.4 - l[1], -(l[2] + 2), (Math.abs(l[0]) < 2.0 && l[1] < 5.8 && l[2] > 4) ? 1 : -1); }), H, 9);
  /* the band, the cap */
  if (hatK) streetHat(hatK, shellF, local, hx, hy, hz);
  if (ST && ST.eyes) streetEyes(hx, hy, hz);
  if (o.band && !cap && !hatK) add('band', 'band', 'band', cut(shellF(0.55), function(p){ var l = local(p); return Math.abs(l[1] + 4.6) - 1.0; }), H, 9);
  if (cap) {
    add('cap', 'cap', function(p){ var l = local(p);
      if (l[2] > 4.2 && Math.abs(l[0]) < 1.4 && l[1] > -7.2 && l[1] < -4.6) return 'logo';
      return l[1] < -8.6 && Math.abs(l[0]) < 0.8 ? { m: 'cap', dt: -1 } : 'cap'; },
      cut(shellF(1.7), function(p){ return local(p)[1] + 2.4; }), H, 10, { gloss: 1 });
    add('brim', 'cap', 'cap', cut(ell([hx, hy - 2.6, hz + 5.6], [7.0, 0.85, 4.6]), function(p){ return -(local(p)[2] - 3.0); }), [hx, hy - 2.6, hz + 7], 7.5);
  }
  /* ─── OFF COURT: street clothes ─────────────────────────────────────────
     Drawn only when the caller asks for the street look (paint's ctx). Each
     garment is a VOLUME, not paint on the body: cloth is the body's own
     surface pushed out (an SDF offset), so it follows every pose the limb
     takes. The catalogue (catalog.js) hands over a shape (k) and its colours;
     this file knows the shapes and nothing about prices or names. */
  /* smin blends two distances; these blend two shapes */
  function smf(a, b, k){ return function(p){ return smin(a(p), b(p), k); }; }
  function streetTop(){ return (ST.top && ST.top.k) || 'tee'; }
  function streetLegF(G, s){
    var kd = (ST.bottom && ST.bottom.k) || 'jeans', top = [G.hip[0] - s * 0.55, G.hip[1] - 2.2, 0];
    /* an athlete's legs are long and lean: a straight leg from a narrow seat,
       barely tapering. Cut wide, the thighs flared out past the hem of the
       shirt and the figure read as curvy. */
    if (kd === 'sweats') return uni([cone(top, G.kn, 2.85 + g * 0.3, 2.6 + g * 0.16), cone(G.kn, [G.ank[0], G.ank[1] - 0.5, G.ank[2]], 2.6 + g * 0.12, 1.95)]);
    return uni([cone(top, G.kn, 2.6 + g * 0.3, 2.35 + g * 0.14), cone(G.kn, [G.ank[0], G.ank[1] + 0.4, G.ank[2]], 2.35 + g * 0.1, 2.25)]);
  }
  function streetLegMat(G, s){
    var kd = (ST.bottom && ST.bottom.k) || 'jeans';
    return function(p){
      var tA = clamp01((p[1] - G.hip[1]) / Math.max(1, G.ank[1] - G.hip[1])), ax = G.hip[0] + (G.ank[0] - G.hip[0]) * tA, lx = (p[0] - ax) * s, toAnk = G.ank[1] - p[1];
      if (kd === 'sweats') {
        if (toAnk < 1.3) return { m: 'btm', dt: Math.floor(p[0] * 2) % 2 ? -1 : 0 };
        /* one stripe down the outside of the leg, as wide as a finger: the
           cloth's radius falls from the hip to the cuff, so the stripe follows it */
        var rr = 3.45 - 1.15 * tA + g * 0.2;
        if (lx > rr - 0.62 && Math.abs(p[2] - G.kn[2] * tA) < 1.25) return 'btm2';
        return 'btm';
      }
      /* jeans: a rolled cuff, a lighter fade down the front of the thigh, and the outer seam */
      if (toAnk < 0.9) return { m: 'btm', dt: 1 };
      if (lx > 2.35 && Math.abs(p[2]) < 0.7) return { m: 'btm', dt: -1 };
      if (p[2] > 1.6 && tA > 0.12 && tA < 0.45 && (Math.floor(p[0] * 1.7) + Math.floor(p[1] * 1.1)) % 3 === 0) return { m: 'btm', dt: 1 };
      return 'btm';
    };
  }
  /* CLOTH HANGS, IT DOES NOT CLING. Offsetting the body's own surface made a
     tee follow every muscle under it: the pecs read as a bust, the waist
     pinched in and the seat flared out, which is the silhouette of somebody
     else. A shirt on a basketball player drops straight from broad shoulders
     to the hem, so it is the chest's ellipse blended into a column the width
     of the ribcage, carrying a heavy man's belly when he has one, and nothing
     of the pecs, lats or shoulder blades. */
  function dropF(off, hemY){
    /* a V: an elliptic column whose width runs from the shoulders down to
       narrow hips, flat front to back, under a dome across the shoulders */
    var shX = (6.9 + bw * 0.8) * sw + Math.max(0, g) * 0.3, yT = C0[1] - 2.4 * ts, yB = hemY + 1.0;
    var rxT = shX * 0.9 + off, rxB = cR[0] * 0.8 + off + g * 0.45, rzT = cR[2] * 0.88 + off * 0.8, rzB = cR[2] * 0.74 + off * 0.8 + Math.max(0, g) * 0.75;
    var colF = function(p){
      var t = clamp01((p[1] - yT) / (yB - yT)), rx = rxT + (rxB - rxT) * t, rz = rzT + (rzB - rzT) * t;
      var e = Math.hypot((p[0] - CX) / rx, (p[2] + 0.2) / rz);
      return Math.max((e - 1) * Math.min(rx, rz) * 0.9, yT - p[1]);
    };
    var dome = ell([CX, yT + 0.4, -0.3], [shX + off * 0.6, 2.4 * ts + off * 0.5, cR[2] * 0.82 + off * 0.8]);
    return cut(smf(dome, colF, 1.6), function(q){ return q[1] - hemY; });
  }
  function streetTorso(){
    var kd = streetTop(), infl = kd === 'hoodie' ? 0.7 : 0.3, hemY = W0[1] + (kd === 'hoodie' ? 4.2 : 3.6) * ts;
    var mk = function(y, dx, front){ var nd = front ? 1.0 : 0.3; return function(w){ var t = dx / w; return t < 1 ? 23.9 + nd * (1 - t * t) : -1; }; };
    add('torso', 'torso', function(p){
      var sx = p[0] - CX, dx = Math.abs(sx), y = 29.2 + (p[1] - C0[1]) / ts, front = p[2] > 0.6, neck = mk(y, dx, front);
      if (y < neck(2.7)) return 'skin';
      if (kd === 'tee' && y < neck(3.4) + 0.65) return { m: 'top2' };
      if (kd === 'hoodie' && y < neck(3.4) + 0.45) return { m: 'top', dt: -1 };
      if (p[1] > hemY - 0.8) return { m: 'top', dt: kd === 'hoodie' ? (Math.floor(p[0] * 2) % 2 ? -1 : 0) : -1 };
      if (kd === 'hoodie' && front) {
        /* the drawstrings, and the kangaroo pocket across the belly */
        if (Math.abs(dx - 1.25) < 0.32 && y > 24.4 && y < 28.6) return { m: 'top2', t: y > 28.0 ? 3 : 2 };
        if (y > 33.2 && y < 37.4 && dx < 4.2) return (Math.abs(y - 33.2) < 0.42 || Math.abs(dx - (3.4 + (y - 33.2) * 0.2)) < 0.38) ? { m: 'top', dt: -1 } : 'top';
      }
      return 'top';
    }, dropF(infl, hemY), [CX, (C0[1] + W0[1]) / 2 + 1, 0], 13 * Math.max(1, ts, sw) + Math.max(0, g));
    /* the seat of the trousers, under the hem */
    /* the seat is as narrow as an athlete's hips, narrower than his shoulders */
    var sy0 = W0[1] - 0.4, shW = (4.9 + bw * 0.3) * sw + g * 0.55;
    var bk = (ST.bottom && ST.bottom.k) || 'jeans';
    add('seat', 'seat', function(p){ var y = p[1] - sy0; if (y < 0.9) return bk === 'jeans' ? { m: 'btm', dt: -1 } : 'btm2'; return 'btm'; },
      cut(ell([CX, sy0 + 2.8 * ts, -0.2], [shW, 3.7 * ts, 3.8 + Math.max(0, g) * 0.45]), function(q){ return sy0 - q[1]; }), [CX, sy0 + 3 * ts, 0], 9 + Math.max(0, g));
    var out = ST.outer && ST.outer.k;
    if (out === 'varsity') {
      var oHem = W0[1] + 4.6 * ts;
      add('outer', 'outer', function(p){
        var sx = p[0] - CX, dx = Math.abs(sx), y = 29.2 + (p[1] - C0[1]) / ts, front = p[2] > 0.8, neck = mk(y, dx, front);
        if (y < neck(3.0)) return 'skin';
        if (y < neck(3.9) + 0.9) return (Math.floor(y * 2.2) % 2) ? 'out3' : 'out2';
        /* worn open: the front shows the top underneath, widening to the collar */
        var open = 1.05 + Math.max(0, 27.4 - y) * 0.55;
        if (front && dx < open) return kd === 'hoodie' ? 'top' : 'top';
        if (front && dx < open + 0.55) return { m: 'out1', dt: -1 };
        if (front && Math.abs(dx - (open + 1.1)) < 0.35 && Math.floor(y) % 3 === 0) return { m: 'out3', t: 3 };
        if (p[1] > oHem - 1.5) return Math.floor((p[1] - oHem) * 2.4) % 2 ? 'out3' : 'out2';
        /* a chenille letter patch on the left chest */
        if (front && sx > 2.4 && sx < 5.0 && y > 25.6 && y < 28.8) return (sx < 2.8 || sx > 4.6 || y < 26.0 || y > 28.4) ? 'out3' : 'out2';
        return 'out1';
      }, dropF(infl + 0.95, oHem), [CX, (C0[1] + W0[1]) / 2 + 1, 0], 14 * Math.max(1, ts, sw) + Math.max(0, g));
    }
  }
  /* what an arm is wearing: its material, how far the cloth stands off it,
     and the shoulder's material */
  function streetArm(A){
    var out = ST.outer && ST.outer.k, kd = streetTop(), wr = A.wr, el = A.el, sh = A.sh;
    var along = function(p){ var ux = el[0] - sh[0], uy = el[1] - sh[1], uz = el[2] - sh[2], L2 = ux * ux + uy * uy + uz * uz || 1;
      return ((p[0] - sh[0]) * ux + (p[1] - sh[1]) * uy + (p[2] - sh[2]) * uz) / L2; };
    var cuff = function(p, a, b){ return Math.hypot(p[0] - wr[0], p[1] - wr[1], p[2] - wr[2]) < 1.5 ? a : b; };
    if (out === 'varsity') return { r: 0.85, d: 'out2', m: function(p){ return cuff(p, Math.floor(p[1] * 2.6) % 2 ? 'out3' : 'out2', 'out2'); } };
    if (kd === 'hoodie') return { r: 0.55, d: 'top', m: function(p){ return cuff(p, { m: 'top', dt: Math.floor(p[1] * 2.6) % 2 ? -1 : 0 }, 'top'); } };
    return { r: 0.12, d: 'top', m: function(p){ var t = along(p); return t < 0.5 ? 'top' : t < 0.6 ? { m: 'top', dt: -1 } : 'skin'; } };
  }
  function streetNeck(){
    if (streetTop() === 'hoodie') {
      /* the hood, down: a soft roll of cloth behind the neck and round the collar */
      var hc = [CX, J.neck[1] + 1.6 * ts, -3.0];
      add('hood', 'hood', function(p){ return p[2] > -1.6 ? { m: 'top', dt: -1 } : 'top'; },
        smf(ell(hc, [4.6 * sw + g * 0.2, 2.5, 2.9]), torus([CX, J.neck[1] + 2.4 * ts, -0.6], 3.2 * sw, 1.05), 1.2), hc, 7.5);
    }
    if (ST.chain && ST.chain.k === 'chain') {
      /* a chain that drapes: a ring laid over the collarbones, its front
         dropping onto the chest, with a pendant where it falls lowest */
      var cc = [CX, J.neck[1] + 1.4 * ts, 2.0 + Math.max(0, bw) * 0.6 + Math.max(0, g) * 0.4], R = 3.9 * sw + Math.max(0, g) * 0.25, a = 0.82, ca = Math.cos(a), sa = Math.sin(a);
      add('chain', 'chain', function(p){ return Math.floor((p[0] + p[2]) * 2.2) % 2 ? { m: 'chainc', dt: 1 } : 'chainc'; }, function(p){
        var x = p[0] - cc[0], y = p[1] - cc[1], z = p[2] - cc[2], yy = y * ca - z * sa, zz = y * sa + z * ca;
        return Math.hypot(Math.hypot(x, zz) - R, yy) - 0.42; }, cc, R + 1.5, { gloss: 2 });
      var pc = [CX, cc[1] + R * sa + 1.0, cc[2] + R * ca + 0.2];
      add('pendant', 'chain', 'chainc', rbox(pc, [0.95, 1.2, 0.4], 0.35), pc, 1.9, { gloss: 2 });
    }
  }
  function streetHat(kd, shellF, local, hx, hy, hz){
    if (kd === 'beanie') {
      var bF = smf(cut(shellF(1.25), function(p){ var l = local(p); return l[1] + 1.5 - Math.max(0, -l[2]) * 0.45; }), ell([hx, hy - 7.4, hz - 0.4], [5.8, 3.6, 5.6]), 1.6);
      add('hat', 'hat', function(p){ var l = local(p);
        if (l[1] > -4.6) return { m: 'hat2', dt: Math.floor(Math.atan2(l[0], l[2]) * 7 + 50) % 2 ? -1 : 0 };
        return (Math.floor(l[0] * 0.9 + 30) + Math.floor(l[1] * 1.2 + 30)) % 3 === 0 ? { m: 'hat', dt: -1 } : 'hat'; }, bF, [hx, hy - 4, hz], 11, { bias: -0.05 });
      return;
    }
    if (kd === 'bucket') {
      add('hat', 'hat', function(p){ var l = local(p); return Math.abs(l[1] + 4.2) < 0.5 ? 'hat2' : 'hat'; },
        cut(smf(shellF(1.6), ell([hx, hy - 8.0, hz - 0.3], [6.4, 3.0, 6.0]), 1.4), function(p){ return local(p)[1] + 3.6; }), [hx, hy - 5, hz], 11);
      add('brim', 'hat', { m: 'hat', dt: -1 }, function(p){ var l = local(p), rr = Math.hypot(l[0], (l[2] - 0.4) / 0.96), ys = -3.9 + (rr - 7.6) * 0.62;
        return Math.max(Math.abs(l[1] - ys) - 0.42, Math.max(7.2 - rr, rr - 11.0)) * 0.6; }, [hx, hy - 3, hz], 12.5);
    }
  }
  function streetEyes(hx, hy, hz){
    if (ST.eyes.k !== 'shades') return;
    [-1, 1].forEach(function(s){
      add('lens' + s, 'eyes', function(p){ return p[1] - hy < -0.55 ? { m: 'lens', t: 4 } : p[1] - hy < 0.1 ? { m: 'lens', t: 2 } : 'lens'; }, ell([hx + s * 2.85, hy + 0.35, hz + 7.4], [2.5, 1.55, 0.6]), [hx + s * 2.75, hy, hz + 7.3], 2.4, { gloss: 2 });
      add('temple' + s, 'eyes', 'frame', cone([hx + s * 4.7, hy - 0.2, hz + 6.4], [hx + s * 7.35, hy + 0.5, hz - 0.8], 0.36, 0.3), [hx + s * 6, hy, hz + 3], 4.6);
    });
    add('bridge', 'eyes', 'frame', rbox([hx, hy - 0.1, hz + 7.85], [0.95, 0.28, 0.32], 0.2), [hx, hy, hz + 7.8], 1.2);
  }
  var k = MX.k;
  var shrink = function(q){ return [H[0] + (q[0] - H[0]) / k, H[1] + (q[1] - H[1]) / k, H[2] + (q[2] - H[2]) / k]; };
  for (var hi = headFrom; hi < P.length; hi++) (function(q){
    var f0 = q.f, m0 = q.m;
    q.f = function(p){ return k * f0(shrink(p)); };
    if (typeof m0 === 'function') q.m = function(p){ return m0(shrink(p)); };
    q.c = [H[0] + (q.c[0] - H[0]) * k, H[1] + (q.c[1] - H[1]) * k, H[2] + (q.c[2] - H[2]) * k];
    q.r = q.r * k;
  })(P[hi]);
  return P;
}

/* Trace every pixel into the model. */
function trace(P, res){
  res = res || 1;
  var HH = H * res, WW = W * res;
  /* each part's bounds on screen, so a pixel only asks the parts it can see */
  var B = P.map(function(p){ var v = toView(p.c); return [v[0] - p.r, v[1] - p.r, v[0] + p.r, v[1] + p.r, v[2] + p.r, v[2] - p.r]; });
  var hit = [];
  for (var y = 0; y < HH; y++) {
    var row = [];
    for (var x = 0; x < WW; x++) {
      var sx = (x + 0.5) / res, sy = (y + 0.5) / res, cand = [], t0 = -1e9, t1 = 1e9;
      for (var i = 0; i < P.length; i++) { var b = B[i];
        if (sx >= b[0] && sx <= b[2] && sy >= b[1] && sy <= b[3]) { cand.push(i); if (b[4] > t0) t0 = b[4]; if (b[5] < t1) t1 = b[5]; } }
      if (!cand.length) { row.push(null); continue; }
      var t = t0, found = -1, wp = null;
      for (var k = 0; k < 90 && t >= t1; k++) {
        var p = toWorld([sx, sy, t]), d = 1e9, at = -1;
        for (var j = 0; j < cand.length; j++) { var v = P[cand[j]].f(p); if (v < d) { d = v; at = cand[j]; } }
        if (d < 0.02) { found = at; wp = p; break; }
        t -= Math.max(d * 0.85, 0.03);
      }
      if (found < 0) { row.push(null); continue; }
      var f = P[found].f, e = 0.07;
      var n = [f([wp[0] + e, wp[1], wp[2]]) - f([wp[0] - e, wp[1], wp[2]]), f([wp[0], wp[1] + e, wp[2]]) - f([wp[0], wp[1] - e, wp[2]]), f([wp[0], wp[1], wp[2] + e]) - f([wp[0], wp[1], wp[2] - e])];
      var nl = Math.hypot(n[0], n[1], n[2]) || 1;
      n = [n[0] / nl, n[1] / nl, n[2] / nl];
      var vn = rotV(n);
      row.push({ i: found, p: wp, n: vn, z: t });
    }
    hit.push(row);
  }
  return hit;
}

function toneOf(c, part, dt){
  var n = c.n, d = n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2] + (part.bias || 0);
  var gl = c.gloss != null ? c.gloss : part.gloss || 0;
  var t = d > 0.94 ? (gl ? 4 : 3) : d > 0.80 ? 3 : d > 0.40 ? 2 : d > 0.08 ? 1 : 0;
  if (gl > 1 && d > 0.88) t = 4;
  return Math.max(0, Math.min(4, t + (dt || 0)));
}

/* ─── the street look's input ─────────────────────────────────────────────
   paint(look, { ctx: 'street', wear }) draws him off court. wear is what
   catalog.js resolves an outfit to: per slot a shape this file knows (k) and
   its colours (c). Anything unknown is dropped, a slot at a time, so an item
   from a newer catalogue or a hand edit draws as the starter piece rather than
   as a blank. With no ctx nothing here runs and every court sprite is drawn
   exactly as before (check-sprite holds 960 of them). */
var WEAR_KINDS = { top: ['tee', 'hoodie'], outer: ['varsity'], bottom: ['jeans', 'sweats'], shoes: ['sneaker', 'hitop'], hat: ['beanie', 'bucket'], eyes: ['shades'], chain: ['chain'] };
var WEAR_BASE = { top: { k: 'tee', c: ['#f1f0ea', '#dcdad2'] }, bottom: { k: 'jeans', c: ['#3d5a86'] } };
var HEX = /^#[0-9a-f]{6}$/i;
function wearNorm(w){
  var out = {};
  for (var slot in WEAR_KINDS) {
    var it = w && w[slot];
    if (it && WEAR_KINDS[slot].indexOf(it.k) >= 0) out[slot] = { k: it.k, c: (Array.isArray(it.c) ? it.c : []).filter(function(x){ return HEX.test(x); }).slice(0, 3) };
    else if (WEAR_BASE[slot]) out[slot] = WEAR_BASE[slot];
  }
  return out;
}
function wearKey(o){ return o && o.ctx === 'street' ? JSON.stringify(wearNorm(o.wear)) : ''; }

/* Paint the whole figure into a grid of colours. opts:
     c1, c2   the jersey's two colours
     num      the number on the chest
     pose     stand, ball, up, trophy, suit or cap, or a moving frame
     age      greys the hair from 33
     frame    0 or 1, the breath
     dress    suit or cap, for a moving frame
     parts    hand back the part in every cell instead of a colour */
function paint(look, opts){
  var o = opts || {}, was = YAW;
  setYaw(o.yaw);
  try { return paint0(look, o); } finally { setYaw(was); }
}
function paint0(look, o){
  var L = normal(look);
  /* A REAL PLAYER IS DRAWN IN HIS CLUB'S KIT AND WITH NO FACE: a bald slate
     head, no beard, no band, nothing that could be read as a likeness. It is
     the rig and the light, so he stands in the same 3D style as you. */
  if (o.faceless) L = Object.assign({}, L, { hair: 'bald', beard: 'none', band: 'none', sleeve: 'none' });
  var pose = o.pose || 'stand';
  var AN = ANIM[pose] || null;
  var ST = o.ctx === 'street' && !o.faceless ? wearNorm(o.wear) : null;
  var suit = !ST && (pose === 'suit' || pose === 'cap' || !!(AN && (o.dress === 'suit' || o.dress === 'cap')));
  var cap = !ST && (pose === 'cap' || !!(AN && o.dress === 'cap'));
  var c1 = o.c1 || '#2b3242', c2 = o.c2 || '#c9ccd6';
  if (contrast(c1, c2) < 1.4) c2 = inkOn(c1);
  var age = +o.age || 0;
  var BD = bodyOf(L.build), bw = BD.bw, am = BD.am;
  var f = AN || STILL[pose] || STILL.stand;
  var MX = metrics(L), res = Math.max(1, Math.min(4, Math.round(+o.res || 1)));
  /* o.breath, when given, is how far the chest has risen in cells (live()
     passes a fraction, so a breath is a pixel at the fine resolution rather
     than the whole cell frame 1 lifts). Absent, it is frame 1's old rule. */
  var J = skeleton(f, bw, am, o.breath != null ? +o.breath : o.frame === 1 && !AN, MX);
  var HH = H * res, WW = W * res;
  var bandHex = L.band === 'none' ? null : L.band === 'club' ? c2 : FIXED[L.band];
  var slvHex = L.sleeve === 'none' ? null : L.sleeve === 'club' ? c2 : FIXED[L.sleeve];
  var num = pose === 'trophy' || suit || ST ? '' : String(o.num == null ? '' : o.num).slice(0, 2);
  var model = build(L, { suit: suit, cap: cap, pose: pose, num: num, band: !!bandHex && !ST, sleeve: !!slvHex && !ST, kit: kitOf(c1, c2, o.kit), res: res, st: ST }, J);
  var hit = trace(model, res);

  if (o.parts) return hit.map(function(r){ return r.map(function(c){ return c ? model[c.i].n : null; }); });

  /* the colours */
  var skinHex = SKINS[L.skin];
  var hairHex = HAIR_COLORS[L.hc][1];
  if (age >= 33) hairHex = mix(hairHex, '#c9c9c4', Math.min(0.75, (age - 32) / 12));
  var natural = L.bc >= 0 ? HAIR_COLORS[L.bc][1] : L.hc >= 5 ? HAIR_COLORS[L.hc === 5 ? 4 : 1][1] : HAIR_COLORS[L.hc][1];
  var beardHex = mix(natural, '#000000', 0.12);
  if (age >= 33) beardHex = mix(beardHex, '#c9c9c4', Math.min(0.7, (age - 32) / 12));
  if (o.faceless) skinHex = FACELESS;
  var SK = skinRamp(skinHex), HRm = hairRamp(hairHex);
  var shoeHex = suit ? '#1c1f27' : L.shoes === 'club' ? c1 : FIXED[L.shoes];
  var R = {
    skin: SK, hair: HRm, fade: hairRamp(mix(hairHex, skinHex, 0.5)), buzz: hairRamp(mix(hairHex, skinHex, 0.22)), scalp: skinRamp(mix(skinHex, hairHex, 0.35)),
    beard: hairRamp(beardHex), jersey: ramp(c1), trim: ramp(c2), pat: ramp(c2), third: ramp(contrast(c1, '#f4f2ec') >= 1.8 && contrast(c2, '#f4f2ec') >= 1.4 ? '#f4f2ec' : '#16181f'), ink: ramp(inkOn(c1, c2)), sock: ramp('#f1f0ea'),
    shoe: ramp(shoeHex), sole: ramp('#e8e2d4'), lace: ramp('#f4f1ea'), band: ramp(bandHex || '#ffffff'), sleeve: ramp(slvHex || '#ffffff'),
    trouser: ramp('#2a2e38'), jacket: ramp(mix(c1, '#14161c', 0.66)), shirt: ramp('#f1f1ec'), cuff: ramp('#f1f1ec'), pocket: ramp(c2),
    tie: ramp(contrast(c1, mix(c1, '#14161c', 0.66)) >= 1.6 ? c1 : c2), cap: ramp(c1), logo: ramp(c2), gold: ramp('#e3a92f'), ball: ramp('#e2762a'),
  };
  if (ST) {
    /* the street colours: each slot's own, with a sensible second shade when
       the catalogue gives one colour */
    var cc = function(slot, i, d){ var it = ST[slot]; return it && it.c[i] ? it.c[i] : d; };
    var t0 = cc('top', 0, '#f1f0ea'), o0 = cc('outer', 0, '#1f3a6b'), b0 = cc('bottom', 0, '#3d5a86');
    R.top = ramp(t0); R.top2 = ramp(cc('top', 1, mix(t0, '#000000', 0.18)));
    R.out1 = ramp(o0); R.out2 = ramp(cc('outer', 1, '#f1ede2')); R.out3 = ramp(cc('outer', 2, mix(o0, '#f4f2ec', 0.6)));
    R.btm = ramp(b0); R.btm2 = ramp(cc('bottom', 1, mix(b0, '#f4f2ec', 0.7)));
    var hk = cc('hat', 0, '#2a2e38'); R.hat = ramp(hk); R.hat2 = ramp(cc('hat', 1, mix(hk, '#000000', 0.2)));
    R.lens = ramp(cc('eyes', 1, '#1a1c22')); R.frame = ramp(cc('eyes', 0, '#16181d'));
    R.chainc = ramp(cc('chain', 0, '#e3a92f'));
    if (ST.shoes) { R.shoe = ramp(cc('shoes', 0, shoeHex)); R.trim = ramp(cc('shoes', 1, '#16181f')); R.sole = ramp(cc('shoes', 2, '#e8e2d4')); }
  }
  /* tones, and what each pixel is made of */
  var T = [], M = [];
  for (var y = 0; y < HH; y++) { T.push([]); M.push([]); for (var x = 0; x < WW; x++) {
    var c = hit[y][x];
    if (!c) { T[y].push(-1); M[y].push(null); continue; }
    var part = model[c.i], mm = typeof part.m === 'function' ? part.m(c.p) : part.m;
    if (typeof mm === 'string') mm = { m: mm };
    c.gloss = mm.gloss;
    M[y].push(mm.m);
    T[y].push(mm.t != null ? mm.t : toneOf(c, part, mm.dt));
  } }
  var g = function(x, y){ return y >= 0 && y < HH && x >= 0 && x < WW ? hit[y][x] : null; };
  var gid = function(c){ return model[c.i].g; };
  var baseOf = function(c){ var m = model[c.i].m; return typeof m === 'string' ? m : model[c.i].n; };
  /* a contact shadow: a part with another IN FRONT of it just above or beside */
  for (var y2 = 0; y2 < HH; y2++) for (var x2 = 0; x2 < WW; x2++) { var c2_ = hit[y2][x2]; if (!c2_) continue;
    var dirs = [[0, -1], [1, 0], [-1, 0]];
    for (var k = 0; k < 3; k++) { var q = g(x2 + dirs[k][0], y2 + dirs[k][1]);
      if (q && gid(q) !== gid(c2_) && q.z > c2_.z + 1.2) { T[y2][x2] = Math.max(0, T[y2][x2] - 1); break; } } }
  var out = [];
  for (var y3 = 0; y3 < HH; y3++) { out.push(new Array(WW).fill(null)); for (var x3 = 0; x3 < WW; x3++) {
    if (!hit[y3][x3]) continue; var r = R[M[y3][x3]] || R.skin; out[y3][x3] = r[T[y3][x3]]; } }
  /* the inner contour: a front part's edge where it crosses a part behind it */
  for (var y4 = 0; y4 < HH; y4++) for (var x4 = 0; x4 < WW; x4++) { var c4 = hit[y4][x4]; if (!c4) continue;
    var r4 = R[M[y4][x4]] || R.skin, dd = [[0, 1], [1, 0], [-1, 0]];
    for (var k4 = 0; k4 < 3; k4++) { var q4 = g(x4 + dd[k4][0], y4 + dd[k4][1]);
      if (q4 && gid(q4) !== gid(c4) && q4.z < c4.z - 1.2 && (baseOf(q4) !== baseOf(c4) || q4.z < c4.z - 2.4)) { out[y4][x4] = r4[Math.min(T[y4][x4], 1)]; break; } } }
  /* the soft outline, one pixel inside the silhouette, in the part's own shadow */
  var edits = [];
  for (var y5 = 0; y5 < HH; y5++) for (var x5 = 0; x5 < WW; x5++) { if (!hit[y5][x5]) continue;
    var r5 = R[M[y5][x5]] || R.skin, e = function(dx, dy){ return !g(x5 + dx, y5 + dy); };
    var sh = e(0, 1) || e(1, 0), lit = e(0, -1) || e(-1, 0);
    if (!sh && !lit) continue;
    var t5 = T[y5][x5];
    edits.push([x5, y5, sh ? r5[Math.max(0, Math.min(t5 - 1, 1))] : r5[Math.max(0, Math.min(t5 - 1, 2))]]); }
  edits.forEach(function(ed){ out[ed[1]][ed[0]] = ed[2]; });

  /* At a single resolution trace (the court sprites) the number is stamped
     on the screen, after the light, the way a sprite artist letters a
     jersey; a finer trace prints it on the cloth instead, in build. Mapped onto the model in world cells
     at this resolution, the camera's pitch dropped whole rows of a digit and a 2 came out broken. It
     only lands on jersey cloth (or the club's pattern), takes the cloth's own tone, and so bends with
     the chest and hides behind an arm in front of it. */
  if (num !== '' && !suit && res < 2) {
    var BD2 = bodyOf(L.build), nv = toView([CX - SY * 2.4, J.chest[1] + 3.0 * MX.ts, 4.4 + BD2.bw * 0.3 + MX.gw * 0.3]);
    /* a 3 by 5 numeral, each cell `res` pixels: on a chest a few cells wide
       the old 4 by 6 one covered the shirt from the neck to the shorts */
    /* a chest turned from the camera is narrower, so the number narrows with
       it rather than running off the far side */
    var fxq = Math.max(0.55, Math.abs(CY)), dw = Math.max(2, Math.round(3 * res * fxq)), dg = Math.max(1, Math.round(res * fxq));
    var nw2 = num.length * dw + (num.length - 1) * dg, nx0 = Math.round(nv[0] * res - nw2 / 2), ny0 = Math.round(nv[1] * res - 2.5 * res);
    for (var dI = 0; dI < num.length; dI++) { var DG = DIG35[num[dI]]; if (!DG) continue;
      for (var gy = 0; gy < 5 * res; gy++) for (var gx = 0; gx < dw; gx++) { if (DG[Math.floor(gy / res)][Math.min(2, Math.floor(gx * 3 / dw))] !== '1') continue;
        var px = nx0 + dI * (dw + dg) + gx, py = ny0 + gy, hc_ = g(px, py);
        if (!hc_ || model[hc_.i].n !== 'torso' || (M[py][px] !== 'jersey' && M[py][px] !== 'pat')) continue;
        out[py][px] = R.ink[Math.max(1, Math.min(T[py][px], 3))]; } }
  }

  if (o.faceless) return out;
  /* THE FACE IS ON THE HEAD, NOT ON THE SCREEN. Every feature is a point on
     the skull in the head's own units, projected through the camera, so from
     the 3/4 corner the near eye sits in the middle of the face and the far one
     close to the cheek's edge, and the mouth turns with the jaw. A feature
     that lands off the head (behind the far cheek) is simply not drawn.
     A player's face, not a doll's: a brow, the socket's shadow under it, a
     small dark eye, a nose that is only its shadow side, and a mouth. */
  var k = MX.k, H0 = J.head;
  var at = function(lx, ly, lz){ var v = toView([H0[0] + lx * k, H0[1] + ly * k, H0[2] + lz * k]); return [Math.floor(v[0] * res), Math.floor(v[1] * res)]; };
  var onHead = function(x, y){ var c = g(x, y); return c && model[c.i].n === 'head'; };
  var put = function(x, y, col){ if (onHead(x, y)) out[y][x] = col; };
  var block = function(x, y, w, h, col){ for (var yy = 0; yy < h; yy++) for (var xx = 0; xx < w; xx++) put(x + xx, y + yy, col); };
  var pupil = mix(SK[0], '#120a0c', 0.55), brow = L.hair === 'bald' || L.hc === 5 ? mix(SK[0], '#120a0c', 0.25) : mix(HRm[0], '#120a0c', 0.2);
  var big = res >= 3, ew = big ? 2 : 1, eh = big ? 2 : 1;
  /* how squarely a point on the face is turned to the camera: 1 facing, 0 edge on */
  var faces = function(lx, lz){ var n = rotV([lx / 7.3, 0, lz / 7.6]), l = Math.hypot(n[0], n[1], n[2]) || 1; return n[2] / l; };
  [-1, 1].forEach(function(sd){
    var lx = sd * 2.6, lz = 7.6 * Math.sqrt(1 - Math.pow(lx / 7.3, 2)), fc = faces(lx, lz);
    if (fc < 0.15) return;
    var w = fc < 0.55 ? 1 : ew, e = at(lx, 0.2, lz), ex = e[0] - (w > 1 ? 1 : 0), ey = e[1];
    if (res >= 2) { block(ex - 1, ey - 2, w + 1, 1, brow); block(ex - 1, ey - 1, w + 1, 1, SK[1]); }
    if (o.blink) block(ex, ey + eh - 1, w, 1, SK[0]); else block(ex, ey, w, eh, pupil);
  });
  /* the nose is modelled now, and lit like the rest of the head; a painted
     shadow on top of it read as a second nose */
  var m0 = at(-1.3, 3.6, 7.0), m1 = at(1.3, 3.6, 7.0), mc = mix(SK[0], '#4a1820', 0.35);
  for (var mx = Math.min(m0[0], m1[0]); mx <= Math.max(m0[0], m1[0], m0[0] + 1); mx++) put(mx, Math.round(m0[1] + (m1[1] - m0[1]) * ((mx - m0[0]) / Math.max(1, m1[0] - m0[0]))), mc);
  /* stubble and beards are read off where each pixel lands on the skull */
  var loc = function(c){ return [(c.p[0] - H0[0]) / k, (c.p[1] - H0[1]) / k, (c.p[2] - H0[2]) / k]; };
  if (L.beard === 'stubble' || L.beard === 'full' || L.beard === 'goatee') for (var y6 = 0; y6 < HH; y6++) for (var x6 = 0; x6 < WW; x6++) {
    var c6 = hit[y6][x6]; if (!c6 || model[c6.i].n !== 'head') continue;
    var l6 = loc(c6), chin = l6[1] > 4.4 && Math.abs(l6[0]) < 2.2 && l6[2] > 3, jaw = l6[1] > 2.2 && l6[2] > -1 && !(Math.abs(l6[0]) < 2.4 && l6[1] < 4.2);
    if (L.beard === 'stubble' && jaw && (x6 + y6) % 2 === 0) out[y6][x6] = mix(out[y6][x6], R.beard[1], 0.45);
    if ((L.beard === 'goatee' || L.beard === 'full') && chin) out[y6][x6] = mix(out[y6][x6], '#2a1a14', 0.7);
  }
  if (L.hair === 'bald' && !cap) { var sh0 = at(-2.6, -7.6, 3.4); block(sh0[0], sh0[1], Math.max(2, res + 1), Math.max(1, res), SK[4]); }
  return out;
}

/* Where a hand is on screen, in sprite cells, for a moving frame. */
function handOf(pose, s, build, yaw){
  var was = YAW; setYaw(yaw);
  try { return handOf0(pose, s, build); } finally { setYaw(was); }
}
function handOf0(pose, s, build){
  var f = ANIM[pose]; if (!f) return null;
  /* build is a build name, or the whole look, whose height moves the hand */
  var L = build && typeof build === 'object' ? normal(build) : { build: build };
  var v = toView(skeleton(f, bodyOf(L.build).bw, 0, false, metrics(L)).arm[s == null ? 1 : s].hand);
  return [v[0], v[1]];
}

/* ─── props, in the same light ───────────────────────────────────────────
   The ball, the rim, a trophy, a podium, a ring box: the things on the court
   and the stage are sphere traced and painted with the same ramps as the
   player, so a ceremony is one picture rather than a man pasted onto flat
   boxes. A prop is its own little world on its own grid, seen from the same
   camera (12 degrees down, light from the top left). */
function torus(c, R, r){ return function(p){ var q = Math.hypot(p[0] - c[0], p[2] - c[2]) - R; return Math.hypot(q, p[1] - c[1]) - r; }; }
function torusV(c, R, r){ return function(p){ var q = Math.hypot(p[0] - c[0], p[1] - c[1]) - R; return Math.hypot(q, p[2] - c[2]) - r; }; }
function propModel(kind, o){
  var P = [], add = function(n, m, f, c, r, x){ var q = { n: n, g: n, m: m, f: f, c: c, r: r }; for (var k in x || {}) q[k] = x[k]; P.push(q); };
  if (kind === 'ball') {
    var R = o.r || 4.6, c = [o.w / 2, o.h / 2, 0], a = (o.spin || 0) * Math.PI / 4, sq = o.sq || 0;
    add('ball', function(p){
      var x = (p[0] - c[0]) / R, y = (p[1] - c[1]) / R, z = p[2] / R;
      var u = x * Math.cos(a) - y * Math.sin(a), v = x * Math.sin(a) + y * Math.cos(a);
      if (Math.abs(u) < 0.11 || Math.abs(v) < 0.11 || Math.abs(Math.hypot(u - 0.95, z) - 0.62) < 0.09 || Math.abs(Math.hypot(u + 0.95, z) - 0.62) < 0.09) return { m: 'seam', dt: -1 };
      return 'ball';
    }, sq ? ell(c, [R * (1 + sq * 0.5), R * (1 - sq), R * (1 + sq * 0.5)]) : sph(c, R), c, R * (1 + sq) + 0.2, { gloss: 1 });
  } else if (kind === 'trophy') {
    var cx = o.w / 2;
    add('ball', function(p){ var x = p[0] - cx, y = p[1] - 3.6; return Math.abs(x) < 0.45 || Math.abs(y) < 0.45 || Math.abs(Math.hypot(x - 3.2, y) - 2.1) < 0.4 ? { m: 'goldd' } : 'tball'; }, sph([cx, 3.6, 0], 3.3), [cx, 3.6, 0], 3.5, { gloss: 1 });
    add('net', function(p){ return (Math.floor(p[0] * 1.2) + Math.floor(p[1] * 1.2)) % 2 ? { m: 'gold', dt: -1 } : 'gold'; }, cone([cx, 7.2, 0], [cx, 13.4, 0], 4.6, 1.2), [cx, 10.3, 0], 5.4, { gloss: 2 });
    add('lip', 'gold', torus([cx, 7.0, 0], 4.2, 0.6), [cx, 7, 0], 5, { gloss: 2 });
    add('stem', 'gold', cone([cx, 13.4, 0], [cx, 17.6, 0], 1.0, 1.7), [cx, 15.5, 0], 2.8, { gloss: 2 });
    add('base', 'goldd', rbox([cx, 19.2, 0], [4.4, 1.6, 3.0], 0.5), [cx, 19.2, 0], 5.2);
  } else if (kind === 'podium') {
    var px = o.w / 2;
    add('top', 'wood', rbox([px, 3.6, 0], [9.6, 1.4, 4.6], 0.6), [px, 3.6, 0], 10.8);
    add('body', function(p){ return Math.abs(p[0] - px) < 4.2 && p[1] > 9 && p[1] < 15 && p[2] > 2 ? 'logo' : 'pod'; }, rbox([px, 15.6, 0], [8.2, 11.0, 3.6], 0.5), [px, 15.6, 0], 13.5);
    add('mic', 'metal', cone([px + 3.2, -0.6, 2.0], [px + 3.2, 2.6, 2.0], 0.5, 0.6), [px + 3.2, 1, 2], 2.4);
    add('mich', 'micb', sph([px + 3.2, -1.6, 2.0], 1.1), [px + 3.2, -1.6, 2], 1.3);
  } else if (kind === 'ring') {
    var rx = o.w / 2;
    add('box', 'box', rbox([rx, 8.0, 0], [5.0, 2.6, 3.6], 0.6), [rx, 8, 0], 6.5);
    add('ring', 'gold', torusV([rx, 3.4, 0.4], 2.5, 0.95), [rx, 3.4, 0.4], 3.6, { gloss: 2 });
    add('gem', 'gem', sph([rx, 0.9, 1.0], 1.2), [rx, 0.9, 1.0], 1.4, { gloss: 2 });
  } else if (kind === 'rim') {
    /* the front half is the half nearer the camera, whichever way it is turned */
    var hx = o.w / 2, hy = o.h / 2, dep = function(p){ return -(p[0] - hx) * SY + p[2] * CY; };
    var keep = o.half === 'front' ? function(p){ return -dep(p); } : function(p){ return dep(p); };
    add('rim', 'rim', cut(torus([hx, hy, 0], 6.4, 0.85), keep), [hx, hy, 0], 7.4, { gloss: 1 });
  }
  return P;
}
var PROP_INK = { ball: '#e2762a', seam: '#3a1606', tball: '#e8b33c', gold: '#e3a92f', goldd: '#a8761c', wood: '#8a5a32', metal: '#b8bec8', micb: '#2a2e38', box: '#2a1d14', gem: '#9fe3ff', rim: '#e2551d' };
var PROP_SIZE = { ball: [11, 11], trophy: [14, 22], podium: [24, 28], ring: [13, 13], rim: [17, 9] };
function prop(kind, opts){
  var o = Object.assign({}, opts || {}), sz = PROP_SIZE[kind] || [12, 12];
  o.w = o.w || sz[0]; o.h = o.h || sz[1];
  var P = propModel(kind, o), w = o.w, h = o.h, cy = h / 2;
  /* the same camera as the player, turned about the prop's own centre */
  var cx = w / 2;
  var world = function(q){ var x = q[0] - cx, y = q[1] - cy, z = q[2], dy = y * CP - z * SN, rz = y * SN + z * CP;
    return [cx + x * CY - rz * SY, cy + dy, x * SY + rz * CY]; };
  var ink = Object.assign({}, PROP_INK, { pod: o.c1 || '#1a2445', logo: o.c2 || '#c9ccd6' }, o.ink || {});
  var hit = [];
  for (var y = 0; y < h; y++) { var row = []; for (var x = 0; x < w; x++) {
    var sx = x + 0.5, sy = y + 0.5, t = 30, found = -1, wp = null;
    for (var k = 0; k < 90 && t > -30; k++) {
      var q = world([sx, sy, t]), d = 1e9, at = -1;
      for (var j = 0; j < P.length; j++) { var v = P[j].f(q); if (v < d) { d = v; at = j; } }
      if (d < 0.02) { found = at; wp = q; break; }
      t -= Math.max(d * 0.85, 0.03);
    }
    if (found < 0) { row.push(null); continue; }
    var f = P[found].f, e = 0.07;
    var n = [f([wp[0] + e, wp[1], wp[2]]) - f([wp[0] - e, wp[1], wp[2]]), f([wp[0], wp[1] + e, wp[2]]) - f([wp[0], wp[1] - e, wp[2]]), f([wp[0], wp[1], wp[2] + e]) - f([wp[0], wp[1], wp[2] - e])];
    var nl = Math.hypot(n[0], n[1], n[2]) || 1; n = [n[0] / nl, n[1] / nl, n[2] / nl];
    var c = { n: rotV(n) };
    var part = P[found], mm = typeof part.m === 'function' ? part.m(wp) : part.m;
    if (typeof mm === 'string') mm = { m: mm };
    row.push({ i: found, t: toneOf(c, part, mm.dt), m: mm.m });
  } hit.push(row); }
  var out = hit.map(function(r){ return r.map(function(c){ return c ? ramp(ink[c.m] || '#888888')[c.t] : null; }); });
  /* the soft outline, inside the silhouette, as on the player */
  var g = function(x, y){ return y >= 0 && y < h && x >= 0 && x < w ? hit[y][x] : null; };
  var ed = [];
  for (var y2 = 0; y2 < h; y2++) for (var x2 = 0; x2 < w; x2++) { var c2 = hit[y2][x2]; if (!c2) continue;
    if (!g(x2, y2 + 1) || !g(x2 + 1, y2)) ed.push([x2, y2, ramp(ink[c2.m] || '#888888')[Math.max(0, Math.min(c2.t - 1, 1))]]);
    else if (g(x2, y2 + 1).i !== c2.i && Math.abs(g(x2, y2 + 1).t - c2.t) > 1) ed.push([x2, y2, ramp(ink[c2.m] || '#888888')[Math.max(0, c2.t - 1)]]); }
  ed.forEach(function(e2){ out[e2[1]][e2[0]] = e2[2]; });
  return { w: w, h: h, grid: out };
}
var PCACHE = {};
function propCanvas(kind, opts){
  var k = kind + JSON.stringify(opts || {});
  if (PCACHE[k]) return PCACHE[k];
  var pr = prop(kind, opts), cv = document.createElement('canvas');
  cv.width = pr.w; cv.height = pr.h;
  var cx = cv.getContext('2d');
  for (var y = 0; y < pr.h; y++) for (var x = 0; x < pr.w; x++) { var col = pr.grid[y][x]; if (col) { cx.fillStyle = col; cx.fillRect(x, y, 1, 1); } }
  return (PCACHE[k] = cv);
}

/* ─── to the screen ───────────────────────────────────────────────────── */

var CACHE = {}, KEYS = [];
function keyOf(look, o){ return JSON.stringify([normal(look), o.c1, o.c2, o.num, o.pose, o.age >= 33 ? o.age : 0, o.frame || 0, o.scale || 4, !!o.shadow, o.dress || '', o.faceless ? 1 : 0, resFor(o), o.kit || ''].concat(o.ctx === 'street' ? [wearKey(o)] : [])); }
/* THE BIGGER IT IS SHOWN, THE FINER IT IS TRACED. The model has no pixels of
   its own: it is volumes, so a portrait shown at 4 screen pixels a cell is
   traced at 2 sub-cells a cell and drawn 2 pixels each, and at 3 or 6 it is
   traced at 3. Every line (the inner outline, the contour, the numeral, the
   eyes) is then one fine pixel rather than one fat one, which is what makes a
   3D pixel sprite read as a model and not as a mosaic. A court sprite stays
   at 1, because it is drawn small and drawn often. */
function resFor(o){
  if (o.res) return Math.max(1, Math.min(4, Math.round(+o.res)));
  var s = Math.max(1, Math.round(o.scale || 4));
  /* paint() traces at most 4 fine pixels a cell, and a scale it does not
     divide would leave seams, so 5, 7 and the rest draw at 1. Asking paint
     for 5 handed back a 4x grid and canvas() read past its end: the share
     card threw. */
  return s <= 3 ? s : s % 3 === 0 ? 3 : s % 2 === 0 ? 2 : 1;
}

function canvas(look, opts){
  var o = opts || {};
  var s = Math.max(1, Math.round(o.scale || 4));
  var cv = document.createElement('canvas');
  cv.width = W * s; cv.height = H * s;
  var ctx = cv.getContext('2d');
  if (o.shadow !== false) {
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    ctx.beginPath(); ctx.ellipse(22 * s, 63.1 * s, 11 * s, 1.3 * s, 0, 0, Math.PI * 2); ctx.fill();
  }
  var res = resFor(o), px = s / res;
  var g = paint(look, Object.assign({}, o, { res: res }));
  for (var y = 0; y < H * res; y++) for (var x = 0; x < W * res; x++) {
    var c = g[y][x];
    if (!c) continue;
    ctx.fillStyle = c;
    ctx.fillRect(x * px, y * px, px, px);
  }
  return cv;
}
/* A data url, cached, because the same man is drawn on several screens and
   the breath swaps two frames forever. 80 entries is every pose of a career
   and the rival with room spare. */
function url(look, opts){
  var o = opts || {};
  var k = keyOf(look, o);
  if (CACHE[k]) return CACHE[k];
  var u = canvas(look, o).toDataURL('image/png');
  CACHE[k] = u; KEYS.push(k);
  if (KEYS.length > 80) delete CACHE[KEYS.shift()];
  return u;
}
/* An <img> that breathes: two frames, swapped by one timer for every figure
   on the page. Reduced motion gets the first frame and no timer. */
function img(look, opts, cls){
  var o = Object.assign({}, opts || {});
  /* A figure that is not asked to stand still is live (see live()): it
     breathes a pixel and blinks rather than hopping a whole cell. A still one
     is an <img>, which is what a screen that swaps it on every slider drag
     needs. */
  if (!o.still && o.pose !== 'trophy' && !ANIM[o.pose] && typeof document !== 'undefined' && !reducedNow()) return live(look, o, cls);
  o.frame = 0;
  var a = url(look, o);
  var still = o.pose === 'trophy' || o.still || !!ANIM[o.pose];
  var b = still ? a : url(look, Object.assign({}, o, { frame: 1 }));
  return '<img class="rtf-baller' + (cls ? ' ' + cls : '') + '" src="' + a + '"' + (still ? '' : ' data-b0="' + a + '" data-b1="' + b + '"')
    + ' width="' + (W * (o.scale || 4)) + '" height="' + (H * (o.scale || 4)) + '" alt="" draggable="false">';
}
var timer = null, flip = 0;
function breathe(){
  if (timer || typeof window === 'undefined') return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches) return;
  timer = setInterval(function(){
    flip ^= 1;
    var list = document.querySelectorAll('img.rtf-baller[data-b0]');
    for (var i = 0; i < list.length; i++) list[i].src = list[i].getAttribute(flip ? 'data-b1' : 'data-b0');
  }, 720);
}

/* ─── live(): a figure that is alive on the stage ──────────────────────────

   img() is two pictures swapped every 720ms, and frame 1 lifts the chest a
   whole cell, which on the stage is five or six screen pixels: the man hops.
   That is the stop motion. live() is a canvas, and three things make it move
   rather than tick:

   THE BALL IS NOT A FRAME. It is drawn every display frame, on the dribble's
   own curve: locked to the hand while they touch, thrown down accelerating,
   squashed for a beat on the floor, rising and slowing into the hand. Its
   shadow grows as it falls. The arm is eight key poses (the bounce set) chosen
   off the SAME phase, so the hand is always where the ball needs it.

   THE BREATH IS A PIXEL. Standing, the chest rises a fraction of a cell on a
   slow sine, through four levels painted at the fine resolution, and he blinks
   every few seconds. Nothing moves by more than one fine pixel a step.

   NOTHING IS PAINTED ON THE MAIN THREAD AFTER THE FIRST FRAME. A frame is a
   sphere trace, 70ms on a desktop and three or four times that on a phone, and
   a loop needs eight. So they are painted in a Web Worker that loads this same
   file, and the figure stands on its still pose until the loop is ready. With
   no Worker they are painted one per idle moment instead. Frames are cached by
   look, so the next beat of the same scene starts moving at once.

   One requestAnimationFrame drives every live figure on the page, and stops
   when there are none. A figure whose canvas has left the page is dropped.
   Reduced motion draws the still pose and nothing else. */
var SRC = (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) || '';
var BOUNCE_MS = 620, BREATH_MS = 3600, BREATH_AMP = 0.55, BREATH_LV = [0, 0.34, 0.67, 1];
var FIRSTS = {}, FKEYS = [], LIVE = {}, liveN = 0, liveRaf = 0, SETCACHE = {}, SETKEYS = [];
var reducedNow = function(){ return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches; };

/* where the held ball's centre is, in fine pixels, for a bounce frame: the
   same offset the 'ball' pose holds it at */
function heldBall(pose, L, res){
  var f = ANIM[pose], MX = metrics(L), J = skeleton(f, bodyOf(L.build).bw, 0, false, MX);
  var hd = J.arm[1].hand, w = [heldX(hd[0]), hd[1] + 3.2, hd[2] + 1.0], v = toView(w);
  var fl = toView([w[0], GY - 3.7, w[2]]);
  return { x: v[0] * res, y: v[1] * res, fy: fl[1] * res, gy: toView([w[0], GY, w[2]])[1] * res };
}
function gridData(g){
  var h = g.length, w = g[0].length, d = new Uint8ClampedArray(w * h * 4);
  for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) { var c = g[y][x]; if (!c) continue;
    var i = (y * w + x) * 4; d[i] = parseInt(c.slice(1, 3), 16); d[i + 1] = parseInt(c.slice(3, 5), 16); d[i + 2] = parseInt(c.slice(5, 7), 16); d[i + 3] = 255; }
  return { w: w, h: h, d: d };
}
function toCanvas(img){
  var cv = document.createElement('canvas'); cv.width = img.w; cv.height = img.h;
  cv.getContext('2d').putImageData(new ImageData(img.d, img.w, img.h), 0, 0);
  return cv;
}
var worker = null, workerOk = true, jobs = {}, jobN = 0;
function getWorker(){
  if (worker || !workerOk) return worker;
  try {
    if (!SRC || typeof Worker === 'undefined' || typeof Blob === 'undefined') throw 0;
    var code = 'importScripts(' + JSON.stringify(SRC) + ');self.onmessage=function(e){var d=e.data,B=self.RTF_BALLER;'
      + 'try{var g=B._gridData(B.paint(d.look,d.o));self.postMessage({id:d.id,w:g.w,h:g.h,d:g.d},[g.d.buffer]);}catch(x){self.postMessage({id:d.id,err:String(x)});}};';
    worker = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
    worker.onmessage = function(e){ var j = jobs[e.data.id]; delete jobs[e.data.id]; if (j) j(e.data.err ? null : { w: e.data.w, h: e.data.h, d: e.data.d }); };
    worker.onerror = function(){ workerOk = false; worker = null; var js = jobs; jobs = {}; for (var k in js) js[k](null, true); };
  } catch (x) { workerOk = false; worker = null; }
  return worker;
}
/* ONE QUEUE for every frame on the page, painted one at a time, so two
   figures never fight for the worker and a frame needed first (the walk-in)
   can go to the front of it. Off the main thread if we can, one per idle
   moment if not. */
var QUEUE = [], qBusy = false;
function paintAsync(look, o, cb, first){
  QUEUE[first ? 'unshift' : 'push']({ look: look, o: o, cb: cb });
  pump();
}
function pump(){
  if (qBusy || !QUEUE.length) return;
  var j = QUEUE.shift(), w = getWorker();
  qBusy = true;
  var fin = function(img){ qBusy = false; j.cb(img); pump(); };
  if (w) { var id = ++jobN; jobs[id] = function(img, failed){ if (failed) { qBusy = false; QUEUE.unshift(j); pump(); } else fin(img); }; w.postMessage({ id: id, look: j.look, o: j.o }); return; }
  var run = function(){ var g = null; try { g = gridData(paint(j.look, j.o)); } catch (x) {} fin(g); };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 400 }); else setTimeout(run, 30);
}
/* the frames a live figure needs, painted once per look and shared */
function frameSet(look, o, mode){
  /* a walk does not care which pose the beat is in, so it is shared */
  var key = JSON.stringify([normal(look), o.c1, o.c2, o.num, mode === 'walk' ? '' : o.pose, o.age >= 33 ? o.age : 0, o.dress || '', o.faceless ? 1 : 0, o.res, mode, o.kit || ''].concat(o.ctx === 'street' ? [wearKey(o)] : []));
  var fs = SETCACHE[key];
  if (fs) return fs;
  var want = [];
  if (mode === 'dribble') for (var i = 0; i < 8; i++) want.push({ pose: 'bounce' + i });
  else if (mode === 'walk') for (var w2 = 0; w2 < 4; w2++) want.push({ pose: 'walk' + w2 });
  else BREATH_LV.forEach(function(b){ want.push({ breath: b * BREATH_AMP }); want.push({ breath: b * BREATH_AMP, blink: 1 }); });
  fs = SETCACHE[key] = { frames: new Array(want.length), left: want.length, ready: false };
  SETKEYS.push(key); if (SETKEYS.length > 8) delete SETCACHE[SETKEYS.shift()];
  /* in order, one at a time, so a page with two figures never queues sixteen */
  (function next(i){
    if (i >= want.length) { fs.ready = true; kick(); return; }
    paintAsync(look, Object.assign({}, o, want[i]), function(img){
      if (!img) { fs.dead = true; return; }
      fs.frames[i] = toCanvas(img); next(i + 1);
    }, mode === 'walk');
  })(0);
  return fs;
}
var BALLS = {};
function ballArt(res, spin, sq){
  var k = res + ':' + spin + ':' + sq;
  if (BALLS[k]) return BALLS[k];
  var r = 3.7 * res, n = Math.ceil(r * 2 * 1.3) + 4;
  return (BALLS[k] = propCanvas('ball', { r: r, w: n, h: n, spin: spin, sq: sq }));
}
function live(look, opts, cls){
  var o = Object.assign({}, opts || {});
  var s = Math.max(1, Math.round(o.scale || 4)), res = resFor(o);
  o.res = res;
  var enter = !!o.enter; delete o.enter;
  var mode = o.pose === 'ball' ? 'dribble' : 'breath';
  var id = 'L' + (++liveN), base = Object.assign({}, o); delete base.scale;
  /* the first frame is painted here, once per look: the career screen redraws
     on every press and must not repaint the man each time */
  var fk = JSON.stringify([normal(look), base]), first = FIRSTS[fk];
  if (!first) { first = FIRSTS[fk] = gridData(paint(look, Object.assign({}, base, { frame: 0 }))); FKEYS.push(fk); if (FKEYS.length > 40) delete FIRSTS[FKEYS.shift()]; }
  LIVE[id] = { look: look, o: base, mode: mode, res: res, still: first, el: null, born: Date.now(), next: 0, blinkAt: 0, t0: Math.random() * BOUNCE_MS };
  if (!reducedNow() && typeof document !== 'undefined') {
    /* the walk is asked for FIRST, so it is painted before the idle loop */
    if (enter) { LIVE[id].walk = frameSet(look, base, 'walk'); LIVE[id].enter = 1; }
    LIVE[id].set = frameSet(look, base, mode);
  }
  kick(); liveCss();
  /* the size it is shown at is a custom property under a one-class rule, not
     an inline width, so any screen's own rule for .rtf-baller still wins the
     way it did over an <img>'s width attribute */
  return '<canvas class="rtf-baller rtf-live' + (cls ? ' ' + cls : '') + '" data-live="' + id + '" width="' + (W * res) + '" height="' + (H * res) + '"'
    + ' style="--lw:' + (W * s) + 'px;--lh:' + (H * s) + 'px' + (LIVE[id].enter ? ';opacity:0' : '') + '"></canvas>';
}
/* Paint a figure's walk-in ahead of time, in the background, so the first
   scene that walks him on does not wait for it. Same options as live(). */
function warm(look, opts){
  if (reducedNow() || typeof document === 'undefined') return;
  var o = Object.assign({}, opts || {}); o.res = resFor(o); delete o.scale; delete o.enter;
  frameSet(look, o, 'walk');
}
var cssDone = false;
function liveCss(){
  if (cssDone || typeof document === 'undefined' || !document.head) return;
  cssDone = true;
  var st = document.createElement('style');
  st.textContent = 'canvas.rtf-live{width:var(--lw);height:var(--lh);image-rendering:pixelated;image-rendering:crisp-edges;}';
  document.head.insertBefore(st, document.head.firstChild);
}
function kick(){ if (!liveRaf && typeof requestAnimationFrame === 'function') liveRaf = requestAnimationFrame(tick); }
function ease(u){ return u * u * (3 - 2 * u); }
/* THE ENTRANCE. He is drawn facing the camera, so a walk across the stage
   would be a strafe: he walks DOWN-stage instead, toward the camera onto his
   mark, growing from a little smaller and a little further back, on the walk
   cycle. It waits for the walk frames for at most ENTER_WAIT and simply
   appears without them. The size steps by whole fine pixels, so he never
   shimmers. */
var ENTER_MS = 900, ENTER_WAIT = 700, ENTER_FROM = 0.86;
function entrance(L, now){
  var el = L.el, wk = L.walk;
  if (L.enter === 1) {
    if (wk && wk.ready && !wk.dead) { L.enter = 2; L.e0 = now; }
    else if (now - L.born > ENTER_WAIT || (wk && wk.dead)) { L.enter = 0; el.style.opacity = ''; return null; }
    else return 'wait';
  }
  var u = (now - L.e0) / ENTER_MS;
  if (u >= 1) { L.enter = 0; el.style.opacity = ''; el.style.transform = ''; return null; }
  var e = 1 - (1 - u) * (1 - u), k = ENTER_FROM + (1 - ENTER_FROM) * e, h = el.offsetHeight || 1;
  k = Math.round(k * h) / h;
  el.style.transformOrigin = '50% 100%';
  el.style.transform = 'translateY(' + Math.round(-(1 - e) * h * 0.06) + 'px) scale(' + k.toFixed(4) + ')';
  el.style.opacity = String(Math.min(1, u * 5));
  return wk.frames[Math.floor((now - L.e0) / 130) % 4];
}
function drawLive(L, now){
  var ctx = L.ctx, res = L.res, cw = W * res, ch = H * res;
  if (L.enter) {
    var wf = entrance(L, now);
    if (wf === 'wait') return;
    if (wf) {
      ctx.clearRect(0, 0, cw, ch);
      ctx.fillStyle = 'rgba(0,0,0,.28)';
      ctx.beginPath(); ctx.ellipse(22 * res, 63.1 * res, 11 * res, 1.3 * res, 0, 0, Math.PI * 2); ctx.fill();
      ctx.drawImage(wf, 0, 0); L.drewStill = false; return;
    }
  }
  var fs = L.set, go = fs && fs.ready && !fs.dead;
  if (!go && L.drewStill) return;
  ctx.clearRect(0, 0, cw, ch);
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  ctx.beginPath(); ctx.ellipse(22 * res, 63.1 * res, 11 * res, 1.3 * res, 0, 0, Math.PI * 2); ctx.fill();
  if (!go) { if (!L.still.cv) L.still.cv = toCanvas(L.still); ctx.drawImage(L.still.cv, 0, 0); L.drewStill = true; return; }
  if (L.mode !== 'dribble') {
    /* the breath: a slow sine through four painted levels, and a blink */
    var b = (1 - Math.cos((now / BREATH_MS) * Math.PI * 2)) / 2, lv = Math.round(b * (BREATH_LV.length - 1));
    if (now > L.blinkAt + 150 && now > L.next) { L.blinkAt = now; L.next = now + 2600 + Math.random() * 3200; }
    var bl = now - L.blinkAt < 130 && L.blinkAt > 0;
    ctx.drawImage(fs.frames[lv * 2 + (bl ? 1 : 0)], 0, 0);
    return;
  }
  /* the dribble: phase 0 is the catch, the hand high */
  var ph = (((now + L.t0) % BOUNCE_MS) / BOUNCE_MS), k = Math.floor(ph * 8) % 8;
  if (!L.held) { L.held = []; for (var i = 0; i < 8; i++) L.held.push(heldBall('bounce' + i, normal(L.look), res)); }
  var H8 = L.held, at = function(p){ var u = p * 8, a = Math.floor(u) % 8, b2 = (a + 1) % 8, f = u - Math.floor(u); return { x: H8[a].x + (H8[b2].x - H8[a].x) * f, y: H8[a].y + (H8[b2].y - H8[a].y) * f }; };
  var REL = 0.25, HIT = 0.46, UP = 0.5, CATCH = 0.875;
  var bx, by, sq = 0, spin;
  var rel = at(REL), cat = at(CATCH), floorY = H8[2].fy;
  if (ph >= CATCH || ph < REL) { var c = at(ph); bx = c.x; by = c.y; spin = 0; }
  else if (ph < HIT) {
    /* thrown down: it leaves the hand moving and gravity adds to it */
    var u = (ph - REL) / (HIT - REL); bx = rel.x + (cat.x - rel.x) * u * 0.5; by = rel.y + (floorY - rel.y) * (0.4 * u + 0.6 * u * u); spin = 1 + Math.floor(u * 3);
  } else if (ph < UP) { bx = rel.x + (cat.x - rel.x) * 0.5; by = floorY + 0.35 * res; sq = 0.16; spin = 0; }
  else {
    /* up off the floor, slowing into the hand */
    var v = (ph - UP) / (CATCH - UP); bx = rel.x + (cat.x - rel.x) * (0.5 + 0.5 * v); by = floorY - (floorY - cat.y) * (1 - (1 - v) * (1 - v)); spin = 3 - Math.floor(v * 3);
  }
  /* the ball's shadow on the floor, bigger and darker as it comes down */
  var near = Math.max(0, Math.min(1, 1 - (floorY - by) / (floorY - cat.y + 1)));
  ctx.fillStyle = 'rgba(0,0,0,' + (0.12 + 0.22 * near).toFixed(3) + ')';
  ctx.beginPath(); ctx.ellipse(Math.round(bx), H8[2].gy + 0.2 * res, (1.6 + 1.8 * near) * res, (0.45 + 0.4 * near) * res, 0, 0, Math.PI * 2); ctx.fill();
  ctx.drawImage(fs.frames[k], 0, 0);
  var art = ballArt(res, spin % 4, sq);
  ctx.drawImage(art, Math.round(bx - art.width / 2), Math.round(by - art.height / 2));
}
function tick(now){
  liveRaf = 0;
  var any = false;
  for (var id in LIVE) {
    var L = LIVE[id];
    if (!L.el) {
      L.el = document.querySelector('canvas[data-live="' + id + '"]');
      if (!L.el) { if (Date.now() - L.born > 4000) delete LIVE[id]; else any = true; continue; }
      L.ctx = L.el.getContext('2d'); L.ctx.imageSmoothingEnabled = false;
    }
    if (!L.el.isConnected) { delete LIVE[id]; continue; }
    any = true;
    if (typeof document !== 'undefined' && document.hidden) continue;
    drawLive(L, now);
  }
  if (any) kick();
}

var API = {
  W: W, H: H,
  SKINS: SKINS, HAIR_COLORS: HAIR_COLORS, HAIRS: HAIRS, BEARDS: BEARDS, BANDS: BANDS, SLEEVES: SLEEVES, SHOES: SHOES, BUILDS: BUILDS,
  /* Where a hand is, in sprite cells, on a moving frame: the cutscene puts
     the ball there rather than guessing. s = 1 is the shooting hand. */
  handAt: function(pose, s, build, yaw){
    return handOf(pose, s, build, yaw);
  },
  /* the camera, for a stage that lays its floor out under the same view */
  CAM: { pitch: 30, yaw: DEF_YAW },
  SETS: Object.keys(SETS).reduce(function(m, k){ m[k] = SETS[k].length; return m; }, {}), isFrame: function(p){ return !!ANIM[p]; },
  DEFAULT: DEFAULT, normal: normal, lookFor: lookFor, hash: hash, inkOn: inkOn, contrast: contrast,
  paint: paint, canvas: canvas, url: url, img: img, breathe: breathe, live: live, warm: warm, _gridData: gridData,
  prop: prop, propCanvas: propCanvas, ramp: ramp, PROPS: Object.keys(PROP_SIZE),
  WEAR_KINDS: WEAR_KINDS, wearNorm: wearNorm,
  /* 1 is the first version with the street look. A page that needs it pins
     this, the way it pins board.js: a stale cached copy would ignore ctx and
     draw the uniform with nothing thrown. */
  API_VERSION: 1,
};
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') { window.RTF_BALLER = API; breathe(); }
else if (typeof self !== 'undefined') self.RTF_BALLER = API;   /* the paint worker */
})();
