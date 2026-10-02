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
];
var FACIALS = [['none', 'Clean'], ['stubble', 'Stubble'], ['stache', 'Moustache'], ['goatee', 'Goatee'], ['beard', 'Beard'], ['longbeard', 'Long beard']];
var BOTTOMS = [['trunks', 'Trunks'], ['tights', 'Tights'], ['singlet', 'Singlet'], ['shorts', 'Fight shorts'], ['pants', 'Ring pants']];
var TOPS = [['none', 'Bare'], ['tank', 'Tank'], ['crop', 'Sports top'], ['tee', 'Ring tee'], ['rash', 'Rash guard']];
var FIGURES = [['m', 'Frame A'], ['f', 'Frame B']];
var BOOTS = [['tall', 'Tall boots'], ['low', 'Low boots'], ['kick', 'Kick pads'], ['wraps', 'Barefoot wraps'], ['sneaks', 'Ring sneakers']];
var KNEES = [['none', 'None'], ['pads', 'Knee pads'], ['one', 'One pad']];
var ELBOWS = [['none', 'None'], ['pad', 'Elbow pad'], ['both', 'Both']];
var WRISTS = [['none', 'None'], ['tape', 'Wrist tape'], ['bands', 'Wristbands'], ['gloves', 'MMA gloves']];
var MASKS = [['none', 'None'], ['lucha', 'Full mask'], ['half', 'Half mask']];
var PAINTS = [['none', 'None'], ['bars', 'Eye bars'], ['skull', 'Skull'], ['split', 'Split'], ['star', 'Star eye']];
var ENTRANCES = [['none', 'None'], ['robe', 'Robe'], ['jacket', 'Jacket'], ['cape', 'Cape'], ['vest', 'Vest']];
var TATTOOS = [['none', 'None'], ['sleeve', 'Sleeve'], ['chest', 'Chest piece'], ['both', 'Sleeve and chest']];
var BELTS = [['none', 'None'], ['waist', 'On the waist'], ['shoulder', 'Over the shoulder']];
var POSES = ['idle', 'flex', 'point', 'raise', 'stance'];

function ids(list){ return list.map(function(x){ return x[0]; }); }
var DEFAULT = {
  build: 'athletic', skin: 3, hair: 'short', hc: 0, facial: 'none', bottom: 'trunks', top: 'none', boots: 'tall',
  knees: 'none', elbows: 'none', wrists: 'tape', mask: 'none', paint: 'none', entrance: 'none', tattoo: 'none', belt: 'none',
  gear: '#c6392c', trim: '#f2d27a', bootc: '', shades: false, mood: 'neutral', figure: 'm',
};
var LISTS = { build: BUILDS, hair: HAIRS, facial: FACIALS, bottom: BOTTOMS, top: TOPS, boots: BOOTS, knees: KNEES, elbows: ELBOWS,
  wrists: WRISTS, mask: MASKS, paint: PAINTS, entrance: ENTRANCES, tattoo: TATTOOS, belt: BELTS, figure: FIGURES };

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
  giant:    { sh: 18.8, ws: 34.5, kn: 50.0, so: 63.5, sw: 11.8, cw: 11.3, ww: 9.2, bel: 0.6, ar: 2.9,  lr: 3.2,  jaw: 0.7 },
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
  var bootHex = L.bootc || (L.boots === 'sneaks' ? '#ecebe6' : L.gear);
  var BT = ramp(bootHex), WH = ramp('#ecebe6'), TAPE = ramp('#e9e6dc'), BLK = ramp('#1c1f27');
  var GOLD = ramp('#e3a92f', 18), STRAP = ramp('#2a1d18'), GEM = ramp('#d8304a');
  var INKR = ramp('#24324a', 250);
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
    else if (pose === 'raise') a = { el: [CX + s * (B.sw + 3.0), shY - 8.6], wr: [CX + s * (B.sw + 1.8), shY - 19.4], fist: [CX + s * (B.sw + 1.2), shY - Math.min(22.4, shY - 4.2)] };
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
  var hs = L.mask === 'lucha' ? 'masked' : L.hair;
  var hy = top0;
  if (hs === 'long' || hs === 'dreads') R.add('hairback', { ramp: HR, group: 'hair', line: false }, rows(hy + 4, hy + 23, function(y){ return y < hy + 19 ? 7.0 : 7.0 - (y - hy - 18) * 0.8; }, CX, 0.3));
  if (hs === 'mullet') R.add('hairback', { ramp: HR, group: 'hair', line: false }, rows(hy + 8, hy + 20, function(y){ return y < hy + 17 ? 6.6 : 6.6 - (y - hy - 16) * 1.1; }, CX, 0.3));
  if (hs === 'afro') R.add('hairback', { ramp: HR, group: 'hair', line: false, flat: 0.9 }, ellipse(CX, hy + 4.4, 9.2, 7.6));
  if (hs === 'pony') R.add('hairback', { ramp: HR, group: 'hair', line: false }, tube([[CX + 4.6, hy + 4, 1.9], [CX + 6.6, hy + 9, 1.6], [CX + 6.2, hy + 17, 1.0]]));

  /* ── legs, then what covers them ── */
  var lr = B.lr;
  [-1, 1].forEach(function(s){
    var g = leg[s], gp = 'leg' + s;
    var pts = [[g.hip[0], g.hip[1], lr + 0.4], [g.knee[0], g.knee[1] - 2, lr], [g.knee[0], g.knee[1], lr * 0.82], [g.ank[0], g.ank[1], lr * 0.62]];
    R.add('leg' + s, { ramp: SK, group: gp }, tube(pts));
    var full = L.bottom === 'tights' || L.bottom === 'pants';
    if (full) R.add('tights' + s, { ramp: L.bottom === 'pants' ? ramp(mix(L.gear, '#1a1c22', 0.35)) : GR, group: gp, lift: -0.08 }, tube(pts.map(function(p){ return [p[0], p[1], p[2] + (L.bottom === 'pants' ? 0.55 : 0.12)]; })));
    if (L.bottom === 'shorts' || L.bottom === 'singlet') {
      var cut = L.bottom === 'shorts' ? g.knee[1] - 2.2 : wsY + 6.5;
      R.add('thigh' + s, { ramp: GR, group: gp, lift: -0.08, clip: function(x, y){ return y <= cut; } }, tube(pts.map(function(p){ return [p[0], p[1], p[2] + 0.25]; })));
    }
    /* boots: tall laces to under the knee, low ones to the ankle, kick pads over the shin */
    var bootTop = L.boots === 'tall' || L.boots === 'kick' ? g.knee[1] + 2.2 : g.ank[1] - 1.4;
    if (L.boots !== 'wraps') {
      R.add('boot' + s, { ramp: BT, group: 'boot' + s, clip: function(x, y){ return y >= bootTop; } },
        tube([[g.knee[0], g.knee[1] + 1, lr * 0.9], [g.ank[0], g.ank[1], lr * 0.78], [g.ank[0] + s * 0.2, SOLE - 1.5, lr * 0.75]]));
      R.add('foot' + s, { ramp: BT, group: 'boot' + s }, rows(SOLE - 3, SOLE - 1, function(y){ return y === SOLE - 3 ? lr * 0.85 : lr * 0.95 + 0.6; }, g.foot, 0.4));
      R.add('sole' + s, { ramp: L.boots === 'sneaks' ? WH : BLK, group: 'boot' + s, line: false }, rows(SOLE, SOLE, function(){ return lr * 0.95 + 0.9; }, g.foot, 0));
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
  R.add('trunks', { ramp: L.bottom === 'pants' ? ramp(mix(L.gear, '#1a1c22', 0.35)) : GR, group: 'trunks', lift: -0.1 }, function(px, py){
    var y = Math.floor(py); if (y < trunkTop || y > trunkBot) return null;
    var w = (thw(wsY) || B.ww) + 0.3 + (fem ? 1.2 : 0) - Math.max(0, y - wsY - 1) * (L.bottom === 'trunks' ? 0.25 : 0.05), dx = px - CX, ad = Math.abs(dx);
    if (ad > w) return null;
    if (L.bottom === 'trunks' && y > wsY + 2 && ad > w - (y - wsY - 2) * 0.9 && ad > 1.2) return null;
    return [dx / (w + 0.5), 0.05];
  });
  if (L.bottom === 'singlet' || L.top !== 'none') {
    var strap = L.bottom === 'singlet' && L.top === 'none';
    var tee = L.top === 'tee' || L.top === 'rash';
    var TOPR = L.top === 'none' ? GR : L.top === 'tee' ? ramp(mix(L.trim, '#1a1c22', 0.15)) : L.top === 'rash' ? ramp(mix(L.gear, '#101216', 0.45)) : GR;
    R.add('top', { ramp: TOPR, group: 'top', line: false, lift: -0.1 }, function(px, py){
      var y = Math.floor(py), w = thw(y); if (w == null || y > wsY) return null;
      var dx = px - CX, ad = Math.abs(dx);
      if (ad > w + 0.1) return null;
      if (L.top === 'crop' && y > shY + (wsY - shY) * 0.5) return null;
      if (!tee) {
        var neckCut = y < shY + 3 ? 3.4 - (y - shY) * 0.2 : 0;
        if (y < shY + 1 && ad > (strap ? 4.6 : 6.4)) return null;
        if (y < shY + 3 && ad < neckCut) return null;
        if (y < shY + 5 && ad > w - 1.6) return null;
      } else if (y < shY - 0.5 && ad < 2.6) return null;
      return [dx / (w + 0.6), 0.05];
    });
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
  if (L.entrance === 'robe' || L.entrance === 'jacket' || L.entrance === 'vest') {
    var hem = L.entrance === 'robe' ? knY + 3 : L.entrance === 'jacket' ? wsY + 3 : wsY + 0.5;
    R.add('coat', { ramp: GR, group: 'coat', lift: -0.1 }, function(px, py){
      var y = Math.floor(py); if (y < shY - 1 || y > hem) return null;
      var w = y <= wsY ? (thw(y) || B.ww) + 0.9 : (thw(wsY) || B.ww) + 0.9 + (y - wsY) * (L.entrance === 'robe' ? 0.45 : 0.2);
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
    var A = arm[s], g = 'arm' + s, sleeved = L.entrance === 'robe' || L.entrance === 'jacket' || (L.top === 'tee' || L.top === 'rash');
    var SLR = L.entrance === 'robe' || L.entrance === 'jacket' ? GR : L.top === 'tee' ? ramp(mix(L.trim, '#1a1c22', 0.15)) : ramp(mix(L.gear, '#101216', 0.45));
    var r0 = B.ar + 0.25, r1 = B.ar * 0.86, r2 = B.ar * 0.66;
    var flexed = pose === 'flex';
    R.add('delt' + s, { ramp: SK, group: g }, ellipse(A.sh[0] + s * 0.3, A.sh[1] - 0.3, B.ar + 0.9, B.ar + 0.8));
    var bic = [(A.sh[0] + A.el[0]) / 2 + (flexed ? 0 : 0), (A.sh[1] + A.el[1]) / 2 - (flexed ? 0.9 : 0), r0 + (flexed ? 0.9 : 0.25)];
    R.add('upper' + s, { ramp: SK, group: g }, tube([[A.sh[0], A.sh[1], r0], bic, [A.el[0], A.el[1], r1]]));
    var mid = [A.el[0] * 0.5 + A.wr[0] * 0.5, A.el[1] * 0.5 + A.wr[1] * 0.5, r1 * 1.05];
    R.add('fore' + s, { ramp: SK, group: g }, tube([[A.el[0], A.el[1], r1 * 0.95], mid, [A.wr[0], A.wr[1], r2]]));
    if (sleeved) {
      var sleeveEnd = L.entrance === 'robe' ? 1.0 : L.entrance === 'jacket' ? 0.92 : 0.45;
      var sp = function(t){ return [A.sh[0] + (A.wr[0] - A.sh[0]) * t, A.sh[1] + (A.wr[1] - A.sh[1]) * t]; };
      R.add('sleeve' + s, { ramp: SLR, group: g, lift: -0.08 }, tube([[A.sh[0], A.sh[1], r0 + 0.8], [A.el[0], A.el[1], r1 + 0.6], [sp(sleeveEnd)[0] * 0.5 + A.el[0] * 0.5 * (sleeveEnd < 0.6 ? 1 : 0) + (sleeveEnd < 0.6 ? 0 : sp(sleeveEnd)[0] * 0.5), sleeveEnd < 0.6 ? A.el[1] - (A.el[1] - A.sh[1]) * 0.2 : sp(sleeveEnd)[1], r2 + 0.7]]));
    }
    var padOn = L.elbows === 'both' || (L.elbows === 'pad' && s === 1);
    if (padOn && !sleeved) R.add('elbow' + s, { ramp: BLK, group: g }, ellipse(A.el[0], A.el[1], r1 + 0.6, r1 + 0.5));
    if (L.wrists !== 'none' && !(sleeved && L.entrance === 'robe')) {
      var wcol = L.wrists === 'tape' ? TAPE : L.wrists === 'gloves' ? BLK : TR;
      R.add('wrist' + s, { ramp: wcol, group: g, line: false }, tube([[A.wr[0] + (A.el[0] - A.wr[0]) * 0.22, A.wr[1] + (A.el[1] - A.wr[1]) * 0.22, r2 + 0.35], [A.wr[0], A.wr[1], r2 + 0.3]]));
    }
    var fr = Math.max(1.8, B.ar * 0.82);
    R.add('fist' + s, { ramp: L.wrists === 'gloves' ? BLK : SK, group: g }, ellipse(A.fist[0], A.fist[1], fr, fr + 0.2));
    if (A.point) R.add('finger' + s, { ramp: SK, group: g }, tube([[A.fist[0], A.fist[1] - 1, 0.7], [A.fist[0] + 0.4, A.fist[1] - 4.2, 0.6]]));
  });

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
  if (hs === 'buzz') R.add('hair', { ramp: ramp(mix(hairHex, skinHex, 0.35), 250), group: 'hair', line: false }, dome(function(px, py){ return topOf(hy + 3.6)(px, py) || sides(hy + 3.6, hy + 6.6, 4.7)(px, py); }));
  else if (hs === 'short' || hs === 'pony' || hs === 'topknot') {
    R.add('hairf', { ramp: fadeR, group: 'hair', line: false }, dome(sides(hy + 3.4, hy + 8.2, 4.6)));
    R.add('hair', { ramp: HR, group: 'hair' }, dome(function(px, py){ return topOf(hy + 3.8)(px, py) || (Math.floor(py) === hy - 1 && Math.abs(px - CX) <= 3.4); }));
    if (hs === 'topknot') R.add('knot', { ramp: HR, group: 'hair' }, ellipse(CX + 0.4, hy - 2.2, 2.3, 1.9));
  } else if (hs === 'slick') {
    R.add('hair', { ramp: HR, group: 'hair' }, dome(function(px, py){ return topOf(hy + 3.4)(px, py) || sides(hy + 3.4, hy + 7.4, 4.9)(px, py) || (Math.floor(py) === hy - 1 && Math.abs(px - CX) <= 4.2); }));
  } else if (hs === 'mohawk') {
    R.add('hairf', { ramp: fadeR, group: 'hair', line: false }, dome(sides(hy + 1, hy + 7.4, 2.0)));
    R.add('hair', { ramp: HR, group: 'hair' }, function(px, py){ var y = Math.floor(py), ad = Math.abs(px - CX + 0.2); return y >= hy - 4 && y <= hy + 3 && ad <= (y < hy - 2 ? 1.2 : 1.7) ? [(px - CX) / 2.4, -0.4] : null; });
  } else if (hs === 'afro') {
    R.add('hair', { ramp: HR, group: 'hair', line: false }, dome(function(px, py){ return topOf(hy + 3.8)(px, py) || sides(hy + 3.8, hy + 6.6, 4.6)(px, py); }));
  } else if (hs === 'long' || hs === 'dreads' || hs === 'mullet') {
    R.add('hair', { ramp: HR, group: 'hair' }, dome(function(px, py){ return topOf(hy + 3.8)(px, py) || (Math.floor(py) === hy - 1 && Math.abs(px - CX) <= 3.4) || sides(hy + 3.8, hy + (hs === 'mullet' ? 7.4 : 11.4), 4.6)(px, py); }));
  } else if (hs === 'spiky') {
    R.add('hair', { ramp: HR, group: 'hair' }, function(px, py){
      var y = Math.floor(py), x = Math.floor(px), ad = Math.abs(px - CX);
      if (onHead(px, py) && py < hy + 3.6) return sphere(hy + 5, 7.2)(px, py);
      if (y >= hy - 3 && y < hy && ad <= 5.2 && ((x + (hy - y)) % 3 === 0 || y === hy - 1)) return [(px - CX) / 6, -0.6];
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
  if (L.mask !== 'none') {
    var MK = GR;
    R.add('mask', { ramp: MK, group: 'mask', line: false }, dome(function(px, py){
      if (!onHead(px, py) && !(L.mask === 'lucha' && Math.floor(py) === hy - 1 && Math.abs(px - CX) <= 3.4)) return false;
      if (L.mask === 'half') return py >= hy + 2 && py < hy + 9;
      return py < hy + (L.mask === 'lucha' ? 12.2 : 9);
    }));
  }

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
      if (Math.abs(x1 + 0.5 - outer) < 0.8 && L.bottom !== 'pants') R.set(x1, y1, TR[s1 < 0 ? 3 : 1]);
    }
    if (n1 === 'coat') {
      var nb = [at(x1 - 1, y1), at(x1 + 1, y1)];
      if (nb.indexOf('torso') >= 0 || nb.indexOf('trunks') >= 0 || nb.indexOf('top') >= 0 || nb.indexOf('strap') >= 0 || nb.indexOf('plate') >= 0) R.set(x1, y1, TR[x1 < CX ? 3 : 2]);
    }
    if (n1 === 'cape') { if (y1 >= knY + 5) R.set(x1, y1, TR[2]); }
    if (/^boot/.test(n1 || '') && L.boots === 'tall') {
      var s2 = n1.slice(-2) === '-1' ? -1 : 1, lg2 = leg[s2];
      if (Math.abs(x1 + 0.5 - lg2.ank[0]) < 0.6 && y1 < lg2.ank[1] && (y1 % 2 === 0)) R.set(x1, y1, TR[2]);
      if (y1 === Math.ceil(lg2.knee[1] + 2.2)) R.set(x1, y1, TR[x1 < lg2.knee[0] ? 3 : 1]);
    }
  }
  /* the body: a pec line, abs on the lean builds, a navel on the big ones */
  var bare = L.top === 'none' && L.bottom !== 'singlet' && !(L.entrance === 'robe' || L.entrance === 'jacket');
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
      if ((L.tattoo === 'chest' || L.tattoo === 'both') && nt === 'torso' && Math.abs(xt + 0.5 - CX - 3.6) < 2.4 && yt > shY + 1 && yt < shY + 6 && hh % 2) R.set(xt, yt, mix(R.col[yt][xt], INKR[1], 0.55));
    }
  }
  /* the mask's trim: rings round the eyes, a crest up the middle */
  if (L.mask === 'lucha') {
    for (var ym = hy - 1; ym < hy + 13; ym++) for (var xm = 0; xm < W; xm++) {
      if (at(xm, ym) !== 'mask') continue;
      var dx = xm + 0.5 - CX, dy = ym - hy;
      var eye = (dy >= 6 && dy <= 8) && (Math.abs(dx + 3.2) < 2.4 || Math.abs(dx - 2.8) < 2.4);
      if (eye) R.set(xm, ym, TR[dx < 0 ? 3 : 2]);
      if (Math.abs(dx) < 0.8 && dy < 6) R.set(xm, ym, TR[2]);
      if (dy === 4 && Math.abs(dx) > 1 && Math.abs(dx) < 4.6) R.set(xm, ym, TR[1]);
      if (dy >= 10 && Math.abs(dx) < 1.8 && dy <= 11) R.set(xm, ym, SK[1]);
    }
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
  if (L.mask !== 'lucha') {
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
  if (L.facial === 'stache' || L.facial === 'beard' || L.facial === 'longbeard' || L.facial === 'goatee') {
    for (var mx2 = -3; mx2 <= 2; mx2++) if (L.facial !== 'goatee' || Math.abs(mx2 + 0.5) < 2) R.set(ex(mx2), hy + 10, BR[mx2 < 0 ? 2 : 1]);
  }
  if (L.facial === 'stubble') {
    for (var ys = hy + 8; ys <= hy + 13; ys++) for (var xs = 0; xs < W; xs++) {
      if (at(xs, ys) !== 'head') continue;
      var ads = Math.abs(xs + 0.5 - CX);
      if ((ys >= hy + 10 || ads > 4.4) && (xs + ys) % 2 === 0 && !(ys === hy + 11 && ads < 2.2)) R.set(xs, ys, mix(R.col[ys][xs], BR[1], 0.5));
    }
  }
  /* face paint, over the skin only */
  if (L.paint !== 'none' && L.mask !== 'lucha') {
    var PNT = L.paint === 'skull' ? ramp('#ecebe6') : ramp(L.trim);
    for (var yq = hy; yq < hy + 14; yq++) for (var xq = 0; xq < W; xq++) {
      if (at(xq, yq) !== 'head') continue;
      var dq = xq + 0.5 - CX, rq = yq - hy, cur = R.col[yq][xq];
      if (cur === white || cur === dark) continue;
      if (L.paint === 'bars' && (rq === 8 || rq === 9) && Math.abs(dq) > 1.5 && Math.abs(dq) < 5) R.set(xq, yq, PNT[rq === 8 ? 2 : 1]);
      if (L.paint === 'split' && dq < 0) R.set(xq, yq, PNT[Math.min(4, R.lev[yq][xq])]);
      if (L.paint === 'star' && Math.abs(dq - 2.6) + Math.abs(rq - 7) * 0.8 < 2.6 && !(Math.abs(dq - 2.6) < 1 && rq === 7)) R.set(xq, yq, PNT[2]);
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
    if (hs === 'afro') { if (h7 === 0) R.level(x8, y7, lv + 1); else if (h7 === 3 || h7 === 5) R.level(x8, y7, lv - 1); }
    else if (hs === 'dreads') { if (x8 % 2) R.level(x8, y7, lv - 1); else if (y7 % 3 === 0) R.level(x8, y7, lv + 1); }
    else if (hs === 'long' || hs === 'mullet' || hs === 'pony') { if (x8 % 2 === 0 && y7 > hy + 3) R.level(x8, y7, lv - 1); }
    else if (hs === 'slick') { if ((x8 + y7) % 4 === 0) R.level(x8, y7, lv + 1); }
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
  if (KEYS.length > 120) delete CACHE[KEYS.shift()];
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
  }, 720);
}

var API = {
  W: W, H: H, SOLE: SOLE, POSES: POSES, BODY: BODY, DEFAULT: DEFAULT, LISTS: LISTS,
  SKINS: SKINS, HAIR_COLORS: HAIR_COLORS, FIGURES: FIGURES,
  normal: normal, hash: hash, ramp: ramp, mix: mix, contrast: contrast, inkOn: inkOn,
  paint: paint, canvas: canvas, url: url, img: img, breathe: breathe,
};
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') { window.RTR_PX = API; breathe(); }
})();
