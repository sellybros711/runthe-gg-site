/* The land: islands over a drop to the clouds (land.js skyIsle in golf/putt, rewritten here because it is private
   there). makeLand(list, bridges, B) is the land hole3d paints: its height, its ground and what stands on it
   (props.js). */
(function(){
var S = window.SKY_W, h3 = S.h3, vn = S.vn, fbm = S.fbm, blot = S.blot;

// how far inside an island's wobbly rim a point is, in feet (below zero is off the edge)
function shape(g, x, y){ var dx = (x - g.x) / g.r, dy = (y - g.y) / (g.r * 0.86), ang = Math.atan2(dy, dx);
  var wob = (vn(Math.cos(ang) * 2 + g.i * 7, Math.sin(ang) * 2, 5) - 0.5) * (g.world ? 0.22 : 0.34); return (1 + wob - Math.hypot(dx, dy)) * g.r; }
function cloudH(x, y){ return -2.9 + fbm(x * 0.09, y * 0.13, 31) * 1.1 + Math.pow(vn(x * 0.21, y * 0.27, 32), 3) * 0.9; }
function topAt(g, x, y){ var c = Math.min(1, Math.max(0, (Math.hypot((x - g.x) / g.r, (y - g.y) / (g.r * 0.86)) - 0.5) * 4)); return g.z + (fbm(x * 0.12, y * 0.12, g.i) - 0.5) * 0.5 * c; }
function distOf(g, x, y){ if (!g.dist.length) return { id:'grass' }; var a = Math.atan2(y - g.y, x - g.x), n = g.dist.length, k = Math.floor(((a + Math.PI / 2) / (Math.PI * 2) * n % n + n) % n); return g.dist[k]; }
var GROUND = { engine:'cobble', ui:'grass', art:'meadow', data:'grassd', accounts:'flag', payments:'brick', checks:'gravel' };

// the ground's materials, in hole3d's own form: three shades and a function of the cell that picks one
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
  gravel:['#bdb6a6', '#ccc6b6', '#a8a090', 0, function(c, R){ var n = h3(c.ti, c.tj, 6); return R(n < 0.25 ? '#a8a090' : n > 0.75 ? '#ccc6b6' : '#bdb6a6'); }],
  dirt:['#b8865a', '#a8764a', '#c8966a', 0, function(c, R){ var n = h3(c.ti, c.tj, 13), a = blot(c, 0.15, 14); return R(n < 0.08 ? '#8a6a4a' : a > 0.6 ? '#c8966a' : a < 0.35 ? '#a8764a' : '#b8865a'); }]
};

function makeLand(list, brs, B4){
  var lx = NaN, ly = NaN, lv = null;
  // the island a point is on (the one it is deepest inside), remembered for the last point: h and mat ask twice
  function inside(x, y){ if (x === lx && y === ly) return lv; var best = -99, gb = null;
    for (var i = 0; i < list.length; i++){ var g = list[i]; if (Math.abs(x - g.x) > g.r * 1.4 || Math.abs(y - g.y) > g.r * 1.4) continue; var q = shape(g, x, y); if (q > best){ best = q; gb = g; } }
    lx = x; ly = y; return lv = [best, gb]; }
  return { bg:'#8fcdf3', gain:2, inside:inside,
    h:function(x, y){ var r = inside(x, y); if (r[0] >= 0) return topAt(r[1], x, y); return cloudH(x, y); },
    mat:function(x, y){ var r = inside(x, y); if (r[0] < 0) return ['cloud']; if (r[0] < 0.22) return ['cliff']; var g = r[1], dc = Math.hypot((x - g.x) / g.r, (y - g.y) / (g.r * 0.86));
      var bare = g.built < 1 && vn(x * 0.35 + g.i * 3, y * 0.35, 17) > 0.45 + g.built * 0.4;   // unfinished ground: patches of bare earth
      if (dc < 0.5) return [g === S.hub ? 'plaza' : bare ? 'dirt' : 'lawn']; if (dc < 0.55) return ['path'];
      for (var k = 0; k < g.dist.length; k++){ var d = g.dist[k], ex = d.x - g.x, ey = d.y - g.y, L = Math.hypot(ex, ey), t = ((x - g.x) * ex + (y - g.y) * ey) / (L * L);
        if (t > 0.5 && t < 0.86 && Math.abs(((x - g.x) * ey - (y - g.y) * ex) / L) < (g.world ? 0.8 : 0.42)) return ['path']; }
      return [bare ? 'dirt' : (GROUND[distOf(g, x, y).id] || 'grass')]; },
    mats:MATS,
    build:function(B){ S.buildAll(B, list, brs, B4, inside); } };
}

S.shape = shape; S.cloudH = cloudH; S.topAt = topAt; S.distOf = distOf; S.makeLand = makeLand;
})();
