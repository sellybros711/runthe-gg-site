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
    var L = { leg:C.leg || 0, dist:dist, C:C, E:E, P0:P0, P1:P1, cx:cx, cy:cy, seed:seed, spot:spot, spotRect:spotRect, north:north, far:far, side:side, used:used, clearAt:clearAt, route:route, scatter:scatter };
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
  // a ground colour that varies in patches: base, two alternates, and how often the alternates show
  function patchy(c, R, h3, t){ var n1 = h3(c.ti >> 1, c.tj >> 1, 11), n2 = h3(c.ti, c.tj, 12); return R(n1 < t[3] ? (n2 < 0.5 ? t[1] : t[2]) : t[0]); }

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
  BUILD.pirate = function(L){ var g = L.leg || 0; return g >= 17 ? pirCove(L) : g >= 13 ? pirSkull(L) : g >= 9 ? pirJungle(L) : g >= 5 ? pirTown(L) : pirBeach(L); };

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

  // Secret Recipe: steel plate underfoot, pink brick walls, chocolate vats and the pipes between them
  BUILD['s-recipe'] = function(L){ var R0 = room(L, { floor:'plate', wall:'pbrick', wallH:7.5, gap:2.6 });
    return { h:R0.h, mat:R0.mat,
      build:function(B){ byWall(L, 4, 14, 4).forEach(function(q){ cyl(B, q[0], q[1], 1.5, 3.2, function(d, t){ if (t > 3) return d < 0.86 ? '#5a2e14' : '#c8ccd2'; return (Math.floor(t * 2) % 2) ? '#c8ccd2' : '#a8acb4'; }); });
        byWall(L, 3, 24, 2.4).forEach(function(q){ var x = q[0], y = q[1], zb = B.gz(x, y); B.solid(x - 0.3, y - 0.3, zb, x + 0.3, y + 0.3, zb + 6, function(px, py){ return Math.hypot(px - x, py - y) < 0.25 ? '#ff5fa2' : null; }); }); },
      bg:'#3a1c2a', gain:1.7,
      mats:{ plate:['#8a8e96', '#9a9ea6', '#7a7e86', 0.06, function(c, R){ return R(((c.ti + c.tj) % 4 === 0 || (c.ti - c.tj + 400) % 4 === 0) ? '#a8acb4' : '#8a8e96'); }],
        pbrick:['#d8487a', '#e8588a', '#c8386a', 0.1, function(c, R){ var z = c.z || 0, row = (z * 3) | 0; return R(((c.ti + (row % 2) * 2) % 4 === 0 || Math.abs(z * 3 - row) < 0.12) ? '#f4d8e0' : '#d8487a'); }] } }; };

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

  return { make:make };
})();
