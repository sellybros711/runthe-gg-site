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
window.RTT_PUTT_3D = { API_VERSION: 1, render: render, slices: slices, ELEV: 42 };

function render(C, opt){ var g = steps(C, opt), r; do { r = g.next(); } while (!r.done); return r.value; }
function slices(C, opt){ var g = steps(C, opt), out = null;
  return function(ms){ if (out) return out; var t0 = performance.now();
    do { var r = g.next(); if (r.done){ out = r.value; return out; } } while (performance.now() - t0 < ms);
    return null; }; }

function* steps(C, opt){
  opt = opt || {};
  var P = window.RTT_PUTT, M = P.M, ART = P.ART, SK = P.SKIN, PX = window.PXHD, LAND = window.RTT_PUTT_LAND;
  var T = C.T, F = C.field, elev = opt.elev || 42;
  var D2R = Math.PI / 180, se = Math.sin(elev * D2R), ce = Math.cos(elev * D2R);
  var pxs = C.poly.map(function(p){ return p[0]; }), pys = C.poly.map(function(p){ return p[1]; });
  var b = [Math.min.apply(null, pxs) - 11, Math.min.apply(null, pys) - 15, Math.max.apply(null, pxs) + 11, Math.max.apply(null, pys) + 5];
  var K = opt.k || 2, zMax = 14;
  // a tall phone wants a tall picture: grow the land north and south until it has the stage's shape, so a wide hole never sits on a bare band
  // measured against the width the camera shows (the course and its margins), not the whole picture
  if (opt.aspect){ var iw = Math.max.apply(null, pxs) - Math.min.apply(null, pxs) + 13, ih = (b[3] - b[1]) * se + zMax * ce, need = opt.aspect * iw - ih;
    if (need > 0){ var ext = Math.min(need / se, 40); b[1] -= ext * 0.55; b[3] += ext * 0.45; } }
  var W = Math.floor((b[2] - b[0]) / ART) + 1, Hh = Math.ceil(((b[3] - b[1]) * se + zMax * ce) / ART) + 4;
  var oy = zMax * ce / ART + 2 - b[1] * se / ART;
  var S = new PX.Sprite(W, Hh), Z = new Float32Array(W * Hh).fill(-1e9);
  function camN(nx, ny, nz){ var v0 = nx, v1 = -nz * ce + ny * se, v2 = nz * se + ny * ce, l = Math.sqrt(v0 * v0 + v1 * v1 + v2 * v2) || 1; return [v0 / l, v1 / l, v2 / l]; }
  function splat(x, y, z, m, n, extra){
    var sx = Math.floor((x - b[0]) / ART), sy = Math.floor(y * se / ART - z * ce / ART + oy), Dp = y * ce + z * se;
    if (sx < 0 || sy < 0 || sx >= W || sy >= Hh) return; var k = sy * W + sx; if (Dp <= Z[k]) return; Z[k] = Dp;
    var c = { m:m, n:null, z:Dp, dt:0, gloss:0, bias:0, t:null, tag:'', nv:n };
    if (extra) for (var q in extra) c[q] = extra[q];
    S.g[sy][sx] = c;
  }

  // ---- the distance to the rail, worked out once on the ground grid rather than at every question
  var st = ART / 2, GX = Math.round((b[2] - b[0]) / st) + 1, GY = Math.round((b[3] - b[1]) / st) + 1;
  var SD = new Float32Array(GX * GY), Q = C.poly;
  function sdExact(x, y){ var d = 1e9;
    for (var e = 0; e < Q.length; e++){ var p = Q[e], q = Q[(e + 1) % Q.length], ex = q[0] - p[0], ey = q[1] - p[1], l2 = ex * ex + ey * ey || 1e-9,
      t = Math.max(0, Math.min(1, ((x - p[0]) * ex + (y - p[1]) * ey) / l2)), dx = x - p[0] - ex * t, dy = y - p[1] - ey * t, dd = dx * dx + dy * dy; if (dd < d) d = dd; }
    return (P.inPoly(Q, x, y) ? -1 : 1) * Math.sqrt(d); }
  // exact every 8th point; between them read it off the coarse grid, unless it is near the rail where it has to be exact
  var CS = 8, CX = Math.ceil(GX / CS) + 1, CY = Math.ceil(GY / CS) + 1, CD = new Float32Array(CX * CY);
  for (var cj = 0; cj < CY; cj++) for (var ci = 0; ci < CX; ci++) CD[cj * CX + ci] = sdExact(b[0] + ci * CS * st, b[1] + cj * CS * st);
  for (var j = 0; j < GY; j++){ for (var i = 0; i < GX; i++){
    var fi = i / CS, fj = j / CS, i0 = fi | 0, j0 = fj | 0, u0 = fi - i0, v0 = fj - j0, c0 = j0 * CX + i0;
    var dv = (CD[c0] * (1 - u0) + CD[c0 + 1] * u0) * (1 - v0) + (CD[c0 + CX] * (1 - u0) + CD[c0 + CX + 1] * u0) * v0;
    SD[j * GX + i] = Math.abs(dv) < CS * st * 1.5 + 1.2 ? sdExact(b[0] + i * st, b[1] + j * st) : dv;
  } if ((j & 31) === 31) yield; }
  var x, y;
  function sdAt(x, y){ var i = Math.round((x - b[0]) / st), j = Math.round((y - b[1]) / st);
    if (i < 0 || j < 0 || i >= GX || j >= GY) return 20; return SD[j * GX + i]; }
  var CARP = 0.35, RAIL = 0.95, RW = 0.55;
  var clearAt = function(x, y){ return sdAt(x, y) - RW; };
  var inB = function(x, y){ return x >= C.bounds[0] && y >= C.bounds[1] && x <= C.bounds[2] && y <= C.bounds[3]; };
  var LD = LAND ? LAND.make(C, b, clearAt, (C.seed | 0) || 7) : null;
  yield;
  var surf = function(x, y){ var m = inB(x, y) ? C.mats.at(x, y) : M.OUT; if (m === M.WATER || m === M.ICE) return CARP - 0.22; return CARP + F.h(x, y) * K; };

  // ---- the ground, the carpet and the rail, as one height field
  var GZ = new Float32Array(GX * GY), GM = new Array(GX * GY), GE = new Array(GX * GY);
  for (j = 0; j < GY; j++){ for (i = 0; i < GX; i++){
    x = b[0] + i * st; y = b[1] + j * st; var k0 = j * GX + i, m = inB(x, y) ? C.mats.at(x, y) : M.OUT;
    if (m !== M.OUT){ GZ[k0] = (m === M.WATER || m === M.ICE) ? CARP - 0.22 : CARP + F.h(x, y) * K; GM[k0] = m; continue; }
    if (Math.abs(SD[k0]) < RW){ GZ[k0] = RAIL; GM[k0] = 'rail'; continue; }
    if (LD){ var r = LD.mat(x, y); GZ[k0] = LD.h(x, y); GM[k0] = 't:' + r[0]; GE[k0] = r[1]; }
    else { GZ[k0] = 0; GM[k0] = 'ground'; }
  } if ((j & 15) === 15) yield; }
  function gzI(i, j){ return GZ[Math.max(0, Math.min(GY - 1, j)) * GX + Math.max(0, Math.min(GX - 1, i))]; }
  function gz(x, y){ return gzI(Math.round((x - b[0]) / st), Math.round((y - b[1]) / st)); }
  for (j = 0; j < GY; j++){ if ((j & 15) === 15) yield; for (i = 0; i < GX; i++){
    x = b[0] + i * st; y = b[1] + j * st; var kk = j * GX + i, z = GZ[kk], mm = GM[kk], zs = gzI(i, j + 1);
    var zx = (gzI(i + 1, j) - gzI(i - 1, j)) / (2 * st), zy = (gzI(i, j + 1) - gzI(i, j - 1)) / (2 * st);
    var terr = typeof mm === 'string' && mm.charAt(0) === 't';
    var flat = (mm === 'rail' || mm === 'ground') ? 0 : 1, gn = terr ? (LD.gain || 1) : 1, n = camN(-zx * flat * gn, -zy * flat * gn, 1);
    var ti = Math.floor((x - b[0]) / ART), tj = Math.floor((y - b[1]) / ART);
    var key = terr ? mm : mm === 'rail' ? 'rail' : mm === 'ground' ? 'ground' : mm === M.WATER ? 'haz' : mm === M.ICE ? 'ice' : mm === M.MUD ? 'slow' : 'carpet';
    var ex2 = { ti:ti, tj:tj, dt:key === 'ground' ? -1 : 0, nl:terr };
    if (GE[kk]) for (var qq in GE[kk]) ex2[qq] = GE[kk][qq];
    splat(x, y, z, key, n, ex2);
    if (z > zs + 0.12){ var ex3 = { ti:ti, tj:tj, nl:terr, dt:-1 }; if (GE[kk]) for (qq in GE[kk]) ex3[qq] = GE[kk][qq];
      for (var zz = zs; zz < z; zz += st * 0.8) splat(x, y + st / 2, zz, key === 'carpet' ? 'skirt' : key, camN(0, 1, 0), ex3); }
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
      splat(x0 + i * sv, y0 + j * sv, z0 + k * sv, 'x:' + c, camN(gx, gy, gz2 || 0.0001));
    }
  }
  // solid(box, fn): asks fn(x, y, z) for a colour at every voxel. Fine for small things.
  // every solid is queued and built later, one a step, so no one piece of land holds a frame
  var JOBS = [];
  function solid(){ var a = arguments; JOBS.push(function(){ solidNow.apply(null, a); }); }
  function vox(){ var a = arguments; JOBS.push(function(){ voxNow.apply(null, a); }); }
  function solidNow(x0, y0, z0, x1, y1, z1, fn, sv){
    sv = sv || ART / 2;
    var nx = Math.ceil((x1 - x0) / sv) + 1, ny = Math.ceil((y1 - y0) / sv) + 1, nz = Math.ceil((z1 - z0) / sv) + 1, A = new Array(nx * ny * nz);
    for (var k = 0; k < nz; k++) for (var j = 0; j < ny; j++) for (var i = 0; i < nx; i++) A[(k * ny + j) * nx + i] = fn(x0 + i * sv, y0 + j * sv, z0 + k * sv);
    emit(A, nx, ny, nz, x0, y0, z0, sv);
  }
  // vox(box, draw): draw(set) writes voxels itself, so a tree is the cost of its branches rather than its box.
  function voxNow(x0, y0, z0, x1, y1, z1, draw, sv){
    sv = sv || ART / 2;
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
  var LATHE = { pumpkin:1, ghost:1, pine:1, snowman:1, egg:1, snowball:1, beachball:1, pie:1, potgold:1, umbrella:1, clover:0, star:0 };
  var LIFT = { bat:1.4, ghost:0.5 };
  function base(x, y){ return CARP + F.h(x, y) * K; }
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
  if (LD) LD.build(B);
  (C.bumpers || []).forEach(function(u){ prop(u.x, u.y, u.r * 1.05, u.skin, base(u.x, u.y) - 0.1); });
  (C.blocks || []).forEach(function(rc){ var fn = SK[rc.skin] || SK.stone, h = 1.5, zb = CARP;
    solid(rc.x0, rc.y0, zb, rc.x1, rc.y1, zb + h, function(x, y, z){ var u = ((x - rc.x0) / (rc.x1 - rc.x0)) * 2 - 1, v = 1 - 2 * (z - zb) / h; return fn(u * 0.7, v * 0.9) || fn(0, 0.4) || T.wallLo; }); });
  // a tunnel: a raised collar round the mouth the ball rolls into, and an arch where it comes out
  (C.portals || []).forEach(function(pt){ var col = skinCol(pt.skin), za = base(pt.ax, pt.ay), zb = base(pt.bx, pt.by), r0 = pt.r || 0.75;
    solid(pt.ax - r0 - 0.4, pt.ay - r0 - 0.4, za - 0.05, pt.ax + r0 + 0.4, pt.ay + r0 + 0.4, za + 0.55, function(x, y, z){ var d = Math.hypot(x - pt.ax, y - pt.ay), t = z - za;
      if (d > r0 + 0.35 || d < r0 - 0.05) return null; return t < 0.45 - Math.abs(d - r0 - 0.15) * 1.2 ? col : null; });
    var dx = pt.dx || 0, dy = pt.dy || -1;
    solid(pt.bx - 1.3, pt.by - 1.3, zb - 0.05, pt.bx + 1.3, pt.by + 1.3, zb + 1.3, function(x, y, z){ var ax = x - pt.bx, ay = y - pt.by, along = ax * dx + ay * dy, side = -ax * dy + ay * dx, t = z - zb;
      if (along > 0.15 || along < -0.75) return null; var rr = Math.hypot(side, t); if (rr > 1.05 || rr < 0.72 || t < 0) return null; return col; });
  });
  var mill = null;
  if (C.mill){ var mx = C.mill.x, my = C.mill.y - 0.4, mzb = CARP + 1.5, Ht = 4.2;
    solid(mx - 1.9, my - 1.3, mzb, mx + 1.9, my + 1.3, mzb + Ht + 1.6, function(x, y, z){ var t = (z - mzb) / Ht, dx = Math.abs(x - mx), dy = Math.abs(y - my);
      if (t > 1){ var rt = (t - 1) * Ht / 1.6; if (dx > 1.7 * (1 - rt) || dy > 1.15) return null; return (Math.floor((z - mzb) * 4) % 2) ? T.wallLo : T.ink; }
      var hw = 1.5 - t * 0.45, hd = 1.1 - t * 0.3; if (dx > hw || dy > hd) return null;
      if (y - my > hd - 0.25 && dx < 0.42 && t < 0.32) return T.ink;
      if (y - my > hd - 0.25 && dx < 0.32 && Math.abs(t - 0.6) < 0.07) return '#ffd36a';
      return (Math.floor((z - mzb) * 2.5) % 2) ? T.wall : T.wallHi; });
    mill = { x:mx, y:my + 1.25, z:mzb + Ht * 0.78, r:3.2 };
  }

  for (var jb = 0; jb < JOBS.length; jb++){ JOBS[jb](); yield; }
  // ---- paint, with the theme's colours on the golfer's ramps
  var R = PX.ramp, h3 = P.hash3;
  for (var yy = 0; yy < Hh; yy++) for (var xx = 0; xx < W; xx++){ var cc = S.g[yy][xx]; if (cc && cc.nv){ cc.n = nfix(cc.nv); } }
  function nfix(v){ return function(){ return v; }; }
  var y0 = 0; while (y0 < Hh - 1 && S.g[y0].every(function(c){ return !c; })) y0++;
  if (y0 > 0){ S.g = S.g.slice(y0); S.H = Hh - y0; }
  var cv = document.createElement('canvas'); cv.width = W; cv.height = Hh - y0; var ctx = cv.getContext('2d');
  ctx.fillStyle = (LD && LD.bg) || T.bg; ctx.fillRect(0, 0, W, Hh);
  var rampOf = function(c, x, y){
    var n = h3(c.ti || x, c.tj || y, 3), m = c.m;
    if (m === 'carpet') return R(n < 0.16 ? T.carpet2 : T.carpet);
    if (m === 'skirt') return R(T.wallLo);
    if (m === 'ground') return R(h3((c.ti || x) >> 1, (c.tj || y) >> 1, 9) < 0.14 ? T.bg2 : T.bg);
    if (m === 'rail') return R(T.wall);
    if (m === 'haz') return R(((x + (y >> 1) * 3) % 13) === 0 ? T.hazCol2 : T.hazCol);
    if (m === 'ice') return R(T.hazCol); if (m === 'slow') return R(T.slowCol);
    if (m.charAt(0) === 'x') return R(m.slice(2));
    if (m.charAt(0) === 't'){ var kk2 = m.slice(2), tt = LD.mats[kk2];
      if (tt.length > 4 && tt[4]) return tt[4](c, R, h3);
      var n1 = h3(c.ti >> 1, c.tj >> 1, 11), n2 = h3(c.ti, c.tj, 12);
      return R(n1 < tt[3] ? (n2 < 0.5 ? tt[1] : tt[2]) : tt[0]); }
    return '#ff00ff';
  };
  // in bands, each painted with two rows of its neighbours either side (the outline and the contact
  // shadows read one row up and down) and clipped to its own rows, so the seams are invisible
  var HH = S.H || (Hh - y0), BAND = 24;
  for (var ya = 0; ya < HH; ya += BAND){ var yb = Math.min(HH, ya + BAND), a0 = Math.max(0, ya - 2), a1 = Math.min(HH, yb + 2);
    var view = Object.create(PX.Sprite.prototype); view.W = W; view.H = a1 - a0; view.g = S.g.slice(a0, a1); view.z = S.z;
    ctx.save(); ctx.beginPath(); ctx.rect(0, ya, W, yb - ya); ctx.clip(); ctx.translate(0, a0);
    view.paint(ctx, 1, (function(off){ return function(c, x, y){ return rampOf(c, x, y + off); }; })(a0));
    ctx.restore(); yield; }
  var pr = function(x, y, z){ return [(x - b[0]) / ART, y * se / ART - z * ce / ART + oy - y0]; };
  var un = function(px, py, z){ return [px * ART + b[0], (py - oy + y0 + (z || 0) * ce / ART) * ART / se]; };
  if (LD && LD.fog){ ctx.globalAlpha = 0.16; ctx.fillStyle = LD.fogCol || '#8a6fb8';   // ground fog drifting across the land
    for (var fy = 0; fy < Hh - y0; fy += 2) for (var fx = 0; fx < W; fx += 2){ var wx = b[0] + fx * ART, wy = (fy + y0 - oy) * ART / se, fv = LD.fog(wx, wy);
      if (clearAt(wx, wy) > 0.4 && fv > 0.62 && (fv > 0.7 || ((fx + fy) & 2))) ctx.fillRect(fx, fy, 2, 2); }
    ctx.globalAlpha = 1; }
  if (LD && LD.after) LD.after(ctx, { pr:pr, W:W, H:Hh - y0, b:b, ART:ART, se:se, oy:oy - y0 });
  return { cv:cv, pr:pr, un:un, zAt:surf, mill:mill, se:se, ce:ce, K:K, carp:CARP };
}
