/* golf/putt/land.js: the land a Putting Green hole sits in, one composed place per theme.

   Owner's rule: the area around a hole is a fictional landscape, built out for the land you are in,
   never a scatter of stickers. So each theme lays out terrain (hills, dunes, water, paths, fields) and
   a few built places (a churchyard, a lighthouse, a barn, a gazebo) with real height, all of it kept
   clear of the course and kept tall only behind it (north, up the screen), so nothing stands between
   the camera and the carpet.

   make(C, E, clearAt, seed) -> { h(x, y), mat(x, y) -> [key, extra], build(B), mats, gain, bg, after }
   clearAt(x, y) is the distance outside the course's rail (negative inside). B is hole3d.js's kit:
   solid, vox, tube, blob, gz. A theme with no entry here gets plain ground. */
window.RTT_PUTT_LAND = (function(){
  var STOPS = {}, FLY = {};   // each world's stops and the birds over them (the end of this file)
  function hash(x, y, s){ var h = (x * 374761393 + y * 668265263 + s * 982451653) | 0; h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967296; }
  function vn(x, y, s){ var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    var a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
  function fbm(x, y, s){ return vn(x, y, s) * 0.55 + vn(x * 2.1, y * 2.1, s + 7) * 0.3 + vn(x * 4.3, y * 4.3, s + 13) * 0.15; }
  function sm(a, b, t){ t = Math.max(0, Math.min(1, (t - a) / (b - a))); return t * t * (3 - 2 * t); }
  function segD(x, y, ax, ay, bx, by){ var dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1e-9, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L)); return Math.hypot(x - ax - t * dx, y - ay - t * dy); }
  function lineD(x, y, pts){ var m = 1e9; for (var i = 0; i < pts.length - 1; i++) m = Math.min(m, segD(x, y, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1])); return m; }
  function inR(x, y, r, pad){ pad = pad || 0; return r && Math.abs(x - r.x) < r.w / 2 + pad && Math.abs(y - r.y) < r.d / 2 + pad; }
  // a winding path: a few points between a and b, nudged sideways by noise
  function wind(a, b, seed, amp){ var pts = [], n = 8, dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    for (var i = 0; i <= n; i++){ var t = i / n, w = Math.sin(t * Math.PI) * (vn(t * 2.3, seed, seed) - 0.5) * 2 * amp; pts.push([a[0] + dx * t + nx * w, a[1] + dy * t + ny * w]); } return pts; }

  function make(C, E, clearAt, seed){
    var AP = C.allPts || C.poly, xs = AP.map(function(p){ return p[0]; }), ys = AP.map(function(p){ return p[1]; });
    var P0 = [Math.min.apply(null, xs), Math.min.apply(null, ys)], P1 = [Math.max.apply(null, xs), Math.max.apply(null, ys)], cx = (P0[0] + P1[0]) / 2, cy = (P0[1] + P1[1]) / 2;
    var used = [];
    // how far each half foot of ground is from the nearest thing already placed, less its radius,
    // kept up to date as things are placed, so finding a free spot is a lookup rather than a scan
    var FX = Math.ceil((E[2] - E[0]) / 0.5) + 2, FY = Math.ceil((E[3] - E[1]) / 0.5) + 2, FREE = new Float32Array(FX * FY).fill(1e9);
    used.push = function(u){ Array.prototype.push.call(used, u); var R = u.r + 5, i0 = Math.max(0, Math.floor((u.x - R - E[0]) / 0.5)), i1 = Math.min(FX - 1, Math.ceil((u.x + R - E[0]) / 0.5)),
      j0 = Math.max(0, Math.floor((u.y - R - E[1]) / 0.5)), j1 = Math.min(FY - 1, Math.ceil((u.y + R - E[1]) / 0.5));
      for (var j = j0; j <= j1; j++) for (var i = i0; i <= i1; i++){ var v = Math.hypot(E[0] + i * 0.5 - u.x, E[1] + j * 0.5 - u.y) - u.r, k = j * FX + i; if (v < FREE[k]) FREE[k] = v; }
      return used.length; };
    function okAt(x, y, need){ return x > E[0] + need && x < E[2] - need && y > E[1] + need && y < E[3] - need && clearAt(x, y) > need; }
    function spot(r, pref, extra){ var best = null, bs = -1e9;
      var sk = r >= 1.2 ? 2 : 1;   // a big thing does not need a half foot search
      for (var j = 0; E[1] + j * 0.5 <= E[3]; j += sk) for (var i = 0; E[0] + i * 0.5 <= E[2]; i += sk){ var x = E[0] + i * 0.5, y = E[1] + j * 0.5;
        if (FREE[j * FX + i] < r + 0.5) continue; if (!okAt(x, y, r + 1.2)) continue; if (extra && !extra(x, y)) continue;
        var s = pref(x, y) + hash(x * 2 | 0, y * 2 | 0, seed) * 0.4; if (s > bs){ bs = s; best = { x:x, y:y, r:r }; } }
      if (best) used.push(best); return best; }
    function spotRect(w, d, pref){ var best = null, bs = -1e9;
      for (var jj = 0; E[1] + jj * 0.5 <= E[3]; jj += 2) for (var ii = 0; E[0] + ii * 0.5 <= E[2]; ii += 2){ var x = E[0] + ii * 0.5, y = E[1] + jj * 0.5, ok = true;
        if (FREE[jj * FX + ii] < Math.min(w, d) / 2) continue;   // something already stands where its middle would be
        for (var j = 0; j <= 4 && ok; j++) for (var i = 0; i <= 4 && ok; i++){ if (!okAt(x - w / 2 + w * i / 4, y - d / 2 + d * j / 4, 1.0)) ok = false; }
        if (!ok) continue; if (used.some(function(u){ return Math.abs(u.x - x) < w / 2 + u.r + 0.4 && Math.abs(u.y - y) < d / 2 + u.r + 0.4; })) continue;
        var s = pref(x, y) + hash(x * 2 | 0, y * 2 | 0, seed + 1) * 0.4; if (s > bs){ bs = s; best = { x:x, y:y, w:w, d:d, r:Math.max(w, d) / 2 }; } }
      if (best) used.push({ x:best.x, y:best.y, r:Math.min(best.w, best.d) / 2 + 0.3 }); return best; }
    // tall things want to stand behind the course
    function north(x, y){ return -(y - P0[1]); }
    function far(x, y){ return Math.min(clearAt(x, y), 6); }
    function side(x){ return x < P0[0] - 0.5 || x > P1[0] + 0.5 ? 1 : 0; }
    // a path that would cross the course goes round it instead
    function route(a, b, sd, amp){ var cross = false; for (var t = 0; t <= 1; t += 0.02) if (clearAt(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t) < 0.6) cross = true;
      if (!cross) return wind(a, b, sd, amp); var sx = (a[0] + b[0]) / 2 < cx ? P0[0] - 2.8 : P1[0] + 2.8;
      var k = [a, [sx, Math.min(a[1], P0[1] - 1.5)], [sx, Math.max(b[1], P1[1] + 1.5)], b], out = [];
      for (var i = 0; i < k.length - 1; i++){ var w = wind(k[i], k[i + 1], sd + i, amp * 0.5); if (i) w.shift(); out.push.apply(out, w); } return out; }
    // scattered things on open ground, on a jittered grid, never on the course or a path
    function scatter(step, test, salt){ var out = [];
      for (var y = E[1] + 0.5; y < E[3]; y += step) for (var x = E[0] + 0.5; x < E[2]; x += step){
        var jx = x + hash(x * 7 | 0, y * 7 | 0, seed + salt) * step * 0.8, jy = y + hash(y * 5 | 0, x * 3 | 0, seed + salt) * step * 0.8;
        if (clearAt(jx, jy) > 1.4 && test(jx, jy)) out.push([jx, jy]); }
      return out; }
    // the distance to a line of points, worked out once on a half foot grid and read back smoothly,
    // because h() and mat() are asked it at every point of the ground
    function dist(pts){ if (!pts) return function(){ return 1e9; }; var st = 0.5, nx = Math.ceil((E[2] - E[0]) / st) + 2, ny = Math.ceil((E[3] - E[1]) / st) + 2, A = new Float32Array(nx * ny);
      for (var j = 0; j < ny; j++) for (var i = 0; i < nx; i++) A[j * nx + i] = lineD(E[0] + i * st, E[1] + j * st, pts);
      return function(x, y){ var fx = (x - E[0]) / st, fy = (y - E[1]) / st; if (fx < 0 || fy < 0 || fx >= nx - 1 || fy >= ny - 1) return lineD(x, y, pts);
        var i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, k = j * nx + i; return (A[k] * (1 - u) + A[k + 1] * u) * (1 - v) + (A[k + nx] * (1 - u) + A[k + nx + 1] * u) * v; }; }
    var L = { leg:C.leg || 0, stop:C.stop || '', dist:dist, C:C, E:E, P0:P0, P1:P1, cx:cx, cy:cy, seed:seed, spot:spot, spotRect:spotRect, north:north, far:far, side:side, used:used, clearAt:clearAt, route:route, scatter:scatter };
    var bld = (C.scene && BUILD[C.scene]) || BUILD[C.theme], O = bld ? bld(L) : null;   // a secret hole's own place before its world's land
    if (O && O.fill) furnish(L, O);
    return O;
  }

  /* THE REST OF THE LAND. A theme places its landmarks; this furnishes the open ground round them,
     scaled to however much ground the screen asks for. Trees go behind and beside the course only,
     because anything tall in front of it would stand between the camera and the carpet. In front of
     it go low things: a bush, a rock, a bale. */
  function furnish(L, O){
    var F = O.fill, E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, trees = [], lows = [], step = 2.3;
    function free(x, y, r){ return !L.used.some(function(u){ return Math.hypot(u.x - x, u.y - y) < u.r + r; }); }
    for (var y = E[1] + 1; y < E[3] - 0.8; y += step) for (var x = E[0] + 1; x < E[2] - 0.8; x += step){
      var jx = x + (hash(x * 7 | 0, y * 7 | 0, seed + 41) - 0.5) * step * 0.9, jy = y + (hash(y * 5 | 0, x * 3 | 0, seed + 43) - 0.5) * step * 0.9;
      var cl = L.clearAt(jx, jy), key = O.mat(jx, jy)[0]; if (F.on.indexOf(key) < 0) continue;
      var behind = jy < P0[1] - 1.5 || ((jx < P0[0] - 1 || jx > P1[0] + 1) && jy < P1[1] - 2), roll = hash(jx * 13 | 0, jy * 13 | 0, seed + 47);
      if (behind && cl > 2.6 && roll < (F.trees || 0.45) && free(jx, jy, 1.4)){ trees.push([jx, jy]); L.used.push({ x:jx, y:jy, r:1.2 }); }
      else if (cl > 1.6 && roll < (F.lows || 0.3) && free(jx, jy, 0.8)){ lows.push([jx, jy]); L.used.push({ x:jx, y:jy, r:0.6 }); }
    }
    var build = O.build;
    O.build = function(B){ build(B); trees.forEach(function(q, i){ F.tree(B, q[0], q[1], i); }); lows.forEach(function(q, i){ F.low(B, q[0], q[1], i); }); };
  }

  /* ---------------------------------------------------------------- shared pieces */
  // a broad leafy tree: trunk, a few limbs and a lumpy crown
  function broadTree(B, x, y, H, bark, leaves, k){
    var zb = B.gz(x, y), cz = zb + H * 0.68, R = H * 0.3;
    B.vox(x - R * 1.8, y - R * 1.6, zb - 0.1, x + R * 1.8, y + R * 1.6, zb + H + 0.4, function(set){
      B.tube(set, x, y, zb, x, y, cz, 0.26, 0.16, bark);
      for (var i = 0; i < 5; i++){ var a = hash(i, k, 3) * 6.28, rr = R * (0.45 + hash(k, i, 4) * 0.4);
        B.blob(set, x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.7, cz + (hash(i, k, 5) - 0.3) * R * 0.8, R * 0.8, R * 0.75, R * 0.7, function(px, py, pz){
          var q = (Math.floor(px * 2.2) + Math.floor(pz * 2.2) + Math.floor(py * 2.2)) % 5; return q === 0 ? leaves[1] : q === 1 && leaves[2] ? leaves[2] : leaves[0]; }); }
      B.blob(set, x, y, cz + R * 0.35, R, R * 0.85, R * 0.8, function(px, py, pz){ return (Math.floor(px * 2.2) + Math.floor(pz * 2.2)) % 4 ? leaves[0] : leaves[1]; });
    });
  }
  // a gable roofed house, ridge running east to west, front to the camera
  function house(B, r, o){
    var x = r.x, y = r.y, w = r.w, d = r.d, zb = B.gz(x, y), wh = o.wh || 2.4, rh = o.rh || 1.6, ov = o.ov || 0.35;
    B.solid(x - w / 2 - ov - 0.2, y - d / 2 - ov - 0.2, zb - 0.1, x + w / 2 + ov + 0.2, y + d / 2 + ov + 0.6, zb + wh + rh + (o.chim ? 1.1 : 0.4), function(px, py, pz){
      var dx = px - x, dy = py - y, t = pz - zb;
      if (o.chim && Math.abs(dx - w * 0.28) < 0.3 && Math.abs(dy + d * 0.15) < 0.3 && t < wh + rh + 0.9) return o.chim;
      if (Math.abs(dx) < w / 2 && Math.abs(dy) < d / 2 && t < wh) return o.wall(dx, dy, t, w, d);
      if (t >= wh && Math.abs(dx) < w / 2 + ov){ var rr = (t - wh) / rh; if (rr < 1 && Math.abs(dy) < (d / 2 + ov) * (1 - rr)) return o.roof(dx, dy, t, rr, Math.abs(dy) > (d / 2 + ov) * (1 - rr) - 0.25); }
      if (o.step && t < 0.22 && dy > d / 2 && dy < d / 2 + 0.35 && Math.abs(dx) < 0.6) return o.step;
      return null; });
  }
  // a post and rail fence along a line of points, kept off the course
  function railFence(B, pts, post, rail, cap){
    for (var i = 0; i < pts.length - 1; i++){ var a = pts[i], b = pts[i + 1]; if (B.clearAt(a[0], a[1]) < 0.8 || B.clearAt(b[0], b[1]) < 0.8) continue; var zb = B.gz(a[0], a[1]);
      B.solid(Math.min(a[0], b[0]) - 0.2, Math.min(a[1], b[1]) - 0.2, zb - 0.1, Math.max(a[0], b[0]) + 0.2, Math.max(a[1], b[1]) + 0.2, zb + 1.15, function(px, py, pz){
        var sd = segD(px, py, a[0], a[1], b[0], b[1]), t = pz - zb, ends = Math.min(Math.hypot(px - a[0], py - a[1]), Math.hypot(px - b[0], py - b[1]));
        if (ends < 0.11 && t < 1) return cap && t > 0.92 ? cap : post;
        if (sd < 0.09 && (Math.abs(t - 0.45) < 0.07 || Math.abs(t - 0.85) < 0.07)) return cap && t > 0.88 ? cap : rail; return null; }); }
  }
  function lamp(B, x, y, pole, glow){ var zb = B.gz(x, y); if (B.light) B.light(x, y, zb + 1.6, glow);
    B.solid(x - 0.3, y - 0.3, zb, x + 0.3, y + 0.3, zb + 1.8, function(px, py, pz){ var t = pz - zb, r = Math.hypot(px - x, py - y);
      if (t < 1.45 && r < 0.07) return pole; if (t >= 1.45 && t < 1.75 && r < 0.17) return t > 1.68 || r > 0.13 ? pole : glow; return null; }); }
  
  function bush(B, x, y, r, cols){ var zb = B.gz(x, y);
    B.solid(x - r - 0.1, y - r - 0.1, zb - 0.05, x + r + 0.1, y + r + 0.1, zb + r * 1.6, function(px, py, pz){ var d = Math.hypot((px - x) / r, (py - y) / r, (pz - zb - r * 0.55) / (r * 0.85));
      return d < 1 ? cols[(Math.floor(px * 6) + Math.floor(pz * 6) + Math.floor(py * 6)) % cols.length] : null; }); }
  function rockAt(B, x, y, r, cols){ var zb = B.gz(x, y) - 0.05;
    B.solid(x - r, y - r, zb, x + r, y + r, zb + r * 1.1, function(px, py, pz){ var d = Math.hypot((px - x) / r, (py - y) / (r * 0.8), (pz - zb) / (r * 0.9)) + (hash(px * 9 | 0, pz * 9 | 0, 5) - 0.5) * 0.15;
      return d < 1 ? (hash(px * 7 | 0, py * 7 | 0, 2) < 0.3 ? cols[1] : cols[0]) : null; }); }
  function deadTree(B, x, y, H, k){ var zb = B.gz(x, y), tx = x + (hash(k, 1, 3) - 0.5) * 0.5;
    B.vox(x - 3, y - 2.2, zb - 0.1, x + 3, y + 2.2, zb + H + 1, function(set){
      B.tube(set, x, y, zb, tx, y, zb + H * 0.65, 0.34, 0.2, function(u, z){ return z < zb + 0.25 ? '#1d171d' : '#2b2229'; });
      var n = 4 + (hash(k, 2, 7) * 3 | 0);
      for (var j = 0; j < n; j++){ var a = hash(k, j, 9) * 6.28, s0 = 0.35 + hash(j, k, 4) * 0.45, bx = x + (tx - x) * s0, bz = zb + H * 0.65 * s0 + 0.2, len = 1.2 + hash(j, k, 6) * 1.4;
        var ex = bx + Math.cos(a) * len, ey = y + Math.sin(a) * len * 0.6, ez = bz + len * 0.8;
        B.tube(set, bx, y, bz, ex, ey, ez, 0.11, 0.07, '#2b2229'); B.tube(set, ex, ey, ez, ex + Math.cos(a + 0.8) * 0.5, ey + Math.sin(a + 0.8) * 0.3, ez + 0.45, 0.07, 0.04, '#2b2229'); }
      B.tube(set, tx, y, zb + H * 0.65, tx + (hash(k, 7, 1) - 0.5) * 0.6, y, zb + H, 0.12, 0.05, '#2b2229'); }); }
  function pineAt(B, x, y, r, i){ var zb = B.gz(x, y), H = r * 5.2 + 1, R0 = r * 1.3;
    B.solid(x - R0, y - R0, zb, x + R0, y + R0, zb + H + 0.2, function(px, py, pz){ var rr = Math.hypot(px - x, py - y), h = (pz - zb) / H;
      if (h < 0.14) return rr < 0.16 ? '#4a3626' : null; var tier = (h - 0.14) / 0.86 * 3, f = tier - Math.floor(tier), rad = R0 * (1 - (h - 0.14) / 0.86) * (0.65 + 0.45 * (1 - f)); if (rr > rad) return null;
      var top = (f > 0.55 && rr > rad - 0.22) || h > 0.93; return top ? '#f6f9fd' : ((Math.floor(pz * 5) + i) % 3 ? '#1f4f3e' : '#2a6450'); }, B.ART); }

  var BUILD = {};

  /* ---------------- HAUNTED HOLLOW: an old churchyard on a hill, a crypt, a dead wood, a bog */
  BUILD.haunted = function(L){
    var C = L.C, E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot, spotRect = L.spotRect, north = L.north;
    var yard = spotRect(13, 8, function(x, y){ return north(x, y) * 1.4 - Math.abs(x - L.cx) * 0.25; });
    var crypt = yard ? { x:yard.x + (hash(seed, 1, 2) < 0.5 ? -3.4 : 3.4), y:yard.y - 1.7, w:4.6, d:3.4 } : spotRect(4, 3, north);
    var bog = spot(2.6, function(x, y){ return -Math.abs(y - L.cy) * 0.3 + Math.abs(x - L.cx) * 0.4; });
    var tee = C.tee, gate = yard ? [yard.x, yard.y + yard.d / 2] : null;
    var paths = [wind([tee[0] + (tee[0] < L.cx ? -1 : 1) * 0.5, E[3] + 1], [tee[0], Math.max(tee[1], P1[1]) + 1.4], seed, 1.5)];
    if (gate) paths.push(L.route([gate[0], gate[1] + 0.2], [tee[0], P1[1] + 1.4], seed + 3, 1.2));
    var patch = spotRect(7, 5, function(x, y){ return -Math.abs(y - L.cy - 3) * 0.5 - Math.abs(Math.abs(x - L.cx) - 12) * 0.8; });
    var trees = []; for (var i = 0; i < 26; i++){ var t = spot(1.3 + hash(i, seed, 4) * 0.6, function(x, y){ return north(x, y) * 0.9 + Math.min(L.far(x, y), 5) * 0.5 + L.side(x) * 3.5; }); if (t) trees.push(t); }
    var lamps = [], pp = paths[1] || paths[0];
    for (i = 1; i < pp.length - 1; i += 2){ var p = pp[i], q = pp[i + 1], dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1, s = i % 4 === 1 ? 1 : -1, lx = p[0] - dy / l * 1.3 * s, ly = p[1] + dx / l * 1.3 * s; if (clearAt(lx, ly) > 0.8) lamps.push([lx, ly]); }
    var graves = []; if (yard){ for (var r = 0; r < 2; r++) for (var c = 0; c < 5; c++){ var gx = yard.x - yard.w / 2 + 1.4 + c * ((yard.w - 2.8) / 4), gy = yard.y + 0.4 + r * 1.8;
      if (crypt && Math.abs(gx - crypt.x) < crypt.w / 2 + 0.6 && gy < crypt.y + crypt.d / 2 + 0.8) continue; graves.push({ x:gx, y:gy, k:hash(r, c, seed) }); } }
    function bogD(x, y){ return bog ? 1 - Math.hypot((x - bog.x) / bog.r, (y - bog.y) / (bog.r * 0.75)) + (fbm(x * 0.6, y * 0.6, seed + 9) - 0.5) * 0.5 : -1; }
    var dP0 = L.dist(paths[0]), dP1 = L.dist(paths[1]);
    function onPath(x, y){ return dP0(x, y) < 0.85 || dP1(x, y) < 0.7; }
    function inGrave(x, y){ for (var i = 0; i < graves.length; i++){ var g = graves[i], u = (x - g.x) / 0.45, v = (y - (g.y + 0.55)) / 0.7; if (u * u + v * v < 1) return 1 - u * u - v * v; } return 0; }
    return {
      h:function(x, y){ var z = (fbm(x * 0.06, y * 0.06, seed) - 0.45) * 2.6 * sm(1.5, 7, clearAt(x, y));
        if (inR(x, y, patch)) z = z * 0.3 + 0.1 + (((y - patch.y) % 1 + 1) % 1 < 0.5 ? 0.12 : 0);
        if (yard){ var dx = Math.max(0, Math.abs(x - yard.x) - yard.w / 2), dy = Math.max(0, Math.abs(y - yard.y) - yard.d / 2), d = Math.hypot(dx, dy); z = z * sm(0, 3, d) + 0.35 * (1 - sm(0, 3, d)); }
        z += 0.18 * inGrave(x, y);
        var b = bogD(x, y); if (b > 0) z = Math.min(z, -0.25); else if (b > -0.25) z = Math.min(z, -0.1 + b);
        if (onPath(x, y)) z -= 0.04; return z; },
      mat:function(x, y){ var b = bogD(x, y); if (b > 0) return ['bog', { dep:b }]; if (b > -0.18) return ['mud'];
        if (onPath(x, y)) return ['gravel']; if (inGrave(x, y)) return ['dirt']; if (inR(x, y, yard)) return ['yard']; if (inR(x, y, patch)) return ['dirt']; return ['turf']; },
      build:function(B){
        if (yard){ // the iron fence, with a gate where the path comes in
          var x0 = yard.x - yard.w / 2, x1 = yard.x + yard.w / 2, y0 = yard.y - yard.d / 2, y1 = yard.y + yard.d / 2, zb = B.gz(yard.x, yard.y);
          B.solid(x0 - 0.2, y0 - 0.2, zb, x1 + 0.2, y1 + 0.2, zb + 1.35, function(x, y, z){ var t = z - zb;
            var onX = (Math.abs(y - y0) < 0.08 || Math.abs(y - y1) < 0.08) && x > x0 - 0.05 && x < x1 + 0.05, onY = (Math.abs(x - x0) < 0.08 || Math.abs(x - x1) < 0.08) && y > y0 - 0.05 && y < y1 + 0.05;
            if (!onX && !onY) return null; if (Math.abs(y - y1) < 0.1 && Math.abs(x - yard.x) < 0.9 && !(Math.abs(Math.abs(x - yard.x) - 0.9) < 0.1)) return null;
            var along = onX ? x : y, post = Math.abs(((along - x0) % 0.5 + 0.5) % 0.5 - 0.25) > 0.19, corner = (Math.abs(x - x0) < 0.12 || Math.abs(x - x1) < 0.12) && (Math.abs(y - y0) < 0.12 || Math.abs(y - y1) < 0.12);
            if (corner && t < 1.3) return t > 1.1 ? '#d76b1a' : '#2a2330';
            if (Math.abs(t - 0.35) < 0.06 || Math.abs(t - 0.95) < 0.06) return '#231d2a';
            if (post && t < 1.12) return '#231d2a'; return null; });
          graves.forEach(function(g){ var zb2 = B.gz(g.x, g.y), cross = g.k > 0.72, w = cross ? 0.18 : 0.62, h = cross ? 1.05 : 0.75 + g.k * 0.35;
            B.solid(g.x - 0.5, g.y - 0.15, zb2, g.x + 0.5, g.y + 0.15, zb2 + h + 0.05, function(x, y, z){ var u = x - g.x, t = z - zb2; if (Math.abs(y - g.y) > 0.11) return null;
              if (cross){ if (Math.abs(u) < 0.09 && t < h) return '#9a96a8'; if (Math.abs(t - h * 0.68) < 0.08 && Math.abs(u) < 0.32) return '#9a96a8'; return null; }
              var r = w / 2; if (Math.abs(u) > r) return null; if (t > h - r && Math.hypot(u, t - (h - r)) > r) return null;
              return (Math.abs(t - h * 0.6) < 0.04 && Math.abs(u) < r * 0.6) ? '#5f5b6c' : (g.k < 0.3 ? '#7c7889' : '#8e8b9c'); }); });
          [-0.9, 0.9].forEach(function(o){ var x = yard.x + o, y = yard.y + yard.d / 2, zb = B.gz(x, y) + 1.12;   // jack o' lanterns on the gate posts
            B.solid(x - 0.25, y - 0.25, zb, x + 0.25, y + 0.25, zb + 0.45, function(px, py, pz){ var dx = (px - x) / 0.22, dy = (py - y) / 0.22, dz = (pz - zb - 0.18) / 0.17;
              if (dx * dx + dy * dy + dz * dz > 1) return pz > zb + 0.34 && Math.hypot(px - x, py - y) < 0.04 ? '#3a5a1a' : null;
              return (py - y > 0.12 && Math.abs(pz - zb - 0.2) < 0.05 && Math.abs(px - x) < 0.1) ? '#ffd56a' : '#e8761f'; }); });
        }
        if (crypt){ var X = crypt.x, Y = crypt.y, w = crypt.w, d = crypt.d, zc = B.gz(X, Y), wh = 2.1, rh = 1.1;
          B.solid(X - w / 2 - 0.2, Y - d / 2 - 0.3, zc - 0.1, X + w / 2 + 0.2, Y + d / 2 + 0.6, zc + wh + rh + 0.6, function(px, py, pz){ var dx = px - X, dy = py - Y, t = pz - zc;
            if (dy > d / 2 && dy < d / 2 + 0.55 && Math.abs(dx) < 0.9 && t < (0.55 - (dy - d / 2)) * 0.6) return '#6c6878';
            if (Math.abs(dx) < w / 2 && Math.abs(dy) < d / 2 && t < wh){ if (dy > d / 2 - 0.15 && Math.abs(dx) < 0.55 && t < 1.45) return '#120e17';
              if (dy > d / 2 - 0.15 && Math.abs(dx) < 0.75 && t < 1.6) return '#57536a'; return (Math.floor(t * 3) + Math.floor(dx * 2)) % 2 ? '#7c7889' : '#6f6a7c'; }
            if (t >= wh && Math.abs(dy) < d / 2 + 0.15){ var rr = (t - wh) / rh; if (rr < 1 && Math.abs(dx) < (w / 2 + 0.2) * (1 - rr)) return '#3b3347';
              if (Math.abs(dx) < 0.07 && t < wh + rh + 0.55) return '#8e8b9c'; if (Math.abs(t - (wh + rh + 0.38)) < 0.06 && Math.abs(dx) < 0.22) return '#8e8b9c'; }
            return null; }); }
        trees.forEach(function(t, i){ deadTree(B, t.x, t.y, 5 + hash(i, seed, 8) * 2.6, i + seed); });
        if (patch){ var rows = Math.floor(patch.d);
          for (var r2 = 0; r2 < rows; r2++) for (var c2 = 0; c2 < 5; c2++){ if (hash(r2, c2, seed + 8) < 0.25) continue;
            (function(px, py, s0){ var zb = B.gz(px, py);
              B.solid(px - 0.6, py - 0.4, zb, px + 0.6, py + 0.4, zb + s0 * 2 + 0.25, function(x, y, z){ var dx = (x - px) / (s0 * 1.15), dy = (y - py) / s0, dz = (z - zb - s0) / s0;
                if (dx * dx + dy * dy + dz * dz < 1) return (Math.floor((x - px) * 14) % 3 === 0) ? '#c95f12' : '#e8761f'; if (Math.hypot(x - px, y - py) < 0.05 && z < zb + s0 * 2 + 0.15) return '#3a5a1a'; return null; });
            })(patch.x - patch.w / 2 + 0.7 + c2 * ((patch.w - 1.4) / 4) + (hash(r2, c2, seed) - 0.5) * 0.4, patch.y - patch.d / 2 + 0.6 + r2, 0.28 + hash(c2, r2, seed + 3) * 0.22); }
          var sx = patch.x + patch.w / 2 - 0.8, sy = patch.y - patch.d / 2 + 0.5, zs = B.gz(sx, sy);   // a scarecrow keeping watch over it
          B.solid(sx - 1, sy - 0.3, zs, sx + 1, sy + 0.3, zs + 3.3, function(x, y, z){ var dx = x - sx, t = z - zs; if (Math.abs(y - sy) > 0.22) return null;
            if (Math.abs(dx) < 0.07 && t < 2.9) return '#5a3d26'; if (Math.abs(t - 2.15) < 0.07 && Math.abs(dx) < 0.85) return '#5a3d26';
            if (t > 1.2 && t < 2.35 && Math.abs(dx) < 0.42 - (2.35 - t) * 0.06) return (Math.floor(t * 6) % 2) ? '#6a4a7a' : '#5a3a6a';
            if (Math.abs(t - 2.15) < 0.14 && Math.abs(dx) < 0.8 && Math.abs(dx) > 0.4) return '#6a4a7a';
            if (Math.hypot(dx, t - 2.65) < 0.26) return '#d6a95a'; if (t > 2.8 && t < 3.15 && Math.abs(dx) < 0.5 - (t - 2.8) * 1.2) return '#3a2a1a'; return null; }); }
        lamps.forEach(function(l){ lamp(B, l[0], l[1], '#231d2a', '#ffd56a'); });
      },
      fill:{ on:['turf'], trees:0.5, lows:0.32, tree:function(B, x, y, i){ deadTree(B, x, y, 4.2 + hash(i, seed, 18) * 2.4, i + seed * 7); },
        low:function(B, x, y, i){ var k = hash(i, seed, 19); if (k < 0.4) bush(B, x, y, 0.45, ['#2b2229', '#3a2f36', '#231d2a']); else if (k < 0.75) rockAt(B, x, y, 0.4, ['#5f5b6c', '#7c7889']);
          else { var zb = B.gz(x, y); B.solid(x - 0.4, y - 0.15, zb, x + 0.4, y + 0.15, zb + 0.9, function(px, py, pz){ var u = px - x, t = pz - zb; if (Math.abs(py - y) > 0.1 || Math.abs(u) > 0.3) return null; if (t > 0.6 && Math.hypot(u, t - 0.6) > 0.3) return null; return u < -0.1 ? '#8e8b9c' : '#7c7889'; }); } } },
      gain:0.8, fog:function(x, y){ return fbm(x * 0.13 + y * 0.03, y * 0.2, seed + 21); }, fogCol:'#8a6fb8',
      mats:{ turf:['#2e3b31', '#36443a', '#3f3a4a', 0.18], yard:['#33402f', '#3b4a37', '#4a4440', 0.12], dirt:['#4b3b31', '#58463a', '#3e3029', 0.2], gravel:['#57536a', '#67637a', '#48455a', 0.3],
        mud:['#3a3528', '#423c2e', '#2f2b21', 0.2], bog:['#1e3a30', '#6fbf2a', '#2a4a3c', 0.03, function(c, R, h3){ return R(h3(c.ti, c.tj, 4) < 0.025 ? '#6fbf2a' : '#1e3a30'); }] }
    };
  };

  /* ---------------- SEASHELL SHORES: the shore behind the hole, a lighthouse on the point, dunes and a boardwalk in front */
  BUILD.beach = function(L){
    var E = L.E, P0 = L.P0, seed = L.seed, clearAt = L.clearAt, spot = L.spot;
    function shoreY(x){ return P0[1] - 1.2 - (vn(x * 0.12, 1, seed) - 0.5) * 3 - Math.max(0, (x - L.cx)) * 0.05; }
    var sd = hash(seed, 3, 1) < 0.5 ? -1 : 1, ptx = sd < 0 ? E[0] + 3.2 : E[2] - 3.2, pty = E[1] + 3.2;
    function sea(x, y){ var d = shoreY(x) - y; d -= Math.max(0, 1.9 - Math.hypot((x - ptx) / 1.2, (y - pty))) * 2.2; return d; }   // > 0 is water; the point pushes into it
    function rock(x, y){ return Math.hypot(x - ptx, y - pty) < 2.2 + (fbm(x * 1.3, y * 1.3, seed + 4) - 0.5) * 0.8; }
    var bw = { y:E[3] - 1.6, x0:E[0] + 0.5, x1:E[2] - 0.5 };   // the boardwalk runs across the front, low
    var pierX = sd < 0 ? E[2] - 5 : E[0] + 5;
    L.used.push({ x:pierX, y:(shoreY(pierX) + E[1]) / 2, r:1.4 }); L.used.push({ x:ptx, y:pty, r:3 });
    var guard = spot(1.6, function(x, y){ return -Math.abs(y - shoreY(x) - 3) * 2 - Math.abs(x - (sd < 0 ? E[2] - 6 : E[0] + 6)) * 0.4; });
    var gc = [sd > 0 ? E[0] + 4.6 : E[2] - 4.6, L.cy + 1], palms = [];
    [[0, 0], [-1.9, 1.6], [1.6, 2.3], [-0.6, 3.9], [1.9, -1.8], [-1.7, -2.1], [0.3, -3.6]].forEach(function(o){ var x = gc[0] + o[0], y = gc[1] + o[1];
      if (clearAt(x, y) > 1.6 && x > E[0] + 1 && x < E[2] - 1){ palms.push({ x:x, y:y, r:0.9 }); L.used.push({ x:x, y:y, r:0.9 }); } });
    var umbs = []; for (var i = 0; i < 4; i++){ var u = spot(0.9, function(x, y){ return -Math.abs(y - shoreY(x) - 2.4) * 2.5 - Math.abs(x - L.cx) * 0.1 + (i % 2 ? (x - L.cx) * 0.2 : -(x - L.cx) * 0.2); }); if (u) umbs.push(u); }
    function dune(x, y){ var v = fbm(x * 0.11, y * 0.16, seed + 2); return Math.max(0, v - 0.36) * 5 * sm(1.2, 5, clearAt(x, y)) * sm(0, 3, -sea(x, y) - 1) * sm(0, 1.5, Math.abs(y - bw.y) - 1.3); }
    var fenceY = bw.y - 2.2;
    var tufts = L.scatter(1.3, function(x, y){ return dune(x, y) > 0.45 && hash(x * 9 | 0, y * 9 | 0, seed + 6) < 0.55; }, 6);
    return {
      h:function(x, y){ var s = sea(x, y); if (rock(x, y)) return 0.55 + fbm(x * 1.5, y * 1.5, seed + 5) * 0.6; if (s > 0) return -0.18 - Math.min(0.4, s * 0.1); return dune(x, y) + Math.min(0, s + 1.2) * 0.1; },
      mat:function(x, y){ var s = sea(x, y); if (rock(x, y)) return ['rock']; if (s > 0){ if (s < 0.35) return ['foam']; return ['sea', { dep:s }]; } if (s > -0.9) return ['wet']; return ['sand']; },
      build:function(B){
        (function(){ var x = ptx, y = pty, zb = B.gz(x, y) - 0.2, H = 8.5;   // the lighthouse on the point
          B.solid(x - 1.9, y - 1.9, zb, x + 1.9, y + 1.9, zb + H + 2.6, function(px, py, pz){ var r = Math.hypot(px - x, py - y), t = pz - zb;
            if (t < H){ var R = 1.6 - t / H * 0.55; if (r > R) return null; if (py - y > R - 0.2 && Math.abs(px - x) < 0.32 && t < 1.2) return '#3a2a22';
              if (Math.abs(t - H * 0.55) < 0.2 && py - y > R - 0.2 && Math.abs(px - x) < 0.2) return '#2a3a4a'; return (Math.floor(t / 1.4) % 2) ? '#d23a32' : '#f4f1ea'; }
            if (t < H + 0.25) return r < 1.3 ? '#2a2a30' : null; if (t < H + 0.55 && r < 1.3 && r > 1.2) return '#2a2a30';
            if (t < H + 1.4){ if (r > 0.75) return null; return (Math.abs(px - x) < 0.08 || Math.abs(py - y) < 0.08) ? '#2a2a30' : '#ffe27a'; }
            if (t < H + 2.1 && r < 0.85 * (1 - (t - H - 1.4) / 0.7)) return '#c4302a'; if (t < H + 2.4 && r < 0.07) return '#2a2a30'; return null; }); })();
        (function(){ var x = pierX, y0 = shoreY(x) + 0.6, y1 = E[1] + 0.6, zt = 0.55;   // the pier, on posts, out into the water
          B.solid(x - 1, y1, -0.6, x + 1, y0, zt + 0.9, function(px, py, pz){ var dx = px - x;
            if (Math.abs(dx) < 0.9 && pz > zt - 0.12 && pz < zt) return (Math.floor(py * 3) % 2) ? '#a87a4c' : '#956a40';
            if (Math.abs(Math.abs(dx) - 0.8) < 0.08 && ((py % 1.5 + 1.5) % 1.5) < 0.16 && pz < zt + 0.75) return '#6e4d2f';
            if (Math.abs(Math.abs(dx) - 0.8) < 0.07 && Math.abs(pz - zt - 0.65) < 0.06) return '#6e4d2f'; return null; }); })();
        (function(){ var y = bw.y, zt = 0.32;   // the boardwalk across the front, low, so it never hides the hole
          B.solid(bw.x0, y - 1.1, 0, bw.x1, y + 1.1, zt + 0.5, function(px, py, pz){ var dy = py - y; if (clearAt(px, py) < 0.6) return null;
            if (Math.abs(dy) < 1 && pz > zt - 0.1 && pz < zt) return (Math.floor(px * 3) % 2) ? '#b48552' : '#9f7243';
            if (Math.abs(dy - 0.95) < 0.07 && Math.abs(pz - zt - 0.35) < 0.06) return '#6e4d2f';
            if (Math.abs(dy - 0.95) < 0.07 && ((px % 2 + 2) % 2) < 0.14 && pz < zt + 0.4) return '#6e4d2f'; return null; }, B.ART); })();
        if (guard){ var gx = guard.x, gy = guard.y, gzz = B.gz(gx, gy);   // the lifeguard stand
          B.solid(gx - 1.1, gy - 1.1, gzz, gx + 1.1, gy + 1.1, gzz + 3.8, function(px, py, pz){ var dx = px - gx, dy = py - gy, t = pz - gzz;
            if (t < 1.6) return (Math.abs(Math.abs(dx) - 0.75) < 0.08 && Math.abs(Math.abs(dy) - 0.65) < 0.08) ? '#f4f1ea' : (Math.abs(dy - 0.7) < 0.1 && Math.abs(dx) < 0.25 && ((t * 4 | 0) % 2)) ? '#f4f1ea' : null;
            if (t < 1.75) return Math.abs(dx) < 0.95 && Math.abs(dy) < 0.85 ? '#f4f1ea' : null;
            if (t < 2.9){ if (Math.abs(dx) > 0.8 || Math.abs(dy) > 0.7) return null; if (Math.abs(dx) < 0.72 && Math.abs(dy) < 0.62) return null; return (dy > 0.6 && t > 2.1 && Math.abs(dx) < 0.5) ? '#2a3a4a' : '#d23a32'; }
            var rt = (t - 2.9) / 0.8; if (rt < 1 && Math.abs(dx) < 1.05 * (1 - rt * 0.7) && Math.abs(dy) < 0.95 * (1 - rt * 0.7)) return '#f4f1ea'; return null; }); }
        umbs.forEach(function(u, i){ var zb = B.gz(u.x, u.y), col = ['#d23a32', '#2e8fd6', '#f2a33a', '#3fb59a'][i % 4];
          B.solid(u.x - 1, u.y - 1, zb, u.x + 1, u.y + 1, zb + 1.9, function(px, py, pz){ var r = Math.hypot(px - u.x, py - u.y), t = pz - zb;
            if (r < 0.05 && t < 1.7) return '#e9e4d4'; if (t > 1.35 && t < 1.35 + 0.4 * (1 - r / 0.95) && r < 0.95) return (Math.floor((Math.atan2(py - u.y, px - u.x) + 3.15) / 0.52) % 2) ? col : '#f4f1ea'; return null; });
          B.solid(u.x - 0.35, u.y + 0.3, zb, u.x + 0.35, u.y + 1.5, zb + 0.06, function(){ return ['#f2c641', '#3fb59a', '#e8577a', '#f4f1ea'][i % 4]; }); });
        palms.forEach(function(p, i){ var zb = B.gz(p.x, p.y), H = 4.4 + hash(i, seed, 3) * 1.8, lean = (hash(i, seed, 4) - 0.5) * 1.2, top = [p.x + lean, p.y - 0.3, zb + H];
          B.vox(p.x - 3.2, p.y - 2.8, zb, p.x + 3.2, p.y + 2.6, zb + H + 0.8, function(set){
            for (var s = 0; s < 8; s++){ var t0 = s / 8, t1 = (s + 1) / 8; B.tube(set, p.x + lean * t0 * t0, p.y - 0.3 * t0, zb + H * t0, p.x + lean * t1 * t1, p.y - 0.3 * t1, zb + H * t1, 0.2 - t0 * 0.06, 0.2 - t1 * 0.06, s % 2 ? '#8a6a3e' : '#7a5c34'); }
            B.blob(set, top[0], top[1], top[2] - 0.1, 0.24, 0.24, 0.24, '#5a3d1e');
            for (var k = 0; k < 7; k++){ var a = k / 7 * 6.28 + i, fx = Math.cos(a), fy = Math.sin(a) * 0.7;
              for (var al = 0; al < 2.6; al += set.st){ var sag = 0.35 - al * al * 0.22, wd = 0.38 * (1 - al / 2.8);
                for (var o = -wd; o <= wd; o += set.st) set(top[0] + fx * al - fy * o, top[1] + fy * al + fx * o, top[2] + sag, al > 1.6 ? '#3f9a46' : '#2f8139'); } }
          }, B.ART); });
        B.solid(E[0] + 1, fenceY - 0.15, -0.5, E[2] - 1, fenceY + 0.15, 2.5, function(px, py, pz){ if (clearAt(px, py) < 0.8) return null; var zb = dune(px, fenceY), zt = 0.9;   // a slatted sand fence along the dunes
          if (pz < zb - 0.1 || pz > zb + zt) return null; if (Math.abs(py - fenceY) > 0.05) return null; var u = ((px % 0.35) + 0.35) % 0.35;
          if (u < 0.17 && pz < zb + zt - (Math.floor(px / 0.35) % 2) * 0.08) return (Math.abs(pz - zb - zt * 0.35) < 0.04 || Math.abs(pz - zb - zt * 0.75) < 0.04) ? '#5a4630' : '#9a7a52'; return null; });
        tufts.forEach(function(q){ var x = q[0], y = q[1], zb = B.gz(x, y);
          B.solid(x - 0.3, y - 0.2, zb, x + 0.3, y + 0.2, zb + 0.6, function(px, py, pz){ var t = (pz - zb) / 0.55, u = (px - x) / 0.3; for (var k = -2; k <= 2; k++){ if (Math.abs(u - k * 0.35 * t) < 0.12 && Math.abs(py - y) < 0.06) return t > 0.6 ? '#a8c25a' : '#7fa046'; } return null; }); });
      },
      fill:{ on:['sand'], trees:0.3, lows:0.3, tree:function(B, x, y, i){ var zb = B.gz(x, y), H = 3.8 + hash(i, seed, 21) * 1.6, lean = (hash(i, seed, 22) - 0.5) * 1.2, top = [x + lean, y - 0.3, zb + H];
          B.vox(x - 3.2, y - 2.8, zb, x + 3.2, y + 2.6, zb + H + 0.8, function(set){ for (var s = 0; s < 8; s++){ var t0 = s / 8, t1 = (s + 1) / 8; B.tube(set, x + lean * t0 * t0, y - 0.3 * t0, zb + H * t0, x + lean * t1 * t1, y - 0.3 * t1, zb + H * t1, 0.2 - t0 * 0.06, 0.2 - t1 * 0.06, s % 2 ? '#8a6a3e' : '#7a5c34'); }
            for (var k = 0; k < 7; k++){ var a = k / 7 * 6.28 + i, fx = Math.cos(a), fy = Math.sin(a) * 0.7; for (var al = 0; al < 2.4; al += set.st){ var sag = 0.35 - al * al * 0.22, wd = 0.36 * (1 - al / 2.6); for (var o = -wd; o <= wd; o += set.st) set(top[0] + fx * al - fy * o, top[1] + fy * al + fx * o, top[2] + sag, al > 1.5 ? '#3f9a46' : '#2f8139'); } } }, B.ART); },
        low:function(B, x, y, i){ var k = hash(i, seed, 23), zb = B.gz(x, y);
          if (k < 0.45) B.solid(x - 0.35, y - 0.25, zb, x + 0.35, y + 0.25, zb + 0.65, function(px, py, pz){ var t = (pz - zb) / 0.6, u = (px - x) / 0.3; for (var q = -2; q <= 2; q++){ if (Math.abs(u - q * 0.35 * t) < 0.12 && Math.abs(py - y) < 0.06) return t > 0.6 ? '#a8c25a' : '#7fa046'; } return null; });
          else if (k < 0.7) B.solid(x - 0.4, y - 0.4, zb - 0.05, x + 0.4, y + 0.4, zb + 0.25, function(px, py, pz){ var r = Math.hypot(px - x, py - y); return r < 0.32 && pz - zb < 0.18 * (1 - r / 0.32) + 0.04 ? ((Math.floor(Math.atan2(py - y, px - x) * 3) % 2) ? '#ffcdb2' : '#f4a582') : null; });
          else B.solid(x - 0.7, y - 0.6, zb - 0.05, x + 0.7, y + 0.6, zb + 0.9, function(px, py, pz){ var dx = px - x, dy = py - y, t = pz - zb; if (Math.abs(dx) > 0.6 || Math.abs(dy) > 0.5 || t > 0.85) return null; if (t > 0.55 && (Math.floor((dx + 1) * 3.5) % 2)) return null; return dx < -0.2 ? '#f7e3a8' : '#e2c27a'; }); } },
      bg:'#1e7fae', gain:3,
      mats:{ sand:['#ecd59b', '#f3e0b0', '#dcc386', 0.14], wet:['#c9ae74', '#d2b882', '#b99d64', 0.1], rock:['#7d756c', '#8e867b', '#6a635b', 0.3], foam:['#eef8f8', '#ffffff', '#d6eeee', 0.2],
        sea:['#2a9ac4', '#55c0dc', '#1e7fae', 0.05, function(c, R){ var d = c.dep || 0; return R(d < 1.2 ? '#55c0dc' : d < 3.5 ? '#2a9ac4' : '#1e7fae'); }] }
    };
  };

  /* ---------------- FROSTBITE PINES: a pine wood behind the hole, a cabin with the lights on, a frozen pond */
  BUILD.winter = function(L){
    var C = L.C, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot, spotRect = L.spotRect, north = L.north;
    var cabin = spotRect(7, 5, function(x, y){ return north(x, y) * 1.2 - Math.abs(x - L.cx) * 0.15; });
    var pond = spot(3.4, function(x, y){ return Math.abs(x - L.cx) * 0.5 - Math.abs(y - L.cy) * 0.2; });
    var paths = []; if (cabin) paths.push(L.route([cabin.x, cabin.y + cabin.d / 2 + 0.3], [C.tee[0], P1[1] + 1.4], seed, 1.2));
    if (cabin) L.used.push({ x:cabin.x, y:cabin.y + cabin.d / 2 + 1.8, r:2.6 });
    var dW = L.dist(paths[0]);
    function offPath(x, y){ return dW(x, y) > 1.6; }
    var pines = [];
    for (var i = 0; i < 44; i++){ var t = spot(0.9 + hash(i, seed, 4) * 0.7, function(x, y){ return north(x, y) * 0.6 + L.side(x) * 6 + Math.abs(x - L.cx) * 0.25 - (y > P1[1] - 1 ? 8 : 0); }, offPath); if (t) pines.push(t); }
    for (i = 0; i < 10; i++){ t = spot(0.6 + hash(i, seed, 6) * 0.3, function(x, y){ return (y - P0[1]) * 0.4 + Math.abs(x - L.cx) * 0.5; }, function(x, y){ return offPath(x, y) && y > P1[1] - 4; }); if (t) pines.push(t); }
    var bench = pond ? { x:pond.x, y:pond.y + pond.r * 0.72 + 1.1 } : null;
    var fence = []; if (paths.length){ var pp = paths[0]; for (i = 2; i < pp.length - 1; i++){ var a = pp[i], b = pp[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; fence.push([a[0] - dy / l * 1.1, a[1] + dx / l * 1.1]); } }
    function pondD(x, y){ return pond ? 1 - Math.hypot((x - pond.x) / pond.r, (y - pond.y) / (pond.r * 0.72)) + (fbm(x * 0.5, y * 0.5, seed + 9) - 0.5) * 0.35 : -1; }
    var snowman = cabin ? { x:cabin.x + (cabin.x < L.cx ? -2.2 : 2.2), y:cabin.y + cabin.d / 2 + 1.5 } : null;
    return {
      h:function(x, y){ var z = (fbm(x * 0.07, y * 0.09, seed) - 0.42) * 2.4 * sm(1.3, 6, clearAt(x, y)), p = pondD(x, y); if (p > 0) return -0.08; if (p > -0.2) z = Math.min(z, 0.1);
        if (dW(x, y) < 0.8) z -= 0.07; return z; },
      mat:function(x, y){ var p = pondD(x, y); if (p > 0) return ['ice', { dep:p }]; if (dW(x, y) < 0.8) return ['trod']; return ['snow']; },
      build:function(B){
        pines.forEach(function(t, i){ var zb = B.gz(t.x, t.y), H = t.r * 5.2 + 1, R = t.r * 1.3;
          B.solid(t.x - R, t.y - R, zb, t.x + R, t.y + R, zb + H + 0.2, function(x, y, z){ var r = Math.hypot(x - t.x, y - t.y), h = (z - zb) / H;
            if (h < 0.14) return r < 0.16 ? '#4a3626' : null; var tier = (h - 0.14) / 0.86 * 3, f = tier - Math.floor(tier), rad = R * (1 - (h - 0.14) / 0.86) * (0.65 + 0.45 * (1 - f)); if (r > rad) return null;
            var top = (f > 0.55 && r > rad - 0.22) || h > 0.93; return top ? '#f6f9fd' : ((Math.floor(z * 5) + i) % 3 ? '#1f4f3e' : '#2a6450'); }, B.ART); });
        if (cabin){ var w = cabin.w, d = cabin.d;
          house(B, cabin, { wh:2.5, rh:1.8, chim:'#8a8f99', step:'#8a8f99',
            wall:function(dx, dy, t){ if (dy > d / 2 - 0.15 && Math.abs(dx) < 0.5 && t < 1.8) return '#4a2c16';
              if (dy > d / 2 - 0.15 && Math.abs(Math.abs(dx) - 2) < 0.42 && t > 0.8 && t < 1.6) return (Math.abs(Math.abs(dx) - 2) < 0.05 || Math.abs(t - 1.2) < 0.05) ? '#4a2c16' : '#ffcf6a';
              return (Math.floor(t * 3.2) % 2) ? '#7a4e2c' : '#6a4226'; },
            roof:function(dx, dy, t, rr, eave){ return eave ? '#f6f9fd' : '#e4edf6'; } });
          var wx = cabin.x + (cabin.x < L.cx ? w / 2 + 0.45 : -w / 2 - 0.45), zw = B.gz(cabin.x, cabin.y);   // a woodpile against the side wall
          B.solid(wx - 0.35, cabin.y - 1, zw, wx + 0.35, cabin.y + 1, zw + 0.8, function(px, py, pz){ var t = pz - zw; if (t > 0.72) return '#f6f9fd'; var r = Math.hypot(((py - cabin.y) % 0.3 + 0.3) % 0.3 - 0.15, (t % 0.28) - 0.14); return r < 0.05 ? '#c99a62' : '#6a4226'; }); }
        railFence(B, fence, '#6a4226', '#7a4e2c', '#f6f9fd');
        if (bench){ var bx = bench.x, by = bench.y, bz = B.gz(bx, by);
          B.solid(bx - 1.1, by - 0.4, bz, bx + 1.1, by + 0.4, bz + 1, function(px, py, pz){ var dx = px - bx, dy = py - by, t = pz - bz; if (Math.abs(dx) > 1) return null;
            if (Math.abs(t - 0.45) < 0.06 && Math.abs(dy) < 0.25) return '#f6f9fd'; if (Math.abs(t - 0.39) < 0.05 && Math.abs(dy) < 0.25) return '#7a4e2c'; if (dy > 0.18 && dy < 0.28 && t > 0.5 && t < 0.9) return t > 0.83 ? '#f6f9fd' : '#7a4e2c';
            if (Math.abs(Math.abs(dx) - 0.85) < 0.06 && Math.abs(dy) < 0.22 && t < 0.4) return '#2a2a30'; return null; }); }
        if (snowman){ var sx = snowman.x, sy = snowman.y, sz = B.gz(sx, sy);
          B.solid(sx - 0.7, sy - 0.7, sz, sx + 0.7, sy + 0.7, sz + 2, function(px, py, pz){ var t = pz - sz, r = Math.hypot(px - sx, py - sy);
            if (Math.hypot(r, t - 0.5) < 0.55 || Math.hypot(r, t - 1.25) < 0.38) return (py - sy > 0.3 && Math.abs(px - sx) < 0.05 && t > 1 && t < 1.5) ? '#1a2a3a' : '#f6f9fd';
            if (Math.hypot(r, t - 1.8) < 0.27) return (py - sy > 0.22 && Math.abs(px - sx) < 0.05 && Math.abs(t - 1.78) < 0.05) ? '#f28a2a' : '#f6f9fd';
            if (Math.abs(t - 1.55) < 0.07 && r < 0.38) return '#d62f2f'; return null; }); }
      },
      fill:{ on:['snow'], trees:0.55, lows:0.28, tree:function(B, x, y, i){ pineAt(B, x, y, 0.8 + hash(i, seed, 24) * 0.6, i); },
        low:function(B, x, y, i){ var k = hash(i, seed, 25); if (k < 0.55) bush(B, x, y, 0.42, ['#f6f9fd', '#e4edf6', '#2a6450']); else if (k < 0.8) rockAt(B, x, y, 0.38, ['#e4edf6', '#8a8f99']); else pineAt(B, x, y, 0.35, i); } },
      gain:2.2,
      mats:{ snow:['#eef4fb', '#f8fbfe', '#dbe6f2', 0.16], trod:['#c7d4e3', '#d3deeb', '#b7c6d8', 0.25],
        ice:['#bfe3fa', '#e6f6fe', '#a6d3f0', 0.08, function(c, R){ return R((c.dep || 0) < 0.12 ? '#a6d3f0' : (((c.ti * 3 + c.tj * 7) % 23) === 0 ? '#e6f6fe' : '#bfe3fa')); }] }
    };
  };

  /* ---------------- HARVEST HILLS: a farm. A red barn and a silo behind the hole, a corn field, round bales, a farm track with a split rail fence */
  BUILD.harvest = function(L){
    var C = L.C, E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot, spotRect = L.spotRect, north = L.north;
    var barn = spotRect(8, 6, function(x, y){ return north(x, y) * 1.3 - Math.abs(x - L.cx) * 0.2; });
    var silo = barn ? { x:barn.x + (barn.x < L.cx ? 5.6 : -5.6), y:barn.y - 0.6, r:1.5 } : null;
    if (silo) L.used.push({ x:silo.x, y:silo.y, r:2 });
    var field = spotRect(7, 9, function(x, y){ return -Math.abs(y - L.cy) * 0.3 + Math.abs(x - L.cx) * 0.6; });
    var track = barn ? L.route([barn.x, barn.y + barn.d / 2 + 0.3], [C.tee[0], P1[1] + 1.5], seed + 2, 1.4) : wind([E[0] + 1, E[3] - 1], [C.tee[0], P1[1] + 1.5], seed, 1.4);
    if (barn) L.used.push({ x:barn.x, y:barn.y + barn.d / 2 + 1.6, r:2.2 });
    var dT = L.dist(track);
    function onTrack(x, y){ return dT(x, y) < 0.9; }
    var bales = []; for (var i = 0; i < 7; i++){ var b = spot(0.75, function(x, y){ return -Math.abs(clearAt(x, y) - 4) * 0.6 + hash(i, 3, seed) * 2; }, function(x, y){ return !onTrack(x, y) && !inR(x, y, field, 0.6); }); if (b) bales.push(b); }
    var trees = []; for (i = 0; i < 10; i++){ var t = spot(1.5, function(x, y){ return north(x, y) * 0.6 + L.side(x) * 4 + Math.min(L.far(x, y), 5) * 0.4; }, function(x, y){ return !onTrack(x, y) && !inR(x, y, field, 0.8); }); if (t) trees.push(t); }
    var fence = []; for (i = 1; i < track.length - 1; i++){ var a = track[i], c = track[i + 1], dx = c[0] - a[0], dy = c[1] - a[1], l = Math.hypot(dx, dy) || 1; fence.push([a[0] + dy / l * 1.3, a[1] - dx / l * 1.3]); }
    var pumpkins = L.scatter(2.2, function(x, y){ return !onTrack(x, y) && !inR(x, y, field, 0.4) && hash(x * 5 | 0, y * 5 | 0, seed + 31) < 0.16 && clearAt(x, y) < 6; }, 31);
    return {
      h:function(x, y){ var z = (fbm(x * 0.05, y * 0.06, seed) - 0.4) * 3.2 * sm(1.5, 8, clearAt(x, y));
        if (inR(x, y, field)) z = z * 0.4 + (((x - field.x) % 0.9 + 0.9) % 0.9 < 0.45 ? 0.1 : 0);
        if (onTrack(x, y)) z -= 0.06; return z; },
      mat:function(x, y){ if (onTrack(x, y)) return dT(x, y) < 0.35 ? ['crown'] : ['track']; if (inR(x, y, field)) return ['soil']; return ['stubble']; },
      build:function(B){
        if (barn){ var w = barn.w, d = barn.d;
          house(B, barn, { wh:2.8, rh:2.4, ov:0.3,
            wall:function(dx, dy, t){ var front = dy > d / 2 - 0.15;
              if (front && Math.abs(dx) < 1.3 && t < 2.2){ if (Math.abs(dx) > 1.15 || t > 2.05 || Math.abs(Math.abs(dx) - (t / 2.2) * 1.3) < 0.1 || Math.abs(Math.abs(dx) - (1 - t / 2.2) * 1.3) < 0.1) return '#f4ede0'; return '#8e2a20'; }
              if (front && Math.abs(dx) < 0.45 && Math.abs(t - 2.5) < 0.22) return '#f4ede0';
              if (Math.abs(Math.abs(dx) - w / 2 + 0.08) < 0.1 || t < 0.12) return '#f4ede0';
              return (Math.floor(dx * 2.5 + 20) % 2) ? '#b8362a' : '#a83024'; },
            roof:function(dx, dy, t, rr, eave){ return eave ? '#3a3a40' : ((Math.floor(dx * 1.5 + 20) % 2) ? '#5c5f66' : '#50535a'); } }); }
        if (silo){ var sx = silo.x, sy = silo.y, sz = B.gz(sx, sy), H = 7.5;
          B.solid(sx - 1.7, sy - 1.7, sz, sx + 1.7, sy + 1.7, sz + H + 1.7, function(px, py, pz){ var r = Math.hypot(px - sx, py - sy), t = pz - sz;
            if (t < H){ if (r > 1.5) return null; if (Math.abs(t % 1.2) < 0.08) return '#7d8590'; if (py - sy > 1.2 && Math.abs(px - sx) < 0.25 && t < H - 0.4 && (t % 0.5) < 0.1) return '#4a4f58'; return (Math.floor((Math.atan2(py - sy, px - sx) + 3.2) * 3) % 2) ? '#c9ced6' : '#b8bec8'; }
            var dt = t - H; return Math.hypot(r, dt) < 1.55 && dt < 1.55 ? (dt > 1.3 ? '#8e2a20' : '#d6dbe2') : null; }); }
        if (field){ var f = field;   // corn: rows of stalks with tassels and ears
          for (var row = f.x - f.w / 2 + 0.45; row < f.x + f.w / 2; row += 0.9)
            for (var cy2 = f.y - f.d / 2 + 0.4; cy2 < f.y + f.d / 2; cy2 += 0.7) (function(px, py, k){ if (hash(px * 9 | 0, py * 9 | 0, seed) < 0.12) return; var zb = B.gz(px, py), H2 = 1.9 + k * 0.7;
              B.vox(px - 0.6, py - 0.4, zb, px + 0.6, py + 0.4, zb + H2 + 0.4, function(set){
                B.tube(set, px, py, zb, px, py, zb + H2, 0.07, 0.04, '#6b8a2a');
                for (var lf = 0; lf < 3; lf++){ var a = hash(lf, k * 9 | 0, seed) * 6.28, lz = zb + 0.5 + lf * 0.45; B.tube(set, px, py, lz, px + Math.cos(a) * 0.55, py + Math.sin(a) * 0.3, lz + 0.25, 0.06, 0.03, lf % 2 ? '#8fae3a' : '#a7b84a'); }
                B.blob(set, px + 0.08, py + 0.06, zb + H2 * 0.55, 0.08, 0.08, 0.2, '#f2c94c');
                B.tube(set, px, py, zb + H2, px + 0.15, py, zb + H2 + 0.3, 0.05, 0.02, '#d9b45a');
              }); })(row + (hash(row * 3 | 0, cy2 * 3 | 0, seed) - 0.5) * 0.15, cy2, hash(row * 7 | 0, cy2 * 7 | 0, seed + 4)); }
        bales.forEach(function(bb, i){ var x = bb.x, y = bb.y, zb = B.gz(x, y), r = 0.62, along = hash(i, seed, 2) < 0.5;   // round bales lying on their sides
          B.solid(x - 0.9, y - 0.9, zb, x + 0.9, y + 0.9, zb + 1.3, function(px, py, pz){ var u = along ? px - x : py - y, v = along ? py - y : px - x, rr = Math.hypot(v, pz - zb - r);
            if (Math.abs(u) > 0.62 || rr > r) return null; if (Math.abs(u) > 0.56) return (Math.floor(rr * 9) % 2) ? '#c9a043' : '#e3bc5a'; return (Math.floor(u * 6 + 20) % 3) ? '#e1b94d' : '#d0a63e'; }); });
        trees.forEach(function(t, i){ var pal = [['#d9541e', '#f08a2c', '#b3361b'], ['#e8a33a', '#f2c94c', '#c97a1e'], ['#b3361b', '#d9541e', '#8a2a16']][i % 3];
          broadTree(B, t.x, t.y, 4.4 + hash(i, seed, 9) * 1.8, '#5a3d26', pal, i + seed); });
        railFence(B, fence, '#6e4d2f', '#8a6a42');
        pumpkins.forEach(function(q){ var px = q[0], py = q[1], zb = B.gz(px, py), s0 = 0.3;
          B.solid(px - 0.5, py - 0.4, zb, px + 0.5, py + 0.4, zb + 0.75, function(x, y, z){ var dx = (x - px) / (s0 * 1.2), dy = (y - py) / s0, dz = (z - zb - s0) / s0;
            if (dx * dx + dy * dy + dz * dz < 1) return (Math.floor((x - px) * 14) % 3 === 0) ? '#c95f12' : '#e8761f'; if (Math.hypot(x - px, y - py) < 0.05 && z < zb + s0 * 2 + 0.12) return '#4a6a1a'; return null; }); });
      },
      fill:{ on:['stubble'], trees:0.4, lows:0.3, tree:function(B, x, y, i){ broadTree(B, x, y, 4 + hash(i, seed, 26) * 1.6, '#5a3d26', [['#d9541e', '#f08a2c', '#b3361b'], ['#e8a33a', '#f2c94c', '#c97a1e'], ['#b3361b', '#d9541e', '#8a2a16']][i % 3], i + seed * 5); },
        low:function(B, x, y, i){ var k = hash(i, seed, 27), zb = B.gz(x, y);
          if (k < 0.4) B.solid(x - 0.9, y - 0.9, zb, x + 0.9, y + 0.9, zb + 1.3, function(px, py, pz){ var u = px - x, v = py - y, rr = Math.hypot(v, pz - zb - 0.6); if (Math.abs(u) > 0.6 || rr > 0.6) return null; if (Math.abs(u) > 0.54) return (Math.floor(rr * 9) % 2) ? '#c9a043' : '#e3bc5a'; return (Math.floor(u * 6 + 20) % 3) ? '#e1b94d' : '#d0a63e'; });
          else if (k < 0.7) bush(B, x, y, 0.4, ['#a67a2a', '#8a6a24', '#c9a043']);
          else B.solid(x - 0.5, y - 0.4, zb, x + 0.5, y + 0.4, zb + 0.75, function(px, py, pz){ var dx = (px - x) / 0.36, dy = (py - y) / 0.3, dz = (pz - zb - 0.3) / 0.3; if (dx * dx + dy * dy + dz * dz < 1) return (Math.floor((px - x) * 14) % 3 === 0) ? '#c95f12' : '#e8761f'; return Math.hypot(px - x, py - y) < 0.05 && pz < zb + 0.72 ? '#4a6a1a' : null; }); } },
      gain:1.8,
      mats:{ stubble:['#b8a050', '#c9b260', '#9c8a42', 0.22], soil:['#6a4a2a', '#7a5634', '#58391f', 0.25], track:['#9c7a4c', '#ab8858', '#8a6a40', 0.25], crown:['#8a9a3a', '#9cab48', '#7a8a32', 0.3] }
    };
  };

  /* ---------------- SWEETHEART GREENS: a formal garden. A white gazebo, a fountain, rose beds, a topiary heart, blossom trees, paved walks */
  BUILD.sweetheart = function(L){
    var C = L.C, E = L.E, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot, spotRect = L.spotRect, north = L.north;
    var gaz = spot(2.6, function(x, y){ return north(x, y) * 1.3 - Math.abs(x - L.cx) * 0.3; });
    var foun = spot(2.1, function(x, y){ return Math.abs(x - L.cx) * 0.6 - Math.abs(y - L.cy) * 0.4; });
    var heart = spot(1.6, function(x, y){ return Math.abs(x - L.cx) * 0.5 - Math.abs(y - L.cy - 6) * 0.4 + (foun && x * foun.x < 0 ? 2 : 0); });
    var walks = []; if (gaz) walks.push(L.route([gaz.x, gaz.y + 2.2], [C.tee[0], P1[1] + 1.4], seed + 1, 0.9));
    if (foun) walks.push(L.route([foun.x, foun.y], [C.tee[0], P1[1] + 1.4], seed + 5, 0.8));
    var dWk = walks.map(L.dist);
    function onWalk(x, y){ for (var i = 0; i < dWk.length; i++) if (dWk[i](x, y) < 0.55) return true; return false; }
    var beds = []; for (var i = 0; i < 6; i++){ var b = L.spotRect(2.8, 1.4, function(x, y){ return -Math.abs(clearAt(x, y) - 2.6) * 0.8 + hash(i, 5, seed) * 3; }); if (b && !onWalk(b.x, b.y)) beds.push(b); }
    var trees = []; for (i = 0; i < 9; i++){ var t = spot(1.5, function(x, y){ return north(x, y) * 0.7 + L.side(x) * 3 + Math.min(L.far(x, y), 5) * 0.4; }, function(x, y){ return !onWalk(x, y); }); if (t) trees.push(t); }
    var hedges = L.scatter(2.4, function(x, y){ return !onWalk(x, y) && clearAt(x, y) < 3.2 && clearAt(x, y) > 1.5 && hash(x * 3 | 0, y * 3 | 0, seed + 8) < 0.35; }, 8);
    return {
      h:function(x, y){ var z = (fbm(x * 0.06, y * 0.06, seed) - 0.45) * 1.2 * sm(1.5, 7, clearAt(x, y)); if (onWalk(x, y)) z = Math.min(z, 0) + 0.02; return z; },
      mat:function(x, y){ if (onWalk(x, y)) return ['pave']; for (var i = 0; i < beds.length; i++) if (inR(x, y, beds[i], 0.1)) return ['bed']; return ['lawn']; },
      build:function(B){
        if (gaz){ var gx = gaz.x, gy = gaz.y, gz0 = B.gz(gx, gy), R = 2.1, wh = 2.4;   // a white gazebo with a pink dome
          B.solid(gx - R - 0.4, gy - R - 0.4, gz0 - 0.1, gx + R + 0.4, gy + R + 0.4, gz0 + wh + 2.3, function(px, py, pz){ var dx = px - gx, dy = py - gy, r = Math.hypot(dx, dy), t = pz - gz0, a = Math.atan2(dy, dx);
            if (t < 0.3) return r < R + 0.25 ? (t > 0.2 ? '#f4eef2' : '#dccad3') : null;
            if (t < wh){ var col = Math.abs(((a / (Math.PI / 4)) % 1 + 1) % 1 - 0.5) > 0.42; if (col && Math.abs(r - R + 0.1) < 0.13) return '#ffffff'; if (Math.abs(r - R + 0.1) < 0.1 && (Math.abs(t - 0.75) < 0.05 || t > wh - 0.2)) return '#ffffff'; return null; }
            var dt = t - wh; if (dt < 0.2) return r < R + 0.3 ? '#ffffff' : null; var rr = (dt - 0.2) / 1.7; if (rr > 1) return r < 0.08 && dt < 2.15 ? '#ffd23f' : null;
            return r < (R + 0.3) * Math.sqrt(1 - rr * rr) ? ((Math.floor(a * 2.55 + 9) % 2) ? '#ff8ab0' : '#ff6f9f') : null; }); }
        if (foun){ var fx = foun.x, fy = foun.y, fz = B.gz(fx, fy);   // a tiered fountain of pink lemonade
          B.solid(fx - 2, fy - 2, fz - 0.1, fx + 2, fy + 2, fz + 2.4, function(px, py, pz){ var r = Math.hypot(px - fx, py - fy), t = pz - fz;
            if (t < 0.5 && r < 1.85){ if (r > 1.6) return '#f4eef2'; return t > 0.36 ? ((Math.floor(px * 4) + Math.floor(py * 4)) % 5 ? '#ffb3cc' : '#ffd6e4') : '#e9d6de'; }
            if (r < 0.22 && t < 1.5) return '#f4eef2'; if (Math.abs(t - 1.35) < 0.12 && r < 0.85) return r > 0.7 || t < 1.32 ? '#f4eef2' : '#ffb3cc';
            if (r < 0.12 && t < 2.1) return '#f4eef2'; if (Math.hypot(r, t - 2.15) < 0.16) return '#ff6f9f'; return null; }); }
        if (heart){ var hx = heart.x, hy = heart.y, hz = B.gz(hx, hy);   // a clipped yew heart on a stem
          B.solid(hx - 1.4, hy - 0.6, hz, hx + 1.4, hy + 0.6, hz + 3.1, function(px, py, pz){ var t = pz - hz; if (t < 0.9) return Math.hypot(px - hx, py - hy) < 0.12 ? '#5a3d26' : null;
            if (Math.abs(py - hy) > 0.45) return null; var u = (px - hx) / 1.15, v = (t - 2.05) / 1.1, k = u * u + v * v - 1; if (k * k * k - u * u * v * v * v > 0) return null;
            return (Math.floor(px * 4) + Math.floor(pz * 4)) % 4 ? '#2f7a3a' : '#3a8f45'; }); }
        beds.forEach(function(bd, i){ var zb = B.gz(bd.x, bd.y);   // rose beds, edged in white, red and pink roses
          B.vox(bd.x - bd.w / 2 - 0.1, bd.y - bd.d / 2 - 0.1, zb, bd.x + bd.w / 2 + 0.1, bd.y + bd.d / 2 + 0.1, zb + 0.9, function(set){
            for (var x = bd.x - bd.w / 2 + 0.35; x < bd.x + bd.w / 2; x += 0.55) for (var y = bd.y - bd.d / 2 + 0.35; y < bd.y + bd.d / 2; y += 0.5){
              B.blob(set, x, y, zb + 0.35, 0.3, 0.27, 0.3, function(px, py, pz){ var q = hash(px * 11 | 0, pz * 11 | 0, i + seed); return q < 0.3 ? (i % 2 ? '#e91e63' : '#d62f2f') : q < 0.4 ? '#ffb3cc' : '#3f7a3a'; }); }
            for (var ex = bd.x - bd.w / 2; ex <= bd.x + bd.w / 2; ex += set.st){ set(ex, bd.y - bd.d / 2, zb + 0.1, '#f4eef2'); set(ex, bd.y + bd.d / 2, zb + 0.1, '#f4eef2'); } }); });
        trees.forEach(function(t, i){ broadTree(B, t.x, t.y, 3.8 + hash(i, seed, 7) * 1.4, '#6a4a3a', ['#ffb7d0', '#ffd6e4', '#f48fb1'], i + seed * 3); });
        hedges.forEach(function(q, i){ var x = q[0], y = q[1], zb = B.gz(x, y);   // little round box hedges
          B.solid(x - 0.5, y - 0.5, zb, x + 0.5, y + 0.5, zb + 0.9, function(px, py, pz){ return Math.hypot(px - x, py - y, (pz - zb - 0.42) * 1.1) < 0.45 ? ((Math.floor(px * 6) + Math.floor(pz * 6)) % 3 ? '#2f7a3a' : '#3a8f45') : null; }); });
      },
      fill:{ on:['lawn'], trees:0.42, lows:0.32, tree:function(B, x, y, i){ broadTree(B, x, y, 3.4 + hash(i, seed, 28) * 1.4, '#6a4a3a', ['#ffb7d0', '#ffd6e4', '#f48fb1'], i + seed * 9); },
        low:function(B, x, y, i){ var k = hash(i, seed, 29); if (k < 0.5) bush(B, x, y, 0.42, ['#2f7a3a', '#3a8f45', '#2f7a3a']);
          else bush(B, x, y, 0.38, ['#3f7a3a', i % 2 ? '#e91e63' : '#d62f2f', '#3f7a3a', '#ffb3cc']); } },
      gain:1.4,
      mats:{ lawn:['#8fcf7a', '#9ed98a', '#ffc2d6', 0.1], pave:['#eadde3', '#f4eef2', '#d9c6cf', 0.35], bed:['#6a4a3a', '#7a5644', '#58392d', 0.2] }
    };
  };

  /* ---------------- SHAMROCK GLEN: green hills, dry stone walls, a thatched cottage, a round tower, sheep, and a rainbow ending in a pot of gold */
  BUILD.shamrock = function(L){
    var C = L.C, E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot, spotRect = L.spotRect, north = L.north;
    var cot = spotRect(7, 4.4, function(x, y){ return north(x, y) * 1.2 - Math.abs(x - L.cx - 4) * 0.3; });
    var tower = spot(1.3, function(x, y){ return north(x, y) * 1.4 + Math.abs(x - L.cx) * 0.25 + (cot ? Math.min(6, Math.abs(x - cot.x)) * 0.6 : 0); });
    var pot = spot(1.0, function(x, y){ return north(x, y) * 0.6 + Math.min(4, Math.abs(x - L.cx) - 4) - (tower ? Math.max(0, 7 - Math.hypot(x - tower.x, y - tower.y)) : 0); },
      function(x, y){ return y < P0[1] - 1.2 && x - 6.2 * (x < L.cx ? -1 : 1) > E[0] - 1 && x - 6.2 * (x < L.cx ? -1 : 1) < E[2] + 1; });
    var lane = cot ? L.route([cot.x, cot.y + cot.d / 2 + 0.3], [C.tee[0], P1[1] + 1.4], seed + 4, 1.3) : null;
    if (cot) L.used.push({ x:cot.x, y:cot.y + cot.d / 2 + 1.4, r:2 });
    var dL = L.dist(lane);
    function onLane(x, y){ return dL(x, y) < 0.7; }
    // dry stone walls running across the fields, with a gap where the lane crosses
    var walls = []; for (var i = 0; i < 3; i++){ var wy = E[1] + 4 + i * ((E[3] - E[1] - 8) / 2.5); walls.push(wind([E[0] + 0.5, wy], [E[2] - 0.5, wy + (hash(i, seed, 2) - 0.5) * 4], seed + i * 7, 1.6)); }
    var sheep = []; for (i = 0; i < 8; i++){ var s = spot(0.7, function(x, y){ return -Math.abs(clearAt(x, y) - 5) * 0.4 + hash(i, 9, seed) * 3; }, function(x, y){ return !onLane(x, y); }); if (s) sheep.push(s); }
    var heather = spot(2.4, function(x, y){ return Math.abs(x - L.cx) * 0.4 - Math.abs(y - L.cy + 4) * 0.2; });
    function heatherD(x, y){ return heather ? 1 - Math.hypot((x - heather.x) / heather.r, (y - heather.y) / (heather.r * 0.8)) + (fbm(x * 0.7, y * 0.7, seed + 3) - 0.5) * 0.6 : -1; }
    return {
      h:function(x, y){ var z = (fbm(x * 0.05, y * 0.05, seed) - 0.38) * 4.2 * sm(1.5, 9, clearAt(x, y)); if (onLane(x, y)) z -= 0.06; return z; },
      mat:function(x, y){ if (onLane(x, y)) return ['lane']; if (heatherD(x, y) > 0) return ['heath']; return ['grass']; },
      build:function(B){
        if (cot){ var d = cot.d;
          house(B, cot, { wh:1.9, rh:1.7, ov:0.45, chim:'#9a948a',
            wall:function(dx, dy, t){ if (dy > d / 2 - 0.15 && Math.abs(dx) < 0.45 && t < 1.55) return '#c62828';
              if (dy > d / 2 - 0.15 && Math.abs(Math.abs(dx) - 1.8) < 0.36 && t > 0.75 && t < 1.4) return (Math.abs(t - 1.07) < 0.05 || Math.abs(Math.abs(dx) - 1.8) < 0.05) ? '#f4f1ea' : '#2a3a4a';
              return t < 0.18 ? '#9a948a' : '#f4f1ea'; },
            roof:function(dx, dy, t, rr, eave){ return eave ? '#9c7a3a' : ((Math.floor(t * 6 + dx * 0.4) % 2) ? '#c9a14e' : '#b38d40'); } }); }
        if (tower){ var tx = tower.x, ty = tower.y, tz = B.gz(tx, ty), H = 10;   // an old round tower with a stone cap
          B.solid(tx - 1.4, ty - 1.4, tz, tx + 1.4, ty + 1.4, tz + H + 2.4, function(px, py, pz){ var r = Math.hypot(px - tx, py - ty), t = pz - tz;
            if (t < H){ var R = 1.25 - t / H * 0.2; if (r > R) return null; if (py - ty > R - 0.25 && Math.abs(px - tx) < 0.18 && Math.abs(t - H * 0.85) < 0.3) return '#2a2a30';
              if (py - ty > R - 0.25 && Math.abs(px - tx) < 0.2 && Math.abs(t - 3.2) < 0.45) return '#3a2a22';
              return ((Math.floor(t * 2.4) + Math.floor(Math.atan2(py - ty, px - tx) * 3)) % 3) ? '#8e8a80' : '#7a766c'; }
            var rr = (t - H) / 2.3; return rr < 1 && r < 1.1 * (1 - rr) ? '#6c6860' : null; }); }
        walls.forEach(function(wp, wi){ for (var i = 0; i < wp.length - 1; i++){ var a = wp[i], b = wp[i + 1];
          (function(a, b){ var zb = Math.min(B.gz(a[0], a[1]), B.gz(b[0], b[1])) - 0.2;
            B.solid(Math.min(a[0], b[0]) - 0.4, Math.min(a[1], b[1]) - 0.4, zb, Math.max(a[0], b[0]) + 0.4, Math.max(a[1], b[1]) + 0.4, zb + 1.5, function(px, py, pz){
              if (B.clearAt(px, py) < 0.9 || onLane(px, py)) return null; var sd = segD(px, py, a[0], a[1], b[0], b[1]), top = B.gz(px, py) + 0.75 + (hash(px * 4 | 0, wi, seed) - 0.5) * 0.12;
              if (sd > 0.32 - (pz - zb) * 0.06 || pz > top) return null; var q = hash(px * 5 | 0, pz * 5 | 0, seed + 2); return q < 0.3 ? '#a9a49a' : q < 0.6 ? '#8e8a80' : '#7a766c'; }); })(a, b); } });
        sheep.forEach(function(s, i){ var x = s.x, y = s.y, zb = B.gz(x, y), dir = hash(i, seed, 4) < 0.5 ? -1 : 1;
          B.solid(x - 0.8, y - 0.5, zb, x + 0.8, y + 0.5, zb + 1, function(px, py, pz){ var dx = (px - x) * dir, t = pz - zb;
            if (t < 0.32) return (Math.abs(Math.abs(dx) - 0.28) < 0.06 && Math.abs(Math.abs(py - y) - 0.14) < 0.06) ? '#2a2a30' : null;
            if (Math.hypot((dx - 0.45) / 0.2, (py - y) / 0.15, (t - 0.68) / 0.17) < 1) return '#2a2a30';
            if (Math.hypot(dx / 0.48, (py - y) / 0.32, (t - 0.55) / 0.27) < 1) return hash(px * 13 | 0, pz * 13 | 0, i) < 0.3 ? '#e9e6dc' : '#f7f5ee'; return null; }); });
        if (pot){ var ox = pot.x, oy = pot.y, oz = B.gz(ox, oy);   // the pot, and the rainbow that ends in it
          B.solid(ox - 0.7, oy - 0.7, oz, ox + 0.7, oy + 0.7, oz + 1.1, function(px, py, pz){ var r = Math.hypot(px - ox, py - oy), t = pz - oz;
            if (t > 0.65 && r < 0.6 && t < 0.65 + (0.6 - r) * 0.6) return (hash(px * 15 | 0, py * 15 | 0, 3) < 0.5) ? '#ffd968' : '#e2b23b';
            if (t < 0.7 && r < 0.55 - Math.abs(t - 0.38) * 0.4) return t > 0.6 ? '#3a3a3a' : '#1c1c1c'; return null; });
          var RB = ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa'], arcR = 5.2, ay = oy - 0.4, ax = ox + (ox < L.cx ? arcR - 0.2 : -arcR + 0.2);
          B.vox(ax - arcR - 1, ay - 0.3, oz - 0.2, ax + arcR + 1, ay + 0.3, oz + arcR + 1, function(set){
            for (var a = 0; a <= Math.PI; a += 0.01) for (var k = 0; k < 6; k++){ var rr = arcR + 0.55 - k * 0.2; set(ax + Math.cos(a) * rr, ay, oz + Math.sin(a) * rr, RB[k]); set(ax + Math.cos(a) * rr, ay + set.st, oz + Math.sin(a) * rr, RB[k]); } }, B.ART); }
      },
      fill:{ on:['grass', 'heath'], trees:0.22, lows:0.3, tree:function(B, x, y, i){ broadTree(B, x, y, 3.6 + hash(i, seed, 30) * 1.4, '#4a3a2a', ['#2f6a2a', '#3f7a32', '#255a22'], i + seed * 11); },
        low:function(B, x, y, i){ var k = hash(i, seed, 31); if (k < 0.4) rockAt(B, x, y, 0.45, ['#8e8a80', '#a9a49a']); else if (k < 0.75) bush(B, x, y, 0.42, ['#3f7a32', '#e8c23a', '#3f7a32']);
          else { var zb = B.gz(x, y); B.solid(x - 0.8, y - 0.5, zb, x + 0.8, y + 0.5, zb + 1, function(px, py, pz){ var dx = px - x, t = pz - zb; if (t < 0.32) return (Math.abs(Math.abs(dx) - 0.28) < 0.06 && Math.abs(Math.abs(py - y) - 0.14) < 0.06) ? '#2a2a30' : null;
            if (Math.hypot((dx - 0.45) / 0.2, (py - y) / 0.15, (t - 0.68) / 0.17) < 1) return '#2a2a30'; if (Math.hypot(dx / 0.48, (py - y) / 0.32, (t - 0.55) / 0.27) < 1) return '#f7f5ee'; return null; }); } } },
      gain:1.6,
      mats:{ grass:['#4f9a3c', '#5aab45', '#3f8a32', 0.2], heath:['#7a5a8a', '#8e6a9e', '#4f8a3c', 0.35], lane:['#8a7a5a', '#9a8a68', '#7a6a4a', 0.3] }
    };
  };

  /* ---------------- BLOOM GARDENS: tulip fields in stripes, a greenhouse, blossom trees, a lily pond with stepping stones, a picket fence */
  BUILD.spring = function(L){
    var C = L.C, E = L.E, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot, spotRect = L.spotRect, north = L.north;
    var gh = spotRect(7, 4.6, function(x, y){ return north(x, y) * 1.2 - Math.abs(x - L.cx) * 0.2; });
    var pond = spot(2.8, function(x, y){ return Math.abs(x - L.cx) * 0.5 - Math.abs(y - L.cy) * 0.3; });
    var tul = spotRect(7, 8, function(x, y){ return Math.abs(x - L.cx) * 0.6 - Math.abs(y - L.cy - 4) * 0.3 + (pond && x * pond.x < 0 ? 2 : 0); });
    var path = gh ? L.route([gh.x, gh.y + gh.d / 2 + 0.3], [C.tee[0], P1[1] + 1.4], seed + 6, 1.1) : null;
    if (gh) L.used.push({ x:gh.x, y:gh.y + gh.d / 2 + 1.4, r:2 });
    var dPa = L.dist(path);
    function onPath(x, y){ return dPa(x, y) < 0.7; }
    var trees = []; for (var i = 0; i < 9; i++){ var t = spot(1.5, function(x, y){ return north(x, y) * 0.7 + L.side(x) * 3 + Math.min(L.far(x, y), 5) * 0.4; }, function(x, y){ return !onPath(x, y) && !inR(x, y, tul, 0.6); }); if (t) trees.push(t); }
    var bath = spot(0.6, function(x, y){ return -Math.abs(clearAt(x, y) - 2.5) + hash(3, 3, seed); }, function(x, y){ return !onPath(x, y); });
    var fence = path ? path.slice(2, -1).map(function(p, i, a){ var q = a[i + 1] || p, dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1; return [p[0] - dy / l * 1.1, p[1] + dx / l * 1.1]; }) : [];
    function pondD(x, y){ return pond ? 1 - Math.hypot((x - pond.x) / pond.r, (y - pond.y) / (pond.r * 0.7)) + (fbm(x * 0.6, y * 0.6, seed + 9) - 0.5) * 0.3 : -1; }
    var TUL = ['#e53935', '#ffd23f', '#f48fb1', '#ab47bc', '#ff8a3c', '#ffffff'];
    return {
      h:function(x, y){ var z = (fbm(x * 0.06, y * 0.06, seed) - 0.42) * 1.8 * sm(1.5, 7, clearAt(x, y)), p = pondD(x, y); if (p > 0) return -0.15; if (p > -0.15) z = Math.min(z, 0.05);
        if (inR(x, y, tul)) z = z * 0.3 + 0.05; if (onPath(x, y)) z -= 0.04; return z; },
      mat:function(x, y){ var p = pondD(x, y); if (p > 0) return ['pond', { dep:p }]; if (onPath(x, y)) return ['path']; if (inR(x, y, tul)) return ['soil']; return ['grass']; },
      build:function(B){
        if (gh){ var gx = gh.x, gy = gh.y, gz0 = B.gz(gx, gy), w = gh.w, d = gh.d, wh = 2, rh = 1.5;   // a glass house: white frame, pale glass, plants inside
          B.solid(gx - w / 2 - 0.1, gy - d / 2 - 0.1, gz0 - 0.1, gx + w / 2 + 0.1, gy + d / 2 + 0.2, gz0 + wh + rh + 0.2, function(px, py, pz){ var dx = px - gx, dy = py - gy, t = pz - gz0;
            var frameX = Math.abs(((dx + w / 2) % 1 + 1) % 1) < 0.1, inside = Math.abs(dx) < w / 2 && Math.abs(dy) < d / 2;
            if (inside && t < wh){ if (t < 0.25) return '#e8e4dc'; if (frameX || Math.abs(t - wh + 0.05) < 0.08 || Math.abs(t - 0.95) < 0.06) return '#ffffff';
              if (Math.abs(Math.abs(dy) - d / 2) < 0.12 || Math.abs(Math.abs(dx) - w / 2) < 0.12) return t < 1 && hash(px * 5 | 0, pz * 5 | 0, 4) < 0.35 ? '#5aa04a' : '#cdeef0'; return null; }
            if (t >= wh && Math.abs(dx) < w / 2){ var rr = (t - wh) / rh; if (rr < 1 && Math.abs(dy) < (d / 2) * (1 - rr) + 0.12 && Math.abs(dy) > (d / 2) * (1 - rr) - 0.12) return frameX || rr > 0.92 ? '#ffffff' : '#bfe6ec'; }
            return null; }); }
        if (tul){ for (var x = tul.x - tul.w / 2 + 0.3; x < tul.x + tul.w / 2; x += 0.42) for (var y = tul.y - tul.d / 2 + 0.3; y < tul.y + tul.d / 2; y += 0.42){   // stripes of tulips, a colour a row
          (function(px, py, col){ var zb = B.gz(px, py); B.solid(px - 0.2, py - 0.2, zb, px + 0.2, py + 0.2, zb + 0.8, function(qx, qy, qz){ var t = qz - zb, r = Math.hypot(qx - px, qy - py);
            if (t < 0.5) return r < 0.05 ? '#3f8a3a' : (t < 0.2 && r < 0.16 && Math.abs(qx - px) < 0.05) ? '#4fa34a' : null; return r < 0.15 - Math.max(0, t - 0.7) * 0.6 ? col : null; }); })(x, y, TUL[Math.floor((y - tul.y + tul.d / 2) / 1.26) % TUL.length]); } }
        if (pond){ var pz = B.gz(pond.x, pond.y);   // lily pads, and stepping stones across
          for (var i = 0; i < 9; i++){ var a = hash(i, seed, 1) * 6.28, rr = pond.r * (0.2 + hash(i, seed, 2) * 0.55); (function(lx, ly, fl){
            B.solid(lx - 0.4, ly - 0.4, -0.2, lx + 0.4, ly + 0.4, 0.1, function(qx, qy, qz){ var r = Math.hypot(qx - lx, qy - ly); if (qz < -0.13 || qz > -0.06) return fl && r < 0.1 && qz > -0.1 ? '#ffd0df' : null;
              return r < 0.32 && !(Math.atan2(qy - ly, qx - lx) > 0 && Math.atan2(qy - ly, qx - lx) < 0.5) ? (r < 0.11 && fl ? '#ffb7d0' : '#3f9a46') : null; }); })(pond.x + Math.cos(a) * rr, pond.y + Math.sin(a) * rr * 0.7, i % 3 === 0); } }
        trees.forEach(function(t, i){ broadTree(B, t.x, t.y, 3.6 + hash(i, seed, 7) * 1.6, '#5a3d2e', i % 2 ? ['#ffb7d0', '#ffd6e4', '#f48fb1'] : ['#ffffff', '#ffe0ec', '#ffd0df'], i + seed); });
        if (fence.length) railFence(B, fence, '#ffffff', '#f4f1ea');
        if (bath){ var bx = bath.x, by = bath.y, bz = B.gz(bx, by);   // a stone bird bath
          B.solid(bx - 0.6, by - 0.6, bz, bx + 0.6, by + 0.6, bz + 1.3, function(px, py, qz){ var r = Math.hypot(px - bx, py - by), t = qz - bz;
            if (t < 0.15) return r < 0.4 ? '#bdb8ae' : null; if (t < 0.9) return r < 0.13 ? '#cfcac0' : null; if (t < 1.1) return r < 0.55 ? (t > 1.02 && r < 0.45 ? '#7fc8f0' : '#cfcac0') : null; return null; }); }
      },
      fill:{ on:['grass'], trees:0.4, lows:0.34, tree:function(B, x, y, i){ broadTree(B, x, y, 3.4 + hash(i, seed, 32) * 1.4, '#5a3d2e', i % 2 ? ['#ffb7d0', '#ffd6e4', '#f48fb1'] : ['#ffffff', '#ffe0ec', '#ffd0df'], i + seed * 13); },
        low:function(B, x, y, i){ var cols = [['#5aa04a', '#e53935', '#5aa04a', '#ffd23f'], ['#5aa04a', '#ab47bc', '#5aa04a', '#ffffff'], ['#5aa04a', '#ff8a3c', '#5aa04a', '#f48fb1']][i % 3]; bush(B, x, y, 0.4, cols); } },
      gain:1.6,
      mats:{ grass:['#7cc66a', '#8ad377', '#6ab35a', 0.18], soil:['#7a5638', '#8a6444', '#6a4a2e', 0.2], path:['#d9cbb0', '#e6dac2', '#c9b998', 0.3],
        pond:['#5fbfff', '#a8e0ff', '#3f9fdf', 0.05, function(c, R){ var d = c.dep || 0; return R(d < 0.12 ? '#3f9fdf' : (((c.ti * 5 + c.tj * 3) % 19) === 0 ? '#a8e0ff' : '#5fbfff')); }] }
    };
  };

  /* ---------------- FIRECRACKER FAIRWAYS: a summer night at the fair. A lit Ferris wheel, a bandstand in bunting, a lake with a dock, picnic tables, string lights */
  BUILD.firework = function(L){
    var C = L.C, E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot, spotRect = L.spotRect, north = L.north;
    var wheel = spotRect(9, 3, function(x, y){ return north(x, y) * 1.4 - Math.abs(x - L.cx - 3) * 0.3; });
    var band = spot(2.3, function(x, y){ return north(x, y) * 0.8 + Math.abs(x - L.cx) * 0.4 + (wheel && x * wheel.x < 0 ? 2 : 0); });
    var lakeX = hash(seed, 7, 1) < 0.5 ? E[0] + 4.5 : E[2] - 4.5;
    function lakeD(x, y){ return 1 - Math.hypot((x - lakeX) / 4.2, (y - L.cy) / 7) + (fbm(x * 0.4, y * 0.4, seed + 9) - 0.5) * 0.4 - Math.max(0, 1.2 - clearAt(x, y)) * 2; }
    L.used.push({ x:lakeX, y:L.cy, r:3.6 });
    var walk = band ? L.route([band.x, band.y + 2.2], [C.tee[0], P1[1] + 1.4], seed + 3, 1.2) : null;
    if (band) L.used.push({ x:band.x, y:band.y + 2.8, r:1.6 });
    var dWa = L.dist(walk);
    function onWalk(x, y){ return dWa(x, y) < 0.7; }
    var tables = []; for (var i = 0; i < 4; i++){ var t = spot(1.2, function(x, y){ return -Math.abs(clearAt(x, y) - 3) + hash(i, 6, seed) * 3; }, function(x, y){ return !onWalk(x, y) && lakeD(x, y) < -0.3; }); if (t) tables.push(t); }
    var posts = walk ? walk.filter(function(p, k){ return k % 2 === 1; }).map(function(p, k){ return [p[0] + (k % 2 ? 1.1 : -1.1), p[1]]; }).filter(function(p){ return clearAt(p[0], p[1]) > 0.9; }) : [];
    var trees = []; for (i = 0; i < 8; i++){ t = spot(1.4, function(x, y){ return north(x, y) * 0.6 + L.side(x) * 3; }, function(x, y){ return !onWalk(x, y) && lakeD(x, y) < -0.4; }); if (t) trees.push(t); }
    return {
      h:function(x, y){ var z = (fbm(x * 0.06, y * 0.06, seed) - 0.42) * 1.6 * sm(1.5, 7, clearAt(x, y)), k = lakeD(x, y); if (k > 0) return -0.2; if (k > -0.2) z = Math.min(z, 0); if (onWalk(x, y)) z -= 0.04; return z; },
      mat:function(x, y){ var k = lakeD(x, y); if (k > 0) return ['lake', { dep:k }]; if (k > -0.12) return ['bank']; if (onWalk(x, y)) return ['walk']; return ['grass']; },
      build:function(B){
        if (wheel){ var wx = wheel.x, wy = wheel.y, wz = B.gz(wx, wy), R = 5, hz = wz + R + 1.1;   // the Ferris wheel, its rim lit
          B.vox(wx - R - 1.2, wy - 1.4, wz - 0.1, wx + R + 1.2, wy + 1.4, hz + R + 1, function(set){
            B.tube(set, wx - 1.6, wy + 0.9, wz, wx, wy + 0.4, hz, 0.12, 0.1, '#c9ced6'); B.tube(set, wx + 1.6, wy + 0.9, wz, wx, wy + 0.4, hz, 0.12, 0.1, '#c9ced6');
            B.tube(set, wx - 1.6, wy - 0.9, wz, wx, wy - 0.4, hz, 0.12, 0.1, '#c9ced6'); B.tube(set, wx + 1.6, wy - 0.9, wz, wx, wy - 0.4, hz, 0.12, 0.1, '#c9ced6');
            for (var a = 0; a < 6.283; a += 0.012){ var cx2 = wx + Math.cos(a) * R, cz2 = hz + Math.sin(a) * R, lit = (Math.floor(a / 0.0873) % 2) === 0;
              set(cx2, wy - 0.3, cz2, lit ? '#ffe27a' : '#e53935'); set(cx2, wy + 0.3, cz2, lit ? '#ffe27a' : '#e53935'); }
            for (var s = 0; s < 12; s++){ var sa = s / 12 * 6.283; B.tube(set, wx, wy, hz, wx + Math.cos(sa) * R, wy, hz + Math.sin(sa) * R, 0.05, 0.05, '#f4f1ea');
              var gx2 = wx + Math.cos(sa) * R, gz2 = hz + Math.sin(sa) * R - 0.55; B.blob(set, gx2, wy, gz2, 0.38, 0.32, 0.32, ['#e53935', '#1e88e5', '#ffd23f', '#f4f1ea'][s % 4]); }
            B.blob(set, wx, wy, hz, 0.35, 0.5, 0.35, '#ffe27a');
          }, B.ART); }
        if (band){ var bx = band.x, by = band.y, bz = B.gz(bx, by), R2 = 2.1, wh = 2.2;   // a bandstand dressed in bunting
          B.solid(bx - R2 - 0.5, by - R2 - 0.5, bz - 0.1, bx + R2 + 0.5, by + R2 + 0.5, bz + wh + 2.2, function(px, py, pz){ var dx = px - bx, dy = py - by, r = Math.hypot(dx, dy), t = pz - bz, a = Math.atan2(dy, dx);
            if (t < 0.55) return r < R2 + 0.2 ? (t > 0.45 ? '#c9b48a' : '#f4f1ea') : null;
            if (t < wh){ if (Math.abs(((a / (Math.PI / 4)) % 1 + 1) % 1 - 0.5) > 0.42 && Math.abs(r - R2 + 0.1) < 0.13) return '#ffffff';
              var sag = wh - 0.3 - Math.abs(((a / (Math.PI / 4)) % 1 + 1) % 1 - 0.5) * 0.5; if (Math.abs(r - R2) < 0.12 && Math.abs(t - sag) < 0.12) return ['#e53935', '#ffffff', '#1e88e5'][Math.floor(a * 6 + 20) % 3]; return null; }
            var rr = (t - wh) / 1.8; if (rr < 1 && r < (R2 + 0.35) * (1 - rr)) return (Math.floor(a * 2.55 + 9) % 2) ? '#e53935' : '#ffffff'; if (rr >= 1 && r < 0.06 && t < wh + 2.15) return '#1e88e5'; return null; }); }
        // the dock out into the lake
        (function(){ var dx0 = lakeX + (lakeX < L.cx ? 1.2 : -1.2), y0 = L.cy + 3.4, zt = 0.3; B.solid(dx0 - 0.7, y0 - 4.2, -0.6, dx0 + 0.7, y0, zt + 0.1, function(px, py, pz){ if (pz > zt - 0.1 && pz < zt) return (Math.floor(py * 3) % 2) ? '#8a6a44' : '#7a5c38';
          if (Math.abs(Math.abs(px - dx0) - 0.6) < 0.08 && ((py % 1.4 + 1.4) % 1.4) < 0.16) return '#4a3626'; return null; }); })();
        tables.forEach(function(tb, i){ var x = tb.x, y = tb.y, zb = B.gz(x, y);   // picnic tables with a check cloth
          B.solid(x - 1.1, y - 0.9, zb, x + 1.1, y + 0.9, zb + 0.9, function(px, py, pz){ var dx = px - x, dy = py - y, t = pz - zb;
            if (Math.abs(t - 0.75) < 0.06 && Math.abs(dx) < 0.95 && Math.abs(dy) < 0.4) return ((Math.floor(dx * 4 + 8) + Math.floor(dy * 4 + 8)) % 2) ? '#e53935' : '#ffffff';
            if (Math.abs(t - 0.42) < 0.05 && Math.abs(dx) < 0.95 && Math.abs(Math.abs(dy) - 0.68) < 0.14) return '#8a6a44';
            if (Math.abs(Math.abs(dx) - 0.75) < 0.07 && Math.abs(dy) < 0.7 && t < 0.72 && Math.abs(Math.abs(dy) - t * 0.6) < 0.1) return '#6a4a30'; return null; }); });
        trees.forEach(function(t, i){ broadTree(B, t.x, t.y, 4 + hash(i, seed, 7) * 1.6, '#2a2a20', ['#1f4a2a', '#2a5a34', '#173a20'], i + seed); });
        posts.forEach(function(p){ lamp(B, p[0], p[1], '#2a2a30', '#ffe9a6'); });
      },
      fill:{ on:['grass'], trees:0.28, lows:0.25, tree:function(B, x, y, i){ broadTree(B, x, y, 3.8 + hash(i, seed, 34) * 1.6, '#2a2a20', ['#1f4a2a', '#2a5a34', '#173a20'], i + seed * 15); },
        low:function(B, x, y, i){ if (hash(i, seed, 35) < 0.6) bush(B, x, y, 0.42, ['#1f4a2a', '#2a5a34', '#173a20']); else lamp(B, x, y, '#2a2a30', '#ffe9a6'); } },
      gain:1.4, glow:true,
      mats:{ grass:['#1f4a2a', '#24552f', '#183d22', 0.2], walk:['#4a4a52', '#55555e', '#3e3e46', 0.25], bank:['#2a3a30', '#33463a', '#223028', 0.2],
        lake:['#163a6a', '#2a5a9a', '#0e2a52', 0.05, function(c, R, h3){ return R(((c.ti * 31 + c.tj * 17 + ((c.ti * c.tj) % 7)) % 59) === 0 ? '#ffe27a' : (c.dep || 0) < 0.15 ? '#1e4a7a' : '#163a6a'); }] }
    };
  };

  /* ---------------- THE CLUBHOUSE: practice greens behind a white clubhouse, a gravel path, big shade trees, a flag on the practice green */
  BUILD.clubhouse = function(L){
    var C = L.C, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot, spotRect = L.spotRect, north = L.north;
    var club = spotRect(8.5, 5, function(x, y){ return north(x, y) * 1.3 - Math.abs(x - L.cx) * 0.25; });
    var prac = spot(2.6, function(x, y){ return Math.abs(x - L.cx) * 0.5 + (club && x * club.x < 0 ? 2 : 0) - Math.abs(y - L.cy) * 0.2; });
    var path = club ? L.route([club.x, club.y + club.d / 2 + 0.3], [C.tee[0], P1[1] + 1.4], seed + 4, 1) : null;
    if (club) L.used.push({ x:club.x, y:club.y + club.d / 2 + 1.4, r:1.8 });
    var dPa = L.dist(path);
    function onPath(x, y){ return dPa(x, y) < 0.65; }
    var trees = []; for (var i = 0; i < 8; i++){ var t = spot(1.6, function(x, y){ return north(x, y) * 0.6 + L.side(x) * 3 + Math.min(L.far(x, y), 5) * 0.4; }, function(x, y){ return !onPath(x, y); }); if (t) trees.push(t); }
    var bench = spot(0.9, function(x, y){ return -Math.abs(clearAt(x, y) - 2.4) + hash(5, 2, seed); }, function(x, y){ return !onPath(x, y); });
    var lamps = path ? path.filter(function(p, k){ return k % 3 === 1; }).map(function(p, k){ return [p[0] + (k % 2 ? 1 : -1), p[1]]; }).filter(function(p){ return clearAt(p[0], p[1]) > 0.9; }) : [];
    function pracD(x, y){ return prac ? 1 - Math.hypot((x - prac.x) / prac.r, (y - prac.y) / (prac.r * 0.8)) : -1; }
    return {
      h:function(x, y){ var z = (fbm(x * 0.05, y * 0.05, seed) - 0.45) * 1.6 * sm(1.5, 7, clearAt(x, y)); if (pracD(x, y) > 0) z = z * 0.4 + 0.08; if (onPath(x, y)) z -= 0.04; return z; },
      mat:function(x, y){ if (pracD(x, y) > 0) return ['prac']; if (onPath(x, y)) return ['path']; return ['grass']; },
      build:function(B){
        if (club){ var w = club.w, d = club.d;
          house(B, club, { wh:2.7, rh:1.5, ov:0.4, chim:'#9a4a32', step:'#d9d2c2',
            wall:function(dx, dy, t){ if (dy > d / 2 - 0.15 && Math.abs(dx) < 0.55 && t < 1.9) return '#2f5d3a';
              if (dy > d / 2 - 0.15 && (Math.abs(Math.abs(dx) - 2.2) < 0.55 || Math.abs(Math.abs(dx) - 3.6) < 0.35) && t > 0.9 && t < 1.9) return (Math.abs(t - 1.4) < 0.05) ? '#ffffff' : '#9fd0e8';
              if (t < 0.3) return '#cfc8b6'; return (Math.floor(t * 4) % 2) ? '#f6f3ea' : '#ebe6d8'; },
            roof:function(dx, dy, t, rr, eave){ return eave ? '#1f4a2c' : ((Math.floor(dx * 2.5 + 20) % 2) ? '#2f6b3e' : '#2a6038'); } });
          var fx = club.x + (club.x < L.cx ? w / 2 + 1 : -w / 2 - 1), fy = club.y + d / 2 + 0.8, fz = B.gz(fx, fy);   // the club flag on its pole
          B.solid(fx - 0.2, fy - 0.2, fz, fx + 1.3, fy + 0.2, fz + 4.4, function(px, py, pz){ var t = pz - fz; if (Math.hypot(px - fx, py - fy) < 0.07 && t < 4.3) return '#e8e8e8';
            if (px > fx && px < fx + 1.2 && t > 3.3 && t < 4.1 && Math.abs(py - fy) < 0.05) return (t > 3.7) ? '#F1D04A' : '#1f4a2c'; return null; }); }
        if (prac){ var px0 = prac.x, py0 = prac.y, pz0 = B.gz(px0, py0) + 0.08;   // a practice flag
          B.solid(px0 - 0.1, py0 - 0.1, pz0, px0 + 0.9, py0 + 0.1, pz0 + 2.2, function(px, py, pz){ var t = pz - pz0; if (Math.hypot(px - px0, py - py0) < 0.05 && t < 2.1) return '#ffffff';
            if (px > px0 && px < px0 + 0.8 && t > 1.6 && t < 2.1 && Math.abs(py - py0) < 0.04) return '#e53935'; return null; }); }
        trees.forEach(function(t, i){ broadTree(B, t.x, t.y, 4 + hash(i, seed, 7) * 1.6, '#5a3d2e', ['#2f7d3e', '#3b8f4a', '#25693a'], i + seed); });
        lamps.forEach(function(p){ lamp(B, p[0], p[1], '#2a2a30', '#fff3c4'); });
        if (bench){ var bx = bench.x, by = bench.y, bz = B.gz(bx, by);
          B.solid(bx - 1.1, by - 0.4, bz, bx + 1.1, by + 0.4, bz + 1, function(px, py, pz){ var dx = px - bx, dy = py - by, t = pz - bz; if (Math.abs(dx) > 1) return null;
            if (Math.abs(t - 0.45) < 0.06 && Math.abs(dy) < 0.25) return '#8a6a44'; if (dy > 0.18 && dy < 0.28 && t > 0.5 && t < 0.9) return '#8a6a44';
            if (Math.abs(Math.abs(dx) - 0.85) < 0.07 && t < 0.45) return '#2a2a30'; return null; }); }
      },
      fill:{ on:['grass'], trees:0.36, lows:0.28, tree:function(B, x, y, i){ broadTree(B, x, y, 3.8 + hash(i, seed, 31) * 1.6, '#5a3d2e', ['#2f7d3e', '#3b8f4a', '#25693a'], i + seed * 11); },
        low:function(B, x, y, i){ bush(B, x, y, 0.45, i % 3 ? ['#3b8f4a', '#2f7d3e', '#4a9a52'] : ['#3b8f4a', '#ffffff', '#3b8f4a', '#e53935']); } },
      gain:1.5,
      mats:{ grass:['#7fb35e', '#89bd66', '#73a754', 0.16, function(c, R){ return R((Math.floor(c.tj / 6) % 2) ? '#7fb35e' : '#76aa56'); }],
        prac:['#5fae58', '#69b862', '#56a350', 0.12], path:['#d8ccb0', '#e4d9c0', '#c8ba98', 0.3] }
    };
  };

  /* ---------------- TOUR WEEK: a tournament green. A grandstand full of people, a big leaderboard, rope lines and tall trees */
  BUILD.tour = function(L){
    var C = L.C, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot, spotRect = L.spotRect, north = L.north;
    var stand = spotRect(10, 3.6, function(x, y){ return north(x, y) * 1.4 - Math.abs(x - L.cx) * 0.3; });
    var board = spotRect(5.5, 1, function(x, y){ return north(x, y) * 0.6 + Math.abs(x - L.cx) * 0.5 + (stand && x * stand.x < 0 ? 3 : 0); });
    var trees = []; for (var i = 0; i < 9; i++){ var t = spot(1.6, function(x, y){ return north(x, y) * 0.6 + L.side(x) * 3; }); if (t) trees.push(t); }
    // rope posts a little off the course on both sides
    var posts = []; for (var y = P0[1] + 2; y < P1[1] - 1; y += 3.2){ [P0[0] - 2.2, P1[0] + 2.2].forEach(function(x){ if (clearAt(x, y) > 1.2 && clearAt(x, y) < 3.5) posts.push([x, y]); }); }
    var CROWD = ['#e53935', '#1e88e5', '#ffffff', '#ffd23f', '#43a047', '#ff8a3c', '#1d2a44', '#f48fb1'];
    return {
      h:function(x, y){ return (fbm(x * 0.05, y * 0.05, seed) - 0.45) * 1.4 * sm(1.5, 7, clearAt(x, y)); },
      mat:function(x, y){ return ['grass']; },
      build:function(B){
        if (stand){ var sx = stand.x, sy = stand.y, sz = B.gz(sx, sy), w = stand.w, d = stand.d, rows = 5, rh = 0.55;   // stepped seating, back row highest
          B.solid(sx - w / 2, sy - d / 2, sz - 0.1, sx + w / 2, sy + d / 2, sz + rows * rh + 1.4, function(px, py, pz){ var dx = px - sx, dy = py - sy, t = pz - sz;
            var row = Math.floor((d / 2 - dy) / (d / rows)), top = (row + 1) * rh; if (row < 0 || row >= rows) return null;
            if (t < top - 0.08) return (Math.abs(dx) > w / 2 - 0.15) ? '#1d2a44' : '#2a3a5a';
            if (t < top + 0.5 && ((Math.floor(dx * 2.2 + 30) + row) % 3) !== 0 && Math.abs(dx) < w / 2 - 0.25){ var k = hash(Math.floor(dx * 2.2 + 30), row, seed); return t > top + 0.36 ? (k < 0.5 ? '#6a4a30' : '#e8c8a0') : CROWD[Math.floor(k * CROWD.length)]; }
            return null; }); }
        if (board){ var bx = board.x, by = board.y, bz = B.gz(bx, by), bw = board.w;   // the leaderboard on two legs
          B.solid(bx - bw / 2, by - 0.4, bz, bx + bw / 2, by + 0.4, bz + 4, function(px, py, pz){ var dx = px - bx, t = pz - bz;
            if (t < 1.6) return (Math.abs(Math.abs(dx) - bw * 0.35) < 0.12 && Math.abs(py - by) < 0.12) ? '#1d2a44' : null;
            if (Math.abs(dx) > bw / 2 - 0.05 || t > 3.95 || Math.abs(py - by) > 0.22) return Math.abs(py - by) < 0.25 ? '#0f1626' : null;
            if (t > 3.5) return '#F1D04A'; var r = Math.floor((t - 1.6) / 0.38); return (r % 2 && Math.abs(dx) < bw / 2 - 0.4) ? (dx < -bw * 0.2 ? '#ffffff' : '#ff5a5a') : '#173a24'; }); }
        trees.forEach(function(t, i){ broadTree(B, t.x, t.y, 4.6 + hash(i, seed, 7) * 1.8, '#4a3626', ['#1f5a32', '#2a6b3c', '#174a28'], i + seed); });
        posts.forEach(function(p, i){ var zb = B.gz(p[0], p[1]); B.solid(p[0] - 0.15, p[1] - 1.7, zb, p[0] + 0.15, p[1] + 1.7, zb + 1, function(px, py, pz){ var t = pz - zb;
          if (Math.hypot(px - p[0], py - p[1]) < 0.07 && t < 0.9) return '#ffffff'; if (Math.abs(px - p[0]) < 0.04 && Math.abs(t - 0.75 - Math.abs(py - p[1]) * 0.05) < 0.04) return '#F1D04A'; return null; }); });
      },
      fill:{ on:['grass'], trees:0.34, lows:0.2, tree:function(B, x, y, i){ broadTree(B, x, y, 4.4 + hash(i, seed, 33) * 1.8, '#4a3626', ['#1f5a32', '#2a6b3c', '#174a28'], i + seed * 17); },
        low:function(B, x, y, i){ bush(B, x, y, 0.45, ['#2a6b3c', '#1f5a32', '#357a46']); } },
      gain:1.4,
      mats:{ grass:['#3f8a4a', '#47954f', '#367d42', 0.14, function(c, R){ return R((Math.floor((c.ti + c.tj) / 7) % 2) ? '#3f8a4a' : '#378045'); }] }
    };
  };

  /* ---------------- LOST TEMPLE: a stepped pyramid in the jungle behind the hole, a jade pool, broken columns, a paved way */
  BUILD.temple = function(L){
    var C = L.C, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot, spotRect = L.spotRect, north = L.north;
    var pyr = spotRect(11, 9, function(x, y){ return north(x, y) * 1.4 - Math.abs(x - L.cx) * 0.25; });
    var pool = spot(2.3, function(x, y){ return Math.abs(x - L.cx) * 0.5 - Math.abs(y - L.cy) * 0.2; });
    var path = pyr ? L.route([pyr.x, pyr.y + pyr.d / 2 + 0.3], [C.tee[0], P1[1] + 1.4], seed + 4, 1.2) : null;
    if (pyr) L.used.push({ x:pyr.x, y:pyr.y + pyr.d / 2 + 1.6, r:1.8 });
    var dPa = L.dist(path); function onPath(x, y){ return dPa(x, y) < 0.75; }
    var cols = []; for (var i = 0; i < 6; i++){ var c = spot(0.5, function(x, y){ return -Math.abs(clearAt(x, y) - 2.4) * 0.6 + hash(x * 3 | 0, y * 3 | 0, seed + i); }, function(x, y){ return !onPath(x, y); }); if (c) cols.push(c); }
    var trees = []; for (i = 0; i < 12; i++){ var t = spot(1.6, function(x, y){ return north(x, y) * 0.6 + L.side(x) * 3 + Math.min(L.far(x, y), 5) * 0.4; }, function(x, y){ return !onPath(x, y); }); if (t) trees.push(t); }
    function poolD(x, y){ return pool ? 1 - Math.hypot((x - pool.x) / pool.r, (y - pool.y) / (pool.r * 0.75)) + (fbm(x * 0.6, y * 0.6, seed + 9) - 0.5) * 0.3 : -1; }
    var LEAF = ['#1f5a2a', '#2a6b33', '#174a22'];
    return {
      h:function(x, y){ var z = (fbm(x * 0.06, y * 0.06, seed) - 0.45) * 2.2 * sm(1.5, 7, clearAt(x, y)), p = poolD(x, y); if (p > 0) return -0.3; if (p > -0.2) z = Math.min(z, 0.05); if (onPath(x, y)) z = z * 0.3 + 0.04; return z; },
      mat:function(x, y){ var p = poolD(x, y); if (p > 0) return ['jade', { dep:p }]; if (p > -0.12) return ['ledge']; if (onPath(x, y)) return ['paving']; return ['moss']; },
      build:function(B){
        if (pyr){ var X = pyr.x, Y = pyr.y, zb = B.gz(X, Y), W = pyr.w, D = pyr.d, steps = 4, sh = 1.05;   // four tiers, a stair up the front, a shrine on top
          B.solid(X - W / 2, Y - D / 2, zb - 0.1, X + W / 2, Y + D / 2, zb + steps * sh + 2.2, function(px, py, pz){ var dx = Math.abs(px - X), dy = py - Y, t = pz - zb;
            var k = Math.floor(t / sh); if (k < steps){ var hw = W / 2 - k * 1.05, hd = D / 2 - k * 0.85; if (dx > hw || Math.abs(dy) > hd) return null;
              if (dy > 0 && dx < 0.85) return (Math.floor(t * 4) % 2) ? '#c9bf94' : '#b3a97e';
              if (t % sh > sh - 0.12) return '#7b7354'; if (hash(px * 3 | 0, pz * 3 | 0, seed + 5) < 0.18) return '#4f7a3a';
              return (Math.floor(px * 1.6 + (Math.floor(t * 2) % 2) * 0.5) % 2) ? '#a69c72' : '#958b63'; }
            var tt = t - steps * sh; if (dx > 1.3 || Math.abs(dy) > 1.1 || tt > 2) return null;
            if (dy > 0.95 && dx < 0.45 && tt < 1.2) return '#141008'; if (tt > 1.6) return tt > 1.85 ? '#c9a227' : '#6f6a4e'; return dx > 1.1 ? '#8f8766' : '#a69c72'; }); }
        cols.forEach(function(c, i){ var zb = B.gz(c.x, c.y), H = hash(i, seed, 7) < 0.4 ? 1 + hash(i, seed, 8) : 2.6;
          B.solid(c.x - 0.5, c.y - 0.5, zb - 0.05, c.x + 0.5, c.y + 0.5, zb + H + 0.25, function(px, py, pz){ var r = Math.hypot(px - c.x, py - c.y), t = pz - zb;
            if (t > H){ return H > 2 && Math.abs(px - c.x) < 0.45 && Math.abs(py - c.y) < 0.45 ? '#bdb38a' : null; } if (r > 0.33) return null;
            if (hash(pz * 4 | 0, i, seed + 2) < 0.2) return '#4f7a3a'; return (Math.floor(Math.atan2(py - c.y, px - c.x) * 2.5 + 8) % 2) ? '#c2b88e' : '#ada37a'; }); });
        trees.forEach(function(t, i){ broadTree(B, t.x, t.y, 4.6 + hash(i, seed, 7) * 1.8, '#4a3626', LEAF, i + seed); });
      },
      fill:{ on:['moss'], trees:0.55, lows:0.35, tree:function(B, x, y, i){ broadTree(B, x, y, 4.2 + hash(i, seed, 31) * 1.8, '#4a3626', LEAF, i + seed * 11); },
        low:function(B, x, y, i){ var k = hash(i, seed, 32); if (k < 0.6) bush(B, x, y, 0.5, ['#2f7d32', '#43a047', '#1f5a2a']); else rockAt(B, x, y, 0.4, ['#a69c72', '#4f7a3a']); } },
      gain:1.3, fog:function(x, y){ return fbm(x * 0.11 + y * 0.02, y * 0.17, seed + 21); }, fogCol:'#bfe8c8',
      mats:{ moss:['#2f5a2a', '#376632', '#3e5a2c', 0.18], paving:['#a69c72', '#b3a97e', '#8f8766', 0.3, function(c, R, h3){ return R(((c.ti >> 1) + (c.tj >> 1)) % 2 ? '#a69c72' : (h3(c.ti, c.tj, 2) < 0.2 ? '#4f7a3a' : '#958b63')); }],
        ledge:['#8f8766', '#a69c72', '#7b7354', 0.3], jade:['#2fb58f', '#7fe0c0', '#1f8a6c', 0.05, function(c, R){ return R((c.dep || 0) < 0.25 ? '#5fd8b2' : (((c.ti * 3 + c.tj * 5) % 19) === 0 ? '#7fe0c0' : '#2fb58f')); }] }
    };
  };

  /* ---------------- PIRATE COVE: the cove behind the hole with a ship at anchor, a dock, palms, barrels and a chest on the sand */
  /* ---------------- PIRATE COVE IS A JOURNEY. The owner (2026-10-15): the scenery round each hole "needs to vary so it
     feels like you're moving through the world". A tour hole knows its place in its world (L.leg, 1 to 18), and Pirate
     Cove walks you from where you land to where the captain hides: the landing beach (1 to 4), the port town (5 to 8),
     the jungle path (9 to 12), Skull Rock (13 to 16), and the captain's cove (17 and 18). A hole with no place (a daily,
     a season) stands on the beach, as every Pirate Cove hole did before. */
  BUILD.pirate = function(L){ var s = L.stop; return s === 'cove' ? pirCove(L) : s === 'skull' ? pirSkull(L) : s === 'jungle' ? pirJungle(L) : s === 'town' ? pirTown(L) : pirBeach(L); };
  STOPS.pirate = [[1, 'beach'], [5, 'town'], [9, 'jungle'], [13, 'skull'], [17, 'cove']];
  FLY['pirate~beach'] = FLY['pirate~town'] = FLY['pirate~skull'] = FLY['pirate~cove'] = 'gull'; FLY['pirate~jungle'] = 'parrot';

  // a palm: a ringed trunk that leans and bends, and seven fronds that sag from the crown
  function pirPalm(B, x, y, H, k, seed){ var zb = B.gz(x, y), lean = (hash(k, seed, 4) - 0.5) * 1.2, top = [x + lean, y - 0.3, zb + H];
    B.vox(x - 3.2, y - 2.8, zb, x + 3.2, y + 2.6, zb + H + 0.8, function(set){ for (var s = 0; s < 8; s++){ var t0 = s / 8, t1 = (s + 1) / 8; B.tube(set, x + lean * t0 * t0, y - 0.3 * t0, zb + H * t0, x + lean * t1 * t1, y - 0.3 * t1, zb + H * t1, 0.2 - t0 * 0.06, 0.2 - t1 * 0.06, s % 2 ? '#8a6a3e' : '#7a5c34'); }
      for (var f = 0; f < 7; f++){ var a = f / 7 * 6.28 + k, fx = Math.cos(a), fy = Math.sin(a) * 0.7; for (var al = 0; al < 2.5; al += set.st){ var sag = 0.35 - al * al * 0.22, wd = 0.37 * (1 - al / 2.7); for (var o = -wd; o <= wd; o += set.st) set(top[0] + fx * al - fy * o, top[1] + fy * al + fx * o, top[2] + sag, al > 1.5 ? '#3f9a46' : (Math.abs(o) < set.st * 1.5 ? '#5a7a2a' : '#2f8139')); } } }, B.ART); }
  // a ship: a hull with gunports, a gold rail, two masts, sails bellied by the wind, and the black flag. s scales her
  function pirShip(B, X, Y, s, zw){ var Lh = 4.8 * s, Wh = 1.5 * s; zw = zw == null ? -0.25 : zw;
    B.solid(X - Lh - 0.6, Y - Wh - 0.9, zw - 0.4, X + Lh + 0.6, Y + Wh + 0.5, zw + 9.4 * s, function(px, py, pz){ var dx = px - X, dy = py - Y, t = (pz - zw) / s;
      var u = dx / Lh, hw = Wh * Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, Math.abs(u) - 0.35) / 0.65, 2)));
      if (t < 1.5){ if (Math.abs(u) > 1 || Math.abs(dy) > hw * (0.7 + t / 5)) return null; if (t > 1.32) return '#c9a227'; if (Math.abs(t - 0.9) < 0.08) return '#2a1810';
        if (Math.abs(t - 0.9) < 0.3 && Math.abs(((dx / s) % 1.1 + 1.1) % 1.1 - 0.55) < 0.14 && dy > hw * 0.6) return '#111'; return (Math.floor(t * 4) % 2) ? '#6b4426' : '#5a3818'; }
      if (t < 1.65) return (Math.abs(u) < 0.95 && Math.abs(dy) < hw) ? '#a0703c' : null;
      for (var m = -1; m <= 1; m += 2){ var mx = X + m * 1.6 * s, mt = m < 0 ? 7.6 : 8.6; if (Math.hypot(px - mx, py - Y) < 0.12 * s && t < mt) return '#4a2c16';
        var sw = (1.6 - (t - 2.4) * 0.05) * s, q = (px - mx) / sw, belly = (1 - q * q) * 0.5 * s;   // the sail bows toward the camera, so the light runs across it
        if (Math.abs(py - Y - belly) < 0.09 && Math.abs(px - mx) < sw && t > 2.4 && t < mt - 1){ var band = Math.floor((t - 2.4) / 1.05); return Math.abs(q) > 0.86 ? '#cfc3a2' : band % 2 ? '#f4efe2' : '#e9dfc4'; } }
      if (t > 8.6 && t < 9.2 && px > X + 1.6 * s && px < X + 2.6 * s && Math.abs(py - Y) < 0.06) return (Math.hypot(px - X - 2.05 * s, (t - 8.9) * s) < 0.14 * s) ? '#f4efe2' : '#111';
      return null; }); }
  // the small things a pirate leaves about: a barrel (k 0), a crate (1), a cannon (2), a chest (3)
  function pirProp(B, x, y, k){ var zb = B.gz(x, y);
    if (k === 0) B.solid(x - 0.45, y - 0.45, zb, x + 0.45, y + 0.45, zb + 1, function(px, py, pz){ var r = Math.hypot(px - x, py - y), t = pz - zb, R = 0.38 + Math.sin(t / 0.95 * 3.14) * 0.06; if (r > R || t > 0.95) return null;
      return (Math.abs(t - 0.2) < 0.05 || Math.abs(t - 0.75) < 0.05) ? '#3a3a40' : (Math.floor(Math.atan2(py - y, px - x) * 3) % 2 ? '#8f5a2c' : '#7a4a24'); });
    else if (k === 1) B.solid(x - 0.5, y - 0.5, zb, x + 0.5, y + 0.5, zb + 0.9, function(px, py, pz){ var dx = px - x, dy = py - y, t = pz - zb; if (Math.abs(dx) > 0.45 || Math.abs(dy) > 0.45 || t > 0.85) return null;
      var e = Math.max(Math.abs(dx), Math.abs(dy)) > 0.38 || t > 0.78 || t < 0.07; return e ? '#6a4420' : (Math.abs(dx - dy) < 0.06 || Math.abs(dx + dy) < 0.06 ? '#6a4420' : '#a8783e'); });
    else if (k === 2) B.solid(x - 0.8, y - 0.5, zb, x + 0.8, y + 0.5, zb + 0.8, function(px, py, pz){ var dx = px - x, dy = py - y, t = pz - zb;
      if (Math.abs(dy) < 0.12 && t > 0.25 && t < 0.55 && dx > -0.7 && dx < 0.5) return Math.hypot(dy, t - 0.4) < 0.12 ? '#45454c' : null; if (dx > 0.45 && dx < 0.7 && Math.hypot(dy, t - 0.4) < 0.22) return '#2c2c30';
      if (Math.abs(Math.abs(dy) - 0.3) < 0.07 && Math.hypot(dx + 0.3, t - 0.25) < 0.25) return '#5a3818'; return null; });
    else B.solid(x - 0.6, y - 0.45, zb, x + 0.6, y + 0.45, zb + 0.95, function(px, py, pz){ var dx = px - x, dy = py - y, t = pz - zb; if (Math.abs(dx) > 0.55 || Math.abs(dy) > 0.38) return null;
      if (t > 0.5 && Math.hypot(dy, t - 0.5) > 0.38) return null; if (t > 0.86 && Math.abs(dx) < 0.45) return '#ffd23a';   // gold heaped over the rim
      if (Math.abs(t - 0.5) < 0.04 || Math.abs(Math.abs(dx) - 0.35) < 0.05) return '#c9a227'; return t > 0.5 ? '#7a4a24' : '#8f5a2c'; }); }
  function pirLows(B, x, y, i, seed){ var k = hash(i, seed, 23); if (k < 0.5) rockAt(B, x, y, 0.38, ['#7d756c', '#8e867b']); else bush(B, x, y, 0.4, ['#3f9a46', '#2f8139', '#a8c25a']); }
  function blot(c, f, sd){ return vn(c.ti * f, c.tj * f, sd); }   // a smooth patch field on the land's quarter foot cells
  var PIR_SEA = ['#1a86c4', '#5ec0e8', '#136a9e', 0.05, function(c, R){ var d = c.dep || 0; return R(d < 1.2 ? '#5ec0e8' : d < 3.5 ? '#1a86c4' : '#136a9e'); }];

  /* 2. THE PORT TOWN: the harbour along the top, a quay of dressed stone and a boardwalk to it, a ship tied up at the
     quay, the town's shacks either side with their lamps lit, and the cargo stacked about. */
  function pirTown(L){
    var E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot, spotRect = L.spotRect;
    function quayY(x){ return P0[1] - 2.4 - (vn(x * 0.05, 1, seed) - 0.5) * 0.5; }
    function sea(x, y){ return quayY(x) - y; }
    var shipX = L.cx + (hash(seed, 2, 3) < 0.5 ? -1 : 1) * Math.min(6.5, (E[2] - E[0]) * 0.16), shipY = Math.max(E[1] + 2.6, quayY(shipX) - 2.7);
    L.used.push({ x:shipX, y:shipY, r:5 });
    var shacks = []; for (var i = 0; i < 4; i++){ var r = spotRect(4.6, 3.6, function(x, y){ return L.side(x) * 6 - Math.abs(y - P0[1] - 3) * 0.25 + hash(x | 0, y | 0, seed + 30 + i); }); if (r) shacks.push(r); }
    var lamps = []; for (i = 0; i < 4; i++){ var lp = spot(0.4, function(x, y){ return -Math.abs(clearAt(x, y) - 1.6) + hash(x * 3 | 0, y * 3 | 0, seed + 40 + i); }, function(x, y){ return sea(x, y) < -0.8; }); if (lp) lamps.push(lp); }
    var cargo = []; for (i = 0; i < 9; i++){ var q = spot(0.6, function(x, y){ return -Math.abs(clearAt(x, y) - 2.4) * 0.6 + Math.max(0, 4 - Math.abs(sea(x, y) + 1.6)) * 0.3 + hash(x * 3 | 0, y * 3 | 0, seed + 9 + i); }, function(x, y){ return sea(x, y) < -0.9; }); if (q) cargo.push(q); }
    var ROOF = ['#a8442e', '#2f6f8f', '#7a8a3a', '#8a5a9a'];
    return {
      h:function(x, y){ var s = sea(x, y); if (s > 0) return -0.55; return (fbm(x * 0.08, y * 0.1, seed + 2) - 0.45) * 0.4 * sm(1.2, 5, clearAt(x, y)); },
      mat:function(x, y){ var s = sea(x, y); if (s > 0) return ['sea', { dep:s + 1.2 }]; if (s > -0.7) return ['quay', { u:x }]; if (s > -4.5) return ['boards', { u:y }]; return ['cobble']; },
      build:function(B){
        pirShip(B, shipX, shipY, 1, -0.55);
        shacks.forEach(function(r, n){ var d = r.d, roof = ROOF[(n + (seed & 3)) % 4];
          house(B, r, { wh:2.3, rh:1.5, chim:n % 2 ? '#6e665e' : null, step:'#8a6a44',
            wall:function(dx, dy, t){ if (dy > d / 2 - 0.15 && Math.abs(dx) < 0.45 && t < 1.7) return '#3a2412';
              if (dy > d / 2 - 0.15 && Math.abs(Math.abs(dx) - 1.5) < 0.38 && t > 0.8 && t < 1.55) return Math.abs(t - 1.17) < 0.04 ? '#5a3818' : '#ffcf6a';
              return (Math.floor((dx + 9) * 2.4) % 2) ? '#b08a5a' : '#9a7648'; },
            roof:function(dx, dy, t, rr, eave){ return eave ? '#4a2c16' : (Math.floor(t * 4) % 2 ? roof : '#6a2a1e'); } }); });
        lamps.forEach(function(p){ lamp(B, p.x, p.y, '#2a2420', '#ffd77a'); });
        cargo.forEach(function(p, i){ pirProp(B, p.x, p.y, i % 3 === 2 ? 0 : i % 3); });
      },
      fill:{ on:['cobble'], trees:0.12, lows:0.12, tree:function(B, x, y, i){ pirPalm(B, x, y, 3.6 + hash(i, seed, 21) * 1.2, i * 3 + seed, seed); }, low:function(B, x, y, i){ pirProp(B, x, y, i % 2); } },
      bg:'#1677b5', gain:1.6,
      mats:{ sea:PIR_SEA,
        quay:['#9a958a', '#b8b2a4', '#7a756c', 0.1, function(c, R){ return R((c.ti % 6 === 0 || c.tj % 3 === 0) ? '#7a756c' : '#a8a296'); }],
        boards:['#9a6a3e', '#b07c48', '#7a5230', 0.1, function(c, R, h3){ var row = c.tj, lap = (c.ti + (row * 7 % 11)) % 14 === 0; return R(lap || row % 3 === 0 ? '#6a4426' : h3(row, c.ti >> 3, 9) < 0.3 ? '#a8763f' : '#946238'); }],
        // cobbles a foot by three quarters, each row set over half a stone, with a thin line of mortar
        cobble:['#a89a86', '#c2b49e', '#8a7e6c', 0.12, function(c, R){ var row = Math.floor(c.tj / 3), off = row % 2 ? 2 : 0, col = Math.floor((c.ti + off) / 4);
          if (c.tj % 3 === 0 || (c.ti + off) % 4 === 0) return R('#7e7262'); var n = hash(col, row, 4); return R(n < 0.3 ? '#b8a890' : n < 0.62 ? '#ac9e88' : '#9e907a'); }] }
    };
  }

  /* 3. THE JUNGLE PATH: inland, under the canopy. A rock face behind the hole with a waterfall into a pool, the old fort's
     wall in ruins with its cannon, and jungle thick on every side. */
  function pirJungle(L){
    var E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot, spotRect = L.spotRect;
    var fallX = L.cx + (hash(seed, 5, 1) < 0.5 ? -1 : 1) * Math.min(5, (P1[0] - P0[0]) * 0.3);
    function cliffY(x){ return P0[1] - 3.2 - (vn(x * 0.16, 2, seed) - 0.5) * 2.2; }
    var pool = { x:fallX, y:cliffY(fallX) + 2.2, r:2.4 }; if (clearAt(pool.x, pool.y) < pool.r + 0.6) pool = null; else L.used.push({ x:pool.x, y:pool.y, r:pool.r + 0.4 });
    function poolD(x, y){ return pool ? 1 - Math.hypot((x - pool.x) / pool.r, (y - pool.y) / (pool.r * 0.7)) + (fbm(x * 0.7, y * 0.7, seed + 3) - 0.5) * 0.2 : -1; }
    var fort = spotRect(6, 1.4, function(x, y){ return L.side(x) * 4 + hash(x | 0, y | 0, seed + 60) * 2 - Math.abs(y - (P0[1] + P1[1]) / 2) * 0.1; });
    var gun = fort ? { x:fort.x + 1.4, y:fort.y + 1.3 } : null; if (gun) L.used.push({ x:gun.x, y:gun.y, r:0.8 });
    return {
      h:function(x, y){ var cy = cliffY(x), k = sm(0.8, 3, clearAt(x, y)); if (y < cy) return (2.6 + Math.min(5.5, (cy - y) * 0.9) + (fbm(x * 0.3, y * 0.3, seed + 5) - 0.5)) * k; if (poolD(x, y) > 0) return -0.15; return (fbm(x * 0.08, y * 0.1, seed) - 0.42) * 1.3 * sm(1.3, 6, clearAt(x, y)); },
      mat:function(x, y){ var cy = cliffY(x); if (pool && y < cy && Math.abs(x - pool.x) < 0.9 + (cy - y) * 0.04) return ['fall', { u:x, v:y }]; if (y < cy) return ['cliff', { z:cy - y }];
        var t = poolD(x, y); if (t > 0) return ['jpool', { dep:t }]; if (t > -0.12) return ['mud']; return ['floor']; },
      build:function(B){
        if (fort){ var zb = B.gz(fort.x, fort.y);
          B.solid(fort.x - 3.1, fort.y - 0.8, zb - 0.1, fort.x + 3.1, fort.y + 0.8, zb + 2.2, function(px, py, pz){ var dx = px - fort.x, dy = py - fort.y, t = pz - zb;
            var top = 1.4 + Math.sin(dx * 1.7) * 0.25 + (hash(Math.floor(dx * 2) + 9, 3, seed) - 0.5) * 0.6 + (Math.abs(dx) < 0.9 ? 0.5 : 0); if (Math.abs(dy) > 0.6 || Math.abs(dx) > 3 || t > top) return null;
            var row = Math.floor(t * 2.6), col = Math.floor(dx * 1.6 + (row % 2) * 0.5); if (((t * 2.6) % 1) < 0.12 || ((dx * 1.6 + (row % 2) * 0.5) % 1 + 1) % 1 < 0.08) return '#6a6658';
            if (t > top - 0.3 && hash(col, row, seed + 2) < 0.6) return '#4f7a2e'; return hash(col, row, seed) < 0.3 ? '#8e8a78' : '#a29e8a'; }); }
        if (gun) pirProp(B, gun.x, gun.y, 2);
      },
      fill:{ on:['floor'], trees:0.62, lows:0.42,
        tree:function(B, x, y, i){ if (hash(i, seed, 31) < 0.45) pirPalm(B, x, y, 3.8 + hash(i, seed, 32) * 1.8, i * 5 + seed, seed); else broadTree(B, x, y, 3.6 + hash(i, seed, 33) * 1.8, '#4a3624', ['#1f5a26', '#2b6e30', '#3f8a3a'], i); },
        low:function(B, x, y, i){ var k = hash(i, seed, 34); if (k < 0.55) bush(B, x, y, 0.5, ['#1f6a2a', '#2f8139', '#3f9a46']); else if (k < 0.8) bush(B, x, y, 0.32, ['#e8573a', '#2f8139', '#3f9a46']); else rockAt(B, x, y, 0.4, ['#7a7a68', '#5a6a42']); } },
      bg:'#2c5a2a', gain:1.9,
      mats:{ floor:['#3f6a2a', '#4e7a32', '#2f5a22', 0.12, function(c, R){ var a = blot(c, 0.11, seed + 7), b = blot(c, 0.3, seed + 8); return R(a > 0.66 ? '#5e5030' : a > 0.58 ? '#4e5a2c' : b > 0.6 ? '#48742e' : b < 0.3 ? '#365e26' : '#3f6a2a'); }],
        mud:['#5a4630', '#6e5638', '#463626', 0.1],
        cliff:['#6e6a5a', '#9a9682', '#4e4a3e', 0.2, function(c, R){ var z = c.z || 0; return R(z > 4.6 ? '#2f5a22' : blot(c, 0.16, seed + 3) > 0.64 ? '#4f7a2e' : ((Math.floor(z * 1.4) % 2) ? '#6e6a5a' : '#7e7a68')); }],
        fall:['#bfe8f4', '#ffffff', '#7fc8e4', 0.2, function(c, R, h3){ return R(h3(c.ti, (c.tj + c.ti * 3) >> 1, 5) < 0.35 ? '#ffffff' : h3(c.ti, c.tj, 6) < 0.5 ? '#bfe8f4' : '#8fd4ec'); }],
        jpool:['#2f8f9a', '#6fc8d0', '#1f6a78', 0.06, function(c, R){ var d = c.dep || 0; return R(d < 0.15 ? '#8fdce0' : d < 0.5 ? '#2f8f9a' : '#1f6a78'); }] }
    };
  }

  /* 4. SKULL ROCK: the coast turns to rock. Grey stone underfoot, the sea breaking on it, stacks standing out in the
     water, a wreck on the rocks, and the skull itself, carved out of a headland, looking back at you. */
  function pirSkull(L){
    var E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot;
    var sx0 = hash(seed, 7, 2) < 0.5 ? -1 : 1;
    function shoreY(x){ return P0[1] - 1.6 - (vn(x * 0.2, 1, seed) - 0.5) * 3.2; }
    function sea(x, y){ return shoreY(x) - y; }
    var skull = { x:L.cx + sx0 * Math.min(7.5, (E[2] - E[0]) * 0.22), y:0 }; skull.y = Math.max(E[1] + 3, shoreY(skull.x) - 3.2); L.used.push({ x:skull.x, y:skull.y, r:4 });
    var stacks = []; for (var i = 0; i < 3; i++){ var sx = L.cx - sx0 * (3 + i * 4 + hash(i, seed, 3) * 2), sy = shoreY(sx) - 1.8 - hash(i, seed, 4) * 2.4; if (sy > E[1] + 0.8) stacks.push({ x:sx, y:sy, h:2.4 + hash(i, seed, 5) * 2.2, r:0.8 + hash(i, seed, 6) * 0.5 }); }
    var wreck = spot(1.8, function(x, y){ return -Math.abs(sea(x, y) + 0.6) * 2 + L.side(x) * 3 + hash(x | 0, y | 0, seed + 70); }, function(x, y){ return sea(x, y) < 0.4 && sea(x, y) > -2.5; });
    return {
      h:function(x, y){ var s = sea(x, y); if (s > 0) return -0.3 - Math.min(0.4, s * 0.1); var rk = fbm(x * 0.35, y * 0.35, seed + 4), k = sm(0, 1.6, -s);
        return ((rk - 0.45) * 0.9 + (fbm(x * 0.08, y * 0.1, seed + 2) - 0.4)) * sm(1.2, 5, clearAt(x, y)) * k - 0.3 * (1 - k); },
      mat:function(x, y){ var s = sea(x, y); if (s > 0) return s < 0.5 + Math.sin(x * 1.3) * 0.2 ? ['foam'] : ['sea', { dep:s }]; return fbm(x * 0.3, y * 0.3, seed + 9) > 0.58 ? ['sand'] : ['stone', { u:x }]; },
      build:function(B){
        // the skull: a dome of rock with two sockets, a nose, a jaw of teeth, cracks, and a cap of grass
        (function(){ var X = skull.x, Y = skull.y, zb = -0.4, R = 3.1;
          B.solid(X - R - 0.4, Y - R, zb, X + R + 0.4, Y + R * 0.9, zb + R * 2.2, function(px, py, pz){ var dx = px - X, dy = py - Y, t = pz - zb;
            var head = Math.hypot(dx / R, dy / (R * 0.85), (t - R * 1.2) / (R * 0.95)), jaw = Math.hypot(dx / (R * 0.7), (dy - 0.3) / (R * 0.7), (t - R * 0.45) / (R * 0.55));
            var d = Math.min(head, jaw) + (vn(dx * 1.4, t * 1.4, seed) - 0.5) * 0.12; if (d > 1) return null;
            var front = dy > R * 0.45;
            if (front && Math.hypot(Math.abs(dx) - R * 0.38, t - R * 1.3) < R * 0.27) return '#1a1612';   // the sockets
            if (front && Math.abs(dx) < R * 0.13 && t > R * 0.82 && t < R * 1.05 && Math.abs(dx) < (R * 1.05 - t) * 0.6) return '#1a1612';   // the nose
            if (front && t > R * 0.42 && t < R * 0.66 && Math.abs(dx) < R * 0.5){ return (((dx / (R * 0.13)) % 1 + 1) % 1 < 0.2 || Math.abs(t - R * 0.54) < 0.05) ? '#4a4640' : '#d8d0bc'; }   // the teeth
            if (t > R * 2.0) return '#4f7a2e'; if (Math.abs(Math.sin(dx * 2.3 + t * 0.7)) < 0.04) return '#5a5650';
            return (Math.floor(t * 2) + Math.floor(dx * 1.5)) % 3 ? '#8e8a80' : '#a29e92'; }); })();
        stacks.forEach(function(s, i){ var zb = -0.5;
          B.solid(s.x - s.r - 0.2, s.y - s.r - 0.2, zb, s.x + s.r + 0.2, s.y + s.r + 0.2, zb + s.h + 0.6, function(px, py, pz){ var t = pz - zb, rr = s.r * (1 - t / (s.h + 1.2) * 0.45) + (vn(px * 2, pz * 2, seed + i) - 0.5) * 0.18;
            if (Math.hypot(px - s.x, py - s.y) > rr || t > s.h) return null; if (t > s.h - 0.18) return '#4f7a2e'; if (t < 0.6) return '#eef8f8'; return (Math.floor(t * 2.2) % 2) ? '#7a766c' : '#8e8a80'; }); });
        if (wreck){ var X = wreck.x, Y = wreck.y, zb = -0.3, dir = sx0;   // a hull broken in two, heeled over, one mast stump
          B.solid(X - 3.2, Y - 1.4, zb - 0.3, X + 3.2, Y + 1.4, zb + 3.2, function(px, py, pz){ var dx = (px - X) * dir, dy = py - Y, t = pz - zb, tilt = t - dx * 0.12;
            if (Math.abs(dx) < 3 && Math.abs(dy) < 1.15 * Math.sqrt(Math.max(0, 1 - Math.pow(dx / 3, 2))) && tilt < 1.2 && tilt > -0.2){ if (dx > 0.4 && dx < 0.9) return null; if (Math.abs(dy) < 0.85 * Math.sqrt(Math.max(0, 1 - Math.pow(dx / 3, 2))) && tilt > 0.5) return t > 0.9 ? null : '#2a1810';
              return (Math.floor(tilt * 4) % 2) ? '#5a3a20' : '#4a2e18'; }
            if (Math.hypot(dx + 1, dy) < 0.13 && t < 2.9 && t > 0.4) return '#3a2412'; return null; }); }
      },
      fill:{ on:['stone', 'sand'], trees:0.1, lows:0.32, tree:function(B, x, y, i){ pirPalm(B, x, y, 3.2 + hash(i, seed, 21) * 1.2, i * 7 + seed, seed); },
        low:function(B, x, y, i){ var k = hash(i, seed, 35); if (k < 0.7) rockAt(B, x, y, 0.35 + hash(i, seed, 36) * 0.25, ['#7a766c', '#8e8a80']); else bush(B, x, y, 0.35, ['#5a7a3a', '#6a8a42', '#a8b85a']); } },
      bg:'#2a6f9a', gain:2.4,
      mats:{ sea:['#1f6f9a', '#4ea8d0', '#164f74', 0.05, function(c, R){ var d = c.dep || 0; return R(d < 1 ? '#4ea8d0' : d < 3 ? '#1f6f9a' : '#164f74'); }], foam:['#eef8f8', '#ffffff', '#d6eeee', 0.2],
        sand:['#d8c08a', '#e6d09c', '#c4aa74', 0.14],
        stone:['#8a867c', '#a8a498', '#6a665e', 0.1, function(c, R){ var a = blot(c, 0.22, seed + 3), b = blot(c, 0.09, seed + 4); return R(b > 0.68 ? '#5f7a3a' : a < 0.3 ? '#6e6a62' : a > 0.68 ? '#a29e92' : '#8a867c'); }] }
    };
  }

  /* 5. THE CAPTAIN'S COVE: a lagoon in the arms of the land, the captain's ship at anchor in it, bigger than any other,
     and the treasure camp on the sand: chests heaped with gold, the fire, the torches and the flag. */
  function pirCove(L){
    var E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot;
    function shoreY(x){ var u = (x - L.cx) / Math.max(8, (E[2] - E[0]) * 0.5); return P0[1] - 1.6 + u * u * 4.5 - (vn(x * 0.1, 1, seed) - 0.5) * 1.6; }   // the lagoon curls round
    function sea(x, y){ return shoreY(x) - y; }
    var shipX = L.cx + (hash(seed, 2, 3) < 0.5 ? -1 : 1) * Math.min(5, (E[2] - E[0]) * 0.12), shipY = Math.max(E[1] + 3.2, shoreY(shipX) - 4.8);
    L.used.push({ x:shipX, y:shipY, r:6 });
    var camp = spot(2.2, function(x, y){ return L.side(x) * 4 - Math.abs(y - (P0[1] + P1[1]) / 2) * 0.15 + hash(x | 0, y | 0, seed + 80); }, function(x, y){ return sea(x, y) < -2; });
    var torches = []; for (var i = 0; i < 4; i++){ var tq = spot(0.4, function(x, y){ return -Math.abs(clearAt(x, y) - 1.8) + hash(x * 3 | 0, y * 3 | 0, seed + 50 + i); }, function(x, y){ return sea(x, y) < -1; }); if (tq) torches.push(tq); }
    return {
      h:function(x, y){ var s = sea(x, y); if (s > 0) return -0.2 - Math.min(0.4, s * 0.08); return (fbm(x * 0.09, y * 0.12, seed + 2) - 0.4) * 1.1 * sm(1.2, 5, clearAt(x, y)) * sm(0, 2, -s - 0.6); },
      mat:function(x, y){ var s = sea(x, y); if (s > 0) return s < 0.3 ? ['foam'] : ['lagoon', { dep:s }]; if (s > -0.9) return ['wet']; return ['sand']; },
      build:function(B){
        pirShip(B, shipX, shipY, 1.3, -0.3);
        if (camp){ var X = camp.x, Y = camp.y, zb = B.gz(X, Y);
          if (B.light) B.light(X, Y, zb + 0.5, '#ff8a2a');
          B.solid(X - 0.5, Y - 0.5, zb - 0.05, X + 0.5, Y + 0.5, zb + 0.9, function(px, py, pz){ var r = Math.hypot(px - X, py - Y), t = pz - zb;   // the fire in its ring of stones
            if (t < 0.18 && r > 0.34 && r < 0.48) return '#6e665e'; if (t < 0.12 && r < 0.36) return Math.abs(Math.sin((px - X) * 9)) < 0.3 ? '#3a2412' : '#5a3818';
            if (t >= 0.1 && r < 0.3 * (1 - t / 0.85)) return t < 0.3 ? '#ffd23a' : t < 0.55 ? '#ff8a1a' : '#e5483a'; return null; });
          pirProp(B, X - 1.4, Y - 0.6, 3); pirProp(B, X + 1.3, Y - 0.9, 3); pirProp(B, X + 0.2, Y - 1.6, 1); pirProp(B, X - 1.6, Y + 0.9, 0);
          var fx = X + 1.6, fy = Y + 0.8, fz = B.gz(fx, fy);   // the black flag on its pole
          B.solid(fx - 0.1, fy - 0.1, fz, fx + 1.3, fy + 0.1, fz + 3.2, function(px, py, pz){ var t = pz - fz, dx = px - fx;
            if (Math.hypot(dx, py - fy) < 0.06 && t < 3.1) return '#4a2c16'; if (Math.abs(py - fy) < 0.05 && dx > 0.05 && dx < 1.2 && t > 2.25 && t < 3.0 - dx * 0.05){ var u = dx - 0.6, v = t - 2.65; return (u * u + v * v < 0.035 || (Math.abs(Math.abs(u) - Math.abs(v)) < 0.04 && Math.abs(u) < 0.25 && v < -0.05)) ? '#f4efe2' : '#151218'; } return null; }); }
        torches.forEach(function(p){ var zb = B.gz(p.x, p.y); if (B.light) B.light(p.x, p.y, zb + 1.45, '#ff9a2a');
          B.solid(p.x - 0.2, p.y - 0.2, zb, p.x + 0.2, p.y + 0.2, zb + 1.7, function(px, py, pz){ var t = pz - zb, r = Math.hypot(px - p.x, py - p.y); if (t < 1.3 && r < 0.06) return '#5a3818';
            if (t >= 1.25 && t < 1.65 && r < 0.13 * (1 - (t - 1.25) / 0.45)) return t < 1.4 ? '#ffd23a' : '#ff8a1a'; return null; }); });
      },
      fill:{ on:['sand'], trees:0.42, lows:0.26, tree:function(B, x, y, i){ pirPalm(B, x, y, 4 + hash(i, seed, 21) * 1.8, i * 3 + seed, seed); }, low:function(B, x, y, i){ pirLows(B, x, y, i, seed); } },
      bg:'#1a9ab0', gain:2.4,
      mats:{ sand:['#efd89a', '#f6e4b2', '#dcc384', 0.14], wet:['#cfb67c', '#d8c08a', '#bea46c', 0.1], foam:['#eef8f8', '#ffffff', '#d6eeee', 0.2],
        lagoon:['#2ab4c8', '#7adce8', '#1a8aa8', 0.05, function(c, R){ var d = c.dep || 0; return R(d < 1 ? '#7adce8' : d < 3 ? '#2ab4c8' : '#1a8aa8'); }] }
    };
  }

  // 1. THE LANDING BEACH (and every Pirate Cove hole with no place in the world): the beach, the surf, a ship at anchor off it
  function pirBeach(L){
    var C = L.C, E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot;
    function shoreY(x){ return P0[1] - 1.4 - (vn(x * 0.12, 1, seed) - 0.5) * 2.6; }
    function sea(x, y){ return shoreY(x) - y; }
    var shipX = L.cx + (hash(seed, 2, 3) < 0.5 ? -1 : 1) * Math.min(7, (E[2] - E[0]) * 0.18), shipY = Math.max(E[1] + 2.4, shoreY(shipX) - 5.2);
    var dockX = shipX + (shipX < L.cx ? 5.5 : -5.5);
    L.used.push({ x:shipX, y:shipY, r:5 }); L.used.push({ x:dockX, y:(shoreY(dockX) + E[1]) / 2, r:1.4 });
    var palms = []; for (var i = 0; i < 8; i++){ var p = spot(1, function(x, y){ return L.side(x) * 4 - Math.abs(y - shoreY(x) - 3.5) * 0.6 + hash(x * 2 | 0, y * 2 | 0, seed + i); }, function(x, y){ return sea(x, y) < -1.5; }); if (p) palms.push(p); }
    var props = []; for (i = 0; i < 5; i++){ var q = spot(0.7, function(x, y){ return -Math.abs(clearAt(x, y) - 2.2) * 0.8 + hash(x * 3 | 0, y * 3 | 0, seed + 9 + i); }, function(x, y){ return sea(x, y) < -1.2; }); if (q) props.push(q); }
    function palm(B, x, y, H, k){ var zb = B.gz(x, y), lean = (hash(k, seed, 4) - 0.5) * 1.2, top = [x + lean, y - 0.3, zb + H];
      B.vox(x - 3.2, y - 2.8, zb, x + 3.2, y + 2.6, zb + H + 0.8, function(set){ for (var s = 0; s < 8; s++){ var t0 = s / 8, t1 = (s + 1) / 8; B.tube(set, x + lean * t0 * t0, y - 0.3 * t0, zb + H * t0, x + lean * t1 * t1, y - 0.3 * t1, zb + H * t1, 0.2 - t0 * 0.06, 0.2 - t1 * 0.06, s % 2 ? '#8a6a3e' : '#7a5c34'); }
        for (var f = 0; f < 7; f++){ var a = f / 7 * 6.28 + k, fx = Math.cos(a), fy = Math.sin(a) * 0.7; for (var al = 0; al < 2.5; al += set.st){ var sag = 0.35 - al * al * 0.22, wd = 0.37 * (1 - al / 2.7); for (var o = -wd; o <= wd; o += set.st) set(top[0] + fx * al - fy * o, top[1] + fy * al + fx * o, top[2] + sag, al > 1.5 ? '#3f9a46' : '#2f8139'); } } }, B.ART); }
    return {
      h:function(x, y){ var s = sea(x, y); if (s > 0) return -0.2 - Math.min(0.4, s * 0.1); return (fbm(x * 0.09, y * 0.12, seed + 2) - 0.4) * 1.2 * sm(1.2, 5, clearAt(x, y)) * sm(0, 2, -s - 0.6); },
      mat:function(x, y){ var s = sea(x, y); if (s > 0) return s < 0.35 ? ['foam'] : ['sea', { dep:s }]; if (s > -0.9) return ['wet']; return ['sand']; },
      build:function(B){
        (function(){ var X = shipX, Y = shipY, Lh = 4.8, Wh = 1.5, zw = -0.25;   // the ship at anchor: a hull, a deck, two masts, sails and her flag
          B.solid(X - Lh - 0.6, Y - Wh - 0.4, zw - 0.4, X + Lh + 0.6, Y + Wh + 0.4, zw + 9.2, function(px, py, pz){ var dx = px - X, dy = py - Y, t = pz - zw;
            var u = dx / Lh, hw = Wh * Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, Math.abs(u) - 0.35) / 0.65, 2)));
            if (t < 1.5){ if (Math.abs(u) > 1 || Math.abs(dy) > hw * (0.7 + t / 5)) return null; if (t > 1.32) return '#c9a227'; if (Math.abs(t - 0.9) < 0.08) return '#2a1810'; if (Math.abs(t - 0.9) < 0.3 && Math.abs((dx % 1.1 + 1.1) % 1.1 - 0.55) < 0.14 && dy > hw * 0.6) return '#111'; return (Math.floor(t * 4) % 2) ? '#6b4426' : '#5a3818'; }
            if (t < 1.65) return (Math.abs(u) < 0.95 && Math.abs(dy) < hw) ? '#a0703c' : null;
            for (var m = -1; m <= 1; m += 2){ var mx = X + m * 1.6, mt = m < 0 ? 7.6 : 8.6; if (Math.hypot(px - mx, py - Y) < 0.12 && t < mt) return '#4a2c16';
              var sw = 1.6 - (t - 2.4) * 0.05; if (Math.abs(py - Y) < 0.08 && Math.abs(px - mx) < sw && t > 2.4 && t < mt - 1){ var band = Math.floor((t - 2.4) / 1.05); return band % 2 ? '#f4efe2' : '#e3d8bd'; } }
            if (t > 8.6 && t < 9.2 && px > X + 1.6 && px < X + 2.6 && Math.abs(py - Y) < 0.06) return (Math.hypot(px - X - 2.05, t - 8.9) < 0.14) ? '#f4efe2' : '#111';
            return null; }); })();
        (function(){ var x = dockX, y0 = shoreY(x) + 0.6, y1 = Math.max(E[1] + 0.6, shipY + 1), zt = 0.5;   // the dock out to the ship
          B.solid(x - 0.9, y1, -0.6, x + 0.9, y0, zt + 0.9, function(px, py, pz){ var dx = px - x;
            if (Math.abs(dx) < 0.8 && pz > zt - 0.12 && pz < zt) return (Math.floor(py * 3) % 2) ? '#9a6a3e' : '#86592f';
            if (Math.abs(Math.abs(dx) - 0.7) < 0.09 && ((py % 1.6 + 1.6) % 1.6) < 0.18 && pz < zt + 0.7) return '#4a2c16'; return null; }); })();
        palms.forEach(function(p, i){ palm(B, p.x, p.y, 4 + hash(i, seed, 3) * 1.8, i + seed); });
        props.forEach(function(p, i){ var zb = B.gz(p.x, p.y), k = i % 3;
          if (k === 0) B.solid(p.x - 0.45, p.y - 0.45, zb, p.x + 0.45, p.y + 0.45, zb + 1, function(px, py, pz){ var r = Math.hypot(px - p.x, py - p.y), t = pz - zb, R = 0.38 + Math.sin(t / 0.95 * 3.14) * 0.06; if (r > R || t > 0.95) return null; return (Math.abs(t - 0.2) < 0.05 || Math.abs(t - 0.75) < 0.05) ? '#3d3a3a' : (Math.floor(Math.atan2(py - p.y, px - p.x) * 3 + 9) % 2 ? '#9a6236' : '#b07440'); });
          else if (k === 1) B.solid(p.x - 0.6, p.y - 0.4, zb, p.x + 0.6, p.y + 0.4, zb + 0.9, function(px, py, pz){ var dx = px - p.x, dy = py - p.y, t = pz - zb; if (Math.abs(dx) > 0.55 || Math.abs(dy) > 0.35) return null;
            if (t > 0.5 && Math.hypot(dy, t - 0.5) > 0.36) return null; if (Math.abs(t - 0.5) < 0.04 || Math.abs(Math.abs(dx) - 0.35) < 0.05) return '#c9a227'; return t > 0.5 ? '#7a4a24' : '#8f5a2c'; });
          else B.solid(p.x - 0.8, p.y - 0.5, zb, p.x + 0.8, p.y + 0.5, zb + 0.8, function(px, py, pz){ var dx = px - p.x, dy = py - p.y, t = pz - zb;
            if (Math.abs(dy) < 0.12 && t > 0.25 && t < 0.55 && dx > -0.7 && dx < 0.5) return Math.hypot(dy, t - 0.4) < 0.12 ? '#45454c' : null; if (dx > 0.45 && dx < 0.7 && Math.hypot(dy, t - 0.4) < 0.22) return '#2c2c30';
            if (Math.abs(Math.abs(dy) - 0.3) < 0.07 && Math.hypot(dx + 0.3, t - 0.25) < 0.25) return '#5a3818'; return null; }); });
      },
      fill:{ on:['sand'], trees:0.28, lows:0.25, tree:function(B, x, y, i){ palm(B, x, y, 3.8 + hash(i, seed, 21) * 1.6, i * 3 + seed); },
        low:function(B, x, y, i){ var k = hash(i, seed, 23); if (k < 0.5) rockAt(B, x, y, 0.38, ['#7d756c', '#8e867b']); else bush(B, x, y, 0.4, ['#3f9a46', '#2f8139', '#a8c25a']); } },
      bg:'#1677b5', gain:2.6,
      mats:{ sand:['#e9d08f', '#f1dca4', '#d9bd7c', 0.14], wet:['#c9ae74', '#d2b882', '#b99d64', 0.1], foam:['#eef8f8', '#ffffff', '#d6eeee', 0.2],
        sea:['#1a86c4', '#5ec0e8', '#136a9e', 0.05, function(c, R){ var d = c.dep || 0; return R(d < 1.2 ? '#5ec0e8' : d < 3.5 ? '#1a86c4' : '#136a9e'); }] }
    };
  };

  /* ---------------- CANYON MINE: red mesas behind the hole, the mine's mouth in the rock, a rail line with a cart, cacti and boulders */
  BUILD.canyon = function(L){
    var C = L.C, E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot, spotRect = L.spotRect, north = L.north;
    var mine = spotRect(5, 3, function(x, y){ return north(x, y) * 1.4 - Math.abs(x - L.cx) * 0.3; });
    function cliffY(x){ return (mine ? mine.y - 0.4 : P0[1] - 3.5) - (vn(x * 0.15, 3, seed) - 0.5) * 2.4; }
    var rail = mine ? L.route([mine.x, mine.y + mine.d / 2 + 0.2], [mine.x + (mine.x < L.cx ? -9 : 9), P1[1] + 2], seed + 6, 0.6) : null;
    if (mine) L.used.push({ x:mine.x, y:mine.y + 2.2, r:1.8 });
    var dR = L.dist(rail); function onRail(x, y){ return dR(x, y) < 0.55; }
    var cart = rail && rail.length > 3 ? rail[3] : null; if (cart) L.used.push({ x:cart[0], y:cart[1], r:1 });
    var cacti = []; for (var i = 0; i < 9; i++){ var c = spot(0.7, function(x, y){ return L.side(x) * 2 + Math.min(L.far(x, y), 5) * 0.4 + hash(x * 2 | 0, y * 2 | 0, seed + i); }, function(x, y){ return !onRail(x, y) && y > cliffY(x) + 1.5; }); if (c) cacti.push(c); }
    function cactus(B, x, y, H, k){ var zb = B.gz(x, y);
      B.vox(x - 1.2, y - 0.5, zb, x + 1.2, y + 0.5, zb + H + 0.3, function(set){ B.tube(set, x, y, zb, x, y, zb + H, 0.28, 0.24, '#2f7034');
        var hs = [0.45, 0.62]; for (var a = 0; a < 2; a++){ var s = a ? 1 : -1, hz = zb + H * hs[a]; B.tube(set, x, y, hz, x + s * 0.7, y, hz, 0.17, 0.17, '#2f7034'); B.tube(set, x + s * 0.7, y, hz, x + s * 0.7, y, hz + H * 0.32, 0.17, 0.15, '#3f8a3e'); }
        B.blob(set, x, y, zb + H, 0.24, 0.24, 0.18, hash(k, seed, 5) < 0.4 ? '#ff7aa8' : '#3f8a3e'); }, B.ART); }
    return {
      h:function(x, y){ var cy = cliffY(x), z = (fbm(x * 0.07, y * 0.07, seed) - 0.45) * 1.6 * sm(1.5, 7, clearAt(x, y)); var k = sm(0.8, 3, clearAt(x, y)); if (y < cy) return (3.6 + (fbm(x * 0.2, y * 0.2, seed + 3) - 0.5) * 0.8 + Math.min(2.5, (cy - y) * 0.25)) * k; if (y < cy + 1.2) return z + (cy + 1.2 - y) * 3 * k; if (onRail(x, y)) return z * 0.4; return z; },
      mat:function(x, y){ var cy = cliffY(x); if (y < cy + 1.2) return ['rock', { z:cy - y }]; if (onRail(x, y)) return dR(x, y) < 0.3 ? ['rail'] : ['ballast']; return ['dirt']; },
      build:function(B){
        if (mine){ var X = mine.x, Y = mine.y + 0.9, zb = B.gz(X, Y + 0.6);   // timber frame round the mouth of the mine
          B.solid(X - 1.8, Y - 0.6, zb - 0.1, X + 1.8, Y + 0.6, zb + 3.2, function(px, py, pz){ var dx = Math.abs(px - X), t = pz - zb; if (Math.abs(py - Y) > 0.5) return null;
            if (dx < 1.05 && t < 2.3) return py - Y < 0.2 ? '#120c08' : null; if (dx < 1.45 && t > 2.3 && t < 2.75) return '#8a5a30'; if (dx > 1.05 && dx < 1.45 && t < 2.75) return '#7a4a24';
            if (dx < 0.8 && t > 2.75 && t < 3.1) return Math.abs(px - X) < 0.75 ? '#e9d8a6' : null; return null; });
          B.solid(X - 0.5, Y + 0.5, zb + 2.6, X + 0.5, Y + 0.7, zb + 3, function(px, py, pz){ return '#e9d8a6'; }); }
        if (cart){ var cx = cart[0], cy2 = cart[1], cz = B.gz(cx, cy2);
          B.solid(cx - 0.8, cy2 - 0.6, cz, cx + 0.8, cy2 + 0.6, cz + 1.2, function(px, py, pz){ var dx = px - cx, dy = py - cy2, t = pz - cz;
            if (t < 0.3) return (Math.abs(Math.abs(dy) - 0.4) < 0.12 && Math.abs(Math.abs(dx) - 0.45) < 0.22) ? '#2a2a2e' : null; if (Math.abs(dx) > 0.7 || Math.abs(dy) > 0.5) return null;
            if (t > 0.95) return (Math.abs(dx) < 0.6 && Math.abs(dy) < 0.4) ? (hash(px * 9 | 0, py * 9 | 0, 3) < 0.3 ? '#c9a227' : '#6a5e52') : '#3d3a3a'; return (Math.abs(t - 0.62) < 0.05) ? '#3d3a3a' : '#8a5432'; }); }
        cacti.forEach(function(c, i){ cactus(B, c.x, c.y, 1.4 + hash(i, seed, 9) * 1.2, i); });
      },
      fill:{ on:['dirt'], trees:0.12, lows:0.32, tree:function(B, x, y, i){ cactus(B, x, y, 1.3 + hash(i, seed, 41) * 1.1, i + 50); },
        low:function(B, x, y, i){ var k = hash(i, seed, 43); if (k < 0.55) rockAt(B, x, y, 0.42, ['#b8693e', '#9a5534']); else bush(B, x, y, 0.35, ['#8a8a4a', '#6f7a3a', '#a0a05a']); } },
      gain:1.6,
      mats:{ dirt:['#c27a4a', '#cc8656', '#b26c3e', 0.18], ballast:['#7a6a5a', '#8a7a6a', '#6a5a4a', 0.4], rail:['#5a4a3a', '#8a8a90', '#4a3a2a', 0.0, function(c, R){ return R((c.tj % 3) === 0 ? '#6a4a2a' : ((c.ti % 4) === 0 ? '#9a9aa2' : '#7a6a5a')); }],
        rock:['#a95a35', '#c27a4a', '#8a4428', 0.2, function(c, R){ var z = c.z || 0; return R(((Math.floor(z * 2.2 + c.ti * 0.05) % 3) + 3) % 3 === 0 ? '#c9874e' : (((Math.floor(z * 2.2) % 2) + 2) % 2 ? '#a95a35' : '#93492b')); }] }
    };
  };

  /* ---------------- VOLCANO ISLAND: the volcano behind the hole with lava running off it, black sand, lava pools, palms and tiki torches */
  BUILD.volcano = function(L){
    var C = L.C, E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot, north = L.north;
    var vx = L.cx + (hash(seed, 5, 1) - 0.5) * 6, vy = E[1] + 1, vr = Math.max(3, Math.min(9, P0[1] - E[1] - 1));
    function cone(x, y){ var d = Math.hypot((x - vx) / 1.15, (y - vy) * 1.1); return Math.max(0, vr - d); }
    var pools = []; for (var i = 0; i < 3; i++){ var p = spot(1.3, function(x, y){ return Math.abs(x - L.cx) * 0.4 + hash(x * 2 | 0, y * 2 | 0, seed + i) * 2; }, function(x, y){ return cone(x, y) < 0.5; }); if (p) pools.push(p); }
    var torches = []; for (i = 0; i < 6; i++){ var t = spot(0.4, function(x, y){ return -Math.abs(clearAt(x, y) - 1.9) * 1.2 + hash(x * 3 | 0, y * 3 | 0, seed + 20 + i); }, function(x, y){ return cone(x, y) < 0.3; }); if (t) torches.push(t); }
    var palms = []; for (i = 0; i < 7; i++){ var q = spot(1, function(x, y){ return L.side(x) * 4 + Math.min(L.far(x, y), 5) * 0.3 + hash(x * 2 | 0, y * 2 | 0, seed + 40 + i); }, function(x, y){ return cone(x, y) < 0.3; }); if (q) palms.push(q); }
    function poolD(x, y){ var m = -1; pools.forEach(function(p){ m = Math.max(m, 1 - Math.hypot((x - p.x) / p.r, (y - p.y) / (p.r * 0.75)) + (fbm(x * 0.7, y * 0.7, seed + 9) - 0.5) * 0.3); }); return m; }
    function stream(x, y){ var off = (vn(y * 0.25, 2, seed) - 0.5) * 2.2; return cone(x, y) > 0.8 && Math.abs(x - vx - off) < 0.35 + cone(x, y) * 0.03 && y > vy; }
    function palm(B, x, y, H, k){ var zb = B.gz(x, y), lean = (hash(k, seed, 4) - 0.5) * 1.2, top = [x + lean, y - 0.3, zb + H];
      B.vox(x - 3.2, y - 2.8, zb, x + 3.2, y + 2.6, zb + H + 0.8, function(set){ for (var s = 0; s < 8; s++){ var t0 = s / 8, t1 = (s + 1) / 8; B.tube(set, x + lean * t0 * t0, y - 0.3 * t0, zb + H * t0, x + lean * t1 * t1, y - 0.3 * t1, zb + H * t1, 0.2 - t0 * 0.06, 0.2 - t1 * 0.06, s % 2 ? '#5a4a3a' : '#4a3a2a'); }
        for (var f = 0; f < 7; f++){ var a = f / 7 * 6.28 + k, fx = Math.cos(a), fy = Math.sin(a) * 0.7; for (var al = 0; al < 2.4; al += set.st){ var sag = 0.35 - al * al * 0.22, wd = 0.36 * (1 - al / 2.6); for (var o = -wd; o <= wd; o += set.st) set(top[0] + fx * al - fy * o, top[1] + fy * al + fx * o, top[2] + sag, al > 1.5 ? '#3a8a3e' : '#2a6f32'); } } }, B.ART); }
    return {
      h:function(x, y){ var c = cone(x, y), z = (fbm(x * 0.07, y * 0.07, seed) - 0.45) * 1.4 * sm(1.5, 7, clearAt(x, y)); if (c > 0) z += (Math.min(c, vr - 1.6) * 0.95 - (c > vr - 1.6 ? (c - vr + 1.6) * 1.2 : 0)) * sm(1, 4, clearAt(x, y)); if (poolD(x, y) > 0) return -0.15; return z; },
      mat:function(x, y){ var c = cone(x, y); if (c > vr - 1.4) return ['crater']; if (stream(x, y)) return ['lava']; if (c > 0.4) return ['basalt', { c:c }]; if (poolD(x, y) > 0) return ['lava']; if (poolD(x, y) > -0.15) return ['crust']; return ['ash']; },
      build:function(B){
        torches.forEach(function(t){ var zb = B.gz(t.x, t.y); B.solid(t.x - 0.25, t.y - 0.25, zb, t.x + 0.25, t.y + 0.25, zb + 2, function(px, py, pz){ var r = Math.hypot(px - t.x, py - t.y), tt = pz - zb;
          if (tt < 1.45) return r < 0.07 ? '#5a3818' : null; if (tt < 1.62) return r < 0.14 ? '#3d2614' : null; return r < 0.15 * (1 - (tt - 1.62) / 0.38) ? (tt > 1.8 ? '#ffd25a' : '#ff7a1a') : null; }); });
        palms.forEach(function(p, i){ palm(B, p.x, p.y, 3.8 + hash(i, seed, 3) * 1.6, i + seed); });
      },
      after:function(ctx, V){ ctx.globalAlpha = 0.12; ctx.fillStyle = '#ff6a1a';   // the glow over the crater and the lava
        var q = V.pr(vx, vy, vr * 0.95); ctx.beginPath(); ctx.arc(q[0], q[1], 26, 0, 6.28); ctx.fill(); ctx.globalAlpha = 1; },
      fill:{ on:['ash'], trees:0.22, lows:0.3, tree:function(B, x, y, i){ palm(B, x, y, 3.6 + hash(i, seed, 51) * 1.5, i * 5 + seed); },
        low:function(B, x, y, i){ var k = hash(i, seed, 53); if (k < 0.65) rockAt(B, x, y, 0.42, ['#332c30', '#4a4246']); else bush(B, x, y, 0.38, ['#2a6f32', '#3a8a3e', '#1f5a28']); } },
      bg:'#1f1a1d', gain:1.2,
      mats:{ ash:['#3a3236', '#433a3f', '#2e272b', 0.2], crust:['#2a2124', '#5a2a18', '#1f1a1d', 0.25], basalt:['#2e292e', '#3a343a', '#232023', 0.25],
        lava:['#ff6a1a', '#ffd25a', '#e04a10', 0.06, function(c, R, h3){ return R(h3(c.ti, c.tj, 7) < 0.12 ? '#ffd25a' : (((c.ti + c.tj * 2) % 9) === 0 ? '#ff9a3a' : '#ff6a1a')); }],
        crater:['#5a1a08', '#ff6a1a', '#3a1206', 0.3, function(c, R, h3){ return R(h3(c.ti, c.tj, 9) < 0.35 ? '#ff6a1a' : '#5a1a08'); }] }
    };
  };

  /* ---------------- DINO VALLEY: a sandstone cliff behind the hole with a fossil in its layers, a swamp beside it, a long neck or two grazing, palms and ferns */
  BUILD.dino = function(L){
    var C = L.C, E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot, north = L.north;
    function cliffY(x){ return P0[1] - 3.4 - (vn(x * 0.13, 4, seed) - 0.5) * 3; }
    var sw = spot(2.8, function(x, y){ return Math.abs(x - L.cx) * 0.4 + L.side(x) * 3; }, function(x, y){ return y > cliffY(x) + 3; });
    function swD(x, y){ return sw ? 1 - Math.hypot((x - sw.x) / sw.r, (y - sw.y) / (sw.r * 0.7)) + (fbm(x * 0.6, y * 0.6, seed + 3) - 0.5) * 0.3 : -1; }
    var herd = []; for (var i = 0; i < 2; i++){ var m = spot(1.6, function(x, y){ return north(x, y) * 0.4 + L.side(x) * 2 + hash(x | 0, y | 0, seed + 9 + i); }, function(x, y){ return y > cliffY(x) + 2 && swD(x, y) < -0.3; }); if (m) herd.push(m); }
    // a long neck: a heavy body on four legs, the neck rising to a small head, the tail sweeping down behind
    function longneck(B, X, Y, k){ var zb = B.gz(X, Y), dir = hash(k, 3, seed) < 0.5 ? 1 : -1;
      B.solid(X - 2.6, Y - 0.7, zb, X + 2.6, Y + 0.7, zb + 4.2, function(px, py, pz){ var dx = (px - X) * dir, dy = py - Y, t = pz - zb, skin = (Math.floor(px * 6) + Math.floor(pz * 6)) % 3 ? '#6e8458' : '#7e9466';
        if (t < 1.1 && Math.abs(Math.abs(dx + 0.2) - 0.7) < 0.2 && Math.abs(Math.abs(dy) - 0.33) < 0.18) return '#4a5a3a';
        if (Math.hypot((dx + 0.2) / 1.25, dy / 0.6, (t - 1.55) / 0.68) < 1) return t < 1.15 ? '#9aa880' : skin;
        var nx = 0.9 + (t - 1.7) * 0.42; if (t > 1.7 && t < 3.8 && Math.abs(dy) < 0.22 && Math.abs(dx - nx) < 0.26) return skin;
        if (Math.hypot((dx - 1.95) / 0.4, dy / 0.22, (t - 3.9) / 0.22) < 1) return skin;
        var tx = -1.3 - (t < 1.7 ? (1.7 - t) * 0.9 : 0); if (dx < -1.2 && dx > -2.6 && Math.abs(dy) < 0.18 && Math.abs(dx - tx) < 0.3 && t > 0.2 && t < 1.8) return skin;
        return null; }); }
    function palm(B, x, y, H, k){ var zb = B.gz(x, y), lean = (hash(k, seed, 4) - 0.5) * 1.2, top = [x + lean, y - 0.3, zb + H];
      B.vox(x - 3.2, y - 2.8, zb, x + 3.2, y + 2.6, zb + H + 0.8, function(set){ for (var s = 0; s < 8; s++){ var t0 = s / 8, t1 = (s + 1) / 8; B.tube(set, x + lean * t0 * t0, y - 0.3 * t0, zb + H * t0, x + lean * t1 * t1, y - 0.3 * t1, zb + H * t1, 0.2 - t0 * 0.06, 0.2 - t1 * 0.06, s % 2 ? '#8a6a3e' : '#7a5c34'); }
        for (var f = 0; f < 7; f++){ var a = f / 7 * 6.28 + k, fx = Math.cos(a), fy = Math.sin(a) * 0.7; for (var al = 0; al < 2.5; al += set.st){ var sag = 0.35 - al * al * 0.22, wd = 0.37 * (1 - al / 2.7); for (var o = -wd; o <= wd; o += set.st) set(top[0] + fx * al - fy * o, top[1] + fy * al + fx * o, top[2] + sag, al > 1.5 ? '#3f9a46' : '#2f8139'); } } }, B.ART); }
    function fernAt(B, x, y, k){ var zb = B.gz(x, y), r = 0.55 + hash(k, seed, 61) * 0.3;
      B.solid(x - r, y - r, zb, x + r, y + r, zb + r * 1.2, function(px, py, pz){ var dx = px - x, dy = py - y, t = pz - zb, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
        if (d > r || t > r * 1.2 * (1 - d / r * 0.6)) return null; if (Math.abs(Math.sin(a * 3.5)) > 0.55) return null; return d < r * 0.4 ? '#2a5a1c' : '#3e7a28'; }); }
    return {
      h:function(x, y){ var cy = cliffY(x), k = sm(0.8, 3, clearAt(x, y)); if (y < cy) return (2.4 + Math.min(5, (cy - y) * 0.85)) * k; if (swD(x, y) > 0) return -0.06; return (fbm(x * 0.07, y * 0.09, seed) - 0.42) * 1.4 * sm(1.3, 6, clearAt(x, y)); },
      mat:function(x, y){ var cy = cliffY(x); if (y < cy) return ['cliff', { z:cy - y, x:x }]; var t = swD(x, y); if (t > 0) return ['swamp', { dep:t }]; if (t > -0.14) return ['mudrim']; return ['jungle']; },
      build:function(B){ herd.forEach(function(m, k){ longneck(B, m.x, m.y, k); }); },
      fill:{ on:['jungle'], trees:0.45, lows:0.34,
        tree:function(B, x, y, i){ if (hash(i, seed, 51) < 0.6) palm(B, x, y, 2.6 + hash(i, seed, 54) * 1.6, i); else broadTree(B, x, y, 3 + hash(i, seed, 55) * 1.4, '#5a4026', ['#2e6a22', '#3a7a2a', '#24561c'], i); },
        low:function(B, x, y, i){ var k = hash(i, seed, 52); if (k < 0.55) fernAt(B, x, y, i); else if (k < 0.8) bush(B, x, y, 0.42, ['#3a7a2a', '#2e6a22', '#24561c']); else rockAt(B, x, y, 0.38, ['#c9a46a', '#7a5a34']); } },
      bg:'#b8d08a', gain:1.8,
      mats:{ jungle:['#5e7a2e', '#6e8a36', '#4e6a26', 0.18], mudrim:['#7a5a34', '#8a6a40', '#6a4a2a', 0.1],
        // the cliff: sandstone in bands, and now and then a white bone in a band
        cliff:['#c9a46a', '#e8cc92', '#9a7a48', 0.2, function(c, R, h3){ var z = c.z || 0, band = Math.floor(z * 1.6 + h3(c.ti >> 2, 0, 3) * 0.5) % 4;
          if (band === 2 && z < 3.2 && h3(c.ti >> 1, c.tj >> 1, 7) < 0.015) return R('#e8dcc0'); return R(z > 4.2 ? '#5e7a2e' : ['#c9a46a', '#b8935a', '#d8b47a', '#a8834e'][band]); }],
        swamp:['#4a6a2e', '#86a454', '#3a5824', 0.1, function(c, R){ return R((c.dep || 0) < 0.12 ? '#3a5824' : (((c.ti * 5 + c.tj * 3) % 19) === 0 ? '#86a454' : '#4a6a2e')); }] }
    };
  };

  /* ---------------- SKY ISLANDS: the island the hole is on, with its edge falling away to the clouds; a castle tower behind, balloons over the drop */
  BUILD.sky = function(L){
    var C = L.C, E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot, north = L.north;
    function edge(x, y){ return 3.2 + (fbm(x * 0.18, y * 0.18, seed) - 0.5) * 2.4; }
    function island(x, y){ return clearAt(x, y) < edge(x, y); }
    var tower = spot(1.4, function(x, y){ return north(x, y) * 1.2 - Math.abs(x - L.cx) * 0.3; }, function(x, y){ return island(x, y); });
    var balloons = []; for (var i = 0; i < 3; i++){ var b = spot(0.9, function(x, y){ return clearAt(x, y) * 0.3 + hash(x * 2 | 0, y * 2 | 0, seed + i * 7); }, function(x, y){ return !island(x, y); }); if (b) balloons.push(b); }
    return {
      h:function(x, y){ var c = clearAt(x, y), e = edge(x, y); if (c < e) return (fbm(x * 0.1, y * 0.1, seed + 2) - 0.45) * 0.8 * sm(1, 3, c); return -3 - (c - e) * 0.4 + (fbm(x * 0.3, y * 0.3, seed + 9) - 0.5) * 1.4; },
      mat:function(x, y){ var c = clearAt(x, y), e = edge(x, y); if (c < e - 0.5) return ['grass']; if (c < e) return ['cliff']; return ['cloud']; },
      build:function(B){
        if (tower){ var X = tower.x, Y = tower.y, zb = B.gz(X, Y);
          B.solid(X - 1.6, Y - 1.6, zb - 0.1, X + 1.6, Y + 1.6, zb + 6.4, function(px, py, pz){ var r = Math.hypot(px - X, py - Y), t = pz - zb;
            if (t < 4.2) return r < 1.1 ? ((Math.abs(t - 2.6) < 0.35 && py - Y > 0.7 && Math.abs(px - X) < 0.25) ? '#2a3a5a' : (Math.floor(t * 2.4) % 2 ? '#f4efe2' : '#e3dccb')) : null;
            if (t < 4.6) return r < 1.35 ? '#d9d2bd' : null; var rr = 1.35 * (1 - (t - 4.6) / 1.8); return r < rr ? (r > rr - 0.25 ? '#c0392b' : '#e74c3c') : null; }); }
        balloons.forEach(function(b, i){ var X = b.x, Y = b.y, zb = B.gz(X, Y) + 3.5 + i * 0.6, cols = [['#ff5a3c', '#ffd23f'], ['#3fa7e0', '#ffffff'], ['#7dd56f', '#ffd23f']][i % 3];
          B.solid(X - 0.9, Y - 0.9, zb, X + 0.9, Y + 0.9, zb + 2.6, function(px, py, pz){ var t = pz - zb, r = Math.hypot(px - X, py - Y);
            if (t < 0.4) return r < 0.32 ? '#7a5232' : null; if (t < 0.9) return (r < 0.06 + (t - 0.4) * 0.3 && r > (t - 0.4) * 0.3 - 0.02) ? '#5a4a3a' : null;
            var c = Math.hypot(r / 0.85, (t - 1.75) / 0.85); return c < 1 ? cols[Math.floor((Math.atan2(py - Y, px - X) + 3.2) * 1.6) % 2] : null; }); });
      },
      fill:{ on:['grass'], trees:0.3, lows:0.22, tree:function(B, x, y, i){ broadTree(B, x, y, 2.6 + hash(i, seed, 31) * 1.2, '#6a4a2a', ['#3f9a46', '#2f8139', '#5bb352'], i); },
        low:function(B, x, y, i){ var k = hash(i, seed, 33); if (k < 0.6) bush(B, x, y, 0.4, ['#3f9a46', '#5bb352', '#f4a7c0']); else rockAt(B, x, y, 0.36, ['#d9d2bd', '#b0a88f']); } },
      bg:'#8fcdf3', gain:2,
      mats:{ grass:['#5fb24e', '#6cbf58', '#4f9e42', 0.18], cliff:['#9a7a52', '#b08e62', '#7a5e3e', 0.3],
        cloud:['#ffffff', '#eef6fc', '#d6e8f6', 0.2, function(c, R, h3){ return R(h3(c.ti >> 1, c.tj >> 1, 3) < 0.25 ? '#e3f0fa' : (h3(c.ti, c.tj, 5) < 0.1 ? '#cfe3f3' : '#ffffff')); }] }
    };
  };

  /* ---------------- NEON ARCADE: a dark arcade floor with a glowing grid, rows of cabinets behind the hole, neon arches and posts */
  BUILD.neon = function(L){
    var C = L.C, E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot, north = L.north;
    var cabs = []; for (var i = 0; i < 9; i++){ var c = spot(0.9, function(x, y){ return north(x, y) * 1.4 - Math.abs(x - L.cx) * 0.1 + hash(x * 2 | 0, y * 2 | 0, seed + i); }); if (c) cabs.push(c); }
    var posts = []; for (i = 0; i < 6; i++){ var p = spot(0.35, function(x, y){ return -Math.abs(clearAt(x, y) - 1.8) * 1.2 + hash(x * 3 | 0, y * 3 | 0, seed + 20 + i); }); if (p) posts.push(p); }
    var GLOWS = ['#ff2bd6', '#00e5ff', '#39ff14', '#ffe600'];
    return {
      h:function(x, y){ return 0; },
      mat:function(x, y){ var gx = Math.abs(((x * 0.5) % 1 + 1) % 1 - 0.5), gy = Math.abs(((y * 0.5) % 1 + 1) % 1 - 0.5); if (clearAt(x, y) > 1 && (gx < 0.05 || gy < 0.05)) return ['grid']; return ['floor']; },
      build:function(B){
        cabs.forEach(function(c, k){ var X = c.x, Y = c.y, zb = B.gz(X, Y), g = GLOWS[k % 4];
          B.solid(X - 0.7, Y - 0.6, zb, X + 0.7, Y + 0.6, zb + 2.4, function(px, py, pz){ var dx = px - X, dy = py - Y, t = pz - zb; if (Math.abs(dx) > 0.62 || Math.abs(dy) > 0.5) return null;
            if (dy > 0.3 && t > 1.2 && t < 1.9 && Math.abs(dx) < 0.45) return (Math.floor(t * 8) % 2) ? g : '#ffffff'; if (t > 2.15) return g; if (dy > 0.3 && Math.abs(t - 1.0) < 0.08 && Math.abs(dx) < 0.4) return '#ffe600';
            return Math.abs(dx) > 0.55 ? g : '#1a0f33'; }); });
        posts.forEach(function(p, k){ var zb = B.gz(p.x, p.y), g = GLOWS[(k + 1) % 4];
          B.solid(p.x - 0.2, p.y - 0.2, zb, p.x + 0.2, p.y + 0.2, zb + 1.6, function(px, py, pz){ var r = Math.hypot(px - p.x, py - p.y), t = pz - zb; if (t > 1.3) return r < 0.2 ? '#ffffff' : null; return r < 0.09 ? g : null; }); });
      },
      after:function(ctx, V){ ctx.globalAlpha = 0.08; ctx.fillStyle = '#ff2bd6'; cabs.forEach(function(c){ var q = V.pr(c.x, c.y, 1.4); ctx.beginPath(); ctx.arc(q[0], q[1], 14, 0, 6.28); ctx.fill(); }); ctx.globalAlpha = 1; },
      bg:'#0d0b1e', gain:0.7,
      mats:{ floor:['#0b0920', '#0e0b26', '#08071a', 0.15], grid:['#7a1a96', '#9a2ab8', '#5a1070', 0.1] }
    };
  };

  /* ---------------- SCHOOLYARD: the blacktop round the hole with its court lines, the school behind, a swing set and a few kickballs on the grass */
  BUILD.school = function(L){
    var C = L.C, E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot, spotRect = L.spotRect, north = L.north;
    var sch = spotRect(8, 5, function(x, y){ return north(x, y) * 1.1 - Math.abs(x - L.cx) * 0.2; });
    function topW(x, y){ return 3 + (fbm(x * 0.2, y * 0.2, seed + 4) - 0.5) * 0.8; }
    var swing = spot(1.8, function(x, y){ return north(x, y) * 0.6 + L.side(x) * 3 + hash(x | 0, y | 0, seed + 3); }, function(x, y){ return clearAt(x, y) > topW(x, y) + 1.5; });
    var balls = []; for (var i = 0; i < 3; i++){ var b = spot(0.35, function(x, y){ return -Math.abs(clearAt(x, y) - 2) * 1.2 + hash(x * 3 | 0, y * 3 | 0, seed + 30 + i); }); if (b) balls.push(b); }
    return {
      h:function(x, y){ return (fbm(x * 0.08, y * 0.08, seed) - 0.45) * 0.6 * sm(3.5, 7, clearAt(x, y)); },
      mat:function(x, y){ var c = clearAt(x, y), w = topW(x, y); if (c < w){ if (Math.abs(c - 2.2) < 0.07 || (Math.abs(((x + 40) % 4) - 2) < 0.06 && c > 1.2 && c < 2.2)) return ['line']; return ['top']; } return ['grass']; },
      build:function(B){
        if (sch){ var d = sch.d;
          house(B, sch, { wh:2.6, rh:1.2, step:'#8a8f99',
            wall:function(dx, dy, t){ if (dy > d / 2 - 0.15 && Math.abs(dx) < 0.55 && t < 1.8) return '#2b6a95';
              if (dy > d / 2 - 0.15 && Math.abs(Math.abs(dx) - 2.3) < 0.6 && t > 0.9 && t < 1.9) return Math.abs(t - 1.4) < 0.05 ? '#ffffff' : '#cfe6f4';
              return ((Math.floor(t * 4) + ((Math.floor(dx * 2.5) + (Math.floor(t * 4) % 2)) % 2)) % 2) ? '#b5452e' : '#a33c27'; },
            roof:function(dx, dy, t, rr, eave){ return eave ? '#3a3e46' : '#4a4e56'; } });
          var bx = sch.x, by = sch.y, zb = B.gz(bx, by) + 3.8;
          B.solid(bx - 0.5, by - 0.5, zb, bx + 0.5, by + 0.5, zb + 1.4, function(px, py, pz){ var t = pz - zb, m = Math.max(Math.abs(px - bx), Math.abs(py - by));
            if (t < 0.9) return m < 0.42 ? (Math.hypot(px - bx, py - by) < 0.18 && t > 0.3 ? '#e2b33a' : (m > 0.32 ? '#f6f3ea' : null)) : null; return m < 0.48 * (1 - (t - 0.9) / 0.5) ? '#c0392b' : null; }); }
        if (swing){ var X = swing.x, Y = swing.y, zs = B.gz(X, Y);
          B.solid(X - 1.8, Y - 0.6, zs - 0.05, X + 1.8, Y + 0.6, zs + 2.6, function(px, py, pz){ var dx = px - X, dy = py - Y, t = pz - zs, ft = 0.5 * (1 - t / 2.4);
            if (Math.abs(t - 2.4) < 0.08 && Math.abs(dy) < 0.08 && Math.abs(dx) < 1.75) return '#e53935';
            if (t < 2.4 && Math.abs(Math.abs(dx) - 1.65) < 0.07 && Math.abs(Math.abs(dy) - ft) < 0.07) return '#c62828';
            for (var k = -1; k <= 1; k += 2){ var sx = k * 0.6; if (t > 0.5 && t < 2.4 && Math.abs(Math.abs(dx - sx) - 0.18) < 0.03 && Math.abs(dy) < 0.04) return '#8a8f99'; if (Math.abs(dx - sx) < 0.24 && Math.abs(dy) < 0.13 && t > 0.42 && t < 0.52) return '#2b6a95'; }
            return null; }); }
        balls.forEach(function(b){ var zb = B.gz(b.x, b.y); B.solid(b.x - 0.3, b.y - 0.3, zb, b.x + 0.3, b.y + 0.3, zb + 0.6, function(px, py, pz){ var d = Math.hypot(px - b.x, py - b.y, pz - zb - 0.28); return d < 0.28 ? (d < 0.27 && pz - zb > 0.4 && px < b.x ? '#ff8a7a' : '#de3a2e') : null; }); });
      },
      fill:{ on:['grass'], trees:0.42, lows:0.24, tree:function(B, x, y, i){ broadTree(B, x, y, 2.8 + hash(i, seed, 41) * 1.4, '#5a3d2e', ['#3b8f4a', '#2f7d3e', '#e0a83a'], i); },
        low:function(B, x, y, i){ var k = hash(i, seed, 43); if (k < 0.65) bush(B, x, y, 0.42, ['#3b8f4a', '#2f7d3e', '#5aa84c']); else rockAt(B, x, y, 0.34, ['#9a9a94', '#7a7a74']); } },
      bg:'#5f9e45', gain:1.9,
      mats:{ grass:['#6aaa4f', '#76b658', '#5f9e45', 0.18], top:['#4c5058', '#555a63', '#44484f', 0.12], line:['#f4f4ee', '#ffffff', '#e2e2da', 0.1] }
    };
  };

  /* ---------------- ICE AGE: a glacier wall behind the hole, a tar pit beside it, snow on the tundra and a mammoth or two on it */
  BUILD.iceage = function(L){
    var C = L.C, E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot, north = L.north;
    function wallY(x){ return P0[1] - 3.2 - (vn(x * 0.14, 6, seed) - 0.5) * 3; }
    var pit = spot(2.6, function(x, y){ return Math.abs(x - L.cx) * 0.4 + L.side(x) * 3; }, function(x, y){ return y > wallY(x) + 3; });
    function pitD(x, y){ return pit ? 1 - Math.hypot((x - pit.x) / pit.r, (y - pit.y) / (pit.r * 0.7)) + (fbm(x * 0.6, y * 0.6, seed + 3) - 0.5) * 0.3 : -1; }
    var herd = []; for (var i = 0; i < 2; i++){ var m = spot(1.3, function(x, y){ return north(x, y) * 0.4 + L.side(x) * 2 + hash(x | 0, y | 0, seed + 9 + i); }, function(x, y){ return y > wallY(x) + 2 && pitD(x, y) < -0.3; }); if (m) herd.push(m); }
    function mammoth(B, X, Y, k){ var zb = B.gz(X, Y), dir = hash(k, 3, seed) < 0.5 ? 1 : -1;
      B.solid(X - 1.5, Y - 0.8, zb, X + 1.5, Y + 0.8, zb + 2.2, function(px, py, pz){ var dx = (px - X) * dir, dy = py - Y, t = pz - zb;
        if (t < 0.7 && Math.abs(Math.abs(dx) - 0.55) < 0.17 && Math.abs(Math.abs(dy) - 0.3) < 0.16) return '#5a3c22';
        if (Math.hypot(dx / 0.95, dy / 0.55, (t - 1.15) / 0.62) < 1) return t > 1.6 && dx < 0 ? '#5a3c22' : ((Math.floor(px * 7) + Math.floor(pz * 7)) % 3 ? '#7a5434' : '#8e6440');
        if (Math.hypot((dx - 0.95) / 0.42, dy / 0.38, (t - 1.35) / 0.42) < 1) return '#7a5434';
        if (dx > 1.15 && dx < 1.4 && Math.abs(dy) < 0.11 && t > 0.25 && t < 1.3) return '#6a4a2e';
        if (Math.abs(Math.abs(dy) - 0.22) < 0.06 && dx > 1.1 && dx < 1.65 && Math.abs(t - (0.95 + (dx - 1.1) * (dx - 1.1) * 0.9)) < 0.07) return '#f4ead2';
        return null; }); }
    return {
      h:function(x, y){ var wy = wallY(x), k = sm(0.8, 3, clearAt(x, y)); if (y < wy) return (2.2 + Math.min(4.5, (wy - y) * 0.8)) * k; if (pitD(x, y) > 0) return -0.06; return (fbm(x * 0.07, y * 0.09, seed) - 0.42) * 1.4 * sm(1.3, 6, clearAt(x, y)); },
      mat:function(x, y){ var wy = wallY(x); if (y < wy) return ['glacier', { z:wy - y }]; var t = pitD(x, y); if (t > 0) return ['tar', { dep:t }]; return ['snow']; },
      build:function(B){ herd.forEach(function(m, k){ mammoth(B, m.x, m.y, k); }); },
      fill:{ on:['snow'], trees:0.4, lows:0.26, tree:function(B, x, y, i){ pineAt(B, x, y, 0.75 + hash(i, seed, 51) * 0.6, i); },
        low:function(B, x, y, i){ var k = hash(i, seed, 52); if (k < 0.45) rockAt(B, x, y, 0.4, ['#e4edf6', '#8a8070']); else if (k < 0.8) bush(B, x, y, 0.4, ['#f6f9fd', '#e4edf6', '#28503e']); else deadTree(B, x, y, 2 + hash(i, seed, 53), i); } },
      bg:'#dbe4ea', gain:2.1,
      mats:{ snow:['#eef3f7', '#f8fbfd', '#dde6ec', 0.16],
        glacier:['#8fcde0', '#dcf4fa', '#6fb6d0', 0.2, function(c, R, h3){ var z = c.z || 0, band = (Math.floor(z * 2.2 + h3(c.ti >> 2, 0, 3) * 0.6)) % 3; return R(z > 3.4 ? '#f6fbfd' : band === 0 ? '#6fb6d0' : band === 1 ? '#a8dcea' : '#8fcde0'); }],
        tar:['#1e1a16', '#3a3028', '#141210', 0.08, function(c, R){ return R((c.dep || 0) < 0.12 ? '#3a3028' : (((c.ti * 3 + c.tj * 7) % 29) === 0 ? '#4a3e32' : '#1e1a16')); }] }
    };
  };

  /* ---------------- CANDY WORKS: a factory yard of pink frosting, a chocolate pond beside the hole, candy cane posts, gumdrops, and lollipops for trees */
  BUILD.candy = function(L){
    var seed = L.seed, clearAt = L.clearAt, spot = L.spot, north = L.north;
    var pond = spot(2.4, function(x, y){ return Math.abs(x - L.cx) * 0.4 + L.side(x) * 3; });
    function pondD(x, y){ return pond ? 1 - Math.hypot((x - pond.x) / pond.r, (y - pond.y) / (pond.r * 0.7)) + (fbm(x * 0.6, y * 0.6, seed + 3) - 0.5) * 0.25 : -1; }
    var canes = []; for (var i = 0; i < 3; i++){ var c = spot(0.6, function(x, y){ return north(x, y) * 0.3 + L.side(x) * 2 + hash(x | 0, y | 0, seed + 19 + i); }, function(x, y){ return pondD(x, y) < -0.3; }); if (c) canes.push(c); }
    function cane(B, X, Y, k){ var zb = B.gz(X, Y), H = 2.4 + hash(k, 5, seed) * 0.8, dir = hash(k, 7, seed) < 0.5 ? 1 : -1, R = 0.45;
      B.solid(X - 0.8, Y - 0.3, zb, X + 0.8, Y + 0.3, zb + H + R + 0.2, function(px, py, pz){ var dx = (px - X) * dir, dy = py - Y, t = pz - zb, d;
        if (t < H) d = Math.hypot(dx, dy); else { var a = Math.atan2(t - H, dx - R); d = Math.hypot(Math.hypot(dx - R, t - H) - R, dy); if (a < -0.1) return null; }
        if (d > 0.13) return null; return (Math.floor((t + dx) * 3.2) % 2) ? '#e8233f' : '#fff6f0'; }); }
    return {
      h:function(x, y){ if (pondD(x, y) > 0) return -0.06; return (fbm(x * 0.08, y * 0.08, seed) - 0.42) * 1.1 * sm(1.3, 6, clearAt(x, y)); },
      mat:function(x, y){ var t = pondD(x, y); if (t > 0) return ['choc', { dep:t }]; if (t > -0.12) return ['rim']; return ['frost']; },
      build:function(B){ canes.forEach(function(c, k){ cane(B, c.x, c.y, k); }); },
      fill:{ on:['frost'], trees:0.4, lows:0.3,
        // a lollipop: a white stick and a swirled disc on top, turned to face the camera
        tree:function(B, x, y, i){ var zb = B.gz(x, y), H = 2.2 + hash(i, seed, 61) * 1.2, R = 0.9 + hash(i, seed, 62) * 0.4, cols = [['#ff5fa2', '#fff4f8'], ['#ffd23f', '#ff8a1f'], ['#3fbf9a', '#e6fff6'], ['#8a5cff', '#f2e8ff']][Math.floor(hash(i, seed, 63) * 4)];
          B.solid(x - R, y - 0.25, zb, x + R, y + 0.25, zb + H + R, function(px, py, pz){ var dx = px - x, dy = py - y, t = pz - zb;
            if (t < H && Math.hypot(dx, dy) < 0.09) return '#f6f1ea';
            var r = Math.hypot(dx, t - H); if (r > R || Math.abs(dy) > 0.18) return null; if (r > R - 0.1) return cols[0];
            return ((Math.atan2(t - H, dx) + r * 3.4) % 1.2 + 1.2) % 1.2 < 0.6 ? cols[0] : cols[1]; }); },
        // gumdrops, and now and then a sugar cube
        low:function(B, x, y, i){ var k = hash(i, seed, 64), col = ['#ff3b7a', '#ffd23f', '#3fbf9a', '#8a5cff', '#ff8a1f'][Math.floor(hash(i, seed, 65) * 5)];
          if (k < 0.75){ var zb = B.gz(x, y), r = 0.36;
            B.solid(x - r, y - r, zb, x + r, y + r, zb + r * 1.3, function(px, py, pz){ var t = (pz - zb) / (r * 1.3), w = r * (1 - t * t * 0.8); return Math.hypot(px - x, py - y) < w ? ((hash(px * 11 | 0, pz * 11 | 0, 7) < 0.12) ? '#ffffff' : col) : null; }); }
          else rockAt(B, x, y, 0.32, ['#fbf7f2', '#e8e0d6']); } },
      bg:'#f2b7cc', gain:1.9,
      mats:{ frost:['#f6c3d5', '#fbd6e3', '#efb0c7', 0.14], rim:['#c98a5a', '#d89c6c', '#b87a4c', 0.1],
        choc:['#5a2e14', '#7a4422', '#4a2410', 0.08, function(c, R){ return R((c.dep || 0) < 0.12 ? '#7a4422' : (((c.ti * 3 + c.tj * 7) % 31) === 0 ? '#8a5230' : '#5a2e14')); }] }
    };
  };

  /* ================================================================ THE SECRET HOLES' OWN PLACES
     A secret hole is played inside the place it was found in, not in its world's open land: on the ship's deck
     at sea, inside the cave, in the shed. C.scene names the place. An inside is a floor with walls rising
     round the north and the sides only (the camera looks from the south, so a wall on the near side would stand
     between it and the green), and the place's own things stand against those walls. */
  function room(L, o){ var ca = L.clearAt, P1 = L.P1, g = o.gap || 3;
    function wk(x, y){ var k = sm(g, g + 1.6, ca(x, y)); if (y > P1[1] + 1) k *= 0.12; return k; }
    return { wk:wk, h:function(x, y){ var k = wk(x, y); return k * o.wallH + (1 - k) * (o.floorH ? o.floorH(x, y) : 0); },
      mat:function(x, y){ var k = wk(x, y); return k > 0.45 ? [o.wall, { z:k * o.wallH, n:y < L.P0[1] - 1 ? 1 : 0 }] : [o.floor]; } }; }
  function cyl(B, x, y, r, h, fn){ var zb = B.gz(x, y); B.solid(x - r, y - r, zb, x + r, y + r, zb + h, function(px, py, pz){ var d = Math.hypot(px - x, py - y); return d < r ? fn(d / r, pz - zb, px - x) : null; }); }
  function blob(B, x, y, r, hh, cols){ var zb = B.gz(x, y); B.solid(x - r, y - r, zb, x + r, y + r, zb + hh, function(px, py, pz){ var d = Math.hypot((px - x) / r, (py - y) / r, (pz - zb) / hh); return d < 1 ? cols[(Math.floor(px * 5) + Math.floor(pz * 5) + Math.floor(py * 5)) % cols.length] : null; }); }
  // spots against the back and side walls, where the place's own things stand
  function byWall(L, n, salt, pad){ var out = [], P0 = L.P0, P1 = L.P1; for (var i = 0; i < n * 6 && out.length < n; i++){ var side = hash(i, salt, L.seed) < 0.6 ? 0 : hash(i, salt + 1, L.seed) < 0.5 ? -1 : 1;
      var x = side === 0 ? P0[0] + (P1[0] - P0[0]) * hash(i, salt + 2, L.seed) : side < 0 ? P0[0] - pad : P1[0] + pad, y = side === 0 ? P0[1] - pad : P0[1] + (P1[1] - P0[1]) * 0.75 * hash(i, salt + 3, L.seed);
      if (L.clearAt(x, y) < 1.6 || out.some(function(q){ return Math.hypot(q[0] - x, q[1] - y) < 2.4; })) continue; out.push([x, y]); } return out; }

  // the Captain's Deck: the sea all round the ship, the hull and its gunwale hugging the deck, and the rigging beyond the bow
  BUILD['s-ship'] = function(L){ var ca = L.clearAt, seed = L.seed, P0 = L.P0, cx = L.cx;
    return { h:function(x, y){ var c = ca(x, y); if (c < 1.4) return 1.3; if (c < 2.2) return 0.9 - (c - 1.4) * 1.5; return -0.5 + (fbm(x * 0.2 + seed, y * 0.25, seed) - 0.5) * 0.25; },
      mat:function(x, y){ var c = ca(x, y); if (c < 1.4) return ['gunwale']; if (c < 2.2) return ['hull']; return ['sea', { f:fbm(x * 0.3, y * 0.4, seed) }]; },
      build:function(B){ var mx = cx, my = P0[1] - 3;
        // the bowsprit, the foremast, its yard and sail, the rigging down to the rail, and the crow's nest
        B.solid(mx - 0.25, my - 0.25, 0, mx + 0.25, my + 0.25, 15, function(px, py, pz){ if (Math.hypot(px - mx, py - my) < 0.22) return '#4a301a'; return null; });
        B.solid(mx - 4, my - 0.4, 6, mx + 4, my + 0.4, 13, function(px, py, pz){ var dx = Math.abs(px - mx); if (pz > 12.3 && pz < 12.6) return '#5a3a1e';
          if (pz > 7 && pz < 12.3 && dx < 3.6 - (12.3 - pz) * 0.1 && Math.abs(py - my - 0.3 * Math.sin((pz - 7) / 5.3 * Math.PI)) < 0.2) return (pz > 9.2 && pz < 10.1) ? '#c8402e' : '#fbf3dc'; return null; });
        cyl(B, mx, my, 1.1, 14.6, function(d, t){ return t > 13.8 && t < 14.6 && d > 0.75 ? '#5a3a1e' : null; });
        B.solid(mx - 0.2, my - 6, 1, mx + 0.2, my, 4, function(px, py, pz){ var u = (my - py) / 6; return Math.abs(pz - (1.2 + u * 2.4)) < 0.16 && Math.abs(px - mx) < 0.16 ? '#4a301a' : null; });
        // a gull or two on the water, and a far ship on the horizon
        blob(B, P0[0] - 9, P0[1] - 10, 2.6, 3.4, ['#5a3a1e', '#6a4424']); B.solid(P0[0] - 9.15, P0[1] - 10.15, 3, P0[0] - 8.85, P0[1] - 9.85, 8, function(){ return '#4a301a'; });
        B.solid(P0[0] - 11, P0[1] - 10.2, 4.5, P0[0] - 7, P0[1] - 9.8, 7.5, function(px, py, pz){ return Math.abs(px - (P0[0] - 9)) < (7.5 - pz) * 0.8 ? '#fbf3dc' : null; }); },
      bg:'#2a7fae', gain:1.6,
      mats:{ sea:['#1f6f9e', '#2e8ac0', '#18608a', 0.12, function(c, R){ var f = c.f || 0.5; return R(f > 0.62 ? '#5cb3e0' : f > 0.55 ? '#2e8ac0' : (c.ti + c.tj * 3) % 23 === 0 ? '#8fd0f0' : '#1f6f9e'); }],
        hull:['#5a3a1e', '#6a4424', '#4a301a', 0.1, function(c, R){ return R((c.tj % 3) ? '#6a4424' : '#4a301a'); }],
        gunwale:['#8a6a44', '#9a7a52', '#7a5a34', 0.08, function(c, R){ return R((c.ti % 5) ? '#8a6a44' : '#6a4a2a'); }] } }; };

  // the Painted Cave: dark stone, its walls painted with the herd, stalagmites, glowing crystals and a campfire
  BUILD['s-cave'] = function(L){ var R0 = room(L, { floor:'cfloor', wall:'cwall', wallH:7, gap:2.5 });
    return { h:R0.h, mat:R0.mat,
      build:function(B){ byWall(L, 7, 11, 3.5).forEach(function(q, i){ var x = q[0], y = q[1], zb = B.gz(x, y), hh = 1.6 + hash(i, 4, L.seed) * 1.6;
          B.solid(x - 0.6, y - 0.6, zb, x + 0.6, y + 0.6, zb + hh, function(px, py, pz){ return Math.hypot(px - x, py - y) < 0.55 * (1 - (pz - zb) / hh) ? ((pz * 4 | 0) % 2 ? '#5a4e44' : '#4a4038') : null; }); });
        byWall(L, 4, 21, 2.6).forEach(function(q){ var x = q[0], y = q[1], zb = B.gz(x, y); B.solid(x - 0.5, y - 0.5, zb, x + 0.5, y + 0.5, zb + 1.4, function(px, py, pz){ var a = Math.abs(px - x) + Math.abs(py - y) * 0.6; return a < 0.45 * (1 - (pz - zb) / 1.4) ? '#8fe8ff' : null; }); });
        var f = byWall(L, 1, 31, 4)[0]; if (f){ var zf = B.gz(f[0], f[1]); B.solid(f[0] - 0.8, f[1] - 0.8, zf, f[0] + 0.8, f[1] + 0.8, zf + 1.3, function(px, py, pz){ var d = Math.hypot(px - f[0], py - f[1]), t = pz - zf; if (t < 0.25) return d < 0.75 ? '#4a3626' : null; return d < 0.5 * (1 - (t - 0.25) / 1.05) ? (t > 0.8 ? '#ffd23f' : '#ff7a1a') : null; }); } },
      bg:'#120e0c', gain:2,
      mats:{ cfloor:['#3a322c', '#443a32', '#2e2822', 0.12],
        cwall:['#5a4e44', '#6a5c50', '#4a4038', 0.18, function(c, R){ var z = c.z || 0;
          if (c.n && z > 2.2 && z < 4.6 && hash(c.ti >> 1, c.tj >> 1, 7) < 0.16) return R(hash(c.ti, c.tj, 9) < 0.5 ? '#b5452e' : '#e0b070');
          return R(((c.ti + (z * 2 | 0)) % 7) ? '#5a4e44' : '#4a4038'); }] } }; };

  // the Dark Side: a hangar on the far side of the moon. Black blue walls lined with panel lights and lit portholes, crates and
  // fuel tanks along them, and the earth's light falling faint through the hangar door on the floor.
  BUILD['s-darkside'] = function(L){ var R0 = room(L, { floor:'hfloor', wall:'hwall', wallH:7, gap:2.5 });
    return { h:R0.h, mat:R0.mat,
      build:function(B){ byWall(L, 6, 41, 3.2).forEach(function(q, i){ var x = q[0], y = q[1], zb = B.gz(x, y);
          if (i % 2) cyl(B, x, y, 0.6, 1.8, function(d, t){ return t > 1.65 ? '#9aa6c0' : Math.abs(t - 0.9) < 0.08 ? '#ff5577' : d > 0.85 ? '#4a5878' : '#6a7898'; });   // a fuel tank, its red band
          else B.solid(x - 0.8, y - 0.8, zb, x + 0.8, y + 0.8, zb + 1.3, function(px, py, pz){ var t = pz - zb, e = Math.abs(px - x) > 0.66 || t > 1.16; return Math.abs(px - x) < 0.8 && Math.abs(py - y) < 0.8 ? (e ? '#5a6680' : (Math.abs(px - x - (py - y)) < 0.1 ? '#3a4460' : '#7a869e')) : null; }); });   // a crate
        byWall(L, 5, 47, 2.2).forEach(function(q){ if (B.light) B.light(q[0], q[1], B.gz(q[0], q[1]) + 4.2, '#7fd8ff'); });
        var d = byWall(L, 1, 53, 3)[0]; if (d && B.light) B.light(d[0], d[1] + 3, B.gz(d[0], d[1]) + 3, '#3f6ad8'); },   // the earthlight
      bg:'#05060f', gain:2,
      mats:{ hfloor:['#20263c', '#2a3048', '#181d30', 0.1, function(c, R){ return R(((c.ti % 8) && (c.tj % 8)) ? ((c.ti + c.tj) % 29 ? '#20263c' : '#3f7fe0') : '#141a2c'); }],
        hwall:['#141a2c', '#1c2238', '#0e1220', 0.16, function(c, R){ var z = c.z || 0;
          if (c.n && z > 3.4 && z < 4.6 && (c.ti % 9) < 2) return R((c.ti % 9) ? '#bfefff' : '#7fd8ff');   // the portholes, lit
          if (Math.abs(z - 1.6) < 0.12) return R('#3f7fe0'); return R((c.ti % 6) ? '#141a2c' : '#0e1220'); }] } }; };

  // the Potting Shed: plank floor and walls, shelves of clay pots, a wheelbarrow, sacks
  BUILD['s-shed'] = function(L){ var R0 = room(L, { floor:'boards', wall:'shedwall', wallH:6.5, gap:2.4 });
    return { h:R0.h, mat:R0.mat,
      build:function(B){ byWall(L, 6, 12, 2.8).forEach(function(q, i){ var x = q[0], y = q[1], zb = B.gz(x, y);
          if (i % 2) cyl(B, x, y, 0.55, 0.9, function(d, t){ return t > 0.75 ? (d < 0.8 ? '#4a3626' : '#b8643a') : '#c8743e'; });
          else blob(B, x, y, 0.7, 0.9, ['#d8c8a0', '#c8b890']); });
        byWall(L, 1, 22, 3.4).forEach(function(q){ var x = q[0], y = q[1], zb = B.gz(x, y); B.solid(x - 1.2, y - 0.7, zb, x + 1.2, y + 0.7, zb + 1.2, function(px, py, pz){ var t = pz - zb;
          if (Math.abs(px - x + 0.7) < 0.35 && Math.hypot(py - y, t - 0.35) < 0.35) return '#2a2a2a'; if (t > 0.5 && t < 1.1 && Math.abs(px - x - 0.2) < 0.85 && Math.abs(py - y) < 0.6) return t > 1.0 ? '#2f6b3e' : '#3f8a4e'; return null; }); }); },
      bg:'#2a1c10', gain:1.8,
      mats:{ boards:['#9a7a52', '#a8885e', '#8a6a44', 0.08, function(c, R){ return R((c.tj % 4) ? ((c.ti + (c.tj >> 2) * 7) % 13 ? '#9a7a52' : '#7a5a34') : '#7a5a34'); }],
        shedwall:['#7a5a34', '#8a6a44', '#6a4a2a', 0.1, function(c, R){ var z = c.z || 0; if (c.n && Math.abs(z - 3) < 0.15) return R('#4a301a'); return R((c.ti % 4) ? '#7a5a34' : '#5a3a1e'); }] } }; };

  // Detention: a checked floor, painted walls with the chalkboard along the back, desks and chairs round the room
  BUILD['s-class'] = function(L){ var R0 = room(L, { floor:'lino', wall:'cwallp', wallH:7, gap:2.6 });
    return { h:R0.h, mat:R0.mat,
      build:function(B){ byWall(L, 7, 13, 3.2).forEach(function(q){ var x = q[0], y = q[1], zb = B.gz(x, y); B.solid(x - 1, y - 0.8, zb, x + 1, y + 0.8, zb + 1.4, function(px, py, pz){ var t = pz - zb;
          if (t > 1.05 && t < 1.25 && Math.abs(px - x) < 0.95 && Math.abs(py - y + 0.2) < 0.5) return '#c8a06a'; if (t < 1.05 && Math.abs(Math.abs(px - x) - 0.8) < 0.08 && Math.abs(Math.abs(py - y + 0.2) - 0.4) < 0.08) return '#7a7f88';
          if (t < 0.85 && t > 0.6 && Math.abs(px - x) < 0.45 && Math.abs(py - y - 0.55) < 0.3) return '#2b6a95'; return null; }); }); },
      bg:'#3a3e46', gain:1.7,
      mats:{ lino:['#d8d4c8', '#e4e0d4', '#c8c4b8', 0.06, function(c, R){ return R(((c.ti >> 2) + (c.tj >> 2)) % 2 ? '#d8d4c8' : '#a8b4c0'); }],
        cwallp:['#e8dcc0', '#f2e8d0', '#d8ccb0', 0.06, function(c, R){ var z = c.z || 0; if (c.n && z > 2 && z < 5){ if (hash(c.ti, c.tj >> 1, 3) < 0.05) return R('#f4f4ee'); return R('#2f5a40'); } return R(z < 1 ? '#8a7a5a' : '#e8dcc0'); }] } }; };

  /* SECRET RECIPE: the inner room of the Candy Works, where the recipe is made. A chocolate waterfall pours off a fudge
     cliff straight into the river behind the candy boat's dock and churns it, the river runs through the hole's own
     channel and on out under the far landing to the left, the great kettle mixes the recipe under its whisk behind the
     cup, copper vats bubble beside it, striped candy pipes run overhead along the back wall and down into the kettle and
     the head of the falls, and a candy garden of giant lollipops, candy cane trees, swirled mushrooms and gumdrops grows
     between the river and the back wall and along the top of the cliff. The taffy puller and the press work out front.
     A phone sees about the width of the course, so the pieces that matter stand inside it; the sides are for a wide
     screen. What moves (the falls, the river, the spray, the steam, the bubbles, the whisk, the puller's arms) is handed
     to putt.js as anim and drawn over the picture every frame. */
  BUILD['s-recipe'] = function(L){
    var E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, ca = L.clearAt, F = (L.C.ferries || [])[0];
    // the channel the boat runs in, read off the ferry, so the falls and the river outside meet the one inside
    var chY = F ? (F.y0 + F.y1 - 0.4) / 2 : L.cy, chW = F ? (F.y1 - 0.4 - F.y0) / 2 : 2, xE = F ? Math.max(F.x1, F.x1 + F.dx) : P1[0], xW = F ? Math.min(F.x0, F.x0 + F.dx) + 0.4 : P0[0];
    var WL = 0, RIV = -0.18, CZ = 0.73;                           // the floor, the river outside the course, the course's own water
    var fX0 = xE - 5.4, fX1 = xE - 0.3, fY = chY - chW - 0.95, CH = 7.6, cX0 = fX0 - 1.6;   // the falls behind the dock, and its cliff
    var bY = P0[1] - 15, BH = 12;                                 // the back wall's face, and how tall it stands
    var kX = (P0[0] + xW) / 2, kY = P0[1] - 6.5;                  // the great kettle, behind the cup
    function westY(x){ return chY + Math.sin((x - P0[0]) * 0.22 + seed) * 0.5; }
    // the river out to the west, past the far landing: how deep in it a point is
    function choc(x, y){ if (x > P0[0] + 0.2) return -1; return (chW + 0.1 - Math.abs(y - westY(x))) / chW; }
    // the fudge cliff: from just behind the channel to the back wall, right of the island, a steep face toward the camera
    function cliffK(x, y){ return sm(0, 0.9, fY - y) * sm(0, 0.5, x - cX0); }
    // the stream along the cliff top, from the pipe's mouth at the back to the lip of the falls
    var sX = (fX0 + fX1) / 2, stream = [[sX + 1.4, bY + 2.4], [sX + 0.4, bY + 9], [sX - 0.8, (bY + fY) / 2 + 3], [sX - 0.2, fY - 3], [sX, fY - 0.2]], dS = L.dist(stream);
    function back(x, y){ return sm(bY + 0.6, bY - 0.6, y); }       // 0 in the room, 1 in the back wall
    function apron(x, y){ var c = ca(x, y); return c < 1.7 || (y > P1[1] - 0.5 && c < 5 && Math.abs(x - (xE - 3)) < 7); }
    var path = [[xW + 1.6, chY - chW - 1.2], [xW + 2.2, chY - 9], [xW + 1.4, kY + 3.4], [kX + 3.3, kY + 1.5]], dP = L.dist(path);

    /* what stands in the room, placed by hand against the course, the river, the cliff and the walls */
    var put = [];
    function free(x, y, r, top){ if (ca(x, y) < r + 0.4 || choc(x, y) > -0.3 || back(x, y) > 0.02 || x < E[0] + r || x > E[2] - r || y > E[3] - r) return false;
      var cl = cliffK(x, y); if (top ? (cl < 0.99 || cliffK(x, y + r + 0.4) < 0.99 || dS(x, y) < r + 0.7 || x < cX0 + r + 0.6) : cl > 0.01 || cliffK(x - r, y) > 0.01 || cliffK(x, y - r) > 0.01) return false;
      return put.every(function(q){ return Math.hypot(q[0] - x, q[1] - y) > q[2] + r; }); }
    function place(x, y, r, top){ if (!free(x, y, r, top)) return false; put.push([x, y, r]); L.used.push({ x:x, y:y, r:r }); return true; }
    put.push([kX, kY, 2.7]);
    var vats = []; [[xW + 3.5, chY - 9.6, 0], [xW + 3.9, chY - 19.5, 1], [P0[0] - 6, chY - 6, 2], [P0[0] - 6.5, chY - 16, 0]].forEach(function(v){ if (place(v[0], v[1], 1.75)) vats.push(v); });
    var puller = [P0[0] + 4.2, (chY + chW + P1[1]) / 2 - 0.6], press = [xW + 4.2, (chY + chW + P1[1]) / 2 + 0.6];
    if (!place(puller[0], puller[1], 1.6)) puller = null; if (!place(press[0], press[1], 1.8)) press = null;
    var garden = [];
    function grow(kind, x, y, r, s, top){ if (place(x, y, r, top)) garden.push([kind, x, y, s]); }
    // the island between the river and the back wall: tall things to the back, lower toward the river
    var I0 = xW + 1.3, I1 = cX0 - 0.4, J0 = bY + 2, J1 = chY - chW - 1.2;
    for (var gi = 0; gi < 120; gi++){ var gx = I0 + hash(gi, 3, seed) * (I1 - I0), gy = J0 + hash(gi, 5, seed) * (J1 - J0), dep = (J1 - gy) / (J1 - J0), k = hash(gi, 7, seed);
      if (dep > 0.35 && k < 0.36) grow('lolly', gx, gy, 1.3, 0.75 + dep * 0.75);
      else if (dep > 0.2 && k < 0.58) grow('cane', gx, gy, 1.25, 0.75 + dep * 0.55);
      else if (k < 0.84) grow('shroom', gx, gy, 0.9, 0.5 + dep * 0.7);
      else grow('gum', gx, gy, 0.5, 0.34 + hash(gi, 9, seed) * 0.12); }
    // along the top of the cliff, either side of the stream
    for (gi = 0; gi < 50; gi++){ var tx = cX0 + 1 + hash(gi, 61, seed) * (E[2] - cX0 - 1.5), ty = bY + 2.4 + hash(gi, 63, seed) * (fY - bY - 3.6), k5 = hash(gi, 65, seed);
      if (k5 < 0.35) grow('lolly', tx, ty, 1.3, 0.8 + hash(gi, 67, seed) * 0.5, true); else if (k5 < 0.55) grow('cane', tx, ty, 1.25, 0.85, true); else grow(k5 < 0.85 ? 'shroom' : 'gum', tx, ty, k5 < 0.85 ? 0.9 : 0.5, k5 < 0.85 ? 0.6 + hash(gi, 69, seed) * 0.4 : 0.36, true); }
    // the left side, for a wide screen
    for (gi = 0; gi < 36; gi++){ var lx = E[0] + 1 + hash(gi, 13, seed) * (P0[0] - 2 - E[0]), ly = bY + 2 + hash(gi, 15, seed) * (P1[1] - bY - 2), k2 = hash(gi, 17, seed);
      if (ly > chY + chW + 1) grow(k2 < 0.6 ? 'gum' : 'shroom', lx, ly, k2 < 0.6 ? 0.5 : 0.8, k2 < 0.6 ? 0.34 : 0.5);
      else if (k2 < 0.3) grow('lolly', lx, ly, 1.3, 0.9 + hash(gi, 19, seed) * 0.4); else if (k2 < 0.55) grow('cane', lx, ly, 1.25, 0.9); else grow(k2 < 0.85 ? 'shroom' : 'gum', lx, ly, k2 < 0.85 ? 0.9 : 0.5, k2 < 0.85 ? 0.7 : 0.36); }
    // the garden comes round in front too, tall only where it stands clear of the tee strip, so it hides nothing of the course
    for (gi = 0; gi < 48; gi++){ var side = gi % 3 === 2, ox = side ? xE + 2.6 + hash(gi, 71, seed) * (E[2] - xE - 3.4) : E[0] + 1 + hash(gi, 71, seed) * (xE - 7.5 - E[0]), oy = side ? chY + chW + 2.5 + hash(gi, 73, seed) * (E[3] - chY - chW - 3.5) : P1[1] + 3.2 + hash(gi, 73, seed) * (E[3] - P1[1] - 4), k6 = hash(gi, 75, seed);
      if (k6 < 0.3) grow('lolly', ox, oy, 1.3, 0.75 + hash(gi, 77, seed) * 0.5); else if (k6 < 0.5) grow('cane', ox, oy, 1.25, 0.8); else if (k6 < 0.8) grow('shroom', ox, oy, 0.9, 0.55 + hash(gi, 79, seed) * 0.5); else grow('gum', ox, oy, 0.5, 0.36); }
    // in front of the channel and the course only low things, in beds rather than a scatter
    var beds = [[xW - 1, P1[1] + 3.2], [xE + 2.2, P1[1] + 2.6], [xW + 3.5, P1[1] + 6.5], [xE - 2.5, P1[1] + 8], [P0[0] - 2.5, P1[1] + 5], [xE + 4, chY + chW + 4], [P0[0] + 1.6, chY + chW + 2.2]];
    beds.forEach(function(b, bi){ for (var q = 0; q < 9; q++){ var a = q * 2.4 + bi, rr = q ? 0.55 + (q % 3) * 0.45 : 0, x = b[0] + Math.cos(a) * rr, y = b[1] + Math.sin(a) * rr * 0.7;
      grow(q === 0 ? 'shroom' : q % 4 === 1 ? 'bonbon' : 'gum', x, y, q === 0 ? 0.7 : 0.42, q === 0 ? 0.5 : 0.36); } });
    var lamps = [[xW - 1.6, P1[1] + 1.2], [xE + 1.3, P1[1] + 1.2], [P0[0] - 1.4, chY + chW + 1.2], [I0 + 0.2, J1 + 0.5]].filter(function(p){ return ca(p[0], p[1]) > 0.7 && choc(p[0], p[1]) < -0.2 && cliffK(p[0], p[1]) < 0.01; });
    lamps.forEach(function(p){ L.used.push({ x:p[0], y:p[1], r:0.5 }); });

    /* the moving things, for putt.js to draw every frame: all in the world's feet, z up */
    var anim = { falls:{ x0:fX0 + 0.2, x1:fX1 - 0.2, y:fY + 0.27, bow:0.45, z0:CH + 0.1, z1:CZ }, foam:{ x0:fX0 - 0.2, x1:fX1 + 0.1, y:chY - chW + 0.5, z:CZ + 0.02 },
      spray:[], flow:[], steam:[], bubbles:[], whisk:null, puller:null, col:{ foam:'#f6e6cc', steam:'#ffffff' } };
    for (var sp = fX0 + 0.4; sp < fX1; sp += 0.9) anim.spray.push([sp, fY + 0.55, 1.7]);
    anim.flow.push({ pts:stream.map(function(p){ return [p[0], p[1], CH - 0.2]; }), w:0.8, v:2.2 });
    anim.flow.push({ pts:[[xE - 0.3, chY, CZ], [xW, chY, CZ]], w:chW * 1.5, v:1.5, inside:true });
    var west = []; for (var wx = P0[0] - 0.8; wx > E[0] - 1; wx -= 1.2) west.push([wx, westY(wx), RIV + 0.02]); anim.flow.push({ pts:west, w:chW * 1.4, v:1.5 });

    function shroom(B, x, y, s, k){ var zb = B.gz(x, y), H = 1.5 * s, R = 1.0 * s, cols = [['#ff5fa2', '#fff4f8'], ['#8a5cff', '#f2e8ff'], ['#3fbf9a', '#e6fff6'], ['#ffd23f', '#ff8a1f'], ['#e8233f', '#fff6f0']][k % 5];
      B.solid(x - R, y - R, zb, x + R, y + R, zb + H + R * 0.7, function(px, py, pz){ var dx = px - x, dy = py - y, r = Math.hypot(dx, dy), t = pz - zb;
        if (t < H){ var sw = 0.2 * s * (1 + (H - t) / H * 0.35); if (r < sw) return t > H - 0.25 * s && r > sw * 0.6 ? '#f4e6d0' : (Math.floor(t / s * 5) % 2 ? '#fff8ee' : '#f6ecdc'); }
        var u = (t - H) / (R * 0.7); if (u < 0 || u > 1) return null; var w = R * Math.sqrt(1 - u * u) * (u < 0.15 ? (0.85 + u) : 1); if (r > w) return null;
        if (u < 0.12) return r < w - 0.12 ? '#f6ecdc' : cols[0];
        var a = Math.atan2(dy, dx) + r / s * 2.6; return ((a % 1.57) + 1.57) % 1.57 < 0.78 ? cols[0] : cols[1]; }); }
    function caneTree(B, x, y, s, k){ var zb = B.gz(x, y), H = 3.2 * s, R = 1.15 * s, crown = [['#ffa8d0', '#ffc8e2', '#f088b8'], ['#a8f0d0', '#c8f8e4', '#80d8b0'], ['#e0b8ff', '#f0d8ff', '#c898f0']][k % 3];
      B.vox(x - R * 1.6, y - R * 1.4, zb - 0.1, x + R * 1.6, y + R * 1.4, zb + H + R * 1.2, function(set){
        B.tube(set, x, y, zb, x, y, zb + H, 0.2 * s, 0.14 * s, function(t, z){ return (Math.floor((z - zb) * 3.2) % 2) ? '#e8233f' : '#fff6f0'; });
        for (var q = 0; q < 4; q++){ var a = q * 1.57 + k, rr = R * 0.5; B.blob(set, x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.6, zb + H + (q % 2) * 0.25 * s, R * 0.75, R * 0.65, R * 0.62, function(px, py, pz){ return hash(px * 6 | 0, pz * 6 | 0, 3) < 0.2 ? crown[1] : hash(px * 5 | 0, py * 5 | 0, 4) < 0.15 ? crown[2] : crown[0]; }); }
        B.blob(set, x, y, zb + H + 0.45 * s, R * 0.8, R * 0.7, R * 0.7, function(px, py, pz){ return hash(px * 6 | 0, pz * 6 | 0, 5) < 0.25 ? crown[1] : crown[0]; }); }); }
    // a striped pipe through a list of points, a collar of steel at every joint
    function pipe(B, pts, r, cols){ for (var i = 0; i < pts.length - 1; i++){ var a = pts[i], c = pts[i + 1];
      B.vox(Math.min(a[0], c[0]) - r - 0.2, Math.min(a[1], c[1]) - r - 0.2, Math.min(a[2], c[2]) - r - 0.2, Math.max(a[0], c[0]) + r + 0.2, Math.max(a[1], c[1]) + r + 0.2, Math.max(a[2], c[2]) + r + 0.2, function(set){
        var Ls = Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
        B.tube(set, a[0], a[1], a[2], c[0], c[1], c[2], r, r, function(t){ return (Math.floor(t * Ls * 1.4 + i * 0.5) % 2) ? cols[0] : cols[1]; });
        B.blob(set, c[0], c[1], c[2], r * 1.15, r * 1.15, r * 1.15, cols[2] || '#e4e8ee'); }); } }

    return {
      anim:anim,
      h:function(x, y){ var bk = back(x, y); if (y < bY - 2.2) return -30;            // nothing beyond the back wall: the room ends there
        if (bk > 0) return WL + bk * BH;
        var cl = cliffK(x, y); if (cl > 0){ var top = CH; if (cl > 0.99 && dS(x, y) < 0.9) top = CH - 0.28 * sm(0.9, 0.3, dS(x, y)); return WL + cl * top; }
        var c = choc(x, y); if (c > 0) return RIV - Math.min(0.2, c * 0.3); if (c > -0.18) return RIV + (WL - RIV) * (-c / 0.18);
        return WL; },
      mat:function(x, y){ var bk = back(x, y); if (bk > 0.02) return ['pwall', { z:bk * BH, wx:x }];
        var cl = cliffK(x, y); if (cl > 0.02){ if (cl > 0.99 && dS(x, y) < 0.7) return ['jpool', { dep:0.4 }]; if (cl > 0.99 && dS(x, y) < 0.95) return ['crumb']; if (cl > 0.985) return [fY - y < 1.25 ? 'crumb' : 'lawn']; return ['fudge', { z:cl * CH, wx:x }]; }
        var c = choc(x, y); if (c > 0) return ['jpool', { dep:c }]; if (c > -0.2) return ['crumb'];
        if (apron(x, y)) return ['rtile'];
        if (dP(x, y) < 0.6) return ['mintp'];
        return ['lawn']; },
      build:function(B){
        // THE FALLS: a sheet of chocolate off the lip of the cliff, bowing out as it falls, down behind the channel's rail into the river
        B.solid(fX0, fY - 0.2, CZ - 0.1, fX1, fY + 0.9, CH + 0.15, function(px, py, pz){ var u = (pz - CZ) / (CH - CZ), d = py - (fY + 0.15 + 0.45 * (1 - u) * (1 - u));
          var edge = Math.min(px - fX0, fX1 - px); if (edge < 0 || Math.abs(d) > (edge < 0.25 ? 0.07 : 0.12)) return null;
          var band = vn(px * 3.4, pz * 0.28, seed + 41); if (u > 0.94 && vn(px * 6, 0, seed + 45) > 0.4) return '#f4d0a0'; if (u < 0.08) return band > 0.5 ? '#f4e2c8' : '#e0b888';
          return band > 0.74 ? '#f0c088' : band > 0.6 ? '#d0965e' : band > 0.42 ? '#b07444' : band < 0.2 ? '#7a4422' : '#94582e'; });
        // the cliff's lip, a rounded edge of caramel, and the foot of the cliff where it meets the floor
        B.solid(cX0 - 0.2, fY - 0.6, CH - 0.3, E[2], fY + 0.1, CH + 0.35, function(px, py, pz){ if (px > fX0 - 0.05 && px < fX1 + 0.05) return null; var d = Math.hypot(py - (fY - 0.25), pz - CH);
          return d < 0.3 ? (pz > CH + 0.1 ? '#f2c27a' : '#d89a4a') : null; });
        // OVERHEAD: striped candy pipes along the back wall, one down into the great kettle, one to the head of the falls, one across to the vats
        pipe(B, [[E[0] - 1, bY + 0.7, 9.6], [E[2] + 1, bY + 0.7, 9.6]], 0.45, ['#e8233f', '#fff6f0', '#c8ccd2']);
        pipe(B, [[E[0] - 1, bY + 0.6, 7.7], [E[2] + 1, bY + 0.6, 7.7]], 0.32, ['#3fbf9a', '#f2fff8', '#c8ccd2']);
        pipe(B, [[kX, bY + 0.7, 9.6], [kX, kY - 1, 10.5], [kX, kY, 8.7]], 0.42, ['#ff5fa2', '#fff4f8', '#e4e8ee']);
        pipe(B, [[stream[0][0] + 0.2, bY + 0.7, 9.6], [stream[0][0] + 0.2, bY + 2.2, CH + 1.2]], 0.5, ['#8a5cff', '#f2e8ff', '#e4e8ee']);
        pipe(B, [[xW + 3.7, bY + 0.6, 7.7], [xW + 3.7, chY - 19.5, 6.2], [xW + 3.9, chY - 19.5, 3.4]], 0.28, ['#ffd23f', '#fff8e0', '#e4e8ee']);
        // THE GREAT KETTLE behind the cup: copper on gold feet, the recipe in it, and the whisk on its shaft from the pipe above
        (function(){ var X = kX, Y = kY, zb = B.gz(X, Y), KR = 2.3, KH = 3.4;
          B.solid(X - KR - 0.3, Y - KR - 0.3, zb, X + KR + 0.3, Y + KR + 0.3, zb + KH + 0.2, function(px, py, pz){ var dx = px - X, dy = py - Y, r = Math.hypot(dx, dy), t = pz - zb;
            if (t < 0.6){ var fa = ((Math.atan2(dy, dx) / 6.283 * 4) % 1 + 1) % 1; return r < KR * 0.85 && r > KR * 0.6 && fa < 0.22 ? '#d8a830' : (r < 0.5 ? '#b88a20' : null); }
            var bulge = KR * (0.82 + 0.18 * Math.sin((t - 0.6) / (KH - 0.6) * Math.PI)); if (r > bulge + 0.12) return null;
            if (t > KH - 0.18) return r > bulge - 0.18 ? '#ffd23f' : null;
            if (t > KH - 0.5 && r < bulge - 0.15) return '#ff8ab8';
            if (r < bulge - 0.2) return null;
            if (Math.abs(t - 1.4) < 0.1 || Math.abs(t - 2.6) < 0.1) return '#ffd23f';
            return (Math.floor((Math.atan2(dy, dx) + 3.2) * 3) % 2) ? '#c8743e' : '#b8642e'; }, B.ART * 0.7);
          if (B.light) B.light(X, Y, zb + KH, '#ffb0d0');
          anim.whisk = { x:X, y:Y, z0:zb + KH - 0.3, z1:8.3, r:1.1 };
          anim.steam.push([X - 0.9, Y + 0.4, zb + KH], [X + 1.0, Y - 0.2, zb + KH]);
          anim.bubbles.push([X, Y, zb + KH - 0.35, KR - 0.6, '#ffd0e4']); })();
        // the copper vats, each of its own candy, bubbling and steaming
        var VC = [['#ff7ab0', '#ffd0e4'], ['#7fe0b8', '#d8fff0'], ['#ffe066', '#fff6c8']];
        vats.forEach(function(v){ var X = v[0], Y = v[1], k = v[2], zb = B.gz(X, Y), VR = 1.45, VH = 2.4;
          B.solid(X - VR - 0.2, Y - VR - 0.2, zb, X + VR + 0.2, Y + VR + 0.2, zb + VH + 0.2, function(px, py, pz){ var dx = px - X, dy = py - Y, r = Math.hypot(dx, dy), t = pz - zb;
            if (r > VR) return null; if (t > VH - 0.12) return r > VR - 0.16 ? '#e4e8ee' : VC[k][0];
            if (t > VH - 0.3 && r < VR - 0.15) return VC[k][0]; if (r < VR - 0.15) return null;
            if (Math.abs(t - 0.5) < 0.08 || Math.abs(t - VH + 0.55) < 0.08) return '#8a5a2e'; return dx < -0.4 ? '#d88a4e' : '#c0703a'; }, B.ART * 0.7);
          if (B.light) B.light(X, Y, zb + VH, VC[k][1]);
          anim.steam.push([X + 0.3, Y, zb + VH]); anim.bubbles.push([X, Y, zb + VH - 0.05, VR - 0.5, VC[k][1]]); });
        // the taffy puller: a red post with a hub on a pink tray, its arms drawn turning by putt.js
        if (puller){ var X = puller[0], Y = puller[1], zb = B.gz(X, Y);
          B.solid(X - 1.4, Y - 0.9, zb, X + 1.4, Y + 0.9, zb + 3.1, function(px, py, pz){ var dx = px - X, dy = py - Y, t = pz - zb;
            if (t < 0.7){ if (Math.abs(dx) > 1.3 || Math.abs(dy) > 0.8) return null; if (t > 0.55) return Math.abs(dx) < 1.1 && Math.abs(dy) < 0.6 ? '#ffb3cf' : '#e4e8ee'; return Math.abs(t - 0.3) < 0.06 ? '#ffd23f' : '#e8233f'; }
            if (Math.abs(dx) < 0.18 && Math.abs(dy) < 0.18 && t < 2.6) return (Math.floor(t * 3) % 2) ? '#e8233f' : '#c81a32';
            if (Math.hypot(dx, t - 2.7) < 0.32 && Math.abs(dy - 0.1) < 0.2) return '#ffd23f'; return null; }, B.ART * 0.7);
          anim.puller = { x:X, y:Y + 0.35, z:zb + 2.75, r:1.35 }; }
        // the taffy press: a frame in candy red, its head over a tray of fresh stamped sweets
        if (press){ var PX = press[0], PY = press[1], pz0 = B.gz(PX, PY);
          if (B.light) B.light(PX, PY, pz0 + 4.2, '#ffb02a');
          B.solid(PX - 1.7, PY - 1.1, pz0, PX + 1.7, PY + 1.1, pz0 + 4.5, function(px, py, pz){ var dx = px - PX, dy = py - PY, t = pz - pz0;
            if (t < 0.9){ if (Math.abs(dx) > 1.6 || Math.abs(dy) > 1) return null; return t > 0.76 ? '#ffb3cf' : (Math.abs(t - 0.4) < 0.07 ? '#ffd23f' : '#c8ccd2'); }
            if (t < 1.1 && Math.abs(dy) < 0.32){ var cx2 = ((dx + 9) % 0.8) - 0.4; if (Math.hypot(cx2, dy) < 0.24) return CND_GUM[Math.floor((dx + 9) / 0.8) % 5]; }
            if (Math.abs(Math.abs(dx) - 1.35) < 0.22 && Math.abs(dy) < 0.26 && t < 4) return (Math.floor(t * 2.5) % 2) ? '#e8233f' : '#fff6f0';
            if (t > 3.3 && t < 4.0 && Math.abs(dx) < 1.6 && Math.abs(dy) < 0.4) return Math.abs(t - 3.65) < 0.1 ? '#fff6f0' : '#e8233f';
            if (Math.abs(dx) < 0.55 && Math.abs(dy) < 0.4 && t > 1.6 && t <= 2.2) return t < 1.72 ? '#8a5cff' : '#a88aff';
            if (Math.hypot(dx, dy) < 0.15 && t > 2.2 && t <= 3.3) return '#c8ccd2';
            if (t > 4 && t < 4.35 && Math.hypot(dx, dy) < 0.18) return '#ffb02a'; return null; }, B.ART * 0.7);
          anim.steam.push([PX + 1.1, PY, pz0 + 4]); }
        // the garden
        garden.forEach(function(g, i){ var kind = g[0], x = g[1], y = g[2], s = g[3];
          if (kind === 'lolly') cndLolly(B, x, y, 2.6 * s + 1.2, 0.75 + s * 0.6, CND_LOLLY[Math.abs(i + seed) % 4]);
          else if (kind === 'cane'){ if (hash(i, 41, seed) < 0.35) cndCane(B, x, y, 2.4 * s + 0.6, hash(i, 43, seed) < 0.5 ? 1 : -1); else caneTree(B, x, y, s, i); }
          else if (kind === 'shroom') shroom(B, x, y, s, i);
          else if (kind === 'bonbon') cndBonbon(B, x, y, ['#e8233f', '#ffc83a', '#8a5cff', '#3fbf9a'][i % 4]);
          else cndGum(B, x, y, s, CND_GUM[i % 5]); });
        lamps.forEach(function(p){ lamp(B, p[0], p[1], '#e8233f', '#ffe9b0'); });
      },
      bg:'#f0b8d0', gain:1.7,
      mats:{
        rtile:['#f8eef2', '#fff8fb', '#ecd8e0', 0.06, function(c, R){ if (c.ti % 6 === 0 || c.tj % 6 === 0) return R('#ecd2dc'); var ch = ((Math.floor(c.ti / 6) + Math.floor(c.tj / 6)) % 2 + 2) % 2; return R(ch ? '#ffd6e4' : '#fff4f8'); }],
        lawn:['#a8e0bc', '#bfead0', '#93d4aa', 0.1, function(c, R){ return R(cndBlot(c, seed + 7, ['#a8e0bc', '#bdeacd', '#94d3a9', '#b2e4c4'])); }],
        mintp:['#fbf6ee', '#ffffff', '#ece4d8', 0.1, function(c, R){ var n = blot(c, 0.3, seed + 11); return R(n > 0.7 ? '#ffffff' : n < 0.3 ? '#f4e0ea' : '#f8f2e8'); }],
        crumb:['#c8945a', '#d8a868', '#a87a48', 0.1, function(c, R){ var n = blot(c, 0.35, seed + 23); return R(n > 0.6 ? '#d8a868' : n < 0.35 ? '#ae7e4a' : '#c8945a'); }],
        jpool:['#5a2a12', '#8a5030', '#4a2410', 0.05, function(c, R){ var d = c.dep || 0, n = blot(c, 0.12, seed + 21); return R(d < 0.18 ? '#8c4416' : n > 0.66 ? '#7c3610' : d < 0.6 ? '#6c2a08' : '#5c2206'); }],
        // the cliff is layered like a candy bar: dark chocolate with bands of strawberry wafer and cream
        fudge:['#6a3518', '#7a4422', '#5a2a12', 0.1, function(c, R){ var z = c.z || 0;
          var b = (z + (vn((c.wx || 0) * 0.6, 0, seed) - 0.5) * 0.7 + 4) % 2.4; return R(b < 0.5 ? '#ff9cc4' : b < 0.68 ? '#fff0e0' : b < 1.5 ? '#4a2410' : b < 1.66 ? '#fff0e0' : '#5a2a12'); }],
        // the back wall: pink and white candy stripes, a gold rail at the pipes, round windows glowing warm
        pwall:['#ff9cc4', '#ffb3cf', '#c85a8a', 0.06, function(c, R){ var z = c.z || 0, x = c.wx || 0; if (z > BH - 0.3) return R('#7a2a4e'); if (z < 0.5) return R('#fff6f0');
          var wu = ((x % 3.6) + 3.6) % 3.6 - 1.8, wr = Math.hypot(wu, (z - 4.2) * 0.9); if (wr < 0.8) return R(wr > 0.64 ? '#ffd23f' : '#ffe9b0');
          if (Math.abs(z - 6.4) < 0.12) return R('#ffd23f'); return R(((Math.floor(x * 1.2) % 2) + 2) % 2 ? '#ff9cc4' : '#fff0f6'); }] }
    };
  };

  // Glitch Level: no ground at all, a neon grid in the dark, and blocks of glitch hanging in it
  BUILD['s-glitch'] = function(L){ var seed = L.seed;
    return { h:function(x, y){ return -0.8; }, mat:function(x, y){ return ['grid']; },
      build:function(B){ for (var i = 0; i < 14; i++){ var a = hash(i, 1, seed) * 6.283, d = 6 + hash(i, 2, seed) * 14, x = L.cx + Math.cos(a) * (L.P1[0] - L.P0[0]) / 2 + Math.cos(a) * d, y = L.cy + Math.sin(a) * (L.P1[1] - L.P0[1]) / 2 + Math.sin(a) * d;
          if (y > L.P1[1] || L.clearAt(x, y) < 2.5) continue; var zb = 1 + hash(i, 3, seed) * 5, s = 0.5 + hash(i, 4, seed) * 1.2, col = ['#ff2bd6', '#2bf0ff', '#39ff14', '#ffe600'][i % 4];
          B.solid(x - s, y - s, zb, x + s, y + s, zb + s * 2, function(px, py, pz){ return hash(px * 6 | 0, pz * 6 | 0, 5) < 0.12 ? '#ffffff' : col; }); } },
      bg:'#05030f', gain:1,
      mats:{ grid:['#0a0618', '#0e0a22', '#06040f', 0.04, function(c, R){ return R(c.ti % 8 === 0 || c.tj % 8 === 0 ? ((c.ti + c.tj) % 16 < 8 ? '#ff2bd6' : '#2bf0ff') : '#0a0618'); }] } }; };

  // Treasure Chamber: flagstones, carved walls, heaps of gold, chests and torches
  BUILD['s-treasure'] = function(L){ var R0 = room(L, { floor:'flags', wall:'carved', wallH:7, gap:2.6 });
    return { h:R0.h, mat:R0.mat,
      build:function(B){ byWall(L, 6, 15, 3.4).forEach(function(q, i){ if (i % 3 === 2){ var x = q[0], y = q[1], zb = B.gz(x, y); B.solid(x - 1, y - 0.6, zb, x + 1, y + 0.6, zb + 1.2, function(px, py, pz){ var t = pz - zb; return t > 0.75 ? (Math.abs(px - x) < 0.12 ? '#ffd23f' : '#6a3a1a') : (Math.abs(t - 0.5) < 0.08 ? '#ffd23f' : '#7a4a22'); }); }
          else blob(B, q[0], q[1], 1.4 + hash(i, 5, L.seed), 1.2, ['#ffd23f', '#f0b020', '#ffe680', '#e0a010']); });
        byWall(L, 3, 25, 2.2).forEach(function(q){ var x = q[0], y = q[1], zb = B.gz(x, y); B.solid(x - 0.3, y - 0.3, zb, x + 0.3, y + 0.3, zb + 3.4, function(px, py, pz){ var t = pz - zb, d = Math.hypot(px - x, py - y); if (t > 2.6) return d < 0.28 * (1 - (t - 2.6) / 0.8) ? (t > 3 ? '#ffd23f' : '#ff7a1a') : null; return d < 0.12 ? '#4a3626' : null; }); }); },
      bg:'#1c1a12', gain:1.9,
      mats:{ flags:['#a69c72', '#b9ae84', '#968c62', 0.1, function(c, R){ return R((c.ti % 6 === 0 || c.tj % 5 === 0) ? '#7a7050' : '#a69c72'); }],
        carved:['#8a8060', '#9a9070', '#7a7050', 0.14, function(c, R){ var z = c.z || 0; if (c.n && Math.abs(z - 3.5) < 0.6 && (c.ti % 6) < 2) return R('#c8a040'); return R(((z * 2 | 0) % 2) ? '#8a8060' : '#7a7050'); }] } }; };

  // Lost Mine: dirt underfoot, rock walls held up by timber frames, the old rails and a lantern or two
  BUILD['s-mine'] = function(L){ var R0 = room(L, { floor:'dirt', wall:'minewall', wallH:6.5, gap:2.4 });
    return { h:R0.h, mat:R0.mat,
      build:function(B){ byWall(L, 3, 16, 2.4).forEach(function(q){ var x = q[0], y = q[1], zb = B.gz(x, y); B.solid(x - 0.3, y - 0.3, zb, x + 0.3, y + 0.3, zb + 2.6, function(px, py, pz){ var t = pz - zb, d = Math.hypot(px - x, py - y); if (t > 2) return d < 0.3 ? (t > 2.3 ? '#ffd77a' : '#3a2a1a') : null; return d < 0.08 ? '#3a2a1a' : null; }); });
        var c = byWall(L, 1, 26, 3.8)[0]; if (c){ var zb = B.gz(c[0], c[1]); B.solid(c[0] - 1.4, c[1] - 0.9, zb, c[0] + 1.4, c[1] + 0.9, zb + 1.6, function(px, py, pz){ var t = pz - zb;
          if (t < 0.5) return Math.abs(Math.abs(px - c[0]) - 0.9) < 0.3 && Math.abs(Math.abs(py - c[1]) - 0.7) < 0.2 ? '#2a2a2a' : null; if (t > 1.3) return Math.abs(px - c[0]) < 1.2 && Math.abs(py - c[1]) < 0.7 ? '#8a6a44' : null; return '#6a4a2a'; }); } },
      bg:'#1a120a', gain:1.9,
      mats:{ dirt:['#6a4e34', '#7a5e40', '#5a4028', 0.14, function(c, R){ return R((c.ti % 9 === 0 && c.tj % 2 === 0) ? '#8a8a8a' : '#6a4e34'); }],
        minewall:['#6e4a2a', '#7e5a36', '#5e3e22', 0.16, function(c, R){ var z = c.z || 0; if (c.ti % 14 < 2) return R('#8a6a44'); if (c.n && Math.abs(z - 5) < 0.3) return R('#8a6a44'); if (hash(c.ti, c.tj, 13) < 0.02) return R('#ffd23f'); return R('#6e4a2a'); }] } }; };

  // Lava Tube: basalt all round, and lava glowing along channels in the floor of the tube
  BUILD['s-lava'] = function(L){ var R0 = room(L, { floor:'basaltf', wall:'basaltw', wallH:7, gap:3.2 }), ca = L.clearAt, seed = L.seed;
    return { h:function(x, y){ var c = ca(x, y); if (c > 1.4 && c < 2.6 && y <= L.P1[1]) return -0.15; return R0.h(x, y); },
      mat:function(x, y){ var c = ca(x, y); if (c > 1.4 && c < 2.6 && y <= L.P1[1]) return ['lavaf', { f:fbm(x * 0.4, y * 0.4, seed) }]; return R0.mat(x, y); },
      build:function(B){ byWall(L, 6, 17, 3.8).forEach(function(q, i){ blob(B, q[0], q[1], 1 + hash(i, 6, seed), 1.3, ['#2a2427', '#3b383f', '#1f1a1d']); }); },
      bg:'#200a06', gain:2,
      mats:{ basaltf:['#2a2427', '#323036', '#1f1a1d', 0.1], basaltw:['#3b383f', '#45414a', '#2a272c', 0.14, function(c, R){ var z = c.z || 0; return R(z < 1.2 && hash(c.ti, c.tj, 5) < 0.08 ? '#ff5a1a' : ((c.ti + (z * 2 | 0)) % 6 ? '#3b383f' : '#2a272c')); }],
        lavaf:['#d84a14', '#ff7a1a', '#b0300c', 0.06, function(c, R){ var f = c.f || 0.5; return R(f > 0.6 ? '#ffd25a' : f > 0.5 ? '#ff7a1a' : '#d84a14'); }] } }; };

  // Above the Clouds: nothing below but a sea of cloud, puffs drifting past, and an island far off
  BUILD['s-clouds'] = function(L){ var seed = L.seed;
    return { h:function(x, y){ return -1.4 + fbm(x * 0.12, y * 0.12, seed) * 1.6; }, mat:function(x, y){ return ['cloudsea', { f:fbm(x * 0.12, y * 0.12, seed) }]; },
      build:function(B){ byWall(L, 6, 18, 5).forEach(function(q, i){ blob(B, q[0], q[1], 1.6 + hash(i, 7, seed) * 1.4, 1.6, ['#ffffff', '#eef6fc', '#f8fbfd']); });
        var q = byWall(L, 1, 28, 12)[0]; if (q){ blob(B, q[0], q[1], 3.4, 2.2, ['#5fb24e', '#6cbf58', '#79ca62']); var zb = B.gz(q[0], q[1]) + 1.6; B.solid(q[0] - 0.8, q[1] - 0.8, zb, q[0] + 0.8, q[1] + 0.8, zb + 4, function(px, py, pz){ return Math.hypot(px - q[0], py - q[1]) < 0.7 * (1 - (pz - zb) / 4) ? '#e74c3c' : null; }); } },
      bg:'#8fcdf3', gain:1.2,
      mats:{ cloudsea:['#f2f8fd', '#ffffff', '#dcebf6', 0.08, function(c, R){ var f = c.f || 0.5; return R(f > 0.58 ? '#ffffff' : f > 0.46 ? '#eef6fc' : '#cfe3f3'); }] } }; };

  // The Nest: a floor of straw, walls of woven sticks, and eggs the size of a golfer round the edge
  BUILD['s-nest'] = function(L){ var R0 = room(L, { floor:'straw', wall:'sticks', wallH:5, gap:2.4 });
    return { h:R0.h, mat:R0.mat,
      build:function(B){ byWall(L, 5, 23, 2.6).forEach(function(q, i){ blob(B, q[0], q[1], 1.35, 2.1, i % 2 ? ['#ece2c0', '#fbf4dc', '#6a7a3a'] : ['#e2dcb8', '#f4eed2', '#5a6a32']); }); },
      bg:'#b8d08a', gain:1.5,
      mats:{ straw:['#b8955a', '#cca868', '#9a7a44', 0.14], sticks:['#6a4a26', '#9a7a48', '#3e2a16', 0.14, function(c, R, h3){ var a = (c.ti + c.tj) % 5, b = ((c.ti - c.tj) % 6 + 6) % 6, z = c.z || 0;
          if (z > 4.6) return R(h3(c.ti, c.tj, 9) < 0.5 ? '#8a6a3a' : '#a8875a'); return R(a === 0 ? '#9a7a48' : b === 0 ? '#3e2a16' : h3(c.ti >> 1, c.tj, 5) < 0.3 ? '#5a4026' : '#6a4a26'); }] } }; };

  /* EACH WORLD'S OWN STOPS. A world's file (golf/putt/stops/, pasted between these lines by scripts) names where its
     stops begin, STOPS[world] = [[1, 'first'], [5, 'second'], ...], wraps BUILD[world] to build the land of the stop a hole
     is at (L.stop), and may name the birds over each stop's holes (FLY['world~stop']). putt.js reads the table (stopOf), so
     a hole and the walk to it are always at the same stop. */
  // @@WORLD STOPS BEGIN@@
  /* ---------------- THE CLUBHOUSE IS A JOURNEY, the way Pirate Cove is. Home ground, a sunny club day, and the holes walk
     you round the club: the first tee by the clubhouse and the car park (1 to 4), the practice range with its bays and
     target greens (5 to 8), out on the course among the woods (9 to 12), down to the mill creek with its water mill and
     the windmill on the hill (13 to 16), and home to the eighteenth: the big clubhouse, its terrace, the grandstand and
     the pond (17 and 18). A hole with no place (a daily, a season) keeps the old clubhouse land. */
  STOPS.clubhouse = [[1, 'tee'], [5, 'range'], [9, 'woods'], [13, 'mill'], [17, 'home']];
  FLY['clubhouse~tee'] = FLY['clubhouse~woods'] = 'song'; FLY['clubhouse~range'] = 'crow'; FLY['clubhouse~mill'] = 'butterfly'; FLY['clubhouse~home'] = 'gull';
  (function(){ var base = BUILD.clubhouse; BUILD.clubhouse = function(L){ var s = L.stop;
    return s === 'tee' ? cluTee(L) : s === 'range' ? cluRange(L) : s === 'woods' ? cluWoods(L) : s === 'mill' ? cluMill(L) : s === 'home' ? cluHome(L) : base(L); }; })();

  // a colour picked from smooth patches: cols[0] most of the ground, cols[1] the light patches, cols[2] the dark
  function cluPatch(c, f, sd, cols, lo, hi){ var b = blot(c, f, sd); return b > (hi || 0.64) ? cols[1] : b < (lo || 0.3) ? cols[2] : cols[0]; }
  // mown grass: stripes w cells wide, each stripe its own shades in soft patches (dia runs them on the slant)
  function cluMow(c, R, w, sd, A, Bc, dia){ var q = dia ? c.tj + c.ti * 0.6 : c.tj; return R(cluPatch(c, 0.06, sd, Math.floor(q / w) % 2 ? A : Bc, 0.3, 0.68)); }
  var CLU_LEAF = ['#2f7d3e', '#3b8f4a', '#25693a'], CLU_BARK = '#5a3d2e';
  function cluTree(B, x, y, H, k){ broadTree(B, x, y, H, CLU_BARK, CLU_LEAF, k); }
  // a fir, the course's other tree: tiers of dark green, no snow
  function cluPine(B, x, y, r, i){ var zb = B.gz(x, y), H = r * 5 + 1.2, R0 = r * 1.25;
    B.solid(x - R0, y - R0, zb, x + R0, y + R0, zb + H + 0.2, function(px, py, pz){ var rr = Math.hypot(px - x, py - y), h = (pz - zb) / H;
      if (h < 0.12) return rr < 0.17 ? '#4a3626' : null; var tier = (h - 0.12) / 0.88 * 3, f = tier - Math.floor(tier), rad = R0 * (1 - (h - 0.12) / 0.88) * (0.65 + 0.45 * (1 - f)); if (rr > rad) return null;
      return f > 0.62 && rr > rad - 0.2 ? '#2f6e44' : ((Math.floor(pz * 4) + i) % 3 ? '#1f5236' : '#27603f'); }); }
  function cluBushes(B, x, y, i, seed){ var k = hash(i, seed, 61); if (k < 0.55) bush(B, x, y, 0.42, ['#3b8f4a', '#2f7d3e', '#4a9a52']); else if (k < 0.8) bush(B, x, y, 0.36, ['#3b8f4a', '#f4f1ea', '#3b8f4a', '#e86a8a']); else rockAt(B, x, y, 0.3, ['#9a968c', '#b0aca0']); }
  // a flag on a white pole: H tall, the flag w long in col (and a second colour for its lower half)
  function cluFlag(B, x, y, H, col, col2, w){ var zb = B.gz(x, y); w = w || 1.1;
    B.solid(x - 0.1, y - 0.1, zb, x + w + 0.1, y + 0.1, zb + H + 0.1, function(px, py, pz){ var t = pz - zb; if (Math.hypot(px - x, py - y) < 0.06 && t < H) return t > H - 0.08 ? '#d8b23a' : '#f4f4f4';
      if (px > x + 0.04 && px < x + w && Math.abs(py - y) < 0.04 && t > H - 0.75 - (px - x) * 0.05 && t < H - 0.08 - (px - x) * 0.05) return col2 && t < H - 0.42 ? col2 : col; return null; }); }
  // a little car parked in a bay, nose north (k 0) or south (k 1)
  function cluCar(B, x, y, col, k){ var zb = B.gz(x, y);
    B.solid(x - 0.65, y - 1.2, zb, x + 0.65, y + 1.2, zb + 1.0, function(px, py, pz){ var dx = px - x, dy = (py - y) * (k % 2 ? 1 : -1), t = pz - zb;
      if (Math.abs(dx) > 0.58 || Math.abs(dy) > 1.12) return null;
      if (t < 0.22) return (Math.abs(Math.abs(dy) - 0.7) < 0.24 && Math.abs(dx) > 0.42) ? '#1e1e22' : null;   // the wheels
      if (t < 0.56){ if (dy > 1.0 && t > 0.3 && t < 0.42 && Math.abs(dx) > 0.35) return '#fff3c4'; return t < 0.28 ? '#2a2a30' : col; }
      if (t < 0.98 && dy > -0.75 && dy < 0.45 && Math.abs(dx) < 0.5 - (t - 0.56) * 0.3){ if (t > 0.92) return col; return (Math.abs(dx) > 0.38 - (t - 0.56) * 0.3 || dy > 0.3 || dy < -0.62) ? '#9fc8e0' : '#3a4a5a'; }
      return null; }); }
  // a practice putting green out front: a soft oval of short grass, three short flags in it
  function cluPGreen(L, x, y){ var g = L.spot(2.4, function(px, py){ return -Math.hypot(px - x, py - y); }); return g ? { x:g.x, y:g.y, r:g.r, f:[[g.x - 1, g.y - 0.3], [g.x + 0.9, g.y - 0.6], [g.x + 0.2, g.y + 0.7]] } : null; }
  function cluPGreenD(g, x, y){ return g ? 1 - Math.hypot((x - g.x) / (g.r * 1.3), (y - g.y) / (g.r * 0.85)) : -1; }
  function cluPGreenBuild(B, g){ if (g) g.f.forEach(function(f, k){ cluFlag(B, f[0], f[1], 1.3, ['#e53935', '#f1d04a', '#1e88e5'][k], null, 0.5); }); }
  var CLU_PG = ['#5fae58', '#69b862', '#56a350', 0.1, function(c, R){ return R(cluPatch(c, 0.15, 44, ['#5fae58', '#66b45e', '#58a652'])); }];
  // the course's ground: a cart path's grey tarmac, a raked bunker, and the club's striped grass
  var CLU_TAR = ['#6a6d72', '#74777c', '#5f6267', 0.1, function(c, R){ return R(cluPatch(c, 0.09, 33, ['#6a6d72', '#74777c', '#5f6267'])); }];
  var CLU_SAND = ['#ecd9a0', '#f4e4b4', '#dcc68a', 0.1, function(c, R){ var b = blot(c, 0.2, 51), r = Math.sin(c.ti * 0.5 + blot(c, 0.05, 52) * 9); return R(r > 0.85 ? '#dcc68a' : b > 0.66 ? '#f6e8bc' : '#ecd9a0'); }];
  var CLU_GRASS = ['#7fb35e', '#89bd66', '#73a754', 0.1, function(c, R){ return cluMow(c, R, 8, 11, ['#82b660', '#8abe68', '#7caf5a'], ['#70a452', '#78ac58', '#6a9e4c']); }];
  var CLU_SLAB = ['#e2d8c0', '#ece4d0', '#cfc3a8', 0.1, function(c, R){ if (c.ti % 5 === 0 || (c.tj + (Math.floor(c.ti / 5) % 2) * 2) % 5 === 0) return R('#c8bca0'); return R(cluPatch(c, 0.12, 21, ['#e2d8c0', '#ece4d0', '#d6cab0'])); }];

  // 1. THE FIRST TEE: the white clubhouse behind the hole with its flag, the pro shop beside it, a paved walk down to the
  // tee with lamps along it, and the car park out front, low, so it never stands between the camera and the carpet.
  function cluTee(L){
    var C = L.C, E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot, spotRect = L.spotRect;
    var club = spotRect(9.5, 5, function(x, y){ return -Math.abs(y - (P0[1] - 6)) * 1.2 - Math.abs(x - L.cx) * 0.3; });
    var sd = club ? (club.x < L.cx ? 1 : -1) : 1;
    var shop = spotRect(5, 3.6, function(x, y){ return -Math.abs(y - (club ? club.y + 0.6 : P0[1] - 5)) * 1.2 - Math.abs(x - (club ? club.x + sd * 8.5 : L.cx)) * 0.5; });
    var park = spotRect(8, 6.4, function(x, y){ return -Math.abs(y - P1[1] - 6) * 0.5 - Math.abs(x - L.cx + sd * 5) * 0.3 - Math.abs(clearAt(x, y) - 3) * 0.3; });
    var path = club ? L.route([club.x, club.y + club.d / 2 + 0.3], [C.tee[0], P1[1] + 1.4], seed + 4, 1) : null;
    if (club) L.used.push({ x:club.x, y:club.y + club.d / 2 + 1.4, r:1.8 });
    var dPa = L.dist(path); function onPath(x, y){ return dPa(x, y) < 0.7; }
    var lamps = path ? path.filter(function(p, k){ return k % 3 === 1; }).map(function(p, k){ return [p[0] + (k % 2 ? 1.1 : -1.1), p[1]]; }).filter(function(p){ return clearAt(p[0], p[1]) > 0.9; }) : [];
    var washer = spot(0.4, function(x, y){ return -Math.hypot(x - C.tee[0] - 2.2, y - P1[1] - 2); }, function(x, y){ return !onPath(x, y); });
    var bench = spot(0.9, function(x, y){ return -Math.hypot(x - C.tee[0] + 2.6, y - P1[1] - 2.2); }, function(x, y){ return !onPath(x, y); });
    // the bed along the clubhouse front, and the car park's bays
    function bedD(x, y){ if (!club) return 9; var dx = Math.abs(x - club.x), dy = y - (club.y + club.d / 2 + 0.75); return dx < club.w / 2 && dx > 1.1 && Math.abs(dy) < 0.45 ? 0 : 9; }
    function inPark(x, y){ return park && Math.abs(x - park.x) < park.w / 2 && Math.abs(y - park.y) < park.d / 2; }
    var pg = cluPGreen(L, park && park.x < L.cx ? P1[0] + 3 : P0[0] - 3, P1[1] + 5);
    function inLane(x, y){ return park && y > park.y && Math.abs(x - park.x) < 1.3; }
    var cars = []; if (park) for (var r = 0; r < 2; r++) for (var k = 0; k < 4; k++){ if (hash(r, k, seed + 5) < 0.3) continue; cars.push({ x:park.x - park.w / 2 + 1 + k * 2, y:park.y + (r ? 1.7 : -1.7), k:r, c:['#d8433a', '#3a6ec8', '#f4f4f0', '#e8b83a', '#9aa0a8', '#2f8a5a'][(hash(k, r, seed + 6) * 6) | 0] }); }
    return {
      h:function(x, y){ var z = (fbm(x * 0.05, y * 0.05, seed) - 0.45) * 1.4 * sm(1.5, 7, clearAt(x, y)); if (inPark(x, y) || inLane(x, y)) return 0.02; if (cluPGreenD(pg, x, y) > -0.1) z = z * 0.3 + 0.06; if (onPath(x, y)) z = z * 0.5 - 0.03; return z; },
      mat:function(x, y){ if (inPark(x, y)){ var u = x - park.x + park.w / 2, v = Math.abs(y - park.y);
          if (Math.abs(v - park.d / 2 + 0.12) < 0.12 || Math.abs(u - 0.12) < 0.12 || Math.abs(u - park.w + 0.12) < 0.12) return ['kerb'];
          return v > 0.6 && v < park.d / 2 - 0.2 && ((u % 2) + 2) % 2 < 0.1 ? ['line'] : ['tar']; }
        if (inLane(x, y)) return Math.abs(x - park.x) > 1.12 ? ['kerb'] : Math.abs(x - park.x) < 0.06 && ((y % 1.2) + 1.2) % 1.2 < 0.6 ? ['line'] : ['tar'];
        var g = cluPGreenD(pg, x, y); if (g > 0) return ['pg']; if (g > -0.08) return ['kerb'];
        if (onPath(x, y)) return ['slab']; if (!bedD(x, y)) return ['bed']; return ['grass']; },
      build:function(B){
        if (club){ var w = club.w, d = club.d;
          house(B, club, { wh:2.8, rh:1.6, ov:0.45, chim:'#9a4a32', step:'#d9d2c2',
            wall:function(dx, dy, t){ if (dy > d / 2 - 0.15 && Math.abs(dx) < 0.6 && t < 2){ return Math.abs(dx) < 0.05 ? '#24482d' : '#2f5d3a'; }
              if (dy > d / 2 - 0.15 && (Math.abs(Math.abs(dx) - 2.0) < 0.6 || Math.abs(Math.abs(dx) - 3.7) < 0.42) && t > 0.95 && t < 2.1) return (Math.abs(t - 1.52) < 0.04 || Math.abs(Math.abs(dx) - 2.0) < 0.03) ? '#ffffff' : '#9fd0e8';
              if (t < 0.3) return '#cfc8b6'; return (Math.floor(t * 5) % 2) ? '#f8f5ee' : '#ece7da'; },
            roof:function(dx, dy, t, rr, eave){ return eave ? '#1f4a2c' : (Math.floor(t * 4) % 2 ? '#2f6b3e' : '#2a6038'); } });
          cluFlag(B, club.x - sd * (w / 2 + 1.1), club.y + d / 2 + 0.6, 4.6, '#2f6b3e', '#f1d04a', 1.3); }
        if (shop){ var sdp = shop.d;
          house(B, shop, { wh:2.2, rh:1.1, ov:0.3,
            wall:function(dx, dy, t){ if (dy > sdp / 2 - 0.15 && Math.abs(dx - 1.2) < 0.4 && t < 1.7) return '#7a3a2a';
              if (dy > sdp / 2 - 0.15 && Math.abs(dx + 0.7) < 1.1 && t > 0.7 && t < 1.6) return Math.abs(dx + 0.7) < 0.03 ? '#ffffff' : '#bfe0ee';
              if (dy > sdp / 2 - 0.15 && t > 1.8 && t < 2.1 && Math.abs(dx) < 1.6) return '#1f4a2c'; return t < 0.25 ? '#b8ae98' : '#efe6d2'; },
            roof:function(dx, dy, t, rr, eave){ return eave ? '#3a3a42' : (Math.floor(t * 4) % 2 ? '#56565e' : '#4a4a52'); } });
          var ax = shop.x - 0.7, ay = shop.y + sdp / 2, az = B.gz(ax, ay);   // the striped awning over the shop window
          B.solid(ax - 1.4, ay, az + 1.5, ax + 1.4, ay + 0.75, az + 2.0, function(px, py, pz){ var u = py - ay, t = pz - az; if (Math.abs(t - (1.95 - u * 0.55)) > 0.06) return null; return Math.floor((px - ax + 3) * 2.5) % 2 ? '#d8433a' : '#f8f4ec'; }); }
        cars.forEach(function(q){ cluCar(B, q.x, q.y, q.c, q.k); }); cluPGreenBuild(B, pg);
        lamps.forEach(function(p){ lamp(B, p[0], p[1], '#2a2a30', '#fff3c4'); });
        if (washer){ var wx = washer.x, wy = washer.y, wz = B.gz(wx, wy);   // a ball washer on its post, a towel hung on it
          B.solid(wx - 0.3, wy - 0.3, wz, wx + 0.3, wy + 0.3, wz + 1.25, function(px, py, pz){ var t = pz - wz, r = Math.hypot(px - wx, py - wy); if (t < 0.85) return r < 0.06 ? '#2a5a3a' : null;
            if (t < 1.15 && Math.abs(px - wx) < 0.2 && Math.abs(py - wy) < 0.13) return t > 1.1 ? '#2a5a3a' : '#3a7a4e'; if (Math.abs(px - wx - 0.22) < 0.03 && t > 0.75 && t < 1.05 && Math.abs(py - wy) < 0.1) return '#f4f4f4'; return null; }); }
        if (bench){ var bx = bench.x, by = bench.y, bz = B.gz(bx, by);
          B.solid(bx - 1.1, by - 0.4, bz, bx + 1.1, by + 0.4, bz + 1, function(px, py, pz){ var dx = px - bx, dy = py - by, t = pz - bz; if (Math.abs(dx) > 1) return null;
            if (Math.abs(t - 0.45) < 0.06 && Math.abs(dy) < 0.25) return '#8a6a44'; if (dy < -0.18 && dy > -0.28 && t > 0.5 && t < 0.9) return '#8a6a44';
            if (Math.abs(Math.abs(dx) - 0.85) < 0.07 && t < 0.45) return '#2a2a30'; return null; }); }
        if (club) for (var i = 0; i < 7; i++){ var fx = club.x - club.w / 2 + 0.5 + i * ((club.w - 1) / 6); if (Math.abs(fx - club.x) < 1.3) continue;   // roses in the bed
          bush(B, fx, club.y + club.d / 2 + 0.78, 0.26, ['#3b8f4a', i % 2 ? '#e8577a' : '#f4d23a', '#2f7d3e']); }
      },
      fill:{ on:['grass'], trees:0.38, lows:0.1, tree:function(B, x, y, i){ cluTree(B, x, y, 3.8 + hash(i, seed, 31) * 1.6, i + seed * 11); }, low:function(B, x, y, i){ cluBushes(B, x, y, i, seed); } },
      bg:'#6ea24f', gain:1.6,
      mats:{ grass:CLU_GRASS, slab:CLU_SLAB, pg:CLU_PG,
        tar:['#55585e', '#5f6268', '#4c4f55', 0.1, function(c, R){ return R(cluPatch(c, 0.1, 23, ['#55585e', '#5f6268', '#4c4f55'])); }],
        line:['#f2f2ec', '#ffffff', '#e2e2dc', 0.1, function(c, R){ return R('#f2f2ec'); }], kerb:['#c8c4b8', '#d8d4c8', '#b8b4a8', 0.1, function(c, R){ return R('#c8c4b8'); }],
        bed:['#6a4a32', '#7a5a3e', '#5a3e2a', 0.1, function(c, R){ return R(cluPatch(c, 0.2, 25, ['#6a4a32', '#7a5a3e', '#5a3e2a'])); }] }
    };
  }

  // 2. THE PRACTICE RANGE: the range opens out behind the hole, striped and scattered with balls, three target greens with
  // their flags and distance boards, the netting along the far end. The covered bays stand to one side, and the practice
  // bunker (the Sand Bar) lies low beside the hole.
  function cluRange(L){
    var C = L.C, E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot, spotRect = L.spotRect;
    var sd = hash(seed, 3, 9) < 0.5 ? -1 : 1, edgeY = P0[1] - 2.2;
    var bays = spotRect(11, 2.6, function(x, y){ return -Math.abs(y - (P0[1] - 3.4)) * 0.8 - Math.abs(x - P1[0] * (sd > 0 ? 1 : 0) - P0[0] * (sd > 0 ? 0 : 1) - sd * 2) * 0.6; });
    var tg = [], TCOL = ['#e53935', '#f1d04a', '#1e88e5'];
    for (var i = 0; i < 3; i++){ var t = spot(1.6 + i * 0.2, function(x, y){ return -Math.abs(y - (P0[1] - 6 - i * 5.5)) * 1.4 - Math.abs(x - L.cx - (i - 1) * 4.5 * sd) * 0.5; }); if (t) tg.push(t); }
    var bunker = spot(2.2, function(x, y){ return -Math.hypot(x - L.cx + sd * 3.5, y - P1[1] - 5); });
    var pg = cluPGreen(L, L.cx + sd * 4.5, P1[1] + 4.5);
    var boards = []; tg.forEach(function(t, k){ var b = spot(0.5, function(x, y){ return -Math.hypot(x - t.x - sd * 2.6, y - t.y + 0.3); }); if (b) boards.push({ x:b.x, y:b.y, k:k }); });
    var hut = spotRect(3, 2.4, function(x, y){ return bays ? -Math.hypot(x - bays.x - sd * 7.4, y - bays.y) : -Math.abs(y - P0[1] + 3); });
    function rangeK(x, y){ return y < edgeY - 0.6 + (vn(x * 0.2, 4, seed) - 0.5) * 0.6 ? 1 : 0; }
    function tgD(x, y){ for (var k = 0; k < tg.length; k++){ var d = 1 - Math.hypot((x - tg[k].x) / tg[k].r, (y - tg[k].y) / (tg[k].r * 0.8)); if (d > 0) return d; } return 0; }
    function bunD(x, y){ return bunker ? 1 - Math.hypot((x - bunker.x) / bunker.r, (y - bunker.y) / (bunker.r * 0.7)) + (fbm(x * 0.5, y * 0.5, seed + 3) - 0.5) * 0.3 : -1; }
    var netY = Math.max(E[1] + 1.5, P0[1] - 24);
    return {
      h:function(x, y){ var z = (fbm(x * 0.04, y * 0.05, seed) - 0.45) * 0.9 * sm(1.5, 7, clearAt(x, y)); var g = tgD(x, y); if (g > 0) z += 0.12 + g * 0.1; var b = bunD(x, y); if (b > 0) z -= 0.18 * Math.min(1, b * 3); if (cluPGreenD(pg, x, y) > -0.1) z = z * 0.3 + 0.06; return z; },
      mat:function(x, y){ if (bunD(x, y) > 0) return ['sand']; if (bunD(x, y) > -0.12) return ['lip']; if (tgD(x, y) > 0) return ['tgreen']; var g = cluPGreenD(pg, x, y); if (g > 0) return ['tgreen']; if (g > -0.1) return ['lip'];
        if (bays && Math.abs(x - bays.x) < bays.w / 2 + 0.3 && y > bays.y - bays.d / 2 - 0.3 && y < bays.y + bays.d / 2 + 0.3) return ['mat']; return rangeK(x, y) ? ['range'] : ['grass']; },
      build:function(B){
        cluPGreenBuild(B, pg);
        tg.forEach(function(t, k){ cluFlag(B, t.x + 0.2, t.y - 0.1, 2.6 + k * 0.3, TCOL[k], null, 0.9); });
        boards.forEach(function(b){ var zb = B.gz(b.x, b.y), col = TCOL[b.k];   // the distance board for each target, in its flag's colour
          B.solid(b.x - 0.6, b.y - 0.15, zb, b.x + 0.6, b.y + 0.15, zb + 1.7, function(px, py, pz){ var dx = px - b.x, t = pz - zb; if (t < 1 && Math.abs(Math.abs(dx) - 0.35) < 0.05 && Math.abs(py - b.y) < 0.05) return '#f4f4f4';
            if (t >= 1 && t < 1.65 && Math.abs(dx) < 0.55 && Math.abs(py - b.y) < 0.07){ if (Math.abs(dx) > 0.47 || t > 1.58 || t < 1.07) return '#f4f4f4'; return Math.abs(t - 1.32) < 0.12 && Math.abs(dx) < 0.3 && (Math.floor((dx + 1) * 12) % 3) ? '#f4f4f4' : col; } return null; }); });
        if (bays){ var X = bays.x, Y = bays.y, W = bays.w, D = bays.d, zb = B.gz(X, Y), n = 5;   // the covered bays, open to the range, a roof on posts, a basket of balls in each
          B.solid(X - W / 2 - 0.2, Y - D / 2 - 0.3, zb - 0.05, X + W / 2 + 0.2, Y + D / 2 + 0.3, zb + 3.1, function(px, py, pz){ var dx = px - X, dy = py - Y, t = pz - zb;
            var roof = 2.4 + (dy + D / 2) * 0.22; if (t > roof && t < roof + 0.2 && Math.abs(dx) < W / 2 + 0.15 && Math.abs(dy) < D / 2 + 0.3) return Math.abs(dy) > D / 2 + 0.15 ? '#1f4a2c' : (Math.floor(dx * 2 + 20) % 2 ? '#2f6b3e' : '#2a6038');
            var bay = (dx + W / 2) / (W / n), bf = bay - Math.floor(bay);
            if (dy > D / 2 - 0.25 && t < 0.9 && Math.abs(dx) < W / 2) return Math.floor(t * 6) % 2 ? '#e8e2d0' : '#d8d0bc';   // the low back wall
            if ((bf < 0.04 || bf > 0.96 || Math.abs(dx) > W / 2 - 0.1) && Math.abs(dy) > D / 2 - 0.2 && t < roof) return '#e8e2d0';   // posts
            if (bf > 0.6 && bf < 0.8 && Math.abs(dy - 0.3) < 0.22 && t < 0.42){ return t > 0.32 ? (Math.floor((px + py) * 16) % 3 ? '#ffffff' : '#e8e8e2') : '#2a5a8a'; }   // the basket
            if (t < 0.05 && Math.abs(dx) < W / 2) return bf > 0.25 && bf < 0.55 && Math.abs(dy + 0.1) < 0.5 ? '#3f8a4a' : '#2a6a3a';
            return null; }); }
        if (hut){ house(B, hut, { wh:2, rh:0.9, ov:0.25, wall:function(dx, dy, t){ if (dy > hut.d / 2 - 0.15 && Math.abs(dx) < 0.6 && t > 0.7 && t < 1.6) return Math.abs(t - 1.15) < 0.25 && Math.abs(dx) < 0.4 ? '#f1d04a' : '#2a2a30'; return t < 0.25 ? '#b8ae98' : '#efe6d2'; },
          roof:function(dx, dy, t, rr, eave){ return eave ? '#1f4a2c' : '#2f6b3e'; } }); }
        // the netting along the far end of the range: tall white poles and the mesh between
        var x0 = E[0] + 1, x1 = E[2] - 1;
        for (var px0 = x0; px0 < x1; px0 += 6){ (function(a, b2){ var zb = B.gz((a + b2) / 2, netY);
          B.solid(a - 0.1, netY - 0.1, zb - 0.1, b2 + 0.1, netY + 0.1, zb + 6.2, function(px, py, pz){ var t = pz - zb; if (Math.abs(px - a) < 0.09 && t < 6.1) return '#f4f4f0';
            if (Math.abs(py - netY) > 0.03 || t > 5.9) return null; var u = (px * 2.5) % 1, v = (t * 2.5) % 1; return u < 0.12 || v < 0.12 ? '#3a4a3e' : null; }); })(px0, Math.min(x1, px0 + 6)); }
      },
      fill:{ on:['grass'], trees:0.3, lows:0.08, tree:function(B, x, y, i){ if (hash(i, seed, 30) < 0.3) cluPine(B, x, y, 0.8, i); else cluTree(B, x, y, 3.8 + hash(i, seed, 31) * 1.6, i + seed * 11); }, low:function(B, x, y, i){ cluBushes(B, x, y, i, seed); } },
      bg:'#6ea24f', gain:1.5,
      mats:{ grass:CLU_GRASS,
        // the range is mown across in wide stripes, and the balls lie where they landed
        range:['#86bb62', '#90c46c', '#7cb05a', 0.1, function(c, R, h3){ if (h3(c.ti, c.tj, 41) < 0.006 + blot(c, 0.04, 42) * 0.008) return R('#ffffff');
          return R(cluPatch(c, 0.05, 43, Math.floor(c.ti / 20) % 2 ? ['#86bb62', '#8ec26a', '#80b55e'] : ['#7aaf58', '#82b75e', '#74a852'], 0.3, 0.7)); }],
        tgreen:['#5fae58', '#69b862', '#56a350', 0.1, function(c, R){ return R(cluPatch(c, 0.15, 44, ['#5fae58', '#66b45e', '#58a652'])); }],
        mat:['#c8c0aa', '#d4ccb6', '#bcb49e', 0.1, function(c, R){ return R(cluPatch(c, 0.2, 45, ['#c8c0aa', '#d4ccb6', '#bcb49e'])); }],
        sand:CLU_SAND, lip:['#6e9a4a', '#78a454', '#648e42', 0.1, function(c, R){ return R(cluPatch(c, 0.2, 46, ['#6e9a4a', '#78a454', '#648e42'])); }] }
    };
  }

  // 3. OUT ON THE COURSE: a fairway sweeps across behind the hole, striped, with a bunker at its edge and the woods close in
  // all round, firs and oaks. A cart path comes in from the side with a cart parked on it, the halfway hut stands by it,
  // and a white fence with two gates runs along the trees.
  function cluWoods(L){
    var C = L.C, E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot, spotRect = L.spotRect;
    var sd = hash(seed, 4, 9) < 0.5 ? -1 : 1;
    function fairY(x){ return P0[1] - 6.5 + (x - L.cx) * 0.18 * sd + (vn(x * 0.08, 2, seed) - 0.5) * 2.4; }
    function fairD(x, y){ return Math.abs(y - fairY(x)) - 3.4 - (vn(x * 0.15, 5, seed) - 0.5) * 1.2; }
    var bunker = spot(1.8, function(x, y){ return -Math.abs(fairD(x, y) + 0.2) * 2 - Math.abs(x - L.cx + sd * 4) * 0.2; });
    var hw = (P1[0] - P0[0]) / 2;
    var cart = [[L.cx + sd * 60, P1[1] + 4], [L.cx + sd * (hw + 2.5), P1[1] - 1], [L.cx + sd * (hw + 3), P0[1] + 1], [L.cx + sd * (hw + 5), fairY(L.cx + sd * 8) + 3]];
    var cpts = []; for (var i = 0; i < cart.length - 1; i++){ var w = wind(cart[i], cart[i + 1], seed + i, 0.8); if (i) w.shift(); cpts.push.apply(cpts, w); }
    cpts = cpts.filter(function(p){ return clearAt(p[0], p[1]) > 1.3; });
    var dCa = L.dist(cpts.length > 1 ? cpts : null); function onCart(x, y){ return dCa(x, y) < 0.7; }
    cpts.forEach(function(p, k){ if (k % 2 === 0) L.used.push({ x:p[0], y:p[1], r:0.8 }); });
    var buggy = null; if (cpts.length > 4){ var q = cpts[Math.floor(cpts.length * 0.45)]; if (clearAt(q[0], q[1]) > 2) buggy = { x:q[0], y:q[1] }; }
    var hut = spotRect(3.2, 2.6, function(x, y){ return L.side(x) * 3 - Math.abs(y - P0[1] - 2) * 0.4 - Math.abs(x - L.cx - sd * 9) * 0.3 - (onCart(x, y) ? 9 : 0); });
    var fence = []; for (var fx = E[0] + 1; fx < E[2] - 1; fx += 2) fence.push([fx, fairY(fx) - 4.4 + (vn(fx * 0.1, 8, seed) - 0.5) * 0.4]);
    var gates = [L.cx - 5, L.cx + 6];
    var tee = L.spotRect(5, 3, function(x, y){ return -Math.hypot(x - L.cx + sd * 3, y - P1[1] - 5) - (onCart(x, y) ? 9 : 0); });
    function inTee(x, y){ return tee && Math.abs(x - tee.x) < tee.w / 2 && Math.abs(y - tee.y) < tee.d / 2; }
    function bunD(x, y){ return bunker ? 1 - Math.hypot((x - bunker.x) / (bunker.r * 1.3), (y - bunker.y) / (bunker.r * 0.7)) + (fbm(x * 0.5, y * 0.5, seed + 3) - 0.5) * 0.3 : -1; }
    return {
      h:function(x, y){ var z = (fbm(x * 0.05, y * 0.05, seed) - 0.45) * 2 * sm(1.5, 7, clearAt(x, y)); var b = bunD(x, y); if (b > 0) z -= 0.2 * Math.min(1, b * 3); if (onCart(x, y)) z = z * 0.6 - 0.02; if (inTee(x, y)) return 0.18; return z; },
      mat:function(x, y){ if (onCart(x, y)) return ['cart']; if (inTee(x, y)) return ['teebox']; var b = bunD(x, y); if (b > 0) return ['sand']; if (b > -0.12) return ['lip'];
        var f = fairD(x, y); if (f < 0) return ['fair']; if (f < 0.9) return ['first']; return ['rough']; },
      build:function(B){
        for (var k = 0; k < fence.length - 1; k++){ var mx = (fence[k][0] + fence[k + 1][0]) / 2; if (gates.some(function(g){ return Math.abs(mx - g) < 1.1; })) continue; railFence(B, [fence[k], fence[k + 1]], '#f4f4f0', '#f4f4f0', '#dcdcd4'); }
        gates.forEach(function(g, n){ var gy = fairY(g) - 4.4 + (vn(g * 0.1, 8, seed) - 0.5) * 0.4, zb = B.gz(g, gy); if (clearAt(g, gy) < 1.5) return;   // a five bar gate, standing open
          B.solid(g - 1.2, gy - 1.2, zb, g + 1.2, gy + 0.3, zb + 1.3, function(px, py, pz){ var t = pz - zb; if ((Math.hypot(px - g + 1, py - gy) < 0.1 || Math.hypot(px - g - 1, py - gy) < 0.1) && t < 1.25) return '#dcdcd4';
            var u = px - (g - 1), v = py - gy, a = n ? 0.9 : 0.35, al = u * Math.cos(a) - v * Math.sin(a), ac = Math.abs(u * Math.sin(a) + v * Math.cos(a)); if (ac > 0.05 || al < 0 || al > 1.85) return null;
            return (Math.abs(t - 0.3) < 0.05 || Math.abs(t - 0.65) < 0.05 || Math.abs(t - 1.0) < 0.05 || al > 1.8 || Math.abs(t - (0.3 + al * 0.38)) < 0.06) && t < 1.1 ? '#f4f4f0' : null; }); });
        if (tee) [-1, 1].forEach(function(s){ var mx = tee.x + s * 1.2, my = tee.y - 0.6, mz = B.gz(mx, my);   // the tee markers, two red balls
          B.solid(mx - 0.25, my - 0.25, mz, mx + 0.25, my + 0.25, mz + 0.45, function(px, py, pz){ return Math.hypot(px - mx, py - my, pz - mz - 0.2) < 0.2 ? (pz - mz > 0.3 ? '#ff6a5a' : '#d8433a') : null; }); });
        if (buggy){ var X = buggy.x, Y = buggy.y, zb = B.gz(X, Y);   // the golf cart: white canopy on four posts, a bag strapped on the back
          B.solid(X - 1.4, Y - 0.8, zb, X + 1.4, Y + 0.8, zb + 2.1, function(px, py, pz){ var dx = px - X, dy = py - Y, t = pz - zb;
            if (t < 0.25) return Math.abs(Math.abs(dx) - 0.8) < 0.22 && Math.abs(dy) > 0.5 && Math.abs(dy) < 0.68 ? '#1e1e22' : null;
            if (Math.abs(dy) > 0.65 || Math.abs(dx) > 1.25) return null;
            if (t > 1.85 && t < 2.0) return '#f4f4f0';
            if (t > 0.6 && t < 1.85 && Math.abs(Math.abs(dx) - 1.0) < 0.05 && Math.abs(Math.abs(dy) - 0.55) < 0.06) return '#9aa0a8';
            if (t < 0.6) return Math.abs(dx) > 1.15 ? '#e8e8e2' : '#f4f4f0';
            if (t < 0.95 && dx < 0.4 && dx > -0.5) return t < 0.65 ? '#f4f4f0' : (dx < -0.35 ? '#2a5a3a' : null);   // the seat
            if (dx < -0.85 && t < 1.5 && Math.abs(dy) < 0.32) return t > 1.35 ? '#e8b83a' : '#c8402e';   // the bag
            if (dx > 0.75 && dx < 0.85 && t > 0.6 && t < 1.6 && Math.abs(dy) < 0.5) return '#cfe6f2';
            return null; }); }
        if (hut){ var hx = hut.x, hy = hut.y, hz = B.gz(hx, hy);   // the halfway hut: a kiosk with a striped awning
          house(B, hut, { wh:2.1, rh:0.9, ov:0.3, wall:function(dx, dy, t){ if (dy > hut.d / 2 - 0.15 && Math.abs(dx) < 1 && t > 0.9 && t < 1.7) return '#3a2a1e'; return (Math.floor(dx * 3 + 30) % 2) ? '#a8784a' : '#986a40'; },
            roof:function(dx, dy, t, rr, eave){ return eave ? '#5a2a1e' : (Math.floor(t * 4) % 2 ? '#a8442e' : '#943a26'); } });
          B.solid(hx - 1.2, hy + hut.d / 2, hz + 1.65, hx + 1.2, hy + hut.d / 2 + 0.7, hz + 2.1, function(px, py, pz){ var u = py - hy - hut.d / 2, t = pz - hz; if (Math.abs(t - (2.05 - u * 0.5)) > 0.06) return null; return Math.floor((px - hx + 3) * 2.5) % 2 ? '#2f7d3e' : '#f8f4ec'; }); }
      },
      fill:{ on:['rough'], trees:0.66, lows:0.18, tree:function(B, x, y, i){ if (hash(i, seed, 30) < 0.45) cluPine(B, x, y, 0.75 + hash(i, seed, 32) * 0.25, i); else cluTree(B, x, y, 4 + hash(i, seed, 31) * 1.8, i + seed * 11); },
        low:function(B, x, y, i){ var k = hash(i, seed, 62); if (k < 0.6) bush(B, x, y, 0.45, ['#2f7d3e', '#25693a', '#3b8f4a']); else rockAt(B, x, y, 0.32, ['#8a8a82', '#a0a096']); } },
      bg:'#4f8a3e', gain:1.7,
      mats:{ fair:['#86bf62', '#90c86c', '#7cb45a', 0.1, function(c, R){ return cluMow(c, R, 14, 12, ['#86bf62', '#8ec66a', '#80b85e'], ['#7ab356', '#82ba5e', '#74ac52'], 1); }],
        first:['#6aa24a', '#72aa52', '#609842', 0.1, function(c, R){ return R(cluPatch(c, 0.12, 13, ['#6aa24a', '#72aa52', '#649c46'])); }],
        rough:['#4f8a3e', '#5a9646', '#467e36', 0.1, function(c, R){ return R(cluPatch(c, 0.08, 14, ['#4f8a3e', '#5a9646', '#447a34'])); }],
        teebox:['#6fb455', '#78bc5e', '#66aa4e', 0.1, function(c, R){ return cluMow(c, R, 4, 16, ['#78bc5e', '#80c464', '#72b658'], ['#6cb052', '#74b85a', '#66aa4e']); }],
        cart:CLU_TAR, sand:CLU_SAND, lip:['#5a9646', '#62a04c', '#508a40', 0.1, function(c, R){ return R(cluPatch(c, 0.2, 15, ['#5a9646', '#62a04c', '#508a40'])); }] }
    };
  }

  // 4. THE MILL CREEK: a creek runs along behind the hole, a stone bridge over it, the old water mill on the far bank with
  // its wheel down in the water, and up on the hill beyond, the windmill. Willows, reeds and ducks.
  function cluMill(L){
    var C = L.C, E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot;
    var sd = hash(seed, 5, 9) < 0.5 ? -1 : 1, HW = 1.5;
    function ckY(x){ return P0[1] - 3.6 + (vn(x * 0.09, 3, seed) - 0.5) * 2.2 + Math.sin(x * 0.12 + seed) * 0.6; }
    function ckD(x, y){ return Math.abs(y - ckY(x)) - HW * (1 + (vn(x * 0.3, 6, seed) - 0.5) * 0.3); }
    var millX = L.cx + sd * Math.min(7, (E[2] - E[0]) * 0.18), mill = { x:millX, y:ckY(millX) - HW - 2.6, w:6, d:4 }; L.used.push({ x:mill.x, y:mill.y, r:4.2 });
    var bridgeX = sd > 0 ? P0[0] - 2.6 : P1[0] + 2.6, bY = ckY(bridgeX); L.used.push({ x:bridgeX, y:bY, r:2.6 });
    var wmX = L.cx - sd * Math.min(9, (E[2] - E[0]) * 0.24), wm = { x:wmX, y:ckY(wmX) - HW - 8 }; L.used.push({ x:wm.x, y:wm.y, r:2.6 });
    var willows = []; for (var i = 0; i < 4; i++){ var w = spot(1.4, function(x, y){ return -Math.abs(ckD(x, y) - 1.6) * 1.5 + hash(x | 0, y | 0, seed + 20 + i) * 2 + L.side(x) * 1.5; }, function(x, y){ return ckD(x, y) > 1.0 && y < ckY(x); }); if (w) willows.push(w); }
    var reeds = []; for (var rx = E[0] + 1; rx < E[2] - 1; rx += 1.1){ var ry = ckY(rx) + HW * (hash(rx * 3 | 0, 1, seed) < 0.5 ? -1 : 1) * 1.05; if (hash(rx * 7 | 0, 2, seed) < 0.45 && clearAt(rx, ry) > 1.2 && Math.abs(rx - bridgeX) > 2.4 && Math.abs(rx - mill.x) > 3.4) reeds.push([rx, ry]); }
    var ducks = []; for (i = 0; i < 3; i++){ var dx0 = L.cx + (hash(i, seed, 71) - 0.5) * (E[2] - E[0]) * 0.6; if (Math.abs(dx0 - bridgeX) > 2 && Math.abs(dx0 - mill.x - 2) > 2 && clearAt(dx0, ckY(dx0)) > 1) ducks.push([dx0, ckY(dx0) + (hash(i, seed, 72) - 0.5) * 0.8]); }
    var walk = L.route([bridgeX, bY + HW + 1.4], [bridgeX - sd * 1.5, E[3] + 1], seed + 8, 1.2), dWk = L.dist(walk);
    function onWalk(x, y){ return dWk(x, y) < 0.6 && ckD(x, y) > 0.3; }
    walk.forEach(function(p, k){ if (k % 2) L.used.push({ x:p[0], y:p[1], r:0.7 }); });
    function wmD(x, y){ return Math.hypot(x - wm.x, (y - wm.y) * 1.2); }
    return {
      h:function(x, y){ var k = sm(1, 5, clearAt(x, y)), z = (fbm(x * 0.05, y * 0.05, seed) - 0.45) * 1.4 * k, cd = ckD(x, y);
        if (y < ckY(x)) z += Math.min(2.4, Math.max(0, ckY(x) - HW - y) * 0.16) * k * sm(1, 5, cd) + Math.max(0, 1.6 - wmD(x, y) * 0.18) * k;   // the far bank climbs to the windmill's hill
        if (cd < 0) return -0.35; if (cd < 0.7) z = Math.min(z, -0.3 + cd * 0.4); return z; },
      mat:function(x, y){ var cd = ckD(x, y); if (cd < 0) return ['jpool', { dep:-cd }]; if (cd < 0.45) return ['bank']; if (onWalk(x, y)) return ['gravel']; return ['meadow']; },
      build:function(B){
        (function(){ var X = bridgeX, Y = bY, zw = -0.35, sp = HW + 1.4;   // the stone bridge: a hump of dressed stone over one arch, a low parapet
          B.solid(X - 1.4, Y - sp - 0.4, zw - 0.2, X + 1.4, Y + sp + 0.4, zw + 2.1, function(px, py, pz){ var dx = px - X, dy = py - Y, t = pz - zw;
            if (Math.abs(dx) > 1.2 || Math.abs(dy) > sp + 0.3) return null; var top = 1.05 + 0.6 * Math.cos(Math.min(1, Math.abs(dy) / (sp + 0.3)) * 1.57);
            if (t > top + 0.45) return null; if (t > top && Math.abs(dx) < 0.95) return null;
            if (Math.abs(dy) < HW + 0.2 && t < Math.sqrt(Math.max(0, 1 - dy * dy / ((HW + 0.2) * (HW + 0.2)))) * 0.95 && Math.abs(dx) < 1.25) return null;   // the arch
            if (t > top - 0.08 && t <= top && Math.abs(dx) < 0.95) return '#b8b0a0';
            var row = Math.floor(t * 3), col = Math.floor(dy * 2 + (row % 2) * 0.5); if ((t * 3) % 1 < 0.12) return '#8a8478'; return hash(col, row, seed + 3) < 0.35 ? '#a8a294' : '#b8b2a4'; }); })();
        (function(){ var X = mill.x, Y = mill.y, w = mill.w, d = mill.d;   // the water mill: stone walls, a red tile roof, the wheel turning in the creek below the bank
          house(B, mill, { wh:3, rh:1.8, ov:0.35, chim:'#8a5a42',
            wall:function(dx, dy, t){ if (dy > d / 2 - 0.15 && Math.abs(dx + 1) < 0.55 && t < 1.8) return '#4a2e1c';
              if (dy > d / 2 - 0.15 && Math.abs(dx - 1.2) < 0.45 && t > 1.6 && t < 2.5) return Math.abs(dx - 1.2) < 0.04 ? '#ffffff' : '#9fd0e8';
              var row = Math.floor(t * 2.6), col = Math.floor(dx * 1.4 + (row % 2) * 0.5); if ((t * 2.6) % 1 < 0.1) return '#8e877a'; return hash(col, row, seed + 7) < 0.3 ? '#bfb6a4' : '#cfc6b2'; },
            roof:function(dx, dy, t, rr, eave){ return eave ? '#7a2e1e' : (Math.floor(t * 5) % 2 ? '#b8482e' : '#a63e28'); } });
          var wx = X + sd * (w / 2 - 1.2), wy = Y + d / 2 + 0.55, wz = -0.1, R = 1.6;
          B.solid(wx - R - 0.1, wy - 0.4, wz - R, wx + R + 0.1, wy + 0.4, wz + R + 0.1, function(px, py, pz){ var dx = px - wx, dz = pz - wz, r = Math.hypot(dx, dz), a = Math.atan2(dz, dx);
            if (Math.abs(py - wy) > 0.32 || r > R) return null; if (r < 0.22) return '#3a2a1e';
            if (r > R - 0.18) return Math.abs(py - wy) > 0.22 ? '#5a3a24' : null;
            var sp = ((a / (Math.PI / 6)) % 1 + 1) % 1; if (r > R - 0.5 && sp < 0.18) return '#7a5234';   // the paddles
            if (Math.abs(py - wy) > 0.2 && (sp < 0.06 || sp > 0.94)) return '#6a4a2e'; return null; }); })();
        (function(){ var X = wm.x, Y = wm.y, zb = B.gz(X, Y), H = 5.2;   // the windmill on the hill: a white tower, a red cap, four sails
          B.solid(X - 1.6, Y - 1.6, zb - 0.1, X + 1.6, Y + 1.6, zb + H + 1.2, function(px, py, pz){ var dx = px - X, dy = py - Y, t = pz - zb, r = Math.hypot(dx, dy);
            if (t < H){ var R0 = 1.5 - t * 0.12; if (r > R0) return null;
              if (dy > R0 - 0.15 && Math.abs(dx) < 0.4 && t < 1.3) return '#4a2e1c'; if (dy > R0 - 0.15 && Math.abs(dx) < 0.25 && Math.abs(t - 3.2) < 0.3) return '#9fd0e8';
              return Math.floor(t * 3) % 2 ? '#f6f3ea' : '#e8e2d2'; }
            if (t < H + 1.1 && Math.hypot(dx, dy, (t - H) * 1.2) < 1.25) return Math.floor(dx * 3 + 9) % 2 ? '#8a3a2a' : '#7a3222'; return null; });
          B.solid(X - 3.3, Y + 1.25, zb + H - 2.8, X + 3.3, Y + 1.45, zb + H + 3.9, function(px, py, pz){ var dx = px - X, dy = py - Y, t = pz - zb;   // its sails, on their own thin sheet
            if (Math.abs(dy - 1.35) > 0.08) return null; var ux = dx, uz = t - H - 0.55, rr = Math.hypot(ux, uz); if (rr < 0.2) return '#3a2a1e'; if (rr > 3.2) return null;
            var an = Math.atan2(uz, ux) - 0.4, k = Math.round(an / (Math.PI / 2)), da = an - k * Math.PI / 2, along = rr * Math.cos(da), across = rr * Math.sin(da);
            if (Math.abs(across) < 0.07) return '#5a3a24'; if (along > 0.6 && across > 0 && across < 0.55){ var g = (along * 3) % 1, h2 = (across * 6) % 1; return g < 0.12 || h2 < 0.2 ? '#6a4a2e' : '#f4efe2'; } return null; }); })();
        willows.forEach(function(w, i){ var zb = B.gz(w.x, w.y), H = 3.6 + hash(i, seed, 8) * 1, R = 1.8;   // a weeping willow: a crown that falls in curtains
          B.vox(w.x - R - 0.4, w.y - R, zb - 0.1, w.x + R + 0.4, w.y + R, zb + H + 0.6, function(set){ B.tube(set, w.x, w.y, zb, w.x, w.y, zb + H * 0.7, 0.24, 0.16, '#5a4a32');
            B.blob(set, w.x, w.y, zb + H * 0.8, R * 0.85, R * 0.75, R * 0.45, function(px, py, pz){ return (Math.floor(px * 3) + Math.floor(py * 3)) % 3 ? '#7ab04a' : '#8cc05a'; });
            for (var s = 0; s < 14; s++){ var a = s / 14 * 6.28 + i, ex = w.x + Math.cos(a) * R * 0.9, ey = w.y + Math.sin(a) * R * 0.75; B.tube(set, w.x + Math.cos(a) * R * 0.5, w.y + Math.sin(a) * R * 0.4, zb + H * 0.85, ex, ey, zb + 0.6 + hash(s, i, 3) * 0.6, 0.22, 0.16, s % 2 ? '#6aa242' : '#7ab04a'); } }, B.ART); });
        reeds.forEach(function(p){ var zb = B.gz(p[0], p[1]);
          B.solid(p[0] - 0.35, p[1] - 0.2, zb - 0.1, p[0] + 0.35, p[1] + 0.2, zb + 1.2, function(px, py, pz){ var dx = px - p[0], t = pz - zb; for (var s = -1; s <= 1; s++){ var sx = s * 0.18 + t * s * 0.05; if (Math.abs(dx - sx) < 0.04 && Math.abs(py - p[1]) < 0.05 && t < 0.9 - s * s * 0.15) return t > 0.62 && s === 0 ? '#6a4a2e' : '#5a8a3a'; } return null; }); });
        ducks.forEach(function(p, i){ var zb = -0.35, X = p[0], Y = p[1], f = i % 2 ? 1 : -1;
          B.solid(X - 0.4, Y - 0.25, zb - 0.05, X + 0.4, Y + 0.25, zb + 0.5, function(px, py, pz){ var dx = (px - X) * f, dy = py - Y, t = pz - zb;
            if (Math.hypot(dx / 0.3, dy / 0.18, (t - 0.1) / 0.14) < 1) return i === 1 ? '#f4f4f0' : (dx < -0.15 ? '#3a3a3a' : '#a07a52');
            if (Math.hypot(dx - 0.22, dy, t - 0.3) < 0.1) return i === 1 ? '#f4f4f0' : '#2a7a4a'; if (dx > 0.3 && dx < 0.4 && Math.abs(dy) < 0.04 && Math.abs(t - 0.28) < 0.03) return '#f2a03a'; return null; }); });
      },
      fill:{ on:['meadow'], trees:0.34, lows:0.14, tree:function(B, x, y, i){ cluTree(B, x, y, 3.6 + hash(i, seed, 31) * 1.6, i + seed * 13); },
        low:function(B, x, y, i){ var k = hash(i, seed, 63); if (k < 0.5) bush(B, x, y, 0.36, ['#4a9a52', '#f4f1ea', '#4a9a52', '#f4d23a']); else if (k < 0.8) bush(B, x, y, 0.42, ['#3b8f4a', '#2f7d3e', '#4a9a52']); else rockAt(B, x, y, 0.32, ['#9a968c', '#b0aca0']); } },
      bg:'#6aa24a', gain:1.7,
      mats:{ meadow:['#78ae56', '#84ba60', '#6ca24c', 0.1, function(c, R){ var b = blot(c, 0.07, 15), f = blot(c, 0.4, 16); return R(b > 0.7 && f > 0.6 ? '#8ec466' : b > 0.62 ? '#84ba60' : b < 0.3 ? '#6ca24c' : '#78ae56'); }],
        gravel:['#cfc2a2', '#dcd0b2', '#bcae8c', 0.1, function(c, R){ return R(cluPatch(c, 0.25, 19, ['#cfc2a2', '#dcd0b2', '#bcae8c'])); }],
        bank:['#8a7a56', '#9a8a64', '#7a6a4a', 0.1, function(c, R){ return R(cluPatch(c, 0.2, 17, ['#8a7a56', '#9a8a64', '#6e8a42'])); }],
        jpool:['#3f8ac0', '#7cc0e4', '#2c6e9e', 0.05, function(c, R){ var d = c.dep || 0, b = blot(c, 0.08, 18); return R(d < 0.35 ? '#7cc0e4' : b > 0.66 ? '#4a96c8' : '#3a82b8'); }] }
    };
  }

  // 5. THE EIGHTEENTH: home. The big clubhouse behind the green with its terrace of tables and umbrellas, the club's flags
  // along the front, the grandstand to one side full of people, the leaderboard, and the pond on the other side with a fountain.
  function cluHome(L){
    var C = L.C, E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot, spotRect = L.spotRect;
    var club = spotRect(12, 4.4, function(x, y){ return -Math.abs(y - (P0[1] - 7.2)) * 1.2 - Math.abs(x - L.cx) * 0.4; });
    var sd = hash(seed, 6, 9) < 0.5 ? -1 : 1;
    var terrace = club ? { x:club.x, y:club.y + club.d / 2 + 1.3, w:club.w + 1, d:2.4 } : null;
    if (terrace){ L.used.push({ x:terrace.x - 3.5, y:terrace.y, r:1.9 }); L.used.push({ x:terrace.x + 3.5, y:terrace.y, r:1.9 }); L.used.push({ x:terrace.x, y:terrace.y, r:1.9 }); }
    var hw = (P1[0] - P0[0]) / 2;
    var stand = spotRect(7, 3.2, function(x, y){ return -Math.abs(y - (P0[1] + 3)) * 0.3 - Math.abs(x - L.cx - sd * (hw + 5)) * 0.8; });
    var pond = spot(2.8, function(x, y){ return -Math.abs(x - L.cx + sd * (hw + 4)) * 0.8 - Math.abs(y - (P0[1] + P1[1]) / 2) * 0.2; });
    var path = terrace ? L.route([terrace.x, terrace.y + terrace.d / 2], [C.tee[0], P1[1] + 1.4], seed + 4, 1) : null;
    var dPa = L.dist(path); function onPath(x, y){ return dPa(x, y) < 0.75; }
    var lamps = path ? path.filter(function(p, k){ return k % 3 === 1; }).map(function(p, k){ return [p[0] + (k % 2 ? 1.2 : -1.2), p[1]]; }).filter(function(p){ return clearAt(p[0], p[1]) > 0.9; }) : [];
    var board = spotRect(4.6, 0.8, function(x, y){ return -Math.abs(y - (stand ? stand.y + 6 : P0[1] + 8)) * 0.4 - Math.abs(x - L.cx - sd * (hw + 4)) * 0.8; });
    function pondD(x, y){ return pond ? 1 - Math.hypot((x - pond.x) / (pond.r * 1.25), (y - pond.y) / (pond.r * 0.8)) + (fbm(x * 0.4, y * 0.4, seed + 9) - 0.5) * 0.25 : -1; }
    function inTer(x, y){ return terrace && Math.abs(x - terrace.x) < terrace.w / 2 && Math.abs(y - terrace.y) < terrace.d / 2 + 0.2; }
    var CROWD = ['#e53935', '#1e88e5', '#ffffff', '#ffd23f', '#43a047', '#ff8a3c', '#1d2a44', '#f48fb1'];
    return {
      h:function(x, y){ var z = (fbm(x * 0.05, y * 0.05, seed) - 0.45) * 1.2 * sm(1.5, 7, clearAt(x, y)), p = pondD(x, y); if (p > 0) return -0.4; if (p > -0.15) z = Math.min(z, -0.05); if (inTer(x, y)) return 0.12; if (onPath(x, y)) z = z * 0.5 - 0.02; return z; },
      mat:function(x, y){ var p = pondD(x, y); if (p > 0) return ['lagoon', { dep:p }]; if (p > -0.1) return ['edge']; if (inTer(x, y)) return ['ter']; if (onPath(x, y)) return ['slab']; return ['grass']; },
      build:function(B){
        if (club){ var w = club.w, d = club.d;   // the clubhouse: two floors, rows of tall windows, a clock in the gable over the door
          house(B, club, { wh:3.4, rh:1.6, ov:0.45, chim:'#9a4a32', step:'#d9d2c2',
            wall:function(dx, dy, t){ var front = dy > d / 2 - 0.15;
              if (front && Math.abs(dx) < 0.7 && t < 2.1) return Math.abs(dx) < 0.05 ? '#24482d' : '#2f5d3a';
              if (front && Math.abs(t - 2.3) < 0.08) return '#1f4a2c';
              var wq = ((dx + w / 2) % 1.6 + 1.6) % 1.6; if (front && Math.abs(dx) > 1 && wq > 0.45 && wq < 1.15 && ((t > 0.8 && t < 1.95) || (t > 2.5 && t < 3.15))) return (Math.abs(wq - 0.8) < 0.04 || Math.abs(t - 1.4) < 0.04) ? '#ffffff' : '#9fd0e8';
              if (t < 0.3) return '#cfc8b6'; return (Math.floor(t * 5) % 2) ? '#f8f5ee' : '#ece7da'; },
            roof:function(dx, dy, t, rr, eave){ if (Math.abs(dx) < 1.1 && dy > 0 && rr < 0.5) return Math.hypot(dx, t - 4.0) < 0.38 ? (Math.hypot(dx, t - 4.0) < 0.3 ? '#fbf6e6' : '#1f4a2c') : '#f4f1ea'; return eave ? '#1f4a2c' : (Math.floor(t * 4) % 2 ? '#2f6b3e' : '#2a6038'); } });
          [-1, 1].forEach(function(s){ bush(B, club.x + s * (w / 2 + 0.2), club.y + d / 2 + 0.8, 0.5, ['#2f7d3e', '#3b8f4a', '#25693a']); }); }
        if (terrace){ var T = terrace, cols = ['#d8433a', '#f4f1ea', '#2f6b3e', '#f1d04a'];   // tables under umbrellas on the terrace, a white rail along its front
          for (var k = 0; k < 4; k++){ (function(k){ var tx = T.x - T.w / 2 + 1.5 + k * ((T.w - 3) / 3), ty = T.y - 0.2, tz = B.gz(tx, ty), col = cols[k % 4];
            if (clearAt(tx, ty) < 1.5) return;
            B.solid(tx - 1.2, ty - 1.2, tz, tx + 1.2, ty + 1.2, tz + 2.3, function(px, py, pz){ var r = Math.hypot(px - tx, py - ty), t = pz - tz;
              if (r < 0.05 && t < 2.1) return '#e8e8e2'; if (t > 1.7 && t < 2.2){ var cap = 1.1 * (1 - (t - 1.7) / 0.5); if (r < cap && r > cap - 0.14) return Math.floor((Math.atan2(py - ty, px - tx) + 4) * 2.55) % 2 ? col : '#ffffff'; }
              if (Math.abs(t - 0.7) < 0.05 && r < 0.55) return '#f4f4f0'; if (r > 0.75 && r < 0.95 && t < 0.42 && Math.floor((Math.atan2(py - ty, px - tx) + 4) * 1.3) % 2) return t > 0.36 ? '#7a5a3e' : (r > 0.88 ? '#6a4a2e' : null); return null; }); })(k); }
          var rz = B.gz(T.x, T.y) + 0.12, ry = T.y + T.d / 2 + 0.05;
          B.solid(T.x - T.w / 2, ry - 0.1, rz - 0.05, T.x + T.w / 2, ry + 0.1, rz + 0.75, function(px, py, pz){ var dx = Math.abs(px - T.x), t = pz - rz; if (dx < 1 || clearAt(px, py) < 0.4) return null; if (t > 0.62) return '#f4f4f0'; return ((px * 2.5) % 1 + 1) % 1 < 0.15 ? '#f4f4f0' : null; });
          [-1, 1].forEach(function(s){ for (var f = 0; f < 2; f++) cluFlag(B, T.x + s * (T.w / 2 + 0.4 + f * 1.4), T.y + T.d / 2 - 0.3, 4.8, ['#2f6b3e', '#d8433a', '#1e5aa8', '#f1d04a'][(f + (s > 0 ? 2 : 0)) % 4], f ? null : '#f1d04a', 1.3); }); }
        if (stand){ var sx = stand.x, sy = stand.y, sz = B.gz(sx, sy), sw = stand.w, sdp = stand.d, rows = 4, rh = 0.55;   // the grandstand, back row highest, every seat taken
          B.solid(sx - sw / 2, sy - sdp / 2, sz - 0.1, sx + sw / 2, sy + sdp / 2, sz + rows * rh + 1.6, function(px, py, pz){ var dx = px - sx, dy = py - sy, t = pz - sz;
            if (dy < -sdp / 2 + 0.25 && t > rows * rh + 0.9 && t < rows * rh + 1.5) return Math.abs(dx) < sw / 2 - 0.2 ? (Math.floor(dx * 1.2 + 9) % 2 ? '#2f6b3e' : '#f4f1ea') : null;   // the club's banner along the top
            if (Math.abs(Math.abs(dx) - (sw / 2 - 0.15)) < 0.1 && dy < -sdp / 2 + 0.25 && t < rows * rh + 1.5) return '#1d2a44';
            var row = Math.floor((sdp / 2 - dy) / (sdp / rows)), top = (row + 1) * rh; if (row < 0 || row >= rows) return null;
            if (t < top - 0.08) return (Math.abs(dx) > sw / 2 - 0.15) ? '#1d2a44' : '#2a3a5a';
            if (t < top + 0.5 && ((Math.floor(dx * 2.2 + 30) + row) % 3) !== 0 && Math.abs(dx) < sw / 2 - 0.25){ var kk = hash(Math.floor(dx * 2.2 + 30), row, seed); return t > top + 0.36 ? (kk < 0.5 ? '#6a4a30' : '#e8c8a0') : CROWD[Math.floor(kk * CROWD.length)]; }
            return null; }); }
        if (board){ var bx = board.x, by = board.y, bz = B.gz(bx, by), bw = board.w;   // the leaderboard on its two legs
          B.solid(bx - bw / 2, by - 0.4, bz, bx + bw / 2, by + 0.4, bz + 3.6, function(px, py, pz){ var dx = px - bx, t = pz - bz;
            if (t < 1.4) return (Math.abs(Math.abs(dx) - bw * 0.35) < 0.1 && Math.abs(py - by) < 0.1) ? '#1d2a44' : null;
            if (Math.abs(py - by) > 0.2) return null; if (Math.abs(dx) > bw / 2 - 0.08 || t > 3.5) return '#0f1626';
            if (t > 3.1) return '#f1d04a'; var r = Math.floor((t - 1.4) / 0.34); return (r % 2 && Math.abs(dx) < bw / 2 - 0.35) ? (dx < -bw * 0.15 ? '#ffffff' : '#ff5a5a') : '#173a24'; }); }
        if (pond){ var fx = pond.x, fy = pond.y, fz = -0.4;   // the fountain in the pond
          if (B.light) B.light(fx, fy, fz + 1.4, '#e8f6ff');
          B.solid(fx - 0.6, fy - 0.6, fz - 0.1, fx + 0.6, fy + 0.6, fz + 1.8, function(px, py, pz){ var r = Math.hypot(px - fx, py - fy), t = pz - fz;
            if (t < 0.3 && r < 0.5 && r > 0.35) return '#c8c4b8'; if (r < 0.09 && t < 1.7) return '#e8f6ff'; if (t > 1.1 && t < 1.7 && Math.abs(r - (1.7 - t) * 0.6) < 0.07) return '#ffffff'; if (t < 0.25 && r < 0.4) return '#bfe8f4'; return null; }); }
        lamps.forEach(function(p){ lamp(B, p[0], p[1], '#2a2a30', '#fff3c4'); });
      },
      fill:{ on:['grass'], trees:0.4, lows:0.1, tree:function(B, x, y, i){ cluTree(B, x, y, 4 + hash(i, seed, 31) * 1.8, i + seed * 17); }, low:function(B, x, y, i){ cluBushes(B, x, y, i, seed); } },
      bg:'#5f9a48', gain:1.6,
      mats:{ grass:['#6fae55', '#78b85e', '#66a44e', 0.1, function(c, R){ return cluMow(c, R, 12, 19, ['#74b25a', '#7cba60', '#6eac54'], ['#66a24c', '#6eaa52', '#5f9a46'], 1); }],
        slab:CLU_SLAB,
        ter:['#c8b89a', '#d4c4a6', '#b8a88a', 0.1, function(c, R){ if (c.ti % 6 === 0 || c.tj % 6 === 0) return R('#a89878'); return R(cluPatch(c, 0.1, 22, ['#c8b89a', '#d4c4a6', '#bcac8e'])); }],
        edge:['#b8b2a4', '#c8c2b4', '#a8a294', 0.1, function(c, R){ return R(cluPatch(c, 0.2, 24, ['#b8b2a4', '#c8c2b4', '#a8a294'])); }],
        lagoon:['#3a8ec4', '#7cc4e8', '#2a72a8', 0.05, function(c, R){ var d = c.dep || 0; return R(d < 0.12 ? '#7cc4e8' : d < 0.4 ? '#3a8ec4' : '#2e7ab4'); }] }
    };
  }
  /* ---------------- SCHOOLYARD IS A JOURNEY, the way Pirate Cove is. A school day, front door to last bell: the front steps
     and the bus loop (1 to 3), the playground (4 to 8), the courtyard between the classroom wings (9 and 10), the creek and
     the school garden (11 and 12), and the sports field with its track, bleachers and scoreboard (13 to 18). A hole with no
     place (a daily, a season) keeps the schoolyard every Schoolyard hole had before. */
  STOPS.school = [[1, 'steps'], [4, 'play'], [9, 'halls'], [11, 'garden'], [13, 'field']];
  FLY['school~steps'] = FLY['school~play'] = FLY['school~halls'] = 'song'; FLY['school~garden'] = 'butterfly'; FLY['school~field'] = 'crow';
  (function(){ var base = BUILD.school; BUILD.school = function(L){ var s = L.stop;
    return s === 'steps' ? schSteps(L) : s === 'play' ? schPlay(L) : s === 'halls' ? schHalls(L) : s === 'garden' ? schGarden(L) : s === 'field' ? schField(L) : base(L); }; })();

  // brick in running bond, a quarter foot a course, each brick its own shade from a smooth field (a hashed cell is a speckle)
  function schBrick(u, t, sd){ var row = Math.floor(t * 4), cu = u * 2 + (row % 2) * 0.5, col = Math.floor(cu);
    if (t * 4 - row < 0.2 || cu - col < 0.09) return '#c9b49c'; var n = vn(col * 0.37, row * 0.41, sd); return n > 0.66 ? '#9a3624' : n < 0.32 ? '#bd5034' : '#ac422e'; }
  // a tall window a floor high: a white frame, a cross bar, and glass that takes the sky in its top and a slant of light
  function schPane(u, tt){ if (Math.abs(u) > 0.4 || tt < 0.1 || tt > 1.45 || Math.abs(u) < 0.035 || Math.abs(tt - 0.95) < 0.04) return '#f2eee4'; return tt > 1.05 ? '#b8dcef' : (u + tt * 0.5 > 0.35 ? '#a6d0e8' : '#6fa4c8'); }
  // a smooth three tone ground: base, a lighter and a darker patch, from two noise fields (never a hashed cell)
  function schTone(c, R, f, sd, base, lite, dark){ var a = blot(c, f, sd), b = blot(c, f * 2.6, sd + 1); return R(a > 0.66 ? dark : b > 0.68 ? lite : base); }
  function schLawn(c, R, sd){ var a = blot(c, 0.1, sd), stripe = Math.floor(c.tj / 12) % 2; return R(a > 0.7 ? '#5f9e45' : stripe ? '#72b255' : '#68a84c'); }
  function schTree(B, x, y, i, seed){ broadTree(B, x, y, 2.9 + hash(i, seed, 41) * 1.4, '#5a3d2e', hash(i, seed, 42) < 0.25 ? ['#4f9a44', '#3b8a3e', '#e0a83a'] : ['#3b8f4a', '#2f7d3e', '#5aa84c'], i); }
  function schShrub(B, x, y, i, seed){ var k = hash(i, seed, 43); if (k < 0.8) bush(B, x, y, 0.42, ['#3b8f4a', '#2f7d3e', '#5aa84c']); else rockAt(B, x, y, 0.32, ['#9a9a94', '#7a7a74']); }
  function schBall(B, x, y, r, col, hi){ var zb = B.gz(x, y); B.solid(x - r, y - r, zb, x + r, y + r, zb + r * 2, function(px, py, pz){ var d = Math.hypot(px - x, py - y, pz - zb - r); return d < r ? (pz - zb > r * 1.4 && px < x ? hi : col) : null; }); }

  // the school itself: two floors of brick and tall windows under a stone parapet, a portico of four columns over the front
  // steps, and a cupola on the roof with the clock and the bell. (X, Yf) is the middle of the front wall; it runs w wide
  // and d deep back (north) from there, H high
  function schSchool(B, X, Yf, w, d, H, seed){ var zb = B.gz(X, Yf - d / 2), pw = 5.2;
    B.solid(X - w / 2 - 0.1, Yf - d, zb - 0.1, X + w / 2 + 0.1, Yf + 2.1, zb + H + 0.1, function(px, py, pz){ var dx = px - X, dy = py - Yf, t = pz - zb, ax = Math.abs(dx);
      if (dy > 0){ if (ax > pw / 2) return null;
        var top = 0.62 - Math.floor(dy / 0.42) * 0.155; if (t < top) return (dy % 0.42) > 0.34 ? '#b8b2a6' : '#dcd6ca';   // the steps
        if (dy < 1.55 && t > 3.55){ if (t < 3.95) return Math.abs(t - 3.64) < 0.04 ? '#c8c0b0' : '#efe9dc'; var pt = 3.95 + 1.05 * (1 - ax / (pw / 2));   // the beam, the pediment
          if (t < pt) return (dy > 1.38 && t < pt - 0.16 && t > 4.04) ? '#ddd5c8' : '#efe9dc'; return null; }
        for (var c = -1.5; c <= 1.5; c++) if (Math.hypot(dx - c * 1.45, dy - 1.15) < 0.2 && t < 3.55) return t < 0.75 || t > 3.36 ? '#e2dace' : '#f6f2ea';
        return null; }
      if (ax > w / 2 || dy < -d) return null;
      if (t > H - 0.3){ if (dy > -0.35 || dy < -d + 0.35 || ax > w / 2 - 0.35) return '#d8d0c0'; return t < H - 0.12 ? '#5c6068' : null; }
      if (dy > -0.12){
        if (ax < 0.95 && t < 2.35) return ax < 0.04 ? '#1c3450' : (t > 1.5 && t < 2.15 && Math.abs(ax - 0.47) < 0.28) ? '#9cc8e0' : '#2b5a8a';   // the front doors
        if (Math.abs(t - 2.95) < 0.12 || t < 0.45) return '#d0c8b8';
        var fl = t > 0.9 && t < 2.45 ? 1 : t > 3.45 && t < 5 && H > 5.4 ? 2 : 0, u = ((dx + 100.85) % 1.7) - 0.85;
        if (fl && Math.abs(u) < 0.42 && !(fl === 1 && ax < pw / 2 + 0.2) && ax < w / 2 - 0.6) return schPane(u, t - (fl === 1 ? 0.9 : 3.45)); }
      return schBrick(dx + dy, t, seed); });
    var cy = Yf - d * 0.5, zc = zb + H - 0.15;
    B.solid(X - 1, cy - 1, zc, X + 1, cy + 1, zc + 3.1, function(px, py, pz){ var dx = px - X, dy = py - cy, t = pz - zc, m = Math.max(Math.abs(dx), Math.abs(dy)), r;
      if (t < 1.1){ if (m > 0.8) return null; r = Math.hypot(dx, t - 0.58); if (dy > 0.7 && r < 0.36){ if (r > 0.3) return '#2a2a30';   // the clock
          return (Math.abs(dx) < 0.03 && t > 0.58 && t < 0.84) || (Math.abs(t - 0.58) < 0.03 && dx > 0 && dx < 0.18) ? '#1a1a20' : '#fbf8ee'; } return '#efe9dc'; }
      if (t < 1.95){ if (Math.abs(dx) > 0.56 && Math.abs(dy) > 0.56 && m < 0.74) return '#f6f2ea'; r = Math.hypot(dx, dy); return t > 1.2 && r < 0.1 + (1.85 - t) * 0.36 && t < 1.85 ? '#e2b33a' : null; }   // the bell in its open belfry
      if (t < 2.08) return m < 0.86 ? '#efe9dc' : null;
      return m < 0.86 * (1 - (t - 2.08) / 1) ? (t > 2.95 ? '#e2b33a' : '#c0392b') : null; });
  }
  // a yellow school bus, its nose to the east (k = 1) or the west (k = -1): the windows in a row, black rubbing strips, a white roof
  function schBus(B, X, Y, k){ var zb = B.gz(X, Y), Lb = 7.6, Wb = 1.1;
    B.solid(X - Lb / 2 - 0.1, Y - Wb - 0.1, zb, X + Lb / 2 + 0.1, Y + Wb + 0.1, zb + 3, function(px, py, pz){ var u = (px - X) * k, dy = py - Y, t = pz - zb, ay = Math.abs(dy), front = u > Lb / 2 - 1.3;
      var w1 = Math.hypot(u - 2.3, t - 0.4), w2 = Math.hypot(u + 2.2, t - 0.4);
      if (t < 0.8 && ay > Wb - 0.38 && ay < Wb + 0.05 && (w1 < 0.4 || w2 < 0.4)) return w1 < 0.16 || w2 < 0.16 ? '#8a8f99' : '#1c1c20';   // the wheels
      if (t < 0.35 || ay > Wb || Math.abs(u) > Lb / 2 || (front && t > 1.75) || t > 2.9) return null;
      if (t > 2.76) return ay < Wb - 0.12 ? '#f2f2ea' : '#e8a818';
      if (front && u > Lb / 2 - 0.14 && t > 0.5 && t < 1.25) return ay > 0.6 && t > 0.9 ? '#fff4c0' : '#2a2a30';   // the grille and its headlights
      if (Math.abs(t - 1.35) < 0.05 || Math.abs(t - 0.95) < 0.05 || t < 0.5) return '#1c1c20';
      if (!front && t > 1.75 && t < 2.55){ if (u > Lb / 2 - 1.45) return '#9cc8e0'; if (((u + 20) % 0.95) > 0.13 && u > -Lb / 2 + 0.3) return t > 2.32 ? '#9cc8e0' : '#2e4a62'; }
      return '#f2b01e'; });
  }
  // the flagpole on its plinth, a gold ball on top, and the school's flag (navy and gold) lifting in the wind
  function schFlag(B, x, y, H){ var zb = B.gz(x, y);
    B.solid(x - 0.4, y - 0.4, zb, x + 2.2, y + 0.4, zb + H + 0.3, function(px, py, pz){ var dx = px - x, dy = py - y, t = pz - zb;
      if (t < 0.35) return Math.max(Math.abs(dx), Math.abs(dy)) < 0.38 ? '#c8c0b0' : null;
      if (Math.hypot(dx, dy, t - H - 0.1) < 0.13) return '#e2b33a'; if (Math.hypot(dx, dy) < 0.06 && t < H) return '#d8dce2';
      var v = (t - (H - 1.35)) / 1.2; if (dx > 0.06 && dx < 2.05 && v > 0 && v < 1 && Math.abs(dy - Math.sin(dx * 2.6) * 0.07 * dx) < 0.06) return dx < 0.3 ? '#f2eee4' : v > 0.36 && v < 0.64 ? '#f2c230' : '#24447e';
      return null; });
  }

  /* 1. THE FRONT STEPS (and every Schoolyard hole with no place): the school across the top with its portico and cupola,
     the bus loop round the hole, a bus at the kerb, the flag out front, storm drains in the kerb and lamps at the road. */
  function schSteps(L){
    var E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt;
    var RW = 1.3, yR = P0[1] - 3, xL = P0[0] - 6.4, xR = P1[0] + 6.4, road = L.dist([[xL, E[3] + 4], [xL, yR], [xR, yR], [xR, E[3] + 4]]);
    var yF = yR - RW - 2.15, sw = Math.min(26, Math.max(17, P1[0] - P0[0] + 11)), sd = 4.2, s0 = hash(seed, 3, 9) < 0.5 ? -1 : 1;
    for (var bx = -sw / 2 + 2; bx <= sw / 2 - 2; bx += 3) L.used.push({ x:L.cx + bx, y:yF - 2.2, r:2.6 });
    var busX = L.cx + s0 * Math.min(sw / 2 - 1, (P1[0] - P0[0]) / 2 + 2), flagX = L.cx - s0 * 4.6;
    L.used.push({ x:busX, y:yR, r:4 }); L.used.push({ x:flagX, y:yF + 1.3, r:0.8 });
    var drains = [[L.cx + 4.4, yR + RW + 0.05, 0], [L.cx - 4.4, yR + RW + 0.05, 0], [xL + RW + 0.05, P1[1] - 1, 1], [xR - RW - 0.05, P1[1] - 1, 1]];
    var lamps = [[xL - RW - 0.7, yR + 3], [xR + RW + 0.7, yR + 3], [xL - RW - 0.7, P1[1] + 1], [xR + RW + 0.7, P1[1] + 1]].filter(function(q){ return q[0] > E[0] + 0.5 && q[0] < E[2] - 0.5 && q[1] < E[3] - 0.5; });
    lamps.forEach(function(q){ L.used.push({ x:q[0], y:q[1], r:0.6 }); });
    return {
      h:function(x, y){ if (road(x, y) < RW + 1 || y < yR) return 0; return (fbm(x * 0.08, y * 0.08, seed) - 0.45) * 0.6 * sm(4, 8, clearAt(x, y)); },
      mat:function(x, y){ var dR = road(x, y);
        for (var i = 0; i < drains.length; i++){ var g = drains[i]; if (g[2] ? Math.abs(x - g[0]) < 0.32 && Math.abs(y - g[1]) < 0.65 : Math.abs(x - g[0]) < 0.65 && Math.abs(y - g[1]) < 0.32) return ['grate', { v:g[2] }]; }
        if (dR < RW){ if (Math.abs(x - L.cx) < 1.6 && y < yR + RW) return ['zebra'];
          if (dR < 0.07 && Math.floor((x + y + 200) / 1.1) % 2) return ['paint']; return ['road']; }
        if (dR < RW + 0.3) return ['kerb'];
        if (y < yR && y > yF - 0.2 && x > xL - RW && x < xR + RW) return ['walk'];
        return ['lawn']; },
      build:function(B){
        schSchool(B, L.cx, yF, sw, sd, 5.6, seed);
        schBus(B, busX, yR - 0.15, -s0);
        schFlag(B, flagX, yF + 1.3, 7.2);
        lamps.forEach(function(q){ lamp(B, q[0], q[1], '#2a2a30', '#fff3c4'); });
      },
      fill:{ on:['lawn'], trees:0.42, lows:0.22, tree:function(B, x, y, i){ schTree(B, x, y, i, seed); }, low:function(B, x, y, i){ schShrub(B, x, y, i, seed); } },
      bg:'#5f9e45', gain:1.9,
      mats:{ lawn:['#68a84c', '#72b255', '#5f9e45', 0.18, function(c, R){ return schLawn(c, R, seed + 3); }],
        road:['#4c5058', '#555a63', '#44484f', 0.1, function(c, R){ return schTone(c, R, 0.12, seed + 5, '#4e525a', '#575c65', '#464a51'); }],
        kerb:['#c8c4ba', '#d6d2c8', '#b0aca2', 0.1, function(c, R){ return R(c.ti % 6 === 0 && c.tj % 6 === 0 ? '#b0aca2' : '#cdc9bf'); }],
        walk:['#d6d0c4', '#e0dace', '#c4beb2', 0.1, function(c, R){ if (c.ti % 6 === 0 || c.tj % 6 === 0) return R('#b8b2a6'); return schTone(c, R, 0.09, seed + 6, '#d6d0c4', '#ded8cc', '#cac4b8'); }],
        paint:['#f2c230', '#f6d050', '#e2b020', 0.05, function(c, R){ return R('#f2c230'); }],
        zebra:['#f2f2ea', '#ffffff', '#e2e2da', 0.05, function(c, R){ return R(Math.floor(c.ti / 3) % 2 ? '#f2f2ea' : '#4e525a'); }],
        grate:['#2a2c30', '#3a3d42', '#1c1e22', 0.05, function(c, R){ return R(((c.v ? c.tj : c.ti) % 2) ? '#1c1e22' : '#5a5e66'); }] }
    };
  }

  // the climbing fort: a deck on four posts, rails round it, a red and yellow peaked roof, a ladder up one side and a slide down the other
  function schFort(B, X, Y, k){ var zb = B.gz(X, Y), dk = 2.3;
    B.solid(X - 2.6, Y - 1.4, zb - 0.05, X + 3.7, Y + 1.4, zb + 5.4, function(px, py, pz){ var dx = (px - X) * k, dy = py - Y, t = pz - zb, ax = Math.abs(dx + 0.6), ay = Math.abs(dy), m = Math.max(ax, ay);
      if (ax > 1.05 && ax < 1.25 && ay > 1.05 && ay < 1.25 && t < 4.25) return '#2b6a95';   // the posts
      if (m < 1.25 && t > dk - 0.14 && t < dk) return '#c8964e';   // the deck
      if (m < 1.25 && m > 1.1 && t >= dk && t < dk + 0.95){ if (dy > 1.1 && ax < 0.9) return Math.hypot(dx + 0.6, t - dk - 0.5) < 0.28 ? null : '#e53935';   // the front panel with its porthole
        if (dx > 0.4 && ay < 0.5) return null; return (t > dk + 0.82 || (((dx + dy) * 4 + 40) | 0) % 2 === 0) ? '#ffd23f' : null; }
      if (t > 4.2 && t < 5.35 && m < 1.45 * (1 - (t - 4.2) / 1.15)) return ((dx + 0.6 > 0) !== (dy > 0)) ? '#e53935' : '#ffd23f';
      var sx = dx - 0.65; if (sx > 0 && sx < 3 && ay < 0.5){ var st = dk - 0.1 - sx * (dk - 0.4) / 3; if (t < st + 0.06 && t > st - 0.14) return ay > 0.4 ? '#f0a400' : '#ffd23f'; if (ay > 0.4 && t < st + 0.28 && t > st) return '#f0a400';   // the slide
        if (sx > 2.6 && t < st && ay < 0.12) return '#8a8f99'; }
      if (dx < -1.8 && dx > -2.3){ if (ay > 0.38 && ay < 0.5 && t < dk + 0.9) return '#8a8f99'; if (ay < 0.4 && ((t + 0.1) % 0.42) < 0.07 && t < dk) return '#c9ccd2'; }   // the ladder
      return null; });
  }
  function schSwings(B, X, Y){ var zs = B.gz(X, Y);
    B.solid(X - 1.8, Y - 0.6, zs - 0.05, X + 1.8, Y + 0.6, zs + 2.6, function(px, py, pz){ var dx = px - X, dy = py - Y, t = pz - zs, ft = 0.5 * (1 - t / 2.4);
      if (Math.abs(t - 2.4) < 0.08 && Math.abs(dy) < 0.08 && Math.abs(dx) < 1.75) return '#e53935';
      if (t < 2.4 && Math.abs(Math.abs(dx) - 1.65) < 0.07 && Math.abs(Math.abs(dy) - ft) < 0.07) return '#c62828';
      for (var k = -1; k <= 1; k += 2){ var sx = k * 0.6; if (t > 0.5 && t < 2.4 && Math.abs(Math.abs(dx - sx) - 0.18) < 0.03 && Math.abs(dy) < 0.04) return '#8a8f99'; if (Math.abs(dx - sx) < 0.24 && Math.abs(dy) < 0.13 && t > 0.42 && t < 0.52) return '#2b6a95'; }
      return null; }); }
  // the merry-go-round: a disc in four colours on its hub, and four hoops of rail to hang on to
  function schMerry(B, x, y){ var zb = B.gz(x, y);
    B.solid(x - 1.2, y - 1.2, zb - 0.05, x + 1.2, y + 1.2, zb + 1.05, function(px, py, pz){ var dx = px - x, dy = py - y, r = Math.hypot(dx, dy), t = pz - zb, a = Math.atan2(dy, dx);
      if (t < 0.18) return r < 0.25 ? '#6a6e76' : null;
      if (t < 0.32) return r < 1.12 ? (r > 1.02 ? '#c9ccd2' : ['#e53935', '#ffd23f', '#2b6a95', '#3f9a46'][Math.floor((a + Math.PI) / (Math.PI / 2)) % 4]) : null;
      if (r < 0.08) return t < 0.95 ? '#c9ccd2' : null;
      var q = Math.round(a / (Math.PI / 2)) * (Math.PI / 2); if (Math.abs(Math.sin(a - q)) * r < 0.05 && r < 0.98 && r > 0.08 && Math.abs(t - (0.32 + 0.6 * Math.sin(r / 0.98 * Math.PI))) < 0.07) return '#c9ccd2';
      return null; }); }
  function schSeesaw(B, x, y, k){ var zb = B.gz(x, y);
    B.solid(x - 1.7, y - 0.4, zb - 0.05, x + 1.7, y + 0.4, zb + 1.2, function(px, py, pz){ var dx = px - x, dy = py - y, t = pz - zb, pt = 0.5 + dx * k * 0.17;
      if (Math.abs(dx) < 0.25 && Math.abs(dy) < 0.22 && t < 0.5 - Math.abs(dx) * 0.6) return '#2b6a95';
      if (Math.abs(dx) < 1.6 && Math.abs(dy) < 0.16 && Math.abs(t - pt) < 0.06) return '#e53935';
      if (Math.abs(Math.abs(dx) - 1.25) < 0.04 && Math.abs(dy) < 0.2 && t > pt && t < pt + 0.35) return '#ffd23f';
      return null; }); }
  function schSandbox(B, x, y){ var zb = B.gz(x, y);
    B.solid(x - 1.3, y - 1.3, zb - 0.05, x + 1.3, y + 1.3, zb + 0.5, function(px, py, pz){ var dx = px - x, dy = py - y, m = Math.max(Math.abs(dx), Math.abs(dy)), t = pz - zb;
      if (m < 1.25 && m > 1.05 && t < 0.3) return '#a8783e'; if (Math.hypot(dx + 0.5, dy - 0.3) < 0.2 && t < 0.38) return t > 0.32 ? '#c62828' : '#e53935';   // a bucket left in it
      return null; }); }

  /* 2. THE PLAYGROUND: wood chips under everything, the climbing fort behind the hole, swings, a merry-go-round, a seesaw
     and a sandbox about it, the dodgeball court painted on the blacktop, and the chain link fence at the back. */
  function schPlay(L){
    var E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot, spotRect = L.spotRect, s0 = hash(seed, 4, 9) < 0.5 ? -1 : 1;
    function chipW(x, y){ return 3.3 + (fbm(x * 0.15, y * 0.15, seed + 4) - 0.5) * 1.4; }
    var fenceY = P0[1] - 9.4;
    var fort = spotRect(6.4, 3, function(x, y){ return (y > fenceY + 2.5 ? 0 : -60) - Math.abs(y - (P0[1] - 4.5)) * 0.8 - Math.abs(x - L.cx - s0 * 2) * 0.15; });
    var court = spotRect(6, 8, function(x, y){ return L.side(x) * 6 - Math.abs(y - L.cy) * 0.3 + (x - L.cx) * s0 * -0.05; });
    var swing = spot(1.9, function(x, y){ return L.north(x, y) * 0.4 + L.side(x) * 3 - Math.abs(clearAt(x, y) - 3.5) + hash(x | 0, y | 0, seed + 3); }, function(x, y){ return y > fenceY + 1.5 && !inR(x, y, court, 2.2); });
    var merry = spot(1.3, function(x, y){ return -Math.abs(clearAt(x, y) - 2.6) * 0.8 + (y > L.cy ? 1 : 0) + hash(x * 2 | 0, y * 2 | 0, seed + 5); }, function(x, y){ return !inR(x, y, court, 1.5); });
    var saw = spot(1.4, function(x, y){ return -Math.abs(clearAt(x, y) - 2.6) * 0.8 + hash(x * 2 | 0, y * 2 | 0, seed + 6); }, function(x, y){ return !inR(x, y, court, 1.5) && y > fenceY + 1; });
    var sand = spot(1.5, function(x, y){ return -Math.abs(clearAt(x, y) - 3) * 0.6 + hash(x * 2 | 0, y * 2 | 0, seed + 7); }, function(x, y){ return !inR(x, y, court, 1.6) && y > fenceY + 1; });
    var balls = []; if (court){ balls.push([court.x - 1.2, court.y - 1.6], [court.x + 0.9, court.y + 2.1]); }
    for (var i = 0; i < 2; i++){ var b = spot(0.35, function(x, y){ return -Math.abs(clearAt(x, y) - 1.8) + hash(x * 3 | 0, y * 3 | 0, seed + 30 + i); }); if (b) balls.push([b.x, b.y]); }
    return {
      h:function(x, y){ if (inR(x, y, court, 0.5)) return 0; return (fbm(x * 0.08, y * 0.08, seed) - 0.45) * 0.6 * sm(3.5, 7, clearAt(x, y)); },
      mat:function(x, y){ if (court && inR(x, y, court, 0.35)){ var dx = x - court.x, dy = y - court.y;
          if (!inR(x, y, court) || Math.abs(Math.abs(dx) - court.w / 2) < 0.1 || Math.abs(Math.abs(dy) - court.d / 2) < 0.1 || Math.abs(dy) < 0.05 || Math.abs(Math.hypot(dx, dy) - 1) < 0.06) return inR(x, y, court) ? ['cline'] : ['top'];
          return ['court']; }
        if (sand && Math.max(Math.abs(x - sand.x), Math.abs(y - sand.y)) < 1.1) return ['sand'];
        var c = clearAt(x, y), w = chipW(x, y); if (c < w) return ['chips']; if (c < w + 0.22) return ['timber']; return ['grass']; },
      build:function(B){
        (function(){ var zb = B.gz(L.cx, fenceY), x0 = E[0], x1 = E[2];   // the chain link fence along the back
          B.solid(x0, fenceY - 0.1, zb - 0.1, x1, fenceY + 0.1, zb + 4.1, function(px, py, pz){ var t = pz - zb;
            if (((px - x0) % 3.6) < 0.12 || t > 3.9) return '#8a8f99'; if (t < 3.9 && Math.abs(py - fenceY) < 0.03 && (((px + t + 90) % 0.3) < 0.035 || ((px - t + 90) % 0.3) < 0.035)) return '#b4b9c0'; return null; }); })();
        if (fort) schFort(B, fort.x, fort.y, fort.x < L.cx ? 1 : -1);
        if (swing) schSwings(B, swing.x, swing.y);
        if (merry) schMerry(B, merry.x, merry.y);
        if (saw) schSeesaw(B, saw.x, saw.y, hash(seed, 8, 1) < 0.5 ? 1 : -1);
        if (sand) schSandbox(B, sand.x, sand.y);
        balls.forEach(function(q){ schBall(B, q[0], q[1], 0.28, '#de3a2e', '#ff8a7a'); });
      },
      fill:{ on:['grass'], trees:0.4, lows:0.2, tree:function(B, x, y, i){ schTree(B, x, y, i, seed); }, low:function(B, x, y, i){ schShrub(B, x, y, i, seed); } },
      bg:'#5f9e45', gain:1.9,
      mats:{ grass:['#68a84c', '#72b255', '#5f9e45', 0.18, function(c, R){ return schTone(c, R, 0.1, seed + 3, '#6aaa4f', '#76b658', '#5f9e45'); }],
        chips:['#a8743f', '#b8844c', '#8e6034', 0.2, function(c, R){ var a = blot(c, 0.35, seed + 9), b = blot(c, 0.9, seed + 10); return R(a > 0.64 ? '#8e6034' : b > 0.62 ? '#c08c52' : b < 0.3 ? '#9a6a3a' : '#ac7843'); }],
        timber:['#6a4a2a', '#7a5a34', '#5a3d22', 0.05, function(c, R){ return R('#6e4c2c'); }],
        sand:['#e6d09c', '#efdcae', '#d8c08a', 0.1, function(c, R){ return schTone(c, R, 0.3, seed + 11, '#e6d09c', '#efdcae', '#d8c08a'); }],
        top:['#4c5058', '#555a63', '#44484f', 0.1, function(c, R){ return schTone(c, R, 0.12, seed + 5, '#4e525a', '#575c65', '#464a51'); }],
        court:['#3f7f8a', '#478a95', '#37717b', 0.1, function(c, R){ return schTone(c, R, 0.1, seed + 12, '#3f7f8a', '#468893', '#39747e'); }],
        cline:['#f2f2ea', '#ffffff', '#e2e2da', 0.05, function(c, R){ return R('#f2f2ea'); }] }
    };
  }

  // a classroom wing: a bay every 4.5 feet, each with a coloured door and its room number, lockers either side, a lamp by
  // the door, and a row of windows upstairs. Its front (south) wall is at Yf, centred on X, w wide and d deep, H high
  function schWing(B, X, Yf, w, d, H, seed){ var zb = B.gz(X, Yf - d / 2), DOOR = ['#c0392b', '#2b6a95', '#3f8a4e', '#e2a52a'];
    for (var k = Math.ceil((-w / 2 + 1) / 4.5); k * 4.5 < w / 2 - 1; k++) if (B.light) B.light(X + k * 4.5 + 0.85, Yf + 0.1, zb + 2.2, '#ffe6a0');
    B.solid(X - w / 2, Yf - d, zb - 0.1, X + w / 2, Yf + 0.22, zb + H + 0.1, function(px, py, pz){ var dx = px - X, dy = py - Yf, t = pz - zb, k = Math.floor((dx + 2.25) / 4.5), u = dx - k * 4.5;
      if (dy > 0){ if (Math.abs(u - 0.85) < 0.11 && t > 1.98 && t < 2.36 && Math.abs(dx) < w / 2 - 1) return t > 2.28 || t < 2.04 ? '#2a2a30' : '#ffe6a0'; return null; }   // the lamp by each door
      if (t > H - 0.3){ if (dy > -0.35 || dy < -d + 0.35 || Math.abs(dx) > w / 2 - 0.35) return '#d8d0c0'; return t < H - 0.12 ? '#5c6068' : null; }
      if (dy > -0.12 && Math.abs(dx) < w / 2 - 0.5){
        if (t < 2.5){ if (Math.abs(u) < 0.6 && t < 2.12){ if (Math.abs(u) > 0.53 || t > 2.05) return '#e8e2d4'; if (Math.abs(u - 0.16) < 0.15 && t > 1.2 && t < 1.85) return '#9cc8e0'; if (Math.abs(u + 0.36) < 0.06 && Math.abs(t - 1.05) < 0.04) return '#d8dce2'; return DOOR[((k % 4) + 4) % 4]; }
          if (Math.abs(u) < 0.7 && t > 2.18 && t < 2.42) return Math.abs(u) < 0.28 ? '#f6f2ea' : '#d0c8b8';
          if (Math.abs(u) > 0.8 && Math.abs(u) < 2.05 && t > 0.15 && t < 1.95){ var lu = ((u + 9) % 0.42); if (lu < 0.035 || t < 0.2) return '#22406a'; if (t > 1.6 && t < 1.72 && lu > 0.12 && lu < 0.3) return '#22406a'; return '#3a6ea8'; } }
        if (Math.abs(t - 2.75) < 0.12) return '#d0c8b8';
        if (t > 3.25 && t < 4.75){ var uu = ((dx + 100.85) % 1.7) - 0.85; if (Math.abs(uu) < 0.42) return schPane(uu, t - 3.25); } }
      return schBrick(dx + dy, t, seed); });
  }
  // a covered walkway down the side of the court: a green tin roof on white posts
  function schCanopy(B, x, y0, y1){ var zb = B.gz(x, (y0 + y1) / 2);
    B.solid(x - 1.3, y0, zb - 0.05, x + 1.3, y1, zb + 3.05, function(px, py, pz){ var dx = Math.abs(px - x), t = pz - zb;
      if (t > 2.8) return ((py + 99) % 0.34) < 0.06 ? '#2f6448' : '#3f7a5a';
      if (Math.abs(dx - 1) < 0.08 && ((py - y0 + 0.2) % 3) < 0.16) return '#efe9dc'; return null; }); }
  function schPlanter(B, x, y, seed, i, tree){ var zb = B.gz(x, y);
    B.solid(x - 1.2, y - 1.2, zb - 0.05, x + 1.2, y + 1.2, zb + 0.75, function(px, py, pz){ var m = Math.max(Math.abs(px - x), Math.abs(py - y)), t = pz - zb; if (m > 1.15) return null;
      if (m > 0.95) return t > 0.62 ? '#d8d0c0' : schBrick(px + py, t, seed); return t < 0.6 ? '#5a3d2a' : null; });
    if (tree) schTree(B, x, y, i, seed); else bush(B, x, y + 0.1, 0.62, ['#3b8f4a', '#2f7d3e', '#e86a8a']); }
  // a picnic table, green steel, with a bench along each side
  function schTable(B, x, y){ var zb = B.gz(x, y);
    B.solid(x - 1, y - 0.9, zb - 0.05, x + 1, y + 0.9, zb + 0.9, function(px, py, pz){ var dx = Math.abs(px - x), dy = Math.abs(py - y), t = pz - zb;
      if (dx < 0.95 && dy < 0.38 && t > 0.72 && t < 0.84) return '#3f8a5a'; if (dx < 0.95 && dy > 0.55 && dy < 0.8 && t > 0.4 && t < 0.5) return '#3f8a5a';
      if (Math.abs(dx - 0.7) < 0.05 && Math.abs(dy - Math.max(0, 0.75 - t * 0.6)) < 0.06 && t < 0.8) return '#2f6448'; return null; }); }

  /* 3. THE COURTYARD between the classroom wings: a long wing of classrooms across the top with its coloured doors, lockers
     and lamps, covered walkways down both sides, pavers underfoot, trees in brick planters and picnic tables. */
  function schHalls(L){
    var E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot;
    var yF = P0[1] - 4.6, ww = Math.min(E[2] - E[0] - 2, P1[0] - P0[0] + 20), cL = P0[0] - 3.4, cR = P1[0] + 3.4, cy1 = P1[1] - 1;
    for (var bx = -ww / 2 + 2; bx <= ww / 2 - 2; bx += 3) L.used.push({ x:L.cx + bx, y:yF - 1.6, r:2.2 });
    [cL, cR].forEach(function(x){ for (var y = yF + 1; y < cy1; y += 2.5) L.used.push({ x:x, y:y, r:1.5 }); });
    var planters = []; for (var i = 0; i < 4; i++){ var p = spot(1.3, function(x, y){ return L.side(x) * 2 + L.north(x, y) * 0.3 - Math.abs(clearAt(x, y) - 2.4) + hash(x | 0, y | 0, seed + 20 + i); }, function(x, y){ return x > cL + 1.4 && x < cR - 1.4 && y > yF + 1.4; }); if (p) planters.push(p); }
    var tables = []; for (i = 0; i < 3; i++){ var q = spot(1.1, function(x, y){ return -Math.abs(clearAt(x, y) - 2.2) + hash(x * 2 | 0, y * 2 | 0, seed + 30 + i); }, function(x, y){ return x > cL + 1.4 && x < cR - 1.4 && y > yF + 1.4; }); if (q) tables.push(q); }
    function inCourt(x, y){ return x > cL - 1.4 && x < cR + 1.4 && y > yF - 0.5 && y < P1[1] + 3; }
    return {
      h:function(x, y){ if (inCourt(x, y)) return 0; return (fbm(x * 0.08, y * 0.08, seed) - 0.45) * 0.5 * sm(4, 8, clearAt(x, y)); },
      mat:function(x, y){ if (inCourt(x, y)) return x < cL - 1.25 || x > cR + 1.25 || y > P1[1] + 2.85 ? ['kerb'] : ['pave']; return ['lawn']; },
      build:function(B){
        schWing(B, L.cx, yF, ww, 3.4, 6.2, seed);
        schCanopy(B, cL, yF, cy1); schCanopy(B, cR, yF, cy1);
        planters.forEach(function(p, n){ schPlanter(B, p.x, p.y, seed, n, p.y < P1[1] - 1.5); });
        tables.forEach(function(p){ schTable(B, p.x, p.y); });
      },
      fill:{ on:['lawn'], trees:0.45, lows:0.25, tree:function(B, x, y, i){ schTree(B, x, y, i, seed); }, low:function(B, x, y, i){ schShrub(B, x, y, i, seed); } },
      bg:'#5f9e45', gain:1.8,
      mats:{ lawn:['#68a84c', '#72b255', '#5f9e45', 0.18, function(c, R){ return schLawn(c, R, seed + 3); }],
        kerb:['#b8b2a6', '#c4beb2', '#a8a296', 0.05, function(c, R){ return R('#b8b2a6'); }],
        // pavers two feet square in a fine joint, each slab its own shade of a smooth field
        pave:['#cfc8ba', '#d8d2c4', '#bfb8aa', 0.1, function(c, R){ if (c.ti % 8 === 0 || c.tj % 8 === 0) return R('#a8a294'); var n = vn((c.ti >> 3) * 0.45, (c.tj >> 3) * 0.45, seed + 14);
          return R(n > 0.68 ? '#c2a890' : n < 0.3 ? '#d8d2c6' : '#cdc6b8'); }] }
    };
  }

  // the greenhouse: a brick base, white glazing bars, glass panes with the green of the plants showing low inside, a glass roof
  function schGreenhouse(B, X, Y, w, d){ var zb = B.gz(X, Y), wh = 2.2, rh = 1.3;
    B.solid(X - w / 2 - 0.1, Y - d / 2 - 0.1, zb - 0.1, X + w / 2 + 0.1, Y + d / 2 + 0.1, zb + wh + rh + 0.1, function(px, py, pz){ var dx = px - X, dy = py - Y, t = pz - zb, ax = Math.abs(dx), ay = Math.abs(dy);
      if (ax > w / 2 || ay > d / 2) return null;
      if (t > wh){ var rr = (t - wh) / rh; if (rr > 1 || ay > (d / 2) * (1 - rr)) return null; return (((dx + 50) % 0.7) < 0.08|| rr < 0.07 || rr > 0.93) ? '#e2e4dc' : (vn(dx * 0.9, rr * 3, 4) > 0.6 ? '#6aa8a2' : '#558f8a'); }
      if (t < 0.45) return schBrick(dx + dy, t, 7);
      if (dy > d / 2 - 0.12 && ax < 0.45 && t < 1.95) return ax > 0.4 || t > 1.9 ? '#f2f2ea' : '#9ccfc6';   // the door
      if (((dx + 50) % 0.7) < 0.07 || ((dy + 50) % 0.7) < 0.07 || Math.abs(t - 1.3) < 0.04 || t > wh - 0.07) return '#f2f2ea';
      return t < 1.1 ? (vn(dx * 1.4, t * 2, 5) > 0.5 ? '#5f9e6a' : '#76b27e') : (t > 1.75 ? '#a8dcd4' : '#8ccac2'); }); }
  // a raised bed of planks, dark soil, and two rows of whatever grows in it: lettuces (k 0), tomatoes on canes (1), flowers (2)
  function schBed(B, X, Y, k){ var zb = B.gz(X, Y);
    B.solid(X - 1.6, Y - 0.75, zb - 0.05, X + 1.6, Y + 0.75, zb + (k === 1 ? 1.5 : 0.95), function(px, py, pz){ var dx = px - X, dy = py - Y, t = pz - zb, ax = Math.abs(dx), ay = Math.abs(dy);
      if (ax > 1.55 || ay > 0.7) return null; if (ax > 1.42 || ay > 0.57) return t < 0.45 ? (t > 0.38 ? '#8a6436' : '#a8783e') : null; if (t < 0.38) return '#4a3424';
      var cx = Math.round((dx + 1.05) / 0.52) * 0.52 - 1.05, ry = dy > 0 ? 0.27 : -0.27, d0 = Math.hypot(dx - cx, dy - ry);
      if (k === 1){ if (d0 < 0.04 && t < 1.45) return '#b89a64'; if (d0 < 0.2 && t > 0.6 && t < 1.4){ return vn(px * 6, pz * 6, 3) > 0.72 ? '#e53935' : '#3f8a3e'; } return null; }
      var bump = Math.hypot((dx - cx) / 0.22, (dy - ry) / 0.22, (t - 0.42) / (k === 2 ? 0.42 : 0.28)); if (bump > 1) return null;
      if (k === 2) return t > 0.62 ? ['#f48fb1', '#ffd23f', '#ffffff', '#b39ddb'][Math.floor((dx + 2) / 0.52) % 4] : '#3f8a3e';
      return t > 0.55 ? '#9ad05a' : '#6ab04a'; }); }
  // a clump of sunflowers, their faces turned to the sun (south, to the camera)
  function schSunflowers(B, X, Y, n, sd){ var zb = B.gz(X, Y), F = []; for (var i = 0; i < n; i++) F.push([X + (hash(i, sd, 1) - 0.5) * 1.4, Y + (hash(i, sd, 2) - 0.5) * 0.8, 2.3 + hash(i, sd, 3) * 0.9]);
    B.solid(X - 1.3, Y - 0.9, zb - 0.05, X + 1.3, Y + 0.9, zb + 3.6, function(px, py, pz){ var t = pz - zb;
      for (var i = 0; i < F.length; i++){ var f = F[i], dx = px - f[0], dy = py - f[1], dh = Math.hypot(dx, t - f[2]);
        if (Math.abs(dy - 0.12) < 0.06 && dh < 0.46){ return dh < 0.2 ? '#6a4024' : '#ffc61a'; }
        if (Math.hypot(dx, dy) < 0.05 && t < f[2]) return '#4f8a2e';
        if (Math.abs(t - f[2] * 0.55) < 0.05 && Math.abs(dy) < 0.08 && Math.abs(dx) < 0.32) return '#3f8a3e'; }
      return null; }); }
  // a little arched footbridge over the creek, planks and two rails, running north to south
  function schBridge(B, x, y0, y1){ var zb = Math.max(B.gz(x, y0), B.gz(x, y1)), L2 = y1 - y0;
    B.solid(x - 0.85, y0, zb - 0.6, x + 0.85, y1, zb + 1.6, function(px, py, pz){ var dx = Math.abs(px - x), u = (py - y0) / L2, top = zb + 0.05 + Math.sin(u * Math.PI) * 0.55;
      if (dx < 0.7 && pz < top && pz > top - 0.14) return ((py * 3 | 0) % 2) ? '#a8784a' : '#946638';
      if (Math.abs(dx - 0.72) < 0.06 && pz > top && pz < top + 0.85 && (pz > top + 0.75 || ((py - y0 + 0.1) % 1.1) < 0.12)) return '#7a5634';
      return null; }); }

  /* 4. THE CREEK AND THE SCHOOL GARDEN: a creek runs across behind the hole with a footbridge over it and the greenhouse
     beyond, raised beds of lettuces, tomatoes and flowers in front of it, sunflowers along the sides, and butterflies. */
  function schGarden(L){
    var E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot, spotRect = L.spotRect, s0 = hash(seed, 6, 9) < 0.5 ? -1 : 1;
    function creekY(x){ return P0[1] - 4 - (vn(x * 0.09, 3, seed) - 0.5) * 2.2; }
    function hwAt(x){ return 1.05 + (vn(x * 0.2, 7, seed) - 0.5) * 0.5; }
    function cd(x, y){ return Math.abs(y - creekY(x)) - hwAt(x); }   // under 0 is in the water
    var brX = L.cx + s0 * Math.min(6, (P1[0] - P0[0]) * 0.3 + 1), brY = creekY(brX), brH = hwAt(brX) + 0.9; L.used.push({ x:brX, y:brY, r:2.2 });
    var gh = spotRect(6.4, 4, function(x, y){ return (y + 2.6 < creekY(x) - hwAt(x) && y + 2.6 < creekY(x - 3.2) - hwAt(x - 3.2) && y + 2.6 < creekY(x + 3.2) - hwAt(x + 3.2) ? 0 : -80) - Math.abs(y - creekY(x) + 5) * 0.5 - Math.abs(x - brX) * 0.25; });
    var beds = []; for (var i = 0; i < 5; i++){ var b = spot(1.75, function(x, y){ return -Math.abs(clearAt(x, y) - 2.8) * 0.8 + (y > creekY(x) ? 2 : -9) + hash(x | 0, y | 0, seed + 40 + i); }, function(x, y){ return cd(x, y) > 2; }); if (b) beds.push(b); }
    var suns = []; for (i = 0; i < 4; i++){ var f = spot(1.2, function(x, y){ return L.side(x) * 3 + L.north(x, y) * 0.2 - Math.abs(clearAt(x, y) - 3.5) * 0.5 + hash(x | 0, y | 0, seed + 50 + i); }, function(x, y){ return cd(x, y) > 1.4 && y < P1[1] - 1; }); if (f) suns.push(f); }
    var path = gh ? [[brX, brY - brH], [gh.x, gh.y + 2.2]] : null;
    return {
      h:function(x, y){ var c = cd(x, y); if (c < 0) return -0.2 + c * 0.25; if (c < 0.7) return -0.18 * (1 - c / 0.7); return (fbm(x * 0.08, y * 0.08, seed) - 0.45) * 0.7 * sm(3.5, 7, clearAt(x, y)) * sm(0.7, 2.5, c); },
      mat:function(x, y){ var c = cd(x, y); if (c < 0) return ['jpool', { dep:-c }]; if (c < 0.55) return ['bank'];
        if (path && segD(x, y, path[0][0], path[0][1], path[1][0], path[1][1]) < 0.55) return ['gravel'];
        return ['meadow']; },
      build:function(B){
        schBridge(B, brX, brY - brH, brY + brH);
        if (gh) schGreenhouse(B, gh.x, gh.y, 5.8, 3.4);
        beds.forEach(function(p, n){ schBed(B, p.x, p.y, (n + seed) % 3); });
        suns.forEach(function(p, n){ schSunflowers(B, p.x, p.y, 3 + n % 2, seed + n); });
      },
      fill:{ on:['meadow'], trees:0.45, lows:0.28, tree:function(B, x, y, i){ schTree(B, x, y, i, seed); },
        low:function(B, x, y, i){ var k = hash(i, seed, 44); if (k < 0.45) bush(B, x, y, 0.42, ['#3b8f4a', '#2f7d3e', '#f48fb1']); else if (k < 0.8) bush(B, x, y, 0.4, ['#3b8f4a', '#5aa84c', '#ffd23f']); else rockAt(B, x, y, 0.32, ['#9a9a94', '#7a7a74']); } },
      bg:'#5a9a44', gain:2,
      mats:{ meadow:['#68a84c', '#76b658', '#5a9a44', 0.18, function(c, R){ var a = blot(c, 0.1, seed + 3), b = blot(c, 0.28, seed + 4); return R(a > 0.7 ? '#5a9a44' : b > 0.7 ? '#7cbc5c' : a < 0.25 ? '#72b255' : '#68a84c'); }],
        bank:['#9a8a70', '#aa9a80', '#7e705a', 0.1, function(c, R){ return schTone(c, R, 0.5, seed + 15, '#9a8a70', '#b0a28a', '#7e705a'); }],
        gravel:['#c8bca4', '#d4c8b0', '#b4a890', 0.1, function(c, R){ return schTone(c, R, 0.45, seed + 16, '#c8bca4', '#d6cab4', '#b4a890'); }],
        jpool:['#3a8aa8', '#7ac4d8', '#2a6a88', 0.06, function(c, R){ var d = c.dep || 0; return R(d < 0.2 ? '#8acfe0' : d < 0.6 ? '#3f94b4' : '#2e7898'); }] }
    };
  }

  // a stand of bleachers rising to the north: five tiers of aluminium seats on dark risers, a rail along the top
  function schBleachers(B, X, Y, w){ var zb = B.gz(X, Y), n = 5, td = 0.62, tr = 0.5, d = n * td;
    B.solid(X - w / 2, Y - d / 2, zb - 0.05, X + w / 2, Y + d / 2, zb + n * tr + 1.1, function(px, py, pz){ var dx = Math.abs(px - X), back = Y + d / 2 - py, t = pz - zb, k = Math.floor(back / td);
      if (dx > w / 2 - 0.05) return t < (k + 1) * tr ? '#6a6e76' : null;
      if (k >= n) return null; if (k === n - 1 && t > n * tr && t < n * tr + 1 && (t > n * tr + 0.92 || ((px + 99) % 1.8) < 0.08) && back > d - 0.12) return '#8a8f99';
      var top = (k + 1) * tr; if (t > top) return null; if (t > top - 0.1) return (back % td) > td - 0.1 ? '#a8adb5' : '#d8dce2'; return '#5a5e66'; }); }
  // the scoreboard on its two legs: HOME and GUEST panels lit in amber, the clock between them, the school's colours on top
  function schScoreboard(B, X, Y){ var zb = B.gz(X, Y), b0 = 3.6;
    [[-1.8, 4.5], [1.8, 4.5], [-1, 4.3], [1, 4.3]].forEach(function(q, i){ if (B.light && i > 1) B.light(X + q[0], Y + 0.3, zb + q[1], '#ffc23a'); });
    B.solid(X - 2.9, Y - 0.3, zb - 0.05, X + 2.9, Y + 0.3, zb + b0 + 2.5, function(px, py, pz){ var dx = px - X, t = pz - zb, ax = Math.abs(dx);
      if (t < b0) return Math.abs(ax - 1.9) < 0.14 && Math.abs(py - Y) < 0.14 ? '#5c6068' : null;
      if (ax > 2.8) return null; if (t > b0 + 2.05) return t > b0 + 2.4 ? null : ax > 2.7 ? '#24447e' : '#f2c230';
      if (py < Y + 0.18 || ax > 2.65 || t < b0 + 0.15 || t > b0 + 1.95) return '#24447e';
      if (t > b0 + 1.45) return ax > 1.1 && ax < 2.5 ? '#f2f2ea' : '#24447e';   // the HOME and GUEST plates
      var u = ax - 1.8, v = t - b0 - 0.75; if (Math.abs(u) < 0.62 && Math.abs(v) < 0.55){ var lit = (Math.abs(Math.abs(u) - 0.2) < 0.06 && Math.abs(v) < 0.45) || (Math.abs(Math.abs(v) - 0.42) < 0.06 && Math.abs(u) < 0.2); return lit ? '#ffc23a' : '#1c2a24'; }
      if (ax < 0.7 && Math.abs(v - 0.15) < 0.35) return Math.abs(v - 0.15) < 0.06 && ax < 0.5 ? '#ffc23a' : '#1c2a24';
      return '#24447e'; }); }
  // a floodlight tower: a grey mast and a bank of lamps at the top, facing the field
  function schFlood(B, x, y){ var zb = B.gz(x, y), H = 9;
    for (var k = -1; k <= 1; k++) if (B.light) B.light(x + k * 0.55, y + 0.3, zb + H + 0.4, '#fff6d8');
    B.solid(x - 1, y - 0.3, zb - 0.05, x + 1, y + 0.4, zb + H + 0.95, function(px, py, pz){ var dx = px - x, dy = py - y, t = pz - zb;
      if (t < H) return Math.hypot(dx, dy) < 0.12 + (H - t) * 0.006 ? '#8a8f99' : null;
      if (Math.abs(dx) < 0.95 && Math.abs(dy) < 0.15){ var u = ((dx + 9) % 0.55) - 0.275, v = ((t - H + 9) % 0.45) - 0.225; return dy > 0.05 && Math.hypot(u, v) < 0.17 ? '#fff6d8' : '#5c6068'; }
      return null; }); }
  // a football goal: white posts and a bar, a net that slopes back to the ground
  function schGoal(B, x, y){ var zb = B.gz(x, y), gw = 2.4, gh = 1.6, gd = 1.2;
    B.solid(x - gw - 0.1, y - gd - 0.1, zb - 0.05, x + gw + 0.1, y + 0.1, zb + gh + 0.1, function(px, py, pz){ var dx = Math.abs(px - x), dy = py - y, t = pz - zb;
      if (dy > -0.08 && ((Math.abs(dx - gw) < 0.07 && t < gh) || (Math.abs(t - gh) < 0.07 && dx < gw))) return '#f6f6f0';
      var back = -dy / gd; if (back < 0 || back > 1 || dx > gw) return null; var net = t < gh * (1 - back * 0.65); if (!net) return null;
      var on = Math.abs(t - gh * (1 - back * 0.65)) < 0.06 || Math.abs(dx - gw) < 0.04; if (!on) return null; return (((px + 99) % 0.24) < 0.04 || ((t + py + 99) % 0.24) < 0.04) ? '#e8e8e2' : null; }); }
  function schHurdle(B, x, y){ var zb = B.gz(x, y);
    B.solid(x - 0.8, y - 0.3, zb - 0.05, x + 0.8, y + 0.3, zb + 0.9, function(px, py, pz){ var dx = Math.abs(px - x), dy = py - y, t = pz - zb;
      if (t > 0.62 && t < 0.86 && dx < 0.75 && Math.abs(dy) < 0.04) return ((px * 3 + 9) | 0) % 2 ? '#f6f6f0' : '#1c1c20';
      if (Math.abs(dx - 0.72) < 0.05 && Math.abs(dy) < 0.05 && t < 0.86) return '#c9ccd2'; if (Math.abs(dx - 0.72) < 0.05 && t < 0.06 && dy > -0.28 && dy < 0.05) return '#c9ccd2'; return null; }); }

  /* 5. THE SPORTS FIELD: the running track round the hole with its lanes, hurdles out on it, the bleachers and the
     scoreboard behind, a goal and the long jump pit beside, floodlights at the back, and cones about the grass. */
  function schField(L){
    var E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot, spotRect = L.spotRect, s0 = hash(seed, 5, 9) < 0.5 ? -1 : 1, TW = 4.4;
    var bl = spotRect(9, 3.4, function(x, y){ return (clearAt(x, y) > TW + 2.1 ? 0 : -60) - Math.abs(y - (P0[1] - TW - 4)) * 0.7 - Math.abs(x - L.cx - s0 * 3) * 0.2; });
    var sb = spot(2.6, function(x, y){ return (clearAt(x, y) > TW + 1.2 ? 0 : -60) - Math.abs(y - (P0[1] - TW - 3)) * 0.6 - Math.abs(x - L.cx + s0 * 7) * 0.3; });
    var pit = spotRect(2.4, 5, function(x, y){ return (clearAt(x, y) > TW + 2.6 ? 0 : -60) + L.side(x) * 4 - Math.abs(y - L.cy) * 0.2; });
    var goal = spot(2.6, function(x, y){ return (clearAt(x, y) > TW + 2 ? 0 : -60) + L.side(x) * 3 + L.north(x, y) * 0.2 + (pit && Math.abs(x - pit.x) < 6 ? -8 : 0) + hash(x | 0, y | 0, seed + 60); });
    var floods = [[P0[0] - TW - 2.5, P0[1] - TW - 2.2], [P1[0] + TW + 2.5, P0[1] - TW - 2.2]].filter(function(q){ return q[0] > E[0] + 1 && q[0] < E[2] - 1 && q[1] > E[1] + 1 && L.used.every(function(u){ return Math.hypot(u.x - q[0], u.y - q[1]) > u.r + 0.6; }); });
    floods.forEach(function(q){ L.used.push({ x:q[0], y:q[1], r:0.8 }); });
    var hurdles = []; for (var k = -2; k <= 2; k++){ var hx = L.cx + k * 3.2, hy = P0[1] - 2.6; if (clearAt(hx, hy) > 1.6 && clearAt(hx, hy) < TW - 0.6) hurdles.push([hx, hy]); }
    return {
      h:function(x, y){ var c = clearAt(x, y); if (c < TW + 0.5 || inR(x, y, pit, 1)) return 0; return (fbm(x * 0.07, y * 0.07, seed) - 0.45) * 0.6 * sm(TW + 1.5, TW + 6, c); },
      mat:function(x, y){ var c = clearAt(x, y);
        if (pit && inR(x, y, pit, 0.15)){ var py = y - pit.y; if (!inR(x, y, pit)) return ['tkerb']; return Math.abs(py - pit.d / 2 + 0.35) < 0.12 ? ['board'] : py > pit.d / 2 - 0.35 ? ['field'] : ['sand']; }
        if (c > 0.9 && c < TW){ if (c < 1.15) return ['tkerb']; var ln = (c - 1.15) / ((TW - 1.15) / 4); if (Math.abs(ln - Math.round(ln)) * ((TW - 1.15) / 4) < 0.05) return ['tline']; return ['track']; }
        return ['field']; },
      build:function(B){
        if (bl) schBleachers(B, bl.x, bl.y, bl.w);
        if (sb) schScoreboard(B, sb.x, sb.y);
        if (goal) schGoal(B, goal.x, goal.y);
        floods.forEach(function(q){ schFlood(B, q[0], q[1]); });
        hurdles.forEach(function(q){ schHurdle(B, q[0], q[1]); });
      },
      fill:{ on:['field'], trees:0.28, lows:0.2, tree:function(B, x, y, i){ schTree(B, x, y, i, seed); },
        low:function(B, x, y, i){ if (hash(i, seed, 45) < 0.5){ var zb = B.gz(x, y); B.solid(x - 0.3, y - 0.3, zb, x + 0.3, y + 0.3, zb + 0.6, function(px, py, pz){ var tt = (pz - zb) / 0.55; if (tt > 1 || Math.hypot(px - x, py - y) > 0.26 * (1 - tt) + (tt < 0.08 ? 0.06 : 0)) return null; return tt > 0.4 && tt < 0.6 ? '#ffffff' : '#ff6a1a'; }); }
          else schShrub(B, x, y, i, seed); } },
      bg:'#5f9e45', gain:1.9,
      mats:{ field:['#68a84c', '#72b255', '#5f9e45', 0.18, function(c, R){ var a = blot(c, 0.09, seed + 3), st = Math.floor(c.ti / 16) % 2; return R(a > 0.72 ? '#5f9e45' : st ? '#6eae52' : '#64a449'); }],
        track:['#b4553c', '#c0644a', '#a04a34', 0.1, function(c, R){ return schTone(c, R, 0.16, seed + 17, '#b4553c', '#bc5e44', '#a84e36'); }],
        tline:['#f4f0e8', '#ffffff', '#e2ded6', 0.05, function(c, R){ return R('#f4f0e8'); }],
        tkerb:['#d6d2c8', '#e0dcd2', '#c4c0b6', 0.05, function(c, R){ return R('#d6d2c8'); }],
        board:['#f4f0e8', '#ffffff', '#e2ded6', 0.05, function(c, R){ return R('#f4f0e8'); }],
        sand:['#e6d09c', '#efdcae', '#d8c08a', 0.1, function(c, R){ return schTone(c, R, 0.3, seed + 11, '#e6d09c', '#efdcae', '#d8c08a'); }] }
    };
  }
  /* ---------------- CANDY WORKS IS A JOURNEY. A tour hole knows its place in the world (L.leg), and Candy Works walks you
     in at the gate and up through the works: the factory gate and its yard with the gumdrop beds and the loading dock
     (1 to 4), the sweet gardens with the fondue fountain and the lollipop grove (5 to 8), inside the mixing hall with its
     vats, whisks and chutes (9 to 12), out along the chocolate river with the toffee bridge and the stamping press (13 to
     16), and up to the head office under the factory chimneys (17 and 18). A hole with no place keeps the old yard. */
  STOPS.candy = [[1, 'gate'], [5, 'garden'], [9, 'mixing'], [13, 'river'], [17, 'office']];
  FLY['candy~gate'] = FLY['candy~river'] = FLY['candy~office'] = 'song'; FLY['candy~garden'] = 'butterfly';
  (function(){ var base = BUILD.candy; BUILD.candy = function(L){ var s = L.stop;
    return s === 'gate' ? cndGate(L) : s === 'garden' ? cndGarden(L) : s === 'mixing' ? cndMixing(L) : s === 'river' ? cndRiver(L) : s === 'office' ? cndOffice(L) : base(L); }; })();

  var CND_GUM = ['#ff3b7a', '#ffd23f', '#3fbf9a', '#8a5cff', '#ff8a1f'], CND_LOLLY = [['#ff5fa2', '#fff4f8'], ['#ffd23f', '#ff8a1f'], ['#3fbf9a', '#e6fff6'], ['#8a5cff', '#f2e8ff']];
  function cndLight(col){ var n = parseInt(col.slice(1), 16), r = n >> 16, g = n >> 8 & 255, b = n & 255; return '#' + ((1 << 24) + (Math.min(255, r + 70) << 16) + (Math.min(255, g + 70) << 8) + Math.min(255, b + 70)).toString(16).slice(1); }
  // a lollipop: a white stick and a swirled disc on top, turned to face the camera
  function cndLolly(B, x, y, H, R, cols){ var zb = B.gz(x, y);
    B.solid(x - R - 0.05, y - 0.2, zb, x + R + 0.05, y + 0.2, zb + H + R + 0.05, function(px, py, pz){ var dx = px - x, dy = py - y, t = pz - zb;
      if (t < H && Math.hypot(dx, dy) < 0.09) return '#f6f1ea';
      var r = Math.hypot(dx, t - H); if (r > R || Math.abs(dy) > 0.16) return null; if (r > R - 0.1) return cols[0];
      return ((Math.atan2(t - H, dx) + r * 3.4) % 1.2 + 1.2) % 1.2 < 0.6 ? cols[0] : cols[1]; }); }
  // a gumdrop, a lighter crown of sugar on its top
  function cndGum(B, x, y, r, col){ var zb = B.gz(x, y), hi = cndLight(col);
    B.solid(x - r, y - r, zb - 0.05, x + r, y + r, zb + r * 1.3, function(px, py, pz){ var t = (pz - zb) / (r * 1.3), w = r * (1 - t * t * 0.8), d = Math.hypot(px - x, py - y);
      if (d > w) return null; return t > 0.78 && d < w * 0.7 ? hi : col; }); }
  // a candy cane, its hook to one side (dir), striped on the twist
  function cndCane(B, X, Y, H, dir){ var zb = B.gz(X, Y), R = 0.42;
    B.solid(X - 0.7, Y - 0.2, zb, X + 0.7, Y + 0.2, zb + H + R + 0.2, function(px, py, pz){ var dx = (px - X) * dir, dy = py - Y, t = pz - zb, d;
      if (t < H) d = Math.hypot(dx, dy); else { if (Math.atan2(t - H, dx - R) < -0.1) return null; d = Math.hypot(Math.hypot(dx - R, t - H) - R, dy); }
      if (d > 0.12) return null; return ((Math.floor((t + dx) * 3.2) % 2) + 2) % 2 ? '#e8233f' : '#fff6f0'; }); }
  // a box of sweets tied with a white ribbon and a bow
  function cndBox(B, x, y, s, col){ var zb = B.gz(x, y);
    B.solid(x - s / 2, y - s / 2, zb, x + s / 2, y + s / 2, zb + s + 0.22, function(px, py, pz){ var dx = px - x, dy = py - y, t = pz - zb;
      if (t > s - 0.02) return (Math.abs(dy) < 0.07 && Math.abs(Math.abs(dx) - 0.13) < 0.11 && t < s + 0.2) ? '#fff6f0' : null;
      if (Math.abs(dx) > s / 2 - 0.02 || Math.abs(dy) > s / 2 - 0.02) return null; return Math.abs(dx) < 0.07 || Math.abs(dy) < 0.07 ? '#fff6f0' : col; }); }
  // a wrapped bonbon: a ball in foil, the wrapper twisted out either side
  function cndBonbon(B, x, y, col){ var zb = B.gz(x, y), r = 0.3;
    B.solid(x - 0.75, y - r, zb, x + 0.75, y + r, zb + r * 2, function(px, py, pz){ var dx = px - x, dy = py - y, t = pz - zb - r;
      if (Math.hypot(dx, dy, t) < r) return t > r * 0.45 && dx < 0 ? cndLight(col) : col;
      var a = Math.abs(dx) - r * 0.8; if (a > 0 && a < 0.42 && Math.hypot(dy, t) < 0.06 + a * 0.45) return a > 0.12 ? '#fff6f0' : col; return null; }); }
  // a puff of pink smoke in the air
  function cndPuff(B, x, y, z, r){ B.solid(x - r, y - r, z - r, x + r, y + r, z + r, function(px, py, pz){ var d = Math.hypot(px - x, py - y, (pz - z) * 1.2) + (vn(px * 2.2, pz * 2.2, 3) - 0.5) * 0.25;
    return d < r ? (pz - z > r * 0.2 ? '#fff4f8' : '#f8c8dc') : null; }, B.ART * 0.7); }
  // a striped factory chimney with its smoke
  function cndStack(B, x, y, z0, H, r){ B.solid(x - r - 0.2, y - r - 0.2, z0, x + r + 0.2, y + r + 0.2, z0 + H, function(px, py, pz){ var d = Math.hypot(px - x, py - y), t = pz - z0;
      if (t > H - 0.5) return d < r + 0.18 && d > r - 0.25 ? '#5a2e14' : null; if (d > r) return null; return (Math.floor(t * 1.1) % 2) ? '#e8233f' : '#fff6f0'; }, B.ART * 0.7);
    cndPuff(B, x + 0.3, y, z0 + H + 0.7, 0.8); cndPuff(B, x + 1.3, y - 0.2, z0 + H + 1.7, 1.05); }
  function cndFill(seed, on, trees, lows, low){ return { on:on, trees:trees, lows:lows,
    tree:function(B, x, y, i){ cndLolly(B, x, y, 2.3 + hash(i, seed, 61) * 1.1, 0.9 + hash(i, seed, 62) * 0.35, CND_LOLLY[Math.floor(hash(i, seed, 63) * 4)]); }, low:low }; }
  function cndBlot(c, sd, cols){ var a = blot(c, 0.09, sd), b = blot(c, 0.24, sd + 1); return a > 0.64 ? cols[1] : a < 0.34 ? cols[2] : b > 0.68 ? cols[3] : cols[0]; }
  var CND_FROST = ['#f6c3d5', '#fbd4e2', '#efb2c8', '#f9cbdc'];

  /* 1. THE FACTORY GATE: the works' front along the back, pink with a chocolate roof and frosting dripping off it, its dock
     doors to one side and the boxes stacked on the dock, two striped chimneys, a biscuit yard round the course, lamps at
     its corners, and the gumdrop beds planted in rows down the sides and across the front. */
  function cndGate(L){
    var E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt;
    var fw = Math.min(15, Math.max(10, P1[0] - P0[0] + 3)), fd = 3, fh = 6.2, fx = L.cx + (hash(seed, 3, 1) - 0.5) * 3, fy = P0[1] - 3 - fd / 2;
    var ds = hash(seed, 4, 1) < 0.5 ? -1 : 1, doors = [fx + ds * (fw / 2 - 1.9), fx + ds * (fw / 2 - 4.6)];
    for (var u = -fw / 2; u <= fw / 2; u += 2) L.used.push({ x:fx + u, y:fy, r:fd / 2 + 0.8 });
    function bed(x, y){ if (clearAt(x, y) < 1.9 || x < E[0] + 0.8 || x > E[2] - 0.8 || y > E[3] - 0.8) return false;
      if (y > P1[1] + 2.4) return true; return y > P0[1] + 0.5 && ((x < P0[0] - 2.4 && x > P0[0] - 6.8) || (x > P1[0] + 2.4 && x < P1[0] + 6.8)); }
    function yard(x, y){ return clearAt(x, y) < 1.2 || (y > fy - fd / 2 - 0.4 && y < P0[1] && Math.abs(x - fx) < fw / 2 + 1.4); }
    var gums = []; for (var gy = P0[1] + 1, row = 0; gy < E[3] - 0.6; gy += 1.5, row++) for (var gx = E[0] + 1; gx < E[2] - 0.8; gx += 1.15){
      if (!bed(gx, gy) || !bed(gx - 0.5, gy) || !bed(gx + 0.5, gy)) continue; gums.push([gx, gy, CND_GUM[(row + (gx < L.cx ? 0 : 2)) % 5]]); L.used.push({ x:gx, y:gy, r:0.5 }); }
    var lamps = [[fx - fw / 2 - 1.1, P0[1] - 0.9], [fx + fw / 2 + 1.1, P0[1] - 0.9], [P0[0] - 1.6, (P0[1] + P1[1]) / 2], [P1[0] + 1.6, (P0[1] + P1[1]) / 2]].filter(function(p){ return clearAt(p[0], p[1]) > 0.7; });
    lamps.forEach(function(p){ L.used.push({ x:p[0], y:p[1], r:0.5 }); });
    var crates = []; doors.forEach(function(dx, k){ for (var j = 0; j < 3; j++){ var cx = dx + (j - 1) * 0.85, cy = P0[1] - 1.1 - (j % 2) * 0.5; if (clearAt(cx, cy) > 0.8) crates.push([cx, cy, ['#ff8ab8', '#8fd8f0', '#ffd23f'][(j + k) % 3], j === 1 && k === 0]); } });
    return {
      h:function(x, y){ if (yard(x, y)) return 0; if (bed(x, y)) return 0.04; return (fbm(x * 0.08, y * 0.08, seed) - 0.42) * 0.8 * sm(1.3, 6, clearAt(x, y)); },
      mat:function(x, y){ if (yard(x, y)) return ['yard']; if (bed(x, y)){ var ry = (y - P0[1] - 1) / 1.5; return Math.abs(ry - Math.round(ry)) < 0.32 ? ['soil'] : ['frost']; } return ['frost']; },
      build:function(B){ var zb = B.gz(fx, fy);
        // the works' front: pilasters at the corners, the main door under the lollipop sign, round windows lit inside, dock doors
        B.solid(fx - fw / 2 - 0.2, fy - fd / 2 - 0.2, zb - 0.1, fx + fw / 2 + 0.2, fy + fd / 2 + 0.2, zb + fh + 0.35, function(px, py, pz){ var dx = px - fx, dy = py - fy, t = pz - zb;
          if (t > fh) return Math.abs(dx) < fw / 2 + 0.18 && Math.abs(dy) < fd / 2 + 0.18 ? (Math.abs(dy) > fd / 2 ? '#4a2410' : '#5a2e14') : null;
          if (Math.abs(dx) > fw / 2 || Math.abs(dy) > fd / 2) return null;
          var front = dy > fd / 2 - 0.1;
          if (front && t > fh - 0.5 - 0.4 * Math.max(0, Math.sin(dx * 2.3 + seed))) return '#fff6f0';   // the frosting dripping off the roof
          if (Math.abs(Math.abs(dx) - fw / 2) < 0.3) return '#fff6f0';
          if (front){
            if (Math.abs(dx) < 0.9 && t < 2.6) return Math.abs(dx) > 0.78 || t > 2.48 ? '#fff6f0' : (Math.abs(dx) < 0.03 ? '#3a1a0a' : '#5a2e14');
            var r = Math.hypot(dx, t - 4.1); if (r < 0.95) return r > 0.85 ? '#fff6f0' : ((Math.atan2(t - 4.1, dx) + r * 4.2) % 1.4 + 1.4) % 1.4 < 0.7 ? '#e8233f' : '#fff4f8';
            for (var k = 0; k < 2; k++){ var ddx = px - doors[k]; if (Math.abs(ddx) < 1.25 && t < 3.6){ if (Math.abs(ddx) > 1.1 || t > 3.45) return '#fff6f0'; return (Math.floor(t * 4) % 2) ? '#e6dcd6' : '#cfc4be'; } }
            var near = Math.abs(dx) < 1.6 || doors.some(function(d){ return Math.abs(px - d) < 1.8; }), wu = ((dx % 2.2) + 3.3) % 2.2 - 1.1;
            if (!near){ var wr = Math.hypot(wu, t - 3.3); if (wr < 0.55) return wr > 0.44 ? '#fff6f0' : (Math.abs(wu) < 0.03 || Math.abs(t - 3.3) < 0.03 ? '#fff6f0' : '#ffe39a'); } }
          if (t < 0.45) return '#c85a8a'; return (Math.floor(t / 0.9) % 2) ? '#ff9cc4' : '#ff8ab8'; }, B.ART * 0.7);
        // the dock: a ledge of biscuit in front of the dock doors, boxes waiting on it
        var dx0 = Math.min(doors[0], doors[1]) - 1.5, dx1 = Math.max(doors[0], doors[1]) + 1.5, dyF = fy + fd / 2;
        B.solid(dx0, dyF - 0.05, zb - 0.1, dx1, dyF + 1.2, zb + 0.75, function(px, py, pz){ var t = pz - zb; if (t > 0.7) return null; return t > 0.58 ? '#e2c49a' : (Math.floor((px - dx0) * 1.3) % 2 ? '#c8a878' : '#d4b48a'); }, B.ART * 0.7);
        [[doors[0] - 0.5, 0], [doors[0] + 0.4, 1], [doors[1], 2]].forEach(function(q, k){ var zz = zb + 0.7, s = 0.75, bx = q[0], by = dyF + 0.6, col = ['#8fd8f0', '#ffd23f', '#ff8ab8'][q[1]];
          B.solid(bx - s / 2, by - s / 2, zz, bx + s / 2, by + s / 2, zz + s + 0.2, function(px, py, pz){ var ddx = px - bx, ddy = py - by, t = pz - zz; if (t > s) return null;
            return Math.abs(ddx) < 0.06 || Math.abs(ddy) < 0.06 ? '#fff6f0' : col; }); });
        [-1, 1].forEach(function(s){ cndStack(B, fx + s * fw * 0.3, fy - 0.4, zb + fh, 5 + (s > 0 ? 0.8 : 0), 0.5); });
        crates.forEach(function(c){ cndBox(B, c[0], c[1], 0.75, c[2]); if (c[3]) cndBox(B, c[0], c[1] + 0.02, 0.6, '#ffd23f'); });
        lamps.forEach(function(p){ lamp(B, p[0], p[1], '#e8233f', '#ffe9b0'); });
        gums.forEach(function(g){ cndGum(B, g[0], g[1], 0.32, g[2]); });
      },
      fill:cndFill(seed, ['frost'], 0.42, 0.14, function(B, x, y, i){ if (hash(i, seed, 66) < 0.6) cndGum(B, x, y, 0.3, CND_GUM[Math.floor(hash(i, seed, 65) * 5)]); else cndBox(B, x, y, 0.6, ['#ff8ab8', '#8fd8f0', '#ffd23f'][i % 3]); }),
      bg:'#f2b7cc', gain:1.6,
      mats:{ frost:['#f6c3d5', '#fbd4e2', '#efb2c8', 0.1, function(c, R){ return R(cndBlot(c, seed + 5, CND_FROST)); }],
        soil:['#7a4a2e', '#8a5636', '#6a3e26', 0.1, function(c, R){ return R(blot(c, 0.2, seed + 9) > 0.6 ? '#8a5636' : '#7a4a2e'); }],
        // biscuit slabs a foot square with a line of sugar between
        yard:['#e2c49a', '#ead0aa', '#d4b48a', 0.1, function(c, R){ if (c.ti % 4 === 0 || c.tj % 4 === 0) return R('#f4e6d0'); var n = blot(c, 0.12, seed + 3); return R(n > 0.62 ? '#ead0aa' : n < 0.35 ? '#d8b88e' : '#e2c49a'); }] }
    };
  }

  /* 2. THE SWEET GARDENS: mint lawns, a sugar path winding along the back, candy canes lining it, the fondue fountain
     pouring chocolate into its own pool, and the lollipops and cotton candy trees of the grove all round. */
  function cndGarden(L){
    var E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot;
    var pond = spot(2.4, function(x, y){ return L.side(x) * 3 - Math.abs(y - P0[1] - 1.5) * 0.25 - Math.abs(clearAt(x, y) - 4.2) * 0.4; });
    function pondD(x, y){ return pond ? 1 - Math.hypot((x - pond.x) / pond.r, (y - pond.y) / (pond.r * 0.72)) + (fbm(x * 0.6, y * 0.6, seed + 3) - 0.5) * 0.18 : -1; }
    var by = P0[1] - 3.2, path = L.route([E[0] - 1, by + (hash(seed, 1, 5) - 0.5) * 2], [E[2] + 1, by + (hash(seed, 2, 5) - 0.5) * 2], seed + 5, 1.4), dP = L.dist(path);
    var canes = []; for (var i = 1; i < path.length - 1; i++){ var a = path[i], b2 = path[i + 1], tx = b2[0] - a[0], ty = b2[1] - a[1], tl = Math.hypot(tx, ty) || 1;
      [-1, 1].forEach(function(s){ var cx = a[0] - ty / tl * s * 1.25, cy = a[1] + tx / tl * s * 1.25; if (clearAt(cx, cy) > 1 && pondD(cx, cy) < -0.3) canes.push([cx, cy, s]); }); }
    canes.forEach(function(c){ L.used.push({ x:c[0], y:c[1], r:0.5 }); });
    return {
      h:function(x, y){ if (pondD(x, y) > 0) return -0.1; return (fbm(x * 0.07, y * 0.09, seed) - 0.42) * 1.2 * sm(1.3, 6, clearAt(x, y)) * sm(0.6, 2.5, dP(x, y)); },
      mat:function(x, y){ var t = pondD(x, y); if (t > 0) return ['jpool', { dep:t }]; if (t > -0.14) return ['rim']; if (dP(x, y) < 0.75) return ['sugar']; return ['mint']; },
      build:function(B){
        if (pond){ var X = pond.x, Y = pond.y, zb = -0.1;   // the fondue fountain: two bowls on a white column, chocolate pouring off each
          B.solid(X - 1.05, Y - 1.05, zb, X + 1.05, Y + 1.05, zb + 3.1, function(px, py, pz){ var r = Math.hypot(px - X, py - Y), t = pz - zb, a = Math.atan2(py - Y, px - X);
            var choc = (Math.floor(a * 4 + t * 0.5) % 2) ? '#7a4422' : '#5e3018';
            if (t < 0.35) return r < 0.7 ? (r > 0.55 ? '#f4e6d0' : '#5a2a12') : null;
            if (r < 0.14) return '#f4e6d0';
            if (t > 1.45 && t < 1.65 && r < 0.95) return r > 0.82 || t < 1.52 ? '#f4e6d0' : '#5a2a12';
            if (t >= 0.35 && t <= 1.45 && r > 0.84 && r < 0.95) return choc;
            if (t > 2.3 && t < 2.45 && r < 0.55) return r > 0.45 || t < 2.36 ? '#f4e6d0' : '#5a2a12';
            if (t >= 1.65 && t <= 2.3 && r > 0.46 && r < 0.55) return choc;
            if (t >= 2.45 && r < 0.2 * (1 - (t - 2.45) / 0.6)) return '#7a4422'; return null; }); }
        canes.forEach(function(c, k){ cndCane(B, c[0], c[1], 1.3 + hash(k, seed, 7) * 0.3, c[2]); });
      },
      fill:{ on:['mint'], trees:0.55, lows:0.3,
        tree:function(B, x, y, i){ if (hash(i, seed, 31) < 0.5) cndLolly(B, x, y, 2.3 + hash(i, seed, 61) * 1.1, 0.9 + hash(i, seed, 62) * 0.35, CND_LOLLY[Math.floor(hash(i, seed, 63) * 4)]);
          else broadTree(B, x, y, 3.6 + hash(i, seed, 33) * 1.4, '#f6f1ea', [['#ffa8d0', '#ffc8e2', '#f088b8'], ['#a8d8ff', '#c8e8ff', '#88c0f0'], ['#e0b8ff', '#f0d8ff', '#c898f0']][i % 3], i + seed); },
        low:function(B, x, y, i){ var k = hash(i, seed, 34); if (k < 0.45) cndBonbon(B, x, y, ['#e8233f', '#ffc83a', '#8a5cff', '#3fbf9a'][i % 4]); else if (k < 0.8) bush(B, x, y, 0.45, ['#ffa8d0', '#ffc8e2', '#f088b8']); else cndGum(B, x, y, 0.32, CND_GUM[i % 5]); } },
      bg:'#8fd4aa', gain:1.7,
      mats:{ mint:['#a8e0bc', '#bfead0', '#93d4aa', 0.1, function(c, R){ return R(cndBlot(c, seed + 7, ['#a8e0bc', '#bdeacd', '#94d3a9', '#b2e4c4'])); }],
        sugar:['#fbf6ee', '#ffffff', '#ece4d8', 0.1, function(c, R){ var n = blot(c, 0.3, seed + 11); return R(n > 0.7 ? '#ffffff' : n < 0.3 ? '#eee6da' : '#f8f2e8'); }],
        rim:['#f4e6d0', '#fff6ea', '#e2d2b8', 0.1],
        jpool:['#5a2a12', '#8a5030', '#4a2410', 0.05, function(c, R){ var d = c.dep || 0; return R(d < 0.12 ? '#8a5030' : blot(c, 0.2, seed + 13) > 0.7 ? '#6e3a1c' : '#5a2a12'); }] }
    };
  }

  /* 3. THE MIXING HALL: inside the works. A tiled floor, pink walls round the back and the sides with the pipes along them,
     the twin vats against the back wall with their whisks coming down from the motors, two chutes pouring sweets into
     hoppers, the cake stand, a conveyor belt down one side, lamps lit along the wall, and batter spilt on the floor. */
  function cndMixing(L){
    var E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot, g = 4, WH = 7.5, R0 = room(L, { floor:'tile', wall:'hallwall', wallH:WH, gap:g });
    function backY(x, want){ for (var y = P0[1] - 0.5; y > E[1]; y -= 0.25) if (clearAt(x, y) >= want) return y; return null; }
    var vats = []; [-2.3, 2.3].forEach(function(o){ var x = L.cx + o, y = backY(x, g - 1.45); if (y != null && clearAt(x, y + 1.35) > 0.5){ vats.push([x, y]); L.used.push({ x:x, y:y, r:1.5 }); } });
    var bs = hash(seed, 6, 2) < 0.5 ? -1 : 1, beltX = bs < 0 ? P0[0] - 1.9 : P1[0] + 1.9;
    function belt(x, y){ return Math.abs(x - beltX) < 0.6 && y > P0[1] - 1.5 && y < P1[1] + 4 && clearAt(x, y) > 1.1; }
    var hop = []; [-1, 1].forEach(function(s){ var x = s < 0 ? P0[0] - 1.9 : P1[0] + 1.9; if (s === bs) x += s * 0.2; var y = P0[1] + 0.6; if (s === bs) y = P0[1] - 2.2;
      if (clearAt(x, y) > 1.2 && !belt(x, y)){ hop.push([x, y, s]); L.used.push({ x:x, y:y, r:1.2 }); } });
    var cake = spot(1, function(x, y){ return L.side(x) * 3 - Math.abs(clearAt(x, y) - 2) * 0.8 - Math.abs(y - (P0[1] + P1[1]) / 2) * 0.1; }, function(x, y){ return R0.wk(x, y) < 0.02 && !belt(x, y); });
    var spills = []; for (var i = 0; i < 3; i++){ var sp = spot(0.9 + hash(i, seed, 8) * 0.5, function(x, y){ return -Math.abs(clearAt(x, y) - 1.9) + hash(x | 0, y | 0, seed + 20 + i) * 2; }, function(x, y){ return R0.wk(x, y) < 0.02 && !belt(x, y) && Math.abs(x - beltX) > 1.8; }); if (sp) spills.push(sp); }
    function spill(x, y){ var m = -1; for (var k = 0; k < spills.length; k++){ var s = spills[k]; m = Math.max(m, 1 - Math.hypot((x - s.x) / s.r, (y - s.y) / (s.r * 0.65)) + (fbm(x * 0.9, y * 0.9, seed + k) - 0.5) * 0.4); } return m; }
    var lamps = []; [-5.2, 0, 5.2].forEach(function(o){ var x = L.cx + o, y = backY(x, g - 0.45); if (y != null && !vats.some(function(v){ return Math.abs(v[0] - x) < 1.8; })) lamps.push([x, y]); });
    return {
      h:R0.h,
      mat:function(x, y){ if (R0.wk(x, y) < 0.3){ if (belt(x, y)) return ['cbelt', { u:x - beltX }]; var s = spill(x, y); if (s > 0) return ['jpool', { dep:s }]; } return R0.mat(x, y); },
      build:function(B){
        vats.forEach(function(v, k){ var X = v[0], Y = v[1], zb = B.gz(X, Y), a0 = k * 0.6 + 0.4;   // a steel vat, the batter in it, and the whisk on its shaft from the motor above
          B.solid(X - 1.4, Y - 1.4, zb, X + 1.4, Y + 1.4, zb + 6.6, function(px, py, pz){ var dx = px - X, dy = py - Y, r = Math.hypot(dx, dy), t = pz - zb;
            if (t < 2.4){ if (r > 1.35) return null; if (t > 2.2) return r > 1.2 ? '#e4e8ee' : (k ? '#f2dc9a' : '#6a3518'); if (r < 1.25 && t > 0.2) return null; return Math.abs(t - 0.8) < 0.07 || Math.abs(t - 1.7) < 0.07 ? '#8a8e96' : (dx < -0.5 ? '#c8ccd2' : '#b4b8c0'); }
            if (t > 5.4 && t < 6.4) return Math.abs(dx) < 0.55 && Math.abs(dy) < 0.45 ? (t > 6.25 ? '#e8233f' : '#ff8ab8') : null;
            if (r < 0.07 && t > 3.3) return '#c8ccd2';
            for (var w = 0; w < 4; w++){ var a = a0 + w * 0.785, u = dx * Math.cos(a) + dy * Math.sin(a), vv = -dx * Math.sin(a) + dy * Math.cos(a);
              if (Math.abs(vv) < 0.05 && Math.abs(Math.hypot(u / 0.55, (t - 2.5) / 0.95) - 1) < 0.09 && t > 2.2) return '#dfe3ea'; }
            return null; }, B.ART * 0.7); });
        hop.forEach(function(h){ var X = h[0], Y = h[1], s = h[2], zb = B.gz(X, Y), tx = X + s * (g - 0.2), ty = Y - 0.6;   // a chute from high on the wall into a hopper of sweets
          B.vox(Math.min(X, tx) - 1.2, Y - 1.4, zb - 0.1, Math.max(X, tx) + 1.2, Y + 1.2, zb + WH + 0.5, function(set){ B.tube(set, tx, ty, zb + WH - 0.6, X + s * 0.3, Y - 0.2, zb + 2.2, 0.38, 0.32, function(q){ return (Math.floor(q * 9) % 2) ? '#ff8ab8' : '#fff6f0'; }); }, B.ART * 0.7);
          B.solid(X - 0.9, Y - 0.8, zb, X + 0.9, Y + 0.8, zb + 1.9, function(px, py, pz){ var dx = px - X, dy = py - Y, t = pz - zb, w = 0.55 + t * 0.2;
            if (Math.abs(dx) > w || Math.abs(dy) > w * 0.8) return null; if (t > 1.45){ var top = 1.45 + 0.4 * (1 - Math.hypot(dx / w, dy / (w * 0.8))); return t < top ? CND_GUM[(Math.floor(px * 6) + Math.floor(py * 6) * 3 + Math.floor(pz * 6)) % 5] : null; }
            return Math.abs(Math.abs(dx) - w) < 0.06 ? '#8a8e96' : '#b4b8c0'; }); });
        if (cake){ var X = cake.x, Y = cake.y, zb = B.gz(X, Y);   // the cake stand: a pink cake in three tiers on a white stand, a cherry on top
          B.solid(X - 0.95, Y - 0.95, zb, X + 0.95, Y + 0.95, zb + 2.7, function(px, py, pz){ var r = Math.hypot(px - X, py - Y), t = pz - zb;
            if (t < 0.6) return r < 0.14 || (t < 0.1 && r < 0.5) ? '#fff6f0' : null; if (t < 0.7) return r < 0.92 ? '#fff6f0' : null;
            var tiers = [[0.7, 1.25, 0.8], [1.25, 1.75, 0.6], [1.75, 2.2, 0.4]];
            for (var q = 0; q < 3; q++){ var T = tiers[q]; if (t >= T[0] && t < T[1] && r < T[2]) return t > T[1] - 0.1 || (Math.abs(t - T[1] + 0.18) < 0.08 && Math.sin(Math.atan2(py - Y, px - X) * 8) > 0) ? '#fff6f0' : (q % 2 ? '#ffd0e0' : '#ff9cc4'); }
            if (Math.hypot(r, t - 2.35) < 0.16) return '#e8233f'; return null; }); }
        lamps.forEach(function(p){ lamp(B, p[0], p[1], '#8a8e96', '#ffe0a0'); });
        // sweets riding the belt
        for (var y = P0[1] - 1.2; y < P1[1] + 3.6; y += 1.6) if (belt(beltX, y)) cndGum(B, beltX, y, 0.22, CND_GUM[Math.round(y * 3) % 5 < 0 ? 0 : Math.round(y * 3) % 5]);
      },
      bg:'#3a1c2a', gain:1.7,
      mats:{ tile:['#f6ecf0', '#f0c4d4', '#e0d0d6', 0.06, function(c, R){ if (c.ti % 6 === 0 || c.tj % 6 === 0) return R('#ddc8d0'); var ch = ((Math.floor(c.ti / 6) + Math.floor(c.tj / 6)) % 2 + 2) % 2, w = blot(c, 0.08, seed + 4) > 0.66;
          return R(ch ? (w ? '#f0e2e8' : '#f8eef2') : (w ? '#ecbccd' : '#f2c6d6')); }],
        hallwall:['#ff9cc4', '#ffb3cf', '#c85a8a', 0.06, function(c, R){ var z = c.z || 0; if (z > WH - 0.25) return R('#5a2a3e'); if (z < 0.6) return R('#fff6f0');
          if (Math.abs(z - 5.2) < 0.32) return R(Math.abs(z - 5.2) > 0.22 ? '#7a7e86' : '#b8bcc4'); if (c.ti % 20 < 2 && z > 0.6) return R('#a8acb4');
          return R((Math.floor(z / 1.1) % 2) ? '#ff9cc4' : '#ffaacd'); }],
        cbelt:['#3a3e46', '#4a505a', '#2a2e36', 0.06, function(c, R){ var u = Math.abs(c.u || 0); if (u > 0.48) return R('#8a8e96'); return R(c.tj % 3 === 0 ? '#2a2e36' : '#4a505a'); }],
        jpool:['#f2dc9a', '#fff0c0', '#e2c27a', 0.05, function(c, R){ var d = c.dep || 0; return R(d < 0.1 ? '#e2c27a' : d < 0.3 ? '#f2dc9a' : '#f8e6b0'); }] }
    };
  }

  /* 4. THE CHOCOLATE RIVER: the river runs behind the course with a bank of biscuit crumb, a wafer promenade along this
     side of it and caramel ground on the far one. A toffee bridge arches over it, the stamping press thumps beside the
     course, and two dipping pots stand ready, one dark and one white. */
  function cndRiver(L){
    var E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot, hw = 2.5;
    function rivY(x){ return P0[1] - 4.9 - (vn(x * 0.07, 2, seed) - 0.5) * 2.4; }
    function rv(x, y){ return y - rivY(x); }   // across the river: negative on the far side
    var bx = L.cx + (hash(seed, 5, 2) < 0.5 ? -1 : 1) * Math.min(5.5, (P1[0] - P0[0]) * 0.3 + 2);
    L.used.push({ x:bx, y:rivY(bx), r:hw + 1 });
    var press = spot(2.2, function(x, y){ return L.side(x) * 4 - Math.abs(y - P0[1] - 1) * 0.3 - Math.abs(clearAt(x, y) - 3.4) * 0.8 + hash(x | 0, y | 0, seed + 70); }, function(x, y){ return rv(x, y) > hw + 2.6; });
    var dips = []; for (var i = 0; i < 2; i++){ var dq = spot(1, function(x, y){ return L.side(x) * 3 - Math.abs(clearAt(x, y) - 2.2) + hash(x * 2 | 0, y * 2 | 0, seed + 30 + i); }, function(x, y){ return rv(x, y) > hw + 2 && (!press || Math.hypot(x - press.x, y - press.y) > 4); }); if (dq) dips.push(dq); }
    return {
      h:function(x, y){ var d = Math.abs(rv(x, y)) - hw; if (d < 0) return -0.45 - Math.min(0.2, -d * 0.1); if (d < 0.5) return -0.45 + d * 0.9;
        return (fbm(x * 0.08, y * 0.1, seed + 2) - 0.42) * 0.7 * sm(1.3, 6, clearAt(x, y)) * sm(0.5, 3, d); },
      mat:function(x, y){ var s = rv(x, y), d = Math.abs(s) - hw; if (d < 0) return ['sea', { dep:-d }]; if (d < 0.55) return ['crumb'];
        if (s < 0) return ['caramel']; if (d < 2.4 || clearAt(x, y) < 1.1) return ['wafer']; return ['frost']; },
      build:function(B){
        (function(){ var ya = rivY(bx) - hw - 0.7, yb = rivY(bx) + hw + 0.7, ym = (ya + yb) / 2, hl = (yb - ya) / 2;   // the toffee bridge, candy cane rails
          B.solid(bx - 1.05, ya, -0.7, bx + 1.05, yb, 1.75, function(px, py, pz){ var u = (py - ym) / hl, arch = 0.05 + 0.65 * (1 - u * u), dx = Math.abs(px - bx);
            if (dx < 0.85 && pz > arch - 0.24 && pz < arch) return (Math.floor((py - ya) * 2.5) % 2) ? '#e0a040' : '#c98a2e';
            if (dx < 0.8 && pz < arch - 0.24 && pz > arch - 0.5 && Math.abs(u) > 0.8) return '#b87a22';
            if (Math.abs(dx - 0.92) < 0.08 && pz > arch && pz < arch + 0.95){ var post = ((py - ya) % 1.3 + 1.3) % 1.3 < 0.16; if (post || pz > arch + 0.82) return ((Math.floor((pz + py) * 3) % 2) + 2) % 2 ? '#e8233f' : '#fff6f0'; }
            return null; }); })();
        if (press){ var X = press.x, Y = press.y, zb = B.gz(X, Y);   // the stamping press: a frame in red, the head over a belt of fresh stamped sweets, its warning light
          if (B.light) B.light(X, Y, zb + 5.4, '#ffb02a');
          B.solid(X - 2, Y - 1.25, zb, X + 2, Y + 1.25, zb + 5.6, function(px, py, pz){ var dx = px - X, dy = py - Y, t = pz - zb;
            if (t < 1){ if (Math.abs(dx) > 1.9 || Math.abs(dy) > 1.1) return null; return t > 0.86 ? '#a8acb4' : (Math.abs(t - 0.45) < 0.08 ? '#ffd23f' : '#8a8e96'); }
            if (t < 1.15 && Math.abs(dy) < 0.5 && Math.abs(dx) < 1.9) return (Math.floor(dx * 5) % 2) ? '#3a3e46' : '#2a2e36';
            if (t < 1.3 && Math.abs(dy) < 0.32){ var cx = ((dx + 9) % 0.9) - 0.45; if (Math.hypot(cx, dy) < 0.26 && dx > 0.2) return '#ff5fa2'; }
            if (Math.abs(Math.abs(dx) - 1.6) < 0.25 && Math.abs(dy) < 0.3 && t < 5) return '#e8233f';
            if (t > 4.3 && t < 5.1 && Math.abs(dx) < 1.9 && Math.abs(dy) < 0.45) return Math.abs(t - 4.7) < 0.12 ? ((Math.floor((dx + t) * 3) % 2 + 2) % 2 ? '#ffd23f' : '#2a2a2a') : '#e8233f';
            if (Math.hypot(dx, dy) < 0.18 && t > 2.6 && t <= 4.3) return '#c8ccd2';
            if (Math.abs(dx) < 0.7 && Math.abs(dy) < 0.5 && t > 2 && t <= 2.6) return t < 2.12 ? '#3a3e46' : '#5a5e66';
            if (t > 5.1 && t < 5.5 && Math.hypot(dx, dy) < 0.2) return '#ffb02a'; return null; }, B.ART * 0.7); }
        dips.forEach(function(p, k){ var zb = B.gz(p.x, p.y);   // a dipping pot on its burner, one of dark chocolate, one of white
          B.solid(p.x - 0.9, p.y - 0.9, zb, p.x + 0.9, p.y + 0.9, zb + 1.3, function(px, py, pz){ var r = Math.hypot(px - p.x, py - p.y), t = pz - zb;
            if (t < 0.3) return r < 0.6 ? '#3a3e46' : null; if (r > 0.85) return null; if (t > 1.12) return r > 0.74 ? '#e4e8ee' : (k ? '#f4e6d0' : '#5a2a12');
            if (r < 0.75 && t > 0.4) return null; return Math.abs(t - 0.75) < 0.06 ? '#8a8e96' : '#c8ccd2'; }); });
      },
      fill:cndFill(seed, ['caramel', 'frost'], 0.45, 0.22, function(B, x, y, i){ var k = hash(i, seed, 41);   // chocolate drops and gumdrops
        if (k < 0.55){ var zb = B.gz(x, y); B.solid(x - 0.4, y - 0.4, zb, x + 0.4, y + 0.4, zb + 0.8, function(px, py, pz){ var t = (pz - zb) / 0.75, r = Math.hypot(px - x, py - y), w = 0.38 * (t < 0.35 ? 1 : 1 - (t - 0.35) / 0.65 * 0.95); return r < w ? (t > 0.6 && px < x ? '#8a5030' : '#5a2a12') : null; }); }
        else cndGum(B, x, y, 0.3, CND_GUM[i % 5]); }),
      bg:'#c88a4a', gain:1.8,
      mats:{ sea:['#5a2a12', '#8a5030', '#4a2410', 0.05, function(c, R){ var d = c.dep || 0, n = blot(c, 0.12, seed + 21); return R(d < 0.35 ? '#8c4416' : n > 0.66 ? '#7c3610' : d < 1 ? '#6c2a08' : '#5c2206'); }],
        crumb:['#c8945a', '#d8a868', '#a87a48', 0.1, function(c, R){ var n = blot(c, 0.35, seed + 23); return R(n > 0.6 ? '#d8a868' : n < 0.35 ? '#ae7e4a' : '#c8945a'); }],
        caramel:['#e2ac68', '#ecbc7c', '#d49a58', 0.1, function(c, R){ return R(cndBlot(c, seed + 25, ['#e2ac68', '#ecbe80', '#d49a58', '#e8b674'])); }],
        // wafer: golden squares scored in a grid, the way a wafer biscuit is
        wafer:['#ecc070', '#f4d088', '#c8963e', 0.1, function(c, R){ var a = c.ti % 3 === 0, b = c.tj % 3 === 0; if (a && b) return R('#b8863a'); if (a || b) return R('#cc9a48');
          return R(c.ti % 24 === 1 || c.tj % 24 === 1 ? '#f8dc9c' : '#ecc070'); }],
        frost:['#f6c3d5', '#fbd4e2', '#efb2c8', 0.1, function(c, R){ return R(cndBlot(c, seed + 5, CND_FROST)); }] }
    };
  }

  /* 5. THE HEAD OFFICE: the top of the works. The office along the back, pink with white pilasters, lit windows, a clock
     over the door and a dome with a gold spire, the two great chimneys behind it smoking pink, a plaza of pink and white
     marble round the course with lamps lit, and mown mint lawns beyond with popping candy scattered over them. */
  function cndOffice(L){
    var E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt;
    var ow = Math.min(13, Math.max(9, (P1[0] - P0[0]) * 0.75)), od = 3, oh = 7.6, ox = L.cx, oy = P0[1] - 3.4 - od / 2;
    for (var u = -ow / 2; u <= ow / 2; u += 2) L.used.push({ x:ox + u, y:oy, r:od / 2 + 0.9 });
    var stacks = [[ox - ow / 2 - 2.6, oy - 1.4], [ox + ow / 2 + 2.6, oy - 1.4]]; stacks.forEach(function(s){ L.used.push({ x:s[0], y:s[1], r:1.4 }); });
    function plaza(x, y){ return clearAt(x, y) < 2.6 || (y > oy && y < P0[1] && Math.abs(x - ox) < ow / 2 + 1.6); }
    var lamps = [[ox - ow / 2 - 0.9, oy + od / 2 + 0.8], [ox + ow / 2 + 0.9, oy + od / 2 + 0.8], [P0[0] - 1.8, P0[1] + 1], [P1[0] + 1.8, P0[1] + 1], [P0[0] - 1.8, P1[1] - 0.5], [P1[0] + 1.8, P1[1] - 0.5]].filter(function(p){ return clearAt(p[0], p[1]) > 0.8; });
    lamps.forEach(function(p){ L.used.push({ x:p[0], y:p[1], r:0.5 }); });
    var POP = ['#ff3b7a', '#3fd0ff', '#ffd23f', '#9a6aff', '#5ae08a'];
    return {
      h:function(x, y){ if (plaza(x, y)) return 0; return (fbm(x * 0.07, y * 0.08, seed + 2) - 0.42) * 0.9 * sm(2.6, 7, clearAt(x, y)); },
      mat:function(x, y){ return plaza(x, y) ? ['marble'] : ['lawn']; },
      build:function(B){ var zb = B.gz(ox, oy);
        B.solid(ox - ow / 2 - 0.2, oy - od / 2 - 0.2, zb - 0.1, ox + ow / 2 + 0.2, oy + od / 2 + 0.2, zb + oh + 0.3, function(px, py, pz){ var dx = px - ox, dy = py - oy, t = pz - zb;
          if (t > oh) return Math.abs(dx) < ow / 2 + 0.18 && Math.abs(dy) < od / 2 + 0.18 ? '#5a2e14' : null;
          if (Math.abs(dx) > ow / 2 || Math.abs(dy) > od / 2) return null;
          var front = dy > od / 2 - 0.1, adx = Math.abs(dx);
          if (front && t > oh - 0.55 - 0.4 * Math.max(0, Math.sin(dx * 2.1 + 1))) return '#fff6f0';
          if (t < 0.5) return '#c85a8a';
          if (Math.abs(adx - ow / 2) < 0.32 || (front && Math.abs(adx - 1.45) < 0.16)) return '#fff6f0';
          if (front){
            if (adx < 0.95 && t < 2.9) return adx > 0.82 || t > 2.78 ? '#ffc83a' : (adx < 0.03 ? '#3a1a0a' : '#6a3518');
            var cr = Math.hypot(dx, t - 5.4); if (cr < 0.85){ if (cr > 0.72) return '#ffc83a'; var a = Math.atan2(t - 5.4, dx);
              if ((Math.abs(dx) < 0.04 && t > 5.4 && t < 6.0) || (Math.abs(t - 5.4) < 0.04 && dx > 0 && dx < 0.42)) return '#2a1a20'; return '#fffaf2'; }
            if (adx > 1.7){ var wu = ((adx - 1.7) % 1.7) - 0.85; for (var r2 = 0; r2 < 2; r2++){ var wz = r2 ? 4.6 : 1.9; if (Math.abs(wu) < 0.42 && Math.abs(t - wz) < 0.7) return Math.abs(wu) > 0.33 || Math.abs(t - wz) > 0.6 ? '#fff6f0' : (Math.abs(wu) < 0.03 ? '#fff6f0' : (t > wz + 0.1 ? '#ffe9a8' : '#ffd77a')); } } }
          return (Math.floor(t / 1.0) % 2) ? '#ffb3cf' : '#ffa6c6'; }, B.ART * 0.7);
        // the dome over the door and its gold spire
        B.solid(ox - 1.5, oy - 1.5, zb + oh, ox + 1.5, oy + 1.5, zb + oh + 3.3, function(px, py, pz){ var dx = px - ox, dy = py - oy, t = pz - zb - oh, r = Math.hypot(dx, dy);
          if (t < 0.6) return r < 1.25 ? (t > 0.48 ? '#fff6f0' : '#ffa6c6') : null; if (Math.hypot(r, (t - 0.6) * 1.1) < 1.15) return Math.abs(Math.sin(Math.atan2(dy, dx) * 4)) < 0.12 ? '#fff6f0' : '#ff8ab8';
          if (r < 0.08 && t < 3.2) return '#ffc83a'; if (Math.hypot(r, t - 2.3) < 0.16) return '#ffc83a'; return null; });
        if (B.light){ B.light(ox - 1.2, oy + od / 2 + 0.2, zb + 2.6, '#ffd77a'); B.light(ox + 1.2, oy + od / 2 + 0.2, zb + 2.6, '#ffd77a'); }
        stacks.forEach(function(s, k){ cndStack(B, s[0], s[1], B.gz(s[0], s[1]), 10.5 + k * 0.8, 0.8); });
        lamps.forEach(function(p){ lamp(B, p[0], p[1], '#5a2e14', '#ffe39a'); });
      },
      fill:cndFill(seed, ['lawn'], 0.4, 0.42, function(B, x, y, i){ var zb = B.gz(x, y), col = POP[i % 5], hi = cndLight(col);   // popping candy: a little heap of bright crystals
        B.solid(x - 0.5, y - 0.5, zb - 0.05, x + 0.5, y + 0.5, zb + 0.7, function(px, py, pz){ for (var k = 0; k < 4; k++){ var a = k * 1.9 + i, cx = x + Math.cos(a) * 0.22 * (k ? 1 : 0), cy = y + Math.sin(a) * 0.16 * (k ? 1 : 0), hh = k ? 0.38 : 0.62;
          var t = (pz - zb) / hh; if (t < 1 && Math.abs(px - cx) + Math.abs(py - cy) < 0.17 * (1 - t * 0.7)) return t > 0.6 ? hi : (k % 2 ? col : POP[(i + k) % 5]); } return null; }); }),
      bg:'#9fd8b0', gain:1.6,
      mats:{ marble:['#f6e8ee', '#ffffff', '#e8d0dc', 0.06, function(c, R){ if (c.ti % 8 === 0 || c.tj % 8 === 0) return R('#e0c4d0'); var ch = ((Math.floor(c.ti / 8) + Math.floor(c.tj / 8)) % 2 + 2) % 2, v = blot(c, 0.14, seed + 3) > 0.7;
          return R(ch ? (v ? '#f8e2ec' : '#fdf3f7') : (v ? '#f4b8d0' : '#f6c6d8')); }],
        lawn:['#9fd8b0', '#b2e2c0', '#8ccc9f', 0.1, function(c, R){ var st = Math.floor(c.ti / 10) % 2, n = blot(c, 0.1, seed + 9); return R(st ? (n > 0.66 ? '#acdfbb' : '#9fd8b0') : (n > 0.66 ? '#98d2a9' : '#8ccc9f')); }] }
    };
  }
  /* ---------------- NEON ARCADE IS A JOURNEY. Like Pirate Cove, the scenery moves with the holes: you start on the
     pavement out front under the marquee (1 to 4), go in among the cabinet rows with the Neon River running behind them
     (5 to 8), on to the racing and rhythm games (9 to 12), the prize counter and the claw machines (13 to 16), and out
     onto the roof over the night skyline (17 and 18). A hole with no place (a daily, a season) keeps the old grid floor. */
  STOPS.neon = [[1, 'front'], [5, 'floor'], [9, 'race'], [13, 'prize'], [17, 'roof']];
  FLY['neon~front'] = FLY['neon~floor'] = FLY['neon~race'] = FLY['neon~prize'] = 'drone'; FLY['neon~roof'] = 'bat';
  (function(){ var base = BUILD.neon; BUILD.neon = function(L){ var s = L.stop;
    return s === 'front' ? neoFront(L) : s === 'floor' ? neoFloor(L) : s === 'race' ? neoRace(L) : s === 'prize' ? neoPrize(L) : s === 'roof' ? neoRoof(L) : base(L); }; })();

  var NEO_GLOW = ['#ff2bd6', '#2bf0ff', '#ffe02b', '#7cff4a', '#ff7a2b', '#a46bff'];
  // a 3 by 5 dot font for the signs, top row first
  var NEO_FONT = { A:['.#.', '#.#', '###', '#.#', '#.#'], R:['##.', '#.#', '##.', '#.#', '#.#'], C:['.##', '#..', '#..', '#..', '.##'], D:['##.', '#.#', '#.#', '#.#', '##.'],
    E:['###', '#..', '##.', '#..', '###'], P:['##.', '#.#', '##.', '#..', '#..'], I:['###', '.#.', '.#.', '.#.', '###'], Z:['###', '..#', '.#.', '#..', '###'], S:['.##', '#..', '.#.', '..#', '##.'] };
  // is this point of a word lit? u across from the word's left edge, v up from its foot, s the size of one dot
  function neoWord(w, u, v, s){ var i = Math.floor(u / (s * 4)), du = u - i * s * 4; if (u < 0 || i >= w.length || du >= s * 3 || v < 0 || v >= s * 5) return false;
    return NEO_FONT[w.charAt(i)][4 - Math.floor(v / s)].charAt(Math.floor(du / s)) === '#'; }
  function neoWide(w, s){ return (w.length * 4 - 1) * s; }
  // an upright cabinet: marquee lit across the top, the screen, the control panel with its stick and buttons, the coin door.
  // (fx, fy) is the way it faces, always one of the four
  function neoCab(B, x, y, k, fx, fy){ var zb = B.gz(x, y), g = NEO_GLOW[k % 6], g2 = NEO_GLOW[(k + 3) % 6];
    if (B.light && k % 2 === 0) B.light(x + fx * 0.4, y + fy * 0.4, zb + 2.5, g);
    B.solid(x - 0.75, y - 0.75, zb, x + 0.75, y + 0.75, zb + 2.75, function(px, py, pz){ var a = (px - x) * fx + (py - y) * fy, b = (px - x) * fy - (py - y) * fx, t = pz - zb, ab = Math.abs(b);
      if (ab > 0.6 || a < -0.5) return null; var side = ab > 0.52;
      if (t < 1.0){ if (a > 0.25) return null; if (a > 0.17 && t > 0.45 && t < 0.68 && ab < 0.14) return '#ff7a2b'; return side ? g : '#1a1233'; }
      if (t < 1.2){ if (a > 0.58) return null; if (t > 1.12 && Math.hypot(b + 0.2, a - 0.4) < 0.09) return '#ffe02b'; if (t > 1.12 && Math.hypot(b - 0.15, a - 0.42) < 0.07) return g; return side ? g : '#2a2440'; }
      if (t < 2.3){ if (a > 0.2) return null; if (side) return ((t * 2 + a * 2) % 1 < 0.35) ? g : '#1a1233';
        if (a > 0.1 && ab < 0.42 && t > 1.35 && t < 2.15) return (Math.floor((t - 1.35) * 9) % 3 === 0) ? g2 : Math.hypot(b, t - 1.75) < 0.16 ? '#ffe02b' : '#0e2a4a'; return '#1a1233'; }
      if (a > 0.3) return null; if (t > 2.66) return '#1a1233'; if (a > 0.18) return ab < 0.45 ? '#fff2fa' : g; return side ? g : '#1a1233'; }); }
  // a bar stool: a chrome post and a round seat
  function neoStool(B, x, y, col){ cyl(B, x, y, 0.36, 0.85, function(r, t){ if (t > 0.7) return r < 1 ? (t > 0.8 ? col : '#2a2440') : null; if (t < 0.08) return r < 0.8 ? '#9a98b0' : null; return r < 0.25 ? '#c8c6dc' : null; }); }
  // a neon palm in a planter: a dark trunk with rings of light, fronds of teal
  function neoPalm(B, x, y, H, k, ring){ var zb = B.gz(x, y), lean = (hash(k, 3, 4) - 0.5) * 1.0, top = [x + lean, y - 0.3, zb + H];
    if (B.light) B.light(x + lean * 0.5, y, zb + H * 0.5, ring);
    B.vox(x - 3.2, y - 2.8, zb, x + 3.2, y + 2.6, zb + H + 0.8, function(set){
      for (var s = 0; s < 10; s++){ var t0 = s / 10, t1 = (s + 1) / 10; B.tube(set, x + lean * t0 * t0, y - 0.3 * t0, zb + 0.5 + (H - 0.5) * t0, x + lean * t1 * t1, y - 0.3 * t1, zb + 0.5 + (H - 0.5) * t1, 0.19 - t0 * 0.06, 0.19 - t1 * 0.06, s % 3 === 1 ? ring : '#2a2238'); }
      for (var f = 0; f < 7; f++){ var a = f / 7 * 6.28 + k, fx = Math.cos(a), fy = Math.sin(a) * 0.7; for (var al = 0; al < 2.4; al += set.st){ var sag = 0.35 - al * al * 0.22, wd = 0.36 * (1 - al / 2.6);
        for (var o = -wd; o <= wd; o += set.st) set(top[0] + fx * al - fy * o, top[1] + fy * al + fx * o, top[2] + sag, Math.abs(o) < set.st * 1.5 ? '#2bf0ff' : al > 1.4 ? '#1f8a7a' : '#176a62'); } }
      B.tube(set, x, y, zb, x, y, zb + 0.5, 0.55, 0.6, function(u){ return u > 0.8 ? '#ff2bd6' : '#2a2440'; }); }, B.ART); }
  // what lies about the floor in front of the course: low things only
  function neoLow(B, x, y, i, seed){ var k = hash(i, seed, 61);
    if (k < 0.5) neoStool(B, x, y, NEO_GLOW[i % 6]);
    else cyl(B, x, y, 0.32, 0.9, function(r, t){ if (t > 0.78) return r < 0.8 ? NEO_GLOW[(i + 1) % 6] : null; return r < 1 ? ((t * 4 | 0) % 2 ? '#2a2440' : '#3a3456') : null; }); }

  /* 1. OUT FRONT (and Insert Coin, Laser Gate, Level Up, Hover Deck): the pavement before the arcade's front wall, the
     marquee in bulbs with ARCADE across it, the doors lit from inside, the ticket booth to one side, neon palms, the kerb,
     and the street beyond it shining wet with puddles that catch the light. */
  function neoFront(L){
    var E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot, cx = L.cx;
    var fy = P0[1] - Math.max(2.2, Math.min(4.4, P0[1] - E[1] - 1.4)), ky = P1[1] + 3.4;   // the front wall, and the kerb
    L.used.push({ x:cx, y:fy - 1, r:0.1 });
    var doors = [cx - 4.2, cx + 4.2];
    var booth = spot(1.4, function(x, y){ return L.side(x) * 5 - Math.abs(y - fy - 3) * 0.6 + hash(x | 0, y | 0, seed + 3); }, function(x, y){ return y > fy + 1.8 && y < ky - 1.6; });
    var palms = []; for (var i = 0; i < 4; i++){ var p = spot(1.1, function(x, y){ return L.side(x) * 4 - Math.abs(y - (P0[1] + P1[1]) / 2) * 0.12 + hash(x * 2 | 0, y * 2 | 0, seed + 10 + i) * 2; }, function(x, y){ return y > fy + 1.6 && y < ky - 1.2; }); if (p) palms.push(p); }
    var lamps = []; for (var lx = E[0] + 2 + hash(seed, 1, 1) * 3; lx < E[2] - 1; lx += 6.5) if (clearAt(lx, ky - 0.7) > 1.2) lamps.push([lx, ky - 0.7]);
    var car = spot(2.3, function(x, y){ return -Math.abs(y - ky - 2.4) * 2 - Math.abs(x - cx) * 0.05 + hash(x | 0, y | 0, seed + 5); }, function(x, y){ return y > ky + 1.6 && Math.abs(x - cx) > 3; });
    var CAR = NEO_GLOW[seed % 3 === 0 ? 0 : seed % 3 === 1 ? 1 : 5];
    function pud(x, y){ return y > ky + 0.8 ? fbm(x * 0.16, y * 0.5, seed + 9) - 0.66 : -1; }
    return {
      h:function(x, y){ if (y > ky + 0.5) return -0.16; if (y < fy - 1.2) return 3.2; return 0; },   // K doubles it: the roof behind the front wall stands 6.4 up
      mat:function(x, y){ if (y > ky + 0.5){ var p = pud(x, y); if (p > 0) return ['jpool', { dep:p * 10 }]; return ['road', { u:x, v:y - ky }]; } if (y > ky) return ['kerb']; if (y < fy - 1.2) return ['bldg'];
        return ['pave', { gl:sm(4.5, 0, y - fy) }]; },
      build:function(B){
        // the front wall: base, the doors lit from inside, the marquee of bulbs with ARCADE in pink, neon tubes above
        var zb = 0, wd = neoWide('ARCADE', 0.32), wx = cx - wd / 2;
        B.solid(E[0] - 1, fy - 1.3, zb - 0.2, E[2] + 1, fy, zb + 6.4, function(px, py, pz){ var t = pz - zb, f = py > fy - 0.45;
          if (t > 2.9 && t < 5.1){ if (t < 3.1 || t > 4.9) return ((px * 2.5 | 0) % 2) ? '#fff0b0' : '#ffb02b'; if (neoWord('ARCADE', px - wx, t - 3.2, 0.32)) return f ? '#ff2bd6' : '#ff8ae8'; return '#1a0f33'; }
          if (!f || py > fy - 0.25) { if (py > fy - 0.25) return null; }
          if (t < 0.25) return '#3a2f55';
          for (var d = 0; d < 2; d++){ var dx = px - doors[d]; if (Math.abs(dx) < 1.3 && t < 2.6){ if (Math.abs(dx) > 1.15 || t > 2.45 || Math.abs(dx) < 0.06) return '#ff2bd6'; return t < 1.2 && py > fy - 0.6 ? '#ffd0ef' : '#ffe6c8'; } }
          if (t > 5.1){ if (t > 6.2) return '#2bf0ff'; return (Math.abs(((px % 3) + 3) % 3 - 1.5) < 0.09) ? (Math.floor(px / 3) % 2 ? '#2bf0ff' : '#ff2bd6') : '#221a3a'; }
          if (t > 0.7 && t < 2.4 && (((px % 4) + 4) % 4) > 1.2 && (((px % 4) + 4) % 4) < 3.4){ var q = ((px % 4) + 4) % 4; return q < 1.32 || q > 3.28 || t < 0.82 || t > 2.28 ? '#ff2bd6' : '#3a1a5a'; }   // the windows, a poster glow in each
          return '#2a2244'; });
        for (var bx = E[0] + 0.5; bx < E[2]; bx += 2.2) if (B.light) B.light(bx, fy + 0.1, zb + 3.7, '#ffc86a');
        doors.forEach(function(dx){ if (B.light) B.light(dx, fy + 0.6, 1.2, '#ff8ae8'); });
        // the ticket booth: a striped kiosk with a lit window and an awning
        if (booth){ var X = booth.x, Y = booth.y, z0 = B.gz(X, Y); if (B.light) B.light(X, Y + 0.9, z0 + 1.8, '#ffe9a0');
          B.solid(X - 1.2, Y - 1.1, z0, X + 1.2, Y + 1.3, z0 + 3.4, function(px, py, pz){ var dx = px - X, dy = py - Y, t = pz - z0;
            if (t > 2.5){ var r = (t - 2.5) / 0.85; if (r < 1 && Math.abs(dx) < 1.15 * (1 - r * 0.9) && Math.abs(dy) < 1.15 * (1 - r * 0.9)) return (Math.floor(Math.atan2(dy, dx) * 2.5 + 8) % 2) ? '#ff2bd6' : '#fff2fa'; if (t > 3.2 && Math.hypot(dx, dy) < 0.14) return '#ffe02b'; return null; }
            if (Math.abs(dx) > 0.95 || Math.abs(dy) > 0.85) return null;
            if (dy > 0.7 && Math.abs(dx) < 0.62 && t > 1.2 && t < 2.2) return Math.abs(t - 1.7) < 0.04 || Math.abs(dx) > 0.55 ? '#c9a227' : '#ffe9a0';
            if (dy > 0.7 && Math.abs(t - 1.15) < 0.06) return '#c9a227'; return (Math.floor((dx + 2) * 3) % 2) ? '#c8402e' : '#e8d8c0'; }); }
        palms.forEach(function(p, i){ neoPalm(B, p.x, p.y, 3.6 + hash(i, seed, 21) * 1.4, i * 3 + seed, NEO_GLOW[i % 2]); });
        lamps.forEach(function(q){ lamp(B, q[0], q[1], '#2a2440', '#ff8ae8'); });
        // a car at the kerb, low and shining: body, glass, wheels, head and tail lights
        if (car){ var X = car.x, Y = car.y, z0 = B.gz(X, Y), dir = X < cx ? 1 : -1;
          if (B.light){ B.light(X + dir * 2.1, Y, z0 + 0.6, '#fff6d0'); B.light(X - dir * 2.1, Y, z0 + 0.6, '#ff3a3a'); }
          B.solid(X - 2.2, Y - 1, z0, X + 2.2, Y + 1, z0 + 1.45, function(px, py, pz){ var u = (px - X) * dir, v = py - Y, t = pz - z0, av = Math.abs(v);
            if (av > 0.9 || Math.abs(u) > 2.15) return null;
            if (t < 0.45 && Math.abs(Math.abs(u) - 1.3) < 0.36 && av > 0.6) return Math.hypot(Math.abs(u) - 1.3, t - 0.3) < 0.3 ? (Math.hypot(Math.abs(u) - 1.3, t - 0.3) < 0.13 ? '#c8c6dc' : '#141018') : null;
            if (t < 0.15) return null; if (t < 0.8){ if (u > 2.0 && t > 0.45 && av > 0.45) return '#fff6d0'; if (u < -2.0 && t > 0.45 && av > 0.45) return '#ff3a3a'; return Math.abs(t - 0.62) < 0.03 ? '#ffffff' : CAR; }
            var tw = 0.7 + (t - 0.8) * 0.3; if (u > 0.9 - (t - 0.8) * 0.8 || u < -1.3 + (t - 0.8) * 0.6 || av > tw + 0.2) return null; if (t > 1.38) return CAR; return av > tw - 0.05 || Math.abs(u + 0.2) < 0.05 ? CAR : '#4a3a7a'; }); }
      },
      fill:{ on:['pave'], trees:0, lows:0.07, tree:function(){}, low:function(B, x, y, i){ var zb = B.gz(x, y), g = NEO_GLOW[i % 6]; if (B.light) B.light(x, y, zb + 0.9, g);   // a bollard with a lit cap
        cyl(B, x, y, 0.2, 1.0, function(r, t){ return t > 0.8 ? g : (t * 3 | 0) % 2 ? '#2a2440' : '#3a3456'; }); } },
      bg:'#141026', gain:0.9,
      mats:{
        // slabs two feet square, purple at night, warmer near the doors where the light falls
        pave:['#3a3352', '#433c5c', '#2e2844', 0.1, function(c, R){ var g = c.gl || 0, a = blot(c, 0.09, seed + 3);
          if (c.ti % 8 === 0 || c.tj % 8 === 0) return R(g > 0.5 ? '#3e2a4e' : '#2a2440');
          return R(g > 0.66 ? (a > 0.5 ? '#5a3a6a' : '#523462') : g > 0.33 ? (a > 0.5 ? '#4a3a62' : '#44385a') : a > 0.62 ? '#433c5c' : a < 0.35 ? '#342e4a' : '#3a3352'); }],
        kerb:['#7a7490', '#8a84a0', '#5e5874', 0.1, function(c, R){ return R(c.ti % 12 === 0 ? '#5e5874' : '#7a7490'); }],
        road:['#1e1c28', '#262432', '#1a1426', 0.1, function(c, R){ var v = c.v || 0, u = c.u || 0, a = blot(c, 0.12, seed + 4);
          if (Math.abs(v - 4.6) < 0.16 && ((u % 3) + 3) % 3 < 1.6) return R('#e8c02a');
          if (Math.abs(u - cx) < 3.2 && v > 0.9 && v < 8 && (((u - cx) % 1.2) + 1.2) % 1.2 < 0.6) return R('#cfcadc');
          return R(a > 0.64 ? '#2a2436' : a < 0.32 ? '#1a1426' : '#1e1c28'); }],
        // the street's puddles: the neon above in the water
        jpool:['#2a1a4a', '#ff8ae8', '#1a1030', 0.06, function(c, R){ var d = c.dep || 0, a = blot(c, 0.25, seed + 6); return R(d < 0.3 ? '#2a2236' : a > 0.62 ? '#5a2a6a' : a < 0.3 ? '#22305a' : '#2a1a46'); }],
        // the arcade's own flat roof behind its front wall, a few skylights glowing
        bldg:['#1a1630', '#221d3a', '#141026', 0.1, function(c, R){ var a = blot(c, 0.1, seed + 8); if (c.ti % 24 < 6 && c.tj % 16 < 4) return R('#3a2a6a'); return R(a > 0.6 ? '#221d3a' : '#1a1630'); }] }
    };
  }

  /* 2. THE CABINET ROWS (Loop de Loop, Neon River, Warp Zone, Elevator): inside. The arcade carpet, dark with its neon
     squiggles, rows of cabinets down both sides facing the course, the Neon River glowing along behind it, more cabinets
     beyond, and the warp gate swirling at the back. Stools and an air hockey table in front, all low. */
  function neoFloor(L){
    var E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot, cx = L.cx;
    var back = P0[1] - E[1];
    function rv(x){ return P0[1] - 3.0 - (vn(x * 0.12, 3, seed) - 0.5) * 1.4; }
    function riv(x, y){ return back > 4.6 ? 1.3 - Math.abs(y - rv(x)) : -9; }
    var gate = back > 7.5 ? { x:cx + (hash(seed, 4, 2) - 0.5) * 6, y:0 } : null; if (gate) gate.y = rv(gate.x) - 2.6;
    var cabs = [];
    function add(x, y, fx, fy){ if (x < E[0] + 0.8 || x > E[2] - 0.8 || y < E[1] + 0.8 || clearAt(x, y) < 1.3 || riv(x, y) > -0.6) return; if (gate && Math.hypot(x - gate.x, y - gate.y) < 2.6) return; cabs.push([x, y, fx, fy]); L.used.push({ x:x, y:y, r:0.8 }); }
    if (back > 4.6) for (var x = E[0] + 1; x < E[2] - 0.6; x += 1.6) add(x, rv(x) - 2.4, 0, 1);
    [-1, 1].forEach(function(s){ for (var row = 0; row < 2; row++){ var x = s < 0 ? P0[0] - 2.4 - row * 3.4 : P1[0] + 2.4 + row * 3.4; for (var y = P0[1] + 0.6; y < P1[1] - 1.6; y += 1.6) add(x, y, -s, 0); } });
    var hockey = spot(1.6, function(x, y){ return -Math.abs(y - P1[1] - 3.2) * 0.8 - Math.abs(x - cx) * 0.1 + hash(x | 0, y | 0, seed + 7); }, function(x, y){ return y > P1[1] + 1.8; });
    var stools = []; for (var i = 0; i < 5; i++){ var q = spot(0.45, function(x, y){ return -Math.abs(clearAt(x, y) - 2.1) * 0.8 + hash(x * 3 | 0, y * 3 | 0, seed + 20 + i); }, function(x, y){ return riv(x, y) < -0.6; }); if (q) stools.push(q); }
    return {
      h:function(x, y){ var r = riv(x, y); return r > 0 ? -0.35 : r > -0.3 ? 0.12 : 0; },
      mat:function(x, y){ var r = riv(x, y); if (r > 0) return ['jpool', { dep:r }]; if (r > -0.3) return ['rim', { u:x }]; return ['carpet', { u:x, v:y }]; },
      build:function(B){
        cabs.forEach(function(q, k){ neoCab(B, q[0], q[1], k + seed, q[2], q[3]); });
        if (gate){ var X = gate.x, Y = gate.y, zb = B.gz(X, Y);   // the warp gate: a ring on its end, swirling inside
          if (B.light){ B.light(X, Y + 0.4, zb + 1.9, '#a46bff'); B.light(X, Y + 0.4, zb + 0.6, '#2bf0ff'); }
          B.solid(X - 2, Y - 0.45, zb, X + 2, Y + 0.45, zb + 4, function(px, py, pz){ var dx = px - X, t = pz - zb - 1.9, r = Math.hypot(dx, t), a = Math.atan2(t, dx);
            if (t < -1.9 + 0.3 && Math.abs(dx) < 1.4) return '#2a2440';
            if (r > 1.9 || Math.abs(py - Y) > (r > 1.55 ? 0.4 : 0.08)) return null; if (r > 1.55) return (Math.floor(a * 4) % 2) ? '#ff2bd6' : '#ffe02b';
            var sw = (a + r * 2.6) / 6.283 * 3; sw = sw - Math.floor(sw); return sw < 0.33 ? '#a46bff' : sw < 0.66 ? '#2bf0ff' : '#1a0f44'; }); }
        if (hockey){ var X = hockey.x, Y = hockey.y, zb = B.gz(X, Y); if (B.light) B.light(X, Y, zb + 1, '#2bf0ff');   // an air hockey table
          B.solid(X - 1.4, Y - 0.8, zb, X + 1.4, Y + 0.8, zb + 1, function(px, py, pz){ var dx = px - X, dy = py - Y, t = pz - zb;
            if (t < 0.7) return Math.abs(Math.abs(dx) - 1.05) < 0.12 && Math.abs(Math.abs(dy) - 0.5) < 0.12 ? '#2a2440' : null;
            if (Math.abs(dx) > 1.32 || Math.abs(dy) > 0.74) return null; if (Math.abs(dx) > 1.22 || Math.abs(dy) > 0.64) return t > 0.86 ? '#ff2bd6' : '#2a2440';
            if (t > 0.86) return null; if (Math.abs(dx) < 0.04 || Math.abs(Math.hypot(dx, dy) - 0.3) < 0.04) return '#e5483a'; if (Math.hypot(dx - 0.5, dy) < 0.13) return '#141018'; return '#bfefff'; }); }
        stools.forEach(function(p, i){ neoStool(B, p.x, p.y, NEO_GLOW[((i + seed) % 6 + 6) % 6]); });
      },
      fill:{ on:['carpet'], trees:0, lows:0.05, tree:function(){}, low:function(B, x, y, i){ neoLow(B, x, y, i, seed); } },
      bg:'#100c26', gain:0.8,
      mats:{
        // arcade carpet: midnight blue with squiggles of cyan and pink, and yellow rings dotted about
        carpet:['#16123a', '#1c1846', '#100c2c', 0.1, function(c, R){ var x = c.ti * 0.25, y = c.tj * 0.25, a = blot(c, 0.06, seed + 2);
          var s1 = Math.abs(Math.sin(x * 0.7 + Math.sin(y * 0.45) * 2.2)), s2 = Math.abs(Math.sin(y * 0.6 + Math.sin(x * 0.4 + 1) * 2.4));
          var gx = Math.floor(x / 2.5), gy = Math.floor(y / 2.5), rr = Math.hypot(x - gx * 2.5 - 1.25, y - gy * 2.5 - 1.25);
          if (s1 < 0.09 && a > 0.55) return R('#22b8d0'); if (s2 < 0.09 && a < 0.4) return R('#d02ab0');
          if (hash(gx, gy, seed) < 0.16 && rr > 0.3 && rr < 0.55) return R('#ffe02b'); if (hash(gx, gy, seed + 1) < 0.12 && rr < 0.3) return R('#7cff4a');
          return R(a > 0.6 ? '#1c1846' : '#16123a'); }],
        rim:['#ff2bd6', '#ff8ae8', '#c8189e', 0.1, function(c, R){ return R(c.ti % 6 === 0 ? '#ffe02b' : '#ff2bd6'); }],
        // the Neon River: a channel of light, bright at its banks and deep blue down the middle
        jpool:['#2a3ac8', '#2bf0ff', '#1a1a7a', 0.06, function(c, R){ var d = c.dep || 0, a = blot(c, 0.18, seed + 5); return R(d < 0.25 ? '#2bf0ff' : d < 0.6 ? (a > 0.55 ? '#a46bff' : '#2a9af0') : a > 0.6 ? '#5a3ae0' : '#2a5ae0'); }] }
    };
  }

  /* 3. THE RACING AND RHYTHM GAMES (Ramp Jump, Shutter Doors, Top Floor, Conveyor Combo): a slot car track painted round the
     course with its kerbs and a checkered gantry over it at the back, sit in racers along the sides, the start lights, and
     dance pads lit up on the floor in front. */
  function neoRace(L){
    var E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot, spotRect = L.spotRect, cx = L.cx;
    var T0 = 1.6, T1 = 3.3;   // the track, between these distances from the rail
    var pads = []; for (var i = 0; i < 3; i++){ var r = spotRect(2.6, 2.6, function(x, y){ return (y > P1[1] ? 3 : 0) - Math.abs(clearAt(x, y) - 6) * 0.3 + hash(x | 0, y | 0, seed + 30 + i) * 2; }); if (r && clearAt(r.x, r.y) > T1 + 1.5) pads.push(r); }
    var racers = []; for (i = 0; i < 6; i++){ var q = spot(1.4, function(x, y){ return L.side(x) * 4 - Math.abs(clearAt(x, y) - T1 - 2.4) * 0.8 + hash(x | 0, y | 0, seed + 40 + i) * 2; }, function(x, y){ return clearAt(x, y) > T1 + 0.9 && y < P1[1] - 1; }); if (q) racers.push(q); }
    var tree = spot(0.6, function(x, y){ return L.side(x) * 3 - Math.abs(y - P0[1] - 2) * 0.4 + hash(x | 0, y | 0, seed + 50); }, function(x, y){ return clearAt(x, y) > T1 + 0.5 && y < P1[1] - 2; });
    var gy = P0[1] - (T0 + T1) / 2, gant = P0[1] - E[1] > T1 + 0.6;
    function padAt(x, y){ for (var k = 0; k < pads.length; k++){ var p = pads[k]; if (Math.abs(x - p.x) < 1.2 && Math.abs(y - p.y) < 1.2) return [x - p.x, y - p.y]; } return null; }
    return {
      h:function(x, y){ return 0; },
      mat:function(x, y){ var d = clearAt(x, y), p = padAt(x, y); if (p) return ['pad', { u:p[0], v:p[1] }];
        if (d > T0 && d < T1) return d < T0 + 0.35 || d > T1 - 0.35 ? ['kerb', { u:x + y }] : ['track', { u:x - y, d:d }]; return ['deck']; },
      build:function(B){
        racers.forEach(function(q, k){ var X = q.x, Y = q.y, zb = B.gz(X, Y), g = NEO_GLOW[((k + seed) % 6 + 6) % 6];   // a sit in racer: the screen hood, the wheel, the bucket seat, facing away from you
          if (B.light) B.light(X, Y - 0.6, zb + 2.0, g);
          B.solid(X - 0.85, Y - 1.3, zb, X + 0.85, Y + 1.3, zb + 2.5, function(px, py, pz){ var dx = px - X, a = py - Y, t = pz - zb, ax = Math.abs(dx);
            if (t < 0.25) return ax < 0.8 && Math.abs(a) < 1.25 ? (ax > 0.7 || Math.abs(a) > 1.15 ? g : '#2a2440') : null;
            if (a < -0.4){ if (ax > 0.8 || t > 2.45) return null; if (a > -0.55 && ax < 0.62 && t > 1.1 && t < 2.1) return (Math.floor((t - 1.1) * 10 + dx * 3) % 4 === 0) ? g : t < 1.5 ? '#2a2a40' : '#2a6ae8'; if (t > 2.15) return a > -0.6 ? '#fff2fa' : g; return ax > 0.7 ? g : '#1a1233'; }
            if (a < 0.1){ if (Math.abs(a + 0.12) < 0.08 && Math.abs(Math.hypot(dx, t - 1.25) - 0.3) < 0.06) return '#c8c6dc'; if (ax < 0.08 && t < 1.2 && a < -0.1) return '#2a2440'; return null; }
            if (ax > 0.5) return null; if (t < 0.85) return a < 0.95 ? '#2a2440' : null; if (t < 1.0 && a < 0.9) return '#e5483a'; if (a > 0.7 && a < 0.95 && t < 2.0) return ax > 0.4 ? '#141018' : '#e5483a'; return null; }); });
        if (tree){ var X = tree.x, Y = tree.y, zb = B.gz(X, Y), LC = ['#ff3a3a', '#ffe02b', '#7cff4a'];   // the start lights on their pole
          for (var j = 0; j < 3; j++) if (B.light) B.light(X, Y + 0.3, zb + 2.4 + j * 0.42, LC[j]);
          B.solid(X - 0.4, Y - 0.4, zb, X + 0.4, Y + 0.4, zb + 3.7, function(px, py, pz){ var t = pz - zb, r = Math.hypot(px - X, py - Y);
            if (t < 2.15) return r < 0.09 ? '#c8c6dc' : null; if (Math.abs(px - X) > 0.3 || Math.abs(py - Y) > 0.22) return null;
            for (var j = 0; j < 3; j++) if (Math.hypot(px - X, t - 3.24 + j * 0.42) < 0.14 && py > Y) return LC[j]; return '#141018'; }); }
        if (gant){ var wl = Math.min((P1[0] - P0[0]) / 2 + 3.5, (E[2] - E[0]) / 2 - 1), zg = B.gz(cx, gy);   // the checkered gantry over the track at the back
          B.solid(cx - wl - 0.3, gy - 0.4, zg, cx + wl + 0.3, gy + 0.4, zg + 3.9, function(px, py, pz){ var dx = px - cx, t = pz - zg, ax = Math.abs(dx);
            if (Math.abs(ax - wl) < 0.2) return Math.abs(py - gy) < 0.2 ? ((t * 2 | 0) % 2 ? '#c8c6dc' : '#ff2bd6') : null;
            if (t < 2.9 || ax > wl || Math.abs(py - gy) > 0.12) return null; if (t > 3.75 || t < 3.0) return '#ff2bd6';
            return ((Math.floor(dx * 2.6) + Math.floor(t * 2.6)) % 2) ? '#f4f2fa' : '#141018'; });
          for (var lx = cx - wl; lx <= cx + wl; lx += 2.4) if (B.light) B.light(lx, gy + 0.2, zg + 3.85, '#ff8ae8'); }
        pads.forEach(function(p, k){ if (B.light) B.light(p.x, p.y, 0.6, NEO_GLOW[k % 6]); });
      },
      fill:{ on:['deck'], trees:0, lows:0.1, tree:function(){}, low:function(B, x, y, i){ neoLow(B, x, y, i, seed); } },
      bg:'#120e28', gain:0.8,
      mats:{
        deck:['#18142c', '#1e1a34', '#141026', 0.1, function(c, R){ var a = blot(c, 0.07, seed + 2), x = c.ti * 0.25, y = c.tj * 0.25;
          if (Math.abs(((x + y) % 6 + 6) % 6 - 3) < 0.13) return R('#3a2a6a'); return R(a > 0.62 ? '#1e1a36' : a < 0.34 ? '#141026' : '#18142c'); }],
        track:['#2a2836', '#323040', '#22202c', 0.1, function(c, R){ var d = c.d || 0, u = c.u || 0; if (Math.abs(d - (T0 + T1) / 2) < 0.12 && ((u % 1.6) + 1.6) % 1.6 < 0.8) return R('#f4f2fa');
          return R(blot(c, 0.1, seed + 3) > 0.62 ? '#323040' : '#2a2836'); }],
        kerb:['#e5483a', '#f4f2fa', '#c8302a', 0.1, function(c, R){ return R(((Math.floor((c.u || 0) * 1.2) % 2) + 2) % 2 ? '#f4f2fa' : '#e5483a'); }],
        // a dance pad: nine tiles, the four arrows lit in their colours, a steel frame
        pad:['#3a3456', '#c8c6dc', '#2a2440', 0.1, function(c, R){ var u = c.u || 0, v = c.v || 0, au = Math.abs(u), av = Math.abs(v);
          if (au > 1.08 || av > 1.08) return R('#9a98b0'); var iu = u < -0.36 ? -1 : u > 0.36 ? 1 : 0, iv = v < -0.36 ? -1 : v > 0.36 ? 1 : 0;
          if (Math.abs(au - 0.36) < 0.06 || Math.abs(av - 0.36) < 0.06) return R('#141018');
          if (iu && iv) return R('#2a2440'); if (!iu && !iv) return R('#3a3456');
          var lu = u - iu * 0.72, lv = v - iv * 0.72, along = iu ? lu * iu : lv * iv, across = iu ? Math.abs(lv) : Math.abs(lu);
          var col = iv < 0 ? '#ff2bd6' : iv > 0 ? '#2bf0ff' : iu < 0 ? '#ffe02b' : '#7cff4a'; return R(across < 0.2 - along * 0.9 && along > -0.2 ? col : '#2a2440'); }] }
    };
  }

  /* 4. THE PRIZE COUNTER (Platform Jump, Double Loop, Pac Maze, Glitch Bridges): a maze painted on the floor with its
     pellets, the glass counter at the back and the wall of prizes behind it with PRIZES in lights, claw machines down the
     sides, and gumball machines in front. */
  function neoPrize(L){
    var E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot, cx = L.cx;
    var back = P0[1] - E[1], cy = P0[1] - Math.min(2.8, back - 1.2), wy = cy - 2.2, hw = Math.min((P1[0] - P0[0]) / 2 + 3, (E[2] - E[0]) / 2 - 1.5);
    var counter = back > 3.2, wall = back > 5.6; if (counter) L.used.push({ x:cx, y:cy, r:0.1 });
    var claws = []; for (var i = 0; i < 6; i++){ var q = spot(1.0, function(x, y){ return L.side(x) * 5 - Math.abs(clearAt(x, y) - 2.4) * 0.6 + L.north(x, y) * 0.15 + hash(x | 0, y | 0, seed + 30 + i); }, function(x, y){ return y < P1[1] - 1.5 && (!counter || y > cy + 1.6 || Math.abs(x - cx) > hw + 1.4); }); if (q) claws.push(q); }
    var gums = []; for (i = 0; i < 3; i++){ var g = spot(0.5, function(x, y){ return -Math.abs(y - P1[1] - 2.5) * 0.7 + hash(x * 3 | 0, y * 3 | 0, seed + 50 + i) * 2; }, function(x, y){ return y > P1[1] + 1.4; }); if (g) gums.push(g); }
    var PLUSH = ['#ff8ab8', '#7ec8ff', '#ffe02b', '#7cff4a', '#ffb02b', '#c8a0ff', '#ffffff'];
    function plush(px, pz, k){ var i = Math.floor(px / 0.62), r = Math.hypot(px - i * 0.62 - 0.31, pz - 0.26); return r < 0.27 ? PLUSH[(hash(i, k, seed) * 7) | 0] : null; }
    return {
      h:function(x, y){ return 0; },
      mat:function(x, y){ return ['maze', { cl:clearAt(x, y) }]; },
      build:function(B){
        if (counter){ var zb = B.gz(cx, cy); for (var lx = cx - hw + 1; lx < cx + hw; lx += 3) if (B.light) B.light(lx, cy + 0.5, zb + 1.3, '#bfefff');
          B.solid(cx - hw, cy - 0.65, zb, cx + hw, cy + 0.65, zb + 1.6, function(px, py, pz){ var dx = px - cx, dy = py - cy, t = pz - zb, ax = Math.abs(dx);   // the glass counter
            if (t < 0.8){ if (dy > 0.5 && Math.abs(t - 0.4) < 0.06) return '#2bf0ff'; return '#2a1a4a'; }
            var edge = ax > hw - 0.1 || Math.abs(dy) > 0.55 || t > 1.5; if (edge) return (Math.abs(dy) > 0.55 && t < 1.5 && ax < hw - 0.1 && (ax % 1.5) > 0.08) ? null : '#9fe8ff';
            if (t < 1.15) return plush(px - cx + 40, t - 0.8, 3); return null; }); }
        if (wall){ var zw = B.gz(cx, wy), ww = neoWide('PRIZES', 0.26), wx = cx - ww / 2;   // the wall of prizes, shelf on shelf, PRIZES lit above
          if (B.light){ B.light(cx, wy + 0.5, zw + 4.6, '#ff2bd6'); B.light(cx - ww / 2, wy + 0.5, zw + 4.6, '#ff2bd6'); B.light(cx + ww / 2, wy + 0.5, zw + 4.6, '#ff2bd6'); }
          B.solid(cx - hw - 0.5, wy - 0.5, zw, cx + hw + 0.5, wy + 0.6, zw + 5.6, function(px, py, pz){ var t = pz - zw, dy = py - wy;
            if (t > 4.0){ if (dy < 0.1) return t > 5.5 ? '#2bf0ff' : '#1a0f33'; return neoWord('PRIZES', px - wx, t - 4.2, 0.26) && dy < 0.3 ? '#ff2bd6' : null; }
            var sh = t % 0.9; if (sh < 0.1) return dy < 0.6 ? '#5a3a8a' : null; if (dy > 0.1){ var p = plush(px - cx + 40, sh - 0.1, Math.floor(t / 0.9)); return p && dy < 0.55 ? p : null; } return '#2a1a4a'; }); }
        claws.forEach(function(q, k){ var X = q.x, Y = q.y, zb = B.gz(X, Y), g = NEO_GLOW[((k + seed) % 6 + 6) % 6];   // a claw machine: glass box of prizes on a lit cabinet, the claw hanging
          if (B.light) B.light(X, Y, zb + 3.0, g);
          B.solid(X - 0.8, Y - 0.8, zb, X + 0.8, Y + 0.8, zb + 3.25, function(px, py, pz){ var dx = px - X, dy = py - Y, t = pz - zb, m = Math.max(Math.abs(dx), Math.abs(dy));
            if (m > 0.75) return null; if (t < 1.2){ if (dy > 0.6 && t > 0.9 && Math.hypot(dx - 0.3, t - 1.05) < 0.08) return '#e5483a'; return m > 0.64 ? g : (dy > 0.6 && Math.abs(dx + 0.3) < 0.12 && Math.abs(t - 0.5) < 0.12 ? '#ffe02b' : '#2a1a4a'); }
            if (t > 2.8) return t > 3.1 ? '#1a0f33' : dy > 0.6 ? '#fff2fa' : g;
            if ((Math.abs(dx) > 0.68 && Math.abs(dy) > 0.68)) return '#c8c6dc';
            if (t < 1.55){ var b = Math.hypot((dx * 3 % 1 + 1) % 1 - 0.5, (dy * 3 % 1 + 1) % 1 - 0.5); return b < 0.42 && m < 0.66 ? PLUSH[(hash(Math.floor(dx * 3), Math.floor(dy * 3), k) * 7) | 0] : null; }
            if (Math.hypot(dx, dy) < 0.05 && t > 2.1) return '#c8c6dc'; if (t > 1.9 && t < 2.15 && Math.hypot(dx, dy) < 0.22 && Math.hypot(dx, dy) > 0.12) return '#c8c6dc'; return null; }); });
        gums.forEach(function(p, k){ var zb = B.gz(p.x, p.y);   // a gumball machine
          B.solid(p.x - 0.4, p.y - 0.4, zb, p.x + 0.4, p.y + 0.4, zb + 1.45, function(px, py, pz){ var t = pz - zb, r = Math.hypot(px - p.x, py - p.y);
            if (t < 0.65) return r < 0.22 + (t < 0.1 ? 0.1 : 0) ? (t > 0.35 && t < 0.5 && py > p.y + 0.15 ? '#c8c6dc' : '#e5483a') : null;
            var s = Math.hypot(r, t - 1.0); if (s < 0.38){ if (s > 0.33) return (s > 0.36 && t > 1.0) ? null : '#e8f6ff'; return PLUSH[(hash(Math.floor(px * 7), Math.floor(pz * 7), Math.floor(py * 7) + k) * 6) | 0]; }
            if (t > 1.33 && r < 0.12) return '#e5483a'; return null; }); });
      },
      fill:{ on:['maze'], trees:0, lows:0.05, tree:function(){}, low:function(B, x, y, i){ neoLow(B, x, y, i, seed); } },
      bg:'#0c0c26', gain:0.8,
      mats:{
        // a maze in blue on the floor, three feet a square, pellets down its lanes. Plain dark close round the course
        maze:['#0c0c2a', '#3050ff', '#08081e', 0.1, function(c, R){ var gi = Math.floor(c.ti / 12), gj = Math.floor(c.tj / 12), li = c.ti - gi * 12, lj = c.tj - gj * 12, cl = c.cl || 9;
          if (cl < 0.9) return R('#0c0c2a');
          var e = (hash(gi, gj, seed + 1) < 0.5 && li >= 10) || (hash(gi - 1, gj, seed + 1) < 0.5 && li <= 1), s = (hash(gi, gj, seed + 2) < 0.45 && lj >= 10) || (hash(gi, gj - 1, seed + 2) < 0.45 && lj <= 1);
          if (e || s){ var edge = (e && (li === 10 || li === 1)) || (s && (lj === 10 || lj === 1)) || ((li === 11 || li === 0) && (lj === 11 || lj === 0)); return R(edge || !((li >= 10 || li <= 1) && (lj >= 10 || lj <= 1)) && ((e && (li === 10 || li === 1)) || (s && (lj === 10 || lj === 1))) ? '#2a3cc0' : '#0a0a24'); }
          if (cl > 1.6 && (li === 5 || li === 6) && (lj === 5 || lj === 6)) return R(hash(gi, gj, seed + 3) < 0.1 ? '#e8c090' : li === 5 && lj === 5 ? '#c8a880' : '#0c0c2a');
          if (cl > 1.6 && ((li === 5 && (lj === 0 || lj === 11) && hash(gi, gj, seed + 4) < 0.5) || (lj === 5 && (li === 0 || li === 11) && hash(gi, gj, seed + 5) < 0.5))) return R('#a89070');
          return R(blot(c, 0.05, seed + 6) > 0.62 ? '#10102e' : '#0c0c2a'); }] }
    };
  }

  /* 5. THE ROOF (Speed Run, Grand Prize): out on top of the arcade at night. Tar and gravel, the parapet along the back,
     ARCADE in big letters standing on it, and past it the city's towers with their windows lit. A water tower, the
     grand prize's gold cup on its plinth, strings of lights down the sides, and air conditioners humming in front. */
  function neoRoof(L){
    var E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot, cx = L.cx;
    var back = P0[1] - E[1], ey = P0[1] - Math.max(2.6, Math.min(4.2, back - 2)), edge = back > 4.6;
    var towers = []; if (edge) for (var x = E[0] - 1 + hash(seed, 1, 2) * 2; x < E[2] + 1; ){ var w = 3 + hash(x | 0, 2, seed) * 2.5, y1 = ey - 2.2 - hash(x | 0, 3, seed) * 2.5, d = 2.5;
      if (y1 - d > E[1] - 6) towers.push({ x0:x, x1:x + w, y0:Math.max(E[1] - 4, y1 - d), y1:y1, h:5 + hash(x | 0, 4, seed) * 7, k:towers.length }); x += w + 0.4 + hash(x | 0, 5, seed) * 1.2; }
    var tank = spot(1.6, function(x, y){ return L.side(x) * 4 - Math.abs(clearAt(x, y) - 3.4) * 0.6 - Math.abs(y - P0[1] - 2) * 0.15 + hash(x | 0, y | 0, seed + 3); }, function(x, y){ return y < P1[1] - 2 && (!edge || y > ey + 2); });
    var cup = spot(1.2, function(x, y){ return L.side(x) * 4 - Math.abs(clearAt(x, y) - 2.8) * 0.8 - Math.abs(y - (P0[1] + P1[1]) / 2) * 0.1 + hash(x | 0, y | 0, seed + 4); }, function(x, y){ return y < P1[1] - 1 && (!edge || y > ey + 1.6); });
    var acs = []; for (var i = 0; i < 4; i++){ var q = spot(0.9, function(x, y){ return -Math.abs(clearAt(x, y) - 2.6) * 0.5 + hash(x * 2 | 0, y * 2 | 0, seed + 10 + i) * 2; }, function(x, y){ return !edge || y > ey + 1.4; }); if (q) acs.push(q); }
    var strings = [];   // the light strings down each side, pole to pole
    [-1, 1].forEach(function(s){ var x = s < 0 ? P0[0] - 1.9 : P1[0] + 1.9; if (x < E[0] + 0.5 || x > E[2] - 0.5) return; var ys = [], y0 = edge ? ey + 1 : P0[1], y1 = P1[1] - 2;
      for (var y = y0; y <= y1; y += Math.max(4, (y1 - y0) / 3)) if (clearAt(x, y) > 1.3 && !L.used.some(function(u){ return Math.hypot(u.x - x, u.y - y) < u.r + 0.4; })) ys.push(y);
      if (ys.length > 1){ strings.push({ x:x, ys:ys }); ys.forEach(function(y){ L.used.push({ x:x, y:y, r:0.4 }); }); } });
    var wd = neoWide('ARCADE', 0.42), wx = cx - wd / 2;
    return {
      h:function(x, y){ return edge && y < ey - 0.7 ? -3 : 0; },
      mat:function(x, y){ if (edge && y < ey - 0.7) return ['street']; if (edge && y < ey) return ['cap']; return ['tar']; },
      build:function(B){
        if (edge){ B.solid(E[0] - 1, ey - 0.7, -0.2, E[2] + 1, ey, 0.9, function(px, py, pz){ return pz > 0.75 ? '#8a84a0' : (px * 0.8 | 0) % 2 ? '#3a3248' : '#342c42'; });   // the parapet
          // ARCADE on its frame, standing on the parapet
          for (var k = 0; k < 6; k++) if (B.light) B.light(wx + k * 1.68 + 0.6, ey, 2.1, '#ff2bd6');
          B.solid(wx - 0.3, ey - 0.7, 0.8, wx + wd + 0.3, ey - 0.2, 3.3, function(px, py, pz){ var t = pz - 0.9, u = px - wx;
            if (t < 0.5) return (Math.abs(((u % 1.4) + 1.4) % 1.4 - 0.7) < 0.06 || Math.abs(Math.abs(((u % 1.4) + 1.4) % 1.4 - 0.7) - t * 1.3) < 0.06) && py < ey - 0.4 ? '#6a6480' : null;
            if (neoWord('ARCADE', u, t - 0.3, 0.42)) return py > ey - 0.45 ? '#ff2bd6' : '#ff8ae8'; return null; });
          // the towers across the street, their windows lit, red lights on their roofs
          towers.forEach(function(T){ var zb = -3, H = T.h, body = T.k % 2 ? '#1c1a30' : '#221e38';
            if (B.light) B.light((T.x0 + T.x1) / 2, (T.y0 + T.y1) / 2, zb + H + 0.3, '#ff3a3a');
            B.vox(T.x0, T.y0, zb, T.x1, T.y1, zb + H + 0.6, function(set){ var s = set.st;
              for (var z = zb; z <= zb + H; z += s) for (var x = T.x0; x <= T.x1; x += s){ var u = x - T.x0, v = z - zb, ci = Math.floor(u / 0.6), ri = Math.floor(v / 0.8), win = (u % 0.6) > 0.18 && (v % 0.8) > 0.3 && u > 0.3 && u < T.x1 - T.x0 - 0.3;
                set(x, T.y1, z, win ? (hash(ci, ri, T.k + seed) < 0.42 ? (hash(ci, ri, T.k + 7) < 0.7 ? '#ffe2a0' : '#9ad8ff') : '#12122a') : body);
                if (v > H - s * 1.5) for (var y = T.y0; y <= T.y1; y += s) set(x, y, z, '#2a2640'); }
              for (var y = T.y0; y <= T.y1; y += s) for (z = zb; z <= zb + H; z += s){ set(T.x0, y, z, body); set(T.x1, y, z, body); }
              var mx = (T.x0 + T.x1) / 2, my = (T.y0 + T.y1) / 2; for (z = zb + H; z < zb + H + 0.6; z += s) set(mx, my, z, z > zb + H + 0.45 ? '#ff3a3a' : '#6a6480'); }); }); }
        if (tank){ var X = tank.x, Y = tank.y, zb = B.gz(X, Y);   // the water tower: a tank of staves on four legs, a cone roof
          B.solid(X - 1.4, Y - 1.4, zb, X + 1.4, Y + 1.4, zb + 5.6, function(px, py, pz){ var dx = px - X, dy = py - Y, t = pz - zb, r = Math.hypot(dx, dy);
            if (t < 2.4){ if (Math.abs(Math.abs(dx) - 0.85) < 0.09 && Math.abs(Math.abs(dy) - 0.85) < 0.09) return '#4a4458'; if (Math.abs(t - 1.3) < 0.06 && (Math.abs(Math.abs(dx) - 0.85) < 0.06 || Math.abs(Math.abs(dy) - 0.85) < 0.06) && Math.max(Math.abs(dx), Math.abs(dy)) < 0.92) return '#4a4458'; return null; }
            if (t < 4.5){ if (r > 1.25) return null; if (Math.abs(t - 2.9) < 0.06 || Math.abs(t - 4.0) < 0.06) return '#2a2440'; return (Math.floor((Math.atan2(dy, dx) + 4) * 7) % 2) ? '#6a4a34' : '#5a3e2c'; }
            return r < 1.35 * (1 - (t - 4.5) / 1.1) ? '#3a3248' : null; }); }
        if (cup){ var X = cup.x, Y = cup.y, zb = B.gz(X, Y); if (B.light){ B.light(X, Y + 0.6, zb + 2.6, '#ffd23a'); B.light(X, Y + 0.8, zb + 0.6, '#ff2bd6'); }   // the grand prize: a gold cup on a lit plinth
          B.solid(X - 1.3, Y - 0.9, zb, X + 1.3, Y + 0.9, zb + 4.0, function(px, py, pz){ var dx = px - X, dy = py - Y, t = pz - zb, r = Math.hypot(dx, dy);
            if (t < 0.9) return Math.abs(dx) < 0.85 && Math.abs(dy) < 0.75 ? (Math.abs(t - 0.75) < 0.06 || Math.abs(t - 0.15) < 0.06 ? '#ff2bd6' : '#2a2440') : null;
            if (t < 1.15) return r < 0.5 ? '#c9a227' : null; if (t < 2.0) return r < 0.13 + Math.max(0, 1.4 - t) * 0.6 ? '#e8c23a' : null;
            if (t < 3.5){ var rb = 0.25 + Math.sqrt(Math.max(0, (t - 2.0) / 1.5)) * 0.65; if (r < rb && r > rb - 0.12 && Math.abs(dy) < 0.9) return t > 3.38 ? '#ffe9a0' : (Math.abs(t - 3.0) < 0.07 ? '#c9a227' : '#ffd23a');
              if (Math.abs(dy) < 0.1 && Math.abs(Math.hypot(Math.abs(dx) - rb - 0.25, t - 2.95) - 0.3) < 0.07) return '#e8c23a'; return null; } return null; }); }
        acs.forEach(function(p, k){ var zb = B.gz(p.x, p.y);   // an air conditioner: a grey box, a fan in the top
          B.solid(p.x - 0.75, p.y - 0.55, zb, p.x + 0.75, p.y + 0.55, zb + 1.05, function(px, py, pz){ var dx = px - p.x, dy = py - p.y, t = pz - zb; if (Math.abs(dx) > 0.7 || Math.abs(dy) > 0.5) return null;
            if (t > 0.95){ var r = Math.hypot(dx - 0.2, dy); if (r < 0.36) return (Math.floor(Math.atan2(dy, dx - 0.2) * 1.9 + 7) % 2) ? '#2a2836' : '#6a6878'; }
            if (dy > 0.44 && dx < -0.05 && t > 0.2 && t < 0.85) return (t * 10 | 0) % 2 ? '#4a4858' : '#7a7888'; return '#8a889a'; }); });
        strings.forEach(function(S, si){ var ys = S.ys, x = S.x;   // poles and the string of bulbs that sags between them
          ys.forEach(function(y){ var zb = B.gz(x, y); B.solid(x - 0.12, y - 0.12, zb, x + 0.12, y + 0.12, zb + 3.2, function(px, py, pz){ return Math.hypot(px - x, py - y) < 0.08 ? '#4a4458' : null; }); });
          for (var j = 0; j < ys.length - 1; j++){ var ya = ys[j], yb = ys[j + 1], n = Math.max(3, Math.round((yb - ya) / 0.9));
            for (var b = 1; b < n; b++){ var u = b / n, y = ya + (yb - ya) * u, z = 3.1 - Math.sin(u * Math.PI) * 0.7, col = NEO_GLOW[(b + si) % 4] === '#7cff4a' ? '#ffe9a0' : NEO_GLOW[(b + si) % 4];
              if (B.light && b % 2) B.light(x, y, z, col);
              (function(y, z, col){ B.solid(x - 0.1, y - 0.1, z - 0.2, x + 0.1, y + 0.1, z + 0.08, function(px, py, pz){ return Math.hypot(px - x, py - y, pz - z + 0.08) < 0.1 ? col : (Math.hypot(px - x, py - y) < 0.03 ? '#2a2440' : null); }); })(y, z, col); } } });
      },
      fill:{ on:['tar'], trees:0, lows:0.05, tree:function(){}, low:function(B, x, y, i){ var zb = B.gz(x, y);   // a vent pipe with its cap
        cyl(B, x, y, 0.28, 0.9, function(r, t){ return t > 0.7 ? (r < 1 ? '#6a6878' : null) : r < 0.55 ? '#8a889a' : null; }); } },
      bg:'#0e0c22', gain:0.9,
      mats:{
        tar:['#211a32', '#2a2240', '#1c162c', 0.1, function(c, R){ var a = blot(c, 0.08, seed + 2), b = blot(c, 0.3, seed + 3);
          if (c.tj % 40 === 0) return R('#1a1426'); return R(a > 0.68 ? '#2a2240' : a < 0.3 ? '#1c162c' : b > 0.64 ? '#241c38' : '#211a32'); }],
        cap:['#8a84a0', '#9a94b0', '#6a6480', 0.1],
        street:['#0e0c1a', '#16142a', '#0a0814', 0.1, function(c, R){ return R(blot(c, 0.15, seed + 4) > 0.7 ? '#1a1430' : '#0e0c1a'); }] }
    };
  }
  /* ---------------- LOST TEMPLE IS A JOURNEY, the way Pirate Cove is. The explorers' camp at the jungle's edge, under the
     temple's outer gate (1 to 4: Polished Hall, Temple Steps, Jade Causeway, Stone Doors), the overgrown ruins where the
     hill came down (5 to 9: Landslide, The Leap, Idol Alley, Moving Floor, Golden Ring), the gorge with its river, falls
     and rope bridge (10 to 12: Temple Stairs, Waterfall, Crumbling Bridges), the great stepped temple with its guardians
     (13 to 16: Spinning Idol, Turning Floor, Serpent Bend, Hidden Chamber), and the inner sanctum with its gold (17 and
     18: Twin Chasms, Heart of the Temple). It is all old dressed stone, moss and jade, where Pirate Cove's jungle is palms
     and a fort. A hole with no place (a daily, a season) keeps the old land. */
  STOPS.temple = [[1, 'camp'], [5, 'ruins'], [10, 'gorge'], [13, 'steps'], [17, 'sanctum']];
  FLY['temple~camp'] = 'parrot'; FLY['temple~ruins'] = 'butterfly'; FLY['temple~gorge'] = 'song'; FLY['temple~steps'] = 'crow'; FLY['temple~sanctum'] = 'bat';
  (function(){ var base = BUILD.temple; BUILD.temple = function(L){ var s = L.stop;
    return s === 'camp' ? tmpCamp(L) : s === 'ruins' ? tmpRuins(L) : s === 'gorge' ? tmpGorge(L) : s === 'steps' ? tmpSteps(L) : s === 'sanctum' ? tmpSanctum(L) : base(L); }; })();

  var TMP_STONE = ['#a69c72', '#978d64', '#6a6448', '#56803e'];   // face, second face, mortar, moss
  var TMP_LEAF = ['#1f5a2a', '#2a6b33', '#3d8a3a'];
  // dressed stone: courses half a foot high, each laid over half a block, a line of mortar, each block its own shade, moss in soft patches
  function tmpAshlar(u, t, sd, S){ var row = Math.floor(t / 0.55), uu = u + (row % 2) * 0.55 + 40, col = Math.floor(uu / 1.1);
    if (t - row * 0.55 < 0.09 || uu - col * 1.1 < 0.09) return S[2];
    if (vn(u * 0.7, t * 0.9, sd) > 0.72) return S[3];
    return vn(col * 0.83, row * 0.71, sd + 3) > 0.5 ? S[0] : S[1]; }
  // a jungle tree with vines hanging from its crown
  function tmpTree(B, x, y, H, k){ broadTree(B, x, y, H, '#4a3626', TMP_LEAF, k); var zb = B.gz(x, y), cz = zb + H * 0.68, R = H * 0.3;
    B.vox(x - R * 1.6, y - R * 1.4, zb, x + R * 1.6, y + R * 1.4, cz, function(set){ for (var v = 0; v < 4; v++){ var a = hash(k, v, 41) * 6.28, r = R * (0.9 + hash(v, k, 42) * 0.4), vx = x + Math.cos(a) * r, vy = y + Math.abs(Math.sin(a)) * r * 0.7, len = 1.2 + hash(k, v, 43) * 1.6;
      B.tube(set, vx, vy, cz - R * 0.2, vx + 0.1, vy, cz - R * 0.2 - len, 0.07, 0.05, v % 2 ? '#3f7a2e' : '#2f6a28'); } }); }
  // the low things of the temple's ground: ferns, and blocks fallen out of the walls
  function tmpLow(B, x, y, i, seed){ var k = hash(i, seed, 51);
    if (k < 0.55) bush(B, x, y, 0.45, ['#2f7d32', '#3f9a46', '#1f5a2a']);
    else if (k < 0.8){ var zb = B.gz(x, y) - 0.05, a = hash(i, seed, 52) * 0.8;   // a fallen block, square cut, tipped, moss on top
      B.solid(x - 0.5, y - 0.5, zb, x + 0.5, y + 0.5, zb + 0.6, function(px, py, pz){ var dx = px - x, dy = py - y, u = dx * Math.cos(a) + dy * Math.sin(a), v = -dx * Math.sin(a) + dy * Math.cos(a), t = pz - zb;
        if (Math.abs(u) > 0.38 || Math.abs(v) > 0.3 || t > 0.5 - u * 0.15) return null; return t > 0.42 - u * 0.15 ? (vn(px * 3, py * 3, 7) > 0.5 ? '#56803e' : '#b9ae84') : (Math.abs(u) > 0.33 ? '#8a8060' : '#a69c72'); }); }
    else rockAt(B, x, y, 0.36, ['#8a8470', '#6e7a52']); }
  // a fire in its ring of stones (it flickers: B.light)
  function tmpFire(B, X, Y, s){ var zb = B.gz(X, Y); s = s || 1; if (B.light) B.light(X, Y, zb + 0.5 * s, '#ff8a2a');
    B.solid(X - 0.55 * s, Y - 0.55 * s, zb - 0.05, X + 0.55 * s, Y + 0.55 * s, zb + 0.95 * s, function(px, py, pz){ var r = Math.hypot(px - X, py - Y) / s, t = (pz - zb) / s;
      if (t < 0.2 && r > 0.36 && r < 0.5) return (Math.floor(Math.atan2(py - Y, px - X) * 2.6) % 2) ? '#6e665e' : '#857c70'; if (t < 0.13 && r < 0.36) return Math.abs(Math.sin((px - X) * 9)) < 0.3 ? '#3a2412' : '#5a3818';
      if (t >= 0.1 && r < 0.3 * (1 - t / 0.9)) return t < 0.32 ? '#ffd23a' : t < 0.58 ? '#ff8a1a' : '#e5483a'; return null; }); }
  // a stone brazier: a pedestal, a bowl, and the fire in it
  function tmpBrazier(B, X, Y){ var zb = B.gz(X, Y); if (B.light) B.light(X, Y, zb + 1.5, '#ff9a2a');
    B.solid(X - 0.5, Y - 0.5, zb - 0.05, X + 0.5, Y + 0.5, zb + 1.9, function(px, py, pz){ var r = Math.hypot(px - X, py - Y), t = pz - zb;
      if (t < 0.2) return r < 0.42 ? '#8a8060' : null; if (t < 0.95) return r < 0.2 ? (Math.floor(t * 6) % 2 ? '#a69c72' : '#978d64') : null;
      if (t < 1.25) return r < 0.2 + (t - 0.95) * 1 && r > 0.1 + (t - 0.95) * 0.9 ? (Math.abs(t - 1.15) < 0.04 ? '#c9a227' : '#a69c72') : (r < 0.16 + (t - 0.95) && t > 1.15 ? '#3a2412' : null);
      if (r < 0.32 * (1 - (t - 1.25) / 0.6)) return t < 1.38 ? '#ffd23a' : t < 1.55 ? '#ff8a1a' : '#e5483a'; return null; }); }
  // a jungle floor: two greens and a brown, laid in soft patches
  function tmpGreen(seed){ return function(c, R){ var a = blot(c, 0.09, seed + 7), b = blot(c, 0.26, seed + 8); return R(a > 0.7 ? '#4a6230' : b > 0.64 ? '#42722f' : b < 0.3 ? '#34602b' : '#3b6a2e'); }; }

  /* 1. THE EXPLORERS' CAMP: the temple's outer wall across the back with its gate, carved lintel and stone doors, the
     jungle thick beyond it, a track worn from the gate to the tee, and the camp on the near side: tents, the fire,
     crates and lanterns. */
  function tmpCamp(L){
    var C = L.C, E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot, spotRect = L.spotRect;
    var gx = L.cx + (hash(seed, 4, 1) - 0.5) * Math.min(6, (P1[0] - P0[0]) * 0.5), gy = Math.max(E[1] + 2, P0[1] - 5.4);
    function wallY(x){ return gy + (vn(x * 0.08, 3, seed) - 0.5) * 0.8; }
    L.used.push({ x:gx, y:gy, r:4.2 });
    for (var wx = E[0]; wx < E[2]; wx += 2) L.used.push({ x:wx, y:wallY(wx), r:1.1 });
    var track = L.route([gx, gy + 1], [C.tee[0], P1[1] + 1.4], seed + 4, 1.2), dTr = L.dist(track);
    var tents = []; for (var i = 0; i < 2; i++){ var r = spotRect(3.4, 3, function(x, y){ return L.side(x) * 6 - Math.abs(y - (P0[1] + P1[1]) / 2) * 0.2 + (i ? (x > L.cx ? 1 : -1) : (x < L.cx ? 1 : -1)) * 2 + hash(x | 0, y | 0, seed + 30 + i); }); if (r) tents.push(r); }
    var fire = spot(1.1, function(x, y){ return L.side(x) * 3 - Math.abs(clearAt(x, y) - 3) - Math.abs(y - (P0[1] + P1[1]) / 2) * 0.1 + hash(x | 0, y | 0, seed + 33); }, function(x, y){ return dTr(x, y) > 1.6 && y > gy + 3; });
    var camp = []; if (fire) for (i = 0; i < 4; i++){ var q = spot(0.55, function(x, y){ return -Math.abs(Math.hypot(x - fire.x, y - fire.y) - 1.9) * 2 + hash(x * 3 | 0, y * 3 | 0, seed + 40 + i); }, function(x, y){ return dTr(x, y) > 1.2; }); if (q) camp.push(q); }
    var lamps = []; for (i = 0; i < 3; i++){ var lp = spot(0.4, function(x, y){ return -Math.abs(clearAt(x, y) - 1.7) + L.side(x) + hash(x * 3 | 0, y * 3 | 0, seed + 50 + i); }, function(x, y){ return y > gy + 2.5 && y < P1[1]; }); if (lp) lamps.push(lp); }
    function clearing(x, y){ return fire ? 1 - Math.hypot(x - fire.x, y - fire.y) / 3.4 + (vn(x * 0.7, y * 0.7, seed + 3) - 0.5) * 0.35 : -1; }
    return {
      h:function(x, y){ var z = (fbm(x * 0.07, y * 0.08, seed) - 0.42) * 1.4 * sm(1.5, 6, clearAt(x, y)); if (y < gy - 1) z += Math.min(1.6, (gy - 1 - y) * 0.25); if (dTr(x, y) < 0.8) z = z * 0.4 + 0.03; return z; },
      mat:function(x, y){ var wy = wallY(x); if (Math.abs(y - gy - 1.4) < 1.1 && Math.abs(x - gx) < 3.4) return ['flag', { u:x }]; if (y < wy + 0.9 && y > wy - 0.9) return ['dirt'];
        if (dTr(x, y) < 0.85) return ['dirt']; if (clearing(x, y) > 0) return ['dirt']; return ['grass']; },
      build:function(B){
        // the wall, broken off in places, and the gate in it
        for (var x0 = E[0] - 1; x0 < E[2] + 1; x0 += 3.6){ var mx = x0 + 1.8; if (Math.abs(mx - gx) < 5.6) continue; (function(x0, k){ var y0 = wallY(x0 + 1.8), zb = B.gz(x0 + 1.8, y0);
          B.solid(x0, y0 - 0.6, zb - 0.3, x0 + 3.6, y0 + 0.6, zb + 3.4, function(px, py, pz){ var t = pz - zb, top = 1.2 + vn(px * 0.35, k, seed + 9) * 2.1; if (Math.abs(py - wallY(px)) > 0.5 || t > top) return null;
            return t > top - 0.25 && vn(px * 1.3, 2, seed) > 0.4 ? '#4f7a3a' : tmpAshlar(px, t, seed + k, TMP_STONE); }, B.ART * 0.7); })(x0, Math.round(x0)); }
        (function(){ var X = gx, Y = gy, zb = B.gz(X, Y);
          B.solid(X - 4.6, Y - 0.9, zb - 0.3, X + 4.6, Y + 0.95, zb + 6, function(px, py, pz){ var dx = px - X, dy = py - Y, ady = Math.abs(dy), t = pz - zb, ax = Math.abs(dx);
            if (t > 4.3 && t < 5.5 && ax < 4.2 && ady < 0.8){   // the lintel, with a face carved in the middle of it
              if (dy > 0.65 && ax < 1 && t > 4.45 && t < 5.35){ if (Math.hypot(ax - 0.42, t - 4.98) < 0.13) return '#3fd0a0'; if (ax < 0.55 && Math.abs(t - 4.62) < 0.05) return '#3a3424'; if (ax > 0.9 || t > 5.27 || t < 4.52) return '#7b7354'; return '#c2b78c'; }
              if (t > 5.3 && vn(dx * 1.4, 1, seed + 2) > 0.45) return '#4f7a3a'; return tmpAshlar(dx, t, seed + 1, TMP_STONE); }
            if (ax > 2.2 && ax < 3.7 && ady < 0.7 && t < 4.3) return t < 0.4 && ax > 2.3 && ax < 3.6 ? '#7b7354' : tmpAshlar(dx + (dx > 0 ? dy : -dy), t, seed + 2, TMP_STONE);   // the pillars
            if (dy > 0.75 && dy < 0.9 && ax < 3.9 && t > 2.4 && t < 4.3){ var vl = 4.3 - (0.6 + vn(dx * 2.6, 3, seed + 5) * 2.2); if (t > vl && Math.abs(Math.sin(dx * 5.3)) < 0.45) return vn(dx * 4, t * 2, 8) > 0.5 ? '#3f8a3a' : '#2f6a28'; }   // vines down the face
            if (ady < 0.16 && ax < 2.2 && t < 4.3){ if (dx > 0.25 && dx < 1.15) return null;   // the stone doors, one pushed open
              var px2 = dx < 0.25 ? dx + 1 : dx - 1.67; if (Math.abs(Math.abs(px2) - 0.95) < 0.08 || t > 4.12 || Math.abs(t - 2.1) < 0.06) return '#6f6a4e'; if (Math.hypot(px2, t - 2.9) < 0.35 && Math.hypot(px2, t - 2.9) > 0.25) return '#c9a227'; return '#958b63'; }
            if (dy < -0.05 && ady < 0.5 && ax < 2.2 && t < 4.3) return '#14110a';   // the dark beyond the doors
            return null; }, B.ART * 0.7); })();
        tents.forEach(function(r, n){ var X = r.x, Y = r.y, zb = B.gz(X, Y), W2 = 1.4, D2 = 1.3, H = 1.9, cv = n % 2 ? ['#d8c89a', '#c4b484'] : ['#c8b67e', '#b4a26c'];   // a ridge tent, its door to the camera
          B.solid(X - 1.8, Y - 1.6, zb - 0.05, X + 1.8, Y + 1.8, zb + 2.3, function(px, py, pz){ var dx = px - X, dy = py - Y, t = pz - zb, hw = W2 * (1 - t / H);
            if (Math.abs(dx) < 0.05 && dy > D2 - 0.1 && dy < D2 + 0.4 && t < H + 0.3) return '#5a3818';   // the pole
            if (t > H || Math.abs(dy) > D2 || Math.abs(dx) > hw) return null; if (Math.abs(dx) > hw - 0.1 && dy > D2 - 0.12) return cv[1];
            if (dy > D2 - 0.1 && Math.abs(dx) < (H - t) * 0.32 && t < H * 0.75) return '#2a2016'; if (Math.abs(dx) < 0.06) return '#8a7a54'; return (dx < 0 ? cv[0] : cv[1]); }); });
        if (fire) tmpFire(B, fire.x, fire.y);
        camp.forEach(function(p, i){ var k = i % 4; if (k === 3){ var zb = B.gz(p.x, p.y);   // a log to sit on
            B.solid(p.x - 0.8, p.y - 0.3, zb - 0.05, p.x + 0.8, p.y + 0.3, zb + 0.5, function(px, py, pz){ var r = Math.hypot(py - p.y, pz - zb - 0.24); if (r > 0.24 || Math.abs(px - p.x) > 0.75) return null; return Math.abs(px - p.x) > 0.7 ? '#c8a070' : r > 0.19 ? '#5a3a20' : '#6e4a2a'; }); }
          else pirProp(B, p.x, p.y, k === 1 ? 0 : 1); });
        lamps.forEach(function(p){ lamp(B, p.x, p.y, '#3a3028', '#ffd77a'); });
      },
      fill:{ on:['grass'], trees:0.62, lows:0.18, tree:function(B, x, y, i){ tmpTree(B, x, y, 4.4 + hash(i, seed, 31) * 2, i * 7 + seed); }, low:function(B, x, y, i){ tmpLow(B, x, y, i, seed); } },
      bg:'#2c4a24', gain:1.9,
      mats:{ grass:['#3b6a2e', '#4a7a32', '#30582a', 0.1, tmpGreen(seed)],
        dirt:['#7a6040', '#8a6e4a', '#6a5236', 0.1, function(c, R){ var a = blot(c, 0.2, seed + 5); return R(a > 0.66 ? '#8e7450' : a < 0.3 ? '#6a5236' : '#7a6040'); }],
        flag:['#a69c72', '#b3a97e', '#7b7354', 0.1, function(c, R){ var i = Math.floor(c.ti / 6), j = Math.floor(c.tj / 5); if (c.ti % 6 === 0 || c.tj % 5 === 0) return R('#6f6a4e'); return R(blot(c, 0.25, seed + 6) > 0.7 ? '#56803e' : vn(i * 0.8, j * 0.8, seed) > 0.5 ? '#a69c72' : '#958b63'); }] }
    };
  }

  /* 2. THE OVERGROWN RUINS: the hill behind has come down, a fan of scree and boulders spilling out of the jungle, and
     what the jungle kept: broken walls, the stumps of columns and drums fallen out of them, an old floor coming up
     through the moss, and the great stone heads of Idol Alley, sunk to the chin. */
  function tmpRuins(L){
    var E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot, spotRect = L.spotRect;
    function footY(x){ return P0[1] - 4.4 - (vn(x * 0.1, 6, seed) - 0.5) * 2.4; }   // the foot of the hill
    var slX = L.cx + (hash(seed, 6, 2) < 0.5 ? -1 : 1) * Math.min(5.5, (P1[0] - P0[0]) * 0.35);   // where the slide came down
    function scree(x, y){ var fy = footY(x); if (y > fy + 2.6) return -1; return 1 - Math.abs(x - slX) / (1.6 + Math.max(0, y - fy + 7) * 0.32) + (vn(x * 0.6, y * 0.6, seed + 4) - 0.5) * 0.3; }
    var boulders = []; for (var i = 0; i < 9; i++){ var bx = slX + (hash(i, seed, 61) - 0.5) * 6, by = footY(bx) - 5 + hash(i, seed, 62) * 7.2;
      if (scree(bx, by) > 0.15 && clearAt(bx, by) > 1.8 && by > E[1] + 1){ var br = 0.45 + hash(i, seed, 63) * 0.5; boulders.push({ x:bx, y:by, r:br }); L.used.push({ x:bx, y:by, r:br + 0.3 }); } }
    var walls = []; for (i = 0; i < 3; i++){ var w = spot(2.5, function(x, y){ return L.side(x) * 3 - Math.abs(clearAt(x, y) - 4.5) * 0.4 + hash(x | 0, y | 0, seed + 70 + i) * 2; }, function(x, y){ return y < L.P1[1] && scree(x, y) < -0.2; }); if (w) walls.push(w); }
    var heads = []; for (i = 0; i < 2; i++){ var hd = spot(1.3, function(x, y){ return L.side(x) * 5 - Math.abs(clearAt(x, y) - 2.6) + (i ? (x > L.cx ? 2 : 0) : (x < L.cx ? 2 : 0)) + hash(x | 0, y | 0, seed + 80 + i); }, function(x, y){ return y < L.P1[1] - 1.5 && scree(x, y) < 0; }); if (hd) heads.push(hd); }
    var cols = []; for (i = 0; i < 4; i++){ var c0 = spot(0.55, function(x, y){ return -Math.abs(clearAt(x, y) - 2.2) * 0.7 + L.side(x) + hash(x * 3 | 0, y * 3 | 0, seed + 90 + i); }, function(x, y){ return y < L.P1[1] - 1; }); if (c0) cols.push(c0); }
    var drums = []; for (i = 0; i < 3; i++){ var d0 = spot(0.8, function(x, y){ return -Math.abs(clearAt(x, y) - 2.4) * 0.5 + hash(x * 3 | 0, y * 3 | 0, seed + 95 + i); }); if (d0) drums.push(d0); }
    return {
      h:function(x, y){ var fy = footY(x), z = (fbm(x * 0.08, y * 0.09, seed) - 0.42) * 1.2 * sm(1.4, 6, clearAt(x, y)); if (y < fy) z += Math.min(3, (fy - y) * 0.45) * sm(1.5, 4, clearAt(x, y)); return z; },
      mat:function(x, y){ var s = scree(x, y); if (s > 0) return ['scree', { s:s }]; if (y < footY(x) - 0.5) return ['hill'];
        if (vn(x * 0.16, y * 0.16, seed + 11) > 0.6 && clearAt(x, y) < 7) return ['floor']; return ['moss']; },
      build:function(B){
        boulders.forEach(function(b, i){ rockAt(B, b.x, b.y, b.r, ['#8a8470', '#76705e']); });
        walls.forEach(function(r, k){ var zb = B.gz(r.x, r.y);   // a wall, broken off, a doorway in the longer ones
          B.solid(r.x - 2.4, r.y - 0.6, zb - 0.3, r.x + 2.4, r.y + 0.6, zb + 3.6, function(px, py, pz){ var dx = px - r.x, t = pz - zb, top = 0.9 + vn(dx * 0.5, k, seed + 12) * 2.6;
            if (Math.abs(py - r.y) > 0.5 || t > top) return null; if (Math.abs(dx - 0.4) < 0.55 && t < 2.2 && top > 2.4) return null;
            return t > top - 0.2 ? '#56803e' : tmpAshlar(dx, t, seed + k, TMP_STONE); }, B.ART * 0.7); });
        heads.forEach(function(p, k){ var X = p.x, Y = p.y, zb = B.gz(X, Y) - 0.3;   // a stone head sunk to the chin, jade in its eyes
          B.solid(X - 1.2, Y - 1, zb, X + 1.2, Y + 1.1, zb + 2.7, function(px, py, pz){ var dx = px - X, dy = py - Y, t = pz - zb, ax = Math.abs(dx);
            var w = t < 2 ? 0.95 : 0.95 - (t - 2) * 0.5; if (ax > w || Math.abs(dy) > 0.85 || t > 2.55) return null; var front = dy > 0.72;
            if (t > 2.1) return t > 2.45 ? (vn(dx * 2, dy * 2, seed + k) > 0.45 ? '#56803e' : '#a69c72') : (t < 2.22 ? '#c9a227' : '#b3a97e');   // a band of gold, the crown worn and mossed
            if (front){ if (Math.abs(t - 1.6) < 0.15 && Math.abs(ax - 0.4) < 0.17) return t > 1.6 ? '#7fe0c0' : '#2fb58f'; if (Math.abs(t - 1.86) < 0.05 && ax < 0.75) return '#6f6a4e';
              if (ax < 0.12 && t > 1.1 && t < 1.5) return '#b3a97e'; if (Math.abs(t - 0.82) < 0.06 && ax < 0.42) return '#3a3424'; }
            if (vn(dx * 1.5, t * 1.5, seed + k) > 0.7) return '#56803e'; return Math.floor(t / 0.55) % 2 ? '#a69c72' : '#978d64'; }); });
        cols.forEach(function(c, i){ var H = 0.8 + hash(i, seed, 91) * 2;   // a column, broken off
          cyl(B, c.x, c.y, 0.42, H + 0.2, function(d, t, dx){ if (t < 0.25) return '#8a8060'; if (t > H - 0.15 + Math.sin(dx * 8) * 0.12) return t > H + Math.sin(dx * 8) * 0.12 ? null : '#56803e'; if (d > 0.82) return null;
            return (Math.floor((dx + 1) * 7) % 2) ? '#b3a97e' : '#a69c72'; }); });
        drums.forEach(function(d, i){ var zb = B.gz(d.x, d.y) - 0.05, a = hash(i, seed, 96) * 3.14;   // a drum fallen out of a column, on its side
          B.solid(d.x - 0.8, d.y - 0.8, zb, d.x + 0.8, d.y + 0.8, zb + 0.8, function(px, py, pz){ var dx = px - d.x, dy = py - d.y, u = dx * Math.cos(a) + dy * Math.sin(a), v = -dx * Math.sin(a) + dy * Math.cos(a), r = Math.hypot(v, pz - zb - 0.38);
            if (Math.abs(u) > 0.5 || r > 0.38) return null; if (Math.abs(u) > 0.45) return r < 0.06 ? '#6f6a4e' : '#c2b78c'; return Math.floor(Math.atan2(pz - zb - 0.38, v) * 2.2 + 8) % 2 ? '#a69c72' : '#958b63'; }); });
      },
      fill:{ on:['moss', 'hill'], trees:0.55, lows:0.38, tree:function(B, x, y, i){ tmpTree(B, x, y, 4.2 + hash(i, seed, 31) * 1.8, i * 5 + seed); }, low:function(B, x, y, i){ tmpLow(B, x, y, i, seed); } },
      bg:'#2c4a24', gain:2,
      mats:{ moss:['#3b6a2e', '#4a7a32', '#30582a', 0.1, tmpGreen(seed)],
        hill:['#3b6a2e', '#42722f', '#34602b', 0.1, function(c, R){ var a = blot(c, 0.12, seed + 21); return R(a > 0.64 ? '#42722f' : a < 0.34 ? '#34602b' : '#3b6a2e'); }],
        scree:['#8a8470', '#9a9480', '#6e6a58', 0.1, function(c, R){ var a = blot(c, 0.3, seed + 22), b = blot(c, 0.1, seed + 23), s = c.s || 0; return R(s < 0.12 && b > 0.5 ? '#5a6a3a' : a > 0.66 ? '#a29c86' : a < 0.3 ? '#6e6a58' : b > 0.6 ? '#7a6a50' : '#8a8470'); }],
        floor:['#958b63', '#a69c72', '#6f6a4e', 0.1, function(c, R){ var i = Math.floor(c.ti / 6), j = Math.floor(c.tj / 6); var m = blot(c, 0.14, seed + 24); if (c.ti % 6 === 0 || c.tj % 6 === 0) return R(m > 0.5 ? '#4a6a30' : '#6f6a4e');
          return R(m > 0.66 ? '#5a7a3a' : vn(i * 0.7, j * 0.7, seed + 2) > 0.5 ? '#9a9068' : '#8a8060'); }] }
    };
  }

  /* 3. THE GORGE: a river runs the width of the land behind the hole, under a cliff. The falls come off the top of it,
     the temple's stairs are cut up its face, and an old rope bridge, planks gone here and there, crosses the river to
     the foot of the stairs. Jungle along the top. */
  function tmpGorge(L){
    var E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot;
    function bankY(x){ return P0[1] - 2.8 - (vn(x * 0.09, 4, seed) - 0.5) * 1.4; }   // the near bank
    function farY(x){ return bankY(x) - 3.4 - (vn(x * 0.15, 5, seed) - 0.5) * 0.8; }   // the foot of the cliff
    var sx0 = hash(seed, 9, 2) < 0.5 ? -1 : 1, span = Math.min(6, (E[2] - E[0]) * 0.18);
    var fallX = L.cx - sx0 * span, stX = L.cx + sx0 * span;
    L.used.push({ x:stX, y:bankY(stX) + 0.8, r:1.4 });
    var rocks = []; for (var i = 0; i < 5; i++){ var rq = spot(0.6, function(x, y){ return -Math.abs(y - bankY(x) - 1.2) * 1.5 + hash(x * 2 | 0, y * 2 | 0, seed + 60 + i) * 2; }, function(x, y){ return y > bankY(x) + 0.7 && Math.abs(x - stX) > 2; }); if (rq) rocks.push(rq); }
    var CT = 7;   // the cliff's height: its face is a solid (a face this steep laid as ground reads dark and streaked), the top is ground
    return {
      h:function(x, y){ var bk = bankY(x), f = farY(x); if (y < f - 1.2) return CT + (fbm(x * 0.2, y * 0.2, seed + 5) - 0.5) * 0.6; if (y < f) return -0.6; if (y < bk) return -0.6; if (y < bk + 0.6) return 0.12;
        return (fbm(x * 0.08, y * 0.1, seed) - 0.42) * 1.2 * sm(1.3, 6, clearAt(x, y)); },
      mat:function(x, y){ var bk = bankY(x), f = farY(x);
        if (y < f - 1.2) return Math.abs(x - fallX) < 1 ? ['jpool', { dep:1 }] : ['top']; if (y < f) return ['ledge'];
        if (y < bk){ if (Math.hypot((x - fallX) / 2, y - f - 0.4) < 1) return ['foam']; return ['jpool', { dep:Math.min(y - f, bk - y) }]; }
        if (y < bk + 0.6) return ['ledge']; return ['moss']; },
      build:function(B){
        // the cliff face: banded rock, moss in patches and along the lip, the falls down it, the stairs cut up it
        for (var x0 = E[0] - 0.5; x0 < E[2] + 0.5; x0 += 6) (function(x0){ var x1 = x0 + 6, ymin = 1e9, ymax = -1e9; for (var q = x0; q <= x1; q += 0.5){ ymin = Math.min(ymin, farY(q)); ymax = Math.max(ymax, farY(q)); }
          B.solid(x0, ymin - 1.4, -0.7, x1, ymax + 0.9, CT + 0.2, function(px, py, pz){ var f = farY(px), face = f - 0.5 - pz * 0.06 + (vn(px * 0.7, pz * 0.5, seed + 6) - 0.5) * 0.35, ax = Math.abs(px - stX);
            if (ax < 0.9 && pz < CT){ var zs = Math.floor(pz / 0.45), sy = f + 0.75 - zs * 0.17; if (py < sy && py > f - 1.4) return ax > 0.78 ? '#7b7354' : (pz - zs * 0.45 > 0.33 ? '#ddd2a6' : '#a69c72'); if (py >= sy) return null; }
            if (py > face || py < f - 1.4) return null; var fx = Math.abs(px - fallX);
            if (fx < 1){ var v = vn(px * 2.4, pz * 0.35 - fx, seed + 33); return v > 0.6 ? '#ffffff' : v > 0.38 ? '#cdeef6' : '#8fd4ec'; }
            if (pz > CT - 0.35 - vn(px * 0.6, 1, seed + 7) * 0.5 || vn(px * 0.5, pz * 0.45, seed + 31) > 0.72) return pz > CT - 0.2 ? '#4f7a3a' : '#5a8a42';
            var band = pz * 1.4 + (vn(px * 0.12, 2, seed + 8) - 0.5) * 0.8, bf = band - Math.floor(band); return bf < 0.16 ? '#8a7c62' : vn(px * 0.35, Math.floor(band) * 0.9, seed + 9) > 0.55 ? '#b4a484' : '#a8987a'; }, B.ART); })(x0);
        (function(){ var X = stX, y0 = bankY(X) + 0.9, y1 = farY(X) + 0.1, L2 = y0 - y1;   // the rope bridge: posts at either end, a sagging deck, planks gone, rope rails
          B.solid(X - 1.1, y1 - 0.2, -0.7, X + 1.1, y0 + 0.3, 1.9, function(px, py, pz){ var dx = px - X, u = (y0 - py) / L2, ax = Math.abs(dx);
            if (u < -0.1 || u > 1.05) return null; var zd = 0.45 - Math.sin(Math.max(0, Math.min(1, u)) * 3.14) * 0.5;
            if ((u < 0.04 || u > 0.96) && Math.abs(ax - 0.85) < 0.1 && pz < 1.6) return '#5a3818';   // the posts
            var zr = zd + 0.95 + Math.sin(u * 3.14) * 0.15; if (Math.abs(ax - 0.85) < 0.06 && Math.abs(pz - zr) < 0.06) return '#c8a870';   // the rope rails
            var pk = Math.floor(u * L2 / 0.32); if (Math.abs(ax - 0.85) < 0.04 && pz > zd && pz < zr && (u * L2 / 0.32) % 3 < 0.25) return '#a8885a';   // the hangers
            if (ax < 0.8 && Math.abs(pz - zd) < 0.06){ if (hash(pk, 3, seed) < 0.14 && u > 0.15 && u < 0.85) return null; return ((u * L2 / 0.32) % 1) < 0.18 ? '#4a2e18' : (pk % 3 ? '#8a6a44' : '#7a5a38'); }
            return null; }, B.ART * 0.7); })();
        rocks.forEach(function(r){ rockAt(B, r.x, r.y, 0.55, ['#8a8470', '#6e7a52']); });
      },
      fill:{ on:['moss', 'top'], trees:0.5, lows:0.34, tree:function(B, x, y, i){ tmpTree(B, x, y, 4.2 + hash(i, seed, 31) * 1.8, i * 3 + seed); }, low:function(B, x, y, i){ tmpLow(B, x, y, i, seed); } },
      bg:'#2c4a24', gain:2.1,
      mats:{ moss:['#3b6a2e', '#4a7a32', '#30582a', 0.1, tmpGreen(seed)], top:['#30582a', '#3b6a2e', '#264a22', 0.1, tmpGreen(seed + 3)],
        ledge:['#958b63', '#a69c72', '#6f6a4e', 0.1, function(c, R){ if (c.ti % 6 === 0) return R('#6f6a4e'); return R(vn(Math.floor(c.ti / 6) * 0.9, 1, seed) > 0.5 ? '#a69c72' : '#958b63'); }],
        foam:['#e6f6f6', '#ffffff', '#cfeeee', 0.1, function(c, R){ return R(blot(c, 0.5, seed + 34) > 0.5 ? '#ffffff' : '#d6f0f0'); }],
        jpool:['#2f8f9a', '#6fc8d0', '#1f6a78', 0.06, function(c, R){ var d = c.dep || 0, f = blot(c, 0.08, seed + 35); return R(d < 0.35 ? '#7fd0d4' : f > 0.66 ? '#3fa2a8' : d < 1.1 ? '#2f8f9a' : '#1f6a78'); }] }
    };
  }

  /* 4. THE TEMPLE STEPS: the great temple itself behind the hole, five tiers and a stair up the middle to the shrine on
     top, serpent heads at the foot of the stair, a plaza of big flagstones round the course, guardians on their plinths
     down the sides, braziers lit, and a stone serpent winding along the ground. */
  function tmpSteps(L){
    var E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot, spotRect = L.spotRect;
    var W = Math.min(19, (E[2] - E[0]) * 0.55), D = 8.2, Y = P0[1] - 3.2 - D / 2 - 1; if (Y - D / 2 < E[1] + 0.4){ D = Math.max(5.4, (P0[1] - 4.2 - E[1] - 0.4) - 1); Y = P0[1] - 4.2 - D / 2; }
    var pyr = { x:L.cx, y:Y, w:W, d:D }; L.used.push({ x:pyr.x, y:pyr.y, r:D / 2 + 1 }); for (var px0 = -W / 2; px0 <= W / 2; px0 += 2) L.used.push({ x:pyr.x + px0, y:pyr.y + D / 2, r:1.2 });
    var NT = 5, TH = Math.min(1.15, D / 7.2), TS = (D / 2 - 1.4) / NT;
    var guards = []; for (var i = 0; i < 4; i++){ var g = spot(0.9, function(x, y){ return L.side(x) * 6 - Math.abs(clearAt(x, y) - 2.6) + hash(x | 0, y | 0, seed + 70 + i) * 2; }, function(x, y){ return y < P1[1] - 1 && y > P0[1] - 1; }); if (g) guards.push(g); }
    var braz = []; for (i = 0; i < 4; i++){ var bq = spot(0.5, function(x, y){ return -Math.abs(clearAt(x, y) - 1.6) + hash(x * 3 | 0, y * 3 | 0, seed + 80 + i); }, function(x, y){ return y > pyr.y + D / 2 + 1; }); if (bq) braz.push(bq); }
    var snake = spot(2.4, function(x, y){ return L.side(x) * 4 - Math.abs(clearAt(x, y) - 3.4) * 0.6 + (y - L.cy) * 0.15 + hash(x | 0, y | 0, seed + 90); }, function(x, y){ return y > pyr.y + D / 2 + 2; });
    return {
      h:function(x, y){ var z = (fbm(x * 0.06, y * 0.07, seed) - 0.45) * 0.8 * sm(5, 9, clearAt(x, y)); return z; },
      mat:function(x, y){ var c = clearAt(x, y); if (c > 4.6 + (vn(x * 0.2, y * 0.2, seed + 3) - 0.5) * 2 && y > pyr.y + D / 2 + 0.5 && Math.abs(x - pyr.x) > 2.5) return ['moss']; return ['plaza']; },
      build:function(B){
        (function(){ var X = pyr.x, Yp = pyr.y, zb = B.gz(X, Yp + D / 2) - 0.1, top = NT * TH;
          B.solid(X - W / 2 - 0.1, Yp - D / 2 - 0.1, zb - 0.2, X + W / 2 + 0.1, Yp + D / 2 + 1.6, zb + top + 2.6, function(px, py, pz){ var dx = px - X, dy = py - Yp, ax = Math.abs(dx), t = pz - zb;
            var sf = D / 2 + 1.1, sl = top / (sf - (D / 2 - NT * TS)), st = (sf - dy) * sl;   // the stair: from in front of the base up to the top tier
            if (ax < 1.5 && dy < sf && t < st && t < top + 0.05 && dy > -D / 2 + 1){ if (ax > 1.15) return t > st - 0.4 ? (dy > sf - 0.9 ? (Math.hypot(ax - 1.33, t - st + 0.25) < 0.08 ? '#3fd0a0' : '#4f8a5a') : '#8f8766') : null;   // the balustrade, a serpent's head at its foot
              return (t % 0.32) < 0.08 ? '#7b7354' : '#c2b78c'; }
            var k = Math.floor(t / TH); if (k < NT){ var hw = W / 2 - k * (W / 2 - 2.2) / NT, hd = D / 2 - k * TS; if (ax > hw || Math.abs(dy) > hd) return null;
              if (t % TH > TH - 0.14) return '#c2b78c'; return tmpAshlar(ax > hw - 0.3 ? dy : dx, t, seed + 3, k < 2 ? TMP_STONE : ['#ada37a', '#9e946a', '#6f6a4e', '#56803e']); }
            var tt = t - top; if (ax > 1.8 || Math.abs(dy + 0.2) > 1.5 || tt > 2.4) return null;   // the shrine, its door dark, gold along its roof
            if (dy > 1.0 && ax < 0.55 && tt < 1.4) return '#120e08'; if (tt > 2.05) return ax < 1.5 ? (Math.abs(dy + 0.2) < 0.25 ? '#c9a227' : (Math.floor((dy + 2) * 3) % 2 ? '#b3a97e' : '#a69c72')) : null; if (tt > 1.8) return '#7b7354'; if (dy > 1.15 && ax < 0.75 && tt < 1.55) return '#c9a227';
            return tmpAshlar(dx, tt, seed + 4, TMP_STONE); }, B.ART * 0.7); })();
        guards.forEach(function(p, k){ var X = p.x, Y2 = p.y, zb = B.gz(X, Y2);   // a guardian on his plinth: a robed figure, a tall headdress, jade eyes
          B.solid(X - 0.7, Y2 - 0.7, zb - 0.05, X + 0.7, Y2 + 0.7, zb + 3.6, function(px, py, pz){ var dx = px - X, dy = py - Y2, ax = Math.abs(dx), t = pz - zb;
            if (t < 0.6) return Math.max(ax, Math.abs(dy)) < 0.62 ? (t > 0.5 ? '#c2b78c' : '#8f8766') : null; if (Math.abs(dy) > 0.42) return null; var u = t - 0.6;
            if (u < 1.7){ if (ax > 0.42 - u * 0.04) return null; if (dy > 0.3 && ax < 0.08 && u > 0.2) return '#7b7354'; if (Math.abs(u - 1.2) < 0.09) return '#c9a227'; return Math.floor(u * 3) % 2 ? '#a69c72' : '#978d64'; }
            if (u < 2.3){ if (ax > 0.3) return null; if (dy > 0.3 && Math.abs(u - 2.02) < 0.06 && Math.abs(ax - 0.13) < 0.06) return '#3fd0a0'; return '#b3a97e'; }
            if (ax > 0.42 - (u - 2.3) * 0.25 || u > 2.95) return null; return Math.floor(u * 6) % 2 ? '#c9a227' : '#2fb58f'; }); });
        braz.forEach(function(p){ tmpBrazier(B, p.x, p.y); });
        if (snake){ var X = snake.x, Y3 = snake.y, zb = B.gz(X, Y3), dir = X < L.cx ? 1 : -1;   // the stone serpent: an S along the ground, its head reared up
          B.solid(X - 2.6, Y3 - 1.2, zb - 0.1, X + 2.6, Y3 + 1.2, zb + 1.5, function(px, py, pz){ var dx = (px - X) * dir, dy = py - Y3, t = pz - zb, cy = Math.sin(dx * 1.3) * 0.6, r = 0.26 - Math.max(0, -dx - 1.4) * 0.12;
            if (dx < 1.9 && dx > -2.4 && Math.hypot(dy - cy, t - r) < r) return (Math.floor((dx + 3) * 4) % 2) ? '#4f8a5a' : '#a69c72';
            var hx = dx - 2.1, ht = t - 0.9; if (Math.hypot(hx * 0.9, dy - cy * 0, ht) < 0.36 || (hx < 0 && hx > -0.3 && Math.abs(dy) < 0.26 && t < 0.9)) return Math.abs(dy) > 0.12 && Math.abs(dy) < 0.24 && Math.abs(ht - 0.08) < 0.07 && hx > 0 ? '#3fd0a0' : '#8a9a6a';
            return null; }); }
      },
      fill:{ on:['moss'], trees:0.5, lows:0.3, tree:function(B, x, y, i){ tmpTree(B, x, y, 4.4 + hash(i, seed, 31) * 1.8, i * 9 + seed); }, low:function(B, x, y, i){ tmpLow(B, x, y, i, seed); } },
      bg:'#2c4a24', gain:2,
      mats:{ moss:['#3b6a2e', '#4a7a32', '#30582a', 0.1, tmpGreen(seed)],
        // flagstones two feet square in staggered rows, grass in some of the joints
        plaza:['#a69c72', '#b3a97e', '#7b7354', 0.1, function(c, R){ var row = Math.floor(c.tj / 8), off = row % 2 ? 4 : 0, i = Math.floor((c.ti + off) / 8);
          if (c.tj % 8 === 0 || (c.ti + off) % 8 === 0) return R(blot(c, 0.12, seed + 41) > 0.68 ? '#5a7a3a' : '#8a8260'); var n = vn(i * 0.9, row * 0.9, seed + 42); return R(n > 0.66 ? '#b9ae84' : n < 0.33 ? '#958b63' : '#a69c72'); }] }
    };
  }

  /* 5. THE INNER SANCTUM: inside now. Carved walls with a band of gold all round, a polished floor, a chasm either side of
     the course with gold set along its lip, the golden idol on its altar against the back wall, gold heaped in the
     corners, and the braziers burning. */
  function tmpSanctum(L){
    var E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, cx = L.cx, G = 4.6;
    function wallK(x, y){ var k = sm(G, G + 2, clearAt(x, y)); if (y > P1[1] + 0.5) k *= sm(P1[1] + 4, P1[1] + 0.5, y); return k; }
    function pit(x, y){ if (x > P0[0] - 0.4 && x < P1[0] + 0.4) return -1; var c = clearAt(x, y); return Math.min(c - 1.1, 3.5 - c, y - P0[1] + 0.4, P1[1] - 1.2 - y) + (vn(x * 0.5, y * 0.5, seed + 3) - 0.5) * 0.4; }
    var alt = { x:cx, y:P0[1] - G + 0.9 };
    var piles = [[P0[0] - G + 1.7, P0[1] - G + 1.6], [P1[0] + G - 1.7, P0[1] - G + 1.6]], braz = [[cx - 2.4, alt.y + 0.6], [cx + 2.4, alt.y + 0.6], [P0[0] - G + 0.9, L.cy], [P1[0] + G - 0.9, L.cy]];
    return {
      h:function(x, y){ var k = wallK(x, y); if (k > 0.02) return k * 7; var p = pit(x, y); if (p > 0) return -0.2 - Math.min(3.6, p * 4); return 0; },
      mat:function(x, y){ var k = wallK(x, y); if (k > 0.4) return ['wall', { z:k * 7, u:y < P0[1] - G + 0.6 ? x : y }]; var p = pit(x, y); if (p > 0) return ['pit', { d:p }]; if (p > -0.28) return ['inlay']; return ['polish']; },
      build:function(B){
        (function(){ var X = alt.x, Y = alt.y, zb = B.gz(X, Y + 1.4);   // the altar, three steps up, and the idol sitting on it
          B.solid(X - 2, Y - 1.2, zb - 0.1, X + 2, Y + 1.6, zb + 4.4, function(px, py, pz){ var dx = px - X, dy = py - Y, ax = Math.abs(dx), t = pz - zb;
            var st = Math.floor(t / 0.3); if (st < 3){ if (ax > 1.9 - st * 0.25 || dy > 1.5 - st * 0.3 || dy < -1.1) return null; return (t % 0.3) > 0.24 ? '#c9a227' : '#5e5644'; }
            var u = t - 0.9; if (u > 3.4) return null; var body = Math.hypot(dx / 0.9, dy / 0.65, (u - 0.7) / 0.85), head = Math.hypot(dx / 0.48, dy / 0.45, (u - 2.0) / 0.5);
            if (head < 1){ if (dy > 0.3 && Math.abs(u - 2.08) < 0.08 && Math.abs(ax - 0.18) < 0.08) return '#3fd0a0'; return (u > 2.3 ? '#ffe680' : '#e8b923'); }
            if (u > 2.35 && u < 3.3 && ax < 0.6 - (u - 2.35) * 0.55 && Math.abs(dy) < 0.3) return Math.floor(u * 8) % 2 ? '#ffd23a' : '#c9a227';   // the headdress
            if (body < 1) return Math.abs(u - 0.75) < 0.06 || (dy > 0.5 && Math.abs(ax - 0.45) < 0.1 && u > 0.6) ? '#c9a227' : (dx < -0.2 ? '#d8a820' : '#f0c43a');
            return null; }, B.ART * 0.7); })();
        piles.forEach(function(q, i){ if (clearAt(q[0], q[1]) < 2) return; var X = q[0], Y = q[1], zb = B.gz(X, Y + 1);   // gold heaped on the floor, a chest open on top
          B.solid(X - 1.4, Y - 1.2, zb - 0.1, X + 1.4, Y + 1.2, zb + 1.6, function(px, py, pz){ var d = Math.hypot((px - X) / 1.3, (py - Y) / 1.1, (pz - zb) / 1.1); if (d > 1) return null;
            return vn(px * 4, pz * 4 + py * 3, i + seed) > 0.62 ? '#fff0a0' : vn(px * 2, py * 2, i) > 0.5 ? '#ffd23a' : '#e0a818'; });
          pirProp(B, X + 0.4, Y + 0.6, 3); });
        braz.forEach(function(q){ if (clearAt(q[0], q[1]) > 1.2) tmpBrazier(B, q[0], q[1]); });
      },
      bg:'#6a6248', gain:1.9,
      mats:{
        // the floor polished smooth: big slabs, a fine dark joint
        polish:['#a69c72', '#b3a97e', '#7b7354', 0.1, function(c, R){ var row = Math.floor(c.tj / 8), off = row % 2 ? 4 : 0, i = Math.floor((c.ti + off) / 8);
          if (c.tj % 8 === 0 || (c.ti + off) % 8 === 0) return R('#5e5644'); var n = vn(i * 0.9, row * 0.9, seed + 51), s = blot(c, 0.2, seed + 52); return R(s > 0.72 ? '#cfc49a' : n > 0.6 ? '#b3a97e' : n < 0.35 ? '#958b63' : '#a69c72'); }],
        inlay:['#c9a227', '#e8c23a', '#a8861c', 0.1, function(c, R){ return R(blot(c, 0.5, seed + 53) > 0.6 ? '#ffd23a' : '#c9a227'); }],
        pit:['#14110c', '#1e1a12', '#0a0806', 0.06, function(c, R){ var d = c.d || 0; return R(d < 0.12 ? '#4a4232' : d < 0.3 ? '#2a2418' : d < 0.6 ? '#16120c' : '#0a0806'); }],
        // the walls: dressed stone, a band of carving picked out in gold at head height, a dark cornice
        wall:['#8a8060', '#9a9070', '#5e5644', 0.1, function(c, R){ var z = c.z || 0, u = (c.u || 0); if (z > 6.4) return R('#4a4436');
          if (z > 3.6 && z < 4.5){ if (z < 3.7 || z > 4.4) return R('#c9a227'); var g = ((u * 1.5) % 1 + 1) % 1; return R(Math.abs(g - 0.5) < 0.18 && Math.abs(z - 4.05) < 0.22 ? '#e8c23a' : '#6e664c'); }
          var zf = z * 1.8 - Math.floor(z * 1.8); return R(zf < 0.14 ? '#6a6248' : vn(u * 0.5, Math.floor(z * 1.8), seed + 54) > 0.5 ? '#8a8060' : '#7e7456'); }] }
    };
  }
  /* ---------------- CANYON MINE IS A JOURNEY, as Pirate Cove is. The holes walk you up the canyon to the gold: the desert
     trail under the rim with its buttes and the rail trestle over a dry wash (1 to 4: Canyon Jump, Ore Belt, Dynamite,
     Trestle), the mine's mouth in a knob of rock with its headframe and tailings (5 to 8: Mine Gates, Mine Shaft), the
     mining camp with the stamp mill, tents and water tower (9 to 11: Boulder Field, Stamp Mill, Switchback Steps), the
     river gorge with its rope bridge and mesas (12 to 15: Flash Flood, Mesa Hop), and the mother lode, a gold vein behind
     a blast door beside a ghost town (16 to 18: Blast Door, Runaway Cart, Mother Lode). A hole with no place keeps the
     old canyon. Big things stand behind the course or beside it, never in front, and the rock is terrain (cheap and
     smooth) rather than voxels wherever it can be. */
  STOPS.canyon = [[1, 'trail'], [5, 'mine'], [9, 'camp'], [12, 'gorge'], [16, 'lode']];
  FLY['canyon~trail'] = FLY['canyon~lode'] = 'vulture'; FLY['canyon~mine'] = 'bat'; FLY['canyon~camp'] = 'crow'; FLY['canyon~gorge'] = 'song';
  (function(){ var base = BUILD.canyon; BUILD.canyon = function(L){ var s = L.stop;
    return s === 'trail' ? cnyTrail(L) : s === 'mine' ? cnyMine(L) : s === 'camp' ? cnyCamp(L) : s === 'gorge' ? cnyGorge(L) : s === 'lode' ? cnyLode(L) : base(L); }; })();

  // the canyon's rock in bands: the strata run level, wobbling a little along the face
  var CNY_RED = ['#b4643c', '#c47a4a', '#9a4e30', '#d08e5a', '#a85a38'], CNY_DARK = ['#7a5040', '#8a5e48', '#6a4436', '#9a6e52', '#5e3c30'];
  function cnyBand(z, x, sd, cols){ var w = z * 1.5 + (vn(x * 0.18, z * 0.4, sd) - 0.5) * 1.2; return cols[((Math.floor(w) % 5) + 5) % 5]; }
  function cnyRock(sd, cols, cap){ return [cols[0], cols[1], cols[2], 0.1, function(c, R){ var z = c.z || 0; if (cap && c.top){ var a = blot(c, 0.2, sd + 2); return R(a > 0.66 ? '#a89a5a' : a < 0.3 ? '#b8885a' : cap); } return R(cnyBand(z, c.ti * 0.25, sd, cols)); }]; }
  // open ground in smooth patches: base, light, dark, and a fourth for the odd big patch
  function cnyGround(sd, k){ return [k[0], k[1], k[2], 0.1, function(c, R){ var a = blot(c, 0.07, sd + 3), b = blot(c, 0.2, sd + 4); return R(a > 0.7 ? k[3] : a < 0.28 ? k[2] : b > 0.64 ? k[1] : k[0]); }]; }
  // a rail line seen from above: ballast, sleepers every three quarters of a foot, two steel rails (u across, v along)
  var CNY_RAIL = ['#6a5a4a', '#8a7a6a', '#5a4a3a', 0.1, function(c, R){ var u = Math.abs(c.u || 0), v = c.v || 0;
    if (u > 0.3 && u < 0.46) return R('#a4a4ac'); if ((((v * 1.35) % 1) + 1) % 1 < 0.4 && u < 0.62) return R('#6a4628'); return R(blot(c, 0.4, 5) > 0.55 ? '#7e6e5c' : '#6a5a4a'); }];
  // the north rim: a wall of rock behind the course, its foot wandering
  function cnyRim(L, back, amp, sd){ return function(x){ return L.P0[1] - back - (vn(x * 0.13, 3, L.seed + sd) - 0.5) * amp; }; }
  // buttes and knobs are terrain: a flat topped column with a skirt of scree. Returns [height, is it the top]
  function cnyButte(q, x, y, sd){ var d = Math.hypot((x - q.x) / q.r, (y - q.y) / (q.r * 0.8)) + (vn(x * 0.5, y * 0.5, sd) - 0.5) * 0.18;
    if (d < 0.92) return [q.h + (vn(x * 0.4, y * 0.4, sd + 1) - 0.5) * 0.3, d < 0.8]; if (d < 1) return [q.h * (1 - (d - 0.92) / 0.08 * 0.75), false]; if (d < 1.5) return [q.h * 0.25 * (1.5 - d) / 0.5, false]; return [0, false]; }
  function cnySaguaro(B, x, y, H, k){ var zb = B.gz(x, y), r = 0.18 + H * 0.025, s = hash(k, 3, 1) < 0.5 ? 1 : -1, two = hash(k, 4, 1) < 0.6;
    B.vox(x - 1.1, y - 0.5, zb - 0.05, x + 1.1, y + 0.5, zb + H + 0.4, function(set){ var g = function(t, z){ return z > zb + H - 0.25 ? '#5a9a4a' : '#3f7f3c'; };
      B.tube(set, x, y, zb, x, y, zb + H, r, r * 0.9, g); B.blob(set, x, y, zb + H, r * 0.9, r * 0.9, r * 0.7, '#4f8f44');
      function arm(sx, h0, h1){ var ax = x + sx * 0.7; B.tube(set, x, y, zb + h0, ax, y, zb + h0 + 0.1, r * 0.7, r * 0.7, '#3f7f3c'); B.tube(set, ax, y, zb + h0, ax, y, zb + h1, r * 0.7, r * 0.6, g); B.blob(set, ax, y, zb + h1, r * 0.62, r * 0.62, r * 0.5, '#4f8f44'); }
      arm(s, H * 0.4, H * 0.7); if (two) arm(-s, H * 0.55, H * 0.82);
      if (hash(k, 5, 1) < 0.35) B.blob(set, x, y, zb + H + r * 0.6, r * 0.5, r * 0.5, r * 0.35, '#f2d04a'); }, B.ART); }
  // a juniper: a squat dark crown on a twisted trunk, the canyon's only shade
  function cnyJuniper(B, x, y, H, k){ broadTree(B, x, y, H, '#5a4030', ['#4a6a4a', '#3a5a40', '#5e7e52'], k); }
  // the low things of a desert: sage, a red rock, a barrel cactus
  function cnyLow(B, x, y, i, sd){ var k = hash(i, sd, 23); if (k < 0.4) bush(B, x, y, 0.36, ['#8a9a62', '#76884f', '#a0ac74']); else if (k < 0.75) rockAt(B, x, y, 0.36 + hash(i, sd, 24) * 0.2, ['#b8693e', '#9a5534']);
    else { var zb = B.gz(x, y); B.solid(x - 0.3, y - 0.3, zb - 0.05, x + 0.3, y + 0.3, zb + 0.6, function(px, py, pz){ var d = Math.hypot((px - x) / 0.26, (py - y) / 0.26, (pz - zb - 0.22) / 0.3); if (d > 1) return null; return pz - zb > 0.46 ? '#f2a03a' : (Math.floor(Math.atan2(py - y, px - x) * 2.5 + 9) % 2 ? '#4f8f44' : '#3f7a3a'); }); } }
  // an ore cart on its rails, heaped with ore (gold flecked when gold is set)
  function cnyCart(B, x, y, gold){ var cz = B.gz(x, y);
    B.solid(x - 0.55, y - 0.8, cz, x + 0.55, y + 0.8, cz + 1.15, function(px, py, pz){ var dx = px - x, dy = py - y, t = pz - cz;
      if (t < 0.3) return (Math.abs(Math.abs(dx) - 0.38) < 0.1 && Math.abs(Math.abs(dy) - 0.42) < 0.2) ? '#2a2a2e' : null; if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.72) return null;
      if (t > 0.92){ var hp = 0.92 + 0.22 * (1 - Math.hypot(dx / 0.5, dy / 0.72)); if (t > hp) return null; return vn(px * 6, py * 6, 3) > (gold ? 0.6 : 0.8) ? '#f2c43a' : '#6a5e52'; }
      return Math.abs(t - 0.62) < 0.05 || Math.abs(Math.abs(dy) - 0.68) < 0.04 ? '#3d3a3a' : '#8a5432'; }); }
  // a crate of dynamite: an open crate, red sticks standing in it, and a fuse
  function cnyTNT(B, x, y){ var zb = B.gz(x, y);
    B.solid(x - 0.45, y - 0.4, zb, x + 0.45, y + 0.4, zb + 0.85, function(px, py, pz){ var dx = px - x, dy = py - y, t = pz - zb;
      if (Math.abs(dx) < 0.4 && Math.abs(dy) < 0.34 && t < 0.5) return Math.abs(t - 0.3) < 0.05 && dy > 0.28 ? '#d83a2a' : (Math.abs(dx) > 0.35 || Math.abs(dy) > 0.29 || t < 0.06) ? '#7a5228' : '#a8783e';
      if (t >= 0.5 && t < 0.78 && Math.abs(dx) < 0.32 && Math.abs(dy) < 0.24){ var gx = ((dx + 0.32) / 0.13) % 1, gy = ((dy + 0.24) / 0.12) % 1; return Math.hypot(gx - 0.5, gy - 0.5) < 0.42 ? (t > 0.74 ? '#f4efe2' : '#d83a2a') : null; }
      if (t >= 0.78 && Math.hypot(dx - 0.06, dy) < 0.025) return '#2a2a2e'; return null; }); }
  // a lantern hung on a post, lit
  function cnyLantern(B, x, y){ lamp(B, x, y, '#4a3624', '#ffc860'); }

  /* 1. THE DESERT TRAIL: under the canyon rim, red buttes either side, saguaros, and a rail line along one side that
     crosses a dry wash on a timber trestle, a crate of dynamite left by the line. */
  function cnyTrail(L){
    var E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot;
    var rim = cnyRim(L, 2.8, 2.4, 1), s = hash(seed, 9, 2) < 0.5 ? -1 : 1, railX = s > 0 ? P1[0] + 2.3 : P0[0] - 2.3, rail0 = rim(railX) + 0.6;
    var wy = P0[1] + (P1[1] - P0[1]) * 0.3, edgeX = s > 0 ? P1[0] + 0.9 : P0[0] - 0.9;
    for (var ry = rail0; ry < E[3]; ry += 1.4) L.used.push({ x:railX, y:ry, r:0.9 });
    function washD(x, y){ return s * (x - edgeX) > 0 ? Math.abs(y - wy - Math.sin(x * 0.45 + seed) * 0.5) : 9; }
    var buttes = []; for (var i = 0; i < 2; i++){ var b = spot(2.1, function(x, y){ return L.side(x) * 5 - Math.abs(clearAt(x, y) - 3.6) * 1.2 + (y < P0[1] + 3 ? 1 : 0) + hash(x | 0, y | 0, seed + 20 + i); },
      function(x, y){ return y < (P0[1] + P1[1]) / 2 && washD(x, y) > 3.4 && Math.abs(x - railX) > 3; }); if (b) buttes.push({ x:b.x, y:b.y, r:2.1, h:3.4 + hash(i, seed, 7) * 1.6 }); }
    var tnt = spot(0.5, function(x, y){ return -Math.abs(x - railX - s * -1.1) * 2 - Math.abs(y - wy - 3) * 0.3 + hash(x * 3 | 0, y * 3 | 0, seed + 8); }, function(x, y){ return washD(x, y) > 2.2 && y > rim(x) + 1.2; });
    var cart = { x:railX, y:rail0 + 2.2 }; L.used.push({ x:cart.x, y:cart.y, r:1 });
    var cacti = []; for (i = 0; i < 6; i++){ var c = spot(0.6, function(x, y){ return L.side(x) * 3 - Math.abs(clearAt(x, y) - 2.4) * 0.5 + hash(x * 2 | 0, y * 2 | 0, seed + 30 + i); }, function(x, y){ return washD(x, y) > 1.6 && y > rim(x) + 1.5 && y < P1[1] - 1; }); if (c) cacti.push(c); }
    function rimH(x, y){ var cy = rim(x); return y < cy ? 2.4 + Math.min(4, (cy - y) * 1.2) + (fbm(x * 0.2, y * 0.2, seed + 3) - 0.5) * 0.6 : 0; }
    function onRail(x, y){ return Math.abs(x - railX) < 0.62 && y > rail0 - 0.4; }
    function bH(x, y){ var m = [0, false]; for (var i = 0; i < buttes.length; i++){ var q = cnyButte(buttes[i], x, y, seed + i); if (q[0] > m[0]) m = q; } return m; }
    return {
      h:function(x, y){ var k = sm(0.8, 3, clearAt(x, y)), z = (fbm(x * 0.07, y * 0.07, seed) - 0.45) * 1.2 * sm(1.5, 7, clearAt(x, y)), r = rimH(x, y), b = bH(x, y)[0];
        if (onRail(x, y)) z *= 0.3; var wd = washD(x, y); if (wd < 2) z -= 1.2 * sm(2, 0.6, wd) * sm(0.6, 2, clearAt(x, y)) * (onRail(x, y) ? 1 : 1);
        return Math.max(z, Math.max(r, b) * k); },
      mat:function(x, y){ var cy = rim(x); if (y < cy) return ['rock', { z:rimH(x, y), top:cy - y > 3.4 }]; var b = bH(x, y); if (b[0] > 0.6) return ['rock', { z:b[0], top:b[1] }];
        if (onRail(x, y) && washD(x, y) > 1.9) return ['rail', { u:x - railX, v:y }]; if (washD(x, y) < 1.7) return ['wash', { e:washD(x, y) > 1.3 }]; return ['sand']; },
      build:function(B){
        (function(){ var X = railX, y0 = wy - 2.3, y1 = wy + 2.3, zd = 0.12;   // the trestle: timber bents with cross braces, ties and rails on top
          B.solid(X - 0.7, y0, -1.5, X + 0.7, y1, zd + 0.3, function(px, py, pz){ var dx = px - X, bent = ((((py - y0) / 0.75) % 1) + 1) % 1;
            if (pz > zd - 0.12 && pz < zd + 0.04) return Math.abs(dx) < 0.62 && (((py * 1.35) % 1) + 1) % 1 < 0.45 ? '#6a4628' : Math.abs(dx) < 0.22 ? '#5a3c22' : null;
            if (pz >= zd + 0.04 && pz < zd + 0.16 && Math.abs(Math.abs(dx) - 0.38) < 0.06) return '#a4a4ac';
            if (pz < zd - 0.12 && pz > B.gz(px, py) - 0.1 && (bent < 0.14 || bent > 0.93)){ if (Math.abs(Math.abs(dx) - 0.5 + (zd - pz) * 0.1) < 0.07) return '#7a5230'; if (Math.abs(Math.abs(dx) - Math.abs(((pz * 1.2) % 1 + 1) % 1 - 0.5)) < 0.06 && Math.abs(dx) < 0.5) return '#6a4426'; }
            return null; }); })();
        (function(){ var X = railX, Y = rail0 + 0.6, zb = B.gz(X, Y);   // the buffer stop at the line's end, under the rim
          B.solid(X - 0.6, Y - 0.3, zb, X + 0.6, Y + 0.3, zb + 0.7, function(px, py, pz){ var dx = px - X, t = pz - zb; if (Math.abs(py - Y) > 0.2) return null; if (Math.abs(dx) < 0.55 && t > 0.35 && t < 0.62) return Math.abs(dx) > 0.42 ? '#d83a2a' : '#7a5230'; if (Math.abs(Math.abs(dx) - 0.38) < 0.07 && t < 0.62) return '#5a3c22'; return null; }); })();
        cnyCart(B, cart.x, cart.y, false);
        if (tnt) cnyTNT(B, tnt.x, tnt.y);
        cacti.forEach(function(c, i){ cnySaguaro(B, c.x, c.y, 1.6 + hash(i, seed, 9) * 1.2, i + seed); });
      },
      fill:{ on:['sand'], trees:0.2, lows:0.3, tree:function(B, x, y, i){ cnySaguaro(B, x, y, 1.5 + hash(i, seed, 41) * 1.2, i + 50); }, low:function(B, x, y, i){ cnyLow(B, x, y, i, seed); } },
      bg:'#c8865a', gain:1.7,
      mats:{ rock:cnyRock(seed, CNY_RED, '#c89a62'), rail:CNY_RAIL, sand:cnyGround(seed, ['#cc8a58', '#d89a68', '#bc7c4e', '#c69866']),
        wash:['#dcc092', '#e8d0a4', '#c4a070', 0.1, function(c, R){ if (c.e) return R('#a86a44'); var a = blot(c, 0.35, seed + 6); return R(a > 0.66 ? '#c8ae86' : a < 0.3 ? '#e8d4ae' : '#dcc092'); }] }
    };
  }

  /* 2. THE MINE'S MOUTH: a knob of rock beside the course with the timber portal in its face and lanterns at the door,
     the rails coming out of it with a cart of ore, the headframe over the shaft on the other side, and grey tailings. */
  function cnyMine(L){
    var E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot;
    var rim = cnyRim(L, 2.6, 2, 2), s = hash(seed, 9, 3) < 0.5 ? -1 : 1, edge = s > 0 ? P1[0] : P0[0], span = P1[1] - P0[1];
    var knob = { x:edge + s * 5, y:P0[1] + Math.min(span * 0.3, 5), r:3.2, h:3.8 }, door = { x:edge + s * 4.3, y:knob.y + knob.r * 0.8 * 0.92 };
    L.used.push({ x:knob.x, y:knob.y, r:knob.r + 0.4 }); L.used.push({ x:door.x, y:door.y + 0.6, r:1.3 });
    var railX = door.x, rail0 = door.y + 0.2; for (var ry = rail0; ry < E[3]; ry += 1.4) L.used.push({ x:railX, y:ry, r:0.9 });
    var cart = { x:railX, y:rail0 + 2.2 + hash(seed, 4, 4) * 2 }; L.used.push({ x:cart.x, y:cart.y, r:1 });
    var head = spot(1.3, function(x, y){ return -L.side(x) * 0 + (s * (x - L.cx) < 0 ? 4 : 0) - Math.abs(clearAt(x, y) - 2.8) * 1.2 - Math.abs(y - P0[1] - span * 0.25) * 0.15 + hash(x | 0, y | 0, seed + 5); }, function(x, y){ return y < P1[1] - 2; });
    var heaps = []; for (var i = 0; i < 3; i++){ var hp = spot(1.2, function(x, y){ return (s * (x - L.cx) < 0 ? 3 : 0) - Math.abs(clearAt(x, y) - 3) * 0.6 + hash(x | 0, y | 0, seed + 60 + i); }, function(x, y){ return y < P1[1] + 1 && (!head || Math.hypot(x - head.x, y - head.y) > 2.6); }); if (hp) heaps.push({ x:hp.x, y:hp.y, r:1.4 + hash(i, seed, 2) * 0.4, h:0.7 + hash(i, seed, 3) * 0.4 }); }
    var lamps = []; for (i = 0; i < 3; i++){ var lp = spot(0.35, function(x, y){ return -Math.abs(clearAt(x, y) - 1.5) - Math.abs(y - (P0[1] + span * (0.2 + i * 0.3))) * 0.4 + hash(x * 3 | 0, y * 3 | 0, seed + 40 + i); }); if (lp) lamps.push(lp); }
    function rimH(x, y){ var cy = rim(x); return y < cy ? 2.6 + Math.min(4.5, (cy - y) * 1.3) + (fbm(x * 0.2, y * 0.2, seed + 3) - 0.5) * 0.6 : 0; }
    function onRail(x, y){ return Math.abs(x - railX) < 0.62 && y > rail0 - 0.2; }
    function heapH(x, y){ var m = 0; heaps.forEach(function(q){ var d = Math.hypot(x - q.x, (y - q.y) * 1.2) / q.r; if (d < 1) m = Math.max(m, q.h * (1 - d * d) * (0.9 + vn(x * 2, y * 2, 4) * 0.2)); }); return m; }
    return {
      h:function(x, y){ var k = sm(0.8, 3, clearAt(x, y)), z = (fbm(x * 0.07, y * 0.07, seed) - 0.45) * 1.0 * sm(1.5, 7, clearAt(x, y)), b = cnyButte(knob, x, y, seed)[0];
        if (onRail(x, y)) z *= 0.3; return Math.max(z, Math.max(rimH(x, y), b, heapH(x, y)) * k); },
      mat:function(x, y){ if (y < rim(x)) return ['rock', { z:rimH(x, y), top:rim(x) - y > 3.5 }]; var b = cnyButte(knob, x, y, seed); if (b[0] > 0.5) return ['rock', { z:b[0], top:b[1] }];
        if (heapH(x, y) > 0.06) return ['tail']; if (onRail(x, y)) return ['rail', { u:x - railX, v:y }]; return ['yard']; },
      build:function(B){
        (function(){ var X = door.x, Y = door.y, zb = B.gz(X, Y + 0.4);   // the portal: two posts, a cap, a dark way in, a sign board, and the lanterns either side
          B.solid(X - 1.5, Y - 1.2, zb - 0.1, X + 1.5, Y + 0.45, zb + 2.9, function(px, py, pz){ var dx = Math.abs(px - X), t = pz - zb, dy = py - Y;
            if (dy > 0.3) return null; if (dx < 0.9 && t < 2.05) return dy > 0.12 ? (t < 0.1 ? '#5a4a3a' : null) : '#140e0a';
            if (dx < 1.3 && t >= 2.05 && t < 2.45 && dy > -0.35) return Math.abs(t - 2.25) < 0.03 ? '#5a3c22' : '#8a5a30';
            if (dx >= 0.9 && dx < 1.25 && t < 2.05 && dy > -0.3) return (Math.floor(t * 3) % 2) ? '#7a4a24' : '#6e4220';
            if (dx < 0.75 && t >= 2.45 && t < 2.85 && Math.abs(dy - 0.05) < 0.08) return Math.abs(t - 2.65) < 0.05 && dx < 0.5 ? '#3a2a1c' : '#e2c48a';
            if (dx < 1.5 && t < 2.6 && dy < -0.3) return '#8a5e48'; return null; });
          lamp(B, X - s * 1.55, Y + 0.5, '#4a3624', '#ffc860'); lamp(B, X + s * 1.55, Y + 0.5, '#4a3624', '#ffc860'); })();
        cnyCart(B, cart.x, cart.y, false);
        if (head){ var X = head.x, Y = head.y, zb = B.gz(X, Y), Hh = 4.6;   // the headframe: four legs leaning in, braced, the wheel on top
          B.vox(X - 1.4, Y - 1.4, zb - 0.1, X + 1.4, Y + 1.4, zb + Hh + 1.2, function(set){
            for (var a = 0; a < 4; a++){ var lx = X + (a & 1 ? 1 : -1) * 1.0, ly = Y + (a & 2 ? 1 : -1) * 0.8; B.tube(set, lx, ly, zb, X + (lx - X) * 0.3, Y + (ly - Y) * 0.3, zb + Hh, 0.1, 0.08, '#6a4426'); }
            for (var h2 = 1.2; h2 < Hh; h2 += 1.3){ var f = 1 - h2 / Hh * 0.7; B.tube(set, X - f, Y + 0.8 * f, zb + h2, X + f, Y + 0.8 * f, zb + h2, 0.06, 0.06, '#7a5230'); B.tube(set, X - f, Y - 0.8 * f, zb + h2, X + f, Y - 0.8 * f, zb + h2, 0.06, 0.06, '#7a5230'); }
            B.tube(set, X - 1, Y + 0.8, zb, X + 0.75, Y + 0.6, zb + 2.4, 0.05, 0.05, '#5a3c22'); B.tube(set, X + 1, Y + 0.8, zb, X - 0.75, Y + 0.6, zb + 2.4, 0.05, 0.05, '#5a3c22');
            for (var an = 0; an < 6.28; an += set.st * 1.4){ set(X + Math.cos(an) * 0.7, Y, zb + Hh + 0.55 + Math.sin(an) * 0.7, '#3a3a40'); set(X + Math.cos(an) * 0.62, Y, zb + Hh + 0.55 + Math.sin(an) * 0.62, '#4a4a52'); }
            for (var sp = 0; sp < 3; sp++){ var sa = sp * 1.047; B.tube(set, X - Math.cos(sa) * 0.65, Y, zb + Hh + 0.55 - Math.sin(sa) * 0.65, X + Math.cos(sa) * 0.65, Y, zb + Hh + 0.55 + Math.sin(sa) * 0.65, 0.035, 0.035, '#4a4a52'); }
            B.tube(set, X, Y, zb + Hh + 0.55, X, Y, zb + 0.3, 0.03, 0.03, '#2a2a2e');
            B.blob(set, X, Y, zb + 0.15, 0.7, 0.6, 0.18, '#3a2a1c'); }, B.ART); }
        lamps.forEach(function(p){ cnyLantern(B, p.x, p.y); });
      },
      fill:{ on:['yard'], trees:0.1, lows:0.28, tree:function(B, x, y, i){ cnyJuniper(B, x, y, 1.8 + hash(i, seed, 41) * 0.6, i + seed); },
        low:function(B, x, y, i){ var k = hash(i, seed, 43); if (k < 0.55) rockAt(B, x, y, 0.32 + hash(i, seed, 44) * 0.2, ['#8a7a6c', '#6e6258']); else if (k < 0.8) cnyLow(B, x, y, i, seed); else pirProp(B, x, y, 1); } },
      bg:'#9a6a4a', gain:1.7,
      mats:{ rock:cnyRock(seed + 1, CNY_DARK, '#9a8a5a'), rail:CNY_RAIL, tail:cnyGround(seed + 7, ['#9a9488', '#aaa498', '#86807a', '#b0a27a']),
        yard:cnyGround(seed, ['#a8704a', '#b47e56', '#94603e', '#8a8070']) }
    };
  }

  /* 3. THE MINING CAMP: the stamp mill stepped down the hill behind the course with its stack, the water tower, the
     miners' canvas tents with a fire and lanterns between them, and boulders the size of a cart. */
  function cnyCamp(L){
    var E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot, spotRect = L.spotRect, span = P1[1] - P0[1];
    var rim = cnyRim(L, 3.4, 1.6, 3), s = hash(seed, 9, 4) < 0.5 ? -1 : 1;
    var mill = spotRect(3.8, 2.8, function(x, y){ return (s * (x - L.cx) > 0 ? 3 : 0) - Math.abs(clearAt(x, y) - 3.2) * 1.0 - Math.max(0, y - P0[1] - span * 0.3) * 0.3 + hash(x | 0, y | 0, seed + 3); });
    var tank = spot(1.1, function(x, y){ return (s * (x - L.cx) < 0 ? 3 : 0) - Math.abs(clearAt(x, y) - 2.6) * 1.0 - Math.abs(y - P0[1] - span * 0.2) * 0.2 + hash(x | 0, y | 0, seed + 4); }, function(x, y){ return y < P1[1] - 3; });
    var tents = []; for (var i = 0; i < 3; i++){ var tq = spot(1.2, function(x, y){ return L.side(x) * 3 - Math.abs(clearAt(x, y) - 2.2) * 0.8 - Math.abs(y - (P0[1] + span * (0.4 + i * 0.22))) * 0.3 + hash(x | 0, y | 0, seed + 10 + i); }, function(x, y){ return y < P1[1]; }); if (tq) tents.push(tq); }
    var fire = spot(0.7, function(x, y){ return L.side(x) * 2 - Math.abs(clearAt(x, y) - 1.8) - (tents[0] ? Math.abs(Math.hypot(x - tents[0].x, y - tents[0].y) - 2) : 0) + hash(x * 3 | 0, y * 3 | 0, seed + 12); });
    var lamps = []; for (i = 0; i < 2; i++){ var lp = spot(0.35, function(x, y){ return -Math.abs(clearAt(x, y) - 1.4) - Math.abs(y - (P0[1] + span * (0.3 + i * 0.4))) * 0.3 + hash(x * 3 | 0, y * 3 | 0, seed + 40 + i); }); if (lp) lamps.push(lp); }
    var rocks = []; for (i = 0; i < 5; i++){ var rq = spot(0.8, function(x, y){ return -Math.abs(clearAt(x, y) - 2) * 0.6 + hash(x * 2 | 0, y * 2 | 0, seed + 50 + i) * 2; }); if (rq) rocks.push(rq); }
    function rimH(x, y){ var cy = rim(x); return y < cy ? 1.2 + Math.min(4, (cy - y) * 0.8) + (fbm(x * 0.2, y * 0.2, seed + 3) - 0.5) * 0.5 : 0; }
    function road(x, y){ return Math.abs(y - rim(x) - 0.9 - Math.sin(x * 0.3 + seed) * 0.4); }   // the wagon road under the hill
    return {
      h:function(x, y){ var k = sm(0.8, 3, clearAt(x, y)), z = (fbm(x * 0.07, y * 0.07, seed) - 0.45) * 1.0 * sm(1.5, 7, clearAt(x, y)); return Math.max(z, rimH(x, y) * k); },
      mat:function(x, y){ if (y < rim(x)) return ['rock', { z:rimH(x, y), top:rim(x) - y > 4.9 }]; if (road(x, y) < 0.5) return ['road', { v:x }]; return ['camp']; },
      build:function(B){
        if (mill){ var mx = mill.x, my = mill.y, roofC = function(dx, dy, t, rr, eave){ return eave ? '#4a4040' : (Math.floor((dx + 9) * 3) % 2 ? '#8a8a90' : (vn(dx * 2, t * 2, 3) > 0.62 ? '#a8603a' : '#7a7a82')); },
            wallC = function(dx, dy, t, w, d){ if (dy > d / 2 - 0.12 && Math.abs(dx) < w * 0.32 && t > 0.2 && t < 1.5) return (((dx + 9) * 5 | 0) % 2) && t > 0.35 ? '#9a9aa2' : '#1a120c'; return (Math.floor((dx + 9) * 4) % 2) ? '#8a6440' : '#7a5636'; };
          house(B, { x:mx, y:my - 0.6, w:3.2, d:1.6 }, { wh:2.4, rh:0.9, wall:wallC, roof:roofC });   // the upper floor, up the slope
          house(B, { x:mx, y:my + 0.6, w:3.6, d:1.4 }, { wh:1.6, rh:0.7, wall:wallC, roof:roofC });   // the stamps, down it, their bay open to the camp
          var sx = mx + 1.2, sy = my - 0.9, sz = B.gz(sx, sy); B.solid(sx - 0.25, sy - 0.25, sz, sx + 0.25, sy + 0.25, sz + 5, function(px, py, pz){ var r = Math.hypot(px - sx, py - sy); return r < 0.2 ? (pz - sz > 4.7 ? '#2a2a2e' : '#5a5a62') : null; }); }
        if (tank){ var X = tank.x, Y = tank.y, zb = B.gz(X, Y), L0 = 2.2, R = 0.85;   // the water tower: legs, braces, a staved tank and its hat
          B.vox(X - 1, Y - 1, zb - 0.1, X + 1, Y + 1, zb + L0 + 0.2, function(set){ for (var a = 0; a < 4; a++){ var lx = X + (a & 1 ? 0.75 : -0.75), ly = Y + (a & 2 ? 0.65 : -0.65); B.tube(set, lx, ly, zb, X + (lx - X) * 0.8, Y + (ly - Y) * 0.8, zb + L0, 0.07, 0.06, '#5a3c22'); }
            B.tube(set, X - 0.7, Y + 0.6, zb + 0.2, X + 0.65, Y + 0.55, zb + L0 - 0.2, 0.04, 0.04, '#6a4628'); B.tube(set, X + 0.7, Y + 0.6, zb + 0.2, X - 0.65, Y + 0.55, zb + L0 - 0.2, 0.04, 0.04, '#6a4628'); }, B.ART);
          B.solid(X - R - 0.15, Y - R - 0.15, zb + L0, X + R + 0.15, Y + R + 0.15, zb + L0 + 2.1, function(px, py, pz){ var r = Math.hypot(px - X, py - Y), t = pz - zb - L0;
            if (t < 1.4){ if (r > R) return null; return (Math.abs(t - 0.3) < 0.05 || Math.abs(t - 1.05) < 0.05) ? '#3a3a40' : (Math.floor((Math.atan2(py - Y, px - X) + 4) * 6) % 2 ? '#9a6a3e' : '#8a5c34'); }
            return r < (R + 0.12) * (1 - (t - 1.4) / 0.65) ? '#6a6a72' : null; }); }
        tents.forEach(function(p, n){ var X = p.x, Y = p.y, zb = B.gz(X, Y), w = 0.8, d = 1.1, h = 1.2;   // a canvas tent, its door flap open to the camp
          B.solid(X - w - 0.1, Y - d - 0.15, zb - 0.05, X + w + 0.1, Y + d + 0.15, zb + h + 0.25, function(px, py, pz){ var dx = px - X, dy = py - Y, t = pz - zb;
            if (Math.abs(dy) > d) return Math.abs(dx) < 0.05 && Math.abs(dy) < d + 0.1 && t < h + 0.15 ? '#5a3c22' : null; var roof = h * (1 - Math.abs(dx) / w); if (t > roof) return null;
            if (dy > d - 0.1 && Math.abs(dx) < (roof - t) * 0.35 + 0.02 && t < h * 0.8) return '#3a2a1c'; return Math.abs(dx) < 0.05 ? '#cfc2a0' : (n % 2 ? '#efe6cf' : '#e6dcc0'); }); });
        if (fire){ var fx = fire.x, fy = fire.y, fz = B.gz(fx, fy); if (B.light) B.light(fx, fy, fz + 0.4, '#ff8a2a');
          B.solid(fx - 0.45, fy - 0.45, fz - 0.05, fx + 0.45, fy + 0.45, fz + 0.75, function(px, py, pz){ var r = Math.hypot(px - fx, py - fy), t = pz - fz;
            if (t < 0.16 && r > 0.3 && r < 0.42) return '#7a7068'; if (t < 0.12 && r < 0.32) return Math.abs(Math.sin((px - fx) * 9)) < 0.3 ? '#3a2412' : '#5a3818';
            if (t >= 0.1 && r < 0.26 * (1 - t / 0.7)) return t < 0.25 ? '#ffd23a' : t < 0.45 ? '#ff8a1a' : '#e5483a'; return null; }); }
        lamps.forEach(function(p){ cnyLantern(B, p.x, p.y); });
        rocks.forEach(function(p, i){ rockAt(B, p.x, p.y, 0.5 + hash(i, seed, 51) * 0.25, ['#c27a4a', '#a8643c']); });
      },
      fill:{ on:['camp'], trees:0.22, lows:0.26, tree:function(B, x, y, i){ if (hash(i, seed, 40) < 0.5) cnyJuniper(B, x, y, 1.9 + hash(i, seed, 41) * 0.7, i + seed); else cnySaguaro(B, x, y, 1.6 + hash(i, seed, 42), i + 70); },
        low:function(B, x, y, i){ var k = hash(i, seed, 43); if (k < 0.2) pirProp(B, x, y, 0); else if (k < 0.3) pirProp(B, x, y, 1); else if (k < 0.55) rockAt(B, x, y, 0.42 + hash(i, seed, 44) * 0.2, ['#c27a4a', '#a8643c']); else cnyLow(B, x, y, i, seed); } },
      bg:'#c0865a', gain:1.7,
      mats:{ rock:cnyRock(seed + 2, CNY_RED, '#a8a060'), camp:cnyGround(seed, ['#c49a6a', '#d0a87a', '#b08a5c', '#a88a62']),
        road:['#b89068', '#c8a078', '#a07a54', 0.1, function(c, R){ var a = blot(c, 0.3, seed + 9); return R(a > 0.6 ? '#a88560' : '#b89068'); }] }
    };
  }

  /* 4. THE RIVER GORGE: the river comes down one side of the course and turns across the top of it, under red walls on
     its far bank. A rope bridge crosses it. Cottonwoods stand by the water, flood wrack lies where it left it, and
     mesas stand on the dry side. */
  function cnyGorge(L){
    var E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot, span = P1[1] - P0[1];
    var s = hash(seed, 9, 5) < 0.5 ? -1 : 1, edge = s > 0 ? P1[0] : P0[0], rx = edge + s * 2.7, ry = P0[1] - 2.6, rw = 1.25;
    var far0 = s > 0 ? E[0] - 2 : E[2] + 2, riv = [[rx, E[3] + 2], [rx, ry + 2.5], [rx - s * 1.2, ry + 0.4], [rx - s * 4, ry], [far0, ry - 0.6]];
    var dR = L.dist(riv); function wob(x, y){ return (vn(x * 0.3, y * 0.3, seed + 6) - 0.5) * 0.5; }
    function farD(x, y){ var a = s * (x - rx), b = ry - y; return (a > 0 && y > ry - 1) ? a : b > 0 ? (a > 0 ? Math.max(a, b) : b) : -1; }   // how far over the river a point is, or -1 on the course side
    function water(x, y){ return rw + wob(x, y) - dR(x, y); }
    var by = P0[1] + Math.min(span * 0.4, 6); L.used.push({ x:rx, y:by, r:2 });
    var buttes = []; for (var i = 0; i < 2; i++){ var b = spot(1.9, function(x, y){ return (s * (x - L.cx) < 0 ? 5 : 0) - Math.abs(clearAt(x, y) - 3.4) * 1.2 + (y < P0[1] + span * 0.4 ? 1 : 0) + hash(x | 0, y | 0, seed + 20 + i); }, function(x, y){ return farD(x, y) < 0 && water(x, y) < -2.5 && y < P1[1] - 1; });
      if (b) buttes.push({ x:b.x, y:b.y, r:1.9, h:3 + hash(i, seed, 7) * 1.4 }); }
    var logs = []; for (i = 0; i < 3; i++){ var lq = spot(0.7, function(x, y){ return -Math.abs(water(x, y) + 1) * 1.5 + hash(x * 2 | 0, y * 2 | 0, seed + 30 + i) * 2; }, function(x, y){ return farD(x, y) < 0 && water(x, y) < -0.6; }); if (lq) logs.push(lq); }
    var cart = spot(0.8, function(x, y){ return -Math.abs(water(x, y) + 1.4) * 1.2 + hash(x | 0, y | 0, seed + 33); }, function(x, y){ return farD(x, y) < 0 && water(x, y) < -1; });
    function wallH(x, y){ var f = farD(x, y); if (f < 0) return 0; var w = water(x, y); return w > -0.2 ? 0 : Math.min(5.5, 0.6 + (-w - 0.2) * 1.8) + (fbm(x * 0.2, y * 0.2, seed + 3) - 0.5) * 0.6; }
    function bH(x, y){ var m = [0, false]; for (var i = 0; i < buttes.length; i++){ var q = cnyButte(buttes[i], x, y, seed + i); if (q[0] > m[0]) m = q; } return m; }
    return {
      h:function(x, y){ var w = water(x, y); if (w > 0) return -0.5 - Math.min(0.3, w * 0.2); var k = sm(0.8, 3, clearAt(x, y)), z = (fbm(x * 0.07, y * 0.07, seed) - 0.45) * 0.9 * sm(1.5, 7, clearAt(x, y));
        z = Math.min(z, -0.5 * sm(-0.9, 0, w)); return Math.max(z, Math.max(wallH(x, y), bH(x, y)[0]) * k); },
      mat:function(x, y){ var w = water(x, y); if (w > 0) return w < 0.18 ? ['foam'] : ['sea', { dep:w }]; var wh = wallH(x, y); if (wh > 0.4) return ['rock', { z:wh }];
        var b = bH(x, y); if (b[0] > 0.6) return ['rock', { z:b[0], top:b[1] }]; if (w > -0.7) return ['gravel']; if (w > -2.4 && farD(x, y) < 0) return ['bank']; return ['sand']; },
      build:function(B){
        (function(){ var x0 = rx - s * 2.1, x1 = rx + s * 2.1, xa = Math.min(x0, x1), xb = Math.max(x0, x1), za = B.gz(x0, by), zb = Math.max(B.gz(x1, by), -0.2), zm = Math.min(za, zb);   // the rope bridge: planks hung on two ropes, a post at each end
          B.solid(xa - 0.2, by - 0.7, zm - 0.6, xb + 0.2, by + 0.7, Math.max(za, zb) + 1.4, function(px, py, pz){ var u = (px - x0) / (x1 - x0), dk = za + (zb - za) * u - Math.sin(u * 3.14) * 0.35 + 0.1, dy = py - by;
            if (u < -0.04 || u > 1.04) return null; if ((u < 0.03 || u > 0.97) && Math.abs(Math.abs(dy) - 0.5) < 0.09) return pz < dk + 1.1 && pz > dk - 0.6 ? '#5a3c22' : null;
            if (Math.abs(pz - dk) < 0.06 && Math.abs(dy) < 0.48) return ((u * 26 | 0) % 2) ? '#9a6a3e' : '#7a5230';
            if (Math.abs(Math.abs(dy) - 0.5) < 0.04 && Math.abs(pz - dk - 0.8 + Math.sin(u * 3.14) * 0.1) < 0.04) return '#cdb48a'; return null; }); })();
        logs.forEach(function(p, i){ var zb = B.gz(p.x, p.y), a = hash(i, seed, 3) * 3.14, ca = Math.cos(a), sa = Math.sin(a) * 0.6;   // flood wrack: a bleached log
          B.vox(p.x - 1, p.y - 0.7, zb - 0.1, p.x + 1, p.y + 0.7, zb + 0.5, function(set){ B.tube(set, p.x - ca * 0.85, p.y - sa * 0.85, zb + 0.14, p.x + ca * 0.85, p.y + sa * 0.85, zb + 0.16, 0.16, 0.12, function(t){ return t < 0.06 || t > 0.94 ? '#a89a82' : '#c8baa0'; }); }, B.ART); });
        if (cart) cnyCart(B, cart.x, cart.y, false);
      },
      fill:{ on:['bank', 'sand'], trees:0.42, lows:0.3, tree:function(B, x, y, i){ if (y < P0[1] || Math.abs(x - rx) < 5) broadTree(B, x, y, 2.6 + hash(i, seed, 41) * 0.8, '#6a5440', ['#8aa848', '#a4bc58', '#6e9038'], i + seed); else cnySaguaro(B, x, y, 1.5 + hash(i, seed, 42), i + 80); },
        low:function(B, x, y, i){ var k = hash(i, seed, 43); if (k < 0.4) bush(B, x, y, 0.36, ['#6e9040', '#8aa848', '#5a7a34']); else if (k < 0.7) rockAt(B, x, y, 0.36, ['#b8693e', '#9a5534']); else cnyLow(B, x, y, i, seed); } },
      bg:'#b87a50', gain:2.0,
      mats:{ rock:cnyRock(seed + 3, CNY_RED, '#b0a868'), foam:['#e8f2ec', '#ffffff', '#d0e4dc', 0.2, function(c, R){ return R(blot(c, 0.5, seed) > 0.5 ? '#ffffff' : '#e0ece6'); }],
        sea:['#3f8f8a', '#6fbab0', '#2f6e6c', 0.05, function(c, R){ var d = c.dep || 0; return R(d < 0.35 ? '#7ac4b4' : d < 0.8 ? '#3f8f8a' : '#2f6e6c'); }],
        gravel:cnyGround(seed + 4, ['#b8a688', '#c8b898', '#a09070', '#d0c0a0']), bank:cnyGround(seed + 5, ['#a89a5a', '#b4a868', '#948a4c', '#c09060']),
        sand:cnyGround(seed, ['#c8885a', '#d49868', '#b87a4e', '#c09468']) }
    };
  }

  /* 5. THE MOTHER LODE: a dark knob of rock beside the course, gold running through it in veins that catch the light,
     the riveted blast door in its face; on the other side what is left of the town that came for it, false fronts
     grey with age, and a runaway cart off its rails, gold spilled. */
  function cnyLode(L){
    var E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot, spotRect = L.spotRect, span = P1[1] - P0[1];
    var rim = cnyRim(L, 2.6, 2, 5), s = hash(seed, 9, 6) < 0.5 ? -1 : 1, edge = s > 0 ? P1[0] : P0[0];
    var knob = { x:edge + s * 5.2, y:P0[1] + Math.min(span * 0.32, 5.5), r:3.4, h:4.2 }, door = { x:edge + s * 4.2, y:knob.y + knob.r * 0.8 * 0.9 };
    L.used.push({ x:knob.x, y:knob.y, r:knob.r + 0.4 }); L.used.push({ x:door.x, y:door.y + 0.5, r:1.2 });
    var fronts = []; for (var i = 0; i < 2; i++){ var fr = spotRect(3.2, 2.6, function(x, y){ return (s * (x - L.cx) < 0 ? 4 : 0) - Math.abs(clearAt(x, y) - 2.6) * 1.2 - Math.abs(y - (P0[1] + span * (0.15 + i * 0.4))) * 0.3 + hash(x | 0, y | 0, seed + 10 + i); }); if (fr) fronts.push(fr); }
    var cart = spot(0.9, function(x, y){ return (s * (x - L.cx) > 0 ? 2 : 0) - Math.abs(clearAt(x, y) - 1.8) - Math.abs(y - door.y - 3) * 0.3 + hash(x | 0, y | 0, seed + 33); }, function(x, y){ return y > door.y + 1.5; });
    var glints = []; for (i = 0; i < 4; i++){ var ga = hash(i, seed, 61) * 2.4 - 1.2; glints.push([knob.x + Math.sin(ga) * knob.r * 0.9 * (s > 0 ? -1 : 1) * 0.5 - s * 0.6, knob.y + Math.cos(ga) * knob.r * 0.72, 0.6 + hash(i, seed, 62) * 2.6]); }
    function rimH(x, y){ var cy = rim(x); return y < cy ? 2.6 + Math.min(4.5, (cy - y) * 1.3) + (fbm(x * 0.2, y * 0.2, seed + 3) - 0.5) * 0.6 : 0; }
    function trail(x, y){ return Math.abs(x - door.x - Math.sin(y * 0.4) * 0.3); }
    return {
      h:function(x, y){ var k = sm(0.8, 3, clearAt(x, y)), z = (fbm(x * 0.07, y * 0.07, seed) - 0.45) * 1.0 * sm(1.5, 7, clearAt(x, y)); return Math.max(z, Math.max(rimH(x, y), cnyButte(knob, x, y, seed)[0]) * k); },
      mat:function(x, y){ if (y < rim(x)) return ['lode', { z:rimH(x, y), u:x, top:rim(x) - y > 3.5 }]; var b = cnyButte(knob, x, y, seed); if (b[0] > 0.5) return ['lode', { z:b[0], u:x, top:b[1] }];
        if (y > door.y && trail(x, y) < 0.55) return ['track']; return ['dust']; },
      build:function(B){
        (function(){ var X = door.x, Y = door.y, zb = B.gz(X, Y + 0.3);   // the blast door: a round steel door, riveted, its wheel, in a collar of poured stone
          B.solid(X - 1.3, Y - 1, zb - 0.1, X + 1.3, Y + 0.4, zb + 2.4, function(px, py, pz){ var dx = px - X, t = pz - zb - 1.05, dy = py - Y, r = Math.hypot(dx, t);
            if (dy > 0.25 || r > 1.2) return null; if (r > 0.98) return dy < 0.05 ? (Math.floor(Math.atan2(t, dx) * 3 + 9) % 2 ? '#8a8680' : '#9a968e') : null;
            if (dy > 0.18){ if (r < 0.32 && (Math.abs(r - 0.28) < 0.04 || Math.abs(dx) < 0.03 || Math.abs(t) < 0.03)) return '#c9a227'; return null; }
            if (dy > 0.1){ if (Math.abs(r - 0.86) < 0.05 && Math.floor(Math.atan2(t, dx) * 6 + 20) % 2 === 0) return '#3a3a40'; return Math.abs(dx) < 0.025 ? '#3a3a40' : '#6a6e76'; } return dy > -0.2 ? '#4a4e56' : null; }); })();
        glints.forEach(function(g){ if (B.light) B.light(g[0], g[1], B.gz(g[0], g[1]) + 0.1, '#ffe27a'); });
        fronts.forEach(function(r, n){ var w = r.w - 0.4, d = r.d - 0.8, wh = 2.1;   // a false front: a plank house, its tall square face, a porch roof, the glass long gone
          house(B, { x:r.x, y:r.y - 0.2, w:w, d:d }, { wh:wh, rh:0.7, wall:function(dx, dy, t){ return (Math.floor((dx + 9) * 4) % 2) ? '#8a8276' : '#7a7266'; },
            roof:function(dx, dy, t, rr, eave){ return eave ? '#3a342e' : (Math.floor(t * 5) % 2 ? '#5a524a' : '#6a6056'); } });
          var X = r.x, Y = r.y - 0.2 + d / 2 + 0.06, zb = B.gz(X, Y), top = wh + 1.05 + (n % 2) * 0.2;
          B.solid(X - w / 2 - 0.1, Y - 0.1, zb - 0.05, X + w / 2 + 0.1, Y + 0.6, zb + top + 0.1, function(px, py, pz){ var dx = px - X, dy = py - Y, t = pz - zb;
            if (dy < 0.1){ var tp = top - (Math.abs(dx) > w * 0.3 ? 0.25 : 0); if (Math.abs(dx) > w / 2 || t > tp) return null;
              if (t > wh + 0.25 && t < wh + 0.65 && Math.abs(dx) < w * 0.38) return Math.abs(t - wh - 0.45) < 0.05 && Math.abs(dx) < w * 0.3 && (((dx + 9) * 6) | 0) % 3 ? '#5a3c2a' : vn(dx * 3, t * 3, n + 4) > 0.55 ? '#c49a6a' : '#d8b88a';   // the sign, its paint flaked
              if (t < 1.25 && t > 0.05 && Math.abs(dx) < 0.32) return '#1e1814'; if (t > 0.55 && t < 1.25 && Math.abs(Math.abs(dx) - w * 0.32) < 0.24) return vn(dx * 7, t * 7, n) > 0.6 ? '#3a4a52' : '#1a1612';
              return (Math.floor((t + 9) * 5) % 2) ? '#aa9e8c' : '#988c7a'; }
            if (dy < 0.5 && t > 1.3 && t < 1.42 - dy * 0.12 && Math.abs(dx) < w / 2) return (Math.floor((dx + 9) * 5) % 2) ? '#6a5e50' : '#5a5046';   // the porch roof, sagging out
            if (Math.abs(Math.abs(dx) - w / 2 + 0.1) < 0.05 && Math.abs(dy - 0.45) < 0.05 && t < 1.36) return '#5a5046'; if (t < 0.1 && dy < 0.5 && Math.abs(dx) < w / 2) return '#6a5e50'; return null; });
          if (n === 0 && B.light) B.light(X + w * 0.32, Y + 0.05, zb + 0.9, '#ffb84a'); });   // somebody left a lamp burning
        if (cart){ var X = cart.x, Y = cart.y, cz = B.gz(X, Y);   // the runaway cart, on its side, its gold spilled out across the dust
          B.solid(X - 1.3, Y - 0.7, cz - 0.05, X + 1.3, Y + 0.9, cz + 1.0, function(px, py, pz){ var dx = px - X, dy = py - Y, t = pz - cz;
            if (dx < -0.1 && dx > -0.9 && Math.abs(dy) < 0.55 && t < 0.95){ var inn = dx < -0.2 && Math.abs(dy) < 0.45 && t > 0.08 && t < 0.85; if (inn && dx > -0.82) return null; if (Math.abs(dx + 0.85) < 0.08 && Math.abs(Math.abs(dy) - 0.3) < 0.18 && Math.abs(t - 0.5) < 0.3) return '#2a2a2e'; return '#8a5432'; }
            if (dx >= -0.1 && t < 0.2 + 0.25 * (1 - dx) && dx < 1.2 && Math.abs(dy) < 0.6 * (1.2 - dx)) return vn(px * 6, py * 6, 2) > 0.45 ? '#f2c43a' : '#6a5e52'; return null; }); }
      },
      fill:{ on:['dust'], trees:0.16, lows:0.3, tree:function(B, x, y, i){ deadTree(B, x, y, 1.8 + hash(i, seed, 41) * 0.8, i + seed); },
        low:function(B, x, y, i){ var k = hash(i, seed, 43); if (k < 0.45) bush(B, x, y, 0.34, ['#b09a62', '#9a8450', '#c8b47a']); else if (k < 0.75) rockAt(B, x, y, 0.36, ['#7a6a5e', '#5e5048']); else cnyLow(B, x, y, i, seed); } },
      bg:'#8a7058', gain:1.8,
      mats:{ lode:['#4e423c', '#6a5a50', '#3a302c', 0.1, function(c, R){ var z = c.z || 0, u = c.u || 0, v = vn(u * 0.7 + z * 0.35, z * 0.9 - u * 0.2, seed + 8);   // dark rock, gold threading it
          if (c.top) return R(blot(c, 0.2, seed + 2) > 0.6 ? '#6e6450' : '#5e5444'); if (Math.abs(v - 0.5) < 0.035 || (Math.abs(v - 0.3) < 0.02 && z > 1)) return R(vn(u * 3, z * 3, 2) > 0.5 ? '#ffd23a' : '#d8a82a'); if (c.top) return R('#6a5e4a'); return R(cnyBand(z, u, seed, ['#5a4a42', '#4e403a', '#665448', '#46382e', '#54463c'])); }],
        dust:cnyGround(seed, ['#b49a78', '#c2aa88', '#a08868', '#a89070']), track:cnyGround(seed + 3, ['#9a8466', '#a89272', '#8a765a', '#a08a6a']) }
    };
  }
  /* ---------------- VOLCANO ISLAND IS A JOURNEY, from the shore to the top of the mountain. You land on the black sand
     beach where the lava runs into the sea (1 to 4), climb through the green foothills and the tiki village (5 to 8),
     cross the lava fields and the river of fire (9 to 12), walk the crater's rim among the obsidian (13 to 16), and
     putt out at the summit by the lava lake (17 and 18). A hole with no place (a daily, a season) keeps the old land. */
  STOPS.volcano = [[1, 'beach'], [5, 'village'], [9, 'fields'], [13, 'crater'], [17, 'summit']];
  FLY['volcano~beach'] = 'gull'; FLY['volcano~village'] = 'parrot'; FLY['volcano~fields'] = 'vulture'; FLY['volcano~crater'] = FLY['volcano~summit'] = 'ember';
  (function(){ var base = BUILD.volcano; BUILD.volcano = function(L){ var s = L.stop;
    return s === 'beach' ? volBeach(L) : s === 'village' ? volVillage(L) : s === 'fields' ? volFields(L) : s === 'crater' ? volCrater(L) : s === 'summit' ? volSummit(L) : base(L); }; })();

  // lava that moves: a bright skin in smooth patches, hottest yellow where it runs fastest, dark crust riding on it
  function volLava(sd){ return ['#ff6a1a', '#ffd25a', '#c8380c', 0.06, function(c, R){ var a = blot(c, 0.08, sd), b = blot(c, 0.22, sd + 1), d = c.dep == null ? 1 : c.dep;
    if (d < 0.1) return R('#ff9a2a'); return R(a < 0.2 ? '#4a1a0e' : a < 0.27 ? '#a8300e' : b > 0.7 ? '#ffd25a' : b > 0.56 ? '#ff9a2a' : '#ff6a1a'); }]; }
  // a lake of lava: plates of crust gone dark, the bright seams between them, and open fire where the crust has broken up
  function volLake(sd){ return ['#5a1a0c', '#ff6a1a', '#3a140c', 0, function(c, R){ var d = c.dep == null ? 1 : c.dep, seam = Math.abs(blot(c, 0.07, sd) - 0.5), open = blot(c, 0.035, sd + 2);
    if (d < 0.12 || seam < 0.028) return R(seam < 0.012 ? '#ffc24a' : '#e8501a'); if (open > 0.66) return R(blot(c, 0.2, sd + 3) > 0.66 ? '#ff8a1a' : '#e0481a'); if (open > 0.6) return R('#a8300e');
    return R(blot(c, 0.15, sd + 4) > 0.55 ? '#4a1a10' : '#2e1410'); }]; }
  // the glow of lava, registered every so often along it so it flickers (never more than n lights)
  function volGlow(B, pts, n, col){ var st = Math.max(1, Math.ceil(pts.length / n)); for (var i = 0; i < pts.length; i += st){ var p = pts[i]; B.light(p[0], p[1], B.gz(p[0], p[1]) + 0.35, col || '#ff7a1a'); } }
  // a tiki torch: a banded bamboo pole, a cup, and the flame, which is a light
  function volTorch(B, x, y){ var zb = B.gz(x, y); if (B.light) B.light(x, y, zb + 1.75, '#ff9a2a');
    B.solid(x - 0.22, y - 0.22, zb, x + 0.22, y + 0.22, zb + 2, function(px, py, pz){ var r = Math.hypot(px - x, py - y), t = pz - zb;
      if (t < 1.4) return r < 0.07 ? (Math.floor(t * 4) % 2 ? '#7a5a34' : '#5a3818') : null; if (t < 1.58) return r < 0.15 ? '#3d2614' : null;
      return r < 0.15 * (1 - (t - 1.58) / 0.42) ? (t > 1.76 ? '#ffd25a' : '#ff7a1a') : null; }); }
  // a hexagonal cell of size a round (x, y): its centre, how near the edge the point is (1 at the edge), and its index
  function volHex(x, y, a){ var q = (0.57735 * x - y / 3) / a, r = (2 / 3 * y) / a, s = -q - r, rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
    var dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s); if (dq > dr && dq > ds) rq = -rr - rs; else if (dr > ds) rr = -rq - rs;
    var cx = a * 1.732 * (rq + rr / 2), cy = a * 1.5 * rr, ux = x - cx, uy = y - cy;
    return [cx, cy, Math.max(Math.abs(ux), Math.abs(ux * 0.5 + uy * 0.866), Math.abs(ux * 0.5 - uy * 0.866)) / (a * 0.866), rq, rr]; }
  // a cluster of basalt columns, six sided, the middle ones tallest, each top a step of its own
  function volColumns(B, x, y, R, H, k, zb){ zb = zb == null ? B.gz(x, y) - 0.4 : zb;
    B.solid(x - R - 0.3, y - R - 0.3, zb, x + R + 0.3, y + R + 0.3, zb + H + 0.2, function(px, py, pz){ var q = volHex(px - x, py - y, 0.42), t = pz - zb, rr = Math.hypot(q[0], q[1]) / R;
      if (rr > 1) return null; var h = H * (1 - rr * 0.6) * (0.72 + hash(q[3] + 40, q[4] + 40, k) * 0.36); if (t > h) return null;
      if (q[2] > 0.84) return '#141113'; if (t > h - 0.16) return '#5c5258'; return t < 0.5 ? '#2a2427' : (q[3] + q[4]) % 2 ? '#3a3337' : '#332c30'; }); }
  // a rock with its colour in smooth patches, and (glow) cracks that still burn
  function volRock(B, x, y, r, cols, glow){ var zb = B.gz(x, y) - 0.05;
    B.solid(x - r, y - r, zb, x + r, y + r, zb + r * 1.1, function(px, py, pz){ var d = Math.hypot((px - x) / r, (py - y) / (r * 0.8), (pz - zb) / (r * 0.9)) + (vn(px * 3, pz * 3, 5) - 0.5) * 0.2; if (d >= 1) return null;
      if (glow && Math.abs(vn(px * 2.6, py * 2.6 + pz * 2, 9) - 0.5) < 0.06) return glow; return vn(px * 2.2, py * 2.2 + pz, 3) > 0.6 ? cols[1] : cols[0]; }); }
  // an outrigger canoe drawn up on the sand: a hollow hull, a pale gunwale, two booms out to the float
  function volCanoe(B, x, y, dir){ var zb = B.gz(x, y);
    B.solid(x - 2.2, y - 1.1, zb - 0.1, x + 2.2, y + 0.5, zb + 0.9, function(px, py, pz){ var dx = (px - x) * dir, dy = py - y, t = pz - zb, u = dx / 2, hw = 0.34 * Math.sqrt(Math.max(0, 1 - u * u));
      if (Math.abs(dy) < hw && t < 0.48 + u * u * 0.3){ if (Math.abs(dy) < hw - 0.09 && t > 0.18) return null; return t > 0.38 ? '#d8b47a' : (Math.abs(t - 0.22) < 0.04 ? '#c8402e' : '#8a5a30'); }
      if (Math.abs(dy + 0.85) < 0.11 && Math.abs(dx) < 1.3 && t < 0.24) return '#a07a48';
      if (Math.abs(Math.abs(dx) - 0.7) < 0.06 && dy < 0 && dy > -0.88 && Math.abs(t - 0.36) < 0.06) return '#6a4a2a'; return null; }); }
  // a tiki hut: a round wall of bamboo, a doorway to the front with the fire inside, and a tall thatched cone
  function volHut(B, x, y, r){ var zb = B.gz(x, y), wh = 1.5, rh = 2.1, R2 = r + 0.45;
    B.solid(x - R2, y - R2, zb - 0.1, x + R2, y + R2, zb + wh + rh, function(px, py, pz){ var dx = px - x, dy = py - y, d = Math.hypot(dx, dy), t = pz - zb, a = Math.atan2(dy, dx);
      if (t >= wh - 0.25){ var rr = (t - wh + 0.25) / rh; if (d < R2 * (1 - rr)){ if (d < R2 * (1 - rr) - 0.3) return null;
        var ring = Math.floor(t * 3.2 + vn(a * 4, 1, 7) * 0.6); return rr < 0.07 ? '#5a4020' : rr > 0.86 ? '#4a3018' : ring % 3 === 0 ? '#7a5a2c' : ring % 3 === 1 ? '#9a7638' : '#8a6830'; } return null; }
      if (d > r || d < r - 0.18) return null;
      if (dy > 0 && Math.abs(dx) < 0.38 && t < 1.15) return null;   // the doorway
      return Math.floor((a + 4) * r * 4) % 2 ? '#b8945a' : '#9a7444'; });
    if (B.light) B.light(x, y + r * 0.6, zb + 0.5, '#ffb84a');
    B.solid(x - 0.3, y - 0.3, zb, x + 0.3, y + 0.3, zb + 0.5, function(px, py, pz){ return Math.hypot(px - x, py - y) < 0.24 * (1 - (pz - zb) / 0.5) ? (pz - zb < 0.2 ? '#ff7a1a' : '#ffd25a') : null; }); }
  // a tiki: a carved post with a face, painted bands, a crown. cols: wood or stone
  function volTiki(B, x, y, H, cols){ var zb = B.gz(x, y), w = 0.5, hd = 0.42;
    B.solid(x - 0.7, y - 0.6, zb - 0.1, x + 0.7, y + 0.6, zb + H + 0.1, function(px, py, pz){ var dx = px - x, dy = py - y, t = pz - zb, u = t / H, hw = u > 0.86 ? w * 1.18 : w;
      if (Math.abs(dx) > hw || Math.abs(dy) > hd || t > H) return null; var ax = Math.abs(dx);
      if (dy > hd - 0.12){
        if (u > 0.62 && u < 0.75 && Math.abs(ax - 0.24) < 0.14) return (u > 0.66 && u < 0.71 && Math.abs(ax - 0.24) < 0.07) ? '#f4e8c8' : '#1a1210';   // the eyes
        if (u > 0.49 && u < 0.62 && ax < 0.1) return cols[2];   // the nose
        if (u > 0.36 && u < 0.47 && ax < 0.36) return Math.abs(u - 0.415) < 0.02 ? '#1a1210' : '#e8dcc0';   // the grin
      }
      if (Math.abs(u - 0.84) < 0.025 || Math.abs(u - 0.28) < 0.025) return '#c8402e';
      return (Math.floor(t * 2.5) % 2) ? cols[0] : cols[1]; }); }
  // obsidian: black glass in leaning blades, a lit face with a violet sheen, the others near black
  function volShards(B, x, y, s, k){ var zb = B.gz(x, y) - 0.05, Q = [];
    for (var i = 0; i < 5; i++){ var a = hash(i, k, 61) * 6.28, r = i ? s * (0.35 + hash(k, i, 62) * 0.45) : 0; Q.push([x + Math.cos(a) * r, y + Math.sin(a) * r * 0.7, s * (i ? 0.9 + hash(i, k, 63) * 0.8 : 2.1), s * (i ? 0.26 : 0.4), (hash(k, i, 64) - 0.5) * 0.6, (hash(i, k, 65) - 0.5) * 0.4]); }
    B.solid(x - s * 1.5, y - s * 1.2, zb, x + s * 1.5, y + s * 1.2, zb + s * 2.2, function(px, py, pz){ var t = pz - zb;
      for (var i = 0; i < Q.length; i++){ var q = Q[i], h = q[2]; if (t > h) continue; var dx = px - q[0] - q[4] * t, dy = py - q[1] - q[5] * t, w = q[3] * (1 - t / h);
        if (Math.abs(dx) + Math.abs(dy) < w) return dx + dy * 0.4 > w * 0.3 ? '#6a5a8e' : dx < -w * 0.25 ? '#0c0a12' : '#221d2c'; }
      return null; }); }
  // a spatter cone: a heap of red black cinder with a glowing throat
  function volCone(B, x, y, r, H){ var zb = B.gz(x, y) - 0.1; if (B.light) B.light(x, y, zb + H, '#ff7a1a');
    B.solid(x - r, y - r, zb, x + r, y + r, zb + H, function(px, py, pz){ var d = Math.hypot(px - x, py - y), t = pz - zb, rad = r * (1 - t / H * 0.62) + (vn(Math.atan2(py - y, px - x) * 2.5, t * 2, 71) - 0.5) * 0.2;
      if (d > rad) return null; if (d < r * 0.26 && t > H - 0.6) return t > H - 0.4 ? null : '#ffb43a';
      if (t > H - 0.3) return '#8a3a1e'; return vn(px * 2, py * 2 + t * 2, 72) > 0.55 ? '#4a2e26' : '#33282a'; }); }
  // a vent on the crater's rim: a crust of sulphur round a hole, and its steam going up
  function volFumarole(B, x, y, k){ var zb = B.gz(x, y);
    B.solid(x - 0.8, y - 0.8, zb - 0.1, x + 0.8, y + 0.8, zb + 0.6, function(px, py, pz){ var d = Math.hypot(px - x, py - y), t = pz - zb, top = 0.45 * (1 - d / 0.8) + 0.1;
      if (d > 0.78 || t > top) return null; if (d < 0.2) return null; return d < 0.36 ? '#c8a830' : vn(px * 3, py * 3, k) > 0.5 ? '#e0cc5a' : '#6a6266'; });
    B.vox(x - 1, y - 1, zb, x + 1.2, y + 1, zb + 3.2, function(set){ for (var i = 0; i < 4; i++){ var dz = 0.7 + i * 0.6, dx = Math.sin(i * 1.3 + k) * 0.25 + i * 0.12, r = 0.25 + i * 0.1;
      B.blob(set, x + dx, y, zb + dz, r, r * 0.8, r * 0.85, i % 2 ? '#d8d4d6' : '#ece8ea'); } }); }

  /* 1. THE BLACK SAND BEACH: the sea along the top, the surf on black sand, the lava come down beside the course and
     running steaming into the water, basalt columns standing out of the sea on the other side, a canoe drawn up, palms. */
  function volBeach(L){
    var E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot;
    function shoreY(x){ return P0[1] - 1.6 - (vn(x * 0.11, 1, seed) - 0.5) * 2.4; }
    function sea(x, y){ return shoreY(x) - y; }
    var sd = hash(seed, 3, 1) < 0.5 ? -1 : 1, lx = sd < 0 ? Math.max(E[0] + 1.4, P0[0] - 2.8) : Math.min(E[2] - 1.4, P1[0] + 2.8);
    var flow = clearAt(lx, (P0[1] + P1[1]) / 2) > 1.6 ? wind([lx + sd * 0.8, E[3] + 1], [lx - sd * 0.6, shoreY(lx) - 1.2], seed + 2, 1.2) : null, dF = L.dist(flow);
    if (flow) flow.forEach(function(p){ L.used.push({ x:p[0], y:p[1], r:1 }); });
    var mouth = flow ? flow[flow.length - 1] : null;
    var colX = L.cx - sd * Math.min(7, (E[2] - E[0]) * 0.3), cols = [{ x:colX, y:Math.max(E[1] + 2.2, shoreY(colX) - 1.4), R:2.3, H:4.6 }, { x:colX - sd * 3.4, y:Math.max(E[1] + 1.6, shoreY(colX - sd * 3.4) - 2.2), R:1.5, H:3 }];
    cols.forEach(function(c){ L.used.push({ x:c.x, y:c.y, r:c.R + 0.3 }); });
    var canoe = spot(1.6, function(x, y){ return -Math.abs(sea(x, y) + 1.6) * 2 + L.side(x) * 2 + hash(x | 0, y | 0, seed + 7); }, function(x, y){ return sea(x, y) < -1 && !(dF(x, y) < 2.5); });
    var torches = []; for (var i = 0; i < 4; i++){ var t = spot(0.4, function(x, y){ return -Math.abs(clearAt(x, y) - 1.7) + hash(x * 3 | 0, y * 3 | 0, seed + 20 + i); }, function(x, y){ return sea(x, y) < -1 && dF(x, y) > 1.6; }); if (t) torches.push(t); }
    function lava(x, y){ return flow ? 0.7 + (vn(y * 0.4, 3, seed) - 0.5) * 0.3 - dF(x, y) : -1; }
    return {
      h:function(x, y){ var s = sea(x, y); if (s > 0) return -0.2 - Math.min(0.4, s * 0.1); var lv = lava(x, y); if (lv > 0) return -0.02 + Math.min(0.1, lv * 0.2);
        return (fbm(x * 0.09, y * 0.12, seed + 2) - 0.4) * 1.1 * sm(1.2, 5, clearAt(x, y)) * sm(0, 2, -s - 0.6) + Math.max(0, lv + 0.5) * 0.25; },
      mat:function(x, y){ var s = sea(x, y), lv = lava(x, y);
        if (s > 0){ if (mouth && Math.hypot(x - mouth[0], (y - mouth[1]) * 1.4) < 1.6 + vn(x, y, seed) * 0.6) return ['steam']; return s < 0.35 ? ['foam'] : ['sea', { dep:s }]; }
        if (lv > 0) return ['lava', { dep:lv }]; if (lv > -0.35) return ['crust']; if (s > -0.9) return ['wet']; return ['sand']; },
      build:function(B){
        cols.forEach(function(c, k){ volColumns(B, c.x, c.y, c.R, c.H, seed + k, -0.6); });
        if (flow) volGlow(B, flow, 5);
        if (mouth) B.vox(mouth[0] - 1.6, mouth[1] - 1.6, -0.3, mouth[0] + 1.6, mouth[1] + 1.2, 3.4, function(set){   // the steam off the water where the lava meets it
          for (var i = 0; i < 6; i++){ var r = 0.35 + i * 0.12; B.blob(set, mouth[0] + Math.sin(i * 1.7 + seed) * 0.5, mouth[1] - i * 0.12, 0.2 + i * 0.5, r, r * 0.8, r * 0.8, i % 2 ? '#e4e0e2' : '#f6f4f4'); } });
        if (canoe) volCanoe(B, canoe.x, canoe.y, hash(seed, 9, 2) < 0.5 ? 1 : -1);
        torches.forEach(function(p){ volTorch(B, p.x, p.y); });
      },
      fill:{ on:['sand'], trees:0.34, lows:0.26, tree:function(B, x, y, i){ pirPalm(B, x, y, 3.8 + hash(i, seed, 21) * 1.6, i * 3 + seed, seed); },
        low:function(B, x, y, i){ var k = hash(i, seed, 23); if (k < 0.6) volRock(B, x, y, 0.36 + hash(i, seed, 24) * 0.18, ['#2e282c', '#4a4246']); else bush(B, x, y, 0.4, ['#2f8139', '#3f9a46', '#246e30']); } },
      bg:'#1d5f86', gain:2.4,
      mats:{ sea:['#1d5f86', '#3a8ab0', '#164a6a', 0.05, function(c, R){ var d = c.dep || 0; return R(d < 1.2 ? '#3a8ab0' : d < 3.5 ? '#1d5f86' : '#164a6a'); }],
        foam:['#eef4f4', '#ffffff', '#d6e2e2', 0, function(c, R){ return R(blot(c, 0.3, seed + 5) > 0.55 ? '#ffffff' : '#dfe8ea'); }],
        steam:['#c8d8dc', '#eef4f4', '#9ab8c0', 0, function(c, R){ var a = blot(c, 0.2, seed + 6); return R(a > 0.6 ? '#f4f6f6' : a > 0.4 ? '#c8d8dc' : '#8ab0b8'); }],
        sand:['#2e2b2f', '#3c383c', '#262326', 0, function(c, R){ var a = blot(c, 0.1, seed + 7), b = blot(c, 0.33, seed + 8); return R(b > 0.76 ? '#3e4636' : a > 0.66 ? '#3c383c' : a < 0.3 ? '#252226' : '#2e2b2f'); }],
        wet:['#1e1c20', '#26242a', '#18161a', 0, function(c, R){ return R(blot(c, 0.15, seed + 9) > 0.6 ? '#2a2a32' : '#1c1b20'); }],
        crust:['#2a1e1e', '#5a2a18', '#1f1a1d', 0, function(c, R){ var a = blot(c, 0.3, seed + 10); return R(a > 0.62 ? '#7a2a12' : a > 0.4 ? '#3a2220' : '#221c1e'); }],
        lava:volLava(seed + 11) }
    };
  }

  /* 2. THE FOOTHILLS AND THE TIKI VILLAGE: green slopes climbing away behind the course with a thread of lava down them,
     thatched huts either side with their fires lit, tikis at the foot of the hill, an ash field, palms and big trees. */
  function volVillage(L){
    var C = L.C, E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot, spotRect = L.spotRect;
    function hillY(x){ return P0[1] - 2.4 - (vn(x * 0.13, 2, seed) - 0.5) * 2; }
    var lvx = L.cx + (hash(seed, 4, 2) < 0.5 ? -1 : 1) * Math.min(6, (P1[0] - P0[0]) * 0.35);
    function lavaD(x, y){ var hy = hillY(x); if (y > hy + 0.2) return -1; return 0.32 + (hy - y) * 0.035 - Math.abs(x - lvx - (vn(y * 0.3, 5, seed) - 0.5) * 1.6); }
    var huts = []; for (var i = 0; i < 3; i++){ var r = spotRect(3.6, 3.6, function(x, y){ return L.side(x) * 6 - Math.abs(y - P0[1] - 2) * 0.25 + hash(x | 0, y | 0, seed + 30 + i); }); if (r) huts.push(r); }
    var tikis = []; for (i = 0; i < 3; i++){ var tk = spot(0.6, function(x, y){ return -Math.abs(y - hillY(x) - 0.9) * 2 - Math.abs(Math.abs(x - L.cx) - 4 - i * 2.5) * 0.3 + hash(x * 3 | 0, y * 3 | 0, seed + 40 + i); }, function(x, y){ return y > hillY(x) + 0.4; }); if (tk) tikis.push(tk); }
    var torches = []; for (i = 0; i < 4; i++){ var t = spot(0.4, function(x, y){ return -Math.abs(clearAt(x, y) - 1.7) + hash(x * 3 | 0, y * 3 | 0, seed + 50 + i); }, function(x, y){ return y > hillY(x) + 0.5; }); if (t) torches.push(t); }
    var ash = spot(2.4, function(x, y){ return -Math.abs(clearAt(x, y) - 4) * 0.5 + (y - P0[1]) * 0.15 + hash(x | 0, y | 0, seed + 60); }, function(x, y){ return y > hillY(x) + 3; });
    var rocks = []; for (i = 0; i < 3; i++){ var rk = spot(0.8, function(x, y){ return -Math.abs(y - hillY(x) - 0.6) * 2 + hash(x * 2 | 0, y * 2 | 0, seed + 70 + i) * 2; }, function(x, y){ return y > hillY(x) + 0.2; }); if (rk) rocks.push(rk); }
    var path = huts[0] ? L.route([huts[0].x, huts[0].y + 2], [C.tee[0], P1[1] + 1.4], seed + 3, 1) : null, dP = L.dist(path);
    function ashD(x, y){ return ash ? 1 - Math.hypot((x - ash.x) / (ash.r + 0.8), (y - ash.y) / (ash.r * 0.8)) + (fbm(x * 0.5, y * 0.5, seed + 8) - 0.5) * 0.4 : -1; }
    var glowPts = []; for (var gy = E[1]; gy < P0[1]; gy += 2.6){ var gx = lvx + (vn(gy * 0.3, 5, seed) - 0.5) * 1.6; if (lavaD(gx, gy) > 0) glowPts.push([gx, gy]); }
    return {
      h:function(x, y){ var hy = hillY(x), k = sm(0.8, 3, clearAt(x, y)), z = (fbm(x * 0.08, y * 0.1, seed) - 0.42) * 1.1 * sm(1.3, 6, clearAt(x, y));
        if (y < hy){ var st = (hy - y) / 1.8, n = Math.floor(st); z += (Math.min(6, (n + sm(0.8, 1, st - n)) * 0.7) + (fbm(x * 0.3, y * 0.3, seed + 5) - 0.5) * 0.15) * k; if (lavaD(x, y) > 0) z -= 0.12; }   // terraced, each step held by a wall of stones
        if (dP(x, y) < 0.6) z -= 0.04; if (ashD(x, y) > 0) z *= 0.4; return z; },
      mat:function(x, y){ var hy = hillY(x); if (y < hy){ var lv = lavaD(x, y); if (lv > 0) return ['lava', { dep:lv }]; if (lv > -0.25) return ['crust']; var sf = (hy - y) / 1.8 % 1; return sf > 0.78 ? ['terrace'] : ['slope', { z:hy - y }]; }
        if (dP(x, y) < 0.55) return ['cinder']; var a = ashD(x, y); if (a > 0) return ['ash']; return ['moss']; },
      build:function(B){
        huts.forEach(function(r){ volHut(B, r.x, r.y, 1.45); });
        tikis.forEach(function(p, k){ volTiki(B, p.x, p.y, 2.2 + hash(k, seed, 3) * 0.7, ['#7a5030', '#6a4428', '#5a3a22']); });
        torches.forEach(function(p){ volTorch(B, p.x, p.y); });
        rocks.forEach(function(p, k){ volRock(B, p.x, p.y, 0.7, ['#2e282c', '#4a4246']); });
        glowPts.forEach(function(p){ B.light(p[0], p[1], B.gz(p[0], p[1]) + 0.3, '#ff7a1a'); });
      },
      fill:{ on:['moss', 'slope'], trees:0.42, lows:0.34,
        tree:function(B, x, y, i){ if (hash(i, seed, 31) < 0.55) pirPalm(B, x, y, 3.6 + hash(i, seed, 32) * 1.6, i * 5 + seed, seed); else broadTree(B, x, y, 3.4 + hash(i, seed, 33) * 1.6, '#4a3624', ['#1f5a26', '#2b6e30', '#3f8a3a'], i); },
        low:function(B, x, y, i){ var k = hash(i, seed, 34); if (k < 0.55) bush(B, x, y, 0.45, ['#1f6a2a', '#2f8139', '#3f9a46']); else if (k < 0.75) bush(B, x, y, 0.32, ['#e8573a', '#2f8139', '#ffd23a']); else volRock(B, x, y, 0.38, ['#2e282c', '#4a4246']); } },
      bg:'#2e4a26', gain:1.9,
      mats:{ moss:['#3d5a2c', '#4f6a34', '#33482a', 0, function(c, R){ var a = blot(c, 0.1, seed + 7), b = blot(c, 0.3, seed + 8); return R(a > 0.7 ? '#5a4a34' : a > 0.6 ? '#4f6a34' : b < 0.28 ? '#33482a' : b > 0.72 ? '#47663a' : '#3d5a2c'); }],
        terrace:['#5a5256', '#6a6266', '#3a3436', 0, function(c, R){ return R(blot(c, 0.5, seed + 13) > 0.55 ? '#6a6266' : '#4e484c'); }],
        slope:['#456a32', '#3a3436', '#2f5a26', 0, function(c, R){ var a = blot(c, 0.14, seed + 3), z = c.z || 0; return R(a > 0.68 ? '#3a3436' : a > 0.62 ? '#4a4246' : z > 5 ? '#2f5a26' : blot(c, 0.06, seed + 4) > 0.55 ? '#4e7436' : '#456a32'); }],
        ash:['#6a6266', '#7a7276', '#5a5256', 0, function(c, R){ var a = blot(c, 0.16, seed + 9); return R(a > 0.64 ? '#7e767a' : a < 0.32 ? '#58505a' : '#6a6266'); }],
        cinder:['#4a3a38', '#5a4844', '#3a2c2a', 0, function(c, R){ return R(blot(c, 0.4, seed + 10) > 0.6 ? '#5a4844' : '#4a3a38'); }],
        crust:['#2a1e1e', '#5a2a18', '#1f1a1d', 0, function(c, R){ return R(blot(c, 0.3, seed + 11) > 0.6 ? '#6a2a14' : '#2a2022'); }],
        lava:volLava(seed + 12) }
    };
  }

  /* 3. THE LAVA FIELDS: black ropey rock with its cracks still glowing, the river of fire running across behind the
     course, spatter cones beyond it, pools of lava either side, and the trees burnt to sticks. */
  function volFields(L){
    var E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot;
    function riverY(x){ return P0[1] - 2.3 - (vn(x * 0.09, 4, seed) - 0.5) * 2.4; }
    function rw(x){ return 0.85 + vn(x * 0.2, 6, seed) * 0.5; }
    function river(x, y){ return rw(x) - Math.abs(y - riverY(x)); }
    var cones = []; for (var i = 0; i < 3; i++){ var cxx = L.cx + (i - 1) * Math.min(9, (E[2] - E[0]) * 0.3) + (hash(i, seed, 5) - 0.5) * 3, cyy = riverY(cxx) - 2.6 - hash(i, seed, 6) * 1.4;
      if (cyy > E[1] + 0.6){ cones.push({ x:cxx, y:cyy, r:1.1 + hash(i, seed, 7) * 0.5, H:1.3 + hash(i, seed, 8) * 0.8 }); L.used.push({ x:cxx, y:cyy, r:1.6 }); } }
    var pools = []; for (i = 0; i < 2; i++){ var p = spot(1.3, function(x, y){ return L.side(x) * 3 + (y - P0[1]) * 0.1 + hash(x * 2 | 0, y * 2 | 0, seed + i) * 2; }, function(x, y){ return river(x, y) < -1.8; }); if (p) pools.push(p); }
    function poolD(x, y){ var m = -1; pools.forEach(function(p){ m = Math.max(m, 1 - Math.hypot((x - p.x) / p.r, (y - p.y) / (p.r * 0.75)) + (fbm(x * 0.7, y * 0.7, seed + 9) - 0.5) * 0.3); }); return m; }
    var glow = []; for (var gx = E[0] + 1; gx < E[2]; gx += 3.2) glow.push([gx, riverY(gx)]); pools.forEach(function(p){ glow.push([p.x, p.y]); });
    var embers = []; for (i = 0; i < 4; i++){ var e = spot(0.5, function(x, y){ return -Math.abs(clearAt(x, y) - 2.2) + hash(x * 3 | 0, y * 3 | 0, seed + 30 + i); }, function(x, y){ return river(x, y) < -1; }); if (e) embers.push(e); }
    return {
      h:function(x, y){ var rv = river(x, y), k = sm(1.2, 5, clearAt(x, y)), z = (fbm(x * 0.07, y * 0.09, seed) - 0.45) * 1.2 * k + (fbm(x * 0.5, y * 0.5, seed + 3) - 0.5) * 0.25 * k;
        if (rv > 0) return -0.3; if (rv > -0.4) return z * 0.5 + 0.12; var up = riverY(x) - rw(x) - y; if (up > 0) z += Math.min(2.6, up * 0.35) * k;
        if (poolD(x, y) > 0) return -0.15; return z; },
      mat:function(x, y){ var rv = river(x, y); if (rv > 0) return ['lava', { dep:rv }]; if (rv > -0.4) return ['crust'];
        var pd = poolD(x, y); if (pd > 0) return ['lava', { dep:pd * 2 }]; if (pd > -0.15) return ['crust']; return ['flow']; },
      build:function(B){
        cones.forEach(function(c){ volCone(B, c.x, c.y, c.r, c.H); });
        volGlow(B, glow, 7);
        embers.forEach(function(p, k){ volRock(B, p.x, p.y, 0.4, ['#2a2226', '#3a2e30'], '#ff6a1a'); });
      },
      fill:{ on:['flow'], trees:0.2, lows:0.3, tree:function(B, x, y, i){ deadTree(B, x, y, 3.4 + hash(i, seed, 41) * 2, i + seed * 3); },
        low:function(B, x, y, i){ var k = hash(i, seed, 43); if (k < 0.6) volRock(B, x, y, 0.35 + hash(i, seed, 44) * 0.2, ['#2a2427', '#3e3639']); else volRock(B, x, y, 0.32, ['#2a2226', '#3a2e30'], '#ff6a1a'); } },
      bg:'#1e1a1d', gain:1.6,
      // pahoehoe: black rock with a sheen in patches, ropes across it, and a crack now and then still red hot
      mats:{ flow:['#2a2427', '#3a3236', '#1e1a1d', 0, function(c, R){ var a = blot(c, 0.07, seed + 13), cr = Math.abs(blot(c, 0.05, seed + 14) - 0.5), rope = Math.sin(c.ti * 0.5 + c.tj * 0.2 + blot(c, 0.04, seed + 15) * 14);
          if (cr < 0.012 && blot(c, 0.02, seed + 16) > 0.45) return R(cr < 0.006 ? '#ffb43a' : '#e0480e'); return R(a > 0.68 ? (rope > 0.4 ? '#4a4044' : '#3e3539') : a < 0.3 ? '#1c181b' : rope > 0.6 ? '#332c30' : '#2a2427'); }],
        crust:['#2a1e1e', '#5a2a18', '#1f1a1d', 0, function(c, R){ var a = blot(c, 0.3, seed + 17); return R(a > 0.62 ? '#8a3012' : a > 0.42 ? '#4a2218' : '#261e20'); }],
        lava:volLava(seed + 18) }
    };
  }

  /* 4. THE CRATER'S RIM: the course on the lip, and behind it the ground falls away into the crater, banded rock down
     to the magma glowing at the bottom. Grey ash and yellow sulphur underfoot, vents steaming, obsidian standing in blades. */
  function volCrater(L){
    var E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot;
    function rimY(x){ return P0[1] - 1.9 - (vn(x * 0.12, 5, seed) - 0.5) * 1.6; }
    function inside(x, y){ return rimY(x) - y; }
    var vents = []; for (var i = 0; i < 2; i++){ var v = spot(0.9, function(x, y){ return L.side(x) * 3 - Math.abs(inside(x, y) + 2) * 0.4 + hash(x * 2 | 0, y * 2 | 0, seed + 20 + i) * 2; }, function(x, y){ return inside(x, y) < -1.2; }); if (v) vents.push(v); }
    var shards = []; for (i = 0; i < 4; i++){ var s = spot(1, function(x, y){ return L.side(x) * 4 + Math.min(L.far(x, y), 5) * 0.3 + hash(x * 2 | 0, y * 2 | 0, seed + 30 + i) * 2; }, function(x, y){ return inside(x, y) < -1; }); if (s) shards.push(s); }
    function sulf(x, y){ var m = -1; vents.forEach(function(v){ m = Math.max(m, 1 - Math.hypot(x - v.x, y - v.y) / 2.2 + (fbm(x * 0.8, y * 0.8, seed + 4) - 0.5) * 0.5); }); return m; }
    var fx = L.cx + (hash(seed, 8, 3) - 0.5) * 6, glow = [[fx - 2.8, rimY(fx - 2.8) - 4.2], [fx + 2.8, rimY(fx + 2.8) - 4.2], [fx, rimY(fx) - 4.2]];   // the magma pool on the crater's floor
    return {
      h:function(x, y){ var d = inside(x, y), k = sm(0.6, 2.5, clearAt(x, y)), z = (fbm(x * 0.08, y * 0.1, seed) - 0.45) * 0.9 * sm(1.2, 5, clearAt(x, y));
        if (d < 0) return z + 0.55 * Math.max(0, 1 - Math.abs(d + 0.5) / 1.4) * k;   // the lip rises a little at the edge
        if (d < 1) return (0.55 - d * d * 2.2) * k; if (d < 9) return -1.7 + (fbm(x * 0.3, y * 0.3, seed + 6) - 0.5) * 0.3;
        return -1.7 + Math.min(6, (d - 9) * 1.8) + (fbm(x * 0.4, y * 0.2, seed + 7) - 0.5) * 0.6; },   // and the far wall climbs out again
      mat:function(x, y){ var d = inside(x, y);
        if (d >= 1 && d < 9){ var pool = 0.6 - Math.abs(x - fx) / 9 - Math.abs(d - 4.2) / 3.2 + (fbm(x * 0.5, y * 0.5, seed + 12) - 0.5) * 0.4; return pool > 0 ? ['magma', { dep:pool * 3 }] : ['floor']; }
        if (d >= 9) return ['wall', { z:Math.max(0, 2.6 * (1 - (d - 9) / 1.2)) }]; if (d > 0) return ['wall', { z:d * 2.6 }];
        var sv = sulf(x, y); if (sv > 0.2) return ['sulfur']; return ['ash']; },
      build:function(B){
        vents.forEach(function(v, k){ volFumarole(B, v.x, v.y, seed + k); });
        shards.forEach(function(s, k){ volShards(B, s.x, s.y, 0.8 + hash(k, seed, 9) * 0.4, seed + k); });
        volGlow(B, glow, 3, '#ff5a14');
      },
      fill:{ on:['ash'], trees:0.1, lows:0.3, tree:function(B, x, y, i){ volColumns(B, x, y, 0.9, 1.8 + hash(i, seed, 51) * 1.6, i + seed); },
        low:function(B, x, y, i){ var k = hash(i, seed, 53); if (k < 0.45) volShards(B, x, y, 0.35, i + seed); else volRock(B, x, y, 0.36, ['#4e484c', '#6a6266']); } },
      bg:'#2a1a16', gain:2.2,
      mats:{ ash:['#5e585c', '#6e686c', '#4e484c', 0, function(c, R){ var a = blot(c, 0.09, seed + 7), b = blot(c, 0.3, seed + 8); return R(a > 0.78 ? '#7a6e5a' : a > 0.6 ? '#6e686c' : b < 0.28 ? '#4e484c' : '#5e585c'); }],
        sulfur:['#d8c040', '#e8dc70', '#b8a030', 0, function(c, R){ var a = blot(c, 0.25, seed + 9); return R(a > 0.62 ? '#ece27a' : a < 0.35 ? '#a8942e' : '#d8c040'); }],
        // the crater's wall: bands of red and black rock, hotter toward the bottom
        wall:['#4a2a22', '#3a2226', '#5a3020', 0, function(c, R){ var z = c.z || 0, band = Math.floor(z * 3 + blot(c, 0.08, seed + 10) * 1.6) % 3; return R(z > 2.3 ? '#9a3412' : z > 1.8 ? '#6a2a16' : ['#4a2a22', '#2e2024', '#5a3424'][band]); }],
        // the crater's floor: lava gone black, still cracked through with red
        floor:['#241e21', '#3a2e30', '#1a1517', 0, function(c, R){ var a = blot(c, 0.08, seed + 13), cr = Math.abs(blot(c, 0.06, seed + 14) - 0.5); return R(cr < 0.02 ? (cr < 0.009 ? '#ffb43a' : '#e0480e') : a > 0.65 ? '#3a2e30' : a < 0.3 ? '#1a1517' : '#241e21'); }],
        magma:volLava(seed + 11) }
    };
  }

  /* 5. THE SUMMIT: the top of the mountain, red black cinder underfoot, and behind the course the lava lake, its crust
     cracking and a fountain of fire going up out of it. The fire shrine stands beside the course, its braziers lit. */
  function volSummit(L){
    var E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot, spotRect = L.spotRect;
    function lakeY(x){ return P0[1] - 2.1 - (vn(x * 0.1, 7, seed) - 0.5) * 1.4; }
    function lake(x, y){ return lakeY(x) - y; }
    var fx = L.cx + (hash(seed, 6, 2) - 0.5) * Math.min(8, (E[2] - E[0]) * 0.3), fy = Math.max(E[1] + 1.4, lakeY(fx) - 3.4);
    var shrine = spotRect(4, 2.8, function(x, y){ return L.side(x) * 6 - Math.abs(y - (P0[1] + P1[1]) / 2) * 0.12 + hash(x | 0, y | 0, seed + 60); });
    var shards = []; for (var i = 0; i < 3; i++){ var s = spot(1, function(x, y){ return L.side(x) * 3 + Math.min(L.far(x, y), 5) * 0.3 + hash(x * 2 | 0, y * 2 | 0, seed + 30 + i) * 2; }, function(x, y){ return lake(x, y) < -1.2; }); if (s) shards.push(s); }
    var glow = []; for (var gx = E[0] + 1; gx < E[2]; gx += 2.2) glow.push([gx, lakeY(gx) - 0.6]);
    return {
      h:function(x, y){ var l = lake(x, y), k = sm(1, 4, clearAt(x, y)); if (l > 0) return -0.45;
        if (l > -0.9) return 0.35 + (fbm(x * 0.8, y * 0.8, seed + 2) - 0.5) * 0.3;   // the rock lip round the lake
        return (fbm(x * 0.08, y * 0.1, seed) - 0.42) * 1.2 * sm(1.2, 5, clearAt(x, y)) + (fbm(x * 0.6, y * 0.6, seed + 3) - 0.5) * 0.2 * k; },
      mat:function(x, y){ var l = lake(x, y); if (l > 0) return ['lava', { dep:l }]; if (l > -0.9) return ['lip', { z:-l }]; return ['cinder']; },
      build:function(B){
        volGlow(B, glow, 5);
        B.light(fx, fy, 1.6, '#ffb43a'); B.light(fx, fy, 3.2, '#ff7a1a');
        B.vox(fx - 2.2, fy - 1.2, -0.6, fx + 2.2, fy + 1.2, 4.6, function(set){   // the fire fountain: a column of lava and the spatter falling off it
          for (var z = -0.4; z < 3.6; z += set.st){ var r = 0.45 * (1 - z / 4.2); B.blob(set, fx + Math.sin(z * 2) * 0.1, fy, z, r, r * 0.8, set.st, z > 2.6 ? '#ffe28a' : z > 1.2 ? '#ffb43a' : '#ff7a1a'); }
          for (var j = 0; j < 14; j++){ var a = j / 14 * 6.28 + seed, u = 0.4 + hash(j, seed, 3) * 1.4, px = fx + Math.cos(a) * u, py = fy + Math.sin(a) * u * 0.5, pz = 3.6 - u * u * 0.9;
            B.blob(set, px, py, pz, 0.16, 0.14, 0.16, j % 3 ? '#ff9a2a' : '#ffd25a'); } });
        if (shrine){ var X = shrine.x, Y = shrine.y, zb = B.gz(X, Y);
          B.solid(X - 2, Y - 1.4, zb - 0.1, X + 2, Y + 1.4, zb + 0.5, function(px, py, pz){ var t = pz - zb, dx = px - X, dy = py - Y;   // the platform of dressed stone, a step to the front
            if (Math.abs(dx) > 1.9 || Math.abs(dy) > 1.3) return null; if (dy > 0.9 && t > 0.22) return null; if (t > 0.42) return null;
            return (Math.abs(((dx + 9) % 0.9) - 0.45) > 0.41 || Math.abs(t - 0.22) < 0.03) ? '#2a2427' : '#4a4246'; });
          volTiki(B, X, Y - 0.6, 2.6, ['#5a5056', '#4a4246', '#3a3337']);
          [-1.35, 1.35].forEach(function(o){ var bx = X + o, by = Y - 0.2, bz = zb + 0.42; B.light(bx, by, bz + 1.6, '#ff8a2a');   // the braziers
            B.solid(bx - 0.4, by - 0.4, bz, bx + 0.4, by + 0.4, bz + 1.9, function(px, py, pz){ var r = Math.hypot(px - bx, py - by), t = pz - bz;
              if (t < 1.1) return r < 0.14 ? '#3a3337' : null; if (t < 1.4) return r < 0.36 && r > 0.1 + (t - 1.1) ? '#1e1a1d' : r < 0.36 ? '#2a2427' : null;
              return r < 0.3 * (1 - (t - 1.4) / 0.5) ? (t > 1.65 ? '#ffd25a' : '#ff7a1a') : null; }); }); }
        shards.forEach(function(s, k){ volShards(B, s.x, s.y, 0.8 + hash(k, seed, 9) * 0.4, seed + k); });
      },
      fill:{ on:['cinder'], trees:0.08, lows:0.3, tree:function(B, x, y, i){ volColumns(B, x, y, 0.9, 1.6 + hash(i, seed, 51) * 1.4, i + seed); },
        low:function(B, x, y, i){ var k = hash(i, seed, 53); if (k < 0.4) volRock(B, x, y, 0.34, ['#2a2226', '#3a2e30'], '#ff6a1a'); else if (k < 0.7) volShards(B, x, y, 0.32, i + seed); else volRock(B, x, y, 0.38, ['#3a2a2a', '#4a3430']); } },
      bg:'#2a1a16', gain:1.9,
      mats:{ cinder:['#3a2a2a', '#4a2e28', '#2a2022', 0, function(c, R){ var a = blot(c, 0.07, seed + 7), b = blot(c, 0.15, seed + 8); return R(a > 0.72 ? '#5a3424' : a > 0.6 ? '#4a2e28' : b < 0.3 ? '#2a2022' : '#3a2a2a'); }],
        lip:['#2a2427', '#3e3639', '#1e1a1d', 0, function(c, R){ var z = c.z || 0; return R(z < 0.12 ? '#ff7a1a' : z < 0.25 ? '#8a3012' : blot(c, 0.2, seed + 9) > 0.55 ? '#3e3639' : '#2a2427'); }],
        lava:volLake(seed + 10) }
    };
  }
  /* ---------------- SKY ISLANDS IS A JOURNEY. The owner (2026-10-15) asked for every world to vary as you move through it,
     the way Pirate Cove does. Sky Islands climbs from where the balloons go up to the castle at the top: the launch meadow
     with its balloons and haystacks (1 to 4), the cloud docks where the airships tie up (5 to 8), the floating gardens with
     water spilling off their edges (9 to 12), the old sky ruins with their gates and a rainbow (13 to 16), and the cloud
     mill and the castle in the clouds (17 and 18). Every stop is islands over a drop to the clouds, never solid country.
     A hole with no place (a daily, a season) keeps the old island. */
  STOPS.sky = [[1, 'meadow'], [5, 'docks'], [9, 'gardens'], [13, 'ruins'], [17, 'castle']];
  FLY['sky~meadow'] = 'song'; FLY['sky~docks'] = FLY['sky~castle'] = 'gull'; FLY['sky~gardens'] = 'butterfly'; FLY['sky~ruins'] = 'crow';
  (function(){ var base = BUILD.sky; BUILD.sky = function(L){ var s = L.stop; return s === 'meadow' ? skyMeadow(L) : s === 'docks' ? skyDocks(L) : s === 'gardens' ? skyGardens(L) : s === 'ruins' ? skyRuins(L) : s === 'castle' ? skyCastle(L) : base(L); }; })();

  /* the islands under a Sky Islands hole: the course's own island (o.rim says how far it reaches past the rail), any other
     islands (o.pads, ellipses with their own height) behind and beside it, a face of earth and rock under every edge, and
     the clouds far below. inside() is how far a point is in from the nearest edge, and the height of the island it is on. */
  function skyIsle(L, o){
    var seed = L.seed, clearAt = L.clearAt, pads = o.pads || [], lx = NaN, ly = NaN, lv = null;
    function inside(x, y){ if (x === lx && y === ly) return lv; var best = o.rim(x, y) - clearAt(x, y), top = 0;
      for (var i = 0; i < pads.length; i++){ var p = pads[i], q = (1 - Math.hypot((x - p.x) / p.rx, (y - p.y) / p.ry)) * Math.min(p.rx, p.ry) + (vn(x * 0.45, y * 0.45, seed + 5 + i) - 0.5) * 0.7;
        if (q > best){ best = q; top = p.z; } }
      lx = x; ly = y; return lv = [best, top]; }
    function cloudH(x, y){ return -2.9 + fbm(x * 0.09, y * 0.13, seed + 31) * 1.1 + Math.pow(vn(x * 0.21, y * 0.27, seed + 32), 3) * 0.9; }   // a floor of cloud, heaped here and there
    /* The edge is a sheer drop: the ground's face below a lip is filled in by hole3d (a slope steeper than about one in
       one and a half leaves the sky showing through between its rows, so there is no slope at all). The face takes the
       lip's colour, so the last sliver of every island is rock (o.face can make it a waterfall). */
    return { inside:inside, cloudH:cloudH,
      h:function(x, y){ var r = inside(x, y); if (r[0] >= 0) return r[1] + (o.top ? o.top(x, y, r) : 0); return cloudH(x, y); },
      mat:function(x, y){ var r = inside(x, y); if (r[0] >= 0.22) return o.ground(x, y, r); if (r[0] >= 0) return o.face ? o.face(x, y, r) : ['cliff']; return ['cloud']; },
      // somewhere on an island, at least need in from its edge
      on:function(need){ return function(x, y){ return inside(x, y)[0] > need; }; } };
  }
  // the island's sides and the clouds below, the same at every stop: a face of pale rock, and the clouds in smooth drifts
  function skyBelow(seed){ return {
    cliff:['#b8a07e', '#c4ae8c', '#9a8468', 0, function(c, R){ var a = vn(c.ti * 0.09, c.tj * 0.2, seed + 43), b = vn(c.ti * 0.35, c.tj * 0.35, seed + 44); return R(a > 0.66 ? '#a08a6a' : b > 0.6 ? '#c8b392' : '#b8a07e'); }],
    cloud:['#ffffff', '#f2f7fc', '#dde9f5', 0, function(c, R){ var a = blot(c, 0.04, seed + 41), b = blot(c, 0.12, seed + 42);
      return R(a < 0.3 ? '#dbe7f5' : a < 0.4 ? '#e8f0f9' : a > 0.72 ? '#ffffff' : b > 0.62 ? '#fafcff' : b < 0.32 ? '#edf3fa' : '#f4f8fc'); }] }; }
  // the first x out from x0 (going dir) where the drop is at least need wide, for a thing that floats beside the island
  function skyOff(I, x0, y, dir, need){ var x = x0; for (var n = 0; n < 80 && I.inside(x, y)[0] > -need; n++) x += dir * 0.25; return x; }
  // is a w by d rectangle at x, y all on an island, need in from its edge
  function skyRectOn(I, x, y, w, d, need){ for (var j = 0; j <= 2; j++) for (var i = 0; i <= 2; i++) if (I.inside(x - w / 2 + w * i / 2, y - d / 2 + d * j / 2)[0] < need) return false; return true; }
  function skyMats(seed, own){ var m = skyBelow(seed); for (var k in own) m[k] = own[k]; return m; }
  // grass in smooth patches: base, lighter, darker, and a fourth colour for the odd big patch (clover, wildflowers)
  function skyGrass(seed, C){ return [C[0], C[1], C[2], 0, function(c, R){ var a = blot(c, 0.06, seed + 1), b = blot(c, 0.17, seed + 2);
    return R(a > 0.72 ? C[3] : a < 0.28 ? C[2] : b > 0.64 ? C[1] : b < 0.3 ? C[2] : C[0]); }]; }
  // B as it stands on a floating thing: the ground is wherever z says, so the shared trees and houses can be built up there
  function skyOn(B, z){ var o = {}; for (var k in B) o[k] = B[k]; o.gz = function(){ return z; }; return o; }

  // a hot air balloon: wicker basket, ropes to the mouth, an envelope in twelve gores with a band round it. zb is the basket's floor
  function skyBalloon(B, X, Y, zb, s, cols, lit){ var R0 = 1.25 * s, cz = zb + 2.75 * s, mz = zb + 1.45 * s;
    if (lit && B.light) B.light(X, Y, mz + 0.05, '#ffb03a');   // the burner, lit
    B.solid(X - R0 - 0.1, Y - R0 - 0.1, zb, X + R0 + 0.1, Y + R0 + 0.1, cz + R0 + 0.1, function(px, py, pz){ var dx = px - X, dy = py - Y, r = Math.hypot(dx, dy), t = pz - zb;
      if (t < 0.55 * s) return Math.max(Math.abs(dx), Math.abs(dy)) < 0.36 * s ? (t > 0.47 * s ? '#5a3a1e' : (Math.floor(t / s * 9) % 2 ? '#b08a52' : '#9a7444')) : null;
      if (pz < mz){ var k = (t - 0.55 * s) / (mz - zb - 0.55 * s), cr = 0.32 * s + k * 0.1 * s; if (k > 0.85 && r < 0.2 * s) return '#3a3a40'; return (Math.abs(Math.abs(dx) - cr) < 0.045 && Math.abs(Math.abs(dy) - cr) < 0.045) ? '#4a3a2a' : null; }
      var rad = pz > cz ? Math.sqrt(Math.max(0, R0 * R0 - (pz - cz) * (pz - cz))) : R0 * (0.3 + 0.7 * Math.sin((pz - mz) / (cz - mz) * 1.5708)); if (r > rad) return null;
      if (Math.abs(pz - cz + 0.3 * s) < 0.13 * s) return cols[2]; return Math.floor((Math.atan2(dy, dx) + 3.1416) / 6.2832 * 12) % 2 ? cols[0] : cols[1]; }); }
  var SKY_BALLOON = [['#ff5a3c', '#ffd23f', '#ffffff'], ['#3fa7e0', '#ffffff', '#ffd23f'], ['#7dd56f', '#ffd23f', '#ff5a3c'], ['#a86ad8', '#ffffff', '#ff8ab0'], ['#ff8a2a', '#fff2c4', '#3fa7e0']];
  // a floating islet: a cap of turf and a tapering underside of earth and rock, hanging over the clouds
  function skyIslet(B, X, Y, zt, r, k){ var dep = r * 1.5;
    B.solid(X - r - 0.3, Y - r - 0.3, zt - dep - 0.2, X + r + 0.3, Y + r + 0.3, zt + 0.05, function(px, py, pz){ var dx = px - X, dy = py - Y, a = Math.atan2(dy, dx);
      var rr = Math.hypot(dx, dy * 1.15) / (r * (0.88 + vn(a * 1.6 + 3, k, 7) * 0.24)); if (rr > 1) return null; var t = zt - pz, d = dep * (1 - Math.pow(rr, 1.6)) * (0.75 + vn(dx * 0.9, dy * 0.9, k) * 0.4);
      if (t > d) return null; if (t < 0.18) return rr > 0.92 ? '#4f9a42' : '#5fae4e'; if (t < 0.5) return '#6a4a2c';
      return Math.floor(t * 2.6 + vn(dx, dy, k + 1) * 1.5) % 2 ? '#9a8668' : '#857256'; }); }
  // water falling off an edge into the clouds: a sheet from (X, Y, zt) down to zb, streaked white and pale blue
  function skyFall(B, X, Y, zt, zb, w){
    B.solid(X - w / 2 - 0.1, Y - 0.25, zb, X + w / 2 + 0.1, Y + 0.35, zt + 0.05, function(px, py, pz){ var dx = px - X, f = (zt - pz) / (zt - zb), ww = w / 2 * (1 + f * 0.35);
      if (Math.abs(dx) > ww || Math.abs(py - Y - f * 0.2) > 0.12) return null; var s = vn(dx * 5, pz * 0.6, 9); return f > 0.85 ? '#ffffff' : s > 0.62 ? '#ffffff' : s < 0.35 ? '#9fd8ee' : '#c8ecf8'; }); }
  // little islets far off in the open cloud in front of and beside the island, low down, so the drop has some depth
  function skyFar(L, I, B){ var P0 = L.P0, P1 = L.P1, E = L.E, seed = L.seed;
    for (var i = 0; i < 3; i++){ var sd = i === 1 ? 1 : -1, r = 0.8 + hash(i, seed, 71) * 0.5, y = i === 2 ? P1[1] + 2.4 : P1[1] - 1 - hash(i, seed, 72) * 3, x = i === 2 ? L.cx + (hash(seed, 73, i) - 0.5) * 6 : (sd < 0 ? P0[0] : P1[0]);
      for (var n = 0; n < 40 && I.inside(x, y)[0] > -r - 1; n++) x += sd * 0.3;
      if (x < E[0] + r || x > E[2] - r || y > E[3] - r || I.inside(x, y)[0] > -r - 1) continue;
      var z = -1.3 + hash(i, seed, 74) * 0.8; skyIslet(B, x, y, z, r, seed + 70 + i); if (hash(i, seed, 75) < 0.6) bush(skyOn(B, z), x + 0.2, y, 0.35, ['#3f9a46', '#5bb352', '#2f8139']); } }
  // a tree with its foot at height zb (on a floating islet), or on the ground when zb is null
  function skyTree(B, x, y, H, leaves, k, zb){ broadTree(zb == null ? B : skyOn(B, zb), x, y, H, '#6a4a2a', leaves, k); }
  // a haystack (k 0) or a round bale lying on its side (k 1)
  function skyHay(B, x, y, k, s){ var zb = B.gz(x, y); s = s || 1;
    if (k === 0) B.solid(x - 0.9 * s, y - 0.9 * s, zb - 0.05, x + 0.9 * s, y + 0.9 * s, zb + 1.5 * s, function(px, py, pz){ var t = (pz - zb) / s, r = Math.hypot(px - x, py - y) / s, w = 0.85 * Math.sqrt(Math.max(0, 1 - Math.pow(t / 1.45, 2.2)));
      if (r > w) return null; if (t > 1.3) return '#c89a3a'; return Math.floor(t * 4 + vn(px * 3, py * 3, 5) * 0.8) % 2 ? '#e2bc5c' : '#d4aa48'; });
    else B.solid(x - 0.8 * s, y - 0.6 * s, zb - 0.05, x + 0.8 * s, y + 0.6 * s, zb + 1.1 * s, function(px, py, pz){ var dx = (px - x) / s, r = Math.hypot((py - y) / s, (pz - zb) / s - 0.52);
      if (r > 0.52 || Math.abs(dx) > 0.7) return null; if (Math.abs(dx) > 0.62) return Math.floor(r * 14) % 2 ? '#c89a3a' : '#e2bc5c'; return Math.abs(Math.abs(dx) - 0.3) < 0.04 ? '#8a5a2a' : '#dcb452'; }); }

  /* 1. THE LAUNCH MEADOW (and the meadow is where the balloons go up): one broad island of grass running back to the
     horizon, balloons standing ready on it with their burners lit, more already up over the clouds either side, and the
     hay that keeps the field (and catches a bad landing) in stacks and bales. */
  function skyMeadow(L){
    var E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot;
    var I = skyIsle(L, { rim:function(x, y){ return 2.4 + (fbm(x * 0.15, y * 0.15, seed + 3) - 0.5) * 1.6 + Math.max(0, P0[1] - y) * 1.2; },
      top:function(x, y, r){ return (fbm(x * 0.07, y * 0.09, seed + 2) - 0.45) * 0.7 * sm(1.4, 6, clearAt(x, y)) * sm(0, 2, r[0]); },
      ground:function(x, y, r){ return ['grass']; } }), on = I.on;
    var up = []; for (var i = 0; i < 3; i++){ var b = spot(1.6, function(x, y){ return -Math.abs(y - P0[1] + 2.5) * 0.5 - Math.abs(clearAt(x, y) - 3.8) * 0.6 + hash(x | 0, y | 0, seed + 10 + i) * 2; }, on(1.6)); if (b) up.push(b); }
    var aloft = []; for (i = 0; i < 2; i++){ var sx = i ? 1 : -1, ay = (P0[1] + P1[1]) / 2 - 2 + (hash(i, seed, 4) - 0.5) * 6, ax = skyOff(I, sx < 0 ? P0[0] : P1[0], ay, sx, 2.2 + hash(seed, i, 3) * 1.2);
      if (I.inside(ax, ay)[0] < -1) aloft.push({ x:ax, y:ay }); }
    var stacks = []; for (i = 0; i < 5; i++){ var q = spot(0.9, function(x, y){ return L.side(x) * 2 - Math.abs(clearAt(x, y) - 2.2) * 0.8 + hash(x * 3 | 0, y * 3 | 0, seed + 20 + i); }, on(0.9)); if (q) stacks.push(q); }
    var flag = spot(0.4, function(x, y){ return -Math.abs(clearAt(x, y) - 1.8) + L.north(x, y) * 0.2 + hash(x * 3 | 0, y * 3 | 0, seed + 30); }, on(0.6));
    return {
      h:I.h, mat:I.mat,
      build:function(B){
        skyFar(L, I, B);
        up.forEach(function(p, n){ skyBalloon(B, p.x, p.y, B.gz(p.x, p.y), 1.15, SKY_BALLOON[((n + seed) % 5 + 5) % 5], true); });
        aloft.forEach(function(p, n){ skyBalloon(B, p.x, p.y, 2.2 + n * 1.6, 0.95, SKY_BALLOON[((n + seed + 3) % 5 + 5) % 5], true); });
        stacks.forEach(function(p, n){ skyHay(B, p.x, p.y, n % 3 === 2 ? 1 : 0, 0.9 + hash(n, seed, 5) * 0.3); });
        if (flag){ var zb = B.gz(flag.x, flag.y);   // the launch flag: a striped windsock on a pole, blowing east
          B.solid(flag.x - 0.15, flag.y - 0.2, zb, flag.x + 1.3, flag.y + 0.2, zb + 2.8, function(px, py, pz){ var t = pz - zb, dx = px - flag.x;
            if (Math.hypot(dx, py - flag.y) < 0.05 && t < 2.7) return '#e8e2d0'; var rr = 0.16 - dx * 0.05; if (dx > 0.05 && dx < 1.2 && Math.hypot(py - flag.y, t - 2.45 + dx * 0.08) < rr) return Math.floor(dx * 4) % 2 ? '#ff5a3c' : '#ffffff'; return null; }); }
      },
      fill:{ on:['grass'], trees:0.16, lows:0.2, tree:function(B, x, y, i){ skyTree(B, x, y, 2.8 + hash(i, seed, 31) * 1.2, ['#3f9a46', '#2f8139', '#5bb352'], i); },
        low:function(B, x, y, i){ var k = hash(i, seed, 33); if (k < 0.45) skyHay(B, x, y, 1, 0.75); else bush(B, x, y, 0.4, ['#3f9a46', '#5bb352', '#2f8139']); } },
      bg:'#8fcdf3', gain:2,
      mats:skyMats(seed, { grass:skyGrass(seed, ['#66b952', '#74c45c', '#58a848', '#9ccc5a']) })
    };
  }

  // a gabled shed (the dock office, the mill house) with a weather vane on its ridge when vane is set
  function skyShed(B, r, wall, roof, vane){ var d = r.d;
    house(B, r, { wh:2.2, rh:1.4, step:'#8a6a44', wall:function(dx, dy, t){ if (dy > d / 2 - 0.15 && Math.abs(dx) < 0.42 && t < 1.65) return '#4a2e1c';
        if (dy > d / 2 - 0.15 && Math.abs(Math.abs(dx) - 1.2) < 0.34 && t > 0.85 && t < 1.5) return Math.abs(t - 1.17) < 0.04 ? '#ffffff' : '#ffe08a'; return wall(dx, dy, t); },
      roof:function(dx, dy, t, rr, eave){ return eave ? '#3a3e46' : roof(dx, dy, t); } });
    if (!vane) return; var X = r.x, Y = r.y, z0 = B.gz(X, Y) + 2.2 + 1.4;   // the weather vane: a rod, the four points, and the arrow on top
    if (B.light) B.light(X - r.w * 0.3, Y + d / 2 + 0.1, B.gz(X, Y) + 1.2, '#ffd77a');
    B.solid(X - 1.2, Y - 0.6, z0 - 0.1, X + 1.2, Y + 0.6, z0 + 1.9, function(px, py, pz){ var dx = px - X, dy = py - Y, t = pz - z0;
      if (Math.hypot(dx, dy) < 0.05 && t < 1.7) return '#2a2a30';
      if (Math.abs(t - 1.0) < 0.04 && ((Math.abs(dy) < 0.04 && Math.abs(dx) < 0.5) || (Math.abs(dx) < 0.04 && Math.abs(dy) < 0.5))) return '#2a2a30';
      if (Math.abs(t - 1.0) < 0.1 && (Math.hypot(Math.abs(dx) - 0.5, dy) < 0.09 || Math.hypot(dx, Math.abs(dy) - 0.5) < 0.09)) return '#e0b040';
      if (Math.abs(dy) < 0.04 && Math.abs(t - 1.45) < 0.05 && Math.abs(dx) < 0.85) return '#e0b040';
      if (Math.abs(dy) < 0.04 && dx > 0.6 && dx < 1.05 && Math.abs(t - 1.45) < (1.05 - dx) * 0.45) return '#e0b040';   // the arrow's head
      if (Math.abs(dy) < 0.04 && dx < -0.55 && dx > -1.0 && t > 1.45 && t < 1.45 + (dx + 1.0) * 0.9 + 0.05) return '#e0b040';   // its tail
      return null; }); }

  // an airship moored nose to its mast: a cream envelope with a red band, four fins, the gondola with lit windows and a propeller
  function skyAirship(B, X, Y, Z, dir, s){ var a = 3.6 * s, rb = 1.25 * s;
    B.solid(X - a - 0.4, Y - rb - 0.9, Z - rb - 1.3 * s, X + a + 0.4, Y + rb + 0.9, Z + rb + 1.0, function(px, py, pz){ var u = (px - X) * dir, dy = py - Y, dz = pz - Z;
      var e = Math.hypot(u / a, dy / rb, dz / rb); if (e < 1){ var ring = Math.abs(u / a - 0.55) < 0.06 || Math.abs(u / a + 0.62) < 0.05; if (ring) return '#d8402e';
        return Math.floor((Math.atan2(dz, dy) + 3.1416) * 2.6) % 2 ? '#f2ead8' : '#e6dcc4'; }
      if (u < -a * 0.62 && u > -a - 0.35){ var k = (-a * 0.62 - u) / (a * 0.38 + 0.35), fh = rb * (0.5 + k * 0.7);
        if ((Math.abs(dy) < 0.05 && Math.abs(dz) < fh) || (Math.abs(dz) < 0.05 && Math.abs(dy) < fh)) return Math.abs(dz) > fh - 0.25 || Math.abs(dy) > fh - 0.25 ? '#d8402e' : '#c9bfa6'; }
      var gz = dz + rb + 0.62 * s; if (Math.abs(u) < 1.15 * s && Math.abs(dy) < 0.38 * s && gz > -0.32 * s && gz < 0.32 * s){   // the gondola
        if (dy > 0.3 * s && Math.abs(gz) < 0.12 * s && ((u / s + 2) % 0.5) < 0.3) return '#ffe08a'; return gz > 0.22 * s ? '#5a3a1e' : '#8a5a34'; }
      if (Math.abs(u) < 0.9 * s && Math.abs(dy) < 0.05 && gz >= 0.32 * s && gz < 0.62 * s && Math.abs(Math.abs(u) - 0.6 * s) < 0.05) return '#4a3a2a';
      if (Math.abs(u + 1.3 * s) < 0.05 && Math.abs(dy) < 0.05 + 0 && Math.abs(gz) < 0.42 * s) return '#3a3a40';   // the propeller
      return null; });
    if (B.light) B.light(X, Y + 0.4 * s, Z - rb - 0.62 * s, '#ffd77a'); }

  /* 2. THE CLOUD DOCKS: where the airships tie up. A pier of planks runs out over the drop from the back of the island to
     a mooring mast, an airship rides at it, the dock office with its weather vane stands on the bank, hay bales and
     crates wait for loading, and a rope bridge crosses to a little islet with its own lamp. */
  function skyDocks(L){
    var E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot, spotRect = L.spotRect;
    var sx = hash(seed, 2, 3) < 0.5 ? -1 : 1, edge = sx < 0 ? P0[0] : P1[0], wedge = sx < 0 ? P1[0] : P0[0];
    var isle = { x:edge + sx * 2.4, y:P0[1] - 4.8, rx:1.9, ry:1.6, z:0 };   // the islet off the back corner, over the bridge
    var bank = { x:wedge - sx * 1.0, y:P0[1] - 3.2, rx:4.2, ry:3.4, z:0 };   // the bank the office stands on, the other back corner
    var I = skyIsle(L, { pads:[isle, bank], rim:function(x, y){ return 2.2 + (fbm(x * 0.15, y * 0.15, seed + 3) - 0.5) * 1.2 + ((x - L.cx) * sx < 0 ? Math.max(0, P0[1] - y) * 0.5 : 0); },
      top:function(x, y, r){ return (fbm(x * 0.08, y * 0.1, seed + 2) - 0.45) * 0.5 * sm(1.4, 5, clearAt(x, y)) * sm(0, 2, r[0]); },
      ground:function(x, y, r){ var c = clearAt(x, y); if (c < 1.3 && c > 0) return ['boards', { u:y }]; return ['grass']; } }), on = I.on;
    L.used.push({ x:isle.x, y:isle.y, r:1.8 });
    // the pier: out from the back of the island, north, to the mast
    var pierX = L.cx + sx * Math.min(1.5, (P1[0] - P0[0]) * 0.12), pierY0 = P0[1] - 1; while (pierY0 > E[1] + 2 && I.inside(pierX, pierY0)[0] > -0.2) pierY0 -= 0.25;
    var mastY = Math.max(E[1] + 1.6, pierY0 - 4.5), shipX = pierX - sx * 4.2, shipZ = 2.6;
    L.used.push({ x:pierX, y:(pierY0 + mastY) / 2, r:1.2 }); L.used.push({ x:pierX, y:pierY0 + 1, r:1.4 });
    var office = null; for (var oy = bank.y - 1.6; oy <= bank.y + 1 && !office; oy += 0.5) for (var ox = -1; ox <= 2 && !office; ox += 0.5){ var cx0 = bank.x - sx * ox;
      if (skyRectOn(I, cx0, oy, 3.8, 3, 0.2) && clearAt(cx0, oy) > 2.6 && Math.abs(cx0 - pierX) > 2.8) office = { x:cx0, y:oy, w:3.4, d:2.6 }; }
    if (office) L.used.push({ x:office.x, y:office.y, r:2.3 });
    var cargo = []; for (var i = 0; i < 6; i++){ var q = spot(0.6, function(x, y){ return -Math.abs(clearAt(x, y) - 2.2) * 0.7 - Math.abs(x - pierX) * 0.15 + hash(x * 3 | 0, y * 3 | 0, seed + 9 + i); }, on(0.8)); if (q) cargo.push(q); }
    var lamps = []; for (i = 0; i < 3; i++){ var lp = spot(0.35, function(x, y){ return -Math.abs(clearAt(x, y) - 1.6) + hash(x * 3 | 0, y * 3 | 0, seed + 50 + i); }, on(0.5)); if (lp) lamps.push(lp); }
    return {
      h:I.h, mat:I.mat,
      build:function(B){
        skyFar(L, I, B);
        var zt = B.gz(pierX, pierY0 + 1.5), deck = zt + 0.05;
        B.solid(pierX - 0.95, mastY - 0.9, B.gz(pierX, mastY) - 0.6, pierX + 0.95, pierY0 + 1.6, deck + 1.1, function(px, py, pz){ var dx = px - pierX, t = pz - deck;   // planks, rails and the long posts down to the clouds
          if (t > -0.16 && t < 0 && Math.abs(dx) < 0.85) return Math.floor(py * 3) % 2 ? '#a8763f' : '#946238';
          var post = Math.abs(Math.abs(dx) - 0.78) < 0.08 && ((py % 1.8 + 1.8) % 1.8) < 0.16; if (post && t < 1.0) return '#5a3a1e';
          if (Math.abs(Math.abs(dx) - 0.78) < 0.05 && Math.abs(t - 0.9) < 0.05) return '#7a5230'; return null; });
        var mz = deck, mx = pierX, my = mastY;   // the mooring mast: four legs to a platform, the cap, and the line to the nose
        B.solid(mx - 0.8, my - 0.8, mz - 0.1, mx + 0.8, my + 0.8, mz + shipZ + 1.2, function(px, py, pz){ var t = pz - mz, w = 0.7 - t * 0.12, dx = px - mx, dy = py - my;
          if (t > shipZ + 0.6) return Math.hypot(dx, dy) < 0.25 ? (t > shipZ + 0.95 ? '#d8402e' : '#3a3a40') : null;
          if (Math.abs(Math.abs(dx) - w) < 0.06 && Math.abs(Math.abs(dy) - w) < 0.06) return '#4a4a52';
          if ((Math.abs(Math.abs(dx) - w) < 0.04 || Math.abs(Math.abs(dy) - w) < 0.04) && Math.abs(((t % 0.8) + 0.8) % 0.8 - 0.4) < 0.04 && Math.max(Math.abs(dx), Math.abs(dy)) <= w + 0.06) return '#5a5a62'; return null; });
        if (B.light) B.light(mx, my, mz + shipZ + 1.1, '#ff6a4a');
        skyAirship(B, shipX, my - 0.2, zt + shipZ + 0.3, sx, 1);
        if (office) skyShed(B, office, function(dx, dy, t){ return Math.floor((dx + 9) * 2.4) % 2 ? '#e8e2d0' : '#dcd4bc'; }, function(dx, dy, t){ return Math.floor(t * 4) % 2 ? '#3f7fb5' : '#346c9c'; }, true);
        cargo.forEach(function(p, n){ if (n % 3 === 1) pirProp(B, p.x, p.y, 1); else skyHay(B, p.x, p.y, 1, 0.8); });
        lamps.forEach(function(p){ lamp(B, p.x, p.y, '#2a2420', '#ffd77a'); });
        // the rope bridge to the islet, sagging in the middle, plank by plank
        var bx = isle.x - sx * 0.9, ya = isle.y, yb; while (ya < P0[1] && I.inside(bx, ya)[0] > 0.25) ya += 0.25; yb = ya; while (yb < P1[1] && I.inside(bx, yb)[0] < 0.35) yb += 0.25;
        var za = B.gz(bx, ya - 0.3), zb2 = B.gz(bx, yb + 0.2);
        if (yb - ya > 0.5 && yb - ya < 6 && clearAt(bx, yb) > 0.8) B.solid(bx - 0.7, ya - 0.3, Math.min(za, zb2) - 1, bx + 0.7, yb + 0.2, Math.max(za, zb2) + 1.2, function(px, py, pz){
          var u = (py - ya + 0.3) / (yb - ya + 0.5); if (u < 0 || u > 1) return null; var sg = Math.sin(u * 3.1416) * 0.35, zd = za + (zb2 - za) * u - sg, t = pz - zd, dx = px - bx;
          if (t > -0.12 && t < 0 && Math.abs(dx) < 0.55) return Math.floor(py * 3.2) % 3 === 0 ? null : (Math.floor(py * 3.2) % 2 ? '#a8763f' : '#946238');
          if (Math.abs(Math.abs(dx) - 0.58) < 0.045 && Math.abs(t - 0.85 - sg * 0.3) < 0.045) return '#c8b07a';
          if (Math.abs(Math.abs(dx) - 0.58) < 0.045 && t > 0 && t < 0.85 && (((py % 0.8) + 0.8) % 0.8) < 0.07) return '#c8b07a'; return null; });
        lamp(B, isle.x + sx * 0.7, isle.y - 0.3, '#2a2420', '#ffd77a'); skyHay(B, isle.x - sx * 0.2, isle.y - 0.7, 0, 0.8);
      },
      fill:{ on:['grass'], trees:0.14, lows:0.14, tree:function(B, x, y, i){ skyTree(B, x, y, 2.6 + hash(i, seed, 31), ['#3f9a46', '#2f8139', '#5bb352'], i); },
        low:function(B, x, y, i){ if (hash(i, seed, 33) < 0.5) skyHay(B, x, y, 1, 0.7); else bush(B, x, y, 0.38, ['#3f9a46', '#5bb352', '#2f8139']); } },
      bg:'#8fcdf3', gain:2,
      mats:skyMats(seed, { grass:skyGrass(seed, ['#62b450', '#70c05a', '#55a446', '#8cc45a']),
        boards:['#a8763f', '#b88450', '#8a5e30', 0, function(c, R, h3){ var row = c.tj, lap = (c.ti + (row * 7 % 11)) % 14 === 0; return R(lap || row % 3 === 0 ? '#7a5230' : h3(row, c.ti >> 3, 9) < 0.3 ? '#b4824a' : '#a8763f'); }] })
    };
  }

  /* 3. THE FLOATING GARDENS: the island turns to a garden, beds of flowers in the grass and blossom on the trees. A
     terrace stands up behind the hole with a pool on it, and the pool spills over the terrace's face into the clouds.
     Little islands drift either side, each with its tree, and one pours its own waterfall away below it. Kites fly. */
  function skyGardens(L){
    var E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot;
    var tx = L.cx + (hash(seed, 5, 1) - 0.5) * Math.min(6, (P1[0] - P0[0]) * 0.4), terr = { x:tx, y:P0[1] - 8.2, rx:Math.min(5.8, (P1[0] - P0[0]) * 0.45 + 1), ry:2.7, z:1.0 };
    var pool = { x:tx, y:terr.y - 0.3, rx:Math.min(3.2, terr.rx * 0.45), ry:1.3 };
    function poolD(x, y){ return 1 - Math.hypot((x - pool.x) / pool.rx, (y - pool.y) / pool.ry); }
    var I = skyIsle(L, { pads:[terr], rim:function(x, y){ return 2.6 + (fbm(x * 0.15, y * 0.15, seed + 3) - 0.5) * 1.5 ; },
      top:function(x, y, r){ if (r[1] > 0 && poolD(x, y) > 0) return -0.12; return (fbm(x * 0.08, y * 0.1, seed + 2) - 0.45) * 0.5 * sm(1.4, 5, clearAt(x, y)) * sm(0, 2, r[0]); },
      ground:function(x, y, r){ if (r[1] > 0){ var t = poolD(x, y); if (t > 0) return ['jpool', { dep:t }]; if (t > -0.12) return ['stone']; }
        if (r[1] > 0 && vn(x * 0.4, y * 0.4, seed + 12) > 0.6) return ['bed']; return ['grass']; },
      face:function(x, y, r){ if (r[1] > 0 && Math.abs(x - pool.x) < 0.8 + vn(x, 1, seed) * 0.3 && y > terr.y) return ['fall', { u:x }]; return ['cliff']; } }), on = I.on;
    L.used.push({ x:terr.x, y:terr.y, r:Math.min(terr.rx, terr.ry) });
    // the drifting islets: one off each back corner, between the hole's island and the terrace, and one beside the hole
    var islets = [], fs = hash(seed, 9, 1) < 0.5 ? -1 : 1; for (var i = 0; i < 3; i++){ var s0 = i === 2 ? -fs : i ? 1 : -1, r = 1.3 + hash(i, seed, 4) * 0.5, iy = i === 2 ? (P0[1] + P1[1]) / 2 + (hash(i, seed, 3) - 0.5) * 3 : P0[1] - 4 - hash(i, seed, 3) * 1.2;
      var ix = i === 2 ? skyOff(I, s0 < 0 ? P0[0] : P1[0], iy, s0, 0.6) + s0 * (r * 0.8) : (s0 < 0 ? P0[0] + 0.6 : P1[0] - 0.6);
      for (var tr = 0; tr < 12 && I.inside(ix, iy)[0] > -r - 0.5; tr++) ix += s0 * 0.4;
      if (ix > E[0] + r && ix < E[2] - r && I.inside(ix, iy)[0] < -r - 0.5) islets.push({ x:ix, y:iy, r:r, z:0.3 + hash(i, seed, 6) * 1.6, fall:s0 === fs && i < 2 }); }
    var kites = []; for (i = 0; i < 2; i++){ var kq = spot(0.5, function(x, y){ return L.side(x) * 3 - Math.abs(y - P0[1] - 2) * 0.3 + hash(x | 0, y | 0, seed + 60 + i) * 2; }, on(0.6)); if (kq) kites.push(kq); }
    var KITE = [['#ff5a7a', '#ffd23f'], ['#3fa7e0', '#7dd56f']];
    var BLOSSOM = ['#f4a7c0', '#f8c4d6', '#e88aa8'];
    return {
      h:I.h, mat:I.mat,
      build:function(B){
        skyFar(L, I, B);
        var zp = B.gz(pool.x, terr.y + terr.ry - 0.2), zc = B.gz(pool.x, terr.y + terr.ry + 1.2) - 0.3;
        islets.forEach(function(p, n){ skyIslet(B, p.x, p.y, p.z, p.r, seed + n); skyTree(B, p.x + 0.2, p.y - 0.2, 2.2 + p.r * 0.5, n % 2 ? BLOSSOM : ['#3f9a46', '#2f8139', '#5bb352'], n + seed, p.z);
          if (p.fall) skyFall(B, p.x - 0.4, p.y + p.r * 0.75, p.z - 0.05, p.z - 3.6, 0.5); });
        kites.forEach(function(k, n){ var zb = B.gz(k.x, k.y), kx = k.x + (k.x < L.cx ? -1.4 : 1.4), kz = zb + 5.2, c = KITE[n % 2];   // a kite on its string, its tail of bows below it
          B.solid(Math.min(k.x, kx) - 0.8, k.y - 0.2, zb, Math.max(k.x, kx) + 0.8, k.y + 0.2, kz + 1, function(px, py, pz){ var u = (pz - zb) / (kz - zb), sxp = k.x + (kx - k.x) * u;
            if (u <= 1 && Math.abs(px - sxp) < 0.035 && Math.abs(py - k.y) < 0.035) return '#ffffff';
            var dx = px - kx, dz = pz - kz; if (Math.abs(py - k.y) < 0.06 && Math.abs(dx) / 0.55 + Math.abs(dz - 0.25) / 0.75 < 1) return (dx > 0) === (dz > 0.25) ? c[0] : c[1];
            for (var b = 1; b < 4; b++){ var bz = kz - 0.5 - b * 0.4, bx = kx + Math.sin(b * 1.7) * 0.2; if (Math.abs(py - k.y) < 0.05 && Math.hypot(px - bx, pz - bz) < 0.09) return c[b % 2]; }
            return null; }); });
        skyFall(B, pool.x, terr.y + terr.ry + 0.05, zp - 0.1, zc, 1.1);
      },
      fill:{ on:['grass'], trees:0.38, lows:0.3, tree:function(B, x, y, i){ skyTree(B, x, y, 2.6 + hash(i, seed, 31) * 1.3, hash(i, seed, 35) < 0.55 ? BLOSSOM : ['#3f9a46', '#2f8139', '#5bb352'], i); },
        low:function(B, x, y, i){ var k = hash(i, seed, 33); bush(B, x, y, 0.4, k < 0.4 ? ['#3f9a46', '#f4a7c0', '#2f8139'] : k < 0.7 ? ['#3f9a46', '#ffd23f', '#5bb352'] : ['#2f8139', '#a86ad8', '#3f9a46']); } },
      bg:'#8fcdf3', gain:2,
      mats:skyMats(seed, { grass:skyGrass(seed, ['#5cb24c', '#6abe56', '#4fa042', '#7cc85e']),
        bed:['#c85a8a', '#f4a7c0', '#ffd23f', 0, function(c, R){ var a = blot(c, 0.16, seed + 13), b = blot(c, 0.45, seed + 19); return R(b < 0.3 ? '#4f9a42' : a > 0.6 ? '#ffd23f' : a < 0.38 ? '#b07ae0' : '#f48aae'); }],
        stone:['#d8d0bc', '#e6dfcc', '#bcb39c', 0, function(c, R){ return R(blot(c, 0.25, seed + 14) > 0.55 ? '#e2dac6' : '#cfc6b0'); }],
        jpool:['#3fa8c8', '#7fd4e8', '#2a8aae', 0.06, function(c, R){ var d = c.dep || 0; return R(d < 0.15 ? '#9fe0ee' : d < 0.5 ? '#3fa8c8' : '#2a8aae'); }],
        fall:['#c8ecf8', '#ffffff', '#9fd8ee', 0, function(c, R){ var s = vn(c.ti * 0.45, c.tj * 0.04, seed + 15); return R(s > 0.6 ? '#ffffff' : s < 0.36 ? '#9fd8ee' : '#c8ecf8'); }] })
    };
  }

  // a marble column, standing to H or broken off at it
  function skyColumn(B, x, y, H, broken){ var zb = B.gz(x, y);
    B.solid(x - 0.55, y - 0.55, zb - 0.05, x + 0.55, y + 0.55, zb + H + 0.3, function(px, py, pz){ var dx = px - x, dy = py - y, t = pz - zb, top = broken ? H - 0.25 + vn(dx * 4, dy * 4, 3) * 0.5 : H;
      if (t > top) return null; if (t < 0.25 || (!broken && t > H - 0.25)) return Math.max(Math.abs(dx), Math.abs(dy)) < 0.5 ? '#e8e2d2' : null;
      var r = Math.hypot(dx, dy); if (r > 0.36) return null; return Math.floor((Math.atan2(dy, dx) + 3.1416) * 2.2) % 2 ? '#f2eee2' : '#ddd6c4'; }); }
  // the old gate: two pillars and a lintel with a gold sun on it, stood on the ground or on an islet at zb
  function skyGate(B, x, y, zb, s){
    B.solid(x - 2 * s, y - 0.45 * s, zb - 0.05, x + 2 * s, y + 0.45 * s, zb + 4.4 * s, function(px, py, pz){ var dx = (px - x) / s, dy = (py - y) / s, t = (pz - zb) / s;
      if (Math.abs(dy) > 0.4) return null; var leg = Math.abs(Math.abs(dx) - 1.45) < 0.38;
      if (t > 3.5 && t < 4.3 && Math.abs(dx) < 1.95){ if (dy > 0.25 && Math.hypot(dx, t - 3.9) < 0.28) return '#ffd23f'; return t > 4.15 ? '#cfc6b0' : '#e8e2d2'; }
      if (t > 3.2 && t <= 3.5 && Math.abs(dx) < 1.75) return '#ddd6c4';
      if (leg && t <= 3.2) return t < 0.3 ? '#cfc6b0' : (Math.floor(t * 2.2) % 2 ? '#f2eee2' : '#e4dece'); return null; }); }

  /* 4. THE SKY RUINS: what is left of the people who lived up here. White stone paving broken up by grass, columns
     standing and fallen, the old gates (one on its own islet, floating), clefts where the island has cracked through to
     the clouds, braziers lit on the old stones, and a rainbow over the clouds behind. */
  function skyRuins(L){
    var E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot;
    var gs = hash(seed, 4, 4) < 0.5 ? -1 : 1, gate = { x:L.cx + gs * Math.min(4, (P1[0] - P0[0]) * 0.25), y:P0[1] - 2.3 };
    var clefts = [{ s:-1, y:P0[1] + (P1[1] - P0[1]) * (0.25 + hash(seed, 1, 8) * 0.5) }, { s:1, y:P0[1] + (P1[1] - P0[1]) * (0.25 + hash(seed, 2, 8) * 0.5) }];
    var I = skyIsle(L, { rim:function(x, y){ var n = 2.6 + (fbm(x * 0.15, y * 0.15, seed + 3) - 0.5) * 1.5 + Math.max(0, P0[1] - y) * 0.2;
        var c = clearAt(x, y); for (var k = 0; k < clefts.length; k++){ var q = clefts[k]; if ((x - L.cx) * q.s > 0 && c > 0.9) n -= 4 * sm(1.1 + (c - 0.9) * 0.5, 0.6 + (c - 0.9) * 0.5, Math.abs(y - q.y)); }   // the clefts, cracked in from the edge
        return n; },
      top:function(x, y, r){ return (fbm(x * 0.08, y * 0.1, seed + 2) - 0.45) * 0.5 * sm(1.4, 5, clearAt(x, y)) * sm(0, 2, r[0]); },
      ground:function(x, y, r){ var a = fbm(x * 0.18, y * 0.18, seed + 7); return a > 0.5 || clearAt(x, y) < 1.6 ? ['flag'] : ['grass']; } }), on = I.on;
    var gok = I.inside(gate.x, gate.y)[0] > 0.5 && I.inside(gate.x - 1.5, gate.y)[0] > 0.3 && I.inside(gate.x + 1.5, gate.y)[0] > 0.3 && clearAt(gate.x, gate.y) > 1.6; if (gok) L.used.push({ x:gate.x, y:gate.y, r:2 });
    var fl = { y:P0[1] - 4.4, z:2.4, x:gs < 0 ? P1[0] - 0.4 : P0[0] + 0.4 }; for (var fq = 0; fq < 30 && I.inside(fl.x, fl.y)[0] > -2.2; fq++) fl.x -= gs * 0.3;
    var cols = []; for (var i = 0; i < 6; i++){ var q = spot(0.6, function(x, y){ if (y > P0[1] + (P1[1] - P0[1]) * 0.55) return -1e4; return L.north(x, y) * 0.25 + L.side(x) * 2 - Math.abs(clearAt(x, y) - 3) * 0.4 + hash(x * 2 | 0, y * 2 | 0, seed + 20 + i) * 1.5; }, on(0.7)); if (q && q.y < P0[1] + (P1[1] - P0[1]) * 0.55) cols.push(q); }
    var fires = []; for (i = 0; i < 3; i++){ var f = spot(0.4, function(x, y){ return -Math.abs(clearAt(x, y) - 1.8) + hash(x * 3 | 0, y * 3 | 0, seed + 50 + i); }, on(0.5)); if (f) fires.push(f); }
    var RAIN = ['#ff5a5a', '#ff9a3a', '#ffd23f', '#6ad26a', '#3fa7e0', '#7a6ad8'];
    return {
      h:I.h, mat:I.mat,
      build:function(B){
        skyFar(L, I, B);
        // the rainbow: an arc standing up out of the clouds far behind the hole
        var rx = L.cx + gs * 2, ry = Math.max(E[1] + 0.8, P0[1] - 10), R0 = Math.min(11, (E[2] - E[0]) * 0.36), zc = -3.6;
        B.solid(rx - R0 - 0.2, ry - 0.2, zc, rx + R0 + 0.2, ry + 0.2, zc + R0 + 0.2, function(px, py, pz){ var d = Math.hypot(px - rx, pz - zc), k = (R0 - d) / 0.36;
          if (k < 0 || k >= 6 || Math.abs(py - ry) > 0.15) return null; return RAIN[k | 0]; }, 0.12);
        if (gok) skyGate(B, gate.x, gate.y, B.gz(gate.x, gate.y), 1);
        skyIslet(B, fl.x, fl.y, fl.z, 1.8, seed + 3); skyGate(B, fl.x, fl.y - 0.2, fl.z, 0.6);
        cols.forEach(function(p, n){ skyColumn(B, p.x, p.y, n % 3 === 0 ? 3.4 : 1 + hash(n, seed, 7) * 1.8, n % 3 !== 0); });
        fires.forEach(function(p){ var zb = B.gz(p.x, p.y); if (B.light) B.light(p.x, p.y, zb + 1.3, '#ffc24a');   // a brazier: a stone stem and a bowl of fire
          B.solid(p.x - 0.4, p.y - 0.4, zb, p.x + 0.4, p.y + 0.4, zb + 1.7, function(px, py, pz){ var t = pz - zb, r = Math.hypot(px - p.x, py - p.y);
            if (t < 0.9) return r < 0.14 + (t < 0.15 ? 0.12 : 0) ? '#cfc6b0' : null; if (t < 1.15) return r < 0.34 ? (r > 0.26 || t < 1.0 ? '#b8ae96' : '#ffd23f') : null;
            return r < 0.24 * (1 - (t - 1.15) / 0.55) ? (t < 1.3 ? '#ffd23f' : '#ff9a2a') : null; }); });
      },
      fill:{ on:['grass', 'flag'], trees:0.12, lows:0.3, tree:function(B, x, y, i){ skyTree(B, x, y, 2.6 + hash(i, seed, 31), ['#5aa84c', '#4a9440', '#7cc066'], i); },
        low:function(B, x, y, i){ var k = hash(i, seed, 33); if (k < 0.5) blob(B, x, y, 0.42, 0.4, ['#e4dece', '#d0c8b4', '#ece6d8']); else bush(B, x, y, 0.36, ['#4f9a42', '#5fae4e', '#3f8a38']); } },
      bg:'#9fd2f2', gain:2,
      mats:skyMats(seed, { grass:skyGrass(seed, ['#6ab454', '#78c05e', '#5aa44a', '#94c86a']),
        // worn flagstones, two feet by one and a half, their joints and some grass in the cracks
        flag:['#e2dccb', '#ece6d6', '#cfc6b0', 0, function(c, R){ var row = Math.floor(c.tj / 6), off = row % 2 ? 4 : 0;
          if (c.tj % 6 === 0 || (c.ti + off) % 8 === 0) return R(blot(c, 0.1, seed + 16) > 0.72 ? '#7ab060' : '#c2b8a0'); var a = blot(c, 0.09, seed + 17); return R(a > 0.65 ? '#ece6d6' : a < 0.35 ? '#d6ceb8' : '#e2dccb'); }] })
    };
  }

  /* 5. THE CLOUD MILL AND THE CASTLE IN THE CLOUDS: the top of the world. The castle stands on its own island behind
     the hole, white walls, towers with blue spires and pennants, its windows lit, a stone bridge across the gap to it.
     The cloud mill turns on a knoll to one side. */
  function skyCastle(L){
    var E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot;
    var cw = Math.min(13, (E[2] - E[0]) * 0.5), keep = { x:L.cx + (hash(seed, 3, 3) - 0.5) * 3, y:Math.max(E[1] + 4.4, P0[1] - 8.6), rx:cw / 2 + 1.6, ry:3.8, z:0.6 };
    var ms = hash(seed, 7, 7) < 0.5 ? -1 : 1, mill = { x:ms < 0 ? Math.max(E[0] + 3, P0[0] - 2.6) : Math.min(E[2] - 3, P1[0] + 2.6), y:P0[1] - 2.6, rx:2.6, ry:2.4, z:0 };
    var I = skyIsle(L, { pads:[keep, mill], rim:function(x, y){ return 2.5 + (fbm(x * 0.15, y * 0.15, seed + 3) - 0.5) * 1.4 + Math.max(0, P0[1] - y) * 0.15; },
      top:function(x, y, r){ return (fbm(x * 0.08, y * 0.1, seed + 2) - 0.45) * 0.4 * sm(1.4, 5, clearAt(x, y)) * sm(0, 2, r[0]); },
      ground:function(x, y, r){ if (r[1] === keep.z && Math.abs(x - keep.x) < 1 && y > keep.y + 1) return ['cobble']; return ['grass']; } }), on = I.on;
    L.used.push({ x:keep.x, y:keep.y, r:Math.min(keep.rx, keep.ry) + 0.5 }); L.used.push({ x:mill.x, y:mill.y, r:2.2 });
    var lamps = []; for (var i = 0; i < 2; i++){ var lp = spot(0.35, function(x, y){ return -Math.abs(clearAt(x, y) - 1.6) - Math.abs(x - keep.x) * 0.3 + L.north(x, y) * 0.3 + hash(x * 3 | 0, y * 3 | 0, seed + 50 + i); }, on(0.5)); if (lp) lamps.push(lp); }
    var WHITE = function(px, pz){ var row = Math.floor(pz * 2.2), col = Math.floor(px * 1.2 + (row % 2) * 0.5); return ((pz * 2.2) % 1) < 0.1 ? '#cfc6b0' : (vn(col, row, seed) < 0.3 ? '#e8e2d2' : '#f4f0e4'); };
    function tower(B, x, y, zb, r, H, roof){
      B.solid(x - r - 0.2, y - r - 0.2, zb - 0.1, x + r + 0.2, y + r + 0.2, zb + H + r * 2.6 + 1.2, function(px, py, pz){ var dx = px - x, dy = py - y, rr = Math.hypot(dx, dy), t = pz - zb;
        if (t < H){ if (rr > r) return null; if (dy > r * 0.6 && Math.abs(dx) < 0.16 && Math.abs(((t + 0.4) % 1.6) - 0.8) < 0.3 && t > 1.2) return '#ffd77a'; return WHITE(px + 20, pz); }
        if (t < H + 0.35) return rr < r + 0.15 ? '#ddd6c4' : null; var k = (t - H - 0.35) / (r * 2.4); if (k < 1){ return rr < (r + 0.15) * (1 - k) ? (Math.floor(Math.atan2(dy, dx) * 2.5 + 8) % 2 ? roof[0] : roof[1]) : null; }
        if (rr < 0.04 && t < H + r * 2.4 + 1.1) return '#3a3a40'; if (Math.abs(dy) < 0.04 && dx > 0 && dx < 0.7 && t > H + r * 2.4 + 0.65 && t < H + r * 2.4 + 1.05 - dx * 0.3) return '#ff5a3c'; return null; });
      if (B.light) B.light(x, y + r, zb + H * 0.6, '#ffd77a'); }
    return {
      h:I.h, mat:I.mat,
      build:function(B){
        skyFar(L, I, B);
        var zk = B.gz(keep.x, keep.y), fy = keep.y + 1.6, X = keep.x, hw = cw / 2;
        tower(B, X, keep.y - 1.2, zk, 1.5, 6.4, ['#3f7fd5', '#346cb8']);   // the keep, tallest, at the back
        B.solid(X - hw, fy - 0.5, zk - 0.2, X + hw, fy + 0.5, zk + 4.1, function(px, py, pz){ var dx = px - X, t = pz - zk;   // the curtain wall with its gate and battlements
          if (Math.abs(py - fy) > 0.45) return null; if (t > 3.4){ if (t > 3.9 || (Math.floor((dx + 40) * 1.4) % 2)) return null; }
          if (Math.abs(dx) < 0.85 && t < 2.2 && (t < 1.6 || Math.hypot(dx, t - 1.6) < 0.85)) return py > fy + 0.35 ? '#6a4a2c' : null;
          if (py > fy + 0.3 && Math.abs(Math.abs(dx) - 2.4) < 0.18 && t > 1.6 && t < 2.6) return '#ffd77a'; return WHITE(px + 40, pz); });
        tower(B, X - hw, fy, zk, 1.05, 4.8, ['#3f7fd5', '#346cb8']); tower(B, X + hw, fy, zk, 1.05, 4.8, ['#3f7fd5', '#346cb8']);
        tower(B, X - hw * 0.55, keep.y - 0.4, zk, 0.85, 5.6, ['#d8402e', '#b8342a']); tower(B, X + hw * 0.55, keep.y - 0.4, zk, 0.85, 5.6, ['#d8402e', '#b8342a']);
        if (B.light){ B.light(X - 2.4, fy + 0.5, zk + 2.1, '#ffd77a'); B.light(X + 2.4, fy + 0.5, zk + 2.1, '#ffd77a'); }
        // the stone bridge from the hole's island over the gap to the gate
        var by0 = fy + 0.5, by1 = by0; while (by1 < P0[1] && I.inside(X, by1)[0] < 0.6) by1 += 0.25; by1 += 0.4;
        var zb0 = B.gz(X, by0 + 0.2), zb1 = B.gz(X, by1);
        if (by1 - by0 > 0.6 && clearAt(X, by1) > 0.5) B.solid(X - 0.9, by0, Math.min(zb0, zb1) - 1.6, X + 0.9, by1, Math.max(zb0, zb1) + 0.8, function(px, py, pz){ var u = (py - by0) / (by1 - by0), zd = zb0 + (zb1 - zb0) * u, t = pz - zd, dx = Math.abs(px - X);
          if (dx > 0.85) return null; var arch = Math.sin(u * 3.1416) * 1.3; if (t < -1.5 + arch * 0.9 && dx < 0.85) return null; if (t > 0) return dx > 0.68 && t < 0.55 ? '#ddd6c4' : null; return t > -0.08 ? '#cfc6b0' : WHITE(py * 3, pz); });
        // the cloud mill: a white tower, a cap, and four sails facing the camera
        var mx = mill.x, my = mill.y, zm = B.gz(mx, my), mh = 4.6;
        B.solid(mx - 1.1, my - 1.1, zm - 0.1, mx + 1.1, my + 1.1, zm + mh + 1.3, function(px, py, pz){ var t = pz - zm, rr = Math.hypot(px - mx, py - my), w = 1.0 - t / mh * 0.35;
          if (t < mh){ if (rr > w) return null; if (py - my > w * 0.7 && Math.abs(px - mx) < 0.28 && t < 1.1) return '#4a2e1c'; if (py - my > w * 0.6 && Math.abs(px - mx) < 0.16 && Math.abs(t - 2.6) < 0.25) return '#ffd77a'; return Math.floor(t * 2) % 2 ? '#f4f0e4' : '#e8e2d2'; }
          var k = (t - mh) / 1.2; return rr < 0.8 * (1 - k * 0.8) ? '#8a3a2a' : null; });
        if (B.light) B.light(mx, my + 0.8, zm + 2.6, '#ffd77a');
        var hz = zm + mh - 0.3, hy = my + 0.95, ang = 0.4 + hash(seed, 9, 9);
        B.solid(mx - 3.3, hy - 0.2, hz - 3.3, mx + 3.3, hy + 0.25, hz + 3.3, function(px, py, pz){ var dx = px - mx, dz = pz - hz; if (Math.abs(py - hy) > 0.12) return null; if (Math.hypot(dx, dz) < 0.2) return '#5a3a1e';
          for (var s = 0; s < 4; s++){ var a = ang + s * 1.5708, ux = Math.cos(a), uz = Math.sin(a), along = dx * ux + dz * uz, across = -dx * uz + dz * ux;
            if (along > 0.2 && along < 3.2){ if (Math.abs(across) < 0.06) return '#6a4a2c'; if (across > 0.06 && across < 0.65){ var g = Math.abs(((along * 2.2) % 1) - 0.5) < 0.07 || across > 0.58; return g ? '#8a6a44' : '#f4efe2'; } } }
          return null; });
        lamps.forEach(function(p){ lamp(B, p.x, p.y, '#2a2420', '#ffd77a'); });
      },
      fill:{ on:['grass'], trees:0.2, lows:0.18, tree:function(B, x, y, i){ if (hash(i, seed, 32) < 0.5) pineAt(B, x, y, 0.55 + hash(i, seed, 31) * 0.3, i); else skyTree(B, x, y, 2.6 + hash(i, seed, 31), ['#3f9a46', '#2f8139', '#5bb352'], i); },
        low:function(B, x, y, i){ var k = hash(i, seed, 33); if (k < 0.6) bush(B, x, y, 0.4, ['#3f9a46', '#5bb352', '#2f8139']); else rockAt(B, x, y, 0.34, ['#d0c8b4', '#b8ae96']); } },
      bg:'#8fc8f0', gain:2,
      mats:skyMats(seed, { grass:skyGrass(seed, ['#5fae4c', '#6cba56', '#529f44', '#86c25e']),
        cobble:['#d0c8b4', '#e2dccb', '#b8ae96', 0, function(c, R){ var row = Math.floor(c.tj / 3), off = row % 2 ? 2 : 0; if (c.tj % 3 === 0 || (c.ti + off) % 4 === 0) return R('#b0a68e'); return R(blot(c, 0.2, seed + 18) > 0.55 ? '#dcd4c0' : '#cfc6b0'); }] })
    };
  }
  /* ---------------- DINO VALLEY IS A JOURNEY too, down from the trail into the age before the ice. The fern meadow under
     the bone wall where the trail comes down (1 to 4), the swamp below the jungle falls (5 to 9), the fossil cliffs and
     the dig site (10 to 13), the rex's jungle (14 to 16), and the long neck valley under the smoking volcano (17 and
     18). A hole with no place (a daily, a season) keeps the land Dino Valley always had. */
  STOPS.dino = [[1, 'meadow'], [5, 'swamp'], [10, 'dig'], [14, 'rex'], [17, 'valley']];
  FLY['dino~meadow'] = FLY['dino~swamp'] = 'butterfly'; FLY['dino~dig'] = FLY['dino~rex'] = FLY['dino~valley'] = 'ptero';
  (function(){ var base = BUILD.dino; BUILD.dino = function(L){ var s = L.stop;
    return s === 'meadow' ? dinMeadow(L) : s === 'swamp' ? dinSwamp(L) : s === 'dig' ? dinDig(L) : s === 'rex' ? dinRex(L) : s === 'valley' ? dinValley(L) : base(L); }; })();

  // a long neck: a heavy body on four legs, the neck rising to a small head, the tail sweeping down behind. s scales
  // her, zb sets her feet (lower than the ground to stand her in the water), and her hide is mottled in smooth patches
  function dinLongneck(B, X, Y, k, s, zb, sk){ zb = zb == null ? B.gz(X, Y) : zb; sk = sk || ['#6e8458', '#5a6e48', '#8a9e6c']; var dir = hash(k, 3, 7) < 0.5 ? 1 : -1;
    B.solid(X - 2.7 * s, Y - 0.75 * s, zb, X + 2.7 * s, Y + 0.75 * s, zb + 4.25 * s, function(px, py, pz){ var dx = (px - X) * dir / s, dy = (py - Y) / s, t = (pz - zb) / s;
      function hide(){ var n = vn(px * 1.3 + k * 5, pz * 1.4 + py * 0.7, 61); return n < 0.33 ? sk[1] : n > 0.72 ? sk[2] : sk[0]; }
      if (t < 1.1 && Math.abs(Math.abs(dx + 0.2) - 0.7) < 0.2 && Math.abs(Math.abs(dy) - 0.33) < 0.18) return t < 0.12 ? '#3a4630' : sk[1];
      if (Math.hypot((dx + 0.2) / 1.25, dy / 0.6, (t - 1.55) / 0.68) < 1) return t < 1.15 ? '#a8b48a' : hide();
      var nx = 0.9 + (t - 1.7) * 0.42; if (t > 1.7 && t < 3.8 && Math.abs(dy) < 0.22 && Math.abs(dx - nx) < 0.27 - (t - 1.7) * 0.03) return hide();
      if (Math.hypot((dx - 1.95) / 0.4, dy / 0.22, (t - 3.9) / 0.22) < 1) return (dx > 2.05 && Math.abs(t - 3.96) < 0.05 && Math.abs(dy) > 0.1) ? '#1a1a10' : hide();
      var tx = -1.3 - (t < 1.7 ? (1.7 - t) * 0.9 : 0); if (dx < -1.2 && dx > -2.6 && Math.abs(dy) < 0.18 && Math.abs(dx - tx) < 0.3 && t > 0.2 && t < 1.8) return hide();
      return null; }); }
  // a cycad: a short scaled trunk, a crown of stiff fronds, and the cone in the middle
  function dinCycad(B, x, y, H, k){ var zb = B.gz(x, y), top = zb + H;
    B.vox(x - 1.9, y - 1.6, zb - 0.1, x + 1.9, y + 1.6, top + 1.3, function(set){
      B.tube(set, x, y, zb, x, y, top, 0.3, 0.24, function(t, z){ return (Math.floor((z - zb) * 6) % 2) ? '#6a5232' : '#836640'; });
      for (var f = 0; f < 11; f++){ var a = f / 11 * 6.28 + k * 0.7, up = 0.45 + hash(f, k, 81) * 0.5, len = 1.4 + hash(k, f, 82) * 0.35, fx = Math.cos(a), fy = Math.sin(a) * 0.75;
        for (var al = 0; al < len; al += set.st){ var z = top + al * up - al * al * 0.2, wd = 0.2 * (1 - al / (len + 0.2)); for (var o = -wd; o <= wd; o += set.st) set(x + fx * al - fy * o, y + fy * al + fx * o, z, Math.abs(o) < set.st ? '#4a6a22' : (al > len * 0.6 ? '#5a8a2e' : '#3e7426')); } }
      B.blob(set, x, y, top + 0.12, 0.28, 0.28, 0.24, '#b8702a'); }, B.ART); }
  // a tree fern: a thin shaggy trunk and a crown of long fronds, each cut into leaflets
  function dinTreeFern(B, x, y, H, k){ var zb = B.gz(x, y), lean = (hash(k, 4, 83) - 0.5) * 0.6, top = [x + lean, y, zb + H];
    B.vox(x - 2.8, y - 2.4, zb - 0.1, x + 2.8, y + 2.4, zb + H + 0.8, function(set){
      B.tube(set, x, y, zb, top[0], top[1], top[2], 0.2, 0.15, function(t, z){ return vn(z * 4, k, 84) < 0.45 ? '#4a3420' : '#5e4428'; });
      for (var f = 0; f < 9; f++){ var a = f / 9 * 6.28 + k, fx = Math.cos(a), fy = Math.sin(a) * 0.72;
        for (var al = 0; al < 2.3; al += set.st){ var sag = 0.35 * al - al * al * 0.22, wd = 0.34 * Math.sin(Math.min(1, al / 2.3) * 3.14) + 0.04;
          for (var o = -wd; o <= wd; o += set.st){ if (Math.abs(o) > set.st && ((al * 5 + Math.abs(o) * 3) % 1) > 0.72) continue;
            set(top[0] + fx * al - fy * o, top[1] + fy * al + fx * o, top[2] + sag, Math.abs(o) < set.st ? '#3c6a1e' : (al > 1.4 ? '#7aae3e' : '#5c9430')); } } } }, B.ART); }
  // a swamp cypress: roots flared out like buttresses, a straight trunk, flat dark crowns, and moss hanging off them
  function dinCypress(B, x, y, H, k, zb){ zb = zb == null ? B.gz(x, y) : zb; var R = H * 0.27;
    B.vox(x - R - 0.7, y - R - 0.7, zb - 0.3, x + R + 0.7, y + R + 0.7, zb + H + 0.6, function(set){
      for (var r = 0; r < 4; r++){ var a = r * 1.57 + k; B.tube(set, x + Math.cos(a) * 0.6, y + Math.sin(a) * 0.45, zb - 0.1, x, y, zb + 1.2, 0.15, 0.1, '#5a4a36'); }
      B.tube(set, x, y, zb - 0.1, x, y, zb + H * 0.92, 0.3, 0.12, '#6a5640');
      for (var q = 0; q < 4; q++){ var cz = zb + H * (0.44 + q * 0.16), rr = R * (1.05 - q * 0.2), ox = (hash(q, k, 85) - 0.5) * 0.6;
        B.blob(set, x + ox, y, cz, rr, rr * 0.8, 0.45, function(px, py, pz){ var n = vn(px * 2.2, py * 2.2 + pz * 3, 86); return n < 0.3 ? '#1e4a24' : n > 0.72 ? '#4a7a3a' : '#2e5e2c'; }); }
      for (var m = 0; m < 7; m++){ var ma = hash(m, k, 87) * 6.28, mr = R * (0.5 + hash(k, m, 88) * 0.45), mx = x + Math.cos(ma) * mr, my = y + Math.sin(ma) * mr * 0.8, mz = zb + H * 0.44 - 0.35;
        B.tube(set, mx, my, mz, mx, my, mz - 0.7 - hash(m, k, 89) * 0.6, 0.07, 0.03, '#94a46e'); } }, B.ART); }
  // a monkey puzzle: a tall bare trunk and, at the top, tiers of boughs in tufts, so it stands up like an umbrella
  function dinAraucaria(B, x, y, H, k){ var zb = B.gz(x, y), R = H * 0.3;
    B.vox(x - R - 0.6, y - R - 0.6, zb - 0.1, x + R + 0.6, y + R + 0.6, zb + H + 0.7, function(set){
      B.tube(set, x, y, zb, x, y, zb + H, 0.24, 0.1, function(t, z){ return vn(z * 3, k, 90) < 0.5 ? '#6e5038' : '#7e5e42'; });
      for (var q = 0; q < 3; q++){ var z0 = zb + H * (0.62 + q * 0.13), rr = R * (1 - q * 0.24);
        for (var b = 0; b < 7; b++){ var a = b / 7 * 6.28 + q + k, ex = x + Math.cos(a) * rr, ey = y + Math.sin(a) * rr * 0.8;
          B.tube(set, x, y, z0, ex, ey, z0 + 0.35, 0.06, 0.05, '#5a4030');
          B.blob(set, (x + ex * 2) / 3, (y + ey * 2) / 3, z0 + 0.42, rr * 0.42, rr * 0.36, 0.32, function(px, py, pz){ return vn(px * 3, py * 3 + pz * 2, 91) < 0.4 ? '#24502a' : '#33663a'; }); } }
      B.blob(set, x, y, zb + H, R * 0.38, R * 0.32, 0.35, '#2e5e34'); }, B.ART); }
  // a fern on the ground, low enough to stand anywhere
  function dinFern(B, x, y, k, r){ var zb = B.gz(x, y); r = r || 0.55 + hash(k, 5, 61) * 0.3;
    B.solid(x - r, y - r, zb, x + r, y + r, zb + r * 1.2, function(px, py, pz){ var dx = px - x, dy = py - y, t = pz - zb, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      if (d > r || t > r * 1.2 * (1 - d / r * 0.6)) return null; if (Math.abs(Math.sin(a * 3.5 + k)) > 0.55) return null; return d < r * 0.4 ? '#2a5a1c' : d > r * 0.8 ? '#5a8a2e' : '#3e7a28'; }); }
  // horsetails: a clump of jointed green stems, a dark ring at every joint
  function dinReeds(B, x, y, k, zb){ zb = zb == null ? B.gz(x, y) : zb;
    B.vox(x - 0.8, y - 0.7, zb - 0.1, x + 0.8, y + 0.7, zb + 2, function(set){ for (var i = 0; i < 8; i++){ var a = hash(i, k, 97) * 6.28, r = hash(k, i, 98) * 0.45, sx = x + Math.cos(a) * r, sy = y + Math.sin(a) * r * 0.7, h = 1 + hash(i, k, 99) * 0.8;
      B.tube(set, sx, sy, zb, sx + Math.cos(a) * 0.15, sy, zb + h, 0.06, 0.04, function(t, z){ return ((z - zb) * 5 | 0) % 3 === 0 ? '#3a4a22' : '#6a8a3a'; }); } }, B.ART); }
  // a nest: a ring of twigs, and n eggs in it, speckled
  function dinNest(B, x, y, k, n){ var zb = B.gz(x, y);
    B.solid(x - 1.05, y - 1.05, zb - 0.05, x + 1.05, y + 1.05, zb + 0.62, function(px, py, pz){ var dx = px - x, dy = py - y, r = Math.hypot(dx, dy), t = pz - zb;
      if (r > 0.7 && r < 1.02 && t < 0.38 - (r - 0.86) * (r - 0.86) * 8) return vn(Math.atan2(dy, dx) * 5 + k, t * 9, 71) < 0.5 ? '#8a6a3a' : '#5e4424';
      if (r < 0.76 && t < 0.1) return '#a8875a';
      for (var e = 0; e < n; e++){ var a = e / n * 6.28 + k, ex = dx - Math.cos(a) * 0.34, ey = dy - Math.sin(a) * 0.3; if (Math.hypot(ex / 0.21, ey / 0.21, (t - 0.27) / 0.29) < 1) return vn(px * 9, pz * 9 + py * 7, 72 + e) > 0.74 ? '#8a7a4a' : (ex < 0 ? '#fbf4dc' : '#e8dcb8'); }
      return null; }); }
  // a fallen log from a to b, its top furred with moss, the cut end pale
  function dinLog(B, ax, ay, bx, by, r, zb){ B.vox(Math.min(ax, bx) - r - 0.2, Math.min(ay, by) - r - 0.2, zb - r, Math.max(ax, bx) + r + 0.2, Math.max(ay, by) + r + 0.2, zb + r * 2 + 0.3, function(set){
    B.tube(set, ax, ay, zb + r * 0.55, bx, by, zb + r * 0.55, r, r * 0.85, function(t, z){ if (t <= 0.001 || t >= 0.999) return '#c8a878'; return z > zb + r * 1.25 ? (vn(t * 9, 1, 95) < 0.5 ? '#5e7a32' : '#6e8a3a') : (vn(t * 14, z * 4, 96) < 0.5 ? '#5a4028' : '#6e5236'); }); }, B.ART); }
  // a small heap of bones: a thigh bone across two ribs, and a skull for the bigger ones
  function dinBones(B, x, y, k, big){ var zb = B.gz(x, y), s = big ? 1.3 : 0.8, a = hash(k, 2, 77) * 3.14, ca = Math.cos(a), sa = Math.sin(a);
    B.solid(x - 1.1 * s, y - 1.1 * s, zb - 0.05, x + 1.1 * s, y + 1.1 * s, zb + 0.6 * s, function(px, py, pz){ var u = ((px - x) * ca + (py - y) * sa) / s, v = (-(px - x) * sa + (py - y) * ca) / s, t = (pz - zb) / s;
      if (Math.abs(v) < 0.1 && Math.abs(u) < 0.8 && t < 0.2) return '#ece0c0'; if (Math.hypot(Math.abs(u) - 0.85, v) < 0.16 && t < 0.24) return '#f4ead2';   // the thigh bone and its knuckles
      if (Math.abs(Math.hypot(u + 0.1, t) - 0.5) < 0.07 && Math.abs(Math.abs(v) - 0.35) < 0.07) return '#ddd0aa';   // two ribs arching up
      if (big && Math.hypot((u - 0.2) / 0.45, (v - 0.55) / 0.3, t / 0.32) < 1) return Math.hypot(u - 0.3, v - 0.75, t - 0.12) < 0.1 ? '#3a2e22' : '#f1e6c8';
      return null; }, 0.06); }
  /* a trackway of three toed prints, walked from a to b, a print every st feet, left and right in turn. True inside a
     print. sz is the print's length. */
  function dinPrint(x, y, a, b, st, sz){ var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    var u = (x - a[0]) * ux + (y - a[1]) * uy, v = -(x - a[0]) * uy + (y - a[1]) * ux; if (u < -sz || u > L + sz || Math.abs(v) > st * 0.3 + sz) return false;
    var n = Math.round(u / st), side = (n & 1) ? 1 : -1, pu = (u - n * st) / sz, pv = (v - side * st * 0.17) / sz;
    if (Math.hypot(pu + 0.32, pv * 1.1) < 0.36) return true;
    for (var t = -1; t <= 1; t++){ var an = t * 0.5, ca = Math.cos(an), sa = Math.sin(an), qu = pu * ca + pv * sa, qv = -pu * sa + pv * ca; if (qu > -0.1 && qu < 0.75 - Math.abs(t) * 0.12 && Math.abs(qv) < 0.13 * (1 - qu * 0.6)) return true; }
    return false; }
  function dinGround(c, sd, cols){ var a = blot(c, 0.09, sd), b = blot(c, 0.26, sd + 1); return a > 0.66 ? cols[1] : a < 0.3 ? cols[2] : b > 0.64 ? cols[3] : b < 0.3 ? cols[4] : cols[0]; }
  var DIN_POOL = ['#3f6a3a', '#7aa65a', '#2e5030', 0.06, function(c, R){ var d = c.dep || 0; return R(d < 0.12 ? '#6e8a4a' : d < 0.45 ? '#4a7442' : '#2f5634'); }];

  /* 1. THE FERN MEADOW, where the trail comes down: the bone wall behind (a sandstone bluff with a skeleton set in its
     face), a trackway pressed into the ground beside the course, nests of eggs, wet hollows, ferns and cycads. */
  function dinMeadow(L){
    var E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot;
    function cliffY(x){ return P0[1] - 2.2 - (vn(x * 0.14, 4, seed) - 0.5) * 1.4; }
    function wallH(x, y){ var d = cliffY(x) - y; return d <= 0 ? 0 : d < 3.8 ? sm(0, 3.8, d) * 3.1 : 3.1 + Math.min(0.9, (d - 3.8) * 0.12) + (fbm(x * 0.3, y * 0.3, seed + 5) - 0.5) * 0.4; }
    var fosX = L.cx + (hash(seed, 6, 1) < 0.5 ? -1 : 1) * Math.min(4, (P1[0] - P0[0]) * 0.25);
    var sx = hash(seed, 8, 2) < 0.5 ? -1 : 1, tkX = sx < 0 ? P0[0] - 2.4 : P1[0] + 2.4, track = [[tkX + sx * 0.6, E[3] - 0.5], [tkX, cliffY(tkX) + 0.8]];
    L.used.push({ x:tkX, y:(P0[1] + P1[1]) / 2, r:0.9 });
    var ponds = []; for (var i = 0; i < 2; i++){ var p = spot(1.6, function(x, y){ return Math.abs(x - L.cx) * 0.3 + hash(x | 0, y | 0, seed + 20 + i); }, function(x, y){ return y > cliffY(x) + 2.2 && Math.abs(x - tkX) > 2.6; }); if (p) ponds.push(p); }
    function pondD(x, y){ var m = -9; ponds.forEach(function(p){ m = Math.max(m, 1 - Math.hypot((x - p.x) / p.r, (y - p.y) / (p.r * 0.72)) + (fbm(x * 0.8, y * 0.8, seed + 3) - 0.5) * 0.25); }); return m; }
    var nests = []; for (i = 0; i < 3; i++){ var q = spot(1.2, function(x, y){ return L.side(x) * 2 - Math.abs(clearAt(x, y) - 2.4) * 0.5 + hash(x * 2 | 0, y * 2 | 0, seed + 30 + i); }, function(x, y){ return y > cliffY(x) + 1.6 && pondD(x, y) < -0.4 && Math.abs(x - tkX) > 1.6; }); if (q) nests.push(q); }
    return {
      h:function(x, y){ var k = sm(0.8, 3, clearAt(x, y)), w = wallH(x, y); if (w > 0) return w * k; var pd = pondD(x, y); if (pd > 0) return -0.2; return (fbm(x * 0.08, y * 0.1, seed) - 0.42) * 0.9 * sm(1.3, 6, clearAt(x, y)); },
      mat:function(x, y){ var d = cliffY(x) - y; if (d > 3.9) return ['mtop']; if (d > 0) return ['bluff', { z:wallH(x, y) }];
        var pd = pondD(x, y); if (pd > 0) return ['jpool', { dep:pd }]; if (pd > -0.12) return ['mud'];
        if (clearAt(x, y) > 0.5 && dinPrint(x, y, track[0], track[1], 1.6, 0.62)) return ['print']; return ['meadow']; },
      build:function(B){
        // the skeleton in the bluff: a spine along the face, ribs hanging off it and a skull at the end, standing proud of the stone
        (function(){ var X = fosX, cy = cliffY(X), zt = 3.1;
          B.solid(X - 3.5, cy - 3.9, -0.2, X + 3.5, cy + 0.3, zt, function(px, py, pz){ var sv = Math.min(0.999, Math.max(0.001, pz / zt)), fy = cliffY(px) - 3.8 * (0.5 - Math.sin(Math.asin(1 - 2 * sv) / 3));   // where the face is at this height (smoothstep turned round)
            if (Math.abs(py - fy - 0.1) > 0.12) return null; var dx = px - X, sp = 1.85 + Math.sin(dx * 0.7) * 0.18;
            if (Math.abs(dx) < 2.6 && Math.abs(pz - sp) < 0.1) return ((dx * 3.2 + 20 | 0) % 2) ? '#f4ead2' : '#d8ccaa';
            for (var r = -2; r <= 3; r++){ var rx = r * 0.42 - 0.2; if (Math.abs(dx - rx - (sp - pz) * 0.18) < 0.06 && pz < sp && pz > sp - 0.95 + Math.abs(r - 0.5) * 0.1) return '#ece0c0'; }
            if (Math.hypot((dx - 3) / 0.42, (pz - sp - 0.05) / 0.26) < 1) return Math.hypot(dx - 3.1, pz - sp - 0.08) < 0.08 ? '#4a3a24' : '#f4ead2';
            if (dx < -2.5 && dx > -3.4 && Math.abs(pz - (sp + (dx + 2.5) * 0.3)) < 0.07 - (-2.5 - dx) * 0.04) return '#e0d4b0';
            return null; }, 0.06); })();
        nests.forEach(function(n, i){ dinNest(B, n.x, n.y, i + seed, 3 + (i % 2)); });
        ponds.forEach(function(p, i){ dinReeds(B, p.x + p.r * 0.85, p.y - p.r * 0.35, i + seed); });
      },
      fill:{ on:['meadow', 'mtop'], trees:0.28, lows:0.32,
        tree:function(B, x, y, i){ var k = hash(i, seed, 51); if (k < 0.55) dinTreeFern(B, x, y, 2.8 + hash(i, seed, 54) * 1.4, i); else dinCycad(B, x, y, 0.9 + hash(i, seed, 55) * 0.7, i); },
        low:function(B, x, y, i){ var k = hash(i, seed, 52); if (k < 0.6) dinFern(B, x, y, i); else if (k < 0.82) dinCycad(B, x, y, 0.2, i); else rockAt(B, x, y, 0.36, ['#c9a46a', '#a8834e']); } },
      bg:'#c9a46a', gain:1.8,   // the bluff's sandstone: it shows between the rows of its face
      mats:{ meadow:['#6e9a3a', '#82ac46', '#5a8430', 0.1, function(c, R){ return R(dinGround(c, seed + 7, ['#6e9a3a', '#86ae48', '#5a8632', '#78a440', '#628e36'])); }],
        mtop:['#5e8a32', '#6e9a3a', '#4e7a2a', 0.1, function(c, R){ return R(dinGround(c, seed + 9, ['#5e8a32', '#729e3c', '#4c782a', '#668e36', '#557f2e'])); }],
        // the bluff: cream sandstone in wide bands that wander, so a band never turns into a stripe of single cells
        bluff:['#d8b47a', '#e8cc92', '#a8834e', 0.15, function(c, R){ var z = (c.z || 0) + (blot(c, 0.12, seed + 4) - 0.5) * 0.9, b = Math.floor(z * 1.1); return R(z > 3.0 ? '#7a8a3a' : ['#d8b47a', '#c9a46a', '#e2c48a', '#b8935a'][((b % 4) + 4) % 4]); }],
        mud:['#7a5a34', '#8a6a40', '#6a4a2a', 0.1, function(c, R){ return R(blot(c, 0.3, seed + 2) > 0.55 ? '#7a5a34' : '#6a4e2e'); }],
        print:['#5a4428', '#6a5030', '#4a3620', 0.05, function(c, R){ return R('#5e4628'); }],
        jpool:DIN_POOL }
    };
  }

  /* 2. THE SWAMP below the jungle falls: dark water behind the course with lily pads on it, the falls coming off the jungle
     bank beyond, cypresses standing in the water, logs fallen across the shallows, a long neck wading, horsetails at
     the edge, and fireflies over the water. */
  function dinSwamp(L){
    var E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot;
    function shoreY(x){ return P0[1] - 1.8 - (vn(x * 0.13, 1, seed) - 0.5) * 2.4; }
    function bankY(x){ return shoreY(x) - 4.6 - (vn(x * 0.2, 3, seed) - 0.5) * 1.2; }
    function wet(x, y){ return shoreY(x) - y; }
    var fallX = L.cx + (hash(seed, 5, 1) < 0.5 ? -1 : 1) * Math.min(3.5, (P1[0] - P0[0]) * 0.3);
    var sx = hash(seed, 9, 4) < 0.5 ? -1 : 1, neck = { x:L.cx - sx * Math.min(6, (E[2] - E[0]) * 0.2), y:0 }; neck.y = (shoreY(neck.x) + bankY(neck.x)) / 2 + 0.6;
    var cyp = []; for (var i = 0; i < 6; i++){ var cx0 = E[0] + 2 + (E[2] - E[0] - 4) * (i + 0.3 + hash(i, seed, 2) * 0.4) / 6, cy0 = shoreY(cx0) - 0.8 - hash(seed, i, 3) * 2.2;
      if (Math.abs(cx0 - neck.x) > 3 && Math.abs(cx0 - fallX) > 2.2 && cy0 > bankY(cx0) + 1) cyp.push([cx0, cy0]); }
    var logs = []; for (i = 0; i < 3; i++){ var lx = L.cx + (i - 1) * (E[2] - E[0]) * 0.28 + (hash(i, seed, 4) - 0.5) * 3, ly = shoreY(lx) + 0.2, a = (hash(seed, i, 5) - 0.5) * 1.2 - 1.57;
      if (clearAt(lx, ly) > 1.2 && Math.abs(lx - neck.x) > 3) logs.push([lx, ly, lx + Math.cos(a) * 3.2, ly + Math.sin(a) * 2.2]); }
    var reeds = []; for (i = 0; i < 5; i++){ var q = spot(0.7, function(x, y){ return -Math.abs(wet(x, y) + 0.6) * 2 + hash(x * 2 | 0, y * 2 | 0, seed + 40 + i); }, function(x, y){ return wet(x, y) < -0.2; }); if (q) reeds.push(q); }
    function lily(x, y){ var gx = Math.floor(x / 1.3), gy = Math.floor(y / 1.1), cx = (gx + 0.25 + hash(gx, gy, seed + 6) * 0.5) * 1.3, cy = (gy + 0.25 + hash(gy, gx, seed + 7) * 0.5) * 1.1;
      return hash(gx, gy, seed + 8) < 0.26 && Math.hypot(x - cx, y - cy) < 0.4 && Math.abs(Math.atan2(y - cy, x - cx) - 0.6) > 0.35; }
    return {
      h:function(x, y){ var by = bankY(x); if (y < by) return (1.6 + Math.min(2.6, (by - y) * 1.3) + (fbm(x * 0.3, y * 0.3, seed + 5) - 0.5) * 0.6) * sm(0, 1, by - y + 0.4); var w = wet(x, y); if (w > 0) return -0.25;
        return (fbm(x * 0.08, y * 0.1, seed) - 0.45) * 0.6 * sm(1.3, 6, clearAt(x, y)) - 0.05; },
      mat:function(x, y){ var by = bankY(x); if (y < by){ if (Math.abs(x - fallX) < 0.85 + (by - y) * 0.05) return ['fall', { u:x, v:y }]; return by - y > 2.2 ? ['btop'] : ['bank', { z:by - y }]; }
        var w = wet(x, y); if (w > 0){ if (y < by + 1.4 && Math.abs(x - fallX) < 1.6) return ['foam']; if (lily(x, y)) return ['lily']; return ['jpool', { dep:w }]; }
        if (w > -0.6) return ['mud']; return ['bog']; },
      build:function(B){
        dinLongneck(B, neck.x, neck.y, seed, 1.25, -0.8, ['#5e7650', '#4a6040', '#7a8e62']);
        cyp.forEach(function(c, i){ dinCypress(B, c[0], c[1], 4.2 + hash(i, seed, 6) * 1.6, i + seed, -0.25); });
        logs.forEach(function(g, i){ dinLog(B, g[0], g[1], g[2], g[3], 0.32 + hash(i, seed, 7) * 0.1, -0.3); });
        reeds.forEach(function(r, i){ dinReeds(B, r.x, r.y, i + seed * 3); });
        if (B.light) for (var f = 0; f < 6; f++){ var fx = E[0] + 2 + hash(f, seed, 8) * (E[2] - E[0] - 4), fy = shoreY(fx) - 0.6 - hash(seed, f, 9) * 3; if (fy > bankY(fx) + 0.5) B.light(fx, fy, 0.5 + hash(f, f, 10) * 1.2, '#e8ff7a'); }
      },
      fill:{ on:['bog', 'btop'], trees:0.4, lows:0.4,
        tree:function(B, x, y, i){ if (hash(i, seed, 61) < 0.55) dinCypress(B, x, y, 4 + hash(i, seed, 62) * 1.6, i); else dinTreeFern(B, x, y, 2.6 + hash(i, seed, 63) * 1.2, i); },
        low:function(B, x, y, i){ var k = hash(i, seed, 64); if (k < 0.45) dinReeds(B, x, y, i); else if (k < 0.85) dinFern(B, x, y, i); else rockAt(B, x, y, 0.34, ['#6a6a58', '#5a6a42']); } },
      bg:'#556040', gain:1.9,   // the jungle bank's colour, which shows between the rows of its face
      mats:{ bog:['#4e6a2e', '#5a7834', '#425c28', 0.1, function(c, R){ return R(dinGround(c, seed + 7, ['#4e6a2e', '#5e5a30', '#3e5a26', '#58763a', '#466228'])); }],
        mud:['#5a4630', '#6e5638', '#463626', 0.1, function(c, R){ return R(blot(c, 0.3, seed + 2) > 0.55 ? '#5a4630' : '#4a3a28'); }],
        jpool:['#2f4a30', '#5a7a4a', '#22382a', 0.06, function(c, R){ var d = c.dep || 0; return R(d < 0.25 ? '#4a6a3e' : blot(c, 0.07, seed + 3) > 0.62 ? '#3a5a36' : '#2c4630'); }],
        lily:['#5a9a3a', '#7ab84a', '#3e7a2a', 0.1, function(c, R){ return R(blot(c, 0.9, seed + 4) > 0.8 ? '#f2a8c8' : '#5a9a3a'); }],
        foam:['#d8eee0', '#ffffff', '#b8d8c8', 0.2, function(c, R){ return R(blot(c, 0.6, seed + 5) > 0.5 ? '#eef8f2' : '#bcdcc8'); }],
        fall:['#bfe8f4', '#ffffff', '#7fc8e4', 0.2, function(c, R){ var n = vn(c.ti * 0.7, c.tj * 0.12, seed + 6); return R(n > 0.62 ? '#ffffff' : n > 0.4 ? '#bfe4ec' : '#8ccad8'); }],
        btop:['#3a6a2c', '#4a7a32', '#2e5a26', 0.1, function(c, R){ return R(dinGround(c, seed + 11, ['#3a6a2c', '#4a7a32', '#2e5a26', '#427230', '#34622a'])); }],
        bank:['#4a5a34', '#5a6a3c', '#3a4a2a', 0.15, function(c, R){ var z = c.z || 0, n = blot(c, 0.14, seed + 3); return R(z > 2.4 ? (n > 0.5 ? '#2e5a26' : '#3a6a2c') : n > 0.62 ? '#4f7a2e' : n < 0.32 ? '#5a5a46' : '#6a6a52'); }] }
    };
  }

  /* 3. THE FOSSIL CLIFFS AND THE DIG SITE: a stepped cliff of red and ochre rock behind, a mudslide come down it, and at
     its foot the dig: a pit strung into squares with a rib cage lying in it, the diggers' tent, crates and their lamps. */
  function dinDig(L){
    var E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot, spotRect = L.spotRect;
    function cliffY(x){ return P0[1] - 4.8 - (vn(x * 0.15, 2, seed) - 0.5) * 1; }
    // two faces with a ledge between, each no steeper than about one in one (see bg below)
    function cliffH(d){ return d <= 0 ? 0 : d < 1.8 ? d / 1.8 * 2 : d < 2.8 ? 2 : d < 4 ? 2 + (d - 2.8) / 1.2 * 1.9 : 3.9 + Math.min(0.6, (d - 4) * 0.1); }
    var sx = hash(seed, 3, 9) < 0.5 ? -1 : 1, slideX = sx > 0 ? P1[0] + 0.6 : P0[0] - 0.6;   // it comes off the cliff at the course's corner and runs out beside it
    function slide(x, y){ var d = y - cliffY(x); return d < 7 && d > -2.8 && Math.abs(x - slideX - sx * Math.max(0, d) * 0.45 + Math.sin(d * 0.8) * 0.3) < 0.9 + Math.max(0, d) * 0.22 + (fbm(x * 0.7, y * 0.7, seed + 8) - 0.5) * 0.5; }
    var pit = spotRect(5.4, 2.8, function(x, y){ return -Math.abs(y - (P0[1] - 2.6)) * 0.8 - Math.abs(x - (L.cx - sx * 2.5)) * 0.25 - (slide(x, y) ? 9 : 0); });
    var tent = spot(1.6, function(x, y){ return (pit ? -Math.hypot(x - pit.x, y - pit.y + 1) * 0.5 : 0) + hash(x | 0, y | 0, seed + 3); }, function(x, y){ return y > cliffY(x) + 1.6 && !slide(x, y); });
    var lamps = []; for (var i = 0; i < 3; i++){ var lp = spot(0.4, function(x, y){ return (pit ? -Math.abs(Math.hypot(x - pit.x, y - pit.y) - 3.2) : 0) + hash(x * 3 | 0, y * 3 | 0, seed + 10 + i); }, function(x, y){ return y > cliffY(x) + 0.8 && !slide(x, y); }); if (lp) lamps.push(lp); }
    var crates = []; for (i = 0; i < 3; i++){ var cq = spot(0.6, function(x, y){ return (tent ? -Math.hypot(x - tent.x, y - tent.y) * 0.6 : 0) + hash(x * 3 | 0, y * 3 | 0, seed + 20 + i); }, function(x, y){ return y > cliffY(x) + 1 && !slide(x, y); }); if (cq) crates.push(cq); }
    function inPit(x, y){ return pit && Math.abs(x - pit.x) < pit.w / 2 - 0.3 && Math.abs(y - pit.y) < pit.d / 2 - 0.3; }
    return {
      h:function(x, y){ var d = cliffY(x) - y, k = sm(0.8, 3, clearAt(x, y)); if (d > 0) return (cliffH(d) + (d > 4 ? (fbm(x * 0.3, y * 0.3, seed + 5) - 0.5) * 0.6 : 0)) * k;
        if (inPit(x, y)) return -0.35; var z = (fbm(x * 0.08, y * 0.1, seed) - 0.42) * 0.8 * sm(1.3, 6, clearAt(x, y)); return slide(x, y) ? z + 0.1 : z; },
      mat:function(x, y){ var d = cliffY(x) - y; if (slide(x, y) && d < 2.2) return ['slide'];
        if (d > 4) return ['ctop']; if (d > 1.8 && d < 2.8) return ['ledge']; if (d > 0) return ['rock', { z:cliffH(d) }];
        if (inPit(x, y)){ var u = x - pit.x + 20, v = y - pit.y + 20; return (Math.abs(u % 1 - 0.5) < 0.06 || Math.abs(v % 1 - 0.5) < 0.06) ? ['string'] : ['pit']; }
        return ['dust']; },
      build:function(B){
        if (pit){ var X = pit.x, Y = pit.y, zb = -0.35, s = 0.8;   // the rib cage, half dug out
          B.solid(X - 2.5, Y - 1.1, zb - 0.05, X + 2.8, Y + 1.1, zb + 1.3, function(px, py, pz){ var dx = (px - X) / s, dy = (py - Y) / s, t = (pz - zb) / s, bone = t < 0.2 ? '#cbbf96' : '#f1e6c8';
            var sp = 0.25; if (Math.abs(dy) < 0.15 && dx > -3 && dx < 2.4 && Math.abs(t - sp) < 0.15) return ((dx * 3 + 20 | 0) % 2) ? bone : '#d8ccaa';
            for (var r = -3; r <= 2; r++){ var rx = r * 0.5 + 0.2, h = 1.45 - Math.abs(r + 0.5) * 0.12; if (Math.abs(dx - rx) < 0.1 && t > 0 && Math.abs(Math.hypot(dy, t / h) - 1) < 0.12) return bone; }
            if (Math.hypot((dx - 2.8) / 0.6, dy / 0.38, (t - 0.3) / 0.36) < 1) return Math.hypot(dx - 2.9, Math.abs(dy) - 0.2, t - 0.45) < 0.13 ? '#4a3a24' : bone;
            return null; }, 0.06);
          [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function(q){ var px = X + q[0] * (pit.w / 2 - 0.3), py = Y + q[1] * (pit.d / 2 - 0.3), z0 = B.gz(px, py);   // the stakes the strings run between
            B.solid(px - 0.06, py - 0.06, z0 - 0.4, px + 0.06, py + 0.06, z0 + 0.35, function(){ return '#a8835a'; }, 0.04); }); }
        if (tent){ var tx = tent.x, ty = tent.y, tz = B.gz(tx, ty), w = 2.4, d = 2.2, h = 1.8;   // the diggers' tent, end on, its flap open
          B.solid(tx - w / 2 - 0.1, ty - d / 2 - 0.1, tz - 0.05, tx + w / 2 + 0.1, ty + d / 2 + 0.4, tz + h + 0.3, function(px, py, pz){ var dx = px - tx, dy = py - ty, t = pz - tz;
            if (Math.abs(dy - d / 2 - 0.2) < 0.05 && Math.abs(dx) < 0.05 && t < h + 0.2) return '#5a4028';
            if (Math.abs(dy) > d / 2 || Math.abs(dx) > w / 2) return null; var roof = h * (1 - Math.abs(dx) / (w / 2)); if (t > roof) return null;
            if (t > roof - 0.1) return (Math.floor((dy + 5) * 2.2) % 2) ? '#ece2c2' : '#d8c89e';
            if (dy > d / 2 - 0.08) return Math.abs(dx) < roof * 0.34 ? '#2e2418' : '#e2d6b2'; return null; }, 0.06);
          if (B.light) B.light(tx, ty + d / 2 + 0.2, tz + h, '#ffd27a'); }
        lamps.forEach(function(p){ lamp(B, p.x, p.y, '#3a3028', '#ffcf6a'); });
        crates.forEach(function(p, i){ pirProp(B, p.x, p.y, i === 2 ? 0 : 1); });
      },
      fill:{ on:['dust'], trees:0.16, lows:0.3,
        tree:function(B, x, y, i){ if (hash(i, seed, 71) < 0.6) dinAraucaria(B, x, y, 4.2 + hash(i, seed, 72) * 1.6, i); else dinCycad(B, x, y, 0.9 + hash(i, seed, 73) * 0.6, i); },
        low:function(B, x, y, i){ var k = hash(i, seed, 74); if (k < 0.5) rockAt(B, x, y, 0.32 + hash(i, seed, 75) * 0.2, ['#b8784a', '#a0663e']); else if (k < 0.75) dinBones(B, x, y, i, false); else dinFern(B, x, y, i, 0.5); } },
      bg:'#b8693e', gain:1.9,   // the cliff's red, which shows between the rows of its faces
      mats:{ dust:['#cfa46e', '#dab27c', '#be925e', 0.1, function(c, R){ return R(dinGround(c, seed + 7, ['#cfa46e', '#dcb684', '#bc8f5a', '#d6ac74', '#c49a64'])); }],
        pit:['#8a5e3a', '#9a6a44', '#7a5232', 0.1, function(c, R){ return R(blot(c, 0.25, seed + 2) > 0.55 ? '#8a5e3a' : '#7c5434'); }],
        string:['#f4efe2', '#ffffff', '#e2dccc', 0.05, function(c, R){ return R('#f2ecdc'); }],
        slide:['#5e4028', '#6e4e30', '#4e3420', 0.1, function(c, R){ var n = blot(c, 0.2, seed + 3); return R(n > 0.66 ? '#7a4a26' : n < 0.32 ? '#4e2c14' : '#62391c'); }],
        ledge:['#c08a58', '#cc9864', '#b07c4c', 0.1, function(c, R){ return R(blot(c, 0.2, seed + 4) > 0.6 ? '#b4804e' : '#c69060'); }],
        ctop:['#b8925a', '#c49c62', '#a88652', 0.1, function(c, R){ var n = blot(c, 0.14, seed + 5); return R(n > 0.66 ? '#ae8c56' : n < 0.3 ? '#c49c62' : '#b8925a'); }],
        // the rock: red, ochre and cream in wide bands that wander a little
        rock:['#b8693e', '#c97a4a', '#9a5534', 0.15, function(c, R){ var z = (c.z || 0) + (blot(c, 0.1, seed + 6) - 0.5) * 0.7, b = Math.floor(z * 1.25); return R(['#b8693e', '#d49a5e', '#a4583a', '#e2bc84', '#c27c48'][((b % 5) + 5) % 5]); }] }
    };
  }

  /* 4. THE REX'S JUNGLE: deep jungle, giant ferns, a rock outcrop behind with the den in it and bones before its mouth,
     the rex himself standing by, and his tracks, big as a bath mat, stamped across the stomping ground. */
  function dinRex(L){
    var E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot;
    var sx = hash(seed, 4, 3) < 0.5 ? -1 : 1, ox = L.cx + sx * Math.min(5, (E[2] - E[0]) * 0.16), oy = P0[1] - 4.4, orx = 4.6, ory = 3;
    function dome(x, y){ return 1 - Math.hypot((x - ox) / orx, (y - oy) / ory) + (fbm(x * 0.5, y * 0.5, seed + 2) - 0.5) * 0.18; }
    L.used.push({ x:ox, y:oy, r:4 });
    var rex = spot(3, function(x, y){ return -Math.abs(x - (ox - sx * 6.5)) * 0.4 - Math.abs(y - oy - 1) * 0.6; }, function(x, y){ return y < P0[1] - 1 && dome(x, y) < -0.25; });
    var tk = [[L.cx - sx * (P1[0] - P0[0]) * 0.5 - sx * 2.6, E[3] - 0.5], [rex ? rex.x : ox - sx * 6, rex ? rex.y + 1.5 : oy + 3]];
    var bones = []; for (var i = 0; i < 3; i++){ var bq = spot(0.9, function(x, y){ return -Math.hypot(x - ox, y - oy - ory - 0.8) + hash(x * 3 | 0, y * 3 | 0, seed + 10 + i); }, function(x, y){ return dome(x, y) < -0.1; }); if (bq) bones.push(bq); }
    return {
      h:function(x, y){ var k = sm(0.8, 3, clearAt(x, y)), dm = dome(x, y); if (dm > 0) return Math.min(1, dm * 3) * (2.2 + dm * 3.2) * k; return (fbm(x * 0.08, y * 0.1, seed) - 0.42) * 1.0 * sm(1.3, 6, clearAt(x, y)); },
      mat:function(x, y){ var dm = dome(x, y); if (dm > 0){ var z = Math.min(1, dm * 3) * (2.2 + dm * 3.2), ax = Math.abs(x - ox); if (y > oy && ax < 1.2 && z < 2 * Math.sqrt(Math.max(0, 1 - ax / 1.2))) return ['den']; return ['outcrop', { z:z }]; }
        if (clearAt(x, y) > 0.4 && dinPrint(x, y, tk[0], tk[1], 2.6, 1.05)) return ['print']; return ['jfloor']; },
      build:function(B){
        if (rex){ var X = rex.x, Y = rex.y, s = 1.15, dir = X < L.cx ? 1 : -1, zb = B.gz(X, Y);   // the rex: a big head and a jaw of teeth, two strong legs, little arms, a tail held out behind
          B.solid(X - 3.6 * s, Y - 0.8 * s, zb - 0.05, X + 3.6 * s, Y + 0.8 * s, zb + 3.3 * s, function(px, py, pz){ var dx = (px - X) * dir / s, dy = (py - Y) / s, t = (pz - zb) / s, ay = Math.abs(dy);
            function hide(c){ if (t < c - 0.3) return '#b8a46e'; return vn(dx * 2.4, t * 0.6, 93) > 0.64 ? '#4a4626' : vn(px * 2, pz * 2 + py, 94) > 0.6 ? '#76703e' : '#625e32'; }
            if (ay > 0.18 && ay < 0.58){ if (Math.hypot((dx + 0.2) / 0.6, (ay - 0.38) / 0.2, (t - 1.55) / 0.62) < 1) return hide(1.55);
              if (segD(dx, t, -0.05, 1.1, -0.3, 0.2) < 0.17 && Math.abs(ay - 0.38) < 0.15) return '#5a5630';
              if (t < 0.18 && dx > -0.5 && dx < 0.2 && Math.abs(ay - 0.38) < 0.17) return '#4a4426'; }
            var bc = 2.0 + dx * 0.18; if (Math.hypot(dx / 1.3, dy / 0.6, (t - bc) / 0.62) < 1) return hide(bc);
            if (Math.hypot((dx - 1.1) / 0.5, dy / 0.38, (t - 2.45) / 0.48) < 1) return hide(2.45);
            var hd = Math.hypot((dx - 1.75) / 0.68, dy / 0.33, (t - 2.78) / 0.32), jw = Math.hypot((dx - 1.8) / 0.58, dy / 0.27, (t - 2.44) / 0.15);
            if (hd < 1 || jw < 1){ if (t > 2.49 && t < 2.57 && dx > 1.4) return ((dx * 12 | 0) % 2 && ay > 0.12) ? '#f4ead2' : '#3a1a14';
              if (ay > 0.2 && Math.hypot(dx - 1.62, t - 2.9) < 0.07) return '#ffcf3a'; return hide(hd < 1 ? 2.7 : 2.6); }
            if (Math.abs(ay - 0.42) < 0.08 && segD(dx, t, 0.85, 2.05, 1.12, 1.72) < 0.07) return '#5a5630';
            if (dx < -0.9 && dx > -3.5){ var u = (-0.9 - dx) / 2.6, tc = 1.84 - u * 0.6, r = 0.48 * (1 - u) + 0.06; if (Math.hypot(dy, t - tc) < r) return hide(tc); }
            return null; }); }
        bones.forEach(function(b, i){ dinBones(B, b.x, b.y, i + seed, i === 0); });
        if (B.light) B.light(ox, oy + ory - 0.4, 0.9, '#ff9a3a');   // something glows deep in the den
      },
      fill:{ on:['jfloor'], trees:0.58, lows:0.45,
        tree:function(B, x, y, i){ var k = hash(i, seed, 81); if (k < 0.4) broadTree(B, x, y, 3.6 + hash(i, seed, 82) * 1.6, '#4a3624', ['#1f5a26', '#2b6e30', '#3f8a3a'], i); else if (k < 0.8) dinTreeFern(B, x, y, 3 + hash(i, seed, 83) * 1.4, i); else dinCycad(B, x, y, 1 + hash(i, seed, 84) * 0.6, i); },
        low:function(B, x, y, i){ var k = hash(i, seed, 85); if (k < 0.65) dinFern(B, x, y, i, 0.75); else if (k < 0.85) bush(B, x, y, 0.45, ['#1f6a2a', '#2f8139', '#3f9a46']); else rockAt(B, x, y, 0.38, ['#6a6a5e', '#5a5a4e']); } },
      bg:'#6e6a5e', gain:1.9,   // the outcrop's stone, which shows between the rows of its face
      mats:{ jfloor:['#3e6a2a', '#4e7a32', '#2f5a22', 0.1, function(c, R){ return R(dinGround(c, seed + 7, ['#3e6a2a', '#5a5030', '#2f5a22', '#4a7630', '#36602a'])); }],
        print:['#3a2e1c', '#4a3a24', '#2e2416', 0.05, function(c, R){ return R(blot(c, 0.5, seed + 3) > 0.6 ? '#4a3a24' : '#3a2e1c'); }],
        den:['#1a1612', '#221c16', '#120e0a', 0.05, function(c, R){ return R('#18130f'); }],
        outcrop:['#6e6a5e', '#8a8676', '#5a564c', 0.15, function(c, R){ var z = c.z || 0, n = blot(c, 0.16, seed + 4); return R(z > 3.6 && n > 0.45 ? '#3f6a2a' : n > 0.66 ? '#4f7a2e' : n < 0.3 ? '#5e5a50' : (Math.floor(z * 1.2 + n) % 2 ? '#6e6a5e' : '#7a7668')); }] }
    };
  }

  /* 5. THE LONG NECK VALLEY under the smoking volcano: the volcano along the top with lava running down it and smoke
     off the crater, a rockslide of boulders come down one side, a herd of long necks (one young one) on the other by
     their pond, and monkey puzzle trees standing over the grass. */
  function dinValley(L){
    var E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot;
    var sx = hash(seed, 2, 7) < 0.5 ? -1 : 1, vx = L.cx + sx * Math.min(4, (E[2] - E[0]) * 0.1), vy = Math.max(E[1] + 2, P0[1] - 10.5), vr = Math.max(4.5, P0[1] - 1.5 - vy), vh = Math.min(6.5, (vr - 1.4) * 1.05);
    function cone(x, y){ var d = Math.hypot((x - vx) / 1.6, y - vy); return d < vr ? (d < 1.4 ? vh - (1.4 - d) * 0.9 : vh * (1 - (d - 1.4) / (vr - 1.4))) : 0; }
    function lavaX(y){ return vx + Math.sin((y - vy) * 0.7 + seed) * 0.6 - sx * (y - vy) * 0.25; }
    var fanX = sx > 0 ? P1[0] + 3.2 : P0[0] - 3.2, fanY = P0[1] - 3;   // the rockslide: a fan of scree come off the volcano's flank, down beside the course
    var herd = []; for (var i = 0; i < 3; i++){ var s = i === 2 ? 0.75 : 1.45 + hash(i, seed, 3) * 0.3, m = spot(2.6 * s, function(x, y){ return -sx * (x - L.cx) * 0.3 - Math.abs(clearAt(x, y) - 2.6 * s - 1.4) - Math.max(0, y - P0[1] - 8) * 0.3 + hash(x | 0, y | 0, seed + 9 + i); }, function(x, y){ return y < P1[1] - 2 && cone(x, y) < 0.2 && Math.abs(x - fanX) > 2.5 * s + 1.5; });
      if (m) herd.push({ x:m.x, y:m.y, s:s }); }
    var pond = spot(2, function(x, y){ return (herd.length ? -Math.hypot(x - herd[0].x, y - herd[0].y - 2.4) * 0.5 : 0) + hash(x | 0, y | 0, seed + 4); }, function(x, y){ return cone(x, y) < 0.1; });
    function pondD(x, y){ return pond ? 1 - Math.hypot((x - pond.x) / pond.r, (y - pond.y) / (pond.r * 0.7)) + (fbm(x * 0.7, y * 0.7, seed + 3) - 0.5) * 0.25 : -1; }
    var rocks = []; for (i = 0; i < 8; i++){ var rq = spot(0.45 + hash(i, seed, 5) * 0.5, function(x, y){ return (scree(x, y) ? 2 : 0) - Math.abs(x - fanX) * 0.25 + hash(x * 2 | 0, y * 2 | 0, seed + 30 + i) * 2.5; }, function(x, y){ return cone(x, y) < 0.6 && pondD(x, y) < -0.3 && y < P1[1] - 1; }); if (rq) rocks.push(rq); }
    function scree(x, y){ var d = y - fanY; return d > -4 && d < Math.min(9, (P1[1] - P0[1]) * 0.6) && Math.abs(x - fanX - d * 0.1 * sx) < 0.9 + Math.max(0, d) * 0.07 + (fbm(x * 0.5, y * 0.5, seed + 6) - 0.5) * 0.9; }
    return {
      h:function(x, y){ var k = sm(0.8, 3, clearAt(x, y)), c = cone(x, y); if (c > 0) return c * k; if (pondD(x, y) > 0) return -0.2;
        return (fbm(x * 0.08, y * 0.1, seed) - 0.42) * 1.1 * sm(1.3, 6, clearAt(x, y)) + (scree(x, y) ? 0.15 : 0); },
      mat:function(x, y){ var c = cone(x, y); if (c > 0.05){ var d = Math.hypot((x - vx) / 1.6, y - vy); if (d < 1.4) return ['lava'];
          if (Math.abs(x - lavaX(y)) < 0.32 + (y - vy) * 0.015 && y - vy < vr * 0.8) return ['lava']; return ['basalt', { z:c }]; }
        var pd = pondD(x, y); if (pd > 0) return ['lagoon', { dep:pd }]; if (pd > -0.12) return ['mud'];
        return scree(x, y) ? ['scree'] : ['grass']; },
      build:function(B){
        herd.forEach(function(m, i){ dinLongneck(B, m.x, m.y, i + seed, m.s, null, i === 1 ? ['#7a7a5a', '#646446', '#94946c'] : null); });
        rocks.forEach(function(r, i){ rockAt(B, r.x, r.y, r.r, ['#7a7266', '#8e8678']); });
        // the crater's glow and the lava on the slope, and the smoke rolling up off it, drifting away from the wind
        if (B.light){ B.light(vx, vy + 0.4, vh + 0.2, '#ff7a2a'); B.light(lavaX(vy + vr * 0.5), vy + vr * 0.5, cone(lavaX(vy + vr * 0.5), vy + vr * 0.5) + 0.2, '#ffa83a'); }
        B.vox(vx - 4, vy - 2, vh - 0.5, vx + 4, vy + 2, vh + 6, function(set){ for (var p = 0; p < 7; p++){ var u = p / 6, r = 0.6 + u * 0.9;
          B.blob(set, vx - sx * u * 2.4 + Math.sin(p * 1.7) * 0.3, vy - u * 0.4, vh + 0.6 + u * 4.4, r, r * 0.8, r * 0.75, function(px, py, pz){ return vn(px * 1.8, pz * 1.8, 98) > 0.55 ? '#8a8480' : p < 2 ? '#5e5854' : '#a29c96'; }); } });
        if (pond) dinReeds(B, pond.x - pond.r * 0.9, pond.y + 0.2, seed);
      },
      fill:{ on:['grass'], trees:0.22, lows:0.28,
        tree:function(B, x, y, i){ if (hash(i, seed, 91) < 0.65) dinAraucaria(B, x, y, 4.6 + hash(i, seed, 92) * 1.8, i); else dinCycad(B, x, y, 1 + hash(i, seed, 93) * 0.6, i); },
        low:function(B, x, y, i){ var k = hash(i, seed, 94); if (k < 0.45) dinFern(B, x, y, i, 0.5); else if (k < 0.8) rockAt(B, x, y, 0.3 + hash(i, seed, 95) * 0.2, ['#7a7266', '#8e8678']); else bush(B, x, y, 0.38, ['#8a8a4a', '#6f7a3a', '#a0a05a']); } },
      bg:'#5e5254', gain:1.9,   // the volcano's basalt, which shows between the rows of its slope
      mats:{ grass:['#9aa250', '#aab05c', '#88903e', 0.1, function(c, R){ return R(dinGround(c, seed + 7, ['#9aa250', '#b0b064', '#86923e', '#a4aa58', '#8e9846'])); }],
        scree:['#8e8678', '#a29a8a', '#7a7266', 0.1, function(c, R){ var n = blot(c, 0.16, seed + 2); return R(n > 0.64 ? '#9a9284' : n < 0.32 ? '#7a7266' : '#8a8274'); }],
        mud:['#7a6a44', '#8a7a50', '#6a5a3a', 0.1, function(c, R){ return R('#76663f'); }],
        lava:['#ff6a1a', '#ffc23a', '#e04a10', 0.1, function(c, R){ var n = blot(c, 0.5, seed + 8); return R(n > 0.6 ? '#ffc23a' : n < 0.3 ? '#e04a10' : '#ff7a1a'); }],
        basalt:['#5e5254', '#6a5e5e', '#4a4044', 0.15, function(c, R){ var z = c.z || 0, n = blot(c, 0.14, seed + 9); return R(z < 0.8 && n > 0.5 ? '#6a7a3a' : n > 0.68 ? '#6e6262' : n < 0.3 ? '#4e4446' : '#5e5254'); }],
        lagoon:['#3a8aa0', '#7ac0cc', '#2a6a80', 0.05, function(c, R){ var d = c.dep || 0; return R(d < 0.15 ? '#8ac8c8' : d < 0.5 ? '#3a8aa0' : '#2a6a80'); }] }
    };
  }
  /* ---------------- ICE AGE IS A JOURNEY. The scenery round each hole moves you through the world (the owner, 2026-10-15):
     out across the thawing tundra where the herd grazes and the meltwater runs (1 to 4), up to the glacier's edge with its
     crevasses, its ice bridge and its mill (5 to 8), down to the melt lake in the old crater, icebergs adrift and the tar
     pits on its shore (9 to 12), along the cliff of the painted caves where the cave people camp (13 to 16), and under
     Mammoth Peak itself, where the whole herd gathers (17 and 18). A hole with no place stands on the tundra. */
  STOPS.iceage = [[1, 'tundra'], [5, 'glacier'], [9, 'lake'], [13, 'caves'], [17, 'peak']];
  FLY['iceage~tundra'] = FLY['iceage~glacier'] = FLY['iceage~peak'] = 'crow'; FLY['iceage~lake'] = 'vulture'; FLY['iceage~caves'] = 'bat';
  (function(){ BUILD.iceage = function(L){ var s = L.stop; return s === 'peak' ? icePeak(L) : s === 'caves' ? iceCaves(L) : s === 'lake' ? iceLake(L) : s === 'glacier' ? iceGlacier(L) : iceTundra(L); }; })();

  // a woolly mammoth, facing dir (1 east, -1 west), s its size: legs like pillars, a humped back, a domed head,
  // the trunk hanging and curling, and two tusks sweeping up. The fur is smooth patches, never a check.
  function iceMammoth(B, X, Y, k, s, dir){ var zb = B.gz(X, Y);
    B.solid(X - 2.1 * s, Y - 0.8 * s, zb - 0.05, X + 2.1 * s, Y + 0.8 * s, zb + 2.3 * s, function(px, py, pz){ var dx = (px - X) * dir / s, dy = (py - Y) / s, t = (pz - zb) / s;
      var n = vn(px * 3.2, pz * 3.2 + py * 1.7, k + 5), fur = n < 0.34 ? '#5e3e24' : n > 0.7 ? '#9a6c42' : '#7a5232';
      if (t < 0.8 && Math.abs(Math.abs(dx) - 0.55) < 0.19 && Math.abs(Math.abs(dy) - 0.3) < 0.17) return t < 0.12 ? '#3a281a' : t < 0.3 ? '#5e3e24' : fur;
      if (Math.hypot(dx / 1.02, dy / 0.6, (t - 1.2) / 0.62) < 1) return t < 0.75 ? '#5e3e24' : fur;
      if (Math.hypot((dx - 0.4) / 0.5, dy / 0.45, (t - 1.72) / 0.32) < 1) return '#5e3e24';   // the hump
      if (Math.hypot((dx - 1.05) / 0.44, dy / 0.4, (t - 1.48) / 0.46) < 1) return (dy * dy < 0.09 && Math.abs(Math.abs(dy) - 0.2) < 0.06 && Math.abs(t - 1.6) < 0.06 && dx > 1.25) ? '#1a120c' : fur;
      var tc = 1.42 + (t < 0.6 ? (0.6 - t) * 0.55 : 0); if (Math.abs(dy) < 0.12 && t > 0.3 && t < 1.35 && Math.abs(dx - tc) < 0.12) return '#6a4a2e';   // the trunk
      if (Math.abs(Math.abs(dy) - 0.22) < 0.07 && dx > 1.2 && dx < 1.9 && Math.abs(t - (0.95 + (dx - 1.2) * (dx - 1.2) * 1.3)) < 0.08) return '#f4ead2';   // the tusks
      if (dx < -0.95 && dx > -1.25 && Math.abs(dy) < 0.06 && Math.abs(t - (1.1 - (-0.95 - dx) * 1.2)) < 0.07) return '#5e3e24';
      return null; }); }
  // a saber tooth lying up on a boulder, watching the herd: grey rock, a tawny cat, two long white fangs
  function iceSaber(B, x, y, dir){ var zb = B.gz(x, y), R = 1;
    B.solid(x - 1.6, y - 1, zb - 0.1, x + 1.6, y + 1, zb + 2.1, function(px, py, pz){ var dx = (px - x) * dir, dy = py - y, t = pz - zb;
      var d = Math.hypot(dx / (R * 1.2), dy / R, t / 0.95) + (vn(px * 2.2, pz * 2.2, 7) - 0.5) * 0.14;
      if (d < 1) return t > 0.82 ? '#e8f0f6' : vn(px * 1.6, pz * 1.6 + py, 3) < 0.4 ? '#6e7480' : '#868c96';
      if (Math.hypot(dx / 0.62, dy / 0.3, (t - 1.13) / 0.2) < 1) return t < 1.02 ? '#a8804a' : '#c8a064';   // the body
      if (Math.hypot((dx - 0.6) / 0.24, dy / 0.22, (t - 1.32) / 0.2) < 1) return (Math.abs(Math.abs(dy) - 0.09) < 0.04 && t > 1.36 && dx > 0.72) ? '#2a201a' : '#c8a064';   // the head
      if (Math.abs(Math.abs(dy) - 0.07) < 0.035 && dx > 0.74 && dx < 0.82 && t > 1.04 && t < 1.2) return '#ffffff';   // the fangs
      if (Math.abs(dy - 0.28) < 0.06 && dx < -0.5 && dx > -0.95 && Math.abs(t - 1.02) < 0.06) return '#a8804a';   // the tail, over the rock's edge
      return null; }); }
  // a tumbled block of glacier ice: leaning faces, a crack or two, snow on top
  function iceBlock(B, x, y, w, h, k){ var zb = B.gz(x, y) - 0.1, lean = (hash(k, 3, 9) - 0.5) * 0.5;
    B.solid(x - w - 0.4, y - w, zb, x + w + 0.4, y + w, zb + h, function(px, py, pz){ var t = (pz - zb) / h, dx = px - x - lean * t * h * 0.3, dy = py - y;
      var r = w * (1 - t * 0.35); if (Math.abs(dx) + Math.abs(dy) * 0.6 > r * 1.15 || Math.max(Math.abs(dx), Math.abs(dy)) > r) return null;
      if (t > 0.9 - vn(px * 1.5, py * 1.5, k) * 0.12) return '#f6fbfd';
      if (Math.abs(Math.sin(dx * 2.1 + pz * 1.3 + k)) < 0.05) return '#5aa4c4'; return vn(px * 1.2, pz * 1.2 + py, k + 2) < 0.45 ? '#9fd8ea' : '#bfe6f2'; }); }
  // an iceberg standing in the water: ragged sides, a waterline of deep blue, snow on its shoulders
  function iceBerg(B, x, y, r, H, zw, k){
    B.solid(x - r - 0.4, y - r - 0.4, zw - 0.3, x + r + 0.4, y + r + 0.4, zw + H, function(px, py, pz){ var t = (pz - zw) / H, dx = px - x, dy = py - y;
      var rr = r * (1 - Math.pow(Math.max(0, t), 1.6) * 0.65) * (0.85 + vn(Math.atan2(dy, dx) * 1.3 + 3, pz * 0.8, k) * 0.3); if (Math.hypot(dx, dy * 1.15) > rr || t > 1) return null;
      if (t < 0.08) return '#4a9cc0'; if (t > 0.78 || vn(px * 1.3, py * 1.3 + pz, k + 4) > 0.72) return '#f6fbfd'; return vn(px * 1.1, pz * 1.4, k + 1) < 0.42 ? '#a8dcee' : '#d4f0f8'; }); }
  // a torch on a pole of bone, lit, so the cave mouth's light flickers
  function iceTorch(B, x, y){ var zb = B.gz(x, y); if (B.light) B.light(x, y, zb + 1.45, '#ff9a2a');
    B.solid(x - 0.2, y - 0.2, zb, x + 0.2, y + 0.2, zb + 1.7, function(px, py, pz){ var t = pz - zb, r = Math.hypot(px - x, py - y); if (t < 1.3 && r < 0.06) return t < 1.2 ? '#e8dcc0' : '#5a3818';
      if (t >= 1.25 && t < 1.65 && r < 0.13 * (1 - (t - 1.25) / 0.45)) return t < 1.4 ? '#ffd23a' : '#ff8a1a'; return null; }); }
  // a fire in its ring of stones, lit
  function iceFire(B, X, Y){ var zb = B.gz(X, Y); if (B.light) B.light(X, Y, zb + 0.5, '#ff8a2a');
    B.solid(X - 0.55, Y - 0.55, zb - 0.05, X + 0.55, Y + 0.55, zb + 0.9, function(px, py, pz){ var r = Math.hypot(px - X, py - Y), t = pz - zb;
      if (t < 0.2 && r > 0.34 && r < 0.5) return '#6e665e'; if (t < 0.12 && r < 0.36) return Math.abs(Math.sin((px - X) * 9)) < 0.3 ? '#3a2412' : '#5a3818';
      if (t >= 0.1 && r < 0.3 * (1 - t / 0.85)) return t < 0.3 ? '#ffd23a' : t < 0.55 ? '#ff8a1a' : '#e5483a'; return null; }); }
  // a tent of hides on poles of bone: a cone of stitched skins, the door flap open to the fire, the pole ends crossed at the top
  function iceTent(B, X, Y, k){ var zb = B.gz(X, Y), R = 1.25, H = 2.6;
    B.solid(X - R - 0.1, Y - R - 0.1, zb - 0.05, X + R + 0.1, Y + R + 0.1, zb + H + 0.5, function(px, py, pz){ var dx = px - X, dy = py - Y, t = pz - zb, r = Math.hypot(dx, dy), rr = R * (1 - t / H);
      if (t > H * 0.85){ var a = Math.atan2(dy, dx); for (var q = 0; q < 4; q++){ var qa = q * 1.57 + 0.4; if (Math.hypot(dx - Math.cos(qa) * (t - H * 0.85) * 0.5, dy - Math.sin(qa) * (t - H * 0.85) * 0.5) < 0.06 && t < H + 0.45) return '#efe4c8'; } }
      if (r > rr || r < rr - 0.14 || t > H) return null;
      if (dy > 0 && Math.abs(dx) < 0.32 * (1 - t / 1.4) && t < 1.4) return '#2a1c12';   // the door
      var a2 = Math.atan2(dy, dx); if (Math.abs(Math.sin(a2 * 3 + k)) < 0.06 || Math.abs(t - 0.9) < 0.04) return '#5a3c22';   // the seams
      return vn(a2 * 2 + k, t * 1.5, k) < 0.4 ? '#a8865a' : '#bc9a6a'; }); }
  function iceLows(B, x, y, i, seed){ var k = hash(i, seed, 52); if (k < 0.4) rockAt(B, x, y, 0.4, ['#7a8090', '#e8f0f6']); else if (k < 0.75) bush(B, x, y, 0.38, ['#9a8a52', '#b8a66a', '#7a6e42']); else bush(B, x, y, 0.42, ['#f6f9fd', '#e4edf6', '#28503e']); }
  /* A slope that rises away from the camera is laid one row of ground points a pixel, and steeper than about 0.45 the rows
     part and the sky shows between them as stripes. Past about 1.4 the land draws a face down to the row in front instead.
     So every rise in Ice Age is one or the other: a gentle slope, or a cliff (a step), never in between. iceStep is the
     cliff: h high from r = 0, a true step, so no row of points stands halfway up the face and shows through it. A face's paint is asked with c.dt -1 (the face, by its column)
     and its top with c.dt 0. */
  function iceStep(r, h){ return r > 0 ? h : 0; }
  // a face is lit edge on, so its tone would be the ramp's darkest: start its ramp one step down from the colour instead
  function iceFace(R, col){ var r = R(col); return [r[1], r[1], r[2], r[3], r[4]]; }
  /* The land's own face sits exactly between two rows of ground, and the finish pass, asked how high the ground is there,
     answers the top on one pixel and the foot on the next, so the face came out hatched with shadow. A cliff therefore
     wears a skin: a thin solid just in front of its face, from the ground at its foot to its top, coloured col(x, height up
     the face, the face's height). fy(x) is where the face stands (the step's line), or null where there is none. Built in
     short pieces so each piece's box stays thin. */
  function iceSkin(B, x0, x1, fy, col){
    for (var xa = x0; xa < x1; xa += 2.5){ var xb = Math.min(x1, xa + 2.5), y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (var x = xa; x <= xb + 0.01; x += 0.25){ var y = fy(x); if (y == null) continue; y0 = Math.min(y0, y); y1 = Math.max(y1, y); z0 = Math.min(z0, B.gz(x, y + 0.35)); z1 = Math.max(z1, B.gz(x, y - 0.2)); }
      if (y0 > y1 || z1 - z0 < 0.3) continue;
      B.solid(xa, y0 + 0.05, z0 - 0.1, xb, y1 + 0.3, z1 + 0.05, function(px, py, pz){ var y = fy(px); if (y == null || py < y + 0.08 || py > y + 0.24) return null;
        var top = B.gz(px, y - 0.2), bot = B.gz(px, y + 0.35); if (top - bot < 0.25 || pz > top || pz < bot - 0.1) return null; return col(px, pz - bot, top - bot); }); } }
  var ICE_SNOW = ['#eef3f7', '#f8fbfd', '#dde6ec', 0.16, function(c, R){ var a = blot(c, 0.09, 61), b = blot(c, 0.24, 62); return R(a > 0.68 ? '#dbe6ef' : b > 0.7 ? '#f8fbfd' : b < 0.28 ? '#e4ecf2' : '#eef3f7'); }];

  /* 1. THE TUNDRA (and every Ice Age hole with no place): the snow going off the plain in the thaw, the brown grass coming
     through, a meltwater stream winding along behind the hole under a low white ridge, the herd grazing beyond it, and a
     saber tooth up on a boulder at the side, watching them. */
  function iceTundra(L){
    var E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot;
    function ridgeY(x){ return P0[1] - 6.4 - (vn(x * 0.09, 4, seed) - 0.5) * 3.4; }
    var sp = []; for (var sx = E[0] - 1; sx <= E[2] + 1; sx += 2) sp.push([sx, P0[1] - 2.9 + (vn(sx * 0.11, 2, seed + 1) - 0.5) * 2.4]);
    var sD = L.dist(sp); function stream(x, y){ return 0.75 + (vn(x * 0.3, 1, seed + 3) - 0.5) * 0.4 - sD(x, y); }
    var herd = []; for (var i = 0; i < 3; i++){ var m = spot(1.8, function(x, y){ return L.north(x, y) * 0.5 + L.side(x) * 2 - Math.abs(y - ridgeY(x) - 1.6) * 0.5 + hash(x | 0, y | 0, seed + 9 + i) * 2; }, function(x, y){ return y > ridgeY(x) + 0.8 && stream(x, y) < -0.6; }); if (m) herd.push(m); }
    var cat = spot(1.4, function(x, y){ return L.side(x) * 5 - Math.abs(y - L.cy) * 0.2 + hash(x | 0, y | 0, seed + 30) * 2; }, function(x, y){ return stream(x, y) < -1; });
    return {
      h:function(x, y){ var ry = ridgeY(x), k = sm(0.8, 3, clearAt(x, y)); if (y < ry) return (0.7 + Math.min(3.2, (ry - y) * 0.3) + (fbm(x * 0.15, y * 0.15, seed + 5) - 0.5) * 0.3) * k;
        if (stream(x, y) > 0) return -0.3; return (fbm(x * 0.08, y * 0.1, seed) - 0.42) * 1.1 * sm(1.3, 6, clearAt(x, y)) + sm(ry + 3.5, ry, y) * 0.7 * k; },
      mat:function(x, y){ if (y < ridgeY(x)) return ['drift']; var s = stream(x, y); if (s > 0) return ['jpool', { dep:s }]; if (s > -0.3) return ['mud']; return ['tundra', { f:fbm(x * 0.12, y * 0.14, seed + 8) }]; },
      build:function(B){ herd.forEach(function(m, k){ iceMammoth(B, m.x, m.y, k + seed, 1, hash(k, 3, seed) < 0.5 ? 1 : -1); }); if (cat) iceSaber(B, cat.x, cat.y, cat.x < L.cx ? 1 : -1); },
      fill:{ on:['tundra', 'drift'], trees:0.17, lows:0.26, tree:function(B, x, y, i){ pineAt(B, x, y, 0.7 + hash(i, seed, 51) * 0.55, i); }, low:function(B, x, y, i){ iceLows(B, x, y, i, seed); } },
      bg:'#dbe4ea', gain:2.1,
      mats:{ drift:ICE_SNOW, mud:['#7a6a52', '#8a7a60', '#6a5a44', 0.1],
        // the thaw: snow lying in drifts, the old grass through it in broad patches, moss where it is wettest
        tundra:['#eef3f7', '#f8fbfd', '#dde6ec', 0.16, function(c, R){ var f = c.f || 0.5, b = blot(c, 0.2, seed + 4);
          return R(f > 0.53 ? (b > 0.62 ? '#f8fbfd' : '#eef3f7') : f > 0.49 ? '#d6dcd6' : f > 0.42 ? (b > 0.6 ? '#9c9878' : '#8e8a6a') : b > 0.62 ? '#6e7a56' : '#7e7a5a'); }],
        jpool:['#4aa4c8', '#9adcf0', '#2f84a8', 0.06, function(c, R){ var d = c.dep || 0; return R(d < 0.15 ? '#bfe8f4' : d < 0.4 ? '#5ab4d6' : '#3a94bc'); }] }
    };
  }

  /* 2. THE GLACIER'S EDGE: the ice comes down to the hole. Its wall of blue ice stands behind, split by crevasses and white
     on top, with blocks fallen from it at its foot. Snow lies thin over blue ice underfoot. A crevasse runs down one side
     with a bridge of ice arched over it, the mill (a round shaft the meltwater swirls down) opens on the other side, and
     boulders the ice carried here lie about. */
  function iceGlacier(L){
    var E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot;
    var sd = hash(seed, 4, 2) < 0.5 ? -1 : 1;
    function wallY(x){ return P0[1] - 3.4 - (vn(x * 0.13, 6, seed) - 0.5) * 2.6; }
    var cx0 = sd < 0 ? P0[0] - 4.6 : P1[0] + 4.6, cp = [], ok = cx0 > E[0] + 2 && cx0 < E[2] - 2;
    for (var y = E[3] + 1; y > wallY(cx0) - 1; y -= 1.5){ var xx = cx0 + (vn(y * 0.12, 3, seed + 2) - 0.5) * 2; if (clearAt(xx, y) < 2.2) ok = false; cp.push([xx, y]); }
    var cD = ok ? L.dist(cp) : function(){ return 1e9; }, by = Math.min(P1[1] - 1, Math.max(P0[1] + 1, L.cy + 1)), bx = ok ? cx0 + (vn(by * 0.12, 3, seed + 2) - 0.5) * 2 : null;
    if (ok) for (var q = 0; q < cp.length; q++) L.used.push({ x:cp[q][0], y:cp[q][1], r:1.4 });
    function crev(x, y){ return 0.75 + (vn(x * 0.4, y * 0.4, seed + 5) - 0.5) * 0.5 - cD(x, y); }
    var mill = spot(1.4, function(x, y){ return -sd * (x - L.cx) * 0.3 - Math.abs(y - L.cy) * 0.2 + hash(x | 0, y | 0, seed + 20); }, function(x, y){ return crev(x, y) < -2 && y > wallY(x) + 2.5; });
    var blocks = []; for (var i = 0; i < 4; i++){ var b0 = spot(1.1, function(x, y){ return -Math.abs(y - wallY(x) - 1.6) * 1.5 + hash(x | 0, y | 0, seed + 40 + i) * 3; }, function(x, y){ return crev(x, y) < -1.4 && y > wallY(x) + 0.8; }); if (b0) blocks.push(b0); }
    var seracs = []; for (i = 0; i < 7; i++){ var sxx = E[0] + (i + 0.5) / 7 * (E[2] - E[0]) + (hash(i, seed, 71) - 0.5) * 3; seracs.push({ x:sxx, y:wallY(sxx) - 1.6 - hash(i, seed, 72) * 4, w:0.8 + hash(i, seed, 73) * 0.6, h:1.6 + hash(i, seed, 74) * 1.8 }); }
    var stones = []; for (i = 0; i < 4; i++){ var s0 = spot(1, function(x, y){ return L.side(x) * 3 + hash(x | 0, y | 0, seed + 50 + i) * 3; }, function(x, y){ return crev(x, y) < -1.4 && y > wallY(x) + 2; }); if (s0) stones.push(s0); }
    return {
      h:function(x, y){ var wy = wallY(x), k = sm(0.8, 3, clearAt(x, y)); if (y < wy) return (iceStep(wy - y, 3.4 + vn(x * 0.3, 2, seed) * 0.8) + Math.min(3, (wy - y) * 0.3) + (fbm(x * 0.15, y * 0.15, seed + 5) - 0.5) * 0.3) * k;
        var c = crev(x, y); if (c > 0) return -0.3 - Math.min(1.6, c * 3); if (mill && Math.hypot(x - mill.x, y - mill.y) < 1.1) return -0.25;
        return (fbm(x * 0.08, y * 0.1, seed) - 0.42) * 1 * sm(1.3, 6, clearAt(x, y)); },
      mat:function(x, y){ var wy = wallY(x); if (y < wy) return ['gwall', { z:wy - y, u:x }]; var c = crev(x, y); if (c > 0) return ['crev', { dep:c }];
        if (mill){ var dm = Math.hypot(x - mill.x, y - mill.y); if (dm < 1.1) return ['lagoon', { a:Math.atan2(y - mill.y, x - mill.x), d:dm }]; if (dm < 1.4) return ['gice']; }
        return ['sice']; },
      build:function(B){
        if (ok){ var zb = 0.05;   // the ice bridge: an arch of blue ice over the crevasse, snow along its back
          B.solid(bx - 2.4, by - 0.7, zb - 1.2, bx + 2.4, by + 0.7, zb + 1.4, function(px, py, pz){ var dx = (px - bx) / 2.2, t = pz - zb; if (Math.abs(dx) > 1 || Math.abs(py - by) > 0.55) return null;
            var top = 0.25 + (1 - dx * dx) * 0.9, bot = top - 0.42 - dx * dx * 0.6; if (t > top || t < bot) return null; if (t > top - 0.12) return '#f6fbfd';
            return vn(px * 2, pz * 2, seed) < 0.45 ? '#8fd0e6' : '#b4e2ef'; }); }
        // the glacier's face: columns of blue ice, a crevasse splitting it here and there, white where it meets the top
        iceSkin(B, E[0], E[2], function(x){ return ok && Math.abs(x - bx) < 0.1 ? null : wallY(x); }, function(x, t, H){ if (t > H - 0.18) return '#f6fbfd';
          if (((x * 0.19 + vn(x * 0.1, 3, seed) * 0.5) % 1 + 1) % 1 < 0.035) return '#3f86b0'; var w = vn(x * 0.8, 1, seed + 3) + (vn(x * 2.6, t * 0.8, seed + 6) - 0.5) * 0.3;
          return t < 0.35 ? '#7cc0dc' : w < 0.36 ? '#7cc0dc' : w < 0.62 ? '#a4d8ea' : '#c8ecf6'; });
        seracs.forEach(function(q, k){ if (q.y > E[1] + 0.5) iceBlock(B, q.x, q.y, q.w, q.h, k + seed + 9); });   // seracs standing up out of the glacier's back
        blocks.forEach(function(b0, k){ iceBlock(B, b0.x, b0.y, 0.8 + hash(k, seed, 3) * 0.4, 1.4 + hash(k, seed, 4) * 1.2, k + seed); });
        stones.forEach(function(s0, k){ rockAt(B, s0.x, s0.y, 0.75 + hash(k, seed, 6) * 0.45, ['#7a7a80', '#9a9aa0']); });
      },
      fill:{ on:['sice'], trees:0.1, lows:0.24, tree:function(B, x, y, i){ pineAt(B, x, y, 0.65 + hash(i, seed, 51) * 0.5, i); },
        low:function(B, x, y, i){ var k = hash(i, seed, 55); if (k < 0.55) rockAt(B, x, y, 0.38, ['#7a8090', '#e8f0f6']); else iceBlock(B, x, y, 0.32, 0.5, i); } },
      bg:'#cfe6f0', gain:2.2,
      mats:{ sice:['#e8f2f7', '#f6fbfd', '#cfe4ee', 0.16, function(c, R){ var a = blot(c, 0.08, seed + 11), b = blot(c, 0.22, seed + 12); return R(a > 0.66 ? (b > 0.5 ? '#a8d8ea' : '#bfe4f0') : a > 0.6 ? '#d8eef6' : b > 0.7 ? '#f8fbfd' : '#eaf2f6'); }],
        gice:['#a8d8ea', '#c8ecf6', '#8fcde0', 0.1],
        crev:['#2f6f9a', '#8fd0e6', '#1a3f5e', 0.1, function(c, R){ var d = c.dep || 0; return R(d < 0.12 ? '#c8ecf6' : d < 0.25 ? '#8fd0e6' : d < 0.45 ? '#4a94c0' : d < 0.65 ? '#2f6f9a' : '#1a3f5e'); }],
        // the glacier's face in bands of blue, a crevasse splitting it here and there, white along the top
        gwall:['#8fcde0', '#dcf4fa', '#6fb6d0', 0.2, function(c, R){ var u = c.u || 0;
          if (c.dt !== -1) return R(blot(c, 0.1, seed + 9) > 0.64 ? '#bfe4f0' : blot(c, 0.25, seed + 8) > 0.7 ? '#e4f0f6' : '#f6fbfd');
          var w = vn(u * 0.8, 1, seed + 3); if (((u * 0.19 + vn(u * 0.1, 3, seed) * 0.5) % 1 + 1) % 1 < 0.035) return iceFace(R, '#3f86b0');
          return iceFace(R, w < 0.34 ? '#7cc0dc' : w < 0.62 ? '#9fd6ea' : '#c4eaf4'); }],
        // the mill: meltwater swirling round and down the shaft
        lagoon:['#2a8ab8', '#8fd8ee', '#1a5a84', 0.05, function(c, R){ var d = c.d || 0, sw = ((c.a || 0) / 6.283 * 2 + d * 1.6) % 1; sw = (sw + 1) % 1;
          return R(d < 0.35 ? '#123a5a' : d > 0.95 ? '#c8ecf6' : sw < 0.18 ? '#8fd8ee' : d < 0.65 ? '#1a5a84' : '#2a8ab8'); }] }
    };
  }

  /* 3. THE MELT LAKE: the ice has gone back and left its water in an old crater. The lake fills the north, ringed by the
     crater's snowy rim, with an ice shelf along its shore, floes adrift and icebergs standing in it. The shore is slush and
     mud in the thaw, and the tar pits seep on it, one with an old mammoth's bones caught in it. */
  function iceLake(L){
    var E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot;
    function lakeY(x){ return P0[1] - 2.4 - (vn(x * 0.1, 1, seed) - 0.5) * 2.2; }
    function rimY(x){ return Math.min(lakeY(x) - 5, E[1] + 4 + (vn(x * 0.12, 5, seed) - 0.5) * 3); }
    function lake(x, y){ return y < rimY(x) ? -1 : lakeY(x) - y; }
    var bergs = []; for (var i = 0; i < 3; i++){ var bx = L.cx + (i - 1) * Math.min(9, (E[2] - E[0]) * 0.28) + (hash(i, seed, 2) - 0.5) * 3, by0 = (lakeY(bx) + rimY(bx)) / 2 + (hash(i, seed, 3) - 0.5) * 1.5;
      if (lakeY(bx) - by0 > 1.6 && by0 - rimY(bx) > 1.2) bergs.push({ x:bx, y:by0, r:0.9 + hash(i, seed, 4) * 0.8, h:1.4 + hash(i, seed, 5) * 1.8 }); }
    var pits = []; for (i = 0; i < 2; i++){ var p = spot(1.9, function(x, y){ return L.side(x) * 3 + hash(x | 0, y | 0, seed + 60 + i) * 2 - Math.abs(y - L.cy) * 0.1; }, function(x, y){ return lake(x, y) < -2.4; }); if (p) pits.push(p); }
    function pitD(x, y){ var m = -1; for (var k = 0; k < pits.length; k++){ var q = pits[k]; m = Math.max(m, 1 - Math.hypot((x - q.x) / 1.7, (y - q.y) / 1.25) + (vn(x * 0.9, y * 0.9, seed + 3) - 0.5) * 0.25); } return m; }
    return {
      h:function(x, y){ var s = lake(x, y), k = sm(0.8, 3, clearAt(x, y)); var rr = rimY(x) - y; if (rr > 0) return (iceStep(rr, 1.1) + Math.min(3, rr * 0.3) + (fbm(x * 0.15, y * 0.15, seed + 5) - 0.5) * 0.3) * k;
        if (s > 0) return s < 0.5 ? -0.15 : -0.4; if (pitD(x, y) > 0) return -0.1; return (fbm(x * 0.08, y * 0.1, seed) - 0.42) * 1 * sm(1.3, 6, clearAt(x, y)) * sm(0, 1.5, -s); },
      mat:function(x, y){ if (y < rimY(x)) return ['rim', { u:x }]; var s = lake(x, y); if (s > 0){ if (s < 0.5) return ['shelf']; if (fbm(x * 0.35, y * 0.45, seed + 7) > 0.63) return ['floe']; return ['lagoon', { dep:s }]; }
        var t = pitD(x, y); if (t > 0) return ['tar', { dep:t }]; if (t > -0.12) return ['mud']; return ['thaw', { f:fbm(x * 0.12, y * 0.14, seed + 8) }]; },
      build:function(B){
        iceSkin(B, E[0], E[2], rimY, function(x, t, H){ if (t > H - 0.15) return '#f6fbfd'; var w = vn(x * 0.8, t, seed + 5); return w < 0.4 ? '#868c96' : w < 0.62 ? '#9ea4ae' : '#b8bec8'; });
        bergs.forEach(function(g, k){ iceBerg(B, g.x, g.y, g.r, g.h, -0.4, k + seed); });
        pits.forEach(function(q, k){ var zb = -0.1;
          if (k === 0){   // the bones of a mammoth that went in and never came out: the skull, its tusks, the ribs breaking the surface
            B.solid(q.x - 1.8, q.y - 1, zb - 0.2, q.x + 1.8, q.y + 1, zb + 1.6, function(px, py, pz){ var dx = px - q.x, dy = py - q.y, t = pz - zb;
              if (Math.hypot((dx - 0.5) / 0.42, dy / 0.36, t / 0.4) < 1) return Math.abs(Math.abs(dy) - 0.13) < 0.06 && t > 0.15 && dx > 0.7 ? '#3a3028' : '#e6dcc0';
              if (Math.abs(Math.abs(dy) - 0.2) < 0.07 && dx > 0.7 && dx < 1.5 && Math.abs(t - (0.1 + (dx - 0.7) * (dx - 0.7) * 1.6)) < 0.08) return '#f4ead2';
              for (var r = 0; r < 4; r++){ var rx = -0.2 - r * 0.32; if (Math.abs(dx - rx) < 0.06 && Math.abs(Math.hypot(dy, t + 0.2) - 0.62) < 0.07 && t > 0) return '#d8ccae'; }
              return null; }); }
          else { for (var b = 0; b < 3; b++){ var bx2 = q.x + (hash(b, k, seed) - 0.5) * 1.6, by2 = q.y + (hash(k, b, seed) - 0.5) * 1, br = 0.1 + hash(b, seed, 7) * 0.08;   // the tar bubbling
            B.solid(bx2 - br, by2 - br, zb - 0.05, bx2 + br, by2 + br, zb + br, function(px, py, pz){ return Math.hypot(px - bx2, py - by2, pz - zb) < br ? (pz - zb > br * 0.6 ? '#5a5048' : '#2a2420') : null; }); } } });
      },
      fill:{ on:['thaw'], trees:0.22, lows:0.3, tree:function(B, x, y, i){ if (hash(i, seed, 31) < 0.45) deadTree(B, x, y, 2.4 + hash(i, seed, 53) * 1.2, i); else pineAt(B, x, y, 0.65 + hash(i, seed, 51) * 0.5, i); },
        low:function(B, x, y, i){ iceLows(B, x, y, i, seed); } },
      bg:'#d6e2e8', gain:2.2,
      mats:{ rim:['#eef3f7', '#f8fbfd', '#dde6ec', 0.16, function(c, R){ if (c.dt === -1){ var w = vn((c.u || 0) * 0.8, 1, seed + 5); return iceFace(R, w < 0.4 ? '#868c96' : w < 0.62 ? '#9ea4ae' : '#c8d0d8'); } return ICE_SNOW[4](c, R); }],
        mud:['#5a4a38', '#6a5842', '#4a3c2e', 0.1],
        // slush and mud: snow still lying in patches, brown earth and grey slush between, the old grass here and there
        thaw:['#d8dcd8', '#e8ecec', '#c4c8c4', 0.14, function(c, R){ var f = c.f || 0.5, b = blot(c, 0.22, seed + 4);
          return R(f > 0.54 ? '#eef3f7' : f > 0.49 ? '#d4dad8' : f > 0.4 ? (b > 0.55 ? '#a8a6a0' : '#b8b6ae') : b > 0.62 ? '#7e7a5a' : '#6e6052'); }],
        shelf:['#e4f4fa', '#ffffff', '#c8e6f0', 0.12], floe:['#eef8fc', '#ffffff', '#d4eef6', 0.1, function(c, R){ return R(blot(c, 0.3, seed + 6) > 0.65 ? '#d4eef6' : '#f2fafd'); }],
        lagoon:['#3a9cc4', '#8fd8ee', '#1f6f9a', 0.05, function(c, R){ var d = c.dep || 0; return R(d < 1 ? '#6cc4e2' : d < 2.6 ? '#3a9cc4' : '#2a82ae'); }],
        tar:['#1e1a16', '#3a3028', '#141210', 0.08, function(c, R){ var d = c.dep || 0; return R(d < 0.1 ? '#3a3028' : blot(c, 0.25, seed + 7) > 0.72 ? '#3a3a46' : d < 0.3 ? '#262019' : '#18140f'); }] }
    };
  }

  /* 4. THE PAINTED CAVES: a cliff behind the hole climbs in ledges, snow on every step. Its lowest face is painted with the
     herd in ochre and soot, two cave mouths open at its foot with torches either side, and the cave people's camp stands
     to one side: tents of hide, a fire, a rack of skins drying. */
  function iceCaves(L){
    var E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot;
    function cliffY(x){ return P0[1] - 2.8 - (vn(x * 0.11, 2, seed) - 0.5) * 1.6; }
    function zOf(r){ return iceStep(r, 2.8) + iceStep(r - 2.4, 1.7) + iceStep(r - 4.8, 1.7) + iceStep(r - 7.2, 1.6) + Math.min(r, 9) * 0.12; }
    var w = Math.min(7.5, (E[2] - E[0]) * 0.22), mouths = [L.cx - w + (hash(seed, 1, 4) - 0.5) * 2, L.cx + w + (hash(seed, 2, 4) - 0.5) * 2].filter(function(x){ return x > E[0] + 2 && x < E[2] - 2; });
    mouths.forEach(function(x){ L.used.push({ x:x, y:cliffY(x) + 0.8, r:1.8 }); });
    var camp = spot(2.6, function(x, y){ return L.side(x) * 4 - Math.abs(y - L.cy) * 0.15 + hash(x | 0, y | 0, seed + 80); }, function(x, y){ return y > cliffY(x) + 2.6; });
    // the herd on the rock: a mammoth every few feet along the face, now and then a hand print, in ochre and in soot
    var panels = []; for (var pi = 0; pi < 5; pi++){ var px0 = L.cx + (pi - 2) * 4.2 + (hash(pi, seed, 8) - 0.5) * 1.2; if (px0 > E[0] + 2 && px0 < E[2] - 2 && !mouths.some(function(m){ return Math.abs(m - px0) < 2.7; })) panels.push({ x:px0, cell:pi }); }
    // a panel of the herd on the rock: a mammoth in ochre or in soot with chalk tusks, and the painters' hands beside it
    function art(p, z, cell){ var ink = hash(cell, 3, seed) < 0.6 ? '#c8582e' : '#2a201a', m = p + 0.5;
      if (Math.hypot(m / 0.85, (z - 1.6) / 0.42) < 1 || Math.hypot((m + 0.3) / 0.36, (z - 1.95) / 0.3) < 1 || Math.hypot((m - 0.85) / 0.3, (z - 1.68) / 0.3) < 1) return ink;
      if (Math.abs(m - 1.08 - (z < 1.2 ? (1.2 - z) * 0.4 : 0)) < 0.07 && z > 0.95 && z < 1.6) return ink;   // the trunk
      if (z > 0.8 && z < 1.3 && [-0.6, -0.3, 0.25, 0.5].some(function(q){ return Math.abs(m - q) < 0.08; })) return ink;   // the legs
      if (Math.abs(z - (1.38 + (m - 0.95) * (m - 0.95) * 1.6)) < 0.05 && m > 0.95 && m < 1.45) return '#efe6d0';   // a chalk tusk
      for (var h = 0; h < 2; h++){ var hx = p - 1.2 - h * 0.35, hz = z - (h ? 1.25 : 1.85); if (Math.hypot(hx / 0.13, hz / 0.15) < 1) return '#b8502e';
        if (hz > 0.1 && hz < 0.36 && Math.abs(hx) < 0.15 && Math.abs(((hx + 0.15) % 0.075) - 0.037) < 0.017) return '#b8502e'; }
      return null; }
    return {
      h:function(x, y){ var r = cliffY(x) - y, k = sm(0.8, 3, clearAt(x, y)); if (r > 0) return (zOf(r) + (fbm(x * 0.2, y * 0.2, seed + 5) - 0.5) * 0.25 * sm(0.4, 1, r)) * k;
        return (fbm(x * 0.08, y * 0.1, seed) - 0.42) * 1 * sm(1.3, 6, clearAt(x, y)); },
      mat:function(x, y){ var r = cliffY(x) - y; if (r > 0) return ['crag', { u:x, low:r < 2.4 ? 1 : 0 }]; return ['trod']; },
      build:function(B){
        mouths.forEach(function(x, k){ var y = cliffY(x) + 0.15, zb = B.gz(x, y + 0.6);   // a cave mouth: a ring of rock round the dark, a torch either side
          B.solid(x - 1.6, y - 0.5, zb - 0.2, x + 1.6, y + 0.7, zb + 2.6, function(px, py, pz){ var dx = px - x, t = pz - zb, e = Math.hypot(dx / 1.1, t / 1.9); if (py - y > 0.5 || py - y < -0.4) return null;
            if (e < 1) return py - y < 0.1 ? '#120e0c' : null; if (e < 1.32 + (vn(dx * 3, t * 3, k) - 0.5) * 0.2) return vn(px * 2, pz * 2, k + 3) < 0.45 ? '#5e5650' : '#746a62'; return null; });
          iceTorch(B, x - 1.8, y + 0.9); iceTorch(B, x + 1.8, y + 0.9); });
        // the faces of the cliff, each a skin of split rock; the lowest carries the paintings
        [0, 2.4, 4.8, 7.2].forEach(function(o, f){ iceSkin(B, E[0], E[2], function(x){ if (!f && mouths.some(function(m){ return Math.abs(m - x) < 1.25; })) return null; return cliffY(x) - o; }, function(x, t, H){
          if (!f) for (var q = 0; q < panels.length; q++) if (Math.abs(x - panels[q].x) < 1.9){ var a = art(x - panels[q].x, t, panels[q].cell); if (a) return a; }
          if (t > H - 0.12) return '#e8eef2'; var w2 = vn(x * 0.7, f + t * 0.6, seed + 3); return w2 < 0.34 ? '#7a6e62' : w2 > 0.66 ? '#a89c8c' : '#8e8274'; }); });
        if (camp){ var X = camp.x, Y = camp.y; iceFire(B, X, Y + 0.3); iceTent(B, X - 1.6, Y - 1, seed); iceTent(B, X + 1.5, Y - 1.3, seed + 3);
          var rx = X + (X < L.cx ? -1.9 : 1.9), ry = Y + 0.9, rz = B.gz(rx, ry);   // the rack, a hide stretched on it
          B.solid(rx - 0.9, ry - 0.2, rz, rx + 0.9, ry + 0.2, rz + 1.7, function(px, py, pz){ var dx = px - rx, t = pz - rz; if (Math.abs(py - ry) > 0.12) return null;
            if (Math.abs(Math.abs(dx) - 0.75) < 0.06 && t < 1.6) return '#e8dcc0'; if (t > 1.5 && t < 1.6 && Math.abs(dx) < 0.8) return '#e8dcc0';
            if (Math.abs(dx) < 0.62 && t > 0.55 && t < 1.5 && Math.abs(dx) < 0.62 - Math.abs(t - 1.02) * 0.4) return vn(px * 3, pz * 3, 4) < 0.45 ? '#8a6038' : '#a8784a'; return null; }); }
      },
      fill:{ on:['trod'], trees:0.2, lows:0.3, tree:function(B, x, y, i){ pineAt(B, x, y, 0.7 + hash(i, seed, 51) * 0.5, i); }, low:function(B, x, y, i){ iceLows(B, x, y, i, seed); } },
      bg:'#d8e0e4', gain:2.1,
      mats:{
        // trodden snow: a camp's paths worn through to the earth in broad patches
        trod:['#e8eef2', '#f4f8fa', '#d4dde4', 0.14, function(c, R){ var a = blot(c, 0.09, seed + 21), b = blot(c, 0.25, seed + 22); return R(a > 0.68 ? (b > 0.5 ? '#9a8468' : '#8a7458') : a > 0.62 ? '#c8c4b8' : b > 0.7 ? '#f6f9fb' : '#e8eef2'); }],
        // the cliff: rock in its faces (each column of a face is one stone, so it reads as split rock), snow on every ledge
        crag:['#7a6e62', '#968a7c', '#5e5448', 0.2, function(c, R){ var u = c.u || 0;
          if (c.dt !== -1) return ICE_SNOW[4](c, R);
          var w2 = vn(u * 0.7, c.low ? 1 : 2, seed + 3); return iceFace(R, w2 < 0.34 ? '#7a6e62' : w2 > 0.66 ? '#a89c8c' : '#8e8274'); }] }
    };
  }

  /* 5. MAMMOTH PEAK: the mountain itself fills the north, rock low down and snow from its shoulders to the top. The herd
     has gathered under it, the old bull biggest of all, and the cave people have raised an arch of two great tusks with a
     fire burning under it. */
  function icePeak(L){
    var E = L.E, P0 = L.P0, P1 = L.P1, seed = L.seed, clearAt = L.clearAt, spot = L.spot;
    var mx = L.cx + (hash(seed, 9, 2) - 0.5) * Math.min(8, (E[2] - E[0]) * 0.25);
    function baseY(x){ return P0[1] - 4.2 - (vn(x * 0.12, 7, seed) - 0.5) * 2; }
    // the mountain climbs in cliffs of rock with snow lying on every step, up to a ridge that peaks behind the hole
    function mtn(x, y){ var r = baseY(x) - y; if (r <= 0) return 0; var ridge = 10 - Math.abs(x - mx) * 0.7 + (vn(x * 0.18, 3, seed) - 0.5) * 2, o = vn(x * 0.15, 6, seed) * 1.2;
      var z = iceStep(r, 1.6) + iceStep(r - 2.2 - o, 1.8) + iceStep(r - 4.6 - o, 2) + iceStep(r - 7 - o * 1.5, 2.2) + iceStep(r - 9.6 - o, 2.2) + Math.min(r, 14) * 0.25 + (fbm(x * 0.15, y * 0.15, seed + 5) - 0.5) * 0.25;
      return Math.min(z, Math.max(1.6, ridge)); }
    function oOf(x){ return vn(x * 0.15, 6, seed) * 1.2; }
    var PK = [function(x){ return 0; }, function(x){ return 2.2 + oOf(x); }, function(x){ return 4.6 + oOf(x); }, function(x){ return 7 + oOf(x) * 1.5; }, function(x){ return 9.6 + oOf(x); }];
    var herd = []; for (var i = 0; i < 5; i++){ var big = i === 0, m = spot(big ? 2.4 : 1.8, function(x, y){ return L.north(x, y) * (big ? 0.7 : 0.3) + L.side(x) * 2 + hash(x | 0, y | 0, seed + 9 + i) * 2.5; }, function(x, y){ return y > baseY(x) + (big ? 2.4 : 1.6); }); if (m) herd.push({ x:m.x, y:m.y, s:big ? 1.4 : 0.9 + hash(i, seed, 2) * 0.25 }); }
    var arch = spot(2.4, function(x, y){ return L.side(x) * 4 - Math.abs(y - L.cy) * 0.15 + hash(x | 0, y | 0, seed + 70); }, function(x, y){ return y > baseY(x) + 2.4; });
    return {
      h:function(x, y){ var k = sm(0.8, 3, clearAt(x, y)), z = mtn(x, y); if (z > 0) return z * k; return (fbm(x * 0.08, y * 0.1, seed) - 0.42) * 1.1 * sm(1.3, 6, clearAt(x, y)); },
      mat:function(x, y){ var z = mtn(x, y); if (z > 0.3) return ['mount', { z:z, u:x }]; return ['pow', { f:fbm(x * 0.12, y * 0.14, seed + 8) }]; },
      build:function(B){
        herd.forEach(function(m, k){ iceMammoth(B, m.x, m.y, k + seed, m.s, hash(k, 5, seed) < 0.5 ? 1 : -1); });
        PK.forEach(function(o, f){ iceSkin(B, E[0], E[2], function(x){ return baseY(x) - o(x); }, function(x, t, H){ var top = B.gz(x, baseY(x) - o(x) - 0.2);
          if (t > H - 0.14) return '#f4f8fb'; var w2 = vn(x * 0.8, f + t * 0.5, seed + 3); if (top > 7.5) return w2 < 0.4 ? '#b4c0ce' : '#dce6ee'; return w2 < 0.34 ? '#7a7e8a' : w2 > 0.66 ? '#a8acb6' : '#8e929e'; }); });
        if (arch){ var X = arch.x, Y = arch.y, zb = B.gz(X, Y);   // two tusks set in the snow, their tips meeting overhead
          B.solid(X - 2, Y - 0.3, zb - 0.1, X + 2, Y + 0.3, zb + 3.6, function(px, py, pz){ var dx = px - X, t = pz - zb; if (Math.abs(py - Y) > 0.22) return null;
            for (var s = -1; s <= 1; s += 2){ var cx = s * 1.75, r = Math.hypot(dx - cx, t); if (s * (dx - cx) <= 0.05 && Math.abs(r - 1.75) < 0.2 - t * 0.03 && t < 3.4) return t < 0.3 ? '#a8987a' : '#f4ead2'; }
            return null; });
          iceFire(B, X, Y + 1.2); }
      },
      fill:{ on:['pow'], trees:0.3, lows:0.26, tree:function(B, x, y, i){ pineAt(B, x, y, 0.75 + hash(i, seed, 51) * 0.6, i); }, low:function(B, x, y, i){ iceLows(B, x, y, i, seed); } },
      bg:'#d4e2ec', gain:2.2,
      mats:{ pow:['#eef3f7', '#f8fbfd', '#dde6ec', 0.16, function(c, R){ var f = c.f || 0.5, b = blot(c, 0.22, seed + 4); return R(f < 0.34 ? (b > 0.55 ? '#a8985e' : '#c8c2a8') : f > 0.62 ? '#dce6ef' : b > 0.7 ? '#f8fbfd' : '#eef3f7'); }],
        // the mountain: grey rock with snow in its gullies low down, all snow from the shoulders up
        mount:['#8a8e98', '#a8acb4', '#6a6e78', 0.2, function(c, R){ var z = c.z || 0, u = c.u || 0, w2 = vn(u * 0.8, 2, seed + 3);
          if (c.dt !== -1) return R(z > 6 || blot(c, 0.1, seed + 7) < 0.6 ? (blot(c, 0.25, seed + 8) > 0.7 ? '#dce8f2' : '#f6fbfd') : '#c8d2dc');
          if (z > 7.5) return iceFace(R, w2 < 0.4 ? '#b4c0ce' : '#dce6ee'); return iceFace(R, w2 < 0.34 ? '#7a7e8a' : w2 > 0.66 ? '#a8acb6' : '#8e929e'); }] }
    };
  }
  /* ---------------- MOON BASE IS A JOURNEY. Out of the lander onto the grey plain, the flag planted and the rover parked
     (1 to 4), across the crater field with its boulders (5 to 8), into the base with its domes, modules and radar dish (9 to
     12), round to the far side where the earth never rises and the big dish listens (13 to 16), and out to the launch pad,
     the rocket standing ready (17 and 18). The earth hangs in the black sky over every stop but the far side. Gentle ground
     only: a crater is a shallow bowl with a soft rim, never a cliff, so the land's rows never part. */
  STOPS.moon = [[1, 'landing'], [5, 'craters'], [9, 'station'], [13, 'farside'], [17, 'launch']];
  (function(){ BUILD.moon = function(L){ var s = L.stop; return s === 'launch' ? moonLaunch(L) : s === 'farside' ? moonFar(L) : s === 'station' ? moonStation(L) : s === 'craters' ? moonCraters(L) : moonLanding(L); }; })();

  // the regolith: grey dust in broad patches, darker where a crater's floor lies, a pale ray thrown out round a fresh one
  function moonDust(dark){ var a = dark ? ['#5e5c66', '#6a6872', '#52505a', '#74727c'] : ['#9a98a2', '#a8a6b0', '#8a8892', '#b6b4bc'];
    return [a[0], a[1], a[2], 0.14, function(c, R){ var f = c.cr || 0, b = blot(c, 0.18, 71), n = blot(c, 0.5, 72);
      // the big crater's rim round the hole: its inner face shaded on the sun side and lit on the far one, its outer face the other way about
      if (c.rim) return R(c.rim === 2 ? (dark ? '#3a3842' : '#62606a') : c.rim === 3 ? (dark ? '#74727c' : '#c4c2ca') : c.rim === 4 ? a[3] : a[2]);
      if (f > 0.15) return R(f > 0.75 ? a[2] : n > 0.6 ? a[0] : a[2]); if (f < -0.05 && f > -0.35 && n > 0.55) return R(a[3]);
      return R(b > 0.66 ? a[1] : b < 0.3 ? a[2] : (c.ti * 7 + c.tj * 13) % 41 === 0 ? a[3] : a[0]); }]; }
  // craters as shallow bowls: cr > 0 inside (1 at the middle), a soft raised rim just outside it
  function moonPits(L, n, rMin, rMax, salt){ var out = []; for (var i = 0; i < n; i++){ var r = rMin + hash(i, salt, L.seed) * (rMax - rMin);
      var q = L.spot(r + 0.6, function(x, y){ return hash(x | 0, y | 0, L.seed + salt + i) * 3 + L.north(x, y) * 0.1; }); if (q) out.push({ x:q.x, y:q.y, r:r }); }
    function cr(x, y){ var best = -1; for (var k = 0; k < out.length; k++){ var p = out[k], d = Math.hypot(x - p.x, (y - p.y) * 1.1) / p.r; best = Math.max(best, 1 - d); } return best; }
    function h(x, y){ var t = cr(x, y); return t > 0 ? -0.45 * Math.sin(t * Math.PI / 2) : t > -0.4 ? 0.18 * Math.sin((t + 0.4) / 0.4 * Math.PI) : 0; }
    return { list:out, cr:cr, h:h }; }
  // the earth, hanging high over the back of the land: blue seas, green and brown land, white cloud, the night side dark
  function moonEarth(B, L){ var X = L.cx + (L.P1[0] - L.P0[0]) * 0.3, Y = L.E[1] - 3.2, Z = 7.6, R = 2.6;   // north of the land, so the shadow pass never reaches its column and lays a blue pool under it
    B.solid(X - R, Y - R, Z - R, X + R, Y + R, Z + R, function(px, py, pz){ var dx = (px - X) / R, dy = (py - Y) / R, dz = (pz - Z) / R; if (dx * dx + dy * dy + dz * dz > 1) return null;
      if (dx * 0.7 - dz * 0.5 > 0.42) return '#0e1a3a'; var n = vn(px * 1.3 + 4, pz * 1.3 + py * 0.5, 91), c = vn(px * 2.2, pz * 2.2 + 9, 92);
      if (c > 0.72) return '#f4f8ff'; if (n > 0.6) return n > 0.7 ? '#8a7a4a' : '#4a8a3a'; return dz > 0.5 ? '#5a9ae8' : '#2f6fd0'; }); }
  // the lander: gold foil descent stage on four splayed legs and pads, the white ascent stage on top with its dark window
  function moonLander(B, X, Y){ var zb = B.gz(X, Y);
    B.solid(X - 2.2, Y - 2.2, zb - 0.05, X + 2.2, Y + 2.2, zb + 4.2, function(px, py, pz){ var dx = px - X, dy = py - Y, t = pz - zb, ax = Math.abs(dx), ay = Math.abs(dy);
      for (var q = 0; q < 4; q++){ var sx = q & 1 ? 1 : -1, sy = q & 2 ? 1 : -1, u = 1 - t / 1.6; if (t < 1.6 && Math.hypot(dx - sx * (0.9 + u * 0.9), dy - sy * (0.9 + u * 0.9)) < 0.1) return '#c8c8d0';
        if (t < 0.12 && Math.hypot(dx - sx * 1.8, dy - sy * 1.8) < 0.32) return '#9a9aa4'; }
      if (t > 1.1 && t < 2.3 && ax < 1.05 && ay < 1.05) return (((px * 4 | 0) + (pz * 4 | 0)) % 3) ? '#e0b040' : '#b8862a';
      if (t >= 2.3 && t < 3.6 && ax + ay * 0.6 < 1 && ay < 0.9) return dy > 0.6 && t > 2.8 && t < 3.3 && ax < 0.35 ? '#1a2240' : t > 3.4 ? '#c8ccd8' : '#eef0f4';
      if (ax < 0.05 && ay < 0.05 && t >= 3.6 && t < 4.1) return '#c8c8d0'; return null; }); }
  // a flag on its pole, the top bar holding it out where no wind will
  function moonFlag(B, X, Y){ var zb = B.gz(X, Y);
    B.solid(X - 0.1, Y - 0.1, zb, X + 1.4, Y + 0.1, zb + 2.6, function(px, py, pz){ var t = pz - zb, dx = px - X;
      if (dx < 0.06 && t < 2.6) return '#e8e8ec'; if (t > 1.7 && t < 2.5 && dx > 0.06 && dx < 1.35 && Math.abs(py - Y) < 0.05) return t > 2.3 ? '#3f7fe0' : (((dx * 5) | 0) % 2 ? '#ffffff' : '#e5483a'); return null; }); }
  // the rover: a low grey chassis on four wire wheels, two seats, an antenna and a little gold dish
  function moonRover(B, X, Y){ var zb = B.gz(X, Y);
    B.solid(X - 1.4, Y - 1, zb - 0.05, X + 1.4, Y + 1, zb + 2, function(px, py, pz){ var dx = px - X, dy = py - Y, t = pz - zb, ax = Math.abs(dx), ay = Math.abs(dy);
      if (Math.abs(ax - 0.95) < 0.2 && Math.abs(ay - 0.75) < 0.12 && Math.hypot(ax - 0.95, t - 0.32) < 0.32) return Math.hypot(ax - 0.95, t - 0.32) > 0.22 ? '#3a3a42' : '#8a8a94';
      if (t > 0.5 && t < 0.72 && ax < 1.3 && ay < 0.7) return '#b8bcc8'; if (t >= 0.72 && t < 1.1 && Math.abs(ax - 0.3) < 0.2 && ay < 0.5 && dx > -0.6) return '#4a5470';
      if (Math.abs(dx + 1) < 0.04 && Math.abs(dy) < 0.04 && t < 1.8) return '#c8c8d0'; if (Math.hypot(dx + 1, dy, t - 1.8) < 0.28 && dx > -1.05) return '#e0b040'; return null; }); }
  // a white dome with its panel seams and a lit window band
  function moonDome(B, X, Y, R){ var zb = B.gz(X, Y) - 0.05; if (B.light) B.light(X, Y + R, zb + R * 0.4, '#7fd8ff');
    B.solid(X - R, Y - R, zb, X + R, Y + R, zb + R, function(px, py, pz){ var dx = px - X, dy = py - Y, t = pz - zb, d = Math.hypot(dx, dy, t) / R; if (d > 1 || d < 0.9) return null;
      if (t < R * 0.42 && t > R * 0.28) return (((Math.atan2(dy, dx) * 6) | 0) % 2) ? '#bfefff' : '#3f6ad8'; return (Math.abs(Math.sin(Math.atan2(dy, dx) * 5)) < 0.08 || Math.abs(t - R * 0.7) < 0.05) ? '#b8c0d0' : '#eef2f8'; }); }
  // a station module: a long white box on its side, a blue band, a porthole, its end caps grey
  function moonModule(B, X, Y, w){ var zb = B.gz(X, Y), H = 1.6;
    B.solid(X - w / 2, Y - 0.9, zb, X + w / 2, Y + 0.9, zb + H, function(px, py, pz){ var dx = px - X, dy = py - Y, t = pz - zb, r = Math.hypot(dy, t - 0.85);
      if (r > 0.85 || Math.abs(dx) > w / 2) return null; if (Math.abs(dx) > w / 2 - 0.2) return '#8a96b0'; if (Math.abs(t - 0.4) < 0.1) return '#3f7fe0';
      if (dy > 0.6 && Math.abs(t - 1.05) < 0.14 && (((dx + 9) * 0.8 | 0) % 2)) return '#7fd8ff'; return ((dx * 1.5 | 0) % 3) ? '#eef2f8' : '#c8d0de'; }); }
  // a radar dish on its post, tipped up to the sky
  function moonDish(B, X, Y, R){ var zb = B.gz(X, Y), H = R * 1.4;
    B.solid(X - R, Y - R, zb, X + R, Y + R, zb + H + R, function(px, py, pz){ var dx = px - X, dy = py - Y, t = pz - zb;
      if (Math.hypot(dx, dy) < 0.12 && t < H) return '#8a96b0'; var u = dx, v = (dy * 0.6 + (t - H) * 0.8), w2 = (-dy * 0.8 + (t - H) * 0.6);   // the dish's own frame, tipped back
      var rr = Math.hypot(u, v); if (rr < R && Math.abs(w2 - rr * rr / (R * 2.2)) < 0.12) return rr > R * 0.92 ? '#8a96b0' : '#e8ecf4'; if (rr < 0.08 && w2 > 0 && w2 < R * 0.7) return '#c8ccd8'; return null; }); }
  // the rocket on its pad: a tall white body with a black band and red fins, the gantry beside it, its lights lit
  function moonRocket(B, X, Y){ var zb = B.gz(X, Y), H = 9; if (B.light){ B.light(X + 1.8, Y, zb + 4, '#ff5577'); B.light(X, Y + 2, zb + 0.5, '#ffd34d'); }
    B.solid(X - 2.6, Y - 2.6, zb - 0.05, X + 2.6, Y + 2.6, zb + H + 1.6, function(px, py, pz){ var dx = px - X, dy = py - Y, t = pz - zb, r = Math.hypot(dx, dy);
      if (t < 0.3 && Math.abs(dx) < 2.5 && Math.abs(dy) < 2.5) return (((px * 2 | 0) + (py * 2 | 0)) % 2) ? '#5a5e6a' : '#4a4e5a';   // the pad
      var rr = t > H - 1.6 ? 0.75 * (H + 1.4 - t) / 3 : 0.75; if (t >= 0.3 && t < H + 1.4 && r < rr) return Math.abs(t - 5.2) < 0.4 ? '#1a1e2a' : t > H - 1.6 ? '#e5483a' : (dy > 0.5 && Math.abs(t - 7) < 0.25 && Math.abs(dx) < 0.2) ? '#7fd8ff' : '#f4f6fa';
      if (t >= 0.3 && t < 2.2 && Math.abs(dy) < 0.08 && Math.abs(dx) < 0.75 + (2.2 - t) * 0.5 && Math.abs(dx) > 0.7) return '#e5483a';   // the fins
      if (Math.abs(dx - 1.9) < 0.3 && Math.abs(dy) < 0.3 && t < H - 0.5) return (Math.abs(px - X - 1.9) > 0.22 || Math.abs(dy) > 0.22 || ((t * 2) | 0) % 2) ? '#8a7a5a' : null;   // the gantry
      if (Math.abs(t - 6) < 0.1 && dx > 0.7 && dx < 1.9 && Math.abs(dy) < 0.1) return '#8a7a5a'; return null; }); }
  function moonLows(B, x, y, i, seed, dark){ var k = hash(i, seed, 52); rockAt(B, x, y, 0.25 + k * 0.35, dark ? ['#4a4852', '#6a6872'] : ['#8a8892', '#b6b4bc']); }
  /* EVERY MOON BASE HOLE SITS IN A CRATER (the owner, 2026-11-01): a broad rim rises round the back and the sides of the
     course, from about six feet off its rail to ten, and falls away outside. It is kept off the near side, where it would
     stand between the camera and the carpet. Its inner face toward the sun (the upper left) is in its own shadow. */
  function moonRim(L, x, y){ var c = L.clearAt(x, y), k = y < L.P1[1] ? 1 : 1 - sm(L.P1[1], L.P1[1] + 4, y); if (k <= 0 || c < 5) return 0;
    return k * (c < 10 ? 1.25 * sm(5, 10, c) : 1.25 * (1 - sm(10, 15, c))); }
  function moonBase(L, o){ var seed = L.seed, pits = moonPits(L, o.pits || 4, o.rMin || 1.4, o.rMax || 3, 31), dark = !!o.dark;
    return { pits:pits,
      h:function(x, y){ return pits.h(x, y) * sm(0.6, 2.2, L.clearAt(x, y)) + (fbm(x * 0.08, y * 0.1, seed) - 0.45) * 0.8 * sm(1.3, 6, L.clearAt(x, y)) + moonRim(L, x, y); },
      mat:function(x, y){ var r = moonRim(L, x, y), c = L.clearAt(x, y), rf = 0; if (r > 0.15){ var sunSide = (x - L.cx) * -0.79 + (y - L.cy) * -0.61 > 0; rf = c < 10 ? (sunSide ? 2 : 3) : (sunSide ? 4 : 5); }
        return ['reg', { cr:pits.cr(x, y), rim:rf }]; },
      fill:{ on:['reg'], trees:o.boulders == null ? 0.12 : o.boulders, lows:0.3, tree:function(B, x, y, i){ rockAt(B, x, y, 0.8 + hash(i, seed, 51) * 0.9, dark ? ['#52505a', '#74727c'] : ['#8a8892', '#c8c6ce']); },
        low:function(B, x, y, i){ moonLows(B, x, y, i, seed, dark); } },
      // the stars: only in the black over the horizon (the land's far edge), never on the ground
      after:function(ctx, V){ var top = V.pr(L.cx, L.E[1], 0)[1] - 2; if (top < 4) return;
        for (var i = 0; i < 140; i++){ var x = hash(i, 1, seed) * V.W, y = hash(i, 2, seed) * top, a = 0.35 + hash(i, 3, seed) * 0.65;
          ctx.fillStyle = 'rgba(232,240,255,' + a.toFixed(2) + ')'; ctx.fillRect(x | 0, y | 0, hash(i, 4, seed) < 0.12 ? 2 : 1, hash(i, 4, seed) < 0.12 ? 2 : 1); } },
      bg:'#05060f', gain:2, mats:{ reg:moonDust(dark) } }; }

  // 1. THE LANDING (and every Moon Base hole with no place): the lander behind the hole, the flag beside it, the rover parked
  function moonLanding(L){ var O = moonBase(L, { pits:4 }), ld = L.spot(2.4, function(x, y){ return L.north(x, y) * 0.6 - Math.abs(x - L.cx) * 0.2; }),
      fl = L.spot(0.8, function(x, y){ return L.north(x, y) * 0.3 + L.side(x) * 2; }), rv = L.spot(1.5, function(x, y){ return L.side(x) * 3 + L.north(x, y) * 0.2; });
    O.build = function(B){ moonEarth(B, L); if (ld) moonLander(B, ld.x, ld.y); if (fl) moonFlag(B, fl.x, fl.y); if (rv) moonRover(B, rv.x, rv.y); }; return O; }
  // 2. THE CRATER FIELD: big shallow craters close together, boulders thrown out round them
  function moonCraters(L){ var O = moonBase(L, { pits:8, rMin:1.8, rMax:4, boulders:0.3 }), rv = L.spot(1.5, function(x, y){ return L.side(x) * 3 - L.north(x, y) * 0.1; });
    O.build = function(B){ moonEarth(B, L); if (rv) moonRover(B, rv.x, rv.y); }; return O; }
  // 3. THE STATION: domes and modules behind the hole, the radar dish, lamps along the way in
  function moonStation(L){ var O = moonBase(L, { pits:2, boulders:0.05 }), dm = [], md = [], i;
    for (i = 0; i < 2; i++){ var d = L.spot(2.4, function(x, y){ return L.north(x, y) * 0.7 + hash(x | 0, y | 0, L.seed + 3 + i); }); if (d) dm.push(d); }
    for (i = 0; i < 2; i++){ var m = L.spotRect(4.2, 2, function(x, y){ return L.north(x, y) * 0.5 + L.side(x) * 2 + hash(x | 0, y | 0, L.seed + 7 + i); }); if (m) md.push(m); }
    var ds = L.spot(1.8, function(x, y){ return L.side(x) * 3 + L.north(x, y) * 0.3; }), lp = L.scatter(5, function(x, y){ return L.clearAt(x, y) < 3; }, 61).slice(0, 4);
    O.build = function(B){ moonEarth(B, L); dm.forEach(function(d){ moonDome(B, d.x, d.y, 2.2); }); md.forEach(function(m){ moonModule(B, m.x, m.y, 4); }); if (ds) moonDish(B, ds.x, ds.y, 1.5);
      lp.forEach(function(q){ lamp(B, q[0], q[1], '#8a96b0', '#7fd8ff'); }); }; return O; }
  // 4. THE FAR SIDE: darker ground and no earth in the sky, only the big dish listening
  function moonFar(L){ var O = moonBase(L, { pits:5, dark:true, boulders:0.2 }), ds = L.spot(3, function(x, y){ return L.north(x, y) * 0.8; });
    O.build = function(B){ if (ds) moonDish(B, ds.x, ds.y, 2.8); }; O.bg = '#020308'; return O; }
  // 5. THE LAUNCH PAD: the rocket standing ready behind the hole, the earth over it
  function moonLaunch(L){ var O = moonBase(L, { pits:3, boulders:0.08 }), rk = L.spot(2.8, function(x, y){ return L.north(x, y) * 0.8 - Math.abs(x - L.cx) * 0.15; }),
      fl = L.spot(0.8, function(x, y){ return L.side(x) * 2 + L.north(x, y) * 0.2; });
    O.build = function(B){ moonEarth(B, L); if (rk) moonRocket(B, rk.x, rk.y); if (fl) moonFlag(B, fl.x, fl.y); }; return O; }
  // @@WORLD STOPS END@@
  return { make:make, stops:STOPS, fly:FLY };
})();
