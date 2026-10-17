/* Each island's landmark: the place that says which game it is. Built with hole3d's B.solid, in feet, x east,
   y south (toward the camera), z up. The server picks the kind (functions/_skyworld/kinds.js): the game's own,
   else its sport, else the big top. LM[kind](box, x, y, z, s, g): s scales it to the island. */
(function(){
function h3(x, y, s){ var n = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return n - Math.floor(n); }
function ell(dx, dy, a, b){ return Math.hypot(dx / a, dy / b); }
var W = '#f4f1e8', GRASS = ['#3f9a46', '#47a84e'], DIRT = '#b8865a', STEEL = '#8a8e96', SEAT = '#9a968a';

// a bowl of stands round a field: football, college, the default for a stadium game
function bowl(box, x, y, z, w, d, h, o){
  var A = w / 2, Bv = d / 2, f = 0.6;
  box(x, y, z, w + 0.2, d + 0.2, h + 1.6, function(dx, dy, t){ var e = ell(dx, dy, A, Bv);
    if (o.open && dx > A * 0.55 && e > f) return null;   // a horseshoe, open at one end
    // four light towers
    var lt = Math.abs(Math.abs(dx) - A * 0.82) < 0.08 && Math.abs(Math.abs(dy) - Bv * 0.82) < 0.08;
    if (lt && dy < 0 && t < h + 1.4) return t > h + 1.15 ? '#fff6c0' : STEEL;
    if (e > 1) return null;
    if (e < f){
      if (t < 0.2){ var fx = dx / (A * f), fy = dy / (Bv * f);
        if (o.field === 'football'){ if (Math.abs(fx) > 0.78) return o.end ? ((Math.floor(dx * 3) + Math.floor(dy * 3)) % 2 ? o.end : W) : o.col;
          if (Math.abs((dx * 2.4) % 1) < 0.09) return W; if (Math.abs(fx) < 0.05 && Math.abs(fy) < 0.12) return o.col; }
        return (Math.floor(dx * 2.4) % 2) ? GRASS[0] : GRASS[1]; }
      // goalposts at both ends
      if (o.field === 'football'){ var gx = A * f * 0.86, ax = Math.abs(Math.abs(dx) - gx);
        if (ax < 0.05 && Math.abs(dy) < 0.05 && t < 0.55) return '#ffd23f';
        if (ax < 0.05 && Math.abs(t - 0.55) < 0.05 && Math.abs(dy) < 0.32) return '#ffd23f';
        if (ax < 0.05 && Math.abs(Math.abs(dy) - 0.32) < 0.05 && t > 0.55 && t < 1.15) return '#ffd23f'; }
      return null; }
    var r = (e - f) / (1 - f), top = 0.2 + h * r * (dy > 0 ? 0.42 : 1);   // the near stands kept low, so the field shows
    if (e > 0.95) top += 0.25;
    if (t > top) return null;
    if (e > 0.95) return t > top - 0.12 ? o.col : (Math.floor(t * 4) % 2 ? o.wall : o.wall2 || o.wall);
    if (t > top - 0.14){ var row = Math.floor(r * 10); return row % 4 === 3 ? SEAT : row % 2 ? o.seat1 : o.seat2; }
    return '#7a766c'; }); }

var LM = {
  football:function(box, x, y, z, s, g){ bowl(box, x, y, z, 8 * s, 5.6 * s, 2.0 * s, { field:'football', col:g.col, seat1:'#2f6fd0', seat2:'#3f7fe0', wall:'#cfd6e0', wall2:'#b8c0cc', end:'#1d3550' }); },
  college:function(box, x, y, z, s, g){ bowl(box, x - 0.6 * s, y, z, 7.4 * s, 5.2 * s, 1.8 * s, { field:'football', col:g.col, seat1:'#b8342a', seat2:'#d8402e', wall:'#a8583a', wall2:'#94482e', open:true });
    // the bell tower beside it
    box(x + 3.6 * s, y - 1.4 * s, z, 1.2 * s, 1.2 * s, 4.6 * s, function(dx, dy, t){ var a = Math.abs(dx), b = Math.abs(dy), H = 4.6 * s;
      if (t > H * 0.72){ var u = (t - H * 0.72) / (H * 0.28); return a < 0.55 * s * (1 - u) && b < 0.55 * s * (1 - u) ? '#4a5a6a' : null; }
      if (a > 0.45 * s || b > 0.45 * s) return null; if (Math.abs(t - H * 0.6) < 0.2 * s && dy > 0.35 * s && a < 0.18 * s) return '#ffd77a';
      if (t > H * 0.5 && t < H * 0.7 && a < 0.25 * s && dy > 0.3 * s) return '#2a2420'; return (Math.floor(t * 4) + (a > 0.4 * s ? 1 : 0)) % 2 ? '#a8583a' : '#b8684a'; }); },
  ballpark:function(box, x, y, z, s, g){ var R = 3.6 * s, hy = y + 2.2 * s;   // home plate toward the camera, the outfield behind
    box(x, y - 0.4 * s, z, 8 * s, 6.4 * s, 2.4 * s, function(dx, dy, t){ var px = dx, py = (y - 0.4 * s + dy) - hy, r = Math.hypot(px, py), ang = Math.atan2(px, -py);
      var inFan = Math.abs(ang) < Math.PI / 4 + 0.02 && r < R;
      if (Math.abs(ang) < Math.PI / 4 + 0.08 && Math.abs(r - R - 0.1) < 0.14 && py < 0){ var wt = 0.55 * s; if (t < wt) return t > wt - 0.1 ? '#ffd23f' : '#2f6a3a';
        if (Math.abs(ang) < 0.18 && t < 1.9 * s && Math.abs(r - R - 0.1) < 0.1){ return t > 1.75 * s ? g.col : (h3(Math.floor(dx * 6), Math.floor(t * 6), 4) < 0.3 ? '#ffd77a' : '#1d2a3a'); } return null; }
      if (inFan && t < 0.2){ var q = Math.abs(px) + Math.abs(py + 1.0 * s);   // the infield: a diamond of dirt, bases on its corners
        if (q < 1.0 * s){ var bs = [[0, 0], [1.0 * s, -1.0 * s], [0, -2.0 * s], [-1.0 * s, -1.0 * s]];
          for (var k = 0; k < 4; k++) if (Math.abs(px - bs[k][0]) < 0.11 && Math.abs(py - bs[k][1]) < 0.11) return W;
          if (q < 0.62 * s) return Math.hypot(px, py + 1.0 * s) < 0.2 ? DIRT : (Math.floor(r * 3) % 2 ? GRASS[0] : GRASS[1]); return DIRT; }
        if (Math.abs(Math.abs(px) - Math.abs(py)) < 0.05 && r > 1.4 * s) return W;   // the foul lines
        return (Math.floor(r * 2.2) % 2) ? GRASS[0] : GRASS[1]; }
      if (inFan && Math.hypot(px, py + 1.0 * s) < 0.16 && t < 0.24) return DIRT;   // the mound
      // a low grandstand round home plate
      if (py > -0.6 * s && r > 1.0 * s && r < 2.0 * s && Math.abs(ang) > Math.PI * 0.62){ var top = 0.15 + (r - 1.0 * s) * 0.35; if (t < top) return t > top - 0.12 ? (Math.floor(r * 6) % 2 ? g.col : '#3a5a8a') : '#7a766c'; }
      return null; }); },
  pitch:function(box, x, y, z, s, g){ var A = 3.8 * s, Bv = 2.4 * s;
    box(x, y, z, A * 2 + 0.6, Bv * 2 + 1.6, 1.4 * s, function(dx, dy, t){ var ax = Math.abs(dx), ay = Math.abs(dy);
      if (ax <= A && ay <= Bv && t < 0.2){ var line = Math.abs(ax - A) < 0.06 || Math.abs(ay - Bv) < 0.06 || ax < 0.04 || Math.abs(Math.hypot(dx, dy) - 0.9 * s) < 0.05 ||
          (Math.abs(ax - (A - 1.0 * s)) < 0.05 && ay < 1.3 * s) || (ax > A - 1.0 * s && Math.abs(ay - 1.3 * s) < 0.05);
        return line ? W : (Math.floor(dx * 1.6 + 10) % 2 ? GRASS[0] : GRASS[1]); }
      // the goals: white frames with a net
      if (Math.abs(ax - A - 0.3) < 0.32 && ay < 0.7 * s && t < 0.8 * s){ var fr = Math.abs(ay - 0.7 * s) < 0.06 || t > 0.74 * s; if (fr && ax < A + 0.08) return W;
        if (ax > A + 0.05 && (Math.floor(dy * 8) + Math.floor(t * 8)) % 2 === 0) return '#dfe6ee'; return null; }
      // a stand along the far touchline
      if (dy < -Bv - 0.2 && dy > -Bv - 0.8 && ax < A * 0.8){ var top = 0.2 + (-dy - Bv - 0.2) * 1.2; if (t < top) return t > top - 0.12 ? (Math.floor(dy * 8) % 2 ? g.col : '#fff2c4') : '#7a766c'; }
      if (ax > A - 0.05 && ax < A + 0.05 && ay > Bv - 0.05 && ay < Bv + 0.05 && t < 0.5) return t > 0.4 ? '#ff5a3c' : W;   // corner flags
      return null; }); },
  green:function(box, x, y, z, s, g){   // a putting green with its flag and bunkers, the clubhouse, and a windmill for Putt Putt
    box(x, y, z, 8 * s, 5.6 * s, 3.6 * s, function(dx, dy, t){ var e = ell(dx + 0.6 * s, dy - 0.4 * s, 2.8 * s, 1.8 * s);
      if (e < 1 && t < 0.16 + (1 - e) * 0.2){ if (Math.hypot(dx + 0.2 * s, dy - 0.2 * s) < 0.12) return '#1d2a1d'; return (Math.floor((dx + dy) * 2) % 2) ? '#5fd06a' : '#52c45e'; }
      if (Math.abs(dx + 0.2 * s) < 0.035 && Math.abs(dy - 0.2 * s) < 0.035 && t < 1.9 * s) return W;
      if (Math.abs(dy - 0.2 * s) < 0.035 && dx + 0.2 * s > 0 && dx + 0.2 * s < 0.7 * s && t > 1.4 * s && t < 1.9 * s - (dx + 0.2 * s) * 0.45) return '#ff3a2a';
      if ((ell(dx + 3.0 * s, dy - 1.3 * s, 0.8 * s, 0.5 * s) < 1 || ell(dx - 1.9 * s, dy - 1.6 * s, 0.7 * s, 0.4 * s) < 1) && t < 0.2) return '#ecdba4';
      // the clubhouse, white with a green roof, at the back
      var cx = dx + 1.4 * s, cy = dy + 1.9 * s; if (Math.abs(cx) < 1.4 * s && Math.abs(cy) < 0.6 * s){ if (t < 1.1 * s){ if (cy > 0.52 * s && Math.abs(t - 0.6 * s) < 0.18 * s && Math.abs((cx / s) % 0.5) < 0.18) return '#bfe8ff'; return Math.floor(t * 4) % 2 ? '#f8f4e8' : '#ece4d0'; }
        if (t < 1.1 * s + (0.6 * s - Math.abs(cy)) * 1.1) return Math.floor(t * 5) % 2 ? '#2f8a3a' : '#3a9a46'; }
      // the windmill
      var mx = dx - 2.6 * s, my = dy + 0.9 * s, mh = 2.2 * s;
      if (Math.abs(mx) < 0.6 * s * (1 - t / mh * 0.35) && Math.abs(my) < 0.45 * s && t < mh){ if (my > 0.38 * s && Math.abs(mx) < 0.18 * s && t < 0.7 * s) return '#3a2410'; return Math.floor(t * 3) % 2 ? '#f8f4e8' : '#e8e0cc'; }
      if (Math.abs(mx) < 0.45 * s && Math.abs(my) < 0.32 * s && t >= mh && t < mh + 0.5 * s * (1 - Math.abs(mx) / (0.45 * s))) return '#d8402e';
      var sx = mx, sz = t - (mh - 0.15 * s); if (Math.abs(my - 0.55 * s) < 0.07 && Math.hypot(sx, sz) < 1.3 * s && (Math.abs(sx - sz) < 0.15 || Math.abs(sx + sz) < 0.15)) return (Math.floor(Math.hypot(sx, sz) * 4) % 2) ? '#a8763f' : W;
      return null; }); },
  arcade:function(box, x, y, z, s, g){ box(x, y - 0.4 * s, z, 6.4 * s, 3.6 * s, 3.6 * s, function(dx, dy, t){ var ax = Math.abs(dx);
      if (ax < 2.6 * s && dy < 0.6 * s && dy > -1.6 * s && t < 2.2 * s){ if (dy > 0.48 * s && ax < 0.5 * s && t < 1.2 * s) return '#1a1430';
        if (dy > 0.48 * s && Math.abs(t - 1.8 * s) < 0.22 * s) return ['#ff4fd8', '#2bf0ff', '#ffd23f', '#7cff8a'][Math.floor((dx + 3 * s) * 2.5) % 4];
        return Math.floor(t * 4) % 2 ? '#3a2a5a' : '#2e2050'; }
      if (ax < 2.8 * s && dy < 0.6 * s && dy > -1.8 * s && t >= 2.2 * s && t < 2.5 * s) return g.col;
      if (ax < 1.6 * s && Math.abs(dy - 0.1 * s) < 0.12 && t >= 2.5 * s && t < 3.4 * s){ var e = Math.abs(t - 2.5 * s) < 0.1 || Math.abs(t - 3.4 * s) < 0.1 || Math.abs(ax - 1.6 * s) < 0.1; return e ? '#ffd23f' : (h3(Math.floor(dx * 5), Math.floor(t * 5), 2) < 0.5 ? '#ff4fd8' : '#2bf0ff'); }
      // cabinets out front
      for (var k = -2; k <= 2; k++){ var cx = k * 1.05 * s, cdx = dx - cx, cdy = dy - 1.3 * s; if (Math.abs(cdx) < 0.32 * s && Math.abs(cdy) < 0.28 * s && t < 1.25 * s){
        if (cdy > 0.18 * s && t > 0.7 * s && t < 1.0 * s) return k % 2 ? '#7cff8a' : '#2bf0ff'; if (t > 1.1 * s) return ['#ff4fd8', '#ffd23f', '#2bf0ff'][(k + 3) % 3]; return '#1a1430'; } }
      return null; }); },
  stage:function(box, x, y, z, s, g){ box(x, y - 0.6 * s, z, 6.6 * s, 4.2 * s, 3.8 * s, function(dx, dy, t){ var ax = Math.abs(dx);
      if (ax < 2.6 * s && dy < 0.4 * s && dy > -1.4 * s && t < 0.55 * s) return t > 0.45 * s ? '#2a2420' : '#1a1418';
      if (Math.abs(ax - 2.4 * s) < 0.1 && Math.abs(dy + 1.2 * s) < 0.1 && t < 3.2 * s) return STEEL;   // the truss
      if (ax < 2.5 * s && Math.abs(dy + 1.2 * s) < 0.1 && Math.abs(t - 3.2 * s) < 0.1) return STEEL;
      if (Math.abs(dy + 1.05 * s) < 0.08 && Math.abs(t - 3.0 * s) < 0.12 && Math.abs((ax / s) % 0.8 - 0.4) < 0.12) return ['#ff4fd8', '#ffd23f', '#2bf0ff', '#ff5a3c'][Math.floor(ax / s / 0.8) % 4];
      if (ax < 2.2 * s && Math.abs(dy + 1.38 * s) < 0.06 && t > 0.55 * s && t < 2.8 * s) return (Math.floor(t * 3) % 2) ? g.col : '#ff8ab0';   // the backdrop
      if (Math.abs(ax - 2.0 * s) < 0.32 * s && Math.abs(dy - 0.1 * s) < 0.25 * s && t > 0.55 * s && t < 1.7 * s) return Math.hypot(dy - 0.35 * s, (t % (0.55 * s)) - 0.27 * s) < 0.12 * s ? '#4a4a52' : '#1d1d22';   // speaker stacks
      if (dy > 0.6 * s && dy < 1.9 * s && ax < 2.4 * s && t < 0.38 && h3(Math.floor(dx * 3), Math.floor(dy * 3), 9) < 0.45 && t > 0.12){ var c = h3(Math.floor(dx * 3), Math.floor(dy * 3), 8); return t > 0.3 ? '#f1c7a0' : ['#ff5a7a', '#3fa7e0', '#ffd23f', '#7dd56f', '#a86ad8'][Math.floor(c * 5)]; }
      return null; }); },
  umpire:function(box, x, y, z, s, g){ box(x, y, z, 4.6 * s, 3.8 * s, 4.4 * s, function(dx, dy, t){ var ax = Math.abs(dx);
      // home plate, and the umpire behind it, bigger than life
      if (t < 0.2 && dy > 0.3 * s && dy < 1.4 * s && ax < 0.7 * s - Math.max(0, dy - 0.9 * s)) return W;
      if (t < 0.1 && ell(dx, dy, 2.2 * s, 1.8 * s) < 1) return DIRT;
      var sy = dy + 0.4 * s; if (Math.abs(sy) > 0.5 * s) return null;
      if (t < 1.4 * s) return Math.abs(ax - 0.4 * s) < 0.22 * s ? (t < 0.25 * s ? '#1d1d22' : '#3a3a42') : null;
      if (t < 3.0 * s){ if (ax < 0.75 * s) return (Math.abs(sy) < 0.4 * s && dy > -0.2 * s && ax < 0.5 * s) ? '#2a2a32' : '#1d2a3a';
        if (ax < 1.0 * s && t > 2.2 * s) return '#1d2a3a'; if (ax < 1.0 * s && t > 1.7 * s && t <= 2.2 * s) return '#f1c7a0'; return null; }
      if (t < 3.8 * s && ax < 0.45 * s){ if (sy > 0.2 * s) return (Math.floor(t * 8) % 2 || Math.floor(dx * 8) % 2) ? '#2a2a32' : '#f1c7a0'; return '#f1c7a0'; }
      if (t < 4.1 * s && ax < 0.5 * s) return '#1d1d22'; return null; }); },
  lab:function(box, x, y, z, s, g){ box(x, y - 0.3 * s, z, 7 * s, 5.2 * s, 4 * s, function(dx, dy, t){ var r = Math.hypot(dx, dy * 1.2), ax = Math.abs(dx);
      var d = Math.hypot(dx, dy * 1.15, t * 0.9); if (d < 2.5 * s && d > 2.3 * s){ var rib = Math.abs((Math.atan2(dy, dx) * 6 / Math.PI) % 1) < 0.1 || Math.abs((t / s * 2.5) % 1) < 0.1; return rib ? '#e8f0f8' : (dy > 0 ? null : '#bff0ff'); }
      if (r < 0.4 * s && t < 1.3 * s) return t > 1.0 * s ? '#7cff8a' : '#2a6a4a';
      if (t < 0.2 && r < 2.4 * s) return (Math.floor(dx * 3) + Math.floor(dy * 3)) % 2 ? '#e8f0f8' : '#cfe0ea';
      // flasks round the dome, bubbling, and a coil
      for (var k = 0; k < 5; k++){ var a = -0.4 + k * 0.95, fx = Math.cos(a) * 1.3 * s, fy = Math.sin(a) * 1.0 * s; var q = Math.hypot(dx - fx, dy - fy);
        if (t < 0.9 * s && q < (t < 0.5 * s ? 0.35 * s : 0.12 * s)) return t < 0.4 * s ? ['#7cff8a', '#ff4fd8', '#2bf0ff', '#ffd23f', '#7a5cff'][k] : '#e8f0f8'; }
      if (Math.hypot(dx - 2.9 * s, dy + 1.4 * s) < 0.14 * s * (1.5 - t / (3.4 * s)) && t < 3.2 * s) return Math.floor(t * 6) % 2 ? '#c87a3a' : '#a8582a';
      if (Math.hypot(dx - 2.9 * s, dy + 1.4 * s, t - 3.35 * s) < 0.35 * s) return '#c8d0d8';
      return null; }); },
  court:function(box, x, y, z, s, g){ box(x, y, z, 6 * s, 4.6 * s, 3.4 * s, function(dx, dy, t){ var ax = Math.abs(dx);
      if (ax < 2.8 * s && Math.abs(dy) < 2.0 * s && t < 0.2){ var hx = dx, hy = dy + 1.5 * s;
        var line = Math.abs(ax - 2.8 * s) < 0.05 || Math.abs(Math.abs(dy) - 2.0 * s) < 0.05 || Math.abs(Math.hypot(hx, hy) - 2.2 * s) < 0.05;
        if (line) return W; if (ax < 0.75 * s && hy < 2.0 * s) return Math.abs(hy - 2.0 * s) < 0.05 || Math.abs(ax - 0.75 * s) < 0.05 ? W : g.col;
        return (Math.floor((dy + 3) * 5) % 2) ? '#d8a868' : '#c8985a'; }
      // the hoop at the far end: pole, glass, orange rim
      if (Math.abs(dy + 2.25 * s) < 0.08 && ax < 0.08 && t < 1.9 * s) return STEEL;
      if (Math.abs(dy + 2.05 * s) < 0.05 && ax < 0.6 * s && t > 1.5 * s && t < 2.2 * s) return (ax > 0.52 * s || t > 2.12 * s || t < 1.56 * s || (ax < 0.2 * s && Math.abs(t - 1.75 * s) < 0.12 * s && Math.abs(t - 1.75 * s) > 0.06 * s)) ? W : '#cfeaf6';
      if (Math.abs(Math.hypot(dx, dy + 1.8 * s) - 0.22 * s) < 0.05 && Math.abs(t - 1.62 * s) < 0.04) return '#ff6a1a';
      // the shot clock, 22 red
      if (Math.abs(dx - 2.4 * s) < 0.35 * s && Math.abs(dy + 2.2 * s) < 0.1 && t > 2.2 * s && t < 2.9 * s) return h3(Math.floor(dx * 6), Math.floor(t * 6), 3) < 0.4 ? '#ff3a2a' : '#1d1d22';
      if (Math.abs(dx - 2.4 * s) < 0.05 && Math.abs(dy + 2.2 * s) < 0.05 && t < 2.2 * s) return STEEL;
      return null; }); },
  chains:function(box, x, y, z, s, g){ box(x, y, z, 7 * s, 4.4 * s, 2.6 * s, function(dx, dy, t){ var ax = Math.abs(dx);
      if (ax < 3.2 * s && Math.abs(dy) < 1.6 * s && t < 0.2){ if (Math.abs((dx * 2) % 1) < 0.07) return W; return dx > 2.4 * s ? g.col : (Math.floor(dx * 2) % 2 ? GRASS[0] : GRASS[1]); }
      // the chain gang on the near sideline: two orange sticks and the chain, and the down marker showing 4
      var cy = dy - 1.85 * s; if (Math.abs(cy) < 0.06){ if ((Math.abs(dx + 1.0 * s) < 0.05 || Math.abs(dx - 0.6 * s) < 0.05) && t < 1.1 * s) return t > 0.9 * s ? '#ff8a2a' : '#1d1d22';
        if (dx > -1.0 * s && dx < 0.6 * s && Math.abs(t - 0.95 * s + Math.sin((dx + s) / (1.6 * s) * Math.PI) * 0.15) < 0.04) return '#c8c8c8';
        if (Math.abs(dx + 2.4 * s) < 0.05 && t < 1.0 * s) return '#1d1d22'; if (Math.abs(dx + 2.4 * s) < 0.3 * s && t > 1.0 * s && t < 1.5 * s){ var px = (dx + 2.4 * s) / (0.3 * s), pz = (t - 1.25 * s) / (0.25 * s);
          var four = (Math.abs(px - 0.25) < 0.18 && pz > -0.7) || (Math.abs(pz) < 0.15 && px > -0.6 && px < 0.6) || (Math.abs(px + 0.4 - pz * 0.4) < 0.18 && pz > 0); return four ? '#1d1d22' : '#ff8a2a'; } }
      // a goalpost
      if (Math.abs(dx - 3.0 * s) < 0.05){ if (Math.abs(dy) < 0.05 && t < 0.7 * s) return '#ffd23f'; if (Math.abs(t - 0.7 * s) < 0.05 && Math.abs(dy) < 0.5 * s) return '#ffd23f'; if (Math.abs(Math.abs(dy) - 0.5 * s) < 0.05 && t > 0.7 * s && t < 1.6 * s) return '#ffd23f'; }
      return null; }); },
  arena:function(box, x, y, z, s, g){ box(x, y - 0.3 * s, z, 6.4 * s, 5.2 * s, 4.2 * s, function(dx, dy, t){ var r = ell(dx, dy, 3.0 * s, 2.4 * s);
      if (r < 1 && t < 1.6 * s){ if (r > 0.92){ if (dy > 0 && Math.abs(dx) < 0.5 * s && t < 0.9 * s) return '#1d1d22'; return Math.abs(t - 1.1 * s) < 0.18 * s ? (h3(Math.floor(Math.atan2(dy, dx) * 10), 1, 2) < 0.6 ? '#ffd77a' : '#3a3e4a') : (Math.floor(t * 4) % 2 ? '#d8dce4' : '#c4c8d0'); } return null; }
      // the dome is a basketball
      var dz = (t - 1.6 * s) / (2.2 * s); if (dz >= 0 && r * r + dz * dz < 1){ var a = Math.atan2(dy, dx), seam = Math.abs(dx) < 0.07 || Math.abs(dy) < 0.07 || Math.abs(r - 0.6) < 0.04; return seam ? '#2a1a10' : (dz > 0.85 ? '#ff8a3a' : '#ff6a1a'); }
      return null; }); },
  ruins:function(box, x, y, z, s, g){ LM.ballpark(box, x, y, z, s * 0.85, g);   // a ballpark in old stone, with a golden ball over it
    box(x, y - 0.8 * s, z, 7.6 * s, 6 * s, 4.6 * s, function(dx, dy, t){ for (var k = 0; k < 7; k++){ var a = Math.PI * (1.05 + k * 0.15), cx = Math.cos(a) * 3.3 * s, cy = Math.sin(a) * 2.5 * s;
        if (Math.hypot(dx - cx, dy - cy) < 0.22 * s && t < (k % 3 === 1 ? 1.2 : 2.4) * s) return Math.floor(t * 5) % 2 ? '#ddd6c4' : '#cfc6b0';
        if (Math.hypot(dx - cx, dy - cy) < 0.3 * s && Math.abs(t - 2.45 * s) < 0.1 && k % 3 !== 1) return '#e8e0cc'; }
      if (Math.hypot(dx, dy + 0.4 * s, t - 3.7 * s) < 0.45 * s) return t > 3.85 * s ? '#fff2b0' : '#f1c040';
      return null; }); },
  ring:function(box, x, y, z, s, g){ var A = 2.0 * s; box(x, y, z, 6 * s, 5.4 * s, 3.2 * s, function(dx, dy, t){ var ax = Math.abs(dx), ay = Math.abs(dy);
      if (ax < A && ay < A){ if (t < 0.7 * s) return (ax > A - 0.12 || ay > A - 0.12) ? (Math.abs(t - 0.4 * s) < 0.08 * s ? '#ffd23f' : g.col) : null; if (t < 0.8 * s) return (Math.floor(dx * 1.5) + Math.floor(dy * 1.5)) % 2 ? '#f4f1e8' : '#e8e4d8'; }
      var cx = A - 0.08, post = Math.abs(ax - cx) < 0.09 && Math.abs(ay - cx) < 0.09; if (post && t < 1.95 * s) return t > 0.8 * s && (Math.floor((t - 0.8 * s) / (0.36 * s)) % 2) ? (dx * dy > 0 ? '#e5483a' : '#2f6fd0') : STEEL;
      var rope = [1.1, 1.45, 1.8].some(function(h){ return Math.abs(t - h * s) < 0.05; }); if (rope && ((Math.abs(ax - cx) < 0.05 && ay < cx) || (Math.abs(ay - cx) < 0.05 && ax < cx))) return t < 1.3 * s ? '#e5483a' : t < 1.6 * s ? W : '#2f6fd0';
      // the entrance ramp and its lighting rig
      if (dy < -A && dy > -2.6 * s && Math.abs(dx - 1.2 * s) < 0.4 * s && t < 0.3 + (-dy - A) * 0.2) return '#3a2a4a';
      if (Math.abs(dy + 2.6 * s) < 0.08 && Math.abs(Math.abs(dx - 1.2 * s) - 0.7 * s) < 0.08 && t < 2.8 * s) return STEEL;
      if (Math.abs(dy + 2.6 * s) < 0.08 && Math.abs(dx - 1.2 * s) < 0.78 * s && Math.abs(t - 2.8 * s) < 0.1) return h3(Math.floor(dx * 5), 2, 1) < 0.5 ? '#ff4fd8' : '#ffd23f';
      return null; }); },
  bullpen:function(box, x, y, z, s, g){ box(x, y, z, 6 * s, 4.4 * s, 2.6 * s, function(dx, dy, t){ var ax = Math.abs(dx);
      if (t < 0.2 && ax < 2.8 * s && dy > -1.4 * s && dy < 1.8 * s) return ell(dx + 0.6 * s, dy - 0.3 * s, 1.1 * s, 0.8 * s) < 1 ? DIRT : (Math.floor(dy * 3) % 2 ? GRASS[0] : GRASS[1]);
      if (t < 0.32 && ell(dx + 0.6 * s, dy - 0.3 * s, 0.6 * s, 0.45 * s) < 1) return Math.abs(dy - 0.3 * s) < 0.05 && Math.abs(dx + 0.6 * s) < 0.2 * s ? W : '#a8764a';
      // the bullpen wall and its door, shut
      if (dy < -1.4 * s && dy > -1.75 * s && ax < 2.9 * s && t < 1.6 * s){ if (Math.abs(dx - 1.1 * s) < 0.8 * s && t < 1.4 * s){ if (Math.abs(dx - 1.1 * s) < 0.04) return '#1d1d22'; return (Math.floor(dx * 6) % 2) ? '#2f6a3a' : '#3a7a46'; }
        return t > 1.45 * s ? '#ffd23f' : '#245030'; }
      if (Math.abs(dy - 1.6 * s) < 0.2 * s && ax < 1.8 * s && t < 0.5 * s) return t > 0.4 * s ? g.col : '#5a3a1e';   // the bench
      return null; }); },
  bigtop:function(box, x, y, z, s, g){ box(x, y, z, 5 * s, 4.4 * s, 4.0 * s, function(dx, dy, t){ var r = ell(dx, dy, 2.2 * s, 1.9 * s);
      if (r < 1 && t < 1.2 * s) return dy > 1.6 * s && Math.abs(dx) < 0.4 * s ? '#2a1a10' : (Math.floor((Math.atan2(dy, dx) + 4) * 3) % 2 ? g.col : W);
      var rt = 1.2 * s + (1 - r) * 2.2 * s; if (r < 1 && t >= 1.2 * s && t < rt) return Math.floor((Math.atan2(dy, dx) + 4) * 3) % 2 ? g.col : W;
      if (r < 0.05 && t < 3.8 * s) return STEEL; if (Math.abs(dy) < 0.04 && dx > 0 && dx < 0.6 * s && t > 3.3 * s && t < 3.8 * s - dx * 0.6) return '#ffd23f';
      return null; }); }
};
window.SKY_LANDMARKS = { LM:LM };
})();
