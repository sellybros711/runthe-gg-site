/* What stands on the land: each island's landmark (landmarks.js) and districts, its trees, a building site while it
   is going up, the bridges, and the islets and balloons in the sky round it. Built with hole3d's B.solid, in feet,
   x east, y south (toward the camera), z up. buildAll is land.js's build(). */
(function(){
var S = window.SKY_W, h3 = S.h3, ART = S.ART, shape = S.shape, topAt = S.topAt;

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
      if (t >= 4.4 && t < 5.0 && dx > 0 && dx < 0.8 && Math.abs(dy) < 0.04 && dx < (5.0 - t) * 1.6) return fc; return null; }); }
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
      var arch = -0.16 - (1 - Math.abs(Math.sin(u * L / 3 * Math.PI))) * 1.1;   // arches three feet across, piers between
      if (as < 0.75 && dz <= -0.16 && dz > arch) return '#bfb59c';
      return null; }
    if (as < 0.62 && dz > -0.12 && dz < 0.02){ var pl = Math.floor(u * L * 3); if (u > 0.2 && u < 0.8 && pl % 3 !== 0) return null; return pl % 2 ? '#a8763f' : '#946238'; }
    if (Math.abs(as - 0.62) < 0.07 && Math.abs(u * L % 2.2) < 0.08 && dz > -1.2 && dz < 0.7) return '#b8bcc4';   // scaffold posts
    if (Math.abs(as - 0.62) < 0.07 && Math.abs(dz - 0.55) < 0.05 && (u < 0.2 || u > 0.8)) return '#c8b07a';
    if ((u < 0.06 || u > 0.94) && as < 0.6 && dz > 0.25 && dz < 0.5) return (Math.floor((s + dz) * 5) % 2) ? '#ff7a1a' : '#ffffff';   // a barrier across each end, low
    return null; }, ART); }

function tree(B, x, y, z, s){ box(B, x, y, z, 1.6 * s, 1.6 * s, 2.6 * s, function(dx, dy, t){ var r = Math.hypot(dx, dy);
  if (t < 1.0 * s && r < 0.14 * s) return '#6a4a2a'; var cz = 1.6 * s, d = Math.hypot(dx / (0.75 * s), dy / (0.75 * s), (t - cz) / (0.9 * s)); if (d < 1) return d > 0.82 && litSide(dx, dy) ? '#5bb352' : (h3(dx * 8 | 0, t * 8 | 0, 2) < 0.3 ? '#2f8139' : '#3f9a46'); return null; }); }
// the side of a crown the light comes from (the back left), drawn lighter
function litSide(dx, dy){ return dx < 0 && dy < 0; }
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

S.buildAll = buildAll;
})();
