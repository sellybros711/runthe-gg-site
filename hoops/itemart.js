/* Run The Floor: item icons, pack art, coins and shards, in pixels.
 *
 * window.RTF_ART, and node can require it (hoops/check-shopart.mjs).
 *
 * AN ITEM ICON IS DRAWN FROM THE ITEM, never stored. Every catalogue row
 * carries a shape key (k: tee, hoodie, cap, sneaker) and its colours (c), so
 * a 16 cell icon is the shape's mask painted in the row's own colours. A row
 * added to catalog.js has an icon the day it is written. A shape key with no
 * mask falls back to its slot's mask, and a slot with none to a tag, so
 * nothing ever draws as a blank.
 *
 * THE LIGHT IS PXHD's RULE, at icon size: the top and left of a shape catch
 * the light, the bottom and right fall into its own darker shade, and a dark
 * outline in the shape's colour (never flat black) runs round the silhouette.
 *
 * PACK ART is Run The Tour's foil pillow redrawn for basketball: a crimped
 * pack in the pack's colours, a crest (a ball, a hoop, a trophy, a star) and
 * the pack's stars on a label band. It is drawn on a 40 by 60 grid and
 * blown up by a whole number, so every pixel stays a pixel.
 *
 * grid(...) answers an array of colours (or null) so node can test it;
 * url(...) turns one into a data URL in the browser and caches it.
 */
(function(){
'use strict';

var API_VERSION = 1;
var isNode = typeof module !== 'undefined' && module.exports && typeof window === 'undefined';

/* ── colour ─────────────────────────────────────────────────────────────── */
function hex(c){
  c = String(c || '#888').replace('#', '');
  if (c.length === 3) c = c.replace(/(.)/g, '$1$1');
  var n = parseInt(c, 16);
  return isNaN(n) ? [136, 136, 136] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgb(a){ return '#' + a.map(function(v){ v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); }).join(''); }
function mix(c, d, t){ var a = hex(c), b = hex(d); return rgb([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]); }
function lum(c){ var a = hex(c); return (0.299 * a[0] + 0.587 * a[1] + 0.114 * a[2]) / 255; }
/* a shade that is still the colour: dark colours go toward deep blue, light toward warm white */
function dark(c, t){ return mix(c, '#0b0d18', t == null ? 0.38 : t); }
function lite(c, t){ return mix(c, '#fff6e6', t == null ? 0.3 : t); }

/* ── item masks ─────────────────────────────────────────────────────────
   a: the first colour  b: the second (or a's shade)  c: the third (or b)
   d: a's shade  w: white  k: near black  m: metal  g: gold  .: empty     */
var MASK = {
  tee: ['..aaa..aaa..', '.aaaabbaaaa.', 'aaaaaaaaaaaa', 'aaaaaaaaaaaa', 'aa.aaaaaa.aa', '...aaaaaa...', '...aaaaaa...', '...aaaaaa...', '...aaaaaa...', '...bbbbbb...'],
  longsleeve: ['..aaa..aaa..', '.aaaabbaaaa.', 'aaaaaaaaaaaa', 'aaaaaaaaaaaa', 'aa.aaaaaa.aa', 'aa.aaaaaa.aa', 'aa.aaaaaa.aa', 'bb.aaaaaa.bb', '...aaaaaa...', '...bbbbbb...'],
  hoodie: ['....bbbb....', '..abb..bba..', '.aaab..baaa.', 'aaaaabbaaaaa', 'aaaaaaaaaaaa', 'aa.aaaaaa.aa', 'aa.abbbba.aa', 'aa.abbbba.aa', 'bb.aaaaaa.bb', '...bbbbbb...'],
  tank: ['...a....a...', '...aa..aa...', '..aaabbaaa..', '..aaaaaaaa..', '..aaaaaaaa..', '..aaaaaaaa..', '..aaaaaaaa..', '..aaaaaaaa..', '..bbbbbbbb..'],
  jersey: ['...a....a...', '...aabbaa...', '..aaaaaaaa..', '..aaawwaaa..', '..aaaawaaa..', '..aaaawaaa..', '..aaawwwaa..', '..aaaaaaaa..', '..bbbbbbbb..'],
  polo: ['..aaabbbaaa.', '.aaaabwbaaaa', 'aaaaaawaaaaa', 'aaaaaaaaaaaa', 'aa.aaaaaa.aa', '...aaaaaa...', '...aaaaaa...', '...aaaaaa...', '...bbbbbb...'],
  buttonup: ['..aabbbbaa..', '.aaaabbaaaa.', 'aaaaawaaaaaa', 'aaaaaaaaaaaa', 'aa.aawaaa.aa', 'aa.aaaaaa.aa', 'aa.aawaaa.aa', 'bb.aaaaaa.bb', '...aawaaa...', '...aaaaaa...'],
  flannel: ['..aaa..aaa..', '.aabaabaaba.', 'bbbbbbbbbbbb', 'aabaabaabaab', 'aa.aabaab.ab', 'bb.bbbbbb.bb', 'aa.aabaab.aa', 'aa.aabaab.aa', '...bbbbbb...', '...aabaab...'],
  knit: ['..aaabbaaa..', '.aaaaaaaaaa.', 'aaaaaaaaaaaa', 'abababababab', 'aa.aaaaaa.aa', 'aa.aaaaaa.aa', 'aa.aaaaaa.aa', 'bb.aaaaaa.bb', '...bbbbbb...', '...bbbbbb...'],
  turtleneck: ['....bbbb....', '....bbbb....', '..aaaaaaaa..', '.aaaaaaaaaa.', 'aaaaaaaaaaaa', 'aa.aaaaaa.aa', 'aa.aaaaaa.aa', 'aa.aaaaaa.aa', '...aaaaaa...', '...aaaaaa...'],
  blazer: ['..aaa..aaa..', '.aaabwwbaaa.', 'aaaabwwbaaaa', 'aaaaabbaaaaa', 'aa.aacaaa.aa', 'aa.aaaaaa.aa', 'aa.aacaaa.aa', 'aa.aaaaaa.aa', 'bb.aaaaaa.bb', '...aa..aa...'],
  varsity: ['..bbbwwbbb..', '.bbaaaaaabb.', 'bbaaaaaaaabb', 'bbawwaaaaabb', 'bb.awaaaa.bb', 'bb.awwaaa.bb', 'bb.aaaaaa.bb', 'ww.aaaaaa.ww', '...wwwwww...'],
  bomber: ['...bbbbbb...', '.aaaaabaaaa.', 'aaaaaabaaaaa', 'aaaaaabaaaaa', 'aa.aaabaa.aa', 'aa.aaabaa.aa', 'aa.aaabaa.aa', 'bb.aaabaa.bb', '...bbbbbb...'],
  puffer: ['...bbbbbb...', '.aaaaaaaaaa.', 'aaaaaaaaaaaa', 'dddddddddddd', 'aa.aaaaaa.aa', 'dd.dddddd.dd', 'aa.aaaaaa.aa', 'dd.dddddd.dd', '...aaaaaa...', '...dddddd...'],
  denim: ['..aaa..aaa..', '.aaabbbbaaa.', 'aabbaaaabbaa', 'aabbaaaabbaa', 'aa.aaaaaa.aa', 'aa.aaaaaa.aa', 'aa.aaaaaa.aa', 'bb.aaaaaa.bb', '...bbbbbb...'],
  trench: ['..aaa..aaa..', '.aaabbbbaaa.', 'aaaaabbaaaaa', 'aaaaaaaaaaaa', 'aa.aaaaaa.aa', 'aa.bbbbbb.aa', 'aa.aaaaaa.aa', 'aa.aaaaaa.aa', '...aaaaaa...', '...aaaaaa...', '...aaa.aaa..'],
  track: ['...bbbbbb...', '.aaaaawaaaa.', 'abaaaawaaaba', 'abaaaawaaaba', 'ab.aaawaa.ba', 'ab.aaawaa.ba', 'ab.aaawaa.ba', 'bb.aaawaa.bb', '...bbbbbb...'],
  jeans: ['aaaaaaaaaa', 'aabaaaabaa', 'aaaaaaaaaa', 'aaaaaaaaaa', 'aaaa..aaaa', 'aaaa..aaaa', 'aaaa..aaaa', 'aaaa..aaaa', 'aaaa..aaaa', 'bbbb..bbbb'],
  sweats: ['bbbbbbbbbb', 'aaaawwaaaa', 'aaaaaaaaaa', 'aaaa..aaaa', 'aaaa..aaaa', 'aaaa..aaaa', 'aaaa..aaaa', 'aaa....aaa', 'bbb....bbb'],
  trousers: ['aaaaaaaaaa', 'aaaaaaaaaa', 'adaa..aada', 'adaa..aada', 'adaa..aada', 'adaa..aada', 'adaa..aada', 'adaa..aada', 'aaaa..aaaa'],
  cargos: ['aaaaaaaaaa', 'aaaaaaaaaa', 'aaaa..aaaa', 'bbaa..aabb', 'bbaa..aabb', 'aaaa..aaaa', 'aaaa..aaaa', 'aaaa..aaaa', 'bbbb..bbbb'],
  shorts: ['aaaaaaaaaa', 'aaaaaaaaaa', 'aaaa..aaaa', 'aaaa..aaaa', 'aaaa..aaaa', 'bbbb..bbbb'],
  sneaker: ['......aaa....', '.....aaaaa...', '....aabaaa...', '..aaabbaaaaa.', '.aaaaaaaaaaaa', 'ccccccccccccc', '.ccccccccccc.'],
  hitop: ['.....aaaa...', '.....abaa...', '.....aaba...', '.....abaa...', '..aaaaaaaaa.', '.aaaaaaabaaa', '.aaaaaaaaaaa', 'cccccccccccc'],
  boot: ['.....aaaa...', '.....aaaa...', '.....abba...', '.....aaaa...', '..aaaaaaaa..', '.aaaaaaaaaa.', 'bbbbbbbbbbbb', 'kkkkkkkkkkkk'],
  slide: ['....bbbbbb..', '...bbbbbbbb.', '...aaaaaa...', '..aaaaaaaa..', 'cccccccccccc'],
  dress: ['......aaaa..', '..aaaaaaaa..', '.aaaaaaaaaaa', 'bbbbbbbbbbbb'],
  runner: ['.......aa...', '.....aaaaa..', '...aaaabaaa.', '.aaaabbaaaaa', 'aaaaaaaaaaaa', 'wcwcwcwcwcwc', 'cccccccccccc'],
  beanie: ['....bb....', '..aaaaaa..', '.aaaaaaaa.', 'aaaaaaaaaa', 'aaaaaaaaaa', 'bbbbbbbbbb', 'bbbbbbbbbb'],
  bucket: ['...aaaaa...', '..aaaaaaa..', '..aaaaaaa..', '..bbbbbbb..', '.aaaaaaaaa.', 'aaaaaaaaaaa'],
  cap: ['...aaaa.....', '..aaaaaa....', '.aabaaaaa...', '.aaaaaaaa...', '.aaaaaaabbbb'],
  durag: ['..aaaaaa...', '.aaaaaaaa..', 'aaaaaaaaaa.', 'aaaaaaaaaab', 'aaaaaaaa.bb', '.........bb'],
  shades: ['aaaaaaaaaaaa', 'bbbbb..bbbbb', 'bbbbb..bbbbb', '.bbb....bbb.'],
  frames: ['aaaaa..aaaaa', 'a...aaaa...a', 'a...a..a...a', 'aaaaa..aaaaa'],
  sport: ['.aaaaaaaaaa.', 'abbbbbbbbbba', 'abbbbbbbbbba', '.aaa....aaa.'],
  crew: ['..aaa...', '..bbb...', '..aaa...', '..aaa...', '..aaaa..', '..aaaaaa', '..aaaaaa'],
  high: ['..bbb...', '..aaa...', '..aaa...', '..bbb...', '..aaa...', '..aaa...', '..aaaa..', '..aaaaaa', '..aaaaaa'],
  ankle: ['..bbbb..', '..aaaaa.', '..aaaaaa', '..aaaaaa'],
  cuban: ['a........a', 'a........a', '.a......a.', '.a......a.', '..aa..aa..', '....aa....'],
  chain: ['a........a', 'a........a', '.a......a.', '..a....a..', '...a..a...', '....bb....', '....bb....'],
  beads: ['a........a', 'b........b', '.a......a.', '..b....b..', '...abab...'],
  watch: ['..bbb..', '..bbb..', '.aaaaa.', '.awwwa.', '.awkwa.', '.awwwa.', '.aaaaa.', '..bbb..', '..bbb..'],
  backpack: ['..bbbb..', '.b....b.', 'aaaaaaaa', 'aaaaaaaa', 'aabbbbaa', 'aabbbbaa', 'aaaaaaaa', 'aaaaaaaa'],
  crossbody: ['b.........', '.b........', '..b.......', '...b......', '....aaaaa.', '....aabaa.', '....aaaaa.'],
  duffel: ['....bbbb....', '...b....b...', '.aaaaaaaaaa.', 'aaaaaaaaaaaa', 'abbbbbbbbbba', 'aaaaaaaaaaaa', '.aaaaaaaaaa.'],
  over: ['..aaaaaa..', '.a......a.', 'a........a', 'bb......bb', 'bb......bb', 'bb......bb'],
  coffee: ['.bbbbbb.', 'aaaaaaaa', '.aaaaaa.', '.wwwwww.', '.aaaaaa.', '..aaaa..'],
  phone: ['aaaaa', 'awwwa', 'awwwa', 'awwwa', 'awwwa', 'aaaaa'],
  band: ['aaaaaaaaaaaa', 'aaaaaaaaaaaa', 'aaaaaaaaaaaa'],
  wide: ['aaaaaaaaaaaa', 'aaaaaaaaaaaa', 'aawaaaaaawaa', 'aaaaaaaaaaaa', 'aaaaaaaaaaaa'],
  tied: ['aaaaaaaaaa..', 'aaaaaaaaaaa.', 'aaaaaaaaaaaa', '.........aa.', '..........a.'],
  wrist: ['.aaaaaa.', 'aaaaaaaa', 'aaa..aaa', 'aaa..aaa', 'aaaaaaaa', '.aaaaaa.'],
  specs: ['aaaaaaaaaaaa', 'abbbbaabbbba', 'abbbbaabbbba', 'aaaaa..aaaaa', 'a..........a'],
  guard: ['.aaaaaaaa.', 'aawawawaaa', 'aaaaaaaaaa', '.aaaaaaaa.'],
  arm: ['.aaa', '.aaa', 'aaaa', 'aaaa', 'aaaa', 'aaa.', 'aaa.', 'aaa.', 'aaa.', 'bbb.'],
  half: ['.aaa', '.aaa', 'aaaa', 'aaaa', 'bbbb'],
  fingers: ['..aaaa..', '.aaaaaa.', 'aaa..aaa', 'aa....aa', 'aaa..aaa', '.aaaaaa.', '..aaaa..'],
  full: ['aaaaaaaaaa', 'aaaaaaaaaa', 'aaaa..aaaa', 'aaaa..aaaa', 'aaaa..aaaa', 'aaaa..aaaa', 'aaaa..aaaa', 'aaaa..aaaa', 'aaa....aaa'],
  three: ['aaaaaaaaaa', 'aaaaaaaaaa', 'aaaa..aaaa', 'aaaa..aaaa', 'aaaa..aaaa', 'aaaa..aaaa', 'bbbb..bbbb'],
  pad: ['..aaaa..', '.aaaaaa.', 'aaabbaaa', 'aabbbbaa', 'aaabbaaa', '.aaaaaa.', '..aaaa..'],
  one: ['..aaa..', '.aaaaa.', 'aabbbaa', '.aaaaa.', '..aaa..'],
  brace: ['..aaa...', '..aaa...', '.abbba..', '.abbbaaa', '.aaaaaaa', '..aaaaaa'],
  low: ['..bbbb..', '..aaaaa.', '..aaaaaa'],
  long: ['..aaa..aaa..', '.aaaawwaaaa.', 'aaaaaaaaaaaa', 'aaaawwaaaaaa', 'aa.aaaaaa.aa', 'aa.aaaaaa.aa', 'aa.aaaaaa.aa', 'aa.aaaaaa.aa', '...aaaaaa...'],
  /* an idle: a ball, and the arcs it is moving through */
  /* a nameplate: a bar with a name on it */
  plate: ['bbbbbbbbbbbbbb', 'baaaaaaaaaaaab', 'bawwwawwawwwab', 'baaaaaaaaaaaab', 'bbbbbbbbbbbbbb'],
  /* a card backdrop: a framed picture, sky over ground, with a light */
  frame: ['kkkkkkkkkkkk', 'kaaaaaaaaaak', 'kaaaaaaaccak', 'kaaaaaaaccak', 'kaaaaaaaaaak', 'kaaaaaaaaaak', 'kbbbbbbbbbbk', 'kbbbbbbbbbbk', 'kbbbbbbbbbbk', 'kkkkkkkkkkkk'],
  idle: ['..b....b....', '.b......b...', '....aaaa....', '...aakkaa...', '..aaakkaaa..', '..kkkkkkkk..', '..aaakkaaa..', '...aakkaa...', '....aaaa....', '.b......b...', '..b....b....'],
};
/* a shape key that means one thing in one slot and another in another */
var BY_SLOT = {
  socks: { high: 'high', crew: 'crew', ankle: 'ankle' }, csocks: { high: 'high', crew: 'crew', low: 'low' },
  under: { tee: 'tee', long: 'long' }, wrist: { band: 'wrist' }, knee: { pad: 'pad', one: 'one' },
  tights: { full: 'full', three: 'three' },
};
var SLOT_FALLBACK = { top: 'tee', outer: 'bomber', bottom: 'jeans', shoes: 'sneaker', hat: 'beanie', eyes: 'shades',
  socks: 'crew', chain: 'chain', watch: 'watch', bag: 'backpack', phones: 'over', held: 'phone', band: 'band', goggles: 'specs',
  guard: 'guard', sleeveL: 'arm', sleeveR: 'arm', wrist: 'wrist', tape: 'fingers', tights: 'full', knee: 'pad', ankle: 'brace',
  csocks: 'crew', under: 'tee', idle: 'idle', plate: 'plate', bg: 'frame' };
var TAG = ['..aaaaaa', '.aaaaaaa', 'aawaaaaa', 'aaaaaaaa', 'aaaaaaaa', '.aaaaaaa', '..aaaaaa'];

function maskFor(it){
  var s = it && it.slot, k = it && it.k;
  if (s === 'idle') return MASK.idle;
  if (s === 'plate') return MASK.plate;
  if (s === 'bg') return MASK.frame;
  if (s === 'sleeveR' && MASK[k]) return MASK[k].map(function(r){ return r.split('').reverse().join(''); });
  var m = (BY_SLOT[s] && BY_SLOT[s][k]) || k;
  return MASK[m] || MASK[SLOT_FALLBACK[s]] || TAG;
}

/* the icon, as a size by size array of colours or null */
var ICON = 16;
function iconGrid(it){
  var m = maskFor(it), c = (it && it.c) || ['#888'];
  var a = c[0] || '#888', b = c[1] || dark(a, 0.3), cc = c[2] || b;
  /* an idle's swatch is the ball; a ball is orange-brown however it is tinted */
  if (it && it.slot === 'idle') { b = a; a = '#e8660f'; }
  var pal = { a: a, b: b, c: cc, d: dark(a, 0.26), w: '#f4f2ec', k: '#16181f', m: '#9aa0ab', g: '#e3b33a' };
  var h = m.length, w = 0; m.forEach(function(r){ w = Math.max(w, r.length); });
  var oy = Math.floor((ICON - h) / 2), ox = Math.floor((ICON - w) / 2);
  var g = new Array(ICON * ICON).fill(null), base = new Array(ICON * ICON).fill(null), placed = 0;
  m.forEach(function(row, y){
    var pad = Math.floor((w - row.length) / 2);
    for (var x = 0; x < row.length; x++) {
      var ch = row[x]; if (ch === '.' || !pal[ch]) continue;
      var X = ox + pad + x, Y = oy + y;
      if (X >= 1 && Y >= 1 && X < ICON - 1 && Y < ICON - 1) { g[Y * ICON + X] = pal[ch]; base[Y * ICON + X] = pal[ch]; placed++; }
    }
  });
  function at(x, y){ return x < 0 || y < 0 || x >= ICON || y >= ICON ? null : base[y * ICON + x]; }
  /* the light: lit where the shape meets the air above or to its left,
     shaded where it meets it below or to its right */
  for (var y = 0; y < ICON; y++) for (var x = 0; x < ICON; x++) {
    var v = base[y * ICON + x]; if (!v) continue;
    var up = !at(x, y - 1), lf = !at(x - 1, y), dn = !at(x, y + 1), rt = !at(x + 1, y);
    if ((dn || rt) && !(up || lf)) g[y * ICON + x] = dark(v, 0.22);
    else if ((up || lf) && !(dn || rt)) g[y * ICON + x] = lite(v, 0.24);
  }
  /* the outline: the darkest neighbour's colour, deep, so a white tee still has an edge */
  var out = g.slice();
  for (var y2 = 0; y2 < ICON; y2++) for (var x2 = 0; x2 < ICON; x2++) {
    if (base[y2 * ICON + x2]) continue;
    var n = [at(x2 - 1, y2), at(x2 + 1, y2), at(x2, y2 - 1), at(x2, y2 + 1)].filter(Boolean);
    if (!n.length) continue;
    n.sort(function(p, q){ return lum(p) - lum(q); });
    out[y2 * ICON + x2] = dark(n[0], lum(n[0]) > 0.6 ? 0.72 : 0.6);
  }
  out.placed = placed;
  return out;
}

/* ── pack art ──────────────────────────────────────────────────────────── */
var PACK_PAL = {
  street: { a: '#e8660f', b: '#6a2a08', crest: 'ball', stars: 1 },
  league: { a: '#3a6fd8', b: '#14244f', crest: 'hoop', stars: 2 },
  hof: { a: '#e3a92f', b: '#5a3e0a', crest: 'trophy', stars: 3 },
  season: { a: '#8a4fd4', b: '#2e1652', crest: 'star', stars: 0 },
};
var PW = 40, PH = 60;
function packGrid(id){
  var P = PACK_PAL[id] || PACK_PAL.street;
  var body = [dark(P.a, 0.55), dark(P.a, 0.3), P.a, lite(P.a, 0.22), lite(P.a, 0.5)];
  var G = lite(P.a, 0.12), g = dark(P.a, 0.45), H = lite(P.a, 0.6), K = dark(P.b, 0.55), W = '#fffaf0';
  var px = new Array(PW * PH).fill(null);
  function put(x, y, c){ if (x >= 0 && y >= 0 && x < PW && y < PH && c) px[y * PW + x] = c; }
  function get(x, y){ return x >= 0 && y >= 0 && x < PW && y < PH ? px[y * PW + x] : null; }
  function inset(y){ return y < 9 || y > 50 ? 2 : y < 11 || y > 48 ? 1 : 0; }
  for (var y = 7; y <= 52; y++) {
    var i0 = 1 + inset(y), i1 = PW - 2 - inset(y);
    for (var x = i0; x <= i1; x++) {
      var u = (x - i0) / Math.max(1, i1 - i0);
      var t = u < 0.1 ? 3 : u < 0.62 ? 2 : u < 0.86 ? 1 : 0;
      if (y <= 9 || y >= 50) t = Math.max(0, t - 1);
      var d = x + y * 0.62;
      if (d > 24 && d < 31) t = Math.min(4, t + 1);
      if (d >= 33 && d < 34.6) t = 4;
      put(x, y, body[t]);
    }
  }
  for (var cx2 = 4; cx2 <= 35; cx2 += 4) { put(cx2, 8, body[0]); put(cx2 + 1, 9, body[4]); put(cx2, 51, body[0]); put(cx2 + 1, 50, body[4]); }
  function seal(y0, y1, top){
    for (var yy = y0; yy <= y1; yy++) for (var xx = 0; xx < PW; xx++) {
      if ((top ? yy === y0 : yy === y1) && xx % 2 === 1) continue;
      var c = xx % 2 === 0 ? G : g; if (yy === (top ? y1 : y0)) c = g; if (xx < 3 && c === G) c = H;
      put(xx, yy, c);
    }
  }
  seal(0, 6, true); seal(53, 59, false);
  for (var sx = 0; sx < PW; sx++) { if (get(sx, 2)) put(sx, 2, H); if (get(sx, 56) && sx % 2 === 0) put(sx, 56, H); }
  [[35, 3], [36, 3], [37, 3], [36, 4], [35, 2], [36, 2], [37, 2], [38, 2], [34, 1], [35, 1], [36, 1], [37, 1], [38, 1], [39, 1]].forEach(function(p){ px[p[1] * PW + p[0]] = null; });
  /* the crest: a ring in the pack's light colour with a dark field inside */
  var ccx = 19.5, ccy = 24.5, r = 9.6;
  function inDisc(x, y){ var dx = x - ccx, dy = y - ccy; return dx * dx + dy * dy <= (r - 2.2) * (r - 2.2); }
  for (var y3 = 12; y3 <= 37; y3++) for (var x3 = 8; x3 <= 31; x3++) {
    var dx = x3 - ccx, dy = y3 - ccy, q = Math.sqrt(dx * dx + dy * dy);
    if (q <= r - 2.2) put(x3, y3, K);
    else if (q <= r - 1) put(x3, y3, dx + dy > 2 ? g : G);
    else if (q <= r) put(x3, y3, dx + dy > 2 ? body[0] : H);
  }
  var OR = '#e8660f', ORd = '#9c3f08', ORl = '#ff9a4a';
  if (P.crest === 'ball') {
    for (var y4 = 17; y4 <= 32; y4++) for (var x4 = 12; x4 <= 27; x4++) {
      var bx = x4 - 19.5, by = y4 - 24.5, bq = bx * bx + by * by;
      if (bq <= 42) put(x4, y4, bx + by < -4 ? ORl : bx + by > 5 ? ORd : OR);
    }
    for (var s1 = 18; s1 <= 31; s1++) { put(19, s1, '#2a1406'); put(20, s1, '#2a1406'); }
    for (var s2 = 13; s2 <= 26; s2++) put(s2, 24, '#2a1406');
    [[15, 19], [15, 20], [14, 21], [14, 22], [14, 26], [14, 27], [15, 28], [15, 29], [24, 19], [24, 20], [25, 21], [25, 22], [25, 26], [25, 27], [24, 28], [24, 29]].forEach(function(p){ put(p[0], p[1], '#2a1406'); });
    put(16, 20, '#ffd2a6'); put(17, 20, '#ffd2a6');
  } else if (P.crest === 'hoop') {
    for (var bb = 13; bb <= 26; bb++) for (var by2 = 16; by2 <= 21; by2++) put(bb, by2, by2 === 16 ? '#ffffff' : '#dfe6f2');
    for (var bb2 = 17; bb2 <= 22; bb2++) { put(bb2, 18, OR); put(bb2, 20, OR); } put(17, 19, OR); put(22, 19, OR);
    for (var rr = 14; rr <= 25; rr++) put(rr, 23, OR);
    for (var ny = 24; ny <= 31; ny++) { var nw = Math.max(1, 5 - Math.floor((ny - 24) / 2)); for (var nx = -nw; nx <= nw; nx++) if ((nx + ny) % 2 === 0) put(19 + nx, ny, '#f4f2ec'); }
  } else if (P.crest === 'trophy') {
    var tr = ['.aaaaaaaaa.', 'aaaaaaaaaaa', 'aaaaaaaaaaa', 'aa.aaaaa.aa', '.a.aaaaa.a.', '...aaaaa...', '....aaa....', '.....a.....', '....aaa....', '...aaaaa...', '...bbbbb...'];
    tr.forEach(function(row, j){ for (var i = 0; i < row.length; i++) { if (row[i] === 'a') put(14 + i, 18 + j, i < 4 ? '#fff0b4' : i > 7 ? '#c98a12' : '#f2c23a'); if (row[i] === 'b') put(14 + i, 18 + j, '#6a4a10'); } });
    put(16, 19, '#ffffff');
  } else {
    var st = ['.....a.....', '.....a.....', '....aaa....', 'aaaaaaaaaaa', '.aaaaaaaaa.', '..aaaaaaa..', '..aaa.aaa..', '.aa.....aa.'];
    st.forEach(function(row, j){ for (var i = 0; i < row.length; i++) if (row[i] === 'a') put(14 + i, 20 + j, j < 3 ? '#fff6c8' : i < 5 ? '#ffe27a' : '#f0b030'); });
  }
  /* the label band and the pack's stars on it */
  for (var y5 = 40; y5 <= 46; y5++) { var j0 = 1 + inset(y5), j1 = PW - 2 - inset(y5); for (var x5 = j0; x5 <= j1; x5++) put(x5, y5, y5 === 40 ? H : y5 === 46 ? g : G); }
  var star = ['..a..', '..a..', 'aaaaa', '.aaa.', '.a.a.'];
  for (var s = 0; s < P.stars; s++) { var sx2 = Math.round(20 - (P.stars * 6 - 1) / 2 + s * 6); star.forEach(function(row, j){ for (var i = 0; i < 5; i++) if (row[i] === 'a') put(sx2 + i, 41 + j, K); }); }
  if (!P.stars) for (var x6 = 9; x6 <= 30; x6 += 3) { put(x6, 43, K); put(x6 + 1, 44, K); }
  var out = px.slice();
  for (var y7 = 0; y7 < PH; y7++) for (var x7 = 0; x7 < PW; x7++) {
    if (!px[y7 * PW + x7]) continue;
    if (!get(x7 - 1, y7) || !get(x7 + 1, y7) || !get(x7, y7 - 1) || !get(x7, y7 + 1)) out[y7 * PW + x7] = y7 <= 6 || y7 >= 53 ? g : K;
  }
  px = out;
  [[5, 13], [4, 14], [5, 14], [6, 14], [5, 15]].forEach(function(p){ put(p[0], p[1], W); }); put(33, 36, H); put(6, 38, body[4]);
  return px;
}

/* ── coins and shards ─────────────────────────────────────────────────── */
/* THE COIN, 12 cells: a round outline, a rim lit from the top left, a ring
   struck into the face (dark where the light hits it, bright where it falls
   away) and a raised bar in the middle. It is drawn at a whole number of
   pixels a cell (12, 24, 36), never between: COIN_N is the grid every
   coin's CSS size is a multiple of (check-shopart and check-closet). */
var COIN = [
  '....kkkk....',
  '..kkllllkk..',
  '.kwleeeebdk.',
  '.klebbbbedk.',
  'klebbyebbydk',
  'klebbyebbydk',
  'klebbyebbydk',
  'klebbyebbydk',
  '.kbebbbbydk.',
  '.kbbyyyyddk.',
  '..kkddddkk..',
  '....kkkk....',
];
var COIN_N = COIN.length;
var COIN_PAL = { k: '#4a2c06', d: '#b8780e', b: '#f2c23a', l: '#ffe27a', w: '#fffbe6', y: '#ffe7a0', e: '#c08412' };
var GEM = ['...a...', '..aba..', '.abbba.', 'abbcbba', '.abbba.', '..aba..', '...a...'];
var RCOL = { common: '#aeb4bf', rare: '#5b9bff', epic: '#b47cff', legendary: '#f2c23a' };
function smallGrid(rows, pal){
  var h = rows.length, w = rows[0].length, g = new Array(w * h).fill(null);
  rows.forEach(function(row, y){ for (var x = 0; x < w; x++) if (pal[row[x]]) g[y * w + x] = pal[row[x]]; });
  return { w: w, h: h, px: g };
}
function coinGrid(){ return smallGrid(COIN, COIN_PAL); }
function gemGrid(r){ var c = RCOL[r] || RCOL.common; return smallGrid(GEM, { a: dark(c, 0.55), b: c, c: '#ffffff' }); }

/* ── to pictures, in the browser ───────────────────────────────────────── */
var cache = {};
function toURL(key, w, h, px, sc){
  if (cache[key]) return cache[key];
  if (typeof document === 'undefined') return '';
  var cv = document.createElement('canvas'); cv.width = w * sc; cv.height = h * sc;
  var x = cv.getContext('2d'); if (!x) return '';
  for (var y = 0; y < h; y++) for (var i = 0; i < w; i++) { var c = px[y * w + i]; if (!c) continue; x.fillStyle = c; x.fillRect(i * sc, y * sc, sc, sc); }
  try { cache[key] = cv.toDataURL(); } catch (e) { cache[key] = ''; }
  return cache[key];
}
function iconURL(it){ return toURL('i:' + (it && it.id) + ':' + ((it && it.c) || []).join(','), ICON, ICON, iconGrid(it), 4); }
function packURL(id){ return toURL('p:' + id, PW, PH, packGrid(id), 4); }
function coinURL(){ var g = coinGrid(); return toURL('coin', g.w, g.h, g.px, 4); }
function gemURL(r){ var g = gemGrid(r); return toURL('gem:' + r, g.w, g.h, g.px, 4); }
/* any small sprite from rows and a palette ('.' is empty), cached by key */
function spriteURL(key, rows, pal, sc){ var g = smallGrid(rows, pal); return toURL('s:' + key, g.w, g.h, g.px, sc || 4); }
/* THE STREAK FLAME, three frames that flicker. Hot core, orange body, a red
   lick at the edge; the cold flame (a frozen day) is the same shape in blue. */
var FLAME = [
  ['....r.......', '...rr...r...', '...rrr..rr..', '..rroor.rr..', '..roooorrr..', '.rrooyoorr..', '.roooyyoorr.', 'rrooyyyyoor.', 'rooyywwyyor.', 'rooywwwwyorr', 'rooywwwwyoor', '.rooywwyoor.', '..rrooooor..', '...rrrrrr...'],
  ['.......r....', '...r...rr...', '..rr..rrr...', '..rr.rooorr.', '..rrroooor..', '..rrooyoorr.', '.rrooyyooor.', '.rooyyyyoorr', '.royywwyyoor', 'rroywwwwyoor', 'rooywwwwyoor', '.rooywwyoor.', '..rooooorr..', '...rrrrrr...'],
  ['.....r......', '....rr..r...', '...rrr.rr...', '..rrooorrr..', '.rrooooorr..', '.rrooyyoorr.', '.rooyyyyoor.', 'rrooyyyyoorr', 'rooyywwyyoor', 'rooywwwwyoor', 'rooywwwwyoor', '.rooywwyoor.', '..rrooooor..', '...rrrrrr...'],
];
var FLAME_PAL = { r: '#d8381e', o: '#ff8a1e', y: '#ffd23a', w: '#fff6d8' };
var COLD_PAL = { r: '#2f6fd8', o: '#5aa8ff', y: '#a8dcff', w: '#f0fbff' };
function flameURL(f, cold){ return spriteURL('fl' + (f | 0) + (cold ? 'c' : ''), FLAME[(f | 0) % 3], cold ? COLD_PAL : FLAME_PAL, 4); }
var SNOW = ['...w...', '.w.w.w.', '..www..', 'wwwbwww', '..www..', '.w.w.w.', '...w...'];
function snowURL(){ return spriteURL('snow', SNOW, { w: '#d8f2ff', b: '#5aa8ff' }, 4); }
var WHEELI = ['..kkkkk..', '.kyrybrk.', 'kbyrybryk', 'krbyrybrk', 'kyrbwbryk', 'kryby.rbk', 'kbryrybrk', '.kbryryk.', '..kkkkk..'];
function wheelIconURL(){ return spriteURL('wheel', WHEELI, { k: '#5a3e0a', y: '#f2c23a', r: '#e0483e', b: '#3a6fd8', w: '#ffffff' }, 4); }
var SCROLL = ['.kkkkkkk.', 'kwwwwwwwk', 'kwkkkkkwk', 'kwwwwwwwk', 'kwkkkkwwk', 'kwwwwwwwk', 'kwkkkkkwk', 'kwwwwwwwk', '.kkkkkkk.'];
function questIconURL(){ return spriteURL('quest', SCROLL, { k: '#5a3e0a', w: '#f4e7c4' }, 4); }
function img(url, cls, alt){ return url ? '<img src="' + url + '" class="' + cls + '" alt="' + (alt || '') + '" draggable="false">' : '<span class="' + cls + '"></span>'; }

var API = {
  API_VERSION: API_VERSION, ICON: ICON, PW: PW, PH: PH, MASK: MASK, PACK_PAL: PACK_PAL, RCOL: RCOL, COIN: COIN, COIN_N: COIN_N, GEM_N: GEM.length,
  maskFor: maskFor, iconGrid: iconGrid, packGrid: packGrid, coinGrid: coinGrid, gemGrid: gemGrid,
  iconURL: iconURL, packURL: packURL, coinURL: coinURL, gemURL: gemURL,
  icon: function(it, cls){ return img(iconURL(it), cls || 'ia-icon'); },
  pack: function(id, cls){ return img(packURL(id), cls || 'ia-pack'); },
  coin: function(cls){ return img(coinURL(), cls || 'ia-coin', 'coins'); },
  gem: function(r, cls){ return img(gemURL(r), cls || 'ia-gem'); },
  flame: function(f, cold, cls){ return img(flameURL(f, cold), cls || 'ia-flame'); }, flameURL: flameURL,
  snow: function(cls){ return img(snowURL(), cls || 'ia-snow'); }, wheelIcon: function(cls){ return img(wheelIconURL(), cls || 'ia-wheel'); }, wheelIconURL: wheelIconURL,
  questIcon: function(cls){ return img(questIconURL(), cls || 'ia-quest'); }, spriteURL: spriteURL, FLAME: FLAME,
  dark: dark, lite: lite, mix: mix, lum: lum,
};
if (isNode) module.exports = API;
else if (typeof window !== 'undefined') {
  window.RTF_ART = API;
  /* the top bar's coin pill is static markup styled by career-kit.js: it
     draws this same coin through one custom property, so there is one coin */
  try { var cu = coinURL(); if (cu) document.documentElement.style.setProperty('--rtf-coin', 'url("' + cu + '")'); } catch (e) {}
}
})();
