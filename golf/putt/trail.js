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
  prize:{ rows:PIX_CHEST, pal:{ r:'#3a78b8', h:'#7cc8ff', g:'#ffd23a', o:'#14304a' }, beam:null, name:'Puzzle' },
  vault:{ rows:PIX_CHEST, pal:{ r:'#7a3ab8', h:'#c89cff', g:'#ffd23a', o:'#2a1440' }, beam:null, name:'Gym' }
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
var PZ_LIGHT = { clubhouse:'lanterns', temple:'torches', pirate:'lanterns', canyon:'mine lamps', volcano:'braziers', dino:'torches', sky:'beacons', neon:'neon lights',
  school:'lanterns', iceage:'fire pits', moon:'beacons', candy:'lanterns', haunted:'candles', harvest:'lanterns' };
var PZ_FLAME = { moon:['#7fd8ff', '#e6f8ff'], neon:['#2bf0ff', '#c8fbff'], haunted:['#7cff8a', '#d8ffd8'], sky:['#ffd24a', '#fff6c4'] };
var JAM_ROCK = { neon:'cube', iceage:'rocksnow', moon:'rockdark', volcano:'rockdark', haunted:'rockdark' };
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
  dino:{ g:['#5e7a2e', '#688632', '#54702a', 0.22], p:['#a8875a', '#b8976a', '#98774c'], tree:['palm', 'broad', 'palm'], leaves:['#2e6a22', '#3a7a2a', '#24561c'], bark:'#5a4026',
    low:['fern', 'fern', 'rock', 'bush'], brk:'pot', haz:'water', hazC:['#4a6a2e', '#86a454'], waterC:['#3f6a3a', '#7aa65a'], iceC:['#8a4e30', '#b8724a'], lm:['longneck', 'dinoskel', 'nest'], wall:['#c9a46a', '#7a5a34'],
    npc:{ skin:'medium', polo:'gold', hat:'tan', pants:'khaki', hair:'brown', hairStyle:'ponytail', cap:true, hatStyle:'cap', gender:'female' }, who:'the fossil hunter' },
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
  // Moon Base: grey regolith, a pale beaten path, rock spires and antenna masts for trees, moon dust for the bog, supply crates to break
  moon:{ g:['#9a98a2', '#a8a6b0', '#8a8892', 0.2], gpat:'moonReg', p:['#c8ccd8', '#dfe3ec', '#b4b8c4'], tree:['basalt'], leaves:['#6a6872', '#7a7882', '#5a5862'], bark:'#4a4852', dens:0.04,
    low:['rock', 'rockdark', 'rock'], brk:'crate', haz:'slow', hazC:['#b6b4bc', '#9a98a6'], bogC:['#b6b4bc', '#9a98a6'], lm:['moonLander', 'moonDome', 'moonDish'], wall:['#eef2f8', '#3f7fe0'],
    npc:{ skin:'medium', polo:'white', hat:'white', pants:'navy', hair:'black', hairStyle:'bun', cap:false, gender:'female' }, who:'the astronaut' },
  candy:{ g:['#f2b7cc', '#f8c8d9', '#eaa6be', 0.18], p:['#a8683e', '#b87a4c', '#985a32'], paved:true, tree:['broad', 'broad', 'broad'], leaves:['#ff6fa8', '#ffa8cc', '#e0488a'], bark:'#f6f1ea',
    low:['bush', 'rock', 'bush'], brk:'crate', haz:'slow', hazC:['#f2a65a', '#d88a3e'], bogC:['#f2a65a', '#d88a3e'], lm:['factory', 'gumballs', 'canes'], wall:['#ff8ab8', '#9a2a5a'],
    npc:{ skin:'medium', polo:'white', hat:'white', pants:'navy', hair:'auburn', hairStyle:'ponytail', cap:false, gender:'female' }, who:'the candy maker' },
  haunted:{ g:['#2e3a2a', '#36442e', '#283224', 0.2], p:['#5d4634', '#6d5440', '#4d3a2a'], tree:['dead', 'dead', 'dead'], leaves:['#3a4a2e', '#4a5a34', '#2e3a24'], bark:'#2b2229',
    low:['tomb', 'rock', 'pumpkin'], brk:'pumpkin', haz:'slow', hazC:['#5d4634', '#4a3628'], lm:['crypt', 'graves', 'fenceyard'], wall:['#4a4652', '#24222a'],
    npc:{ skin:'porcelain', polo:'black', hat:'black', pants:'grey', hair:'white', hairStyle:'long', cap:false, gender:'female' }, who:'the caretaker' },
  harvest:{ g:['#9c8a44', '#a8964c', '#8e7c3c', 0.2], p:['#b08a58', '#c09a66', '#9a784a'], tree:['broad', 'broad', 'corn'], leaves:['#c8641e', '#e08a2a', '#a84e18'], bark:'#4a3624',
    low:['hay', 'pumpkin', 'bush'], brk:'hay', haz:'slow', hazC:['#6a4e2e', '#5a4024'], lm:['barn', 'scarecrow', 'cornfield'], wall:['#8b4a1e', '#5a2e10'],
    npc:{ skin:'tan', polo:'gold', hat:'stone', pants:'navy', hair:'auburn', hairStyle:'short', cap:true, hatStyle:'cap', gender:'male' }, who:'the farmer' }
};
/* A WORLD'S WALKS TRAVEL WITH ITS HOLES. Pirate Cove's holes go beach, town, jungle, Skull Rock, cove (land.js), and the walks
   between them go the same way: putt.js names the stop (spec.kitAs), and the walk is planned with that stop's kit. Only the
   kit changes; everything that asks which world this is still reads the world (spec.theme). */
function kitFrom(base, o){ var k = {}; for (var q in base) k[q] = base[q]; for (q in o) k[q] = o[q]; return k; }
KIT['pirate~town'] = kitFrom(KIT.pirate, { g:['#ac9e88', '#b8a890', '#9e907a', 0.2], gpat:'cobble', nlm:5, dens:0.22, low:['rock', 'shell', 'rock'], lm:['shack', 'barrels', 'shack', 'lamps', 'shack', 'boat'] });
KIT['pirate~jungle'] = kitFrom(KIT.pirate, { g:['#3f6a2a', '#4e7a32', '#2f5a22', 0.22], p:['#8a6a44', '#9a7a52', '#7a5a38'], plank:false, sea:false, tree:['broad', 'palm', 'broad'],
  leaves:['#1f5a26', '#2b6e30', '#174a20'], bark:'#4a3624', low:['fern', 'bush', 'fern', 'rock'], haz:'water', hazC:['#2f8f9a', '#6fc8d0'], waterC:['#2f8f9a', '#6fc8d0'], gpat:'floor', nlm:4, lm:['falls', 'fortwall', 'falls', 'statue'], dens:1.35, wall:['#a29e8a', '#6a6658'] });
KIT['pirate~skull'] = kitFrom(KIT.pirate, { g:['#8a867c', '#9a968a', '#7a766c', 0.25], p:['#d8c08a', '#e6d09c', '#c4aa74'], plank:false, dens:0.35, gpat:'stone', nlm:4, low:['rock', 'rock', 'shell'], lm:['skullrock', 'stacks', 'wreck', 'stacks'], wall:['#8e8a80', '#5a5650'] });
KIT['pirate~cove'] = kitFrom(KIT.pirate, { g:['#efd89a', '#f6e4b2', '#dcc384', 0.25], dens:1.25, seaC:['#2ab4c8', '#7adce8'], nlm:3, lm:['camp', 'wreck', 'camp', 'barrels'] });
/* a stop's own ground on the walk: GPAT[name](c, kit) gives the colour of a cell (c.ti, c.tj, an eighth of a foot each).
   Smooth patches (vn) read well on a walk; a hashed cell is a speckle. */
var GPAT = {};
var LIFE_AS = { 'pirate~jungle':{ fly:['parrot', 5], mote:[['firefly', 14], ['butter', 6]] } };
function kitOf(th){ return KIT[th] || KIT.clubhouse; }
// the world a theme on the walk belongs to: a stop's kit is named 'world~stop', and what the world decides (stone bridges, neon) stays the world's
function baseTh(th){ return String(th || '').split('~')[0]; }

/* ---------------------------------------------------------------------------------- the plan */
/* spec: { seed, theme, theme0 (the world being left, on a trail that crosses), cross, gateOpen, to (hole number),
   carpet: [colour, colour], flag } */
function plan(spec){
  if (spec.kitAs && !KIT[spec.kitAs]) spec.kitAs = null;   // a stop with no kit of its own walks in its world's
  var seed = spec.seed >>> 0, R = rng(seed), L = TRAIL_L, th = spec.kitAs || spec.theme, th0 = spec.cross ? (spec.theme0 || th) : th;
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
  /* A GYM'S TRAIL IS ROUTED ROUND ITS GYM (gyms.js). The arena is a walled box of tiles beside the walk with its gate
     facing the camera, and a route is only taken if the box fits clear of it with the gate a few steps off the path
     (gymFit). A trail with no gym is routed exactly as it always was: none of this is asked and no draw is taken. */
  var GYD = null, gfit = null; try{ var GYS = spec.gym && typeof window !== 'undefined' && window.RTT_PUTT_GYMS; if (GYS && GYS.API_VERSION === 2){ var gdef = GYS.byId(spec.gym); if (gdef) GYD = GYS.parse(gdef); } }catch(e){ GYD = null; }
  function gymFit(pp){ var T = window.RTT_PUTT_GYMS.TILE, GW = GYD.W * T, GDp = GYD.H * T, gc = GYD.gate % GYD.W, FW = Math.ceil(b[2] - b[0]) + 1, FH = Math.ceil(b[3] - b[1]) + 1, F = new Float32Array(FW * FH);
    for (var j = 0; j < FH; j++) for (var i = 0; i < FW; i++){ var x = b[0] + i, y = b[1] + j, m = 1e9; for (var k = 0; k < pp.length - 1; k++){ var a = pp[k], c = pp[k + 1]; if (Math.abs(a[1] - y) > m + 2 && Math.abs(c[1] - y) > m + 2) continue; m = Math.min(m, segD(x, y, a[0], a[1], c[0], c[1])); } F[j * FW + i] = m; }
    function fd(x, y){ var i = Math.round(x - b[0]), j = Math.round(y - b[1]); if (i < 0 || j < 0 || i >= FW || j >= FH) return 0; return F[j * FW + i]; }
    var best = null, RJ = rng(hstr('gym:' + spec.gym + ':' + seed));
    for (var y0 = 10; y0 + GDp + 1.5 <= L - 4; y0 += 1) for (var x0 = b[0] + 3; x0 + GW <= b[2] - 3; x0 += 1){
      var ax = x0 + (gc + 0.5) * T, ay = y0 + GDp + 0.8, dA = fd(ax, ay); if (dA > 9 || dA < PW + 0.8) continue;
      var ok = true; for (var yy = y0 - 1; yy <= y0 + GDp + 1 && ok; yy += 1) for (var xx = x0 - 1; xx <= x0 + GW + 1; xx += 1) if (fd(xx, yy) < PW + 1.6){ ok = false; break; }
      if (!ok) continue;
      // the way in: from the nearest point of the path straight to the gate, never across the box
      var bn = 1e9, np = null; for (var q = 0; q < pp.length; q++){ var dq = Math.hypot(pp[q][0] - ax, pp[q][1] - ay); if (dq < bn){ bn = dq; np = pp[q]; } }
      for (var u = 0.1; u < 1 && ok; u += 0.1){ var sx = np[0] + (ax - np[0]) * u, sy = np[1] + (ay - np[1]) * u; if (sx > x0 - 0.6 && sx < x0 + GW + 0.6 && sy > y0 - 0.6 && sy < y0 + GDp + 0.2) ok = false; }
      if (!ok) continue;
      var sc0 = dA + RJ() * 1.5; if (!best || sc0 < best.sc) best = { sc:sc0, x0:x0, y0:y0, w:GW, d:GDp, ax:ax, ay:ay, np:np.slice(), T:T }; }
    return best; }
  for (var att = 0; att < (GYD ? 64 : 28) && !path; att++){
    var nm = att < (GYD ? 60 : 24) ? pickRoute() : 'meander', flip = R() < 0.5 ? -1 : 1, jit = function(a){ return (R() - 0.5) * a; }, rt = ROUTES[nm](flip, jit);
    var sx = clampR(ux(rt.a), sRange), ax = clampR(ux(rt.z), aRange), ctrl = [[sx, L + 7]];
    // every bend wanders a little of its own, so two doglegs are two different doglegs, not one drawn twice
    var stretch = 0.9 + R() * 0.2; rt.p.forEach(function(q){ ctrl.push([ux(Math.max(-0.95, Math.min(0.95, q[0] * stretch + jit(0.18)))), Math.max(0.1, Math.min(0.97, q[1] + jit(0.06))) * Y0]); });
    ctrl.push([ax, 7], [ax, -1]);
    var pp = even(spline(ctrl)), cc = cumOf(pp), gg = spec.cross ? wallLine(pp) : null;
    if (sane(pp, cc, gg, nm) && (!GYD || (gfit = gymFit(pp)))){ path = pp; cum = cc; gy = gg; style = nm; route = rt; } }
  if (!path){ var sx2 = clampR(0, sRange), ax2 = clampR(0, aRange); path = even(spline([[sx2, L + 7], [(sx2 + ax2) / 2, Y0 / 2], [ax2, 7], [ax2, -1]])); cum = cumOf(path); gy = spec.cross ? (wallLine(path) || Math.round(L * 0.72) + 0.5) : null; if (GYD) gfit = gymFit(path); }
  if (!gfit) GYD = null;   // nowhere for it: this trail walks without its gym (check-putt fails on that)
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
  /* THE GYM, where gymFit put it: a box of TILE feet a tile, row 0 at its far (low y) side, and its own little path
     from the walk to the gate. Nothing else stands in it, and nothing tall stands just in front of it (gymShadow), so
     the camera always sees into it. gymCell is what each point of it is, for the ground and for run(). */
  var GYM = null;
  if (GYD){ var gf = gfit; GYM = { id:spec.gym, Q:GYD, G:gdef, K:GYS.kindOf(gdef), T:gf.T, x0:gf.x0, y0:gf.y0, w:gf.w, d:gf.d, ax:gf.ax, ay:gf.ay, spur:[] };
    for (var gk2 = 0; gk2 <= 10; gk2++){ var gt = gk2 / 10; GYM.spur.push([gf.np[0] + (gf.ax - gf.np[0]) * gt, gf.np[1] + (gf.ay - gf.np[1]) * gt]); }
    GYM.spur.push([gf.ax, gf.y0 + gf.d - 0.3]); }
  function inGym(x, y, pad){ return !!GYM && x > GYM.x0 - pad && x < GYM.x0 + GYM.w + pad && y > GYM.y0 - pad && y < GYM.y0 + GYM.d + pad; }
  function gymShadow(x, y){ return !!GYM && x > GYM.x0 - 3 && x < GYM.x0 + GYM.w + 3 && y > GYM.y0 + GYM.d && y < GYM.y0 + GYM.d + 9; }
  function gymCell(x, y){ if (!inGym(x, y, 0)) return null; var Q = GYM.Q, c = Math.floor((x - GYM.x0) / GYM.T), r = Math.floor((y - GYM.y0) / GYM.T); if (c < 0 || r < 0 || c >= Q.W || r >= Q.H) return null;
    var i = r * Q.W + c; return { i:i, c:c, r:r, k:Q.cell[i], u:(x - GYM.x0) / GYM.T - c, v:(y - GYM.y0) / GYM.T - r }; }
  function gymSpurD(x, y){ var m = 1e9; if (!GYM) return m; for (var i = 0; i < GYM.spur.length - 1; i++) m = Math.min(m, segD(x, y, GYM.spur[i][0], GYM.spur[i][1], GYM.spur[i + 1][0], GYM.spur[i + 1][1])); return m; }
  /* the spur and its clearing, off to a side with room. Never further out than a phone's camera sees from the path
     (it was up to 22 ft, and with no spur to it that was a clearing nobody could find): 9.5 to 15 ft, so the trees
     can hide it from most of the walk but some stretch of the path always has it on screen. Never over another leg
     of the walk, never across the wall */
  var clr = null, spur = [], ys, sx0, sg, sS;
  for (var ct = 0; ct < 120 && !clr; ct++){ var s1 = SL * (0.22 + R() * 0.56), sd = R() < 0.5 ? -1 : 1, crr = 4.5 + R() * 2, cp = beside(s1, sd, 9.5 + R() * 5.5), o = atS(s1);
    if (cp[0] < b[0] + crr + 4 || cp[0] > b[2] - crr - 4 || cp[1] < 12 || cp[1] > L - 6) continue;
    if (pathD(cp[0], cp[1]) < crr + 5 || Math.hypot(cp[0] - start.x, cp[1] - start.y) < crr + start.r + 4) continue;
    if (GYM && (inGym(cp[0], cp[1], crr + 4) || gymShadow(cp[0], cp[1]) || inGym((cp[0] + o[0]) / 2, (cp[1] + o[1]) / 2, 1.5))) continue;
    if (gy && (Math.abs(cp[1] - gy) < crr + 6 || Math.abs(o[1] - gy) < 12 || (cp[1] - gy) * (o[1] - gy) < 0)) continue;
    var crosses = false; for (var kt = 0.4; kt <= 1; kt += 0.1) if (pathD(o[0] + (cp[0] - o[0]) * kt, o[1] + (cp[1] - o[1]) * kt) < PW + 1.4) crosses = true;
    if (crosses) continue;
    clr = { x:cp[0], y:cp[1], r:crr }; sS = s1; sx0 = o[0]; ys = o[1]; sg = sd; }
  if (!clr){ sS = SL * 0.5; var o2 = atS(sS); sx0 = o2[0]; ys = o2[1]; sg = sx0 > 0 ? -1 : 1; clr = { x:sx0 + sg * 11, y:ys - 2, r:4.5 }; }
  // half the clearings have a little path out to them; the rest are hidden in the trees and found by wandering
  var spurOn = R() < 0.55;
  if (spurOn){ var sdx = clr.x - sx0, sdy = clr.y - ys, sl = Math.hypot(sdx, sdy) || 1, bow = (R() < 0.5 ? -1 : 1) * 2.2;
    for (var k = 0; k <= 10; k++){ var t = k / 10, bw = Math.sin(t * Math.PI) * bow; spur.push([sx0 + sdx * t - sdy / sl * bw, ys + sdy * t + sdx / sl * bw]); } }
  /* the secret clearing: the far side of the walk from the chest's, with room for the entrance, and always a
     path out to it so it reads as a place to go. The path ends at the doorway. */
  var sc = null, spur2 = [];
  if (spec.secret){ var sk = SECRET_KIND[spec.theme] || 'secretdoor', ssz = LMSIZE[sk] || [6, 4, 5.5], srr = Math.max(ssz[0], ssz[1]) / 2 + 1.5;
    for (var st2 = 0; st2 < 200 && !sc; st2++){ var s2 = SL * (0.2 + R() * 0.6), sd2 = st2 < 120 ? -sg : (R() < 0.5 ? -1 : 1), cp2 = beside(s2, sd2, srr + 6 + R() * 6), o3 = atS(s2);
      if (cp2[0] < b[0] + srr + 4 || cp2[0] > b[2] - srr - 4 || cp2[1] < 14 || cp2[1] > L - 8) continue;
      if (pathD(cp2[0], cp2[1]) < srr + 4 || Math.hypot(cp2[0] - clr.x, cp2[1] - clr.y) < srr + clr.r + 6 || Math.hypot(cp2[0] - start.x, cp2[1] - start.y) < srr + start.r + 4) continue;
      if (gy && (Math.abs(cp2[1] - gy) < srr + 6 || (cp2[1] - gy) * (o3[1] - gy) < 0)) continue;
      if (spurD(cp2[0], cp2[1]) < srr + 3) continue;
      if (GYM && (inGym(cp2[0], cp2[1], srr + 4) || gymShadow(cp2[0], cp2[1]) || screensGym(cp2[0], cp2[1] - 1, srr, ssz[2]))) continue;
      sc = { x:cp2[0], y:cp2[1] - 1, r:srr, kind:sk, w:ssz[0], d:ssz[1], h:ssz[2], s:s2, ox:o3[0], oy:o3[1] }; }
    if (sc){ var my = sk === 'mooredship' ? sc.y : sc.y + sc.d / 2 + 0.9, mx = sk === 'mooredship' ? sc.x + (sc.ox < sc.x ? -1 : 1) * (sc.w / 2 + 1.6) : sc.x;
      sc.mx = mx; sc.my = my; var tdx = mx - sc.ox, tdy = my - sc.oy, tl = Math.hypot(tdx, tdy) || 1, bw2 = (R() < 0.5 ? -1 : 1) * 1.6;
      for (var k2 = 0; k2 <= 12; k2++){ var t2 = k2 / 12, bb2 = Math.sin(t2 * Math.PI) * bw2; spur2.push([sc.ox + tdx * t2 - tdy / tl * bb2, sc.oy + tdy * t2 + tdx / tl * bb2]); } } }
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
  function spurD(x, y){ var m = 1e9; for (var i = 0; i < spur.length - 1; i++) m = Math.min(m, segD(x, y, spur[i][0], spur[i][1], spur[i + 1][0], spur[i + 1][1]));
    for (var i3 = 0; i3 < spur2.length - 1; i3++) m = Math.min(m, segD(x, y, spur2[i3][0], spur2[i3][1], spur2[i3 + 1][0], spur2[i3 + 1][1])); return GYM ? Math.min(m, gymSpurD(x, y)) : m; }
  // a field of how far each point is from the path, the spur and the clearings, read back smoothly
  var DS = 1, DX = Math.ceil((b[2] - b[0]) / DS) + 1, DY = Math.ceil((b[3] - b[1]) / DS) + 1, DD = new Float32Array(DX * DY);
  for (var j = 0; j < DY; j++) for (var i2 = 0; i2 < DX; i2++){ var x = b[0] + i2 * DS, yy = b[1] + j * DS; DD[j * DX + i2] = Math.min(pathD(x, yy), spurD(x, yy) + 0.4); }
  function walkD(x, y){ var fx = (x - b[0]) / DS, fy = (y - b[1]) / DS; if (fx < 0 || fy < 0 || fx >= DX - 1 || fy >= DY - 1) return 99;
    var i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, q = j * DX + i; return (DD[q] * (1 - u) + DD[q + 1] * u) * (1 - v) + (DD[q + DX] * (1 - u) + DD[q + DX + 1] * u) * v; }
  function inClear(x, y, pad){ pad = pad || 0; if (inFoot(x, y, pad + 1.5)) return true; if (GYM && (inGym(x, y, pad + 1.2) || gymShadow(x, y))) return true; if (sc && Math.hypot(x - sc.x, y - sc.y) < sc.r + pad) return true; return Math.hypot(x - clr.x, y - clr.y) < clr.r + pad || Math.hypot(x - start.x, y - start.y) < start.r + pad || (y < 3 + pad && y > -16 && Math.abs(x - archX) < 9 + pad); }

  var P = { spec:spec, seed:seed, L:L, b:b, plaza:plaza, path:path, cum:cum, cx:cx, gy:gy, SL:SL, atS:atS, tanS:tanS, beside:beside, arch:{ x:archX, y:0 }, route:route, themeAt:themeAt, clr:clr, spur:spur, spur2:spur2, locked:locked, style:style, clrKind:clrKind, start:start, walkD:walkD, inClear:inClear, feet:feet, footAt:memo2(footAt),
    gym:GYM, inGym:inGym, gymCell:memo2(gymCell), things:[], cols:[], items:[], hazards:[] };
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
        if (spurD(x, yc) < near + 1) ok = false;
        if (GYM && (inGym(x, yc, hw + 4) || gymShadow(x, yc))) ok = false; }
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
  // a gym built out over the sea stands on its own deck, and its little path out to it is a jetty
  function seaAt(x, y){ if (!P.sea) return false; if (GYM && (inGym(x, y, 0.5) || gymSpurD(x, y) < PW + 0.6)) return false; return P.sea.side * x > seaEdge(y || 0); }
  P.seaEdge = seaEdge;
  poolAt = memo2(poolAt); P.poolAt = poolAt; P.seaAt = seaAt;

  // ---- what stands where. Every tall thing is kept from standing in front of the path, so the golfer is
  // never behind a tree on the way (off the path he can be, and the picture puts him behind it)
  var used = [];
  function free(x, y, r){ for (var i = 0; i < used.length; i++){ var u = used[i]; if (Math.hypot(u.x - x, u.y - y) < u.r + r) return false; } return true; }
  function okGround(x, y, r){ if (x < b[0] + 2 || x > b[2] - 2 || y < b[1] + 2 || y > b[3] - 2) return false; if (poolAt(x, y) || seaAt(x, y)) return false;
    for (var a = 0; a < 6; a++){ var ax = x + Math.cos(a) * r, ay = y + Math.sin(a) * r; if (poolAt(ax, ay) || seaAt(ax, ay)) return false; } return true; }
  /* NOTHING TALL OVER A GYM'S ROOM ON SCREEN (the owner, 2026-10-17: a tree's canopy over the room's wall). A thing r
     round and H tall at (x, y) stands up the screen by H * CE against the ground's y * SE, so a tree a few feet nearer
     the camera than the near wall puts its crown over the room, and one just behind the far wall stands over that wall.
     So a tree, a landmark, a rock or a lamp is kept off the room's whole rect on screen (its floor up to the top of its
     walls) plus m feet all round, for every gym of every kind. wh is the wall's height as the frame measures the room
     (gymArtRect). A function, so the secret clearing (placed earlier) asks it too. */
  function screensGym(x, y, r, H){ if (!GYM) return false; var m = 1.5, wh = 3.4, dx = Math.max(GYM.x0 - x, 0, x - GYM.x0 - GYM.w); if (dx >= r + m) return false;
    var top = y * SE - (H || 0) * CE, bot = (y + r) * SE, rt = GYM.y0 * SE - wh * CE, rb = (GYM.y0 + GYM.d) * SE;
    return top < rb + m * SE && bot > rt - m * SE; }
  P.screensGym = screensGym;
  function screensPath(x, y, r, H){   // would a thing r wide and H tall at (x, y) hide much of the path (or a gym's room) from the camera?
    if (screensGym(x, y, r, H)) return true;
    var reach = H * CE / SE * 0.6 + 1;
    for (var i = 0; i < path.length; i++){ var p = path[i]; if (p[1] < y - reach || p[1] > y + 0.5) continue; if (Math.abs(p[0] - x) < r * 0.7 + PW) return true; }
    for (i = 0; i < spur.length; i++){ p = spur[i]; if (p[1] < y - reach || p[1] > y + 0.5) continue; if (Math.abs(p[0] - x) < r + PW + 1.2) return true; }
    if (y > clr.y && y - reach < clr.y + clr.r && Math.abs(x - clr.x) < clr.r + r) return true;
    return false; }
  function place(kind, x, y, r, h, o){ var t = { k:kind, x:x, y:y, r:r, h:h, th:themeAt(y) }; if (o) for (var q in o) t[q] = o[q]; P.things.push(t); used.push({ x:x, y:y, r:r }); return t; }
  P.place = place;

  // the end: an arch over the path at y = 0, and the hole's carpet beyond it
  place('arch', archX, 0, 0.1, 9);
  // the gym's walls, gate and posts are one build (BUILD.gym); as a thing it keeps everything else out and blocks the walk
  if (GYM) place('gym', GYM.x0 + GYM.w / 2, GYM.y0 + GYM.d / 2, 0.1, 1.6, { w:GYM.w, d:GYM.d, th:themeAt(GYM.y0 + GYM.d / 2) });
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
  if (sc){ place(sc.kind, sc.x, sc.y, Math.max(sc.w, sc.d) / 2 + 0.3, sc.h, { w:sc.w, d:sc.d, th:themeAt(sc.y), secret:1, face:sc.ox < sc.x ? -1 : 1 });
    if (sc.kind === 'mooredship') place('gangplank', (sc.x + sc.mx) / 2, sc.y, 0.1, 0.6, { th:themeAt(sc.y), face:sc.ox < sc.x ? -1 : 1 });
    P.secret = { x:sc.mx, y:sc.my, r:1.5, i:spec.secret.i, kind:sc.kind, hint:SECRET_HINT[sc.kind] || SECRET_HINT.secretdoor }; used.push({ x:sc.mx, y:sc.my, r:1.6 }); }
  // landmarks: one or two of the world's, beside the path in open ground
  var lms = kitOf(th).lm, nlm = kitOf(th).nlm || (2 + (R() < 0.4 ? 1 : 0));   // a stop that is a place (a town) can ask for more
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
  if (kitOf(th).lm.indexOf('lamps') >= 0 || baseTh(th) === 'neon') for (var ls2 = 14; ls2 < SL - 6; ls2 += 22){ var sd2 = (ls2 / 22 | 0) % 2 ? 1 : -1, lq2 = beside(ls2, sd2, PW + 1.3), lx2 = lq2[0], ly2 = lq2[1];
    if (free(lx2, ly2, 0.4) && okGround(lx2, ly2, 0.4) && !inClear(lx2, ly2, 1) && !screensGym(lx2, ly2, 0.6, 7)) place('lamp', lx2, ly2, 0.3, 7); }

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
  function hitThing(x, y){ for (var i = 0; i < P.things.length; i++){ var t = P.things[i], r = BLOCKR[t.k] != null ? BLOCKR[t.k] : t.r; if (t.k === 'arch' || t.k === 'wall' || t.k === 'fence' || t.k === 'pen') continue;
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
    if (free(nx, ny, 1) && okGround(nx, ny, 1) && !(GYM && (inGym(nx, ny, 1.5) || gymShadow(nx, ny)))){ item('npc', nx, ny, { th:themeAt(ny) }); used.push({ x:nx, y:ny, r:1 }); break; } }
  /* THE GYM'S CIVILIAN, the owner's call: somebody at the park standing by the gate, who says one thing about what is in
     there (a nudge, never the answer), and a plainer thing once you have pulled the lever twice. */
  // they stand toward the middle of the screen (on a shore the camera leans out to sea), so their bubble has room
  if (GYM){ var cv0 = null, cs0 = P.sea ? P.sea.side : (GYM.ax > 0 ? -1 : 1); for (var cq = 0; cq < 32 && !cv0; cq++){ var sd3 = cq & 1 ? -cs0 : cs0, cxq = GYM.ax + sd3 * (2.1 + (cq >> 1) * 0.4), cyq = GYM.ay + 0.7 + (cq >> 3) * 0.6;
      if (okGround(cxq, cyq, 0.8) && free(cxq, cyq, 0.8) && !inGym(cxq, cyq, 0.8) && gymSpurD(cxq, cyq) > 1.4) cv0 = [cxq, cyq]; }
    cv0 = cv0 || [GYM.ax + 2.4, GYM.ay + 1.2]; P.civ = item('civ', cv0[0], cv0[1], { th:themeAt(cv0[1]) }); used.push({ x:cv0[0], y:cv0[1], r:1 });
    // the vault chest at the far end: on the list of what this trail holds, opened by solving the gym
    var vq = GYD.chest, vc = vq % GYD.W, vr = (vq / GYD.W) | 0; P.vault = item('vault', GYM.x0 + (vc + 0.5) * GYM.T, GYM.y0 + (vr + 0.5) * GYM.T, { gym:GYM.id }); }

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
    if (GYM || force === 'none' || (!force && roll >= PZ_SHARE)) return;   // a gym trail has its gym instead
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
    /* AND IN SIGHT. The camera looks up the land from the near side, so a tall tree a few feet nearer than a puzzle puts
       its canopy right over it: a crate nobody could see was the first screenshot. clearOut also takes the trees whose
       canopy stands between it and the camera. */
    function clearOut(x, y, r){ var gone = P.things.filter(function(t){ if (!(TREEH[t.k] || LOWR[t.k])) return false; if (Math.hypot(t.x - x, t.y - y) < r + (t.r || 0.5) + 0.3) return true;
        var tall = TREEH[t.k]; return !!tall && t.y > y - 1 && t.y < y + r + (t.h || 10) * 1.15 && Math.abs(t.x - x) < r + (t.cr || tall[2] || 3) + 0.5; });
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
      // each ring round it a little wider than the last, so a crowded spot still throws all of them
      for (var i = 0; out.length < n && i < n * 60; i++){ var a = a0 + i * 2.39996, r = (pen ? 0.9 : 2.1) + (i % 4) * 0.45 + RQ() * 0.4 + (pen ? 0 : Math.floor(i / (n * 4)) * 0.5), dx = x + Math.cos(a) * r, dy = y + Math.sin(a) * r * 0.8;
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
          for (var vs = 0; vs < steps.length; vs += 3) clearOut(steps[vs][0], steps[vs][1], 0.6); clearOut(cxp, cyp, 1.5);
          var pd = prize(cxp, cyp, 'dig'); made = { k:'dig', prize:pd.id, spot:[ds[0], ds[1]], steps:steps }; } }
      else if (k === 'plate' || k === 'push'){ var pn = pen(PEN_R + PW + 2.5, 13); if (!pn) continue;
        if (k === 'plate'){ var gx = pn.x, gy2 = pn.y + pn.r, pl = null;
          for (var ps = 0; ps < 300 && !pl; ps++){ var q2 = beside(SL * RQ(), RQ() < 0.5 ? -1 : 1, PW + 1.2 + RQ() * 1.2), dg = Math.hypot(q2[0] - gx, q2[1] - gy2);
            if (dg >= 8 && dg <= 14 && Math.hypot(q2[0] - pn.x, q2[1] - pn.y) > pn.r + 3 && okAt(q2[0], q2[1], 0.9) && reach(q2[0], q2[1], 1.0)) pl = { x:q2[0], y:q2[1], t:PZ_GATE_S + dg * 0.18 }; }
          if (!pl) continue;
          clearOut(pl.x, pl.y, 1); clearOut(pn.x, pn.y + pn.r, 1.5);
          place('pen', pn.x, pn.y, pn.r, 2.6, { a:pn.a, half:pn.half, th:themeAt(pn.y), gated:1 }); used.push({ x:pn.x, y:pn.y, r:pn.r + 2 }); used.push({ x:pl.x, y:pl.y, r:1.4 });
          var pp = prize(pn.x, pn.y, 'plate', pn); made = { k:'plate', prize:pp.id, pen:pn, plate:pl }; }
        else { var sj = RQ() < 0.5 ? -1 : 1, cy3 = pn.y + pn.r + 1.1, rx2 = pn.x + sj * 3.6, kx3 = JAM_ROCK[themeAt(cy3)] || 'rock';
          // the crate slides along x: from the rock's side it goes all the way across, toward the rock it jams
          var crate = { x:pn.x, y:cy3, x0:pn.x, lo:sj > 0 ? pn.x - 2.6 : pn.x - 0.6, hi:sj > 0 ? pn.x + 0.6 : pn.x + 2.6, rock:sj };
          var fits = okGround(rx2, cy3, 1) && !hitThing(rx2, cy3) && okGround(pn.x - sj * 2.8, cy3, 0.9) && !hitThing(pn.x - sj * 2.8, cy3) && reach(pn.x + sj * 1.9, cy3, 0.7) && reach(pn.x - sj * 3.6, cy3 + 1.5, 1.0);
          if (!fits) continue;
          clearOut(pn.x, cy3, 3.6);
          place('pen', pn.x, pn.y, pn.r, 2.6, { a:pn.a, half:pn.half, th:themeAt(pn.y) }); used.push({ x:pn.x, y:pn.y, r:pn.r + 3 });
          var rk = place(kx3, rx2, cy3, 0.9, 1.4, { th:themeAt(cy3) }); P.cols.push({ x:rk.x, y:rk.y, r:0.9 });
          var pu = prize(pn.x, pn.y, 'push', pn); made = { k:'push', prize:pu.id, pen:pn, crate:crate }; } }
    }
    // a chest that could not throw all its coins is not a puzzle worth its bonus: no puzzle on this trail
    if (made && items.filter(function(t){ return t.id === made.prize; })[0].drops.length < PZ_COINS) made = null;
    if (!made){ back(S9); return; }
    made.th = themeAt(items.filter(function(t){ return t.id === made.prize; })[0].y);
    made.clue = pzClue(made.k, String(made.th).split('~')[0], RQ); made.name = PZ_NAME[made.k];
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
      for (var j = 0; j < items.length; j++){ var t = items[j]; if (t === skip) continue; if ((t.k === 'chest' || t.k === 'npc' || t.k === 'civ') && Math.hypot(x - t.x, y - t.y) < (t.k === 'chest' ? 1.3 : 1.0) + RB) return true; }
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
    // the secret's doorway: walkable to, or the trees and rocks along its path come out
    if (P.secret){ var GS = flood(!!P.fence), on2 = function(x, y, r){ return P.spur2.some(function(q){ return Math.hypot(q[0] - x, q[1] - y) < r + 1.8; }) || Math.hypot(P.secret.x - x, P.secret.y - y) < r + 1.8; };
      if (!near(GS, P.secret.x, P.secret.y, 1.3)){ P.things = P.things.filter(function(t){ return !((TREEH[t.k] || LOWR[t.k]) && on2(t.x, t.y, t.r || 0.6)); });
        P.cols = P.cols.filter(function(c){ return c.w || (c.r || 0) > 1.6 || !on2(c.x, c.y, c.r || 0.6); }); GS = flood(!!P.fence); }
      P.secret.reach = near(GS, P.secret.x, P.secret.y, 1.3); }
  }
  /* SHADOWS ON THE GROUND. The light comes from the upper left, the same as the golfer's, so everything tall
     throws a soft shadow down and to the right. It is what sets a tree on the ground rather than over it. */
  var SH = []; P.things.forEach(function(t){ var H = t.h || 1; if (H < 1.6 && !t.w) return; var rx, ry, cx2, cy2;
    if (t.w){ rx = t.w / 2 + H * 0.18; ry = t.d / 2 + H * 0.12; cx2 = t.x + H * 0.22; cy2 = t.y + H * 0.16; }
    else { var cr = t.cr || t.r * 1.4; rx = cr * 1.05 + 0.4; ry = cr * 0.75 + 0.3; cx2 = t.x + H * 0.2; cy2 = t.y + H * 0.14; }
    if (t.k === 'arch' || t.k === 'wall' || t.k === 'fence' || t.k === 'pen' || t.k === 'green' || t.k === 'gym') return; SH.push({ x:cx2, y:cy2, rx:rx, ry:ry }); });
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
/* THE SECRET ENTRANCES. One trail a world carries a second path to a clearing on the far side of the walk with
   a way in at the end of it: walk into the doorway and the game offers that world's secret hole. Most are a
   landmark the world already has (the shed, the school, the factory, the igloo, the cave); Pirate Cove's is a
   ship moored at the end of the path, and the rest a doorway in a mound of the world's own stone. The door is on
   the side that faces back down the walk (+y), so it is always the side the camera sees. */
/* WHAT THE TRAIL SAYS. One line a trail, picked by its seed from a pool in the world's own voice, so walking up to
   the chest is never the same sentence twice in a row. The local on a secret trail tells you there is a secret hole
   on it, never where; on any other trail he tells you about the golden ball if it is still out there. */
var CHEST_SAY = {
  any:['Is that a chest?', 'Hold on. What\'s that?', 'Something shiny, just off the path.', 'Treasure. Over there.', 'That looks worth a look.'],
  fence:['There\'s a chest behind that fence.', 'That fence is guarding something.', 'A chest, locked away. Find the key.'],
  clubhouse:['Somebody left a chest by the greens.'], school:['A chest? In the schoolyard?'], candy:['That chest smells like caramel.'],
  neon:['A chest. It\'s blinking.'], pirate:['Treasure! Arr.'], temple:['An old chest. Still shut.'], canyon:['A chest, half buried in the dust.'],
  volcano:['A chest. Still warm.'], sky:['A chest, way up here?'], dino:['A chest by the nest. Don\'t wake anybody.'], iceage:['A chest, older than the ice.'], moon:['A supply chest. Somebody lost it in the drop.'],
  haunted:['A chest. Don\'t look behind it.'], harvest:['A chest out by the crops.'] };
var SECRET_SAY = {
  clubhouse:'Word is there\'s a secret hole somewhere on this trail. I\'ve never found it.',
  school:'Kids say there\'s a secret hole on this trail. Don\'t tell the principal.',
  candy:'There\'s a secret hole on this trail. The foreman doesn\'t know.',
  neon:'There\'s a hidden level on this trail. Most players walk right past it.',
  pirate:'There be a secret hole on this trail. That\'s all I\'ll say.',
  temple:'The old maps mark a secret hole on this trail. Nobody\'s found it lately.',
  canyon:'There\'s a secret hole out here on this trail. Took me years to find it.',
  volcano:'Somewhere on this trail there\'s a secret hole. Watch your step looking.',
  sky:'I saw a secret hole on this trail from my balloon. Can\'t say where.',
  dino:'I dug up an old map. It says there\'s a secret hole on this trail.',
  iceage:'The old drawings say there\'s a secret hole on this trail.',
  moon:'Mission control logged a secret hole on this trail. On the dark side, they think.',
  any:'There\'s a secret hole somewhere on this trail. Keep your eyes open.' };
var SECRET_DONE = 'You found the secret hole on this trail. Not many do.';
var GOLD_SAY = ['There\'s a golden ball off the path here. Look behind things.', 'Somebody lost a golden ball out here.', 'A golden ball\'s hiding on this trail. Off the path.', 'Keep an eye out. There\'s a golden ball around here.'];
function sayPick(list, seed){ return list[((seed >>> 0) % list.length)]; }
var SECRET_KIND = { clubhouse:'shed', school:'school', candy:'factory', neon:'secretdoor', pirate:'mooredship', temple:'secretdoor', canyon:'secretdoor', volcano:'secretdoor', sky:'secretdoor', dino:'secretdoor', iceage:'cave', moon:'secretdoor' };
var SECRET_HINT = { shed:'The shed door is open a crack.', school:'Somebody left the side door open.', factory:'The factory door is open. Something hums inside.', secretdoor:'There is a way in, behind there.',
  mooredship:'A ship, tied up. The gangplank is down.', igloo:'Somebody built an igloo out here.', cave:'A draft is coming out of that cave.' };
// landmark footprints: width, depth, height
var LMSIZE = { shed:[9, 6, 11], green:[9, 7, 1], bench:[3, 1.2, 2], lamps:[1, 1, 7], ruin:[10, 3, 9], statue:[3, 3, 8], columns:[8, 5, 9], wreck:[12, 5, 7], boat:[6, 3, 3], barrels:[4, 3, 2.4],
  mesa:[11, 8, 13], tower:[5, 5, 15], cart:[5, 2.5, 3.5], basaltset:[7, 6, 9], vent:[5, 5, 4], skull:[5, 4, 5], igloo:[7, 7, 5], snowman:[3, 3, 5.5], cabin:[9, 6, 11],
  balloon:[6, 6, 16], kite:[3, 3, 12], pillar:[5, 5, 12], cabinets:[8, 2.5, 6.5], sign:[8, 1.5, 11], pylons:[6, 6, 12], crypt:[8, 6, 10], graves:[9, 6, 3], fenceyard:[9, 6, 3],
  barn:[11, 8, 13], scarecrow:[3, 2, 7], cornfield:[10, 8, 5], school:[12, 8, 13], swings:[8, 3, 6], slide:[4, 6, 5], mammoth:[9, 4, 6.5], cave:[10, 7, 6], tusks:[7, 2, 5],
  factory:[11, 8, 13], gumballs:[5, 5, 7], canes:[8, 1.5, 5.5], secretdoor:[6, 4, 5.5], skullrock:[9, 7, 9], shack:[10, 7, 11], falls:[11, 8, 11], fortwall:[8, 2.6, 4.2], stacks:[6, 4, 7], camp:[9, 7, 9], longneck:[13, 4, 11], dinoskel:[10, 4, 4.5], nest:[6, 6, 2.8], mooredship:[5, 14, 11.5] };

/* ------------------------------------------------------------------------------- the ground */
function land(P){
  var b = P.b, seed = P.seed, L = P.L, cx = P.cx, sp = P.spec;
    return {
    gain:1.4,
    bg:kitOf(sp.kitAs || sp.theme).g[0],
    // a hole is flat ground, its rails and blocks stand up off it, its water and cup sit down in it
    // a gym's room is deck, and its kind may sink or raise a tile of it (push's holes: gymkinds/push.js floor())
    h:function(x, y){ var gc = P.gym && P.gymCell(x, y); if (gc){ var gf = gymFloor(P, gc); return gf && gf.h != null ? gf.h : GYM_DECK; }
      var fc = P.footAt(x, y); if (fc) return fc.c === 10 ? 0.42 : fc.c === 11 ? 0.55 : fc.c === 12 ? -0.3 : (fc.c === 5 || fc.c === 9) ? -0.3 : 0.05;
      var wd = P.walkD(x, y), z = (fbm(x * 0.045, y * 0.045, seed) - 0.45) * 2.4 * sm(PW + 0.5, PW + 7, wd);
      if (P.inClear(x, y)) z *= 0.3; if (P.deckAt(x, y)){ var dk = P.creekD(x, y) + P.creek.hw; return 0.22 + 0.4 * Math.max(0, 1 - dk * dk / ((P.creek.hw + 1.1) * (P.creek.hw + 1.1))); }
      if (P.creek){ var cd = P.creekD(x, y); if (cd < 1.4 && cd > 0) z = Math.min(z, -0.12 * (1.4 - cd)); } var o = P.poolAt(x, y); if (o) z = o.k === 'lava' ? -0.45 : o.k === 'water' ? -0.55 : o.k === 'ice' ? -0.05 : -0.12;
      if (P.seaAt(x, y)) z = -0.7; if (wd < PW) z -= 0.06; return z; },
    mat:function(x, y){ var gc = P.gym && P.gymCell(x, y);
      if (gc){ var gf2 = gymFloor(P, gc); if (gf2 && gf2.mat) return gf2.mat;
        return [gc.k === '#' ? 'gwall' : 'gdeck', { gu:gc.u, gv:gc.v, gc:gc.c, gr:gc.r }]; }
      var fc = P.footAt(x, y);
      if (fc){ var c = fc.c, q = fc.i; return [c === 10 ? 'cr' + q : c === 11 ? 'cb' + q : c === 12 ? 'cup' : c === 4 ? 'sand' : (c === 5 || c === 9) ? 'water' : c === 6 ? 'ice' : c === 7 ? 'bog' : c === 3 ? 'g' : c === 2 ? 'cf' + q : 'cc' + q]; }
      if (P.deckAt(x, y)) return ['deck', { pl:Math.floor((y - P.creek.cy(x)) * 2.2 + 50) }];
      var o = P.poolAt(x, y); if (o) return [o.k === 'slow' ? 'bog' : o.k]; if (P.seaAt(x, y)) return ['water'];
      if (P.creek && P.creek.k !== 'ice' && P.creekD(x, y) < 0.7) return [P.creek.k === 'lava' ? 'scorch' : 'bank'];
      var wd = P.walkD(x, y), sh = P.shadeAt(x, y) * (P.fx ? 0.4 : 1), ex = sh ? { sh:sh } : null;   // under the console look the sun casts the real shadow, so the painted one is only a contact shade
      if (!P.feet.length && y < -1.5 && y > -16 && Math.abs(x - P.arch.x) < 7.5) return [Math.abs(x - P.arch.x) > 6.6 || y < -15.2 || y > -2.3 ? 'rail' : 'carpet'];
      var dc = Math.hypot(x - P.clr.x, y - P.clr.y) - P.clr.r, ds = Math.hypot(x - P.start.x, y - P.start.y) - (P.start.r - 1), dIn = Math.min(wd - PW, dc, ds);
      if (dIn < 0){ if (dIn > -0.35){ ex = ex || {}; ex.edge = 1; } return [P.themeAt(y) === (sp.kitAs || sp.theme) ? 'path' : 'path0', ex]; }
      if (P.sea && P.sea.side * x > P.seaEdge(y) - 3.5) return ['sand', ex];
      if (dIn < 0.3){ ex = ex || {}; ex.edge = 1; }
      var fb = vn(x * 0.22, y * 0.22, seed + 77); if (fb > 0.74 && dIn > 1.2){ ex = ex || {}; ex.fl = Math.min(0.55, (fb - 0.74) * 4); }
      return [P.themeAt(y) === (sp.kitAs || sp.theme) ? 'g' : 'g0', ex]; },
    build:function(B){ P.things.forEach(function(t, i){ if (PLANT[t.k]) return; try{ (BUILD[t.k] || BUILD.rock)(B, t, i, P); }catch(e){} }); },
    mats:mats(P)
  };
}
function mats(P){
  var k = kitOf(P.spec.kitAs || P.spec.theme), k0 = kitOf(P.themeAt(P.L)), T = P.spec.T || {};
  // the ground darkens where something throws its shadow on it (c.sh), and grass grows flowers in beds
  function shd(col, f){ var n = parseInt(col.slice(1), 16), r = n >> 16, g2 = n >> 8 & 255, b2 = n & 255; f = 1 - f; return '#' + ((1 << 24) + (Math.round(r * f * 0.92) << 16) + (Math.round(g2 * f) << 8) + Math.round(b2 * Math.min(1, f * 1.08))).toString(16).slice(1); }
  var FL = ['#f7e36b', '#ffffff', '#f48fb1', '#b39ddb'];
  function gfn(kk){ return function(c, R, h3){ var n1 = h3(c.ti >> 1, c.tj >> 1, 11), n2 = h3(c.ti, c.tj, 12), g = kk.g, col;
    if (kk.grid && ((c.ti % 32) === 0 || (c.tj % 24) === 0)) col = '#3a2a8a';
    // no flower beds on a stop's own ground (cobbles, tiles, desert): they read as flecks on it
    else if (c.fl && !kk.grid && !kk.gpat && h3(c.ti >> 1, c.tj >> 1, 21) < c.fl){ var fq = h3(c.ti >> 1, c.tj >> 1, 22); col = kk.snow ? '#ffffff' : ((c.ti & 1) + (c.tj & 1) === 1 || fq < 0.3) ? FL[(fq * 4 * FL.length | 0) % FL.length] : shd(g[0], 0.2); }   // a bed of flowers, each a petal or two on a dark stem
    else if (kk.gpat === 'cobble'){ var qi = c.ti >> 1, qj = c.tj >> 1, rw = Math.floor(qj / 3), of = rw % 2 ? 2 : 0;   // cobbles a foot by three quarters, as in the town's holes
      col = (qj % 3 === 0 || (qi + of) % 4 === 0) ? '#7e7262' : (function(n){ return n < 0.3 ? '#b8a890' : n < 0.62 ? '#ac9e88' : '#9e907a'; })(hash(Math.floor((qi + of) / 4), rw, 4)); }
    else if (kk.gpat === 'stone'){ var sa = vn(c.ti * 0.11, c.tj * 0.11, 3), sb = vn(c.ti * 0.045, c.tj * 0.045, 4); col = sb > 0.68 ? '#5f7a3a' : sa < 0.3 ? '#6e6a62' : sa > 0.68 ? '#a29e92' : '#8a867c'; }
    else if (kk.gpat === 'floor'){ var fa = vn(c.ti * 0.055, c.tj * 0.055, 7), fb = vn(c.ti * 0.15, c.tj * 0.15, 8); col = fa > 0.66 ? '#5e5030' : fa > 0.58 ? '#4e5a2c' : fb > 0.6 ? '#48742e' : fb < 0.3 ? '#365e26' : '#3f6a2a'; }
    else if (kk.gpat && GPAT[kk.gpat]) col = GPAT[kk.gpat](c, kk);   // a world's own ground pattern (its stops file)
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
    water:['', '', '', 0, lfn((P.sea ? k.seaC || ['#1f8fc8', '#5cc6ee'] : k.waterC || ['#3f86c8', '#6fb3e6']), 13)],
    lava:['', '', '', 0, lfn(['#ff6a1a', '#ffc23a'], 9)], ice:['', '', '', 0, lfn(k.iceC || ['#a8dcf4', '#e2f6ff'], 23)], bog:['', '', '', 0, lfn(k.bogC || ['#5d4634', '#7a6044'], 17)],
    sand:k.sandC || ['#ecdba4', '#f4e4b4', '#dcc88c', 0.2],   // the shore by a sea: a stop can give its own (black sand on a volcano)
    carpet:[T.carpet || '#2f8f4e', T.carpet2 || '#2a8246', T.carpet || '#2f8f4e', 0.16], rail:[T.wall || '#f4efe2', T.wallHi || '#ffffff', T.wall || '#f4efe2', 0.1],
    cup:['#141414', '#202020', '#141414', 0],
    // a bridge's deck, planks laid across the walk (stone slabs in the temple and the volcano), and the creek's banks
    deck:['', '', '', 0, function(c, R, h3){ var st = P.creek && (baseTh(P.themeAt(P.creek.y0)) === 'volcano' || baseTh(P.themeAt(P.creek.y0)) === 'temple'), n = h3(c.ti, c.tj, 31), m = ((c.pl % 2) + 2) % 2;
      var cols = st ? ['#8a8078', '#9a9088', '#5e564f'] : P.creek && baseTh(P.themeAt(P.creek.y0)) === 'neon' ? ['#2a3a90', '#3a4ab0', '#151c48'] : ['#a8865a', '#b8966a', '#6e5236'];
      return R(n < 0.04 ? cols[2] : m ? cols[0] : cols[1]); }],
    bank:['#8a7a62', '#9a8a70', '#6e624e', 0.3], scorch:['#2a2226', '#3a2e30', '#4a2a22', 0.25]
  };
  /* THE GYM'S FLOOR: deck planks laid across, a dark seam on every tile's edge so the grid he steps on reads at a glance,
     and a wall's foot in its shadow. Whatever the kind sets into the floor it paints itself (mats(): push's holes, dark
     with water glinting at the bottom, and its belts with their chevrons pointing the way they run). */
  if (P.gym){ var GP = gymPal(P.spec.theme);
    out.gdeck = ['', '', '', 0, function(c, R, h3){ var e = c.gu < 0.06 || c.gu > 0.94 || c.gv < 0.06 || c.gv > 0.94, pl = Math.floor((c.gv || 0) * 4), n = h3(c.ti, c.tj, 41);
      var col = e ? GP.deck[2] : (Math.abs((c.gv || 0) * 4 - Math.round((c.gv || 0) * 4)) < 0.06 ? GP.deck[2] : ((pl + (c.gc || 0) + (c.gr || 0)) % 2 ? GP.deck[0] : GP.deck[1]));
      if (!e && n < 0.05) col = GP.deck[2]; return R(c.dt < 0 ? GP.deck[2] : col); }];
    out.gwall = ['', '', '', 0, function(c, R){ return R(GP.deck[2]); }];
    if (P.gym.K.mats){ var KM2 = P.gym.K.mats(baseTh(P.spec.theme), GP.deck); for (var km in KM2) out[km] = KM2[km]; } }
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
BUILD.lamp = function(B, t, i){ var x = t.x, y = t.y, zb = B.gz(x, y), pole = baseTh(t.th) === 'neon' ? '#2bf0ff' : '#2a2a30', glow = baseTh(t.th) === 'neon' ? '#ff8ae8' : '#fff3c4';
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
BUILD.bridge = function(B, t){ var x = t.x, y = t.y, tx = t.tx, ty = t.ty, hl = t.half, off = PW + 0.45, zt = B.gz(x, y), stone = baseTh(t.th) === 'volcano' || baseTh(t.th) === 'temple', neon = baseTh(t.th) === 'neon';
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
BUILD.wall = function(B, t, i, P){ var kx = kitOf(P.spec.kitAs || P.spec.theme), y = t.y, gx = t.gx, b = P.b, c1 = kx.wall[0], c2 = kx.wall[1];
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
/* THE GYM (gyms.js is the registry, its kind file the rules and the layouts; plan() fits it beside the walk). Its floor is
   ground (land.h, mats), GYM_DECK above the land, with whatever its kind sets into it (floor(): push's holes sit down
   in it); its walls and the gate are this one build, a row of tiles a solid, in the world's wall colours: a fort's stone
   or a ship's planks. The kind's pieces, the lever and the vault chest move, so run() draws them. */
var GYM_DECK = 0.45, GYM_WALL = 0.95;
var GYM_PAL = { pirate:{ deck:['#c3935f', '#b38353', '#6e4a2c'] } };
function gymPal(th){ return GYM_PAL[baseTh(th)] || GYM_PAL.pirate; }
// what the gym's kind sets into its floor at a point of the room (gyms.js KINDS README, floor()), or null for deck
function gymFloor(P, gc){ var K = P.gym.K; return K && K.floor ? K.floor(gc) : null; }
BUILD.gym = function(B, t, i, P){ var Gm = P.gym; if (!Gm) return; var Q = Gm.Q, T = Gm.T, kx = kitOf(t.th), c1 = kx.wall[0], c2 = kx.wall[1], z0 = GYM_DECK, gd = window.RTT_PUTT_GYMS.byId(Gm.id) || {};
  var stone = (gd.look || {}).wall === 'stone', gcol = Q.gate % Q.W, grow = (Q.gate / Q.W) | 0;
  function cellAt(c, r){ return c < 0 || r < 0 || c >= Q.W || r >= Q.H ? '#' : Q.cell[r * Q.W + c]; }
  for (var r = 0; r < Q.H; r++) (function(r){ var y0 = Gm.y0 + r * T, y1 = y0 + T;
    B.solid(Gm.x0, y0, z0 - 0.05, Gm.x0 + Gm.w, y1, z0 + 3.7, function(px, py, pz){ var c = Math.floor((px - Gm.x0) / T); if (c < 0 || c >= Q.W) return null; var k = Q.cell[r * Q.W + c], tt = pz - z0, u = (px - Gm.x0) / T - c, v = (py - y0) / T;
      // the gate: a post either side of it and a beam over it, the way in
      if (r === grow && Math.abs(c - gcol) <= 1){ var gx = (px - Gm.x0) / T - gcol;
        if (tt > 2.85 && tt < 3.35 && gx > -0.3 && gx < 1.3 && v > 0.3 && v < 0.7) return tt > 3.2 ? c1 : c2;
        if (k === '#' && ((gx > -0.3 && gx < 0.02) || (gx > 0.98 && gx < 1.3)) && v > 0.25 && v < 0.75 && tt < 3.35) return (tt * 3 | 0) % 2 ? c1 : c2; }
      if (k !== '#' || tt > GYM_WALL) return null;
      var top = tt > GYM_WALL - 0.16;
      if (stone){ var course = Math.floor(tt / 0.42), off = course % 2 ? 0.5 : 0, bu = ((px - Gm.x0) / 0.8 + off) % 1, seam = bu < 0.08 || (tt % 0.42) < 0.05;
        if (top) return hash(px * 4 | 0, py * 4 | 0, 5) < 0.25 ? c2 : c1; return seam ? c2 : (hash(Math.floor((px - Gm.x0) / 0.8 + off), course, 7) < 0.3 ? c2 : c1); }
      // planks: a post at every tile's corner, boards between, a rail along the top
      var post = (u < 0.1 || u > 0.9) && (v < 0.1 || v > 0.9); if (post) return c2;
      if (top) return c1; var board = Math.floor(tt / 0.36); return (tt % 0.36) < 0.05 ? c2 : (hash(c, board, r) < 0.35 ? c2 : c1); }, 0.2); })(r); };
// a lever for the reset, at two angles (0 up, 1 pulled), and a smaller vault chest for a gym (the trail chest at TILE size)
function gymLeverFn(on){ return function(B){ var a = on ? 0.85 : -0.85, ca = Math.cos(a), sa = Math.sin(a), PZ0 = 1.15;
  box(B, 0, 0, 3.4, 1, 3.2, function(dx, dy, tt){
    // a post of the gym's iron with a slot in its top, and the handle swinging over in the x and z plane from its pivot
    if (tt < PZ0 + 0.1 && Math.abs(dx) < 0.36 && Math.abs(dy) < 0.3) return Math.abs(dx) > 0.28 || tt > PZ0 ? '#4a4a52' : (tt < 0.12 ? '#2a2a30' : '#6e6e7a');
    var hx = dx, hz = tt - PZ0, along = hx * sa + hz * ca, side = hx * ca - hz * sa; if (Math.abs(dy) < 0.1 && along > 0 && along < 1.45 && Math.abs(side) < 0.09) return '#2e2e34';
    if (Math.abs(dy) < 0.2 && Math.hypot(hx - sa * 1.55, hz - ca * 1.55) < 0.24) return '#e5483a'; return null; }, 0.0625); }; }
function scaleB(B, s){ var B2 = Object.create(B); B2.gz = function(x, y){ return B.gz(x * s, y * s) / s; };
  B2.solid = function(x0, y0, z0, x1, y1, z1, fn, sv){ B.solid(x0 * s, y0 * s, z0 * s, x1 * s, y1 * s, z1 * s, function(px, py, pz){ return fn(px / s, py / s, pz / s); }, (sv || 0.25) * s); }; return B2; }
var VAULT_K = 0.5;
function fencePal(th){ return baseTh(th) === 'neon' ? { post:'#ff2bd6', rail:'#2bf0ff' } : { post:'#7a5a3a', rail:'#a8865a' }; }
/* THE GAP IN A RING FENCE, as ringFence leaves it (whole segments of 40 drop out): its middle on the chord, its
   width post to post and the chord's direction, so the gate fills the gap exactly and lies along the fence. */
function fenceGap(F){ var n = 40, lo = 9, hi = -9;
  for (var k = 0; k < n; k++){ var a0 = k / n * 6.2832, a1 = (k + 1) / n * 6.2832, mid = (a0 + a1) / 2, dA = Math.atan2(Math.sin(mid - F.a), Math.cos(mid - F.a)); if (Math.abs(dA) >= F.half + 0.08) continue;
    var r0 = Math.atan2(Math.sin(a0 - F.a), Math.cos(a0 - F.a)), r1 = r0 + (a1 - a0); lo = Math.min(lo, r0); hi = Math.max(hi, r1); }
  if (hi < lo){ lo = -F.half; hi = F.half; }
  var e0 = [F.x + Math.cos(F.a + lo) * F.r, F.y + Math.sin(F.a + lo) * F.r], e1 = [F.x + Math.cos(F.a + hi) * F.r, F.y + Math.sin(F.a + hi) * F.r];
  return { x:(e0[0] + e1[0]) / 2, y:(e0[1] + e1[1]) / 2, w:Math.hypot(e1[0] - e0[0], e1[1] - e0[1]), ta:Math.atan2(e1[1] - e0[1], e1[0] - e0[0]) }; }
function ringFence(B, F, th){ var n = 40, kx = kitOf(th), pal = fencePal(th), post = pal.post, rail = pal.rail;
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
// ---- Pirate Cove's stops on the walk, the same things the holes stand among (land.js): the town's shacks, the jungle's waterfall and the
// old fort's wall, Skull Rock's sea stacks, and the captain's treasure camp
var SHACK_ROOF = ['#a8442e', '#2f6f8f', '#7a8a3a', '#8a5a9a'];
BUILD.shack = function(B, t, i){ var rf = SHACK_ROOF[i % 4]; gable(B, t.x, t.y, t.w - 1, t.d - 1, 5.6, 3.2, function(dx, dy, tt){ return (Math.floor((dx + 20) * 1.4) % 2) ? '#b08a5a' : '#9a7648'; },
  function(dx, dy, tt){ return (tt * 2.6 | 0) % 2 ? rf : '#6a2a1e'; }, '#3a2412'); };
BUILD.falls = function(B, t, i){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){
  if (dy > 0.8){ var pd = Math.hypot(dx / 2.8, (dy - 2.1) / 1.2); if (pd < 1 && tt < 0.3) return pd > 0.86 ? '#6e6a5a' : (hash(Math.floor(dx * 4), Math.floor(dy * 4), i) < 0.12 ? '#8fdce0' : '#2f8f9a'); if (dy > 1) return null; }
  var top = t.h * (0.75 + (vn(dx * 0.5, 2, i) - 0.5) * 0.4), d = Math.hypot(dx / (t.w / 2), (dy + 1.2) / (t.d / 2 * 0.75)) + (vn(dx * 0.9, tt * 0.9, i + 3) - 0.5) * 0.22; if (d > 1 || tt > top) return null;
  if (Math.abs(dx) < 1 && d > 0.78) return hash(Math.floor(dx * 5), Math.floor(tt * 3 - dx * 2), i + 5) < 0.4 ? '#ffffff' : '#bfe8f4';   // the falling water down the face
  if (tt > top - 0.5) return '#4f7a2e'; return (Math.floor(tt * 1.3) % 2) ? '#6e6a5a' : '#7e7a68'; }); };
BUILD.fortwall = function(B, t, i){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){
  if (dy > 0.4 && Math.abs(dx - 1.6) < 1.2 && tt < 1.2){ var cx = dx - 1.6; if (Math.abs(cx) < 0.9 && Math.hypot(dy - 0.9, tt - 0.75) < 0.26) return '#45454c'; if (Math.abs(Math.abs(cx) - 0.55) < 0.12 && Math.hypot(dy - 0.9, tt - 0.4) < 0.42) return '#5a3818'; return null; }   // the cannon
  if (Math.abs(dy) > 0.5) return null; var top = 2.8 + Math.sin(dx * 1.3) * 0.4 + (hash(Math.floor(dx * 1.5) + 9, 3, i) - 0.5) * 1 + (((dx + 9) * 1.2 | 0) % 2 ? 0.5 : 0); if (tt > top) return null;
  var row = Math.floor(tt * 2), col = Math.floor(dx * 1.2 + (row % 2) * 0.5); if ((tt * 2) % 1 < 0.12) return '#6a6658'; if (tt > top - 0.35 && hash(col, row, i) < 0.6) return '#4f7a2e';
  return hash(col, row, i + 1) < 0.3 ? '#8e8a78' : '#a29e8a'; }); };
BUILD.stacks = function(B, t, i){ var P2 = [[-1.6, -0.6, 6.4, 1.2], [1.4, 0.4, 4.6, 1], [2.6, -1, 3.2, 0.7]];
  box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ for (var s = 0; s < 3; s++){ var q = P2[s], rr = q[3] * (1 - tt / (q[2] + 1.6) * 0.4) + (vn(dx * 2, tt * 2, i + s) - 0.5) * 0.2;
    if (Math.hypot(dx - q[0], dy - q[1]) < rr && tt < q[2]) return tt > q[2] - 0.25 ? '#4f7a2e' : tt < 0.35 ? '#eef8f8' : (Math.floor(tt * 1.8) % 2 ? '#7a766c' : '#8e8a80'); } return null; }); };
BUILD.camp = function(B, t, i){ var q = t.w / 6; box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ dx /= q; dy /= q; tt /= q; var r = Math.hypot(dx, dy);
  if (r < 0.9 && tt < 0.3 && r > 0.6) return '#6e665e'; if (r < 0.62 && tt < 1.4 && r < 0.55 * (1 - tt / 1.4)) return tt < 0.15 ? '#3a2412' : tt < 0.5 ? '#ffd23a' : tt < 0.9 ? '#ff8a1a' : '#e5483a';   // the fire
  for (var c = -1; c <= 1; c += 2){ var cx = dx - c * 1.9, cy = dy + 0.6; if (Math.abs(cx) < 0.8 && Math.abs(cy) < 0.55 && tt < 1.25){ if (tt > 1.05) return '#ffd23a'; if (Math.abs(tt - 0.7) < 0.06 || Math.abs(Math.abs(cx) - 0.5) < 0.07) return '#c9a227'; return tt > 0.7 ? '#7a4a24' : '#8f5a2c'; } }   // two chests of gold
  var fx = dx + 2.2, fy = dy - 1.4; if (Math.hypot(fx, fy) < 0.09 && tt < 5.8) return '#4a2c16';
  if (Math.abs(fy) < 0.06 && fx > 0.05 && fx < 2 && tt > 4.4 && tt < 5.7){ var u = fx - 1, v = tt - 5.05; return (u * u + v * v < 0.1 || (Math.abs(Math.abs(u) - Math.abs(v)) < 0.07 && Math.abs(u) < 0.4 && v < -0.1)) ? '#f4efe2' : '#151218'; }   // the black flag
  return null; }, 0.125); };
// Skull Rock's own skull: grey stone, dark sockets, a row of teeth, grass on the crown
BUILD.skullrock = function(B, t){ var q = t.w / 5; box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ dx /= q; dy /= q; tt /= q; var d = Math.hypot(dx / 2.3, dy / 1.8, (tt - 2.6) / 2.4); if (d > 1) return null;
  if (dy > 0.9 && tt > 2.4 && tt < 3.6 && Math.abs(Math.abs(dx) - 0.9) < 0.45) return '#1a1612'; if (dy > 1 && tt > 1 && tt < 1.6 && Math.abs(dx) < 1.2) return ((dx * 3.4 | 0) % 2) ? '#d8d0bc' : '#5a5650';
  if (tt > 4.4) return '#4f7a2e'; return ((tt * 2 | 0) + (dx * 1.5 | 0)) % 3 ? '#8e8a80' : '#a29e92'; }); };
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
// ---- Dino Valley: a long neck standing over the trees, a skeleton half dug out of the ground, and a nest of eggs
BUILD.longneck = function(B, t, i){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var hide = function(){ var n = hash(Math.floor(dx * 4), Math.floor(tt * 4) + Math.floor(dy * 4) * 11, 3 + i); return n < 0.2 ? '#5a6e4a' : n > 0.86 ? '#8aa070' : '#6e8458'; };
  if (tt < 3 && Math.abs(Math.abs(dx + 0.4) - 1.7) < 0.5 && Math.abs(Math.abs(dy) - 0.8) < 0.45) return tt < 0.3 ? '#3a4630' : '#5e7250';
  if (Math.hypot((dx + 0.4) / 3, dy / 1.5, (tt - 4) / 1.7) < 1) return tt < 3.2 ? '#9aa880' : hide();
  // the neck rises forward and up to a small head; the tail sweeps back and down
  var nx = 2.2 + (tt - 4.5) * 0.42; if (tt > 4.5 && tt < 10.2 && Math.abs(dy) < 0.5 && Math.abs(dx - nx) < 0.62 - (tt - 4.5) * 0.04) return hide();
  if (Math.hypot((dx - 5) / 0.95, dy / 0.5, (tt - 10.3) / 0.5) < 1) return (Math.abs(Math.abs(dy) - 0.3) < 0.1 && Math.abs(tt - 10.45) < 0.1 && dx > 5.1) ? '#1a1a10' : hide();
  var tx = -3.2 - (tt < 4.4 ? (4.4 - tt) * 1.1 : 0); if (dx < -3 && dx > -6.5 && Math.abs(dy) < 0.42 - (-3 - dx) * 0.06 && Math.abs(dx - tx) < 0.7 && tt > 0.4 && tt < 4.6) return hide();
  return null; }, 0.25); };
BUILD.dinoskel = function(B, t, i){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var bone = tt < 0.3 ? '#cbbf96' : '#f4ead2';
  if (tt < 0.14) return Math.hypot(dx / 5, dy / 2) < 1 ? '#8a6a44' : null;
  var sy = Math.sin(dx * 0.5) * 0.3; if (Math.abs(dy - sy) < 0.2 && Math.abs(dx) < 4.2 && Math.abs(tt - (1.6 - Math.abs(dx) * 0.25)) < 0.2) return bone;
  for (var k = -2; k <= 2; k++){ var rx = k * 0.75 + 0.4; if (Math.abs(dx - rx) < 0.14){ var rr = Math.hypot(dy - sy, tt - 0.2); if (Math.abs(rr - 1.25) < 0.16 && tt < 1.6) return bone; } }
  if (Math.hypot((dx - 4.6) / 0.8, (dy - sy) / 0.45, (tt - 1) / 0.5) < 1) return Math.abs(tt - 1.05) < 0.08 && dx > 4.8 ? '#5a4a30' : bone;
  return null; }, 0.125); };
BUILD.nest = function(B, t, i){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var r = Math.hypot(dx, dy);
  if (r > 2.2 && r < 2.9 && tt < 1.1 - (r - 2.55) * (r - 2.55) * 3) return hash(Math.floor(dx * 6), Math.floor(dy * 6) + Math.floor(tt * 6) * 7, 4 + i) < 0.5 ? '#8a6a3a' : '#6a4a26';
  if (r < 2.3 && tt < 0.3) return '#a8875a';
  var eggs = [[-0.8, -0.3], [0.7, -0.5], [0, 0.8]]; for (var e = 0; e < 3; e++){ var ex = dx - eggs[e][0], ey = dy - eggs[e][1]; if (Math.hypot(ex / 0.62, ey / 0.62, (tt - 0.95) / 0.85) < 1) return Math.sin(ex * 31 + tt * 17) * Math.sin(ey * 23 - tt * 13) > 0.6 ? '#6a7a3a' : (ex < -0.2 ? '#fbf4dc' : '#ece2c0'); }
  return null; }, 0.125); };
// ---- the secret entrances that are not a landmark already: a ship tied up beside the path, its gangplank, and a doorway
function at(B, ox, oy){ var B2 = Object.create(B); B2.gz = function(x, y){ return B.gz(x + ox, y + oy); };
  B2.solid = function(x0, y0, z0, x1, y1, z1, fn, sv){ return B.solid(x0 + ox, y0 + oy, z0, x1 + ox, y1 + oy, z1, function(px, py, pz){ return fn(px - ox, py - oy, pz); }, sv); }; return B2; }
BUILD.mooredship = function(B, t){ shipFn(1)(at(B, t.x, t.y)); };
BUILD.gangplank = function(B, t){ box(B, t.x, t.y, 3.4, 1.2, 1.6, function(dx, dy, tt){ var u = (dx * t.face + 1.7) / 3.4; if (Math.abs(dy) > 0.5 || u < 0 || u > 1) return null;
  var top = 0.2 + u * 1.2; if (tt > top || tt < top - 0.18) return null; return (Math.floor(u * 9) % 2) ? '#8a6a44' : '#7a5a34'; }, 0.125); };
BUILD.secretdoor = function(B, t, i){ var K = kitOf(t.th), hi = K.wall[0], lo = K.wall[1];
  box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var d = Math.hypot(dx / (t.w / 2), dy / (t.d / 2), tt / t.h) + (vn(dx * 0.8, tt * 0.8, i + 3) - 0.5) * 0.14; if (d > 1) return null;
    var door = dy > 0 && Math.abs(dx) < 1.1 && tt < 2.4 * (1 - Math.pow(dx / 1.1, 2) * 0.35); if (door) return d > 0.82 ? null : '#120e0c';
    if (dy > 0 && Math.abs(dx) < 1.5 && tt < 2.9 && d > 0.8) return lo;
    return ((tt * 1.3 + dx * 0.4) | 0) % 2 ? hi : lo; }, 0.25); };
// ---- Candy Works: the factory with two striped chimneys, a giant gumball machine, an arch of candy canes
BUILD.factory = function(B, t){ gable(B, t.x, t.y, t.w - 1, t.d - 1, 7, 3.4, function(dx, dy, tt){ return tt > 6.4 ? '#ffffff' : ((tt * 1.6 | 0) % 2 ? '#ff8ab8' : '#ff9cc4'); }, function(dx){ return (Math.floor(dx * 1.4 + 20) % 2) ? '#7a4422' : '#6a3a1c'; }, '#7a4422');
  [-2.6, 2.6].forEach(function(cx){ box(B, t.x + cx, t.y - 1, 1.4, 1.4, 13, function(dx, dy, tt){ if (tt < 8 || Math.hypot(dx, dy) > 0.6) return null; return (Math.floor(tt * 1.4) % 2) ? '#e8233f' : '#fff6f0'; }, 0.125); }); };
BUILD.gumballs = function(B, t){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var r = Math.hypot(dx, dy);
  if (tt < 2.2) return r < 1.4 ? (tt > 1.9 ? '#ffd23f' : '#e8233f') : null; if (tt > 6.2) return r < 0.5 && tt < 6.6 ? '#e8233f' : null;
  var g = Math.hypot(dx, dy, tt - 4.2); if (g > 2.05) return null; if (g > 1.95) return '#e8f8ff';
  var k = hash(Math.floor((dx + 3) * 1.6), Math.floor(tt * 1.6) + Math.floor((dy + 3) * 1.6) * 7, 31); return ['#ff3b7a', '#ffd23f', '#3fbf9a', '#8a5cff', '#ff8a1f', '#ffffff'][Math.floor(k * 6)]; }, 0.125); };
BUILD.canes = function(B, t){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ if (Math.abs(dy) > 0.3 || tt < 0) return null;
  for (var s = -1; s <= 1; s += 2){ var cx = s * 1.6, d;
    if (tt < 3.6) d = Math.abs(dx - s * 3.2); else { if (s * (dx - cx) < -0.1 && tt < 3.6) return null; d = Math.abs(Math.hypot(dx - cx, tt - 3.6) - 1.6); if (s * (dx - cx) < 0 && tt < 3.6) d = 9; }
    if (d < 0.26 && tt < 5.4) return (Math.floor((tt + dx * s) * 2.2) % 2) ? '#e8233f' : '#fff6f0'; }
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
  dino:{ fly:['ptero', 3], mote:[['firefly', 16], ['leaf', 8]] },
  sky:{ fly:['gull', 3], balloons:3 },
  neon:{ fly:['drone', 3], mote:['spark', 40] },
  haunted:{ fly:['bat', 5], ghosts:2, mote:['firefly', 8] },
  harvest:{ fly:['crow', 3], mote:['leaf', 16] },
  school:{ fly:['song', 4], mote:[['leaf', 10], ['butter', 6]] },
  iceage:{ mote:['snow', 60], fly:['crow', 2] },
  moon:{ fly:['drone', 2], mote:['spark', 30] },
  candy:{ fly:['song', 3], mote:[['petal', 14], ['spark', 10]] }
};
// two frames a flyer: wings up, wings down. o body, w wing, h head or beak, l light
var PIX_FLY = {
  bird:[['w.....w', '.w...w.', '..wow..', '...h...'], ['..wow..', '.w.h.w.', 'w.....w']],
  bat:[['w.....w', 'ww...ww', '.wwoww.', '..h.h..'], ['..wow..', '.wwoww.', 'w.h.h.w']],
  ptero:[['w.......w', 'ww.....ww', '.wwwoww..', '...hhh...'], ['...wow...', '.wwwoww..', 'ww..hhh.w']],
  drone:[['l.....l', 'ooooooo', '..ooo..', '...h...'], ['h.....h', 'ooooooo', '..ooo..', '...l...']]
};
var FLY_PAL = {
  song:{ base:'bird', w:'#6a4a2e', o:'#8a6a44', h:'#e8a03a', sz:0.8, z:[6, 10], v:[6, 9] },
  parrot:{ base:'bird', w:'#e5483a', o:'#2bb04a', h:'#ffd23a', sz:1, z:[8, 13], v:[6, 8] },
  gull:{ base:'bird', w:'#f4f6fb', o:'#d8dde6', h:'#f2a03a', sz:1.1, z:[9, 15], v:[5, 8] },
  vulture:{ base:'bird', w:'#2a2228', o:'#3a3036', h:'#d89a7a', sz:1.3, z:[13, 17], v:[4, 5], circle:true },
  crow:{ base:'bird', w:'#1a1820', o:'#24222a', h:'#d8a02a', sz:1, z:[7, 12], v:[6, 8] },
  bat:{ base:'bat', w:'#2a2230', o:'#3a2e44', h:'#ff4a3a', sz:0.9, z:[4, 9], v:[5, 9], flit:true },
  ptero:{ base:'ptero', w:'#a0522d', o:'#7a3e22', h:'#e8a03a', sz:1.5, z:[12, 17], v:[4, 6], circle:true },
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
  return H3.slices(sceneC(P), { elev:ELEV, art:artOf(P), fine:!!P.spec.fine, tcell:TART, fx:P.fx, scene:{ b:P.b, land:land(P), zMax:20, clearAt:function(x, y){ return P.walkD(x, y) - PW - 0.5; } } }); }
/* one dynamic thing (a chest, a crate, a gate leaf) rendered on its own, lit and outlined like the scene */
var PROPS = {};
// a fine walk (putt.js, FINE_WORLDS) is painted twice as finely, and its props with it, so nothing on it is coarser than the rest
function artOf(P){ return P.spec.fine ? TART / 2 : TART; }
function propSprite(key, P, buildFn, w, d, h){ if (P.spec.fine) key += '|fine'; if (PROPS[key] !== undefined) return PROPS[key]; var H3 = window.RTT_PUTT_3D; if (!H3) return null;
  var b = [-w / 2 - 1, -d / 2 - 1, w / 2 + 1, d / 2 + 1], land0 = { build:function(B){ buildFn(B); }, mats:{}, h:function(){ return 0; }, mat:function(){ return ['g']; } };
  try{ var r = H3.render(sceneC(P), { elev:ELEV, art:artOf(P), fine:!!P.spec.fine, tcell:TART, scene:{ b:b, land:land0, zMax:h + 1, noGround:true } }); var o = r.pr(0, 0, 0); PROPS[key] = { cv:r.cv, ax:o[0], ay:o[1] }; }catch(e){ PROPS[key] = null; }
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
function gateFn(open, P){ var kx = kitOf(P.spec.kitAs || P.spec.theme), c1 = kx.wall[0], c2 = kx.wall[1];
  return function(B){ box(B, 0, 0, PW * 2 + 1, 1.2, 6.8, function(dx, dy, tt){ if (Math.abs(dy) > 0.25) return null; var half = PW + 0.4;
    if (open){ var leaf = Math.abs(Math.abs(dx) - half) < 0.25 && tt < 6.4; return leaf ? c2 : null; }
    if (Math.abs(dx) > half || tt > 6.4) return null; if (Math.abs(dx) < 0.1) return c2; return (Math.floor(dx / 0.55) % 2 && tt < 6.1 && tt > 0.3) ? '#3a2a1a' : c1; }, 0.125); }; }
// a puzzle's light: a stone or iron stand with a bowl on top, in the world's wall colours; the flame is drawn by run()
function brazierFn(th){ var kx = kitOf(th), c1 = (kx.wall || ['#c8b890'])[0], c2 = (kx.wall || [0, '#8a7a5a'])[1] || '#8a7a5a';
  return function(B){ box(B, 0, 0, 1.4, 1.4, 1.9, function(dx, dy, tt){ var r = Math.hypot(dx, dy);
    if (tt < 1.2) return r < 0.26 ? (tt < 0.16 || tt > 1.06 ? c2 : c1) : (tt < 0.2 && r < 0.55 ? c2 : null);
    if (tt < 1.62){ var rr = 0.3 + (tt - 1.2) * 1.05; if (r > rr) return null; if (tt > 1.48 && r < rr - 0.14) return '#2a1a10'; return ((Math.atan2(dy, dx) * 4 + 10) | 0) % 2 ? c2 : '#4a3a2c'; }
    return null; }, 0.125); }; }
/* THE LOCKED GATE IS PART OF ITS FENCE: the fence's own posts and rails (neon in the arcade, wood elsewhere), as
   tall as the fence and as wide as its gap, lying along it, with a gold lock plate in the middle. Open, its two
   leaves stand swung in toward the chest. g is fenceGap's answer. */
function fenceGateFn(open, g, pal){ var hw = g.w / 2, cs = Math.cos(g.ta), sn = Math.sin(g.ta), S = 3 * hw + 1.2;
  return function(B){ box(B, 0, 0, S, S, 3.2, function(dx, dy, tt){ var u = dx * cs + dy * sn, v = -dx * sn + dy * cs;
    if (Math.abs(Math.abs(u) - hw) < 0.2 && Math.abs(v) < 0.2 && tt < 2.95) return tt > 2.75 ? pal.rail : pal.post;   // a gate post at each end, capped
    var leaf = function(along, off){ if (tt > 2.45 || tt < 0.18) return null; if (Math.abs(tt - 1.0) < 0.13 || Math.abs(tt - 2.15) < 0.13) return pal.rail;
      return (Math.floor(along / 0.42) % 2 === 0) && Math.abs(off) < 0.09 ? pal.post : null; };
    if (!open){ if (Math.abs(v) > 0.12 || Math.abs(u) > hw - 0.18) return null;
      if (Math.abs(u) < 0.34 && Math.abs(tt - 1.55) < 0.32) return Math.abs(u) < 0.07 && Math.abs(tt - 1.5) < 0.13 ? '#3a2a14' : '#ffd23a';
      return leaf(u + hw, v); }
    for (var sd = -1; sd <= 1; sd += 2){ var uu = u - sd * (hw - 0.3); if (Math.abs(uu) < 0.12 && v > 0.15 && v < hw - 0.25) return leaf(v, uu); }
    return null; }, 0.125); }; }

/* -------------------------------------------------------------------------------- the walk */
/* A SMOOTHED WALK (spec.smooth): a walk is too big a scene to paint more finely in the time a player waits, so a fine world's
   walk is painted as before and then doubled with Scale2x, which turns each pixel into four and follows the diagonals, so
   edges stop stepping. The depth buffer is doubled with it (nearest), so what stands in front still hides the golfer. */
var UP2 = typeof WeakMap === 'function' ? new WeakMap() : null;
function up2(pic){ if (!pic || !pic.cv) return pic; var hit = UP2 && UP2.get(pic); if (hit) return hit;
  var w = pic.cv.width, h = pic.cv.height, src = pic.cv.getContext('2d').getImageData(0, 0, w, h), S32 = new Uint32Array(src.data.buffer);
  var cv = document.createElement('canvas'); cv.width = w * 2; cv.height = h * 2; var cx = cv.getContext('2d'), out = cx.createImageData(w * 2, h * 2), O = new Uint32Array(out.data.buffer), W2 = w * 2;
  for (var y = 0; y < h; y++) for (var x = 0; x < w; x++){ var p = S32[y * w + x], a = y ? S32[(y - 1) * w + x] : p, b = x < w - 1 ? S32[y * w + x + 1] : p, c = x ? S32[y * w + x - 1] : p, d = y < h - 1 ? S32[(y + 1) * w + x] : p;
    var o = (y * 2) * W2 + x * 2;
    O[o] = (c === a && c !== d && a !== b) ? a : p; O[o + 1] = (a === b && a !== c && b !== d) ? b : p;
    O[o + W2] = (d === c && d !== b && c !== a) ? c : p; O[o + W2 + 1] = (b === d && b !== a && d !== c) ? d : p; }
  cx.putImageData(out, 0, 0);
  var r = {}; for (var q in pic) r[q] = pic[q]; r.cv = cv; r.ART = (pic.ART || window.RTT_PUTT.ART) / 2;
  r.pr = function(x, y, z){ var v = pic.pr(x, y, z); return [v[0] * 2, v[1] * 2]; };
  if (pic.un) r.un = function(px, py, z){ return pic.un(px / 2, py / 2, z); };
  if (pic.Z && pic.ZW){ var ZW = pic.ZW, ZH = Math.floor(pic.Z.length / ZW), Z2 = new Float32Array(ZW * 2 * ZH * 2);
    for (var j = 0; j < ZH * 2; j++){ var sr = (j >> 1) * ZW, dr = j * ZW * 2; for (var i = 0; i < ZW * 2; i++) Z2[dr + i] = pic.Z[sr + (i >> 1)]; }
    r.Z = Z2; r.ZW = ZW * 2; r.zy0 = (pic.zy0 || 0) * 2; }
  if (UP2) UP2.set(pic, r); return r; }
function run(box, P, pic, api){
  if (P.spec.smooth) pic = up2(pic);
  var cv = document.createElement('canvas'); cv.className = 'pp-tcv'; box.appendChild(cv);
  var ctx = cv.getContext('2d'), alive = true, dpr = Math.min(2, window.devicePixelRatio || 1), W = 0, H = 0, kk = 1, ox = 0, oy = 0, ART = pic.ART || window.RTT_PUTT.ART;
  var found = api.found || {}, coinsGot = 0, pick = api.pick, sp = P.spec;
  // about 1.6 million pixels at most (putt.js capDpr): a computer screen at 2x was 4.3 million to fill every frame
  function size(){ var r = box.getBoundingClientRect(); dpr = Math.min(2, window.devicePixelRatio || 1); if (r.width * r.height * dpr * dpr > 1.6e6) dpr = Math.max(1, Math.sqrt(1.6e6 / Math.max(1, r.width * r.height))); W = cv.width = Math.max(1, Math.round(r.width * dpr)); H = cv.height = Math.max(1, Math.round(r.height * dpr)); cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
    var viewArt = VIEW_FT * SE / ART; kk = Math.max(1, Math.round(H / viewArt)); while (pic.cv.width * kk < W && kk < 40) kk++; kkBase = kk; gFree = null; }
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
  P.items.forEach(function(t){ var o = Object.assign({}, t); o.done = t.k === 'chest' ? chOpen(t) || legacyK(t) : t.k === 'golden' ? !!found.g : t.k === 'key' ? !!found.key : t.k === 'life' ? !!found.life : t.k === 'trinket' ? !!found.tk : t.k === 'part' ? !!found.pt : t.k === 'prize' ? !!found.pz : t.k === 'vault' ? !!(api.gymSolved && api.gymSolved(t.gym)) : false; items.push(o);
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
  /* THE GYM, if this trail has one (gyms.js is the registry, the gym's kind file its rules, plan() put it here). Out on
     the trail it is a box he walks round; walked into at its gate, its KIND says how it is played (a tile a step, a
     tap on a tile, or the kind's own input) and draws its pieces (view()), and this frame owns the rest: the room, the
     camera, the docked panel and its controls, undo, the civilian and the vault. A move's pieces animate phase by
     phase (a push and his step together, then whatever the belts carry). A gym solved before shows as it was left
     solved: the moves of its proof replayed, the barrels down in their holes, the vault open. */
  var GY = P.gym, GL = GY ? window.RTT_PUTT_GYMS : null, GK = GY ? GY.K : null, gym = null, gView = null;
  if (GY && GL){ var GD0 = GL.byId(GY.id), vIt = items.filter(function(t){ return t.k === 'vault'; })[0];
    gym = { G:GD0, Q:GY.Q, inp:GL.input(GD0), s:GL.init(GD0), in:false, anim:null, resets:0, undos:0, n:0, hist:[], solved:!!(vIt && vIt.done), leverAt:-9, vault:vIt, stuck:false, told:{}, hold:null, lastDir:-1, marks:true };
    if (gym.solved) gym.s = gymSolvedState(); }
  function gymSolvedState(){ var G = gym.G, s = GL.init(G), pf = GL.proof(G); for (var q0 = 0; q0 < pf.length; q0++){ var r0 = GL.act(G, s, pf[q0]); if (r0.ev === 'open') break; s = r0.s; }
    return GL.me(G, s) == null ? s : GL.place(G, s, GY.Q.start); }
  function gT(i){ var Q = GY.Q, c = i % Q.W, r = (i / Q.W) | 0; return [GY.x0 + (c + 0.5) * GY.T, GY.y0 + (r + 0.5) * GY.T]; }
  // the tile of the room at a point on the ground, or -1
  function gymTile(x, y){ var Q = GY.Q, c = Math.floor((x - GY.x0) / GY.T), r = Math.floor((y - GY.y0) / GY.T); return c < 0 || r < 0 || c >= Q.W || r >= Q.H ? -1 : r * Q.W + c; }
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
    for (var j = 0; j < items.length; j++){ var t = items[j]; if ((t.k === 'chest' || t.k === 'npc' || t.k === 'civ') && Math.hypot(x - t.x, y - t.y) < (t.k === 'chest' ? 1.3 : 1.0) + R) return true;
      if (t.k === 'fire' && Math.hypot(x - t.x, y - t.y) < 0.6 + R) return true; if (t.k === 'prize' && prizeShown() && Math.hypot(x - t.x, y - t.y) < 1.3 + R) return true; }
    if (P.pen){ var PN = P.pen, dp = Math.hypot(x - PN.x, y - PN.y); if (Math.abs(dp - PN.r) < R + 0.15){ var ap = Math.atan2(y - PN.y, x - PN.x), dap = Math.abs(Math.atan2(Math.sin(ap - PN.a), Math.cos(ap - PN.a))); if (!(dap < PN.half && pzGateOpen())) return true; } }
    if (PZ && PZ.crate && Math.abs(x - PZ.crate.x) < CRATE_H + R && Math.abs(y - PZ.crate.y) < CRATE_H + R) return true;
    return false; }
  // the screen: art pixel to device pixel, through the picture's own projection
  function scr(x, y, z){ var p = pic.pr(x, y, z == null ? pic.zAt(x, y) : z); return [ox + p[0] * kk, oy + p[1] * kk]; }
  // on a shore trail the camera looks a little out to sea, where the ships are, rather than inland at more sand
  function camAim(snap){ var lx = g.x + (P.sea && LIFE[sp.theme] && LIFE[sp.theme].ships ? P.sea.side * 4.5 : 0), ly = g.y, fy = 0.64;
    // in a gym the camera holds the whole room still in the board, clear of the panel (gymCam), rather than riding on him
    if (gym && gym.in) return gymCam(snap);
    var p = pic.pr(lx, ly, pic.zAt(lx, ly)), tx = Math.round(W / 2 - p[0] * kk), ty = Math.round(H * fy - p[1] * kk), iw = pic.cv.width * kk, ih = pic.cv.height * kk;
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
  // a fence's gate, built to its gap in its own colours; the thing that drew the fence names the world it is in
  function fenceGate(F, kind, open){ var t = P.things.filter(function(x){ return x.k === kind; })[0], th = (t && t.th) || sp.theme, g = fenceGap(F), pal = fencePal(th), S = 3 * g.w / 2 + 1.2;
    var key = 'fgate:' + (open ? 1 : 0) + ':' + pal.post + ':' + g.w.toFixed(2) + ':' + Math.round(g.ta * 100), sp0 = prop(key, fenceGateFn(open, g, pal), S, S, 3.2);
    // a smoothed walk doubles its land (up2), so the gate is doubled the same way, or it stands at half the fence's size
    if (sp0 && P.spec.smooth){ var k2 = key + '|x2'; if (!PROPS[k2]){ var u = up2({ cv:sp0.cv, pr:function(){ return [0, 0]; } }); PROPS[k2] = { cv:u.cv, ax:sp0.ax * 2, ay:sp0.ay * 2 }; } sp0 = PROPS[k2]; }
    return sp0 ? { s:sp0, x:g.x, y:g.y } : null; }
  var SPR = {
    chest:[0, 0.22, 0.5, 0.78, 1].map(function(l){ return prop('chestv4:' + l, chestFn(l), 4.4, 6.4, 5.4); }),
    gate0:P.gate ? prop('gate0:' + sp.theme, gateFn(false, P), PW * 2 + 1, 1.2, 7) : null, gate1:P.gate ? prop('gate1:' + sp.theme, gateFn(true, P), PW * 2 + 1, 1.2, 7) : null,
    fence0:P.fence ? fenceGate(P.fence, 'fence', false) : null, fence1:P.fence ? fenceGate(P.fence, 'fence', true) : null,
    pen0:P.pen && P.pen.gated ? fenceGate(P.pen, 'pen', false) : null, pen1:P.pen && P.pen.gated ? fenceGate(P.pen, 'pen', true) : null,
    crate:P.puzzle && P.puzzle.crate ? prop('pzcrate', function(B){ BRK.crate(B, 0, 0); }, 1.8, 1.8, 2) : null
  };
  /* the gym's pieces at the land's own size: a smoothed walk doubles its land (up2), so they are doubled the same way,
     or a barrel stands at half the size of the hole it is meant to fill */
  function big(key, sp0){ if (!sp0 || !P.spec.smooth) return sp0; var k2 = key + '|x2'; if (!PROPS[k2]){ var u = up2({ cv:sp0.cv, pr:function(){ return [0, 0]; } }); PROPS[k2] = { cv:u.cv, ax:sp0.ax * 2, ay:sp0.ay * 2 }; } return PROPS[k2]; }
  if (gym){ SPR.lever = [0, 1].map(function(o){ return big('gymlever' + o, prop('gymlever' + o, gymLeverFn(o), 4, 1.6, 3.4)); });
    SPR.vault = [0, 0.22, 0.5, 0.78, 1].map(function(l){ return big('vault:' + l, prop('vault:' + l, function(B){ chestFn(l)(scaleB(B, VAULT_K)); }, 4.4 * VAULT_K, 6.4 * VAULT_K, 5.4 * VAULT_K)); }); }
  /* THE ROOM, as the gym's kind draws in it (gyms.js KINDS README, view(R)): where its tiles are, the trail's own
     drawing calls, and a way to hand the frame a move the kind worked out itself (the trick shot's ball at rest). */
  if (gym){ gView = GK.view({ G:gym.G, Q:GY.Q, T:GY.T, DECK:GYM_DECK, x0:GY.x0, y0:GY.y0, at:gT, tile:gymTile, scr:scr, ctx:ctx, kk:function(){ return kk; }, get reduce(){ return reduce; },
      sprite:function(key, fn, w, d, h){ return big(key, prop(key, fn, w, d, h)); }, drawSprite:drawSprite, BRK:BRK, burst:function(x, y, z, cols, n, sz, pow){ burst(x, y, z, cols, n, sz, pow); },
      sfx:function(n){ if (api.sfx) api.sfx(n); }, say:function(t, ms){ say(t, ms); }, ground:groundAt, busy:function(){ return gymBusy(); },
      commit:function(s1, ev, mv){ gymApply({ s:s1, ev:ev || 'move', moves:mv || [] }, performance.now() / 1000); } });
    gView.lay(gym.s); }
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
    ctx.save(); ctx.imageSmoothingEnabled = false; if (who === 'me') meGlow(k2); ctx.drawImage(im, rx, ry, rw, rh); ctx.restore();
    if (!(who === 'me' && calmFloor(x, y))) occlude(rx, ry, rw, rh, x, y, pic.zAt(x, y), see); return [rx, ry, rw, rh]; }
  /* IN A CALM ROOM (a kind with calm:true) only a wall can stand in front of him: the near wall, or an inner wall one row
     nearer (push's rooms). Anywhere else the floor in front is flat, and painting it back over him would paint it over
     the kind's tiles too. */
  function calmFloor(x, y){ if (!gym || !gym.in || !GK.calm) return false; var Q = GY.Q, i = gymTile(x, y); if (i < 0) return false; var r = (i / Q.W) | 0, c = i % Q.W;
    if (r >= Q.H - 2) return false; for (var dc = -1; dc <= 1; dc++){ var c2 = c + dc; if (c2 >= 0 && c2 < Q.W && Q.cell[(r + 1) * Q.W + c2] === '#') return false; } return true; }
  // your aura walks with you: the course golfer's pulse (hvswGlow, 2.4 s) in its colour, k pixels to a figure pixel
  function meGlow(k){ var a = null; try{ a = api.host.aura && api.host.aura(); }catch(e){} if (!a) return;
    var still = false; try{ still = matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){}
    var u = still ? 0.5 : 0.5 - 0.5 * Math.cos(performance.now() / 1000 / 2.4 * 2 * Math.PI);
    ctx.shadowColor = a; ctx.shadowBlur = Math.max(2, (1 + 3 * u) * k); ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; }
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
    /* a loot's beam stands up the screen from it; one in front of a gym's room is cut short at the room's near edge, so
       no beam ever crosses a room (the golden ball's did) */
    var bh0 = Math.round(H * 0.45); if (bc && GY){ var GA = gymArtRect(), gx0 = GA.x0 * kk + ox, gx1 = GA.x1 * kk + ox, gy0 = GA.y0 * kk + oy, gy1 = GA.y1 * kk + oy;
      if (shp[0] + 4.5 * s > gx0 && shp[0] - 4.5 * s < gx1 && shp[1] > gy0) bh0 = Math.max(0, Math.min(bh0, Math.round(shp[1] - gy1))); }
    if (bc && bh0 > 0){ var bw = 9 * s, bh = bh0, gr = ctx.createLinearGradient(0, shp[1] - bh, 0, shp[1]);
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
    if (Pz.k === 'dig'){ ctx.fillStyle = dark ? 'rgba(255,240,210,.5)' : 'rgba(45,26,8,.6)';
      // a boot print: a sole and a heel, along the way the tracks go
      Pz.steps.forEach(function(q){ var p = scr(q[0], q[1]), a = q[2], h = scr(q[0] - Math.cos(a) * 0.36, q[1] - Math.sin(a) * 0.36); ctx.beginPath(); ctx.ellipse(p[0], p[1], 2.2 * kk, 1.15 * kk, 0, 0, 7); ctx.fill(); ctx.beginPath(); ctx.ellipse(h[0], h[1], 1.4 * kk, 0.8 * kk, 0, 0, 7); ctx.fill(); });
      var sp0 = scr(Pz.spot[0], Pz.spot[1]), w = 4 * kk;
      if (PZ.shown){ ctx.fillStyle = 'rgba(30,18,6,.7)'; ctx.beginPath(); ctx.ellipse(sp0[0], sp0[1], w * 1.4, w * 0.6, 0, 0, 7); ctx.fill(); }
      else { ctx.strokeStyle = dark ? 'rgba(255,230,180,.6)' : 'rgba(90,40,10,.7)'; ctx.lineWidth = Math.max(2, kk * 0.9); ctx.beginPath(); ctx.moveTo(sp0[0] - w, sp0[1] - w * 0.45); ctx.lineTo(sp0[0] + w, sp0[1] + w * 0.45); ctx.moveTo(sp0[0] + w, sp0[1] - w * 0.45); ctx.lineTo(sp0[0] - w, sp0[1] + w * 0.45); ctx.stroke(); } }
    if (Pz.k === 'plate'){ var pl = Pz.plate, on = pzGateOpen() && !PZ.solved, h = 0.8, c = [[pl.x - h, pl.y - h], [pl.x + h, pl.y - h], [pl.x + h, pl.y + h], [pl.x - h, pl.y + h]].map(function(q){ return scr(q[0], q[1]); });
      ctx.fillStyle = on ? '#ffd23a' : '#8a8478'; ctx.strokeStyle = on ? '#fff3a8' : '#4a463e'; ctx.lineWidth = Math.max(2, kk * 0.6); ctx.beginPath(); ctx.moveTo(c[0][0], c[0][1]); for (var i = 1; i < 4; i++) ctx.lineTo(c[i][0], c[i][1]); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (on){ ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,210,70,' + (0.18 + 0.12 * Math.sin(now * 10)).toFixed(2) + ')'; var pc = scr(pl.x, pl.y); ctx.beginPath(); ctx.ellipse(pc[0], pc[1], 8 * kk, 3.4 * kk, 0, 0, 7); ctx.fill(); ctx.restore(); } } }
  function drawChest(t, now, frs){ var z = pic.zAt(t.x, t.y), fr = frs || SPR.chest, e = t.openAt != null ? now - t.openAt : (t.done ? 99 : -1), k, ox2 = 0, sy = 1, shp = scr(t.x, t.y), ks = frs ? VAULT_K : 1;
    if (!fr) return;
    if (e < 0){ k = 0; var pu = 0.5 + 0.5 * Math.sin(now * 2.4 + t.x);   // shut: a warm pool of light and a glint now and then
      // in a calm room (a kind with calm:true) the vault's pool stays on its own tile, so it never washes out the tiles round it
      var prx = 13 * kk * ks, pry = 5 * kk * ks; if (frs && gym && GK.calm){ prx = Math.abs(scr(t.x + GY.T * 0.5, t.y)[0] - shp[0]); pry = prx * 0.4; }
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,200,70,' + (0.16 + 0.12 * pu).toFixed(2) + ')'; ctx.beginPath(); ctx.ellipse(shp[0], shp[1], prx, pry, 0, 0, 7); ctx.fill(); ctx.restore(); }
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
    // (in a calm room nothing stands in front of the vault, and the floor in front of it, which is where the kind draws
    // its tiles, is not to be painted back over them)
    ctx.drawImage(sp2.cv, rx, ry, w, h2); if (!(frs && gym && GK.calm)) occlude(rx, ry, w, h2, t.x, t.y, z, e < 0);
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
  var lifeTh = api.clouds && sp.theme0 ? sp.theme0 : sp.theme, life = (lifeTh === sp.theme && sp.kitAs && LIFE_AS[sp.kitAs]) || LIFE[lifeTh] || {}; if (lifeTh !== sp.theme){ life = Object.assign({}, life); delete life.ships; }
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
  /* A CALM ROOM (a kind with calm:true, gyms.js KINDS README; every kind on the page asks for it): while he is in its
     gym, nothing of the world's life is drawn over the room as it stands on the screen. Not what flies, drifts or floats
     (birds, balloons, puffs, motes), and not what roams the ground or sails past (tumbleweeds, ghosts, ships), so
     nothing ever sits on a tile. pad is how far round its point the thing reaches, in trail feet, and never less than
     a bird's width (8 art pixels) round the room's box. A flyer is tested at its body and at its shadow. Out on the trail, and
     in a kind without it, the world's life is as it was. One test for all of it, here. */
  function calmHides(x, y, z, pad){ if (!gym || !gym.in || !GK.calm) return false; var A = gymArtRect(), p = scr(x, y, z), e = Math.max(8 * kk, (pad || 1) * kk * CE / ART);
    return p[0] > A.x0 * kk + ox - e && p[0] < A.x1 * kk + ox + e && p[1] > A.y0 * kk + oy - e && p[1] < A.y1 * kk + oy + e; }
  // what stands on the ground or the sea is sorted in with everything else; what flies is drawn over it all
  function lifeGround(ds){ ships.forEach(function(s1, i){ var yS = shipY(s1), xS = shipX(yS); if (!calmHides(xS, yS, 4, 7)) ds.push({ k:'ship', o:s1, x:xS, y:yS }); });
    tumbles.forEach(function(t){ if (!calmHides(t.x, t.y, pic.zAt(t.x, t.y) + 1.2, 2)) ds.push({ k:'tumble', o:t, x:t.x, y:t.y }); }); ghosts.forEach(function(q){ if (!calmHides(q.x, q.y, pic.zAt(q.x, q.y) + 2, 2)) ds.push({ k:'ghost', o:q, x:q.x, y:q.y }); }); }
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
    puffs.forEach(function(q){ if (calmHides(q.x, q.y, q.z, q.r * 1.4)) return; var p = scr(q.x, q.y, q.z), a = 0.38 * (1 - q.t / 4.5); ctx.fillStyle = 'rgba(70,62,66,' + a.toFixed(3) + ')'; ctx.beginPath(); ctx.arc(p[0], p[1], q.r * kk * 1.4, 0, 7); ctx.fill(); });
    balloons.forEach(function(b2){ if (calmHides(b2.x, b2.y, b2.z + 8, 9) || calmHides(b2.x, b2.y, pic.zAt(b2.x, b2.y), 3)) return; var cs = BALLOON_COLS[b2.c], spr = prop('balloon:' + b2.c, balloonFn(cs[0], cs[1]), 6.4, 6.4, 16); shadowAt(b2.x, b2.y, 2.4, 0.1); drawSprite(spr, b2.x, b2.y, b2.z + Math.sin(tsec * 0.8 + b2.ph) * 0.6); });
    motes.forEach(function(m){ var k = m.k, z = m.z + (k === 'leaf' || k === 'petal' || k === 'ash' || k === 'snow' || k === 'ember' || k === 'spark' || k === 'dust' ? 0 : pic.zAt(m.x, m.y));
      if (calmHides(m.x, m.y, z, 1)) return;
      if (k === 'snow') sq(m.x, m.y, z, 0.3, '#ffffff', 0.95);
      else if (k === 'ash') sq(m.x, m.y, z, 0.3, '#9a9094', 0.8);
      else if (k === 'ember') sq(m.x, m.y, z, 0.32, m.life * 5 % 1 < 0.5 ? '#ffb43a' : '#ff5a1a', Math.max(0, 1 - m.z / 9));
      else if (k === 'spark') sq(m.x, m.y, z, 0.3, m.c, (Math.sin(m.life * 9 + m.ph) + 1) / 2);
      else if (k === 'leaf' || k === 'petal') sq(m.x, m.y, z, k === 'leaf' ? 0.38 : 0.28, m.c);
      else if (k === 'dust') sq(m.x, m.y, z, 0.22, '#f0d8b0', 0.7);
      else if (k === 'firefly'){ var gl = Math.max(0, Math.sin(m.life * 2.2 + m.ph)); if (gl > 0.05){ sq(m.x, m.y, z, 0.9, 'rgba(220,255,120,' + (gl * 0.35).toFixed(2) + ')'); sq(m.x, m.y, z, 0.3, '#f4ff9a', gl); } }
      else if (k === 'butter') pixAt(PIX_BUTTER[(Math.floor(m.life * 9 + m.ph) % 2)], { w:m.c, b:'#2a2228', o:m.c }, m.x, m.y, z, 0.24, false); });
    flyers.forEach(function(f){ if (calmHides(f.x, f.y, pic.zAt(f.x, f.y) + f.z, 2) || calmHides(f.x + 1, f.y + 1, pic.zAt(f.x, f.y), 2)) return; var C = FLY_PAL[f.kind], fr = PIX_FLY[C.base][Math.floor(tsec * (f.kind === 'vulture' || f.kind === 'ptero' ? 3 : 8) + (f.ph || 0)) % 2], gz = pic.zAt(f.x, f.y);
      shadowAt(f.x + 1, f.y + 1, 0.9 * C.sz, 0.1); pixAt(fr, C, f.x, f.y, gz + f.z, C.sz * 0.28, f.vx < 0); }); }

  // ---- input: a stick under the thumb, or the keys
  /* THE STICK IS FOR A TOUCH SCREEN ONLY, the owner's call. With a mouse and a keyboard he walks on the arrow keys
     or WASD, so a desktop gets no stick on screen and a drag does not walk him. */
  var coarse = false; try{ coarse = matchMedia('(pointer: coarse)').matches; }catch(e){}
  var ui = document.createElement('div'); ui.className = 'pp-tui'; ui.innerHTML = (coarse ? '<div class="pp-stick" data-stick><i></i></div>' : '') + '<div class="pp-way" data-way><i></i><b></b></div><div class="pp-pin" data-pin><b></b><i></i></div>' +
    '<div class="pp-thud"><span data-coins>' + (api.guestCoins ? 'Sign in' : '+0') + '</span><span data-gold></span></div><div class="pp-tlist" data-tlist></div><div class="pp-rbar"><button class="pp-rb pp-talkb" data-talk hidden></button><button class="pp-rb" data-skip></button></div><div class="pp-rhint" data-hint></div><div class="pp-bub" data-bub hidden></div>';
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
  function kd(e){ if (alive && gym && gym.in && !paused && gymKey(e)) return; var c = KM[e.code]; if (!c || !alive) return; keys[c] = 1; hint.classList.add('gone'); e.preventDefault(); }
  // in a gym: Z or Backspace undoes a move, R restarts; a kind that takes over input hears the rest first
  function gymKey(e){ if (e.ctrlKey || e.metaKey || e.altKey) return false;
    if (e.code === 'KeyZ' || e.code === 'Backspace'){ e.preventDefault(); if (!e.repeat) gymUndo(); return true; }
    if (e.code === 'KeyR'){ e.preventDefault(); if (!e.repeat && !gymBusy()) gymReset(performance.now() / 1000, GL.init(gym.G)); return true; }
    if (gym.inp === 'own' && gView.key && gView.key(e)){ e.preventDefault(); return true; }
    return false; }
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
  // the local's second thing to say: after the first has been read, and never over something else being said
  function npcLater(txt, wait, who){ setTimeout(function(){ if (alive && (!bubble || bubble.who === who || performance.now() > bubble.until)) say(txt, 5200, who); }, wait * 1000); }
  function sayLater(txt, ms, wait, who){ setTimeout(function(){ if (alive) say(txt, ms, who); }, (reduce ? 0.1 : wait) * 1000); }
  // in a gym every line goes in the docked panel, never over the board
  function say(txt, ms, who){ bubble = { txt:txt, until:performance.now() + (ms || 3200), who:who || null };
    if (gym && gym.in){ bubEl.hidden = true; gymLine(txt, who === civIt ? 0 : ms || 3200, who === civIt); return; }
    bubEl.textContent = txt; bubEl.hidden = false; }
  function burst(x, y, z, cols, n, sz, pow){ pow = pow || 1; for (var i = 0; i < n; i++){ var a = Math.random() * 6.28, sp2 = (2 + Math.random() * 4) * pow; parts.push({ x:x, y:y, z:z, vx:Math.cos(a) * sp2, vy:Math.sin(a) * sp2 * 0.6, vz:(3 + Math.random() * 4) * pow, c:cols[i % cols.length], t:0, sz:sz ? sz * (0.6 + Math.random() * 0.8) : 0 }); } }
  // a guest never sees a coin count: their coins are held for the account, and the walk says so once
  function hudCoins(){ ui.querySelector('[data-coins]').textContent = api.guestCoins ? 'Sign in' : '+' + coinsGot; }
  var guestTold = false;
  function guestCoin(){ if (api.guestCoins && !guestTold){ guestTold = true; say(api.guestCoins, 3600); } }
  /* WHAT IS ON THIS TRAIL, said up front: a list of every find with its picture, ticked off as it is picked up,
     so a player always knows what they are looking for. Coins are not on it: they come out of the chest. */
  function hudList(){ var el = ui.querySelector('[data-tlist]'), fs = items.filter(function(t){ return LOOT[t.k]; });
    el.innerHTML = fs.length ? '<b>On this trail</b>' + fs.map(function(t){ var nm = t.k === 'trinket' ? t.name || 'Trinket' : t.k === 'part' ? (t.name || 'Putter part') : LOOT[t.k].name;
      if (t.k === 'chest' && t.drops) nm = 'Chest'; if (t.k === 'prize') nm = (P.puzzle && P.puzzle.name) || 'Puzzle'; if (t.k === 'vault') nm = (gym && gym.G.name) || 'Gym'; return '<span data-id="' + t.id + '" class="' + (t.done ? 'got' : '') + (t.hint ? ' near' : '') + '"><img alt="" src="' + lootIcon(t) + '">' + nm.replace(/[<>&]/g, '') + '</span>'; }).join('') : ''; }
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
  /* ---- THE GYM, PLAYED: THE FRAME. Every kind is played through the same room and the same docked panel. One move is
     one step, one tap or one of the kind's own moves; its moves play as phases (whatever he pushes moves with him,
     then whatever the belts carry, a tile at a time), and nothing more is asked of the input until they have played.
     Held, the stick, a key or the pad keeps stepping; a tap on the floor steps toward it (a tap kind: acts on the tile).

     NOTHING COVERS THE BOARD, the owner's call (2026-10-17, a phone screenshot of The Cargo Hold with the civilian's
     bubble over the grid: "text should not be covering the game like this"). In the room, the civilian's lines and
     the frame's own messages go in the docked panel, under the gym's name and its goal; the controls (Undo, Restart,
     Leave and the pad) are in it too, with large tap targets; the stick and the trail's own buttons are hidden; and
     the camera frames the room in what the panel and the header leave free (gymCam), zooming out a step if it has to
     and in as far as it fits on a wide screen.
     On a phone the panel is docked along the bottom, on a wide screen down the right. */
  var DIR_FACE = [[0, -1], [1, 0], [0, 1], [-1, 0]], civIt = items.filter(function(t){ return t.k === 'civ'; })[0];
  var gPanel = null, gE = {}, padDir = -1, kkBase = kk, gFree = null, gFreeAt = 0, gArt = null, gHot = null;
  if (gym){ gPanel = document.createElement('div'); gPanel.className = 'pp-gp'; gPanel.hidden = true; gPanel.setAttribute('data-gp', '');
    gPanel.innerHTML = '<div class="pp-gph"><b data-gname></b><i data-gkeep hidden>Gatekeeper</i><span data-gmoves></span></div><p class="pp-gpg" data-ggoal></p>' +
      '<div class="pp-gps" data-gsay aria-live="polite"><span class="pp-gpf" data-gface></span><p data-gtext></p></div>' +
      '<div class="pp-gpc" data-gctl><div class="pp-gpb"><button data-gundo>Undo</button><button data-grestart>Restart</button><button data-gleave>Leave</button></div>' +
      '<div class="pp-gpd" data-gpad><button data-d="0" aria-label="Step up"></button><button data-d="3" aria-label="Step left"></button><button data-d="1" aria-label="Step right"></button><button data-d="2" aria-label="Step down"></button></div></div>' +
      '<div class="pp-gpk" data-gkeys></div>';
    ui.appendChild(gPanel);
    ['name', 'keep', 'moves', 'goal', 'say', 'face', 'text', 'ctl', 'pad', 'keys', 'undo', 'restart', 'leave'].forEach(function(k){ gE[k] = gPanel.querySelector('[data-g' + k + ']'); });
    gE.name.textContent = gym.G.name; gE.keep.hidden = !gym.G.keeper; gE.goal.textContent = GL.goal(gym.G);
    var stepIn = gym.inp === 'step'; gE.pad.hidden = !stepIn; gPanel.classList.toggle('nopad', !stepIn);
    gE.keys.textContent = (stepIn ? 'Arrows or WASD step · ' : gym.inp === 'tap' ? 'Click a tile · ' : '') + 'Z undo · R restart';
    var pu = api.portrait ? api.portrait(gym.G.who.look) : ''; if (pu) gE.face.style.backgroundImage = 'url(' + pu + ')';
    gPanel.addEventListener('pointerdown', function(e){ e.stopPropagation(); });
    gE.undo.onclick = function(e){ e.stopPropagation(); gymUndo(); };
    gE.restart.onclick = function(e){ e.stopPropagation(); if (gym.in && !gymBusy()) gymReset(performance.now() / 1000, GL.init(gym.G)); };
    gE.leave.onclick = function(e){ e.stopPropagation(); gymOut(); };
    // the pad: a press steps at once, and held it keeps stepping, as the stick does
    [].forEach.call(gE.pad.querySelectorAll('button'), function(bt){ var d = +bt.getAttribute('data-d');
      bt.addEventListener('pointerdown', function(e){ e.preventDefault(); e.stopPropagation(); padDir = d; gym.tap = d; try{ bt.setPointerCapture(e.pointerId); }catch(e2){} });
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function(ev){ bt.addEventListener(ev, function(){ if (padDir === d) padDir = -1; }); }); }); }
  function gymPhases(moves){ var i = 0, ph = [], first = []; while (i < moves.length){ first.push(moves[i]); if (moves[i++][0] === 'me') break; } if (first.length) ph.push(first); while (i < moves.length) ph.push([moves[i++]]); return ph; }
  function phDur(ph){ var d = 0; ph.forEach(function(m){ d = Math.max(d, GK.dur ? GK.dur(m[3]) : 0.15); }); return reduce ? d * 0.6 : d; }
  function gymDirIn(){ if (padDir >= 0) return padDir; var sx = stickV[0] + (keys.r ? 1 : 0) - (keys.l ? 1 : 0), sy = stickV[1] + (keys.d ? 1 : 0) - (keys.u ? 1 : 0);
    if (Math.max(Math.abs(sx), Math.abs(sy)) < 0.45) return -1; return Math.abs(sx) > Math.abs(sy) ? (sx > 0 ? 1 : 3) : (sy > 0 ? 2 : 0); }
  function gymTick(tsec, dt){ var A = gym.anim, moved = 0;
    if (A){ var P0 = A.ph[A.k], u = Math.min(1, (tsec - A.t0) / phDur(P0));
      P0.forEach(function(m){ if (m[0] !== 'me') return gView.move(m, u, tsec); var a = gT(m[1]), b = gT(m[2]);
        var nx = a[0] + (b[0] - a[0]) * u, ny = a[1] + (b[1] - a[1]) * u; moved += Math.hypot(nx - g.x, ny - g.y); g.x = nx; g.y = ny; });
      if (u >= 1){ A.k++; A.t0 = tsec; if (A.k >= A.ph.length){ gym.anim = null; if (A.then) A.then(tsec); } }
      return moved; }
    if (gym.inp === 'own'){ gym.ownBusy = !!(gView.tick && gView.tick(tsec, dt)); return 0; }
    if (tsec - (gym.bumpAt || -9) < 0.2) return 0;
    if (gym.inp === 'tap'){ var ti = gym.tapTile; gym.tapTile = null; if (ti != null) gymApply(GL.tap(gym.G, gym.s, ti), tsec); return 0; }
    var d = gym.tap != null ? gym.tap : gymDirIn(); gym.tap = null;
    if (d >= 0) gymGo(d, tsec);
    return 0; }
  function gymGo(d, tsec){ g.face = DIR_FACE[d].slice(); g.aimI = null; hint.classList.add('gone'); gymApply(GL.step(gym.G, gym.s, d), tsec); }
  /* A MOVE'S RESULT, whatever made it (a step, a tap, the kind's own input through R.commit): out, the lever, the
     vault, nothing, or a real move, recorded for Undo and played. */
  function gymApply(r, tsec){ var G = gym.G;
    if (r.ev === 'exit'){ var m0 = GL.me(G, gym.s); if (m0 == null) return gymLeave(); gym.anim = { ph:[[['me', m0, GY.Q.gate, 'walk']]], k:0, t0:tsec, then:gymLeave }; return; }
    if (r.ev === 'reset') return gymReset(tsec, r.s);
    if (r.ev === 'open') return gymOpen(tsec);
    if (r.ev === 'bump' || r.s === gym.s){ gym.bumpAt = tsec;
      if (GK.tell && GK.tell[r.ev] && !gym.told[r.ev]){ gym.told[r.ev] = 1; say(GK.tell[r.ev], 2200); } return; }
    gymKeep(); gym.n++;
    var then = function(t2){ gym.s = r.s; gView.lay(gym.s); gymCheck(); gymPanel(); if (!gym.solved && GL.won(G, gym.s)) gymOpen(t2); };
    var ph = gymPhases(r.moves); if (!ph.length) return then(tsec);
    gym.anim = { ph:ph, k:0, t0:tsec, then:then }; }
  // UNDO is a stack of the states he had (a move never changes a state in place), so a pop is the state exactly
  function gymKeep(){ gym.hist.push({ s:gym.s, n:gym.n }); if (gym.hist.length > 400) gym.hist.shift(); }
  // nothing is taken back, restarted or left while a move plays (a kind's own move too: its ball still rolling)
  function gymBusy(){ return !!(gym.anim || gym.ownBusy); }
  function gymUndo(){ if (!gym || !gym.in || gymBusy() || !gym.hist.length) return false; var h = gym.hist.pop(); gym.s = h.s; gym.n = h.n; gym.undos++;
    gView.lay(gym.s); gymPut(); api.sfx && api.sfx('blip'); gymCheck(); gymPanel(); return true; }
  // he stands where the state says, or (a tap kind) where he stood
  function gymPut(){ var p = GL.me(gym.G, gym.s); if (p == null) return; var q = gT(p); g.x = q[0]; g.y = q[1]; }
  // the lever, or Restart (and, shut in, the lit Restart): every piece back where it started, him at the door
  function gymReset(tsec, s0){ gym.leverAt = tsec; gym.resets++; api.sfx && api.sfx('blip');
    var tmp = []; gView.things(tmp, tsec); tmp.forEach(function(o){ var z = o.o && o.o.z != null ? o.o.z : GYM_DECK; burst(o.x, o.y, z + 1, ['rgba(230,220,200,.85)', '#c8a070'], 8, 1.4, 0.6); });
    gymKeep(); gym.n = 0; gym.s = s0; gView.lay(gym.s); var q = gT(GY.Q.start); g.x = q[0]; g.y = q[1]; burst(q[0], q[1], GYM_DECK + 1.2, ['rgba(255,255,255,.8)'], 8, 1.2, 0.5); gymCheck(); gymPanel();
    if ((gym.resets === 2 || gym.resets === 5) && civIt) say(GL.clue(gym.G, gym.resets), 7000, civIt); else say('Everything\'s back where it started.', 2200); }
  function gymOpen(tsec){ var V = gym.vault; if (!V) return;
    if (gym.solved){ say('The vault\'s empty. You already cleaned it out.', 2400); return; }
    gym.solved = true; V.done = true; V.openAt = tsec; api.sfx && api.sfx('coin'); var z = pic.zAt(V.x, V.y), res = null;
    try{ res = api.gym ? api.gym(GY.id) : null; }catch(e){ res = null; }
    // the coins are said in the panel: nothing floats over the board in a gym
    setTimeout(function(){ if (!alive) return; burst(V.x, V.y, z + 1.2, ['#ffd23a', '#fff3a8', '#ffffff', '#c89cff'], 40, 1.5, 1.4); ring(V.x, V.y, '255,214,64');
      if (!gym.in) floatText(res && res.coins ? res.coins.toLocaleString() + ' coins!' : 'Solved!', V.x, V.y, z + 3.2, '#ffd23a', true); }, (CH_SHAKE + 0.2) * 1000);
    if (gPanel) gPanel.classList.add('won'); gym.wonLine = (res && res.msg) || 'Solved. The vault is yours.';
    sayLater(gym.wonLine, 5200, 1.9); hudList(); gymCheck(); gymPanel(); }
  /* SHUT IN, Restart lights up and the panel says so. It is asked only when the kind says nothing else leads on (push:
     not when the lever is merely out of walking reach for a step), and a moment after the move, off the frame. */
  function gymCheck(){ var s0 = gym.s; gym.stuck = false; gymLit(); if (!gym.in) return;
    if (GK.onFoot && GK.onFoot(gym.G, s0)) return;
    setTimeout(function(){ if (!alive || gym.s !== s0 || !gym.in) return; gym.stuck = GL.stuck(gym.G, s0); gymLit(); if (gym.stuck) say((GK.tell && GK.tell.stuck) || 'You\'re boxed in. Restart puts it all back.', 4200); }, 30); }
  function gymLit(){ if (gE.restart) cls(gE.restart, 'lit', !!gym.stuck); }
  /* THE COUNTER'S WORD is the kind's own (unit: 'step', 'tap', 'slide', 'stroke'), so the panel counts what he did, not
     an abstract move. A kind without one counts moves. */
  function gymUnit(n){ var u = (GK && GK.unit) || 'move'; return n === 1 ? u : u + 's'; }
  function gymPanel(){ if (!gPanel) return; put(gE.moves, 'textContent', gym.n + ' ' + gymUnit(gym.n)); gE.undo.disabled = !gym.hist.length; gymLit(); gHot = null; }
  function gymEnter(tsec){ gym.in = true; g.vx = g.vy = 0; var q = gT(GY.Q.gate); g.x = q[0]; g.y = q[1]; gym.hist = []; gym.n = 0; gHot = null;
    var st = GL.place(gym.G, gym.s, GY.Q.gate), Gd = gym.G; gym.s = st;
    gym.anim = { ph:[[['me', GY.Q.gate, GY.Q.start, 'walk']]], k:0, t0:tsec, then:function(){ gym.s = GL.place(Gd, gym.s, GY.Q.start); gymCheck(); gymPanel(); } };
    gPanel.hidden = false; cls(gPanel, 'won', !!gym.solved); ui.classList.add('ingym'); bubble = null; bubEl.hidden = true; gFree = null; gymPanel(); gymIdle();
    if (!gym.told.in){ gym.told.in = 1; sayLater(gym.solved ? 'Solved already. Have a look around.' : GK.hello || 'Undo takes one back.', 3600, 0.5); }
    camAim(true); }
  function gymLeave(){ gym.in = false; gym.lock = true; g.x = GY.ax; g.y = GY.ay + 0.4; g.face = [0, 1]; g.aimI = null; g.vx = g.vy = 0; gPanel.hidden = true; ui.classList.remove('ingym'); gym.stuck = false; gymLit();
    padDir = -1; gym.hist = []; gym.pin = null; kk = kkBase; camAim(true); }
  // Leave: out through the gate from wherever he stands, the pieces left where they are (the lever puts them back)
  function gymOut(){ if (!gym || !gym.in || gymBusy()) return; var q = gT(GY.Q.gate); burst(q[0], q[1], GYM_DECK + 1, ['rgba(255,255,255,.8)'], 8, 1.2, 0.5); gymLeave(); }
  /* THE PANEL'S LINE: what the civilian says (with their face) or what the frame says. A frame message holds for its
     time, then the panel goes back to the civilian's current line, so the nudge is always there to read again. */
  function gymLine(txt, ms, civ){ if (!gPanel) return; gym.line = { txt:txt, civ:!!civ, until:ms ? performance.now() + ms : 0 };
    put(gE.text, 'textContent', txt); cls(gE.say, 'civ', !!civ); cls(gE.say, 'fresh', false); void gE.say.offsetWidth; cls(gE.say, 'fresh', true); }
  function gymLineTick(now){ var L = gym.line; if (L && L.until && now > L.until) gymIdle(); }
  // what the panel says between messages: the civilian's current line, or once the vault is open, what it paid
  function gymIdle(){ if (gym.solved) gymLine(gym.wonLine || 'Solved. The vault is open.', 0, false); else gymLine(GL.clue(gym.G, gym.resets), 0, true); }
  // a tap steps toward where it lands: whichever way, across or up and down the screen, is the further (a tap kind: that tile)
  var gTap0 = null;
  function gymTapDown(e){ if (!gym || !gym.in) return; gTap0 = { x:e.clientX, y:e.clientY, t:performance.now() };
    if (gym.inp === 'own' && gView.pointer){ var pt = groundAt(e.clientX, e.clientY); gView.pointer('down', e, pt); } }
  function gymTapMove(e){ if (!gym || !gym.in) return; var pt = groundAt(e.clientX, e.clientY);
    if (gym.inp === 'own' && gView.pointer) return gView.pointer('move', e, pt);
    if (gym.inp === 'tap'){ var h = gymTile(pt[0], pt[1]); if (h !== gym.hover){ gym.hover = h; gHot = null; } } }
  function gymTapUp(e){ if (!gym || !gym.in || !gTap0 || e.target.closest('button') || e.target.closest('[data-gp]')) return; var t0 = gTap0; gTap0 = null;
    if (gym.inp === 'own' && gView.pointer) return gView.pointer('up', e, groundAt(e.clientX, e.clientY));
    if (Math.hypot(e.clientX - t0.x, e.clientY - t0.y) > 12 || performance.now() - t0.t > 400) return;
    if (gym.inp === 'tap'){ var pt = groundAt(e.clientX, e.clientY), ti = gymTile(pt[0], pt[1]); if (ti >= 0 && !gym.anim) gym.tapTile = ti; return; }
    var r = box.getBoundingClientRect(), p = scr(g.x, g.y, pic.zAt(g.x, g.y) + GH * 0.4), dx = e.clientX - r.left - p[0] / dpr, dy = e.clientY - r.top - p[1] / dpr;
    if (Math.hypot(dx, dy) < 6) return; gym.tap = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0); }
  if (gym){ box.addEventListener('pointerdown', gymTapDown); box.addEventListener('pointermove', gymTapMove); box.addEventListener('pointerup', gymTapUp); }
  /* THE GROUND UNDER A POINT OF THE SCREEN, on the room's deck: the picture's projection is linear, so three points of
     it solve for the other two. In trail feet. */
  function groundAt(cx, cy){ var r = box.getBoundingClientRect(), ax = ((cx - r.left) * dpr - ox) / kk, ay = ((cy - r.top) * dpr - oy) / kk, z = GYM_DECK;
    var p0 = pic.pr(0, 0, z), px = pic.pr(1, 0, z), py = pic.pr(0, 1, z), a = px[0] - p0[0], b = py[0] - p0[0], c = px[1] - p0[1], d = py[1] - p0[1], det = a * d - b * c || 1e-9, u = ax - p0[0], v = ay - p0[1];
    return [(u * d - b * v) / det, (a * v - c * u) / det]; }
  /* THE ROOM ON THE SCREEN. gymArtRect: the room's box, floor to the top of the gate, in the picture's pixels. gymFree:
     what the header and the panel leave free of the box, in device pixels. gymCam centres the one in the other, at
     the trail's own zoom when the room fits and a step out when it does not (side margins go first). */
  function gymArtRect(){ if (gArt) return gArt; var xs = [GY.x0, GY.x0 + GY.w], ys = [GY.y0, GY.y0 + GY.d], zs = [GYM_DECK, GYM_DECK + 3.4], A = { x0:1e9, y0:1e9, x1:-1e9, y1:-1e9 };
    xs.forEach(function(x){ ys.forEach(function(y){ zs.forEach(function(z){ var p = pic.pr(x, y, z); A.x0 = Math.min(A.x0, p[0]); A.x1 = Math.max(A.x1, p[0]); A.y0 = Math.min(A.y0, p[1]); A.y1 = Math.max(A.y1, p[1]); }); }); });
    return gArt = A; }
  function gymFree(){ var r = box.getBoundingClientRect(), top = 0, hd = box.parentNode && box.parentNode.querySelector('.pp-hdr');
    if (hd){ var hr = hd.getBoundingClientRect(); if (hr.height) top = Math.max(0, hr.bottom - r.top); }
    var pr = gPanel.getBoundingClientRect(), side = pr.width < r.width * 0.6, gap = 10;
    var F = side ? { x0:gap, y0:top + gap, x1:pr.left - r.left - gap, y1:r.height - gap } : { x0:gap, y0:top + gap, x1:r.width - gap, y1:pr.top - r.top - gap };
    return { x0:F.x0 * dpr, y0:F.y0 * dpr, x1:F.x1 * dpr, y1:F.y1 * dpr, edge:side ? 0 : gap * dpr }; }
  function gymCam(snap){ if (gym.pin){ kk = gym.pin.kk; ox = gym.pin.ox; oy = gym.pin.oy; return; }
    var now = performance.now(); if (!gFree || now - gFreeAt > 500){ gFree = gymFree(); gFreeAt = now; }
    var F = gFree, A = gymArtRect(), aw = A.x1 - A.x0, ah = A.y1 - A.y0, k = kkBase;
    function fits(k2, f){ return aw * k2 <= f.x1 - f.x0 && ah * k2 <= f.y1 - f.y0; }
    // a wide screen shows the trail from further off than a phone: there the room is brought up as far as it fits
    var wide = { x0:F.x0 - F.edge, y0:F.y0, x1:F.x1 + F.edge, y1:F.y1 }, use = fits(k, F) ? F : fits(k, wide) ? wide : null;
    if (use === F) while (k < kkBase * 3 && k < 8 && fits(k + 1, F)) k++;
    if (!use){ while (k > 1 && !fits(k, F)) k--; use = F; }
    if (k !== kk){ kk = k; snap = true; }
    var tx = Math.round((use.x0 + use.x1) / 2 - (A.x0 + A.x1) / 2 * kk), ty = Math.round((use.y0 + use.y1) / 2 - (A.y0 + A.y1) / 2 * kk);
    if (snap){ ox = tx; oy = ty; } else { ox += Math.round((tx - ox) * 0.2); oy += Math.round((ty - oy) * 0.2); if (Math.abs(tx - ox) < 3) ox = tx; if (Math.abs(ty - oy) < 3) oy = ty; } }
  // the room's rect on the screen in CSS pixels (the board), for the checks and for keeping the trail's bubbles off it
  function gymBoard(){ var A = gymArtRect(), r = box.getBoundingClientRect(); return { left:r.left + (A.x0 * kk + ox) / dpr, top:r.top + (A.y0 * kk + oy) / dpr, right:r.left + (A.x1 * kk + ox) / dpr, bottom:r.top + (A.y1 * kk + oy) / dpr }; }
  /* WHAT A MOVE WOULD CHANGE, marked: a soft gold ring round every piece a step would move (a tap kind: every tile a
     tap changes, white where the pointer is), and a gold ring round the vault, the goal. A ring is drawn on the floor
     under everything that stands, and its near half again over it, so a barrel stands inside its ring. */
  function gymHot(){ if (gHot && gHot.s === gym.s && gHot.h === gym.hover) return gHot; var G = gym.G, s = gym.s, hot = {}, over = {};
    if (gView.hot) (gView.hot(s) || []).forEach(function(i){ hot[i] = 1; });
    // a piece's first move in a step is from where it stands now (the rest are where a belt carries it on)
    else if (gym.inp === 'step') for (var d = 0; d < 4; d++){ var seen = {}; GL.step(G, s, d).moves.forEach(function(m){ if (m[0] === 'me' || seen[m[0]]) return; seen[m[0]] = 1; hot[m[1]] = 1; }); }
    else if (gym.inp === 'tap') GL.moves(G, s).forEach(function(i){ var r = GL.tap(G, s, i); if (r.s === s) return; hot[i] = 1;
      if (i === gym.hover) r.moves.forEach(function(m){ over[m[1]] = 1; over[m[2]] = 1; }); });
    return gHot = { s:s, h:gym.hover, own:!!gView.hot, hot:Object.keys(hot).map(Number), over:Object.keys(over).map(Number) }; }
  function gymMarks(tsec, front){ if (gym.anim) return; var H = gymHot(), T = GY.T, pul = reduce ? 0.8 : 0.6 + 0.3 * Math.sin(tsec * 3.2), lw = Math.max(2, Math.round(kk * 1.2));
    ctx.save(); ctx.lineWidth = lw;
    function ringAt(x, y, rr, col, a){ var c0 = scr(x, y, GYM_DECK + 0.02), cx = scr(x + rr, y, GYM_DECK + 0.02), cy = scr(x, y + rr, GYM_DECK + 0.02);
      ctx.strokeStyle = col; ctx.globalAlpha = a; ctx.beginPath(); ctx.ellipse(c0[0], c0[1], Math.abs(cx[0] - c0[0]) || 1, Math.abs(cy[1] - c0[1]) || 1, 0, front ? 0.15 : 0, front ? Math.PI - 0.15 : 7); ctx.stroke(); }
    H.hot.forEach(function(i){ var q = gT(i); ringAt(q[0], q[1], T * 0.47, '#ffe066', pul * (H.over.length ? 0.5 : 0.85)); });
    H.over.forEach(function(i){ var q = gT(i); ringAt(q[0], q[1], T * 0.47, '#ffffff', 0.95); });
    if (!gym.solved){ var V = gT(GY.Q.chest); ringAt(V[0], V[1], T * (0.6 + 0.05 * (reduce ? 0 : Math.sin(tsec * 2))), '#ffd23a', 0.9); }
    ctx.restore(); }
  /* THE GATE READS AS A WAY IN, out on the trail: gold chevrons on the little path to it, running toward the gate. */
  function gymDoor(tsec){ if (!GY.spur || GY.spur.length < 3) return; var T = 0.75, lw = Math.max(2, Math.round(kk * 1.3)), ex = GY.ax, ey = GY.y0 + GY.d;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (var k = 0; k < 3; k++){ var a = ((reduce ? 0.5 : tsec * 0.7) + k / 3) % 1, y = ey + 0.5 + (1 - a) * 2.4, z = pic.zAt(ex, y) + 0.04, al = Math.sin(a * Math.PI);
      var l = scr(ex - T, y + T * 0.7, z), m = scr(ex, y, z), r = scr(ex + T, y + T * 0.7, z);
      [['rgba(40,26,8,0.6)', lw + Math.max(2, Math.round(kk))], ['#ffd23a', lw]].forEach(function(st){ ctx.globalAlpha = 0.2 + 0.8 * al; ctx.strokeStyle = st[0]; ctx.lineWidth = st[1]; ctx.beginPath(); ctx.moveTo(l[0], l[1]); ctx.lineTo(m[0], m[1]); ctx.lineTo(r[0], r[1]); ctx.stroke(); }); }
    ctx.restore(); }
  function civFrame(t){ var G3 = window.RTT_G3D; if (!G3 || !G3.frame || !gym) return null; var a = Math.round(Math.atan2(g.x - t.x, -(g.y - t.y)) / (Math.PI / 4)) * 45;
    try{ return G3.frame(Object.assign({ shoes:'white', club:'driver', lefty:false }, gym.G.who.look), a, 'walk', 8); }catch(e){ return null; } }
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
    if (t.k === 'coin'){ t.done = true; coinsGot += COIN_V; hudCoins(); burst(t.x, t.y, z + 1.2, ['#ffd23a', '#fff3a8', '#ffffff'], 8); collect(t, now, 'coin'); if (!api.guestCoins) floatText('+' + COIN_V, t.x, t.y, z + 2.2); guestCoin(); pick('coin', t.id, COIN_V); api.sfx && api.sfx('coin'); }
    else if (t.k === 'chest'){ t.done = true; t.openAt = now; var cs0 = items.filter(function(c){ return c.k === 'coin' && c.ch === t; }), luck = pick('chest', t.id, cs0.length * COIN_V); hudChests(); api.sfx && api.sfx('coin');
      // the lock pops as it starts to rattle; the lid lifts; light, a ring and a shower of gold as it comes open
      burst(t.x, t.y + 0.8, z + 1.0, ['#ffd23a', '#fff1a0'], 6, 1.2, 0.6);
      setTimeout(function(){ if (!alive) return; burst(t.x, t.y, z + 1.5, ['#ffd23a', '#fff3a8', '#ffffff', '#ffb43a'], 26, 1.5, 1.3); ring(t.x, t.y, '255,214,64'); }, (CH_SHAKE + 0.15) * 1000);
      // the coins fly out of the lid in an arc and land where the plan put them
      var cs = items.filter(function(c){ return c.k === 'coin' && c.ch === t; });
      cs.forEach(function(c, i){ c.out = true; c.fly = { t0:now + CH_COINS + i * 0.05, dur:0.6 + (i % 3) * 0.08, x0:t.x, y0:t.y, z0:z + 1.6 }; });
      setTimeout(function(){ if (alive) floatText(cs.length ? (cs.length * COIN_V) + ' coins!' : 'Treasure!', t.x, t.y, z + 3.2, '#ffd23a', true); }, CH_COINS * 1000);
      sayLater(luck ? luck + (cs.length ? ' Walk over the coins too.' : '') : cs.length ? 'Walk over the coins to pick them up.' : 'An empty chest.', luck ? 4200 : 2600, 1.7); }
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
      if ((found.b || []).indexOf(t.id) < 0){ (found.b = found.b || []).push(t.id); coinsGot += BRK_V; hudCoins(); pick('brk', t.id, BRK_V); burst(t.x, t.y, z + 1, ['#ffd23a'], 4); collect({ x:t.x, y:t.y, k:'coin', id:t.id }, now, 'coin'); if (!api.guestCoins) floatText('+' + BRK_V, t.x, t.y, z + 2); guestCoin(); } else pick('brk', t.id, 0); } }

  var last = performance.now(), lastSafe = 0, nearNpc = false;
  function j7(t){ return Math.round(t.x * 7 + t.y * 13); }
  function step(){ if (!alive) return; requestAnimationFrame(step);
    var now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now; var tsec = now / 1000;
    // where the stick asks him to go, on the screen, made a direction on the ground: up the screen is further than it looks
    var sx = 0, sy = 0, inGym = !!(gym && gym.in);
    if (!paused && !inGym){
      sx = stickV[0] + (keys.r ? 1 : 0) - (keys.l ? 1 : 0); sy = stickV[1] + (keys.d ? 1 : 0) - (keys.u ? 1 : 0); var m = Math.hypot(sx, sy); if (m > 1){ sx /= m; sy /= m; } }
    var o = P.poolAt(g.x, g.y), ice = o && o.k === 'ice', slow = o && o.k === 'slow' ? 0.5 : 1, mag = Math.hypot(sx, sy), sp2 = SPEED * slow;
    var tvx, tvy;
    if (mag > 0.05){ var wx = sx, wy = sy / SE, wl = Math.hypot(wx, wy); tvx = wx / wl * sp2 * mag; tvy = wy / wl * sp2 * mag; } else { tvx = 0; tvy = 0; }
    var acc = ice ? 2.2 : 26; g.vx += (tvx - g.vx) * Math.min(1, acc * dt); g.vy += (tvy - g.vy) * Math.min(1, acc * dt);
    if (PZ && PZ.crate && !paused) pushCrate(dt, now);
    var nx = g.x + g.vx * dt, ny = g.y + g.vy * dt, moved = 0;
    if (inGym){ g.vx = g.vy = 0; moved = paused ? 0 : gymTick(tsec, dt); gymLineTick(now); }
    else if (!blocked(nx, ny)){ moved = Math.hypot(nx - g.x, ny - g.y); g.x = nx; g.y = ny; }
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
    if (inGym) g.moving = !!gym.anim;
    g.dist += moved;
    if (moved > 0.5) hint.classList.add('gone');
    // the gym's gate: walked into from the path, he is in, a tile at a time (and once out, he has to step away first)
    if (gym && !gym.in && !paused){ if (gym.lock){ if (Math.hypot(g.x - GY.ax, g.y - GY.ay) > 1.8) gym.lock = false; }
      else if (Math.abs(g.x - GY.ax) < 0.95 && g.y - GY.ay < 0.4 && g.vy < -0.3) gymEnter(tsec); }
    // the civilian by the gate says their piece as he walks up: the plainer one once he has pulled the lever twice
    if (gym && civIt && !gym.in){ var dcv = Math.hypot(civIt.x - g.x, civIt.y - g.y); if (dcv < 3.6 && !gym.nearCiv){ gym.nearCiv = true; say(GL.clue(gym.G, gym.resets), 7000, civIt); } else if (dcv > 5.5) gym.nearCiv = false; }
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
      if (t.k === 'chest' && !t.done && !t.hint && d < 9){ t.hint = true; if (!bubble || now > bubble.until) say(t.main && P.fence && !lockOpen ? sayPick(CHEST_SAY.fence, P.seed) : sayPick((CHEST_SAY[P.spec.theme] || []).concat(CHEST_SAY.any), P.seed + j7(t)), 2200);
        var hr = ui.querySelector('[data-tlist] [data-id="' + t.id + '"]'); if (hr) hr.classList.add('near'); }
      else if (t.k === 'brk' && d < 1.5 && spd > 1.5) take(t, tsec); }
    if (PZ) stepPuzzle(dt, now, tsec);
    // the local talks when he walks up, and on a puzzle trail he gives the clue
    var npc = items.filter(function(t){ return t.k === 'npc'; })[0];
    if (npc){ var dn = Math.hypot(npc.x - g.x, npc.y - g.y); if (dn < 3.4 && !nearNpc){ nearNpc = true; var ls = [], gold = items.filter(function(t){ return t.k === 'golden' && !t.done; })[0], word = '';
        // what he knows about this trail is said on its own, and then what he knows about the hole
        if (P.secret) word = (api.secretSeen && api.secretSeen(P.secret.i) ? SECRET_DONE : SECRET_SAY[P.spec.theme] || SECRET_SAY.any);
        else if (gold) word = sayPick(GOLD_SAY, P.seed);
        ls = ls.concat(api.lines ? api.lines() : []);
        // an unsolved puzzle's clue is what you need right now, so it comes first and the rest after
        if (PZ && !PZ.solved){ say(P.puzzle.clue, 8200, npc); var rest = (word ? [word] : []).concat(ls); if (rest.length) npcLater(rest.join(' '), 8.4, npc); }
        else if (word){ say(word, 3600, npc); if (ls.length) npcLater(ls.join(' '), 3.7, npc); } else if (ls.length) say(ls.join(' '), 5200, npc); } else if (dn > 5) nearNpc = false; }
    if (P.fence && !lockOpen){ var df = Math.hypot(g.x - P.lockGate.x, g.y - P.lockGate.y); if (df < 2.4 && (!bubble || now > bubble.until)) say('Locked. The key is somewhere on this trail.', 2200); }
    // the door between worlds
    if (gate && !gate.asked && Math.abs(g.y - P.gate.y) < 3.2 && Math.abs(g.x - P.gate.x) < PW + 3){ gate.asked = true; paused = true; g.vx = g.vy = 0;
      api.door(function(open){ gate.open = open; paused = false; if (open && cloud) cloud.part = performance.now() / 1000; }); }
    if (gate && gate.asked && !gate.open && Math.abs(g.y - P.gate.y) > 7) gate.asked = false;
    // the secret entrance: a word coming near it, and walking into its doorway offers the hole
    if (P.secret && api.secret){ var dsx = Math.hypot(g.x - P.secret.x, g.y - P.secret.y);
      if (dsx < 9 && !P.secret.hinted){ P.secret.hinted = true; if (!bubble || now > bubble.until) say(P.secret.hint, 2600); }
      if (dsx < P.secret.r && !P.secret.inside){ P.secret.inside = true; paused = true; g.vx = g.vy = 0; api.secret(P.secret.i, function(){ paused = false; }); }
      else if (dsx > P.secret.r + 1.5) P.secret.inside = false; }
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
    if (!(ox <= 0 && oy <= 0 && ox + cw * kk >= W && oy + ch * kk >= H)){ ctx.fillStyle = pic.bg || kitOf(sp.kitAs || sp.theme).g[0]; ctx.fillRect(0, 0, W, H); }
    if (sx1 > sx0 && sy1 > sy0) ctx.drawImage(pic.cv, sx0, sy0, sx1 - sx0, sy1 - sy0, ox + sx0 * kk, oy + sy0 * kk, (sx1 - sx0) * kk, (sy1 - sy0) * kk);
    if (PZ) drawPzGround(tsec);
    if (gym){ gView.ground(tsec); if (gym.in){ if (gym.marks) gymMarks(tsec, false); } else gymDoor(tsec); }
    // everything that moves, far to near
    var ds = [];
    items.forEach(function(t){ if (t.k === 'host') return; if (t.k === 'coin' && !t.out) return; if (t.done && t.k !== 'chest' && t.k !== 'prize' && t.k !== 'brk' && t.k !== 'vault') return; if (t.k === 'brk' && t.done) return; if (t.k === 'prize' && !prizeShown()) return; ds.push(t); });
    if (P.pen && P.pen.gated) ds.push({ k:'pzgate', x:P.pen.x, y:P.pen.y + P.pen.r });
    if (PZ && PZ.crate) ds.push({ k:'crate', x:PZ.crate.x, y:PZ.crate.y });
    if (gym){ gView.things(ds, tsec); var lq = gT(GY.Q.lever); ds.push({ k:'glever', x:lq[0], y:lq[1] }); }
    if (P.gate) ds.push({ k:'gate', x:P.gate.x, y:P.gate.y + 0.01 });
    if (P.fence) ds.push({ k:'lock', x:P.lockGate.x, y:P.lockGate.y });
    ds.push({ k:'me', x:g.x, y:g.y });
    if (hs) ds.push({ k:'hostfig', x:hs.x, y:hs.y });
    for (var pi = 0; pi < plants.length; pi++) ds.push({ k:'plant', x:plants[pi].x, y:plants[pi].y, q:plants[pi] });
    if (!reduce) lifeGround(ds);
    ds.sort(function(a, c){ return a.y - c.y; });
    for (var i = 0; i < ds.length; i++){ var t = ds[i];
      if (t.k === 'me') drawMe(tsec);
      else if (t.kd) t.kd(t, tsec);
      else if (t.k === 'glever') drawSprite(SPR.lever[tsec - gym.leverAt < 0.7 ? 1 : 0], t.x, t.y, GYM_DECK);
      else if (t.k === 'vault') drawChest(t, tsec, SPR.vault);
      else if (t.k === 'civ') drawFigure(civFrame(t), t.x, t.y, false, 'civ');
      else if (t.k === 'plant') drawPlant(t.q);
      else if (t.k === 'coin') drawCoin(t, tsec);
      else if (LOOT[t.k] && t.k !== 'chest' && t.k !== 'prize') drawLoot(t, tsec);
      else if (t.k === 'chest' || t.k === 'prize') drawChest(t, tsec);
      else if (t.k === 'fire') drawFire(t, tsec);
      else if (t.k === 'pzgate'){ var gs = pzGateOpen() ? SPR.pen1 : SPR.pen0; if (gs) drawSprite(gs.s, gs.x, gs.y, pic.zAt(gs.x, gs.y)); }
      else if (t.k === 'crate') drawSprite(SPR.crate, t.x, t.y, pic.zAt(t.x, t.y));
      else if (t.k === 'brk') drawSprite(brkSprite(t), t.x, t.y, pic.zAt(t.x, t.y));
      else if (t.k === 'npc') drawFigure(npcFrame(t), t.x, t.y);
      else if (t.k === 'ship' || t.k === 'tumble' || t.k === 'ghost') drawLifeThing(t, tsec);
      else if (t.k === 'hostfig'){ var hp = scr(t.x, t.y); ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(hp[0], hp[1], 5 * kk, 2 * kk, 0, 0, 7); ctx.fill(); drawFigure(hostFrame(), t.x, t.y, false, 'host');
        if (hs.ph === 'wait'){ var ep = scr(t.x, t.y, pic.zAt(t.x, t.y) + GH + 1.4 + Math.sin(tsec * 4) * 0.25), es = Math.max(2, Math.round(kk)); ctx.fillStyle = '#3a2a14'; ctx.fillRect(Math.round(ep[0] - 2 * es), Math.round(ep[1] - 7 * es), 4 * es, 9 * es); ctx.fillRect(Math.round(ep[0] - 2 * es), Math.round(ep[1] + 3 * es), 4 * es, 4 * es);
          ctx.fillStyle = '#ffd24a'; ctx.fillRect(Math.round(ep[0] - es), Math.round(ep[1] - 6 * es), 2 * es, 7 * es); ctx.fillRect(Math.round(ep[0] - es), Math.round(ep[1] + 4 * es), 2 * es, 2 * es); } }
      else if (t.k === 'gate') drawSprite(gate && gate.open ? SPR.gate1 : SPR.gate0, t.x, P.gate.y, pic.zAt(t.x, P.gate.y));
      else if (t.k === 'lock'){ var ls = lockOpen ? SPR.fence1 : SPR.fence0; if (ls){ ctx.save(); drawSprite(ls.s, ls.x, ls.y, pic.zAt(ls.x, ls.y)); ctx.restore(); } } }
    if (gym && gym.in){ if (gym.marks) gymMarks(tsec, true); if (gView.over) gView.over(tsec); }
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
    // the bubble, over whoever said it (bubPlace); in a gym the panel has it instead
    if (bubble && !(gym && gym.in)) bubPlace();
  }
  /* A BUBBLE STAYS OVER WHOEVER SAID IT. A local's line is pinned to the local for as long as it shows, so walking
     off never drags it along over the golfer; anything the walk says itself sits over the golfer. And on a trail with a
     gym it never sits on the gym: the bubble goes above the speaker, below them, or to either side, whichever first
     keeps it off the room and its gate, and always inside the screen (its whole width, never squeezed at an edge). */
  function bubPlace(){ var sp0 = bubble.who || g, z0 = pic.zAt(sp0.x, sp0.y), hp = scr(sp0.x, sp0.y, z0 + GH + 0.6);
    if (!gym){ put(bubEl.style, 'left', (hp[0] / dpr) + 'px'); put(bubEl.style, 'top', (hp[1] / dpr) + 'px'); return; }
    put(bubEl.style, 'transform', 'none'); put(bubEl.style, 'width', 'max-content');
    var fp = scr(sp0.x, sp0.y, z0), Wc = W / dpr, Hc = H / dpr, m = 8, x = hp[0] / dpr, y = hp[1] / dpr, fx = fp[0] / dpr, fy = fp[1] / dpr, bw = bubEl.offsetWidth, bh = bubEl.offsetHeight;
    var A = gymArtRect(), R0 = { l:(A.x0 * kk + ox) / dpr - 6, t:(A.y0 * kk + oy) / dpr - 6, r:(A.x1 * kk + ox) / dpr + 6, b:(A.y1 * kk + oy) / dpr + 6 };
    var cand = [[x - bw / 2, y - bh - 4], [fx - bw / 2, fy + 10], [x + 18, (y + fy) / 2 - bh / 2], [x - 18 - bw, (y + fy) / 2 - bh / 2]], hit = function(c){ return c[0] < R0.r && c[0] + bw > R0.l && c[1] < R0.b && c[1] + bh > R0.t; };
    var inside = function(c){ return c[0] >= m && c[1] >= m && c[0] + bw <= Wc - m && c[1] + bh <= Hc - m; }, at = null;
    for (var i = 0; i < cand.length && !at; i++) if (!hit(cand[i]) && inside(cand[i])) at = cand[i];
    for (var j = 0; j < cand.length && !at; j++) if (!hit(cand[j])) at = cand[j];
    at = at || cand[1]; at = [Math.max(m, Math.min(Wc - m - bw, at[0])), Math.max(m, Math.min(Hc - m - bh, at[1]))];
    put(bubEl.style, 'left', Math.round(at[0]) + 'px'); put(bubEl.style, 'top', Math.round(at[1]) + 'px'); }
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
    if (gym && gym.in){ cls(way, 'on', false); cls(pin, 'on', false); return; }   // in a gym the gym is the place: no arrow
    /* THE ARROW LEADS ALONG THE WALK, not across country. A route that doglegs or doubles back puts the arch over
       the trees, so while there is more than a bend to go the arrow points at the path some way ahead of him, and
       the distance it gives is what is left to walk. Near the end, or at a shut door, it is the place itself. */
    var shut = gate && !gate.open && g.y > P.gate.y, goal = shut ? [P.gate.x, P.gate.y] : [P.arch.x, -0.5], sg0 = along(g.x, g.y), sEnd = shut && P.gate.s != null ? P.gate.s : goalS, left = Math.max(0, sEnd - sg0);
    var via = left > 30 && Math.hypot(goal[0] - g.x, goal[1] - g.y) < left * 0.8, tgt = via ? pathAtS(sg0 + 24) : goal, p = scr(tgt[0], tgt[1], pic.zAt(tgt[0], tgt[1]) + (via ? 3 : shut ? 7 : 9.5));
    tx = p[0] / dpr; ty = p[1] / dpr; var M = 34, Wc = W / dpr, Hc = H / dpr, inside = !via && tx > M && tx < Wc - M && ty > M + 110 && ty < Hc - M - 70;
    // a pin that would stand on a gym's room is the arrow at the edge instead, so the room and its gate stay clear
    if (inside && gym){ var A = gymArtRect(); if (tx > (A.x0 * kk + ox) / dpr - 40 && tx < (A.x1 * kk + ox) / dpr + 40 && ty > (A.y0 * kk + oy) / dpr - 20 && ty < (A.y1 * kk + oy) / dpr + 50) inside = false; }
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
      window.removeEventListener('pointercancel', pup); window.removeEventListener('blur', pup); window.removeEventListener('keydown', kd, true); window.removeEventListener('keyup', ku, true);
      if (gym){ box.removeEventListener('pointerdown', gymTapDown); box.removeEventListener('pointermove', gymTapMove); box.removeEventListener('pointerup', gymTapUp); if (gPanel) gPanel.remove(); } },
    // for the checks: where he is, and a way to hold the stick
    // the locked gate's sprite measured on screen, in feet, against the box it was built in (a half size one is the bug it fixes)
    lockFt:function(){ var L = SPR.fence0 || SPR.pen0, F = P.fence || P.pen; if (!L || !F) return null; var a = scr(0, 0, 0), b = scr(1, 0, 0), ppf = Math.hypot(b[0] - a[0], b[1] - a[1]);
      return { ft:L.s.cv.width * kk / ppf, box:3 * fenceGap(F).w / 2 + 1.2 + 2, gap:fenceGap(F).w }; },
    pos:function(){ return [g.x, g.y]; }, warp:function(x, y){ g.x = x; g.y = y; g.vx = g.vy = 0; }, fx:function(){ return fxs.length; }, stick:function(vx, vy){ stickV = [vx, vy]; },
    plan:function(){ return P; }, gate:function(){ return gate; }, clouds:function(){ return cloud ? (cloud.part ? 'parting' : 'on') : 'off'; }, life:function(){ return { theme:sp.theme, ships:ships.map(function(s1){ var y1 = shipY(s1); return { x:shipX(y1), y:y1 }; }), flyers:flyers.length, motes:motes.length, balloons:balloons.length, tumbles:tumbles.length, ghosts:ghosts.length, puffs:puffs.length, smoke:smokeSrc.length }; }, host:function(){ return hs ? { x:hs.x, y:hs.y, ph:hs.ph, talking:!!dlg } : null; }, items:function(){ return items; }, goTo:function(x, y){ g.x = x; g.y = y; }, blocked:function(x, y){ return blocked(x, y); }, pz:function(){ return PZ; }, gym:function(){ return gym; }, gymStep:function(d){ if (gym && gym.in && !gym.anim) gymGo(d, performance.now() / 1000); }, gymBusy:function(){ return !!(gym && gym.anim); }, gymXY:function(i){ return gT(i); },
    // the frame, for the checks: a tap on a tile, Undo, Restart, Leave, what the panel says, and where everything is on the screen
    gymTap:function(i){ if (gym && gym.in && !gym.anim) gymApply(GL.tap(gym.G, gym.s, i), performance.now() / 1000); }, gymUndo:function(){ return gymUndo(); },
    gymRestart:function(){ if (gym && gym.in && !gymBusy()) gymReset(performance.now() / 1000, GL.init(gym.G)); }, gymLeave:function(){ gymOut(); },
    gymSays:function(){ return gym && gym.line ? gym.line.txt : ''; }, gymHot:function(){ return gym && gym.in ? gymHot() : null; },
    gymRects:function(){ if (!gym) return null; var R = function(el){ if (!el || el.hidden || !el.offsetParent) return null; var r = el.getBoundingClientRect(); return { left:r.left, top:r.top, right:r.right, bottom:r.bottom }; };
      return { board:gymBoard(), panel:R(gPanel), goal:R(gE.goal), say:R(gE.say), controls:R(gE.ctl), pad:R(gE.pad), buttons:[gE.undo, gE.restart, gE.leave].map(R), stick:R(stick), bubble:R(bubEl), kk:kk, kkBase:kkBase }; },
    // a camera held where a check puts it, and the highlights off, so a room's pixels can be compared with an older build's
    gymPin:function(o){ if (gym){ gym.pin = o && o.ox != null ? { ox:o.ox, oy:o.oy, kk:o.kk } : null; gym.marks = !(o && o.marks === false); } }, bubble:function(){ return bubble ? bubble.txt : ''; }, plants:function(){ return plants.map(function(q){ return { x:q.x, y:q.y, k:q.t.k, b:q.b, in:q.in }; }); }, view:function(){ return { kk:kk, W:W, H:H, ox:ox, oy:oy }; }, scr:scr };
  return ctl;
}

/* EACH WORLD'S STOPS ON THE WALK (golf/putt/stops/, pasted between these lines by scripts): a KIT['world~stop'] a stop, its
   landmarks' BUILD and LMSIZE, and its life (LIFE_AS). land.js's STOPS names the stops; a stop with no kit here walks in its world's. */
// @@WORLD STOPS BEGIN@@
/* ---- The Clubhouse's stops on the walk, the same places its holes stand in (land.js): the first tee with the pro shop and
   the car park, the practice range, the woods out on the course, the mill creek, and home to the big clubhouse. */
KIT['clubhouse~tee'] = kitFrom(KIT.clubhouse, { nlm:4, dens:0.75, lm:['cluShop', 'cluCars', 'shed', 'green', 'cluCars', 'bench'] });
KIT['clubhouse~range'] = kitFrom(KIT.clubhouse, { g:['#86bb62', '#90c46c', '#7cb05a', 0.18], dens:0.2, haz:null, nlm:4, low:['bush', 'bushf', 'bush'], tree:['broad', 'broad', 'broad', 'pine'],
  lm:['cluBays', 'cluTarget', 'cluYard', 'cluTarget', 'cluBunker', 'cluBays'] });
KIT['clubhouse~woods'] = kitFrom(KIT.clubhouse, { g:['#4f8a3e', '#5a9646', '#467e36', 0.2], mow:false, gpat:'cluRough', p:['#74777c', '#7e8186', '#6a6d72'], tree:['pine', 'broad', 'pine', 'broad'],
  leaves:['#2a7438', '#358544', '#215f30'], low:['bush', 'bush', 'rock', 'fern'], dens:1.4, nlm:4, lm:['cluCart', 'cluHut', 'cluGate', 'cluBunker', 'bench'] });
KIT['clubhouse~mill'] = kitFrom(KIT.clubhouse, { g:['#78ae56', '#84ba60', '#6ca24c', 0.2], mow:false, gpat:'cluMeadow', p:['#cfc2a2', '#dcd0b2', '#bcae8c'], tree:['broad', 'broad', 'broad'],
  leaves:['#5f9e3e', '#74b04a', '#4e8a34'], low:['bushf', 'bush', 'rock', 'bushf'], haz:'water', hazC:['#3a82b8', '#7cc0e4'], waterC:['#3a82b8', '#7cc0e4'], nlm:3, lm:['cluMill', 'cluWindmill', 'bench', 'cluMill'] });
KIT['clubhouse~home'] = kitFrom(KIT.clubhouse, { g:['#6eac54', '#78b85e', '#64a24c', 0.18], p:['#e2d8c0', '#ece4d0', '#c8bca0'], paved:true, hazC:['#3a8ec4', '#7cc4e8'], waterC:['#3a8ec4', '#7cc4e8'],
  nlm:5, lm:['cluClub', 'cluStand', 'cluTerrace', 'cluFlags', 'lamps', 'cluStand'] });
LIFE_AS['clubhouse~range'] = { fly:['crow', 3], mote:[['butter', 6]] };
LIFE_AS['clubhouse~woods'] = { fly:['song', 6], mote:[['leaf', 12], ['butter', 4]] };
LIFE_AS['clubhouse~mill'] = { fly:['song', 3], mote:[['butter', 18], ['petal', 8]] };
LIFE_AS['clubhouse~home'] = { fly:['gull', 3], mote:[['petal', 12], ['butter', 6]] };
// the woods' floor and the mill's meadow: smooth patches of green, never a speckle
GPAT.cluRough = function(c){ var a = vn(c.ti * 0.04, c.tj * 0.04, 71), b = vn(c.ti * 0.12, c.tj * 0.12, 72); return a > 0.68 ? '#5e9a48' : a < 0.3 ? '#447a34' : b > 0.66 ? '#56923f' : '#4f8a3e'; };
GPAT.cluMeadow = function(c){ var a = vn(c.ti * 0.035, c.tj * 0.035, 73), b = vn(c.ti * 0.14, c.tj * 0.14, 74); return a > 0.7 && b > 0.55 ? '#94c86c' : a > 0.62 ? '#84ba60' : a < 0.3 ? '#6ca24c' : '#78ae56'; };

// a car seen in a bay: body, cabin, windows, wheels, nose toward +y
function cluCarPx(dx, dy, tt, col){ if (Math.abs(dx) > 0.95 || Math.abs(dy) > 1.9) return null;
  if (tt < 0.42) return Math.abs(Math.abs(dy) - 1.2) < 0.4 && Math.abs(dx) > 0.7 ? '#1e1e22' : (tt > 0.3 ? '#2a2a30' : null);
  if (tt < 1.0){ if (dy > 1.75 && Math.abs(dx) > 0.55 && tt > 0.6 && tt < 0.8) return '#fff3c4'; return col; }
  if (tt < 1.7 && dy > -1.3 && dy < 0.75 && Math.abs(dx) < 0.85 - (tt - 1) * 0.3){ if (tt > 1.58) return col; return Math.abs(dx) > 0.7 - (tt - 1) * 0.3 || dy > 0.6 || dy < -1.15 ? '#9fc8e0' : '#3a4a5a'; }
  return null; }
var CLU_CARS = ['#d8433a', '#3a6ec8', '#f4f4f0', '#e8b83a', '#9aa0a8', '#2f8a5a'];
// the car park by the clubhouse: tarmac, white bays, a kerb, three cars in
BUILD.cluCars = function(B, t, i){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var hw = t.w / 2, hd = t.d / 2;
  for (var k = 0; k < 3; k++){ if (hash(i, k, 7) < 0.25) continue; var c = cluCarPx((dx - (k - 1) * 4.5) / 1.6, (dy + 0.8) / 1.6 * (k % 2 ? 1 : -1), tt / 1.6, CLU_CARS[(i + k * 2) % 6]); if (c) return c; }
  if (tt > 0.12) return null; if (Math.abs(dx) > hw - 0.25 || Math.abs(dy) > hd - 0.25) return '#c8c4b8';
  if (Math.abs(((dx + 6.75) % 4.5 + 4.5) % 4.5) < 0.15 && dy < hd - 2) return '#f2f2ec'; return vn(dx * 0.6, dy * 0.6, i) > 0.6 ? '#5f6268' : '#55585e'; }, 0.125); };
// the pro shop: cream walls, a slate roof, a striped awning over its window
BUILD.cluShop = function(B, t, i){ gable(B, t.x, t.y, t.w - 1, t.d - 1, 5, 2.6, function(dx, dy, tt){ return tt < 0.5 ? '#b8ae98' : (tt * 1.6 | 0) % 2 ? '#efe6d2' : '#e6dcc6'; },
  function(dx, dy, tt){ return (tt * 2 | 0) % 2 ? '#56565e' : '#4a4a52'; }, '#7a3a2a');
  box(B, t.x, t.y + (t.d - 1) / 2 + 0.7, t.w - 1.5, 1.4, 4.6, function(dx, dy, tt){ if (Math.abs(tt - (4.3 - (dy + 0.7) * 0.8)) > 0.14) return null; return Math.floor((dx + 9) * 1.2) % 2 ? '#d8433a' : '#f8f4ec'; }, 0.125); };
// the covered hitting bays: a green roof on posts, a low back wall, a mat and a basket of balls in each bay
BUILD.cluBays = function(B, t, i){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var hw = t.w / 2, hd = t.d / 2, roof = 4.4 + (hd - dy) * 0.18;
  if (tt > roof && tt < roof + 0.35 && Math.abs(dx) < hw) return Math.abs(dy) > hd - 0.3 ? '#1f4a2c' : (Math.floor(dx * 0.8 + 20) % 2 ? '#2f6b3e' : '#2a6038');
  var bay = (dx + hw) / (t.w / 4), bf = bay - Math.floor(bay);
  if (dy < -hd + 0.4 && tt < 1.6) return (tt * 3 | 0) % 2 ? '#e8e2d0' : '#d8d0bc';
  if ((bf < 0.04 || bf > 0.96 || Math.abs(dx) > hw - 0.25) && Math.abs(dy) > hd - 0.4 && tt < roof) return '#e8e2d0';
  if (bf > 0.62 && bf < 0.85 && Math.abs(dy + 0.6) < 0.4 && tt < 0.8) return tt > 0.6 ? '#ffffff' : '#2a5a8a';
  if (tt < 0.12) return bf > 0.2 && bf < 0.55 && Math.abs(dy) < 1 ? '#3f8a4a' : '#c8c0aa'; return null; }); };
// a target green on the range: a round of short grass, a flag, the balls that landed near it
BUILD.cluTarget = function(B, t, i){ var col = ['#e53935', '#f1d04a', '#1e88e5'][i % 3]; box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var r = Math.hypot(dx / (t.w / 2), dy / (t.d / 2));
  if (Math.hypot(dx - 0.6, dy + 0.4) < 0.1 && tt < 5.6) return '#ffffff'; if (dx > 0.6 && dx < 2.4 && Math.abs(dy + 0.4) < 0.06 && tt > 4.3 && tt < 5.5) return col;
  if (tt > 0.3 || r > 1) return null; if (hash(Math.floor(dx * 4), Math.floor(dy * 4), i) < 0.02) return '#ffffff'; return r > 0.9 ? '#4f9a48' : vn(dx * 0.8, dy * 0.8, i) > 0.6 ? '#66b45e' : '#5fae58'; }, 0.125); };
// a distance board on two white legs, in its target's colour
BUILD.cluYard = function(B, t, i){ var col = ['#e53935', '#f1d04a', '#1e88e5'][i % 3]; box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ if (Math.abs(dy) > 0.25) return null;
  if (tt < 3) return Math.abs(Math.abs(dx) - 0.9) < 0.14 ? '#f4f4f4' : null; if (tt > 4.9 || Math.abs(dx) > 1.4) return null; if (Math.abs(dx) > 1.25 || tt < 3.15 || tt > 4.75) return '#f4f4f4';
  return Math.abs(tt - 3.95) < 0.35 && Math.abs(dx) < 0.8 && (Math.floor((dx + 2) * 4) % 3) ? '#f4f4f4' : col; }, 0.125); };
// a bunker: raked sand sunk in a lip of grass, the rake left lying in it
BUILD.cluBunker = function(B, t, i){ box(B, t.x, t.y, t.w, t.d, 1, function(dx, dy, tt){ var r = Math.hypot(dx / (t.w / 2), dy / (t.d / 2)) + (vn(dx * 0.5, dy * 0.5, i) - 0.5) * 0.2; if (r > 1) return null;
  if (tt > 0.3 && tt < 0.42 && Math.abs(dy - 0.4) < 0.08 && Math.abs(dx - 0.5) < 1.6) return '#c8402e';
  if (tt > 0.22) return null; if (r > 0.88) return '#5a9646'; return Math.sin(dy * 5 + vn(dx * 0.3, 1, i) * 6) > 0.8 ? '#dcc68a' : '#ecd9a0'; }, 0.125); };
// a golf cart with its white canopy and a bag strapped on behind
BUILD.cluCart = function(B, t, i){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ if (tt < 0.45) return Math.abs(Math.abs(dx) - 1.2) < 0.32 && Math.abs(Math.abs(dy) - 0.95) < 0.15 ? '#1e1e22' : null;
  if (Math.abs(dy) > 1.05 || Math.abs(dx) > 1.9) return null; if (tt > 3.1 && tt < 3.35) return '#f4f4f0';
  if (tt > 1 && tt < 3.1 && Math.abs(Math.abs(dx) - 1.5) < 0.08 && Math.abs(Math.abs(dy) - 0.9) < 0.1) return '#9aa0a8';
  if (tt < 1) return '#f4f4f0'; if (tt < 1.6 && dx < 0.6 && dx > -0.8) return dx < -0.55 ? '#2a5a3a' : (tt < 1.1 ? '#f4f4f0' : null);
  if (dx < -1.3 && tt < 2.4 && Math.abs(dy) < 0.5) return tt > 2.15 ? '#e8b83a' : '#c8402e'; return null; }, 0.125); };
// the halfway hut: a timber kiosk, a red roof, a green and white awning over the hatch
BUILD.cluHut = function(B, t, i){ gable(B, t.x, t.y, t.w - 1, t.d - 1, 4.4, 2.2, function(dx, dy, tt){ return (Math.floor(dx * 1.4 + 20) % 2) ? '#a8784a' : '#986a40'; }, function(dx, dy, tt){ return (tt * 2 | 0) % 2 ? '#a8442e' : '#943a26'; }, '#3a2a1e');
  box(B, t.x, t.y + (t.d - 1) / 2 + 0.6, t.w - 1.6, 1.2, 4.2, function(dx, dy, tt){ if (Math.abs(tt - (3.9 - (dy + 0.6) * 0.7)) > 0.14) return null; return Math.floor((dx + 9) * 1.2) % 2 ? '#2f7d3e' : '#f8f4ec'; }, 0.125); };
// a white rail fence along the woods with a five bar gate standing open in it
BUILD.cluGate = function(B, t, i){ box(B, t.x, t.y, t.w, t.d + 2, t.h, function(dx, dy, tt){ var hw = t.w / 2;
  if (Math.abs(dx) < 1.4){ var u = dx + 1.3, v = dy, a = 0.9, al = u * Math.cos(a) - v * Math.sin(a), ac = Math.abs(u * Math.sin(a) + v * Math.cos(a));   // the gate, swung open
    if (ac < 0.1 && al > 0 && al < 2.5 && tt < 2.2 && (Math.abs(tt - 0.5) < 0.1 || Math.abs(tt - 1.2) < 0.1 || Math.abs(tt - 1.9) < 0.1 || al > 2.4 || Math.abs(tt - (0.5 + al * 0.55)) < 0.12)) return '#f4f4f0';
    return Math.abs(Math.abs(dx) - 1.3) < 0.16 && Math.abs(dy) < 0.16 && tt < 2.6 ? '#dcdcd4' : null; }
  if (Math.abs(dy) > 0.12) return null; if (((dx + hw) % 2.2 + 2.2) % 2.2 < 0.25 && tt < 2.4) return '#dcdcd4'; return Math.abs(tt - 1) < 0.12 || Math.abs(tt - 2) < 0.12 ? '#f4f4f0' : null; }, 0.125); };
// the water mill: stone walls, a red tile roof, the wheel down in its mill race
BUILD.cluMill = function(B, t, i){ var W = t.w - 3.4, cx = t.x - 1.4;
  gable(B, cx, t.y, W, t.d - 1, 5.8, 3, function(dx, dy, tt){ var row = Math.floor(tt * 1.4), col = Math.floor(dx * 0.8 + (row % 2) * 0.5); if ((tt * 1.4) % 1 < 0.12) return '#8e877a'; return hash(col, row, i + 7) < 0.3 ? '#bfb6a4' : '#cfc6b2'; },
    function(dx, dy, tt){ return (tt * 2.4 | 0) % 2 ? '#b8482e' : '#a63e28'; }, '#4a2e1c');
  var wx = cx + W / 2 + 0.9, R = 3.2; box(B, wx, t.y + 0.5, 2, t.d, R * 2 - 0.4, function(dx, dy, tt){ var dz = tt - R + 0.6, r = Math.hypot(dy, dz);   // the wheel turns side on, in the race
    if (tt < 0.2) return Math.abs(dy) < t.d / 2 - 0.2 && Math.abs(dx) < 0.9 ? (vn(dy, dx, 3) > 0.5 ? '#7cc0e4' : '#3a82b8') : null;
    if (Math.abs(dx) > 0.5 || r > R) return null; if (r < 0.4) return '#3a2a1e'; if (r > R - 0.35) return Math.abs(dx) > 0.3 ? '#5a3a24' : null;
    var a = Math.atan2(dz, dy), sp = ((a / (Math.PI / 6)) % 1 + 1) % 1; if (r > R - 1 && sp < 0.2) return '#7a5234'; return Math.abs(dx) > 0.3 && (sp < 0.07 || sp > 0.93) ? '#6a4a2e' : null; }, 0.125); };
// the windmill on its hill: a white tapering tower, a red cap, four lattice sails facing the camera
BUILD.cluWindmill = function(B, t, i){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var r = Math.hypot(dx, dy), H = 10;
  if (tt < H){ var R0 = 2.6 - tt * 0.1; if (r > R0) return null; if (dy > R0 - 0.3 && Math.abs(dx) < 0.7 && tt < 2.2) return '#4a2e1c'; if (dy > R0 - 0.3 && Math.abs(dx) < 0.45 && Math.abs(tt - 6) < 0.5) return '#9fd0e8'; return (tt * 1.6 | 0) % 2 ? '#f6f3ea' : '#e8e2d2'; }
  if (tt < H + 2 && Math.hypot(dx, dy, (tt - H) * 1.1) < 2.1) return Math.floor(dx * 1.5 + 9) % 2 ? '#8a3a2a' : '#7a3222';
  if (Math.abs(dy - 2.2) > 0.15) return null; var uz = tt - H - 0.9, rr = Math.hypot(dx, uz); if (rr < 0.35) return '#3a2a1e'; if (rr > 5.6) return null;
  var an = Math.atan2(uz, dx) - 0.4 - i, k = Math.round(an / (Math.PI / 2)), da = an - k * Math.PI / 2, along = rr * Math.cos(da), across = rr * Math.sin(da);
  if (Math.abs(across) < 0.14) return '#5a3a24'; if (along > 1 && across > 0 && across < 1){ return (along * 1.6) % 1 < 0.15 || (across * 3) % 1 < 0.25 ? '#6a4a2e' : '#f4efe2'; } return null; }, 0.125); };
// the big clubhouse at the eighteenth: two floors of windows, a green roof, a clock in the gable, the club flag
BUILD.cluClub = function(B, t, i){ var W = t.w - 1, D = t.d - 1;
  gable(B, t.x, t.y, W, D, 7.4, 3.2, function(dx, dy, tt){ var wq = ((dx + W / 2) % 2.2 + 2.2) % 2.2;
    if (dy > D / 2 - 0.3 && wq > 0.6 && wq < 1.6 && Math.abs(dx) > 1.4 && ((tt > 1.6 && tt < 3.6) || (tt > 5 && tt < 6.6))) return Math.abs(wq - 1.1) < 0.08 || Math.abs(tt - 2.6) < 0.08 ? '#ffffff' : '#9fd0e8';
    if (Math.abs(tt - 4.4) < 0.15) return '#1f4a2c'; return tt < 0.5 ? '#cfc8b6' : (tt * 1.6 | 0) % 2 ? '#f8f5ee' : '#ece7da'; },
    function(dx, dy, tt){ if (Math.abs(dx) < 1.4 && dy > 0 && tt < 9.4){ var cr = Math.hypot(dx, tt - 8.6); if (cr < 0.75) return cr < 0.6 ? '#fbf6e6' : '#1f4a2c'; return '#f4f1ea'; } return (tt * 2 | 0) % 2 ? '#2f6b3e' : '#2a6038'; }, '#2f5d3a');
  box(B, t.x + W / 2 + 0.2, t.y + D / 2, 2.2, 0.6, t.h, function(dx, dy, tt){ if (Math.hypot(dx + 0.9, dy) < 0.12 && tt < t.h - 0.1) return '#f4f4f4'; if (dx > -0.85 && dx < 1 && Math.abs(dy) < 0.06 && tt > t.h - 1.6 && tt < t.h - 0.3) return tt < t.h - 0.95 ? '#f1d04a' : '#2f6b3e'; return null; }, 0.125); };
// a grandstand, back row highest, every seat taken, the club's banner along the top
BUILD.cluStand = function(B, t, i){ var CR = ['#e53935', '#1e88e5', '#ffffff', '#ffd23f', '#43a047', '#ff8a3c', '#1d2a44', '#f48fb1'], rows = 5, rh = 1;
  box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var hw = t.w / 2, hd = t.d / 2;
    if (dy < -hd + 0.4 && tt > rows * rh + 1 && tt < rows * rh + 2.2) return Math.abs(dx) < hw - 0.3 ? (Math.floor(dx * 0.6 + 9) % 2 ? '#2f6b3e' : '#f4f1ea') : null;
    if (Math.abs(Math.abs(dx) - hw + 0.2) < 0.2 && dy < -hd + 0.4 && tt < rows * rh + 2.2) return '#1d2a44';
    var row = Math.floor((hd - dy) / (t.d / rows)), top = (row + 1) * rh; if (row < 0 || row >= rows) return null;
    if (tt < top - 0.15) return Math.abs(dx) > hw - 0.3 ? '#1d2a44' : '#2a3a5a';
    if (tt < top + 0.9 && ((Math.floor(dx * 1.4 + 30) + row) % 3) !== 0 && Math.abs(dx) < hw - 0.4){ var kk = hash(Math.floor(dx * 1.4 + 30), row, i); return tt > top + 0.62 ? (kk < 0.5 ? '#6a4a30' : '#e8c8a0') : CR[Math.floor(kk * CR.length)]; }
    return null; }); };
// the terrace: tables under striped umbrellas on a paved floor
BUILD.cluTerrace = function(B, t, i){ var cols = ['#d8433a', '#2f6b3e', '#f1d04a', '#1e5aa8']; box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){
  for (var k = 0; k < 3; k++){ var ux = dx - (k - 1) * 3, uy = dy - (k % 2 ? 0.8 : -0.6), r = Math.hypot(ux, uy), col = cols[(i + k) % 4];
    if (r < 0.1 && tt < 4.4) return '#e8e8e2'; if (tt > 3.6 && tt < 4.6){ var cap = 1.5 * (1 - (tt - 3.6)); if (r < cap && r > cap - 0.3) return Math.floor((Math.atan2(uy, ux) + 4) * 2.55) % 2 ? col : '#ffffff'; }
    if (Math.abs(tt - 1.4) < 0.1 && r < 0.8) return '#f4f4f0'; if (r > 1.1 && r < 1.4 && tt < 0.9 && Math.floor((Math.atan2(uy, ux) + 4) * 1.3) % 2) return '#7a5a3e'; }
  if (tt < 0.15 && Math.abs(dx) < t.w / 2 && Math.abs(dy) < t.d / 2) return ((dx + 9) % 1.5 < 0.1 || (dy + 9) % 1.5 < 0.1) ? '#a89878' : '#c8b89a'; return null; }, 0.125); };
// the club's flags in a row
BUILD.cluFlags = function(B, t, i){ var C2 = ['#2f6b3e', '#d8433a', '#1e5aa8', '#f1d04a']; box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){
  for (var k = 0; k < 4; k++){ var px = dx + t.w / 2 - 1 - k * 2.2; if (Math.hypot(px, dy) < 0.12 && tt < t.h - 0.2) return tt > t.h - 0.4 ? '#d8b23a' : '#f4f4f4';
    if (px > 0.05 && px < 1.9 && Math.abs(dy) < 0.06 && tt > t.h - 1.9 - px * 0.08 && tt < t.h - 0.5 - px * 0.08) return C2[(k + i) % 4]; } return null; }, 0.125); };
LMSIZE.cluCars = [14, 9, 3.2]; LMSIZE.cluShop = [8, 6, 9]; LMSIZE.cluBays = [12, 4.5, 6]; LMSIZE.cluTarget = [7, 6, 6]; LMSIZE.cluYard = [3, 1, 5]; LMSIZE.cluBunker = [7, 5, 1];
LMSIZE.cluCart = [4, 2.4, 3.5]; LMSIZE.cluHut = [6, 5, 8]; LMSIZE.cluGate = [10, 1.2, 3]; LMSIZE.cluMill = [12, 7, 10]; LMSIZE.cluWindmill = [12, 6, 17];
LMSIZE.cluClub = [14, 8, 12]; LMSIZE.cluStand = [11, 5, 8]; LMSIZE.cluTerrace = [10, 5, 5]; LMSIZE.cluFlags = [9, 1.5, 11];
/* SCHOOLYARD'S STOPS ON THE WALK. Its holes go front steps, playground, courtyard, garden, sports field (land.js), and
   the walks go the same way: the bus loop's blacktop and the school's front, wood chips and the climbing fort, pavers
   between the classroom wings, the creek and the greenhouse, the track and the bleachers. Each landmark is drawn as
   its hole twin is, in the hole's own feet, and scaled up to the walk (sch() below). */
KIT['school~steps'] = kitFrom(KIT.school, { gpat:'schlawn', lm:['schFront', 'schBus', 'schFlag', 'schFront'], nlm:3, low:['bush', 'bush', 'rock'], dens:0.85 });
KIT['school~play'] = kitFrom(KIT.school, { gpat:'schchips', p:['#ac7843', '#b8844c', '#9e6e3c'], lm:['schFort', 'swings', 'schMerry', 'schFort', 'slide', 'schCourt'], nlm:4, dens:0.55, low:['bush', 'bush', 'rock'], haz:null,
  wall:['#8a8f99', '#5c6068'] });
KIT['school~halls'] = kitFrom(KIT.school, { gpat:'schpave', p:['#cfc8ba', '#d6d0c2', '#a8a294'], paved:true, lm:['schWing', 'schTables', 'schCanopy', 'schWing', 'lamps'], nlm:4, dens:0.55, low:['bush', 'bushf', 'bush'], haz:null });
KIT['school~garden'] = kitFrom(KIT.school, { gpat:'schmeadow', p:['#c8bca4', '#d2c6ae', '#b8ac94'], lm:['schGreenhouse', 'schBeds', 'schSunflowers', 'schBeds'], nlm:4, dens:0.8, tree:['broad', 'broad', 'broad', 'pine'],
  low:['bushf', 'fern', 'bush', 'rock'], haz:'water', hazC:['#3f94b4', '#8acfe0'], waterC:['#3f94b4', '#8acfe0'] });
KIT['school~field'] = kitFrom(KIT.school, { gpat:'schturf', p:['#b4553c', '#bc5e44', '#a84e36'], lm:['schBleachers', 'schScoreboard', 'schGoal', 'schFloods'], nlm:4, dens:0.25, low:['bush', 'cone', 'bush', 'rock'], haz:null });
LIFE_AS['school~garden'] = { fly:['song', 3], mote:[['butter', 16], ['petal', 6]] };
LIFE_AS['school~field'] = { fly:['crow', 3], mote:['leaf', 8] };
LIFE_AS['school~halls'] = { fly:['song', 2], mote:['leaf', 10] };

// the stops' ground on the walk, each in smooth patches (vn), never a hashed speckle
GPAT.schlawn = function(c){ var a = vn(c.ti * 0.05, c.tj * 0.05, 31); return a > 0.7 ? '#5f9e45' : Math.floor(c.tj / 24) % 2 ? '#72b255' : '#68a84c'; };
GPAT.schchips = function(c){ var a = vn(c.ti * 0.02, c.tj * 0.02, 32), b = vn(c.ti * 0.17, c.tj * 0.17, 33);   // grass, and the wood chip beds the equipment stands in
  if (a > 0.6) return a < 0.63 ? '#6e4c2c' : b > 0.62 ? '#c08c52' : b < 0.3 ? '#9a6a3a' : '#ac7843'; var g = vn(c.ti * 0.05, c.tj * 0.05, 34); return g > 0.68 ? '#5f9e45' : g < 0.3 ? '#76b658' : '#6aaa4f'; };
GPAT.schpave = function(c){ var a = vn(c.ti * 0.012, c.tj * 0.012, 35);   // pavers two feet square, with beds of lawn between the walks
  if (a > 0.62){ var g = vn(c.ti * 0.05, c.tj * 0.05, 36); return g > 0.7 ? '#5f9e45' : Math.floor(c.tj / 24) % 2 ? '#72b255' : '#68a84c'; }
  if (c.ti % 16 === 0 || c.tj % 16 === 0) return '#a8a294'; var n = vn((c.ti >> 4) * 0.45, (c.tj >> 4) * 0.45, 37); return n > 0.68 ? '#c2b8a6' : n < 0.3 ? '#d8d2c6' : '#cdc6b8'; };
GPAT.schmeadow = function(c){ var a = vn(c.ti * 0.05, c.tj * 0.05, 38), b = vn(c.ti * 0.14, c.tj * 0.14, 39); return a > 0.7 ? '#5a9a44' : b > 0.7 ? '#7cbc5c' : a < 0.25 ? '#72b255' : '#68a84c'; };
GPAT.schturf = function(c){ var a = vn(c.ti * 0.045, c.tj * 0.045, 40); return a > 0.72 ? '#5f9e45' : Math.floor(c.ti / 32) % 2 ? '#6eae52' : '#64a449'; };

// a landmark drawn in its hole's feet (dx, dy from its middle, t up), s times the size on the walk
function sch(B, t, s, w, d, h, fn){ box(B, t.x, t.y, w * s, d * s, h * s, function(dx, dy, tt){ return tt < -0.05 ? null : fn(dx / s, dy / s, tt / s); }, 0.125); }
function schBrickW(u, t){ var row = Math.floor(t * 4), cu = u * 2 + (row % 2) * 0.5, col = Math.floor(cu);
  if (t * 4 - row < 0.2 || cu - col < 0.09) return '#c9b49c'; var n = vn(col * 0.37, row * 0.41, 7); return n > 0.66 ? '#9a3624' : n < 0.32 ? '#bd5034' : '#ac422e'; }
function schPaneW(u, tt){ if (Math.abs(u) > 0.4 || tt < 0.1 || tt > 1.45 || Math.abs(u) < 0.035 || Math.abs(tt - 0.95) < 0.04) return '#f2eee4'; return tt > 1.05 ? '#b8dcef' : (u + tt * 0.5 > 0.35 ? '#a6d0e8' : '#6fa4c8'); }

// the school's front, as at the front steps: brick, two floors of windows, the portico over the steps, the cupola and its bell
BUILD.schFront = function(B, t){ var w = 12, d = 4, H = 5.6, pw = 5.2;
  sch(B, t, 1.3, w + 0.2, d + 2.1, H + 3.2, function(dx, dc, tt){ var dy = dc - (2.1 - d) / 2, ax = Math.abs(dx), m, r;
    if (tt > H - 0.15 && ax < 1 && Math.abs(dy + d / 2) < 1){ var cy = dy + d / 2, ct = tt - H + 0.15; m = Math.max(ax, Math.abs(cy));
      if (ct < 1.1){ if (m > 0.8) return null; r = Math.hypot(dx, ct - 0.58); if (cy > 0.7 && r < 0.36) return r > 0.3 ? '#2a2a30' : (ax < 0.04 && ct > 0.58 && ct < 0.84) || (Math.abs(ct - 0.58) < 0.04 && dx > 0 && dx < 0.18) ? '#1a1a20' : '#fbf8ee'; return '#efe9dc'; }
      if (ct < 1.95){ if (ax > 0.56 && Math.abs(cy) > 0.56 && m < 0.74) return '#f6f2ea'; r = Math.hypot(dx, cy); return ct > 1.2 && ct < 1.85 && r < 0.1 + (1.85 - ct) * 0.36 ? '#e2b33a' : null; }
      if (ct < 2.08) return m < 0.86 ? '#efe9dc' : null; return m < 0.86 * (1 - (ct - 2.08)) ? (ct > 2.95 ? '#e2b33a' : '#c0392b') : null; }
    if (dy > 0){ if (ax > pw / 2) return null; var top = 0.62 - Math.floor(dy / 0.42) * 0.155; if (tt < top) return (dy % 0.42) > 0.34 ? '#b8b2a6' : '#dcd6ca';
      if (dy < 1.55 && tt > 3.55){ if (tt < 3.95) return '#efe9dc'; var pt = 3.95 + 1.05 * (1 - ax / (pw / 2)); return tt < pt ? ((dy > 1.38 && tt < pt - 0.16 && tt > 4.04) ? '#ddd5c8' : '#efe9dc') : null; }
      for (var c = -1.5; c <= 1.5; c++) if (Math.hypot(dx - c * 1.45, dy - 1.15) < 0.2 && tt < 3.55) return '#f6f2ea'; return null; }
    if (ax > w / 2 || dy < -d || tt > H) return null;
    if (tt > H - 0.3){ if (dy > -0.35 || dy < -d + 0.35 || ax > w / 2 - 0.35) return '#d8d0c0'; return tt < H - 0.12 ? '#5c6068' : null; }
    if (dy > -0.12){ if (ax < 0.95 && tt < 2.35) return ax < 0.05 ? '#1c3450' : '#2b5a8a'; if (Math.abs(tt - 2.95) < 0.12 || tt < 0.45) return '#d0c8b8';
      var fl = tt > 0.9 && tt < 2.45 ? 1 : tt > 3.45 && tt < 5 ? 2 : 0, u = ((dx + 100.85) % 1.7) - 0.85;
      if (fl && Math.abs(u) < 0.42 && !(fl === 1 && ax < pw / 2 + 0.2) && ax < w / 2 - 0.6) return schPaneW(u, tt - (fl === 1 ? 0.9 : 3.45)); }
    return schBrickW(dx + dy, tt); }); };
// the yellow bus parked at the kerb, nose east
BUILD.schBus = function(B, t){ var Lb = 7.6, Wb = 1.1;
  sch(B, t, 1.4, Lb + 0.2, 2 * Wb + 0.2, 3, function(u, dy, tt){ var ay = Math.abs(dy), front = u > Lb / 2 - 1.3, w1 = Math.hypot(u - 2.3, tt - 0.4), w2 = Math.hypot(u + 2.2, tt - 0.4);
    if (tt < 0.8 && ay > Wb - 0.38 && (w1 < 0.4 || w2 < 0.4)) return w1 < 0.16 || w2 < 0.16 ? '#8a8f99' : '#1c1c20';
    if (tt < 0.35 || ay > Wb || Math.abs(u) > Lb / 2 || (front && tt > 1.75) || tt > 2.9) return null;
    if (tt > 2.76) return ay < Wb - 0.12 ? '#f2f2ea' : '#e8a818'; if (front && u > Lb / 2 - 0.14 && tt > 0.5 && tt < 1.25) return ay > 0.6 && tt > 0.9 ? '#fff4c0' : '#2a2a30';
    if (Math.abs(tt - 1.35) < 0.05 || Math.abs(tt - 0.95) < 0.05 || tt < 0.5) return '#1c1c20';
    if (!front && tt > 1.75 && tt < 2.55){ if (u > Lb / 2 - 1.45) return '#9cc8e0'; if (((u + 20) % 0.95) > 0.13 && u > -Lb / 2 + 0.3) return tt > 2.32 ? '#9cc8e0' : '#2e4a62'; }
    return '#f2b01e'; }); };
// the flagpole and the school's navy and gold flag
BUILD.schFlag = function(B, t){ var H = 7.2;
  sch(B, t, 1.4, 2.4, 0.8, H + 0.4, function(dx, dy, tt){ dx += 1.0;
    if (tt < 0.35) return Math.max(Math.abs(dx), Math.abs(dy)) < 0.38 ? '#c8c0b0' : null; if (Math.hypot(dx, dy, tt - H - 0.1) < 0.14) return '#e2b33a';
    if (Math.hypot(dx, dy) < 0.08 && tt < H) return '#d8dce2'; var v = (tt - (H - 1.35)) / 1.2;
    if (dx > 0.06 && dx < 2.05 && v > 0 && v < 1 && Math.abs(dy - Math.sin(dx * 2.6) * 0.07 * dx) < 0.07) return dx < 0.3 ? '#f2eee4' : v > 0.36 && v < 0.64 ? '#f2c230' : '#24447e'; return null; }); };
// the climbing fort with its red and yellow roof and the slide
BUILD.schFort = function(B, t){ var dk = 2.3;
  sch(B, t, 1.5, 6.3, 2.8, 5.4, function(dx, dy, tt){ dx -= 0.55; var ax = Math.abs(dx + 0.6), ay = Math.abs(dy), m = Math.max(ax, ay);
    if (ax > 1.05 && ax < 1.25 && ay > 1.05 && ay < 1.25 && tt < 4.25) return '#2b6a95'; if (m < 1.25 && tt > dk - 0.14 && tt < dk) return '#c8964e';
    if (m < 1.25 && m > 1.1 && tt >= dk && tt < dk + 0.95){ if (dy > 1.1 && ax < 0.9) return Math.hypot(dx + 0.6, tt - dk - 0.5) < 0.28 ? null : '#e53935'; if (dx > 0.4 && ay < 0.5) return null; return (tt > dk + 0.82 || (((dx + dy) * 4 + 40) | 0) % 2 === 0) ? '#ffd23f' : null; }
    if (tt > 4.2 && tt < 5.35 && m < 1.45 * (1 - (tt - 4.2) / 1.15)) return ((dx + 0.6 > 0) !== (dy > 0)) ? '#e53935' : '#ffd23f';
    var sx = dx - 0.65; if (sx > 0 && sx < 3 && ay < 0.5){ var st = dk - 0.1 - sx * (dk - 0.4) / 3; if (tt < st + 0.06 && tt > st - 0.14) return ay > 0.4 ? '#f0a400' : '#ffd23f'; if (ay > 0.4 && tt < st + 0.28 && tt > st) return '#f0a400'; if (sx > 2.6 && tt < st && ay < 0.12) return '#8a8f99'; }
    if (dx < -1.8 && dx > -2.3){ if (ay > 0.38 && ay < 0.5 && tt < dk + 0.9) return '#8a8f99'; if (ay < 0.4 && ((tt + 0.1) % 0.42) < 0.07 && tt < dk) return '#c9ccd2'; }
    return null; }); };
BUILD.schMerry = function(B, t){ sch(B, t, 1.6, 2.4, 2.4, 1.05, function(dx, dy, tt){ var r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
  if (tt < 0.18) return r < 0.25 ? '#6a6e76' : null; if (tt < 0.32) return r < 1.12 ? (r > 1.02 ? '#c9ccd2' : ['#e53935', '#ffd23f', '#2b6a95', '#3f9a46'][Math.floor((a + Math.PI) / (Math.PI / 2)) % 4]) : null;
  if (r < 0.08) return tt < 0.95 ? '#c9ccd2' : null; var q = Math.round(a / (Math.PI / 2)) * (Math.PI / 2);
  return Math.abs(Math.sin(a - q)) * r < 0.06 && r < 0.98 && r > 0.08 && Math.abs(tt - (0.32 + 0.6 * Math.sin(r / 0.98 * Math.PI))) < 0.08 ? '#c9ccd2' : null; }); };
// the dodgeball court on its blacktop, its lines, and two balls left on it
BUILD.schCourt = function(B, t){ box(B, t.x, t.y, t.w, t.d, 1.2, function(dx, dy, tt){ var ax = Math.abs(dx), ay = Math.abs(dy);
  for (var k = 0; k < 2; k++){ var bx = k ? 1.8 : -2.2, by = k ? 1.4 : -0.8; if (Math.hypot(dx - bx, dy - by, tt - 0.55) < 0.5) return tt > 0.75 && dx < bx ? '#ff8a7a' : '#de3a2e'; }
  if (tt > 0.08 || ax > t.w / 2 || ay > t.d / 2) return null; if (ax > t.w / 2 - 0.5 || ay > t.d / 2 - 0.5) return '#4e525a';
  if (ax > t.w / 2 - 0.68 || ay > t.d / 2 - 0.68 || Math.abs(dx) < 0.1 || Math.abs(Math.hypot(dx, dy) - 1.5) < 0.1) return '#f2f2ea'; return '#3f7f8a'; }, 0.125); };
// a classroom wing: coloured doors and their numbers, lockers, a lamp by each door, the windows upstairs
BUILD.schWing = function(B, t){ var w = 14, d = 3.4, H = 6.2, DOOR = ['#c0392b', '#2b6a95', '#3f8a4e', '#e2a52a'];
  sch(B, t, 1.3, w, d + 0.22, H, function(dx, dc, tt){ var dy = dc - (0.22 - d) / 2, k = Math.floor((dx + 2.25) / 4.5), u = dx - k * 4.5;
    if (dy > 0){ if (Math.abs(u - 0.85) < 0.11 && tt > 1.98 && tt < 2.36 && Math.abs(dx) < w / 2 - 1) return tt > 2.28 || tt < 2.04 ? '#2a2a30' : '#ffe6a0'; return null; }
    if (tt > H - 0.3){ if (dy > -0.35 || dy < -d + 0.35 || Math.abs(dx) > w / 2 - 0.35) return '#d8d0c0'; return tt < H - 0.12 ? '#5c6068' : null; }
    if (dy > -0.12 && Math.abs(dx) < w / 2 - 0.5){
      if (tt < 2.5){ if (Math.abs(u) < 0.6 && tt < 2.12){ if (Math.abs(u) > 0.53 || tt > 2.05) return '#e8e2d4'; if (Math.abs(u - 0.16) < 0.15 && tt > 1.2 && tt < 1.85) return '#9cc8e0'; return DOOR[((k % 4) + 4) % 4]; }
        if (Math.abs(u) < 0.7 && tt > 2.18 && tt < 2.42) return Math.abs(u) < 0.28 ? '#f6f2ea' : '#d0c8b8';
        if (Math.abs(u) > 0.8 && Math.abs(u) < 2.05 && tt > 0.15 && tt < 1.95){ var lu = ((u + 9) % 0.42); if (lu < 0.05 || tt < 0.2) return '#22406a'; return '#3a6ea8'; } }
      if (Math.abs(tt - 2.75) < 0.12) return '#d0c8b8';
      if (tt > 3.25 && tt < 4.75){ var uu = ((dx + 100.85) % 1.7) - 0.85; if (Math.abs(uu) < 0.42) return schPaneW(uu, tt - 3.25); } }
    return schBrickW(dx + dy, tt); }); };
// a covered walkway: a green tin roof on white posts
BUILD.schCanopy = function(B, t){ sch(B, t, 1.3, 2.6, 10, 3.05, function(dx, dy, tt){ var ax = Math.abs(dx);
  if (tt > 2.8) return ((dy + 99) % 0.34) < 0.06 ? '#2f6448' : '#3f7a5a'; if (Math.abs(ax - 1) < 0.1 && ((dy + 5.2) % 3) < 0.2) return '#efe9dc'; return null; }); };
// two picnic tables, green steel
BUILD.schTables = function(B, t){ sch(B, t, 1.4, 3.6, 1.9, 0.9, function(dx, dy, tt){ var x = Math.abs(dx) - 0.95, ax = Math.abs(x), ay = Math.abs(dy);
  if (ax < 0.85 && ay < 0.38 && tt > 0.72 && tt < 0.84) return '#3f8a5a'; if (ax < 0.85 && ay > 0.55 && ay < 0.8 && tt > 0.4 && tt < 0.5) return '#3f8a5a';
  if (Math.abs(ax - 0.65) < 0.06 && Math.abs(ay - Math.max(0, 0.75 - tt * 0.6)) < 0.07 && tt < 0.8) return '#2f6448'; return null; }); };
// the greenhouse: a brick base, white glazing bars, the plants green low inside, a glass roof
BUILD.schGreenhouse = function(B, t){ var w = 5.8, d = 3.4, wh = 2.2, rh = 1.3;
  sch(B, t, 1.5, w, d, wh + rh, function(dx, dy, tt){ var ax = Math.abs(dx), ay = Math.abs(dy); if (ax > w / 2 || ay > d / 2) return null;
    if (tt > wh){ var rr = (tt - wh) / rh; if (rr > 1 || ay > (d / 2) * (1 - rr)) return null; return (((dx + 50) % 0.7) < 0.08|| rr < 0.07 || rr > 0.93) ? '#e2e4dc' : (vn(dx * 0.9, rr * 3, 4) > 0.6 ? '#6aa8a2' : '#558f8a'); }
    if (tt < 0.45) return schBrickW(dx + dy, tt); if (dy > d / 2 - 0.12 && ax < 0.45 && tt < 1.95) return ax > 0.4 || tt > 1.9 ? '#f2f2ea' : '#9ccfc6';
    if (((dx + 50) % 0.7) < 0.07 || ((dy + 50) % 0.7) < 0.07 || Math.abs(tt - 1.3) < 0.04 || tt > wh - 0.07) return '#f2f2ea';
    return tt < 1.1 ? (vn(dx * 1.4, tt * 2, 5) > 0.5 ? '#5f9e6a' : '#76b27e') : (tt > 1.75 ? '#a8dcd4' : '#8ccac2'); }); };
// two raised beds side by side: lettuces in one, tomatoes on canes in the other
BUILD.schBeds = function(B, t, i){ sch(B, t, 1.4, 6.8, 1.6, 1.5, function(dx, dy, tt){ var side = dx < 0 ? 0 : 1, k = (side + i) % 3, bx = dx - (side ? 1.7 : -1.7), ax = Math.abs(bx), ay = Math.abs(dy);
  if (ax > 1.55 || ay > 0.7) return null; if (ax > 1.42 || ay > 0.57) return tt < 0.45 ? (tt > 0.38 ? '#8a6436' : '#a8783e') : null; if (tt < 0.38) return '#4a3424';
  var cx = Math.round((bx + 1.05) / 0.52) * 0.52 - 1.05, ry = dy > 0 ? 0.27 : -0.27, d0 = Math.hypot(bx - cx, dy - ry);
  if (k === 1){ if (d0 < 0.05 && tt < 1.45) return '#b89a64'; if (d0 < 0.2 && tt > 0.6 && tt < 1.4) return vn(bx * 6, tt * 6, 3) > 0.72 ? '#e53935' : '#3f8a3e'; return null; }
  var bump = Math.hypot((bx - cx) / 0.22, (dy - ry) / 0.22, (tt - 0.42) / (k === 2 ? 0.42 : 0.28)); if (bump > 1) return null;
  if (k === 2) return tt > 0.62 ? ['#f48fb1', '#ffd23f', '#ffffff', '#b39ddb'][Math.floor((bx + 2) / 0.52) % 4] : '#3f8a3e'; return tt > 0.55 ? '#9ad05a' : '#6ab04a'; }); };
BUILD.schSunflowers = function(B, t, i){ var F = []; for (var k = 0; k < 4; k++) F.push([(hash(k, i, 1) - 0.5) * 1.6, (hash(k, i, 2) - 0.5) * 0.8, 2.3 + hash(k, i, 3) * 0.9]);
  sch(B, t, 1.4, 2.6, 1.8, 3.6, function(dx, dy, tt){ for (var k = 0; k < F.length; k++){ var f = F[k], x = dx - f[0], y = dy - f[1], dh = Math.hypot(x, tt - f[2]);
    if (Math.abs(y - 0.12) < 0.07 && dh < 0.46) return dh < 0.2 ? '#6a4024' : '#ffc61a'; if (Math.hypot(x, y) < 0.07 && tt < f[2]) return '#4f8a2e';
    if (Math.abs(tt - f[2] * 0.55) < 0.06 && Math.abs(y) < 0.09 && Math.abs(x) < 0.32) return '#3f8a3e'; } return null; }); };
// the bleachers: five tiers of aluminium seats rising to the back, a rail along the top
BUILD.schBleachers = function(B, t){ var n = 5, td = 0.62, tr = 0.5, d = n * td, w = 9;
  sch(B, t, 1.4, w, d, n * tr + 1.1, function(dx, dy, tt){ var ax = Math.abs(dx), back = d / 2 - dy, k = Math.floor(back / td);
    if (ax > w / 2 - 0.08) return tt < (k + 1) * tr ? '#6a6e76' : null; if (k >= n || k < 0) return null;
    if (k === n - 1 && tt > n * tr && tt < n * tr + 1 && (tt > n * tr + 0.9 || ((dx + 99) % 1.8) < 0.1) && back > d - 0.14) return '#8a8f99';
    var top = (k + 1) * tr; if (tt > top) return null; if (tt > top - 0.1) return (back % td) > td - 0.1 ? '#a8adb5' : '#d8dce2'; return '#5a5e66'; }); };
// the scoreboard: HOME and GUEST lit in amber, the clock between, the school's colours on top
BUILD.schScoreboard = function(B, t){ var b0 = 3.6;
  sch(B, t, 1.5, 5.8, 0.6, b0 + 2.5, function(dx, dy, tt){ var ax = Math.abs(dx);
    if (tt < b0) return Math.abs(ax - 1.9) < 0.14 && Math.abs(dy) < 0.14 ? '#5c6068' : null; if (ax > 2.8) return null;
    if (tt > b0 + 2.05) return tt > b0 + 2.4 ? null : ax > 2.7 ? '#24447e' : '#f2c230';
    if (dy < 0.18 || ax > 2.65 || tt < b0 + 0.15 || tt > b0 + 1.95) return '#24447e'; if (tt > b0 + 1.45) return ax > 1.1 && ax < 2.5 ? '#f2f2ea' : '#24447e';
    var u = ax - 1.8, v = tt - b0 - 0.75; if (Math.abs(u) < 0.62 && Math.abs(v) < 0.55) return (Math.abs(Math.abs(u) - 0.2) < 0.07 && Math.abs(v) < 0.45) || (Math.abs(Math.abs(v) - 0.42) < 0.07 && Math.abs(u) < 0.2) ? '#ffc23a' : '#1c2a24';
    if (ax < 0.7 && Math.abs(v - 0.15) < 0.35) return Math.abs(v - 0.15) < 0.07 && ax < 0.5 ? '#ffc23a' : '#1c2a24'; return '#24447e'; }); };
// a football goal: white posts and bar, the net sloping back
BUILD.schGoal = function(B, t){ var gw = 2.4, gh = 1.6, gd = 1.2;
  sch(B, t, 1.6, 2 * gw + 0.2, gd + 0.2, gh + 0.1, function(dx, dc, tt){ var ax = Math.abs(dx), dy = dc - gd / 2 + 0.1;
    if (dy > -0.1 && ((Math.abs(ax - gw) < 0.08 && tt < gh) || (Math.abs(tt - gh) < 0.08 && ax < gw))) return '#f6f6f0';
    var back = -dy / gd; if (back < 0 || back > 1 || ax > gw) return null; var top = gh * (1 - back * 0.65); if (tt > top) return null;
    if (!(Math.abs(tt - top) < 0.07 || Math.abs(ax - gw) < 0.05)) return null; return (((dx + 99) % 0.24) < 0.05 || ((tt + dy + 99) % 0.24) < 0.05) ? '#e8e8e2' : null; }); };
// a floodlight tower: a grey mast, a bank of lamps at the top facing the field
BUILD.schFloods = function(B, t){ var H = 9; sch(B, t, 1.3, 2, 0.7, H + 0.95, function(dx, dy, tt){
  if (tt < H) return Math.hypot(dx, dy) < 0.14 + (H - tt) * 0.006 ? '#8a8f99' : null;
  if (Math.abs(dx) < 0.95 && Math.abs(dy) < 0.15){ var u = ((dx + 9) % 0.55) - 0.275, v = ((tt - H + 9) % 0.45) - 0.225; return dy > 0.03 && Math.hypot(u, v) < 0.17 ? '#fff6d8' : '#5c6068'; } return null; }); };
LMSIZE.schFront = [16, 8, 11.5]; LMSIZE.schBus = [11, 3.2, 4.2]; LMSIZE.schFlag = [3.4, 1.2, 10.6]; LMSIZE.schFort = [9.5, 4.2, 8.1]; LMSIZE.schMerry = [3.9, 3.9, 1.7];
LMSIZE.schCourt = [10, 7, 1.2]; LMSIZE.schWing = [18.2, 4.7, 8.1]; LMSIZE.schCanopy = [3.4, 13, 4]; LMSIZE.schTables = [5, 2.7, 1.3]; LMSIZE.schGreenhouse = [8.7, 5.1, 5.3];
LMSIZE.schBeds = [9.6, 2.3, 2.1]; LMSIZE.schSunflowers = [3.6, 2.5, 5]; LMSIZE.schBleachers = [12.6, 4.4, 5.1]; LMSIZE.schScoreboard = [8.7, 1, 9.2]; LMSIZE.schGoal = [8, 2.1, 2.7]; LMSIZE.schFloods = [2.6, 1, 13];
/* ---- CANDY WORKS' STOPS ON THE WALK, the same things the holes stand among (land.js): the factory gate's yard and dock,
   the sweet gardens and their fondue fountain, the mixing hall's vats, chutes and cake, the chocolate river's press and
   dipping pots, and the head office under its chimneys. Each walk is planned with its stop's kit. */
KIT['candy~gate'] = kitFrom(KIT.candy, { g:['#f6c3d5', '#fbd4e2', '#efb2c8', 0.2], gpat:'cndfrost', p:['#e2c49a', '#ead0aa', '#c8a878'], paved:true, tree:['cndlolly'],
  low:['cndgum', 'cndgum', 'cndgum', 'cndbox'], haz:null, dens:0.6, nlm:4, lm:['factory', 'cnddock', 'gumballs', 'canes', 'lamps'] });
KIT['candy~garden'] = kitFrom(KIT.candy, { g:['#a8e0bc', '#bdeacd', '#94d3a9', 0.2], gpat:'cndmint', p:['#fbf6ee', '#ffffff', '#ece4d8'], paved:false, tree:['cndlolly', 'broad', 'cndlolly', 'broad'],
  leaves:['#ffa8d0', '#ffc8e2', '#f088b8'], bark:'#f6f1ea', low:['cndbonbon', 'bush', 'cndgum'], haz:'water', hazC:['#5a2a12', '#8a5030'], waterC:['#5a2a12', '#8a5030'], dens:0.95, nlm:3,
  lm:['cndfountain', 'canes', 'cndfountain', 'gumballs'], wall:['#a8e0bc', '#4f9a6a'] });
KIT['candy~mixing'] = kitFrom(KIT.candy, { g:['#f8eef2', '#f2c6d6', '#ddc8d0', 0.2], gpat:'cndtile', p:['#9a9ea6', '#aab0b8', '#7a7e86'], paved:true, tree:['cndvat', 'cndpipe', 'cndvat'],
  low:['cndsack', 'cndbox', 'cndsack'], brk:'crate', haz:'slow', hazC:['#f2dc9a', '#e2c27a'], bogC:['#f2dc9a', '#e2c27a'], dens:0.3, nlm:4, lm:['cndwhisks', 'cndchute', 'cndcake', 'cndwhisks', 'cndchute'], wall:['#ff9cc4', '#5a2a3e'] });
KIT['candy~river'] = kitFrom(KIT.candy, { g:['#e2ac68', '#ecbe80', '#d49a58', 0.2], gpat:'cndcaramel', p:['#ecc070', '#f4d088', '#b8863a'], paved:false, plank:true, tree:['cndlolly', 'cndcane', 'cndlolly'],
  low:['cndkiss', 'cndgum', 'cndkiss'], haz:'water', hazC:['#5a2a12', '#8a5030'], waterC:['#5a2a12', '#8a5030'], dens:0.55, nlm:3, lm:['cndpress', 'cnddip', 'cndpress', 'canes'], wall:['#e0a040', '#8a5a22'] });
KIT['candy~office'] = kitFrom(KIT.candy, { g:['#9fd8b0', '#acdfbb', '#8ccc9f', 0.2], gpat:'cndlawn', p:['#fdf3f7', '#ffffff', '#f4b8d0'], paved:true, tree:['cndlolly', 'cndlolly', 'cndcane'],
  low:['cndpop', 'cndgum', 'cndpop'], haz:null, dens:0.45, nlm:4, lm:['cndoffice', 'cndstack', 'lamps', 'cndstack'], wall:['#ffb3cf', '#c85a8a'] });
LIFE_AS['candy~garden'] = { fly:['song', 2], mote:[['butter', 16], ['petal', 12]] };
LIFE_AS['candy~mixing'] = { mote:[['dust', 24], ['spark', 10]] };
LIFE_AS['candy~river'] = { fly:['song', 4], mote:[['spark', 8], ['petal', 6]] };
LIFE_AS['candy~office'] = { fly:['song', 3], mote:[['spark', 26]] };

// the stops' ground: smooth patches of frosting, mint, caramel and lawn, and the hall's tiles (an eighth of a foot a cell)
function cndPatch(c, sd, cols){ var a = vn(c.ti * 0.045, c.tj * 0.045, sd), b = vn(c.ti * 0.12, c.tj * 0.12, sd + 1); return a > 0.64 ? cols[1] : a < 0.34 ? cols[2] : b > 0.68 ? cols[3] : cols[0]; }
GPAT.cndfrost = function(c){ return cndPatch(c, 51, ['#f6c3d5', '#fbd4e2', '#efb2c8', '#f9cbdc']); };
GPAT.cndmint = function(c){ return cndPatch(c, 53, ['#a8e0bc', '#bdeacd', '#94d3a9', '#b2e4c4']); };
GPAT.cndcaramel = function(c){ return cndPatch(c, 55, ['#e2ac68', '#ecbe80', '#d49a58', '#e8b674']); };
GPAT.cndlawn = function(c){ var st = Math.floor(c.ti / 20) % 2, n = vn(c.ti * 0.05, c.tj * 0.05, 57); return st ? (n > 0.66 ? '#acdfbb' : '#9fd8b0') : (n > 0.66 ? '#98d2a9' : '#8ccc9f'); };
GPAT.cndtile = function(c){ if (c.ti % 16 === 0 || c.tj % 16 === 0) return '#ddc8d0'; var ch = (Math.floor(c.ti / 16) + Math.floor(c.tj / 16)) % 2, w = vn(c.ti * 0.04, c.tj * 0.04, 59) > 0.66;
  return ch ? (w ? '#f0e2e8' : '#f8eef2') : (w ? '#ecbccd' : '#f2c6d6'); };

var CND_GUMS = ['#ff3b7a', '#ffd23f', '#3fbf9a', '#8a5cff', '#ff8a1f'], CND_SWIRL = [['#ff5fa2', '#fff4f8'], ['#ffd23f', '#ff8a1f'], ['#3fbf9a', '#e6fff6'], ['#8a5cff', '#f2e8ff']];
function cndHi(col){ var n = parseInt(col.slice(1), 16); return '#' + ((1 << 24) + (Math.min(255, (n >> 16) + 70) << 16) + (Math.min(255, (n >> 8 & 255) + 70) << 8) + Math.min(255, (n & 255) + 70)).toString(16).slice(1); }
function cndStripe(v){ return ((Math.floor(v) % 2) + 2) % 2 ? '#e8233f' : '#fff6f0'; }
TREEH.cndlolly = [6, 2.5, 2.4]; TREEH.cndcane = [5.5, 1.5, 1.4]; TREEH.cndvat = [5, 1.5, 2.2]; TREEH.cndpipe = [10, 3, 1.6];
BLOCKR.cndlolly = 0.3; BLOCKR.cndcane = 0.3; BLOCKR.cndvat = 1.6; BLOCKR.cndpipe = 1.1;
LOWR.cndgum = 0.8; LOWH.cndgum = 1.1; LOWR.cndbox = 0.8; LOWH.cndbox = 1.5; LOWR.cndbonbon = 0.9; LOWH.cndbonbon = 1; LOWR.cndsack = 0.8; LOWH.cndsack = 1.3; LOWR.cndkiss = 0.8; LOWH.cndkiss = 1.3; LOWR.cndpop = 0.8; LOWH.cndpop = 1;
// a lollipop: a white stick and a swirled disc turned to the camera
BUILD.cndlolly = function(B, t, i){ var x = t.x, y = t.y, zb = B.gz(x, y), H = t.h - t.cr * 0.8, R = t.cr * 0.85, cols = CND_SWIRL[i % 4];
  B.solid(x - R, y - 0.4, zb, x + R, y + 0.4, zb + H + R, function(px, py, pz){ var dx = px - x, dy = py - y, tt = pz - zb; if (tt < H && Math.hypot(dx, dy) < 0.18) return '#f6f1ea';
    var r = Math.hypot(dx, tt - H); if (r > R || Math.abs(dy) > 0.3) return null; if (r > R - 0.2) return cols[0]; return ((Math.atan2(tt - H, dx) + r * 1.6) % 1.2 + 1.2) % 1.2 < 0.6 ? cols[0] : cols[1]; }, 0.125); };
// a candy cane standing like a tree, hooked one way or the other
BUILD.cndcane = function(B, t, i){ var x = t.x, y = t.y, zb = B.gz(x, y), H = t.h - 1, R = 0.9, dir = i % 2 ? 1 : -1;
  B.solid(x - 1.3, y - 0.4, zb, x + 1.3, y + 0.4, zb + H + R + 0.4, function(px, py, pz){ var dx = (px - x) * dir, dy = py - y, tt = pz - zb, d;
    if (tt < H) d = Math.hypot(dx, dy); else { if (Math.atan2(tt - H, dx - R) < -0.1) return null; d = Math.hypot(Math.hypot(dx - R, tt - H) - R, dy); }
    return d < 0.3 ? cndStripe((tt + dx) * 1.4) : null; }, 0.125); };
// a steel vat of batter, its whisk on a shaft from the motor
BUILD.cndvat = function(B, t, i){ var x = t.x, y = t.y, zb = B.gz(x, y), R = 1.8, top = Math.min(t.h, 5.5);
  B.solid(x - R, y - R, zb, x + R, y + R, zb + top + 2.2, function(px, py, pz){ var dx = px - x, dy = py - y, r = Math.hypot(dx, dy), tt = pz - zb;
    if (tt < 3){ if (r > R) return null; if (tt > 2.75) return r > R - 0.25 ? '#e4e8ee' : (i % 2 ? '#f2dc9a' : '#6a3518'); return Math.abs(tt - 1) < 0.12 || Math.abs(tt - 2.1) < 0.12 ? '#8a8e96' : (dx < -0.6 ? '#c8ccd2' : '#b4b8c0'); }
    if (tt > top && tt < top + 1.2) return Math.abs(dx) < 0.7 && Math.abs(dy) < 0.6 ? (tt > top + 1 ? '#e8233f' : '#ff8ab8') : null;
    if (r < 0.15) return '#c8ccd2'; for (var w = 0; w < 3; w++){ var a = w * 1.05 + i, u = dx * Math.cos(a) + dy * Math.sin(a), v = -dx * Math.sin(a) + dy * Math.cos(a);
      if (Math.abs(v) < 0.1 && Math.abs(Math.hypot(u / 0.8, (tt - 3) / 1.3) - 1) < 0.12) return '#dfe3ea'; } return null; }, 0.125); };
// a sugar silo: a tall tank striped pink and white, a cap and a ladder
BUILD.cndpipe = function(B, t, i){ var x = t.x, y = t.y, zb = B.gz(x, y), H = t.h, R = 1.3;
  B.solid(x - R - 0.3, y - R, zb, x + R + 0.3, y + R + 0.3, zb + H + 1, function(px, py, pz){ var dx = px - x, dy = py - y, r = Math.hypot(dx, dy), tt = pz - zb;
    if (tt < 1.2) return Math.abs(Math.abs(dx) - 0.9) < 0.15 && Math.abs(Math.abs(dy) - 0.9) < 0.15 ? '#8a8e96' : null;
    if (dy > R && Math.abs(dx - 0.5) < 0.35 && tt < H){ if (Math.abs(Math.abs(dx - 0.5) - 0.3) < 0.06 || ((tt % 0.6) + 0.6) % 0.6 < 0.08) return '#7a7e86'; return null; }
    if (tt > H){ var rr = R * (1 - (tt - H)); return r < rr ? '#e8233f' : null; } if (r > R) return null;
    return Math.abs(tt - H + 0.3) < 0.15 ? '#fff6f0' : (Math.floor((tt - 1.2) / 1.4) % 2 ? '#ff9cc4' : '#fff4f8'); }, 0.125); };
// the low things: a gumdrop, a box of sweets, a bonbon, a sack of sugar, a chocolate drop, a heap of popping candy
BUILD.cndgum = function(B, t, i){ var x = t.x, y = t.y, zb = B.gz(x, y), r = 0.75, col = CND_GUMS[i % 5], hi = cndHi(col);
  B.solid(x - r, y - r, zb - 0.05, x + r, y + r, zb + r * 1.35, function(px, py, pz){ var tt = (pz - zb) / (r * 1.35), w = r * (1 - tt * tt * 0.8), d = Math.hypot(px - x, py - y); if (d > w) return null; return tt > 0.75 && d < w * 0.7 ? hi : col; }, 0.125); };
BUILD.cndbox = function(B, t, i){ var s = 1.3, col = ['#ff8ab8', '#8fd8f0', '#ffd23f'][i % 3];
  box(B, t.x, t.y, s + 0.1, s + 0.1, s + 0.35, function(dx, dy, tt){ if (tt > s) return Math.abs(dy) < 0.1 && Math.abs(Math.abs(dx) - 0.22) < 0.18 && tt < s + 0.32 ? '#fff6f0' : null;
    if (Math.abs(dx) > s / 2 || Math.abs(dy) > s / 2 || tt < 0) return null; return Math.abs(dx) < 0.12 || Math.abs(dy) < 0.12 ? '#fff6f0' : col; }, 0.125); };
BUILD.cndbonbon = function(B, t, i){ var col = ['#e8233f', '#ffc83a', '#8a5cff', '#3fbf9a'][i % 4], r = 0.55;
  box(B, t.x, t.y, 2.6, 1.2, 1.2, function(dx, dy, tt){ var z = tt - r; if (Math.hypot(dx, dy, z) < r) return z > r * 0.4 && dx < 0 ? cndHi(col) : col;
    var a = Math.abs(dx) - r * 0.8; if (a > 0 && a < 0.75 && Math.hypot(dy, z) < 0.1 + a * 0.45) return a > 0.2 ? '#fff6f0' : col; return null; }, 0.125); };
BUILD.cndsack = function(B, t, i){ box(B, t.x, t.y, 1.6, 1.4, 1.6, function(dx, dy, tt){ var w = 0.7 - Math.max(0, tt - 0.9) * 0.45; if (Math.hypot(dx / w, dy / (w * 0.85)) > 1 || tt > 1.5 || tt < 0) return null;
  if (tt > 1.15 && tt < 1.25) return '#a8323a'; return Math.abs(tt - 0.55) < 0.22 && dy > 0.2 && Math.abs(dx) < 0.35 ? '#ff5fa2' : '#f4ead8'; }, 0.125); };
BUILD.cndkiss = function(B, t, i){ box(B, t.x, t.y, 1.5, 1.5, 1.4, function(dx, dy, tt){ var u = tt / 1.3, w = 0.7 * (u < 0.3 ? 1 : 1 - (u - 0.3) / 0.7 * 0.95); if (tt < 0 || u > 1 || Math.hypot(dx, dy) > w) return null;
  return u > 0.55 && dx < 0 ? '#8a5030' : '#5a2a12'; }, 0.125); };
BUILD.cndpop = function(B, t, i){ var P = ['#ff3b7a', '#3fd0ff', '#ffd23f', '#9a6aff', '#5ae08a'];
  box(B, t.x, t.y, 1.6, 1.6, 1.2, function(dx, dy, tt){ for (var k = 0; k < 4; k++){ var a = k * 1.9 + i, cx = Math.cos(a) * 0.4 * (k ? 1 : 0), cy = Math.sin(a) * 0.3 * (k ? 1 : 0), hh = k ? 0.65 : 1.05, u = tt / hh;
    if (u >= 0 && u < 1 && Math.abs(dx - cx) + Math.abs(dy - cy) < 0.3 * (1 - u * 0.7)){ var col = P[(i + k) % 5]; return u > 0.6 ? cndHi(col) : col; } } return null; }, 0.125); };

/* the landmarks */
// the loading dock: a stretch of the works' pink wall with two roll doors, the dock in front of them, boxes waiting on it
BUILD.cnddock = function(B, t, i){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var hw = t.w / 2;
  if (dy < -1.6){ if (Math.abs(dx) > hw) return null; if (tt > t.h - 0.6) return dy > -1.9 ? '#fff6f0' : '#5a2e14';
    for (var k = -1; k <= 1; k += 2){ var ddx = dx - k * 2.1; if (Math.abs(ddx) < 1.6 && tt < 4.2 && dy > -1.9){ if (Math.abs(ddx) > 1.4 || tt > 4) return '#fff6f0'; return (Math.floor(tt * 3) % 2) ? '#e6dcd6' : '#cfc4be'; } }
    return Math.abs(Math.abs(dx) - hw) < 0.4 ? '#fff6f0' : (Math.floor(tt / 1.2) % 2 ? '#ff9cc4' : '#ff8ab8'); }
  if (dy < 0.6 && tt < 1.3 && Math.abs(dx) < hw - 0.3) return tt > 1.1 ? '#e2c49a' : (Math.floor(dx) % 2 ? '#c8a878' : '#d4b48a');
  var bxs = [[-2.6, -0.6, 0], [-1.3, -0.6, 1], [1.8, -0.4, 2], [-2, -0.6, 1]];
  for (var q = 0; q < 4; q++){ var b = bxs[q], z0 = q === 3 ? 2.4 : 1.3, s = 1.1; if (Math.abs(dx - b[0]) < s / 2 && Math.abs(dy - b[1]) < s / 2 && tt > z0 && tt < z0 + s)
    return Math.abs(dx - b[0]) < 0.1 || Math.abs(dy - b[1]) < 0.1 ? '#fff6f0' : ['#8fd8f0', '#ffd23f', '#ff8ab8'][b[2]]; }
  return null; }, 0.125); };
// the fondue fountain: chocolate in a round pool, a white column, two bowls pouring
BUILD.cndfountain = function(B, t, i){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var r = Math.hypot(dx, dy), a = Math.atan2(dy, dx), choc = (Math.floor(a * 5 + tt) % 2) ? '#7a4422' : '#5e3018';
  if (tt < 0.8){ if (r > 3.3) return null; if (r > 2.95) return '#f4e6d0'; return tt < 0.55 ? (vn(dx * 1.2, dy * 1.2, i) > 0.7 ? '#764020' : '#5a2a12') : null; }
  if (r < 0.3) return '#f4e6d0';
  if (tt > 3 && tt < 3.35 && r < 1.8) return r > 1.55 || tt < 3.12 ? '#f4e6d0' : '#5a2a12'; if (tt >= 0.8 && tt <= 3 && r > 1.55 && r < 1.75) return choc;
  if (tt > 4.6 && tt < 4.9 && r < 1) return r > 0.82 || tt < 4.7 ? '#f4e6d0' : '#5a2a12'; if (tt >= 3.35 && tt <= 4.6 && r > 0.82 && r < 1) return choc;
  if (tt >= 4.9 && r < 0.4 * (1 - (tt - 4.9) / 1.2)) return '#7a4422'; return null; }, 0.125); };
// the twin whisks: two vats under a gantry, a motor over each, the whisk down on its shaft
BUILD.cndwhisks = function(B, t, i){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var hw = t.w / 2;
  if (Math.abs(Math.abs(dx) - (hw - 0.3)) < 0.3 && Math.abs(dy + 0.2) < 0.3 && tt < 8.6) return '#e8233f';
  if (tt > 8.2 && tt < 8.9 && Math.abs(dy + 0.2) < 0.4 && Math.abs(dx) < hw) return Math.abs(tt - 8.55) < 0.12 ? (((Math.floor((dx + tt) * 2) % 2) + 2) % 2 ? '#ffd23f' : '#2a2a2a') : '#e8233f';
  for (var k = -1; k <= 1; k += 2){ var vx = dx - k * 2.2, r = Math.hypot(vx, dy);
    if (tt < 3){ if (r > 1.8) continue; if (tt > 2.75) return r > 1.55 ? '#e4e8ee' : (k < 0 ? '#6a3518' : '#f2dc9a'); return Math.abs(tt - 1) < 0.12 || Math.abs(tt - 2.1) < 0.12 ? '#8a8e96' : (vx < -0.6 ? '#c8ccd2' : '#b4b8c0'); }
    if (tt > 7 && tt < 8.2 && Math.abs(vx) < 0.7 && Math.abs(dy + 0.2) < 0.6) return '#ff8ab8';
    if (r < 0.14 && tt < 7) return '#c8ccd2';
    for (var w = 0; w < 3; w++){ var a = w * 1.05 + k, u = vx * Math.cos(a) + dy * Math.sin(a), v = -vx * Math.sin(a) + dy * Math.cos(a); if (Math.abs(v) < 0.1 && Math.abs(Math.hypot(u / 0.8, (tt - 3) / 1.4) - 1) < 0.12) return '#dfe3ea'; } }
  return null; }, 0.125); };
// a chute: a striped hopper on legs, the sweets heaped in it, a spout pouring into a bin
BUILD.cndchute = function(B, t, i){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var r = Math.hypot(dx, dy + 0.3);
  if (tt < 5.5 && Math.abs(Math.abs(dx) - 1.6) < 0.18 && Math.abs(Math.abs(dy + 0.3) - 1.6) < 0.18) return '#8a8e96';
  if (tt > 5.5 && tt < 9){ var rr = 0.5 + (tt - 5.5) * 0.55; if (r < rr && r > rr - 0.25) return Math.floor((tt - 5.5) * 1.3) % 2 ? '#ff8ab8' : '#fff6f0'; if (r < rr && tt > 8.4 && tt < 8.4 + (1 - r / rr) * 0.8) return CND_GUMS[(Math.floor(dx * 3) + Math.floor(dy * 3) * 3 + 50) % 5]; return null; }
  if (tt > 3 && tt <= 5.5 && r < 0.35) return '#c8ccd2';
  if (tt < 1.6){ if (Math.abs(dx) > 1.1 || Math.abs(dy - 0.4) > 0.9) return null; if (tt > 1.2) return CND_GUMS[(Math.floor(dx * 3) + Math.floor(dy * 3) * 3 + 50) % 5]; return Math.abs(Math.abs(dx) - 1.05) < 0.06 ? '#8a8e96' : '#b4b8c0'; }
  return null; }, 0.125); };
// the cake stand: a pink cake in three tiers on a white stand, a cherry on top
BUILD.cndcake = function(B, t, i){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var r = Math.hypot(dx, dy);
  if (tt < 1.4) return r < 0.3 || (tt < 0.25 && r < 1.1) ? '#fff6f0' : null; if (tt < 1.6) return r < 2.3 ? '#fff6f0' : null;
  var T = [[1.6, 3.1, 2], [3.1, 4.4, 1.5], [4.4, 5.5, 1]];
  for (var q = 0; q < 3; q++){ var z = T[q]; if (tt >= z[0] && tt < z[1] && r < z[2]) return tt > z[1] - 0.22 || (Math.abs(tt - z[1] + 0.45) < 0.15 && Math.sin(Math.atan2(dy, dx) * 9) > 0) ? '#fff6f0' : (q % 2 ? '#ffd0e0' : '#ff9cc4'); }
  return Math.hypot(r, tt - 5.85) < 0.38 ? '#e8233f' : null; }, 0.125); };
// the stamping press: a red frame, the head on its piston over a belt of fresh stamped sweets
BUILD.cndpress = function(B, t, i){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var hw = t.w / 2 - 0.2;
  if (tt < 1.6){ if (Math.abs(dx) > hw || Math.abs(dy) > 1.7) return null; return tt > 1.4 ? '#a8acb4' : (Math.abs(tt - 0.7) < 0.12 ? '#ffd23f' : '#8a8e96'); }
  if (tt < 1.85 && Math.abs(dy) < 0.8 && Math.abs(dx) < hw) return (Math.floor(dx * 3) % 2) ? '#3a3e46' : '#2a2e36';
  if (tt < 2.1 && Math.abs(dy) < 0.5){ var cx = ((dx + 30) % 1.4) - 0.7; if (Math.hypot(cx, dy) < 0.42 && dx > 0.3) return '#ff5fa2'; }
  if (Math.abs(Math.abs(dx) - (hw - 0.4)) < 0.4 && Math.abs(dy) < 0.5 && tt < 7.6) return '#e8233f';
  if (tt > 6.6 && tt < 7.8 && Math.abs(dx) < hw && Math.abs(dy) < 0.7) return Math.abs(tt - 7.2) < 0.18 ? (((Math.floor((dx + tt) * 2) % 2) + 2) % 2 ? '#ffd23f' : '#2a2a2a') : '#e8233f';
  if (Math.hypot(dx, dy) < 0.3 && tt > 4 && tt <= 6.6) return '#c8ccd2';
  if (Math.abs(dx) < 1.1 && Math.abs(dy) < 0.8 && tt > 3.1 && tt <= 4) return tt < 3.3 ? '#3a3e46' : '#5a5e66';
  if (tt > 7.8 && tt < 8.4 && Math.hypot(dx, dy) < 0.35) return '#ffb02a'; return null; }, 0.125); };
// the dipping pots: two on their burners, one of dark chocolate and one of white
BUILD.cnddip = function(B, t, i){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ for (var k = -1; k <= 1; k += 2){ var r = Math.hypot(dx - k * 1.5, dy);
    if (tt < 0.6){ if (r < 1) return '#3a3e46'; continue; } if (r > 1.35) continue; if (tt > 2.2) return tt < 2.45 ? (r > 1.15 ? '#e4e8ee' : (k < 0 ? '#5a2a12' : '#f4e6d0')) : null;
    return Math.abs(tt - 1.4) < 0.1 ? '#8a8e96' : '#c8ccd2'; } return null; }, 0.125); };
// the head office: pink, white pilasters, lit windows, a clock over the gold door, a dome and a gold spire
BUILD.cndoffice = function(B, t, i){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var hw = t.w / 2 - 0.4, hd = t.d / 2 - 0.6, H = 9.5, adx = Math.abs(dx);
  if (tt > H){ var r = Math.hypot(dx, dy); if (tt < H + 0.4) return adx < hw + 0.3 && Math.abs(dy) < hd + 0.3 ? '#5a2e14' : null;
    if (Math.hypot(r, (tt - H - 0.4) * 1.1) < 2.1) return Math.abs(Math.sin(Math.atan2(dy, dx) * 4)) < 0.15 ? '#fff6f0' : '#ff8ab8'; if (r < 0.15 && tt < t.h) return '#ffc83a'; return null; }
  if (adx > hw || Math.abs(dy) > hd) return null; var front = dy > hd - 0.3;
  if (front && tt > H - 0.8 - 0.6 * Math.max(0, Math.sin(dx * 1.4 + 1))) return '#fff6f0'; if (tt < 0.6) return '#c85a8a';
  if (Math.abs(adx - hw) < 0.45 || (front && Math.abs(adx - 2) < 0.25)) return '#fff6f0';
  if (front){ if (adx < 1.3 && tt < 3.8) return adx > 1.12 || tt > 3.6 ? '#ffc83a' : '#6a3518';
    var cr = Math.hypot(dx, tt - 6.9); if (cr < 1.15){ if (cr > 0.95) return '#ffc83a'; if ((adx < 0.08 && tt > 6.9 && tt < 7.7) || (Math.abs(tt - 6.9) < 0.08 && dx > 0 && dx < 0.6)) return '#2a1a20'; return '#fffaf2'; }
    if (adx > 2.4){ var wu = ((adx - 2.4) % 2.2) - 1.1; for (var q = 0; q < 2; q++){ var wz = q ? 6.4 : 2.6; if (Math.abs(wu) < 0.55 && Math.abs(tt - wz) < 0.95) return Math.abs(wu) > 0.43 || Math.abs(tt - wz) > 0.82 ? '#fff6f0' : (tt > wz ? '#ffe9a8' : '#ffd77a'); } } }
  return Math.floor(tt / 1.3) % 2 ? '#ffb3cf' : '#ffa6c6'; }); };
// a factory chimney striped red and white, pink smoke puffing out of it
BUILD.cndstack = function(B, t, i){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var r = Math.hypot(dx, dy), H = 12;
  if (tt < H){ if (tt > H - 0.7) return r < 1.55 && r > 1 ? '#5a2e14' : null; return r < 1.2 ? cndStripe(tt / 1.3) : null; }
  var p = Math.min(Math.hypot(dx * 1.1, (tt - 13.2) * 1.2), Math.hypot((dx - 0.6) * 0.9, (tt - 14.8) * 1.1) - 0.2) + (vn(dx * 1.5, tt * 1.5, i) - 0.5) * 0.3; if (p < 1.3 && Math.abs(dy) < 1.2) return tt > 14 ? '#fff4f8' : '#f8c8dc'; return null; }); };
LMSIZE.cnddock = [9, 5, 6.5]; LMSIZE.cndfountain = [7, 7, 6.2]; LMSIZE.cndwhisks = [9, 4, 9]; LMSIZE.cndchute = [5, 5, 9.5]; LMSIZE.cndcake = [5, 5, 6.3];
LMSIZE.cndpress = [7, 4, 8.5]; LMSIZE.cnddip = [6, 3, 2.6]; LMSIZE.cndoffice = [12, 7, 13.5]; LMSIZE.cndstack = [4, 3, 16];
// ---- Neon Arcade's stops on the walk, the same places its holes stand in (land.js): the pavement out front under the marquee,
// the cabinet rows on their carpet with the Neon River, the racing and rhythm games, the prize counter and its claw machines, and the roof
// over the night skyline. Every kit drops the world's grid floor for its own ground.
KIT['neon~front'] = kitFrom(KIT.neon, { g:['#3a3352', '#433c5c', '#2e2844', 0.2], grid:false, gpat:'neopave', p:['#5a5070', '#625878', '#4a4262'], paved:true,
  tree:['neoPalm', 'neoPalm', 'pylon'], low:['neoBollard', 'cone', 'neoBollard'], dens:0.4, neoNoFl:true, nlm:4, lm:['neoMarquee', 'neoBooth', 'sign', 'neoMarquee', 'neoBooth'] });
KIT['neon~floor'] = kitFrom(KIT.neon, { g:['#16123a', '#1c1846', '#100c2c', 0.2], grid:false, gpat:'neocarpet', p:['#6a1a52', '#7a2462', '#4e1040'],
  tree:['cab', 'cab', 'cab', 'pylon'], low:['neoStool', 'neoStool', 'cube'], dens:0.36, neoNoFl:true, haz:'water', hazC:['#2a5ae0', '#2bf0ff'], waterC:['#2a5ae0', '#2bf0ff'],
  nlm:5, lm:['neoCabRow', 'neoPortal', 'neoCabRow', 'neoHockey', 'neoCabRow'] });
KIT['neon~race'] = kitFrom(KIT.neon, { g:['#18142c', '#1e1a36', '#141026', 0.2], grid:false, gpat:'neodeck', p:['#2a2836', '#323040', '#22202c'],
  tree:['neoRacer', 'cab', 'neoRacer', 'pylon'], low:['neoPad', 'neoStool', 'cone'], dens:0.3, neoNoFl:true, nlm:4, lm:['neoGantry', 'neoRacers', 'neoDance', 'neoStart', 'neoRacers'] });
KIT['neon~prize'] = kitFrom(KIT.neon, { g:['#0c0c2a', '#10102e', '#08081e', 0.2], grid:false, gpat:'neomaze', p:['#1a2a8a', '#22339a', '#121e6a'],
  tree:['neoClaw', 'neoClaw', 'cab'], low:['neoGum', 'neoStool', 'cube'], dens:0.3, neoNoFl:true, nlm:4, lm:['neoCounter', 'neoClaws', 'neoCounter', 'neoClaws'] });
KIT['neon~roof'] = kitFrom(KIT.neon, { g:['#211a32', '#26232f', '#1c162c', 0.2], grid:false, gpat:'neotar', p:['#6a5a4a', '#7a6a58', '#4a3e32'], plank:true,
  tree:['neoMast', 'neoMast', 'pylon'], low:['neoAC', 'neoAC', 'neoVent'], dens:0.12, neoNoFl:true, nlm:4, lm:['neoTower', 'neoSign', 'neoTank', 'neoTrophy', 'neoTower'], wall:['#8a84a0', '#3a3248'] });
LIFE_AS['neon~front'] = { fly:['drone', 3], mote:['spark', 26] };
LIFE_AS['neon~floor'] = { fly:['drone', 2], mote:['spark', 44] };
LIFE_AS['neon~race'] = { fly:['drone', 4], mote:['spark', 50] };
LIFE_AS['neon~prize'] = { fly:['drone', 2], mote:[['petal', 22], ['spark', 18]] };   // confetti over the prize counter
LIFE_AS['neon~roof'] = { fly:['bat', 4], mote:[['spark', 12], ['firefly', 10]] };

// the ground of each stop, an eighth of a foot a cell
// the pavement out front: slabs three feet square, purple at night
GPAT.neopave = function(c){ if (c.ti % 24 === 0 || c.tj % 24 === 0) return '#2a2440'; var a = vn(c.ti * 0.03, c.tj * 0.03, 3); return a > 0.64 ? '#433c5c' : a < 0.34 ? '#342e4a' : '#3a3352'; };
// arcade carpet: midnight blue, squiggles of cyan and pink, a yellow ring here and there
GPAT.neocarpet = function(c){ var x = c.ti / 8, y = c.tj / 8, a = vn(x * 0.25, y * 0.25, 2), s1 = Math.abs(Math.sin(x * 0.5 + Math.sin(y * 0.32) * 2.2)), s2 = Math.abs(Math.sin(y * 0.45 + Math.sin(x * 0.3 + 1) * 2.4));
  var gx = Math.floor(x / 3.5), gy = Math.floor(y / 3.5), rr = Math.hypot(x - gx * 3.5 - 1.75, y - gy * 3.5 - 1.75);
  if (s1 < 0.07 && a > 0.55) return '#22b8d0'; if (s2 < 0.07 && a < 0.4) return '#d02ab0'; if (hash(gx, gy, 5) < 0.14 && rr > 0.4 && rr < 0.7) return '#ffe02b';
  return a > 0.6 ? '#1c1846' : '#16123a'; };
// the racing floor: dark rubber with thin violet stripes on the slant
GPAT.neodeck = function(c){ var x = c.ti / 8, y = c.tj / 8, a = vn(x * 0.2, y * 0.2, 4); if (Math.abs(((x + y) % 8 + 8) % 8 - 4) < 0.12) return '#3a2a6a'; return a > 0.62 ? '#1e1a36' : a < 0.34 ? '#141026' : '#18142c'; };
// a maze in blue on the floor, four feet a square, pellets down the lanes
GPAT.neomaze = function(c){ var gi = Math.floor(c.ti / 32), gj = Math.floor(c.tj / 32), li = c.ti - gi * 32, lj = c.tj - gj * 32;
  var e = (hash(gi, gj, 11) < 0.5 && li >= 28) || (hash(gi - 1, gj, 11) < 0.5 && li <= 3), s = (hash(gi, gj, 12) < 0.45 && lj >= 28) || (hash(gi, gj - 1, 12) < 0.45 && lj <= 3);
  if (e || s) return ((e && (li === 28 || li === 29 || li === 2 || li === 3)) || (s && (lj === 28 || lj === 29 || lj === 2 || lj === 3))) ? '#2a3cc0' : '#0a0a24';
  if (Math.abs(li - 16) < 2 && Math.abs(lj - 16) < 2) return '#c8a880'; return vn(c.ti * 0.02, c.tj * 0.02, 6) > 0.62 ? '#10102e' : '#0c0c2a'; };
// the roof: tar in soft patches, a seam every five feet
GPAT.neotar = function(c){ if (c.tj % 40 === 0) return '#1a1426'; var a = vn(c.ti * 0.02, c.tj * 0.02, 7), b = vn(c.ti * 0.07, c.tj * 0.07, 8); return a > 0.68 ? '#2a2240' : a < 0.3 ? '#1c162c' : b > 0.64 ? '#241c38' : '#211a32'; };

var NEO_TFONT = { A:['.#.', '#.#', '###', '#.#', '#.#'], R:['##.', '#.#', '##.', '#.#', '#.#'], C:['.##', '#..', '#..', '#..', '.##'], D:['##.', '#.#', '#.#', '#.#', '##.'], E:['###', '#..', '##.', '#..', '###'],
  P:['##.', '#.#', '##.', '#..', '#..'], I:['###', '.#.', '.#.', '.#.', '###'], Z:['###', '..#', '.#.', '#..', '###'], S:['.##', '#..', '.#.', '..#', '##.'] };
// is this point of a word lit? u across from its left edge, v up from its foot, s one dot
function neoTWord(w, u, v, s){ var i = Math.floor(u / (s * 4)), du = u - i * s * 4; if (u < 0 || i >= w.length || du >= s * 3 || v < 0 || v >= s * 5) return false;
  return NEO_TFONT[w.charAt(i)][4 - Math.floor(v / s)].charAt(Math.floor(du / s)) === '#'; }
var NEO_TGLOW = ['#ff2bd6', '#2bf0ff', '#ffe02b', '#7cff4a', '#ff7a2b', '#a46bff'], NEO_TPLUSH = ['#ff8ab8', '#7ec8ff', '#ffe02b', '#7cff4a', '#ffb02b', '#c8a0ff', '#ffffff'];
TREEH.neoPalm = [9, 3, 3.2]; TREEH.neoRacer = [5, 0.2, 2.2]; TREEH.neoClaw = [6.4, 0.2, 1.8]; TREEH.neoMast = [9, 5, 1.2];
LOWR.neoBollard = 0.5; LOWH.neoBollard = 2.2; LOWR.neoStool = 0.7; LOWH.neoStool = 2.2; LOWR.neoPad = 1.4; LOWH.neoPad = 0.4; LOWR.neoGum = 0.7; LOWH.neoGum = 3;
LOWR.neoAC = 1.4; LOWH.neoAC = 2.4; LOWR.neoVent = 0.6; LOWH.neoVent = 2;

// out front: the arcade's frontage, the doors lit, ARCADE across the marquee in bulbs, neon tubes above
BUILD.neoMarquee = function(B, t, i){ var w2 = t.w / 2 - 0.1, wd = 23 * 0.42;
  box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var ax = Math.abs(dx); if (ax > w2) return null;
    if (tt > 5 && tt < 7.8 && dy < t.d / 2 - 0.1){ if (tt < 5.3 || tt > 7.5) return ((dx * 2 + 40) | 0) % 2 ? '#fff0b0' : '#ffb02b'; return neoTWord('ARCADE', dx + wd / 2, tt - 5.35, 0.42) ? (dy > t.d / 2 - 0.6 ? '#ff2bd6' : '#ff8ae8') : '#1a0f33'; }
    if (dy > t.d / 2 - 1.2) return null; if (tt > 9.6) return '#2bf0ff';
    if (tt > 7.8) return Math.abs(((dx + 40) % 2.5) - 1.25) < 0.15 ? (Math.floor((dx + 40) / 2.5) % 2 ? '#2bf0ff' : '#ff2bd6') : '#221a3a';
    if (tt < 0.4) return '#3a2f55'; var dd = Math.abs(ax - 3.4); if (dd < 1.5 && tt < 4.2){ if (dd > 1.3 || tt > 3.95 || dd < 0.1) return '#ff2bd6'; return '#ffe6c8'; }
    return '#2a2244'; }); };
// the ticket booth: a striped kiosk, a lit window, a striped cone of a roof with a gold knob
BUILD.neoBooth = function(B, t){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){
  if (tt > 4.2){ var r = (tt - 4.2) / 1.6; if (r < 1 && Math.hypot(dx, dy) < 1.9 * (1 - r)) return (Math.floor((Math.atan2(dy, dx) + 4) * 2.5) % 2) ? '#ff2bd6' : '#fff2fa'; if (r >= 1 && Math.hypot(dx, dy) < 0.25) return '#ffe02b'; return null; }
  if (Math.abs(dx) > 1.5 || Math.abs(dy) > 1.4) return null; if (dy > 1.2 && Math.abs(dx) < 1.0 && tt > 2 && tt < 3.6) return Math.abs(dx) > 0.88 || Math.abs(tt - 2.8) < 0.08 ? '#c9a227' : '#ffe9a0';
  if (dy > 1.2 && Math.abs(tt - 1.9) < 0.1) return '#c9a227'; return (Math.floor((dx + 4) * 1.6) % 2) ? '#c8402e' : '#e8d8c0'; }); };
// a neon palm: a dark trunk ringed with light, teal fronds, a planter with a glowing rim
BUILD.neoPalm = function(B, t, i){ var x = t.x, y = t.y, zb = B.gz(x, y), H = t.h, lean = (hash(i, 1, 2) - 0.5) * 2, tx = x + lean, R = t.cr || 3.2, ring = pick(i, ['#ff2bd6', '#2bf0ff', '#a46bff']);
  B.vox(x - R - 2, y - R - 1, zb - 0.1, x + R + 2, y + R + 1, zb + H + 1.5, function(set){
    B.tube(set, x, y, zb, x, y, zb + 1, 1, 1.1, function(u){ return u > 0.85 ? ring : '#2a2440'; });
    for (var s = 0; s < 10; s++){ var u0 = s / 10, u1 = (s + 1) / 10; B.tube(set, x + lean * u0 * u0, y, zb + 1 + (H - 1) * u0, x + lean * u1 * u1, y, zb + 1 + (H - 1) * u1, 0.4 - u0 * 0.12, 0.4 - u1 * 0.12, s % 3 === 1 ? ring : '#2a2238'); }
    for (var f = 0; f < 7; f++){ var a = f / 7 * 6.28 + hash(i, f, 4), ex = tx + Math.cos(a) * R, ey = y + Math.sin(a) * R * 0.7, mx = tx + Math.cos(a) * R * 0.5, my = y + Math.sin(a) * R * 0.35;
      B.tube(set, tx, y, zb + H, mx, my, zb + H + 0.8, 0.3, 0.24, f % 2 ? '#1f8a7a' : '#176a62'); B.tube(set, mx, my, zb + H + 0.8, ex, ey, zb + H - 1.2, 0.24, 0.1, f % 3 ? '#1f8a7a' : '#2bf0ff'); } }, 0.25); };
// a bollard with a lit cap
BUILD.neoBollard = function(B, t, i){ var c = pick(i, NEO_TGLOW); box(B, t.x, t.y, 1, 1, 2.2, function(dx, dy, tt){ var r = Math.hypot(dx, dy); if (r > 0.38) return null; return tt > 1.8 ? c : (tt * 2 | 0) % 2 ? '#2a2440' : '#3a3456'; }, 0.125); };
// the cabinet rows: four cabinets shoulder to shoulder
BUILD.neoCabRow = function(B, t, i){ for (var k = 0; k < 4; k++) cabinet(B, t.x - 3.6 + k * 2.4, t.y, i + k); };
// a bar stool: a chrome post and a round seat in a neon colour
BUILD.neoStool = function(B, t, i){ var c = pick(i, NEO_TGLOW); box(B, t.x, t.y, 1.6, 1.6, 2.2, function(dx, dy, tt){ var r = Math.hypot(dx, dy);
  if (tt > 1.8) return r < 0.7 ? (tt > 2.0 ? c : '#2a2440') : null; if (tt < 0.2) return r < 0.55 ? '#9a98b0' : null; return r < 0.15 ? '#c8c6dc' : null; }, 0.125); };
// the warp gate: a ring on its end, gold and pink, swirling violet and cyan inside
BUILD.neoPortal = function(B, t){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var z = tt - 4, r = Math.hypot(dx, z), a = Math.atan2(z, dx);
  if (tt < 0.6) return Math.abs(dx) < 2.6 && Math.abs(dy) < 0.9 ? '#2a2440' : null; if (r > 3.4) return null;
  if (r > 2.8) return Math.abs(dy) < 0.8 ? ((Math.floor(a * 4 + 9) % 2) ? '#ff2bd6' : '#ffe02b') : null; if (Math.abs(dy) > 0.15) return null;
  var sw = (a + r * 1.6) / 6.283 * 3; sw = sw - Math.floor(sw); return sw < 0.33 ? '#a46bff' : sw < 0.66 ? '#2bf0ff' : '#1a0f44'; }); };
// an air hockey table: four legs, a pink rim, an ice blue top with its centre line and circle
BUILD.neoHockey = function(B, t){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var ax = Math.abs(dx), ay = Math.abs(dy);
  if (tt < 1.7) return Math.abs(ax - 1.8) < 0.2 && Math.abs(ay - 0.9) < 0.2 ? '#2a2440' : null; if (ax > 2.35 || ay > 1.3) return null;
  if (ax > 2.15 || ay > 1.1) return tt > 2.1 ? '#ff2bd6' : '#2a2440'; if (tt > 2.05) return null; if (ax < 0.08 || Math.abs(Math.hypot(dx, dy) - 0.6) < 0.08) return '#e5483a'; return '#bfefff'; }, 0.125); };
// a sit in racer seen from behind: the bucket seat, the wheel, the screen hood lit up beyond
function neoRacerAt(B, x, y, i){ var c = pick(i, NEO_TGLOW); box(B, x, y, 2.6, 4, 4.8, function(dx, dy, tt){ var ax = Math.abs(dx);
  if (tt < 0.5) return ax < 1.25 && Math.abs(dy) < 1.9 ? (ax > 1.05 || Math.abs(dy) > 1.7 ? c : '#2a2440') : null;
  if (dy < -0.7){ if (ax > 1.25 || tt > 4.6) return null; if (dy > -1.0 && ax < 1.0 && tt > 2.2 && tt < 4.0) return (Math.floor((tt - 2.2) * 5 + dx * 2) % 4 === 0) ? c : tt < 2.9 ? '#2a2a40' : '#2a6ae8'; if (tt > 4.1) return '#fff2fa'; return ax > 1.05 ? c : '#1a1233'; }
  if (dy < 0.1){ if (Math.abs(dy + 0.3) < 0.15 && Math.abs(Math.hypot(dx, tt - 2.4) - 0.5) < 0.1) return '#c8c6dc'; if (ax < 0.15 && tt < 2.3 && dy < -0.2) return '#2a2440'; return null; }
  if (ax > 0.85) return null; if (tt < 1.6) return dy < 1.6 ? '#2a2440' : null; if (tt < 1.9 && dy < 1.5) return '#e5483a'; if (dy > 1.1 && dy < 1.6 && tt < 3.8) return ax > 0.7 ? '#141018' : '#e5483a'; return null; }, 0.25); }
BUILD.neoRacer = function(B, t, i){ neoRacerAt(B, t.x, t.y, i); };
BUILD.neoRacers = function(B, t, i){ neoRacerAt(B, t.x - 1.7, t.y, i); neoRacerAt(B, t.x + 1.7, t.y, i + 1); };
// the checkered gantry over the floor, posts striped pink
BUILD.neoGantry = function(B, t){ var w2 = t.w / 2; box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var ax = Math.abs(dx);
  if (Math.abs(ax - w2 + 0.5) < 0.35) return Math.abs(dy) < 0.35 ? ((tt * 1.2 | 0) % 2 ? '#c8c6dc' : '#ff2bd6') : null;
  if (tt < 6 || ax > w2 - 0.5 || Math.abs(dy) > 0.25) return null; if (tt > 7.6 || tt < 6.2) return '#ff2bd6'; return ((Math.floor((dx + 40) * 1.4) + Math.floor(tt * 1.4)) % 2) ? '#f4f2fa' : '#141018'; }); };
// a dance pad: nine tiles in a steel frame, the four arrows lit
function neoPadAt(B, x, y){ box(B, x, y, 2.8, 2.8, 0.4, function(dx, dy){ var ax = Math.abs(dx), ay = Math.abs(dy); if (ax > 1.35 || ay > 1.35) return null; if (ax > 1.2 || ay > 1.2) return '#9a98b0';
  var iu = dx < -0.42 ? -1 : dx > 0.42 ? 1 : 0, iv = dy < -0.42 ? -1 : dy > 0.42 ? 1 : 0; if (Math.abs(ax - 0.42) < 0.06 || Math.abs(ay - 0.42) < 0.06) return '#141018';
  if (iu && iv) return '#2a2440'; if (!iu && !iv) return '#3a3456'; var lu = dx - iu * 0.82, lv = dy - iv * 0.82, al = iu ? lu * iu : lv * iv, ac = iu ? Math.abs(lv) : Math.abs(lu);
  return ac < 0.24 - al * 0.9 && al > -0.24 ? (iv < 0 ? '#ff2bd6' : iv > 0 ? '#2bf0ff' : iu < 0 ? '#ffe02b' : '#7cff4a') : '#2a2440'; }, 0.125); }
BUILD.neoPad = function(B, t){ neoPadAt(B, t.x, t.y); };
BUILD.neoDance = function(B, t){ neoPadAt(B, t.x - 1.6, t.y); neoPadAt(B, t.x + 1.6, t.y); };
// the start lights: red, yellow, green on a chrome pole
BUILD.neoStart = function(B, t){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var r = Math.hypot(dx, dy); if (tt < 4.4) return r < 0.2 ? '#c8c6dc' : null;
  if (Math.abs(dx) > 0.6 || Math.abs(dy) > 0.45) return null; var L = ['#ff3a3a', '#ffe02b', '#7cff4a']; for (var j = 0; j < 3; j++) if (Math.hypot(dx, tt - 6.4 + j * 0.8) < 0.3 && dy > 0) return L[j]; return '#141018'; }, 0.125); };
// the prize counter: a glass case of prizes, and behind it the shelves of plush to the ceiling with PRIZES lit over them
BUILD.neoCounter = function(B, t){ var w2 = t.w / 2 - 0.2, wd = 23 * 0.36;
  function plush(u, v, k){ var i = Math.floor(u / 1.0), r = Math.hypot(u - i - 0.5, v - 0.45); return r < 0.45 ? NEO_TPLUSH[(hash(i, k, 3) * 7) | 0] : null; }
  box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var ax = Math.abs(dx); if (ax > w2) return null;
    if (dy > 0.2){ if (tt > 2.8) return null; if (tt < 1.5) return dy > t.d / 2 - 0.4 && Math.abs(tt - 0.8) < 0.1 ? '#2bf0ff' : '#2a1a4a';   // the counter
      if (ax > w2 - 0.15 || tt > 2.65 || dy > t.d / 2 - 0.15) return (dy > t.d / 2 - 0.15 && tt < 2.65 && ax < w2 - 0.15) ? null : '#9fe8ff'; return tt < 2.1 ? plush(dx + 40, tt - 1.5, 9) : null; }
    if (dy < -0.4){ if (tt > 6.4){ if (dy < -0.9) return tt > 8.6 ? '#2bf0ff' : '#1a0f33'; return neoTWord('PRIZES', dx + wd / 2, tt - 6.7, 0.36) ? '#ff2bd6' : null; }   // the wall of prizes
      var sh = tt % 1.5; if (sh < 0.15) return '#5a3a8a'; if (dy > -0.9) return plush(dx + 40, sh - 0.15, Math.floor(tt / 1.5)); return '#2a1a4a'; }
    return null; }); };
// a claw machine: a lit cabinet, a glass box with a heap of plush and the claw hanging over it
function neoClawAt(B, x, y, i){ var c = pick(i, NEO_TGLOW); box(B, x, y, 2.6, 2.6, 6.4, function(dx, dy, tt){ var m = Math.max(Math.abs(dx), Math.abs(dy)); if (m > 1.25) return null;
  if (tt < 2.4){ if (dy > 1.0 && Math.abs(dx + 0.5) < 0.25 && Math.abs(tt - 1.0) < 0.25) return '#ffe02b'; return m > 1.08 ? c : '#2a1a4a'; }
  if (tt > 5.6) return tt > 6.2 ? '#1a0f33' : dy > 1.0 ? '#fff2fa' : c; if (Math.abs(dx) > 1.12 && Math.abs(dy) > 1.12) return '#c8c6dc';
  if (tt < 3.1){ var b = Math.hypot(((dx * 2) % 1 + 1) % 1 - 0.5, ((dy * 2) % 1 + 1) % 1 - 0.5); return b < 0.42 && m < 1.1 ? NEO_TPLUSH[(hash(Math.floor(dx * 2), Math.floor(dy * 2), i) * 7) | 0] : null; }
  var rr = Math.hypot(dx, dy); if (rr < 0.08 && tt > 4.4) return '#c8c6dc'; if (tt > 3.9 && tt < 4.4 && rr < 0.42 && rr > 0.24) return '#c8c6dc'; return null; }, 0.125); }
BUILD.neoClaw = function(B, t, i){ neoClawAt(B, t.x, t.y, i); };
BUILD.neoClaws = function(B, t, i){ for (var k = 0; k < 3; k++) neoClawAt(B, t.x - 2.7 + k * 2.7, t.y, i + k); };
// a gumball machine: a red stand, a glass globe of colour
BUILD.neoGum = function(B, t, i){ box(B, t.x, t.y, 1.6, 1.6, 3, function(dx, dy, tt){ var r = Math.hypot(dx, dy);
  if (tt < 1.3) return r < 0.4 + (tt < 0.2 ? 0.2 : 0) ? (tt > 0.7 && tt < 1.0 && dy > 0.25 ? '#c8c6dc' : '#e5483a') : null;
  var s = Math.hypot(r, tt - 2.0); if (s < 0.75){ if (s > 0.66) return '#e8f6ff'; return NEO_TPLUSH[(hash(Math.floor(dx * 4) + 9, Math.floor(tt * 4), Math.floor(dy * 4) + i) * 6) | 0]; }
  if (tt > 2.65 && r < 0.22) return '#e5483a'; return null; }, 0.125); };
// the roof: a tower across the street, its windows lit, a red light on its roof
BUILD.neoTower = function(B, t, i){ var w2 = t.w / 2, d2 = t.d / 2; box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){
  if (Math.abs(dx) > w2 - 0.2 || Math.abs(dy) > d2 - 0.2){ return null; } if (tt > t.h - 1.2) return Math.hypot(dx, dy) < 0.3 ? (tt > t.h - 0.5 ? '#ff3a3a' : '#6a6480') : null;
  if (tt > t.h - 1.6) return '#2a2640'; var u = dx + w2, ci = Math.floor(u / 1.2), ri = Math.floor(tt / 1.6), win = (u % 1.2) > 0.4 && (tt % 1.6) > 0.6 && Math.abs(dx) < w2 - 0.6 && tt > 1.6;
  if (win && (dy > d2 - 0.5 || Math.abs(dx) > w2 - 0.5)) return hash(ci, ri, i) < 0.42 ? (hash(ci, ri, i + 7) < 0.7 ? '#ffe2a0' : '#9ad8ff') : '#12122a'; return i % 2 ? '#1c1a30' : '#221e38'; }, 0.25); };
// the water tower: a tank of staves on four legs, a cone of a roof
BUILD.neoTank = function(B, t){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var r = Math.hypot(dx, dy);
  if (tt < 5.2){ if (Math.abs(Math.abs(dx) - 1.6) < 0.2 && Math.abs(Math.abs(dy) - 1.6) < 0.2) return '#4a4458'; if (Math.abs(tt - 2.8) < 0.12 && Math.max(Math.abs(dx), Math.abs(dy)) < 1.75 && (Math.abs(Math.abs(dx) - 1.6) < 0.12 || Math.abs(Math.abs(dy) - 1.6) < 0.12)) return '#4a4458'; return null; }
  if (tt < 9.6){ if (r > 2.3) return null; if (Math.abs(tt - 6.2) < 0.12 || Math.abs(tt - 8.6) < 0.12) return '#2a2440'; return (Math.floor((Math.atan2(dy, dx) + 4) * 7) % 2) ? '#6a4a34' : '#5a3e2c'; }
  return r < 2.5 * (1 - (tt - 9.6) / 2.2) ? '#3a3248' : null; }); };
// the grand prize: a gold cup on a plinth with pink lights
BUILD.neoTrophy = function(B, t){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var r = Math.hypot(dx, dy);
  if (tt < 2) return Math.abs(dx) < 1.6 && Math.abs(dy) < 1.5 ? (Math.abs(tt - 1.7) < 0.12 || Math.abs(tt - 0.3) < 0.12 ? '#ff2bd6' : '#2a2440') : null;
  if (tt < 2.5) return r < 1.0 ? '#c9a227' : null; if (tt < 4.4) return r < 0.25 + Math.max(0, 3.1 - tt) * 0.9 ? '#e8c23a' : null;
  if (tt < 7.6){ var rb = 0.5 + Math.sqrt(Math.max(0, (tt - 4.4) / 3.2)) * 1.2; if (r < rb && r > rb - 0.25) return tt > 7.35 ? '#ffe9a0' : Math.abs(tt - 6.5) < 0.15 ? '#c9a227' : '#ffd23a';
    if (Math.abs(dy) < 0.2 && Math.abs(Math.hypot(Math.abs(dx) - rb - 0.5, tt - 6.4) - 0.6) < 0.14) return '#e8c23a'; } return null; }, 0.125); };
// ARCADE in big letters on a lattice frame, as it stands on the arcade's roof
BUILD.neoSign = function(B, t){ var s = 0.46, wd = 23 * s; box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var u = dx + wd / 2;
  if (tt < 3.6){ var q = ((u % 2) + 2) % 2; return dy < 0 && Math.abs(dy) < 0.6 && u > 0 && u < wd && (Math.abs(q - 1) < 0.12 || Math.abs(Math.abs(q - 1) - tt * 0.27) < 0.12) ? '#6a6480' : null; }
  if (Math.abs(dy) > 0.5) return null; return neoTWord('ARCADE', u, tt - 3.8, s) ? (dy > 0.2 ? '#ff2bd6' : '#ff8ae8') : null; }, 0.25); };
// a radio mast: a lattice of grey, a red light on top
BUILD.neoMast = function(B, t, i){ var H = t.h; box(B, t.x, t.y, 2, 2, H + 0.5, function(dx, dy, tt){ var w = 0.7 * (1 - tt / (H + 1)), ax = Math.abs(dx), ay = Math.abs(dy);
  if (tt > H) return Math.hypot(dx, dy) < 0.3 ? '#ff3a3a' : null; if (Math.abs(ax - w) < 0.1 && Math.abs(ay - w) < 0.1) return '#8a84a0';
  if ((Math.abs(ax - w) < 0.08 || Math.abs(ay - w) < 0.08) && ax <= w + 0.1 && ay <= w + 0.1 && Math.abs(((tt % 1.4) + 1.4) % 1.4 - 0.7) < 0.08) return '#6a6480'; return null; }, 0.125); };
// an air conditioner: a grey box, its fan in the top, a grille on the front
BUILD.neoAC = function(B, t){ box(B, t.x, t.y, 3, 2.2, 2.4, function(dx, dy, tt){ if (Math.abs(dx) > 1.4 || Math.abs(dy) > 1.0) return null;
  if (tt > 2.2){ var r = Math.hypot(dx - 0.4, dy); if (r < 0.75) return (Math.floor(Math.atan2(dy, dx - 0.4) * 1.9 + 7) % 2) ? '#2a2836' : '#6a6878'; }
  if (dy > 0.85 && dx < -0.1 && tt > 0.4 && tt < 1.9) return (tt * 5 | 0) % 2 ? '#4a4858' : '#7a7888'; return '#8a889a'; }, 0.125); };
// a vent pipe with its cap
BUILD.neoVent = function(B, t){ box(B, t.x, t.y, 1.4, 1.4, 2, function(dx, dy, tt){ var r = Math.hypot(dx, dy); if (tt > 1.6) return r < 0.62 ? '#6a6878' : null; return r < 0.35 ? '#8a889a' : null; }, 0.125); };
LMSIZE.neoMarquee = [14, 4, 10]; LMSIZE.neoBooth = [4, 4, 6]; LMSIZE.neoCabRow = [10, 2, 5.4]; LMSIZE.neoPortal = [7, 2, 7.6]; LMSIZE.neoHockey = [5, 3, 2.4];
LMSIZE.neoRacers = [6, 4, 4.8]; LMSIZE.neoGantry = [12, 1.6, 8]; LMSIZE.neoDance = [6, 3, 0.4]; LMSIZE.neoStart = [1.4, 1.2, 7.4];
LMSIZE.neoCounter = [12, 4, 9]; LMSIZE.neoClaws = [8, 2.6, 6.4]; LMSIZE.neoTower = [8, 6, 22]; LMSIZE.neoTank = [5, 5, 12]; LMSIZE.neoTrophy = [4, 4, 8]; LMSIZE.neoSign = [12, 2, 6.4];
/* ---- Lost Temple's stops on the walk, the same places its holes stand in (land.js): the explorers' camp under the outer
   gate, the overgrown ruins and the landslide, the gorge with its falls and cut stairs, the great temple and its guardians,
   and the sanctum with its gold. Every stop is old dressed stone, moss and jade, where Pirate Cove's jungle is palms and a fort. */
KIT['temple~camp'] = kitFrom(KIT.temple, { g:['#3b6a2e', '#42722f', '#34602b', 0.2], gpat:'tmpgrass', p:['#8a6e4a', '#9a7c54', '#7a6040'], paved:false, tree:['tmpvine', 'tmpvine', 'broad'],
  low:['fern', 'bush', 'fern', 'rock'], hazC:['#2f8f7a', '#5cc0a0'], waterC:['#2f8f7a', '#5cc0a0'], nlm:4, lm:['tmpTent', 'tmpGate', 'tmpCamp', 'tmpTent'], dens:1.2 });
KIT['temple~ruins'] = kitFrom(KIT.temple, { g:['#3b6a2e', '#42722f', '#34602b', 0.2], gpat:'tmpruin', tree:['tmpvine', 'broad', 'tmpvine'], low:['fern', 'rock', 'fern', 'bush'],
  hazC:['#2fb58f', '#7fe0c0'], waterC:['#2fb58f', '#7fe0c0'], nlm:4, lm:['tmpHead', 'ruin', 'tmpScree', 'columns'], dens:1.1 });
KIT['temple~gorge'] = kitFrom(KIT.temple, { g:['#3b6a2e', '#42722f', '#34602b', 0.2], gpat:'tmpgorge', p:['#a8987a', '#b8a888', '#8a7c62'], paved:false, tree:['tmpvine', 'broad', 'tmpvine'],
  low:['fern', 'rock', 'fern', 'bush'], haz:'water', hazC:['#2f8f9a', '#6fc8d0'], waterC:['#2f8f9a', '#7fd0d4'], nlm:4, lm:['tmpFalls', 'tmpFalls', 'ruin', 'tmpFalls'], dens:1.1, wall:['#a8987a', '#6a604c'] });
KIT['temple~steps'] = kitFrom(KIT.temple, { g:['#a69c72', '#b3a97e', '#958b63', 0.2], gpat:'tmpplaza', p:['#c2b78c', '#cfc49a', '#a69c72'], tree:['broad', 'tmpvine'], low:['rock', 'fern'],
  hazC:['#2fb58f', '#7fe0c0'], waterC:['#2fb58f', '#7fe0c0'], nlm:5, lm:['tmpPyramid', 'tmpGuard', 'tmpBrazier', 'tmpSerpent', 'tmpGuard'], dens:0.45 });
KIT['temple~sanctum'] = kitFrom(KIT.temple, { g:['#8a8060', '#958b63', '#7b7354', 0.2], gpat:'tmpsanct', p:['#cfc49a', '#ddd2a6', '#b8962e'], paved:true, tree:['tmppillar', 'tmppillar'], low:['tmpcoins', 'rock', 'tmpcoins'],
  haz:null, nlm:5, lm:['tmpIdol', 'tmpGold', 'tmpBrazier', 'tmpGold', 'tmpBrazier'], dens:0.13, wall:['#8a8060', '#4a4436'] });
LIFE_AS['temple~camp'] = { fly:['parrot', 4], mote:[['firefly', 14], ['butter', 6]] };
LIFE_AS['temple~ruins'] = { fly:['song', 3], mote:[['butter', 12], ['leaf', 8]] };
LIFE_AS['temple~gorge'] = { fly:['song', 4], mote:[['leaf', 10], ['firefly', 8]] };
LIFE_AS['temple~steps'] = { fly:['crow', 3], mote:[['dust', 14], ['butter', 4]] };
LIFE_AS['temple~sanctum'] = { fly:['bat', 5], mote:[['dust', 18], ['ember', 10]] };

// the temple's ground on the walk: soft patches of green, an old floor coming up through it, rock and moss by the river,
// the plaza's flagstones, and the sanctum's polished slabs
GPAT.tmpgrass = function(c){ var a = vn(c.ti * 0.045, c.tj * 0.045, 7), b = vn(c.ti * 0.13, c.tj * 0.13, 8); return a > 0.7 ? '#4a6230' : b > 0.64 ? '#42722f' : b < 0.3 ? '#34602b' : '#3b6a2e'; };
GPAT.tmpruin = function(c){ var f = vn(c.ti * 0.022, c.tj * 0.022, 11); if (f > 0.64){ var i = Math.floor(c.ti / 12), j = Math.floor(c.tj / 12), m = vn(c.ti * 0.07, c.tj * 0.07, 12);
    if (c.ti % 12 === 0 || c.tj % 12 === 0) return m > 0.5 ? '#46682e' : '#7a7254'; return m > 0.66 ? '#5a7a3a' : vn(i * 0.7, j * 0.7, 13) > 0.5 ? '#9a9068' : '#8e8462'; }
  return GPAT.tmpgrass(c); };
GPAT.tmpgorge = function(c){ var r = vn(c.ti * 0.03, c.tj * 0.03, 21); if (r > 0.62){ var a = vn(c.ti * 0.1, c.tj * 0.1, 22); return a > 0.66 ? '#b4a484' : a < 0.35 ? '#968868' : '#a8987a'; } return GPAT.tmpgrass(c); };
GPAT.tmpplaza = function(c){ var row = Math.floor(c.tj / 16), off = row % 2 ? 8 : 0, i = Math.floor((c.ti + off) / 16);
  if (c.tj % 16 === 0 || (c.ti + off) % 16 === 0) return vn(c.ti * 0.06, c.tj * 0.06, 31) > 0.68 ? '#5a7a3a' : '#8a8260'; var n = vn(i * 0.9, row * 0.9, 32); return n > 0.66 ? '#b9ae84' : n < 0.33 ? '#958b63' : '#a69c72'; };
GPAT.tmpsanct = function(c){ var row = Math.floor(c.tj / 16), off = row % 2 ? 8 : 0, i = Math.floor((c.ti + off) / 16);
  if (c.tj % 16 === 0 || (c.ti + off) % 16 === 0) return '#5e5644'; var n = vn(i * 0.9, row * 0.9, 41), s = vn(c.ti * 0.05, c.tj * 0.05, 42); return s > 0.74 ? '#9e9472' : n > 0.6 ? '#9a9070' : n < 0.35 ? '#7e7456' : '#8a8060'; };

// dressed stone on a landmark: courses of blocks, each its own shade, moss in soft patches
function tmpAsh(u, t, sd){ var row = Math.floor(t / 0.8), uu = u + (row % 2) * 0.8 + 40, col = Math.floor(uu / 1.6);
  if (t - row * 0.8 < 0.12 || uu - col * 1.6 < 0.12) return '#6a6448'; if (vn(u * 0.5, t * 0.6, sd) > 0.72) return '#56803e'; return vn(col * 0.83, row * 0.71, sd + 3) > 0.5 ? '#a69c72' : '#978d64'; }
// a jungle tree with vines down from its crown, and a stone pillar for the sanctum's hall
TREEH.tmpvine = [12, 5, 4.2]; TREEH.tmppillar = [9, 3, 1.4];
BUILD.tmpvine = function(B, t, i){ BUILD.broad(B, t, i); var x = t.x, y = t.y, zb = B.gz(x, y), H = t.h, R = t.cr, cz = zb + H * 0.64;
  B.vox(x - R * 1.4, y - R * 1.2, zb, x + R * 1.4, y + R * 1.2, cz, function(set){ for (var v = 0; v < 5; v++){ var a = hash(i, v, 41) * 6.28, r = R * (0.8 + hash(v, i, 42) * 0.35), vx = x + Math.cos(a) * r, vy = y + Math.abs(Math.sin(a)) * r * 0.6, len = 2.5 + hash(i, v, 43) * 3.5;
    B.tube(set, vx, vy, cz - 0.4, vx + 0.2, vy, cz - 0.4 - len, 0.14, 0.1, v % 2 ? '#3f7a2e' : '#2f6a28'); } }, 0.25); };
BUILD.tmppillar = function(B, t, i){ var H = t.h; box(B, t.x, t.y, 2.2, 2.2, H, function(dx, dy, tt){ var r = Math.hypot(dx, dy);
  if (tt < 0.6 || tt > H - 0.7) return Math.max(Math.abs(dx), Math.abs(dy)) < 1.05 ? (Math.abs(tt - H + 0.5) < 0.12 ? '#c9a227' : tt > H - 0.3 ? '#a69c72' : '#8a8060') : null; if (r > 0.75) return null;
  if (Math.abs(tt - H * 0.6) < 0.18) return '#c9a227'; return (Math.floor(Math.atan2(dy, dx) * 2.6 + 9) % 2) ? '#9a9070' : '#8a8060'; }); };
LOWR.tmpcoins = 0.8; LOWH.tmpcoins = 0.8;
BUILD.tmpcoins = function(B, t, i){ var x = t.x, y = t.y, zb = B.gz(x, y); B.solid(x - 0.8, y - 0.7, zb - 0.05, x + 0.8, y + 0.7, zb + 0.6, function(px, py, pz){ var d = Math.hypot((px - x) / 0.75, (py - y) / 0.6, (pz - zb) / 0.5);
  return d < 1 ? (vn(px * 6, py * 6 + pz * 4, i) > 0.6 ? '#fff0a0' : '#e0a818') : null; }, 0.125); };

// the camp: a ridge tent, its door to the camera
BUILD.tmpTent = function(B, t, i){ var cv = i % 2 ? ['#d8c89a', '#c4b484'] : ['#c8b67e', '#b4a26c'];
  box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var hw = 2.4 * (1 - tt / 3.6); if (Math.abs(dx) < 0.1 && dy > 1.9 && dy < 2.5 && tt < 4) return '#5a3818';
    if (tt > 3.6 || Math.abs(dy) > 2 || Math.abs(dx) > hw) return null; if (dy > 1.85 && Math.abs(dx) < (3.6 - tt) * 0.3 && tt < 2.7) return '#2a2016'; if (Math.abs(dx) < 0.1) return '#8a7a54'; return dx < 0 ? cv[0] : cv[1]; }); };
// the camp's middle: the fire in its ring, crates and a barrel, a log to sit on
BUILD.tmpCamp = function(B, t, i){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var r = Math.hypot(dx, dy);
  if (tt < 0.3 && r > 0.75 && r < 1.05) return (Math.floor(Math.atan2(dy, dx) * 2.6) % 2) ? '#6e665e' : '#857c70'; if (tt < 0.25 && r < 0.75) return '#3a2412';
  if (tt >= 0.2 && r < 0.6 * (1 - tt / 1.8)) return tt < 0.6 ? '#ffd23a' : tt < 1.1 ? '#ff8a1a' : '#e5483a';
  var cx = dx + 1.7, cy = dy + 1.2; if (Math.abs(cx) < 0.6 && Math.abs(cy) < 0.6 && tt < 1.1) return Math.max(Math.abs(cx), Math.abs(cy)) > 0.5 || tt > 1 || Math.abs(cx - cy) < 0.08 ? '#6a4420' : '#a8783e';   // a crate
  var bx = dx - 1.8, by = dy + 0.9; if (Math.hypot(bx, by) < 0.5 && tt < 1.2) return Math.abs(tt - 0.25) < 0.08 || Math.abs(tt - 0.95) < 0.08 ? '#3a3a40' : '#8f5a2c';   // a barrel
  if (Math.abs(dy - 1.5) < 0.32 && Math.abs(dx) < 1.3 && Math.hypot(dy - 1.5, tt - 0.3) < 0.32) return Math.abs(dx) > 1.2 ? '#c8a070' : '#6e4a2a';   // a log
  return null; }, 0.125); };
// the temple's outer gate: two pillars, a lintel with a face cut in it, stone doors (one pushed open), vines down the front
BUILD.tmpGate = function(B, t, i){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var ax = Math.abs(dx), ady = Math.abs(dy);
  if (tt > 7 && tt < 9 && ax < 6.8 && ady < 1.2){ if (dy > 1 && ax < 1.6 && tt > 7.3 && tt < 8.7){ if (Math.hypot(ax - 0.7, tt - 8.05) < 0.22) return '#3fd0a0'; if (ax < 0.9 && Math.abs(tt - 7.55) < 0.08) return '#3a3424'; if (ax > 1.45 || tt > 8.55 || tt < 7.45) return '#7b7354'; return '#c2b78c'; }
    if (tt > 8.7 && vn(dx * 0.8, 1, i) > 0.45) return '#4f7a3a'; return tmpAsh(dx, tt, i); }
  if (ax > 3.6 && ax < 6 && ady < 1.1 && tt < 7) return tmpAsh(dx + (dx > 0 ? dy : -dy), tt, i + 1);
  if (dy > 1.1 && dy < 1.35 && ax < 6.2 && tt > 4 && tt < 7){ var vl = 7 - (1 + vn(dx * 1.6, 3, i + 5) * 3.6); if (tt > vl && Math.abs(Math.sin(dx * 3.2)) < 0.45) return vn(dx * 2.5, tt, 8) > 0.5 ? '#3f8a3a' : '#2f6a28'; }
  if (ady < 0.25 && ax < 3.6 && tt < 7){ if (dx > 0.4 && dx < 1.9) return null; var p2 = dx < 0.4 ? dx + 1.6 : dx - 2.75; if (Math.abs(Math.abs(p2) - 1.55) < 0.14 || tt > 6.75 || Math.abs(tt - 3.4) < 0.1) return '#6f6a4e'; return '#958b63'; }
  if (dy < -0.1 && ady < 0.8 && ax < 3.6 && tt < 7) return '#14110a'; return null; }); };
// a stone head of Idol Alley, sunk to the chin: jade eyes, a band of gold, moss on the crown
BUILD.tmpHead = function(B, t, i){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var ax = Math.abs(dx), w = tt < 3.6 ? 1.9 : 1.9 - (tt - 3.6) * 0.8;
  if (ax > w || Math.abs(dy) > 1.5 || tt > 4.6) return null; if (tt > 3.9) return vn(dx, dy, i) > 0.45 ? '#56803e' : '#a69c72'; if (tt > 3.6) return '#c9a227';
  if (dy > 1.3){ if (Math.abs(tt - 2.8) < 0.28 && Math.abs(ax - 0.75) < 0.32) return tt > 2.8 ? '#7fe0c0' : '#2fb58f'; if (Math.abs(tt - 3.3) < 0.09 && ax < 1.5) return '#6f6a4e';
    if (ax < 0.22 && tt > 1.9 && tt < 2.6) return '#b3a97e'; if (Math.abs(tt - 1.4) < 0.11 && ax < 0.8) return '#3a3424'; }
  if (vn(dx * 0.8, tt * 0.8, i + 4) > 0.7) return '#56803e'; return Math.floor(tt / 0.9) % 2 ? '#a69c72' : '#978d64'; }); };
// the landslide: a heap of scree and boulders come down out of the jungle
BUILD.tmpScree = function(B, t, i){ var R0 = [[-2.4, -1, 1.6], [1.2, -1.6, 1.9], [3, 0.8, 1.1], [-0.4, 1.2, 1.2], [-3.4, 1.6, 0.9]];
  box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var hp = 2.4 * (1 - Math.hypot(dx / 5, dy / 3.5)) + (vn(dx * 0.9, dy * 0.9, i) - 0.5) * 0.5; if (tt < hp) return vn(dx * 1.6, dy * 1.6 + tt, i + 2) > 0.6 ? '#a29c86' : '#8a8470';
    for (var k = 0; k < R0.length; k++){ var q = R0[k], d = Math.hypot(dx - q[0], dy - q[1], (tt - hp * 0.6 - q[2] * 0.6) * 1.2); if (d < q[2]) return vn(dx * 2, tt * 2, i + k) > 0.55 ? '#9a9480' : '#76705e'; } return null; }); };
// the gorge: a cliff with the falls down one side into a pool, the temple's stairs cut up the other, jungle on top
BUILD.tmpFalls = function(B, t, i){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){
  if (dy > 0.8){ var pd = Math.hypot((dx + 2.2) / 2.8, (dy - 2.4) / 1.3); if (pd < 1 && tt < 0.3) return pd > 0.86 ? '#968868' : (pd < 0.4 ? '#ffffff' : '#2f8f9a'); if (dy > 1) return null; }
  var top = t.h * (0.8 + (vn(dx * 0.4, 2, i) - 0.5) * 0.3), d = Math.hypot(dx / (t.w / 2), (dy + 1.2) / (t.d / 2 * 0.75)) + (vn(dx * 0.8, tt * 0.8, i + 3) - 0.5) * 0.18; if (d > 1 || tt > top) return null;
  if (Math.abs(dx + 2.2) < 1 && d > 0.72) return vn(dx * 3, tt * 0.4, i + 5) > 0.5 ? '#ffffff' : '#bfe8f4';   // the falling water
  if (Math.abs(dx - 2.4) < 1 && d > 0.72 && tt < top - 0.6) return (tt % 0.6) < 0.18 ? '#7b7354' : '#ddd2a6';   // the stairs
  if (tt > top - 0.6) return '#4f7a3a'; return (Math.floor(tt * 0.9) % 3) === 0 ? '#968868' : '#a8987a'; }); };
// the great temple: five tiers, the stair up the middle, the shrine on top with gold along its ridge
BUILD.tmpPyramid = function(B, t, i){ var W = t.w, D = t.d, NT = 5, TH = 2, TS = (D / 2 - 1.6) / NT, top = NT * TH;
  box(B, t.x, t.y, W, D, t.h, function(dx, dy, tt){ var ax = Math.abs(dx);
    var sf = D / 2, sl = top / (sf - (D / 2 - NT * TS)), st = (sf - dy) * sl;
    if (ax < 2 && dy < sf && tt < st && tt < top + 0.05 && dy > -D / 2 + 1){ if (ax > 1.55) return tt > st - 0.6 ? '#8f8766' : null; return (tt % 0.55) < 0.14 ? '#7b7354' : '#c2b78c'; }
    var k = Math.floor(tt / TH); if (k < NT){ var hw = W / 2 - k * (W / 2 - 3) / NT, hd = D / 2 - k * TS; if (ax > hw || Math.abs(dy) > hd) return null; if (tt % TH > TH - 0.25) return '#c2b78c'; return tmpAsh(ax > hw - 0.4 ? dy : dx, tt, i); }
    var u = tt - top; if (ax > 2.6 || Math.abs(dy) > 2 || u > 3.6) return null; if (dy > 1.6 && ax < 0.8 && u < 2.2) return '#120e08'; if (u > 3.1) return Math.abs(dy) < 0.4 ? '#c9a227' : '#a69c72'; if (u > 2.8) return '#7b7354';
    return tmpAsh(dx, u, i + 2); }); };
// a guardian on his plinth: a robed figure, jade eyes, a tall headdress banded in gold and jade
BUILD.tmpGuard = function(B, t, i){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var ax = Math.abs(dx);
  if (tt < 1.2) return Math.max(ax, Math.abs(dy)) < 1.4 ? (tt > 1 ? '#c2b78c' : '#8f8766') : null; if (Math.abs(dy) > 0.8) return null; var u = tt - 1.2;
  if (u < 3.6){ if (ax > 0.95 - u * 0.06) return null; if (Math.abs(u - 2.5) < 0.18) return '#c9a227'; return Math.floor(u * 1.6) % 2 ? '#a69c72' : '#978d64'; }
  if (u < 4.8){ if (ax > 0.65) return null; if (dy > 0.6 && Math.abs(u - 4.2) < 0.13 && Math.abs(ax - 0.28) < 0.12) return '#3fd0a0'; return '#b3a97e'; }
  if (ax > 0.9 - (u - 4.8) * 0.4 || u > 6.4) return null; return Math.floor(u * 3) % 2 ? '#c9a227' : '#2fb58f'; }); };
// a brazier: a stone pedestal and bowl, and the fire in it
BUILD.tmpBrazier = function(B, t, i){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var r = Math.hypot(dx, dy);
  if (tt < 0.3) return r < 0.85 ? '#8a8060' : null; if (tt < 1.9) return r < 0.4 ? (Math.floor(tt * 3) % 2 ? '#a69c72' : '#978d64') : null;
  if (tt < 2.5) return r < 0.4 + (tt - 1.9) * 1.1 ? (r > 0.25 + (tt - 1.9) * 1.1 || tt < 2.0 ? (Math.abs(tt - 2.3) < 0.07 ? '#c9a227' : '#a69c72') : '#3a2412') : null;
  if (r < 0.65 * (1 - (tt - 2.5) / 1.3)) return tt < 2.8 ? '#ffd23a' : tt < 3.2 ? '#ff8a1a' : '#e5483a'; return null; }, 0.125); };
// the stone serpent: an S along the ground, its head reared up, jade eyes
BUILD.tmpSerpent = function(B, t, i){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var cy = Math.sin(dx * 0.75) * 1.1, r = 0.5 - Math.max(0, -dx - 2.6) * 0.2;
  if (dx < 3.4 && dx > -4.4 && Math.hypot(dy - cy, tt - r) < r) return (Math.floor((dx + 6) * 2.2) % 2) ? '#4f8a5a' : '#a69c72';
  var hx = dx - 3.8, ht = tt - 1.7, hy = dy - Math.sin(3.8 * 0.75) * 1.1; if (Math.hypot(hx * 0.9, hy, ht) < 0.7 || (hx < 0.1 && hx > -0.6 && Math.abs(hy) < 0.45 && tt < 1.7)) return hy > 0.3 && Math.abs(ht - 0.15) < 0.15 && Math.abs(hx) < 0.35 ? '#3fd0a0' : '#8a9a6a';
  return null; }, 0.125); };
// the sanctum's heart: three gold edged steps, and the idol sitting on top in gold, jade in its eyes
BUILD.tmpIdol = function(B, t, i){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var ax = Math.abs(dx), st = Math.floor(tt / 0.5);
  if (st < 3){ if (ax > 3.8 - st * 0.6 || Math.abs(dy) > 2.8 - st * 0.5) return null; return (tt % 0.5) > 0.4 ? '#c9a227' : '#5e5644'; }
  var u = tt - 1.5; var body = Math.hypot(dx / 1.5, dy / 1.1, (u - 1.2) / 1.4), head = Math.hypot(dx / 0.8, dy / 0.75, (u - 3.3) / 0.8);
  if (head < 1){ if (dy > 0.5 && Math.abs(u - 3.4) < 0.14 && Math.abs(ax - 0.3) < 0.13) return '#3fd0a0'; return u > 3.7 ? '#ffe680' : '#e8b923'; }
  if (u > 3.9 && u < 5.6 && ax < 1 - (u - 3.9) * 0.55 && Math.abs(dy) < 0.5) return Math.floor(u * 4) % 2 ? '#ffd23a' : '#c9a227';
  if (body < 1) return Math.abs(u - 1.25) < 0.1 ? '#c9a227' : (dx < -0.3 ? '#d8a820' : '#f0c43a'); return null; }, 0.125); };
// gold heaped on the floor, a chest open on top
BUILD.tmpGold = function(B, t, i){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var d = Math.hypot(dx / 2.8, dy / 2.2, tt / 1.8);
  var cx = dx - 0.6, cy = dy - 0.4, cz = tt - 1.2; if (Math.abs(cx) < 0.9 && Math.abs(cy) < 0.6 && cz > 0 && cz < 1.2){ if (cz > 0.95) return '#ffd23a'; return Math.abs(cz - 0.6) < 0.07 || Math.abs(Math.abs(cx) - 0.55) < 0.07 ? '#c9a227' : '#7a4a24'; }
  if (d > 1) return null; return vn(dx * 3, dy * 3 + tt * 2, i) > 0.62 ? '#fff0a0' : vn(dx * 1.5, dy * 1.5, i + 1) > 0.5 ? '#ffd23a' : '#e0a818'; }, 0.125); };
LMSIZE.tmpTent = [6, 5, 4.2]; LMSIZE.tmpCamp = [6, 5, 2]; LMSIZE.tmpGate = [14, 3, 9.2]; LMSIZE.tmpHead = [4.4, 3.4, 4.8]; LMSIZE.tmpScree = [10, 7, 4.5]; LMSIZE.tmpFalls = [12, 8, 11];
LMSIZE.tmpPyramid = [18, 12, 14]; LMSIZE.tmpGuard = [3, 3, 8]; LMSIZE.tmpBrazier = [2, 2, 3.8]; LMSIZE.tmpSerpent = [10, 4, 2.6]; LMSIZE.tmpIdol = [8, 6, 7.2]; LMSIZE.tmpGold = [6, 5, 2.6];
/* ---- Canyon Mine's stops on the walk, the same places its holes stand in (land.js): the desert trail with its buttes and
   trestle, the mine's mouth and headframe, the camp with its stamp mill, tents and water tower, the river gorge, and the
   ghost town by the gold vein. The world's own ground is smooth patches now (a hashed speckle reads as grit at this scale). */
function cnyPatch(c, sd, k){ var a = vn(c.ti * 0.018, c.tj * 0.018, sd), b = vn(c.ti * 0.05, c.tj * 0.05, sd + 1); return a > 0.7 ? k[3] : a < 0.28 ? k[2] : b > 0.64 ? k[1] : k[0]; }
GPAT.cnysand = function(c){ return cnyPatch(c, 31, ['#c8865a', '#d49668', '#b8784e', '#c69866']); };
GPAT.cnytail = function(c){ return cnyPatch(c, 32, ['#a8704a', '#b47e56', '#94603e', '#9a9488']); };
GPAT.cnycamp = function(c){ return cnyPatch(c, 33, ['#c49a6a', '#d0a87a', '#b08a5c', '#a88a62']); };
GPAT.cnybank = function(c){ return cnyPatch(c, 34, ['#c8885a', '#d49868', '#b87a4e', '#a89a5a']); };
GPAT.cnydust = function(c){ return cnyPatch(c, 35, ['#b49a78', '#c2aa88', '#a08868', '#a89070']); };
KIT.canyon.gpat = 'cnysand';
KIT['canyon~trail'] = kitFrom(KIT.canyon, { lm:['cnyButte', 'cnyTrestle', 'mesa', 'cnyButte', 'cnyTrestle'], nlm:3, dens:0.6 });
KIT['canyon~mine'] = kitFrom(KIT.canyon, { g:['#a8704a', '#b47e56', '#94603e', 0.2], gpat:'cnytail', tree:['cactus', 'dead', 'cactus', 'cactus'], bark:'#5a4030', low:['rock', 'rockdark', 'rock', 'bushdry'],
  lm:['cnyPortal', 'cnyHead', 'cart', 'cnyTailing', 'lamps'], nlm:4, dens:0.35, wall:['#7a5040', '#4e3228'] });
KIT['canyon~camp'] = kitFrom(KIT.canyon, { g:['#c49a6a', '#d0a87a', '#b08a5c', 0.2], gpat:'cnycamp', tree:['cactus', 'cactus', 'broad'], leaves:['#4a6a4a', '#3a5a40', '#5e7e52'], bark:'#5a4030',
  low:['rock', 'bushdry', 'rock'], lm:['cnyMill', 'cnyTents', 'tower', 'cnyMill', 'cnyTents', 'lamps'], nlm:5, dens:0.5 });
KIT['canyon~gorge'] = kitFrom(KIT.canyon, { g:['#c8885a', '#d49868', '#b87a4e', 0.2], gpat:'cnybank', tree:['broad', 'cactus', 'broad'], leaves:['#8aa848', '#a4bc58', '#6e9038'], bark:'#6a5440',
  low:['bush', 'rock', 'bushdry'], haz:'water', hazC:['#3f8f8a', '#7ac4b4'], waterC:['#3f8f8a', '#7ac4b4'], lm:['cnyButte', 'mesa', 'cnyButte', 'cart'], nlm:3, dens:0.65 });
KIT['canyon~lode'] = kitFrom(KIT.canyon, { g:['#b49a78', '#c2aa88', '#a08868', 0.2], gpat:'cnydust', p:['#9a8466', '#a89272', '#8a765a'], tree:['dead', 'cactus', 'dead', 'cactus'], bark:'#3a302c',
  low:['bushdry', 'rock', 'rockdark'], lm:['cnyFront', 'cnyVein', 'cnyFront', 'cnyFront', 'cart'], nlm:5, dens:0.4, wall:['#5a4a42', '#2e2420'] });
LIFE_AS['canyon~mine'] = { fly:['bat', 3], mote:['dust', 16] };
LIFE_AS['canyon~camp'] = { fly:['crow', 3], mote:['dust', 16] };
LIFE_AS['canyon~gorge'] = { fly:['song', 4], mote:[['butter', 8], ['dust', 8]] };
LIFE_AS['canyon~lode'] = { fly:['vulture', 3], mote:['dust', 30], tumble:4 };

var CNY_STRATA = ['#b4643c', '#c47a4a', '#9a4e30', '#d08e5a', '#a85a38'];
function cnyStrata(tt, dx, i, cols){ var w = tt * 0.9 + (vn(dx * 0.15, tt * 0.3, i) - 0.5) * 1.1; return (cols || CNY_STRATA)[((Math.floor(w) % 5) + 5) % 5]; }
// a butte: a red column banded with strata, its cap flat and scrubby, a skirt of scree at its foot
BUILD.cnyButte = function(B, t, i){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var u = Math.hypot(dx / (t.w / 2), dy / (t.d / 2)) + (vn(dx * 0.5, dy * 0.5 + tt * 0.2, i) - 0.5) * 0.16, top = t.h * (0.92 + vn(dx * 0.3, dy * 0.3, i + 2) * 0.08);
  if (tt > top) return null; var r = tt < t.h * 0.18 ? 1 - tt / (t.h * 0.18) * 0.38 : 0.62; if (u > r) return null;
  if (tt > top - 0.4) return vn(dx * 0.6, dy * 0.6, i + 3) > 0.6 ? '#a89a5a' : '#c89a62'; return cnyStrata(tt, dx, i); }); };
// a length of trestle carrying the line: timber bents braced crosswise, sleepers and two rails on top
BUILD.cnyTrestle = function(B, t, i){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var H = t.h - 0.6, b = (((dx + t.w / 2) / 1.6) % 1 + 1) % 1;
  if (tt > H && tt < H + 0.25 && Math.abs(dy) < 1.1) return (((dx * 1.4) % 1) + 1) % 1 < 0.45 ? '#6a4628' : Math.abs(dy) < 0.4 ? '#5a3c22' : null;
  if (tt >= H + 0.25 && tt < H + 0.45 && Math.abs(Math.abs(dy) - 0.7) < 0.1) return '#a4a4ac';
  if (tt <= H && (b < 0.1 || b > 0.94)){ if (Math.abs(Math.abs(dy) - 0.9 + (H - tt) * 0.06) < 0.14) return '#7a5230'; if (Math.abs(Math.abs(dy) - Math.abs(((tt / 1.4) % 1) - 0.5) * 1.8) < 0.12 && Math.abs(dy) < 0.9) return '#6a4426'; }
  if (tt <= H && Math.abs(Math.abs(dy) - 0.85) < 0.1 && Math.abs(tt - H * 0.5) < 0.1) return '#6a4426'; return null; }); };
// the mine's mouth: a knob of rock, the timber portal in its face, the dark way in, the rails running out
BUILD.cnyPortal = function(B, t, i){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var fy = t.d / 2 - 1.2;
  if (dy > fy){ if (dy < fy + 0.5 && tt < 4.2){ var ax = Math.abs(dx); if (ax < 1.4 && tt < 3.4) return dy < fy + 0.2 ? '#140e0a' : null; if (ax < 2 && tt >= 3.4) return Math.abs(tt - 3.8) < 0.06 ? '#5a3c22' : '#8a5a30'; if (ax < 2) return (Math.floor(tt * 2) % 2) ? '#7a4a24' : '#6e4220'; }
    if (tt < 0.15 && dy >= fy + 0.5){ var ax2 = Math.abs(dx); if (Math.abs(ax2 - 0.7) < 0.1) return '#a4a4ac'; if (ax2 < 1 && (((dy * 1.4) % 1) + 1) % 1 < 0.4) return '#6a4628'; } return null; }
  var d = Math.hypot(dx / (t.w / 2), (dy + 0.6) / (t.d / 2 - 0.6), tt / t.h) + (vn(dx * 0.6, tt * 0.6, i) - 0.5) * 0.15; if (d > 1) return null; if (tt > t.h * 0.86) return '#9a8a5a'; return cnyStrata(tt, dx, i, ['#7a5040', '#8a5e48', '#6a4436', '#9a6e52', '#5e3c30']); }); };
// a headframe over the shaft: four timber legs leaning in, braced, and the sheave wheel on top
BUILD.cnyHead = function(B, t){ var x = t.x, y = t.y, zb = B.gz(x, y), H = t.h - 2;
  B.vox(x - t.w / 2, y - t.d / 2, zb - 0.1, x + t.w / 2, y + t.d / 2, zb + t.h, function(set){
    for (var a = 0; a < 4; a++){ var lx = x + (a & 1 ? 1 : -1) * 2, ly = y + (a & 2 ? 1 : -1) * 1.8; B.tube(set, lx, ly, zb, x + (lx - x) * 0.3, y + (ly - y) * 0.3, zb + H, 0.24, 0.2, '#6a4426'); }
    for (var h = 2.5; h < H; h += 2.8){ var f = 1 - h / H * 0.7; B.tube(set, x - 2 * f, y + 1.8 * f, zb + h, x + 2 * f, y + 1.8 * f, zb + h, 0.14, 0.14, '#7a5230'); B.tube(set, x - 2 * f, y - 1.8 * f, zb + h, x + 2 * f, y - 1.8 * f, zb + h, 0.14, 0.14, '#7a5230'); }
    for (var an = 0; an < 6.28; an += 0.05){ set(x + Math.cos(an) * 1.5, y, zb + H + 1.2 + Math.sin(an) * 1.5, '#3a3a40'); set(x + Math.cos(an) * 1.38, y, zb + H + 1.2 + Math.sin(an) * 1.38, '#4a4a52'); }
    for (var sp = 0; sp < 3; sp++){ var sa = sp * 1.047; B.tube(set, x - Math.cos(sa) * 1.4, y, zb + H + 1.2 - Math.sin(sa) * 1.4, x + Math.cos(sa) * 1.4, y, zb + H + 1.2 + Math.sin(sa) * 1.4, 0.08, 0.08, '#4a4a52'); }
    B.tube(set, x, y, zb + H + 1.2, x, y, zb + 0.5, 0.06, 0.06, '#2a2a2e'); B.blob(set, x, y, zb + 0.2, 1.4, 1.2, 0.3, '#3a2a1c'); }, 0.125); };
// a heap of grey tailings tipped off the line, a cart left at the top of it
BUILD.cnyTailing = function(B, t, i){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var d = Math.hypot(dx / (t.w / 2), dy / (t.d / 2)), top = t.h * (1 - d * d) * (0.9 + vn(dx, dy, i) * 0.2);
  if (tt > top) return null; return vn(dx * 0.8, tt * 1.4, i + 1) > 0.62 ? '#b0a27a' : tt < 0.3 ? '#86807a' : '#9a9488'; }); };
// the stamp mill: a tall plank mill stepped down the slope, a tin roof gone to rust in places, its stack, the stamps showing in the open bay
BUILD.cnyMill = function(B, t, i){ var wall = function(dx, dy, tt){ return (Math.floor((dx + 20) * 1.3) % 2) ? '#8a6440' : '#7a5636'; }, roof = function(dx, dy, tt){ return (Math.floor((dx + 20) * 2) % 2) ? '#8a8a90' : (vn(dx * 0.6, tt * 0.6, i) > 0.6 ? '#a8603a' : '#7a7a82'); };
  gable(B, t.x, t.y - t.d * 0.2, t.w - 2, t.d * 0.5, 6.4, 2.6, wall, roof, '#2a1a10');
  gable(B, t.x, t.y + t.d * 0.26, t.w - 1, t.d * 0.4, 3.6, 1.6, function(dx, dy, tt){ if (dy > t.d * 0.2 - 0.4 && Math.abs(dx) < 2.6 && tt > 0.6 && tt < 3.2) return (((dx + 20) * 1.6) | 0) % 2 ? '#9a9aa2' : '#1a120c'; return wall(dx, dy, tt); }, roof, '#2a1a10');
  box(B, t.x + t.w * 0.28, t.y - t.d * 0.3, 1, 1, t.h, function(dx, dy, tt){ return Math.hypot(dx, dy) < 0.45 ? (tt > t.h - 0.6 ? '#2a2a2e' : '#5a5a62') : null; }, 0.125); };
// the miners' tents round a fire: two canvas A tents, their flaps open, and the fire in its ring of stones
BUILD.cnyTents = function(B, t, i){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ for (var k = -1; k <= 1; k += 2){ var cx = dx - k * 2.4, cy = dy + 0.4 * k, w = 1.7, d = 2.2, h = 3.2;
    if (Math.abs(cy) < d && Math.abs(cx) < w){ var roof = h * (1 - Math.abs(cx) / w); if (tt < roof){ if (cy > d - 0.2 && Math.abs(cx) < (roof - tt) * 0.3 + 0.05 && tt < h * 0.8) return '#3a2a1c'; return Math.abs(cx) < 0.12 ? '#cfc2a0' : k > 0 ? '#efe6cf' : '#e6dcc0'; } } }
  var fx = dx, fy = dy - 1.6, r = Math.hypot(fx, fy); if (tt < 0.4 && r > 0.7 && r < 1) return '#7a7068'; if (tt < 0.25 && r < 0.7) return '#3a2412'; if (tt >= 0.2 && r < 0.6 * (1 - tt / 1.6)) return tt < 0.6 ? '#ffd23a' : tt < 1 ? '#ff8a1a' : '#e5483a';
  return null; }, 0.125); };
// a false front on the ghost town's street: a plank house grey with age, its tall square face, the sign flaking, a sagging porch roof, no glass left
BUILD.cnyFront = function(B, t, i){ var w = t.w - 1, d = t.d - 2.4, wh = 5.4, roofC = function(dx, dy, tt){ return (Math.floor(tt * 2.4) % 2) ? '#5a524a' : '#6a6056'; };
  gable(B, t.x, t.y - 0.8, w, d, wh, 1.8, function(dx, dy, tt){ return (Math.floor((dx + 20) * 1.4) % 2) ? '#8a8276' : '#7a7266'; }, roofC, '#1e1814');
  var fy = -0.8 + d / 2 + 0.25, top = wh + 2.6 + (i % 2) * 0.6;
  box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var u = dy - fy;
    if (u > -0.2 && u < 0.2){ var tp = top - (Math.abs(dx) > w * 0.3 ? 0.7 : 0); if (Math.abs(dx) > w / 2 || tt > tp) return null;
      if (tt > wh + 0.5 && tt < wh + 1.7 && Math.abs(dx) < w * 0.38) return Math.abs(tt - wh - 1.1) < 0.12 && ((((dx + 20) * 2) | 0) % 3) ? '#5a3c2a' : vn(dx * 0.8, tt * 0.8, i + 4) > 0.55 ? '#c49a6a' : '#d8b88a';
      if (tt < 3.6 && Math.abs(dx) < 0.9) return '#1e1814'; if (tt > 1.6 && tt < 3.6 && Math.abs(Math.abs(dx) - w * 0.32) < 0.65) return vn(dx * 2, tt * 2, i) > 0.6 ? '#3a4a52' : '#1a1612';
      return (Math.floor((tt + 20) * 1.6) % 2) ? '#aa9e8c' : '#988c7a'; }
    if (u >= 0.2 && u < 1.6){ if (tt > 3.9 && tt < 4.2 - u * 0.15 && Math.abs(dx) < w / 2) return (Math.floor((dx + 20) * 1.6) % 2) ? '#6a5e50' : '#5a5046';
      if (Math.abs(Math.abs(dx) - w / 2 + 0.3) < 0.15 && Math.abs(u - 1.4) < 0.15 && tt < 4) return '#5a5046'; if (tt < 0.25) return '#6a5e50'; } return null; }); };
// the gold vein: a dark knob of rock threaded with gold, and the riveted blast door in its face
BUILD.cnyVein = function(B, t, i){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var fy = t.d / 2 - 1.4;
  if (dy > fy){ var r = Math.hypot(dx, tt - 2.2); if (dy < fy + 0.6 && r < 2.2){ if (r > 1.85) return (Math.floor(Math.atan2(tt - 2.2, dx) * 3 + 9) % 2) ? '#8a8680' : '#9a968e'; if (dy > fy + 0.4) return r < 0.6 && (Math.abs(r - 0.52) < 0.08 || Math.abs(dx) < 0.07 || Math.abs(tt - 2.2) < 0.07) ? '#c9a227' : null;
      if (Math.abs(r - 1.6) < 0.1 && Math.floor(Math.atan2(tt - 2.2, dx) * 6 + 20) % 2 === 0) return '#3a3a40'; return Math.abs(dx) < 0.06 ? '#3a3a40' : '#6a6e76'; } return null; }
  var d = Math.hypot(dx / (t.w / 2), (dy + 0.7) / (t.d / 2 - 0.7), tt / t.h) + (vn(dx * 0.6, tt * 0.6, i) - 0.5) * 0.15; if (d > 1) return null;
  var v = vn(dx * 0.35 + tt * 0.2, tt * 0.45 - dx * 0.1, i + 8); if (Math.abs(v - 0.5) < 0.04 || Math.abs(v - 0.3) < 0.025) return vn(dx * 2, tt * 2, 2) > 0.5 ? '#ffd23a' : '#d8a82a';
  return cnyStrata(tt, dx, i, ['#5a4a42', '#4e403a', '#665448', '#46382e', '#54463c']); }); };
LMSIZE.cnyButte = [9, 7, 12]; LMSIZE.cnyTrestle = [11, 3, 5]; LMSIZE.cnyPortal = [10, 8, 8]; LMSIZE.cnyHead = [5, 5, 14]; LMSIZE.cnyTailing = [7, 5, 3];
LMSIZE.cnyMill = [10, 8, 12]; LMSIZE.cnyTents = [10, 6, 4]; LMSIZE.cnyFront = [8, 7, 9]; LMSIZE.cnyVein = [10, 8, 8];
// ---- Volcano Island's walks go where its holes go (land.js): the black sand beach, the foothills and the tiki village, the lava
// fields, the crater's rim, the summit. Each kit's ground, trees and landmarks are the ones round that stop's holes.
KIT['volcano~beach'] = kitFrom(KIT.volcano, { g:['#2e2b2f', '#3c383c', '#262326', 0.2], sandC:['#2e2b2f', '#3c383c', '#262326', 0.2], gpat:'volsand', sea:true, seaC:['#1d5f86', '#3a8ab0'], tree:['palm', 'palm', 'palm', 'basalt'],
  leaves:['#2f8139', '#3f9a46', '#246e30'], bark:'#6a5a3e', low:['rockdark', 'bush', 'rockdark', 'shell'], dens:0.75, nlm:3, lm:['basaltset', 'volCanoe', 'volTiki', 'basaltset'] });
KIT['volcano~village'] = kitFrom(KIT.volcano, { g:['#3d5a2c', '#4f6a34', '#33482a', 0.2], gpat:'volmoss', p:['#4a3a38', '#5a4844', '#3a2c2a'], tree:['palm', 'broad', 'palm', 'broad'],
  leaves:['#1f5a26', '#2b6e30', '#3f8a3a'], bark:'#4a3624', low:['fern', 'bush', 'rockdark', 'fern'], haz:'water', hazC:['#3a9aa0', '#8ad0d0'], waterC:['#3a9aa0', '#8ad0d0'],
  dens:0.95, nlm:5, lm:['volHut', 'volTiki', 'volHut', 'volHut', 'volTiki'], wall:['#7a5a34', '#4a3420'] });
KIT['volcano~fields'] = kitFrom(KIT.volcano, { g:['#2a2427', '#3a3236', '#1e1a1d', 0.2], gpat:'volrope', tree:['dead', 'basalt', 'dead'], low:['rockdark', 'ember', 'rockdark'],
  dens:0.45, nlm:4, lm:['volCone', 'vent', 'basaltset', 'volCone'] });
KIT['volcano~crater'] = kitFrom(KIT.volcano, { g:['#5e585c', '#6e686c', '#4e484c', 0.2], gpat:'volash', p:['#7a7276', '#8a8286', '#6a6266'], tree:['basalt', 'basalt', 'dead'],
  low:['rockdark', 'volShard', 'rock'], dens:0.4, nlm:4, lm:['volShards', 'vent', 'volShards', 'basaltset'], wall:['#5e585c', '#2e282c'] });
KIT['volcano~summit'] = kitFrom(KIT.volcano, { g:['#3a2a2a', '#4a2e28', '#2a2022', 0.2], gpat:'volcinder', tree:['basalt', 'basalt', 'dead'], low:['ember', 'volShard', 'rockdark'],
  p:['#5a4440', '#6a524c', '#4a3834'], dens:0.24, nlm:3, lm:['volShrine', 'vent', 'volShards'] });
LIFE_AS['volcano~beach'] = { fly:['gull', 4], mote:['ash', 10] };
LIFE_AS['volcano~village'] = { fly:['parrot', 4], mote:[['butter', 6], ['ash', 8]] };
LIFE_AS['volcano~fields'] = { fly:['vulture', 2], mote:[['ember', 34], ['ash', 22]], smoke:true };
LIFE_AS['volcano~crater'] = { mote:[['ember', 26], ['ash', 36]], smoke:true };
LIFE_AS['volcano~summit'] = { mote:[['ember', 50], ['ash', 20]], smoke:true };
// the stops' ground on the walk, in smooth patches like the holes': black sand, green moss, ropey black rock with red cracks, ash with sulphur, cinder
GPAT.volsand = function(c){ var a = vn(c.ti * 0.05, c.tj * 0.05, 61), b = vn(c.ti * 0.16, c.tj * 0.16, 62); return b > 0.76 ? '#3e4636' : a > 0.66 ? '#3c383c' : a < 0.3 ? '#252226' : '#2e2b2f'; };
GPAT.volmoss = function(c){ var a = vn(c.ti * 0.05, c.tj * 0.05, 63), b = vn(c.ti * 0.15, c.tj * 0.15, 64); return a > 0.7 ? '#5a4a34' : a > 0.6 ? '#4f6a34' : b < 0.28 ? '#33482a' : b > 0.72 ? '#47663a' : '#3d5a2c'; };
GPAT.volrope = function(c){ var a = vn(c.ti * 0.035, c.tj * 0.035, 65), cr = Math.abs(vn(c.ti * 0.025, c.tj * 0.025, 66) - 0.5), rope = Math.sin(c.ti * 0.25 + c.tj * 0.1 + vn(c.ti * 0.02, c.tj * 0.02, 67) * 14);
  if (cr < 0.012 && vn(c.ti * 0.01, c.tj * 0.01, 68) > 0.45) return cr < 0.006 ? '#ffb43a' : '#e0480e'; return a > 0.68 ? (rope > 0.4 ? '#4a4044' : '#3e3539') : a < 0.3 ? '#1c181b' : rope > 0.6 ? '#332c30' : '#2a2427'; };
GPAT.volash = function(c){ var a = vn(c.ti * 0.045, c.tj * 0.045, 69), s = vn(c.ti * 0.02, c.tj * 0.02, 70); return s > 0.8 ? (a > 0.55 ? '#c8b448' : '#a8983c') : a > 0.78 ? '#7a6e5a' : a > 0.6 ? '#6e686c' : a < 0.3 ? '#4e484c' : '#5e585c'; };
GPAT.volcinder = function(c){ var a = vn(c.ti * 0.035, c.tj * 0.035, 71), b = vn(c.ti * 0.08, c.tj * 0.08, 72); return a > 0.72 ? '#5a3424' : a > 0.6 ? '#4a2e28' : b < 0.3 ? '#2a2022' : '#3a2a2a'; };
// an obsidian shard to walk past (a low): a black glass blade with a violet sheen on its lit face
BUILD.volShard = function(B, t, i){ var x = t.x, y = t.y, lean = (hash(i, 3, 7) - 0.5) * 0.5;
  B.solid(x - 0.9, y - 0.7, B.gz(x, y) - 0.1, x + 0.9, y + 0.7, B.gz(x, y) + 1.5, function(px, py, pz){ var tt = pz - B.gz(x, y), dx = px - x - lean * tt, dy = py - y, w = 0.55 * (1 - tt / 1.45);
    if (Math.abs(dx) + Math.abs(dy) * 1.2 > w) return null; return dx + dy * 0.4 > w * 0.3 ? '#6a5a8e' : dx < -w * 0.25 ? '#0c0a12' : '#221d2c'; }, 0.125); };
LOWR.volShard = 0.7; LOWH.volShard = 1.5;
// a tiki hut: a round wall of bamboo with its doorway to the front, the fire showing inside, a tall thatched cone with a top knot
BUILD.volHut = function(B, t, i){ var r = 2.6, wh = 3.2, rh = 4.6, R2 = r + 0.8; box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
  if (tt >= wh - 0.5){ var rr = (tt - wh + 0.5) / rh; if (d < R2 * (1 - rr)){ if (d < R2 * (1 - rr) - 0.6) return null; var ring = Math.floor(tt * 1.6 + vn(a * 4, 1, i) * 0.6);
    return rr < 0.06 ? '#5a4020' : rr > 0.88 ? '#4a3018' : ring % 3 === 0 ? '#7a5a2c' : ring % 3 === 1 ? '#9a7638' : '#8a6830'; } return null; }
  if (d > r || d < r - 0.35) return null; if (dy > 0 && Math.abs(dx) < 0.8 && tt < 2.6) return d < r - 0.2 ? '#ff9a2a' : null;   // the doorway, the fire's light on the far wall
  return Math.floor((a + 4) * r * 2.4) % 2 ? '#b8945a' : '#9a7444'; }); };
// a tiki between two torches: a carved post with a face, painted bands and a crown
BUILD.volTiki = function(B, t, i){ var H = 6.4; box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var ax = Math.abs(dx), u = tt / H;
  if (Math.abs(ax - 1.9) < 0.12 && Math.abs(dy) < 0.12 && tt < 3.4) return (tt * 2 | 0) % 2 ? '#7a5a34' : '#5a3818';   // the torches
  if (Math.abs(ax - 1.9) < 0.3 && Math.abs(dy) < 0.3 && tt >= 3.4 && tt < 3.7) return '#3d2614';
  if (Math.hypot(ax - 1.9, dy) < 0.3 * (1 - (tt - 3.7) / 0.9) && tt >= 3.7) return tt > 4.1 ? '#ffd25a' : '#ff7a1a';
  var hw = u > 0.86 ? 1.25 : 1.05; if (ax > hw || Math.abs(dy) > 0.85 || tt > H) return null;
  if (dy > 0.6){ if (u > 0.62 && u < 0.75 && Math.abs(ax - 0.5) < 0.3) return (u > 0.66 && u < 0.71 && Math.abs(ax - 0.5) < 0.14) ? '#f4e8c8' : '#1a1210';
    if (u > 0.49 && u < 0.62 && ax < 0.2) return '#5a3a22'; if (u > 0.36 && u < 0.47 && ax < 0.75) return Math.abs(u - 0.415) < 0.02 ? '#1a1210' : '#e8dcc0'; }
  if (Math.abs(u - 0.84) < 0.025 || Math.abs(u - 0.28) < 0.025) return '#c8402e'; return (tt * 1.2 | 0) % 2 ? '#7a5030' : '#6a4428'; }, 0.125); };
// an outrigger canoe drawn up on the sand
BUILD.volCanoe = function(B, t, i){ var dir = i % 2 ? 1 : -1; box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var u = dx * dir / 3.8, hw = 0.65 * Math.sqrt(Math.max(0, 1 - u * u));
  if (Math.abs(dy - 0.4) < hw && tt < 1 + u * u * 0.6){ if (Math.abs(dy - 0.4) < hw - 0.18 && tt > 0.35) return null; return tt > 0.8 ? '#d8b47a' : Math.abs(tt - 0.45) < 0.08 ? '#c8402e' : '#8a5a30'; }
  if (Math.abs(dy + 1.1) < 0.2 && Math.abs(dx) < 2.4 && tt < 0.45) return '#a07a48';
  if (Math.abs(Math.abs(dx) - 1.3) < 0.12 && dy < 0.4 && dy > -1.1 && Math.abs(tt - 0.7) < 0.12) return '#6a4a2a'; return null; }, 0.125); };
// a spatter cone: a heap of red black cinder with a glowing throat
BUILD.volCone = function(B, t, i){ var R = t.w / 2, H = t.h; box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var d = Math.hypot(dx, dy), rad = R * (1 - tt / H * 0.62) + (vn(Math.atan2(dy, dx) * 2.5, tt, i) - 0.5) * 0.4;
  if (d > rad) return null; if (d < R * 0.26 && tt > H - 1.2) return tt > H - 0.8 ? null : '#ffb43a'; if (tt > H - 0.5) return '#8a3a1e'; return vn(dx, dy + tt, i + 3) > 0.55 ? '#4a2e26' : '#33282a'; }); };
// obsidian standing in blades: a lit face with a violet sheen, the others near black
BUILD.volShards = function(B, t, i){ var Q = []; for (var k = 0; k < 5; k++){ var a = hash(i, k, 61) * 6.28, r = k ? 0.8 + hash(k, i, 62) * 1 : 0; Q.push([Math.cos(a) * r, Math.sin(a) * r * 0.7, k ? 2.2 + hash(k, i, 63) * 2 : 5.4, k ? 0.6 : 0.95, (hash(i, k, 64) - 0.5) * 0.5]); }
  box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ for (var k = 0; k < Q.length; k++){ var q = Q[k]; if (tt > q[2]) continue; var ex = dx - q[0] - q[4] * tt, ey = dy - q[1], w = q[3] * (1 - tt / q[2]);
    if (Math.abs(ex) + Math.abs(ey) < w) return ex + ey * 0.4 > w * 0.3 ? '#6a5a8e' : ex < -w * 0.25 ? '#0c0a12' : '#221d2c'; } return null; }, 0.125); };
// the fire shrine at the summit: a stone platform, a stone tiki at the back, a brazier burning at each front corner
BUILD.volShrine = function(B, t, i){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var ax = Math.abs(dx);
  if (tt < 0.9){ if (ax > 4.2 || Math.abs(dy) > 2.8 || (dy > 1.8 && tt > 0.45)) return null; return (Math.abs(((dx + 20) % 1.6) - 0.8) > 0.74 || Math.abs(tt - 0.45) < 0.06) ? '#2a2427' : '#4a4246'; }
  var bx = ax - 3.2, by = dy - 1.2; if (Math.hypot(bx, by) < 0.3 && tt < 3.4) return '#3a3337';
  if (Math.hypot(bx, by) < 0.75 && tt >= 3.4 && tt < 3.9) return '#1e1a1d'; if (Math.hypot(bx, by) < 0.6 * (1 - (tt - 3.9) / 1.4) && tt >= 3.9) return tt > 4.5 ? '#ffd25a' : '#ff7a1a';
  var u = (tt - 0.9) / 5.6, hy = dy + 1.4; if (ax > (u > 0.86 ? 1.25 : 1.05) || Math.abs(hy) > 0.8 || u > 1) return null;
  if (hy > 0.55){ if (u > 0.62 && u < 0.75 && Math.abs(ax - 0.5) < 0.3) return (u > 0.66 && u < 0.71 && Math.abs(ax - 0.5) < 0.14) ? '#ff7a1a' : '#141113';
    if (u > 0.36 && u < 0.47 && ax < 0.75) return Math.abs(u - 0.415) < 0.02 ? '#141113' : '#8a8086'; }
  return (tt * 1.4 | 0) % 2 ? '#5a5056' : '#4a4246'; }, 0.125); };
LMSIZE.volHut = [8, 8, 8.4]; LMSIZE.volTiki = [5, 2, 6.5]; LMSIZE.volCanoe = [8, 3, 1.6]; LMSIZE.volCone = [6, 6, 4]; LMSIZE.volShards = [5, 4, 5.6]; LMSIZE.volShrine = [9, 6, 6.6];
/* ---- Sky Islands' stops on the walk (land.js, STOPS.sky): the launch meadow, the cloud docks, the floating gardens, the old
   sky ruins and the castle in the clouds. Each walk is on the same ground as its holes (grass, boards, garden, flagstones),
   with the same things standing about at walk scale, and the clouds showing through where the island ends or has cracked. */
// grass in smooth patches, the way the holes paint it: base, lighter, darker, and a fourth colour for the odd big patch
function skyGrassAt(c, C, sd){ var a = vn(c.ti * 0.03, c.tj * 0.03, sd), b = vn(c.ti * 0.085, c.tj * 0.085, sd + 1); return a > 0.72 ? C[3] : a < 0.28 ? C[2] : b > 0.64 ? C[1] : b < 0.3 ? C[2] : C[0]; }
GPAT.skymeadow = function(c){ return skyGrassAt(c, ['#66b952', '#74c45c', '#58a848', '#9ccc5a'], 61); };
GPAT.skydocks = function(c){ return skyGrassAt(c, ['#62b450', '#70c05a', '#55a446', '#8cc45a'], 63); };
GPAT.skycastle = function(c){ return skyGrassAt(c, ['#5fae4c', '#6cba56', '#529f44', '#86c25e'], 65); };
// the gardens: grass, and beds of pink, yellow and violet flowers in drifts through it
GPAT.skygarden = function(c){ var f = vn(c.ti * 0.035, c.tj * 0.035, 67); if (f > 0.76){ var a = vn(c.ti * 0.012, c.tj * 0.012, 68);
  return f < 0.785 ? '#4f9a42' : a > 0.5 ? '#f48aae' : '#ffd23f'; } return skyGrassAt(c, ['#5cb24c', '#6abe56', '#4fa042', '#7cc85e'], 66); };
// the ruins: worn white flagstones two feet by one and a half, grass winning in patches
GPAT.skyruins = function(c){ var g = vn(c.ti * 0.03, c.tj * 0.03, 71); if (g < 0.38) return skyGrassAt(c, ['#6ab454', '#78c05e', '#5aa44a', '#94c86a'], 72);
  var row = Math.floor(c.tj / 12), off = row % 2 ? 8 : 0; if (c.tj % 12 === 0 || (c.ti + off) % 16 === 0) return g < 0.46 ? '#7ab060' : '#c2b8a0';
  var a = vn(c.ti * 0.05, c.tj * 0.05, 73); return a > 0.65 ? '#ece6d6' : a < 0.35 ? '#d6ceb8' : '#e2dccb'; };

var SKY_LEAF = ['#3f9a46', '#5bb352', '#2f8139'], SKY_BLOSSOM = ['#f4a7c0', '#f8c4d6', '#e88aa8'];
KIT['sky~meadow'] = kitFrom(KIT.sky, { sandC:['#f4f7fb', '#ffffff', '#e2e9f2', 0.2], g:['#66b952', '#74c45c', '#58a848', 0.2], gpat:'skymeadow', p:['#d8c48e', '#e2d09c', '#c8b07a'], tree:['broad', 'broad', 'broad'], leaves:SKY_LEAF, bark:'#6a4a2a',
  low:['bush', 'hay', 'bush', 'rock'], dens:0.2, sea:true, seaC:['#e2ecf7', '#ffffff'], nlm:4, lm:['skyBalloonPad', 'skyHaystacks', 'skyBalloonPad', 'skyWindsock'], wall:['#e8e2d0', '#a99c7c'] });
KIT['sky~docks'] = kitFrom(KIT.sky, { sandC:['#f4f7fb', '#ffffff', '#e2e9f2', 0.2], g:['#62b450', '#70c05a', '#55a446', 0.2], gpat:'skydocks', p:['#a8763f', '#b4824a', '#7a5230'], plank:true, tree:['broad', 'broad', 'pine'], leaves:SKY_LEAF, bark:'#6a4a2a',
  low:['bush', 'rock', 'bush', 'hay'], dens:0.16, sea:true, seaC:['#e2ecf7', '#ffffff'], nlm:5, lm:['skyMast', 'skyOffice', 'skyCargo', 'lamps', 'skyCargo'], wall:['#e8e2d0', '#3f7fb5'] });
KIT['sky~gardens'] = kitFrom(KIT.sky, { g:['#5cb24c', '#6abe56', '#4fa042', 0.2], gpat:'skygarden', p:['#e2dac6', '#ece6d6', '#c2b8a0'], paved:true, tree:['broad', 'broad', 'puff'], leaves:SKY_BLOSSOM, bark:'#6a4a2a',
  low:['bush', 'fern', 'bush'], haz:'water', hazC:['#3fa8c8', '#9fe0ee'], waterC:['#3fa8c8', '#9fe0ee'], dens:0.7, nlm:4, lm:['skyTerrace', 'skyIsleTree', 'kite', 'skyIsleTree'], wall:['#e2dac6', '#9a8468'] });
KIT['sky~ruins'] = kitFrom(KIT.sky, { g:['#e2dccb', '#ece6d6', '#d6ceb8', 0.2], gpat:'skyruins', p:['#e8e2d2', '#f2eee2', '#c8bea6'], paved:true, tree:['broad', 'broad', 'puff'], leaves:['#5aa84c', '#7cc066', '#4a9440'], bark:'#6a4a2a',
  low:['skyStone', 'bush', 'skyStone'], haz:'water', hazC:['#e8f0f9', '#ffffff'], waterC:['#dfe9f6', '#ffffff'], dens:0.3, nlm:4, lm:['skyGate', 'skyColumns', 'skyRainbow', 'skyColumns'], wall:['#e8e2d2', '#b8ae96'] });
KIT['sky~castle'] = kitFrom(KIT.sky, { sandC:['#f4f7fb', '#ffffff', '#e2e9f2', 0.2], g:['#5fae4c', '#6cba56', '#529f44', 0.2], gpat:'skycastle', p:['#d0c8b4', '#e2dccb', '#b0a68e'], paved:true, tree:['pine', 'broad', 'pine'], leaves:SKY_LEAF, bark:'#6a4a2a',
  low:['bush', 'skyStone', 'bush'], dens:0.22, sea:true, seaC:['#e2ecf7', '#ffffff'], nlm:3, lm:['skyCastle', 'skyMill', 'lamps'], wall:['#f4f0e4', '#3f7fd5'] });
LIFE_AS['sky~meadow'] = { fly:['song', 4], balloons:4, mote:['butter', 8] };
LIFE_AS['sky~docks'] = { fly:['gull', 5], balloons:2 };
LIFE_AS['sky~gardens'] = { fly:['song', 3], mote:[['butter', 12], ['petal', 14]], balloons:1 };
LIFE_AS['sky~ruins'] = { fly:['crow', 3], balloons:1 };
LIFE_AS['sky~castle'] = { fly:['gull', 4], balloons:2, mote:['butter', 6] };

LMSIZE.skyBalloonPad = [7, 7, 14]; LMSIZE.skyHaystacks = [8, 5, 4]; LMSIZE.skyWindsock = [4, 2, 7]; LMSIZE.skyMast = [16, 6, 14]; LMSIZE.skyOffice = [9, 6, 13]; LMSIZE.skyCargo = [6, 4, 3];
LMSIZE.skyTerrace = [11, 8, 7]; LMSIZE.skyIsleTree = [7, 7, 15]; LMSIZE.skyGate = [9, 2.4, 9]; LMSIZE.skyColumns = [10, 3, 7.5]; LMSIZE.skyRainbow = [17, 3, 9]; LMSIZE.skyCastle = [18, 9, 20]; LMSIZE.skyMill = [11, 6, 17];
LOWR.skyStone = 1; LOWH.skyStone = 1.2;

// a balloon's envelope in twelve gores with a band round it, its basket and ropes, at walk scale: zb is the basket's floor
var SKY_ENV = [['#ff5a3c', '#ffd23f', '#ffffff'], ['#3fa7e0', '#ffffff', '#ffd23f'], ['#a86ad8', '#ffffff', '#ff8ab0'], ['#7dd56f', '#ffd23f', '#ff5a3c']];
function skyEnvelope(B, x, y, zb, s, cols){ var R0 = 2.6 * s, cz = zb + 6 * s, mz = zb + 3 * s;
  B.solid(x - R0 - 0.2, y - R0 - 0.2, zb, x + R0 + 0.2, y + R0 + 0.2, cz + R0 + 0.2, function(px, py, pz){ var dx = px - x, dy = py - y, r = Math.hypot(dx, dy), t = pz - zb;
    if (t < 1.2 * s) return Math.max(Math.abs(dx), Math.abs(dy)) < 0.8 * s ? (t > 1.05 * s ? '#5a3a1e' : (Math.floor(t / s * 5) % 2 ? '#b08a52' : '#9a7444')) : null;
    if (pz < mz){ var k = (t - 1.2 * s) / (mz - zb - 1.2 * s), cr = 0.7 * s + k * 0.2 * s; if (k > 0.8 && r < 0.4 * s) return '#3a3a40'; return (Math.abs(Math.abs(dx) - cr) < 0.1 && Math.abs(Math.abs(dy) - cr) < 0.1) ? '#4a3a2a' : null; }
    var rad = pz > cz ? Math.sqrt(Math.max(0, R0 * R0 - (pz - cz) * (pz - cz))) : R0 * (0.3 + 0.7 * Math.sin((pz - mz) / (cz - mz) * 1.5708)); if (r > rad) return null;
    if (Math.abs(pz - cz + 0.6 * s) < 0.28 * s) return cols[2]; return Math.floor((Math.atan2(dy, dx) + 3.1416) / 6.2832 * 12) % 2 ? cols[0] : cols[1]; }, 0.2); }
// a balloon standing ready on the meadow, tied down with sandbags at the corners of its basket
BUILD.skyBalloonPad = function(B, t, i){ skyEnvelope(B, t.x, t.y, B.gz(t.x, t.y), 1, SKY_ENV[i % 4]);
  box(B, t.x, t.y, t.w, t.d, 1, function(dx, dy, tt){ for (var k = 0; k < 4; k++){ var sx = (k & 1 ? 1 : -1) * 2.2, sy = (k & 2 ? 1 : -1) * 2.2; if (Math.hypot(dx - sx, dy - sy, (tt - 0.3) * 1.3) < 0.42) return '#c8a868'; } return null; }, 0.125); };
// three haystacks and a round bale
function skyStack(B, x, y, s){ box(B, x, y, 2.4 * s, 2.4 * s, 3.4 * s, function(dx, dy, tt){ var t = tt / s, r = Math.hypot(dx, dy) / s, w = 1.15 * Math.sqrt(Math.max(0, 1 - Math.pow(t / 3.2, 2.2)));
  if (r > w) return null; if (t > 2.9) return '#c89a3a'; return Math.floor(t * 2.2 + vn(dx * 2, dy * 2, 5) * 0.8) % 2 ? '#e2bc5c' : '#d4aa48'; }, 0.125); }
BUILD.skyHaystacks = function(B, t, i){ skyStack(B, t.x - 2.4, t.y - 0.8, 1); skyStack(B, t.x + 0.4, t.y - 1.2, 0.85); skyStack(B, t.x + 2.6, t.y + 0.4, 0.7);
  box(B, t.x - 0.6, t.y + 1.4, 2.4, 1.6, 1.6, function(dx, dy, tt){ var r = Math.hypot(dy, tt - 0.75); if (r > 0.75 || Math.abs(dx) > 1.1) return null; if (Math.abs(dx) > 1) return Math.floor(r * 8) % 2 ? '#c89a3a' : '#e2bc5c'; return Math.abs(Math.abs(dx) - 0.45) < 0.08 ? '#8a5a2a' : '#dcb452'; }, 0.125); };
// the launch flag: a pole and a striped windsock streaming east
BUILD.skyWindsock = function(B, t){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ if (Math.hypot(dx + 1.4, dy) < 0.12 && tt < 6.6) return '#e8e2d0';
  var u = dx + 1.3, rr = 0.42 - u * 0.1; if (u > 0 && u < 3 && Math.hypot(dy, tt - 6 + u * 0.15) < rr) return Math.floor(u * 1.6) % 2 ? '#ff5a3c' : '#ffffff'; return null; }, 0.125); };
// the mooring mast with an airship tied up to it, nose in: a cream envelope with a red band, fins, the gondola with its windows lit
BUILD.skyMast = function(B, t, i){ var mx = t.x + t.w / 2 - 1.4, dir = -1;
  box(B, mx, t.y, 2.4, 2.4, t.h, function(dx, dy, tt){ var w = 1 - tt * 0.05; if (tt > 11.6) return Math.hypot(dx, dy) < 0.5 ? (tt > 12.6 ? '#d8402e' : '#3a3a40') : null;
    if (Math.abs(Math.abs(dx) - w) < 0.14 && Math.abs(Math.abs(dy) - w) < 0.14) return '#4a4a52'; if ((Math.abs(Math.abs(dx) - w) < 0.1 || Math.abs(Math.abs(dy) - w) < 0.1) && Math.abs((tt % 2) - 1) < 0.1 && Math.max(Math.abs(dx), Math.abs(dy)) <= w + 0.14) return '#5a5a62'; return null; }, 0.125);
  var X = mx - 6.6, Z = 10.2, a = 5.6, rb = 1.9;
  box(B, X, t.y, 2 * a + 1.2, rb * 2 + 1.6, Z + rb + 0.6, function(dx, dy, tt){ var u = dx * -dir, dz = tt - Z; var e = Math.hypot(u / a, dy / rb, dz / rb);
    if (e < 1){ if (Math.abs(u / a - 0.55) < 0.06 || Math.abs(u / a + 0.62) < 0.05) return '#d8402e'; return Math.floor((Math.atan2(dz, dy) + 3.1416) * 2.6) % 2 ? '#f2ead8' : '#e6dcc4'; }
    if (u < -a * 0.62 && u > -a - 0.5){ var k = (-a * 0.62 - u) / (a * 0.38 + 0.5), fh = rb * (0.5 + k * 0.7); if ((Math.abs(dy) < 0.12 && Math.abs(dz) < fh) || (Math.abs(dz) < 0.12 && Math.abs(dy) < fh)) return Math.abs(dz) > fh - 0.4 || Math.abs(dy) > fh - 0.4 ? '#d8402e' : '#c9bfa6'; }
    var gz = dz + rb + 1; if (Math.abs(u) < 1.8 && Math.abs(dy) < 0.6 && Math.abs(gz) < 0.5){ if (dy > 0.45 && Math.abs(gz) < 0.18 && ((u + 4) % 0.8) < 0.45) return '#ffe08a'; return gz > 0.35 ? '#5a3a1e' : '#8a5a34'; }
    if (Math.abs(dy) < 0.1 && Math.abs(Math.abs(u) - 1) < 0.1 && gz >= 0.5 && gz < 1) return '#4a3a2a'; return null; }); };
// the dock office: a white gabled shed with a blue roof and the weather vane on its ridge
BUILD.skyOffice = function(B, t, i){ gable(B, t.x, t.y, t.w - 1.6, t.d - 1, 5, 3, function(dx, dy, tt){ return Math.floor((dx + 20) * 1.4) % 2 ? '#e8e2d0' : '#dcd4bc'; }, function(dx, dy, tt){ return (tt * 2.6 | 0) % 2 ? '#3f7fb5' : '#346c9c'; }, '#4a2e1c');
  box(B, t.x, t.y, 4, 2, t.h, function(dx, dy, tt){ var z = tt - 8.2; if (z < 0) return null; if (Math.hypot(dx, dy) < 0.09 && z < 3.4) return '#2a2a30';
    if (Math.abs(z - 2) < 0.08 && ((Math.abs(dy) < 0.08 && Math.abs(dx) < 1) || (Math.abs(dx) < 0.08 && Math.abs(dy) < 0.9))) return '#2a2a30';
    if (Math.abs(dy) < 0.08 && Math.abs(z - 2.9) < 0.1 && Math.abs(dx) < 1.6) return '#e0b040'; if (Math.abs(dy) < 0.08 && dx > 1.1 && dx < 1.9 && Math.abs(z - 2.9) < (1.9 - dx) * 0.5) return '#e0b040';
    if (Math.abs(dy) < 0.08 && dx < -1 && dx > -1.9 && z > 2.9 && z < 2.9 + (dx + 1.9) * 0.8) return '#e0b040'; return null; }, 0.125); };
// cargo for the airships: hay bales and crates stacked by the boards
BUILD.skyCargo = function(B, t, i){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){
  if (dx < 0.4){ var cx = dx + 1.4, k = tt > 1.3 ? 1 : 0, ox = k ? 0.5 : 0; if (Math.abs(cx - ox) < 1.3 && Math.abs(dy) < 0.9 && tt < 1.3 + k * 1.2 && (!k || Math.abs(cx - ox) < 1)){ var r = Math.hypot(dy, (tt % 1.3) - 0.65); return Math.abs(Math.abs(cx - ox) - 0.5) < 0.07 ? '#8a5a2a' : '#dcb452'; } }
  var qx = dx - 1.6; if (Math.abs(qx) < 0.9 && Math.abs(dy) < 0.9 && tt < 1.7){ var e = Math.max(Math.abs(qx), Math.abs(dy)) > 0.78 || tt > 1.55 || tt < 0.12; return e || Math.abs(qx - (tt - 0.85)) < 0.1 ? '#6a4420' : '#a8783e'; }
  return null; }, 0.125); };
// a raised garden terrace of pale rock with a pool on top, its water spilling down the front into a pool at its foot
BUILD.skyTerrace = function(B, t, i){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var top = 4.4 + (vn(dx * 0.5, 3, i) - 0.5) * 0.8, rx = t.w / 2 - 0.4, ry = t.d / 2 - 1.8;
  if (dy > ry - 0.2){ var pd = Math.hypot(dx / 2.6, (dy - ry - 1) / 1.1); if (pd < 1 && tt < 0.25) return pd > 0.85 ? '#cfc6b0' : (vn(dx * 3, dy * 3, i) > 0.62 ? '#9fe0ee' : '#3fa8c8'); if (dy > ry) return null; }
  var d = Math.hypot(dx / rx, (dy + 0.6) / (ry + 0.6)) + (vn(dx * 0.8, tt * 0.8, i + 3) - 0.5) * 0.15; if (d > 1 || tt > top) return null;
  if (Math.abs(dx) < 1 && d > 0.8) return vn(dx * 4, tt * 0.7, i + 5) > 0.55 ? '#ffffff' : '#bfe8f4';   // the water down the face
  if (tt > top - 0.35) return Math.hypot(dx / 2.4, (dy + 0.8) / 1.4) < 1 ? '#3fa8c8' : (vn(dx * 0.6, dy * 0.6, i) > 0.62 ? '#f48aae' : '#5fae4e');
  return Math.floor(tt * 1.3 + vn(dx, dy, i) * 0.6) % 2 ? '#c8b494' : '#b8a07e'; }); };
// a little floating island hovering over the path's edge, a tree on it and a trickle of water off one side
BUILD.skyIsleTree = function(B, t, i){ var zt = 5.4, r = 2.6, x = t.x, y = t.y;
  box(B, x, y, t.w, t.d, t.h, function(dx, dy, tt){ var a = Math.atan2(dy, dx), rr = Math.hypot(dx, dy * 1.15) / (r * (0.88 + vn(a * 1.6 + 3, i, 7) * 0.24));
    if (Math.abs(dx - 1.4) < 0.35 && dy > 1.2 && dy < 1.7 && tt < zt - 0.2 && tt > 0.4) return vn(dx * 6, tt * 0.8, i) > 0.5 ? '#ffffff' : '#bfe8f4';   // the trickle
    if (rr > 1) return null; var dz = zt - tt, d = r * 1.6 * (1 - Math.pow(rr, 1.6)); if (dz < 0 || dz > d) return null; if (dz < 0.35) return '#5fae4e'; if (dz < 0.8) return '#6a4a2c'; return Math.floor(dz * 1.4) % 2 ? '#c8b494' : '#b8a07e'; });
  var kx = kitOf(t.th); BUILD.broad({ vox:B.vox, tube:B.tube, blob:B.blob, solid:B.solid, gz:function(){ return B.gz(x, y) + zt; } }, { th:t.th, x:x - 0.3, y:y - 0.3, h:7, cr:2.6 }, i); };
// the old gate: two fluted pillars and a lintel with a gold sun on it
BUILD.skyGate = function(B, t, i){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ if (Math.abs(dy) > 1) return null;
  if (tt > 7 && tt < 8.6 && Math.abs(dx) < 4.2){ if (dy > 0.6 && Math.hypot(dx, tt - 7.8) < 0.55) return '#ffd23f'; return tt > 8.3 ? '#cfc6b0' : '#e8e2d2'; } if (tt > 6.5 && tt <= 7 && Math.abs(dx) < 3.8) return '#ddd6c4';
  if (Math.abs(Math.abs(dx) - 3) < 0.85 && tt <= 6.5){ if (tt < 0.6) return '#cfc6b0'; var r = Math.hypot(Math.abs(dx) - 3, dy); if (r > 0.75) return null; return Math.floor((Math.atan2(dy, Math.abs(dx) - 3) + 3.1416) * 2.2) % 2 ? '#f2eee2' : '#ddd6c4'; } return null; }); };
// a row of marble columns, two standing, the rest broken off, and a drum fallen in the grass
BUILD.skyColumns = function(B, t, i){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ for (var k = 0; k < 4; k++){ var cx = -3.6 + k * 2.4, H = k % 3 === 0 ? 7 : 2 + hash(i, k, 3) * 3, top = k % 3 === 0 ? H : H - 0.3 + vn(dx * 4, dy * 4, k) * 0.6;
    if (Math.abs(dx - cx) < 1 && Math.abs(dy) < 1 && tt <= top){ if (tt < 0.5 || (k % 3 === 0 && tt > H - 0.5)) return Math.max(Math.abs(dx - cx), Math.abs(dy)) < 0.95 ? '#e8e2d2' : null; var r = Math.hypot(dx - cx, dy); if (r > 0.7) return null; return Math.floor((Math.atan2(dy, dx - cx) + 3.1416) * 2.2) % 2 ? '#f2eee2' : '#ddd6c4'; } }
  if (Math.hypot(dy - 1.1, tt - 0.6) < 0.6 && Math.abs(dx - 1) < 1) return Math.abs(dx - 1) > 0.9 ? '#ddd6c4' : '#ece6d8'; return null; }); };
var SKY_RAIN = ['#ff5a5a', '#ff9a3a', '#ffd23f', '#6ad26a', '#3fa7e0', '#7a6ad8'];
// a rainbow standing out of a cloud at each end
BUILD.skyRainbow = function(B, t, i){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var R0 = 7.6, d = Math.hypot(dx, tt + 0.4), k = (R0 - d) / 0.55;
  if (Math.abs(dy) < 0.3 && k >= 0 && k < 6) return SKY_RAIN[k | 0];
  for (var s = -1; s <= 1; s += 2){ var cx = s * 6.1; if (Math.hypot((dx - cx) / 2.4, dy / 1.4, (tt - 0.6) / 1.4) < 1 || Math.hypot((dx - cx - s * 1.2) / 1.4, dy / 1.2, (tt - 1.5) / 1.1) < 1) return vn(dx * 2, tt * 2, 4) > 0.6 ? '#eef4fb' : '#ffffff'; }
  return null; }, 0.2); };
// the castle front: a white curtain wall with its gate and battlements, a tower at each end and two behind, blue and red spires, lit windows
function skyTower(B, x, y, r, H, roof){ box(B, x, y, 2 * r + 0.6, 2 * r + 0.6, H + r * 2.6 + 2, function(dx, dy, tt){ var rr = Math.hypot(dx, dy);
  if (tt < H){ if (rr > r) return null; if (dy > r * 0.6 && Math.abs(dx) < 0.3 && Math.abs(((tt + 1) % 3) - 1.5) < 0.5 && tt > 2) return '#ffd77a'; return Math.floor(tt * 1.1) % 2 ? '#f4f0e4' : '#e8e2d2'; }
  if (tt < H + 0.6) return rr < r + 0.3 ? '#ddd6c4' : null; var k = (tt - H - 0.6) / (r * 2.4); if (k < 1) return rr < (r + 0.3) * (1 - k) ? (Math.floor(Math.atan2(dy, dx) * 2.5 + 8) % 2 ? roof[0] : roof[1]) : null;
  if (rr < 0.1 && tt < H + r * 2.4 + 1.8) return '#3a3a40'; if (Math.abs(dy) < 0.08 && dx > 0 && dx < 1.2 && tt > H + r * 2.4 + 1.1 && tt < H + r * 2.4 + 1.7 - dx * 0.4) return '#ff5a3c'; return null; }); }
BUILD.skyCastle = function(B, t, i){ var q = t.w / 18, hw = t.w / 2 - 1.8 * q, fy = t.y + t.d / 2 - 1.2 * q, BL = ['#3f7fd5', '#346cb8'], RD = ['#d8402e', '#b8342a'];
  skyTower(B, t.x, t.y - 1.4 * q, 2.4 * q, 9.5 * q, BL); skyTower(B, t.x - hw * 0.55, t.y - 0.8 * q, 1.4 * q, 8 * q, RD); skyTower(B, t.x + hw * 0.55, t.y - 0.8 * q, 1.4 * q, 8 * q, RD);
  box(B, t.x, fy, 2 * hw, 1.4 * q, 7 * q, function(dx, dy, tt){ if (Math.abs(dy) > 0.6 * q) return null; dx /= q; tt /= q; if (tt > 5.6){ if (tt > 6.6 || Math.floor((dx + 40) * 0.8) % 2) return null; }
    if (Math.abs(dx) < 1.5 && tt < 3.8 && (tt < 2.6 || Math.hypot(dx, tt - 2.6) < 1.5)) return dy > 0.4 * q ? '#6a4a2c' : null; if (dy > 0.4 * q && Math.abs(Math.abs(dx) - 4) < 0.35 && tt > 2.6 && tt < 4.2) return '#ffd77a';
    var row = Math.floor(tt * 1.1), col = Math.floor(dx * 0.7 + (row % 2) * 0.5); return ((tt * 1.1) % 1) < 0.1 ? '#cfc6b0' : (hash(col, row, 7) < 0.3 ? '#e8e2d2' : '#f4f0e4'); });
  skyTower(B, t.x - hw, fy, 1.8 * q, 7.4 * q, BL); skyTower(B, t.x + hw, fy, 1.8 * q, 7.4 * q, BL); };
// the cloud mill: a white tower, a red cap, four sails facing the path
BUILD.skyMill = function(B, t, i){ var q = t.h / 13; box(B, t.x, t.y, 3.4 * q, 3.4 * q, 9.4 * q, function(dx, dy, tt){ dx /= q; dy /= q; tt /= q; var r = Math.hypot(dx, dy), w = 1.6 - tt / 7.6 * 0.5;
  if (tt < 7.6){ if (r > w) return null; if (dy > w * 0.7 && Math.abs(dx) < 0.45 && tt < 1.8) return '#4a2e1c'; if (dy > w * 0.6 && Math.abs(dx) < 0.3 && Math.abs(tt - 4.4) < 0.4) return '#ffd77a'; return Math.floor(tt * 1.2) % 2 ? '#f4f0e4' : '#e8e2d2'; }
  return r < 1.3 * (1 - (tt - 7.6) / 1.8 * 0.8) ? '#8a3a2a' : null; });
  var hz = 7.2, ang = 0.4 + hash(i, 9, 9); box(B, t.x, t.y + 1.6 * q, 9.6 * q, 1, 13 * q, function(dx, dy, tt){ dx /= q; tt /= q; var dz = tt - hz; if (Math.abs(dy) > 0.2) return null; if (Math.hypot(dx, dz) < 0.35) return '#5a3a1e';
    for (var s = 0; s < 4; s++){ var a = ang + s * 1.5708, ux = Math.cos(a), uz = Math.sin(a), al = dx * ux + dz * uz, ac = -dx * uz + dz * ux;
      if (al > 0.3 && al < 4.6){ if (Math.abs(ac) < 0.12) return '#6a4a2c'; if (ac > 0.12 && ac < 1){ return Math.abs(((al * 1.5) % 1) - 0.5) < 0.1 || ac > 0.9 ? '#8a6a44' : '#f4efe2'; } } } return null; }, 0.125); };
// a worn block of white stone, half sunk in the grass
BUILD.skyStone = function(B, t, i){ rockAt(B, t.x, t.y, 1, ['#e4dece', '#d0c8b4', '#ece6d8'], i); };
/* ---- Dino Valley's stops on the walk, the same places its holes stand in (land.js): the fern meadow under the bone wall,
   the swamp below the falls, the fossil cliffs and the dig, the rex's jungle, and the long neck valley under the volcano.
   Each walk takes its stop's ground, trees, lows, water and landmarks, so the way in looks like the holes it leads to. */
KIT['dino~meadow'] = kitFrom(KIT.dino, { g:['#6e9a3a', '#82ac46', '#5a8430', 0.2], gpat:'dinmeadow', p:['#b8976a', '#c8a77a', '#a8875a'], tree:['dinTreefern', 'dinCycad', 'dinTreefern'],
  leaves:['#3e7426', '#5a8a2e', '#2e6420'], bark:'#5e4428', low:['fern', 'fern', 'bush', 'rock'], hazC:['#4a7442', '#7aa65a'], waterC:['#4a7442', '#7aa65a'], dens:0.65, lm:['dinBluff', 'nest', 'dinBluff', 'nest', 'dinoskel'], nlm:3, wall:['#d8b47a', '#a8834e'] });
KIT['dino~swamp'] = kitFrom(KIT.dino, { g:['#4e6a2e', '#5e5a30', '#3e5a26', 0.2], gpat:'dinswamp', p:['#7a6a48', '#8a7a56', '#6a5a3e'], tree:['dinCypress', 'dinCypress', 'dinTreefern'],
  leaves:['#1e4a24', '#2e5e2c', '#4a7a3a'], bark:'#6a5640', low:['dinReeds', 'fern', 'dinReeds', 'bush'], hazC:['#2c4630', '#4a6a3e'], waterC:['#2c4630', '#4a6a3e'], dens:1.05,
  lm:['dinLogs', 'longneck', 'falls', 'dinLogs'], nlm:4, wall:['#5a6a3c', '#3a4a2a'] });
KIT['dino~dig'] = kitFrom(KIT.dino, { g:['#cfa46e', '#dcb684', '#bc8f5a', 0.2], gpat:'dindig', p:['#e2c89a', '#ecd4aa', '#d2b88a'], tree:['dinAraucaria', 'dinCycad'],
  leaves:['#24502a', '#33663a', '#2e5e34'], bark:'#6e5038', low:['rock', 'dinBones', 'rock', 'bushdry', 'rock', 'bushdry'], haz:'slow', hazC:['#5e4028', '#6e4e30'], bogC:['#5e4028', '#6e4e30'], dens:0.55,
  lm:['dinTent', 'dinPit', 'mesa', 'dinPit'], nlm:4, wall:['#b8693e', '#7a4428'] });
KIT['dino~rex'] = kitFrom(KIT.dino, { g:['#3e6a2a', '#4a7630', '#2f5a22', 0.2], gpat:'dinrex', p:['#6a5436', '#7a6440', '#5a4630'], tree:['broad', 'dinTreefern', 'broad', 'dinCycad'],
  leaves:['#1f5a26', '#2b6e30', '#3f8a3a'], bark:'#4a3624', low:['fern', 'fern', 'bush', 'fern', 'dinBones', 'bush'], haz:'slow', hazC:['#3a2e1c', '#4a3a24'], bogC:['#3a2e1c', '#4a3a24'], dens:1.35,
  lm:['dinDen', 'dinRex', 'nest'], nlm:3, wall:['#6e6a5e', '#4a4640'] });
KIT['dino~valley'] = kitFrom(KIT.dino, { g:['#9aa250', '#b0b064', '#86923e', 0.2], gpat:'dinvalley', p:['#b8a27a', '#c8b28a', '#a8926a'], tree:['dinAraucaria', 'dinAraucaria', 'dinCycad'],
  leaves:['#24502a', '#33663a', '#2e5e34'], bark:'#6e5038', low:['rock', 'fern', 'bushdry', 'rock'], hazC:['#3a8aa0', '#7ac0cc'], waterC:['#3a8aa0', '#7ac0cc'], dens:0.45,
  lm:['dinVolcano', 'longneck', 'longneck', 'dinBoulders'], nlm:4, wall:['#6a5e5e', '#4a4044'] });
LIFE_AS['dino~meadow'] = { fly:['ptero', 2], mote:[['butter', 12], ['leaf', 6]] };
LIFE_AS['dino~swamp'] = { fly:['ptero', 2], mote:[['firefly', 26], ['butter', 4]] };
LIFE_AS['dino~dig'] = { fly:['ptero', 3], mote:['dust', 20] };
LIFE_AS['dino~rex'] = { fly:['ptero', 2], mote:[['firefly', 14], ['leaf', 10]] };
LIFE_AS['dino~valley'] = { fly:['ptero', 5], mote:[['ash', 18], ['leaf', 4]] };

// the ground of each stop, in smooth patches the size of the holes' own
function dinG(c, sd, cols){ var a = vn(c.ti * 0.022, c.tj * 0.022, sd), b = vn(c.ti * 0.06, c.tj * 0.06, sd + 1); return a > 0.66 ? cols[1] : a < 0.3 ? cols[2] : b > 0.64 ? cols[3] : b < 0.3 ? cols[4] : cols[0]; }
/* the rex's tracks: lines of three toed prints walking up the screen, a line every gap feet across, each wandering a
   little. A print is sz feet long, one every st feet, left and right in turn. */
function dinTrack(c, gap, st, sz){ var x = c.ti / 8, y = c.tj / 8, u = x - Math.sin(y * 0.045) * 9, k = Math.round(u / gap), lx = u - k * gap;
  if (Math.abs(lx) > st * 0.3 + sz) return false; var n = Math.round(y / st), side = (n & 1) ? 1 : -1, pu = (n * st - y) / sz, pv = (lx - side * st * 0.17) / sz;
  if (Math.hypot(pu + 0.32, pv * 1.1) < 0.36) return true;
  for (var t = -1; t <= 1; t++){ var an = t * 0.5, ca = Math.cos(an), sa = Math.sin(an), qu = pu * ca + pv * sa, qv = -pu * sa + pv * ca; if (qu > -0.1 && qu < 0.75 - Math.abs(t) * 0.12 && Math.abs(qv) < 0.13 * (1 - qu * 0.6)) return true; }
  return false; }
GPAT.dinmeadow = function(c){ return dinG(c, 11, ['#6e9a3a', '#86ae48', '#5a8632', '#78a440', '#628e36']); };
GPAT.dinswamp = function(c){ return dinG(c, 12, ['#4e6a2e', '#5e5a30', '#3e5a26', '#58763a', '#466228']); };
GPAT.dindig = function(c){ return dinG(c, 13, ['#cfa46e', '#dcb684', '#bc8f5a', '#d6ac74', '#c49a64']); };
GPAT.dinrex = function(c){ return dinTrack(c, 26, 4.2, 1.7) ? '#3a2e1c' : dinG(c, 14, ['#3e6a2a', '#5a5030', '#2f5a22', '#4a7630', '#36602a']); };
GPAT.dinvalley = function(c){ return dinG(c, 15, ['#9aa250', '#b0b064', '#86923e', '#a4aa58', '#8e9846']); };

// the plants: a tree fern, a cycad, a swamp cypress, a monkey puzzle, and horsetails to walk through
TREEH.dinTreefern = [8, 3, 3.2]; TREEH.dinCycad = [3, 1.6, 2.4]; TREEH.dinCypress = [12, 4, 3.6]; TREEH.dinAraucaria = [14, 4, 3.4];
BLOCKR.dinTreefern = 0.5; BLOCKR.dinCycad = 0.8; BLOCKR.dinCypress = 0.8; BLOCKR.dinAraucaria = 0.6;
LOWR.dinReeds = 0.9; LOWH.dinReeds = 2.4; PLANT.dinReeds = 1; LOWR.dinBones = 1; LOWH.dinBones = 0.8; BLOCKR.dinBones = 0;
BUILD.dinTreefern = function(B, t, i){ var x = t.x, y = t.y, zb = B.gz(x, y), H = t.h, R = t.cr, tx = x + (hash(i, 4, 83) - 0.5) * 1.2;
  B.vox(x - R - 1.5, y - R - 1.5, zb - 0.2, x + R + 1.5, y + R + 1.5, zb + H + 1.6, function(set){
    B.tube(set, x, y, zb, tx, y, zb + H, 0.42, 0.32, function(u, z){ return vn(z * 1.5, i, 84) < 0.45 ? '#4a3420' : '#5e4428'; });
    for (var f = 0; f < 9; f++){ var a = f / 9 * 6.28 + i, fx = Math.cos(a), fy = Math.sin(a) * 0.72;
      for (var al = 0; al < R * 1.05; al += set.st){ var q = al / (R * 1.05), sag = R * (0.46 * q - 0.5 * q * q), wd = 0.75 * Math.sin(q * 3.14) + 0.08;
        for (var o = -wd; o <= wd; o += set.st){ if (Math.abs(o) > set.st * 1.5 && ((q * 9 + Math.abs(o) * 1.4) % 1) > 0.72) continue;
          set(tx + fx * al - fy * o, y + fy * al + fx * o, zb + H + sag, Math.abs(o) < set.st * 1.5 ? '#3c6a1e' : q > 0.6 ? '#7aae3e' : '#5c9430'); } } } }, 0.25); };
BUILD.dinCycad = function(B, t, i){ var x = t.x, y = t.y, zb = B.gz(x, y), H = t.h, R = t.cr;
  B.vox(x - R - 0.8, y - R - 0.8, zb - 0.2, x + R + 0.8, y + R + 0.8, zb + H + R + 0.6, function(set){
    B.tube(set, x, y, zb, x, y, zb + H, 0.75, 0.6, function(u, z){ return (Math.floor((z - zb) * 2.4) % 2) ? '#6a5232' : '#836640'; });
    for (var f = 0; f < 12; f++){ var a = f / 12 * 6.28 + i * 0.7, up = 0.45 + hash(f, i, 81) * 0.5, len = R * (0.9 + hash(i, f, 82) * 0.25), fx = Math.cos(a), fy = Math.sin(a) * 0.75;
      for (var al = 0; al < len; al += set.st){ var z = zb + H + al * up - al * al * 0.09, wd = 0.42 * (1 - al / (len + 0.3));
        for (var o = -wd; o <= wd; o += set.st) set(x + fx * al - fy * o, y + fy * al + fx * o, z, Math.abs(o) < set.st ? '#4a6a22' : al > len * 0.6 ? '#5a8a2e' : '#3e7426'); } }
    B.blob(set, x, y, zb + H + 0.25, 0.6, 0.6, 0.5, '#b8702a'); }, 0.25); };
BUILD.dinCypress = function(B, t, i){ var x = t.x, y = t.y, zb = B.gz(x, y), H = t.h, R = t.cr;
  B.vox(x - R - 1.2, y - R - 1.2, zb - 0.4, x + R + 1.2, y + R + 1.2, zb + H + 1.2, function(set){
    for (var r = 0; r < 5; r++){ var a = r * 1.26 + i; B.tube(set, x + Math.cos(a) * 1.3, y + Math.sin(a) * 1, zb - 0.2, x, y, zb + 2.6, 0.32, 0.22, '#5a4a36'); }   // the buttress roots
    B.tube(set, x, y, zb - 0.2, x, y, zb + H * 0.92, 0.7, 0.28, '#6a5640');
    for (var q = 0; q < 4; q++){ var cz = zb + H * (0.44 + q * 0.16), rr = R * (1.05 - q * 0.2), ox = (hash(q, i, 85) - 0.5) * 1.2;
      B.blob(set, x + ox, y, cz, rr, rr * 0.8, 1.0, function(px, py, pz){ var n = vn(px * 0.9, py * 0.9 + pz * 1.2, 86); return n < 0.3 ? '#1e4a24' : n > 0.72 ? '#4a7a3a' : '#2e5e2c'; }); }
    for (var m = 0; m < 8; m++){ var ma = hash(m, i, 87) * 6.28, mr = R * (0.5 + hash(i, m, 88) * 0.45), mx = x + Math.cos(ma) * mr, my = y + Math.sin(ma) * mr * 0.8, mz = zb + H * 0.44 - 0.8;   // moss hanging off the boughs
      B.tube(set, mx, my, mz, mx, my, mz - 1.5 - hash(m, i, 89) * 1.2, 0.16, 0.07, '#94a46e'); } }, 0.25); };
BUILD.dinAraucaria = function(B, t, i){ var x = t.x, y = t.y, zb = B.gz(x, y), H = t.h, R = t.cr;
  B.vox(x - R - 1, y - R - 1, zb - 0.2, x + R + 1, y + R + 1, zb + H + 1.2, function(set){
    B.tube(set, x, y, zb, x, y, zb + H, 0.55, 0.22, function(u, z){ return vn(z, i, 90) < 0.5 ? '#6e5038' : '#7e5e42'; });
    for (var q = 0; q < 3; q++){ var z0 = zb + H * (0.62 + q * 0.13), rr = R * (1 - q * 0.24);
      for (var b = 0; b < 7; b++){ var a = b / 7 * 6.28 + q + i, ex = x + Math.cos(a) * rr, ey = y + Math.sin(a) * rr * 0.8;
        B.tube(set, x, y, z0, ex, ey, z0 + 0.8, 0.14, 0.1, '#5a4030');
        B.blob(set, (x + ex * 2) / 3, (y + ey * 2) / 3, z0 + 0.9, rr * 0.42, rr * 0.36, 0.7, function(px, py, pz){ return vn(px * 1.2, py * 1.2 + pz, 91) < 0.4 ? '#24502a' : '#33663a'; }); } }
    B.blob(set, x, y, zb + H, R * 0.38, R * 0.32, 0.8, '#2e5e34'); }, 0.25); };
BUILD.dinReeds = function(B, t, i){ var x = t.x, y = t.y, zb = B.gz(x, y);
  B.vox(x - 1.2, y - 1, zb - 0.1, x + 1.2, y + 1, zb + 2.6, function(set){ for (var k = 0; k < 9; k++){ var a = hash(k, i, 97) * 6.28, r = hash(i, k, 98) * 0.7, sx = x + Math.cos(a) * r, sy = y + Math.sin(a) * r * 0.7, h = 1.4 + hash(k, i, 99) * 1;
    B.tube(set, sx, sy, zb, sx + Math.cos(a) * 0.25, sy, zb + h, 0.13, 0.09, function(u, z){ return ((z - zb) * 2.6 | 0) % 3 === 0 ? '#3a4a22' : '#6a8a3a'; }); } }, 0.125); };
// a heap of bones: a thigh bone across two ribs, and every other one a skull
BUILD.dinBones = function(B, t, i){ var a = hash(i, 2, 77) * 3.14, ca = Math.cos(a), sa = Math.sin(a), s = 1.4;
  box(B, t.x, t.y, 3, 3, 1.2, function(dx, dy, tt){ var u = (dx * ca + dy * sa) / s, v = (-dx * sa + dy * ca) / s, w = tt / s;
    if (Math.abs(v) < 0.1 && Math.abs(u) < 0.8 && w < 0.2) return '#ece0c0'; if (Math.hypot(Math.abs(u) - 0.85, v) < 0.17 && w < 0.26) return '#f4ead2';
    if (Math.abs(Math.hypot(u + 0.1, w) - 0.5) < 0.08 && Math.abs(Math.abs(v) - 0.35) < 0.08) return '#ddd0aa';
    if (i % 2 && Math.hypot((u - 0.2) / 0.45, (v - 0.6) / 0.3, w / 0.32) < 1) return Math.hypot(u - 0.3, v - 0.8, w - 0.12) < 0.1 ? '#3a2e22' : '#f1e6c8';
    return null; }, 0.125); };

// the landmarks: the bone wall, fallen logs, the diggers' tent and their pit, the rex and his den, the volcano and its rockslide
LMSIZE.dinBluff = [12, 5, 6]; LMSIZE.dinLogs = [10, 5, 2.4]; LMSIZE.dinTent = [7, 6, 5]; LMSIZE.dinPit = [9, 7, 2.4]; LMSIZE.dinRex = [17, 4.5, 8.6]; LMSIZE.dinDen = [10, 7, 7];
LMSIZE.dinVolcano = [22, 16, 16]; LMSIZE.dinBoulders = [9, 5, 3];
// the bone wall: a sandstone bluff in wandering bands, grass on its crown, and a skeleton set in its face, standing proud of it
BUILD.dinBluff = function(B, t, i){ var hw = t.w / 2, hd = t.d / 2, H = t.h;
  box(B, t.x, t.y, t.w, t.d + 0.6, H, function(dx, dy, tt){ var top = H - 0.6 + vn(dx * 0.4, 3, i) * 0.6, front = hd - tt * 0.1, ex = Math.pow(Math.abs(dx) / (hw - 0.3 - tt * 0.05), 4) + Math.pow(Math.abs(dy) / hd, 4);
    var sp = H * 0.48 + Math.sin(dx * 0.5) * 0.25, fx = dx + 0.6;
    if (dy > front - 0.4 && dy < front + 0.3 && Math.abs(dx) < hw - 0.8 && tt < top - 0.5){ var bone = (Math.abs(tt - sp) < 0.16 && Math.abs(fx) < 3.4) || Math.hypot((fx - 4) / 0.6, (tt - sp - 0.1) / 0.4) < 1;
      for (var r = -3; r <= 3 && !bone; r++) if (Math.abs(fx - r * 0.75) < 0.12 && tt < sp && tt > sp - 1.3 + Math.abs(r) * 0.1) bone = true;
      if (bone) return Math.hypot(fx - 4.15, tt - sp - 0.18) < 0.15 ? '#4a3a24' : '#f1e6c8'; }
    if (ex > 1 || tt > top || dy > front) return null;
    if (tt > top - 0.35) return vn(dx * 0.8, dy * 0.8, i + 3) > 0.45 ? '#6e9a3a' : '#5a8430';
    var z = tt + (vn(dx * 0.35, tt * 0.2, i + 5) - 0.5) * 0.9, b = Math.floor(z * 0.9); return ['#d8b47a', '#c9a46a', '#e2c48a', '#b8935a'][((b % 4) + 4) % 4]; }); };
// fallen logs, one across another, moss on their backs and their cut ends pale
BUILD.dinLogs = function(B, t, i){ var zb = B.gz(t.x, t.y);
  B.vox(t.x - 5, t.y - 2.5, zb - 0.5, t.x + 5, t.y + 2.5, zb + 2.6, function(set){ [[-4.2, -0.8, 3.6, 0.6, 0.7], [-2.6, 1.4, 2.4, -1.5, 0.5], [0.8, -1.8, 4.3, 1.4, 0.45]].forEach(function(q, k){ var r = q[4], zc = zb + r * 0.8 + (k === 1 ? 0.75 : 0);
    B.tube(set, t.x + q[0], t.y + q[1], zc, t.x + q[2], t.y + q[3], zc, r, r * 0.85, function(u, z){ if (u <= 0.001 || u >= 0.999) return '#c8a878'; return z > zc + r * 0.55 ? (vn(u * 7, k, 95) < 0.5 ? '#5e7a32' : '#6e8a3a') : (vn(u * 12, z * 3, 96) < 0.5 ? '#5a4028' : '#6e5236'); }); }); }, 0.25); };
// the diggers' tent, end on with its flap open, a crate beside it and a lamp on a pole
BUILD.dinTent = function(B, t, i){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var hw = 2.4, hd = 2.2, h = 3.6;
  if (Math.abs(dx - 2.9) < 0.6 && Math.abs(dy - 1.8) < 0.6 && tt < 1.1) return (Math.max(Math.abs(dx - 2.9), Math.abs(dy - 1.8)) > 0.5 || tt > 1 || tt < 0.1) ? '#6a4420' : '#a8783e';
  if (Math.hypot(dx + 2.9, dy - 2.2) < 0.1 && tt < 4.1) return '#3a3028'; if (Math.hypot(dx + 2.9, dy - 2.2, tt - 4.3) < 0.3) return '#ffcf6a';
  if (Math.abs(dx) > hw || Math.abs(dy) > hd) return null; var roof = h * (1 - Math.abs(dx) / hw); if (tt > roof) return null;
  if (tt > roof - 0.22) return (Math.floor((dy + 9) * 1.1) % 2) ? '#ece2c2' : '#d8c89e';
  if (dy > hd - 0.2) return Math.abs(dx) < roof * 0.34 ? '#2e2418' : '#e2d6b2'; return null; }); };
// the dig: a pit strung into squares between four stakes, a rib cage lying in it, and the spoil heaped behind
BUILD.dinPit = function(B, t, i){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var hw = 3.6, hd = 2.2, ax = Math.abs(dx), ay = Math.abs(dy);
  if (Math.abs(ax - hw) < 0.12 && Math.abs(ay - hd) < 0.12 && tt < 1.2) return '#a8835a';
  if (((Math.abs(ax - hw) < 0.06 && ay < hd) || (Math.abs(ay - hd) < 0.06 && ax < hw) || (Math.abs(dx) < 0.06 && ay < hd)) && Math.abs(tt - 1) < 0.07) return '#f4efe2';
  if (ax < hw && ay < hd){ if (tt < 0.1) return vn(dx * 0.8, dy * 0.8, i) > 0.5 ? '#8a5e3a' : '#7c5434';
    if (Math.abs(dy) < 0.18 && ax < 2.6 && Math.abs(tt - 0.4) < 0.18) return '#f1e6c8';
    for (var r = -3; r <= 3; r++) if (Math.abs(dx - r * 0.7) < 0.12 && Math.abs(Math.hypot(dy, tt / 1.4) - 1.3) < 0.16) return '#ece0c0';
    if (Math.hypot((dx - 3) / 0.7, dy / 0.45, (tt - 0.35) / 0.4) < 1) return '#f4ead2'; return null; }
  var sp = Math.max(ax - hw, ay - hd); if (sp < 1.1 && dy < 0 && tt < 0.9 * (1 - sp / 1.1) + vn(dx, dy, i + 2) * 0.3) return '#b48650';
  return null; }); };
// the rex: a big head and a jaw of teeth, two strong legs, little arms, the tail held out behind. q scales him
BUILD.dinRex = function(B, t, i){ var q = 2.5, dir = i % 2 ? 1 : -1;
  box(B, t.x, t.y, t.w, t.d, t.h, function(px, py, pz){ var dx = px * dir / q, dy = py / q, tt = pz / q, ay = Math.abs(dy);
    function hide(c){ if (tt < c - 0.3) return '#b8a46e'; return vn(dx * 2.4, tt * 0.6, 93) > 0.64 ? '#4a4626' : vn(px * 0.8, pz * 0.8 + py, 94) > 0.6 ? '#76703e' : '#625e32'; }
    if (ay > 0.18 && ay < 0.58){ if (Math.hypot((dx + 0.2) / 0.6, (ay - 0.38) / 0.2, (tt - 1.55) / 0.62) < 1) return hide(1.55);
      if (segD(dx, tt, -0.05, 1.1, -0.3, 0.2) < 0.17 && Math.abs(ay - 0.38) < 0.15) return '#5a5630'; if (tt < 0.18 && dx > -0.5 && dx < 0.2 && Math.abs(ay - 0.38) < 0.17) return '#4a4426'; }
    var bc = 2.0 + dx * 0.18; if (Math.hypot(dx / 1.3, dy / 0.6, (tt - bc) / 0.62) < 1) return hide(bc);
    if (Math.hypot((dx - 1.1) / 0.5, dy / 0.38, (tt - 2.45) / 0.48) < 1) return hide(2.45);
    var hd = Math.hypot((dx - 1.75) / 0.68, dy / 0.33, (tt - 2.78) / 0.32), jw = Math.hypot((dx - 1.8) / 0.58, dy / 0.27, (tt - 2.44) / 0.15);
    if (hd < 1 || jw < 1){ if (tt > 2.49 && tt < 2.57 && dx > 1.4) return ((dx * 12 | 0) % 2 && ay > 0.12) ? '#f4ead2' : '#3a1a14'; if (ay > 0.2 && Math.hypot(dx - 1.62, tt - 2.9) < 0.07) return '#ffcf3a'; return hide(hd < 1 ? 2.7 : 2.6); }
    if (Math.abs(ay - 0.42) < 0.08 && segD(dx, tt, 0.85, 2.05, 1.12, 1.72) < 0.07) return '#5a5630';
    if (dx < -0.9 && dx > -3.3){ var u = (-0.9 - dx) / 2.4, tc = 1.84 - u * 0.6, r = 0.48 * (1 - u) + 0.06; if (Math.hypot(dy, tt - tc) < r) return hide(tc); }
    return null; }, 0.125); };
// the den: a dome of stone, ferns on its crown, and the dark mouth of the den in its face
BUILD.dinDen = function(B, t, i){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var d = Math.hypot(dx / (t.w / 2), (dy + 0.5) / (t.d / 2 - 0.5), tt / t.h) + (vn(dx * 0.6, tt * 0.6, i) - 0.5) * 0.16;
  if (d > 1) return null; if (dy > 0.3 && Math.abs(dx) < 1.6 && tt < 3.2 * Math.sqrt(Math.max(0, 1 - (dx / 1.6) * (dx / 1.6)))) return '#18130f';
  if (tt > t.h * 0.78) return vn(dx, dy, i + 3) > 0.4 ? '#3f6a2a' : '#4f7a2e'; var n = vn(dx * 0.5, tt * 0.5, i + 5); return n > 0.66 ? '#4f7a2e' : n < 0.3 ? '#5e5a50' : '#6e6a5e'; }); };
// the volcano: a cone of basalt, the crater glowing, lava down its face, and smoke rolling off the top
BUILD.dinVolcano = function(B, t, i){ var Hc = t.h - 4;
  box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var r = Math.hypot(dx / (t.w / 2), (dy + 1) / (t.d / 2 - 1));
    if (tt > Hc - 0.3){ for (var p = 0; p < 3; p++){ var pz = Hc + 0.7 + p * 0.85, px = -p * 0.8, rr = 0.8 + p * 0.3; if (Math.hypot(dx - px, (dy + 1) * 1.2, tt - pz) < rr) return vn(dx * 1.2, tt * 1.2, i) > 0.5 ? '#8a8480' : '#a29c96'; } }
    if (r > 1) return null; var top = r < 0.16 ? Hc - (0.16 - r) * 6 : Hc * (1 - (r - 0.16) / 0.84); if (tt > top) return null;
    if (r < 0.16) return vn(dx * 2, dy * 2, i + 1) > 0.5 ? '#ffc23a' : '#ff6a1a';
    if (dy > -1 && Math.abs(dx - Math.sin(tt * 0.8 + i) * 0.5) < 0.4 + (Hc - tt) * 0.03) return tt > top - 0.3 ? (vn(dx * 2, tt * 2, i + 2) > 0.5 ? '#ffc23a' : '#ff7a1a') : '#4a4044';
    if (tt < 0.6) return '#6a7a3a'; var n = vn(dx * 0.6, tt * 0.6, i + 4); return n > 0.68 ? '#6e6262' : n < 0.3 ? '#4e4446' : '#5e5254'; }); };
// the rockslide: boulders tumbled down together, the big ones behind
BUILD.dinBoulders = function(B, t, i){ var R3 = [[-2.6, -0.6, 1.3], [-0.4, -1, 1.6], [1.9, -0.5, 1.1], [3.1, 0.6, 0.8], [0.8, 1.4, 0.7], [-3.3, 1.2, 0.6]];
  box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ for (var k = 0; k < R3.length; k++){ var q = R3[k], d = Math.hypot(dx - q[0], (dy - q[1]) * 1.15, tt / 0.9 - q[2] * 0.3) + (vn(dx * 1.5, tt * 1.5, i + k) - 0.5) * 0.25;
    if (d < q[2]) return tt > q[2] * 0.95 ? '#a29a8a' : vn(dx * 2, dy * 2 + tt, k) > 0.6 ? '#7a7266' : '#8e8678'; } return null; }); };
/* ---- Ice Age's stops on the walk, the same places its holes stand in (land.js): the thawing tundra and its herd, the
   glacier's edge with its seracs, its ice arch and its mill, the melt lake's shore with its bergs and its tar pits, the
   painted cliff and the cave people's camp, and Mammoth Peak with the whole herd under it. */
KIT['iceage~tundra'] = kitFrom(KIT.iceage, { gpat:'iceTundra', low:['rocksnow', 'bushdry', 'bushsnow', 'bushdry', 'rock'], haz:'water', hazC:['#5ab4d6', '#bfe8f4'], waterC:['#5ab4d6', '#bfe8f4'],
  dens:0.3, nlm:3, lm:['iceHerd', 'iceSaber', 'iceHerd', 'tusks'] });
KIT['iceage~glacier'] = kitFrom(KIT.iceage, { g:['#e8f2f7', '#f6fbfd', '#cfe4ee', 0.2], gpat:'iceGlacier', p:['#c8d4dc', '#d8e2e8', '#b4c2cc'], tree:['pine', 'pine', 'pine'], low:['rocksnow', 'iceChunk', 'rocksnow'],
  haz:'ice', iceC:['#8fcde0', '#c8ecf6'], dens:0.14, nlm:4, lm:['iceSeracs', 'iceArch', 'iceMill', 'iceErratic', 'iceSeracs'], wall:['#c8ecf6', '#5aa4c8'] });
KIT['iceage~lake'] = kitFrom(KIT.iceage, { g:['#d8dcd8', '#e8ecec', '#c4c8c4', 0.2], gpat:'iceThaw', p:['#a89a86', '#b8aa94', '#968a76'], tree:['dead', 'pine', 'dead', 'pine'], low:['rock', 'bushdry', 'rocksnow'],
  haz:'ice', iceC:['#6cc4e2', '#d4f0f8'], dens:0.32, nlm:4, lm:['iceTarpit', 'iceBergs', 'iceTarpit', 'iceBergs', 'tusks'] });
KIT['iceage~caves'] = kitFrom(KIT.iceage, { gpat:'iceTrod', p:['#9a8468', '#a8927a', '#8a7458'], haz:null, dens:0.35, nlm:5, low:['rocksnow', 'rock', 'bushsnow'],
  lm:['iceCliff', 'iceCamp', 'iceCliff', 'cave', 'iceCamp'], wall:['#a89c8c', '#5e5448'] });
KIT['iceage~peak'] = kitFrom(KIT.iceage, { gpat:'icePow', haz:'ice', iceC:['#a8dcf0', '#e2f6ff'], dens:0.4, nlm:4, low:['rocksnow', 'bushsnow', 'bushdry'],
  lm:['icePeakRock', 'iceHerd', 'tusks', 'iceHerd', 'icePeakRock'] });
LIFE_AS['iceage~tundra'] = { mote:['snow', 30], fly:['crow', 3] };
LIFE_AS['iceage~glacier'] = { mote:['snow', 70], fly:['crow', 2] };
LIFE_AS['iceage~lake'] = { mote:['snow', 24], fly:['vulture', 3] };
LIFE_AS['iceage~caves'] = { mote:[['snow', 40], ['ember', 12]], fly:['bat', 4] };
LIFE_AS['iceage~peak'] = { mote:['snow', 90], fly:['crow', 2] };

// the ground of each stop, in broad smooth patches (an eighth of a foot a cell, so a patch is a few feet across)
function iceF(c, a, b, s){ return vn(c.ti * a, c.tj * a, s) * 0.65 + vn(c.ti * b, c.tj * b, s + 1) * 0.35; }
GPAT.iceTundra = function(c){ var f = iceF(c, 0.03, 0.09, 21), b = vn(c.ti * 0.06, c.tj * 0.06, 23);   // the thaw: snow in drifts, the old grass through it, moss where it is wettest
  return f > 0.54 ? (b > 0.62 ? '#f8fbfd' : '#eef3f7') : f > 0.5 ? '#d6dcd6' : f > 0.42 ? (b > 0.55 ? '#9c9878' : '#8e8a6a') : b > 0.6 ? '#6e7a56' : '#7e7a5a'; };
GPAT.iceGlacier = function(c){ var a = iceF(c, 0.025, 0.08, 31), b = vn(c.ti * 0.07, c.tj * 0.07, 33);   // thin snow over blue ice
  return a > 0.64 ? (b > 0.5 ? '#a8d8ea' : '#bfe4f0') : a > 0.59 ? '#d8eef6' : b > 0.7 ? '#f8fbfd' : '#eaf2f6'; };
GPAT.iceThaw = function(c){ var f = iceF(c, 0.03, 0.09, 41), b = vn(c.ti * 0.06, c.tj * 0.06, 43);   // slush, mud and the last of the snow by the lake
  return f > 0.56 ? '#eef3f7' : f > 0.5 ? '#d4dad8' : f > 0.4 ? (b > 0.55 ? '#a8a6a0' : '#b8b6ae') : b > 0.6 ? '#7e7a5a' : '#6e6052'; };
GPAT.iceTrod = function(c){ var a = iceF(c, 0.025, 0.08, 51), b = vn(c.ti * 0.07, c.tj * 0.07, 53);   // a camp's snow, trodden through to the earth
  return a > 0.66 ? (b > 0.5 ? '#9a8468' : '#8a7458') : a > 0.6 ? '#c8c4b8' : b > 0.7 ? '#f6f9fb' : '#e8eef2'; };
GPAT.icePow = function(c){ var a = iceF(c, 0.025, 0.08, 61), b = vn(c.ti * 0.07, c.tj * 0.07, 63);   // deep snow under the peak, blue in its hollows
  return a < 0.3 ? (b > 0.55 ? '#a8985e' : '#c8c2a8') : a > 0.64 ? '#dce6ef' : b > 0.7 ? '#f8fbfd' : '#eef3f7'; };

// a landmark drawn at its first size (w0 across) and grown to the size LMSIZE gives it, so the walk's scale can change in one place
function iceQ(t, w0, fn){ var q = t.w / w0; return function(dx, dy, tt){ return fn(dx / q, dy / q, tt / q); }; }
// a woolly mammoth at s times the hole's size, facing dir: the same beast the holes have, its fur in smooth patches
function iceMamFn(s, dir, k){ return function(dx0, dy0, tt){ var dx = dx0 * dir / s, dy = dy0 / s, t = tt / s;
  var n = vn(dx0 * 1.3, tt * 1.3 + dy0 * 0.7, k + 5), fur = n < 0.34 ? '#5e3e24' : n > 0.7 ? '#9a6c42' : '#7a5232';
  if (t < 0.8 && Math.abs(Math.abs(dx) - 0.55) < 0.19 && Math.abs(Math.abs(dy) - 0.3) < 0.17) return t < 0.12 ? '#3a281a' : t < 0.3 ? '#5e3e24' : fur;
  if (Math.hypot(dx / 1.02, dy / 0.6, (t - 1.2) / 0.62) < 1) return t < 0.75 ? '#5e3e24' : fur;
  if (Math.hypot((dx - 0.4) / 0.5, dy / 0.45, (t - 1.72) / 0.32) < 1) return '#5e3e24';
  if (Math.hypot((dx - 1.05) / 0.44, dy / 0.4, (t - 1.48) / 0.46) < 1) return (Math.abs(Math.abs(dy) - 0.2) < 0.06 && Math.abs(t - 1.6) < 0.06 && dx > 1.25) ? '#1a120c' : fur;
  var tc = 1.42 + (t < 0.6 ? (0.6 - t) * 0.55 : 0); if (Math.abs(dy) < 0.12 && t > 0.3 && t < 1.35 && Math.abs(dx - tc) < 0.12) return '#6a4a2e';
  if (Math.abs(Math.abs(dy) - 0.22) < 0.07 && dx > 1.2 && dx < 1.9 && Math.abs(t - (0.95 + (dx - 1.2) * (dx - 1.2) * 1.3)) < 0.08) return '#f4ead2';
  if (dx < -0.95 && dx > -1.25 && Math.abs(dy) < 0.06 && Math.abs(t - (1.1 - (-0.95 - dx) * 1.2)) < 0.07) return '#5e3e24';
  return null; }; }
// a few of the herd together, big and small, not all facing the same way
BUILD.iceHerd = function(B, t, i){ var M = [[-3.6, -1.2, 2.5], [2.8, -2, 2.9], [0.2, 1.7, 2.1]], q = t.w / 16;
  M.forEach(function(m, k){ var s = m[2] * q; m = [m[0] * q, m[1] * q]; dir = hash(i, k, 7) < 0.5 ? 1 : -1; box(B, t.x + m[0], t.y + m[1], 4.4 * s, 1.8 * s, 2.4 * s, iceMamFn(s, dir, i * 3 + k), 0.125); }); };
// the saber tooth on its boulder, watching the path
BUILD.iceSaber = function(B, t, i){ var s = 2.4 * t.w / 8, dir = hash(i, 2, 9) < 0.5 ? 1 : -1;
  box(B, t.x, t.y, 3.4 * s, 2.2 * s, 2.2 * s, function(dx0, dy0, tt){ var dx = dx0 * dir / s, dy = dy0 / s, t2 = tt / s;
    var d = Math.hypot(dx / 1.2, dy, t2 / 0.95) + (vn(dx0 * 0.9, tt * 0.9, 7) - 0.5) * 0.14;
    if (d < 1) return t2 > 0.82 ? '#e8f0f6' : vn(dx0 * 0.7, tt * 0.7 + dy0, 3) < 0.4 ? '#6e7480' : '#868c96';
    if (Math.hypot(dx / 0.62, dy / 0.3, (t2 - 1.13) / 0.2) < 1) return t2 < 1.02 ? '#a8804a' : '#c8a064';
    if (Math.hypot((dx - 0.6) / 0.24, dy / 0.22, (t2 - 1.32) / 0.2) < 1) return (Math.abs(Math.abs(dy) - 0.09) < 0.04 && t2 > 1.36 && dx > 0.72) ? '#2a201a' : '#c8a064';
    if (Math.abs(Math.abs(dy) - 0.07) < 0.035 && dx > 0.74 && dx < 0.82 && t2 > 1.04 && t2 < 1.2) return '#ffffff';
    if (Math.abs(dy - 0.28) < 0.06 && dx < -0.5 && dx > -0.95 && Math.abs(t2 - 1.02) < 0.06) return '#a8804a';
    return null; }, 0.125); };
// seracs: blocks of glacier ice standing where the ice broke, leaning, cracked, snow on their tops
function iceBlockFn(w, h, k){ var lean = (hash(k, 3, 9) - 0.5) * 0.5; return function(dx0, dy, tt){ var t = tt / h, dx = dx0 - lean * tt * 0.3, r = w * (1 - t * 0.35);
  if (t > 1 || Math.abs(dx) + Math.abs(dy) * 0.6 > r * 1.15 || Math.max(Math.abs(dx), Math.abs(dy)) > r) return null;
  if (t > 0.9 - vn(dx0 * 0.6, dy * 0.6, k) * 0.12) return '#f6fbfd'; if (Math.abs(Math.sin(dx * 0.9 + tt * 0.6 + k)) < 0.05) return '#5aa4c4';
  return vn(dx0 * 0.5, tt * 0.5 + dy, k + 2) < 0.45 ? '#9fd8ea' : '#bfe6f2'; }; }
BUILD.iceSeracs = function(B, t, i){ var S = [[-3.2, -0.8, 1.6, 7.5], [0, -1.4, 2, 9], [3.1, -0.4, 1.5, 6], [-1.4, 1.4, 1, 3.6], [1.8, 1.6, 0.8, 2.6]];
  var g = t.w / 11; S.forEach(function(q, k){ box(B, t.x + q[0] * g, t.y + q[1] * g, (q[2] * 2 + 1.2) * g, q[2] * 2 * g, q[3] * g, iceBlockFn(q[2] * g, q[3] * g, i * 5 + k), 0.125); }); };
BUILD.iceChunk = function(B, t, i){ box(B, t.x, t.y, 1.8, 1.4, 1.4, iceBlockFn(0.7, 1.3, i), 0.125); };
LOWR.iceChunk = 0.9; LOWH.iceChunk = 1.4;
// the ice bridge: an arch of blue ice the meltwater cut, snow along its back
BUILD.iceArch = function(B, t, i){ box(B, t.x, t.y, t.w, t.d, t.h, iceQ(t, 9, function(dx, dy, tt){ if (Math.abs(dy) > 0.9 - tt * 0.05) return null;
  var o = Math.hypot(dx / 4.3, tt / 4.2), n = Math.hypot(dx / 2.9, tt / 2.8); if (o > 1 || n < 1) return null; if (o > 0.92 && tt > 1.2) return '#f6fbfd';
  return vn(dx * 0.8, tt * 0.8, i) < 0.42 ? '#8fd0e6' : '#b8e4f2'; }), 0.125); };
// the glacier mill: a shaft in the ice, the meltwater swirling round and down it, a rim of ice round its lip
BUILD.iceMill = function(B, t, i){ box(B, t.x, t.y, t.w, t.d, t.h, iceQ(t, 6, function(dx, dy, tt){ var r = Math.hypot(dx, dy * 1.2), a = Math.atan2(dy, dx); if (r > 2.7) return null;
  if (r > 2.1) return tt < 0.55 - (r - 2.1) * 0.8 ? (vn(a * 2, tt, i) < 0.5 ? '#c8ecf6' : '#a8dcea') : null; if (tt > 0.1) return null;
  var sw = ((a / 6.283 * 2 + r * 0.6) % 1 + 1) % 1; return r < 0.5 ? '#123a5a' : sw < 0.2 ? '#8fd8ee' : r < 1.2 ? '#1a5a84' : '#2a8ab8'; }), 0.125); };
// a boulder the ice carried here and left: grey granite, rounded, snow on its crown
BUILD.iceErratic = function(B, t, i){ box(B, t.x, t.y, t.w, t.d, t.h, iceQ(t, 5, function(dx, dy, tt){ var d = Math.hypot(dx / 2.3, dy / 1.8, tt / 3.4) + (vn(dx * 0.8, tt * 0.8, i + 4) - 0.5) * 0.12;
  if (d > 1) return null; if (tt > 2.6 + vn(dx, dy, i) * 0.5) return '#f2f7fa'; return vn(dx * 0.6, tt * 0.6 + dy, i) < 0.42 ? '#7a7a82' : '#9a9aa2'; }), 0.125); };
// a tar pit on the lake shore, and the bones of a mammoth that went in and never came out
BUILD.iceTarpit = function(B, t, i){ box(B, t.x, t.y, t.w, t.d, t.h, iceQ(t, 8, function(dx, dy, tt){ var e = Math.hypot(dx / 3.6, dy / 2.5);
  var m = dx - 0.6, s = 2;
  if (Math.hypot((m - 0.5 * s) / (0.42 * s), dy / (0.36 * s), tt / (0.4 * s)) < 1) return Math.abs(Math.abs(dy) - 0.13 * s) < 0.1 && tt > 0.3 && m > 0.7 * s ? '#3a3028' : '#e6dcc0';
  if (Math.abs(Math.abs(dy) - 0.2 * s) < 0.12 && m > 0.7 * s && m < 1.5 * s && Math.abs(tt - (0.1 * s + (m / s - 0.7) * (m / s - 0.7) * 1.6 * s)) < 0.14) return '#f4ead2';
  for (var r = 0; r < 4; r++){ var rx = (-0.2 - r * 0.32) * s; if (Math.abs(m - rx) < 0.1 && Math.abs(Math.hypot(dy, tt + 0.4) - 1.24) < 0.12 && tt > 0) return '#d8ccae'; }
  if (e > 1 || tt > 0.12) return null; if (e > 0.88) return '#4a3c2e'; return vn(dx * 0.7, dy * 0.7, i + 2) > 0.7 ? '#3a3a46' : '#1a1714'; }), 0.125); };
// a frozen pond with the bergs it caught standing in it
BUILD.iceBergs = function(B, t, i){ var G = [[-1.5, -0.6, 1.4, 4], [1.8, 0.5, 1, 2.6]];
  box(B, t.x, t.y, t.w, t.d, t.h, iceQ(t, 9, function(dx, dy, tt){ for (var k = 0; k < 2; k++){ var g = G[k], x = dx - g[0], y = dy - g[1], u = tt / g[3];
      var rr = g[2] * (1 - Math.pow(Math.max(0, u), 1.6) * 0.65) * (0.85 + vn(Math.atan2(y, x) * 1.3 + 3, tt * 0.4, i + k) * 0.3); if (u <= 1 && Math.hypot(x, y * 1.15) < rr) return u > 0.78 || vn(x * 0.6, y * 0.6 + tt, k + 4) > 0.72 ? '#f6fbfd' : vn(x * 0.5, tt * 0.7, k) < 0.42 ? '#a8dcee' : '#d4f0f8'; }
    var e = Math.hypot(dx / 4.4, dy / 3.3); if (e > 1 || tt > 0.1) return null; return e > 0.9 ? '#e4f4fa' : vn(dx * 0.4, dy * 0.4, i + 7) > 0.6 ? '#bfe8f4' : '#8fd0e6'; }), 0.125); };
// the painted cliff: a crag with a cave mouth in it, the herd painted on its face in ochre and soot, torches at the mouth
BUILD.iceCliff = function(B, t, i){ var ink = hash(i, 3, 5) < 0.6 ? '#c8582e' : '#2a201a';
  box(B, t.x, t.y, t.w, t.d, t.h, iceQ(t, 12, function(dx, dy, tt){
    for (var s = -1; s <= 1; s += 2){ var tx = dx - (1.6 + s * 2), ty = dy - 1.9; var r = Math.hypot(tx, ty); if (r < 0.1 && tt < 2.6) return '#e8dcc0'; if (r < 0.26 * (1 - (tt - 2.6) / 0.7) && tt >= 2.6 && tt < 3.3) return tt < 2.9 ? '#ffd23a' : '#ff8a1a'; }   // the torches
    var top = 6.6 * Math.sqrt(Math.max(0, 1 - Math.pow(dx / 6, 2))) + (vn(dx * 0.5, 1, i) - 0.5) * 1.2; if (tt > top || dy > 1.2 || dy < -2.4 + tt * 0.15) return null;
    if (Math.abs(dx) > 5.8 * (1 - Math.pow(tt / 7.5, 2) * 0.3)) return null;
    var mouth = Math.hypot((dx - 1.6) / 1.3, tt / 2.6) < 1; if (mouth) return dy > 0.6 ? null : '#14100e';
    if (tt > top - 0.6) return '#f2f6f9';
    if (dy > 0.95){ var m = dx + 3; if (Math.hypot(m / 1.2, (tt - 2.4) / 0.6) < 1 || Math.hypot((m + 0.45) / 0.5, (tt - 2.9) / 0.42) < 1 || Math.hypot((m - 1.25) / 0.42, (tt - 2.5) / 0.42) < 1) return ink;
      if (tt > 1.3 && tt < 2 && [-0.85, -0.45, 0.35, 0.7].some(function(q){ return Math.abs(m - q) < 0.12; })) return ink;
      if (Math.abs(tt - (2.1 + (m - 1.35) * (m - 1.35) * 1.1)) < 0.08 && m > 1.35 && m < 2.05) return '#efe6d0';
      var hx = dx + 5, hz = tt - 3.4; if (Math.hypot(hx / 0.2, hz / 0.24) < 1) return '#b8502e'; }
    return vn(dx * 0.5, tt * 0.6, i + 3) < 0.4 ? '#7a6e62' : vn(dx * 1.1, tt, i) > 0.62 ? '#a89c8c' : '#8e8274'; }), 0.125); };
// the cave people's camp: two tents of hide on poles of bone, the fire between them, a skin stretched on a rack
function iceTentFn(R, H, k){ return function(dx, dy, tt){ var r = Math.hypot(dx, dy), rr = R * (1 - tt / H);
  if (tt > H * 0.85){ for (var q = 0; q < 4; q++){ var qa = q * 1.57 + 0.4; if (Math.hypot(dx - Math.cos(qa) * (tt - H * 0.85) * 0.5, dy - Math.sin(qa) * (tt - H * 0.85) * 0.5) < 0.1 && tt < H + 0.7) return '#efe4c8'; } }
  if (r > rr || r < rr - 0.25 || tt > H) return null; if (dy > 0 && Math.abs(dx) < 0.5 * (1 - tt / 2) && tt < 2) return '#2a1c12';
  var a = Math.atan2(dy, dx); if (Math.abs(Math.sin(a * 3 + k)) < 0.05 || Math.abs(tt - H * 0.35) < 0.06) return '#5a3c22'; return vn(a * 2 + k, tt * 0.8, k) < 0.4 ? '#a8865a' : '#bc9a6a'; }; }
BUILD.iceCamp = function(B, t, i){ var q = t.w / 10; function bx(ox, oy, w, d, h, fn){ box(B, t.x + ox * q, t.y + oy * q, w * q, d * q, h * q, function(dx, dy, tt){ return fn(dx / q, dy / q, tt / q); }, 0.125); }
  bx(-2.6, -1.2, 4, 4, 4.4, iceTentFn(1.9, 3.8, i)); bx(2.5, -1.6, 3.6, 3.6, 3.8, iceTentFn(1.7, 3.3, i + 3));
  bx(0, 1.4, 1.6, 1.6, 1.4, function(dx, dy, tt){ var r = Math.hypot(dx, dy); if (tt < 0.3 && r > 0.5 && r < 0.75) return '#6e665e'; if (tt < 0.18 && r < 0.55) return '#3a2412';
    if (tt >= 0.15 && r < 0.45 * (1 - tt / 1.3)) return tt < 0.45 ? '#ffd23a' : tt < 0.85 ? '#ff8a1a' : '#e5483a'; return null; });
  bx(3.6, 1.6, 2.4, 0.5, 2.6, function(dx, dy, tt){ if (Math.abs(dy) > 0.15) return null; if (Math.abs(Math.abs(dx) - 1) < 0.08 && tt < 2.4) return '#e8dcc0'; if (tt > 2.25 && tt < 2.4 && Math.abs(dx) < 1.1) return '#e8dcc0';
    if (Math.abs(dx) < 0.85 && tt > 0.8 && tt < 2.25 && Math.abs(dx) < 0.85 - Math.abs(tt - 1.5) * 0.35) return vn(dx * 1.5, tt * 1.5, i) < 0.45 ? '#8a6038' : '#a8784a'; return null; }); };
// a crag of the peak itself: rock low down in bands, snow from its shoulders up
BUILD.icePeakRock = function(B, t, i){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var a = Math.atan2(dy, dx), u = tt / t.h;
  var rr = t.w * 0.5 * (1 - u) * (0.82 + vn(a * 1.6 + 4, tt * 0.35, i) * 0.36); if (Math.hypot(dx, dy * 1.25) > rr || u > 1) return null;
  if (u > 0.5 - vn(a * 2, 1, i) * 0.15) return vn(dx * 0.5, tt * 0.5, i + 2) > 0.66 ? '#dce8f2' : '#f6fbfd';
  return vn(a * 3, tt * 0.9, i + 5) < 0.38 ? '#6e7280' : vn(dx * 0.8, tt * 0.8, i) > 0.6 ? '#a8acb6' : '#8a8e9a'; }, 0.25); };
// the walk is drawn bigger than a hole (a shed is 9 by 6 by 11), and these stand among pines twice a man's height and more
LMSIZE.iceHerd = [21, 10.5, 10]; LMSIZE.iceSaber = [10, 6.8, 6.8]; LMSIZE.iceSeracs = [15, 8, 12.3]; LMSIZE.iceArch = [13.5, 3, 6.6]; LMSIZE.iceMill = [8.4, 7, 0.8]; LMSIZE.iceErratic = [7.5, 6, 5.4];
LMSIZE.iceTarpit = [13, 9.8, 5.5]; LMSIZE.iceBergs = [15, 11.7, 7]; LMSIZE.iceCliff = [17, 7, 10.5]; LMSIZE.iceCamp = [15, 10.5, 7.5]; LMSIZE.icePeakRock = [16, 13, 19];
/* ---- Moon Base's stops on the walk, the same places its holes stand in (land.js): the landing site with the lander and
   the flag, the crater field, the base with its domes and dish, the dark far side, and the launch pad with the rocket. The
   moon has no trees: a rock spire stands in for one, here and there. A drone is the satellite going over, and the
   sparks are stars. */
GPAT.moonReg = function(c){ var a = vn(c.ti * 0.03, c.tj * 0.03, 81), b = vn(c.ti * 0.12, c.tj * 0.12, 82); return a > 0.7 ? '#8a8892' : b > 0.74 ? '#b6b4bc' : a < 0.3 ? '#a2a0aa' : '#9a98a2'; };
GPAT.moonDark = function(c){ var a = vn(c.ti * 0.03, c.tj * 0.03, 83), b = vn(c.ti * 0.12, c.tj * 0.12, 84); return a > 0.7 ? '#4e4c56' : b > 0.74 ? '#74727c' : a < 0.3 ? '#625f6a' : '#5a5862'; };
GPAT.moonCrater = function(c){ var gi = Math.floor(c.ti / 48), gj = Math.floor(c.tj / 48), cx = (gi + 0.3 + vn(gi, gj, 85) * 0.4) * 48, cy = (gj + 0.3 + vn(gj, gi, 86) * 0.4) * 48, r = 10 + vn(gi, gj, 87) * 12, d = Math.hypot(c.ti - cx, c.tj - cy) / r;
  if (d < 0.85) return d < 0.5 ? '#7e7c86' : (c.ti - cx) + (c.tj - cy) < 0 ? '#6e6c76' : '#8a8892'; if (d < 1.05) return (c.ti - cx) + (c.tj - cy) < 0 ? '#c8c6ce' : '#7a7882'; return GPAT.moonReg(c); };
KIT['moon~landing'] = kitFrom(KIT.moon, { nlm:3, lm:['moonLander', 'moonDish', 'moonLander'] });
KIT['moon~craters'] = kitFrom(KIT.moon, { gpat:'moonCrater', dens:0.06, nlm:3, low:['rock', 'rockdark', 'rockdark', 'rock'], lm:['moonDish', 'moonLander', 'moonDish'] });
KIT['moon~station'] = kitFrom(KIT.moon, { p:['#d8dce6', '#eef0f6', '#c4c8d4'], paved:true, dens:0.06, nlm:5, lm:['moonDome', 'moonDish', 'moonDome', 'moonLander', 'moonDome'] });
KIT['moon~farside'] = kitFrom(KIT.moon, { g:['#5a5862', '#625f6a', '#4e4c56', 0.2], gpat:'moonDark', tree:['basalt'], dens:0.1, nlm:3, low:['rockdark', 'rockdark', 'rock'], lm:['moonDish', 'moonDish', 'moonDish'], wall:['#4a5878', '#141a2c'] });
KIT['moon~launch'] = kitFrom(KIT.moon, { p:['#5a5e6a', '#6a6e7a', '#4a4e5a'], paved:true, dens:0.06, nlm:4, lm:['moonRocket', 'moonDish', 'moonDome', 'moonRocket'] });
LIFE_AS['moon~landing'] = { fly:['drone', 2], mote:['spark', 24] };
LIFE_AS['moon~craters'] = { fly:['drone', 1], mote:[['spark', 20], ['dust', 10]] };
LIFE_AS['moon~station'] = { fly:['drone', 3], mote:['spark', 20] };
LIFE_AS['moon~farside'] = { mote:['spark', 50] };
LIFE_AS['moon~launch'] = { fly:['drone', 2], mote:[['spark', 24], ['ember', 6]] };
// the lander: gold foil on four splayed legs, the white cabin on top with its dark window
BUILD.moonLander = function(B, t){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var ax = Math.abs(dx), ay = Math.abs(dy), u = 1 - tt / 2.4;
  if (tt < 2.4 && Math.abs(ax - (1.2 + u * 1.3)) < 0.14 && Math.abs(ay - (1.2 + u * 1.3)) < 0.14) return '#c8c8d0'; if (tt < 0.2 && Math.hypot(ax - 2.5, ay - 2.5) < 0.45) return '#9a9aa4';
  if (tt > 1.6 && tt < 3.4 && ax < 1.5 && ay < 1.5) return (((dx * 3 | 0) + (tt * 3 | 0)) % 3) ? '#e0b040' : '#b8862a';
  if (tt >= 3.4 && tt < 5.2 && ax + ay * 0.6 < 1.4 && ay < 1.2) return dy > 0.8 && tt > 4 && tt < 4.7 && ax < 0.5 ? '#1a2240' : '#eef0f4'; if (ax < 0.08 && ay < 0.08 && tt >= 5.2 && tt < 5.9) return '#c8c8d0'; return null; }); };
// a white dome with its panel seams and a lit window band, half sunk in the regolith
BUILD.moonDome = function(B, t){ box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var R = t.w / 2, d = Math.hypot(dx, dy, tt) / R; if (d > 1) return null;
  if (tt > R * 0.28 && tt < R * 0.42) return (((Math.atan2(dy, dx) * 6) | 0) % 2) ? '#bfefff' : '#3f6ad8'; return Math.abs(Math.sin(Math.atan2(dy, dx) * 5)) < 0.06 ? '#b8c0d0' : '#eef2f8'; }); };
// a radar dish on its post, tipped back to the sky
BUILD.moonDish = function(B, t){ var R = t.w / 2 - 0.3, H = t.h - R; box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ if (Math.hypot(dx, dy) < 0.15 && tt < H) return '#8a96b0';
  var v = dy * 0.6 + (tt - H) * 0.8, w2 = -dy * 0.8 + (tt - H) * 0.6, rr = Math.hypot(dx, v); if (rr < R && Math.abs(w2 - rr * rr / (R * 2.2)) < 0.16) return rr > R * 0.9 ? '#8a96b0' : '#e8ecf4';
  if (rr < 0.1 && w2 > 0 && w2 < R * 0.7) return '#c8ccd8'; return null; }); };
// the rocket on its pad, the gantry beside it
BUILD.moonRocket = function(B, t){ var H = t.h - 1.5; box(B, t.x, t.y, t.w, t.d, t.h, function(dx, dy, tt){ var r = Math.hypot(dx, dy);
  if (tt < 0.3) return (((dx * 2 | 0) + (dy * 2 | 0)) % 2) ? '#5a5e6a' : '#4a4e5a'; var rr = tt > H - 2 ? 0.8 * (H + 1.2 - tt) / 3.2 : 0.8;
  if (tt < H + 1.2 && r < rr) return Math.abs(tt - H * 0.55) < 0.4 ? '#1a1e2a' : tt > H - 2 ? '#e5483a' : '#f4f6fa';
  if (tt < 2.6 && Math.abs(dy) < 0.1 && Math.abs(dx) > 0.75 && Math.abs(dx) < 0.8 + (2.6 - tt) * 0.5) return '#e5483a';
  if (Math.abs(dx - 1.9) < 0.3 && Math.abs(dy) < 0.3 && tt < H - 0.5) return (Math.abs(dx - 1.9) > 0.2 || Math.abs(dy) > 0.2 || ((tt * 2) | 0) % 2) ? '#8a7a5a' : null; return null; }); };
LMSIZE.moonLander = [6, 6, 6.2]; LMSIZE.moonDome = [8, 8, 4]; LMSIZE.moonDish = [6, 5, 7]; LMSIZE.moonRocket = [5, 5, 14];
// @@WORLD STOPS END@@
window.RTT_PUTT_TRAIL = { API_VERSION:API_VERSION, COIN_V:COIN_V, BRK_V:BRK_V, PZ_COINS:PZ_COINS, plan:plan, slices:slices, run:run, GH:GH, TRAIL_L:TRAIL_L, ELEV:ELEV, KIT:KIT };
})();
