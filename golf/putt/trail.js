/* golf/putt/trail.js: the walk between two Putt Putt Tour holes, as a place you walk through.

   Owner's brief: an open world you move through with a joystick, a waypoint arrow on the edge of the
   screen like an open world game, two to three screens of walking to the next hole, things to do on the
   way in every world, and things to pick up. It has to look like a real 3D game, and the scale of
   everything has to be right.

   So a trail is a 3D scene drawn by hole3d.js (opt.scene: no course in it), the same voxel renderer and
   the same light as the holes, with land, trees and buildings built here at the golfer's own scale:

     the golfer is GH (4 ft) tall in the trail's feet, and that stands for a 6 ft person, so everything
     else is built at two thirds of its real size: a 4.4 ft path is a 6.6 ft path, a 16 ft tree is a
     24 ft tree, a 7 ft wall is a 10.5 ft wall. The golfer is drawn at the height the camera shows a
     4 ft figure, so he and the scene are one scale.

   A trail runs north (up the screen) from a clearing just past the hole you left to an arch in front of
   the hole you are walking to: TRAIL_L feet, about two and a half screens on a phone. The camera rides
   behind the golfer. What is on the way:

     chests hidden off the path, behind trees and rocks, and one in the clearing off a spur: walk up to one
     and it opens, its coins burst out onto the ground, and each is picked up by walking over it, once for
     good. On some trails the clearing is fenced and the gate opens with a key found somewhere else,
     breakables in the world's own form (crates, pots, barrels, ice blocks, pumpkins), smashed by walking
     into them, the first time each with a coin inside, the only coins not in a chest,
     one golden ball hidden off the path on every trail; all of a world's golden balls is a reward,
     a local who talks about the hole ahead when you walk up to them,
     and the world's own ground: water to walk round, lava that sends you back, ice that slides.

   Crossing into a new world, a wall of that world stands across the land with a door on the path. The
   door is putt.js's (the stars fill it), and shut it holds.

   What it decides is only where things are. Every pick up is recorded by putt.js in the Tour record and
   merged like everything else there (it only adds).

     plan(spec)            -> the trail's layout, deterministic from spec.seed
     slices(plan)          -> step(ms): renders the scene a few milliseconds a call, then the result
     run(box, plan, pic, api) -> starts the walk in box; api: { found, pick(kind, id, n), door(cb), arrive(), leave(), look, toast }
*/
(function(){
var API_VERSION = 1;
var GH = 4.0, ELEV = 42, D2R = Math.PI / 180, SE = Math.sin(ELEV * D2R), CE = Math.cos(ELEV * D2R);
var TRAIL_L = 150, HALFW = 46, PW = 2.2, VIEW_FT = 60, SPEED = 9.5, STRIDE = 5.4;
var PIX_HEART = ['.oo.oo.', 'orhrrro', 'orrrrro', '.orrro.', '..oro..', '...o...'];
var PIX_GEM = ['.ooooo.', 'ohrrrro', 'orhrrro', '.orrro.', '..oro..', '...o...'];
var PIX_PART = ['ooo....', 'ohro...', 'orrro..', '.orrro.', '..orrgo', '...oggo', '....ooo'];
var COIN_V = 3, TART = 0.125;   // the trail is painted on a finer grid than a hole, because the camera comes in closer

function hash(x, y, s){ var h = (x * 374761393 + y * 668265263 + s * 982451653) | 0; h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967296; }
function vn(x, y, s){ var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  var a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
function fbm(x, y, s){ return vn(x, y, s) * 0.55 + vn(x * 2.1, y * 2.1, s + 7) * 0.3 + vn(x * 4.3, y * 4.3, s + 13) * 0.15; }
function sm(a, b, t){ t = Math.max(0, Math.min(1, (t - a) / (b - a))); return t * t * (3 - 2 * t); }
function segD(x, y, ax, ay, bx, by){ var dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1e-9, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L)); return Math.hypot(x - ax - t * dx, y - ay - t * dy); }
function rng(seed){ var a = seed >>> 0; return function(){ a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = (t + Math.imul(t ^ t >>> 7, 61 | t)) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hstr(s){ var h = 2166136261; for (var i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/* ------------------------------------------------------------------------------- each world */
/* g: ground [base, alt, alt2, how often the alts show], p: the path, tree/low: what grows, brk: what
   breaks, haz: the ground to keep off ('water' blocks, 'lava' sends you back, 'ice' slides, 'slow'),
   lm: the landmarks a trail of this world can carry, wall: the boundary wall's two colours, npc: the local */
var KIT = {
  clubhouse:{ g:['#78ad58', '#82b862', '#6ea24f', 0.18], mow:true, p:['#d8ccb0', '#e4d9c0', '#c8ba98'], tree:['broad', 'broad', 'broad', 'pine'], leaves:['#2f7d3e', '#3b8f4a', '#25693a'], bark:'#5a3d2e',
    low:['bush', 'bush', 'bush', 'rock'], brk:'crate', haz:'water', hazC:['#3f86c8', '#6fb3e6'], lm:['shed', 'green', 'bench', 'lamps'], wall:['#e8e2d0', '#a99c7c'],
    npc:{ skin:'light', polo:'navy', hat:'white', pants:'stone', hair:'brown', hairStyle:'short', cap:true, hatStyle:'cap', gender:'male' }, who:'the starter' },
  temple:{ g:['#3d6a2c', '#467634', '#33602a', 0.2], p:['#b9ae84', '#cdc29a', '#a59a72'], paved:true, tree:['broad', 'broad', 'palm'], leaves:['#1f5a26', '#2b6e30', '#174a20'], bark:'#4a3624',
    low:['bush', 'fern', 'rock'], brk:'pot', haz:'water', hazC:['#2f9a7e', '#5cc0a0'], lm:['ruin', 'statue', 'columns'], wall:['#b9ae84', '#6f6a4e'],
    npc:{ skin:'tan', polo:'gold', hat:'gold', pants:'stone', hair:'black', hairStyle:'short', cap:false, gender:'female' }, who:'the explorer' },
  pirate:{ g:['#e8d49a', '#f0dca6', '#dcc88c', 0.25], p:['#c9a96e', '#d8b97e', '#b8985e'], plank:true, tree:['palm', 'palm', 'palm'], leaves:['#2e8a3e', '#3fa04a', '#246e30'], bark:'#8a6a44',
    low:['rock', 'shell', 'bush'], brk:'barrel', haz:'water', hazC:['#1f8fc8', '#5cc6ee'], sea:true, lm:['wreck', 'boat', 'barrels'], wall:['#8a6a44', '#5a4228'],
    npc:{ skin:'tan', polo:'black', hat:'black', pants:'navy', hair:'black', hairStyle:'long', cap:false, gender:'male' }, who:'the old salt' },
  canyon:{ g:['#c8865a', '#d49668', '#b8784e', 0.2], p:['#e2c49a', '#ead0aa', '#d4b48a'], tree:['cactus', 'cactus', 'dead'], leaves:['#4f8a3e', '#62a04c', '#3e7030'], bark:'#6a4a30',
    low:['rock', 'rock', 'bushdry'], brk:'crate', haz:null, lm:['mesa', 'tower', 'cart'], wall:['#a8643c', '#6e3e22'],
    npc:{ skin:'tan', polo:'gold', hat:'stone', pants:'navy', hair:'brown', hairStyle:'short', cap:true, hatStyle:'cap', gender:'male' }, who:'the prospector' },
  volcano:{ g:['#3a3236', '#443a3e', '#2e282c', 0.22], p:['#6a5a52', '#7a6a60', '#5a4c46'], tree:['dead', 'basalt', 'basalt'], leaves:['#3a4a2e', '#4a5a34', '#2e3a24'], bark:'#2b2229',
    low:['rock', 'rockdark', 'ember'], brk:'pot', haz:'lava', dens:0.6, hazC:['#ff6a1a', '#ffc23a'], lm:['basaltset', 'vent', 'skull'], wall:['#4a4046', '#221c20'],
    npc:{ skin:'tan', polo:'black', hat:'black', pants:'grey', hair:'black', hairStyle:'buzz', cap:false, gender:'male' }, who:'the ranger' },
  frozen:{ g:['#eef4fb', '#f8fbff', '#dfe8f3', 0.2], p:['#c8d6e6', '#d6e2f0', '#b8c8da'], tree:['pine', 'pine', 'pine'], leaves:['#1f4f3e', '#2a6450', '#173e30'], bark:'#4a3626', snow:true,
    low:['rocksnow', 'bushsnow', 'rocksnow'], brk:'ice', haz:'ice', hazC:['#a8dcf4', '#d4f0ff'], lm:['igloo', 'snowman', 'cabin'], wall:['#dfe8f3', '#9fb2c8'],
    npc:{ skin:'light', polo:'teal', hat:'white', pants:'navy', hair:'blonde', hairStyle:'long', cap:false, gender:'female' }, who:'the ski patrol' },
  sky:{ g:['#f4f6fb', '#ffffff', '#e4e9f4', 0.22], p:['#f7d27a', '#ffe09a', '#e6c066'], tree:['puff', 'puff', 'broad'], leaves:['#8fd3a0', '#a6e0b4', '#7ac08c'], bark:'#c9a46a',
    low:['puffsmall', 'rainbowrock', 'puffsmall'], brk:'crate', haz:null, lm:['balloon', 'kite', 'pillar'], wall:['#ffffff', '#c9d4ea'],
    npc:{ skin:'porcelain', polo:'purple', hat:'white', pants:'stone', hair:'platinum', hairStyle:'curly', cap:false, gender:'female' }, who:'the balloonist' },
  neon:{ g:['#141030', '#1a1440', '#100c26', 0.3], grid:true, p:['#23307a', '#2a3a90', '#1c2868'], tree:['pylon', 'pylon', 'cab'], leaves:['#ff2bd6', '#2bf0ff', '#ffe02b'], bark:'#2a2440',
    low:['cube', 'cone', 'cone'], brk:'neoncube', haz:null, dens:0.35, lm:['cabinets', 'sign', 'pylons'], wall:['#ff2bd6', '#7a0e66'],
    npc:{ skin:'tan', polo:'rtggreen', hat:'black', pants:'navy', hair:'jet', hairStyle:'mohawk', cap:false, gender:'male' }, who:'the arcade keeper' },
  haunted:{ g:['#2e3a2a', '#36442e', '#283224', 0.2], p:['#5d4634', '#6d5440', '#4d3a2a'], tree:['dead', 'dead', 'dead'], leaves:['#3a4a2e', '#4a5a34', '#2e3a24'], bark:'#2b2229',
    low:['tomb', 'rock', 'pumpkin'], brk:'pumpkin', haz:'slow', hazC:['#5d4634', '#4a3628'], lm:['crypt', 'graves', 'fenceyard'], wall:['#4a4652', '#24222a'],
    npc:{ skin:'porcelain', polo:'black', hat:'black', pants:'grey', hair:'white', hairStyle:'long', cap:false, gender:'female' }, who:'the caretaker' },
  harvest:{ g:['#9c8a44', '#a8964c', '#8e7c3c', 0.2], p:['#b08a58', '#c09a66', '#9a784a'], tree:['broad', 'broad', 'corn'], leaves:['#c8641e', '#e08a2a', '#a84e18'], bark:'#4a3624',
    low:['hay', 'pumpkin', 'bush'], brk:'hay', haz:'slow', hazC:['#6a4e2e', '#5a4024'], lm:['barn', 'scarecrow', 'cornfield'], wall:['#8b4a1e', '#5a2e10'],
    npc:{ skin:'tan', polo:'gold', hat:'stone', pants:'navy', hair:'auburn', hairStyle:'short', cap:true, hatStyle:'cap', gender:'male' }, who:'the farmer' }
};
function kitOf(th){ return KIT[th] || KIT.clubhouse; }

/* ---------------------------------------------------------------------------------- the plan */
/* spec: { seed, theme, theme0 (the world being left, on a trail that crosses), cross, gateOpen, to (hole number),
   carpet: [colour, colour], flag } */
function plan(spec){
  var seed = spec.seed >>> 0, R = rng(seed), L = TRAIL_L, th = spec.theme, th0 = spec.cross ? (spec.theme0 || th) : th;
  var HW = spec.halfW || HALFW, b = [-HW, -18, HW, L + 16];
  /* NO TWO WALKS ARE THE SAME WALK. A trail takes one of four shapes, each with its own amplitude and
     rhythm, mirrored at random: a meander, switchbacks, one long sweep round to the other side, and a
     twisting little lane. Where it bends is the seed's, so the shape of the walk changes every hole. */
  var Amax = Math.max(8, HW * 0.55), style = ['meander', 'switch', 'sweep', 'twist'][(R() * 4) | 0], flip = R() < 0.5 ? -1 : 1, A1, A2, f1, f2, p1 = R() * 6.28, p2 = R() * 6.28;
  if (style === 'switch'){ A1 = Math.min(Amax, 11 + R() * 5); f1 = 0.06 + R() * 0.02; A2 = 1 + R(); f2 = 0.16; }
  else if (style === 'sweep'){ A1 = Amax * (0.7 + R() * 0.2); f1 = Math.PI / (L - 10); p1 = 0; A2 = 2 + R() * 2; f2 = 0.09 + R() * 0.04; }
  else if (style === 'twist'){ A1 = 4 + R() * 2.5; f1 = 0.11 + R() * 0.04; A2 = 2.5 + R() * 1.5; f2 = 0.21 + R() * 0.05; }
  else { A1 = Math.min(Amax, 6 + R() * 4); A2 = 2 + R() * 2.5; f1 = 0.038 + R() * 0.012; f2 = 0.1 + R() * 0.04; }
  function cx(y){ var t = sm(-2, 22, y) * sm(L + 6, L - 18, y); return flip * t * (A1 * Math.sin(y * f1 + p1) + A2 * Math.sin(y * f2 + p2)); }
  // the path, south (the start) to north (the arch), a point every 2 ft
  var path = []; for (var y = L + 7; y >= -1; y -= 2) path.push([cx(y), y]);
  if (path[path.length - 1][1] !== -1) path.push([cx(-1), -1]);
  var cum = [0]; for (var i = 1; i < path.length; i++) cum.push(cum[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
  var gy = spec.cross ? Math.round(L * 0.72) : null;
  function themeAt(y){ return spec.cross && y > gy ? th0 : th; }
  // the spur and its clearing, to one side
  var ys = Math.round(L * (0.3 + R() * 0.4)); if (spec.cross && Math.abs(ys - gy) < 18) ys = gy - 26;
  var sx0 = cx(ys), sg = Math.abs(sx0 + 1) > 3 ? (sx0 > 0 ? -1 : 1) : (R() < 0.5 ? -1 : 1);   // toward the side with the room
  var crr = 4.5 + R() * 2, cdist = Math.min(13 + R() * 9, HW - sg * sx0 - crr - 3);
  var clr = { x:sx0 + sg * Math.max(9, cdist), y:ys - 3 - R() * 6, r:crr }, spur = [];
  // half the clearings have a little path out to them; the rest are hidden in the trees and found by wandering
  var spurOn = R() < 0.55;
  if (spurOn) for (var k = 0; k <= 10; k++){ var t = k / 10; spur.push([sx0 + (clr.x - sx0) * t + Math.sin(t * Math.PI) * 2 * sg, ys + (clr.y - ys) * t - Math.sin(t * Math.PI) * 2.5]); }
  // what the clearing holds: a chest most often, else a pile of things to smash
  var clrKind = R() < 0.7 ? 'chest' : 'pile';
  var locked = !spec.cross && clrKind === 'chest' && R() < 0.4;
  var start = { x:cx(L + 6), y:L + 6, r:7 };
  function pathD(x, y){ var m = 1e9; for (var i = 0; i < path.length - 1; i++){ var a = path[i], c = path[i + 1]; if (Math.abs(a[1] - y) > 6 && Math.abs(c[1] - y) > 6) continue; m = Math.min(m, segD(x, y, a[0], a[1], c[0], c[1])); } return m; }
  function spurD(x, y){ var m = 1e9; if (spur.length < 2) return m; for (var i = 0; i < spur.length - 1; i++) m = Math.min(m, segD(x, y, spur[i][0], spur[i][1], spur[i + 1][0], spur[i + 1][1])); return m; }
  // a field of how far each point is from the path, the spur and the clearings, read back smoothly
  var DS = 1, DX = Math.ceil((b[2] - b[0]) / DS) + 1, DY = Math.ceil((b[3] - b[1]) / DS) + 1, DD = new Float32Array(DX * DY);
  for (var j = 0; j < DY; j++) for (var i2 = 0; i2 < DX; i2++){ var x = b[0] + i2 * DS, yy = b[1] + j * DS; DD[j * DX + i2] = Math.min(pathD(x, yy), spurD(x, yy) + 0.4); }
  function walkD(x, y){ var fx = (x - b[0]) / DS, fy = (y - b[1]) / DS; if (fx < 0 || fy < 0 || fx >= DX - 1 || fy >= DY - 1) return 99;
    var i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, q = j * DX + i; return (DD[q] * (1 - u) + DD[q + 1] * u) * (1 - v) + (DD[q + DX] * (1 - u) + DD[q + DX + 1] * u) * v; }
  function inClear(x, y, pad){ pad = pad || 0; return Math.hypot(x - clr.x, y - clr.y) < clr.r + pad || Math.hypot(x - start.x, y - start.y) < start.r + pad || (y < 3 + pad && y > -16 && Math.abs(x) < 9 + pad); }

  var P = { spec:spec, seed:seed, L:L, b:b, path:path, cum:cum, cx:cx, gy:gy, themeAt:themeAt, clr:clr, spur:spur, locked:locked, style:style, clrKind:clrKind, start:start, walkD:walkD, inClear:inClear,
    things:[], cols:[], items:[], hazards:[] };

  // ---- the world's ground to keep off: ponds, lava pools, ice sheets, bogs. Never on the path or a clearing.
  var pools = []; for (var q = 0; q < 6; q++){ var py = 12 + R() * (L - 20), side = R() < 0.5 ? -1 : 1, kx = kitOf(themeAt(py));
    if (!kx.haz) continue; var px = cx(py) + side * (9 + R() * 14), pr = kx.haz === 'ice' ? 5 + R() * 4 : 3 + R() * 3.5;
    if (walkD(px, py) < pr + 2.5 || inClear(px, py, pr + 2) || (gy && Math.abs(py - gy) < pr + 3)) continue;
    pools.push({ x:px, y:py, r:pr, rx:pr * (1 + R() * 0.5), ry:pr * (0.7 + R() * 0.3), k:kx.haz, seed:q }); }
  if (kitOf(th).sea){ P.sea = { side:R() < 0.5 ? -1 : 1 }; }
  P.pools = pools;
  function poolAt(x, y){ for (var i = 0; i < pools.length; i++){ var o = pools[i], u = (x - o.x) / o.rx, v = (y - o.y) / o.ry, w = u * u + v * v + (vn(x * 0.4, y * 0.4, o.seed) - 0.5) * 0.5; if (w < 1) return o; } return null; }
  /* THE SHORE FOLLOWS THE PATH. Out at the plan's edge the sea was off camera on a phone for most of a walk,
     and the ships are what Pirate Cove has to show; so the water comes in to a strip of beach beside the path
     (and round the clearing, the spur and the ends), never nearer than it was allowed before. */
  var SEA = null, SEA_Y0 = b[1];
  if (P.sea){ var sd = P.sea.side, HWs = spec.halfW || HALFW; SEA = new Float32Array(Math.ceil(b[3] - b[1]) + 2);
    for (var sj = 0; sj < SEA.length; sj++){ var sy = b[1] + sj, near = 8;
      for (var yy2 = sy - 12; yy2 <= sy + 12; yy2 += 1.5) near = Math.max(near, sd * cx(yy2) + PW + 3.5);
      if (Math.abs(sy - clr.y) < clr.r + 8) near = Math.max(near, sd * clr.x + clr.r + 5);
      spur.forEach(function(q){ if (Math.abs(sy - q[1]) < 8) near = Math.max(near, sd * q[0] + 6); });
      if (Math.abs(sy - start.y) < start.r + 6) near = Math.max(near, sd * start.x + start.r + 4);
      if (sy < 4 && sy > -18) near = Math.max(near, 14);
      if (gy && Math.abs(sy - gy) < 6) near = Math.max(near, PW + 10);
      SEA[sj] = Math.min(HWs - 8 + vn(sy * 0.08, 3, seed) * 4, near + vn(sy * 0.15, 9, seed) * 1.5); } }
  function seaEdge(y){ if (!SEA) return 1e9; var f = Math.max(0, Math.min(SEA.length - 1.001, y - SEA_Y0)), i = f | 0, u = f - i; return SEA[i] * (1 - u) + SEA[i + 1] * u; }
  function seaAt(x, y){ if (!P.sea) return false; return P.sea.side * x > seaEdge(y || 0); }
  P.seaEdge = seaEdge;
  P.poolAt = poolAt; P.seaAt = seaAt;

  // ---- what stands where. Every tall thing is kept from standing in front of the path, so the golfer is
  // never behind a tree on the way (off the path he can be, and the picture puts him behind it)
  var used = [];
  function free(x, y, r){ for (var i = 0; i < used.length; i++){ var u = used[i]; if (Math.hypot(u.x - x, u.y - y) < u.r + r) return false; } return true; }
  function okGround(x, y, r){ if (x < b[0] + 2 || x > b[2] - 2 || y < b[1] + 2 || y > b[3] - 2) return false; if (poolAt(x, y) || seaAt(x, y)) return false;
    for (var a = 0; a < 6; a++){ var ax = x + Math.cos(a) * r, ay = y + Math.sin(a) * r; if (poolAt(ax, ay) || seaAt(ax, ay)) return false; } return true; }
  function screensPath(x, y, r, H){   // would a thing r wide and H tall at (x, y) hide much of the path from the camera?
    var reach = H * CE / SE * 0.6 + 1;
    for (var i = 0; i < path.length; i++){ var p = path[i]; if (p[1] < y - reach || p[1] > y + 0.5) continue; if (Math.abs(p[0] - x) < r * 0.7 + PW) return true; }
    for (i = 0; i < spur.length; i++){ p = spur[i]; if (p[1] < y - reach || p[1] > y + 0.5) continue; if (Math.abs(p[0] - x) < r + PW + 1.2) return true; }
    if (y > clr.y && y - reach < clr.y + clr.r && Math.abs(x - clr.x) < clr.r + r) return true;
    return false; }
  function place(kind, x, y, r, h, o){ var t = { k:kind, x:x, y:y, r:r, h:h, th:themeAt(y) }; if (o) for (var q in o) t[q] = o[q]; P.things.push(t); used.push({ x:x, y:y, r:r }); return t; }
  P.place = place;

  // the end: an arch over the path at y = 0, and the hole's carpet beyond it
  place('arch', cx(0), 0, 0.1, 9);
  used.push({ x:cx(0), y:-8, r:9 });
  // the boundary wall where one world meets the next, a door on the path (its leaves are drawn by run())
  if (gy){ P.gate = { x:cx(gy), y:gy }; place('wall', 0, gy, 0.1, 7, { gx:cx(gy) }); }
  // the clearing off the spur: a chest, and a fence round it on a locked trail
  P.chest = { x:clr.x, y:clr.y - 1.2 }; used.push({ x:clr.x, y:clr.y, r:clr.r + 1 });
  if (locked){
    var gA = spurOn ? Math.atan2(spur[spur.length - 3][1] - clr.y, spur[spur.length - 3][0] - clr.x) : Math.atan2(ys - clr.y, sx0 - clr.x), fr = clr.r + 0.6;
    P.fence = { x:clr.x, y:clr.y, r:fr, a:gA, half:0.32 };   // the gap is the gate, half an arc of 0.32 rad either side
    P.lockGate = { x:clr.x + Math.cos(gA) * fr, y:clr.y + Math.sin(gA) * fr, a:gA };
    place('fence', clr.x, clr.y, 0.1, 2.6);
  }
  // landmarks: one or two of the world's, beside the path in open ground
  var lms = kitOf(th).lm, nlm = 2 + (R() < 0.4 ? 1 : 0);
  for (var li = 0; li < nlm; li++){ var kind = lms[(seed + li) % lms.length];
    for (var tries = 0; tries < 40; tries++){ var ly = 18 + R() * (L - 30), sideL = R() < 0.5 ? -1 : 1, lx = cx(ly) + sideL * (8 + R() * 16), sz = LMSIZE[kind] || [5, 5, 8];
      var rr = Math.max(sz[0], sz[1]) / 2 + 0.5; if (walkD(lx, ly) < rr + 2 || inClear(lx, ly, rr + 2) || !okGround(lx, ly, rr) || !free(lx, ly, rr + 1) || (gy && Math.abs(ly - gy) < rr + 3)) continue;
      if (screensPath(lx, ly, rr, sz[2])) continue;
      place(kind, lx, ly, rr, sz[2], { w:sz[0], d:sz[1], th:themeAt(ly) }); break; } }
  // trees and the low things, denser near the path and thinning out
  for (var gy2 = b[1] + 1; gy2 < b[3] - 1; gy2 += 3.2) for (var gx2 = b[0] + 1; gx2 < b[2] - 1; gx2 += 3.2){
    var jx = gx2 + (hash(gx2 * 7 | 0, gy2 * 7 | 0, seed + 41) - 0.5) * 2.8, jy = gy2 + (hash(gy2 * 5 | 0, gx2 * 3 | 0, seed + 43) - 0.5) * 2.8, wd = walkD(jx, jy);
    if (wd < PW + 1.2 || inClear(jx, jy, 1.2) || (gy && Math.abs(jy - gy) < 2.5)) continue;
    var kx2 = kitOf(themeAt(jy)), roll = hash(jx * 13 | 0, jy * 13 | 0, seed + 47), dens = (wd < 14 ? 0.5 : wd < 26 ? 0.4 : 0.3) * (kx2.dens || 1);
    if (roll < dens){ var tk = kx2.tree[(hash(jx | 0, jy | 0, seed + 3) * kx2.tree.length) | 0], H = TREEH[tk][0] + hash(jx * 3 | 0, jy * 3 | 0, seed) * TREEH[tk][1], tr = TREEH[tk][2];
      if (wd > tr + PW + 0.8 && okGround(jx, jy, tr * 0.6) && free(jx, jy, tr * 0.7) && !screensPath(jx, jy, tr, H)){ place(tk, jx, jy, tr * 0.45, H, { cr:tr }); continue; } }
    if (roll < dens + 0.12){ var lk = kx2.low[(hash(jx * 3 | 0, jy * 5 | 0, seed + 9) * kx2.low.length) | 0], lr = LOWR[lk] || 0.8, lh = (LOWH[lk] || 1.4);
      if (okGround(jx, jy, lr) && free(jx, jy, lr + 0.3) && !screensPath(jx, jy, lr, lh)) place(lk, jx, jy, lr, lh); }
  }
  // lamps along the path in the worlds that have them
  if (kitOf(th).lm.indexOf('lamps') >= 0 || th === 'neon') for (var ly2 = 14; ly2 < L - 6; ly2 += 22){ var sd2 = (ly2 / 22 | 0) % 2 ? 1 : -1, lx2 = cx(ly2) + sd2 * (PW + 1.3);
    if (free(lx2, ly2, 0.4) && okGround(lx2, ly2, 0.4) && !inClear(lx2, ly2, 1)) place('lamp', lx2, ly2, 0.3, 7); }

  // ---- what can be picked up and walked into
  var items = P.items, id = 0;
  function item(kind, x, y, o){ var t = { k:kind, x:x, y:y, id:kind + (id++) }; if (o) for (var q2 in o) t[q2] = o[q2]; items.push(t); return t; }
  function okSpot(x, y, r, minD, maxD){ var wd = walkD(x, y); return okGround(x, y, r) && free(x, y, r) && !inClear(x, y, 1.5) && wd >= minD && (maxD == null || wd <= maxD) && !(gy && Math.abs(y - gy) < 6) && y > 6 && y < L - 4; }
  function spotOff(minD, maxD, r, tries){ for (var t = 0; t < (tries || 80); t++){ var yy = L * (0.08 + R() * 0.84), xx = cx(yy) + (R() < 0.5 ? -1 : 1) * (minD + R() * (maxD - minD));
      if (okSpot(xx, yy, r, minD - 1, maxD + 2)) return [xx, yy]; } return null; }
  /* NO COINS LIE LOOSE ON A TRAIL. They are in chests hidden off the path: tucked in behind a tree or a rock
     where the camera cannot see them from the path, and one in the clearing. Walk up to a chest and it opens,
     and its coins burst out onto the ground round it for you to walk over. Where each coin lands is fixed by
     the plan, so a coin left on the ground is still lying there next time. */
  function drops(x, y, n){ var out = [], a0 = R() * 6.283;
    for (var i = 0, t = 0; out.length < n && t < n * 8; t++, i++){ var a = a0 + i * 2.39996, r = 2.1 + (i % 4) * 0.55 + R() * 0.5, dx = x + Math.cos(a) * r, dy = y + Math.sin(a) * r * 0.8;
      if (okGround(dx, dy, 0.3) && !hitThing(dx, dy) && !(gy && Math.abs(dy - gy) < 1.5) && dy > -0.5 && dy < L + 10) out.push([dx, dy]); }
    return out; }
  function hitThing(x, y){ for (var i = 0; i < P.things.length; i++){ var t = P.things[i], r = BLOCKR[t.k] != null ? BLOCKR[t.k] : t.r; if (t.k === 'arch' || t.k === 'wall' || t.k === 'fence') continue;
      if (t.w){ if (Math.abs(x - t.x) < t.w / 2 + 0.8 && Math.abs(y - t.y) < t.d / 2 + 0.8) return true; } else if (r > 0 && Math.hypot(x - t.x, y - t.y) < r + 0.8) return true; } return false; }
  function chest(x, y, n, o){ var t = item('chest', x, y, o); t.n = n; t.drops = drops(x, y, n); return t; }
  function hideSpot(minD, maxD){   // just behind a tree or a rock, as seen from the path: north of it, and off the path
    var cand = P.things.filter(function(t){ var w = walkD(t.x, t.y); return (TREEH[t.k] || LOWR[t.k]) && w > minD - 2 && w < maxD && !inClear(t.x, t.y, 3) && !(gy && Math.abs(t.y - gy) < 8) && t.y > 8 && t.y < L - 4; });
    for (var tr = 0; tr < 40 && cand.length; tr++){ var t = cand[(R() * cand.length) | 0], hx = t.x + (R() - 0.5) * 1.6, hy = t.y - (t.r || 1) - 1.6 - R() * 1.2;
      if (okSpot(hx, hy, 1.4, minD, maxD + 4)) return [hx, hy]; }
    return spotOff(minD, maxD, 1.4, 80); }
  var nch = 3 + (R() < 0.5 ? 1 : 0);
  for (var ci = 0; ci < nch; ci++){ var hsp = hideSpot(7 + ci * 2, 24); if (hsp){ chest(hsp[0], hsp[1], 5 + ((R() * 5) | 0)); used.push({ x:hsp[0], y:hsp[1], r:4 }); } }
  // the clearing
  if (clrKind === 'chest') chest(P.chest.x, P.chest.y, locked ? 16 : 10 + ((R() * 4) | 0), { main:1 });
  else { for (var cp2 = 0; cp2 < 4; cp2++){ var xp = clr.x + (cp2 % 2 ? 1 : -1) * 1.3, yp = clr.y + (cp2 < 2 ? -0.9 : 0.9); item('brk', xp, yp, { th:themeAt(yp) }); } }
  if (locked){ for (var tk2 = 0; tk2 < 60; tk2++){ var ky = L * (0.15 + R() * 0.7), kxp = cx(ky) - sg * (8 + R() * 10);
      if (okGround(kxp, ky, 1) && free(kxp, ky, 1) && walkD(kxp, ky) > PW + 3 && !inClear(kxp, ky, 2) && !(gy && Math.abs(ky - gy) < 6)){ item('key', kxp, ky); used.push({ x:kxp, y:ky, r:1 }); break; } } }
  // the golden ball: off the path, tucked behind a landmark or a tree if it can be
  var gs = spotOff(10, 26, 1.1, 90) || spotOff(6, 20, 1, 60); if (gs){ item('golden', gs[0], gs[1]); used.push({ x:gs[0], y:gs[1], r:1 }); }
  /* THE RARE THINGS, handed in by putt.js (spec.loot): a world's trinket, a part for one of the Putt Putt
     putters, and once in a while a spare life. They go further off the path than anything else, and a
     trinket goes in the hidden clearing when there is one, so they have to be looked for. */
  var LT = spec.loot || {};
  function rare(kind, o, far){ var sp = (kind === 'trinket' && !spurOn && clrKind !== 'chest') ? [clr.x, clr.y + 0.6] : (spotOff(far, 28, 1.1, 120) || spotOff(8, 24, 1, 80));
    if (sp){ item(kind, sp[0], sp[1], o); used.push({ x:sp[0], y:sp[1], r:1 }); } }
  if (LT.trinket) rare('trinket', { name:LT.trinket.name, col:LT.trinket.col }, 14);
  if (LT.part) rare('part', { name:LT.part.name }, 12);
  if (LT.life) rare('life', null, 16);
  // breakables beside the path and in the grass, in ones, twos and threes
  var nb = 2 + ((R() * 3) | 0); for (var bi = 0; bi < nb; bi++){ var by = L * (0.12 + R() * 0.76), bsd = R() < 0.5 ? -1 : 1, off = R() < 0.6 ? PW + 1.4 : 5 + R() * 9, nn = 1 + ((R() * 3) | 0);
    for (var bj = 0; bj < nn; bj++){ var bx = cx(by) + bsd * (off + bj * 1.6), byy = by + (R() - 0.5) * 2;
      if (okGround(bx, byy, 0.9) && free(bx, byy, 0.9) && !inClear(bx, byy, 1) && !(gy && Math.abs(byy - gy) < 5)){ item('brk', bx, byy, { th:themeAt(byy) }); used.push({ x:bx, y:byy, r:0.8 }); } } }
  // the world's greeter, on the first trail of a world: a little way up the path from where you start, or just past the
  // world door, so the first thing that happens in a new world is somebody walking up to say hello
  if (spec.greet){ var hy0 = gy ? gy - 7 : Math.min(P.start.y - 9, L - 10);
    for (var hn = 0; hn < 40 && !P.host; hn++){ var hy = hy0 - (hn >> 1) * 1.2, hsd = (hn & 1) ? -1 : 1, hx = cx(hy) + hsd * (PW + 1.4);
      if (okGround(hx, hy, 1) && free(hx, hy, 1)){ P.host = item('host', hx, hy, { th:themeAt(hy) }); used.push({ x:hx, y:hy, r:1 }); } } }
  // the local, beside the path a little before the arch (a greeter's trail has the greeter instead)
  for (var tn = 0; tn < (spec.greet ? 0 : 30); tn++){ var ny = L * (0.14 + R() * 0.7), nx = cx(ny) + (R() < 0.5 ? -1 : 1) * (PW + 1.6);
    if (free(nx, ny, 1) && okGround(nx, ny, 1)){ item('npc', nx, ny, { th:themeAt(ny) }); used.push({ x:nx, y:ny, r:1 }); break; } }

  // ---- what blocks the golfer: trunks, rocks, buildings, the fence and the wall
  P.things.forEach(function(t){ if (t.k === 'arch' || t.k === 'fence' || t.k === 'wall') return; var r = BLOCKR[t.k] != null ? BLOCKR[t.k] : t.r; if (r > 0) P.cols.push({ x:t.x, y:t.y, r:r, w:t.w, d:t.d }); });
  /* SHADOWS ON THE GROUND. The light comes from the upper left, the same as the golfer's, so everything tall
     throws a soft shadow down and to the right. It is what sets a tree on the ground rather than over it. */
  var SH = []; P.things.forEach(function(t){ var H = t.h || 1; if (H < 1.6 && !t.w) return; var rx, ry, cx2, cy2;
    if (t.w){ rx = t.w / 2 + H * 0.18; ry = t.d / 2 + H * 0.12; cx2 = t.x + H * 0.22; cy2 = t.y + H * 0.16; }
    else { var cr = t.cr || t.r * 1.4; rx = cr * 1.05 + 0.4; ry = cr * 0.75 + 0.3; cx2 = t.x + H * 0.2; cy2 = t.y + H * 0.14; }
    if (t.k === 'arch' || t.k === 'wall' || t.k === 'fence' || t.k === 'green') return; SH.push({ x:cx2, y:cy2, rx:rx, ry:ry }); });
  var SG = {}; SH.forEach(function(o){ for (var x = o.x - o.rx; x <= o.x + o.rx + 6; x += 6) for (var y = o.y - o.ry; y <= o.y + o.ry + 6; y += 6){ var k = (Math.floor(x / 6)) + ',' + (Math.floor(y / 6)); (SG[k] = SG[k] || []).push(o); } });
  P.shadeAt = function(x, y){ var cs = SG[Math.floor(x / 6) + ',' + Math.floor(y / 6)]; if (!cs) return 0; var v = 0;
    for (var i = 0; i < cs.length; i++){ var o = cs[i], u = (x - o.x) / o.rx, w = (y - o.y) / o.ry, d = u * u + w * w; if (d < 1) v = Math.max(v, d < 0.7 ? 1 : 0.5); } return v; };
  return P;
}
// a tree's height, how much it can vary, and its crown's radius (ft, at the trail's scale)
var TREEH = { broad:[13, 5, 4.2], pine:[14, 6, 3.4], palm:[12, 4, 3.6], cactus:[5, 3, 1.6], dead:[10, 4, 3.4], basalt:[6, 5, 1.6], puff:[9, 4, 3.6], pylon:[10, 4, 1.4], cab:[5.2, 0.4, 1.6], corn:[5, 1, 1.2] };
var LOWR = { bush:1.1, bushf:1.1, rock:1.1, fern:1, shell:0.5, bushdry:0.9, rockdark:1, ember:0.6, rocksnow:1.2, bushsnow:1.1, puffsmall:1.2, rainbowrock:0.9, cube:0.8, cone:0.6, tomb:0.9, pumpkin:0.8, hay:1.1 };
var LOWH = { bush:1.8, bushf:1.8, rock:1.4, fern:1.6, shell:0.4, bushdry:1.2, rockdark:1.4, ember:0.8, rocksnow:1.6, bushsnow:1.8, puffsmall:1.6, rainbowrock:1.3, cube:1.4, cone:1.2, tomb:2.2, pumpkin:1.2, hay:1.6 };
// what part of a thing stops the golfer (a tree stops him at its trunk, not its crown)
var BLOCKR = { broad:0.6, pine:0.7, palm:0.5, cactus:0.7, dead:0.6, basalt:1.2, puff:0.8, pylon:0.8, cab:1.1, corn:0.5, lamp:0.3, shell:0, ember:0, bushf:0.9 };
// landmark footprints: width, depth, height
var LMSIZE = { shed:[9, 6, 11], green:[9, 7, 1], bench:[3, 1.2, 2], lamps:[1, 1, 7], ruin:[10, 3, 9], statue:[3, 3, 8], columns:[8, 5, 9], wreck:[12, 5, 7], boat:[6, 3, 3], barrels:[4, 3, 2.4],
  mesa:[11, 8, 13], tower:[5, 5, 15], cart:[5, 2.5, 3.5], basaltset:[7, 6, 9], vent:[5, 5, 4], skull:[5, 4, 5], igloo:[7, 7, 5], snowman:[3, 3, 5.5], cabin:[9, 6, 11],
  balloon:[6, 6, 16], kite:[3, 3, 12], pillar:[5, 5, 12], cabinets:[8, 2.5, 6.5], sign:[8, 1.5, 11], pylons:[6, 6, 12], crypt:[8, 6, 10], graves:[9, 6, 3], fenceyard:[9, 6, 3],
  barn:[11, 8, 13], scarecrow:[3, 2, 7], cornfield:[10, 8, 5] };

/* ------------------------------------------------------------------------------- the ground */
function land(P){
  var b = P.b, seed = P.seed, L = P.L, cx = P.cx, sp = P.spec;
  function kAt(y){ return kitOf(P.themeAt(y)); }
  return {
    gain:1.4,
    bg:kitOf(sp.theme).g[0],
    h:function(x, y){ var wd = P.walkD(x, y), z = (fbm(x * 0.045, y * 0.045, seed) - 0.45) * 2.4 * sm(PW + 0.5, PW + 7, wd);
      if (P.inClear(x, y)) z *= 0.3; var o = P.poolAt(x, y); if (o) z = o.k === 'lava' ? -0.45 : o.k === 'water' ? -0.55 : o.k === 'ice' ? -0.05 : -0.12;
      if (P.seaAt(x, y)) z = -0.7; if (wd < PW) z -= 0.06; return z; },
    mat:function(x, y){ var o = P.poolAt(x, y); if (o) return [o.k === 'slow' ? 'bog' : o.k]; if (P.seaAt(x, y)) return ['water'];
      var wd = P.walkD(x, y), sh = P.shadeAt(x, y), ex = sh ? { sh:sh } : null;
      if (y < -1.5 && y > -16 && Math.abs(x - cx(0)) < 7.5) return [Math.abs(x - cx(0)) > 6.6 || y < -15.2 || y > -2.3 ? 'rail' : 'carpet'];
      var dc = Math.hypot(x - P.clr.x, y - P.clr.y) - P.clr.r, ds = Math.hypot(x - P.start.x, y - P.start.y) - (P.start.r - 1), dIn = Math.min(wd - PW, dc, ds);
      if (dIn < 0){ if (dIn > -0.35){ ex = ex || {}; ex.edge = 1; } return [P.themeAt(y) === sp.theme ? 'path' : 'path0', ex]; }
      if (P.sea && P.sea.side * x > P.seaEdge(y) - 3.5) return ['sand', ex];
      if (dIn < 0.3){ ex = ex || {}; ex.edge = 1; }
      var fb = vn(x * 0.22, y * 0.22, seed + 77); if (fb > 0.74 && dIn > 1.2){ ex = ex || {}; ex.fl = Math.min(0.55, (fb - 0.74) * 4); }
      return [P.themeAt(y) === sp.theme ? 'g' : 'g0', ex]; },
    build:function(B){ P.things.forEach(function(t, i){ try{ (BUILD[t.k] || BUILD.rock)(B, t, i, P); }catch(e){} }); },
    mats:mats(P)
  };
}
function mats(P){
  var k = kitOf(P.spec.theme), k0 = kitOf(P.themeAt(P.L)), T = P.spec.T || {};
  // the ground darkens where something throws its shadow on it (c.sh), and grass grows flowers in beds
  function shd(col, f){ var n = parseInt(col.slice(1), 16), r = n >> 16, g2 = n >> 8 & 255, b2 = n & 255; f = 1 - f; return '#' + ((1 << 24) + (Math.round(r * f * 0.92) << 16) + (Math.round(g2 * f) << 8) + Math.round(b2 * Math.min(1, f * 1.08))).toString(16).slice(1); }
  var FL = ['#f7e36b', '#ffffff', '#f48fb1', '#b39ddb'];
  function gfn(kk){ return function(c, R, h3){ var n1 = h3(c.ti >> 1, c.tj >> 1, 11), n2 = h3(c.ti, c.tj, 12), g = kk.g, col;
    if (kk.grid && ((c.ti % 32) === 0 || (c.tj % 24) === 0)) col = '#3a2a8a';
    else if (c.fl && !kk.grid && h3(c.ti >> 1, c.tj >> 1, 21) < c.fl){ var fq = h3(c.ti >> 1, c.tj >> 1, 22); col = kk.snow ? '#ffffff' : ((c.ti & 1) + (c.tj & 1) === 1 || fq < 0.3) ? FL[(fq * 4 * FL.length | 0) % FL.length] : shd(g[0], 0.2); }   // a bed of flowers, each a petal or two on a dark stem
    else if (n2 < 0.012) col = kk.snow ? '#ffffff' : g[1];
    else if (kk.mow) col = (Math.floor(c.tj / 14) % 2) ? (n2 < 0.3 ? g[1] : g[0]) : (n2 < 0.3 ? g[0] : g[2]);
    else col = n1 < g[3] ? (n2 < 0.5 ? g[1] : g[2]) : g[0];
    if (c.edge) col = shd(col, 0.12);
    return R(c.sh ? shd(col, 0.22 * c.sh) : col); }; }
  function pfn(kk){ return function(c, R, h3){ var p = kk.p, n = h3(c.ti, c.tj, 5), col;
    if (kk.paved){ var sx = c.ti % 10, sy = (c.tj + (Math.floor(c.ti / 10) % 2) * 5) % 10; col = (sx === 0 || sy === 0) ? p[2] : n < 0.2 ? p[1] : p[0]; }
    else if (kk.plank){ col = c.tj % 6 === 0 ? p[2] : n < 0.25 ? p[1] : p[0]; }
    else col = n < 0.18 ? p[1] : n < 0.3 ? p[2] : p[0];
    if (c.edge) col = shd(col, 0.14);
    return R(c.sh ? shd(col, 0.22 * c.sh) : col); }; }
  var hz = k.hazC || ['#3f86c8', '#6fb3e6'];
  function lfn(cols, rip){ return function(c, R, h3){ var n = h3(c.ti, c.tj, 7); return R(((c.ti * 3 + c.tj * 5) % rip) < 2 ? cols[1] : cols[0]); }; }
  return {
    g:['', '', '', 0, gfn(k)], g0:['', '', '', 0, gfn(k0)], path:['', '', '', 0, pfn(k)], path0:['', '', '', 0, pfn(k0)],
    water:['', '', '', 0, lfn((P.sea ? ['#1f8fc8', '#5cc6ee'] : ['#3f86c8', '#6fb3e6']), 13)],
    lava:['', '', '', 0, lfn(['#ff6a1a', '#ffc23a'], 9)], ice:['', '', '', 0, lfn(['#a8dcf4', '#e2f6ff'], 23)], bog:['', '', '', 0, lfn(['#5d4634', '#7a6044'], 17)],
    sand:['#ecdba4', '#f4e4b4', '#dcc88c', 0.2],
    carpet:[T.carpet || '#2f8f4e', T.carpet2 || '#2a8246', T.carpet || '#2f8f4e', 0.16], rail:[T.wall || '#f4efe2', T.wallHi || '#ffffff', T.wall || '#f4efe2', 0.1]
  };
}

/* ------------------------------------------------------------------------- building the things */
var BUILD = {};
function pick(i, arr){ return arr[i % arr.length]; }
function crownCol(cols, k){ return function(px, py, pz){ var n = hash(Math.floor(px * 2), Math.floor(pz * 2) * 7 + Math.floor(py * 2), k + 3); return n < 0.16 ? cols[1] : n < 0.3 ? cols[2] : cols[0]; }; }
BUILD.broad = function(B, t, i){ var kx = kitOf(t.th), x = t.x, y = t.y, zb = B.gz(x, y), H = t.h, R = t.cr, cz = zb + H * 0.64, lv = kx.leaves;
  B.vox(x - R * 1.5, y - R * 1.4, zb - 0.2, x + R * 1.5, y + R * 1.4, zb + H + 0.6, function(set){
    B.tube(set, x, y, zb, x, y, cz, 0.55, 0.32, kx.bark);
    for (var a = 0; a < 3; a++){ var an = a * 2.1 + hash(i, a, 3), rr = R * 0.45; B.tube(set, x, y, zb + H * 0.4, x + Math.cos(an) * rr, y + Math.sin(an) * rr * 0.6, cz + 0.4, 0.22, 0.14, kx.bark); }
    for (var q = 0; q < 4; q++){ var a2 = hash(i, q, 5) * 6.28, r2 = R * (0.35 + hash(q, i, 6) * 0.35);
      B.blob(set, x + Math.cos(a2) * r2, y + Math.sin(a2) * r2 * 0.7, cz + (hash(q, i, 8) - 0.2) * R * 0.6, R * 0.72, R * 0.65, R * 0.62, crownCol(lv, q)); }
    B.blob(set, x, y, cz + R * 0.42, R * 0.85, R * 0.75, R * 0.7, crownCol(lv, 2));
  }, 0.25); };
BUILD.pine = function(B, t, i){ var kx = kitOf(t.th), x = t.x, y = t.y, zb = B.gz(x, y), H = t.h, R0 = t.cr, snow = !!kx.snow, lv = kx.leaves;
  B.solid(x - R0, y - R0, zb, x + R0, y + R0, zb + H, function(px, py, pz){ var rr = Math.hypot(px - x, py - y), h = (pz - zb) / H;
    if (h < 0.12) return rr < 0.45 ? kx.bark : null; var tier = (h - 0.12) / 0.88 * 4, f = tier - Math.floor(tier), rad = R0 * (1 - (h - 0.12) / 0.88) * (0.62 + 0.48 * (1 - f)); if (rr > rad) return null;
    if (snow && (f > 0.6 && rr > rad - 0.5 || h > 0.94)) return '#f6f9fd'; return ((Math.floor(pz * 2.4) + Math.floor(px * 2.4)) % 3) ? lv[0] : lv[1]; }, 0.25); };
BUILD.palm = function(B, t, i){ var kx = kitOf(t.th), x = t.x, y = t.y, zb = B.gz(x, y), H = t.h, lean = (hash(i, 1, 2) - 0.5) * 2.4, tx = x + lean, R = t.cr;
  B.vox(x - R - 2, y - R - 1, zb - 0.1, x + R + 2, y + R + 1, zb + H + 1.5, function(set){
    for (var s = 0; s < 8; s++){ var u0 = s / 8, u1 = (s + 1) / 8; B.tube(set, x + lean * u0 * u0, y, zb + H * u0, x + lean * u1 * u1, y, zb + H * u1, 0.42 - u0 * 0.12, 0.42 - u1 * 0.12, s % 2 ? kx.bark : '#a8865a'); }
    for (var f = 0; f < 7; f++){ var a = f / 7 * 6.28 + hash(i, f, 4), ex = tx + Math.cos(a) * R, ey = y + Math.sin(a) * R * 0.7, mx = tx + Math.cos(a) * R * 0.5, my = y + Math.sin(a) * R * 0.35;
      B.tube(set, tx, y, zb + H, mx, my, zb + H + 0.8, 0.32, 0.26, kx.leaves[f % 2]); B.tube(set, mx, my, zb + H + 0.8, ex, ey, zb + H - 1.2, 0.26, 0.12, kx.leaves[(f + 1) % 3]); }
    B.blob(set, tx, y + 0.2, zb + H - 0.3, 0.5, 0.5, 0.45, '#6a4a2a');
  }, 0.25); };
BUILD.cactus = function(B, t, i){ var x = t.x, y = t.y, zb = B.gz(x, y), H = t.h, c = ['#4f8a3e', '#62a04c'];
  B.vox(x - 2, y - 1, zb - 0.1, x + 2, y + 1, zb + H + 0.5, function(set){ B.tube(set, x, y, zb, x, y, zb + H, 0.55, 0.5, function(u){ return (u * 10 | 0) % 2 ? c[0] : c[1]; });
    var s = hash(i, 2, 3) < 0.5 ? 1 : -1; B.tube(set, x, y, zb + H * 0.4, x + s * 1.2, y, zb + H * 0.45, 0.35, 0.35, c[0]); B.tube(set, x + s * 1.2, y, zb + H * 0.45, x + s * 1.2, y, zb + H * 0.75, 0.35, 0.3, c[1]);
    if (H > 6){ B.tube(set, x, y, zb + H * 0.55, x - s * 1, y, zb + H * 0.58, 0.3, 0.3, c[0]); B.tube(set, x - s * 1, y, zb + H * 0.58, x - s * 1, y, zb + H * 0.8, 0.3, 0.26, c[1]); }
    B.blob(set, x, y, zb + H, 0.3, 0.3, 0.25, '#f06292'); }, 0.25); };
BUILD.dead = function(B, t, i){ var x = t.x, y = t.y, zb = B.gz(x, y), H = t.h, kx = kitOf(t.th);
  B.vox(x - 5, y - 3.5, zb - 0.1, x + 5, y + 3.5, zb + H + 1, function(set){ var tx = x + (hash(i, 1, 3) - 0.5) * 0.8;
    B.tube(set, x, y, zb, tx, y, zb + H * 0.62, 0.62, 0.36, kx.bark);
    for (var j = 0; j < 5; j++){ var a = hash(i, j, 9) * 6.28, s0 = 0.4 + hash(j, i, 4) * 0.5, bx = x + (tx - x) * s0, bz = zb + H * 0.62 * s0 + 0.3, len = 2 + hash(j, i, 6) * 2.4;
      var ex = bx + Math.cos(a) * len, ey = y + Math.sin(a) * len * 0.6, ez = bz + len * 0.75; B.tube(set, bx, y, bz, ex, ey, ez, 0.24, 0.14, kx.bark); B.tube(set, ex, ey, ez, ex + Math.cos(a + 0.8) * 0.9, ey + Math.sin(a + 0.8) * 0.5, ez + 0.8, 0.14, 0.08, kx.bark); }
    B.tube(set, tx, y, zb + H * 0.62, tx + (hash(i, 7, 1) - 0.5), y, zb + H, 0.26, 0.1, kx.bark); }, 0.25); };
BUILD.basalt = function(B, t, i){ var x = t.x, y = t.y, zb = B.gz(x, y), H = t.h, n = 3 + (hash(i, 1, 1) * 3 | 0);
  B.solid(x - 2, y - 2, zb - 0.2, x + 2, y + 2, zb + H, function(px, py, pz){ for (var k = 0; k < n; k++){ var a = k / n * 6.28 + i, cx = x + Math.cos(a) * 0.9 * (k ? 1 : 0), cy = y + Math.sin(a) * 0.7 * (k ? 1 : 0), hh = H * (k ? 0.55 + hash(i, k, 2) * 0.4 : 1);
      var dx = Math.abs(px - cx), dy = Math.abs(py - cy); if (dx + dy * 0.6 < 0.7 && Math.max(dx, dy) < 0.62 && pz - zb < hh) return pz - zb > hh - 0.3 ? '#5a4e54' : ((pz * 2 | 0) % 3 ? '#2e282c' : '#3a3236'); } return null; }, 0.25); };
BUILD.puff = function(B, t, i){ var x = t.x, y = t.y, zb = B.gz(x, y), H = t.h, R = t.cr;
  B.vox(x - R * 1.4, y - R * 1.2, zb - 0.1, x + R * 1.4, y + R * 1.2, zb + H + 0.5, function(set){ B.tube(set, x, y, zb, x, y, zb + H * 0.6, 0.35, 0.25, '#c9a46a');
    for (var q = 0; q < 4; q++){ var a = hash(i, q, 2) * 6.28; B.blob(set, x + Math.cos(a) * R * 0.45, y + Math.sin(a) * R * 0.3, zb + H * 0.7 + hash(q, i, 3), R * 0.6, R * 0.55, R * 0.5, q % 2 ? '#ffffff' : '#f3e6ff'); }
    B.blob(set, x, y, zb + H * 0.78, R * 0.4, R * 0.35, R * 0.35, '#ffd1f0'); }, 0.25); };
BUILD.pylon = function(B, t, i){ var x = t.x, y = t.y, zb = B.gz(x, y), H = t.h, col = pick(i, ['#ff2bd6', '#2bf0ff', '#ffe02b', '#7cff4a']);
  B.solid(x - 0.9, y - 0.9, zb, x + 0.9, y + 0.9, zb + H, function(px, py, pz){ var r = Math.max(Math.abs(px - x), Math.abs(py - y)), t2 = pz - zb; if (r > 0.75 - t2 / H * 0.3) return null;
    return (Math.floor(t2 * 1.2) % 3 === 0) ? col : r > 0.55 - t2 / H * 0.3 ? '#2a2440' : '#1a1430'; }, 0.25); };
BUILD.cab = function(B, t, i){ cabinet(B, t.x, t.y, i); };
function cabinet(B, x, y, i){ var zb = B.gz(x, y), col = pick(i, ['#ff2bd6', '#2bf0ff', '#ffe02b', '#7cff4a']);
  B.solid(x - 1.2, y - 0.9, zb, x + 1.2, y + 0.9, zb + 5.4, function(px, py, pz){ var dx = px - x, dy = py - y, t2 = pz - zb;
    if (Math.abs(dx) > 1.1 || Math.abs(dy) > 0.8) return null; if (t2 > 2.4 && t2 < 3.9 && dy > 0.1 + (t2 - 2.4) * 0.25) return null;
    if (dy > 0.6 && t2 > 2.6 && t2 < 3.6 && Math.abs(dx) < 0.8) return (Math.floor(t2 * 6 + px * 3) % 3) ? '#2bf0ff' : '#0b2a4a';
    if (t2 > 4.6) return col; if (Math.abs(Math.abs(dx) - 1.05) < 0.1) return col; return '#1a1430'; }, 0.25); }
BUILD.corn = function(B, t, i){ var x = t.x, y = t.y, zb = B.gz(x, y), H = t.h;
  B.vox(x - 1.5, y - 1.5, zb - 0.1, x + 1.5, y + 1.5, zb + H + 0.5, function(set){ for (var k = 0; k < 3; k++){ var ox = (k - 1) * 0.7, oy = (hash(i, k, 1) - 0.5) * 0.6;
    B.tube(set, x + ox, y + oy, zb, x + ox, y + oy, zb + H, 0.14, 0.1, '#7a8a2e'); for (var l = 1; l < 5; l++){ var a = hash(i, k * 7 + l, 3) * 6.28; B.tube(set, x + ox, y + oy, zb + H * l / 5, x + ox + Math.cos(a) * 0.9, y + oy + Math.sin(a) * 0.5, zb + H * l / 5 - 0.4, 0.1, 0.05, '#8a9a36'); }
    B.blob(set, x + ox + 0.15, y + oy, zb + H * 0.6, 0.18, 0.18, 0.4, '#f0c23a'); } }, 0.125); };
function bushAt(B, x, y, r, cols){ var zb = B.gz(x, y);
  B.solid(x - r - 0.1, y - r - 0.1, zb - 0.1, x + r + 0.1, y + r + 0.1, zb + r * 1.6, function(px, py, pz){ var d = Math.hypot((px - x) / r, (py - y) / r, (pz - zb - r * 0.55) / (r * 0.95));
    return d < 1 ? cols[(Math.floor(px * 3) + Math.floor(pz * 3) + Math.floor(py * 3)) % cols.length] : null; }, 0.25); }
function rockAt(B, x, y, r, cols, i){ var zb = B.gz(x, y) - 0.1;
  B.solid(x - r, y - r, zb, x + r, y + r, zb + r * 1.2, function(px, py, pz){ var d = Math.hypot((px - x) / r, (py - y) / (r * 0.8), (pz - zb) / (r * 1.0)) + (hash(px * 4 | 0, pz * 4 | 0, 5 + i) - 0.5) * 0.18;
    return d < 1 ? (pz - zb > r * 0.9 && cols[2] ? cols[2] : hash(px * 3 | 0, py * 3 | 0, 2) < 0.3 ? cols[1] : cols[0]) : null; }, 0.25); }
BUILD.bush = function(B, t, i){ var kx = kitOf(t.th); bushAt(B, t.x, t.y, 1.1, [kx.leaves[0], kx.leaves[1], kx.leaves[2] || kx.leaves[0]]); };
BUILD.bushf = function(B, t, i){ var kx = kitOf(t.th); bushAt(B, t.x, t.y, 1.0, [kx.leaves[0], '#ffffff', kx.leaves[1], '#e53935']); };
BUILD.fern = function(B, t, i){ var x = t.x, y = t.y, zb = B.gz(x, y); B.vox(x - 1.4, y - 1.2, zb - 0.1, x + 1.4, y + 1.2, zb + 1.8, function(set){
  for (var f = 0; f < 7; f++){ var a = f / 7 * 6.28 + i; B.tube(set, x, y, zb, x + Math.cos(a) * 1.2, y + Math.sin(a) * 0.9, zb + 1.2 + hash(i, f, 2) * 0.4, 0.16, 0.06, f % 2 ? '#2b6e30' : '#3f8a3a'); } }, 0.125); };
BUILD.rock = function(B, t, i){ rockAt(B, t.x, t.y, 1.1, ['#8a8a86', '#6e6e6a', '#a4a49c'], i); };
BUILD.rockdark = function(B, t, i){ rockAt(B, t.x, t.y, 1, ['#3e383c', '#2a2428', '#5a5054'], i); };
BUILD.rocksnow = function(B, t, i){ rockAt(B, t.x, t.y, 1.2, ['#7a8494', '#5e6878', '#ffffff'], i); };
BUILD.bushsnow = function(B, t, i){ bushAt(B, t.x, t.y, 1.1, ['#1f4f3e', '#ffffff', '#2a6450']); };
BUILD.bushdry = function(B, t, i){ bushAt(B, t.x, t.y, 0.9, ['#8a7a3e', '#a4924a', '#6e5e2e']); };
BUILD.shell = function(B, t, i){ var x = t.x, y = t.y, zb = B.gz(x, y); B.solid(x - 0.5, y - 0.4, zb - 0.05, x + 0.5, y + 0.4, zb + 0.4, function(px, py, pz){ var d = Math.hypot((px - x) / 0.45, (py - y) / 0.35, (pz - zb) / 0.35); return d < 1 ? ((Math.floor((px - x) * 8) % 2) ? '#f6c6b6' : '#ffe4d8') : null; }, 0.125); };
BUILD.ember = function(B, t, i){ var x = t.x, y = t.y, zb = B.gz(x, y); B.solid(x - 0.6, y - 0.5, zb - 0.1, x + 0.6, y + 0.5, zb + 0.7, function(px, py, pz){ var d = Math.hypot((px - x) / 0.55, (py - y) / 0.45, (pz - zb) / 0.6); return d < 1 ? (pz - zb > 0.4 ? '#ffb43a' : '#ff5a1a') : null; }, 0.125); };
BUILD.puffsmall = function(B, t, i){ bushAt(B, t.x, t.y, 1.2, ['#ffffff', '#f3e6ff', '#ffffff']); };
BUILD.rainbowrock = function(B, t, i){ rockAt(B, t.x, t.y, 0.9, [pick(i, ['#ff8ab8', '#8ad8ff', '#ffe28a', '#a8ff8a']), '#ffffff', '#ffffff'], i); };
BUILD.cube = function(B, t, i){ var x = t.x, y = t.y, zb = B.gz(x, y), col = pick(i, ['#ff2bd6', '#2bf0ff', '#ffe02b']);
  B.solid(x - 0.7, y - 0.7, zb, x + 0.7, y + 0.7, zb + 1.3, function(px, py, pz){ var e = Math.max(Math.abs(px - x), Math.abs(py - y)) > 0.55 || pz - zb > 1.15 || pz - zb < 0.15; return e ? col : '#1a1430'; }, 0.25); };
BUILD.cone = function(B, t, i){ var x = t.x, y = t.y, zb = B.gz(x, y); B.solid(x - 0.6, y - 0.6, zb, x + 0.6, y + 0.6, zb + 1.2, function(px, py, pz){ var tt = (pz - zb) / 1.2; if (Math.hypot(px - x, py - y) > 0.55 * (1 - tt)) return null; return (tt * 4 | 0) % 2 ? '#ffffff' : '#ff6a1a'; }, 0.125); };
BUILD.tomb = function(B, t, i){ var x = t.x, y = t.y, zb = B.gz(x, y);
  B.solid(x - 0.9, y - 0.4, zb - 0.1, x + 0.9, y + 0.4, zb + 2.2, function(px, py, pz){ var dx = px - x, tt = pz - zb; if (Math.abs(dx) > 0.8 || Math.abs(py - y) > 0.25) return null; if (tt > 1.5 && Math.hypot(dx, tt - 1.5) > 0.8) return null;
    if (Math.abs(dx) < 0.1 && tt > 0.9 && tt < 1.8) return '#4a4652'; if (Math.abs(tt - 1.45) < 0.08 && Math.abs(dx) < 0.4) return '#4a4652'; return (hash(px * 4 | 0, pz * 4 | 0, 3) < 0.2) ? '#6e6a76' : '#8a8694'; }, 0.125); };
BUILD.pumpkin = function(B, t, i){ var x = t.x, y = t.y, zb = B.gz(x, y);
  B.solid(x - 0.9, y - 0.8, zb - 0.1, x + 0.9, y + 0.8, zb + 1.3, function(px, py, pz){ if (Math.hypot(px - x, py - y) < 0.12 && pz - zb > 0.8) return '#3e5a1e';
    var d = Math.hypot((px - x) / 0.85, (py - y) / 0.7, (pz - zb - 0.45) / 0.5); if (d > 1) return null; return (Math.floor(Math.atan2(py - y, px - x) * 3) % 2) ? '#e8761f' : '#d0621a'; }, 0.125); };
BUILD.hay = function(B, t, i){ var x = t.x, y = t.y, zb = B.gz(x, y);
  B.solid(x - 1.2, y - 0.8, zb, x + 1.2, y + 0.8, zb + 1.5, function(px, py, pz){ if (Math.abs(px - x) > 1.1 || Math.abs(py - y) > 0.7 || pz - zb > 1.4) return null; return Math.abs(Math.abs(px - x) - 0.5) < 0.08 ? '#8a5a2a' : (hash(px * 8 | 0, pz * 8 | 0, 1) < 0.3 ? '#c8a04a' : '#e2bc5c'); }, 0.125); };
BUILD.lamp = function(B, t, i){ var x = t.x, y = t.y, zb = B.gz(x, y), pole = t.th === 'neon' ? '#2bf0ff' : '#2a2a30', glow = t.th === 'neon' ? '#ff8ae8' : '#fff3c4';
  B.solid(x - 0.6, y - 0.6, zb, x + 0.6, y + 0.6, zb + 7.2, function(px, py, pz){ var tt = pz - zb, r = Math.hypot(px - x, py - y);
    if (tt < 0.4 && r < 0.3) return pole; if (tt < 6 && r < 0.13) return pole; if (tt >= 6 && tt < 7 && r < 0.48) return tt > 6.88 ? pole : glow; return null; }, 0.125); };

/* the end of the trail: an arch over the path with the hole's flag beyond it */
BUILD.arch = function(B, t, i, P){ var x = t.x, y = t.y, zb = B.gz(x, y), T = P.spec.T || {}, c1 = T.wall || '#f4efe2', c2 = T.wallLo || '#a99c7c', acc = T.acc || '#F1D04A';
  B.solid(x - 4.2, y - 0.8, zb - 0.1, x + 4.2, y + 0.8, zb + 9.2, function(px, py, pz){ var dx = px - x, tt = pz - zb, dy = Math.abs(py - y);
    if (dy > 0.7) return null; var leg = Math.abs(Math.abs(dx) - 3.4) < 0.6; if (leg && tt < 7.4) return (tt * 2 | 0) % 2 ? c1 : c2;
    if (tt > 7 && tt < 9 && Math.abs(dx) < 4.1) return tt > 8.7 || tt < 7.25 ? c2 : (Math.abs(dx) < 2.6 ? acc : c1); return null; }, 0.25);
  var fx = x + 1.5, fy = y - 12.5, fz = B.gz(fx, fy);   // the hole's flag on its pin
  B.solid(fx - 0.3, fy - 0.3, fz, fx + 2.2, fy + 0.3, fz + 5.6, function(px, py, pz){ var tt = pz - fz; if (Math.hypot(px - fx, py - fy) < 0.1 && tt < 5.5) return '#ffffff';
    if (px > fx && px < fx + 2 && tt > 4 && tt < 5.4 && Math.abs(py - fy) < 0.06) return T.flag || '#e53935'; return null; }, 0.125); };
/* the wall between two worlds, the width of the land with a doorway on the path, in the new world's stone */
BUILD.wall = function(B, t, i, P){ var kx = kitOf(P.spec.theme), y = t.y, gx = t.gx, b = P.b, c1 = kx.wall[0], c2 = kx.wall[1];
  for (var x0 = b[0]; x0 < b[2]; x0 += 8){ var x1 = Math.min(b[2], x0 + 8); (function(x0, x1){ var zb = B.gz((x0 + x1) / 2, y);
    B.solid(x0, y - 0.9, zb - 0.6, x1, y + 0.9, zb + 7.4, function(px, py, pz){ var dx = Math.abs(px - gx), tt = pz - zb; if (Math.abs(py - y) > 0.8) return null;
      if (dx < PW + 0.4) return null;   // the doorway
      if (dx < PW + 1.4){ if (tt > 7.2) return null; return (tt * 2 | 0) % 2 ? c2 : c1; }   // the posts either side of it
      if (tt > 6.2){ if (Math.floor(px / 1.2) % 2 && tt < 6.9) return c1; if (tt > 6.4) return null; }
      return ((Math.floor(tt / 0.75) + (Math.floor(px / 1.5) % 2)) % 2) && (px * 4 | 0) % 6 ? c1 : c2; }, 0.25); })(x0, x1); } };
/* the fence round a locked clearing, a gap for its gate */
BUILD.fence = function(B, t, i, P){ var F = P.fence, n = 40, kx = kitOf(t.th), post = kx === KIT.neon ? '#ff2bd6' : '#7a5a3a', rail = kx === KIT.neon ? '#2bf0ff' : '#a8865a';
  for (var k = 0; k < n; k++){ var a0 = k / n * 6.2832, a1 = (k + 1) / n * 6.2832, mid = (a0 + a1) / 2, dA = Math.atan2(Math.sin(mid - F.a), Math.cos(mid - F.a)); if (Math.abs(dA) < F.half + 0.08) continue;
    (function(a0, a1){ var ax = F.x + Math.cos(a0) * F.r, ay = F.y + Math.sin(a0) * F.r, bx = F.x + Math.cos(a1) * F.r, by = F.y + Math.sin(a1) * F.r, zb = B.gz(ax, ay);
      B.solid(Math.min(ax, bx) - 0.2, Math.min(ay, by) - 0.2, zb - 0.1, Math.max(ax, bx) + 0.2, Math.max(ay, by) + 0.2, zb + 2.6, function(px, py, pz){ var tt = pz - zb, sd = segD(px, py, ax, ay, bx, by);
        if (Math.hypot(px - ax, py - ay) < 0.18 && tt < 2.5) return post; if (sd < 0.12 && (Math.abs(tt - 1.0) < 0.12 || Math.abs(tt - 2.1) < 0.12)) return rail; return null; }, 0.125); })(a0, a1); } };

/* --------------------------------------------- landmarks, built at two thirds of their real size */
function box(B, x, y, w, d, h, fn, sv){ var zb = B.gz(x, y); B.solid(x - w / 2, y - d / 2, zb - 0.3, x + w / 2, y + d / 2, zb + h, function(px, py, pz){ return fn(px - x, py - y, pz - zb); }, sv || 0.25); }
function gable(B, x, y, w, d, wh, rh, wall, roof, door){ box(B, x, y, w + 0.8, d + 0.8, wh + rh + 0.2, function(dx, dy, t){
  if (Math.abs(dx) < w / 2 && Math.abs(dy) < d / 2 && t < wh){ if (dy > d / 2 - 0.3 && Math.abs(dx) < 1 && t < 4.4) return door || '#4a2e1c';
    if (dy > d / 2 - 0.3 && Math.abs(Math.abs(dx) - w * 0.3) < 0.8 && t > 2.4 && t < 4.2) return Math.abs(t - 3.3) < 0.1 || Math.abs(Math.abs(dx) - w * 0.3) < 0.08 ? '#ffffff' : '#9fd0e8'; return wall(dx, dy, t); }
  if (t >= wh && Math.abs(dx) < w / 2 + 0.4){ var rr = (t - wh) / rh; if (rr < 1 && Math.abs(dy) < (d / 2 + 0.4) * (1 - rr)) return roof(dx, dy, t); } return null; }); }
BUILD.shed = function(B, t){ gable(B, t.x, t.y, t.w - 1, t.d - 1, 6.5, 3.6, function(dx, dy, tt){ return (tt * 1.6 | 0) % 2 ? '#f6f3ea' : '#ebe6d8'; }, function(dx){ return (Math.floor(dx * 1.4 + 20) % 2) ? '#2f6b3e' : '#2a6038'; }, '#2f5d3a'); };
BUILD.cabin = function(B, t){ gable(B, t.x, t.y, t.w - 1, t.d - 1, 6.2, 3.8, function(dx, dy, tt){ return (tt * 2.2 | 0) % 2 ? '#8a5a34' : '#7a4c2a'; }, function(dx, dy, tt){ return tt > 0 && (dx * 3 | 0) % 4 ? '#f6f9fd' : '#dfe8f3'; }, '#4a2e1c'); };
BUILD.barn = function(B, t){ gable(B, t.x, t.y, t.w - 1, t.d - 1, 7.4, 4.6, function(dx, dy, tt){ if (Math.abs(dx) < 2.2 && dy > (t.d - 1) / 2 - 0.3 && tt < 5.2) return (Math.abs(dx) < 0.1 || Math.abs(Math.abs(dx) - Math.abs(tt - 2.6) * 0.8) < 0.15) ? '#ffffff' : '#8b2a1e'; return tt > 7 ? '#ffffff' : '#a8321e'; }, function(){ return '#4a4046'; }, '#8b2a1e'); };
BUILD.green = function(B, t){ var x = t.x, y = t.y, zb = B.gz(x, y);
  box(B, x, y, t.w, t.d, 0.3, function(dx, dy, tt){ return Math.hypot(dx / (t.w / 2), dy / (t.d / 2)) < 1 && tt < 0.25 ? ((dx * 2 | 0) % 2 ? '#5fae58' : '#69b862') : null; });
  box(B, x + 1.5, y - 0.5, 1.6, 0.4, 5.4, function(dx, dy, tt){ if (Math.abs(dx + 0.7) < 0.08 && Math.abs(dy) < 0.08) return '#ffffff'; if (dx > -0.7 && tt > 4 && tt < 5.2 && Math.abs(dy) < 0.06) return '#e53935'; return null; }, 0.125); };
BUILD.bench = function(B, t){ box(B, t.x, t.y, 3, 1.2, 2, function(dx, dy, tt){ if (Math.abs(dx) > 1.4) return null; if (Math.abs(tt - 0.95) < 0.12 && Math.abs(dy) < 0.45) return '#8a6a44';
  if (dy < -0.35 && dy > -0.55 && tt > 1 && tt < 1.9) return '#8a6a44'; if (Math.abs(Math.abs(dx) - 1.2) < 0.12 && tt < 0.95) return '#2a2a30'; return null; }, 0.125); };
BUILD.lamps = function(B, t, i){ BUILD.lamp(B, t, i); };
BUILD.ruin = function(B, t, i){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var top = t.h * (0.55 + 0.45 * vn(dx * 0.5, 1, i)); if (tt > top || Math.abs(dy) > 0.9) return null;
  if (Math.abs(dx) < 1.4 && tt < 5) return null; return ((Math.floor(tt / 0.9) + (Math.floor(dx / 1.6 + (Math.floor(tt / 0.9) % 2) * 0.5) % 2)) % 2) ? '#b9ae84' : (hash(dx * 3 | 0, tt * 3 | 0, 3) < 0.25 ? '#4f7a3a' : '#a59a72'); }); };
BUILD.columns = function(B, t, i){ for (var k = 0; k < 4; k++){ var cx = t.x - t.w / 2 + 1 + k * (t.w - 2) / 3, H = t.h * (k % 2 ? 0.6 + hash(i, k, 1) * 0.3 : 1);
  box(B, cx, t.y, 1.6, 1.6, H, function(dx, dy, tt){ var r = Math.hypot(dx, dy); if (tt < 0.4 || tt > H - 0.4) return Math.max(Math.abs(dx), Math.abs(dy)) < 0.75 ? '#cdc29a' : null; return r < 0.55 ? ((Math.atan2(dy, dx) * 4 | 0) % 2 ? '#b9ae84' : '#a59a72') : null; }); } };
BUILD.statue = function(B, t){ box(B, t.x, t.y, 3, 3, t.h, function(dx, dy, tt){ if (tt < 1.4) return Math.max(Math.abs(dx), Math.abs(dy)) < 1.4 ? '#a59a72' : null;
  var w = tt > 6 ? 0.8 : tt > 4.6 ? 0.55 : 1.0; if (Math.abs(dx) > w || Math.abs(dy) > 0.7) return null; if (tt > 6.3 && tt < 6.7 && Math.abs(dx) > 0.2 && Math.abs(dx) < 0.5 && dy > 0.5) return '#e8c23a'; return '#3f9a6a'; }); };
BUILD.wreck = function(B, t, i){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var hw = (t.d / 2) * Math.sqrt(Math.max(0, 1 - Math.pow(dx / (t.w / 2), 2))), lip = tt * 0.25 + 0.6;
  if (Math.abs(dy) > hw * Math.min(1, lip) || tt > 3.2 + Math.max(0, dx) * 0.5) return null; if (Math.abs(dy) < hw - 0.4 && tt > 0.6) return dx > 3.5 && tt < 6 && Math.abs(dy) < 0.2 ? '#5a4228' : null;
  return (tt * 2.4 | 0) % 2 ? '#7a5a34' : '#6a4a28'; }); box(B, t.x + 2, t.y, 0.5, 0.5, t.h, function(dx, dy, tt){ return Math.hypot(dx, dy) < 0.22 ? '#5a4228' : null; }, 0.125); };
BUILD.boat = function(B, t){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var hw = (t.d / 2) * Math.sqrt(Math.max(0, 1 - Math.pow(dx / (t.w / 2), 2))); if (Math.abs(dy) > hw || tt > 1.6) return null; if (Math.abs(dy) < hw - 0.3 && tt > 0.4) return null; return tt > 1.3 ? '#f4efe2' : '#c8402e'; }); };
BUILD.barrels = function(B, t){ for (var k = 0; k < 3; k++){ var bx = t.x - 1.2 + k * 1.2, by = t.y + (k % 2) * 0.6; box(B, bx, by, 1.2, 1.2, 2, function(dx, dy, tt){ var r = 0.5 + 0.07 * Math.sin(tt / 2 * Math.PI); if (Math.hypot(dx, dy) > r) return null; return Math.abs(tt - 0.4) < 0.1 || Math.abs(tt - 1.5) < 0.1 ? '#3a3036' : '#8a5a34'; }, 0.125); } };
BUILD.mesa = function(B, t, i){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var rx = t.w / 2 * (1 - tt / t.h * 0.25), ry = t.d / 2 * (1 - tt / t.h * 0.25), d = Math.hypot(dx / rx, dy / ry) + (vn(dx * 0.6, tt * 0.6, i) - 0.5) * 0.3;
  if (d > 1) return null; return ((tt * 1.2 | 0) % 3) ? '#b8784e' : (tt > t.h - 0.6 ? '#d49668' : '#a06040'); }, 0.5); };
BUILD.tower = function(B, t){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ if (tt < 9){ var leg = Math.abs(Math.abs(dx) - 1.8) < 0.22 && Math.abs(Math.abs(dy) - 1.8) < 0.22; var brace = Math.abs(Math.abs(dx) - 1.8) < 0.12 && Math.abs(tt % 3 - 1.5 - dy * 0.8) < 0.15;
  return leg || brace ? '#6a4a30' : null; } var r = Math.hypot(dx, dy); if (tt < 13.6) return r < 2.2 ? (Math.abs(tt - 10) < 0.15 || Math.abs(tt - 12.5) < 0.15 ? '#3a3036' : '#8a5a34') : null; return r < 2.4 * (1 - (tt - 13.6) / 1.4) ? '#5a4228' : null; }); };
BUILD.cart = function(B, t){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ if (tt < 0.25) return Math.abs(Math.abs(dy) - 0.7) < 0.1 ? '#6a6a70' : (Math.abs(dx % 1) < 0.15 ? '#5a4228' : null);
  if (Math.abs(dx) < 1.6 && Math.abs(dy) < 0.95 && tt < 2.8){ if (Math.abs(dx) < 1.3 && Math.abs(dy) < 0.7 && tt > 1.2) return tt < 2.3 ? '#e2bc5c' : null; return '#5a5a62'; } if (Math.abs(Math.abs(dx) - 1) < 0.35 && Math.abs(Math.abs(dy) - 1) < 0.2 && tt < 0.8) return '#2a2a30'; return null; }); };
BUILD.basaltset = function(B, t, i){ for (var k = 0; k < 5; k++) BUILD.basalt(B, { x:t.x + (k - 2) * 1.3, y:t.y + (k % 2) * 1.2, h:4 + hash(i, k, 3) * 5 }, i * 7 + k); };
BUILD.vent = function(B, t){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var r = Math.hypot(dx, dy), out = 2.4 * (1 - tt / t.h * 0.6), inn = 1.1; if (r > out) return null; if (r < inn) return tt < 0.6 ? (r < 0.8 ? '#ffb43a' : '#ff5a1a') : null; return (tt * 2 | 0) % 2 ? '#3a3236' : '#2a2428'; }); };
BUILD.skull = function(B, t){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var d = Math.hypot(dx / 2.3, dy / 1.8, (tt - 2.6) / 2.4); if (d > 1) return null;
  if (dy > 0.9 && tt > 2.4 && tt < 3.6 && Math.abs(Math.abs(dx) - 0.9) < 0.45) return '#ff6a1a'; if (dy > 1 && tt < 1.5 && (dx * 3 | 0) % 2) return '#2a2428'; return '#d8d0c4'; }); };
BUILD.igloo = function(B, t){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var d = Math.hypot(dx / 3.3, dy / 3.3, tt / 4.6); if (dy > 2.2 && Math.abs(dx) < 1.1 && tt < 2.6) return tt < 2 && Math.abs(dx) < 0.7 ? null : '#e8f2fb';
  if (d > 1) return null; return (Math.floor(tt / 0.8) % 2 ? (Math.floor((Math.atan2(dy, dx) + 4) * 2.5) % 2) : (Math.floor((Math.atan2(dy, dx) + 4) * 2.5 + 0.5) % 2)) ? '#f6f9fd' : '#cfdcea'; }); };
BUILD.snowman = function(B, t){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var r = Math.hypot(dx, dy);
  if (Math.hypot(r, tt - 1.2) < 1.3 || Math.hypot(r, tt - 3) < 0.95 || Math.hypot(r, tt - 4.3) < 0.7) return (dy > 0.6 && Math.abs(dx) < 0.1 && tt > 2.4 && tt < 3.6) ? '#20242b' : (dy > 0.5 && tt > 4.1 && tt < 4.3 && Math.abs(dx) < 0.1) ? '#ff8a1a' : '#f6f9fd';
  if (tt > 4.8 && tt < 5.5 && r < 0.6) return '#20242b'; return null; }); };
BUILD.balloon = function(B, t){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var r = Math.hypot(dx, dy);
  if (tt < 2.2) return Math.max(Math.abs(dx), Math.abs(dy)) < 1.1 ? (tt > 1.9 ? '#5a4228' : '#a8865a') : null;
  if (tt < 7) return (Math.abs(Math.abs(dx) - 0.9) < 0.07 && Math.abs(Math.abs(dy) - 0.9) < 0.07) ? '#5a4228' : null;
  var d = Math.hypot(dx / 3, dy / 3, (tt - 11) / 4.6); if (d > 1) return null; return (Math.floor((Math.atan2(dy, dx) + 4) * 2) % 2) ? '#ff5a7a' : '#ffd23a'; }); };
BUILD.kite = function(B, t){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ if (tt < 8) return Math.hypot(dx - tt * 0.1, dy) < 0.06 ? '#ffffff' : null; var d = Math.abs(dx - 0.8) + Math.abs(tt - 10) * 0.6; if (d > 1.3 || Math.abs(dy) > 0.1) return null; return dx > 0.8 ? '#2bf0ff' : '#ff2bd6'; }, 0.125); };
BUILD.pillar = function(B, t){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var r = Math.hypot(dx, dy); if (tt > t.h - 2) return r < 2.4 ? (tt > t.h - 0.6 ? '#8fd3a0' : '#c9a46a') : null; return r < 0.9 ? ((tt * 1.5 | 0) % 2 ? '#ffffff' : '#e4e9f4') : null; }); };
BUILD.cabinets = function(B, t, i){ for (var k = 0; k < 3; k++) cabinet(B, t.x - 2.6 + k * 2.6, t.y, i + k); };
BUILD.sign = function(B, t, i){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ if (tt < 6) return Math.abs(Math.abs(dx) - 3) < 0.2 && Math.abs(dy) < 0.2 ? '#2a2440' : null;
  if (Math.abs(dy) > 0.4) return null; var e = Math.abs(dx) > 3.7 || tt > 10.6 || tt < 6.4; if (e) return '#ff2bd6'; var ch = (Math.floor((dx + 4) * 1.5) + Math.floor(tt * 1.5)) % 3; return ch === 0 ? '#2bf0ff' : '#1a1430'; }); };
BUILD.pylons = function(B, t, i){ for (var k = 0; k < 3; k++) BUILD.pylon(B, { x:t.x - 2 + k * 2, y:t.y + (k % 2), h:t.h * (0.7 + k * 0.15) }, i + k); };
BUILD.crypt = function(B, t){ gable(B, t.x, t.y, t.w - 1, t.d - 1, 6, 3.2, function(dx, dy, tt){ return ((Math.floor(tt / 0.8) + (Math.floor(dx / 1.4) % 2)) % 2) ? '#6e6a76' : '#5a5662'; }, function(){ return '#3a3640'; }, '#1a1820'); };
BUILD.graves = function(B, t, i){ for (var k = 0; k < 6; k++) BUILD.tomb(B, { x:t.x - 3 + (k % 3) * 3, y:t.y - 1.5 + (k / 3 | 0) * 3 }, i + k); };
BUILD.fenceyard = function(B, t, i){ BUILD.graves(B, t, i); };
BUILD.scarecrow = function(B, t){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ if (Math.abs(dx) < 0.12 && Math.abs(dy) < 0.12 && tt < 6) return '#6a4a2a';
  if (tt > 3.8 && tt < 4.2 && Math.abs(dx) < 1.4 && Math.abs(dy) < 0.12) return '#6a4a2a'; if (tt > 2.6 && tt < 4.6 && Math.abs(dx) < 0.7 && Math.abs(dy) < 0.45) return (tt * 3 | 0) % 2 ? '#a8321e' : '#c84a2e';
  if (Math.hypot(dx, dy, tt - 5.1) < 0.55) return '#e2bc5c'; if (tt > 5.5 && tt < 6.3 && Math.hypot(dx, dy) < 0.9 - (tt - 5.5)) return '#6a4a2a'; return null; }, 0.125); };
BUILD.cornfield = function(B, t, i){ for (var r = 0; r < 4; r++) for (var c = 0; c < 6; c++) BUILD.corn(B, { x:t.x - t.w / 2 + 0.8 + c * (t.w - 1.6) / 5, y:t.y - t.d / 2 + 1 + r * (t.d - 2) / 3, h:4.6 + hash(i, r * 7 + c, 2) }, i * 31 + r * 7 + c); };

/* ------------------------------------------------------------------------------ ambient life */
/* EVERY WORLD IS ALIVE AROUND YOU. Nothing here can be touched or picked up and none of it blocks the golfer:
   it is what makes the trail a place rather than a picture. Each world has its own (LIFE): things that fly
   over (birds, gulls, parrots, vultures, bats, crows, drones), things in the air (butterflies, fireflies,
   snow, embers, leaves, dust, neon sparks), and the big set pieces: pirate ships sailing past Pirate Cove,
   balloons drifting over Sky Islands, smoke off Volcano Island's vents and lava, tumbleweeds across the
   canyon, ghosts in Hallows Night. Flyers and motes are spawned round the golfer and recycled once they are
   out of sight, so the cost is a few dozen squares a frame wherever he walks. Ships and balloons are 3D
   props, rendered once like a chest, and moved. */
var LIFE = {
  clubhouse:{ fly:['song', 5], mote:[['butter', 12], ['petal', 10]] },
  temple:{ fly:['parrot', 4], mote:[['firefly', 22], ['butter', 6]] },
  pirate:{ fly:['gull', 4], ships:2 },
  canyon:{ fly:['vulture', 3], mote:['dust', 24], tumble:3 },
  volcano:{ mote:[['ember', 34], ['ash', 26]], smoke:true },
  frozen:{ mote:['snow', 90], fly:['gull', 2] },
  sky:{ fly:['gull', 3], balloons:3 },
  neon:{ fly:['drone', 3], mote:['spark', 40] },
  haunted:{ fly:['bat', 5], ghosts:2, mote:['firefly', 8] },
  harvest:{ fly:['crow', 3], mote:['leaf', 16] }
};
// two frames a flyer: wings up, wings down. o body, w wing, h head or beak, l light
var PIX_FLY = {
  bird:[['w.....w', '.w...w.', '..wow..', '...h...'], ['..wow..', '.w.h.w.', 'w.....w']],
  bat:[['w.....w', 'ww...ww', '.wwoww.', '..h.h..'], ['..wow..', '.wwoww.', 'w.h.h.w']],
  drone:[['l.....l', 'ooooooo', '..ooo..', '...h...'], ['h.....h', 'ooooooo', '..ooo..', '...l...']]
};
var FLY_PAL = {
  song:{ base:'bird', w:'#6a4a2e', o:'#8a6a44', h:'#e8a03a', sz:0.8, z:[6, 10], v:[6, 9] },
  parrot:{ base:'bird', w:'#e5483a', o:'#2bb04a', h:'#ffd23a', sz:1, z:[8, 13], v:[6, 8] },
  gull:{ base:'bird', w:'#f4f6fb', o:'#d8dde6', h:'#f2a03a', sz:1.1, z:[9, 15], v:[5, 8] },
  vulture:{ base:'bird', w:'#2a2228', o:'#3a3036', h:'#d89a7a', sz:1.3, z:[13, 17], v:[4, 5], circle:true },
  crow:{ base:'bird', w:'#1a1820', o:'#24222a', h:'#d8a02a', sz:1, z:[7, 12], v:[6, 8] },
  bat:{ base:'bat', w:'#2a2230', o:'#3a2e44', h:'#ff4a3a', sz:0.9, z:[4, 9], v:[5, 9], flit:true },
  drone:{ base:'drone', w:'#2bf0ff', o:'#2a2440', h:'#ff2bd6', l:'#2bf0ff', sz:1, z:[8, 12], v:[4, 6] }
};
var PIX_BUTTER = [['ww.ww', 'wwbww', '.wbw.'], ['.wbw.', '..b..']], PIX_GHOST = ['..ggg..', '.ggggg.', 'gg.g.gg', 'ggggggg', 'ggggggg', 'ggggggg', 'g.g.g.g'];
// a pirate ship, bow toward dir (+1 down the screen, -1 up it): a dark hull, two masts, square sails, a black flag
function shipFn(dir){ return function(B){ box(B, 0, 0, 5, 14, 11.5, function(dx, dy, tt){ var u = dy * dir, L2 = 5.6;
  // masts, yards, the crow's nest and the black flag
  var m1 = 0.6 * dir, m2 = -2.8 * dir;
  if (Math.abs(dx) < 0.17 && Math.abs(dy - m1) < 0.17 && tt < 10.4) return '#4a301a';
  if (Math.abs(dx) < 0.15 && Math.abs(dy - m2) < 0.15 && tt < 8.6) return '#4a301a';
  if (Math.hypot(dx, dy - m1) < 0.5 && tt > 9 && tt < 9.35) return '#5a3a1e';
  if (tt > 9.6 && tt < 10.4 && dx > 0.1 && dx < 1.5 && Math.abs(dy - m1) < 0.1){ var fx = dx - 0.8, fy = tt - 10; return (fx * fx + fy * fy < 0.05) ? '#f4efe2' : '#151218'; }
  if ((Math.abs(tt - 8.7) < 0.12 || Math.abs(tt - 3.6) < 0.12) && Math.abs(dx) < 2.4 && Math.abs(dy - m1) < 0.14) return '#5a3a1e';
  if ((Math.abs(tt - 7.3) < 0.12 || Math.abs(tt - 3.3) < 0.12) && Math.abs(dx) < 2 && Math.abs(dy - m2) < 0.14) return '#5a3a1e';
  // the sails, bellied with the wind behind them
  function sail(top, bot, half, my){ if (tt <= bot || tt >= top || Math.abs(dx) >= half) return null; var v = (tt - bot) / (top - bot), belly = 0.75 * (1 - Math.pow(dx / half, 2)) * Math.sin(v * Math.PI);
    if (Math.abs(dy - my - dir * belly) > 0.24) return null; return v > 0.42 && v < 0.58 ? '#c8402e' : '#fbf3dc'; }
  var sl = sail(8.6, 3.7, 2.3, m1) || sail(7.2, 3.4, 1.9, m2); if (sl) return sl;
  // the bowsprit
  if (u > 5 && u < 7.4 && Math.abs(dx) < 0.13 && Math.abs(tt - (2 + (u - 5) * 0.35)) < 0.16) return '#4a301a';
  if (tt > 2.4 || Math.abs(u) > L2) return null;
  var hw = u > 1.4 ? 2.1 * Math.sqrt(Math.max(0, 1 - Math.pow((u - 1.4) / (L2 - 1.4), 2))) : u < -L2 + 0.7 ? 1.8 : 2.1;
  hw *= 0.72 + tt * 0.12; if (Math.abs(dx) > hw) return null;
  if (Math.abs(dx) < hw - 0.32 && tt > 1.6) return tt < 1.85 ? ((Math.abs(dx * 3) | 0) % 2 ? '#a8763e' : '#9a6a36') : null;
  if (Math.abs(tt - 1.15) < 0.16 && Math.abs(dx) > hw - 0.4 && Math.abs((u + 8) % 1.6 - 0.8) < 0.28 && Math.abs(u) < 4) return '#151218';   // cannon ports
  if (tt > 2.1) return '#3a2410';
  return Math.abs(tt - 0.7) < 0.12 ? '#d8a83a' : (tt * 2.6 | 0) % 2 ? '#5a3a1e' : '#4a2e16'; }, 0.2); }; }
function balloonFn(c1, c2){ return function(B){ box(B, 0, 0, 6.4, 6.4, 16, function(dx, dy, tt){ var r = Math.hypot(dx, dy);
  if (tt < 2.2) return Math.max(Math.abs(dx), Math.abs(dy)) < 1.1 ? (tt > 1.9 ? '#5a4228' : '#a8865a') : null;
  if (tt < 7) return (Math.abs(Math.abs(dx) - 0.9) < 0.07 && Math.abs(Math.abs(dy) - 0.9) < 0.07) ? '#5a4228' : null;
  var d = Math.hypot(dx / 3, dy / 3, (tt - 11) / 4.6); if (d > 1) return null; return (Math.floor((Math.atan2(dy, dx) + 4) * 2) % 2) ? c1 : c2; }, 0.25); }; }
var BALLOON_COLS = [['#ff5a7a', '#ffd23a'], ['#2bb0ff', '#ffffff'], ['#7a5cff', '#7cff8a']];
/* -------------------------------------------------------------------------------- rendering */
function sceneC(P){ var T = P.spec.T || {}; return { T:T, field:{ h:function(){ return 0; } }, poly:[[0, 0], [1, 0], [1, 1]], allPts:[[0, 0], [1, 1]], mats:{ at:function(){ return 0; } }, bounds:[1e9, 1e9, -1e9, -1e9], seed:P.seed,
  bumpers:[], blocks:[], ramps:[], loops:[], movers:[] }; }
function slices(P){ var H3 = window.RTT_PUTT_3D; if (!H3) return null;
  return H3.slices(sceneC(P), { elev:ELEV, art:TART, scene:{ b:P.b, land:land(P), zMax:20, clearAt:function(x, y){ return P.walkD(x, y) - PW - 0.5; } } }); }
/* one dynamic thing (a chest, a crate, a gate leaf) rendered on its own, lit and outlined like the scene */
var PROPS = {};
function propSprite(key, P, buildFn, w, d, h){ if (PROPS[key] !== undefined) return PROPS[key]; var H3 = window.RTT_PUTT_3D; if (!H3) return null;
  var b = [-w / 2 - 1, -d / 2 - 1, w / 2 + 1, d / 2 + 1], land0 = { build:function(B){ buildFn(B); }, mats:{}, h:function(){ return 0; }, mat:function(){ return ['g']; } };
  try{ var r = H3.render(sceneC(P), { elev:ELEV, art:TART, scene:{ b:b, land:land0, zMax:h + 1, noGround:true } }); var o = r.pr(0, 0, 0); PROPS[key] = { cv:r.cv, ax:o[0], ay:o[1] }; }catch(e){ PROPS[key] = null; }
  return PROPS[key]; }
var BRK = {
  crate:function(B, x, y){ box(B, x, y, 1.6, 1.6, 1.6, function(dx, dy, tt){ var e = Math.abs(dx) > 0.62 || Math.abs(dy) > 0.62 || tt > 1.4 || tt < 0.2, cr = Math.abs(Math.abs(dx) - Math.abs(tt - 0.8)) < 0.14; if (Math.abs(dx) > 0.75 || Math.abs(dy) > 0.75 || tt > 1.55) return null; return e || cr ? '#8a5a2a' : '#c08a4e'; }, 0.125); },
  pot:function(B, x, y){ box(B, x, y, 1.6, 1.6, 1.8, function(dx, dy, tt){ var r = Math.hypot(dx, dy), rad = tt < 1.2 ? 0.45 + Math.sin(tt / 1.2 * Math.PI) * 0.3 : 0.38; if (r > rad || tt > 1.6) return null; return Math.abs(tt - 0.9) < 0.08 ? '#f0e0b0' : '#b8643a'; }, 0.125); },
  barrel:function(B, x, y){ box(B, x, y, 1.4, 1.4, 1.9, function(dx, dy, tt){ var r = 0.5 + 0.08 * Math.sin(tt / 1.8 * Math.PI); if (Math.hypot(dx, dy) > r || tt > 1.8) return null; return Math.abs(tt - 0.35) < 0.09 || Math.abs(tt - 1.45) < 0.09 ? '#3a3036' : '#8a5a34'; }, 0.125); },
  ice:function(B, x, y){ box(B, x, y, 1.6, 1.6, 1.6, function(dx, dy, tt){ if (Math.abs(dx) > 0.7 || Math.abs(dy) > 0.7 || tt > 1.4) return null; return (Math.abs(dx) > 0.55 || tt > 1.25) ? '#e2f6ff' : '#a8dcf4'; }, 0.125); },
  neoncube:function(B, x, y){ box(B, x, y, 1.6, 1.6, 1.6, function(dx, dy, tt){ if (Math.abs(dx) > 0.7 || Math.abs(dy) > 0.7 || tt > 1.4) return null; return (Math.abs(dx) > 0.58 || Math.abs(dy) > 0.58 || tt > 1.28 || tt < 0.12) ? '#2bf0ff' : '#1a1430'; }, 0.125); },
  pumpkin:function(B, x, y){ BUILD.pumpkin(B, { x:x, y:y }, 1); },
  hay:function(B, x, y){ BUILD.hay(B, { x:x, y:y }, 1); }
};
function chestFn(open){ return function(B){ box(B, 0, 0, 2.2, 1.6, 2.4, function(dx, dy, tt){ if (Math.abs(dx) > 0.9 || Math.abs(dy) > 0.6) return null;
  if (tt < 0.8) return Math.abs(dx) < 0.12 && tt > 0.4 && dy > 0.5 ? '#ffd23a' : (Math.abs(Math.abs(dx) - 0.75) < 0.1 || tt < 0.12) ? '#5a3a1c' : '#9a5e2e';
  if (open){ if (dy < -0.4 && tt < 2.0) return tt > 1.85 ? '#5a3a1c' : '#9a5e2e'; if (tt < 0.95 && Math.abs(dx) < 0.75 && Math.abs(dy) < 0.45) return '#ffd23a'; return null; }
  if (tt < 1.25 && Math.hypot(dy * 1.2, tt - 0.8) < 0.62) return Math.abs(Math.abs(dx) - 0.75) < 0.1 ? '#5a3a1c' : '#9a5e2e'; return null; }, 0.125); }; }
function gateFn(open, P){ var kx = kitOf(P.spec.theme), c1 = kx.wall[0], c2 = kx.wall[1];
  return function(B){ box(B, 0, 0, PW * 2 + 1, 1.2, 6.8, function(dx, dy, tt){ if (Math.abs(dy) > 0.25) return null; var half = PW + 0.4;
    if (open){ var leaf = Math.abs(Math.abs(dx) - half) < 0.25 && tt < 6.4; return leaf ? c2 : null; }
    if (Math.abs(dx) > half || tt > 6.4) return null; if (Math.abs(dx) < 0.1) return c2; return (Math.floor(dx / 0.55) % 2 && tt < 6.1 && tt > 0.3) ? '#3a2a1a' : c1; }, 0.125); }; }
function lockGateFn(open){ return function(B){ box(B, 0, 0, 3.4, 1, 3, function(dx, dy, tt){ if (Math.abs(dy) > 0.15 || tt > 2.7) return null;
  if (open) return Math.abs(Math.abs(dx) - 1.5) < 0.15 ? '#7a5a3a' : null; if (Math.abs(dx) > 1.6) return null;
  if (Math.abs(dx) < 0.3 && Math.abs(tt - 1.4) < 0.3) return '#ffd23a'; return (Math.abs(tt - 0.6) < 0.12 || Math.abs(tt - 2.2) < 0.12 || (dx * 2.5 | 0) % 2 === 0) ? '#7a5a3a' : null; }, 0.125); }; }

/* -------------------------------------------------------------------------------- the walk */
function run(box, P, pic, api){
  var cv = document.createElement('canvas'); cv.className = 'pp-tcv'; box.appendChild(cv);
  var ctx = cv.getContext('2d'), alive = true, dpr = Math.min(3, window.devicePixelRatio || 1), W = 0, H = 0, kk = 1, ox = 0, oy = 0, ART = pic.ART || window.RTT_PUTT.ART;
  var found = api.found || {}, coinsGot = 0, pick = api.pick, sp = P.spec;
  function size(){ var r = box.getBoundingClientRect(); W = cv.width = Math.max(1, Math.round(r.width * dpr)); H = cv.height = Math.max(1, Math.round(r.height * dpr)); cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
    var viewArt = VIEW_FT * SE / ART; kk = Math.max(1, Math.round(H / viewArt)); while (pic.cv.width * kk < W && kk < 40) kk++; }
  size(); var onRs = function(){ size(); }; window.addEventListener('resize', onRs);
  // the golfer
  var g = { x:P.start.x, y:P.start.y - 2, vx:0, vy:0, face:[0, -1], dist:0, safe:[P.start.x, P.start.y - 2], moving:false };
  var gate = P.gate ? { open:!!sp.gateOpen, asked:false } : null, lockOpen = !P.fence || !!found.key;
  /* A chest is open if this account opened it (found.ch); the clearing's chest also counts as open on a record
     from before chests held coins (found.k), and those coins were paid then, so none drop. The coins of an open
     chest that were not picked up are still lying where they landed. */
  var chOpen = function(t){ return (found.ch || []).indexOf(t.id) >= 0; }, legacyK = function(t){ return t.main && found.k && !chOpen(t); };
  var items = [];
  P.items.forEach(function(t){ var o = Object.assign({}, t); o.done = t.k === 'chest' ? chOpen(t) || legacyK(t) : t.k === 'golden' ? !!found.g : t.k === 'key' ? !!found.key : t.k === 'life' ? !!found.life : t.k === 'trinket' ? !!found.tk : t.k === 'part' ? !!found.pt : false; items.push(o);
    if (t.k === 'chest') (t.drops || []).forEach(function(d, i){ var cid = t.id + ':' + i; items.push({ k:'coin', id:cid, x:d[0], y:d[1], ch:o, done:legacyK(t) || (found.c || []).indexOf(cid) >= 0, out:chOpen(t), fly:null }); }); });
  var chests = items.filter(function(t){ return t.k === 'chest'; });
  var parts = [], bubble = null, flash = 0, paused = false, ended = false;
  // the colliders, on a coarse grid
  var GRID = {}; function gk(x, y){ return (x / 6 | 0) + ',' + (y / 6 | 0); }
  P.cols.forEach(function(c){ for (var x = c.x - c.r - (c.w || 0) / 2 - 6; x <= c.x + c.r + (c.w || 0) / 2 + 6; x += 6) for (var y = c.y - c.r - (c.d || 0) / 2 - 6; y <= c.y + c.r + (c.d || 0) / 2 + 6; y += 6){ var k = gk(x, y); (GRID[k] = GRID[k] || []).push(c); } });
  function blocked(x, y){ var R = 0.55;
    if (x < P.b[0] + 2.5 || x > P.b[2] - 2.5 || y > P.b[3] - 2 || y < -1.2) return true;
    var o = P.poolAt(x, y); if (o && o.k === 'water') return true; if (P.seaAt(x, y)) return true;
    var cs = GRID[gk(x, y)] || []; for (var i = 0; i < cs.length; i++){ var c = cs[i];
      if (c.w){ if (Math.abs(x - c.x) < c.w / 2 + R && Math.abs(y - c.y) < c.d / 2 + R) return true; } else if (Math.hypot(x - c.x, y - c.y) < c.r + R) return true; }
    if (gate && Math.abs(y - P.gate.y) < 0.9 + R && !(gate.open && Math.abs(x - P.gate.x) < PW + 0.3)) return true;
    if (P.fence){ var d = Math.hypot(x - P.fence.x, y - P.fence.y); if (Math.abs(d - P.fence.r) < R + 0.15){ var a = Math.atan2(y - P.fence.y, x - P.fence.x), da = Math.abs(Math.atan2(Math.sin(a - P.fence.a), Math.cos(a - P.fence.a))); if (!(lockOpen && da < P.fence.half)) return true; } }
    for (var j = 0; j < items.length; j++){ var t = items[j]; if ((t.k === 'chest' || t.k === 'npc') && Math.hypot(x - t.x, y - t.y) < 1.0 + R) return true; }
    return false; }
  // the screen: art pixel to device pixel, through the picture's own projection
  function scr(x, y, z){ var p = pic.pr(x, y, z == null ? pic.zAt(x, y) : z); return [ox + p[0] * kk, oy + p[1] * kk]; }
  // on a shore trail the camera looks a little out to sea, where the ships are, rather than inland at more sand
  function camAim(snap){ var lx = g.x + (P.sea && LIFE[sp.theme] && LIFE[sp.theme].ships ? P.sea.side * 4.5 : 0), p = pic.pr(lx, g.y, pic.zAt(lx, g.y)), tx = Math.round(W / 2 - p[0] * kk), ty = Math.round(H * 0.64 - p[1] * kk), iw = pic.cv.width * kk, ih = pic.cv.height * kk;
    tx = iw > W ? Math.max(W - iw, Math.min(0, tx)) : Math.round((W - iw) / 2); ty = ih > H ? Math.max(H - ih, Math.min(0, ty)) : Math.round((H - ih) / 2);
    if (snap){ ox = tx; oy = ty; } else { ox += Math.round((tx - ox) * 0.14); oy += Math.round((ty - oy) * 0.14); } }
  camAim(true);
  // anything that moves is drawn, then the scene is drawn back over it wherever the scene stands nearer the camera
  /* see: the golfer. What stands in front of him is drawn back at half strength, so he shows through a tree
     the way a player does in a 3D game, and is never lost behind one */
  function occlude(rx, ry, rw, rh, x, y, z0, see){ if (!pic.Z) return; if (see) ctx.globalAlpha = 0.5; var a0 = Math.max(0, Math.floor((rx - ox) / kk)), a1 = Math.min(pic.cv.width - 1, Math.ceil((rx + rw - ox) / kk)), b0 = Math.max(0, Math.floor((ry - oy) / kk)), b1 = Math.min(pic.cv.height - 1, Math.ceil((ry + rh - oy) / kk));
    var foot = pic.pr(x, y, z0)[1];
    for (var ay = b0; ay <= b1; ay++){ var z = z0 + (foot - ay - 0.5) * ART / CE; if (z < z0) z = z0; var dp = y * CE + z * SE, row = (ay + pic.zy0) * pic.ZW, run = -1;
      for (var ax = a0; ax <= a1 + 1; ax++){ var front = ax <= a1 && pic.Z[row + ax] > dp + 0.35;
        if (front && run < 0) run = ax; else if (!front && run >= 0){ ctx.drawImage(pic.cv, run, ay, ax - run, 1, ox + run * kk, oy + ay * kk, (ax - run) * kk, kk); run = -1; } } }
    ctx.globalAlpha = 1; }
  function drawSprite(sp2, x, y, z, k2, noOcc){ if (!sp2) return; k2 = k2 || 1; var p = scr(x, y, z), w = sp2.cv.width * kk * k2, h = sp2.cv.height * kk * k2, rx = Math.round(p[0] - sp2.ax * kk * k2), ry = Math.round(p[1] - sp2.ay * kk * k2);
    ctx.drawImage(sp2.cv, rx, ry, w, h); if (!noOcc) occlude(rx, ry, w, h, x, y, z); }
  var brkKind = function(t){ return kitOf(t.th || sp.theme).brk; };
  function prop(name, fn, w, d, h){ return propSprite(name, P, fn, w, d, h); }
  var SPR = {
    chest0:prop('chest0', chestFn(false), 2.2, 1.6, 2.4), chest1:prop('chest1', chestFn(true), 2.2, 1.6, 2.4),
    gate0:P.gate ? prop('gate0:' + sp.theme, gateFn(false, P), PW * 2 + 1, 1.2, 7) : null, gate1:P.gate ? prop('gate1:' + sp.theme, gateFn(true, P), PW * 2 + 1, 1.2, 7) : null,
    lock0:P.fence ? prop('lock0', lockGateFn(false), 3.4, 1, 3) : null, lock1:P.fence ? prop('lock1', lockGateFn(true), 3.4, 1, 3) : null
  };
  function brkSprite(t){ var k = brkKind(t); return prop('brk:' + k, function(B){ (BRK[k] || BRK.crate)(B, 0, 0); }, 1.8, 1.8, 2); }
  // the local is the 3D golfer model, in the world's own clothes, standing and facing the path
  function npcFrame(t){ var G = window.RTT_G3D; if (!G || !G.frame) return null; var face = t.x < P.cx(t.y) ? 90 : -90; try{ return G.frame(Object.assign({ shoes:'white', club:'driver', lefty:false }, kitOf(t.th).npc), face, 'walk', 8); }catch(e){ return null; } }
  var IMG = {}; function img(u){ var im = IMG[u]; if (!im){ im = IMG[u] = new Image(); im.src = u; } return im; }
  function drawFigure(f, x, y, see){ if (!f || !f.url) return null; var im = img(f.url); if (!im.complete || !im.naturalWidth) return null;
    var hgt = GH * CE / ART * kk, k2 = hgt / f.fig, p = scr(x, y), rx = Math.round(p[0] - f.ball[0] * k2), ry = Math.round(p[1] - f.ball[1] * k2), rw = Math.round(f.W * k2), rh = Math.round(f.H * k2);
    ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(im, rx, ry, rw, rh); ctx.restore(); occlude(rx, ry, rw, rh, x, y, pic.zAt(x, y), see); return [rx, ry, rw, rh]; }
  // a coin, a key and the golden ball are drawn at the scene's own pixel size, so they sit in it
  function drawCoin(t, now){ var f = t.fly;
    if (f && now < f.t0 + f.dur){ if (now < f.t0) return; var u = (now - f.t0) / f.dur, fx = f.x0 + (t.x - f.x0) * u, fy = f.y0 + (t.y - f.y0) * u, fz = f.z0 + (pic.zAt(t.x, t.y) + 0.4 - f.z0) * u + Math.sin(u * Math.PI) * 3.2;
      var fp = scr(fx, fy, fz), fs = Math.max(2, Math.round(kk)), fw = Math.max(1, Math.round(Math.abs(Math.cos(now * 14 + t.x)) * 5));
      ctx.fillStyle = '#7a5200'; ctx.fillRect(Math.round(fp[0] - (fw / 2 + 1) * fs), Math.round(fp[1] - 6 * fs), (fw + 2) * fs, 6 * fs); ctx.fillStyle = '#ffd23a'; ctx.fillRect(Math.round(fp[0] - fw / 2 * fs), Math.round(fp[1] - 5 * fs), fw * fs, 4 * fs); return; }
    var z = pic.zAt(t.x, t.y) + 1.1 + Math.sin(now * 3 + t.x) * 0.12, p = scr(t.x, t.y, z), s = Math.max(2, Math.round(kk)), w = Math.max(1, Math.round(Math.abs(Math.cos(now * 3.2 + t.y)) * 5)), h = 6;
    var shp = scr(t.x, t.y); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(Math.round(shp[0] - 2 * s), Math.round(shp[1] - s / 2), 4 * s, s);
    var rx = Math.round(p[0] - w * s / 2), ry = Math.round(p[1] - h * s); ctx.fillStyle = '#7a5200'; ctx.fillRect(rx - s, ry, (w + 2) * s, h * s); ctx.fillRect(rx, ry - s, w * s, (h + 2) * s);
    ctx.fillStyle = '#ffd23a'; ctx.fillRect(rx, ry, w * s, h * s); ctx.fillStyle = '#fff3a8'; if (w > 2) ctx.fillRect(rx + s, ry + s, s, (h - 2) * s);
    occlude(rx - s, ry - s, (w + 2) * s, (h + 2) * s, t.x, t.y, pic.zAt(t.x, t.y)); }
  function drawKey(t, now){ var z = pic.zAt(t.x, t.y) + 1.3 + Math.sin(now * 2.4) * 0.2, p = scr(t.x, t.y, z), s = Math.max(2, Math.round(kk)), rx = Math.round(p[0] - 4 * s), ry = Math.round(p[1] - 4 * s);
    var shp = scr(t.x, t.y); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(Math.round(shp[0] - 3 * s), Math.round(shp[1] - s / 2), 6 * s, s);
    ctx.fillStyle = '#7a5200'; ctx.fillRect(rx, ry, 4 * s, 4 * s); ctx.fillRect(rx + 3 * s, ry + s, 6 * s, 2 * s); ctx.fillStyle = '#ffd23a'; ctx.fillRect(rx + s, ry + s, 2 * s, 2 * s); ctx.fillRect(rx + 4 * s, ry + 1.5 * s | 0, 5 * s, s); ctx.fillRect(rx + 7 * s, ry + 2 * s, s, 2 * s);
    sparkle(p[0], p[1] - 2 * s, now, s); occlude(rx, ry, 10 * s, 5 * s, t.x, t.y, pic.zAt(t.x, t.y)); }
  function drawGolden(t, now){ var z = pic.zAt(t.x, t.y) + 0.8 + Math.sin(now * 2) * 0.1, p = scr(t.x, t.y, z), s = Math.max(2, Math.round(kk)), r = 3;
    var shp = scr(t.x, t.y); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(Math.round(shp[0] - 2 * s), Math.round(shp[1] - s / 2), 4 * s, s);
    for (var yy = -r; yy <= r; yy++) for (var xx = -r; xx <= r; xx++){ var d = Math.hypot(xx, yy); if (d > r + 0.3) continue; ctx.fillStyle = d > r - 0.7 ? '#7a5200' : (xx + yy < -1 ? '#fff3a8' : (xx + yy) % 3 === 0 ? '#e0a820' : '#ffd23a'); ctx.fillRect(Math.round(p[0] + xx * s), Math.round(p[1] + yy * s - r * s), s, s); }
    sparkle(p[0], p[1] - r * s, now, s); occlude(Math.round(p[0] - (r + 1) * s), Math.round(p[1] - (2 * r + 2) * s), (2 * r + 3) * s, (2 * r + 3) * s, t.x, t.y, pic.zAt(t.x, t.y)); }
  /* the rare things: a little pixel picture floating over a glow on the ground, so they read as special */
  function drawPix(t, now, rows, pal){ var z = pic.zAt(t.x, t.y) + 1.2 + Math.sin(now * 2.2 + t.x) * 0.18, p = scr(t.x, t.y, z), s = Math.max(2, Math.round(kk)), w = rows[0].length, h = rows.length;
    var shp = scr(t.x, t.y), gl = 0.25 + 0.15 * Math.sin(now * 3); ctx.fillStyle = 'rgba(255,240,170,' + gl.toFixed(2) + ')'; ctx.beginPath(); ctx.ellipse(shp[0], shp[1], 5 * s, 2 * s, 0, 0, 7); ctx.fill();
    var rx = Math.round(p[0] - w * s / 2), ry = Math.round(p[1] - h * s);
    for (var yy = 0; yy < h; yy++) for (var xx = 0; xx < w; xx++){ var ch = rows[yy][xx]; if (ch === '.') continue; ctx.fillStyle = pal[ch] || pal.r; ctx.fillRect(rx + xx * s, ry + yy * s, s, s); }
    sparkle(p[0], ry, now, s); occlude(rx, ry, w * s, h * s, t.x, t.y, pic.zAt(t.x, t.y)); }
  function sparkle(x, y, now, s){ var a = (Math.sin(now * 5) + 1) / 2; ctx.fillStyle = 'rgba(255,255,255,' + (0.4 + a * 0.6).toFixed(2) + ')'; var d = (3 + a * 3) * s;
    ctx.fillRect(Math.round(x - s / 2 + d), Math.round(y - d), s, s); ctx.fillRect(Math.round(x - s / 2 - d * 0.8), Math.round(y - d * 0.4), s, s); }

  // ---- the life around him (LIFE): seeded where it is placed, free running once it moves
  var life = LIFE[sp.theme] || {}, LR = rng(P.seed ^ 0x51f3), reduce = false; try{ reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){}
  function rr(a, b){ return a + LR() * (b - a); }
  var flyers = [], motes = [], ships = [], balloons = [], tumbles = [], ghosts = [], puffs = [], puffT = 0;
  function spawnFly(f, first){ var C = FLY_PAL[f.kind], a = LR() * 6.283, sp3 = rr(C.v[0], C.v[1]);
    if (C.circle){ f.cx = g.x + rr(-14, 14); f.cy = g.y + rr(-18, 10); f.r = rr(8, 13); f.a = a; f.w = (LR() < 0.5 ? -1 : 1) * sp3 / f.r; f.z = rr(C.z[0], C.z[1]); return; }
    var d = first ? rr(0, 26) : 34; f.x = g.x + Math.cos(a) * d; f.y = g.y + Math.sin(a) * d * 1.3; var b2 = a + Math.PI + rr(-0.7, 0.7);
    f.vx = Math.cos(b2) * sp3; f.vy = Math.sin(b2) * sp3; f.z = rr(C.z[0], C.z[1]); f.ph = LR() * 6; }
  if (life.fly) for (var lf = 0; lf < life.fly[1]; lf++){ var f0 = { kind:life.fly[0] }; spawnFly(f0, true); flyers.push(f0); }
  function moteZ(k){ return k === 'snow' || k === 'ash' ? rr(0, 18) : k === 'leaf' || k === 'petal' ? rr(2, 12) : k === 'ember' || k === 'spark' ? rr(0, 7) : k === 'dust' ? rr(0.2, 1.6) : rr(0.8, 3); }
  function spawnMote(m, first){ var k = m.k; m.x = g.x + rr(-26, 26); m.y = g.y + rr(-34, 22); m.z = first ? moteZ(k) : k === 'snow' || k === 'ash' ? 18 : k === 'leaf' || k === 'petal' ? rr(9, 13) : k === 'ember' || k === 'spark' ? 0 : moteZ(k);
    if (k === 'ember' && P.pools.length){ var lp = P.pools.filter(function(o){ return o.k === 'lava' && Math.hypot(o.x - g.x, o.y - g.y) < 45; }); if (lp.length && LR() < 0.7){ var o = lp[(LR() * lp.length) | 0], a = LR() * 6.283; m.x = o.x + Math.cos(a) * o.rx * 0.8; m.y = o.y + Math.sin(a) * o.ry * 0.8; } }
    m.ph = LR() * 6.283; m.vx = rr(-1, 1); m.vy = rr(-1, 1); m.life = 0; m.c = k === 'petal' ? ['#ffffff', '#f8c8dc', '#fff3a8'][(LR() * 3) | 0] : k === 'leaf' ? ['#e07a1e', '#c8461a', '#e8b02a', '#a8321e'][(LR() * 4) | 0] : k === 'spark' ? ['#2bf0ff', '#ff2bd6', '#ffe02b', '#7cff4a'][(LR() * 4) | 0] : k === 'butter' ? ['#ffd23a', '#ffffff', '#f48fb1', '#7ec8ff'][(LR() * 4) | 0] : null; }
  (life.mote ? (Array.isArray(life.mote[0]) ? life.mote : [life.mote]) : []).forEach(function(ms){ for (var lm = 0; lm < ms[1]; lm++){ var m0 = { k:ms[0] }; spawnMote(m0, true); motes.push(m0); } });
  if (life.ships && P.sea){ var lane = 0, dirS = LR() < 0.5 ? -1 : 1, span = P.b[3] - P.b[1] + 40;
    for (var ls = 0; ls < life.ships; ls++) ships.push({ x:lane, y0:P.b[1] - 20 + (ls / life.ships) * span + rr(-8, 8), dir:dirS, v:rr(2.2, 3), span:span, ph:LR() * 6 }); }
  if (life.balloons) for (var lb = 0; lb < life.balloons; lb++) balloons.push({ x:rr(P.b[0] + 6, P.b[2] - 6), y:rr(P.b[1] + 10, P.b[3] - 10), z:rr(9, 16), vx:rr(-0.7, 0.7), vy:rr(-0.5, 0.5), ph:LR() * 6, c:lb % BALLOON_COLS.length });
  if (life.tumble) for (var lt = 0; lt < life.tumble; lt++) tumbles.push({ x:g.x - 30 - lt * 22, y:g.y + rr(-14, 6), v:rr(4, 6.5), ph:LR() * 6 });
  if (life.ghosts) for (var lg = 0; lg < life.ghosts; lg++){ var gy3 = P.L * (0.3 + 0.4 * lg / Math.max(1, life.ghosts - 1)) + rr(-10, 10), gs = LR() < 0.5 ? -1 : 1; ghosts.push({ x:P.cx(gy3) + gs * rr(7, 13), y:gy3, ax:P.cx(gy3) + gs * rr(7, 13), ay:gy3, ph:LR() * 6 }); }
  var smokeSrc = life.smoke ? P.things.filter(function(t){ return t.k === 'vent'; }).map(function(t){ return { x:t.x, y:t.y, z:2.4, big:true }; }).concat(P.pools.filter(function(o){ return o.k === 'lava'; }).map(function(o){ return { x:o.x, y:o.y, z:0.2 }; })) : [];
  function lifeStep(dt){ if (reduce) return;
    flyers.forEach(function(f){ var C = FLY_PAL[f.kind];
      if (C.circle){ f.a += f.w * dt; f.x = f.cx + Math.cos(f.a) * f.r; f.y = f.cy + Math.sin(f.a) * f.r * 0.8; f.vx = -Math.sin(f.a) * f.w; f.vy = Math.cos(f.a) * f.w; if (Math.hypot(f.cx - g.x, f.cy - g.y) > 40) spawnFly(f); return; }
      if (C.flit){ f.vx += Math.sin(f.ph + performance.now() / 260) * 9 * dt; f.vy += Math.cos(f.ph * 1.7 + performance.now() / 330) * 9 * dt; }
      f.x += f.vx * dt; f.y += f.vy * dt; if (Math.hypot(f.x - g.x, f.y - g.y) > 46) spawnFly(f); });
    motes.forEach(function(m){ var k = m.k; m.life += dt;
      if (k === 'snow' || k === 'ash'){ m.z -= (k === 'ash' ? 1.6 : 3.2) * dt; m.x += (Math.sin(m.ph + m.life * 1.3) * 0.8 + 0.6) * dt; if (m.z <= pic.zAt(m.x, m.y)) spawnMote(m); }
      else if (k === 'leaf' || k === 'petal'){ m.z -= 1.5 * dt; m.x += Math.sin(m.ph + m.life * 2.2) * 2.2 * dt + 0.8 * dt; if (m.z <= pic.zAt(m.x, m.y) + 0.1){ if (m.life > 40) spawnMote(m); else m.z = pic.zAt(m.x, m.y) + 0.1; } }
      else if (k === 'ember' || k === 'spark'){ m.z += (k === 'ember' ? 2.6 : 1.8) * dt; m.x += Math.sin(m.ph + m.life * 3) * 0.6 * dt; if (m.z > 8 + (m.ph % 3)) spawnMote(m); }
      else if (k === 'dust'){ m.x += 3.5 * dt; m.z = 0.3 + Math.abs(Math.sin(m.ph + m.life * 1.5)) * 1.2; if (m.life > 9) spawnMote(m); }
      else { m.x += Math.sin(m.ph + m.life * 0.9) * (k === 'butter' ? 1.8 : 0.7) * dt; m.y += Math.cos(m.ph * 1.3 + m.life * 0.7) * (k === 'butter' ? 1.4 : 0.6) * dt; m.z = Math.max(0.6, m.z + Math.sin(m.life * 2 + m.ph) * 0.6 * dt); }
      if (Math.abs(m.x - g.x) > 32 || m.y - g.y > 30 || g.y - m.y > 40) spawnMote(m); });
    balloons.forEach(function(b2){ b2.x += b2.vx * dt; b2.y += b2.vy * dt; if (b2.x < P.b[0] + 4 || b2.x > P.b[2] - 4) b2.vx = -b2.vx; if (b2.y < P.b[1] + 6 || b2.y > P.b[3] - 6) b2.vy = -b2.vy; });
    tumbles.forEach(function(t){ t.x += t.v * dt; t.ph += t.v * dt * 1.6; if (t.x > g.x + 34){ t.x = g.x - 34 - LR() * 20; t.y = g.y + rr(-16, 8); } });
    ghosts.forEach(function(q){ q.ph += dt; q.x = q.ax + Math.sin(q.ph * 0.5) * 4; q.y = q.ay + Math.sin(q.ph * 0.33) * 3; });
    if (smokeSrc.length){ puffT -= dt; if (puffT <= 0){ puffT = 0.35; smokeSrc.forEach(function(s0){ if (Math.hypot(s0.x - g.x, s0.y - g.y) < 50 && (s0.big || LR() < 0.35)) puffs.push({ x:s0.x + rr(-0.6, 0.6), y:s0.y + rr(-0.4, 0.4), z:s0.z + pic.zAt(s0.x, s0.y), r:s0.big ? 0.9 : 0.6, t:0 }); }); }
      puffs = puffs.filter(function(q){ q.t += dt; q.z += 1.8 * dt; q.x += 0.5 * dt; q.r += 0.55 * dt; return q.t < 4.5; }); } }
  function px2(ft){ return kk * Math.max(1, Math.round(ft / ART)); }   // a size in feet, as whole scene pixels
  function sq(x, y, z, w, col, a){ var p = scr(x, y, z), s = px2(w); if (a != null) ctx.globalAlpha = a; ctx.fillStyle = col; ctx.fillRect(Math.round(p[0] - s / 2), Math.round(p[1] - s / 2), s, s); if (a != null) ctx.globalAlpha = 1; }
  function pixAt(rows, pal, x, y, z, sz, flip, a){ var p = scr(x, y, z), s = px2(sz), w = rows[0].length, h = rows.length, rx = Math.round(p[0] - w * s / 2), ry = Math.round(p[1] - h * s / 2);
    if (a != null) ctx.globalAlpha = a; for (var yy = 0; yy < h; yy++) for (var xx = 0; xx < w; xx++){ var ch = rows[yy][flip ? w - 1 - xx : xx]; if (ch === '.') continue; ctx.fillStyle = pal[ch] || pal.o; ctx.fillRect(rx + xx * s, ry + yy * s, s, s); }
    if (a != null) ctx.globalAlpha = 1; return [rx, ry, w * s, h * s]; }
  function shadowAt(x, y, r, a){ var p = scr(x, y); ctx.fillStyle = 'rgba(0,0,0,' + a + ')'; ctx.beginPath(); ctx.ellipse(p[0], p[1], r * kk / ART, r * 0.4 * kk / ART, 0, 0, 7); ctx.fill(); }
  // what stands on the ground or the sea is sorted in with everything else; what flies is drawn over it all
  function lifeGround(ds){ ships.forEach(function(s1, i){ var yS = shipY(s1); ds.push({ k:'ship', o:s1, x:shipX(yS), y:yS }); }); tumbles.forEach(function(t){ ds.push({ k:'tumble', o:t, x:t.x, y:t.y }); }); ghosts.forEach(function(q){ ds.push({ k:'ghost', o:q, x:q.x, y:q.y }); }); }
  function shipX(y){ return P.sea.side * Math.min((sp.halfW || HALFW) - 2.6, P.seaEdge(y) + 3); }
  function shipY(s1){ var tt = performance.now() / 1000, u = ((s1.y0 + s1.dir * s1.v * tt) - (P.b[1] - 20)) % s1.span; if (u < 0) u += s1.span; return P.b[1] - 20 + u; }
  function drawLifeThing(t, tsec){ var o = t.o;
    if (t.k === 'ship'){ var spr = prop('ship2:' + o.dir, shipFn(o.dir), 5, 14, 11.5), zb = -0.7 + Math.sin(tsec * 1.2 + o.ph) * 0.12;
      for (var fb2 = 0; fb2 < 5; fb2++){ var fa = tsec * 4 + fb2 * 1.3; sq(t.x + Math.sin(fa) * 1.3, t.y + o.dir * (5.4 + Math.abs(Math.cos(fa)) * 0.8), -0.66, 0.35, '#ffffff', 0.85); }
      for (var w2 = 1; w2 < 7; w2++){ var wy = t.y - o.dir * (6 + w2 * 1.6), wx = t.x + Math.sin(tsec * 3 + w2) * 0.6 * w2 * 0.3; sq(wx - 0.8 - w2 * 0.3, wy, -0.68, 0.4, '#ffffff', 0.85 - w2 * 0.1); sq(wx + 0.8 + w2 * 0.3, wy, -0.68, 0.4, '#ffffff', 0.85 - w2 * 0.1); }
      drawSprite(spr, t.x, t.y, zb, 1, true); }   // long on the water: a flat cut-out's occlusion would let the sea in front eat its bow
    else if (t.k === 'tumble'){ var z0 = pic.zAt(t.x, t.y), bz = Math.abs(Math.sin(o.ph * 0.9)) * 1.1; shadowAt(t.x, t.y, 1.1, 0.18);
      for (var q = 0; q < 14; q++){ var a = o.ph + q * 0.449, rr2 = q % 2 ? 1.2 : 0.8; sq(t.x + Math.cos(a) * rr2, t.y, z0 + 1.2 + bz + Math.sin(a) * rr2, 0.3, q % 3 ? '#a8864e' : '#7a5a30'); } }
    else if (t.k === 'ghost'){ var gz = pic.zAt(t.x, t.y) + 2 + Math.sin(tsec * 1.6 + o.ph) * 0.4; shadowAt(t.x, t.y, 1, 0.12);
      pixAt(PIX_GHOST, { g:'#eef2ff', o:'#eef2ff' }, t.x, t.y, gz, 0.36, Math.sin(o.ph * 0.5) < 0, 0.5 + 0.15 * Math.sin(tsec * 2 + o.ph)); } }
  function lifeAir(tsec){
    if (reduce) return;
    puffs.forEach(function(q){ var p = scr(q.x, q.y, q.z), a = 0.38 * (1 - q.t / 4.5); ctx.fillStyle = 'rgba(70,62,66,' + a.toFixed(3) + ')'; ctx.beginPath(); ctx.arc(p[0], p[1], q.r * kk * 1.4, 0, 7); ctx.fill(); });
    balloons.forEach(function(b2){ var cs = BALLOON_COLS[b2.c], spr = prop('balloon:' + b2.c, balloonFn(cs[0], cs[1]), 6.4, 6.4, 16); shadowAt(b2.x, b2.y, 2.4, 0.1); drawSprite(spr, b2.x, b2.y, b2.z + Math.sin(tsec * 0.8 + b2.ph) * 0.6); });
    motes.forEach(function(m){ var k = m.k, z = m.z + (k === 'leaf' || k === 'petal' || k === 'ash' || k === 'snow' || k === 'ember' || k === 'spark' || k === 'dust' ? 0 : pic.zAt(m.x, m.y));
      if (k === 'snow') sq(m.x, m.y, z, 0.3, '#ffffff', 0.95);
      else if (k === 'ash') sq(m.x, m.y, z, 0.3, '#9a9094', 0.8);
      else if (k === 'ember') sq(m.x, m.y, z, 0.32, m.life * 5 % 1 < 0.5 ? '#ffb43a' : '#ff5a1a', Math.max(0, 1 - m.z / 9));
      else if (k === 'spark') sq(m.x, m.y, z, 0.3, m.c, (Math.sin(m.life * 9 + m.ph) + 1) / 2);
      else if (k === 'leaf' || k === 'petal') sq(m.x, m.y, z, k === 'leaf' ? 0.38 : 0.28, m.c);
      else if (k === 'dust') sq(m.x, m.y, z, 0.22, '#f0d8b0', 0.7);
      else if (k === 'firefly'){ var gl = Math.max(0, Math.sin(m.life * 2.2 + m.ph)); if (gl > 0.05){ sq(m.x, m.y, z, 0.9, 'rgba(220,255,120,' + (gl * 0.35).toFixed(2) + ')'); sq(m.x, m.y, z, 0.3, '#f4ff9a', gl); } }
      else if (k === 'butter') pixAt(PIX_BUTTER[(Math.floor(m.life * 9 + m.ph) % 2)], { w:m.c, b:'#2a2228', o:m.c }, m.x, m.y, z, 0.24, false); });
    flyers.forEach(function(f){ var C = FLY_PAL[f.kind], fr = PIX_FLY[C.base][Math.floor(tsec * (f.kind === 'vulture' ? 3 : 8) + (f.ph || 0)) % 2], gz = pic.zAt(f.x, f.y);
      shadowAt(f.x + 1, f.y + 1, 0.9 * C.sz, 0.1); pixAt(fr, C, f.x, f.y, gz + f.z, C.sz * 0.28, f.vx < 0); }); }

  // ---- input: a stick under the thumb, or the keys
  var ui = document.createElement('div'); ui.className = 'pp-tui'; ui.innerHTML = '<div class="pp-stick" data-stick><i></i></div><div class="pp-way" data-way><i></i><b></b></div><div class="pp-pin" data-pin><b></b><i></i></div>' +
    '<div class="pp-thud"><span data-coins>+0</span><span data-chest></span><span data-gold></span></div><div class="pp-rbar"><button class="pp-rb pp-talkb" data-talk hidden></button><button class="pp-rb" data-auto>Auto walk</button><button class="pp-rb" data-skip></button></div><div class="pp-rhint" data-hint></div><div class="pp-bub" data-bub hidden></div>';
  box.appendChild(ui);
  var stick = ui.querySelector('[data-stick]'), knob = stick.firstChild, way = ui.querySelector('[data-way]'), pin = ui.querySelector('[data-pin]'), bubEl = ui.querySelector('[data-bub]'), hint = ui.querySelector('[data-hint]');
  var coarse = false; try{ coarse = matchMedia('(pointer: coarse)').matches; }catch(e){}
  hint.textContent = coarse ? 'Drag anywhere to walk' : 'Drag, or use the arrow keys, to walk';
  ui.querySelector('[data-skip]').textContent = api.skipLabel || 'Skip';
  var auto = false, stickV = [0, 0], keys = {}, drag = null, SR = 46;
  function setAuto(on){ auto = on; ui.querySelector('[data-auto]').classList.toggle('on', on); if (on) hint.classList.add('gone'); }
  ui.querySelector('[data-auto]').onclick = function(){ setAuto(!auto); };
  ui.querySelector('[data-skip]').onclick = function(){ if (alive) api.skip(); };
  var KM = { ArrowUp:'u', KeyW:'u', ArrowDown:'d', KeyS:'d', ArrowLeft:'l', KeyA:'l', ArrowRight:'r', KeyD:'r' };
  function kd(e){ var c = KM[e.code]; if (!c || !alive) return; keys[c] = 1; setAuto(false); hint.classList.add('gone'); e.preventDefault(); }
  function ku(e){ var c = KM[e.code]; if (c) keys[c] = 0; }
  function pdn(e){ if (!alive || e.target.closest('button')) return; e.preventDefault(); var r = box.getBoundingClientRect();
    drag = { id:e.pointerId, x:e.clientX, y:e.clientY }; stick.style.left = (e.clientX - r.left) + 'px'; stick.style.top = (e.clientY - r.top) + 'px'; stick.classList.add('on'); knob.style.transform = ''; setAuto(false); hint.classList.add('gone'); }
  function pmv(e){ if (!drag || e.pointerId !== drag.id) return; var dx = e.clientX - drag.x, dy = e.clientY - drag.y, Ln = Math.hypot(dx, dy), m = Math.min(1, Ln / SR);
    stickV = Ln > 4 ? [dx / Ln * m, dy / Ln * m] : [0, 0]; knob.style.transform = 'translate(' + (stickV[0] * SR).toFixed(1) + 'px,' + (stickV[1] * SR).toFixed(1) + 'px)'; }
  function pup(e){ if (!drag || (e && e.pointerId != null && e.pointerId !== drag.id)) return; drag = null; stickV = [0, 0]; stick.classList.remove('on'); stick.style.left = stick.style.top = ''; knob.style.transform = ''; }
  box.addEventListener('pointerdown', pdn); window.addEventListener('pointermove', pmv); window.addEventListener('pointerup', pup); window.addEventListener('pointercancel', pup); window.addEventListener('blur', pup);
  window.addEventListener('keydown', kd, true); window.addEventListener('keyup', ku, true);

  function along(x, y){ var best = 1e9, s = 0, pp = P.path; for (var i = 0; i < pp.length - 1; i++){ var a = pp[i], c = pp[i + 1], vx = c[0] - a[0], vy = c[1] - a[1], L2 = vx * vx + vy * vy || 1,
      u = Math.max(0, Math.min(1, ((x - a[0]) * vx + (y - a[1]) * vy) / L2)), d = Math.hypot(a[0] + vx * u - x, a[1] + vy * u - y); if (d < best){ best = d; s = P.cum[i] + u * Math.sqrt(L2); } } return s; }
  function pathAtS(s){ var pp = P.path, cm = P.cum; for (var i = 0; i < pp.length - 1; i++) if (cm[i + 1] >= s){ var u = (s - cm[i]) / ((cm[i + 1] - cm[i]) || 1); return [pp[i][0] + (pp[i + 1][0] - pp[i][0]) * u, pp[i][1] + (pp[i + 1][1] - pp[i][1]) * u]; } return pp[pp.length - 1]; }
  var goalS = P.cum[P.cum.length - 1];

  function say(txt, ms){ bubble = { txt:txt, until:performance.now() + (ms || 3200) }; bubEl.textContent = txt; bubEl.hidden = false; }
  function burst(x, y, z, cols, n){ for (var i = 0; i < n; i++){ var a = Math.random() * 6.28, sp2 = 2 + Math.random() * 4; parts.push({ x:x, y:y, z:z, vx:Math.cos(a) * sp2, vy:Math.sin(a) * sp2 * 0.6, vz:3 + Math.random() * 4, c:cols[i % cols.length], t:0 }); } }
  function hudCoins(){ ui.querySelector('[data-coins]').textContent = '+' + coinsGot; }
  function hudChests(){ var n = chests.filter(function(t){ return t.done; }).length; ui.querySelector('[data-chest]').textContent = chests.length ? 'Chests ' + n + '/' + chests.length : ''; }
  function hudGold(){ var gd = api.golden ? api.golden() : null; ui.querySelector('[data-gold]').textContent = gd ? '● ' + gd.have + '/' + gd.total : ''; }
  hudGold(); hudChests();
  /* THE GREETER. They wait where the plan put them until you come within reach, then walk up to you, the
     way a board game host does, and talk: a box at the foot of the screen, their face in it, the words typed
     out, a tap for the next page. Walking is paused while they talk. After that they stay by the path, and
     the Talk button plays it again whenever you are beside them. */
  var greet = sp.greet, hs = null, hostIt = items.filter(function(t){ return t.k === 'host'; })[0], talkB = ui.querySelector('[data-talk]'), dlg = null;
  if (greet && hostIt){ hs = { x:hostIt.x, y:hostIt.y, ph:greet.met ? 'idle' : 'wait', face:[0, 1], dist:0, moving:false, at:performance.now() + (api.greetDelay || 0) }; talkB.textContent = 'Talk to ' + greet.name;
    try{ var G0 = window.RTT_G3D; if (G0 && G0.warmAim){ var a0 = Math.atan2(g.x - hs.x, -(g.y - hs.y)) * 180 / Math.PI; G0.warmAim(greet.look, a0, 'walk'); G0.warmAim(greet.look, 180, 'walk'); } }catch(e){} }
  function hostFrame(){ var G = window.RTT_G3D; if (!G || !G.frame || !hs) return null; var i = hs.moving ? Math.floor(hs.dist / STRIDE * 8) % 8 : 8;
    try{ return G.frame(greet.look, Math.atan2(hs.face[0], -hs.face[1]) * 180 / Math.PI, 'walk', i); }catch(e){ return null; } }
  function talk(){ if (!hs || dlg) return; hs.ph = 'talk'; hs.moving = false; paused = true; setAuto(false); pup(); keys = {}; g.vx = g.vy = 0;
    hs.face = [g.x - hs.x, g.y - hs.y]; g.face = [hs.x - g.x, hs.y - g.y]; talkB.hidden = true;
    var pages = greet.lines || [], pg = 0, typed = 0, tm = null;
    dlg = document.createElement('div'); dlg.className = 'pp-gd'; dlg.style.setProperty('--gc', greet.col || '#F1D04A');
    dlg.innerHTML = '<div class="pp-gdbox"><div class="pp-gdp"><canvas width="64" height="64"></canvas></div><div class="pp-gdn"><b></b><i></i></div><p aria-live="polite"></p><span class="pp-gdm">▼</span><button class="pp-gdx" data-gdx>Skip</button></div>';
    dlg.querySelector('.pp-gdn b').textContent = greet.name; dlg.querySelector('.pp-gdn i').textContent = greet.role || ''; ui.appendChild(dlg);
    var pEl = dlg.querySelector('p'), mEl = dlg.querySelector('.pp-gdm');
    // their face: the profile picture of their look, as the player's own avatar is drawn; the 3D model if the page has none
    var pu = api.portrait ? api.portrait(greet.look) : ''; if (pu){ var pp0 = dlg.querySelector('.pp-gdp'); pp0.innerHTML = ''; pp0.classList.add('pic'); pp0.style.backgroundImage = 'url(' + pu + ')'; }
    else (function face(){ var f = null; try{ f = window.RTT_G3D.frame(greet.look, 180, 'walk', 8); }catch(e){} if (!f || !f.url) return;
      var im = new Image(); im.onload = function(){ var c = dlg && dlg.querySelector('canvas'); if (!c) return; var x2 = c.getContext('2d'), fs = f.fig || f.H * 0.6, sz = fs * 0.62;
        x2.imageSmoothingEnabled = false; x2.clearRect(0, 0, 64, 64); x2.drawImage(im, f.ball[0] - sz / 2, f.ball[1] - fs * 1.06, sz, sz, 0, 0, 64, 64); }; im.src = f.url; })();
    function show(){ clearInterval(tm); typed = 0; var t = pages[pg] || ''; pEl.textContent = ''; mEl.classList.remove('on');
      tm = setInterval(function(){ typed += 2; pEl.textContent = t.slice(0, typed); if (typed >= t.length){ clearInterval(tm); tm = null; mEl.classList.add('on'); } }, 28);
      api.sfx && api.sfx('blip'); }
    function done(){ clearInterval(tm); if (dlg){ dlg.remove(); dlg = null; } window.removeEventListener('keydown', dk, true); hs.ph = 'idle'; paused = false; if (api.met) api.met(greet.theme); greet.met = true; }
    function next(){ var t = pages[pg] || ''; if (tm){ clearInterval(tm); tm = null; pEl.textContent = t; mEl.classList.add('on'); return; } pg++; if (pg >= pages.length) return done(); show(); }
    function dk(e){ if (e.key === 'Enter' || e.key === ' ' || e.code === 'Space'){ e.preventDefault(); e.stopPropagation(); next(); } }
    dlg.addEventListener('pointerdown', function(e){ e.stopPropagation(); if (e.target.closest('[data-gdx]')) return; e.preventDefault(); next(); });
    dlg.querySelector('[data-gdx]').onclick = function(e){ e.stopPropagation(); done(); };
    dlg.kill = function(){ clearInterval(tm); if (dlg){ dlg.remove(); dlg = null; } window.removeEventListener('keydown', dk, true); };
    window.addEventListener('keydown', dk, true); show(); }
  talkB.onclick = function(){ if (hs && hs.ph === 'idle') talk(); };
  function hostStep(dt){ if (!hs) return; var dx = g.x - hs.x, dy = g.y - hs.y, d = Math.hypot(dx, dy);
    if (hs.ph === 'wait' && d < 16 && performance.now() >= hs.at && !(gate && (!gate.open || g.y > P.gate.y - 0.5))){ hs.ph = 'come'; paused = true; setAuto(false); pup(); keys = {}; g.vx = g.vy = 0; }
    if (hs.ph === 'come'){ g.face = [-dx, -dy]; if (d > 3.2){ var v = Math.min(5.2 * dt, d - 3.2); hs.x += dx / d * v; hs.y += dy / d * v; hs.dist += v; hs.moving = true; hs.face = [dx, dy]; } else talk(); }
    else if (hs.ph === 'idle'){ hs.moving = false; if (d < 7) hs.face = [dx, dy]; }
    talkB.hidden = !(hs.ph === 'idle' && d < 3.6); }
  function take(t, now){ var z = pic.zAt(t.x, t.y);
    if (t.k === 'coin'){ t.done = true; coinsGot += COIN_V; hudCoins(); burst(t.x, t.y, z + 1.2, ['#ffd23a', '#fff3a8'], 6); pick('coin', t.id, COIN_V); api.sfx && api.sfx('coin'); }
    else if (t.k === 'chest'){ t.done = true; t.openAt = now; burst(t.x, t.y, z + 1.4, ['#ffd23a', '#fff3a8', '#ffffff'], 14); pick('chest', t.id, 0); hudChests(); api.sfx && api.sfx('coin');
      // the coins fly out of the lid in an arc and land where the plan put them
      var cs = items.filter(function(c){ return c.k === 'coin' && c.ch === t; });
      cs.forEach(function(c, i){ c.out = true; c.fly = { t0:now + i * 0.06, dur:0.55 + (i % 3) * 0.08, x0:t.x, y0:t.y, z0:z + 1.6 }; });
      say(cs.length ? 'A chest. ' + cs.length + ' coins. Walk over them to pick them up.' : 'A chest.', 2800); }
    else if (t.k === 'key'){ t.done = true; lockOpen = true; burst(t.x, t.y, z + 1.3, ['#ffd23a', '#ffffff'], 10); pick('key', t.id, 0); say('A key. The gate to the clearing is open.'); }
    else if (t.k === 'golden'){ t.done = true; burst(t.x, t.y, z + 1, ['#ffd23a', '#fff3a8', '#ffffff'], 24); var msg = pick('golden', t.id, 0); hudGold(); say(msg || 'A golden ball.', 3600); }
    else if (t.k === 'life'){ t.done = true; burst(t.x, t.y, z + 1.2, ['#e5483a', '#ff9d8a', '#ffffff'], 18); say(pick('life', t.id, 0) || 'A spare life.', 3600); }
    else if (t.k === 'trinket'){ t.done = true; burst(t.x, t.y, z + 1.2, [t.col || '#b48cff', '#ffffff', '#ffd23a'], 22); say(pick('trinket', t.id, 0) || ('Found: ' + t.name + '.'), 3800); }
    else if (t.k === 'part'){ t.done = true; burst(t.x, t.y, z + 1.2, ['#cfd8e2', '#ffffff', '#ffd23a'], 18); say(pick('part', t.id, 0) || ('A putter part: ' + t.name + '.'), 3800); }
    else if (t.k === 'brk'){ t.done = true; var k = brkKind(t), cols = k === 'ice' ? ['#a8dcf4', '#e2f6ff'] : k === 'neoncube' ? ['#2bf0ff', '#1a1430'] : k === 'pumpkin' ? ['#e8761f', '#d0621a'] : k === 'hay' ? ['#e2bc5c', '#c8a04a'] : k === 'pot' ? ['#b8643a', '#f0e0b0'] : ['#c08a4e', '#8a5a2a'];
      burst(t.x, t.y, z + 0.8, cols, 14); if ((found.b || []).indexOf(t.id) < 0){ (found.b = found.b || []).push(t.id); coinsGot += 1; hudCoins(); pick('brk', t.id, 1); burst(t.x, t.y, z + 1, ['#ffd23a'], 3); } else pick('brk', t.id, 0); } }

  var last = performance.now(), lastSafe = 0, nearNpc = false;
  function step(){ if (!alive) return; requestAnimationFrame(step);
    var now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now; var tsec = now / 1000;
    // where the stick asks him to go, on the screen, made a direction on the ground: up the screen is further than it looks
    var sx = 0, sy = 0;
    if (!paused){
      if (auto){ var s0 = along(g.x, g.y), tgt = pathAtS(Math.min(goalS, s0 + 4)); if (gate && !gate.open && s0 < goalS){ var gs = along(P.gate.x, P.gate.y); if (s0 > gs - 3) tgt = [g.x, g.y]; }
        var ax = tgt[0] - g.x, ay = tgt[1] - g.y, Ln = Math.hypot(ax, ay * SE); if (Ln > 0.3){ sx = ax / Ln; sy = ay * SE / Ln; } }
      else { sx = stickV[0] + (keys.r ? 1 : 0) - (keys.l ? 1 : 0); sy = stickV[1] + (keys.d ? 1 : 0) - (keys.u ? 1 : 0); var m = Math.hypot(sx, sy); if (m > 1){ sx /= m; sy /= m; } } }
    var o = P.poolAt(g.x, g.y), ice = o && o.k === 'ice', slow = o && o.k === 'slow' ? 0.5 : 1, mag = Math.hypot(sx, sy), sp2 = SPEED * slow;
    var tvx, tvy;
    if (mag > 0.05){ var wx = sx, wy = sy / SE, wl = Math.hypot(wx, wy); tvx = wx / wl * sp2 * mag; tvy = wy / wl * sp2 * mag; } else { tvx = 0; tvy = 0; }
    var acc = ice ? 2.2 : 26; g.vx += (tvx - g.vx) * Math.min(1, acc * dt); g.vy += (tvy - g.vy) * Math.min(1, acc * dt);
    var nx = g.x + g.vx * dt, ny = g.y + g.vy * dt, moved = 0;
    if (!blocked(nx, ny)){ moved = Math.hypot(nx - g.x, ny - g.y); g.x = nx; g.y = ny; }
    else if (!blocked(nx, g.y)){ moved = Math.abs(nx - g.x); g.x = nx; g.vy *= 0.5; }
    else if (!blocked(g.x, ny)){ moved = Math.abs(ny - g.y); g.y = ny; g.vx *= 0.5; }
    else { g.vx = 0; g.vy = 0; }
    hostStep(dt);
    lifeStep(dt);
    var spd = Math.hypot(g.vx, g.vy); g.moving = moved > 0.002 && spd > 0.4; if (spd > 0.4) g.face = [g.vx, g.vy]; g.dist += moved;
    if (moved > 0.5) hint.classList.add('gone');
    // lava sends him back to the last safe ground
    var o2 = P.poolAt(g.x, g.y);
    if (o2 && o2.k === 'lava'){ g.x = g.safe[0]; g.y = g.safe[1]; g.vx = g.vy = 0; flash = 1; say('Too hot. Back you go.', 1800); }
    else if (!o2 && now - lastSafe > 400){ g.safe = [g.x, g.y]; lastSafe = now; }
    // picking things up, and walking into them
    for (var i = 0; i < items.length; i++){ var t = items[i]; if (t.done) continue; var d = Math.hypot(t.x - g.x, t.y - g.y);
      if (t.k === 'coin' && (!t.out || (t.fly && tsec < t.fly.t0 + t.fly.dur))) continue;
      if ((t.k === 'coin' || t.k === 'golden' || t.k === 'key' || t.k === 'life' || t.k === 'trinket' || t.k === 'part') && d < 1.3) take(t, tsec);
      else if (t.k === 'chest' && d < 2.3 && (lockOpen || !P.fence || !t.main)) take(t, tsec);
      else if (t.k === 'brk' && d < 1.5 && spd > 1.5) take(t, tsec); }
    // the local talks when he walks up
    var npc = items.filter(function(t){ return t.k === 'npc'; })[0];
    if (npc){ var dn = Math.hypot(npc.x - g.x, npc.y - g.y); if (dn < 3.4 && !nearNpc){ nearNpc = true; var ls = api.lines ? api.lines(kitOf(npc.th).who) : []; say(ls.join(' '), 5200); } else if (dn > 5) nearNpc = false; }
    if (P.fence && !lockOpen){ var df = Math.hypot(g.x - P.lockGate.x, g.y - P.lockGate.y); if (df < 2.4 && (!bubble || now > bubble.until)) say('Locked. The key is somewhere on this trail.', 2200); }
    // the door between worlds
    if (gate && !gate.asked && Math.abs(g.y - P.gate.y) < 3.2 && Math.abs(g.x - P.gate.x) < PW + 3){ gate.asked = true; paused = true; var wasAuto = auto; setAuto(false); g.vx = g.vy = 0;
      api.door(function(open){ gate.open = open; paused = false; if (open && wasAuto) setAuto(true); }); }
    if (gate && gate.asked && !gate.open && Math.abs(g.y - P.gate.y) > 7) gate.asked = false;
    // the arch: the hole
    if (g.y < 1.2 && Math.abs(g.x - P.cx(0)) < 3.6 && !ended){ ended = true; api.arrive(); return; }
    if (bubble && now > bubble.until){ bubble = null; bubEl.hidden = true; }
    camAim(false);
    draw(tsec, dt);
  }
  function draw(tsec, dt){
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false; ctx.fillStyle = kitOf(sp.theme).g[0]; ctx.fillRect(0, 0, W, H);
    ctx.drawImage(pic.cv, ox, oy, pic.cv.width * kk, pic.cv.height * kk);
    // everything that moves, far to near
    var ds = [];
    items.forEach(function(t){ if (t.k === 'host') return; if (t.k === 'coin' && !t.out) return; if (t.done && t.k !== 'chest' && t.k !== 'brk') return; if (t.k === 'brk' && t.done) return; ds.push(t); });
    if (P.gate) ds.push({ k:'gate', x:P.gate.x, y:P.gate.y + 0.01 });
    if (P.fence) ds.push({ k:'lock', x:P.lockGate.x, y:P.lockGate.y });
    ds.push({ k:'me', x:g.x, y:g.y });
    if (hs) ds.push({ k:'hostfig', x:hs.x, y:hs.y });
    if (!reduce) lifeGround(ds);
    ds.sort(function(a, c){ return a.y - c.y; });
    for (var i = 0; i < ds.length; i++){ var t = ds[i];
      if (t.k === 'me') drawMe(tsec);
      else if (t.k === 'coin') drawCoin(t, tsec);
      else if (t.k === 'key') drawKey(t, tsec);
      else if (t.k === 'golden') drawGolden(t, tsec);
      else if (t.k === 'life') drawPix(t, tsec, PIX_HEART, { r:'#e5483a', h:'#ff9d8a', o:'#6a1410' });
      else if (t.k === 'trinket') drawPix(t, tsec, PIX_GEM, { r:t.col || '#b48cff', h:'#ffffff', o:'#2a1a40' });
      else if (t.k === 'part') drawPix(t, tsec, PIX_PART, { r:'#cfd8e2', h:'#ffffff', o:'#2e3640', g:'#ffd23a' });
      else if (t.k === 'chest') drawSprite(t.done ? SPR.chest1 : SPR.chest0, t.x, t.y, pic.zAt(t.x, t.y));
      else if (t.k === 'brk') drawSprite(brkSprite(t), t.x, t.y, pic.zAt(t.x, t.y));
      else if (t.k === 'npc') drawFigure(npcFrame(t), t.x, t.y);
      else if (t.k === 'ship' || t.k === 'tumble' || t.k === 'ghost') drawLifeThing(t, tsec);
      else if (t.k === 'hostfig'){ var hp = scr(t.x, t.y); ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(hp[0], hp[1], 5 * kk, 2 * kk, 0, 0, 7); ctx.fill(); drawFigure(hostFrame(), t.x, t.y);
        if (hs.ph === 'wait'){ var ep = scr(t.x, t.y, pic.zAt(t.x, t.y) + GH + 1.4 + Math.sin(tsec * 4) * 0.25), es = Math.max(2, Math.round(kk)); ctx.fillStyle = '#3a2a14'; ctx.fillRect(Math.round(ep[0] - 2 * es), Math.round(ep[1] - 7 * es), 4 * es, 9 * es); ctx.fillRect(Math.round(ep[0] - 2 * es), Math.round(ep[1] + 3 * es), 4 * es, 4 * es);
          ctx.fillStyle = '#ffd24a'; ctx.fillRect(Math.round(ep[0] - es), Math.round(ep[1] - 6 * es), 2 * es, 7 * es); ctx.fillRect(Math.round(ep[0] - es), Math.round(ep[1] + 4 * es), 2 * es, 2 * es); } }
      else if (t.k === 'gate') drawSprite(gate && gate.open ? SPR.gate1 : SPR.gate0, t.x, P.gate.y, pic.zAt(t.x, P.gate.y));
      else if (t.k === 'lock'){ var ls = lockOpen ? SPR.lock1 : SPR.lock0; if (ls){ ctx.save(); drawSprite(ls, t.x, t.y, pic.zAt(t.x, t.y)); ctx.restore(); } } }
    lifeAir(tsec);
    // bits that fly
    var s = Math.max(2, Math.round(kk * 0.8));
    parts = parts.filter(function(q){ q.t += dt; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt; q.vz -= 18 * dt; if (q.z < pic.zAt(q.x, q.y)){ q.z = pic.zAt(q.x, q.y); q.vz *= -0.3; q.vx *= 0.6; q.vy *= 0.6; }
      var p = scr(q.x, q.y, q.z); ctx.fillStyle = q.c; ctx.globalAlpha = Math.max(0, 1 - q.t / 1.1); ctx.fillRect(Math.round(p[0]), Math.round(p[1]), s, s); ctx.globalAlpha = 1; return q.t < 1.1; });
    if (flash > 0){ ctx.fillStyle = 'rgba(255,120,40,' + (flash * 0.5).toFixed(2) + ')'; ctx.fillRect(0, 0, W, H); flash = Math.max(0, flash - dt * 2); }
    waypoint();
    if (bubble){ var bp = scr(g.x, g.y, pic.zAt(g.x, g.y) + GH + 0.6); var npc = items.filter(function(t){ return t.k === 'npc'; })[0];
      if (nearNpc && npc) bp = scr(npc.x, npc.y, pic.zAt(npc.x, npc.y) + GH + 0.6);
      bubEl.style.left = (bp[0] / dpr) + 'px'; bubEl.style.top = (bp[1] / dpr) + 'px'; }
  }
  var lastFace = null;
  // the frame asked for if it is drawn, else any frame of this facing that is, else draw it now (once a facing)
  function drawMe(tsec){ var h = api.host, f = null, fv = g.face, i = g.moving ? Math.floor(g.dist / STRIDE * 8) % 8 : 8;
    try{ if (h.golferWalkHas(fv[0], fv[1], i)) f = h.golferWalk(fv[0], fv[1], i);
      else { for (var j = 8; j >= 0 && !f; j--) if (h.golferWalkHas(fv[0], fv[1], j)) f = h.golferWalk(fv[0], fv[1], j); if (!f) f = h.golferWalk(fv[0], fv[1], i); } }catch(e){ f = null; }
    if (!f) f = lastFace; else lastFace = f;
    var shp = scr(g.x, g.y), s = kk; ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(shp[0], shp[1], 5 * s, 2 * s, 0, 0, 7); ctx.fill();
    drawFigure(f, g.x, g.y, true); }
  function waypoint(){ var tx, ty, label, br = cv.getBoundingClientRect();
    var shut = gate && !gate.open && g.y > P.gate.y, tgt = shut ? [P.gate.x, P.gate.y] : [P.cx(0), -0.5], p = scr(tgt[0], tgt[1], pic.zAt(tgt[0], tgt[1]) + (shut ? 7 : 9.5));
    tx = p[0] / dpr; ty = p[1] / dpr; var M = 34, Wc = W / dpr, Hc = H / dpr, inside = tx > M && tx < Wc - M && ty > M + 110 && ty < Hc - M - 70;
    var d = Math.round(Math.hypot(tgt[0] - g.x, tgt[1] - g.y) * 1.5 / 3);   // trail feet are two thirds of real ones, and yards are three feet
    label = shut ? 'World door' : (api.holeLabel || 'Next hole');
    if (inside){ way.classList.remove('on'); pin.classList.add('on'); pin.style.left = tx + 'px'; pin.style.top = ty + 'px'; pin.querySelector('b').textContent = label; pin.querySelector('i').textContent = d > 3 ? d + ' yd' : ''; return; }
    pin.classList.remove('on'); way.classList.add('on'); var cxs = Wc / 2, cys = Hc / 2, vx = tx - cxs, vy = ty - cys, s2 = Math.min((Wc / 2 - M) / Math.abs(vx || 1e-6), (Hc / 2 - M - 90) / Math.abs(vy || 1e-6));
    way.style.left = (cxs + vx * s2) + 'px'; way.style.top = (cys + vy * s2) + 'px'; way.querySelector('i').style.transform = 'rotate(' + (Math.atan2(vy, vx) * 180 / Math.PI + 90).toFixed(1) + 'deg)';
    way.querySelector('b').textContent = label + ' · ' + d + ' yd'; }
  // warm every facing of the walk while the trail opens, so turning never waits on a drawing
  try{ var hh = api.host; if (hh && hh.golferWalkWarm) for (var q = 0; q < 8; q++){ var a = q * Math.PI / 4; hh.golferWalkWarm(Math.sin(a), -Math.cos(a)); } }catch(e){}
  requestAnimationFrame(step);
  var ctl = {
    stop:function(){ alive = false; if (dlg && dlg.kill) dlg.kill(); window.removeEventListener('resize', onRs); box.removeEventListener('pointerdown', pdn); window.removeEventListener('pointermove', pmv); window.removeEventListener('pointerup', pup);
      window.removeEventListener('pointercancel', pup); window.removeEventListener('blur', pup); window.removeEventListener('keydown', kd, true); window.removeEventListener('keyup', ku, true); },
    // for the checks: where he is, and a way to hold the stick
    pos:function(){ return [g.x, g.y]; }, stick:function(vx, vy){ stickV = [vx, vy]; }, auto:function(on){ setAuto(on !== false); },
    plan:function(){ return P; }, gate:function(){ return gate; }, life:function(){ return { theme:sp.theme, ships:ships.map(function(s1){ var y1 = shipY(s1); return { x:shipX(y1), y:y1 }; }), flyers:flyers.length, motes:motes.length, balloons:balloons.length, tumbles:tumbles.length, ghosts:ghosts.length, puffs:puffs.length, smoke:smokeSrc.length }; }, host:function(){ return hs ? { x:hs.x, y:hs.y, ph:hs.ph, talking:!!dlg } : null; }, items:function(){ return items; }, goTo:function(x, y){ g.x = x; g.y = y; }, view:function(){ return { kk:kk, W:W, H:H, ox:ox, oy:oy }; }, scr:scr };
  return ctl;
}

window.RTT_PUTT_TRAIL = { API_VERSION:API_VERSION, COIN_V:COIN_V, plan:plan, slices:slices, run:run, GH:GH, TRAIL_L:TRAIL_L, ELEV:ELEV, KIT:KIT };
})();
