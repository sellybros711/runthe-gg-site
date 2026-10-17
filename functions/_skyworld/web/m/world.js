/* The Sky World. Two places, both painted by Putt Putt's own renderer (golf/putt/hole3d.js, loaded read only at the
   versions Golf ships) from land this file builds:

   THE MAP: RunThe.GG in the middle, the live games and Marketing round it on stone bridges, and every game not yet
   live out on the edge, still being built, on bridges still being built.
   A WORLD: click an island and you go into it, full screen and at full size: its landmark, a district for every
   layer of the game, and (stage c) the agents working there.

   The shape of everything comes from the server (functions/_skyworld/discover.js); nothing here lists a game. */
(function(){
var W = window.SKY_WORLD, ART = 1 / 8, ELEV = 42, se = Math.sin(ELEV * Math.PI / 180), ce = Math.cos(ELEV * Math.PI / 180);
var RENDER_V = 3;   // bump when the land, the landmarks or the layout change, so cached pictures are painted again

// ---- noise
function h3(x, y, s){ var n = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return n - Math.floor(n); }
function vn(x, y, s){ var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  var a = h3(xi, yi, s), b = h3(xi + 1, yi, s), c = h3(xi, yi + 1, s), d = h3(xi + 1, yi + 1, s); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
function fbm(x, y, s){ return vn(x, y, s) * 0.55 + vn(x * 2.1, y * 2.1, s + 9) * 0.3 + vn(x * 4.3, y * 4.3, s + 19) * 0.15; }
function blot(c, f, s){ return vn(c.ti * f, c.tj * f, s); }

// ---- the islands. How built each one looks follows its status: a live game is finished, the rest are still going up.
var ORDER = (W.layers || []).map(function(l){ return l.id; });
var BUILT = { hub:1, live:1, unlisted:0.9, testers:0.75, dev:0.5 };
var games = W.games.map(function(g, i){ return Object.assign({}, g, { i:i, counts:g.layers, health:'none', built:BUILT[g.status] || 0.5,
  layers:ORDER.filter(function(id){ return (g.layers || {})[id] > 0; }) }); });
var hub = games.filter(function(g){ return g.id === 'site'; })[0] || games[0];
var inner = games.filter(function(g){ return g !== hub && (g.status === 'live' || g.status === 'hub'); }).sort(function(a, b){ return (a.status === 'hub') - (b.status === 'hub') || a.name.localeCompare(b.name); });
var RANK = { testers:0, unlisted:1, dev:2 };
var outer = games.filter(function(g){ return g !== hub && inner.indexOf(g) < 0; }).sort(function(a, b){ return (RANK[a.status] - RANK[b.status]) || a.name.localeCompare(b.name); });
games.forEach(function(g){ var finished = g.built >= 1; g.s = g === hub ? 1.15 : finished ? 1 : 0.8; g.r = (g === hub ? 11.5 : finished ? 9.6 : 7.8) + g.layers.length * 0.22; });
// RunThe.GG in the middle, the finished ring round it, the ring still being built round that
var rIn = Math.max.apply(null, inner.map(function(g){ return g.r; }).concat([8])), rOut = Math.max.apply(null, outer.map(function(g){ return g.r; }).concat([7]));
var R1 = hub.r + rIn + 9, R2 = R1 + rIn + rOut + 11;
hub.x = 0; hub.y = 0; hub.z = 1.4;
inner.forEach(function(g, j){ var a = -Math.PI / 2 + j * Math.PI * 2 / inner.length; g.x = Math.cos(a) * R1 * 1.15; g.y = Math.sin(a) * R1 * 0.92; g.z = 0.8 + h3(g.i, 3, 1) * 0.6; g.ring = 1; });
outer.forEach(function(g, j){ var a = -Math.PI / 2 + (j + 0.5) * Math.PI * 2 / Math.max(1, outer.length); g.x = Math.cos(a) * R2 * 1.18; g.y = Math.sin(a) * R2 * 0.95; g.z = 1.8 + h3(g.i, 3, 1) * 1.0; g.ring = 2; });
// the outer ring moves apart until nothing touches; the middle stays put
for (var it = 0; it < 200; it++) outer.forEach(function(a){ games.forEach(function(b){ if (a === b) return; var dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy) || 1, need = a.r + b.r + 7;
  if (d < need){ var p = (need - d) / d; if (b.ring === 2){ p /= 2; b.x -= dx * p; b.y -= dy * p; } a.x += dx * p; a.y += dy * p; } }); });
// stone bridges from the middle to every finished island; a bridge being built from each unfinished one to its nearest neighbour inside
var bridges = inner.map(function(g){ return [hub, g, 'stone']; });
outer.forEach(function(g){ var best = null; [hub].concat(inner).forEach(function(b){ var d = Math.hypot(g.x - b.x, g.y - b.y) - g.r - b.r; if (!best || d < best[1]) best = [b, d]; }); bridges.push([best[0], g, 'build']); });
games.forEach(function(g){ g.links = []; }); bridges.forEach(function(b){ b[0].links.push(b[1]); b[1].links.push(b[0]); });
function rims(p){ var a = p[0], b = p[1], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), ux = dx / d, uy = dy / d;
  return { a:a, b:b, kind:p[2], ax:a.x + ux * (a.r - 1.2), ay:a.y + uy * (a.r - 1.2), bx:b.x - ux * (b.r - 1.2), by:b.y - uy * (b.r - 1.2), ux:ux, uy:uy }; }
bridges = bridges.map(rims);
// districts: wedges round the landmark, one per layer the game has
function districts(g, ring){ var n = g.layers.length; g.dist = g.layers.map(function(id, k){ var a = -Math.PI / 2 + (k + 0.5) / n * Math.PI * 2, rr = g.r * ring;
  return { id:id, a:a, x:g.x + Math.cos(a) * rr * 1.1, y:g.y + Math.sin(a) * rr * 0.9 }; }); }
games.forEach(function(g){ districts(g, 0.74); });
function bounds(list, mx, my){ var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; list.forEach(function(g){ x0 = Math.min(x0, g.x - g.r); y0 = Math.min(y0, g.y - g.r); x1 = Math.max(x1, g.x + g.r); y1 = Math.max(y1, g.y + g.r); });
  return [x0 - mx, y0 - my - 4, x1 + mx, y1 + my]; }
var MAP_B = bounds(games, 26, 22);

// a world: one game's island alone, at full size, its districts a neighbourhood each
function worldOf(g){ var w = Object.assign({}, g, { x:0, y:0, z:0.6, r:22 + g.layers.length * 0.8, s:(g.built >= 1 ? 2.9 : 2.5) * (g === hub ? 1.1 : 1), bs:1.9, world:true });
  districts(w, 0.72); return { list:[w], bridges:[], B:bounds([w], 16, 34), g:g, w:w }; }

// ---- the land: islands over a drop to the clouds (land.js skyIsle, rewritten here because it is private there)
function shape(g, x, y){ var dx = (x - g.x) / g.r, dy = (y - g.y) / (g.r * 0.86), ang = Math.atan2(dy, dx);
  var wob = (vn(Math.cos(ang) * 2 + g.i * 7, Math.sin(ang) * 2, 5) - 0.5) * (g.world ? 0.22 : 0.34); return (1 + wob - Math.hypot(dx, dy)) * g.r; }
function cloudH(x, y){ return -2.9 + fbm(x * 0.09, y * 0.13, 31) * 1.1 + Math.pow(vn(x * 0.21, y * 0.27, 32), 3) * 0.9; }
function topAt(g, x, y){ var c = Math.min(1, Math.max(0, (Math.hypot((x - g.x) / g.r, (y - g.y) / (g.r * 0.86)) - 0.5) * 4)); return g.z + (fbm(x * 0.12, y * 0.12, g.i) - 0.5) * 0.5 * c; }
function distOf(g, x, y){ if (!g.dist.length) return { id:'grass' }; var a = Math.atan2(y - g.y, x - g.x), n = g.dist.length, k = Math.floor(((a + Math.PI / 2) / (Math.PI * 2) * n % n + n) % n); return g.dist[k]; }
var GROUND = { engine:'cobble', ui:'grass', art:'meadow', data:'grassd', accounts:'flag', payments:'brick', checks:'gravel' };
function makeLand(list, brs, B4){
  var lx = NaN, ly = NaN, lv = null;
  function inside(x, y){ if (x === lx && y === ly) return lv; var best = -99, gb = null;
    for (var i = 0; i < list.length; i++){ var g = list[i]; if (Math.abs(x - g.x) > g.r * 1.4 || Math.abs(y - g.y) > g.r * 1.4) continue; var q = shape(g, x, y); if (q > best){ best = q; gb = g; } }
    lx = x; ly = y; return lv = [best, gb]; }
  return { bg:'#8fcdf3', gain:2, inside:inside,
    h:function(x, y){ var r = inside(x, y); if (r[0] >= 0) return topAt(r[1], x, y); return cloudH(x, y); },
    mat:function(x, y){ var r = inside(x, y); if (r[0] < 0) return ['cloud']; if (r[0] < 0.22) return ['cliff']; var g = r[1], dc = Math.hypot((x - g.x) / g.r, (y - g.y) / (g.r * 0.86));
      var bare = g.built < 1 && vn(x * 0.35 + g.i * 3, y * 0.35, 17) > 0.45 + g.built * 0.4;   // unfinished ground: patches of bare earth
      if (dc < 0.5) return [g === hub ? 'plaza' : bare ? 'dirt' : 'lawn']; if (dc < 0.55) return ['path'];
      for (var k = 0; k < g.dist.length; k++){ var d = g.dist[k], ex = d.x - g.x, ey = d.y - g.y, L = Math.hypot(ex, ey), t = ((x - g.x) * ex + (y - g.y) * ey) / (L * L);
        if (t > 0.5 && t < 0.86 && Math.abs(((x - g.x) * ey - (y - g.y) * ex) / L) < (g.world ? 0.8 : 0.42)) return ['path']; }
      return [bare ? 'dirt' : (GROUND[distOf(g, x, y).id] || 'grass')]; },
    mats:MATS,
    build:function(B){ buildAll(B, list, brs, B4, inside); } };
}

var MATS = {
    cliff:['#b8a07e', '#c4ae8c', '#9a8468', 0, function(c, R){ var a = vn(c.ti * 0.09, c.tj * 0.2, 43), b = vn(c.ti * 0.35, c.tj * 0.35, 44); return R(a > 0.66 ? '#a08a6a' : b > 0.6 ? '#c8b392' : '#b8a07e'); }],
    cloud:['#ffffff', '#f2f7fc', '#dde9f5', 0, function(c, R){ var a = blot(c, 0.04, 41), b = blot(c, 0.12, 42);
      return R(a < 0.3 ? '#dbe7f5' : a < 0.4 ? '#e8f0f9' : a > 0.72 ? '#ffffff' : b > 0.62 ? '#fafcff' : b < 0.32 ? '#edf3fa' : '#f4f8fc'); }],
    grass:['#66b952', '#74c45c', '#58a848', 0, function(c, R){ var a = blot(c, 0.06, 1), b = blot(c, 0.17, 2); return R(a > 0.72 ? '#9ccc5a' : a < 0.28 ? '#58a848' : b > 0.64 ? '#74c45c' : '#66b952'); }],
    grassd:['#4f9e42', '#5fae4e', '#47923c', 0, function(c, R){ var a = blot(c, 0.08, 3); return R(a > 0.66 ? '#5fae4e' : a < 0.3 ? '#47923c' : '#4f9e42'); }],
    meadow:['#6cbf58', '#79ca62', '#5fb24e', 0, function(c, R){ var f = h3(c.ti, c.tj, 7); if (f < 0.035) return R(['#ff8ab0', '#ffd23f', '#ffffff', '#a86ad8'][Math.floor(f * 114) % 4]); var a = blot(c, 0.1, 4); return R(a > 0.6 ? '#79ca62' : '#6cbf58'); }],
    lawn:['#5fb24e', '#6cbf58', '#58a848', 0, function(c, R){ return R((Math.floor(c.ti / 6) % 2) ? '#6cbf58' : '#5fb24e'); }],
    plaza:['#ddd6c4', '#cfc6b0', '#bfb59c', 0, function(c, R){ var e = (c.ti % 4 === 0) || ((c.tj + (c.ti >> 2) * 2) % 4 === 0); return R(e ? '#bfb59c' : h3(c.ti >> 2, c.tj >> 2, 5) < 0.3 ? '#cfc6b0' : '#ddd6c4'); }],
    flag:['#d8d0bc', '#c8bfa8', '#b8ae96', 0, function(c, R){ var e = (c.ti % 3 === 0) || (c.tj % 3 === 0); return R(e ? '#b8ae96' : '#d8d0bc'); }],
    path:['#e8dcb8', '#f4ead0', '#d8caa0', 0, function(c, R){ return R(h3(c.ti, c.tj, 9) < 0.18 ? '#d8caa0' : h3(c.ti, c.tj, 8) < 0.4 ? '#f4ead0' : '#e8dcb8'); }],
    cobble:['#a8a49a', '#bab6aa', '#8e8a80', 0, function(c, R){ var e = ((c.ti + (c.tj % 2) * 1) % 3 === 0) || (c.tj % 2 === 0 && h3(c.ti, c.tj, 3) < 0.5); return R(e ? '#8e8a80' : h3(c.ti >> 1, c.tj, 4) < 0.4 ? '#bab6aa' : '#a8a49a'); }],
    brick:['#c98a6a', '#b8785a', '#a86a4e', 0, function(c, R){ var e = (c.tj % 2 === 0) || ((c.ti + (c.tj >> 1) * 2) % 4 === 0); return R(e ? '#a86a4e' : '#c98a6a'); }],
    gravel:['#bdb6a6', '#ccc6b6', '#a8a090', 0, function(c, R){ var n = h3(c.ti, c.tj, 6); return R(n < 0.25 ? '#a8a090' : n > 0.75 ? '#ccc6b6' : '#bdb6a6'); }]
    ,
  dirt:['#b8865a', '#a8764a', '#c8966a', 0, function(c, R){ var n = h3(c.ti, c.tj, 13), a = blot(c, 0.15, 14); return R(n < 0.08 ? '#8a6a4a' : a > 0.6 ? '#c8966a' : a < 0.35 ? '#a8764a' : '#b8865a'); }]
};


// ---- the solids. box() builds one thing in feet about (x, y, z); BSC scales it (a world's buildings are bigger),
// and CUT is how far up it is built: above that it is scaffolding round what stands so far.
var BSC = 1, CUT = 1;
function box(B, x, y, z, w, d, h, fn, sv){ var sc = BSC, cut = CUT;
  B.solid(x - w * sc / 2, y - d * sc / 2, z, x + w * sc / 2, y + d * sc / 2, z + h * sc, function(px, py, pz){ var dx = (px - x) / sc, dy = (py - y) / sc, t = (pz - z) / sc;
    if (cut < 1 && t > h * cut) return scaffold(fn, dx, dy, t, h * cut); return fn(dx, dy, t); }, sv || ART); }
function scaffold(fn, dx, dy, t, tc){ if (!fn(dx, dy, Math.max(0, tc - 0.06))) return null;   // only over what already stands
  var gx = Math.abs((dx / 0.6) % 1), gy = Math.abs((dy / 0.6) % 1), ex = gx < 0.14 || gx > 0.86, ey = gy < 0.14 || gy > 0.86;
  if (ex && ey) return '#b8bcc4';
  if (Math.abs((t / 0.7) % 1) < 0.1 && (ex || ey)) return '#c89a4a';
  return null; }

function roof(dx, dy, tt, w, d, h0, h1, ridgeX){ var u = ridgeX ? Math.abs(dy) / (d / 2) : Math.abs(dx) / (w / 2); return tt >= h0 && tt <= h0 + (h1 - h0) * (1 - u); }
var BUILD = {
  engine:function(B, x, y, z, g){ box(B, x, y, z, 2.6, 2.0, 3.6, function(dx, dy, t){
      if (Math.abs(dx - 0.8) < 0.28 && Math.abs(dy + 0.4) < 0.28 && t < 3.6) return t > 3.3 ? '#ff8a2a' : (Math.floor(t * 3) % 2 ? '#8e8a80' : '#7a766c');   // the chimney, glowing
      if (Math.abs(dx) <= 1.2 && Math.abs(dy) <= 0.9 && t < 1.6){ if (dy > 0.82 && Math.abs(dx) < 0.32 && t < 1.0) return '#3a2410'; if (dy > 0.82 && Math.abs(Math.hypot(dx + 0.7, t - 1.0) - 0.28) < 0.07) return '#ffd23f';
        return (Math.floor(t * 4) + (dx * 3 | 0)) % 3 ? '#9a968a' : '#86827a'; }
      if (roof(dx, dy, t, 2.6, 2.0, 1.6, 2.6, true) && Math.abs(dx) < 1.35) return (Math.floor(t * 5) % 2) ? '#4a4e5a' : '#3a3e4a'; return null; }); },
  ui:function(B, x, y, z, g){ box(B, x, y, z, 3.0, 1.0, 3.0, function(dx, dy, t){
      if (Math.abs(Math.abs(dx) - 1.2) < 0.12 && Math.abs(dy) < 0.12 && t < 1.2) return '#5a3a1e';
      if (Math.abs(dx) < 1.45 && Math.abs(dy) < 0.16 && t >= 1.2 && t < 2.9){ var e = Math.abs(dx) > 1.3 || t < 1.33 || t > 2.77; if (e) return '#2a2f3a';
        if (dy > 0.05){ var row = Math.floor((t - 1.33) * 6); return row % 3 === 0 ? g.col : (h3(Math.floor(dx * 8), row, 3) < 0.4 ? '#bff0ff' : '#5fd0f0'); } return '#2a2f3a'; }
      return null; }); },
  art:function(B, x, y, z, g){ box(B, x - 0.4, y, z, 2.2, 1.8, 2.8, function(dx, dy, t){
      if (Math.abs(dx) <= 1.0 && Math.abs(dy) <= 0.8 && t < 1.4){ if (dy > 0.72 && Math.abs(dx - 0.4) < 0.25 && Math.abs(t - 0.9) < 0.25) return '#bfe8ff'; return Math.floor(t * 6) % 2 ? '#f4efe2' : '#e8e0cc'; }
      if (roof(dx, dy, t, 2.2, 1.8, 1.4, 2.6, false) && Math.abs(dy) < 0.95) return (Math.floor(t * 5) % 2) ? '#ff8ab0' : '#e86a96'; return null; });
    box(B, x + 1.3, y + 0.5, z, 0.9, 0.5, 1.8, function(dx, dy, t){   // the easel and its painting
      if (t < 1.6 && Math.abs(dy) < 0.06 && (Math.abs(Math.abs(dx) - 0.3 + t * 0.08) < 0.05)) return '#8a5a2a';
      if (t > 0.8 && t < 1.7 && Math.abs(dx) < 0.36 && Math.abs(dy - 0.08) < 0.06) return ['#ffd23f', '#3fa7e0', '#ff5a3c', '#7dd56f'][(Math.floor(dx * 6 + 3) + Math.floor(t * 5)) % 4]; return null; }); },
  data:function(B, x, y, z, g){ box(B, x, y, z, 2.2, 2.2, 4.4, function(dx, dy, t){ var r = Math.hypot(dx, dy);
      if (t < 2.8 && r < 0.95){ if (dy > 0.6 && Math.abs(dx) < 0.25 && t < 0.9) return '#3a2410'; if (Math.abs(t - 1.9) < 0.18 && dy > 0.5 && Math.abs(dx) < 0.3) return '#ffd77a';
        return Math.floor(t * 4) % 2 ? '#d8cfb8' : '#c8bfa6'; }
      if (t >= 2.8 && r < 1.1 * (1 - (t - 2.8) / 1.6)) return (Math.floor(t * 5) % 2) ? g.col : '#2a3a5a'; return null; }); },
  accounts:function(B, x, y, z, g){ box(B, x, y, z, 2.8, 1.8, 2.8, function(dx, dy, t){
      if (t < 0.25 && Math.abs(dx) < 1.4 && Math.abs(dy) < 0.9) return '#cfc6b0';
      if (t < 1.8 && Math.abs(dy - 0.6) < 0.16 && Math.abs(dx) < 1.2 && Math.abs((dx + 1.2) % 0.6 - 0.3) < 0.12) return '#f4efe2';   // columns
      if (t < 1.8 && Math.abs(dx) < 1.1 && dy < 0.4 && dy > -0.8) return '#e8e0cc';
      if (t >= 1.8 && t < 2.05 && Math.abs(dx) < 1.35 && Math.abs(dy) < 0.85) return '#d8c890';
      if (t >= 2.05 && roof(dx, dy, t, 2.8, 1.8, 2.05, 2.75, false) && Math.abs(dy) < 0.85) return '#d8a83a'; return null; }); },
  payments:function(B, x, y, z, g){ box(B, x, y, z, 2.4, 1.6, 2.4, function(dx, dy, t){
      if (Math.abs(Math.abs(dx) - 1.05) < 0.08 && Math.abs(Math.abs(dy) - 0.65) < 0.08 && t < 1.8) return '#6a4a2a';
      if (t < 0.9 && Math.abs(dx) < 1.0 && Math.abs(dy - 0.4) < 0.25) return t > 0.8 ? '#c8a070' : '#8a5a2a';
      if (t >= 1.8 && t < 2.3 && Math.abs(dx) < 1.2 && Math.abs(dy) < 0.8 + (t - 1.8) * -0.4) return (Math.floor((dx + 2) * 3) % 2) ? '#e5483a' : '#fff6e8';
      if (Math.abs(dx - 0.3) < 0.2 && Math.abs(dy - 0.4) < 0.15 && t >= 0.9 && t < 1.15) return '#ffd23f'; return null; }); },
  checks:function(B, x, y, z, g){ var fc = g.health === 'pass' ? '#5fd06a' : g.health === 'fail' ? '#ff4a3a' : g.health === 'warn' ? '#ffb030' : '#b8b8b8';
    box(B, x, y, z, 1.6, 1.6, 5.2, function(dx, dy, t){
      if (t < 3.2 && Math.abs(Math.abs(dx) - 0.55 + t * 0.04) < 0.08 && Math.abs(Math.abs(dy) - 0.55 + t * 0.04) < 0.08) return '#6a4a2a';
      if (t < 3.2 && Math.abs(Math.abs(dx) - 0.5) < 0.05 && Math.abs(dy - 0.5) < 0.05 && Math.floor(t * 2) % 2) return '#8a6a3a';
      if (t >= 3.2 && t < 3.4 && Math.abs(dx) < 0.75 && Math.abs(dy) < 0.75) return '#a8763f';
      if (t >= 3.4 && t < 3.9 && (Math.abs(dx) > 0.6 || Math.abs(dy) > 0.6) && Math.abs(dx) < 0.75 && Math.abs(dy) < 0.75) return '#946238';
      if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05 && t >= 3.4 && t < 5.2) return '#5a3a1e';
      if (t >= 4.4 && t < 5.0 && dx > 0 && dx < 0.8 * (1 - (5.0 - t) * 0) && Math.abs(dy) < 0.04 && dx < (5.0 - t) * 1.6) return fc; return null; }); }
};

// the landmark, built as far as the game is; and at the back, a pole with the game's banner, or a crane while it is going up
function centre(B, g){ var z = g.z, L = window.SKY_LANDMARKS, kind = L.LM[g.kind] ? g.kind : 'bigtop';
  BSC = 1; CUT = g.built; L.LM[kind](function(x, y, z0, w, d, h, fn){ box(B, x, y, z0, w, d, h, fn); }, g.x, g.y, z + 0.02, g.s, g); CUT = 1;
  var mx = g.x - g.r * 0.62, my = g.y - g.r * 0.5, mz = topAt(g, mx, my);
  if (g.built >= 1){
    box(B, mx, my, mz, 1.6, 0.4, 4.4, function(dx, dy, t){ if (Math.abs(dx + 0.6) < 0.06 && Math.abs(dy) < 0.06) return t > 4.25 ? '#ffd23f' : '#e8e8e8';
      if (t > 3.0 && t < 4.1 && dx > -0.55 && dx < 0.75 && Math.abs(dy - Math.sin(dx * 3) * 0.06) < 0.05) return Math.abs(t - 3.55) < 0.12 ? '#ffffff' : g.col; return null; });
    return; }
  BSC = g.world ? 1.6 : 1;
  box(B, mx, my, mz, 4.0, 1.0, 5.6, function(dx, dy, t){
    if (Math.abs(dx + 1.4) < 0.15 && Math.abs(dy) < 0.15 && t < 5.2) return (Math.floor(t * 3) % 2) ? '#ffc020' : '#2a2a2a';
    if (Math.abs(t - 5.1) < 0.1 && dx > -1.9 && dx < 1.9 && Math.abs(dy) < 0.1) return '#ffc020';
    if (Math.abs(dx - 1.5) < 0.03 && Math.abs(dy) < 0.03 && t > 3.0 && t < 5.0) return '#3a3a3a';
    if (Math.abs(dx - 1.5) < 0.2 && Math.abs(dy) < 0.2 && t > 2.7 && t < 3.0) return '#8a6a3a'; return null; });
  if (g.status === 'testers'){ var gx = g.x + g.r * 0.6, gy = g.y - g.r * 0.5;   // a tester game: a locked gate too
    box(B, gx, gy, topAt(g, gx, gy), 2.2, 0.5, 2.4, function(dx, dy, t){ var ar = Math.hypot(dx, t - 1.2); if (Math.abs(dx) > 1.05) return null;
      if (Math.abs(dx) > 0.72) return (Math.floor(t * 4) + (dy > 0 ? 1 : 0)) % 2 ? '#cfc6b0' : '#bfb59c';
      if (t > 1.2 && ar > 0.72 && ar < 1.05) return '#ddd6c4'; if (t > 1.95) return null;
      if (ar < 0.72 && Math.abs(dy) < 0.06){ if (Math.abs(dx) < 0.13 && Math.abs(t - 0.75) < 0.15) return '#ffd23f'; return Math.abs(dx * 5 % 1) < 0.2 ? '#4a2e16' : '#7a5230'; } return null; }); }
  BSC = 1;
}
// a finished island's bridge is stone; one still going up is planks with gaps, posts, and barriers at each end
function deckZ(br, u){ var za = topAt(br.a, br.ax, br.ay) - 0.05, zb = topAt(br.b, br.bx, br.by) - 0.05; return za + (zb - za) * u - Math.sin(u * Math.PI) * (br.kind === 'stone' ? 0.1 : 0.35); }
function bridge(B, br){ var L = Math.hypot(br.bx - br.ax, br.by - br.ay), sx = -br.uy, sy = br.ux, stone = br.kind === 'stone';
  var za = topAt(br.a, br.ax, br.ay), zb = topAt(br.b, br.bx, br.by);
  var x0 = Math.min(br.ax, br.bx) - 1.2, y0 = Math.min(br.ay, br.by) - 1.2, x1 = Math.max(br.ax, br.bx) + 1.2, y1 = Math.max(br.ay, br.by) + 1.2, z0 = Math.min(za, zb) - 1.6, z1 = Math.max(za, zb) + 1.3;
  B.solid(x0, y0, z0, x1, y1, z1, function(x, y, z){ var u = ((x - br.ax) * br.ux + (y - br.ay) * br.uy) / L, s = (x - br.ax) * sx + (y - br.ay) * sy; if (u < 0 || u > 1 || Math.abs(s) > 0.9) return null;
    var deck = deckZ(br, u), dz = z - deck, as = Math.abs(s);
    if (stone){
      if (as < 0.75 && dz > -0.16 && dz < 0.02) return (Math.floor(u * L * 2.5) % 2) ? '#cfc6b0' : '#c4bba4';
      if (as >= 0.72 && as < 0.86 && dz >= 0.02 && dz < 0.38) return dz > 0.3 ? '#ddd6c4' : (Math.floor(u * L * 2) % 4 === 0 ? '#bfb59c' : '#d2cab4');
      var arch = -0.16 - (1 - Math.abs(Math.sin(u * L / 3 * Math.PI))) * 1.1;   // arches three feet across, piers between if (as < 0.75 && dz <= -0.16 && dz > arch) return '#bfb59c';
      return null; }
    if (as < 0.62 && dz > -0.12 && dz < 0.02){ var pl = Math.floor(u * L * 3); if (u > 0.2 && u < 0.8 && pl % 3 !== 0) return null; return pl % 2 ? '#a8763f' : '#946238'; }
    if (Math.abs(as - 0.62) < 0.07 && Math.abs(u * L % 2.2) < 0.08 && dz > -1.2 && dz < 0.7) return '#b8bcc4';   // scaffold posts
    if (Math.abs(as - 0.62) < 0.07 && Math.abs(dz - 0.55) < 0.05 && (u < 0.2 || u > 0.8)) return '#c8b07a';
    if ((u < 0.06 || u > 0.94) && as < 0.6 && dz > 0.25 && dz < 0.5) return (Math.floor((s + dz) * 5) % 2) ? '#ff7a1a' : '#ffffff';   // a barrier across each end, low
    return null; }, ART); }

function tree(B, x, y, z, s){ box(B, x, y, z, 1.6 * s, 1.6 * s, 2.6 * s, function(dx, dy, t){ var r = Math.hypot(dx, dy);
  if (t < 1.0 * s && r < 0.14 * s) return '#6a4a2a'; var cz = 1.6 * s, d = Math.hypot(dx / (0.75 * s), dy / (0.75 * s), (t - cz) / (0.9 * s)); if (d < 1) return d > 0.82 && dz(dx, dy, t) ? '#5bb352' : (h3(dx * 8 | 0, t * 8 | 0, 2) < 0.3 ? '#2f8139' : '#3f9a46'); return null; }); }
function dz(dx, dy, t){ return dx < 0 && dy < 0; }
function islet(B, X, Y, zt, r){ var dep = r * 1.5; box(B, X, Y, zt - dep, r * 2.2, r * 2.2, dep + 0.4, function(dx, dy, t){ var rr = Math.hypot(dx, dy / 0.85), lvl = t - dep;
  if (lvl > 0){ if (rr < r * (1 - lvl * 0.3)) return lvl > 0.18 ? '#5fae4e' : '#4f9a42'; return null; }
  var w = r * Math.pow((t / dep), 0.7); if (rr > w) return null; return lvl > -0.35 ? '#6a4a2c' : (Math.floor(t * 3) % 2 ? '#9a8668' : '#857256'); }); }
function balloon(B, X, Y, zb, cols){ var s = 0.9; box(B, X, Y, zb, 2.6 * s, 2.6 * s, 4.4 * s, function(dx, dy, t){
  if (t < 0.5 * s) return Math.max(Math.abs(dx), Math.abs(dy)) < 0.35 * s ? '#a8865a' : null;
  if (t < 1.6 * s) return (Math.abs(Math.abs(dx) - 0.3 * s) < 0.05 && Math.abs(Math.abs(dy) - 0.3 * s) < 0.05) ? '#5a4228' : null;
  var d = Math.hypot(dx / (1.2 * s), dy / (1.2 * s), (t - 2.9 * s) / (1.4 * s)); if (d > 1) return null; return Math.abs(t - 2.9 * s) < 0.15 ? cols[2] : (Math.floor((Math.atan2(dy, dx) + 4) * 2) % 2) ? cols[0] : cols[1]; }); }

// the things a building site leaves about: cones, barriers, a stack of planks
function cone(B, x, y, z){ box(B, x, y, z, 0.4, 0.4, 0.55, function(dx, dy, t){ var r = Math.hypot(dx, dy); if (t < 0.06) return Math.max(Math.abs(dx), Math.abs(dy)) < 0.18 ? '#2a2a2a' : null;
  if (r > 0.16 * (1 - t / 0.55) + 0.02) return null; return Math.abs(t - 0.28) < 0.06 ? '#ffffff' : '#ff7a1a'; }); }
function barrier(B, x, y, z, ang){ var c = Math.cos(ang), s = Math.sin(ang); box(B, x, y, z, 1.4, 1.4, 0.7, function(dx, dy, t){ var u = dx * c + dy * s, v = -dx * s + dy * c;
  if (Math.abs(v) > 0.06 || Math.abs(u) > 0.6) return null; if (t < 0.45 && Math.abs(Math.abs(u) - 0.5) < 0.06) return '#5a5a5a'; if (t > 0.4 && t < 0.65) return (Math.floor((u + t) * 5) % 2) ? '#ff7a1a' : '#ffffff'; return null; }); }
function planks(B, x, y, z){ box(B, x, y, z, 1.4, 0.8, 0.5, function(dx, dy, t){ if (Math.abs(dx) > 0.6 || Math.abs(dy) > 0.3) return null; var layer = Math.floor(t / 0.1); if (layer > 3) return null; return (layer % 2) ? '#a8763f' : '#c89a5a'; }); }
function site(B, g){ var n = g.world ? 14 : 6;
  for (var k = 0; k < n; k++){ var a = (k + 0.5) / n * Math.PI * 2, rr = g.r * 0.53, x = g.x + Math.cos(a) * rr * 1.1, y = g.y + Math.sin(a) * rr * 0.9;
    if (k % 2) barrier(B, x, y, topAt(g, x, y), a + Math.PI / 2); else cone(B, x, y, topAt(g, x, y)); }
  for (k = 0; k < (g.world ? 5 : 2); k++){ var a2 = h3(g.i, k, 41) * Math.PI * 2, r2 = g.r * (0.6 + h3(g.i, k, 42) * 0.2), x2 = g.x + Math.cos(a2) * r2, y2 = g.y + Math.sin(a2) * r2 * 0.86; planks(B, x2, y2, topAt(g, x2, y2)); } }

function buildAll(B, list, brs, B4, inside){
  list.forEach(function(g){ centre(B, g);
    BSC = g.bs || 1; CUT = g.built;
    g.dist.forEach(function(d){ var bz = topAt(g, d.x, d.y); (BUILD[d.id] || BUILD.engine)(B, d.x, d.y, bz, g); });
    BSC = 1; CUT = 1;
    if (g.built < 1) site(B, g);
    var nt = (g.world ? 18 : 4) + g.r * 0.6;
    for (var k = 0; k < nt; k++){ var a = h3(g.i, k, 11) * Math.PI * 2, rr = g.r * (0.8 + h3(g.i, k, 12) * 0.1), x = g.x + Math.cos(a) * rr, y = g.y + Math.sin(a) * rr * 0.86;
      if (y > g.y + g.r * 0.45) continue;   // nothing tall in front
      if (shape(g, x, y) > 0.6 && Math.hypot((x - g.x) / g.r, (y - g.y) / (g.r * 0.86)) > 0.6) tree(B, x, y, topAt(g, x, y), (0.8 + h3(g.i, k, 13) * 0.4) * (g.world ? 1.4 : 1)); } });
  brs.forEach(function(br){ bridge(B, br); });
  for (var k = 0; k < 14; k++){ var x = B4[0] + h3(k, 1, 21) * (B4[2] - B4[0]), y = B4[1] + 6 + h3(k, 2, 21) * (B4[3] - B4[1] - 8); if (inside(x, y)[0] > -3) continue; islet(B, x, y, -0.6 - h3(k, 3, 21) * 0.8, 0.8 + h3(k, 4, 21) * 0.9); }
  var BC = [['#ff5a3c', '#ffd23f', '#fff'], ['#3fa7e0', '#fff', '#ffd23f'], ['#7dd56f', '#ffd23f', '#ff5a3c'], ['#a86ad8', '#fff', '#ff8ab0']];
  for (k = 0; k < 6; k++){ var x2 = B4[0] + h3(k, 5, 22) * (B4[2] - B4[0]), y2 = B4[1] + 4 + h3(k, 6, 22) * (B4[3] - B4[1] - 6); if (inside(x2, y2)[0] > -2.5) continue; balloon(B, x2, y2, 4 + h3(k, 7, 22) * 3, BC[k % 4]); }
}


// ---- painting. A scene (the map, or one world) is painted once, in slices so no frame stutters, and kept in IndexedDB,
// so the next visit opens at once. One painting at a time.
function sceneC(){ return { T:window.RTT_PUTT.THEMES.sky, field:{ h:function(){ return 0; } }, poly:[[0, 0], [1, 0], [1, 1]], allPts:[[0, 0], [1, 1]], mats:{ at:function(){ return 0; } }, bounds:[1e9, 1e9, -1e9, -1e9], seed:7,
  bumpers:[], blocks:[], ramps:[], loops:[], movers:[] }; }
// the picture's projection is affine, so four points of it are the whole of it: kept with the picture
function affine(pr){ var o = pr(0, 0, 0), a = pr(1, 0, 0), b = pr(0, 1, 0), c = pr(0, 0, 1); return [o, [a[0] - o[0], a[1] - o[1]], [b[0] - o[0], b[1] - o[1]], [c[0] - o[0], c[1] - o[1]]]; }
function fromAffine(cv, A){ return { cv:cv, A:A, pr:function(x, y, z){ return [A[0][0] + A[1][0] * x + A[2][0] * y + A[3][0] * z, A[0][1] + A[1][1] * x + A[2][1] * y + A[3][1] * z]; } }; }
function idb(fn){ return new Promise(function(ok){ try { var q = indexedDB.open('rtg_skyworld', 1); q.onupgradeneeded = function(){ q.result.createObjectStore('pic'); };
  q.onsuccess = function(){ try { fn(q.result.transaction('pic', 'readwrite').objectStore('pic'), ok); } catch (e) { ok(null); } }; q.onerror = function(){ ok(null); }; } catch (e) { ok(null); } }); }
function keyOf(sc){ return JSON.stringify([RENDER_V, W.art, sc.id, sc.list.map(function(g){ return [g.id, g.status, g.kind, g.col, g.layers, Math.round(g.x), Math.round(g.y)]; }), sc.bridges.length]); }
function loadPic(sc){ var key = keyOf(sc); return idb(function(st, ok){ var g = st.get(sc.id); g.onsuccess = function(){ var v = g.result; if (!v || v.key !== key) return ok(null);
  createImageBitmap(v.blob).then(function(bm){ var c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; c.getContext('2d').drawImage(bm, 0, 0); ok(fromAffine(c, v.A)); }).catch(function(){ ok(null); }); }; g.onerror = function(){ ok(null); }; }); }
function savePic(sc, r){ var key = keyOf(sc); try { r.cv.toBlob(function(b){ if (b) idb(function(st, ok){ st.put({ key:key, A:r.A, blob:b }, sc.id); ok(); }); }); } catch (e) {} }
var queue = Promise.resolve();
function paint(sc, tick){ var job = queue.then(function(){ return new Promise(function(done){
  var H3 = window.RTT_PUTT_3D;
  if (!H3 || H3.API_VERSION !== 1 || !window.RTT_PUTT || !window.PXHD) return done({ r:flat(sc), warn:'The island painter changed, so this is a flat map for now.' });
  var t0 = performance.now(), step = H3.slices(sceneC(), { elev:ELEV, art:ART, tcell:ART, fx:true, scene:{ b:sc.B, land:makeLand(sc.list, sc.bridges, sc.B), zMax:sc.list[0].world ? 22 : 12, clearAt:function(){ return 20; } } });
  (function pump(){ var r; try { r = step(12); } catch (e) { return done({ r:flat(sc), warn:'The islands could not be painted, so this is a flat map.' }); }
    if (!r){ if (tick) tick(); requestAnimationFrame(pump); return; }
    var out = fromAffine(r.cv, affine(r.pr)); window.SKY_RENDER_MS = Math.round(performance.now() - t0); savePic(sc, out); done({ r:out }); })(); }); });
  queue = job.catch(function(){}); return job; }
// the fallback: the same layout, flat, with no borrowed code at all. It is also what the first visit shows while it paints.
function flat(sc){ var k = 1 / ART, B4 = sc.B, w = Math.ceil((B4[2] - B4[0]) * k), h = Math.ceil((B4[3] - B4[1]) * se * k + 40), c = document.createElement('canvas'); c.width = w; c.height = h;
  var x = c.getContext('2d'), A = [[-B4[0] * k, -B4[1] * se * k + 20], [k, 0], [0, se * k], [0, -ce * k]], gr = x.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#f4f8fc'); gr.addColorStop(1, '#dde9f5'); x.fillStyle = gr; x.fillRect(0, 0, w, h);
  var P = function(px, py, pz){ return [A[0][0] + px * k, A[0][1] + py * se * k - pz * ce * k]; };
  sc.bridges.forEach(function(b){ var p = P(b.ax, b.ay, 0), q = P(b.bx, b.by, 0); x.strokeStyle = b.kind === 'stone' ? '#cfc6b0' : '#a8763f'; x.lineWidth = 8; x.setLineDash(b.kind === 'stone' ? [] : [10, 8]); x.beginPath(); x.moveTo(p[0], p[1]); x.lineTo(q[0], q[1]); x.stroke(); });
  x.setLineDash([]);
  sc.list.forEach(function(g){ var p = P(g.x, g.y, g.z); x.fillStyle = '#9a8468'; x.beginPath(); x.ellipse(p[0], p[1] + 16, g.r * k, g.r * 0.86 * se * k, 0, 0, 7); x.fill();
    x.fillStyle = g.built < 1 ? '#a8b86a' : '#66b952'; x.beginPath(); x.ellipse(p[0], p[1], g.r * k, g.r * 0.86 * se * k, 0, 0, 7); x.fill(); x.fillStyle = g.col; x.beginPath(); x.ellipse(p[0], p[1], g.r * 0.4 * k, g.r * 0.3 * se * k, 0, 0, 7); x.fill(); });
  return fromAffine(c, A); }

// ---- the camera. Everything glides: a target and an exponential approach, timed by the frame, not counted by it.
// Zoom moves smoothly through any scale while it is being asked for, then settles on a whole number of screen pixels
// per art pixel, so the pixel art is crisp whenever the camera is still. It never shows past the edge of the clouds.
var cam = { x:0, y:0, k:2, kt:2, ax:null, ay:null, tx:null, ty:null, vx:0, vy:0, lastZoom:0 }, VW = 0, VH = 0, DPR = Math.min(2, window.devicePixelRatio || 1), dirty = true;
var keys = {}, yTop = 0, dragging = false;
function fit(){ VW = innerWidth; VH = innerHeight; [cvs, ov].forEach(function(c){ c.width = Math.round(VW * DPR); c.height = Math.round(VH * DPR); c.style.width = VW + 'px'; c.style.height = VH + 'px'; }); dirty = true; }
function kMin(){ return Math.max(DPR, cvs.width / R.cv.width, cvs.height / (R.cv.height - yTop)); }
function kMax(){ return 8 * DPR; }
function clampCam(){ var hw = cvs.width / 2 / cam.k, hh = cvs.height / 2 / cam.k;
  cam.x = hw * 2 >= R.cv.width ? R.cv.width / 2 : Math.max(hw, Math.min(R.cv.width - hw, cam.x));
  cam.y = hh * 2 >= R.cv.height - yTop ? (R.cv.height + yTop) / 2 : Math.max(yTop + hh, Math.min(R.cv.height - hh, cam.y)); }
function toScreen(px, py){ return [(px - cam.x) * cam.k + cvs.width / 2, (py - cam.y) * cam.k + cvs.height / 2]; }
function toPic(sx, sy){ return [(sx * DPR - cvs.width / 2) / cam.k + cam.x, (sy * DPR - cvs.height / 2) / cam.k + cam.y]; }
// the ground under a point of the screen: try each island's own height
function groundAt(sx, sy){ var p = toPic(sx, sy), A = R.A, det = A[1][0] * A[2][1] - A[2][0] * A[1][1], best = null;
  cur.list.forEach(function(g){ var px = p[0] - A[0][0] - A[3][0] * g.z, py = p[1] - A[0][1] - A[3][1] * g.z, x = (px * A[2][1] - A[2][0] * py) / det, y = (A[1][0] * py - px * A[1][1]) / det;
    if (shape(g, x, y) > 0 && (!best || g.y > best.g.y)) best = { g:g, x:x, y:y }; }); return best; }
// zoom toward a scale, keeping the point under (fx, fy) where it is; null means the middle of the screen
function zoomTo(kt, fx, fy){ cam.kt = Math.max(kMin(), Math.min(kMax(), kt)); cam.ax = fx == null ? VW / 2 : fx; cam.ay = fy == null ? VH / 2 : fy; cam.lastZoom = performance.now(); }
function zoom(d, fx, fy){ zoomTo(cam.kt * (d > 0 ? 1.45 : 1 / 1.45), fx, fy); }
function step(dt){ var moved = false, e;
  if (cam.tx != null){ e = 1 - Math.exp(-dt * 9); cam.x += (cam.tx - cam.x) * e; cam.y += (cam.ty - cam.y) * e; if (Math.abs(cam.tx - cam.x) + Math.abs(cam.ty - cam.y) < 0.3) cam.tx = cam.ty = null; moved = true; }
  var kx = (keys.ArrowRight || keys.d ? 1 : 0) - (keys.ArrowLeft || keys.a ? 1 : 0), ky = (keys.ArrowDown || keys.s ? 1 : 0) - (keys.ArrowUp || keys.w ? 1 : 0);
  if (kx || ky){ var sp = 700 * DPR / cam.k; cam.vx = kx * sp; cam.vy = ky * sp; cam.tx = cam.ty = null; }
  if (!dragging && (Math.abs(cam.vx) + Math.abs(cam.vy)) * cam.k > 4){ cam.x += cam.vx * dt; cam.y += cam.vy * dt; if (!kx && !ky){ e = Math.exp(-dt * 4.5); cam.vx *= e; cam.vy *= e; } moved = true; }
  else if (!kx && !ky){ cam.vx = cam.vy = 0; }
  // settle on a whole number of screen pixels per art pixel once nobody is zooming
  if (performance.now() - cam.lastZoom > 160 && !pinching){ var r = Math.round(cam.kt); if (r !== cam.kt) cam.kt = Math.max(Math.ceil(kMin() - 1e-6), Math.min(kMax(), r)); }
  if (cam.kt !== cam.k){ var p = toPic(cam.ax, cam.ay); e = 1 - Math.exp(-dt * 16); cam.k += (cam.kt - cam.k) * e; if (Math.abs(cam.kt - cam.k) < 0.004) cam.k = cam.kt;
    var q = toPic(cam.ax, cam.ay); cam.x += p[0] - q[0]; cam.y += p[1] - q[1]; moved = true; }
  if (moved) dirty = true;
  var ox = cam.x, oy = cam.y; clampCam(); if (ox !== cam.x) cam.vx = 0; if (oy !== cam.y) cam.vy = 0; }
var hov = null, sel = null;
// what is under a point of the screen. On the map: an island (its sign or its ground). In a world: a district, or the island.
function hitAt(sx, sy){
  var L = cur.list;
  for (var i = L.length - 1; i >= 0; i--){ var g = L[i]; if (!cur.world && g.sx != null && Math.abs(sx - g.sx) < g.sw / 2 && sy > g.sy && sy < g.sy + 22) return { g:g }; }
  if (cur.world) for (var j = 0; j < cur.w.dist.length; j++){ var d0 = cur.w.dist[j]; if (d0.sx != null && Math.abs(sx - d0.sx) < d0.sw / 2 && sy > d0.sy && sy < d0.sy + 22) return { g:cur.w, d:d0 }; }
  var hit = window.SKY_HIT && window.SKY_HIT(sx, sy); if (hit) return hit;   // the characters, from stage c
  var q = groundAt(sx, sy); if (!q) return null;
  if (!cur.world) return { g:q.g };
  var d = null, reach = 2.2 * (q.g.bs || 1); q.g.dist.forEach(function(k){ var e = Math.hypot(q.x - k.x, (q.y - k.y) * 1.2); if (e < reach && (!d || e < d.e)) d = { k:k, e:e }; });
  return d ? { g:q.g, d:d.k } : { g:q.g }; }

var STATUS_DOT = { hub:'#ffffff', live:'#5fd06a', unlisted:'#7fd8ff', testers:'#ffc94a', dev:'#c8a8ff' };
function draw(now){
  if (dirty){ ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, cvs.width, cvs.height);
    // only the part of the picture on screen, so a pan costs the screen's pixels and not the world's
    var o = toScreen(0, 0), sx = Math.max(0, Math.floor(-o[0] / cam.k)), sy = Math.max(0, Math.floor(-o[1] / cam.k)),
      sw = Math.min(R.cv.width - sx, Math.ceil(cvs.width / cam.k) + 2), sh = Math.min(R.cv.height - sy, Math.ceil(cvs.height / cam.k) + 2);
    if (sw > 0 && sh > 0) ctx.drawImage(R.cv, sx, sy, sw, sh, Math.round(o[0] + sx * cam.k), Math.round(o[1] + sy * cam.k), sw * cam.k, sh * cam.k);
    dirty = false; }
  octx.clearRect(0, 0, ov.width, ov.height);
  if (window.SKY_DRAW) window.SKY_DRAW(octx, now, cur);   // the characters, from stage c
  var fs = Math.round(11.5 * DPR), H = Math.round(22 * DPR); octx.font = '700 ' + fs + 'px system-ui, sans-serif'; octx.textAlign = 'center';
  function sign(text, x, y, z, on, dot, o){ var q = R.pr(x, y, z), s = toScreen(q[0], q[1]), w = octx.measureText(text).width + (dot ? 28 : 18) * DPR;
    octx.fillStyle = on ? '#2f6fd0' : 'rgba(29,53,80,0.88)'; rr(octx, s[0] - w / 2, s[1], w, H, H / 2); octx.fill();
    if (dot){ octx.fillStyle = dot; octx.beginPath(); octx.arc(s[0] - w / 2 + 11 * DPR, s[1] + H / 2, 4 * DPR, 0, 7); octx.fill(); }
    octx.fillStyle = '#ffffff'; octx.fillText(text, s[0] + (dot ? 6 * DPR : 0), s[1] + H / 2 + fs * 0.36); o.sx = s[0] / DPR; o.sy = s[1] / DPR; o.sw = w / DPR; }
  if (!cur.world){
    cur.list.forEach(function(g){ var on = (hov && hov.g === g && !hov.p) || (sel && sel.g === g && !sel.p); sign(g.name, g.x, g.y + g.r * 0.95, g.z - 0.8, on, STATUS_DOT[g.status], g); });
  } else { var w = cur.w, LN = SKY_UI.layerNames();
    // the district under the pointer or chosen, ringed; and a sign at every district
    [hov, sel].forEach(function(h, n){ if (!h || !h.d || h.p) return; var q = R.pr(h.d.x, h.d.y, topAt(w, h.d.x, h.d.y)), s = toScreen(q[0], q[1]), u = cam.k, rx = 2.6 * w.bs / ART * u;
      octx.strokeStyle = n ? '#ffd23f' : 'rgba(255,255,255,.9)'; octx.lineWidth = Math.max(2, u * 0.5); octx.beginPath(); octx.ellipse(s[0], s[1], rx, rx * 0.66 * se, 0, 0, 7); octx.stroke(); });
    w.dist.forEach(function(d){ var on = (hov && hov.d === d) || (sel && sel.d === d); sign(LN[d.id] || d.id, d.x, d.y + 1.9 * w.bs, topAt(w, d.x, d.y), on, null, d); });
  }
  octx.textAlign = 'left';
}
function rr(c, x, y, w, h, r){ c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
var last = 0;
function loop(t){ var dt = Math.min(0.05, (t - (last || t)) / 1000); last = t; step(dt); draw(t); requestAnimationFrame(loop); }
// with a panel open the place goes to the part of the screen still showing: above the sheet on a phone, left of the panel on a desktop
function focus(x, y, z, open){ var q = R.pr(x, y, z || 1), phone = innerWidth <= 700; cam.tx = q[0]; cam.ty = q[1]; cam.vx = cam.vy = 0;
  if (open !== false){ if (phone) cam.ty += innerHeight * 0.28 * DPR / cam.kt; else cam.tx += 200 * DPR / cam.kt; } }
// on the map a click goes into that world; in a world it opens the panel for what was clicked
function select(h){ if (!cur.world && h && h.g && !h.p){ enter(h.g); return; } sel = h; SKY_UI.select(h, cur); }

// ---- going into a world and back out, through the clouds
var MAP = { id:'map', list:games, bridges:bridges, B:MAP_B, world:false }, cur = MAP, worlds = {}, moving = false, saved = null;
function sceneFor(g){ return worlds[g.id] || (worlds[g.id] = Object.assign(worldOf(g), { id:'w:' + g.id, world:true })); }
function picture(sc){ if (sc.R) return Promise.resolve(sc.R);
  return loadPic(sc).then(function(r){ if (r) return r; return paint(sc).then(function(o){ return o.r; }); }).then(function(r){ sc.R = r; return r; }); }
function show(sc, at){ cur = sc; R = sc.R; yTop = Math.max(0, Math.ceil(R.pr(0, sc.B[1], 0)[1]) + 2); hov = sel = null; SKY_UI.hover(null); SKY_UI.select(null);
  cam.vx = cam.vy = 0; cam.tx = cam.ty = null; if (at){ cam.x = at.x; cam.y = at.y; cam.k = cam.kt = at.k; } dirty = true; window.SKY && (window.SKY.R = R); }
function enter(g){ if (moving) return; moving = true; var sc = sceneFor(g);
  saved = { x:cam.x, y:cam.y, k:cam.kt };
  var q = R.pr(g.x, g.y, g.z); cam.tx = q[0]; cam.ty = q[1]; zoomTo(cam.kt * 1.8);
  var slow = setTimeout(function(){ SKY_UI.flying(g); }, 500);
  Promise.all([picture(sc), SKY_UI.fade(true)]).then(function(){ clearTimeout(slow);
    show(sc); var c = R.pr(0, 1, sc.w.z), fitW = cvs.width / (2.25 * sc.w.r / ART), fitH = (cvs.height - 70 * DPR) / (2.1 * sc.w.r * 0.86 * se / ART + 8 / ART);
    cam.k = cam.kt = Math.max(Math.ceil(kMin()), Math.min(4 * DPR, Math.floor(Math.min(fitW, fitH))));   // the whole island in view, as large as fits
    cam.x = c[0]; cam.y = c[1]; clampCam();
    SKY_UI.entered(g, sc.w); return SKY_UI.fade(false); }).then(function(){ moving = false; }); }
function leave(){ if (moving || !cur.world) return; moving = true;
  SKY_UI.fade(true).then(function(){ show(MAP, saved); SKY_UI.left(); zoomTo(cam.kt / 1.4); return SKY_UI.fade(false); }).then(function(){ moving = false; }); }
// warm a world's picture before it is asked for (on a desktop, when the pointer rests on its island)
function warm(g){ if (innerWidth > 700 && !sceneFor(g).R && !sceneFor(g).warming){ sceneFor(g).warming = true; picture(sceneFor(g)); } }


// ---- input. Drag to pan, and it glides on when let go. Mouse wheel zooms at the pointer; a trackpad pans with two fingers
// and zooms with a pinch (Chrome sends that as a wheel with ctrlKey, Safari as a gesture). Two fingers on a phone pinch.
// Double click zooms in. Arrows or WASD pan while held, plus and minus zoom, Escape closes the panel.
var pinching = false;
function input(){ var pts = {}, drag = null, pinch = null, trail = [];
  ov.addEventListener('pointerdown', function(e){ pts[e.pointerId] = [e.clientX, e.clientY]; try { ov.setPointerCapture(e.pointerId); } catch (er) {}
    cam.tx = cam.ty = null; cam.vx = cam.vy = 0;
    var ids = Object.keys(pts); if (ids.length === 2){ var a = pts[ids[0]], b = pts[ids[1]]; pinch = { d:Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, k:cam.k, mx:(a[0] + b[0]) / 2, my:(a[1] + b[1]) / 2 }; pinching = true; drag = null; return; }
    drag = { x:e.clientX, y:e.clientY, cx:cam.x, cy:cam.y, moved:0 }; dragging = true; trail = [[performance.now(), cam.x, cam.y]]; });
  ov.addEventListener('pointermove', function(e){ if (pts[e.pointerId]) pts[e.pointerId] = [e.clientX, e.clientY]; var ids = Object.keys(pts);
    if (pinch && ids.length === 2){ var a = pts[ids[0]], b = pts[ids[1]], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      cam.x -= (mx - pinch.mx) * DPR / cam.k; cam.y -= (my - pinch.my) * DPR / cam.k; pinch.mx = mx; pinch.my = my;
      var kt = Math.max(kMin(), Math.min(kMax(), pinch.k * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d)), p = toPic(mx, my);
      cam.k = cam.kt = kt; var q = toPic(mx, my); cam.x += p[0] - q[0]; cam.y += p[1] - q[1]; cam.ax = mx; cam.ay = my; cam.lastZoom = performance.now(); dirty = true; return; }
    if (drag && pts[e.pointerId]){ var dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
      if (drag.moved > 3){ ov.style.cursor = 'grabbing'; SKY_UI.hover(null); }
      cam.x = drag.cx - dx * DPR / cam.k; cam.y = drag.cy - dy * DPR / cam.k; dirty = true;
      var t = performance.now(); trail.push([t, cam.x, cam.y]); while (trail.length > 2 && t - trail[0][0] > 90) trail.shift(); return; }
    if (e.pointerType === 'mouse'){ hov = hitAt(e.clientX, e.clientY); if (hov && hov.g && !cur.world) warm(hov.g); SKY_UI.hover(hov, e.clientX, e.clientY, cur); ov.style.cursor = hov ? 'pointer' : 'grab'; } });
  function up(e){ delete pts[e.pointerId]; if (Object.keys(pts).length < 2 && pinch){ pinch = null; pinching = false; cam.lastZoom = performance.now(); if (Object.keys(pts).length) drag = null; }
    if (drag){ if (drag.moved < 6) select(hitAt(e.clientX, e.clientY));
      else { var t = performance.now(), f = trail[0], l = trail[trail.length - 1], dtt = (l[0] - f[0]) / 1000; if (dtt > 0.01 && t - l[0] < 60){ cam.vx = (l[1] - f[1]) / dtt; cam.vy = (l[2] - f[2]) / dtt; } } }
    drag = null; dragging = false; ov.style.cursor = 'grab'; }
  ov.addEventListener('pointerup', up);
  ov.addEventListener('pointercancel', function(e){ delete pts[e.pointerId]; pinch = null; pinching = false; drag = null; dragging = false; });
  ov.addEventListener('pointerleave', function(){ if (!drag){ hov = null; SKY_UI.hover(null); } });
  ov.addEventListener('dblclick', function(e){ zoomTo(cam.kt * 1.8, e.clientX, e.clientY); });
  ov.addEventListener('wheel', function(e){ e.preventDefault(); cam.tx = cam.ty = null; SKY_UI.hover(null);
    var px = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? VH : 1, dx = e.deltaX * px, dy = e.deltaY * px;
    var mouse = e.deltaMode !== 0 || (e.wheelDeltaY && Math.abs(e.wheelDeltaY) % 120 === 0 && !e.deltaX);
    if (e.ctrlKey){ zoomTo(cam.kt * Math.exp(-dy * 0.012), e.clientX, e.clientY); cam.k = cam.kt; return; }   // a trackpad pinch: follow the fingers exactly
    if (mouse){ zoomTo(cam.kt * Math.exp(-Math.sign(dy) * 0.28), e.clientX, e.clientY); return; }
    cam.x += dx * DPR / cam.k; cam.y += dy * DPR / cam.k; cam.vx = cam.vy = 0; dirty = true; }, { passive:false });
  // Safari's trackpad pinch
  var g0 = null;
  ov.addEventListener('gesturestart', function(e){ e.preventDefault(); g0 = cam.kt; pinching = true; });
  ov.addEventListener('gesturechange', function(e){ e.preventDefault(); if (g0 == null) return; zoomTo(g0 * e.scale, e.clientX, e.clientY); cam.k = cam.kt; });
  ov.addEventListener('gestureend', function(e){ e.preventDefault(); g0 = null; pinching = false; cam.lastZoom = performance.now(); });
  addEventListener('keydown', function(e){ if (e.target && /input|textarea/i.test(e.target.tagName) || e.metaKey || e.ctrlKey) return;
    if (/^(Arrow(Left|Right|Up|Down)|[wasd])$/.test(e.key)){ keys[e.key] = true; e.preventDefault(); return; }
    if (e.key === '+' || e.key === '=') zoom(1); else if (e.key === '-' || e.key === '_') zoom(-1); else if (e.key === 'Escape'){ if (sel) select(null); else leave(); } });
  addEventListener('keyup', function(e){ delete keys[e.key]; });
  addEventListener('blur', function(){ keys = {}; });
  addEventListener('resize', function(){ fit(); zoomTo(cam.kt); }); }


// ---- start: the map, at once; on a first visit a flat map stands in while the islands are painted
SKY_UI.mount(W, games, { leave:function(){ leave(); } });
cvs = SKY_UI.el('world'); ov = SKY_UI.el('over'); ctx = cvs.getContext('2d'); octx = ov.getContext('2d'); fit();
// a point of one picture of the map, on another picture of it (the flat stand in, then the painted map)
function carry(from, to, px, py){ var A = from.A, det = A[1][0] * A[2][1] - A[2][0] * A[1][1], ax = px - A[0][0] - A[3][0], ay = py - A[0][1] - A[3][1];
  return to.pr((ax * A[2][1] - A[2][0] * ay) / det, (A[1][0] * ay - ax * A[1][1]) / det, 1); }
loadPic(MAP).then(function(cached){
  function go(r, warn, early){ MAP.R = r; show(MAP); cam.k = cam.kt = Math.max(Math.ceil(kMin()), 2 * DPR); var c = R.pr(hub.x, hub.y + 4, hub.z); cam.x = c[0]; cam.y = c[1]; clampCam();
    window.SKY = { cam:cam, games:games, bridges:bridges, hub:hub, se:se, R:R, toScreen:toScreen, focus:focus, select:select, zoom:zoom, enter:enter, leave:leave, topAt:topAt, shape:shape, DPR:DPR,
      scene:function(){ return cur; }, dirty:function(){ dirty = true; } };
    input(); if (early) SKY_UI.painting(); else SKY_UI.ready(warn); requestAnimationFrame(loop); window.dispatchEvent(new Event('sky-ready')); }
  if (cached) return go(cached);
  go(flat(MAP), null, true);
  paint(MAP, SKY_UI.progress).then(function(o){ var old = MAP.R; MAP.R = o.r;
    if (cur === MAP){ var q = carry(old, o.r, cam.x, cam.y); show(MAP); cam.x = q[0]; cam.y = q[1]; }
    else if (saved){ var q2 = carry(old, o.r, saved.x, saved.y); saved.x = q2[0]; saved.y = q2[1]; }
    SKY_UI.ready(o.warn); window.dispatchEvent(new Event('sky-repaint')); }); });
})();
