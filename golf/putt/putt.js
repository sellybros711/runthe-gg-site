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
// THE HARDEST PULL. A mini hole's power bar tops out at MAX_FT; the solver, the ace search and every recorded route are
// held to it too (the owner, 2026-10-19: a route at 44 ft showed an ace on Double Loop that full power could not make).
var MAX_FT = 42;
var TGT_R = 0.4;            // a trick shot target (a bottle and its coaster): what the ball has to touch to knock it over
var TGT_KEEP = 0.7;         // one that topples keeps the ball going at this share of its speed
var TGT_E = 0.55;           // and one hit out of order rings and stays up: the ball bounces off it this hard
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
function inClimb(C, x, y){ var Z = C.climbs; for (var i = 0; i < Z.length; i++){ var z = Z[i]; if (x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1) return true; } return false; }
/* THE FERRY. A deck over a channel of hazard that shuttles between two docks on a timetable: it waits at
   dock A, crosses to B, waits, crosses back. A ball on the deck is carried (friction works on its speed
   RELATIVE to the deck, the same as the turntable), and when the deck stops at a dock the ball keeps the
   speed it had and rolls off the leading edge onto the landing there. So a ball never comes to rest on a
   moving thing: it rides, and it is put ashore. Missing the deck is the hazard under it. */
/* It pulls away gently and stops hard. Pulling away it gathers speed slower than the carpet's grip can
   follow, so a ball sitting on the deck stays put; at the far dock it stops dead and the ball rolls on off
   the leading edge. (A deck that started with a jerk would throw the ball off its back edge.) */
/* A MOVING DECK HOLDS THE BALL (the owner, 2026-10-19: "it's almost impossible to land it on it right now. The ball
   rolls off as it moves"). On carpet's grip a ball coming down on a moving deck needed far more than the deck's length
   to settle. So while the deck moves it grips DECK_GRIP times harder, and a ball that lands on it stops on it and rides.
   A deck standing at a dock is carpet again, so a ball rolled onto a waiting deck plays as it always has.
   That grip would have the ball ride at the deck's full speed into the dock and be thrown off it, so the deck now eases
   in: it leaves gently, runs, and slows to its landing speed (f.e, set where the hole is built: the speed at which a ball
   anywhere on the deck slides a foot clear of it on the carpet's grip), then stops. The ball keeps that speed and is put
   ashore, and never rests on the deck. k = (3 - e)w^2 + (e - 2)w^3: no jerk leaving, e times the mean speed arriving. */
var DECK_GRIP = 8;
function ferryEase(e, w){ return { k:(3 - e) * w * w + (e - 2) * w * w * w, d:2 * (3 - e) * w + 3 * (e - 2) * w * w }; }
function ferryPos(f, tt){ var P = 2 * (f.move + f.dwell), u = ((tt / P + (f.phase || 0)) % 1 + 1) % 1 * P, k, v, w, z;
  if (f.e != null){
    if (u < f.dwell){ k = 0; v = 0; } else if (u < f.dwell + f.move){ z = ferryEase(f.e, (u - f.dwell) / f.move); k = z.k; v = z.d / f.move; }
    else if (u < 2 * f.dwell + f.move){ k = 1; v = 0; } else { z = ferryEase(f.e, (u - 2 * f.dwell - f.move) / f.move); k = 1 - z.k; v = -z.d / f.move; }
    return { ox:f.dx * k, oy:f.dy * k, vx:f.dx * v, vy:f.dy * v, k:k }; }
  if (u < f.dwell){ k = 0; v = 0; } else if (u < f.dwell + f.move){ w = (u - f.dwell) / f.move; k = w * w; v = 2 * w / f.move; }
  else if (u < 2 * f.dwell + f.move){ k = 1; v = 0; } else { w = (u - 2 * f.dwell - f.move) / f.move; k = 1 - w * w; v = -2 * w / f.move; }
  return { ox:f.dx * k, oy:f.dy * k, vx:f.dx * v, vy:f.dy * v, k:k }; }
function ferryAt(C, x, y, tt, pad){ var F = C.ferries; pad = pad || 0; for (var i = 0; i < F.length; i++){ var f = F[i], q = ferryPos(f, tt);
  if (x >= f.x0 + q.ox - pad && x <= f.x1 + q.ox + pad && y >= f.y0 + q.oy - pad && y <= f.y1 + q.oy + pad) return { f:f, q:q }; } return null; }
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
// Everything that moves runs at PACE of the speed its hole was written at. Players found the
// sliders, gates, spinners, sails, bridges and turntables far too quick at the written speeds, so
// the slowdown is applied once, here and in the compile, rather than in ninety hole definitions.
// Changing it re-times every moving hole: re-solve them (solve.mjs --write) and replay.
var PACE = 0.6;
function paced(o){ var c = {}; for (var k in o) c[k] = o[k]; if (c.period) c.period /= PACE; if (c.omega) c.omega *= PACE; return c; }
function moverAt(o, t){
  if (o.k === 'blade'){ var sp = bladeSpan(o, t); return sp ? [[sp[0], o.y, sp[1], o.y]] : []; }
  if (o.k === 'door'){ var fo = doorOpen(o, t), dx2 = o.ax + (o.bx - o.ax) * fo, dy2 = o.ay + (o.by - o.ay) * fo, hx2 = Math.cos(o.ang) * o.len / 2, hy2 = Math.sin(o.ang) * o.len / 2;
    return [[dx2 - hx2, dy2 - hy2, dx2 + hx2, dy2 + hy2]]; }
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
/* A DOOR ON A SWITCH. A bar shut across a gap until the ball rolls over its plate; then it slides open,
   stays open for hold seconds, and shuts. The plate is pressed by THIS putt or not at all (simulate
   clears it at the start of every putt), so the puzzle is always one stroke: find the line that runs
   over the plate on its way to the door. _p is the moment it was pressed, on the hole's own clock. */
function doorOpen(o, t){ if (o._p == null) return 0; var d = t - o._p; return d < 0 ? 0 : d < 0.3 ? d / 0.3 : d < o.hold ? 1 : d < o.hold + 0.5 ? 1 - (d - o.hold) / 0.5 : 0; }
function moverVel(o, t, qx, qy){
  if (o.k === 'door') return [0, 0];
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
  var onDeck = false, climbing = false, z = 0, zv = 0, over = false, cr = C.cupR, cx = C.cup[0], cy = C.cup[1], t = 0, n = 0;
  var rx = x, ry = y;   // where the ball was half a second ago, for the pinned-against-a-rail rest below
  var walls = C.walls, bums = C.bumpers, movs = C.movers, loops = C.loops || [], ramps = C.ramps || [];
  var lastPiece = null;   // the loop or ramp just ridden, so it cannot fire twice on the way out of it
  /* TRICK SHOT TARGETS (the Clubhouse's gyms, gymkinds/trickshot.js): numbered targets that must go down in order. tk is
     how many are down when the putt is struck (C.tk, kept by whoever plays the room, never by the hole). The cup is shut
     under its lid for any putt struck before every one is down: the lid comes off once the last bottle has fallen and the
     ball has stopped, so the cup is always a putt of its own. A hole with no targets never reads any of it. */
  var tgs = C.targets && C.targets.length ? C.targets : null, tk = tgs ? (C.tk | 0) : 0, shut = !!tgs && tk < tgs.length;
  for (var di = 0; di < movs.length; di++) if (movs[di].k === 'door') movs[di]._p = null;
  // a stretch of a set piece, played out: each point is [x, y, dt from now, z above the surface]
  function ride(path){ var t1 = t, k = 0; for (var q = 0; q < path.length; q++){ var pp = path[q]; t1 = t + pp[2]; out.pts.push([pp[0], pp[1], t1, 0, pp[3] || 0]); } t = t1; n = 0; }
  function landAt(xx, yy, tt){ var mm = C.mats.at(xx, yy); if (mm === M.OUT) mm = C.matFn(xx, yy); if (C.bridges.length && mm === M.WATER){ var bb = bridgeAt(C, xx, yy, 0.2); if (bb) mm = bridgeDown(bb, tt) ? M.GREEN : M.WATER; }
    if (mm === M.WATER && C.ferries.length && ferryAt(C, xx, yy, tt, 0.1)) mm = M.GREEN; return mm; }
  for (;;){
    var m = C.mats.at(s.x, s.y);
    /* The grid is a quarter foot and a ball resting on a rail has its centre 0.07 ft inside it, so the
       nearest grid point can be outside. OUT is only believed once the exact shape agrees. */
    if (m === M.OUT) m = C.matFn(s.x, s.y);
    if (C.bridges.length && m === M.WATER){ var brg = bridgeAt(C, s.x, s.y, 0.2); if (brg) m = bridgeDown(brg, t0 + t) ? M.GREEN : M.WATER; }
    var deck = (m === M.WATER && C.ferries.length) ? ferryAt(C, s.x, s.y, t0 + t, 0.1) : null; if (deck){ m = M.GREEN; if (!onDeck) out.ev.push([t, 'deck']); } onDeck = !!deck;
    if (m === M.WATER){ out.water = true; out.ev.push([t, 'water']); break; }
    if (m === M.OUT){ out.out = true; out.ev.push([t, 'out']); break; }
    var px0 = s.x, py0 = s.y, rv = m === M.FLOW ? riverAt(C, s.x, s.y) : null, disc = (!rv && C.turns.length) ? turnAt(C, s.x, s.y) : null;
    if (rv){
      // in the river the current has the ball: it is turned to the flow and brought to its speed, and held off the banks
      var kq = Math.min(1, DT / 0.22), tvx = rv.tx * rv.r.vc, tvy = rv.ty * rv.r.vc;
      s.vx += (tvx - s.vx) * kq; s.vy += (tvy - s.vy) * kq;
      s.vx += rv.ty * rv.lat * 5 * DT; s.vy -= rv.tx * rv.lat * 5 * DT;
    } else if (deck){
      // on the ferry: friction works against the ball's speed relative to the deck, so a ball that settles rides it
      var fvx = deck.q.vx, fvy = deck.q.vy, rfx = s.vx - fvx, rfy = s.vy - fvy, rfs = Math.hypot(rfx, rfy), aff = fricOf(C, M.GREEN) * (fvx || fvy ? DECK_GRIP : 1);
      if (rfs > 1e-9){ var df = Math.min(rfs, aff * DT); rfx -= rfx / rfs * df; rfy -= rfy / rfs * df; }
      s.vx = rfx + fvx; s.vy = rfy + fvy;
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
    /* A RAMP LANE HOLDS NOTHING. On the carpet the slope's pull is usually under friction, so a ball that ran
       out of pace half way up would sit on the ramp. In a climb lane static friction is gone and the rolling
       drag is a quarter of its usual, so a ball that does not make the top rolls back down and stops at the foot. */
    if (C.climbs && C.climbs.length && sl > 0.1 && !over && inClimb(C, s.x, s.y)){ af *= 0.25; climbing = true; } else climbing = false;
    if (over){ ax = 0; ay = 0; }   // over the hole the ball is falling, not rolling
    if (sp < STOP_V && !over && sl <= af && !climbing){ break; }
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
        /* the flight leaves the lip where the ball crossed it, never from the lip's middle: started from the
           middle, a ball that hit the ramp off-centre jumped sideways the instant it took off */
        var lx0 = Rp.x - Rp.dy * sd2, ly0 = Rp.y + Rp.dx * sd2;
        var tf = (vz + Math.sqrt(vz * vz + 2 * G * hgt)) / G, fp = [], tk = 0;
        for (tk = 1 / 60; tk < tf; tk += 1 / 60) fp.push([lx0 + ux * vh * tk, ly0 + uy * vh * tk, tk, hgt + vz * tk - G * tk * tk / 2]);
        var lx = lx0 + ux * vh * tf, ly = ly0 + uy * vh * tf; fp.push([lx, ly, tf, 0]);
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
    for (i = 0; i < movs.length; i++){ var dr = movs[i]; if (dr.k === 'door' && dr._p == null && Math.hypot(s.x - dr.px, s.y - dr.py) < dr.pr){ dr._p = t0 + t; out.ev.push([t, 'plate']); } }
    /* ---- TRICK SHOT TARGETS. The next one in order topples when the ball reaches it, and the ball runs on through where it
       stood with TGT_KEEP of its speed. One out of order rings and stays up: a post the ball bounces off. A target that is
       down lies flat on the felt and the ball rolls over it. */
    if (tgs) for (i = tk; i < tgs.length; i++){ var tq = tgs[i], tqx = s.x - tq.x, tqy = s.y - tq.y, tqr = tq.r + BALL_R;
      if (tqx * tqx + tqy * tqy >= tqr * tqr) continue;
      if (i === tk){ tk++; s.vx *= TGT_KEEP; s.vy *= TGT_KEEP; out.ev.push([t, 'topple', i]); }
      else if (hitCircle(s, tq.x, tq.y, tq.r, TGT_E)) out.ev.push([t, 'ring', i]); }
    // the cup: over the hole the ball falls, and it is in once it has fallen far enough to catch the far lip
    var dx = s.x - cx, dy = s.y - cy, d = Math.hypot(dx, dy);
    if (d < cr && !shut){
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
    if (n % 240 === 0){ if (!over && !rv && !disc && !deck && Math.hypot(s.vx, s.vy) < 4 * STOP_V && Math.hypot(s.x - rx, s.y - ry) < 0.02) break; rx = s.x; ry = s.y; }
    if (t > MAX_T){ if (deck){ out.water = true; out.ev.push([t, 'water']); } break; }
  }
  return finishOut();
  function finishOut(){ out.t = t; out.rest = [s.x, s.y]; out.pts.push([s.x, s.y, t]); if (tgs) out.tk = tk; return out; }
}

/* ============================================================================ a course, assembled */
function finishCourse(C){
  C.walls = C.walls || []; C.bumpers = C.bumpers || []; C.movers = C.movers || []; C.portals = C.portals || []; C.belts = C.belts || [];
  C.loops = C.loops || []; C.ramps = C.ramps || []; C.rivers = C.rivers || []; C.bridges = C.bridges || []; C.turns = C.turns || []; C.ferries = C.ferries || [];
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
    bumper:'pumpkin', block:'tomb', spinner:'#d9d4c7', slider:'coffin', flag:'#ff7a1a',
    decor:['tomb', 'bat', 'ghost', 'deadtree', 'pumpkin'], acc:'#ff9a3a',
    holes:['Pumpkin Patch', 'Crypt Corner', 'Bat Cave', 'The Haunted Mill', 'Witch’s Brew', 'Graveyard Shift', 'Coffin Run', 'Cauldron Crater', 'Headless Hollow'] },
  harvest:{ name:'Harvest Hills', kick:'Thanksgiving', bg:'#8a6a34', bg2:'#9c7a3c', carpet:'#6f9d3b', carpet2:'#668f37', wall:'#8b4a1e', wallHi:'#b86b34', wallLo:'#5a2e10', ink:'#2b1606',
    haz:'water', hazCol:'#9b1b30', hazCol2:'#c8344d', hazName:'Cranberry bog', slow:'mud', slowCol:'#e2bf45', slowName:'Corn crib',
    bumper:'pie', block:'hay', spinner:'#f2e6c9', slider:'hay', flag:'#c8344d',
    decor:['corn', 'hay', 'leaves', 'turkey', 'pumpkin'], acc:'#f2a93b',
    holes:['First Furrow', 'Hayride', 'Gobbler’s Gap', 'The Old Mill', 'Cranberry Bog', 'Cornrows', 'Hollow Log', 'Pie Plate', 'The Big Feast'] },
  winter:{ light:true, name:'Frostbite Pines', kick:'Holidays', bg:'#e8f1fa', bg2:'#d7e6f4', carpet:'#2f7d5b', carpet2:'#2a7253', wall:'#d62f2f', wallHi:'#ff6a6a', wallLo:'#8e1717', ink:'#1a2a3a',
    haz:'ice', hazCol:'#bfe6ff', hazCol2:'#ecf8ff', hazName:'Frozen pond', slow:'mud', slowCol:'#ffffff', slowName:'Snowdrift',
    bumper:'snowball', block:'gift', spinner:'#ffffff', slider:'gift', flag:'#d62f2f',
    decor:['pine', 'snowman', 'gift', 'cane'], acc:'#7fd0ff',
    holes:['First Flake', 'Candy Cane Lane', 'Chimney Drop', 'The Toy Mill', 'Frozen Pond', 'Sleigh Ride', 'Down the Chimney', 'Snow Globe', 'The North Pole'] },
  sweetheart:{ light:true, name:'Sweetheart Greens', kick:'Valentine’s', bg:'#ffd3e2', bg2:'#ffc2d6', carpet:'#d9487a', carpet2:'#cc3f70', wall:'#ffffff', wallHi:'#ffffff', wallLo:'#e9a0b8', ink:'#5a1030',
    haz:'water', hazCol:'#5b2f1d', hazCol2:'#7b4630', hazName:'Chocolate fountain', slow:'mud', slowCol:'#f7c7da', slowName:'Sprinkles',
    bumper:'heart', block:'candybox', spinner:'#ffe3ee', slider:'candybox', flag:'#ff2d6f',
    decor:['heart', 'rose', 'candy'], acc:'#ff6f9f',
    holes:['First Date', 'Love Letter', 'Heartbeat', 'The Tunnel of Love', 'Chocolate River', 'Rose Garden', 'Cupid’s Arrow', 'Heart of Gold', 'Happily Ever After'] },
  shamrock:{ name:'Shamrock Glen', kick:'St. Patrick’s', bg:'#1d4d27', bg2:'#245c30', carpet:'#5cb84c', carpet2:'#53aa45', wall:'#e2b23b', wallHi:'#ffd968', wallLo:'#8a6612', ink:'#0c2412',
    haz:'water', hazCol:'#3fa7e0', hazCol2:'#8fd3ff', hazName:'Rainbow pool', slow:'mud', slowCol:'#f2c94c', slowName:'Gold coins',
    bumper:'clover', block:'stone', spinner:'#ffd968', slider:'stone', flag:'#2fa84f',
    decor:['clover', 'potgold', 'rainbow'], acc:'#ffd968',
    holes:['Four Leaf', 'Lucky Bounce', 'The Glen', 'The Stone Mill', 'Rainbow’s End', 'Clover Field', 'Fairy Ring', 'Pot of Gold', 'Luck of the Draw'] },
  spring:{ light:true, name:'Bloom Gardens', kick:'Spring', bg:'#a4d98a', bg2:'#93cc79', carpet:'#4fa356', carpet2:'#47974e', wall:'#f4a7c0', wallHi:'#ffd0df', wallLo:'#b8607f', ink:'#24401f',
    haz:'water', hazCol:'#5fbfff', hazCol2:'#a8e0ff', hazName:'Lily pond', slow:'mud', slowCol:'#9a7048', slowName:'Flower bed',
    bumper:'egg', block:'planter', spinner:'#fff6d5', slider:'planter', flag:'#ffd23f',
    decor:['flower', 'egg', 'bunny'], acc:'#ffd23f',
    holes:['First Bloom', 'Tulip Row', 'Bunny Hop', 'The Garden Mill', 'Lily Pond', 'Egg Hunt', 'Rabbit Hole', 'Bird Bath', 'Full Bloom'] },
  firework:{ name:'Firecracker Fairways', kick:'Summer nights', bg:'#121d3a', bg2:'#18264a', carpet:'#2e7d32', carpet2:'#2a722e', wall:'#e53935', wallHi:'#ff7a77', wallLo:'#8c1414', ink:'#060b18',
    haz:'water', hazCol:'#1e7fd8', hazCol2:'#5fb4ff', hazName:'Reflecting pool', slow:'mud', slowCol:'#d8c49b', slowName:'Picnic blanket',
    bumper:'star', block:'crate', spinner:'#ffffff', slider:'crate', flag:'#ffffff',
    decor:['burst', 'flagpole', 'star'], acc:'#ffd23f',
    holes:['The Fuse', 'Sparkler', 'Bottle Rocket', 'The Pinwheel', 'Reflecting Pool', 'Grand Stand', 'The Launch Tube', 'Big Bang', 'The Finale'] },
  clubhouse:{ light:true, name:'The Clubhouse', kick:'World 1', bg:'#7fb35e', bg2:'#73a754', carpet:'#2f8f4e', carpet2:'#2a8246', wall:'#f4efe2', wallHi:'#ffffff', wallLo:'#a99c7c', ink:'#1d3524',
    haz:'water', hazCol:'#3f9fe0', hazCol2:'#9fd6f7', hazName:'Practice pond', slow:'mud', slowCol:'#e9d8a6', slowName:'Sand',
    bumper:'stone', block:'hay', spinner:'#ffffff', slider:'crate', flag:'#e53935',
    decor:['flower', 'flagpole'], acc:'#F1D04A',
    holes:['First Tee', 'Pace', 'The Slope', 'Bank Shot', 'Sand Trap', 'Twin Bunkers', 'Bumper Alley', 'The Crown', 'Dogleg Left', 'Clubhouse Classic'] },
  tour:{ name:'Tour Week', kick:'World 5', bg:'#2f6b3a', bg2:'#2a6034', carpet:'#3aa05a', carpet2:'#349150', wall:'#1d2a44', wallHi:'#3a4d73', wallLo:'#0f1626', ink:'#0a1020',
    haz:'water', hazCol:'#2f8fd8', hazCol2:'#8fd0ff', hazName:'The lake', slow:'mud', slowCol:'#efe2b8', slowName:'Bunker',
    bumper:'pad', block:'crate', spinner:'#ffffff', slider:'crate', flag:'#F1D04A',
    decor:['flagpole', 'star'], acc:'#F1D04A',
    holes:['Tour Pin', 'Bounce House', 'Tour Pin', 'Pinball', 'Tour Pin', 'Pad Bank', 'Tour Pin', 'Grandstand', 'Tour Pin', 'Island Green'] },
  temple:{ name:'Lost Temple', kick:'World 6', bg:'#2c4a24', bg2:'#355a2b', carpet:'#3f9a4a', carpet2:'#398c43', wall:'#b9ae84', wallHi:'#ddd3a8', wallLo:'#6f6a4e', ink:'#16200f',
    haz:'water', hazCol:'#2fb58f', hazCol2:'#7fe0c0', hazName:'Jade pool', slow:'mud', slowCol:'#6b5232', slowName:'Vines', iceCol:'#d8cfa8', iceCol2:'#f4eed6',
    bumper:'idol', block:'ruin', spinner:'#d8b648', slider:'ruin', flag:'#c9a227',
    decor:['fern', 'idol', 'ruin'], acc:'#37e0a0', river:['#1f9a78', '#5fd8b2'], kicker:'#c9a227', loopCol:['#c9a227', '#f1d77a', '#6f5a1a'],
    holes:[] },
  pirate:{ light:true, name:'Pirate Cove', kick:'World 5', bg:'#e6cf8c', bg2:'#dcc27a', carpet:'#1f9a7d', carpet2:'#1b8d72', wall:'#6b4426', wallHi:'#9a6a3e', wallLo:'#3d2614', ink:'#1d2a30',
    haz:'water', hazCol:'#1a86c4', hazCol2:'#7fd0f5', hazName:'The lagoon', slow:'mud', slowCol:'#f3dfa0', slowName:'Soft sand',
    bumper:'barrel', block:'chest', spinner:'#f2e6c9', slider:'plank', flag:'#1d1d1d',
    decor:['palm', 'barrel', 'anchor', 'chest'], acc:'#ff5a3c', river:['#1677b5', '#6cc6f0'], kicker:'#1d1d1d', loopCol:['#6b4426', '#c9a227', '#3d2614'],
    holes:[] },
  canyon:{ name:'Canyon Mine', kick:'World 7', bg:'#a95a35', bg2:'#b8693e', carpet:'#3d8f4c', carpet2:'#378245', wall:'#6e4a2a', wallHi:'#9a6e44', wallLo:'#3d2814', ink:'#2a140a',
    haz:'water', hazCol:'#3a6f86', hazCol2:'#7fb0c4', hazName:'Flooded shaft', slow:'mud', slowCol:'#c79a6a', slowName:'Gravel',
    bumper:'boulder', block:'crate', spinner:'#c9a227', slider:'cart', flag:'#ffb347',
    decor:['cactus', 'boulder', 'cart', 'lantern'], acc:'#ffb347', river:['#5a8a9a', '#a8d0dc'], kicker:'#ffb347', loopCol:['#8a8a90', '#c9c9cf', '#3d3a3a'],
    holes:[] },
  volcano:{ name:'Volcano Island', kick:'World 8', bg:'#1f1a1d', bg2:'#2a2427', carpet:'#2f8f4e', carpet2:'#2a8246', wall:'#3a3236', wallHi:'#5c5258', wallLo:'#141113', ink:'#0a0809',
    haz:'water', hazCol:'#ff6a1a', hazCol2:'#ffd25a', hazName:'Lava', slow:'mud', slowCol:'#6a6066', slowName:'Ash',
    bumper:'lavarock', block:'basalt', spinner:'#ff8a2a', slider:'basalt', flag:'#ff6a1a',
    decor:['tiki', 'palm', 'lavarock'], acc:'#ff8a2a', river:['#1f8fb8', '#7fd8f0'], kicker:'#ff6a1a', loopCol:['#ff6a1a', '#ffd25a', '#5a1a08'],
    holes:[] },
  dino:{ name:'Dino Valley', kick:'World 10', bg:'#556626', bg2:'#60722c', carpet:'#3e9a4a', carpet2:'#388c43', wall:'#c9a46a', wallHi:'#e8cc92', wallLo:'#7a5a34', ink:'#1e1a0c',
    haz:'water', hazCol:'#3f6a3a', hazCol2:'#7aa65a', hazName:'Swamp', slow:'mud', slowCol:'#6a4a2a', slowName:'Bog', iceCol:'#8a4e30', iceCol2:'#b8724a',
    bumper:'dinoegg', block:'fossil', spinner:'#e8dcc0', slider:'log', flag:'#e8572a',
    decor:['dinoegg', 'fern'], acc:'#b8e04a', river:['#5a8a3e', '#a8c870'], kicker:'#e8572a', loopCol:['#c9a46a', '#f4e6c4', '#6a4a2a'],
    holes:[] },
  sky:{ light:true, name:'Sky Islands', kick:'World 9', bg:'#7fc4ef', bg2:'#8fcdf3', carpet:'#3aa05a', carpet2:'#349150', wall:'#f8f4e8', wallHi:'#ffffff', wallLo:'#b0a88f', ink:'#1d3550',
    haz:'water', hazCol:'#e4f1fb', hazCol2:'#ffffff', hazName:'The drop', slow:'mud', slowCol:'#d9c79a', slowName:'Haystack',
    bumper:'cloud', block:'pillar', spinner:'#ffd23f', slider:'pillar', flag:'#ff5a3c',
    decor:['cloud', 'pillar'], acc:'#ffd23f', river:['#6fc0ff', '#d0ecff'], kicker:'#ff5a3c', loopCol:['#ff5a3c', '#ffd23f', '#7a2a1a'],
    holes:[] },
  neon:{ name:'Neon Arcade', kick:'World 4', bg:'#0d0b1e', bg2:'#141030', carpet:'#23307a', carpet2:'#1f2a6e', wall:'#ff2bd6', wallHi:'#ff8ae8', wallLo:'#7a0e66', ink:'#05040c',
    haz:'water', hazCol:'#00e5ff', hazCol2:'#b8faff', hazName:'Glitch pool', slow:'mud', slowCol:'#3a2a5a', slowName:'Static',
    bumper:'neonpost', block:'cabinet', spinner:'#39ff14', slider:'cabinet', flag:'#39ff14',
    decor:['neonpost', 'cabinet'], acc:'#ff2bd6', river:['#b026ff', '#e9a6ff'], kicker:'#ffe600', loopCol:['#39ff14', '#c8ffb8', '#0a5a00'],
    holes:[] },
  school:{ light:true, name:'Schoolyard', kick:'World 2', bg:'#4c5058', bg2:'#555a63', carpet:'#2f9a4c', carpet2:'#2b8d45', wall:'#ffd23f', wallHi:'#fff09a', wallLo:'#a87a0c', ink:'#1f2430',
    haz:'water', hazCol:'#5a7896', hazCol2:'#a8c4dc', hazName:'Puddle', slow:'mud', slowCol:'#ead39a', slowName:'Sandbox',
    bumper:'kickball', block:'locker', spinner:'#e53935', slider:'bus', flag:'#e53935',
    decor:['kickball', 'locker'], acc:'#ffd23f', river:['#3f8fd8', '#a8d4f6'], kicker:'#e53935', loopCol:['#ff7a1a', '#ffd23f', '#7a3a10'],
    holes:[] },
  iceage:{ light:true, name:'Ice Age', kick:'World 11', bg:'#e2e9ee', bg2:'#d2dce3', carpet:'#4f8a5a', carpet2:'#487f52', wall:'#d9c9a6', wallHi:'#f4ead2', wallLo:'#8a7658', ink:'#2a241c',
    haz:'water', hazCol:'#1e1a16', hazCol2:'#4a3e32', hazName:'Tar pit', slow:'mud', slowCol:'#9aa48a', slowName:'Tundra moss', iceCol:'#8fd0e0', iceCol2:'#dcf4fa',
    bumper:'mammoth', block:'glacier', spinner:'#efe4cc', slider:'glacier', flag:'#c0392b',
    decor:['mammoth', 'glacier'], acc:'#8fd0e0', river:['#4aa8c4', '#c8eef8'], kicker:'#c0392b', loopCol:['#8fd0e0', '#ffffff', '#2f6f80'],
    holes:[] },
  candy:{ name:'Candy Works', kick:'World 3', bg:'#4a2a1e', bg2:'#58331f', carpet:'#2fae8a', carpet2:'#2a9e7e', wall:'#ff5fa2', wallHi:'#ffa8cc', wallLo:'#9a2a5a', ink:'#1e0e08',
    haz:'water', hazCol:'#5a2e14', hazCol2:'#8a5230', hazName:'Chocolate', slow:'mud', slowCol:'#f2a65a', slowName:'Taffy', iceCol:'#ffd6e6', iceCol2:'#fff4f8',
    bumper:'gumball', block:'sugarcube', spinner:'#ffe14a', slider:'wrapper', flag:'#ff3b7a',
    decor:['gumball', 'sugarcube'], acc:'#ff5fa2', river:['#c2722a', '#f2b46a'], kicker:'#ff3b7a', loopCol:['#ff5fa2', '#ffffff', '#7a1a42'],
    holes:[] },
  beach:{ light:true, name:'Seashell Shores', kick:'Summer', bg:'#f1dc9c', bg2:'#e8d08a', carpet:'#1ea77d', carpet2:'#1b9a73', wall:'#ffffff', wallHi:'#ffffff', wallLo:'#9fd8e6', ink:'#1b3a4a',
    haz:'water', hazCol:'#22a7e0', hazCol2:'#8fdcff', hazName:'Tide pool', slow:'mud', slowCol:'#f5e2a5', slowName:'Soft sand',
    bumper:'beachball', block:'castle', spinner:'#ffd23f', slider:'surfboard', flag:'#ff5a3c',
    decor:['palm', 'umbrella', 'crab', 'castle'], acc:'#ff5a3c',
    holes:['Low Tide', 'Sandcastle', 'Crab Walk', 'The Lighthouse', 'Tide Pool', 'Boardwalk', 'Shell Game', 'Surf’s Up', 'Sunset'] }
};
/* the light that comes up out of the cup when the ball drops, one colour a theme (the real greens use gold) */
var GLOW = { haunted:'#ff8a1f', harvest:'#ffc23d', winter:'#9fe4ff', sweetheart:'#ff5c9a', shamrock:'#7dff7a', spring:'#ffd6ec',
  firework:'#ff4fd8', clubhouse:'#fff2b0', tour:'#f1d04a', temple:'#7dffd2', pirate:'#ffd23f', canyon:'#ffb347', volcano:'#ff5a1a', dino:'#c8f05a', sky:'#fff6b0', neon:'#39ff14', school:'#ffe36a', iceage:'#aef0ff', candy:'#ff9ad0', beach:'#5ce1ff' };
Object.keys(GLOW).forEach(function(k){ if (THEMES[k]) THEMES[k].glow = GLOW[k]; });
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
// a bank board: a block laid at an angle between two points, th thick. Classic mini golf banks off
// these, so they are a block like any other (skin, height, shadow) with its bounding box in x0..y1 for
// anything that only needs to keep clear of it, and rot for everything that asks whether a point is IN it.
function addBoard(H, ax, ay, bx, by, th, skin){ var L = Math.hypot(bx - ax, by - ay) || 1, c = (bx - ax) / L, sn = (by - ay) / L, hw = (th || 0.36) / 2, nx = -sn * hw, ny = c * hw;
  var P = [[ax + nx, ay + ny], [bx + nx, by + ny], [bx - nx, by - ny], [ax - nx, ay - ny]], xs = P.map(function(q){ return q[0]; }), ys = P.map(function(q){ return q[1]; });
  var r = { x0:Math.min.apply(null, xs), y0:Math.min.apply(null, ys), x1:Math.max.apply(null, xs), y1:Math.max.apply(null, ys), skin:skin, rot:{ cx:(ax + bx) / 2, cy:(ay + by) / 2, c:c, s:sn, hl:L / 2, hw:hw } };
  H.blocks.push(r); H.walls = H.walls.concat(polyWalls(P, 0, 0.6)); return r; }
// is a point inside a block, grown by pad: the one answer for straight blocks and bank boards alike
function inBlock(r, x, y, pad){ pad = pad || 0; if (!r.rot) return x > r.x0 - pad && x < r.x1 + pad && y > r.y0 - pad && y < r.y1 + pad;
  var q = r.rot, dx = x - q.cx, dy = y - q.cy; return Math.abs(dx * q.c + dy * q.s) < q.hl + pad && Math.abs(-dx * q.s + dy * q.c) < q.hw + pad; }
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
var COURSE_ORDER = ['straight', 'dogleg', 'tiers', 'mill', 'island', 'sbend', 'bowl', 'volcano', 'gauntlet'];
var DAILY_POOL = ['mill', 'island', 'straight', 'volcano', 'gauntlet', 'tiers', 'bowl', 'sbend', 'dogleg'];

function buildMini(tplName, seed, themeId, label, extra){
  var T = THEMES[themeId] || THEMES.haunted, r = mulberry(seed), H = TEMPLATES[tplName](r, T);
  // a mirror image is a new hole for free, and the templates are written to survive it
  if (r() < 0.5){
    var fx = function(p){ return [-p[0], p[1]]; };
    H.poly = H.poly.map(fx).reverse(); H.tee = fx(H.tee); H.cup = fx(H.cup);
    H.bumpers.forEach(function(b){ b.x = -b.x; });
    H.blocks = H.blocks.map(function(b){ return { x0:-b.x1, y0:b.y0, x1:-b.x0, y1:b.y1, skin:b.skin }; });
    H.walls = []; H.blocks.forEach(function(b){ H.walls = H.walls.concat(rectWalls(b, 0.6)); });
    H.movers.forEach(function(m){ if (m.k === 'spin' || m.k === 'blade'){ m.x = -m.x; m.omega = -m.omega; m.phase = Math.PI - m.phase; } else { m.ax = -m.ax; m.bx = -m.bx; if (m.k === 'door') m.px = -m.px; } });
    H.zones.forEach(function(z){ if (z.t === 'rect'){ var a = -z.x1, b = -z.x0; z.x0 = a; z.x1 = b; } else z.x = -z.x; });
    H.comps.forEach(function(c){ if ('x' in c) c.x = -c.x; if ('gx' in c) c.gx = -c.gx; if ('x0' in c) c.x0 = -c.x0; if ('ux' in c) c.ux = -c.ux; if ('nx' in c) c.nx = -c.nx; });
    H.flats.forEach(function(f){ f.x = -f.x; });
    (H.climbs || []).forEach(function(z){ var a = -z.x1; z.x1 = -z.x0; z.x0 = a; });
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
  var bridges = (H.bridges || []).map(function(z){ return { x0:Math.min(z.x0, z.x1), y0:Math.min(z.y0, z.y1), x1:Math.max(z.x0, z.x1), y1:Math.max(z.y0, z.y1), period:(z.period || 4) / PACE, phase:z.phase || 0, duty:z.duty == null ? 0.5 : z.duty, hinge:z.hinge || 'n' }; });
  var C = { kind:'mini', tpl:tplName, theme:themeId, T:T, name:label || tplName, bounds:b, poly:PS[0], polys:PS, allPts:all, edges:edges, rooms:rooms, comps:H.comps, flats:H.flats,
    stimp:H.stimp || (themeId === 'winter' ? 9.5 : 9), cup:H.cup, cupR:CUP_R_MINI, tee:H.tee, par:H.par,
    walls:edges.map(function(e){ return [e[0], e[1], e[2], e[3], 0, 0.72]; }).concat(H.walls), bumpers:H.bumpers, blocks:H.blocks, movers:H.movers.map(paced), portals:H.portals, zones:H.zones, mill:H.mill, seed:seed,
    secret:H.secret || [], loops:(H.loops || []).map(function(L){ var l = Math.hypot(L.dx, L.dy) || 1; return { x:L.x, y:L.y, dx:L.dx / l, dy:L.dy / l, r:L.r || 0.75, w:L.w || 1.4, off:L.off || 0, vmin:L.vmin }; }),
    ramps:(H.ramps || []).map(function(R){ var l = Math.hypot(R.dx, R.dy) || 1; return { x:R.x, y:R.y, dx:R.dx / l, dy:R.dy / l, w:R.w || 2, h:R.h || 0.4, ang:R.ang || 24, len:R.len || 1.6 }; }),
    rivers:rivers, bridges:bridges, ferries:(H.ferries || []).map(function(f){ var st = H.stimp || (themeId === 'winter' ? 9.5 : 9), D = Math.hypot(f.dx, f.dy) || 1, L = Math.abs(f.dx) >= Math.abs(f.dy) ? f.x1 - f.x0 : f.y1 - f.y0,
      ve = Math.sqrt(2 * (V_STIMP * V_STIMP / (2 * st)) * (L + 1)), mv = f.move / PACE;
      return { x0:f.x0, y0:f.y0, x1:f.x1, y1:f.y1, dx:f.dx, dy:f.dy, move:mv, dwell:f.dwell / PACE, phase:f.phase || 0, e:Math.max(0.2, Math.min(1.4, ve * mv / D)) }; }), turns:(H.turns || []).map(function(u){ return { x:u.x, y:u.y, r:u.r || 2, omega:(u.omega || 1.2) * PACE }; }),
    climbs:(H.climbs || []).slice(),
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
     own gentle slope; the drop between two rooms is crossed by a river, a jump or a ramp lane (climb). */
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
/* ================================================================= THE PUTT PUTT TOURS: 198 + 18 HOLES */
/* TWO TOURS. The Putt Putt Tour is everybody's: eleven worlds of eighteen, played strictly in order, on
   the game's own evergreen worlds (never a season's theme). The Members Tour is the Tour Pass holder's:
   eighteen holes on the season's theme, each with a trick of its own, paying the most. Anybody may walk it.

   Every hole is laid out here by hand, in feet, tee at the bottom and the cup toward the top, and no
   two share a layout. EVERY HOLE HAS SOMETHING TO PLAY: an obstacle, a puzzle or a clock. The set
   pieces are the engine's own (a loop the ball has to be quick enough to ride, a river that carries it
   down a level, a ramp lane up a level, a ramp jump over the hazard, a drawbridge on a clock, a turntable), and each
   world brings its own on top of the ones before it. Par is the solver's (golf/putt/solve.mjs): the
   fewest putts with room for error, plus one, never under 3. Every eighteenth hole is the world's
   signature hole. */
var PER = 18;
var WORLDS = [
  { id:'clubhouse', name:'The Clubhouse', theme:'clubhouse', blurb:'Practice greens behind the clubhouse.', haz:['Windmills', 'Loops', 'Drawbridges'] },
  { id:'school', name:'Schoolyard', theme:'school', blurb:'Recess is on. The creek, the doors and the merry-go-round.', haz:['The creek', 'Doors', 'Merry-go-rounds'] },
  { id:'candy', name:'Candy Works', theme:'candy', blurb:'The factory floor. Chocolate on every side and wafer bridges over it.', haz:['Chocolate', 'Wafer bridges', 'Jumps'] },
  { id:'neon', name:'Neon Arcade', theme:'neon', blurb:'Every machine on a clock. Read the lights.', haz:['Bumper cars', 'Loops', 'Belts'] },
  { id:'pirate', name:'Pirate Cove', theme:'pirate', blurb:'The sea on every side. Jump it, ride it, or go round.', haz:['The lagoon', 'Island hops', 'Everything'] },
  { id:'temple', name:'Lost Temple', theme:'temple', blurb:'Polished stone that never stops, vines that do.', haz:['Polished stone', 'Vines', 'Chasms'] },
  { id:'canyon', name:'Canyon Mine', theme:'canyon', blurb:'Ledges over the shafts. Ride the belts or jump the gap.', haz:['The shafts', 'Ore belts', 'Bounce pads'] },
  { id:'volcano', name:'Volcano Island', theme:'volcano', blurb:'Every rock on a clock. Read the lava.', haz:['Basalt gates', 'Bounce rocks', 'Lava'] },
  { id:'sky', name:'Sky Islands', theme:'sky', blurb:'Islands in the clouds. Hay to stop you, blimps to wait for.', haz:['The drop', 'Haystacks', 'Blimps'] },
  { id:'dino', name:'Dino Valley', theme:'dino', blurb:'Slick clay that runs on, swamp pools that keep it, logs on the roll.', haz:['Swamp pools', 'Slick clay', 'Rolling logs'] },
  { id:'iceage', name:'Ice Age', theme:'iceage', blurb:'Glacier ice, tar pits, and a herd that never stops.', haz:['Tar pits', 'Glacier ice', 'The herd'] }
];
// a room: a rectangle at a height (for the picture; the drop between rooms is crossed by a set piece)
function rm(x0, y0, x1, y1, z){ var a = Math.min(x0, x1), b = Math.max(x0, x1), c = Math.max(y0, y1), d = Math.min(y0, y1); return { pts:[[a, c], [b, c], [b, d], [a, d]], z:z || 0 }; }
function pg(pts, z){ return { pts:pts, z:z || 0 }; }
function hole(rooms, tee, cup){ var H = T_common(); H.polys = rooms.map(function(r){ return r.pts ? r : { pts:r, z:0 }; }); H.poly = H.polys[0].pts; H.tee = tee; H.cup = cup;
  H.rivers = []; H.loops = []; H.ramps = []; H.bridges = []; H.turns = []; H.ferries = []; return H; }
function rectP(w, L, x0){ x0 = x0 || 0; return [[x0 - w / 2, 0], [x0 + w / 2, 0], [x0 + w / 2, -L], [x0 - w / 2, -L]]; }
function lvH(poly, tee, cup){ var H = T_common(); H.poly = poly; H.tee = tee; H.cup = cup; return H; }
function bumps(H, T, list){ list.forEach(function(b){ addBumper(H, b[0], b[1], b[2] || 0.75, T.bumper); }); }
function pads(H, list){ list.forEach(function(b){ H.bumpers.push({ x:b[0], y:b[1], r:b[2] || 0.75, e:1.32, skin:'pad' }); }); }
function zoneR(H, m, x0, y0, x1, y1){ H.zones.push({ t:'rect', x0:x0, y0:y0, x1:x1, y1:y1, m:m }); }
function zoneC(H, m, x, y, r){ H.zones.push({ t:'circle', x:x, y:y, r:r, m:m }); }
function blk(H, T, x0, y0, x1, y1){ return addBlock(H, x0, y0, x1, y1, T.block); }
function board(H, T, ax, ay, bx, by, th){ return addBoard(H, ax, ay, bx, by, th, T.block); }
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
// a door on a switch (see doorOpen): shut across a gap in a wall until the ball rolls over its plate at (px, py)
function switchDoor(H, T, y, gx0, gx1, px, py, hold){ var w = gx1 - gx0, cx = (gx0 + gx1) / 2;
  H.movers.push({ k:'door', ax:cx, ay:y, bx:cx + w + 0.4, by:y, len:w + 0.3, ang:0, w:0.42, px:px, py:py, pr:0.7, hold:hold || 3.5, skin:T.slider }); }
// a wall across the course with one gap in it, and a gate in the gap
function gateWall(H, T, y, x0, x1, gx0, gx1, period, phase, dir){ blk(H, T, x0, y, gx0, y - 1.2); blk(H, T, gx1, y, x1, y - 1.2); gateAt(H, T, y - 0.6, gx0, gx1, period, phase, dir); }
function slider(H, T, y, x0, x1, period, phase, len){ H.movers.push({ k:'slide', ax:x0, ay:y, bx:x1, by:y, len:len || 2.4, ang:0, w:0.5, period:period, phase:phase || 0, skin:T.slider }); }
function vslider(H, T, x, y0, y1, period, phase, len){ H.movers.push({ k:'slide', ax:x, ay:y0, bx:x, by:y1, len:len || 2.4, ang:Math.PI / 2, w:0.5, period:period, phase:phase || 0, skin:T.slider }); }
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
/* a climb: an open lane up from one room to the next, from the lower room's edge at y0 to the upper room's
   edge at y1. The lane is a slope (a ridge), so a ball that is struck too softly rolls back down. It is what
   joins two tiers now: no tunnels, the way up is in plain sight. */
function climb(H, x, y0, y1, w, a){ var zl = 0, zh = 0;
  H.polys.forEach(function(p){ var xs = p.pts.map(function(q){ return q[0]; }), ys = p.pts.map(function(q){ return q[1]; });
    var inx = x >= Math.min.apply(null, xs) && x <= Math.max.apply(null, xs);
    if (inx && Math.abs(Math.max.apply(null, ys) - y1) < 0.6) zh = p.z || 0; if (inx && Math.abs(Math.min.apply(null, ys) - y0) < 0.6) zl = p.z || 0; });
  H.polys.push({ pts:rm(x - w / 2, y0 + 0.3, x + w / 2, y1 - 0.3).pts, z:(zl + zh) / 2 });
  (H.climbs = H.climbs || []).push({ x0:x - w / 2, x1:x + w / 2, y0:Math.min(y0, y1), y1:Math.max(y0, y1) });
  H.comps.push({ k:'ridge', x:x, y:(y0 + y1) / 2, nx:0, ny:-1, w:Math.abs(y0 - y1) * 0.35, a:a == null ? (zh >= zl ? 0.12 : -0.12) : a }); }
/* a kicker: a steep ramp that throws the ball, struck firmly and straight, over the next set piece. It is the
   long holes' secret line now, in plain sight: no tunnels. */
function kicker(H, x, y){ jump(H, x, y, 0, -1, 0.05, 1.6, { m:M.GREEN, h:0.9, ang:40, w:1.6 }); secret(H, x - 0.9, y - 0.3, x + 0.9, y + 0.9); }
function river(H, pts, w, vc, z0, z1){ H.rivers.push({ pts:pts, w:w || 1.6, vc:vc || 6, z0:z0 || 0, z1:z1 == null ? (z0 || 0) : z1 }); }
// a drawbridge over a gap of hazard: down (a deck) for duty of every period, up (the hazard) the rest
function drawb(H, x0, y0, x1, y1, period, phase, duty){ H.bridges.push({ x0:x0, y0:y0, x1:x1, y1:y1, period:period || 3.6, phase:phase || 0, duty:duty == null ? 0.5 : duty }); }
// a shallow bowl round the cup: a ball arriving a little off line or a little quick is gathered in. It is what
// lets a long secret line be a skill rather than a fluke (a degree of aim at 30 ft is wider than the cup).
function bowl(H, x, y, s, a){ H.comps.push({ k:'mound', x:x, y:y, s:s || 1.6, a:-(a || 0.1) }); }
// a ferry: its deck at dock A, the way to dock B, how long a crossing and a wait take (at the written speed), and where in its timetable it starts
function ferry(H, x0, y0, x1, y1, dx, dy, move, dwell, phase){ H.ferries.push({ x0:Math.min(x0, x1), y0:Math.min(y0, y1), x1:Math.max(x0, x1), y1:Math.max(y0, y1), dx:dx, dy:dy, move:move || 1.6, dwell:dwell || 1.2, phase:phase || 0 }); }
function disc(H, x, y, r, omega){ H.turns.push({ x:x, y:y, r:r || 2.2, omega:omega || 1.2 }); }
/* THE SECRET LINE. A hole can carry a shortcut: a shorter way to the cup that the layout does not
   advertise (a kicker ramp that throws a firm putt over the next set piece, a crack at the end of a wall that only a bank finds, a
   kicker that clears the water). secret(H, x0, y0, x1, y1) marks where it is. The solver plays the hole
   twice on the same carpet: once never letting the ball through a secret, which is THE OBVIOUS ROUTE and
   sets par (a birdie with room for error), and once free, which has to be strictly shorter and has to go
   through one. So every hole can be beaten the way it looks, and looking harder pays in strokes. */
function secret(H, x0, y0, x1, y1){ (H.secret = H.secret || []).push({ x0:Math.min(x0, x1), y0:Math.min(y0, y1), x1:Math.max(x0, x1), y1:Math.max(y0, y1) }); }
/* par is filled in by the solver (golf/putt/solve.mjs) and written here */
var LEVELS = [
  // ---- 1 THE CLUBHOUSE: aim and pace through the classics, and the first secret lines
  // First Tee: the classic dogleg. The cup is round the corner, and a bank board across the outside corner turns a putt up the leg toward it.
  { par:3, f:function(T){ var H = hole([rm(-3, 0, 3, -20.1), rm(-3, -14, 14, -20)], [0, -2.5], [11, -17]); board(H, T, -3, -16, 1, -20.1, 0.4); bumps(H, T, [[7.4, -15.2, 0.55]]); bowl(H, 11, -17); return H; } },
  // The Slope: a skewed lane on a hill. Play the break round the sand, two putts.
  { par:3, f:function(T){ var H = hole([pg([[-5, 0], [5, 0], [6.5, -30], [-3.5, -30]])], [-1.5, -2.5], [2.5, -26]); H.comps.push({ k:'plane', gx:0.028, gy:0 }); zoneC(H, M.SAND, -1, -16, 2); bumps(H, T, [[2.2, -14]]); flatAt(H, 2.5, -26);
    board(H, T, 4.56, -27.37, 1.01, -27.98, 0.35); bowl(H, 2.5, -26, 2.2, 0.15); return H; } },
  // Bank Shot: the diamond. A block sits square in the middle, so the line is off one of the angled walls and up to the top point.
  { par:3, f:function(T){ var H = hole([pg([[-2, 0], [2, 0], [8, -12], [2, -24], [-2, -24], [-8, -12]])], [0, -2.5], [0, -21.4]); blk(H, T, -2.6, -11.4, 2.6, -12.6); bumps(H, T, [[0, -17.4, 0.5]]); bowl(H, 0, -21.4); return H; } },
  // The Windmill: the apron narrows to the house the way every windmill hole does. The hay reaches the rails, so the only way past is through the door, when the sails let you.
  { par:3, f:function(T){ var H = hole([pg([[-4, 0], [4, 0], [7, -11], [7, -38], [-7, -38], [-7, -11]])], [0, -2.5], [0, -33]);
    millAt(H, T, -18, 7, 1.3); bumps(H, T, [[-2.8, -28.5, 0.5], [2.8, -28.5, 0.5]]); bowl(H, 0, -33, 1.4, 0.12); return H; } },
  // Sand Bar: blast it through the sand and putt out; a board across the far corner sends a long one back to the cup. The secret: off the right wall the ball crosses the trap on the one strip of carpet left in it.
  { par:3, f:function(T){ var H = hole([rm(-5, 0, 5, -30)], [0, -2.5], [-1.5, -25]); zoneR(H, M.SAND, -5, -14, 5, -17); zoneR(H, M.GREEN, 2.6, -14, 4.6, -17); secret(H, 2.6, -14, 4.6, -17); bumps(H, T, [[-3.2, -21, 0.55]]);
    board(H, T, 1.4, -30, 5, -26.4); bowl(H, -1.5, -25); return H; } },
  // Step Up: round the bumper and up the ramp lane to the top room, then putt out. The ace is firm up the lane and straight at the cup.
  { par:3, f:function(T){ var H = hole([rm(-5, 0, 5, -16), rm(-5, -20, 5, -34, 0.6)], [0, -2.5], [-2.5, -30]);
    climb(H, 2.6, -16, -20, 2.4); bumps(H, T, [[1.6, -10, 0.6]]); return H; } },
  // Slide Rule: time the slider through the wall, and past it two boards make a V that funnels the ball to the cup.
  { par:3, f:function(T){ var H = hole([rm(-4.5, 0, 4.5, -34)], [0, -2.5], [0, -30.4]); blk(H, T, -4.5, -14, -1.2, -15.2); blk(H, T, 1.2, -14, 4.5, -15.2);
    slider(H, T, -14.6, -2.6, 2.6, 2.8, 0, 1.8); board(H, T, -4.5, -21, -1.3, -27.4); board(H, T, 4.5, -21, 1.3, -27.4); bumps(H, T, [[1.7, -20.4, 0.5]]); bowl(H, 0, -30.4, 1.8, 0.13); return H; } },
  // Causeway: up the railed causeway to the island, then putt out. The secret: the kicker in front of the water skips the ball straight onto the island.
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -28)], [0, -2.5], [0, -17]); zoneR(H, M.WATER, -6, -11.06, 6, -25.5); zoneC(H, M.GREEN, 0, -17, 3); zoneR(H, M.GREEN, 2.2, -11, 4.4, -17);
    blk(H, T, 1.9, -11, 2.2, -16.2); blk(H, T, 4.4, -11, 4.7, -16.6); jump(H, -0.6, -11, 0, -1, 0.05, 2.2, { m:M.GREEN, h:0.9, ang:40 }); secret(H, -1.7, -10.3, 0.5, -11); bowl(H, 0, -17, 1.4, 0.12); blk(H, T, -1.8, -18.9, 1.8, -19.3); return H; } },
  // The Kicker: over the pond off the kicker into the landing court, whose cut corners bank a long jump back in. Then putt round the rock. The kicker is wide and the pond short, so a putt a little off line or a little soft lands dry; a firm one off the kicker's left side drops in the dish for an ace.
  { par:3, f:function(T){ var H = hole([rm(-5, 0, 5, -12), rm(-5, -11.9, 5, -15.1), pg([[-5, -15], [5, -15], [5, -26], [1, -30], [-1, -30], [-5, -26]])], [0, -2.5], [-1.8, -26]); jump(H, 0, -12, 0, -1, 2, 10, { w:5.2 }); bumps(H, T, [[2.2, -20.4, 0.65]]); bowl(H, -1.8, -26, 1.8, 0.13); return H; } },
  // First Loop: through the loop and putt out round the bumper.
  { par:3, f:function(T){ var H = hole([rm(-4, 0, 4, -12), pg([[-4, -12], [4, -12], [0.8, -15.6], [-0.8, -15.6]]), rm(-0.8, -15.5, 0.8, -19.5), rm(-4, -19.4, 4, -34)], [0, -2.5], [3.4, -32.2]);
    loopAt(H, 0, -17.5, 0, -1, 0.6, 1.6); bumps(H, T, [[-0.6, -27.6, 0.55]]); bowl(H, 3.4, -32.2, 1.8, 0.13); return H; } },
  // Two Gates: one bar shuttles between two side doors, so one is always open. Past the doors a long block hides the cup, and the angled corners bank the ball round it.
  { par:3, f:function(T){ var H = hole([rm(-5, 0, 5, -20.1), pg([[-5, -20], [5, -20], [5, -27], [2, -33], [-2, -33], [-5, -27]])], [0, -2.5], [0, -30.6]);
    blk(H, T, -5, -14, -4.6, -15.2); blk(H, T, -2.4, -14, 2.4, -15.2); blk(H, T, 4.6, -14, 5, -15.2);
    slider(H, T, -14.6, -3.5, 3.5, 3.6, 0, 2.3); blk(H, T, -2.6, -23.4, 2.6, -24.4); bowl(H, 0, -30.6); return H; } },
  // Conveyor: across the belt aiming off its push, then putt out.
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -34)], [0, -2.5], [-3, -29]); belt(H, -6, -14, 6, -19, 5, 0); bumps(H, T, [[2.4, -24, 0.7]]);
    board(H, T, -1.07, -30.55, -4.66, -30.84, 0.35); bowl(H, -3, -29, 2.2, 0.15); return H; } },
  // Drawbridge: a curb guards the moat, so only the bridge gets you across; time it and putt out round the bumper.
  { par:3, f:function(T){ var H = hole([rm(-4, 0, 4, -14), rm(-4, -13.9, 4, -17.1), rm(-4, -17, 4, -32)], [0, -2.5], [2.6, -29]); zoneR(H, M.WATER, -4, -14, 4, -17); drawb(H, -1.4, -14, 1.4, -17, 3.4, 0, 0.55); bumps(H, T, [[2.0, -23.4, 0.6]]); bowl(H, 2.6, -29, 1.8, 0.13);
    blk(H, T, 1.4, -13.3, 4, -13.9); blk(H, T, -4, -13.3, -1.4, -13.9); return H; } },
  // Spin Cycle: an octagon round the turning floor. Through the floor, or off the angled walls round it, and putt out.
  { par:3, f:function(T){ var H = hole([rm(-4, 0, 4, -9.1), pg([[-4, -9], [4, -9], [7, -12], [7, -20], [4, -23], [-4, -23], [-7, -20], [-7, -12]]), rm(-4, -22.9, 4, -32)], [0, -2.5], [-2, -28.5]);
    disc(H, 0, -16, 2.6, 1.3); bumps(H, T, [[0.2, -25.6, 0.5], [0, -10.6, 0.5]]); return H; } },
  // The Creek: ride the creek down to the lower green and putt out.
  { par:3, f:function(T){ var H = hole([rm(2, 0, 10, -14), rm(-9, -25, 1, -38, -1.5)], [6, -2.5], [-4, -34]); river(H, [[6, -13], [6, -18], [1, -22], [-4, -22], [-4, -26]], 1.8, 6, 0, -1.5); bumps(H, T, [[6, -8, 0.7], [-2.6, -30.5, 0.5]]); return H; } },
  // Double Mill: two windmills wall to wall, so the only way through is each door in turn, timed against its sails.
  { par:3, f:function(T){ var H = hole([rm(-7, 0, 7, -46)], [0, -2.5], [0, -42]);
    millAt(H, T, -12, 7, 1.4); millAt(H, T, -28, 7, -1.1); bumps(H, T, [[-2.8, -38.5, 0.5], [2.8, -38.5, 0.5]]); return H; } },
  // Loop the Pond: through the loop, over the drawbridge (the curb keeps a stray ball out of the moat), putt out.
  { par:3, f:function(T){ var H = hole([rm(-4, 0, 4, -10), pg([[-4, -10], [4, -10], [0.8, -13.5], [-0.8, -13.5]]), rm(-0.8, -13.4, 0.8, -17), rm(-5, -16.9, 5, -26), rm(-5, -25.9, 5, -28.6), rm(-5, -28.5, 5, -40)], [0, -2.5], [0.3, -35.8]);
    loopAt(H, 0, -15, 0, -1, 0.65, 1.6); zoneR(H, M.WATER, -5, -26, 5, -28.5); drawb(H, -1.4, -26, 1.4, -28.5, 3, 0.2, 0.55); blk(H, T, -5, -25.3, -1.4, -25.9); blk(H, T, 1.4, -25.3, 5, -25.9); bowl(H, 0.3, -35.8, 1.8, 0.13); return H; } },
  // Clubhouse Classic: up the ramp lane, the windmill, the drawbridge, then round the end of the last wall.
  // The moat is walled either side of the drawbridge, so a ball off line bounces back rather than sinking.
  { par:3, three:2, sig:true, f:function(T){ var H = hole([rm(-5, 0, 5, -12), rm(-6, -16, 6, -34, 0.6), rm(-6, -33.9, 6, -36.6, 0.6), rm(-6, -36.5, 6, -48, 0.6)], [0, -2.5], [-2, -44]);
    climb(H, -3, -12, -16, 2.4, 0.3); millAt(H, T, -28, 6, 1.3); zoneR(H, M.WATER, -1.4, -34, 1.4, -36.5); drawb(H, -1.4, -34, 1.4, -36.5, 3.6, 0.5, 0.55);
    blk(H, T, -6, -34, -1.4, -36.5); blk(H, T, 1.4, -34, 6, -36.5);
    blk(H, T, -6, -39.4, 1.8, -40); flatAt(H, -2, -44); return H; } },
  // ---- 2 SCHOOLYARD: recess. The creek behind the school, classroom doors on a clock, the merry-go-round and the sandbox.
  // Front Steps: up the front steps between the pillars, two putts.
  { par:3, f:function(T){ var H = hole([rm(-5, 0, 5, -34)], [0, -2.5], [0, -30]); H.comps.push({ k:'ramp', x0:0, y0:-11, ux:0, uy:-1, len:5, a:0.5 }); bumps(H, T, [[-2.2, -20], [2.2, -23.5], [-1.2, -26.6, 0.55]]); flatAt(H, 0, -30);
    board(H, T, 1.8, -31.7, -1.8, -31.7, 0.35); bowl(H, 0, -30, 2.2, 0.15); return H; } },
  // Storm Drain: down the drain channel to the lower field, and putt out round the post.
  { par:3, f:function(T){ var H = hole([rm(-10, 0, -2, -12), rm(1, -19, 11, -34, -1.2)], [-6, -2.5], [6.2, -31.4]); river(H, [[-6, -11.5], [-6, -16], [0, -18], [6, -16], [6, -20]], 1.8, 8, 0, -1.2); bumps(H, T, [[3.2, -25.5, 0.7], [-6, -7, 0.65], [9.4, -27.4, 0.5]]); bowl(H, 6.2, -31.4, 1.8, 0.13); return H; } },
  // Two Ramps: the wide ramp on the left is safe; putt out through the gap in the sandbox. The narrow ramp on the right lines up with the gap and the cup, for the ace.
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -14), rm(-6, -18, 6, -34, 0.8)], [0, -2.5], [3, -30]);
    climb(H, -3.6, -14, -18, 2.4); climb(H, 1.6, -14, -18, 1.3); zoneR(H, M.MUD, -6, -24, 6, -26.5); zoneR(H, M.GREEN, 0.8, -24, 2.6, -26.5); board(H, T, 4.97, -31.5, 1.39, -31.88, 0.35); bowl(H, 3, -30, 2.2, 0.15); return H; } },
  // Merry-Go-Round: through the merry-go-round and putt out past the post.
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -32)], [0, -2.5], [3, -28]); disc(H, 0, -16, 3, -1.1); blk(H, T, -6, -15, -3.2, -17); blk(H, T, 3.2, -15, 6, -17); bumps(H, T, [[0, -22.5, 0.6], [-2.5, -26.5, 0.55]]); bowl(H, 3, -28, 2.2, 0.15); return H; } },
  // Hall Maze: follow the halls, three putts. The secret: a slit in the middle wall lines up with both gaps, and a straight putt from the tee goes through all three.
  { par:4, f:function(T){ var H = hole([rm(-7, 0, 7, -42)], [5.5, -2.5], [2.6, -38]); blk(H, T, -7, -10, 3, -11.5); blk(H, T, -3, -20, 3.4, -21.5); blk(H, T, 4.4, -20, 7, -21.5); blk(H, T, -7, -29, 2, -30.5);
    secret(H, 3.4, -20, 4.4, -21.5); zoneR(H, M.MUD, -7, -14, -1, -16.5); zoneR(H, M.MUD, -7, -23.5, -2.5, -26); bumps(H, T, [[-1.2, -25.2, 0.6]]); return H; } },
  // Loop the Slide: round the slide's loop, time the classroom door, putt out.
  { par:3, f:function(T){ var H = hole([rm(-4, 0, 4, -11), pg([[-4, -11], [4, -11], [0.8, -14.6], [-0.8, -14.6]]), rm(-0.8, -14.5, 0.8, -18.8), rm(-4.5, -18.7, 4.5, -36)], [0, -2.5], [-0.3, -34.2]);
    loopAt(H, 0, -16.6, 0, -1, 0.75, 1.6); blk(H, T, -4.5, -25, -1.1, -26.2); blk(H, T, 1.1, -25, 4.5, -26.2); gateAt(H, T, -25.6, -1.1, 1.1, 3, 0.3, 1); bowl(H, -0.3, -34.2, 1.4, 0.12); return H; } },
  // Water Slide: down the water slide onto the merry-go-round, putt out.
  { par:3, f:function(T){ var H = hole([rm(-5, 0, 5, -10), rm(-6, -21, 6, -36, -2)], [0, -2.5], [4.6, -32]); river(H, [[0, -9.5], [0, -14], [-2, -18], [0, -22]], 2, 7, 0, -2); gateWall(H, T, -26.4, -6, 6, 1.2, 4.2, 3.2, 0.2, 1); bumps(H, T, [[-3, -31, 0.6]]); bowl(H, 4.6, -32, 1.8, 0.13); return H; } },
  // Dodgeball: three dodgeballs across the gym, two putts.
  { par:3, f:function(T){ var H = hole([rm(-4.5, 0, 4.5, -40)], [0, -2.5], [0, -36]); slider(H, T, -12, -3, 3, 2.2, 0); slider(H, T, -20, 3, -3, 2.6, 0.3); slider(H, T, -28, -3, 3, 3.0, 0.6); bumps(H, T, [[2, -33, 0.5]]); bowl(H, 0, -36, 1.8, 0.13); return H; } },
  // Hall Monitor: up the hall and left past the monitor's desk, two putts.
  { par:3, three:2, f:function(T){ var H = hole([rm(-4, 0, 4, -24), rm(-18, -16, -3.9, -24)], [0, -2.5], [-15, -20]); bumps(H, T, [[-1.4, -19.2, 0.7], [-6.5, -21.5, 0.6], [-10, -18.2, 0.6]]); H.comps.push({ k:'plane', gx:0, gy:0.01 });
    return H; } },
  // Classroom Doors: two doors on their own clocks, round the post, two putts.
  { par:3, f:function(T){ var H = hole([rm(-5, 0, 5, -40)], [0, -2.5], [3.6, -36]); gateWall(H, T, -12, -5, 5, 0, 2.2, 3.4, 0, -1); gateWall(H, T, -22, -5, 5, 1.05, 3.25, 3.4, 0.75, 1); bumps(H, T, [[-1.4, -29, 0.7]]); zoneR(H, M.MUD, -5, -31, -2, -33); bowl(H, 3.6, -36, 1.8, 0.13); return H; } },
  // Creek Run: ride the creek behind the school down to the lower field, putt out.
  { par:3, f:function(T){ var H = hole([rm(-12, 0, -4, -10), rm(2, -30, 12, -42, -1.6)], [-8, -2.5], [8.3, -38.2]); river(H, [[-8, -9.5], [-8, -15], [-2, -18], [-8, -22], [-2, -26], [6, -26], [7, -30.5]], 1.7, 6.5, 0, -1.6); bumps(H, T, [[5, -35, 0.6]]); slider(H, T, -34.2, 4.6, 11.4, 2.6, 0.3, 3.2); bowl(H, 8.3, -38.2, 1.8, 0.13); return H; } },
  // Spinning Tops: two merry-go-rounds, two putts.
  { par:3, f:function(T){ var H = hole([rm(-5.5, 0, 5.5, -40)], [0, -2.5], [0, -36]); disc(H, 0, -13, 2.4, 1.4); disc(H, 0, -26, 2.4, -1.4); blk(H, T, -5.5, -12, -2.6, -14); blk(H, T, 2.6, -12, 5.5, -14); blk(H, T, -5.5, -25, -2.6, -27); blk(H, T, 2.6, -25, 5.5, -27); bumps(H, T, [[-1.8, -33, 0.5]]); bowl(H, 0, -36, 2.0, 0.14); return H; } },
  // Long Jump: over the ditch and through the gap in the sandbox, two putts.
  { par:3, f:function(T){ var H = hole([rm(-4.5, 0, 4.5, -12), rm(-4.5, -11.9, 4.5, -14.3), rm(-4.5, -14.2, 4.5, -32)], [0, -2.5], [-3.1, -24.6]); jump(H, 0, -12, 0, -1, 2.2, 9); zoneR(H, M.MUD, -4.5, -18, 4.5, -20.5); zoneR(H, M.GREEN, -3.4, -18, -1.6, -20.5); bowl(H, -3.1, -24.6, 1.8, 0.13); return H; } },
  // Bleachers: the wide ramp on the right climbs to the far side of the bleachers, two putts. The narrow ramp on the left runs at a post.
  { par:3, three:2, f:function(T){ var H = hole([rm(-7, 0, 7, -14), rm(-7, -18, 7, -34, 0.8)], [0, -2.5], [-4, -30]);
    climb(H, 3.5, -14, -18, 2.6); climb(H, -4.6, -14, -18, 1.3); zoneR(H, M.MUD, -1.5, -22, 2.5, -25); bumps(H, T, [[-1.6, -28.6, 0.55], [-4.6, -23.5, 0.6]]); return H; } },
  // Field Trip: through the loop, round the wall, down the creek, three putts.
  { par:4, three:3, f:function(T){ var H = hole([rm(-4, 0, 4, -10), pg([[-4, -10], [4, -10], [0.8, -13.6], [-0.8, -13.6]]), rm(-0.8, -13.5, 0.8, -17.8), rm(-4, -17.7, 4, -24), rm(-2, -32, 10, -44, -1.6)], [0, -2.5], [6, -40]);
    loopAt(H, 0, -15.6, 0, -1, 0.75, 1.6); river(H, [[2, -23.5], [4, -27], [4, -32.5]], 1.8, 6, 0, -1.6); blk(H, T, -4, -21.5, -1, -23); bumps(H, T, [[0.6, -21, 0.7]]);
    bowl(H, 6, -40, 1.8, 0.13); return H; } },
  // Crossing Guard: two crossings on two clocks over the ditch. A curb guards each side, so only a crossing gets you over.
  { par:3, f:function(T){ var H = hole([rm(-4.5, 0, 4.5, -12), rm(-4.5, -11.9, 4.5, -14.6), rm(-4.5, -14.5, 4.5, -24), rm(-4.5, -23.9, 4.5, -26.6), rm(-4.5, -26.5, 4.5, -38)], [0, -2.5], [1.9, -33.8]);
    zoneR(H, M.WATER, -4.5, -12, 4.5, -14.5); drawb(H, -1.5, -12, 1.5, -14.5, 3.2, 0, 0.55); zoneR(H, M.WATER, -4.5, -24, 4.5, -26.5); drawb(H, 0.3, -24, 3, -26.5, 2.8, 0.4, 0.5);
    blk(H, T, -4.5, -11.4, -1.5, -12); blk(H, T, 1.5, -11.4, 4.5, -12); blk(H, T, -4.5, -23.4, 0.3, -24); blk(H, T, 3, -23.4, 4.5, -24); bowl(H, 1.9, -33.8, 1.8, 0.13); return H; } },
  // Recess Rush: the windmill, the merry-go-round and the dodgeball. Timed right it is an ace straight through all three.
  { par:3, f:function(T){ var H = hole([rm(-5, 0, 5, -46)], [0, -2.5], [0, -42]); millAt(H, T, -14, 5, 1.5); disc(H, 0, -25.5, 2.3, -1.3); blk(H, T, -5, -24.5, -2.5, -26.5); blk(H, T, 2.5, -24.5, 5, -26.5); slider(H, T, -33, -3.2, 3.2, 2.6, 0.2); bowl(H, 0, -42, 1.3, 0.12); return H; } },
  // Last Bell: up the steep ramp lane, the merry-go-round, the creek and the loop.
  { par:3, three:2, sig:true, f:function(T){ var H = hole([rm(-5, 0, 5, -12), rm(-7, -16, 3, -26, 0.8), rm(4, -32, 14, -38, -1.2), pg([[6, -38], [12, -38], [9.8, -41.6], [8.2, -41.6]], -1.2), rm(8.2, -41.5, 9.8, -45.5, -1.2), rm(3, -45.4, 15, -58, -1.2)], [0, -2.5], [9, -54]);
    climb(H, -3.5, -12, -16, 2.4, 0.3); disc(H, -2, -21, 2.2, 1.3); river(H, [[1.5, -24.5], [5, -26], [8, -29], [8, -33]], 1.7, 6.5, 0.8, -1.2);
    loopAt(H, 9, -43.5, 0, -1, 0.75, 1.6); bumps(H, T, [[6, -50, 0.6]]); flatAt(H, 9, -54); return H; } },
  // ---- 3 CANDY WORKS: the factory floor. Chocolate on every side, wafer bridges on a clock, and jumps over the vats.
  // Wafer Plank: a curb guards the chocolate, so time the wafer and putt out.
  { par:3, f:function(T){ var H = hole([rm(-5, 0, 5, -13), rm(-5, -12.9, 5, -16.6), rm(-5, -16.5, 5, -32)], [0, -2.5], [2, -28]); zoneR(H, M.WATER, -5, -13, 5, -16.5); drawb(H, -1.3, -13, 1.3, -16.5, 3.4, 0, 0.55); bumps(H, T, [[-2.5, -22, 0.7], [-3.1, -7.4, 0.5]]);
    blk(H, T, -5, -12.4, -1.3, -13); blk(H, T, 1.3, -12.4, 5, -13); return H; } },
  // Gumdrop Row: thread the gumdrops, two putts.
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -32)], [0, -2.5], [-2.5, -28.5]); bumps(H, T, [[-1, -12], [1.5, -14.2], [-2.6, -16], [0.6, -18.5], [3, -21]]); zoneC(H, M.SAND, 2.6, -27, 1.8); return H; } },
  // Loading Dock: up the ramp onto the dock, round the rail, putt out.
  { par:3, three:2, f:function(T){ var H = hole([rm(-5, 0, 5, -14), rm(-7, -18, 7, -34, 0.8)], [0, -2.5], [-4, -32]); blk(H, T, -7, -25, 2.4, -26.4);
    climb(H, 3, -14, -18, 2.4); bumps(H, T, [[5.2, -31.5, 0.7]]); bowl(H, -4, -32, 1.8, 0.13); bumps(H, T, [[-5.5, -20.5, 0.6]]); return H; } },
  // Candy Cane Walk: along the railed walk, past the whisk, putt out.
  { par:3, f:function(T){ var H = hole([rm(-5, 0, 5, -36)], [0, -2.5], [0, -32]); zoneR(H, M.WATER, -5, -11, 5, -26); zoneR(H, M.GREEN, -1.2, -11, 1.2, -26); slider(H, T, -18.5, -3, 3, 3.2, 0, 1.5);
    blk(H, T, -1.5, -11, -1.2, -17.4); blk(H, T, 1.2, -11, 1.5, -17.4); blk(H, T, -1.5, -19.6, -1.2, -26); blk(H, T, 1.2, -19.6, 1.5, -26); bowl(H, 0, -32, 1.8, 0.13); return H; } },
  // Fondue: the chocolate pulls out to the vats on both sides, but the curbs hold the ball; across, then putt out.
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -34)], [0, -2.5], [0, -30]); zoneR(H, M.WATER, -6, -12, -3.9, -24); zoneR(H, M.WATER, 3.9, -12, 6, -24); belt(H, -3.6, -12, 0, -24, -3, 0); belt(H, 0, -12, 3.6, -24, 3, 0);
    blk(H, T, -3.9, -12, -3.6, -24); blk(H, T, 3.6, -12, 3.9, -24); bowl(H, 0, -30, 1.8, 0.13); bumps(H, T, [[4, -21, 0.6]]); return H; } },
  // Bonbon Hop: two hops over the chocolate, putt out past the gumdrop.
  { par:3, three:2, f:function(T){ var H = hole([rm(-4, 0, 4, -10), rm(-4, -9.9, 4, -12.2), rm(-4, -12.1, 4, -18), rm(-4, -17.9, 4, -20.4), rm(-4, -20.3, 4, -32)], [0, -2.5], [0, -28]);
    jump(H, 0, -10, 0, -1, 2.1, 8); jump(H, 0, -18, 0, -1, 2.2, 8); bumps(H, T, [[2, -15.3, 0.6]]);
    bowl(H, 0, -28, 1.8, 0.13); return H; } },
  // Candy Loop: up through the loop, putt out round the lollipops.
  { par:3, f:function(T){ var H = hole([rm(-4.5, 0, 4.5, -11), pg([[-4.5, -11], [4.5, -11], [0.8, -14.8], [-0.8, -14.8]]), rm(-0.8, -14.7, 0.8, -19), rm(-5, -18.9, 5, -34)], [0, -2.5], [0, -32.2]);
    loopAt(H, 0, -16.8, 0, -1, 0.8, 1.6); bumps(H, T, [[1.8, -24, 0.7], [-2.6, -28.5, 0.6]]); bowl(H, 0, -32.2, 1.8, 0.13); return H; } },
  // Sugar Rush: zig and zag up the floor, two putts.
  { par:3, three:2, f:function(T){ var H = hole([rm(-7, 0, 7, -38)], [-4.5, -2.5], [4.5, -34]); blk(H, T, -7, -11, 2.5, -12.6); blk(H, T, -2.5, -21, 7, -22.6); blk(H, T, -7, -30, 2.5, -31.6);
    zoneC(H, M.SAND, 4.6, -17, 1.3); zoneC(H, M.SAND, -4.6, -26, 1.3); bumps(H, T, [[-5.5, -37, 0.6]]); return H; } },
  // Spill: the curb keeps you out of the vat; over the bridge, through the spill, putt out.
  { par:3, three:2, f:function(T){ var H = hole([rm(-6, 0, 6, -14), rm(-6, -13.9, 6, -17.6), rm(-6, -17.5, 6, -36)], [0, -2.5], [-3, -32]); zoneR(H, M.WATER, -6, -14, 6, -17.5); drawb(H, 1.8, -14, 4.4, -17.5, 3.0, 0.3, 0.55);
    blk(H, T, -6, -13.4, 1.8, -14); blk(H, T, 4.4, -13.4, 6, -14); bumps(H, T, [[0, -24], [-2.4, -26.5, 0.6], [2.4, -26.5, 0.6], [-4.2, -29.5, 0.6]]); return H; } },
  // Two Chutes: the wide chute on the left onto the line, then putt out. The narrow one in the middle is aimed at the cup.
  { par:3, three:2, f:function(T){ var H = hole([rm(-7, 0, 7, -14), pg([[-8, -18], [8, -18], [8, -30], [4, -35], [-8, -35]], 0.8)], [0, -2.5], [4, -30]);
    climb(H, -4.5, -14, -18, 2.4); climb(H, 0.6, -14, -18, 1.3); bumps(H, T, [[1.6, -26.2, 0.55]]); zoneR(H, M.SAND, -7, -24, -1, -28); return H; } },
  // Cake Stand: off the kicker onto the stand, railed at the back and both sides so a long or wide one stays up, putt out.
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -34)], [0, -2.5], [0, -21.5]); zoneR(H, M.WATER, -6, -14.4, 6, -31); zoneR(H, M.GREEN, -3, -15.4, 3, -26.6); H.ramps.push({ x:0, y:-14, dx:0, dy:-1, w:12, h:0.45, ang:30, len:1.8 }); H.comps.push({ k:'mound', x:0, y:-21.5, s:2.4, a:-0.14 });
    blk(H, T, -3, -26, 3, -26.6); blk(H, T, -3.3, -15.4, -3, -26.6); blk(H, T, 3, -15.4, 3.3, -26.6); return H; } },
  // Twin Whisks: under two whisks turning, two putts.
  { par:3, f:function(T){ var H = hole([rm(-4, 0, 4, -38)], [0, -2.5], [0, -34]); spinner(H, T, 0, -14, 2.4, 1.6, 2); spinner(H, T, 0, -24, 2.4, -1.3, 3); bowl(H, 0, -34, 1.8, 0.13); return H; } },
  // Toffee Bridges: two wafer bridges on two clocks, curbs on both vats, putt out. The secret: a firm putt banks off the far rail and drops.
  { par:3, f:function(T){ var H = hole([rm(-5, 0, 5, -11), rm(-5, -10.9, 5, -13.6), rm(-5, -13.5, 5, -22), rm(-5, -21.9, 5, -24.6), rm(-5, -24.5, 5, -36)], [0, -2.5], [2, -32]);
    zoneR(H, M.WATER, -5, -11, 5, -13.5); drawb(H, -1, -11, 1.6, -13.5, 2.8, 0, 0.55); zoneR(H, M.WATER, -5, -22, 5, -24.5); drawb(H, 0.3, -22, 2.9, -24.5, 2.8, 0.6, 0.55);
    blk(H, T, -5, -10.4, -1, -11); blk(H, T, 1.6, -10.4, 5, -11); blk(H, T, -5, -21.4, 0.3, -22); blk(H, T, 2.9, -21.4, 5, -22); bowl(H, 2, -32, 1.8, 0.13); secret(H, 0.7, -35.1, 2.3, -36.7); return H; } },
  // Chocolate River: ride the river to the end of the line, putt out past the gumdrop.
  { par:3, f:function(T){ var H = hole([rm(-12, 0, -4, -10), rm(-6, -28, 6, -40, -0.8)], [-8, -2.5], [-5.6, -36.2]); river(H, [[-8, -9.5], [-8, -16], [0, -20], [8, -16], [8, -24], [3, -28.5]], 2, 7, 0, -0.8); zoneR(H, M.WATER, -6, -28, -2, -32); bumps(H, T, [[2, -33, 0.6]]); spinner(H, T, -1.6, -33.7, 1.8, 1.4, 2);  return H; } },
  // Stamping Press: two presses and two gates, two putts.
  { par:3, three:2, f:function(T){ var H = hole([rm(-5, 0, 5, -42)], [0, -2.5], [0, -38]); slider(H, T, -10, -3.2, 3.2, 2.4, 0); blk(H, T, -5, -18, -1.2, -19.2); blk(H, T, 1.2, -18, 5, -19.2); gateAt(H, T, -18.6, -1.2, 1.2, 3, 0.2, 1);
    slider(H, T, -26, 3.2, -3.2, 2.0, 0.4); gateWall(H, T, -32, -5, 5, 1, 3.4, 3.4, 0.7, -1); bowl(H, 0, -38); return H; } },
  // Double Dip: two short hops over the chocolate, putt out.
  { par:3, three:2, f:function(T){ var H = hole([rm(-4, 0, 4, -10), rm(-4, -9.9, 4, -12.1), rm(-4, -12, 4, -16), rm(-4, -15.9, 4, -18.3), rm(-4, -18.2, 4, -32)], [0, -2.5], [-1.5, -28]);
    jump(H, 0, -10, 0, -1, 2.0, 8); jump(H, 0, -16, 0, -1, 2.2, 8, { h:0.6, ang:34 });
    bowl(H, -1.5, -28, 1.8, 0.13); return H; } },
  // Popping Candy: through the poppers, which kick, past the two vats, two putts.
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -36)], [0, -2.5], [0, -32]); H.bumpers.push({ x:-2.4, y:-12, r:0.8, e:1.3, skin:'barrel' }, { x:2.4, y:-16, r:0.8, e:1.3, skin:'barrel' }, { x:-1, y:-21, r:0.8, e:1.3, skin:'barrel' }, { x:3, y:-25, r:0.7, e:1.3, skin:'barrel' });
    zoneR(H, M.WATER, -6, -27.5, -2.5, -29.5); zoneR(H, M.WATER, 2.5, -27.5, 6, -29.5); blk(H, T, -2.8, -27.5, -2.5, -29.5); blk(H, T, 2.5, -27.5, 2.8, -29.5); bowl(H, 0, -32, 1.8, 0.13); return H; } },
  // Head Office: the ramp lane, the wafer plank, the jump and the loop.
  { par:4, three:3, sig:true, f:function(T){ var H = hole([rm(-5, 0, 5, -12), rm(-6, -16, 6, -26, 0.8), rm(-6, -25.9, 6, -28.6, 0.8), rm(-6, -28.5, 6, -38, 0.8), rm(-6, -37.9, 6, -40.6, 0.8), rm(-6, -40.5, 6, -48, 0.8), pg([[-6, -48], [6, -48], [0.8, -51.6], [-0.8, -51.6]], 0.8), rm(-0.8, -51.5, 0.8, -55.8, 0.8), rm(-6, -55.7, 6, -68, 0.8)], [0, -2.5], [0, -64]);
    climb(H, -3, -12, -16, 2.4); zoneR(H, M.WATER, -6, -26, 6, -28.5); drawb(H, -1.3, -26, 1.3, -28.5, 3.2, 0.25, 0.55);
    blk(H, T, -6, -25.4, -1.3, -26); blk(H, T, 1.3, -25.4, 6, -26); jump(H, 0, -38, 0, -1, 2.3, 12); loopAt(H, 0, -53.6, 0, -1, 0.75, 1.6); bumps(H, T, [[-3, -60, 0.6], [3, -60, 0.6]]); flatAt(H, 0, -64); return H; } },
  // ---- 4 NEON ARCADE: every machine on a clock. Bumper cars, loops, belts and the glitch pools.
  // Insert Coin: pick a way through the bumpers, two putts.
  { par:3, three:2, f:function(T){ var H = hole([rm(-6, 0, 6, -34)], [0, -2.5], [2, -30]); bumps(H, T, [[3.7, -5.6, 0.5], [-1.4, -11, 0.85], [2.2, -15, 0.8], [-2.6, -19.5, 0.8], [1, -23.5, 0.8], [3.4, -27.4, 0.6], [2.2, -26.7, 0.7], [3.3, -30.3, 0.55]]); zoneR(H, M.MUD, -6, -26, -1, -30); H.comps.push({ k:'plane', gx:-0.015, gy:0 }); return H; } },
  // Laser Gate: a laser slides across the gap in the wall, then the one clean gap in the static.
  { par:3, f:function(T){ var H = hole([rm(-4.5, 0, 4.5, -36)], [0, -2.5], [0, -32]); blk(H, T, -4.5, -15, -1.4, -16.4); blk(H, T, 1.4, -15, 4.5, -16.4); slider(H, T, -15.7, -2.8, 2.8, 3.2, 0, 1.6); zoneR(H, M.MUD, -4.5, -22, 4.5, -24); zoneR(H, M.GREEN, -1, -22, 1, -24); bowl(H, 0, -32, 1.8, 0.13); return H; } },
  // Level Up: up the ramp lane to the top floor, round the wall, putt out.
  { par:3, three:2, f:function(T){ var H = hole([rm(-5, 0, 5, -14), rm(-7, -18, 7, -34, -2)], [0, -2.5], [-3, -30]); climb(H, 3.4, -14, -18, 2.4); blk(H, T, -7, -24, 3, -25.4); zoneC(H, M.MUD, 1.2, -29.5, 1.1); return H; } },
  // Hover Deck: the tee strip ends at the glitch. Roll onto the hover deck while it waits, ride it across, and it puts you down by the cup strip.
  { par:3, three:2, f:function(T){ var H = hole([rm(-8, 0, -2, -20.1), rm(-8, -19.9, 14, -24.1), rm(6, -23.9, 14, -44)], [-5, -2.5], [10, -40]); zoneR(H, M.WATER, -8, -20, 6, -24);
    ferry(H, -8, -19.6, -3.6, -24, 10, 0, 2.2, 1.5, 0); bumps(H, T, [[8, -32, 0.6], [12, -28, 0.55]]); zoneR(H, M.MUD, 6, -42, 8, -44); bowl(H, 10, -40, 1.7, 0.12); return H; } },
  // Loop de Loop: through the loop, then the one clean gap in the static.
  { par:3, f:function(T){ var H = hole([rm(-4, 0, 4, -11), pg([[-4, -11], [4, -11], [0.8, -14.6], [-0.8, -14.6]]), rm(-0.8, -14.5, 0.8, -19.2), rm(-4.5, -19.1, 4.5, -36)], [0, -2.5], [0, -32]);
    loopAt(H, 0, -16.8, 0, -1, 0.9, 1.6); zoneR(H, M.MUD, -4.5, -24, 4.5, -26.5); zoneR(H, M.GREEN, -0.9, -24, 0.9, -26.5); bowl(H, 0, -32, 1.8, 0.13); return H; } },
  // Neon River: ride the stream down, through the gate, past the turning floor.
  { par:3, f:function(T){ var H = hole([rm(-4, 0, 4, -10), rm(-5, -24, 7, -38, -2)], [0, -2.5], [-1.6, -34.6]); river(H, [[0, -9.5], [0, -14], [3, -17], [3, -21], [0, -24.5]], 1.7, 8, 0, -2); gateWall(H, T, -27.2, -5, 7, -3.8, -0.8, 3.0, 0.3, -1); disc(H, 3.6, -33, 2, 1.5); bowl(H, -1.6, -34.6, 1.8, 0.13); return H; } },
  // Warp Zone: up, right, up the far side and back, three putts. The secret: the kicker at the top of the first switchback jumps the gap straight into the last one.
  { par:4, f:function(T){ var H = hole([rm(-4, 0, 4, -16), rm(-4, -12, 14, -20), rm(10, -12, 18, -36), rm(-2, -24, 14, -36)], [0, -2.5], [2, -32]); zoneR(H, M.MUD, 10, -20, 18, -22.5); zoneR(H, M.MUD, 14, -27, 18, -29.5); bumps(H, T, [[11, -16, 0.6], [11, -32, 0.6]]);
    jump(H, 1, -19.7, 0, -1, 0.05, 2.4, { m:M.GREEN, h:0.9, ang:40 }); secret(H, -0.3, -19.1, 2.3, -20); bowl(H, 2, -32); return H; } },
  // Elevator: roll onto the lift at the bottom of the shaft. It carries you up, stops hard at the top, and you roll off onto the top floor.
  { par:3, three:2, f:function(T){ var H = hole([rm(-8, 0, -2, -12), rm(-2.1, -6, 3, -30.1), rm(-8, -29.9, 8, -48)], [-5, -2.5], [4, -43]); zoneR(H, M.WATER, -2, -6, 3, -30);
    ferry(H, -2.4, -6, 3, -10.4, 0, -20, 4.0, 1.5, 0); bumps(H, T, [[-4, -40, 0.6], [6, -36, 0.55]]); zoneR(H, M.MUD, -8, -46, -4, -48); bowl(H, 4, -43, 1.7, 0.12); return H; } },
  // Ramp Jump: off the ramp over the glitch pool, round the post, putt out.
  { par:3, f:function(T){ var H = hole([rm(-4.5, 0, 4.5, -12), rm(-4.5, -11.9, 4.5, -15), rm(-4.5, -14.9, 4.5, -32)], [0, -2.5], [0.6, -25.4]); jump(H, 0, -12, 0, -1, 2.9, 9, { h:0.6, ang:36 }); bumps(H, T, [[-1.8, -22, 0.6]]); zoneR(H, M.WATER, 2.4, -24, 4.5, -27); bowl(H, 0.6, -25.4, 1.2, 0.1); return H; } },
  // Shutter Doors: two shutters on their clocks, round the cabinet, two putts.
  { par:3, three:2, f:function(T){ var H = hole([rm(-5, 0, 5, -40)], [0, -2.5], [-2, -36]); blk(H, T, -5, -13, -0.9, -14.4); blk(H, T, 0.9, -13, 5, -14.4); bowl(H, -2, -36); gateAt(H, T, -13.7, -0.9, 0.9, 2.6, 0, 1); blk(H, T, -5, -24, 1.4, -25.4); blk(H, T, 3.4, -24, 5, -25.4); gateAt(H, T, -24.7, 1.4, 3.4, 3.2, 0.5, -1); bumps(H, T, [[0, -30, 0.7]]); return H; } },
  // Top Floor: up two ramp lanes, one each side, to the top floor.
  { par:3, three:2, f:function(T){ var H = hole([rm(-6, 0, 6, -14), rm(-6, -18, 6, -28, -1.2), rm(-6, -32, 6, -44, -2.6)], [0, -2.5], [3, -38.4]);
    climb(H, -3, -14, -18, 2.2); climb(H, 2.6, -28, -32, 2.2); bumps(H, T, [[-1, -37, 0.6]]);  return H; } },
  // Conveyor Combo: across the belt, then ride the stream down, putt out round the post.
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -14), rm(-7, -26, 7, -40, -1.4)], [0, -2.5], [-4, -36]); belt(H, -6, -6, 6, -11, 4, 0); river(H, [[4.5, -13.5], [4.5, -20], [0, -23], [-3, -26.5]], 1.7, 7, 0, -1.4); bumps(H, T, [[0, -31, 0.7]]); bowl(H, -4, -36, 1.8, 0.13); return H; } },
  // Platform Jump: off the jump pad over the glitch, and come down on the platform as it slides past. It carries you to the right dock.
  { par:3, three:2, f:function(T){ var H = hole([rm(-3, 0, 3, -14.1), rm(-8, -13.9, 12, -19.1), rm(6, -18.9, 12, -38)], [0, -2.5], [9, -34]); zoneR(H, M.WATER, -8, -14, 6, -19);
    jump(H, 0, -13.5, 0, -1, 0.05, 2.4, { m:M.GREEN, h:0.5, ang:30 }); blk(H, T, -3, -12.9, -1.2, -14.1); blk(H, T, 1.2, -12.9, 3, -14.1);
    ferry(H, -8, -13.6, -3.6, -19, 10, 0, 2.2, 1.2, 0.3); bumps(H, T, [[2, -7, 0.6], [7.5, -27, 0.6]]); bowl(H, 9, -34, 1.7, 0.12); return H; } },
  // Double Loop: angle up into the loop lane on the right, one pace for both loops, then round the prize shelf to the
  // cup tucked in the far left corner. Not a straight putt (the owner, 2026-10-19): the tee is off the lane's line and
  // the cup is off its exit.
  { par:3, three:2, f:function(T){ var H = hole([rm(-6, 0, 6, -10), pg([[-6, -10], [6, -10], [4.2, -13.6], [2, -13.6]]), rm(2, -13.5, 4.2, -24), rm(-6, -23.9, 6, -36)], [-3.5, -2.5], [-3.5, -33]);
    loopAt(H, 3.1, -15.6, 0, -1, 0.7, 1.6); loopAt(H, 3.1, -20.5, 0, -1, 0.7, 1.6); blk(H, T, -6, -27.6, 0.6, -28.8); bumps(H, T, [[2, -31.5, 0.6]]); return H; } },
  // Pac Maze: zig and zag through the maze past the ghosts, two putts.
  { par:3, three:2, f:function(T){ var H = hole([pg([[-3, 0], [3, 0], [3, -10], [8, -16], [8, -26], [2, -32], [2, -40], [-4, -40], [-4, -30], [2, -24], [2, -18], [-3, -12]])], [0, -2.5], [-1, -36]);
    bumps(H, T, [[0.5, -14.5, 0.55], [5, -21, 0.6], [-1, -29, 0.55]]); zoneR(H, M.MUD, 2, -22, 8, -24);
    bowl(H, -1, -36, 1.3, 0.12); return H; } },
  // Glitch Bridges: two bridges over the glitch on two clocks, a car between them.
  { par:3, f:function(T){ var H = hole([rm(-5, 0, 5, -13), rm(-5, -12.9, 5, -16.1), rm(-5, -16, 5, -26), rm(-5, -25.9, 5, -29.1), rm(-5, -29, 5, -40)], [0, -2.5], [0, -36]);
    zoneR(H, M.WATER, -5, -13, 5, -16); drawb(H, -1.3, -13, 1.3, -16, 2.6, 0, 0.5); zoneR(H, M.WATER, -5, -26, 5, -29); drawb(H, -1.3, -26, 1.3, -29, 2.6, 0.5, 0.5); slider(H, T, -21, -3.2, 3.2, 2.2, 0.2);
    blk(H, T, -5, -12.4, -1.3, -13); blk(H, T, 1.3, -12.4, 5, -13); blk(H, T, -5, -25.4, -1.3, -26); blk(H, T, 1.3, -25.4, 5, -26); board(H, T, -1.8, -37.6, 1.8, -37.6); bowl(H, 0, -36, 2.2, 0.16); return H; } },
  // Speed Run: cars and gates, two of each, two putts.
  { par:3, three:2, f:function(T){ var H = hole([rm(-5, 0, 5, -44)], [0, -2.5], [0, -40]); slider(H, T, -10, -3.2, 3.2, 2.0, 0); gateWall(H, T, -16, -5, 5, -1.1, 1.1, 2.4, 0.3, 1); slider(H, T, -24, 3.2, -3.2, 2.4, 0.5); gateWall(H, T, -30, -5, 5, -1.1, 1.1, 2.8, 0.1, -1); slider(H, T, -36, -3.2, 3.2, 2.8, 0.7); bowl(H, 0, -40, 1.3, 0.12); return H; } },
  // Grand Prize: up the ramp lane, across the belt, round the loop, and over the jump.
  { par:4, three:3, sig:true, f:function(T){ var H = hole([rm(-5, 0, 5, -12), rm(-6, -16, 6, -28, -1.4), pg([[-6, -28], [6, -28], [0.8, -31.6], [-0.8, -31.6]], -1.4), rm(-0.8, -31.5, 0.8, -35.8, -1.4), rm(-5, -35.7, 5, -44, -1.4), rm(-5, -43.9, 5, -47, -1.4), rm(-5, -46.9, 5, -60, -1.4)], [0, -2.5], [1.5, -56]);
    climb(H, 3, -12, -16, 2.4); belt(H, -6, -20, 6, -24, -4, 0); loopAt(H, 0, -33.6, 0, -1, 0.85, 1.6);
    jump(H, 0, -44, 0, -1, 2.2, 10, { h:0.9, ang:40 }); bumps(H, T, [[-2, -52, 0.6]]); flatAt(H, 1.5, -56); return H; } },
  // ---- 5 PIRATE COVE: the sea on every side, island hops, and the tide running in. Rails line the lanes the obvious line takes, so the sea punishes a bad choice rather than a degree of aim.
  // Gangplank: up the railed plank, through the chicane, putt out.
  { par:3, three:2, f:function(T){ var H = hole([rm(-6, 0, 6, -36)], [0, -2.5], [1, -32]); zoneR(H, M.WATER, -6, -10, -1.6, -28); zoneR(H, M.WATER, 1.6, -10, 6, -28); blk(H, T, -1.9, -10, -1.6, -28); blk(H, T, 1.6, -10, 1.9, -28); blk(H, T, -1.6, -18, 0.3, -19.2); blk(H, T, -0.3, -23, 1.6, -24.2);
    bumps(H, T, [[-3.6, -7.2, 0.5]]); return H; } },
  // Rock Pool: down the falls to the lower deck; a rail keeps the lagoon off the line; putt out.
  { par:3, three:2, f:function(T){ var H = hole([rm(-10, 0, -2, -12), rm(-4, -24, 8, -38, -1.8)], [-6, -2.5], [4, -34]); river(H, [[-6, -11.5], [-6, -16], [-1, -19], [2, -24.5]], 1.8, 7, 0, -1.8); zoneR(H, M.WATER, -4, -30, 0.5, -38); blk(H, T, 0.5, -30, 0.8, -38); bumps(H, T, [[4.5, -28.5, 0.65]]);
    return H; } },
  // Blowholes: through the blowholes, which kick; rails hold the sea back on both sides; two putts.
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -36)], [0, -2.5], [0, -32]); pads(H, [[-2.5, -12, 0.75], [2.5, -15, 0.75], [-1, -20, 0.75], [3, -24.5, 0.7], [-3.2, -26, 0.7]]); zoneR(H, M.WATER, -6, -17, -4.5, -23); zoneR(H, M.WATER, 4.5, -17, 6, -23);
    blk(H, T, -4.8, -17, -4.5, -23); blk(H, T, 4.5, -17, 4.8, -23); bowl(H, 0, -32, 1.8, 0.13); return H; } },
  // Walk the Plank: off the kicker over the lagoon, up the railed lane, putt out.
  { par:3, three:2, f:function(T){ var H = hole([rm(-4, 0, 4, -12), rm(-4, -11.9, 4, -15.1), rm(-4, -15, 4, -30)], [0, -2.5], [0, -26]); jump(H, 0, -12, 0, -1, 2.8, 8, { h:0.7, ang:38 }); zoneR(H, M.WATER, -4, -15, -2.4, -30); zoneR(H, M.WATER, 2.4, -15, 4, -30);
    blk(H, T, -2.7, -16, -2.4, -30); blk(H, T, 2.4, -16, 2.7, -30); bowl(H, 0, -26, 1.8, 0.13); return H; } },
  // Harbor Gates: through two gates, with the water between them railed off, two putts.
  { par:3, f:function(T){ var H = hole([rm(-5, 0, 5, -40)], [0, -2.5], [0, -36]); gateWall(H, T, -12, -5, 5, -1.1, 1.1, 2.2, 0, 1); zoneR(H, M.WATER, -5, -18, -1.4, -24); zoneR(H, M.WATER, 1.4, -18, 5, -24); gateWall(H, T, -27, -5, 5, -1.1, 1.1, 2.6, 0.5, -1);
    blk(H, T, -1.7, -18, -1.4, -24); blk(H, T, 1.4, -18, 1.7, -24); board(H, T, -1.8, -37.6, 1.8, -37.6); bowl(H, 0, -36, 2.2, 0.16); return H; } },
  // Lagoon: up the railed lane onto the reef and into the lagoon. A wall at the back stops a long one.
  { par:3, f:function(T){ var H = hole([rm(-7, 0, 7, -32)], [0, -2.5], [0, -22]); H.comps.push({ k:'ring', x:0, y:-22, r:2.4, s:0.8, a:0.48 }); H.flats.push({ x:0, y:-22, s:0.6, keep:0.2 });
    zoneR(H, M.WATER, -7, -12, -3.6, -32); zoneR(H, M.WATER, 3.6, -12, 7, -32); zoneR(H, M.WATER, -3.6, -27, 3.6, -32); blk(H, T, -3.9, -12, -3.6, -27); blk(H, T, 3.6, -12, 3.9, -27); blk(H, T, -3.6, -26.4, 3.6, -27); bumps(H, T, [[0, -16.2, 0.5]]); bowl(H, 0, -22, 1.8, 0.13); return H; } },
  // Sandbar: through the gaps in the soft sand, round the pools, two putts.
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -38)], [-3, -2.5], [4, -34.2]); zoneR(H, M.MUD, -6, -13, 6, -15); zoneR(H, M.GREEN, -1.2, -13, 0.8, -15); zoneR(H, M.MUD, -6, -24, 6, -26); zoneR(H, M.GREEN, 1.2, -24, 3.2, -26); zoneC(H, M.WATER, 2.6, -19, 1.2); zoneC(H, M.WATER, -2.6, -20, 1.2); zoneC(H, M.WATER, -1.2, -29.5, 1.1); bowl(H, 4, -34.2, 1.8, 0.13); return H; } },
  // Whirlpool: through the loop, between the pools, putt out.
  { par:3, three:2, f:function(T){ var H = hole([rm(-4, 0, 4, -11), pg([[-4, -11], [4, -11], [0.8, -14.6], [-0.8, -14.6]]), rm(-0.8, -14.5, 0.8, -19), rm(-5, -18.9, 5, -36)], [0, -2.5], [-0.3, -32]);
    loopAt(H, 0, -16.8, 0, -1, 0.8, 1.6); zoneR(H, M.WATER, -5, -22, -1.2, -26); zoneR(H, M.WATER, 1.2, -22, 5, -26); zoneR(H, M.WATER, 1.5, -26, 5, -36); blk(H, T, 1.2, -26, 1.5, -36); bowl(H, -0.3, -32, 1.6, 0.12); return H; } },
  // Rope Bridges: two bridges on two clocks, curbs on both channels, two putts.
  { par:3, f:function(T){ var H = hole([rm(-5, 0, 5, -12), rm(-5, -11.9, 5, -15.6), rm(-5, -15.5, 5, -24), rm(-5, -23.9, 5, -27.6), rm(-5, -27.5, 5, -38)], [0, -2.5], [3, -34]);
    zoneR(H, M.WATER, -5, -12, 5, -15.5); drawb(H, -0.4, -12, 2.6, -15.5, 2.6, 0, 0.55); zoneR(H, M.WATER, -5, -24, 5, -27.5); drawb(H, 1.5, -24, 4.5, -27.5, 2.4, 0.35, 0.55); bumps(H, T, [[-1.5, -20, 0.6]]);
    blk(H, T, -5, -11.4, -0.4, -12); blk(H, T, 2.6, -11.4, 5, -12); blk(H, T, -5, -23.4, 1.5, -24); blk(H, T, 4.5, -23.4, 5, -24); board(H, T, 1.4, -35.4, 3, -36.3); board(H, T, 3, -36.3, 4.6, -35.4); bowl(H, 3, -34, 1.8, 0.13); return H; } },
  // Cannon Fire: under three swinging booms, rails along the water, two putts. The secret: a firm putt banks off the back rail and drops.
  { par:3, f:function(T){ var H = hole([rm(-5, 0, 5, -38)], [0, -2.5], [0, -35.5]); spinner(H, T, -1.6, -13, 2.2, 1.7, 2); spinner(H, T, 1.6, -21, 2.2, -1.7, 2); spinner(H, T, -1.6, -29, 2.2, 1.9, 3);
    zoneR(H, M.WATER, -5, -11, -4.6, -32); zoneR(H, M.WATER, 4.6, -11, 5, -32); blk(H, T, -4.6, -11, -4, -32); blk(H, T, 4, -11, 4.6, -32); bowl(H, 0, -35.5, 1.3, 0.12); secret(H, -0.24, -37.1, 1.36, -38.7); return H; } },
  // Ship Decks: the right ramp to the middle deck, the narrow one in the middle up again, between the water, putt out.
  { par:3, three:2, f:function(T){ var H = hole([rm(-7, 0, 7, -14), rm(-7, -18, 7, -30, 0.8), rm(-7, -34, 7, -46, 1.6)], [0, -2.5], [0, -42]);
    climb(H, 4, -14, -18, 2.2); climb(H, 0, -30, -34, 1.8);
    zoneR(H, M.WATER, -7, -22, -1, -26); zoneR(H, M.WATER, -7, -38, -2, -41); zoneR(H, M.WATER, 2, -38, 7, -41); return H; } },
  // Ship’s Wheel: across the turning wheel, between the water, putt out.
  { par:3, f:function(T){ var H = hole([rm(-7, 0, 7, -34)], [0, -2.5], [0, -30]); disc(H, 0, -16, 3, 1.5); zoneR(H, M.WATER, -7, -12, -3.2, -20); zoneR(H, M.WATER, 3.2, -12, 7, -20); zoneR(H, M.WATER, -7, -20, -2.4, -24); zoneR(H, M.WATER, 2.4, -20, 7, -24);
    blk(H, T, -2.7, -20, -2.4, -24); blk(H, T, 2.4, -20, 2.7, -24); bowl(H, 0, -30, 1.8, 0.13); return H; } },
  // Island Hop: two short hops over the lagoon, up the railed lane, putt out.
  { par:3, three:2, f:function(T){ var H = hole([rm(-4, 0, 4, -10), rm(-4, -9.9, 4, -12.3), rm(-4, -12.2, 4, -16.5), rm(-4, -16.4, 4, -18.8), rm(-4, -18.7, 4, -32)], [0, -2.5], [0, -28]);
    jump(H, 0, -10, 0, -1, 2.2, 8, { h:0.6, ang:34 }); jump(H, 0, -16.5, 0, -1, 2.2, 8, { h:0.6, ang:34 }); zoneR(H, M.WATER, -4, -19.4, -2, -32); zoneR(H, M.WATER, 2, -19.4, 4, -32); blk(H, T, -2.3, -19.4, -2, -32); blk(H, T, 2, -19.4, 2.3, -32); bowl(H, 0, -28, 1.3, 0.12); return H; } },
  // Riptide: the current carries you round to the lower beach; putt out past the rock.
  { par:3, three:2, f:function(T){ var H = hole([rm(-12, 0, -4, -10), rm(-4, -30, 8, -44, -2)], [-8, -2.5], [4, -40]); river(H, [[-8, -9.5], [-8, -15], [0, -17], [6, -21], [6, -26], [0, -30.5]], 1.8, 7.5, 0, -2);
    zoneR(H, M.WATER, -4, -40, -0.5, -44); zoneR(H, M.WATER, 5, -32, 8, -36); bumps(H, T, [[2, -36, 0.6]]); return H; } },
  // Reef Break: over the reef, under two booms, with rails on the water, two putts.
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -40)], [0, -2.5], [-2, -36]); H.comps.push({ k:'ridge', x:0, y:-16, nx:1, ny:0, w:1.6, a:0.45 }); slider(H, T, -22, -4, 4, 2.4, 0.2); slider(H, T, -28, 4, -4, 2.0, 0.6);
    zoneR(H, M.WATER, -6, -10, -4.6, -32); zoneR(H, M.WATER, 4.6, -10, 6, -32); blk(H, T, -4.9, -10, -4.6, -32); blk(H, T, 4.6, -10, 4.9, -32); return H; } },
  // Treasure Map: zig and zag past the water, three putts.
  { par:3, three:2, f:function(T){ var H = hole([rm(-7, 0, 7, -38)], [-4.5, -2.5], [4.5, -34]); blk(H, T, -7, -10, 2.5, -11.4); blk(H, T, -2.5, -20, 7, -21.4); blk(H, T, -7, -29, 2.5, -30.4);
    bumps(H, T, [[4.8, -15.5, 0.6], [-4.8, -25, 0.6]]); zoneR(H, M.WATER, -7, -12.4, -2.5, -16); zoneR(H, M.WATER, 2.5, -22.4, 7, -26); zoneR(H, M.WATER, -7, -31.4, -2.5, -34.5);
    return H; } },
  // Broadside: through the loop, over the jump and the curbed bridge, three putts.
  { par:4, three:3, f:function(T){ var H = hole([rm(-4, 0, 4, -10), pg([[-4, -10], [4, -10], [0.8, -13.6], [-0.8, -13.6]]), rm(-0.8, -13.5, 0.8, -18), rm(-4.5, -17.9, 4.5, -25), rm(-4.5, -24.9, 4.5, -27.9), rm(-4.5, -27.8, 4.5, -34), rm(-4.5, -33.9, 4.5, -37.1), rm(-4.5, -37, 4.5, -48)], [0, -2.5], [0, -44]);
    loopAt(H, 0, -15.6, 0, -1, 0.75, 1.6); jump(H, 0, -25, 0, -1, 2.2, 9, { h:0.9, ang:40 }); zoneR(H, M.WATER, -4.5, -34, 4.5, -37); drawb(H, -1.3, -34, 1.3, -37, 2.6, 0.2, 0.5);
    blk(H, T, -4.5, -33.4, -1.3, -34); blk(H, T, 1.3, -33.4, 4.5, -34);
    return H; } },
  // Captain’s Cove: the ramp lane, the ship's wheel, the jump, the curbed bridge and the river down.
  { par:5, three:4, sig:true, f:function(T){ var H = hole([rm(-5, 0, 5, -12), rm(-7, -16, 7, -30, 0.8), rm(-7, -29.9, 7, -33.1, 0.8), rm(-7, -33, 7, -42, 0.8), rm(-7, -41.9, 7, -45.1, 0.8), rm(-7, -45, 7, -56, 1.6), rm(-12, -60, 2, -72, 0)], [0, -2.5], [-5, -68]);
    climb(H, -3.5, -12, -16, 2.4); disc(H, 0, -23, 2.6, -1.4); zoneR(H, M.WATER, -7, -20, -3, -26); zoneR(H, M.WATER, 3, -20, 7, -26);
    jump(H, 0, -30, 0, -1, 3.0, 14, { h:0.9, ang:40 }); zoneR(H, M.WATER, -7, -42, 7, -45); drawb(H, 2.2, -42, 4.6, -45, 2.4, 0.4, 0.5); blk(H, T, -7, -41.4, 2.2, -42); blk(H, T, 4.6, -41.4, 7, -42);
    river(H, [[-3, -55.5], [-3, -58], [-5, -60.5]], 1.8, 6, 1.6, 0); bumps(H, T, [[-8, -66, 0.6], [-2, -64, 0.6]]); flatAt(H, -5, -68); return H; } },
  // ---- 6 LOST TEMPLE: polished stone that keeps the ball going, vines that stop it dead, and chasms to jump. The stone is a quarter of the carpet's grip, so the pace is read off where it ends.
  // Polished Hall: across the polished floor between the idols. The stone carries a soft putt a long way; the vines behind the cup catch a firm one.
  { par:3, f:function(T){ var H = hole([rm(-5, 0, 5, -32)], [0, -2.5], [1.5, -26]); zoneR(H, M.ICE, -5, -10, 5, -21); bumps(H, T, [[-2.6, -14, 0.6], [2.6, -14, 0.6], [0.4, -19, 0.7]]); zoneR(H, M.MUD, -5, -29.5, 5, -32); bowl(H, 1.5, -26); return H; } },
  // Temple Steps: the dogleg right on a polished leg. A board across the outside corner turns a putt onto the stone and down to the cup.
  { par:3, f:function(T){ var H = hole([rm(-3, 0, 3, -20.1), rm(-14, -14, 3, -20)], [0, -2.5], [-11, -17]); board(H, T, 3, -16, -1, -20.1, 0.4); blk(H, T, -3.8, -14, -3, -14.6); zoneR(H, M.ICE, -9, -14.5, -4, -19.5); bumps(H, T, [[-7.4, -15.2, 0.55], [-7.6, -18.2, 0.6]]); bowl(H, -11, -17); return H; } },
  // Jade Causeway: the jade pool is paved down the middle only. Slide the railed stone causeway, then putt round the idol.
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -30)], [0, -2.5], [2.5, -26]); zoneR(H, M.WATER, -6, -11, 6, -21); zoneR(H, M.ICE, -1.3, -11, 1.3, -21); blk(H, T, -1.6, -11, -1.3, -21); blk(H, T, 1.3, -11, 1.6, -21);
    bumps(H, T, [[-1, -25, 0.55]]); bowl(H, 2.5, -26); zoneR(H, M.MUD, -6, -28, -3, -30); return H; } },
  // Stone Doors: through a door, across the stone, through the next door, which opens the other way.
  { par:3, three:2, f:function(T){ var H = hole([rm(-5, 0, 5, -38)], [0, -2.5], [-1, -33]); gateWall(H, T, -13, -5, 5, -1.1, 1.1, 3.0, 0, 1); zoneR(H, M.ICE, -5, -16, 5, -22); gateWall(H, T, -26, -5, 5, 1.0, 3.2, 3.4, 0.4, -1);
    zoneR(H, M.MUD, -5, -35.5, 5, -38); bowl(H, -1, -33); bumps(H, T, [[3, -7, 0.5]]); return H; } },
  // Landslide: the whole hall runs down to the cup, so every putt runs on. Thread the two vine beds.
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -38)], [0, -2.5], [0, -34]); H.comps.push({ k:'plane', gx:0, gy:0.022 }); zoneR(H, M.MUD, -6, -13, -0.8, -15.5); zoneR(H, M.MUD, 0.8, -21, 6, -23.5);
    bumps(H, T, [[2.2, -17, 0.6]]); zoneR(H, M.MUD, -6, -36.5, 6, -38); flatAt(H, 0, -34); bowl(H, 0, -34); return H; } },
  // The Leap: off the ramp over the chasm and onto the stone, then putt round the idol.
  { par:3, three:2, f:function(T){ var H = hole([rm(-4, 0, 4, -12), rm(-4, -11.9, 4, -15.1), rm(-5, -15, 5, -30)], [0, -2.5], [1.5, -24]); jump(H, 0, -12, 0, -1, 2.4, 8, { h:0.7, ang:38 }); zoneR(H, M.ICE, -5, -16, 5, -20);
    bumps(H, T, [[-2, -22, 0.5], [0.8, -20.8, 0.6]]); zoneR(H, M.MUD, -5, -27.5, 5, -30); bowl(H, 1.5, -24); return H; } },
  // Idol Alley: a whole row of idols to thread, and a strip of polished stone in front of the cup.
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -38)], [0, -2.5], [2, -34]); bumps(H, T, [[-3, -9, 0.7], [2.5, -12, 0.7], [-1, -16, 0.75], [3.5, -19, 0.7], [-3.5, -22, 0.7], [1, -25, 0.75], [-2, -29, 0.6]]);
    zoneR(H, M.ICE, -6, -30.5, 6, -32); bowl(H, 2, -34); zoneR(H, M.MUD, -6, -36, -3, -38); return H; } },
  // Moving Floor: the floor slides left under the ball. Aim off it, then the stone carries you on.
  { par:3, three:2, f:function(T){ var H = hole([rm(-6, 0, 6, -34)], [0, -2.5], [3, -29]); belt(H, -6, -12, 6, -17, -5, 0); zoneR(H, M.ICE, -6, -17, 6, -20); bumps(H, T, [[-2, -24, 0.6]]); zoneR(H, M.MUD, -6, -31.5, 6, -34); bowl(H, 3, -29); bumps(H, T, [[4.4, -6, 0.55]]); return H; } },
  // Golden Ring: through the ring of the loop, then the stone; the vines at the back stop a quick one.
  { par:3, three:2, f:function(T){ var H = hole([rm(-4, 0, 4, -12), pg([[-4, -12], [4, -12], [0.8, -15.6], [-0.8, -15.6]]), rm(-0.8, -15.5, 0.8, -19.5), rm(-5, -19.4, 5, -36)], [0, -2.5], [-2.5, -30]);
    loopAt(H, 0, -17.5, 0, -1, 0.65, 1.6); zoneR(H, M.ICE, -5, -21, 5, -26); bumps(H, T, [[1.5, -28, 0.5]]); zoneR(H, M.MUD, -5, -33.5, 5, -36); bowl(H, -2.5, -30); return H; } },
  // Temple Stairs: up the stair lane to the top court, past the cart that crosses the hall, and across the stone.
  { par:3, f:function(T){ var H = hole([rm(-5, 0, 5, -14), rm(-5, -18, 5, -34, 0.6)], [0, -2.5], [2, -31]); climb(H, -2.6, -14, -18, 2.4); slider(H, T, -23, -3.4, 3.4, 2.6, 0); zoneR(H, M.ICE, -5, -25.5, 5, -28.5);
    bumps(H, T, [[2.4, -9, 0.6]]); bowl(H, 2, -31); return H; } },
  // Waterfall: ride the falls down to the lower ledge, across its stone, and putt out.
  { par:3, three:2, f:function(T){ var H = hole([rm(-10, 0, -2, -14), rm(-1, -25, 9, -38, -1.5)], [-6, -2.5], [3, -35]); river(H, [[-6, -13], [-6, -18], [-1, -22], [4, -22], [4, -26]], 1.8, 6, 0, -1.5);
    zoneR(H, M.ICE, -1, -27.5, 9, -30); bumps(H, T, [[-6, -8, 0.7], [6.5, -33, 0.5]]); bowl(H, 3, -35); return H; } },
  // Crumbling Bridges: two stone bridges over two chasms, each on its own clock, with polished stone between them. Curbs keep a stray ball out.
  { par:3, f:function(T){ var H = hole([rm(-5, 0, 5, -12), rm(-5, -11.9, 5, -15.6), rm(-5, -15.5, 5, -25), rm(-5, -24.9, 5, -28.6), rm(-5, -28.5, 5, -40)], [0, -2.5], [-2, -35]);
    zoneR(H, M.WATER, -5, -12, 5, -15.5); drawb(H, -1.4, -12, 1.4, -15.5, 3.0, 0, 0.55); zoneR(H, M.ICE, -5, -17, 5, -21.5); zoneR(H, M.WATER, -5, -25, 5, -28.5); drawb(H, -3.6, -25, -0.8, -28.5, 2.8, 0.4, 0.55);
    blk(H, T, -5, -11.4, -1.4, -12); blk(H, T, 1.4, -11.4, 5, -12); blk(H, T, -5, -24.4, -3.6, -25); blk(H, T, -0.8, -24.4, 5, -25); bumps(H, T, [[1.8, -32, 0.55]]); bowl(H, -2, -35); return H; } },
  // Spinning Idol: the windmill stands on the far side of the hall. The stone brings the ball to the door fast, so the sails decide it.
  { par:3, f:function(T){ var H = hole([rm(-7, 0, 7, -40)], [0, -2.5], [2, -33]); zoneR(H, M.ICE, -7, -8, 7, -14); millAt(H, T, -20, 7, 1.2); bumps(H, T, [[-2.6, -29, 0.5]]); zoneR(H, M.MUD, -7, -37.5, 7, -40); bowl(H, 2, -33); return H; } },
  // Turning Floor: a turning floor in the middle of the hall, polished stone all round it, and the cup up the top lane.
  { par:3, f:function(T){ var H = hole([rm(-5, 0, 5, -9.1), pg([[-5, -9], [5, -9], [8, -13], [8, -21], [5, -25], [-5, -25], [-8, -21], [-8, -13]]), rm(-5, -24.9, 5, -36)], [0, -2.5], [2, -31]);
    zoneR(H, M.ICE, -8, -13, 8, -21); disc(H, 0, -17, 2.8, -1.3); bumps(H, T, [[-1.5, -28, 0.5]]); bowl(H, 2, -31); zoneR(H, M.MUD, -5, -34, -2.5, -36); return H; } },
  // Serpent Bend: the hall bends right and back, the bend polished. Bank it off the walls.
  { par:3, three:2, f:function(T){ var H = hole([pg([[-3, 0], [3, 0], [3, -8], [10, -14], [10, -22], [4, -28], [4, -40], [-3, -40], [-3, -27], [3, -21], [3, -16], [-3, -11]])], [0, -2.5], [0.5, -36]);
    zoneR(H, M.ICE, 3, -14, 10, -22); bumps(H, T, [[0, -6, 0.5]]); zoneR(H, M.MUD, -3, -38.5, 4, -40); bowl(H, 0.5, -36); bumps(H, T, [[7.2, -20, 0.5]]); return H; } },
  // Hidden Chamber: the chamber is a U. Up the left, round the vines at the top, back down the right. Or find the crack low in the dividing wall: it lines up with the cup.
  { par:3, f:function(T){ var H = hole([rm(-9, 0, 9, -32)], [-5, -2.5], [5, -10]); blk(H, T, -0.6, 0, 0.6, -5.5); blk(H, T, -0.6, -7, 0.6, -23); secret(H, -0.6, -5.5, 0.6, -7);
    zoneR(H, M.MUD, -9, -26, 9, -27.5); zoneR(H, M.GREEN, -1, -26, 1, -27.5); zoneR(H, M.ICE, 1, -14, 9, -22); bumps(H, T, [[-5, -16, 0.7], [5.5, -16, 0.6], [6.5, -27, 0.6]]); bowl(H, 5, -10); return H; } },
  // Twin Chasms: two jumps in a row over two chasms, and polished stone on the far side.
  { par:3, three:2, f:function(T){ var H = hole([rm(-4, 0, 4, -10), rm(-4, -9.9, 4, -12.3), rm(-4, -12.2, 4, -17), rm(-4, -16.9, 4, -19.3), rm(-4.5, -19.2, 4.5, -34)], [0, -2.5], [-1.5, -29]);
    jump(H, 0, -10, 0, -1, 2.2, 8, { h:0.6, ang:34 }); jump(H, 0, -17, 0, -1, 2.2, 8, { h:0.6, ang:34 }); zoneR(H, M.ICE, -4.5, -21, 4.5, -25); zoneR(H, M.MUD, -4.5, -31.5, 4.5, -34); bowl(H, -1.5, -29); return H; } },
  // Heart of the Temple: up the stair lane, across the stone, through the mill, over the stone bridge and round the inner wall.
  { par:3, three:2, sig:true, f:function(T){ var H = hole([rm(-5, 0, 5, -12), rm(-6, -16, 6, -30, 0.6), rm(-6, -29.9, 6, -33.1, 0.6), rm(-6, -33, 6, -46, 0.6)], [0, -2.5], [-2, -42]);
    climb(H, -3, -12, -16, 2.4, 0.3); zoneR(H, M.ICE, -6, -17, 6, -20); millAt(H, T, -26, 6, 1.3); zoneR(H, M.WATER, -6, -30, 6, -33); drawb(H, -1.4, -30, 1.4, -33, 3.4, 0.3, 0.55);
    blk(H, T, -6, -29.4, -1.4, -30); blk(H, T, 1.4, -29.4, 6, -30); blk(H, T, -6, -36.6, 2, -37.2); zoneR(H, M.MUD, -6, -45, 6, -46); flatAt(H, -2, -42); return H; } },
  // ---- 7 CANYON MINE: ledges with the shafts all round them. Ore belts push the ball sideways, bounce pads throw it, and the only way between ledges is a jump.
  // Canyon Jump: off the kicker over the shaft to the next ledge, then putt round the boulder.
  { par:3, three:2, f:function(T){ var H = hole([rm(-5, 0, 5, -12), rm(-5, -11.9, 5, -15.1), rm(-6, -15, 6, -30)], [0, -2.5], [-1.5, -26]); jump(H, 0, -12, 0, -1, 2.2, 10, { w:5 }); bumps(H, T, [[2, -21.5, 0.6], [-1, -21.4, 0.65]]); bowl(H, -1.5, -26); bumps(H, T, [[-3.6, -7, 0.55]]); zoneR(H, M.MUD, 3, -27, 6, -30); return H; } },
  // Ore Belt: the belt pushes right across the middle, then a railed lane between two shafts.
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -34)], [0, -2.5], [0, -30]); belt(H, -6, -12, 6, -17, 4, 0); zoneR(H, M.WATER, -6, -20, -2, -26); zoneR(H, M.WATER, 2, -20, 6, -26); blk(H, T, -2.3, -20, -2, -26); blk(H, T, 2, -20, 2.3, -26);
    bumps(H, T, [[-2, -8.5, 0.5], [0.5, -27.4, 0.5]]); bowl(H, 0, -30); bumps(H, T, [[3.6, -33, 0.5]]); zoneR(H, M.MUD, -6, -32, -3, -34); return H; } },
  // Dynamite: a field of bounce pads. Read where each one throws the ball.
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -34)], [0, -2.5], [1, -30]); pads(H, [[-2.5, -11, 0.75], [2.5, -14, 0.75], [-1, -19, 0.75], [3, -22.5, 0.7], [-3, -25, 0.7]]); zoneR(H, M.MUD, -6, -27, -2.5, -28.5); bowl(H, 1, -30); bumps(H, T, [[4.6, -6, 0.5]]); return H; } },
  // Trestle: a narrow railed trestle with a shaft either side, and a boulder to round at the end.
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -36)], [0, -2.5], [-2, -31]); zoneR(H, M.WATER, -6, -11, -1.5, -25); zoneR(H, M.WATER, 1.5, -11, 6, -25); blk(H, T, -1.8, -11, -1.5, -25); blk(H, T, 1.5, -11, 1.8, -25);
    bumps(H, T, [[1.2, -29.5, 0.55], [3.4, -7, 0.55]]); bowl(H, -2, -31); zoneR(H, M.MUD, 2.5, -33, 6, -36); return H; } },
  // Mine Gates: a gate, a railed lane over the shaft, and a second gate offset to the right.
  { par:3, three:2, f:function(T){ var H = hole([rm(-5, 0, 5, -40)], [0, -2.5], [2, -35]); gateWall(H, T, -12, -5, 5, -1.1, 1.1, 2.6, 0, 1); zoneR(H, M.WATER, -5, -17, -1.6, -23); zoneR(H, M.WATER, 1.6, -17, 5, -23);
    blk(H, T, -1.9, -17, -1.6, -23); blk(H, T, 1.6, -17, 1.9, -23); gateWall(H, T, -28, -5, 5, 1.0, 3.2, 3.0, 0.3, -1); bowl(H, 2, -35); bumps(H, T, [[-3, -6.5, 0.5]]); zoneR(H, M.MUD, -5, -38, -1.5, -40); return H; } },
  // Mine Shaft: a belt runs against you the whole shaft. Putt firm, and the gravel at the top stops the ball once it is out.
  { par:4, three:3, f:function(T){ var H = hole([rm(-3, 0, 3, -40)], [0, -2.5], [0.5, -35]); belt(H, -3, -9, 3, -26, 0, 2.6); bumps(H, T, [[-1.3, -30, 0.45]]); zoneR(H, M.MUD, -3, -38, 3, -40); bowl(H, 0.5, -35); bumps(H, T, [[1.2, -6, 0.45]]); return H; } },
  // Rail Loop: through the loop, then down the lane between two shafts.
  { par:3, f:function(T){ var H = hole([rm(-5, 0, 5, -10), pg([[-5, -10], [5, -10], [0.8, -13.6], [-0.8, -13.6]]), rm(-0.8, -13.5, 0.8, -18), rm(-6, -17.9, 6, -34)], [0, -2.5], [0, -31]);
    loopAt(H, 0, -15.8, 0, -1, 0.7, 1.6); bumps(H, T, [[-0.6, -29.4, 0.5]]); zoneR(H, M.WATER, -6, -23, -2, -28); zoneR(H, M.WATER, 2, -23, 6, -28); blk(H, T, -2.3, -23, -2, -28); blk(H, T, 2, -23, 2.3, -28); bowl(H, 0, -31); bumps(H, T, [[3.4, -5, 0.5]]); zoneR(H, M.MUD, -6, -32, -3, -34); return H; } },
  // Turntables: two turntables turning opposite ways. Ride them or go round.
  { par:3, f:function(T){ var H = hole([rm(-7, 0, 7, -38)], [0, -2.5], [-1, -34]); disc(H, -2.5, -14, 2.2, 1.2); disc(H, 2.5, -24, 2.2, -1.3); bumps(H, T, [[3.5, -12, 0.55], [-3.6, -27, 0.55], [-0.6, -30.4, 0.55]]); bowl(H, -1, -34); zoneR(H, M.MUD, 4, -34, 7, -38); zoneR(H, M.MUD, -7, -6, -4, -9); return H; } },
  // Boulder Field: bounce off the boulders, keeping off the shaft down the left side.
  { par:3, three:2, f:function(T){ var H = hole([rm(-7, 0, 7, -36)], [0, -2.5], [3.5, -31]); pads(H, [[-4, -12, 0.75], [0, -14, 0.75], [4, -12, 0.75], [-2, -20, 0.7], [2.5, -20.5, 0.7], [0, -26, 0.7]]);
    zoneR(H, M.WATER, -7, -22, -5.3, -30); blk(H, T, -5.3, -22, -5, -30); bowl(H, 3.5, -31); zoneR(H, M.MUD, 4.5, -35, 7, -36); return H; } },
  // Stamp Mill: the mill on the ledge's edge, wall to wall, then the lane between two shafts.
  { par:3, f:function(T){ var H = hole([rm(-7, 0, 7, -42)], [0, -2.5], [0, -37]); millAt(H, T, -16, 7, 1.4); zoneR(H, M.WATER, -7, -24, -2, -29); zoneR(H, M.WATER, 2, -24, 7, -29); blk(H, T, -2.3, -24, -2, -29); blk(H, T, 2, -24, 2.3, -29);
    bumps(H, T, [[-3, -33, 0.55]]); bowl(H, 0, -37); bumps(H, T, [[3.5, -7, 0.55]]); return H; } },
  // Switchback Steps: up two ramp lanes, one on each side, past the shaft on the middle ledge.
  { par:3, three:2, f:function(T){ var H = hole([rm(-6, 0, 6, -12), rm(-6, -16, 6, -28, 0.7), rm(-6, -32, 6, -44, 1.4)], [0, -2.5], [2, -40]); climb(H, 3.5, -12, -16, 2.2); climb(H, -3.5, -28, -32, 2.2);
    zoneR(H, M.WATER, -6, -20, -1, -24); blk(H, T, -1, -20, -0.7, -24); bumps(H, T, [[-2, -36, 0.5]]); bumps(H, T, [[-3, -6, 0.55]]); zoneR(H, M.MUD, 3, -24, 6, -28); return H; } },
  // Flash Flood: ride the flood down to the ledge below, and keep off its edge.
  { par:3, three:2, f:function(T){ var H = hole([rm(-4, 0, 6, -12), rm(-8, -24, 6, -38, -1.6)], [1, -2.5], [2, -34]); river(H, [[1, -11.5], [1, -17], [-3, -20], [-3, -24.5]], 1.8, 6.5, 0, -1.6);
    zoneR(H, M.WATER, -8, -31, -4.3, -38); blk(H, T, -4.3, -31, -4, -38); bumps(H, T, [[3.2, -7, 0.6]]); bowl(H, 2, -34); zoneR(H, M.MUD, 3.5, -37, 6, -38); return H; } },
  // Mine Carts: three carts cross the ledge, each on its own clock.
  { par:3, f:function(T){ var H = hole([rm(-5, 0, 5, -40)], [0, -2.5], [0, -36]); slider(H, T, -12, -3.2, 3.2, 2.2, 0); slider(H, T, -20, 3.2, -3.2, 2.6, 0.4); slider(H, T, -28, -3.2, 3.2, 3.0, 0.7);
    zoneR(H, M.WATER, -5, -10, -4.4, -31); zoneR(H, M.WATER, 4.4, -10, 5, -31); blk(H, T, -4.4, -10, -4.1, -31); blk(H, T, 4.1, -10, 4.4, -31); bowl(H, 0, -36); bumps(H, T, [[2.5, -5.5, 0.5]]); return H; } },
  // Two Belts: two belts running opposite ways, one after the other.
  { par:3, three:2, f:function(T){ var H = hole([rm(-7, 0, 7, -38)], [0, -2.5], [2, -33]); belt(H, -7, -10, 7, -14, 5, 0); belt(H, -7, -20, 7, -24, -5, 0); zoneR(H, M.WATER, -7, -27, -4.3, -31); blk(H, T, -4.3, -27, -4, -31);
    bumps(H, T, [[0, -17, 0.55]]); bowl(H, 2, -33); bumps(H, T, [[-4, -5, 0.55]]); zoneR(H, M.MUD, 4, -36, 7, -38); return H; } },
  // Mesa Hop: two jumps, mesa to mesa to mesa.
  { par:3, three:2, f:function(T){ var H = hole([rm(-5, 0, 5, -11), rm(-5, -10.9, 5, -14.1), rm(-5, -14, 5, -22), rm(-5, -21.9, 5, -25.1), rm(-6, -25, 6, -38)], [0, -2.5], [2, -33]);
    jump(H, 0, -11, 0, -1, 3, 10, { w:5 }); jump(H, 0, -22, 0, -1, 3, 10, { w:5 }); bumps(H, T, [[-2, -18, 0.6]]); bowl(H, 2, -33); zoneR(H, M.MUD, -6, -35, -3, -38); return H; } },
  // Blast Door: the door in the wall opens off its plate. Or find the crack in the wall left of it, which lines up with the cup.
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -34)], [0, -2.5], [-5, -26]); blk(H, T, -6, -17.4, -4, -18.6); blk(H, T, -2.8, -17.4, -1.4, -18.6); blk(H, T, 1.4, -17.4, 6, -18.6); secret(H, -4, -17.4, -2.8, -18.6);
    switchDoor(H, T, -18, -1.4, 1.4, 4.5, -7, 4); zoneR(H, M.WATER, 2.5, -22, 6, -26); blk(H, T, 2.2, -22, 2.5, -26); bumps(H, T, [[-2.4, -10, 0.6]]); bowl(H, -5, -26); zoneR(H, M.MUD, 3, -31, 6, -34); return H; } },
  // Runaway Cart: through the loop, across the belt, and off the ramp over the shaft.
  { par:3, three:2, f:function(T){ var H = hole([rm(-4, 0, 4, -10), pg([[-4, -10], [4, -10], [0.8, -13.6], [-0.8, -13.6]]), rm(-0.8, -13.5, 0.8, -18), rm(-5, -17.9, 5, -26), rm(-5, -25.9, 5, -28.9), rm(-5, -28.8, 5, -42)], [0, -2.5], [-1.5, -37]);
    loopAt(H, 0, -15.6, 0, -1, 0.7, 1.6); belt(H, -5, -20, 5, -23, 3, 0); jump(H, 0, -26, 0, -1, 2.4, 10, { h:0.8, ang:38 }); bowl(H, -1.5, -37); bumps(H, T, [[2.8, -32, 0.55]]); zoneR(H, M.MUD, 2.5, -39, 5, -42); return H; } },
  // Mother Lode: the ramp lane, the bounce pads, the big jump, the drawbridge, and the lode.
  { par:4, three:3, sig:true, f:function(T){ var H = hole([rm(-5, 0, 5, -12), rm(-7, -16, 7, -28, 0.8), rm(-7, -27.9, 7, -31.1, 0.8), rm(-7, -31, 7, -44, 0.8), rm(-7, -43.9, 7, -47.1, 0.8), rm(-7, -47, 7, -58, 0.8)], [0, -2.5], [2, -54]);
    climb(H, 3, -12, -16, 2.4); pads(H, [[-3, -21, 0.7], [2.5, -23.5, 0.7]]); jump(H, 0, -28, 0, -1, 3, 14, { h:0.9, ang:40 }); zoneR(H, M.WATER, -7, -44, 7, -47); drawb(H, -1.4, -44, 1.4, -47, 3, 0.2, 0.55);
    blk(H, T, -7, -43.4, -1.4, -44); blk(H, T, 1.4, -43.4, 7, -44); bumps(H, T, [[-3, -50, 0.6]]); flatAt(H, 2, -54); zoneR(H, M.MUD, -7, -36, -4, -39); return H; } },
  // ---- 8 VOLCANO ISLAND: every rock on a clock. Basalt gates, bounce rocks, the switch and the lava pools.
  // Lava Lane: past three bounce rocks and into the slot, when the basalt bar sliding across it lets you.
  { par:3, f:function(T){ var H = hole([rm(-5, 0, 5, -32)], [0, -2.5], [0, -27.4]); pads(H, [[-2.5, -14, 0.7], [2.5, -14, 0.7], [0, -19, 0.7]]); board(H, T, -5, -22, -1.4, -26.4); board(H, T, 5, -22, 1.4, -26.4); slider(H, T, -21.2, -2.6, 2.6, 2.4, 0, 1.6); bowl(H, 0, -27.4, 1.8, 0.13); bumps(H, T, [[-3.4, -6, 0.5], [3.4, -6, 0.5]]); return H; } },
  // Fire Pit: the pit narrows to the top; bounce rocks all the way up.
  { par:3, f:function(T){ var H = hole([pg([[-6, 0], [6, 0], [6, -30], [0, -36], [-6, -30]])], [0, -2.5], [0, -31.5]); pads(H, [[-3, -14, 0.7], [3, -14, 0.7], [0, -20, 0.7], [-2.5, -26, 0.65], [2.5, -26, 0.65]]);
    board(H, T, -6, -6, -2, -8); board(H, T, 6, -6, 2, -8); bowl(H, 0, -31.5); zoneR(H, M.MUD, -6, -10, -4.5, -12); zoneR(H, M.MUD, 4.5, -10, 6, -12); return H; } },
  // Basalt Gates: three basalt gates, three clocks.
  { par:3, three:2, f:function(T){ var H = hole([rm(-5, 0, 5, -44)], [0, -2.5], [0, -40]); gateWall(H, T, -12, -5, 5, -1.1, 1.1, 2.0, 0, 1); gateWall(H, T, -22, -5, 5, 1.0, 3.2, 2.4, 0.3, -1); gateWall(H, T, -32, -5, 5, -3.2, -1.0, 2.8, 0.6, 1);
    bowl(H, 0, -40); bumps(H, T, [[-3, -17, 0.5], [3, -27, 0.5]]); return H; } },
  // Lava Tubes: zig and zag through the tubes. The middle wall has a gap in it, if you can find the line.
  { par:3, three:2, f:function(T){ var H = hole([rm(-7, 0, 7, -36)], [4, -2.5], [-4, -31]); blk(H, T, -7, -9, 3, -10.4); blk(H, T, -3, -17, 1, -18.4); blk(H, T, 2.2, -17, 7, -18.4); blk(H, T, -7, -25, 3, -26.4);
    bumps(H, T, [[5, -13, 0.55], [-5, -21, 0.55]]); bowl(H, -4, -31); zoneR(H, M.MUD, 4.5, -34, 7, -36); return H; } },
  // Rolling Rocks: boulders rolling across and up and down the floor.
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -38)], [0, -2.5], [0, -34]); slider(H, T, -12, -4, 4, 2.2, 0); vslider(H, T, -3, -16, -26, 2.6, 0.3); vslider(H, T, 3, -26, -16, 2.6, 0.6); slider(H, T, -30, 4, -4, 2.4, 0.5); bowl(H, 0, -34); bumps(H, T, [[-4.4, -6, 0.5], [4.4, -6, 0.5]]); zoneR(H, M.MUD, -6, -36, -3, -38); return H; } },
  // Turning Rock: one big turning rock, and two posts guarding the cup.
  { par:3, three:2, f:function(T){ var H = hole([rm(-7, 0, 7, -36)], [0, -2.5], [0, -31]); disc(H, 0, -18, 3.4, 1.6); bumps(H, T, [[-3.2, -26, 0.5], [3.2, -26, 0.5]]); zoneR(H, M.MUD, -7, -10, -4, -12); zoneR(H, M.MUD, 4, -10, 7, -12); bowl(H, 0, -31); pads(H, [[-4.8, -18, 0.6], [4.8, -18, 0.6]]); return H; } },
  // Ash Field: lava pools and two bands of ash, each with one clean gap.
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -38)], [3, -2.5], [-3, -34]); zoneR(H, M.MUD, -6, -12, 6, -14); zoneR(H, M.GREEN, 0.5, -12, 2.5, -14); zoneR(H, M.MUD, -6, -24, 6, -26); zoneR(H, M.GREEN, -3, -24, -1, -26);
    zoneC(H, M.WATER, -3, -18, 1.2); zoneC(H, M.WATER, 3.2, -19, 1.2); zoneC(H, M.WATER, 1.5, -29.5, 1.1); bowl(H, -3, -34); bumps(H, T, [[-4.4, -6, 0.5]]); pads(H, [[4.4, -30, 0.6]]); return H; } },
  // Lava Switch: roll over the plate to open the door, and the bounce rock throws you toward it. Or find the crack right of the door: it lines up with the cup.
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -36)], [0, -2.5], [4, -25]); blk(H, T, -6, -19.4, -1.4, -20.6); blk(H, T, 1.4, -19.4, 2.4, -20.6); blk(H, T, 3.6, -19.4, 6, -20.6); secret(H, 2.4, -19.4, 3.6, -20.6); switchDoor(H, T, -20, -1.4, 1.4, -4.6, -9, 4);
    pads(H, [[-3, -12, 0.75]]); bumps(H, T, [[-1.5, -27, 0.55], [1.5, -22.6, 0.6], [0.2, -24.6, 0.5]]); board(H, T, 2.6, -26.1, 5.4, -26.1, 0.35); bowl(H, 4, -25, 2.2, 0.16); zoneR(H, M.MUD, 3.5, -34.5, 6, -36); bumps(H, T, [[-4.6, -25, 0.5]]); return H; } },
  // Magma Loops: two loops, two rooms, one pace for each.
  { par:4, three:3, f:function(T){ var H = hole([rm(-4, 0, 4, -10), pg([[-4, -10], [4, -10], [0.8, -13.6], [-0.8, -13.6]]), rm(-0.8, -13.5, 0.8, -18), rm(-5, -17.9, 5, -26), pg([[-5, -26], [5, -26], [0.8, -29.6], [-0.8, -29.6]]), rm(-0.8, -29.5, 0.8, -34), rm(-5, -33.9, 5, -46)], [0, -2.5], [2, -42]);
    loopAt(H, 0, -15.8, 0, -1, 0.65, 1.6); loopAt(H, 0, -31.8, 0, -1, 0.65, 1.6); bumps(H, T, [[-2, -22, 0.55]]); bowl(H, 2, -42); bumps(H, T, [[3.2, -38, 0.5]]); zoneR(H, M.MUD, -5, -44, -2.5, -46); return H; } },
  // Lava Flow: one belt pushes right, the next pushes up. Aim for where they leave you.
  { par:3, f:function(T){ var H = hole([rm(-7, 0, 7, -36)], [0, -2.5], [-3, -31]); belt(H, -7, -10, 7, -14, 6, 0); belt(H, 0, -14.1, 7, -24, 0, -5); bumps(H, T, [[-3, -19, 0.6]]); zoneR(H, M.MUD, -7, -34, 7, -36); bowl(H, -3, -31); bumps(H, T, [[-5, -5, 0.5]]); pads(H, [[3.5, -28, 0.6]]); return H; } },
  // Lava Slope: the whole slope leans right. Bank off the rocks and let the lean bring you back.
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -36)], [-2, -2.5], [3, -31]); H.comps.push({ k:'plane', gx:-0.028, gy:0 }); pads(H, [[-2, -13, 0.7], [3, -19, 0.7], [-1, -25, 0.7]]); flatAt(H, 3, -31); bowl(H, 3, -31); bumps(H, T, [[-4.4, -32, 0.5], [4.6, -7, 0.5]]); return H; } },
  // River of Fire: ride the stream down to the lower floor, past the lava pool.
  { par:3, three:2, f:function(T){ var H = hole([rm(4, 0, 12, -12), rm(-8, -30, 4, -44, -2)], [8, -2.5], [-3, -40]); river(H, [[8, -11.5], [8, -16], [0, -18], [-4, -22], [-4, -26], [0, -30.5]], 1.8, 7.5, 0, -2);
    zoneR(H, M.WATER, 1, -40, 4, -44); blk(H, T, 0.7, -40, 1, -44); pads(H, [[1, -35, 0.7]]); bowl(H, -3, -40); bumps(H, T, [[10, -6, 0.6]]); zoneR(H, M.MUD, -8, -42, -5, -44); return H; } },
  // Crater: the cup is in a pen, open on one side only, under a rock sliding across.
  { par:3, three:2, f:function(T){ var H = hole([rm(-6, 0, 6, -36)], [0, -2.5], [3, -30]); pen(H, T, 3, -30); slider(H, T, -22, -4, 4, 2.2, 0); bumps(H, T, [[-3, -14, 0.6]]); pads(H, [[-4, -24, 0.6]]); zoneR(H, M.MUD, -6, -34, -3, -36); return H; } },
  // Eruption: two lava belts and two gates, and ash at the end to stop you.
  { par:3, f:function(T){ var H = hole([rm(-4, 0, 4, -48)], [0, -2.5], [0, -44]); belt(H, -4, -8, 4, -16, 0, -4); gateWall(H, T, -22, -4, 4, -1.1, 1.1, 2.2, 0, 1); belt(H, -4, -26, 4, -32, 0, -4); gateWall(H, T, -38, -4, 4, -1.1, 1.1, 2.4, 0.5, -1);
    zoneR(H, M.MUD, -4, -46.5, 4, -48); bowl(H, 0, -44); bumps(H, T, [[2.4, -4.5, 0.45]]); return H; } },
  // Lava Leap: off the ramp over the lava pit, then through the bounce rocks and round the post.
  { par:3, three:2, f:function(T){ var H = hole([rm(-4, 0, 4, -12), rm(-4, -11.9, 4, -15.1), rm(-5, -15, 5, -34)], [0, -2.5], [1.5, -30.5]); jump(H, 0, -12, 0, -1, 2.6, 8, { h:0.7, ang:38 }); pads(H, [[-2.5, -22, 0.7], [2.5, -25.5, 0.7]]); bumps(H, T, [[0.4, -27.6, 0.5]]); bowl(H, 1.5, -30.5); bumps(H, T, [[-3, -6, 0.5]]); zoneR(H, M.MUD, -5, -32, -2.5, -34); return H; } },
  // Obsidian Bridge: a spinner, a bridge over the lava, a three armed spinner, and the cup.
  { par:3, three:2, f:function(T){ var H = hole([rm(-5, 0, 5, -18), rm(-5, -17.9, 5, -21.1), rm(-5, -21, 5, -40)], [0, -2.5], [0, -36]); spinner(H, T, 0, -11, 2.4, 1.6, 2); zoneR(H, M.WATER, -5, -18, 5, -21); drawb(H, -1.4, -18, 1.4, -21, 3, 0.2, 0.55);
    blk(H, T, -5, -17.4, -1.4, -18); blk(H, T, 1.4, -17.4, 5, -18); spinner(H, T, 0, -28, 2.4, -1.8, 3); bowl(H, 0, -36); pads(H, [[-3.6, -33, 0.6], [3.6, -33, 0.6]]); return H; } },
  // Fire Mill: a turning rock, a windmill wall to wall, and two bounce rocks at the top.
  { par:3, f:function(T){ var H = hole([rm(-7, 0, 7, -44)], [0, -2.5], [0, -39]); disc(H, 0, -12, 2.6, 1.4); millAt(H, T, -24, 7, 1.4); pads(H, [[-3, -34, 0.7], [3, -34, 0.7]]); bowl(H, 0, -39); bumps(H, T, [[-4.5, -6, 0.5], [4.5, -6, 0.5]]); return H; } },
  // The Summit: up the ramp lane, off the bounce rock, round the loop, over the jump and through the last gate.
  { par:5, three:4, sig:true, f:function(T){ var H = hole([rm(-5, 0, 5, -12), rm(-6, -16, 6, -26, 0.8), pg([[-6, -26], [6, -26], [0.8, -29.6], [-0.8, -29.6]], 0.8), rm(-0.8, -29.5, 0.8, -34, 0.8), rm(-6, -33.9, 6, -42, 0.8), rm(-6, -41.9, 6, -45.1, 0.8), rm(-6, -45, 6, -58, 0.8)], [0, -2.5], [2, -55]);
    climb(H, 3, -12, -16, 2.4); pads(H, [[-3, -21, 0.7]]); loopAt(H, 0, -31.6, 0, -1, 0.8, 1.6); jump(H, 0, -42, 0, -1, 2.4, 12, { h:0.9, ang:40 }); gateWall(H, T, -50, -6, 6, -1.2, 1.2, 2.6, 0.3, 1); flatAt(H, 2, -55); bumps(H, T, [[-3.5, -6, 0.55]]); zoneR(H, M.MUD, -6, -56, -3, -58); return H; } },
  // ---- 9 SKY ISLANDS: islands in the clouds. Haystacks that stop a ball dead, the drop to keep out of, and blimps drifting through.
  // Cloud Hop: up the lane between two cloud banks, then round the balloons to the cup.
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -34)], [0, -2.5], [0, -30]); blk(H, T, -6, -12, -2, -13.4); blk(H, T, 2, -12, 6, -13.4); bumps(H, T, [[-3, -19, 0.6], [3, -19, 0.6], [0, -23, 0.6], [-4, -6, 0.5], [4, -6, 0.5]]);
    zoneR(H, M.MUD, -6, -32, -3, -34); zoneR(H, M.MUD, 3, -32, 6, -34); bowl(H, 0, -30); board(H, T, 2.164, -32.04, -2.236, -31.96, 0.35); bowl(H, 0, -30, 2.6, 0.17); return H; } },
  // Haystacks: the squares are hay. Hop round them, or roll straight up the middle and pay for it.
  { par:3, f:function(T){ var H = hole([rm(-5, 0, 5, -34)], [0, -2.5], [2, -30]); zoneR(H, M.MUD, -1.4, -8, 1.4, -10.8); zoneR(H, M.MUD, -2.9, -11, -0.1, -13.8); zoneR(H, M.MUD, 0.1, -11, 2.9, -13.8);
    zoneR(H, M.MUD, -1.4, -14, 1.4, -16.8); zoneR(H, M.MUD, -2.9, -17, -0.1, -19.8); zoneR(H, M.MUD, 0.1, -17, 2.9, -19.8); zoneR(H, M.MUD, -1.4, -20, 1.4, -22.8); bumps(H, T, [[-3, -26, 0.6], [0, -27.2, 0.5]]); bowl(H, 2, -30); return H; } },
  // Bounce House: four bounce pads, one in each corner, and one in the middle. The cup is up the narrow end.
  { par:3, f:function(T){ var H = hole([rm(-5, 0, 5, -12), rm(-8, -12, 8, -30), rm(-3, -30, 3, -38)], [0, -2.5], [0, -35]); pads(H, [[-4, -16.5, 0.7], [4, -16.5, 0.7], [-4, -25.5, 0.7], [4, -25.5, 0.7]]);
    bumps(H, T, [[0, -21, 0.8], [1.4, -33, 0.45]]); zoneR(H, M.MUD, -8, -12, -5, -14); zoneR(H, M.MUD, 5, -28, 8, -30); zoneR(H, M.MUD, -3, -37, -1.5, -38); bowl(H, 0, -35); board(H, T, 2.262, -36.928, -2.134, -37.068, 0.35); bowl(H, 0, -35, 2.6, 0.17); return H; } },
  // Balloon Field: two rows of balloons, a blimp drifting between them, and the cup up top.
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -36)], [0, -2.5], [-2, -32]); bumps(H, T, [[-4.5, -12, 0.45], [-1.5, -12, 0.45], [1.5, -12, 0.45], [4.5, -12, 0.45], [-3, -17, 0.45], [0, -17, 0.45], [3, -17, 0.45]]);
    slider(H, T, -23, -4, 4, 2.4, 0.2); zoneR(H, M.MUD, -6, -34, -4, -36); bowl(H, -2, -32); return H; } },
  // Weather Vane: the vane swings round the pole in the middle of the island. Time it.
  { par:3, three:2, f:function(T){ var H = hole([rm(-6, 0, 6, -34)], [0, -2.5], [1.5, -29]); spinner(H, T, 0, -15, 2.8, 1.3, 2); bumps(H, T, [[-3.5, -22, 0.55], [3.5, -23, 0.55], [-0.8, -25.5, 0.5]]); pads(H, [[4.6, -16, 0.6]]);
    zoneR(H, M.MUD, -6, -7, -3.5, -10); zoneR(H, M.MUD, 3.5, -7, 6, -10); zoneR(H, M.MUD, -6, -32, -3, -34); bowl(H, 1.5, -29); return H; } },
  // Sky Steps: down from the top island to the one below, and round the balloons at the bottom.
  { par:3, three:2, f:function(T){ var H = hole([rm(-10, 0, -2, -14), rm(-1, -25, 9, -38, -1.5)], [-6, -2.5], [4, -34]); river(H, [[-6, -13], [-6, -18], [-1, -22], [4, -22], [4, -26]], 1.8, 6, 0, -1.5);
    bumps(H, T, [[-6, -8, 0.6], [-8.6, -4.5, 0.5], [6.5, -31, 0.5], [1.5, -30.5, 0.5]]); zoneR(H, M.MUD, -1, -27.5, 2, -29); zoneR(H, M.MUD, 6, -36, 9, -38); bowl(H, 4, -34); return H; } },
  // Sky Bridge: two planks over the drop, one up while the other is down. Curbs keep a stray ball up.
  { par:3, f:function(T){ var H = hole([rm(-5, 0, 5, -12), rm(-5, -11.9, 5, -15.6), rm(-5, -15.5, 5, -34)], [0, -2.5], [1.5, -30]); zoneR(H, M.WATER, -5, -12, 5, -15.5);
    drawb(H, -3.6, -12, -1, -15.5, 3.0, 0, 0.55); drawb(H, 1, -12, 3.6, -15.5, 3.0, 1.5, 0.55); blk(H, T, -5, -11.4, -3.6, -12); blk(H, T, -1, -11.4, 1, -12); blk(H, T, 3.6, -11.4, 5, -12);
    bumps(H, T, [[-2, -22, 0.6], [2.5, -25, 0.55]]); pads(H, [[-3.5, -27, 0.6]]); zoneR(H, M.MUD, -5, -32, -2, -34); bowl(H, 1.5, -30); return H; } },
  // Hay Bale: the hay fills the middle of the island. A path runs through it, if you can find the line.
  { par:3, three:2, f:function(T){ var H = hole([rm(-6, 0, 6, -36)], [3, -2.5], [-3, -32]); zoneR(H, M.MUD, -6, -11, 6, -23); zoneR(H, M.GREEN, 0.5, -11, 2.5, -18.5); zoneR(H, M.GREEN, -3, -17, 2.5, -18.5); zoneR(H, M.GREEN, -3, -17, -1, -23);
    bumps(H, T, [[-4, -6, 0.5], [4.5, -27, 0.55], [-0.5, -28.5, 0.55]]); zoneR(H, M.MUD, 3.5, -34, 6, -36); bowl(H, -3, -32); return H; } },
  // Drift: the whole middle of the island turns. Ride it round or play past it.
  { par:3, three:2, f:function(T){ var H = hole([rm(-7, 0, 7, -36)], [0, -2.5], [0, -32]); disc(H, 0, -17, 3.2, 1.5); bumps(H, T, [[-4.6, -12, 0.55], [4.6, -12, 0.55], [-4.6, -22, 0.55], [4.6, -22, 0.55], [0, -26, 0.5]]);
    zoneR(H, M.MUD, -7, -34, -4, -36); zoneR(H, M.MUD, 4, -34, 7, -36); bowl(H, 0, -32); return H; } },
  // Floating Island: the island ends at the drop. Roll onto the floating island while it waits, ride it over, and it sets you down on the cup island. Hay and balloons up there.
  { par:3, three:2, f:function(T){ var H = hole([rm(2, 0, 8, -20.1), rm(-14, -19.9, 8, -24.1), rm(-14, -23.9, -6, -46)], [5, -2.5], [-10, -42]); zoneR(H, M.WATER, -6, -20, 8, -24);
    ferry(H, 3.6, -19.6, 8, -24, -10, 0, 2.2, 1.5, 0); bumps(H, T, [[4, -10, 0.55], [6.5, -15, 0.5], [-8, -33, 0.6], [-12, -30, 0.55]]); pads(H, [[-7.5, -38, 0.6]]);
    zoneR(H, M.MUD, -14, -44, -11, -46); zoneR(H, M.MUD, 2, -6, 4, -9); bowl(H, -10, -42, 1.7, 0.12); return H; } },
  // Jet Stream: one wind blows right, the next blows left. Aim for where they leave you.
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -36)], [0, -2.5], [-2.5, -32]); belt(H, -6, -10, 6, -14, 5, 0); belt(H, -6, -20, 6, -24, -5, 0);
    bumps(H, T, [[1.5, -17, 0.6], [-4.5, -6, 0.5], [2.5, -28, 0.5]]); zoneR(H, M.MUD, 3, -34, 6, -36); bowl(H, -2.5, -32); return H; } },
  // Kite Diamond: round the kites. Two of them bounce the ball back in, and one flies in the middle.
  { par:3, f:function(T){ var H = hole([pg([[-2, 0], [2, 0], [9, -15], [0, -31], [-9, -15]])], [0, -2.5], [0, -26.5]); pads(H, [[-6.2, -15, 0.7], [6.2, -15, 0.7]]);
    bumps(H, T, [[0, -15, 0.8], [-2.4, -21.5, 0.5], [2.4, -21.5, 0.5]]); zoneR(H, M.MUD, -3.4, -8, -1.4, -10); zoneR(H, M.MUD, 1.4, -8, 3.4, -10); bowl(H, 0, -26.5); return H; } },
  // Floating Gates: two gates on two clocks, and the cup at the end of the island.
  { par:3, three:2, f:function(T){ var H = hole([rm(-5, 0, 5, -40)], [0, -2.5], [2, -36]); gateWall(H, T, -12, -5, 5, -1.1, 1.1, 2.4, 0, 1); gateWall(H, T, -24, -5, 5, 1.0, 3.2, 2.8, 0.4, -1);
    bumps(H, T, [[-2.5, -18, 0.55], [-1, -30, 0.55]]); zoneR(H, M.MUD, -5, -38, -2, -40); bowl(H, 2, -36); return H; } },
  // Rainbow Loop: through the loop, off the pad, and over the drop off the ramp.
  { par:3, three:2, f:function(T){ var H = hole([rm(-4, 0, 4, -10), pg([[-4, -10], [4, -10], [0.8, -13.6], [-0.8, -13.6]]), rm(-0.8, -13.5, 0.8, -18), rm(-5, -17.9, 5, -26), rm(-5, -25.9, 5, -28.9), rm(-5, -28.8, 5, -42)], [0, -2.5], [1.5, -38]);
    loopAt(H, 0, -15.6, 0, -1, 0.7, 1.6); pads(H, [[-3, -22, 0.6]]); jump(H, 0, -26, 0, -1, 2.4, 10, { h:0.8, ang:38 }); bumps(H, T, [[-2.8, -33, 0.55], [3, -5, 0.5]]); zoneR(H, M.MUD, -5, -40, -2.5, -42); bowl(H, 1.5, -38); return H; } },
  // Cloud Gap: the island is a U, up one side and back down the other. Or find the gap in the middle cloud wall: it lines up with the cup.
  { par:3, f:function(T){ var H = hole([rm(-9, 0, 9, -32)], [-5, -2.5], [5, -10]); blk(H, T, -0.6, 0, 0.6, -6); blk(H, T, -0.6, -7.4, 0.6, -23); secret(H, -0.6, -6, 0.6, -7.4);
    zoneR(H, M.MUD, -9, -26, 9, -27.5); zoneR(H, M.GREEN, -1, -26, 1, -27.5); bumps(H, T, [[-5, -14, 0.6], [-5.5, -20, 0.55], [5, -16, 0.6], [5.5, -22, 0.55], [6.5, -27, 0.6]]); bowl(H, 5, -10); return H; } },
  // Leap of Faith: off the ramp over the drop, and land on the floating island as it drifts past. It carries you across, then up to the castle green.
  { par:3, three:2, f:function(T){ var H = hole([rm(-3, 0, 3, -14.1), rm(-12, -13.9, 8, -19.1), rm(-12, -18.9, -6, -38)], [0, -2.5], [-9, -34]); zoneR(H, M.WATER, -6, -14, 8, -19);
    jump(H, 0, -13.5, 0, -1, 0.05, 2.4, { m:M.GREEN, h:0.5, ang:30 }); blk(H, T, -3, -12.9, -1.2, -14.1); blk(H, T, 1.2, -12.9, 3, -14.1);
    ferry(H, 3.6, -13.6, 8, -19, -10, 0, 2.2, 1.2, 0.3); bumps(H, T, [[-2, -7, 0.6], [-7.5, -27, 0.6], [-10.5, -31, 0.5]]); pads(H, [[2, -9, 0.55]]); zoneR(H, M.MUD, -12, -36, -10, -38); bowl(H, -9, -34, 1.7, 0.12); return H; } },
  // Cloud Mill: the windmill's sails swing across the door. The sails decide it.
  { par:3, f:function(T){ var H = hole([rm(-7, 0, 7, -40)], [0, -2.5], [-2, -35]); millAt(H, T, -18, 7, 1.2); bumps(H, T, [[2.5, -29, 0.55], [-4, -8, 0.5], [4, -8, 0.5]]); zoneR(H, M.MUD, -7, -38, -4, -40); bowl(H, -2, -35); return H; } },
  // Castle in the Clouds: up the ramp, past the turning island, over the drawbridge and through the flight path to the castle.
  { par:3, three:2, sig:true, f:function(T){ var H = hole([rm(-5, 0, 5, -12), rm(-6, -16, 6, -30, 0.6), rm(-6, -29.9, 6, -33.1, 0.6), rm(-6, -33, 6, -48, 0.6)], [0, -2.5], [2, -44]);
    climb(H, -3, -12, -16, 2.4, 0.3); disc(H, 1, -22, 2.4, 1.3); pads(H, [[-4, -25, 0.6]]); zoneR(H, M.WATER, -6, -30, 6, -33); drawb(H, -1.4, -30, 1.4, -33, 3.4, 0.3, 0.55);
    blk(H, T, -6, -29.4, -1.4, -30); blk(H, T, 1.4, -29.4, 6, -30); slider(H, T, -38, -4, 4, 2.6, 0.2); bumps(H, T, [[-3, -41, 0.55], [3.5, -6, 0.5]]); zoneR(H, M.MUD, -6, -47, 6, -48); flatAt(H, 2, -44); return H; } },
  // ---- 10 DINO VALLEY: slick clay that runs on, swamp pools that keep what they catch, and logs that do not stop for anybody.
  // First Tracks: two bands of slick clay across the slope, and the eggs between them.
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -36)], [0, -2.5], [-1.5, -32]); zoneR(H, M.ICE, -6, -9, 6, -13); zoneR(H, M.ICE, -6, -18, 6, -22); bumps(H, T, [[-3, -15.5, 0.6], [3, -15.5, 0.6], [0, -24.5, 0.6], [-4.5, -27, 0.5], [4.5, -6, 0.5]]);
    zoneR(H, M.MUD, -6, -34, 6, -36); zoneR(H, M.MUD, 3.5, -28, 6, -30); bowl(H, -1.5, -32); return H; } },
  // Egg Alley: weave through the eggs while a log rolls up and down the middle.
  { par:3, f:function(T){ var H = hole([rm(-7, 0, 7, -40)], [0, -2.5], [2, -36]); bumps(H, T, [[-3, -10, 0.7], [3, -14, 0.7], [-2.5, -19, 0.7], [3.5, -23, 0.7], [-3, -28, 0.7]]); vslider(H, T, 0, -12, -24, 3.0, 0);
    zoneR(H, M.ICE, -7, -30, 7, -32); zoneR(H, M.MUD, -7, -38, -4, -40); zoneR(H, M.MUD, 4.5, -6, 7, -9); bowl(H, 2, -36); return H; } },
  // Swamp Hop: three swamp pools across the slope. Thread them, and keep off the edges.
  { par:3, f:function(T){ var H = hole([rm(-7, 0, 7, -36)], [0, -2.5], [2, -32]); zoneC(H, M.WATER, -3.4, -11.5, 1.5); zoneC(H, M.WATER, 4.8, -20, 1.6); zoneC(H, M.WATER, -4.4, -27, 1.4);
    bumps(H, T, [[1.6, -13, 0.55], [-1.4, -21, 0.55], [4.5, -27, 0.5]]); zoneR(H, M.MUD, -7, -6, -4, -9); zoneR(H, M.MUD, 4, -34, 7, -36); bowl(H, 2, -32); return H; } },
  // Bone Wall: a gap in the first wall, clay behind it, and a gap at the other end of the second.
  { par:3, three:2, f:function(T){ var H = hole([rm(-6, 0, 6, -38)], [0, -2.5], [-2, -34]); blk(H, T, -6, -11, -1.5, -12.4); blk(H, T, 1.5, -11, 6, -12.4); zoneR(H, M.ICE, -6, -13, 6, -19);
    blk(H, T, -6, -22, 2, -23.4); blk(H, T, 4, -22, 6, -23.4); bumps(H, T, [[0, -28, 0.55], [-4, -29, 0.5], [3.5, -6, 0.5]]); zoneR(H, M.MUD, -6, -36, 6, -38); bowl(H, -2, -34); return H; } },
  // Tail Swipe: two tails swinging across the run, and clay between them.
  { par:3, three:2, f:function(T){ var H = hole([rm(-6, 0, 6, -40)], [0, -2.5], [1.5, -36]); spinner(H, T, -2, -14, 2.4, 1.4, 2); spinner(H, T, 2, -25, 2.4, -1.6, 2); bumps(H, T, [[3.5, -14, 0.55], [-3.5, -25, 0.55], [-1, -31, 0.5]]);
    zoneR(H, M.ICE, -6, -18.5, 6, -20.5); zoneR(H, M.MUD, -6, -38, -3, -40); zoneR(H, M.MUD, 4, -6, 6, -9); bowl(H, 1.5, -36); return H; } },
  // Raptor Den: the cup is in the den, open on one side, and a boulder slides past its mouth.
  { par:3, three:2, f:function(T){ var H = hole([rm(-7, 0, 7, -36)], [0, -2.5], [3.5, -30]); pen(H, T, 3.5, -30); slider(H, T, -21, -4, 4, 2.4, 0); bumps(H, T, [[-3, -12, 0.6], [-4.5, -26, 0.6], [0.6, -24, 0.55]]); pads(H, [[4.6, -12, 0.6]]);
    zoneR(H, M.ICE, -7, -15, 7, -17); zoneR(H, M.MUD, -7, -34, -4, -36); return H; } },
  // Dino Crossing: logs cross the run both ways, and two more roll up and down it.
  { par:3, f:function(T){ var H = hole([rm(-7, 0, 7, -40)], [0, -2.5], [-2, -36]); slider(H, T, -11, -5, 5, 2.4, 0); vslider(H, T, -3.5, -15, -25, 2.6, 0.3); vslider(H, T, 3.5, -25, -15, 2.6, 0.7); slider(H, T, -29, 5, -5, 2.8, 0.5);
    zoneR(H, M.ICE, -7, -17, -5.6, -23); bumps(H, T, [[0, -20, 0.55], [-5, -6, 0.5], [5, -6, 0.5]]); zoneR(H, M.MUD, 2.5, -38, 7, -40); bowl(H, -2, -36); return H; } },
  // Log Bridges: two log bridges over two swamp pools, each on its own clock, with clay between. Curbs keep a stray ball out.
  { par:3, three:2, f:function(T){ var H = hole([rm(-6, 0, 6, -12), rm(-6, -11.9, 6, -15.6), rm(-6, -15.5, 6, -25), rm(-6, -24.9, 6, -28.6), rm(-6, -28.5, 6, -40)], [0, -2.5], [2, -36]);
    zoneR(H, M.WATER, -6, -12, 6, -15.5); drawb(H, -2.6, -12, 0.2, -15.5, 3.0, 0, 0.55); zoneR(H, M.ICE, -6, -17, 6, -22); zoneR(H, M.WATER, -6, -25, 6, -28.5); drawb(H, 1.2, -25, 4, -28.5, 2.8, 0.4, 0.55);
    blk(H, T, -6, -11.4, -2.6, -12); blk(H, T, 0.2, -11.4, 6, -12); blk(H, T, -6, -24.4, 1.2, -25); blk(H, T, 4, -24.4, 6, -25); bumps(H, T, [[-2, -32, 0.55], [4, -6, 0.5]]); zoneR(H, M.MUD, -6, -38, -3, -40); bowl(H, 2, -36); return H; } },
  // Jungle Falls: ride the creek down off the ridge to the valley floor, past the pool at the bottom.
  { par:3, three:2, f:function(T){ var H = hole([rm(-12, 0, -4, -12), rm(-4, -30, 8, -44, -2)], [-8, -2.5], [3, -40]); river(H, [[-8, -11.5], [-8, -16], [0, -18], [4, -22], [4, -26], [0, -30.5]], 1.8, 7.5, 0, -2);
    zoneR(H, M.WATER, -4, -40, -1, -44); blk(H, T, -1, -40, -0.7, -44); zoneR(H, M.ICE, -4, -33, 8, -35); bumps(H, T, [[-10, -6, 0.6], [-6, -6, 0.5], [5.5, -37, 0.55]]); pads(H, [[0, -36.5, 0.6]]); zoneR(H, M.MUD, 5, -42, 8, -44); bowl(H, 3, -40); return H; } },
  // Dig Site: the floor round the dig turns, and the eggs sit all round it.
  { par:3, f:function(T){ var H = hole([rm(-7, 0, 7, -38)], [0, -2.5], [-2, -34]); disc(H, 0, -18, 3, -1.4); bumps(H, T, [[-4.8, -14, 0.55], [4.8, -14, 0.55], [-4.8, -22, 0.55], [4.8, -22, 0.55], [0, -26.5, 0.5], [2.5, -30, 0.5]]);
    zoneR(H, M.ICE, -7, -8, 7, -10); zoneR(H, M.MUD, 4, -36, 7, -38); bowl(H, -2, -34); return H; } },
  // Raptor Leap: two ravines in a row, two jumps, and clay on the far side.
  { par:3, three:2, f:function(T){ var H = hole([rm(-5, 0, 5, -10), rm(-5, -9.9, 5, -12.3), rm(-5, -12.2, 5, -18), rm(-5, -17.9, 5, -20.3), rm(-5.5, -20.2, 5.5, -36)], [0, -2.5], [1.5, -31]);
    jump(H, 0, -10, 0, -1, 2.2, 10, { h:0.6, ang:34 }); jump(H, 0, -18, 0, -1, 2.2, 10, { h:0.6, ang:34 }); zoneR(H, M.ICE, -5.5, -22, 5.5, -26); bumps(H, T, [[-2, -28.5, 0.55], [3.5, -6, 0.5]]); zoneR(H, M.MUD, -5.5, -34, 5.5, -36); bowl(H, 1.5, -31); return H; } },
  // Mudslide: one slide drifts left, clay behind it, and the next drifts right.
  { par:3, f:function(T){ var H = hole([rm(-7, 0, 7, -38)], [0, -2.5], [2.5, -34]); belt(H, -7, -10, 7, -14, -5, 0); zoneR(H, M.ICE, -7, -14, 7, -18); belt(H, -7, -21, 7, -25, 5, 0);
    bumps(H, T, [[-2, -28, 0.6], [-4.5, -5, 0.5], [4, -30, 0.5]]); zoneR(H, M.MUD, -7, -36, -3, -38); bowl(H, 2.5, -34); return H; } },
  // Rib Cage: three gates of bone in the pass, three clocks, and the gaps never line up.
  { par:4, three:3, f:function(T){ var H = hole([rm(-6, 0, 6, -46)], [0, -2.5], [2, -42]); gateWall(H, T, -13, -6, 6, -3.5, -1.3, 2.2, 0, 1); gateWall(H, T, -24, -6, 6, 1.3, 3.5, 2.6, 0.3, -1); gateWall(H, T, -35, -6, 6, -1.1, 1.1, 3.0, 0.6, 1);
    zoneR(H, M.ICE, -6, -15, 6, -17.5); bumps(H, T, [[-3, -18.5, 0.5], [3.5, -29.5, 0.5]]); bowl(H, 2, -42); return H; } },
  // Fern Loop: round the loop, across the clay, past the tail.
  { par:3, three:2, f:function(T){ var H = hole([rm(-4, 0, 4, -12), pg([[-4, -12], [4, -12], [0.8, -15.6], [-0.8, -15.6]]), rm(-0.8, -15.5, 0.8, -19.5), rm(-6, -19.4, 6, -38)], [0, -2.5], [-2, -34]);
    loopAt(H, 0, -17.5, 0, -1, 0.65, 1.6); zoneR(H, M.ICE, -6, -21, 6, -25); spinner(H, T, 1.5, -28, 2.0, 1.5, 2); bumps(H, T, [[2.4, -6, 0.5], [-4.4, -28, 0.5]]); zoneR(H, M.MUD, -6, -36.5, 6, -38); bowl(H, -2, -34); return H; } },
  // Stomping Ground: logs cross top and bottom, and the middle of the ground turns.
  { par:3, f:function(T){ var H = hole([rm(-7, 0, 7, -42)], [0, -2.5], [0, -38]); slider(H, T, -10, -4.5, 4.5, 2.2, 0); disc(H, 0, -19, 2.6, 1.3); slider(H, T, -28, 4.5, -4.5, 2.6, 0.5); pads(H, [[-4.8, -19, 0.6], [4.8, -19, 0.6]]);
    bumps(H, T, [[-3, -33, 0.55], [3, -33, 0.55], [-5, -5, 0.5]]); zoneR(H, M.ICE, -7, -23, 7, -25); zoneR(H, M.MUD, -7, -40, -4, -42); bowl(H, 0, -38); return H; } },
  // Rex’s Den: the gate in the bone wall opens off its plate. Or find the crack the rex left in the wall: it lines up with the tee and the cup.
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -36)], [0, -2.5], [-4, -27]); blk(H, T, -6, -19.4, -3.6, -20.6); blk(H, T, -2.2, -19.4, -1.4, -20.6); blk(H, T, 1.4, -19.4, 6, -20.6); secret(H, -3.6, -19.4, -2.2, -20.6);
    switchDoor(H, T, -20, -1.4, 1.4, 4.5, -9, 4); pads(H, [[-4.6, -13, 0.6]]); bumps(H, T, [[-2.6, -10, 0.6], [1.2, -25.5, 0.55]]); zoneR(H, M.WATER, 2.5, -23, 6, -27); blk(H, T, 2.2, -23, 2.5, -27); zoneR(H, M.MUD, 3, -33, 6, -36); bowl(H, -4, -27); return H; } },
  // Rockslide: the whole slope runs down to the cup, clay at the top and bog to stop you.
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -40)], [0, -2.5], [1, -36]); H.comps.push({ k:'plane', gx:0, gy:0.02 }); zoneR(H, M.ICE, -6, -10, 6, -13); zoneR(H, M.MUD, -6, -16, -1, -18.5); zoneR(H, M.MUD, 1, -23, 6, -25.5);
    bumps(H, T, [[2.5, -19.5, 0.6], [-2.5, -28, 0.6], [3.5, -31, 0.5]]); pads(H, [[-4.5, -33, 0.6]]); zoneR(H, M.MUD, -6, -38.5, 6, -40); flatAt(H, 1, -36); bowl(H, 1, -36); return H; } },
  // The Long Neck: up the ramp lane, across the clay, over the swamp off the jump, across the log bridge and past the tail to the top.
  { par:4, three:3, sig:true, f:function(T){ var H = hole([rm(-5, 0, 5, -12), rm(-7, -16, 7, -30, 0.8), rm(-7, -29.9, 7, -33.1, 0.8), rm(-7, -33, 7, -42, 0.8), rm(-7, -41.9, 7, -45.1, 0.8), rm(-7, -45, 7, -58, 0.8)], [0, -2.5], [-2, -54]);
    climb(H, 3, -12, -16, 2.4); zoneR(H, M.ICE, -7, -18, 7, -21); bumps(H, T, [[-3, -25, 0.7], [3, -26, 0.6]]); jump(H, 0, -30, 0, -1, 3.0, 14, { h:0.9, ang:40 }); zoneR(H, M.WATER, -7, -42, 7, -45); drawb(H, -1.4, -42, 1.4, -45, 3, 0.2, 0.55);
    blk(H, T, -7, -41.4, -1.4, -42); blk(H, T, 1.4, -41.4, 7, -42); spinner(H, T, 1.5, -50, 2.0, 1.4, 2); bumps(H, T, [[-4, -49, 0.6]]); zoneR(H, M.MUD, 3, -56, 7, -58); flatAt(H, -2, -54); return H; } },
  // ---- 11 ICE AGE: the glaciers are moving. Glacier ice, tar pits, floes that carry the ball, and a herd of mammoths that does not stop for anybody.
  // The Thaw: two gates of ice on their own clocks, glacier ice between them.
  { par:3, three:2, f:function(T){ var H = hole([rm(-6, 0, 6, -38)], [0, -2.5], [-2, -34]); gateWall(H, T, -11, -6, 6, -1.4, 1.4, 2.4, 0, 1); zoneR(H, M.ICE, -6, -13, 6, -17);
    gateWall(H, T, -21, -6, 6, 1.2, 3.8, 2.8, 0.4, -1); bumps(H, T, [[-3, -27, 0.55], [2.5, -29, 0.55], [4, -6, 0.5]]); zoneR(H, M.MUD, -6, -36, 6, -38); bowl(H, -2, -34); return H; } },
  // Mammoth Trail: two strips of tundra moss across the valley, and a mammoth walking each gap.
  { par:3, three:2, f:function(T){ var H = hole([rm(-7, 0, 7, -38)], [0, -2.5], [2, -34]); zoneR(H, M.MUD, -7, -10, 2, -13); slider(H, T, -11.5, 2.6, 6.4, 2.4, 0, 2.0); zoneR(H, M.MUD, -2, -20, 7, -23); slider(H, T, -21.5, -6.4, -2.6, 2.6, 0.5, 2.0);
    bumps(H, T, [[-3, -16, 0.6], [3.5, -26.5, 0.55], [-4, -29, 0.55]]); pads(H, [[-5.5, -6, 0.6]]); zoneR(H, M.ICE, -7, -25, 7, -27); zoneR(H, M.MUD, 4.5, -36, 7, -38); bowl(H, 2, -34); return H; } },
  // Saber Tooth: four fangs turn in a ring of boulders, and the cup is behind a wall of ice.
  { par:3, three:2, f:function(T){ var H = hole([rm(-7, 0, 7, -38)], [0, -2.5], [4.5, -34]); spinner(H, T, 0, -18, 2.6, 1.2, 4); blk(H, T, 1.4, -29.4, 7, -30.6); bumps(H, T, [[-3.2, -14.5, 0.55], [3.2, -14.5, 0.55], [-3.2, -21.5, 0.55], [3.2, -21.5, 0.55], [0, -25, 0.5], [-4.5, -29, 0.5]]);
    pads(H, [[-5.4, -18, 0.6], [5.4, -18, 0.6]]); zoneR(H, M.MUD, -7, -36, -4, -38); bowl(H, 4.5, -34); return H; } },
  // Meltwater: the melt pours off the glacier, and a mammoth walks across where it lands.
  { par:3, three:2, f:function(T){ var H = hole([rm(-12, 0, -4, -10), rm(-4, -28, 8, -42, -1.8)], [-8, -2.5], [4, -38]); river(H, [[-8, -9.5], [-8, -15], [-2, -18], [3, -22], [3, -28.5]], 1.8, 7, 0, -1.8);
    slider(H, T, -31.5, -2.5, 6.5, 2.6, 0.3, 2.6); zoneR(H, M.ICE, -4, -33.5, 8, -35); zoneR(H, M.WATER, -4, -38, -1, -42); blk(H, T, -1, -38, -0.7, -42); bumps(H, T, [[-10, -6, 0.6], [-6, -6, 0.5], [6.4, -40, 0.5]]); pads(H, [[1, -36.5, 0.6]]); zoneR(H, M.MUD, 6, -40.5, 8, -42); bowl(H, 4, -38); return H; } },
  // Ice Bridge: one ice bridge over the tar, and a fang turning on the far side.
  { par:3, three:2, f:function(T){ var H = hole([rm(-6, 0, 6, -14), rm(-6, -13.9, 6, -17.6), rm(-6, -17.5, 6, -38)], [0, -2.5], [2, -33]); zoneR(H, M.WATER, -6, -14, 6, -17.5); drawb(H, -1.4, -14, 1.4, -17.5, 3.2, 0, 0.55);
    blk(H, T, -6, -13.4, -1.4, -14); blk(H, T, 1.4, -13.4, 6, -14); zoneR(H, M.ICE, -6, -20, 6, -22); spinner(H, T, 1.5, -25.5, 2.2, 1.4, 2); bumps(H, T, [[-3, -28, 0.6], [3.5, -6, 0.5], [-3.5, -8, 0.5]]); pads(H, [[4.5, -29.5, 0.6]]); zoneR(H, M.MUD, -6, -36, -3, -38); bowl(H, 2, -33); return H; } },
  // Glacier Mill: sails across the door, and a floe behind the mill that carries everything sideways.
  { par:3, f:function(T){ var H = hole([rm(-7, 0, 7, -40)], [0, -2.5], [1, -35]); millAt(H, T, -14, 7, 1.3); belt(H, -7, -24, 7, -27, 3, 0); bumps(H, T, [[-3, -31, 0.55], [3, -8, 0.5], [-3, -8, 0.5]]);
    zoneR(H, M.MUD, -7, -38, -4, -40); bowl(H, 1, -35); return H; } },
  // Boulder Bounce: a room of boulders that throw the ball back harder than it came.
  { par:3, three:2, f:function(T){ var H = hole([pg([[-4, 0], [4, 0], [8, -12], [8, -26], [0, -38], [-8, -26], [-8, -12]])], [0, -2.5], [0, -32]); blk(H, T, -1.5, -9, 1.5, -10.5);
    pads(H, [[-4, -14, 0.7], [4, -14, 0.7], [0, -20, 0.7], [-4, -26, 0.6], [4, -26, 0.6]]); bumps(H, T, [[-6, -20, 0.5], [6, -20, 0.5]]); zoneR(H, M.ICE, -8, -16.5, 8, -17.5); zoneR(H, M.MUD, -8, -12, -5.5, -14); zoneR(H, M.MUD, 5.5, -12, 8, -14); bowl(H, 0, -32); return H; } },
  // Cave Ledges: up the right lane, round the ice wall, up the left lane to the top, past the fang and into the cave from the side.
  { par:4, three:3, f:function(T){ var H = hole([rm(-6, 0, 6, -14), rm(-6, -18, 6, -30, 0.8), rm(-6, -34, 6, -50, 1.6)], [0, -2.5], [3.5, -45]); climb(H, 3.5, -14, -18, 2.4); climb(H, -3.5, -30, -34, 2.4);
    blk(H, T, -6, -24.4, -0.4, -25.6); spinner(H, T, -0.5, -40, 2.0, 1.4, 2); pen(H, T, 3.5, -45); bumps(H, T, [[0, -8, 0.6], [-4, -44, 0.5]]); zoneR(H, M.ICE, -6, -20, 6, -21.5); zoneR(H, M.MUD, -6, -48, -3, -50); return H; } },
  // Frozen Crater: the floor is a bowl and the bottom of it turns.
  { par:3, three:2, f:function(T){ var H = hole([rm(-7, 0, 7, -38)], [0, -2.5], [-3, -33]); H.comps.push({ k:'crown', x:0, y:-19, rx:6, ry:6, a:-0.25 }); disc(H, 0, -19, 2.6, 1.3);
    bumps(H, T, [[-4.6, -14, 0.55], [4.6, -24, 0.55], [3, -29, 0.5], [-4.5, -6, 0.5]]); pads(H, [[4.6, -14, 0.6]]); blk(H, T, -7, -27, -0.6, -28.2); zoneR(H, M.ICE, -7, -9, 7, -10.5); zoneR(H, M.MUD, 3.5, -36, 7, -38); bowl(H, -3, -33); return H; } },
  // Iceberg Drift: the left floe runs up and the right one runs back, with a mammoth walking between them.
  { par:3, three:2, f:function(T){ var H = hole([rm(-7, 0, 7, -40)], [0, -2.5], [0, -36]); belt(H, -7, -8, -2.5, -30, 0, -4); belt(H, 2.5, -8, 7, -30, 0, 4); slider(H, T, -19, -2, 2, 2.4, 0, 1.6);
    bumps(H, T, [[0, -12, 0.6], [0, -26, 0.6], [-4, -33, 0.5]]); zoneR(H, M.ICE, -7, -31, 7, -32.5); zoneR(H, M.MUD, 4, -38, 7, -40); bowl(H, 0, -36); return H; } },
  // The Big Melt: a mammoth walks across the gap in the wall. Or find the crack the melt left: it lines up with the tee and the cup.
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -36)], [2, -2.5], [-4.6, -30]); blk(H, T, -6, -19.4, -2.6, -20.6); blk(H, T, -1.8, -19.4, 1.2, -20.6); blk(H, T, 3.8, -19.4, 6, -20.6); secret(H, -2.6, -19.4, -1.8, -20.6);
    gateAt(H, T, -20, 1.2, 3.8, 2.6, 0, 1); zoneR(H, M.ICE, -6, -13, 6, -16); bumps(H, T, [[4, -9, 0.6], [-4, -10, 0.55], [2.5, -26, 0.55]]); slider(H, T, -25.5, -5, 1, 2.6, 0.4, 2.0); zoneR(H, M.MUD, 3, -33, 6, -36); bowl(H, -4.6, -30); return H; } },
  // Tar Pits: jump the tar, then bring it round into the cave.
  { par:3, three:2, f:function(T){ var H = hole([rm(-5, 0, 5, -12), rm(-5, -11.9, 5, -15.1), rm(-6, -15, 6, -36)], [0, -2.5], [3.5, -31]); jump(H, 0, -12, 0, -1, 2.6, 10, { h:0.7, ang:36 });
    pen(H, T, 3.5, -31); slider(H, T, -22, -4, 4, 2.6, 0.2); bumps(H, T, [[-3, -26, 0.6], [-1, -33, 0.5], [3, -6, 0.5]]); pads(H, [[-4.5, -19, 0.6]]); zoneR(H, M.ICE, -6, -17, 6, -18); zoneR(H, M.MUD, -6, -34, -3.5, -36); return H; } },
  // Cave Doors: two doors, two plates. Each putt has to roll over its plate on the way through its door.
  { par:4, three:3, f:function(T){ var H = hole([rm(-6, 0, 6, -44)], [2.5, -2.5], [-3, -40]); blk(H, T, -6, -18, -1.4, -19.2); blk(H, T, 1.4, -18, 6, -19.2); switchDoor(H, T, -18.6, -1.4, 1.4, 5.1, -5.9, 4.5);
    blk(H, T, -6, -32, -1.4, -33.2); blk(H, T, 1.4, -32, 6, -33.2); switchDoor(H, T, -32.6, -1.4, 1.4, -2.2, -27, 4.5); bumps(H, T, [[-4.4, -11, 0.6], [3.6, -27, 0.6]]); zoneR(H, M.ICE, -6, -21, 6, -22.5); zoneR(H, M.MUD, 3, -42, 6, -44); bowl(H, -3, -40); return H; } },
  // Glacier Steps: three tiers of glacier. Soft off each step, and the middle one is ice.
  { par:3, three:2, f:function(T){ var H = hole([rm(-6, 0, 6, -38)], [-3, -2.5], [3, -34]); H.comps.push({ k:'ridge', x:0, y:-10, nx:0, ny:-1, w:0.9, a:-0.6 }, { k:'ridge', x:0, y:-25, nx:0, ny:-1, w:0.9, a:-0.6 });
    zoneR(H, M.ICE, -6, -13, 6, -22); blk(H, T, -2.2, -17, 6, -18.2); bumps(H, T, [[-4, -21, 0.55], [0, -30, 0.55], [4.5, -6, 0.5]]); pads(H, [[-4.5, -29, 0.6]]); zoneR(H, M.MUD, -6, -36, -3, -38); bowl(H, 3, -34); return H; } },
  // Hailstorm: a field of hailstones, and a floe across the middle of it.
  { par:3, f:function(T){ var H = hole([rm(-7, 0, 7, -40)], [0, -2.5], [-3, -36]); bumps(H, T, [[-2, -9, 0.45], [2.5, -11, 0.45], [-0.5, -14, 0.45], [4, -16, 0.45], [-3.5, -16, 0.45], [1.5, -27, 0.45], [-1.5, -30, 0.45], [4, -31, 0.45]]);
    belt(H, -7, -20, 7, -23, -4, 0); zoneR(H, M.MUD, 3.5, -38, 7, -40); bowl(H, -3, -36); return H; } },
  // Saber Pass: a gate, a turning floor between two blocks, then a mammoth. Time all three, or stop halfway.
  { par:3, three:2, f:function(T){ var H = hole([rm(-6, 0, 6, -50)], [0, -2.5], [2, -45]); gateWall(H, T, -14, -6, 6, -1.3, 1.3, 2.6, 0, 1); disc(H, 0, -24.5, 2.4, -1.3); blk(H, T, -6, -23.5, -2.6, -25.5); blk(H, T, 2.6, -23.5, 6, -25.5);
    slider(H, T, -35, -4, 4, 2.6, 0.4); bumps(H, T, [[-3, -18, 0.5], [3.5, -30, 0.5], [-3.5, -40, 0.5]]); zoneR(H, M.ICE, -6, -28, 6, -30); zoneR(H, M.MUD, 4, -48, 6, -50); bowl(H, 2, -45); return H; } },
  // Tundra Loop: round the loop, across the floe, and through the gate at the end of the valley.
  { par:3, three:2, f:function(T){ var H = hole([rm(-4, 0, 4, -12), pg([[-4, -12], [4, -12], [0.8, -15.6], [-0.8, -15.6]]), rm(-0.8, -15.5, 0.8, -19.5), rm(-6, -19.4, 6, -38)], [0, -2.5], [2, -35]);
    loopAt(H, 0, -17.5, 0, -1, 0.65, 1.6); belt(H, -6, -21, 6, -24, 4, 0); gateWall(H, T, -28, -6, 6, -3.6, -1, 2.8, 0.2, -1); bumps(H, T, [[2.4, -6, 0.5], [4, -31, 0.5]]); pads(H, [[-4.6, -25.5, 0.6]]); zoneR(H, M.MUD, -6, -36.5, -3, -38); bowl(H, 2, -35); return H; } },
  // Mammoth Peak: up the ramp, across the floe, past the mammoth, over the tar on the ice bridge and into the cave.
  { par:4, three:3, sig:true, f:function(T){ var H = hole([rm(-5, 0, 5, -12), rm(-7, -16, 7, -30, 0.8), rm(-7, -29.9, 7, -33.1, 0.8), rm(-7, -33, 7, -48, 0.8)], [0, -2.5], [-3.5, -43]);
    climb(H, 3, -12, -16, 2.4); belt(H, -7, -18, 7, -21, -3, 0); slider(H, T, -25, -5, 5, 2.6, 0.2); zoneR(H, M.WATER, -7, -30, 7, -33); drawb(H, -1.4, -30, 1.4, -33, 3, 0.2, 0.55);
    blk(H, T, -7, -29.4, -1.4, -30); blk(H, T, 1.4, -29.4, 7, -30); pen(H, T, -3.5, -43); bumps(H, T, [[3, -38, 0.6], [-4, -22.5, 0.5], [3.5, -6, 0.5]]); zoneR(H, M.MUD, 3, -46, 7, -48); return H; } }
];
/* THE MEMBERS TOUR: the season's own eighteen, for Tour Pass holders, two halves of nine on the season's two
   themes. Par is the solver's, the same rule as the Putt Putt Tour.
   HALLOWS NIGHT IS NOT HARDER THAN THE TOUR, IT IS ITS OWN. The owner's call, after its first nine were every
   set piece at once on a clock over the water and members gave up on hole 1: a season hole does not need to be
   harder, it needs to be unlike anything else. So each Hallows hole is ONE haunted idea (a gate, a coffin, a
   cauldron, a belfry bat, a turning parlour floor, a river of brew, a crypt door on a switch, a leap over a
   grave, the haunted mill) and a few headstones and pumpkins. What it gives on top is the trick or treat bonus
   (PAY.members.treat). Harvest Moon still packs more into a hole, which check-putt asks of the second world. */
var MEMBER_WORLDS = [
  { id:'hallows', name:'Hallows Night', theme:'haunted', blurb:'The season’s front nine, for Tour Pass members.', haz:['One trick a hole', 'Trick or treat'] },
  { id:'harvest', name:'Harvest Moon', theme:'harvest', blurb:'The season’s back nine.', haz:['Every set piece', 'At once'] }
];
var MEMBER_LEVELS = [
  // ---- HALLOWS NIGHT: nine holes, one haunted idea each. Not harder than the tour, just its own.
  // Graveyard Gate: the iron gate swings on a slow clock. Through it, then weave the headstones to the cup.
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -36)], [0, -2.5], [1.5, -31]); gateWall(H, T, -11, -6, 6, -1.6, 1.6, 3.6, 0, 1);
    blk(H, T, -3.6, -18, -2.4, -18.6); blk(H, T, 1.6, -21, 2.8, -21.6); blk(H, T, -1.6, -25, -0.4, -25.6); bumps(H, T, [[4.2, -27, 0.6]]); bowl(H, 1.5, -31, 1.8, 0.13); return H; } },
  // Coffin Drop: roll down the lane into the coffin. Its sides taper in to the cup at the foot.
  { par:3, f:function(T){ var H = hole([rm(-5, 0, 5, -12), pg([[-3, -16], [3, -16], [5.5, -22], [3.5, -38], [-3.5, -38], [-5.5, -22]], -1.2)], [0, -2.5], [0, -34]);
    climb(H, 2, -12, -16, 2.4); bumps(H, T, [[-1.8, -25, 0.6]]); bowl(H, 0, -34, 1.8, 0.13); return H; } },
  // Witch's Cauldron: the cup sits in the cauldron, open on both sides. Bring it round and in through a side.
  { par:3, three:2, f:function(T){ var H = hole([pg([[-4, 0], [4, 0], [8, -6], [8, -30], [4, -34], [-4, -34], [-8, -30], [-8, -6]])], [0, -2.5], [0, -24]);
    blk(H, T, -2.4, -21.4, 2.4, -21.9); blk(H, T, -2.4, -26.1, 2.4, -26.6); blk(H, T, -2.9, -21.4, -2.4, -22.8); blk(H, T, -2.9, -25.2, -2.4, -26.6); blk(H, T, 2.4, -21.4, 2.9, -22.8); blk(H, T, 2.4, -25.2, 2.9, -26.6);
    bowl(H, 0, -24, 1.7, 0.14); bumps(H, T, [[-5, -14, 0.6], [5, -14, 0.6]]); return H; } },
  // Bat Belfry: one bat beats its wings in the stair. Slip past it, up into the bell tower.
  { par:3, f:function(T){ var H = hole([pg([[-3, 0], [3, 0], [3, -22], [6, -26], [6, -34], [0, -38], [-6, -34], [-6, -26], [-3, -22]])], [0, -2.5], [-1.5, -32]);
    spinner(H, T, 0, -13, 2.2, 1.2, 2); bumps(H, T, [[2.4, -29, 0.6]]); bowl(H, -1.5, -32, 1.8, 0.13); return H; } },
  // Haunted Floors: the parlour floor turns under the ball. Read where it will carry you.
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -34)], [0, -2.5], [-2.5, -30]); disc(H, 0, -16, 3.2, 1.1);
    blk(H, T, 3, -24, 4.2, -24.6); bumps(H, T, [[-4.4, -8, 0.6]]); bowl(H, -2.5, -30, 1.8, 0.13); return H; } },
  // Brew River: let the brew carry the ball down to the lower court, then putt out.
  { par:3, three:2, f:function(T){ var H = hole([rm(-12, 0, -4, -10), rm(-6, -26, 6, -38, -0.8)], [-8, -2.5], [2.5, -34]); river(H, [[-8, -9.5], [-8, -16], [-2, -20], [1, -26.5]], 1.8, 7, 0, -0.8);
    bumps(H, T, [[-2.6, -31, 0.6]]); bowl(H, 2.5, -34, 1.8, 0.13); return H; } },
  // Crypt Doors: the crypt is shut. Roll over the plate in the grass and the door opens for a few seconds. The plate is on the way, if you aim at the door.
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -34)], [-3, -2.5], [2, -29]); blk(H, T, -6, -18, -1.4, -19.2); blk(H, T, 1.4, -18, 6, -19.2);
    switchDoor(H, T, -18.6, -1.4, 1.4, -1.6, -10, 5); bumps(H, T, [[3.6, -9, 0.6]]); bowl(H, 2, -29, 1.8, 0.13); return H; } },
  // Headless Leaps: off the ramp and over the grave. Land among the pumpkins and putt out.
  { par:3, three:2, f:function(T){ var H = hole([rm(-5, 0, 5, -13), rm(-5, -12.9, 5, -15.4), rm(-5, -15.3, 5, -34)], [0, -2.5], [-1.5, -30]);
    jump(H, 0, -13, 0, -1, 2.3, 10); bumps(H, T, [[2.2, -21, 0.6], [-3, -24, 0.6], [1, -26.5, 0.55]]); bowl(H, -1.5, -30, 1.8, 0.13); return H; } },
  // Hallows Night: up the lane to the haunted mill, through its turning sails, down the steps into the churchyard, and putt out under the moon.
  { par:4, three:3, sig:true, f:function(T){ var H = hole([rm(-5, 0, 5, -12), rm(-7, -16, 7, -40, 0.8), rm(-7, -44, 7, -58)], [0, -2.5], [-3.5, -54]);
    climb(H, -2, -12, -16, 2.4); millAt(H, T, -24, 7, 1.3); blk(H, T, -7, -33, 3.6, -33.8); climb(H, -4.2, -40, -44, 2.4); bumps(H, T, [[2.5, -38, 0.6], [1.5, -52, 0.55]]); flatAt(H, -3.5, -54); return H; } },
  // ---- HARVEST MOON
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -40)], [0, -2.5], [-3, -36]); belt(H, -6, -10, 6, -15, 5, 0); secret(H, 1.02, -25.39, 1.62, -24.79); slider(H, T, -19, -4, 4, 2.0, 0); belt(H, -6, -23, 6, -28, -5, 0); slider(H, T, -31, 4, -4, 2.4, 0.5);
    zoneR(H, M.WATER, -6, -15, -4.5, -23); zoneR(H, M.WATER, 4.5, -15, 6, -23); blk(H, T, -4.8, -15, -4.5, -23); blk(H, T, 4.5, -15, 4.8, -23); pen(H, T, -3, -36); bowl(H, -3, -36, 1.3, 0.12); return H; } },
  { par:3, three:2, f:function(T){ var H = hole([rm(-6, 0, 6, -36)], [0, -2.5], [0, -30]); zoneR(H, M.WATER, -6, -10, 6, -36); zoneR(H, M.GREEN, -2.2, -12.6, 2.2, -19); zoneR(H, M.GREEN, -2.4, -22, 2.4, -34);
    zoneR(H, M.GREEN, -6, -9.9, 6, -10); H.ramps.push({ x:0, y:-10, dx:0, dy:-1, w:12, h:0.45, ang:30, len:1.8 }, { x:0, y:-19, dx:0, dy:-1, w:4.4, h:0.5, ang:32, len:1.6 }); H.comps.push({ k:'mound', x:0, y:-30, s:2.2, a:-0.12 }); pen(H, T, 0, -30); blk(H, T, -2.5, -12.6, -2.2, -18.4); blk(H, T, 2.2, -12.6, 2.5, -18.4); blk(H, T, -2.7, -22.4, -2.4, -34); blk(H, T, 2.4, -22.4, 2.7, -34); bowl(H, 0, -30, 1.3, 0.12); return H; } },
  { par:5, three:4, f:function(T){ var H = hole([rm(-8, 0, 8, -42)], [-5.5, -2.5], [5.5, -38.5]); blk(H, T, -8, -9, 4, -10.4); blk(H, T, -4, -17, 8, -18.4); blk(H, T, -8, -25, 4, -26.4); blk(H, T, -4, -33, 8, -34.4);
    zoneC(H, M.MUD, -5.5, -13.6, 1.3); zoneC(H, M.MUD, 5.5, -21.6, 1.3); zoneC(H, M.MUD, -5.5, -29.6, 1.3); zoneC(H, M.MUD, 1.5, -21.6, 1); bumps(H, T, [[0, -13.5, 0.55], [0, -29.5, 0.55]]); pen(H, T, 5.5, -38.5);
    return H; } },
  { par:4, three:3, f:function(T){ var H = hole([rm(-12, 0, -4, -12), rm(-6, -24, 8, -50, -1.6)], [-8, -2.5], [1, -46]); river(H, [[-8, -11.5], [-8, -17], [-2, -21], [2, -24.5]], 1.8, 7, 0, -1.6); millAt(H, T, -36, 8, 1.6, 1); zoneR(H, M.WATER, -6, -26, -2, -32); pen(H, T, 1, -46); bowl(H, 1, -46, 1.3, 0.12); return H; } },
  { par:3, three:2, f:function(T){ var H = hole([rm(-7, 0, 7, -38)], [0, -2.5], [0, -34]); disc(H, 0, -18, 3.2, -1.7); pads(H, [[-4.6, -12, 0.7], [4.6, -12, 0.7], [-4.6, -24, 0.7], [4.6, -24, 0.7]]); zoneR(H, M.WATER, -7, -26.5, -1.6, -29); zoneR(H, M.WATER, 1.6, -26.5, 7, -29); blk(H, T, -7, -25.9, -1.6, -26.5); blk(H, T, 1.6, -25.9, 7, -26.5); pen(H, T, 0, -34); bowl(H, 0, -34, 1.3, 0.12); return H; } },
  { par:4, three:3, f:function(T){ var H = hole([rm(-5, 0, 5, -44)], [0, -2.5], [0, -40]); gateWall(H, T, -11, -5, 5, -1, 1, 2.0, 0, 1); gateWall(H, T, -21, -5, 5, 1.2, 3.2, 2.3, 0.4, -1); gateWall(H, T, -31, -5, 5, -3.2, -1.2, 2.6, 0.7, 1); bumps(H, T, [[0, -36, 0.6]]); pen(H, T, 0, -40); bowl(H, 0, -40, 1.3, 0.12); return H; } },
  { par:5, three:4, f:function(T){ var H = hole([rm(-12, 0, -4, -10), rm(-4, -24, 8, -32, -1.2), rm(-4, -36, 8, -44, 0), pg([[-4, -44], [8, -44], [2.8, -47.6], [1.2, -47.6]]), rm(1.2, -47.5, 2.8, -51.8), rm(-4, -51.7, 8, -62)], [-8, -2.5], [2, -58]);
    river(H, [[-8, -9.5], [-8, -16], [0, -19], [2, -24.5]], 1.7, 7.5, 0, -1.2); climb(H, 5.5, -32, -36, 2.2); loopAt(H, 2, -49.6, 0, -1, 0.85, 1.6); bumps(H, T, [[-1, -55, 0.6]]); pen(H, T, 2, -58); return H; } },
  { par:3, three:2, f:function(T){ var H = hole([rm(-4.5, 0, 4.5, -12), rm(-4.5, -11.9, 4.5, -15.1), rm(-4.5, -15, 4.5, -46)], [0, -2.5], [0, -42]); zoneR(H, M.WATER, -4.5, -12, 4.5, -15); drawb(H, -1.2, -12, 1.2, -15, 2.4, 0, 0.5); blk(H, T, -4.5, -11.4, -1.2, -12); blk(H, T, 1.2, -11.4, 4.5, -12);
    spinner(H, T, -1.6, -21, 2.1, 2.2, 2); spinner(H, T, 1.6, -29, 2.1, -2.2, 2); zoneR(H, M.WATER, -4.5, -18, -3.6, -34); zoneR(H, M.WATER, 3.6, -18, 4.5, -34); blk(H, T, -3.9, -18, -3.6, -34); blk(H, T, 3.6, -18, 3.9, -34); slider(H, T, -37, -3, 3, 1.8, 0.6, 2.2); pen(H, T, 0, -42); bowl(H, 0, -42, 1.3, 0.12); return H; } },
  { par:4, three:3, sig:true, f:function(T){ var H = hole([rm(-5, 0, 5, -12), rm(-8, -16, 8, -30, 0.8), rm(-8, -29.9, 8, -33.1, 0.8), rm(-8, -33, 8, -42, 0.8), pg([[-8, -42], [8, -42], [0.8, -45.6], [-0.8, -45.6]], 0.8), rm(-0.8, -45.5, 0.8, -50, 0.8), rm(-6, -49.9, 6, -56, 0.8), rm(-6, -55.9, 6, -59.1, 0.8), rm(-6, -59, 6, -72, 0.8)], [0, -2.5], [0, -68]);
    climb(H, 3.5, -12, -16, 2.4); belt(H, -8, -20, 8, -25, -4.5, 0); zoneR(H, M.WATER, -8, -30, 8, -33); drawb(H, -1.3, -30, 1.3, -33, 2.4, 0.3, 0.5); blk(H, T, -8, -29.4, -1.3, -30); blk(H, T, 1.3, -29.4, 8, -30);
    loopAt(H, 0, -47.6, 0, -1, 0.85, 1.6); zoneR(H, M.MUD, -6, -50.2, 6, -52); jump(H, 0, -56, 0, -1, 2.2, 12, { h:0.9, ang:40 }); disc(H, 0, -64, 2.2, 1.8); flatAt(H, 0, -68); return H; } }
];
/* THE LAB: a tester-only test world of six prototype holes, before any of it touches the ninety. Three
   are classic golf architecture brought to the carpet (the Redan's kick, the Cape's bite, the Biarritz
   swale) and three are mechanics the tour does not have yet (a banked half pipe, a door on a switch, a
   drop down three tiers). It pays nothing and costs no lives: it is for judging layouts, not for
   progress. Only a tester sees its tab. */
var LAB_WORLDS = [ { id:'lab', name:'The Lab', theme:'clubhouse', blurb:'Prototype holes, testers only.', haz:['Template holes', 'New mechanics'] } ];
var LAB_LEVELS = [
  // Redan: the green falls away from front right to back left, and a bunker guards the straight line. Play out right and let the slope feed it down to the cup.
  { par:3, f:function(T){ var H = hole([pg([[-6, 0], [6, 0], [7, -26], [-6, -28]])], [2.5, -2.5], [-2, -23.6]); H.comps.push({ k:'plane', gx:0.03, gy:0.004 });
    zoneR(H, M.SAND, -6, -18.6, 0.6, -21); bumps(H, T, [[4.8, -12, 0.55]]); bowl(H, -2, -23.6, 1.7, 0.12); return H; } },
  // The Cape: a dogleg round a pond. Bite off the corner over the water, or go up the left and bank off the angled board for the ace.
  { par:3, f:function(T){ var H = hole([rm(-7, 0, 1, -26), rm(-7, -15, 14, -26)], [-3, -2.5], [8.5, -22.4]); zoneC(H, M.WATER, 1.6, -14.2, 3.6);
    board(H, T, -7.2, -20.7, -1.8, -25.3); bumps(H, T, [[5.4, -17.4, 0.55]]); bowl(H, 8.5, -22.4, 1.7, 0.12); return H; } },
  // Biarritz: a deep swale across the middle. Too soft and it stays in the hollow; firm enough and it climbs out onto the back plateau.
  { par:3, three:2, f:function(T){ var H = hole([rm(-4.5, 0, 4.5, -34)], [0, -2.5], [-2.2, -29.8]);
    H.comps.push({ k:'ridge', x:0, y:-12, nx:0, ny:-1, w:1.3, a:-0.5 }, { k:'ridge', x:0, y:-19.5, nx:0, ny:-1, w:1.3, a:0.5 });
    bumps(H, T, [[-2.4, -15.8, 0.6], [2.6, -15.8, 0.6]]); blk(H, T, -4.5, -25.6, 0.6, -26.8); bowl(H, -2.2, -29.8, 2.0, 0.14); return H; } },
  // Hairpin: up the left lane, off two angled boards at the top, and back down the right lane to the cup. The classic two-bank ace.
  { par:3, three:2, f:function(T){ var H = hole([rm(-6.5, 0, 6.5, -20)], [-3.6, -2.5], [2.6, -9.5]); blk(H, T, -0.8, 0, 0.8, -10);
    board(H, T, -6.5, -13.5, -0.5, -19.5); board(H, T, 0.5, -19.5, 6.5, -13.5); bumps(H, T, [[0, -13, 0.55]]); bowl(H, 2.6, -9.5, 1.7, 0.12); return H; } },
  // The Switch: the door in the wall is shut. Roll over the plate and it opens for a few seconds; the line has to find the plate on its way, and the ace banks off the right wall to do it.
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -32)], [2.5, -2.5], [-4.2, -27.5]); blk(H, T, -6, -18, -1.4, -19.2); blk(H, T, 1.4, -18, 6, -19.2);
    switchDoor(H, T, -18.6, -1.4, 1.4, 5.1, -5.9, 3.5); bumps(H, T, [[-4.4, -11, 0.6], [2.6, -24, 0.6]]); bowl(H, -4.2, -27.5, 1.7, 0.12); return H; } },
  // The Drop: three tiers. Down the first step, along the middle terrace to its open end, and down again to the cup.
  { par:3, three:2, f:function(T){ var H = hole([rm(-6, 0, 6, -36)], [-3, -2.5], [-3, -32]);
    H.comps.push({ k:'ridge', x:0, y:-10, nx:0, ny:-1, w:0.9, a:-0.6 }, { k:'ridge', x:0, y:-24, nx:0, ny:-1, w:0.9, a:-0.6 });
    blk(H, T, -6, -17, 2.2, -18.2); bumps(H, T, [[4, -21, 0.55]]); board(H, T, 1, -36, 6, -31); bowl(H, -3, -32, 1.7, 0.12); return H; } },
  // The Ferry: the owner's sketch. Roll up off the tee strip onto the ferry while it waits at the right dock; it carries the ball across the
  // channel and stops hard at the left dock, putting the ball ashore on the landing. Then putt up the left strip to the cup.
  { par:3, three:2, f:function(T){ var H = hole([rm(2, 0, 8, -20.1), rm(-14, -19.9, 8, -24.1), rm(-14, -23.9, -6, -44)], [5, -2.5], [-10, -40]); zoneR(H, M.WATER, -6, -20, 8, -24);
    ferry(H, 3.6, -19.6, 8, -24, -10, 0, 2.2, 1.5, 0); bumps(H, T, [[-8, -32, 0.6]]); bowl(H, -10, -40, 1.7, 0.12); return H; } },
  // Ferry Jump: the kicker at the top of the tee strip throws the ball over the channel, and it has to come down on the ferry as it crosses.
  // The far wall of the channel stops it, the ferry carries it to the left dock and puts it ashore, then up the left strip to the cup.
  { par:3, three:2, f:function(T){ var H = hole([rm(-3, 0, 3, -14.1), rm(-12, -13.9, 8, -19.1), rm(-12, -18.9, -6, -38)], [0, -2.5], [-9, -34]); zoneR(H, M.WATER, -6, -14, 8, -19);
    jump(H, 0, -13.5, 0, -1, 0.05, 2.4, { m:M.GREEN, h:0.5, ang:30 }); blk(H, T, -3, -12.9, -1.2, -14.1); blk(H, T, 1.2, -12.9, 3, -14.1); ferry(H, 3.6, -13.6, 8, -19, -10, 0, 2.2, 1.2, 0.3); bumps(H, T, [[-2, -7, 0.6], [-7.5, -27, 0.6]]); bowl(H, -9, -34, 1.7, 0.12); return H; } }
];
/* THE SECRET HOLES. One a world, behind a way in on one of that world's trails (the trail to its tenth hole):
   a second path off the walk leads to it, and walking into its doorway offers the hole. Each is themed to the
   place it hides in: the ship's own deck in Pirate Cove, the inside of the cave in Ice Age. They are free (no
   life), pay 280 coins the first time beaten, and finding them is a collection in the Bag: ten beaten wins the Diamond Putter.
   Each is played inside its own place (C.scene, built by land.js), never in its world's open land. Nothing names one
   until it is found. Par is the solver's, the same rule as the tours (routes in routes.json as secret:N). */
var SECRETS = [
  { theme:'clubhouse', at:6, name:'The Potting Shed', scene:'s-shed' }, { theme:'school', at:14, name:'Detention', scene:'s-class' }, { theme:'candy', at:3, name:'Secret Recipe', scene:'s-recipe' },
  { theme:'neon', at:11, name:'Glitch Level', scene:'s-glitch' }, { theme:'pirate', at:8, name:'The Captain’s Deck', scene:'s-ship' }, { theme:'temple', at:16, name:'Treasure Chamber', scene:'s-treasure' },
  { theme:'canyon', at:5, name:'Lost Mine', scene:'s-mine' }, { theme:'volcano', at:13, name:'Lava Tube', scene:'s-lava' }, { theme:'sky', at:9, name:'Above the Clouds', scene:'s-clouds' },
  { theme:'dino', at:17, name:'The Nest', scene:'s-nest' }, { theme:'iceage', at:7, name:'The Painted Cave', scene:'s-cave' }
];
var SECRET_LEVELS = [
  // The Potting Shed: crates stacked down both walls, the mower rolling across the middle, and a crate in front of the cup.
  { par:3, three:2, f:function(T){ var H = hole([rm(-5, 0, 5, -30)], [0, -2.5], [2, -26]); blk(H, T, -5, -8, -2.4, -10); blk(H, T, 2.4, -14, 5, -16); blk(H, T, -5, -20, -1.8, -22);
    slider(H, T, -12, -3.4, 3.4, 2.4, 0, 2.0); blk(H, T, -0.6, -21.6, 5, -22.8); zoneR(H, M.MUD, -5, -28, -2, -30); bowl(H, 2, -26, 1.7, 0.12); return H; } },
  // Detention: rows of desks, a gap down one side, and the teacher's chair rolling up and down the front.
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -32)], [0, -2.5], [-3, -28]); blk(H, T, -6, -10, -3.6, -11.2); blk(H, T, -1.2, -10, 1.2, -11.2); blk(H, T, 3.6, -10, 6, -11.2);
    blk(H, T, -4.8, -16, -2.4, -17.2); blk(H, T, 2.4, -16, 4.8, -17.2); vslider(H, T, 0, -20, -25, 2.6, 0.3, 1.8); bumps(H, T, [[4, -24, 0.5]]); bowl(H, -3, -28, 1.7, 0.12); return H; } },
  // Secret Recipe: the candy boat waits at the foot of the chocolate falls. Roll aboard, ride the river down to the far landing
  // (it stops hard and puts the ball ashore), then over the jump across the chocolate to the cup in front of the great kettle.
  // The boat waits long (2.4) so a putt rolled up gently finds it there; the channel is walled on both long sides.
  { par:3, three:2, f:function(T){ var H = hole([rm(2, 0, 8, -14.1), rm(-14, -13.9, 8, -18.1), rm(-14, -17.9, -6, -22), rm(-14, -21.9, -6, -23.5), rm(-14, -23.4, -6, -33)], [5, -2.5], [-10, -29]);
    zoneR(H, M.WATER, -6, -14, 8, -18); ferry(H, 3.6, -13.6, 8, -18, -10, 0, 2.2, 2.4, 0); jump(H, -10, -22, 0, -1, 1.4, 8); bowl(H, -10, -29, 1.7, 0.12); return H; } },
  // Glitch Level: a hidden pinball room. The pads throw it, and the posts guard the cup.
  { par:3, three:2, f:function(T){ var H = hole([pg([[-4, 0], [4, 0], [7, -8], [7, -26], [3, -32], [-3, -32], [-7, -26], [-7, -8]])], [0, -2.5], [0, -28]);
    pads(H, [[-4, -12, 0.65], [4, -12, 0.65], [0, -18, 0.7]]); bumps(H, T, [[-2, -25, 0.45], [2, -25, 0.45], [-5, -20, 0.5], [5, -20, 0.5]]); bowl(H, 0, -28, 1.7, 0.12); return H; } },
  // The Captain's Deck: the ship's own deck, bow to the cup. Round the masts, past the cannons and the open hatch to the hold, with a barrel rolling across the waist.
  { par:3, f:function(T){ var H = hole([pg([[-5, 0], [5, 0], [6, -10], [6, -28], [0, -40], [-6, -28], [-6, -10]])], [0, -2.5], [0, -33]);
    bumps(H, T, [[0, -11, 0.7], [0, -24, 0.65]]); blk(H, T, -6, -15, -4.4, -17); blk(H, T, 4.4, -19, 6, -21); zoneR(H, M.WATER, -2.6, -17, -0.8, -20); blk(H, T, -2.9, -17, -2.6, -20); blk(H, T, -0.8, -17, -0.5, -20);
    slider(H, T, -29, -4, 4, 2.6, 0, 1.8); bowl(H, 0, -33, 1.7, 0.12); return H; } },
  // Treasure Chamber: piles of gold to thread, and the floor of the inner chamber turns.
  { par:3, f:function(T){ var H = hole([rm(-6, 0, 6, -36)], [0, -2.5], [-2, -32]); bumps(H, T, [[-3, -9, 0.8], [3, -12, 0.8], [-2.5, -15, 0.6], [4, -26, 0.6], [-1.6, -28.2, 0.75]]); disc(H, 0, -21, 2.6, -1.2);
    zoneR(H, M.ICE, -6, -27, 6, -28.5); zoneR(H, M.MUD, 3, -34, 6, -36); bowl(H, -2, -32, 1.7, 0.12); return H; } },
  // Lost Mine: the cart runs across the old rails, and the ore belt still pushes left.
  { par:3, three:2, f:function(T){ var H = hole([rm(-5, 0, 5, -36)], [0, -2.5], [2, -32]); slider(H, T, -11, -3.2, 3.2, 2.4, 0, 2.2); belt(H, -5, -17, 5, -21, -4, 0);
    bumps(H, T, [[-2.5, -25, 0.6]]); blk(H, T, -1, -27.6, 5, -28.8); zoneR(H, M.MUD, -5, -34, -2, -36); bowl(H, 2, -32, 1.7, 0.12); return H; } },
  // Lava Tube: down the tube, round the loop, past the pools of lava either side.
  { par:3, three:2, f:function(T){ var H = hole([rm(-4, 0, 4, -12), pg([[-4, -12], [4, -12], [0.8, -15.6], [-0.8, -15.6]]), rm(-0.8, -15.5, 0.8, -19.5), rm(-5, -19.4, 5, -36)], [0, -2.5], [0, -32]);
    loopAt(H, 0, -17.5, 0, -1, 0.65, 1.6); zoneR(H, M.WATER, -5, -23, -2.2, -27); zoneR(H, M.WATER, 2.2, -23, 5, -27); blk(H, T, -2.5, -23, -2.2, -27); blk(H, T, 2.2, -23, 2.5, -27);
    bumps(H, T, [[2.5, -6, 0.5], [0, -29, 0.6]]); bowl(H, 0, -32, 1.7, 0.12); return H; } },
  // Above the Clouds: bounce pads on a high island, and the drop on both sides of the last stretch.
  { par:3, three:2, f:function(T){ var H = hole([rm(-6, 0, 6, -36)], [0, -2.5], [1.5, -32]); pads(H, [[-3, -10, 0.6], [3.5, -14, 0.6], [-2, -19, 0.6]]);
    zoneR(H, M.WATER, -6, -23, -3.4, -28); zoneR(H, M.WATER, 4.6, -23, 6, -28); blk(H, T, -3.7, -23, -3.4, -28); blk(H, T, 4.6, -23, 4.9, -28); blk(H, T, -2, -28.6, 6, -29.6); zoneR(H, M.MUD, -6, -34, -3, -36); bowl(H, 1.5, -32, 1.7, 0.12); return H; } },
  // The Nest: a round nest of sticks, eggs round the edge, slick clay across it and a boulder in the middle.
  { par:3, f:function(T){ var H = hole([pg([[-3, 0], [3, 0], [7, -5], [8, -14], [7, -23], [3, -28], [-3, -28], [-7, -23], [-8, -14], [-7, -5]])], [0, -2.5], [0, -24]);
    zoneR(H, M.ICE, -6, -8, 6, -20); blk(H, T, -1.5, -13, 1.5, -15); bumps(H, T, [[-5, -10, 0.55], [5, -18, 0.55], [-3, -21, 0.5]]); blk(H, T, -3, -20.2, 3, -21.2); zoneR(H, M.MUD, -2, -26, 2, -28); bowl(H, 0, -24, 1.7, 0.12); return H; } },
  // The Painted Cave: stalagmites to thread, a patch of ice, and a mammoth asleep across the back, rolling over now and then.
  { par:3, three:2, f:function(T){ var H = hole([pg([[-4, 0], [4, 0], [7, -10], [6, -24], [2, -34], [-3, -34], [-7, -22], [-6, -8]])], [0, -2.5], [-1, -30]);
    bumps(H, T, [[-2.5, -9, 0.5], [2.5, -12, 0.5], [-3.5, -16, 0.45], [3.5, -19, 0.45]]); blk(H, T, -4, -26.2, 2, -27.2); zoneR(H, M.ICE, -6, -20, 6, -22.5); slider(H, T, -25.5, -4, 3, 3.0, 0.2, 2.4);
    zoneR(H, M.MUD, 2, -32, 5, -34); bowl(H, -1, -30, 1.7, 0.12); return H; } }
];
var SECRET_NAMES = SECRETS.map(function(x){ return x.name; });
var SECRET_WORLDS = SECRETS.map(function(x){ return { id:'s-' + x.theme, name:x.name, theme:x.theme, blurb:'A secret hole.', haz:['Found on a trail'] }; });
// the trail whose second path leads to a world's secret: the walk to its tenth hole (world w, 0 based: hole w * 18 + 10)
/* WHICH TRAIL HOLDS A WORLD'S SECRET. Not the same trail in every world, so finding one says nothing about where the
   next is: `at` is the hole that trail walks to. Never a world's first trail, where the greeter stands. */
function secretAt(to){ var w = Math.floor((to - 1) / PER), k = (to - 1) % PER + 1; return w < SECRETS.length && SECRETS[w].at === k ? w + 1 : 0; }
// the trail a secret hole sends you back to: the one its entrance is on
function secretFrom(i){ return (i - 1) * PER + SECRETS[i - 1].at - 1; }
var LAB_NAMES = ['Redan', 'The Cape', 'Biarritz', 'Hairpin', 'The Switch', 'The Drop', 'The Ferry', 'Ferry Jump'];
var MEMBER_NAMES = ['Graveyard Gate', 'Coffin Drop', 'Witch’s Cauldron', 'Bat Belfry', 'Haunted Floors', 'Brew River', 'Crypt Doors', 'Headless Leaps', 'Hallows Night',
  'Hayride', 'Bog Hop', 'Corn Maze', 'The Mill Race', 'Pie Plate Spin', 'Turkey Trot', 'Log Flume', 'Scarecrow Alley', 'Harvest Moon'];
var TOUR_NAMES = [
  'First Tee', 'The Slope', 'Bank Shot', 'The Windmill', 'Sand Bar', 'Step Up', 'Slide Rule', 'Causeway', 'The Kicker',
  'First Loop', 'Two Gates', 'Conveyor', 'Drawbridge', 'Spin Cycle', 'The Creek', 'Double Mill', 'Loop the Pond', 'Clubhouse Classic',
  'Front Steps', 'Storm Drain', 'Two Ramps', 'Merry-Go-Round', 'Hall Maze', 'Loop the Slide', 'Water Slide', 'Dodgeball', 'Hall Monitor',
  'Classroom Doors', 'Creek Run', 'Spinning Tops', 'Long Jump', 'Bleachers', 'Field Trip', 'Crossing Guard', 'Recess Rush', 'Last Bell',
  'Wafer Plank', 'Gumdrop Row', 'Loading Dock', 'Candy Cane Walk', 'Fondue', 'Bonbon Hop', 'Candy Loop', 'Sugar Rush', 'Spill',
  'Two Chutes', 'Cake Stand', 'Twin Whisks', 'Toffee Bridges', 'Chocolate River', 'Stamping Press', 'Double Dip', 'Popping Candy', 'Head Office',
  'Insert Coin', 'Laser Gate', 'Level Up', 'Hover Deck', 'Loop de Loop', 'Neon River', 'Warp Zone', 'Elevator', 'Ramp Jump',
  'Shutter Doors', 'Top Floor', 'Conveyor Combo', 'Platform Jump', 'Double Loop', 'Pac Maze', 'Glitch Bridges', 'Speed Run', 'Grand Prize',
  'Gangplank', 'Rock Pool', 'Blowholes', 'Walk the Plank', 'Harbor Gates', 'Lagoon', 'Sandbar', 'Whirlpool', 'Rope Bridges',
  'Cannon Fire', 'Ship Decks', 'Ship’s Wheel', 'Island Hop', 'Riptide', 'Reef Break', 'Treasure Map', 'Broadside', 'Captain’s Cove',
  'Polished Hall', 'Temple Steps', 'Jade Causeway', 'Stone Doors', 'Landslide', 'The Leap', 'Idol Alley', 'Moving Floor', 'Golden Ring',
  'Temple Stairs', 'Waterfall', 'Crumbling Bridges', 'Spinning Idol', 'Turning Floor', 'Serpent Bend', 'Hidden Chamber', 'Twin Chasms', 'Heart of the Temple',
  'Canyon Jump', 'Ore Belt', 'Dynamite', 'Trestle', 'Mine Gates', 'Mine Shaft', 'Rail Loop', 'Turntables', 'Boulder Field',
  'Stamp Mill', 'Switchback Steps', 'Flash Flood', 'Mine Carts', 'Two Belts', 'Mesa Hop', 'Blast Door', 'Runaway Cart', 'Mother Lode',
  'Lava Lane', 'Fire Pit', 'Basalt Gates', 'Lava Tubes', 'Rolling Rocks', 'Turning Rock', 'Ash Field', 'Lava Switch', 'Magma Loops',
  'Lava Flow', 'Lava Slope', 'River of Fire', 'Crater', 'Eruption', 'Lava Leap', 'Obsidian Bridge', 'Fire Mill', 'The Summit',
  'Cloud Hop', 'Haystacks', 'Bounce House', 'Balloon Field', 'Weather Vane', 'Sky Steps', 'Sky Bridge', 'Hay Bale', 'Drift',
  'Floating Island', 'Jet Stream', 'Kite Diamond', 'Floating Gates', 'Rainbow Loop', 'Cloud Gap', 'Leap of Faith', 'Cloud Mill', 'Castle in the Clouds',
  'First Tracks', 'Egg Alley', 'Swamp Hop', 'Bone Wall', 'Tail Swipe', 'Raptor Den', 'Dino Crossing', 'Log Bridges', 'Jungle Falls',
  'Dig Site', 'Raptor Leap', 'Mudslide', 'Rib Cage', 'Fern Loop', 'Stomping Ground', 'Rex’s Den', 'Rockslide', 'The Long Neck',
  'The Thaw', 'Mammoth Trail', 'Saber Tooth', 'Meltwater', 'Ice Bridge', 'Glacier Mill', 'Boulder Bounce', 'Cave Ledges', 'Frozen Crater',
  'Iceberg Drift', 'The Big Melt', 'Tar Pits', 'Cave Doors', 'Glacier Steps', 'Hailstorm', 'Saber Pass', 'Tundra Loop', 'Mammoth Peak'];
/* THE TOURS. Each is a list of worlds, a list of holes and their names, and what it pays. The Members
   Tour is one world of eighteen in two halves, on the season's theme, and pays the most on the site. */
var TOURS = {
  main:{ id:'main', name:'Putt Putt Tour', worlds:WORLDS, levels:LEVELS, names:TOUR_NAMES, tag:'lv', per:PER },
  members:{ id:'members', name:'Members Tour', season:'Hallows & Harvest', worlds:MEMBER_WORLDS, levels:MEMBER_LEVELS, names:MEMBER_NAMES, tag:'mb', per:9, members:true },
  lab:{ id:'lab', name:'The Lab', worlds:LAB_WORLDS, levels:LAB_LEVELS, names:LAB_NAMES, tag:'lb', per:8, lab:true },
  secret:{ id:'secret', name:'Secret Holes', worlds:SECRET_WORLDS, levels:SECRET_LEVELS, names:SECRET_NAMES, tag:'sh', per:1, secret:true }
};
function tourOf(id){ return TOURS[id] || TOURS.main; }
function levelName(n, tid){ var TR = tourOf(tid); return TR.names[n - 1] || ('Hole ' + n); }
function worldOf(n, tid){ var TR = tourOf(tid); return TR.worlds[Math.floor((n - 1) / (TR.per || PER))] || TR.worlds[TR.worlds.length - 1]; }
// the desc a Tour level plays as: the same shape the daily and the themed holes use, so the 3D cache keys work
function tourDesc(n, host, tid){ var TR = tourOf(tid), W = worldOf(n, tid);
  return { tour:n, tid:TR.id, tpl:TR.tag + n, seed:hstr((TR.id === 'main' ? 'ppt:' : TR.id + ':') + n), theme:W.theme, name:levelName(n, tid) }; }
/* WHICH STOP OF ITS WORLD A HOLE IS AT (land.js, STOPS): the land round it and the walk to it are built for that stop.
   '' for a world with no stops, which is built as it always was. */
function stopOf(th, leg){ var LD = typeof window !== 'undefined' && window.RTT_PUTT_LAND, T = LD && LD.stops && LD.stops[th], s = ''; if (!T) return '';   // no window: the checks run this in node
  for (var i = 0; i < T.length; i++) if (leg >= T[i][0]) s = T[i][1]; return s; }
function buildLevel(n, tid, theme, name){
  var TR = tourOf(tid), L = TR.levels[n - 1], W = worldOf(n, tid), th = theme || W.theme, T = THEMES[th];
  var H = L.f(T); H.par = L.par;
  var Cx = courseFromH(H, TR.tag + n, hstr((TR.id === 'main' ? 'ppt:' : TR.id + ':') + n), th, name || levelName(n, tid));
  if (TR.secret && SECRETS[n - 1]) Cx.scene = SECRETS[n - 1].scene;   // a secret hole stands in its own place
  // a tour hole knows its place in its world (1 to 18), so the land round it can change as you walk through the world
  else if (!theme && TR.worlds && TR.worlds.length && !TR.lab){ Cx.leg = (n - 1) % (TR.per || PER) + 1; if (TR.id === 'main') Cx.stop = stopOf(th, Cx.leg); }
  return Cx;
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
  M:M, BALL_R:BALL_R, CUP_R:CUP_R, CUP_R_MINI:CUP_R_MINI, V_MAX:V_MAX, MAX_FT:MAX_FT, V_STIMP:V_STIMP, ART:ART,
  THEMES:THEMES, TEMPLATES:TEMPLATES, COURSE_ORDER:COURSE_ORDER, DAILY_POOL:DAILY_POOL,
  hstr:hstr, mulberry:mulberry, hash3:hash3,
  simulate:simulate, speedFor:speedFor, feetFor:feetFor, inBlock:inBlock, starsOf:starsOf, threeOf:threeOf, frontier:frontier, opened:opened, revealed:revealed, allAccess:allAccess, worldGate:worldGate, worldStars:worldStars, starsThrough:starsThrough, fricOf:fricOf, moverAt:moverAt,
  makeField:makeField, finishCourse:finishCourse, inPoly:inPoly,
  greenCharacter:greenCharacter, buildReal:buildReal, spotFor:spotFor, fromHost:fromHost,
  CAL_THEMES:CAL_THEMES, buildMini:buildMini, buildFrom:buildFrom, LEVELS:LEVELS, WORLDS:WORLDS, TOURS:TOURS, PER:PER, buildLevel:buildLevel, worldOf:worldOf, lvHelpers:{ hole:hole, rm:rm, pg:pg }, lvKit:{ bowl:bowl, board:board, blk:blk, bumps:bumps, climb:climb, secret:secret, ferry:ferry }, tourDesc:tourDesc, levelName:levelName, TGT_R:TGT_R, TGT_KEEP:TGT_KEEP, themedCourse:themedCourse, dailyHole:dailyHole, dailyLevel:dailyLevel, themeForDay:themeForDay, scoreName:scoreName
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
   nothing. A bumper, a block and a piece of scenery are all one of these, which is
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
  heart:function(u, v){ var x = u * 1.15, y = -v * 1.15 + 0.15, k = x * x + y * y - 1; if (k * k * k - x * x * y * y * y > 0) return null; return (u < -0.2 && v < -0.1) ? '#ff8ab0' : '#ff2d6f'; },
  rose:function(u, v){ if (Math.abs(u) < 0.08 && v > 0.1) return '#3f8a3a'; if (ell(u - 0.22, v - 0.45, 0.22, 0.1) < 1) return '#4fa34a'; var e = ell(u, v + 0.3, 0.5, 0.48); if (e > 1) return null; return (Math.floor(e * 4) % 2) ? '#c2185b' : '#e91e63'; },
  candy:function(u, v){ if (ell(u, v, 0.5, 0.5) < 1) return (Math.floor((u - v) * 4 + 8) % 2) ? '#ff6f9f' : '#ffffff'; if (Math.abs(v) < 0.42 - (1 - Math.abs(u)) * 0.2 && Math.abs(u) < 0.98) return '#ffb3cc'; return null; },
  candybox:function(u, v){ var x = u * 1.1, y = -v * 1.1 + 0.1, k = x * x + y * y - 1; if (k * k * k - x * x * y * y * y > 0) return null; if (k > -0.22) return '#8e0f3a'; return (Math.floor((u + 1) * 5) % 2) ? '#d81b60' : '#c2185b'; },
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
  star:function(u, v){ var a = Math.atan2(v, u) + Math.PI / 2, r = Math.hypot(u, v), k = Math.cos(Math.PI / 5) / Math.cos((a % (2 * Math.PI / 5) + 2 * Math.PI / 5) % (2 * Math.PI / 5) - Math.PI / 5);
    if (r > 0.98 * (0.5 + 0.5 * Math.abs(Math.cos(a * 2.5)))) return null; return u < -0.1 ? '#ffffff' : '#e3e8ff'; },
  burst:function(u, v){ var r = Math.hypot(u, v), a = Math.atan2(v, u); if (r > 0.98) return null; if (r < 0.14) return '#ffffff'; if (Math.abs(((a / (Math.PI / 6)) % 1)) < 0.18 && ((r * 7 | 0) % 2)) return ['#ff5252', '#ffd23f', '#64b5f6'][(a * 2 + 9 | 0) % 3]; return null; },
  flagpole:function(u, v){ if (Math.abs(u + 0.5) < 0.07 && v > -0.95) return '#cfd8dc'; if (u > -0.45 && u < 0.85 && v > -0.95 && v < -0.15) return (u < 0.15 && v < -0.55) ? ((u * 14 + v * 14 | 0) % 2 ? '#ffffff' : '#1e3a8a') : (((v + 1) * 9 | 0) % 2 ? '#e53935' : '#ffffff'); return null; },
  crate:function(u, v){ if (Math.abs(u) > 0.9 || Math.abs(v) > 0.9) return null; if (Math.abs(u) > 0.76 || Math.abs(v) > 0.76 || Math.abs(u - v) < 0.12) return '#7a4a24'; return '#c08a4a'; },
  beachball:function(u, v){ var e = ell(u, v, 0.92, 0.92); if (e > 1) return null; if (e > 0.85) return '#9e9e9e'; if (Math.hypot(u, v) < 0.16) return '#ffffff'; var a = Math.atan2(v, u); return ['#ff5a3c', '#ffffff', '#2196f3', '#ffffff', '#ffd23f', '#ffffff'][Math.floor((a + Math.PI) / (Math.PI / 3)) % 6]; },
  castle:function(u, v){ if (Math.abs(u) > 0.9 || v > 0.9) return null; if (v < -0.55 && (Math.floor((u + 1) * 3.5) % 2)) return null; if (v < -0.95) return null; if (Math.abs(u) < 0.2 && v > 0.3) return '#a07a40'; return u < -0.3 ? '#f7e3a8' : '#e2c27a'; },
  surfboard:function(u, v){ var e = ell(u, v, 0.98, 0.42); if (e > 1) return null; if (Math.abs(v) < 0.07) return '#ff5a3c'; return '#ffd23f'; },
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
  // ---- Pirate Cove: a barrel, a treasure chest, an anchor, a gangplank
  barrel:function(u, v){ var w = 0.78 - v * v * 0.18; if (Math.abs(u) > w || Math.abs(v) > 0.92) return null; if (Math.abs(Math.abs(v) - 0.55) < 0.08 || Math.abs(v) > 0.84) return '#3d3a3a';
    return (Math.floor((u + 1) * 4.5) % 2) ? '#9a6236' : '#b07440'; },
  chest:function(u, v){ if (Math.abs(u) > 0.92 || Math.abs(v) > 0.8) return null; if (v < -0.2 && Math.hypot(u, v + 0.2) > 0.95) return null;
    if (Math.abs(v + 0.15) < 0.07 || Math.abs(Math.abs(u) - 0.55) < 0.07) return '#c9a227'; if (Math.abs(u) < 0.12 && Math.abs(v) < 0.18) return '#f1d04a'; return v < -0.15 ? '#7a4a24' : '#8f5a2c'; },
  anchor:function(u, v){ var r = Math.hypot(u, v + 0.65); if (r < 0.2 && r > 0.1) return '#3d4450';
    if (Math.abs(u) < 0.1 && v > -0.5 && v < 0.7) return '#4f5866'; if (Math.abs(v + 0.25) < 0.08 && Math.abs(u) < 0.45) return '#4f5866';
    var a = Math.hypot(u, v - 0.1); if (v > 0.25 && Math.abs(a - 0.68) < 0.11) return '#4f5866'; return null; },
  plank:function(u, v){ if (Math.abs(u) > 0.95 || Math.abs(v) > 0.55) return null; if (Math.abs(v) > 0.44 || Math.abs(u - 0.1) < 0.04) return '#5e3818'; return ((u * 7 | 0) % 3) ? '#a0703c' : '#8a5e30'; },
  // ---- Canyon Mine: a boulder, a mine cart, a lantern, a cactus
  boulder:function(u, v){ var e = ell(u, v * 1.08, 0.94, 0.86) + Math.sin(Math.atan2(v, u) * 5) * 0.05; if (e > 1) return null; if (e > 0.82) return '#6e3a22';
    return (u + v < -0.45) ? '#d0875a' : ((Math.floor((u + 1) * 3) + Math.floor((v + 1) * 3)) % 4 === 0 ? '#9a5534' : '#b8693e'); },
  cart:function(u, v){ if (Math.abs(u) > 0.92 || v > 0.92 || v < -0.6) return null; if (v > 0.55){ var wr = Math.hypot(Math.abs(u) - 0.5, v - 0.7); return wr < 0.22 ? (wr < 0.09 ? '#c9a227' : '#2a2a2e') : null; }
    if (Math.abs(u) > 0.84 - (v + 0.6) * 0.1 || v < -0.48) return '#3d3a3a'; if (v < -0.2) return ((u * 9 | 0) % 2) ? '#8a7a6a' : '#6a5e52'; return ((u * 5 | 0) % 2) ? '#8a5432' : '#7a4a2a'; },
  lantern:function(u, v){ if (Math.abs(u) > 0.6 || Math.abs(v) > 0.95) return null; if (v < -0.7) return Math.abs(u) < 0.2 ? '#2a2a2e' : null;
    if (Math.abs(v) > 0.55 || Math.abs(u) > 0.48) return '#2a2a2e'; return Math.hypot(u, v) < 0.3 ? '#fff3a8' : '#ffb347'; },
  cactus:function(u, v){ var tr = Math.abs(u) < 0.2 && v > -0.92, l = Math.abs(u + 0.5) < 0.14 && v > -0.5 && v < 0.1, r2 = Math.abs(u - 0.5) < 0.14 && v > -0.7 && v < -0.1;
    var lb = v > 0 && v < 0.18 && u > -0.6 && u < 0, rb = v > -0.2 && v < -0.05 && u > 0 && u < 0.6; if (!(tr || l || r2 || lb || rb)) return null;
    if (tr && v < -0.86) return '#ff7aa8'; return ((u * 12 | 0) % 2) ? '#3f8a3e' : '#2f7034'; },
  // ---- Volcano Island: a lava rock, a basalt block, a tiki
  lavarock:function(u, v){ var e = ell(u, v, 0.92, 0.84) + Math.sin(Math.atan2(v, u) * 6) * 0.06; if (e > 1) return null;
    var crack = Math.abs(Math.sin(u * 7 + v * 3)) < 0.12 && e < 0.8; if (crack) return '#ff7a1a'; return (u + v < -0.5) ? '#4a4246' : (e > 0.8 ? '#1f1a1d' : '#332c30'); },
  basalt:function(u, v){ if (Math.abs(u) > 0.92 || Math.abs(v) > 0.9) return null; var col = Math.floor((u + 1) * 3.5), top = -0.9 + (col % 2) * 0.12;
    if (v < top) return null; if (((u + 1) * 3.5) % 1 < 0.09) return '#141113'; if (v < top + 0.12) return '#57505a'; return col % 2 ? '#2e292e' : '#3a343a'; },
  // ---- Dino Valley: a speckled egg, and a block of sandstone with a fossil in it (the ice block stays for anybody who wants it)
  dinoegg:function(u, v){ var e = ell(u, v * (v < 0 ? 0.92 : 1.1), 0.68, 0.92); if (e > 1) return null;
    if (Math.sin(u * 37 + v * 19) * Math.sin(u * 13 - v * 29) > 0.62) return '#6a7a3a'; return u < -0.25 ? '#fbf4dc' : (e > 0.8 ? '#cbbf96' : '#ece2c0'); },
  fossil:function(u, v){ if (Math.abs(u) > 0.92 || Math.abs(v) > 0.9) return null; if (Math.abs(u) > 0.82 || Math.abs(v) > 0.8) return u + v < 0 ? '#e8cc92' : '#7a5a34';
    var sp = v - Math.sin(u * 3) * 0.18; if (Math.abs(sp) < 0.07 && Math.abs(u) < 0.66) return '#f4ead2';
    for (var k = -2; k <= 2; k++){ var rx = k * 0.26; if (Math.abs(u - rx) < 0.045 && Math.abs(sp) < 0.36 - Math.abs(k) * 0.05) return '#f4ead2'; }
    if (Math.hypot(u - 0.72, sp) < 0.12) return '#f4ead2'; return ((v + 1) * 4.5 | 0) % 2 ? '#c9a46a' : '#b8935a'; },
  iceblock:function(u, v){ if (Math.abs(u) > 0.92 || Math.abs(v) > 0.9) return null; if (Math.abs(u) > 0.8 || Math.abs(v) > 0.78) return u + v < 0 ? '#f2fbff' : '#7fb3d4';
    if (Math.abs(u + v + 0.4) < 0.07 || Math.abs(u + v - 0.5) < 0.05) return '#ffffff'; return ((u * 3 + 3) | 0) % 2 ? '#bfe6f8' : '#aedcf2'; },
  // ---- Sky Islands: a cloud, a marble pillar
  cloud:function(u, v){ var d = Math.min(Math.hypot(u, v + 0.15) / 0.62, Math.hypot(u + 0.45, v - 0.2) / 0.48, Math.hypot(u - 0.45, v - 0.18) / 0.5); if (d > 1) return null;
    return v > 0.55 ? '#dbe9f5' : '#ffffff'; },
  pillar:function(u, v){ if (Math.abs(u) > 0.92 || Math.abs(v) > 0.92) return null; if (Math.abs(v) > 0.72) return Math.abs(v) > 0.84 ? '#d9d2bd' : '#f4efe2';
    var fl = ((u + 1) * 4) % 1; if (fl < 0.16) return '#c9c1a8'; return u < -0.2 ? '#fffdf6' : '#ece6d4'; },
  // ---- Neon Arcade: a neon post, an arcade cabinet
  neonpost:function(u, v){ var r = Math.hypot(u, v); if (r > 0.94) return null; if (r > 0.78) return '#ff2bd6'; if (r > 0.66) return '#2a0a28'; if (r > 0.5) return '#00e5ff'; return r < 0.18 ? '#ffffff' : '#120a24'; },
  cabinet:function(u, v){ if (Math.abs(u) > 0.92 || Math.abs(v) > 0.92) return null; if (Math.abs(u) > 0.8 || Math.abs(v) > 0.8) return '#ff2bd6';
    if (Math.abs(u) < 0.55 && v > -0.62 && v < 0.05) return (((v + 1) * 10) | 0) % 2 ? '#39ff14' : '#1fbf0a'; if (v > 0.3 && v < 0.5 && Math.abs(u) < 0.5) return Math.abs(u + 0.2) < 0.1 ? '#ffe600' : (Math.abs(u - 0.25) < 0.1 ? '#00e5ff' : '#1a0f33'); return '#1a0f33'; },
  // ---- Schoolyard: a red rubber kickball, a row of steel lockers, the school bus
  kickball:function(u, v){ var r = Math.hypot(u, v); if (r > 0.94) return null; if (r > 0.84) return '#9a201a'; if (Math.abs(Math.sin((u + v * 0.4) * 3.4)) < 0.07) return '#b82a22';
    if (Math.hypot(u + 0.32, v + 0.36) < 0.2) return '#ff8a7a'; return u + v < -0.3 ? '#f2483a' : '#de3a2e'; },
  locker:function(u, v){ if (Math.abs(u) > 0.94 || Math.abs(v) > 0.92) return null; if (Math.abs(u) > 0.84 || Math.abs(v) > 0.84) return '#1f4a7a';
    var f = ((u + 1) * 2) % 1; if (f < 0.07) return '#163a5e'; if (v > -0.62 && v < -0.36 && ((v * 20 + 20) | 0) % 2) return '#173f68'; if (f > 0.78 && f < 0.88 && Math.abs(v - 0.05) < 0.12) return '#c9d2dc'; return f < 0.4 ? '#3a7cc0' : '#2f6fae'; },
  bus:function(u, v){ if (Math.abs(u) > 0.95 || Math.abs(v) > 0.88) return null; if (v > 0.6) return Math.abs(Math.abs(u) - 0.55) < 0.22 ? '#1a1a1a' : null;
    if (Math.abs(v - 0.28) < 0.06) return '#1a1a1a'; if (v < -0.08 && v > -0.6 && ((u + 1) * 4.5) % 1 < 0.78 && Math.abs(u) < 0.86) return '#9fd0e8'; return v < -0.7 ? '#e0a800' : '#ffc61a'; },
  // ---- Ice Age: a woolly mammoth, a glacier block with its layers of old snow
  mammoth:function(u, v){ var tk = v > 0.05 && v < 0.75 && Math.abs(Math.abs(u) - (0.55 - (v - 0.05) * 0.35)) < 0.09 + (0.75 - v) * 0.08 && v > 0.1; if (tk) return '#f4ead2';
    if (Math.abs(u) < 0.16 && v > 0 && v < 0.92) return v > 0.8 ? '#4a3220' : '#6a4a2e'; var d = Math.hypot(u / 0.88, (v + 0.12) / 0.82); if (d > 1) return null;
    if (v < -0.1 && Math.abs(Math.abs(u) - 0.3) < 0.07 && Math.abs(v + 0.22) < 0.06) return '#1a120c'; if (Math.abs(u) > 0.62 && v < 0.2) return '#5a3c22';
    return ((u * 9 + v * 5) | 0) % 3 ? '#7a5434' : '#8e6440'; },
  glacier:function(u, v){ if (Math.abs(u) > 0.94 || Math.abs(v) > 0.92) return null; if (v < -0.62) return Math.abs(u) > 0.86 ? '#cfeaf2' : '#ffffff';
    var band = ((v + 1) * 4.2 + Math.sin(u * 3) * 0.3) % 1; if (Math.abs(u) > 0.84) return '#5aa8c4'; if (band < 0.12) return '#6fb6d0'; if (Math.abs(u - v * 0.4 - 0.2) < 0.05) return '#e8f8fc'; return band < 0.55 ? '#a8dcea' : '#8fcde0'; },
  // ---- Candy Works: a gumball with its shine, a sugar cube, a wrapped sweet with its twisted ends
  gumball:function(u, v){ var r = Math.hypot(u, v); if (r > 0.94) return null; if (r > 0.84) return '#a8164a'; if (Math.hypot(u + 0.3, v + 0.34) < 0.18) return '#ffd0e2'; return u + v < -0.2 ? '#ff4f8f' : '#e8236a'; },
  sugarcube:function(u, v){ if (Math.abs(u) > 0.92 || Math.abs(v) > 0.92) return null; if (Math.abs(u) > 0.82 || Math.abs(v) > 0.82) return '#d9cfc4';
    var g = ((u * 13 + 20 | 0) + (v * 13 + 20 | 0) * 7) % 11; if (g === 0) return '#e8e0d6'; return u - v > 0.9 ? '#ffffff' : '#f6f1ea'; },
  wrapper:function(u, v){ var a = Math.abs(u); if (a > 0.96 || Math.abs(v) > 0.9) return null; if (a > 0.62){ if (Math.abs(v) > (a - 0.62) * 2.4 + 0.12) return null; return ((v * 9 + 20 | 0) % 2) ? '#ffd23f' : '#f0a400'; }
    if (a > 0.5) return Math.abs(v) < 0.2 ? '#c2185b' : null; if (Math.abs(v) > 0.7) return null; return (((u + v) * 5 + 20 | 0) % 2) ? '#ff5fa2' : '#ffffff'; },
  tiki:function(u, v){ if (Math.abs(u) > 0.55 || Math.abs(v) > 0.95) return null; if (v < -0.75) return Math.abs(u) < 0.45 ? '#3f8a3e' : null;
    if (Math.abs(v + 0.35) < 0.1 && Math.abs(Math.abs(u) - 0.22) < 0.1) return '#f1d04a'; if (Math.abs(v - 0.15) < 0.08 && Math.abs(u) < 0.3) return '#2a1a10';
    if (Math.abs(v - 0.5) < 0.05) return '#5a3818'; return u < -0.15 ? '#a0703c' : '#8a5e30'; }
};
RTT_PUTT.SKIN = SKIN; RTT_PUTT.riverAt = riverAt; RTT_PUTT.bridgeDown = bridgeDown; RTT_PUTT.bridgeLift = bridgeLift; RTT_PUTT.inAny = inAny; RTT_PUTT.edgeDist = edgeDist;   // hole3d.js builds a bumper's 3D shape from the same skin the flat painter uses

function paintCourse(C){
  var mats = C.mats, nx = mats.nx, ny = mats.ny, b = C.bounds, cv = mkCanvas(nx, ny), ctx = cv.getContext('2d'), img = ctx.createImageData(nx, ny), D = img.data;
  var F = C.field, real = C.kind === 'real', T = C.T, B = C.biome || {};
  var pal = real ? { out:rgb(B.base || '#5f8a30'), out2:rgb(B.tickD || '#4f7628'), out3:rgb(B.tickL || '#79a442'), green:rgb(B.green || '#b9d96e'), fringe:rgb(B.fringe || '#a4c95d'), line:rgb(B.gLine || '#6f9339'),
      sand:rgb(B.sand || '#f2f0e4'), sandL:rgb(B.sandLine || '#8f8a76'), speck:rgb(B.sandSpeck || '#b9b6a6'), water:rgb(B.water || '#3f9fe0'), ripple:rgb(B.ripple || '#bfe3f7'), ink:rgb(B.outline || '#1e3d16') }
    : { out:rgb(T.bg), out2:rgb(T.bg2), green:rgb(T.carpet), green2:rgb(T.carpet2), haz:rgb(T.hazCol), haz2:rgb(T.hazCol2), slow:rgb(T.slowCol), ice:T.iceCol ? rgb(T.iceCol) : null, ice2:T.iceCol2 ? rgb(T.iceCol2) : null, wall:rgb(T.wall), wallHi:rgb(T.wallHi), wallLo:rgb(T.wallLo), ink:rgb(T.ink) };
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
    else if (m === M.ICE){ c = (((i + j) % 11) < 2) ? (pal.ice2 || pal.haz2) : (pal.ice || pal.haz); }
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
    (C.blocks || []).forEach(function(r){ objs.push({ x0:r.x0, y0:r.y0, x1:r.x1, y1:r.y1, skin:r.skin, rect:1, rot:r.rot }); });
    (C.bumpers || []).forEach(function(u){ objs.push({ x0:u.x - u.r, y0:u.y - u.r, x1:u.x + u.r, y1:u.y + u.r, skin:u.skin }); });
    (C.props || []).forEach(function(p){ objs.push({ x0:p.x - p.s, y0:p.y - p.s, x1:p.x + p.s, y1:p.y + p.s, skin:p.k, prop:1 }); });
    var sh = 0.3;
    objs.forEach(function(ob){ paintSkin(ob, sh); });
    objs.forEach(function(ob){ paintSkin(ob, 0); });
  }
  function paintSkin(ob, off){
    var fn = (SKIN[ob.skin] || SKIN.stone);
    var i0 = Math.floor((ob.x0 + off - b[0]) / ART), i1 = Math.ceil((ob.x1 + off - b[0]) / ART), j0 = Math.floor((ob.y0 + off - b[1]) / ART), j1 = Math.ceil((ob.y1 + off - b[1]) / ART);
    for (var jj = Math.max(0, j0); jj <= Math.min(ny - 1, j1); jj++) for (var ii = Math.max(0, i0); ii <= Math.min(nx - 1, i1); ii++){
      var xx = b[0] + ii * ART - off, yy = b[1] + jj * ART - off, u = ((xx - ob.x0) / (ob.x1 - ob.x0)) * 2 - 1, v = ((yy - ob.y0) / (ob.y1 - ob.y0)) * 2 - 1;
      if (ob.rot){ var q = ob.rot, ddx = xx - q.cx, ddy = yy - q.cy; u = (ddx * q.c + ddy * q.s) / q.hl; v = (-ddx * q.s + ddy * q.c) / q.hw; if (Math.abs(u) > 1 || Math.abs(v) > 1) continue; }
      if (ob.rect && !SKIN[ob.skin]){ continue; }
      var col = fn(u, v); if (!col) continue;
      var oo = (jj * nx + ii) * 4;
      if (off){ put(oo, shade([D[oo], D[oo + 1], D[oo + 2]], -0.32)); continue; }
      put(oo, rgb(col));
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
.pt-stars{position:absolute;right:10px;top:10px;padding:5px 8px;border-radius:9px;background:rgba(6,18,12,.82);border:1px solid rgba(241,208,74,.45);pointer-events:none;font-variant-numeric:tabular-nums;font-size:12px;font-weight:800;color:#fff;line-height:1.35}\
.pt-stars div{display:flex;justify-content:space-between;gap:10px}.pt-stars i{font-style:normal;color:#F1D04A;letter-spacing:1px}.pt-stars span{display:block;text-align:center;color:#cfe0d8;font-size:10px;font-weight:700}\
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
.pp-hearts,.pp-lives{display:flex;gap:3px}.pp-hearts{cursor:pointer}.pp-lives{justify-content:center;margin:6px 0 2px}.pp-h{width:14px;height:12px;background:rgba(255,255,255,.18);clip-path:path("M7 12 L1 6 A3 3 0 0 1 7 2 A3 3 0 0 1 13 6 Z")}.pp-h.on{background:#ff4d6d}\
.pp-clock{color:#9fbfae;font-variant-numeric:tabular-nums}\
.pp-hub{flex:1;min-height:0;display:flex;flex-direction:column;max-width:560px;width:100%;margin:0 auto}\
.pp-daily{display:grid;grid-template-columns:1fr auto;align-items:center;gap:2px 10px;margin:10px 12px 8px;padding:12px 14px;border-radius:16px;border:2px solid;text-align:left;font:inherit;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.35)}\
.pp-daily .k{grid-column:1;font-size:10.5px;letter-spacing:.14em;font-weight:900;text-transform:uppercase;opacity:.85}.pp-daily .t{grid-column:1;font-family:var(--display,inherit);font-size:21px;line-height:1.1}\
.pp-daily .m{grid-column:1;font-size:12px;opacity:.9}.pp-daily .g{grid-column:2;grid-row:1/4;font-weight:900;font-size:14px;background:#F1D04A;color:#10241a;border-radius:11px;padding:10px 14px}\
.pp-map{position:relative;flex:1;min-height:0;overflow-x:hidden;overflow-y:auto;-webkit-overflow-scrolling:touch;border-top:1px solid rgba(241,208,74,.25)}\
.pp-world{position:relative;margin:0 auto}.pp-band{position:absolute;left:-200px;right:-200px;background-size:cover;background-position:center;background-repeat:no-repeat;overflow:hidden}.pp-land{position:absolute;left:0;top:0;image-rendering:pixelated;display:block}\
.pp-band.cloud{background:#e6edf6}\
.pp-cloudo{position:absolute;left:-200px;right:-200px;z-index:3;cursor:pointer;background:linear-gradient(180deg,#c9d6e8,#e6edf6);-webkit-tap-highlight-color:transparent}\
.pp-cloudo u{position:absolute;border-radius:50%;background:radial-gradient(circle at 42% 38%,#ffffff 0 52%,#e2e9f3 70%,rgba(226,233,243,0) 71%);animation:ppcloud 18s ease-in-out infinite alternate}\
.pp-cloudo u:nth-child(1){width:300px;height:170px;left:90px;bottom:-54px}.pp-cloudo u:nth-child(2){width:340px;height:190px;left:300px;bottom:-56px;animation-duration:23s}\
.pp-cloudo u:nth-child(3){width:280px;height:160px;left:520px;bottom:-50px;animation-duration:20s;animation-delay:-6s}.pp-cloudo u:nth-child(4){width:320px;height:180px;left:250px;top:18%;animation-delay:-11s;opacity:.8}\
.pp-cloudo u:nth-child(5){width:300px;height:170px;left:420px;top:44%;animation-duration:26s;animation-delay:-3s;opacity:.8}\
@keyframes ppcloud{to{transform:translateX(40px)}}@media (prefers-reduced-motion:reduce){.pp-cloudo u{animation:none}}\
.pp-wname.wm.wm-cloud{z-index:4}.wm-cloud i{background:#5d7190}.wm.wm-cloud b{font-family:Anton,var(--display,inherit);background:linear-gradient(180deg,#7a8aa6,#3b4a63);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 2px 0 #fff)}.wm.wm-cloud span{background:rgba(59,74,99,.75)}\
.pp-wname{position:absolute;left:0;right:0;text-align:center;pointer-events:none;text-shadow:0 2px 0 rgba(0,0,0,.55),0 0 8px rgba(0,0,0,.5)}.pp-wname b{display:block;font-family:var(--display,inherit);font-size:18px;letter-spacing:.02em}.pp-wname span{font-size:11px;font-weight:800;opacity:.8}\
/* EVERY WORLD HAS ITS OWN WORDMARK. A kicker on a ribbon, the name set in the type of that world and\
   metal, and the set pieces under it. Each is CSS on real text (so it stays text) and keeps to the\
   faces the page already loads: Anton, Cinzel and Barlow. The name is filled with a gradient and its\
   depth is a stack of drop shadows, because a text shadow would paint over a clipped gradient. */\
.pp-wname.wm{z-index:1;text-shadow:none;display:flex;flex-direction:column;align-items:center;gap:3px}\
.wm i{font-style:normal;font-family:"Barlow Semi Condensed",sans-serif;font-weight:800;font-size:9px;letter-spacing:.26em;text-transform:uppercase;padding:2px 10px 2px 12px;border-radius:3px;color:#fff;background:#1d3a26;box-shadow:0 2px 0 rgba(0,0,0,.35)}\
.wm b{display:block;font-size:30px;line-height:1;letter-spacing:.01em;padding:0 6px;-webkit-background-clip:text;background-clip:text;color:transparent;white-space:nowrap}\
.wm span{display:inline-block;font-family:"Barlow Semi Condensed",sans-serif;font-size:9.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;opacity:1;padding:2px 8px;border-radius:999px;background:rgba(0,0,0,.42);color:#fff}\
.wm-clubhouse i{background:#1f5a32;color:#f7f1dc;border:1px solid #c9a227}\
.wm-clubhouse b{font-family:Cinzel,serif;font-weight:700;font-size:27px;letter-spacing:.06em;background-image:linear-gradient(180deg,#fffdf3 0 45%,#efe2b8 55%,#d9c48a);-webkit-text-stroke:.6px #1d4a2a;filter:drop-shadow(0 1.5px 0 #1d4a2a) drop-shadow(0 1.5px 0 #163a21) drop-shadow(0 3px 3px rgba(0,0,0,.45))}\
.wm-lab i{background:#25344a;color:#9fe4ff}\
.wm-lab b{font-family:"Barlow Semi Condensed",sans-serif;font-weight:800;font-size:30px;letter-spacing:.04em;text-transform:uppercase;background-image:linear-gradient(180deg,#e9fbff,#7fd6f5);-webkit-text-stroke:.6px #14304a;filter:drop-shadow(0 2px 0 #14304a) drop-shadow(0 3px 3px rgba(0,0,0,.45))}\
.wm-temple i{background:#1c5c46;color:#bff5dd;border:1px solid #6fd3a8}\
.wm-temple b{font-family:Cinzel,serif;font-weight:700;font-size:28px;letter-spacing:.14em;text-transform:uppercase;background-image:linear-gradient(180deg,#f1e7bf,#cdbd85 52%,#9c8b57 53%,#c2b27a);-webkit-text-stroke:.7px #3a3420;filter:drop-shadow(0 1px 0 #5e5536) drop-shadow(0 1px 0 #4a432a) drop-shadow(0 1px 0 #3a3420) drop-shadow(0 3px 3px rgba(0,0,0,.55))}\
.wm-pirate i{background:#2b1a0d;color:#ffd23f;border:1px solid #ffd23f}\
.wm-pirate b{font-family:Cinzel,serif;font-weight:700;font-size:31px;letter-spacing:.03em;transform:rotate(-3deg);background-image:linear-gradient(180deg,#fff6c4,#ffd23f 45%,#d08a12 60%,#ffcf45);-webkit-text-stroke:.8px #3d2010;filter:drop-shadow(0 2px 0 #5a3214) drop-shadow(0 2px 0 #3d2010) drop-shadow(0 4px 4px rgba(0,0,0,.5))}\
.wm-canyon i{background:#3d2010;color:#ffcf8a;border:1px solid #ffb347}\
.wm-canyon b{font-family:Anton,Impact,sans-serif;font-size:34px;letter-spacing:.05em;text-transform:uppercase;background-image:linear-gradient(180deg,#fff0b0,#ffb347 50%,#d9621a);-webkit-text-stroke:.8px #3a1606;filter:drop-shadow(1.5px 1.5px 0 #7a3410) drop-shadow(1.5px 1.5px 0 #5a250a) drop-shadow(1.5px 1.5px 0 #3a1606) drop-shadow(0 4px 4px rgba(0,0,0,.5))}\
.wm-volcano i{background:#2a0d06;color:#ffb347;border:1px solid #ff6a1a}\
.wm-volcano b{font-family:Anton,Impact,sans-serif;font-size:34px;letter-spacing:.04em;text-transform:uppercase;background-image:linear-gradient(180deg,#fff7c2,#ffd23f 30%,#ff7a1a 62%,#c8240c);-webkit-text-stroke:.8px #2a0905;filter:drop-shadow(0 2px 0 #2a0905) drop-shadow(0 0 6px rgba(255,90,20,.85)) drop-shadow(0 0 14px rgba(255,60,10,.5))}\
.wm-dino i{background:#3a2a14;color:#e6f2b0;border:1px solid #b8e04a}\
.wm-dino b{font-family:Anton,Impact,sans-serif;font-size:34px;letter-spacing:.04em;text-transform:uppercase;background-image:linear-gradient(180deg,#f4f8c8 0 30%,#b8e04a 55%,#6a8a24);-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-stroke:.7px #2a3a10;filter:drop-shadow(0 2px 0 #2a3a10) drop-shadow(0 0 8px rgba(184,224,74,.5))}\
.wm-sky i{background:#ffffff;color:#2f6fae;border:1px solid #9fd0f5}\
.wm-sky b{font-family:Anton,Impact,sans-serif;font-size:33px;letter-spacing:.05em;text-transform:uppercase;background-image:linear-gradient(180deg,#ffe36a,#ff9f3a 55%,#ff5a3c);-webkit-text-stroke:1.2px #ffffff;filter:drop-shadow(0 3px 0 #ffffff) drop-shadow(0 4px 0 #6fb6e6) drop-shadow(0 6px 6px rgba(20,60,110,.35))}\
.wm-neon i{background:#120a24;color:#39ff14;border:1px solid #39ff14}\
.wm-neon b{font-family:"Barlow Semi Condensed",sans-serif;font-weight:800;font-size:31px;letter-spacing:.12em;text-transform:uppercase;background-image:linear-gradient(180deg,#ffd6f7,#ff2bd6 60%,#c010a0);-webkit-text-stroke:.6px #ffffff;filter:drop-shadow(0 0 4px #ff2bd6) drop-shadow(0 0 10px rgba(255,43,214,.8)) drop-shadow(0 0 18px rgba(0,229,255,.55))}\
.wm-school i{background:#ffd23f;color:#1f2430;border:1px solid #1f2430}\
.wm-school b{font-family:Anton,Impact,sans-serif;font-size:33px;letter-spacing:.05em;text-transform:uppercase;background-image:linear-gradient(180deg,#fff6b0,#ffd23f 55%,#f0a400);-webkit-text-stroke:1px #1f2430;filter:drop-shadow(0 3px 0 #1f2430) drop-shadow(0 5px 0 #e53935) drop-shadow(0 7px 6px rgba(0,0,0,.4))}\
.wm-iceage i{background:#3a2e22;color:#dcf4fa;border:1px solid #8fd0e0}\
.wm-iceage b{font-family:Anton,Impact,sans-serif;font-size:34px;letter-spacing:.06em;text-transform:uppercase;background-image:linear-gradient(180deg,#ffffff 0 30%,#bfe9f4 50%,#5aa8c4);-webkit-text-stroke:.9px #2a241c;filter:drop-shadow(0 2px 0 #5a4630) drop-shadow(0 4px 0 #2a241c) drop-shadow(0 0 8px rgba(143,208,224,.6))}\
.wm-candy i{background:#5a2e14;color:#ffd6e6;border:1px solid #ff5fa2}\
.wm-candy b{font-family:Anton,Impact,sans-serif;font-size:34px;letter-spacing:.05em;text-transform:uppercase;background-image:linear-gradient(180deg,#ffffff 0 22%,#ffa8cc 45%,#ff3b7a);-webkit-text-stroke:.9px #4a1a2e;filter:drop-shadow(0 2px 0 #9a2a5a) drop-shadow(0 4px 0 #3a1c0c) drop-shadow(0 0 8px rgba(255,154,208,.6))}\
.wm-hallows i{background:#2a1846;color:#ffad55;border:1px solid #ff8a1f}\
.wm-hallows b{font-family:Cinzel,serif;font-weight:700;font-size:29px;letter-spacing:.08em;background-image:linear-gradient(180deg,#ffe0b0,#ff8a1f 55%,#c2410c);-webkit-text-stroke:.7px #1a0e2c;filter:drop-shadow(0 2px 0 #1a0e2c) drop-shadow(0 0 8px rgba(160,90,255,.75)) drop-shadow(0 0 16px rgba(120,60,220,.45))}\
.wm-harvest i{background:#4a2a10;color:#ffd27a;border:1px solid #e0912a}\
.wm-harvest b{font-family:Cinzel,serif;font-weight:700;font-size:29px;letter-spacing:.05em;background-image:linear-gradient(180deg,#fff0c2,#f4a63a 50%,#b85a16);-webkit-text-stroke:.7px #3a1d08;filter:drop-shadow(0 2px 0 #6b3a14) drop-shadow(0 2px 0 #3a1d08) drop-shadow(0 4px 4px rgba(0,0,0,.45))}\
.pp-path{position:absolute;left:0;top:0;pointer-events:none}.pp-path path{fill:none;stroke:rgba(255,255,255,.75);stroke-width:5;stroke-dasharray:2 11;stroke-linecap:round}\
.pp-lv{position:absolute;transform:translate(-50%,-50%);width:50px;height:50px;border-radius:50%;border:3px solid #10241a;background:#F1D04A;color:#10241a;font:inherit;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 4px 0 rgba(0,0,0,.35);padding:0}\
.pp-lv b{font-family:var(--display,inherit);font-size:19px;line-height:1}.pp-lv span{font-size:10px;font-weight:900;line-height:1;opacity:.8}\
.pp-lv.done{background:#fff7d6}.pp-lv span.st{color:#ffd24a;letter-spacing:.06em}.pp-stars{font-size:30px;color:#ffd24a;letter-spacing:.12em;text-shadow:0 2px 0 rgba(0,0,0,.45);margin:4px 0 2px}.pp-lv.ace{background:linear-gradient(160deg,#ffe680,#d9a514);border-color:#7a5200}.pp-lv.lock{background:#5a6b62;color:#c9d6cf;border-color:#2a3530;box-shadow:none}\
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
.pp-drows{margin-top:8px}.pp-drow{display:flex;align-items:center;gap:8px;padding:6px 4px;border-top:1px solid rgba(255,255,255,.08);font-weight:800}.pp-drow b{width:22px;text-align:right;opacity:.8}.pp-drow span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left}.pp-drow em{font-style:normal;opacity:.85}.pp-drow.me{background:rgba(255,210,74,.14);border-radius:8px}.pp-dav{width:22px;height:22px;border-radius:50%;background:#1d3a5c no-repeat;background-size:230%;background-position:50% 8%;image-rendering:pixelated;flex:0 0 auto}.pp-av.g3,.pp-dav.g3{overflow:hidden}.pp-av.g3 img,.pp-dav.g3 img{display:block;width:100%;height:100%;object-fit:cover;image-rendering:pixelated}\
.pp-dres{border-radius:16px;padding:16px;text-align:center}.pp-dres .k{font-size:11px;letter-spacing:.14em;font-weight:900;text-transform:uppercase;opacity:.85}.pp-dres .t{font-family:var(--display,inherit);font-size:34px;margin:4px 0}.pp-dres .m{font-size:13px}\
.pp-hub{position:relative;max-width:none}.pp-hub .pp-map{position:absolute;inset:0;border-top:0;background:#0b1a12}\
.pp-hdr{position:absolute;left:0;right:0;top:0;z-index:2;display:flex;align-items:center;gap:8px;padding:calc(env(safe-area-inset-top,0px) + 10px) 12px 26px;background:linear-gradient(rgba(5,10,14,.78),rgba(5,10,14,0));pointer-events:none}\
.pp-hdr>*{pointer-events:auto}.pp-av{flex:0 0 auto;width:36px;height:36px;border-radius:50%;border:2px solid #F1D04A;background:#1d3a5c no-repeat;background-size:230%;background-position:50% 8%;image-rendering:pixelated;box-shadow:0 2px 0 rgba(0,0,0,.4)}\
.pp-hdr .pp-hearts{gap:4px}.pp-h{width:20px;height:20px;background:none;clip-path:none;display:block}.pp-h svg{display:block;width:20px;height:20px}.pp-h.on{background:none}\
.pp-hclock{font-size:12px;font-weight:900;color:#ffd0c8;font-variant-numeric:tabular-nums;background:rgba(0,0,0,.45);border-radius:999px;padding:3px 8px}.pp-hclock:empty{display:none}\
.pp-sp{flex:1}.pp-x2s{color:#ffd23a;font-weight:800}.pp-x2b{margin:14px auto 4px;max-width:340px;padding:10px 14px;border-radius:12px;background:rgba(241,182,42,.12);border:1px solid rgba(241,182,42,.45);color:#ffe9a8;font-size:13px;line-height:1.35;text-align:center}.pp-x2b b{display:block;font-size:17px;letter-spacing:.02em;color:#ffd23a;margin-bottom:2px}.pp-x2h{display:inline-block;width:14px;height:14px;vertical-align:-3px;margin-right:4px}.pp-x2h svg{display:block;width:100%;height:100%}.pp-x2b .pp-x2h{width:30px;height:30px;margin:0 auto 4px;display:block}.pp-x2s .pp-x2h{width:16px;height:16px;vertical-align:-3px}@media (min-width:900px){.pp-x2 .pp-x2h{width:18px;height:18px}}.pp-x2{border:0;border-radius:999px;padding:4px 9px;font:900 11px/1 inherit;letter-spacing:.04em;color:#2a1a04;background:linear-gradient(#ffe27a,#f1b62a);box-shadow:0 2px 8px rgba(241,182,42,.35);cursor:pointer;white-space:nowrap}@media (min-width:900px){.pp-x2{font-size:14px;padding:6px 12px}}.pp-cpill{display:flex;align-items:center;gap:6px;background:rgba(10,18,26,.82);border:1px solid rgba(255,255,255,.14);border-radius:999px;padding:5px 11px;font-weight:900;font-size:14px;color:#fff;font-variant-numeric:tabular-nums}.pp-cpill:before{content:"";width:12px;height:12px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#fff3a8,#f1c232 55%,#b8860b)}\
.pp-home{flex:none;width:34px;height:34px;border-radius:50%;padding:0;display:inline-flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.18);background:rgba(10,18,26,.82);cursor:pointer}.pp-home:active{opacity:.7}\
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
.pp-pop .pp-lives{gap:6px}.pp-pop .pp-lives .pp-h,.pp-pop .pp-lives .pp-h svg{width:28px;height:28px}\
.pp-sheet.pp-oolf{background:linear-gradient(#173226,#0a1a24);align-items:stretch;justify-content:flex-start;flex-direction:column;padding:0;overflow:auto}\
.pp-oolf .pp-hdr{position:relative;background:none}.pp-oolb{flex:1;display:flex;flex-direction:column;align-items:center;gap:10px;padding:24px 18px calc(env(safe-area-inset-bottom,0px) + 24px);max-width:420px;width:100%;margin:0 auto;box-sizing:border-box;text-align:center}\
.pp-oolb .k{font-size:13px;letter-spacing:.18em;font-weight:900;color:#ff6a55;margin-top:18px}.pp-oolb .pp-lives{gap:10px}.pp-oolb .pp-lives .pp-h,.pp-oolb .pp-lives .pp-h svg{width:42px;height:42px}\
.pp-oolb .lbl{font-weight:900;color:#e8f0f6;font-size:14px}.pp-oolb .pp-big{font-size:54px;color:#fbf2e0;line-height:1}.pp-oolb .m{font-size:12.5px;color:#a9bccb;margin:0 0 8px}\
.pp-oolb .pp-wide{margin:0;border-radius:14px;padding:13px;font-size:16px}.pp-oolb .ref{background:#F1D04A;color:#1c1606}.pp-oolb .pass{background:#12a08f;color:#fff}.pp-oolb .pt-bt{background:transparent;border-color:rgba(255,255,255,.22);color:#fff}.pp-oolb .pt-go[disabled]{opacity:.7}\
.pp-dres{background:linear-gradient(160deg,#2c1d46,#1a1230)!important;color:#fff!important;border:2px solid #f08a24;display:grid;grid-template-columns:1fr auto;gap:2px 12px;text-align:left}.pp-dres .k{color:#f08a24;grid-column:1}.pp-dres .nm{grid-column:1;font-family:var(--display,inherit);font-size:30px;line-height:1.05}\
.pp-dres .th{grid-column:2;grid-row:1/4;width:64px;height:96px;border-radius:9px;overflow:hidden;background:#0d1a12}.pp-dres .th canvas{width:100%;height:100%;object-fit:cover;image-rendering:pixelated;display:block}\
.pp-dres .sc{grid-column:1/3;display:flex;align-items:center;gap:12px;margin-top:6px}.pp-dres .sc b{font-family:var(--display,inherit);font-size:64px;line-height:1;color:#F1D04A;font-weight:400}.pp-dres .sc span{font-size:15px;line-height:1.25}.pp-dres .m{grid-column:1/3}\
.pt-top.pp-play{gap:8px;background:linear-gradient(#0a1420,#0e1c2a);border-bottom-color:rgba(255,255,255,.1)}.pp-play .pt-x{width:32px;height:32px;border-radius:50%;padding:0;font-size:14px}.pp-play .pp-av{width:30px;height:30px}.pp-play .pt-sc{display:none}.pp-play .pp-hearts{gap:2px}.pp-play .pp-h,.pp-play .pp-h svg{width:15px;height:15px}\
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
@media (min-width:900px){.pp-hdr{padding:18px 28px 40px;gap:14px}.pp-av{width:52px;height:52px}.pp-hdr .pp-h,.pp-hdr .pp-h svg{width:28px;height:28px}.pp-hclock{font-size:15px}.pp-cpill{font-size:19px;padding:8px 16px}.pp-cpill:before{width:16px;height:16px}.pp-cx{width:46px;height:46px;font-size:20px}\
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
.pp-lv.wt-dino{border-radius:46% 54% 50% 50%/58% 58% 42% 42%;background:radial-gradient(circle at 34% 30%,#fbf4dc,#ece2c0 55%,#cbbf96);border-color:#6a7a3a;color:#2a3a10}\
.pp-lv.wt-dino.lock{background:radial-gradient(circle at 34% 30%,#a8a088,#7a7460);border-color:#4a4a36;color:#ecead8}.pp-lv.wt-dino.cur{background:radial-gradient(circle at 40% 32%,#ffffff,#d8f07a 55%,#7aa02a);border-color:#2a3a10;color:#1e2a0a;box-shadow:0 0 14px rgba(200,240,90,.85),0 4px 0 rgba(0,0,0,.35)}\
.pp-lv.wt-sky{border-radius:46% 54% 50% 50%/60% 60% 40% 40%;background:radial-gradient(circle at 40% 30%,#ffffff,#eaf5fd 60%,#c3dff4);border-color:#5a9ccc;color:#1d3550}\
.pp-lv.wt-sky.lock{background:radial-gradient(circle at 40% 30%,#a9bccb,#7d93a6);border-color:#5a7086;color:#eef4f8}.pp-lv.wt-sky.cur{background:radial-gradient(circle at 40% 30%,#fff6b0,#ffd23f 55%,#ff9f3a);border-color:#ffffff;color:#3a2200;box-shadow:0 0 14px rgba(255,214,63,.9),0 4px 0 rgba(0,0,0,.3)}\
.pp-lv.wt-neon{border-radius:8px;background:#120a24;border-color:#00e5ff;color:#b8faff;box-shadow:0 0 8px rgba(0,229,255,.7),inset 0 0 6px rgba(0,229,255,.45),0 4px 0 rgba(0,0,0,.5)}\
.pp-lv.wt-neon.lock{background:#0d0a18;border-color:#3a2c5a;color:#6a5e8a;box-shadow:0 3px 0 rgba(0,0,0,.4)}.pp-lv.wt-neon.cur{background:#2a0a28;border-color:#ff2bd6;color:#ffd6f7;box-shadow:0 0 14px rgba(255,43,214,.95),inset 0 0 8px rgba(255,43,214,.6),0 4px 0 rgba(0,0,0,.4)}.pp-lv.wt-neon.cur:after{border-radius:12px}\
.pp-lv.wt-school{border-radius:9px;background:linear-gradient(180deg,#ffe066,#ffc61a 60%,#e0a800);border-color:#1f2430;color:#1f2430;box-shadow:inset 0 -5px 0 rgba(0,0,0,.18),0 4px 0 rgba(0,0,0,.4)}\
.pp-lv.wt-school.lock{background:linear-gradient(180deg,#6a6e76,#4c5058);border-color:#2a2e36;color:#cfd2d8;box-shadow:0 3px 0 rgba(0,0,0,.4)}.pp-lv.wt-school.cur{background:radial-gradient(circle at 42% 35%,#ff8a7a,#e53935 60%,#a3201a);border-color:#ffffff;color:#ffffff;box-shadow:0 0 14px rgba(229,57,53,.85),0 4px 0 rgba(0,0,0,.4)}.pp-lv.wt-school.cur:after{border-radius:13px}\
.pp-lv.wt-iceage{border-radius:44% 56% 48% 52%/52% 46% 54% 48%;background:radial-gradient(circle at 38% 30%,#ffffff,#bfe9f4 50%,#7fc0d6);border-color:#4a3a28;color:#2a241c}\
.pp-lv.wt-iceage.lock{background:radial-gradient(circle at 38% 30%,#a89884,#7a6a56);border-color:#4a3a28;color:#efe4cc}.pp-lv.wt-iceage.cur{background:radial-gradient(circle at 40% 35%,#fff4d8,#d9c9a6 55%,#a88a5a);border-color:#2a241c;color:#2a1a0a;box-shadow:0 0 14px rgba(174,240,255,.9),0 4px 0 rgba(0,0,0,.35)}\
.pp-lv.wt-candy{border-radius:50%;background:repeating-conic-gradient(from 20deg,#ff5fa2 0 30deg,#fff4f8 30deg 60deg);border-color:#9a2a5a;color:#3a1c0c;text-shadow:0 0 3px #fff,0 0 2px #fff}\
.pp-lv.wt-candy.lock{background:radial-gradient(circle at 38% 30%,#a8683e,#5a2e14);border-color:#3a1c0c;color:#f6d9c4;text-shadow:none}.pp-lv.wt-candy.cur{background:radial-gradient(circle at 40% 35%,#fff4c0,#ffd23f 55%,#e09a10);border-color:#3a1c0c;color:#3a1c0c;box-shadow:0 0 14px rgba(255,154,208,.9),0 4px 0 rgba(0,0,0,.35)}\
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
.pp-hub[data-wt=dino]{--wa:#b8e04a;--wi:#1e2a0a;--wb1:#5a6a2a;--wb2:#2e3a14;--wt:rgba(30,42,10,.9)}\
.pp-hub[data-wt=sky]{--wa:#ffd23f;--wi:#3a2200;--wb1:#3f87c4;--wb2:#1d5a90;--wt:rgba(20,52,90,.9)}\
.pp-hub[data-wt=neon]{--wa:#ff2bd6;--wi:#ffffff;--wb1:#2a0a3a;--wb2:#0d0b1e;--wt:rgba(13,11,30,.93)}\
.pp-hub[data-wt=school]{--wa:#ffd23f;--wi:#1f2430;--wb1:#3a4a6a;--wb2:#1f2430;--wt:rgba(31,36,48,.92)}\
.pp-hub[data-wt=iceage]{--wa:#8fd0e0;--wi:#2a241c;--wb1:#5a4630;--wb2:#2a241c;--wt:rgba(42,36,28,.92)}\
.pp-hub[data-wt=candy]{--wa:#ff5fa2;--wi:#3a1c0c;--wb1:#7a4422;--wb2:#3a1c0c;--wt:rgba(58,28,12,.92)}\
.pp-hub[data-wt=haunted]{--wa:#ff9a3a;--wi:#2a1606;--wb1:#3a1f63;--wb2:#1c1438;--wt:rgba(28,20,44,.92)}\
.pp-hub[data-wt=harvest]{--wa:#f2a93b;--wi:#2b1606;--wb1:#7a4a1e;--wb2:#3a220c;--wt:rgba(52,32,12,.92)}\
.pp-hub[data-wt] .pp-daily{background:linear-gradient(135deg,var(--wb1),var(--wb2) 62%)!important;box-shadow:0 0 0 2px var(--wa),0 10px 26px rgba(0,0,0,.45);transition:background .4s,box-shadow .4s}\
.pp-hub[data-wt] .pp-daily .pp-dside .g{background:var(--wa);color:var(--wi)}.pp-hub[data-wt] .pp-dk b{color:var(--wa)}.pp-hub[data-wt] .pp-dside .rw{color:var(--wa)}\
/* ON A WIDE SCREEN THE DAILY STANDS TO THE SIDE. The map sits in the middle of the window with landscape either side, so the card docks in that landscape, top left, rather than across the levels. On a phone it stays on top, where there is no side to put it. */\
@media (max-width:899px){.pp-hub .pp-daily.mini{right:auto;max-width:none;padding:6px 8px;gap:8px;border-radius:14px}.pp-hub .pp-daily.mini .pp-dmid{display:none}.pp-hub .pp-daily.mini .pp-dtile{width:34px}.pp-hub .pp-daily.mini .pp-dtile .mo{font-size:8px;padding:1px 0}.pp-hub .pp-daily.mini .pp-dtile .dy{font-size:18px}.pp-hub .pp-daily.mini .pp-dside .g{padding:7px 12px;font-size:13px}.pp-hub .pp-daily.mini .pp-dside .rw{display:none}}@media (min-width:900px){.pp-hub .pp-daily{left:24px;right:auto;top:100px;width:clamp(220px,26vw,300px);max-width:none;margin:0;flex-direction:column;align-items:stretch;text-align:center;gap:12px;padding:20px 18px 18px}.pp-hub .pp-daily .pp-dtile{align-self:center}.pp-hub .pp-dmid{align-items:center;text-align:center;gap:4px}.pp-hub .pp-dk{justify-content:center}.pp-hub .pp-daily .t{white-space:normal;font-size:clamp(24px,2.6vw,30px)}.pp-hub .pp-daily .m{white-space:normal}.pp-hub .pp-daily .pp-dside{align-items:stretch}.pp-hub .pp-daily .pp-dside .g{text-align:center}}\
.pp-hub[data-wt] .pp-tabs,.pp-hub[data-wt] .pp-wchip{background:var(--wt);border-color:color-mix(in srgb,var(--wa) 45%,transparent)}.pp-hub[data-wt] .pp-tabs button.on{background:var(--wa);color:var(--wi)}.pp-hub[data-wt] .pp-wchip{color:#fff;box-shadow:inset 3px 0 0 var(--wa)}\
.pp-walking .pp-daily,.pp-walking .pp-tabs,.pp-walking .pp-wchip{opacity:0;pointer-events:none;transition:opacity .25s}.pp-walking .pp-map{overflow:hidden}.pp-me.walk{transform:translate(-50%,-100%)!important;z-index:3}.pp-me.walk img{animation:ppwalk .34s steps(2) infinite;transform-origin:50% 100%}.pp-me.walk.flip img{scale:-1 1}@keyframes ppwalk{50%{translate:0 -3px;rotate:-3deg}}\
.pp-me.tap{pointer-events:auto;cursor:pointer}.pp-me.tap::after{content:"Walk";position:absolute;left:50%;top:100%;transform:translateX(-50%);font-size:10px;font-weight:900;color:#3a2a14;background:#ffd24a;border:2px solid #3a2a14;border-radius:8px;padding:1px 6px}\
.pp-tui{position:absolute;inset:0;z-index:4;pointer-events:none}.pp-tui button{pointer-events:auto}\
.pp-trail{flex:1;min-height:0;display:flex;flex-direction:column}.pp-tbox{position:relative;flex:1;min-height:0;overflow:hidden;touch-action:none;background:#07130d}.pp-tcv{position:absolute;inset:0;image-rendering:pixelated;touch-action:none}\
.pp-tload{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;font-weight:900;color:#fff}.pp-tload span{width:60%;max-width:280px;height:10px;border-radius:6px;background:rgba(255,255,255,.15);overflow:hidden}.pp-tload u{display:block;height:100%;width:8%;background:#ffd24a;transition:width .2s}\
.pp-bagb{position:absolute;right:12px;top:60px;z-index:3;font:900 13px system-ui,sans-serif;color:#3a2a14;background:#ffd24a;border:2px solid #3a2a14;border-radius:12px;padding:6px 12px;box-shadow:0 3px 0 #3a2a14;cursor:pointer}\
.pp-bag .pp-card{max-height:86vh;overflow:auto;text-align:left}.pp-bsec{margin:14px 0 6px;font:900 11px system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;opacity:.7}\
.pp-bput{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.06);margin:6px 0}.pp-bput.on{background:rgba(255,210,74,.18);outline:2px solid #ffd24a}\
.pp-bagb.pp-closb{right:76px}.pp-pth{flex:0 0 44px;width:44px;height:44px;display:block}.pp-pth .sthumb{width:44px!important;height:44px!important;display:block;margin:0}.pp-bput.locked{opacity:.6}.pp-plock{font-style:normal;font-size:11px;font-weight:800;opacity:.8}.pp-bpn{flex:1;min-width:0}.pp-bpn b{display:block;font-size:14px}.pp-bpn span{display:block;font-size:12px;opacity:.8}.pp-bput button{flex:0 0 auto;padding:6px 12px;min-width:0}\
.pp-bpp{display:flex;gap:4px}.pp-bpp u{width:12px;height:12px;border-radius:3px;background:rgba(255,255,255,.18)}.pp-bpp u.on{background:#ffd24a}\
.pp-bw{padding:6px 10px;border-left:4px solid var(--wc);margin:6px 0;background:rgba(255,255,255,.04);border-radius:6px}.pp-bw b{font-size:13px}.pp-bw em{display:block;font-size:11px;font-style:normal;opacity:.75}\
.pp-btk{display:flex;flex-wrap:wrap;gap:4px;margin:4px 0}.pp-btk i{font-style:normal;font-size:11px;padding:2px 7px;border-radius:8px;background:rgba(255,255,255,.08);opacity:.55}.pp-btk i.on{opacity:1;background:var(--wc);color:#1a1420;font-weight:800}\
.pp-hbank{margin-left:4px;font:900 12px system-ui,sans-serif;color:#ffd24a}.pp-hmore{margin-left:4px;font:900 12px system-ui,sans-serif;color:#ff5a4a}.pp-hx{filter:drop-shadow(0 0 3px #ffd24a)}\
.pp-bump{animation:ppbump .42s cubic-bezier(.3,1.6,.5,1)}@keyframes ppbump{0%{transform:scale(1)}35%{transform:scale(1.35);filter:brightness(1.5)}100%{transform:scale(1)}}.pp-thud{position:absolute;left:10px;top:10px;display:flex;gap:6px}.pp-thud span{font-size:13px;font-weight:900;color:#3a2a14;background:#ffd24a;border:2px solid #3a2a14;border-radius:10px;padding:3px 9px}.pp-thud span:empty{display:none}\
.pp-bub{position:absolute;transform:translate(-50%,-100%);max-width:min(78vw,300px);font-size:14px;font-weight:800;line-height:1.3;color:#1d2a20;background:#fffdf5;border:2px solid #3a2a14;border-radius:12px;padding:8px 11px;box-shadow:0 3px 0 rgba(0,0,0,.35)}.pp-bub[hidden]{display:none}\
.pp-way{position:absolute;display:none;transform:translate(-50%,-50%);flex-direction:column;align-items:center;gap:3px}.pp-way.on{display:flex}\
.pp-way i{display:block;width:0;height:0;border-left:15px solid transparent;border-right:15px solid transparent;border-bottom:26px solid #ffd24a;filter:drop-shadow(0 2px 0 #3a2a14) drop-shadow(0 0 6px rgba(0,0,0,.6));animation:ppway 1s ease-in-out infinite}\
.pp-way b{font-size:11px;font-weight:900;color:#fff;background:rgba(16,24,20,.86);border:2px solid #ffd24a;border-radius:9px;padding:2px 7px;white-space:nowrap}@keyframes ppway{50%{scale:1.14}}\
.pp-pin{position:absolute;display:none;transform:translate(-50%,-100%);flex-direction:column;align-items:center;animation:pppin 1.1s ease-in-out infinite}.pp-pin.on{display:flex}\
.pp-pin b{font-size:12px;font-weight:900;color:#3a2a14;background:#ffd24a;border:2px solid #3a2a14;border-radius:10px;padding:2px 8px;white-space:nowrap}.pp-pin i{font-style:normal;font-size:10px;font-weight:900;color:#fff;text-shadow:0 1px 0 #000}\
.pp-pin::after{content:"";width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-top:11px solid #ffd24a;margin-top:-1px;filter:drop-shadow(0 2px 0 #3a2a14)}@keyframes pppin{50%{translate:0 -7px}}\
.pp-stick{position:absolute;left:78px;bottom:96px;width:104px;height:104px;margin:-52px 0 0 -52px;border-radius:50%;border:3px solid rgba(255,255,255,.55);background:rgba(10,18,14,.32);opacity:.55;transition:opacity .2s}.pp-stick.on{opacity:1;bottom:auto}\
.pp-stick i{position:absolute;left:50%;top:50%;width:46px;height:46px;margin:-23px;border-radius:50%;background:radial-gradient(circle at 38% 34%,#fff6d6,#ffd24a 55%,#b88a10);border:3px solid #3a2a14;box-shadow:0 3px 0 rgba(0,0,0,.35)}\
.pp-rbar{position:absolute;right:12px;bottom:max(14px,env(safe-area-inset-bottom));display:flex;gap:8px;pointer-events:auto}.pp-rb{font:inherit;font-size:12px;font-weight:900;border-radius:12px;border:2px solid #3a2a14;background:#f6ead2;color:#3a2a14;padding:8px 12px;cursor:pointer;box-shadow:0 3px 0 rgba(0,0,0,.35)}\
.pp-wv{position:relative}.pp-wv>.pp-hdr{z-index:6}\
.pp-mapb,.pp-toworld{display:flex;align-items:center;gap:6px;height:38px;width:auto;border-radius:12px;border:2px solid #3a2a14;background:#ffd24a;color:#3a2a14;font:900 14px system-ui,sans-serif;padding:0 12px 0 8px;cursor:pointer;box-shadow:0 3px 0 #3a2a14}.pp-mapb svg,.pp-toworld svg{width:22px;height:22px;display:block}.pp-mapb:active,.pp-toworld:active{transform:translateY(2px);box-shadow:0 1px 0 #3a2a14}\
.pp-wv .pp-thud{top:calc(env(safe-area-inset-top,0px) + 102px)}.pp-tlist{position:absolute;left:10px;top:calc(env(safe-area-inset-top,0px) + 134px);display:flex;flex-direction:column;gap:3px;max-width:46vw;pointer-events:none}.pp-tlist:empty{display:none}.pp-tlist span.near:not(.got){box-shadow:0 0 0 1.5px #ffd23a,0 0 10px rgba(255,210,58,.7);animation:ppnear 1.2s ease-in-out infinite alternate}@keyframes ppnear{to{box-shadow:0 0 0 1.5px #ffd23a,0 0 3px rgba(255,210,58,.3)}}.pp-tlist b{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#fff;text-shadow:0 1px 2px #000}.pp-tlist span{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:800;color:#fff;background:rgba(20,16,10,.62);border-radius:9px;padding:3px 8px 3px 5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pp-tlist img{width:20px;height:16px;object-fit:contain;image-rendering:pixelated;flex:none}.pp-tlist span.got{opacity:.55;text-decoration:line-through}\
.pp-wv .pp-rhint{top:auto;bottom:calc(max(14px,env(safe-area-inset-bottom)) + 58px)}\
.pp-hub:has(.pp-daily) .pp-bagb{top:calc(env(safe-area-inset-top,0px) + 178px)}\
.pp-wv>.pp-bagb{top:calc(env(safe-area-inset-top,0px) + 98px);z-index:5}\
.pp-tgoal{position:absolute;left:50%;top:calc(env(safe-area-inset-top,0px) + 58px);transform:translateX(-50%);z-index:5;pointer-events:none;display:flex;flex-direction:column;align-items:center;gap:1px;max-width:calc(100% - 24px);background:rgba(10,18,14,.8);border:2px solid rgba(255,210,74,.7);border-radius:12px;padding:4px 12px;text-align:center}\
.pp-tgoal i{font:900 10px system-ui,sans-serif;letter-spacing:.1em;text-transform:uppercase;font-style:normal;color:#ffd24a;white-space:nowrap}.pp-tgoal b{font:900 13px system-ui,sans-serif;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}\
.pp-wban{position:absolute;left:0;right:0;top:30%;z-index:7;pointer-events:none;display:flex;flex-direction:column;align-items:center;gap:4px;padding:16px 12px;background:linear-gradient(90deg,transparent,rgba(8,12,18,.82) 18%,rgba(8,12,18,.82) 82%,transparent);animation:ppwban .6s cubic-bezier(.2,1.4,.4,1) both;transition:opacity .6s,transform .6s}\
.pp-wban i{font:900 13px system-ui,sans-serif;letter-spacing:.24em;text-transform:uppercase;font-style:normal;color:var(--wa)}.pp-wban b{font:900 clamp(30px,9vw,54px)/1 Georgia,serif;color:#fff;text-shadow:0 3px 0 #3a2a14,0 0 18px var(--wa);text-align:center}.pp-wban span{font:800 12px system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#e8f2ec;opacity:.85}\
.pp-wban.out{opacity:0;transform:translateY(-24px)}@keyframes ppwban{0%{opacity:0;transform:scale(1.6)}100%{opacity:1;transform:none}}\
.pp-gd{position:absolute;left:0;right:0;bottom:0;z-index:8;pointer-events:auto;padding:0 10px max(12px,env(safe-area-inset-bottom));display:flex;justify-content:center;animation:ppgd .35s cubic-bezier(.2,1.3,.4,1) both;cursor:pointer;touch-action:manipulation}\
.pp-gdbox{position:relative;width:100%;max-width:560px;min-height:118px;box-sizing:border-box;background:#fffdf5;border:3px solid #3a2a14;border-radius:18px;box-shadow:0 5px 0 #3a2a14,0 0 0 5px var(--gc) inset;padding:30px 18px 16px 100px}\
.pp-gdp{position:absolute;left:12px;top:-30px;width:78px;height:78px;border-radius:50%;background:radial-gradient(circle at 50% 40%,#fff,var(--gc));border:3px solid #3a2a14;box-shadow:0 3px 0 #3a2a14;overflow:hidden}.pp-gdp canvas{width:100%;height:100%;image-rendering:pixelated;display:block}\
.pp-gdn{position:absolute;left:96px;top:-17px;display:flex;align-items:baseline;gap:8px;background:var(--gc);border:3px solid #3a2a14;border-radius:10px;padding:3px 12px;box-shadow:0 3px 0 #3a2a14}.pp-gdn b{font:900 15px system-ui,sans-serif;color:#1d1408}.pp-gdn i{font:800 11px system-ui,sans-serif;font-style:normal;color:#1d1408;opacity:.75}\
.pp-gd p{margin:0;min-height:48px;font:800 16px/1.35 system-ui,sans-serif;color:#1d2a20}\
.pp-gdm{position:absolute;right:16px;bottom:8px;font-size:14px;color:#3a2a14;opacity:0}.pp-gdm.on{opacity:1;animation:ppgdm .7s ease-in-out infinite}@keyframes ppgdm{50%{transform:translateY(4px)}}\
.pp-gdx{position:absolute;right:10px;top:8px;font:900 11px system-ui,sans-serif;color:#3a2a14;background:none;border:0;opacity:.6;cursor:pointer;padding:4px}\
@keyframes ppgd{0%{opacity:0;transform:translateY(60px)}100%{opacity:1;transform:none}}.pp-tui:has(.pp-gd) .pp-rbar,.pp-tui:has(.pp-gd) .pp-way,.pp-tui:has(.pp-gd) .pp-pin,.pp-tui:has(.pp-gd) .pp-stick,.pp-tui:has(.pp-gd) .pp-rhint{display:none}\
.pp-gdp.pic{background-repeat:no-repeat;background-size:230%;background-position:50% 8%;background-color:var(--gc);image-rendering:pixelated}\
.pp-talkb{background:#ffd24a!important;animation:ppway 1s ease-in-out infinite}.pp-talkb[hidden]{display:none}\
@media (min-width:900px){.pp-wv .pp-thud{top:120px}.pp-tlist{top:152px}.pp-wv>.pp-bagb{top:118px}.pp-tgoal{top:72px}.pp-gd p{font-size:18px}}\
.pp-rhint{position:absolute;left:50%;top:70px;transform:translateX(-50%);font-size:13px;font-weight:900;color:#fff;background:rgba(10,18,14,.78);border-radius:12px;padding:6px 12px;white-space:nowrap;transition:opacity .4s}.pp-rhint.gone{opacity:0}.pp-tui.ingym .pp-tlist{display:none}.pp-tui.ingym .pp-stick,.pp-tui.ingym .pp-rbar,.pp-tui.ingym .pp-rhint,.pp-tui.ingym .pp-bub,.pp-tui.ingym .pp-thud,.pp-wv:has(.pp-tui.ingym)>.pp-tgoal,.pp-wv:has(.pp-tui.ingym)>.pp-bagb,.pp-wv:has(.pp-tui.ingym) .pp-wban{display:none}\
.pp-gp{position:absolute;left:8px;right:8px;bottom:max(8px,env(safe-area-inset-bottom));z-index:6;pointer-events:auto;display:flex;flex-direction:column;gap:6px;padding:9px 11px 10px;background:rgba(16,22,34,.94);border:2px solid rgba(200,156,255,.75);border-radius:16px;box-shadow:0 6px 18px rgba(0,0,0,.4);color:#fff;font:800 14px system-ui,sans-serif;touch-action:none;user-select:none;-webkit-user-select:none}.pp-gp[hidden]{display:none}.pp-gp.won{border-color:#ffd24a;box-shadow:0 0 0 2px rgba(255,210,74,.35),0 6px 18px rgba(0,0,0,.4)}\
.pp-gph{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;min-width:0}.pp-gph b{font-size:16px;font-weight:900;color:#ffd24a;line-height:1.2}.pp-gph i{font-style:normal;font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;background:#c89cff;color:#2a1440;border-radius:8px;padding:2px 7px;white-space:nowrap}.pp-gph i[hidden]{display:none}.pp-gph span{margin-left:auto;font-size:12px;font-weight:800;color:#c8d0e0;white-space:nowrap}\
.pp-gpg{margin:0;font-size:14px;font-weight:900;line-height:1.3;color:#fff;padding-left:22px;position:relative}.pp-gpg:before{content:"";position:absolute;left:2px;top:2px;width:12px;height:12px;border-radius:50%;border:3px solid #ffd24a;box-shadow:inset 0 0 0 3px rgba(16,22,34,.94),inset 0 0 0 7px #ffd24a}\
.pp-gps{display:flex;gap:8px;align-items:flex-start;min-height:calc(3.9em + 12px);box-sizing:border-box;background:rgba(255,255,255,.08);border-radius:10px;padding:6px 8px}.pp-gpf{flex:0 0 36px;height:36px;border-radius:50%;background:#2a3346 center/cover no-repeat;border:2px solid #c89cff;display:none}.pp-gps.civ .pp-gpf{display:block}.pp-gps p{margin:0;font-size:13px;line-height:1.3;font-weight:700;color:#e8ecf4}.pp-gps:not(.civ) p{color:#ffe7a3}.pp-gps.fresh{animation:ppgpf .6s ease-out}@keyframes ppgpf{0%{background:rgba(255,210,74,.35)}100%{background:rgba(255,255,255,.08)}}\
.pp-gpc{display:flex;gap:10px;align-items:center}.pp-gpb{flex:1;display:grid;grid-template-columns:1fr 1fr;gap:8px;min-width:0}.pp-gpb button,.pp-gpd button{font:900 15px system-ui,sans-serif;border-radius:12px;border:2px solid #3a2a14;background:#f6ead2;color:#3a2a14;box-shadow:0 3px 0 #3a2a14;cursor:pointer;touch-action:none}.pp-gpb button{min-height:48px;padding:0 8px}.pp-gpb button[data-gleave]{grid-column:1/3;background:#2a3346;color:#fff;border-color:#6a7a9a;box-shadow:0 3px 0 #10141e}.pp-gpb button:disabled{opacity:.45;cursor:default}.pp-gpb button.lit{background:#ffd24a;animation:ppgplit 1s ease-in-out infinite alternate}@keyframes ppgplit{100%{box-shadow:0 3px 0 #3a2a14,0 0 0 4px rgba(255,210,74,.5)}}.pp-gpb button:active:not(:disabled),.pp-gpd button:active{transform:translateY(2px);box-shadow:0 1px 0 #3a2a14}\
.pp-gpd{flex:0 0 120px;height:120px;display:grid;grid-template-columns:repeat(3,40px);grid-template-rows:repeat(3,40px)}.pp-gpd[hidden]{display:none}.pp-gpd button{width:40px;height:40px;padding:0;position:relative;border-radius:10px}.pp-gpd button:before{content:"";position:absolute;left:50%;top:50%;width:16px;height:12px;margin:-6px 0 0 -8px;background:#3a2a14;clip-path:polygon(50% 0,100% 100%,0 100%)}\
.pp-gpd [data-d="0"]{grid-area:1/2}.pp-gpd [data-d="3"]{grid-area:2/1}.pp-gpd [data-d="1"]{grid-area:2/3}.pp-gpd [data-d="2"]{grid-area:3/2}.pp-gpd [data-d="1"]:before{transform:rotate(90deg)}.pp-gpd [data-d="2"]:before{transform:rotate(180deg)}.pp-gpd [data-d="3"]:before{transform:rotate(270deg)}\
.pp-gpk{display:none;font-size:11px;font-weight:800;color:#a8b2c6}@media (pointer:fine){.pp-gpk{display:block}}\
@media (min-width:700px) and (min-aspect-ratio:1/1){.pp-gp{left:auto;right:16px;top:calc(env(safe-area-inset-top,0px) + 72px);bottom:auto;width:330px;padding:14px 16px;gap:10px}.pp-gph b{font-size:18px}.pp-gpg{font-size:15px}.pp-gps p{font-size:14px}}\
/* A WORLD DOOR: two leaves made of that world, a lock that fills with the stars you have */\
.pp-door{position:absolute;z-index:6;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;opacity:0;transition:opacity .35s;background:radial-gradient(ellipse at center,rgba(0,0,0,.35),rgba(0,0,0,.75))}.pp-door.in{opacity:1}\
.pp-dl,.pp-dr{position:absolute;top:6%;bottom:6%;width:min(44vw,300px);background:linear-gradient(180deg,var(--dc),var(--db));border:6px solid color-mix(in srgb,var(--da) 70%,#000);box-shadow:inset 0 0 0 4px rgba(0,0,0,.35),0 20px 40px rgba(0,0,0,.6);transition:transform .9s cubic-bezier(.6,0,.3,1)}\
.pp-dl{right:50%;border-radius:22px 0 0 22px;border-right-width:3px}.pp-dr{left:50%;border-radius:0 22px 22px 0;border-left-width:3px}.pp-door .pp-dl,.pp-door .pp-dr{transform:scale(.92)}.pp-door.in .pp-dl,.pp-door.in .pp-dr{transform:none}\
.pp-door.open .pp-dl{transform:translateX(-110%)}.pp-door.open .pp-dr{transform:translateX(110%)}.pp-door.open .pp-dlock{opacity:0;transform:translate(-50%,-50%) scale(1.3)}\
.pp-door.shut .pp-dlock{animation:ppshake .45s}@keyframes ppshake{20%,60%{margin-left:-9px}40%,80%{margin-left:9px}}\
.pp-dlock{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(78vw,300px);padding:16px 18px;border-radius:20px;text-align:center;color:#fff;background:rgba(8,12,18,.88);border:3px solid var(--da);box-shadow:0 0 30px color-mix(in srgb,var(--da) 55%,transparent);transition:opacity .5s,transform .5s}\
.pp-dlock i{display:block;font-style:normal;font-size:11px;font-weight:900;letter-spacing:.16em;text-transform:uppercase;color:var(--da)}.pp-dlock b{display:block;font-family:var(--display,inherit);font-size:30px;line-height:1.1;margin:2px 0 10px}\
.pp-dbar{display:block;height:12px;border-radius:99px;background:rgba(255,255,255,.14);overflow:hidden}.pp-dbar u{display:block;height:100%;width:0;background:var(--da);border-radius:99px;transition:width .9s ease-out}.pp-door.fill .pp-dbar u{width:calc(var(--f) * 100%)}\
.pp-dlock em{display:block;font-style:normal;font-weight:900;font-size:18px;margin-top:8px;color:#ffd45e}.pp-dlock small{display:block;margin-top:4px;font-size:12.5px;opacity:.85}\
.pp-door[data-door=temple] .pp-dl,.pp-door[data-door=temple] .pp-dr{background:repeating-linear-gradient(0deg,rgba(0,0,0,.18) 0 3px,transparent 3px 46px),linear-gradient(180deg,#6f6a50,#3f3c2c);border-color:#2f4a2a}\
.pp-door[data-door=temple] .pp-dl:after,.pp-door[data-door=temple] .pp-dr:after{content:"";position:absolute;inset:0;background:radial-gradient(circle at 20% 10%,#2f7a3c 0 22px,transparent 23px),radial-gradient(circle at 80% 30%,#2f7a3c 0 16px,transparent 17px),radial-gradient(circle at 30% 85%,#2f7a3c 0 18px,transparent 19px);opacity:.9;border-radius:inherit}\
.pp-door[data-door=pirate] .pp-dl,.pp-door[data-door=pirate] .pp-dr{background:repeating-linear-gradient(90deg,rgba(0,0,0,.28) 0 3px,transparent 3px 34px),linear-gradient(180deg,#8a5a34,#5a3a20);border-color:#2b1a0e}\
.pp-door[data-door=canyon] .pp-dl,.pp-door[data-door=canyon] .pp-dr{background:repeating-linear-gradient(90deg,#3a3a40 0 10px,transparent 10px 40px),repeating-linear-gradient(0deg,#3a3a40 0 10px,transparent 10px 70px),linear-gradient(180deg,#5a3b22,#2a1a10);border-color:#6e6e76}\
.pp-door[data-door=volcano] .pp-dl,.pp-door[data-door=volcano] .pp-dr{background:repeating-linear-gradient(35deg,rgba(255,110,30,.5) 0 2px,transparent 2px 38px),linear-gradient(180deg,#3a2c2c,#1a1212);border-color:#ff6a1e}\
.pp-door[data-door=dino] .pp-dl,.pp-door[data-door=dino] .pp-dr{background:repeating-linear-gradient(90deg,transparent 0 22%,rgba(244,234,210,.85) 22% 27%,transparent 27% 33%),linear-gradient(180deg,#8a6a3a,#4a361c);border-color:#e8cc92}\
.pp-door[data-door=sky] .pp-dl,.pp-door[data-door=sky] .pp-dr{background:radial-gradient(circle at 30% 20%,#fff 0 40px,transparent 41px),radial-gradient(circle at 70% 60%,#fff 0 52px,transparent 53px),linear-gradient(180deg,#9fd3ff,#e8f5ff);border-color:#ffd45e}\
.pp-door[data-door=clouds] .pp-dl,.pp-door[data-door=clouds] .pp-dr{background:radial-gradient(circle at 30% 25%,#fff 0 46px,transparent 47px),radial-gradient(circle at 75% 55%,#fff 0 58px,transparent 59px),radial-gradient(circle at 35% 80%,#f3f6fb 0 50px,transparent 51px),linear-gradient(180deg,#c9d5e6,#8ea0bb);border-color:#eef3fa}\
.pp-door[data-door=neon] .pp-dl,.pp-door[data-door=neon] .pp-dr{background:repeating-linear-gradient(0deg,#1a1430 0 14px,#2a2050 14px 18px),#1a1430;border-color:#ff3fd2;box-shadow:0 0 22px #ff3fd2,inset 0 0 18px #3ff0ff}\
.pp-door[data-door=school] .pp-dl,.pp-door[data-door=school] .pp-dr{background:repeating-linear-gradient(90deg,rgba(0,0,0,.25) 0 2px,transparent 2px 30px),linear-gradient(180deg,#a8321e,#7a2214);border-color:#ffd23f}\
.pp-door[data-door=candy] .pp-dl,.pp-door[data-door=candy] .pp-dr{background:repeating-linear-gradient(135deg,#ff3b7a 0 14px,#fff4f8 14px 28px);border-color:#7a4422}\
.pp-door[data-door=iceage] .pp-dl,.pp-door[data-door=iceage] .pp-dr{background:repeating-linear-gradient(170deg,rgba(255,255,255,.35) 0 3px,transparent 3px 26px),linear-gradient(180deg,#dcf4fa,#6fb6d0);border-color:#d9c9a6}\
.pp-tabs u{display:inline-block;width:7px;height:7px;border-radius:50%;background:#ff5a4e;margin-left:5px;vertical-align:2px;box-shadow:0 0 0 2px rgba(0,0,0,.35)}.pp-tabs .on u{display:none}\
/* THE DAILY TAB: a month to a page, the page ruled like a wall calendar, the days tear-off sheets on the trail */\
.pp-cmon{background:linear-gradient(180deg,var(--c1),var(--c2));overflow:hidden}.pp-cmon:after{content:"";position:absolute;inset:0;opacity:.13;background-image:linear-gradient(90deg,#fff 1px,transparent 1px),linear-gradient(#fff 1px,transparent 1px);background-size:48.6px 48.6px;pointer-events:none}\
.pp-cpage{position:absolute;z-index:1;left:50%;transform:translateX(-50%);width:240px;padding:16px 12px 10px;text-align:center;background:#fbf7ee;color:#1d1a16;border-radius:10px;border-top:14px solid var(--ca);box-shadow:0 8px 18px rgba(0,0,0,.4)}.pp-cpage .rings{position:absolute;top:-22px;left:32px;right:32px;height:14px;background:radial-gradient(circle at 7px 7px,#cfd3da 4px,#5b6270 5px,transparent 6px) 0 0/34px 14px repeat-x}\
.pp-cpage b{display:block;font-family:var(--display,inherit);font-size:30px;line-height:1;letter-spacing:.02em;text-transform:uppercase}.pp-cpage span{display:block;margin-top:4px;font-size:11.5px;font-weight:800;color:#6c6457;letter-spacing:.04em}\
.pp-calw .pp-path .walk{stroke:#F1D04A;stroke-dasharray:none;stroke-width:5;opacity:.9}\
.pp-cday{position:absolute;z-index:1;transform:translate(-50%,-50%);width:58px;padding:0 0 4px;border:0;border-radius:9px;background:#fbf7ee;color:#1d1a16;font:inherit;cursor:pointer;text-align:center;box-shadow:0 5px 0 #c9bfae,0 9px 14px rgba(0,0,0,.4);overflow:visible}\
.pp-cday i{display:block;font-style:normal;font-size:10px;font-weight:900;letter-spacing:.12em;color:#fff;background:var(--ca);border-radius:9px 9px 0 0;padding:3px 0 2px}.pp-cday b{display:block;font-family:var(--display,inherit);font-size:27px;line-height:1.05;padding-top:2px}\
.pp-cday .sc{display:inline-block;margin-top:1px;padding:1px 6px;border-radius:999px;font-size:10.5px;font-weight:900;background:#e8e1d2;color:#4b443a}.pp-cday .sc.u{background:#1f9d55;color:#fff}.pp-cday .sc.e{background:#2b6cb0;color:#fff}.pp-cday .sc.o{background:#b9452f;color:#fff}.pp-cday .sc.now{background:#F1D04A;color:#10241a}\
.pp-cday.lock{filter:saturate(.35) brightness(.78)}.pp-cday.lock s{position:absolute;right:-6px;top:-8px;text-decoration:none;font-size:13px}.pp-cday.open .sc.ms{background:#3a1f63;color:#ffd45e}\
.pp-cday.cur{width:68px;box-shadow:0 0 0 3px #F1D04A,0 5px 0 #c9bfae,0 0 26px rgba(241,208,74,.75);animation:ppcal 1.6s ease-in-out infinite}.pp-cday.cur b{font-size:32px}@keyframes ppcal{50%{box-shadow:0 0 0 3px #F1D04A,0 5px 0 #c9bfae,0 0 8px rgba(241,208,74,.3)}}\
.pp-cday.done:after{content:"✓";position:absolute;right:-7px;top:-8px;width:18px;height:18px;border-radius:50%;background:#1f9d55;color:#fff;font-size:11px;font-weight:900;line-height:18px;box-shadow:0 2px 4px rgba(0,0,0,.4)}\
@media (prefers-reduced-motion:reduce){.pp-cday.cur{animation:none}}\
.pp-hub[data-wt] .pp-cpill,.pp-hub[data-wt] .pp-cx{background:var(--wt)}.pp-hub[data-wt] .pp-av{border-color:var(--wa)}'
/* THE CLUBHOUSE GLASS SKIN (the owner's pick, 2026-10-17: direction A, with every button its own colour and an icon drawn
   for what it does). One layer over the styles above, so no control changes what it does. Panels are smoked green glass
   with a brass edge, so the scenery shows through. There are three kinds of button: the gold primary with a pressed
   edge, the glass secondary, and the icon button. An icon button carries a chip in its own colour with its own icon
   (ICO, ICOL): the map is parchment, the bag is leather, the closet is plum, reset is amber, the overview is sky,
   talking is teal and lives are ruby. Every button presses down, shows a focus ring, and is at least 40 px across. */
var ICO = {
  close:'<path d="M7 7l10 10M17 7L7 17" stroke="#fff8e6" stroke-width="3" stroke-linecap="round"/>',
  map:'<path d="M3 6l5-2 8 2 5-2v14l-5 2-8-2-5 2z" fill="#fff2d0" stroke="#5a3a12" stroke-width="1.6" stroke-linejoin="round"/><path d="M8 4v14M16 6v14" stroke="#5a3a12" stroke-width="1.3"/><path d="M12 7c-1.7 0-3 1.3-3 2.9 0 2.2 3 5.1 3 5.1s3-2.9 3-5.1C15 8.3 13.7 7 12 7z" fill="#e5483a" stroke="#7a1a10" stroke-width="1"/><circle cx="12" cy="9.9" r="1" fill="#fff"/>',
  bag:'<path d="M9.5 9V3.5M12 9V2.5M14.5 9V4" stroke="#dfe4ea" stroke-width="1.6" stroke-linecap="round"/><path d="M8.3 3.6h2.4M10.8 2.5h2.6M13.4 4h2.4" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round"/><rect x="7" y="8.5" width="10" height="13" rx="3" fill="#7a4416" stroke="#2e1606" stroke-width="1.3"/><path d="M7 12.5h10M7 18h10" stroke="#f2c46a" stroke-width="1.5"/><path d="M17 10c2.4 1.4 2.4 6.6 0 8" fill="none" stroke="#2e1606" stroke-width="1.4"/>',
  closet:'<path d="M12 6V5a1.6 1.6 0 1 1 1.6-1.6" fill="none" stroke="#fff8e6" stroke-width="1.6" stroke-linecap="round"/><path d="M12 6L3 10.5h18z" fill="none" stroke="#fff8e6" stroke-width="1.6" stroke-linejoin="round"/><path d="M8 10.5L4.5 13l1.8 2.4 1.7-1V21h8v-6.6l1.7 1 1.8-2.4-3.5-2.5-1.8 1a2.6 2.6 0 0 1-4.4 0z" fill="#f6d8ff" stroke="#4a1a6a" stroke-width="1.2" stroke-linejoin="round"/>',
  reset:'<path d="M5.5 10a7.5 7.5 0 1 1 .9 6.5" fill="none" stroke="#fff8e6" stroke-width="2.4" stroke-linecap="round"/><path d="M3.5 4.8v5.4h5.4" fill="none" stroke="#fff8e6" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12.6" cy="12.6" r="3.4" fill="#ffffff" stroke="#8a4a0e" stroke-width="1.1"/><circle cx="11.6" cy="11.8" r=".65" fill="#b9c0c8"/><circle cx="13.6" cy="13.4" r=".65" fill="#b9c0c8"/><circle cx="13.4" cy="11.4" r=".55" fill="#b9c0c8"/>',
  view:'<path d="M3.5 8.5V3.5h5M15.5 3.5h5v5M20.5 15.5v5h-5M8.5 20.5h-5v-5" fill="none" stroke="#fff8e6" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><ellipse cx="12" cy="16.4" rx="4" ry="1.4" fill="#1f7a3e"/><path d="M11 16.4V7.5" stroke="#fff8e6" stroke-width="1.6"/><path d="M11 7.5l5 1.9-5 1.9z" fill="#ff5a4a"/>',
  left:'<path d="M14.5 5.5L8 12l6.5 6.5" fill="none" stroke="#fff8e6" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
  right:'<path d="M9.5 5.5L16 12l-6.5 6.5" fill="none" stroke="#fff8e6" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
  flag:'<ellipse cx="12" cy="19.5" rx="7.5" ry="2.4" fill="#2f8a4a" stroke="#14401f" stroke-width="1"/><ellipse cx="12" cy="19.5" rx="2" ry=".8" fill="#0d2a16"/><path d="M12 19.5V3.5" stroke="#3a2a14" stroke-width="1.8" stroke-linecap="round"/><path d="M12 3.5l7.5 2.8L12 9.1z" fill="#e5483a" stroke="#7a1a10" stroke-width=".9" stroke-linejoin="round"/>',
  talk:'<path d="M4 4.5h16a1.5 1.5 0 0 1 1.5 1.5v8.5A1.5 1.5 0 0 1 20 16h-9l-5 4v-4H4a1.5 1.5 0 0 1-1.5-1.5V6A1.5 1.5 0 0 1 4 4.5z" fill="#fff8e6"/><circle cx="8" cy="10.3" r="1.3" fill="#1f7a6e"/><circle cx="12" cy="10.3" r="1.3" fill="#1f7a6e"/><circle cx="16" cy="10.3" r="1.3" fill="#1f7a6e"/>',
  heart:'<path d="M12 20.5s-8.5-5.2-8.5-11A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8.5 2.5c0 5.8-8.5 11-8.5 11z" fill="#ff5a6a" stroke="#6a0c18" stroke-width="1.3"/><path d="M7.4 9.6a2.2 2.2 0 0 1 2.1-2" stroke="#ffd6dc" stroke-width="1.5" fill="none" stroke-linecap="round"/>',
  share:'<path d="M12 3.5v11M7.5 8L12 3.5 16.5 8" fill="none" stroke="#fff8e6" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.5 11.5v8h13v-8" fill="none" stroke="#fff8e6" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  play:'<path d="M8 5l11 7-11 7z" fill="#2a1c05"/>',
  daily:'<rect x="3.5" y="5" width="17" height="15.5" rx="2.2" fill="#fff8e6"/><path d="M3.5 7.2A2.2 2.2 0 0 1 5.7 5h12.6a2.2 2.2 0 0 1 2.2 2.2V9.5h-17z" fill="#e2463f"/><path d="M8 3.2v3.6M16 3.2v3.6" stroke="#fff8e6" stroke-width="2" stroke-linecap="round"/><ellipse cx="11" cy="18.4" rx="3.6" ry="1.1" fill="#2f8a4a"/><path d="M11 18.4V11.4" stroke="#3a2a14" stroke-width="1.4" stroke-linecap="round"/><path d="M11.5 11.4l4.4 1.6-4.4 1.6z" fill="#e2463f"/>',
  walk:'<ellipse cx="8.5" cy="8.5" rx="2.7" ry="4.2" fill="#fff8e6" transform="rotate(-12 8.5 8.5)"/><ellipse cx="8" cy="15" rx="1.9" ry="1.5" fill="#fff8e6"/><ellipse cx="15.5" cy="11" rx="2.7" ry="4.2" fill="#fff8e6" transform="rotate(12 15.5 11)"/><ellipse cx="16.2" cy="17.5" rx="1.9" ry="1.5" fill="#fff8e6"/>' };
// each icon chip's colour, top and bottom of its gradient and the dark edge under it
var ICOL = { map:['#f6dea6','#cf9a3e','#7a5212'], bag:['#d0945a','#7e4718','#3e1f06'], closet:['#bd8aea','#6c3aa0','#3a1660'],
  reset:['#ffbe5c','#e06a16','#7a3204'], daily:['#7fe0ff','#2a9ad6','#0e4a70'], view:['#78c8ff','#2a76cc','#123c6e'], talk:['#56d8c0','#1d8c7a','#0c4a40'],
  heart:['#ff8a98','#c42a42','#5e0c18'], share:['#56d8c0','#1d8c7a','#0c4a40'], walk:['#8ad66a','#2f8a3e','#14401c'],
  close:null, left:null, right:null, flag:null, play:null };
function icoUrl(n){ return 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' + ICO[n] + '</svg>') + '")'; }
function skinCss(){
  // a chip in the icon's colour (or bare, for the glass icons), drawn as the button's ::before
  function chip(sel, n, sz){ var c = ICOL[n], s = sz || 30;
    return sel + '::before{content:"";flex:none;width:' + s + 'px;height:' + s + 'px;border-radius:' + Math.round(s * 0.32) + 'px;background:' + icoUrl(n) + ' center/' + Math.round(s * 0.66) + 'px no-repeat' +
      (c ? ',linear-gradient(' + c[0] + ',' + c[1] + ');box-shadow:inset 0 1px 0 rgba(255,255,255,.55),inset 0 -2px 0 rgba(0,0,0,.18),0 2px 0 ' + c[2] : '') + '}'; }
  var G = 'rgba(13,32,22,.74)', G2 = 'rgba(13,32,22,.56)', BR = 'rgba(226,190,104,.55)';
  var glass = 'background:' + G + ';border:1px solid ' + BR + ';-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);color:#f8efd6;box-shadow:0 2px 0 rgba(0,0,0,.32),0 6px 16px rgba(0,0,0,.18)';
  var ibtn = 'display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;font:800 13px/1 var(--display,system-ui,sans-serif);letter-spacing:.04em;text-transform:uppercase;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:transform .08s,box-shadow .08s;' + glass;
  var gold = 'background:linear-gradient(#ffe07a,#ebb02e);color:#2a1c05;border:0;box-shadow:0 3px 0 #a5700f,0 8px 18px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.75);font-family:var(--display,inherit);text-transform:uppercase;letter-spacing:.04em';
  var press = 'transform:translateY(2px);box-shadow:0 1px 0 rgba(0,0,0,.3)';
  return [
    // the three kinds of button, everywhere in Putt Putt
    '.pt-ov .pt-go{' + gold + ';border-radius:14px;padding:12px 18px;font-size:16px;font-weight:800}',
    '.pt-ov .pt-go:active{transform:translateY(2px);box-shadow:0 1px 0 #a5700f,inset 0 1px 0 rgba(255,255,255,.75)}',
    '.pt-ov .pt-bt{' + ibtn + ';border-radius:14px;padding:8px 14px}',
    '.pt-ov .pt-bt:active,.pt-ov .pp-bagb:active,.pt-ov .pp-cx:active,.pt-ov .pt-x:active,.pt-ov .pp-mapb:active,.pt-ov .pp-rb:active{' + press + '}',
    '.pt-ov .pt-bt.on{background:linear-gradient(#ffe07a,#ebb02e);color:#2a1c05;border-color:transparent}',
    '.pt-ov button:focus-visible{outline:3px solid #ffe07a;outline-offset:2px}',
    // a hidden thing stays hidden: these glass buttons set their own display, and that beat [hidden] (the Talk button
    // showed, empty and dead, on every trail with nobody to talk to)
    '.pt-ov [hidden]{display:none!important}',
    // the header over the map and the trail: glass pieces on a soft shade
    '.pt-ov .pp-hdr{background:linear-gradient(rgba(4,12,8,.55),rgba(4,12,8,0))}',
    '.pt-ov .pp-hearts{' + glass + ';border-radius:999px;padding:5px 8px;gap:2px;align-items:center}',
    '@media (max-width:430px){.pt-ov .pp-hdr{gap:6px;padding-left:10px;padding-right:10px}.pt-ov .pp-hdr .pp-h,.pt-ov .pp-hdr .pp-h svg{width:14px;height:14px}.pt-ov .pp-mapb{font-size:0;gap:0;padding:4px}.pt-ov .pp-hdr .pp-cpill{padding:5px 9px;font-size:13px}}',
    '.pt-ov .pp-cpill{' + glass + ';border-radius:999px;font-family:var(--display,inherit);letter-spacing:.02em}',
    '.pt-ov .pp-av{border-color:#e7c66c;box-shadow:0 2px 0 rgba(0,0,0,.35)}',
    '.pt-ov .pp-cx,.pt-ov .pt-x{width:44px;height:44px;border-radius:50%;' + glass + ';font-size:0;padding:0;display:grid;place-items:center;cursor:pointer}',
    chip('.pt-ov .pp-cx,.pt-ov .pt-x', 'close', 26),
    '.pt-ov .pp-x2{display:inline-flex;align-items:center;gap:6px;background:linear-gradient(#ff8a98,#c42a42);color:#fff;box-shadow:0 2px 0 #5e0c18,inset 0 1px 0 rgba(255,255,255,.45);font-family:var(--display,inherit);letter-spacing:.04em;text-transform:uppercase;padding:6px 11px}',
    // the map button: parchment, its own map
    '.pt-ov .pp-mapb{' + ibtn + ';height:auto;border-radius:16px;padding:4px 14px 4px 5px}',
    '.pt-ov .pp-mapb svg{display:none}',
    chip('.pt-ov .pp-mapb', 'map', 34),
    // Bag and Closet stand down the right side, each its own colour and picture
    '.pt-ov .pp-bagb{' + ibtn + ';flex-direction:column;gap:3px;width:62px;min-height:62px;padding:6px 4px 5px;border-radius:18px;font-size:11px;right:12px}',
    '.pt-ov .pp-bagb.pp-closb{right:12px}',
    // the trail: the Daily Hole on top (the owner, 2026-10-19), then Bag, then Closet
    '.pt-ov .pp-wv>.pp-bagb{top:calc(env(safe-area-inset-top,0px) + 132px)}.pt-ov .pp-wv>.pp-bagb[data-bag]{top:calc(env(safe-area-inset-top,0px) + 202px)}.pt-ov .pp-wv>.pp-bagb.pp-closb{top:calc(env(safe-area-inset-top,0px) + 272px)}',
    '.pt-ov .pp-hub>.pp-bagb{top:calc(env(safe-area-inset-top,0px) + 70px)}.pt-ov .pp-hub>.pp-bagb.pp-closb{top:calc(env(safe-area-inset-top,0px) + 140px)}',
    '.pt-ov .pp-hub:has(.pp-daily)>.pp-bagb{top:calc(env(safe-area-inset-top,0px) + 186px)}.pt-ov .pp-hub:has(.pp-daily)>.pp-bagb.pp-closb{top:calc(env(safe-area-inset-top,0px) + 256px)}',
    chip('.pt-ov .pp-bagb[data-bag]', 'bag', 34), chip('.pt-ov .pp-bagb.pp-closb', 'closet', 34), chip('.pt-ov .pp-bagb[data-dly]', 'daily', 34),
    // the trail: what you are walking to is a glass plate, what is on it sits in glass chips
    '.pt-ov .pp-tgoal{' + glass + ';border-radius:16px;padding:6px 14px}',
    '.pt-ov .pp-tgoal i{color:#e7c66c}.pt-ov .pp-tgoal b{font-family:var(--display,inherit);font-size:17px;font-weight:800;letter-spacing:.02em;text-transform:uppercase}',
    '.pt-ov .pp-wv .pp-thud{top:calc(env(safe-area-inset-top,0px) + 124px)}.pt-ov .pp-tlist{top:calc(env(safe-area-inset-top,0px) + 166px)}',
    '.pt-ov .pp-thud span{' + glass + ';border-radius:999px;padding:4px 11px;font-family:var(--display,inherit);font-size:14px;letter-spacing:.02em}',
    '.pt-ov .pp-tlist span{' + glass + ';border-radius:12px;padding:4px 10px 4px 6px}',
    '.pt-ov .pp-tlist b{color:#e7c66c}',
    '.pt-ov .pp-rb{' + ibtn + ';border-radius:16px;padding:6px 14px 6px 6px;font-size:14px}',
    '.pt-ov .pp-rb[data-skip]{' + gold + ';padding:6px 16px 6px 6px;font-size:16px;font-weight:800;min-height:48px}',
    chip('.pt-ov .pp-rb[data-skip]', 'flag', 36),
    '.pt-ov .pp-rb[data-skip]::before{background-color:rgba(255,255,255,.45);border-radius:12px}',
    '.pt-ov .pp-talkb{background:' + G + '!important}', chip('.pt-ov .pp-talkb', 'talk', 32),
    // a phone is narrow for the hub header: the Home and Close buttons stay on the screen (the owner, 2026-10-19)
    '@media (max-width:430px){.pt-ov .pp-hdr{gap:3px;padding-left:6px;padding-right:6px}.pt-ov .pp-x2{padding:4px 6px;font-size:11px;gap:3px}.pt-ov .pp-av{width:34px;height:34px}.pt-ov .pp-home,.pt-ov .pp-cx{width:30px;height:30px}}@media (max-width:380px){.pt-ov .pp-hdr{padding-right:4px}.pt-ov .pp-hdr .pp-cpill{padding:5px 6px}.pt-ov .pp-x2{padding:4px 4px}}',
    '.pt-ov .pp-stick{border-color:rgba(248,239,214,.6);background:rgba(13,32,22,.35)}',
    '.pt-ov .pp-stick i{border-color:#2a1c05;background:radial-gradient(circle at 38% 34%,#fff6d6,#ffe07a 55%,#c98e14)}',
    '.pt-ov .pp-rhint{' + glass + ';border-radius:999px}',
    // the map: the Daily card, the world chip and the tour tabs on the same glass
    '.pt-ov .pp-wchip{' + glass + ';border-radius:999px}',
    '.pt-ov .pp-tabs{' + glass + ';border-radius:16px;padding:4px}',
    '.pt-ov .pp-tabs button{border-radius:12px;min-height:38px;color:#f8efd6}',
    '.pt-ov .pp-tabs button.on{background:linear-gradient(#ffe07a,#ebb02e);color:#2a1c05;box-shadow:0 2px 0 #a5700f}',
    // a hole: a slim glass bar on top, a dock at the foot, the read and the star goals as chips over the green
    '.pt-ov .pt-top{background:linear-gradient(#0d2016,#0a1a12);border-bottom:1px solid ' + BR + '}',
    '.pt-ov .pt-top.pp-play{background:linear-gradient(#0d2016,#0a1a12);border-bottom-color:' + BR + '}',
    '.pt-ov .pp-play .pt-hd b{font-family:var(--display,inherit);font-size:18px;letter-spacing:.02em;text-transform:uppercase;color:#f8efd6}',
    '.pt-ov .pp-play .pt-hd span{background:none;color:#e7c66c;padding:0;margin-top:1px;font-size:12px;font-weight:700;letter-spacing:.01em;border-radius:0}',
    '.pt-ov .pt-bar{background:linear-gradient(#0a1a12,#0d2016);border-top:1px solid ' + BR + ';gap:8px;padding-top:10px}',
    '.pt-ov .pt-bar .pt-bt{flex-direction:column;gap:3px;min-width:58px;min-height:58px;padding:5px 6px;border-radius:16px;font-size:10px}',
    '.pt-ov .pt-bar .pt-bt[data-l],.pt-ov .pt-bar .pt-bt[data-r]{font-size:0;min-width:52px}',
    chip('.pt-ov .pt-bt[data-restart]', 'reset', 32), chip('.pt-ov .pt-bt[data-ov]', 'view', 32),
    chip('.pt-ov .pt-bt[data-l]', 'left', 30), chip('.pt-ov .pt-bt[data-r]', 'right', 30),
    '.pt-ov .pt-bt[data-ov].on::before{box-shadow:0 0 0 2px #2a1c05}',
    '.pt-ov .pt-hint{text-align:center;color:#d8e6dc}',
    '.pt-ov .pt-read{' + glass + ';border-radius:14px;padding:6px 11px;color:#f8efd6;font-family:var(--display,inherit);font-size:17px;letter-spacing:.02em}',
    '.pt-ov .pt-read span{font-family:var(--body,inherit);color:#cfe0d8}',
    '.pt-ov .pt-stars{display:flex;gap:4px;padding:0;background:none;border:0;line-height:1}',
    '.pt-ov .pt-stars div{' + glass + ';border-radius:999px;padding:6px 9px;gap:5px;align-items:center;font-family:var(--display,inherit);font-size:15px}',
    '.pt-ov .pt-stars div:first-child{border-color:#ffe07a;box-shadow:0 0 0 1px rgba(255,224,122,.35) inset,0 2px 0 rgba(0,0,0,.32)}',
    '.pt-ov .pt-stars i{font-size:11px;letter-spacing:0;color:#ffd24a}.pt-ov .pt-stars span{display:none}',
    // sheets, results and pop ups: one glass card, gold edge on the title
    '.pt-ov .pp-card,.pt-ov .pt-pop{background:linear-gradient(170deg,rgba(18,46,31,.94),rgba(8,24,16,.96));border:1px solid ' + BR + ';border-radius:22px;box-shadow:0 18px 50px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.08)}',
    '.pt-ov .pp-card .t,.pt-ov .pt-pop .t{font-family:var(--display,inherit);letter-spacing:.02em}',
    '.pt-ov .pp-sheet{background:rgba(3,10,7,.6);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px)}',
    '.pt-ov .pp-daily{border-width:1px!important;border-radius:20px;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}',
    '.pt-ov .pp-daily .g{' + gold + ';border-radius:14px}',
    '@media (min-width:900px){.pt-ov .pp-wv .pp-thud{top:136px}.pt-ov .pp-tlist{top:172px}.pt-ov .pp-cx,.pt-ov .pt-x{width:52px;height:52px}.pt-ov .pp-bagb{width:72px;min-height:72px;font-size:12px;right:28px}.pt-ov .pp-bagb.pp-closb{right:28px}' +
      '.pt-ov .pt-bar .pt-bt{min-width:66px;min-height:62px}.pt-ov .pp-rb[data-skip]{font-size:18px}}',
    '@media (prefers-reduced-motion:reduce){.pt-ov .pt-bt,.pt-ov .pt-go,.pt-ov .pp-bagb{transition:none}}'
  ].join('\n'); }


var S = null;   // the open game, or null
function el(html){ var d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
function load(){ try{ return JSON.parse(localStorage.getItem('bag_putt_v1')) || {}; }catch(e){ return {}; } }
function save(st){ try{ localStorage.setItem('bag_putt_v1', JSON.stringify(st)); }catch(e){} }
/* The game's day key is a NUMBER (20261005), Eastern; this module's is the ISO string. Read the game's
   so the daily turns over when the rest of the game does, and write it the way this file reads it. */
function today(){ try{ var k = String(hostOf().todayKey()); if (/^\d{8}$/.test(k)) return k.slice(0, 4) + '-' + k.slice(4, 6) + '-' + k.slice(6, 8); if (/^\d{4}-\d{2}-\d{2}$/.test(k)) return k; }catch(e){} return new Date().toISOString().slice(0, 10); }
function fmtPar(d){ return d === 0 ? 'E' : (d > 0 ? '+' + d : String(d)); }

// o.go 'daily': straight into today's Daily Hole (the First Tee's pin and the scorecard tile), with the menu behind it
function open(host, o){
  if (S) close();
  if (!document.getElementById('pt-css')){ var st = document.createElement('style'); st.id = 'pt-css'; st.textContent = CSS + '\n' + skinCss(); document.head.appendChild(st); }
  var ov = el('<div class="pt-ov" role="dialog" aria-modal="true" aria-label="Putt Putt Tour"></div>');
  document.body.appendChild(ov);
  S = { host:host || {}, ov:ov, prevOverflow:document.body.style.overflow };
  // the hearts in the header and the play bar open the Lives sheet, where lives are bought (the owner, 2026-10-17)
  ov.addEventListener('click', function(e){ var hs = e.target && e.target.closest && e.target.closest('.pp-hearts'); if (hs && ov.contains(hs)) livesSheet();
    // Home, on every screen of Putt Putt: out to the First Tee home (the owner, 2026-10-19: there was no way back)
    if (e.target && e.target.closest && e.target.closest('[data-home]') && ov.contains(e.target.closest('[data-home]'))) goHome(); });
  document.body.style.overflow = 'hidden';
  // the page behind is covered: it stops painting and animating while Putt Putt is open (CSS: body.pt-open)
  document.body.classList.add('pt-open');
  // this tab has Putt Putt open: a reload (iOS drops a tab that grows too big) comes straight back in (index.html puttReopen)
  try{ sessionStorage.setItem('ppt_open', '1'); }catch(e){}
  S.onKey = function(e){ onKey(e); }; window.addEventListener('keydown', S.onKey);
  // GET TOUR PASS, from any sheet: the page's own Tour Pass, with Putt Putt closed behind it
  ov.addEventListener('click', function(e){ var b = e.target.closest && e.target.closest('[data-pass]'); if (!b) return; var h = S && S.host; if (h && h.pass){ close(); try{ h.pass(); }catch(x){} } });
  syncPutters();
  if (o && o.go === 'daily'){ showMenu(); startDaily(); }
  // a door that names its tour (the First Tee's "Into the world", which shows the main tour's place) opens that tour's frontier
  else if (o && o.tour && worldOk(o.tour)) home(o.tour);
  else if (!resumeCur()) showMenu();
  // the account's record may be ahead of this browser's: redraw the map if the merge moved anything
  cloudPull().then(function(moved){ if (moved) syncPutters(); if (moved) pulled(); });
}
/* THE ACCOUNT'S RECORD LANDS AFTER THE FIRST SCREEN IS DRAWN. The game opens on the trail to this browser's
   frontier, and on a phone whose copy is behind the account's (a new browser, or Safari clearing a site not
   visited for a week) that is the trail to hole 1. Reported by a tester as progress reset to level 1: the
   record was on the server the whole time and the screen never looked again. So a pull that moved anything
   redraws the map, or walks the trail on to the new frontier, unless a hole or a sheet is up. */
function pulled(){
  if (!S || S.ov.querySelector('.pp-sheet')) return;
  if (S.screen === 'menu') return showHub(S.tour);
  if (S.screen !== 'trail' || !S.trailTo || !S.trailTo.home) return;   // a trail walked on purpose from the map is left alone
  var st = pload();
  if (st.cur && resumeCur()) return;   // a hole in progress on another device
  var t = S.trailTo.tid, TR = tourOf(t), n = Math.min(TR.levels.length, frontier(st.tours[TR.id], TR));
  if (n !== S.trailTo.to) home(t);
}
// Home: close Putt Putt and go to the First Tee home. A hole in progress is saved, so it waits for the next visit.
function homeBtn(){ return '<button class="pp-home" data-home title="Home" aria-label="Home"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M3 11.2L12 4l9 7.2V20h-6.5v-5.5h-5V20H3z" fill="#fff8e6"/></svg></button>'; }
function goHome(){ if (!S) return; var h = S.host; close(); try{ if (h.goHome) h.goHome(); }catch(e){} }
function close(){
  if (!S) return;
  stopTrail();
  cancelAnimationFrame(S.raf); clearInterval(S.tick); window.removeEventListener('keydown', S.onKey); if (S.onResize) window.removeEventListener('resize', S.onResize);
  document.body.style.overflow = S.prevOverflow || ''; document.body.classList.remove('pt-open'); try{ sessionStorage.removeItem('ppt_open'); }catch(e){} S.ov.remove();
  var h = S.host; S = null; try{ if (h.onClose) h.onClose(); }catch(e){}
}
function top(title, sub, right){
  return '<div class="pt-top"><button class="pt-x" data-x>' + (S.screen === 'menu' ? 'Close' : 'Back') + '</button><div class="pt-hd"><b>' + esc(title) + '</b><span>' + esc(sub) + '</span></div><div class="pt-sc">' + (right || '') + '</div>' + homeBtn() + '</div>';
}

/* ============================================================================ THE TOUR, PLAYED */
/* The mode opens on the Tour map with the Daily Hole on top. The rules, in full:
     par or better  the hole is cleared and the next one in the world opens (coins the first time only).
                    It earns stars: 1 for par, 2 under par, 3 for two under (an ace on a par 3), best kept.
     a new world    opens at a running total: 40 stars a world (20 on the Members Tour), counted across
                    every world so far, so 80 opens world 3 however they are spread. See worldGate.
     over par       a life goes and the hole restarts. It is decided the moment par strokes are used
                 with the ball still out, so nobody putts out a hole that is already lost.
   Quitting after the first putt costs a life too. The Daily Hole never costs one.
   9 lives, three hearts of three (18, six hearts, with a Tour Pass). Every life comes back 24 hours after it
   was lost, each on its own clock (the owner's call, 2026-10-15). st.back holds when each lost life returns.

   WHAT IS KEPT WHERE: a signed in player's record is on ps_saves and their lives on putt_lives (138),
   on the server's clock. A guest's are in this browser. The Daily Hole board is not built yet. */
/* WHAT THE TOURS PAY. The Putt Putt Tour pays 4,000 coins a world, every ace included: 80 a hole and 280
   for the signature hole the first time it is beaten, 20 for a first ace, 2,000 for finishing a world. That
   was 20,000 for the first five worlds, and each world added since pays the same 4,000. The Members Tour pays the most on the site for the fewest
   holes, plus rewards nobody else can earn. No coin price anywhere changes. */
var PAY = {
  main:{ hole:80, sig:280, ace:20, world:2000,
    sigReward:['Clubhouse Visor', 'Hall Monitor Cap', 'Lollipop Putter', 'Neon Putter', 'Tricorn Hat', 'Jade Idol Putter', 'Miner’s Lamp Cap', 'Lava Ball', 'Cloud Ball', 'Dino Egg Ball', 'Mammoth Tusk Putter'],
    worldReward:['Clubhouse Cleats', 'Gold Star Ball', 'Sprinkle Ball', 'Pixel Shades', 'Pirate Eyepatch', 'Explorer Hat', 'Gold Nugget Ball', 'Lava Rock Cleats', 'Aviator Goggles', 'Dino Claw Cleats', 'Snow Goggles'] },
  members:{ hole:300, sig:1200, ace:60, world:2500, exclusive:true,
    sigReward:['Hallows Crown (Members only)', 'Harvest Moon Putter (Members only)'],
    worldReward:['Phantom Mask (Members only)', 'Golden Leaf Ball (Members only)'], finish:'Members Champion Jacket (Members only)',
    /* TRICK OR TREAT, the Hallows Night bonus: the first time a Hallows hole is beaten UNDER par it hands out a
       treat (coins on top of the hole's own), and all nine fill the candy bag for a reward nobody else has.
       Under par and not just par, so the treat is for playing a hole well rather than for getting round it. */
    treat:{ w:0, each:150, all:600, reward:'Hallows Lantern Ball (Members only)' } },
  lab:{ hole:0, sig:0, ace:0, world:0, sigReward:[], worldReward:[] },
  // a secret hole pays like a signature hole the first time it is beaten; ten of them beaten wins the Diamond Putter and a bonus
  secret:{ hole:280, sig:280, ace:20, world:0, sigReward:[], worldReward:[], ten:10, all:1000, allReward:'Diamond Putter' }
};
var COIN_HOLE = PAY.main.hole, COIN_SIG = PAY.main.sig, COIN_ACE = PAY.main.ace, COIN_WORLD = PAY.main.world, COIN_DAILY = 40, COIN_DAILY_PAR = 40;
var LIFE_MS = 24 * 3600 * 1000;
/* LIVES FOR SALE, the owner's calls: nine for $4.99 (2026-10-16) and three for $2.99 (2026-10-17), bought at any time
   and over the max if the player wants (2026-10-17). They are offered on the Out of Lives sheet, on the Over par card
   every time a life goes, and on the Lives sheet the hearts open. The server sells them
   (functions/api/stripe/_bundles.js PUTT_LIVES) and the webhook hands them over on the server's own row: lives on a
   clock come back first, the rest are extra lives over the max (151_putt_lives_extra.sql), spent before a heart. This
   page only shows the buttons and asks for lives again. The switch, the packs, their prices and the cap are the
   server's, copied, in the order the buttons show (nine first): scripts/stripe/check-putt-lives.mjs holds them together. */
var PUTT_LIVES_ENABLED = true;
var LIVES_BUY = [
  { pack:'nine', lives:9, cents:499, tag:'Best value.' },
  { pack:'three', lives:3, cents:299, tag:'' }
];
var LIVES_EXTRA_MAX = 99;
function buyLabel(p){ return 'Get ' + p.lives + ' lives · $' + (p.cents / 100).toFixed(2); }
var ACE_REWARD = { 5:'Hole in One Charm', 15:'Golden Putter', 30:'Ace Crown' };
var STREAK_REWARD = { 7:'Week Streak Ball', 30:'Month Streak Visor', 100:'Century Streak Trail' };
/* EVERY TOUR REWARD IS A CLOSET ITEM (the owner's call, 2026-10-16). Each name a tour pays is one item in the page's
   closet, worn on the Pro Tour, the First Tee and here. The item is keyed the way the page keys what a player owns
   (its cosKey, cat:id: hw headwear, ew eyewear, bl ball, ct cleats, pu putter, tp outerwear), and the page prices each
   one 0, so it is never sold and never in a pack. A name is matched without its ' (Members only)'.
   REWARD_OLD is what a saved record may still carry from before the trails and celebrations became items (and the
   curly Jack-o'-Lantern): an old name reads as its new one, so a record never has to be rewritten. */
var REWARD_ITEM = {
  'Clubhouse Visor':'hw:ppvisor', 'Hall Monitor Cap':'hw:pphallcap', 'Lollipop Putter':'pu:pplollipop', 'Neon Putter':'pu:ppneon',
  'Tricorn Hat':'hw:pptricorn', 'Jade Idol Putter':'pu:ppjadeidol', 'Miner’s Lamp Cap':'hw:ppminer', 'Lava Ball':'bl:pplava',
  'Cloud Ball':'bl:ppcloud', 'Dino Egg Ball':'bl:ppdinoegg', 'Mammoth Tusk Putter':'pu:pptusk',
  'Clubhouse Cleats':'ct:ppclubhouse', 'Gold Star Ball':'bl:ppgoldstar', 'Sprinkle Ball':'bl:ppsprinkle', 'Pixel Shades':'ew:pppixelshades',
  'Pirate Eyepatch':'ew:ppeyepatch', 'Explorer Hat':'hw:ppexplorer', 'Gold Nugget Ball':'bl:ppnugget', 'Lava Rock Cleats':'ct:pplavarock',
  'Aviator Goggles':'ew:ppaviatorgoggles', 'Dino Claw Cleats':'ct:ppdinoclaw', 'Snow Goggles':'ew:ppsnowgoggles',
  'Hallows Crown':'hw:pphallowscrown', 'Harvest Moon Putter':'pu:ppharvest', 'Phantom Mask':'ew:ppphantommask', 'Golden Leaf Ball':'bl:ppgoldleaf',
  'Members Champion Jacket':'tp:ppchampjacket', 'Hallows Lantern Ball':'bl:pphallowslantern', 'Diamond Putter':'pu:ppdiamond' };
var REWARD_OLD = { 'Clubhouse Polo':'Clubhouse Cleats', 'Sprinkle Trail':'Sprinkle Ball', 'High Score Celebration':'Pixel Shades',
  'Treasure Trail':'Pirate Eyepatch', 'Eruption Celebration':'Lava Rock Cleats', 'Rainbow Trail':'Aviator Goggles', 'Footprint Trail':'Dino Claw Cleats',
  'Thaw Celebration':'Snow Goggles', 'Phantom Trail':'Phantom Mask', 'Jack-o’-Lantern Ball':'Hallows Lantern Ball', 'Jack-o-Lantern Ball':'Hallows Lantern Ball' };
function rewardName(r){ var b = String(r || '').replace(' (Members only)', ''); return REWARD_OLD[b] || b; }
/* WHAT PAYS EACH ONE: a world's two names pay when its signature hole is beaten (which clears the world), the
   Members Tour's finish when its last world is cleared, the candy bag when every hole of its world has had its
   treat, and the Diamond Putter at PAY.secret.ten secret holes beaten. Read off PAY, so a reward moved there moves here. */
var REWARD_SRC = null;
function rewardSrc(){ if (REWARD_SRC) return REWARD_SRC; var o = {};
  ['main', 'members'].forEach(function(tid){ var PY = PAY[tid], TR = TOURS[tid];
    [PY.sigReward || [], PY.worldReward || []].forEach(function(L){ L.forEach(function(r, w){ o[rewardName(r)] = { tid:tid, w:w }; }); });
    if (PY.finish) o[rewardName(PY.finish)] = { tid:tid, w:TR.worlds.length - 1, fin:1 };
    if (PY.treat) o[rewardName(PY.treat.reward)] = { tid:tid, w:PY.treat.w, treat:1 }; });
  o[rewardName(PAY.secret.allReward)] = { secret:1 };
  return (REWARD_SRC = o); }
function sigHole(TR, w){ var K = TR.per || PER; for (var n = Math.min(TR.levels.length, w * K + K); n > w * K; n--) if (TR.levels[n - 1].sig) return n; return 0; }
// does this record hold the reward: the name is in its rewards, or what pays it has happened (a record from before
// the reward was paid, or from before it was an item, owns it all the same)
function rewardHeld(st, name){
  if ((st.rewards || []).some(function(r){ return rewardName(r) === name; })) return true;
  var s = rewardSrc()[name], tours = st.tours || {}; if (!s) return false;
  if (s.secret){ var pd = (tours.secret || {}).paid || {}; return Object.keys(pd).filter(function(k){ return pd[k]; }).length >= PAY.secret.ten; }
  var TR = TOURS[s.tid], tp = tours[s.tid] || {}, K = TR.per || PER;
  if (s.treat){ var tk = 0; for (var n = s.w * K + 1; n <= s.w * K + K; n++) if ((tp.treat || {})[n]) tk++; return tk >= K; }
  var sg = sigHole(TR, s.w), b = sg ? (tp.best || {})[sg] : null;
  return !!((tp.wpaid || {})[s.w] || (b != null && b <= TR.levels[sg - 1].par)); }
/* THE RECORD, READ ONLY. The page asks about ownership while it draws its closet, so this never writes, never folds and
   never runs the lives clock: it reads the account's record and the bare signed-out one (which pload would fold in) and
   answers for both. The answer is kept until either record changes. */
var RCACHE = { a:null, b:null, own:null, st:null };
function rewardRec(host){
  var key = host && host.storeKey ? host.storeKey('bag_ppt_v1') : pkey(), a = praw(key), b = null;
  if (key !== 'bag_ppt_v1'){ try{ b = localStorage.getItem('bag_ppt_v1'); }catch(e){} }
  if (RCACHE.own && a === RCACHE.a && b === RCACHE.b) return RCACHE;
  var recs = [a, b].map(function(r){ try{ return r ? JSON.parse(r) : null; }catch(e){ return null; } }).filter(function(r){ return r && typeof r === 'object'; });
  var own = {}; Object.keys(REWARD_ITEM).forEach(function(nm){ if (recs.some(function(st){ return rewardHeld(st, nm); })) own[nm] = 1; });
  var st0 = recs[0] || {}; RCACHE = { a:a, b:b, own:own, st:{ tours:st0.tours || {}, rv:st0.rv || [] } }; return RCACHE; }
function rewardKey(x){ x = rewardName(x); if (REWARD_ITEM[x]) return x; for (var nm in REWARD_ITEM) if (REWARD_ITEM[nm] === x) return nm; return null; }
// where to win it, in a few short words for the closet's locked tile. A world still in the clouds is not named.
function rewardHint(name, st){ var s = rewardSrc()[name]; if (!s) return '';
  if (s.secret) return 'Beat ' + PAY.secret.ten + ' secret holes in Putt Putt.';
  var TR = TOURS[s.tid], W = TR.worlds[s.w], K = TR.per || PER;
  if (s.treat) return 'Beat all ' + K + ' ' + W.name + ' holes under par in Putt Putt.';
  if (s.fin) return 'Finish the Members Tour in Putt Putt.';
  if (TR.members) return 'Clear ' + W.name + ' on the Members Tour in Putt Putt.';
  var seen = false; try{ seen = revealed(TR, s.w, st || { tours:{}, rv:[] }); }catch(e){}
  return seen ? 'Clear ' + W.name + ' in Putt Putt. Beat its signature hole, ' + TR.names[sigHole(TR, s.w) - 1] + '.' : 'Clear World ' + (s.w + 1) + ' in Putt Putt.'; }
var HOSTX = null;   // the host when the mode is closed, for the home screen card
function hostOf(){ return (S && S.host) || HOSTX || {}; }
function pkey(){ try{ var h = hostOf(); return h.storeKey ? h.storeKey('bag_ppt_v1') : 'bag_ppt_v1'; }catch(e){ return 'bag_ppt_v1'; } }
/* THE RECORD. Lives, the Daily Hole, the streak and the rewards are the account's; each tour keeps its
   own place, best scores, aces and what it has paid. A record from the 50 hole Tour keeps everything
   but its place on a ladder that no longer exists: those holes are gone, so it starts at hole 1. */
/* A RECORD SAVED SIGNED OUT IS CLAIMED BY THE ACCOUNT, never lost. The key is the account's once the page
   knows who is playing, and the bare key before that, so a session that opened before sign-in resolved
   (or while it had dropped) played under the bare key. A player reported reaching hole 18 and coming
   back to hole 1. So a signed-in load folds the bare key in: the furthest hole, the best score on every
   hole, every ace and every payout, and the bare key is cleared so it is folded once. */
function pmerge(st, g){
  Object.keys(g.tours || {}).forEach(function(k){ var a = st.tours[k] = st.tours[k] || {}, b = g.tours[k] || {};
    a.lv = Math.max(a.lv || 1, b.lv || 1); a.best = a.best || {};
    Object.keys(b.best || {}).forEach(function(n){ if (a.best[n] == null || b.best[n] < a.best[n]) a.best[n] = b.best[n]; });
    ['ace', 'paid', 'wpaid', 'treat'].forEach(function(f){ a[f] = a[f] || {}; Object.keys(b[f] || {}).forEach(function(n){ if (!a[f][n]) a[f][n] = b[f][n]; }); });
    a.tries = a.tries || {}; Object.keys(b.tries || {}).forEach(function(n){ a.tries[n] = Math.max(a.tries[n] || 0, b.tries[n] || 0); }); });
  st.daily = st.daily || {}; Object.keys(g.daily || {}).forEach(function(d){ if (!st.daily[d]) st.daily[d] = g.daily[d]; });
  // what was picked up on the trails between holes: only ever added to
  st.trail = st.trail || {}; Object.keys(g.trail || {}).forEach(function(k){ var a = st.trail[k] = st.trail[k] || {}, b = g.trail[k] || {};
    ['c', 'b', 'ch'].forEach(function(f){ if (b[f]){ a[f] = a[f] || []; b[f].forEach(function(v){ if (a[f].indexOf(v) < 0) a[f].push(v); }); } });
    ['k', 'g', 'key', 'life', 'tk', 'pt', 'pz'].forEach(function(f){ if (b[f]) a[f] = 1; }); });
  // the rare things: lists only grow, and the spare life counters only go up, so the larger is the newer
  ['bank', 'bfill', 'tk', 'met', 'rv', 'sf', 'gym'].forEach(function(f){ (g[f] || []).forEach(function(v){ st[f] = st[f] || []; if (st[f].indexOf(v) < 0) st[f].push(v); }); });
  ['bused', 'bspent'].forEach(function(f){ st[f] = Math.max(st[f] || 0, g[f] || 0); });
  if (g.pp){ st.pp = st.pp || { parts:[] }; st.pp.parts = st.pp.parts || []; (g.pp.parts || []).forEach(function(v){ if (st.pp.parts.indexOf(v) < 0) st.pp.parts.push(v); }); if (!st.pp.eq && g.pp.eq) st.pp.eq = g.pp.eq; }
  st.rewards = st.rewards || []; (g.rewards || []).forEach(function(r){ if (st.rewards.indexOf(r) < 0) st.rewards.push(r); });
  if (g.streak && (!st.streak || (g.streak.best || 0) > (st.streak.best || 0))) st.streak = Object.assign({}, st.streak || {}, { best:g.streak.best });
  return st; }
/* A BROWSER THAT WILL NOT SAVE MUST NOT LOSE THE SESSION. Every load reads the record afresh, so a setItem that
   throws (storage full, a private window, Safari having evicted the site) would hand back the old record on the
   next read and the hole just won would be gone. So every write is mirrored in memory, and a key the browser
   refused is read from the mirror for the rest of the page's life. The cloud copy is sent from the same read. */
var PMEM = {}, PBAD = {};
function praw(key){ key = key || pkey(); if (PBAD[key]) return PMEM[key] || null; try{ return localStorage.getItem(key); }catch(e){ return PMEM[key] || null; } }
function pwrite(st, key){ key = key || pkey(); var v = JSON.stringify(st); PMEM[key] = v; try{ localStorage.setItem(key, v); delete PBAD[key]; }catch(e){ PBAD[key] = 1; } }
function pload(){ var st = null, key = pkey(); try{ st = JSON.parse(praw(key)); }catch(e){} st = st || {};
  if (key !== 'bag_ppt_v1'){ var g = null; try{ g = JSON.parse(localStorage.getItem('bag_ppt_v1')); }catch(e){}
    if (g && g.v === 2 && g.tours){ if (st.v !== 2){ st = { v:2, tours:{} }; } pmerge(st, g); pwrite(st, key); if (!PBAD[key]) try{ localStorage.removeItem('bag_ppt_v1'); }catch(e){} } }
  if (st.v !== 2){ st.tours = {}; delete st.lv; delete st.best; delete st.ace; delete st.paid; delete st.wpaid; st.v = 2; }
  st.tours = st.tours || {}; Object.keys(TOURS).forEach(function(k){ var t = st.tours[k] = st.tours[k] || {}; t.lv = t.lv || 1; t.best = t.best || {}; t.ace = t.ace || {}; t.paid = t.paid || {}; t.wpaid = t.wpaid || {}; t.tries = t.tries || {}; t.lv = TOURS[k].lab ? TOURS[k].levels.length : frontier(t, TOURS[k]); });
  st.daily = st.daily || {}; st.rewards = st.rewards || []; st.streak = st.streak || { n:0, last:null, best:0 };
  lifeFix(st);
  return st; }
/* NINE LIVES, EACH ON ITS OWN CLOCK. A record from before (st.l9 unset) kept 3 or 6 lives and one clock that
   started at nought: each of its lives becomes a full heart of three, and the lives it had already lost come
   back on the old clock if one was running, else 24 hours from now. On this device (a guest, or before the
   server answers) a life whose time has come is back; once the server has answered (st.lsrv) only its
   answer moves them, so a wound clock refills nothing. */
function lifeFix(st){ var mx = livesMax(), now = Date.now(), dirty = false;
  if (!st.l9){ var l = st.lives == null ? mx : Math.min(mx, st.lives * 3), miss = Math.max(0, mx - l), at = st.refillAt || now + LIFE_MS;
    st.back = []; for (var i = 0; i < miss; i++) st.back.push(at); st.lives = l; st.l9 = 1; dirty = true; }
  st.back = (st.back || []).slice().sort(function(a, b){ return a - b; });
  // a life back on this device's clock is a change of lives, and stamped so; the move from an old record is not,
  // so a fresh browser's record never looks newer than the account's copy it is about to take
  var moved = false;
  if (!st.lsrv){ var keep = st.back.filter(function(t){ return t > now; }); if (keep.length !== st.back.length){ st.back = keep; moved = true; }
    var want = Math.max(0, mx - st.back.length); if (st.lives !== want){ st.lives = want; moved = true; } }
  st.refillAt = st.back.length ? st.back[0] : null;
  if (moved) st.lt = now;
  if (dirty || moved) pwrite(st); }
function psave(st){ pwrite(st); cloudPush(); }
/* THE RECORD IS THE ACCOUNT'S, ON THE SERVER. A signed in player's record goes up to ps_saves (103, game
   'putt', slot 'tour') after every save and comes down on every open and every sign in, so a cleared
   browser or a second phone starts where the account left off. The local copy is still written first
   and the game never waits on the network.
   TWO COPIES ARE MERGED, NEVER CHOSEN BETWEEN. pmerge only ever adds: the furthest hole, the best score
   on every hole, every ace and payout, every daily played. So a stale phone can never take a hole away,
   and a daily played on one device is played on all of them. Lives and the clock are the one part that
   goes down as well as up, so they come from whichever copy changed them last (st.lt, stamped only when
   lives move, so a fresh browser's first save never beats the account's lives), and the streak from the copy
   that played the later day.
   PROGRESS is the server's conflict rule (103 refuses a write that moves it backwards). It is a count of
   things the merge only adds, so a merged record is never behind either copy, and a refusal hands back
   the stored record, which is merged in and sent again.
   EVERY CALL FAILS SOFT. null from the server is no opinion; the local record stands. */
var CLOUD = { uid:null, busy:false, again:false, refused:0 };
function cloudUid(){ try{ var h = hostOf(); return h.rpc && h.uid ? h.uid() || null : null; }catch(e){ return null; } }
function cloudProg(st){ var n = 0, c = function(o){ return Object.keys(o || {}).length; };
  Object.keys(st.tours || {}).forEach(function(k){ var t = st.tours[k] || {}; n += (t.lv || 1) + c(t.best) + c(t.ace) + c(t.paid) + c(t.wpaid) + c(t.treat); });
  Object.keys(st.trail || {}).forEach(function(k){ var t = st.trail[k] || {}; n += (t.c || []).length + (t.b || []).length + (t.ch || []).length + (t.k ? 1 : 0) + (t.g ? 1 : 0) + (t.key ? 1 : 0) + (t.life ? 1 : 0) + (t.tk ? 1 : 0) + (t.pt ? 1 : 0) + (t.pz ? 1 : 0); });
  n += (st.bank || []).length + (st.bfill || []).length + (st.tk || []).length + (st.gym || []).length + (st.met || []).length + (st.rv || []).length + ((st.pp && st.pp.parts) || []).length + (st.bused || 0) + (st.bspent || 0);
  return n + c(st.daily) + (st.rewards || []).length; }
// fold a copy of the record into this one: everything earned is kept, lives come from the newer copy
function cloudMerge(st, g){ if (!g || g.v !== 2 || !g.tours) return st;
  if (!st.lsrv && (g.lt || 0) > (st.lt || 0)){ st.lives = g.lives; st.refillAt = g.refillAt || null; st.back = (g.back || []).slice(); st.l9 = g.l9 || 0; st.lt = g.lt; }
  if ((g.curT || 0) > (st.curT || 0)){ st.cur = g.cur || null; st.curT = g.curT; }
  if (g.streak && g.streak.last && (!st.streak || !st.streak.last || g.streak.last > st.streak.last)) st.streak = Object.assign({}, g.streak, { best:Math.max((st.streak && st.streak.best) || 0, g.streak.best || 0) });
  return pmerge(st, g); }
function cloudRow(d){ var r = Array.isArray(d) ? d[0] : d; return r && typeof r === 'object' ? r : null; }
function cloudPush(){ var uid = cloudUid(); if (!uid || CLOUD.uid !== uid) return;
  if (CLOUD.busy){ CLOUD.again = true; return; }
  var st = null; try{ st = JSON.parse(praw()); }catch(e){} if (!st || st.v !== 2) return;
  CLOUD.busy = true; CLOUD.again = false;
  var done = function(){ CLOUD.busy = false; if (CLOUD.again) cloudPush(); };
  var p = null; try{ p = hostOf().rpc('ps_save_put', { p_game:'putt', p_slot:'tour', p_payload:st, p_progress:cloudProg(st) }); }catch(e){ p = null; }
  if (!p || !p.then) return done();
  p.then(function(d){ var r = cloudRow(d);
    // refused: the server holds more than this copy. Merge it in, keep it, and send the merged record.
    // Bounded, so two copies that cannot agree on a count never send each other round for ever.
    if (r && r.ok === false && r.payload && cloudUid() === uid){ var cur = pload(); cloudMerge(cur, r.payload); pwrite(cur); if (++CLOUD.refused <= 3) CLOUD.again = true; }
    else if (r && r.ok !== false) CLOUD.refused = 0;
    done(); }, done); }
// bring the account's record down and merge it into this browser's, then send the merged one up
function cloudPull(){ var uid = cloudUid(); if (!uid) return Promise.resolve(false);
  var p = null; try{ p = hostOf().rpc('ps_save_get', { p_game:'putt', p_slot:'tour' }); }catch(e){ p = null; }
  if (!p || !p.then) return Promise.resolve(false);
  return p.then(function(d){ if (cloudUid() !== uid) return false;
    var r = cloudRow(d), cur = pload(), before = JSON.stringify(cur.tours) + cur.lives;
    if (r && r.payload) cloudMerge(cur, r.payload);
    pwrite(cur);
    CLOUD.uid = uid; cloudPush();
    return livesSync().then(function(){ var now = pload(); return before !== JSON.stringify(now.tours) + now.lives; }); }, function(){ return false; }); }
/* LIVES ARE THE SERVER'S, ON ITS CLOCK (138_putt_lives.sql). The Tour record above cannot hold them: its
   rule is progress, and lives go down. So a signed in player's lives come from putt_lives_state, a life is
   taken by putt_lives_spend, and the 24 hour clock is the server's now(). Once the server has answered for
   an account (st.lsrv) the device never refills on its own clock and a merged copy never moves them.
   The first answer seeds the row from the lives this browser had, so nobody is handed a fresh three.
   A database without 138 answers null, and the lives stay on the device as they were. */
function livesApply(uid, r){ r = cloudRow(r); if (!r || r.lives == null || cloudUid() !== uid) return false;
  var st = pload(), was = st.lives + '|' + st.refillAt;
  if (r.back_at === undefined){   // a database still on 138: three lives a heart, and its one clock fills them all
    var mx = livesMax(), l = Math.min(mx, +r.lives * 3), at = r.refill_at ? Date.parse(r.refill_at) : Date.now() + LIFE_MS;
    st.back = []; for (var i = l; i < mx; i++) st.back.push(at); st.lives = l; }
  else { st.back = (r.back_at || []).map(function(t){ return Date.parse(t); }).sort(function(a, b){ return a - b; }); st.lives = +r.lives; }
  st.l9 = 1; st.refillAt = st.back.length ? st.back[0] : null; st.lt = Date.now(); st.lsrv = true;
  pwrite(st);
  return was !== st.lives + '|' + st.refillAt; }
function livesCall(fn, extra){ var uid = cloudUid(); if (!uid) return Promise.resolve(false);
  var p = null; try{ p = hostOf().rpc(fn, Object.assign({ p_max:livesMax() }, extra || {})); }catch(e){ p = null; }
  if (!p || !p.then) return Promise.resolve(false);
  return p.then(function(d){ return livesApply(uid, d); }, function(){ return false; }); }
function livesSync(){ var st = pload(); return livesCall('putt_lives_state', { p_lives:st.lives }).then(function(ch){ return spareFill().then(function(f){ return ch || f; }); }); }
/* GUESTS (the owner, 2026-10-16): a guest walks the opening world, so they see what is here, and plays no hole of
   it. Walking up to a hole asks them to sign in. The Daily Hole stays open to them, and it posts to no board. A
   guest never sees a coin count: what they pick up is held for the account (the host's held coins) and the game
   says so. A host that cannot say who is signed in gates nobody. GUEST_WALK is how many holes of the main tour a
   guest may walk to (the opening world). */
// STORY MODE (the owner, 2026-10-18): everybody starts on hole 1 and opens the next only by beating the one before.
// A guest walks the trail to hole 1 and nothing past it. GUEST_WALK was 18 (the opening world, 2026-10-16).
// A GUEST PLAYS HOLE 1 (the owner, 2026-10-19): one real hole before the ask, so a new player putts once before
// being asked for an account. The ask moves to hole 2. GUEST_PLAY is how many holes of the main tour a guest may
// play; it never passes GUEST_WALK.
var GUEST_WALK = 1, GUEST_PLAY = 1;
function isGuest(){ try{ var h = hostOf(); return !!(h.signedIn && !h.signedIn()); }catch(e){ return false; } }
// a guest is asked to sign in before this hole of this tour (the Daily Hole and the lab never ask)
function guestAsks(tid, n){ return isGuest() && !(tid === 'main' && n <= GUEST_PLAY); }
var GUEST_COINS = 'Sign in to collect your coins and open packs.';
function guestSheet(n, tid){
  var walk = tid === 'main' && n && n < Math.min(GUEST_WALK, tourOf('main').levels.length);
  var sh = el('<div class="pp-sheet"><div class="pp-card"><div class="k">' + (n ? 'HOLE ' + n : 'PUTT PUTT TOUR') + '</div><div class="t">Sign in to play</div>\
    <div class="m">A free account plays every hole, keeps your stars and collects your coins. On every device.</div>\
    <button class="pt-go pp-wide" data-in>Sign in</button><button class="pt-go pp-wide" data-up>Create a free account</button>' +
    (walk ? '<button class="pt-bt pp-wide" data-walk>Keep walking</button>' : '') + '<button class="pt-bt pp-wide" data-n>Not now</button></div></div>');
  S.ov.appendChild(sh);
  var go = function(mode){ var h = S.host; close(); try{ if (h.signIn) h.signIn(mode); }catch(e){} };
  sh.querySelector('[data-in]').onclick = function(){ go('signin'); };
  sh.querySelector('[data-up]').onclick = function(){ go('signup'); };
  var wk = sh.querySelector('[data-walk]'); if (wk) wk.onclick = function(){ sh.remove(); walkTo(n, 'main'); };
  sh.querySelector('[data-n]').onclick = function(){ sh.remove(); if (S.screen === 'trail') showHub('main'); }; }
/* THE TOUR PASS DOUBLES YOUR LIVES. Every line that sells it reads these two numbers, so the copy is the game. */
var LIVES_FREE = 9, LIVES_PASS = 18;
function livesMax(){ try{ var h = hostOf(); return h.passActive && h.passActive() ? LIVES_PASS : LIVES_FREE; }catch(e){ return LIVES_FREE; } }
function passLivesLine(){ return 'A Tour Pass doubles your lives: ' + LIVES_PASS + ', not ' + LIVES_FREE + '.'; }
var PER_HEART = 3;
function loseLife(st){ if (lifeExtra(st) > 0){ st.bspent = (st.bspent || 0) + 1; psave(st); return; } if (st.lives == null) st.lives = livesMax(); if (st.lives <= 0) return;
  // a bought life over the max goes first and starts no clock; the server takes it out of its extras (151). The
  // hearts are still full after it, so no spare is wanted.
  if (st.lives > livesMax()){ st.lives--; st.lt = Date.now(); psave(st); livesCall('putt_lives_spend'); return; }
  st.lives--; st.back = (st.back || []).concat([Date.now() + LIFE_MS]); st.refillAt = st.back[0]; st.l9 = 1; st.lt = Date.now(); psave(st);
  // a spare that was waiting fills the gap straight away: on the server once it has the lost life, else here
  if (cloudUid()) livesCall('putt_lives_spend').then(function(){ spareFill(); }); else spareFill(); }
function coins(n, label, o){ try{ if (S.host.coins) S.host.coins(n, label, o); }catch(e){} var b = balStr(); if (b !== '' && S.ov) S.ov.querySelectorAll('[data-bal]').forEach(function(e){ e.textContent = b; }); }   // the wallet at the top moves the moment coins land
function hms(ms){ ms = Math.max(0, ms); var s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h + ':' + (m < 10 ? '0' : '') + m + ':' + (x < 10 ? '0' : '') + x; }
function hm(ms){ var m = Math.max(0, Math.round(ms / 60000)); return Math.floor(m / 60) + 'h ' + (m % 60) + 'm'; }
// how long until the game's day turns over (Eastern midnight), which is when the next Daily Hole arrives
function msToNextDay(){ try{ var now = new Date(), et = new Date(now.toLocaleString('en-US', { timeZone:'America/New_York' })), nx = new Date(et); nx.setHours(24, 0, 0, 0); return nx - et; }catch(e){ return 0; } }
function perOf(tid){ return tourOf(tid).per || PER; }
function wl(n, tid){ var k = perOf(tid); return (tourOf(tid).members ? 'M' : tourOf(tid).lab ? 'L' : '') + (Math.floor((n - 1) / k) + 1) + '-' + ((n - 1) % k + 1); }
function aceCount(st){ var n = 0; Object.keys(st.tours).forEach(function(k){ n += Object.keys(st.tours[k].ace).length; }); return n; }
// the Members Tour is the Tour Pass holder's. A tester can preview it, said so on the screen.
function membersOpen(){ try{ var h = hostOf(); return !!(h.passActive && h.passActive()); }catch(e){ return false; } }
/* EVERY HOLE OPEN, for the accounts the page names (PUTT_ALL_ACCESS in golf/index.html): every hole of every tour,
   every world out from under its cloud, the Members Tour to play (as a preview: the pass's other perks stay
   the pass's), and lives never stand in the way. It is asked, never
   written: the record's lv stays the hole the player has really reached, so the map's golfer, the walk home and the
   server copy all keep telling the truth, and taking an account off the list puts its gates straight back. */
function allAccess(){ try{ var h = hostOf(); return !!(h.allAccess && h.allAccess()); }catch(e){ return false; } }
function opened(TR, tp, n){ return allAccess() || n <= ((tp && tp.lv) || 1); }
function membersPreview(){ return !!(S && S.memPreview) || allAccess(); }
/* EVERYBODY CAN WALK HALLOWS NIGHT. The owner's call: the Members world is the best advert the pass has, so
   anybody may open its tab, walk its trail and look at its map. What is the pass's is PLAYING a hole: walk up
   to one (or tap it on the map) without the pass and the sheet says what it is, and that the Putt Putt Tour is
   theirs to play meanwhile. startLevel is that gate, so every way into a hole meets it. */
function membersCanPlay(){ return membersOpen() || membersPreview(); }
// the Lab is a tester's only: its tab is not drawn for anybody else
function labOpen(){ try{ var h = hostOf(); return !!(h.tester && h.tester()); }catch(e){ return false; } }
/* STARS. Par clears a hole, so most holes can simply be good to play, and birdies come from reading
   them well rather than from hunting a trapdoor. The gate is the owner's: 40 stars for every world, as a
   running total, so a player stuck on one world can earn the stars back in another. 54 a world would
   be an ace on every hole, which is partly luck, so it would be a wall. A perfect world is the chase.
   THREE STARS IS TWO UNDER PAR, which on a par 3 is the ace. It is never a score nobody can make:
   solve.mjs records a route for it on every hole (an ace, or the secret line on a longer hole) and
   check-putt replays them all, with the same room for error a birdie putt gets. */
/* THREE STARS IS TWO UNDER PAR, unless the hole says otherwise. A hole whose design cannot be aced fairly (two
   jumps in a row, a moat with a clock on it) carries three: its own target, a birdie, rather than a star nobody
   can earn. threeOf is the one answer: the stars, the result card and check-putt all ask it. */
function threeOf(par, three){ return three || Math.max(1, par - 2); }
function starsOf(s, par, three){ var t = threeOf(par, three); return s == null ? 0 : s <= t ? 3 : s < par ? 2 : s === par ? 1 : 0; }
/* What each star costs on this hole, in the top right of the stage. Read off starsOf's own rule, so a
   hole whose three stars is a birdie shows no separate two star line. */
function starTargets(par, three){
  var t = threeOf(par, three), rows = [[3, t]];
  if (t < par - 1) rows.push([2, par - 1]);
  rows.push([1, par]);
  return '<div class="pt-stars" aria-label="Strokes for each star">' + rows.map(function(r){
    return '<div><i>' + '★★★'.slice(0, r[0]) + '</i><b>' + r[1] + '</b></div>'; }).join('') + '<span>strokes</span></div>';
}
function threeLine(par, three){ var t = threeOf(par, three); return t === 1 ? 'ace it' : 'finish in ' + t; }
function worldStars(tp, TR, w){ var K = TR.per || PER, t = 0; for (var n = w * K + 1; n <= Math.min(TR.levels.length, w * K + K); n++) t += starsOf(tp.best[n], TR.levels[n - 1].par, TR.levels[n - 1].three); return t; }
function worldMax(TR, w){ var K = TR.per || PER; return Math.min(K, TR.levels.length - w * K) * 3; }
/* The gate is CUMULATIVE: 40 stars for every world unlocked (40 of a world's 54, 20 of 27 on the Members
   Tour), counted across every world so far, so 80 opens world 3 however the stars are spread. */
function worldGate(TR, w){ var g = 0; for (var i = 0; i <= w; i++) g += Math.round(worldMax(TR, i) * 40 / 54); return g; }
function starsThrough(tp, TR, w){ var t = 0; for (var i = 0; i <= w; i++) t += worldStars(tp, TR, i); return t; }
/* the highest hole open: walk the cleared holes, and stop at the end of a world short of its gate.
   Never lower than what the record already had open, so nobody is locked out of a hole they reached. */
function frontier(tp, TR){ var K = TR.per || PER, N = TR.levels.length, n = 1;
  while (n < N && tp.best[n] != null && (n % K || starsThrough(tp, TR, n / K - 1) >= worldGate(TR, n / K - 1))) n++;
  return Math.max(tp.lv || 1, n); }
function starRow(k, of){ of = of || 3; var o = ''; for (var i = 0; i < of; i++) o += i < k ? '★' : '☆'; return o; }
function grant(st, name){ if (name && st.rewards.indexOf(name) < 0) st.rewards.push(name); }

/* A HEART IS THREE LIVES, drawn as three bands with a gap between them. The top band goes first, so a heart
   empties from the top down. Band rows: top 0 to 2, middle 4 to 5, bottom 7 to 9 (rows 3 and 6 are the gaps). */
var HEART_PX = ['0110001100', '1111011110', '1111111111', '..........', '1111111111', '0111111110', '..........', '0011111100', '0001111000', '0000110000'];
var HEART_BAND = [0, 0, 0, -1, 1, 1, -1, 2, 2, 2];
function heartSvg(n){ if (n === true) n = PER_HEART; if (!n) n = 0; var on = '', off = '';
  HEART_PX.forEach(function(r, y){ var b = HEART_BAND[y]; if (b < 0) return; var lit = b >= PER_HEART - n;
    for (var x = 0; x < r.length; x++) if (r[x] === '1'){ var c = 'M' + x + ' ' + y + 'h1v1h-1z'; if (lit) on += c; else off += c; } });
  return '<svg viewBox="0 0 10 10" shape-rendering="crispEdges">' + (off ? '<path d="' + off + '" fill="#5b6670"/>' : '') + (on ? '<path d="' + on + '" fill="#e5483a"/>' : '') +
    (n === PER_HEART ? '<path d="M1 1h1v1h-1zM2 2h1v1h-1z" fill="#ff9d8a"/>' : '') + '</svg>'; }
// lives bought over the max (151) are a red +N after full hearts, not more hearts, so a header never overflows
function hearts(st){ var mx = livesMax(), nh = Math.ceil(mx / PER_HEART), out = '', over = Math.max(0, (st.lives || 0) - mx);
  for (var i = 0; i < nh; i++){ var k = Math.max(0, Math.min(PER_HEART, (st.lives || 0) - i * PER_HEART)); out += '<i class="pp-h' + (k ? ' on' : '') + '" title="' + k + ' of ' + PER_HEART + '">' + heartSvg(k) + '</i>'; }
  if (over) out += '<b class="pp-hmore" title="Extra lives over the max">+' + over + '</b>';
  var x = lifeExtra(st), bk = bankHeld(st);
  if (x) out += '<i class="pp-h on pp-hx" title="A spare life in play">' + heartSvg(1) + '</i>';
  if (bk) out += '<b class="pp-hbank" title="Spare lives. Each fills a heart when you lose a life.">+' + bk + '</b>'; return out; }
function golferImg(cls){ try{ var c = S.host.golfer && S.host.golfer(); if (c && c.toDataURL) return '<img class="' + cls + '" alt="" src="' + c.toDataURL() + '">'; }catch(e){} return ''; }
function golferUrl(){ try{ var c = S.host.golfer && S.host.golfer(); if (c && c.toDataURL) return c.toDataURL(); }catch(e){} return ''; }
// the golfer on the map is the page's own figure, putter in hand and wearing its aura, sized by the class
function golferFig(cls){ try{ var f = S.host.figure && S.host.figure(cls); if (f) return f; }catch(e){} return golferImg(cls); }
// the round picture in the header and the play bar: an aura is a glow round the ring in its colour
function avStyle(u){ var a = null; try{ a = S.host.aura && S.host.aura(); }catch(e){}
  return (u ? 'background-image:url(' + u + ');' : '') + (a ? 'box-shadow:0 2px 0 rgba(0,0,0,.4),0 0 10px ' + a + ',0 0 3px ' + a : ''); }
// the head chip the menus draw (the 3D menu golfer), as an <img>, or '' when the page has none
function chipImg(look){ try{ return (S.host.chip && S.host.chip(look)) || ''; }catch(e){ return ''; } }
// the ring itself: the menus' 3D head chip inside it, or the flat picture as its background
function avRing(){ var c = chipImg(); return '<i class="pp-av' + (c ? ' g3' : '') + '" style="' + avStyle(c ? '' : golferUrl()) + '">' + c + '</i>'; }
// the same aura on a golfer drawn on a canvas: the pulse the course golfer has (hvswGlow), 2.4 s, its colour,
// k pixels to a figure pixel. Still, and at its middle, when the player asks for less motion.
function auraGlow(ctx, k, t){ var a = null; try{ a = S.host.aura && S.host.aura(); }catch(e){} if (!a) return;
  var still = false; try{ still = matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){}
  var u = still ? 0.5 : 0.5 - 0.5 * Math.cos((t == null ? performance.now() / 1000 : t) / 2.4 * 2 * Math.PI);
  ctx.shadowColor = a; ctx.shadowBlur = Math.max(2, (1 + 3 * u) * k); ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; }
function balStr(){ if (isGuest()) return '';   // a guest sees no coin count (their coins are held for the account)
  try{ if (S.host.balance) return Number(S.host.balance()).toLocaleString(); }catch(e){} return ''; }
/* THE HEADER FLOATS OVER THE MAP, as the mockup drew it: your golfer in a gold ring, your hearts,
   the refill clock when one is running, your coins and a close button. */
function hdr(right){ var b = balStr();
  return '<div class="pp-hdr">' + avRing() + '<span class="pp-hearts" data-hearts>' + hearts(pload()) + '</span>' +
    (membersOpen() ? '' : '<button class="pp-x2" data-pass aria-label="' + esc(passLivesLine()) + '"><i class="pp-x2h">' + heartSvg(PER_HEART) + '</i>2× lives</button>') + '<span class="pp-hclock" data-clock></span><span class="pp-sp"></span>' +
    (right != null ? right : (b !== '' ? '<span class="pp-cpill" data-bal>' + b + '</span>' : '')) + homeBtn() + '<button class="pp-cx" data-x aria-label="Close">✕</button></div>'; }
// a small top view of a hole, off the flat painter, for the Daily card
var THUMBS = {};
function thumb(box, d, key){ if (!box) return; var c = THUMBS[key];
  if (c === undefined){ try{ c = THUMBS[key] = paintCourse(buildHole(d)); }catch(e){ c = THUMBS[key] = null; } }
  if (!c) return; var cv = document.createElement('canvas'); cv.width = c.width; cv.height = c.height; cv.getContext('2d').drawImage(c, 0, 0); box.appendChild(cv); }
function monthDay(dk){ var m = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][+dk.slice(5, 7) - 1]; return m + ' ' + (+dk.slice(8, 10)); }

/* ----------------------------------------------------------------------------------- the hub */
function showMenu(){ home(); }
/* THE WORLD IS WHERE THE MODE OPENS. The 3D trail out to the next hole, walked by the player's own golfer,
   is the home screen; the map is one button away (Map, top right) and its close goes back to the world.
   Only the Putt Putt Tour and the Members Tour have a world. The Lab, the Daily tab, reduced motion and a
   page without the 3D golfer open on the map, as before. */
/* THE WORLDS AHEAD ARE UNDER CLOUD. A world's name, its land and its holes are not shown anywhere until the
   clouds over it part, and they part at its gate: walk up with the stars it asks for and the door opens on it.
   Revealed is a list on the record, 'tour:world', only ever added to (pmerge), so it follows the account.
   Playing any hole in a world reveals it too, so a skipped walk or reduced motion never leaves a world you are
   standing in under cloud. The first world of a tour and the Lab are never hidden. */
function revealed(TR, w, st){ if (!TR || TR.lab || w <= 0 || allAccess()) return true; st = st || pload(); if ((st.rv || []).indexOf(TR.id + ':' + w) >= 0) return true;
  var tp = st.tours[TR.id] || {}, K = TR.per || PER; for (var n = w * K + 1; n <= Math.min(TR.levels.length, w * K + K); n++) if ((tp.best || {})[n] != null) return true; return false; }
function reveal(TR, w){ if (revealed(TR, w)) return false; var st = pload(); st.rv = st.rv || []; st.rv.push(TR.id + ':' + w); psave(st); return true; }
var CLOUD_NAME = 'In the clouds';
function wLabel(TR, w, st){ return TR.members ? (revealed(TR, w, st) ? TR.worlds[w].name : 'The next Members world') : 'World ' + (w + 1); }
function worldOk(tid){ var TR = TOURS[tid]; if (!TR || TR.lab || tid === 'daily' || !trailOk()) return false;
  var reduce = false; try{ reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){} return !reduce; }
function worldTour(){ if (window.RTT_PUTT_MAPFIRST) return null; var st = pload(), t = (S && S.tour) || st.view || 'main'; return worldOk(t) ? t : worldOk('main') ? 'main' : null; }
function home(tid){ var t = window.RTT_PUTT_MAPFIRST ? null : tid && worldOk(tid) ? tid : worldTour(); if (!t) return showHub(tid);
  var TR = tourOf(t), tp = pload().tours[TR.id], n = Math.min(TR.levels.length, frontier(tp, TR));
  S.tour = t; var r = openTrail(t, n - 1); if (S.trailTo) S.trailTo.home = true; return r; }
function showHub(tid){
  stopTrail(); cancelAnimationFrame(S.raf); S.screen = 'menu'; S.play = null; clearInterval(S.tick);
  if (!cloudUid()) spareFill();   // this device's lives: a spare kept from before fills any gap (signed in, livesSync does it)
  var st = pload(), dk = today(), dh = dailyHole(dk), dT = THEMES[dh.theme], drec = st.daily[dk];
  // which tour the map shows: the one asked for, else the one last looked at; the Members Tour only when it is open
  if (tid) S.tour = tid; if (!S.tour) S.tour = st.view || 'main';
  if (S.tour === 'lab' && !labOpen()) S.tour = 'main';
  st.view = S.tour; psave(st);
  var cal = S.tour === 'daily', TR = cal ? TOURS.main : tourOf(S.tour), mem = !cal && !!TR.members, lab = !cal && !!TR.lab;
  /* THE DAILY CARD ONLY ASKS. Once today is played it has nothing left to offer, so it goes, and the
     result lives on the Daily tab's calendar with every other day. On that tab today is a page of the
     calendar itself, so the card would be the same day twice. */
  var showCard = !cal && !(drec && drec.done);
  S.ov.innerHTML = '<div class="pp-hub' + (mem ? ' pp-mem' : '') + (cal ? ' pp-calv' : '') + '"><div class="pp-map" data-map></div>' + hdr() +
    (!showCard ? '' : '<button class="pp-daily" data-daily aria-label="Daily Challenge: ' + esc(dh.name) + '">\
      <span class="pp-dtile" style="--dt:' + dT.acc + '"><span class="mo">' + monthDay(dk).split(' ')[0] + '</span><span class="dy">' + (+dk.slice(8, 10)) + '</span></span>\
      <span class="pp-dmid"><span class="pp-dk"><b>Daily Challenge</b>' + (st.streak.n > 1 ? '<i class="pp-dstreak">' + st.streak.n + ' day streak</i>' : '') + '</span>\
        <span class="t">' + esc(dh.name) + '</span>\
        <span class="m">' + (drec && drec.done ? 'You shot ' + drec.s + ' (par ' + drec.par + ')' + (drec.ms != null ? ' in ' + clockTxt(drec.ms) : '') : esc(dT.name) + ' · par ' + buildHole(dh).par + ' · timed, one try') + '</span>\
        <span class="pp-dends">' + (drec && drec.done ? 'Next hole in ' : 'Ends in ') + '<b data-dcount>' + hms(msToNextDay()) + '</b></span></span>\
      <span class="pp-dside"><span class="g">' + (drec && drec.done ? 'Result' : 'Play') + '</span><span class="rw">' + (drec && drec.done ? 'Played' : isGuest() ? 'Free to play' : 'Up to ' + (COIN_DAILY + COIN_DAILY_PAR) + ' coins') + '</span></span></button>') +
    '<div class="pp-wchip" data-wchip></div>' + (TOURS.main && !cal ? '<button class="pp-bagb" data-bag aria-label="Your Bag">Bag</button><button class="pp-bagb pp-closb" data-closet aria-label="Your closet">Closet</button>' : '') +
    '<div class="pp-tabs" role="tablist"><button data-tab="main" class="' + (mem || lab || cal ? '' : 'on') + '" role="tab">Putt Putt Tour</button><button data-tab="members" class="' + (mem ? 'on' : '') + '" role="tab"><i>★</i> Members' + (membersOpen() ? '' : ' <s>🔒</s>') + '</button>' + (labOpen() ? '<button data-tab="lab" class="' + (lab ? 'on' : '') + '" role="tab">Lab</button>' : '') +
    '<button data-tab="daily" class="' + (cal ? 'on' : '') + '" role="tab">Daily' + (drec && drec.done ? '' : '<u class="pp-tdot" aria-label="not played today"></u>') + '</button></div>' + '</div>';
  var hx = S.ov.querySelector('[data-x]'), wt = worldOk(S.tour) ? S.tour : worldTour();
  if (wt){ hx.textContent = ''; hx.className = 'pp-toworld'; hx.setAttribute('aria-label', 'Back to the world'); hx.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="#5fb3e8" stroke="#3a2a14" stroke-width="1.6"/><path d="M4 8c3 0 3 3 6 2s2-4 5-3M5 14c2-1 4 0 5 2" stroke="#3f9a4a" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg><b>World</b>'; hx.onclick = function(){ home(wt); }; } else hx.onclick = close;
  var dcb = S.ov.querySelector('[data-daily]'); if (dcb) dcb.onclick = function(){ startDaily(); };
  var bgb = S.ov.querySelector('[data-bag]'); if (bgb) bgb.onclick = bagSheet;
  var clb = S.ov.querySelector('[data-closet]'); if (clb) clb.onclick = closetSheet;
  S.ov.querySelectorAll('[data-tab]').forEach(function(b){ b.onclick = function(){ var t = b.getAttribute('data-tab'); if (t === S.tour) return;
    // the Members tab is open to everybody: without the pass it walks you into Hallows Night to look around
    if (t === 'members' && !membersCanPlay() && worldOk('members')) return home('members'); showHub(t); }; });
  if (cal) drawCal(st); else drawMap(st, TR);
  var clk = S.ov.querySelector('[data-clock]');
  var dc = S.ov.querySelector('[data-dcount]'), dkNow = dk;
  var tick = function(){ var s2 = pload(); clk.textContent = s2.refillAt ? hms(s2.refillAt - Date.now()) : '';
    if (today() !== dkNow) return showHub();   // a new Daily Challenge has arrived
    if (dc) dc.textContent = hms(msToNextDay());
    var h = S.ov.querySelector('[data-hearts]'); if (h) h.innerHTML = hearts(s2); };
  tick(); S.tick = setInterval(function(){ if (!S || S.screen !== 'menu') return clearInterval(S && S.tick); tick(); }, 1000);
}
/* THE BAG: what the trails have given you. The Putt Putt putters (built from their parts, one equipped),
   the spare lives banked, each world's trinkets and its golden balls. Nothing here is for sale. */
function bagSheet(){
  var st = pload(), TR = TOURS.main, pp = st.pp || {}, eq = pp.eq;
  var cl = putterRows(st);
  var puts = cl ? cl : PP_PUTTERS.map(function(pt){ var n = partsOf(st, pt.id), built = n >= 3, on = built && eq === pt.id;
    return '<div class="pp-bput' + (built ? ' built' : '') + (on ? ' on' : '') + '"><div class="pp-bpn"><b>' + esc(pt.name) + '</b><span>' + (built ? esc(pt.tells) : n + ' of 3 parts · found on the trails of ' + pt.worlds.map(function(w){ return esc(revealed(TR, w, st) ? TR.worlds[w].name : 'World ' + (w + 1)); }).join(', ')) + '</span></div>' +
      (built ? '<button class="' + (on ? 'pt-go' : 'pt-bt') + '" data-eq="' + pt.id + '">' + (on ? 'Equipped' : 'Equip') + '</button>' : '<i class="pp-bpp">' + [0, 1, 2].map(function(j){ return '<u class="' + ((pp.parts || []).indexOf(pt.id + ':' + j) >= 0 ? 'on' : '') + '"></u>'; }).join('') + '</i>') + '</div>'; }).join('');
  var worlds = TR.worlds.map(function(Wd, w){ var T = TRINKETS[Wd.theme] || [], gd = goldenOf(st, 'main', w);
    if (!revealed(TR, w, st)) return '<div class="pp-bw" style="--wc:#b9c6d8"><b>World ' + (w + 1) + ' · ' + CLOUD_NAME + '</b><span class="pp-btk"><i>???</i><i>???</i><i>???</i></span><em>● ?/' + gd.total + ' golden</em></div>';
    return '<div class="pp-bw" style="--wc:' + (TRINKET_COL[Wd.theme] || '#fff') + '"><b>' + esc(Wd.name) + '</b><span class="pp-btk">' + T.map(function(nm, j){ var got = (st.tk || []).indexOf(Wd.theme + ':' + j) >= 0;
      return '<i class="' + (got ? 'on' : '') + '">' + (got ? esc(nm) : '???') + '</i>'; }).join('') + '</span><em>● ' + gd.have + '/' + gd.total + ' golden</em></div>'; }).join('');
  // the gym badges, two a world (gyms.js): a world with none yet built shows nothing
  var GLb = gymLib(), won = gymsWon(st), badges = GLb ? TR.worlds.map(function(Wd, w){ var gs = GLb.GYMS.filter(function(g){ return g.world === Wd.theme; }); if (!gs.length) return ''; var shown = revealed(TR, w, st);
    return '<div class="pp-bw" style="--wc:' + (TRINKET_COL[Wd.theme] || '#fff') + '"><b>' + esc(shown ? Wd.name : 'World ' + (w + 1) + ' · ' + CLOUD_NAME) + '</b><span class="pp-btk">' + gs.map(function(g){ var got = won.indexOf(g.id) >= 0;
      return '<i class="' + (got ? 'on' : '') + '">' + (got ? esc(g.badge) : '???') + '</i>'; }).join('') + '</span></div>'; }).join('') : '';
  var sh = el('<div class="pp-sheet pp-bag"><div class="pp-card"><div class="k">YOUR BAG</div><div class="t">Found on the trails</div>\
    <div class="pp-bsec">' + (cl ? 'Your putters' : 'Putt Putt putters') + '</div>' + puts + (!cl && eq && partsOf(st, eq) >= 3 ? '<button class="pt-bt pp-wide" data-uneq>Play with no special putter</button>' : '') + (cl && S.host.closet ? '<button class="pt-bt pp-wide" data-full>Open the full closet</button>' : '') + '\
    <div class="pp-bsec">Spare lives</div><div class="m">' + (bankHeld(st) ? bankHeld(st) + ' saved. Your hearts are full. Each one fills a heart the moment you lose a life.' : 'None saved. A heart turns up on a trail now and then. It goes straight into your hearts.') + '</div>\
    <div class="pp-bsec">Trinkets and golden balls</div>' + worlds + '\
    ' + (GLb ? '<div class="pp-bsec">Gym badges · ' + won.length + ' of ' + GLb.MASTER.badges + '</div>' + (badges || '') : '') + '\
    <div class="pp-bsec">Secrets found · ' + secretsFound(st).length + ' of ' + SECRETS.length + '</div>' + (secretsFound(st).length ? secretsFound(st).sort(function(a, b){ return a - b; }).map(function(i){ var won = !!((st.tours.secret || {}).paid || {})[i];
      return '<div class="pp-bput' + (won ? ' built' : '') + '"><div class="pp-bpn"><b>' + esc(SECRETS[i - 1].name) + '</b><span>' + esc(TR.worlds.filter(function(W){ return W.theme === SECRETS[i - 1].theme; }).map(function(W){ return W.name; })[0] || '') + (won ? ' · beaten' : ' · not beaten yet') + '</span></div><button class="pt-bt" data-sec="' + i + '">Play</button></div>'; }).join('') :
      '<div class="m">None yet. Some places on the trails can be walked into.</div>') + '\
    <button class="pt-bt pp-wide" data-n>Close</button></div></div>');
  S.ov.appendChild(sh);
  sh.querySelector('[data-n]').onclick = function(){ sh.remove(); };
  sh.querySelectorAll('[data-eq]').forEach(function(b){ b.onclick = function(){ var s2 = pload(); s2.pp = s2.pp || { parts:[] }; s2.pp.eq = b.getAttribute('data-eq'); psave(s2); sh.remove(); bagSheet(); }; });
  sh.querySelectorAll('[data-sec]').forEach(function(b){ b.onclick = function(){ var i = +b.getAttribute('data-sec'); sh.remove(); S.secretFrom = secretFrom(i); startLevel(i, 'secret'); }; });
  sh.querySelectorAll('[data-peq]').forEach(function(b){ b.onclick = function(){ if (S.host.equipPutter(b.getAttribute('data-peq'))){ sh.remove(); bagSheet(); } }; });
  var fu = sh.querySelector('[data-full]'); if (fu) fu.onclick = function(){ var h = S.host; sh.remove(); h.closet(); };
  var ue = sh.querySelector('[data-uneq]'); if (ue) ue.onclick = function(){ var s2 = pload(); s2.pp = s2.pp || { parts:[] }; s2.pp.eq = null; psave(s2); sh.remove(); bagSheet(); };
}
/* THE MEMBERS TOUR, SHUT: what it is, what it pays, and the way in. Anybody can walk Hallows Night and look
   at it; this sheet is what meets them at a hole. It sells nothing for coins (the pass is bought with money, on the page's Tour Pass) and it
   always says the Putt Putt Tour is theirs to play meanwhile, with a button straight to it. o.n is the hole they
   walked up to, and o.trail says they were standing on its trail, so Keep looking walks them out again. */
function membersSheet(o){
  o = o || {}; var TR = TOURS.members, Pm = PAY.members, tot = (TR.levels.length - 2) * Pm.hole + 2 * Pm.sig + 2 * Pm.world + TR.per * Pm.treat.each + Pm.treat.all;
  var n = o.n || 1, at = o.n ? 'Hole ' + n + ' · ' + levelName(n, 'members') : 'Hallows Night & Harvest Moon';
  var sh = el('<div class="pp-sheet pp-memsh"><div class="pp-card"><div class="k">★ MEMBERS TOUR · ' + esc(at.toUpperCase()) + '</div><div class="t">This hole is for Tour Pass members</div>\
    <div class="m">Eighteen holes of the season you won’t find anywhere else: a crypt door on a switch, a coffin to roll into, a cauldron, a haunted mill. Look around all you like. Playing them takes the pass.</div>\
    <div class="pp-memrw"><b>' + tot.toLocaleString() + ' coins</b> to win, a <b>trick or treat bonus</b> on every Hallows hole you beat under par, and rewards only members can earn:<br>' + Pm.sigReward.concat(Pm.worldReward, [Pm.treat.reward]).map(function(r){ return esc(r.replace(' (Members only)', '')); }).join(' · ') + ' · ' + esc(Pm.finish.replace(' (Members only)', '')) + '</div>\
    <button class="pt-go pp-wide pass" data-pass>Get Tour Pass<small>Opens the Members Tour and doubles your lives: ' + LIVES_PASS + '</small></button>\
    <div class="m pp-memfree">No pass? The Putt Putt Tour is free to play: ' + TOURS.main.levels.length + ' holes across ' + TOURS.main.worlds.length + ' worlds.</div>\
    <button class="pt-go pp-wide" data-main>Play the Putt Putt Tour</button>' +
    (o.trail ? '<button class="pt-bt pp-wide" data-look>Keep looking around</button>' : '') +
    (S.host.tester && S.host.tester() ? '<button class="pt-bt pp-wide" data-prev>Tester preview</button>' : '') +
    '<button class="pt-bt pp-wide" data-n>' + (o.trail ? 'Back to the map' : 'Not now') + '</button></div></div>');
  S.ov.appendChild(sh);
  sh.querySelector('[data-n]').onclick = function(){ sh.remove(); if (o.trail) showHub('members'); };
  sh.querySelector('[data-main]').onclick = function(){ sh.remove(); S.tour = 'main'; home('main'); };
  var lk = sh.querySelector('[data-look]'); if (lk) lk.onclick = function(){ sh.remove(); openTrail('members', n - 1); };
  var pv = sh.querySelector('[data-prev]'); if (pv) pv.onclick = function(){ S.memPreview = true; sh.remove(); if (o.n) startLevel(n, 'members'); else showHub('members'); };
}
/* THE MAP: level 1 at the bottom, a dashed path winding up through the worlds, each world on its own
   ground. The golfer stands on the level being played and the map opens scrolled to it. */
function drawMap(st, TR){
  TR = TR || tourOf(S.tour); var tp = st.tours[TR.id], K = TR.per || PER, WS = TR.worlds;
  var box = S.ov.querySelector('[data-map]'), N = TR.levels.length, STEP = 92, PADB = 190, WH = 104, H = N * STEP + WS.length * WH + PADB + 60, W = 340;
  var pos = []; for (var n = 1; n <= N; n++){ var w = Math.floor((n - 1) / K), y = H - PADB - (n - 1) * STEP - w * WH, x = W / 2 + Math.sin((n - 1) * 0.9) * 105; pos.push([x, y]); }
  var hid = WS.map(function(Wd, w){ return !revealed(TR, w, st); }), clouds = '';
  var bands = WS.map(function(Wd, w){ var T = THEMES[Wd.theme], top = pos[Math.min(N, w * K + K) - 1][1] - STEP / 2 - WH, bot = w === 0 ? H : pos[w * K][1] + STEP / 2;
    if (hid[w]){
      // a hidden world is a bank of cloud over everything: its ground, its path and its holes. The label is all it says.
      clouds += '<div class="pp-cloudo" data-cw="' + w + '" role="button" aria-label="' + (TR.members ? 'The next Members world' : 'World ' + (w + 1)) + ', hidden in the clouds" style="top:' + (top - 30) + 'px;height:' + (bot - top - 26) + 'px"><u></u><u></u><u></u><u></u><u></u></div>' +
        '<div class="pp-wname wm wm-cloud" style="top:' + (top + 8) + 'px"><i>' + (TR.members ? 'Members Tour' : 'World ' + (w + 1)) + '</i><b>' + CLOUD_NAME + '</b><span>Reach the gate with ' + worldGate(TR, w - 1) + ' ★ to part them</span></div>';
      return '<div class="pp-band cloud" data-w="' + w + '" style="top:' + top + 'px;height:' + (bot - top) + 'px"></div>'; }
    return '<div class="pp-band" data-w="' + w + '" style="top:' + top + 'px;height:' + (bot - top) + 'px;background:linear-gradient(180deg,' + T.bg2 + ',' + T.bg + ')"></div>\
      <div class="pp-wname wm wm-' + Wd.id + '" style="top:' + (top + 8) + 'px"><i>' + (TR.id === 'lab' ? 'Testers only' : TR.members ? 'Members Tour' : 'World ' + (w + 1)) + '</i><b>' + esc(Wd.name) + '</b><span>' + esc(Wd.haz.join(' · ')) + '</span></div>'; }).join('');
  var d = pos.map(function(p, i){ return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
  var badges = pos.map(function(p, i){ var n = i + 1, L = TR.levels[i], best = tp.best[n], open = opened(TR, tp, n), cur = n === tp.lv, ace = !!tp.ace[n];
    if (hid[Math.floor(i / K)]) return '';
    var cls = 'pp-lv wt-' + WS[Math.min(WS.length - 1, Math.floor(i / K))].theme + (L.sig ? ' sig' : '') + (open ? '' : ' lock') + (cur ? ' cur' : '') + (best != null ? ' done' : '') + (ace ? ' ace' : '');
    return '<button class="' + cls + '" data-lv="' + n + '" style="left:' + p[0] + 'px;top:' + p[1] + 'px" aria-label="Level ' + n + (open ? '' : ', locked') + '">' +
      '<b>' + n + '</b>' + (cur ? '<span>Par ' + L.par + '</span>' : best != null ? '<span class="st">' + starRow(starsOf(best, L.par, L.three)) + '</span>' : '') + (L.sig ? '<i>★</i>' : '') + '</button>'; }).join('');
  // the golfer stands on the hole being played; when that hole is still under cloud, at the gate below it
  var cpn = Math.min(N, tp.lv); while (cpn > 1 && hid[Math.floor((cpn - 1) / K)]) cpn--; var cp = pos[cpn - 1];
  /* THE MAP FILLS THE SCREEN. The world is drawn 340 wide with 200 of landscape either side, and on a
     wider screen the whole thing is scaled up until the landscape reaches both edges, so a desktop is
     the same picture larger rather than a phone's picture in a dark frame. */
  var k = Math.max(1, (box.clientWidth || 390) / (W + 380)); S.mapK = k; S.mapPos = pos; S.mapWS = WS;
  box.innerHTML = '<div class="pp-sizer" style="height:' + Math.ceil(H * k) + 'px"><div class="pp-world" style="height:' + H + 'px;width:' + W + 'px;transform:translateX(-50%) scale(' + k + ')">' + bands +
    '<svg class="pp-path" width="' + W + '" height="' + H + '"><path d="' + d + '"/></svg>' + badges + clouds +
    '<div class="pp-me" style="left:' + (cp[0] > W / 2 + 50 ? cp[0] - 76 : cp[0] + 34) + 'px;top:' + (cp[1] + 22) + 'px">' + golferFig('pp-meimg') + '</div></div></div>';
  // the golfer on the map walks: tap him and the joystick comes up, heading for the hole in front of him
  var meEl = box.querySelector('.pp-me'); if (meEl && trailOk() && tp.lv <= N){ meEl.classList.add('tap'); meEl.setAttribute('role', 'button'); meEl.setAttribute('aria-label', 'Walk to hole ' + tp.lv);
    meEl.onclick = function(){ if (trailOk()) openTrail(TR.id, Math.min(N, tp.lv) - 1); }; }
  box.querySelectorAll('[data-lv]').forEach(function(b){ b.onclick = function(){ var n = +b.getAttribute('data-lv'); var tq = pload().tours[TR.id];
    if (TR.id === 'main' && isGuest() && n <= GUEST_WALK && opened(TR, tq, n)){ return trailOk() ? openTrail(TR.id, n - 1) : startLevel(n, TR.id); }   // a guest walks to hole 1 (and startLevel says whether they may play it)
    if (!opened(TR, tq, n)){ var pw = Math.floor((n - 2) / K);
      return toastHub((n - 1) % K === 0 && tq.best[n - 1] != null ? wLabel(TR, pw + 1) + ' opens at ' + worldGate(TR, pw) + ' total stars. You have ' + starsThrough(tq, TR, pw) + '.' : 'Clear level ' + (n - 1) + ' at par or better to open it.'); } skipWarn(n, TR.id); }; });
  box.querySelectorAll('[data-cw]').forEach(function(c){ c.onclick = function(){ var w = +c.getAttribute('data-cw'), tq = pload().tours[TR.id], have = starsThrough(tq, TR, w - 1), need = worldGate(TR, w - 1);
    // standing at the gate with the stars: walk up to it, and the clouds part there
    if (opened(TR, tq, w * K + 1) && trailOk()) return openTrail(TR.id, w * K);
    toastHub('Clouds hide what is next. Reach the gate at the end of ' + wLabel(TR, w - 1) + (have >= need ? '.' : ' with ' + need + ' ★. You have ' + have + '.')); }; });
  // the chip in the corner names the world in view and how much of it is beaten
  var chip = S.ov.querySelector('[data-wchip]'), lastW = -1;
  function wchip(){ if (!chip || !S || !box.isConnected) return; var mid = (box.scrollTop + box.clientHeight * 0.55) / k, w = 0;
    for (var wi = 0; wi < WS.length; wi++) if (mid < pos[wi * K][1] + STEP / 2 + 1) w = wi;
    if (w === lastW) return; lastW = w; var hub = S.ov.querySelector('.pp-hub'), wv = w; while (wv > 0 && hid[wv]) wv--; if (hub) hub.setAttribute('data-wt', WS[wv].theme);
    chip.textContent = (TR.members && !membersOpen() ? 'Preview · ' : '') + (hid[w] ? wLabel(TR, w) + ' · ' + CLOUD_NAME : (TR.members ? WS[w].name : 'World ' + (w + 1)) + ' · ' + worldStars(tp, TR, w) + '/' + worldMax(TR, w) + ' ★'); }
  box.addEventListener('scroll', wchip, { passive:true });
  /* ON A PHONE THE DAILY FOLDS TO A CHIP ONCE THE MAP IS SCROLLED, so it never sits over a level for
     long; back where the map opened, it is the full card again. A wide screen docks it to the side. */
  var dcard = S.ov.querySelector('.pp-daily'), home0 = null;
  box.addEventListener('scroll', function(){ if (!dcard || home0 == null) return; dcard.classList.toggle('mini', Math.abs(box.scrollTop - home0) > 40); }, { passive:true });
  requestAnimationFrame(function(){ box.scrollTop = Math.max(0, cp[1] * k - box.clientHeight * 0.6); home0 = box.scrollTop; wchip(); });
  mapArt(box, pos, TR);
}
/* THE DAILY TAB IS A CALENDAR YOU CAN WALK BACK DOWN. Today is at the top, every day before it is a
   tear-off page on the trail below, a month to a page with the month's own theme behind it. A page
   says what you shot that day, or that you missed it. Missing a day is a fact for a free player; a
   Tour Pass holder can go back and play any page they missed, as the scored try it would have been.
   A day played late pays its coins but never moves the streak, which is about turning up each day. */
var CAL_BACK = 60;
function dayAdd(dk, n){ return new Date(Date.parse(dk + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10); }
function pastOpen(){ return membersOpen() || !!(S && S.calPreview); }
function calDays(st){ var t = today(), from = dayAdd(t, -(CAL_BACK - 1));
  Object.keys(st.daily || {}).forEach(function(k){ if (/^\d{4}-\d{2}-\d{2}$/.test(k) && k < from && st.daily[k].done) from = k; });
  var out = []; for (var d = from; d <= t; d = dayAdd(d, 1)) out.push(d); return out; }
var MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
var WDAYS = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
function drawCal(st){
  var box = S.ov.querySelector('[data-map]'), days = calDays(st), t = today(), W = 340, STEP = 88, MH = 118, PADB = 120, PADT = 76;
  var months = []; days.forEach(function(d){ var m = d.slice(0, 7); if (!months.length || months[months.length - 1].m !== m) months.push({ m:m, first:days.indexOf(d) }); });
  var H = days.length * STEP + months.length * MH + PADB + PADT, pos = [], mi = -1;
  days.forEach(function(d, i){ if (mi + 1 < months.length && months[mi + 1].first === i) mi++; var y = H - PADB - i * STEP - mi * MH, x = W / 2 + Math.sin(i * 0.9) * 105; pos.push([x, y]); });
  var bands = months.map(function(M, j){ var last = j + 1 < months.length ? months[j + 1].first - 1 : days.length - 1, T = THEMES[themeForDay(days[M.first])] || THEMES[themeForDay(t)];
    var top = j + 1 < months.length ? pos[last][1] - STEP / 2 - MH : 0, bot = j === 0 ? H : pos[M.first][1] + STEP / 2;
    var played = 0; for (var i = M.first; i <= last; i++) if (st.daily[days[i]] && st.daily[days[i]].done) played++;
    return '<div class="pp-band pp-cmon" data-m="' + M.m + '" style="top:' + top + 'px;height:' + (bot - top) + 'px;--c1:' + T.bg2 + ';--c2:' + T.bg + ';--ca:' + T.acc + '"></div>\
      <div class="pp-cpage" style="top:' + (pos[last][1] - STEP / 2 - MH + 14) + 'px;--ca:' + T.acc + '"><i class="rings"></i><b>' + MONTHS[+M.m.slice(5) - 1] + '</b><span>' + M.m.slice(0, 4) + ' · ' + played + ' of ' + (last - M.first + 1) + ' played</span></div>'; }).join('');
  var dpath = pos.map(function(p, i){ return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
  // the trail is walked in gold up to the last day you played, so the run you are on reads at a glance
  var lastPlayed = -1; days.forEach(function(d, i){ if (st.daily[d] && st.daily[d].done) lastPlayed = i; });
  var walked = lastPlayed > 0 ? pos.slice(0, lastPlayed + 1).map(function(p, i){ return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ') : '';
  var pro = pastOpen();
  var pages = days.map(function(d, i){ var p = pos[i], rec = st.daily[d], done = !!(rec && rec.done), cur = d === t, dt = new Date(Date.parse(d + 'T12:00:00Z')), T = THEMES[themeForDay(d)];
    var cls = 'pp-cday' + (done ? ' done' : cur ? ' cur' : pro ? ' open' : ' lock'), tag;
    if (done){ var df = rec.s - rec.par; tag = '<span class="sc ' + (df < 0 ? 'u' : df > 0 ? 'o' : 'e') + '">' + (rec.s >= rec.par + 3 ? 'Pick up' : fmtPar(df)) + '</span>'; }
    else tag = cur ? '<span class="sc now">Play</span>' : '<span class="sc ms">' + (pro ? 'Catch up' : 'Missed') + '</span>';
    return '<button class="' + cls + '" data-day="' + d + '" style="left:' + p[0] + 'px;top:' + p[1] + 'px;--ca:' + T.acc + '" aria-label="' + MONTHS[dt.getUTCMonth()] + ' ' + dt.getUTCDate() + (done ? ', played' : cur ? ', today' : ', missed') + '">' +
      '<i>' + WDAYS[dt.getUTCDay()] + '</i><b>' + dt.getUTCDate() + '</b>' + tag + (!done && !cur && !pro ? '<s>🔒</s>' : '') + '</button>'; }).join('');
  var cp = pos[pos.length - 1], k = Math.max(1, (box.clientWidth || 390) / (W + 380)); S.mapK = k;
  box.innerHTML = '<div class="pp-sizer" style="height:' + Math.ceil(H * k) + 'px"><div class="pp-world pp-calw" style="height:' + H + 'px;width:' + W + 'px;transform:translateX(-50%) scale(' + k + ')">' + bands +
    '<svg class="pp-path" width="' + W + '" height="' + H + '"><path d="' + dpath + '"/>' + (walked ? '<path class="walk" d="' + walked + '"/>' : '') + '</svg>' + pages +
    '<div class="pp-me" style="left:' + (cp[0] > W / 2 + 50 ? cp[0] - 76 : cp[0] + 34) + 'px;top:' + (cp[1] + 22) + 'px">' + golferFig('pp-meimg') + '</div></div></div>';
  box.querySelectorAll('[data-day]').forEach(function(b){ b.onclick = function(){ var d = b.getAttribute('data-day'), r = pload().daily[d];
    if (r && r.done) return dailyResult(null, d);
    if (d === today()) return startDaily();
    if (!pastOpen()) return pastSheet(d);
    startDaily(d); }; });
  var chip = S.ov.querySelector('[data-wchip]'), hub = S.ov.querySelector('.pp-hub');
  function mchip(){ if (!chip || !box.isConnected) return; var mid = (box.scrollTop + box.clientHeight * 0.55) / k, j = 0;
    for (var q = 0; q < months.length; q++) if (mid < pos[months[q].first][1] + STEP / 2 + 1) j = q;
    var M = months[j], last = j + 1 < months.length ? months[j + 1].first - 1 : days.length - 1, n = 0; for (var i = M.first; i <= last; i++) if (st.daily[days[i]] && st.daily[days[i]].done) n++;
    chip.textContent = MONTHS[+M.m.slice(5) - 1] + ' · ' + n + '/' + (last - M.first + 1) + ' played' + (st.streak && st.streak.n > 1 ? ' · ' + st.streak.n + ' day streak' : '');
    if (hub) hub.setAttribute('data-wt', themeForDay(days[M.first])); }
  box.addEventListener('scroll', mchip, { passive:true });
  requestAnimationFrame(function(){ box.scrollTop = Math.max(0, Math.min(cp[1] * k - box.clientHeight * 0.62, (PADT + 58) * k - 80)); mchip(); });
}
/* A MISSED DAY, SHUT: the way back to it is the Tour Pass. Nothing here sells it for coins. */
function pastSheet(dk){
  var dh = dailyHole(dk), sh = el('<div class="pp-sheet pp-memsh"><div class="pp-card"><div class="k">★ ' + monthDay(dk) + ' · MISSED</div><div class="t">' + esc(dh.name) + '</div>\
    <div class="m">Every day you missed is still on the calendar. Tour Pass members can go back and play any of them: one scored try each, the same hole everybody played that day.</div>\
    <button class="pt-go pp-wide pass" data-pass>Get Tour Pass<small>Play every past Daily Hole</small></button>' +
    (S.host.tester && S.host.tester() ? '<button class="pt-bt pp-wide" data-prev>Tester preview</button>' : '') +
    '<button class="pt-bt pp-wide" data-n>Not now</button></div></div>');
  S.ov.appendChild(sh);
  sh.querySelector('[data-n]').onclick = function(){ sh.remove(); };
  var pv = sh.querySelector('[data-prev]'); if (pv) pv.onclick = function(){ S.calPreview = true; sh.remove(); startDaily(dk); };
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
    if (band && !band.classList.contains('cloud')){
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

/* ------------------------------------------------------------------- the walk to the next hole */
/* THE TOUR IS ONE PLACE. Winning a hole and pressing Next does not cut to the next hole: the map comes
   back, the golfer walks the cart path from this hole's flag to the next one and the camera walks with
   him, and only then does the hole open. Crossing into a new world he meets its door, built of that
   world (a temple's carved stone, a ship's hull, a mine's iron gate, a glacier), and the stars he has
   fill the lock. Enough and it opens; short and it stays shut and says how many more. Tapping anywhere
   skips the walk, and reduced motion skips it outright (the door still says whether it opened). */
var DOOR_NAMES = { temple:'Temple Door', pirate:'Hull Door', canyon:'Mine Gate', volcano:'Basalt Gate', dino:'Bone Gate', sky:'Cloud Gate', neon:'Arcade Shutter', school:'School Doors', iceage:'Glacier Gate', candy:'Factory Gate', haunted:'Crypt Gate', harvest:'Barn Doors', clubhouse:'Clubhouse Door' };
// the 3D golfer's walk up the trail, drawn while the hole before it is played so the first steps never wait
function warmWalk(TR, n){ try{ var h = S.host; if (h.golferWalkWarm && n < TR.levels.length) h.golferWalkWarm(0, -1); }catch(e){} }
/* THE WALK IS A PLACE (golf/putt/trail.js). Winning a hole and pressing Next opens the trail to the next
   one: a 3D scene of the world, two to three screens long, walked with a stick (or the keys), with a
   waypoint on the hole ahead and an arrow on the edge of the screen when it is out of sight. Coins, a
   chest, a golden ball, things to smash and a local who talks about the hole are on the way, and every one
   is the Tour record's (st.trail, merged like everything else there: it only adds). The trail renders while
   the hole before it is played, the way the next hole does, so Next does not wait. Reduced motion, or a
   page without the trail or the 3D golfer, keeps the short walk on the map. */
/* THE RARE THINGS ON THE TRAILS, all of them the main tour's and all of them fixed to a trail, so every
   player finds them in the same places and a trail can be gone back to.
   TRINKETS: three a world, found only on the trails, each the world's own. A world's three is a set and
   pays TRINKET_SET_COINS and a named reward. They are this game's alone.
   PUTT PUTT PUTTERS: three, each built from three parts found on the trails, early worlds first. A built
   putter is equipped in the Bag and helps the way its card says. They never move a price, a par or a
   score anyone else plays against, and the Daily Hole is played without them.
   SPARE LIVES: one trail in about ten carries a heart. Picked up, it is banked, and spent from the out of
   lives sheet when the hearts are gone. */
var TRINKETS = {
  clubhouse:['Brass Ball Marker', 'Club Pennant', 'Scorecard Pencil'], temple:['Jade Idol', 'Sun Disc', 'Carved Tee'],
  pirate:['Doubloon Marker', 'Spyglass', 'Parrot Feather'], canyon:['Gold Nugget', 'Lucky Horseshoe', 'Prospector Pan'],
  volcano:['Obsidian Shard', 'Ember Stone', 'Fire Opal'], dino:['Raptor Claw', 'Fossil Fern', 'Trilobite'],
  sky:['Cloud Feather', 'Kite Charm', 'Weather Vane'], neon:['Arcade Token', 'Joystick Charm', 'Prize Ticket'],
  school:['Gold Star', 'Apple Eraser', 'Lucky Pencil'], iceage:['Mammoth Tusk', 'Cave Painting', 'Amber Stone'],
  candy:['Lucky Gumball', 'Candy Wrapper', 'Sugar Crystal']
};
var TRINKET_COL = { clubhouse:'#7ee081', temple:'#3fd0a0', pirate:'#ffd23a', canyon:'#ff9a4a', volcano:'#ff5a3c', dino:'#b8e04a', sky:'#ffffff', neon:'#ff2bd6', school:'#ffd23f', iceage:'#8fd0e0', candy:'#ff5fa2' };
var TRINKET_SET_COINS = 300;
var PP_PUTTERS = [
  { id:'scope', name:'Scope Putter', worlds:[0, 1, 2], tells:'The aim line reaches four feet further.' },
  { id:'bank', name:'Bank Shot Putter', worlds:[2, 3, 4], tells:'The aim line bends off the walls the way the ball will.' },
  { id:'buoy', name:'Lifeguard Putter', worlds:[4, 5, 6], tells:'Once a hole, water or out of bounds costs no penalty stroke.' }
];
var PART_NAMES = ['grip', 'shaft', 'head'];
// which trail carries what: a pure function of the tour and the hole walked to
function trailLoot(tid, to){ var TR = tourOf(tid); if (tid !== 'main' || TR.lab || TR.members) return {};
  var K = TR.per || PER, w = Math.floor((to - 1) / K), out = {}, Wd = TR.worlds[w]; if (!Wd) return out;
  var slots = lootSlots(tid, w);
  var ti = slots.tk.indexOf(to); if (ti >= 0){ var nm = (TRINKETS[Wd.theme] || [])[ti]; if (nm) out.trinket = { id:Wd.theme + ':' + ti, name:nm, col:TRINKET_COL[Wd.theme] }; }
  PP_PUTTERS.forEach(function(pt){ var j = pt.worlds.indexOf(w); if (j >= 0 && slots.pt[pt.id] === to) out.part = { id:pt.id + ':' + j, name:pt.name + ' ' + PART_NAMES[j], putter:pt.id }; });
  if (to > 2 && hstr('life:' + tid + ':' + to) % 10 === 3) out.life = { id:'life:' + to };
  return out; }
function lootSlots(tid, w){ var K = tourOf(tid).per || PER, base = w * K, pool = [], i; for (i = 2; i <= K; i++) pool.push(base + i);
  pool.sort(function(a, b){ return hstr('loot:' + a) - hstr('loot:' + b); });
  var r = { tk:pool.slice(0, 3), pt:{} }, k = 3; PP_PUTTERS.forEach(function(pt){ if (pt.worlds.indexOf(w) >= 0) r.pt[pt.id] = pool[k++]; }); return r; }
function partsOf(st, id){ var pp = st.pp || {}, n = 0; (pp.parts || []).forEach(function(x){ if (x.split(':')[0] === id) n++; }); return n; }
/* THE PUTTER IS THE ONE IN YOUR CLOSET. Run The Tour's closet has a Putters slot of its own, and whatever is
   equipped there is the putter in both games: its reach sets the aim line (host.putter) and a Putt Putt putter
   carries its perk (host.putterNow). A putter built here from trail parts is granted to that closet. A page with
   no closet (or a check's stub host) falls back to the Bag's own choice, st.pp.eq. */
function puttEquipped(){ try{ if (S.round && S.round.mode !== 'ppt') return null;
    if (S.host.putterNow){ var p = S.host.putterNow(); return p && p.perk ? p.perk : null; }
    var st = pload(), id = st.pp && st.pp.eq; return id && partsOf(st, id) >= 3 ? id : null; }catch(e){ return null; } }
function syncPutters(){ try{ if (!S || !S.host.grantPutter) return; var st = pload(); PP_PUTTERS.forEach(function(pt){ if (partsOf(st, pt.id) >= 3) S.host.grantPutter(pt.id); }); }catch(e){} }
function hostPutters(){ try{ return S.host.putters && S.host.signedIn && S.host.signedIn() ? S.host.putters() : null; }catch(e){ return null; } }
// the putters, as rows: owned first (equip), then the Putt Putt ones still being built (their parts), then the pack ones
function putterRows(st){ var L = hostPutters(); if (!L) return null; var TR = TOURS.main;
  var order = function(p){ return p.owned ? 0 : p.kind === 'pp' ? 1 : 2; };
  return L.slice().sort(function(a, b){ return order(a) - order(b); }).map(function(p){
    var pt = PP_PUTTERS.filter(function(q){ return q.id === p.id; })[0], n = pt ? partsOf(st, p.id) : 0;
    var how = p.owned ? esc(p.txt) : pt ? n + ' of 3 parts · found on the trails of ' + pt.worlds.map(function(w){ return esc(revealed(TR, w) ? TR.worlds[w].name : 'World ' + (w + 1)); }).join(', ') : p.hint ? esc(p.hint) : 'Pull it from a pack in the Pro Shop';
    return '<div class="pp-bput' + (p.owned ? ' built' : ' locked') + (p.on ? ' on' : '') + '"><span class="pp-pth">' + p.thumb + '</span><div class="pp-bpn"><b>' + esc(p.name) + '</b><span>' + how + '</span></div>' +
      (p.owned ? '<button class="' + (p.on ? 'pt-go' : 'pt-bt') + '" data-peq="' + p.id + '">' + (p.on ? 'Equipped' : 'Equip') + '</button>' : pt ? '<i class="pp-bpp">' + [0, 1, 2].map(function(j){ return '<u class="' + (((st.pp || {}).parts || []).indexOf(pt.id + ':' + j) >= 0 ? 'on' : '') + '"></u>'; }).join('') + '</i>' : '<i class="pp-plock">Locked</i>') + '</div>'; }).join(''); }
/* THE CLOSET, IN PUTT PUTT: your putters, the one equipped, and a way into the full closet. */
function closetSheet(){
  var st = pload(), rows = putterRows(st), sh;
  if (!rows) sh = el('<div class="pp-sheet pp-bag"><div class="pp-card"><div class="k">YOUR CLOSET</div><div class="t">Putters</div><div class="m">Your closet and its putters are part of a free account. Sign in to equip a putter for both games.</div>' +
    (S.host.signIn ? '<button class="pt-go pp-wide" data-si>Sign in</button>' : '') + '<button class="pt-bt pp-wide" data-n>Close</button></div></div>');
  else sh = el('<div class="pp-sheet pp-bag"><div class="pp-card"><div class="k">YOUR CLOSET</div><div class="t">Putters</div>    <div class="m">The putter you equip is the one you putt with in Run The Tour and in Putt Putt. A better putter runs a longer aim line here.</div>' + rows +
    (S.host.closet ? '<button class="pt-go pp-wide" data-full>Open the full closet</button>' : '') + '<button class="pt-bt pp-wide" data-n>Close</button></div></div>');
  S.ov.appendChild(sh);
  sh.querySelector('[data-n]').onclick = function(){ sh.remove(); };
  var si = sh.querySelector('[data-si]'); if (si) si.onclick = function(){ var h = S.host; sh.remove(); close(); h.signIn('signin'); };
  var fu = sh.querySelector('[data-full]'); if (fu) fu.onclick = function(){ var h = S.host; sh.remove(); h.closet(); };
  sh.querySelectorAll('[data-peq]').forEach(function(b){ b.onclick = function(){ if (S.host.equipPutter(b.getAttribute('data-peq'))){ sh.remove(); closetSheet(); } }; });
}
/* SPARE LIVES FILL THE HEARTS (the owner, 2026-10-17). A spare picked up on a trail (its id in st.bank) goes
   straight into the hearts whenever they are below the max, and cancels the clock of the lost life due back
   last, the way a bought life does (149). Only with the hearts full is one kept, shown as +N beside them, and it
   fills the gap the moment a life is lost. st.bfill holds the ids that filled a heart.
   A signed in player's lives are the server's, so a spare fills one there (putt_lives_spare, 150), keyed by its
   id so two devices never spend one spare twice, and the page takes the server's answer rather than adding the
   life itself. A guest, or a browser the server has not answered yet, fills on this device. st.bused and
   st.bspent are the old rule's (a spare spent from the out of lives sheet as an extra heart): they still count,
   and that sheet's button is left for a database without 150, the one way a spare can be held at nought. */
function sparesHeld(st){ var f = st.bfill || []; return (st.bank || []).filter(function(id){ return f.indexOf(id) < 0; }).sort().slice(st.bused || 0); }
function bankHeld(st){ return sparesHeld(st).length; }
// fill what it can on this device: each spare takes back the lost life due last. True when one went in.
function spareFillHere(st){ var mx = livesMax(), n = 0, h;
  while (!st.lsrv && st.lives != null && st.lives < mx && (st.back || []).length && (h = sparesHeld(st)).length){
    st.back = st.back.slice().sort(function(a, b){ return a - b; }); st.back.pop(); st.lives = Math.min(mx, st.lives + 1);
    st.bfill = (st.bfill || []).concat([h[0]]); n++; }
  if (n){ st.refillAt = st.back.length ? st.back[0] : null; st.l9 = 1; st.lt = Date.now(); }
  return n > 0; }
// one spare at a time to the server, while it has a heart to fill. Resolves true when a heart was filled.
var SPARE = { busy:false, again:false };
function spareFill(){ var st0 = pload(); if (!sparesHeld(st0).length) return Promise.resolve(false);
  var uid = cloudUid();
  if (!uid){ if (spareFillHere(st0)){ psave(st0); return Promise.resolve(true); } return Promise.resolve(false); }
  if (SPARE.busy){ SPARE.again = true; return Promise.resolve(false); }
  SPARE.busy = true; var any = false;
  var step = function(){ var s = pload(), id = sparesHeld(s)[0];
    if (!id || (s.lsrv && (s.lives || 0) >= livesMax())) return Promise.resolve(false);
    var p = null; try{ p = hostOf().rpc('putt_lives_spare', { p_max:livesMax(), p_spare:id }); }catch(e){ p = null; }
    if (!p || !p.then) return Promise.resolve(null);
    return p.then(function(d){ var r = cloudRow(d); if (!r || r.lives == null || cloudUid() !== uid) return null;
      livesApply(uid, d); if (!r.used) return false;
      var s2 = pload(); s2.bfill = s2.bfill || []; if (s2.bfill.indexOf(id) < 0) s2.bfill.push(id); psave(s2); any = true; return step(); }, function(){ return null; }); };
  return step().then(function(v){ SPARE.busy = false;
    // no answer (a database without 150, or offline) before the server has ever answered: this device holds the lives
    if (v === null){ var s = pload(); if (!s.lsrv && spareFillHere(s)){ psave(s); any = true; } }
    if (SPARE.again){ SPARE.again = false; return spareFill().then(function(f){ return any || f; }); }
    return any; }); }
function lifeExtra(st){ return Math.max(0, (st.bused || 0) - (st.bspent || 0)); }
function livesNow(st){ return (st.lives || 0) + lifeExtra(st); }
/* THE GREETERS. Every world has one: a local who walks up the moment you step into their world, the way a
   board game host does, and tells you where you are. The first trail of a world is theirs. They talk on
   their own the first time (st.met keeps who you have met, and it follows the account) and stay by the
   path after, so walking up to them again plays it again. They are invented characters, drawn by the same
   3D golfer as the player, in a look nobody can buy. */
var GREETERS = {
  clubhouse:{ name:'Pro Pete', role:'Club Pro', look:{ skin:'light', polo:'white', hat:'navy', pants:'navy', hair:'brown', hairStyle:'swoop', cap:true, hatStyle:'visor', gender:'male' },   // a preppy club pro: white polo, visor, slacks
    hi:['Hey there! Welcome to the Putt Putt Tour.', 'I’m Pro Pete. I run the Clubhouse.'],
    tip:['Match par and the next hole opens. Beat it and you earn more stars.', 'Windmills, loops and drawbridges live here. Time them right.'],
    bye:'Go get ’em, champ!' },
  temple:{ name:'Professor Fern', role:'Explorer', look:{ skin:'tan', polo:'gold', hat:'tan', pants:'khaki', hair:'black', hairStyle:'ponytail', cap:true, hatStyle:'safari', gender:'female' },
    hi:['Oh! A visitor! Mind the vines.', 'I’m Professor Fern. I’ve studied this temple for twenty years.'],
    tip:['The stone is polished smooth. Putt softer than you think. The vines stop it cold.', 'I’ve lost three trinkets out on these trails. Keep your eyes open.'],
    bye:'Off you go. Science awaits!' },
  pirate:{ name:'Captain Bogey', role:'Pirate Captain', look:{ skin:'tan', polo:'black', hat:'black', pants:'wine', hair:'black', hairStyle:'long', cap:true, hatStyle:'pirate', top:'blazer', gender:'male' },
    hi:['Ahoy! Welcome to Pirate Cove!', 'Captain Bogey’s the name. Treasure’s the game.'],
    tip:['The sea’s on every side. Jump it, ride it, or go round.', 'Smash a barrel or two. There’s gold hidden all over this beach.'],
    bye:'Now hoist the flag, matey!' },
  canyon:{ name:'Dusty', role:'Prospector', look:{ skin:'tan', polo:'gold', hat:'tan', pants:'navy', hair:'grey', hairStyle:'short', cap:true, hatStyle:'cowboy', gender:'male' },
    hi:['Well howdy, partner!', 'Name’s Dusty. Been minin’ this canyon forty years.'],
    tip:['The belts push your ball and the shafts swallow it. Read the ledge.', 'Chests turn up off the main trail. Sometimes behind a locked gate.'],
    bye:'Happy trails, partner!' },
  volcano:{ name:'Ranger Mae', role:'Volcano Ranger', look:{ skin:'brown', polo:'black', hat:'orange', pants:'grey', hair:'black', hairStyle:'buzz', cap:true, hatStyle:'headband', gender:'female' },
    hi:['Whoa there! It’s hot out here.', 'I’m Ranger Mae. I keep an eye on the volcano.'],
    tip:['Every gate here runs on a clock. Watch the lava, then putt.', 'Step in the lava on the trail and you’re straight back on the path. Trust me.'],
    bye:'Stay cool out there!' },
  dino:{ name:'Dr. Bones', role:'Fossil Hunter', look:{ skin:'medium', polo:'gold', hat:'tan', pants:'khaki', hair:'brown', hairStyle:'ponytail', cap:true, hatStyle:'cap', gender:'female' },
    hi:['Welcome to Dino Valley! Mind your step.', 'I’m Dr. Bones. I dig up fossils.'],
    tip:['Wet clay is slick. Putt softer than you think.', 'The logs never stop rolling. Wait for your gap.'],
    bye:'Go make some tracks!' },
  sky:{ name:'Skye', role:'Balloon Pilot', look:{ skin:'porcelain', polo:'purple', hat:'white', pants:'stone', hair:'platinum', hairStyle:'curly', cap:true, hatStyle:'propeller', gender:'female' },
    hi:['Look at you, way up in the clouds!', 'I’m Skye. I fly the balloons around here.'],
    tip:['Miss the island and it drops. The hay stops it cold.', 'The blimps keep moving. Watch one go by first.'],
    bye:'Up, up and away!' },
  neon:{ name:'DJ Pixel', role:'Arcade Keeper', look:{ skin:'tan', polo:'rtggreen', hat:'black', pants:'navy', hair:'jet', hairStyle:'mohawk', cap:true, hatStyle:'headphones', gender:'male' },
    hi:['Yo! Welcome to the Neon Arcade!', 'DJ Pixel on the decks. Everything in here runs on a beat.'],
    tip:['Cars, loops and belts. Watch the lights and time every shot.', 'High score gets the glory. Let’s see what you’ve got.'],
    bye:'Press start!' },
  school:{ name:'Principal Plum', role:'Principal', look:{ skin:'brown', polo:'purple', hat:'black', pants:'grey', hair:'grey', hairStyle:'short', cap:false, top:'blazer', gender:'female' },
    hi:['Good morning! Welcome to the Schoolyard.', 'I’m Principal Plum. Recess is my favorite subject.'],
    tip:['The creek carries your ball. The sandbox stops it cold.', 'The doors and the merry-go-round all move. Watch them first.'],
    bye:'No running in the halls. Putting is fine.' },
  iceage:{ name:'Grok', role:'Cave Guide', look:{ skin:'tan', polo:'gold', hat:'tan', pants:'khaki', hair:'darkbrown', hairStyle:'long', cap:false, top:'cape', gender:'male' },
    hi:['Ugh! Visitor! Welcome to the Ice Age.', 'Me Grok. Me know every cave in valley.'],
    tip:['Glacier ice slide forever. Tar pit keep ball forever. Choose.', 'Mammoths walk where they want. You wait for mammoth.'],
    bye:'Go now. Before big melt.' },
  candy:{ name:'Wendell', role:'Factory Foreman', look:{ skin:'deep', polo:'white', hat:'red', pants:'wine', hair:'black', hairStyle:'short', cap:true, hatStyle:'flat', gender:'male' },
    hi:['Hey! Welcome to Candy Works.', 'I’m Wendell. I run the floor.'],
    tip:['Chocolate on every side. Wafer bridges run on a clock.', 'Taffy grabs your ball. Watch a press go round once before you putt.'],
    bye:'Clock in. And keep your hands off the gumballs.' },
  haunted:{ name:'Count Mulligan', role:'Graveyard Keeper', look:{ skin:'porcelain', polo:'black', hat:'black', pants:'grey', hair:'white', hairStyle:'long', cap:true, hatStyle:'tophat', top:'cape', gender:'male' },
    hi:['Good evening. Welcome to Hallows Night.', 'I am Count Mulligan. I never take a second shot. Well. Almost never.'],
    tip:['Every hole here has one trick of its own. Read it and it is kind to you.', 'Beat par on a hole and I have a treat for you. Members play. Everyone may look.'],
    bye:'Do come back. They always do.' },
  harvest:{ name:'Farmer Hayes', role:'Farmer', look:{ skin:'tan', polo:'gold', hat:'tan', pants:'navy', hair:'auburn', hairStyle:'short', cap:true, hatStyle:'straw', gender:'male' },
    hi:['Howdy, and welcome to Harvest Moon!', 'I’m Farmer Hayes. This is my field.'],
    tip:['Soft ground in the furrows. Give it a little more.', 'Finish the season and there’s something special waiting.'],
    bye:'Better get going before dark!' }
};
// the pages a greeter says on the first trail of world w: who they are, how the world plays, what it pays, the hole ahead
function greetSpec(tid, w, to){
  var TR = tourOf(tid); if (TR.lab) return null; var Wd = TR.worlds[w], G = GREETERS[Wd.theme]; if (!G) return null;
  var K = TR.per || PER, Pay = PAY[TR.id] || PAY.main, L = TR.levels[to - 1], st = pload(), last = w >= TR.worlds.length - 1, rw = (Pay.worldReward || [])[w];
  var pages = G.hi.slice();
  if (!TR.members && w === 0) pages.push('Walk the trails between holes. Coins, chests and golden balls are hidden all over.');
  pages = pages.concat(G.tip);
  pages.push(K + ' holes in ' + Wd.name + '.' + (rw ? ' Clear them all for the ' + rw.replace(' (Members only)', '') + '.' : ''));
  if (!last) pages.push(worldGate(TR, w) + ' stars opens the next world.');
  pages.push('Hole ' + to + ', ' + levelName(to, tid) + ', is just up the path. Par ' + (L ? L.par : 3) + '.');
  pages.push(G.bye);
  return { theme:Wd.theme, name:G.name, role:G.role, look:G.look, lines:pages, met:(st.met || []).indexOf(Wd.theme) >= 0, col:(THEMES[Wd.theme] || {}).acc || '#F1D04A' };
}
var TRAIL_GOLD_COINS = 500;
function trailOk(){ var TT = window.RTT_PUTT_TRAIL; return !!(TT && TT.API_VERSION === 1 && v3Ok() && S && S.host && S.host.golferWalk); }
var TIPS = {
  secret:['Word is that one has a shortcut. Look around before you putt.', 'There\'s a quicker way through that one. Most folks miss it.', 'Somebody found a quicker line on that one.'],
  ferry:['The platform out there moves. Wait for it.', 'Time your putt to the moving platform.'],
  ramp:['There\'s a jump. Give it some pace.', 'Hit the ramp firm. Short won\'t clear it.', 'You\'ll need pace for the jump.'],
  loop:['There\'s a loop. Hit it firm or it rolls back.', 'Don\'t baby the loop.'],
  bridge:['The bridge goes up and down. Time it.', 'Wait for the bridge to come down.'],
  door:['Roll over the plate and the door opens.', 'Find the plate. It opens the door.'],
  slide:['Things slide across that one. Watch a cycle first.', 'Count the gaps before you putt.', 'Patience. Let the blocks go by.', 'Watch the moving stuff once. Then go.'],
  spin:['Something spins out there. Time it.', 'Let the arms swing past, then go.'],
  river:['The river carries the ball. Let it.', 'Put it in the current and let it ride.'],
  belt:['The belts carry the ball. Use them.', 'Mind which way the belts run.'],
  turn:['The floor turns. Aim for where it\'ll be.', 'That floor spins. It bends your putt.'],
  climb:['It\'s uphill. Give it more than you think.', 'There\'s a step up. Don\'t leave it short.'],
  water:['There\'s water. Don\'t get greedy.', 'Play it safe past the water.', 'Wet costs a stroke. Take the long way if you need to.'],
  ice:['The ice is quick. Ease off.', 'Go soft on the slick stuff.'],
  sand:['Stay out of the sand. It eats pace.', 'The sand stops you dead.'],
  mud:['The slow ground grabs the ball. Hit through it.', 'Give it extra on the slow stuff.', 'That patch is slow. Putt through it or around it.'],
  bump:['Use the bumpers. They kick hard.', 'Bank it. The bumpers do the work.'],
  bank:['Play it off the wall.', 'Bank it in. The straight line\'s blocked.', 'Look for the angle off the rails.'],
  ace:['You can ace it.', 'An ace is out there if you find the line.'] };
/* WHAT THE LOCAL TELLS YOU ABOUT THE HOLE AHEAD. The name and par are on the screen already, so not those: one
   thing worth knowing before you putt, read off the hole itself, each in a few wordings picked by the hole's number
   so the same piece doesn't get the same sentence every time. A hole with a secret line gets a nudge that one is
   there, never where. */
function holeTips(n, tid, three){ var C; try{ C = buildLevel(n, tid); }catch(e){ return []; }
  var mv = C.movers || [], has = function(k){ return mv.some(function(m){ return m.k === k; }); }, zm = {};
  (C.zones || []).forEach(function(z){ zm[z.m] = 1; });
  var cand = [];
  if ((C.ferries || []).length) cand.push('ferry'); if ((C.ramps || []).length) cand.push('ramp'); if ((C.loops || []).length) cand.push('loop');
  if ((C.bridges || []).length) cand.push('bridge'); if (has('door')) cand.push('door'); if (has('slide') || has('blade')) cand.push('slide');
  if (has('spin')) cand.push('spin'); if ((C.rivers || []).length) cand.push('river'); if ((C.belts || []).length) cand.push('belt');
  if ((C.turns || []).length) cand.push('turn'); if (zm[M.WATER]) cand.push('water'); if (zm[M.ICE]) cand.push('ice');
  if ((C.climbs || []).length) cand.push('climb'); if (zm[M.SAND]) cand.push('sand'); if (zm[M.MUD]) cand.push('mud');
  if ((C.bumpers || []).length >= 3) cand.push('bump'); if ((C.blocks || []).length) cand.push('bank');
  // most holes have more than one thing worth saying: which one the local picks is the hole's own, not always the first
  var out = [], h = (n * 2654435761) >>> 0, line = function(k){ var L = TIPS[k]; return L[(h >>> 3) % L.length]; };
  if ((C.secret || []).length) out.push(line('secret'));
  if (cand.length) out.push(line(cand[h % Math.min(cand.length, 2)]));
  if (out.length < 2 && three === 1) out.push(line('ace'));
  return out; }
/* THE GYMS (gyms.js, RTT_PUTT_GYMS, and a kind file a world in gymkinds/): two a world on the main tour, one mid-world and one on the trail into its last hole.
   Solving one opens its vault: GYM pay coins the first time (the world's gatekeeper pays more) and the gym's badge,
   kept in st.gym (a list, so pmerge only adds to it). A world that has its gyms has none of the small trail puzzles. */
function gymLib(){ var G = typeof window !== 'undefined' && window.RTT_PUTT_GYMS; return G && G.API_VERSION === 2 ? G : null; }
function gymAt(th, leg){ var G = gymLib(); return G ? G.at(th, leg) : null; }
function gymWorld(th){ var G = gymLib(); return !!G && G.GYMS.some(function(g){ return g.world === th; }); }
function gymsWon(st){ return (st.gym || []).slice(); }
function gymWin(id, wname){ var G = gymLib(), gd = G && G.byId(id); if (!gd) return null; var st = pload(); st.gym = st.gym || [];
  if (st.gym.indexOf(id) >= 0) return { coins:0, first:false, msg:'The vault\'s empty. You already cleaned it out.' };
  st.gym.push(id); psave(st); var n = st.gym.length;
  // said in the gym's own panel (the message below), so no toast lands over the board
  if (gd.pay > 0) coins(gd.pay, wname + ' gym', { silent:true });
  // THE VAULT PAYS A PACK (the owner, 2026-10-17): a Pro Shop pack for the world's first gym, a Tour pack for its gatekeeper
  var tier = gymPack(gd), pk = 0; try{ if (S.host.pack) pk = S.host.pack(tier, gd.name, { silent:true }) || 0; }catch(e){}
  var pname = tier === 'tour' ? 'a Tour pack' : 'a Pro Shop pack';
  return { coins:gd.pay, pack:pk ? tier : null, first:true, badge:gd.badge, n:n, msg:gd.name + ' is solved. ' + (pk ? cap(pname) + ', ' : '') + gd.pay.toLocaleString() + ' coins and the ' + gd.badge + '. That\'s ' + n + ' of ' + G.MASTER.badges + ' badges.' }; }
function gymPack(gd){ return gd && gd.keeper ? 'tour' : 'base'; }
function cap(s){ return s.charAt(0).toUpperCase() + s.slice(1); }
/* THE GATEKEEPER GUARDS THE WORLD'S LAST HOLE (the owner, 2026-10-17: story mode). The gym on the trail into a
   world's last hole must be solved before that hole is played. A hole already played stays open, and an all access
   account is never stopped. The trail itself stays open, since the gym is on it. */
function keeperFor(n, tid){ if (tid !== 'main') return null; var TR = tourOf('main'), K = TR.per || PER, w = Math.floor((n - 1) / K), Wd = TR.worlds[w];
  if (!Wd) return null; var gd = gymAt(Wd.theme, (n - 1) % K + 1); return gd && gd.keeper ? gd : null; }
function keeperBlocks(st, n, tid){ var gd = keeperFor(n, tid); if (!gd || allAccess()) return null;
  if (((st.tours[tid] || {}).best || {})[n] != null) return null; return gymsWon(st).indexOf(gd.id) < 0 ? gd : null; }
function keeperSheet(gd, n){
  var sh = el('<div class="pp-sheet"><div class="pp-card"><div class="k">HOLE ' + n + '</div><div class="t">' + esc(gd.name) + ' guards it</div>\
    <div class="m">Solve ' + esc(gd.name) + ' on the trail to play Hole ' + n + '. Its vault pays a Tour pack.</div>' +
    (S.screen === 'trail' ? '' : '<button class="pt-go pp-wide" data-walk>Walk to it</button>') + '<button class="pt-bt pp-wide" data-n>Not now</button></div></div>');
  S.ov.appendChild(sh);
  var wk = sh.querySelector('[data-walk]'); if (wk) wk.onclick = function(){ sh.remove(); walkTo(n, 'main'); };
  sh.querySelector('[data-n]').onclick = function(){ sh.remove(); }; }
/* CHEST ODDS (the owner, 2026-10-17): a chest is not always the same pile of coins. Each rolls once, the first time
   it opens, fixed by the account and the trail so a reload never rolls again: CHEST_ODDS in percent, in order. A big
   haul pays twice the chest's coins again (three times in all); an item is a common one the player does not own;
   a pack is a free Pro Shop pack. An item or pack that cannot land (a guest, or every common owned) is a big haul. */
var CHEST_ODDS = [['coins', 78], ['haul', 15], ['item', 5], ['pack', 2]], CHEST_HAUL = 2, CHEST_MIN = 300;
function chestRoll(key, id){ var r = hstr('chest:' + (cloudUid() || 'guest') + ':' + key + ':' + id) % 100, a = 0;
  for (var i = 0; i < CHEST_ODDS.length; i++){ a += CHEST_ODDS[i][1]; if (r < a) return CHEST_ODDS[i][0]; } return 'coins'; }
function chestLuck(key, id, base){ var k = chestRoll(key, id), h = S.host || {}, extra = Math.max(CHEST_MIN, (base || 0) * CHEST_HAUL);
  if (k === 'pack'){ var pk = 0; try{ pk = h.pack ? h.pack('base', 'A lucky chest') : 0; }catch(e){} if (pk) return { coins:0, msg:'A lucky chest! A free Pro Shop pack is waiting for you.' }; k = 'haul'; }
  if (k === 'item'){ var nm = null; try{ nm = h.commonItem ? h.commonItem() : null; }catch(e){} if (nm) return { coins:0, msg:'Something else in there. The ' + nm + ' is in your closet.' }; k = 'haul'; }
  if (k === 'haul') return { coins:extra, msg:'A big haul! +' + extra.toLocaleString() + ' coins on top.' };
  return { coins:0, msg:'' }; }
function trailSpec(tid, from){
  var TR = tourOf(tid), K = TR.per || PER, to = from + 1, w = Math.min(TR.worlds.length - 1, Math.floor((to - 1) / K)), th = TR.worlds[w].theme;
  var cross = from >= 1 && from % K === 0, th0 = cross ? TR.worlds[w - 1].theme : th, tp = pload().tours[TR.id];
  var portrait = (window.innerHeight || 800) >= (window.innerWidth || 400);
  var leg = (to - 1) % K + 1, st = !cross && tid === 'main' ? stopOf(th, leg) : '', kitAs = st ? th + '~' + st : null;   // the walk goes where its holes go (land.js, STOPS)
  // a world with gyms (gyms.js) carries them on its two trails and none of the small puzzles on the rest
  var gd = !cross && tid === 'main' ? gymAt(th, leg) : null;
  return { gym:gd ? gd.id : null, pzKind:gymWorld(th) && tid === 'main' ? 'none' : undefined, fine:false, smooth:fineOn({ theme:th }) && !cross, kitAs:kitAs, secret:tid === 'main' && secretAt(to) ? { i:secretAt(to) } : null, key:tid + ':' + to, tid:tid, from:from, to:to, w:w, seed:hstr('trail:' + tid + ':' + to), theme:th, theme0:th0, cross:cross, plaza:(to - 1) % K === 0, gateOpen:opened(TR, tp, to), T:THEMES[th] || THEMES.clubhouse, halfW:portrait ? 36 : 46, loot:trailLoot(tid, to), holeTo:to <= TR.levels.length ? courseFoot(to, tid) : null, holeFrom:from >= 1 ? courseFoot(from, tid) : null, greet:from % K === 0 ? greetSpec(tid, w, to) : null };
}
/* THE HOLES ON A TRAIL ARE THE REAL HOLES. The hole you just left lies behind you where the walk starts, and the
   hole you are walking to lies beyond the arch, each drawn from its own layout: its carpet, its rails, its water and
   sand, its blocks and its cup. courseFoot rasters a hole once, at the trail's own scale (trail.js draws it as
   ground), so nothing about the hole has to be known twice. Codes: 0 outside, 1 to 9 the hole's materials (M),
   10 a rail, 11 a block or bumper, 12 the cup. */
var FOOT = {};
function courseFoot(n, tid){ var key = tid + ':' + n; if (FOOT[key] !== undefined) return FOOT[key];
  try{ var C = buildLevel(n, tid), xs = C.allPts.map(function(q){ return q[0]; }), ys = C.allPts.map(function(q){ return q[1]; });
    var x0 = Math.min.apply(null, xs) - 0.5, y0 = Math.min.apply(null, ys) - 0.5, x1 = Math.max.apply(null, xs) + 0.5, y1 = Math.max.apply(null, ys) + 0.5;
    var k = Math.min(0.62, 24 / Math.max(x1 - x0, y1 - y0)), st = 0.25 / k, W = Math.ceil((x1 - x0) / st) + 1, H = Math.ceil((y1 - y0) / st) + 1, codes = new Uint8Array(W * H), RW = 0.3;
    var E = C.edges || [], BL = C.blocks || [], BU = C.bumpers || [];
    for (var j = 0; j < H; j++) for (var i = 0; i < W; i++){ var x = x0 + i * st, y = y0 + j * st, c = 0, m = C.matFn(x, y);
      for (var e = 0; e < E.length && !c; e++) if (segDist(x, y, E[e][0], E[e][1], E[e][2], E[e][3]) < RW) c = 10;
      if (!c && m){ for (var q = 0; q < BL.length && !c; q++) if (inBlock(BL[q], x, y)) c = 11;
        for (var u = 0; u < BU.length && !c; u++) if (Math.hypot(x - BU[u].x, y - BU[u].y) < BU[u].r) c = 11;
        if (!c && Math.hypot(x - C.cup[0], y - C.cup[1]) < C.cupR * 1.25) c = 12; if (!c) c = m; }
      codes[j * W + i] = c; }
    var T = C.T || {};
    return FOOT[key] = { k:k, st:st, W:W, H:H, x0:x0, y0:y0, codes:codes, cup:C.cup.slice(), tee:C.tee.slice(), n:n,
      T:{ carpet:T.carpet || '#2f8f4e', carpet2:T.carpet2 || '#2a8246', wall:T.wall || '#f4efe2', wallHi:T.wallHi || '#ffffff', block:T.wallLo || '#a99c7c', flag:T.flag || '#e53935' } };
  }catch(e){ return FOOT[key] = null; } }
// a gym's id is in it: a trail's plan is fitted round its gym's room, so another gym there is another plan
function trailKey(sp){ return sp.key + '|' + sp.halfW + '|' + (sp.gateOpen ? 1 : 0) + (sp.greet ? '|g' : '') + (sp.fine ? '|f' : '') + (sp.gym ? '|' + sp.gym : ''); }
// kept on the module, not on S, so a plan survives the mode being closed and opened again
var TRP = {};
function trailPlan(sp){ var k = trailKey(sp); if (!TRP[k]){ TRP[k] = window.RTT_PUTT_TRAIL.plan(sp); var ks = Object.keys(TRP); if (ks.length > 12) delete TRP[ks[0]]; } return TRP[k]; }
/* RENDERED TRAILS ARE KEPT, on the module and on the device. A trail is seconds of work on a phone and is the same
   picture every time, so it is rendered once: TRC holds the last few for as long as the page is open (closing the
   mode and opening it again used to render the trail it opens on from scratch, every time), and IndexedDB holds the
   last few across visits, so a player coming back tomorrow opens on a trail that is already there. TRJ is the one
   render in progress, kept here too, so leaving the mode part way through a render does not throw the work away.
   The disk copy is keyed on the trail and on the versions of the files that draw it (TRAIL_V), so a change to any
   of them renders afresh rather than showing an old picture. Every disk call fails soft: null is "render it". */
/* MEMORY (the owner, 2026-10-18: on a phone the game "gets overwhelmed and refreshes"). A rendered trail or hole holds
   its picture and its height grids, about 55 MB each, and iOS Safari reloads a tab that grows too big. So only two of
   each are kept: the one in play and the one rendered ahead. A trail left behind is still on the device (TIDB). */
var V3C_KEEP = 2;
var TRC = {}, TRJ = null, TRC_KEEP = 2, TIDB = null, TIDB_KEEP = 3, TRAIL_V = null;
function trcPut(k, pic){ TRC[k] = pic; var ks = Object.keys(TRC); if (ks.length > TRC_KEEP) delete TRC[ks[0]]; }
function trailV(){ if (TRAIL_V) return TRAIL_V;
  var v = ['putt.js', 'trail.js', 'hole3d.js', 'gyms.js'].map(function(f){ try{ var e = document.querySelector('script[src*="putt/' + f + '"]'), m = e && /[?&]v=([^&]+)/.exec(e.src); return m ? m[1] : '?'; }catch(e){ return '?'; } });
  // PXHD lives in the page, which has no version of its own: its palette is what reaches the picture, so a few ramps stand in
  try{ var R = window.PXHD.ramp; v.push(hstr(['#3a8f4e', '#c08a4e', '#f4efe2', '#2f86c8'].map(function(c){ return R(c).join(); }).join('|'))); }catch(e){ v.push('?'); }
  return TRAIL_V = v.join('.') + '.' + (window.RTT_PUTT_FX === 'off' ? 0 : 1); }
function tidb(){ if (TIDB) return TIDB;
  TIDB = new Promise(function(res){ try{ if (!window.indexedDB) return res(null); var q = indexedDB.open('rtt_putt_trails', 1);
    q.onupgradeneeded = function(){ try{ q.result.createObjectStore('t'); }catch(e){} }; q.onsuccess = function(){ res(q.result); }; q.onerror = q.onblocked = function(){ res(null); }; }catch(e){ res(null); } });
  return TIDB; }
function tidbGet(k){ var H3 = window.RTT_PUTT_3D; if (!H3 || !H3.unpack) return Promise.resolve(null);
  return tidb().then(function(db){ if (!db) return null; return new Promise(function(res){ try{ var q = db.transaction('t', 'readonly').objectStore('t').get(k + '@' + trailV());
    q.onsuccess = function(){ var pic = null; try{ pic = q.result ? H3.unpack(q.result.d) : null; }catch(e){ pic = null; } res(pic); }; q.onerror = function(){ res(null); }; }catch(e){ res(null); } }); }).catch(function(){ return null; }); }
function tidbPut(k, pic){ var H3 = window.RTT_PUTT_3D; if (!H3 || !H3.pack || !pic || !pic.raw) return;
  var later = window.requestIdleCallback || function(f){ return setTimeout(f, 1200); };
  later(function(){ tidb().then(function(db){ if (!db) return; var d = null; try{ d = H3.pack(pic); }catch(e){ d = null; } if (!d) return;
    try{ var tx = db.transaction('t', 'readwrite'), os = tx.objectStore('t'), key = k + '@' + trailV(); os.put({ d:d, at:Date.now() }, key);
      // keep the newest few: the oldest go, and so does anything written by an older version of the files
      var all = os.getAllKeys(); all.onsuccess = function(){ var ks = (all.result || []).filter(function(x){ return x !== key; }), stale = ks.filter(function(x){ return String(x).split('@')[1] !== trailV(); });
        stale.forEach(function(x){ os.delete(x); }); var keep = ks.filter(function(x){ return stale.indexOf(x) < 0; });
        if (keep.length >= TIDB_KEEP){ var ages = {}, n0 = keep.length; keep.forEach(function(x){ var g = os.get(x); g.onsuccess = function(){ ages[x] = g.result ? g.result.at : 0;
          if (--n0 === 0) keep.sort(function(a, c){ return ages[a] - ages[c]; }).slice(0, keep.length - (TIDB_KEEP - 1)).forEach(function(x2){ os.delete(x2); }); }; }); } }; }catch(e){} }); }, { timeout:4000 }); }
// a trail finished rendering: kept here, and on the device
function trailDone(k, out){ trcPut(k, out); if (out) tidbPut(k, out); }
// render the trail out of this hole while the hole is played (frame() calls trailTick), a few ms a frame; a copy on the device is used instead
function trailAhead(tid, from){
  try{ var TR = tourOf(tid); if (!trailOk() || from >= TR.levels.length || from < 0) return; var sp = trailSpec(tid, from), k = trailKey(sp);
    if (TRC[k] !== undefined || (TRJ && TRJ.k === k)) return;
    var P = trailPlan(sp), J = TRJ = { k:k, step:window.RTT_PUTT_TRAIL.slices(P) };
    tidbGet(k).then(function(pic){ if (pic && TRJ === J){ TRJ = null; trcPut(k, pic); } }); }catch(e){ TRJ = null; } }
function trailTick(ms){ var J = TRJ; if (!J || S.v3job) return;
  // while aiming a little a frame; once the hole is over and the result is up, nothing else is moving, so more
  var P = S.play; if (P && ((P.state !== 'aim' && P.state !== 'done') || S.held)) return; if (P && P.state === 'done') ms = 10;
  var out = null; try{ out = J.step(ms || 4); }catch(e){ if (TRJ === J) TRJ = null; TRC[J.k] = null; return; }
  if (out){ if (TRJ === J) TRJ = null; trailDone(J.k, out); } }
function stopTrail(){ if (S && S.trailCtl){ try{ S.trailCtl.stop(); }catch(e){} S.trailCtl = null; } if (S) cancelAnimationFrame(S.trraf); }
function goldenOf(st, tid, w){ var TR = tourOf(tid), K = TR.per || PER, have = 0, tr = st.trail || {};
  for (var n = w * K + 1; n <= Math.min(TR.levels.length, w * K + K); n++) if (tr[tid + ':' + n] && tr[tid + ':' + n].g) have++;
  return { have:have, total:Math.min(TR.levels.length, w * K + K) - w * K }; }
function openTrail(tid, from){
  var TR = tourOf(tid), N = TR.levels.length; if (from >= N) return showHub(tid);
  stopTrail(); cancelAnimationFrame(S.raf); clearInterval(S.tick); S.play = null; S.screen = 'trail';
  var sp = trailSpec(tid, from), k = trailKey(sp), to = sp.to, L = TR.levels[to - 1], Wd = TR.worlds[sp.w];
  S.trailTo = { tid:tid, to:to };
  var b0 = balStr(), wlab = TR.lab ? 'Lab' : TR.members ? 'Members Tour' : 'World ' + (sp.w + 1), seen = S.wban === TR.id + ':' + sp.w;
  // walking up to a world still under cloud: nothing on screen names it or its hole until the door opens on it
  var clouded = sp.cross && !revealed(TR, sp.w); if (clouded) seen = true; else S.wban = TR.id + ':' + sp.w;
  function goalHtml(){ return clouded ? '<i>' + esc(wlab) + ' · ' + CLOUD_NAME + '</i><b>Hole ' + to + ' · Beyond the clouds</b>' : '<i>' + esc(wlab) + ' · ' + esc(Wd.name) + '</i><b>Hole ' + to + ' · ' + esc(levelName(to, tid)) + ' · Par ' + (L ? L.par : 3) + '</b>'; }
  function banHtml(){ return '<div class="pp-wban" style="--wa:' + ((THEMES[Wd.theme] || {}).acc || '#F1D04A') + '"><i>' + esc(wlab) + '</i><b>' + esc(Wd.name) + '</b><span>' + esc((Wd.haz || []).join(' · ')) + '</span></div>'; }
  S.ov.innerHTML = '<div class="pp-trail pp-wv" data-wv="' + (clouded ? sp.theme0 : Wd.theme) + '">' + hdr((b0 !== '' ? '<span class="pp-cpill" data-bal>' + b0 + '</span>' : '') + '<button class="pp-mapb" data-mapb aria-label="Open the map"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 4l5-2 6 2 5-2v14l-5 2-6-2-5 2z" fill="#f6ead2" stroke="#3a2a14" stroke-width="1.6" stroke-linejoin="round"/><path d="M7 2v14M13 4v14" stroke="#3a2a14" stroke-width="1.4"/><circle cx="10" cy="9" r="1.8" fill="#e5483a"/></svg><b>Map</b></button>') +
    '<div class="pp-tbox" data-tbox></div>' +
    '<div class="pp-tgoal">' + goalHtml() + '</div>' +
    '<button class="pp-bagb" data-dly aria-label="Today\'s Daily Hole">Daily</button>' +
    (TR.id === 'main' ? '<button class="pp-bagb" data-bag aria-label="Your Bag">Bag</button>' : '') + '<button class="pp-bagb pp-closb" data-closet aria-label="Your closet">Closet</button>' +
    (seen ? '' : banHtml()) + '</div>';
  S.ov.querySelector('[data-x]').onclick = close;
  S.ov.querySelector('[data-mapb]').onclick = function(){ stopTrail(); showHub(tid); };
  var bgw = S.ov.querySelector('[data-bag]'); if (bgw) bgw.onclick = bagSheet;
  var clw = S.ov.querySelector('[data-closet]'); if (clw) clw.onclick = closetSheet;
  // today's Daily Hole, straight from the trail (or its result, once played); it ends on the map, as the map's own Daily card does
  var dyw = S.ov.querySelector('[data-dly]'); if (dyw) dyw.onclick = function(){ stopTrail(); startDaily(); };
  // the world's title card holds while the world loads, and leaves once you are standing in it
  var wbn = S.ov.querySelector('.pp-wban'); function banOut(){ if (wbn) setTimeout(function(){ if (wbn.isConnected) wbn.classList.add('out'); setTimeout(function(){ if (wbn.isConnected) wbn.remove(); }, 700); }, 2200); }
  var box = S.ov.querySelector('[data-tbox]'), P = trailPlan(sp);
  var pic = TRC[k];
  function go(pic){ if (!S || S.screen !== 'trail' || !box.isConnected) return;
    if (!pic){ return walkFlat(from, tid); }
    setTimeout(function(){ if (S && S.screen === 'trail') holeAhead(tid, to); }, 1200);
    var st0 = pload(), rec0 = (st0.trail || {})[sp.key] || {};
    var three = L ? threeOf(L) : null; banOut();
    S.trailCtl = window.RTT_PUTT_TRAIL.run(box, P, pic, {
      host:S.host, found:JSON.parse(JSON.stringify(rec0)), guestCoins:isGuest() ? GUEST_COINS : null, holeLabel:'Hole ' + to, greetDelay:wbn ? 2700 : 400, clouds:clouded,
      skipLabel:sp.cross && !sp.gateOpen ? 'Map' : 'Play hole ' + to,
      secret:sp.secret ? function(i, resume){ secretFound(i, resume, from); } : null,
      pick:function(kind, id, n){ var st = pload(); st.trail = st.trail || {}; var r = st.trail[sp.key] = st.trail[sp.key] || {}, msg = '';
        if (kind === 'coin'){ r.c = r.c || []; if (r.c.indexOf(id) < 0) r.c.push(id); else n = 0; }
        else if (kind === 'brk'){ r.b = r.b || []; if (r.b.indexOf(id) < 0) r.b.push(id); else n = 0; }
        else if (kind === 'chest'){ var cn = n; n = 0; r.ch = r.ch || []; if (r.ch.indexOf(id) < 0){ r.ch.push(id); hq('ppChests', 1); var lk = chestLuck(sp.key, id, cn); msg = lk.msg; n = lk.coins; } }   // its coins are picked up off the ground; n is what they come to, and the roll may add to it
        else if (kind === 'key') r.key = 1;
        else if (kind === 'pz') r.pz = 1;   // the trail's puzzle is solved; its coin bonus comes out of its chest as coins
        else if (kind === 'life'){ r.life = 1; st.bank = st.bank || []; if (st.bank.indexOf(sp.loot.life.id) < 0) st.bank.push(sp.loot.life.id);
          // below the max it goes straight into the hearts (spareFill, once this pick is saved); full, it is kept
          msg = st.lives != null && st.lives < livesMax() ? 'A spare life. It went straight into your hearts.' : 'A spare life. Your hearts are full, so it\'s saved. It fills the next one you lose.'; }
        else if (kind === 'trinket'){ r.tk = 1; var tk = sp.loot.trinket; st.tk = st.tk || []; if (st.tk.indexOf(tk.id) < 0) st.tk.push(tk.id);
          var th = tk.id.split(':')[0], got = st.tk.filter(function(x){ return x.split(':')[0] === th; }).length, rt = 'Trinket Set: ' + Wd.name;
          msg = 'Found the ' + tk.name + '. ' + got + ' of 3 from ' + Wd.name + '.';
          if (got >= 3 && st.rewards.indexOf(rt) < 0){ st.rewards.push(rt); n = TRINKET_SET_COINS; msg += ' Set complete: +' + TRINKET_SET_COINS + ' coins.'; } }
        else if (kind === 'part'){ r.pt = 1; var pa = sp.loot.part; st.pp = st.pp || { parts:[] }; st.pp.parts = st.pp.parts || []; if (st.pp.parts.indexOf(pa.id) < 0) st.pp.parts.push(pa.id);
          var have = partsOf(st, pa.putter), PT = PP_PUTTERS.filter(function(q){ return q.id === pa.putter; })[0];
          msg = 'A putter part: the ' + pa.name + '. ' + have + ' of 3.';
          if (have >= 3){ if (!st.pp.eq) st.pp.eq = pa.putter; var inCl = false; try{ inCl = S.host.grantPutter && S.host.grantPutter(pa.putter); }catch(e){}
            msg = 'The ' + PT.name + ' is built. ' + PT.tells + (S.host.grantPutter ? ' It is in your closet.' : ' It is in your Bag.'); } }
        else if (kind === 'golden'){ var was = !!r.g; r.g = 1; var gd = goldenOf(st, tid, sp.w), done = gd.have >= gd.total, rw = 'Golden Ball Set: ' + Wd.name;
          msg = 'Golden ball. ' + gd.have + ' of ' + gd.total + ' in ' + Wd.name + '.';
          if (done && !was && st.rewards.indexOf(rw) < 0){ st.rewards.push(rw); n = TRAIL_GOLD_COINS; msg += ' Set complete: +' + TRAIL_GOLD_COINS + ' coins.'; } }
        psave(st); if (n > 0) coins(n, TR.name + ' trail'); if (kind === 'life') spareFill(); return msg; },
      golden:function(){ return goldenOf(pload(), tid, sp.w); },
      gym:function(id){ return gymWin(id, Wd.name); }, gymSolved:function(id){ return gymsWon(pload()).indexOf(id) >= 0; },
      portrait:function(look){ try{ var c = S.host.portrait && S.host.portrait(look); return c && c.toDataURL ? c.toDataURL() : ''; }catch(e){ return ''; } },
      met:function(th){ var st = pload(); st.met = st.met || []; if (st.met.indexOf(th) < 0){ st.met.push(th); psave(st); } if (sp.greet) sp.greet.met = true; },
      secretSeen:function(i){ return (pload().sf || []).indexOf(i) >= 0; },
      lines:function(){ return clouded || !L ? [] : holeTips(to, tid, three); },
      door:function(cb){ var tp = pload().tours[TR.id], open = opened(TR, tp, to), gw = sp.w - 1, have = starsThrough(tp, TR, gw), need = worldGate(TR, gw), T = THEMES[Wd.theme] || {};
        // the stars are there: this is where the clouds part, and the world gets its name
        var hide = clouded && !open; if (clouded && open){ reveal(TR, sp.w); }
        var door = el('<div class="pp-door" data-door="' + (hide ? 'clouds' : Wd.theme) + '" style="--da:' + (hide ? '#cfd9e8' : T.acc || '#F1D04A') + ';--db:' + (hide ? '#4a5a72' : T.bg || '#20302a') + ';--dc:' + (hide ? '#6d7f99' : T.bg2 || '#34483e') + '">\
          <div class="pp-dl"></div><div class="pp-dr"></div>\
          <div class="pp-dlock"><i>' + (TR.members ? 'Members Tour' : 'World ' + (sp.w + 1)) + '</i><b>' + esc(hide ? CLOUD_NAME : Wd.name) + '</b>\
            <span class="pp-dbar"><u style="--f:' + Math.min(1, have / Math.max(1, need)) + '"></u></span><em>★ ' + have + ' / ' + need + '</em>\
            <small>' + (open ? (clouded ? 'The clouds part' : esc(DOOR_NAMES[Wd.theme] || 'The door') + ' opens') : 'Need ' + (need - have) + ' more ★ · replay holes to earn them') + '</small></div></div>');
        var cb0 = cb; cb = function(o){ cb0(o); if (o && clouded){ clouded = false; var gl = S.ov.querySelector('.pp-tgoal'); if (gl) gl.innerHTML = goalHtml();
          var tr = S.ov.querySelector('.pp-trail'); if (tr){ tr.setAttribute('data-wv', Wd.theme); var bn = el(banHtml()); tr.appendChild(bn); S.wban = TR.id + ':' + sp.w;
            setTimeout(function(){ if (bn.isConnected) bn.classList.add('out'); setTimeout(function(){ if (bn.isConnected) bn.remove(); }, 700); }, 2600); } } };
        S.ov.appendChild(door);
        requestAnimationFrame(function(){ door.classList.add('in'); setTimeout(function(){ if (!door.isConnected) return; door.classList.add('fill');
          setTimeout(function(){ if (!door.isConnected) return; door.classList.add(open ? 'open' : 'shut');
            setTimeout(function(){ door.classList.remove('in'); setTimeout(function(){ if (door.isConnected) door.remove(); cb(open); }, 380); }, open ? 900 : 1700); }, 1000); }, 400); }); },
      arrive:function(){ var tp = pload().tours[TR.id], sw = S.ov.querySelector('.pp-skipw'); if (sw) sw.remove();
        // a walker without the pass reaches the hole and is asked, over the trail they are standing on
        if (TR.members && !membersCanPlay()){ stopTrail(); return membersSheet({ n:to, trail:true }); }
        if (TR.id === 'main' && guestAsks(tid, to)){ stopTrail(); return guestSheet(to, tid); }
        stopTrail(); if (opened(TR, tp, to)) startLevel(to, tid); else showHub(tid); },
      // Skip keeps its button, and says what it leaves behind first: the same list the map's warning reads, off
      // the record as it stands now, so anything already picked up on this walk is not named.
      skip:function(){ var tp = pload().tours[TR.id], play = opened(TR, tp, to) && !(sp.cross && !sp.gateOpen);
        function leave(){ stopTrail(); if (TR.id === 'main' && guestAsks(tid, to)) return guestSheet(to, tid); if (play) startLevel(to, tid); else showHub(tid); }
        var left = trailLeft(tid, to); if (!left.length || S.ov.querySelector('.pp-skipw')) return leave();
        var list = left.length === 1 ? left[0] : left.slice(0, -1).join(', ') + ' and ' + left[left.length - 1];
        var sh = el('<div class="pp-sheet pp-skipw"><div class="pp-card"><div class="k">SKIP THE TRAIL?</div><div class="t">Bonus rewards</div><div class="m">This trail still has ' + esc(list) + '. Skip it and ' + (left.length > 1 ? 'they are' : 'it is') + ' gone.</div><button class="pt-go pp-wide" data-n>Keep walking</button><button class="pt-bt pp-wide" data-skip>' + (play ? 'Skip to Hole ' + to : 'Skip to the map') + '</button></div></div>');
        S.ov.appendChild(sh);
        sh.querySelector('[data-n]').onclick = function(){ sh.remove(); };
        sh.querySelector('[data-skip]').onclick = function(){ sh.remove(); leave(); }; },
      sfx:function(k){ try{ S.host.sfx && S.host.sfx(k === 'coin' ? 'coin' : k); }catch(e){} }
    });
  }
  if (pic !== undefined) return go(pic);
  // not rendered yet: say so, and render it at full pace behind a bar
  box.innerHTML = '<div class="pp-tload"><b>Walking out to hole ' + to + '</b><span><u></u></span></div>';
  // a job already under way for this trail carries on where it was (it is kept on the module, so leaving and coming
  // back loses nothing), and the device's copy, if it has one, takes over the moment it answers
  var bar = box.querySelector('u'), J = (TRJ && TRJ.k === k) ? TRJ : (TRJ = { k:k, step:window.RTT_PUTT_TRAIL.slices(P) }), n0 = 0, landed = false;
  function land(out){ if (landed || !S || S.screen !== 'trail' || !box.isConnected) return; landed = true; cancelAnimationFrame(S.trraf); box.innerHTML = ''; go(out); }
  tidbGet(k).then(function(pic){ if (!pic || landed) return; if (TRJ === J) TRJ = null; trcPut(k, pic); land(pic); });
  (function stepIt(){ if (landed || !S || S.screen !== 'trail' || !box.isConnected) return; var out = null; try{ out = J.step(14); }catch(e){ if (TRJ === J) TRJ = null; TRC[k] = null; return land(null); }
    n0++; if (bar) bar.style.width = Math.min(96, 8 + n0 * 2.4) + '%';
    if (out){ if (TRJ === J) TRJ = null; trailDone(k, out); return land(out); } S.trraf = requestAnimationFrame(stepIt); })();
}
function walkTo(n, tid){
  var TR = tourOf(tid), N = TR.levels.length;
  if (n >= N) return showHub(tid);
  var reduce = false; try{ reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){}
  if (!reduce && trailOk()) return openTrail(tid, n);
  return walkFlat(n, tid);
}
/* reduced motion, or no 3D golfer: the short walk the flat golfer took before (a tap skips it) */
function walkFlat(n, tid){
  var TR = tourOf(tid), K = TR.per || PER, N = TR.levels.length;
  if (n >= N) return showHub(tid);
  showHub(tid);
  var hub = S.ov.querySelector('.pp-hub'), box = S.ov.querySelector('[data-map]'), me = S.ov.querySelector('.pp-me'), pos = S.mapPos, k = S.mapK || 1;
  var tp = pload().tours[TR.id], open = opened(TR, tp, n + 1), cross = n % K === 0, w = Math.floor(n / K), Wd = TR.worlds[w];
  var reduce = false; try{ reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){}
  if (!hub || !box || !me || !pos || !pos[n]){ if (open) startLevel(n + 1, tid); return; }
  if (reduce && !cross){ if (open) startLevel(n + 1, tid); return; }
  hub.classList.add('pp-walking'); me.classList.add('walk');
  var a = pos[n - 1], b = pos[n], token = S.walkTok = {}, done = false, door = null;
  function at(f){ var x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f;
    box.scrollTop = Math.max(0, y * k - box.clientHeight * 0.55);
    me.style.left = x + 'px'; me.style.top = (y - 6) + 'px'; me.classList.toggle('flip', b[0] < a[0]); }
  function alive(){ return S && S.walkTok === token && box.isConnected; }
  function finish(){ if (done || !alive()) return; done = true; S.walkTok = null; S.ov.removeEventListener('pointerdown', skip, true);
    if (open) return startLevel(n + 1, tid);
    hub.classList.remove('pp-walking'); me.classList.remove('walk');
    if (door) setTimeout(function(){ if (door && door.isConnected) door.remove(); }, 2600); }
  function skip(e){ if (e.target.closest && e.target.closest('[data-x]')) return; e.preventDefault(); e.stopPropagation();
    if (door && !open){ door.classList.add('fill', 'shut'); } finish(); }
  S.ov.addEventListener('pointerdown', skip, true);
  function ease(u){ var r = 0.18; if (u < r) return u * u / (2 * r * (1 - r)); if (u > 1 - r) return 1 - (1 - u) * (1 - u) / (2 * r * (1 - r)); return (u - r / 2) / (1 - r); }
  function tween(f0, f1, ms, then){ var t0 = performance.now(); (function step(){ if (!alive() || done) return; var u = Math.min(1, (performance.now() - t0) / ms);
      at(f0 + (f1 - f0) * ease(u)); if (u < 1) requestAnimationFrame(step); else then(); })(); }
  at(0);
  if (!cross) return tween(0, 1, 2100, finish);
  var gw = w - 1, have = starsThrough(tp, TR, gw), gate = worldGate(TR, gw), T = THEMES[Wd.theme] || {}, hide = !open && !revealed(TR, w);
  if (open) reveal(TR, w);
  door = el('<div class="pp-door" data-door="' + (hide ? 'clouds' : Wd.theme) + '" style="--da:' + (hide ? '#cfd9e8' : T.acc || '#F1D04A') + ';--db:' + (hide ? '#4a5a72' : T.bg || '#20302a') + ';--dc:' + (hide ? '#6d7f99' : T.bg2 || '#34483e') + '">\
    <div class="pp-dl"></div><div class="pp-dr"></div>\
    <div class="pp-dlock"><i>' + (TR.members ? 'Members Tour' : 'World ' + (w + 1)) + '</i><b>' + esc(hide ? CLOUD_NAME : Wd.name) + '</b>\
      <span class="pp-dbar"><u style="--f:' + Math.min(1, have / Math.max(1, gate)) + '"></u></span><em>★ ' + have + ' / ' + gate + '</em>\
      <small>' + (open ? esc(DOOR_NAMES[Wd.theme] || 'The door') + ' opens' : 'Need ' + (gate - have) + ' more ★ · replay holes to earn them') + '</small></div></div>');
  tween(0, 0.5, reduce ? 1 : 1260, function(){ if (!alive()) return; hub.appendChild(door);
    requestAnimationFrame(function(){ door.classList.add('in'); setTimeout(function(){ if (!alive()) return; door.classList.add('fill');
      setTimeout(function(){ if (!alive()) return; door.classList.add(open ? 'open' : 'shut');
        setTimeout(function(){ if (!alive()) return; if (open) tween(0.5, 1, reduce ? 1 : 1150, finish); else finish(); }, open ? 900 : 1500); }, 1000); }, reduce ? 50 : 450); }); });
}
/* ------------------------------------------------------------------------------ out of lives */
function outOfLives(){
  var st = pload(), sh = el('<div class="pp-sheet pp-oolf">' + hdr() + '<div class="pp-oolb"><div class="k">OUT OF LIVES</div><div class="pp-lives">' + hearts(st) + '</div>\
    <div class="lbl">Next life in</div><div class="pp-big" data-c>' + hms((st.refillAt || Date.now()) - Date.now()) + '</div>\
    <div class="m">Each life comes back 24 hours after you lost it. The clocks keep running while you are away.</div>\
    ' + (membersOpen() ? '' : '<div class="pp-x2b"><i class="pp-x2h">' + heartSvg(PER_HEART) + '</i><b>Double your lives</b>The Tour Pass gives you ' + LIVES_PASS + ' lives, not ' + LIVES_FREE + '. It opens the Members Tour too.</div>\
    <button class="pt-go pp-wide pass" data-pass>Get Tour Pass<small>' + LIVES_PASS + ' lives</small></button>') +
    buyRow(st) +
    // spares fill the hearts on their own (spareFill), so this shows only when the server could not take one
    (bankHeld(st) && livesNow(st) <= 0 ? '<button class="pt-go pp-wide" data-spare>Use a spare life<small>' + bankHeld(st) + ' saved from the trails</small></button>' : '') +
    (S.host.tester && S.host.tester() ? '<button class="pt-bt pp-wide" data-free>Tester refill · free</button>' : '') +
    '<button class="pt-bt pp-wide" data-wait>Wait it out</button><div class="m">The Daily Hole never uses a life.</div></div></div>');
  S.ov.appendChild(sh);
  var c = sh.querySelector('[data-c]'), iv = setInterval(function(){ if (!sh.isConnected) return clearInterval(iv); var s2 = pload(); if (livesNow(s2) > 0 || !s2.refillAt){ clearInterval(iv); sh.remove(); showHub(); return; } if (s2.lsrv && Date.now() >= s2.refillAt && !sh._ask){ sh._ask = 1; livesSync().then(function(){ sh._ask = 0; }); } c.textContent = hms(s2.refillAt - Date.now()); }, 1000);
  sh.querySelector('[data-wait]').onclick = function(){ sh.remove(); };
  sh.querySelector('[data-x]').onclick = function(){ sh.remove(); };
  var spb = sh.querySelector('[data-spare]'); if (spb) spb.onclick = function(){ var s2 = pload(); if (!bankHeld(s2)) return; s2.bused = (s2.bused || 0) + 1; psave(s2); clearInterval(iv); sh.remove(); showHub(); };
  wireBuy(sh);
  var fr = sh.querySelector('[data-free]'); if (fr) fr.onclick = function(){ var s2 = pload(); s2.lives = livesMax(); s2.back = []; s2.refillAt = null; s2.lt = Date.now(); psave(s2); livesCall('putt_lives_refill'); sh.remove(); showHub(); };
}

/* THE PAID LIVES are offered at any time, full or not, up to the cap on extra lives over the max (past it the server
   answers lives_full). A guest is sent to sign in, since bought lives are the account's. The page leaves for Stripe,
   and comes back to /golf/?putt=lives_paid, where the host asks for lives again (RTT_PUTT.livesRefresh). */
function canBuyLives(st, p){ var h = hostOf(); return PUTT_LIVES_ENABLED && !!h.buyLives && (st.lives || 0) + p.lives - livesMax() <= LIVES_EXTRA_MAX; }
function buyRow(st){ var any = LIVES_BUY.some(function(p){ return canBuyLives(st, p); });
  return LIVES_BUY.map(function(p){ return canBuyLives(st, p) ? '<button class="pt-go pp-wide" data-buy="' + p.pack + '">' + buyLabel(p) + (p.tag ? '<small>' + p.tag + '</small>' : '') + '</button>' : ''; }).join('') +
    (any ? '<div class="m" data-buym hidden></div>' : ''); }
function wireBuy(sh){ sh.querySelectorAll('[data-buy]').forEach(function(bb){ bb.onclick = function(){ buyLives(sh, bb, bb.getAttribute('data-buy')); }; }); }
/* THE LIVES SHEET, opened by tapping the hearts anywhere in Putt Putt: what is held, the next life's clock, the buttons. */
function livesSheet(){ if (S.ov.querySelector('.pp-livesh')) return; var st = pload(), n = livesNow(st);
  var sh = el('<div class="pp-sheet pp-livesh"><div class="pp-card"><div class="k">LIVES</div><div class="pp-lives">' + hearts(st) + '</div>\
    <div class="t">' + n + (n === 1 ? ' life' : ' lives') + '</div>' +
    (st.refillAt ? '<div class="m">Next life back in ' + hms(st.refillAt - Date.now()) + '.</div>' : '') +
    (bankHeld(st) ? '<div class="m">' + bankHeld(st) + ' spare ' + (bankHeld(st) === 1 ? 'life' : 'lives') + ' banked from the trails.</div>' : '') +
    buyRow(st) + '<button class="pt-bt pp-wide" data-n>Close</button></div></div>');
  S.ov.appendChild(sh); wireBuy(sh); sh.querySelector('[data-n]').onclick = function(){ sh.remove(); }; }
function buyLives(sh, b, pack){
  if (isGuest()){ var h = S.host; sh.remove(); close(); try{ h.signIn('signin'); }catch(e){} return; }
  var m = sh.querySelector('[data-buym]'), bs = sh.querySelectorAll('[data-buy]'),
      say = function(t){ if (m){ m.textContent = t; m.hidden = false; } bs.forEach(function(x){ x.disabled = false; }); };
  bs.forEach(function(x){ x.disabled = true; });
  Promise.resolve(S.host.buyLives(pack)).then(function(d){
    if (d && d.url){ location.href = d.url; return; }
    say(d && d.error === 'lives_full' ? 'You hold all the extra lives you can. Play some first.' : 'Checkout did not start. Try again.');
  }, function(){ say('Checkout did not start. Try again.'); });
}

/* ---------------------------------------------------------------------------- a Tour level */
/* STARTING A HOLE FROM THE MAP SKIPS THE WALK TO IT, and the walk is where the chest, the golden ball and the rare
   things are. So when the trail to this hole still holds anything, the map says what is being left behind and offers
   the walk instead. Nothing is lost for good: the trail and what is on it wait for the next time you walk it. */
function trailLeft(tid, n){ try{ if (tid !== 'main' || n < 2 || !trailOk()) return []; var sp = trailSpec(tid, n - 1), P = trailPlan(sp), r = (pload().trail || {})[sp.key] || {};
    var NAME = { chest:'a chest of coins', golden:'a golden ball', trinket:'a trinket', part:'a putter part', life:'a spare life', prize:'a puzzle', vault:'a gym' }, won = gymsWon(pload());
    return P.items.filter(function(t){ if (!NAME[t.k]) return false;
      if (t.k === 'chest') return (r.ch || []).indexOf(t.id) < 0 && !(t.main && r.k); if (t.k === 'golden') return !r.g; if (t.k === 'trinket') return !r.tk; if (t.k === 'part') return !r.pt; if (t.k === 'life') return !r.life; if (t.k === 'prize') return !r.pz; if (t.k === 'vault') return won.indexOf(t.gym) < 0; return false; })
      .map(function(t){ return t.k === 'trinket' && t.name ? 'the ' + t.name : t.k === 'part' && t.name ? 'the ' + t.name : NAME[t.k]; }); }catch(e){ return []; } }
function skipWarn(n, tid){ var st = pload(), c = st.cur, tr = (st.tours || {})[tid] || {};
  // only a hole being reached for the first time can forfeit anything: its trail is gone once it is beaten. A gate
  // that would refuse the hole anyway (a guest, the Members Tour, no lives) speaks first, from startLevel.
  if ((c && c.tid === tid && c.n === n && c.s > 0) || (tr.best && tr.best[n] != null) || (guestAsks(tid, n) && !tourOf(tid).lab) || livesNow(st) <= 0) return startLevel(n, tid);
  var left = trailLeft(tid, n); if (!left.length) return startLevel(n, tid);
  var list = left.length === 1 ? left[0] : left.slice(0, -1).join(', ') + ' and ' + left[left.length - 1];
  var sh = el('<div class="pp-sheet pp-skipw"><div class="pp-card"><div class="k">SKIP THE WALK?</div><div class="t">Hole ' + n + '</div><div class="m">The trail to Hole ' + n + ' still has ' + esc(list) + '. Skip it and ' + (left.length > 1 ? 'they are' : 'it is') + ' gone.</div><button class="pt-go pp-wide" data-walk>Walk to Hole ' + n + '</button><button class="pt-bt pp-wide" data-skip>Play now and forfeit the rewards</button><button class="pt-bt pp-wide" data-n>Cancel</button></div></div>');
  S.ov.appendChild(sh);
  sh.querySelector('[data-n]').onclick = function(){ sh.remove(); };
  sh.querySelector('[data-walk]').onclick = function(){ sh.remove(); openTrail(tid, n - 1); };
  sh.querySelector('[data-skip]').onclick = function(){ sh.remove(); startLevel(n, tid); }; }
/* A SECRET FOUND: walking into the doorway marks it found (st.sf, a list that only grows) and offers the hole.
   Keep walking hands the walk back. A secret not yet found cannot be started from anywhere. */
function secretFound(i, resume, from){ var st = pload(); st.sf = st.sf || []; var first = st.sf.indexOf(i) < 0; if (first){ st.sf.push(i); psave(st); }
  var won = !!((st.tours.secret || {}).paid || {})[i], n = st.sf.length;
  try{ S.host.sfx && S.host.sfx(first ? 'holeGood' : 'tap'); }catch(e){}
  var sh = el('<div class="pp-sheet"><div class="pp-card"><div class="k">' + (first ? 'SECRET HOLE FOUND' : 'SECRET HOLE') + '</div><div class="t">' + esc(SECRETS[i - 1].name) + '</div>\
    <div class="m">' + (first ? 'You found a way in. Secrets found: ' + n + ' of ' + SECRETS.length + '.' : won ? 'Back again. You have beaten this one.' : 'Back again. Still waiting to be beaten.') + '</div>\
    <div class="m">Free to play. ' + (won ? 'Coins land the first time only.' : 'Beat it for ' + PAY.secret.hole + ' coins.') + '</div>\
    <button class="pt-go pp-wide" data-y>Play it</button><button class="pt-bt pp-wide" data-n>Keep walking</button></div></div>');
  S.ov.appendChild(sh); sh.querySelector('[data-n]').onclick = function(){ sh.remove(); resume(); };
  sh.querySelector('[data-y]').onclick = function(){ sh.remove(); S.secretFrom = from; startLevel(i, 'secret'); }; }
function secretsFound(st){ return (st.sf || []).filter(function(i){ return i >= 1 && i <= SECRETS.length; }); }
function startLevel(n, tid){
  var st = pload(); tid = tid || S.tour || 'main';
  if (tourOf(tid).members && !membersCanPlay()) return membersSheet({ n:n, trail:S.screen === 'trail' });
  if (tourOf(tid).lab && !labOpen()) return showHub('main');
  if (tourOf(tid).secret && secretsFound(st).indexOf(n) < 0 && !allAccess()) return showHub('main');
  if (guestAsks(tid, n) && !tourOf(tid).lab && !tourOf(tid).members) return guestSheet(n, tid);   // a guest plays hole 1 of the Tour and no other
  var c = st.cur, back = c && c.tid === tid && c.n === n && c.s > 0;
  // STORY MODE: a hole not yet reached never starts, from any door (the map already refuses it; this is the backstop)
  var TRo = tourOf(tid); if (!back && !TRo.lab && !TRo.secret && !opened(TRo, (st.tours || {})[tid], n)) return showHub(tid);
  var kp = !back && keeperBlocks(st, n, tid); if (kp) return keeperSheet(kp, n);
  if (c && !back){ clearCur(st); psave(st); }   // only a hole in progress on another device can be left this way
  if (!back && livesNow(st) <= 0 && !tourOf(tid).lab && !tourOf(tid).secret && !allAccess()) return outOfLives();
  var d = tourDesc(n, S.host, tid), TRs = tourOf(tid);
  if (!TRs.secret) reveal(TRs, Math.floor((n - 1) / (TRs.per || PER)));   // standing in a world is seeing it
  S.round = { mode:'ppt', lv:n, tid:tid, i:0, cards:[], holes:[d], title:levelName(n, tid) };
  stopTrail(); playHole(); warmWalk(tourOf(tid), n); trailAhead(tid, n);
  if (back) resumeInto(c);
}
/* EVERY PUTT IS SAVED. The hole in progress (which hole, the strokes, where the ball lies) goes into the
   Tour record the moment a putt is struck and again when it stops, so a reload, a closed tab or a phone
   that kills the page lands back on the same hole with the same count. It is saved at the STRIKE with the
   ball still at its starting spot, so closing the tab while a bad putt rolls costs that stroke rather than
   undoing it. Every attempt is counted on the hole (tp.tries) the first time a putt is struck in it.
   Opening the game goes straight back into a hole in progress; only leaving it through the X (which costs
   a life, as before) or finishing it clears it. A signed in player's hole in progress follows the account:
   the copy changed last wins (curT), the same rule as lives. */
function saveCur(P, ball){
  var R = S.round; if (!R || R.mode !== 'ppt' || !P) return;
  var st = pload(), tid = R.tid || 'main', tp = st.tours[tid];
  if (!P.counted){ P.counted = 1; tp.tries[R.lv] = (tp.tries[R.lv] || 0) + 1; }
  st.cur = { tid:tid, n:R.lv, s:P.strokes, b:[+ball[0].toFixed(3), +ball[1].toFixed(3)], t:Date.now() }; st.curT = st.cur.t;
  psave(st);
}
function clearCur(st){ if (st.cur){ st.cur = null; st.curT = Date.now(); } }
function resumeInto(c){
  var P = S.play; if (!P) return;
  P.ball = c.b.slice(); P.prev = c.b.slice(); P.strokes = c.s; P.counted = 1;
  P.target = P.C.cup.slice(); P.aimAng = Math.atan2(P.C.cup[1] - P.ball[1], P.C.cup[0] - P.ball[0]); P.cam = null; P.camNow = null;
  // the tab closed while the last stroke rolled: the hole was lost then, and is settled now
  if (P.strokes >= P.C.par){ P.state = 'done'; return tourOut(false); }
  hud(); toast('Back where you left off: ' + c.s + (c.s === 1 ? ' stroke' : ' strokes') + ' played.');
}
function resumeCur(){
  var c = pload().cur; if (!c || !TOURS[c.tid] || !(c.n >= 1 && c.n <= tourOf(c.tid).levels.length) || !c.b) return false;
  startLevel(c.n, c.tid); return true;
}
function startDaily(dk){
  var t = today(); dk = dk || t; if (dk > t) return;
  if (dk < t && !pastOpen()) return pastSheet(dk);
  var r0 = pload().daily[dk]; if (r0 && r0.done) return dailyResult(null, dk);
  var d = dailyHole(dk);
  S.round = { mode:'pdaily', day:dk, past:dk < t, i:0, cards:[], holes:[d], title:d.name, kick:THEMES[d.theme].name };
  playHole();
}
// what the bar under the title says during a hole
function tourSub(R, C, P){
  if (R.mode === 'ppt'){ var left = C.par - P.strokes; return (R.tid === 'secret' ? 'Secret hole' : 'Hole ' + wl(R.lv, R.tid)) + ' · Par ' + C.par + ' · ' + (left > 1 ? left + ' strokes left' : 'Last stroke'); }
  if (R.mode === 'pdaily') return R.kick + ' · ' + (R.past ? monthDay(R.day) + ' Daily' : 'Daily Hole') + ' · Par ' + C.par;
  return (C.kind === 'real' ? C.sub : (R.kick || '')) + ' · Par ' + C.par;
}
// leaving a hole: free before the first putt, a life after it on the Tour
function leaveHole(){
  var P = S.play, R = S.round;
  if (R && R.mode === 'ppt' && R.tid !== 'lab' && R.tid !== 'secret' && P && P.strokes > 0 && P.state !== 'done'){
    return confirmSheet('Leave this hole?', 'You have putted, so leaving costs a life.', 'Leave · lose a life', function(){ var st = pload(); clearCur(st); loseLife(st); if (livesNow(st) > 0) home(R.tid); else showHub(); }); }
  if (R && R.mode === 'pdaily' && P && P.strokes > 0 && P.state !== 'done'){
    return confirmSheet('Leave the Daily Hole?', 'You get one scored try a day. Leaving now scores it as a pick up.', 'Leave and score it', function(){ dailyFinish(P.C.par + 3, P.C.par, null); }); }
  if (R && R.mode === 'ppt'){ var st = pload(); if (st.cur){ clearCur(st); psave(st); } }
  if (R && R.mode === 'ppt') home(R.tid); else showHub();
}
function restartHole(){
  var P = S.play, R = S.round;
  if (R.mode === 'ppt' && R.tid !== 'lab' && R.tid !== 'secret' && P.strokes > 0 && P.state !== 'done') return confirmSheet('Restart?', 'You have putted, so a restart costs a life.', 'Restart · lose a life', function(){ var st = pload(); clearCur(st); loseLife(st); if (livesNow(st) <= 0 && !allAccess()) return showHub(), outOfLives(); playHole(); });
  if (R.mode === 'pdaily' && P.strokes > 0) return toast('One scored try a day. Finish this one.');
  if (R.mode === 'ppt'){ var st = pload(); if (st.cur){ clearCur(st); psave(st); } }
  playHole();
}
function confirmSheet(title, body, yes, fn){
  var sh = el('<div class="pp-sheet"><div class="pp-card"><div class="t">' + esc(title) + '</div><div class="m">' + esc(body) + '</div><button class="pt-go pp-wide" data-y>' + esc(yes) + '</button><button class="pt-bt pp-wide" data-n>Keep playing</button></div></div>');
  S.ov.appendChild(sh); sh.querySelector('[data-n]').onclick = function(){ sh.remove(); }; sh.querySelector('[data-y]').onclick = function(){ sh.remove(); fn(); };
}
function popup(html, wire, kind){ var pop = el('<div class="pt-pop pp-pop' + (kind ? ' ' + kind : '') + '">' + html + '</div>'); (S.stage || S.ov).appendChild(pop); if (S.play) S.play.state = 'done';
  pop.querySelectorAll('[data-a]').forEach(function(b){ b.onclick = function(){ wire[b.getAttribute('data-a')](); }; }); return pop; }

/* A SECRET HOLE ENDS: no life either way. The first win pays, and the eleventh secret beaten pays the collection.
   Back to the trail puts the golfer on the walk the secret was found on. */
function secretOut(holed){
  var P = S.play, R = S.round, C = P.C, n = R.lv, st = pload(), tp = st.tours.secret, PY = PAY.secret, s = P.strokes, par = C.par, got = 0, lines = [];
  clearCur(st); var from = S.secretFrom != null ? S.secretFrom : secretFrom(n);
  var back = function(){ openTrail('main', from); }, again = function(){ startLevel(n, 'secret'); };
  if (holed && s <= par){ var first = tp.best[n] == null; tp.best[n] = first ? s : Math.min(tp.best[n], s);
    if (!tp.paid[n]){ tp.paid[n] = 1; got += PY.hole; } if (s === 1 && !tp.ace[n]){ tp.ace[n] = 1; got += PY.ace; }
    var beaten = Object.keys(tp.paid).length;
    if (beaten >= PY.ten && st.rewards.indexOf(PY.allReward) < 0){ got += PY.all; grant(st, PY.allReward); lines.push(PY.ten + ' secret holes beaten: the ' + PY.allReward + ' and +' + PY.all + ' coins.'); }
    else if (beaten < PY.ten) lines.push((PY.ten - beaten) + ' more secret ' + (PY.ten - beaten === 1 ? 'hole wins' : 'holes win') + ' the ' + PY.allReward + '.');
    psave(st); if (got) coins(got, 'Secret hole');
    try{ S.host.sfx && S.host.sfx('holeGood'); }catch(e){}
    return popup('<div class="k">SECRET HOLE · ' + (s === 1 ? 'HOLE IN ONE' : s < par ? 'UNDER PAR' : 'PAR') + '</div><div class="t">' + esc(scoreName(s, par)) + '</div>      <div class="pp-nums"><span><b>' + s + '</b>Strokes</span><span><b>' + par + '</b>Par</span><span><b>' + beaten + '/' + SECRETS.length + '</b>Secrets beaten</span></div>' +
      (got ? '<div class="pp-coins">+' + got + ' coins</div>' : '<div class="s">Coins land the first time only.</div>') + lines.map(function(t){ return '<div class="s">' + esc(t) + '</div>'; }).join('') +
      '<div class="row"><button class="pt-bt" data-a="again">Replay</button><button class="pt-go" data-a="back">Back to the trail</button></div>', { again:again, back:back }); }
  psave(st);
  return popup('<div class="k">OUT OF STROKES</div><div class="t">Over par</div><div class="s">' + par + ' strokes used and still not down. Secret holes cost no lives.</div>    <div class="row"><button class="pt-bt" data-a="back">Back to the trail</button><button class="pt-go" data-a="again">Try again</button></div>', { back:back, again:again }, 'over');
}
// a Tour hole ends one of three ways
/* THE GAME'S OWN QUESTS AND STREAK hear about Putt Putt: a hole won, new stars, an ace, a chest, the Daily Hole
   (host.quest feeds the weekly challenges, host.questDaily the daily quests, host.dayPlayed the one streak). */
function hq(metric, n){ try{ if (n > 0 && S.host.quest) S.host.quest(metric, n); }catch(e){} }
function tourOut(holed){
  if (S.round && S.round.tid === 'secret') return secretOut(holed);
  var P = S.play, R = S.round, C = P.C, n = R.lv, tid = R.tid || 'main', TR = tourOf(tid), PY = PAY[TR.id], K = TR.per || PER, N = TR.levels.length;
  var s = P.strokes, par = C.par, st = pload(), tp = st.tours[TR.id], th = TR.levels[n - 1].three;
  clearCur(st); if (TR.lab || !(holed && s <= par)) psave(st);
  if (holed && s <= par){
    var first = tp.best[n] == null, lines = [], had = starsOf(tp.best[n], par, th), wasLv = tp.lv;
    tp.best[n] = first ? s : Math.min(tp.best[n], s);
    tp.lv = frontier(tp, TR);
    var stars = starsOf(s, par, th), gw = Math.floor((n - 1) / K);
    var got = 0;
    if (!tp.paid[n]){ tp.paid[n] = 1; got += TR.levels[n - 1].sig ? PY.sig : PY.hole; }
    if (s === 1 && !tp.ace[n]){ tp.ace[n] = 1; got += PY.ace; var ac = aceCount(st); if (ACE_REWARD[ac]){ grant(st, ACE_REWARD[ac]); lines.push('New: ' + ACE_REWARD[ac]); } }
    tp.treat = tp.treat || {}; var TT = PY.treat, treat = TT && gw === TT.w && s < par && !tp.treat[n];
    if (treat){ tp.treat[n] = 1; got += TT.each; var tk = 0; for (var q = TT.w * K + 1; q <= TT.w * K + K; q++) if (tp.treat[q]) tk++;
      lines.push('Trick or treat! +' + TT.each + ' bonus coins · ' + tk + ' of ' + K + ' treats');
      if (tk >= K && st.rewards.indexOf(TT.reward) < 0){ got += TT.all; grant(st, TT.reward); lines.push('The candy bag is full: +' + TT.all + ' coins and the ' + TT.reward.replace(' (Members only)', '')); } }
    var w = Math.floor((n - 1) / K), worldDone = TR.levels[n - 1].sig && !tp.wpaid[w];
    if (worldDone){ tp.wpaid[w] = 1; grant(st, PY.sigReward[w]); grant(st, PY.worldReward[w]); if (PY.finish && n === N) grant(st, PY.finish); }
    psave(st); if (got || worldDone) coins(got + (worldDone ? PY.world : 0), TR.name + ' ' + wl(n, tid));
    if (!TR.lab){ if (s < par) hq('ppHolesWon', 1); hq('ppStars', stars - had); if (s === 1 && ac) hq('ppAces', 1); }
    try{ S.host.sfx && S.host.sfx('holeGood'); }catch(e){}
    if (worldDone) return worldComplete(n, s, par, got, tid, lines);
    var sec = !!P.foundSecret; if (sec){ tp.secret = tp.secret || {}; if (!tp.secret[n]){ tp.secret[n] = 1; psave(st); } }
    var nextOpen = n < N && opened(TR, tp, n + 1), have = starsThrough(tp, TR, gw), gate = worldGate(TR, gw);
    var openLine = n >= N ? 'More holes are on the way.' : nextOpen ? (wasLv <= n ? 'Level ' + (n + 1) + ' is open.' : '') :
      esc(wLabel(TR, gw + 1)) + ' opens at ' + gate + ' total stars. You have ' + have + '.';
    return popup('<div class="k">' + (sec ? 'SECRET LINE FOUND' : s === 1 ? 'HOLE IN ONE' : s < par ? 'UNDER PAR' : 'PAR') + '</div><div class="t">' + esc(scoreName(s, par)) + '</div>\
      <div class="pp-stars">' + starRow(stars) + '</div>' + (stars > had && !first ? '<div class="s">New best on this hole.</div>' : stars < 3 ? '<div class="s">' + (stars === 1 ? (threeOf(par, th) >= par - 1 ? 'Beat par for 3 stars.' : 'Beat par for 2 stars, ' + threeLine(par, th) + ' for 3.') : threeLine(par, th).replace(/^./, function(c){ return c.toUpperCase(); }) + ' for 3 stars.') + '</div>' : '') + '\
      <div class="pp-nums"><span><b>' + s + '</b>Strokes</span><span><b>' + par + '</b>Par</span><span><b>' + fmtPar(s - par) + '</b>To par</span></div>' +
      (isGuest() ? '<div class="s">' + GUEST_COINS + '</div>' : got ? '<div class="pp-coins">+' + got + ' coins</div>' : '<div class="s">Coins land the first time only.</div>') + (TT && gw === TT.w && !tp.treat[n] ? '<div class="s">Beat par here for a trick or treat bonus.</div>' : '') + lines.map(function(t){ return '<div class="s">' + esc(t) + '</div>'; }).join('') +
      (openLine ? '<div class="s">' + openLine + '</div>' : '') +
      '<div class="row"><button class="pt-bt" data-a="again">Replay</button>' + (nextOpen ? '<button class="pt-go" data-a="next">Next hole</button>' : '<button class="pt-go" data-a="map">Map</button>') + '</div>',
      // a guest goes no further than the holes they may play: the next one asks them to sign in, where they stand
      { again:function(){ startLevel(n, tid); }, next:function(){ if (guestAsks(tid, n + 1)) return guestSheet(n + 1, tid); walkTo(n, tid); }, map:function(){ showHub(tid); } });
  }
  // over par: the moment par strokes are gone with the ball still out
  if (TR.lab) return popup('<div class="k">OUT OF STROKES</div><div class="t">Over par</div><div class="s">' + par + ' strokes used and still not down. The Lab costs no lives.</div>\
    <div class="row"><button class="pt-bt" data-a="map">Map</button><button class="pt-go" data-a="again">Try again</button></div>', { map:function(){ showHub(tid); }, again:function(){ startLevel(n, tid); } }, 'over');
  loseLife(st);
  var over = popup('<div class="k">OUT OF STROKES</div><div class="t">Over par</div><div class="s">' + par + ' strokes used and still not down.</div>\
    <div class="pp-lives">' + hearts(st) + '</div><div class="s">' + (livesNow(st) ? livesNow(st) + (livesNow(st) === 1 ? ' life' : ' lives') + ' left' : 'That was your last life.') + '</div>' +
    (membersOpen() ? '' : '<div class="s pp-x2s"><i class="pp-x2h">' + heartSvg(PER_HEART) + '</i> ' + esc(passLivesLine()) + '</div>' + (livesNow(st) <= PER_HEART ? '<button class="pt-go pp-wide pass" data-pass>Get Tour Pass<small>' + LIVES_PASS + ' lives</small></button>' : '')) +
    buyRow(st) +
    '<div class="row"><button class="pt-bt" data-a="map">Map</button><button class="pt-go" data-a="again">' + (livesNow(st) ? 'Try again' : 'Refill') + '</button></div>',
    { map:function(){ showHub(tid); }, again:function(){ if (livesNow(pload()) > 0 || allAccess()) startLevel(n, tid); else { showHub(tid); outOfLives(); } } }, 'over');
  wireBuy(over); return over;
}
function worldComplete(n, s, par, got, tid, lines){
  var TR = tourOf(tid), PY = PAY[TR.id], K = TR.per || PER, w = Math.floor((n - 1) / K), Wd = TR.worlds[w], last = n === TR.levels.length;
  var tp = pload().tours[TR.id], have = worldStars(tp, TR, w), total = starsThrough(tp, TR, w), gate = worldGate(TR, w), nx = TR.worlds[w + 1], shut = nx && !opened(TR, tp, n + 1);
  return popup('<div class="k">' + (TR.members ? '★ ' + esc(Wd.name.toUpperCase()) + ' COMPLETE' : 'WORLD ' + (w + 1) + ' COMPLETE') + '</div><div class="t">' + esc(Wd.name) + '</div><div class="s">Signature hole beaten in ' + s + ' (par ' + par + ').</div>\
    <div class="pp-reward">New · ' + esc(PY.sigReward[w]) + '<br>New · ' + esc(PY.worldReward[w]) + (PY.finish && last ? '<br>New · ' + esc(PY.finish) : '') + '</div>\
    <div class="pp-coins">+' + got + ' coins · +' + PY.world.toLocaleString() + ' ' + (TR.members ? 'members' : 'world') + ' bonus</div>' + (lines || []).map(function(t){ return '<div class="s">' + esc(t) + '</div>'; }).join('') +
    '<div class="pp-stars">' + have + ' of ' + worldMax(TR, w) + ' ★</div>' +
    (shut ? '<div class="s">' + esc(wLabel(TR, w + 1)) + ' opens at ' + gate + ' total stars. You have ' + total + '. Replay holes to earn ' + (gate - total) + ' more.</div>' :
     nx ? '<div class="s">' + (revealed(TR, w + 1) ? (TR.members ? esc(nx.name) : 'World ' + (w + 2) + ', ' + esc(nx.name) + ',') + ' is open.' : 'You have the stars. Walk to the gate and the clouds will part.') + '</div>' : '<div class="s">You have finished the ' + esc(TR.name) + '.</div>') +
    '<div class="s pp-fine">Rewards are saved to your Tour record.</div>\
    <div class="row"><button class="pt-bt" data-a="map">Map</button>' + (nx ? '<button class="pt-go" data-a="next">' + (shut ? 'To the door' : 'Next ' + (TR.members ? 'hole' : 'world')) + ' ▸</button>' : '') + '</div>',
    { map:function(){ showHub(tid); }, next:function(){ walkTo(n, tid); } });
}

/* ----------------------------------------------------------------------------- the Daily Hole */
/* THE DAILY HOLE IS TIMED. Everybody plays the same hole, so strokes alone put most of the field on
   one score. The clock starts on the first frame the hole is drawn (not on the first putt, or a player
   could study it for free) and stops when the ball drops. Fewer strokes still win; the time breaks the
   tie. A pick up has no time. */
function dailyMs(P){ return P.tEnd != null ? P.tEnd : P.t0 ? Math.round(performance.now() - P.t0) : null; }
function clockTxt(ms){ if (ms == null) return ''; var t = Math.floor(ms / 100), m = Math.floor(t / 600), sec = Math.floor(t / 10) % 60; return m + ':' + (sec < 10 ? '0' : '') + sec + '.' + (t % 10); }
function dailyClock(P){
  if (!P.t0) P.t0 = performance.now();
  if (P.state === 'done' || P.state === 'cheer') return;
  var el = S.clockEl && S.clockEl.isConnected ? S.clockEl : (S.clockEl = S.ov.querySelector('[data-dclock]'));
  if (!el) return; var txt = clockTxt(performance.now() - P.t0); if (el.textContent !== txt) el.textContent = txt;
}
function dailyFinish(s, par, ms){
  var st = pload(), dk = S.round.day, rec = st.daily[dk];
  if (rec && rec.done) return dailyResult();
  var late = dk < today();
  st.daily[dk] = { s:s, par:par, ms:ms == null ? null : ms, done:1 }; if (late) st.daily[dk].late = 1;
  var got = COIN_DAILY + (s < par ? COIN_DAILY_PAR : 0);
  // the streak counts days played in a row, on the game's own calendar
  var y = new Date(Date.parse(dk + 'T12:00:00Z') - 86400000).toISOString().slice(0, 10);
  if (!late){ st.streak.n = st.streak.last === y ? st.streak.n + 1 : (st.streak.last === dk ? st.streak.n : 1); st.streak.last = dk; st.streak.best = Math.max(st.streak.best || 0, st.streak.n);
  if (STREAK_REWARD[st.streak.n]) grant(st, STREAK_REWARD[st.streak.n]); }
  psave(st); coins(got, 'Daily Hole');
  if (!late){ hq('ppDaily', 1); try{ S.host.questDaily && S.host.questDaily(); }catch(e){} try{ S.host.dayPlayed && S.host.dayPlayed(); }catch(e){}
    // the day's shared board (148_putt_daily_board.sql): the first round of the day stands, a late one never posts
    // the board waits for this post (S.dailyPost), or it is read before the round lands and says nobody has posted
    try{ if (S.host.signedIn && S.host.signedIn() && S.host.rpc) S.dailyPost = S.host.rpc('putt_daily_submit', { p_day:dk, p_strokes:s, p_par:par, p_ms:ms == null ? null : Math.round(ms), p_look:S.host.boardLook ? S.host.boardLook() : null }); }catch(e){} }
  if (s < par) try{ S.host.sfx && S.host.sfx('holeGood'); }catch(e){}
  dailyResult(got, dk);
}
/* THE DAILY HOLE BOARD. The day's top ten and the player's own row, off the server (putt_daily_board). Signed out
   it says to sign in; a server that does not answer yet (148 not run) says the board is coming, and nothing breaks.
   It is LIVE (the owner, 2026-10-18): read once the player's own post has landed, then again every 20 seconds while
   the result is on screen, so rounds posted by others come in without leaving and coming back. */
var BOARD_EVERY = 20000;
function dailyBoard(dk, again){ var box = S.ov && S.ov.querySelector('[data-rows]'); if (!box) return; var h = S.host;
  if (!(h.signedIn && h.signedIn())){ box.innerHTML = '<div class="m">Sign in to see how you stack up.</div>'; return; }
  if (!again) box.innerHTML = '<div class="m">Loading the board.</div>';
  var post = S.dailyPost; S.dailyPost = null;
  var p = Promise.resolve(post).catch(function(){ return null; }).then(function(){ try{ return h.rpc('putt_daily_board', { p_day:dk, p_limit:10 }); }catch(e){ return null; } });
  p.then(function(rows){ if (!S || !S.ov || !S.ov.contains(box)) return;
    clearTimeout(S.boardT); S.boardT = setTimeout(function(){ if (S && S.ov && S.ov.contains(box)) dailyBoard(dk, true); }, BOARD_EVERY);
    if (!rows || !rows.length){ box.innerHTML = '<div class="m">' + (rows ? 'Nobody has posted yet. Be the first.' : 'The board is on its way.') + '</div>'; return; }
    var n = rows[0].players || rows.length;
    box.innerHTML = rows.map(function(r){ var im = '', g = r.look ? chipImg(r.look) : ''; if (g) im = '<i class="pp-dav g3">' + g + '</i>';
      else try{ var c = r.look && h.portrait ? h.portrait(r.look) : null; if (c && c.toDataURL) im = '<i class="pp-dav" style="background-image:url(' + c.toDataURL() + ')"></i>'; }catch(e){}
      return '<div class="pp-drow' + (r.mine ? ' me' : '') + '"><b>' + r.rank + '</b>' + im + '<span>' + esc(r.username) + '</span><em>' + r.strokes + ' · ' + (r.ms != null ? clockTxt(r.ms) : '-') + '</em></div>'; }).join('') +
      '<div class="m" style="margin-top:6px;opacity:.75">' + n + (n === 1 ? ' player' : ' players') + ' today.</div>'; }); }
function dailyResult(got, dk){
  var st = pload(); dk = dk || (S.round && S.round.day) || today(); var rec = st.daily[dk], dh = dailyHole(dk), T = THEMES[dh.theme];
  if (!rec) return showHub();
  var label = rec.s >= rec.par + 3 ? 'Picked up' : scoreName(rec.s, rec.par);
  cancelAnimationFrame(S.raf); S.screen = 'card';
  S.ov.innerHTML = hdr('<span class="pp-strk">Streak ' + (st.streak.n || 1) + '</span>') + '<div class="pt-menu" style="padding-top:4px">\
    <div class="pp-dres"><div class="k">Daily Hole · ' + monthDay(dk) + '</div><div class="nm">' + esc(dh.name) + '</div><div class="m" style="opacity:.8">' + esc(T.name) + '</div><span class="th" data-th></span>\
      <div class="sc"><b>' + rec.s + '</b><span>' + (rec.s === 1 ? 'stroke' : 'strokes') + '<br>par ' + rec.par + '</span>' + (rec.ms != null ? '<b class="pp-tm">' + clockTxt(rec.ms) + '</b><span>time</span>' : '') + '</div>\
      <div class="m" style="color:#ffd9a8;font-weight:800">' + esc(label) + (rec.s < rec.par ? ' · beat par' : '') + (st.streak.best > 1 ? ' · best streak ' + st.streak.best : '') + '</div>' + (got ? (isGuest() ? '<div class="m">' + GUEST_COINS + '</div>' : '<div class="pp-coins">+' + got + ' coins</div>') : '') + '</div>\
    <div class="pt-card pp-dboard" style="cursor:default" data-board><div class="k">Leaderboard</div><div class="m">Fewest strokes wins. The clock breaks a tie.</div><div class="pp-drows" data-rows></div></div>\
    <button class="pt-go" data-share style="background:#12a08f;color:#fff;padding:14px">Share</button><button class="pt-bt" data-menu style="padding:13px">Calendar</button>\
    <div class="m" style="text-align:center;color:#a9a3c9">' + (rec.late ? 'Played late, so the streak did not move. ' : 'Played. ') + 'Next Daily Hole in ' + hm(msToNextDay()) + '.</div></div>';
  setTimeout(function(){ if (S && S.screen === 'card') thumb(S.ov.querySelector('[data-th]'), dh, 'd' + dk); }, 30);
  dailyBoard(dk);
  S.ov.querySelector('[data-x]').onclick = function(){ showHub(); }; S.ov.querySelector('[data-menu]').onclick = function(){ showHub('daily'); };
  S.ov.querySelector('[data-share]').onclick = function(e){ var txt = 'Run The Tour · Putt Putt Tour Daily Hole ' + dk + '\n' + T.name + ': ' + dh.name + '\n' + label + ' (' + rec.s + ', par ' + rec.par + ')' + (rec.ms != null ? ' in ' + clockTxt(rec.ms) : '') + '\nrunthe.gg/golf';
    try{ navigator.clipboard.writeText(txt); e.currentTarget.textContent = 'Copied'; }catch(err){} };
}

/* ---------------------------------------------------------------------------------- a round */
var TOUR_FT = [5, 8, 10, 12, 15, 18, 22, 28, 36];
function startRound(mode, arg){
  S.ballArt = undefined;   // the ball is read again each round, so a change in the closet shows
  setTimeout(function(){ try{ var f = S.host.golferCheer && S.host.golferCheer(); if (f && f.url) imgOf(f.url); }catch(e){} }, 400);   // the celebration's frame, drawn and decoded before it is needed
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
// the last stage's shape is kept, so a hole rendered ahead from a walk (no stage on screen) is the one the hole will ask for
function v3Asp(){ var r = S.stage && S.stage.isConnected && S.stage.getBoundingClientRect(); if (r && r.width) S.lastAsp = Math.round(Math.min(2.4, r.height / r.width) * 5) / 5; return S.lastAsp || 1.6; }
/* THE CONSOLE LOOK is on every themed hole (the tours, the Lab and the Daily): sun shadows, soft corners,
   haze over the far land, a grade, and a vignette over the stage. window.RTT_PUTT_FX = 'off' takes it off
   everywhere, so the two can still be compared on one screen. */
function fxOn(d){ return window.RTT_PUTT_FX !== 'off'; }
/* THE FINE PICTURE: a world in FINE_WORLDS is painted three times finer, so it reads as clearly as the golfer.
   Piloted on Pirate Cove; the owner then asked for it on every world (2026-10-15). */
var FINE_WORLDS = { clubhouse:1, school:1, candy:1, neon:1, pirate:1, temple:1, canyon:1, volcano:1, sky:1, dino:1, iceage:1 }, FINE_ART = 1 / 12;
// RTT_PUTT_FINE_TEST names one more world to paint fine, so a world's stops can be built and looked at before it joins FINE_WORLDS
function fineOn(d){ return (!!FINE_WORLDS[d.theme] || window.RTT_PUTT_FINE_TEST === d.theme) && window.RTT_PUTT_FINE !== 'off'; }
// a fine picture's zoom can round up (camFor), so it is built a little taller than the stage to leave no band below the land
function v3Opt(d){ var o = { aspect:v3Asp(), fx:fxOn(d) }; if (fineOn(d)){ o.fine = true; o.art = FINE_ART; o.aspect = Math.round(o.aspect * 1.3 * 10) / 10; } return o; }
function v3Key(d){ return [d.tpl, d.seed, d.theme, d.extra || 0, v3Asp(), fxOn(d) ? 'fx' : '', fineOn(d) ? 'fine' : ''].join('|'); }
function v3Get(d, C){
  if (d.real || !v3Ok()) return null; S.v3c = S.v3c || {}; var k = v3Key(d);
  // the hole being asked for is half rendered already: finish that rather than start again
  if (S.v3job && S.v3job.k === k){ var J = S.v3job, o = null; S.v3job = null; try{ while (!(o = J.step(1e9))); S.v3c[k] = o; }catch(e){ S.v3c[k] = null; } }
  if (S.v3c[k] === undefined){ try{ S.v3c[k] = window.RTT_PUTT_3D.render(C || buildFrom(d), v3Opt(d)); }catch(e){ try{ console.warn('putt 3D hole failed, drawing it flat', e); }catch(_){} S.v3c[k] = null; }
    var ks = Object.keys(S.v3c); while (ks.length > V3C_KEEP) delete S.v3c[ks.shift()]; }
  return S.v3c[k];
}
// render the next hole while this one is played, so moving on does not wait. It is done a few
// milliseconds a frame (frame() calls v3Tick), because a whole hole at once would stall a phone
// for over a second in the middle of somebody's putt.
function v3Ahead(){
  var R = S.round; if (!R || !v3Ok()) return; var nd = R.holes[R.i + 1]; if (!nd || nd.real || (S.v3c && S.v3c[v3Key(nd)] !== undefined)) return;
  try{ S.v3job = { k:v3Key(nd), step:window.RTT_PUTT_3D.slices(buildFrom(nd), v3Opt(nd)) }; }catch(e){ S.v3job = null; }
}
/* THE HOLE AT THE END OF A WALK RENDERS WHILE IT IS WALKED, a few milliseconds a frame, so arriving at it is not a wait.
   Arriving early is fine: v3Get finishes the half done render rather than start again. */
/* BACKGROUND WORK GIVES WAY (the owner, 2026-10-18: laggy walking, on a phone and on a computer). A hole or a trail
   rendered ahead runs a slice a frame, but only while frames are coming in on time: a frame that took over 20 ms
   means the device is busy, so that frame does no background work. Every sixth frame still takes a slice, so a slow
   device finishes in the end; arriving early only means the hole finishes rendering then (v3Get). */
function bgSlack(){ var n = performance.now(), dt = n - (S.bgLast || n); S.bgLast = n; S.bgSkip = (S.bgSkip || 0) + 1;
  if (dt < 20 || S.bgSkip >= 6){ S.bgSkip = 0; return true; } return false; }
/* A CANVAS IS NEVER MORE THAN ABOUT 1.6 MILLION PIXELS. Pixel art loses nothing a phone or a big screen shows, and a
   computer screen at 2x was 4.3 million pixels to fill every frame. */
function capDpr(w, h){ var d = Math.min(2, window.devicePixelRatio || 1), MAX = 1.6e6; if (w * h * d * d > MAX) d = Math.max(1, Math.sqrt(MAX / Math.max(1, w * h))); return d; }
function holeAhead(tid, n){ if (!v3Ok() || S.v3job) return; var d; try{ d = tourDesc(n, S.host, tid); }catch(e){ return; } if (!d || d.real || (S.v3c && S.v3c[v3Key(d)] !== undefined)) return;
  try{ S.v3job = { k:v3Key(d), step:window.RTT_PUTT_3D.slices(buildFrom(d), v3Opt(d)) }; }catch(e){ S.v3job = null; return; }
  (function tick(){ var J = S && S.v3job; if (!J || S.screen !== 'trail') return; if (!bgSlack()) return requestAnimationFrame(tick); var out = null; try{ out = J.step(3); }catch(e){ S.v3job = null; return; }
    if (out){ S.v3job = null; S.v3c = S.v3c || {}; S.v3c[J.k] = out; var ks = Object.keys(S.v3c); while (ks.length > V3C_KEEP) delete S.v3c[ks.shift()]; return; } requestAnimationFrame(tick); })(); }
function v3Tick(){
  var J = S.v3job; if (!J) return;
  var P = S.play; if (P && (P.state !== 'aim' || S.held)) return;   // never while the ball rolls or a pull back is held: those are the frames that matter
  var out = null; try{ out = J.step(2.5); }catch(e){ S.v3job = null; S.v3c = S.v3c || {}; S.v3c[J.k] = null; return; }
  if (out){ S.v3job = null; S.v3c = S.v3c || {}; S.v3c[J.k] = out; var ks = Object.keys(S.v3c); while (ks.length > V3C_KEEP) delete S.v3c[ks.shift()]; }
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
    '<div class="pt-hint" data-hint></div><button class="pt-bt" data-ov hidden aria-label="See the whole hole">View</button><button class="pt-bt" data-restart aria-label="Restart the hole">Reset</button></div>';
  if (R.mode === 'ppt'){ var tp = S.ov.querySelector('.pt-top'); tp.classList.add('pp-play'); var bx = tp.querySelector('[data-x]'); bx.textContent = '✕'; bx.setAttribute('aria-label', 'Leave the hole');
    bx.insertAdjacentHTML('afterend', avRing() + '<span class="pp-hearts">' + hearts(pload()) + '</span>'); }
  if (R.mode === 'pdaily'){ var tb = S.ov.querySelector('.pt-top'); if (tb) tb.insertAdjacentHTML('beforeend', '<span class="pp-clock" aria-label="Time"><i></i><b data-dclock>0:00.0</b></span>'); S.clockEl = null; }
  S.ov.querySelector('[data-x]').onclick = function(){ leaveHole(); };
  S.ov.querySelector('[data-restart]').onclick = function(){ restartHole(); };
  var ovb = S.ov.querySelector('[data-ov]'); ovb.onclick = function(){ if (!S.play) return; S.play.overview = !S.play.overview; ovb.classList.toggle('on', S.play.overview); S.play.camNow = null; };
  var nudge = function(s){ return function(){ aimNudge(s * 0.0035); }; };
  if (C.kind === 'real'){ holdRepeat(S.ov.querySelector('[data-l]'), nudge(-1)); holdRepeat(S.ov.querySelector('[data-r]'), nudge(1)); }
  if (R.mode === 'ppt' && C.kind !== 'real'){ var TL = tourOf(R.tid || 'main').levels[R.lv - 1]; S.ov.querySelector('.pt-stage').insertAdjacentHTML('beforeend', starTargets(C.par, TL && TL.three)); }
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
    setTimeout(function(){ if (!S || S.play !== P0) return; P0.v3 = v3Get(d, C); P0.fx = !!P0.v3 && fxOn(d); if (!P0.v3) P0.art = paintCourse(C); P0.cam = null; P0.camNow = null; S.raf = requestAnimationFrame(frame); v3Ahead(); }, 30);
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
  // 2 at most (the owner, 2026-10-18: laggy on an iPhone). The art is pixel art, so a 3x phone loses nothing it shows,
  // and a canvas at 3x is 2.25 times the pixels to fill every frame.
  var r = S.stage.getBoundingClientRect(), dpr = capDpr(r.width, r.height);
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
    var fitX = Math.min(W / (a1[0] - a0[0]), H / (a1[1] - a0[1])), widX = W / (a1[0] - a0[0]);
    /* a fine picture's pixels are a third the size, so a whole step of zoom is three times the jump: rounding down
       left a band of stage round the land. It rounds to the nearest step instead, as long as that crops no more
       than the margin of land the fit already allows (6.5 ft a side), never the course. */
    var rnd = function(v){ return V.ART < 0.2 && Math.round(v) <= v * 1.12 ? Math.round(v) : Math.floor(v); };
    var fitK = Math.max(1, rnd(fitX)), widK = Math.max(1, rnd(widX));
    /* A HOLE TALLER THAN THE SCREEN IS FOLLOWED. It opens on the whole hole for a moment, so the route is
       read, then the camera comes in to fill the width and rides with the ball. Overview puts it back.
       ONLY ON A PORTRAIT SCREEN. On a landscape one (a desktop) the whole hole already fits at a size that
       reads, and zooming in a moment after it opens took the hole away from the player who was reading it. */
    var canFollow = H > W && widK > fitK && (a1[1] - a0[1]) * widK > H * 1.08;
    var follow = canFollow && !P.overview && !(P.intro3 && performance.now() - P.intro3 < 1800);
    var kk = follow ? Math.min(widK, Math.max(fitK + 1, Math.floor(fitK * 2.2))) : fitK;
    var cxA = (a0[0] + a1[0]) / 2, cyA = (a0[1] + a1[1]) / 2, ox = Math.round(W / 2 - cxA * kk), oy = Math.round(H / 2 - cyA * kk), iw = V.cv.width * kk, ih = V.cv.height * kk;
    if (follow && P.view){ var vp = V.pr(P.view[0], P.view[1], V.zAt(P.view[0], P.view[1]) + (P.view[2] || 0)); ox = Math.round(W / 2 - vp[0] * kk); oy = Math.round(H * 0.58 - vp[1] * kk); }
    ox = iw >= W ? clamp(ox, W - iw, 0) : Math.round((W - iw) / 2); oy = ih >= H ? clamp(oy, H - ih, 0) : Math.round((H - ih) / 2);
    return { v3:V, k:kk, ox:ox, oy:oy, s:kk / (V.ART || ART), follow:follow, canFollow:canFollow };
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
/* A PULL BACK MAY LEAVE THE CANVAS AND THE WINDOW. Positions come from clientX against the canvas's own
   rectangle (offsetX is relative to whatever is under the pointer once it leaves), the move and the
   release are heard on the window as well as the canvas, and a release we never hear (let go outside the
   browser, a cancel, a lost capture, the window losing focus) is read as a release, so the putt goes. */
function bindInput(cv){
  var drag = null;
  function at(e){ var r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * S.dpr, (e.clientY - r.top) * S.dpr]; }
  function end(fire){
    var P = S.play, d = drag; drag = null; S.held = false;
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('blur', blur);
    if (!P || !d || P.state !== 'aim') return;
    if (fire && d.k === 'pow' && P.pow > 0.02) strike(); else if (d.k === 'pow') P.pow = 0;
  }
  function move(e){
    var P = S.play; if (!drag || !P) return;
    if (e.pointerType === 'mouse' && e.buttons === 0){ end(true); return; }   // let go somewhere we never heard
    var p = at(e), X = p[0], Y = p[1], c = P.camNow || camFor(P);
    if (drag.k === 'aim'){ var w = s2w(c, X + drag.dx, Y + drag.dy); P.target = w; P.aimAng = Math.atan2(w[1] - P.ball[1], w[0] - P.ball[0]); return; }
    var dx = drag.x0 - X, dy = drag.y0 - Y, L = Math.hypot(dx, dy), maxL = Math.min(S.cv.height * 0.42, 300 * S.dpr);
    P.pow = clamp(L / maxL, 0, 1);
    if (P.C.kind !== 'real' && L > 6 * S.dpr) P.aimAng = scrDir(c, dx, dy);
  }
  function up(){ if (drag) end(true); }
  function blur(){ if (drag) end(true); }
  cv.onpointerdown = function(e){
    var P = S.play; if (!P || P.state !== 'aim') return; try { cv.setPointerCapture(e.pointerId); } catch (_){} S.held = true;
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('blur', blur);
    var p0 = at(e), X = p0[0], Y = p0[1], c = P.camNow || camFor(P);
    if (P.C.kind === 'real'){
      var t = w2s(c, P.target[0], P.target[1]);
      if (Math.hypot(X - t[0], Y - t[1]) < 34 * S.dpr){ drag = { k:'aim', dx:t[0] - X, dy:t[1] - Y }; return; }
    }
    drag = { k:'pow', x0:X, y0:Y }; P.pow = 0;
  };
  cv.onpointermove = move;
  cv.onpointerup = up;
  cv.onpointercancel = cv.onlostpointercapture = function(){ if (drag) end(true); };
}
function onKey(e){
  if (!S) return;
  if (e.key === 'Escape'){ e.preventDefault(); if (S.ov.querySelector('.pp-sheet')){ S.ov.querySelector('.pp-sheet').remove(); return; } if (S.screen === 'menu'){ var wt = worldTour(); if (wt) home(wt); else close(); } else if (S.screen === 'play') leaveHole(); else if (S.screen === 'trail') close(); else showHub(); return; }
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
function maxFt(C){ return C.kind === 'real' ? 60 : MAX_FT; }
function strike(){
  var P = S.play, C = P.C, ft = P.pow * maxFt(C), v = speedFor(C, ft), a = C.kind === 'real' ? Math.atan2(P.target[1] - P.ball[1], P.target[0] - P.ball[0]) : P.aimAng;
  var t0 = gnow() / 1000 - P.clock0;
  P.shot = simulate(C, P.ball[0], P.ball[1], Math.cos(a) * v, Math.sin(a) * v, t0);
  if (onSecret(C, P.shot)) P.foundSecret = true;
  P.shotStart = gnow(); P.shotAng = a; P.strokes++; P.state = 'roll'; P.pow = 0; P.evI = 0; P.prev = P.ball.slice(); P.lastFt = ft;
  P.trail = P.shot.pts; hud(); saveCur(P, P.prev);
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
  if (bgSlack()){ v3Tick(); trailTick(4); }
  if (S.round.mode === 'pdaily') dailyClock(P);
  if (P.state === 'cheer' && (gnow() - P.cheerAt) / PLAY_RATE > (P.cheerAce ? CHEER_ACE : CHEER_MS)){ P.state = 'aim'; return holeOut(); }   // the hole keeps living behind the card, as it always did
  // where the ball is: at rest, or partway along the putt it is playing back
  var bx = P.ball[0], by = P.ball[1], falling = 0, bz = 0, hidden = false;
  if (P.state === 'roll'){
    var el2 = (gnow() - P.shotStart) / 1000, pts = P.shot.pts, i = 0;
    while (i < pts.length - 1 && pts[i + 1][2] <= el2) i++;
    var a = pts[i], b = pts[Math.min(pts.length - 1, i + 1)], f = b[2] > a[2] ? clamp((el2 - a[2]) / (b[2] - a[2]), 0, 1) : 1;
    if (b[3]) f = 0;
    bx = a[0] + (b[0] - a[0]) * f; by = a[1] + (b[1] - a[1]) * f; bz = (a[4] || 0) + ((b[4] || 0) - (a[4] || 0)) * f; hidden = a[3] === 2 && el2 < b[2];
    while (P.evI < P.shot.ev.length && P.shot.ev[P.evI][0] <= el2){ sound(P.shot.ev[P.evI][1]); P.evI++; }
    if (P.shot.holed && el2 > P.shot.t){ falling = clamp((el2 - P.shot.t) / 0.25, 0, 1); if (!P.glowAt) P.glowAt = performance.now(); }
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
  var bg = C.kind === 'real' ? ((C.biome && C.biome.base) || '#5f8a30') : (cam.v3 && cam.v3.bg) || C.T.bg;
  if (cam.v3){ ctx.drawImage(v3Base(C, cam, W, H, bg, P.fx), 0, 0); if (cam.v3.amb) drawAmbient(ctx, C, cam, performance.now() / 1000); }
  else { var o = w2s(cam, C.bounds[0], C.bounds[1]), k = cam.s * ART;
    ctx.drawImage(P.art, Math.round(o[0]), Math.round(o[1]), Math.round(P.art.width * k), Math.round(P.art.height * k)); }
  if (C.movers.length) (cam.v3 ? drawMovers3 : drawMovers)(ctx, C, cam, clock);
  if (cam.v3 && cam.v3.mill) drawSails(ctx, C, cam, clock);
  drawPieces(ctx, C, cam, clock);
  drawRead(ctx, C, cam, performance.now() / 1000);
  drawCup(ctx, C, cam, Math.hypot(bx - C.cup[0], by - C.cup[1]));
  if (P.glowAt) drawGlow(ctx, C, cam, (performance.now() - P.glowAt) / 1000);
  if (P.trail && P.state === 'aim') drawTrail(ctx, cam, P.trail);
  if (P.state === 'aim') drawAim(ctx, P, cam);
  // the golfer stands at the ball while aiming, and holds the follow through a moment once it is struck
  if ((P.state === 'aim' && !(P.intro && performance.now() - P.intro < 1300)) || (P.state === 'roll' && (gnow() - P.shotStart) / PLAY_RATE < 900)) drawGolfer(ctx, P, cam);
  if (P.state === 'roll' && !hidden) drawRollTrail(ctx, cam, P, bx, by, bz);
  if (P.state === 'cheer') drawCheer(ctx, P, cam, (gnow() - P.cheerAt) / PLAY_RATE / 1000);
  else if (!hidden && !P.sunk) drawBall(ctx, cam, bx, by, falling, bz);   // a ball that dropped is gone: never drawn back on the cup behind the card
  if (cam.v3 && cam.v3.amb) drawFlyers(ctx, C, cam, performance.now() / 1000);
  readChip(P, bx, by);
}
/* the console look's last touch, drawn over the stage in screen pixels: the low sun's warm light washing in
   from the upper left, and a vignette that holds the eye on the hole. Built once per stage size. */
/* A LIVING HOLE (a fine world). The picture is painted once and stands still; over it, every frame: the water glints, a
   few of its sampled pixels at a time catching the sun and letting it go, and every lamp, torch and fire glows and
   flickers. Then the birds of the place go round overhead (drawFlyers), with their shadows on the ground. None of it
   is anything the ball can touch. */
function ahash(i, s){ var h = Math.imul(i, 374761393) + Math.imul(s, 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function drawAmbient(ctx, C, cam, t){ var A = cam.v3.amb, k = cam.k, ox = cam.ox, oy = cam.oy, w = A.water, sz = Math.max(1, Math.round(k));
  ctx.save(); ctx.fillStyle = '#ffffff';
  for (var i = 0, n = w.length / 2; i < n; i++){ var ph = ahash(i, 7) * 6.28, sp = 0.6 + ahash(i, 9) * 0.9, v = Math.sin(t * sp + ph); if (v < 0.86) continue;
    ctx.globalAlpha = Math.min(0.9, (v - 0.86) * 7); ctx.fillRect(ox + w[i * 2] * k, oy + w[i * 2 + 1] * k, sz * (ahash(i, 3) < 0.3 ? 2 : 1), sz); }
  ctx.globalCompositeOperation = 'lighter';
  A.lights.forEach(function(L, j){ var p = w2s(cam, L[0], L[1], L[2]), f = 0.78 + 0.14 * Math.sin(t * 9.1 + j * 2.3) + 0.08 * Math.sin(t * 23.7 + j), r = cam.s * 1.35 * f;
    var g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], r); g.addColorStop(0, L[3]); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.globalAlpha = (cam.v3.night ? 0.6 : 0.32) * f; ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 6.29); ctx.fill(); });
  ctx.restore();
  if (A.anim) drawAnim(ctx, cam, A.anim, t); }
/* WHAT A PLACE MOVES. A land can hand over more that moves (land.js, anim): a waterfall pouring, a river running, steam
   off the vats, a pot bubbling, a whisk turning, a taffy puller pulling. Drawn over the picture every frame through the
   same projection as the ball, and left out wherever something in the picture stands in front of it. None of it is
   anything the ball can touch, so the physics and the solver never hear of it. */
function drawAnim(ctx, cam, N, t){ var V = cam.v3, u = cam.s, hid = V.hid, P = function(x, y, z){ return w2s(cam, x, y, z); }, i, k;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // the river: streaks riding the current along each run, in three lanes
  (N.flow || []).forEach(function(fl, fi){ var pts = fl.pts, segs = [], tot = 0;
    for (i = 0; i < pts.length - 1; i++){ var a = pts[i], b = pts[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l < 0.01) continue; segs.push([a, b, tot, l]); tot += l; }
    ctx.strokeStyle = fl.inside ? 'rgba(255,226,190,.42)' : 'rgba(255,214,170,.5)'; ctx.lineWidth = Math.max(1.5, u * 0.09);
    var gap = 1.3, ph = (t * fl.v) % gap;
    for (var lane = -1; lane <= 1; lane++) for (var s = ph + (lane & 1) * gap * 0.5 + ahash(fi, lane + 5) * 0.3; s < tot; s += gap){
      var g = null; for (k = 0; k < segs.length; k++) if (s >= segs[k][2] && s <= segs[k][2] + segs[k][3]){ g = segs[k]; break; } if (!g) continue;
      var q = (s - g[2]) / g[3], tx = (g[1][0] - g[0][0]) / g[3], ty = (g[1][1] - g[0][1]) / g[3], off = lane * fl.w * 0.3 + (ahash(Math.floor(s * 3), fi + lane * 7) - 0.5) * 0.25;
      var x0 = g[0][0] + (g[1][0] - g[0][0]) * q - ty * off, y0 = g[0][1] + (g[1][1] - g[0][1]) * q + tx * off, z0 = g[0][2] + (g[1][2] - g[0][2]) * q;
      if (Math.abs(g[1][2] - g[0][2]) > 0.3 || hid(x0, y0, z0)) continue;   // a run that steps up into the course is only a join: draw nothing on it
      var A = P(x0, y0, z0), B = P(x0 + tx * 0.45, y0 + ty * 0.45, z0); ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke(); } });
  // the falls: streaks of light chocolate pouring down the sheet as it bows out, and the churn at its foot
  if (N.falls){ var f = N.falls, n = Math.max(6, Math.round((f.x1 - f.x0) * 3.2)), Hf = f.z0 - f.z1, fy = function(z){ var w = (z - f.z1) / Hf; return f.y + (f.bow || 0.5) * (1 - w) * (1 - w); };
    for (i = 0; i < n; i++){ var fx = f.x0 + (i + 0.5) / n * (f.x1 - f.x0), sp = 0.55 + ahash(i, 3) * 0.3, Ls = 0.8 + ahash(i, 5) * 1.6;
      for (k = 0; k < 2; k++){ var p0 = (t * sp + ahash(i, 7) + k * 0.5) % 1, za = f.z0 - p0 * p0 * Hf, zb = Math.max(f.z1, za - Ls * (0.5 + p0)); if (za <= f.z1 + 0.1) continue;
        if (hid(fx, fy(za), za) && hid(fx, fy(zb), zb)) continue;
        var a2 = P(fx, fy(za), za), b2 = P(fx, fy(zb), zb); ctx.strokeStyle = k ? 'rgba(196,128,74,.75)' : 'rgba(236,176,120,.55)'; ctx.lineWidth = Math.max(1.2, u * (k ? 0.1 : 0.06));
        ctx.beginPath(); ctx.moveTo(a2[0], a2[1]); ctx.lineTo(b2[0], b2[1]); ctx.stroke(); } } }
  if (N.foam){ var fo = N.foam; ctx.fillStyle = N.col && N.col.foam || '#f4e2c8';
    for (i = 0; i < 14; i++){ var cyc = Math.floor(t * 1.4 + ahash(i, 11)), pf = (t * 1.4 + ahash(i, 11)) % 1, bx = fo.x0 + ahash(i * 31 + cyc, 13) * (fo.x1 - fo.x0), by = fo.y + (ahash(i * 17 + cyc, 15) - 0.3) * 1.4;
      if (hid(bx, by, fo.z)) continue; var c2 = P(bx, by, fo.z + pf * 0.5); ctx.globalAlpha = 0.85 * (1 - pf); ctx.beginPath(); ctx.ellipse(c2[0], c2[1], u * (0.12 + pf * 0.3), u * (0.08 + pf * 0.2), 0, 0, 6.29); ctx.fill(); }
    ctx.globalAlpha = 1; }
  // spray thrown up where the falls lands
  (N.spray || []).forEach(function(sq, qi){ for (i = 0; i < 3; i++){ var pq = (t * 0.9 + i / 3 + ahash(qi, 29)) % 1, x = sq[0] + (ahash(qi * 3 + i, Math.floor(t * 0.9 + i / 3 + ahash(qi, 29))) - 0.5) * 0.7, z = sq[2] + pq * 1.1;
      if (hid(x, sq[1], z)) continue; var c7 = P(x, sq[1], z); ctx.globalAlpha = 0.55 * (1 - pq); ctx.fillStyle = N.col && N.col.foam || '#f6e6cc';
      ctx.beginPath(); ctx.arc(c7[0], c7[1], u * (0.14 + pq * 0.32), 0, 6.29); ctx.fill(); } });
  ctx.globalAlpha = 1;
  // the recipe and the vats bubbling: a bubble swells on the surface and pops
  (N.bubbles || []).forEach(function(bb, bi){ for (i = 0; i < 4; i++){ var rate = 0.9 + ahash(bi, i) * 0.5, cyc = Math.floor(t * rate + ahash(i, bi + 3)), pb = (t * rate + ahash(i, bi + 3)) % 1, ang = ahash(cyc * 7 + i, bi) * 6.283, rr = Math.sqrt(ahash(cyc * 5 + i, bi + 9)) * bb[3];
      var x = bb[0] + Math.cos(ang) * rr, y = bb[1] + Math.sin(ang) * rr * 0.9; if (hid(x, y, bb[2])) continue; var c3 = P(x, y, bb[2]), r3 = u * (0.08 + pb * 0.22);
      ctx.globalAlpha = pb < 0.85 ? 0.9 : (1 - pb) * 6; ctx.fillStyle = bb[4]; ctx.beginPath(); ctx.ellipse(c3[0], c3[1] - r3 * 0.4, r3, r3 * 0.75, 0, 0, 6.29); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = Math.max(1, u * 0.03); ctx.stroke(); } });
  ctx.globalAlpha = 1;
  // the great kettle's whisk, turning on its shaft
  if (N.whisk){ var w = N.whisk, zc = w.z0 + 0.55, hh = 0.85, th = t * 1.6, top = P(w.x, w.y, w.z1), bot = P(w.x, w.y, zc + hh);
    ctx.strokeStyle = '#4a4e56'; ctx.lineWidth = Math.max(2, u * 0.16); ctx.beginPath(); ctx.moveTo(top[0], top[1]); ctx.lineTo(bot[0], bot[1]); ctx.stroke();
    ctx.strokeStyle = '#d8dee6'; ctx.lineWidth = Math.max(1, u * 0.09); ctx.beginPath(); ctx.moveTo(top[0], top[1]); ctx.lineTo(bot[0], bot[1]); ctx.stroke();
    for (k = 0; k < 4; k++){ var a4 = th + k * Math.PI / 4, ca4 = Math.cos(a4), sa4 = Math.sin(a4), last = null;
      ctx.strokeStyle = (Math.sin(a4) > 0) ? '#eef2f6' : '#aab0b8'; ctx.lineWidth = Math.max(1, u * 0.07);
      for (var sI = 0; sI <= 24; sI++){ var s4 = sI / 24 * 6.283, rr4 = w.r * Math.sin(s4), x4 = w.x + ca4 * rr4, y4 = w.y + sa4 * rr4 * 0.8, z4 = zc + hh * Math.cos(s4), p4 = hid(x4, y4, z4) ? null : P(x4, y4, z4);
        if (p4 && last){ ctx.beginPath(); ctx.moveTo(last[0], last[1]); ctx.lineTo(p4[0], p4[1]); ctx.stroke(); } last = p4; } } }
  // the taffy puller: two arms turn about the hub and stretch the taffy round the two pegs that stand still
  if (N.puller){ var pl = N.puller, ta = t * 0.9, ends = [0, Math.PI].map(function(o){ return P(pl.x + Math.cos(ta + o) * pl.r, pl.y, pl.z + Math.sin(ta + o) * pl.r * 0.9); }),
      hub = P(pl.x, pl.y, pl.z), pegs = [P(pl.x - 0.38, pl.y, pl.z - 0.15), P(pl.x + 0.38, pl.y, pl.z - 0.15)];
    if (!hid(pl.x, pl.y, pl.z)){
      ctx.strokeStyle = '#8a8e96'; ctx.lineWidth = Math.max(2, u * 0.14); ends.forEach(function(e){ ctx.beginPath(); ctx.moveTo(hub[0], hub[1]); ctx.lineTo(e[0], e[1]); ctx.stroke(); });
      var loop = [ends[0], pegs[1], ends[1], pegs[0]]; ctx.lineWidth = Math.max(3, u * 0.3); ctx.strokeStyle = '#ff8ab8';
      ctx.beginPath(); for (k = 0; k < 4; k++){ var a5 = loop[k], b5 = loop[(k + 1) % 4], m5 = [(a5[0] + b5[0]) / 2, (a5[1] + b5[1]) / 2 + u * 0.18]; if (!k) ctx.moveTo(a5[0], a5[1]); ctx.quadraticCurveTo(m5[0], m5[1], b5[0], b5[1]); } ctx.closePath(); ctx.stroke();
      ctx.lineWidth = Math.max(1, u * 0.09); ctx.strokeStyle = '#ffd0e4'; ctx.stroke();
      ctx.fillStyle = '#ffd23f'; ends.concat(pegs).forEach(function(e){ ctx.beginPath(); ctx.arc(e[0], e[1], Math.max(2, u * 0.12), 0, 6.29); ctx.fill(); });
      ctx.fillStyle = '#e8233f'; ctx.beginPath(); ctx.arc(hub[0], hub[1], Math.max(2, u * 0.14), 0, 6.29); ctx.fill(); } }
  // steam: soft puffs that rise off the vats, swell and fade
  (N.steam || []).forEach(function(sv, si){ for (i = 0; i < 4; i++){ var ps = (t * 0.32 + i / 4 + ahash(si, 21)) % 1, x = sv[0] + Math.sin(ps * 3 + si) * 0.35 * ps, y = sv[1], z = sv[2] + 0.2 + ps * 3.2;
      if (hid(x, y, z)) continue; var c6 = P(x, y, z), r6 = u * (0.25 + ps * 0.75);
      ctx.globalAlpha = 0.5 * (1 - ps) * Math.min(1, ps * 6); ctx.fillStyle = N.col && N.col.steam || '#ffffff'; ctx.beginPath(); ctx.arc(c6[0], c6[1], r6, 0, 6.29); ctx.fill(); } });
  ctx.restore(); }
// the birds of the place: gulls over the sea, parrots in the jungle. Each goes round its own circle at its own height
// a stop names its birds in land.js (FLY['world~stop'] = a kind here). A world adds a kind here when none of these fit
var FLY_KIND = { gull:{ w:'#f4f6fb', b:'#d8dde6', h:'#f2a03a', n:3, z:10, sz:0.5 }, parrot:{ w:'#e5483a', b:'#2bb04a', h:'#ffd23a', n:4, z:7, sz:0.42 },
  song:{ w:'#6a4a2e', b:'#8a6a44', h:'#e8a03a', n:4, z:6, sz:0.32 }, crow:{ w:'#1a1820', b:'#24222a', h:'#d8a02a', n:3, z:9, sz:0.4 }, vulture:{ w:'#2a2228', b:'#3a3036', h:'#d89a7a', n:2, z:13, sz:0.6 },
  bat:{ w:'#2a2230', b:'#3a2e44', h:'#ff4a3a', n:4, z:6, sz:0.32 }, butterfly:{ w:'#ffd23a', b:'#2a2a2a', h:'#ff8ab0', n:5, z:3, sz:0.22 }, drone:{ w:'#2bf0ff', b:'#2a2440', h:'#ff2bd6', n:3, z:8, sz:0.35 },
  ptero:{ w:'#a0522d', b:'#7a3e22', h:'#e8a03a', n:2, z:14, sz:0.9 }, ember:{ w:'#ff8a1a', b:'#ffd23a', h:'#ff5a1a', n:6, z:4, sz:0.16 } };
function drawFlyers(ctx, C, cam, t){ var LF = window.RTT_PUTT_LAND && window.RTT_PUTT_LAND.fly, kind = LF && C.stop ? FLY_KIND[LF[C.theme + '~' + C.stop]] : null; if (!kind) return;
  var bx = C.bounds, cx = (bx[0] + bx[2]) / 2, cy = (bx[1] + bx[3]) / 2, rx = (bx[2] - bx[0]) * 0.45, ry = (bx[3] - bx[1]) * 0.4, u = cam.s * kind.sz;
  ctx.save();
  for (var i = 0; i < kind.n; i++){ var dir = ahash(i, C.leg || 1) < 0.5 ? -1 : 1, a = t * (0.12 + ahash(i, 5) * 0.1) * dir + ahash(i, 11) * 6.28;
    var x = cx + Math.cos(a) * rx * (0.5 + ahash(i, 13) * 0.5), y = cy + Math.sin(a) * ry * (0.5 + ahash(i, 17) * 0.5), z = kind.z + ahash(i, 19) * 4;
    var gz = cam.v3.zAt(x, y), sh = w2s(cam, x + 1.2, y + 1.2, gz), p = w2s(cam, x, y, z), up = Math.sin(t * 7 + i * 2) > 0, hx = -Math.sin(a) * dir;
    ctx.globalAlpha = 0.18; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(sh[0], sh[1], u * 1.6, u * 0.5, 0, 0, 6.29); ctx.fill(); ctx.globalAlpha = 1;
    // a body, two wings (up or down) and a head the way it flies
    ctx.fillStyle = kind.b; ctx.fillRect(p[0] - u * 0.6, p[1] - u * 0.3, u * 1.2, u * 0.6);
    ctx.fillStyle = kind.w; if (up){ ctx.fillRect(p[0] - u * 1.8, p[1] - u * 1.1, u * 1.2, u * 0.4); ctx.fillRect(p[0] + u * 0.6, p[1] - u * 1.1, u * 1.2, u * 0.4); ctx.fillRect(p[0] - u * 0.9, p[1] - u * 0.7, u * 0.4, u * 0.4); ctx.fillRect(p[0] + u * 0.5, p[1] - u * 0.7, u * 0.4, u * 0.4); }
    else { ctx.fillRect(p[0] - u * 1.8, p[1] + u * 0.1, u * 1.2, u * 0.4); ctx.fillRect(p[0] + u * 0.6, p[1] + u * 0.1, u * 1.2, u * 0.4); }
    ctx.fillStyle = kind.h; ctx.fillRect(p[0] + (hx >= 0 ? u * 0.6 : -u * 1.0), p[1] - u * 0.2, u * 0.4, u * 0.4); }
  ctx.restore(); }
/* THE STILL PART OF A 3D HOLE, drawn once and kept: the ground colour, the sky and the near land past the picture's
   edges, the picture, and the console look's sun and vignette. A frame draws this one canvas and then what moves.
   It is drawn again only when the camera moves or the stage changes size, so a mini hole (which holds still) costs
   one copy a frame instead of the picture scaled, two gradients and a full screen blend. The vignette now sits under
   the ball and the golfer rather than over them. */
function v3Base(C, cam, W, H, bg, fx){
  var k = [W, H, cam.ox, cam.oy, cam.k, cam.v3.cv.width, bg, fx ? 1 : 0].join('|'), B = S.v3base;
  if (B && B.k === k && B.v3 === cam.v3) return B.c;
  var c = (B && B.c.width === W && B.c.height === H) ? B.c : document.createElement('canvas'); c.width = W; c.height = H;
  var x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.fillStyle = bg; x.fillRect(0, 0, W, H);
  var sk = cam.v3.sky, ph = cam.v3.cv.height * cam.k;
  // the console look carries the land past the picture's edges: haze and sky above the far land, the near land into the dark below
  if (sk && cam.oy > 0){ var gs = x.createLinearGradient(0, 0, 0, cam.oy + 1); gs.addColorStop(0, sk.sky); gs.addColorStop(1, sk.top); x.fillStyle = gs; x.fillRect(0, 0, W, cam.oy + 1); }
  if (sk && cam.oy + ph < H){ var gb = x.createLinearGradient(0, cam.oy + ph - 1, 0, H); gb.addColorStop(0, sk.bot); gb.addColorStop(1, bg); x.fillStyle = gb; x.fillRect(0, cam.oy + ph - 1, W, H - cam.oy - ph + 1); }
  x.drawImage(cam.v3.cv, cam.ox, cam.oy, cam.v3.cv.width * cam.k, ph);
  if (fx) drawFxScreen(x, W, H, cam.v3.night);
  S.v3base = { k:k, v3:cam.v3, c:c }; return c;
}
function drawFxScreen(ctx, W, H, night){
  var k = W + 'x' + H + (night ? 'n' : ''); if (!S.fxScr || S.fxScr.k !== k){ var c = document.createElement('canvas'); c.width = W; c.height = H; var x = c.getContext('2d');
    // a night world gets no sun: only the vignette
    if (!night){ var g = x.createRadialGradient(W * 0.12, H * 0.05, 0, W * 0.12, H * 0.05, Math.max(W, H) * 0.95); g.addColorStop(0, 'rgba(255,226,170,0.16)'); g.addColorStop(0.55, 'rgba(255,226,170,0.04)'); g.addColorStop(1, 'rgba(255,226,170,0)');
      x.fillStyle = g; x.fillRect(0, 0, W, H); }
    var v = x.createRadialGradient(W / 2, H * 0.52, Math.min(W, H) * 0.42, W / 2, H * 0.52, Math.hypot(W, H) * 0.62); v.addColorStop(0, 'rgba(8,10,24,0)'); v.addColorStop(1, 'rgba(8,10,24,0.32)');
    x.fillStyle = v; x.fillRect(0, 0, W, H); S.fxScr = { k:k, c:c }; }
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(S.fxScr.c, 0, 0);
}
function settle(){
  var P = S.play, sh = P.shot, C = P.C;
  if ((sh.water || sh.out) && !P.buoyUsed && puttEquipped() === 'buoy'){ P.buoyUsed = 1; P.ball = P.prev.slice(); toast('Lifeguard Putter. No penalty stroke this time.'); }
  else if (sh.water || sh.out){ P.strokes++; P.ball = P.prev.slice(); toast(sh.water ? ((C.T && C.T.hazName) || 'Water') + '. One stroke, and it goes back.' : 'Out. One stroke, and it goes back.'); }
  else P.ball = sh.rest.slice();
  P.state = 'aim'; P.shot = null;
  if (sh.holed){ if (S.round.mode === 'pdaily' && P.t0) P.tEnd = Math.round(performance.now() - P.t0);
    P.sunk = true; P.state = 'cheer'; P.cheerAt = gnow(); P.cheerAce = P.strokes === 1; return; }
  saveCur(P, P.ball);
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
  var pw = P.pow > 0 && C.kind === 'real' ? ' · pace ' + Math.round(P.pow * maxFt(C)) + ' ft' : '';
  var main = (ft < 1 ? Math.round(ft * 12) + ' in' : Math.round(ft) + ' ft') + pw;
  var sub = Math.abs(dh) < 0.6 ? 'Level' : (Math.abs(dh) >= 12 ? (Math.abs(dh) / 12).toFixed(1) + ' ft ' : Math.round(Math.abs(dh)) + ' in ') + (dh > 0 ? 'uphill' : 'downhill');
  if (C.kind === 'real') sub += ' · ' + g.toFixed(1) + '% at the ball · stimp ' + C.stimp.toFixed(1);
  var html = esc(main) + '<span>' + esc(sub) + '</span>';
  if (r.innerHTML !== html) r.innerHTML = html; r.hidden = false;
}

/* drawing ---------------------------------------------------------------------------------- */
// a door's plate on the carpet: lit while the door it opens is open
function drawPlate(ctx, cam, m, t, z){ var c = w2s(cam, m.px, m.py, z), r = m.pr * cam.s, on = doorOpen(m, t) > 0;
  ctx.fillStyle = '#1d1d1d'; ctx.beginPath(); ctx.ellipse(c[0], c[1], r + 2, (r + 2) * (z == null ? 1 : 0.62), 0, 0, 6.29); ctx.fill();
  ctx.fillStyle = on ? '#ffd23f' : '#c0392b'; ctx.beginPath(); ctx.ellipse(c[0], c[1], r, r * (z == null ? 1 : 0.62), 0, 0, 6.29); ctx.fill(); }
function drawMovers(ctx, C, cam, t){
  var T = C.T;
  C.movers.forEach(function(m){ if (m.k === 'door') drawPlate(ctx, cam, m, t); });
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
  C.movers.forEach(function(m){ if (m.k === 'door') drawPlate(ctx, cam, m, t, cam.v3.zAt(m.px, m.py)); });
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
  C.ferries.forEach(function(f){ var q = ferryPos(f, clock), x0 = f.x0 + q.ox, x1 = f.x1 + q.ox, y0 = f.y0 + q.oy, y1 = f.y1 + q.oy, zf = cam.v3 ? cam.v3.zAt((x0 + x1) / 2, (y0 + y1) / 2) : 0;
    var c = [w2s(cam, x0, y0, zf), w2s(cam, x1, y0, zf), w2s(cam, x1, y1, zf), w2s(cam, x0, y1, zf)], sh = [w2s(cam, x0 + 0.25, y0 - 0.25, zf - 0.3), w2s(cam, x1 + 0.25, y0 - 0.25, zf - 0.3), w2s(cam, x1 + 0.25, y1 - 0.25, zf - 0.3), w2s(cam, x0 + 0.25, y1 - 0.25, zf - 0.3)];
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); sh.forEach(function(p, i){ i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }); ctx.closePath(); ctx.fill();
    function poly(q, fill, line){ ctx.fillStyle = fill; ctx.beginPath(); q.forEach(function(p, i){ i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }); ctx.closePath(); ctx.fill(); if (line){ ctx.strokeStyle = line; ctx.stroke(); } }
    /* IN SKY ISLANDS IT IS A FLOATING ISLAND, not a ferry: a grassy top with its rock and earth hanging underneath,
       tapering to a point, drifting over the drop. The same deck to the physics. */
    if (C.theme === 'sky'){ var mx0 = (x0 + x1) / 2, my0 = (y0 + y1) / 2, rk = [], dep = 2.6;
      for (var a = 0; a <= 12; a++){ var u = a / 12, ex = x0 + (x1 - x0) * u, cz = zf - 0.15 - dep * Math.sin(u * Math.PI) * (0.75 + 0.25 * Math.sin(u * 9 + f.x0));
        rk.push(cam.v3 ? w2s(cam, ex, y1, cz) : w2s(cam, ex, y1 + (zf - cz) * 0.55)); }
      rk.push(c[2]); rk.unshift(c[3]); ctx.lineWidth = Math.max(1, d); poly(rk, '#7a5232', '#4a3020');
      var mid = rk.slice(1, -1).map(function(p, i){ var q2 = cam.v3 ? w2s(cam, x0 + (x1 - x0) * i / 12, y1, zf - 0.15) : w2s(cam, x0 + (x1 - x0) * i / 12, y1); return [p[0] * 0.45 + q2[0] * 0.55, p[1] * 0.45 + q2[1] * 0.55]; });
      poly([c[3]].concat(mid).concat([c[2]]), '#9a6e44');
      poly(c, '#6cbf58', '#3f8a3e'); ctx.fillStyle = '#86d46c'; ctx.beginPath(); ctx.moveTo(c[0][0], c[0][1]); ctx.lineTo(c[1][0], c[1][1]); var ti = [c[1][0] * 0.8 + c[2][0] * 0.2, c[1][1] * 0.8 + c[2][1] * 0.2], tj = [c[0][0] * 0.8 + c[3][0] * 0.2, c[0][1] * 0.8 + c[3][1] * 0.2]; ctx.lineTo(ti[0], ti[1]); ctx.lineTo(tj[0], tj[1]); ctx.closePath(); ctx.fill();
      return; }
    /* IN CANDY WORKS IT IS A CANDY BOAT: a pink and white striped hull curling up at both ends, a wafer deck (the same deck to
       the physics, its on and off edges striped as everywhere), candy cane rails down its long sides and a lollipop for a mast. */
    if (C.theme === 'candy'){ var hl = [], hn = 14, along2 = Math.abs(f.dx) >= Math.abs(f.dy);
      for (var hi = 0; hi <= hn; hi++){ var hu = hi / hn, hz = zf - 0.62 * Math.pow(Math.sin(hu * Math.PI), 0.6) + 0.42 * Math.pow(Math.abs(hu * 2 - 1), 6);
        hl.push(cam.v3 ? (along2 ? w2s(cam, x0 + (x1 - x0) * hu, y1, hz) : w2s(cam, x1, y0 + (y1 - y0) * hu, hz)) : (along2 ? w2s(cam, x0 + (x1 - x0) * hu, y1 + 0.35 * Math.sin(hu * Math.PI)) : w2s(cam, x1 + 0.35 * Math.sin(hu * Math.PI), y0 + (y1 - y0) * hu))); }
      var nearE = along2 ? [c[2], c[3]] : [c[1], c[2]];
      ctx.save(); ctx.beginPath(); ctx.moveTo(nearE[1][0], nearE[1][1]); hl.forEach(function(p){ ctx.lineTo(p[0], p[1]); }); ctx.lineTo(nearE[0][0], nearE[0][1]); ctx.closePath();
      ctx.fillStyle = '#ff5fa2'; ctx.fill(); ctx.clip(); ctx.strokeStyle = '#fff4f8'; ctx.lineWidth = Math.max(2, cam.s * 0.22);
      for (var si = 1; si < 9; si += 2){ var sa = w2s(cam, along2 ? x0 + (x1 - x0) * si / 9 : x1, along2 ? y1 : y0 + (y1 - y0) * si / 9, zf + 1), sb = w2s(cam, along2 ? x0 + (x1 - x0) * (si + 0.6) / 9 : x1, along2 ? y1 : y0 + (y1 - y0) * (si + 0.6) / 9, zf - 1);
        ctx.beginPath(); ctx.moveTo(sa[0], sa[1]); ctx.lineTo(sb[0], sb[1]); ctx.stroke(); }
      ctx.restore(); ctx.strokeStyle = '#9a2a5a'; ctx.lineWidth = Math.max(1.5, d * 1.2); ctx.beginPath(); ctx.moveTo(nearE[1][0], nearE[1][1]); hl.forEach(function(p){ ctx.lineTo(p[0], p[1]); }); ctx.lineTo(nearE[0][0], nearE[0][1]); ctx.stroke();
      poly(c, '#ecc070', '#b8863a');
      ctx.strokeStyle = 'rgba(184,134,58,.7)'; ctx.lineWidth = Math.max(1, d);
      for (var gq = 1; gq < 6; gq++){ var gf = gq / 6, ga = [c[0][0] + (c[1][0] - c[0][0]) * gf, c[0][1] + (c[1][1] - c[0][1]) * gf], gb = [c[3][0] + (c[2][0] - c[3][0]) * gf, c[3][1] + (c[2][1] - c[3][1]) * gf];
        ctx.beginPath(); ctx.moveTo(ga[0], ga[1]); ctx.lineTo(gb[0], gb[1]); ctx.stroke(); var gc = [c[0][0] + (c[3][0] - c[0][0]) * gf, c[0][1] + (c[3][1] - c[0][1]) * gf], gd = [c[1][0] + (c[2][0] - c[1][0]) * gf, c[1][1] + (c[2][1] - c[1][1]) * gf];
        ctx.beginPath(); ctx.moveTo(gc[0], gc[1]); ctx.lineTo(gd[0], gd[1]); ctx.stroke(); }
      var ends2 = along2 ? [[0, 3], [1, 2]] : [[0, 1], [3, 2]], sides2 = along2 ? [[0, 1], [3, 2]] : [[0, 3], [1, 2]];
      ctx.lineWidth = Math.max(2, cam.s * 0.16); ctx.strokeStyle = '#fff6f0'; sides2.forEach(function(e){ ctx.beginPath(); ctx.moveTo(c[e[0]][0], c[e[0]][1]); ctx.lineTo(c[e[1]][0], c[e[1]][1]); ctx.stroke(); });
      ctx.setLineDash([Math.max(3, cam.s * 0.24), Math.max(3, cam.s * 0.24)]); ctx.strokeStyle = '#e8233f'; sides2.forEach(function(e){ ctx.beginPath(); ctx.moveTo(c[e[0]][0], c[e[0]][1]); ctx.lineTo(c[e[1]][0], c[e[1]][1]); ctx.stroke(); });
      ctx.setLineDash([Math.max(3, cam.s * 0.2), Math.max(3, cam.s * 0.2)]); ctx.strokeStyle = '#ffd36a'; ends2.forEach(function(e){ ctx.beginPath(); ctx.moveTo(c[e[0]][0], c[e[0]][1]); ctx.lineTo(c[e[1]][0], c[e[1]][1]); ctx.stroke(); }); ctx.setLineDash([]);
      // the mast: a lollipop on a white stick at the stern, on the far rail, clear of where a ball rides
      var mx = (f.dx < 0 ? x1 - 0.35 : x0 + 0.35), my = along2 ? y0 + 0.15 : (f.dy < 0 ? y1 - 0.35 : y0 + 0.35), mxx = along2 ? mx : x0 + 0.15, mb = w2s(cam, mxx, my, zf), mt = w2s(cam, mxx, my, zf + 1.7), mr = Math.max(4, cam.s * 0.5);
      ctx.strokeStyle = '#f6f1ea'; ctx.lineWidth = Math.max(2, cam.s * 0.1); ctx.beginPath(); ctx.moveTo(mb[0], mb[1]); ctx.lineTo(mt[0], mt[1]); ctx.stroke();
      ctx.fillStyle = '#fff4f8'; ctx.beginPath(); ctx.arc(mt[0], mt[1], mr, 0, 6.29); ctx.fill();
      ctx.strokeStyle = '#ff3b7a'; ctx.lineWidth = Math.max(1.5, mr * 0.28); ctx.beginPath(); for (var sw = 0; sw <= 40; sw++){ var swa = sw / 40 * 6.283 * 2.2 + clock * 0.8, swr = mr * 0.92 * sw / 40; if (!sw) ctx.moveTo(mt[0], mt[1]); else ctx.lineTo(mt[0] + Math.cos(swa) * swr, mt[1] + Math.sin(swa) * swr); } ctx.stroke();
      ctx.strokeStyle = '#c81a5a'; ctx.lineWidth = Math.max(1, d); ctx.beginPath(); ctx.arc(mt[0], mt[1], mr, 0, 6.29); ctx.stroke();
      return; }
    // in Neon Arcade it is a hover pad: dark, ringed in neon, glowing underneath
    if (C.theme === 'neon'){ ctx.save(); ctx.shadowColor = '#2bf0ff'; ctx.shadowBlur = Math.max(6, cam.s * 0.6); poly(c, '#1a1440'); ctx.restore();
      ctx.lineWidth = Math.max(2, cam.s * 0.14); ctx.strokeStyle = '#2bf0ff'; ctx.beginPath(); c.forEach(function(p, i){ i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }); ctx.closePath(); ctx.stroke();
      var ins = c.map(function(p){ var cc = w2s(cam, (x0 + x1) / 2, (y0 + y1) / 2, zf); return [p[0] * 0.7 + cc[0] * 0.3, p[1] * 0.7 + cc[1] * 0.3]; }); ctx.lineWidth = Math.max(1, cam.s * 0.06); ctx.strokeStyle = '#ff2bd6'; ctx.beginPath(); ins.forEach(function(p, i){ i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }); ctx.closePath(); ctx.stroke();
      return; }
    ctx.fillStyle = C.T.carpet || '#2f8f4e'; ctx.strokeStyle = C.T.wallLo || '#3b2a18'; ctx.lineWidth = Math.max(1.5, d * 1.4);
    ctx.beginPath(); c.forEach(function(p, i){ i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }); ctx.closePath(); ctx.fill(); ctx.stroke();
    // the edges the ball crosses on and off are striped; the other two carry a rail
    var along = Math.abs(f.dx) > Math.abs(f.dy), ends = along ? [[0, 3], [1, 2]] : [[0, 1], [3, 2]], sides = along ? [[0, 1], [3, 2]] : [[0, 3], [1, 2]];
    ctx.lineWidth = Math.max(2, cam.s * 0.16); ctx.strokeStyle = C.T.wall || '#e5483a'; sides.forEach(function(e){ ctx.beginPath(); ctx.moveTo(c[e[0]][0], c[e[0]][1]); ctx.lineTo(c[e[1]][0], c[e[1]][1]); ctx.stroke(); });
    ctx.setLineDash([Math.max(3, cam.s * 0.2), Math.max(3, cam.s * 0.2)]); ctx.strokeStyle = C.T.wallHi || '#ffd36a'; ends.forEach(function(e){ ctx.beginPath(); ctx.moveTo(c[e[0]][0], c[e[0]][1]); ctx.lineTo(c[e[1]][0], c[e[1]][1]); ctx.stroke(); }); ctx.setLineDash([]); });
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
/* A HOLED BALL LIGHTS THE CUP. A burst of the theme's colour comes up out of the hole: a flash, a column of
   light, rays and sparks rising, and then a soft glow that stays under the result card. It is drawn after
   the cup and before the golfer, so it sits on the course rather than over everything. */
function drawGlow(ctx, C, cam, t){
  var col = C.kind === 'real' ? '#F1D04A' : ((C.T && C.T.glow) || (C.T && C.T.flag) || '#fff2b0');
  var p = w2s(cam, C.cup[0], C.cup[1]), d = S.dpr, sq = cam.v3 ? cam.v3.se : 0.92, r0 = Math.max(C.cupR * cam.s, 5.5 * d);
  var rgb = [parseInt(col.slice(1, 3), 16), parseInt(col.slice(3, 5), 16), parseInt(col.slice(5, 7), 16)];
  var c = function(a){ return 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + Math.max(0, Math.min(1, a)) + ')'; };
  var burst = clamp(1 - t / 1.4, 0, 1), rest = 0.45 + 0.15 * Math.sin(t * 3.2), lift = Math.min(1, t / 0.35);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  // the pool of light on the ground round the cup
  var pr = r0 * (1.5 + 1.1 * lift), g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], pr);
  g.addColorStop(0, c(0.75 * burst + 0.4 * rest)); g.addColorStop(0.45, c(0.3 * burst + 0.16 * rest)); g.addColorStop(1, c(0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(p[0], p[1], pr, pr * sq, 0, 0, 6.29); ctx.fill();
  // the column of light rising out of the hole
  var ch = (16 + 10 * lift) * d * (0.55 + 0.45 * burst), cw = r0 * 0.95, cg = ctx.createLinearGradient(0, p[1], 0, p[1] - ch);
  cg.addColorStop(0, c(0.65 * burst + 0.22 * rest)); cg.addColorStop(1, c(0));
  ctx.fillStyle = cg; ctx.beginPath(); ctx.moveTo(p[0] - cw * 0.7, p[1]); ctx.lineTo(p[0] - cw, p[1] - ch); ctx.lineTo(p[0] + cw, p[1] - ch); ctx.lineTo(p[0] + cw * 0.7, p[1]); ctx.closePath(); ctx.fill();
  // rays fanning out in the first moment
  if (burst > 0){ ctx.strokeStyle = c(0.55 * burst); ctx.lineWidth = Math.max(1, 1.2 * d); ctx.lineCap = 'round';
    for (var i = 0; i < 8; i++){ var an = i / 8 * 6.283 + 0.3, r1 = r0 * (1.2 + 0.4 * lift), r2 = r0 * (1.6 + 1.4 * lift * burst + 0.4 * (1 - burst));
      ctx.beginPath(); ctx.moveTo(p[0] + Math.cos(an) * r1, p[1] + Math.sin(an) * r1 * sq); ctx.lineTo(p[0] + Math.cos(an) * r2, p[1] + Math.sin(an) * r2 * sq); ctx.stroke(); } }
  // sparks drifting up and out
  for (var k = 0; k < 8; k++){ var sd = (k * 97.13) % 1, lt = (t * (0.55 + sd * 0.5) + k / 8) % 1.6, ka = clamp(1 - lt / 1.6, 0, 1) * (t < 2.5 ? 1 : 0.5);
    if (ka <= 0) continue; var ax = Math.cos(k * 2.4) * r0 * (0.4 + lt * 0.8), ay = -lt * 16 * d;
    ctx.fillStyle = c(ka); var sz = Math.max(1, (0.9 + sd * 0.8) * d); ctx.fillRect(Math.round(p[0] + ax - sz / 2), Math.round(p[1] + ay - sz / 2), sz, sz); }
  // the cup itself, lit from inside
  ctx.fillStyle = c(0.5 * burst + 0.3 * rest); ctx.beginPath(); ctx.ellipse(p[0], p[1], r0 * 0.85, r0 * 0.85 * sq, 0, 0, 6.29); ctx.fill();
  ctx.restore();
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
  var art = ballArt();
  if (art){ var bw = r * 2 * art.k; ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(art.cv, Math.round(p[0] - bw / 2), Math.round(p[1] - bw / 2), Math.round(bw), Math.round(bw)); ctx.restore(); return; }
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 6.29); ctx.fill();
  ctx.strokeStyle = 'rgba(30,40,30,.55)'; ctx.lineWidth = Math.max(1, S.dpr * 0.8); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.arc(p[0] - r * 0.3, p[1] - r * 0.3, r * 0.3, 0, 6.29); ctx.fill();
}
/* YOUR BALL IS THE ONE YOU PUTT WITH: the ball worn in the closet, painted from its own art by the page
   (host.ballArt, a canvas of the ball and its tint, k the art's width over the ball's). Looks only: a
   ball's Pro Tour boost does nothing here. No ball, or no page, is the white ball. One read a round. */
function ballArt(){ if (S.ballArt === undefined){ S.ballArt = null; try{ var a = S.host.ballArt && S.host.ballArt(); if (a && a.cv && a.cv.width) S.ballArt = a; }catch(e){} }
  return S.ballArt; }
/* THE ROLL LEAVES A TRAIL: the last third of a second of the ball's path, a soft streak in the ball's own
   colour that thins and fades toward its tail. Everybody's ball has it; there is no trail to pick. */
var TRAIL_S = 0.32;
function drawRollTrail(ctx, cam, P, bx, by, bz){
  var el = (gnow() - P.shotStart) / 1000, pts = P.shot.pts, V = cam.v3, art = ballArt(), col = (art && art.tint) || '#ffffff';
  var at = function(t){ var i = 0; while (i < pts.length - 1 && pts[i + 1][2] <= t) i++; var a = pts[i], b = pts[Math.min(pts.length - 1, i + 1)];
    if (a[3] || b[3]) return null; var f = b[2] > a[2] ? clamp((t - a[2]) / (b[2] - a[2]), 0, 1) : 1;
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, (a[4] || 0) + ((b[4] || 0) - (a[4] || 0)) * f]; };
  var scr = function(q){ var r = Math.max(BALL_R * cam.s, 3.6 * S.dpr); if (!V) return w2s(cam, q[0], q[1]);
    var s0 = w2s(cam, q[0], q[1], V.zAt(q[0], q[1]) + q[2]); return [s0[0], s0[1] - r * V.ce]; };
  var r0 = Math.max(BALL_R * cam.s, 3.6 * S.dpr), N = 10, prev = scr([bx, by, bz || 0]);
  ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = col;
  for (var k = 1; k <= N; k++){ var q = at(el - TRAIL_S * k / N); if (!q) break; var c = scr(q), u = 1 - k / (N + 1);
    if (Math.hypot(c[0] - prev[0], c[1] - prev[1]) > r0 * 6) break;   // a jump or a teleport: no streak across it
    ctx.globalAlpha = 0.5 * u; ctx.lineWidth = Math.max(1, r0 * 1.5 * u); ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(c[0], c[1]); ctx.stroke(); prev = c; }
  ctx.restore(); }
/* THE CELEBRATION. When a putt drops, your golfer turns to face you and hops for joy where they putted from,
   and confetti in the world's colours bursts out of the cup. An ace is bigger: more hops, more confetti and
   gold in it. Everybody's golfer does it; there is no celebration to pick. The card follows when it ends,
   and the Daily Hole's clock stopped at the drop. */
var CHEER_MS = 1300, CHEER_ACE = 2100;
function drawCheer(ctx, P, cam, t){
  var C = P.C, d = S.dpr, cup = w2s(cam, C.cup[0], C.cup[1], cam.v3 ? cam.v3.zAt(C.cup[0], C.cup[1]) : undefined), ace = P.cheerAce;
  var cols = [(C.T && C.T.flag) || '#ff5a5a', (C.T && C.T.glow) || '#fff2b0', '#ffffff', ace ? '#F1D04A' : '#5bcfe8', ace ? '#ffd23f' : '#ff9f43'];
  var n = ace ? 72 : 44, g = 480 * d;   // pixels a second squared
  ctx.save();
  for (var i = 0; i < n; i++){ var sd = (i * 0.6180339) % 1, an = -Math.PI / 2 + (sd - 0.5) * 2.2, v = (170 + 170 * ((i * 0.37) % 1)) * d * (ace ? 1.2 : 1);
    var tt = Math.max(0, t - (i % 3) * 0.04), x = cup[0] + Math.cos(an) * v * tt, y = cup[1] + Math.sin(an) * v * tt + 0.5 * g * tt * tt;
    var life = ace ? 1.9 : 1.2, a = clamp(1 - tt / life, 0, 1); if (a <= 0) continue;
    var w = Math.max(2, (3 + 2.5 * sd) * d), h = w * (0.5 + 0.5 * Math.abs(Math.sin(tt * 9 + i)));
    ctx.globalAlpha = a; ctx.fillStyle = cols[i % cols.length]; ctx.fillRect(Math.round(x - w / 2), Math.round(y - h / 2), Math.round(w), Math.max(1, Math.round(h))); }
  ctx.restore();
  var f = null; try{ f = S.host.golferCheer && S.host.golferCheer(); }catch(e){ f = null; }
  if (!f || !f.url) return;
  var im = imgOf(f.url); if (!im.complete || !im.naturalWidth) return;
  var hops = ace ? 3 : 2, span = ace ? 1.5 : 0.9, u = t < span ? Math.abs(Math.sin(t / span * hops * Math.PI)) : 0;
  var at = P.prev || P.ball, hg = 3.1 * cam.s, kk = hg / f.fig, bp = w2s(cam, at[0], at[1], cam.v3 ? cam.v3.zAt(at[0], at[1]) : undefined);
  var lift = u * hg * 0.4, sq = t < span && u < 0.15 ? 0.9 : 1, rw = Math.round(f.W * kk), rh = Math.round(f.H * kk * sq);
  var rx = Math.round(bp[0] - f.ball[0] * kk), ry = Math.round(bp[1] - f.ball[1] * kk * sq - lift);
  ctx.save(); ctx.fillStyle = 'rgba(0,0,0,' + (0.28 - 0.14 * u) + ')'; ctx.beginPath(); ctx.ellipse(bp[0], bp[1], hg * (0.2 - 0.06 * u), hg * 0.07, 0, 0, 6.29); ctx.fill();
  ctx.imageSmoothingEnabled = false; auraGlow(ctx, kk); ctx.drawImage(im, rx, ry, rw, rh); ctx.restore(); }
function drawTrail(ctx, cam, pts){
  ctx.fillStyle = 'rgba(255,255,255,.28)';
  for (var i = 0; i < pts.length; i += 4){ var p = w2s(cam, pts[i][0], pts[i][1]); ctx.fillRect(p[0] - S.dpr, p[1] - S.dpr, 2 * S.dpr, 2 * S.dpr); }
}
/* The aim line's length in feet, off the putter tier the player runs in the main game (Stock 0 to
   Signature 3). A page with no bag answers Stock. */
var AIM_FEET = [5, 7, 9, 11];
function aimFeet(){ var t = 0; try{ t = S.host && S.host.putter ? S.host.putter() | 0 : 0; }catch(e){ t = 0; }
  return AIM_FEET[Math.max(0, Math.min(3, t))] + (puttEquipped() === 'scope' ? 4 : 0); }
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
    /* DIRECTION AND POWER ARE TWO SEPARATE THINGS ON SCREEN. The white dots only say where the ball is
       going: they are one size and one spacing and never change with the pull, which used to make them
       read as a power bar. Power is the meter on the side of the screen and nothing else. How far the
       dots reach is the putter in the bag: a better putter shows more of the line. */
    var ux = Math.cos(P.aimAng), uy = Math.sin(P.aimAng), GL = aimFeet(), step = 0.75, bp = puttEquipped() === 'bank' ? bankLine(P, GL) : null;
    for (var f = step; f <= GL + 1e-6; f += step){
      var at = bp ? alongPts(bp, f) : null; if (bp && !at) break;
      var q = at ? w2s(cam, at[0], at[1]) : w2s(cam, P.ball[0] + ux * f, P.ball[1] + uy * f);
      ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.arc(q[0], q[1], 3 * d, 0, 6.29); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.beginPath(); ctx.arc(q[0], q[1], 2 * d, 0, 6.29); ctx.fill();
    }
  }
  if (P.pow > 0 || S.held) drawPowerMeter(ctx, P.pow);
}
/* THE BANK SHOT PUTTER: the aim line is the ball's own path off the walls, from the real physics, at a pace
   that carries it the length of the line. Cached on the aim and the ball, so it costs one roll per change. */
function bankLine(P, GL){ var C = P.C, k = P.aimAng.toFixed(3) + '|' + P.ball[0].toFixed(2) + ',' + P.ball[1].toFixed(2);
  if (P._bank && P._bank.k === k) return P._bank.pts;
  var pts = null; try{ var v = speedFor(C, GL * 1.6), r = simulate(C, P.ball[0], P.ball[1], Math.cos(P.aimAng) * v, Math.sin(P.aimAng) * v, gnow() / 1000 - P.clock0); pts = r && r.pts; }catch(e){ pts = null; }
  P._bank = { k:k, pts:pts }; return pts; }
function alongPts(pts, f){ var acc = 0; for (var i = 1; i < pts.length; i++){ var a = pts[i - 1], b = pts[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (acc + d >= f){ var u = d ? (f - acc) / d : 0; return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]; } acc += d; } return null; }
/* The power meter stands on the right edge of the stage, big enough to read at a glance, with the
   percentage on it: green to yellow to red from the bottom up. */
function drawPowerMeter(ctx, pow){
  var d = S.dpr, W = S.cv.width, H = S.cv.height, h = Math.min(220 * d, H * 0.5), w = 16 * d, x = W - w - 18 * d, y = (H - h) / 2;
  ctx.fillStyle = 'rgba(0,0,0,.62)'; ctx.fillRect(x - 3 * d, y - 3 * d, w + 6 * d, h + 6 * d);
  var g = ctx.createLinearGradient(0, y + h, 0, y); g.addColorStop(0, '#7ee081'); g.addColorStop(0.6, '#F1D04A'); g.addColorStop(1, '#ff5a3c');
  ctx.fillStyle = g; ctx.fillRect(x, y + h * (1 - pow), w, h * pow);
  ctx.fillStyle = 'rgba(255,255,255,.35)'; for (var i = 1; i < 4; i++) ctx.fillRect(x, y + h * i / 4, w, d);
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = '700 ' + Math.round(10 * d) + 'px system-ui,sans-serif';
  ctx.fillText('POWER', x + w / 2, y - 9 * d); ctx.fillText(Math.round(pow * 100) + '%', x + w / 2, y + h + 18 * d); ctx.textAlign = 'start';
}
function imgOf(url){ S.imgs = S.imgs || {}; var im = S.imgs[url]; if (!im){ im = new Image(); im.src = url; S.imgs[url] = im; var ks = Object.keys(S.imgs); if (ks.length > 40) delete S.imgs[ks[0]]; } return im; }
/* The golfer stands beside the ball, so when the ball is behind something he is behind it too: drawn
   faint rather than standing on the roof of the windmill house or the top of a block. */
/* And when he is standing over the cup on screen he is drawn faint as well, so the hole he is
   putting at is never hidden behind him. golferCovers() is the one answer and the check reads it. */
function drawGolfer(ctx, P, cam){
  var V = cam.v3, at0 = P.state === 'aim' ? P.ball : P.prev, faint = golferCovers(P, cam);
  if (!faint && V && V.hid){ var z0 = V.zAt(at0[0], at0[1]);
    faint = V.hid(at0[0], at0[1], z0 + 0.3) || V.hid(at0[0] + 0.6, at0[1], z0 + 0.8) || V.hid(at0[0] - 0.6, at0[1], z0 + 0.8); }
  if (faint){ ctx.save(); ctx.globalAlpha = 0.4; drawGolfer0(ctx, P, cam); ctx.restore(); return; }
  drawGolfer0(ctx, P, cam);
}
function golferCovers(P, cam){
  var r = drawGolfer0(null, P, cam, true); if (!r) return false;
  var C = P.C, c = w2s(cam, C.cup[0], C.cup[1]), pad = Math.max(4, (C.cupR || 0.18) * cam.s * 1.6);
  return c[0] > r[0] - pad && c[0] < r[0] + r[2] + pad && c[1] > r[1] - pad && c[1] < r[1] + r[3] + pad;
}
/* With measure set it draws nothing and hands back the rectangle it would draw, [x, y, w, h]. */
function drawGolfer0(ctx, P, cam, measure){
  var h = S.host, at = P.state === 'aim' ? P.ball : P.prev, ang = P.state === 'aim' ? (P.C.kind === 'real' ? Math.atan2(P.target[1] - P.ball[1], P.target[0] - P.ball[0]) : P.aimAng) : P.shotAng;
  // the 3D modelled golfer (golfer3d.js through the page), side-on to the putt, putter on the ball:
  // address while aiming, the take back while a pull is held, the through once it is struck
  if (h.golfer3){ var g = null; try{ g = h.golfer3(Math.cos(ang), Math.sin(ang)); }catch(e){ g = null; }
    if (g && g.urls){ var im = imgOf(g.urls[P.state !== 'aim' ? 2 : P.pow > 0.02 ? 1 : 0]);
      if (im.complete && im.naturalWidth){ var hg = (P.C.kind === 'real' ? 3.4 : 3.1) * cam.s, kk = hg / g.fig, bp = w2s(cam, at[0], at[1]);
        var rx = Math.round(bp[0] - g.ball[0] * kk), ry = Math.round(bp[1] - g.ball[1] * kk), rw = Math.round(g.W * kk), rh = Math.round(g.H * kk);
        if (measure) return [rx, ry, rw, rh];
        ctx.save(); ctx.imageSmoothingEnabled = false; auraGlow(ctx, kk); ctx.drawImage(im, rx, ry, rw, rh); ctx.restore(); }
      return null; } }   // still loading: draw nothing this frame rather than flash the flat golfer
  // the flat golfer (no 3D module) stays where it stood to putt until the ball is at rest, rather than vanish
  if (!h.golfer) return null;
  if (!S.gcv){ try{ S.gcv = h.golfer(); }catch(e){ S.gcv = null; } }
  var g = S.gcv; if (!g || !g.width) return null;
  var hgt = (P.C.kind === 'real' ? 3.4 : cam.v3 ? 3.1 : 2.9) * cam.s, k = hgt / g.height, w = Math.round(g.width * k), hh = Math.round(g.height * k);
  var b = w2s(cam, at[0], at[1]), side = Math.cos(ang) >= 0 ? -1 : 1;
  if (measure) return [Math.round(b[0] + side * (w * 0.42)) - w / 2, Math.round(b[1] - hh * 0.9), w, hh];
  ctx.save(); ctx.imageSmoothingEnabled = false; auraGlow(ctx, k);
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
// back from a paid checkout: the server has the lives (or will in a moment). Answers the lives this account now has.
RTT_PUTT.livesRefresh = function(host){ HOSTX = host || HOSTX; return livesSync().then(function(){ return pload().lives || 0; }, function(){ return pload().lives || 0; }); };
RTT_PUTT.LIVES_BUY = LIVES_BUY; RTT_PUTT.buyLabel = buyLabel; RTT_PUTT.LIVES_MAX = livesMax;
RTT_PUTT.open = open; RTT_PUTT.close = close; RTT_PUTT.paintCourse = paintCourse; RTT_PUTT.SKIN = SKIN;
RTT_PUTT._state = function(){ return S; };
RTT_PUTT.LIVES = { free:LIVES_FREE, pass:LIVES_PASS };
RTT_PUTT.heart = function(n){ return heartSvg(n == null ? PER_HEART : n); };   // the three-band heart, for the page's double lives pitch
RTT_PUTT._walkTo = function(n, tid){ return walkTo(n, tid || 'main'); };
RTT_PUTT._trail = function(){ return S && S.trailCtl; };
RTT_PUTT._trailPic = function(){ var k = S && S.trailTo ? trailKey(trailSpec(S.trailTo.tid, S.trailTo.to - 1)) : null; return k ? TRC[k] : null; };
RTT_PUTT._trailPlan = function(from, tid){ return trailPlan(trailSpec(tid || 'main', from)); };
RTT_PUTT._trailLeft = function(n, tid){ return trailLeft(tid || 'main', n); };
RTT_PUTT._secretFrom = secretFrom;
RTT_PUTT._holeTips = function(n, tid){ var L = tourOf(tid || 'main').levels[n - 1]; return holeTips(n, tid || 'main', L ? threeOf(L) : null); };
RTT_PUTT._loot = trailLoot; RTT_PUTT._bag = function(){ bagSheet(); }; RTT_PUTT._closet = function(){ closetSheet(); }; RTT_PUTT._foot = courseFoot; RTT_PUTT._left = trailLeft;
RTT_PUTT._putt = function(ang, ft){ var P = S && S.play; if (!P || P.state !== 'aim') return false; P.aimAng = ang; P.pow = ft / maxFt(P.C); strike(); return true; };
RTT_PUTT._covers = function(){ var P = S.play; return P && P.camNow ? golferCovers(P, P.camNow) : null; };
RTT_PUTT._lose = function(){ loseLife(pload()); };
RTT_PUTT._chestRoll = chestRoll; RTT_PUTT._chestLuck = chestLuck; RTT_PUTT._keeperBlocks = function(n){ return keeperBlocks(pload(), n, 'main'); };
RTT_PUTT._overPar = function(){ if (S && S.play && S.round && S.round.mode === 'ppt'){ S.play.strokes = S.play.C.par; S.play.state = 'done'; return tourOut(false); } };   // checks: a hole lost to par
RTT_PUTT._dailyFinish = function(s, par, ms){ return dailyFinish(s, par, ms); };
RTT_PUTT._holed = function(n){ if (S && S.play && S.round && S.round.mode === 'ppt'){ S.play.strokes = n; S.play.state = 'done'; return tourOut(true); } };   // checks: a Tour hole holed in n
// the checker's door straight onto a Tour level. Nothing on the page calls it.
RTT_PUTT._level = function(n, tid){ if (S) startLevel(n, tid || 'main'); };
// a hole built from a function, for trying out a layout in the browser: RTT_PUTT._try(function(T){ return H; }, 'clubhouse')
RTT_PUTT._try = function(fn, theme, name){ if (!S) return; var d = { custom:fn, tpl:'try' + Date.now(), seed:7, theme:theme || 'clubhouse', name:name || 'Try out' }; S.round = { mode:'try', i:0, cards:[], holes:[d], title:d.name, kick:'Try out' }; playHole(); };
RTT_PUTT.starsOf = starsOf; RTT_PUTT.tourOf = tourOf; RTT_PUTT.lvH = lvH; RTT_PUTT.rectP = rectP; RTT_PUTT.buildFrom = buildFrom;
/* The home card wears the world you are in: the top band of that world's signature hole, cut from the
   game's own render by build-cards.mjs, so it is the same pixel art as the courses. */
var CARD_ART = { clubhouse:1, temple:1, pirate:1, canyon:1, volcano:1, dino:1, sky:1, neon:1, school:1, iceage:1, candy:1 }, CARD_V = 6;
RTT_PUTT.cardArt = function(theme){ var t = CARD_ART[theme] ? theme : 'clubhouse';
  return '<img class="gc-art" src="putt/cards/' + t + '.png?v=' + CARD_V + '" alt="" aria-hidden="true">'; };
RTT_PUTT.COINS = { hole:COIN_HOLE, sig:COIN_SIG, ace:COIN_ACE, world:COIN_WORLD, daily:COIN_DAILY, dailyPar:COIN_DAILY_PAR }; RTT_PUTT.PAY = PAY;
// what the home screen card shows: today's Daily Hole, your level and your lives
// the page calls this on sign in, so the home card shows the account's place before the mode is opened
RTT_PUTT.sync = function(host){ HOSTX = host || HOSTX; return cloudPull(); };
/* ACHIEVEMENTS, for the game's Trophy Room (golf/index.html, achAddPutt). Putt Putt hands the page its own list, built
   from the worlds it has, so a new world brings its own achievements with it, and the counts they are measured by.
   Every one is read off the record, so a player has on day one what they have already done. The counts have no top
   and nothing says "every world": the tour keeps growing (owner, 2026-10-15). Each is { id, cat, name, desc, goal,
   pts, key }, met when stats()[key] reaches goal. */
// in the order the Trophy Room shows them
var ACH_CAT = { tour:'Putt Putt Tour', worlds:'Putt Putt Worlds', secrets:'Putt Putt Secrets', trails:'Putt Putt Trails', daily:'Putt Putt Daily Hole', members:'Putt Putt Members Tour' };
function achTier(id, cat, key, rows){ return rows.map(function(r){ return { id:id + '_' + r[0], cat:cat, name:r[1], desc:r[2], goal:r[0], pts:r[3], key:key }; }); }
function achDefs(){ var C = ACH_CAT, out = [].concat(
    achTier('pp_holes', C.tour, 'pp_holes', [[1, 'First Win', 'Beat your first Putt Putt Tour hole (under par).', 10], [10, 'Ten Down', 'Beat 10 Putt Putt Tour holes.', 15],
      [25, 'Course Regular', 'Beat 25 Putt Putt Tour holes.', 25], [50, 'Half a Hundred', 'Beat 50 Putt Putt Tour holes.', 40], [100, 'Century of Holes', 'Beat 100 Putt Putt Tour holes.', 60],
      [150, 'Putt Putt Pro', 'Beat 150 Putt Putt Tour holes.', 80], [200, 'Two Hundred Club', 'Beat 200 Putt Putt Tour holes.', 100], [300, 'Mini Golf Marathon', 'Beat 300 Putt Putt Tour holes.', 150]]),
    achTier('pp_stars', C.tour, 'pp_stars', [[25, 'Starstruck', 'Earn 25 stars on the Putt Putt Tour.', 15], [100, 'Star Collector', 'Earn 100 stars.', 30], [250, 'Constellation', 'Earn 250 stars.', 50],
      [400, 'Night Sky', 'Earn 400 stars.', 75], [600, 'Galaxy', 'Earn 600 stars.', 120], [900, 'Universe', 'Earn 900 stars.', 180]]),
    achTier('pp_aces', C.tour, 'pp_aces', [[1, 'Hole in One', 'Ace a Putt Putt hole.', 15], [5, 'Ace Machine', 'Make 5 aces.', 25], [15, 'Ace of Clubs', 'Make 15 aces.', 40],
      [30, 'Ace High', 'Make 30 aces.', 60], [50, 'Full House of Aces', 'Make 50 aces.', 90], [100, 'One Hundred Aces', 'Make 100 aces.', 150]]),
    achTier('pp_worlds', C.tour, 'pp_worlds', [[1, 'World Beater', 'Beat all 18 holes of a world.', 20], [3, 'Globetrotter', 'Beat 3 worlds.', 40], [5, 'Explorer', 'Beat 5 worlds.', 60],
      [8, 'Voyager', 'Beat 8 worlds.', 90], [12, 'Pathfinder', 'Beat 12 worlds.', 130], [16, 'Far and Wide', 'Beat 16 worlds.', 180]]),
    achTier('pp_perfect', C.tour, 'pp_perfect', [[1, 'Perfect World', 'Three stars on every hole of a world.', 50], [3, 'Perfectionist', 'Perfect 3 worlds.', 100],
      [6, 'Flawless Traveller', 'Perfect 6 worlds.', 160], [10, 'Not a Star Dropped', 'Perfect 10 worlds.', 250]]),
    achTier('pp_sfound', C.secrets, 'pp_sfound', [[1, 'Off the Path', 'Find a secret hole.', 20], [3, 'Hidden Doors', 'Find 3 secret holes.', 35], [6, 'Secret Keeper', 'Find 6 secret holes.', 55],
      [10, 'Nothing Stays Hidden', 'Find 10 secret holes.', 80], [15, 'Treasure Map', 'Find 15 secret holes.', 110]]),
    achTier('pp_sbeat', C.secrets, 'pp_sbeat', [[1, 'Secret Solved', 'Beat a secret hole.', 25], [3, 'Behind Closed Doors', 'Beat 3 secret holes.', 45], [6, 'Underground Champion', 'Beat 6 secret holes.', 70],
      [10, 'Diamond Hands', 'Beat 10 secret holes.', 100], [15, 'Master of Secrets', 'Beat 15 secret holes.', 140]]),
    achTier('pp_chests', C.trails, 'pp_chests', [[5, 'Treasure Hunter', 'Open 5 chests on the trails.', 10], [25, 'Chest Cracker', 'Open 25 chests.', 25], [75, 'Loot Lover', 'Open 75 chests.', 45],
      [150, 'Hoarder', 'Open 150 chests.', 70], [300, 'Dragon’s Hoard', 'Open 300 chests.', 110]]),
    achTier('pp_puzzles', C.trails, 'pp_puzzles', [[3, 'Puzzler', 'Solve 3 trail puzzles.', 10], [15, 'Brain Teaser', 'Solve 15 trail puzzles.', 25], [40, 'Riddle Master', 'Solve 40 trail puzzles.', 45],
      [80, 'Mastermind', 'Solve 80 trail puzzles.', 70], [150, 'Grand Puzzler', 'Solve 150 trail puzzles.', 110]]),
    achTier('pp_golden', C.trails, 'pp_golden', [[5, 'Gold Rush', 'Find 5 golden balls.', 10], [25, 'Gold Digger', 'Find 25 golden balls.', 25], [75, 'Golden Touch', 'Find 75 golden balls.', 45],
      [150, 'Fort Knox', 'Find 150 golden balls.', 70], [300, 'Midas', 'Find 300 golden balls.', 110]]),
    achTier('pp_trinkets', C.trails, 'pp_trinkets', [[3, 'Keepsake', 'Collect 3 trinkets.', 10], [12, 'Curio Shelf', 'Collect 12 trinkets.', 25], [24, 'Cabinet of Curiosities', 'Collect 24 trinkets.', 45],
      [36, 'Museum Piece', 'Collect 36 trinkets.', 70], [60, 'Curator', 'Collect 60 trinkets.', 110]]),
    achTier('pp_built', C.trails, 'pp_built', [[1, 'Tinkerer', 'Build a putter from its trail parts.', 30], [2, 'Workshop', 'Build 2 putters.', 50], [3, 'Master Builder', 'Build 3 putters.', 80]]),
    achTier('pp_daily', C.daily, 'pp_daily', [[1, 'Daily Putter', 'Play the Daily Hole.', 10], [7, 'Week of Putts', 'Play 7 Daily Holes.', 20], [30, 'Month of Putts', 'Play 30 Daily Holes.', 45],
      [100, 'Daily Devotee', 'Play 100 Daily Holes.', 90], [365, 'Every Day for a Year', 'Play 365 Daily Holes.', 200]]),
    achTier('pp_streak', C.daily, 'pp_streak', [[3, 'On a Roll', 'Play the Daily Hole 3 days running.', 15], [7, 'Week Streak', 'A 7 day Daily Hole streak.', 35], [30, 'Month Streak', 'A 30 day streak.', 90],
      [100, 'Unbroken', 'A 100 day streak.', 200]]),
    achTier('pp_mholes', C.members, 'pp_mholes', [[1, 'Member’s Welcome', 'Beat a Members Tour hole.', 15], [9, 'Front Nine', 'Beat 9 Members Tour holes.', 40], [18, 'Full Round', 'Beat 18 Members Tour holes.', 80]]));
  // each world's own: beat it, perfect it, an ace in it (where a hole can be aced), its secret, its trinkets, its golden balls
  WORLDS.forEach(function(W, w){ var t = W.theme, sec = SECRETS.filter(function(x){ return x.theme === t; })[0];
    out.push({ id:'pp_wc_' + t, cat:C.worlds, name:W.name + ' Beaten', desc:'Beat all 18 holes of ' + W.name + '.', goal:1, pts:40, key:'pp_wc_' + t });
    out.push({ id:'pp_wp_' + t, cat:C.worlds, name:W.name + ' Perfect', desc:'Three stars on every hole of ' + W.name + '.', goal:1, pts:100, key:'pp_wp_' + t });
    if (achAceable(TOURS.main, w)) out.push({ id:'pp_wa_' + t, cat:C.worlds, name:'Ace in ' + W.name, desc:'Make a hole in one in ' + W.name + '.', goal:1, pts:25, key:'pp_wa_' + t });
    if (sec){ out.push({ id:'pp_sf_' + t, cat:C.secrets, name:'Found: ' + sec.name, desc:'Find the secret hole in ' + W.name + '.', goal:1, pts:30, key:'pp_sf_' + t });
      out.push({ id:'pp_sb_' + t, cat:C.secrets, name:sec.name, desc:'Beat the secret hole in ' + W.name + '.', goal:1, pts:50, key:'pp_sb_' + t }); }
    if (TRINKETS[t]) out.push({ id:'pp_tk_' + t, cat:C.worlds, name:W.name + ' Keepsakes', desc:'Collect the three trinkets in ' + W.name + '.', goal:1, pts:30, key:'pp_tk_' + t });
    out.push({ id:'pp_gb_' + t, cat:C.worlds, name:W.name + ' Golden Balls', desc:'Find the golden ball on each of the 18 trails of ' + W.name + '.', goal:1, pts:40, key:'pp_gb_' + t }); });
  MEMBER_WORLDS.forEach(function(W){ var t = W.id;
    out.push({ id:'pp_mc_' + t, cat:C.members, name:W.name + ' Beaten', desc:'Beat all 9 holes of ' + W.name + '.', goal:1, pts:60, key:'pp_mc_' + t });
    out.push({ id:'pp_mp_' + t, cat:C.members, name:W.name + ' Perfect', desc:'Three stars on every hole of ' + W.name + '.', goal:1, pts:120, key:'pp_mp_' + t }); });
  return out; }
// a world can be aced fairly where a hole's three stars is the ace (threeOf 1): an ace achievement only goes where one can
function achAceable(TR, w){ var K = TR.per || PER; for (var n = w * K + 1; n <= Math.min(TR.levels.length, w * K + K); n++){ var L = TR.levels[n - 1]; if (threeOf(L.par, L.three) === 1) return true; } return false; }
function achStats(host){ HOSTX = host || HOSTX; var st = pload(), o = {}, beat = function(tp, TR, n){ var b = tp.best[n]; return b != null && b < TR.levels[n - 1].par; };
  var TR = TOURS.main, tp = st.tours.main, K = TR.per || PER, N = TR.levels.length, holes = 0, stars = 0, worlds = 0, perfect = 0;
  for (var n = 1; n <= N; n++){ if (beat(tp, TR, n)) holes++; stars += starsOf(tp.best[n], TR.levels[n - 1].par, TR.levels[n - 1].three); }
  WORLDS.forEach(function(W, w){ var t = W.theme, all = true, ace = false;
    for (var n = w * K + 1; n <= Math.min(N, w * K + K); n++){ if (!beat(tp, TR, n)) all = false; if (tp.ace[n]) ace = true; }
    var pf = worldStars(tp, TR, w) === worldMax(TR, w), g = goldenOf(st, 'main', w);
    o['pp_wc_' + t] = all ? 1 : 0; o['pp_wp_' + t] = pf ? 1 : 0; o['pp_wa_' + t] = ace ? 1 : 0; o['pp_gb_' + t] = g.have >= g.total ? 1 : 0;
    o['pp_tk_' + t] = (st.tk || []).filter(function(x){ return x.split(':')[0] === t; }).length >= 3 ? 1 : 0;
    if (all) worlds++; if (pf) perfect++; });
  var found = secretsFound(st), won = (st.tours.secret || {}).paid || {};
  SECRETS.forEach(function(x, i){ o['pp_sf_' + x.theme] = found.indexOf(i + 1) >= 0 ? 1 : 0; o['pp_sb_' + x.theme] = won[i + 1] ? 1 : 0; });
  var MT = TOURS.members, mp = st.tours.members, MK = MT.per, mh = 0;
  for (var m = 1; m <= MT.levels.length; m++) if (beat(mp, MT, m)) mh++;
  MEMBER_WORLDS.forEach(function(W, w){ var all = true; for (var m = w * MK + 1; m <= Math.min(MT.levels.length, w * MK + MK); m++) if (!beat(mp, MT, m)) all = false;
    o['pp_mc_' + W.id] = all ? 1 : 0; o['pp_mp_' + W.id] = worldStars(mp, MT, w) === worldMax(MT, w) ? 1 : 0; });
  var chests = 0, puzzles = 0, golden = 0; Object.keys(st.trail || {}).forEach(function(k){ var r = st.trail[k] || {}; chests += (r.ch || []).length; if (r.pz) puzzles++; if (r.g) golden++; });
  // a putter is built once its three parts are found: read off the record, never the closet (whose ownership check
  // can reach the page's achievement count, which asks for these stats)
  var daily = Object.keys(st.daily || {}).filter(function(d){ return st.daily[d] && st.daily[d].done; }).length,
    built = PP_PUTTERS.filter(function(pt){ return partsOf(st, pt.id) >= 3; }).length;
  o.pp_holes = holes; o.pp_stars = stars; o.pp_aces = Object.keys(tp.ace || {}).filter(function(k){ return tp.ace[k]; }).length; o.pp_worlds = worlds; o.pp_perfect = perfect;
  o.pp_sfound = found.length; o.pp_sbeat = SECRETS.filter(function(x, i){ return won[i + 1]; }).length;
  // a gym is a trail puzzle, and the small puzzles already solved still count
  o.pp_chests = chests; o.pp_puzzles = puzzles + gymsWon(st).length; o.pp_golden = golden; o.pp_trinkets = (st.tk || []).length; o.pp_built = built;
  o.pp_daily = daily; o.pp_streak = Math.max((st.streak && st.streak.best) || 0, (st.streak && st.streak.n) || 0); o.pp_mholes = mh;
  return o; }
RTT_PUTT.achDefs = achDefs; RTT_PUTT.achCats = function(){ return Object.keys(ACH_CAT).map(function(k){ return ACH_CAT[k]; }); };
RTT_PUTT.achStats = function(host){ try{ return achStats(host); }catch(e){ return {}; } };
RTT_PUTT.summary = function(host){ HOSTX = host || HOSTX; var st = pload(), dk = today(), dh = dailyHole(dk), rec = st.daily[dk];
  var tm = st.tours.main, lv = Math.min(tm.lv, LEVELS.length), wv = Math.floor((lv - 1) / PER);
  while (wv > 0 && !revealed(TOURS.main, wv, st)) wv--;   // a world still under cloud is not named on the home card either
  return { lv:lv, levels:LEVELS.length, world:WORLDS[wv].name, theme:WORLDS[wv].theme, w:wv + 1, worlds:WORLDS.length, wStars:worldStars(tm, TOURS.main, wv), wMax:worldMax(TOURS.main, wv), members:membersOpen(), lives:st.lives, max:livesMax(), refillAt:st.refillAt || null,
    daily:{ name:dh.name, theme:THEMES[dh.theme].name, kick:THEMES[dh.theme].kick, done:!!(rec && rec.done), s:rec && rec.s, par:rec && rec.par, ms:rec && rec.ms }, nextMs:msToNextDay() }; };
/* THE REWARDS AS CLOSET ITEMS, for the page: every name with its item, whether the record holds it, and where to win it.
   Each reads the record only (rewardRec), so the page can ask while it works out what a player owns. */
RTT_PUTT.rewardItems = function(){ return Object.keys(REWARD_ITEM).map(function(nm){ return { name:nm, key:REWARD_ITEM[nm] }; }); };
RTT_PUTT.rewardOwned = function(x, host){ try{ var nm = rewardKey(x); return !!(nm && rewardRec(host).own[nm]); }catch(e){ return false; } };
RTT_PUTT.rewardHint = function(x, host){ try{ var nm = rewardKey(x); return nm ? rewardHint(nm, rewardRec(host).st) : ''; }catch(e){ return ''; } };
// the checker's door: start a round at a given hole. Nothing on the page calls it.
RTT_PUTT._go = function(mode, arg, i){ if (!S) return; startRound(mode, arg); if (i){ S.round.i = i; playHole(); } };

root.RTT_PUTT = RTT_PUTT;
if (typeof module !== 'undefined' && module.exports) module.exports = RTT_PUTT;
})(typeof self !== 'undefined' ? self : globalThis);
