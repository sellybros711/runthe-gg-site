/* Run The Floor: the player card.
 *
 * window.RTF_CARD. A trading card of the account's player, in what he wears:
 *
 *   - THE FRONT: his card backdrop (a pixel scene), his number in the club's
 *     colours behind him, the man himself in the street look with his idle,
 *     his nameplate across the foot, and a frame and ribbon in his Floor Rep
 *     rank. Legendary pieces carry a foil sheen; on a mouse the card tilts.
 *   - THE BACK, a tap away: what the account has done (careers, best legacy,
 *     rings, MVPs, All-Star nods, badges) and what he is wearing.
 *   - THE BOARDS: a row filed by an account draws that account's player in a
 *     circle, off the profile row 140 publishes, and a tap opens his card.
 *
 * Who he is comes from the career (RTF_CAREER_UI.cardPlayer: the career in
 * progress, or the newest finished one). What he wears and the card's own
 * pieces (the nameplate and backdrop slots) come from the street loadout
 * (RTF_WARD). A player who has never made a career has no card, and is told
 * so: a card is never a random stranger.
 *
 * ONLY THE INVENTED PLAYER IS EVER DRAWN. A board row is filed by an account
 * and its circle is that account's invented player; the real NBA never
 * appears on a card.
 *
 * The art is drawn in code on a pixel grid, like the item icons: a backdrop
 * is 60 by 84 cells and a nameplate 64 by 14, each from its catalogue row's
 * design key and colours, so a new colourway is a catalogue row and nothing
 * else. An unknown design draws the house one. The CSS is injected here, so
 * it caches with the file.
 */
(function(){
'use strict';

var API_VERSION = 1;
var CAT = window.RTF_CATALOG, W = window.RTF_WARD, B = window.RTF_BALLER, A = window.RTF_ART;

function $(id){ return document.getElementById(id); }
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function reduced(){ try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
function fine(){ try { return matchMedia('(hover: hover) and (pointer: fine)').matches; } catch (e) { return false; } }

/* ── colour ─────────────────────────────────────────────────────────────── */
function hex(c){ c = String(c || '#888').replace('#', ''); if (c.length === 3) c = c.split('').map(function(x){ return x + x; }).join(''); var n = parseInt(c, 16); return isFinite(n) ? [n >> 16 & 255, n >> 8 & 255, n & 255] : [136, 136, 136]; }
function rgb(a){ return '#' + a.map(function(v){ v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); }).join(''); }
function mix(c, d, t){ var a = hex(c), b = hex(d); return rgb([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]); }
function dark(c, t){ return mix(c, '#06070d', t == null ? 0.4 : t); }
function lite(c, t){ return mix(c, '#fff8ea', t == null ? 0.3 : t); }
function lum(c){ var a = hex(c); return (0.299 * a[0] + 0.587 * a[1] + 0.114 * a[2]) / 255; }
/* a seeded random, so a design is the same picture every time */
function rng(seed){ var h = 2166136261 >>> 0; seed = String(seed); for (var i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return function(){ h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0; h ^= h >>> 16; return (h >>> 0) / 4294967296; }; }

/* ── the grid ───────────────────────────────────────────────────────────── */
function Grid(w, h){ this.w = w; this.h = h; this.px = new Array(w * h).fill(null); }
Grid.prototype.set = function(x, y, c){ x = Math.round(x); y = Math.round(y); if (c && x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = c; };
Grid.prototype.get = function(x, y){ return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.px[y * this.w + x] : null; };
Grid.prototype.rect = function(x, y, w, h, c){ for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) this.set(x + i, y + j, c); };
/* a banded vertical ramp: n hard steps from a to b, which is what makes a
   gradient read as pixel art rather than as a smear */
Grid.prototype.band = function(y0, y1, a, b, n){ n = n || 6; for (var y = y0; y < y1; y++) { var t = Math.floor((y - y0) / Math.max(1, y1 - y0) * n) / Math.max(1, n - 1); this.rect(0, y, this.w, 1, mix(a, b, Math.min(1, t))); } };
Grid.prototype.disc = function(cx, cy, r, c){ for (var y = -r; y <= r; y++) for (var x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) this.set(cx + x, cy + y, c); };
Grid.prototype.url = function(sc){
  var cv = document.createElement('canvas'); cv.width = this.w * sc; cv.height = this.h * sc;
  var g = cv.getContext('2d');
  for (var y = 0; y < this.h; y++) for (var x = 0; x < this.w; x++) { var c = this.px[y * this.w + x]; if (c) { g.fillStyle = c; g.fillRect(x * sc, y * sc, sc, sc); } }
  return cv.toDataURL('image/png');
};

/* ── backdrops: 60 by 84, [sky, ground, light] ──────────────────────────── */
var BW = 60, BH = 84;
var BG = {
  tunnel: function(g, c, r){
    g.band(0, BH, dark(c[0], 0.2), c[1], 7);
    /* the arch, and the light at the end of it */
    for (var y = 6; y < 70; y++) for (var x = 0; x < BW; x++) {
      var dx = (x - 30) / 30, dy = (y - 46) / 40;
      if (dx * dx + dy * dy * 1.2 > 1) g.set(x, y, dark(c[0], 0.5));
    }
    for (var k = 0; k < 8; k++) { var gl = mix(c[1], c[2], k / 8); for (var y2 = 22 + k * 2; y2 < 56 - k; y2++) for (var x2 = 20 + k; x2 < 40 - k; x2++) g.set(x2, y2, gl); }
    for (var y3 = 56; y3 < BH; y3++) { var w = (y3 - 56) * 1.1 + 10; g.rect(30 - w, y3, w * 2, 1, (y3 % 4 < 2) ? mix(c[1], c[2], 0.25) : c[1]); }
    for (var i = 0; i < 6; i++) g.rect(4 + i * 10, 8 + (i % 2), 2, 1, c[2]);
  },
  hardwood: function(g, c, r){
    g.band(0, 50, dark(c[0], 0.4), c[0], 6);
    for (var y = 50; y < BH; y++) for (var x = 0; x < BW; x++) {
      var plank = Math.floor((x + (y % 2 ? 3 : 0)) / 8);
      var v = (plank * 7) % 3, col = v === 0 ? c[1] : v === 1 ? dark(c[1], 0.12) : lite(c[1], 0.08);
      if ((x + Math.floor(y / 6) * 5) % 13 === 0) col = dark(c[1], 0.3);
      g.set(x, y, col);
    }
    g.rect(0, 50, BW, 1, lite(c[1], 0.35));
    /* the spotlight cone, dithered at its edges */
    for (var y2 = 0; y2 < BH; y2++) { var half = 4 + y2 * 0.32; for (var x2 = Math.floor(30 - half); x2 < 30 + half; x2++) { var e = Math.abs(x2 - 30) / half; if (e < 0.7 || ((x2 + y2) % 2 === 0 && e < 1)) g.set(x2, y2, mix(g.get(x2, y2) || c[0], c[2], y2 < 50 ? 0.16 : 0.22)); } }
  },
  blacktop: function(g, c, r){
    g.band(0, 50, lite(c[0], 0.2), c[0], 5);
    for (var y = 22; y < 50; y++) for (var x = 0; x < BW; x++) if ((x + y) % 4 === 0 || (x - y + 400) % 4 === 0) g.set(x, y, mix(c[0], '#a8afba', 0.6));
    g.rect(0, 21, BW, 1, '#8a919c');
    for (var p = 0; p < BW; p += 15) g.rect(p, 21, 1, 29, '#6c7380');
    g.band(50, BH, c[1], dark(c[1], 0.3), 4);
    for (var i = 0; i < 90; i++) g.set(r() * BW, 50 + r() * 34, mix(c[1], '#9aa0aa', 0.4));
    for (var x2 = 0; x2 < BW; x2++) { var yy = 66 - Math.round(Math.sqrt(Math.max(0, 400 - (x2 - 30) * (x2 - 30))) * 0.35); g.set(x2, yy, c[2]); }
    g.rect(0, 74, BW, 1, c[2]);
  },
  beach: function(g, c, r){
    g.band(0, 48, lite(c[0], 0.3), c[0], 6);
    g.disc(44, 14, 6, c[2]); g.disc(44, 14, 4, lite(c[2], 0.4));
    for (var y = 44; y < 54; y++) g.rect(0, y, BW, 1, y % 3 === 0 ? lite('#3a8ad0', 0.5) : (y < 49 ? '#3a8ad0' : '#4fa3e0'));
    g.band(54, BH, c[1], dark(c[1], 0.16), 4);
    for (var i = 0; i < 70; i++) g.set(r() * BW, 56 + r() * 28, dark(c[1], 0.12));
    /* a palm, off to the side */
    for (var t = 0; t < 30; t++) g.set(8 + Math.round(t * 0.15), 54 - t, '#6b4a2a');
    [[-6, 2], [6, 2], [-5, -2], [5, -2], [0, -4]].forEach(function(d){ for (var k = 0; k < 7; k++) g.set(12 + d[0] * k / 6, 24 + d[1] * k / 6 + k * 0.3, '#2f8a4a'); });
  },
  gym: function(g, c, r){
    for (var y = 0; y < 54; y++) for (var x = 0; x < BW; x++) {
      var row = Math.floor(y / 3), off = row % 2 ? 3 : 0;
      g.set(x, y, (y % 3 === 2 || (x + off) % 6 === 5) ? dark(c[0], 0.3) : (((x + off) / 6 | 0) + row) % 3 === 0 ? lite(c[0], 0.06) : c[0]);
    }
    [[6, '#a83232'], [24, '#2f5aa8'], [42, '#c9a227']].forEach(function(b){ g.rect(b[0], 6, 12, 16, b[1]); g.rect(b[0] + 2, 10, 8, 1, '#f4f2ec'); g.rect(b[0] + 3, 13, 6, 1, '#f4f2ec'); for (var k = 0; k < 6; k++) g.set(b[0] + k * 2, 22, b[1]); });
    g.band(54, BH, c[1], dark(c[1], 0.25), 4);
    for (var x2 = 0; x2 < BW; x2 += 5) g.rect(x2, 54, 1, 30, dark(c[1], 0.18));
    g.rect(0, 54, BW, 1, c[2]);
  },
  skyline: function(g, c, r){
    g.band(0, BH, c[0], c[1], 7);
    for (var s = 0; s < 40; s++) g.set(r() * BW, r() * 40, r() < 0.3 ? c[2] : '#cdd6ff');
    g.disc(46, 12, 5, lite(c[2], 0.4)); g.disc(48, 11, 4, c[0]);
    var x = 0;
    while (x < BW) {
      var w = 5 + Math.floor(r() * 7), h = 18 + Math.floor(r() * 34), top = BH - h;
      var col = dark(c[1], 0.3 + r() * 0.3);
      g.rect(x, top, w, h, col);
      for (var yy = top + 2; yy < BH - 2; yy += 3) for (var xx = x + 1; xx < x + w - 1; xx += 2) if (r() < 0.45) g.set(xx, yy, mix(c[2], '#ffffff', r() * 0.4));
      x += w + (r() < 0.3 ? 1 : 0);
    }
  },
  sunset: function(g, c, r){
    g.band(0, 58, c[0], c[1], 8); g.rect(0, 58, BW, BH - 58, c[1]);
    for (var y = -10; y <= 10; y++) for (var x = -14; x <= 14; x++) if (x * x + y * y < 190 && (y < 2 || (y + 20) % 4 < 2)) g.set(30 + x, 42 + y, mix(c[2], c[0], (y + 10) / 30));
    for (var x2 = 0; x2 < BW; x2++) { var h1 = 56 + Math.round(Math.sin(x2 * 0.18) * 3 + Math.sin(x2 * 0.05) * 4); for (var y2 = h1; y2 < BH; y2++) g.set(x2, y2, dark(c[1], 0.45)); var h2 = 66 + Math.round(Math.sin(x2 * 0.11 + 2) * 3); for (var y3 = h2; y3 < BH; y3++) g.set(x2, y3, dark(c[1], 0.7)); }
  },
  lights: function(g, c, r){
    g.band(0, 60, c[0], lite(c[0], 0.1), 6);
    for (var s = 0; s < 18; s++) g.set(r() * BW, r() * 30, '#8090c0');
    [[8, 1], [52, -1]].forEach(function(t){
      g.rect(t[0], 18, 1, 50, '#4a5266');
      for (var k = 0; k < 4; k++) for (var m = 0; m < 3; m++) g.set(t[0] - 3 + k * 2, 12 + m * 2, c[2]);
      g.rect(t[0] - 4, 11, 9, 1, '#5a6276');
      for (var y = 18; y < 70; y++) { var w = (y - 18) * 0.45; for (var x = 0; x < w; x++) if ((x + y) % 3 !== 0) { var X = t[0] + t[1] * (x + 2); g.set(X, y, mix(g.get(X, y) || c[0], c[2], 0.12)); } }
    });
    g.band(60, BH, c[1], dark(c[1], 0.3), 4);
    for (var x2 = 0; x2 < BW; x2 += 6) g.rect(x2, 60, 3, 24, lite(c[1], 0.08));
  },
  snow: function(g, c, r){
    g.band(0, 62, dark(c[0], 0.2), c[0], 6); g.rect(0, 62, BW, BH - 62, c[0]);
    for (var x = 0; x < BW; x++) { var h = 60 + Math.round(Math.sin(x * 0.2) * 3 + Math.sin(x * 0.07 + 1) * 2); for (var y = h; y < BH; y++) g.set(x, y, y === h ? c[2] : mix(c[1], c[0], (y - h) / 60)); }
    /* two pines */
    [[10, 58], [50, 60]].forEach(function(p){ for (var k = 0; k < 18; k++) { var w = Math.floor(k / 2); g.rect(p[0] - w, p[1] - 18 + k, w * 2 + 1, 1, k % 4 === 0 ? c[2] : '#2f5a4a'); } g.rect(p[0], p[1], 1, 3, '#4a3a2a'); });
    for (var s = 0; s < 70; s++) g.set(r() * BW, r() * BH, c[2]);
  },
  neon: function(g, c, r){
    g.band(0, 46, c[0], mix(c[0], c[1], 0.35), 6);
    for (var s = 0; s < 22; s++) g.set(r() * BW, r() * 30, '#e8d8ff');
    for (var y = -9; y <= 0; y++) for (var x = -12; x <= 12; x++) if (x * x + y * y < 150 && (y + 30) % 3 !== 0) g.set(30 + x, 44 + y, mix(c[2], c[1], (-y) / 10));
    g.rect(0, 46, BW, BH - 46, dark(c[0], 0.3));
    for (var k = 0; k < 9; k++) { var yy = 46 + Math.round(Math.pow(k / 8, 1.8) * 38); g.rect(0, yy, BW, 1, c[1]); }
    for (var l = -8; l <= 8; l++) for (var y2 = 46; y2 < BH; y2++) { var t = (y2 - 46) / 38; g.set(30 + l * (2 + t * 9), y2, c[1]); }
  },
  confetti: function(g, c, r){
    g.band(0, BH, lite(c[0], 0.1), dark(c[0], 0.2), 6);
    var cols = [c[1], c[2], '#f4f2ec', '#3fd29a', '#ff5fa2', '#5b9bff'];
    for (var i = 0; i < 6; i++) { var y0 = 6 + i * 13; for (var x = 0; x < BW; x++) g.set(x, y0 + Math.round(Math.sin(x * 0.25 + i) * 2), cols[i % cols.length]); }
    for (var k = 0; k < 120; k++) { var col = cols[Math.floor(r() * cols.length)], x2 = r() * BW, y2 = r() * BH; g.set(x2, y2, col); if (r() < 0.5) g.set(x2 + 1, y2, col); else g.set(x2, y2 + 1, col); }
  },
  smoke: function(g, c, r){
    g.band(0, BH, c[0], dark(c[0], 0.1), 4);
    for (var b = 0; b < 26; b++) { var cx = r() * BW, cy = 30 + r() * 54, rad = 4 + r() * 9, col = mix(c[1], c[0], r() * 0.5); for (var y = -rad; y <= rad; y++) for (var x = -rad; x <= rad; x++) { var d = (x * x + y * y) / (rad * rad); if (d < 1 && (d < 0.55 || (Math.round(cx + x) + Math.round(cy + y)) % 2 === 0)) g.set(cx + x, cy + y, col); } }
    for (var y2 = 0; y2 < 60; y2++) { var half = 2 + y2 * 0.3; for (var x2 = Math.floor(30 - half); x2 < 30 + half; x2++) if ((x2 + y2) % 2 === 0 || Math.abs(x2 - 30) < half * 0.5) g.set(x2, y2, mix(g.get(x2, y2) || c[0], c[2], 0.22)); }
  },
  aurora: function(g, c, r){
    g.band(0, BH, c[0], lite(c[0], 0.08), 5);
    for (var s = 0; s < 60; s++) g.set(r() * BW, r() * 60, r() < 0.2 ? '#ffffff' : '#9fb0d8');
    for (var i = 0; i < 3; i++) for (var x = 0; x < BW; x++) {
      var y0 = 14 + i * 9 + Math.round(Math.sin(x * 0.16 + i * 1.7) * 5 + Math.sin(x * 0.05 + i) * 4);
      for (var k = 0; k < 12; k++) if (k < 3 || (x + k) % 2 === 0) g.set(x, y0 + k, mix(i === 1 ? c[2] : c[1], c[0], k / 13));
    }
    for (var x2 = 0; x2 < BW; x2++) { var h = 62 + Math.round(Math.abs(((x2 * 1.3) % 24) - 12) * 0.9); for (var y = h; y < BH; y++) g.set(x2, y, y < h + 2 ? '#dfe8f4' : dark(c[0], 0.3)); }
  },
  trophy: function(g, c, r){
    g.band(0, BH, lite(c[0], 0.06), dark(c[0], 0.3), 5);
    for (var a = 0; a < 18; a++) { var ang = a / 18 * Math.PI * 2; for (var t = 6; t < 70; t++) if (a % 2 === 0) { var X = 30 + Math.cos(ang) * t, Y = 34 + Math.sin(ang) * t * 0.9; if ((Math.round(X) + Math.round(Y)) % 2 === 0) g.set(X, Y, mix(c[0], c[1], 0.35)); } }
    /* shelves of hardware either side */
    [[3, 30], [3, 50], [45, 30], [45, 50]].forEach(function(s, i){ g.rect(s[0], s[1], 12, 1, dark(c[1], 0.3)); g.rect(s[0] + 2, s[1] - 5, 2, 5, c[1]); g.rect(s[0] + 6, s[1] - 7, 3, 7, lite(c[1], 0.2)); g.disc(s[0] + 10, s[1] - 3, 2, c[1]); });
    /* the cup: a generic trophy, no league's */
    for (var y = 0; y < 14; y++) { var w = Math.round(9 - y * 0.45); g.rect(30 - w, 18 + y, w * 2 + 1, 1, y < 2 ? c[2] : mix(c[1], c[2], y < 6 ? 0.4 : 0)); }
    g.rect(29, 32, 3, 6, c[1]); g.rect(25, 38, 11, 2, dark(c[1], 0.15)); g.rect(23, 40, 15, 3, dark(c[1], 0.35));
    g.rect(19, 20, 2, 6, c[1]); g.rect(40, 20, 2, 6, c[1]);
    g.band(62, BH, dark(c[0], 0.2), dark(c[0], 0.5), 3);
  },
};
var bgCache = {};
function bgURL(it){
  var k = it && BG[it.k] ? it.k : 'tunnel', c = it && it.c ? it.c : ['#141824', '#2a2f40', '#f2c23a'];
  var key = k + c.join('');
  if (bgCache[key]) return bgCache[key];
  var g = new Grid(BW, BH);
  try { BG[k](g, c, rng('bg:' + key)); } catch (e) { BG.tunnel(g, c, rng(key)); }
  return (bgCache[key] = g.url(4));
}

/* ── nameplates: 64 by 14, [face, trim, ink] ────────────────────────────── */
var PW = 64, PH = 14;
function plateFrame(g, edge, lit){ for (var x = 1; x < PW - 1; x++) { g.set(x, 0, edge); g.set(x, PH - 1, edge); g.set(x, 1, lit); } for (var y = 1; y < PH - 1; y++) { g.set(0, y, edge); g.set(PW - 1, y, edge); } }
var PLATE = {
  house: function(g, c){ g.band(1, PH - 1, lite(c[0], 0.08), dark(c[0], 0.2), 4); plateFrame(g, c[1], lite(c[1], 0.2)); },
  wood: function(g, c){ for (var y = 1; y < PH - 1; y++) for (var x = 1; x < PW - 1; x++) g.set(x, y, (Math.floor(y + Math.sin(x * 0.3) * 1.5) % 4 === 0) ? dark(c[0], 0.18) : (y < 4 ? lite(c[0], 0.1) : c[0])); plateFrame(g, c[1], lite(c[0], 0.3)); [[3, 6], [PW - 4, 6]].forEach(function(p){ g.set(p[0], p[1], c[2]); }); },
  tape: function(g, c){ for (var y = 2; y < PH - 2; y++) for (var x = 2; x < PW - 2; x++) g.set(x, y, (x + y) % 9 === 0 ? c[1] : c[0]); for (var y2 = 2; y2 < PH - 2; y2++) { if (y2 % 2) { g.set(1, y2, c[0]); g.set(PW - 2, y2, c[0]); } } },
  stitch: function(g, c){ g.rect(1, 1, PW - 2, PH - 2, c[0]); for (var x = 3; x < PW - 3; x++) if (x % 3) { g.set(x, 2, c[1]); g.set(x, PH - 3, c[1]); } for (var y = 3; y < PH - 3; y++) if (y % 3) { g.set(2, y, c[1]); g.set(PW - 3, y, c[1]); } plateFrame(g, dark(c[0], 0.4), lite(c[0], 0.15)); },
  chrome: function(g, c){ var steps = [lite(c[0], 0.5), c[0], lite(c[0], 0.2), dark(c[0], 0.15), c[0], lite(c[0], 0.35), dark(c[0], 0.25), c[1]]; for (var y = 1; y < PH - 1; y++) g.rect(1, y, PW - 2, 1, steps[Math.min(steps.length - 1, Math.floor((y - 1) / (PH - 2) * steps.length))]); for (var x = 4; x < PW; x += 19) for (var y2 = 2; y2 < PH - 2; y2++) g.set(x + y2 * 0.5, y2, '#ffffff'); plateFrame(g, dark(c[1], 0.3), '#ffffff'); },
  marble: function(g, c){ var r = rng('marble' + c.join('')); g.rect(1, 1, PW - 2, PH - 2, c[0]); for (var v = 0; v < 5; v++) { var y = r() * PH, dy = (r() - 0.5) * 0.6; for (var x = 1; x < PW - 1; x++) { y += dy + (r() - 0.5) * 0.7; g.set(x, y, c[1]); } } plateFrame(g, dark(c[1], 0.3), lite(c[0], 0.3)); },
  led: function(g, c){ g.rect(1, 1, PW - 2, PH - 2, c[0]); for (var y = 2; y < PH - 2; y += 2) for (var x = 2; x < PW - 2; x += 2) g.set(x, y, mix(c[0], c[1], 0.28)); plateFrame(g, dark(c[1], 0.5), mix(c[0], c[1], 0.4)); },
  frost: function(g, c){ g.band(1, PH - 1, lite(c[0], 0.35), c[1], 5); var r = rng('frost' + c.join('')); for (var k = 0; k < 14; k++) { var x = 2 + r() * (PW - 4), y = 2 + r() * (PH - 4); g.set(x, y, '#ffffff'); g.set(x - 1, y, lite(c[0], 0.6)); g.set(x + 1, y, lite(c[0], 0.6)); } plateFrame(g, dark(c[1], 0.3), '#ffffff'); },
  neon: function(g, c){ g.rect(1, 1, PW - 2, PH - 2, c[0]); for (var x = 2; x < PW - 2; x++) { g.set(x, 2, c[1]); g.set(x, PH - 3, c[1]); } for (var y = 2; y < PH - 2; y++) { g.set(2, y, c[1]); g.set(PW - 3, y, c[1]); } plateFrame(g, dark(c[1], 0.6), mix(c[0], c[1], 0.3)); },
  ember: function(g, c){ g.band(1, PH - 1, c[0], dark(c[0], 0.3), 3); var r = rng('ember' + c.join('')); for (var x = 1; x < PW - 1; x++) { var h = 2 + Math.floor(r() * 4 + Math.sin(x * 0.7) * 1.5); for (var y = PH - 2; y > PH - 2 - h; y--) g.set(x, y, y > PH - 2 - h + 1 ? c[1] : c[2]); } plateFrame(g, dark(c[1], 0.5), mix(c[0], c[1], 0.5)); },
  gold: function(g, c){ var steps = [lite(c[0], 0.55), lite(c[0], 0.2), c[0], c[0], dark(c[0], 0.12), lite(c[0], 0.1), dark(c[0], 0.25), c[1]]; for (var y = 1; y < PH - 1; y++) g.rect(1, y, PW - 2, 1, steps[Math.min(steps.length - 1, Math.floor((y - 1) / (PH - 2) * steps.length))]); [[3, 3], [PW - 4, 3], [3, PH - 4], [PW - 4, PH - 4]].forEach(function(p){ g.set(p[0], p[1], c[2]); }); plateFrame(g, c[1], '#fff3c0'); },
  holo: function(g, c){ var cols = ['#7cf3ff', '#9b8cff', '#ff7ab8', '#ffd166', '#7dffb0']; for (var y = 1; y < PH - 1; y++) for (var x = 1; x < PW - 1; x++) g.set(x, y, mix(cols[Math.floor(((x + y * 2) / 7)) % cols.length], '#ffffff', 0.25)); plateFrame(g, c[2], '#ffffff'); },
};
var plCache = {};
function plateURL(it){
  var k = it && PLATE[it.k] ? it.k : 'house', c = it && it.c ? it.c : ['#1b1e2b', '#3a3f55', '#f4f2ec'];
  var key = k + c.join('');
  if (plCache[key]) return plCache[key];
  var g = new Grid(PW, PH);
  try { PLATE[k](g, c); } catch (e) { PLATE.house(g, c); }
  return (plCache[key] = g.url(5));
}
/* the ink a plate's name is set in: its own when it reads, else black or white */
function plateInk(it){ var c = it && it.c ? it.c : ['#1b1e2b', '#3a3f55', '#f4f2ec']; var ink = c[2] || '#f4f2ec'; return Math.abs(lum(ink) - lum(c[0])) > 0.35 ? ink : (lum(c[0]) > 0.55 ? '#14151b' : '#f7f4ec'); }

/* ── Floor Rep: the frame ───────────────────────────────────────────────── */
/* idx is daily.js rep().idx: 0 Walk-On to 18 Icon, 19 G.O.A.T. Five metals. */
var RANKS = ['Walk-On', 'Rookie', 'Benchwarmer', 'Garbage Time', 'Rotation', 'Sixth Man', 'Starter', 'Glue Guy', 'Spark Plug', 'Rising Star',
  'Star', 'All-Star', 'All-League', 'Franchise', 'Elite', 'Superstar', 'MVP', 'Legend', 'Icon', 'G.O.A.T.'];
function metal(idx){
  idx = Math.max(0, Math.min(19, idx | 0));
  if (idx >= 19) return { k: 'goat', a: '#ff7ab8', b: '#7cf3ff', name: 'G.O.A.T.' };
  if (idx >= 17) return { k: 'icon', a: '#b47cff', b: '#f2c23a' };
  if (idx >= 14) return { k: 'gold', a: '#f2c23a', b: '#8a5a10' };
  if (idx >= 10) return { k: 'silver', a: '#d9e1ec', b: '#6c7688' };
  if (idx >= 5) return { k: 'bronze', a: '#d4874a', b: '#6a3a14' };
  return { k: 'wood', a: '#8b6a4a', b: '#3a2a1a' };
}
function careerRec(){ try { return window.RTF_PAGE && window.RTF_PAGE.career ? window.RTF_PAGE.career() : {}; } catch (e) { return {}; } }
/* Floor Rep, the way the daily hub reads it: daily.js over the badge cabinet */
function myRep(){
  try { var D = window.RTF_DAILY, BG = window.RTF_BADGES; if (D && D.rep && BG && BG.evaluate) return D.rep(BG.evaluate(careerRec())); } catch (e) {}
  return null;
}

/* ── the card ───────────────────────────────────────────────────────────── */
var RCOL = { common: '#aeb4bf', rare: '#5b9bff', epic: '#b47cff', legendary: '#f2c23a' };
/* p: { look, name, num, pos, c1, c2, rep } ; lo: a street loadout ; o: { tryOn, size, back, stats, owner } */
function html(p, lo, o){
  o = o || {};
  lo = lo || {};
  var plate = CAT && CAT.item(lo.plate) && CAT.item(lo.plate).slot === 'plate' ? CAT.item(lo.plate) : CAT && CAT.item('pl_house');
  var bg = CAT && CAT.item(lo.bg) && CAT.item(lo.bg).slot === 'bg' ? CAT.item(lo.bg) : CAT && CAT.item('bg_tunnel');
  var m = metal(p.rep), rank = RANKS[Math.max(0, Math.min(19, p.rep | 0))];
  var c1 = /^#[0-9a-f]{6}$/i.test(p.c1 || '') ? p.c1 : '#e8660f', c2 = /^#[0-9a-f]{6}$/i.test(p.c2 || '') ? p.c2 : '#1d1f2b';
  var size = o.size || 'full';
  var fig = '';
  if (B && p.look) {
    var fo = { c1: c1, c2: c2, num: p.num == null ? 0 : p.num, pose: 'stand', scale: size === 'mini' ? 3 : 4, still: size === 'mini' || !!o.still, sharp: true };
    if (W && W.dress) fo = W.dress(fo, 'street', lo, o.tryOn !== false);
    else fo.ctx = 'street';
    if (W && W.idle && !fo.still) fo = W.idle(fo, 'street', lo, o.tryOn !== false);
    fig = B.img(p.look, fo, 'pc-fimg');
  }
  var foil = (plate && plate.rarity === 'legendary') || (bg && bg.rarity === 'legendary') || m.k === 'goat' || m.k === 'icon';
  var num = p.num == null ? '' : String(p.num);
  var sub = [num ? '#' + esc(num) : '', esc(p.pos || '')].filter(Boolean).join(' · ');
  var front = '<div class="pc-face pc-front">'
    + '<img class="pc-bg" src="' + bgURL(bg) + '" alt="" draggable="false">'
    + '<span class="pc-wm" style="--c1:' + c1 + ';--c2:' + c2 + '">' + esc(num) + '</span>'
    + '<span class="pc-fig">' + fig + '</span>'
    + '<span class="pc-rank pc-m-' + m.k + '"><i class="pc-pip"></i>' + esc(rank) + '</span>'
    + '<span class="pc-plate" style="--ink:' + plateInk(plate) + '"><img src="' + plateURL(plate) + '" alt="" draggable="false">'
    + '<b class="pc-name' + (plate && (plate.k === 'neon' || plate.k === 'led') ? ' glow' : '') + '">' + esc(p.name || 'Player') + '</b>'
    + '<em class="pc-sub">' + sub + '</em></span>'
    + (foil && !reduced() ? '<i class="pc-foil"></i>' : '')
    + '</div>';
  var back = '';
  if (size !== 'mini') {
    var s = o.stats || {};
    var row = function(v, k){ return '<span class="pc-st"><b>' + esc(v) + '</b><em>' + esc(k) + '</em></span>'; };
    var worn = (CAT ? (CAT.STREET_SLOTS || []) : []).map(function(sl){ var it = CAT.item(lo[sl]); return it && sl !== 'idle' && it.slot === sl && CAT.fits(it, 'street') ? '<span class="pc-wi" style="--rc:' + RCOL[it.rarity] + '">' + (A ? A.icon(it, 'pc-wic') : '') + esc(it.name) + '</span>' : ''; }).join('');
    var idleIt = CAT && CAT.item(lo.idle); if (idleIt && idleIt.slot !== 'idle') idleIt = null;
    back = '<div class="pc-face pc-back" style="--c1:' + c1 + ';--c2:' + c2 + '">'
      + '<span class="pc-bhead"><b>' + esc(p.name || 'Player') + '</b><em>' + sub + '</em></span>'
      + '<span class="pc-brank pc-m-' + m.k + '"><i class="pc-pip"></i>Floor Rep: ' + esc(rank) + '</span>'
      + (o.stats ? '<span class="pc-stats">' + row(s.careers || 0, 'Careers') + row(s.best || 0, 'Best legacy') + row(s.rings || 0, 'Rings')
        + row(s.mvp || 0, 'MVPs') + row(s.star || 0, 'All-Star') + row(s.badges || 0, 'Badges') + '</span>' : '<span class="pc-note">His record stays on his own device.</span>')
      + '<span class="pc-wear">' + worn + (idleIt ? '<span class="pc-wi" style="--rc:' + RCOL[idleIt.rarity] + '">' + (A ? A.icon(idleIt, 'pc-wic') : '') + esc(idleIt.name) + '</span>' : '') + '</span>'
      + '<span class="pc-bplate" style="--ink:' + plateInk(plate) + '"><img src="' + plateURL(plate) + '" alt="" draggable="false"><b>Run The Floor</b></span>'
      + '<span class="pc-bfoot">Tap to flip</span>'
      + '</div>';
  }
  return '<div class="pc-card pc-' + size + ' pc-m-' + m.k + (foil ? ' foil' : '') + '" data-rank="' + (p.rep | 0) + '"' + (size !== 'mini' ? ' tabindex="0" role="button" aria-label="Player card. Tap to flip."' : '') + '>'
    + '<div class="pc-in">' + front + back + '</div></div>';
}

/* ── the overlay ────────────────────────────────────────────────────────── */
var ov = null;
function close(){ if (!ov) return; var el = ov; ov = null; el.classList.add('out'); setTimeout(function(){ if (el.parentNode) el.parentNode.removeChild(el); }, 220); document.removeEventListener('keydown', onKey); }
function onKey(e){ if (e.key === 'Escape') close(); }
function wire(card){
  if (!card) return;
  card.addEventListener('click', function(){ card.classList.toggle('flip'); });
  card.addEventListener('keydown', function(e){ if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.classList.toggle('flip'); } });
  if (!fine() || reduced()) return;
  card.addEventListener('pointermove', function(e){
    var r = card.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    card.style.setProperty('--rx', (-y * 14).toFixed(2) + 'deg'); card.style.setProperty('--ry', (x * 18).toFixed(2) + 'deg');
    card.style.setProperty('--gx', ((x + 0.5) * 100).toFixed(1) + '%'); card.style.setProperty('--gy', ((y + 0.5) * 100).toFixed(1) + '%');
  });
  card.addEventListener('pointerleave', function(){ card.style.setProperty('--rx', '0deg'); card.style.setProperty('--ry', '0deg'); });
}
function show(inner, title){
  close();
  ov = document.createElement('div');
  ov.className = 'pc-ov k-root';
  ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', title || 'Player card');
  ov.innerHTML = '<div class="pc-scrim" data-close></div><div class="pc-sheet">' + inner + '</div>';
  document.body.appendChild(ov);
  ov.addEventListener('click', function(e){
    var t = e.target.closest('[data-close]'); if (!t) return;
    var go = t.getAttribute('data-go');
    close();
    if (go === 'career') { var bc = $('b-career'); if (bc) bc.click(); }
  });
  document.addEventListener('keydown', onKey);
  wire(ov.querySelector('.pc-card'));
  var f = ov.querySelector('.pc-card'); if (f) try { f.focus({ preventScroll: true }); } catch (e) {}
  return ov;
}

/* your own card */
function badgeCount(){ try { var BG = window.RTF_BADGES; if (BG && BG.evaluate) return BG.evaluate(careerRec()).filter(function(b){ return b.got; }).length; } catch (e) {} return 0; }
function mine(){
  var CU = window.RTF_CAREER_UI, p = CU && CU.cardPlayer ? CU.cardPlayer() : null;
  if (!p) return null;
  var r = myRep();
  p.rep = r ? r.idx : 0;
  return p;
}
function openMine(){
  var p = mine();
  if (!p) {
    return show('<div class="pc-empty"><span class="k-h2">No card yet</span><p>Start a Career and your player gets his card. It wears his street look, his nameplate and his backdrop.</p>'
      + '<span class="pc-acts"><button type="button" class="k-btn k-btn-primary" data-close data-go="career">Start a Career</button><button type="button" class="k-btn" data-close>Close</button></span></div>');
  }
  var lo = W ? W.loadout('street') : {};
  var st = window.RTF_CAREER_UI && window.RTF_CAREER_UI.cardStats ? window.RTF_CAREER_UI.cardStats() : {};
  st.badges = badgeCount();
  var el = show('<span class="pc-title">Your player card</span>' + html(p, lo, { tryOn: false, stats: st })
    + '<span class="pc-acts"><button type="button" class="k-btn k-btn-primary" data-dress>Change his card</button><button type="button" class="k-btn k-sec" data-close>Close</button></span>'
    + '<span class="pc-hint">Your nameplate and backdrop are in the closet, under Off court.</span>', 'Your player card');
  var b = el.querySelector('[data-dress]');
  if (b) b.addEventListener('click', function(){
    var CU = window.RTF_CAREER_UI;
    if (CU && CU.openCloset && (close(), CU.openCloset('street', 'plate'))) return;
    var h = ov && ov.querySelector('.pc-hint'); if (!h) { openMine(); h = ov && ov.querySelector('.pc-hint'); }
    if (h) h.textContent = 'Start a Career to dress him. The closet opens from his Look button.';
  });
  return el;
}
/* somebody else's, off their profile row (board.js jerseys) */
function cleanPlayer(pl){
  if (!pl || typeof pl !== 'object' || !pl.look || typeof pl.look !== 'object') return null;
  return { look: B ? B.normal(pl.look) : pl.look, name: typeof pl.name === 'string' ? pl.name.slice(0, 28) : '', num: (pl.num | 0) >= 0 && (pl.num | 0) <= 99 ? pl.num | 0 : null,
    pos: /^(PG|SG|SF|PF|C)$/.test(pl.pos || '') ? pl.pos : '', c1: pl.c1, c2: pl.c2, rep: Math.max(0, Math.min(19, pl.rep | 0)) };
}
function openFor(row, who){
  var p = cleanPlayer(row && row.player);
  if (!p) return null;
  var lo = row.wear_street && typeof row.wear_street === 'object' ? row.wear_street : {};
  return show('<span class="pc-title">' + esc(who ? who + '’s player' : 'Player card') + '</span>' + html(p, lo, { tryOn: true })
    + '<span class="pc-acts"><button type="button" class="k-btn" data-close>Close</button></span>', 'Player card');
}

/* ── a board row's circle: his head and shoulders ───────────────────────── */
function bust(row){
  var p = cleanPlayer(row && row.player);
  if (!p || !B) return '';
  var lo = row.wear_street && typeof row.wear_street === 'object' ? row.wear_street : {};
  var fo = { c1: /^#[0-9a-f]{6}$/i.test(p.c1 || '') ? p.c1 : '#e8660f', c2: /^#[0-9a-f]{6}$/i.test(p.c2 || '') ? p.c2 : '#1d1f2b', num: p.num || 0, pose: 'stand', scale: 2, still: true, shadow: false };
  if (W && W.dress) fo = W.dress(fo, 'street', lo, true); else fo.ctx = 'street';
  var bgIt = CAT && CAT.item(lo.bg) && CAT.item(lo.bg).slot === 'bg' ? CAT.item(lo.bg) : null;
  var m = metal(p.rep);
  return '<span class="pc-bust pc-m-' + m.k + '" style="--bb:' + (bgIt ? bgIt.c[0] : fo.c2) + '"><img src="' + B.url(p.look, fo) + '" alt="" draggable="false"></span>';
}

/* ── publishing who he is (140) ─────────────────────────────────────────── */
var pubT = null, pubLast = '';
function publish(){
  clearTimeout(pubT);
  pubT = setTimeout(function(){
    var Au = window.RTF_AUTH, st = Au && Au.state ? Au.state() : null;
    if (!st || !st.signedIn || !Au.setProfile) return;
    var p = mine();
    if (!p) return;
    var body = { look: B ? B.normal(p.look) : p.look, num: Math.max(0, Math.min(99, p.num | 0)), rep: p.rep | 0 };
    if (p.name) body.name = p.name;
    if (/^(PG|SG|SF|PF|C)$/.test(p.pos || '')) body.pos = p.pos;
    if (/^#[0-9a-f]{6}$/i.test(p.c1 || '')) body.c1 = p.c1;
    if (/^#[0-9a-f]{6}$/i.test(p.c2 || '')) body.c2 = p.c2;
    var key = JSON.stringify(body);
    if (key === pubLast) return;
    pubLast = key;
    var r = Au.setProfile({ player: body });
    if (r && r.then) r.then(function(row){ if (!row) pubLast = ''; });
  }, 1500);
}

/* ── CSS ────────────────────────────────────────────────────────────────── */
function css(){
  if ($('pc-css')) return;
  var st = document.createElement('style');
  st.id = 'pc-css';
  st.textContent = [
    '.pc-card:focus,.pc-card:focus-visible{outline:none!important;}',
    '.pc-card{--rx:0deg;--ry:0deg;--gx:50%;--gy:30%;position:relative;width:min(300px,78vw);aspect-ratio:5/7;perspective:900px;cursor:pointer;outline:none;flex:none;}',
    '.pc-card.pc-mini{width:150px;cursor:default;}',
    '.pc-in{position:absolute;inset:0;transform-style:preserve-3d;transform:rotateX(var(--rx)) rotateY(var(--ry));transition:transform .5s cubic-bezier(.2,.8,.2,1);}',
    '.pc-card.flip .pc-in{transform:rotateX(var(--rx)) rotateY(calc(180deg + var(--ry)));}',
    '.pc-face{position:absolute;inset:0;border-radius:14px;overflow:hidden;backface-visibility:hidden;-webkit-backface-visibility:hidden;',
    '  border:5px solid var(--pcm-a);box-shadow:0 0 0 2px var(--pcm-b),inset 0 0 0 2px rgba(0,0,0,.45),0 18px 40px rgba(0,0,0,.55);background:#0b0d16;}',
    '.pc-mini .pc-face{border-width:3px;border-radius:9px;}',
    '.pc-card:focus-visible .pc-face{box-shadow:0 0 0 2px var(--pcm-b),0 0 0 5px #fff,0 18px 40px rgba(0,0,0,.55);}',
    '.pc-back{transform:rotateY(180deg);background:linear-gradient(160deg,var(--c2),#090a12 70%);display:flex;flex-direction:column;gap:10px;padding:16px 14px;color:#f4f2ec;}',
    '.pc-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;image-rendering:pixelated;}',
    '.pc-wm{position:absolute;right:6%;top:9%;font-family:var(--k-f-display,Impact,sans-serif);font-size:min(150px,40vw);line-height:.8;color:var(--c1);opacity:.42;',
    '  -webkit-text-stroke:3px var(--c2);text-shadow:6px 6px 0 rgba(0,0,0,.35);pointer-events:none;}',
    '.pc-mini .pc-wm{font-size:72px;-webkit-text-stroke:2px var(--c2);}',
    '.pc-fig{position:absolute;left:50%;bottom:13%;transform:translateX(-50%);width:80%;display:flex;justify-content:center;filter:drop-shadow(0 6px 0 rgba(0,0,0,.35));}',
    '.pc-fig img,.pc-fig canvas{width:100%!important;height:auto!important;image-rendering:pixelated;}',
    '.pc-rank{position:absolute;left:0;top:10px;display:flex;align-items:center;gap:6px;padding:4px 10px 4px 8px;font-family:var(--k-f-pixel,monospace);font-size:9px;letter-spacing:.04em;',
    '  text-transform:uppercase;color:#14151b;background:var(--pcm-a);border-radius:0 6px 6px 0;box-shadow:0 2px 0 var(--pcm-b);}',
    '.pc-mini .pc-rank{font-size:7px;top:6px;padding:3px 7px 3px 5px;}',
    '.pc-pip{width:7px;height:7px;background:var(--pcm-b);transform:rotate(45deg);flex:none;}',
    '.pc-plate{position:absolute;left:4%;right:4%;bottom:3.5%;aspect-ratio:64/14;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--ink);}',
    '.pc-plate img{position:absolute;inset:0;width:100%;height:100%;image-rendering:pixelated;}',
    '.pc-name{position:relative;font-family:var(--k-f-display,Impact,sans-serif);font-weight:400;font-size:clamp(14px,5.6vw,21px);line-height:1;text-transform:uppercase;letter-spacing:.02em;',
    '  max-width:92%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    '.pc-name.glow{text-shadow:0 0 6px currentColor,0 0 12px currentColor;}',
    '.pc-sub{position:relative;font-style:normal;font-family:var(--k-f-pixel,monospace);font-size:8px;opacity:.85;margin-top:2px;}',
    '.pc-mini .pc-name{font-size:11px;}.pc-mini .pc-sub{font-size:6px;}',
    '.pc-foil{position:absolute;inset:0;pointer-events:none;mix-blend-mode:color-dodge;opacity:.5;',
    '  background:radial-gradient(circle at var(--gx) var(--gy),rgba(255,255,255,.55),transparent 42%),linear-gradient(115deg,transparent 35%,rgba(124,243,255,.45) 45%,rgba(255,122,184,.45) 52%,transparent 62%);',
    '  background-size:100% 100%,250% 250%;animation:pc-foil 4.5s linear infinite;}',
    '@keyframes pc-foil{0%{background-position:0 0,120% 0}100%{background-position:0 0,-120% 0}}',
    /* the five metals and the G.O.A.T. */
    '.pc-m-wood{--pcm-a:#8b6a4a;--pcm-b:#3a2a1a;}.pc-m-bronze{--pcm-a:#d4874a;--pcm-b:#6a3a14;}.pc-m-silver{--pcm-a:#d9e1ec;--pcm-b:#6c7688;}',
    '.pc-m-gold{--pcm-a:#f2c23a;--pcm-b:#8a5a10;}.pc-m-icon{--pcm-a:#b47cff;--pcm-b:#f2c23a;}.pc-m-goat{--pcm-a:#ff7ab8;--pcm-b:#7cf3ff;}',
    '.pc-card.pc-m-goat .pc-face{animation:pc-goat 3s linear infinite;}',
    '@keyframes pc-goat{0%{border-color:#ff7ab8}33%{border-color:#7cf3ff}66%{border-color:#ffd166}100%{border-color:#ff7ab8}}',
    '.pc-bhead{display:flex;flex-direction:column;gap:2px;}.pc-bhead b{font-family:var(--k-f-display,Impact,sans-serif);font-weight:400;font-size:24px;line-height:1;text-transform:uppercase;}',
    '.pc-bhead em{font-style:normal;font-family:var(--k-f-pixel,monospace);font-size:9px;color:var(--c1);}',
    '.pc-brank{align-self:flex-start;display:flex;align-items:center;gap:6px;padding:4px 9px;border-radius:6px;background:var(--pcm-a);color:#14151b;font-family:var(--k-f-pixel,monospace);font-size:8px;text-transform:uppercase;}',
    '.pc-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;}',
    '.pc-st{display:flex;flex-direction:column;align-items:center;padding:7px 2px;border-radius:8px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);}',
    '.pc-st b{font-family:var(--k-f-pixel,monospace);font-size:15px;color:#fff;font-variant-numeric:tabular-nums;}.pc-st em{font-style:normal;font-size:10px;opacity:.75;margin-top:3px;text-align:center;}',
    '.pc-note{font-size:12px;opacity:.75;}',
    '.pc-wear{display:flex;flex-wrap:wrap;gap:5px;align-content:flex-start;overflow:hidden;min-height:0;}',
    '.pc-wi{display:inline-flex;align-items:center;gap:4px;padding:2px 7px 2px 2px;border-radius:12px;font-size:10px;background:rgba(0,0,0,.35);border:1px solid var(--rc);}',
    '.pc-wic{width:18px;height:18px;image-rendering:pixelated;}',
    '.pc-bplate{position:relative;align-self:stretch;aspect-ratio:64/14;display:flex;align-items:center;justify-content:center;color:var(--ink);margin-top:auto;}',
    '.pc-bplate img{position:absolute;inset:0;width:100%;height:100%;image-rendering:pixelated;}',
    '.pc-bplate b{position:relative;font-family:var(--k-f-pixel,monospace);font-size:9px;letter-spacing:.08em;text-transform:uppercase;}',
    '.pc-bfoot{font-family:var(--k-f-pixel,monospace);font-size:7px;opacity:.55;text-align:center;}',
    /* the overlay */
    '.pc-ov{position:fixed;inset:0;z-index:9500;display:flex;align-items:center;justify-content:center;padding:16px;animation:pc-in .22s ease-out;}',
    '.pc-ov.out{animation:pc-out .22s ease-in forwards;}',
    '@keyframes pc-in{from{opacity:0}to{opacity:1}}@keyframes pc-out{to{opacity:0}}',
    '.pc-scrim{position:absolute;inset:0;background:radial-gradient(circle at 50% 40%,rgba(30,34,56,.96),rgba(4,5,10,.985));backdrop-filter:blur(3px);}',
    '.pc-sheet{position:relative;display:flex;flex-direction:column;align-items:center;gap:14px;max-height:100%;overflow:auto;padding:6px;}',
    '.pc-sheet .pc-card{animation:pc-deal .55s cubic-bezier(.2,1.3,.4,1) both;}',
    '@keyframes pc-deal{from{transform:translateY(40px) rotate(-6deg) scale(.86);opacity:0}to{transform:none;opacity:1}}',
    '.pc-title{font-family:var(--k-f-pixel,monospace);font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:#f2c23a;}',
    '.pc-acts{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;}',
    '.pc-hint{font-size:12px;color:rgba(244,242,236,.7);text-align:center;max-width:300px;}',
    '.pc-empty{max-width:320px;text-align:center;color:#f4f2ec;display:flex;flex-direction:column;gap:12px;align-items:center;background:#141826;border:2px solid #2a3150;border-radius:14px;padding:22px 18px;}',
    /* the board circle */
    '.pc-bust{display:block;width:100%;height:100%;border-radius:50%;overflow:hidden;background:radial-gradient(circle at 50% 35%,var(--bb),#0b0d16 80%);box-shadow:inset 0 0 0 2px var(--pcm-a);position:relative;}',
    '.pc-bust img{position:absolute;left:50%;top:4%;width:250%;transform:translateX(-50%);image-rendering:pixelated;}',
    '@media (prefers-reduced-motion:reduce){.pc-in{transition:none}.pc-sheet .pc-card,.pc-ov,.pc-card.pc-m-goat .pc-face{animation:none}}',
  ].join('\n');
  document.head.appendChild(st);
}
css();

/* the two doors (the front page's Career card and the profile sheet) are
   shown once he exists, and open his card */
function doors(){
  var CU = window.RTF_CAREER_UI, has = !!(CU && CU.cardPlayer && CU.cardPlayer());
  ['b-pcard', 'pf-pcard'].forEach(function(id){
    var b = $(id); if (!b) return;
    b.hidden = !has;
    if (!b.getAttribute('data-pc')) { b.setAttribute('data-pc', '1'); b.addEventListener('click', function(){ openMine(); }); }
  });
}
function changed(){ doors(); publish(); }

/* republish when what he wears moves, and once the page has settled */
if (W && W.onChange) W.onChange(function(){ publish(); });
setTimeout(doors, 0);
setTimeout(changed, 4000);

window.RTF_CARD = {
  API_VERSION: API_VERSION,
  html: html, openMine: openMine, openFor: openFor, bust: bust, close: close, changed: changed, publish: publish, doors: doors,
  mine: mine, metal: metal, RANKS: RANKS, BG_KEYS: Object.keys(BG), PLATE_KEYS: Object.keys(PLATE),
  /* the checkers' handles: a design's pixels, and the name ink */
  _bgURL: bgURL, _plateURL: plateURL, _plateInk: plateInk, _bgGrid: function(it){ var g = new Grid(BW, BH); var k = it && BG[it.k] ? it.k : 'tunnel'; BG[k](g, it.c, rng('bg:' + k + it.c.join(''))); return g; },
  _plateGrid: function(it){ var g = new Grid(PW, PH); var k = it && PLATE[it.k] ? it.k : 'house'; PLATE[k](g, it.c); return g; },
};
})();
