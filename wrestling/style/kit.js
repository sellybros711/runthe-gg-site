/* The style guide's pixel kit: icons and stage backdrops, drawn on the same
   rules as the wrestlers (a grid of cells, integer scale, light from the upper
   left, no smooth gradients). PROTOTYPE FOR APPROVAL, like pxwrestler.js. */
(function(){
'use strict';

/* Icons are 12 by 12 letter maps. k is the outline (a dark shade, never pure
   black), and every other letter is a colour role so one map can be shown in
   any palette. */
var ICONS = {
  belt: [
    '............',
    '............',
    '...kkkkkk...',
    'kkkkGGGGkkkk',
    'kSSkGgrgkSSk',
    'kSSkGrrrkSSk',
    'kSSkGgrgkSSk',
    'kkkkGGGGkkkk',
    '...kkkkkk...',
    '............', '............', '............'],
  mic: [
    '....kkkk....',
    '...kWWWWk...',
    '...kWwWWk...',
    '...kWWWWk...',
    '...kkkkkk...',
    '....kSSk....',
    '....kSSk....',
    '....kSSk....',
    '....kSSk....',
    '...kkkkkk...',
    '..kSSSSSSk..',
    '..kkkkkkkk..'],
  boot: [
    '............',
    '..kkkkk.....',
    '..kRRRk.....',
    '..kRwRk.....',
    '..kRRRk.....',
    '..kRwRk.....',
    '..kRRRkkk...',
    '..kRRRRRRk..',
    '..kRRRRRRRk.',
    '..kkkkkkkkk.',
    '............', '............'],
  fist: [
    '............',
    '...kkkkkk...',
    '..kSsSsSSk..',
    '..kSSSSSSk..',
    '..kkkkkkSk..',
    '..kSSSSSSk..',
    '..kSSSSSSk..',
    '...kSSSSk...',
    '...kWWWWk...',
    '...kkkkkk...',
    '............', '............'],
  star: [
    '.....kk.....',
    '....kGGk....',
    '....kGGk....',
    'kkkkkGgkkkkk',
    'kGGGGGgGGGGk',
    '.kGGGggGGGk.',
    '..kGGGGGGk..',
    '..kGGkkGGk..',
    '.kGGk..kGGk.',
    '.kkk....kkk.',
    '............', '............'],
  chair: [
    '...kkkkkk...',
    '...kSSSSk...',
    '...kSssSk...',
    '...kSSSSk...',
    '...kkkkkk...',
    '..kSSSSSSk..',
    '..kkkkkkkk..',
    '...kS..Sk...',
    '...kS..Sk...',
    '..kS....Sk..',
    '..kk....kk..', '............'],
  ladder: [
    '..kk....kk..',
    '..kSkkkkSk..',
    '..kSssssSk..',
    '..kSkkkkSk..',
    '..kS....Sk..',
    '..kSkkkkSk..',
    '..kSssssSk..',
    '..kSkkkkSk..',
    '..kS....Sk..',
    '..kSkkkkSk..',
    '..kSssssSk..',
    '..kk....kk..'],
  heart: [
    '............',
    '.kkk...kkk..',
    'kRRRk.kRRRk.',
    'kRwRRkRRRRk.',
    'kRRRRRRRRRk.',
    '.kRRRRRRRk..',
    '..kRRRRRk...',
    '...kRRRk....',
    '....kRk.....',
    '.....k......',
    '............', '............'],
  flame: [
    '.....k......',
    '....kRk.....',
    '....kRRk....',
    '...kRRGk.k..',
    '..kRRGGkkRk.',
    '..kRGGGGRRk.',
    '.kRGGwGGGRk.',
    '.kRGwwwGGRk.',
    '.kRGGwwGGRk.',
    '..kRGGGGRk..',
    '...kkkkkk...', '............'],
  contract: [
    '..kkkkkkk...',
    '..kWWWWWWk..',
    '..kWssssWWk.',
    '..kWWWWWWWk.',
    '..kWssssWWk.',
    '..kWWWWWWWk.',
    '..kWsssWWWk.',
    '..kWWWWWRRk.',
    '..kWWWWRRRk.',
    '..kkkkkkkkk.',
    '............', '............'],
  crowd: [
    '............',
    '.kk..kk..kk.',
    'kSSkkSSkkSSk',
    'kSSkkSSkkSSk',
    '.kk..kk..kk.',
    'kRRk.kk.kRRk',
    'kRRkkSSkkRRk',
    'kRRkkSSkkRRk',
    'kRRkkGGkkRRk',
    'kRRkkGGkkRRk',
    'kkkkkkkkkkkk', '............'],
  bell: [
    '.....kk.....',
    '....kGGk....',
    '...kGgGGk...',
    '..kGgGGGGk..',
    '..kGgGGGGk..',
    '..kGGGGGGk..',
    '.kGGGGGGGGk.',
    'kkkkkkkkkkkk',
    '.....kk.....',
    '............', '............', '............'],
};

function rgb(h){ h = h.replace('#', ''); var n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function hx(c){ return '#' + c.map(function(v){ v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); }).join(''); }
function mix(a, b, t){ var x = rgb(a), y = rgb(b); return hx(x.map(function(v, i){ return v + (y[i] - v) * t; })); }

/* roles to colours. Lower case is a lit step of its upper case letter. */
function palette(p){
  p = p || {};
  var R = p.red || '#e23b2e', G = p.gold || '#f2c14e', S = p.steel || '#9aa0ad', W = p.white || '#f3ecdf', K = p.ink || '#15121a';
  return { k: K, R: R, r: mix(R, '#fff3d0', 0.4), G: G, g: mix(G, '#fffbe8', 0.55), S: S, s: mix(S, '#ffffff', 0.45), W: W, w: mix(W, '#ffffff', 0.7) };
}
function icon(name, scale, p){
  var map = ICONS[name], pal = palette(p), s = scale || 3;
  var cv = document.createElement('canvas'); cv.width = 12 * s; cv.height = 12 * s;
  var ctx = cv.getContext('2d');
  for (var y = 0; y < 12; y++) for (var x = 0; x < 12; x++) {
    var ch = map[y][x]; if (ch === '.') continue;
    ctx.fillStyle = pal[ch] || pal.k; ctx.fillRect(x * s, y * s, s, s);
  }
  cv.className = 'pxicon'; cv.setAttribute('aria-hidden', 'true');
  return cv;
}

/* Stage backdrops, 160 by 90 cells. One function, seven moods: the crowd, the
   light and the production grow as the career does. Seeded, so a building is
   the same building every time. */
var STAGES = {
  school:   { name: 'The School',          wall: '#2a241f', floor: '#3b2f25', crowd: 0,    rows: 0, beams: 1, warm: 1, screen: 0, mat: '#6f6a62', apron: '#2b2b2f', banner: 'TRAINING CENTER' },
  bingo:    { name: 'Bingo Hall Indie',    wall: '#241a1e', floor: '#2a2022', crowd: 0.35, rows: 3, beams: 2, warm: 1, screen: 0, mat: '#8b847a', apron: '#7a1c24', banner: 'TONIGHT' },
  studio:   { name: 'Territory TV Studio', wall: '#1b1d2a', floor: '#22202a', crowd: 0.6,  rows: 4, beams: 3, warm: 0, screen: 0, mat: '#4b6a9b', apron: '#1f2b4a', banner: 'CHANNEL 9' },
  tour:     { name: 'Overseas Tour',       wall: '#1a1416', floor: '#201618', crowd: 0.8,  rows: 6, beams: 4, warm: 0, screen: 0, mat: '#d8d2c4', apron: '#a3192b', banner: 'TOUR' },
  dev:      { name: 'Developmental Brand', wall: '#121722', floor: '#141a24', crowd: 0.55, rows: 5, beams: 4, warm: 0, screen: 1, mat: '#2a2f3a', apron: '#1a1f2b', banner: 'PROVING GROUND' },
  weekly:   { name: 'National Weekly TV',  wall: '#0f0d18', floor: '#120f1b', crowd: 0.9,  rows: 9, beams: 6, warm: 0, screen: 2, mat: '#2a2340', apron: '#2a1f4a', banner: 'MONDAY' },
  stadium:  { name: 'Stadium Supershow',   wall: '#07060c', floor: '#0a0812', crowd: 1,    rows: 14, beams: 8, warm: 0, screen: 3, mat: '#ece3cf', apron: '#c6392c', banner: 'SUPERSHOW', pyro: 1 },
};
function rng(seed){ var h = 2166136261 >>> 0; for (var i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return function(){ h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0; return (h >>> 0) / 4294967296; }; }
function stage(kind, scale){
  var T = STAGES[kind], s = scale || 3, Wc = 160, Hc = 90, r = rng(kind);
  var cv = document.createElement('canvas'); cv.width = Wc * s; cv.height = Hc * s;
  var ctx = cv.getContext('2d');
  var px = function(x, y, c){ ctx.fillStyle = c; ctx.fillRect(Math.floor(x) * s, Math.floor(y) * s, s, s); };
  var rect = function(x, y, w, h, c){ ctx.fillStyle = c; ctx.fillRect(Math.floor(x) * s, Math.floor(y) * s, Math.ceil(w) * s, Math.ceil(h) * s); };
  rect(0, 0, Wc, Hc, T.wall);
  /* the back wall: bricks for the small rooms, panels for TV */
  if (T.warm) { for (var by = 4; by < 50; by += 4) for (var bx = (by / 4) % 2 ? 0 : 3; bx < Wc; bx += 6) rect(bx, by, 5, 3, mix(T.wall, '#000', 0.25 + r() * 0.1)); }
  else { for (var py = 0; py < 46; py++) if (py % 6 === 0) rect(0, py, Wc, 1, mix(T.wall, '#ffffff', 0.04)); }
  /* the screen above the stage, if there is money for one */
  if (T.screen) { var sw = 26 + T.screen * 12, sx = 80 - sw / 2; rect(sx, 6, sw, 14, '#0b1020'); rect(sx + 1, 7, sw - 2, 12, mix(T.apron, '#000', 0.35)); for (var sl = 8; sl < 19; sl += 2) rect(sx + 1, sl, sw - 2, 1, mix(T.apron, '#000', 0.5)); }
  else { rect(56, 8, 48, 8, T.apron); rect(57, 9, 46, 6, mix(T.apron, '#ffffff', 0.1)); }
  /* the crowd: rows of heads, a dither of colour, denser the bigger the room */
  var tones = ['#d9b08c', '#8a5a3c', '#5a3a2a', '#c48a62', '#3a2a24'], shirts = ['#c6392c', '#2b4a7a', '#e0b341', '#ecebe6', '#2fa86a', '#7a3f9d', '#1c1f27'];
  for (var row = 0; row < T.rows; row++) {
    var y = 50 - row * 3; if (y < 22) break;
    for (var x = 1; x < Wc - 1; x += 2) {
      if (r() > T.crowd) continue;
      var k = mix(shirts[Math.floor(r() * shirts.length)], T.wall, 0.35 + row * 0.05);
      px(x, y, mix(tones[Math.floor(r() * tones.length)], T.wall, 0.3 + row * 0.05)); px(x, y + 1, k);
    }
  }
  /* lights: hard beams in steps, never a smooth gradient */
  for (var b = 0; b < T.beams; b++) {
    var cx = 12 + (b + 0.5) * (136 / T.beams), col = T.warm ? '#ffd9a0' : b % 2 ? '#9fb8ff' : '#fff1d0';
    px(cx, 1, '#ffffff'); px(cx + 1, 1, col);
    for (var by2 = 2; by2 < 52; by2++) {
      var w = 1 + by2 * 0.18;
      for (var bx2 = -w; bx2 <= w; bx2++) if ((Math.floor(cx + bx2) + by2) % 3 === 0) px(cx + bx2 + (b % 2 ? -by2 * 0.08 : by2 * 0.08), by2, mix(col, T.wall, 0.78));
    }
  }
  /* the floor, the ring, the apron, the posts and three ropes */
  rect(0, 52, Wc, 38, T.floor);
  rect(28, 54, 104, 22, T.mat); for (var my = 55; my < 76; my += 3) rect(28, my, 104, 1, mix(T.mat, '#000', 0.08));
  rect(24, 74, 112, 12, T.apron); rect(24, 74, 112, 1, mix(T.apron, '#ffffff', 0.25));
  ctx.fillStyle = '#f3ecdf'; ctx.font = (5 * s) + 'px monospace';
  [[26, 44], [132, 44]].forEach(function(p){ rect(p[0], p[1], 3, 32, '#b8bcc6'); rect(p[0], p[1], 1, 32, '#e6e8ee'); rect(p[0] - 1, p[1] - 2, 5, 3, T.apron); });
  [47, 53, 59].forEach(function(ry, i){ rect(28, ry, 104, 1, i === 1 ? '#ecebe6' : T.apron === '#2b2b2f' ? '#9aa0ad' : mix(T.apron, '#ffffff', 0.15)); });
  /* the light on the canvas */
  for (var ly = 55; ly < 75; ly++) for (var lx = 40; lx < 120; lx++) if ((lx + ly) % 2 === 0 && Math.hypot((lx - 80) / 40, (ly - 64) / 10) < 1) px(lx, ly, mix(T.mat, '#ffffff', 0.12));
  if (T.pyro) { for (var p2 = 0; p2 < 40; p2++) { var x2 = r() < 0.5 ? 8 + r() * 10 : 142 + r() * 10, y2 = 40 - r() * 30; px(x2, y2, r() < 0.5 ? '#ffd24a' : '#ff7a2a'); } }
  cv.className = 'pxstage'; cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', T.name);
  return cv;
}

window.RTR_KIT = { ICONS: ICONS, icon: icon, STAGES: STAGES, stage: stage, mix: mix };
})();
