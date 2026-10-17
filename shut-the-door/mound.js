/* Shut The Door: the mound. The pitcher's view, and the one grid.
 *
 * window.STD_MOUND. Two things live here because they share one geometry:
 *
 *   Scene  the canvas. Behind the mound, looking in: the batter in his box on
 *          the side his hand puts him, the catcher and the umpire behind the
 *          plate, the backstop and the crowd behind them, the pitcher's back
 *          in the near corner. Pixel art, one block per sprite pixel.
 *
 *   Grid   the 5x5 throw grid AND the batter's heat map. One component, not
 *          two: the cells are laid out with STD_CONTRACT.screenCol(), so the
 *          grid the player throws at and the map he scouts on are mirrored
 *          together and can never disagree. The data, the engine and every
 *          cell index stay in catcher's view (CONTRACT.md section 2).
 *
 * The scene's camera is in feet at the plate: 10 sprite rows to the foot, so
 * the zone drawn beside the batter is the zone the engine plays, at his own
 * szTop and szBot. A ball's PlatePoint maps to the screen by toScreen(), and
 * that mapping mirrors x (catcher's view to pitcher's view) exactly as
 * screenCol() mirrors a column.
 */
(function () {
'use strict';
var C = window.STD_CONTRACT, SP = window.STD_SPRITES;
var ROWS_PER_FT = 10;

/* ---- words for a cell ---------------------------------------------------
   Inside and away are the batter's, never left and right. A right-handed
   hitter stands on the catcher's left, the column 0 side, so for him columns
   0 and 1 are inside; a lefty is the other way round. */
function cellWords(cell, bats) {
  var r = C.rowOf(cell), c = C.colOf(cell);
  var inSide = bats === 'L' ? (c >= 3) : (c <= 1);
  var side = c === 2 ? '' : (inSide ? 'inside' : 'away');
  var edge = c === 0 || c === 4;
  if (r === 0 || r === 4) {
    var v = r === 0 ? 'above the zone' : 'below the zone';
    return side ? v + ', ' + side : v;
  }
  if (edge) {
    var up = r === 1 ? ', up' : r === 3 ? ', down' : '';
    return 'off the plate ' + side + up;
  }
  var vw = r === 1 ? 'up' : r === 3 ? 'down' : '';
  if (vw && side) return vw + ' and ' + (side === 'inside' ? 'in' : 'away');
  return vw || side || 'middle';
}

/* ---- palettes for the ballpark, per theme -------------------------------- */
var PARK = {
  dark: {
    sky: ['#070b16', '#0b1222', '#101a30'], seat: '#0d121c', aisle: '#090d15',
    crowd: ['#3c4a68', '#6a3d3d', '#7b6d50', '#2c2e38', '#55657a', '#8b8f98', '#6b5038', '#3d5b4a'],
    head: ['#b98260', '#8a5a3c', '#d6a77e', '#5b3a26'],
    wall: '#1d4a3a', rail: '#3f7a5f', track: '#5b4532', grass: ['#235a31', '#286539'],
    dirt: '#8a5e3c', dirt2: '#7a5234', chalk: '#e6e1d4', plate: '#f1eee6', mound: '#93633f', glow: 'rgba(255,240,200,',
  },
  light: {
    sky: ['#9cc4e6', '#b4d3ee', '#cfe2f2'], seat: '#4a5160', aisle: '#3a404c',
    crowd: ['#5b6f99', '#a15656', '#b39a6a', '#4a4d58', '#7d93ad', '#c8ccd4', '#946b47', '#5d8a6f'],
    head: ['#c9926e', '#9c6a48', '#e3b78f', '#6b4630'],
    wall: '#24553f', rail: '#4e9070', track: '#8a6a4c', grass: ['#3f8a45', '#46964d'],
    dirt: '#b07b4c', dirt2: '#9e6c40', chalk: '#f6f3ea', plate: '#ffffff', mound: '#b8804f', glow: 'rgba(255,255,255,',
  },
};

function hash2(x, y) {
  var h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function mk(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; }

/* ---- the scene ------------------------------------------------------------ */

function Scene(canvas, opts) {
  this.hero = !!(opts && opts.hero);
  this.cv = canvas;
  this.ctx = canvas.getContext('2d');
  this.scn = null;
  this.bat = null;
  this.L = null;
  this.bg = null;
  this.bgKey = '';
  this.frame = {};
}

Scene.prototype.setScenario = function (scn) { this.scn = scn; this.bgKey = ''; };
Scene.prototype.setBatter = function (b) {
  var prev = this.bat;
  this.bat = b;
  if (!prev || prev.bats !== b.bats || prev.szTop !== b.szTop || prev.szBot !== b.szBot) { this.bgKey = ''; this.layout(); }
};
Scene.prototype.theme = function () { return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'; };

/* The camera. Two scales, on purpose.
   b is the block: a sprite pixel is b CSS pixels and a foot at the plate is
   10b, so the people, the plate and the boxes are to scale with each other.
   gppf is the GRID's pixels per foot, and it is larger: a to-scale grid next
   to a to-scale hitter leaves cells too small to tap on a phone (it was tried,
   and a 6'2" hitter filled the screen around a 39 pixel cell). So the grid is
   drawn larger than life, centred on this batter's own zone (szTop, szBot),
   with the batter standing just outside it on his side. Everything the ball
   does (the target, where it crossed, the mitt) is in grid space, so what the
   player reads off the grid is exactly what the engine played.
   The hero on the home page has no grid and draws one scale. */
Scene.prototype.layout = function () {
  var cv = this.cv, wrap = cv.parentNode;
  var W = Math.max(200, Math.floor(wrap.clientWidth)), H = Math.max(200, Math.floor(wrap.clientHeight));
  var dpr = Math.min(3, window.devicePixelRatio || 1);
  var bt = this.bat || { szTop: 3.4, szBot: 1.6, bats: 'R' };
  var thirdFt = (bt.szTop - bt.szBot) / 3;
  var bats = bt.bats || 'R';
  var side = bats === 'L' ? -1 : 1;            // the batter's side of the screen
  var b, gppf, colPx;
  if (this.hero) {
    b = Math.max(2, Math.min(6, Math.floor(H / 74)));
    gppf = b * ROWS_PER_FT;
    colPx = C.GRID.COL_FT * gppf;
  } else {
    b = Math.max(2, Math.min(8, Math.round(H * 0.56 / 64)));
    colPx = Math.floor(W * 0.58 / 5);
    colPx = Math.min(colPx, Math.floor(H * 0.56 / 5 / (thirdFt / C.GRID.COL_FT)));
    colPx = Math.max(36, Math.min(64, colPx));
    gppf = colPx / C.GRID.COL_FT;
  }
  var ppf = b * ROWS_PER_FT;
  var cols = Math.floor(W / b), rows = Math.floor(H / b);
  var gw = 2.5 * colPx, gh = 2.5 * thirdFt * gppf;
  var hipOff = this.hero ? 21 : Math.ceil(gw / b) + 5;
  var plateX;
  if (this.hero) plateX = (cols / 2 - side * Math.min(cols * 0.12, 6)) * b;
  else {
    /* the plate leans away from the batter so his body fits; what a narrow
       phone crops is his back, never the grid */
    plateX = W / 2;
    var need = (hipOff + 9) * b;
    if (side > 0) plateX = Math.min(plateX, W - need); else plateX = Math.max(plateX, need);
    plateX = Math.max(gw + 4, Math.min(W - gw - 4, plateX));
  }
  var plateCol = Math.round(plateX / b);
  var gr = rows - (this.hero ? 13 : 19);
  if (this.hero) { var headTop = gr - 64; if (headTop < 1) gr += 1 - headTop; if (gr > rows - 8) gr = rows - 8; }
  var groundY = gr * b;
  var gridCy = groundY - (bt.szTop + bt.szBot) / 2 * ppf;
  if (!this.hero) gridCy = Math.max(gh + 6, Math.min(groundY + 4 * b - gh, gridCy));
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  this.L = { W: W, H: H, dpr: dpr, b: b, ppf: ppf, gppf: gppf, colPx: colPx, thirdPx: thirdFt * gppf, cols: cols, rows: rows,
    gr: gr, plateCol: plateCol, plateX: plateCol * b, groundY: groundY, gridCy: gridCy, hipOff: hipOff, side: side, bats: bats };
  this.bgKey = '';
  return this.L;
};

/* PlatePoint (catcher's view) to the screen (pitcher's view), in grid space:
   x is mirrored, exactly as screenCol() mirrors a column. */
Scene.prototype.toScreen = function (p) {
  var L = this.L;
  return { x: L.plateX - p.x * L.gppf, y: L.gridCy - (p.zn - 0.5) * 3 * L.thirdPx };
};
/* The whole 5x5 grid's box on screen. */
Scene.prototype.gridRect = function () {
  var L = this.L;
  return { x: L.plateX - 2.5 * L.colPx, y: L.gridCy - 2.5 * L.thirdPx, w: 5 * L.colPx, h: 5 * L.thirdPx };
};
Scene.prototype.cellCenter = function (cell) { return this.toScreen(C.targetOf(cell)); };

/* where the ball leaves the pitcher's hand, on screen */
Scene.prototype.releaseAt = function (pose) {
  var P = this.pitcherBox(), rp = SP.releasePoint(pose || 'release');
  var x = P.flip ? P.x + (SP.size.pitcher.w - rp[0]) * P.b : P.x + rp[0] * P.b;
  return { x: x, y: P.y + rp[1] * P.b };
};
Scene.prototype.pitcherBox = function () {
  var L = this.L, s = SP.size.pitcher;
  var throwsL = this.scn && this.scn.pitcher && this.scn.pitcher.throws === 'L';
  var pside = -L.side;
  var midCol = L.plateCol + pside * (this.hero ? 13 : Math.ceil(2.5 * L.colPx / L.b) - 1);
  var x = (midCol - (throwsL ? s.w - s.mid : s.mid)) * L.b;
  var y = (L.gr - (this.hero ? 13 : 9)) * L.b;
  return { x: x, y: y, b: L.b, flip: throwsL };
};

Scene.prototype.paintBg = function () {
  var L = this.L, theme = this.theme();
  var key = [L.W, L.H, L.b, L.plateCol, L.gr, theme].join('|');
  if (this.bgKey === key && this.bg) return this.bg;
  var P = PARK[theme];
  var w = L.cols + 2, h = L.rows + 2, gr = L.gr, pc = L.plateCol;
  var c = mk(w, h), x = c.getContext('2d');
  function px(col, X, Y, W, Hh) { x.fillStyle = col; x.fillRect(X, Y, W || 1, Hh || 1); }
  var standsTop = Math.max(this.hero ? gr - 58 : 4, gr - 110), wallTop = gr - 33, trackTop = gr - 27, grassTop = gr - 24;
  /* sky in three bands */
  var sb = Math.max(0, standsTop);
  for (var i = 0; i < 3; i++) px(P.sky[i], 0, Math.floor(sb * i / 3), w, Math.ceil(sb / 3) + 1);
  /* the crowd: heads, shirts, seat backs, one seat row every four */
  for (var Y = Math.max(0, standsTop); Y < wallTop; Y++) {
    var ry = (Y - standsTop) % 4;
    for (var X = 0; X < w; X++) {
      var hsh = hash2(X >> 1, (Y - standsTop) >> 2);
      if (ry === 3) { px(P.aisle, X, Y); continue; }
      if (hsh < 0.16) { px(P.seat, X, Y); continue; }
      if (ry === 0) px((X & 1) ? P.seat : P.head[Math.floor(hash2(X, Y) * P.head.length)], X, Y);
      else px(P.crowd[Math.floor(hsh * 997) % P.crowd.length], X, Y);
    }
  }
  /* depth: the upper deck sits in haze */
  x.fillStyle = theme === 'dark' ? 'rgba(7,11,22,.38)' : 'rgba(207,226,242,.30)';
  x.fillRect(0, standsTop, w, Math.floor((wallTop - standsTop) / 2));
  /* the upper deck's facing, when there is room for one */
  if (wallTop - standsTop > 50) {
    var deck = standsTop + Math.floor((wallTop - standsTop) * 0.42);
    px(theme === 'dark' ? '#1b2333' : '#5a6475', 0, deck, w, 3);
    px(theme === 'dark' ? '#2b3a55' : '#7d8899', 0, deck, w, 1);
  }
  /* the backstop net */
  x.fillStyle = theme === 'dark' ? 'rgba(200,210,230,.07)' : 'rgba(40,50,70,.08)';
  for (var nx = pc % 3; nx < w; nx += 3) x.fillRect(nx, standsTop, 1, wallTop - standsTop);
  /* wall, rail, track, grass, the home circle */
  px(P.wall, 0, wallTop, w, trackTop - wallTop);
  px(P.rail, 0, wallTop, w, 1);
  px(P.track, 0, trackTop, w, grassTop - trackTop);
  for (var gy = grassTop; gy < h; gy++) px(P.grass[(Math.floor((gy - grassTop) / 3)) & 1], 0, gy, w, 1);
  x.fillStyle = P.dirt;
  x.beginPath(); x.ellipse(pc + 0.5, gr + 1, w * 0.95, 15, 0, 0, Math.PI * 2); x.fill();
  /* dirt texture */
  for (var ty = gr - 14; ty < gr + 16; ty++) for (var tx = 0; tx < w; tx++) {
    if (hash2(tx + 91, ty + 17) < 0.07) {
      var d = (tx - pc - 0.5) / (w * 0.95), e = (ty - gr - 1) / 15;
      if (d * d + e * e < 1) px(P.dirt2, tx, ty);
    }
  }
  /* the grass between the home circle and the mound, then the mound */
  x.fillStyle = P.grass[1];
  x.fillRect(0, gr + 9, w, h);
  x.fillStyle = P.mound;
  x.beginPath(); x.ellipse(pc + 0.5 - L.side * 13, h + 14, w * 0.75, 18, 0, 0, Math.PI * 2); x.fill();
  /* the batter's boxes: chalk, foreshortened toward the camera */
  x.fillStyle = P.chalk;
  [-1, 1].forEach(function (s) {
    var inner = pc + s * 12, outer = pc + s * 36;
    for (var yy = gr - 4; yy <= gr + 4; yy++) {
      var k = (yy - (gr - 4)) / 8;
      px(P.chalk, Math.round(inner + s * k * 1.5), yy);
      px(P.chalk, Math.round(outer + s * k * 5), yy);
    }
    x.fillRect(Math.min(inner, outer), gr - 4, Math.abs(outer - inner), 1);
    x.fillRect(Math.min(inner + s * 1.5, outer + s * 5), gr + 4, Math.abs(outer - inner) + 4, 1);
  });
  /* the plate, seen from the mound: a white slab with its point away */
  x.fillStyle = P.plate;
  x.fillRect(pc - 7, gr, 15, 1);
  x.fillRect(pc - 7, gr + 1, 15, 1);
  x.fillStyle = theme === 'dark' ? '#c9c4b8' : '#dcd8cc';
  x.fillRect(pc - 6, gr - 1, 13, 1);
  this.bg = c; this.bgKey = key;
  return c;
};

function blit(ctx, img, x, y, b, flip) {
  ctx.save();
  if (flip) { ctx.translate(x + img.width * b, y); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, img.width * b, img.height * b); }
  else ctx.drawImage(img, x, y, img.width * b, img.height * b);
  ctx.restore();
}

/* A ball: a pixel disc with a seam, at a pixel unit of half a block. */
var BALLS = {};
function ballSprite(rUnits) {
  var r = Math.max(2, Math.round(rUnits));
  if (BALLS[r]) return BALLS[r];
  var d = r * 2 + 1, c = mk(d, d), x = c.getContext('2d');
  for (var yy = 0; yy < d; yy++) for (var xx = 0; xx < d; xx++) {
    var dx = xx - r, dy = yy - r, q = (dx * dx + dy * dy) / (r * r + 0.6);
    if (q > 1) continue;
    var lit = -dx * 0.5 - dy * 0.7;
    x.fillStyle = q > 0.72 ? (lit > 0 ? '#d9d4c8' : '#a9a397') : lit > r * 0.45 ? '#ffffff' : '#efebe2';
    x.fillRect(xx, yy, 1, 1);
  }
  if (r >= 3) {
    x.fillStyle = '#c4473a';
    for (var s = -r + 1; s <= r - 1; s += 2) { x.fillRect(Math.round(r - r * 0.45 + Math.abs(s) * 0.25), r + s, 1, 1); x.fillRect(Math.round(r + r * 0.45 - Math.abs(s) * 0.25), r + s, 1, 1); }
  }
  BALLS[r] = c;
  return c;
}

/* frame: {pitcher, batter, umpire, mitt:{x,y}|null, ball:{x,y,r,trail:[]}|null,
           marker:{x,y}|null, shake} */
Scene.prototype.draw = function (frame) {
  if (!this.L) this.layout();
  frame = frame || this.frame || {};
  this.frame = frame;
  var L = this.L, ctx = this.ctx, b = L.b;
  var colors = this.scn && this.scn.pitcher && this.scn.pitcher.teamColors;
  ctx.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, L.W, L.H);
  ctx.save();
  if (frame.shake) ctx.translate(Math.round(frame.shake), 0);
  ctx.drawImage(this.paintBg(), 0, 0, (L.cols + 2) * b, (L.rows + 2) * b);
  var theme = this.theme();
  if (theme === 'dark') {
    /* the light towers, off the top corners */
    [[0.08, 0], [0.92, 0]].forEach(function (p) {
      var g = ctx.createRadialGradient(L.W * p[0], -10, 4, L.W * p[0], -10, L.W * 0.55);
      g.addColorStop(0, PARK.dark.glow + '0.22)'); g.addColorStop(1, PARK.dark.glow + '0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, L.W, L.H);
    });
  }
  var S = SP.size;
  /* the umpire, over the catcher's shoulder on the side away from the batter
     (the slot is on the batter's side, but from the mound the batter would
     hide him), then the catcher */
  var ump = SP.get('umpire', frame.umpire || 'set');
  var umpX = (L.plateCol - L.side * 3 - S.umpire.mid) * b, umpY = (L.gr - 5 - S.umpire.ground) * b;
  shadow(ctx, umpX + S.umpire.mid * b, (L.gr - 5) * b, 9 * b, 1.6 * b);
  blit(ctx, ump, umpX, umpY, b, false);
  var cat = SP.get('catcher', 'set', null, 'them');
  var catX = (L.plateCol - S.catcher.mid) * b, catY = (L.gr - 2 - S.catcher.ground) * b;
  shadow(ctx, L.plateX, (L.gr - 2) * b, 12 * b, 1.8 * b);
  blit(ctx, cat, catX, catY, b, false);
  /* the mitt, on the end of a forearm from his left shoulder */
  var mitt = frame.mitt || this.cellCenter(C.cellOf(3, 2));
  var shX = catX + S.catcher.shoulder[0] * b, shY = catY + S.catcher.shoulder[1] * b;
  pixLine(ctx, shX, shY, mitt.x + 2 * b, mitt.y + 2 * b, b, '#e9e6df', 2);
  blit(ctx, SP.get('mitt', 'x'), Math.round(mitt.x / b - 6) * b, Math.round(mitt.y / b - 6) * b, b, false);
  /* the batter */
  var bt = SP.get('batter', frame.batter || 'stance', null, 'them');
  var flipB = L.bats === 'L';
  var anchor = L.plateCol + L.side * L.hipOff;
  var bx = (flipB ? anchor - (S.batter.w - S.batter.hip) : anchor - S.batter.hip) * b;
  var by = (L.gr + 1 - S.batter.ground) * b;
  shadow(ctx, anchor * b, (L.gr + 1) * b, 14 * b, 2 * b);
  blit(ctx, bt, bx, by, b, flipB);
  /* where it went */
  if (frame.marker) ring(ctx, frame.marker.x, frame.marker.y, b);
  /* the ball, behind the pitcher only while it is still in his hand */
  var ballFirst = frame.ball && frame.ball.behindPitcher;
  if (ballFirst) drawBall(ctx, frame.ball, b);
  var P = this.pitcherBox();
  blit(ctx, SP.get('pitcher', frame.pitcher || 'set', colors, 'us'), P.x, P.y, b, P.flip);
  if (frame.ball && !ballFirst) drawBall(ctx, frame.ball, b);
  ctx.restore();
};

function shadow(ctx, cx, cy, rx, ry) {
  ctx.fillStyle = 'rgba(0,0,0,.22)';
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
}
function ring(ctx, x, y, b) {
  var u = Math.max(2, Math.round(b / 2)), r = 3;
  ctx.fillStyle = 'rgba(0,0,0,.55)';
  for (var a = 0; a < 16; a++) {
    var t = a / 16 * Math.PI * 2;
    ctx.fillRect(Math.round(x + Math.cos(t) * r * u - u / 2) + 1, Math.round(y + Math.sin(t) * r * u - u / 2) + 1, u, u);
  }
  ctx.fillStyle = '#fff6d6';
  for (var a2 = 0; a2 < 16; a2++) {
    var t2 = a2 / 16 * Math.PI * 2;
    ctx.fillRect(Math.round(x + Math.cos(t2) * r * u - u / 2), Math.round(y + Math.sin(t2) * r * u - u / 2), u, u);
  }
}
function pixLine(ctx, x0, y0, x1, y1, b, col, thick) {
  var n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / b));
  ctx.fillStyle = col;
  for (var i = 0; i <= n; i++) {
    var t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
    ctx.fillRect(Math.round(x / b) * b - b, Math.round(y / b) * b - b, thick * b, thick * b);
  }
}
function drawBall(ctx, ball, b) {
  var u = Math.max(1, Math.round(b / 2));
  (ball.trail || []).forEach(function (t, i, a) {
    ctx.globalAlpha = 0.12 + 0.12 * (i / a.length);
    var sp = ballSprite(t.r / u);
    ctx.drawImage(sp, Math.round(t.x - sp.width * u / 2), Math.round(t.y - sp.height * u / 2), sp.width * u, sp.height * u);
  });
  ctx.globalAlpha = 1;
  var s = ballSprite(ball.r / u);
  if (ball.shadow) {
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.beginPath(); ctx.ellipse(ball.x + 3, ball.y + ball.r + 2, ball.r * 0.9, ball.r * 0.35, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.drawImage(s, Math.round(ball.x - s.width * u / 2), Math.round(ball.y - s.height * u / 2), s.width * u, s.height * u);
}

/* ---- the grid: throw grid and heat map in one ------------------------------- */

var HEAT = {
  damage: { lo: 0.15, hi: 0.45, label: 'damage on contact', fmt: function (v) { return v >= 1 ? v.toFixed(3) : v.toFixed(3).replace(/^0/, ''); } },
  swing: { lo: 0.1, hi: 0.8, label: 'swing rate', fmt: function (v) { return Math.round(v * 100) + '%'; } },
};
function heatColor(t, a) {
  /* cool (good for the pitcher) to hot (bad for him) */
  var cool = [59, 111, 216], mid = [232, 226, 212], hot = [221, 64, 52];
  var c = t < 0.5 ? cool.map(function (v, i) { return v + (mid[i] - v) * t * 2; }) : mid.map(function (v, i) { return v + (hot[i] - v) * (t - 0.5) * 2; });
  return 'rgba(' + c.map(Math.round).join(',') + ',' + a + ')';
}

/* opts: {mini, onPick(cell)} */
function Grid(host, opts) {
  opts = opts || {};
  this.opts = opts;
  this.el = document.createElement('div');
  this.el.className = 'grid' + (opts.mini ? ' mini' : '');
  this.el.setAttribute('role', opts.mini ? 'img' : 'group');
  this.cells = [];
  this.bats = 'R';
  var self = this;
  for (var cell = 0; cell < C.GRID.CELLS; cell++) {
    var b = document.createElement(opts.mini ? 'span' : 'button');
    if (!opts.mini) b.type = 'button';
    b.className = 'cell' + (C.inZone(cell) ? ' zone' : ' chase');
    b.dataset.cell = cell;
    /* pitcher's view: the column on screen is screenCol(), the row is the row */
    b.style.left = (C.screenCol(cell) * 20) + '%';
    b.style.top = (C.rowOf(cell) * 20) + '%';
    b.innerHTML = '<i class="hv"></i>';
    if (!opts.mini) b.addEventListener('click', (function (c) { return function () { if (!self.disabled && opts.onPick) opts.onPick(c); }; })(cell));
    this.el.appendChild(b);
    this.cells.push(b);
  }
  var zone = document.createElement('span');
  zone.className = 'zonebox';
  this.el.appendChild(zone);
  host.appendChild(this.el);
  this.setHand('R');
}
Grid.prototype.place = function (r) {
  var s = this.el.style;
  s.left = r.x + 'px'; s.top = r.y + 'px'; s.width = r.w + 'px'; s.height = r.h + 'px';
};
Grid.prototype.setHand = function (bats) {
  this.bats = bats;
  for (var i = 0; i < this.cells.length; i++) this.cells[i].setAttribute('aria-label', cellWords(i, bats));
};
Grid.prototype.setDisabled = function (d) { this.disabled = !!d; this.el.classList.toggle('off', !!d); };
Grid.prototype.setSelected = function (cell) {
  for (var i = 0; i < this.cells.length; i++) {
    this.cells[i].classList.toggle('sel', i === cell);
    if (!this.opts.mini) this.cells[i].setAttribute('aria-pressed', i === cell ? 'true' : 'false');
  }
};
/* marks: {target, actual, best} cells; any can be null */
Grid.prototype.setMarks = function (m) {
  m = m || {};
  for (var i = 0; i < this.cells.length; i++) {
    var c = this.cells[i];
    c.classList.toggle('m-target', m.target === i);
    c.classList.toggle('m-actual', m.actual === i);
    c.classList.toggle('m-best', m.best === i);
  }
};
/* mode: 'damage' | 'swing' | null, from the batter's profile */
Grid.prototype.setHeat = function (profile, mode) {
  this.el.classList.toggle('heat', !!mode);
  this.heatMode = mode;
  var H = mode && HEAT[mode], arr = mode === 'damage' ? profile && profile.heat : mode === 'swing' ? profile && profile.swing : null;
  for (var i = 0; i < this.cells.length; i++) {
    var c = this.cells[i], hv = c.firstChild;
    if (!H || !arr || arr[i] == null) { c.style.background = ''; hv.textContent = ''; continue; }
    var t = Math.max(0, Math.min(1, (arr[i] - H.lo) / (H.hi - H.lo)));
    c.style.background = heatColor(t, this.opts.mini ? 0.85 : 0.62);
    hv.textContent = H.fmt(arr[i]);
  }
};

window.STD_MOUND = { Scene: Scene, Grid: Grid, cellWords: cellWords, HEAT: HEAT, heatColor: heatColor, ROWS_PER_FT: ROWS_PER_FT };
})();
