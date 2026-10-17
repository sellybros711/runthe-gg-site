/* Run The Floor: the cutscene stage, in 3D.

   A scene used to stand a 3D pixel man in front of a flat set painted
   straight on: a wall, a band for a desk, a dotted skyline. He was drawn from
   a corner, 30 degrees down, lit from the top left; the set behind him was
   drawn from nowhere. This file builds every room as a small 3D world and
   traces it from HIS camera (baller.js CAM: the same pitch, the same turn,
   orthographic, one cell a cell), and paints it with HIS colour ramps (cool
   in shadow, warm in the light, five steps). So the floor recedes the way his
   feet do, a desk has a top and a front the way his shoulders do, and the
   light that shades his left cheek is the light that throws the desk's
   shadow.

   What it hands back is canvases on the character's own fine pixel grid:

     back   everything, behind every figure
     l1     furniture in front of the far figure (a podium, an anchor desk)
     l2     furniture in front of the near figure (a press table)

   and a projection, so scenes.js can stand a figure on any point of the floor
   with his feet exactly on it. A figure is a DOM canvas between the layers,
   so his breath and blink never repaint the room.

   Rooms are data: planes (the floor, the back wall, the right wall), boxes
   (traced exactly, by slabs) and round things (sphere traced, as baller.js
   traces a man). Each surface has a material, which is a colour and how it
   takes the light; a screen or a lamp is emissive and glows.

   Window: RTF_STAGE. Needs RTF_BALLER (its camera, its ramp). */
(function(){
'use strict';
var B = typeof window !== 'undefined' ? window.RTF_BALLER : null;

// ─── the camera, the character's own ────────────────────────────────────────
var PITCH = ((B && B.CAM && B.CAM.pitch) || 30) * Math.PI / 180, YAW = ((B && B.CAM && B.CAM.yaw) || 35) * Math.PI / 180;
var CP = Math.cos(PITCH), SN = Math.sin(PITCH), CY = Math.cos(YAW), SY = Math.sin(YAW);
/* world: x right along the back wall, y DOWN (the floor is 0, up is
   negative, as in baller.js), z toward the front of the room */
function rot(v){ var rx = v[0] * CY + v[2] * SY, rz = -v[0] * SY + v[2] * CY; return [rx, v[1] * CP + rz * SN, -v[1] * SN + rz * CP]; }
function unrot(q){ var dy = q[1] * CP - q[2] * SN, rz = q[1] * SN + q[2] * CP; return [q[0] * CY - rz * SY, dy, q[0] * SY + rz * CY]; }
function norm(v){ var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
var LV = norm([-0.55, -0.72, 0.72]);          /* baller.js LIGHT, in view space */
var LW = norm(unrot(LV));                      /* the same light, in the world */
var DIR = unrot([0, 0, -1]);                   /* a camera ray, in the world */
var Z0 = 900;                                  /* where a ray starts, in view depth */
/* the character's sprite: his feet are cell (21, 58.2) of a 44 by 64 grid */
var FOOT_X = 21, FOOT_Y = 58.2, FT = 8.2;      /* FT: one foot, in cells (a 6'7" man is 54) */

function clamp01(t){ return t < 0 ? 0 : t > 1 ? 1 : t; }
function hashI(x, y, s){ var h = (x | 0) * 374761393 + (y | 0) * 668265263 + (s | 0) * 2246822519; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(function(v){ return (v + 0.5) / 16; });
function bay(x, y){ return BAYER[(y & 3) * 4 + (x & 3)]; }

// ─── colour ────────────────────────────────────────────────────────────────
function rgb(h){ h = String(h || '#888').replace('#', ''); if (h.length === 3) h = h.split('').map(function(c){ return c + c; }).join(''); var n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function hex(c){ return '#' + c.map(function(v){ v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); }).join(''); }
function mix(a, b, t){ var x = rgb(a), y = rgb(b); return hex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]); }
function lum(h){ var c = rgb(h); return (c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114) / 255; }
var RAMPS = {};
/* the character's five steps for a colour, as rgb triples */
function rampOf(h){
  var r = RAMPS[h]; if (r) return r;
  var hx = B && B.ramp ? B.ramp(h) : [mix(h, '#0b0e1a', 0.55), mix(h, '#0b0e1a', 0.3), h, mix(h, '#fff6da', 0.25), mix(h, '#fff6da', 0.5)];
  return (RAMPS[h] = hx.map(rgb));
}

// ─── a 5 by 7 pixel font, for words on a wall ──────────────────────────────
var GLYPH = {
  A: '01110100011000111111100011000110001', B: '11110100011000111110100011000111110', C: '01110100011000010000100001000101110',
  D: '11110100011000110001100011000111110', E: '11111100001000011110100001000011111', F: '11111100001000011110100001000010000',
  G: '01110100011000010111100011000101111', H: '10001100011000111111100011000110001', I: '01110001000010000100001000010001110',
  J: '00111000100001000010000101001001100', K: '10001100101010011000101001001010001', L: '10000100001000010000100001000011111',
  M: '10001110111010110101100011000110001', N: '10001110011010110011100011000110001', O: '01110100011000110001100011000101110',
  P: '11110100011000111110100001000010000', Q: '01110100011000110001101011001001101', R: '11110100011000111110101001001010001',
  S: '01111100001000001110000010000111110', T: '11111001000010000100001000010000100', U: '10001100011000110001100011000101110',
  V: '10001100011000110001100010101000100', W: '10001100011000110101101011010101010', X: '10001100010101000100010101000110001',
  Y: '10001100010101000100001000010000100', Z: '11111000010001000100010001000011111',
  '0': '01110100011001110101110011000101110', '1': '00100011000010000100001000010001110', '2': '01110100010000100010001000100011111',
  '3': '11111000100010000010000011000101110', '4': '00010001100101010010111110001000010', '5': '11111100001111000001000011000101110',
  '6': '00110010001000011110100011000101110', '7': '11111000010001000100010000100001000', '8': '01110100011000101110100011000101110',
  '9': '01110100011000101111000010001001100', ' ': '00000000000000000000000000000000000', '.': '00000000000000000000000000110001100',
  '-': '00000000000000011111000000000000000', '#': '01010010101111101010111110101001010', ':': '00000011000110000000011000110000000',
  "'": '00100001000100000000000000000000000', '!': '00100001000010000100001000000000100', '&': '01100100101010001000101011001001101',
  '/': '00001000010001000100010001000010000', '+': '00000001000010011111001000010000000'
};
/* A word as a bitmap, s cells a pixel, with a one pixel shadow under each
   stroke so it reads on any colour. */
function textTex(str, col, s, opts){
  opts = opts || {};
  str = String(str || '').toUpperCase().replace(/[^A-Z0-9 .\-#:'!&\/+]/g, '');
  s = s || 1;
  var gw = 6 * s, w = Math.max(1, str.length * gw - s), h = 7 * s + s;
  var px = new Array(w * h);
  for (var i = 0; i < str.length; i++) {
    var g = GLYPH[str[i]] || GLYPH[' '];
    for (var y = 0; y < 7; y++) for (var x = 0; x < 5; x++) if (g[y * 5 + x] === '1')
      for (var a = 0; a < s; a++) for (var b = 0; b < s; b++) {
        var X = i * gw + x * s + b, Y = y * s + a;
        px[Y * w + X] = col;
        if (opts.shadow !== false && Y + s < h && !px[(Y + s) * w + X]) px[(Y + s) * w + X] = px[(Y + s) * w + X] || 'sh';
      }
  }
  return { w: w, h: h, at: function(x, y){ var c = px[y * w + x]; return c === 'sh' ? opts.sh || null : c || null; } };
}
/* WORDS ON A WALL ARE A QUARTER BIGGER THAN A CELL. The camera turns the back
   wall 35 degrees and looks down 30, so one cell of wall is 0.82 of a cell
   across and 0.87 down on the screen. A one cell stroke drawn there fell
   between the samples of a one cell trace (the desktop's), and the press
   room's MAGIC read MFGIC. At WT a stroke is a cell or more on the screen,
   so none is dropped. (u, v) is the wall point from the word's top left. */
var WT = 1.25;
function onWall(t, u, v){
  var x = Math.floor(u / WT), y = Math.floor(v / WT);
  return t && u >= 0 && v >= 0 && x < t.w && y < t.h ? t.at(x, y) : null;
}

// ─── shapes ────────────────────────────────────────────────────────────────
/* A box is an axis-aligned slab set, traced exactly: [x0, y0, z0, x1, y1, z1]
   with y0 the top (up is negative). A round thing is a distance function. */
function sdBox(c, h, r){ r = r || 0; return function(p){
  var qx = Math.abs(p[0] - c[0]) - h[0] + r, qy = Math.abs(p[1] - c[1]) - h[1] + r, qz = Math.abs(p[2] - c[2]) - h[2] + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r; }; }
/* an upright cylinder: centre of the bottom face c, radius r, height h */
function sdCyl(c, r, h, rr){ rr = rr || 0; return function(p){
  var dx = Math.hypot(p[0] - c[0], p[2] - c[2]) - r + rr, dy = Math.abs(p[1] - (c[1] - h / 2)) - h / 2 + rr;
  return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - rr; }; }
function sdSph(c, r){ return function(p){ return Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) - r; }; }
function sdCap(a, b, r){ var bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2], ll = bx * bx + by * by + bz * bz || 1;
  return function(p){ var px = p[0] - a[0], py = p[1] - a[1], pz = p[2] - a[2], t = clamp01((px * bx + py * by + pz * bz) / ll);
    return Math.hypot(px - bx * t, py - by * t, pz - bz * t) - r; }; }
function sdTorusX(c, R, r){ return function(p){ var q = Math.hypot(p[1] - c[1], p[2] - c[2]) - R; return Math.hypot(q, p[0] - c[0]) - r; }; }

// ─── a room, as data ───────────────────────────────────────────────────────
function Room(key){
  this.key = key; this.boxes = []; this.rounds = []; this.lights = []; this.spots = {}; this.amb = 0;
  this.D = 70; this.R = 120; this.Hc = 120; this.focus = [0, 0, 0]; this.fy = 0.86; this.bg = '#05070d';
  this.floor = { c: '#3a3a44' }; this.back = { c: '#20232e' }; this.right = { c: '#1a1c26' };
  this.void = '#06070c';
  /* what the walls carry above their top (rigAt): a lighting grid in the
     broadcast and arena rooms, an upper wall with sconces in the rooms
     people live and work in */
  this.rig = /^(locker|office|home|hotel)$/.test(key) ? 'wall' : 'grid';
}
/* m: a material, or a function (p, n, uv) => material. layer 0, 1 or 2. */
Room.prototype.box = function(x0, y0, z0, x1, y1, z1, m, o){
  o = o || {};
  var b = { a: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)], b: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)], m: m, layer: o.layer || 0, cast: o.cast !== false, tex: o.tex || null, id: 0 };
  this.boxes.push(b); return b;
};
Room.prototype.round = function(f, c, r, m, o){
  o = o || {};
  var s = { f: f, c: c, r: r, m: m, layer: o.layer || 0, cast: o.cast !== false, ao: o.ao !== false, id: 0 };
  this.rounds.push(s); return s;
};
Room.prototype.light = function(x, z, r, a, o){ o = o || {}; this.lights.push({ x: x, z: z, r: r, a: a, top: o.top || -this.Hc, beam: !!o.beam, col: o.col || null }); };

/* A material: a colour, how far it sits up or down the ramp (b), gloss (g),
   emissive (e: the colour as it is, glowing), a reflection (rf). */
function M(c, o){ var m = { c: c }; for (var k in o || {}) m[k] = o[k]; return m; }

// ─── the rooms ─────────────────────────────────────────────────────────────
function darken(c, t){ return mix(c, '#05070d', t); }
function lighten(c, t){ return mix(c, '#ffffff', t); }
function safe(c, d){ return c && /^#[0-9a-f]{3,6}$/i.test(c) ? c : d; }
/* a club colour dark enough to be a wall in it */
function wallOf(c, t){ var l = lum(c); return darken(c, l > 0.6 ? 0.78 : l > 0.35 ? 0.66 : 0.5 + (t || 0)); }

var BUILD = {};
/* Pictures a room can show on a screen, registered by name (scenes.js puts
   the player's portrait here). A texture is { w, h, at(x, y) => colour }. */
var TEX = {};
function setTex(name, t){ if (name && t) TEX[name] = t; }

/* THE STUDIO. A network set at night: a video wall of six panels behind the
   desk (the middle pair carries the player and his numbers), a glass wall of
   city on the right, a glossy black floor that throws the screens back, an
   anchor desk with a lit front, a truss of lamps overhead. c1 is the
   network's colour. */
BUILD.studio = function(o){
  var R = new Room('studio'), oc = safe(o.oc, '#c06bff'), F = FT;
  R.D = 64; R.R = 112; R.Hc = 13 * F; R.amb = -0.35; R.bg = '#07060f';
  R.floor = function(p){
    var u = Math.floor((p[0] + 400) / 22), v = Math.floor((p[2] + 400) / 22);
    var ring = Math.abs(Math.hypot(p[0] - 6, (p[2] - 10) * 1.4) - 46) < 1.2;
    if (ring) return M(oc, { e: 1, k: 0.55 });
    return M((u + v) % 2 ? '#15141f' : '#121119', { g: 1, rf: 0.34 });
  };
  /* THE WALL IS A SET, NOT A FLAT (B17). It was one dark plane above the
     screens, the top half of every studio shot. Now: a lit cove along its
     foot, LED seams in the network's colour between the panels, the show's
     name on a fascia over the video wall, and a scores tower to the left. */
  var vx0 = -3 * 26 - 2.5 * 2 + 44 - 4;            /* the video wall's left edge */
  R.back = function(p){
    var h = -p[1], x = p[0];
    if (h > R.Hc) return M('#07060d', { b: -1 });
    if (h < 6) return M('#1b1828', {});
    if (h < 7.4) return M(mix(oc, '#ffffff', 0.15), { e: 1 });
    var seam = x < vx0 - 2 && Math.abs(((x - vx0 + 400) % 24) - 12) > 11.3 && h < R.Hc * 0.86;
    if (seam) return M(darken(oc, 0.3), { e: 1 });
    var col = Math.floor((x + 400) / 12);
    return M(col % 2 ? '#1a1526' : '#171322', { b: h > R.Hc * 0.8 ? -0.6 : 0 });
  };
  /* the right wall is glass on a city at night */
  R.right = function(p){
    var h = -p[1], z = p[2];
    if (h > R.Hc) return M('#07060d', { b: -1 });
    if (h < 8) return M('#1b1828', {});
    var frame = Math.abs(((z + 400) % 30) - 15) > 14 || Math.abs(h - 8) < 1 || h > R.Hc - 3;
    if (frame) return M('#2b2638', {});
    /* towers, each a column of lit and dark windows */
    var tw = Math.floor((z + 400) / 9), top = 24 + hashI(tw, 3, 7) * 60;
    if (h - 8 > top) return M(mix('#140f2a', oc, 0.12), { e: 1 });
    var lit = hashI(Math.floor((z + 400) / 2), Math.floor(h / 2.5), tw) > 0.72;
    return M(lit ? '#ffd98a' : mix('#0d0b1c', oc, 0.08), { e: lit ? 1 : 0, b: lit ? 0 : -0.5 });
  };
  /* the video wall: six screens on a black frame */
  var top = -6.5 * F, sw = 26, gap = 2, x0 = -3 * sw - 2.5 * gap + 44;
  R.box(x0 - 4, top - 4, -R.D, x0 + 6 * sw + 5 * gap + 4, -2.2 * F, -R.D + 3, M('#0b0a12', {}));
  for (var i = 0; i < 6; i++) {
    var sx = x0 + i * (sw + gap);
    var isMain = i === 2 || i === 3;
    var t1 = sx, t2 = sx + sw;
    var b = R.box(t1, top, -R.D + 3, t2, -2.6 * F, -R.D + 5, isMain ? (function(){ return function(p){
      /* his portrait, a quarter bigger than a cell (WT) so the name under
         it keeps every stroke on a one cell trace */
      var sc = R.screen, c = onWall(TEX[o.tex], p[0] - sc.x0, p[1] - sc.y0);
      if (Math.floor(p[0] - sc.x0) % 27 === 26) return M('#0b0a12', {});      /* the seam between the two panels */
      return M(c || mix(darken(oc, 0.55), '#05070d', (p[1] - sc.y0) / (sc.y1 - sc.y0) * 0.5), { e: 1 });
    }; })() : (function(k){ return function(p){
      var v = (p[1] - top) / (-2.6 * F - top), u = p[0] - (x0 + k * (sw + gap));
      var bar = k % 2 ? (u > 3 && u < sw - 3 && Math.abs(v - 0.7) < 0.2 && (u - 3) / (sw - 6) < 0.35 + hashI(k, 1, 3) * 0.6) : (v > 0.25 && v < 0.85 && Math.abs(u - sw / 2) < 2 + Math.floor((v - 0.25) * 10) % 3 * 3);
      var grid = Math.floor(u) % 6 === 0 || Math.floor(v * 30) % 6 === 0;
      return M(bar ? lighten(oc, 0.35) : grid ? mix('#120c26', oc, 0.45) : mix('#0d0a1c', oc, 0.28), { e: 1 });
    }; })(i));
    b.panel = i;
  }
  R.screen = { x0: x0 + 2 * (sw + gap), x1: x0 + 3 * (sw + gap) + sw, y0: top, y1: -2.6 * F, z: -R.D + 5 };
  /* the show's name on a fascia over the video wall, lit in its colour */
  var show = textTex(String(o.outlet || '').toUpperCase().slice(0, 18), '#ffffff', 1, { sh: darken(oc, 0.6) });
  var fy0 = -9.8 * F, fy1 = top - 5, fmid = (R.screen.x0 + R.screen.x1) / 2, ftx = fmid - show.w * WT / 2;
  R.fascia = { x0: x0 - 4, x1: R.R, y0: fy0, y1: fy1, words: o.outlet ? [String(o.outlet).toUpperCase()] : [] };
  R.box(x0 - 4, fy0, -R.D, R.R, fy1, -R.D + 4, function(p, n){
    if (n[2] < 0.5) return M('#0b0a12', {});
    var v = p[1] - fy0, Hh = fy1 - fy0;
    if (v < 1.2 || v > Hh - 1.6) return M(oc, { e: 1 });
    var c = o.outlet ? onWall(show, p[0] - ftx, v - (Hh - show.h * WT) / 2) : null;
    if (c) return M(c, { e: 1 });
    return M(Math.floor((p[0] + 400) / 3) % 2 ? '#0d0b16' : '#100d1a', {});
  });
  /* the scores tower, left of the desk: six games, a chip for each club, a
     bar for the score, all in the network's colour */
  var gx0 = vx0 - 38, gx1 = vx0 - 8, gy0 = -8.8 * F, gy1 = -2.6 * F;
  R.box(gx0 - 2, gy0 - 2, -R.D, gx1 + 2, gy1 + 2, -R.D + 3, M('#0b0a12', {}));
  R.box(gx0, gy0, -R.D + 3, gx1, gy1, -R.D + 4.5, function(p){
    var u = p[0] - gx0, v = p[1] - gy0, row = Math.floor(v / 7.5), w = v - row * 7.5;
    if (row === 0) return M(w < 5.5 ? oc : '#120c26', { e: 1 });
    if (w > 5.6) return M('#0d0a1c', { e: 1 });
    if (u > 2 && u < 6) return M(row % 2 ? lighten(oc, 0.3) : mix('#ffffff', oc, 0.2), { e: 1 });
    if (u > 8 && u < 9 + hashI(row, 2, 5) * (gx1 - gx0 - 13)) return M(mix('#2a1d50', oc, 0.55), { e: 1 });
    return M(mix('#0d0a1c', oc, 0.12), { e: 1 });
  });
  /* the anchor desk: a long block with a rounded top, a lit band in front */
  var dz0 = -10, dz1 = 8, dx0 = -46, dx1 = 58, dh = 3.2 * F;
  R.round(sdBox([(dx0 + dx1) / 2, -dh / 2, (dz0 + dz1) / 2], [(dx1 - dx0) / 2, dh / 2, (dz1 - dz0) / 2], 1.6), [(dx0 + dx1) / 2, -dh / 2, (dz0 + dz1) / 2], Math.hypot((dx1 - dx0) / 2, dh / 2, (dz1 - dz0) / 2) + 2, function(p){
    var h = -p[1];
    if (p[2] > dz1 - 1.2) {
      if (Math.abs(h - dh * 0.55) < 2.4) return M(oc, { e: 1 });
      if (h > dh - 3) return M('#2e2a3c', { g: 1 });
      return M('#16141f', {});
    }
    if (h > dh - 1.4) return M('#d8d4e6', { g: 1 });
    return M('#1d1a28', {});
  }, { layer: 1 });
  R.desk = { y: -dh, z0: dz0, z1: dz1 };
  /* a low stool behind each anchor, glimpsed */
  /* the truss of lamps overhead, in the dark */
  for (var tx = -110; tx < 120; tx += 36) {
    /* far enough back that they hang above the fascia, never across its words */
    R.round(sdCyl([tx, -R.Hc + 6, -40], 2.4, 5, 0.6), [tx, -R.Hc + 3.5, -40], 6, function(p){ return p[1] > -R.Hc + 5 ? M('#fff3d6', { e: 1 }) : M('#2a2734', {}); }, { cast: false });
  }
  R.light(-18, 0, 52, 1.2, { beam: true, top: -R.Hc + 6 });
  R.light(28, 0, 52, 1.2, { beam: true, top: -R.Hc + 6 });
  R.light(6, -R.D + 2, 70, 0.7, {});
  R.spots = { host: [-18, 0, -20], host2: [30, 0, -20], main: [-18, 0, -20] };
  R.hosts = true;
  R.focus = [6, 0, -14]; R.fy = 0.9;
  return R;
};

/* THE PRESS ROOM. A step and repeat in the club's colours (its name, again
   and again), a draped table with a skirt, a cluster of microphones and a
   name card, water, and the cameras on their tripods in the front row. */
BUILD.press = function(o){
  var R = new Room('press'), c1 = safe(o.c1, '#c8102e'), c2 = safe(o.c2, '#ffffff'), F = FT;
  R.D = 46; R.R = 92; R.Hc = 12 * F; R.amb = -0.2; R.bg = '#07080e';
  R.floor = function(p){ var t = hashI(Math.floor(p[0] / 2), Math.floor(p[2] / 2), 5); return M(t > 0.9 ? '#2a2c38' : '#232530', {}); };
  /* THE STEP AND REPEAT (B18). It was the whole wall, floor to ceiling, one
     word over and over at one cell a stroke: LOCKER ROOM when there was no
     club, and MFGIC on a desktop. Now it is a backdrop on its own frame, the
     way a real one stands: the club's crest and name, staggered with two of
     the game's own sponsors (puns, in the game's font, never a real mark),
     a band of the second colour along the top. */
  var name = String(o.nick || '').toUpperCase().slice(0, 12);
  var SPONSORS = ['GATORGAID', 'KIYA MOTORS', 'BOZE', 'SUBWAYE', 'DOORDISH', 'CROX', 'PELOATHON'];
  var sk = hashI(name.length, name.charCodeAt(0) || 7, 3), s1 = Math.floor(sk * SPONSORS.length), s2 = (s1 + 2 + Math.floor(sk * 31) % 3) % SPONSORS.length;
  var bg = wallOf(c1), ink = '#f4f1ea', spInk = lighten(c1, lum(c1) > 0.5 ? 0.15 : 0.5), crestC = lum(c2) > 0.25 ? c2 : lighten(c1, 0.6);
  var shd = { sh: darken(c1, 0.75) };
  /* the crest: a ball in the second colour, seamed in the first. No club's
     real mark: the same ball for everyone, in their colours. */
  var crest = { w: 9, h: 9, at: function(x, y){
    var dx = x - 4, dy = y - 4, r = Math.hypot(dx, dy);
    if (r > 4.4) return null;
    var seam = dx === 0 || dy === 0 || Math.abs(Math.hypot(dx - 4.5, dy) - 3.2) < 0.55 || Math.abs(Math.hypot(dx + 4.5, dy) - 3.2) < 0.55;
    return seam ? darken(c1, 0.25) : r > 3.6 ? darken(crestC, 0.25) : crestC;
  } };
  function strip(items){
    var parts = [], w = 0;
    items.forEach(function(it){ parts.push({ x: w, t: it.t, dy: it.dy }); w += it.t.w + it.gap; });
    return { w: w, h: 13, at: function(x, y){
      x = ((x % w) + w) % w;
      for (var i = 0; i < parts.length; i++) { var q = parts[i], u = x - q.x, v = y - q.dy; if (u >= 0 && u < q.t.w && v >= 0 && v < q.t.h) return q.t.at(u, v); }
      return null;
    } };
  }
  var nickT = name ? textTex(name, ink, 1, shd) : null;
  var spA = textTex(SPONSORS[s1], spInk, 1, shd), spB = textTex(SPONSORS[s2], spInk, 1, shd);
  var club = name ? [{ t: crest, dy: 2, gap: 3 }, { t: nickT, dy: 3, gap: 15 }] : [{ t: crest, dy: 2, gap: 15 }];
  var rowA = strip(club.concat([{ t: spA, dy: 3, gap: 15 }])), rowB = strip([{ t: spB, dy: 3, gap: 15 }].concat(club));
  R.words = (name ? [name] : []).concat([SPONSORS[s1], SPONSORS[s2]]);
  var bx0 = -82, bx1 = 82, bh = 10.2 * F, band = 4;
  R.backdrop = { x0: bx0, x1: bx1, h: bh };
  R.back = function(p){
    var h = -p[1], x = p[0];
    if (h > R.Hc) return M('#07080e', { b: -1 });
    /* acoustic panels behind the backdrop, in the dark */
    var pnl = Math.floor((x + 400) / 16), seam = ((x + 400) % 16) < 0.8 || (h % 24) < 0.8;
    return M(seam ? '#0f1118' : pnl % 2 ? '#15171f' : '#13151d', {});
  };
  /* the backdrop: a panel on its own frame, a hand's width off the wall */
  R.box(bx0 - 1.5, -bh - 1.5, -R.D + 1, bx1 + 1.5, 0, -R.D + 2.5, M('#2a2e38', { g: 1 }));
  R.box(bx0, -bh, -R.D + 2.5, bx1, -1.5, -R.D + 3.2, function(p, n){
    if (n[2] < 0.5) return M(darken(c1, 0.3), {});
    var x = p[0] - bx0, v = p[1] + bh;
    if (v < band * WT) return M(v < 0.9 ? lighten(c2, 0.2) : c2, { b: 0.2 });
    var vv = v - band * WT, row = Math.floor(vv / (13 * WT)), sx = (x + (row % 2) * 31 + row * 7) / WT, sy = (vv - row * 13 * WT) / WT;
    var c = (row % 2 ? rowB : rowA).at(Math.floor(sx), Math.floor(sy));
    return M(c || (row % 2 ? bg : darken(bg, 0.06)), { b: c ? 0.35 : 0 });
  });
  /* the right wall is a curtain, pleated */
  R.right = function(p){ var h = -p[1]; if (h > R.Hc) return M('#07080e', { b: -1 }); var pl = Math.floor((p[2] + 400) / 2.5) % 3; return M(pl === 0 ? '#1b1e29' : pl === 1 ? '#171923' : '#13151e', {}); };
  /* two soft boxes on stands, either side, lighting the man at the table */
  [[-74, -24, 1], [76, -30, -1]].forEach(function(sb){
    var lx = sb[0], lz = sb[1], ly = 7.2 * F;
    R.box(lx - 6, -ly - 8, lz - 2, lx + 6, -ly, lz + 2, function(p, n){ return n[2] > 0.5 ? M('#fff3dc', { e: 1 }) : M('#22252e', {}); }, { cast: false });
    R.round(sdCap([lx, 0, lz], [lx, -ly, lz], 0.6), [lx, -ly / 2, lz], ly / 2 + 2, M('#2c2f38', { g: 1 }), { cast: false });
    [[-5, -3], [5, -3], [0, 5]].forEach(function(l){ R.round(sdCap([lx, -10, lz], [lx + l[0], 0, lz + l[1]], 0.5), [lx + l[0] / 2, -5, lz + l[1] / 2], 9, M('#2c2f38', {}), { cast: false }); });
  });
  /* the table, with a skirt to the floor in the club colour */
  var tz0 = -6, tz1 = 10, tx0 = -52, tx1 = 52, th = 3.6 * F;
  R.box(tx0, -th, tz0, tx1, -th + 2.2, tz1, M('#f2efe7', {}), { layer: 2 });
  R.box(tx0 + 1, -th + 2.2, tz1 - 1.5, tx1 - 1, 0, tz1, function(p){ var pl = Math.floor((p[0] + 400) / 3) % 2; return M(pl ? c1 : darken(c1, 0.12), {}); }, { layer: 2 });
  /* the name card */
  R.box(-8, -th - 6, tz1 - 4, 8, -th, tz1 - 3, M('#f7f5ef', {}), { layer: 2, cast: false });
  /* the microphones: a cluster, each a stalk and a head with a flag */
  var mics = [[-7, 4], [-2, 2], [3, 3], [8, 5], [1, 6]];
  mics.forEach(function(m, n){
    var mx = m[0], mz = m[1] + 0, mh = th + 10 + n % 3 * 2;
    R.round(sdCap([mx, -th, mz], [mx - 1.5, -mh, mz - 4], 0.7), [mx, -th - 7, mz - 2], 9, M('#2a2e38', { g: 1 }), { layer: 2, cast: false });
    R.round(sdSph([mx - 1.5, -mh - 1.4, mz - 4], 1.8), [mx - 1.5, -mh - 1.4, mz - 4], 2.2, M('#3a3f4b', { g: 1 }), { layer: 2 });
    R.box(mx - 3.8, -mh + 1, mz - 5.2, mx + 0.8, -mh + 4, mz - 2.8, M([c1, '#f2efe7', '#1d2440', c2][n % 4], {}), { layer: 2, cast: false });
  });
  /* water bottles */
  [[-30, 2], [-26, 4], [28, 3]].forEach(function(w){ R.round(sdCyl([w[0], -th, w[1]], 1.8, 9, 0.6), [w[0], -th - 4.5, w[1]], 6, function(p){ return -p[1] > th + 6.5 ? M('#e9edf5', {}) : M('#9cc7e8', { g: 1 }); }, { layer: 2 }); });
  /* cameras in the front row, on tripods */
  [[-62, 34], [54, 38]].forEach(function(cm){
    var cx = cm[0], cz = cm[1], ch = 5.6 * F;
    R.box(cx - 6, -ch - 7, cz - 4, cx + 6, -ch, cz + 5, M('#1d2028', {}), { layer: 2 });
    R.round(sdCyl([cx + 7, -ch - 2, cz], 2.6, 3, 0.4), [cx + 7, -ch - 3.5, cz], 4, M('#0e1016', { g: 1 }), { layer: 2 });
    [[-6, -5], [6, -5], [0, 7]].forEach(function(l){ R.round(sdCap([cx, -ch, cz], [cx + l[0], 0, cz + l[1]], 0.55), [cx + l[0] / 2, -ch / 2, cz + l[1] / 2], ch / 2 + 3, M('#2c2f38', {}), { layer: 2 }); });
  });
  R.light(0, -4, 44, 1.1, { beam: true });
  R.light(-60, -30, 50, 0.35, {});
  R.light(-40, -18, 34, 0.35, {}); R.light(42, -20, 34, 0.35, {});
  R.spots = { main: [0, 0, -16], host: [-30, 0, -16] };
  R.focus = [0, 0, -4]; R.fy = 0.9;
  return R;
};

/* DRAFT NIGHT. A theatre stage: the stage floor raised and lit, a giant
   screen behind in the club's colours with the pick on it, the podium with
   the league's mark, steps down to the floor, and the families at their
   tables below, in the dark. */
BUILD.draft = function(o){
  var R = new Room('draft'), c1 = safe(o.c1, '#1d2440'), c2 = safe(o.c2, '#c9ccd6'), F = FT;
  R.D = 60; R.R = 150; R.Hc = 18 * F; R.amb = -0.5; R.bg = '#040713';
  var SH = 1.8 * F;   /* the stage is this high */
  R.stageH = SH;
  R.floor = function(p){ var t = hashI(Math.floor(p[0] / 3), Math.floor(p[2] / 3), 9); return M(t > 0.86 ? '#141a2e' : '#10152a', {}); };
  R.back = function(p){ var h = -p[1]; if (h > R.Hc) return M('#040713', { b: -1 }); var c = Math.floor((p[0] + 400) / 10) % 2; return M(c ? '#0c1226' : '#0e1530', {}); };
  R.right = function(p){ var h = -p[1]; return M(h > R.Hc ? '#040713' : '#0b1022', { b: h > R.Hc ? -1 : 0 }); };
  /* the stage */
  R.box(-200, -SH, -R.D, 150, 0, 12, function(p, n){
    if (n[1] < -0.5) { var pl = Math.floor((p[2] + 400) / 6) % 2; return M(pl ? '#1b2442' : '#19213d', { g: 1, rf: 0.25 }); }
    if (Math.abs(-p[1] - SH * 0.5) < 1.1) return M('#5d78c8', { e: 1 });
    return M('#0d1328', {});
  });
  /* the front edge light strip */
  /* the screen: a big LED wall, the pick on it */
  var sx0 = -30, sx1 = 98, sy0 = -14 * F, sy1 = -4.6 * F;
  R.box(sx0 - 4, sy0 - 4, -R.D, sx1 + 4, sy1 + 4, -R.D + 3, M('#05070d', {}));
  var big = textTex(o.board || 'DRAFT', '#ffffff', 2, { sh: darken(c1, 0.6) });
  /* the line under the board: the club, unless the board already says it
     (the pick is in and the wall reads MAGIC: once, not MAGIC over MAGIC) */
  var subW = String(o.nick || '').toUpperCase().slice(0, 14);
  if (subW && subW === String(o.board || '').toUpperCase()) subW = '';
  var sub = textTex(subW, lighten(c2, 0.1), 1, { sh: darken(c1, 0.6) });
  R.screenWords = [String(o.board || 'DRAFT'), subW].filter(Boolean);
  R.box(sx0, sy0, -R.D + 3, sx1, sy1, -R.D + 5, function(p){
    var u = p[0] - sx0, v = p[1] - sy0, W = sx1 - sx0, Hh = sy1 - sy0;
    var bx = Math.floor((W - big.w) / 2), by = Math.floor(Hh * 0.3 - big.h / 2);
    var c = big.at(Math.floor(u - bx), Math.floor(v - by));
    if (c && u - bx >= 0 && u - bx < big.w && v - by >= 0 && v - by < big.h) return M(c, { e: 1 });
    var sbx = Math.floor((W - sub.w * WT) / 2), sby = Math.floor(Hh * 0.68);
    var c2t = subW ? onWall(sub, u - sbx, v - sby) : null;
    if (c2t) return M(c2t, { e: 1 });
    var g = v / Hh, stripe = Math.floor((u + v * 0.6) / 6) % 2;
    var bg = mix(darken(c1, 0.15), darken(c1, 0.55), g);
    return M(stripe ? bg : mix(bg, c2, 0.08), { e: 1 });
  });
  /* two banners hanging either side of the screen */
  [-62, 130].forEach(function(bx2){ R.box(bx2 - 9, -15 * F, -R.D + 2, bx2 + 9, -6 * F, -R.D + 4, function(p){ var v = -p[1]; return M(Math.abs(v - 10.5 * F) < 2 ? c2 : c1, { e: 1, k: 0.15 }); }); });
  /* the podium, on the stage, to the right */
  var px = 34, pz = -18;
  R.round(sdBox([px, -SH - 2.2 * F, pz], [9, 2.2 * F, 6], 0.8), [px, -SH - 2.2 * F, pz], 22, function(p){
    var h = -p[1] - SH;
    if (h > 4.2 * F) return M('#2a3156', { g: 1 });
    if (p[2] > pz + 5.2) { var bu = p[0] - px, bv = h - 2.6 * F, br = Math.hypot(bu, bv); if (br < 5) { var seam = Math.abs(bu) < 0.5 || Math.abs(bv) < 0.5 || Math.abs(Math.hypot(bu - 5.5, bv) - 3.6) < 0.5 || Math.abs(Math.hypot(bu + 5.5, bv) - 3.6) < 0.5; return M(seam ? darken(c1, 0.3) : c2, { e: 1, k: 0.2 }); } }
    return M('#1a2445', {});
  }, { layer: 1 });
  R.round(sdCap([px + 3, -SH - 4.4 * F, pz + 2], [px + 1, -SH - 5.4 * F, pz + 5], 0.5), [px + 2, -SH - 4.9 * F, pz + 3.5], 6, M('#b8bec8', { g: 1 }), { layer: 1, cast: false });
  /* the tables on the floor, in front of the stage, in the dark */
  for (var tz = 40; tz < 130; tz += 30) for (var tx = -150; tx < 160; tx += 46) {
    var ox = tx + (tz / 26 % 2) * 20 + (hashI(tx, tz, 1) - 0.5) * 8;
    R.round(sdCyl([ox, -2.8 * F, tz], 10, 1.4, 0.4), [ox, -2.8 * F, tz], 11, M('#c9c6bc', { b: -0.6 }), { ao: false });
    R.round(sdCyl([ox, 0, tz], 7, 2.8 * F - 1.4, 0), [ox, -1.4 * F, tz], 13, M('#a8a498', { b: -0.8 }), { cast: false, ao: false });
    for (var ch = 0; ch < 4; ch++) {
      var a = ch * Math.PI / 2 + 0.6, cx = ox + Math.cos(a) * 14, cz = tz + Math.sin(a) * 9;
      R.round(sdCap([cx, -1, cz], [cx, -3.2 * F, cz], 2.4), [cx, -1.6 * F, cz], 16, M(['#1b2238', '#24304f', '#2e2a3d', darken(c1, 0.4)][(ch + tx) & 3], { b: -1.2 }), { cast: false, ao: false });
      R.round(sdSph([cx, -3.9 * F, cz], 1.7), [cx, -3.9 * F, cz], 2.4, M(['#6c4027', '#c88c60', '#8b5735', '#efc39f'][(ch * 3 + tz) & 3], { b: -1.1 }), { cast: false, ao: false });
    }
  }
  R.light(0, -18, 46, 1.5, { beam: true, top: -R.Hc });
  R.light(px, pz, 22, 1.0, { beam: true, top: -R.Hc });
  R.light(0, -R.D + 4, 80, 0.5, {});
  R.spots = { main: [-6, -SH, -16], host: [px - 2, -SH, pz - 8] };
  R.focus = [10, -SH, -12]; R.fy = 0.8;
  return R;
};

/* THE ARENA. The floor of a real game: maple with the lines and the lane in
   the home colour, the scorer's table along the far sideline, the stands
   rising behind it in tiers full of people, the ribbon board, and the
   scoreboard overhead. The level sets the size: a gym, a college, the
   league. */
BUILD.arena = function(o){
  var lv = o.kind || 'nba', R = new Room('arena:' + lv), c1 = safe(o.c1, '#c8102e'), c2 = safe(o.c2, '#ffffff'), F = FT;
  var hs = lv === 'hs';
  R.D = 52; R.R = 400; R.Hc = (hs ? 13 : 22) * F; R.amb = hs ? -0.15 : -0.45; R.bg = '#05070d';
  var stain = hs ? '#d9a463' : '#cf995a';
  R.floor = function(p){
    var x = p[0], z = p[2];
    var plank = Math.floor((x + 400) / 3.2), seg = Math.floor((z + plank * 7.3 + 400) / 26);
    var base = hashI(plank, seg, 3) > 0.5 ? stain : mix(stain, '#a26a34', 0.18);
    /* the lines: the sideline at the far side, the lane and the circle */
    var line = Math.abs(z - (-R.D + 18)) < 0.7 || Math.abs(Math.hypot(x - 70, (z - 8) * 1) - 30) < 0.7 || Math.abs(x - 70) < 0.7 && z > -R.D + 18;
    var lane = x > 92 && Math.abs(z - 8) < 26;
    if (line) return M('#f4efe2', { g: 1 });
    if (lane) return M(mix(c1, stain, 0.25), { g: 1, rf: 0.2 });
    var logo = Math.hypot(x - 70, z - 8) < 13;
    if (logo) return M(mix(c2, stain, 0.35), { g: 1, rf: 0.2 });
    return M(base, { g: 1, rf: hs ? 0.12 : 0.22 });
  };
  var shirts = hs ? [c1, c2, '#3b3b46', '#20304f', '#6a5a4a'] : [c1, c1, c2, '#1d2440', '#3b3b46', '#f2f2f0', darken(c1, 0.3)];
  var skins = ['#4b2c19', '#6c4027', '#8b5735', '#aa6f45', '#c88c60', '#dfa77d', '#efc39f'];
  /* the stands: tiers rising from the back of the floor. A face of a tier is
     a row of seated people, drawn in the material. */
  var tiers = hs ? 6 : 12, td = 9, thh = hs ? 6 : 7.5, base = -R.D;
  function crowd(p, n, k){
    var seatC = hs ? '#a87a46' : '#151a2a';
    if (n[1] < -0.5) return M(hs ? '#b98a54' : '#1c2234', {});        /* a tread */
    var sw = 4.6, u = p[0] + 400 + (k % 2) * sw * 0.5, v = -p[1] - 2 - k * thh;   /* within the riser face, 0 at its foot */
    var seat = Math.floor(u / sw), s = hashI(seat, k, 11), fill = hs ? 0.45 : 0.94;
    if (s > fill) return M(seatC, { b: -0.3 });
    var lx = u - seat * sw - sw / 2, up = hashI(seat, k, 19) < (o.loud ? 0.24 : 0.07);
    var sit = (hashI(seat, k, 37) - 0.5) * 0.8;
    var shirt = shirts[Math.floor(hashI(seat, k, 23) * shirts.length)], skin = skins[Math.floor(hashI(seat, k, 29) * skins.length)];
    var hair = ['#1a120c', '#2a1a10', '#3b2a1a', '#6b4a2a', '#c9a25a', '#141414'][Math.floor(hashI(seat, k, 41) * 6)];
    /* the head: a round blob, hair on top */
    var hy = 5.3 + sit, hd = Math.hypot(lx / 1.15, (v - hy) / 1.25);
    if (hd < 1) return M(v > hy + 0.45 ? hair : skin, {});
    /* raised arms, either side of the head */
    if (up && Math.abs(Math.abs(lx) - 1.9) < 0.45 && v > 3.6 + sit && v < 7.2 + sit) return M(skin, {});
    /* shoulders and chest, rounded at the top corners */
    var top = 4.2 + sit - Math.max(0, Math.abs(lx) - 1.1) * 0.8;
    if (Math.abs(lx) < 1.95 && v < top && v > 0.6) return M(v > top - 0.6 ? lighten(shirt, 0.08) : shirt, {});
    if (hashI(seat, k, 31) < 0.02 && Math.abs(lx - 1.4) < 0.4 && Math.abs(v - 4.4) < 0.5) return M('#fffbe8', { e: 1 });
    return M(seatC, { b: -0.5 });
  }
  for (var k = 0; k < tiers; k++) {
    var zf = base - k * td;
    (function(kk){ R.box(-400, -(kk + 1) * thh - 2, zf - td, 400, -kk * thh - 2, zf, function(p, n){ return crowd(p, n, kk); }, { cast: false }); })(k);
  }
  R.D = 52 + tiers * td;
  /* the ribbon board along the front of the stands */
  R.box(-400, -7, -52 + 0.5, 400, 0, -52 + 2.2, function(p){ var u = Math.floor((p[0] + 400) / 40) % 4; var cs = [c1, '#f2f2f0', '#1d2440', c2]; var v = -p[1]; return M(Math.abs(v - 3.5) < 0.9 ? (u % 2 ? c1 : '#f2f2f0') : cs[u], { e: 1, k: 0.2 }); }, { cast: false });
  R.back = function(p){ var h = -p[1]; return M(h > R.Hc ? '#04050a' : '#0a0d18', { b: -0.8 }); };
  R.right = R.back;
  /* the scorer's table and chairs along the far sideline */
  R.box(-60, -3.4 * F, -50 + 5, 20, 0, -50 + 13, function(p, n){ if (n[1] < -0.5) return M('#20263a', {}); var v = -p[1]; return M(Math.abs(v - 1.8 * F) < 3 ? c1 : '#141a2c', { e: Math.abs(v - 1.8 * F) < 3 ? 1 : 0, k: 0.3 }); });
  /* the scoreboard: a box hung high, its faces lit, the board text */
  var bt = textTex(o.board || (hs ? 'HOME' : 'LIVE'), '#ffd36b', 1, { sh: '#3a2408' });
  var sbx = 30, sby = -(hs ? 11 : 17) * F, sbz = -24;
  R.box(sbx - 26, sby - 14, sbz - 10, sbx + 26, sby + 4, sbz + 10, function(p, n){
    if (n[2] > 0.5) {
      var u = p[0] - (sbx - 26), v = p[1] - (sby - 14);
      var bx = Math.floor((52 - bt.w) / 2), c = bt.at(Math.floor(u - bx), Math.floor(v - 5));
      if (c && u - bx >= 0 && u - bx < bt.w && v - 5 >= 0 && v - 5 < bt.h) return M(c, { e: 1 });
      var dg = Math.floor(u / 3) % 2 && v > 2 && v < 4;
      return M(dg ? '#ff4b3a' : '#0b0e1a', { e: dg ? 1 : 0 });
    }
    if (n[0] < -0.5) return M('#0b0e1a', {});
    return M('#11151f', {});
  }, { cast: false });
  if (!hs) R.round(sdCap([sbx, sby - 14, sbz], [sbx, -R.Hc - 30, sbz], 0.6), [sbx, sby - 60, sbz], 80, M('#2a2e38', {}), { cast: false });
  R.light(-10, -6, 60, hs ? 0.7 : 1.3, { beam: !hs });
  R.light(70, 8, 70, 0.8, {});
  R.spots = { main: [-6, 0, -12], host: [26, 0, -16] };
  R.focus = [6, 0, -10]; R.fy = 0.9;
  return R;
};

/* A HIGH SCHOOL GYM. Painted brick in the school colour, the wooden
   bleachers pulled out, state banners on the wall, the scoreboard, the
   fluorescent tubes. */
BUILD.gym = function(o){
  var R = BUILD.arena(Object.assign({}, o, { kind: 'hs' })), c1 = safe(o.c1, '#8d3b2c'), c2 = safe(o.c2, '#ffffff'), F = FT;
  R.key = 'gym';
  var brick = wallOf(c1, -0.1);
  R.back = function(p){
    var h = -p[1], x = p[0];
    if (h > R.Hc) return M('#0b0d12', { b: -1 });
    var row = Math.floor(h / 3), off = (row % 2) * 4, u = (x + 400 + off) % 8;
    if (h % 3 < 0.5 || u < 0.6) return M(darken(brick, 0.22), {});
    return M(hashI(Math.floor((x + 400 + off) / 8), row, 5) > 0.5 ? brick : mix(brick, '#000000', 0.06), {});
  };
  R.right = R.back;
  for (var b = 0; b < 4; b++) {
    var bx = -60 + b * 26;
    R.box(bx, -11 * F, -R.D + 0.5, bx + 14, -7.4 * F, -R.D + 1.6, (function(n){ return function(p){ var v = -p[1]; return M(Math.abs(v - 9 * F) < 1.6 ? (n % 2 ? c1 : c2) : (n % 2 ? c2 : c1), { b: 0.2 }); }; })(b), { cast: false });
  }
  for (var t = -80; t < 120; t += 46) R.box(t, -R.Hc + 1, -40, t + 24, -R.Hc + 3, -36, M('#eaf6f0', { e: 1 }), { cast: false });
  return R;
};

/* THE LOCKER ROOM. Open stalls of wood in a row, a jersey hung in each and a
   name plate above, a bench in front, the club's mark woven into the carpet,
   a whiteboard of plays on the side wall. */
BUILD.locker = function(o){
  var R = new Room('locker'), c1 = safe(o.c1, '#c8102e'), c2 = safe(o.c2, '#ffffff'), F = FT;
  R.D = 50; R.R = 84; R.Hc = 11 * F; R.amb = -0.15; R.bg = '#080a10';
  var carpet = darken(c1, lum(c1) > 0.5 ? 0.8 : 0.66);
  R.floor = function(p){
    var d = Math.hypot(p[0] - 4, (p[2] - 8) * 1.3);
    if (d < 34 && d > 31) return M(c2, {});
    if (d < 31 && d > 24) return M(mix(c1, carpet, 0.3), {});
    if (d < 4) return M(c2, {});
    var t = hashI(Math.floor(p[0] / 1.5), Math.floor(p[2] / 1.5), 2);
    return M(t > 0.8 ? mix(carpet, '#000', 0.08) : carpet, {});
  };
  R.back = function(p){ var h = -p[1]; if (h > R.Hc) return M('#080a10', { b: -1 }); return M(h > 9.4 * F ? '#1b2030' : '#232838', {}); };
  /* the whiteboard of plays on the right wall */
  var plays = function(p){
    var h = -p[1], z = p[2];
    if (h > R.Hc) return M('#080a10', { b: -1 });
    if (h > 4.2 * F && h < 8.6 * F && z > -40 && z < 6) {
      if (h < 4.2 * F + 1 || h > 8.6 * F - 1 || z < -39 || z > 5) return M('#9aa4b2', {});
      var X = Math.abs(((z + 400) % 11) - 5.5) < 0.6 && Math.abs(((h) % 13) - 6.5) < 2.6 && Math.floor((z + 400) / 11) % 2;
      var O = Math.abs(Math.hypot(((z + 400) % 11) - 5.5, (h % 13) - 6.5) - 2.4) < 0.5 && !(Math.floor((z + 400) / 11) % 2);
      var arrow = Math.abs((h - 6 * F) - (z + 20) * 0.5) < 0.5 && z > -30 && z < -6;
      return M(X ? '#1d2440' : O ? '#c8102e' : arrow ? '#1d2440' : '#f4f6f9', {});
    }
    return M('#232838', {});
  };
  R.right = plays;
  /* the stalls */
  var sw = 18, n = 0;
  for (var sx = -150; sx < 84; sx += sw, n++) {
    var x0 = sx, x1 = sx + sw - 1.5, wood = n % 2 ? '#7a5432' : '#6f4b2c';
    R.box(x0, -9.4 * F, -R.D, x1, 0, -R.D + 1.6, M(darken(wood, 0.45), {}));                  /* the back of the stall */
    R.box(x0, -9.4 * F, -R.D, x0 + 1.4, 0, -R.D + 12, M(wood, {}));                           /* its sides */
    R.box(x1 - 1.4, -9.4 * F, -R.D, x1, 0, -R.D + 12, M(wood, {}));
    R.box(x0, -9.4 * F, -R.D, x1, -8.6 * F, -R.D + 12, function(p, nn){ return nn[2] > 0.5 ? M('#d8cfb8', {}) : M('#8a6038', {}); });   /* the name plate shelf */
    R.box(x0, -1.3 * F, -R.D, x1, 0, -R.D + 12, function(p, nn){ return M(nn[1] < -0.5 ? '#8a6038' : '#5a3d22', {}); });               /* the seat */
    var jx = (x0 + x1) / 2, jz = -R.D + 5;
    R.round(sdBox([jx, -6 * F, jz], [4.4, 1.7 * F, 1.0], 0.9), [jx, -6 * F, jz], 16, (function(xc){ return function(p){
      var u = p[0] - xc, h = -p[1];
      if (Math.abs(u) < 1.4 && h > 7.3 * F) return M(darken(c1, 0.5), {});
      if (Math.abs(h - 7.2 * F) < 0.6 && Math.abs(u) > 1.4) return M(c2, {});
      if (Math.abs(u) < 1.8 && Math.abs(h - 6.1 * F) < 2.2) return M(c2, {});
      return M(c1, {});
    }; })(jx), {});
    R.round(sdCap([jx - 3, -7.7 * F, jz - 1], [jx + 3, -7.7 * F, jz - 1], 0.4), [jx, -7.7 * F, jz], 4, M('#9aa4b2', { g: 1 }), { cast: false });
    R.round(sdBox([jx, -1.3 * F - 1.6, -R.D + 7], [4, 1.6, 2.6], 1), [jx, -1.3 * F - 1.6, -R.D + 7], 6, M(n % 3 ? '#e9e6dc' : c1, {}), {});
  }
  /* the bench */
  R.box(-120, -2.2 * F, -R.D + 16, 84, -2.2 * F + 2.4, -R.D + 23, M('#a07448', { g: 1 }), {});
  for (var lx = -110; lx < 84; lx += 30) R.box(lx, -2.2 * F + 2.4, -R.D + 17, lx + 2.4, 0, -R.D + 22, M('#3a2a18', {}), {});
  R.light(-6, -12, 46, 0.9, { beam: true });
  R.light(40, -20, 40, 0.5, {});
  R.spots = { main: [-12, 0, -10], host: [24, 0, -14] };
  R.focus = [6, 0, -8]; R.fy = 0.9;
  return R;
};

/* THE GENERAL MANAGER'S OFFICE. Dark wood panels, three framed jerseys, a
   window on the practice court, a big desk with a lamp and a monitor, two
   chairs, a bookshelf on the side wall, a rug. */
BUILD.office = function(o){
  var R = new Room('office'), c1 = safe(o.c1, '#c8102e'), c2 = safe(o.c2, '#ffffff'), F = FT;
  R.D = 52; R.R = 82; R.Hc = 11 * F; R.amb = -0.2; R.bg = '#0c0905';
  R.floor = function(p){
    var rug = Math.abs(p[0] - 8) < 54 && Math.abs(p[2] + 4) < 30;
    if (rug) { var edge = Math.abs(p[0] - 8) > 50 || Math.abs(p[2] + 4) > 26; return M(edge ? '#7a1f22' : hashI(Math.floor(p[0] / 2), Math.floor(p[2] / 2), 1) > 0.85 ? '#5a2a30' : '#4a2228', {}); }
    var plank = Math.floor((p[0] + 400) / 5); return M(hashI(plank, Math.floor((p[2] + plank * 11) / 30), 4) > 0.5 ? '#3a2a1a' : '#33251a', { g: 1, rf: 0.1 });
  };
  R.back = function(p){
    var h = -p[1], x = p[0];
    if (h > R.Hc) return M('#0c0905', { b: -1 });
    /* the window on the practice court */
    if (x > 28 && x < 80 && h > 3.6 * F && h < 9.8 * F) {
      if (x < 29.5 || x > 78.5 || h < 3.6 * F + 1.5 || h > 9.8 * F - 1.5 || Math.abs(x - 54) < 0.8) return M('#1a1208', {});
      var g = h < 5.8 * F;
      if (g) { var line = Math.abs(h - 5 * F) < 0.6; return M(line ? '#f2efe7' : Math.abs(x - 54) < 8 ? mix(c1, '#c08a55', 0.4) : '#c08a55', { e: 1, k: 0.15 }); }
      return M(h > 8.6 * F ? '#2a2e3c' : '#3a4256', { e: 1, k: 0.2 });
    }
    if (h < 3.4 * F) return M(Math.floor((x + 400) / 9) % 2 ? '#3a2814' : '#352512', {});
    if (Math.abs(h - 3.4 * F) < 0.8) return M('#5a3e20', {});
    return M(Math.floor((x + 400) / 12) % 2 ? '#2e2012' : '#2a1d10', {});
  };
  R.right = function(p){
    var h = -p[1], z = p[2];
    if (h > R.Hc) return M('#0c0905', { b: -1 });
    return M(Math.floor((z + 400) / 12) % 2 ? '#2e2012' : '#2a1d10', {});
  };
  /* the framed jerseys */
  [-70, -42, -14].forEach(function(fx){
    R.box(fx - 9, -9.6 * F, -R.D, fx + 9, -5.4 * F, -R.D + 1.6, function(p){
      var u = p[0] - fx, h = -p[1];
      if (Math.abs(u) > 7.6 || h > 9.6 * F - 1.4 || h < 5.4 * F + 1.4) return M('#c9a23a', { g: 1 });
      if (Math.abs(u) < 5 && h > 6 * F && h < 9 * F) {
        if (Math.abs(u) < 1.4 && h > 8.4 * F) return M('#14100a', {});
        if (Math.abs(h - 8 * F) < 0.6) return M(c2, {});
        if (Math.abs(u) < 1.6 && Math.abs(h - 7.2 * F) < 2) return M(c2, {});
        return M(c1, {});
      }
      return M('#14100a', {});
    }, { cast: false });
  });
  /* the bookshelf on the right wall */
  R.box(R.R - 12, -8.6 * F, -44, R.R, 0, -8, function(p, n){
    if (n[0] < -0.5) {
      var h = -p[1], sh = Math.floor(h / (1.7 * F));
      if (h % (1.7 * F) < 1.2) return M('#5a3e20', {});
      var bk = Math.floor((p[2] + 400) / 2.4); return M(['#8a2a2a', '#1d3a5a', '#c9a23a', '#2a4a2a', '#5a3a6a', '#d8cfb8'][Math.floor(hashI(bk, sh, 3) * 6)], {});
    }
    return M('#3a2814', {});
  });
  /* the desk */
  var dx0 = 2, dx1 = 74, dz0 = -26, dz1 = -6, dh = 3.4 * F;
  R.box(dx0, -dh, dz0, dx1, -dh + 2.2, dz1, M('#6b4529', { g: 1 }), { layer: 1 });
  R.box(dx0 + 1, -dh + 2.2, dz1 - 2, dx1 - 1, 0, dz1, function(p){ return M(Math.floor((p[0] + 400) / 6) % 2 ? '#4a2f1c' : '#44291a', {}); }, { layer: 1 });
  R.box(dx0 + 1, -dh + 2.2, dz0, dx0 + 3, 0, dz1, M('#3a2414', {}), { layer: 1 });
  /* the lamp, the monitor, papers */
  R.round(sdCyl([dx0 + 8, -dh, dz0 + 8], 2.2, 1, 0.3), [dx0 + 8, -dh - 0.5, dz0 + 8], 3, M('#c9a23a', { g: 1 }), { layer: 1 });
  R.round(sdCap([dx0 + 8, -dh, dz0 + 8], [dx0 + 8, -dh - 11, dz0 + 8], 0.5), [dx0 + 8, -dh - 5.5, dz0 + 8], 7, M('#c9a23a', { g: 1 }), { layer: 1, cast: false });
  R.round(sdCyl([dx0 + 8, -dh - 11, dz0 + 8], 4.2, 4.5, 1), [dx0 + 8, -dh - 13, dz0 + 8], 6, M('#2a5a3a', { g: 1 }), { layer: 1 });
  R.box(dx1 - 22, -dh - 13, dz0 + 4, dx1 - 6, -dh - 3, dz0 + 6, function(p, n){ return n[2] > 0.5 ? M(mix(c1, '#0b0e1a', 0.35), { e: 1 }) : M('#0b0e1a', {}); }, { layer: 1 });
  R.box(dx1 - 15, -dh - 3, dz0 + 4.5, dx1 - 13, -dh, dz0 + 5.5, M('#2a2e38', {}), { layer: 1, cast: false });
  R.box(dx0 + 24, -dh - 0.5, dz0 + 10, dx0 + 34, -dh, dz0 + 16, M('#f2efe7', {}), { layer: 1, cast: false });
  /* the GM's chair behind the desk */
  R.round(sdBox([38, -6.4 * F, -38], [9, 3 * F, 2.4], 2), [38, -6.4 * F, -38], 28, M('#1a1410', { g: 1 }), {});
  R.light(30, -18, 50, 0.9, { beam: true });
  R.light(dx0 + 8, dz0 + 8, 26, 0.6, {});
  R.spots = { main: [-22, 0, 2], host: [38, 0, -32] };
  R.focus = [12, 0, -10]; R.fy = 0.9;
  return R;
};

/* HOME, LATE. A living room with the lights off: a window on the city, a
   couch, a floor lamp on low, a coffee table with a phone lighting up the
   ceiling, a TV on the side wall showing a game, a plant. Nothing here wears
   a club's colours, because it is not the club's. */
BUILD.home = function(o){
  var R = new Room('home'), F = FT;
  R.D = 46; R.R = 80; R.Hc = 10 * F; R.amb = -0.55; R.bg = '#0a0910';
  R.floor = function(p){
    var rug = Math.abs(p[0] - 4) < 44 && Math.abs(p[2] - 2) < 22;
    if (rug) return M(hashI(Math.floor(p[0] / 2), Math.floor(p[2] / 2), 7) > 0.8 ? '#4a3a4c' : '#3a2c3c', {});
    var plank = Math.floor((p[0] + 400) / 6); return M(hashI(plank, Math.floor((p[2] + plank * 9) / 34), 2) > 0.5 ? '#2a1f1a' : '#251b16', { g: 1, rf: 0.12 });
  };
  R.back = function(p){
    var h = -p[1], x = p[0];
    if (h > R.Hc) return M('#0a0910', { b: -1 });
    if (x > -20 && x < 44 && h > 3.6 * F && h < 9 * F) {
      if (x < -19 || x > 43 || h < 3.6 * F + 1 || h > 9 * F - 1 || Math.abs(x - 12) < 0.6 || Math.abs(h - 6.3 * F) < 0.5) return M('#2b2433', {});
      var tw = Math.floor((x + 400) / 5), top = 3.6 * F + 6 + hashI(tw, 1, 3) * 26;
      if (h > top) { var moon = Math.hypot(x - 32, h - 8 * F) < 3; return M(moon ? '#e8ecf6' : '#0e1428', { e: 1 }); }
      var lit = hashI(Math.floor((x + 400) / 1.6), Math.floor(h / 2), tw) > 0.7;
      return M(lit ? '#ffd98a' : '#141c33', { e: 1 });
    }
    return M(Math.floor((x + 400) / 5) % 2 ? '#1b1824' : '#19162a', {});
  };
  /* the TV on the side wall */
  R.right = function(p){
    var h = -p[1], z = p[2];
    if (h > R.Hc) return M('#0a0910', { b: -1 });
    return M('#191622', {});
  };
  var tc1 = safe(o.c1, '#1d6fd1');
  R.box(R.R - 2, -7.6 * F, -30, R.R, -3.6 * F, 2, function(p, n){
    if (n[0] < -0.5) { var h = -p[1], z = p[2]; if (h < 3.6 * F + 1 || h > 7.6 * F - 1 || z < -29 || z > 1) return M('#0b0b10', {});
      var court = h < 5 * F; return M(court ? (Math.abs(z + 14) < 0.6 ? '#f2efe7' : '#b98a54') : mix(tc1, '#05070d', 0.5), { e: 1 }); }
    return M('#0b0b10', {});
  }, { cast: false });
  /* the couch, its back to the window wall */
  var cx0 = -64, cx1 = 6, cz = -30;
  R.round(sdBox([(cx0 + cx1) / 2, -1.5 * F, cz], [(cx1 - cx0) / 2, 1.5 * F, 9], 2), [(cx0 + cx1) / 2, -1.5 * F, cz], 40, M('#3d4a6b', {}), {});
  R.round(sdBox([(cx0 + cx1) / 2, -3.8 * F, cz - 7], [(cx1 - cx0) / 2, 1.6 * F, 3], 2), [(cx0 + cx1) / 2, -3.8 * F, cz - 7], 40, M('#34405e', {}), {});
  [cx0 - 2, cx1 + 2].forEach(function(ax){ R.round(sdBox([ax, -2.4 * F, cz], [3, 2.4 * F, 9], 1.6), [ax, -2.4 * F, cz], 22, M('#34405e', {}), {}); });
  for (var c = 0; c < 3; c++) { var ccx = cx0 + 12 + c * 23; R.round(sdBox([ccx, -3.1 * F, cz + 1], [10.5, 0.8 * F, 7.4], 2), [ccx, -3.1 * F, cz + 1], 15, M('#46557a', {}), {}); }
  /* the floor lamp */
  R.round(sdCap([-78, 0, -38], [-78, -8 * F, -38], 0.6), [-78, -4 * F, -38], 4 * F + 2, M('#2a2430', {}), {});
  R.round(sdCyl([-78, -7.4 * F, -38], 5, 6, 1), [-78, -7.4 * F - 3, -38], 8, M('#e8c890', { e: 1 }), { cast: false });
  /* the coffee table and the phone */
  var tx = 28, tz = 6;
  R.box(tx - 18, -1.9 * F, tz - 8, tx + 18, -1.9 * F + 2, tz + 8, M('#5a3d28', { g: 1 }), { layer: 2 });
  [[-16, -6], [16, -6], [-16, 6], [16, 6]].forEach(function(l){ R.box(tx + l[0] - 1, -1.9 * F + 2, tz + l[1] - 1, tx + l[0] + 1, 0, tz + l[1] + 1, M('#3a2818', {}), { layer: 2 }); });
  R.box(tx - 3, -1.9 * F - 0.8, tz - 2, tx + 3, -1.9 * F, tz + 4, function(p, n){ return n[1] < -0.5 ? M('#9fe0ff', { e: 1 }) : M('#0b0e1a', {}); }, { layer: 2, cast: false });
  /* a plant */
  R.round(sdCyl([66, 0, -32], 5, 8, 1), [66, -4, -32], 7, M('#7a4a2a', {}), {});
  R.round(sdSph([66, -15, -32], 8), [66, -15, -32], 9, function(p){ return M(hashI(Math.floor(p[0]), Math.floor(p[1]), 9) > 0.5 ? '#2a5a3a' : '#22482f', {}); }, {});
  R.light(-78, -38, 40, 1.0, {});
  R.light(tx, tz, 22, 0.9, { col: '#9fe0ff' });
  R.light(12, -40, 50, 0.5, {});
  R.spots = { main: [-8, 0, -6], host: [40, 0, -14] };
  R.focus = [4, 0, -8]; R.fy = 0.9;
  return R;
};

/* A HOTEL ON THE ROAD. The bed, a headboard, a nightstand lamp on low, the
   curtains half open on somebody else's city, the door with the hall light
   under it, a suitcase. */
BUILD.hotel = function(o){
  var R = new Room('hotel'), F = FT;
  R.D = 44; R.R = 76; R.Hc = 10 * F; R.amb = -0.5; R.bg = '#0b0a12';
  R.floor = function(p){ var t = hashI(Math.floor((p[0] + p[2]) / 3), Math.floor((p[0] - p[2]) / 3), 4); return M(t > 0.5 ? '#2b2633' : '#2e2938', {}); };
  R.back = function(p){
    var h = -p[1], x = p[0];
    if (h > R.Hc) return M('#0b0a12', { b: -1 });
    if (x > 10 && x < 52 && h > 3.4 * F && h < 9 * F) {
      var tw = Math.floor((x + 400) / 4), top = 3.4 * F + 4 + hashI(tw, 2, 5) * 24;
      if (h > top) return M('#101830', { e: 1 });
      var lit = hashI(Math.floor((x + 400) / 1.5), Math.floor(h / 2), tw) > 0.68;
      return M(lit ? '#ffe2a0' : '#18213a', { e: 1 });
    }
    /* curtains either side of the window */
    if ((x > 0 && x <= 10 || x >= 52 && x < 62) && h > 2.8 * F && h < 9.6 * F) return M(Math.floor(x * 1.3) % 2 ? '#6b3a3a' : '#53292a', {});
    return M(Math.floor((x + 400) / 3) % 2 ? '#1f1d28' : '#22202c', {});
  };
  R.right = function(p){
    var h = -p[1], z = p[2];
    if (h > R.Hc) return M('#0b0a12', { b: -1 });
    if (z > -36 && z < -14 && h < 7.6 * F) {
      if (h < 0.7) return M('#fff0c8', { e: 1 });
      if (z < -35 || z > -15 || h > 7.6 * F - 1) return M('#4a4252', {});
      if (Math.abs(z + 17.5) < 1 && Math.abs(h - 3.8 * F) < 1) return M('#c9a23a', { g: 1 });
      return M('#3a3242', {});
    }
    return M('#1f1d28', {});
  };
  /* the bed */
  var bx0 = -74, bx1 = -6, bz0 = -R.D, bz1 = -2;
  R.box(bx0, -4.6 * F, bz0, bx1, 0, bz0 + 3, M('#4a3a2a', {}), {});
  R.round(sdBox([(bx0 + bx1) / 2, -1.2 * F, (bz0 + bz1) / 2 + 1], [(bx1 - bx0) / 2, 1.2 * F, (bz1 - bz0) / 2 - 1], 1.2), [(bx0 + bx1) / 2, -1.2 * F, (bz0 + bz1) / 2], 42, M('#3a3242', {}), {});
  R.round(sdBox([(bx0 + bx1) / 2, -2.6 * F, (bz0 + bz1) / 2 + 3], [(bx1 - bx0) / 2 - 1, 0.5 * F, (bz1 - bz0) / 2 - 3], 2), [(bx0 + bx1) / 2, -2.6 * F, (bz0 + bz1) / 2], 42, function(p){ return M(p[2] > -14 ? '#5a6a92' : '#e8e4dc', {}); }, {});
  [-60, -22].forEach(function(px){ R.round(sdBox([px, -3.4 * F, bz0 + 8], [10, 0.7 * F, 4], 2.2), [px, -3.4 * F, bz0 + 8], 13, M('#f4f1ea', {}), {}); });
  /* the nightstand and lamp */
  R.box(2, -2.6 * F, -R.D, 16, 0, -R.D + 12, M('#3a2c22', {}), {});
  R.round(sdCyl([9, -2.6 * F, -R.D + 6], 1.6, 6, 0.4), [9, -2.6 * F - 3, -R.D + 6], 4, M('#3a3040', {}), {});
  R.round(sdCyl([9, -2.6 * F - 6, -R.D + 6], 4.4, 5, 1), [9, -2.6 * F - 8.5, -R.D + 6], 6, M('#e8c890', { e: 1 }), { cast: false });
  /* the suitcase */
  R.round(sdBox([50, -2.2 * F, 4], [8, 2.2 * F, 4], 1.2), [50, -2.2 * F, 4], 20, M('#2a3a5a', {}), {});
  R.light(9, -R.D + 8, 40, 1.0, {});
  R.light(30, -36, 50, 0.4, { col: '#9fb6ff' });
  R.spots = { main: [22, 0, -14], host: [50, 0, -20] };
  R.focus = [4, 0, -14]; R.fy = 0.9;
  return R;
};

/* THE HALL OF FAME. Marble underfoot, gold columns, bronze plaques down the
   wall, a red carpet to the stage, the words over the stage, one warm light. */
BUILD.hall = function(o){
  var R = new Room('hall'), F = FT;
  R.D = 56; R.R = 120; R.Hc = 16 * F; R.amb = -0.35; R.bg = '#0c0905';
  R.floor = function(p){
    var carpet = Math.abs(p[0] + 2) < 16;
    if (carpet) return M(Math.abs(p[0] + 2) > 14.6 ? '#e8b33c' : '#8a1c22', {});
    var u = Math.floor((p[0] + 400) / 12), v = Math.floor((p[2] + 400) / 12);
    var vein = hashI(Math.floor(p[0] / 2), Math.floor(p[2] / 2), 3) > 0.94;
    return M((u + v) % 2 ? (vein ? '#d8d2c4' : '#e9e4d8') : (vein ? '#2a2620' : '#1c1a16'), { g: 1, rf: 0.3 });
  };
  var words = textTex(o.board || 'HALL OF FAME', '#ffd166', 1, { sh: '#3a2408' });
  R.back = function(p){
    var h = -p[1], x = p[0];
    if (h > R.Hc) return M('#0c0905', { b: -1 });
    var wx = Math.floor(10 - words.w / 2), wy = 13.6 * F;
    if (x - wx >= 0 && x - wx < words.w && wy - h >= 0 && wy - h < words.h) { var c = words.at(Math.floor(x - wx), Math.floor(wy - h)); if (c) return M(c, { e: 1 }); }
    /* the plaques, rows of bronze between the columns */
    var col = Math.floor((x + 400) / 30), cx = (x + 400) % 30, row = Math.floor((h - 3 * F) / (2.6 * F)), rh = (h - 3 * F) % (2.6 * F);
    if (row >= 0 && row < 3 && cx > 7 && cx < 23 && rh > 3 && rh < 2.6 * F - 3 && Math.abs(x) > 24) {
      var face = (cx > 9 && cx < 21 && rh > 5 && rh < 2.6 * F - 5);
      return M(face ? (Math.abs(rh - 12) < 3.5 && Math.abs(cx - 15) < 3 ? '#7a5420' : '#c08a36') : '#6b4a1a', { g: 1 });
    }
    return M(Math.floor((x + 400) / 6) % 2 ? '#241b0f' : '#1d160c', {});
  };
  R.right = function(p){ var h = -p[1]; return M(h > R.Hc ? '#0c0905' : Math.floor((p[2] + 400) / 6) % 2 ? '#241b0f' : '#1d160c', { b: h > R.Hc ? -1 : 0 }); };
  /* the columns */
  for (var cx2 = -128; cx2 < 130; cx2 += 30) {
    if (Math.abs(cx2 + 8) < 20) continue;
    R.round(sdCyl([cx2 + 7, 0, -R.D + 4], 3.4, 12.5 * F, 0.6), [cx2 + 7, -6.2 * F, -R.D + 4], 6.4 * F, function(p){ var fl = Math.floor(Math.atan2(p[2] + R.D - 4, p[0] - Math.round(p[0] / 30) * 30) * 3); return M(fl % 2 ? '#a8761c' : '#c08a36', { g: 1 }); }, {});
  }
  /* the stage and the lectern */
  R.box(-60, -1.2 * F, -R.D, 60, 0, -R.D + 30, function(p, n){ return n[1] < -0.5 ? M('#2a2212', { g: 1 }) : M(Math.abs(-p[1] - 0.6 * F) < 0.8 ? '#e8b33c' : '#1d160c', {}); });
  R.round(sdBox([22, -1.2 * F - 2.3 * F, -R.D + 18], [7, 2.3 * F, 5], 0.8), [22, -3.5 * F, -R.D + 18], 18, function(p){ return -p[1] > 1.2 * F + 4.2 * F ? M('#c08a36', { g: 1 }) : M('#3a2a12', {}); }, { layer: 1 });
  R.light(-2, -R.D + 14, 44, 1.6, { beam: true });
  R.light(-2, 20, 40, 0.5, {});
  R.spots = { main: [-4, -1.2 * F, -R.D + 16], host: [22, -1.2 * F, -R.D + 10] };
  R.focus = [4, -1.2 * F, -R.D + 18]; R.fy = 0.82;
  return R;
};

var ROOM_OF = { studio: 'studio', press: 'press', draft: 'draft', arena: 'arena', gym: 'gym', locker: 'locker', office: 'office', home: 'home', hotel: 'hotel', hall: 'hall' };
var SPECS = {};
function build(kind, o){
  o = o || {};
  var key = kind + '|' + JSON.stringify(o);
  if (SPECS[key]) return SPECS[key];
  var f = BUILD[ROOM_OF[kind]]; if (!f) return null;
  var R = f(o);
  R.key = key;
  var n = 10;
  R.boxes.forEach(function(b){ b.id = n++; });
  R.rounds.forEach(function(s){ s.id = n++; });
  return (SPECS[key] = R);
}

// ─── framing ───────────────────────────────────────────────────────────────
/* The camera only moves sideways and up: where the focus point lands is a
   choice (the middle, and fy of the way down). A point of the world lands at
   ox + view x, oy + view y, in cells. */
function frame(R, cw, ch){
  var v = rot(R.focus);
  /* a tall phone has room above the people that is only ceiling, so the
     focus rides higher there and the floor in front gets the rows */
  var fy = ch > cw * 1.25 ? R.fy - Math.min(0.1, (ch / cw - 1.25) * 0.12) : R.fy;
  return { ox: cw * 0.5 - v[0], oy: ch * fy - v[1], cw: cw, ch: ch };
}
function project(cam, p){ var v = rot(p); return [cam.ox + v[0], cam.oy + v[1], v[2]]; }

// ─── tracing ───────────────────────────────────────────────────────────────
function slab(b, O, inv){
  var t1 = (b.a[0] - O[0]) * inv[0], t2 = (b.b[0] - O[0]) * inv[0], tmin = Math.min(t1, t2), tmax = Math.max(t1, t2), ax = 0;
  var u1 = (b.a[1] - O[1]) * inv[1], u2 = (b.b[1] - O[1]) * inv[1], umin = Math.min(u1, u2), umax = Math.max(u1, u2);
  if (umin > tmin) { tmin = umin; ax = 1; } if (umax < tmax) tmax = umax;
  var w1 = (b.a[2] - O[2]) * inv[2], w2 = (b.b[2] - O[2]) * inv[2], wmin = Math.min(w1, w2), wmax = Math.max(w1, w2);
  if (wmin > tmin) { tmin = wmin; ax = 2; } if (wmax < tmax) tmax = wmax;
  if (tmax < tmin || tmax < 0) return null;
  return [tmin, ax];
}
function prep(R, cam, res){
  var tile = 8, tw = Math.ceil(cam.cw / tile) + 1, th = Math.ceil(cam.ch / tile) + 1, bins = [];
  for (var i = 0; i < tw * th; i++) bins.push([]);
  function bin(o, x0, y0, x1, y1){
    var a = Math.max(0, Math.floor(x0 / tile)), b = Math.min(tw - 1, Math.floor(x1 / tile)), c = Math.max(0, Math.floor(y0 / tile)), d = Math.min(th - 1, Math.floor(y1 / tile));
    for (var y = c; y <= d; y++) for (var x = a; x <= b; x++) bins[y * tw + x].push(o);
  }
  R.boxes.forEach(function(b){
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (var k = 0; k < 8; k++) { var p = project(cam, [k & 1 ? b.b[0] : b.a[0], k & 2 ? b.b[1] : b.a[1], k & 4 ? b.b[2] : b.a[2]]); x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    b.sb = [x0, y0, x1, y1];
    if (x1 >= 0 && x0 <= cam.cw && y1 >= 0 && y0 <= cam.ch) bin(b, x0, y0, x1, y1);
  });
  R.rounds.forEach(function(s){
    var p = project(cam, s.c); s.vc = p;
    if (p[0] + s.r >= 0 && p[0] - s.r <= cam.cw && p[1] + s.r >= 0 && p[1] - s.r <= cam.ch) bin(s, p[0] - s.r, p[1] - s.r, p[0] + s.r, p[1] + s.r);
  });
  return { bins: bins, tw: tw, tile: tile };
}
var INV = [1 / DIR[0], 1 / DIR[1], 1 / DIR[2]];
/* the nearest thing a ray from (sx, sy) meets */
function cast(R, cam, P, sx, sy){
  var O = unrot([sx - cam.ox, sy - cam.oy, Z0]);
  var best = 1e9, hit = null;
  /* the floor, the back wall, the right wall */
  var s = -O[1] / DIR[1], p;
  if (s > 0) { p = [O[0] + DIR[0] * s, 0, O[2] + DIR[2] * s]; if (p[2] >= -R.D - 1e-6 && p[0] <= R.R + 1e-6) { best = s; hit = { k: 1, p: p, n: [0, -1, 0] }; } }
  s = (-R.D - O[2]) / DIR[2];
  if (s > 0 && s < best) { p = [O[0] + DIR[0] * s, O[1] + DIR[1] * s, -R.D]; if (p[1] <= 0 && p[0] <= R.R) { best = s; hit = { k: 2, p: p, n: [0, 0, 1] }; } }
  s = (R.R - O[0]) / DIR[0];
  if (s > 0 && s < best) { p = [R.R, O[1] + DIR[1] * s, O[2] + DIR[2] * s]; if (p[1] <= 0 && p[2] >= -R.D) { best = s; hit = { k: 3, p: p, n: [-1, 0, 0] }; } }
  var bl = P.bins[Math.floor(sy / P.tile) * P.tw + Math.floor(sx / P.tile)] || [];
  var vx = sx - cam.ox, vy = sy - cam.oy;
  for (var i = 0; i < bl.length; i++) {
    var o = bl[i];
    if (o.a) {
      if (sx < o.sb[0] || sx > o.sb[2] || sy < o.sb[1] || sy > o.sb[3]) continue;
      var r = slab(o, O, INV); if (!r || r[0] >= best || r[0] < 0) continue;
      best = r[0];
      var n = [0, 0, 0], ax = r[1]; n[ax] = INV[ax] > 0 ? -1 : 1;
      hit = { k: o.id, p: [O[0] + DIR[0] * best, O[1] + DIR[1] * best, O[2] + DIR[2] * best], n: n, o: o };
    } else {
      var dx = vx - (o.vc[0] - cam.ox), dy = vy - (o.vc[1] - cam.oy);
      if (dx * dx + dy * dy > o.r * o.r) continue;
      var s0 = Z0 - (o.vc[2] + o.r), s1 = Z0 - (o.vc[2] - o.r);
      if (s0 >= best) continue;
      var t = Math.max(0, s0);
      for (var k = 0; k < 64 && t < s1 && t < best; k++) {
        var q = [O[0] + DIR[0] * t, O[1] + DIR[1] * t, O[2] + DIR[2] * t], d = o.f(q);
        if (d < 0.03) {
          var e = 0.06, f = o.f;
          var nn = norm([f([q[0] + e, q[1], q[2]]) - f([q[0] - e, q[1], q[2]]), f([q[0], q[1] + e, q[2]]) - f([q[0], q[1] - e, q[2]]), f([q[0], q[1], q[2] + e]) - f([q[0], q[1], q[2] - e])]);
          best = t; hit = { k: o.id, p: q, n: nn, o: o }; break;
        }
        t += Math.max(d * 0.9, 0.04);
      }
    }
  }
  if (hit) hit.s = best;
  return hit;
}
/* is p in a shadow cast by the furniture? 0 lit, 1 shadowed */
function shadowAt(R, p, n){
  var O = [p[0] + n[0] * 0.25 + LW[0] * 0.2, p[1] + n[1] * 0.25 + LW[1] * 0.2, p[2] + n[2] * 0.25 + LW[2] * 0.2];
  var inv = [1 / LW[0], 1 / LW[1], 1 / LW[2]], soft = 1;
  for (var i = 0; i < R.boxes.length; i++) { var b = R.boxes[i]; if (!b.cast) continue; var r = slab(b, O, inv); if (r && r[0] > 0 && r[0] < 260) return 1; }
  for (var j = 0; j < R.rounds.length; j++) {
    var s = R.rounds[j]; if (!s.cast) continue;
    var cx = s.c[0] - O[0], cy = s.c[1] - O[1], cz = s.c[2] - O[2], tc = cx * LW[0] + cy * LW[1] + cz * LW[2];
    if (tc < -s.r) continue;
    var d2 = cx * cx + cy * cy + cz * cz - tc * tc; if (d2 > s.r * s.r) continue;
    var t = Math.max(0.1, tc - s.r), t1 = tc + s.r;
    for (var k = 0; k < 40 && t < t1; k++) {
      var d = s.f([O[0] + LW[0] * t, O[1] + LW[1] * t, O[2] + LW[2] * t]);
      if (d < 0.05) return 1;
      soft = Math.min(soft, 8 * d / t);
      t += Math.max(d * 0.9, 0.1);
    }
  }
  return soft < 1 ? (1 - soft) * 0.6 : 0;
}
/* how much the corners and the furniture close in on p: 0 open, 1 shut */
function aoAt(R, p, k){
  var occ = 0, A = 7;
  if (k === 1) { occ = Math.max(occ, 1 - (p[2] + R.D) / A, 1 - (R.R - p[0]) / A); }
  else if (k === 2 || k === 3) { occ = Math.max(occ, 1 - (-p[1]) / A); if (k === 2) occ = Math.max(occ, 1 - (R.R - p[0]) / A); else occ = Math.max(occ, 1 - (p[2] + R.D) / A); }
  for (var i = 0; i < R.boxes.length; i++) {
    var b = R.boxes[i];
    if (b.id === k) continue;
    var dx = Math.max(b.a[0] - p[0], 0, p[0] - b.b[0]), dy = Math.max(b.a[1] - p[1], 0, p[1] - b.b[1]), dz = Math.max(b.a[2] - p[2], 0, p[2] - b.b[2]);
    if (dx > A || dy > A || dz > A) continue;
    occ = Math.max(occ, 1 - Math.hypot(dx, dy, dz) / A);
  }
  for (var j = 0; j < R.rounds.length; j++) {
    var s = R.rounds[j];
    if (s.id === k || !s.ao) continue;
    if (Math.hypot(p[0] - s.c[0], p[1] - s.c[1], p[2] - s.c[2]) > s.r + A) continue;
    var d = s.f(p); if (d < A) occ = Math.max(occ, 1 - d / A);
  }
  occ = clamp01(occ);
  return occ * occ * 0.85;
}
/* THE WALLS NEVER END (the owner, on batch 4: "I don't want to see any empty
   space around the scenes"). Above a wall's top every room painted the flat
   dark of the void, and a phone's wide shot and every desktop shot had a
   band of it along the top. The walls run on instead, as part of the room:
   the lighting grid a studio, a press room, a draft stage, an arena or the
   Hall hangs its lamps from, or the upper wall of a room people live in,
   with a crown moulding and a sconce to each bay. rig marks it as drawn. */
function rigAt(R, p, k){
  var h = -p[1] - R.Hc, u = k === 2 ? p[0] : p[2], base = R.rigC || mix(R.bg, '#2a3046', 0.4);
  if (R.rig === 'wall') {
    if (h < 2.2) return M(mix(base, '#ffffff', 0.16), { rig: 1 });
    var bay = ((u + 400) % 40 + 40) % 40;
    if (Math.abs(bay - 20) < 1.4 && Math.abs(h - 13) < 1.8) return M('#ffe1a8', { e: 1, rig: 1 });
    if (Math.abs(bay - 20) < 2.6 && Math.abs(h - 12.4) < 3.4) return M(darken(base, 0.25), { rig: 1 });
    return M(bay < 0.8 ? darken(base, 0.3) : base, { rig: 1, b: -0.2 });
  }
  var hb = ((h % 20) + 20) % 20, ub = ((u + 400) % 26 + 26) % 26;
  if (hb < 1.6) return M('#2b3142', { rig: 1, g: 1 });
  if (ub < 1) return M('#1f2433', { rig: 1 });
  if (Math.abs(ub - 13) < 2 && Math.abs(hb - 5.2) < 1.2) return M('#fff0cf', { e: 1, rig: 1 });
  if (Math.abs(ub - 13) < 3 && hb > 1.6 && hb < 7.6) return M('#161a26', { rig: 1 });
  return M(base, { rig: 1, b: -0.5 });
}
function matOf(R, h){
  if ((h.k === 2 || h.k === 3) && -h.p[1] > R.Hc) return rigAt(R, h.p, h.k);
  if (h.k === 1) return typeof R.floor === 'function' ? R.floor(h.p) : R.floor;
  if (h.k === 2) return typeof R.back === 'function' ? R.back(h.p) : R.back;
  if (h.k === 3) return typeof R.right === 'function' ? R.right(h.p) : R.right;
  var m = h.o.m; return typeof m === 'function' ? m(h.p, h.n) : m;
}
/* what the glossy floor sees straight back up: the lit things only */
function reflectAt(R, P, cam, p){
  var D2 = [DIR[0], -DIR[1], DIR[2]], inv = [1 / D2[0], 1 / D2[1], 1 / D2[2]], O = [p[0], p[1] - 0.1, p[2]], best = 1e9, col = null;
  for (var i = 0; i < R.boxes.length; i++) {
    var b = R.boxes[i]; if (b.a[1] > -1) continue;
    var r = slab(b, O, inv); if (!r || r[0] <= 0 || r[0] >= best) continue;
    var q = [O[0] + D2[0] * r[0], O[1] + D2[1] * r[0], O[2] + D2[2] * r[0]], n = [0, 0, 0]; n[r[1]] = inv[r[1]] > 0 ? -1 : 1;
    var m = typeof b.m === 'function' ? b.m(q, n) : b.m;
    best = r[0]; col = m && m.e ? m.c : null;
  }
  if (!col) {
    var s = (-R.D - O[2]) / D2[2];
    if (s > 0 && s < best) { var q2 = [O[0] + D2[0] * s, O[1] + D2[1] * s, -R.D]; var m2 = typeof R.back === 'function' ? R.back(q2) : R.back; if (m2 && m2.e) { col = m2.c; best = s; } }
  }
  return col ? { c: col, d: best } : null;
}

/* Render the room into its fine pixel buffers. Slow parts run in slices: call
   step() until it says done (budget ms a call). */
function renderer(R, cw, ch, res, camIn){
  var cam = camIn ? { ox: camIn.ox, oy: camIn.oy, cw: cw, ch: ch } : frame(R, cw, ch), P = prep(R, cam, res), W = cw * res, H = ch * res;
  var tone = new Float32Array(W * H), ramp = new Array(W * H), id = new Int32Array(W * H), dep = new Float32Array(W * H), emis = new Uint8Array(W * H), extra = new Array(W * H), lay = new Uint8Array(W * H);
  /* what the room did not draw: a ray that met nothing, or a wall above its
     top (R.Hc) painted the flat dark of the void rather than as part of the
     room (m.rig). The checker reads it off the back canvas (_void). */
  var vd = new Uint8Array(W * H);
  var y = 0;
  var lights = R.lights.map(function(L){
    var a = project(cam, [L.x, L.top, L.z - 0]), b = project(cam, [L.x, 0, L.z]);
    return { L: L, sx0: a[0], sy0: a[1], sx1: b[0], sy1: b[1] };
  });
  function px(x, yy){
    var sx = (x + 0.5) / res, sy = (yy + 0.5) / res, i = yy * W + x;
    var h = cast(R, cam, P, sx, sy);
    if (!h) { id[i] = 0; ramp[i] = rampOf(R.void); tone[i] = 1; dep[i] = -1e9; vd[i] = 1; return; }
    var m = matOf(R, h) || { c: '#ff00ff' };
    if ((h.k === 2 || h.k === 3) && -h.p[1] > R.Hc && !m.rig) vd[i] = 1;
    id[i] = h.k; dep[i] = Z0 - h.s; lay[i] = h.o ? h.o.layer : 0;
    if (m.e) { emis[i] = 1; extra[i] = m.c; ramp[i] = rampOf(m.c); tone[i] = 2 + (m.k || 0) * 2; return; }
    var nv = rot(h.n), d = nv[0] * LV[0] + nv[1] * LV[1] + nv[2] * LV[2];
    var t = 1.05 + 2.4 * clamp01((d + 0.2) / 1.1) + (m.b || 0) + R.amb;
    var sh = shadowAt(R, h.p, h.n); t -= 1.25 * sh;
    t -= 1.3 * aoAt(R, h.p, h.k);
    for (var l = 0; l < R.lights.length; l++) {
      var L = R.lights[l], dx = h.p[0] - L.x, dz = h.p[2] - L.z, q = (dx * dx + dz * dz) / (L.r * L.r);
      if (q < 1) { var f = (1 - q) * (1 - q); if (h.k === 2 || h.k === 3 || h.p[1] < -2) f *= clamp01(1 - (-h.p[1]) / (L.r * 1.6)); t += L.a * f * (1 - sh * 0.6); }
    }
    if (m.g && d > 0.86) t += 0.9;
    if (m.rf) { var rf = reflectAt(R, P, cam, h.p); if (rf) extra[i] = { c: rf.c, a: m.rf * clamp01(1 - rf.d / 220) }; }
    ramp[i] = rampOf(m.c); tone[i] = t;
  }
  function finish(){
    /* the soft outline: a thing's own edge one step darker where it stands
       in front of something further back, as on the player */
    var out = new Float32Array(tone);
    for (var yy = 0; yy < H; yy++) for (var x = 0; x < W; x++) {
      var i = yy * W + x, k = id[i]; if (k < 1 || emis[i]) continue;
      var dn = 0;
      for (var a = 0; a < 4; a++) {
        var nx = x + (a === 0 ? 1 : a === 1 ? -1 : 0), ny = yy + (a === 2 ? 1 : a === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        var j = ny * W + nx;
        if (id[j] !== k && dep[j] < dep[i] - 1.5 * res / res) { dn = k >= 10 ? 1 : 0.7; break; }
        if (k < 10 && id[j] !== k && id[j] > 0 && id[j] < 10) dn = Math.max(dn, 0.8);
      }
      out[i] -= dn;
    }
    /* the light beams, in the haze, as a dither of one step up */
    var cv = [document.createElement('canvas'), document.createElement('canvas'), document.createElement('canvas')], ctx = [], img = [];
    for (var c = 0; c < 3; c++) { cv[c].width = W; cv[c].height = H; ctx[c] = cv[c].getContext('2d'); img[c] = ctx[c].createImageData(W, H); }
    var glow = document.createElement('canvas'), gw = Math.ceil(W / 4), gh = Math.ceil(H / 4); glow.width = gw; glow.height = gh;
    var gctx = glow.getContext('2d'), gimg = gctx.createImageData(gw, gh), gacc = new Float32Array(gw * gh * 4);
    for (var y2 = 0; y2 < H; y2++) for (var x2 = 0; x2 < W; x2++) {
      var i2 = y2 * W + x2, t = out[i2], cx = (x2 + 0.5) / res, cy = (y2 + 0.5) / res;
      if (!emis[i2]) for (var l = 0; l < lights.length; l++) {
        var LL = lights[l]; if (!LL.L.beam) continue;
        var v = (cy - LL.sy0) / (LL.sy1 - LL.sy0); if (v < 0 || v > 1) continue;
        var w = 2 + LL.L.r * 0.55 * v, bx = LL.sx0 + (LL.sx1 - LL.sx0) * v, u = Math.abs(cx - bx) / w;
        if (u < 1) t += (1 - u) * (0.25 + 0.55 * v) * 0.75;
      }
      var rp = ramp[i2], ti = Math.max(0, Math.min(4, Math.round(t + (bay(x2, y2) - 0.5) * 0.7)));
      var col = emis[i2] ? (t >= 3 ? rp[4] : t >= 2.5 ? rp[3] : rgb(extra[i2])) : rp[ti];
      if (!emis[i2] && extra[i2] && extra[i2].a) {
        var rc = rgb(extra[i2].c), a = extra[i2].a * (0.55 + 0.45 * bay(x2 * 3, y2));
        col = [col[0] + (rc[0] - col[0]) * a, col[1] + (rc[1] - col[1]) * a, col[2] + (rc[2] - col[2]) * a];
      }
      /* far up the walls, into the dark of the rig */
      var L2 = lay[i2], o4 = i2 * 4;
      var dst = img[0].data;
      dst[o4] = col[0]; dst[o4 + 1] = col[1]; dst[o4 + 2] = col[2]; dst[o4 + 3] = 255;
      if (L2 > 0 && id[i2] >= 10) { var d2 = img[L2].data; d2[o4] = col[0]; d2[o4 + 1] = col[1]; d2[o4 + 2] = col[2]; d2[o4 + 3] = 255; }
      if (emis[i2]) { var gi = (Math.floor(y2 / 4) * gw + Math.floor(x2 / 4)) * 4; gacc[gi] += col[0]; gacc[gi + 1] += col[1]; gacc[gi + 2] += col[2]; gacc[gi + 3] += 1; }
    }
    for (var g = 0; g < gw * gh; g++) { var n = gacc[g * 4 + 3]; if (!n) continue; var a2 = Math.min(1, n / 16); gimg.data[g * 4] = gacc[g * 4] / n; gimg.data[g * 4 + 1] = gacc[g * 4 + 1] / n; gimg.data[g * 4 + 2] = gacc[g * 4 + 2] / n; gimg.data[g * 4 + 3] = 255 * a2; }
    gctx.putImageData(gimg, 0, 0);
    for (var c2 = 0; c2 < 3; c2++) ctx[c2].putImageData(img[c2], 0, 0);
    cv[0]._void = vd; cv[0]._res = res;
    return { back: cv[0], l1: cv[1], l2: cv[2], glow: glow, cam: cam, res: res, cw: cw, ch: ch, W: W, H: H };
  }
  var done = null;
  return {
    cam: cam,
    step: function(budget){
      if (done) return done;
      var t0 = Date.now();
      while (y < H) { for (var x = 0; x < W; x++) px(x, y); y++; if (Date.now() - t0 > budget) return null; }
      return (done = finish());
    }
  };
}

var CACHE = {}, CKEYS = [];
/* Draw a room: cb(result) once it is done. Returns a cancel function. A small
   one (or a cached one) comes back at once. */
/* cam (optional) pins the camera: a canvas taller than the stage, with the
   focus where the caller wants it, so a stage that grows or shrinks (the
   caption under it changes height) slides the picture instead of tracing it
   again. An orthographic camera makes that exact. */
function draw(R, cw, ch, res, cb, camIn){
  var key = R.key + '@' + cw + 'x' + ch + 'x' + res + (camIn ? '@' + camIn.ox.toFixed(3) + ',' + camIn.oy.toFixed(3) : '');
  if (CACHE[key]) { cb(CACHE[key]); return function(){}; }
  var r = renderer(R, cw, ch, res, camIn), stop = false;
  function keep(out){ CACHE[key] = out; CKEYS.push(key); if (CKEYS.length > 10) delete CACHE[CKEYS.shift()]; }
  var first = r.step(cw * ch * res * res < 9000 ? 1e9 : 14);
  if (first) { keep(first); cb(first); return function(){}; }
  function go(){
    if (stop) return;
    var out = r.step(12);
    if (out) { keep(out); cb(out); return; }
    (window.requestAnimationFrame || setTimeout)(go);
  }
  (window.requestAnimationFrame || setTimeout)(go);
  return function(){ stop = true; };
}
/* a figure's shadow on the floor: a soft dithered ellipse, cast a little back
   and to the right, away from the top-left light, on the same fine grid */
var SHC = {};
function shadow(res){
  if (SHC[res]) return SHC[res];
  var w = 30 * res, h = 10 * res, cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  var c = cv.getContext('2d'), im = c.createImageData(w, h);
  for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
    var u = (x + 0.5) / res, v = (y + 0.5) / res;
    var core = Math.hypot((u - 13) / 8.5, (v - 4.2) / 2.4), cast = Math.hypot((u - 18) / 12, (v - 3.2) / 3.2);
    var a = core < 1 ? 0.55 : cast < 1 ? 0.26 * (1 - cast) + 0.12 : 0;
    if (a > 0 && bay(x, y) < a / 0.55) { var o = (y * w + x) * 4; im.data[o] = 4; im.data[o + 1] = 5; im.data[o + 2] = 12; im.data[o + 3] = Math.round(255 * Math.min(0.55, a + 0.1)); }
  }
  c.putImageData(im, 0, 0);
  return (SHC[res] = cv);
}

window.RTF_STAGE = {
  API_VERSION: 1, FT: FT, FOOT_X: FOOT_X, FOOT_Y: FOOT_Y, WT: WT, ROOMS: Object.keys(ROOM_OF),
  build: build, frame: frame, project: project, draw: draw, shadow: shadow, textTex: textTex, setTex: setTex,
  /* the checker's: the camera this file shares with baller.js */
  _cam: { pitch: PITCH, yaw: YAW, light: LV, rot: rot, unrot: unrot }
};
})();
