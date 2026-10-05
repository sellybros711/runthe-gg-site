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
var BUILDS = [['lean', 'Lean'], ['standard', 'Standard'], ['strong', 'Strong']];
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
var CX = 22;

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
var PITCH = 12 * Math.PI / 180, CP = Math.cos(PITCH), SN = Math.sin(PITCH), GY = 61.4;
function toView(p){ var y = p[1] - GY, z = p[2]; return [p[0], GY + y * CP + z * SN, -y * SN + z * CP]; }
function toWorld(q){ var y = q[1] - GY, z = q[2]; return [q[0], GY + y * CP - z * SN, y * SN + z * CP]; }
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
    fr([10, -25], [10, -25], { dip: 4 }),
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
var ANIM = {};
Object.keys(SETS).forEach(function(k){ SETS[k].forEach(function(f, i){ ANIM[k + i] = f; }); });
/* The six standing poses, in the same angles. */
var STILL = {
  stand: fr([12, 6], [12, 6]),
  suit: fr([10, 5], [10, 5]),
  cap: fr([10, 5], [10, 5]),
  up: fr([148, 176], [148, 176]),
  trophy: fr([16, -84, 1, 0.5], [16, -84, 1, 0.5]),
  ball: fr([22, 38, 1, 0.75], [12, 6]),
};

/* The skeleton for a pose, in world cells (x right, y down, z toward the
   camera). bw widens the shoulders, am thickens the limbs, by build. */
function skeleton(f, bw, am, breath){
  var dip = f.dip || 0, sp = f.sp || 0, up = breath ? 1 : 0;
  var J = { dip: dip };
  J.head = [CX, 13.8 + dip + up, 0.6];
  J.neck = [CX, 22.0 + dip + up, 0];
  J.chest = [CX, 29.2 + dip + up, 0];
  J.waist = [CX, 37.6 + dip, 0];
  J.arm = {}; J.leg = {};
  [-1, 1].forEach(function(s){
    var p = f.a[String(s)] || DOWN;
    var sh = [CX + s * (7.9 + bw * 0.8), 25.0 + dip + up, 0];
    var r1 = p[0] * Math.PI / 180, r2 = p[1] * Math.PI / 180;
    var f1 = p[2] == null ? 1 : p[2], f2 = p[3] == null ? 1 : p[3];
    var L1 = 7.6, L2 = 7.0;
    /* foreshortened means turned toward the camera, the length kept. A limb
       that crosses the body passes in FRONT of it, so it comes forward by how
       far across it reaches: drawn flat it went into the chest and vanished,
       and a hand over the head went behind the hair. */
    var acr1 = Math.sin(r1) < 0 ? Math.min(1, -Math.sin(r1) * 1.4) : 0, acr2 = Math.sin(r2) < 0 ? Math.min(1, -Math.sin(r2) * 1.4) : 0;
    var el = [sh[0] + s * Math.sin(r1) * L1 * f1, sh[1] + Math.cos(r1) * L1 * f1, L1 * Math.sqrt(Math.max(0, 1 - f1 * f1)) + acr1 * 4.2];
    var wr = [el[0] + s * Math.sin(r2) * L2 * f2, el[1] + Math.cos(r2) * L2 * f2, el[2] + L2 * Math.sqrt(Math.max(0, 1 - f2 * f2)) + acr2 * (6.2 - el[2] * 0.4)];
    var hl2 = 2.1;
    var hd = [wr[0] + s * Math.sin(r2) * hl2 * f2 + s * (p[4] || 0), wr[1] + Math.cos(r2) * hl2 * f2 + (p[5] || 0), wr[2] + hl2 * Math.sqrt(Math.max(0, 1 - f2 * f2))];
    J.arm[s] = { sh: sh, el: el, wr: wr, hand: hd, hang: Math.abs(p[1]) < 30 };
    var lf = f.lift ? f.lift[String(s)] || 0 : 0;
    var hip = [CX + s * 3.9, 41.0 + dip, 0];
    var ank = [CX + s * (4.6 + sp), 57.4 - lf * 1.25, 0.2 + lf * 0.3];
    /* a crouch or a lifted foot bends the knee forward */
    var bend = dip * 0.7 + lf * 0.9;
    var kn = [CX + s * (4.4 + sp * 0.6), (hip[1] + ank[1]) / 2 + 0.6, 0.6 + bend];
    J.leg[s] = { hip: hip, kn: kn, ank: ank, lf: lf };
  });
  return J;
}

/* ── the model for one pose and one look ── */
function build(L, o, J){
  var suit = o.suit, cap = o.cap, pose = o.pose;
  var bw = L.build === 'lean' ? -0.6 : L.build === 'strong' ? 0.8 : 0;
  var am = L.build === 'lean' ? -0.15 : L.build === 'strong' ? 0.3 : 0;
  var P = [];
  /* n: the part's name, g: which piece of the body it is (lines are drawn
     between pieces, never inside one), m: its material, or a function of
     where it was hit, f: the shape, b: a bounding sphere for culling */
  var add = function(n, g, m, f, c, r, x){ var p = { n: n, g: g, m: m, f: f, c: c, r: r }; for (var k in x || {}) p[k] = x[k]; P.push(p); return p; };
  var H = J.head, hx = H[0], hy = H[1], hz = H[2];
  var HR = [8.1, 8.5, 7.6];
  var local = function(p){ return [p[0] - hx, p[1] - hy, p[2] - hz]; };

  /* legs: skin and socks under the shorts, or trousers */
  [-1, 1].forEach(function(s){
    var G = J.leg[s];
    if (!suit) {
      var legMat = function(p){
        var y = p[1] - (G.ank[1] - 57.4);
        /* crew socks, with the club's two colours ringed near the top */
        if (y > 53.4) return y < 54.2 ? 'sock' : y < 54.9 ? 'jersey' : y < 55.6 ? 'trim' : 'sock';
        return 'skin';
      };
      add('leg' + s, 'leg' + s, legMat, uni([cone(G.hip, G.kn, 2.6 + am, 2.3 + am), cone(G.kn, G.ank, 2.3 + am, 1.75 + am * 0.5)]), G.kn, 10);
    } else {
      add('trouser' + s, 'leg' + s, 'trouser', uni([cone([G.hip[0], G.hip[1] - 2, 0], G.kn, 3.4, 3.0), cone(G.kn, G.ank, 3.0, 2.7)]), G.kn, 12);
    }
    /* the shoe: a rounded toe box on a flat sole */
    var a = G.ank, fx = a[0] + s * 0.3, fy = a[1] + 2.4, fz = a[2] + 1.3;
    var shoeF = cut(ell([fx, fy, fz], [3.0, 2.3, 4.3]), function(p){ return p[1] - (a[1] + 4.0); });
    add('shoe' + s, 'shoe' + s, function(p){
      var ly = p[1] - a[1];
      if (ly > 3.35) return 'sole';
      if (suit) return { m: 'shoe', gloss: 2 };
      if (ly < 1.0) return { m: 'shoe', dt: -1 };
      if (p[2] > fz + 2.4 && Math.abs(p[0] - fx) < 0.6 && ly < 2.6) return { m: 'lace', t: Math.floor(ly * 2) % 2 ? 4 : 2 };
      if (Math.abs(p[2] - fz) < 1.1 && Math.abs(p[0] - fx) > 2.1 && ly > 1.2 && ly < 2.8) return 'trim';
      return 'shoe';
    }, shoeF, [fx, fy, fz], 5.2, { gloss: 1 });
  });

  /* the torso: a chest and a waist, one smooth body */
  var cR = [7.8 + bw, 6.6, 4.5 + bw * 0.3], wR = [6.9 + bw * 0.6, 5.0, 4.1];
  var C0 = J.chest, W0 = J.waist;
  var torsoF = function(p){ return smin(ell(C0, cR)(p), ell(W0, wR)(p), 2.2); };
  var bodyN = function(p){ return p; };
  if (!suit) {
    var torsoMat = function(p){
      var dx = Math.abs(p[0] - CX), y = p[1] - (C0[1] - 29.2), front = p[2] > 0.6;
      var arm = 6.6 + bw * 0.8;
      /* the tank: straps over the shoulders, a scoop neck, open armholes */
      var strapIn = 3.4, strapOut = 6.0 + bw * 0.4;
      if (y < 25.6 && (dx < strapIn || dx > strapOut)) return 'skin';
      if (front && dx < strapIn + 0.2 && y < 27.6 - dx * 0.25) return 'skin';
      if (dx > arm && y < 31.2) return 'skin';
      if ((y < 26.4 && (dx < strapIn + 0.8 || dx > strapOut - 0.8)) || (front && dx < strapIn + 1.0 && y < 28.4 - dx * 0.25) || (dx > arm - 0.8 && y < 32)) return 'trim';
      /* the number on the chest */
      if (front && o.num !== '') {
        var num = o.num, x0 = num.length === 2 ? CX - 5 : CX - 2, ny = 28.0;
        var gx = Math.floor(p[0] - x0), gy = Math.floor(y - ny);
        if (gy >= 0 && gy < 6) for (var d = 0; d < num.length; d++) {
          var dg = DIGITS[num[d]], cx2 = gx - d * 6;
          if (dg && cx2 >= 0 && cx2 < 4 && dg[gy][cx2] === '1') return { m: 'ink', t: gy === 0 ? 3 : null };
        }
      }
      return 'jersey';
    };
    add('torso', 'torso', torsoMat, torsoF, [CX, 33 + J.dip, 0], 11);
    /* the shorts: wide and long, cut into two legs at the seat */
    var sy0 = 37.4 + J.dip;
    var shortsF = uni([ell([CX, sy0 + 2.6, 0], [8.4 + bw * 0.5, 4.2, 5.0]),
      cone([CX - 4.0, sy0 + 3.0, 0], [J.leg[-1].kn[0] + 0.2, sy0 + 10.6, J.leg[-1].kn[2] * 0.6], 4.6, 4.0),
      cone([CX + 4.0, sy0 + 3.0, 0], [J.leg[1].kn[0] - 0.2, sy0 + 10.6, J.leg[1].kn[2] * 0.6], 4.6, 4.0)]);
    add('shorts', 'shorts', function(p){
      var y = p[1] - sy0, dx = Math.abs(p[0] - CX);
      if (y < 1.2) return 'trim';
      if (y > 10.0) return { m: 'jersey', dt: -1 };
      if (dx > 7.2 + bw * 0.5 && p[2] > -1) return 'trim';
      return 'jersey';
    }, cut(shortsF, function(p){ return Math.max(sy0 - p[1], p[1] - (sy0 + 10.8)); }), [CX, sy0 + 6, 0], 12);
  } else {
    var jR = [cR[0] + 0.8, cR[1] + 0.4, cR[2] + 0.7], jW = [wR[0] + 1.2, 6.4, wR[2] + 0.9];
    var jacketF = function(p){ return smin(ell(C0, jR)(p), ell([CX, W0[1] + 1.4, 0], jW)(p), 2.4); };
    add('jacket', 'torso', function(p){
      var dx = p[0] - CX, ad = Math.abs(dx), y = p[1] - (C0[1] - 29.2), front = p[2] > 1.2;
      var vee = y > 34 ? -1 : 3.4 - (y - 23) * 0.3;
      if (front && ad < vee) {
        if (ad < 0.95 && y > 24.4) return { m: 'tie', t: y < 25.4 ? 3 : dx < 0 ? 2 : 1 };
        return { m: 'shirt', dt: y < 24.4 ? 1 : 0 };
      }
      if (front && ad < vee + 1.3) return { m: 'jacket', dt: dx < 0 ? 1 : -1 };
      if (front && ad < 0.6 && (Math.abs(y - 35.2) < 0.5 || Math.abs(y - 38.4) < 0.5)) return { m: 'jacket', t: 0 };
      if (front && dx > 4.4 && dx < 6.0 && y > 25.6 && y < 26.8) return 'pocket';
      return 'jacket';
    }, cut(jacketF, function(p){ return p[1] - (W0[1] + 5.6); }), [CX, 34 + J.dip, 0], 13);
  }
  /* the neck */
  add('neck', 'neck', 'skin', cone([CX, J.neck[1] - 3.6, -0.6], [CX, J.neck[1] + 2.4, -0.4], 2.7 + Math.max(0, bw * 0.3), 3.0 + Math.max(0, bw * 0.3)), J.neck, 6, { bias: -0.25 });

  /* the arms: a shoulder, an upper arm, a forearm, a hand */
  [-1, 1].forEach(function(s){
    var A = J.arm[s], sleeved = !suit && o.sleeve && s === 1;
    var mat = suit ? 'jacket' : sleeved ? 'sleeve' : 'skin';
    var r0 = (suit ? 2.6 : 2.2) + am, r1 = (suit ? 2.2 : 1.85) + am * 0.8, r2 = (suit ? 1.95 : 1.5) + am * 0.6;
    if (!suit) add('delt' + s, 'arm' + s, sleeved ? 'sleeve' : 'skin', sph([A.sh[0] - s * 0.5, A.sh[1] + 0.9, 0], 2.55 + am), A.sh, 3.5);
    var armF = uni([cone(A.sh, A.el, r0, r1), cone(A.el, A.wr, r1, r2)]);
    add('arm' + s, 'arm' + s, suit ? function(p){
      var t = Math.hypot(p[0] - A.wr[0], p[1] - A.wr[1], p[2] - A.wr[2]);
      return t < 1.3 ? 'cuff' : 'jacket';
    } : mat, armF, A.el, 10);
    add('hand' + s, 'arm' + s, 'skin', ell(A.hand, [2.1, 2.3, 1.9]), A.hand, 3, { hand: s });
  });

  /* what he is holding */
  if (pose === 'ball') {
    var hd = J.arm[1].hand, bc = [hd[0] + 1.6, hd[1] + 3.6, hd[2] + 1.0];
    add('ball', 'ball', function(p){
      var u = p[0] - bc[0], v = p[1] - bc[1], w = p[2] - bc[2];
      if (Math.abs(v + u * 0.1) < 0.45 || Math.abs(u - v * 0.15) < 0.45 || Math.abs(Math.hypot(u + 5.2, v) - 3.9) < 0.42) return { m: 'ball', t: 0 };
      return 'ball';
    }, sph(bc, 4.2), bc, 4.4, { gloss: 1 });
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

  /* the head and the ears */
  var headF = ell(H, HR);
  [-1, 1].forEach(function(s){ add('ear' + s, 'head', 'skin', ell([hx + s * 7.0, hy + 1.2, hz - 0.8], [1.3, 2.0, 1.2]), [hx + s * 7, hy + 1, hz], 2.6); });
  add('head', 'head', 'skin', headF, H, 8.4, { bias: 0.06 });

  /* hair: every style a volume over the head */
  var hs = L.hair;
  if (cap) hs = hs === 'afro' ? 'afrocap' : hs === 'long' || hs === 'twists' || hs === 'bald' ? hs : 'buzz';
  var shellF = function(t){ return ell(H, [HR[0] + t, HR[1] + t, HR[2] + t]); };
  /* what of the head the hair covers: above the hairline, the sides down
     past the temples, and all of the back */
  var hairline = function(p, low){ var l = local(p);
    if (l[1] < -3.3 + Math.max(0, -l[2]) * 0.25) return true;
    if (l[2] < -1.0 && l[1] < (low || 3.0)) return true;
    return Math.abs(l[0]) > 5.6 && l[1] < -0.6 && l[2] < 3.0; };
  var onHair = function(f, low){ return function(p){ return hairline(p, low) ? f(p) : Math.max(f(p), 0.6); }; };
  var hairMat = function(fn){ return fn ? function(p){ return fn(local(p)); } : 'hair'; };
  var hb = { gloss: 1, bias: -0.12 };
  if (hs === 'fade' || hs === 'flattop' || hs === 'curly') {
    add('hairf', 'hair', function(p){ var l = local(p); return l[1] > -4.4 && Math.abs(l[0]) > 4.8 ? { m: 'fade', dt: (Math.floor(p[0]) + Math.floor(p[1])) % 2 ? 0 : -1 } : 'hair'; },
      onHair(shellF(0.45)), H, 9, hb);
  }
  if (hs === 'fade') add('hair', 'hair', hairMat(), cut(shellF(1.3), function(p){ return local(p)[1] + 3.6; }), H, 9.5, hb);
  else if (hs === 'flattop') add('hair', 'hair', hairMat(function(l){ return l[1] < -10.2 ? { m: 'hair', dt: 1 } : (Math.floor(l[0] + 30) % 3 === 0 ? { m: 'hair', dt: -1 } : 'hair'); }),
    (function(a, b){ return function(p){ return smin(a(p), b(p), 1.0); }; })(cut(shellF(0.9), function(p){ return local(p)[1] + 3.4; }), rbox([hx, hy - 8.6, hz - 0.3], [6.4, 3.0, 5.8], 1.1)), [hx, hy - 6, hz], 10, hb);
  else if (hs === 'curly') {
    var bumps = [shellF(0.9)];
    [[-4, -8, 2], [0, -9, 2.6], [4, -8, 2], [-6, -5, 1], [6, -5, 1], [-2, -8, -2.4], [2.4, -8, -2.6], [0, -6.4, 4.2], [-4.6, -6, 3.2], [4.6, -6, 3.2], [-5.6, -6.4, -2.4], [5.6, -6.4, -2.4]].forEach(function(b){
      bumps.push(sph([hx + b[0], hy + b[1], hz + b[2]], 2.5)); });
    add('hair', 'hair', 'hair', cut(uni(bumps), function(p){ return local(p)[1] + 3.4; }), [hx, hy - 6, hz], 11, hb);
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
    var faceHole = function(p){ var l = local(p); return Math.max(-l[1] - 3.4, l[1] - 9, Math.abs(l[0]) - 6.4, -l[2]); };
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
  if (o.band && !cap) add('band', 'band', 'band', cut(shellF(0.55), function(p){ var l = local(p); return Math.abs(l[1] + 4.6) - 1.0; }), H, 9);
  if (cap) {
    add('cap', 'cap', function(p){ var l = local(p);
      if (l[2] > 4.2 && Math.abs(l[0]) < 1.4 && l[1] > -7.2 && l[1] < -4.6) return 'logo';
      return l[1] < -8.6 && Math.abs(l[0]) < 0.8 ? { m: 'cap', dt: -1 } : 'cap'; },
      cut(shellF(1.7), function(p){ return local(p)[1] + 2.4; }), H, 10, { gloss: 1 });
    add('brim', 'cap', 'cap', cut(ell([hx, hy - 2.6, hz + 5.6], [7.0, 0.85, 4.6]), function(p){ return -(local(p)[2] - 3.0); }), [hx, hy - 2.6, hz + 7], 7.5);
  }
  return P;
}

/* Trace every pixel into the model. */
function trace(P){
  /* each part's bounds on screen, so a pixel only asks the parts it can see */
  var B = P.map(function(p){ var v = toView(p.c); return [v[0] - p.r, v[1] - p.r, v[0] + p.r, v[1] + p.r, v[2] + p.r, v[2] - p.r]; });
  var hit = [];
  for (var y = 0; y < H; y++) {
    var row = [];
    for (var x = 0; x < W; x++) {
      var sx = x + 0.5, sy = y + 0.5, cand = [], t0 = -1e9, t1 = 1e9;
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
      var vn = [n[0], n[1] * CP + n[2] * SN, -n[1] * SN + n[2] * CP];
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

/* Paint the whole figure into a grid of colours. opts:
     c1, c2   the jersey's two colours
     num      the number on the chest
     pose     stand, ball, up, trophy, suit or cap, or a moving frame
     age      greys the hair from 33
     frame    0 or 1, the breath
     dress    suit or cap, for a moving frame
     parts    hand back the part in every cell instead of a colour */
function paint(look, opts){
  var L = normal(look), o = opts || {};
  var pose = o.pose || 'stand';
  var AN = ANIM[pose] || null;
  var suit = pose === 'suit' || pose === 'cap' || !!(AN && (o.dress === 'suit' || o.dress === 'cap'));
  var cap = pose === 'cap' || !!(AN && o.dress === 'cap');
  var c1 = o.c1 || '#2b3242', c2 = o.c2 || '#c9ccd6';
  if (contrast(c1, c2) < 1.4) c2 = inkOn(c1);
  var age = +o.age || 0;
  var bw = L.build === 'lean' ? -0.6 : L.build === 'strong' ? 0.8 : 0;
  var am = L.build === 'lean' ? -0.15 : L.build === 'strong' ? 0.3 : 0;
  var f = AN || STILL[pose] || STILL.stand;
  var J = skeleton(f, bw, am, o.frame === 1 && !AN);
  var bandHex = L.band === 'none' ? null : L.band === 'club' ? c2 : FIXED[L.band];
  var slvHex = L.sleeve === 'none' ? null : L.sleeve === 'club' ? c2 : FIXED[L.sleeve];
  var num = pose === 'trophy' || suit ? '' : String(o.num == null ? '' : o.num).slice(0, 2);
  var model = build(L, { suit: suit, cap: cap, pose: pose, num: num, band: !!bandHex, sleeve: !!slvHex }, J);
  var hit = trace(model);

  if (o.parts) return hit.map(function(r){ return r.map(function(c){ return c ? model[c.i].n : null; }); });

  /* the colours */
  var skinHex = SKINS[L.skin];
  var hairHex = HAIR_COLORS[L.hc][1];
  if (age >= 33) hairHex = mix(hairHex, '#c9c9c4', Math.min(0.75, (age - 32) / 12));
  var natural = L.bc >= 0 ? HAIR_COLORS[L.bc][1] : L.hc >= 5 ? HAIR_COLORS[L.hc === 5 ? 4 : 1][1] : HAIR_COLORS[L.hc][1];
  var beardHex = mix(natural, '#000000', 0.12);
  if (age >= 33) beardHex = mix(beardHex, '#c9c9c4', Math.min(0.7, (age - 32) / 12));
  var SK = skinRamp(skinHex), HRm = hairRamp(hairHex);
  var shoeHex = suit ? '#1c1f27' : L.shoes === 'club' ? c1 : FIXED[L.shoes];
  var R = {
    skin: SK, hair: HRm, fade: hairRamp(mix(hairHex, skinHex, 0.5)), buzz: hairRamp(mix(hairHex, skinHex, 0.22)), scalp: skinRamp(mix(skinHex, hairHex, 0.35)),
    beard: hairRamp(beardHex), jersey: ramp(c1), trim: ramp(c2), ink: ramp(inkOn(c1, c2)), sock: ramp('#f1f0ea'),
    shoe: ramp(shoeHex), sole: ramp('#e8e2d4'), lace: ramp('#f4f1ea'), band: ramp(bandHex || '#ffffff'), sleeve: ramp(slvHex || '#ffffff'),
    trouser: ramp('#2a2e38'), jacket: ramp(mix(c1, '#14161c', 0.66)), shirt: ramp('#f1f1ec'), cuff: ramp('#f1f1ec'), pocket: ramp(c2),
    tie: ramp(contrast(c1, mix(c1, '#14161c', 0.66)) >= 1.6 ? c1 : c2), cap: ramp(c1), logo: ramp(c2), gold: ramp('#e3a92f'), ball: ramp('#e2762a'),
  };
  /* tones, and what each pixel is made of */
  var T = [], M = [];
  for (var y = 0; y < H; y++) { T.push([]); M.push([]); for (var x = 0; x < W; x++) {
    var c = hit[y][x];
    if (!c) { T[y].push(-1); M[y].push(null); continue; }
    var part = model[c.i], mm = typeof part.m === 'function' ? part.m(c.p) : part.m;
    if (typeof mm === 'string') mm = { m: mm };
    c.gloss = mm.gloss;
    M[y].push(mm.m);
    T[y].push(mm.t != null ? mm.t : toneOf(c, part, mm.dt));
  } }
  var g = function(x, y){ return y >= 0 && y < H && x >= 0 && x < W ? hit[y][x] : null; };
  var gid = function(c){ return model[c.i].g; };
  var baseOf = function(c){ var m = model[c.i].m; return typeof m === 'string' ? m : model[c.i].n; };
  /* a contact shadow: a part with another IN FRONT of it just above or beside */
  for (var y2 = 0; y2 < H; y2++) for (var x2 = 0; x2 < W; x2++) { var c2_ = hit[y2][x2]; if (!c2_) continue;
    var dirs = [[0, -1], [1, 0], [-1, 0]];
    for (var k = 0; k < 3; k++) { var q = g(x2 + dirs[k][0], y2 + dirs[k][1]);
      if (q && gid(q) !== gid(c2_) && q.z > c2_.z + 1.2) { T[y2][x2] = Math.max(0, T[y2][x2] - 1); break; } } }
  var out = [];
  for (var y3 = 0; y3 < H; y3++) { out.push(new Array(W).fill(null)); for (var x3 = 0; x3 < W; x3++) {
    if (!hit[y3][x3]) continue; var r = R[M[y3][x3]] || R.skin; out[y3][x3] = r[T[y3][x3]]; } }
  /* the inner contour: a front part's edge where it crosses a part behind it */
  for (var y4 = 0; y4 < H; y4++) for (var x4 = 0; x4 < W; x4++) { var c4 = hit[y4][x4]; if (!c4) continue;
    var r4 = R[M[y4][x4]] || R.skin, dd = [[0, 1], [1, 0], [-1, 0]];
    for (var k4 = 0; k4 < 3; k4++) { var q4 = g(x4 + dd[k4][0], y4 + dd[k4][1]);
      if (q4 && gid(q4) !== gid(c4) && q4.z < c4.z - 1.2 && (baseOf(q4) !== baseOf(c4) || q4.z < c4.z - 2.4)) { out[y4][x4] = r4[Math.min(T[y4][x4], 1)]; break; } } }
  /* the soft outline, one pixel inside the silhouette, in the part's own shadow */
  var edits = [];
  for (var y5 = 0; y5 < H; y5++) for (var x5 = 0; x5 < W; x5++) { if (!hit[y5][x5]) continue;
    var r5 = R[M[y5][x5]] || R.skin, e = function(dx, dy){ return !g(x5 + dx, y5 + dy); };
    var sh = e(0, 1) || e(1, 0), lit = e(0, -1) || e(-1, 0);
    if (!sh && !lit) continue;
    var t5 = T[y5][x5];
    edits.push([x5, y5, sh ? r5[Math.max(0, Math.min(t5 - 1, 1))] : r5[Math.max(0, Math.min(t5 - 1, 2))]]); }
  edits.forEach(function(ed){ out[ed[1]][ed[0]] = ed[2]; });

  /* the face, on the head: dot eyes, brows, a nose, a mouth, a little blush.
     Placed off the head's own centre on screen, so it moves with a crouch. */
  var hv = toView([J.head[0], J.head[1], J.head[2] + 6.8]);
  var fx = Math.floor(hv[0]), fy = Math.floor(hv[1]);
  var onHead = function(x, y){ var c = g(x, y); return c && model[c.i].n === 'head'; };
  var put = function(x, y, col){ if (onHead(x, y)) out[y][x] = col; };
  var pupil = mix(HRm[0], '#1a1018', 0.6), brow = L.hair === 'bald' || L.hc === 5 ? SK[0] : HRm[0];
  [-3, 3].forEach(function(dx){ var ex = fx + (dx < 0 ? dx : dx - 1);
    put(ex, fy, pupil); put(ex, fy + 1, pupil);
    put(ex + (dx < 0 ? -1 : 0), fy - 2, brow); put(ex + (dx < 0 ? 0 : 1), fy - 2, brow); });
  put(fx, fy + 2, SK[1]); put(fx - 1, fy + 3, SK[1]);
  [-1, 0, 1].forEach(function(dx){ put(fx + dx - 1, fy + 5, mix(SK[1], '#7a2a34', 0.30)); });
  put(fx - 5, fy + 3, mix(SK[2], '#e0586a', 0.22)); put(fx + 4, fy + 3, mix(SK[2], '#e0586a', 0.22));
  if (L.beard === 'stubble') for (var y6 = fy + 2; y6 <= fy + 8; y6++) for (var x6 = fx - 7; x6 <= fx + 7; x6++) {
    var ad6 = Math.abs(x6 + 0.5 - fx);
    if (!onHead(x6, y6) || (y6 < fy + 4 && ad6 < 5) || (y6 === fy + 5 && ad6 < 2.5)) continue;
    if ((x6 + y6) % 2 === 0) out[y6][x6] = mix(out[y6][x6], R.beard[1], 0.45);
  }
  if (L.beard === 'full' || L.beard === 'goatee') [-1, 0, 1].forEach(function(dx){ put(fx + dx - 1, fy + 5, '#2a1a14'); });
  if (L.hair === 'bald' && !cap) { put(fx - 3, fy - 8, SK[4]); put(fx - 2, fy - 8, SK[4]); put(fx - 3, fy - 7, SK[3]); }
  return out;
}

/* Where a hand is on screen, in sprite cells, for a moving frame. */
function handOf(pose, s, build){
  var f = ANIM[pose]; if (!f) return null;
  var bw = build === 'lean' ? -0.6 : build === 'strong' ? 0.8 : 0;
  var v = toView(skeleton(f, bw, 0, false).arm[s == null ? 1 : s].hand);
  return [v[0], v[1]];
}

/* ─── to the screen ───────────────────────────────────────────────────── */

var CACHE = {}, KEYS = [];
function keyOf(look, o){ return JSON.stringify([normal(look), o.c1, o.c2, o.num, o.pose, o.age >= 33 ? o.age : 0, o.frame || 0, o.scale || 4, !!o.shadow, o.dress || '']); }

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
  var g = paint(look, o);
  for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
    var c = g[y][x];
    if (!c) continue;
    ctx.fillStyle = c;
    ctx.fillRect(x * s, y * s, s, s);
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

var API = {
  W: W, H: H,
  SKINS: SKINS, HAIR_COLORS: HAIR_COLORS, HAIRS: HAIRS, BEARDS: BEARDS, BANDS: BANDS, SLEEVES: SLEEVES, SHOES: SHOES, BUILDS: BUILDS,
  /* Where a hand is, in sprite cells, on a moving frame: the cutscene puts
     the ball there rather than guessing. s = 1 is the shooting hand. */
  handAt: function(pose, s, build){
    return handOf(pose, s, build);
  },
  SETS: Object.keys(SETS).reduce(function(m, k){ m[k] = SETS[k].length; return m; }, {}), isFrame: function(p){ return !!ANIM[p]; },
  DEFAULT: DEFAULT, normal: normal, lookFor: lookFor, hash: hash, inkOn: inkOn, contrast: contrast,
  paint: paint, canvas: canvas, url: url, img: img, breathe: breathe,
};
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') { window.RTF_BALLER = API; breathe(); }
})();
