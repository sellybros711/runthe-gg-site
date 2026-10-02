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
  ['fade', 'Fade'], ['buzz', 'Buzz'], ['afro', 'Afro'], ['twists', 'Twists'], ['braids', 'Braids'],
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
/* A ramp of five: deep shadow, shadow, base, light, highlight.
   This is the pixel artist's ramp rather than a lightness slider. Shadows
   turn toward a cool hue and hold their chroma, highlights turn warm, so a
   red shirt in shade reads as a red shirt in shade and not as brown. A grey
   has no hue to turn, so its shadows are lent a blue one. Near black is lifted
   first, because a black jersey drawn black has nowhere darker to put a fold.
   Skin passes its own cool hue (a red), because skin in shadow warms rather
   than greys. */
function ramp(hex, cool, soft){
  var c = hsl(hex), h = c[0], s = c[1], l = c[2];
  if (l < 0.15) { l = 0.15 + l * 0.4; s = Math.max(s, 0.18); if (c[1] < 0.08) h = 222; }
  if (s < 0.08) { h = 220; s = 0.06 + s; }
  var cg = cool == null ? 238 : cool;
  if (soft) {
    /* skin: shadows turn a touch toward red and LOSE a little chroma, or a
       pale face in shade reads as a sunburn */
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

/* ─── the rig ─────────────────────────────────────────────────────────── */

/* The figure is drawn the way a sprite artist builds one rather than as
   rectangles: every body part is a shape (a tapered tube for a limb, a row
   table for the head and the torso, an ellipse for a hand), each shape knows
   its own surface normal, and the light comes from the upper left. A cell's
   level on its part's ramp is how much it faces that light. Then three passes
   finish it:
     a line where a part in FRONT meets a part behind it, drawn on the part
     behind, so an arm reads in front of a chest without a black outline,
     piping and detail painted over the shading (the number, the face, laces),
     and a selective outline: a dark shade of whatever it borders, lighter on
     the lit top and left, never a flat black ring.
   The grid is 44 by 64, the figure a little over four heads tall, which is
   the sports sprite's proportion: a head big enough to carry a face. */
var DIGITS = {
  0: ['0110', '1001', '1001', '1001', '1001', '0110'], 1: ['0110', '1110', '0110', '0110', '0110', '1111'],
  2: ['0110', '1001', '0001', '0110', '1000', '1111'], 3: ['1110', '0001', '0110', '0001', '0001', '1110'],
  4: ['0011', '0101', '1001', '1111', '0001', '0001'], 5: ['1111', '1000', '1110', '0001', '0001', '1110'],
  6: ['0110', '1000', '1110', '1001', '1001', '0110'], 7: ['1111', '0001', '0010', '0010', '0100', '0100'],
  8: ['0110', '1001', '0110', '1001', '1001', '0110'], 9: ['0110', '1001', '1001', '0111', '0001', '0110'],
};

var CX = 22;                                       /* the centre line, between columns 21 and 22 */
var LIGHT = (function(){ var v = [-0.52, -0.6, 0.6], n = Math.hypot(v[0], v[1], v[2]); return v.map(function(x){ return x / n; }); })();
var INK = '#0d1019';

function grid(fill){ var g = []; for (var y = 0; y < H; y++) { g.push(new Array(W).fill(fill === undefined ? null : fill)); } return g; }

/* A tube through points [x, y, r], the radius blended along each segment.
   The normal is the way out from the axis, so a limb shades like a cylinder. */
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
function ellipse(cx, cy, rx, ry){
  return function(px, py){
    var u = (px - cx) / rx, v = (py - cy) / ry;
    return u * u + v * v <= 1 ? [u, v] : null;
  };
}
/* A shape given row by row: hw(y) is the half width at row y (null for none),
   off(y) moves the row's centre. Rounded like a barrel across, flatter top to
   bottom, which is how a chest or a head catches a light from above. */
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
function table(y0, list){ return function(y){ var v = list[y - y0]; return v == null ? null : v; }; }

function Rig(){
  this.pid = grid(-1); this.lev = grid(0); this.col = grid(null);
  this.parts = [];
}
/* Add a part. o.ramp is its five colours, o.group keeps the pieces of one
   limb from drawing lines on each other, o.line says whether parts BEHIND it
   get a line where it overlaps them, o.ao darkens it (a neck under a chin),
   o.clip(x, y) refuses cells, o.flat squashes the normal toward the viewer. */
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
Rig.prototype.set = function(x, y, c){ if (x >= 0 && x < W && y >= 0 && y < H && this.pid[y][x] >= 0 && c) this.col[y][x] = c; };
Rig.prototype.level = function(x, y, k){ var p = this.pid[y][x]; if (p >= 0) this.col[y][x] = this.parts[p].ramp[k]; };
Rig.prototype.shadeRun = function(){
  for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
    var p = this.pid[y][x];
    if (p >= 0) this.col[y][x] = this.parts[p].ramp[this.lev[y][x]];
  }
};

/* ─── the moving frames ──────────────────────────────────────────────────
   The cutscenes and the playable moments need the man to MOVE, and the owner
   declared the six standing poses final. So a moving frame is the same rig
   with the joints somewhere else: the same parts, ramps, light, lines and
   outline, and nothing about the six existing poses changes (check-sprite
   hashes every one of them). A frame is a pose name, the set plus its index
   ('shot2'), so every reader that already takes a pose takes these too.

   An arm is two angles, the upper arm and the forearm, measured from straight
   down, outward positive, 180 straight up, negative across the body. Angles
   rather than points because a point moved by eye stretches the arm; an angle
   keeps it the length it is. fs foreshortens the forearm (a hand held out
   toward the camera), h nudges the hand (a wrist flicked after a release).
     lift  how many cells each foot leaves the floor (a step, a jump)
     dip   how many cells everything above the knee sinks (a crouch)
     sp    how much wider the stance is
   s = 1 is the side of the picture the ball pose holds the ball on: the
   shooting hand. */
var DOWN = [9, 4], UP = [156, 183];
function fr(R, Lft, more){ var o = { a: { '1': R, '-1': Lft } }; for (var k in more || {}) o[k] = more[k]; return o; }
var SETS = {
  walk: [
    fr([11, 10], [6, -10], { lift: { '1': 2 }, dip: 1 }),
    fr(DOWN, DOWN, { lift: { '-1': 1 } }),
    fr([6, -10], [11, 10], { lift: { '-1': 2 }, dip: 1 }),
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
/* Joints off the angles: shoulder, then 8 cells of upper arm, 7.6 of forearm,
   the hand 2.6 on. */
function animArm(f, s, bw){
  var p = f.a[String(s)] || DOWN;
  var sh = [CX + s * (9.4 + bw * 0.75), 22.2];
  var r1 = p[0] * Math.PI / 180, r2 = p[1] * Math.PI / 180;
  var l1 = 8 * (p[2] == null ? 1 : p[2]), l2 = 7.6 * (p[3] == null ? 1 : p[3]);
  var el = [sh[0] + s * Math.sin(r1) * l1, sh[1] + Math.cos(r1) * l1];
  var wr = [el[0] + s * Math.sin(r2) * l2, el[1] + Math.cos(r2) * l2];
  var hd = [wr[0] + s * Math.sin(r2) * 2.6 + s * (p[4] || 0), wr[1] + Math.cos(r2) * 2.6 + (p[5] || 0)];
  var hang = Math.abs(p[1]) < 30;
  return { el: el, wr: wr, hand: [hd[0], hd[1], hang ? 1.9 : 2.0, hang ? 2.5 : 2.2], sh: sh, hang: hang, raised: p[1] > 90 };
}

/* Paint the whole figure into a grid of colours. opts:
     c1, c2   the jersey's two colours
     num      the number on the chest
     pose     stand, ball, up, trophy, suit or cap
     age      greys the hair from 33
     frame    0 or 1, the breath */
function paint(look, opts){
  var L = normal(look), o = opts || {};
  var pose = o.pose || 'stand';
  var AN = ANIM[pose] || null;
  /* A moving frame is in the jersey unless it is asked for in a suit or a cap
     (the walk across a draft stage, up to a podium). */
  var suit = pose === 'suit' || pose === 'cap' || !!(AN && (o.dress === 'suit' || o.dress === 'cap'));
  var cap = pose === 'cap' || !!(AN && o.dress === 'cap');
  var c1 = o.c1 || '#2b3242', c2 = o.c2 || '#c9ccd6';
  if (contrast(c1, c2) < 1.4) c2 = inkOn(c1);
  var age = +o.age || 0;

  var skinHex = SKINS[L.skin];
  var SK = ramp(skinHex, 355, true);
  var hairHex = HAIR_COLORS[L.hc][1];
  if (age >= 33) hairHex = mix(hairHex, '#c9c9c4', Math.min(0.75, (age - 32) / 12));
  var HR = ramp(hairHex, 250);
  /* A beard is the natural colour even when the hair is dyed. */
  var natural = L.hc >= 5 ? HAIR_COLORS[L.hc === 5 ? 4 : 1][1] : HAIR_COLORS[L.hc][1];
  var beardHex = mix(natural, '#000000', 0.12);
  if (age >= 33) beardHex = mix(beardHex, '#c9c9c4', Math.min(0.7, (age - 32) / 12));
  var BR = ramp(beardHex, 250);
  var J1 = ramp(c1), J2 = ramp(c2);
  var WH = ramp('#ecebe6'), BLK = ramp('#1c1f27');
  var SH = ramp(L.shoes === 'club' ? c1 : FIXED[L.shoes]);
  var bandHex = L.band === 'none' ? null : L.band === 'club' ? c2 : FIXED[L.band];
  var slvHex = L.sleeve === 'none' ? null : L.sleeve === 'club' ? c2 : FIXED[L.sleeve];
  var JK = ramp(mix(c1, '#14161c', 0.66)), TR = ramp('#2a2e38'), SHIRT = ramp('#f1f1ec');
  var GOLD = ramp('#e3a92f', 18), BALL = ramp('#e2762a', 8);
  var bw = L.build === 'lean' ? -0.7 : L.build === 'strong' ? 0.9 : 0;    /* shoulders and chest */
  var am = L.build === 'lean' ? -0.15 : L.build === 'strong' ? 0.35 : 0;  /* limb thickness */

  var R = new Rig();
  var at = function(x, y){ return y >= 0 && y < H && x >= 0 && x < W && R.pid[y][x] >= 0 ? R.parts[R.pid[y][x]].name : null; };

  /* ── where the joints are, per pose ── */
  var arm = {};
  [-1, 1].forEach(function(s){
    var a;
    if (AN) { arm[s] = animArm(AN, s, bw); return; }
    if (pose === 'up') a = { el: [CX + s * (12.6 + bw * 0.5), 15.0], wr: [CX + s * 12.2, 7.6], hand: [CX + s * 12.0, 4.8, 2.0, 2.2] };
    else if (pose === 'trophy') a = { el: [CX + s * (11.6 + bw * 0.6), 30.2], wr: [CX + s * 7.2, 32.8], hand: [CX + s * 5.7, 33.0, 1.9, 1.9] };
    else if (pose === 'ball' && s === 1) a = { el: [CX + 11.9 + bw * 0.6, 29.8], wr: [CX + 13.0, 34.6], hand: [CX + 13.0, 36.0, 2.1, 1.8] };
    else a = { el: [CX + s * (10.7 + bw * 0.7), 30.4], wr: [CX + s * (11.2 + bw * 0.6), 38.4], hand: [CX + s * (11.3 + bw * 0.6), 41.0, 1.9, 2.5] };
    a.sh = [CX + s * (9.4 + bw * 0.75), 22.2];
    arm[s] = a;
  });

  /* ── the hair that hangs behind the head goes first ── */
  var hs = L.hair;
  if (cap) hs = hs === 'afro' ? 'afrocap' : hs === 'long' || hs === 'twists' || hs === 'braids' ? hs : 'buzz';
  if (hs === 'long') R.add('hairback', { ramp: HR, group: 'hair', line: false }, rows(8, 25, function(y){ return y < 22 ? 6.9 : 6.9 - (y - 21) * 0.7; }, CX, 0.3));
  if (hs === 'afro') R.add('hairback', { ramp: HR, group: 'hair', line: false, flat: 0.9 }, ellipse(CX, 8.1, 9.0, 7.3));
  if (hs === 'afrocap') R.add('hairback', { ramp: HR, group: 'hair', line: false }, ellipse(CX, 9.8, 8.0, 5.6));
  if (hs === 'twists') R.add('hairback', { ramp: HR, group: 'hair', line: false }, rows(1, 17, function(y){ return y < 4 ? 4.8 + (y - 1) * 0.8 : 7.2; }, CX, 0.5));

  /* ── legs: skin, socks, shoes; trousers in a suit ── */
  /* A moving frame can lift a foot (lf cells) and widen the stance (sp).
     Both are zero for the six standing poses, which draw exactly as before. */
  var LF = {}, SP = AN && AN.sp ? AN.sp : 0;
  [-1, 1].forEach(function(s){ LF[s] = AN && AN.lift ? AN.lift[String(s)] || 0 : 0; });
  [-1, 1].forEach(function(s){
    var lf = LF[s];
    var kx = CX + s * (4.8 + bw * 0.3 + SP), fx = kx + s * 0.6;
    if (!suit) {
      var leg = [[kx, 46, 2.25 + am], [kx + s * (0.3 + lf * 0.35), 50.6 - lf * 0.4, 2.6 + am], [kx - s * 0.1, 56.8 - lf, 1.6 + am * 0.5]];
      R.add('leg' + s, { ramp: SK, group: 'leg' + s }, tube(leg));
      R.add('sock' + s, { ramp: WH, group: 'leg' + s, clip: function(x, y){ return y >= 52 - lf; } }, tube(leg.map(function(p){ return [p[0], p[1] + (p[1] > 55 - lf ? 0.8 : 0), p[2] + 0.15]; })));
      R.add('shoe' + s, { ramp: SH, group: 'shoe' + s }, rows(56 - lf, 61 - lf, table(56 - lf, [2.3, 2.6, 2.9, 3.1, 3.3, 3.4]), fx, 0.4));
      R.add('sole' + s, { ramp: WH, group: 'shoe' + s, line: false }, rows(62 - lf, 62 - lf, function(){ return 3.5; }, fx, 0));
    } else {
      R.add('trouser' + s, { ramp: TR, group: 'leg' + s }, tube([[CX + s * (4.3 + SP), 38, 3.6], [CX + s * (4.4 + SP + lf * 0.3), 48 - lf * 0.4, 3.0], [CX + s * (4.5 + SP), 59.6 - lf, 2.6]]));
      R.add('shoe' + s, { ramp: BLK, group: 'shoe' + s }, rows(59 - lf, 62 - lf, table(59 - lf, [2.6, 3.0, 3.3, 3.4]), CX + s * (4.9 + SP), 0.5));
    }
  });

  /* ── the torso: skin under the tank, or the shirt under the jacket ── */
  var T = [5.0, 8.0, 9.2, 9.6, 9.7, 9.6, 9.5, 9.3, 9.1, 8.9, 8.7, 8.5, 8.4, 8.3, 8.3, 8.3, 8.3, 8.4, 8.5];
  var thw = function(y){ var t = T[y - 18]; return t == null ? null : t + (y >= 20 ? bw : y === 19 ? bw * 0.6 : 0); };
  R.add('neck', { ramp: SK, group: 'body', line: false, ao: 0.34 }, rows(16, 20, function(){ return 2.7 + Math.max(0, bw * 0.4); }, CX, 0.1));
  R.add('torso', { ramp: suit ? SHIRT : SK, group: 'body', line: false }, rows(18, 36, thw, CX, 0.12));

  var SW = [8.8, 9.1, 9.4, 9.7, 10.0, 10.2, 10.4, 10.6, 10.7, 10.8, 10.9, 11.0, 11.0];
  var shw = function(y){ return SW[y - 35] + bw; };
  var gap = function(y){ return y < 42 ? 0 : [0.6, 1.1, 1.5, 1.8, 2.0, 2.1][y - 42]; };
  if (!suit) {
    /* the shorts, cut wide and long: one barrel at the waist, a tube per leg below the seat */
    R.add('shorts', { ramp: J1, group: 'shorts', lift: -0.12 }, function(px, py){
      var y = Math.floor(py);
      if (y < 35 || y > 47) return null;
      var w = shw(y), dx = px - CX, ad = Math.abs(dx);
      if (ad > w || ad < gap(y)) return null;
      if (y < 41) return [dx / (w + 0.5), 0.05];
      var g = gap(y), lc = Math.sign(dx || 1) * (g + w) / 2, lw = (w - g) / 2;
      return [((dx - lc) / (lw + 0.6)) * 0.75 + (dx / (w + 0.5)) * 0.3, 0.05];
    });
    /* the tank: straps over the shoulders, a scoop neck, open armholes */
    var STRAP = { 18: [3.2, 5.8], 19: [2.6, 6.4], 20: [1.8, 7.0], 21: [0.8, 7.5] };
    R.add('jersey', { ramp: J1, group: 'jersey', line: false, lift: -0.12 }, function(px, py){
      var y = Math.floor(py), t = STRAP[y];
      if (!t) { if (y < 22 || y > 35) return null; t = [0, y === 22 ? 8.0 : y === 23 ? 8.6 : y === 24 ? 9.0 : thw(y) - 0.1]; }
      var ad = Math.abs(px - CX), w = t[1] + (y >= 20 && y <= 24 ? bw * 0.8 : 0);
      if (ad > w || ad < t[0]) return null;
      return [(px - CX) / (thw(Math.max(20, y)) + 0.6), 0.05];
    });
  } else {
    /* the jacket: padded shoulders, a lapel V, cut long over the hips */
    var khw = function(y){ return y < 18 || y > 39 ? null : (y === 18 ? 5.8 : y === 19 ? 8.8 : y <= 27 ? 10.2 : y <= 34 ? 9.6 : 10.0) + bw; };
    var vee = function(y){ return y > 28 ? 0 : 3.2 - (y - 18) * 0.32; };
    R.add('jacket', { ramp: JK, group: 'jacket', lift: -0.12 }, function(px, py){
      var y = Math.floor(py), w = khw(y);
      if (w == null) return null;
      var ad = Math.abs(px - CX);
      if (ad > w || ad < vee(y)) return null;
      return [(px - CX) / (w + 0.6), 0.05];
    });
  }

  /* ── the head ── */
  var HW = [3.0, 4.5, 5.2, 5.6, 5.8, 5.9, 5.9, 5.9, 5.8, 5.6, 5.2, 4.6, 3.8, 2.6];
  var hhw = function(y){ var v = HW[y - 4]; return v == null ? null : v; };
  [-1, 1].forEach(function(s){ R.add('ear' + s, { ramp: SK, group: 'head', line: false }, ellipse(CX + s * 6.1, 11.6, 1.1, 1.9)); });
  R.add('head', { ramp: SK, group: 'head' }, rows(4, 17, hhw, CX, 0.6));

  /* ── the arms: the side further from the light first ── */
  [1, -1].forEach(function(s){
    var A = arm[s], g = 'arm' + s, sleeved = !suit && slvHex && s === 1;
    var AR = suit ? JK : sleeved ? ramp(slvHex) : SK;
    var r0 = (suit ? 2.6 : 2.2) + am, r1 = (suit ? 2.2 : 1.85) + am * 0.8, r2 = (suit ? 2.0 : 1.45) + am * 0.6;
    if (!suit) R.add('delt' + s, { ramp: sleeved ? AR : SK, group: g }, ellipse(A.sh[0] + s * 0.1, A.sh[1] - 0.2, 2.6 + am, 2.7 + am));
    var mid = [(A.el[0] * 0.55 + A.wr[0] * 0.45) + s * 0.25, A.el[1] * 0.55 + A.wr[1] * 0.45];
    R.add('upper' + s, { ramp: AR, group: g }, tube([[A.sh[0], A.sh[1], r0], [A.el[0], A.el[1], r1]]));
    R.add('fore' + s, { ramp: AR, group: g }, tube([[A.el[0], A.el[1], r1 * 0.95], [mid[0], mid[1], r1 * 1.1], [A.wr[0], A.wr[1], r2]]));
    if (suit) R.add('cuff' + s, { ramp: SHIRT, group: g, line: false }, ellipse(A.wr[0], A.wr[1] + (pose === 'up' || (AN && A.raised) ? -0.5 : 0.6), r2 + 0.1, 0.9));
    R.add('hand' + s, { ramp: SK, group: g }, ellipse(A.hand[0], A.hand[1], A.hand[2], A.hand[3]));
  });

  /* ── what he is holding ── */
  var BX = CX + 14.9, BY = 39.6;
  if (pose === 'ball') {
    R.add('ball', { ramp: BALL, group: 'ball' }, ellipse(BX, BY, 4.4, 4.4));
    R.add('grip', { ramp: SK, group: 'arm1' }, ellipse(CX + 13.1, 36.3, 2.2, 1.7));
  }
  if (pose === 'trophy') {
    R.add('tbase', { ramp: GOLD, group: 'trophy' }, rows(34, 36, function(y){ return y === 34 ? 3.0 : 3.6; }, CX, 0.2));
    R.add('tvase', { ramp: GOLD, group: 'trophy' }, rows(29, 33, table(29, [2.0, 1.6, 1.5, 1.8, 2.4]), CX, 0.3));
    R.add('tnet', { ramp: GOLD, group: 'trophy' }, rows(26, 28, table(26, [3.0, 2.7, 2.4]), CX, 0.3));
    R.add('tball', { ramp: GOLD, group: 'trophy' }, ellipse(CX, 22.4, 3.8, 3.8));
    [-1, 1].forEach(function(s){ var A = arm[s]; R.add('thand' + s, { ramp: SK, group: 'arm' + s }, ellipse(A.hand[0], A.hand[1], A.hand[2], A.hand[3])); });
  }

  /* ── hair over the head, beard over the jaw, band and cap on top ── */
  var onHead = function(px, py){ var y = Math.floor(py), w = hhw(y); return w != null && Math.abs(px - CX) <= w; };
  var sphere = function(cy, r){ return function(px, py){ return [(px - CX) / r, (py - cy) / r]; }; };
  var dome = function(fn){ return function(px, py){ return fn(px, py) ? sphere(9, 7.2)(px, py) : null; }; };
  var top = function(yb){ return function(px, py){ return onHead(px, py) && py < yb; }; };
  var sides = function(y0, y1, inner){ return function(px, py){ return onHead(px, py) && py >= y0 && py < y1 && Math.abs(px - CX) > inner; }; };
  var crest = function(px, py){ return Math.floor(py) === 3 && Math.abs(px - CX) <= 3.4; };
  var fadeR = ramp(mix(hairHex, skinHex, 0.55), 250);
  if (hs === 'buzz') {
    R.add('hair', { ramp: ramp(mix(hairHex, skinHex, 0.3), 250), group: 'hair', line: false }, dome(function(px, py){ return top(7.6)(px, py) || sides(7.6, 10.6, 4.7)(px, py); }));
  } else if (hs === 'fade' || hs === 'bun') {
    R.add('hairf', { ramp: fadeR, group: 'hair', line: false }, dome(sides(7.4, 12.4, 4.6)));
    R.add('hair', { ramp: HR, group: 'hair' }, dome(function(px, py){ return top(7.8)(px, py) || crest(px, py); }));
    if (hs === 'bun') R.add('bun', { ramp: HR, group: 'hair' }, ellipse(CX, 2.4, 2.4, 1.8));
  } else if (hs === 'flattop') {
    R.add('hairf', { ramp: fadeR, group: 'hair', line: false }, dome(sides(7.2, 12.4, 4.6)));
    R.add('hair', { ramp: HR, group: 'hair' }, function(px, py){
      var y = Math.floor(py), ad = Math.abs(px - CX);
      if (y < 1 || y > 7 || ad > (y === 1 ? 4.9 : 5.5) || (y >= 6 && !onHead(px, py))) return null;
      return [(px - CX) / 6.2, y === 1 ? -0.8 : 0];
    });
  } else if (hs === 'curly') {
    R.add('hair', { ramp: HR, group: 'hair' }, dome(function(px, py){
      var y = Math.floor(py), x = Math.floor(px), ad = Math.abs(px - CX);
      if (y === 1) return ad <= 3.6 && x % 3 !== 0;
      if (y === 2 || y === 3) return ad <= (y === 2 ? 4.8 : 5.6);
      return top(8.0)(px, py) || sides(8.0, 10.6, 4.6)(px, py);
    }));
  } else if (hs === 'braids') {
    R.add('hair', { ramp: HR, group: 'hair' }, dome(function(px, py){ return top(8.0)(px, py) || crest(px, py) || sides(8.0, 11.6, 4.8)(px, py); }));
  } else if (hs === 'afro' || hs === 'afrocap') {
    R.add('hair', { ramp: HR, group: 'hair', line: false }, dome(function(px, py){ return top(7.8)(px, py) || sides(7.8, 10.6, 4.6)(px, py); }));
  } else if (hs === 'twists') {
    R.add('hair', { ramp: HR, group: 'hair', line: false }, dome(function(px, py){ return top(8.0)(px, py) || sides(8.0, 14.4, 4.6)(px, py); }));
  } else if (hs === 'long') {
    R.add('hair', { ramp: HR, group: 'hair' }, dome(function(px, py){ return top(7.8)(px, py) || crest(px, py) || sides(7.8, 15.4, 4.6)(px, py); }));
  }
  if (L.beard === 'goatee') {
    R.add('beard', { ramp: BR, group: 'beard', line: false }, function(px, py){
      var y = Math.floor(py), ad = Math.abs(px - CX);
      return (y === 14 && ad <= 2.4 && onHead(px, py)) || (y >= 16 && y <= 18 && ad <= (y === 18 ? 1.4 : 1.8)) ? sphere(11, 7)(px, py) : null;
    });
  } else if (L.beard === 'full') {
    R.add('beard', { ramp: BR, group: 'beard', line: false }, function(px, py){
      var y = Math.floor(py), ad = Math.abs(px - CX);
      if (!onHead(px, py) && !(y === 18 && ad <= 2.8)) return null;
      var on = (y >= 10 && y <= 13 && ad > 4.6) || (y === 14 && (ad > 4.0 || ad <= 2.4)) || (y === 15 && ad > 2.6) || y >= 16;
      return on ? sphere(11, 7.2)(px, py) : null;
    });
  }
  if (bandHex && !cap) R.add('band', { ramp: ramp(bandHex), group: 'band', line: false }, function(px, py){ var y = Math.floor(py), w = hhw(y); return (y === 7 || y === 8) && w != null && Math.abs(px - CX) <= w + 0.5 ? sphere(9, 7)(px, py) : null; });
  if (cap) {
    var CR = [3.4, 4.8, 5.5, 5.9, 6.1, 6.2, 6.3];
    R.add('crown', { ramp: J1, group: 'cap' }, function(px, py){ var y = Math.floor(py), w = CR[y - 2]; return w != null && Math.abs(px - CX) <= w ? sphere(8, 6.6)(px, py) : null; });
    R.add('brim', { ramp: J1, group: 'cap' }, function(px, py){ var y = Math.floor(py), ad = Math.abs(px - CX); return y === 9 && ad <= 6.7 ? [(px - CX) / 8, 0.1] : null; });
  }

  R.shadeRun();

  /* ── detail over the shading ── */
  if (!suit) {
    /* piping: the jersey's edge where it meets skin, in the trim colour */
    for (var y = 17; y < 37; y++) for (var x = 0; x < W; x++) {
      if (at(x, y) !== 'jersey') continue;
      var nb = [at(x - 1, y), at(x + 1, y), at(x, y - 1)];
      if (nb.indexOf('torso') >= 0 || nb.indexOf('neck') >= 0) R.set(x, y, J2[x < CX ? 3 : 2]);
    }
    /* the number, unless a trophy is in front of it, with a drop shade */
    var num = pose === 'trophy' ? '' : String(o.num == null ? '' : o.num).slice(0, 2);
    var inkR = ramp(inkOn(c1, c2)), NY = 24;
    var x0 = num.length === 2 ? CX - 5 : CX - 2;
    var lit = {};
    for (var d = 0; d < num.length; d++) {
      var dg = DIGITS[num[d]];
      if (!dg) continue;
      for (var dy = 0; dy < 6; dy++) for (var dx = 0; dx < 4; dx++) if (dg[dy][dx] === '1') lit[(x0 + d * 6 + dx) + ',' + (NY + dy)] = 1;
    }
    Object.keys(lit).forEach(function(k){
      var p = k.split(','), x = +p[0], y = +p[1];
      if (at(x, y) !== 'jersey') return;
      R.set(x, y, y === NY || x < CX - 3 ? inkR[3] : inkR[2]);
      if (!lit[(x + 1) + ',' + (y + 1)] && at(x + 1, y + 1) === 'jersey') R.set(x + 1, y + 1, J1[0]);
    });
    /* the shorts: a waistband, a stripe down each side, a hem */
    for (var y2 = 35; y2 <= 47; y2++) for (var x2 = 0; x2 < W; x2++) {
      if (at(x2, y2) !== 'shorts') continue;
      var ad2 = Math.abs(x2 + 0.5 - CX), w2 = shw(y2);
      if (y2 === 35) R.set(x2, y2, J2[x2 < CX ? 3 : 2]);
      else if (y2 === 36) R.level(x2, y2, Math.max(0, R.lev[y2][x2] - 1));
      else if (ad2 > w2 - 1.6) R.set(x2, y2, J2[x2 < CX ? 2 : 1]);
      else if (y2 === 47) R.level(x2, y2, Math.max(0, R.lev[y2][x2] - 1));
    }
    [-1, 1].forEach(function(s){
      /* a fold down each leg of the shorts */
      var fx = Math.floor(CX + s * 5.8);
      [43, 44, 45, 46].forEach(function(y){ if (at(fx, y) === 'shorts' && R.col[y][fx] !== J2[1] && R.col[y][fx] !== J2[2]) R.level(fx, y, Math.max(0, R.lev[y][fx] - 1)); });
      /* the sock's stripes, the shoe's collar, laces and side panel */
      var kx = CX + s * (4.8 + bw * 0.3 + SP), lf = LF[s];
      for (var x3 = 0; x3 < W; x3++) {
        if (at(x3, 53 - lf) === 'sock' + s) R.set(x3, 53 - lf, J1[x3 + 0.5 < kx ? 2 : 1]);
        if (at(x3, 54 - lf) === 'sock' + s) R.set(x3, 54 - lf, J2[x3 + 0.5 < kx ? 2 : 1]);
        if (at(x3, 56 - lf) === 'shoe' + s) R.level(x3, 56 - lf, Math.max(0, R.lev[56 - lf][x3] - 1));
        if (at(x3, 61 - lf) === 'shoe' + s) R.set(x3, 61 - lf, x3 + 0.5 < kx ? WH[2] : WH[1]);
      }
      var lc = Math.floor(kx + s * 0.6);
      [57, 58, 59].forEach(function(y){ y -= lf; if (at(lc, y) === 'shoe' + s) R.set(lc, y, (y + lf) % 2 ? WH[4] : WH[2]); });
      var px2 = Math.floor(kx + s * 0.6 + s * 2.3);
      [58, 59, 60].forEach(function(y){ y -= lf; if (at(px2, y) === 'shoe' + s) R.set(px2, y, J2[s < 0 ? 3 : 1]); });
    });
  } else {
    /* lapels, the shirt collar, a tie in the club's colour, two buttons, a pocket square */
    var TI = ramp(contrast(c1, mix(c1, '#14161c', 0.66)) >= 1.6 ? c1 : c2);
    for (var y5 = 18; y5 <= 29; y5++) for (var x5 = 0; x5 < W; x5++) {
      var n5 = at(x5, y5), ad5 = Math.abs(x5 + 0.5 - CX), v5 = 3.2 - (y5 - 18) * 0.32;
      if (n5 === 'jacket' && y5 <= 28 && ad5 < v5 + 1.7) R.set(x5, y5, x5 < CX ? JK[3] : JK[1]);
      if (n5 === 'jacket' && y5 <= 28 && ad5 >= v5 + 1.7 && ad5 < v5 + 2.7) R.set(x5, y5, JK[0]);
      if (n5 === 'torso' && y5 >= 19 && ad5 <= 1.0) R.set(x5, y5, y5 === 19 ? TI[3] : x5 < CX ? TI[2] : TI[1]);
      if (n5 === 'torso' && y5 === 18) R.set(x5, y5, SHIRT[ad5 > 1 ? 3 : 1]);
    }
    [31, 34].forEach(function(y){ R.set(CX - 1, y, JK[0]); });
    var PQ = ramp(c2);
    R.set(CX + 5, 23, PQ[3]); R.set(CX + 6, 23, PQ[2]); R.set(CX + 6, 22, PQ[3]);
    [-1, 1].forEach(function(s){ var y8 = 59 - LF[s]; for (var x7 = 0; x7 < W; x7++) if (at(x7, y8) === 'shoe' + s && x7 + 0.5 < CX + s * (4.9 + SP)) { R.set(x7, y8, BLK[4]); break; } });
  }

  /* the face */
  var dark = '#16110e', white = '#f3efe6';
  var brow = L.hair === 'bald' || L.hc === 5 ? SK[0] : mix(HR[0], SK[0], 0.2);
  [17, 18, 19, 24, 25, 26].forEach(function(x){ R.set(x, 9, brow); });
  [18, 19, 24, 25].forEach(function(x){ R.set(x, 10, SK[1]); });
  R.set(18, 11, white); R.set(19, 11, dark); R.set(24, 11, dark); R.set(25, 11, white);
  R.set(21, 11, SK[3]); R.set(21, 12, SK[3]); R.set(22, 12, SK[1]);
  R.set(21, 13, SK[0]); R.set(22, 13, SK[0]); R.set(20, 13, SK[1]);
  R.set(20, 15, SK[0]); R.set(21, 15, mix(SK[0], dark, 0.35)); R.set(22, 15, mix(SK[0], dark, 0.35)); R.set(23, 15, SK[0]);
  R.set(21, 16, SK[3]);
  R.set(15, 11, SK[1]); R.set(28, 11, SK[0]);
  if (L.beard === 'stubble') {
    for (var y6 = 12; y6 <= 17; y6++) for (var x6 = 15; x6 < 29; x6++) {
      if (at(x6, y6) !== 'head') continue;
      var ad6 = Math.abs(x6 + 0.5 - CX);
      if ((y6 >= 14 || ad6 > 4.4) && (x6 + y6) % 2 === 0 && !(y6 === 15 && ad6 < 2.2)) R.set(x6, y6, mix(R.col[y6][x6], BR[1], 0.5));
    }
  }
  if (L.beard === 'full' || L.beard === 'goatee') { for (var mx2 = 20; mx2 <= 23; mx2++) R.set(mx2, 15, mx2 === 20 || mx2 === 23 ? mix(SK[0], dark, 0.5) : dark); }
  if (L.hair === 'bald' && !cap) { R.set(18, 5, SK[4]); R.set(19, 5, SK[4]); R.set(18, 6, SK[3]); }

  /* hair texture */
  for (var y7 = 0; y7 < 26; y7++) for (var x8 = 0; x8 < W; x8++) {
    var n7 = at(x8, y7);
    if (!n7 || !/^hair|^bun/.test(n7) || n7 === 'hairf') continue;
    var lv = R.lev[y7][x8], hh = (((x8 * 73856093) ^ (y7 * 19349663)) >>> 0) % 7;
    if (hs === 'afro' || hs === 'afrocap') { if (hh === 0) R.level(x8, y7, Math.min(4, lv + 1)); else if (hh === 3 || hh === 5) R.level(x8, y7, Math.max(0, lv - 1)); }
    else if (hs === 'twists') { if ((x8 + (y7 >> 1)) % 2) R.level(x8, y7, Math.max(0, lv - 1)); else if (lv < 4 && y7 % 3 === 0) R.level(x8, y7, lv + 1); }
    else if (hs === 'braids') { if (x8 % 2) R.level(x8, y7, Math.max(0, lv - 1)); else if (lv < 4) R.level(x8, y7, lv + 1); }
    else if (hs === 'curly') { if ((x8 + y7) % 3 === 0) R.level(x8, y7, Math.min(4, lv + 1)); else if ((x8 + y7) % 3 === 1) R.level(x8, y7, Math.max(0, lv - 1)); }
    else if (hs === 'long') { if (x8 % 2 === 0 && y7 > 7) R.level(x8, y7, Math.max(0, lv - 1)); }
    else if (hs === 'flattop') { if (y7 === 1 || (x8 * 3 + y7 * 5) % 7 === 0) R.level(x8, y7, Math.min(4, lv + 1)); else if ((x8 + y7 * 2) % 5 === 0) R.level(x8, y7, Math.max(0, lv - 1)); }
    else if (hs === 'fade' || hs === 'bun' || hs === 'buzz') { if ((x8 * 3 + y7 * 5) % 7 === 0) R.level(x8, y7, Math.min(4, lv + 1)); else if ((x8 + y7 * 2) % 5 === 0) R.level(x8, y7, Math.max(0, lv - 1)); }
  }
  /* the hairline, and a cap's brim: the row of skin under them takes their shadow */
  for (var x9 = 0; x9 < W; x9++) for (var y9 = 5; y9 < 12; y9++) {
    var up = at(x9, y9 - 1);
    if (at(x9, y9) === 'head' && up && (/^hair|^band/.test(up) || up === 'brim') && up !== 'hairf') R.level(x9, y9, Math.max(0, R.lev[y9][x9] - (up === 'brim' ? 2 : 1)));
  }
  /* the cap's logo, the ball's seams, the trophy's net and its shine */
  if (cap) {
    var lg = ramp(c2); R.set(21, 4, lg[3]); R.set(22, 4, lg[2]); R.set(21, 5, lg[2]); R.set(22, 5, lg[1]);
    for (var xb = 0; xb < W; xb++) { if (at(xb, 2) === 'crown' && (xb === 21 || xb === 22)) R.set(xb, 2, J1[0]); }
  }
  if (pose === 'ball') {
    for (var y10 = 34; y10 < 45; y10++) for (var x10 = 28; x10 < W; x10++) {
      if (at(x10, y10) !== 'ball') continue;
      var u = x10 + 0.5 - BX, v = y10 + 0.5 - BY;
      if (Math.abs(v + u * 0.12) < 0.55 || Math.abs(u - v * 0.2) < 0.55 || Math.abs(Math.hypot(u + 5.4, v) - 4.0) < 0.5) R.set(x10, y10, BALL[0]);
    }
    R.set(Math.floor(BX - 2), Math.floor(BY - 2), BALL[4]); R.set(Math.floor(BX - 3), Math.floor(BY - 1), BALL[3]);
  }
  if (pose === 'trophy') {
    for (var y11 = 26; y11 <= 28; y11++) for (var x11 = 0; x11 < W; x11++) if (at(x11, y11) === 'tnet' && (x11 + y11) % 2) R.level(x11, y11, Math.max(0, R.lev[y11][x11] - 1));
    for (var x12 = 0; x12 < W; x12++) if (at(x12, 22) === 'tball') R.level(x12, 22, Math.max(0, R.lev[22][x12] - 1));
    R.set(20, 20, GOLD[4]); R.set(20, 21, GOLD[4]); R.set(21, 20, GOLD[4]);
  }
  /* knuckles: a dark line across the bottom of a hanging hand */
  [-1, 1].forEach(function(s){
    if (pose === 'up' || pose === 'trophy' || (pose === 'ball' && s === 1)) return;
    if (AN && !arm[s].hang) return;
    var A = arm[s], hy = Math.floor(A.hand[1] + 1.2);
    for (var xh = Math.floor(A.hand[0] - 1); xh <= Math.floor(A.hand[0] + 1); xh++) if (at(xh, hy) === 'hand' + s && (xh + hy) % 2) R.level(xh, hy, 0);
  });

  /* ── the breath: everything above the knees drops a cell ── */
  if (o.frame === 1 && !AN) {
    var knee = suit ? 42 : 45;
    for (var fy = knee; fy >= 1; fy--) { R.pid[fy] = R.pid[fy - 1].slice(); R.col[fy] = R.col[fy - 1].slice(); }
    R.pid[0] = new Array(W).fill(-1); R.col[0] = new Array(W).fill(null);
  }

  /* ── a crouch: everything above the knee sinks, the legs fold under ── */
  if (AN && AN.dip) {
    var kn = suit ? 42 : 45, dp = AN.dip;
    for (var dy2 = kn; dy2 >= dp; dy2--) { R.pid[dy2] = R.pid[dy2 - dp].slice(); R.col[dy2] = R.col[dy2 - dp].slice(); }
    for (var dz = 0; dz < dp; dz++) { R.pid[dz] = new Array(W).fill(-1); R.col[dz] = new Array(W).fill(null); }
  }

  /* opts.parts hands back the name of the part in every cell instead of a
     colour. Nothing on the page asks for it: it is how check-career proves
     no part is cut by the grid's edge, where the outline would be missing. */
  if (o.parts) return R.pid.map(function(r){ return r.map(function(p){ return p < 0 ? null : R.parts[p].name; }); });

  /* ── a line where a part in front meets the part behind ── */
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

  /* ── the outline: a dark shade of what it borders, lighter where the light is ── */
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
  return fin;
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
    var f = ANIM[pose]; if (!f) return null;
    var bw = build === 'lean' ? -0.7 : build === 'strong' ? 0.9 : 0;
    var a = animArm(f, s == null ? 1 : s, bw);
    return [a.hand[0], a.hand[1] + (f.dip || 0)];
  },
  SETS: Object.keys(SETS).reduce(function(m, k){ m[k] = SETS[k].length; return m; }, {}), isFrame: function(p){ return !!ANIM[p]; },
  DEFAULT: DEFAULT, normal: normal, lookFor: lookFor, hash: hash, inkOn: inkOn, contrast: contrast,
  paint: paint, canvas: canvas, url: url, img: img, breathe: breathe,
};
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') { window.RTF_BALLER = API; breathe(); }
})();
