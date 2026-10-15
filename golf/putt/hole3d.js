/* golf/putt/hole3d.js: a Putting Green mini golf hole drawn as a small 3D scene in the golfer's style.

   The hole, its rails, its bumpers and blocks, and the land around it (golf/putt/land.js) are built as
   a height field and a handful of voxel solids, then painted by PXHD, the same renderer that draws the
   profile golfer and the 3D course. So the carpet, a pumpkin bumper and a lighthouse on the point are
   lit, ramped and outlined exactly the way the golfer is.

   It draws only what stands still. The ball, the cup, the aim, the windmill's paddles and sails and
   the sliders move, so putt.js draws them every frame through the projection this hands back:

     render(C) -> { cv, pr(x, y, z) -> [px, py], un(px, py, z) -> [x, y], zAt(x, y), mill, se, ce }
     slices(C) -> step(ms): the same render spread across frames. Each call works for at most ms
                  milliseconds and answers null until it is done, then the result. A hole rendered
                  ahead while another is played must never cost a frame, so the work is a sequence of
                  small steps: the ground a few rows at a time, each solid on its own, the paint in bands.

   cv is one pixel per ART feet across. pr maps a point on the hole (feet, x east, y south, z up) to a
   pixel of cv. zAt is the height the ball rolls on, the same surface the picture shows. If this file
   is blocked or a draw throws, putt.js keeps the flat painter it always had.

   The slope of the carpet is real and tiny (a few hundredths), so the picture exaggerates it by K for
   the eye. The physics never reads any of this. */
/* EVERYTHING BELOW IS INSIDE THIS WRAPPER, and it has to be. This is a plain script, so a top level
   function declaration is a global, and golf/index.html's own render() is the game's whole screen
   painter. Unwrapped, this file's render(C) replaced it the moment the deferred script ran, so every
   tap on every screen called the 3D hole painter with nothing and threw: the whole game stopped
   responding, for everybody, not just testers. Only RTT_PUTT_3D leaves this function. */
(function(){
window.RTT_PUTT_3D = { API_VERSION: 1, render: render, slices: slices, pack: pack, unpack: unpack, ELEV: 42 };

function render(C, opt){ var g = steps(C, opt), r; do { r = g.next(); } while (!r.done); return r.value; }
function slices(C, opt){ var g = steps(C, opt), out = null;
  return function(ms){ if (out) return out; var t0 = performance.now();
    do { var r = g.next(); if (r.done){ out = r.value; return out; } } while (performance.now() - t0 < ms);
    return null; }; }

function* steps(C, opt){
  opt = opt || {};
  var P = window.RTT_PUTT, M = P.M, ART = opt.art || P.ART, SK = P.SKIN, PX = window.PXHD, LAND = window.RTT_PUTT_LAND;
  var T = C.T, F = C.field, elev = opt.elev || 42;
  var D2R = Math.PI / 180, se = Math.sin(elev * D2R), ce = Math.cos(elev * D2R);
  var SC = opt.scene || null;   // a scene with no course in it (a trail, or one prop): its own bounds and land
  /* FINE (opt.fine): a picture painted on a finer grid (opt.art, a twelfth of a foot) so a hole reads as clearly as the
     golfer does. The textures keep their size in the world, not in pixels: the land's cells (ti, tj) stay a quarter foot,
     and the carpet's tufts and the water's glints are worked out on that cell (TR pixels across) with a glint one pixel
     wide inside it. The ground is laid one point a pixel (its rows still overlap at this camera), and no solid is
     sampled coarser than its pixels. Without opt.fine every one of these is exactly what it was. */
  var FINE = !!opt.fine, TCELL = FINE ? 0.25 : ART, TR = Math.max(1, Math.round(TCELL / ART));
  // a twelfth of a foot is not exact in floating point, so a point laid on column i can land a hair under it and leave a gap
  var EPS = FINE ? 1e-6 : 0;
  var AP = C.allPts || C.poly, pxs = AP.map(function(p){ return p[0]; }), pys = AP.map(function(p){ return p[1]; });
  var TZ = C.tierAt || function(){ return 0; };
  var b = [Math.min.apply(null, pxs) - 11, Math.min.apply(null, pys) - 15, Math.max.apply(null, pxs) + 11, Math.max.apply(null, pys) + 5];
  var K = opt.k || 2, zMax = (opt.scene && opt.scene.zMax) || 14;
  // a tall phone wants a tall picture: grow the land north and south until it has the stage's shape, so a wide hole never sits on a bare band
  // measured against the width the camera shows (the course and its margins), not the whole picture
  if (SC) b = SC.b.slice();
  if (opt.aspect && !SC){ var iw = Math.max.apply(null, pxs) - Math.min.apply(null, pxs) + 13, ih = (b[3] - b[1]) * se + zMax * ce, need = opt.aspect * iw - ih;
    if (need > 0){ var ext = Math.min(need / se, 40); b[1] -= ext * 0.55; b[3] += ext * 0.45; } }
  var W = Math.floor((b[2] - b[0]) / ART) + 1, Hh = Math.ceil(((b[3] - b[1]) * se + zMax * ce) / ART) + 4;
  var oy = zMax * ce / ART + 2 - b[1] * se / ART;
  var S = new PX.Sprite(W, Hh), Z = new Float32Array(W * Hh).fill(-1e9);
  /* THE CONSOLE PASS (opt.fx). The height of every pixel's surface and a top-down height map of the whole
     scene are kept while it is built, so once it is painted the sun can cast real shadows across it, the
     corners can darken where things meet, the far land can sit in haze and the whole picture can be graded.
     It never moves a pixel: it only relights the ones already there, so the pixel art stays the pixel art. */
  var FX = !!opt.fx, WZ = FX ? new Float32Array(W * Hh) : null, HMS = 0.25, HX = 0, HY = 0, HM = null;
  if (FX){ HX = Math.ceil((b[2] - b[0]) / HMS) + 1; HY = Math.ceil((b[3] - b[1]) / HMS) + 1; HM = new Float32Array(HX * HY).fill(-1e9); }
  function camN(nx, ny, nz){ var v0 = nx, v1 = -nz * ce + ny * se, v2 = nz * se + ny * ce, l = Math.sqrt(v0 * v0 + v1 * v1 + v2 * v2) || 1; return [v0 / l, v1 / l, v2 / l]; }
  // the ground's own splat: the same cell splat() makes with { ti, tj, dt, nl } and the land's extras laid over it,
  // built only once the pixel is known to be in front, so a hidden one costs no object
  function splatG(x, y, z, m, n, ti, tj, dt, nl, ge){
    var sx = Math.floor((x - b[0]) / ART + EPS), sy = Math.floor(y * se / ART - z * ce / ART + oy), Dp = y * ce + z * se;
    if (sx < 0 || sy < 0 || sx >= W || sy >= Hh) return;
    if (FX){ var hi = Math.round((x - b[0]) / HMS), hj = Math.round((y - b[1]) / HMS); if (hi >= 0 && hj >= 0 && hi < HX && hj < HY && z > HM[hj * HX + hi]) HM[hj * HX + hi] = z; }
    var k = sy * W + sx; if (Dp <= Z[k]) return; Z[k] = Dp; if (FX) WZ[k] = z;
    var c = { m:m, n:null, z:Dp, dt:dt, gloss:0, bias:0, t:null, tag:'', nv:n, ti:ti, tj:tj, nl:nl };
    if (ge) for (var q in ge) c[q] = ge[q];
    S.g[sy][sx] = c;
  }
  function splat(x, y, z, m, n, extra){
    var sx = Math.floor((x - b[0]) / ART + EPS), sy = Math.floor(y * se / ART - z * ce / ART + oy), Dp = y * ce + z * se;
    if (sx < 0 || sy < 0 || sx >= W || sy >= Hh) return;
    if (FX){ var hi = Math.round((x - b[0]) / HMS), hj = Math.round((y - b[1]) / HMS); if (hi >= 0 && hj >= 0 && hi < HX && hj < HY && z > HM[hj * HX + hi]) HM[hj * HX + hi] = z; }
    var k = sy * W + sx; if (Dp <= Z[k]) return; Z[k] = Dp; if (FX) WZ[k] = z;
    var c = { m:m, n:null, z:Dp, dt:0, gloss:0, bias:0, t:null, tag:'', nv:n };
    if (extra) for (var q in extra) c[q] = extra[q];
    S.g[sy][sx] = c;
  }

  // ---- the distance to the rail, worked out once on the ground grid rather than at every question
  var st = SC || FINE ? ART : ART / 2, GX = Math.round((b[2] - b[0]) / st) + 1, GY = Math.round((b[3] - b[1]) / st) + 1, GY0 = GY;
  var SD = new Float32Array(GX * GY), Q = C.poly;
  // the signed distance to the course's outline: the union of its rooms, so a mouth between two is open
  var PS = C.polys || [Q], ED = C.edges;
  function sdExact(x, y){ if (ED && P.edgeDist) return (P.inAny(PS, x, y) >= 0 ? -1 : 1) * P.edgeDist(ED, x, y);
    var d = 1e9;
    for (var e = 0; e < Q.length; e++){ var p = Q[e], q = Q[(e + 1) % Q.length], ex = q[0] - p[0], ey = q[1] - p[1], l2 = ex * ex + ey * ey || 1e-9,
      t = Math.max(0, Math.min(1, ((x - p[0]) * ex + (y - p[1]) * ey) / l2)), dx = x - p[0] - ex * t, dy = y - p[1] - ey * t, dd = dx * dx + dy * dy; if (dd < d) d = dd; }
    return (P.inPoly(Q, x, y) ? -1 : 1) * Math.sqrt(d); }
  // a rail stands on whichever room it borders: the highest tier within a short reach of it
  function railTier(x, y){ var z = TZ(x, y); for (var a = 0; a < 8; a++){ var ang = a * Math.PI / 4, v = TZ(x + Math.cos(ang) * 0.75, y + Math.sin(ang) * 0.75); if (v > z) z = v; } return z; }
  // exact every 8th point; between them read it off the coarse grid, unless it is near the rail where it has to be exact
  var CS = 8, CX = Math.ceil(GX / CS) + 1, CY = Math.ceil(GY / CS) + 1, CD = new Float32Array(CX * CY);
  if (SC){ SD.fill(20); CY = 0; GY0 = GY; GY = 0; }
  for (var cj = 0; cj < CY; cj++) for (var ci = 0; ci < CX; ci++) CD[cj * CX + ci] = sdExact(b[0] + ci * CS * st, b[1] + cj * CS * st);
  for (var j = 0; j < GY; j++){ for (var i = 0; i < GX; i++){
    var fi = i / CS, fj = j / CS, i0 = fi | 0, j0 = fj | 0, u0 = fi - i0, v0 = fj - j0, c0 = j0 * CX + i0;
    var dv = (CD[c0] * (1 - u0) + CD[c0 + 1] * u0) * (1 - v0) + (CD[c0 + CX] * (1 - u0) + CD[c0 + CX + 1] * u0) * v0;
    SD[j * GX + i] = Math.abs(dv) < CS * st * 1.5 + 1.2 ? sdExact(b[0] + i * st, b[1] + j * st) : dv;
  } if ((j & 31) === 31) yield; }
  if (SC) GY = GY0;
  var x, y;
  function sdAt(x, y){ var i = Math.round((x - b[0]) / st), j = Math.round((y - b[1]) / st);
    if (i < 0 || j < 0 || i >= GX || j >= GY) return 20; return SD[j * GX + i]; }
  /* THE COURSE STANDS ON A PLINTH: its carpet is raised off the land, so the near side shows a solid base under the
     rail and the whole course throws a shadow onto the land, the way a hole reads in a console mini golf game. The
     rail stands the same height over the carpet as it always did, so it hides no more of the course than before. */
  var CARP = 0.95, RAIL = 1.55, RW = 0.55;
  var clearAt = SC ? (SC.clearAt || function(){ return 20; }) : function(x, y){ return sdAt(x, y) - RW; };
  var inB = SC ? function(){ return false; } : function(x, y){ return x >= C.bounds[0] && y >= C.bounds[1] && x <= C.bounds[2] && y <= C.bounds[3]; };
  var LD = SC ? (SC.land || null) : LAND ? LAND.make(C, b, clearAt, (C.seed | 0) || 7) : null;
  yield;
  var surf = function(x, y){ var m = inB(x, y) ? C.mats.at(x, y) : M.OUT, tz = TZ(x, y); if (m === M.WATER || m === M.ICE) return CARP - 0.22 + tz; if (m === M.FLOW) return CARP - 0.16 + tz; return CARP + F.h(x, y) * K + tz; };

  // ---- the ground, the carpet and the rail, as one height field
  var TKEY = {}, GZ = new Float32Array(GX * GY), GM = new Array(GX * GY), GE = new Array(GX * GY), GYG = SC && SC.noGround ? 0 : GY;
  for (j = 0; j < GYG; j++){ for (i = 0; i < GX; i++){
    x = b[0] + i * st; y = b[1] + j * st; var k0 = j * GX + i, m = inB(x, y) ? C.mats.at(x, y) : M.OUT;
    if (m !== M.OUT){ var tz0 = TZ(x, y); GZ[k0] = ((m === M.WATER || m === M.ICE) ? CARP - 0.22 : m === M.FLOW ? CARP - 0.16 : CARP + F.h(x, y) * K) + tz0; GM[k0] = m; continue; }
    if (Math.abs(SD[k0]) < RW){ GZ[k0] = RAIL + railTier(x, y); GM[k0] = 'rail'; continue; }
    if (LD){ var r = LD.mat(x, y); GZ[k0] = LD.h(x, y); GM[k0] = TKEY[r[0]] || (TKEY[r[0]] = 't:' + r[0]); GE[k0] = r[1]; }
    else { GZ[k0] = 0; GM[k0] = 'ground'; }
  } if ((j & 15) === 15) yield; }
  function gzI(i, j){ return GZ[Math.max(0, Math.min(GY - 1, j)) * GX + Math.max(0, Math.min(GX - 1, i))]; }
  function gz(x, y){ return gzI(Math.round((x - b[0]) / st), Math.round((y - b[1]) / st)); }
  for (j = 0; j < GYG; j++){ if ((j & 15) === 15) yield; for (i = 0; i < GX; i++){
    x = b[0] + i * st; y = b[1] + j * st; var kk = j * GX + i, z = GZ[kk], mm = GM[kk], zs = gzI(i, j + 1);
    var zx = (gzI(i + 1, j) - gzI(i - 1, j)) / (2 * st), zy = (gzI(i, j + 1) - gzI(i, j - 1)) / (2 * st);
    var terr = typeof mm === 'string' && mm.charAt(0) === 't';
    var flat = (mm === 'rail' || mm === 'ground') ? 0 : 1, gn = terr ? (LD.gain || 1) : 1, n = camN(-zx * flat * gn, -zy * flat * gn, 1);
    var ti = Math.floor((x - b[0]) / TCELL), tj = Math.floor((y - b[1]) / TCELL);
    var key = terr ? mm : mm === 'rail' ? 'rail' : mm === 'ground' ? 'ground' : mm === M.WATER ? 'haz' : mm === M.ICE ? 'ice' : mm === M.MUD ? 'slow' : mm === M.SAND ? 'sand' : mm === M.BELT ? 'belt' : mm === M.FLOW ? 'flow' : 'carpet';
    splatG(x, y, z, key, n, ti, tj, key === 'ground' ? -1 : 0, terr, GE[kk]);
    if (z > zs + 0.12){ var ex3 = { ti:ti, tj:tj, nl:terr, dt:-1 }; if (GE[kk]) for (qq in GE[kk]) ex3[qq] = GE[kk][qq];
      // the plinth: where the rail stands over the land (not over another room), the face below its cap is the base
      var ms = GM[Math.min(GY - 1, j + 1) * GX + i], plin = key === 'rail' && typeof ms === 'string' && (ms === 'ground' || ms.charAt(0) === 't');
      for (var zz = zs; zz < z; zz += st * 0.8) splat(x, y + st / 2, zz, key === 'carpet' || (plin && zz < z - 0.5) ? 'skirt' : key, camN(0, 1, 0), ex3); }
  } }

  // ---- solids: a voxel grid, each surface voxel lit by which way its empty neighbours lie
  var NB = []; (function(){ for (var dk = -1; dk <= 1; dk++) for (var dj = -1; dj <= 1; dj++) for (var di = -1; di <= 1; di++) if (di || dj || dk) NB.push([di, dj, dk]);
    NB.push([2, 0, 0], [-2, 0, 0], [0, 2, 0], [0, -2, 0], [0, 0, 2], [0, 0, -2]); })();
  function emit(A, nx, ny, nz, x0, y0, z0, sv){
    var id = function(i, j, k){ return (k * ny + j) * nx + i; };
    var occ = function(i, j, k){ return i >= 0 && j >= 0 && k >= 0 && i < nx && j < ny && k < nz && A[id(i, j, k)] ? 1 : 0; };
    for (var k = 0; k < nz; k++) for (var j = 0; j < ny; j++) for (var i = 0; i < nx; i++){
      var c = A[id(i, j, k)]; if (!c) continue;
      if (occ(i, j + 1, k) && occ(i, j, k + 1) && occ(i - 1, j, k) && occ(i + 1, j, k)) continue;   // hidden from the camera
      var gx = 0, gy = 0, gz2 = 0;
      for (var u = 0; u < NB.length; u++){ var o = NB[u]; if (occ(i + o[0], j + o[1], k + o[2])) continue; gx += o[0]; gy += o[1]; gz2 += o[2]; }
      var nn = camN(gx, gy, gz2 || 0.0001);
      if (sv > ART * 1.01){ var nb = Math.ceil(sv / ART), fs = sv / nb;   // a voxel bigger than an art pixel covers its whole face, not one dot
        for (var d0 = 0; d0 < nb; d0++) for (var d1 = 0; d1 < nb; d1++) for (var d2 = 0; d2 < nb; d2++) splat(x0 + i * sv + d0 * fs, y0 + j * sv + d1 * fs, z0 + k * sv + d2 * fs, 'x:' + c, nn); }
      else splat(x0 + i * sv, y0 + j * sv, z0 + k * sv, 'x:' + c, nn);
    }
  }
  // solid(box, fn): asks fn(x, y, z) for a colour at every voxel. Fine for small things.
  // every solid is queued and built later, one a step, so no one piece of land holds a frame
  var JOBS = [];
  function solid(){ var a = arguments; JOBS.push(function(){ solidNow.apply(null, a); }); }
  function vox(){ var a = arguments; JOBS.push(function(){ voxNow.apply(null, a); }); }
  function solidNow(x0, y0, z0, x1, y1, z1, fn, sv){
    sv = sv || ART / 2; if (FINE && sv > ART * 0.7) sv = ART * 0.7;
    var nx = Math.ceil((x1 - x0) / sv) + 1, ny = Math.ceil((y1 - y0) / sv) + 1, nz = Math.ceil((z1 - z0) / sv) + 1, A = new Array(nx * ny * nz);
    for (var k = 0; k < nz; k++) for (var j = 0; j < ny; j++) for (var i = 0; i < nx; i++) A[(k * ny + j) * nx + i] = fn(x0 + i * sv, y0 + j * sv, z0 + k * sv);
    emit(A, nx, ny, nz, x0, y0, z0, sv);
  }
  // vox(box, draw): draw(set) writes voxels itself, so a tree is the cost of its branches rather than its box.
  function voxNow(x0, y0, z0, x1, y1, z1, draw, sv){
    sv = sv || ART / 2; if (FINE && sv > ART * 0.7) sv = ART * 0.7;
    var nx = Math.ceil((x1 - x0) / sv) + 1, ny = Math.ceil((y1 - y0) / sv) + 1, nz = Math.ceil((z1 - z0) / sv) + 1, A = new Array(nx * ny * nz);
    var set = function(x, y, z, c){ var i = Math.round((x - x0) / sv), j = Math.round((y - y0) / sv), k = Math.round((z - z0) / sv);
      if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) return; A[(k * ny + j) * nx + i] = c; };
    set.st = sv; draw(set);
    emit(A, nx, ny, nz, x0, y0, z0, sv);
  }
  // a tapered tube from a to b, coloured col(t) along it
  function tube(set, ax, ay, az, bx, by, bz, r0, r1, col){
    var s = set.st, x0 = Math.min(ax, bx) - Math.max(r0, r1), x1 = Math.max(ax, bx) + Math.max(r0, r1), y0 = Math.min(ay, by) - Math.max(r0, r1), y1 = Math.max(ay, by) + Math.max(r0, r1),
      z0 = Math.min(az, bz) - Math.max(r0, r1), z1 = Math.max(az, bz) + Math.max(r0, r1), dx = bx - ax, dy = by - ay, dz = bz - az, L2 = dx * dx + dy * dy + dz * dz || 1e-9;
    for (var z = z0; z <= z1; z += s) for (var y = y0; y <= y1; y += s) for (var x = x0; x <= x1; x += s){
      var t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy + (z - az) * dz) / L2)), ex = x - ax - dx * t, ey = y - ay - dy * t, ez = z - az - dz * t, r = r0 + (r1 - r0) * t;
      if (ex * ex + ey * ey + ez * ez < r * r) set(x, y, z, typeof col === 'function' ? col(t, z) : col); }
  }
  function blob(set, cx, cy, cz, rx, ry, rz, col){
    var s = set.st;
    for (var z = cz - rz; z <= cz + rz; z += s) for (var y = cy - ry; y <= cy + ry; y += s) for (var x = cx - rx; x <= cx + rx; x += s){
      var u = (x - cx) / rx, v = (y - cy) / ry, w = (z - cz) / rz; if (u * u + v * v + w * w < 1) set(x, y, z, typeof col === 'function' ? col(x, y, z) : col); }
  }
  var B = { solid:solid, vox:vox, tube:tube, blob:blob, gz:gz, ART:ART, clearAt:clearAt, T:T };

  // ---- the hole's own pieces
  var LATHE = { pumpkin:1, ghost:1, pine:1, snowman:1, egg:1, snowball:1, beachball:1, pie:1, potgold:1, umbrella:1, cloud:1, neonpost:1, kickball:1, gumball:1, dinoegg:1, clover:0, star:0 };
  var LIFT = { bat:1.4, ghost:0.5 };
  function base(x, y){ return CARP + F.h(x, y) * K + TZ(x, y); }
  function skinCol(name){ var fn = SK[name] || SK.stone, n = {}, best = null, bn = 0;
    for (var v = -0.8; v <= 0.8; v += 0.2) for (var u = -0.8; u <= 0.8; u += 0.2){ var c = fn(u, v); if (c){ n[c] = (n[c] || 0) + 1; if (n[c] > bn){ bn = n[c]; best = c; } } }
    return best || T.wallLo; }
  function prop(cx, cy, s, kind, zb){
    var fn = SK[kind] || SK.stone, lathe = LATHE[kind], H = 2 * s, lift = (LIFT[kind] || 0) * s, R = {};
    if (lathe) for (var r = 0; r <= 40; r++){ var vv = -1 + r / 20, mx = 0; for (var u = 0; u <= 1; u += 0.02) if (fn(u, vv) || fn(-u, vv)) mx = u; R[r] = mx; }
    solid(cx - s, cy - s, zb + lift, cx + s, cy + s, zb + lift + H, function(x, y, z){
      var u = (x - cx) / s, w = (y - cy) / s, v = 1 - 2 * (z - zb - lift) / H;
      if (lathe){ var rr = R[Math.round((v + 1) * 20)] || 0; if (Math.hypot(u, w) > rr) return null; return fn(u, v); }
      if (Math.abs(w) > 0.28) return null; return fn(u, v);
    });
  }
  if (LD && LD.build) LD.build(B);
  (C.bumpers || []).forEach(function(u){ prop(u.x, u.y, u.r * 1.05, u.skin, base(u.x, u.y) - 0.1); });
  (C.blocks || []).forEach(function(rc){ var fn = SK[rc.skin] || SK.stone, h = 1.5, zb = CARP;
    solid(rc.x0, rc.y0, zb, rc.x1, rc.y1, zb + h, function(x, y, z){ var u = ((x - rc.x0) / (rc.x1 - rc.x0)) * 2 - 1, v = 1 - 2 * (z - zb) / h;
      if (rc.rot){ var q = rc.rot, dx = x - q.cx, dy = y - q.cy, a = dx * q.c + dy * q.s; if (Math.abs(a) > q.hl || Math.abs(-dx * q.s + dy * q.c) > q.hw) return null; u = a / q.hl; }   // a bank board: only the voxels inside the turned board
      return fn(u * 0.7, v * 0.9) || fn(0, 0.4) || T.wallLo; }); });
  // a ramp: a wedge rising to its lip, striped like a kicker
  (C.ramps || []).forEach(function(rp){ var zb = base(rp.x - rp.dx * 0.3, rp.y - rp.dy * 0.3), L = rp.len, hw = rp.w / 2, hh = rp.h;
    var xs4 = [rp.x, rp.x - rp.dx * L], ys4 = [rp.y, rp.y - rp.dy * L];
    solid(Math.min(xs4[0], xs4[1]) - hw - 0.3, Math.min(ys4[0], ys4[1]) - hw - 0.3, zb - 0.05, Math.max(xs4[0], xs4[1]) + hw + 0.3, Math.max(ys4[0], ys4[1]) + hw + 0.3, zb + hh + 0.05, function(x, y, z){
      var a = (x - rp.x) * rp.dx + (y - rp.y) * rp.dy, sd = -(x - rp.x) * rp.dy + (y - rp.y) * rp.dx; if (a > 0 || a < -L || Math.abs(sd) > hw) return null;
      var top = hh * (1 + a / L); if (z - zb > top) return null; if (z - zb < top - 0.12) return '#5b4a3a';
      return (Math.floor((sd + hw) * 1.6) % 2) ? '#f4efe2' : (T.kicker || '#e5483a'); }); });
  // a loop: a ring of track standing on its edge, with a foot either side
  (C.loops || []).forEach(function(lp){ var zb = base(lp.x, lp.y), r = lp.r + 0.14, sx = -lp.dy, sy = lp.dx, off = lp.off || 0, LC = T.loopCol || ['#e5483a', '#ff9a6a', '#7a2018'];
    vox(lp.x - r - 1.2, lp.y - r - 1.2, zb - 0.1, lp.x + r + 1.2, lp.y + r + 1.2, zb + 2 * r + 0.4, function(set){
      for (var a = 0; a < 64; a++){ var t0 = a / 64 * 2 * Math.PI, t1 = (a + 1) / 64 * 2 * Math.PI, d0 = off * t0 / (2 * Math.PI), d1 = off * t1 / (2 * Math.PI);
        var p0 = [lp.x + lp.dx * r * Math.sin(t0) + sx * d0, lp.y + lp.dy * r * Math.sin(t0) + sy * d0, zb + r * (1 - Math.cos(t0)) - 0.1], p1 = [lp.x + lp.dx * r * Math.sin(t1) + sx * d1, lp.y + lp.dy * r * Math.sin(t1) + sy * d1, zb + r * (1 - Math.cos(t1)) - 0.1];
        tube(set, p0[0] + sx * 0.36, p0[1] + sy * 0.36, p0[2], p1[0] + sx * 0.36, p1[1] + sy * 0.36, p1[2], 0.15, 0.15, a % 8 < 4 ? LC[1] : LC[0]);
        tube(set, p0[0] - sx * 0.36, p0[1] - sy * 0.36, p0[2], p1[0] - sx * 0.36, p1[1] - sy * 0.36, p1[2], 0.15, 0.15, a % 8 < 4 ? LC[1] : LC[0]);
        if (a % 4 === 0) tube(set, p0[0] + sx * 0.36, p0[1] + sy * 0.36, p0[2], p0[0] - sx * 0.36, p0[1] - sy * 0.36, p0[2], 0.08, 0.08, '#f4efe2'); }
      tube(set, lp.x + sx * (0.36 + off / 2), lp.y + sy * (0.36 + off / 2), zb + 2 * r - 0.1, lp.x + sx * (1.0 + off / 2), lp.y + sy * (1.0 + off / 2), zb, 0.11, 0.15, LC[2]);
      tube(set, lp.x - sx * 0.36, lp.y - sy * 0.36, zb + 2 * r - 0.1, lp.x - sx * 1.0, lp.y - sy * 1.0, zb, 0.11, 0.15, LC[2]); }); });
  var mill = null;
  if (C.mill){ var mx = C.mill.x, my = C.mill.y - 0.4, mzb = CARP + 1.5, Ht = 4.2;
    solid(mx - 1.9, my - 1.3, mzb, mx + 1.9, my + 1.3, mzb + Ht + 1.6, function(x, y, z){ var t = (z - mzb) / Ht, dx = Math.abs(x - mx), dy = Math.abs(y - my);
      if (t > 1){ var rt = (t - 1) * Ht / 1.6; if (dx > 1.7 * (1 - rt) || dy > 1.15) return null; return (Math.floor((z - mzb) * 4) % 2) ? T.wallLo : T.ink; }
      var hw = 1.5 - t * 0.45, hd = 1.1 - t * 0.3; if (dx > hw || dy > hd) return null;
      if (y - my > hd - 0.25 && dx < 0.42 && t < 0.32) return T.ink;
      if (y - my > hd - 0.25 && dx < 0.32 && Math.abs(t - 0.6) < 0.07) return '#ffd36a';
      return (Math.floor((z - mzb) * 2.5) % 2) ? T.wall : T.wallHi; });
    // the sails turn in front of the door and sweep down to the carpet: they are what blocks it (putt.js 'blade')
    var bl = (C.movers || []).filter(function(m){ return m.k === 'blade'; })[0];
    mill = bl ? { x:bl.x, y:bl.y, z:CARP + bl.hz, r:bl.r, w:bl.sw } : { x:mx, y:my + 1.25, z:mzb + Ht * 0.78, r:3.2 };
  }

  for (var jb = 0; jb < JOBS.length; jb++){ JOBS[jb](); yield; }
  // ---- paint, with the theme's colours on the golfer's ramps
  var R = PX.ramp, h3 = P.hash3;
  var y0 = 0; while (y0 < Hh - 1 && S.g[y0].every(function(c){ return !c; })) y0++;
  if (y0 > 0){ S.g = S.g.slice(y0); S.H = Hh - y0; }
  var cv = document.createElement('canvas'); cv.width = W; cv.height = Hh - y0; var ctx = cv.getContext('2d');
  if (!(SC && SC.noGround)){ ctx.fillStyle = (LD && LD.bg) || T.bg; ctx.fillRect(0, 0, W, Hh); }
  var rampOf = function(c, x, y){
    var n = h3(c.ti || x, c.tj || y, 3), m = c.m;
    if (m === 'carpet') return R(n < 0.16 ? T.carpet2 : T.carpet);
    if (m === 'skirt') return R(T.wallLo);
    if (m === 'ground') return R(h3((c.ti || x) >> 1, (c.tj || y) >> 1, 9) < 0.14 ? T.bg2 : T.bg);
    if (m === 'rail') return R(T.wall);
    if (m === 'haz') return R(((x + (y >> 1) * 3) % 13) === 0 ? T.hazCol2 : T.hazCol);
    if (m === 'ice') return R(T.iceCol ? (((x * 5 + y * 3) % 23) < 2 ? T.iceCol2 : T.iceCol) : T.hazCol); if (m === 'slow') return R(T.slowCol);
    if (m === 'flow'){ var rc = T.river || ['#2f86c8', '#5fb3e6']; return R(((x * 3 + y * 5) % 17) < 3 ? rc[1] : rc[0]); }
    if (m === 'sand') return R(n < 0.14 ? '#d9c48a' : '#ecdba4');
    if (m === 'belt'){ var bl = C.belts && C.belts[0], horiz = !bl || Math.abs(bl.ax) >= Math.abs(bl.ay), q = horiz ? (c.ti || x) : (c.tj || y); return R((((q % 6) + 6) % 6) < 3 ? '#3a3f48' : '#5a616c'); }
    if (m.charAt(0) === 'x') return R(m.slice(2));
    if (m.charAt(0) === 't'){ var kk2 = m.slice(2), tt = LD.mats[kk2];
      if (tt.length > 4 && tt[4]) return tt[4](c, R, h3);
      var n1 = h3(c.ti >> 1, c.tj >> 1, 11), n2 = h3(c.ti, c.tj, 12);
      return R(n1 < tt[3] ? (n2 < 0.5 ? tt[1] : tt[2]) : tt[0]); }
    return '#ff00ff';
  };
  /* THE PAINT IS PXHD's Sprite.paint, done here into one pixel buffer rather than a fillRect a pixel. It is the
     same rules in the same order (a tone off the normal against the light, a contact shadow under a part with
     another in front of it, the inner contour, the soft outline one pixel inside the silhouette), asked once a
     pixel instead of in four passes, and each pixel's ramp is looked up once instead of three times. A trail is
     about half a million pixels, and the fillRect a pixel and the ramp lookups were most of the time it took to
     open one. Every rule only reads its neighbours' parts, never their tones, so a pixel is finished on its own
     and the bands are only there to give the frame back. LIGHT is PXHD's own light, which it does not export. */
  var HH = S.H || (Hh - y0), BAND = 48, G = S.g, LIGHT = (function(){ var v = [-0.55, -0.72, 0.72], l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; })();
  var IMG = ctx.getImageData(0, 0, W, HH), ID = IMG.data, COLS = {}, SOFT = [], cc0 = null;
  function colOf(col){ var v = COLS[col]; if (v !== undefined) return v;
    if (/^#[0-9a-f]{6}$/i.test(col)){ var n = parseInt(col.slice(1), 16); v = [n >> 16, n >> 8 & 255, n & 255, 255]; }
    else { if (!cc0){ var c0 = document.createElement('canvas'); c0.width = c0.height = 1; cc0 = c0.getContext('2d', { willReadFrequently:true }); }
      cc0.clearRect(0, 0, 1, 1); cc0.fillStyle = '#000'; cc0.fillStyle = col; cc0.fillRect(0, 0, 1, 1); var q = cc0.getImageData(0, 0, 1, 1).data; v = [q[0], q[1], q[2], q[3]]; }
    return COLS[col] = v; }
  function toneAt(c, x, y){ if (c.t != null) return c.t;
    var n = c.nv ? c.nv : typeof c.n === 'function' ? c.n(x + 0.5, y + 0.5) : [0, 0, 1], l = Math.hypot(n[0], n[1], n[2]) || 1;
    var d = (n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]) / l + (c.bias || 0);
    var t = d > 0.94 ? (c.gloss ? 4 : 3) : d > 0.80 ? 3 : d > 0.40 ? 2 : d > 0.08 ? 1 : 0;
    if (c.gloss > 1 && d > 0.88) t = 4;
    return Math.max(0, Math.min(4, t + (c.dt || 0))); }
  function at(x, y){ var row = G[y]; return row ? row[x] : undefined; }
  for (var ya = 0; ya < HH; ya += BAND){ var yb = Math.min(HH, ya + BAND);
    for (var yy = ya; yy < yb; yy++){ var grow = G[yy];
      for (var xx = 0; xx < W; xx++){ var c = grow[xx]; if (!c) continue;
        var t = toneAt(c, xx, yy), o;
        if (!(c.t != null || c.noAO)){ o = at(xx, yy - 1); if (!(o && o.m !== c.m && o.z > c.z && !o.noCast)){ o = grow[xx + 1]; if (!(o && o.m !== c.m && o.z > c.z && !o.noCast)){ o = grow[xx - 1]; if (!(o && o.m !== c.m && o.z > c.z && !o.noCast)) o = null; } }
          if (o) t = Math.max(0, t - 1); }
        var r = rampOf(c, xx, yy), arr = Array.isArray(r), col = arr ? r[t] : r;
        if (arr && !c.nl && c.t == null){ o = at(xx, yy + 1); if (!(o && o.m !== c.m && o.z < c.z && !o.noOut)){ o = grow[xx + 1]; if (!(o && o.m !== c.m && o.z < c.z && !o.noOut)){ o = grow[xx - 1]; if (!(o && o.m !== c.m && o.z < c.z && !o.noOut)) o = null; } }
          if (o) col = r[Math.min(t, 1)]; }
        if (arr && !c.noOut && !c.noEdge){ var e1 = at(xx, yy + 1), e2 = grow[xx + 1], e3 = at(xx, yy - 1), e4 = grow[xx - 1];
          var sh = !e1 || e1.noOut || !e2 || e2.noOut, lit = !e3 || e3.noOut || !e4 || e4.noOut;
          if (sh || lit) col = sh ? r[Math.max(0, Math.min(t - 1, 1))] : r[Math.max(0, Math.min(t - 1, 2))]; }
        if (!col) continue;
        var cv4 = colOf(col); if (cv4[3] < 255){ SOFT.push(xx, yy, col); continue; }
        var i4 = (yy * W + xx) * 4; ID[i4] = cv4[0]; ID[i4 + 1] = cv4[1]; ID[i4 + 2] = cv4[2]; ID[i4 + 3] = 255; } }
    yield; }
  ctx.putImageData(IMG, 0, 0);
  for (var si = 0; si < SOFT.length; si += 3){ ctx.fillStyle = SOFT[si + 2]; ctx.fillRect(SOFT[si], SOFT[si + 1], 1, 1); }
  var pr = function(x, y, z){ return [(x - b[0]) / ART, y * se / ART - z * ce / ART + oy - y0]; };
  var un = function(px, py, z){ return [px * ART + b[0], (py - oy + y0 + (z || 0) * ce / ART) * ART / se]; };
  if (LD && LD.fog){ ctx.globalAlpha = 0.16; ctx.fillStyle = LD.fogCol || '#8a6fb8';   // ground fog drifting across the land
    for (var fy = 0; fy < Hh - y0; fy += 2) for (var fx = 0; fx < W; fx += 2){ var wx = b[0] + fx * ART, wy = (fy + y0 - oy) * ART / se, fv = LD.fog(wx, wy);
      if (clearAt(wx, wy) > 0.4 && fv > 0.62 && (fv > 0.7 || ((fx + fy) & 2))) ctx.fillRect(fx, fy, 2, 2); }
    ctx.globalAlpha = 1; }
  if (LD && LD.after) LD.after(ctx, { pr:pr, W:W, H:Hh - y0, b:b, ART:ART, se:se, oy:oy - y0 });
  var fxBg = null, fxNight = false, fxSky = null;
  if (FX){ var fxg = fxPass(); while (!fxg.next().done) yield; }
  function* fxPass(){
    var HH2 = Hh - y0, img = ctx.getImageData(0, 0, W, HH2), d = img.data;
    // the sun is low in the upper left, behind the camera's left shoulder: shadows fall toward the lower right
    var lx = -0.62, ly = -0.48, ln = Math.hypot(lx, ly); lx /= ln; ly /= ln; var RISE = 0.78, STEP = HMS, MAXD = 9;
    // Math.round(v) is floor(v + 0.5), and an index under 0 is off the map either way
    var HB0 = b[0], HB1 = b[1], HIS = 1 / HMS;
    var HTOP = -1e9; for (var hq0 = 0; hq0 < HM.length; hq0++) if (HM[hq0] > HTOP) HTOP = HM[hq0];
    var hm = function(x, y){ var fi = (x - HB0) * HIS + 0.5, fj = (y - HB1) * HIS + 0.5; if (fi < 0 || fj < 0) return -1e9; var i = fi | 0, j = fj | 0; if (i >= HX || j >= HY) return -1e9; return HM[j * HX + i]; };
    // haze colour: the land's own background, lifted toward a pale sky
    var hz = (LD && LD.bg) || T.bg, hr = parseInt(hz.slice(1, 3), 16), hg = parseInt(hz.slice(3, 5), 16), hb = parseInt(hz.slice(5, 7), 16);
    // a night world (neon, lava, a churchyard) has no bright sky to fade into: its far land sinks into the dark
    var night = fxNight = hr * 0.3 + hg * 0.59 + hb * 0.11 < 70;
    if (!night){ hr = hr + (226 - hr) * 0.6; hg = hg + (232 - hg) * 0.6; hb = hb + (242 - hb) * 0.6; } else { hr *= 0.6; hg *= 0.6; hb *= 0.7; }
    // the grade: a little more colour and a little more contrast
    function grade(i4, r, g, bl){ var lum = r * 0.3 + g * 0.59 + bl * 0.11; r = lum + (r - lum) * 1.22; g = lum + (g - lum) * 1.22; bl = lum + (bl - lum) * 1.22;
      r = 128 + (r - 128) * 1.07; g = 128 + (g - 128) * 1.07; bl = 128 + (bl - 128) * 1.07;
      d[i4] = r < 0 ? 0 : r > 255 ? 255 : r; d[i4 + 1] = g < 0 ? 0 : g > 255 ? 255 : g; d[i4 + 2] = bl < 0 ? 0 : bl > 255 ? 255 : bl; }
    // a well mixed hash for the glints and the carpet's tufts (an XOR hash draws them in diagonal lines)
    var hq = function(x, y, s0){ var h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s0, 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
    var A8 = []; for (var a = 0; a < 8; a++) A8.push([Math.cos(a * Math.PI / 4), Math.sin(a * Math.PI / 4)]);
    // the sun, as a direction in the world, and the same direction in the camera's terms, so a voxel's own
    // normal can say whether it faces it
    var sw = [lx, ly, RISE], swl = Math.hypot(sw[0], sw[1], sw[2]); sw = [sw[0] / swl, sw[1] / swl, sw[2] / swl];
    // a broad wash of light across the whole scene, brightest toward the sun: one light lights the world
    var mx0 = (b[0] + b[2]) / 2, my0 = (b[1] + b[3]) / 2, span = Math.max(8, Math.hypot(b[2] - b[0], b[3] - b[1]) / 2);
    var DD = Math.max(0.6, ART * 6);   // how much nearer the camera a surface has to be than the one behind it to count as an edge
    var BR = night ? new Float32Array(W * HH2) : null;   // what glows, for the bloom at night
    for (var py = 0; py < HH2; py++){
      for (var px = 0; px < W; px++){
        var k = (py + y0) * W + px, i4 = (py * W + px) * 4, r = d[i4], g = d[i4 + 1], bl = d[i4 + 2], r0 = r, g0 = g, bb0 = bl;
        if (Z[k] < -1e8){ grade(i4, r * 0.86, g * 0.86, bl * 0.9); continue; }
        var z = WZ[k], wy = (Z[k] - z * se) / ce, wx = b[0] + (px + 0.5) * ART;
        var cel = S.g[py] && S.g[py][px], cm = cel ? cel.m : '';
        // only what lies on the ground takes a shadow or a dark corner: the painter already shades the sides
        // of a tree or a wall that face away, and doing it twice makes a wood a black mass
        var low = z - gz(wx, wy) < 0.45;
        // the shadow: march toward the sun over the height map, and the deepest crossing sets how dark it is
        var sh = 0;
        // hm() written out, and the march stops once the ray is above the tallest thing in the scene: nothing further can shade it
        if (low) for (var t = STEP; t < MAXD; t += STEP){ var lim = z + 0.05 + t * RISE; if (lim >= HTOP) break;
          var fi = (wx + lx * t - HB0) * HIS + 0.5, fj = (wy + ly * t - HB1) * HIS + 0.5; if (fi < 0 || fj < 0) continue; var ii = fi | 0, jj = fj | 0; if (ii >= HX || jj >= HY) continue;
          var over = HM[jj * HX + ii] - lim; if (over > 0){ sh = Math.max(sh, Math.min(1, over / 0.25)); if (sh >= 1) break; } }
        // ambient occlusion: how much of the ground close round it stands higher than it
        var ao = 0; if (low) for (a = 0; a < 8; a++){ var o1 = hm(wx + A8[a][0] * 0.5, wy + A8[a][1] * 0.5) - z, o2 = hm(wx + A8[a][0] * 1.1, wy + A8[a][1] * 1.1) - z;
          ao += Math.max(0, Math.min(1, o1 / 0.5)) * 0.6 + Math.max(0, Math.min(1, o2 / 1.1)) * 0.4; }
        ao = 1 - Math.min(0.35, ao / 8 * 0.8);
        // a dithered edge on the shadow, so it reads as pixel art and not as a smear
        if (sh > 0 && sh < 1) sh = ((px + py) & 1) ? Math.min(1, sh * 1.4) : sh * 0.6;
        // a trail is seen from close in, among trees taller than the golfer: its shadows are lighter, or a wood is a lake of blue
        if (SC) sh *= 0.55;
        // light is warm and bright, shadow is cool and blue, the way a low sun reads
        var sr = 1.07 - sh * 0.47, sg = 1.05 - sh * 0.31, sb = 1.0 - sh * 0.12;
        r = r * sr * ao; g = g * sg * ao; bl = bl * sb * ao;
        // THE CARPET HAS A NAP: it is laid in broad strips that catch the light a little differently, with a tuft here
        // and there, so it reads as a surface under the sun and not as a flat fill
        if (cm === 'carpet'){ var nap = ((Math.floor(wy / 2.4) & 1) ? 0.965 : 1.03) * (hq((px / TR) | 0, (py / TR) | 0, 41) < 0.09 ? 0.93 : 1); r *= nap; g *= nap; bl *= nap; }
        // the sun's wash across the scene
        var wsh = Math.max(-1, Math.min(1, ((wx - mx0) * lx + (wy - my0) * ly) / span)) * (night ? 0.03 : 0.07) + 1; r *= wsh; g *= wsh; bl *= wsh;
        // A LIT RIM ALONG WHAT STANDS UP. Where something stands in front of what is behind it (the scene two
        // pixels up or across is much further away) and it faces the sun, its edge catches the light. It goes one
        // pixel inside the dark outline, so the outline stays and the light sits on the form: the bevel that makes
        // a block, a rail, a tree and a tower read as a solid in a lit world rather than a sticker on it.
        if (cel && cel.nv && py > 1 && px > 1 && (!low || cm === 'rail')){
          var kU1 = k - W, kU2 = k - 2 * W, kL1 = k - 1, kL2 = k - 2, nearU = Z[kU1] > Z[k] - DD && Z[kU2] < Z[k] - DD, nearL = Z[kL1] > Z[k] - DD && Z[kL2] < Z[k] - DD;
          if (nearU || nearL){ var nv = cel.nv, nwy = nv[1] * se + nv[2] * ce, nwz = -nv[1] * ce + nv[2] * se, face = nv[0] * sw[0] + nwy * sw[1] + nwz * sw[2];
            if (face > 0.1){ var rimA = Math.min(0.42, face * 0.5) * (sh > 0.5 ? 0.3 : 1) * (night ? 0.6 : 1); r += (255 - r) * rimA; g += (238 - g) * rimA; bl += (200 - bl) * rimA; } } }
        // WATER AND ICE TAKE THE SKY: a sheen of it, stronger toward the far bank where the angle is low, and a few
        // glints where the sun catches a ripple
        if (cm === 'haz' || cm === 'flow' || cm === 'ice' || cm === 't:water' || cm === 't:ice' || cm === 't:sea' || cm === 't:sea0'){ var fr = 0.1 + 0.16 * (1 - py / HH2); r += (hr - r) * fr; g += (hg - g) * fr; bl += (hb - bl) * fr;
          if (sh < 0.3 && hq(((px / TR) | 0) >> 1, (py / TR) | 0, 31) < (cm === 'ice' || cm === 't:ice' ? 0.02 : 0.03) && (((px / TR) | 0) & 1) && px % TR === 0 && py % TR === 0){ r = 250; g = 250; bl = 255; } }
        // haze over the far land (the top of the picture) and nothing on the course
        var far = Math.max(0, Math.min(1, (0.42 - py / HH2) / 0.42)), hzA = far * far * 0.26 * (clearAt(wx, wy) > 0.5 ? 1 : 0.35);
        r += (hr - r) * hzA; g += (hg - g) * hzA; bl += (hb - bl) * hzA;
        grade(i4, r, g, bl);
        // only what is painted to give light glows (lava, neon, a lantern), never the course: the land and the solids,
        // read before they were relit, so a sunlit rim is not a lamp
        if (BR && (cm.charAt(0) === 't' || cm.charAt(0) === 'x') && cm !== 'x:' + T.carpet){ var L2 = r0 * 0.3 + g0 * 0.59 + bb0 * 0.11, sat = Math.max(r0, g0, bb0) - Math.min(r0, g0, bb0); if (L2 > 135 && sat > 100) BR[py * W + px] = 1; }
      }
      if ((py & 15) === 15) yield;
    }
    /* A GLOW AT NIGHT. What is lit and coloured at night (lava, neon, lanterns, the fair's lights) bleeds a soft halo
       of its own colour onto what is round it. Worked at a quarter of the size and blurred, so it costs a little. */
    if (BR){ var QW = Math.ceil(W / 4), QH = Math.ceil(HH2 / 4), QR = new Float32Array(QW * QH), QG = new Float32Array(QW * QH), QB = new Float32Array(QW * QH), qi, qx, qy;
      for (py = 0; py < HH2; py++) for (px = 0; px < W; px++) if (BR[py * W + px]){ qi = (py >> 2) * QW + (px >> 2), i4 = (py * W + px) * 4; QR[qi] += d[i4] / 16; QG[qi] += d[i4 + 1] / 16; QB[qi] += d[i4 + 2] / 16; }
      var blur = function(A){ var T2 = new Float32Array(A.length), RAD = 3, n2 = RAD * 2 + 1;
        for (qy = 0; qy < QH; qy++){ var acc = 0; for (qx = -RAD; qx < QW + RAD; qx++){ if (qx + RAD < QW) acc += A[qy * QW + qx + RAD] || 0; if (qx - RAD - 1 >= 0) acc -= A[qy * QW + qx - RAD - 1]; if (qx >= 0 && qx < QW) T2[qy * QW + qx] = acc / n2; } }
        for (qx = 0; qx < QW; qx++){ acc = 0; for (qy = -RAD; qy < QH + RAD; qy++){ if (qy + RAD < QH) acc += T2[(qy + RAD) * QW + qx]; if (qy - RAD - 1 >= 0) acc -= T2[(qy - RAD - 1) * QW + qx]; if (qy >= 0 && qy < QH) A[qy * QW + qx] = acc / n2; } } };
      blur(QR); blur(QG); blur(QB); blur(QR); blur(QG); blur(QB); yield;
      for (py = 0; py < HH2; py++){ for (px = 0; px < W; px++){ i4 = (py * W + px) * 4; var fx2 = px / 4 - 0.5, fy2 = py / 4 - 0.5, x0q = Math.max(0, Math.min(QW - 1, Math.floor(fx2))), y0q = Math.max(0, Math.min(QH - 1, Math.floor(fy2))), x1q = Math.min(QW - 1, x0q + 1), y1q = Math.min(QH - 1, y0q + 1), u = Math.max(0, Math.min(1, fx2 - x0q)), v = Math.max(0, Math.min(1, fy2 - y0q));
        var w00 = (1 - u) * (1 - v), w10 = u * (1 - v), w01 = (1 - u) * v, w11 = u * v, a00 = y0q * QW + x0q, a10 = y0q * QW + x1q, a01 = y1q * QW + x0q, a11 = y1q * QW + x1q, GL = 1.6;
        d[i4] = Math.min(255, d[i4] + (QR[a00] * w00 + QR[a10] * w10 + QR[a01] * w01 + QR[a11] * w11) * GL); d[i4 + 1] = Math.min(255, d[i4 + 1] + (QG[a00] * w00 + QG[a10] * w10 + QG[a01] * w01 + QG[a11] * w11) * GL); d[i4 + 2] = Math.min(255, d[i4 + 2] + (QB[a00] * w00 + QB[a10] * w10 + QB[a01] * w01 + QB[a11] * w11) * GL); }
        if ((py & 31) === 31) yield; } }
    ctx.putImageData(img, 0, 0);
    // the colour of the picture's far and near edges, so the stage above and below it continues the land into a sky
    // and into the dark rather than stopping at a hard line
    var edgeCol = function(row){ var sr2 = 0, sg2 = 0, sb2 = 0, n2 = 0; for (var xq = 0; xq < W; xq++){ var j4 = (row * W + xq) * 4; sr2 += d[j4]; sg2 += d[j4 + 1]; sb2 += d[j4 + 2]; n2++; } return [sr2 / n2, sg2 / n2, sb2 / n2]; };
    var topC = edgeCol(Math.min(2, HH2 - 1)), botC = edgeCol(Math.max(0, HH2 - 3)), rgbS = function(c){ return 'rgb(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ')'; };
    var skyC = night ? [hr * 0.5, hg * 0.5, hb * 0.62 + 10] : [hr + (190 - hr) * 0.35, hg + (214 - hg) * 0.35, hb + (240 - hb) * 0.35];
    fxSky = { top:rgbS(topC), sky:rgbS(skyC), bot:rgbS(botC) };
    // the stage round the picture takes the same grade, or it is a bright band under a graded picture
    var b0 = (SC && LD && LD.bg) || T.bg || '#202020', q = [parseInt(b0.slice(1, 3), 16), parseInt(b0.slice(3, 5), 16), parseInt(b0.slice(5, 7), 16)], t0 = new Uint8ClampedArray(4);
    var keep = d; d = t0; grade(0, q[0] * 0.86, q[1] * 0.86, q[2] * 0.9); d = keep; fxBg = 'rgb(' + t0[0] + ',' + t0[1] + ',' + t0[2] + ')';
  }
  /* WHETHER SOMETHING STANDS IN FRONT OF A POINT. The picture keeps how near the camera each pixel's
     surface is, so a point on the hole is hidden when the scene at its pixel is nearer than it: a ball
     behind a block, a wall or the windmill house is behind it, not painted over it. */
  var hid = function(x, y, z){ var sx = Math.floor((x - b[0]) / ART), sy = Math.floor(y * se / ART - z * ce / ART + oy);
    if (sx < 0 || sy < 0 || sx >= W || sy >= Hh) return false; return Z[sy * W + sx] > y * ce + z * se + 0.2; };
  /* the depth of every pixel (Z, W wide, starting y0 rows down), so a trail can draw the golfer and anything
     that moves behind whatever stands in front of it */
  return { ART:ART, cv:cv, bg:fxBg, sky:fxSky, night:FX && fxNight, pr:pr, un:un, zAt:SC ? function(x, y){ return gz(x, y); } : surf, hid:hid, mill:mill, se:se, ce:ce, K:K, carp:CARP, Z:Z, ZW:W, zy0:y0, b:b,
    // what a scene needs to be put back without rendering it again (pack, unpack): a trail is the same picture every
    // time it is opened, so putt.js keeps it on the device
    raw:SC ? { W:W, Hh:Hh, y0:y0, oy:oy, b:b.slice(), ART:ART, se:se, ce:ce, K:K, carp:CARP, GX:GX, GY:GY, st:st, GZ:GZ, Z:Z, bg:fxBg, sky:fxSky, night:FX && fxNight } : null };
}
/* PACK AND UNPACK A SCENE. A trail is seconds of work on a phone and comes out the same every time, so it is
   kept: pack() is plain data (the pixels, the depth of every pixel and the ground's heights) that IndexedDB can
   hold, and unpack() builds the same result render() hands back, with the same projection and the same ground
   under it, out of that. Only a scene (a trail) is packed: a hole's ground answers through its course. */
function pack(o){ var r = o && o.raw; if (!r) return null;
  var px = o.cv.getContext('2d').getImageData(0, 0, o.cv.width, o.cv.height).data;
  return { v:1, W:r.W, Hh:r.Hh, y0:r.y0, oy:r.oy, b:r.b, ART:r.ART, se:r.se, ce:r.ce, K:r.K, carp:r.carp, GX:r.GX, GY:r.GY, st:r.st, bg:r.bg, sky:r.sky, night:r.night,
    cw:o.cv.width, ch:o.cv.height, px:px.buffer.slice(0), Z:r.Z.buffer.slice(0), GZ:r.GZ.buffer.slice(0) }; }
function unpack(d){ if (!d || d.v !== 1) return null;
  var W = d.W, Hh = d.Hh, y0 = d.y0, oy = d.oy, b = d.b, ART = d.ART, se = d.se, ce = d.ce, GX = d.GX, GY = d.GY, st = d.st, Z = new Float32Array(d.Z), GZ = new Float32Array(d.GZ);
  if (Z.length !== W * Hh || GZ.length !== GX * GY || d.px.byteLength !== d.cw * d.ch * 4) return null;
  var cv = document.createElement('canvas'); cv.width = d.cw; cv.height = d.ch; cv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(d.px), d.cw, d.ch), 0, 0);
  function gzI(i, j){ return GZ[Math.max(0, Math.min(GY - 1, j)) * GX + Math.max(0, Math.min(GX - 1, i))]; }
  function gz(x, y){ return gzI(Math.round((x - b[0]) / st), Math.round((y - b[1]) / st)); }
  var pr = function(x, y, z){ return [(x - b[0]) / ART, y * se / ART - z * ce / ART + oy - y0]; };
  var un = function(px, py, z){ return [px * ART + b[0], (py - oy + y0 + (z || 0) * ce / ART) * ART / se]; };
  var hid = function(x, y, z){ var sx = Math.floor((x - b[0]) / ART), sy = Math.floor(y * se / ART - z * ce / ART + oy);
    if (sx < 0 || sy < 0 || sx >= W || sy >= Hh) return false; return Z[sy * W + sx] > y * ce + z * se + 0.2; };
  return { ART:ART, cv:cv, bg:d.bg, sky:d.sky, night:d.night, pr:pr, un:un, zAt:gz, hid:hid, mill:null, se:se, ce:ce, K:d.K, carp:d.carp, Z:Z, ZW:W, zy0:y0, b:b,
    raw:{ W:W, Hh:Hh, y0:y0, oy:oy, b:b, ART:ART, se:se, ce:ce, K:d.K, carp:d.carp, GX:GX, GY:GY, st:st, GZ:GZ, Z:Z, bg:d.bg, sky:d.sky, night:d.night } }; }
})();
