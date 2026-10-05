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
var M = { OUT:0, GREEN:1, FRINGE:2, ROUGH:3, SAND:4, WATER:5, ICE:6, MUD:7 };
// what each surface rolls like, as a stimp reading (GREEN is the course's own)
var MAT_STIMP = { 2:3.0, 3:1.2, 4:0.3, 6:34, 7:1.4 };

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
function fricOf(C, m){ var s = m === M.GREEN ? C.stimp : (MAT_STIMP[m] || 1); return V_STIMP * V_STIMP / (2 * s); }
// the speed that rolls `ft` feet on flat ground at this course's speed: how the power is set
function speedFor(C, ft){ return Math.min(V_MAX, Math.sqrt(2 * fricOf(C, M.GREEN) * Math.max(0, ft))); }
function feetFor(C, v){ return v * v / (2 * fricOf(C, M.GREEN)); }

function moverAt(o, t){
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
  var walls = C.walls, bums = C.bumpers, movs = C.movers, ports = C.portals;
  for (;;){
    var m = C.mats.at(s.x, s.y);
    /* The grid is a quarter foot and a ball resting on a rail has its centre 0.07 ft inside it, so the
       nearest grid point can be outside. OUT is only believed once the exact shape agrees. */
    if (m === M.OUT) m = C.matFn(s.x, s.y);
    if (m === M.WATER){ out.water = true; out.ev.push([t, 'water']); break; }
    if (m === M.OUT){ out.out = true; out.ev.push([t, 'out']); break; }
    var gx = C.field.gx(s.x, s.y), gy = C.field.gy(s.x, s.y);
    var ax = -ROLL * G * gx, ay = -ROLL * G * gy, sp = Math.hypot(s.vx, s.vy), af = fricOf(C, m), sl = Math.hypot(ax, ay);
    if (over){ ax = 0; ay = 0; }   // over the hole the ball is falling, not rolling
    if (sp < STOP_V && !over && sl <= af){ break; }
    if (sp > 1e-9 && !over){ var dvx = -af * s.vx / sp * DT, dvy = -af * s.vy / sp * DT;
      // friction can stop a ball, never send it backwards
      if (sl <= af && dvx * dvx + dvy * dvy >= sp * sp){ s.vx = 0; s.vy = 0; } else { s.vx += dvx; s.vy += dvy; } }
    s.vx += ax * DT; s.vy += ay * DT;
    s.x += s.vx * DT; s.y += s.vy * DT;
    var hit = false, i;
    for (i = 0; i < walls.length; i++){ var w = walls[i]; if (hitSeg(s, w[0], w[1], w[2], w[3], w[4], w[5])) hit = true; }
    for (i = 0; i < bums.length; i++){ var bm = bums[i]; if (hitCircle(s, bm.x, bm.y, bm.r, bm.e)) hit = true; }
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
        var v = Math.max(2.4, Math.hypot(s.vx, s.vy) * 0.9); s.x = p.bx; s.y = p.by; s.vx = p.dx * v; s.vy = p.dy * v;
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
    if (t > MAX_T) break;
  }
  out.t = t; out.rest = [s.x, s.y]; out.pts.push([s.x, s.y, t]);
  return out;
}

/* ============================================================================ a course, assembled */
function finishCourse(C){
  C.walls = C.walls || []; C.bumpers = C.bumpers || []; C.movers = C.movers || []; C.portals = C.portals || [];
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
  beach:{ light:true, name:'Seashell Shores', kick:'Summer', bg:'#f1dc9c', bg2:'#e8d08a', carpet:'#1ea77d', carpet2:'#1b9a73', wall:'#ffffff', wallHi:'#ffffff', wallLo:'#9fd8e6', ink:'#1b3a4a',
    haz:'water', hazCol:'#22a7e0', hazCol2:'#8fdcff', hazName:'Tide pool', slow:'mud', slowCol:'#f5e2a5', slowName:'Soft sand',
    bumper:'beachball', block:'castle', spinner:'#ffd23f', slider:'surfboard', tunnel:'shell', flag:'#ff5a3c',
    decor:['palm', 'umbrella', 'crab', 'castle'], acc:'#ff5a3c',
    holes:['Low Tide', 'Sandcastle', 'Crab Walk', 'The Lighthouse', 'Tide Pool', 'Boardwalk', 'Shell Game', 'Surf’s Up', 'Sunset'] }
};
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
    H.movers.push({ k:'spin', x:0, y:y0 + 2.2, len:2.3, hub:0.32, arms:4, w:0.32, omega:(r() < 0.5 ? 1 : -1) * (1.15 + r() * 0.5), phase:r() * 6.28, skin:T.spinner });
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
    H.movers.forEach(function(m){ if (m.k === 'spin'){ m.x = -m.x; m.omega = -m.omega; m.phase = Math.PI - m.phase; } else { m.ax = -m.ax; m.bx = -m.bx; } });
    H.portals.forEach(function(p){ p.ax = -p.ax; p.bx = -p.bx; p.dx = -p.dx; });
    H.zones.forEach(function(z){ if (z.t === 'rect'){ var a = -z.x1, b = -z.x0; z.x0 = a; z.x1 = b; } else z.x = -z.x; });
    H.comps.forEach(function(c){ if ('x' in c) c.x = -c.x; if ('gx' in c) c.gx = -c.gx; if ('x0' in c) c.x0 = -c.x0; if ('ux' in c) c.ux = -c.ux; if ('nx' in c) c.nx = -c.nx; });
    H.flats.forEach(function(f){ f.x = -f.x; });
    if (H.mill) H.mill.x = -H.mill.x;
  }
  if (extra) ornament(H, r, T, extra);
  var xs = H.poly.map(function(p){ return p[0]; }), ys = H.poly.map(function(p){ return p[1]; });
  var pad = 6, b = [Math.min.apply(null, xs) - pad, Math.min.apply(null, ys) - pad, Math.max.apply(null, xs) + pad, Math.max.apply(null, ys) + pad];
  var C = { kind:'mini', tpl:tplName, theme:themeId, T:T, name:label || tplName, bounds:b, poly:H.poly, comps:H.comps, flats:H.flats,
    stimp:themeId === 'winter' ? 9.5 : 9, cup:H.cup, cupR:CUP_R_MINI, tee:H.tee, par:H.par,
    walls:polyWalls(H.poly, 0, 0.72).concat(H.walls), bumpers:H.bumpers, blocks:H.blocks, movers:H.movers, portals:H.portals, zones:H.zones, mill:H.mill, seed:seed };
  C.matFn = function(x, y){
    if (!inPoly(H.poly, x, y)) return M.OUT;
    var m = M.GREEN;
    for (var i = 0; i < H.zones.length; i++){ var z = H.zones[i];
      if (z.t === 'rect' ? (x >= Math.min(z.x0, z.x1) && x <= Math.max(z.x0, z.x1) && y >= Math.min(z.y0, z.y1) && y <= Math.max(z.y0, z.y1)) : Math.hypot(x - z.x, y - z.y) <= z.r) m = z.m; }
    return m;
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
    if (H.movers.some(function(m){ return m.k === 'spin' ? Math.hypot(m.x - x, m.y - y) < m.len + need + 0.9 : segDist(x, y, m.ax, m.ay, m.bx, m.by) < m.len / 2 + need + 0.9; })) return false;
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
    var near = false; for (var i = 0; i < C.poly.length && !near; i++){ var a = C.poly[i], c = C.poly[(i + 1) % C.poly.length]; if (segDist(x, y, a[0], a[1], c[0], c[1]) < s + 0.9) near = true; }
    if (near || inPoly(C.poly, x, y)) continue;
    if (out.some(function(o){ return Math.hypot(o.x - x, o.y - y) < (o.s + s) * 0.8; })) continue;
    out.push({ x:x, y:y, s:s, k:T.decor[Math.floor(r() * T.decor.length)] });
  }
  return out;
}
function themedCourse(themeId){
  var T = THEMES[themeId];
  return COURSE_ORDER.map(function(tpl, i){ return { tpl:tpl, seed:hstr('course:' + themeId + ':' + i), theme:themeId, name:T.holes[i], n:i + 1 }; });
}
function dailyHole(dayKey){
  var th = themeForDay(dayKey), seed = hstr('daily:' + dayKey), r = mulberry(seed);
  // the shapes go round in a shuffled cycle, the way the game deals its daily courses, so two days
  // running are never the same shape of hole
  var dn = Math.floor(Date.UTC(+dayKey.slice(0, 4), +dayKey.slice(5, 7) - 1, +dayKey.slice(8, 10)) / 86400000), L = DAILY_POOL.length;
  var cyc = DAILY_POOL.slice(), cr = mulberry(hstr('cycle:' + Math.floor(dn / L)));
  for (var i = cyc.length - 1; i > 0; i--){ var j = Math.floor(cr() * (i + 1)), t = cyc[i]; cyc[i] = cyc[j]; cyc[j] = t; }
  var tpl = cyc[((dn % L) + L) % L], T = THEMES[th];
  return { tpl:tpl, seed:seed, theme:th, name:T.holes[Math.floor(r() * T.holes.length)], day:dayKey, extra:2 };
}
function buildFrom(desc){ return buildMini(desc.tpl, desc.seed, desc.theme, desc.name, desc.extra || 0); }

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
  buildMini:buildMini, buildFrom:buildFrom, themedCourse:themedCourse, dailyHole:dailyHole, themeForDay:themeForDay, scoreName:scoreName
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
  coffin:function(u, v){ var w = 0.55 + (v < -0.4 ? (v + 1) * 0.6 : 0.36 - (v + 0.4) * 0.28); if (Math.abs(u) > w || Math.abs(v) > 0.95) return null; if (Math.abs(u) > w - 0.14 || Math.abs(v) > 0.82) return '#2a1810';
    if ((Math.abs(u) < 0.07 && v > -0.6 && v < 0.2) || (Math.abs(v + 0.35) < 0.07 && Math.abs(u) < 0.25)) return '#c9a227'; return '#5a3a24'; }
};
RTT_PUTT.SKIN = SKIN;   // hole3d.js builds a bumper's 3D shape from the same skin the flat painter uses
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
    else if (m === M.SAND){ c = n < 0.12 ? pal.speck : pal.sand; }
    else if (m === M.WATER){ c = real ? (((i * 3 + j * 5) % 23 === 0) ? pal.ripple : pal.water) : ((((i + (j >> 1) * 3) % 17) === 0) ? pal.haz2 : pal.haz); }
    else if (m === M.ICE){ c = (((i + j) % 11) < 2) ? pal.haz2 : pal.haz; }
    else if (m === M.MUD){ c = n < 0.22 ? shade(pal.slow, -0.18) : pal.slow; }
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
      var d = 1e9; for (var e = 0; e < C.poly.length; e++){ var p = C.poly[e], q = C.poly[(e + 1) % C.poly.length]; d = Math.min(d, segDist(x3, y3, p[0], p[1], q[0], q[1])); }
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
.pt-card td:last-child{text-align:right;font-weight:800}';

var S = null;   // the open game, or null
function el(html){ var d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
function load(){ try{ return JSON.parse(localStorage.getItem('bag_putt_v1')) || {}; }catch(e){ return {}; } }
function save(st){ try{ localStorage.setItem('bag_putt_v1', JSON.stringify(st)); }catch(e){} }
/* The game's day key is a NUMBER (20261005), Eastern; this module's is the ISO string. Read the game's
   so the daily turns over when the rest of the game does, and write it the way this file reads it. */
function today(){ try{ var k = String(S.host.todayKey()); if (/^\d{8}$/.test(k)) return k.slice(0, 4) + '-' + k.slice(4, 6) + '-' + k.slice(6, 8); if (/^\d{4}-\d{2}-\d{2}$/.test(k)) return k; }catch(e){} return new Date().toISOString().slice(0, 10); }
function fmtPar(d){ return d === 0 ? 'E' : (d > 0 ? '+' + d : String(d)); }

function open(host){
  if (S) close();
  if (!document.getElementById('pt-css')){ var st = document.createElement('style'); st.id = 'pt-css'; st.textContent = CSS; document.head.appendChild(st); }
  var ov = el('<div class="pt-ov" role="dialog" aria-modal="true" aria-label="Putting Green"></div>');
  document.body.appendChild(ov);
  S = { host:host || {}, ov:ov, prevOverflow:document.body.style.overflow };
  document.body.style.overflow = 'hidden';
  S.onKey = function(e){ onKey(e); }; window.addEventListener('keydown', S.onKey);
  showMenu();
}
function close(){
  if (!S) return;
  cancelAnimationFrame(S.raf); window.removeEventListener('keydown', S.onKey); if (S.onResize) window.removeEventListener('resize', S.onResize);
  document.body.style.overflow = S.prevOverflow || ''; S.ov.remove();
  var h = S.host; S = null; try{ if (h.onClose) h.onClose(); }catch(e){}
}
function top(title, sub, right){
  return '<div class="pt-top"><button class="pt-x" data-x>' + (S.screen === 'menu' ? 'Close' : 'Back') + '</button><div class="pt-hd"><b>' + esc(title) + '</b><span>' + esc(sub) + '</span></div><div class="pt-sc">' + (right || '') + '</div></div>';
}

/* ----------------------------------------------------------------------------------- the menu */
function showMenu(){
  cancelAnimationFrame(S.raf); S.screen = 'menu'; S.play = null;
  var h = S.host, dk = today(), dh = dailyHole(dk), dT = THEMES[dh.theme], st = load(), drec = (st.daily || {})[dk];
  var nowTh = themeForDay(dk);
  var ck = S.tourKey; try{ if (!ck && h.dailyCourseKey) ck = h.dailyCourseKey(h.todayKey()); }catch(e){} ck = (h.courses && h.courses[ck]) ? ck : (h.keys && h.keys[0]);
  var cname = (h.courses && h.courses[ck] && h.courses[ck].v) || ck || 'Tour course';
  var dInk = dT.light ? dT.ink : '#fff';
  var themes = Object.keys(THEMES).sort(function(a, b){ return (a === nowTh ? -1 : 0) - (b === nowTh ? -1 : 0); });
  var opts = (h.keys || []).map(function(k){ return '<option value="' + esc(k) + '"' + (k === ck ? ' selected' : '') + '>' + esc(h.courses[k].v || k) + '</option>'; }).join('');
  var tb = (st.tour || {})[ck];
  S.ov.innerHTML = top('Putting Green', 'Tester preview · not live yet') + '<div class="pt-menu">\
    <button class="pt-card" data-daily style="background:linear-gradient(160deg,' + dT.bg2 + ',' + dT.bg + ');border-color:' + dT.acc + '">\
      <div class="k" style="color:' + dInk + ';opacity:.8">Daily hole · ' + esc(dT.kick) + '</div><div class="t" style="color:' + dInk + '">' + esc(dh.name) + '</div>\
      <div class="m" style="color:' + dInk + '">' + esc(dT.name) + '. One hole, the same for everyone today.' + (drec ? ' Best today: ' + drec.best + (drec.first ? ' (first try ' + drec.first + ')' : '') + '.' : '') + '</div>\
      <span class="g" style="color:' + (dT.light ? dT.ink : '#F1D04A') + '">' + (drec ? 'Play again' : 'Play today’s hole') + ' ▸</span></button>\
    <div class="pt-sh">TOUR GREENS</div>\
    <div class="pt-card" style="cursor:default"><div class="k">Real greens · 9 putts</div><div class="t">' + esc(cname) + '</div>\
      <div class="m">The real greens from Run The Tour, same shape and same pins. Read the break, lag it close, hole out. Par is 2 a green.' + (typeof tb === 'number' ? ' Best: ' + fmtPar(tb) + '.' : '') + '</div>\
      <select class="pt-sel" data-course aria-label="Course">' + opts + '</select>\
      <button class="pt-go" data-tour style="margin-top:10px;width:100%">Putt these greens ▸</button></div>\
    <div class="pt-sh">THEMED COURSES · 9 HOLES</div><div class="pt-grid">' +
    themes.map(function(id){ var T = THEMES[id], best = (st.courses || {})[id];
      return '<button class="pt-th' + (id === nowTh ? ' now' : '') + '" data-th="' + id + '" style="background:linear-gradient(160deg,' + T.bg2 + ',' + T.bg + ');color:' + (T.light ? T.ink : '#fff') + '">\
        <div class="k">' + esc(T.kick) + (id === nowTh ? ' · now' : '') + '</div><div class="t">' + esc(T.name) + '</div><div class="m">' + (best != null ? 'Best ' + fmtPar(best) : '9 holes') + '</div></button>'; }).join('') +
    '</div></div>';
  S.ov.querySelector('[data-x]').onclick = close;
  S.ov.querySelector('[data-daily]').onclick = function(){ startRound('daily'); };
  S.ov.querySelector('[data-course]').onchange = function(e){ S.tourKey = e.target.value; showMenu(); };
  S.ov.querySelector('[data-tour]').onclick = function(){ startRound('tour', ck); };
  S.ov.querySelectorAll('[data-th]').forEach(function(b){ b.onclick = function(){ startRound('course', b.getAttribute('data-th')); }; });
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
  C.tee = spot || [C.cup[0], C.cup[1] + 6]; C.par = 2; C.name = spec.name; C.sub = spec.sub;
  return C;
}
function playHole(){
  var R = S.round, d = R.holes[R.i], C = buildHole(d);
  S.screen = 'play';
  S.play = { C:C, ball:C.tee.slice(), prev:C.tee.slice(), strokes:0, state:'aim', aimAng:Math.atan2(C.cup[1] - C.tee[1], C.cup[0] - C.tee[0]),
    target:C.cup.slice(), firstFt:Math.hypot(C.cup[0] - C.tee[0], C.cup[1] - C.tee[1]), pow:0, trail:null, read:C.kind === 'real', clock0:performance.now() / 1000, art:null, v3:null, cam:null, cap:C.kind === 'real' ? 5 : C.par + 3 };
  var cached = !d.real && v3Ok() && ((S.v3c && S.v3c[v3Key(d)]) || (S.v3job && S.v3job.k === v3Key(d) && v3Get(d, C)));
  if (cached) S.play.v3 = cached; else if (d.real || !v3Ok()) S.play.art = paintCourse(C);
  var sub = C.kind === 'real' ? (C.sub + ' · Putt ' + (R.i + 1) + ' of ' + R.holes.length) : (R.mode === 'daily' ? (R.kick + ' · Par ' + C.par) : ('Hole ' + (R.i + 1) + ' of 9 · Par ' + C.par));
  S.ov.innerHTML = top(C.kind === 'real' ? R.title : (R.mode === 'daily' ? R.title : d.name), sub, '') + '<div class="pt-stage"><canvas></canvas><div class="pt-read" hidden></div></div>\
    <div class="pt-bar">' + (C.kind === 'real' ? '<button class="pt-bt" data-l aria-label="Aim left">◂</button><button class="pt-bt" data-r aria-label="Aim right">▸</button>' : '') +
    '<div class="pt-hint" data-hint></div><button class="pt-bt' + (S.play.read ? ' on' : '') + '" data-read>Read</button></div>';
  S.ov.querySelector('[data-x]').onclick = function(){ showMenu(); };
  S.ov.querySelector('[data-read]').onclick = function(e){ S.play.read = !S.play.read; e.currentTarget.classList.toggle('on', S.play.read); };
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
  sc.innerHTML = R.holes.length > 1 ? '<b>' + fmtPar(tot - par) + '</b>Stroke ' + (P.strokes + 1) : '<b>' + P.strokes + '</b>' + (P.strokes === 1 ? 'stroke' : 'strokes');
  var hint = S.ov.querySelector('[data-hint]');
  if (hint) hint.textContent = C.kind === 'real' ? 'Drag the ring to aim. Pull back anywhere to set the pace, let go to putt.' : 'Pull back from anywhere and let go. Further back hits it harder.';
}

/* --------------------------------------------------------------------------------- the camera */
function camFor(P){
  var C = P.C, W = S.cv.width, H = S.cv.height, b = C.bounds, dpr = S.dpr;
  if (P.v3){
    // the course and a little of its land fill the stage, at a whole number of screen pixels per art pixel
    var V = P.v3, xs = C.poly.map(function(p){ return p[0]; }), ys = C.poly.map(function(p){ return p[1]; });
    var x0 = Math.min.apply(null, xs) - 6.5, x1 = Math.max.apply(null, xs) + 6.5, y0 = Math.min.apply(null, ys) - 5, y1 = Math.max.apply(null, ys) + 3, zc = 0.35;   // room for the land round it, which is half the point
    var a0 = V.pr(x0, y0, zc + 1.2), a1 = V.pr(x1, y1, zc);
    var kk = Math.max(1, Math.floor(Math.min(W / (a1[0] - a0[0]), H / (a1[1] - a0[1]))));
    var cxA = (a0[0] + a1[0]) / 2, cyA = (a0[1] + a1[1]) / 2, ox = Math.round(W / 2 - cxA * kk), oy = Math.round(H / 2 - cyA * kk), iw = V.cv.width * kk, ih = V.cv.height * kk;
    ox = iw >= W ? clamp(ox, W - iw, 0) : Math.round((W - iw) / 2); oy = ih >= H ? clamp(oy, H - ih, 0) : Math.round((H - ih) / 2);
    return { v3:V, k:kk, ox:ox, oy:oy, s:kk / ART };
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
  if (e.key === 'Escape'){ e.preventDefault(); if (S.screen === 'menu') close(); else showMenu(); return; }
  var P = S.play; if (!P || P.state !== 'aim') return;
  var fine = e.shiftKey ? 0.2 : 1;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight'){ e.preventDefault(); var s = e.key === 'ArrowLeft' ? -1 : 1;
    if (P.C.kind === 'real') aimNudge(s * 0.0035 * fine * 2); else P.aimAng += s * 0.012 * fine; }
  else if (e.key === 'ArrowUp' || e.key === 'ArrowDown'){ e.preventDefault(); P.pow = clamp(P.pow + (e.key === 'ArrowUp' ? 1 : -1) * 0.01 * fine, 0, 1); }
  else if ((e.key === ' ' || e.key === 'Enter') && P.pow > 0.02){ e.preventDefault(); strike(); }
}
function maxFt(C){ return C.kind === 'real' ? 60 : 42; }
function strike(){
  var P = S.play, C = P.C, ft = P.pow * maxFt(C), v = speedFor(C, ft), a = C.kind === 'real' ? Math.atan2(P.target[1] - P.ball[1], P.target[0] - P.ball[0]) : P.aimAng;
  var t0 = performance.now() / 1000 - P.clock0;
  P.shot = simulate(C, P.ball[0], P.ball[1], Math.cos(a) * v, Math.sin(a) * v, t0);
  P.shotStart = performance.now(); P.shotAng = a; P.strokes++; P.state = 'roll'; P.pow = 0; P.evI = 0; P.prev = P.ball.slice(); P.lastFt = ft;
  P.trail = P.shot.pts; hud();
}
function sound(k){ var h = S.host;
  try{ if (k === 'cup'){ h.sfx && h.sfx('hole'); h.buzz && h.buzz([12, 40, 18]); } else if (k === 'wall'){ h.buzz && h.buzz(6); } else if (k === 'water'){ h.buzz && h.buzz([30, 30, 30]); } }catch(e){} }

/* ------------------------------------------------------------------------------- each frame */
function frame(){
  if (!S || S.screen !== 'play') return;
  S.raf = requestAnimationFrame(frame);
  var P = S.play, C = P.C, ctx = S.cv.getContext('2d'), W = S.cv.width, H = S.cv.height, now = performance.now() / 1000, clock = now - P.clock0;
  v3Tick();
  // where the ball is: at rest, or partway along the putt it is playing back
  var bx = P.ball[0], by = P.ball[1], falling = 0;
  if (P.state === 'roll'){
    var el2 = (performance.now() - P.shotStart) / 1000, pts = P.shot.pts, i = 0;
    while (i < pts.length - 1 && pts[i + 1][2] <= el2) i++;
    var a = pts[i], b = pts[Math.min(pts.length - 1, i + 1)], f = b[2] > a[2] ? clamp((el2 - a[2]) / (b[2] - a[2]), 0, 1) : 1;
    if (b[3]) f = 0;
    bx = a[0] + (b[0] - a[0]) * f; by = a[1] + (b[1] - a[1]) * f;
    while (P.evI < P.shot.ev.length && P.shot.ev[P.evI][0] <= el2){ sound(P.shot.ev[P.evI][1]); P.evI++; }
    if (P.shot.holed && el2 > P.shot.t) falling = clamp((el2 - P.shot.t) / 0.25, 0, 1);
    if (el2 > P.shot.t + (P.shot.holed ? 0.3 : 0.15)) settle();
  }
  // the camera eases toward its target rather than jumping
  /* A real green opens on the WHOLE green, its shape and its bunkers, the way the hole view shows it,
     and then settles in on the putt: the flyover a broadcast does before a player stands over it. */
  var tgt = camFor(P);
  if (!P.camNow && C.kind === 'real'){ var bb = C.bounds, sw = Math.min(S.cv.width / (C.spec.rx * 2.5), S.cv.height / (C.spec.ry * 2.5));
    P.camNow = { s:sw, cx:0, cy:0 }; P.intro = performance.now(); }
  if (!P.camNow || C.kind !== 'real') P.camNow = tgt;   // a mini hole holds still: the whole hole is the shot
  else if (P.state === 'aim'){ var c0 = P.camNow, e = (P.intro && performance.now() - P.intro < 1500) ? (performance.now() - P.intro < 700 ? 0 : 0.05) : 0.16; P.camNow = { s:c0.s + (tgt.s - c0.s) * e, cx:c0.cx + (tgt.cx - c0.cx) * e, cy:c0.cy + (tgt.cy - c0.cy) * e };
    if (Math.abs(P.camNow.s - tgt.s) < 0.02) P.camNow.s = tgt.s; }
  var cam = P.camNow;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false;
  var bg = C.kind === 'real' ? ((C.biome && C.biome.base) || '#5f8a30') : C.T.bg; ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  if (cam.v3) ctx.drawImage(cam.v3.cv, cam.ox, cam.oy, cam.v3.cv.width * cam.k, cam.v3.cv.height * cam.k);
  else { var o = w2s(cam, C.bounds[0], C.bounds[1]), k = cam.s * ART;
    ctx.drawImage(P.art, Math.round(o[0]), Math.round(o[1]), Math.round(P.art.width * k), Math.round(P.art.height * k)); }
  if (C.movers.length) (cam.v3 ? drawMovers3 : drawMovers)(ctx, C, cam, clock);
  if (cam.v3 && cam.v3.mill) drawSails(ctx, C, cam, clock);
  if (P.read) drawRead(ctx, C, cam);
  drawCup(ctx, C, cam, Math.hypot(bx - C.cup[0], by - C.cup[1]));
  if (P.trail && P.state === 'aim') drawTrail(ctx, cam, P.trail);
  if (P.state === 'aim') drawAim(ctx, P, cam);
  // the golfer stands at the ball while aiming, and holds the follow through a moment once it is struck
  if ((P.state === 'aim' && !(P.intro && performance.now() - P.intro < 1300)) || (P.state === 'roll' && performance.now() - P.shotStart < 900)) drawGolfer(ctx, P, cam);
  drawBall(ctx, cam, bx, by, falling);
  readChip(P, bx, by);
}
function settle(){
  var P = S.play, sh = P.shot, C = P.C;
  if (sh.water || sh.out){ P.strokes++; P.ball = P.prev.slice(); toast(sh.water ? ((C.T && C.T.hazName) || 'Water') + '. One stroke, and it goes back.' : 'Out. One stroke, and it goes back.'); }
  else P.ball = sh.rest.slice();
  P.state = 'aim'; P.shot = null;
  if (sh.holed){ return holeOut(); }
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
    var segs = moverAt(m, t), w = Math.max(m.w * cam.s, 3), h = m.k === 'spin' ? 0.45 : 0.6;
    segs.sort(function(a, b){ return (a[1] + a[3]) - (b[1] + b[3]); });   // the far blade first
    segs.forEach(function(s){ bar3(ctx, cam, s, w, h, m.k === 'spin' ? T.spinner : T.wall, m.k === 'spin' ? '#3a2a1a' : T.wallLo, T.ink); });
    if (m.k === 'spin'){ var z = cam.v3.zAt(m.x, m.y), c = w2s(cam, m.x, m.y, z + h + 0.05); ctx.fillStyle = T.ink; ctx.beginPath(); ctx.arc(c[0], c[1], m.hub * cam.s + 2, 0, 6.29); ctx.fill();
      ctx.fillStyle = T.wallHi; ctx.beginPath(); ctx.arc(c[0], c[1], m.hub * cam.s, 0, 6.29); ctx.fill(); }
  });
}
// the windmill's sails turn with its paddles, on the face of the tower
function drawSails(ctx, C, cam, t){
  var M3 = cam.v3.mill, sp = null; C.movers.forEach(function(m){ if (m.k === 'spin' && !sp) sp = m; });
  var th = sp ? sp.phase + sp.omega * t * 0.6 : t * 0.7, T = C.T;
  for (var a = 0; a < 4; a++){
    var ang = th + a * Math.PI / 2, ca = Math.cos(ang), sa = Math.sin(ang), pts = [[0.35, -0.08], [M3.r, -0.08], [M3.r, 0.85], [0.6, 0.85]].map(function(q){
      return w2s(cam, M3.x + ca * q[0] - sa * q[1], M3.y, M3.z + sa * q[0] + ca * q[1]); });
    ctx.fillStyle = '#efe6cf'; ctx.strokeStyle = '#4a2c14'; ctx.lineWidth = Math.max(1.5, cam.s * 0.07);
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (var i = 1; i < 4; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); ctx.fill(); ctx.stroke();
    var e = w2s(cam, M3.x + ca * M3.r, M3.y, M3.z + sa * M3.r), o = w2s(cam, M3.x, M3.y, M3.z);
    ctx.lineWidth = Math.max(2, cam.s * 0.12); ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(e[0], e[1]); ctx.stroke();
  }
  var hb = w2s(cam, M3.x, M3.y, M3.z); ctx.fillStyle = T.ink; ctx.beginPath(); ctx.arc(hb[0], hb[1], Math.max(3, cam.s * 0.32), 0, 6.29); ctx.fill();
}
function drawRead(ctx, C, cam){
  var step = C.kind === 'real' ? 3 : 2, b = C.bounds, s = cam.s;
  for (var y = b[1] + step / 2; y < b[3]; y += step) for (var x = b[0] + step / 2; x < b[2]; x += step){
    var m = C.mats.at(x, y); if (m !== M.GREEN && m !== M.FRINGE) continue;
    var gx = C.field.gx(x, y), gy = C.field.gy(x, y), g = Math.hypot(gx, gy); if (g < 0.003) continue;
    var p = w2s(cam, x, y); if (p[0] < -20 || p[1] < -20 || p[0] > S.cv.width + 20 || p[1] > S.cv.height + 20) continue;
    var Lw = Math.min(step * 0.42, 0.6 + g * 22), wx = -gx / g, wy = -gy / g, pa = w2s(cam, x - wx * Lw / 2, y - wy * Lw / 2), pb = w2s(cam, x + wx * Lw / 2, y + wy * Lw / 2);
    var L = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) || 1, ux = (pb[0] - pa[0]) / L, uy = (pb[1] - pa[1]) / L;
    var col = g < 0.015 ? 'rgba(160,220,255,.75)' : g < 0.03 ? 'rgba(255,240,140,.85)' : 'rgba(255,120,90,.9)';
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = Math.max(1.2, s * 0.06);
    ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.stroke();
    var hx = pb[0], hy = pb[1], hs = Math.max(3, L * 0.32);
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx - ux * hs - uy * hs * 0.6, hy - uy * hs + ux * hs * 0.6); ctx.lineTo(hx - ux * hs + uy * hs * 0.6, hy - uy * hs - ux * hs * 0.6); ctx.closePath(); ctx.fill();
  }
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
function drawBall(ctx, cam, x, y, fall){
  var p = w2s(cam, x, y), r = Math.max(BALL_R * cam.s, 3.6 * S.dpr) * (1 - fall * 0.55);
  if (fall >= 1) return;
  if (cam.v3){   // in 3D the ball sits ON the carpet: its shadow on the ground, the ball a radius up
    ctx.fillStyle = 'rgba(0,0,0,.32)'; ctx.beginPath(); ctx.ellipse(p[0] + r * 0.3, p[1] + r * 0.1, r * 1.05, r * 0.6, 0, 0, 6.29); ctx.fill();
    p = [p[0], p[1] - r * cam.v3.ce * (1 - fall)];
  } else { ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.arc(p[0] + r * 0.35, p[1] + r * 0.4, r, 0, 6.29); ctx.fill(); }
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
function drawGolfer(ctx, P, cam){
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
// the checker's door: start a round at a given hole. Nothing on the page calls it.
RTT_PUTT._go = function(mode, arg, i){ if (!S) return; startRound(mode, arg); if (i){ S.round.i = i; playHole(); } };

root.RTT_PUTT = RTT_PUTT;
if (typeof module !== 'undefined' && module.exports) module.exports = RTT_PUTT;
})(typeof self !== 'undefined' ? self : globalThis);
