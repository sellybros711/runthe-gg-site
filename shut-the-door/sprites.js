/* Shut The Door: the people, drawn.
 *
 * window.STD_SPRITES. Pixel figures painted on a canvas, the way Run The Tour's
 * PXHD and Run The Floor's baller are: every part is a filled shape with a
 * surface normal, one light from the top left picks a tone off a five step
 * ramp, and the outline is one pixel INSIDE the silhouette in the part's own
 * shadow colour rather than a black ring. Nothing here is copied from those
 * files; the idea is.
 *
 * Four people, all generic. No logos, no numbers, no faces of anybody real.
 *   batter   seen from the mound, facing the plate. Drawn as a right-handed
 *            hitter (he stands on the screen's right in the pitcher's view and
 *            faces left); a left-handed hitter is the same canvas flipped.
 *   pitcher  seen from behind, as the camera stands behind the mound. Drawn
 *            right-handed (throwing arm on the screen's right); flipped for a
 *            lefty.
 *   catcher  crouched behind the plate, facing the camera. His mitt is drawn
 *            apart (mitt()), so the scene can put it wherever the ball goes.
 *   umpire   behind the catcher, facing the camera.
 *
 * One sprite pixel is one block on screen; the scene picks the block size.
 * Every figure is a pose name plus colours, cached as a small canvas, so an
 * animation is a flip between cached frames and costs nothing per frame.
 *
 * Scale: 10 sprite rows to the foot (1.2 inches a row), so a 6'2" hitter is
 * about 62 rows, and the strike zone the scene draws beside him is in the same
 * units.
 */
(function () {
'use strict';

/* ---- colour ---------------------------------------------------------- */

function hexRgb(h) {
  h = String(h || '#888888').replace('#', '');
  if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
  var n = parseInt(h, 16);
  if (!isFinite(n)) n = 0x888888;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbHex(c) {
  return '#' + c.map(function (v) {
    v = Math.max(0, Math.min(255, Math.round(v)));
    return (v < 16 ? '0' : '') + v.toString(16);
  }).join('');
}
function mix(a, b, t) {
  var x = hexRgb(a), y = hexRgb(b);
  return rgbHex(x.map(function (v, i) { return v + (y[i] - v) * t; }));
}
function lum(hex) {
  var c = hexRgb(hex);
  return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
}
/* Five tones: deep, shade, base, light, spec. Shadows drift cool, lights
   drift warm, as PXHD does it, so a white jersey shades lavender rather than
   grey mud. Skin drifts red in the shade. */
var RAMPS = {};
function ramp(hex, skin) {
  var key = hex + (skin ? 's' : '');
  if (RAMPS[key]) return RAMPS[key];
  var cool = skin ? '#5a2338' : '#24264f', warm = skin ? '#fff0d6' : '#fff6dc';
  var dark = lum(hex) < 0.2;
  var r = [
    mix(mix(hex, '#000000', dark ? 0.35 : 0.42), cool, 0.22),
    mix(mix(hex, '#000000', dark ? 0.16 : 0.2), cool, 0.1),
    hex,
    mix(mix(hex, '#ffffff', dark ? 0.12 : 0.16), warm, 0.1),
    mix(mix(hex, '#ffffff', dark ? 0.24 : 0.34), warm, 0.24),
  ];
  RAMPS[key] = r;
  return r;
}

/* ---- the grid of parts ------------------------------------------------ */

var LIGHT = (function () { var v = [-0.5, -0.72, 0.62], l = Math.hypot(v[0], v[1], v[2]); return v.map(function (a) { return a / l; }); })();

function Spr(w, h) { this.w = w; this.h = h; this.g = new Array(w * h).fill(null); this.z = 0; }
/* shape: {mask(x, y), n(x, y)}; mat: {c, skin, t, flat} */
Spr.prototype.fill = function (shape, mat, opt) {
  var z = ++this.z, w = this.w, h = this.h;
  var bb = shape.bb || [0, 0, w - 1, h - 1];
  var x0 = Math.max(0, Math.floor(bb[0])), y0 = Math.max(0, Math.floor(bb[1]));
  var x1 = Math.min(w - 1, Math.ceil(bb[2])), y1 = Math.min(h - 1, Math.ceil(bb[3]));
  for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
    if (!shape.mask(x + 0.5, y + 0.5)) continue;
    if (opt && opt.under && this.g[y * w + x]) continue;
    this.g[y * w + x] = { m: mat, n: shape.n, z: z };
  }
};
Spr.prototype.dot = function (x, y, mat, tone) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
  this.g[y * this.w + x] = { m: mat, n: null, z: ++this.z, t: tone == null ? 2 : tone };
};
Spr.prototype.erase = function (shape) {
  for (var y = 0; y < this.h; y++) for (var x = 0; x < this.w; x++) if (shape.mask(x + 0.5, y + 0.5)) this.g[y * this.w + x] = null;
};

function toneOf(c, x, y) {
  if (c.t != null) return c.t;
  if (c.m.t != null) return c.m.t;
  var n = c.n ? c.n(x + 0.5, y + 0.5) : [0, 0, 1];
  var l = Math.hypot(n[0], n[1], n[2]) || 1;
  var d = (n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]) / l;
  var t = d > 0.93 ? (c.m.gloss ? 4 : 3) : d > 0.72 ? 3 : d > 0.32 ? 2 : d > -0.05 ? 1 : 0;
  return t;
}

Spr.prototype.paint = function () {
  var w = this.w, h = this.h, g = this.g, T = new Array(w * h);
  var i, x, y, c, o;
  for (i = 0; i < w * h; i++) T[i] = g[i] ? toneOf(g[i], i % w, (i / w) | 0) : -1;
  var at = function (xx, yy) { return xx < 0 || yy < 0 || xx >= w || yy >= h ? null : g[yy * w + xx]; };
  var out = new Array(w * h).fill(null);
  for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
    i = y * w + x; c = g[i]; if (!c) continue;
    var t = T[i];
    var flat = c.m.flat || c.t != null || c.m.t != null;
    if (!flat) {
      /* a part in front casts onto the one behind it: one tone down */
      var nb = [[0, -1], [-1, 0], [1, 0]];
      for (var k = 0; k < nb.length; k++) {
        o = at(x + nb[k][0], y + nb[k][1]);
        if (o && o.m !== c.m && o.z > c.z && !o.m.noCast) { t = Math.max(0, t - 1); break; }
      }
      /* the soft outline, inside the silhouette */
      var below = !at(x, y + 1), right = !at(x + 1, y), above = !at(x, y - 1), left = !at(x - 1, y);
      if (below || right) t = Math.max(0, Math.min(t - 1, 1));
      else if (above || left) t = Math.max(0, Math.min(t - 1, 2));
      else {
        /* the contour where this part sits over another */
        for (var k2 = 0; k2 < 3; k2++) {
          var dd = [[0, 1], [1, 0], [-1, 0]][k2];
          o = at(x + dd[0], y + dd[1]);
          if (o && o.m !== c.m && o.z < c.z && !c.m.noLine) { t = Math.min(t, 1); break; }
        }
      }
    }
    var r = c.m.ramp || (c.m.ramp = ramp(c.m.c, c.m.skin));
    out[i] = r[Math.max(0, Math.min(4, t))];
  }
  var cv = mkCanvas(w, h), cx = cv.getContext('2d');
  for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
    var col = out[y * w + x]; if (!col) continue;
    cx.fillStyle = col; cx.fillRect(x, y, 1, 1);
  }
  return cv;
};

function mkCanvas(w, h) {
  var c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}

/* ---- shapes ----------------------------------------------------------- */

function ell(cx, cy, rx, ry) {
  return {
    bb: [cx - rx - 1, cy - ry - 1, cx + rx + 1, cy + ry + 1],
    mask: function (x, y) { var a = (x - cx) / rx, b = (y - cy) / ry; return a * a + b * b <= 1; },
    n: function (x, y) { var a = (x - cx) / rx, b = (y - cy) / ry; return [a, b, Math.sqrt(Math.max(0.03, 1 - a * a - b * b))]; },
  };
}
function seg(ax, ay, bx, by, ra, rb) {
  if (rb == null) rb = ra;
  var dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
  var r = Math.max(ra, rb);
  function near(x, y) {
    var t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2));
    var px = ax + t * dx, py = ay + t * dy, rr = ra + (rb - ra) * t;
    return [x - px, y - py, rr];
  }
  return {
    bb: [Math.min(ax, bx) - r - 1, Math.min(ay, by) - r - 1, Math.max(ax, bx) + r + 1, Math.max(ay, by) + r + 1],
    mask: function (x, y) { var q = near(x, y); return q[0] * q[0] + q[1] * q[1] <= q[2] * q[2]; },
    n: function (x, y) { var q = near(x, y); var a = q[0] / q[2], b = q[1] / q[2]; return [a, b, Math.sqrt(Math.max(0.03, 1 - a * a - b * b))]; },
  };
}
function poly(pts, n) {
  var xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
  var cx = (Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2;
  var rx = (Math.max.apply(null, xs) - Math.min.apply(null, xs)) / 2 + 0.8;
  return {
    bb: [Math.min.apply(null, xs) - 1, Math.min.apply(null, ys) - 1, Math.max.apply(null, xs) + 1, Math.max.apply(null, ys) + 1],
    mask: function (x, y) {
      var c = false;
      for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        var xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
        if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c;
      }
      return c;
    },
    /* a torso reads as a vertical cylinder */
    n: n || function (x) { var a = (x - cx) / rx; return [a, -0.15, Math.sqrt(Math.max(0.05, 1 - a * a))]; },
  };
}
function rect(x0, y0, x1, y1) {
  return { bb: [x0, y0, x1, y1], mask: function (x, y) { return x >= x0 && x <= x1 && y >= y0 && y <= y1; }, n: null };
}
function and(a, b) {
  return { bb: a.bb, n: a.n, mask: function (x, y) { return a.mask(x, y) && b.mask(x, y); } };
}

/* ---- materials -------------------------------------------------------- */

function M(c, o) { var m = { c: c }; if (o) for (var k in o) m[k] = o[k]; return m; }

var SKIN = '#b98260';
var WOOD = '#c99a5f';

/* Team colours from the scenario (pitcher.teamColors). The batting team is
   never named in a scenario's colours, so it wears a plain home white with a
   charcoal trim, which nobody owns. */
function kit(colors, role) {
  var a = (colors && colors[0]) || '#1d3b6b', b = (colors && colors[1]) || '#d9a441';
  if (role === 'them') return { jersey: '#e9e6df', trim: '#3a4150', pants: '#e2ded6', helmet: '#2e3440', sock: '#3a4150' };
  return { jersey: a, trim: b, pants: '#ddd9d0', helmet: a, sock: a, cap: a };
}

/* ---- the batter (right-handed, facing the screen's left) -------------- */

var BW = 66, BH = 86, BG = 84;   // ground row
/* Joints per pose. f = front (the side toward the pitcher), b = back. */
var BATTER = {
  stance: {
    aF: [27, 81], kF: [26, 69], hF: [31, 57], aB: [46, 81], kB: [45, 69], hB: [41, 57],
    sF: [30, 37], sB: [43, 36], head: [36, 27],
    eF: [36, 43], hnF: [46, 33], eB: [52, 37], hnB: [47, 30], bat: [57, 9], batBehind: true,
  },
  load: {
    aF: [29, 78], kF: [27, 66], hF: [32, 57], aB: [46, 81], kB: [46, 69], hB: [42, 57],
    sF: [31, 37], sB: [44, 36], head: [37, 27],
    eF: [38, 43], hnF: [49, 34], eB: [54, 37], hnB: [50, 31], bat: [61, 12], batBehind: true,
  },
  swingHi: {
    aF: [25, 81], kF: [25, 69], hF: [31, 57], aB: [44, 80], kB: [40, 70], hB: [39, 57],
    sF: [31, 37], sB: [41, 38], head: [35, 28],
    eF: [27, 40], hnF: [24, 42], eB: [32, 44], hnB: [26, 41], bat: [2, 38], batBehind: false,
  },
  swingMid: {
    aF: [25, 81], kF: [25, 69], hF: [31, 57], aB: [44, 80], kB: [40, 70], hB: [39, 57],
    sF: [31, 37], sB: [41, 38], head: [35, 28],
    eF: [28, 44], hnF: [25, 49], eB: [32, 47], hnB: [27, 48], bat: [2, 51], batBehind: false,
  },
  swingLo: {
    aF: [25, 81], kF: [25, 69], hF: [31, 57], aB: [44, 80], kB: [40, 70], hB: [39, 57],
    sF: [31, 38], sB: [41, 39], head: [35, 29],
    eF: [29, 47], hnF: [27, 54], eB: [33, 50], hnB: [29, 53], bat: [4, 64], batBehind: false,
  },
  /* running to first, the bat dropped: two frames, arms and legs swapped */
  runA: {
    aF: [22, 79], kF: [26, 69], hF: [32, 58], aB: [46, 75], kB: [42, 68], hB: [38, 58],
    sF: [30, 38], sB: [40, 38], head: [34, 28],
    eF: [26, 46], hnF: [22, 40], eB: [45, 45], hnB: [48, 39], noBat: true,
  },
  runB: {
    aF: [41, 80], kF: [38, 69], hF: [36, 58], aB: [27, 74], kB: [30, 67], hB: [33, 58],
    sF: [30, 38], sB: [40, 38], head: [34, 28],
    eF: [43, 46], hnF: [46, 40], eB: [28, 46], hnB: [24, 40], noBat: true,
  },
  follow: {
    aF: [25, 81], kF: [25, 69], hF: [31, 57], aB: [42, 79], kB: [37, 70], hB: [38, 57],
    sF: [31, 37], sB: [40, 38], head: [34, 27],
    eF: [24, 36], hnF: [27, 29], eB: [31, 41], hnB: [28, 31], bat: [49, 17], batBehind: true,
  },
};

function drawLeg(s, hip, knee, ankle, k, front) {
  var pants = M(k.pants), sock = M(k.sock), shoe = M('#23252b', { gloss: 1 });
  s.fill(seg(hip[0], hip[1], knee[0], knee[1], 3.4, 3.0), pants);
  var mid = [knee[0] + (ankle[0] - knee[0]) * 0.45, knee[1] + (ankle[1] - knee[1]) * 0.45];
  s.fill(seg(knee[0], knee[1], mid[0], mid[1], 2.9, 2.6), pants);
  s.fill(seg(mid[0], mid[1], ankle[0], ankle[1], 2.4, 2.1), sock);
  s.fill(ell(ankle[0] + (front ? -1 : 0.5), ankle[1] + 1.5, 3.4, 1.8), shoe);
}
function drawArm(s, sh, el, hand, k, glove) {
  s.fill(seg(sh[0], sh[1], el[0], el[1], 2.5, 2.2), M(k.jersey));
  s.fill(seg(el[0], el[1], hand[0], hand[1], 2.0, 1.8), M(SKIN, { skin: 1 }));
  s.fill(ell(hand[0], hand[1], 2.0, 1.9), M(glove || '#2b2f38'));
}
function drawBat(s, hand, end) {
  var dx = end[0] - hand[0], dy = end[1] - hand[1];
  var mid = [hand[0] + dx * 0.45, hand[1] + dy * 0.45];
  var knob = [hand[0] - dx * 0.08, hand[1] - dy * 0.08];
  var m = M(WOOD, { gloss: 1 });
  s.fill(seg(knob[0], knob[1], mid[0], mid[1], 0.8, 0.95), m);
  s.fill(seg(mid[0], mid[1], end[0], end[1], 1.0, 1.65), m);
}
function drawHelmetHead(s, head, k, facing) {
  var hx = head[0], hy = head[1];
  s.fill(seg(hx + 0.5, hy + 4, hx + 0.5, hy + 8, 2.1), M(SKIN, { skin: 1 }));        // neck
  s.fill(ell(hx, hy + 0.5, 4.6, 5.4), M(SKIN, { skin: 1 }));                         // head
  var helm = M(k.helmet, { gloss: 1 });
  s.fill(and(ell(hx, hy - 0.6, 5.3, 5.0), rect(hx - 7, hy - 7, hx + 7, hy - 0.2)), helm);
  /* the ear flap on the side toward the pitcher, and the brim over the eyes */
  s.fill(ell(hx + facing * 3.6, hy + 1, 2.2, 2.8), helm);
  s.fill(seg(hx - 4.4, hy - 0.6, hx + 4.2, hy - 0.6, 0.9), M(mix(k.helmet, '#000000', 0.25)));
  var ink = M('#1a1412', { t: 1, flat: 1 });
  s.dot(hx - 1.8, hy + 1.5, ink, 1); s.dot(hx + 1.2, hy + 1.5, ink, 1);
  s.dot(hx - 0.4, hy + 3.6, M(mix(SKIN, '#5a2338', 0.45), { flat: 1 }), 2);
}

function batter(pose, k) {
  var J = BATTER[pose] || BATTER.stance;
  var s = new Spr(BW, BH);
  if (J.batBehind && !J.noBat) drawBat(s, J.hnB, J.bat);
  drawLeg(s, J.hB, J.kB, J.aB, k, false);
  drawArm(s, J.sB, J.eB, J.hnB, k);
  drawLeg(s, J.hF, J.kF, J.aF, k, true);
  /* torso: chest facing the plate, belt across the hips */
  var tor = poly([[J.sF[0] - 2, J.sF[1] - 1], [J.sB[0] + 2, J.sB[1] - 1], [J.hB[0] + 2.5, J.hB[1] + 1], [J.hF[0] - 2.5, J.hF[1] + 1]]);
  s.fill(tor, M(k.jersey));
  s.fill(seg(J.hF[0] - 2.5, J.hF[1] - 1, J.hB[0] + 2.5, J.hB[1] - 1, 1.1), M('#24262c'));
  /* the jersey's placket in the trim colour, so a white shirt has a front */
  var px = (J.sF[0] + J.sB[0]) / 2 - 3, py = (J.sF[1] + J.sB[1]) / 2;
  s.fill(seg(px, py + 1, px - 0.6, J.hF[1] - 3, 0.5), M(k.trim, { flat: 1, t: 2 }));
  drawHelmetHead(s, J.head, k, -1);
  drawArm(s, J.sF, J.eF, J.hnF, k);
  if (!J.batBehind && !J.noBat) drawBat(s, J.hnF, J.bat);
  return s.paint();
}

/* ---- the pitcher from behind (right-handed) --------------------------- */

var PW = 60, PH = 74, PG = 72;
var PITCHER = {
  set: {
    aL: [24, 70], kL: [24, 57], hL: [25, 44], aR: [36, 70], kR: [36, 57], hR: [35, 44],
    sL: [20, 22], sR: [40, 22], head: [30, 12],
    eL: [16, 32], hnL: [24, 34], eR: [44, 32], hnR: [36, 34], hide: true,
  },
  kick: {
    aL: [21, 54], kL: [19, 43], hL: [25, 44], aR: [35, 70], kR: [35, 57], hR: [34, 44],
    sL: [21, 22], sR: [39, 22], head: [30, 12],
    eL: [17, 31], hnL: [25, 31], eR: [43, 31], hnR: [35, 31], hide: true,
  },
  cock: {
    aL: [18, 62], kL: [16, 52], hL: [24, 45], aR: [38, 69], kR: [38, 57], hR: [34, 45],
    sL: [20, 23], sR: [40, 22], head: [29, 13],
    eL: [12, 21], hnL: [8, 16], eR: [48, 27], hnR: [53, 21], ball: true,
  },
  release: {
    aL: [19, 61], kL: [17, 51], hL: [24, 46], aR: [37, 66], kR: [37, 56], hR: [34, 46],
    sL: [20, 26], sR: [39, 25], head: [29, 16],
    eL: [14, 34], hnL: [20, 35], eR: [42, 13], hnR: [35, 4], ball: true,
  },
  follow: {
    aL: [19, 61], kL: [18, 51], hL: [24, 47], aR: [44, 50], kR: [38, 55], hR: [34, 47],
    sL: [20, 28], sR: [38, 27], head: [27, 19],
    eL: [13, 37], hnL: [18, 39], eR: [31, 38], hnR: [20, 46],
  },
};
/* where the ball leaves his hand, in sprite pixels, per pose */
function releasePoint(pose) { var J = PITCHER[pose] || PITCHER.release; return [J.hnR[0], J.hnR[1]]; }

function pitcher(pose, k) {
  var J = PITCHER[pose] || PITCHER.set;
  var s = new Spr(PW, PH);
  var jer = M(k.jersey), skin = M(SKIN, { skin: 1 }), glove = M('#6b4526');
  /* the arms that reach forward go in first: from behind, the torso hides them */
  if (J.hide) {
    s.fill(seg(J.sL[0], J.sL[1], J.eL[0], J.eL[1], 2.8, 2.4), jer);
    s.fill(seg(J.eL[0], J.eL[1], J.hnL[0], J.hnL[1], 2.2), skin);
    s.fill(seg(J.sR[0], J.sR[1], J.eR[0], J.eR[1], 2.8, 2.4), jer);
    s.fill(seg(J.eR[0], J.eR[1], J.hnR[0], J.hnR[1], 2.2), skin);
  }
  drawLeg(s, J.hL, J.kL, J.aL, k, true);
  drawLeg(s, J.hR, J.kR, J.aR, k, false);
  var tor = poly([[J.sL[0] - 1, J.sL[1] - 2], [J.sR[0] + 1, J.sR[1] - 2], [J.hR[0] + 3.5, J.hR[1] + 1], [J.hL[0] - 3.5, J.hL[1] + 1]]);
  s.fill(tor, jer);
  s.fill(seg(J.hL[0] - 3.5, J.hL[1] - 1.5, J.hR[0] + 3.5, J.hR[1] - 1.5, 1.2), M('#24262c'));
  /* a trim stripe down the back seam's sides, so a plain back has a shape */
  s.fill(seg(J.sL[0] + 1, J.sL[1] - 1, J.sR[0] - 1, J.sR[1] - 1, 0.7), M(k.trim, { t: 2, flat: 1 }));
  /* head from behind: neck, hair, the back of the cap and its button */
  var hx = J.head[0], hy = J.head[1];
  s.fill(seg(hx, hy + 4, hx, hy + 9, 2.8), skin);
  s.fill(ell(hx, hy + 1, 5.0, 5.6), M('#3a2a20'));
  s.fill(ell(hx - 4.8, hy + 2, 1.2, 1.8), skin);
  s.fill(ell(hx + 4.8, hy + 2, 1.2, 1.8), skin);
  var cap = M(k.cap || k.jersey, { gloss: 1 });
  s.fill(and(ell(hx, hy - 0.5, 5.6, 5.4), rect(hx - 7, hy - 7, hx + 7, hy + 1.2)), cap);
  s.fill(rect(hx - 1.5, hy + 0.2, hx + 1.5, hy + 1.2), M(mix(k.cap || k.jersey, '#000000', 0.35), { flat: 1, t: 1 }));
  s.dot(hx, hy - 5.6, M(k.trim, { flat: 1 }), 2);
  if (!J.hide) {
    s.fill(seg(J.sL[0], J.sL[1], J.eL[0], J.eL[1], 2.8, 2.4), jer);
    s.fill(seg(J.eL[0], J.eL[1], J.hnL[0], J.hnL[1], 2.2), skin);
    s.fill(ell(J.hnL[0], J.hnL[1], 3.0, 3.2), glove);
    s.fill(seg(J.sR[0], J.sR[1], J.eR[0], J.eR[1], 2.8, 2.4), jer);
    s.fill(seg(J.eR[0], J.eR[1], J.hnR[0], J.hnR[1], 2.2), skin);
    s.fill(ell(J.hnR[0], J.hnR[1], 1.8, 1.8), skin);
    if (J.ball) s.fill(ell(J.hnR[0] + 0.5, J.hnR[1] - 1, 1.3, 1.3), M('#f4f1ea', { gloss: 1 }));
  }
  return s.paint();
}

/* ---- the catcher, facing the camera ----------------------------------- */

var CW = 44, CH = 42, CG = 40;
function catcher(pose, k) {
  var s = new Spr(CW, CH);
  var gear = M('#2c313b'), pants = M(k.pants), skin = M(SKIN, { skin: 1 });
  /* squat: knees wide, shin guards, the throwing hand tucked at his thigh */
  s.fill(seg(18, 29, 8, 31, 3.4, 3.2), pants);
  s.fill(seg(26, 29, 36, 31, 3.4, 3.2), pants);
  s.fill(seg(8, 31, 11, 38, 3.0, 2.6), gear);
  s.fill(seg(36, 31, 33, 38, 3.0, 2.6), gear);
  s.fill(ell(10, 39.5, 3.4, 1.6), M('#1f2126'));
  s.fill(ell(34, 39.5, 3.4, 1.6), M('#1f2126'));
  s.fill(poly([[13, 15], [31, 15], [30, 31], [14, 31]]), M(k.jersey));
  s.fill(poly([[15, 16], [29, 16], [28, 29], [16, 29]]), gear);
  s.fill(seg(14, 18, 9, 25, 2.4, 2.1), M(k.jersey));
  s.fill(seg(9, 25, 12, 30, 2.0), skin);
  s.fill(seg(30, 18, 34, 22, 2.4, 2.1), M(k.jersey));
  var hx = 22, hy = 9;
  s.fill(ell(hx, hy, 5.4, 5.8), M(k.helmet, { gloss: 1 }));
  s.fill(ell(hx, hy + 1.6, 4.0, 4.0), skin);
  var cage = M('#8b9099', { flat: 1, t: 2 });
  for (var i = -3; i <= 3; i += 2) s.fill(seg(hx + i, hy - 1.5, hx + i, hy + 5.4, 0.45), cage);
  s.fill(seg(hx - 4, hy + 0.5, hx + 4, hy + 0.5, 0.45), cage);
  s.fill(seg(hx - 4, hy + 3.5, hx + 4, hy + 3.5, 0.45), cage);
  return s.paint();
}
/* where his mitt arm starts, in sprite pixels (his left, the screen's right) */
var CATCHER_SHOULDER = [33, 21];

function mitt() {
  var s = new Spr(12, 12);
  s.fill(ell(6, 6, 5, 5.2), M('#6b4526', { gloss: 1 }));
  s.fill(ell(6, 6.4, 2.6, 2.6), M('#4e3119'));
  s.fill(seg(2.5, 2.5, 5, 1.2, 0.8), M('#7d5532'));
  return s.paint();
}

/* ---- the umpire, facing the camera ------------------------------------ */

var UW = 40, UH = 56, UG = 54;
function umpire(pose) {
  var s = new Spr(UW, UH);
  var shirt = M('#22314f'), pants = M('#6f7480'), skin = M(SKIN, { skin: 1 }), gear = M('#1d2026');
  s.fill(seg(16, 36, 13, 53, 3.2, 2.8), pants);
  s.fill(seg(24, 36, 27, 53, 3.2, 2.8), pants);
  s.fill(ell(13, 54, 3.4, 1.4), M('#151618'));
  s.fill(ell(27, 54, 3.4, 1.4), M('#151618'));
  s.fill(poly([[9, 17], [31, 17], [27, 38], [13, 38]]), shirt);
  s.fill(poly([[13, 19], [27, 19], [25, 33], [15, 33]]), gear);
  if (pose === 'strike') {
    s.fill(seg(10, 19, 6, 12, 2.6, 2.2), shirt);
    s.fill(seg(6, 12, 9, 4, 2.0), skin);
    s.fill(ell(9, 3.5, 2.4, 2.2), skin);
  } else {
    s.fill(seg(10, 19, 8, 29, 2.6, 2.2), shirt);
    s.fill(seg(8, 29, 12, 35, 2.0), skin);
  }
  s.fill(seg(30, 19, 32, 29, 2.6, 2.2), shirt);
  s.fill(seg(32, 29, 28, 35, 2.0), skin);
  var hx = 20, hy = 10;
  s.fill(ell(hx, hy, 5.0, 5.6), skin);
  s.fill(and(ell(hx, hy - 1, 5.6, 5.4), rect(hx - 7, hy - 8, hx + 7, hy - 1.5)), M('#1b2233', { gloss: 1 }));
  s.fill(rect(hx - 4, hy - 1.4, hx + 4, hy - 0.6), M('#11151f', { flat: 1, t: 1 }));
  var cage = M('#2a2d33', { flat: 1, t: 1 });
  for (var i = -3; i <= 3; i += 2) s.fill(seg(hx + i, hy - 0.5, hx + i, hy + 5, 0.45), cage);
  s.fill(seg(hx - 4, hy + 2.2, hx + 4, hy + 2.2, 0.45), cage);
  return s.paint();
}

/* ---- cache ------------------------------------------------------------ */

var CACHE = {};
function get(who, pose, colors, role) {
  var key = who + '|' + pose + '|' + (colors ? colors.join(',') : '') + '|' + (role || '');
  if (CACHE[key]) return CACHE[key];
  var k = kit(colors, role), cv;
  if (who === 'batter') cv = batter(pose, k);
  else if (who === 'pitcher') cv = pitcher(pose, k);
  else if (who === 'catcher') cv = catcher(pose, k);
  else if (who === 'umpire') cv = umpire(pose);
  else if (who === 'mitt') cv = mitt();
  CACHE[key] = cv;
  return cv;
}

/* The lit pixels of a drawn figure, [x0, y0, x1, y1] inclusive, cached. The
   framing reserves room from these, never from the canvas, because a cell is
   mostly transparent margin (mythiball's camera notes learned that one). */
var BOUNDS = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
function litBounds(cv) {
  if (BOUNDS && BOUNDS.has(cv)) return BOUNDS.get(cv);
  var d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  var x0 = cv.width, y0 = cv.height, x1 = -1, y1 = -1;
  for (var y = 0; y < cv.height; y++) for (var x = 0; x < cv.width; x++) {
    if (d[(y * cv.width + x) * 4 + 3] < 8) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  var r = [x0, y0, x1, y1];
  if (BOUNDS) BOUNDS.set(cv, r);
  return r;
}

window.STD_SPRITES = {
  get: get,
  litBounds: litBounds,
  mix: mix,
  ramp: ramp,
  releasePoint: releasePoint,
  size: {
    batter: { w: BW, h: BH, ground: BG, hip: 36 },
    pitcher: { w: PW, h: PH, ground: PG, mid: 30 },
    catcher: { w: CW, h: CH, ground: CG, mid: 22, shoulder: CATCHER_SHOULDER },
    umpire: { w: UW, h: UH, ground: UG, mid: 20 },
    mitt: { w: 12, h: 12 },
  },
  BATTER_POSES: Object.keys(BATTER),
  PITCHER_POSES: Object.keys(PITCHER),
};
})();
