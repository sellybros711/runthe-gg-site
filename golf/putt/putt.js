/* RUN THE TOUR: THE PUTTING GREEN (tester preview, not launched)
 *
 *   node golf/putt/check-putt.mjs          the physics, every themed hole and a season of dailies
 *   golf/putt/DESIGN.md                    what the mini-golf games teach and what this takes from them
 *
 * A game you PLAY rather than watch. The career and the daily simulate every putt; this is the one
 * place a player rolls the ball themselves. Three ways in:
 *
 *   Tour Greens   nine putts on the real greens of a Run The Tour course. The green is the SAME
 *                 shape the hole view draws (hvGeom: greenR, gMod, onGreenPaint, pinCands, the
 *                 greenside bunkers and water), in the same biome palette, under the same
 *                 fictional venue name. Speed and contour come from the course's own putting
 *                 difficulty (fit.put) and what its blurb says about its greens.
 *   Daily Hole    one themed mini-golf hole a day, the theme following the calendar.
 *   Themed nine   nine-hole mini-golf courses, one per theme (Haunted Hollow, Harvest Hills...).
 *
 * WHAT DECIDES A PUTT IS PHYSICS, NOT A ROLL. A ball on a green decelerates at v0^2 / (2 * stimp)
 * (a Stimpmeter releases at 6 ft/s, so that is the definition of a stimp reading), slopes pull it
 * at 5/7 g sin(theta) (a rolling sphere), and a ball over the cup falls under gravity: it is holed
 * if it drops far enough to catch the far lip before its centre leaves the hole. That one rule
 * gives the real capture speed for a centred putt (about 4.7 ft/s) and lip-outs for an edge hit,
 * with nothing tuned to make it happen. Everything is a pure function of the shot, so the same
 * putt always does the same thing and the checker can play it.
 *
 * NOTHING HERE IS ON THE PUBLIC SITE. golf/index.html draws the door only for the tester accounts
 * (puttOn, PUTT_TESTERS). This file defines window.RTT_PUTT and draws nothing until open() is
 * called, so loading it costs a visitor one cached download and no screen.
 */
(function(root){
'use strict';
var API_VERSION = 1;

/* ===================================================================================== constants */
var G = 32.17;              // ft/s^2
var ROLL = 5 / 7;           // a rolling sphere feels 5/7 of the slope's pull
var DT = 1 / 480;           // a step; at the fastest putt the ball moves 0.031 ft, under half its radius
var SUB = 8;                // steps per 1/60 s sample
var BALL_R = 0.07;          // 1.68 in ball
var CUP_R = 0.177;          // 4.25 in cup
var CUP_R_MINI = 0.24;      // a mini-golf cup is a little kinder, the way every one of the games is
var V_STIMP = 6.0;          // ft/s, the Stimpmeter's release speed
var STOP_V = 0.05;          // ft/s
var DROP = BALL_R * 1.25;   // how far a ball must fall before the far lip catches it
var MAX_T = 24;             // s, a putt that is still rolling after this has found a perpetual slope
var V_MAX = 15;             // ft/s
var ART = 0.25;             // ft per art pixel: the pixel grid the greens are painted on

// materials, in the order a painter would lay them
var M = { OUT:0, GREEN:1, FRINGE:2, ROUGH:3, SAND:4, WATER:5, ICE:6, MUD:7, BELT:8, FLOW:9 };
// what each surface rolls like, as a stimp reading (GREEN is the course's own)
var MAT_STIMP = { 2:3.0, 3:1.2, 4:0.3, 6:34, 7:1.4, 8:9 };
var MINI_SAND_STIMP = 1.3;   // a mini golf sand trap slows a ball hard but can be putted out of; a real bunker (0.3) cannot

/* ======================================================================================= helpers */
function hstr(s){ s = String(s); var h = 2166136261 >>> 0; for (var i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
function mulberry(a){ a = a >>> 0; return function(){ a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function hash3(a, b, c){ var h = (2166136261 ^ (a | 0)) >>> 0; h = Math.imul(h ^ (b | 0), 16777619) >>> 0; h = Math.imul(h ^ ((c | 0) + 0x9e37), 16777619) >>> 0; h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; h ^= h >>> 15; return (h >>> 0) / 4294967296; }
function clamp(v, a, b){ return v < a ? a : v > b ? b : v; }
function sstep(a, b, x){ var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
function dsstep(a, b, x){ var t = (x - a) / (b - a); if (t <= 0 || t >= 1) return 0; return 6 * t * (1 - t) / (b - a); }
function inPoly(P, x, y){ var c = false; for (var i = 0, j = P.length - 1; i < P.length; j = i++){ var a = P[i], b = P[j];
  if (((a[1] > y) !== (b[1] > y)) && (x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0])) c = !c; } return c; }
function segDist(px, py, ax, ay, bx, by){ var ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey || 1e-9;
  var t = clamp(((px - ax) * ex + (py - ay) * ey) / l2, 0, 1), qx = ax + ex * t, qy = ay + ey * t; return Math.hypot(px - qx, py - qy); }

/* A HOLE CAN BE SEVERAL ROOMS. H.polys is a list of polygons (or {pts, z}) whose union is the course:
   rooms, a river's channel, a bridge deck. Where two overlap the rail between them is open, so a
   channel that runs into a room is a mouth rather than a wall. The rail is the union's outline. */
function polyPts(p){ return p.pts || p; }
function inAny(PS, x, y){ for (var i = 0; i < PS.length; i++) if (inPoly(PS[i], x, y)) return i; return -1; }
function nearEdge(P, x, y, tol){ for (var e = 0; e < P.length; e++){ var a = P[e], b = P[(e + 1) % P.length]; if (segDist(x, y, a[0], a[1], b[0], b[1]) < tol) return true; } return false; }
function unionEdges(PS){
  var out = [], step = 0.125;
  PS.forEach(function(P, pi){ for (var e = 0; e < P.length; e++){
    var a = P[e], b = P[(e + 1) % P.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / step)), run = null;
    var cut = function(r){ out.push([a[0] + (b[0] - a[0]) * r[0], a[1] + (b[1] - a[1]) * r[0], a[0] + (b[0] - a[0]) * r[1], a[1] + (b[1] - a[1]) * r[1]]); };
    for (var k = 0; k < n; k++){ var t0 = k / n, t1 = (k + 1) / n, tm = (t0 + t1) / 2, mx = a[0] + (b[0] - a[0]) * tm, my = a[1] + (b[1] - a[1]) * tm, inside = false;
      for (var q = 0; q < PS.length && !inside; q++) if (q !== pi && (inPoly(PS[q], mx, my) || nearEdge(PS[q], mx, my, 0.02))) inside = true;
      if (!inside){ if (run) run[1] = t1; else run = [t0, t1]; } else if (run){ cut(run); run = null; } }
    if (run) cut(run); } });
  return out;
}
function edgeDist(E, x, y){ var d = 1e9; for (var i = 0; i < E.length; i++){ var w = E[i], v = segDist(x, y, w[0], w[1], w[2], w[3]); if (v < d) d = v; } return d; }
/* A RIVER is a polyline with a width and a current. The ball that rolls into its mouth is carried down
   it at the current's speed and poured out of its far end. Its channel is a room like any other, so
   the banks are the rail and the mouth is wherever it meets a room. */
function prepRiver(r){
  var P = r.pts, segs = [], L = 0;
  for (var i = 0; i < P.length - 1; i++){ var ax = P[i][0], ay = P[i][1], bx = P[i + 1][0], by = P[i + 1][1], l = Math.hypot(bx - ax, by - ay) || 1e-6;
    segs.push({ ax:ax, ay:ay, bx:bx, by:by, l:l, s0:L, tx:(bx - ax) / l, ty:(by - ay) / l }); L += l; }
  r.segs = segs; r.L = L; r.w = r.w || 1.6; r.vc = r.vc || 6; r.z0 = r.z0 || 0; r.z1 = r.z1 == null ? r.z0 : r.z1;
  // the channel: the polyline offset half a width each side, mitred at the joints, run a little past each end into the rooms it joins
  var left = [], right = [], ext = 0.6, hw = r.w / 2;
  for (var j = 0; j < P.length; j++){
    var a = segs[Math.max(0, j - 1)], b = segs[Math.min(segs.length - 1, j)], nx = -(a.ty + b.ty), ny = (a.tx + b.tx), nl = Math.hypot(nx, ny) || 1;
    nx /= nl; ny /= nl; var cs = Math.max(0.35, nx * -b.ty + ny * b.tx), k = hw / cs, x = P[j][0], y = P[j][1];
    if (j === 0){ x -= b.tx * ext; y -= b.ty * ext; } if (j === P.length - 1){ x += a.tx * ext; y += a.ty * ext; }
    left.push([x + nx * k, y + ny * k]); right.push([x - nx * k, y - ny * k]); }
  r.poly = left.concat(right.reverse());
  return r;
}
function riverAt(C, x, y){ var R = C.rivers; if (!R) return null;
  for (var i = 0; i < R.length; i++){ var r = R[i], best = null, bd = 1e9;
    for (var k = 0; k < r.segs.length; k++){ var g = r.segs[k], t = clamp(((x - g.ax) * g.tx + (y - g.ay) * g.ty) / g.l, 0, 1), qx = g.ax + g.tx * g.l * t, qy = g.ay + g.ty * g.l * t, d = Math.hypot(x - qx, y - qy);
      if (d < bd){ bd = d; best = { r:r, g:g, s:g.s0 + g.l * t, t:t, lat:(-(x - qx) * g.ty + (y - qy) * g.tx), qx:qx, qy:qy }; } }
    if (best && bd <= r.w / 2 && best.s > 0.001 && best.s < r.L - 0.001){ best.tx = best.g.tx; best.ty = best.g.ty; return best; } }
  return null; }
// a drawbridge: up (water under it) or down (a deck to roll over), on a clock
/* pad: the material grid is a quarter foot, so a ball just short of the deck can read the water beside it;
   the physics asks with a little margin so the deck, not the grid, decides */
function bridgeAt(C, x, y, pad){ var B = C.bridges; pad = pad || 0; for (var i = 0; i < B.length; i++){ var b = B[i]; if (x >= b.x0 - pad && x <= b.x1 + pad && y >= b.y0 - pad && y <= b.y1 + pad) return b; } return null; }
function bridgeDown(b, tt){ var f = ((tt / b.period + (b.phase || 0)) % 1 + 1) % 1; return f < (b.duty == null ? 0.5 : b.duty); }
// how far the bridge is lifted, 0 down to 1 up, for the picture: it swings over a quarter second either side of the change
function bridgeLift(b, tt){ var f = ((tt / b.period + (b.phase || 0)) % 1 + 1) % 1, du = b.duty == null ? 0.5 : b.duty, e = 0.35 / b.period;
  if (f < du) return f > du - e ? 0 : f < e ? 1 - f / e : 0; return clamp((f - du) / e, 0, 1); }
function turnAt(C, x, y){ var T = C.turns; for (var i = 0; i < T.length; i++){ var u = T[i]; if (Math.hypot(x - u.x, y - u.y) < u.r) return u; } return null; }
// the speed a loop of radius r needs at its entry for the ball to stay on the track over the top
function loopNeed(L){ return L.vmin || Math.sqrt(3.4 * G * L.r); }

/* ================================================================================= the surface */
/* A green is a sum of shapes, in feet of height:
 *   plane   a tilt                       ridge  a tier (a smoothstep step across a line)
 *   mound   a hump (or a hollow, a < 0)  ring   a volcano rim
 *   crown   a turtleback                 ramp   rises along an axis and holds (a plateau)
 * evaluated once onto a grid, with the gradient taken off that grid, so a putt reads the slope by
 * interpolation and costs the same whatever the green is made of. */
function compH(c, x, y){
  var dx, dy, r, t;
  switch (c.k){
    case 'plane': return c.gx * x + c.gy * y;
    case 'mound': dx = x - c.x; dy = y - c.y; return c.a * Math.exp(-(dx * dx + dy * dy) / (2 * c.s * c.s));
    case 'ridge': t = (x - c.x) * c.nx + (y - c.y) * c.ny; return c.a * sstep(-c.w, c.w, t);
    case 'ring': dx = x - c.x; dy = y - c.y; r = Math.hypot(dx, dy) - c.r; return c.a * Math.exp(-(r * r) / (2 * c.s * c.s));
    case 'crown': dx = (x - c.x) / c.rx; dy = (y - c.y) / c.ry; return -c.a * Math.min(2.5, dx * dx + dy * dy);
    case 'ramp': t = ((x - c.x0) * c.ux + (y - c.y0) * c.uy) / c.len; return c.a * sstep(0, 1, t);
  }
  return 0;
}
function makeField(b, comps, flats){
  var res = ART, nx = Math.ceil((b[2] - b[0]) / res) + 1, ny = Math.ceil((b[3] - b[1]) / res) + 1;
  var H = new Float32Array(nx * ny), GX = new Float32Array(nx * ny), GY = new Float32Array(nx * ny);
  for (var j = 0; j < ny; j++) for (var i = 0; i < nx; i++){
    var x = b[0] + i * res, y = b[1] + j * res, h = 0;
    for (var k = 0; k < comps.length; k++) h += compH(comps[k], x, y);
    H[j * nx + i] = h;
  }
  /* A PIN IS CUT WHERE THE GREEN IS NEARLY FLAT, and that is a rule of the game rather than a
     preference: a hole on a 4% slope is a ball that cannot stop beside it. So around each flat
     patch the surface is eased toward a plane through it at a fraction of its own slope. */
  (flats || []).forEach(function(f){
    var fi = clamp(Math.round((f.x - b[0]) / res), 1, nx - 2), fj = clamp(Math.round((f.y - b[1]) / res), 1, ny - 2);
    var h0 = H[fj * nx + fi], gx0 = (H[fj * nx + fi + 1] - H[fj * nx + fi - 1]) / (2 * res), gy0 = (H[(fj + 1) * nx + fi] - H[(fj - 1) * nx + fi]) / (2 * res);
    for (var j = 0; j < ny; j++) for (var i = 0; i < nx; i++){
      var x = b[0] + i * res - f.x, y = b[1] + j * res - f.y, w = Math.exp(-(x * x + y * y) / (2 * f.s * f.s));
      if (w < 0.004) continue;
      var target = h0 + (gx0 * x + gy0 * y) * f.keep;
      H[j * nx + i] = H[j * nx + i] * (1 - w) + target * w;
    }
  });
  for (var j2 = 0; j2 < ny; j2++) for (var i2 = 0; i2 < nx; i2++){
    var i0 = Math.max(0, i2 - 1), i1 = Math.min(nx - 1, i2 + 1), j0 = Math.max(0, j2 - 1), j1 = Math.min(ny - 1, j2 + 1);
    GX[j2 * nx + i2] = (H[j2 * nx + i1] - H[j2 * nx + i0]) / ((i1 - i0) * res);
    GY[j2 * nx + i2] = (H[j1 * nx + i2] - H[j0 * nx + i2]) / ((j1 - j0) * res);
  }
  function bil(A, x, y){
    var fx = (x - b[0]) / res, fy = (y - b[1]) / res;
    fx = clamp(fx, 0, nx - 1.001); fy = clamp(fy, 0, ny - 1.001);
    var i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, o = j * nx + i;
    return A[o] * (1 - u) * (1 - v) + A[o + 1] * u * (1 - v) + A[o + nx] * (1 - u) * v + A[o + nx + 1] * u * v;
  }
  return { b:b, res:res, nx:nx, ny:ny, H:H, GX:GX, GY:GY,
    h:function(x, y){ return bil(H, x, y); },
    gx:function(x, y){ return bil(GX, x, y); },
    gy:function(x, y){ return bil(GY, x, y); } };
}
function makeMats(b, fn){
  var res = ART, nx = Math.ceil((b[2] - b[0]) / res) + 1, ny = Math.ceil((b[3] - b[1]) / res) + 1, A = new Uint8Array(nx * ny);
  for (var j = 0; j < ny; j++) for (var i = 0; i < nx; i++) A[j * nx + i] = fn(b[0] + i * res, b[1] + j * res);
  return { nx:nx, ny:ny, A:A, at:function(x, y){
    var i = Math.round((x - b[0]) / res), j = Math.round((y - b[1]) / res);
    if (i < 0 || j < 0 || i >= nx || j >= ny) return M.OUT; return A[j * nx + i]; } };
}

/* =================================================================================== the physics */
function fricOf(C, m){ var s = m === M.GREEN ? C.stimp : (m === M.SAND && C.kind === 'mini') ? MINI_SAND_STIMP : (MAT_STIMP[m] || 1); return V_STIMP * V_STIMP / (2 * s); }
// a conveyor: the push it gives a ball rolling on it, in ft/s^2, or null off the belts
function beltAt(C, x, y){ var B = C.belts; if (!B) return null;
  for (var i = 0; i < B.length; i++){ var b = B[i]; if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) return b; } return null; }
// the speed that rolls `ft` feet on flat ground at this course's speed: how the power is set
function speedFor(C, ft){ return Math.min(V_MAX, Math.sqrt(2 * fricOf(C, M.GREEN) * Math.max(0, ft))); }
function feetFor(C, v){ return v * v / (2 * fricOf(C, M.GREEN)); }

/* THE WINDMILL'S SAILS ARE WHAT BLOCK ITS DOOR. They turn in an upright plane just in front of the
   door, and each one sweeps down to the carpet as it passes the bottom. Where a sail crosses the height
   of the ball's middle it is a bar across the doorway, and the rest of the time there is nothing there.
   So the blocker is exactly the sail the picture draws (drawSails reads the same angle), never a second
   flat windmill lying on the carpet. Geometry, in the plane of the sails (x across, z up from the hub):
   a sail runs q0 = 0.35..r along its arm and q1 = -0.08..sw across it. */
function bladeSpan(o, t){
  var th = o.phase + o.omega * t, zc = BALL_R - o.hz, lo = 1e9, hi = -1e9;
  for (var a = 0; a < 4; a++){ var ang = th + a * Math.PI / 2, ca = Math.cos(ang), sa = Math.sin(ang);
    var q = [[0.35, -0.08], [o.r, -0.08], [o.r, o.sw], [0.35, o.sw]].map(function(v){ return [ca * v[0] - sa * v[1], sa * v[0] + ca * v[1]]; });
    for (var e = 0; e < 4; e++){ var p0 = q[e], p1 = q[(e + 1) % 4];
      if ((p0[1] - zc) * (p1[1] - zc) > 0 || p0[1] === p1[1]) continue;
      var x = p0[0] + (p1[0] - p0[0]) * (zc - p0[1]) / (p1[1] - p0[1]); if (x < lo) lo = x; if (x > hi) hi = x; } }
  return hi > lo ? [o.x + lo, o.x + hi] : null;
}
function moverAt(o, t){
  if (o.k === 'blade'){ var sp = bladeSpan(o, t); return sp ? [[sp[0], o.y, sp[1], o.y]] : []; }
  if (o.k === 'spin'){
    var segs = [], th = o.phase + o.omega * t;
    for (var a = 0; a < o.arms; a++){ var ang = th + a * 2 * Math.PI / o.arms, c = Math.cos(ang), s = Math.sin(ang);
      segs.push([o.x + c * o.hub, o.y + s * o.hub, o.x + c * o.len, o.y + s * o.len]); }
    return segs;
  }
  // slide: a bar sweeping between two points
  var ph = 2 * Math.PI * (t / o.period + o.phase), f = 0.5 - 0.5 * Math.cos(ph);
  var cx = o.ax + (o.bx - o.ax) * f, cy = o.ay + (o.by - o.ay) * f, hx = Math.cos(o.ang) * o.len / 2, hy = Math.sin(o.ang) * o.len / 2;
  return [[cx - hx, cy - hy, cx + hx, cy + hy]];
}
function moverVel(o, t, qx, qy){
  if (o.k === 'blade') return [o.omega * o.hz, 0];   // the foot of a sail, swinging past the bottom
  if (o.k === 'spin') return [-o.omega * (qy - o.y), o.omega * (qx - o.x)];
  var ph = 2 * Math.PI * (t / o.period + o.phase), df = 0.5 * Math.sin(ph) * 2 * Math.PI / o.period;
  return [(o.bx - o.ax) * df, (o.by - o.ay) * df];
}
// circle (the ball) against a capsule (a wall with half-thickness r0); vb is the wall's own velocity
function hitSeg(s, ax, ay, bx, by, r0, e, vbx, vby){
  var ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey || 1e-9;
  var t = clamp(((s.x - ax) * ex + (s.y - ay) * ey) / l2, 0, 1), qx = ax + ex * t, qy = ay + ey * t;
  var dx = s.x - qx, dy = s.y - qy, d = Math.hypot(dx, dy), R = BALL_R + r0;
  if (d >= R) return false;
  if (d < 1e-9){ dx = -ey; dy = ex; d = Math.hypot(dx, dy) || 1; }
  var nx = dx / d, ny = dy / d;
  s.x = qx + nx * R; s.y = qy + ny * R;
  var rvx = s.vx - (vbx || 0), rvy = s.vy - (vby || 0), vn = rvx * nx + rvy * ny;
  if (vn < 0){
    var tx = -ny, ty = nx, vt = rvx * tx + rvy * ty;
    rvx = tx * vt * 0.96 - nx * vn * e; rvy = ty * vt * 0.96 - ny * vn * e;
    s.vx = rvx + (vbx || 0); s.vy = rvy + (vby || 0);
    return Math.abs(vn) > 0.4;
  }
  return false;
}
function hitCircle(s, cx, cy, r, e){
  var dx = s.x - cx, dy = s.y - cy, d = Math.hypot(dx, dy), R = r + BALL_R;
  if (d >= R) return false;
  if (d < 1e-9){ dx = 1; dy = 0; d = 1; }
  var nx = dx / d, ny = dy / d; s.x = cx + nx * R; s.y = cy + ny * R;
  var vn = s.vx * nx + s.vy * ny;
  if (vn < 0){ s.vx -= (1 + e) * vn * nx; s.vy -= (1 + e) * vn * ny; return Math.abs(vn) > 0.4; }
  return false;
}

/* One putt, start to rest. Returns the path sampled every 1/60 s (so playback is the physics, not a
   drawing of it), where it ended and why. t0 is the course clock when it was struck, which is what
   the windmills read: the same putt at the same moment always meets the same blade. */
function simulate(C, x, y, vx, vy, t0){
  var s = { x:x, y:y, vx:vx, vy:vy }, out = { pts:[[x, y, 0]], holed:false, water:false, out:false, rest:null, ev:[], t:0 };
  var z = 0, zv = 0, over = false, cr = C.cupR, cx = C.cup[0], cy = C.cup[1], t = 0, n = 0, port = -1;
  var rx = x, ry = y;   // where the ball was half a second ago, for the pinned-against-a-rail rest below
  var walls = C.walls, bums = C.bumpers, movs = C.movers, ports = C.portals, loops = C.loops || [], ramps = C.ramps || [];
  var lastPiece = null;   // the loop or ramp just ridden, so it cannot fire twice on the way out of it
  // a stretch of a set piece, played out: each point is [x, y, dt from now, z above the surface]
  function ride(path){ var t1 = t, k = 0; for (var q = 0; q < path.length; q++){ var pp = path[q]; t1 = t + pp[2]; out.pts.push([pp[0], pp[1], t1, 0, pp[3] || 0]); } t = t1; n = 0; }
  function landAt(xx, yy, tt){ var mm = C.mats.at(xx, yy); if (mm === M.OUT) mm = C.matFn(xx, yy); if (C.bridges.length && mm === M.WATER){ var bb = bridgeAt(C, xx, yy, 0.2); if (bb) mm = bridgeDown(bb, tt) ? M.GREEN : M.WATER; } return mm; }
  for (;;){
    var m = C.mats.at(s.x, s.y);
    /* The grid is a quarter foot and a ball resting on a rail has its centre 0.07 ft inside it, so the
       nearest grid point can be outside. OUT is only believed once the exact shape agrees. */
    if (m === M.OUT) m = C.matFn(s.x, s.y);
    if (C.bridges.length && m === M.WATER){ var brg = bridgeAt(C, s.x, s.y, 0.2); if (brg) m = bridgeDown(brg, t0 + t) ? M.GREEN : M.WATER; }
    if (m === M.WATER){ out.water = true; out.ev.push([t, 'water']); break; }
    if (m === M.OUT){ out.out = true; out.ev.push([t, 'out']); break; }
    var px0 = s.x, py0 = s.y, rv = m === M.FLOW ? riverAt(C, s.x, s.y) : null, disc = (!rv && C.turns.length) ? turnAt(C, s.x, s.y) : null;
    if (rv){
      // in the river the current has the ball: it is turned to the flow and brought to its speed, and held off the banks
      var kq = Math.min(1, DT / 0.22), tvx = rv.tx * rv.r.vc, tvy = rv.ty * rv.r.vc;
      s.vx += (tvx - s.vx) * kq; s.vy += (tvy - s.vy) * kq;
      s.vx += rv.ty * rv.lat * 5 * DT; s.vy -= rv.tx * rv.lat * 5 * DT;
    } else if (disc){
      // a turntable: friction works against the ball's speed RELATIVE to the disc, and the spin flings it outward
      var dvx0 = -disc.omega * (s.y - disc.y), dvy0 = disc.omega * (s.x - disc.x), rlx = s.vx - dvx0, rly = s.vy - dvy0, rls = Math.hypot(rlx, rly), afd = fricOf(C, M.GREEN);
      if (rls > 1e-9){ var dd = Math.min(rls, afd * DT); rlx -= rlx / rls * dd; rly -= rly / rls * dd; }
      var ocx = s.x - disc.x, ocy = s.y - disc.y;
      s.vx = rlx + dvx0 + disc.omega * disc.omega * ocx * 0.55 * DT; s.vy = rly + dvy0 + disc.omega * disc.omega * ocy * 0.55 * DT;
    } else {
    var gx = C.field.gx(s.x, s.y), gy = C.field.gy(s.x, s.y);
    var ax = -ROLL * G * gx, ay = -ROLL * G * gy, sp = Math.hypot(s.vx, s.vy), af = fricOf(C, m);
    if (m === M.BELT){ var bl = beltAt(C, s.x, s.y); if (bl){ ax += bl.ax; ay += bl.ay; } }
    var sl = Math.hypot(ax, ay);
    if (over){ ax = 0; ay = 0; }   // over the hole the ball is falling, not rolling
    if (sp < STOP_V && !over && sl <= af){ break; }
    if (sp > 1e-9 && !over){ var dvx = -af * s.vx / sp * DT, dvy = -af * s.vy / sp * DT;
      // friction can stop a ball, never send it backwards
      if (sl <= af && dvx * dvx + dvy * dvy >= sp * sp){ s.vx = 0; s.vy = 0; } else { s.vx += dvx; s.vy += dvy; } }
    s.vx += ax * DT; s.vy += ay * DT;
    }
    s.x += s.vx * DT; s.y += s.vy * DT;
    var rode = false;
    // a loop: crossed at its entry going forward, the ball goes up and round if it is quick enough, and rolls back out if not
    for (var li = 0; li < loops.length && !rode; li++){ var L = loops[li]; if (L === lastPiece) continue;
      var a0 = (px0 - L.x) * L.dx + (py0 - L.y) * L.dy, a1 = (s.x - L.x) * L.dx + (s.y - L.y) * L.dy, sd = -(s.x - L.x) * L.dy + (s.y - L.y) * L.dx, vf = s.vx * L.dx + s.vy * L.dy;
      if (a0 < 0 && a1 >= 0 && Math.abs(sd) < L.w / 2 && vf > 0){
        var v0 = Math.hypot(s.vx, s.vy), need = loopNeed(L), K7 = 10 / 7 * G * L.r, path = [], tl = 0, th = 0, sx = -L.dy, sy = L.dx, off = L.off || 0;
        var vth = function(a){ return Math.sqrt(Math.max(v0 * v0 - K7 * (1 - Math.cos(a)), need * need * 0.12)); };
        if (v0 >= need){
          for (th = 0; th < 2 * Math.PI; ){ var stp = Math.min(2 * Math.PI - th, vth(th) / L.r / 60); th += stp; tl += 1 / 60;
            path.push([L.x + L.dx * L.r * Math.sin(th) + sx * off * th / (2 * Math.PI), L.y + L.dy * L.r * Math.sin(th) + sy * off * th / (2 * Math.PI), tl, L.r * (1 - Math.cos(th))]); }
          ride(path); s.x = L.x + sx * off + L.dx * 0.05; s.y = L.y + sy * off + L.dy * 0.05; var ve = v0 * 0.9; s.vx = L.dx * ve; s.vy = L.dy * ve; out.ev.push([t, 'loop']);
        } else {
          var thm = Math.min(Math.acos(clamp(1 - v0 * v0 / K7, -1, 1)), Math.PI * 0.8), up = [];
          for (th = 0; th < thm; ){ var st2 = Math.max(0.04, vth(th) / L.r / 60); th = Math.min(thm, th + st2); up.push(th); }
          var seq = up.concat(up.slice().reverse()); seq.forEach(function(a){ tl += 1 / 60; path.push([L.x + L.dx * L.r * Math.sin(a), L.y + L.dy * L.r * Math.sin(a), tl, L.r * (1 - Math.cos(a))]); });
          ride(path); s.x = L.x - L.dx * 0.05; s.y = L.y - L.dy * 0.05; s.vx = -L.dx * v0 * 0.7; s.vy = -L.dy * v0 * 0.7; out.ev.push([t, 'loopback']);
        }
        lastPiece = L; rode = true; } }
    // a ramp: over its lip the ball flies, and where it lands decides whether it made it
    for (var ri = 0; ri < ramps.length && !rode; ri++){ var Rp = ramps[ri]; if (Rp === lastPiece) continue;
      var b0 = (px0 - Rp.x) * Rp.dx + (py0 - Rp.y) * Rp.dy, b1 = (s.x - Rp.x) * Rp.dx + (s.y - Rp.y) * Rp.dy, sd2 = -(s.x - Rp.x) * Rp.dy + (s.y - Rp.y) * Rp.dx, vf2 = s.vx * Rp.dx + s.vy * Rp.dy;
      if (b0 < 0 && b1 >= 0 && Math.abs(sd2) < Rp.w / 2 && vf2 > 0){
        var vin = Math.hypot(s.vx, s.vy), hgt = Rp.h || 0.4, vl2 = vin * vin - 2 * ROLL * G * hgt;
        if (vl2 < 1){ s.x = px0; s.y = py0; s.vx = -s.vx * 0.5; s.vy = -s.vy * 0.5; out.ev.push([t, 'rampback']); rode = true; break; }
        var vl = Math.sqrt(vl2), an = (Rp.ang || 24) * Math.PI / 180, ux = s.vx / vin, uy = s.vy / vin, vh = vl * Math.cos(an), vz = vl * Math.sin(an);
        var tf = (vz + Math.sqrt(vz * vz + 2 * G * hgt)) / G, fp = [], tk = 0;
        for (tk = 1 / 60; tk < tf; tk += 1 / 60) fp.push([Rp.x + ux * vh * tk, Rp.y + uy * vh * tk, tk, hgt + vz * tk - G * tk * tk / 2]);
        var lx = Rp.x + ux * vh * tf, ly = Rp.y + uy * vh * tf; fp.push([lx, ly, tf, 0]);
        ride(fp); s.x = lx; s.y = ly; out.ev.push([t, 'land']);
        var lm = landAt(lx, ly, t0 + t);
        if (lm === M.WATER){ out.water = true; out.ev.push([t, 'water']); lastPiece = Rp; return finishOut(); }
        if (lm === M.OUT){ out.out = true; out.ev.push([t, 'out']); lastPiece = Rp; return finishOut(); }
        s.vx = ux * vh * 0.72; s.vy = uy * vh * 0.72; lastPiece = Rp; rode = true; } }
    if (rode){ px0 = s.x; py0 = s.y; continue; }
    if (lastPiece && Math.hypot(s.x - lastPiece.x, s.y - lastPiece.y) > 2.5) lastPiece = null;
    var hit = false, i;
    for (i = 0; i < walls.length; i++){ var w = walls[i]; if (hitSeg(s, w[0], w[1], w[2], w[3], w[4], w[5])) hit = true; }
    for (i = 0; i < bums.length; i++){ var bm = bums[i]; if (hitCircle(s, bm.x, bm.y, bm.r, bm.e)){ hit = true; if (bm.e > 1){ var vv = Math.hypot(s.vx, s.vy); if (vv > V_MAX){ s.vx *= V_MAX / vv; s.vy *= V_MAX / vv; } } } }
    for (i = 0; i < movs.length; i++){ var mo = movs[i], segs = moverAt(mo, t0 + t);
      for (var q = 0; q < segs.length; q++){ var sg = segs[q];
        var mx = (sg[0] + sg[2]) / 2, my = (sg[1] + sg[3]) / 2, vb = moverVel(mo, t0 + t, mx, my);
        if (mo.k === 'spin'){
          // the blade's speed at the point it touches the ball, not at its middle
          var ex2 = sg[2] - sg[0], ey2 = sg[3] - sg[1], l2 = ex2 * ex2 + ey2 * ey2 || 1, tt = clamp(((s.x - sg[0]) * ex2 + (s.y - sg[1]) * ey2) / l2, 0, 1);
          vb = moverVel(mo, t0 + t, sg[0] + ex2 * tt, sg[1] + ey2 * tt);
        }
        if (hitSeg(s, sg[0], sg[1], sg[2], sg[3], mo.w / 2, 0.7, vb[0], vb[1])) hit = true; }
      if (mo.k === 'spin' && hitCircle(s, mo.x, mo.y, mo.hub, 0.6)) hit = true; }
    if (hit) out.ev.push([t, 'wall']);
    // a tunnel carries the ball to its exit, still rolling
    for (i = 0; i < ports.length; i++){ var p = ports[i];
      if (port !== i && Math.hypot(s.x - p.ax, s.y - p.ay) < p.r){
        var vin2 = Math.hypot(s.vx, s.vy); if (p.vcap && vin2 > p.vcap) continue;   // a drop hole a quick ball skips over
        var v = Math.max(p.minV || 2.4, vin2 * (p.keep || 0.9));
        if (p.dur){ out.pts.push([p.ax, p.ay, t, 2]); t += p.dur; n = 0; }   // inside the pipe: out of sight for the trip
        s.x = p.bx; s.y = p.by; s.vx = p.dx * v; s.vy = p.dy * v;
        port = i; out.ev.push([t, 'tunnel']); out.pts.push([s.x, s.y, t, 1]); break; } }
    if (port >= 0 && Math.hypot(s.x - ports[port].bx, s.y - ports[port].by) > 1.2) port = -1;
    // the cup: over the hole the ball falls, and it is in once it has fallen far enough to catch the far lip
    var dx = s.x - cx, dy = s.y - cy, d = Math.hypot(dx, dy);
    if (d < cr){
      if (!over){ over = true; z = 0; zv = 0; }
      zv += G * DT; z += zv * DT;
      if (z >= DROP){ out.holed = true; out.ev.push([t, 'cup']); s.x = cx; s.y = cy; break; }
    } else if (over){
      // it crossed the hole too quickly and met the far lip: the deeper it had dropped, the harder it is turned
      over = false; var k = clamp(z / DROP, 0, 1);
      if (k > 0.05){ var nx = dx / d, ny = dy / d, vn = s.vx * nx + s.vy * ny, vtx = s.vx - vn * nx, vty = s.vy - vn * ny;
        s.vx = s.vx * (1 - k) + (vtx * 0.85 + nx * vn * 0.4) * k; s.vy = s.vy * (1 - k) + (vty * 0.85 + ny * vn * 0.4) * k;
        out.ev.push([t, 'lip']); }
      z = 0; zv = 0;
    }
    t += DT; n++;
    if (n % SUB === 0) out.pts.push([s.x, s.y, t]);
    /* A ball held against a rail by a slope steeper than friction never meets the rule above: the
       slope pushes, the rail cancels it, and it sits still while the slope says it should roll. So a
       slow ball that has gone nowhere in half a second has come to rest. Measured, without this the
       bowl, the volcano and the tiers each kept a few putts "rolling" to MAX_T. */
    if (n % 240 === 0){ if (!over && !rv && !disc && Math.hypot(s.vx, s.vy) < 4 * STOP_V && Math.hypot(s.x - rx, s.y - ry) < 0.02) break; rx = s.x; ry = s.y; }
    if (t > MAX_T) break;
  }
  return finishOut();
  function finishOut(){ out.t = t; out.rest = [s.x, s.y]; out.pts.push([s.x, s.y, t]); return out; }
}

/* ============================================================================ a course, assembled */
function finishCourse(C){
  C.walls = C.walls || []; C.bumpers = C.bumpers || []; C.movers = C.movers || []; C.portals = C.portals || []; C.belts = C.belts || [];
  C.loops = C.loops || []; C.ramps = C.ramps || []; C.rivers = C.rivers || []; C.bridges = C.bridges || []; C.turns = C.turns || [];
  if (!C.polys) C.polys = C.poly ? [C.poly] : []; if (!C.allPts) C.allPts = C.polys.reduce(function(a, p){ return a.concat(p); }, []);
  if (!C.edges) C.edges = C.polys.length > 1 ? unionEdges(C.polys) : C.polys.length ? polyWalls(C.polys[0], 0, 0).map(function(w){ return [w[0], w[1], w[2], w[3]]; }) : [];
  if (!C.tierAt) C.tierAt = function(){ return 0; };
  C.field = makeField(C.bounds, C.comps || [], C.flats || []);
  C.mats = makeMats(C.bounds, C.matFn);
  return C;
}
function polyWalls(P, th, e){
  var W = [];
  for (var i = 0; i < P.length; i++){ var a = P[i], b = P[(i + 1) % P.length]; W.push([a[0], a[1], b[0], b[1], th, e]); }
  return W;
}
function rectWalls(r, e){   // r: {x0,y0,x1,y1}
  return polyWalls([[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]], 0, e);
}

/* ============================================================================== REAL TOUR GREENS */
/* How a course's greens roll. fit.put is the game's own putting difficulty for the course (1.0 is
   average; Old Course 1.27, Kapalua 0.92), so speed and contour follow it, and a few blurbs name
   the shape the green is famous for. */
var GREEN_WORDS = [
  [/turtleback|crowned/i, 'crown'],
  [/double greens|humps|glacial humps/i, 'humps'],
  [/tier|plateau|shelf/i, 'tier'],
  [/fall-away|pitched away|repel|shrug/i, 'away'],
  [/glass|lightning|run faster|fast|quick|slick|baked|firm/i, 'fast'],
  [/lobed|clover/i, 'lobes'],
  [/small|tiny/i, 'small']
];
function greenCharacter(course){
  var put = (course && course.fit && course.fit.put) || 1, txt = (course && course.blurb) || '', ch = {};
  GREEN_WORDS.forEach(function(w){ if (w[0].test(txt)) ch[w[1]] = true; });
  ch.stimp = clamp(10.2 + (put - 0.92) * 9 + (ch.fast ? 0.8 : 0), 9.5, 14);
  ch.contour = clamp(0.8 + (put - 0.92) * 1.6, 0.7, 1.45);
  return ch;
}
/* spec: the green in FEET, local to its centre, x right and y toward the back of the green as it
   appears on screen (up). Built by fromHost() off the page's hvGeom, or by hand in the checker. */
function buildReal(spec, opt){
  opt = opt || {};
  var ch = spec.character || {}, rnd = mulberry(hstr('rg:' + spec.seed + ':' + (opt.pin | 0)));
  var rx = spec.rx, ry = spec.ry, mx = Math.max(rx, ry) * 1.32 + 14, my = Math.max(rx, ry) * 1.32 + 14;
  var b = [-rx * 1.25 - mx * 0.6, -ry * 1.25 - my * 0.6, rx * 1.25 + mx * 0.6, ry * 1.25 + my * 0.6];
  var con = ch.contour || 1, R = Math.max(rx, ry), comps = [];
  var sr = mulberry(hstr('rgs:' + spec.seed));   // the SHAPE of a green is the green's, whatever the pin
  // the tilt: most greens run back to front, toward the player, at 1 to 2.5%
  var tg = (0.012 + sr() * 0.014) * con, ta = (sr() - 0.5) * 1.3 + (ch.away && sr() < 0.6 ? Math.PI : 0);
  comps.push({ k:'plane', gx:Math.sin(ta) * tg, gy:-Math.cos(ta) * tg });
  // a tier across the green on a third of them, more where the blurb says so
  if (ch.tier || sr() < 0.32){ var na = (sr() - 0.5) * 0.9, off = (sr() - 0.5) * ry * 0.6;
    comps.push({ k:'ridge', x:Math.sin(na) * off, y:off, nx:Math.sin(na), ny:-Math.cos(na), w:4.5 + sr() * 3, a:(0.35 + sr() * 0.45) * con }); }
  if (ch.crown) comps.push({ k:'crown', x:(sr() - 0.5) * rx * 0.3, y:(sr() - 0.5) * ry * 0.3, rx:rx * 1.05, ry:ry * 1.05, a:0.75 * con });
  var nb = (ch.humps ? 5 : 2) + Math.floor(sr() * 3);
  for (var i = 0; i < nb; i++){ var a = sr() * 6.283, r = Math.sqrt(sr()) * R * 0.85;
    comps.push({ k:'mound', x:Math.cos(a) * r * rx / R, y:Math.sin(a) * r * ry / R, s:5 + sr() * (ch.humps ? 6 : 9), a:(sr() < 0.6 ? 1 : -1) * (0.18 + sr() * (ch.humps ? 0.45 : 0.3)) * con }); }
  // the pin sits on a gentle patch, which is where pins are cut
  var pins = spec.pins.slice(), pin = pins[(opt.pin | 0) % pins.length];
  var flats = [{ x:pin[0], y:pin[1], s:4.6, keep:0.25 }];
  var C = { kind:'real', name:spec.name, sub:spec.sub, bounds:b, comps:comps, flats:flats, stimp:ch.stimp || 11,
    cup:pin, cupR:CUP_R, character:ch, spec:spec, biome:spec.biome };
  C.matFn = function(x, y){
    if (spec.wet && spec.wet(x, y)) return M.WATER;
    for (var k = 0; k < (spec.bunkers || []).length; k++){ var bk = spec.bunkers[k];
      var dx = (x - bk.x) / bk.r, dy = (y - bk.y) / (bk.ry || bk.r), wob = 1 + 0.16 * Math.sin(Math.atan2(dy, dx) * 3 + bk.ph) + 0.08 * Math.sin(Math.atan2(dy, dx) * 5 + bk.ph * 2);
      if (dx * dx + dy * dy < wob * wob) return M.SAND; }
    if (spec.inGreen(x, y)) return M.GREEN;
    if (spec.inFringe(x, y)) return M.FRINGE;
    return M.ROUGH;
  };
  finishCourse(C);
  return C;
}
// a ball spot `ft` from the pin, on the putting surface and clear of its edge
function spotFor(C, ft, rnd){
  var tries = 0, best = null;
  while (tries++ < 160){
    var a = rnd() * 6.283, d = ft * (0.9 + rnd() * 0.2), x = C.cup[0] + Math.cos(a) * d, y = C.cup[1] + Math.sin(a) * d;
    if (C.mats.at(x, y) !== M.GREEN) continue;
    var ok = true;
    for (var k = 0; k < 8 && ok; k++){ var aa = k * Math.PI / 4; if (C.mats.at(x + Math.cos(aa) * 2, y + Math.sin(aa) * 2) !== M.GREEN) ok = false; }
    if (!ok) continue;
    // a ball is only ever left where a ball can stay: on a tier face it would not have stopped there
    if (Math.hypot(C.field.gx(x, y), C.field.gy(x, y)) > 0.045) continue;
    // and the straight line to the hole stays on the green, or it is a chip rather than a putt
    var on = true; for (var s = 1; s < 10 && on; s++){ if (C.mats.at(x + (C.cup[0] - x) * s / 10, y + (C.cup[1] - y) * s / 10) !== M.GREEN) on = false; }
    if (!on) continue;
    best = [x, y]; break;
  }
  return best;
}

/* The page's adapter. Everything here is a read of a function golf/index.html already has, so
   the green you putt on is the green the hole view draws. */
function fromHost(host, courseKey, holeIdx){
  var c = host.courses[courseKey], h = c.holes[holeIdx];
  var seedN = (host.dHash(courseKey) ^ Math.imul((holeIdx | 0) + 1, 0x9e3779b1)) >>> 0;
  var g = host.hvGeom(seedN, h[0], h[1], courseKey, holeIdx);
  var gx = g.gcx, gy = g.L, F = 3;
  var Y = function(x, y){ return [gx + x / F, gy - y / F]; };
  var bunk = (g.bunkers || []).filter(function(bk){ return Math.hypot((bk.x - gx) / (g.greenR[0] + bk.r + 8), (bk.y - gy) / (g.greenR[1] + bk.r + 8)) < 1.2; })
    .map(function(bk, i){ return { x:(bk.x - gx) * F, y:-(bk.y - gy) * F, r:bk.r * F * 0.8, ry:bk.r * F * 0.66, ph:(seedN % 97) * 0.1 + i }; });
  return {
    seed:seedN, courseKey:courseKey, hole:holeIdx + 1, par:h[0],
    name:c.v || courseKey, sub:'Hole ' + (holeIdx + 1) + (h[2] ? ' · ' + h[2] : ''),
    rx:g.greenR[0] * F, ry:g.greenR[1] * F,
    inGreen:function(x, y){ var p = Y(x, y); return g.onGreenPaint(p[0], p[1], 1.0); },
    inFringe:function(x, y){ var p = Y(x, y); return g.onGreenPaint(p[0], p[1], 1.32); },
    wet:g.wet ? function(x, y){ var p = Y(x, y); return g.wet(p[0], p[1]); } : null,
    bunkers:bunk,
    pins:(g.pinCands || [[gx, gy]]).map(function(p){ return [(p[0] - gx) * F, -(p[1] - gy) * F]; }),
    biome:host.hvBiome ? host.hvBiome(courseKey) : null,
    character:greenCharacter(c)
  };
}

/* ================================================================================== MINI GOLF */
/* THE THEMES. A theme is a skin, never a rule: every theme plays the same nine shapes of hole, and
   what changes is what a bumper looks like, what the hazard is and what stands around the course.
   One exception and it is deliberate: in the winter themes the water is frozen, so the hazard is
   ice that sends the ball skating rather than a penalty. */
var THEMES = {
  haunted:{ name:'Haunted Hollow', kick:'Halloween', bg:'#1d1630', bg2:'#2a2142', carpet:'#3f7d3a', carpet2:'#38713a', wall:'#e8761f', wallHi:'#ffad55', wallLo:'#8a3d0c', ink:'#0e0a16',
    haz:'water', hazCol:'#7ed321', hazCol2:'#b6f05a', hazName:'Witch’s brew', slow:'mud', slowCol:'#5d4634', slowName:'Grave dirt',
    bumper:'pumpkin', block:'tomb', spinner:'#d9d4c7', slider:'coffin', tunnel:'coffin', flag:'#ff7a1a',
    decor:['tomb', 'bat', 'ghost', 'deadtree', 'pumpkin'], acc:'#ff9a3a',
    holes:['Pumpkin Patch', 'Crypt Corner', 'Bat Cave', 'The Haunted Mill', 'Witch’s Brew', 'Graveyard Shift', 'Coffin Run', 'Cauldron Crater', 'Headless Hollow'] },
  harvest:{ name:'Harvest Hills', kick:'Thanksgiving', bg:'#8a6a34', bg2:'#9c7a3c', carpet:'#6f9d3b', carpet2:'#668f37', wall:'#8b4a1e', wallHi:'#b86b34', wallLo:'#5a2e10', ink:'#2b1606',
    haz:'water', hazCol:'#9b1b30', hazCol2:'#c8344d', hazName:'Cranberry bog', slow:'mud', slowCol:'#e2bf45', slowName:'Corn crib',
    bumper:'pie', block:'hay', spinner:'#f2e6c9', slider:'hay', tunnel:'log', flag:'#c8344d',
    decor:['corn', 'hay', 'leaves', 'turkey', 'pumpkin'], acc:'#f2a93b',
    holes:['First Furrow', 'Hayride', 'Gobbler’s Gap', 'The Old Mill', 'Cranberry Bog', 'Cornrows', 'Hollow Log', 'Pie Plate', 'The Big Feast'] },
  winter:{ light:true, name:'Frostbite Pines', kick:'Holidays', bg:'#e8f1fa', bg2:'#d7e6f4', carpet:'#2f7d5b', carpet2:'#2a7253', wall:'#d62f2f', wallHi:'#ff6a6a', wallLo:'#8e1717', ink:'#1a2a3a',
    haz:'ice', hazCol:'#bfe6ff', hazCol2:'#ecf8ff', hazName:'Frozen pond', slow:'mud', slowCol:'#ffffff', slowName:'Snowdrift',
    bumper:'snowball', block:'gift', spinner:'#ffffff', slider:'gift', tunnel:'chimney', flag:'#d62f2f',
    decor:['pine', 'snowman', 'gift', 'cane'], acc:'#7fd0ff',
    holes:['First Flake', 'Candy Cane Lane', 'Chimney Drop', 'The Toy Mill', 'Frozen Pond', 'Sleigh Ride', 'Down the Chimney', 'Snow Globe', 'The North Pole'] },
  sweetheart:{ light:true, name:'Sweetheart Greens', kick:'Valentine’s', bg:'#ffd3e2', bg2:'#ffc2d6', carpet:'#d9487a', carpet2:'#cc3f70', wall:'#ffffff', wallHi:'#ffffff', wallLo:'#e9a0b8', ink:'#5a1030',
    haz:'water', hazCol:'#5b2f1d', hazCol2:'#7b4630', hazName:'Chocolate fountain', slow:'mud', slowCol:'#f7c7da', slowName:'Sprinkles',
    bumper:'heart', block:'candybox', spinner:'#ffe3ee', slider:'candybox', tunnel:'heartdoor', flag:'#ff2d6f',
    decor:['heart', 'rose', 'candy'], acc:'#ff6f9f',
    holes:['First Date', 'Love Letter', 'Heartbeat', 'The Tunnel of Love', 'Chocolate River', 'Rose Garden', 'Cupid’s Arrow', 'Heart of Gold', 'Happily Ever After'] },
  shamrock:{ name:'Shamrock Glen', kick:'St. Patrick’s', bg:'#1d4d27', bg2:'#245c30', carpet:'#5cb84c', carpet2:'#53aa45', wall:'#e2b23b', wallHi:'#ffd968', wallLo:'#8a6612', ink:'#0c2412',
    haz:'water', hazCol:'#3fa7e0', hazCol2:'#8fd3ff', hazName:'Rainbow pool', slow:'mud', slowCol:'#f2c94c', slowName:'Gold coins',
    bumper:'clover', block:'stone', spinner:'#ffd968', slider:'stone', tunnel:'stone', flag:'#2fa84f',
    decor:['clover', 'potgold', 'rainbow'], acc:'#ffd968',
    holes:['Four Leaf', 'Lucky Bounce', 'The Glen', 'The Stone Mill', 'Rainbow’s End', 'Clover Field', 'Fairy Ring', 'Pot of Gold', 'Luck of the Draw'] },
  spring:{ light:true, name:'Bloom Gardens', kick:'Spring', bg:'#a4d98a', bg2:'#93cc79', carpet:'#4fa356', carpet2:'#47974e', wall:'#f4a7c0', wallHi:'#ffd0df', wallLo:'#b8607f', ink:'#24401f',
    haz:'water', hazCol:'#5fbfff', hazCol2:'#a8e0ff', hazName:'Lily pond', slow:'mud', slowCol:'#9a7048', slowName:'Flower bed',
    bumper:'egg', block:'planter', spinner:'#fff6d5', slider:'planter', tunnel:'burrow', flag:'#ffd23f',
    decor:['flower', 'egg', 'bunny'], acc:'#ffd23f',
    holes:['First Bloom', 'Tulip Row', 'Bunny Hop', 'The Garden Mill', 'Lily Pond', 'Egg Hunt', 'Rabbit Hole', 'Bird Bath', 'Full Bloom'] },
  firework:{ name:'Firecracker Fairways', kick:'Summer nights', bg:'#121d3a', bg2:'#18264a', carpet:'#2e7d32', carpet2:'#2a722e', wall:'#e53935', wallHi:'#ff7a77', wallLo:'#8c1414', ink:'#060b18',
    haz:'water', hazCol:'#1e7fd8', hazCol2:'#5fb4ff', hazName:'Reflecting pool', slow:'mud', slowCol:'#d8c49b', slowName:'Picnic blanket',
    bumper:'star', block:'crate', spinner:'#ffffff', slider:'crate', tunnel:'pipe', flag:'#ffffff',
    decor:['burst', 'flagpole', 'star'], acc:'#ffd23f',
    holes:['The Fuse', 'Sparkler', 'Bottle Rocket', 'The Pinwheel', 'Reflecting Pool', 'Grand Stand', 'The Launch Tube', 'Big Bang', 'The Finale'] },
  clubhouse:{ light:true, name:'The Clubhouse', kick:'World 1', bg:'#7fb35e', bg2:'#73a754', carpet:'#2f8f4e', carpet2:'#2a8246', wall:'#f4efe2', wallHi:'#ffffff', wallLo:'#a99c7c', ink:'#1d3524',
    haz:'water', hazCol:'#3f9fe0', hazCol2:'#9fd6f7', hazName:'Practice pond', slow:'mud', slowCol:'#e9d8a6', slowName:'Sand',
    bumper:'stone', block:'hay', spinner:'#ffffff', slider:'crate', tunnel:'pipe', flag:'#e53935',
    decor:['flower', 'flagpole'], acc:'#F1D04A',
    holes:['First Tee', 'Pace', 'The Slope', 'Bank Shot', 'Sand Trap', 'Twin Bunkers', 'Bumper Alley', 'The Crown', 'Dogleg Left', 'Clubhouse Classic'] },
  tour:{ name:'Tour Week', kick:'World 5', bg:'#2f6b3a', bg2:'#2a6034', carpet:'#3aa05a', carpet2:'#349150', wall:'#1d2a44', wallHi:'#3a4d73', wallLo:'#0f1626', ink:'#0a1020',
    haz:'water', hazCol:'#2f8fd8', hazCol2:'#8fd0ff', hazName:'The lake', slow:'mud', slowCol:'#efe2b8', slowName:'Bunker',
    bumper:'pad', block:'crate', spinner:'#ffffff', slider:'crate', tunnel:'pipe', flag:'#F1D04A',
    decor:['flagpole', 'star'], acc:'#F1D04A',
    holes:['Tour Pin', 'Bounce House', 'Tour Pin', 'Pinball', 'Tour Pin', 'Pad Bank', 'Tour Pin', 'Grandstand', 'Tour Pin', 'Island Green'] },
  temple:{ name:'Lost Temple', kick:'World 2', bg:'#2c4a24', bg2:'#355a2b', carpet:'#3f9a4a', carpet2:'#398c43', wall:'#b9ae84', wallHi:'#ddd3a8', wallLo:'#6f6a4e', ink:'#16200f',
    haz:'water', hazCol:'#2fb58f', hazCol2:'#7fe0c0', hazName:'Jade pool', slow:'mud', slowCol:'#6b5232', slowName:'Vines',
    bumper:'idol', block:'ruin', spinner:'#d8b648', slider:'ruin', tunnel:'door', flag:'#c9a227',
    decor:['fern', 'idol', 'ruin'], acc:'#37e0a0', river:['#1f9a78', '#5fd8b2'], kicker:'#c9a227', loopCol:['#c9a227', '#f1d77a', '#6f5a1a'],
    holes:[] },
  pirate:{ light:true, name:'Pirate Cove', kick:'World 3', bg:'#e6cf8c', bg2:'#dcc27a', carpet:'#1f9a7d', carpet2:'#1b8d72', wall:'#6b4426', wallHi:'#9a6a3e', wallLo:'#3d2614', ink:'#1d2a30',
    haz:'water', hazCol:'#1a86c4', hazCol2:'#7fd0f5', hazName:'The lagoon', slow:'mud', slowCol:'#f3dfa0', slowName:'Soft sand',
    bumper:'barrel', block:'chest', spinner:'#f2e6c9', slider:'plank', tunnel:'cannon', flag:'#1d1d1d',
    decor:['palm', 'barrel', 'anchor', 'chest'], acc:'#ff5a3c', river:['#1677b5', '#6cc6f0'], kicker:'#1d1d1d', loopCol:['#6b4426', '#c9a227', '#3d2614'],
    holes:[] },
  canyon:{ name:'Canyon Mine', kick:'World 4', bg:'#a95a35', bg2:'#b8693e', carpet:'#3d8f4c', carpet2:'#378245', wall:'#6e4a2a', wallHi:'#9a6e44', wallLo:'#3d2814', ink:'#2a140a',
    haz:'water', hazCol:'#3a6f86', hazCol2:'#7fb0c4', hazName:'Flooded shaft', slow:'mud', slowCol:'#c79a6a', slowName:'Gravel',
    bumper:'boulder', block:'crate', spinner:'#c9a227', slider:'cart', tunnel:'shaft', flag:'#ffb347',
    decor:['cactus', 'boulder', 'cart', 'lantern'], acc:'#ffb347', river:['#5a8a9a', '#a8d0dc'], kicker:'#ffb347', loopCol:['#8a8a90', '#c9c9cf', '#3d3a3a'],
    holes:[] },
  volcano:{ name:'Volcano Island', kick:'World 5', bg:'#1f1a1d', bg2:'#2a2427', carpet:'#2f8f4e', carpet2:'#2a8246', wall:'#3a3236', wallHi:'#5c5258', wallLo:'#141113', ink:'#0a0809',
    haz:'water', hazCol:'#ff6a1a', hazCol2:'#ffd25a', hazName:'Lava', slow:'mud', slowCol:'#6a6066', slowName:'Ash',
    bumper:'lavarock', block:'basalt', spinner:'#ff8a2a', slider:'basalt', tunnel:'vent', flag:'#ff6a1a',
    decor:['tiki', 'palm', 'lavarock'], acc:'#ff8a2a', river:['#1f8fb8', '#7fd8f0'], kicker:'#ff6a1a', loopCol:['#ff6a1a', '#ffd25a', '#5a1a08'],
    holes:[] },
  beach:{ light:true, name:'Seashell Shores', kick:'Summer', bg:'#f1dc9c', bg2:'#e8d08a', carpet:'#1ea77d', carpet2:'#1b9a73', wall:'#ffffff', wallHi:'#ffffff', wallLo:'#9fd8e6', ink:'#1b3a4a',
    haz:'water', hazCol:'#22a7e0', hazCol2:'#8fdcff', hazName:'Tide pool', slow:'mud', slowCol:'#f5e2a5', slowName:'Soft sand',
    bumper:'beachball', block:'castle', spinner:'#ffd23f', slider:'surfboard', tunnel:'shell', flag:'#ff5a3c',
    decor:['palm', 'umbrella', 'crab', 'castle'], acc:'#ff5a3c',
    holes:['Low Tide', 'Sandcastle', 'Crab Walk', 'The Lighthouse', 'Tide Pool', 'Boardwalk', 'Shell Game', 'Surf’s Up', 'Sunset'] }
};
// the themes the calendar hands the Daily Hole (the Clubhouse and Tour Week are Tour worlds only)
var CAL_THEMES = ['haunted', 'harvest', 'winter', 'sweetheart', 'shamrock', 'spring', 'firework', 'beach'];
// what theme a calendar day wears (Eastern date, MM-DD)
function themeForDay(dayKey){
  var md = String(dayKey).slice(5), m = +md.slice(0, 2), d = +md.slice(3, 5);
  if (m === 10) return 'haunted';
  if (m === 11 || m === 9) return 'harvest';
  if (m === 12 || (m === 1 && d <= 31)) return 'winter';
  if (m === 2 && d <= 18) return 'sweetheart';
  if ((m === 2) || (m === 3 && d <= 20)) return 'shamrock';
  if (m === 3 || m === 4 || m === 5) return 'spring';
  if ((m === 6 && d >= 20) || (m === 7 && d <= 10)) return 'firework';
  return 'beach';
}

/* THE NINE SHAPES. Each takes a seed and the theme and returns the hole in feet, tee at the bottom
   and the cup toward the top. Par is the template's and the checker plays every hole to it. */
function T_common(r){ return { comps:[], flats:[], walls:[], bumpers:[], blocks:[], movers:[], portals:[], zones:[], props:[] }; }
function addBlock(H, x0, y0, x1, y1, skin){ var r = { x0:Math.min(x0, x1), y0:Math.min(y0, y1), x1:Math.max(x0, x1), y1:Math.max(y0, y1), skin:skin }; H.blocks.push(r); H.walls = H.walls.concat(rectWalls(r, 0.6)); return r; }
function addBumper(H, x, y, r, skin){ H.bumpers.push({ x:x, y:y, r:r, e:0.82, skin:skin }); }
var TEMPLATES = {
  straight:function(r, T){
    var hw = 4 + r() * 1, L = 32 + r() * 6, H = T_common();
    H.poly = [[-hw, 0], [hw, 0], [hw, -L], [-hw, -L]]; H.tee = [0, -2.5]; H.cup = [(r() - 0.5) * (hw * 1.2), -L + 3.2]; H.par = 2;
    var n = 2 + (r() < 0.5 ? 1 : 0);
    for (var i = 0; i < n; i++) addBumper(H, (i % 2 ? 1 : -1) * (1 + r() * (hw - 2.4)), -9 - i * (L - 16) / n, 0.7 + r() * 0.3, T.bumper);
    H.comps.push({ k:'mound', x:(r() - 0.5) * hw, y:-L * 0.62, s:2.2, a:0.18 + r() * 0.12 });
    return H;
  },
  dogleg:function(r, T){
    var hw = 4, L1 = 24 + r() * 4, arm = 13 + r() * 5, H = T_common(), top = -L1, mid = -L1 + 2 * hw;
    H.poly = [[-hw, 0], [hw, 0], [hw, mid], [hw + arm, mid], [hw + arm, top], [-hw, top]];
    H.tee = [0, -2.5]; H.cup = [hw + arm - 3, top + hw + (r() - 0.5) * 2]; H.par = 3;
    addBumper(H, hw + 0.2, mid + 0.4, 0.8, T.bumper);
    H.comps.push({ k:'plane', gx:-0.012, gy:0 });
    return H;
  },
  sbend:function(r, T){
    var H = T_common(), j = r() * 2;
    H.poly = [[-4, 0], [4, 0], [4, -14 - j], [12, -14 - j], [12, -34 - j], [2, -34 - j], [2, -22 - j], [-4, -22 - j]];
    H.tee = [0, -2.5]; H.cup = [7 + (r() - 0.5) * 2, -30.5 - j]; H.par = 3;
    addBumper(H, 4.5, -18 - j, 0.8, T.bumper);
    H.comps.push({ k:'mound', x:-1.5, y:-11, s:2.5, a:0.2 });
    return H;
  },
  mill:function(r, T){
    var hw = 4.5, L = 34 + r() * 3, H = T_common(), y0 = -20, y1 = -23.5;
    H.poly = [[-hw, 0], [hw, 0], [hw, -L], [-hw, -L]]; H.tee = [0, -2.5]; H.cup = [(r() - 0.5) * 4, -L + 3.5]; H.par = 3;
    addBlock(H, -hw, y0, -1.1, y1, T.block); addBlock(H, 1.1, y0, hw, y1, T.block);
    millDoor(H, 0, y0, (r() < 0.5 ? 1 : -1) * (1.15 + r() * 0.5), r() * 6.28);
    H.mill = { x:0, y:(y0 + y1) / 2 };
    return H;
  },
  island:function(r, T){
    var hw = 6.5, L = 30, H = T_common(), cy = -21 + (r() - 0.5) * 2;
    H.poly = [[-hw, 0], [hw, 0], [hw, -L], [-hw, -L]]; H.tee = [0, -2.5]; H.cup = [0, cy]; H.par = 3;
    H.zones.push({ t:'rect', x0:-hw - 1, y0:cy + 7, x1:hw + 1, y1:cy - 5.5, m:T.haz === 'ice' ? M.ICE : M.WATER });
    H.zones.push({ t:'circle', x:0, y:cy, r:3.2, m:M.GREEN });
    var bx = (r() < 0.5 ? -1 : 1) * (1.5 + r() * 2);
    H.zones.push({ t:'rect', x0:bx - 1.1, y0:cy + 7.1, x1:bx + 1.1, y1:cy, m:M.GREEN });
    H.comps.push({ k:'mound', x:0, y:cy, s:2.4, a:-0.12 });
    return H;
  },
  tiers:function(r, T){
    var hw = 4.5, L = 36 + r() * 3, H = T_common();
    H.poly = [[-hw, 0], [hw, 0], [hw, -L], [-hw, -L]]; H.tee = [0, -2.5]; H.cup = [(r() - 0.5) * 4.5, -L + 6]; H.par = 2;
    H.comps.push({ k:'ramp', x0:0, y0:-13, ux:0, uy:-1, len:7, a:0.55 + r() * 0.15 });
    H.comps.push({ k:'ramp', x0:0, y0:-L + 2.6, ux:0, uy:-1, len:2.2, a:0.3 });   // a kicker behind the cup
    addBumper(H, (r() < 0.5 ? -1 : 1) * 2.2, -8, 0.7, T.bumper);
    return H;
  },
  tunnels:function(r, T){
    var hw = 6.5, L = 34, H = T_common(), yd = -17, flip = r() < 0.5 ? -1 : 1;
    H.poly = [[-hw, 0], [hw, 0], [hw, -L], [-hw, -L]]; H.tee = [0, -2.5]; H.cup = [flip * 2.8, -28 - r() * 2]; H.par = 2;
    addBlock(H, -hw, yd, hw, yd - 1.5, T.block);
    // two tunnels: one comes out near the cup, the other in the far corner
    H.portals.push({ ax:flip * 3.5, ay:yd + 1.6, r:0.75, bx:flip * 3.0, by:yd - 2.6, dx:0, dy:-1, skin:T.tunnel });
    H.portals.push({ ax:-flip * 3.5, ay:yd + 1.6, r:0.75, bx:-flip * 5.2, by:yd - 2.6, dx:0, dy:-1, skin:T.tunnel });
    addBumper(H, 0, -9, 0.8, T.bumper);
    return H;
  },
  volcano:function(r, T){
    var hw = 6, L = 26, H = T_common(), cy = -17.5;
    H.poly = [[-hw, 0], [hw, 0], [hw, -L], [-hw, -L]]; H.tee = [0, -2.5]; H.cup = [0, cy]; H.par = 3;
    H.comps.push({ k:'ring', x:0, y:cy, r:2.3, s:0.85, a:0.42 + r() * 0.1 });
    H.flats.push({ x:0, y:cy, s:0.6, keep:0.2 });
    addBumper(H, -3.6, -7, 0.65, T.bumper); addBumper(H, 3.6, -7, 0.65, T.bumper);
    return H;
  },
  gauntlet:function(r, T){
    var hw = 4.5, L = 38, H = T_common();
    H.poly = [[-hw, 0], [hw, 0], [hw, -L], [-hw, -L]]; H.tee = [0, -2.5]; H.cup = [(r() - 0.5) * 3, -L + 3.5]; H.par = 2;
    H.movers.push({ k:'slide', ax:-hw + 1.4, ay:-13, bx:hw - 1.4, by:-13, len:2.4, ang:0, w:0.5, period:2.6 + r() * 0.8, phase:r(), skin:T.slider });
    H.movers.push({ k:'slide', ax:hw - 1.4, ay:-24, bx:-hw + 1.4, by:-24, len:2.4, ang:0, w:0.5, period:3.2 + r() * 0.8, phase:r(), skin:T.slider });
    H.zones.push({ t:'rect', x0:-hw, y0:-29, x1:hw, y1:-31, m:M.MUD });
    return H;
  },
  bowl:function(r, T){
    var hw = 6.5, L = 27, H = T_common(), cy = -17.5;
    H.poly = [[-hw, 0], [hw, 0], [hw, -L], [-hw, -L]]; H.tee = [0, -2.5]; H.cup = [0, cy]; H.par = 2;
    H.comps.push({ k:'mound', x:0, y:cy, s:3.6, a:-0.45 });
    var g = r() * 6.28;
    for (var i = 0; i < 5; i++){ var a = g + i * 6.283 / 5; addBumper(H, Math.cos(a) * 4.4, cy + Math.sin(a) * 4.4, 0.6, T.bumper); }
    return H;
  }
};
var COURSE_ORDER = ['straight', 'dogleg', 'tiers', 'mill', 'island', 'sbend', 'tunnels', 'volcano', 'gauntlet'];
var DAILY_POOL = ['mill', 'island', 'tunnels', 'volcano', 'gauntlet', 'tiers', 'bowl', 'sbend', 'dogleg'];

function buildMini(tplName, seed, themeId, label, extra){
  var T = THEMES[themeId] || THEMES.haunted, r = mulberry(seed), H = TEMPLATES[tplName](r, T);
  // a mirror image is a new hole for free, and the templates are written to survive it
  if (r() < 0.5){
    var fx = function(p){ return [-p[0], p[1]]; };
    H.poly = H.poly.map(fx).reverse(); H.tee = fx(H.tee); H.cup = fx(H.cup);
    H.bumpers.forEach(function(b){ b.x = -b.x; });
    H.blocks = H.blocks.map(function(b){ return { x0:-b.x1, y0:b.y0, x1:-b.x0, y1:b.y1, skin:b.skin }; });
    H.walls = []; H.blocks.forEach(function(b){ H.walls = H.walls.concat(rectWalls(b, 0.6)); });
    H.movers.forEach(function(m){ if (m.k === 'spin' || m.k === 'blade'){ m.x = -m.x; m.omega = -m.omega; m.phase = Math.PI - m.phase; } else { m.ax = -m.ax; m.bx = -m.bx; } });
    H.portals.forEach(function(p){ p.ax = -p.ax; p.bx = -p.bx; p.dx = -p.dx; });
    H.zones.forEach(function(z){ if (z.t === 'rect'){ var a = -z.x1, b = -z.x0; z.x0 = a; z.x1 = b; } else z.x = -z.x; });
    H.comps.forEach(function(c){ if ('x' in c) c.x = -c.x; if ('gx' in c) c.gx = -c.gx; if ('x0' in c) c.x0 = -c.x0; if ('ux' in c) c.ux = -c.ux; if ('nx' in c) c.nx = -c.nx; });
    H.flats.forEach(function(f){ f.x = -f.x; });
    if (H.mill) H.mill.x = -H.mill.x;
  }
  if (extra) ornament(H, r, T, extra);
  return courseFromH(H, tplName, seed, themeId, label);
}
// a hole laid out in feet (H) made into a course the physics and both painters can use
function courseFromH(H, tplName, seed, themeId, label){
  var T = THEMES[themeId] || THEMES.haunted;
  var rivers = (H.rivers || []).map(prepRiver);
  // the rooms, every river's channel and every bridge deck are the course; their union's outline is the rail
  var rooms = H.polys ? H.polys.map(function(p){ return { pts:polyPts(p), z:p.z || 0 }; }) : [{ pts:H.poly, z:0 }];
  var PS = rooms.map(function(r){ return r.pts; }).concat(rivers.map(function(r){ return r.poly; }));
  var all = PS.reduce(function(a, p){ return a.concat(p); }, []), xs = all.map(function(p){ return p[0]; }), ys = all.map(function(p){ return p[1]; });
  var pad = 6, b = [Math.min.apply(null, xs) - pad, Math.min.apply(null, ys) - pad, Math.max.apply(null, xs) + pad, Math.max.apply(null, ys) + pad];
  var edges = PS.length > 1 ? unionEdges(PS) : polyWalls(PS[0], 0, 0).map(function(w){ return [w[0], w[1], w[2], w[3]]; });
  var bridges = (H.bridges || []).map(function(z){ return { x0:Math.min(z.x0, z.x1), y0:Math.min(z.y0, z.y1), x1:Math.max(z.x0, z.x1), y1:Math.max(z.y0, z.y1), period:z.period || 4, phase:z.phase || 0, duty:z.duty == null ? 0.5 : z.duty, hinge:z.hinge || 'n' }; });
  var C = { kind:'mini', tpl:tplName, theme:themeId, T:T, name:label || tplName, bounds:b, poly:PS[0], polys:PS, allPts:all, edges:edges, rooms:rooms, comps:H.comps, flats:H.flats,
    stimp:H.stimp || (themeId === 'winter' ? 9.5 : 9), cup:H.cup, cupR:CUP_R_MINI, tee:H.tee, par:H.par,
    walls:edges.map(function(e){ return [e[0], e[1], e[2], e[3], 0, 0.72]; }).concat(H.walls), bumpers:H.bumpers, blocks:H.blocks, movers:H.movers, portals:H.portals, zones:H.zones, mill:H.mill, seed:seed,
    secret:H.secret || [], loops:(H.loops || []).map(function(L){ var l = Math.hypot(L.dx, L.dy) || 1; return { x:L.x, y:L.y, dx:L.dx / l, dy:L.dy / l, r:L.r || 0.75, w:L.w || 1.4, off:L.off || 0, vmin:L.vmin }; }),
    ramps:(H.ramps || []).map(function(R){ var l = Math.hypot(R.dx, R.dy) || 1; return { x:R.x, y:R.y, dx:R.dx / l, dy:R.dy / l, w:R.w || 2, h:R.h || 0.4, ang:R.ang || 24, len:R.len || 1.6 }; }),
    rivers:rivers, bridges:bridges, turns:(H.turns || []).map(function(u){ return { x:u.x, y:u.y, r:u.r || 2, omega:u.omega || 1.2 }; }),
    belts:(H.belts || []).map(function(z){ return { x0:Math.min(z.x0, z.x1), y0:Math.min(z.y0, z.y1), x1:Math.max(z.x0, z.x1), y1:Math.max(z.y0, z.y1), ax:z.ax, ay:z.ay }; }) };
  C.matFn = function(x, y){
    if (inAny(PS, x, y) < 0) return M.OUT;
    var m = M.GREEN;
    if (rivers.length && riverAt(C, x, y)) m = M.FLOW;
    for (var i = 0; i < H.zones.length; i++){ var z = H.zones[i];
      if (z.t === 'rect' ? (x >= Math.min(z.x0, z.x1) && x <= Math.max(z.x0, z.x1) && y >= Math.min(z.y0, z.y1) && y <= Math.max(z.y0, z.y1)) : Math.hypot(x - z.x, y - z.y) <= z.r) m = z.m; }
    for (var k = 0; k < bridges.length; k++){ var bb = bridges[k]; if (x >= bb.x0 && x <= bb.x1 && y >= bb.y0 && y <= bb.y1) m = M.WATER; }   // the water under a bridge
    return m;
  };
  /* A ROOM CAN SIT HIGHER OR LOWER than the next, for the picture only. The physics reads the green's
     own gentle slope; the drop between two rooms is crossed by a river, a pipe or a ramp, never rolled. */
  C.tierAt = function(x, y){
    if (rivers.length){ var rv = riverAt(C, x, y); if (rv) return rv.r.z0 + (rv.r.z1 - rv.r.z0) * clamp(rv.s / rv.r.L, 0, 1); }
    var z = null; for (var i = 0; i < rooms.length; i++) if (inPoly(rooms[i].pts, x, y)) z = z == null ? rooms[i].z : Math.max(z, rooms[i].z);
    return z || 0;
  };
  C.props = decorFor(C, T, mulberry(seed ^ 0x51ed));
  finishCourse(C);
  return C;
}
/* THE DAILY IS DRESSED UP: a few more bumpers and a roll in the carpet on top of its template, each
   placed where it leaves the tee, the cup, the rails and everything already there some room. The
   checker plays a season of them to par, so this can never build a hole nobody can make. */
function ornament(H, r, T, n){
  var xs = H.poly.map(function(p){ return p[0]; }), ys = H.poly.map(function(p){ return p[1]; });
  var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
  var clear = function(x, y, need){
    if (!inPoly(H.poly, x, y)) return false;
    for (var i = 0; i < H.poly.length; i++){ var a = H.poly[i], c = H.poly[(i + 1) % H.poly.length]; if (segDist(x, y, a[0], a[1], c[0], c[1]) < need + 0.6) return false; }
    if (Math.hypot(x - H.tee[0], y - H.tee[1]) < 4.5 || Math.hypot(x - H.cup[0], y - H.cup[1]) < 4) return false;
    if (H.bumpers.some(function(b){ return Math.hypot(b.x - x, b.y - y) < b.r + need + 1.6; })) return false;
    if (H.blocks.some(function(b){ return x > b.x0 - need - 1.4 && x < b.x1 + need + 1.4 && y > b.y0 - need - 1.4 && y < b.y1 + need + 1.4; })) return false;
    if (H.movers.some(function(m){ return m.k === 'blade' ? Math.hypot(m.x - x, m.y - y) < 4.5 + need : m.k === 'spin' ? Math.hypot(m.x - x, m.y - y) < m.len + need + 0.9 : segDist(x, y, m.ax, m.ay, m.bx, m.by) < m.len / 2 + need + 0.9; })) return false;
    if (H.portals.some(function(p){ return Math.hypot(p.ax - x, p.ay - y) < 2.2 + need || Math.hypot(p.bx - x, p.by - y) < 2.2 + need; })) return false;
    if (H.zones.some(function(z){ return z.t === 'rect' ? (x > Math.min(z.x0, z.x1) - 1 && x < Math.max(z.x0, z.x1) + 1 && y > Math.min(z.y0, z.y1) - 1 && y < Math.max(z.y0, z.y1) + 1) : Math.hypot(x - z.x, y - z.y) < z.r + 1; })) return false;
    return true;
  };
  var placed = 0, tries = 0;
  while (placed < n && tries++ < 300){ var x = x0 + r() * (x1 - x0), y = y0 + r() * (y1 - y0), rad = 0.55 + r() * 0.3;
    if (clear(x, y, rad)){ addBumper(H, x, y, rad, T.bumper); placed++; } }
  tries = 0;
  while (tries++ < 100){ var mx = x0 + r() * (x1 - x0), my = y0 + r() * (y1 - y0);
    if (clear(mx, my, 1.2)){ H.comps.push({ k:'mound', x:mx, y:my, s:1.6 + r() * 1.2, a:(r() < 0.5 ? -1 : 1) * (0.12 + r() * 0.12) }); break; } }
}
function decorFor(C, T, r){
  var out = [], b = C.bounds, tries = 0;
  while (out.length < 14 && tries++ < 400){
    var x = b[0] + r() * (b[2] - b[0]), y = b[1] + r() * (b[3] - b[1]), s = 1.4 + r() * 1.4;
    if (edgeDist(C.edges, x, y) < s + 0.9 || inAny(C.polys, x, y) >= 0) continue;
    if (out.some(function(o){ return Math.hypot(o.x - x, o.y - y) < (o.s + s) * 0.8; })) continue;
    out.push({ x:x, y:y, s:s, k:T.decor[Math.floor(r() * T.decor.length)] });
  }
  return out;
}
function themedCourse(themeId){
  var T = THEMES[themeId];
  return COURSE_ORDER.map(function(tpl, i){ return { tpl:tpl, seed:hstr('course:' + themeId + ':' + i), theme:themeId, name:T.holes[i], n:i + 1 }; });
}
function dailyShape(dayKey){
  var th = themeForDay(dayKey), seed = hstr('daily:' + dayKey), r = mulberry(seed);
  // the shapes go round in a shuffled cycle, the way the game deals its daily courses, so two days
  // running are never the same shape of hole
  var dn = Math.floor(Date.UTC(+dayKey.slice(0, 4), +dayKey.slice(5, 7) - 1, +dayKey.slice(8, 10)) / 86400000), L = DAILY_POOL.length;
  var cyc = DAILY_POOL.slice(), cr = mulberry(hstr('cycle:' + Math.floor(dn / L)));
  for (var i = cyc.length - 1; i > 0; i--){ var j = Math.floor(cr() * (i + 1)), t = cyc[i]; cyc[i] = cyc[j]; cyc[j] = t; }
  var tpl = cyc[((dn % L) + L) % L], T = THEMES[th];
  return { tpl:tpl, seed:seed, theme:th, name:T.holes[Math.floor(r() * T.holes.length)], day:dayKey, extra:2 };
}
/* THE DAILY HOLE IS A TOUR HOLE IN THE DAY'S CLOTHES. The simple shapes above made one score for the
   whole field, so the daily now deals one of the Putt Putt Tour's set piece holes from worlds 2 to 5
   (loops, rivers, pipes, jumps, drawbridges), dressed in the calendar's theme. Its par is the tour's,
   which is the solver's, so it is hard and it is fair: the recorded route in routes.json beats it.
   The holes go round in a shuffled cycle, so no hole comes back until all of them have been dealt.
   A layout reads its theme for colours and skins only (no tour hole asks the theme anything about
   its physics), so the route that beats it on the tour beats it in any clothes. */
var DAILY_FROM = 19, DAILY_TO = 90;
function dailyLevel(dayKey){
  var dn = Math.floor(Date.UTC(+dayKey.slice(0, 4), +dayKey.slice(5, 7) - 1, +dayKey.slice(8, 10)) / 86400000), L = DAILY_TO - DAILY_FROM + 1;
  var cyc = []; for (var n = DAILY_FROM; n <= DAILY_TO; n++) cyc.push(n);
  var cr = mulberry(hstr('dlycycle:' + Math.floor(dn / L)));
  for (var i = cyc.length - 1; i > 0; i--){ var j = Math.floor(cr() * (i + 1)), t = cyc[i]; cyc[i] = cyc[j]; cyc[j] = t; }
  return cyc[((dn % L) + L) % L];
}
// the day's theme, seed and hole name still come from the calendar deal above
function dailyHole(dayKey){
  var d = dailyShape(dayKey), n = dailyLevel(dayKey);
  return { tour:n, tid:'main', daily:1, tpl:'dly' + n, seed:d.seed, theme:d.theme, name:d.name, day:dayKey };
}
/* ================================================================= THE PUTT PUTT TOURS: 90 + 18 HOLES */
/* TWO TOURS. The Putt Putt Tour is everybody's: five worlds of eighteen, played strictly in order, on
   the game's own evergreen worlds (never a season's theme). The Members Tour is the Tour Pass holder's:
   eighteen holes on the season's theme, the hardest on the site, paying the most.

   Every hole is laid out here by hand, in feet, tee at the bottom and the cup toward the top, and no
   two share a layout. EVERY HOLE HAS SOMETHING TO PLAY: an obstacle, a puzzle or a clock. The set
   pieces are the engine's own (a loop the ball has to be quick enough to ride, a river that carries it
   down a level, a pipe, a ramp jump over the hazard, a drawbridge on a clock, a turntable), and each
   world brings its own on top of the ones before it. Par is the solver's (golf/putt/solve.mjs): the
   fewest putts with room for error, plus one, never under 3. Every eighteenth hole is the world's
   signature hole. */
var PER = 18;
var WORLDS = [
  { id:'clubhouse', name:'The Clubhouse', theme:'clubhouse', blurb:'Practice greens behind the clubhouse.', haz:['Windmills', 'Loops', 'Drawbridges'] },
  { id:'temple', name:'Lost Temple', theme:'temple', blurb:'Jade rivers, stone doors and turning floors.', haz:['Rivers', 'Doors', 'Turning floors'] },
  { id:'pirate', name:'Pirate Cove', theme:'pirate', blurb:'Gangplanks on a clock, cannons and the lagoon.', haz:['Gangplanks', 'Cannons', 'Jumps'] },
  { id:'canyon', name:'Canyon Mine', theme:'canyon', blurb:'Mine carts, shafts and the flood channel.', haz:['Mine carts', 'Shafts', 'Rail loops'] },
  { id:'volcano', name:'Volcano Island', theme:'volcano', blurb:'Lava on every side. Jump it, ride it, or go round.', haz:['Lava', 'Lava jumps', 'Everything'] }
];
// a room: a rectangle at a height (for the picture; the drop between rooms is crossed by a set piece)
function rm(x0, y0, x1, y1, z){ var a = Math.min(x0, x1), b = Math.max(x0, x1), c = Math.max(y0, y1), d = Math.min(y0, y1); return { pts:[[a, c], [b, c], [b, d], [a, d]], z:z || 0 }; }
function pg(pts, z){ return { pts:pts, z:z || 0 }; }
function hole(rooms, tee, cup){ var H = T_common(); H.polys = rooms.map(function(r){ return r.pts ? r : { pts:r, z:0 }; }); H.poly = H.polys[0].pts; H.tee = tee; H.cup = cup;
  H.rivers = []; H.loops = []; H.ramps = []; H.bridges = []; H.turns = []; return H; }
function rectP(w, L, x0){ x0 = x0 || 0; return [[x0 - w / 2, 0], [x0 + w / 2, 0], [x0 + w / 2, -L], [x0 - w / 2, -L]]; }
function lvH(poly, tee, cup){ var H = T_common(); H.poly = poly; H.tee = tee; H.cup = cup; return H; }
function bumps(H, T, list){ list.forEach(function(b){ addBumper(H, b[0], b[1], b[2] || 0.75, T.bumper); }); }
function pads(H, list){ list.forEach(function(b){ H.bumpers.push({ x:b[0], y:b[1], r:b[2] || 0.75, e:1.32, skin:'pad' }); }); }
function zoneR(H, m, x0, y0, x1, y1){ H.zones.push({ t:'rect', x0:x0, y0:y0, x1:x1, y1:y1, m:m }); }
function zoneC(H, m, x, y, r){ H.zones.push({ t:'circle', x:x, y:y, r:r, m:m }); }
function blk(H, T, x0, y0, x1, y1){ return addBlock(H, x0, y0, x1, y1, T.block); }
// a pen round the cup, open on one side toward the middle of the room: the ball has to be brought round
// beside the cup and played in sideways. Open on the far side instead, a ball bounced off the end wall
// rolled straight back in, and the pen cost nothing.
function pen(H, T, cx, cy){ var open = cx > 0 ? -1 : 1;
  blk(H, T, cx - 1.6, cy + 1.75, cx + 1.6, cy + 1.2); blk(H, T, cx - 1.6, cy - 1.2, cx + 1.6, cy - 1.75);
  if (open > 0) blk(H, T, cx - 1.6, cy + 1.75, cx - 1.1, cy - 1.75); else blk(H, T, cx + 1.1, cy + 1.75, cx + 1.6, cy - 1.75); }
function millAt(H, T, y0, hw, omega, xc){ xc = xc || 0;
  addBlock(H, xc - hw, y0, xc - 1.1, y0 - 3.5, T.block); addBlock(H, xc + 1.1, y0, xc + hw, y0 - 3.5, T.block);
  millDoor(H, xc, y0, omega, 0.7); H.mill = { x:xc, y:y0 - 1.75 }; }
/* The door of a windmill: the sails across its mouth (a 'blade', see bladeSpan) and a conveyor through
   the house. The tunnel is under the tower and out of sight, so a ball that died in there would be a
   ball nobody can see to putt; the belt carries it out of the back the way it was going. */
function millDoor(H, xc, y0, omega, phase){
  H.movers.push({ k:'blade', x:xc, y:y0 + 0.35, r:3.75, hz:3.81, sw:0.9, w:0.3, omega:omega * 0.6, phase:phase });
  belt(H, xc - 1.1, y0, xc + 1.1, y0 - 3.6, 0, -6); }
// a free spinner with no tower: a blade turning on the carpet
function spinner(H, T, x, y, len, omega, arms){ H.movers.push({ k:'spin', x:x, y:y, len:len || 2.2, hub:0.3, arms:arms || 2, w:0.3, omega:omega, phase:0.3, skin:T.spinner }); }
// a gate: a bar across a gap in a wall that slides into the wall and back on a clock. dir +1 opens into the wall on the right.
function gateAt(H, T, y, gx0, gx1, period, phase, dir){ var w = gx1 - gx0, cx = (gx0 + gx1) / 2; dir = dir || 1;
  H.movers.push({ k:'slide', ax:cx, ay:y, bx:cx + dir * (w + 0.4), by:y, len:w + 0.3, ang:0, w:0.42, period:period, phase:phase || 0, skin:T.slider }); }
// a wall across the course with one gap in it, and a gate in the gap
function gateWall(H, T, y, x0, x1, gx0, gx1, period, phase, dir){ blk(H, T, x0, y, gx0, y - 1.2); blk(H, T, gx1, y, x1, y - 1.2); gateAt(H, T, y - 0.6, gx0, gx1, period, phase, dir); }
function slider(H, T, y, x0, x1, period, phase, len){ H.movers.push({ k:'slide', ax:x0, ay:y, bx:x1, by:y, len:len || 2.4, ang:0, w:0.5, period:period, phase:phase || 0, skin:T.slider }); }
function vslider(H, T, x, y0, y1, period, phase, len){ H.movers.push({ k:'slide', ax:x, ay:y0, bx:x, by:y1, len:len || 2.4, ang:Math.PI / 2, w:0.5, period:period, phase:phase || 0, skin:T.slider }); }
function portal(H, T, ax, ay, bx, by, dx, dy){ H.portals.push({ ax:ax, ay:ay, r:0.75, bx:bx, by:by, dx:dx, dy:dy, skin:T.tunnel }); }
// a pipe: in at one mouth, out of sight for the trip, out of the other still rolling. vcap: a ball quicker than this skips the mouth
function pipe(H, T, ax, ay, bx, by, dx, dy, dur, vcap, keep){ H.portals.push({ ax:ax, ay:ay, r:0.72, bx:bx, by:by, dx:dx, dy:dy, dur:dur || 0.8, vcap:vcap || 0, keep:keep || 0.85, skin:T.tunnel }); }
function belt(H, x0, y0, x1, y1, ax, ay){ H.belts = H.belts || []; H.belts.push({ x0:x0, y0:y0, x1:x1, y1:y1, ax:ax, ay:ay }); zoneR(H, M.BELT, x0, y0, x1, y1); }
function flatAt(H, x, y){ H.flats.push({ x:x, y:y, s:0.8, keep:0.2 }); }
// a loop of track in a corridor: entered at (x, y) heading (dx, dy). Quick enough and the ball goes over the top; slow and it rolls back
function loopAt(H, x, y, dx, dy, r, w){ H.loops.push({ x:x, y:y, dx:dx, dy:dy, r:r || 0.7, w:w || 1.6 }); }
/* a jump: the ramp's lip at (x, y) facing (dx, dy) (straight up or across the screen), `gap` feet of the
   hazard beyond it across a corridor cw wide. Short of the far side is the hazard; too slow to climb it
   and it rolls back */
function jump(H, x, y, dx, dy, gap, cw, opt){ opt = opt || {};
  H.ramps.push({ x:x, y:y, dx:dx, dy:dy, w:opt.w || cw, h:opt.h || 0.45, ang:opt.ang || 30, len:opt.len || 1.8 });
  if (dx === 0) zoneR(H, opt.m || M.WATER, x - cw / 2, y + dy * 0.02, x + cw / 2, y + dy * gap); else zoneR(H, opt.m || M.WATER, x + dx * 0.02, y - cw / 2, x + dx * gap, y + cw / 2); }
function river(H, pts, w, vc, z0, z1){ H.rivers.push({ pts:pts, w:w || 1.6, vc:vc || 6, z0:z0 || 0, z1:z1 == null ? (z0 || 0) : z1 }); }
// a drawbridge over a gap of hazard: down (a deck) for duty of every period, up (the hazard) the rest
function drawb(H, x0, y0, x1, y1, period, phase, duty){ H.bridges.push({ x0:x0, y0:y0, x1:x1, y1:y1, period:period || 3.6, phase:phase || 0, duty:duty == null ? 0.5 : duty }); }
// a shallow bowl round the cup: a ball arriving a little off line or a little quick is gathered in. It is what
// lets a long secret line be a skill rather than a fluke (a degree of aim at 30 ft is wider than the cup).
function bowl(H, x, y, s, a){ H.comps.push({ k:'mound', x:x, y:y, s:s || 1.6, a:-(a || 0.1) }); }
function disc(H, x, y, r, omega){ H.turns.push({ x:x, y:y, r:r || 2.2, omega:omega || 1.2 }); }
/* THE SECRET LINE. A hole can carry a shortcut: a shorter way to the cup that the layout does not
   advertise (a pipe mouth tucked behind a bumper, a crack at the end of a wall that only a bank finds, a
   kicker that clears the water). secret(H, x0, y0, x1, y1) marks where it is. The solver plays the hole
   twice on the same carpet: once never letting the ball through a secret, which is THE OBVIOUS ROUTE and
   sets par (a birdie with room for error), and once free, which has to be strictly shorter and has to go
   through one. So every hole can be beaten the way it looks, and looking harder pays in strokes. */
function secret(H, x0, y0, x1, y1){ (H.secret = H.secret || []).push({ x0:Math.min(x0, x1), y0:Math.min(y0, y1), x1:Math.max(x0, x1), y1:Math.max(y0, y1) }); }
/* par is filled in by the solver (golf/putt/solve.mjs) and written here */
var LEVELS = [
  // ---- 1 THE CLUBHOUSE: aim and pace through the classics, and the first secret lines
  // First Tee: the bumper hides the cup from the tee, so it is two putts round it. The secret: the side walls. A bank off either one comes in past the bumper.
  { par:3, f:function(T){ var H = hole([rm(-4, 0, 4, -26)], [0, -2.5], [0, -22.5]); bumps(H, T, [[0, -19.4, 0.8], [-2.7, -6.5, 0.5], [2.7, -6.5, 0.5]]);
    secret(H, -4, -8, -3.5, -17); secret(H, 3.5, -8, 4, -17); return H; } },
  // The Slope: play the break round the sand, two putts. The secret: everything rolls left, and on the low side there is a drain that comes up by the cup.
  { par:3, f:function(T){ var H = hole([rm(-5, 0, 5, -30)], [-1.5, -2.5], [2.5, -26]); H.comps.push({ k:'plane', gx:0.028, gy:0 }); zoneC(H, M.SAND, -1, -16, 2); bumps(H, T, [[2.2, -14]]); flatAt(H, 2.5, -26);
    pipe(H, T, -4.2, -9.5, 2.5, -24.6, 0, -1, 0.8, 0, 0.3); secret(H, -5, -8.6, -3.3, -10.4); return H; } },
  // Bank Shot: two putts, to the corner and round it. The secret: off the top wall the bank cuts the corner.
  { par:3, f:function(T){ var H = hole([rm(-5, 0, 5, -24), rm(4.9, -14, 16, -24)], [-3, -2.5], [12, -19]); bumps(H, T, [[12.5, -15.4, 0.55]]); H.comps.push({ k:'plane', gx:-0.008, gy:0 });
    secret(H, 5.5, -23.4, 14, -24); bowl(H, 12, -19); return H; } },
  // The Windmill: round either side of the house, two putts. The secret: through the door, if the sails let you.
  { par:3, f:function(T){ var H = hole([rm(-7, 0, 7, -38)], [0, -2.5], [0, -33]);
    millAt(H, T, -18, 4.5, 1.3); secret(H, -1.1, -18, 1.1, -21.5); bumps(H, T, [[-2.8, -28.5, 0.5], [2.8, -28.5, 0.5]]); bowl(H, 0, -33, 1.4, 0.12); return H; } },
  // Sand Bar: blast it through the sand and putt out. The secret: off the right wall the ball crosses the trap on the one strip of carpet left in it.
  { par:3, f:function(T){ var H = hole([rm(-5, 0, 5, -30)], [0, -2.5], [-1.5, -25]); zoneR(H, M.SAND, -5, -14, 5, -17); zoneR(H, M.GREEN, 2.6, -14, 4.6, -17); secret(H, 2.6, -14, 4.6, -17); bumps(H, T, [[-3.2, -21, 0.55]]); bowl(H, -1.5, -25); return H; } },
  // Pipe Dream: the big pipe climbs to the top room, then putt out; the left one is a dud back to the tee. The secret: the little pipe in the corner, behind the bumper, comes out lined up with the cup.
  { par:3, f:function(T){ var H = hole([rm(-5, 0, 5, -16), rm(-5, -20, 5, -34, 0.6)], [0, -2.5], [-2.5, -30]);
    pipe(H, T, 0, -12.5, 3.4, -21.4, 0, -1, 0.8); pipe(H, T, -3.2, -12.5, 0, -1.2, 0, 1, 0.8); bumps(H, T, [[2.1, -12.6, 0.5]]);
    pipe(H, T, 3.6, -14.6, -2.5, -21.4, 0, -1, 0.8, 0, 0.62); secret(H, 2.8, -13.8, 4.4, -15.4); return H; } },
  // Slide Rule: time the slider through the wall, then putt out. The secret: there is a crack where the wall meets the right rail, and off the rail beyond it the ball comes back to the cup.
  { par:3, f:function(T){ var H = hole([rm(-4.5, 0, 4.5, -34)], [0, -2.5], [0, -30]); blk(H, T, -4.5, -14, -1.2, -15.2); blk(H, T, 1.2, -14, 3.5, -15.2);
    secret(H, 3.5, -14, 4.5, -15.2); slider(H, T, -14.6, -2.6, 2.6, 2.8, 0, 1.8); bumps(H, T, [[-2.5, -24, 0.5], [0, -23, 0.6]]); bowl(H, 0, -30); return H; } },
  // Causeway: up the railed causeway to the island, then putt out. The secret: the kicker in front of the water skips the ball straight onto the island.
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -28)], [0, -2.5], [0, -17]); zoneR(H, M.WATER, -6, -11.06, 6, -25.5); zoneC(H, M.GREEN, 0, -17, 3); zoneR(H, M.GREEN, 2.2, -11, 4.4, -17);
    blk(H, T, 1.9, -11, 2.2, -16.2); blk(H, T, 4.4, -11, 4.7, -16.6); jump(H, -0.6, -11, 0, -1, 0.05, 2.2, { m:M.GREEN, h:0.9, ang:40 }); secret(H, -1.7, -10.3, 0.5, -11); bowl(H, 0, -17, 1.4, 0.12); blk(H, T, -1.8, -18.9, 1.8, -19.3); return H; } },
  // The Kicker: over the pond off the kicker, then putt round the rock.
  { par:3, f:function(T){ var H = hole([rm(-5, 0, 5, -12), rm(-5, -11.9, 5, -15.1), rm(-5, -15, 5, -30)], [0, -2.5], [-2, -26]); jump(H, 0, -12, 0, -1, 3, 10, { w:3.2 }); bumps(H, T, [[-1.2, -21.4, 0.65]]); return H; } },
  // First Loop: through the loop and putt out round the bumper.
  { par:3, f:function(T){ var H = hole([rm(-4, 0, 4, -12), pg([[-4, -12], [4, -12], [0.8, -15.6], [-0.8, -15.6]]), rm(-0.8, -15.5, 0.8, -19.5), rm(-4, -19.4, 4, -34)], [0, -2.5], [-2.2, -30]);
    loopAt(H, 0, -17.5, 0, -1, 0.6, 1.6); bumps(H, T, [[-0.6, -27.6, 0.55]]); return H; } },
  // Two Gates: time two gates, then putt out into the bowl.
  { par:3, f:function(T){ var H = hole([rm(-4.5, 0, 4.5, -40)], [0, -2.5], [0, -36]); blk(H, T, -4.5, -13, -1.2, -14.2); blk(H, T, 1.2, -13, 4.5, -14.2); gateAt(H, T, -13.6, -1.2, 1.2, 3.2, 0, 1);
    gateWall(H, T, -26, -4.5, 4.5, 1.2, 3.4, 3.8, 0.4, -1); bowl(H, 0, -36); return H; } },
  // Conveyor: across the belt aiming off its push, then putt out. The secret: let the belt have it. It dumps the ball in a chute at the far end, and the chute comes out at the cup.
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -34)], [0, -2.5], [-3, -29]); belt(H, -6, -14, 6, -19, 5, 0); bumps(H, T, [[2.4, -24, 0.7]]);
    pipe(H, T, 5.3, -16.5, -3, -25.4, 0, -1, 0.9, 0, 0.4); secret(H, 4.5, -15.6, 6, -17.4); return H; } },
  // Drawbridge: a curb guards the moat, so only the bridge gets you across; time it and putt out round the bumper.
  { par:3, f:function(T){ var H = hole([rm(-4, 0, 4, -14), rm(-4, -13.9, 4, -17.1), rm(-4, -17, 4, -32)], [0, -2.5], [2.6, -29]); zoneR(H, M.WATER, -4, -14, 4, -17); drawb(H, -1.4, -14, 1.4, -17, 3.4, 0, 0.55); bumps(H, T, [[2.0, -23.4, 0.6]]); bowl(H, 2.6, -29);
    blk(H, T, 1.4, -13.3, 4, -13.9); blk(H, T, -4, -13.3, -1.4, -13.9); return H; } },
  // Spin Cycle: through the turning floor and putt out.
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -32)], [0, -2.5], [-2, -28]); disc(H, 0, -16, 2.6, 1.3); blk(H, T, -6, -15, -2.9, -17); blk(H, T, 2.9, -15, 6, -17); bumps(H, T, [[0.2, -24.6, 0.5]]); return H; } },
  // The Creek: ride the creek down to the lower green and putt out. The secret: the creek keeps its speed, so feed it hard and it carries to the cup.
  { par:3, f:function(T){ var H = hole([rm(2, 0, 10, -14), rm(-9, -25, 1, -38, -1.5)], [6, -2.5], [-4, -34]); river(H, [[6, -13], [6, -18], [1, -22], [-4, -22], [-4, -26]], 1.8, 6, 0, -1.5); bumps(H, T, [[6, -8, 0.7], [-2.6, -30.5, 0.5]]); return H; } },
  // Double Mill: round two windmills by the side lanes, two putts. The secret: through both doors.
  { par:3, f:function(T){ var H = hole([rm(-7, 0, 7, -46)], [0, -2.5], [0, -42]);
    millAt(H, T, -12, 4.5, 1.4); millAt(H, T, -28, 4.5, -1.1); secret(H, -1.1, -12, 1.1, -15.5); secret(H, -1.1, -28, 1.1, -31.5); bumps(H, T, [[-2.8, -38.5, 0.5], [2.8, -38.5, 0.5]]); return H; } },
  // Loop the Pond: through the loop, over the drawbridge (the curb keeps a stray ball out of the moat), putt out.
  { par:3, f:function(T){ var H = hole([rm(-4, 0, 4, -10), pg([[-4, -10], [4, -10], [0.8, -13.5], [-0.8, -13.5]]), rm(-0.8, -13.4, 0.8, -17), rm(-5, -16.9, 5, -26), rm(-5, -25.9, 5, -28.6), rm(-5, -28.5, 5, -40)], [0, -2.5], [2, -36]);
    loopAt(H, 0, -15, 0, -1, 0.65, 1.6); zoneR(H, M.WATER, -5, -26, 5, -28.5); drawb(H, -1.4, -26, 1.4, -28.5, 3, 0.2, 0.55); blk(H, T, -5, -25.3, -1.4, -25.9); blk(H, T, 1.4, -25.3, 5, -25.9); return H; } },
  // Clubhouse Classic: the big pipe, the windmill, the drawbridge, then round the end of the last wall. The secret: the small pipe tucked behind the bumper skips the windmill and the moat.
  { par:4, sig:true, f:function(T){ var H = hole([rm(-5, 0, 5, -12), rm(-6, -16, 6, -34, 0.6), rm(-6, -33.9, 6, -36.6, 0.6), rm(-6, -36.5, 6, -48, 0.6)], [0, -2.5], [-2, -44]);
    pipe(H, T, -3, -9, -3, -17.6, 0, -1, 0.8, 0, 0.2); pipe(H, T, 0.4, -9, 0, -1.2, 0, 1, 0.8); bumps(H, T, [[2.6, -8.4, 0.5]]); millAt(H, T, -28, 6, 1.3); zoneR(H, M.WATER, -6, -34, 6, -36.5); drawb(H, -1.4, -34, 1.4, -36.5, 3.6, 0.5, 0.55);
    blk(H, T, -6, -33.3, -1.4, -33.9); blk(H, T, 1.4, -33.3, 6, -33.9);
    pipe(H, T, 3.8, -10.4, 3, -37.4, 0, -1, 0.9, 0, 0.55); secret(H, 3, -9.6, 4.6, -11.2); blk(H, T, -6, -39.4, 1.8, -40); flatAt(H, -2, -44); return H; } },
  // ---- 2 LOST TEMPLE: jade rivers, stone doors, turning floors and the vines
  // Temple Steps: up the steps between the pillars, two putts. The secret: a serpent's mouth at the foot of the steps, in the right corner, comes out under the cup.
  { par:3, f:function(T){ var H = hole([rm(-5, 0, 5, -34)], [0, -2.5], [0, -30]); H.comps.push({ k:'ramp', x0:0, y0:-11, ux:0, uy:-1, len:5, a:0.5 }); bumps(H, T, [[-2.2, -20], [2.2, -23.5], [-1.2, -26.6, 0.55]]); flatAt(H, 0, -30);
    pipe(H, T, 4.2, -9.4, 0, -28.5, 0, -1, 0.8, 0, 0.2); secret(H, 3.4, -8.6, 5, -10.2); return H; } },
  // Jade Stream: down the stream to the lower court and putt out round the pillar.
  { par:3, f:function(T){ var H = hole([rm(-10, 0, -2, -12), rm(1, -19, 11, -34, -1.2)], [-6, -2.5], [8, -30]); river(H, [[-6, -11.5], [-6, -16], [0, -18], [6, -16], [6, -20]], 1.8, 6, 0, -1.2); bumps(H, T, [[6, -25.5, 0.7], [-6, -7, 0.65]]); return H; } },
  // Two Doors: the left door climbs to the upper court; putt out through the gap in the vines. The secret: the right door, which looks like it goes nowhere, comes out at the cup.
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -14), rm(-6, -18, 6, -34, 0.8)], [0, -2.5], [3, -30]);
    pipe(H, T, -3.2, -11, -4, -19.6, 0, -1, 0.8); pipe(H, T, 3.2, -11, 3, -28.5, 0, -1, 0.8, 0, 0.2); secret(H, 2.4, -10.2, 4, -11.8); zoneR(H, M.MUD, -6, -24, 6, -26.5); zoneR(H, M.GREEN, 0.8, -24, 2.6, -26.5); return H; } },
  // Turning Floor: through the turning floor and putt out past the pillar.
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -32)], [0, -2.5], [3, -28]); disc(H, 0, -16, 3, -1.1); blk(H, T, -6, -15, -3.2, -17); blk(H, T, 3.2, -15, 6, -17); bumps(H, T, [[0, -22.5, 0.6]]); return H; } },
  // Vine Maze: follow the switchbacks, three putts. The secret: a slit in the middle wall lines up with both gaps, and a straight putt from the tee goes through all three.
  { par:4, f:function(T){ var H = hole([rm(-7, 0, 7, -42)], [5.5, -2.5], [2.6, -38]); blk(H, T, -7, -10, 3, -11.5); blk(H, T, -3, -20, 3.4, -21.5); blk(H, T, 4.4, -20, 7, -21.5); blk(H, T, -7, -29, 2, -30.5);
    secret(H, 3.4, -20, 4.4, -21.5); zoneR(H, M.MUD, -7, -14, -1, -16.5); zoneR(H, M.MUD, -7, -23.5, -2.5, -26); bumps(H, T, [[-1.2, -25.2, 0.6]]); return H; } },
  // Golden Ring: through the ring of the loop, time the stone door, putt out.
  { par:3, f:function(T){ var H = hole([rm(-4, 0, 4, -11), pg([[-4, -11], [4, -11], [0.8, -14.6], [-0.8, -14.6]]), rm(-0.8, -14.5, 0.8, -18.8), rm(-4.5, -18.7, 4.5, -36)], [0, -2.5], [-1.5, -32]);
    loopAt(H, 0, -16.6, 0, -1, 0.75, 1.6); blk(H, T, -4.5, -25, -1.1, -26.2); blk(H, T, 1.1, -25, 4.5, -26.2); gateAt(H, T, -25.6, -1.1, 1.1, 3, 0.3, 1); return H; } },
  // Waterfall: down the falls onto the turning floor, putt out.
  { par:3, f:function(T){ var H = hole([rm(-5, 0, 5, -10), rm(-6, -21, 6, -36, -2)], [0, -2.5], [1.5, -33]); river(H, [[0, -9.5], [0, -14], [-2, -18], [0, -22]], 2, 7, 0, -2); disc(H, 0, -27.5, 2.2, 1.4); return H; } },
  // Dart Trap: three darts across the hall, two putts.
  { par:3, f:function(T){ var H = hole([rm(-4.5, 0, 4.5, -40)], [0, -2.5], [0, -36]); slider(H, T, -12, -3, 3, 2.2, 0); slider(H, T, -20, 3, -3, 2.6, 0.3); slider(H, T, -28, -3, 3, 3.0, 0.6); return H; } },
  // Idol Eyes: up the hall and left past the idol's eyes, two putts. The secret: the idol's mouth in the right wall of the hall comes out by the cup.
  { par:3, f:function(T){ var H = hole([rm(-4, 0, 4, -24), rm(-18, -16, -3.9, -24)], [0, -2.5], [-15, -20]); bumps(H, T, [[-1.4, -19.2, 0.7], [-6.5, -21.5, 0.6], [-10, -18.2, 0.6]]); H.comps.push({ k:'plane', gx:0, gy:0.01 });
    pipe(H, T, 3.3, -13.5, -13.5, -20, -1, 0, 0.9, 0, 0.2); secret(H, 2.5, -12.7, 4, -14.3); return H; } },
  // Temple Gates: two stone doors on their own clocks, round the pillar, two putts.
  { par:3, f:function(T){ var H = hole([rm(-5, 0, 5, -40)], [0, -2.5], [2, -36]); gateWall(H, T, -12, -5, 5, -3.6, -1.4, 2.8, 0, -1); gateWall(H, T, -22, -5, 5, 1.4, 3.6, 3.4, 0.5, 1); bumps(H, T, [[0, -29, 0.7]]); zoneR(H, M.MUD, -5, -31, -2, -33); return H; } },
  // Serpent River: ride the serpent to the lower court, putt out.
  { par:3, f:function(T){ var H = hole([rm(-12, 0, -4, -10), rm(2, -30, 12, -42, -1.6)], [-8, -2.5], [8, -38]); river(H, [[-8, -9.5], [-8, -15], [-2, -18], [-8, -22], [-2, -26], [6, -26], [7, -30.5]], 1.7, 6.5, 0, -1.6); bumps(H, T, [[5, -35, 0.6]]); return H; } },
  // Spinning Halls: two turning floors, two putts.
  { par:3, f:function(T){ var H = hole([rm(-5.5, 0, 5.5, -40)], [0, -2.5], [0, -36]); disc(H, 0, -13, 2.4, 1.4); disc(H, 0, -26, 2.4, -1.4); blk(H, T, -5.5, -12, -2.6, -14); blk(H, T, 2.6, -12, 5.5, -14); blk(H, T, -5.5, -25, -2.6, -27); blk(H, T, 2.6, -25, 5.5, -27); return H; } },
  // The Leap: over the chasm and through the gap in the vines, two putts.
  { par:3, f:function(T){ var H = hole([rm(-4.5, 0, 4.5, -12), rm(-4.5, -11.9, 4.5, -14.3), rm(-4.5, -14.2, 4.5, -32)], [0, -2.5], [-2, -28]); jump(H, 0, -12, 0, -1, 2.2, 9); zoneR(H, M.MUD, -4.5, -18, 4.5, -20.5); zoneR(H, M.GREEN, -3.4, -18, -1.6, -20.5); return H; } },
  // Three Doors: the middle door climbs to the far side of the upper court, two putts; the left one goes back to the start. The secret: the right door comes out under the cup.
  { par:3, f:function(T){ var H = hole([rm(-7, 0, 7, -14), rm(-7, -18, 7, -34, 0.8)], [0, -2.5], [-4, -30]);
    pipe(H, T, -4.5, -11, 0, -1.2, 0, 1, 0.8); pipe(H, T, 0, -11, 4.5, -19.6, 0, -1, 0.8); pipe(H, T, 4.5, -11, -4, -28.5, 0, -1, 0.8, 0, 0.2); secret(H, 3.7, -10.2, 5.3, -11.8); zoneR(H, M.MUD, -1.5, -22, 2.5, -25); bumps(H, T, [[-1.6, -28.6, 0.55]]); return H; } },
  // Ring and River: through the loop, round the wall, down the river, three putts.
  { par:4, f:function(T){ var H = hole([rm(-4, 0, 4, -10), pg([[-4, -10], [4, -10], [0.8, -13.6], [-0.8, -13.6]]), rm(-0.8, -13.5, 0.8, -17.8), rm(-4, -17.7, 4, -24), rm(-2, -32, 10, -44, -1.6)], [0, -2.5], [6, -40]);
    loopAt(H, 0, -15.6, 0, -1, 0.75, 1.6); river(H, [[2, -23.5], [4, -27], [4, -32.5]], 1.8, 6, 0, -1.6); blk(H, T, -4, -21.5, -1, -23); bumps(H, T, [[0.6, -21, 0.7]]); return H; } },
  // Crumbling Bridges: two bridges on two clocks. A curb guards each chasm, so only a bridge gets you over.
  { par:3, f:function(T){ var H = hole([rm(-4.5, 0, 4.5, -12), rm(-4.5, -11.9, 4.5, -14.6), rm(-4.5, -14.5, 4.5, -24), rm(-4.5, -23.9, 4.5, -26.6), rm(-4.5, -26.5, 4.5, -38)], [0, -2.5], [0, -34]);
    zoneR(H, M.WATER, -4.5, -12, 4.5, -14.5); drawb(H, -1.5, -12, 1.5, -14.5, 3.2, 0, 0.55); zoneR(H, M.WATER, -4.5, -24, 4.5, -26.5); drawb(H, 0.3, -24, 3, -26.5, 2.8, 0.4, 0.5);
    blk(H, T, -4.5, -11.4, -1.5, -12); blk(H, T, 1.5, -11.4, 4.5, -12); blk(H, T, -4.5, -23.4, 0.3, -24); blk(H, T, 3, -23.4, 4.5, -24); return H; } },
  // Idol Gauntlet: the windmill, the turning floor and the dart, two putts.
  { par:3, f:function(T){ var H = hole([rm(-5, 0, 5, -46)], [0, -2.5], [0, -42]); millAt(H, T, -14, 5, 1.5); disc(H, 0, -25.5, 2.3, -1.3); blk(H, T, -5, -24.5, -2.5, -26.5); blk(H, T, 2.5, -24.5, 5, -26.5); slider(H, T, -33, -3.2, 3.2, 2.6, 0.2); return H; } },
  // Heart of the Temple: the big pipe, the turning floor, the river and the loop, three putts. The secret: a little pipe behind the bumper comes out past the loop.
  { par:4, sig:true, f:function(T){ var H = hole([rm(-5, 0, 5, -12), rm(-7, -16, 3, -26, 0.8), rm(4, -32, 14, -38, -1.2), pg([[6, -38], [12, -38], [9.8, -41.6], [8.2, -41.6]], -1.2), rm(8.2, -41.5, 9.8, -45.5, -1.2), rm(3, -45.4, 15, -58, -1.2)], [0, -2.5], [9, -54]);
    pipe(H, T, -2.8, -9.5, -4, -17.6, 0, -1, 0.8); pipe(H, T, 1.2, -9.5, 0, -1.2, 0, 1, 0.8); bumps(H, T, [[3, -8.6, 0.5]]); disc(H, -2, -21, 2.2, 1.3); river(H, [[1.5, -24.5], [5, -26], [8, -29], [8, -33]], 1.7, 6.5, 0.8, -1.2);
    loopAt(H, 9, -43.5, 0, -1, 0.75, 1.6); bumps(H, T, [[6, -50, 0.6]]); flatAt(H, 9, -54); pipe(H, T, 4.1, -10.6, 12.5, -47, 0, -1, 0.9, 0, 0.5); secret(H, 3.3, -9.8, 4.9, -11.4); return H; } },
  // ---- 3 PIRATE COVE: gangplanks on a clock, cannons, jumps over the lagoon
  // Gangplank: a curb guards the moat, so time the plank and putt out. The secret: the cannon in the corner behind the barrel lands by the cup.
  { par:3, f:function(T){ var H = hole([rm(-5, 0, 5, -13), rm(-5, -12.9, 5, -16.6), rm(-5, -16.5, 5, -32)], [0, -2.5], [2, -28]); zoneR(H, M.WATER, -5, -13, 5, -16.5); drawb(H, -1.3, -13, 1.3, -16.5, 3.4, 0, 0.55); bumps(H, T, [[-2.5, -22, 0.7], [-3.1, -7.4, 0.5]]);
    blk(H, T, -5, -12.4, -1.3, -13); blk(H, T, 1.3, -12.4, 5, -13); pipe(H, T, -4.2, -9.2, 2, -26.6, 0, -1, 0.8, 0, 0.2); secret(H, -5, -8.4, -3.4, -10); return H; } },
  // Barrel Roll: thread the barrels, two putts.
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -32)], [0, -2.5], [-2.5, -28.5]); bumps(H, T, [[-1, -12], [1.5, -14.2], [-2.6, -16], [0.6, -18.5], [3, -21]]); zoneC(H, M.SAND, 2.6, -27, 1.8); return H; } },
  // Cannonball: into the cannon, onto the deck, round the rail, putt out.
  { par:3, f:function(T){ var H = hole([rm(-5, 0, 5, -14), rm(-7, -18, 7, -34, 0.8)], [0, -2.5], [-4, -30.5]); blk(H, T, -7, -25, 2.4, -26.4);
    pipe(H, T, 0, -11, 4.6, -19.6, 0, -1, 0.5, 0, 1.4); bumps(H, T, [[5.2, -31.5, 0.7]]); return H; } },
  // Walk the Plank: along the railed plank, past the boom, putt out.
  { par:3, f:function(T){ var H = hole([rm(-5, 0, 5, -36)], [0, -2.5], [0, -32]); zoneR(H, M.WATER, -5, -11, 5, -26); zoneR(H, M.GREEN, -1.2, -11, 1.2, -26); slider(H, T, -18.5, -3, 3, 3.2, 0, 1.5);
    blk(H, T, -1.5, -11, -1.2, -17.4); blk(H, T, 1.2, -11, 1.5, -17.4); blk(H, T, -1.5, -19.6, -1.2, -26); blk(H, T, 1.2, -19.6, 1.5, -26); return H; } },
  // Tide Pool: the currents run out to the water on both sides, but the curbs hold the ball; across, then putt out.
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -34)], [0, -2.5], [0, -30]); zoneR(H, M.WATER, -6, -12, -3.9, -24); zoneR(H, M.WATER, 3.9, -12, 6, -24); belt(H, -3.6, -12, 0, -24, -3, 0); belt(H, 0, -12, 3.6, -24, 3, 0);
    blk(H, T, -3.9, -12, -3.6, -24); blk(H, T, 3.6, -12, 3.9, -24); return H; } },
  // Island Hop: two hops over the lagoon, putt out past the barrel.
  { par:3, f:function(T){ var H = hole([rm(-4, 0, 4, -10), rm(-4, -9.9, 4, -12.2), rm(-4, -12.1, 4, -18), rm(-4, -17.9, 4, -20.4), rm(-4, -20.3, 4, -32)], [0, -2.5], [0, -28]);
    jump(H, 0, -10, 0, -1, 2.1, 8); jump(H, 0, -18, 0, -1, 2.2, 8); bumps(H, T, [[2, -15.3, 0.6]]); return H; } },
  // Crow's Nest: up through the loop, putt out round the lookouts.
  { par:3, f:function(T){ var H = hole([rm(-4.5, 0, 4.5, -11), pg([[-4.5, -11], [4.5, -11], [0.8, -14.8], [-0.8, -14.8]]), rm(-0.8, -14.7, 0.8, -19), rm(-5, -18.9, 5, -34)], [0, -2.5], [3, -30]);
    loopAt(H, 0, -16.8, 0, -1, 0.8, 1.6); bumps(H, T, [[1.8, -24, 0.7], [-2.6, -28.5, 0.6]]); return H; } },
  // Treasure Hunt: zig and zag up the cove, two putts. The secret: X marks the spot. The chute in the first sand trap comes out at the cup.
  { par:3, f:function(T){ var H = hole([rm(-7, 0, 7, -38)], [-4.5, -2.5], [4.5, -34]); blk(H, T, -7, -11, 2.5, -12.6); blk(H, T, -2.5, -21, 7, -22.6); blk(H, T, -7, -30, 2.5, -31.6);
    zoneC(H, M.SAND, 4.6, -17, 1.3); zoneC(H, M.SAND, -4.6, -26, 1.3); pipe(H, T, 4.6, -17, 4.5, -32.6, 0, -1, 0.9, 0, 0.2); secret(H, 3.8, -16.2, 5.4, -17.8); return H; } },
  // Shipwreck: the curb keeps you out of the moat; over the bridge, through the wreck, putt out. The secret: a hole in the hull, in the left corner, comes up by the cup.
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -14), rm(-6, -13.9, 6, -17.6), rm(-6, -17.5, 6, -36)], [0, -2.5], [-3, -32]); zoneR(H, M.WATER, -6, -14, 6, -17.5); drawb(H, 1.8, -14, 4.4, -17.5, 3.0, 0.3, 0.55);
    blk(H, T, -6, -13.4, 1.8, -14); blk(H, T, 4.4, -13.4, 6, -14); bumps(H, T, [[0, -24], [-2.4, -26.5, 0.6], [2.4, -26.5, 0.6], [-4.2, -29.5, 0.6]]); pipe(H, T, -5.2, -11.6, -3, -30.6, 0, -1, 0.8, 0, 0.2); secret(H, -6, -10.8, -4.4, -12.4); return H; } },
  // Broadside: the left cannon fires onto the deck, then putt out; the right one sends you back. The secret: the middle cannon is aimed at the cup.
  { par:3, f:function(T){ var H = hole([rm(-7, 0, 7, -14), pg([[-8, -18], [8, -18], [8, -30], [4, -35], [-8, -35]], 0.8)], [0, -2.5], [4, -30]);
    pipe(H, T, -4.5, -11, -5, -19.6, 0, -1, 0.5, 0, 1.4); pipe(H, T, 4.5, -11, 0, -1.2, 0, 1, 0.5); pipe(H, T, 0, -11, 4, -28.6, 0, -1, 0.5, 0, 0.2); secret(H, -0.8, -10.2, 0.8, -11.8); bumps(H, T, [[1.6, -26.2, 0.55]]); zoneR(H, M.SAND, -7, -24, -1, -28); return H; } },
  // Skull Rock: off the kicker onto the rock, with a rail at its back so a long one stays up, putt out.
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -34)], [0, -2.5], [0, -21.5]); zoneR(H, M.WATER, -6, -14.4, 6, -31); zoneR(H, M.GREEN, -3, -16.4, 3, -26.6); H.ramps.push({ x:0, y:-14, dx:0, dy:-1, w:12, h:0.45, ang:30, len:1.8 }); H.comps.push({ k:'mound', x:0, y:-21.5, s:2.4, a:-0.14 });
    blk(H, T, -3, -26, 3, -26.6); return H; } },
  // Rope Swing: under two swinging ropes, two putts.
  { par:3, f:function(T){ var H = hole([rm(-4, 0, 4, -38)], [0, -2.5], [0, -34]); spinner(H, T, 0, -14, 2.4, 1.6, 2); spinner(H, T, 0, -24, 2.4, -1.3, 3); return H; } },
  // Low Tide: two bridges on two clocks, curbs on both channels, putt out.
  { par:3, f:function(T){ var H = hole([rm(-5, 0, 5, -11), rm(-5, -10.9, 5, -13.6), rm(-5, -13.5, 5, -22), rm(-5, -21.9, 5, -24.6), rm(-5, -24.5, 5, -36)], [0, -2.5], [2, -32]);
    zoneR(H, M.WATER, -5, -11, 5, -13.5); drawb(H, -3.8, -11, -1.2, -13.5, 2.8, 0, 0.55); zoneR(H, M.WATER, -5, -22, 5, -24.5); drawb(H, 1.2, -22, 3.8, -24.5, 2.8, 0.5, 0.55);
    blk(H, T, -5, -10.4, -3.8, -11); blk(H, T, -1.2, -10.4, 5, -11); blk(H, T, -5, -21.4, 1.2, -22); blk(H, T, 3.8, -21.4, 5, -22); return H; } },
  // Lagoon Run: ride the current to the beach, putt out past the barrel.
  { par:3, f:function(T){ var H = hole([rm(-12, 0, -4, -10), rm(-6, -28, 6, -40, -0.8)], [-8, -2.5], [0, -36]); river(H, [[-8, -9.5], [-8, -16], [0, -20], [8, -16], [8, -24], [3, -28.5]], 2, 7, 0, -0.8); zoneR(H, M.WATER, -6, -28, -2, -32); bumps(H, T, [[2, -33, 0.6]]); return H; } },
  // Mutiny: two booms and two gates, two putts. The secret: the powder chute in the right corner by the tee runs under the whole deck and comes up in front of the cup.
  { par:3, f:function(T){ var H = hole([rm(-5, 0, 5, -42)], [0, -2.5], [0, -38]); slider(H, T, -10, -3.2, 3.2, 2.4, 0); blk(H, T, -5, -18, -1.2, -19.2); blk(H, T, 1.2, -18, 5, -19.2); gateAt(H, T, -18.6, -1.2, 1.2, 3, 0.2, 1); pipe(H, T, 4.2, -6, 0, -36.6, 0, -1, 0.9, 0, 0.2); secret(H, 3.4, -5.2, 5, -6.8);
    slider(H, T, -26, 3.2, -3.2, 2.0, 0.4); gateWall(H, T, -32, -5, 5, 1, 3.4, 3.4, 0.7, -1); bowl(H, 0, -38); return H; } },
  // Double Jump: two short hops over the lagoon, putt out.
  { par:3, f:function(T){ var H = hole([rm(-4, 0, 4, -10), rm(-4, -9.9, 4, -12.1), rm(-4, -12, 4, -16), rm(-4, -15.9, 4, -18.3), rm(-4, -18.2, 4, -32)], [0, -2.5], [-1.5, -28]);
    jump(H, 0, -10, 0, -1, 2.0, 8); jump(H, 0, -16, 0, -1, 2.2, 8, { h:0.6, ang:34 }); return H; } },
  // Powder Keg: through the kegs, which kick, past the two pools, two putts.
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -36)], [0, -2.5], [0, -32]); H.bumpers.push({ x:-2.4, y:-12, r:0.8, e:1.3, skin:'barrel' }, { x:2.4, y:-16, r:0.8, e:1.3, skin:'barrel' }, { x:-1, y:-21, r:0.8, e:1.3, skin:'barrel' }, { x:3, y:-25, r:0.7, e:1.3, skin:'barrel' });
    zoneR(H, M.WATER, -6, -27.5, -2.5, -29.5); zoneR(H, M.WATER, 2.5, -27.5, 6, -29.5); blk(H, T, -2.8, -27.5, -2.5, -29.5); blk(H, T, 2.5, -27.5, 2.8, -29.5); return H; } },
  // Captain's Cove: the cannon, the plank, the jump and the loop, three putts. The secret: the cannon behind the barrel fires past the jump.
  { par:4, sig:true, f:function(T){ var H = hole([rm(-5, 0, 5, -12), rm(-6, -16, 6, -26, 0.8), rm(-6, -25.9, 6, -28.6, 0.8), rm(-6, -28.5, 6, -38, 0.8), rm(-6, -37.9, 6, -40.6, 0.8), rm(-6, -40.5, 6, -48, 0.8), pg([[-6, -48], [6, -48], [0.8, -51.6], [-0.8, -51.6]], 0.8), rm(-0.8, -51.5, 0.8, -55.8, 0.8), rm(-6, -55.7, 6, -68, 0.8)], [0, -2.5], [0, -64]);
    pipe(H, T, -3, -9.5, -3, -17.6, 0, -1, 0.5, 0, 1.35); pipe(H, T, 1, -9.5, 0, -1.2, 0, 1, 0.5); bumps(H, T, [[2.9, -8.4, 0.5]]); zoneR(H, M.WATER, -6, -26, 6, -28.5); drawb(H, -1.3, -26, 1.3, -28.5, 3.2, 0.25, 0.55);
    blk(H, T, -6, -25.4, -1.3, -26); blk(H, T, 1.3, -25.4, 6, -26); jump(H, 0, -38, 0, -1, 2.3, 12); loopAt(H, 0, -53.6, 0, -1, 0.75, 1.6); bumps(H, T, [[-3, -60, 0.6], [3, -60, 0.6]]); flatAt(H, 0, -64);
    pipe(H, T, 4.2, -10.6, 0, -42, 0, -1, 0.6, 0, 0.6); secret(H, 3.4, -9.8, 5, -11.4); return H; } },
  // ---- 4 CANYON MINE: mine carts, shafts down a level, rail loops and the flood channel
  // Boom Town: pick a way through the boulders, two putts. The secret: the dynamite shaft behind the crate by the tee comes up at the cup.
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -34)], [0, -2.5], [2, -30]); pipe(H, T, 4.9, -6.6, 2, -28.6, 0, -1, 0.8, 0, 0.2); secret(H, 4.1, -5.8, 5.7, -7.4); bumps(H, T, [[3.7, -5.6, 0.5], [-1.4, -11, 0.85], [2.2, -15, 0.8], [-2.6, -19.5, 0.8], [1, -23.5, 0.8], [3.4, -27.4, 0.6], [2.2, -26.7, 0.7], [3.3, -30.3, 0.55]]); zoneR(H, M.MUD, -6, -26, -1, -30); H.comps.push({ k:'plane', gx:-0.015, gy:0 }); return H; } },
  { par:3, f:function(T){ var H = hole([rm(-4.5, 0, 4.5, -36)], [0, -2.5], [0, -32]); blk(H, T, -4.5, -15, -1.4, -16.4); blk(H, T, 1.4, -15, 4.5, -16.4); slider(H, T, -15.7, -2.8, 2.8, 2.4, 0, 1.6); zoneR(H, M.MUD, -4.5, -22, 4.5, -24); zoneR(H, M.GREEN, -1, -22, 1, -24); return H; } },
  { par:3, f:function(T){ var H = hole([rm(-5, 0, 5, -14), rm(-7, -18, 7, -34, -2)], [0, -2.5], [-3, -30]); pipe(H, T, 2.8, -11.5, 4.5, -19.6, 0, -1, 1.1); pipe(H, T, -2.8, -11.5, -3, -28.6, 0, -1, 0.8, 0, 0.2); secret(H, -3.6, -10.7, -2, -12.3); blk(H, T, -7, -24, 3, -25.4); zoneC(H, M.MUD, 1.2, -29.5, 1.1); return H; } },
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -34)], [-3, -2.5], [3, -30]); belt(H, -6, -10, 6, -14, 0, 4); belt(H, -6, -20, 6, -24, 0, -4); bumps(H, T, [[0, -17, 0.7], [4.6, -27.4, 0.6]]); return H; } },
  { par:3, f:function(T){ var H = hole([rm(-4, 0, 4, -11), pg([[-4, -11], [4, -11], [0.8, -14.6], [-0.8, -14.6]]), rm(-0.8, -14.5, 0.8, -19.2), rm(-4.5, -19.1, 4.5, -36)], [0, -2.5], [0, -32]);
    loopAt(H, 0, -16.8, 0, -1, 0.9, 1.6); zoneR(H, M.MUD, -4.5, -24, 4.5, -26.5); zoneR(H, M.GREEN, 1.6, -24, 3.4, -26.5); return H; } },
  { par:3, f:function(T){ var H = hole([rm(-4, 0, 4, -10), rm(-5, -24, 7, -38, -2)], [0, -2.5], [4, -34]); river(H, [[0, -9.5], [0, -14], [3, -17], [3, -21], [0, -24.5]], 1.7, 8, 0, -2); disc(H, 1, -29, 2, 1.5); return H; } },
  // Switchback: up, right, up the far side and back, three putts. The secret: the kicker at the top of the first switchback jumps the gap straight into the last one.
  { par:4, f:function(T){ var H = hole([rm(-4, 0, 4, -16), rm(-4, -12, 14, -20), rm(10, -12, 18, -36), rm(-2, -24, 14, -36)], [0, -2.5], [2, -32]); zoneR(H, M.MUD, 10, -20, 18, -22.5); zoneR(H, M.MUD, 14, -27, 18, -29.5); bumps(H, T, [[11, -16, 0.6], [11, -32, 0.6]]);
    jump(H, 1, -19.7, 0, -1, 0.05, 2.4, { m:M.GREEN, h:0.9, ang:40 }); secret(H, -0.3, -19.1, 2.3, -20); bowl(H, 2, -32); return H; } },
  { par:3, f:function(T){ var H = hole([rm(-5, 0, 5, -40)], [0, -2.5], [0, -36]); slider(H, T, -14, -3.4, 3.4, 2.2, 0, 2.6); slider(H, T, -24, 3.4, -3.4, 2.9, 0.4, 2.6); zoneR(H, M.MUD, -5, -30, -1.5, -32); zoneR(H, M.MUD, 1.5, -30, 5, -32); return H; } },
  { par:3, f:function(T){ var H = hole([rm(-4.5, 0, 4.5, -12), rm(-4.5, -11.9, 4.5, -15), rm(-4.5, -14.9, 4.5, -32)], [0, -2.5], [1.5, -28]); jump(H, 0, -12, 0, -1, 2.9, 9, { h:0.6, ang:36 }); bumps(H, T, [[-1.5, -22, 0.6]]); zoneR(H, M.WATER, 2.4, -24, 4.5, -27); return H; } },
  // Cave In: two gates in the timbers, round the rock, two putts. The secret: an old shaft by the tee drops under the timbers and comes up by the cup.
  { par:3, f:function(T){ var H = hole([rm(-5, 0, 5, -40)], [0, -2.5], [-2, -36]); blk(H, T, -5, -13, -0.9, -14.4); blk(H, T, 0.9, -13, 5, -14.4); pipe(H, T, 4, -7, -2, -34.6, 0, -1, 0.9, 0, 0.2); secret(H, 3.2, -6.2, 4.8, -7.8); bowl(H, -2, -36); gateAt(H, T, -13.7, -0.9, 0.9, 2.6, 0, 1); blk(H, T, -5, -24, 1.4, -25.4); blk(H, T, 3.4, -24, 5, -25.4); gateAt(H, T, -24.7, 1.4, 3.4, 3.2, 0.5, -1); bumps(H, T, [[0, -30, 0.7]]); return H; } },
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -14), rm(-6, -18, 6, -28, -1.2), rm(-6, -32, 6, -44, -2.6)], [0, -2.5], [2.5, -40]);
    pipe(H, T, -3, -11.5, -3, -19.6, 0, -1, 1.0); pipe(H, T, 3, -11.5, 3, -33.6, 0, -1, 1.6, 6.5); pipe(H, T, 0, -25.5, 0, -1.2, 0, 1, 0.8); bumps(H, T, [[-1, -37, 0.6]]); return H; } },
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -14), rm(-7, -26, 7, -40, -1.4)], [0, -2.5], [-4, -36]); belt(H, -6, -6, 6, -11, 4, 0); river(H, [[4.5, -13.5], [4.5, -20], [0, -23], [-3, -26.5]], 1.7, 7, 0, -1.4); bumps(H, T, [[0, -31, 0.7]]); return H; } },
  { par:3, f:function(T){ var H = hole([rm(-5, 0, 5, -36)], [0, -2.5], [2, -32]); belt(H, -5, -14, 5, -20, -4.5, 0); pipe(H, T, -3.8, -17, 2, -30.6, 0, -1, 0.9, 0, 0.2); secret(H, -4.6, -16.2, -3, -17.8); bumps(H, T, [[3.2, -25, 0.6]]); return H; } },
  { par:3, f:function(T){ var H = hole([rm(-4, 0, 4, -10), pg([[-4, -10], [4, -10], [0.8, -13.6], [-0.8, -13.6]]), rm(-0.8, -13.5, 0.8, -24), rm(-4, -23.9, 4, -36)], [0, -2.5], [0, -32]);
    loopAt(H, 0, -15.6, 0, -1, 0.7, 1.6); loopAt(H, 0, -20.5, 0, -1, 0.7, 1.6); bumps(H, T, [[0.6, -28.5, 0.6]]); return H; } },
  { par:3, f:function(T){ var H = hole([pg([[-3, 0], [3, 0], [3, -10], [8, -16], [8, -26], [2, -32], [2, -40], [-4, -40], [-4, -30], [2, -24], [2, -18], [-3, -12]])], [0, -2.5], [-1, -36]);
    bumps(H, T, [[0.5, -14.5, 0.55], [5, -21, 0.6], [-1, -29, 0.55]]); zoneR(H, M.MUD, 2, -22, 8, -24); return H; } },
  { par:3, f:function(T){ var H = hole([rm(-5, 0, 5, -13), rm(-5, -12.9, 5, -16.1), rm(-5, -16, 5, -26), rm(-5, -25.9, 5, -29.1), rm(-5, -29, 5, -40)], [0, -2.5], [0, -36]);
    zoneR(H, M.WATER, -5, -13, 5, -16); drawb(H, -1.3, -13, 1.3, -16, 2.6, 0, 0.5); zoneR(H, M.WATER, -5, -26, 5, -29); drawb(H, -1.3, -26, 1.3, -29, 2.6, 0.5, 0.5); slider(H, T, -21, -3.2, 3.2, 2.2, 0.2);
    blk(H, T, -5, -12.4, -1.3, -13); blk(H, T, 1.3, -12.4, 5, -13); blk(H, T, -5, -25.4, -1.3, -26); blk(H, T, 1.3, -25.4, 5, -26); return H; } },
  { par:3, f:function(T){ var H = hole([rm(-5, 0, 5, -44)], [0, -2.5], [0, -40]); slider(H, T, -10, -3.2, 3.2, 2.0, 0); gateWall(H, T, -16, -5, 5, -1.1, 1.1, 2.4, 0.3, 1); slider(H, T, -24, 3.2, -3.2, 2.4, 0.5); gateWall(H, T, -30, -5, 5, -1.1, 1.1, 2.8, 0.1, -1); slider(H, T, -36, -3.2, 3.2, 2.8, 0.7); return H; } },
  { par:4, sig:true, f:function(T){ var H = hole([rm(-5, 0, 5, -12), rm(-6, -16, 6, -28, -1.4), pg([[-6, -28], [6, -28], [0.8, -31.6], [-0.8, -31.6]], -1.4), rm(-0.8, -31.5, 0.8, -35.8, -1.4), rm(-5, -35.7, 5, -44, -1.4), rm(-5, -43.9, 5, -47, -1.4), rm(-5, -46.9, 5, -60, -1.4)], [0, -2.5], [1.5, -56]);
    pipe(H, T, 2.6, -9.5, 3, -17.6, 0, -1, 1.2); pipe(H, T, -2.6, -9.5, 0, -1.2, 0, 1, 0.8); belt(H, -6, -20, 6, -24, -4, 0); loopAt(H, 0, -33.6, 0, -1, 0.85, 1.6);
    jump(H, 0, -44, 0, -1, 2.2, 10, { h:0.9, ang:40 }); bumps(H, T, [[-2, -52, 0.6], [3.4, -8.6, 0.5]]); flatAt(H, 1.5, -56);
    pipe(H, T, 4.2, -10.4, 2, -38.4, 0, -1, 0.9, 0, 0.6); secret(H, 3.4, -9.6, 5, -11.2); return H; } },
  // ---- 5 VOLCANO ISLAND: lava on every side, lava jumps, hot springs and everything at once. Basalt rails line the lanes the obvious line takes, so the lava punishes a bad choice rather than a degree of aim.
  // Lava Lane: up the railed lane, through the chicane, putt out. The secret: a lava tube in the nook beside the tee comes up at the cup.
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -36)], [0, -2.5], [1, -32]); zoneR(H, M.WATER, -6, -10, -1.6, -28); zoneR(H, M.WATER, 1.6, -10, 6, -28); blk(H, T, -1.9, -10, -1.6, -28); blk(H, T, 1.6, -10, 1.9, -28); blk(H, T, -1.6, -18, 0.3, -19.2); blk(H, T, -0.3, -23, 1.6, -24.2);
    pipe(H, T, -5.2, -7.6, 1, -30.6, 0, -1, 0.9, 0, 0.2); secret(H, -6, -6.8, -4.4, -8.4); bumps(H, T, [[-3.6, -7.2, 0.5]]); return H; } },
  // Hot Spring: down the spring to the lower terrace; a basalt rail keeps the lava pool off the line; putt out. The secret: the vent in the corner of the top terrace comes out at the cup.
  { par:3, f:function(T){ var H = hole([rm(-10, 0, -2, -12), rm(-4, -24, 8, -38, -1.8)], [-6, -2.5], [4, -34]); river(H, [[-6, -11.5], [-6, -16], [-1, -19], [2, -24.5]], 1.8, 7, 0, -1.8); zoneR(H, M.WATER, -4, -30, 0.5, -38); blk(H, T, 0.5, -30, 0.8, -38); bumps(H, T, [[4.5, -28.5, 0.65]]);
    pipe(H, T, -2.9, -11.1, 4, -32.6, 0, -1, 0.9, 0, 0.2); secret(H, -3.7, -10.3, -2, -11.9); return H; } },
  // Geyser Field: through the geysers, which kick; rails hold the lava back on both sides; two putts.
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -36)], [0, -2.5], [0, -32]); pads(H, [[-2.5, -12, 0.75], [2.5, -15, 0.75], [-1, -20, 0.75], [3, -24.5, 0.7], [-3.2, -26, 0.7]]); zoneR(H, M.WATER, -6, -17, -4.5, -23); zoneR(H, M.WATER, 4.5, -17, 6, -23);
    blk(H, T, -4.8, -17, -4.5, -23); blk(H, T, 4.5, -17, 4.8, -23); return H; } },
  // Lava Leap: off the kicker over the lava, up the railed lane, putt out.
  { par:3, f:function(T){ var H = hole([rm(-4, 0, 4, -12), rm(-4, -11.9, 4, -15.1), rm(-4, -15, 4, -30)], [0, -2.5], [0, -26]); jump(H, 0, -12, 0, -1, 2.8, 8, { h:0.7, ang:38 }); zoneR(H, M.WATER, -4, -15, -2.4, -30); zoneR(H, M.WATER, 2.4, -15, 4, -30);
    blk(H, T, -2.7, -16, -2.4, -30); blk(H, T, 2.4, -16, 2.7, -30); return H; } },
  // Basalt Gates: through two gates, with the lava between them railed off, two putts.
  { par:3, f:function(T){ var H = hole([rm(-5, 0, 5, -40)], [0, -2.5], [0, -36]); gateWall(H, T, -12, -5, 5, -1.1, 1.1, 2.2, 0, 1); zoneR(H, M.WATER, -5, -18, -1.4, -24); zoneR(H, M.WATER, 1.4, -18, 5, -24); gateWall(H, T, -27, -5, 5, -1.1, 1.1, 2.6, 0.5, -1);
    blk(H, T, -1.7, -18, -1.4, -24); blk(H, T, 1.4, -18, 1.7, -24); return H; } },
  // Caldera: up the railed lane onto the rim and into the crater. A wall at the back of the crater stops a long one.
  { par:3, f:function(T){ var H = hole([rm(-7, 0, 7, -32)], [0, -2.5], [0, -22]); H.comps.push({ k:'ring', x:0, y:-22, r:2.4, s:0.8, a:0.48 }); H.flats.push({ x:0, y:-22, s:0.6, keep:0.2 });
    zoneR(H, M.WATER, -7, -12, -3.6, -32); zoneR(H, M.WATER, 3.6, -12, 7, -32); zoneR(H, M.WATER, -3.6, -27, 3.6, -32); blk(H, T, -3.9, -12, -3.6, -27); blk(H, T, 3.6, -12, 3.9, -27); blk(H, T, -3.6, -26.4, 3.6, -27); bumps(H, T, [[0, -16.2, 0.5]]); return H; } },
  // Ash Field: through the gaps in the ash, round the springs, two putts.
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -38)], [-3, -2.5], [3, -34]); zoneR(H, M.MUD, -6, -13, 6, -15); zoneR(H, M.GREEN, -1.2, -13, 0.8, -15); zoneR(H, M.MUD, -6, -24, 6, -26); zoneR(H, M.GREEN, 1.2, -24, 3.2, -26); zoneC(H, M.WATER, 2.6, -19, 1.2); zoneC(H, M.WATER, -2.6, -20, 1.2); zoneC(H, M.WATER, -1.2, -29.5, 1.1); return H; } },
  // Magma Loop: through the loop, between the lava pools, putt out.
  { par:3, f:function(T){ var H = hole([rm(-4, 0, 4, -11), pg([[-4, -11], [4, -11], [0.8, -14.6], [-0.8, -14.6]]), rm(-0.8, -14.5, 0.8, -19), rm(-5, -18.9, 5, -36)], [0, -2.5], [-2.5, -32]);
    loopAt(H, 0, -16.8, 0, -1, 0.8, 1.6); zoneR(H, M.WATER, -5, -22, -1.2, -26); zoneR(H, M.WATER, 1.2, -22, 5, -26); zoneR(H, M.WATER, 1.5, -26, 5, -36); blk(H, T, 1.2, -26, 1.5, -36); return H; } },
  // Obsidian Bridges: two bridges on two clocks, curbs on both channels, two putts.
  { par:3, f:function(T){ var H = hole([rm(-5, 0, 5, -12), rm(-5, -11.9, 5, -15.6), rm(-5, -15.5, 5, -24), rm(-5, -23.9, 5, -27.6), rm(-5, -27.5, 5, -38)], [0, -2.5], [3, -34]);
    zoneR(H, M.WATER, -5, -12, 5, -15.5); drawb(H, -1.2, -12, 1.2, -15.5, 2.6, 0, 0.5); zoneR(H, M.WATER, -5, -24, 5, -27.5); drawb(H, 1.8, -24, 4.2, -27.5, 2.4, 0.35, 0.5); bumps(H, T, [[1.5, -20, 0.6]]);
    blk(H, T, -5, -11.4, -1.2, -12); blk(H, T, 1.2, -11.4, 5, -12); blk(H, T, -5, -23.4, 1.8, -24); blk(H, T, 4.2, -23.4, 5, -24); return H; } },
  // Eruption: under three spinning rocks, rails along the lava, two putts.
  { par:3, f:function(T){ var H = hole([rm(-5, 0, 5, -40)], [0, -2.5], [0, -36]); spinner(H, T, -1.6, -13, 2.2, 1.7, 2); spinner(H, T, 1.6, -21, 2.2, -1.7, 2); spinner(H, T, -1.6, -29, 2.2, 1.9, 3);
    zoneR(H, M.WATER, -5, -11, -4, -32); zoneR(H, M.WATER, 4, -11, 5, -32); blk(H, T, -4.3, -11, -4, -32); blk(H, T, 4, -11, 4.3, -32); return H; } },
  // Lava Tubes: the left tube to the middle terrace, the right one up again, putt out. The secret: the tube that looks like it goes back to the start comes up under the cup.
  { par:3, f:function(T){ var H = hole([rm(-7, 0, 7, -14), rm(-7, -18, 7, -30, 0.8), rm(-7, -34, 7, -46, 1.6)], [0, -2.5], [0, -42]);
    pipe(H, T, -4, -11.5, 4, -19.6, 0, -1, 0.7); pipe(H, T, 4, -11.5, 0, -40.6, 0, -1, 0.7, 0, 0.2); secret(H, 3.2, -10.7, 4.8, -12.3); pipe(H, T, 4.5, -27.5, -1, -35.6, 0, -1, 0.7); pipe(H, T, -4.5, -27.5, 0, -1.2, 0, 1, 0.7);
    zoneR(H, M.WATER, -7, -22, -1, -26); zoneR(H, M.WATER, -7, -38, -2, -41); zoneR(H, M.WATER, 2, -38, 7, -41); return H; } },
  // Turning Rock: across the turning rock, between the lava, putt out.
  { par:3, f:function(T){ var H = hole([rm(-7, 0, 7, -34)], [0, -2.5], [0, -30]); disc(H, 0, -16, 3, 1.5); zoneR(H, M.WATER, -7, -12, -3.2, -20); zoneR(H, M.WATER, 3.2, -12, 7, -20); zoneR(H, M.WATER, -7, -20, -2.4, -24); zoneR(H, M.WATER, 2.4, -20, 7, -24);
    blk(H, T, -2.7, -20, -2.4, -24); blk(H, T, 2.4, -20, 2.7, -24); return H; } },
  // Twin Jumps: two short hops over the lava, up the railed lane, putt out.
  { par:3, f:function(T){ var H = hole([rm(-4, 0, 4, -10), rm(-4, -9.9, 4, -12.3), rm(-4, -12.2, 4, -16.5), rm(-4, -16.4, 4, -18.8), rm(-4, -18.7, 4, -32)], [0, -2.5], [0, -28]);
    jump(H, 0, -10, 0, -1, 2.2, 8, { h:0.6, ang:34 }); jump(H, 0, -16.5, 0, -1, 2.2, 8, { h:0.6, ang:34 }); zoneR(H, M.WATER, -4, -19.4, -2, -32); zoneR(H, M.WATER, 2, -19.4, 4, -32); blk(H, T, -2.3, -19.4, -2, -32); blk(H, T, 2, -19.4, 2.3, -32); return H; } },
  // River of Fire: the river carries you round to the lower terrace; putt out past the rock. The secret: the vent in the corner of the top terrace comes up beside the cup.
  { par:3, f:function(T){ var H = hole([rm(-12, 0, -4, -10), rm(-4, -30, 8, -44, -2)], [-8, -2.5], [4, -40]); river(H, [[-8, -9.5], [-8, -15], [0, -17], [6, -21], [6, -26], [0, -30.5]], 1.8, 7.5, 0, -2);
    zoneR(H, M.WATER, -4, -40, -0.5, -44); zoneR(H, M.WATER, 5, -32, 8, -36); bumps(H, T, [[2, -36, 0.6]]); pipe(H, T, -11.1, -9.1, 4, -38.6, 0, -1, 0.9, 0, 0.2); secret(H, -12, -8.3, -10.3, -9.9); return H; } },
  // Fault Line: over the fault, under two rocks, with rails on the lava, two putts.
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -40)], [0, -2.5], [-2, -36]); H.comps.push({ k:'ridge', x:0, y:-16, nx:1, ny:0, w:1.6, a:0.45 }); slider(H, T, -22, -4, 4, 2.4, 0.2); slider(H, T, -28, 4, -4, 2.0, 0.6);
    zoneR(H, M.WATER, -6, -10, -4.6, -32); zoneR(H, M.WATER, 4.6, -10, 6, -32); blk(H, T, -4.9, -10, -4.6, -32); blk(H, T, 4.6, -10, 4.9, -32); return H; } },
  // Tiki Torches: zig and zag past the lava, three putts. The secret: a tube in the dead end right of the first wall comes up at the cup.
  { par:4, f:function(T){ var H = hole([rm(-7, 0, 7, -38)], [-4.5, -2.5], [4.5, -34]); blk(H, T, -7, -10, 2.5, -11.4); blk(H, T, -2.5, -20, 7, -21.4); blk(H, T, -7, -29, 2.5, -30.4);
    bumps(H, T, [[4.8, -15.5, 0.6], [-4.8, -25, 0.6]]); zoneR(H, M.WATER, -7, -12.4, -2.5, -16); zoneR(H, M.WATER, 2.5, -22.4, 7, -26); zoneR(H, M.WATER, -7, -31.4, -2.5, -34.5);
    pipe(H, T, 6.1, -8.6, 4.5, -32.6, 0, -1, 0.9, 0, 0.2); secret(H, 5.3, -7.8, 6.9, -9.4); return H; } },
  // Pyroclast: through the loop, over the lava jump and the curbed bridge, three putts.
  { par:4, f:function(T){ var H = hole([rm(-4, 0, 4, -10), pg([[-4, -10], [4, -10], [0.8, -13.6], [-0.8, -13.6]]), rm(-0.8, -13.5, 0.8, -18), rm(-4.5, -17.9, 4.5, -25), rm(-4.5, -24.9, 4.5, -27.9), rm(-4.5, -27.8, 4.5, -34), rm(-4.5, -33.9, 4.5, -37.1), rm(-4.5, -37, 4.5, -48)], [0, -2.5], [0, -44]);
    loopAt(H, 0, -15.6, 0, -1, 0.75, 1.6); jump(H, 0, -25, 0, -1, 2.2, 9, { h:0.9, ang:40 }); zoneR(H, M.WATER, -4.5, -34, 4.5, -37); drawb(H, -1.3, -34, 1.3, -37, 2.6, 0.2, 0.5);
    blk(H, T, -4.5, -33.4, -1.3, -34); blk(H, T, 1.3, -33.4, 4.5, -34); return H; } },
  // The Summit: the tube, the turning rock, the lava jump, the curbed bridge and the river down. The secret: a tube behind the rock by the tee skips the turning rock and the jump.
  { par:6, sig:true, f:function(T){ var H = hole([rm(-5, 0, 5, -12), rm(-7, -16, 7, -30, 0.8), rm(-7, -29.9, 7, -33.1, 0.8), rm(-7, -33, 7, -42, 0.8), rm(-7, -41.9, 7, -45.1, 0.8), rm(-7, -45, 7, -56, 1.6), rm(-12, -60, 2, -72, 0)], [0, -2.5], [-5, -68]);
    pipe(H, T, 3, -9.5, -4, -17.6, 0, -1, 0.7); pipe(H, T, -3, -9.5, 0, -1.2, 0, 1, 0.7); disc(H, 0, -23, 2.6, -1.4); zoneR(H, M.WATER, -7, -20, -3, -26); zoneR(H, M.WATER, 3, -20, 7, -26);
    jump(H, 0, -30, 0, -1, 3.0, 14, { h:0.7, ang:38 }); zoneR(H, M.WATER, -7, -42, 7, -45); drawb(H, 2.2, -42, 4.6, -45, 2.4, 0.4, 0.5); blk(H, T, -7, -41.4, 2.2, -42); blk(H, T, 4.6, -41.4, 7, -42);
    river(H, [[-3, -55.5], [-3, -58], [-5, -60.5]], 1.8, 6, 1.6, 0); bumps(H, T, [[-8, -66, 0.6], [-2, -64, 0.6], [-1.4, -8.6, 0.5]]); flatAt(H, -5, -68);
    pipe(H, T, -0.2, -10.6, 3.4, -36, 0, -1, 0.9, 0, 0.5); secret(H, -1, -9.8, 0.6, -11.4); return H; } }
];
/* THE MEMBERS TOUR: the season's own eighteen, for Tour Pass holders. Two halves of nine on the
   season's two themes, every set piece on the site, several at once, on clocks, over the hazard. They
   are built to be the hardest holes in the game and still beatable without luck: par is the solver's,
   the same rule as the Putt Putt Tour. */
var MEMBER_WORLDS = [
  { id:'hallows', name:'Hallows Night', theme:'haunted', blurb:'The season’s front nine, for Tour Pass members.', haz:['Every set piece', 'At once'] },
  { id:'harvest', name:'Harvest Moon', theme:'harvest', blurb:'The season’s back nine.', haz:['Every set piece', 'At once'] }
];
var MEMBER_LEVELS = [
  // ---- HALLOWS NIGHT
  { par:4, f:function(T){ var H = hole([rm(-5, 0, 5, -12), rm(-5, -11.9, 5, -15.1), rm(-5, -15, 5, -38)], [0, -2.5], [2.5, -34]); zoneR(H, M.WATER, -5, -12, 5, -15); drawb(H, -1.2, -12, 1.2, -15, 2.6, 0, 0.5); blk(H, T, -5, -11.4, -1.2, -12); blk(H, T, 1.2, -11.4, 5, -12);
    gateWall(H, T, -22, -5, 5, 1.2, 3.2, 2.4, 0.3, -1); zoneR(H, M.WATER, -5, -27, -1, -31); blk(H, T, -1, -27, -0.7, -31); blk(H, T, -5, -26.7, -0.7, -27); bumps(H, T, [[0.4, -29, 0.6]]); pen(H, T, 2.5, -34);
    pipe(H, T, -4.2, -9.4, 1.1, -34, 1, 0, 0.9, 0, 0.2); secret(H, -5, -8.6, -3.4, -10.2); bumps(H, T, [[-2.9, -8.8, 0.5]]); return H; } },
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -14), rm(-7, -18, 7, -40, -1.6)], [0, -2.5], [0, -36]); pipe(H, T, -3.2, -11.5, -3.6, -19.6, 0, -1, 1, 5.5); pipe(H, T, 3.2, -11.5, 0, -1.2, 0, 1, 0.8);
    millAt(H, T, -28, 7, 1.6); zoneR(H, M.WATER, -7, -22, -5, -26); zoneR(H, M.WATER, 1, -22, 7, -26); return H; } },
  { par:3, f:function(T){ var H = hole([rm(-4, 0, 4, -10), pg([[-4, -10], [4, -10], [0.8, -13.6], [-0.8, -13.6]]), rm(-0.8, -13.5, 0.8, -17.8), rm(-5, -17.7, 5, -40)], [0, -2.5], [0, -36]);
    loopAt(H, 0, -15.6, 0, -1, 0.8, 1.6); zoneR(H, M.WATER, -5, -22, 5, -32); zoneR(H, M.GREEN, -0.7, -22, 0.7, -32); slider(H, T, -27, -2.2, 2.2, 2.2, 0.3, 1.2); pen(H, T, 0, -36); return H; } },
  { par:4, f:function(T){ var H = hole([rm(-4, 0, 4, -42)], [0, -2.5], [0, -38]); spinner(H, T, 0, -11, 2, 2.0, 2); spinner(H, T, 0, -19, 2, -2.2, 3); spinner(H, T, 0, -27, 2, 2.4, 2);
    zoneR(H, M.WATER, -4, -9, -2.6, -31); zoneR(H, M.WATER, 2.6, -9, 4, -31); blk(H, T, -2.9, -9, -2.6, -31); blk(H, T, 2.6, -9, 2.9, -31); pen(H, T, 0, -38); return H; } },
  { par:3, f:function(T){ var H = hole([rm(-7, 0, 7, -40)], [0, -2.5], [0, -36]); disc(H, -1.5, -13, 2.6, 1.6); disc(H, 1.5, -24, 2.6, -1.6);
    zoneR(H, M.WATER, -7, -10, -4.4, -28); zoneR(H, M.WATER, 4.4, -10, 7, -28); zoneR(H, M.WATER, 1.4, -15, 4.4, -18.5); zoneR(H, M.WATER, -4.4, -26.5, -1.4, -30); blk(H, T, -4.7, -10, -4.4, -28); blk(H, T, 4.4, -10, 4.7, -28); pen(H, T, 0, -36); return H; } },
  { par:4, f:function(T){ var H = hole([rm(-12, 0, -4, -10), rm(-4, -26, 8, -35, -1.6), rm(-4, -34.9, 8, -38.1, -1.6), rm(-4, -38, 8, -49, -1.6)], [-8, -2.5], [2, -45]);
    river(H, [[-8, -9.5], [-8, -16], [-2, -19], [4, -19], [4, -26.5]], 1.7, 7.5, 0, -1.6); zoneR(H, M.MUD, 2.4, -26.2, 5.6, -29.2); zoneR(H, M.WATER, -4, -35, 8, -38); drawb(H, 0.8, -35, 3.2, -38, 2.4, 0.4, 0.5); blk(H, T, -4, -34.4, 0.8, -35); blk(H, T, 3.2, -34.4, 8, -35); bumps(H, T, [[6.2, -31.5, 0.6]]); pen(H, T, 2, -45); return H; } },
  { par:3, f:function(T){ var H = hole([rm(-8, 0, 8, -14), rm(-8, -18, 8, -30, 0.8), rm(-8, -34, 8, -46, 1.6)], [0, -2.5], [5, -42]);
    pipe(H, T, -5.5, -11.5, 0, -1.2, 0, 1, 0.7); pipe(H, T, -1.8, -11.5, -5.5, -19.6, 0, -1, 0.7); pipe(H, T, 1.8, -11.5, 5.5, -1.2, 0, 1, 0.7); pipe(H, T, 5.5, -11.5, 5.5, -19.6, 0, -1, 0.7);
    pipe(H, T, -5.5, -27.5, -5.5, -35.6, 0, -1, 0.7); pipe(H, T, 5.5, -27.5, 0, -1.2, 0, 1, 0.7); blk(H, T, -2.5, -18, -1.2, -30); zoneR(H, M.MUD, -1.2, -22, 8, -24.5); bumps(H, T, [[0, -40, 0.65]]); pen(H, T, 5, -42);
    pipe(H, T, 7.1, -3.6, 3.6, -42, 1, 0, 0.9, 0, 0.2); secret(H, 6.3, -2.8, 7.9, -4.4); return H; } },
  { par:3, f:function(T){ var H = hole([rm(-4.5, 0, 4.5, -10), rm(-4.5, -9.9, 4.5, -12.9), rm(-4.5, -12.8, 4.5, -18), rm(-4.5, -17.9, 4.5, -21), rm(-4.5, -20.9, 4.5, -34)], [0, -2.5], [0, -30]);
    jump(H, 0, -10, 0, -1, 2.3, 9, { h:0.6, ang:34 }); slider(H, T, -15.4, -3, 3, 2.0, 0.2, 1.8); jump(H, 0, -18, 0, -1, 2.4, 9, { h:0.6, ang:34 }); zoneR(H, M.WATER, -4.5, -21, -2, -34); zoneR(H, M.WATER, 2, -21, 4.5, -26); blk(H, T, -2.3, -21, -2, -34); blk(H, T, 2, -21, 2.3, -26); pen(H, T, 0, -30); return H; } },
  { par:5, sig:true, f:function(T){ var H = hole([rm(-5, 0, 5, -12), rm(-7, -16, 7, -28, 0.8), pg([[-7, -28], [7, -28], [0.8, -32], [-0.8, -32]], 0.8), rm(-0.8, -31.9, 0.8, -36.2, 0.8), rm(-5, -36.1, 5, -42, 0.8), rm(-5, -41.9, 5, -45.1, 0.8), rm(-6, -45, 6, -60, 0.8)], [0, -2.5], [2, -56]);
    pipe(H, T, -3, -9.5, -1.2, -17.6, 0, -1, 0.7); pipe(H, T, 3, -9.5, 0, -1.2, 0, 1, 0.7); disc(H, 0, -22, 2.4, 1.6); zoneR(H, M.WATER, -7, -19, -3, -25); zoneR(H, M.WATER, 3, -19, 7, -25); blk(H, T, -3.3, -19, -3, -25); blk(H, T, 3, -19, 3.3, -25);
    loopAt(H, 0, -34, 0, -1, 0.8, 1.6); zoneR(H, M.MUD, -5, -36.4, 5, -38.2); jump(H, 0, -42, 0, -1, 2.2, 10, { h:0.9, ang:40 }); millAt(H, T, -50, 6, 1.7); flatAt(H, 2, -56); bumps(H, T, [[-0.8, -8.6, 0.5]]);
    pipe(H, T, 0.4, -10.6, -2.5, -40.4, 0, -1, 0.9, 0, 0.5); secret(H, -0.4, -9.8, 1.2, -11.4); return H; } },
  // ---- HARVEST MOON
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -40)], [0, -2.5], [-3, -36]); belt(H, -6, -10, 6, -15, 5, 0); slider(H, T, -19, -4, 4, 2.0, 0); belt(H, -6, -23, 6, -28, -5, 0); slider(H, T, -31, 4, -4, 2.4, 0.5);
    zoneR(H, M.WATER, -6, -15, -4.5, -23); zoneR(H, M.WATER, 4.5, -15, 6, -23); blk(H, T, -4.8, -15, -4.5, -23); blk(H, T, 4.5, -15, 4.8, -23); pen(H, T, -3, -36); return H; } },
  { par:4, f:function(T){ var H = hole([rm(-6, 0, 6, -36)], [0, -2.5], [0, -30]); zoneR(H, M.WATER, -6, -10, 6, -36); zoneR(H, M.GREEN, -2.2, -12.6, 2.2, -19); zoneR(H, M.GREEN, -2.4, -22, 2.4, -34);
    zoneR(H, M.GREEN, -6, -9.9, 6, -10); H.ramps.push({ x:0, y:-10, dx:0, dy:-1, w:12, h:0.45, ang:30, len:1.8 }, { x:0, y:-19, dx:0, dy:-1, w:4.4, h:0.5, ang:32, len:1.6 }); H.comps.push({ k:'mound', x:0, y:-30, s:2.2, a:-0.12 }); pen(H, T, 0, -30); blk(H, T, -2.5, -12.6, -2.2, -18.4); blk(H, T, 2.2, -12.6, 2.5, -18.4); blk(H, T, -2.7, -22.4, -2.4, -34); blk(H, T, 2.4, -22.4, 2.7, -34); return H; } },
  { par:5, f:function(T){ var H = hole([rm(-8, 0, 8, -42)], [-5.5, -2.5], [5.5, -38.5]); blk(H, T, -8, -9, 4, -10.4); blk(H, T, -4, -17, 8, -18.4); blk(H, T, -8, -25, 4, -26.4); blk(H, T, -4, -33, 8, -34.4);
    zoneC(H, M.MUD, -5.5, -13.6, 1.3); zoneC(H, M.MUD, 5.5, -21.6, 1.3); zoneC(H, M.MUD, -5.5, -29.6, 1.3); zoneC(H, M.MUD, 1.5, -21.6, 1); bumps(H, T, [[0, -13.5, 0.55], [0, -29.5, 0.55]]); pen(H, T, 5.5, -38.5);
    pipe(H, T, -5.5, -13.6, 4.1, -38.5, 1, 0, 0.9, 0, 0.2); secret(H, -6.3, -12.8, -4.7, -14.4); return H; } },
  { par:4, f:function(T){ var H = hole([rm(-12, 0, -4, -12), rm(-6, -24, 8, -50, -1.6)], [-8, -2.5], [1, -46]); river(H, [[-8, -11.5], [-8, -17], [-2, -21], [2, -24.5]], 1.8, 7, 0, -1.6); millAt(H, T, -36, 8, 1.6, 1); zoneR(H, M.WATER, -6, -26, -2, -32); pen(H, T, 1, -46); return H; } },
  { par:3, f:function(T){ var H = hole([rm(-7, 0, 7, -38)], [0, -2.5], [0, -34]); disc(H, 0, -18, 3.2, -1.7); pads(H, [[-4.6, -12, 0.7], [4.6, -12, 0.7], [-4.6, -24, 0.7], [4.6, -24, 0.7]]); zoneR(H, M.WATER, -7, -26.5, -1.6, -29); zoneR(H, M.WATER, 1.6, -26.5, 7, -29); blk(H, T, -7, -25.9, -1.6, -26.5); blk(H, T, 1.6, -25.9, 7, -26.5); pen(H, T, 0, -34); return H; } },
  { par:4, f:function(T){ var H = hole([rm(-5, 0, 5, -44)], [0, -2.5], [0, -40]); gateWall(H, T, -11, -5, 5, -1, 1, 2.0, 0, 1); gateWall(H, T, -21, -5, 5, 1.2, 3.2, 2.3, 0.4, -1); gateWall(H, T, -31, -5, 5, -3.2, -1.2, 2.6, 0.7, 1); bumps(H, T, [[0, -36, 0.6]]); pen(H, T, 0, -40); return H; } },
  { par:4, f:function(T){ var H = hole([rm(-12, 0, -4, -10), rm(-4, -24, 8, -32, -1.2), rm(-4, -36, 8, -44, 0), pg([[-4, -44], [8, -44], [2.8, -47.6], [1.2, -47.6]]), rm(1.2, -47.5, 2.8, -51.8), rm(-4, -51.7, 8, -62)], [-8, -2.5], [2, -58]);
    river(H, [[-8, -9.5], [-8, -16], [0, -19], [2, -24.5]], 1.7, 7.5, 0, -1.2); pipe(H, T, 5, -30, 5, -37.6, 0, -1, 1.0); pipe(H, T, -1.5, -30, 0.6, -58, 1, 0, 0.8, 0, 0.2); secret(H, -2.3, -29.2, -0.7, -30.8); loopAt(H, 2, -49.6, 0, -1, 0.85, 1.6); bumps(H, T, [[-1, -55, 0.6]]); pen(H, T, 2, -58); return H; } },
  { par:3, f:function(T){ var H = hole([rm(-4.5, 0, 4.5, -12), rm(-4.5, -11.9, 4.5, -15.1), rm(-4.5, -15, 4.5, -46)], [0, -2.5], [0, -42]); zoneR(H, M.WATER, -4.5, -12, 4.5, -15); drawb(H, -1.2, -12, 1.2, -15, 2.4, 0, 0.5); blk(H, T, -4.5, -11.4, -1.2, -12); blk(H, T, 1.2, -11.4, 4.5, -12);
    spinner(H, T, -1.6, -21, 2.1, 2.2, 2); spinner(H, T, 1.6, -29, 2.1, -2.2, 2); zoneR(H, M.WATER, -4.5, -18, -3.6, -34); zoneR(H, M.WATER, 3.6, -18, 4.5, -34); blk(H, T, -3.9, -18, -3.6, -34); blk(H, T, 3.6, -18, 3.9, -34); slider(H, T, -37, -3, 3, 1.8, 0.6, 2.2); pen(H, T, 0, -42); return H; } },
  { par:6, sig:true, f:function(T){ var H = hole([rm(-5, 0, 5, -12), rm(-8, -16, 8, -30, 0.8), rm(-8, -29.9, 8, -33.1, 0.8), rm(-8, -33, 8, -42, 0.8), pg([[-8, -42], [8, -42], [0.8, -45.6], [-0.8, -45.6]], 0.8), rm(-0.8, -45.5, 0.8, -50, 0.8), rm(-6, -49.9, 6, -56, 0.8), rm(-6, -55.9, 6, -59.1, 0.8), rm(-6, -59, 6, -72, 0.8)], [0, -2.5], [0, -68]);
    pipe(H, T, 3, -9.5, 4.5, -17.6, 0, -1, 0.7, 6); pipe(H, T, -3, -9.5, 0, -1.2, 0, 1, 0.7); belt(H, -8, -20, 8, -25, -4.5, 0); zoneR(H, M.WATER, -8, -30, 8, -33); drawb(H, -1.3, -30, 1.3, -33, 2.4, 0.3, 0.5); blk(H, T, -8, -29.4, -1.3, -30); blk(H, T, 1.3, -29.4, 8, -30);
    loopAt(H, 0, -47.6, 0, -1, 0.85, 1.6); zoneR(H, M.MUD, -6, -50.2, 6, -52); jump(H, 0, -56, 0, -1, 2.2, 12, { h:0.9, ang:40 }); disc(H, 0, -64, 2.2, 1.8); flatAt(H, 0, -68); bumps(H, T, [[1, -8.6, 0.5]]);
    pipe(H, T, -0.4, -10.6, 2.5, -36, 0, -1, 0.9, 0, 0.5); secret(H, -1.2, -9.8, 0.4, -11.4); return H; } }
];
var MEMBER_NAMES = ['Graveyard Gate', 'Coffin Drop', 'Witch’s Loop', 'Bat Belfry', 'Haunted Floors', 'Brew River', 'Crypt Doors', 'Headless Leaps', 'Hallows Night',
  'Hayride', 'Bog Hop', 'Corn Maze', 'The Mill Race', 'Pie Plate Spin', 'Turkey Trot', 'Log Flume', 'Scarecrow Alley', 'Harvest Moon'];
var TOUR_NAMES = [
  'First Tee', 'The Slope', 'Bank Shot', 'The Windmill', 'Sand Bar', 'Pipe Dream', 'Slide Rule', 'Causeway', 'The Kicker',
  'First Loop', 'Two Gates', 'Conveyor', 'Drawbridge', 'Spin Cycle', 'The Creek', 'Double Mill', 'Loop the Pond', 'Clubhouse Classic',
  'Temple Steps', 'Jade Stream', 'Two Doors', 'Turning Floor', 'Vine Maze', 'Golden Ring', 'Waterfall', 'Dart Trap', 'Idol Eyes',
  'Temple Gates', 'Serpent River', 'Spinning Halls', 'The Leap', 'Three Doors', 'Ring and River', 'Crumbling Bridges', 'Idol Gauntlet', 'Heart of the Temple',
  'Gangplank', 'Barrel Roll', 'Cannonball', 'Walk the Plank', 'Tide Pool', 'Island Hop', 'Crow’s Nest', 'Treasure Hunt', 'Shipwreck',
  'Broadside', 'Skull Rock', 'Rope Swing', 'Low Tide', 'Lagoon Run', 'Mutiny', 'Double Jump', 'Powder Keg', 'Captain’s Cove',
  'Boom Town', 'Mine Cart', 'Down the Shaft', 'Ore Belts', 'Rail Loop', 'Flash Flood', 'Switchback', 'Two Carts', 'Canyon Jump',
  'Cave In', 'Deep Shaft', 'Gold Rush', 'Ore Chute', 'Loop the Loop', 'The Narrows', 'Flooded Trestles', 'Cart Crossing', 'Mother Lode',
  'Lava Lane', 'Hot Spring', 'Geyser Field', 'Lava Leap', 'Basalt Gates', 'Caldera', 'Ash Field', 'Magma Loop', 'Obsidian Bridges',
  'Eruption', 'Lava Tubes', 'Turning Rock', 'Twin Jumps', 'River of Fire', 'Fault Line', 'Tiki Torches', 'Pyroclast', 'The Summit'];
/* THE TOURS. Each is a list of worlds, a list of holes and their names, and what it pays. The Members
   Tour is one world of eighteen in two halves, on the season's theme, and pays the most on the site. */
var TOURS = {
  main:{ id:'main', name:'Putt Putt Tour', worlds:WORLDS, levels:LEVELS, names:TOUR_NAMES, tag:'lv', per:PER },
  members:{ id:'members', name:'Members Tour', season:'Hallows & Harvest', worlds:MEMBER_WORLDS, levels:MEMBER_LEVELS, names:MEMBER_NAMES, tag:'mb', per:9, members:true }
};
function tourOf(id){ return TOURS[id] || TOURS.main; }
function levelName(n, tid){ var TR = tourOf(tid); return TR.names[n - 1] || ('Hole ' + n); }
function worldOf(n, tid){ var TR = tourOf(tid); return TR.worlds[Math.floor((n - 1) / (TR.per || PER))] || TR.worlds[TR.worlds.length - 1]; }
// the desc a Tour level plays as: the same shape the daily and the themed holes use, so the 3D cache keys work
function tourDesc(n, host, tid){ var TR = tourOf(tid), W = worldOf(n, tid);
  return { tour:n, tid:TR.id, tpl:TR.tag + n, seed:hstr((TR.id === 'main' ? 'ppt:' : TR.id + ':') + n), theme:W.theme, name:levelName(n, tid) }; }
function buildLevel(n, tid, theme, name){
  var TR = tourOf(tid), L = TR.levels[n - 1], W = worldOf(n, tid), th = theme || W.theme, T = THEMES[th];
  var H = L.f(T); H.par = L.par;
  return courseFromH(H, TR.tag + n, hstr((TR.id === 'main' ? 'ppt:' : TR.id + ':') + n), th, name || levelName(n, tid));
}
function buildFrom(desc){ if (desc.custom){ var Hc = desc.custom(THEMES[desc.theme]); Hc.par = Hc.par || 3; return courseFromH(Hc, desc.tpl, desc.seed, desc.theme, desc.name); }
  if (desc.tour) return desc.daily ? buildLevel(desc.tour, desc.tid, desc.theme, desc.name) : buildLevel(desc.tour, desc.tid); return buildMini(desc.tpl, desc.seed, desc.theme, desc.name, desc.extra || 0); }

function scoreName(strokes, par){
  if (strokes === 1) return 'Hole in one';
  var d = strokes - par;
  return d <= -3 ? 'Albatross' : d === -2 ? 'Eagle' : d === -1 ? 'Birdie' : d === 0 ? 'Par' : d === 1 ? 'Bogey' : d === 2 ? 'Double bogey' : '+' + d;
}

/* =================================================================================== the export */
var RTT_PUTT = {
  API_VERSION:API_VERSION,
  M:M, BALL_R:BALL_R, CUP_R:CUP_R, CUP_R_MINI:CUP_R_MINI, V_MAX:V_MAX, V_STIMP:V_STIMP, ART:ART,
  THEMES:THEMES, TEMPLATES:TEMPLATES, COURSE_ORDER:COURSE_ORDER, DAILY_POOL:DAILY_POOL,
  hstr:hstr, mulberry:mulberry, hash3:hash3,
  simulate:simulate, speedFor:speedFor, feetFor:feetFor, fricOf:fricOf, moverAt:moverAt,
  makeField:makeField, finishCourse:finishCourse, inPoly:inPoly,
  greenCharacter:greenCharacter, buildReal:buildReal, spotFor:spotFor, fromHost:fromHost,
  CAL_THEMES:CAL_THEMES, buildMini:buildMini, buildFrom:buildFrom, LEVELS:LEVELS, WORLDS:WORLDS, TOURS:TOURS, PER:PER, buildLevel:buildLevel, worldOf:worldOf, lvHelpers:{ hole:hole, rm:rm, pg:pg }, tourDesc:tourDesc, levelName:levelName, themedCourse:themedCourse, dailyHole:dailyHole, dailyLevel:dailyLevel, themeForDay:themeForDay, scoreName:scoreName
};
/* ================================================================================ THE PICTURE */
/* Everything static is painted ONCE, onto a pixel grid of ART feet per pixel (the same grid the
   physics reads its materials and slopes from), and blitted at a whole number of screen pixels per
   art pixel, so the green is pixel art on the game's own grid rather than a smooth drawing of one.
   Only what moves (the windmill, a slider, the ball, the aim) is drawn each frame. */
var RGB = {};
function rgb(h){ var c = RGB[h]; if (c) return c; var n = parseInt(h.slice(1), 16); c = RGB[h] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; return c; }
function mix(a, b, t){ return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function shade(c, k){ return k >= 0 ? mix(c, [255, 255, 255], k) : mix(c, [0, 0, 0], -k); }
function ell(u, v, a, b){ return u * u / (a * a) + v * v / (b * b); }

/* SKINS. Each draws an object in a unit box (u right, v down, both -1..1) and answers a colour or
   nothing. A bumper, a block, a tunnel mouth and a piece of scenery are all one of these, which is
   what lets a theme be nothing but a list of names. */
var SKIN = {
  pumpkin:function(u, v){ if (v < -0.72 && v > -1 && Math.abs(u + v * 0.15) < 0.13) return '#3d6b1f'; var e = ell(u, v + 0.08, 0.98, 0.84); if (e > 1) return null; if (e > 0.74) return '#8a3d0c';
    if (Math.abs(Math.abs(u) - 0.42) < 0.08) return '#c95a12'; return (u < -0.35 && v < -0.15) ? '#ffad55' : '#f07f1e'; },
  tomb:function(u, v){ var inside = v < -0.35 ? ell(u, v + 0.35, 0.78, 0.62) < 1 : (Math.abs(u) < 0.78 && v < 0.92); if (!inside) return null;
    if (Math.abs(u) > 0.64 || v > 0.78 || (v < -0.35 && ell(u, v + 0.35, 0.78, 0.62) > 0.7)) return '#4a4b56';
    if ((Math.abs(u) < 0.08 && v > -0.62 && v < 0.25) || (Math.abs(v + 0.3) < 0.08 && Math.abs(u) < 0.34)) return '#5f606b'; return u < -0.25 ? '#c3c5cf' : '#a3a5b0'; },
  bat:function(u, v){ var b = ell(u, v, 0.26, 0.3) < 1; var w = Math.abs(u) < 1 && v > -0.35 + Math.abs(u) * 0.2 && v < 0.15 + Math.abs(u) * 0.5 - (Math.abs(Math.abs(u) - 0.6) < 0.08 ? 0.25 : 0);
    if (!(b || (w && Math.abs(u) > 0.2))) return null; if (b && v < -0.05 && Math.abs(Math.abs(u) - 0.1) < 0.07) return '#ff3b3b'; return '#24182f'; },
  ghost:function(u, v){ var top = v < 0 ? ell(u, v, 0.7, 0.85) < 1 : (Math.abs(u) < 0.7 && v < 0.75 + 0.18 * Math.sin(u * 9)); if (!top) return null;
    if (ell(Math.abs(u) - 0.27, v + 0.2, 0.12, 0.17) < 1) return '#1d1630'; return u < -0.3 ? '#ffffff' : '#dfe3f0'; },
  deadtree:function(u, v){ var tr = Math.abs(u) < 0.13 && v > -0.2; var br = (Math.abs(u - (v + 0.2) * -0.9) < 0.1 && v < -0.2 && v > -0.85) || (Math.abs(u + (v + 0.35) * -0.9) < 0.1 && v < -0.35 && v > -0.9);
    return (tr || br) ? (u < 0 ? '#4b3a2a' : '#3a2c20') : null; },
  pie:function(u, v){ var e = ell(u, v, 0.95, 0.95); if (e > 1) return null; if (e > 0.62) return (Math.abs(Math.atan2(v, u) * 4 % 1) < 0.3) ? '#a86b2c' : '#d29a52';
    if (Math.abs(((u + v) * 3.2) % 1) < 0.18 || Math.abs(((u - v) * 3.2) % 1) < 0.18) return '#e8b874'; return '#d9692a'; },
  hay:function(u, v){ if (Math.abs(u) > 0.95 || Math.abs(v) > 0.8) return null; if (Math.abs(u) > 0.82 || Math.abs(v) > 0.68) return '#a77a24';
    if (Math.abs(Math.abs(u) - 0.42) < 0.07) return '#8d5e18'; return ((Math.floor((v + 1) * 6) + Math.floor((u + 1) * 9)) % 3 === 0) ? '#f0cf6a' : '#e1b94d'; },
  corn:function(u, v){ if (Math.abs(u) < 0.1 && v > -0.9) return '#6f8b2a'; if (ell(u + 0.25, v + 0.1, 0.16, 0.42) < 1) return '#f2c94c'; if (Math.abs(u - (v + 0.2) * 0.8) < 0.09 && v > -0.6 && v < 0.6) return '#9cbf3c';
    if (Math.abs(u + (v - 0.3) * 0.8) < 0.09 && v > -0.2 && v < 0.9) return '#9cbf3c'; return null; },
  leaves:function(u, v){ var e = ell(u, v - 0.2, 0.95, 0.62); if (e > 1) return null; var k = Math.floor(u * 5 + 7) * 7 + Math.floor(v * 5 + 9) * 13; return ['#d9541e', '#e8a33a', '#b3361b', '#f2c94c'][k % 4]; },
  turkey:function(u, v){ var fan = ell(u, v + 0.15, 0.98, 0.85) < 1 && v < 0.25; var body = ell(u, v + 0.05, 0.42, 0.55) < 1, head = ell(u, v + 0.55, 0.18, 0.2) < 1;
    if (head) return v < -0.6 ? '#7a4a24' : '#e53935'; if (body) return u < -0.1 ? '#8a5a2e' : '#6e4421'; if (fan){ var a = Math.atan2(v + 0.15, u); return ['#c8344d', '#e8a33a', '#8a5a2e', '#f2c94c'][Math.floor((a + 3.2) * 2.2) % 4]; } return null; },
  snowball:function(u, v){ var e = ell(u, v, 0.92, 0.92); if (e > 1) return null; if (e > 0.82) return '#9fb6cc'; return (u < -0.25 && v < -0.25) ? '#ffffff' : '#e3eef8'; },
  gift:function(u, v){ if (Math.abs(u) > 0.88 || Math.abs(v) > 0.88) return null; if (Math.abs(u) < 0.14 || Math.abs(v) < 0.14) return '#ffd23f'; if (Math.abs(u) > 0.76 || Math.abs(v) > 0.76) return '#8e1717'; return '#d62f2f'; },
  pine:function(u, v){ if (Math.abs(u) < 0.12 && v > 0.7) return '#6b4a2a'; var t = (v + 0.95) / 1.7; if (t < 0 || t > 1) return null; var w = 0.12 + t * 0.8 - ((t * 3.2) % 1) * 0.18;
    if (Math.abs(u) > w) return null; if ((u * 7 + v * 5 | 0) % 7 === 0) return '#ffffff'; return u < 0 ? '#2e7d4b' : '#215e38'; },
  snowman:function(u, v){ var a = ell(u, v - 0.38, 0.6, 0.52) < 1, b = ell(u, v + 0.38, 0.42, 0.4) < 1; if (!a && !b) return null; if (b && Math.abs(v + 0.4) < 0.07 && Math.abs(u) < 0.08) return '#ff8a1a';
    if (b && v < -0.42 && Math.abs(Math.abs(u) - 0.16) < 0.06) return '#1a2a3a'; return u < -0.2 ? '#ffffff' : '#e3eef8'; },
  cane:function(u, v){ var hook = v < -0.35 && Math.abs(Math.hypot(u - 0.25, v + 0.35) - 0.35) < 0.13 && u > -0.12 - 0.0; var st = Math.abs(u + 0.1) < 0.13 && v >= -0.35 && v < 0.95; if (!hook && !st) return null;
    return (Math.floor((u + v) * 5 + 10) % 2) ? '#d62f2f' : '#ffffff'; },
  chimney:function(u, v){ if (Math.abs(u) > 0.92 || Math.abs(v) > 0.92) return null; if (Math.abs(u) < 0.55 && Math.abs(v) < 0.55) return '#1a1010'; return ((Math.floor((v + 1) * 4) % 2) ? (Math.floor((u + 1) * 3) % 2) : (Math.floor((u + 1.33) * 3) % 2)) ? '#a83a2a' : '#c4523e'; },
  heart:function(u, v){ var x = u * 1.15, y = -v * 1.15 + 0.15, k = x * x + y * y - 1; if (k * k * k - x * x * y * y * y > 0) return null; return (u < -0.2 && v < -0.1) ? '#ff8ab0' : '#ff2d6f'; },
  rose:function(u, v){ if (Math.abs(u) < 0.08 && v > 0.1) return '#3f8a3a'; if (ell(u - 0.22, v - 0.45, 0.22, 0.1) < 1) return '#4fa34a'; var e = ell(u, v + 0.3, 0.5, 0.48); if (e > 1) return null; return (Math.floor(e * 4) % 2) ? '#c2185b' : '#e91e63'; },
  candy:function(u, v){ if (ell(u, v, 0.5, 0.5) < 1) return (Math.floor((u - v) * 4 + 8) % 2) ? '#ff6f9f' : '#ffffff'; if (Math.abs(v) < 0.42 - (1 - Math.abs(u)) * 0.2 && Math.abs(u) < 0.98) return '#ffb3cc'; return null; },
  candybox:function(u, v){ var x = u * 1.1, y = -v * 1.1 + 0.1, k = x * x + y * y - 1; if (k * k * k - x * x * y * y * y > 0) return null; if (k > -0.22) return '#8e0f3a'; return (Math.floor((u + 1) * 5) % 2) ? '#d81b60' : '#c2185b'; },
  heartdoor:function(u, v){ var s = SKIN.heart(u, v); return s ? (ell(u, v + 0.05, 0.42, 0.42) < 1 ? '#3b0b1f' : s) : null; },
  clover:function(u, v){ if (Math.abs(u - (v - 0.2) * 0.3) < 0.08 && v > 0.2) return '#2a6b2a'; var l = ell(u, v + 0.42, 0.34, 0.34) < 1 || ell(u - 0.38, v + 0.02, 0.34, 0.34) < 1 || ell(u + 0.38, v + 0.02, 0.34, 0.34) < 1;
    return l ? (u < 0 ? '#5fd35f' : '#3fae3f') : null; },
  potgold:function(u, v){ if (v < -0.2 && ell(u, v + 0.45, 0.62, 0.32) < 1) return ((u * 7 + v * 3 | 0) % 2) ? '#ffd968' : '#e2b23b'; var e = ell(u, v - 0.2, 0.82, 0.65); if (e > 1) return null; return u < -0.3 ? '#3a3a3a' : '#1c1c1c'; },
  rainbow:function(u, v){ var r = Math.hypot(u, v + 0.6); if (v > 0.35 || r < 0.42 || r > 1) return null; return ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa'][Math.min(5, Math.floor((1 - r) / 0.58 * 6))]; },
  stone:function(u, v){ var e = ell(u, v, 0.95, 0.85); if (e > 1) return null; if (e > 0.8) return '#4f5a52'; return ((Math.floor((u + 1) * 3) + Math.floor((v + 1) * 2.5)) % 3 === 0) ? '#8b968d' : '#a3ada5'; },
  egg:function(u, v){ var e = ell(u, v * (v < 0 ? 0.92 : 1.1), 0.68, 0.92); if (e > 1) return null; if (Math.abs(v - 0.05) < 0.11) return '#ff8ab0'; if (Math.abs(v + 0.35) < 0.08 || Math.abs(v - 0.42) < 0.08) return '#ffd23f'; return u < -0.25 ? '#f1fbff' : '#bfe3ff'; },
  planter:function(u, v){ if (Math.abs(u) > 0.92 || Math.abs(v) > 0.8) return null; if (Math.abs(u) > 0.78 || Math.abs(v) > 0.66) return '#9c5a34'; return ((u * 9 + v * 13 | 0) % 5 === 0) ? '#ff8ab0' : '#5aa04a'; },
  flower:function(u, v){ if (Math.abs(u) < 0.08 && v > 0.15) return '#3f8a3a'; var r = Math.hypot(u, v + 0.2); if (r < 0.18) return '#ffd23f'; var a = Math.atan2(v + 0.2, u); if (r < 0.55 + 0.18 * Math.cos(a * 5)) return '#f48fb1'; return null; },
  bunny:function(u, v){ var ear = ell(u + 0.2, v + 0.6, 0.12, 0.35) < 1 || ell(u - 0.2, v + 0.6, 0.12, 0.35) < 1, head = ell(u, v + 0.05, 0.42, 0.36) < 1, body = ell(u, v + 0.62 - 1.2, 0.55, 0.42) < 1;
    if (!(ear || head || body)) return null; if (head && Math.abs(v + 0.08) < 0.06 && Math.abs(Math.abs(u) - 0.16) < 0.06) return '#222'; return u < 0 ? '#ffffff' : '#e9e4ef'; },
  burrow:function(u, v){ var e = ell(u, v, 0.92, 0.82); if (e > 1) return null; if (e < 0.42) return '#2a1a10'; return e > 0.78 ? '#6b4a2a' : '#8a6438'; },
  star:function(u, v){ var a = Math.atan2(v, u) + Math.PI / 2, r = Math.hypot(u, v), k = Math.cos(Math.PI / 5) / Math.cos((a % (2 * Math.PI / 5) + 2 * Math.PI / 5) % (2 * Math.PI / 5) - Math.PI / 5);
    if (r > 0.98 * (0.5 + 0.5 * Math.abs(Math.cos(a * 2.5)))) return null; return u < -0.1 ? '#ffffff' : '#e3e8ff'; },
  burst:function(u, v){ var r = Math.hypot(u, v), a = Math.atan2(v, u); if (r > 0.98) return null; if (r < 0.14) return '#ffffff'; if (Math.abs(((a / (Math.PI / 6)) % 1)) < 0.18 && ((r * 7 | 0) % 2)) return ['#ff5252', '#ffd23f', '#64b5f6'][(a * 2 + 9 | 0) % 3]; return null; },
  flagpole:function(u, v){ if (Math.abs(u + 0.5) < 0.07 && v > -0.95) return '#cfd8dc'; if (u > -0.45 && u < 0.85 && v > -0.95 && v < -0.15) return (u < 0.15 && v < -0.55) ? ((u * 14 + v * 14 | 0) % 2 ? '#ffffff' : '#1e3a8a') : (((v + 1) * 9 | 0) % 2 ? '#e53935' : '#ffffff'); return null; },
  crate:function(u, v){ if (Math.abs(u) > 0.9 || Math.abs(v) > 0.9) return null; if (Math.abs(u) > 0.76 || Math.abs(v) > 0.76 || Math.abs(u - v) < 0.12) return '#7a4a24'; return '#c08a4a'; },
  pipe:function(u, v){ var e = ell(u, v, 0.92, 0.92); if (e > 1) return null; if (e < 0.4) return '#0a0e18'; return e > 0.78 ? '#455a64' : '#78909c'; },
  beachball:function(u, v){ var e = ell(u, v, 0.92, 0.92); if (e > 1) return null; if (e > 0.85) return '#9e9e9e'; if (Math.hypot(u, v) < 0.16) return '#ffffff'; var a = Math.atan2(v, u); return ['#ff5a3c', '#ffffff', '#2196f3', '#ffffff', '#ffd23f', '#ffffff'][Math.floor((a + Math.PI) / (Math.PI / 3)) % 6]; },
  castle:function(u, v){ if (Math.abs(u) > 0.9 || v > 0.9) return null; if (v < -0.55 && (Math.floor((u + 1) * 3.5) % 2)) return null; if (v < -0.95) return null; if (Math.abs(u) < 0.2 && v > 0.3) return '#a07a40'; return u < -0.3 ? '#f7e3a8' : '#e2c27a'; },
  surfboard:function(u, v){ var e = ell(u, v, 0.98, 0.42); if (e > 1) return null; if (Math.abs(v) < 0.07) return '#ff5a3c'; return '#ffd23f'; },
  shell:function(u, v){ var e = ell(u, v, 0.92, 0.82); if (e > 1 || v > 0.6) return null; if (e < 0.35 && v > -0.2) return '#2a1a10'; return (Math.floor((Math.atan2(v - 0.6, u) + 3.2) * 4) % 2) ? '#ffcdb2' : '#f4a582'; },
  palm:function(u, v){ var tr = Math.abs(u - v * 0.15) < 0.1 && v > -0.4; if (tr) return ((v * 10 | 0) % 2) ? '#8a6438' : '#a07a40';
    var a = Math.atan2(v + 0.55, u), r = Math.hypot(u, v + 0.55); if (r < 0.95 && Math.abs(((a / (Math.PI / 3)) % 1) - 0.5) < 0.22 - r * 0.12) return r < 0.4 ? '#2e7d32' : '#43a047'; return null; },
  umbrella:function(u, v){ var e = ell(u, v, 0.95, 0.95); if (e > 1) return null; if (Math.hypot(u, v) < 0.1) return '#ffffff'; return (Math.floor((Math.atan2(v, u) + 3.2) / (Math.PI / 4)) % 2) ? '#ff5a3c' : '#ffffff'; },
  crab:function(u, v){ var b = ell(u, v, 0.55, 0.38) < 1, cl = ell(Math.abs(u) - 0.68, v + 0.48, 0.2, 0.18) < 1, leg = Math.abs(v - 0.15 - Math.abs(u) * 0.3) < 0.07 && Math.abs(u) > 0.45 && Math.abs(u) < 0.9;
    if (b && v < -0.1 && Math.abs(Math.abs(u) - 0.18) < 0.07) return '#222'; return (b || cl || leg) ? (u < 0 ? '#ff7043' : '#e64a19') : null; },
  log:function(u, v){ if (Math.abs(u) > 0.92 || Math.abs(v) > 0.7) return null; if (Math.abs(v) < 0.36 && Math.abs(u) < 0.55) return '#2a1a10'; if (Math.abs(u) > 0.78) return ((Math.hypot(u, v) * 9 | 0) % 2) ? '#c08a4a' : '#9a6a36'; return (v < 0) ? '#7a4a24' : '#5e3818'; },
  pad:function(u, v){ var r = Math.hypot(u, v); if (r > 0.96) return null; if (r > 0.8) return '#1d2a44'; if (r > 0.62) return '#F1D04A'; if (r > 0.44) return '#ff5a3c';
    return (Math.abs(u) < 0.12 || Math.abs(v) < 0.12) ? '#ffffff' : '#F1D04A'; },
  coffin:function(u, v){ var w = 0.55 + (v < -0.4 ? (v + 1) * 0.6 : 0.36 - (v + 0.4) * 0.28); if (Math.abs(u) > w || Math.abs(v) > 0.95) return null; if (Math.abs(u) > w - 0.14 || Math.abs(v) > 0.82) return '#2a1810';
    if ((Math.abs(u) < 0.07 && v > -0.6 && v < 0.2) || (Math.abs(v + 0.35) < 0.07 && Math.abs(u) < 0.25)) return '#c9a227'; return '#5a3a24'; },
  // ---- the Lost Temple: a carved stone idol, worn temple blocks, a doorway in the ruin, ferns
  idol:function(u, v){ var w = v < -0.35 ? 0.62 : v < 0.55 ? 0.5 : 0.7; if (Math.abs(u) > w || Math.abs(v) > 0.95) return null;
    if (v < -0.35 && Math.abs(Math.abs(u) - 0.24) < 0.1 && Math.abs(v + 0.62) < 0.08) return '#37e0a0';
    if (v < -0.35 && Math.abs(v + 0.45) < 0.05 && Math.abs(u) < 0.34) return '#4a4232';
    if (Math.abs(v - 0.55) < 0.06) return '#c9a227'; return u < -0.15 ? '#a8a07c' : '#8f8766'; },
  ruin:function(u, v){ if (Math.abs(u) > 0.92 || Math.abs(v) > 0.88) return null; if (Math.abs(v) > 0.74) return '#6f6a4e';
    var row = Math.floor((v + 1) * 3), cx = ((u + 1) * 2.2 + (row % 2) * 0.5) % 1; if (cx < 0.08 || ((v + 1) * 3) % 1 < 0.1) return '#5e5a41';
    return (row + Math.floor((u + 1) * 2.2)) % 3 === 0 ? '#3f7a3a' : '#b0a77e'; },
  door:function(u, v){ if (Math.abs(u) > 0.9 || Math.abs(v) > 0.92) return null; var r = Math.hypot(u, v + 0.1);
    if (v > -0.1 && Math.abs(u) < 0.42 || r < 0.42) return '#141008'; if (r < 0.58 && v < 0) return '#c9a227'; return (Math.floor((v + 1) * 4) + Math.floor((u + 1) * 2)) % 2 ? '#a69c72' : '#968c63'; },
  fern:function(u, v){ var a = Math.atan2(v - 0.7, u), r = Math.hypot(u, v - 0.7); if (r > 1.5 || v > 0.9) return null;
    var lf = Math.abs(((a / (Math.PI / 5)) % 1 + 1) % 1 - 0.5); if (lf > 0.3 - r * 0.12) return null; return r < 0.6 ? '#2e7d32' : (r < 1.1 ? '#43a047' : '#66bb6a'); },
  // ---- Pirate Cove: a barrel, a cannon, a treasure chest, an anchor, a gangplank
  barrel:function(u, v){ var w = 0.78 - v * v * 0.18; if (Math.abs(u) > w || Math.abs(v) > 0.92) return null; if (Math.abs(Math.abs(v) - 0.55) < 0.08 || Math.abs(v) > 0.84) return '#3d3a3a';
    return (Math.floor((u + 1) * 4.5) % 2) ? '#9a6236' : '#b07440'; },
  cannon:function(u, v){ var e = ell(u, v, 0.92, 0.92); if (e > 1) return null; if (e < 0.32) return '#0a0a0c'; if (e < 0.55) return '#2c2c30'; return e > 0.85 ? '#1a1a1e' : '#45454c'; },
  chest:function(u, v){ if (Math.abs(u) > 0.92 || Math.abs(v) > 0.8) return null; if (v < -0.2 && Math.hypot(u, v + 0.2) > 0.95) return null;
    if (Math.abs(v + 0.15) < 0.07 || Math.abs(Math.abs(u) - 0.55) < 0.07) return '#c9a227'; if (Math.abs(u) < 0.12 && Math.abs(v) < 0.18) return '#f1d04a'; return v < -0.15 ? '#7a4a24' : '#8f5a2c'; },
  anchor:function(u, v){ var r = Math.hypot(u, v + 0.65); if (r < 0.2 && r > 0.1) return '#3d4450';
    if (Math.abs(u) < 0.1 && v > -0.5 && v < 0.7) return '#4f5866'; if (Math.abs(v + 0.25) < 0.08 && Math.abs(u) < 0.45) return '#4f5866';
    var a = Math.hypot(u, v - 0.1); if (v > 0.25 && Math.abs(a - 0.68) < 0.11) return '#4f5866'; return null; },
  plank:function(u, v){ if (Math.abs(u) > 0.95 || Math.abs(v) > 0.55) return null; if (Math.abs(v) > 0.44 || Math.abs(u - 0.1) < 0.04) return '#5e3818'; return ((u * 7 | 0) % 3) ? '#a0703c' : '#8a5e30'; },
  // ---- Canyon Mine: a boulder, a mine cart, a lantern, a shaft mouth, a cactus
  boulder:function(u, v){ var e = ell(u, v * 1.08, 0.94, 0.86) + Math.sin(Math.atan2(v, u) * 5) * 0.05; if (e > 1) return null; if (e > 0.82) return '#6e3a22';
    return (u + v < -0.45) ? '#d0875a' : ((Math.floor((u + 1) * 3) + Math.floor((v + 1) * 3)) % 4 === 0 ? '#9a5534' : '#b8693e'); },
  cart:function(u, v){ if (Math.abs(u) > 0.92 || v > 0.92 || v < -0.6) return null; if (v > 0.55){ var wr = Math.hypot(Math.abs(u) - 0.5, v - 0.7); return wr < 0.22 ? (wr < 0.09 ? '#c9a227' : '#2a2a2e') : null; }
    if (Math.abs(u) > 0.84 - (v + 0.6) * 0.1 || v < -0.48) return '#3d3a3a'; if (v < -0.2) return ((u * 9 | 0) % 2) ? '#8a7a6a' : '#6a5e52'; return ((u * 5 | 0) % 2) ? '#8a5432' : '#7a4a2a'; },
  lantern:function(u, v){ if (Math.abs(u) > 0.6 || Math.abs(v) > 0.95) return null; if (v < -0.7) return Math.abs(u) < 0.2 ? '#2a2a2e' : null;
    if (Math.abs(v) > 0.55 || Math.abs(u) > 0.48) return '#2a2a2e'; return Math.hypot(u, v) < 0.3 ? '#fff3a8' : '#ffb347'; },
  shaft:function(u, v){ if (Math.abs(u) > 0.92 || Math.abs(v) > 0.9) return null; if (v > -0.55 && Math.abs(u) < 0.55) return '#120c08';
    if (Math.abs(Math.abs(u) - 0.72) < 0.14 || (v < -0.55 && v > -0.85)) return '#8a5a30'; return null; },
  cactus:function(u, v){ var tr = Math.abs(u) < 0.2 && v > -0.92, l = Math.abs(u + 0.5) < 0.14 && v > -0.5 && v < 0.1, r2 = Math.abs(u - 0.5) < 0.14 && v > -0.7 && v < -0.1;
    var lb = v > 0 && v < 0.18 && u > -0.6 && u < 0, rb = v > -0.2 && v < -0.05 && u > 0 && u < 0.6; if (!(tr || l || r2 || lb || rb)) return null;
    if (tr && v < -0.86) return '#ff7aa8'; return ((u * 12 | 0) % 2) ? '#3f8a3e' : '#2f7034'; },
  // ---- Volcano Island: a lava rock, a basalt block, a steam vent, a tiki
  lavarock:function(u, v){ var e = ell(u, v, 0.92, 0.84) + Math.sin(Math.atan2(v, u) * 6) * 0.06; if (e > 1) return null;
    var crack = Math.abs(Math.sin(u * 7 + v * 3)) < 0.12 && e < 0.8; if (crack) return '#ff7a1a'; return (u + v < -0.5) ? '#4a4246' : (e > 0.8 ? '#1f1a1d' : '#332c30'); },
  basalt:function(u, v){ if (Math.abs(u) > 0.92 || Math.abs(v) > 0.9) return null; var col = Math.floor((u + 1) * 3.5), top = -0.9 + (col % 2) * 0.12;
    if (v < top) return null; if (((u + 1) * 3.5) % 1 < 0.09) return '#141113'; if (v < top + 0.12) return '#57505a'; return col % 2 ? '#2e292e' : '#3a343a'; },
  vent:function(u, v){ var e = ell(u, v, 0.92, 0.92); if (e > 1) return null; if (e < 0.3) return '#ff8a2a'; if (e < 0.5) return '#7a2a10'; return e > 0.85 ? '#1f1a1d' : '#3a3236'; },
  tiki:function(u, v){ if (Math.abs(u) > 0.55 || Math.abs(v) > 0.95) return null; if (v < -0.75) return Math.abs(u) < 0.45 ? '#3f8a3e' : null;
    if (Math.abs(v + 0.35) < 0.1 && Math.abs(Math.abs(u) - 0.22) < 0.1) return '#f1d04a'; if (Math.abs(v - 0.15) < 0.08 && Math.abs(u) < 0.3) return '#2a1a10';
    if (Math.abs(v - 0.5) < 0.05) return '#5a3818'; return u < -0.15 ? '#a0703c' : '#8a5e30'; }
};
RTT_PUTT.SKIN = SKIN; RTT_PUTT.riverAt = riverAt; RTT_PUTT.bridgeDown = bridgeDown; RTT_PUTT.bridgeLift = bridgeLift; RTT_PUTT.inAny = inAny; RTT_PUTT.edgeDist = edgeDist;   // hole3d.js builds a bumper's 3D shape from the same skin the flat painter uses
function moverCol(k, T){ return rgb(k === 'blade' ? T.spinner : T.wallLo); }

function paintCourse(C){
  var mats = C.mats, nx = mats.nx, ny = mats.ny, b = C.bounds, cv = mkCanvas(nx, ny), ctx = cv.getContext('2d'), img = ctx.createImageData(nx, ny), D = img.data;
  var F = C.field, real = C.kind === 'real', T = C.T, B = C.biome || {};
  var pal = real ? { out:rgb(B.base || '#5f8a30'), out2:rgb(B.tickD || '#4f7628'), out3:rgb(B.tickL || '#79a442'), green:rgb(B.green || '#b9d96e'), fringe:rgb(B.fringe || '#a4c95d'), line:rgb(B.gLine || '#6f9339'),
      sand:rgb(B.sand || '#f2f0e4'), sandL:rgb(B.sandLine || '#8f8a76'), speck:rgb(B.sandSpeck || '#b9b6a6'), water:rgb(B.water || '#3f9fe0'), ripple:rgb(B.ripple || '#bfe3f7'), ink:rgb(B.outline || '#1e3d16') }
    : { out:rgb(T.bg), out2:rgb(T.bg2), green:rgb(T.carpet), green2:rgb(T.carpet2), haz:rgb(T.hazCol), haz2:rgb(T.hazCol2), slow:rgb(T.slowCol), wall:rgb(T.wall), wallHi:rgb(T.wallHi), wallLo:rgb(T.wallLo), ink:rgb(T.ink) };
  var stripe = real ? (hash3(C.spec.seed, 5, 5) * 3.1) : 0, sa = Math.cos(stripe), sb = Math.sin(stripe);
  function put(o, c){ D[o] = c[0]; D[o + 1] = c[1]; D[o + 2] = c[2]; D[o + 3] = 255; }
  for (var j = 0; j < ny; j++) for (var i = 0; i < nx; i++){
    var o = (j * nx + i) * 4, m = mats.A[j * nx + i], x = b[0] + i * ART, y = b[1] + j * ART, c, n = hash3(i, j, 3);
    // light from the upper left: a slope facing it is lit, one facing away is in shade
    var gx = F.GX[j * nx + i], gy = F.GY[j * nx + i], lit = clamp((gx * 0.7 + gy * 0.7) * (real ? 5.5 : 2.6), -0.32, 0.32);
    if (m === M.OUT){ c = (hash3(i >> 1, j >> 1, 9) < 0.12) ? pal.out2 : pal.out; }
    else if (m === M.ROUGH){ c = n < 0.1 ? pal.out2 : n > 0.93 ? pal.out3 : pal.out; c = shade(c, lit * 0.5); }
    else if (m === M.FRINGE){ c = shade(n < 0.15 ? shade(pal.fringe, -0.05) : pal.fringe, lit * 0.7); }
    else if (m === M.GREEN){
      if (real){ var band = Math.floor((x * sa + y * sb) / 5) & 1; c = shade(band ? pal.green : shade(pal.green, -0.06), lit); }
      else { c = shade(n < 0.16 ? pal.green2 : pal.green, lit); }
    }
    else if (m === M.SAND){ c = real ? (n < 0.12 ? pal.speck : pal.sand) : (n < 0.14 ? [217, 196, 138] : [236, 219, 164]); }
    else if (m === M.WATER){ c = real ? (((i * 3 + j * 5) % 23 === 0) ? pal.ripple : pal.water) : ((((i + (j >> 1) * 3) % 17) === 0) ? pal.haz2 : pal.haz); }
    else if (m === M.ICE){ c = (((i + j) % 11) < 2) ? pal.haz2 : pal.haz; }
    else if (m === M.MUD){ c = n < 0.22 ? shade(pal.slow, -0.18) : pal.slow; }
    else if (m === M.FLOW){ c = (((i * 3 + j * 5) % 17) < 3) ? [95, 179, 230] : [47, 134, 200]; }
    else if (m === M.BELT){ c = ((((C.belts[0] && Math.abs(C.belts[0].ay) > Math.abs(C.belts[0].ax)) ? j : i) % 6) < 3) ? [58, 63, 72] : [90, 97, 108]; }
    else c = pal.out;
    put(o, c);
  }
  // edges: the green's collar, a bunker's lip, and the mini course's walls
  for (var j2 = 1; j2 < ny - 1; j2++) for (var i2 = 1; i2 < nx - 1; i2++){
    var k = j2 * nx + i2, m0 = mats.A[k], o2 = k * 4;
    var nb = [mats.A[k - 1], mats.A[k + 1], mats.A[k - nx], mats.A[k + nx]];
    if (real){
      if (m0 === M.GREEN && nb.some(function(q){ return q !== M.GREEN; })) put(o2, pal.line);
      else if (m0 === M.SAND && nb.some(function(q){ return q !== M.SAND; })) put(o2, pal.sandL);
      else if (m0 === M.WATER && nb.some(function(q){ return q !== M.WATER; })) put(o2, rgb(B.waterBank || '#7d6238'));
    } else if (m0 !== M.OUT && (m0 === M.WATER || m0 === M.ICE) && nb.some(function(q){ return q === M.GREEN; })) put(o2, shade(pal.haz, -0.25));
  }
  if (!real){
    // the rail: a band just outside the carpet, lit along its inner edge, inked along its outer one
    for (var j3 = 0; j3 < ny; j3++) for (var i3 = 0; i3 < nx; i3++){
      var x3 = b[0] + i3 * ART, y3 = b[1] + j3 * ART, inside = mats.A[j3 * nx + i3] !== M.OUT;
      var d = edgeDist(C.edges, x3, y3);
      var o3 = (j3 * nx + i3) * 4;
      if (!inside && d < 0.75) put(o3, d < 0.22 ? pal.wallHi : d > 0.6 ? pal.ink : pal.wall);
      else if (inside && d < 0.45) put(o3, shade([D[o3], D[o3 + 1], D[o3 + 2]], -0.18));
    }
    // shadows first, then the objects that cast them
    var objs = [];
    (C.blocks || []).forEach(function(r){ objs.push({ x0:r.x0, y0:r.y0, x1:r.x1, y1:r.y1, skin:r.skin, rect:1 }); });
    (C.bumpers || []).forEach(function(u){ objs.push({ x0:u.x - u.r, y0:u.y - u.r, x1:u.x + u.r, y1:u.y + u.r, skin:u.skin }); });
    (C.portals || []).forEach(function(p){ objs.push({ x0:p.ax - 1.05, y0:p.ay - 1.05, x1:p.ax + 1.05, y1:p.ay + 1.05, skin:p.skin, port:1 }); objs.push({ x0:p.bx - 0.75, y0:p.by - 0.6, x1:p.bx + 0.75, y1:p.by + 0.6, skin:'exit' }); });
    (C.props || []).forEach(function(p){ objs.push({ x0:p.x - p.s, y0:p.y - p.s, x1:p.x + p.s, y1:p.y + p.s, skin:p.k, prop:1 }); });
    var sh = 0.3;
    objs.forEach(function(ob){ paintSkin(ob, sh); });
    objs.forEach(function(ob){ paintSkin(ob, 0); });
  }
  function paintSkin(ob, off){
    var fn = ob.skin === 'exit' ? function(u, v){ return (v < 0.2 && ell(u, v - 0.2, 0.9, 0.9) < 1) ? '#0b0b10' : null; } : (SKIN[ob.skin] || SKIN.stone);
    var i0 = Math.floor((ob.x0 + off - b[0]) / ART), i1 = Math.ceil((ob.x1 + off - b[0]) / ART), j0 = Math.floor((ob.y0 + off - b[1]) / ART), j1 = Math.ceil((ob.y1 + off - b[1]) / ART);
    for (var jj = Math.max(0, j0); jj <= Math.min(ny - 1, j1); jj++) for (var ii = Math.max(0, i0); ii <= Math.min(nx - 1, i1); ii++){
      var xx = b[0] + ii * ART - off, yy = b[1] + jj * ART - off, u = ((xx - ob.x0) / (ob.x1 - ob.x0)) * 2 - 1, v = ((yy - ob.y0) / (ob.y1 - ob.y0)) * 2 - 1;
      if (ob.rect && !SKIN[ob.skin]){ continue; }
      var col = fn(u, v); if (!col) continue;
      var oo = (jj * nx + ii) * 4;
      if (off){ put(oo, shade([D[oo], D[oo + 1], D[oo + 2]], -0.32)); continue; }
      put(oo, rgb(col));
      if (ob.port && ell(u, v, 0.5, 0.5) < 1) put(oo, rgb('#0b0b10'));
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}
function mkCanvas(w, h){ var c = typeof document !== 'undefined' ? document.createElement('canvas') : null; if (c){ c.width = w; c.height = h; } return c; }

/* ===================================================================================== THE GAME */
var CSS = '\
.pt-ov{position:fixed;inset:0;z-index:9500;display:flex;flex-direction:column;background:#07130d;color:#e8f2ec;font-family:var(--body,system-ui,sans-serif);-webkit-user-select:none;user-select:none}\
.pt-top{display:flex;align-items:center;gap:10px;padding:calc(env(safe-area-inset-top,0px) + 8px) 12px 8px;background:#0c1f16;border-bottom:1px solid rgba(241,208,74,.25)}\
.pt-x{flex:0 0 auto;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16);color:#e8f2ec;border-radius:10px;padding:7px 11px;font:inherit;font-weight:800;font-size:13px;cursor:pointer}\
.pt-hd{flex:1;min-width:0}.pt-hd b{display:block;font-family:var(--display,inherit);font-size:17px;line-height:1.1;color:#F1D04A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\
.pt-hd span{display:block;font-size:11.5px;color:#9fbfae;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\
.pt-sc{flex:0 0 auto;text-align:right;font-weight:800;font-size:12px;color:#cfe0d8;font-variant-numeric:tabular-nums}.pt-sc b{display:block;font-size:20px;color:#fff;line-height:1}\
.pt-stage{position:relative;flex:1;min-height:0;overflow:hidden;touch-action:none}.pt-stage canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none}\
.pt-bar{display:flex;align-items:center;gap:8px;padding:8px 12px calc(env(safe-area-inset-bottom,0px) + 8px);background:#0c1f16;border-top:1px solid rgba(255,255,255,.08)}\
.pt-bt{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);color:#e8f2ec;border-radius:10px;padding:9px 12px;font:inherit;font-weight:800;font-size:13px;cursor:pointer;min-width:44px}\
.pt-bt.on{background:#F1D04A;color:#10241a;border-color:#F1D04A}.pt-hint{flex:1;min-width:0;font-size:12px;color:#9fbfae;line-height:1.3}\
.pt-read{position:absolute;left:10px;top:10px;padding:6px 9px;border-radius:9px;background:rgba(6,18,12,.82);border:1px solid rgba(241,208,74,.45);font-size:12px;font-weight:800;color:#F1D04A;pointer-events:none;font-variant-numeric:tabular-nums}\
.pt-read span{display:block;color:#cfe0d8;font-weight:700;font-size:11px}\
.pt-pop{position:absolute;left:50%;top:42%;transform:translate(-50%,-50%);min-width:240px;max-width:88%;text-align:center;padding:18px 18px 14px;border-radius:16px;background:rgba(8,22,15,.94);border:2px solid #F1D04A;box-shadow:0 12px 40px rgba(0,0,0,.5)}\
.pt-pop .k{font-size:11px;letter-spacing:.14em;color:#9fbfae;font-weight:800}.pt-pop .t{font-family:var(--display,inherit);font-size:34px;color:#F1D04A;line-height:1.05;margin:4px 0}.pt-pop .s{font-size:13px;color:#cfe0d8;margin-bottom:12px}\
.pt-pop .row{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}.pt-go{background:#F1D04A;color:#10241a;border:0;border-radius:11px;padding:11px 16px;font:inherit;font-weight:900;font-size:14px;cursor:pointer}\
.pt-menu{flex:1;overflow:auto;padding:14px 12px 30px;display:flex;flex-direction:column;gap:12px;max-width:560px;width:100%;margin:0 auto;box-sizing:border-box}\
.pt-card{display:block;width:100%;text-align:left;border-radius:16px;padding:14px;background:linear-gradient(160deg,#143524,#0c1f16);border:1px solid rgba(241,208,74,.3);color:inherit;font:inherit;cursor:pointer}\
.pt-card .k{font-size:11px;letter-spacing:.14em;font-weight:800;color:#9fbfae;text-transform:uppercase}.pt-card .t{font-family:var(--display,inherit);font-size:22px;color:#fff;line-height:1.1;margin:3px 0 4px}\
.pt-card .m{font-size:12.5px;color:#cfe0d8;line-height:1.35}.pt-card .g{display:inline-block;margin-top:9px;font-weight:900;font-size:13px;color:#F1D04A}\
.pt-sh{font-size:11px;letter-spacing:.16em;font-weight:900;color:#F1D04A;margin:8px 2px -2px}\
.pt-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.pt-th{border-radius:13px;padding:10px;text-align:left;border:1px solid rgba(255,255,255,.12);color:#fff;font:inherit;cursor:pointer;min-height:76px}\
.pt-th .k{font-size:10px;letter-spacing:.12em;font-weight:800;opacity:.85;text-transform:uppercase}.pt-th .t{font-family:var(--display,inherit);font-size:16px;line-height:1.1;margin:3px 0}.pt-th .m{font-size:11px;opacity:.9}\
.pt-th.now{outline:2px solid #F1D04A;outline-offset:1px}.pt-tag{display:inline-block;font-size:10px;font-weight:900;letter-spacing:.1em;padding:3px 7px;border-radius:999px;background:#F1D04A;color:#10241a;margin-left:6px;vertical-align:2px}\
.pt-sel{width:100%;margin-top:8px;padding:9px;border-radius:10px;background:#0a1912;color:#e8f2ec;border:1px solid rgba(255,255,255,.2);font:inherit;font-size:13px}\
.pt-card table{width:100%;border-collapse:collapse;margin-top:8px;font-size:12px;font-variant-numeric:tabular-nums}.pt-card td{padding:3px 2px;border-bottom:1px solid rgba(255,255,255,.07)}\
.pt-card td:last-child{text-align:right;font-weight:800}\
.pp-stat{flex:0 0 auto;display:flex;flex-direction:column;align-items:flex-end;gap:2px;font-weight:800;font-size:11px;color:#cfe0d8}.pp-coin{color:#ffd45e}.pp-coin:before{content:"\\25CF ";color:#ffd45e}\
.pp-hearts,.pp-lives{display:flex;gap:3px}.pp-lives{justify-content:center;margin:6px 0 2px}.pp-h{width:14px;height:12px;background:rgba(255,255,255,.18);clip-path:path("M7 12 L1 6 A3 3 0 0 1 7 2 A3 3 0 0 1 13 6 Z")}.pp-h.on{background:#ff4d6d}\
.pp-clock{color:#9fbfae;font-variant-numeric:tabular-nums}\
.pp-hub{flex:1;min-height:0;display:flex;flex-direction:column;max-width:560px;width:100%;margin:0 auto}\
.pp-daily{display:grid;grid-template-columns:1fr auto;align-items:center;gap:2px 10px;margin:10px 12px 8px;padding:12px 14px;border-radius:16px;border:2px solid;text-align:left;font:inherit;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.35)}\
.pp-daily .k{grid-column:1;font-size:10.5px;letter-spacing:.14em;font-weight:900;text-transform:uppercase;opacity:.85}.pp-daily .t{grid-column:1;font-family:var(--display,inherit);font-size:21px;line-height:1.1}\
.pp-daily .m{grid-column:1;font-size:12px;opacity:.9}.pp-daily .g{grid-column:2;grid-row:1/4;font-weight:900;font-size:14px;background:#F1D04A;color:#10241a;border-radius:11px;padding:10px 14px}\
.pp-map{position:relative;flex:1;min-height:0;overflow-x:hidden;overflow-y:auto;-webkit-overflow-scrolling:touch;border-top:1px solid rgba(241,208,74,.25)}\
.pp-world{position:relative;margin:0 auto}.pp-band{position:absolute;left:-200px;right:-200px;background-size:cover;background-position:center;background-repeat:no-repeat;overflow:hidden}.pp-land{position:absolute;left:0;top:0;image-rendering:pixelated;display:block}\
.pp-wname{position:absolute;left:0;right:0;text-align:center;pointer-events:none;text-shadow:0 2px 0 rgba(0,0,0,.55),0 0 8px rgba(0,0,0,.5)}.pp-wname b{display:block;font-family:var(--display,inherit);font-size:18px;letter-spacing:.02em}.pp-wname span{font-size:11px;font-weight:800;opacity:.8}\
.pp-path{position:absolute;left:0;top:0;pointer-events:none}.pp-path path{fill:none;stroke:rgba(255,255,255,.75);stroke-width:5;stroke-dasharray:2 11;stroke-linecap:round}\
.pp-lv{position:absolute;transform:translate(-50%,-50%);width:50px;height:50px;border-radius:50%;border:3px solid #10241a;background:#F1D04A;color:#10241a;font:inherit;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 4px 0 rgba(0,0,0,.35);padding:0}\
.pp-lv b{font-family:var(--display,inherit);font-size:19px;line-height:1}.pp-lv span{font-size:10px;font-weight:900;line-height:1;opacity:.8}\
.pp-lv.done{background:#fff7d6}.pp-lv.ace{background:linear-gradient(160deg,#ffe680,#d9a514);border-color:#7a5200}.pp-lv.lock{background:#5a6b62;color:#c9d6cf;border-color:#2a3530;box-shadow:none}\
.pp-lv.sig{width:62px;height:62px}.pp-lv i{position:absolute;top:-12px;right:-6px;font-style:normal;font-size:17px;color:#ffd45e;text-shadow:0 1px 0 #000}\
.pp-lv.cur{outline:4px solid #fff;animation:ppPulse 1.4s ease-in-out infinite}@keyframes ppPulse{50%{outline-color:rgba(255,255,255,.35)}}\
.pp-me{position:absolute;transform:translate(-50%,-100%);pointer-events:none}.pp-meimg{display:block;height:56px;image-rendering:pixelated}\
.pp-toast{position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 24px);transform:translate(-50%,20px);opacity:0;transition:.2s;background:#10241a;border:1px solid #F1D04A;color:#fff;font-weight:800;font-size:13px;padding:9px 14px;border-radius:11px;z-index:3;pointer-events:none}.pp-toast.on{opacity:1;transform:translate(-50%,0)}\
.pp-sheet{position:absolute;inset:0;z-index:4;background:rgba(3,10,7,.72);display:flex;align-items:center;justify-content:center;padding:16px}\
.pp-card{width:min(340px,100%);background:linear-gradient(168deg,#0e3020,#06170f);border:1.5px solid rgba(241,208,74,.45);border-radius:18px;padding:16px;text-align:center}\
.pp-card .k{font-size:11px;letter-spacing:.14em;font-weight:900;color:#ff8a8a}.pp-card .t{font-family:var(--display,inherit);font-size:24px;color:#fff;margin:4px 0}.pp-card .m{font-size:13px;color:#cfe0d8;margin:4px 0 12px}\
.pp-big{font-family:var(--display,inherit);font-size:38px;color:#F1D04A;font-variant-numeric:tabular-nums}.pp-wide{display:block;width:100%;margin-top:8px}.pp-wide small{display:block;font-size:10.5px;font-weight:700;opacity:.75}.pt-go[disabled]{opacity:.55;cursor:default}\
.pp-nums{display:flex;justify-content:center;gap:16px;margin:8px 0}.pp-nums span{font-size:10.5px;letter-spacing:.1em;color:#9fbfae;font-weight:800;text-transform:uppercase}.pp-nums b{display:block;font-size:24px;color:#fff;letter-spacing:0}\
.pp-coins{font-weight:900;color:#ffd45e;font-size:16px;margin:4px 0 6px}.pp-reward{background:rgba(241,208,74,.12);border:1px solid rgba(241,208,74,.45);border-radius:11px;padding:8px;margin:8px 0;font-weight:800;font-size:13px;color:#fff}.pp-fine{font-size:11px!important;opacity:.75}\
.pp-dres{border-radius:16px;padding:16px;text-align:center}.pp-dres .k{font-size:11px;letter-spacing:.14em;font-weight:900;text-transform:uppercase;opacity:.85}.pp-dres .t{font-family:var(--display,inherit);font-size:34px;margin:4px 0}.pp-dres .m{font-size:13px}\
.pp-hub{position:relative;max-width:none}.pp-hub .pp-map{position:absolute;inset:0;border-top:0;background:#0b1a12}\
.pp-hdr{position:absolute;left:0;right:0;top:0;z-index:2;display:flex;align-items:center;gap:8px;padding:calc(env(safe-area-inset-top,0px) + 10px) 12px 26px;background:linear-gradient(rgba(5,10,14,.78),rgba(5,10,14,0));pointer-events:none}\
.pp-hdr>*{pointer-events:auto}.pp-av{flex:0 0 auto;width:36px;height:36px;border-radius:50%;border:2px solid #F1D04A;background:#1d3a5c no-repeat;background-size:230%;background-position:50% 8%;image-rendering:pixelated;box-shadow:0 2px 0 rgba(0,0,0,.4)}\
.pp-hdr .pp-hearts{gap:4px}.pp-h{width:21px;height:18px;background:none;clip-path:none;display:block}.pp-h svg{display:block;width:21px;height:18px}.pp-h.on{background:none}\
.pp-hclock{font-size:12px;font-weight:900;color:#ffd0c8;font-variant-numeric:tabular-nums;background:rgba(0,0,0,.45);border-radius:999px;padding:3px 8px}.pp-hclock:empty{display:none}\
.pp-sp{flex:1}.pp-cpill{display:flex;align-items:center;gap:6px;background:rgba(10,18,26,.82);border:1px solid rgba(255,255,255,.14);border-radius:999px;padding:5px 11px;font-weight:900;font-size:14px;color:#fff;font-variant-numeric:tabular-nums}.pp-cpill:before{content:"";width:12px;height:12px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#fff3a8,#f1c232 55%,#b8860b)}\
.pp-cx{width:34px;height:34px;border-radius:50%;border:1px solid rgba(255,255,255,.18);background:rgba(10,18,26,.82);color:#fff;font:inherit;font-size:16px;font-weight:900;cursor:pointer;padding:0}\
.pp-hub .pp-daily{position:absolute;z-index:2;left:12px;right:12px;top:calc(env(safe-area-inset-top,0px) + 58px);margin:0;max-width:536px;margin:0 auto;grid-template-columns:auto 1fr auto;gap:2px 12px;background:linear-gradient(160deg,#2c1d46,#1a1230)!important;color:#fff!important;border:2px solid #f08a24!important;border-radius:18px;padding:12px}\
.pp-daily .th{grid-column:1;grid-row:1/4;width:44px;height:66px;border-radius:7px;background:#0d1a12;overflow:hidden;box-shadow:inset 0 0 0 1px rgba(255,255,255,.18)}.pp-daily .th canvas{width:100%;height:100%;object-fit:cover;image-rendering:pixelated;display:block}\
.pp-hub .pp-daily .k,.pp-hub .pp-daily .t,.pp-hub .pp-daily .m{grid-column:2}.pp-hub .pp-daily .k{letter-spacing:0;text-transform:none;font-weight:700;font-size:12.5px;opacity:.85}.pp-hub .pp-daily .t{font-size:22px}.pp-hub .pp-daily .m{font-size:12.5px;opacity:.85}\
.pp-hub .pp-daily .g{grid-column:3;background:#f08a24;color:#2a1606;border-radius:12px;padding:10px 16px;font-size:15px}\
.pp-lv{width:52px;height:52px;border:3px solid #3a2a14;background:#f6ead2;color:#3a2a14;box-shadow:0 4px 0 rgba(0,0,0,.4)}.pp-lv b{font-size:20px}\
.pp-lv span{position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:5px;white-space:nowrap;font-size:11px;font-weight:900;letter-spacing:.04em;color:#fff;opacity:1;text-shadow:0 1px 0 #000,0 0 4px rgba(0,0,0,.8)}\
.pp-lv.ace{background:radial-gradient(circle at 38% 32%,#fff6b0,#f1c232 50%,#c58b0e);border-color:#6b4700;color:#3a2600}\
.pp-lv.lock{background:#283846;color:#c3ced8;border-color:rgba(160,176,190,.75);box-shadow:0 3px 0 rgba(0,0,0,.35)}\
.pp-lv.cur{background:#12a08f;color:#fff;border-color:#eafff9;outline:0;animation:none;box-shadow:0 4px 0 rgba(0,0,0,.4),0 0 0 0 rgba(234,255,249,.6)}.pp-lv.cur:after{content:"";position:absolute;inset:-9px;border-radius:50%;border:3px solid rgba(234,255,249,.75);animation:ppRing 1.6s ease-out infinite;pointer-events:none}\
@keyframes ppRing{0%{transform:scale(.8);opacity:.9}100%{transform:scale(1.25);opacity:0}}\
.pp-lv.sig{width:64px;height:64px}.pp-me{transform:translate(0,-100%)}.pp-meimg{height:64px}\
.pp-wchip{position:absolute;z-index:2;left:12px;bottom:calc(env(safe-area-inset-bottom,0px) + 14px);background:rgba(10,18,26,.85);border:1px solid rgba(255,255,255,.14);color:#fff;border-radius:999px;padding:7px 13px;font-size:11.5px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;pointer-events:none}\
.pp-pop{top:auto;bottom:calc(env(safe-area-inset-bottom,0px) + 16px);transform:translateX(-50%);width:min(340px,92%);max-width:none;min-width:0;box-sizing:border-box;background:#14213a;border:1px solid rgba(255,255,255,.14);border-radius:20px;padding:18px 16px 16px;box-shadow:0 14px 40px rgba(0,0,0,.55)}\
.pp-pop .k{font-size:12px;letter-spacing:.18em;font-weight:900;color:#2ec4b0}.pp-pop.par .k{color:#F1D04A}.pp-pop.over .k{color:#ff6a55}.pp-pop .t{color:#fbf2e0;font-size:46px;font-weight:400;margin:2px 0 6px}.pp-pop .s{color:#dbe4ee}\
.pp-pop .pp-nums{gap:8px;margin:10px 0}.pp-pop .pp-nums span{flex:1;max-width:84px;background:rgba(255,255,255,.07);border-radius:12px;padding:8px 4px 7px;color:#9fb2c8}.pp-pop .pp-nums b{font-size:26px;font-weight:400;color:#fbf2e0;font-family:var(--display,inherit)}\
.pp-pop .pp-coins{display:inline-block;background:rgba(0,0,0,.35);border-radius:999px;padding:6px 14px;font-size:15px;margin:2px 0 10px}.pp-pop .pp-coins:before{content:"";display:inline-block;width:12px;height:12px;border-radius:50%;margin-right:7px;vertical-align:-1px;background:radial-gradient(circle at 35% 35%,#fff3a8,#f1c232 55%,#b8860b)}\
.pp-pop .row{flex-wrap:nowrap}.pp-pop .row>*{flex:1;padding:13px 10px;border-radius:13px;font-size:15px}.pp-pop .pt-bt{background:#0c1628;border-color:rgba(255,255,255,.16);color:#fff}\
.pp-pop .pt-go{background:#12a08f;color:#fff}.pp-pop.par .pt-go{background:#F1D04A;color:#1c1606}.pp-pop.over .pt-go{background:#e5483a;color:#fff}\
.pp-pop .pp-lives{gap:6px}.pp-pop .pp-lives .pp-h,.pp-pop .pp-lives .pp-h svg{width:28px;height:24px}\
.pp-sheet.pp-oolf{background:linear-gradient(#173226,#0a1a24);align-items:stretch;justify-content:flex-start;flex-direction:column;padding:0;overflow:auto}\
.pp-oolf .pp-hdr{position:relative;background:none}.pp-oolb{flex:1;display:flex;flex-direction:column;align-items:center;gap:10px;padding:24px 18px calc(env(safe-area-inset-bottom,0px) + 24px);max-width:420px;width:100%;margin:0 auto;box-sizing:border-box;text-align:center}\
.pp-oolb .k{font-size:13px;letter-spacing:.18em;font-weight:900;color:#ff6a55;margin-top:18px}.pp-oolb .pp-lives{gap:10px}.pp-oolb .pp-lives .pp-h,.pp-oolb .pp-lives .pp-h svg{width:42px;height:36px}\
.pp-oolb .lbl{font-weight:900;color:#e8f0f6;font-size:14px}.pp-oolb .pp-big{font-size:54px;color:#fbf2e0;line-height:1}.pp-oolb .m{font-size:12.5px;color:#a9bccb;margin:0 0 8px}\
.pp-oolb .pp-wide{margin:0;border-radius:14px;padding:13px;font-size:16px}.pp-oolb .ref{background:#F1D04A;color:#1c1606}.pp-oolb .pass{background:#12a08f;color:#fff}.pp-oolb .pt-bt{background:transparent;border-color:rgba(255,255,255,.22);color:#fff}.pp-oolb .pt-go[disabled]{opacity:.7}\
.pp-dres{background:linear-gradient(160deg,#2c1d46,#1a1230)!important;color:#fff!important;border:2px solid #f08a24;display:grid;grid-template-columns:1fr auto;gap:2px 12px;text-align:left}.pp-dres .k{color:#f08a24;grid-column:1}.pp-dres .nm{grid-column:1;font-family:var(--display,inherit);font-size:30px;line-height:1.05}\
.pp-dres .th{grid-column:2;grid-row:1/4;width:64px;height:96px;border-radius:9px;overflow:hidden;background:#0d1a12}.pp-dres .th canvas{width:100%;height:100%;object-fit:cover;image-rendering:pixelated;display:block}\
.pp-dres .sc{grid-column:1/3;display:flex;align-items:center;gap:12px;margin-top:6px}.pp-dres .sc b{font-family:var(--display,inherit);font-size:64px;line-height:1;color:#F1D04A;font-weight:400}.pp-dres .sc span{font-size:15px;line-height:1.25}.pp-dres .m{grid-column:1/3}\
.pt-top.pp-play{gap:8px;background:linear-gradient(#0a1420,#0e1c2a);border-bottom-color:rgba(255,255,255,.1)}.pp-play .pt-x{width:32px;height:32px;border-radius:50%;padding:0;font-size:14px}.pp-play .pp-av{width:30px;height:30px}.pp-play .pt-sc{display:none}.pp-play .pp-hearts{gap:2px}.pp-play .pp-h,.pp-play .pp-h svg{width:15px;height:13px}\
.pp-play .pt-hd b{font-size:14px;color:#fbf2e0}.pp-play .pt-hd span{display:inline-block;max-width:100%;box-sizing:border-box;margin-top:3px;background:#F1D04A;color:#1c1606;font-weight:900;border-radius:999px;padding:2px 9px;font-size:11px}\
.pt-ov>.pp-hdr{position:relative;background:none}\
.pp-sizer{position:relative;overflow:hidden}.pp-sizer .pp-world{position:absolute;left:50%;top:0;margin:0;transform-origin:top center}\
.pp-hub .pp-daily{display:flex;align-items:center;gap:12px;padding:12px 12px 12px 12px;border:0!important;background:linear-gradient(135deg,#3a1f63,#1c1438 60%)!important;box-shadow:0 0 0 2px #f08a24,0 10px 26px rgba(0,0,0,.45);overflow:hidden}\
.pp-hub .pp-daily:before{content:"";position:absolute;inset:0;background:repeating-linear-gradient(115deg,rgba(255,255,255,.035) 0 14px,transparent 14px 28px);pointer-events:none}\
.pp-dtile{flex:0 0 auto;width:54px;border-radius:10px;overflow:hidden;background:#fbf2e0;color:#1c1606;text-align:center;box-shadow:0 3px 0 rgba(0,0,0,.35)}.pp-dtile .mo{display:block;background:var(--dt,#f08a24);color:#fff;font-size:11px;font-weight:900;letter-spacing:.14em;padding:3px 0}.pp-dtile .dy{display:block;font-family:var(--display,inherit);font-size:28px;line-height:1.1;padding:2px 0 4px}\
.pp-dmid{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;text-align:left}.pp-dk{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.pp-dk b{font-size:11px;font-weight:900;letter-spacing:.16em;text-transform:uppercase;color:#f08a24}\
.pp-dstreak{font-style:normal;font-size:10.5px;font-weight:900;background:rgba(240,138,36,.2);color:#ffb06a;border-radius:999px;padding:2px 7px}\
.pp-hub .pp-daily .t{font-family:var(--display,inherit);font-size:22px;line-height:1.05;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pp-hub .pp-daily .m{font-size:12px;color:#d6cdf0;opacity:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\
.pp-dends{font-size:12px;color:#d6cdf0}.pp-dends b{font-variant-numeric:tabular-nums;color:#fff;font-weight:900;letter-spacing:.02em}\
.pp-dside{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;gap:5px}.pp-hub .pp-daily .pp-dside .g{background:#f08a24;color:#2a1606;border-radius:12px;padding:11px 18px;font-size:16px;font-weight:900}.pp-dside .rw{font-size:10.5px;font-weight:900;color:#ffd45e;white-space:nowrap}\
@media (min-width:900px){.pp-hdr{padding:18px 28px 40px;gap:14px}.pp-av{width:52px;height:52px}.pp-hdr .pp-h,.pp-hdr .pp-h svg{width:30px;height:26px}.pp-hclock{font-size:15px}.pp-cpill{font-size:19px;padding:8px 16px}.pp-cpill:before{width:16px;height:16px}.pp-cx{width:46px;height:46px;font-size:20px}\
  .pp-hub .pp-daily{top:84px;max-width:640px;padding:16px 18px;gap:18px;border-radius:22px}.pp-dtile{width:72px}.pp-dtile .dy{font-size:38px}.pp-dk b{font-size:13px}.pp-hub .pp-daily .t{font-size:32px}.pp-hub .pp-daily .m,.pp-dends{font-size:15px}.pp-hub .pp-daily .pp-dside .g{font-size:20px;padding:14px 26px}.pp-dside .rw{font-size:13px}\
  .pp-wchip{left:28px;bottom:24px;font-size:15px;padding:10px 18px}.pp-oolb{max-width:560px;gap:14px}.pp-oolb .pp-big{font-size:84px}}.pp-tabs{position:absolute;z-index:2;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 12px);white-space:nowrap;display:flex;gap:4px;padding:4px;border-radius:999px;background:rgba(10,18,26,.88);border:1px solid rgba(255,255,255,.14)}.pp-tabs button{border:0;border-radius:999px;padding:8px 13px;font:inherit;font-size:12px;font-weight:900;letter-spacing:.04em;background:transparent;color:#cfd8e3;cursor:pointer}.pp-tabs button.on{background:#F1D04A;color:#10241a}.pp-tabs i{font-style:normal;color:#ffd45e}.pp-tabs .on i{color:#7a4d00}.pp-tabs s{text-decoration:none;font-size:11px;margin-left:2px}.pp-mem .pp-map{background:#120c1e}.pp-memsh .pp-card{border:2px solid #f08a24;background:linear-gradient(160deg,#2c1d46,#160f28)}.pp-memsh .k{color:#ffd45e;font-weight:900;font-size:11px;letter-spacing:.12em}.pp-memrw{margin:10px 0;font-size:13px;line-height:1.5;color:#e9e1ff}.pp-memrw b{color:#ffd45e}@media (max-width:899px){.pp-hub .pp-wchip{bottom:calc(env(safe-area-inset-bottom,0px) + 64px)}}@media (min-width:900px){.pp-tabs{bottom:22px}.pp-tabs button{font-size:15px;padding:11px 18px}}.pp-clock{display:flex;align-items:center;gap:5px;margin-left:auto;background:rgba(10,18,26,.85);border:1px solid #f08a24;border-radius:999px;padding:5px 11px;font-weight:900;font-size:14px;color:#fff;font-variant-numeric:tabular-nums}.pp-clock i{width:8px;height:8px;border-radius:50%;background:#f08a24;animation:ppblink 1s steps(2) infinite}@keyframes ppblink{50%{opacity:.25}}.pp-dres .sc .pp-tm{margin-left:14px}.pp-strk{display:flex;align-items:center;gap:6px;background:rgba(10,18,26,.82);border:1px solid rgba(255,255,255,.14);border-radius:999px;padding:6px 12px;font-weight:900;font-size:13px;color:#fff}\
/* EVERY WORLD HAS ITS OWN BUTTONS: ARE MADE OF THAT WORLD. A level on the Clubhouse lawn is a golf ball, in the Temple a carved stone, at Pirate Cove a gold doubloon (a locked one a barrel end), in the Mine a plank sign with its rivets, on the Volcano a lump of basalt with lava round its rim, in Hallows Night a headstone and at Harvest Moon a pumpkin. The daily card, the tabs and the chips follow the world in view. */\
.pp-lv.wt-clubhouse{background:radial-gradient(circle at 34% 30%,#fff 0 18%,transparent 19%),radial-gradient(rgba(0,0,0,.09) 18%,transparent 22%) 0 0/7px 7px,radial-gradient(circle at 40% 35%,#ffffff,#e9ecdf 70%,#c9cfbd);border-color:#1e5a2e;color:#17361f}\
.pp-lv.wt-clubhouse.lock{background:radial-gradient(circle at 40% 35%,#4f7d58,#2c4a33);border-color:#9cc3a6;color:#d8eadc}.pp-lv.wt-clubhouse.cur{background:radial-gradient(circle at 40% 35%,#ff6a5a,#c8231c);border-color:#fff;color:#fff}\
.pp-lv.wt-temple{border-radius:13px;background:linear-gradient(160deg,#e9dfb4,#c9bd8e 55%,#a99d70);border-color:#4e4830;color:#2b2a17;box-shadow:inset 0 0 0 2px rgba(55,224,160,.55),inset 0 -4px 0 rgba(0,0,0,.18),0 4px 0 rgba(0,0,0,.4)}\
.pp-lv.wt-temple.lock{background:linear-gradient(160deg,#4f5e44,#33402c);border-color:#7f8c66;color:#b9c7a6;box-shadow:inset 0 -3px 0 rgba(0,0,0,.25),0 3px 0 rgba(0,0,0,.35)}.pp-lv.wt-temple.cur{background:linear-gradient(160deg,#3fe0a6,#159a6e);border-color:#e6fff4;color:#06261a}.pp-lv.wt-temple.cur:after{border-radius:18px}\
.pp-lv.wt-pirate{background:radial-gradient(circle at 34% 30%,#fff3b0,#f2c443 42%,#c08b12 78%,#8a5e06);border-color:#5e3d07;color:#4a2c03;box-shadow:inset 0 0 0 3px rgba(255,236,150,.55),inset 0 0 0 5px rgba(120,80,6,.45),0 4px 0 rgba(0,0,0,.4)}\
.pp-lv.wt-pirate.lock{background:repeating-linear-gradient(90deg,#6e4728 0 6px,#5c3a20 6px 7px,#73502e 7px 12px),#6e4728;border-color:#2b190b;color:#f0d9b0;box-shadow:inset 0 0 0 3px #3a240f,0 3px 0 rgba(0,0,0,.35)}.pp-lv.wt-pirate.cur{background:radial-gradient(circle at 38% 32%,#ff8a6a,#d12f22);border-color:#fff3d6;color:#fff}\
.pp-lv.wt-canyon{border-radius:9px;background:radial-gradient(circle at 7px 7px,#3d2814 2px,transparent 2.6px),radial-gradient(circle at calc(100% - 7px) 7px,#3d2814 2px,transparent 2.6px),radial-gradient(circle at 7px calc(100% - 7px),#3d2814 2px,transparent 2.6px),radial-gradient(circle at calc(100% - 7px) calc(100% - 7px),#3d2814 2px,transparent 2.6px),repeating-linear-gradient(0deg,#d89a5c 0 9px,#c4854a 9px 10px),#d89a5c;border-color:#3d2814;color:#2e1606}\
.pp-lv.wt-canyon.lock{background:linear-gradient(160deg,#5a4538,#3a2b22);border-color:#8a6e58;color:#d4bfa8}.pp-lv.wt-canyon.cur{background:radial-gradient(circle at 50% 40%,#fff1b8,#ffb347 50%,#d9761a);border-color:#3d2814;color:#2e1606;box-shadow:0 0 14px rgba(255,179,71,.85),0 4px 0 rgba(0,0,0,.4)}.pp-lv.wt-canyon.cur:after{border-radius:14px}\
.pp-lv.wt-volcano{background:radial-gradient(circle at 36% 30%,#6a5e63,#2c2427 70%);border-color:#ff7a1a;color:#ffd9b0;box-shadow:0 0 12px rgba(255,106,26,.55),inset 0 0 6px rgba(255,120,30,.35),0 4px 0 rgba(0,0,0,.45)}\
.pp-lv.wt-volcano.lock{background:radial-gradient(circle at 36% 30%,#3c3437,#1d181a);border-color:#5c5258;color:#9a8f94;box-shadow:0 3px 0 rgba(0,0,0,.4)}.pp-lv.wt-volcano.cur{background:radial-gradient(circle at 40% 35%,#ffe08a,#ff6a1a 55%,#a3290a);border-color:#fff1d6;color:#2a0a02}\
.pp-lv.wt-haunted{border-radius:50% 50% 9px 9px/62% 62% 9px 9px;background:linear-gradient(180deg,#b5b0c6,#7d778f);border-color:#231d30;color:#1b1626}\
.pp-lv.wt-haunted.lock{background:linear-gradient(180deg,#3b3152,#241c36);border-color:#5d5278;color:#9d93b8}.pp-lv.wt-haunted.cur{background:radial-gradient(circle at 50% 40%,#ffd08a,#ff8a1a);border-color:#2a1606;color:#2a1606}.pp-lv.wt-haunted.cur:after{border-radius:50% 50% 14px 14px/62% 62% 14px 14px}\
.pp-lv.wt-harvest{background:radial-gradient(ellipse 22% 50% at 50% 50%,rgba(0,0,0,.12),transparent 70%),radial-gradient(ellipse 50% 50% at 22% 50%,rgba(0,0,0,.1),transparent 70%),radial-gradient(ellipse 50% 50% at 78% 50%,rgba(0,0,0,.1),transparent 70%),radial-gradient(circle at 40% 32%,#ffc46a,#ef8a1e 60%,#b8560c);border-color:#5a2e0c;color:#3a1c04}\
.pp-lv.wt-harvest.lock{background:repeating-linear-gradient(170deg,#c8a457 0 3px,#a8843c 3px 5px);border-color:#5a4318;color:#3a2a08}.pp-lv.wt-harvest.cur{background:radial-gradient(circle at 40% 35%,#e0703a,#8b2e10);border-color:#ffe2b0;color:#fff}\
.pp-lv.ace{background:radial-gradient(circle at 38% 32%,#fff6b0,#f1c232 50%,#c58b0e)!important;border-color:#6b4700!important;color:#3a2600!important}\
.pp-hub{--wa:#f08a24;--wi:#2a1606;--wb1:#3a1f63;--wb2:#1c1438;--wt:rgba(10,18,26,.88)}\
.pp-hub[data-wt=clubhouse]{--wa:#F1D04A;--wi:#14301c;--wb1:#24653d;--wb2:#123a22;--wt:rgba(14,40,24,.9)}\
.pp-hub[data-wt=temple]{--wa:#37e0a0;--wi:#06261a;--wb1:#3a5432;--wb2:#1b2e1a;--wt:rgba(22,34,18,.9)}\
.pp-hub[data-wt=pirate]{--wa:#f2c443;--wi:#3a2203;--wb1:#16466e;--wb2:#0b2238;--wt:rgba(8,28,48,.9)}\
.pp-hub[data-wt=canyon]{--wa:#ffb347;--wi:#2e1606;--wb1:#7a4222;--wb2:#3d2010;--wt:rgba(52,26,12,.9)}\
.pp-hub[data-wt=volcano]{--wa:#ff8a2a;--wi:#2a0a02;--wb1:#4a1e12;--wb2:#1a0f0c;--wt:rgba(26,16,14,.92)}\
.pp-hub[data-wt=haunted]{--wa:#ff9a3a;--wi:#2a1606;--wb1:#3a1f63;--wb2:#1c1438;--wt:rgba(28,20,44,.92)}\
.pp-hub[data-wt=harvest]{--wa:#f2a93b;--wi:#2b1606;--wb1:#7a4a1e;--wb2:#3a220c;--wt:rgba(52,32,12,.92)}\
.pp-hub[data-wt] .pp-daily{background:linear-gradient(135deg,var(--wb1),var(--wb2) 62%)!important;box-shadow:0 0 0 2px var(--wa),0 10px 26px rgba(0,0,0,.45);transition:background .4s,box-shadow .4s}\
.pp-hub[data-wt] .pp-daily .pp-dside .g{background:var(--wa);color:var(--wi)}.pp-hub[data-wt] .pp-dk b{color:var(--wa)}.pp-hub[data-wt] .pp-dside .rw{color:var(--wa)}\
.pp-hub[data-wt] .pp-tabs,.pp-hub[data-wt] .pp-wchip{background:var(--wt);border-color:color-mix(in srgb,var(--wa) 45%,transparent)}.pp-hub[data-wt] .pp-tabs button.on{background:var(--wa);color:var(--wi)}.pp-hub[data-wt] .pp-wchip{color:#fff;box-shadow:inset 3px 0 0 var(--wa)}\
.pp-hub[data-wt] .pp-cpill,.pp-hub[data-wt] .pp-cx{background:var(--wt)}.pp-hub[data-wt] .pp-av{border-color:var(--wa)}'

var S = null;   // the open game, or null
function el(html){ var d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
function load(){ try{ return JSON.parse(localStorage.getItem('bag_putt_v1')) || {}; }catch(e){ return {}; } }
function save(st){ try{ localStorage.setItem('bag_putt_v1', JSON.stringify(st)); }catch(e){} }
/* The game's day key is a NUMBER (20261005), Eastern; this module's is the ISO string. Read the game's
   so the daily turns over when the rest of the game does, and write it the way this file reads it. */
function today(){ try{ var k = String(hostOf().todayKey()); if (/^\d{8}$/.test(k)) return k.slice(0, 4) + '-' + k.slice(4, 6) + '-' + k.slice(6, 8); if (/^\d{4}-\d{2}-\d{2}$/.test(k)) return k; }catch(e){} return new Date().toISOString().slice(0, 10); }
function fmtPar(d){ return d === 0 ? 'E' : (d > 0 ? '+' + d : String(d)); }

function open(host){
  if (S) close();
  if (!document.getElementById('pt-css')){ var st = document.createElement('style'); st.id = 'pt-css'; st.textContent = CSS; document.head.appendChild(st); }
  var ov = el('<div class="pt-ov" role="dialog" aria-modal="true" aria-label="Putt Putt Tour"></div>');
  document.body.appendChild(ov);
  S = { host:host || {}, ov:ov, prevOverflow:document.body.style.overflow };
  document.body.style.overflow = 'hidden';
  S.onKey = function(e){ onKey(e); }; window.addEventListener('keydown', S.onKey);
  showMenu();
}
function close(){
  if (!S) return;
  cancelAnimationFrame(S.raf); clearInterval(S.tick); window.removeEventListener('keydown', S.onKey); if (S.onResize) window.removeEventListener('resize', S.onResize);
  document.body.style.overflow = S.prevOverflow || ''; S.ov.remove();
  var h = S.host; S = null; try{ if (h.onClose) h.onClose(); }catch(e){}
}
function top(title, sub, right){
  return '<div class="pt-top"><button class="pt-x" data-x>' + (S.screen === 'menu' ? 'Close' : 'Back') + '</button><div class="pt-hd"><b>' + esc(title) + '</b><span>' + esc(sub) + '</span></div><div class="pt-sc">' + (right || '') + '</div></div>';
}

/* ============================================================================ THE TOUR, PLAYED */
/* The mode opens on the Tour map with the Daily Hole on top. The rules, in full:
     under par   the hole is beaten and the next one opens (coins the first time only)
     exactly par nothing lost, nothing won: go again
     over par    a life goes and the hole restarts. It is decided the moment par strokes are used
                 with the ball still out, so nobody putts out a hole that is already lost.
   Quitting after the first putt costs a life too. The Daily Hole never costs one.
   3 lives, 6 with a Tour Pass. When the last one goes a 24 hour clock starts and fills them.

   WHAT IS KEPT WHERE, said plainly: everything here is kept in this browser, per account, through
   the page's own account-scoped key. The mockup's server ledger (lives on server time, a tester table
   the score calls check, the Daily Hole board) is not built yet, so for now a tester could reset a
   clock by clearing site data. Nobody but a tester can open the mode at all. */
/* WHAT THE TOURS PAY. The Putt Putt Tour pays exactly 20,000 coins, every ace included, the same as the
   50 hole Tour it replaced: 80 a hole and 280 for the signature hole the first time it is beaten, 20 for
   a first ace, 2,000 for finishing a world. The Members Tour pays the most on the site for the fewest
   holes, plus rewards nobody else can earn. No coin price anywhere changes. */
var PAY = {
  main:{ hole:80, sig:280, ace:20, world:2000,
    sigReward:['Clubhouse Visor', 'Jade Idol Putter', 'Tricorn Hat', 'Miner’s Lamp Cap', 'Lava Ball'],
    worldReward:['Clubhouse Polo', 'Explorer Hat', 'Treasure Trail', 'Gold Nugget Ball', 'Eruption Celebration'] },
  members:{ hole:300, sig:1200, ace:60, world:2500, exclusive:true,
    sigReward:['Hallows Crown (Members only)', 'Harvest Moon Putter (Members only)'],
    worldReward:['Phantom Trail (Members only)', 'Golden Leaf Ball (Members only)'], finish:'Members Champion Jacket (Members only)' }
};
var COIN_HOLE = PAY.main.hole, COIN_SIG = PAY.main.sig, COIN_ACE = PAY.main.ace, COIN_WORLD = PAY.main.world, COIN_DAILY = 40, COIN_DAILY_PAR = 40;
var LIFE_MS = 24 * 3600 * 1000;
var ACE_REWARD = { 5:'Hole in One Charm', 15:'Golden Putter', 30:'Ace Crown' };
var STREAK_REWARD = { 7:'Week Streak Ball', 30:'Month Streak Visor', 100:'Century Streak Trail' };
var HOSTX = null;   // the host when the mode is closed, for the home screen card
function hostOf(){ return (S && S.host) || HOSTX || {}; }
function pkey(){ try{ var h = hostOf(); return h.storeKey ? h.storeKey('bag_ppt_v1') : 'bag_ppt_v1'; }catch(e){ return 'bag_ppt_v1'; } }
/* THE RECORD. Lives, the Daily Hole, the streak and the rewards are the account's; each tour keeps its
   own place, best scores, aces and what it has paid. A record from the 50 hole Tour keeps everything
   but its place on a ladder that no longer exists: those holes are gone, so it starts at hole 1. */
function pload(){ var st = null; try{ st = JSON.parse(localStorage.getItem(pkey())); }catch(e){} st = st || {};
  if (st.v !== 2){ st.tours = {}; delete st.lv; delete st.best; delete st.ace; delete st.paid; delete st.wpaid; st.v = 2; }
  st.tours = st.tours || {}; Object.keys(TOURS).forEach(function(k){ var t = st.tours[k] = st.tours[k] || {}; t.lv = t.lv || 1; t.best = t.best || {}; t.ace = t.ace || {}; t.paid = t.paid || {}; t.wpaid = t.wpaid || {}; });
  st.daily = st.daily || {}; st.rewards = st.rewards || []; st.streak = st.streak || { n:0, last:null, best:0 };
  if (st.lives == null) st.lives = livesMax();
  if (st.refillAt && Date.now() >= st.refillAt){ st.lives = livesMax(); st.refillAt = null; psave(st); }
  return st; }
function psave(st){ try{ localStorage.setItem(pkey(), JSON.stringify(st)); }catch(e){} }
function livesMax(){ try{ var h = hostOf(); return h.passActive && h.passActive() ? 6 : 3; }catch(e){ return 3; } }
function loseLife(st){ st.lives = Math.max(0, (st.lives == null ? livesMax() : st.lives) - 1); if (st.lives === 0 && !st.refillAt) st.refillAt = Date.now() + LIFE_MS; psave(st); }
function coins(n, label){ try{ if (S.host.coins) S.host.coins(n, label); }catch(e){} }
function hms(ms){ ms = Math.max(0, ms); var s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h + ':' + (m < 10 ? '0' : '') + m + ':' + (x < 10 ? '0' : '') + x; }
function hm(ms){ var m = Math.max(0, Math.round(ms / 60000)); return Math.floor(m / 60) + 'h ' + (m % 60) + 'm'; }
// how long until the game's day turns over (Eastern midnight), which is when the next Daily Hole arrives
function msToNextDay(){ try{ var now = new Date(), et = new Date(now.toLocaleString('en-US', { timeZone:'America/New_York' })), nx = new Date(et); nx.setHours(24, 0, 0, 0); return nx - et; }catch(e){ return 0; } }
function perOf(tid){ return tourOf(tid).per || PER; }
function wl(n, tid){ var k = perOf(tid); return (tourOf(tid).members ? 'M' : '') + (Math.floor((n - 1) / k) + 1) + '-' + ((n - 1) % k + 1); }
function aceCount(st){ var n = 0; Object.keys(st.tours).forEach(function(k){ n += Object.keys(st.tours[k].ace).length; }); return n; }
// the Members Tour is the Tour Pass holder's. A tester can preview it, said so on the screen.
function membersOpen(){ try{ var h = hostOf(); return !!(h.passActive && h.passActive()); }catch(e){ return false; } }
function membersPreview(){ return !!(S && S.memPreview); }
function grant(st, name){ if (name && st.rewards.indexOf(name) < 0) st.rewards.push(name); }

var HEART_PX = ['0110110', '1111111', '1111111', '0111110', '0011100', '0001000'];
function heartSvg(on){ var d = ''; HEART_PX.forEach(function(r, y){ for (var x = 0; x < 7; x++) if (r[x] === '1') d += 'M' + x + ' ' + y + 'h1v1h-1z'; });
  return '<svg viewBox="0 0 7 6" shape-rendering="crispEdges"><path d="' + d + '" fill="' + (on ? '#e5483a' : '#5b6670') + '"/>' + (on ? '<path d="M1 1h1v1h-1z" fill="#ff9d8a"/>' : '') + '</svg>'; }
function hearts(st){ var mx = Math.max(livesMax(), st.lives), out = '';
  for (var i = 0; i < mx; i++) out += '<i class="pp-h' + (i < st.lives ? ' on' : '') + '">' + heartSvg(i < st.lives) + '</i>'; return out; }
function golferImg(cls){ try{ var c = S.host.golfer && S.host.golfer(); if (c && c.toDataURL) return '<img class="' + cls + '" alt="" src="' + c.toDataURL() + '">'; }catch(e){} return ''; }
function golferUrl(){ try{ var c = S.host.golfer && S.host.golfer(); if (c && c.toDataURL) return c.toDataURL(); }catch(e){} return ''; }
function balStr(){ try{ if (S.host.balance) return Number(S.host.balance()).toLocaleString(); }catch(e){} return ''; }
/* THE HEADER FLOATS OVER THE MAP, as the mockup drew it: your golfer in a gold ring, your hearts,
   the refill clock when one is running, your coins and a close button. */
function hdr(right){ var u = golferUrl(), b = balStr();
  return '<div class="pp-hdr"><i class="pp-av" style="' + (u ? 'background-image:url(' + u + ')' : '') + '"></i><span class="pp-hearts" data-hearts>' + hearts(pload()) + '</span><span class="pp-hclock" data-clock></span><span class="pp-sp"></span>' +
    (right != null ? right : (b !== '' ? '<span class="pp-cpill" data-bal>' + b + '</span>' : '')) + '<button class="pp-cx" data-x aria-label="Close">✕</button></div>'; }
// a small top view of a hole, off the flat painter, for the Daily card
var THUMBS = {};
function thumb(box, d, key){ if (!box) return; var c = THUMBS[key];
  if (c === undefined){ try{ c = THUMBS[key] = paintCourse(buildHole(d)); }catch(e){ c = THUMBS[key] = null; } }
  if (!c) return; var cv = document.createElement('canvas'); cv.width = c.width; cv.height = c.height; cv.getContext('2d').drawImage(c, 0, 0); box.appendChild(cv); }
function monthDay(dk){ var m = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][+dk.slice(5, 7) - 1]; return m + ' ' + (+dk.slice(8, 10)); }

/* ----------------------------------------------------------------------------------- the hub */
function showMenu(){ showHub(); }
function showHub(tid){
  cancelAnimationFrame(S.raf); S.screen = 'menu'; S.play = null; clearInterval(S.tick);
  var st = pload(), dk = today(), dh = dailyHole(dk), dT = THEMES[dh.theme], drec = st.daily[dk];
  // which tour the map shows: the one asked for, else the one last looked at; the Members Tour only when it is open
  if (tid) S.tour = tid; if (!S.tour) S.tour = st.view || 'main';
  if (S.tour === 'members' && !membersOpen() && !membersPreview()) S.tour = 'main';
  st.view = S.tour; psave(st);
  var TR = tourOf(S.tour), mem = !!TR.members;
  S.ov.innerHTML = '<div class="pp-hub' + (mem ? ' pp-mem' : '') + '"><div class="pp-map" data-map></div>' + hdr() +
    '<button class="pp-daily" data-daily aria-label="Daily Challenge: ' + esc(dh.name) + '">\
      <span class="pp-dtile" style="--dt:' + dT.acc + '"><span class="mo">' + monthDay(dk).split(' ')[0] + '</span><span class="dy">' + (+dk.slice(8, 10)) + '</span></span>\
      <span class="pp-dmid"><span class="pp-dk"><b>Daily Challenge</b>' + (st.streak.n > 1 ? '<i class="pp-dstreak">' + st.streak.n + ' day streak</i>' : '') + '</span>\
        <span class="t">' + esc(dh.name) + '</span>\
        <span class="m">' + (drec && drec.done ? 'You shot ' + drec.s + ' (par ' + drec.par + ')' + (drec.ms != null ? ' in ' + clockTxt(drec.ms) : '') : esc(dT.name) + ' · par ' + buildHole(dh).par + ' · timed, one try') + '</span>\
        <span class="pp-dends">' + (drec && drec.done ? 'Next hole in ' : 'Ends in ') + '<b data-dcount>' + hms(msToNextDay()) + '</b></span></span>\
      <span class="pp-dside"><span class="g">' + (drec && drec.done ? 'Result' : 'Play') + '</span><span class="rw">' + (drec && drec.done ? 'Played' : '+' + COIN_DAILY + ' coins') + '</span></span></button>' +
    '<div class="pp-wchip" data-wchip></div>' +
    '<div class="pp-tabs" role="tablist"><button data-tab="main" class="' + (mem ? '' : 'on') + '" role="tab">Putt Putt Tour</button><button data-tab="members" class="' + (mem ? 'on' : '') + '" role="tab"><i>★</i> Members' + (membersOpen() ? '' : ' <s>🔒</s>') + '</button></div>' + '</div>';
  S.ov.querySelector('[data-x]').onclick = close;
  S.ov.querySelector('[data-daily]').onclick = function(){ if (drec && drec.done) dailyResult(); else startDaily(); };
  S.ov.querySelectorAll('[data-tab]').forEach(function(b){ b.onclick = function(){ var t = b.getAttribute('data-tab'); if (t === S.tour) return;
    if (t === 'members' && !membersOpen() && !membersPreview()) return membersSheet(); showHub(t); }; });
  drawMap(st, TR);
  var clk = S.ov.querySelector('[data-clock]');
  var dc = S.ov.querySelector('[data-dcount]'), dkNow = dk;
  var tick = function(){ var s2 = pload(); clk.textContent = s2.refillAt ? hms(s2.refillAt - Date.now()) : '';
    if (today() !== dkNow) return showHub();   // a new Daily Challenge has arrived
    if (dc) dc.textContent = hms(msToNextDay());
    var h = S.ov.querySelector('[data-hearts]'); if (h) h.innerHTML = hearts(s2); };
  tick(); S.tick = setInterval(function(){ if (!S || S.screen !== 'menu') return clearInterval(S && S.tick); tick(); }, 1000);
}
/* THE MEMBERS TOUR, SHUT: what it is, what it pays, and the way in. It is the Tour Pass holder's, so
   there is nothing to buy here with coins, and the pass itself opens at launch. */
function membersSheet(){
  var TR = TOURS.members, Pm = PAY.members, tot = (TR.levels.length - 2) * Pm.hole + 2 * Pm.sig + 2 * Pm.world;
  var sh = el('<div class="pp-sheet pp-memsh"><div class="pp-card"><div class="k">★ MEMBERS TOUR · ' + esc(TR.season.toUpperCase()) + '</div><div class="t">Eighteen of the hardest holes in the game</div>\
    <div class="m">Hallows Night and Harvest Moon: the season’s own holes, every set piece at once, for Tour Pass members.</div>\
    <div class="pp-memrw"><b>' + tot.toLocaleString() + ' coins</b> to win, and rewards only members can earn:<br>' + Pm.sigReward.concat(Pm.worldReward).map(function(r){ return esc(r.replace(' (Members only)', '')); }).join(' · ') + ' · ' + esc(Pm.finish.replace(' (Members only)', '')) + '</div>\
    <button class="pt-go pp-wide pass" disabled>Get Tour Pass<small>Opens the Members Tour, and 6 lives · at launch</small></button>' +
    (S.host.tester && S.host.tester() ? '<button class="pt-bt pp-wide" data-prev>Tester preview</button>' : '') +
    '<button class="pt-bt pp-wide" data-n>Not now</button></div></div>');
  S.ov.appendChild(sh);
  sh.querySelector('[data-n]').onclick = function(){ sh.remove(); };
  var pv = sh.querySelector('[data-prev]'); if (pv) pv.onclick = function(){ S.memPreview = true; sh.remove(); showHub('members'); };
}
/* THE MAP: level 1 at the bottom, a dashed path winding up through the worlds, each world on its own
   ground. The golfer stands on the level being played and the map opens scrolled to it. */
function drawMap(st, TR){
  TR = TR || tourOf(S.tour); var tp = st.tours[TR.id], K = TR.per || PER, WS = TR.worlds;
  var box = S.ov.querySelector('[data-map]'), N = TR.levels.length, STEP = 92, PADB = 190, WH = 64, H = N * STEP + WS.length * WH + PADB + 60, W = 340;
  var pos = []; for (var n = 1; n <= N; n++){ var w = Math.floor((n - 1) / K), y = H - PADB - (n - 1) * STEP - w * WH, x = W / 2 + Math.sin((n - 1) * 0.9) * 105; pos.push([x, y]); }
  var bands = WS.map(function(Wd, w){ var T = THEMES[Wd.theme], top = pos[Math.min(N, w * K + K) - 1][1] - STEP / 2 - WH, bot = w === 0 ? H : pos[w * K][1] + STEP / 2;
    return '<div class="pp-band" data-w="' + w + '" style="top:' + top + 'px;height:' + (bot - top) + 'px;background:linear-gradient(180deg,' + T.bg2 + ',' + T.bg + ')"></div>\
      <div class="pp-wname" style="top:' + (top + 10) + 'px;color:' + (T.light ? T.ink : '#fff') + '"><b>' + (TR.members ? '★ ' : 'World ' + (w + 1) + ' · ') + esc(Wd.name) + '</b><span>' + esc(Wd.haz.join(' · ')) + '</span></div>'; }).join('');
  var d = pos.map(function(p, i){ return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
  var badges = pos.map(function(p, i){ var n = i + 1, L = TR.levels[i], best = tp.best[n], open = n <= tp.lv, cur = n === tp.lv, ace = !!tp.ace[n];
    var cls = 'pp-lv wt-' + WS[Math.min(WS.length - 1, Math.floor(i / K))].theme + (L.sig ? ' sig' : '') + (open ? '' : ' lock') + (cur ? ' cur' : '') + (best != null ? ' done' : '') + (ace ? ' ace' : '');
    return '<button class="' + cls + '" data-lv="' + n + '" style="left:' + p[0] + 'px;top:' + p[1] + 'px" aria-label="Level ' + n + (open ? '' : ', locked') + '">' +
      '<b>' + n + '</b>' + (cur ? '<span>Par ' + L.par + '</span>' : best != null ? '<span>' + (ace ? '1 ACE' : best) + '</span>' : '') + (L.sig ? '<i>★</i>' : '') + '</button>'; }).join('');
  var cp = pos[Math.min(N, tp.lv) - 1];
  /* THE MAP FILLS THE SCREEN. The world is drawn 340 wide with 200 of landscape either side, and on a
     wider screen the whole thing is scaled up until the landscape reaches both edges, so a desktop is
     the same picture larger rather than a phone's picture in a dark frame. */
  var k = Math.max(1, (box.clientWidth || 390) / (W + 380)); S.mapK = k;
  box.innerHTML = '<div class="pp-sizer" style="height:' + Math.ceil(H * k) + 'px"><div class="pp-world" style="height:' + H + 'px;width:' + W + 'px;transform:translateX(-50%) scale(' + k + ')">' + bands +
    '<svg class="pp-path" width="' + W + '" height="' + H + '"><path d="' + d + '"/></svg>' + badges +
    '<div class="pp-me" style="left:' + (cp[0] > W / 2 + 50 ? cp[0] - 76 : cp[0] + 34) + 'px;top:' + (cp[1] + 22) + 'px">' + golferImg('pp-meimg') + '</div></div></div>';
  box.querySelectorAll('[data-lv]').forEach(function(b){ b.onclick = function(){ var n = +b.getAttribute('data-lv'); if (n > pload().tours[TR.id].lv) return toastHub('Beat level ' + (n - 1) + ' under par to open it.'); startLevel(n, TR.id); }; });
  // the chip in the corner names the world in view and how much of it is beaten
  var chip = S.ov.querySelector('[data-wchip]'), lastW = -1;
  function wchip(){ if (!chip) return; var mid = (box.scrollTop + box.clientHeight * 0.55) / k, w = 0;
    for (var wi = 0; wi < WS.length; wi++) if (mid < pos[wi * K][1] + STEP / 2 + 1) w = wi;
    if (w === lastW) return; lastW = w; var hub = S.ov.querySelector('.pp-hub'); if (hub) hub.setAttribute('data-wt', WS[w].theme); var done = 0, of = Math.min(K, N - w * K); for (var q = w * K + 1; q <= w * K + of; q++) if (tp.best[q] != null) done++;
    chip.textContent = (TR.members && !membersOpen() ? 'Preview · ' : '') + (TR.members ? WS[w].name : 'World ' + (w + 1)) + ' · ' + done + ' of ' + of; }
  box.addEventListener('scroll', wchip, { passive:true });
  requestAnimationFrame(function(){ box.scrollTop = Math.max(0, cp[1] * k - box.clientHeight * 0.6); wchip(); });
  mapArt(box, pos, TR);
}
/* EACH WORLD ON THE MAP IS A PLACE OF ITS OWN THEME, painted by mapland.js the way the mockups were:
   one continuous landscape a world tall (a haunted wood with a river and a chapel, a snowed-in pine
   valley, a beach, a clubhouse lawn, a tournament park), with the trail through the badges worn into
   it. Owner's rule: a built place, never a scatter of stickers and never a hole cropped and faded.
   One cell is two CSS pixels, so the picture is drawn at exactly 2x. Painted a world a frame,
   cached for the visit. A blocked module leaves the plain colour bands. */
var MAPART = {};
function mapArt(box, pos, TR){
  var ML = window.RTT_PUTT_MAPLAND; if (!ML) return;
  var w = 0, PADX = 200, WS = TR.worlds;
  (function next(){
    if (!S || S.screen !== 'menu' || w >= WS.length || !box.isConnected) return;
    var band = box.querySelector('.pp-band[data-w="' + w + '"]');
    if (band){
      var top = parseFloat(band.style.top), bh = band.offsetHeight, bw = band.offsetWidth, cw = Math.ceil(bw / 2), ch = Math.ceil(bh / 2), key = TR.id + w + ':' + cw + 'x' + ch;
      if (MAPART[key] === undefined){
        var pts = pos.map(function(p){ return [(p[0] + PADX) / 2, (p[1] - top) / 2]; });
        var view = Math.min((box.clientWidth || 390) / (S.mapK || 1), bw), vx0 = Math.round((bw - view) / 4) + 6, vx1 = Math.round((bw + view) / 4) - 6;
        try{ MAPART[key] = ML.make(WS[w].theme, cw, ch, pts, { seed:11 + w * 17 + (TR.members ? 5 : 0), vx0:vx0, vx1:vx1 }); }catch(e){ MAPART[key] = null; }
      }
      var src = MAPART[key];
      if (src){ var cv = document.createElement('canvas'); cv.width = src.width; cv.height = src.height; cv.getContext('2d').drawImage(src, 0, 0);
        cv.className = 'pp-land'; cv.style.width = src.width * 2 + 'px'; cv.style.height = src.height * 2 + 'px'; band.style.background = 'none'; band.appendChild(cv); }
    }
    w++; setTimeout(next, 16);
  })();
}
function toastHub(msg){ var t = S.ov.querySelector('.pp-toast'); if (!t){ t = el('<div class="pp-toast"></div>'); S.ov.appendChild(t); } t.textContent = msg; t.classList.add('on'); clearTimeout(S.tt); S.tt = setTimeout(function(){ t.classList.remove('on'); }, 1800); }

/* ------------------------------------------------------------------------------ out of lives */
function outOfLives(){
  var st = pload(), sh = el('<div class="pp-sheet pp-oolf">' + hdr() + '<div class="pp-oolb"><div class="k">OUT OF LIVES</div><div class="pp-lives">' + hearts(st) + '</div>\
    <div class="lbl">Full lives in</div><div class="pp-big" data-c>' + hms((st.refillAt || Date.now()) - Date.now()) + '</div>\
    <div class="m">The clock keeps running while you are away.</div>\
    <button class="pt-go pp-wide ref" disabled>Refill lives · $0.99<small>Checkout opens at launch</small></button>\
    <button class="pt-go pp-wide pass" disabled>Get Tour Pass<small>6 lives and 3 of them right away · at launch</small></button>' +
    (S.host.tester && S.host.tester() ? '<button class="pt-bt pp-wide" data-free>Tester refill · free</button>' : '') +
    '<button class="pt-bt pp-wide" data-wait>Wait it out</button><div class="m">The Daily Hole never uses a life.</div></div></div>');
  S.ov.appendChild(sh);
  var c = sh.querySelector('[data-c]'), iv = setInterval(function(){ if (!sh.isConnected) return clearInterval(iv); var s2 = pload(); if (!s2.refillAt){ clearInterval(iv); sh.remove(); showHub(); return; } c.textContent = hms(s2.refillAt - Date.now()); }, 1000);
  sh.querySelector('[data-wait]').onclick = function(){ sh.remove(); };
  sh.querySelector('[data-x]').onclick = function(){ sh.remove(); };
  var fr = sh.querySelector('[data-free]'); if (fr) fr.onclick = function(){ var s2 = pload(); s2.lives = livesMax(); s2.refillAt = null; psave(s2); sh.remove(); showHub(); };
}

/* ---------------------------------------------------------------------------- a Tour level */
function startLevel(n, tid){
  var st = pload(); tid = tid || S.tour || 'main';
  if (tourOf(tid).members && !membersOpen() && !membersPreview()) return membersSheet();
  if (st.lives <= 0) return outOfLives();
  var d = tourDesc(n, S.host, tid);
  S.round = { mode:'ppt', lv:n, tid:tid, i:0, cards:[], holes:[d], title:levelName(n, tid) };
  playHole();
}
function startDaily(){
  var dk = today(), d = dailyHole(dk);
  S.round = { mode:'pdaily', day:dk, i:0, cards:[], holes:[d], title:d.name, kick:THEMES[d.theme].name };
  playHole();
}
// what the bar under the title says during a hole
function tourSub(R, C, P){
  if (R.mode === 'ppt'){ var left = C.par - 1 - P.strokes; return 'Hole ' + wl(R.lv, R.tid) + ' · Par ' + C.par + ' · ' + (left > 0 ? left + ' left to beat par' : 'Sink it for par'); }
  if (R.mode === 'pdaily') return R.kick + ' · Daily Hole · Par ' + C.par;
  return (C.kind === 'real' ? C.sub : (R.kick || '')) + ' · Par ' + C.par;
}
// leaving a hole: free before the first putt, a life after it on the Tour
function leaveHole(){
  var P = S.play, R = S.round;
  if (R && R.mode === 'ppt' && P && P.strokes > 0 && P.state !== 'done'){
    return confirmSheet('Leave this hole?', 'You have putted, so leaving costs a life.', 'Leave · lose a life', function(){ var st = pload(); loseLife(st); showHub(); }); }
  if (R && R.mode === 'pdaily' && P && P.strokes > 0 && P.state !== 'done'){
    return confirmSheet('Leave the Daily Hole?', 'You get one scored try a day. Leaving now scores it as a pick up.', 'Leave and score it', function(){ dailyFinish(P.C.par + 3, P.C.par, null); }); }
  showHub();
}
function restartHole(){
  var P = S.play, R = S.round;
  if (R.mode === 'ppt' && P.strokes > 0 && P.state !== 'done') return confirmSheet('Restart?', 'You have putted, so a restart costs a life.', 'Restart · lose a life', function(){ var st = pload(); loseLife(st); if (st.lives <= 0) return showHub(), outOfLives(); playHole(); });
  if (R.mode === 'pdaily' && P.strokes > 0) return toast('One scored try a day. Finish this one.');
  playHole();
}
function confirmSheet(title, body, yes, fn){
  var sh = el('<div class="pp-sheet"><div class="pp-card"><div class="t">' + esc(title) + '</div><div class="m">' + esc(body) + '</div><button class="pt-go pp-wide" data-y>' + esc(yes) + '</button><button class="pt-bt pp-wide" data-n>Keep playing</button></div></div>');
  S.ov.appendChild(sh); sh.querySelector('[data-n]').onclick = function(){ sh.remove(); }; sh.querySelector('[data-y]').onclick = function(){ sh.remove(); fn(); };
}
function popup(html, wire, kind){ var pop = el('<div class="pt-pop pp-pop' + (kind ? ' ' + kind : '') + '">' + html + '</div>'); (S.stage || S.ov).appendChild(pop); if (S.play) S.play.state = 'done';
  pop.querySelectorAll('[data-a]').forEach(function(b){ b.onclick = function(){ wire[b.getAttribute('data-a')](); }; }); return pop; }

// a Tour hole ends one of three ways
function tourOut(holed){
  var P = S.play, R = S.round, C = P.C, n = R.lv, tid = R.tid || 'main', TR = tourOf(tid), PY = PAY[TR.id], K = TR.per || PER, N = TR.levels.length;
  var s = P.strokes, par = C.par, st = pload(), tp = st.tours[TR.id];
  if (holed && s < par){
    var first = tp.best[n] == null, lines = [];
    tp.best[n] = first ? s : Math.min(tp.best[n], s);
    if (n === tp.lv && n < N) tp.lv = n + 1;
    var got = 0;
    if (!tp.paid[n]){ tp.paid[n] = 1; got += TR.levels[n - 1].sig ? PY.sig : PY.hole; }
    if (s === 1 && !tp.ace[n]){ tp.ace[n] = 1; got += PY.ace; var ac = aceCount(st); if (ACE_REWARD[ac]){ grant(st, ACE_REWARD[ac]); lines.push('New: ' + ACE_REWARD[ac]); } }
    var w = Math.floor((n - 1) / K), worldDone = TR.levels[n - 1].sig && !tp.wpaid[w];
    if (worldDone){ tp.wpaid[w] = 1; grant(st, PY.sigReward[w]); grant(st, PY.worldReward[w]); if (PY.finish && n === N) grant(st, PY.finish); }
    psave(st); if (got || worldDone) coins(got + (worldDone ? PY.world : 0), TR.name + ' ' + wl(n, tid));
    try{ S.host.sfx && S.host.sfx('holeGood'); }catch(e){}
    if (worldDone) return worldComplete(n, s, par, got, tid);
    var sec = !!P.foundSecret; if (sec){ tp.secret = tp.secret || {}; if (!tp.secret[n]){ tp.secret[n] = 1; psave(st); } }
    return popup('<div class="k">' + (sec ? 'SECRET LINE FOUND' : s === 1 ? 'HOLE IN ONE' : 'HOLE BEATEN') + '</div><div class="t">' + esc(scoreName(s, par)) + '</div>\
      <div class="pp-nums"><span><b>' + s + '</b>Strokes</span><span><b>' + par + '</b>Par</span><span><b>' + fmtPar(s - par) + '</b>To par</span></div>' +
      (got ? '<div class="pp-coins">+' + got + ' coins</div>' : '<div class="s">Coins land the first time only.</div>') + lines.map(function(t){ return '<div class="s">' + esc(t) + '</div>'; }).join('') +
      (n < N ? '<div class="s">Level ' + (n + 1) + ' is open.</div>' : '<div class="s">That is the whole ' + esc(TR.name) + '.</div>') +
      '<div class="row"><button class="pt-bt" data-a="again">Replay</button>' + (n < N ? '<button class="pt-go" data-a="next">Next hole</button>' : '<button class="pt-go" data-a="map">Map</button>') + '</div>',
      { again:function(){ startLevel(n, tid); }, next:function(){ startLevel(n + 1, tid); }, map:function(){ showHub(tid); } });
  }
  if (holed && s === par){
    return popup('<div class="k">LEVEL ' + n + '</div><div class="t">Par</div><div class="s">No life lost. You need one under to move on.</div>\
      <div class="pp-nums"><span><b>' + s + '</b>Strokes</span><span><b>' + par + '</b>Par</span></div><div class="row"><button class="pt-bt" data-a="map">Map</button><button class="pt-go" data-a="again">Go again</button></div>',
      { map:function(){ showHub(tid); }, again:function(){ startLevel(n, tid); } }, 'par');
  }
  // over par: the moment par strokes are gone with the ball still out
  loseLife(st);
  return popup('<div class="k">OUT OF STROKES</div><div class="t">Over par</div><div class="s">' + par + ' strokes used and still not down.</div>\
    <div class="pp-lives">' + hearts(st) + '</div><div class="s">' + (st.lives ? st.lives + (st.lives === 1 ? ' life' : ' lives') + ' left' : 'That was your last life.') + '</div>\
    <div class="row"><button class="pt-bt" data-a="map">Map</button><button class="pt-go" data-a="again">' + (st.lives ? 'Try again' : 'Refill') + '</button></div>',
    { map:function(){ showHub(tid); }, again:function(){ if (pload().lives > 0) startLevel(n, tid); else { showHub(tid); outOfLives(); } } }, 'over');
}
function worldComplete(n, s, par, got, tid){
  var TR = tourOf(tid), PY = PAY[TR.id], K = TR.per || PER, w = Math.floor((n - 1) / K), Wd = TR.worlds[w], nx = TR.worlds[w + 1], last = n === TR.levels.length;
  return popup('<div class="k">' + (TR.members ? '★ ' + esc(Wd.name.toUpperCase()) + ' COMPLETE' : 'WORLD ' + (w + 1) + ' COMPLETE') + '</div><div class="t">' + esc(Wd.name) + '</div><div class="s">Signature hole beaten in ' + s + ' (par ' + par + ').</div>\
    <div class="pp-reward">New · ' + esc(PY.sigReward[w]) + '<br>New · ' + esc(PY.worldReward[w]) + (PY.finish && last ? '<br>New · ' + esc(PY.finish) : '') + '</div>\
    <div class="pp-coins">+' + got + ' coins · +' + PY.world.toLocaleString() + ' ' + (TR.members ? 'members' : 'world') + ' bonus</div>' +
    (nx ? '<div class="s">' + (TR.members ? esc(nx.name) : 'World ' + (w + 2) + ', ' + esc(nx.name) + ',') + ' is open.</div>' : '<div class="s">You have finished the ' + esc(TR.name) + '.</div>') +
    '<div class="s pp-fine">Rewards are saved to your Tour record. They become wearable at launch.</div>\
    <div class="row"><button class="pt-bt" data-a="map">Map</button>' + (nx ? '<button class="pt-go" data-a="next">Next ' + (TR.members ? 'hole' : 'world') + ' ▸</button>' : '') + '</div>',
    { map:function(){ showHub(tid); }, next:function(){ startLevel(n + 1, tid); } });
}

/* ----------------------------------------------------------------------------- the Daily Hole */
/* THE DAILY HOLE IS TIMED. Everybody plays the same hole, so strokes alone put most of the field on
   one score. The clock starts on the first frame the hole is drawn (not on the first putt, or a player
   could study it for free) and stops when the ball drops. Fewer strokes still win; the time breaks the
   tie. A pick up has no time. */
function dailyMs(P){ return P.t0 ? Math.round(performance.now() - P.t0) : null; }
function clockTxt(ms){ if (ms == null) return ''; var t = Math.floor(ms / 100), m = Math.floor(t / 600), sec = Math.floor(t / 10) % 60; return m + ':' + (sec < 10 ? '0' : '') + sec + '.' + (t % 10); }
function dailyClock(P){
  if (!P.t0) P.t0 = performance.now();
  if (P.state === 'done') return;
  var el = S.clockEl && S.clockEl.isConnected ? S.clockEl : (S.clockEl = S.ov.querySelector('[data-dclock]'));
  if (!el) return; var txt = clockTxt(performance.now() - P.t0); if (el.textContent !== txt) el.textContent = txt;
}
function dailyFinish(s, par, ms){
  var st = pload(), dk = S.round.day, rec = st.daily[dk];
  if (rec && rec.done) return dailyResult();
  st.daily[dk] = { s:s, par:par, ms:ms == null ? null : ms, done:1 };
  var got = COIN_DAILY + (s < par ? COIN_DAILY_PAR : 0);
  // the streak counts days played in a row, on the game's own calendar
  var y = new Date(Date.parse(dk + 'T12:00:00Z') - 86400000).toISOString().slice(0, 10);
  st.streak.n = st.streak.last === y ? st.streak.n + 1 : (st.streak.last === dk ? st.streak.n : 1); st.streak.last = dk; st.streak.best = Math.max(st.streak.best || 0, st.streak.n);
  if (STREAK_REWARD[st.streak.n]) grant(st, STREAK_REWARD[st.streak.n]);
  psave(st); coins(got, 'Daily Hole');
  if (s < par) try{ S.host.sfx && S.host.sfx('holeGood'); }catch(e){}
  dailyResult(got);
}
function dailyResult(got){
  var st = pload(), dk = S.round && S.round.day || today(), rec = st.daily[dk], dh = dailyHole(dk), T = THEMES[dh.theme];
  if (!rec) return showHub();
  var label = rec.s >= rec.par + 3 ? 'Picked up' : scoreName(rec.s, rec.par);
  cancelAnimationFrame(S.raf); S.screen = 'card';
  S.ov.innerHTML = hdr('<span class="pp-strk">Streak ' + (st.streak.n || 1) + '</span>') + '<div class="pt-menu" style="padding-top:4px">\
    <div class="pp-dres"><div class="k">Daily Hole · ' + monthDay(dk) + '</div><div class="nm">' + esc(dh.name) + '</div><div class="m" style="opacity:.8">' + esc(T.name) + '</div><span class="th" data-th></span>\
      <div class="sc"><b>' + rec.s + '</b><span>' + (rec.s === 1 ? 'stroke' : 'strokes') + '<br>par ' + rec.par + '</span>' + (rec.ms != null ? '<b class="pp-tm">' + clockTxt(rec.ms) + '</b><span>time</span>' : '') + '</div>\
      <div class="m" style="color:#ffd9a8;font-weight:800">' + esc(label) + (rec.s < rec.par ? ' · beat par' : '') + (st.streak.best > 1 ? ' · best streak ' + st.streak.best : '') + '</div>' + (got ? '<div class="pp-coins">+' + got + ' coins</div>' : '') + '</div>\
    <div class="pt-card" style="cursor:default"><div class="k">Leaderboard</div><div class="m">Fewest strokes wins and the clock breaks a tie. The shared board needs the server ledger, which is not built yet. Your own result is saved.</div></div>\
    <button class="pt-go" data-share style="background:#12a08f;color:#fff;padding:14px">Share</button><button class="pt-bt" data-menu style="padding:13px">Map</button>\
    <div class="m" style="text-align:center;color:#a9a3c9">Played. Next Daily Hole in ' + hm(msToNextDay()) + '.</div></div>';
  setTimeout(function(){ if (S && S.screen === 'card') thumb(S.ov.querySelector('[data-th]'), dh, 'd' + dk); }, 30);
  S.ov.querySelector('[data-x]').onclick = showHub; S.ov.querySelector('[data-menu]').onclick = showHub;
  S.ov.querySelector('[data-share]').onclick = function(e){ var txt = 'Run The Tour · Putt Putt Tour Daily Hole ' + dk + '\n' + T.name + ': ' + dh.name + '\n' + label + ' (' + rec.s + ', par ' + rec.par + ')' + (rec.ms != null ? ' in ' + clockTxt(rec.ms) : '') + '\nrunthe.gg/golf';
    try{ navigator.clipboard.writeText(txt); e.currentTarget.textContent = 'Copied'; }catch(err){} };
}

/* ---------------------------------------------------------------------------------- a round */
var TOUR_FT = [5, 8, 10, 12, 15, 18, 22, 28, 36];
function startRound(mode, arg){
  var R = { mode:mode, i:0, cards:[], holes:[] };
  if (mode === 'daily'){ var d = dailyHole(today()); R.holes = [d]; R.title = d.name; R.kick = THEMES[d.theme].name + ' · Daily hole'; }
  else if (mode === 'course'){ R.holes = themedCourse(arg); R.title = THEMES[arg].name; R.theme = arg; }
  else {
    var h = S.host, c = h.courses[arg], rnd = mulberry(hstr('tour:' + arg + ':' + today()));
    var idx = []; for (var k = 0; k < c.holes.length; k++) idx.push(k);
    for (var k2 = idx.length - 1; k2 > 0; k2--){ var r = Math.floor(rnd() * (k2 + 1)), t = idx[k2]; idx[k2] = idx[r]; idx[r] = t; }
    idx = idx.slice(0, 9).sort(function(a, b){ return a - b; });
    var ft = TOUR_FT.slice(); for (var k3 = ft.length - 1; k3 > 0; k3--){ var r2 = Math.floor(rnd() * (k3 + 1)), t2 = ft[k3]; ft[k3] = ft[r2]; ft[r2] = t2; }
    R.holes = idx.map(function(hi, n){ return { real:true, courseKey:arg, hole:hi, pin:Math.floor(rnd() * 4), ft:ft[n], seed:hstr(arg + ':' + hi + ':' + today()) }; });
    R.title = c.v || arg; R.courseKey = arg;
  }
  S.round = R; playHole();
}
/* THE 3D HOLE (golf/putt/hole3d.js and land.js). A mini golf hole is drawn as a small 3D scene in the
   golfer's style, with the land of its theme built round it. It is rendered once per hole, ahead of
   time where it can be (the next hole renders while this one is played), and everything that moves is
   drawn over it through its projection. A real green stays on the flat painter. A blocked or stale
   module, or a render that throws, falls back to the flat painter, so a hole is never blank. */
function v3Ok(){ return !!(window.RTT_PUTT_3D && window.RTT_PUTT_3D.API_VERSION === 1 && window.RTT_PUTT_LAND && window.PXHD); }
function v3Asp(){ var r = S.stage && S.stage.getBoundingClientRect(); return r && r.width ? Math.round(Math.min(2.4, r.height / r.width) * 5) / 5 : 1.6; }
function v3Key(d){ return [d.tpl, d.seed, d.theme, d.extra || 0, v3Asp()].join('|'); }
function v3Get(d, C){
  if (d.real || !v3Ok()) return null; S.v3c = S.v3c || {}; var k = v3Key(d);
  // the hole being asked for is half rendered already: finish that rather than start again
  if (S.v3job && S.v3job.k === k){ var J = S.v3job, o = null; S.v3job = null; try{ while (!(o = J.step(1e9))); S.v3c[k] = o; }catch(e){ S.v3c[k] = null; } }
  if (S.v3c[k] === undefined){ try{ S.v3c[k] = window.RTT_PUTT_3D.render(C || buildFrom(d), { aspect:v3Asp() }); }catch(e){ try{ console.warn('putt 3D hole failed, drawing it flat', e); }catch(_){} S.v3c[k] = null; }
    var ks = Object.keys(S.v3c); if (ks.length > 4) delete S.v3c[ks[0]]; }
  return S.v3c[k];
}
// render the next hole while this one is played, so moving on does not wait. It is done a few
// milliseconds a frame (frame() calls v3Tick), because a whole hole at once would stall a phone
// for over a second in the middle of somebody's putt.
function v3Ahead(){
  var R = S.round; if (!R || !v3Ok()) return; var nd = R.holes[R.i + 1]; if (!nd || nd.real || (S.v3c && S.v3c[v3Key(nd)] !== undefined)) return;
  try{ S.v3job = { k:v3Key(nd), step:window.RTT_PUTT_3D.slices(buildFrom(nd), { aspect:v3Asp() }) }; }catch(e){ S.v3job = null; }
}
function v3Tick(){
  var J = S.v3job; if (!J) return;
  var P = S.play; if (P && (P.state !== 'aim' || S.held)) return;   // never while the ball rolls or a pull back is held: those are the frames that matter
  var out = null; try{ out = J.step(2.5); }catch(e){ S.v3job = null; S.v3c = S.v3c || {}; S.v3c[J.k] = null; return; }
  if (out){ S.v3job = null; S.v3c = S.v3c || {}; S.v3c[J.k] = out; var ks = Object.keys(S.v3c); if (ks.length > 4) delete S.v3c[ks[0]]; }
}

function buildHole(d){
  if (!d.real) return buildFrom(d);
  var spec = fromHost(S.host, d.courseKey, d.hole), C = buildReal(spec, { pin:d.pin }), rnd = mulberry(d.seed);
  var spot = null, ft = d.ft; while (!spot && ft > 3){ spot = spotFor(C, ft, rnd); if (!spot) ft -= 3; }
  C.tee = spot || [C.cup[0], C.cup[1] + 6]; C.par = d.par || 2; C.name = spec.name; C.sub = spec.sub;
  return C;
}
function playHole(){
  var R = S.round, d = R.holes[R.i], C = buildHole(d);
  S.screen = 'play';
  S.play = { C:C, ball:C.tee.slice(), prev:C.tee.slice(), strokes:0, state:'aim', aimAng:Math.atan2(C.cup[1] - C.tee[1], C.cup[0] - C.tee[0]),
    target:C.cup.slice(), firstFt:Math.hypot(C.cup[0] - C.tee[0], C.cup[1] - C.tee[1]), pow:0, trail:null, read:C.kind === 'real', clock0:gnow() / 1000, art:null, v3:null, cam:null, cap:R.mode === 'ppt' ? C.par : (C.kind === 'real' ? 5 : C.par + 3) };
  var cached = !d.real && v3Ok() && ((S.v3c && S.v3c[v3Key(d)]) || (S.v3job && S.v3job.k === v3Key(d) && v3Get(d, C)));
  if (cached) S.play.v3 = cached; else if (d.real || !v3Ok()) S.play.art = paintCourse(C);
  var sub = tourSub(R, C, S.play), title = R.mode === 'ppt' ? levelName(R.lv, R.tid) : R.title;
  S.ov.innerHTML = top(title, sub, '') + '<div class="pt-stage"><canvas></canvas><div class="pt-read" hidden></div></div>\
    <div class="pt-bar">' + (C.kind === 'real' ? '<button class="pt-bt" data-l aria-label="Aim left">◂</button><button class="pt-bt" data-r aria-label="Aim right">▸</button>' : '') +
    '<div class="pt-hint" data-hint></div><button class="pt-bt" data-ov hidden aria-label="See the whole hole">Overview</button><button class="pt-bt" data-restart aria-label="Restart the hole">↺</button></div>';
  if (R.mode === 'ppt'){ var tp = S.ov.querySelector('.pt-top'), u = golferUrl(); tp.classList.add('pp-play'); var bx = tp.querySelector('[data-x]'); bx.textContent = '✕'; bx.setAttribute('aria-label', 'Leave the hole');
    bx.insertAdjacentHTML('afterend', '<i class="pp-av" style="' + (u ? 'background-image:url(' + u + ')' : '') + '"></i><span class="pp-hearts">' + hearts(pload()) + '</span>'); }
  if (R.mode === 'pdaily'){ var tb = S.ov.querySelector('.pt-top'); if (tb) tb.insertAdjacentHTML('beforeend', '<span class="pp-clock" aria-label="Time"><i></i><b data-dclock>0:00.0</b></span>'); S.clockEl = null; }
  S.ov.querySelector('[data-x]').onclick = function(){ leaveHole(); };
  S.ov.querySelector('[data-restart]').onclick = function(){ restartHole(); };
  var ovb = S.ov.querySelector('[data-ov]'); ovb.onclick = function(){ if (!S.play) return; S.play.overview = !S.play.overview; ovb.classList.toggle('on', S.play.overview); S.play.camNow = null; };
  var nudge = function(s){ return function(){ aimNudge(s * 0.0035); }; };
  if (C.kind === 'real'){ holdRepeat(S.ov.querySelector('[data-l]'), nudge(-1)); holdRepeat(S.ov.querySelector('[data-r]'), nudge(1)); }
  S.cv = S.ov.querySelector('canvas'); S.stage = S.ov.querySelector('.pt-stage');
  bindInput(S.cv);
  S.onResize && window.removeEventListener('resize', S.onResize);
  S.onResize = function(){ sizeCanvas(); }; window.addEventListener('resize', S.onResize);
  sizeCanvas(); hud();
  cancelAnimationFrame(S.raf);
  var P0 = S.play;
  if (!P0.v3 && !P0.art){   // a 3D hole not rendered yet: say so for the moment it takes, then draw it
    var ctx0 = S.cv.getContext('2d'); ctx0.fillStyle = C.T.bg; ctx0.fillRect(0, 0, S.cv.width, S.cv.height);
    ctx0.fillStyle = 'rgba(255,255,255,.75)'; ctx0.font = '800 ' + Math.round(14 * S.dpr) + 'px system-ui,sans-serif'; ctx0.textAlign = 'center'; ctx0.fillText('Setting up the hole', S.cv.width / 2, S.cv.height / 2);
    setTimeout(function(){ if (!S || S.play !== P0) return; P0.v3 = v3Get(d, C); if (!P0.v3) P0.art = paintCourse(C); P0.cam = null; P0.camNow = null; S.raf = requestAnimationFrame(frame); v3Ahead(); }, 30);
    return;
  }
  S.raf = requestAnimationFrame(frame); v3Ahead();
}
function holdRepeat(btn, fn){ var t = null, iv = null;
  btn.onpointerdown = function(e){ e.preventDefault(); fn(); t = setTimeout(function(){ iv = setInterval(fn, 50); }, 300); };
  btn.onpointerup = btn.onpointerleave = btn.onpointercancel = function(){ clearTimeout(t); clearInterval(iv); }; }
function aimNudge(da){
  var P = S.play; if (!P || P.state !== 'aim') return;
  var dx = P.target[0] - P.ball[0], dy = P.target[1] - P.ball[1], r = Math.hypot(dx, dy), a = Math.atan2(dy, dx) + da;
  P.target = [P.ball[0] + Math.cos(a) * r, P.ball[1] + Math.sin(a) * r]; P.aimAng = a;
}
function sizeCanvas(){
  var r = S.stage.getBoundingClientRect(), dpr = Math.min(3, window.devicePixelRatio || 1);
  S.dpr = dpr; S.cv.width = Math.max(1, Math.round(r.width * dpr)); S.cv.height = Math.max(1, Math.round(r.height * dpr)); S.play.cam = null;
}
function hud(){
  var P = S.play, R = S.round, C = P.C, sc = S.ov.querySelector('.pt-sc');
  var tot = 0, par = 0; R.cards.forEach(function(c){ tot += c.s; par += c.p; });
  sc.innerHTML = '<b>' + P.strokes + '</b>' + (P.strokes === 1 ? 'stroke' : 'strokes');
  var sub = S.ov.querySelector('.pt-hd span'); if (sub) sub.textContent = tourSub(R, C, P);
  var hint = S.ov.querySelector('[data-hint]');
  if (hint) hint.textContent = C.kind === 'real' ? 'Drag the ring to aim. Pull back anywhere to set the pace, let go to putt.' : 'Pull back from anywhere and let go. Further back hits it harder.';
}

/* --------------------------------------------------------------------------------- the camera */
function camFor(P){
  var C = P.C, W = S.cv.width, H = S.cv.height, b = C.bounds, dpr = S.dpr;
  if (P.v3){
    // the course and a little of its land fill the stage, at a whole number of screen pixels per art pixel
    var V = P.v3, xs = C.allPts.map(function(p){ return p[0]; }), ys = C.allPts.map(function(p){ return p[1]; });
    var x0 = Math.min.apply(null, xs) - 6.5, x1 = Math.max.apply(null, xs) + 6.5, y0 = Math.min.apply(null, ys) - 5, y1 = Math.max.apply(null, ys) + 3, zc = 0.35;   // room for the land round it, which is half the point
    var a0 = V.pr(x0, y0, zc + 1.2), a1 = V.pr(x1, y1, zc);
    var fitK = Math.max(1, Math.floor(Math.min(W / (a1[0] - a0[0]), H / (a1[1] - a0[1])))), widK = Math.max(1, Math.floor(W / (a1[0] - a0[0])));
    /* A HOLE TALLER THAN THE SCREEN IS FOLLOWED. It opens on the whole hole for a moment, so the route is
       read, then the camera comes in to fill the width and rides with the ball. Overview puts it back. */
    var follow = widK > fitK && (a1[1] - a0[1]) * widK > H * 1.08 && !P.overview && !(P.intro3 && performance.now() - P.intro3 < 1800);
    var kk = follow ? Math.min(widK, Math.max(fitK + 1, Math.floor(fitK * 2.2))) : fitK;
    var cxA = (a0[0] + a1[0]) / 2, cyA = (a0[1] + a1[1]) / 2, ox = Math.round(W / 2 - cxA * kk), oy = Math.round(H / 2 - cyA * kk), iw = V.cv.width * kk, ih = V.cv.height * kk;
    if (follow && P.view){ var vp = V.pr(P.view[0], P.view[1], V.zAt(P.view[0], P.view[1]) + (P.view[2] || 0)); ox = Math.round(W / 2 - vp[0] * kk); oy = Math.round(H * 0.58 - vp[1] * kk); }
    ox = iw >= W ? clamp(ox, W - iw, 0) : Math.round((W - iw) / 2); oy = ih >= H ? clamp(oy, H - ih, 0) : Math.round((H - ih) / 2);
    return { v3:V, k:kk, ox:ox, oy:oy, s:kk / ART, follow:follow, canFollow:widK > fitK && (a1[1] - a0[1]) * widK > H * 1.08 };
  }
  if (C.kind !== 'real'){
    var s = Math.min(W / (b[2] - b[0] - 4), H / (b[3] - b[1] - 4));
    var k = Math.max(1, Math.floor(s * ART)); s = k / ART;
    return { s:s, cx:(b[0] + b[2]) / 2, cy:(b[1] + b[3]) / 2 };
  }
  var bx = P.ball[0], by = P.ball[1], cx = C.cup[0], cy = C.cup[1];
  var span = Math.max(Math.abs(bx - cx) + 14, (Math.abs(by - cy) + 16) * W / H);
  var s2 = W / span, sMin = Math.min(W / (C.spec.rx * 2.6), H / (C.spec.ry * 2.6)), sMax = 20 * dpr;
  s2 = clamp(s2, sMin, sMax); var k2 = Math.max(1, Math.round(s2 * ART)); s2 = k2 / ART;
  return { s:s2, cx:(bx + cx) / 2, cy:(by + cy) / 2 };
}
function w2s(c, x, y, z){
  if (c.v3){ var p = c.v3.pr(x, y, z == null ? c.v3.zAt(x, y) : z); return [c.ox + p[0] * c.k, c.oy + p[1] * c.k]; }
  return [S.cv.width / 2 + (x - c.cx) * c.s, S.cv.height / 2 + (y - c.cy) * c.s]; }
function s2w(c, X, Y){
  if (c.v3){ var w = c.v3.un((X - c.ox) / c.k, (Y - c.oy) / c.k, 0.35); return c.v3.un((X - c.ox) / c.k, (Y - c.oy) / c.k, c.v3.zAt(w[0], w[1])); }
  return [c.cx + (X - S.cv.width / 2) / c.s, c.cy + (Y - S.cv.height / 2) / c.s]; }
// a screen direction as a direction on the hole: the 3D camera looks down at an angle, so up the screen is further than it looks
function scrDir(c, dx, dy){ return c && c.v3 ? Math.atan2(dy / c.v3.se, dx) : Math.atan2(dy, dx); }

/* ---------------------------------------------------------------------------------- the input */
function bindInput(cv){
  var drag = null;
  cv.onpointerdown = function(e){
    var P = S.play; if (!P || P.state !== 'aim') return; cv.setPointerCapture(e.pointerId); S.held = true;
    var X = e.offsetX * S.dpr, Y = e.offsetY * S.dpr, c = P.camNow || camFor(P);
    if (P.C.kind === 'real'){
      var t = w2s(c, P.target[0], P.target[1]);
      if (Math.hypot(X - t[0], Y - t[1]) < 34 * S.dpr){ drag = { k:'aim', dx:t[0] - X, dy:t[1] - Y }; return; }
    }
    drag = { k:'pow', x0:X, y0:Y }; P.pow = 0;
  };
  cv.onpointermove = function(e){
    var P = S.play; if (!drag || !P) return;
    var X = e.offsetX * S.dpr, Y = e.offsetY * S.dpr, c = P.camNow || camFor(P);
    if (drag.k === 'aim'){ var w = s2w(c, X + drag.dx, Y + drag.dy); P.target = w; P.aimAng = Math.atan2(w[1] - P.ball[1], w[0] - P.ball[0]); return; }
    var dx = drag.x0 - X, dy = drag.y0 - Y, L = Math.hypot(dx, dy), maxL = Math.min(S.cv.height * 0.42, 300 * S.dpr);
    P.pow = clamp(L / maxL, 0, 1);
    if (P.C.kind !== 'real' && L > 6 * S.dpr) P.aimAng = scrDir(c, dx, dy);
  };
  cv.onpointerup = cv.onpointercancel = function(e){
    var P = S.play, d = drag; drag = null; S.held = false; if (!P || !d) return;
    if (d.k === 'pow' && P.pow > 0.02 && e.type === 'pointerup') strike(); else P.pow = 0;
  };
}
function onKey(e){
  if (!S) return;
  if (e.key === 'Escape'){ e.preventDefault(); if (S.ov.querySelector('.pp-sheet')){ S.ov.querySelector('.pp-sheet').remove(); return; } if (S.screen === 'menu') close(); else if (S.screen === 'play') leaveHole(); else showHub(); return; }
  var P = S.play; if (!P || P.state !== 'aim') return;
  var fine = e.shiftKey ? 0.2 : 1;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight'){ e.preventDefault(); var s = e.key === 'ArrowLeft' ? -1 : 1;
    if (P.C.kind === 'real') aimNudge(s * 0.0035 * fine * 2); else P.aimAng += s * 0.012 * fine; }
  else if (e.key === 'ArrowUp' || e.key === 'ArrowDown'){ e.preventDefault(); P.pow = clamp(P.pow + (e.key === 'ArrowUp' ? 1 : -1) * 0.01 * fine, 0, 1); }
  else if ((e.key === ' ' || e.key === 'Enter') && P.pow > 0.02){ e.preventDefault(); strike(); }
}
/* THE GAME RUNS A LITTLE FASTER THAN LIFE. The physics is real feet and real seconds, so a 20 ft putt
   takes as long to watch as it would on a green, which felt slow on a phone. The whole course clock (the
   ball's playback and every moving piece with it) runs at PLAY_RATE, so the ball rolls faster without one
   number in the physics changing: the solver, the pars and every replay stay exactly as they were. */
var PLAY_RATE = 1.45;
function gnow(){ return performance.now() * PLAY_RATE; }
function maxFt(C){ return C.kind === 'real' ? 60 : 42; }
function strike(){
  var P = S.play, C = P.C, ft = P.pow * maxFt(C), v = speedFor(C, ft), a = C.kind === 'real' ? Math.atan2(P.target[1] - P.ball[1], P.target[0] - P.ball[0]) : P.aimAng;
  var t0 = gnow() / 1000 - P.clock0;
  P.shot = simulate(C, P.ball[0], P.ball[1], Math.cos(a) * v, Math.sin(a) * v, t0);
  if (onSecret(C, P.shot)) P.foundSecret = true;
  P.shotStart = gnow(); P.shotAng = a; P.strokes++; P.state = 'roll'; P.pow = 0; P.evI = 0; P.prev = P.ball.slice(); P.lastFt = ft;
  P.trail = P.shot.pts; hud();
}
// did this putt go through the hole's secret line (see secret())
function onSecret(C, r){ var Z = C.secret || []; if (!Z.length || !r || !r.pts) return false;
  return r.pts.some(function(p){ return Z.some(function(z){ return p[0] >= z.x0 && p[0] <= z.x1 && p[1] >= z.y0 && p[1] <= z.y1; }); }); }
function sound(k){ var h = S.host;
  try{ if (k === 'cup'){ h.sfx && h.sfx('hole'); h.buzz && h.buzz([12, 40, 18]); } else if (k === 'wall'){ h.buzz && h.buzz(6); } else if (k === 'water'){ h.buzz && h.buzz([30, 30, 30]); } }catch(e){} }

/* ------------------------------------------------------------------------------- each frame */
function frame(){
  if (!S || S.screen !== 'play') return;
  S.raf = requestAnimationFrame(frame);
  var P = S.play, C = P.C, ctx = S.cv.getContext('2d'), W = S.cv.width, H = S.cv.height, now = gnow() / 1000, clock = now - P.clock0;
  v3Tick();
  if (S.round.mode === 'pdaily') dailyClock(P);
  // where the ball is: at rest, or partway along the putt it is playing back
  var bx = P.ball[0], by = P.ball[1], falling = 0, bz = 0, hidden = false;
  if (P.state === 'roll'){
    var el2 = (gnow() - P.shotStart) / 1000, pts = P.shot.pts, i = 0;
    while (i < pts.length - 1 && pts[i + 1][2] <= el2) i++;
    var a = pts[i], b = pts[Math.min(pts.length - 1, i + 1)], f = b[2] > a[2] ? clamp((el2 - a[2]) / (b[2] - a[2]), 0, 1) : 1;
    if (b[3]) f = 0;
    bx = a[0] + (b[0] - a[0]) * f; by = a[1] + (b[1] - a[1]) * f; bz = (a[4] || 0) + ((b[4] || 0) - (a[4] || 0)) * f; hidden = a[3] === 2 && el2 < b[2];
    while (P.evI < P.shot.ev.length && P.shot.ev[P.evI][0] <= el2){ sound(P.shot.ev[P.evI][1]); P.evI++; }
    if (P.shot.holed && el2 > P.shot.t) falling = clamp((el2 - P.shot.t) / 0.25, 0, 1);
    if (el2 > P.shot.t + (P.shot.holed ? 0.3 : 0.15)) settle();
  }
  // the camera eases toward its target rather than jumping
  /* A real green opens on the WHOLE green, its shape and its bunkers, the way the hole view shows it,
     and then settles in on the putt: the flyover a broadcast does before a player stands over it. */
  P.view = [bx, by, bz]; var tgt = camFor(P);
  if (!P.camNow && C.kind === 'real'){ var bb = C.bounds, sw = Math.min(S.cv.width / (C.spec.rx * 2.5), S.cv.height / (C.spec.ry * 2.5));
    P.camNow = { s:sw, cx:0, cy:0 }; P.intro = performance.now(); }
  if (!P.intro3) P.intro3 = performance.now();
  if (tgt.follow && P.camNow && P.camNow.v3 && P.camNow.k === tgt.k){ var ez = P.state === 'roll' ? 0.2 : 0.14; P.camNow = { v3:tgt.v3, k:tgt.k, s:tgt.s, follow:true, canFollow:true, ox:Math.round(P.camNow.ox + (tgt.ox - P.camNow.ox) * ez), oy:Math.round(P.camNow.oy + (tgt.oy - P.camNow.oy) * ez) }; }
  else if (!P.camNow || C.kind !== 'real') P.camNow = tgt;   // a mini hole holds still: the whole hole is the shot
  else if (P.state === 'aim'){ var c0 = P.camNow, e = (P.intro && performance.now() - P.intro < 1500) ? (performance.now() - P.intro < 700 ? 0 : 0.05) : 0.16; P.camNow = { s:c0.s + (tgt.s - c0.s) * e, cx:c0.cx + (tgt.cx - c0.cx) * e, cy:c0.cy + (tgt.cy - c0.cy) * e };
    if (Math.abs(P.camNow.s - tgt.s) < 0.02) P.camNow.s = tgt.s; }
  var cam = P.camNow;
  if (cam.canFollow && !P.ovShown){ P.ovShown = true; var ob = S.ov.querySelector('[data-ov]'); if (ob) ob.hidden = false; }
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false;
  var bg = C.kind === 'real' ? ((C.biome && C.biome.base) || '#5f8a30') : C.T.bg; ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  if (cam.v3) ctx.drawImage(cam.v3.cv, cam.ox, cam.oy, cam.v3.cv.width * cam.k, cam.v3.cv.height * cam.k);
  else { var o = w2s(cam, C.bounds[0], C.bounds[1]), k = cam.s * ART;
    ctx.drawImage(P.art, Math.round(o[0]), Math.round(o[1]), Math.round(P.art.width * k), Math.round(P.art.height * k)); }
  if (C.movers.length) (cam.v3 ? drawMovers3 : drawMovers)(ctx, C, cam, clock);
  if (cam.v3 && cam.v3.mill) drawSails(ctx, C, cam, clock);
  drawPieces(ctx, C, cam, clock);
  drawRead(ctx, C, cam, performance.now() / 1000);
  drawCup(ctx, C, cam, Math.hypot(bx - C.cup[0], by - C.cup[1]));
  if (P.trail && P.state === 'aim') drawTrail(ctx, cam, P.trail);
  if (P.state === 'aim') drawAim(ctx, P, cam);
  // the golfer stands at the ball while aiming, and holds the follow through a moment once it is struck
  if ((P.state === 'aim' && !(P.intro && performance.now() - P.intro < 1300)) || (P.state === 'roll' && (gnow() - P.shotStart) / PLAY_RATE < 900)) drawGolfer(ctx, P, cam);
  if (!hidden) drawBall(ctx, cam, bx, by, falling, bz);
  readChip(P, bx, by);
}
function settle(){
  var P = S.play, sh = P.shot, C = P.C;
  if (sh.water || sh.out){ P.strokes++; P.ball = P.prev.slice(); toast(sh.water ? ((C.T && C.T.hazName) || 'Water') + '. One stroke, and it goes back.' : 'Out. One stroke, and it goes back.'); }
  else P.ball = sh.rest.slice();
  P.state = 'aim'; P.shot = null;
  if (sh.holed){ return holeOut(); }
  if (S.round.mode === 'ppt' && P.strokes >= C.par){ P.state = 'done'; return tourOut(false); }
  if (P.strokes >= P.cap){ return holeOut(true); }
  P.target = C.cup.slice(); P.aimAng = Math.atan2(C.cup[1] - P.ball[1], C.cup[0] - P.ball[0]);
  hud();
}
var toastT = 0;
function toast(msg){ var r = S.ov.querySelector('.pt-read'); if (!r) return; r.hidden = false; r.innerHTML = esc(msg); r.dataset.toast = '1'; clearTimeout(toastT); toastT = setTimeout(function(){ if (r) r.dataset.toast = ''; }, 1800); }
function readChip(P, bx, by){
  var r = S.ov.querySelector('.pt-read'); if (!r || r.dataset.toast === '1') return;
  var C = P.C;
  if (P.state !== 'aim'){ r.hidden = true; return; }
  var ft = Math.hypot(C.cup[0] - bx, C.cup[1] - by), dh = (C.field.h(C.cup[0], C.cup[1]) - C.field.h(bx, by)) * 12;
  var g = Math.hypot(C.field.gx(bx, by), C.field.gy(bx, by)) * 100;
  var pw = P.pow > 0 ? ' · pace ' + Math.round(P.pow * maxFt(C)) + ' ft' : '';
  var main = (ft < 1 ? Math.round(ft * 12) + ' in' : Math.round(ft) + ' ft') + pw;
  var sub = Math.abs(dh) < 0.6 ? 'Level' : (Math.abs(dh) >= 12 ? (Math.abs(dh) / 12).toFixed(1) + ' ft ' : Math.round(Math.abs(dh)) + ' in ') + (dh > 0 ? 'uphill' : 'downhill');
  if (C.kind === 'real') sub += ' · ' + g.toFixed(1) + '% at the ball · stimp ' + C.stimp.toFixed(1);
  var html = esc(main) + '<span>' + esc(sub) + '</span>';
  if (r.innerHTML !== html) r.innerHTML = html; r.hidden = false;
}

/* drawing ---------------------------------------------------------------------------------- */
function drawMovers(ctx, C, cam, t){
  var T = C.T;
  C.movers.forEach(function(m){
    var segs = moverAt(m, t), w = Math.max(m.w * cam.s, 3);
    segs.forEach(function(s){
      var a = w2s(cam, s[0], s[1]), b = w2s(cam, s[2], s[3]);
      ctx.lineCap = m.k === 'spin' ? 'butt' : 'round';
      ctx.strokeStyle = T.ink; ctx.lineWidth = w + Math.max(2, cam.s * 0.08); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      ctx.strokeStyle = m.k === 'spin' ? T.spinner : T.wall; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      if (m.k === 'slide'){ ctx.strokeStyle = T.wallHi; ctx.lineWidth = Math.max(1, w * 0.3); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
    });
    if (m.k === 'spin'){ var c = w2s(cam, m.x, m.y); ctx.fillStyle = T.ink; ctx.beginPath(); ctx.arc(c[0], c[1], m.hub * cam.s + 2, 0, 6.29); ctx.fill();
      ctx.fillStyle = T.wallHi; ctx.beginPath(); ctx.arc(c[0], c[1], m.hub * cam.s, 0, 6.29); ctx.fill(); }
  });
}
// in 3D a paddle or a slider is a bar with a top and a front face, standing on the carpet
function bar3(ctx, cam, s, w, h, top, side, ink){
  var za = cam.v3.zAt(s[0], s[1]), zb = cam.v3.zAt(s[2], s[3]), a0 = w2s(cam, s[0], s[1], za), b0 = w2s(cam, s[2], s[3], zb), a1 = w2s(cam, s[0], s[1], za + h), b1 = w2s(cam, s[2], s[3], zb + h);
  ctx.fillStyle = side; ctx.beginPath(); ctx.moveTo(a0[0], a0[1] + w * 0.25); ctx.lineTo(b0[0], b0[1] + w * 0.25); ctx.lineTo(b1[0], b1[1]); ctx.lineTo(a1[0], a1[1]); ctx.closePath(); ctx.fill();
  ctx.lineCap = 'round'; ctx.strokeStyle = ink; ctx.lineWidth = w + Math.max(2, w * 0.25); ctx.beginPath(); ctx.moveTo(a1[0], a1[1]); ctx.lineTo(b1[0], b1[1]); ctx.stroke();
  ctx.strokeStyle = top; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(a1[0], a1[1]); ctx.lineTo(b1[0], b1[1]); ctx.stroke();
}
function drawMovers3(ctx, C, cam, t){
  var T = C.T;
  C.movers.forEach(function(m){
    if (m.k === 'blade') return;   // the sails drawn on the windmill are this blocker
    var segs = moverAt(m, t), w = Math.max(m.w * cam.s, 3), h = m.k === 'spin' ? 0.45 : 0.6;
    segs.sort(function(a, b){ return (a[1] + a[3]) - (b[1] + b[3]); });   // the far blade first
    segs.forEach(function(s){ bar3(ctx, cam, s, w, h, m.k === 'spin' ? T.spinner : T.wall, m.k === 'spin' ? '#3a2a1a' : T.wallLo, T.ink); });
    if (m.k === 'spin'){ var z = cam.v3.zAt(m.x, m.y), c = w2s(cam, m.x, m.y, z + h + 0.05); ctx.fillStyle = T.ink; ctx.beginPath(); ctx.arc(c[0], c[1], m.hub * cam.s + 2, 0, 6.29); ctx.fill();
      ctx.fillStyle = T.wallHi; ctx.beginPath(); ctx.arc(c[0], c[1], m.hub * cam.s, 0, 6.29); ctx.fill(); }
  });
}
// the windmill's sails turn with its paddles, on the face of the tower
function drawSails(ctx, C, cam, t){
  var M3 = cam.v3.mill, sp = null; C.movers.forEach(function(m){ if (m.k === 'blade' && !sp) sp = m; });
  var th = sp ? sp.phase + sp.omega * t : t * 0.7, T = C.T, SW = M3.w || 0.85;
  for (var a = 0; a < 4; a++){
    var ang = th + a * Math.PI / 2, ca = Math.cos(ang), sa = Math.sin(ang), pts = [[0.35, -0.08], [M3.r, -0.08], [M3.r, SW], [0.35, SW]].map(function(q){
      return w2s(cam, M3.x + ca * q[0] - sa * q[1], M3.y, M3.z + sa * q[0] + ca * q[1]); });
    ctx.fillStyle = '#efe6cf'; ctx.strokeStyle = '#4a2c14'; ctx.lineWidth = Math.max(1.5, cam.s * 0.07);
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (var i = 1; i < 4; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); ctx.fill(); ctx.stroke();
    var e = w2s(cam, M3.x + ca * M3.r, M3.y, M3.z + sa * M3.r), o = w2s(cam, M3.x, M3.y, M3.z);
    ctx.lineWidth = Math.max(2, cam.s * 0.12); ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(e[0], e[1]); ctx.stroke();
  }
  var hb = w2s(cam, M3.x, M3.y, M3.z); ctx.fillStyle = T.ink; ctx.beginPath(); ctx.arc(hb[0], hb[1], Math.max(3, cam.s * 0.32), 0, 6.29); ctx.fill();
}
/* THE READ IS ALWAYS ON THE GREEN, AND IT MOVES. Each cell of the green carries one soft chevron that
   drifts downhill along the fall line, so the green reads the way water would run off it. How steep
   it is shows as how FAST the chevrons drift, never as a colour: they are all the same pale ink, light
   enough to sit on the carpet rather than over it. A flat cell carries nothing. Each chevron fades in
   and out over its own loop, from a phase off its cell, so the field never pulses in step. */
/* THE MOVING PARTS OF THE SET PIECES, drawn every frame over the hole through the same projection as
   the ball: a river's current, a drawbridge's deck, a turntable's spin. In the flat picture a loop and a
   ramp are drawn here too; in 3D they are part of the scene hole3d.js built. */
function drawPieces(ctx, C, cam, clock){
  var d = S.dpr;
  C.rivers.forEach(function(r){
    // streaks riding the current, spaced along the channel and moving at its speed
    var sp = 1.1, ph = (clock * r.vc) % sp; ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = Math.max(1.5, cam.s * 0.08); ctx.lineCap = 'round';
    for (var lane = -1; lane <= 1; lane++){ var lo = lane * r.w * 0.25;
      for (var sv = ph + (lane & 1) * 0.5; sv < r.L; sv += sp){ var g = null; for (var k = 0; k < r.segs.length; k++){ if (sv >= r.segs[k].s0 && sv <= r.segs[k].s0 + r.segs[k].l){ g = r.segs[k]; break; } } if (!g) continue;
        var u = sv - g.s0, x0 = g.ax + g.tx * u - g.ty * lo, y0 = g.ay + g.ty * u + g.tx * lo, a = w2s(cam, x0, y0), b = w2s(cam, x0 + g.tx * 0.35, y0 + g.ty * 0.35);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); } } });
  C.turns.forEach(function(u){
    var pts = [], th = clock * u.omega; for (var a = 0; a <= 32; a++){ var ang = a / 32 * 2 * Math.PI; pts.push(w2s(cam, u.x + Math.cos(ang) * u.r, u.y + Math.sin(ang) * u.r)); }
    ctx.fillStyle = 'rgba(20,24,30,.55)'; ctx.beginPath(); pts.forEach(function(p, i){ i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }); ctx.fill();
    for (var q = 0; q < 8; q++){ var a0 = th + q * Math.PI / 4, a1 = a0 + Math.PI / 8, c0 = w2s(cam, u.x, u.y), p0 = w2s(cam, u.x + Math.cos(a0) * u.r, u.y + Math.sin(a0) * u.r), p1 = w2s(cam, u.x + Math.cos(a1) * u.r, u.y + Math.sin(a1) * u.r);
      ctx.fillStyle = q % 2 ? (C.T.wallHi || '#ffd36a') : (C.T.wall || '#e5483a'); ctx.globalAlpha = 0.75; ctx.beginPath(); ctx.moveTo(c0[0], c0[1]); ctx.lineTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.closePath(); ctx.fill(); }
    ctx.globalAlpha = 1; var cc = w2s(cam, u.x, u.y); ctx.fillStyle = '#f5f0e0'; ctx.beginPath(); ctx.arc(cc[0], cc[1], Math.max(3 * d, cam.s * 0.25), 0, 6.29); ctx.fill(); });
  C.bridges.forEach(function(b){
    var lift = bridgeLift(b, clock), z0 = cam.v3 ? cam.v3.zAt((b.x0 + b.x1) / 2, b.y0 - 0.6) : 0, ang = lift * Math.PI / 2;
    // the deck swings up about its hinge edge
    var hn = b.hinge === 's', hy = hn ? b.y1 : b.y0, Ld = b.y1 - b.y0, yy = function(f){ return hy + (hn ? -1 : 1) * Ld * f * Math.cos(ang); }, zz = function(f){ return z0 + Ld * f * Math.sin(ang); };
    var c = [w2s(cam, b.x0, yy(0), zz(0)), w2s(cam, b.x1, yy(0), zz(0)), w2s(cam, b.x1, yy(1), zz(1)), w2s(cam, b.x0, yy(1), zz(1))];
    if (!cam.v3){ var k = 1 - lift; c = [w2s(cam, b.x0, hy), w2s(cam, b.x1, hy), w2s(cam, b.x1, hy + (hn ? -1 : 1) * Ld * k), w2s(cam, b.x0, hy + (hn ? -1 : 1) * Ld * k)]; }
    ctx.fillStyle = '#8a6a44'; ctx.strokeStyle = '#3b2a18'; ctx.lineWidth = Math.max(1.5, d * 1.2);
    ctx.beginPath(); ctx.moveTo(c[0][0], c[0][1]); for (var q = 1; q < 4; q++) ctx.lineTo(c[q][0], c[q][1]); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(59,42,24,.6)'; for (var pl = 1; pl < 5; pl++){ var f = pl / 5, a = [c[0][0] + (c[3][0] - c[0][0]) * f, c[0][1] + (c[3][1] - c[0][1]) * f], e = [c[1][0] + (c[2][0] - c[1][0]) * f, c[1][1] + (c[2][1] - c[1][1]) * f];
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(e[0], e[1]); ctx.stroke(); } });
  if (!cam.v3){
    C.ramps.forEach(function(rp){ var hw = rp.w / 2, sx = -rp.dy, sy = rp.dx, L = rp.len, q = [[rp.x + sx * hw, rp.y + sy * hw], [rp.x - sx * hw, rp.y - sy * hw], [rp.x - sx * hw - rp.dx * L, rp.y - sy * hw - rp.dy * L], [rp.x + sx * hw - rp.dx * L, rp.y + sy * hw - rp.dy * L]].map(function(p){ return w2s(cam, p[0], p[1]); });
      ctx.fillStyle = C.T.wallHi; ctx.beginPath(); q.forEach(function(p, i){ i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }); ctx.closePath(); ctx.fill(); });
    C.loops.forEach(function(lp){ var r = lp.r, a = w2s(cam, lp.x - lp.dx * r, lp.y - lp.dy * r), b = w2s(cam, lp.x + lp.dx * r, lp.y + lp.dy * r);
      ctx.strokeStyle = C.T.wall; ctx.lineWidth = Math.max(4, cam.s * 0.5); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); });
  }
}
function drawRead(ctx, C, cam, t){
  var step = C.kind === 'real' ? 3 : 2, b = C.bounds, s = cam.s, lw = Math.max(1.2, s * 0.07);
  ctx.strokeStyle = 'rgb(255,255,255)'; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (var y = b[1] + step / 2; y < b[3]; y += step) for (var x = b[0] + step / 2; x < b[2]; x += step){
    var m = C.mats.at(x, y); if (m !== M.GREEN && m !== M.FRINGE) continue;
    var gx = C.field.gx(x, y), gy = C.field.gy(x, y), g = Math.hypot(gx, gy); if (g < 0.003) continue;
    var p = w2s(cam, x, y); if (p[0] < -20 || p[1] < -20 || p[0] > S.cv.width + 20 || p[1] > S.cv.height + 20) continue;
    var wx = -gx / g, wy = -gy / g, spd = clamp(g * 30, 0.12, 1.8), ph = (t * spd + hash3(Math.round(x * 4), Math.round(y * 4), 21)) % 1;
    var off = (ph - 0.5) * step * 0.8, cx = x + wx * off, cy = y + wy * off;
    if (C.mats.at(cx, cy) !== m && C.mats.at(cx, cy) !== M.GREEN) continue;
    var hs = step * 0.17, tip = w2s(cam, cx + wx * hs, cy + wy * hs), l = w2s(cam, cx - wx * hs - wy * hs, cy - wy * hs + wx * hs), r = w2s(cam, cx - wx * hs + wy * hs, cy - wy * hs - wx * hs);
    ctx.globalAlpha = 0.34 * Math.sin(ph * Math.PI);
    ctx.beginPath(); ctx.moveTo(l[0], l[1]); ctx.lineTo(tip[0], tip[1]); ctx.lineTo(r[0], r[1]); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
function drawCup(ctx, C, cam, dBall){
  var p = w2s(cam, C.cup[0], C.cup[1]), r = Math.max(C.cupR * cam.s, 5.5 * S.dpr), sq = cam.v3 ? cam.v3.se : 0.92;
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(p[0], p[1] + r * 0.12, r * 1.18, r * (sq + 0.13), 0, 0, 6.29); ctx.fill();
  ctx.fillStyle = '#0d0f0c'; ctx.beginPath(); ctx.ellipse(p[0], p[1], r, r * sq, 0, 0, 6.29); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = Math.max(1, S.dpr); ctx.stroke();
  // the flag comes out once the ball is close, the way it is tended on tour
  var a = clamp((dBall - 4) / 6, 0, 1); if (a <= 0) return;
  var hgt = 34 * S.dpr, col = C.kind === 'real' ? '#F1D04A' : (C.T.flag || '#ffffff');
  ctx.globalAlpha = a;
  ctx.strokeStyle = '#f5f5f0'; ctx.lineWidth = 2 * S.dpr; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0], p[1] - hgt); ctx.stroke();
  ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(p[0], p[1] - hgt); ctx.lineTo(p[0] + 15 * S.dpr, p[1] - hgt + 5 * S.dpr); ctx.lineTo(p[0], p[1] - hgt + 10 * S.dpr); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
}
function drawBall(ctx, cam, x, y, fall, bz){
  var p = w2s(cam, x, y), r = Math.max(BALL_R * cam.s, 3.6 * S.dpr) * (1 - fall * 0.55);
  if (fall >= 1) return;
  if (cam.v3){   // in 3D the ball sits ON the carpet: its shadow on the ground, the ball a radius up (and higher in a loop or a jump)
    var V = cam.v3, zb = V.zAt(x, y) + (bz || 0), behind = V.hid && V.hid(x, y, zb + BALL_R * 2) && V.hid(x, y, zb + BALL_R);
    if (!behind) ctx.fillStyle = 'rgba(0,0,0,' + (bz ? 0.18 : 0.32) + ')', ctx.beginPath(), ctx.ellipse(p[0] + r * 0.3, p[1] + r * 0.1, r * 1.05, r * 0.6, 0, 0, 6.29), ctx.fill();
    if (bz){ p = w2s(cam, x, y, cam.v3.zAt(x, y) + bz); }
    p = [p[0], p[1] - r * cam.v3.ce * (1 - fall)];
    /* BEHIND SOMETHING, THE BALL IS BEHIND IT. Painted over everything, a ball behind a block or the
       windmill house looked like it was sitting on top of it. Hidden, it is drawn as a faint outline
       through whatever is in front, so it can still be found. */
    if (behind){
      ctx.save(); ctx.globalAlpha = 0.55; ctx.setLineDash([Math.max(2, r * 0.6), Math.max(2, r * 0.45)]);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1.5, S.dpr * 1.2); ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 6.29); ctx.stroke(); ctx.restore(); return; }
  } else { ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.arc(p[0] + r * 0.35, p[1] + r * 0.4, r, 0, 6.29); ctx.fill(); if (bz) p = [p[0], p[1] - bz * cam.s * 0.8]; }
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 6.29); ctx.fill();
  ctx.strokeStyle = 'rgba(30,40,30,.55)'; ctx.lineWidth = Math.max(1, S.dpr * 0.8); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.arc(p[0] - r * 0.3, p[1] - r * 0.3, r * 0.3, 0, 6.29); ctx.fill();
}
function drawTrail(ctx, cam, pts){
  ctx.fillStyle = 'rgba(255,255,255,.28)';
  for (var i = 0; i < pts.length; i += 4){ var p = w2s(cam, pts[i][0], pts[i][1]); ctx.fillRect(p[0] - S.dpr, p[1] - S.dpr, 2 * S.dpr, 2 * S.dpr); }
}
function drawAim(ctx, P, cam){
  var C = P.C, b = w2s(cam, P.ball[0], P.ball[1]), d = S.dpr;
  if (C.kind === 'real'){
    var t = w2s(cam, P.target[0], P.target[1]);
    ctx.setLineDash([5 * d, 5 * d]); ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1.6 * d;
    ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(t[0], t[1]); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = '#F1D04A'; ctx.lineWidth = 2.4 * d; ctx.beginPath(); ctx.arc(t[0], t[1], 11 * d, 0, 6.29); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(t[0] - 16 * d, t[1]); ctx.lineTo(t[0] - 6 * d, t[1]); ctx.moveTo(t[0] + 6 * d, t[1]); ctx.lineTo(t[0] + 16 * d, t[1]);
    ctx.moveTo(t[0], t[1] - 16 * d); ctx.lineTo(t[0], t[1] - 6 * d); ctx.moveTo(t[0], t[1] + 6 * d); ctx.lineTo(t[0], t[1] + 16 * d); ctx.stroke();
  } else {
    var Lw = 2 + P.pow * 12, ux = Math.cos(P.aimAng), uy = Math.sin(P.aimAng);
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    for (var s = 10 * d; s < Lw * cam.s; s += 9 * d){ var q = w2s(cam, P.ball[0] + ux * s / cam.s, P.ball[1] + uy * s / cam.s); ctx.beginPath(); ctx.arc(q[0], q[1], 1.8 * d, 0, 6.29); ctx.fill(); }
  }
  if (P.pow > 0){
    // the pace, as a meter that fills toward red: the further back, the harder
    var w = 46 * d, h = 7 * d, x = b[0] - w / 2, y = b[1] + 16 * d;
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x - d, y - d, w + 2 * d, h + 2 * d);
    var g = ctx.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, '#7ee081'); g.addColorStop(0.6, '#F1D04A'); g.addColorStop(1, '#ff5a3c');
    ctx.fillStyle = g; ctx.fillRect(x, y, w * P.pow, h);
  }
}
function imgOf(url){ S.imgs = S.imgs || {}; var im = S.imgs[url]; if (!im){ im = new Image(); im.src = url; S.imgs[url] = im; var ks = Object.keys(S.imgs); if (ks.length > 40) delete S.imgs[ks[0]]; } return im; }
/* The golfer stands beside the ball, so when the ball is behind something he is behind it too: drawn
   faint rather than standing on the roof of the windmill house or the top of a block. */
function drawGolfer(ctx, P, cam){
  var V = cam.v3, at0 = P.state === 'aim' ? P.ball : P.prev;
  if (V && V.hid){ var z0 = V.zAt(at0[0], at0[1]);
    if (V.hid(at0[0], at0[1], z0 + 0.3) || V.hid(at0[0] + 0.6, at0[1], z0 + 0.8) || V.hid(at0[0] - 0.6, at0[1], z0 + 0.8)){ ctx.save(); ctx.globalAlpha = 0.4; drawGolfer0(ctx, P, cam); ctx.restore(); return; } }
  drawGolfer0(ctx, P, cam);
}
function drawGolfer0(ctx, P, cam){
  var h = S.host, at = P.state === 'aim' ? P.ball : P.prev, ang = P.state === 'aim' ? (P.C.kind === 'real' ? Math.atan2(P.target[1] - P.ball[1], P.target[0] - P.ball[0]) : P.aimAng) : P.shotAng;
  // the 3D modelled golfer (golfer3d.js through the page), side-on to the putt, putter on the ball:
  // address while aiming, the take back while a pull is held, the through once it is struck
  if (h.golfer3){ var g = null; try{ g = h.golfer3(Math.cos(ang), Math.sin(ang)); }catch(e){ g = null; }
    if (g && g.urls){ var im = imgOf(g.urls[P.state !== 'aim' ? 2 : P.pow > 0.02 ? 1 : 0]);
      if (im.complete && im.naturalWidth){ var hg = (P.C.kind === 'real' ? 3.4 : 3.1) * cam.s, kk = hg / g.fig, bp = w2s(cam, at[0], at[1]);
        ctx.save(); ctx.imageSmoothingEnabled = false;
        ctx.drawImage(im, Math.round(bp[0] - g.ball[0] * kk), Math.round(bp[1] - g.ball[1] * kk), Math.round(g.W * kk), Math.round(g.H * kk));
        ctx.restore(); }
      return; } }   // still loading: draw nothing this frame rather than flash the flat golfer
  if (!h.golfer || P.state !== 'aim') return;
  if (!S.gcv){ try{ S.gcv = h.golfer(); }catch(e){ S.gcv = null; } }
  var g = S.gcv; if (!g || !g.width) return;
  var hgt = (P.C.kind === 'real' ? 3.4 : cam.v3 ? 3.1 : 2.9) * cam.s, k = hgt / g.height, w = Math.round(g.width * k), hh = Math.round(g.height * k);
  var b = w2s(cam, P.ball[0], P.ball[1]), side = Math.cos(P.aimAng) >= 0 ? -1 : 1;
  ctx.save(); ctx.imageSmoothingEnabled = false;
  ctx.translate(Math.round(b[0] + side * (w * 0.42)), Math.round(b[1] - hh * 0.9));
  if (side > 0){ ctx.scale(-1, 1); ctx.drawImage(g, -w / 2, 0, w, hh); } else ctx.drawImage(g, -w / 2, 0, w, hh);
  ctx.restore();
}

/* -------------------------------------------------------------------------------- holing out */
function holeOut(picked){
  var P = S.play, R = S.round, C = P.C, s = picked ? P.cap : P.strokes, par = C.par;
  if (R.mode === 'ppt'){ P.state = 'done'; return tourOut(true); }
  if (R.mode === 'pdaily'){ P.state = 'done'; return dailyFinish(s, par, picked ? null : dailyMs(P)); }
  R.cards.push({ s:s, p:par, n:(R.i + 1), name:C.kind === 'real' ? C.sub : (R.holes[R.i].name || C.name) });
  var label = picked ? 'Picked up' : (C.kind === 'real' ? (s === 1 ? 'One putt' : s === 2 ? 'Two putts' : s + ' putts') : scoreName(s, par));
  if (!picked && s <= par - 1) try{ S.host.sfx && S.host.sfx('holeGood'); }catch(e){}
  var last = R.i >= R.holes.length - 1, st = load();
  if (R.mode === 'daily'){
    var dk = R.holes[0].day; st.daily = st.daily || {}; var rec = st.daily[dk] || { tries:0 };
    rec.tries++; if (rec.first == null) rec.first = s; rec.best = rec.best == null ? s : Math.min(rec.best, s); st.daily[dk] = rec; save(st);
  }
  var tot = 0, tp = 0; R.cards.forEach(function(c){ tot += c.s; tp += c.p; });
  if (last && R.mode !== 'daily'){
    if (R.mode === 'course'){ st.courses = st.courses || {}; var b0 = st.courses[R.theme]; st.courses[R.theme] = b0 == null ? tot - tp : Math.min(b0, tot - tp); }
    else { st.tour = st.tour || {}; var b1 = st.tour[R.courseKey]; st.tour[R.courseKey] = (typeof b1 !== 'number') ? tot - tp : Math.min(b1, tot - tp); }
    save(st);
  }
  var sub = C.kind === 'real' ? ('From ' + Math.round(P.firstFt || 0) + ' ft.') : (s + (s === 1 ? ' stroke' : ' strokes') + ', par ' + par + '.');
  var btns = R.mode === 'daily' ? '<button class="pt-go" data-again>Try again</button><button class="pt-bt" data-share>Copy result</button><button class="pt-bt" data-menu>Menu</button>'
    : last ? '<button class="pt-go" data-card>Scorecard</button>' : '<button class="pt-go" data-next>Next ' + (C.kind === 'real' ? 'green' : 'hole') + ' ▸</button>';
  var pop = el('<div class="pt-pop"><div class="k">' + (R.holes.length > 1 ? (C.kind === 'real' ? 'PUTT ' : 'HOLE ') + (R.i + 1) : 'DAILY HOLE') + '</div><div class="t">' + esc(label) + '</div><div class="s">' + esc(sub) +
    (R.holes.length > 1 ? ' Total ' + fmtPar(tot - tp) + '.' : '') + '</div><div class="row">' + btns + '</div></div>');
  P.state = 'done'; S.stage.appendChild(pop);
  var q = function(sel, fn){ var b = pop.querySelector(sel); if (b) b.onclick = fn; };
  q('[data-next]', function(){ R.i++; playHole(); });
  q('[data-again]', function(){ R.cards = []; playHole(); });
  q('[data-menu]', showMenu);
  q('[data-card]', scorecard);
  q('[data-share]', function(e){ var dh = R.holes[0], txt = 'Run The Tour · Daily hole ' + dh.day + '\n' + THEMES[dh.theme].name + ': ' + dh.name + '\n' + label + ' (' + s + ', par ' + par + ')';
    try{ navigator.clipboard.writeText(txt); e.currentTarget.textContent = 'Copied'; }catch(err){} });
}
function scorecard(){
  var R = S.round, tot = 0, tp = 0; R.cards.forEach(function(c){ tot += c.s; tp += c.p; });
  S.screen = 'card'; cancelAnimationFrame(S.raf);
  S.ov.innerHTML = top(R.title, 'Scorecard', '<b>' + fmtPar(tot - tp) + '</b>' + tot + ' strokes') + '<div class="pt-menu"><div class="pt-card" style="cursor:default"><div class="k">Final</div><div class="t">' + tot + ' · ' + fmtPar(tot - tp) + '</div>\
    <table>' + R.cards.map(function(c){ return '<tr><td>' + c.n + '</td><td>' + esc(c.name) + '</td><td>' + c.s + ' (' + fmtPar(c.s - c.p) + ')</td></tr>'; }).join('') + '</table></div>\
    <button class="pt-go" data-again>Play it again</button><button class="pt-bt" data-menu>Menu</button></div>';
  S.ov.querySelector('[data-x]').onclick = showMenu;
  S.ov.querySelector('[data-menu]').onclick = showMenu;
  S.ov.querySelector('[data-again]').onclick = function(){ R.i = 0; R.cards = []; playHole(); };
}
RTT_PUTT.open = open; RTT_PUTT.close = close; RTT_PUTT.paintCourse = paintCourse; RTT_PUTT.SKIN = SKIN;
RTT_PUTT._state = function(){ return S; };
RTT_PUTT._dailyFinish = function(s, par, ms){ return dailyFinish(s, par, ms); };
// the checker's door straight onto a Tour level. Nothing on the page calls it.
RTT_PUTT._level = function(n, tid){ if (S) startLevel(n, tid || 'main'); };
// a hole built from a function, for trying out a layout in the browser: RTT_PUTT._try(function(T){ return H; }, 'clubhouse')
RTT_PUTT._try = function(fn, theme, name){ if (!S) return; var d = { custom:fn, tpl:'try' + Date.now(), seed:7, theme:theme || 'clubhouse', name:name || 'Try out' }; S.round = { mode:'try', i:0, cards:[], holes:[d], title:d.name, kick:'Try out' }; playHole(); };
RTT_PUTT.lvH = lvH; RTT_PUTT.rectP = rectP; RTT_PUTT.buildFrom = buildFrom;
RTT_PUTT.COINS = { hole:COIN_HOLE, sig:COIN_SIG, ace:COIN_ACE, world:COIN_WORLD, daily:COIN_DAILY, dailyPar:COIN_DAILY_PAR }; RTT_PUTT.PAY = PAY;
// what the home screen card shows: today's Daily Hole, your level and your lives
RTT_PUTT.summary = function(host){ HOSTX = host || HOSTX; var st = pload(), dk = today(), dh = dailyHole(dk), rec = st.daily[dk];
  var tm = st.tours.main, lv = Math.min(tm.lv, LEVELS.length);
  return { lv:lv, levels:LEVELS.length, world:worldOf(lv, 'main').name, members:membersOpen(), lives:st.lives, max:livesMax(), refillAt:st.refillAt || null,
    daily:{ name:dh.name, theme:THEMES[dh.theme].name, kick:THEMES[dh.theme].kick, done:!!(rec && rec.done), s:rec && rec.s, par:rec && rec.par, ms:rec && rec.ms }, nextMs:msToNextDay() }; };
// the checker's door: start a round at a given hole. Nothing on the page calls it.
RTT_PUTT._go = function(mode, arg, i){ if (!S) return; startRound(mode, arg); if (i){ S.round.i = i; playHole(); } };

root.RTT_PUTT = RTT_PUTT;
if (typeof module !== 'undefined' && module.exports) module.exports = RTT_PUTT;
})(typeof self !== 'undefined' ? self : globalThis);
