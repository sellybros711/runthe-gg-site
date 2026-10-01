/* Run The Floor: the player, drawn.
 *
 * Run The Tour draws its golfer as a pixel grid painted in his own colours,
 * and this is that idea arriving at a basketball career: one invented man on a
 * 32 by 48 grid, in the colours of whoever he plays for, with the number he
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
 * Every cell is painted, then the empty cells touching a painted one become
 * the outline. That one pass is what makes it read as pixel art rather than
 * as a picture at low resolution.
 */
(function(){
'use strict';

var W = 32, H = 48;

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
function shade(hex, amt){ var c = rgb(hex); return hexOf(c.map(function(v){ return v + amt; })); }
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

/* ─── the grid ────────────────────────────────────────────────────────── */

var DIGITS = {
  0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'], 2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '111', '001', '111'], 4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '010', '010', '010'], 8: ['111', '101', '111', '101', '111'],
  9: ['111', '101', '111', '001', '111'],
};

function grid(){ var g = []; for (var y = 0; y < H; y++) { g.push(new Array(W).fill(null)); } return g; }

/* Paint the whole figure into a grid of colours. opts:
     c1, c2   the jersey's two colours
     num      the number on the chest
     pose     stand, ball, up, trophy, suit or cap
     age      greys the hair from 33
     frame    0 or 1, the breath */
function paint(look, opts){
  var L = normal(look), o = opts || {};
  var g = grid();
  var px = function(x, y, c){ if (x >= 0 && x < W && y >= 0 && y < H && c) g[y][x] = c; };
  var R = function(x, y, w, h, c){ for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) px(x + i, y + j, c); };
  var clear = function(x, y){ if (x >= 0 && x < W && y >= 0 && y < H) g[y][x] = null; };

  var pose = o.pose || 'stand';
  var suit = pose === 'suit' || pose === 'cap';
  var c1 = o.c1 || '#2b3242', c2 = o.c2 || '#c9ccd6';
  if (contrast(c1, c2) < 1.4) c2 = inkOn(c1);
  var skin = SKINS[L.skin], skD = shade(skin, -24), skL = shade(skin, 14), skDD = shade(skin, -48);
  var hair = HAIR_COLORS[L.hc][1];
  var age = +o.age || 0;
  if (age >= 33) hair = mix(hair, '#c9c9c4', Math.min(0.75, (age - 32) / 12));
  var hD = shade(hair, -26), hL = shade(hair, 26);
  var c1D = shade(c1, -30), c1L = shade(c1, 22);
  var shoe = L.shoes === 'club' ? c1 : FIXED[L.shoes];
  var band = L.band === 'club' ? c2 : FIXED[L.band];
  var slv = L.sleeve === 'club' ? c2 : FIXED[L.sleeve];
  var tw = L.build === 'lean' ? 0 : L.build === 'strong' ? 2 : 1;   /* extra torso width */
  var tx = 11 - tw, tr = 20 + tw;                                    /* torso left and right */

  /* ── legs, socks, shoes ── */
  if (!suit) {
    R(11, 39, 3, 5, skin); R(18, 39, 3, 5, skD);
    px(12, 40, skD); px(19, 40, skDD);
    R(11, 43, 3, 2, '#f2f2f0'); R(18, 43, 3, 2, '#dcdcd8');
    px(11, 43, c1); px(18, 43, c1);
    R(10, 45, 5, 2, shoe); R(17, 45, 5, 2, shade(shoe, -18));
    R(10, 47, 5, 1, '#e9e9e6'); R(17, 47, 5, 1, '#d5d5d1');
    px(12, 45, shade(shoe, 30));
  } else {
    var tro = '#23262e';
    R(11, 34, 10, 10, tro); clear(15, 39); clear(16, 39);
    for (var ty = 39; ty < 44; ty++) { clear(15, ty); clear(16, ty); }
    R(18, 34, 3, 10, shade(tro, -10));
    R(10, 44, 5, 2, '#111216'); R(17, 44, 5, 2, '#111216'); R(10, 46, 5, 1, '#2c2f37'); R(17, 46, 5, 1, '#2c2f37');
    px(11, 44, '#3a3e48'); px(18, 44, '#3a3e48');
  }

  /* ── shorts ── */
  if (!suit) {
    R(tx - 1, 31, tr - tx + 3, 8, c1);
    R(tr - 1, 31, 3, 8, c1D);
    R(tx - 1, 31, tr - tx + 3, 1, c2);
    R(tx - 1, 32, 1, 7, c2); R(tr + 1, 32, 1, 7, c2);
    for (var sy = 36; sy < 39; sy++) { clear(15, sy); clear(16, sy); }
    R(tx - 1, 38, 5, 1, c1D); R(17, 38, tr - 15, 1, shade(c1D, -10));
  }

  /* ── torso ── */
  if (!suit) {
    R(tx, 17, tr - tx + 1, 14, c1);
    R(tr - 1, 17, 2, 14, c1D);
    R(tx, 17, 1, 14, c1L);
    /* tank cut: skin shoulders, trimmed armholes, a scoop neck */
    R(tx - 2, 17, 3, 4, skin); R(tr, 17, 3, 4, skD);
    R(tx + 1, 17, 1, 4, c2); R(tr - 1, 17, 1, 4, c2);
    R(14, 17, 4, 1, skin); R(15, 18, 2, 1, skin);
    px(13, 17, c2); px(18, 17, c2); px(14, 18, c2); px(17, 18, c2); px(15, 19, c2); px(16, 19, c2);
    /* the number, unless a trophy is in front of it */
    var num = pose === 'trophy' ? '' : String(o.num == null ? '' : o.num).slice(0, 2);
    var ink = inkOn(c1, c2);
    var x0 = num.length === 2 ? 12 : 14;
    for (var d = 0; d < num.length; d++) {
      var dg = DIGITS[num[d]];
      if (!dg) continue;
      for (var dy = 0; dy < 5; dy++) for (var dx = 0; dx < 3; dx++) if (dg[dy][dx] === '1') px(x0 + d * 4 + dx, 22 + dy, ink);
    }
  } else {
    var jk = mix(c1, '#1a1c22', 0.62), jkD = shade(jk, -14);
    R(tx - 1, 17, tr - tx + 3, 17, jk);
    R(tr - 1, 17, 3, 17, jkD);
    /* white shirt, the tie in the club's colour, lapels */
    R(14, 17, 4, 5, '#f4f4f1'); R(15, 22, 2, 1, '#f4f4f1');
    var tie = contrast(c1, jk) >= 1.6 ? c1 : c2;
    R(15, 18, 2, 7, tie); px(15, 18, shade(tie, 22));
    px(13, 18, shade(jk, 22)); px(13, 19, shade(jk, 22)); px(14, 22, shade(jk, 22));
    px(18, 18, shade(jk, -24)); px(18, 19, shade(jk, -24)); px(17, 22, shade(jk, -24));
    px(19, 21, c2); px(20, 21, c2);
    R(tx - 1, 33, tr - tx + 3, 1, jkD);
  }

  /* ── arms ── */
  var armC = suit ? mix(c1, '#1a1c22', 0.62) : skin, armD = suit ? shade(armC, -16) : skD;
  var hand = function(x, y, c){ R(x, y, 2, 2, c); };
  if (pose === 'up') {
    R(tx - 3, 9, 2, 10, skin); R(tr + 2, 9, 2, 10, skD);
    hand(tx - 3, 6, skin); hand(tr + 2, 6, skD);
    px(tx - 3, 13, skD); px(tr + 3, 13, skDD);
    if (slv) { R(tr + 2, 9, 2, 8, slv); }
  } else if (pose === 'trophy') {
    R(tx - 3, 17, 2, 7, skin); R(tr + 2, 17, 2, 7, skD);
    R(tx - 2, 23, 3, 3, skin); R(tr, 23, 3, 3, skD);
    /* the trophy: a gold ball over a net, on a gold vase, held at the chest */
    var gold = '#e8b33c', goldL = '#fbe08a', goldD = '#a87b1d';
    R(13, 16, 6, 1, gold); R(12, 17, 8, 4, gold); R(13, 21, 6, 1, gold);
    px(13, 17, goldL); px(14, 17, goldL); px(13, 18, goldL); px(14, 18, goldL); px(19, 19, goldD); px(18, 20, goldD); px(19, 18, goldD);
    R(13, 22, 6, 1, goldD); px(14, 22, gold); px(16, 22, gold);
    R(14, 23, 4, 5, gold); R(17, 23, 1, 5, goldD); px(14, 24, goldL);
    R(12, 28, 8, 2, gold); R(12, 29, 8, 1, goldD);
    hand(11, 24, skin); hand(19, 24, skD);
  } else {
    R(tx - 3, 17, 2, 8, armC); R(tr + 2, 17, 2, 8, armD);
    if (pose === 'ball') {
      R(tr + 2, 25, 2, 3, armD);
      /* the ball, on the hip */
      var bo = '#e47a2e', bD = '#a84e17', bL = '#f7a25b';
      R(tr + 1, 27, 6, 6, bo);
      clear(tr + 1, 27); clear(tr + 6, 27); clear(tr + 1, 32); clear(tr + 6, 32);
      px(tr + 2, 28, bL); px(tr + 3, 28, bL);
      for (var by = 27; by < 33; by++) px(tr + 4, by, bD);
      for (var bx = tr + 1; bx < tr + 7; bx++) px(bx, 30, bD);
      hand(tr + 2, 28, skD);
    } else {
      R(tx - 3, 25, 2, 6, armC); R(tr + 2, 25, 2, 6, armD);
      if (!suit) { px(tx - 3, 24, skD); px(tr + 3, 24, skDD); }
      hand(tx - 3, 31, skin); hand(tr + 2, 31, skD);
    }
    if (!suit && slv) R(tr + 2, 19, 2, pose === 'ball' ? 9 : 12, slv);
  }

  /* ── neck and head ── */
  R(14, 15, 4, 2, skD);
  R(12, 5, 8, 10, skin);
  R(19, 5, 1, 10, skD);
  R(12, 5, 1, 9, skL);
  clear(12, 5); clear(19, 5); clear(12, 14); clear(19, 14);
  R(13, 14, 6, 1, skD);
  R(11, 9, 1, 2, skD); R(20, 9, 1, 2, skDD);
  px(14, 9, '#16130f'); px(17, 9, '#16130f');
  px(15, 11, skD); px(16, 11, skD);
  px(15, 12, skDD); px(16, 12, skDD);
  var brow = L.hair === 'bald' ? skDD : hD;
  px(13, 8, brow); px(14, 8, brow); px(17, 8, brow); px(18, 8, brow);

  /* ── beard ── */
  /* A beard is the natural colour even when the hair is dyed. */
  var natural = L.hc >= 5 ? HAIR_COLORS[L.hc === 5 ? 4 : 1][1] : HAIR_COLORS[L.hc][1];
  var bc = shade(natural, -18);
  if (age >= 33) bc = mix(bc, '#c9c9c4', Math.min(0.7, (age - 32) / 12));
  if (L.beard === 'stubble') {
    var stb = mix(skin, bc, 0.4);
    for (var yy = 13; yy < 15; yy++) for (var xx = 13; xx < 19; xx++) if ((xx + yy) % 2 === 0 && g[yy][xx]) px(xx, yy, stb);
    px(12, 12, stb); px(19, 12, stb);
  } else if (L.beard === 'goatee') {
    px(14, 12, bc); px(17, 12, bc); R(14, 13, 4, 2, bc);
  } else if (L.beard === 'full') {
    R(12, 10, 1, 3, bc); R(19, 10, 1, 3, bc);
    R(12, 12, 3, 1, bc); R(17, 12, 3, 1, bc);
    R(13, 13, 6, 2, bc); px(12, 13, bc); px(19, 13, bc);
  }

  /* ── hair ── */
  var h = L.hair;
  if (pose === 'cap') h = h === 'afro' || h === 'long' || h === 'twists' || h === 'braids' ? h : 'buzz';
  if (h === 'buzz') {
    R(13, 4, 6, 1, hair); R(12, 5, 8, 1, hair); px(12, 6, hD); px(19, 6, hD);
  } else if (h === 'fade') {
    R(13, 3, 6, 1, hair); R(12, 4, 8, 2, hair); px(13, 3, hL);
    R(12, 6, 1, 2, mix(hair, skin, 0.45)); R(19, 6, 1, 2, mix(hair, skin, 0.45));
  } else if (h === 'afro') {
    R(13, 0, 6, 1, hair); R(11, 1, 10, 1, hair); R(10, 2, 12, 5, hair);
    R(10, 7, 2, 3, hair); R(20, 7, 2, 3, hair);
    px(12, 2, hL); px(13, 1, hL); px(14, 3, hL); R(19, 2, 3, 5, hD); R(20, 7, 2, 3, hD);
  } else if (h === 'twists') {
    R(12, 2, 8, 4, hair); R(11, 3, 10, 3, hair);
    for (var tx2 = 11; tx2 <= 20; tx2 += 2) px(tx2, 2, hD);
    for (var t2 = 6; t2 < 14; t2++) { px(11, t2, t2 % 2 ? hair : hD); px(20, t2, t2 % 2 ? hD : hair); }
    px(10, 7, hair); px(21, 7, hD); px(10, 9, hD); px(21, 9, hair); px(12, 6, hD); px(19, 6, hD);
  } else if (h === 'braids') {
    R(12, 3, 8, 3, hair); R(13, 2, 6, 1, hair);
    for (var bx2 = 12; bx2 < 20; bx2 += 2) { px(bx2, 3, hL); px(bx2, 5, hD); }
    px(12, 6, hD); px(19, 6, hD);
  } else if (h === 'flattop') {
    R(12, 0, 8, 6, hair); R(12, 0, 8, 1, hL); R(19, 0, 1, 6, hD);
  } else if (h === 'curly') {
    R(12, 3, 8, 3, hair); R(13, 2, 6, 1, hair);
    for (var cx = 12; cx < 20; cx++) if (cx % 2) px(cx, 2, hair); else px(cx, 4, hL);
    px(12, 6, hair); px(19, 6, hD);
  } else if (h === 'bun') {
    R(13, 3, 6, 1, hair); R(12, 4, 8, 2, hair); R(14, 1, 4, 2, hair); px(15, 0, hair); px(16, 0, hair); px(14, 1, hL);
    px(12, 6, hD); px(19, 6, hD);
  } else if (h === 'long') {
    R(12, 2, 8, 4, hair); R(11, 3, 10, 3, hair);
    R(10, 6, 2, 12, hair); R(20, 6, 2, 12, hD); px(12, 6, hair); px(19, 6, hD); px(13, 2, hL);
  } else if (h === 'bald') {
    px(14, 6, skL); px(15, 6, shade(skL, 12));
  }
  if (band && pose !== 'cap') { R(12, 6, 8, 1, band); px(11, 6, band); px(20, 6, shade(band, -20)); }

  /* ── the draft cap ── */
  if (pose === 'cap') {
    R(12, 2, 8, 4, c1); R(13, 1, 6, 1, c1); R(19, 2, 1, 4, c1D);
    R(11, 6, 10, 1, c1D); px(10, 6, c1D); px(21, 6, c1D);
    px(15, 3, c2); px(16, 3, c2); px(15, 4, c2); px(16, 4, c2);
  }

  /* ── the breath: everything above the knees drops a cell ── */
  if (o.frame === 1) {
    for (var fy = 38; fy >= 1; fy--) g[fy] = g[fy - 1].slice();
    g[0] = new Array(W).fill(null);
  }

  /* ── the outline ── */
  var ink2 = '#0c0f16', out = grid();
  for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
    if (g[y][x]) { out[y][x] = g[y][x]; continue; }
    if ((y > 0 && g[y - 1][x]) || (y < H - 1 && g[y + 1][x]) || (x > 0 && g[y][x - 1]) || (x < W - 1 && g[y][x + 1])) out[y][x] = ink2;
  }
  return out;
}

/* ─── to the screen ───────────────────────────────────────────────────── */

var CACHE = {}, KEYS = [];
function keyOf(look, o){ return JSON.stringify([normal(look), o.c1, o.c2, o.num, o.pose, o.age >= 33 ? o.age : 0, o.frame || 0, o.scale || 4, !!o.shadow]); }

function canvas(look, opts){
  var o = opts || {};
  var s = Math.max(1, Math.round(o.scale || 4));
  var cv = document.createElement('canvas');
  cv.width = W * s; cv.height = H * s;
  var ctx = cv.getContext('2d');
  if (o.shadow !== false) {
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    ctx.beginPath(); ctx.ellipse(16 * s, 47.2 * s, 10 * s, 1.6 * s, 0, 0, Math.PI * 2); ctx.fill();
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
  var still = o.pose === 'trophy' || o.still;
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
  DEFAULT: DEFAULT, normal: normal, lookFor: lookFor, hash: hash, inkOn: inkOn, contrast: contrast,
  paint: paint, canvas: canvas, url: url, img: img, breathe: breathe,
};
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') { window.RTF_BALLER = API; breathe(); }
})();
