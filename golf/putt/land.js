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
    var xs = C.poly.map(function(p){ return p[0]; }), ys = C.poly.map(function(p){ return p[1]; });
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
    var L = { dist:dist, C:C, E:E, P0:P0, P1:P1, cx:cx, cy:cy, seed:seed, spot:spot, spotRect:spotRect, north:north, far:far, side:side, used:used, clearAt:clearAt, route:route, scatter:scatter };
    var O = BUILD[C.theme] ? BUILD[C.theme](L) : null;
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
  function lamp(B, x, y, pole, glow){ var zb = B.gz(x, y);
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

  return { make:make };
})();
