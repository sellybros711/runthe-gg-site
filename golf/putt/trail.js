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

   A trail runs from a clearing just past the hole you left to an arch in front of the hole you are walking
   to, TRAIL_L feet up the land but routed like a course (a dogleg, switchbacks, a hairpin back toward you,
   round a lake), so it leads in every direction rather than straight up the screen. The camera rides with the
   golfer. The holes at both ends are the REAL holes: putt.js hands over each one's compiled course as a
   grid of codes (courseFoot), scaled to fit, and it is laid into the land here. The hole you just played
   sits behind the start with its cup on the path's line; the next one sits past the arch with its tee on
   the path. A flag stands in each cup. What is on the way:

     one chest, in the clearing off a spur or hidden behind a tree or a rock: walk up to it and it opens, its coins burst out onto the ground, and each is picked up by walking over it, once for
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
/* HE WALKS AT 10 FT A SECOND, and it was 7. Players found the walk too slow: a trail is two screens and a bend or two,
   and at 7 it was half a minute of holding a stick. The stride grows with it so the legs still read as walking
   (a brisk two and a quarter steps a second each way) rather than as a scurry. */
var TRAIL_L = 110, HALFW = 46, PW = 2.2, VIEW_FT = 60, SPEED = 10, STRIDE = 4.4;
/* WHAT IS HIDDEN ON A TRAIL LOOKS LIKE WHAT IT IS, never like a coin: a heart, a gem, a putter, a key, a golf
   ball. Each is drawn bigger than a coin and stands in a light of its own colour, so it is seen through the trees
   and known before you reach it. LOOT says how each is drawn, and the list on screen uses the same pictures. */
var PIX_HEART = ['.oo...oo.', 'ohho.orro', 'ohrrorrro', 'orrrrrrro', '.orrrrro.', '..orrro..', '...oro...', '....o....'];
var PIX_GEM = ['..ooooo..', '.ohhrrro.', 'ohhrrrrro', 'ooooooooo', '.orrrrro.', '..orrro..', '...oro...', '....o....'];
var PIX_PART = ['.......oo', '......ogo', '.....ogo.', '....ogo..', '...oro...', '..oro....', 'oooooo...', 'ohhhhro..', 'orrrrro..', 'oooooo...'];
var PIX_KEY = ['.ooo..........', 'ohhro.........', 'oh.roooooooooo', 'or.rrrrrrrrrro', 'orrroooooororo', '.ooo.....o.o.o'];
var PIX_BALL = ['...ooooo...', '..ohhhrro..', '.ohhrdrdro.', 'ohhdrrdrrdo', 'ohrrdrrdrro', 'odrrdrrdrdo', 'orrdrrdrrro', 'ordrrdrrdro', '.orrdrrdro.', '..orrrrro..', '...ooooo...', '..oowwwoo..', '....owo....', '....owo....', '.....o.....'];
var PIX_CHEST = ['.oooooooooo.', 'ohhhhhhhhhro', 'orrrrggrrrro', 'oooooggooooo', 'orrrrggrrrro', 'orrrrrrrrrro', 'oooooooooooo'];
var LOOT = {
  golden:{ rows:PIX_BALL, pal:{ r:'#ffd23a', h:'#fff6c4', d:'#a8700a', o:'#5a3a00', w:'#ffffff' }, beam:'255,214,64', name:'Golden ball' },
  key:{ rows:PIX_KEY, pal:{ r:'#c9ccd6', h:'#ffffff', o:'#3a3e4a' }, beam:'200,220,255', name:'Key' },
  life:{ rows:PIX_HEART, pal:{ r:'#e5483a', h:'#ff9d8a', o:'#6a1410' }, beam:'255,90,80', name:'Spare life' },
  trinket:{ rows:PIX_GEM, pal:{ r:'#b48cff', h:'#ffffff', o:'#2a1a40' }, beam:'190,150,255', name:'Trinket' },
  part:{ rows:PIX_PART, pal:{ r:'#7fa0c4', h:'#e6eef8', o:'#1e2a38', g:'#2a2a2a' }, beam:'120,190,255', name:'Putter part' },
  chest:{ rows:PIX_CHEST, pal:{ r:'#a8662e', h:'#d8944a', g:'#ffd23a', o:'#3a2410' }, beam:null, name:'Chest' },
  prize:{ rows:PIX_CHEST, pal:{ r:'#3a78b8', h:'#7cc8ff', g:'#ffd23a', o:'#14304a' }, beam:null, name:'Puzzle' }
};
function lootPal(t){ var L = LOOT[t.k]; return t.k === 'trinket' && t.col ? Object.assign({}, L.pal, { r:t.col }) : L.pal; }
function lootBeam(t){ if (t.k === 'trinket' && t.col){ var n = parseInt(t.col.slice(1), 16); return (n >> 16) + ',' + (n >> 8 & 255) + ',' + (n & 255); } return LOOT[t.k].beam; }
// a list icon: the same picture, as an image the HUD can show
var ICONS = {};
function lootIcon(t){ var key = t.k + (t.col || ''); if (ICONS[key]) return ICONS[key]; var L = LOOT[t.k], rows = L.rows, pal = lootPal(t), c = document.createElement('canvas'); c.width = rows[0].length; c.height = rows.length;
  var x = c.getContext('2d'); rows.forEach(function(r, j){ for (var i = 0; i < r.length; i++){ var ch = r[i]; if (ch === '.') continue; x.fillStyle = pal[ch] || pal.r; x.fillRect(i, j, 1, 1); } }); return ICONS[key] = c.toDataURL(); }
/* THE PUZZLES (plan's puzzle() places them, run() plays them). PZ_SHARE of trails carry one; it pays PZ_COINS coins
   of COIN_V each, out of its own small chest. A pen is PEN_R across with a gap of PEN_HALF radians either side of
   the gate; a plate holds the gate open PZ_GATE_S seconds, plus a little for every foot from the plate to the gate. */
var PZ_SHARE = 0.5, PZ_COINS = 6, PEN_R = 2.9, PEN_HALF = 0.31, PZ_GATE_S = 4.5, CRATE_H = 0.8;
var PZ_NAME = { fire:'Light the three', dig:'Buried chest', plate:'Pen and plate', push:'Stuck crate' };
// what the three lights are in each world, for the clue
var PZ_LIGHT = { clubhouse:'lanterns', temple:'torches', pirate:'lanterns', canyon:'mine lamps', volcano:'braziers', frozen:'ice lamps', sky:'beacons', neon:'neon lights',
  school:'lanterns', iceage:'fire pits', haunted:'candles', harvest:'lanterns' };
var PZ_FLAME = { neon:['#2bf0ff', '#c8fbff'], haunted:['#7cff8a', '#d8ffd8'], frozen:['#6ec8ff', '#e2f6ff'], sky:['#ffd24a', '#fff6c4'] };
var JAM_ROCK = { neon:'cube', frozen:'rocksnow', iceage:'rocksnow', volcano:'rockdark', haunted:'rockdark' };
/* THE CLUE, said by the local (or the greeter) on a puzzle trail: a nudge, never the answer. Three ways of saying
   each, picked off the trail, so the same line does not come back trail after trail. */
var PZ_CLUES = {
  fire:['Three {l} stand along this path. Light all three and something turns up.', 'Somebody left three {l} out here. Walk past each one to light it.', 'Light the three {l} on this trail. They\'re keeping something hidden.'],
  dig:['Somebody buried something out here. Follow the footprints off the path.', 'See those footprints? They lead to something buried. Stand where they stop.', 'Tracks run off the path up ahead. Follow them to the end and dig.'],
  plate:['That pen\'s gate won\'t stay open long. Find the plate that opens it, then run.', 'There\'s a plate in the ground that opens the pen. You\'ll have to be quick.', 'Step on the plate and the pen\'s gate opens. It shuts again fast.'],
  push:['A crate\'s blocking that pen. Push it from the side by the rock.', 'That crate jams if you push it toward the rock. Push it the other way.', 'Move the crate out of the pen\'s gap. Push it away from the rock.']
};
function pzClue(k, th, R){ var a = PZ_CLUES[k] || []; return (a[(R() * a.length) | 0] || '').replace('{l}', PZ_LIGHT[th] || 'lanterns'); }
var COIN_V = 50, BRK_V = 25, TART = 0.125;   // a coin off the ground pays 50 into the wallet and a smashed breakable 25; the trail is painted on a finer grid than a hole, because the camera comes in closer

function hash(x, y, s){ var h = (x * 374761393 + y * 668265263 + s * 982451653) | 0; h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967296; }
function vn(x, y, s){ var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  var a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
function fbm(x, y, s){ return vn(x, y, s) * 0.55 + vn(x * 2.1, y * 2.1, s + 7) * 0.3 + vn(x * 4.3, y * 4.3, s + 13) * 0.15; }
/* the last answer for the last point: the ground is built by asking h() and then mat() about the same point, and each
   asks the creek, the ponds and the holes again, so a function of (x, y) asked twice in a row answers once */
function memo2(f){ var lx = NaN, ly = NaN, lv; return function(x, y){ if (x === lx && y === ly) return lv; lx = x; ly = y; return lv = f(x, y); }; }
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
  school:{ g:['#78ad58', '#82b862', '#6ea24f', 0.18], mow:true, p:['#4c5058', '#565a62', '#42464e'], tree:['broad', 'broad', 'broad'], leaves:['#2f7d3e', '#3b8f4a', '#25693a'], bark:'#5a3d2e',
    low:['bush', 'rock', 'bush'], brk:'trashcan', haz:'water', hazC:['#5a7896', '#8eaccc'], lm:['school', 'swings', 'slide'], wall:['#b5452e', '#7a2a1a'],
    npc:{ skin:'medium', polo:'navy', hat:'red', pants:'khaki', hair:'black', hairStyle:'short', cap:true, hatStyle:'cap', gender:'male' }, who:'the crossing guard' },
  iceage:{ g:['#e6edf2', '#f2f6f9', '#d6e0e7', 0.2], p:['#b8aa92', '#c8bca6', '#a89a82'], tree:['pine', 'pine', 'dead'], leaves:['#1e3f30', '#28503e', '#173a2a'], bark:'#4a3626', snow:true,
    low:['rocksnow', 'bushsnow', 'rock'], brk:'ice', haz:'slow', hazC:['#1e1a16', '#3a3028'], bogC:['#1e1a16', '#3a3028'], lm:['mammoth', 'cave', 'tusks'], wall:['#cfeaf2', '#6fb6d0'],
    npc:{ skin:'tan', polo:'gold', hat:'tan', pants:'khaki', hair:'darkbrown', hairStyle:'long', cap:false, gender:'male' }, who:'the cave dweller' },
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
  /* NO TWO WALKS ARE THE SAME WALK, AND THEY DO NOT ALL WALK UP THE SCREEN. A trail is laid out the way a course
     is routed: from the hole you left to the next tee by a dogleg, by switchbacks across the whole width, by a
     hairpin that turns back toward you, round a lake, through a run of esses. ROUTES gives each its control
     points in (across, along) terms, u from -1 to 1 over the width and v from 1 at the start to 0 at the arch,
     mirrored at random and jittered; a centripetal spline through them is the path. A route that runs out of
     bounds, comes back too near itself, or (on a trail between worlds) crosses the wall's line more than once is
     drawn again, and a straight walk is the last resort. Where the walk starts and where the arch stands move
     too, as far as the real holes at each end leave room. */
  // how far across a route may reach: the width of a phone's plan, and on a wide screen not much more, so a walk
  // that crosses and recrosses the land does not turn into a long one
  var XR = Math.max(12, Math.min(26, HW - 10)), Y0 = L + 6, MINSEP = PW * 2 + 5;
  var seaK = kitOf(th).sea, seaSide = seaK ? (R() < 0.5 ? -1 : 1) : 0;
  function fitX(f, off){ return f ? [b[0] + 2 + off, b[2] - 2 - (f.W - 1) * 0.25 + off] : [-XR, XR]; }
  var sRange = spec.holeFrom ? fitX(spec.holeFrom, (spec.holeFrom.cup[0] - spec.holeFrom.x0) * spec.holeFrom.k) : [-XR, XR];
  var aRange = spec.holeTo ? fitX(spec.holeTo, (spec.holeTo.tee[0] - spec.holeTo.x0) * spec.holeTo.k) : [-XR, XR];
  function clampR(x, r){ var lo = Math.max(-XR, r[0]), hi = Math.min(XR, r[1]); return lo > hi ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, x)); }
  // on a shore the sea keeps one side, so the route stays on the land and the water stays in sight
  function ux(u){ return (seaK ? u * 0.62 - seaSide * 0.36 : u) * XR; }
  var ROUTES = {
    meander:function(s, j){ return { a:j(0.7), z:j(0.6), p:[[s * 0.32 + j(0.2), 0.78], [-s * 0.36 + j(0.2), 0.52], [s * 0.22 + j(0.2), 0.27]] }; },
    dogleg:function(s, j){ var v = 0.56 + j(0.16); return { a:s * 0.72, z:-s * 0.45, p:[[s * 0.74, 0.86], [s * 0.72, v + 0.1], [s * 0.4, v], [-s * 0.55, v - 0.05], [-s * 0.72, v - 0.18], [-s * 0.6, 0.2]] }; },
    switchback:function(s, j){ var z = j(0.6); return { a:s * 0.74, z:z, p:[[s * 0.5, 0.95], [-s * 0.72, 0.86 + j(0.04)], [-s * 0.84, 0.74], [-s * 0.5, 0.64], [s * 0.72, 0.58 + j(0.04)], [s * 0.84, 0.44], [s * 0.4, 0.32], [z * 0.6, 0.2]] }; },
    hairpin:function(s, j){ return { a:s * 0.72, z:-s * 0.5, p:[[s * 0.78, 0.8], [s * 0.74, 0.56 + j(0.04)], [s * 0.42, 0.44], [s * 0.04, 0.52], [-s * 0.02, 0.7 + j(0.04)], [-s * 0.36, 0.8], [-s * 0.76, 0.7], [-s * 0.8, 0.46], [-s * 0.62, 0.22]] }; },
    lake:function(s, j){ return { a:s * 0.3, z:s * 0.55, mid:[s * 0.25, 0.54], p:[[-s * 0.3, 0.95], [-s * 0.76, 0.84], [-s * 0.88, 0.58 + j(0.06)], [-s * 0.74, 0.32], [-s * 0.24, 0.17], [s * 0.36, 0.17]] }; },
    esses:function(s, j){ var o = []; for (var k = 0; k < 6; k++) o.push([(k % 2 ? -1 : 1) * s * (0.42 + j(0.16)), 0.88 - k * 0.13]); return { a:j(0.3), z:j(0.4), p:o }; },
    sweep:function(s, j){ return { a:s * 0.66, z:-s * 0.5, p:[[s * 0.82, 0.8], [s * 0.62, 0.62], [-s * 0.62, 0.44], [-s * 0.8, 0.24]] }; },
    cape:function(s, j){ return { a:-s * 0.2, z:s * 0.6, mid:[-s * 0.3, 0.42], p:[[s * 0.5, 0.86], [s * 0.82, 0.62], [s * 0.6, 0.4 + j(0.06)], [-s * 0.1, 0.3], [-s * 0.6, 0.2], [s * 0.1, 0.1]] }; }
  };
  var RNAMES = ['meander', 'dogleg', 'switchback', 'hairpin', 'lake', 'esses', 'sweep', 'cape'], RWT = [1, 2, 2, 1.2, 1.6, 1.4, 1.6, 1.4];
  function pickRoute(){ var tot = 0, i; for (i = 0; i < RWT.length; i++) tot += RWT[i]; var r = R() * tot; for (i = 0; i < RWT.length; i++){ r -= RWT[i]; if (r <= 0) return RNAMES[i]; } return RNAMES[0]; }
  // a centripetal Catmull-Rom through the points, then laid out a point every 2 ft
  function spline(pts){ var out = [], n = pts.length, A = 0.5;
    function lp(a, c, t0, t1, t){ var w = (t1 - t0) || 1e-6; return [a[0] + (c[0] - a[0]) * (t - t0) / w, a[1] + (c[1] - a[1]) * (t - t0) / w]; }
    for (var i = 0; i < n - 1; i++){ var p1 = pts[i], p2 = pts[i + 1], p0 = i ? pts[i - 1] : [2 * p1[0] - p2[0], 2 * p1[1] - p2[1]], p3 = i + 2 < n ? pts[i + 2] : [2 * p2[0] - p1[0], 2 * p2[1] - p1[1]];
      var t0 = 0, t1 = t0 + Math.pow(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1e-3, A), t2 = t1 + Math.pow(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) || 1e-3, A), t3 = t2 + Math.pow(Math.hypot(p3[0] - p2[0], p3[1] - p2[1]) || 1e-3, A);
      for (var k = 0; k < 24; k++){ var t = t1 + (t2 - t1) * k / 24, a1 = lp(p0, p1, t0, t1, t), a2 = lp(p1, p2, t1, t2, t), a3 = lp(p2, p3, t2, t3, t), b1 = lp(a1, a2, t0, t2, t), b2 = lp(a2, a3, t1, t3, t); out.push(lp(b1, b2, t1, t2, t)); } }
    out.push(pts[n - 1].slice()); return out; }
  function even(d){ var o = [d[0].slice()], acc = 0; for (var i = 1; i < d.length; i++){ var a = d[i - 1], c = d[i], l = Math.hypot(c[0] - a[0], c[1] - a[1]), u0 = 0;
      while (acc + l * (1 - u0) >= 2){ var need = 2 - acc; u0 += need / (l || 1e-9); o.push([a[0] + (c[0] - a[0]) * u0, a[1] + (c[1] - a[1]) * u0]); acc = 0; }
      acc += l * (1 - u0); }
    var e = d[d.length - 1]; if (Math.hypot(e[0] - o[o.length - 1][0], e[1] - o[o.length - 1][1]) > 0.4) o.push(e.slice()); return o; }
  function cumOf(p){ var c = [0]; for (var i = 1; i < p.length; i++) c.push(c[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1])); return c; }
  // the one line where two worlds meet, crossed exactly once and heading north, so the wall has one door
  function wallLine(p){ var cands = []; for (var y = Math.round(L * 0.6); y <= Math.round(L * 0.86); y++) cands.push(y); cands.sort(function(a, c){ return Math.abs(a - L * 0.72) - Math.abs(c - L * 0.72); });
    for (var q = 0; q < cands.length; q++){ var yy = cands[q] + 0.5, hit = -1, n = 0;
      for (var i = 0; i < p.length - 1; i++) if ((p[i][1] - yy) * (p[i + 1][1] - yy) <= 0){ n++; hit = i; }
      if (n !== 1) continue; var ok = true; for (var k = Math.max(0, hit - 3); k < Math.min(p.length - 1, hit + 4); k++){ var dx = p[k + 1][0] - p[k][0], dy = p[k + 1][1] - p[k][1]; if (dy > -0.8 * Math.hypot(dx, dy)) ok = false; }
      if (ok && Math.abs(p[hit][0]) < XR + 2) return yy; }
    return null; }
  function sane(p, c, gyy, nm){ var n = p.length, SLn = c[n - 1], st = p[0], ar = p[n - 1];
    if (SLn > L * (nm === 'hairpin' ? 2.1 : 1.85)) return false;   // a hairpin is the one route allowed to be long: it walks you back
    for (var i = 0; i < n; i++){ var q = p[i]; if (q[0] < b[0] + 7 || q[0] > b[2] - 7 || q[1] > L + 7.5) return false;
      if (c[i] < SLn - 10 && q[1] < 6) return false;
      if (c[i] > 16 && Math.hypot(q[0] - st[0], q[1] - L - 6) < 12) return false;
      if (c[i] < SLn - 16 && Math.hypot(q[0] - ar[0], q[1] - 3) < 10) return false;
      for (var j = i + 1; j < n; j++) if (c[j] - c[i] > 26 && Math.hypot(p[j][0] - q[0], p[j][1] - q[1]) < MINSEP) return false; }
    return !spec.cross || gyy != null; }
  var path = null, cum = null, gy = null, style = 'straight', route = null;
  for (var att = 0; att < 28 && !path; att++){
    var nm = att < 24 ? pickRoute() : 'meander', flip = R() < 0.5 ? -1 : 1, jit = function(a){ return (R() - 0.5) * a; }, rt = ROUTES[nm](flip, jit);
    var sx = clampR(ux(rt.a), sRange), ax = clampR(ux(rt.z), aRange), ctrl = [[sx, L + 7]];
    // every bend wanders a little of its own, so two doglegs are two different doglegs, not one drawn twice
    var stretch = 0.9 + R() * 0.2; rt.p.forEach(function(q){ ctrl.push([ux(Math.max(-0.95, Math.min(0.95, q[0] * stretch + jit(0.18)))), Math.max(0.1, Math.min(0.97, q[1] + jit(0.06))) * Y0]); });
    ctrl.push([ax, 7], [ax, -1]);
    var pp = even(spline(ctrl)), cc = cumOf(pp), gg = spec.cross ? wallLine(pp) : null;
    if (sane(pp, cc, gg, nm)){ path = pp; cum = cc; gy = gg; style = nm; route = rt; } }
  if (!path){ var sx2 = clampR(0, sRange), ax2 = clampR(0, aRange); path = even(spline([[sx2, L + 7], [(sx2 + ax2) / 2, Y0 / 2], [ax2, 7], [ax2, -1]])); cum = cumOf(path); gy = spec.cross ? (wallLine(path) || Math.round(L * 0.72) + 0.5) : null; }
  /* ONLY A WORLD STARTS IN A PLAZA. Every walk used to set off from the same round clearing behind the hole just
     played, so every trail opened on the same picture. The owner's call: the start of a world is a circle, and
     everywhere else the walk leaves the last hole the way a path leaves a green, straight off its carpet. So the
     path is run back onto the hole behind you, and the start is only a little landing where it meets the carpet. */
  var plaza = !!spec.plaza || !spec.holeFrom;
  if (!plaza){ path.unshift([path[0][0], L + 9.6], [path[0][0], L + 8.4]); cum = cumOf(path); }
  var SL = cum[cum.length - 1], archX = path[path.length - 1][0];
  // a point along the walk, the way it is heading there, and a point off to one side (side 1 is the right hand, walking)
  function atS(s){ s = Math.max(0, Math.min(SL, s)); for (var i = 0; i < path.length - 1; i++) if (cum[i + 1] >= s){ var u = (s - cum[i]) / ((cum[i + 1] - cum[i]) || 1); return [path[i][0] + (path[i + 1][0] - path[i][0]) * u, path[i][1] + (path[i + 1][1] - path[i][1]) * u]; } return path[path.length - 1].slice(); }
  function tanS(s){ var a = atS(s - 1.5), c = atS(s + 1.5), dx = c[0] - a[0], dy = c[1] - a[1], l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; }
  function beside(s, side, off){ var p = atS(s), t = tanS(s); return [p[0] - t[1] * side * off, p[1] + t[0] * side * off]; }
  function sAtY(y){ for (var i = 0; i < path.length - 1; i++) if ((path[i][1] - y) * (path[i + 1][1] - y) <= 0){ var u = (y - path[i][1]) / ((path[i + 1][1] - path[i][1]) || 1e-9); return cum[i] + u * (cum[i + 1] - cum[i]); } return SL; }
  // the path's x where it last crosses a line across the land: for the arch end and the checks
  function cx(y){ if (y <= 0) return archX; for (var i = path.length - 2; i >= 0; i--) if ((path[i][1] - y) * (path[i + 1][1] - y) <= 0){ var u = (y - path[i][1]) / ((path[i + 1][1] - path[i][1]) || 1e-9); return path[i][0] + (path[i + 1][0] - path[i][0]) * u; } return path[0][0]; }
  function pathD(x, y){ var m = 1e9; for (var i = 0; i < path.length - 1; i++){ var a = path[i], c = path[i + 1]; if (Math.abs(a[1] - y) > 6 && Math.abs(c[1] - y) > 6) continue; m = Math.min(m, segD(x, y, a[0], a[1], c[0], c[1])); } return m; }
  function themeAt(y){ return spec.cross && y > gy ? th0 : th; }
  var start = { x:path[0][0], y:L + 6, r:plaza ? 7 : 1.2 };
  /* the spur and its clearing, off to a side with room. Never further out than a phone's camera sees from the path
     (it was up to 22 ft, and with no spur to it that was a clearing nobody could find): 9.5 to 15 ft, so the trees
     can hide it from most of the walk but some stretch of the path always has it on screen. Never over another leg
     of the walk, never across the wall */
  var clr = null, spur = [], ys, sx0, sg, sS;
  for (var ct = 0; ct < 120 && !clr; ct++){ var s1 = SL * (0.22 + R() * 0.56), sd = R() < 0.5 ? -1 : 1, crr = 4.5 + R() * 2, cp = beside(s1, sd, 9.5 + R() * 5.5), o = atS(s1);
    if (cp[0] < b[0] + crr + 4 || cp[0] > b[2] - crr - 4 || cp[1] < 12 || cp[1] > L - 6) continue;
    if (pathD(cp[0], cp[1]) < crr + 5 || Math.hypot(cp[0] - start.x, cp[1] - start.y) < crr + start.r + 4) continue;
    if (gy && (Math.abs(cp[1] - gy) < crr + 6 || Math.abs(o[1] - gy) < 12 || (cp[1] - gy) * (o[1] - gy) < 0)) continue;
    var crosses = false; for (var kt = 0.4; kt <= 1; kt += 0.1) if (pathD(o[0] + (cp[0] - o[0]) * kt, o[1] + (cp[1] - o[1]) * kt) < PW + 1.4) crosses = true;
    if (crosses) continue;
    clr = { x:cp[0], y:cp[1], r:crr }; sS = s1; sx0 = o[0]; ys = o[1]; sg = sd; }
  if (!clr){ sS = SL * 0.5; var o2 = atS(sS); sx0 = o2[0]; ys = o2[1]; sg = sx0 > 0 ? -1 : 1; clr = { x:sx0 + sg * 11, y:ys - 2, r:4.5 }; }
  // half the clearings have a little path out to them; the rest are hidden in the trees and found by wandering
  var spurOn = R() < 0.55;
  if (spurOn){ var sdx = clr.x - sx0, sdy = clr.y - ys, sl = Math.hypot(sdx, sdy) || 1, bow = (R() < 0.5 ? -1 : 1) * 2.2;
    for (var k = 0; k <= 10; k++){ var t = k / 10, bw = Math.sin(t * Math.PI) * bow; spur.push([sx0 + sdx * t - sdy / sl * bw, ys + sdy * t + sdx / sl * bw]); } }
  // what the clearing holds: a chest most often, else a pile of things to smash
  var clrKind = R() < 0.7 ? 'chest' : 'pile';
  // the key and the locked gate are the trail's little puzzle: more than half the chests are behind one
  var locked = !spec.cross && clrKind === 'chest' && R() < 0.55;
  /* THE REAL HOLES AT EACH END (spec.holeTo, spec.holeFrom, rastered by putt.js). The hole you are walking to
     lies beyond the arch with its tee at the path; the hole you just left lies behind the start with its cup
     nearest you. Each is a grid of codes at a quarter of a trail foot, placed by its south west corner. */
  var feet = [];
  function foot(f, X0, Y0){ var o = { f:f, X0:X0, Y0:Y0, w:(f.W - 1) * 0.25, h:(f.H - 1) * 0.25 }; o.cup = [X0 + (f.cup[0] - f.x0) * f.k, Y0 + (f.cup[1] - f.y0) * f.k]; feet.push(o); return o; }
  if (spec.holeTo){ var HT = spec.holeTo, hh0 = (HT.H - 1) * 0.25; foot(HT, cx(0) - (HT.tee[0] - HT.x0) * HT.k, -2.6 - hh0); b[1] = Math.min(b[1], -2.6 - hh0 - 4); }
  if (spec.holeFrom){ var HF = spec.holeFrom, fy0 = start.y + start.r + 2; foot(HF, start.x - (HF.cup[0] - HF.x0) * HF.k, fy0); b[3] = Math.max(b[3], fy0 + (HF.H - 1) * 0.25 + 4); }
  function footAt(x, y){ for (var i = 0; i < feet.length; i++){ var o = feet[i], f = o.f, ii = Math.round((x - o.X0) / 0.25), jj = Math.round((y - o.Y0) / 0.25);
      if (ii >= 0 && jj >= 0 && ii < f.W && jj < f.H){ var c = f.codes[jj * f.W + ii]; if (c) return { c:c, i:i }; } } return null; }
  function inFoot(x, y, pad){ for (var i = 0; i < feet.length; i++){ var o = feet[i]; if (x > o.X0 - pad && x < o.X0 + o.w + pad && y > o.Y0 - pad && y < o.Y0 + o.h + pad) return true; } return false; }
  function spurD(x, y){ var m = 1e9; if (spur.length < 2) return m; for (var i = 0; i < spur.length - 1; i++) m = Math.min(m, segD(x, y, spur[i][0], spur[i][1], spur[i + 1][0], spur[i + 1][1])); return m; }
  // a field of how far each point is from the path, the spur and the clearings, read back smoothly
  var DS = 1, DX = Math.ceil((b[2] - b[0]) / DS) + 1, DY = Math.ceil((b[3] - b[1]) / DS) + 1, DD = new Float32Array(DX * DY);
  for (var j = 0; j < DY; j++) for (var i2 = 0; i2 < DX; i2++){ var x = b[0] + i2 * DS, yy = b[1] + j * DS; DD[j * DX + i2] = Math.min(pathD(x, yy), spurD(x, yy) + 0.4); }
  function walkD(x, y){ var fx = (x - b[0]) / DS, fy = (y - b[1]) / DS; if (fx < 0 || fy < 0 || fx >= DX - 1 || fy >= DY - 1) return 99;
    var i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, q = j * DX + i; return (DD[q] * (1 - u) + DD[q + 1] * u) * (1 - v) + (DD[q + DX] * (1 - u) + DD[q + DX + 1] * u) * v; }
  function inClear(x, y, pad){ pad = pad || 0; if (inFoot(x, y, pad + 1.5)) return true; return Math.hypot(x - clr.x, y - clr.y) < clr.r + pad || Math.hypot(x - start.x, y - start.y) < start.r + pad || (y < 3 + pad && y > -16 && Math.abs(x - archX) < 9 + pad); }

  var P = { spec:spec, seed:seed, L:L, b:b, plaza:plaza, path:path, cum:cum, cx:cx, gy:gy, SL:SL, atS:atS, tanS:tanS, beside:beside, arch:{ x:archX, y:0 }, route:route, themeAt:themeAt, clr:clr, spur:spur, locked:locked, style:style, clrKind:clrKind, start:start, walkD:walkD, inClear:inClear, feet:feet, footAt:memo2(footAt),
    things:[], cols:[], items:[], hazards:[] };
  P.near = function(x, y){ var best = 1e9, out = path[0]; for (var i = 0; i < path.length; i++){ var d = Math.hypot(path[i][0] - x, path[i][1] - y); if (d < best){ best = d; out = path[i]; } } return out; };

  // ---- the world's ground to keep off: ponds, lava pools, ice sheets, bogs. Never on the path or a clearing.
  var pools = [];
  /* A ROUTE THAT GOES ROUND SOMETHING HAS SOMETHING IN THE MIDDLE. The lake and the cape bend the walk round a
     point (route.mid); in a world with ground to keep off, that is a big pond or a lava lake or an ice sheet, the
     water hole of the walk. In a world without, a landmark takes it (below). */
  var midPt = route && route.mid ? [ux(route.mid[0]), route.mid[1] * Y0] : null, kmid = midPt && kitOf(themeAt(midPt[1]));
  if (midPt && kmid.haz && !(gy && Math.abs(midPt[1] - gy) < 14)){ var mr = Math.min(11, walkD(midPt[0], midPt[1]) - PW - 3.5);
    if (mr > 4 && !inClear(midPt[0], midPt[1], mr)) pools.push({ x:midPt[0], y:midPt[1], r:mr, rx:mr, ry:mr * 0.78, k:kmid.haz, seed:9, big:1 }); }
  for (var q = 0; q < 6; q++){ var ps = 12 + R() * (SL - 22), side = R() < 0.5 ? -1 : 1, pq = beside(ps, side, 9 + R() * 14), py = pq[1], kx = kitOf(themeAt(py));
    if (!kx.haz) continue; var px = pq[0], pr = kx.haz === 'ice' ? 5 + R() * 4 : 3 + R() * 3.5, prx = pr * (1 + R() * 0.5), pry = pr * (0.7 + R() * 0.3), pre = Math.max(prx, pry) * 1.12;   // the ragged edge reaches about an eighth past the ellipse
    if (walkD(px, py) < pre + 2 || inClear(px, py, pre + 1.5) || (gy && Math.abs(py - gy) < pre + 3) || pools.some(function(o){ return Math.hypot(o.x - px, o.y - py) < o.r + pre + 2; })) continue;
    pools.push({ x:px, y:py, r:pre, rx:prx, ry:pry, k:kx.haz, seed:q }); }
  if (seaK){ P.sea = { side:seaSide }; }
  P.pools = pools;
  /* A CREEK ACROSS THE LAND, on about half the trails of a world that has ground to keep off: a stream (or a lava
     flow, a frozen creek, a bog) running the whole width, and the path crosses it on a bridge. A route that
     doubles back crosses it two or three times, a bridge each time. It never runs along the path, never cuts
     through the clearing, the spur, the start, the arch or the wall, and never through a pond. */
  var creek = null, CK = { water:1, lava:1, ice:1, slow:1 };
  (function(){ if (R() >= 0.4) return;
    for (var ct = 0; ct < 30 && !creek; ct++){ var y0 = L * (0.22 + R() * 0.56), ky = kitOf(themeAt(y0)), kd = ky.haz || (themeAt(y0) === 'canyon' ? 'water' : null); if (!kd || !CK[kd]) return;
      var A1 = 1.5 + R() * 4.5, f1 = 6.283 / (30 + R() * 30), p1 = R() * 6.283, A2 = R() * 1.6, f2 = 6.283 / (11 + R() * 8), p2 = R() * 6.283, hw = kd === 'ice' ? 2.6 + R() * 0.9 : kd === 'slow' ? 2.4 + R() * 0.8 : kd === 'lava' ? 1.6 + R() * 0.6 : 1.8 + R() * 0.8;
      var cyf = function(x){ return y0 + A1 * Math.sin(x * f1 + p1) + A2 * Math.sin(x * f2 + p2); };
      var near = hw + PW + 1.2, ok = true, xs = [];
      for (var x = b[0]; x <= b[2] && ok; x += 1){ var yc = cyf(x);
        if (gy && Math.abs(yc - gy) < hw + 12) ok = false;
        if (Math.hypot(x - clr.x, yc - clr.y) < clr.r + hw + 3) ok = false;
        if (Math.abs(yc - start.y) < start.r + hw + 3 || yc < 16) ok = false;
        if (pools.some(function(o){ return Math.hypot(o.x - x, o.y - yc) < Math.max(o.rx, o.ry) + hw + 2.5; })) ok = false;
        if (spurD(x, yc) < near + 1) ok = false; }
      if (!ok) continue;
      // where the path crosses: each crossing has to be a fair way across, and the path is never near the water anywhere else
      var cs = [], sOf = function(i){ return path[i][1] - cyf(path[i][0]); };
      for (var i = 0; i < path.length - 1; i++) if (sOf(i) * sOf(i + 1) <= 0){ var u = sOf(i) / ((sOf(i) - sOf(i + 1)) || 1e-9); cs.push(cum[i] + u * (cum[i + 1] - cum[i])); }
      if (cs.length < 1 || cs.length > 3) continue;
      var info = cs.map(function(s){ var q = atS(s), tg = tanS(s), sl = (cyf(q[0] + 0.5) - cyf(q[0] - 0.5)), nl = Math.hypot(sl, 1), cosA = Math.abs((tg[1] - tg[0] * sl) / nl); return { s:s, x:q[0], y:q[1], t:tg, cos:cosA, half:(hw + 1.1) / Math.max(0.5, cosA) }; });
      if (info.some(function(c){ return c.cos < 0.6; })) continue;
      if (info.some(function(c, k){ return k && c.s - info[k - 1].s < 18; })) continue;
      for (i = 0; i < path.length && ok; i++){ var d = Math.abs(sOf(i)); if (d < near && !info.some(function(c){ return Math.abs(cum[i] - c.s) < c.half + near; })) ok = false; }
      if (!ok) continue;
      creek = { y0:y0, cy:cyf, hw:hw, k:kd, xs:info, seed:41 + ct }; } })();
  P.creek = creek;
  function creekD(x, y){ return creek ? Math.abs(y - creek.cy(x)) - creek.hw * (1 + (vn(x * 0.35, 3, creek.seed) - 0.5) * 0.3) : 1e9; }
  // the deck of a bridge: the walk where it is over the creek
  function deckAt(x, y){ return !!creek && creekD(x, y) < 1.1 && pathD(x, y) < PW + 0.1; }
  creekD = memo2(creekD); deckAt = memo2(deckAt); P.creekD = creekD; P.deckAt = deckAt;
  function poolAt(x, y){ for (var i = 0; i < pools.length; i++){ var o = pools[i], u = (x - o.x) / o.rx, v = (y - o.y) / o.ry, w = u * u + v * v + (vn(x * 0.4, y * 0.4, o.seed) - 0.5) * 0.5; if (w < 1) return o; }
    if (creek && creekD(x, y) < 0 && !deckAt(x, y)) return creek; return null; }
  /* THE SHORE FOLLOWS THE PATH. Out at the plan's edge the sea was off camera on a phone for most of a walk,
     and the ships are what Pirate Cove has to show; so the water comes in to a strip of beach beside the path
     (and round the clearing, the spur and the ends), never nearer than it was allowed before. */
  var SEA = null, SEA_Y0 = b[1];
  if (P.sea){ var sd = P.sea.side, HWs = spec.halfW || HALFW; SEA = new Float32Array(Math.ceil(b[3] - b[1]) + 2);
    for (var sj = 0; sj < SEA.length; sj++){ var sy = b[1] + sj, near = 8;
      for (var pi = 0; pi < path.length; pi++) if (Math.abs(path[pi][1] - sy) < 12) near = Math.max(near, sd * path[pi][0] + PW + 3.5);
      if (Math.abs(sy - clr.y) < clr.r + 8) near = Math.max(near, sd * clr.x + clr.r + 5);
      spur.forEach(function(q){ if (Math.abs(sy - q[1]) < 8) near = Math.max(near, sd * q[0] + 6); });
      if (Math.abs(sy - start.y) < start.r + 6) near = Math.max(near, sd * start.x + start.r + 4);
      if (sy < 4 && sy > -18) near = Math.max(near, sd * archX + 14);
      if (gy && Math.abs(sy - gy) < 6) near = Math.max(near, sd * cx(gy) + PW + 10);
      SEA[sj] = Math.max(near, Math.min(HWs - 8 + vn(sy * 0.08, 3, seed) * 4, near + vn(sy * 0.15, 9, seed) * 1.5)); } }
  function seaEdge(y){ if (!SEA) return 1e9; var f = Math.max(0, Math.min(SEA.length - 1.001, y - SEA_Y0)), i = f | 0, u = f - i; return SEA[i] * (1 - u) + SEA[i + 1] * u; }
  function seaAt(x, y){ if (!P.sea) return false; return P.sea.side * x > seaEdge(y || 0); }
  P.seaEdge = seaEdge;
  poolAt = memo2(poolAt); P.poolAt = poolAt; P.seaAt = seaAt;

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
  place('arch', archX, 0, 0.1, 9);
  // the flag still in the cup of the hole you just left, behind you
  if (spec.holeFrom && feet.length){ var fo = feet[feet.length - 1]; place('pin', fo.cup[0], fo.cup[1], 0.1, 6, { col:fo.f.T.flag }); }
  used.push({ x:archX, y:-8, r:9 });
  // the boundary wall where one world meets the next, a door on the path (its leaves are drawn by run())
  if (gy){ var gxx = cx(gy); P.gate = { x:gxx, y:gy, s:sAtY(gy) }; place('wall', 0, gy, 0.1, 7, { gx:gxx }); }
  // a bridge wherever the walk crosses the creek, its rails along the path
  if (creek) creek.xs.forEach(function(c){ place('bridge', c.x, c.y, 0.1, 1.4, { tx:c.t[0], ty:c.t[1], half:c.half, ck:creek.k, th:themeAt(c.y) }); used.push({ x:c.x, y:c.y, r:PW + 1 }); });
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
    for (var tries = 0; tries < 40; tries++){ var lq = (li === 0 && midPt && !kmid.haz && tries < 6) ? [midPt[0] + (R() - 0.5) * 4, midPt[1] + (R() - 0.5) * 4] : beside(18 + R() * (SL - 30), R() < 0.5 ? -1 : 1, 8 + R() * 16), ly = lq[1], lx = lq[0], sz = LMSIZE[kind] || [5, 5, 8];
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
  if (kitOf(th).lm.indexOf('lamps') >= 0 || th === 'neon') for (var ls2 = 14; ls2 < SL - 6; ls2 += 22){ var sd2 = (ls2 / 22 | 0) % 2 ? 1 : -1, lq2 = beside(ls2, sd2, PW + 1.3), lx2 = lq2[0], ly2 = lq2[1];
    if (free(lx2, ly2, 0.4) && okGround(lx2, ly2, 0.4) && !inClear(lx2, ly2, 1)) place('lamp', lx2, ly2, 0.3, 7); }

  // ---- what can be picked up and walked into
  var items = P.items, id = 0;
  function item(kind, x, y, o){ var t = { k:kind, x:x, y:y, id:kind + (id++) }; if (o) for (var q2 in o) t[q2] = o[q2]; items.push(t); return t; }
  function okSpot(x, y, r, minD, maxD){ var wd = walkD(x, y); return okGround(x, y, r) && free(x, y, r) && !inClear(x, y, 1.5) && wd >= minD && (maxD == null || wd <= maxD) && !(gy && Math.abs(y - gy) < 6) && y > 6 && y < L - 4; }
  function spotOff(minD, maxD, r, tries){ for (var t = 0; t < (tries || 80); t++){ var sq = beside(SL * (0.08 + R() * 0.84), R() < 0.5 ? -1 : 1, minD + R() * (maxD - minD)), yy = sq[1], xx = sq[0];
      if (okSpot(xx, yy, r, minD - 1, maxD + 2)) return [xx, yy]; } return null; }
  /* NO COINS LIE LOOSE ON A TRAIL. They are in its one chest: in the clearing, or tucked in behind a tree or a
     rock where the camera cannot see it from the path. Walk up to a chest and it opens,
     and its coins burst out onto the ground round it for you to walk over. Where each coin lands is fixed by
     the plan, so a coin left on the ground is still lying there next time. */
  // on crowded ground the coins fly a little further, so a chest always throws most of what it holds
  function drops(x, y, n){ var out = [], a0 = R() * 6.283;
    for (var i = 0, t = 0; out.length < n && t < n * 14; t++, i++){ var a = a0 + i * 2.39996, r = 2.1 + (i % 4) * 0.55 + R() * 0.5 + Math.floor(t / n) * 0.7, dx = x + Math.cos(a) * r, dy = y + Math.sin(a) * r * 0.8;
      if (okGround(dx, dy, 0.3) && !hitThing(dx, dy) && !(gy && Math.abs(dy - gy) < 1.5) && dy > -0.5 && dy < L + 10) out.push([dx, dy]); }
    return out; }
  function hitThing(x, y){ for (var i = 0; i < P.things.length; i++){ var t = P.things[i], r = BLOCKR[t.k] != null ? BLOCKR[t.k] : t.r; if (t.k === 'arch' || t.k === 'wall' || t.k === 'fence') continue;
      if (t.w){ if (Math.abs(x - t.x) < t.w / 2 + 0.8 && Math.abs(y - t.y) < t.d / 2 + 0.8) return true; } else if (r > 0 && Math.hypot(x - t.x, y - t.y) < r + 0.8) return true; } return false; }
  function chest(x, y, n, o){ var t = item('chest', x, y, o); t.n = n; t.drops = drops(x, y, n); return t; }
  /* FINDABLE, NOT OBVIOUS. A hidden chest is tucked in at the shoulder of a tree or a rock: behind it and to one
     side, so a corner of it shows past the trunk, and no further off the path than the camera can see from the
     path. It used to go straight behind the tree, up to thirty feet out, where the canopy covered all of it and a
     player could walk the whole trail past it. A tester could not find two of them. */
  function hideSpot(minD, maxD){
    var cand = P.things.filter(function(t){ var w = walkD(t.x, t.y); return (TREEH[t.k] || LOWR[t.k]) && w > minD - 2 && w < maxD && !inClear(t.x, t.y, 3) && !(gy && Math.abs(t.y - gy) < 8) && t.y > 8 && t.y < L - 4; });
    for (var tr = 0; tr < 40 && cand.length; tr++){ var t = cand[(R() * cand.length) | 0], sd = R() < 0.5 ? -1 : 1, hx = t.x + sd * ((t.r || 1) + 1.3 + R() * 0.6), hy = t.y - (t.r || 1) * 0.6 - 0.4 - R() * 0.6;
      if (okSpot(hx, hy, 1.4, minD, maxD + 4)) return [hx, hy]; }
    return spotOff(minD, maxD, 1.4, 80); }
  // ONE CHEST A TRAIL, the owner's call: in the clearing when the clearing holds one, else tucked in behind a tree.
  // The rest of what there is to find is the rare things below, for whoever wants more.
  if (clrKind === 'chest') chest(P.chest.x, P.chest.y, locked ? 18 : 12 + ((R() * 4) | 0), { main:1 });
  else { var hsp = hideSpot(6, 13) || hideSpot(5, 16) || spotOff(5, 14, 1.2, 200) || [clr.x, clr.y - 1.2]; if (hsp){ chest(hsp[0], hsp[1], 10 + ((R() * 5) | 0)); used.push({ x:hsp[0], y:hsp[1], r:4 }); }
    for (var cp2 = 0; cp2 < 4; cp2++){ var xp = clr.x + (cp2 % 2 ? 1 : -1) * 1.3, yp = clr.y + (cp2 < 2 ? -0.9 : 0.9); item('brk', xp, yp, { th:themeAt(yp) }); } }
  if (locked){ for (var tk2 = 0; tk2 < 60; tk2++){ var kq = beside(SL * (0.15 + R() * 0.7), R() < 0.5 ? -1 : 1, 8 + R() * 10), ky = kq[1], kxp = kq[0];
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
  var nb = 2 + ((R() * 3) | 0); for (var bi = 0; bi < nb; bi++){ var bsS = SL * (0.12 + R() * 0.76), bsd = R() < 0.5 ? -1 : 1, off = R() < 0.6 ? PW + 1.4 : 5 + R() * 9, nn = 1 + ((R() * 3) | 0);
    for (var bj = 0; bj < nn; bj++){ var bq = beside(bsS + (R() - 0.5) * 2, bsd, off + bj * 1.6), bx = bq[0], byy = bq[1];
      if (okGround(bx, byy, 0.9) && free(bx, byy, 0.9) && !inClear(bx, byy, 1) && !(gy && Math.abs(byy - gy) < 5)){ item('brk', bx, byy, { th:themeAt(byy) }); used.push({ x:bx, y:byy, r:0.8 }); } } }
  // the world's greeter, on the first trail of a world: a little way up the path from where you start, or just past the
  // world door, so the first thing that happens in a new world is somebody walking up to say hello
  if (spec.greet){ var hs0 = gy ? sAtY(gy) + 7 : 9;
    for (var hn = 0; hn < 40 && !P.host; hn++){ var hsd = (hn & 1) ? -1 : 1, hq = beside(hs0 + (hn >> 1) * 1.2, hsd, PW + 1.4), hy = hq[1], hx = hq[0];
      if (okGround(hx, hy, 1) && free(hx, hy, 1)){ P.host = item('host', hx, hy, { th:themeAt(hy) }); used.push({ x:hx, y:hy, r:1 }); } } }
  // the local, beside the path a little before the arch (a greeter's trail has the greeter instead)
  for (var tn = 0; tn < (spec.greet ? 0 : 30); tn++){ var nq = beside(SL * (0.16 + R() * 0.7), R() < 0.5 ? -1 : 1, PW + 1.6), ny = nq[1], nx = nq[0];
    if (free(nx, ny, 1) && okGround(nx, ny, 1)){ item('npc', nx, ny, { th:themeAt(ny) }); used.push({ x:nx, y:ny, r:1 }); break; } }

  // ---- what blocks the golfer: trunks, rocks, buildings, the fence and the wall
  P.things.forEach(function(t){ if (t.k === 'arch' || t.k === 'fence' || t.k === 'wall' || t.k === 'bridge') return; if (PLANT[t.k]) return; var r = BLOCKR[t.k] != null ? BLOCKR[t.k] : t.r; if (r > 0) P.cols.push({ x:t.x, y:t.y, r:r, w:t.w, d:t.d }); });
  reachable();
  puzzle();
  /* PUZZLES, the owner's call: about half the trails carry one, never two, and solving it pays a coin bonus as a
     small chest of its own (PZ_COINS of them, 300 for an easy puzzle). The local on that trail, or the world's
     greeter, gives a clue, so nobody is left guessing what the thing by the path is for. Four kinds:
       fire   three lights beside the path; walk past each to light it, and with all three lit the chest turns up
       dig    footprints run off the path to a spot; stand on it and the chest is dug up
       plate  the chest is in a pen whose gate opens off a plate in the ground, for a few seconds
       push   the chest is in a pen whose gap a crate is sitting in; push it away from the rock beside it
     IT IS PLACED LAST, ON ITS OWN RANDOM STREAM, after reachable() has settled the chest, the key and the coins. So a
     trail with no puzzle is exactly the trail it was, and nothing already on a trail moves for one that has. Its
     chest is a 'prize' and not a 'chest': every trail still has the one chest the owner asked for. The pens are
     baked into the land (BUILD.pen); their gate, the crate, the lights and the footprints are drawn by run().
     spec.pzKind forces a kind (or 'none'), for the checks. */
  function puzzle(){
    var RQ = rng(hstr('pz:' + (spec.key || '') + ':' + seed)), roll = RQ(), force = spec.pzKind;
    if (force === 'none' || (!force && roll >= PZ_SHARE)) return;
    var npc = items.filter(function(t){ return t.k === 'npc'; })[0], host = items.filter(function(t){ return t.k === 'host'; })[0];
    if (!npc && !host) return;   // nobody to give the clue: no puzzle
    var FL = P._fl, G0 = FL.flood(false);
    function reach(x, y, d){ return FL.near(G0, x, y, d || 1.2); }
    /* ROOM FOR IT. The land is full of trees, so a puzzle may clear the small things in its way (a tree, a bush, a
       rock: TREEH and LOWR) but never anything that stays: a landmark, a building, a lamp, the wall, the arch, or
       anything on the list. clearOut() takes them away once a spot is chosen; snap() and back() undo it if the rest of
       that puzzle then does not fit. */
    function room(x, y, r){ for (var i = 0; i < P.things.length; i++){ var t = P.things[i], tr = t.w ? Math.max(t.w, t.d) / 2 : (t.r || 0.5);
        if (!(TREEH[t.k] || LOWR[t.k]) && Math.hypot(t.x - x, t.y - y) < r + tr + 0.4) return false; } return true; }
    function clearOut(x, y, r){ var gone = P.things.filter(function(t){ return (TREEH[t.k] || LOWR[t.k]) && Math.hypot(t.x - x, t.y - y) < r + (t.r || 0.5) + 0.3; });
      if (!gone.length) return; function hit(o){ return gone.some(function(t){ return t.x === o.x && t.y === o.y; }); }
      P.things = P.things.filter(function(t){ return gone.indexOf(t) < 0; }); P.cols = P.cols.filter(function(c){ return !hit(c); });
      for (var u = used.length - 1; u >= 0; u--) if (hit(used[u])) used.splice(u, 1); }
    function snap(){ return [P.things.slice(), P.cols.slice(), used.slice(), items.length]; }
    function back(S0){ P.things = S0[0]; P.cols = S0[1]; used.length = 0; S0[2].forEach(function(u){ used.push(u); }); items.length = S0[3]; }
    function clearOf(x, y, r){ if (!room(x, y, r)) return false;
      for (var i = 0; i < items.length; i++){ var t = items[i]; if (Math.hypot(t.x - x, t.y - y) < r + 1.4) return false; if (t.drops) for (var j = 0; j < t.drops.length; j++) if (Math.hypot(t.drops[j][0] - x, t.drops[j][1] - y) < r + 0.6) return false; }
      return true; }
    function okAt(x, y, r){ return okGround(x, y, r) && !inClear(x, y, 1.5) && !(gy && Math.abs(y - gy) < r + 5) && y > 6 && y < L - 4 && clearOf(x, y, r); }
    // a spot this far off the walk, between these fractions of the way along it
    function spot(minD, maxD, r, s0, s1){ for (var t = 0; t < 240; t++){ var q = beside(SL * (s0 + RQ() * (s1 - s0)), RQ() < 0.5 ? -1 : 1, minD + RQ() * (maxD - minD)), x = q[0], y = q[1], wd = walkD(x, y);
        if (wd >= minD - 1 && wd <= maxD + 2 && okAt(x, y, r) && reach(x, y)){ clearOut(x, y, r); return [x, y]; } } return null; }
    // the prize's coins land round it on ground that can be walked to, and never on a pen's fence
    function pzDrops(x, y, n, pen){ var out = [], a0 = RQ() * 6.283;
      for (var i = 0; out.length < n && i < n * 30; i++){ var a = a0 + i * 2.39996, r = (pen ? 0.9 : 2.1) + (i % 4) * 0.45 + RQ() * 0.4, dx = x + Math.cos(a) * r, dy = y + Math.sin(a) * r * 0.8;
        if (pen && Math.abs(Math.hypot(dx - pen.x, dy - pen.y) - pen.r) < 0.9) continue; if (pen && Math.hypot(dx - x, dy - y) < 0.5) continue;
        if (okGround(dx, dy, 0.3) && !hitThing(dx, dy) && (pen ? Math.hypot(dx - pen.x, dy - pen.y) < pen.r - 0.6 || reach(dx, dy, 1.2) : reach(dx, dy, 1.2))) out.push([dx, dy]); }
      return out; }
    function prize(x, y, kind, pen){ var t = item('prize', x, y, { pz:kind, th:themeAt(y), n:PZ_COINS }); t.drops = pzDrops(x, y, PZ_COINS, pen); used.push({ x:x, y:y, r:2.5 }); return t; }
    // a pen with its gap facing the camera (+y), the way the lock gate's sprite is drawn
    function pen(minD, maxD){ var r = PEN_R;
      for (var t = 0; t < 12; t++){ var S0 = snap(), c = spot(minD, maxD, r + 1.2, 0.32, 0.86); if (!c) return null; var ok = true;
        for (var k = 0; k < 20 && ok; k++){ var a = k / 20 * 6.2832, px = c[0] + Math.cos(a) * r, py = c[1] + Math.sin(a) * r; if (!okGround(px, py, 0.4) || hitThing(px, py) || walkD(px, py) < PW + 1.2) ok = false; }
        for (var k2 = 0; k2 < 9 && ok; k2++){ var px2 = c[0] + ((k2 % 3) - 1) * r * 0.55, py2 = c[1] + (((k2 / 3) | 0) - 1) * r * 0.55; if (!okGround(px2, py2, 0.3) || hitThing(px2, py2)) ok = false; }
        if (ok && reach(c[0], c[1] + r + 1.8, 1.0)) return { x:c[0], y:c[1], r:r, a:Math.PI / 2, half:PEN_HALF }; back(S0); }
      return null; }
    var kinds = ['fire', 'dig', 'plate', 'push'], order = force ? [force] : kinds.map(function(k){ return [RQ(), k]; }).sort(function(a, c){ return a[0] - c[0]; }).map(function(q){ return q[1]; });
    var made = null, S9 = snap();
    // each kind that does not fit is undone whole before the next is tried (a 'continue' below skips to here)
    for (var oi = 0; oi < order.length && !made; oi++){ var k = order[oi]; back(S9);
      if (k === 'fire'){ var lit = [];
        for (var li = 0; li < 3; li++){ var sp3 = spot(PW + 1.4, PW + 2.8, 0.9, 0.24 + li * 0.21, 0.38 + li * 0.21); if (!sp3) break; lit.push(item('fire', sp3[0], sp3[1], { th:themeAt(sp3[1]), n:li })); used.push({ x:sp3[0], y:sp3[1], r:1.4 }); }
        var fp = lit.length === 3 && spot(6, 11, 2.4, 0.4, 0.82);
        if (fp){ var pf = prize(fp[0], fp[1], 'fire'); made = { k:'fire', prize:pf.id, lights:lit.map(function(q){ return q.id; }) }; } }
      else if (k === 'dig'){
        for (var dt0 = 0; dt0 < 12 && !made; dt0++){ var S1 = snap(), ds = spot(9, 15, 2.6, 0.35, 0.82); if (!ds) break;
          // where the tracks leave the walk: the nearest point of the path, at its edge, toward the spot
          var bs = 0, bd = 1e9; for (var ss = 0; ss <= SL; ss += 0.5){ var pq = atS(ss), dd2 = Math.hypot(pq[0] - ds[0], pq[1] - ds[1]); if (dd2 < bd){ bd = dd2; bs = ss; } }
          var p0 = atS(bs), ux = (ds[0] - p0[0]) / bd, uy = (ds[1] - p0[1]) / bd, sx2 = p0[0] + ux * (PW + 0.4), sy2 = p0[1] + uy * (PW + 0.4), len = Math.hypot(ds[0] - sx2, ds[1] - sy2), steps = [], good = true;
          for (var f = 0, n = 0; f < len - 0.4; f += 1.05, n++){ var lx = sx2 + ux * f + (n % 2 ? 1 : -1) * uy * 0.28, ly = sy2 + uy * f - (n % 2 ? 1 : -1) * ux * 0.28;
            if (!okGround(lx, ly, 0.3) || hitThing(lx, ly) || !reach(lx, ly, 1.0)) { good = false; break; } steps.push([lx, ly, Math.atan2(uy, ux)]); }
          // the chest comes up just past the spot, so it is never dug up under his feet
          var cxp = ds[0] + ux * 2.3, cyp = ds[1] + uy * 2.3;
          if (!good || steps.length < 5 || !okGround(cxp, cyp, 1.2) || hitThing(cxp, cyp) || !reach(cxp, cyp, 2.2)){ back(S1); continue; }
          var pd = prize(cxp, cyp, 'dig'); made = { k:'dig', prize:pd.id, spot:[ds[0], ds[1]], steps:steps }; } }
      else if (k === 'plate' || k === 'push'){ var pn = pen(PEN_R + PW + 2.5, 13); if (!pn) continue;
        if (k === 'plate'){ var gx = pn.x, gy2 = pn.y + pn.r, pl = null;
          for (var ps = 0; ps < 300 && !pl; ps++){ var q2 = beside(SL * RQ(), RQ() < 0.5 ? -1 : 1, PW + 1.2 + RQ() * 1.2), dg = Math.hypot(q2[0] - gx, q2[1] - gy2);
            if (dg >= 8 && dg <= 14 && Math.hypot(q2[0] - pn.x, q2[1] - pn.y) > pn.r + 3 && okAt(q2[0], q2[1], 0.9) && reach(q2[0], q2[1], 1.0)) pl = { x:q2[0], y:q2[1], t:PZ_GATE_S + dg * 0.18 }; }
          if (!pl) continue;
          place('pen', pn.x, pn.y, pn.r, 2.6, { a:pn.a, half:pn.half, th:themeAt(pn.y), gated:1 }); used.push({ x:pn.x, y:pn.y, r:pn.r + 2 }); used.push({ x:pl.x, y:pl.y, r:1.4 });
          var pp = prize(pn.x, pn.y, 'plate', pn); made = { k:'plate', prize:pp.id, pen:pn, plate:pl }; }
        else { var sj = RQ() < 0.5 ? -1 : 1, cy3 = pn.y + pn.r + 1.1, rx2 = pn.x + sj * 3.6, kx3 = JAM_ROCK[themeAt(cy3)] || 'rock';
          // the crate slides along x: from the rock's side it goes all the way across, toward the rock it jams
          var crate = { x:pn.x, y:cy3, x0:pn.x, lo:sj > 0 ? pn.x - 2.6 : pn.x - 0.6, hi:sj > 0 ? pn.x + 0.6 : pn.x + 2.6, rock:sj };
          var fits = okGround(rx2, cy3, 1) && !hitThing(rx2, cy3) && okGround(pn.x - sj * 2.8, cy3, 0.9) && !hitThing(pn.x - sj * 2.8, cy3) && reach(pn.x + sj * 1.9, cy3, 0.7) && reach(pn.x - sj * 3.6, cy3 + 1.5, 1.0);
          if (!fits) continue;
          place('pen', pn.x, pn.y, pn.r, 2.6, { a:pn.a, half:pn.half, th:themeAt(pn.y) }); used.push({ x:pn.x, y:pn.y, r:pn.r + 3 });
          var rk = place(kx3, rx2, cy3, 0.9, 1.4, { th:themeAt(cy3) }); P.cols.push({ x:rk.x, y:rk.y, r:0.9 });
          var pu = prize(pn.x, pn.y, 'push', pn); made = { k:'push', prize:pu.id, pen:pn, crate:crate }; } }
    }
    if (!made){ back(S9); return; }
    made.th = themeAt(items.filter(function(t){ return t.id === made.prize; })[0].y);
    made.clue = pzClue(made.k, made.th, RQ); made.name = PZ_NAME[made.k];
    P.puzzle = made; if (made.pen) P.pen = Object.assign({ gated:made.k === 'plate' }, made.pen);
    // the local stands near the start of the walk on a puzzle trail, so the clue comes before the puzzle does
    if (npc) for (var tn2 = 0; tn2 < 40; tn2++){ var nq2 = beside(SL * (0.06 + RQ() * 0.14), RQ() < 0.5 ? -1 : 1, PW + 1.6), nx2 = nq2[0], ny2 = nq2[1];
      if (okGround(nx2, ny2, 1) && free(nx2, ny2, 1) && !hitThing(nx2, ny2) && reach(nx2, ny2, 1.0)){ npc.x = nx2; npc.y = ny2; npc.th = themeAt(ny2); used.push({ x:nx2, y:ny2, r:1 }); break; } }
  }
  /* EVERY CHEST THE LIST NAMES CAN BE WALKED TO. Placement only ever asks whether a spot is dry and clear, never
     whether the golfer can get there, so nothing stops a chest ending up ringed by trunks and rocks, a clearing
     walled in by trees, or a key on the far side of a pond, and nothing would say so: the list would read Chest and
     the chest would not be had. Measured, no trail does that today; this is what keeps it so when the kits, the
     routes or the sizes move. So the plan floods the land from where the walk
     starts, with the same rules run() walks by but a fatter golfer (0.8 against 0.55, so a gap that only a grid's
     luck gets through does not count) (trunks, rocks, buildings, water, lava, the wall with its door
     open, the fence with or without the key), and moves whatever it cannot reach: the key to a reachable spot off
     the path, a chest to the shoulder of a reachable tree, and its coins onto ground that can be walked over. A
     clearing nobody can get into loses its lock rather than its chest. check-putt floods every trail again with
     its own copy of run()'s rules. */
  function reachable(){
    var RB = 0.8, RES = 0.5, NX = Math.ceil((b[2] - b[0]) / RES) + 1, NY = Math.ceil((b[3] - b[1]) / RES) + 1, CG = {};
    function ck(x, y){ return (x / 6 | 0) + ',' + (y / 6 | 0); }
    P.cols.forEach(function(c){ var ex = c.r + (c.w || 0) / 2 + 1, ey = c.r + (c.d || 0) / 2 + 1; for (var x = c.x - ex; x <= c.x + ex + 6; x += 6) for (var y = c.y - ey; y <= c.y + ey + 6; y += 6){ var k = ck(x, y); (CG[k] = CG[k] || []).push(c); } });
    function blockedAt(x, y, keyed, skip){ if (x < b[0] + 2.5 || x > b[2] - 2.5 || y > b[3] - 2 || y < -1.2) return true;
      var o = poolAt(x, y); if (o && (o.k === 'water' || o.k === 'lava')) return true; if (seaAt(x, y)) return true;
      var cs = CG[ck(x, y)] || []; for (var i = 0; i < cs.length; i++){ var c = cs[i]; if (c.w){ if (Math.abs(x - c.x) < c.w / 2 + RB && Math.abs(y - c.y) < c.d / 2 + RB) return true; } else if (Math.hypot(x - c.x, y - c.y) < c.r + RB) return true; }
      if (P.gate && Math.abs(y - P.gate.y) < 0.9 + RB && !(Math.abs(x - P.gate.x) < PW + 0.3)) return true;
      if (P.fence){ var F = P.fence, d = Math.hypot(x - F.x, y - F.y); if (Math.abs(d - F.r) < RB + 0.15){ var a = Math.atan2(y - F.y, x - F.x), da = Math.abs(Math.atan2(Math.sin(a - F.a), Math.cos(a - F.a))); if (!(keyed && da < F.half)) return true; } }
      for (var j = 0; j < items.length; j++){ var t = items[j]; if (t === skip) continue; if ((t.k === 'chest' || t.k === 'npc') && Math.hypot(x - t.x, y - t.y) < (t.k === 'chest' ? 1.3 : 1.0) + RB) return true; }
      return false; }
    function flood(keyed, skip){ var G = new Uint8Array(NX * NY), g0 = atS(2), i0 = Math.round((g0[0] - b[0]) / RES), j0 = Math.round((g0[1] - b[1]) / RES), st = [j0 * NX + i0]; G[st[0]] = 1;
      while (st.length){ var q = st.pop(), i = q % NX, j = (q / NX) | 0;
        for (var n = 0; n < 4; n++){ var ii = i + (n === 0 ? 1 : n === 1 ? -1 : 0), jj = j + (n === 2 ? 1 : n === 3 ? -1 : 0); if (ii < 0 || jj < 0 || ii >= NX || jj >= NY) continue; var o = jj * NX + ii; if (G[o]) continue;
          if (blockedAt(b[0] + ii * RES, b[1] + jj * RES, keyed, skip)){ G[o] = 2; continue; } G[o] = 1; st.push(o); } }
      return G; }
    function near(G, x, y, d){ var i0 = Math.floor((x - d - b[0]) / RES), i1 = Math.ceil((x + d - b[0]) / RES), j0 = Math.floor((y - d - b[1]) / RES), j1 = Math.ceil((y + d - b[1]) / RES);
      for (var j = Math.max(0, j0); j <= Math.min(NY - 1, j1); j++) for (var i = Math.max(0, i0); i <= Math.min(NX - 1, i1); i++) if (G[j * NX + i] === 1 && Math.hypot(b[0] + i * RES - x, b[1] + j * RES - y) < d) return true; return false; }
    // a reachable cell this far from the path, off the clearings: for a key, or a chest that has to move
    function cellOff(G, minD, maxD, clearOf){ for (var t = 0; t < 400; t++){ var i = (R() * NX) | 0, j = (R() * NY) | 0; if (G[j * NX + i] !== 1) continue; var x = b[0] + i * RES, y = b[1] + j * RES, wd = walkD(x, y);
        if (wd < minD || wd > maxD || inClear(x, y, 1.5) || (gy && Math.abs(y - gy) < 6) || y < 6 || y > L - 4 || hitThing(x, y)) continue;
        if (clearOf && items.some(function(o){ return o !== clearOf && Math.hypot(o.x - x, o.y - y) < 2.5; })) continue; return [x, y]; } return null; }
    P._fl = { flood:flood, near:near };   // for the puzzle, placed after this has settled everything else
    var G0 = flood(false), key = items.filter(function(t){ return t.k === 'key'; })[0];
    // the key first: on the walkable side of everything, or the lock comes off
    if (P.fence && (!key || !near(G0, key.x, key.y, 1.3))){ var kp = cellOff(G0, PW + 3, 18, key);
      if (kp){ if (key){ key.x = kp[0]; key.y = kp[1]; } else key = item('key', kp[0], kp[1]); }
      else { P.fence = null; P.lockGate = null; P.locked = false; P.things = P.things.filter(function(t){ return t.k !== 'fence'; }); if (key) items.splice(items.indexOf(key), 1); key = null; } }
    items.filter(function(t){ return t.k === 'chest'; }).forEach(function(c){
      var G = P.fence && c.main ? flood(true, c) : flood(false, c);
      if (!near(G, c.x, c.y, 2.4)){
        // a clearing that cannot be got into: the chest moves out, and a lock with nothing behind it goes
        if (c.main && P.fence){ P.fence = null; P.lockGate = null; P.locked = false; P.things = P.things.filter(function(t){ return t.k !== 'fence'; }); var kk2 = items.filter(function(t){ return t.k === 'key'; })[0]; if (kk2) items.splice(items.indexOf(kk2), 1); }
        G = flood(false, c); var trees = P.things.filter(function(t){ return (TREEH[t.k] || LOWR[t.k]) && walkD(t.x, t.y) > 4 && walkD(t.x, t.y) < 14; }), sp = null;
        for (var tt = 0; tt < 60 && trees.length && !sp; tt++){ var t = trees[(R() * trees.length) | 0], sd = R() < 0.5 ? -1 : 1, hx = t.x + sd * ((t.r || 1) + 1.4), hy = t.y - (t.r || 1) * 0.6 - 0.6;
          if (near(G, hx, hy, 2.4) && okGround(hx, hy, 1.2) && !hitThing(hx, hy) && !inClear(hx, hy, 1.5)) sp = [hx, hy]; }
        sp = sp || cellOff(G, 4, 14, c) || cellOff(G, PW + 2, 20, c); if (sp){ c.x = sp[0]; c.y = sp[1]; c.main = 0; c.drops = drops(c.x, c.y, c.n); } }
      // and every coin it throws lands where it can be picked up
      var G2 = flood(!!P.fence, c); c.drops = c.drops.filter(function(d){ return near(G2, d[0], d[1], 1.2); });
      for (var tc = 0; tc < 200 && c.drops.length < c.n; tc++){ var a = R() * 6.283, r = 2.2 + R() * 2.6, dx = c.x + Math.cos(a) * r, dy = c.y + Math.sin(a) * r * 0.8;
        if (near(G2, dx, dy, 1.2) && okGround(dx, dy, 0.3) && !hitThing(dx, dy)) c.drops.push([dx, dy]); } });
  }
  /* SHADOWS ON THE GROUND. The light comes from the upper left, the same as the golfer's, so everything tall
     throws a soft shadow down and to the right. It is what sets a tree on the ground rather than over it. */
  var SH = []; P.things.forEach(function(t){ var H = t.h || 1; if (H < 1.6 && !t.w) return; var rx, ry, cx2, cy2;
    if (t.w){ rx = t.w / 2 + H * 0.18; ry = t.d / 2 + H * 0.12; cx2 = t.x + H * 0.22; cy2 = t.y + H * 0.16; }
    else { var cr = t.cr || t.r * 1.4; rx = cr * 1.05 + 0.4; ry = cr * 0.75 + 0.3; cx2 = t.x + H * 0.2; cy2 = t.y + H * 0.14; }
    if (t.k === 'arch' || t.k === 'wall' || t.k === 'fence' || t.k === 'pen' || t.k === 'green') return; SH.push({ x:cx2, y:cy2, rx:rx, ry:ry }); });
  // keyed by a number, not a string: shadeAt is asked once for every pixel of ground
  var SG = new Map(), sgk = function(x, y){ return Math.floor(x / 6) * 65536 + Math.floor(y / 6); };
  SH.forEach(function(o){ for (var x = o.x - o.rx; x <= o.x + o.rx + 6; x += 6) for (var y = o.y - o.ry; y <= o.y + o.ry + 6; y += 6){ var k = sgk(x, y), a = SG.get(k); if (!a) SG.set(k, a = []); a.push(o); } });
  P.shadeAt = function(x, y){ var cs = SG.get(sgk(x, y)); if (!cs) return 0; var v = 0;
    for (var i = 0; i < cs.length; i++){ var o = cs[i], u = (x - o.x) / o.rx, w = (y - o.y) / o.ry, d = u * u + w * w; if (d < 1) v = Math.max(v, d < 0.7 ? 1 : 0.5); } return v; };
  return P;
}
// a tree's height, how much it can vary, and its crown's radius (ft, at the trail's scale)
var TREEH = { broad:[13, 5, 4.2], pine:[14, 6, 3.4], palm:[12, 4, 3.6], cactus:[5, 3, 1.6], dead:[10, 4, 3.4], basalt:[6, 5, 1.6], puff:[9, 4, 3.6], pylon:[10, 4, 1.4], cab:[5.2, 0.4, 1.6], corn:[5, 1, 1.2] };
var LOWR = { bush:1.1, bushf:1.1, rock:1.1, fern:1, shell:0.5, bushdry:0.9, rockdark:1, ember:0.6, rocksnow:1.2, bushsnow:1.1, puffsmall:1.2, rainbowrock:0.9, cube:0.8, cone:0.6, tomb:0.9, pumpkin:0.8, hay:1.1 };
var LOWH = { bush:1.8, bushf:1.8, rock:1.4, fern:1.6, shell:0.4, bushdry:1.2, rockdark:1.4, ember:0.8, rocksnow:1.6, bushsnow:1.8, puffsmall:1.6, rainbowrock:1.3, cube:1.4, cone:1.2, tomb:2.2, pumpkin:1.2, hay:1.6 };
// what part of a thing stops the golfer (a tree stops him at its trunk, not its crown)
/* PLANTS ARE WALKED THROUGH. A bush or a fern is never a wall: it is drawn live rather than baked into the land,
   and as the golfer pushes through it the leaves bend away from him, rustle, and spring back once he is past. */
var PLANT = { bush:1, bushf:1, fern:1, bushdry:1, bushsnow:1 };
var BLOCKR = { pin:0.1, broad:0.6, pine:0.7, palm:0.5, cactus:0.7, dead:0.6, basalt:1.2, puff:0.8, pylon:0.8, cab:1.1, corn:0.5, lamp:0.3, shell:0, ember:0, bushf:0.9 };
// landmark footprints: width, depth, height
var LMSIZE = { shed:[9, 6, 11], green:[9, 7, 1], bench:[3, 1.2, 2], lamps:[1, 1, 7], ruin:[10, 3, 9], statue:[3, 3, 8], columns:[8, 5, 9], wreck:[12, 5, 7], boat:[6, 3, 3], barrels:[4, 3, 2.4],
  mesa:[11, 8, 13], tower:[5, 5, 15], cart:[5, 2.5, 3.5], basaltset:[7, 6, 9], vent:[5, 5, 4], skull:[5, 4, 5], igloo:[7, 7, 5], snowman:[3, 3, 5.5], cabin:[9, 6, 11],
  balloon:[6, 6, 16], kite:[3, 3, 12], pillar:[5, 5, 12], cabinets:[8, 2.5, 6.5], sign:[8, 1.5, 11], pylons:[6, 6, 12], crypt:[8, 6, 10], graves:[9, 6, 3], fenceyard:[9, 6, 3],
  barn:[11, 8, 13], scarecrow:[3, 2, 7], cornfield:[10, 8, 5], school:[12, 8, 13], swings:[8, 3, 6], slide:[4, 6, 5], mammoth:[9, 4, 6.5], cave:[10, 7, 6], tusks:[7, 2, 5] };

/* ------------------------------------------------------------------------------- the ground */
function land(P){
  var b = P.b, seed = P.seed, L = P.L, cx = P.cx, sp = P.spec;
  function kAt(y){ return kitOf(P.themeAt(y)); }
  return {
    gain:1.4,
    bg:kitOf(sp.theme).g[0],
    // a hole is flat ground, its rails and blocks stand up off it, its water and cup sit down in it
    h:function(x, y){ var fc = P.footAt(x, y); if (fc) return fc.c === 10 ? 0.42 : fc.c === 11 ? 0.55 : fc.c === 12 ? -0.3 : (fc.c === 5 || fc.c === 9) ? -0.3 : 0.05;
      var wd = P.walkD(x, y), z = (fbm(x * 0.045, y * 0.045, seed) - 0.45) * 2.4 * sm(PW + 0.5, PW + 7, wd);
      if (P.inClear(x, y)) z *= 0.3; if (P.deckAt(x, y)){ var dk = P.creekD(x, y) + P.creek.hw; return 0.22 + 0.4 * Math.max(0, 1 - dk * dk / ((P.creek.hw + 1.1) * (P.creek.hw + 1.1))); }
      if (P.creek){ var cd = P.creekD(x, y); if (cd < 1.4 && cd > 0) z = Math.min(z, -0.12 * (1.4 - cd)); } var o = P.poolAt(x, y); if (o) z = o.k === 'lava' ? -0.45 : o.k === 'water' ? -0.55 : o.k === 'ice' ? -0.05 : -0.12;
      if (P.seaAt(x, y)) z = -0.7; if (wd < PW) z -= 0.06; return z; },
    mat:function(x, y){ var fc = P.footAt(x, y);
      if (fc){ var c = fc.c, q = fc.i; return [c === 10 ? 'cr' + q : c === 11 ? 'cb' + q : c === 12 ? 'cup' : c === 4 ? 'sand' : (c === 5 || c === 9) ? 'water' : c === 6 ? 'ice' : c === 7 ? 'bog' : c === 3 ? 'g' : c === 2 ? 'cf' + q : 'cc' + q]; }
      if (P.deckAt(x, y)) return ['deck', { pl:Math.floor((y - P.creek.cy(x)) * 2.2 + 50) }];
      var o = P.poolAt(x, y); if (o) return [o.k === 'slow' ? 'bog' : o.k]; if (P.seaAt(x, y)) return ['water'];
      if (P.creek && P.creek.k !== 'ice' && P.creekD(x, y) < 0.7) return [P.creek.k === 'lava' ? 'scorch' : 'bank'];
      var wd = P.walkD(x, y), sh = P.shadeAt(x, y) * (P.fx ? 0.4 : 1), ex = sh ? { sh:sh } : null;   // under the console look the sun casts the real shadow, so the painted one is only a contact shade
      if (!P.feet.length && y < -1.5 && y > -16 && Math.abs(x - P.arch.x) < 7.5) return [Math.abs(x - P.arch.x) > 6.6 || y < -15.2 || y > -2.3 ? 'rail' : 'carpet'];
      var dc = Math.hypot(x - P.clr.x, y - P.clr.y) - P.clr.r, ds = Math.hypot(x - P.start.x, y - P.start.y) - (P.start.r - 1), dIn = Math.min(wd - PW, dc, ds);
      if (dIn < 0){ if (dIn > -0.35){ ex = ex || {}; ex.edge = 1; } return [P.themeAt(y) === sp.theme ? 'path' : 'path0', ex]; }
      if (P.sea && P.sea.side * x > P.seaEdge(y) - 3.5) return ['sand', ex];
      if (dIn < 0.3){ ex = ex || {}; ex.edge = 1; }
      var fb = vn(x * 0.22, y * 0.22, seed + 77); if (fb > 0.74 && dIn > 1.2){ ex = ex || {}; ex.fl = Math.min(0.55, (fb - 0.74) * 4); }
      return [P.themeAt(y) === sp.theme ? 'g' : 'g0', ex]; },
    build:function(B){ P.things.forEach(function(t, i){ if (PLANT[t.k]) return; try{ (BUILD[t.k] || BUILD.rock)(B, t, i, P); }catch(e){} }); },
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
  var out = {
    g:['', '', '', 0, gfn(k)], g0:['', '', '', 0, gfn(k0)], path:['', '', '', 0, pfn(k)], path0:['', '', '', 0, pfn(k0)],
    water:['', '', '', 0, lfn((P.sea ? ['#1f8fc8', '#5cc6ee'] : ['#3f86c8', '#6fb3e6']), 13)],
    lava:['', '', '', 0, lfn(['#ff6a1a', '#ffc23a'], 9)], ice:['', '', '', 0, lfn(['#a8dcf4', '#e2f6ff'], 23)], bog:['', '', '', 0, lfn(k.bogC || ['#5d4634', '#7a6044'], 17)],
    sand:['#ecdba4', '#f4e4b4', '#dcc88c', 0.2],
    carpet:[T.carpet || '#2f8f4e', T.carpet2 || '#2a8246', T.carpet || '#2f8f4e', 0.16], rail:[T.wall || '#f4efe2', T.wallHi || '#ffffff', T.wall || '#f4efe2', 0.1],
    cup:['#141414', '#202020', '#141414', 0],
    // a bridge's deck, planks laid across the walk (stone slabs in the temple and the volcano), and the creek's banks
    deck:['', '', '', 0, function(c, R, h3){ var st = P.creek && (P.themeAt(P.creek.y0) === 'volcano' || P.themeAt(P.creek.y0) === 'temple'), n = h3(c.ti, c.tj, 31), m = ((c.pl % 2) + 2) % 2;
      var cols = st ? ['#8a8078', '#9a9088', '#5e564f'] : P.creek && P.themeAt(P.creek.y0) === 'neon' ? ['#2a3a90', '#3a4ab0', '#151c48'] : ['#a8865a', '#b8966a', '#6e5236'];
      return R(n < 0.04 ? cols[2] : m ? cols[0] : cols[1]); }],
    bank:['#8a7a62', '#9a8a70', '#6e624e', 0.3], scorch:['#2a2226', '#3a2e30', '#4a2a22', 0.25]
  };
  // each real hole in its own colours: carpet, fringe, rail and block
  P.feet.forEach(function(o, i){ var C = o.f.T; out['cc' + i] = [C.carpet, C.carpet2, C.carpet, 0.16]; out['cf' + i] = [C.carpet2, C.carpet2, C.carpet, 0.1];
    out['cr' + i] = [C.wall, C.wallHi, C.wall, 0.1]; out['cb' + i] = [C.block, C.wall, C.block, 0.12]; });
  return out;
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
  var fx = x + 1.5, fy = y - 12.5; if (P.feet.length && P.spec.holeTo){ fx = P.feet[0].cup[0]; fy = P.feet[0].cup[1]; } var fz = B.gz(fx, fy);   // the hole's flag on its pin, in its real cup
  B.solid(fx - 0.3, fy - 0.3, fz, fx + 2.2, fy + 0.3, fz + 5.6, function(px, py, pz){ var tt = pz - fz; if (Math.hypot(px - fx, py - fy) < 0.1 && tt < 5.5) return '#ffffff';
    if (px > fx && px < fx + 2 && tt > 4 && tt < 5.4 && Math.abs(py - fy) < 0.06) return T.flag || '#e53935'; return null; }, 0.125); };
BUILD.pin = function(B, t){ var fx = t.x, fy = t.y, fz = B.gz(fx, fy);
  B.solid(fx - 0.3, fy - 0.3, fz, fx + 2.2, fy + 0.3, fz + 5.6, function(px, py, pz){ var tt = pz - fz; if (Math.hypot(px - fx, py - fy) < 0.1 && tt < 5.5) return '#ffffff';
    if (px > fx && px < fx + 2 && tt > 4 && tt < 5.4 && Math.abs(py - fy) < 0.06) return t.col || '#e53935'; return null; }, 0.125); };
/* a bridge over the creek: a rail either side of the deck, posts along it, in wood or in the world's stone */
BUILD.bridge = function(B, t){ var x = t.x, y = t.y, tx = t.tx, ty = t.ty, hl = t.half, off = PW + 0.45, zt = B.gz(x, y), stone = t.th === 'volcano' || t.th === 'temple', neon = t.th === 'neon';
  var post = stone ? '#6e665e' : neon ? '#ff2bd6' : '#6e5236', rail = stone ? '#9a9088' : neon ? '#2bf0ff' : '#a8865a', snow = t.th === 'frozen', ext = hl + 0.6;
  var xs = [x - tx * ext, x + tx * ext, x - ty * (off + 0.4), x + ty * (off + 0.4)], ys = [y - ty * ext, y + ty * ext, y + tx * (off + 0.4), y - tx * (off + 0.4)];
  B.solid(Math.min.apply(null, xs) - 0.5, Math.min.apply(null, ys) - 0.5, zt - 1.2, Math.max.apply(null, xs) + 0.5, Math.max.apply(null, ys) + 0.5, zt + 1.7, function(px, py, pz){
    var dx = px - x, dy = py - y, u = dx * tx + dy * ty, v = -dx * ty + dy * tx; if (Math.abs(u) > ext || Math.abs(Math.abs(v) - off) > 0.14) return null;
    var zd = zt - 0.4 * Math.min(1, (u * u) / (hl * hl + 0.01)), tt = pz - zd;   // the deck humps over the middle, and the rails with it
    if (tt < -0.9 || tt > 1.45) return null;
    var ps = Math.abs(u - Math.round(u / 1.4) * 1.4) < 0.14; if (ps && tt < 1.45) return snow && tt > 1.3 ? '#f6f9fd' : post;
    if (Math.abs(tt - 1.25) < 0.12) return snow ? '#f6f9fd' : rail; if (Math.abs(tt - 0.65) < 0.08 && !stone) return rail;
    if (stone && tt < 1.15 && tt > 0) return (Math.floor(u * 2) + Math.floor(tt * 3)) % 2 ? rail : post;
    return null; }, 0.125); };
/* the wall between two worlds, the width of the land with a doorway on the path, in the new world's stone */
BUILD.wall = function(B, t, i, P){ var kx = kitOf(P.spec.theme), y = t.y, gx = t.gx, b = P.b, c1 = kx.wall[0], c2 = kx.wall[1];
  for (var x0 = b[0]; x0 < b[2]; x0 += 8){ var x1 = Math.min(b[2], x0 + 8); (function(x0, x1){ var zb = B.gz((x0 + x1) / 2, y);
    B.solid(x0, y - 0.9, zb - 0.6, x1, y + 0.9, zb + 7.4, function(px, py, pz){ var dx = Math.abs(px - gx), tt = pz - zb; if (Math.abs(py - y) > 0.8) return null;
      if (dx < PW + 0.4) return null;   // the doorway
      if (dx < PW + 1.4){ if (tt > 7.2) return null; return (tt * 2 | 0) % 2 ? c2 : c1; }   // the posts either side of it
      if (tt > 6.2){ if (Math.floor(px / 1.2) % 2 && tt < 6.9) return c1; if (tt > 6.4) return null; }
      return ((Math.floor(tt / 0.75) + (Math.floor(px / 1.5) % 2)) % 2) && (px * 4 | 0) % 6 ? c1 : c2; }, 0.25); })(x0, x1); } };
/* the fence round a locked clearing, a gap for its gate */
BUILD.fence = function(B, t, i, P){ ringFence(B, P.fence, t.th); };
// a puzzle's pen: the same fence round its own centre, its gap the gate (or the crate's gap)
BUILD.pen = function(B, t){ ringFence(B, t, t.th); };
function ringFence(B, F, th){ var n = 40, kx = kitOf(th), post = kx === KIT.neon ? '#ff2bd6' : '#7a5a3a', rail = kx === KIT.neon ? '#2bf0ff' : '#a8865a';
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
// ---- Schoolyard: the school with its bell, a swing set, a slide
BUILD.school = function(B, t){ gable(B, t.x, t.y, t.w - 1, t.d - 1, 7, 3.4, function(dx, dy, tt){ return ((Math.floor(tt / 0.5) % 2) ? ((dx * 2 + 40 | 0) % 2) : ((dx * 2 + 40.5 | 0) % 2)) ? '#b5452e' : '#a33c27'; }, function(){ return '#4a4e56'; }, '#2b6a95');
  box(B, t.x, t.y, 2, 2, 13, function(dx, dy, tt){ if (tt < 10.2) return null; var m = Math.max(Math.abs(dx), Math.abs(dy));
    if (tt < 12){ if (m < 0.75 && m > 0.55 && Math.abs(Math.abs(dx) - Math.abs(dy)) < 0.2) return '#f6f3ea'; if (Math.hypot(dx, dy) < 0.32 + (11.6 - tt) * 0.12 && tt > 10.6 && tt < 11.6) return '#e2b33a'; return null; }
    return m < 0.9 * (1 - (tt - 12) / 0.9) ? '#c0392b' : null; }, 0.125); };
BUILD.swings = function(B, t){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var ft = 1.2 * (1 - tt / 5.4);
  if (Math.abs(tt - 5.4) < 0.16 && Math.abs(dy) < 0.16 && Math.abs(dx) < 3.8) return '#e53935';
  if (tt < 5.4 && Math.abs(Math.abs(dx) - 3.6) < 0.15 && Math.abs(Math.abs(dy) - ft) < 0.15) return '#c62828';
  for (var k = -1; k <= 1; k++){ var sx = k * 1.8; if (tt > 1.1 && tt < 5.4 && Math.abs(Math.abs(dx - sx) - 0.35) < 0.06 && Math.abs(dy) < 0.07) return '#8a8f99';
    if (Math.abs(dx - sx) < 0.5 && Math.abs(dy) < 0.26 && tt > 0.92 && tt < 1.14) return '#2b6a95'; }
  return null; }, 0.125); };
BUILD.slide = function(B, t){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var tc = 3.3 - (dy + 0.4) * 1.0;
  if (dy > -0.4 && dy < 2.7){ if (Math.abs(dx) < 0.55 && tt < tc && tt > tc - 0.18) return '#ffd23f'; if (Math.abs(Math.abs(dx) - 0.6) < 0.1 && tt < tc + 0.3 && tt > tc - 0.18) return '#f0a400'; }
  if (dy <= -0.4 && dy > -1.5 && Math.abs(dx) < 0.7 && tt > 3.15 && tt < 3.35) return '#2b6a95';
  if (Math.abs(Math.abs(dx) - 0.62) < 0.09 && Math.abs(Math.abs(dy + 0.95) - 0.5) < 0.09 && tt < 4.4) return '#2b6a95';
  if (Math.abs(dy + 1.6) < 0.08 && Math.abs(dx) < 0.55 && tt < 3.2 && (tt % 0.55) < 0.09) return '#c9d2dc';
  if (Math.abs(dy + 1.6) < 0.08 && Math.abs(Math.abs(dx) - 0.5) < 0.08 && tt < 3.4) return '#8a8f99';
  if (tt > 4.3 && tt < 4.9 && Math.abs(dx) < 0.85 && dy > -1.6 && dy < -0.3) return (tt > 4.7) ? '#e53935' : null;
  return null; }, 0.125); };
// ---- Ice Age: a woolly mammoth, a cave with paintings at its mouth, an arch of two great tusks
BUILD.mammoth = function(B, t, i){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var fur = function(){ var n = hash(Math.floor(dx * 5), Math.floor(tt * 5) + Math.floor(dy * 5) * 13, 7 + i); return n < 0.2 ? '#5a3c22' : n > 0.85 ? '#9a6e44' : '#7a5434'; };
  if (tt < 2.2 && Math.abs(Math.abs(dx) - 1.5) < 0.42 && Math.abs(Math.abs(dy) - 0.7) < 0.4) return tt < 0.3 ? '#3a281a' : '#6a4a2e';
  if (Math.hypot(dx / 2.6, dy / 1.4, (tt - 3.3) / 1.7) < 1) return tt > 4.4 && dx < 0 ? '#5a3c22' : fur();
  if (Math.hypot((dx - 2.5) / 1.1, dy / 1.0, (tt - 3.8) / 1.1) < 1) return (Math.abs(Math.abs(dy) - 0.45) < 0.12 && Math.abs(tt - 4.1) < 0.12 && dx > 3.1) ? '#1a120c' : fur();
  if (dx > 3.0 && dx < 3.6 && Math.abs(dy) < 0.28 && tt > 0.6 && tt < 3.6 && Math.abs(dx - 3.3 - (tt < 1.2 ? (1.2 - tt) * 0.4 : 0)) < 0.28) return '#6a4a2e';
  if (Math.abs(Math.abs(dy) - 0.55) < 0.14 && dx > 3 && dx < 4.6 && Math.abs(tt - (2.5 + (dx - 3) * (dx - 3) * 0.55)) < 0.16) return '#f4ead2';
  return null; }, 0.125); };
BUILD.cave = function(B, t, i){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var d = Math.hypot(dx / (t.w / 2), dy / (t.d / 2), tt / t.h) + (vn(dx * 0.7, tt * 0.7, i) - 0.5) * 0.18; if (d > 1) return null;
  var mouth = dy > 0 && Math.abs(dx) < 1.5 && tt < 2.6 * (1 - Math.pow(dx / 1.5, 2) * 0.5); if (mouth) return d > 0.86 ? null : '#1a1612';
  if (dy > t.d / 2 * 0.55 && tt > 2.4 && tt < 3.5 && Math.abs(dx - 2.3) < 1 && hash(Math.floor(dx * 6), Math.floor(tt * 6), 5 + i) < 0.3) return '#b5452e';
  if (tt > t.h * 0.82) return '#f6f9fd'; return ((tt * 1.4 + dx * 0.3) | 0) % 2 ? '#7a6e62' : '#6a5e54'; }, 0.25); };
BUILD.tusks = function(B, t){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ if (Math.abs(dy) > 0.32 || tt < 0) return null;
  for (var s = -1; s <= 1; s += 2){ var cx = s * 2.6, r = Math.hypot(dx - cx, tt); if (Math.abs(r - 3.1 + tt * 0.06) < 0.24 + (3.6 - tt) * 0.06 && s * (dx - cx) <= 0.4 && tt < 4.6) return tt < 0.5 ? '#8a7658' : '#f4ead2'; }
  return null; }, 0.125); };

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
  harvest:{ fly:['crow', 3], mote:['leaf', 16] },
  school:{ fly:['song', 4], mote:[['leaf', 10], ['butter', 6]] },
  iceage:{ mote:['snow', 60], fly:['crow', 2] }
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
function slices(P){ var H3 = window.RTT_PUTT_3D; if (!H3) return null; P.fx = window.RTT_PUTT_FX !== 'off';
  return H3.slices(sceneC(P), { elev:ELEV, art:TART, fx:P.fx, scene:{ b:P.b, land:land(P), zMax:20, clearAt:function(x, y){ return P.walkD(x, y) - PW - 0.5; } } }); }
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
  trashcan:function(B, x, y){ box(B, x, y, 1.4, 1.4, 1.9, function(dx, dy, tt){ var r = Math.hypot(dx, dy); if (tt > 1.55) return r < 0.62 && tt < 1.7 ? '#9aa2ac' : (r < 0.12 && tt < 1.85 ? '#6a727c' : null); if (r > 0.55) return null; return ((Math.atan2(dy, dx) * 5 + 20) | 0) % 2 ? '#8a929c' : '#7a828c'; }, 0.125); },
  pumpkin:function(B, x, y){ BUILD.pumpkin(B, { x:x, y:y }, 1); },
  hay:function(B, x, y){ BUILD.hay(B, { x:x, y:y }, 1); }
};
/* THE CHEST, a proper treasure chest: oak planks with grain, iron bands, gold corner caps and a gold lock plate on
   a domed lid that swings back on its hinge. It is drawn at five lid angles (lid 0 shut .. 1 thrown open) so the
   opening plays as an animation; open, it shows a red lining and a heap of gold. Back is -y, the front faces the camera.
   NOTHING ON IT IS A SQUARE EDGE. The footprint is a rounded rectangle (CH_RC), the sides bow out a little, the foot and
   the rim are bevelled, and the lid's ends are rounded into its dome, all on an eighth of a voxel's finer grid, because
   at this size a straight edge and a right angle are what made it read as a box of blocks. */
var CH_W = 1.55, CH_D = 0.95, CH_H = 1.25, CH_R = 0.95, CH_RC = 0.5;   // half width, half depth, body height, lid radius, corner radius
function rrect(x, y, hw, hd, rc){ var qx = Math.max(Math.abs(x) - (hw - rc), 0), qy = Math.max(Math.abs(y) - (hd - rc), 0); return Math.hypot(qx, qy) - rc; }   // < 0 inside, the distance out of a rounded rectangle
function chestFn(lid, sv){ var th = lid * 1.8, ct = Math.cos(th), st = Math.sin(th);
  var WOOD = ['#7a4520', '#8e5428', '#a5652f', '#5c3216'], IRON = ['#3a3a44', '#5c5c6a', '#8a8a98'], GOLD = ['#b07a10', '#ffd23a', '#fff1a0'], VEL = '#8a1626';
  function wood(u, w, ex){ var gr = hash(Math.floor(u * 9), Math.floor(w * 3 + ex), 17), seam = Math.abs((w * 3.4 + ex) % 1) < 0.1; return seam ? WOOD[3] : gr < 0.2 ? WOOD[0] : gr > 0.85 ? WOOD[2] : WOOD[1]; }
  function band(x){ return Math.abs(Math.abs(x) - 0.9) < 0.11; }
  return function(B){ box(B, 0, 0, 3.6, 6.2, 4.4, function(dx, dy, tt){
    if (Math.abs(dx) > CH_W + 0.1) return null;
    // the body: a rounded rectangle that bows out at the middle of its height, bevelled into the ground and under the rim
    if (tt < CH_H){
      var bow = 0.07 * Math.sin(Math.PI * Math.max(0, Math.min(1, tt / CH_H))), bev = Math.max(0, 0.16 - tt) + Math.max(0, tt - (CH_H - 0.1)) * 0.8,
          sd = rrect(dx, dy, CH_W + bow - bev, CH_D + bow - bev, CH_RC);
      if (sd > 0) return null;
      var inside = rrect(dx, dy, CH_W - 0.13, CH_D - 0.13, CH_RC - 0.1) < 0 && tt > 0.18;
      if (inside && lid > 0.2){ var top = 0.62 + (lid > 0.6 ? 0.28 * (1 - Math.hypot(dx / CH_W, dy / CH_D)) : 0);
        if (tt > top) return null; return tt > top - 0.13 ? (hash(dx * 8 | 0, dy * 8 | 0, 3) < 0.35 ? GOLD[2] : GOLD[1]) : VEL; }
      if (tt < 0.1) return IRON[0];
      var rim = sd > -0.12;   // the outer skin, where the gold caps and the iron bands sit
      if (rim && Math.abs(dx) > CH_W - CH_RC * 0.55 && Math.abs(dy) > CH_D - CH_RC * 0.55) return tt > CH_H - 0.16 || tt < 0.26 ? GOLD[2] : GOLD[1];   // a gold cap down the round of each corner
      if (dy > 0 && rim && Math.abs(dx) < 0.24 && tt > CH_H - 0.5){ if (Math.abs(dx) < 0.06 && tt > CH_H - 0.36 && tt < CH_H - 0.16) return '#2a1a06'; return Math.abs(dx) > 0.17 ? GOLD[0] : GOLD[1]; }   // the lock plate and its keyhole
      if (band(dx)) return Math.abs(dx) > 0.75 ? IRON[1] : IRON[2];
      if (Math.abs(tt - (CH_H - 0.06)) < 0.07) return IRON[1];
      return wood(dx, tt, dy > 0 ? 0 : 0.5); }
    // the lid: a half barrel on the hinge at the back top edge, turned back by th, its ends rounded into the dome
    var v1 = dy + CH_D, w1 = tt - CH_H, v = v1 * ct + w1 * st, w = -v1 * st + w1 * ct, vc = v - CH_D;
    if (v < 0 || v > 2 * CH_D || w < -0.02) return null;
    if (rrect(dx, vc, CH_W, CH_D, CH_RC) > 0) return null;   // the lid's footprint matches the body's rounded corners
    var endK = Math.max(0, Math.abs(dx) - (CH_W - CH_RC)) / CH_RC, dome = (Math.sqrt(Math.max(0, 1 - (vc * vc) / (CH_D * CH_D))) * CH_R * 0.7 + 0.12) * Math.sqrt(Math.max(0, 1 - endK * endK * 0.75));
    if (w > dome) return null;
    var shell = w > dome - 0.14 || rrect(dx, vc, CH_W, CH_D, CH_RC) > -0.12;
    if (!shell) return WOOD[3];
    if (endK > 0.45 && Math.abs(vc) > CH_D - CH_RC * 0.55) return GOLD[1];
    if (vc > CH_D - 0.16 && Math.abs(dx) < 0.2 && w < 0.42) return Math.abs(dx) > 0.12 ? GOLD[0] : GOLD[2];   // the hasp
    if (w < 0.1 && lid > 0.2) return endK > 0 ? GOLD[0] : WOOD[3];   // the inside of the lid, dark, as it swings back
    if (band(dx)) return w > dome - 0.08 ? IRON[2] : IRON[1];
    if (endK > 0.35) return Math.hypot(vc, w - 0.25) < 0.18 ? GOLD[1] : WOOD[0];   // the rounded end caps, a gold boss in each
    return wood(dx, vc * 1.4 + 2, 0.25); }, sv || 0.0625); }; }
function gateFn(open, P){ var kx = kitOf(P.spec.theme), c1 = kx.wall[0], c2 = kx.wall[1];
  return function(B){ box(B, 0, 0, PW * 2 + 1, 1.2, 6.8, function(dx, dy, tt){ if (Math.abs(dy) > 0.25) return null; var half = PW + 0.4;
    if (open){ var leaf = Math.abs(Math.abs(dx) - half) < 0.25 && tt < 6.4; return leaf ? c2 : null; }
    if (Math.abs(dx) > half || tt > 6.4) return null; if (Math.abs(dx) < 0.1) return c2; return (Math.floor(dx / 0.55) % 2 && tt < 6.1 && tt > 0.3) ? '#3a2a1a' : c1; }, 0.125); }; }
// a puzzle's light: a stone or iron stand with a bowl on top, in the world's wall colours; the flame is drawn by run()
function brazierFn(th){ var kx = kitOf(th), c1 = (kx.wall || ['#c8b890'])[0], c2 = (kx.wall || [0, '#8a7a5a'])[1] || '#8a7a5a';
  return function(B){ box(B, 0, 0, 1.4, 1.4, 1.9, function(dx, dy, tt){ var r = Math.hypot(dx, dy);
    if (tt < 1.2) return r < 0.26 ? (tt < 0.16 || tt > 1.06 ? c2 : c1) : (tt < 0.2 && r < 0.55 ? c2 : null);
    if (tt < 1.62){ var rr = 0.3 + (tt - 1.2) * 1.05; if (r > rr) return null; if (tt > 1.48 && r < rr - 0.14) return '#2a1a10'; return ((Math.atan2(dy, dx) * 4 + 10) | 0) % 2 ? c2 : '#4a3a2c'; }
    return null; }, 0.125); }; }
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
  // he stands just inside the start, facing the way the walk leaves it (it may set off sideways, not up the screen)
  var g0 = P.atS ? P.atS(2) : [P.start.x, P.start.y - 2], t0 = P.tanS ? P.tanS(4) : [0, -1], a00 = Math.round(Math.atan2(t0[0], -t0[1]) / (Math.PI / 4)) * Math.PI / 4;
  var g = { x:g0[0], y:g0[1], vx:0, vy:0, face:[Math.sin(a00), -Math.cos(a00)], dist:0, safe:[g0[0], g0[1]], moving:false };
  var gate = P.gate ? { open:!!sp.gateOpen, asked:false } : null, cloud = api.clouds && P.gate ? { part:0 } : null, lockOpen = !P.fence || !!found.key;
  /* A chest is open if this account opened it (found.ch); the clearing's chest also counts as open on a record
     from before chests held coins (found.k), and those coins were paid then, so none drop. The coins of an open
     chest that were not picked up are still lying where they landed. */
  var chOpen = function(t){ return (found.ch || []).indexOf(t.id) >= 0; }, legacyK = function(t){ return t.main && found.k && !chOpen(t); };
  var items = [];
  P.items.forEach(function(t){ var o = Object.assign({}, t); o.done = t.k === 'chest' ? chOpen(t) || legacyK(t) : t.k === 'golden' ? !!found.g : t.k === 'key' ? !!found.key : t.k === 'life' ? !!found.life : t.k === 'trinket' ? !!found.tk : t.k === 'part' ? !!found.pt : t.k === 'prize' ? !!found.pz : false; items.push(o);
    if (t.k === 'chest') (t.drops || []).forEach(function(d, i){ var cid = t.id + ':' + i; items.push({ k:'coin', id:cid, x:d[0], y:d[1], ch:o, done:legacyK(t) || (found.c || []).indexOf(cid) >= 0, out:chOpen(t), fly:null }); });
    if (t.k === 'prize') (t.drops || []).forEach(function(d, i){ var cid = t.id + ':' + i; items.push({ k:'coin', id:cid, x:d[0], y:d[1], ch:o, done:(found.c || []).indexOf(cid) >= 0, out:!!found.pz, fly:null }); }); });
  /* THE PUZZLE, if this trail has one (plan's puzzle()). solved is the record's (found.pz): a solved puzzle's chest is
     open, its gate stays open, its crate stays pushed aside and its lights stay lit. */
  var PZ = P.puzzle ? { k:P.puzzle.k, solved:!!found.pz, lit:{}, shown:!!found.pz, openUntil:0, dug:0, crate:P.puzzle.crate ? Object.assign({}, P.puzzle.crate) : null, said:false } : null;
  if (PZ && PZ.crate && PZ.solved) PZ.crate.x = PZ.crate.rock > 0 ? PZ.crate.lo : PZ.crate.hi;
  var prizeIt = PZ ? items.filter(function(t){ return t.k === 'prize'; })[0] : null;
  // the prize is out of the ground for the dig and the lights only once they are done; a pen's sits in the pen from the start, as bait
  function prizeShown(){ return !!PZ && (PZ.shown || PZ.k === 'plate' || PZ.k === 'push'); }
  function pzGateOpen(){ if (!PZ || PZ.k !== 'plate') return true; if (PZ.solved || performance.now() < PZ.openUntil) return true; var P2 = P.pen; return Math.hypot(g.x - P2.x, g.y - (P2.y + P2.r)) < 1.9; }
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
    for (var j = 0; j < items.length; j++){ var t = items[j]; if ((t.k === 'chest' || t.k === 'npc') && Math.hypot(x - t.x, y - t.y) < (t.k === 'chest' ? 1.3 : 1.0) + R) return true;
      if (t.k === 'fire' && Math.hypot(x - t.x, y - t.y) < 0.6 + R) return true; if (t.k === 'prize' && prizeShown() && Math.hypot(x - t.x, y - t.y) < 1.3 + R) return true; }
    if (P.pen){ var PN = P.pen, dp = Math.hypot(x - PN.x, y - PN.y); if (Math.abs(dp - PN.r) < R + 0.15){ var ap = Math.atan2(y - PN.y, x - PN.x), dap = Math.abs(Math.atan2(Math.sin(ap - PN.a), Math.cos(ap - PN.a))); if (!(dap < PN.half && pzGateOpen())) return true; } }
    if (PZ && PZ.crate && Math.abs(x - PZ.crate.x) < CRATE_H + R && Math.abs(y - PZ.crate.y) < CRATE_H + R) return true;
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
    var foot = pic.pr(x, y, z0)[1], key = a0 + ',' + a1 + ',' + b0 + ',' + b1 + ',' + x + ',' + y + ',' + z0, m = OCC.get(key);
    // asked twice for the same thing standing in the same place: what stands in front of it is one picture, kept
    if (m === 0){ m = occMask(a0, a1, b0, b1, y, z0, foot); OCC.set(key, m); }
    if (m){ ctx.drawImage(m, ox + a0 * kk, oy + b0 * kk, m.width * kk, m.height * kk); ctx.globalAlpha = 1; return; }
    if (m === false){ ctx.globalAlpha = 1; return; }
    if (OCC.size > 600) OCC.clear(); OCC.set(key, 0);
    for (var ay = b0; ay <= b1; ay++){ var z = z0 + (foot - ay - 0.5) * ART / CE; if (z < z0) z = z0; var dp = y * CE + z * SE, row = (ay + pic.zy0) * pic.ZW, run = -1;
      for (var ax = a0; ax <= a1 + 1; ax++){ var front = ax <= a1 && pic.Z[row + ax] > dp + 0.35;
        if (front && run < 0) run = ax; else if (!front && run >= 0){ ctx.drawImage(pic.cv, run, ay, ax - run, 1, ox + run * kk, oy + ay * kk, (ax - run) * kk, kk); run = -1; } } }
    ctx.globalAlpha = 1; }
  /* THE SCENE IN FRONT OF A THING THAT STANDS STILL is the same strips of picture every frame: a run of pixels a row,
     a drawImage a run, hundreds a frame for a wood of bushes and a chest or two. So the second time the same thing is
     asked about in the same place, those pixels go into one small picture, transparent wherever the scene is behind
     it, and it is drawn in one call. The same pixels at the same scale, so the same frame. What moves (the golfer,
     a bobbing find) asks about a new place each frame and keeps drawing the strips. */
  var OCC = new Map(), picPx = null;
  function occMask(a0, a1, b0, b1, y, z0, foot){ var w = a1 - a0 + 1, h = b1 - b0 + 1; if (w <= 0 || h <= 0) return false;
    if (!picPx) picPx = pic.cv.getContext('2d').getImageData(0, 0, pic.cv.width, pic.cv.height).data;
    var id = new ImageData(w, h), d = id.data, any = false, cw = pic.cv.width;
    for (var ay = b0; ay <= b1; ay++){ var z = z0 + (foot - ay - 0.5) * ART / CE; if (z < z0) z = z0; var dp = y * CE + z * SE, row = (ay + pic.zy0) * pic.ZW;
      for (var ax = a0; ax <= a1; ax++) if (pic.Z[row + ax] > dp + 0.35){ var si = (ay * cw + ax) * 4, di = ((ay - b0) * w + (ax - a0)) * 4; d[di] = picPx[si]; d[di + 1] = picPx[si + 1]; d[di + 2] = picPx[si + 2]; d[di + 3] = picPx[si + 3]; any = true; } }
    if (!any) return false; var c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').putImageData(id, 0, 0); return c; }
  function drawSprite(sp2, x, y, z, k2, noOcc){ if (!sp2) return; k2 = k2 || 1; var p = scr(x, y, z), w = sp2.cv.width * kk * k2, h = sp2.cv.height * kk * k2, rx = Math.round(p[0] - sp2.ax * kk * k2), ry = Math.round(p[1] - sp2.ay * kk * k2);
    ctx.drawImage(sp2.cv, rx, ry, w, h); if (!noOcc) occlude(rx, ry, w, h, x, y, z); }
  var brkKind = function(t){ return kitOf(t.th || sp.theme).brk; };
  function prop(name, fn, w, d, h){ return propSprite(name, P, fn, w, d, h); }
  var SPR = {
    chest:[0, 0.22, 0.5, 0.78, 1].map(function(l){ return prop('chestv4:' + l, chestFn(l), 4.4, 6.4, 5.4); }),
    gate0:P.gate ? prop('gate0:' + sp.theme, gateFn(false, P), PW * 2 + 1, 1.2, 7) : null, gate1:P.gate ? prop('gate1:' + sp.theme, gateFn(true, P), PW * 2 + 1, 1.2, 7) : null,
    lock0:P.fence || (P.pen && P.pen.gated) ? prop('lock0', lockGateFn(false), 3.4, 1, 3) : null, lock1:P.fence || (P.pen && P.pen.gated) ? prop('lock1', lockGateFn(true), 3.4, 1, 3) : null,
    crate:P.puzzle && P.puzzle.crate ? prop('pzcrate', function(B){ BRK.crate(B, 0, 0); }, 1.8, 1.8, 2) : null
  };
  function fireSprite(t){ return prop('pzfire:' + t.th, brazierFn(t.th), 1.6, 1.6, 2.2); }
  // a plant's sprite, three of each kind a world so a hedge of them is not one bush stamped over and over
  var plants = []; P.things.forEach(function(t, i){ if (PLANT[t.k]) plants.push({ t:t, v3:i % 3, b:0, vb:0, sq:0, in:false, x:t.x, y:t.y, r:LOWR[t.k] || 1 }); });
  function plantSprite(q){ var t = q.t, k = t.k + ':' + kitOf(t.th).leaves.join('') + ':' + q.v3; return prop('plant:' + k, function(B){ BUILD[t.k](B, { k:t.k, x:0, y:0, th:t.th, h:t.h }, 3 + q.v3 * 5); }, 3.2, 3, 2.6); }
  function stepPlants(dt){ for (var i = 0; i < plants.length; i++){ var q = plants[i], dx = q.x - g.x, dy = q.y - g.y, d = Math.hypot(dx, dy), reach = q.r + 0.9, inside = d < reach;
      if (!inside && Math.abs(q.b) < 0.003 && Math.abs(q.vb) < 0.003 && q.sq < 0.003){ q.b = q.vb = q.sq = 0; q.in = false; continue; }
      var push = inside ? 1 - d / reach : 0, side = dx === 0 ? (g.vx > 0 ? 1 : -1) : (dx > 0 ? 1 : -1), tgt = side * push * (0.55 + Math.min(1, Math.hypot(g.vx, g.vy) / SPEED) * 0.45);
      if (inside && !q.in){ q.vb += side * 2.6; rustle(q); } q.in = inside;
      // a spring, a little underdamped, so it swings back past upright once and settles
      q.vb += ((tgt - q.b) * 70 - q.vb * 7) * dt; q.b += q.vb * dt; q.sq += ((push * 0.22) - q.sq) * Math.min(1, dt * 10); } }
  function rustle(q){ if (reduce) return; var kx = kitOf(q.t.th), z = pic.zAt(q.x, q.y) + 1.4; for (var i = 0; i < 4; i++){ var a = Math.random() * 6.28, s1 = 1 + Math.random() * 1.6;
      parts.push({ x:q.x + Math.cos(a) * 0.5, y:q.y + Math.sin(a) * 0.4, z:z, vx:Math.cos(a) * s1, vy:Math.sin(a) * s1 * 0.6, vz:2 + Math.random() * 2.5, c:kx.leaves[i % kx.leaves.length], t:0.35 }); } }
  // bent: the plant drawn in strips of one art pixel, each shifted by how high it stands, so the top leans most
  function drawPlant(q){ var sp2 = plantSprite(q); if (!sp2) return; var z = pic.zAt(q.x, q.y), p = scr(q.x, q.y, z), w = sp2.cv.width * kk, h = sp2.cv.height * kk, rx = Math.round(p[0] - sp2.ax * kk), ry = Math.round(p[1] - sp2.ay * kk);
    if (rx > W || ry > H || rx + w < 0 || ry + h < 0) return;
    var bend = reduce ? 0 : q.b, sq = reduce ? 0 : q.sq;
    if (Math.abs(bend) < 0.01 && sq < 0.01) ctx.drawImage(sp2.cv, rx, ry, w, h);
    else { var rows = sp2.cv.height, base = sp2.ay, top = 0;
      for (var a = 0; a < rows; a++){ var u = Math.max(0, (base - a) / Math.max(1, base)), off = Math.round(bend * u * u * 9) * kk, ny = Math.round(p[1] - (base - a) * (1 - sq * u) * kk);
        ctx.drawImage(sp2.cv, 0, a, sp2.cv.width, 1, rx + off, ny, w, kk); } }
    occlude(rx - 8 * kk, ry, w + 16 * kk, h, q.x, q.y, z); }
  function brkSprite(t){ var k = brkKind(t); return prop('brk:' + k, function(B){ (BRK[k] || BRK.crate)(B, 0, 0); }, 1.8, 1.8, 2); }
  // the local is the 3D golfer model, in the world's own clothes, standing and facing the path
  function npcFrame(t){ var G = window.RTT_G3D; if (!G || !G.frame) return null; var face = t.x < P.near(t.x, t.y)[0] ? 90 : -90; try{ return G.frame(Object.assign({ shoes:'white', club:'driver', lefty:false }, kitOf(t.th).npc), face, 'walk', 8); }catch(e){ return null; } }
  var IMG = {}; function img(u){ var im = IMG[u]; if (!im){ im = IMG[u] = new Image(); im.src = u; } return im; }
  /* A frame not yet decoded is never a blank: who drew a frame last keeps it on screen until the new one is ready,
     or the golfer blinks out for a frame every time his foot or his facing changes. */
  var lastFig = {};
  function drawFigure(f, x, y, see, who){ if (!f || !f.url){ if (!who || !lastFig[who]) return null; f = lastFig[who].f; }
    var im = img(f.url); if (!im.complete || !im.naturalWidth){ var lf = who && lastFig[who]; if (!lf) return null; f = lf.f; im = lf.im; } else if (who) lastFig[who] = { f:f, im:im };
    var hgt = GH * CE / ART * kk, k2 = hgt / f.fig, p = scr(x, y), rx = Math.round(p[0] - f.ball[0] * k2), ry = Math.round(p[1] - f.ball[1] * k2), rw = Math.round(f.W * k2), rh = Math.round(f.H * k2);
    ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(im, rx, ry, rw, rh); ctx.restore(); occlude(rx, ry, rw, rh, x, y, pic.zAt(x, y), see); return [rx, ry, rw, rh]; }
  // a coin is drawn at the scene's own pixel size, so it sits in it
  function drawCoin(t, now){ var f = t.fly;
    if (f && now < f.t0 + f.dur){ if (now < f.t0) return; var u = (now - f.t0) / f.dur, fx = f.x0 + (t.x - f.x0) * u, fy = f.y0 + (t.y - f.y0) * u, fz = f.z0 + (pic.zAt(t.x, t.y) + 0.4 - f.z0) * u + Math.sin(u * Math.PI) * 3.2;
      var fp = scr(fx, fy, fz), fs = Math.max(2, Math.round(kk)), fw = Math.max(1, Math.round(Math.abs(Math.cos(now * 14 + t.x)) * 5));
      ctx.fillStyle = '#7a5200'; ctx.fillRect(Math.round(fp[0] - (fw / 2 + 1) * fs), Math.round(fp[1] - 6 * fs), (fw + 2) * fs, 6 * fs); ctx.fillStyle = '#ffd23a'; ctx.fillRect(Math.round(fp[0] - fw / 2 * fs), Math.round(fp[1] - 5 * fs), fw * fs, 4 * fs); return; }
    var z = pic.zAt(t.x, t.y) + 1.1 + Math.sin(now * 3 + t.x) * 0.12, p = scr(t.x, t.y, z), s = Math.max(2, Math.round(kk)), w = Math.max(1, Math.round(Math.abs(Math.cos(now * 3.2 + t.y)) * 5)), h = 6;
    var shp = scr(t.x, t.y); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(Math.round(shp[0] - 2 * s), Math.round(shp[1] - s / 2), 4 * s, s);
    var rx = Math.round(p[0] - w * s / 2), ry = Math.round(p[1] - h * s); ctx.fillStyle = '#7a5200'; ctx.fillRect(rx - s, ry, (w + 2) * s, h * s); ctx.fillRect(rx, ry - s, w * s, (h + 2) * s);
    ctx.fillStyle = '#ffd23a'; ctx.fillRect(rx, ry, w * s, h * s); ctx.fillStyle = '#fff3a8'; if (w > 2) ctx.fillRect(rx + s, ry + s, s, (h - 2) * s);
    occlude(rx - s, ry - s, (w + 2) * s, (h + 2) * s, t.x, t.y, pic.zAt(t.x, t.y)); }
  /* a find: its own picture, bigger than a coin, bobbing over a pool of its colour, in a column of its own light
     that shows over the trees, so you can see what it is and where it is from a long way off */
  function drawLoot(t, now){ var L = LOOT[t.k], rows = L.rows, pal = lootPal(t), bc = lootBeam(t), z = pic.zAt(t.x, t.y) + 1.4 + Math.sin(now * 2.2 + t.x) * 0.2, p = scr(t.x, t.y, z),
      s = Math.max(2, Math.round(kk * 1.25)), w = rows[0].length, h = rows.length, shp = scr(t.x, t.y), pu = 0.5 + 0.5 * Math.sin(now * 3 + t.y);
    if (bc){ var bw = 9 * s, bh = Math.round(H * 0.45), gr = ctx.createLinearGradient(0, shp[1] - bh, 0, shp[1]);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      gr.addColorStop(0, 'rgba(' + bc + ',0)'); gr.addColorStop(0.6, 'rgba(' + bc + ',' + (0.18 + 0.08 * pu).toFixed(2) + ')'); gr.addColorStop(1, 'rgba(' + bc + ',' + (0.4 + 0.15 * pu).toFixed(2) + ')'); ctx.fillStyle = gr; ctx.fillRect(Math.round(shp[0] - bw / 2), Math.round(shp[1] - bh), bw, bh);
      ctx.fillStyle = 'rgba(' + bc + ',' + (0.35 + 0.15 * pu).toFixed(2) + ')'; ctx.fillRect(Math.round(shp[0] - s), Math.round(shp[1] - bh), 2 * s, bh);
      ctx.beginPath(); ctx.ellipse(shp[0], shp[1], 7 * s, 2.6 * s, 0, 0, 7); ctx.fill(); ctx.restore(); }
    var rx = Math.round(p[0] - w * s / 2), ry = Math.round(p[1] - h * s);
    for (var yy = 0; yy < h; yy++) for (var xx = 0; xx < w; xx++){ var ch = rows[yy][xx]; if (ch === '.') continue; ctx.fillStyle = pal[ch] || pal.r; ctx.fillRect(rx + xx * s, ry + yy * s, s, s); }
    sparkle(p[0], ry, now, s); occlude(rx, ry, w * s, h * s, t.x, t.y, pic.zAt(t.x, t.y)); }
  /* THE CHEST AND WHAT COMES OUT OF IT. Shut, it glints and a warm light sits under it, so it reads as treasure from
     across the clearing. Walked up to, it rattles, the lock pops, the lid swings back through four drawings with a
     little squash, light pours out of it in rays, and then the coins spray out. Opened on an earlier visit it just
     stands open with its gold showing. */
  var CH_SHAKE = 0.32, CH_LID = 0.42, CH_COINS = 0.62;
  /* A LIGHT: its stand, and once lit a flame flickering on it in the world's own colour (cool in the ice worlds, green
     in the haunted one, cyan in the arcade), and a glow on the ground round it. */
  function drawFire(t, now){ var z = pic.zAt(t.x, t.y); drawSprite(fireSprite(t), t.x, t.y, z);
    if (!(PZ.solved || PZ.shown || PZ.lit[t.id])) return; var fc = PZ_FLAME[t.th] || ['#ff8a1f', '#ffe08a'], fz = z + 1.75;
    var gp = scr(t.x, t.y); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,200,120,0.14)'; ctx.beginPath(); ctx.ellipse(gp[0], gp[1], 9 * kk, 3.6 * kk, 0, 0, 7); ctx.fill(); ctx.restore();
    for (var i = 0; i < 5; i++){ var ph = now * 7 + i * 1.7 + t.n * 3, h = 0.18 + i * 0.13 + Math.sin(ph) * 0.05; sq(t.x + Math.sin(ph * 1.3) * 0.08 * (i % 2 ? 1 : -1), t.y, fz + h, 0.34 - i * 0.05, i < 2 ? fc[0] : fc[1], 0.95 - i * 0.12); } }
  /* ON THE GROUND: the footprints and the spot they lead to (a dark hole once dug), and the plate (gold while it holds
     the gate open). Drawn flat, under everything that stands. */
  function drawPzGround(now){ var Pz = P.puzzle, dark = !!pic.night || /^(volcano|neon|haunted)$/.test(sp.theme);
    if (Pz.k === 'dig'){ ctx.fillStyle = dark ? 'rgba(255,240,210,.32)' : 'rgba(50,30,12,.38)';
      Pz.steps.forEach(function(q){ var p = scr(q[0], q[1]); ctx.beginPath(); ctx.ellipse(p[0], p[1], 1.6 * kk, 0.8 * kk, 0, 0, 7); ctx.fill(); });
      var sp0 = scr(Pz.spot[0], Pz.spot[1]), w = 4 * kk;
      if (PZ.shown){ ctx.fillStyle = 'rgba(30,18,6,.7)'; ctx.beginPath(); ctx.ellipse(sp0[0], sp0[1], w * 1.4, w * 0.6, 0, 0, 7); ctx.fill(); }
      else { ctx.strokeStyle = dark ? 'rgba(255,230,180,.6)' : 'rgba(90,40,10,.7)'; ctx.lineWidth = Math.max(2, kk * 0.9); ctx.beginPath(); ctx.moveTo(sp0[0] - w, sp0[1] - w * 0.45); ctx.lineTo(sp0[0] + w, sp0[1] + w * 0.45); ctx.moveTo(sp0[0] + w, sp0[1] - w * 0.45); ctx.lineTo(sp0[0] - w, sp0[1] + w * 0.45); ctx.stroke(); } }
    if (Pz.k === 'plate'){ var pl = Pz.plate, on = pzGateOpen() && !PZ.solved, h = 0.8, c = [[pl.x - h, pl.y - h], [pl.x + h, pl.y - h], [pl.x + h, pl.y + h], [pl.x - h, pl.y + h]].map(function(q){ return scr(q[0], q[1]); });
      ctx.fillStyle = on ? '#ffd23a' : '#8a8478'; ctx.strokeStyle = on ? '#fff3a8' : '#4a463e'; ctx.lineWidth = Math.max(2, kk * 0.6); ctx.beginPath(); ctx.moveTo(c[0][0], c[0][1]); for (var i = 1; i < 4; i++) ctx.lineTo(c[i][0], c[i][1]); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (on){ ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,210,70,' + (0.18 + 0.12 * Math.sin(now * 10)).toFixed(2) + ')'; var pc = scr(pl.x, pl.y); ctx.beginPath(); ctx.ellipse(pc[0], pc[1], 8 * kk, 3.4 * kk, 0, 0, 7); ctx.fill(); ctx.restore(); } } }
  function drawChest(t, now){ var z = pic.zAt(t.x, t.y), fr = SPR.chest, e = t.openAt != null ? now - t.openAt : (t.done ? 99 : -1), k, ox2 = 0, sy = 1, shp = scr(t.x, t.y);
    if (!fr) return;
    if (e < 0){ k = 0; var pu = 0.5 + 0.5 * Math.sin(now * 2.4 + t.x);   // shut: a warm pool of light and a glint now and then
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,200,70,' + (0.16 + 0.12 * pu).toFixed(2) + ')'; ctx.beginPath(); ctx.ellipse(shp[0], shp[1], 13 * kk, 5 * kk, 0, 0, 7); ctx.fill(); ctx.restore(); }
    else if (e < CH_SHAKE){ k = 0; var a = 1 - e / CH_SHAKE; ox2 = Math.round(Math.sin(e * 70) * 1.6 * kk * a); }
    else if (e < CH_SHAKE + CH_LID){ var u = (e - CH_SHAKE) / CH_LID; k = 1 + Math.min(3, Math.floor(u * 4)); sy = 1 - 0.07 * Math.sin(u * Math.PI); }
    else k = 4;
    var sp2 = fr[k]; if (!sp2) return;
    // rays: from the moment the lid lifts until a while after, fanning up out of the chest
    if (!reduce && e >= CH_SHAKE + 0.1 && e < 2.8){ var re = e - CH_SHAKE - 0.1, ra = Math.min(1, re / 0.25) * Math.max(0, 1 - Math.max(0, re - 1.2) / 1.2), mp = scr(t.x, t.y, z + 1.3), L0 = 60 * kk;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; for (var r = 0; r < 9; r++){ var an = -Math.PI / 2 + (r - 4) * 0.2 + Math.sin(now * 1.3 + r) * 0.04, len = L0 * (0.6 + 0.4 * Math.abs(Math.sin(r * 2.1 + now * 2))), wd = 0.07;
        var gr = ctx.createLinearGradient(mp[0], mp[1], mp[0] + Math.cos(an) * len, mp[1] + Math.sin(an) * len); gr.addColorStop(0, 'rgba(255,230,140,' + (0.55 * ra).toFixed(2) + ')'); gr.addColorStop(1, 'rgba(255,230,140,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(mp[0], mp[1]); ctx.lineTo(mp[0] + Math.cos(an - wd) * len, mp[1] + Math.sin(an - wd) * len); ctx.lineTo(mp[0] + Math.cos(an + wd) * len, mp[1] + Math.sin(an + wd) * len); ctx.closePath(); ctx.fill(); }
      ctx.restore(); }
    var p = scr(t.x, t.y, z), w = sp2.cv.width * kk, h = sp2.cv.height * kk, h2 = Math.round(h * sy), rx = Math.round(p[0] - sp2.ax * kk) + ox2, ry = Math.round(p[1] - sp2.ay * kk * sy);
    // a shut chest behind a tree shows through it faintly, the way the golfer does: tucked away, never invisible
    ctx.drawImage(sp2.cv, rx, ry, w, h2); occlude(rx, ry, w, h2, t.x, t.y, z, e < 0);
    if (e < 0){ var gl = (now * 0.7 + t.x * 0.13) % 1; if (gl < 0.22){ var gu = gl / 0.22, gs = Math.max(2, Math.round(kk)), gp = scr(t.x - 0.9 + gu * 1.8, t.y + 0.9, z + 1.25 + Math.sin(gu * Math.PI) * 0.3);
      ctx.fillStyle = 'rgba(255,255,255,' + Math.sin(gu * Math.PI).toFixed(2) + ')'; ctx.fillRect(Math.round(gp[0] - gs / 2), Math.round(gp[1] - 2 * gs), gs, 4 * gs); ctx.fillRect(Math.round(gp[0] - 2 * gs), Math.round(gp[1] - gs / 2), 4 * gs, gs); } } }

  /* WHAT YOU PICK UP DOES NOT JUST VANISH. It pops up out of the ground and grows, turns once in the air with a ring
     of light round it, then flies to where it is kept on screen (a coin to the coin count, a find to its own row in
     the list) leaving a trail, and that spot pulses as it lands. A word rises where it was: +3, Golden ball, Key. */
  var fxs = [], texts = [], rings = [];
  function hudPt(el){ if (!el || !el.getBoundingClientRect) return null; var r = el.getBoundingClientRect(), c = cv.getBoundingClientRect(); if (!r.width) return null; return [(r.left + r.width / 2 - c.left) * dpr, (r.top + r.height / 2 - c.top) * dpr]; }
  function bump(el){ if (!el) return; el.classList.remove('pp-bump'); void el.offsetWidth; el.classList.add('pp-bump'); }
  function floatText(txt, x, y, z, col, big){ texts.push({ txt:txt, x:x, y:y, z:z, col:col || '#ffd23a', t0:performance.now() / 1000, big:!!big }); }
  function ring(x, y, col){ rings.push({ x:x, y:y, col:col, t0:performance.now() / 1000 }); }
  function collect(t, now, kind){ var z = pic.zAt(t.x, t.y), coin = kind === 'coin', tgt = coin ? function(){ return ui.querySelector('[data-coins]'); } : t.k === 'golden' ? function(){ var gEl = ui.querySelector('[data-gold]'); return gEl && gEl.textContent ? gEl : ui.querySelector('[data-tlist] span[data-id="' + t.id + '"]'); } : function(){ return ui.querySelector('[data-tlist] span[data-id="' + t.id + '"]'); };
    fxs.push({ t:t, coin:coin, t0:now, z:z + (coin ? 0.8 : 1.4), tgt:tgt, up:coin ? 0.16 : 0.32, hold:coin ? 0.04 : 0.28, fly:coin ? 0.55 : 0.55, trail:[] }); if (!coin) ring(t.x, t.y, lootBeam(t) || '255,214,64'); }
  function drawPix(rows, pal, cx, by, s, sx){ var w = rows[0].length, h = rows.length, rx = cx - w * s * sx / 2, ry = by - h * s;
    for (var yy = 0; yy < h; yy++) for (var xx = 0; xx < w; xx++){ var ch = rows[yy][xx]; if (ch === '.') continue; ctx.fillStyle = pal[ch] || pal.r; ctx.fillRect(Math.round(rx + xx * s * sx), Math.round(ry + yy * s), Math.max(1, Math.ceil(s * sx)), s); } }
  function coinPix(cx, cy, s, sx){ var w = Math.max(1, Math.round(5 * sx)), h = 6; ctx.fillStyle = '#7a5200'; ctx.fillRect(Math.round(cx - (w / 2 + 1) * s), Math.round(cy - h / 2 * s), (w + 2) * s, h * s); ctx.fillRect(Math.round(cx - w / 2 * s), Math.round(cy - (h / 2 + 1) * s), w * s, (h + 2) * s);
    ctx.fillStyle = '#ffd23a'; ctx.fillRect(Math.round(cx - w / 2 * s), Math.round(cy - h / 2 * s), w * s, h * s); if (w > 2){ ctx.fillStyle = '#fff3a8'; ctx.fillRect(Math.round(cx - w / 2 * s + s), Math.round(cy - h / 2 * s + s), s, (h - 2) * s); } }
  function drawFx(now){ var s0 = Math.max(2, Math.round(kk * 1.25));
    // rings on the ground where a find was
    rings = rings.filter(function(q){ var u = (now - q.t0) / 0.6; if (u >= 1) return false; var p = scr(q.x, q.y); ctx.save(); ctx.strokeStyle = 'rgba(' + q.col + ',' + (1 - u).toFixed(2) + ')'; ctx.lineWidth = Math.max(2, kk * 1.5) * (1 - u * 0.6);
      ctx.beginPath(); ctx.ellipse(p[0], p[1], (3 + u * 14) * kk, (1.2 + u * 5.5) * kk, 0, 0, 7); ctx.stroke(); ctx.restore(); return true; });
    fxs = fxs.filter(function(f){ var e = now - f.t0, t = f.t, base = scr(t.x, t.y, f.z), dur = f.up + f.hold + f.fly, x, y, sc, spin = 1;
      if (reduce){ e = Math.max(e, dur - 0.12); }
      if (e < f.up){ var u = e / f.up, eo = 1 - (1 - u) * (1 - u); x = base[0]; y = base[1] - eo * 2.4 * kk * 8 / 3; sc = 1 + eo * (f.coin ? 0.4 : 0.9); spin = Math.cos(u * Math.PI * 2); }
      else if (e < f.up + f.hold){ var u2 = (e - f.up) / f.hold; x = base[0]; y = base[1] - 2.4 * kk * 8 / 3 + Math.sin(u2 * Math.PI) * -2 * kk; sc = f.coin ? 1.4 : 1.9; spin = Math.cos(u2 * Math.PI * 2);
        if (!f.coin){ ctx.save(); ctx.globalCompositeOperation = 'lighter'; var bc = lootBeam(t) || '255,214,64'; ctx.fillStyle = 'rgba(' + bc + ',' + (0.35 * Math.sin(u2 * Math.PI)).toFixed(2) + ')'; ctx.beginPath(); ctx.arc(x, y - 4 * s0, (10 + u2 * 6) * s0, 0, 7); ctx.fill(); ctx.restore(); } }
      else { var u3 = Math.min(1, (e - f.up - f.hold) / f.fly), el = f.tgt(), tp = hudPt(el) || [W / 2, -40], sxp = base[0], syp = base[1] - 2.4 * kk * 8 / 3, ez = u3 < 0.5 ? 2 * u3 * u3 : 1 - Math.pow(-2 * u3 + 2, 2) / 2;
        x = sxp + (tp[0] - sxp) * ez; y = syp + (tp[1] - syp) * ez - Math.sin(u3 * Math.PI) * 30 * dpr; sc = (f.coin ? 1.4 : 1.9) * (1 - 0.55 * ez); spin = f.coin ? Math.cos(u3 * Math.PI * 4) : 1;
        f.trail.push([x, y]); if (f.trail.length > 7) f.trail.shift();
        if (u3 >= 1){ bump(el); return false; } }
      // the trail behind it, fading
      for (var i = 0; i < f.trail.length; i++){ var a = (i + 1) / (f.trail.length + 1); ctx.fillStyle = 'rgba(255,240,170,' + (a * 0.7).toFixed(2) + ')'; var ts = Math.max(1, Math.round(s0 * a * 1.4)); ctx.fillRect(Math.round(f.trail[i][0] - ts / 2), Math.round(f.trail[i][1] - 3 * s0 - ts / 2), ts, ts); }
      var s = Math.max(1, Math.round(s0 * sc));
      if (f.coin) coinPix(x, y - 3 * s, s, Math.abs(spin));
      else { var L = LOOT[t.k]; drawPix(L.rows, lootPal(t), x, y, s, Math.max(0.15, Math.abs(spin))); if (e > f.up * 0.5) sparkle(x, y - L.rows.length * s, now, s0); }
      return true; });
    // words rising where something was found
    texts = texts.filter(function(q){ var u = (now - q.t0) / (q.big ? 1.6 : 1.1); if (u >= 1) return false; var p = scr(q.x, q.y, q.z + u * 2.2), fs = Math.round((q.big ? 17 : 14) * dpr * (u < 0.12 ? 0.6 + u / 0.12 * 0.4 : 1));
      ctx.save(); ctx.globalAlpha = u > 0.7 ? (1 - u) / 0.3 : 1; ctx.font = '900 ' + fs + 'px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, fs / 4); ctx.strokeStyle = '#2a1a06'; ctx.strokeText(q.txt, p[0], p[1]); ctx.fillStyle = q.col; ctx.fillText(q.txt, p[0], p[1]); ctx.restore(); return true; }); }
  function sparkle(x, y, now, s){ var a = (Math.sin(now * 5) + 1) / 2; ctx.fillStyle = 'rgba(255,255,255,' + (0.4 + a * 0.6).toFixed(2) + ')'; var d = (3 + a * 3) * s;
    ctx.fillRect(Math.round(x - s / 2 + d), Math.round(y - d), s, s); ctx.fillRect(Math.round(x - s / 2 - d * 0.8), Math.round(y - d * 0.4), s, s); }

  // ---- the life around him (LIFE): seeded where it is placed, free running once it moves
  // under cloud the new world's birds and set pieces would give it away, so the walk keeps the old world's (no ships: the sea is the new world's)
  var lifeTh = api.clouds && sp.theme0 ? sp.theme0 : sp.theme, life = LIFE[lifeTh] || {}; if (lifeTh !== sp.theme){ life = Object.assign({}, life); delete life.ships; }
  var LR = rng(P.seed ^ 0x51f3), reduce = false; try{ reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){}
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
  if (life.ghosts) for (var lg = 0; lg < life.ghosts; lg++){ var gS = P.SL * (0.3 + 0.4 * lg / Math.max(1, life.ghosts - 1)) + rr(-10, 10), gs = LR() < 0.5 ? -1 : 1, gq = P.beside(gS, gs, rr(7, 13)); ghosts.push({ x:gq[0], y:gq[1], ax:gq[0], ay:gq[1], ph:LR() * 6 }); }
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
  /* THE STICK IS FOR A TOUCH SCREEN ONLY, the owner's call. With a mouse and a keyboard he walks on the arrow keys
     or WASD, so a desktop gets no stick on screen and a drag does not walk him. */
  var coarse = false; try{ coarse = matchMedia('(pointer: coarse)').matches; }catch(e){}
  var ui = document.createElement('div'); ui.className = 'pp-tui'; ui.innerHTML = (coarse ? '<div class="pp-stick" data-stick><i></i></div>' : '') + '<div class="pp-way" data-way><i></i><b></b></div><div class="pp-pin" data-pin><b></b><i></i></div>' +
    '<div class="pp-thud"><span data-coins>+0</span><span data-gold></span></div><div class="pp-tlist" data-tlist></div><div class="pp-rbar"><button class="pp-rb pp-talkb" data-talk hidden></button><button class="pp-rb" data-skip></button></div><div class="pp-rhint" data-hint></div><div class="pp-bub" data-bub hidden></div>';
  box.appendChild(ui);
  var stick = ui.querySelector('[data-stick]'), knob = stick && stick.firstChild, way = ui.querySelector('[data-way]'), pin = ui.querySelector('[data-pin]'), bubEl = ui.querySelector('[data-bub]'), hint = ui.querySelector('[data-hint]');
  var wayB = way.querySelector('b'), wayI = way.querySelector('i'), pinB = pin.querySelector('b'), pinI = pin.querySelector('i');
  hint.textContent = coarse ? 'Drag anywhere to walk' : 'Use the arrow keys or WASD to walk';
  ui.querySelector('[data-skip]').textContent = api.skipLabel || 'Skip';
  /* THERE IS NO AUTO WALK, the owner's call: the walk is the place, so it is walked. Anybody who would rather not
     can go to the map and play the next hole from there, forfeiting what the trail holds (putt.js warns them). */
  var stickV = [0, 0], keys = {}, drag = null, SR = 46;
  ui.querySelector('[data-skip]').onclick = function(){ if (alive) api.skip(); };
  var KM = { ArrowUp:'u', KeyW:'u', ArrowDown:'d', KeyS:'d', ArrowLeft:'l', KeyA:'l', ArrowRight:'r', KeyD:'r' };
  function kd(e){ var c = KM[e.code]; if (!c || !alive) return; keys[c] = 1; hint.classList.add('gone'); e.preventDefault(); }
  function ku(e){ var c = KM[e.code]; if (c) keys[c] = 0; }
  function pdn(e){ if (!alive || e.target.closest('button')) return; e.preventDefault(); var r = box.getBoundingClientRect();
    drag = { id:e.pointerId, x:e.clientX, y:e.clientY }; stick.style.left = (e.clientX - r.left) + 'px'; stick.style.top = (e.clientY - r.top) + 'px'; stick.classList.add('on'); knob.style.transform = ''; hint.classList.add('gone'); }
  function pmv(e){ if (!drag || e.pointerId !== drag.id) return; var dx = e.clientX - drag.x, dy = e.clientY - drag.y, Ln = Math.hypot(dx, dy), m = Math.min(1, Ln / SR);
    stickV = Ln > 4 ? [dx / Ln * m, dy / Ln * m] : [0, 0]; knob.style.transform = 'translate(' + (stickV[0] * SR).toFixed(1) + 'px,' + (stickV[1] * SR).toFixed(1) + 'px)'; }
  function pup(e){ if (!drag || (e && e.pointerId != null && e.pointerId !== drag.id)) return; drag = null; stickV = [0, 0]; stick.classList.remove('on'); stick.style.left = stick.style.top = ''; knob.style.transform = ''; }
  if (coarse) box.addEventListener('pointerdown', pdn); window.addEventListener('pointermove', pmv); window.addEventListener('pointerup', pup); window.addEventListener('pointercancel', pup); window.addEventListener('blur', pup);
  window.addEventListener('keydown', kd, true); window.addEventListener('keyup', ku, true);

  /* WHERE HE IS ALONG THE WALK. A route that doubles back has two legs side by side, so the nearest bit of path can
     be the wrong leg: once he is following it, only the stretch round where he was is asked, and the whole walk
     only when he has strayed off it. */
  var sNow = 0;
  function along(x, y){ var s = alongIn(x, y, sNow - 8, sNow + 16); if (s.d > 5) s = alongIn(x, y, -1, 1e9); sNow = s.s; return s.s; }
  function alongIn(x, y, s0, s1){ var best = 1e9, s = 0, pp = P.path; for (var i = 0; i < pp.length - 1; i++){ if (P.cum[i + 1] < s0 || P.cum[i] > s1) continue; var a = pp[i], c = pp[i + 1], vx = c[0] - a[0], vy = c[1] - a[1], L2 = vx * vx + vy * vy || 1,
      u = Math.max(0, Math.min(1, ((x - a[0]) * vx + (y - a[1]) * vy) / L2)), d = Math.hypot(a[0] + vx * u - x, a[1] + vy * u - y); if (d < best){ best = d; s = P.cum[i] + u * Math.sqrt(L2); } } return { s:s, d:best }; }
  function pathAtS(s){ var pp = P.path, cm = P.cum; for (var i = 0; i < pp.length - 1; i++) if (cm[i + 1] >= s){ var u = (s - cm[i]) / ((cm[i + 1] - cm[i]) || 1); return [pp[i][0] + (pp[i + 1][0] - pp[i][0]) * u, pp[i][1] + (pp[i + 1][1] - pp[i][1]) * u]; } return pp[pp.length - 1]; }
  var goalS = P.cum[P.cum.length - 1];

  // a line said once what was just found has flown up to the top of the screen, so the bubble never sits on top of it
  function sayLater(txt, ms, wait){ setTimeout(function(){ if (alive) say(txt, ms); }, (reduce ? 0.1 : wait) * 1000); }
  function say(txt, ms){ bubble = { txt:txt, until:performance.now() + (ms || 3200) }; bubEl.textContent = txt; bubEl.hidden = false; }
  function burst(x, y, z, cols, n, sz, pow){ pow = pow || 1; for (var i = 0; i < n; i++){ var a = Math.random() * 6.28, sp2 = (2 + Math.random() * 4) * pow; parts.push({ x:x, y:y, z:z, vx:Math.cos(a) * sp2, vy:Math.sin(a) * sp2 * 0.6, vz:(3 + Math.random() * 4) * pow, c:cols[i % cols.length], t:0, sz:sz ? sz * (0.6 + Math.random() * 0.8) : 0 }); } }
  function hudCoins(){ ui.querySelector('[data-coins]').textContent = '+' + coinsGot; }
  /* WHAT IS ON THIS TRAIL, said up front: a list of every find with its picture, ticked off as it is picked up,
     so a player always knows what they are looking for. Coins are not on it: they come out of the chest. */
  function hudList(){ var el = ui.querySelector('[data-tlist]'), fs = items.filter(function(t){ return LOOT[t.k]; });
    el.innerHTML = fs.length ? '<b>On this trail</b>' + fs.map(function(t){ var nm = t.k === 'trinket' ? t.name || 'Trinket' : t.k === 'part' ? (t.name || 'Putter part') : LOOT[t.k].name;
      if (t.k === 'chest' && t.drops) nm = 'Chest'; if (t.k === 'prize') nm = (P.puzzle && P.puzzle.name) || 'Puzzle'; return '<span data-id="' + t.id + '" class="' + (t.done ? 'got' : '') + (t.hint ? ' near' : '') + '"><img alt="" src="' + lootIcon(t) + '">' + nm.replace(/[<>&]/g, '') + '</span>'; }).join('') : ''; }
  function hudChests(){}
  function hudGold(){ var gd = api.golden ? api.golden() : null; ui.querySelector('[data-gold]').textContent = gd ? 'Golden balls ' + gd.have + '/' + gd.total : ''; }
  hudGold(); hudChests(); hudList();
  /* THE GREETER. They wait where the plan put them until you come within reach, then walk up to you, the
     way a board game host does, and talk: a box at the foot of the screen, their face in it, the words typed
     out, a tap for the next page. Walking is paused while they talk. After that they stay by the path, and
     the Talk button plays it again whenever you are beside them. */
  var greet = sp.greet, hs = null, hostIt = items.filter(function(t){ return t.k === 'host'; })[0], talkB = ui.querySelector('[data-talk]'), dlg = null;
  if (greet && hostIt){ hs = { x:hostIt.x, y:hostIt.y, ph:greet.met ? 'idle' : 'wait', face:[0, 1], dist:0, moving:false, at:performance.now() + (api.greetDelay || 0) }; talkB.textContent = 'Talk to ' + greet.name;
    try{ var G0 = window.RTT_G3D; if (G0 && G0.warmAim){ var a0 = Math.atan2(g.x - hs.x, -(g.y - hs.y)) * 180 / Math.PI; G0.warmAim(greet.look, a0, 'walk'); G0.warmAim(greet.look, 180, 'walk'); } }catch(e){} }
  function hostFrame(){ var G = window.RTT_G3D; if (!G || !G.frame || !hs) return null; var i = hs.moving ? Math.floor(hs.dist / STRIDE * 8) % 8 : 8;
    try{ return G.frame(greet.look, Math.atan2(hs.face[0], -hs.face[1]) * 180 / Math.PI, 'walk', i); }catch(e){ return null; } }
  function talk(){ if (!hs || dlg) return; hs.ph = 'talk'; hs.moving = false; paused = true; pup(); keys = {}; g.vx = g.vy = 0;
    hs.face = [g.x - hs.x, g.y - hs.y]; g.face = [hs.x - g.x, hs.y - g.y]; g.aimI = null; talkB.hidden = true;
    var pages = (greet.lines || []).concat(PZ && !PZ.solved ? [P.puzzle.clue] : []), pg = 0, typed = 0, tm = null;
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
    if (hs.ph === 'wait' && d < 16 && performance.now() >= hs.at && !(gate && (!gate.open || g.y > P.gate.y - 0.5))){ hs.ph = 'come'; paused = true; pup(); keys = {}; g.vx = g.vy = 0; }
    /* THEY STOP AT 3.2 FT AND TALK, AND "STOP AT" HAS TO BE A BAND. Each step moves them the distance left to 3.2,
       so in floating point d lands a hair over 3.2 and the next step moves them a hair less, for ever: the greeter
       stood still, never spoke, and the golfer was held. That was the freeze entering a new world. */
    if (hs.ph === 'come'){ g.face = [-dx, -dy]; g.aimI = null; if (d > 3.25){ var v = Math.min(5.2 * dt, d - 3.2); hs.x += dx / d * v; hs.y += dy / d * v; hs.dist += v; hs.moving = true; hs.face = [dx, dy]; } else talk(); }
    else if (hs.ph === 'idle'){ hs.moving = false; if (d < 7) hs.face = [dx, dy]; }
    talkB.hidden = !(hs.ph === 'idle' && d < 3.6); }
  /* PUSHING THE CRATE: walking into its side along x shoves it along with him, as far as its track allows. Toward the
     rock it jams after a little; from the rock's side it goes all the way across and clears the gap. Left half
     pushed and walked away from, it slides back, so it can never be left stuck. */
  function pushCrate(dt, now){ var C = PZ.crate, dy = Math.abs(g.y - C.y), dx = C.x - g.x;
    if (!PZ.solved && Math.abs(C.x - C.x0) > 0.05 && Math.hypot(g.x - C.x, g.y - C.y) > 18){ C.x = C.x0; return; }
    if (dy > CRATE_H + 0.55 - 0.15 || Math.abs(g.vx) < 0.6 || Math.sign(dx) !== Math.sign(g.vx) || Math.abs(dx) > CRATE_H + 0.55 + 0.14) return;
    var nx = Math.max(C.lo, Math.min(C.hi, C.x + g.vx * dt * 0.65));
    if (Math.abs(nx - C.x) > 1e-4){ C.x = nx; if (!C.dust || now - C.dust > 160){ C.dust = now; burst(C.x - Math.sign(g.vx) * CRATE_H, C.y, pic.zAt(C.x, C.y) + 0.2, ['rgba(220,210,190,.8)'], 3, 1.2, 0.4); } }
    else if (Math.sign(g.vx) === C.rock && Math.abs(C.x - C.x0) < 1 && (!bubble || now > bubble.until)) say('It\'s jammed against the rock.', 1800);
    if (!C.clear && Math.abs(C.x - C.x0) >= 1.7){ C.clear = true; say('The way into the pen is clear.', 2200); api.sfx && api.sfx('blip'); } }
  // the lights, the dig and the plate
  function stepPuzzle(dt, now, tsec){ var Pz = P.puzzle, z;
    if (PZ.k === 'fire' && !PZ.shown){ items.forEach(function(t){ if (t.k !== 'fire' || PZ.lit[t.id] || Math.hypot(t.x - g.x, t.y - g.y) > 1.7) return;
        PZ.lit[t.id] = tsec; z = pic.zAt(t.x, t.y); var fc = PZ_FLAME[t.th] || ['#ff8a1f', '#ffe08a']; burst(t.x, t.y, z + 1.8, [fc[0], fc[1], '#ffffff'], 16, 1.2, 0.9); api.sfx && api.sfx('blip');
        var n = Object.keys(PZ.lit).length; floatText(n + ' of 3', t.x, t.y, z + 3, fc[1], true);
        if (n >= 3) reveal('All three are lit. A chest has turned up off the path.'); }); }
    else if (PZ.k === 'dig' && !PZ.shown){ var dd = Math.hypot(Pz.spot[0] - g.x, Pz.spot[1] - g.y);
      if (dd < 1.1){ PZ.dug += dt; if (PZ.dug > 0.45){ z = pic.zAt(Pz.spot[0], Pz.spot[1]); burst(Pz.spot[0], Pz.spot[1], z + 0.4, ['#6a4a2a', '#8a6a3a', '#3a2a14'], 26, 1.6, 1.1); reveal('You dug something up.'); } } else PZ.dug = 0; }
    else if (PZ.k === 'plate' && !PZ.solved){ var pl = Pz.plate, dpl = Math.hypot(pl.x - g.x, pl.y - g.y);
      if (dpl < 1.0){ var was = performance.now() < PZ.openUntil; PZ.openUntil = performance.now() + pl.t * 1000; if (!was){ say('Click. The pen\'s gate is open. Quick!', 2400); api.sfx && api.sfx('blip'); } } } }
  function reveal(msg){ PZ.shown = true; if (!prizeIt) return; var z = pic.zAt(prizeIt.x, prizeIt.y); prizeIt.rise = performance.now() / 1000;
    burst(prizeIt.x, prizeIt.y, z + 1.2, ['#7cc8ff', '#ffffff', '#ffd23a'], 24, 1.4, 1.1); ring(prizeIt.x, prizeIt.y, '120,200,255'); say(msg, 3000); api.sfx && api.sfx('coin');
    var hr = ui.querySelector('[data-tlist] [data-id="' + prizeIt.id + '"]'); if (hr) hr.classList.add('near'); }
  function take(t, now){ take0(t, now); if (LOOT[t.k]) hudList(); }
  function take0(t, now){ var z = pic.zAt(t.x, t.y);
    if (t.k === 'coin'){ t.done = true; coinsGot += COIN_V; hudCoins(); burst(t.x, t.y, z + 1.2, ['#ffd23a', '#fff3a8', '#ffffff'], 8); collect(t, now, 'coin'); floatText('+' + COIN_V, t.x, t.y, z + 2.2); pick('coin', t.id, COIN_V); api.sfx && api.sfx('coin'); }
    else if (t.k === 'chest'){ t.done = true; t.openAt = now; pick('chest', t.id, 0); hudChests(); api.sfx && api.sfx('coin');
      // the lock pops as it starts to rattle; the lid lifts; light, a ring and a shower of gold as it comes open
      burst(t.x, t.y + 0.8, z + 1.0, ['#ffd23a', '#fff1a0'], 6, 1.2, 0.6);
      setTimeout(function(){ if (!alive) return; burst(t.x, t.y, z + 1.5, ['#ffd23a', '#fff3a8', '#ffffff', '#ffb43a'], 26, 1.5, 1.3); ring(t.x, t.y, '255,214,64'); }, (CH_SHAKE + 0.15) * 1000);
      // the coins fly out of the lid in an arc and land where the plan put them
      var cs = items.filter(function(c){ return c.k === 'coin' && c.ch === t; });
      cs.forEach(function(c, i){ c.out = true; c.fly = { t0:now + CH_COINS + i * 0.05, dur:0.6 + (i % 3) * 0.08, x0:t.x, y0:t.y, z0:z + 1.6 }; });
      setTimeout(function(){ if (alive) floatText(cs.length ? (cs.length * COIN_V) + ' coins!' : 'Treasure!', t.x, t.y, z + 3.2, '#ffd23a', true); }, CH_COINS * 1000);
      sayLater(cs.length ? 'Walk over the coins to pick them up.' : 'An empty chest.', 2600, 1.7); }
    else if (t.k === 'prize'){ t.done = true; t.openAt = now; PZ.solved = true; pick('pz', t.id, 0); api.sfx && api.sfx('coin');
      burst(t.x, t.y + 0.8, z + 1.0, ['#ffd23a', '#fff1a0'], 6, 1.2, 0.6);
      setTimeout(function(){ if (!alive) return; burst(t.x, t.y, z + 1.5, ['#ffd23a', '#fff3a8', '#ffffff', '#7cc8ff'], 30, 1.5, 1.3); ring(t.x, t.y, '120,200,255'); }, (CH_SHAKE + 0.15) * 1000);
      var pcs = items.filter(function(c){ return c.k === 'coin' && c.ch === t; });
      pcs.forEach(function(c, i){ c.out = true; c.fly = { t0:now + CH_COINS + i * 0.05, dur:0.6 + (i % 3) * 0.08, x0:t.x, y0:t.y, z0:z + 1.6 }; });
      setTimeout(function(){ if (alive) floatText('Puzzle solved! ' + (pcs.length * COIN_V) + ' coins', t.x, t.y, z + 3.2, '#9fe0ff', true); }, CH_COINS * 1000);
      sayLater('Puzzle solved. Walk over the coins to pick them up.', 3000, 1.7); }
    else if (t.k === 'key'){ t.done = true; lockOpen = true; burst(t.x, t.y, z + 1.3, ['#ffd23a', '#ffffff'], 14, 1.2); collect(t, now); floatText('Key', t.x, t.y, z + 3, '#e6eef8', true); pick('key', t.id, 0); sayLater('A key. The gate to the clearing is open.', 3200, 1.1); }
    else if (t.k === 'golden'){ t.done = true; burst(t.x, t.y, z + 1, ['#ffd23a', '#fff3a8', '#ffffff'], 28, 1.3, 1.2); collect(t, now); floatText('Golden ball!', t.x, t.y, z + 3, '#ffd23a', true); var msg = pick('golden', t.id, 0); hudGold(); sayLater(msg || 'A golden ball.', 3600, 1.1); }
    else if (t.k === 'life'){ t.done = true; burst(t.x, t.y, z + 1.2, ['#e5483a', '#ff9d8a', '#ffffff'], 22, 1.3, 1.2); collect(t, now); floatText('+1 life', t.x, t.y, z + 3, '#ff9d8a', true); sayLater(pick('life', t.id, 0) || 'A spare life.', 3600, 1.1); }
    else if (t.k === 'trinket'){ t.done = true; burst(t.x, t.y, z + 1.2, [t.col || '#b48cff', '#ffffff', '#ffd23a'], 26, 1.3, 1.2); collect(t, now); floatText(t.name || 'Trinket', t.x, t.y, z + 3, t.col || '#d8c4ff', true); sayLater(pick('trinket', t.id, 0) || ('Found: ' + t.name + '.'), 3800, 1.1); }
    else if (t.k === 'part'){ t.done = true; burst(t.x, t.y, z + 1.2, ['#cfd8e2', '#ffffff', '#ffd23a'], 22, 1.3, 1.2); collect(t, now); floatText('Putter part', t.x, t.y, z + 3, '#cfe2ff', true); sayLater(pick('part', t.id, 0) || ('A putter part: ' + t.name + '.'), 3800, 1.1); }
    else if (t.k === 'brk'){ t.done = true; var k = brkKind(t), cols = k === 'ice' ? ['#a8dcf4', '#e2f6ff'] : k === 'neoncube' ? ['#2bf0ff', '#1a1430'] : k === 'pumpkin' ? ['#e8761f', '#d0621a'] : k === 'hay' ? ['#e2bc5c', '#c8a04a'] : k === 'pot' ? ['#b8643a', '#f0e0b0'] : k === 'trashcan' ? ['#8a929c', '#cfd5dc'] : ['#c08a4e', '#8a5a2a'];
      burst(t.x, t.y, z + 0.8, cols, 10, 2.4, 1.1); burst(t.x, t.y, z + 0.6, cols, 12); burst(t.x, t.y, z + 0.2, ['rgba(220,210,190,.7)'], 8, 1.8, 0.5); ring(t.x, t.y, '230,220,200');
      if ((found.b || []).indexOf(t.id) < 0){ (found.b = found.b || []).push(t.id); coinsGot += BRK_V; hudCoins(); pick('brk', t.id, BRK_V); burst(t.x, t.y, z + 1, ['#ffd23a'], 4); collect({ x:t.x, y:t.y, k:'coin', id:t.id }, now, 'coin'); floatText('+' + BRK_V, t.x, t.y, z + 2); } else pick('brk', t.id, 0); } }

  var last = performance.now(), lastSafe = 0, nearNpc = false;
  function step(){ if (!alive) return; requestAnimationFrame(step);
    var now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now; var tsec = now / 1000;
    // where the stick asks him to go, on the screen, made a direction on the ground: up the screen is further than it looks
    var sx = 0, sy = 0;
    if (!paused){
      sx = stickV[0] + (keys.r ? 1 : 0) - (keys.l ? 1 : 0); sy = stickV[1] + (keys.d ? 1 : 0) - (keys.u ? 1 : 0); var m = Math.hypot(sx, sy); if (m > 1){ sx /= m; sy /= m; } }
    var o = P.poolAt(g.x, g.y), ice = o && o.k === 'ice', slow = o && o.k === 'slow' ? 0.5 : 1, mag = Math.hypot(sx, sy), sp2 = SPEED * slow;
    var tvx, tvy;
    if (mag > 0.05){ var wx = sx, wy = sy / SE, wl = Math.hypot(wx, wy); tvx = wx / wl * sp2 * mag; tvy = wy / wl * sp2 * mag; } else { tvx = 0; tvy = 0; }
    var acc = ice ? 2.2 : 26; g.vx += (tvx - g.vx) * Math.min(1, acc * dt); g.vy += (tvy - g.vy) * Math.min(1, acc * dt);
    if (PZ && PZ.crate && !paused) pushCrate(dt, now);
    var nx = g.x + g.vx * dt, ny = g.y + g.vy * dt, moved = 0;
    if (!blocked(nx, ny)){ moved = Math.hypot(nx - g.x, ny - g.y); g.x = nx; g.y = ny; }
    else if (!blocked(nx, g.y)){ moved = Math.abs(nx - g.x); g.x = nx; g.vy *= 0.5; }
    else if (!blocked(g.x, ny)){ moved = Math.abs(ny - g.y); g.y = ny; g.vx *= 0.5; }
    else { g.vx = 0; g.vy = 0; }
    hostStep(dt);
    lifeStep(dt);
    /* He faces one of eight ways, and only turns when the way he is going is well past the middle between two of them:
       snapped every frame, a heading near a boundary flipped him between two drawings and he flickered. The same
       for walking and standing: he starts and stops on two different speeds, never the same one. */
    var spd = Math.hypot(g.vx, g.vy); g.moving = moved > 0.002 && (g.moving ? spd > 0.25 : spd > 0.6);
    if (spd > 0.4){ var ang = Math.atan2(g.vx, -g.vy), cur = g.aimI == null ? null : g.aimI * Math.PI / 4, dd = cur == null ? 9 : Math.abs(Math.atan2(Math.sin(ang - cur), Math.cos(ang - cur)));
      if (dd > Math.PI / 8 + 0.2){ g.aimI = ((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8; var a8 = g.aimI * Math.PI / 4; g.face = [Math.sin(a8), -Math.cos(a8)]; } }
    g.dist += moved;
    if (moved > 0.5) hint.classList.add('gone');
    // lava sends him back to the last safe ground
    var o2 = P.poolAt(g.x, g.y);
    if (o2 && o2.k === 'lava'){ g.x = g.safe[0]; g.y = g.safe[1]; g.vx = g.vy = 0; flash = 1; say('Too hot. Back you go.', 1800); }
    else if (!o2 && now - lastSafe > 400){ g.safe = [g.x, g.y]; lastSafe = now; }
    // picking things up, and walking into them
    for (var i = 0; i < items.length; i++){ var t = items[i]; if (t.done) continue; var d = Math.hypot(t.x - g.x, t.y - g.y);
      if (t.k === 'coin' && (!t.out || (t.fly && tsec < t.fly.t0 + t.fly.dur))) continue;
      if ((t.k === 'coin' || t.k === 'golden' || t.k === 'key' || t.k === 'life' || t.k === 'trinket' || t.k === 'part') && d < 1.3) take(t, tsec);
      else if (t.k === 'chest' && d < 2.6 && (lockOpen || !P.fence || !t.main)) take(t, tsec);
      else if (t.k === 'prize' && d < 2.6 && prizeShown()) take(t, tsec);
      // warmer: the first time you come within a few strides of a shut chest it says so, and its row on the list lights
      if (t.k === 'chest' && !t.done && !t.hint && d < 9){ t.hint = true; if (!bubble || now > bubble.until) say(t.main && P.fence && !lockOpen ? 'Something glints behind that fence.' : 'Something glints nearby.', 2200);
        var hr = ui.querySelector('[data-tlist] [data-id="' + t.id + '"]'); if (hr) hr.classList.add('near'); }
      else if (t.k === 'brk' && d < 1.5 && spd > 1.5) take(t, tsec); }
    if (PZ) stepPuzzle(dt, now, tsec);
    // the local talks when he walks up, and on a puzzle trail he gives the clue
    var npc = items.filter(function(t){ return t.k === 'npc'; })[0];
    if (npc){ var dn = Math.hypot(npc.x - g.x, npc.y - g.y); if (dn < 3.4 && !nearNpc){ nearNpc = true; var ls = api.lines ? api.lines(kitOf(npc.th).who) : []; if (PZ && !PZ.solved) ls = ls.concat([P.puzzle.clue]); say(ls.join(' '), PZ && !PZ.solved ? 8200 : 5200); } else if (dn > 5) nearNpc = false; }
    if (P.fence && !lockOpen){ var df = Math.hypot(g.x - P.lockGate.x, g.y - P.lockGate.y); if (df < 2.4 && (!bubble || now > bubble.until)) say('Locked. The key is somewhere on this trail.', 2200); }
    // the door between worlds
    if (gate && !gate.asked && Math.abs(g.y - P.gate.y) < 3.2 && Math.abs(g.x - P.gate.x) < PW + 3){ gate.asked = true; paused = true; g.vx = g.vy = 0;
      api.door(function(open){ gate.open = open; paused = false; if (open && cloud) cloud.part = performance.now() / 1000; }); }
    if (gate && gate.asked && !gate.open && Math.abs(g.y - P.gate.y) > 7) gate.asked = false;
    // the arch: the hole
    if (g.y < 1.2 && Math.abs(g.x - P.arch.x) < 3.6 && !ended){ ended = true; api.arrive(); return; }
    if (bubble && now > bubble.until){ bubble = null; bubEl.hidden = true; }
    camAim(false);
    stepPlants(dt); draw(tsec, dt);
  }
  function draw(tsec, dt){
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false;
    /* only the part of the picture on the screen is drawn: the whole of it, blown up kk times, is many times the
       screen on a phone, every frame. The camera is on whole device pixels and kk is whole, so it is the same picture */
    var cw = pic.cv.width, ch = pic.cv.height, sx0 = Math.max(0, Math.floor(-ox / kk)), sy0 = Math.max(0, Math.floor(-oy / kk)), sx1 = Math.min(cw, Math.ceil((W - ox) / kk)), sy1 = Math.min(ch, Math.ceil((H - oy) / kk));
    if (!(ox <= 0 && oy <= 0 && ox + cw * kk >= W && oy + ch * kk >= H)){ ctx.fillStyle = pic.bg || kitOf(sp.theme).g[0]; ctx.fillRect(0, 0, W, H); }
    if (sx1 > sx0 && sy1 > sy0) ctx.drawImage(pic.cv, sx0, sy0, sx1 - sx0, sy1 - sy0, ox + sx0 * kk, oy + sy0 * kk, (sx1 - sx0) * kk, (sy1 - sy0) * kk);
    if (PZ) drawPzGround(tsec);
    // everything that moves, far to near
    var ds = [];
    items.forEach(function(t){ if (t.k === 'host') return; if (t.k === 'coin' && !t.out) return; if (t.done && t.k !== 'chest' && t.k !== 'prize' && t.k !== 'brk') return; if (t.k === 'brk' && t.done) return; if (t.k === 'prize' && !prizeShown()) return; ds.push(t); });
    if (P.pen && P.pen.gated) ds.push({ k:'pzgate', x:P.pen.x, y:P.pen.y + P.pen.r });
    if (PZ && PZ.crate) ds.push({ k:'crate', x:PZ.crate.x, y:PZ.crate.y });
    if (P.gate) ds.push({ k:'gate', x:P.gate.x, y:P.gate.y + 0.01 });
    if (P.fence) ds.push({ k:'lock', x:P.lockGate.x, y:P.lockGate.y });
    ds.push({ k:'me', x:g.x, y:g.y });
    if (hs) ds.push({ k:'hostfig', x:hs.x, y:hs.y });
    for (var pi = 0; pi < plants.length; pi++) ds.push({ k:'plant', x:plants[pi].x, y:plants[pi].y, q:plants[pi] });
    if (!reduce) lifeGround(ds);
    ds.sort(function(a, c){ return a.y - c.y; });
    for (var i = 0; i < ds.length; i++){ var t = ds[i];
      if (t.k === 'me') drawMe(tsec);
      else if (t.k === 'plant') drawPlant(t.q);
      else if (t.k === 'coin') drawCoin(t, tsec);
      else if (LOOT[t.k] && t.k !== 'chest' && t.k !== 'prize') drawLoot(t, tsec);
      else if (t.k === 'chest' || t.k === 'prize') drawChest(t, tsec);
      else if (t.k === 'fire') drawFire(t, tsec);
      else if (t.k === 'pzgate'){ var gs = pzGateOpen() ? SPR.lock1 : SPR.lock0; if (gs) drawSprite(gs, t.x, t.y, pic.zAt(t.x, t.y)); }
      else if (t.k === 'crate') drawSprite(SPR.crate, t.x, t.y, pic.zAt(t.x, t.y));
      else if (t.k === 'brk') drawSprite(brkSprite(t), t.x, t.y, pic.zAt(t.x, t.y));
      else if (t.k === 'npc') drawFigure(npcFrame(t), t.x, t.y);
      else if (t.k === 'ship' || t.k === 'tumble' || t.k === 'ghost') drawLifeThing(t, tsec);
      else if (t.k === 'hostfig'){ var hp = scr(t.x, t.y); ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(hp[0], hp[1], 5 * kk, 2 * kk, 0, 0, 7); ctx.fill(); drawFigure(hostFrame(), t.x, t.y, false, 'host');
        if (hs.ph === 'wait'){ var ep = scr(t.x, t.y, pic.zAt(t.x, t.y) + GH + 1.4 + Math.sin(tsec * 4) * 0.25), es = Math.max(2, Math.round(kk)); ctx.fillStyle = '#3a2a14'; ctx.fillRect(Math.round(ep[0] - 2 * es), Math.round(ep[1] - 7 * es), 4 * es, 9 * es); ctx.fillRect(Math.round(ep[0] - 2 * es), Math.round(ep[1] + 3 * es), 4 * es, 4 * es);
          ctx.fillStyle = '#ffd24a'; ctx.fillRect(Math.round(ep[0] - es), Math.round(ep[1] - 6 * es), 2 * es, 7 * es); ctx.fillRect(Math.round(ep[0] - es), Math.round(ep[1] + 4 * es), 2 * es, 2 * es); } }
      else if (t.k === 'gate') drawSprite(gate && gate.open ? SPR.gate1 : SPR.gate0, t.x, P.gate.y, pic.zAt(t.x, P.gate.y));
      else if (t.k === 'lock'){ var ls = lockOpen ? SPR.lock1 : SPR.lock0; if (ls){ ctx.save(); drawSprite(ls, t.x, t.y, pic.zAt(t.x, t.y)); ctx.restore(); } } }
    lifeAir(tsec);
    if (cloud) drawClouds(tsec);
    // bits that fly
    var s = Math.max(2, Math.round(kk * 0.8));
    parts = parts.filter(function(q){ q.t += dt; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt; q.vz -= 18 * dt; if (q.z < pic.zAt(q.x, q.y)){ q.z = pic.zAt(q.x, q.y); q.vz *= -0.3; q.vx *= 0.6; q.vy *= 0.6; }
      var p = scr(q.x, q.y, q.z), qs = q.sz ? Math.round(s * q.sz) : s; ctx.fillStyle = q.c; ctx.globalAlpha = Math.max(0, 1 - q.t / 1.1); ctx.fillRect(Math.round(p[0] - qs / 2), Math.round(p[1] - qs / 2), qs, qs); ctx.globalAlpha = 1; return q.t < 1.1; });
    if (pic.bg) fxScreen();
    drawFx(tsec);
    if (flash > 0){ ctx.fillStyle = 'rgba(255,120,40,' + (flash * 0.5).toFixed(2) + ')'; ctx.fillRect(0, 0, W, H); flash = Math.max(0, flash - dt * 2); }
    waypoint();
    if (bubble){ var bp = scr(g.x, g.y, pic.zAt(g.x, g.y) + GH + 0.6); var npc = items.filter(function(t){ return t.k === 'npc'; })[0];
      if (nearNpc && npc) bp = scr(npc.x, npc.y, pic.zAt(npc.x, npc.y) + GH + 0.6);
      put(bubEl.style, 'left', (bp[0] / dpr) + 'px'); put(bubEl.style, 'top', (bp[1] / dpr) + 'px'); }
  }
  /* the console look's last touch, as on a hole: the low sun washing in from the upper left (none at night) and a
     vignette, drawn over the scene and under what flies to the counters. Built once per screen size. */
  var fxScr = null;
  function fxScreen(){ var k = W + 'x' + H; if (!fxScr || fxScr.k !== k){ var c = document.createElement('canvas'); c.width = W; c.height = H; var x = c.getContext('2d');
      if (!pic.night){ var gl = x.createRadialGradient(W * 0.12, H * 0.05, 0, W * 0.12, H * 0.05, Math.max(W, H) * 0.95); gl.addColorStop(0, 'rgba(255,226,170,0.14)'); gl.addColorStop(0.55, 'rgba(255,226,170,0.04)'); gl.addColorStop(1, 'rgba(255,226,170,0)'); x.fillStyle = gl; x.fillRect(0, 0, W, H); }
      var v = x.createRadialGradient(W / 2, H * 0.5, Math.min(W, H) * 0.42, W / 2, H * 0.5, Math.hypot(W, H) * 0.62); v.addColorStop(0, 'rgba(8,10,24,0)'); v.addColorStop(1, 'rgba(8,10,24,0.3)'); x.fillStyle = v; x.fillRect(0, 0, W, H);
      fxScr = { k:k, c:c }; }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(fxScr.c, 0, 0); }
  /* THE NEXT WORLD IS UNDER CLOUD until its gate opens: a bank of it from the top of the wall to the top of the
     screen, so nothing past the wall shows (its ground, its greeter, its hole). The puffs are pinned to the wall's
     line and to the ground under them, so they move with the camera. When the door opens they roll apart to both
     sides and thin out, and then the world is there. */
  function drawClouds(tsec){ var u = cloud.part ? Math.min(1, (tsec - cloud.part) / 1.9) : 0; if (u >= 1){ cloud = null; return; }
    var e = u * u * (3 - 2 * u), zg = pic.zAt(P.gate.x, P.gate.y), base = scr(P.gate.x, P.gate.y, zg + 7.6)[1], r0 = 7 * kk, cxs = W / 2;
    ctx.save(); ctx.globalAlpha = 1 - e;
    if (base > 0){ var gr = ctx.createLinearGradient(0, 0, 0, base); gr.addColorStop(0, '#cfdbea'); gr.addColorStop(1, '#eef3f9');
      ctx.fillStyle = gr; var sh = e * W * 0.6; ctx.fillRect(-sh, 0, W / 2, base); ctx.fillRect(W / 2 + sh, 0, W / 2 + 2, base); }
    var step = r0 * 1.15, n = Math.ceil(W / step) + 3, rows = Math.max(1, Math.ceil(base / (r0 * 1.6)));
    for (var j = 0; j <= rows; j++) for (var i = -1; i < n; i++){ var h = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453; h -= Math.floor(h);
      var x = i * step + (j % 2) * step / 2 + Math.sin(tsec * 0.35 + i * 1.7 + j) * kk * 1.4, y = base - j * r0 * 1.6 + (h - 0.5) * r0 * 0.5, r = r0 * (0.9 + h * 0.6);
      if (y + r < 0) continue; x += (x < cxs ? -1 : 1) * e * W * (0.55 + h * 0.3); y -= e * r0 * 2 * h;
      ctx.fillStyle = '#c2cfe1'; ctx.beginPath(); ctx.arc(x, y + r * 0.22, r, 0, 7); ctx.fill();
      ctx.fillStyle = j ? '#f3f6fb' : '#ffffff'; ctx.beginPath(); ctx.arc(x - r * 0.08, y, r * 0.92, 0, 7); ctx.fill(); }
    ctx.restore(); }
  var lastFace = null;
  // the frame asked for if it is drawn, else any frame of this facing that is, else draw it now (once a facing)
  function drawMe(tsec){ var h = api.host, f = null, fv = g.face, i = g.moving ? Math.floor(g.dist / STRIDE * 8) % 8 : 8;
    try{ if (h.golferWalkHas(fv[0], fv[1], i)) f = h.golferWalk(fv[0], fv[1], i);
      else { for (var j = 8; j >= 0 && !f; j--) if (h.golferWalkHas(fv[0], fv[1], j)) f = h.golferWalk(fv[0], fv[1], j); if (!f) f = h.golferWalk(fv[0], fv[1], i); } }catch(e){ f = null; }
    if (!f) f = lastFace; else lastFace = f;
    var shp = scr(g.x, g.y), s = kk; ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(shp[0], shp[1], 5 * s, 2 * s, 0, 0, 7); ctx.fill();
    drawFigure(f, g.x, g.y, true, 'me'); }
  /* A WRITE TO THE PAGE ONLY WHEN IT CHANGES. The waypoint and the speech bubble are asked every frame, and writing
     the same text or the same position back each time still makes the browser restyle and lay the page out again,
     and fires every observer on the page (the game's own watches every node added), sixty times a second. */
  function put(o, k, v){ if (o[k] !== v) o[k] = v; }
  function cls(el, c, on){ if (el.classList.contains(c) !== on) el.classList.toggle(c, on); }
  function waypoint(){ var tx, ty, label;
    /* THE ARROW LEADS ALONG THE WALK, not across country. A route that doglegs or doubles back puts the arch over
       the trees, so while there is more than a bend to go the arrow points at the path some way ahead of him, and
       the distance it gives is what is left to walk. Near the end, or at a shut door, it is the place itself. */
    var shut = gate && !gate.open && g.y > P.gate.y, goal = shut ? [P.gate.x, P.gate.y] : [P.arch.x, -0.5], sg0 = along(g.x, g.y), sEnd = shut && P.gate.s != null ? P.gate.s : goalS, left = Math.max(0, sEnd - sg0);
    var via = left > 30 && Math.hypot(goal[0] - g.x, goal[1] - g.y) < left * 0.8, tgt = via ? pathAtS(sg0 + 24) : goal, p = scr(tgt[0], tgt[1], pic.zAt(tgt[0], tgt[1]) + (via ? 3 : shut ? 7 : 9.5));
    tx = p[0] / dpr; ty = p[1] / dpr; var M = 34, Wc = W / dpr, Hc = H / dpr, inside = !via && tx > M && tx < Wc - M && ty > M + 110 && ty < Hc - M - 70;
    var d = Math.round(Math.max(left, Math.hypot(goal[0] - g.x, goal[1] - g.y)) * 1.5 / 3);   // trail feet are two thirds of real ones, and yards are three feet
    label = shut ? 'World door' : (api.holeLabel || 'Next hole');
    if (inside){ cls(way, 'on', false); cls(pin, 'on', true); put(pin.style, 'left', Math.round(tx) + 'px'); put(pin.style, 'top', Math.round(ty) + 'px'); put(pinB, 'textContent', label); put(pinI, 'textContent', d > 3 ? d + ' yd' : ''); return; }
    cls(pin, 'on', false); cls(way, 'on', true); var cxs = Wc / 2, cys = Hc / 2, vx = tx - cxs, vy = ty - cys, s2 = Math.min((Wc / 2 - M) / Math.abs(vx || 1e-6), (Hc / 2 - M - 90) / Math.abs(vy || 1e-6));
    put(way.style, 'left', Math.round(cxs + vx * s2) + 'px'); put(way.style, 'top', Math.round(cys + vy * s2) + 'px'); put(wayI.style, 'transform', 'rotate(' + Math.round(Math.atan2(vy, vx) * 180 / Math.PI + 90) + 'deg)');
    put(wayB, 'textContent', label + ' · ' + d + ' yd'); }
  // warm every facing of the walk while the trail opens, so turning never waits on a drawing
  try{ var hh = api.host; if (hh && hh.golferWalkWarm) for (var q = 0; q < 8; q++){ var a = q * Math.PI / 4; hh.golferWalkWarm(Math.sin(a), -Math.cos(a)); } }catch(e){}
  requestAnimationFrame(step);
  var ctl = {
    stop:function(){ alive = false; if (dlg && dlg.kill) dlg.kill(); window.removeEventListener('resize', onRs); box.removeEventListener('pointerdown', pdn); window.removeEventListener('pointermove', pmv); window.removeEventListener('pointerup', pup);
      window.removeEventListener('pointercancel', pup); window.removeEventListener('blur', pup); window.removeEventListener('keydown', kd, true); window.removeEventListener('keyup', ku, true); },
    // for the checks: where he is, and a way to hold the stick
    pos:function(){ return [g.x, g.y]; }, fx:function(){ return fxs.length; }, stick:function(vx, vy){ stickV = [vx, vy]; },
    plan:function(){ return P; }, gate:function(){ return gate; }, clouds:function(){ return cloud ? (cloud.part ? 'parting' : 'on') : 'off'; }, life:function(){ return { theme:sp.theme, ships:ships.map(function(s1){ var y1 = shipY(s1); return { x:shipX(y1), y:y1 }; }), flyers:flyers.length, motes:motes.length, balloons:balloons.length, tumbles:tumbles.length, ghosts:ghosts.length, puffs:puffs.length, smoke:smokeSrc.length }; }, host:function(){ return hs ? { x:hs.x, y:hs.y, ph:hs.ph, talking:!!dlg } : null; }, items:function(){ return items; }, goTo:function(x, y){ g.x = x; g.y = y; }, blocked:function(x, y){ return blocked(x, y); }, pz:function(){ return PZ; }, bubble:function(){ return bubble ? bubble.txt : ''; }, plants:function(){ return plants.map(function(q){ return { x:q.x, y:q.y, k:q.t.k, b:q.b, in:q.in }; }); }, view:function(){ return { kk:kk, W:W, H:H, ox:ox, oy:oy }; }, scr:scr };
  return ctl;
}

window.RTT_PUTT_TRAIL = { API_VERSION:API_VERSION, COIN_V:COIN_V, BRK_V:BRK_V, PZ_COINS:PZ_COINS, plan:plan, slices:slices, run:run, GH:GH, TRAIL_L:TRAIL_L, ELEV:ELEV, KIT:KIT };
})();
