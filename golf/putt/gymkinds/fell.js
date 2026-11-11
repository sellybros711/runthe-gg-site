/* golf/putt/gymkinds/fell.js: the TIMBER kind of trail gym (RTT_GYMKIND_FELL), the Pacific Forest's. A kind file: the registry
   (gyms.js, its KINDS README) finds it by its global, the frame (trail.js) plays it, check-putt proves it.

   THE PUZZLE is the expedition's, in a clearing of the old loggers' woods: the creek runs through it, a few sightings are set out
   across it, each a trail camera on its post, and every one has to be photographed before the vault, the expedition's chest under
   the far wall, will open. Nobody can wade the creek. But the clearing is full of standing trees, and walking into a tree fells it:
   it falls the way he pushed it, flat along the ground, as long as it is tall (two tiles or three), and a fallen tree is a bridge
   over the creek and a path over anything it lies across. A tree only falls where it has room: a rock, a wall, a camera, another
   tree or a log already down in its way, and it stands. The stump it leaves is low enough to step on, and the tree never stands again. So every tree is one bridge,
   laid one way only: the read is which tree has to go which way, and in what order, before it is the only one that could have.

   THE GATEKEEPER'S TWIST is the Himalayas' snow slope, as the steep muddy banks of the old skid road: on a bank he cannot stand, and
   after every step onto one he slides straight down it until something holds him, level ground, a log or the foot of the room, or
   a rock, a stump or the creek stops him. A log felled across a bank is a ledge to stand on.

   He moves TILE BY TILE (a step kind).

   THE LAYOUTS ARE HAND DESIGNED, never random. Row 0 is the far wall (the top of the screen), the last row the near wall with the
   gate in it. The frame's five characters (# G @ L C, gyms.js) and this kind's own:
     .  the forest floor          w  the creek (no way over but a log)          o  a rock (in the way)
     T  a standing tree, two tiles tall          Y  a standing tree, three tiles tall
     p  a trail camera sighting to photograph (on the floor)          /  a steep bank of the skid road (the gatekeeper's)
   THE STATE is { p, f, t }: his tile, the photos taken (a bit each) and each tree as a digit, 0 standing or 1 to 4 felled up,
   right, down or left. A few thousand states at most, so solve() and audit() are the registry's own breadth first search (lib),
   and stuck() is looked up from one search of every state. */
(function(){
var root = typeof window !== 'undefined' ? window : globalThis;
var LIB = function(){ return root.RTT_PUTT_GYMS.lib; };

/* THE GYMS. moves and proof are the solver's fewest steps and one shortest solution (U R D L), recorded from solve().
   The civilian's lines nudge, never solve. */
var GYMS = [
  /* THE CLEARING, mid-world: the creek cuts the clearing in three, and the trees along it are the only bridges. The lesson is the
     kind's one rule: a tree falls the way you push it, and only once. */
  { id:'pf1', kind:'fell', world:'pacific', leg:9, name:'The Clearing', badge:'Timber Badge', mech:['fell'], pay:500, look:{ wall:'plank' },
    hint:'Before you push a tree, look at where it will land. Then look at what else could have gone there.',
    moves:45, proof:'URRRRDLLLLLLUULLUURRUUURRDRRUUUUULLLLLDURRRRU',
    who:{ look:{ skin:'medium', polo:'green', hat:'brown', pants:'brown', hair:'brown', hairStyle:'short', cap:true, shoes:'brown', gender:'female' } },
    say:['Walk into a tree to fell it. It falls the way you push it.',
      'A fallen tree is a bridge. It only falls where it has room.',
      'Each tree goes down once. Pick its way before you push.'],
    rows:[
      '#####C#####',
      '#......Yo.#',
      '#pwww...ww#',
      '#ww.wwwww.#',
      '#.o...T..T#',
      '#...o.Y...#',
      '#wwww....w#',
      '#...wwwwww#',
      '#.o.......#',
      '#p.YT....p#',
      '#L...@....#',
      '#####G#####'
    ] },
  /* THE SKID ROAD, the gatekeeper: the old road's steep banks run down through the clearing, and on a bank he slides to the foot
     unless a log is there to hold him. It cannot be solved with the banks walled off (they are the only way up), and with the banks
     as level ground it is 41 steps. Its hint is the twist and nothing more. */
  { id:'pf2', kind:'fell', world:'pacific', leg:18, name:'The Skid Road', badge:'Skid Road Badge', mech:['fell', 'slope'], pay:1000, keeper:true, look:{ wall:'plank' },
    hint:'A log across a bank will hold you. Some trees are worth more as a ladder than as a bridge.',
    moves:47, proof:'UDRRURRDLLLLLLUUUURUUUUURRRRDDLLLLUUULUUUUUURRU',
    who:{ look:{ skin:'light', polo:'red', hat:'yellow', pants:'blue', hair:'grey', hairStyle:'short', cap:true, shoes:'brown', gender:'male' } },
    say:['The banks are too steep to stand on. You slide down to the bottom.',
      'A rock below you stops a slide. So does a stump.',
      'Look at each tree. Is it a bridge, or a ladder?'],
    rows:[
      '#####C#####',
      '#.....o.Y.#',
      '#.....o...#',
      '#wwwwwwwww#',
      '#wwwwwwwww#',
      '#..T......#',
      '#o///o/T//#',
      '#..o./.Yp/#',
      '#../Y/Y///#',
      '#.........#',
      '#wwwwwwwww#',
      '#..T.po..p#',
      '#L...@....#',
      '#####G#####'
    ] }
];

var PARSED = {};
function parse(G){ if (PARSED[G.id]) return PARSED[G.id]; var cams = [], trees = [];
  var Q = LIB().room(G, function(ch, i){ if (ch === 'p') cams.push(i); else if (ch === 'T' || ch === 'Y') trees.push(i); else if ('wo/'.indexOf(ch) < 0) return false; });
  Q.cams = cams; Q.trees = trees; Q.tall = trees.map(function(i){ return Q.cell[i] === 'Y' ? 3 : 2; }); Q.full = (1 << cams.length) - 1; Q.foot = (Q.start / Q.W) | 0;
  Q.zero = trees.map(function(){ return '0'; }).join(''); Q.logs = {}; return PARSED[G.id] = Q; }
function init(G){ var Q = parse(G); return { p:Q.start, f:0, t:Q.zero }; }
function key(s){ return s.p + ':' + s.f + ':' + s.t; }
// the tiles tree j covers lying felled the way d (0 up, 1 right, 2 down, 3 left), from the one past its stump
function span(Q, j, d){ var L = LIB(), out = [], at = Q.trees[j]; for (var k = 0; k < Q.tall[j]; k++){ at = L.nb(Q, at, d); if (at < 0) return null; out.push(at); } return out; }
// every log on the ground in tree state t: tile -> the tree it is
function logsOf(Q, t){ if (Q.logs[t]) return Q.logs[t]; var m = {}; for (var j = 0; j < t.length; j++){ var d = +t.charAt(j); if (!d) continue; span(Q, j, d - 1).forEach(function(i){ m[i] = j; }); } return Q.logs[t] = m; }
// can he stand on tile i (a log is a bridge over the creek and a ledge on a bank)
function walk(Q, t, i){ if (i < 0) return false; if (logsOf(Q, t)[i] != null) return true; var ch = Q.cell[i]; if (ch === 'T' || ch === 'Y') return t.charAt(Q.trees.indexOf(i)) !== '0'; return ch === '.' || ch === 'p' || ch === '/'; }
// what holds him on tile i: anything but a bare bank, and the foot of the room
function holds(Q, t, i){ return Q.cell[i] !== '/' || logsOf(Q, t)[i] != null || ((i / Q.W) | 0) >= Q.foot; }
/* ONE STEP. The frame's tiles first (the gate, the lever, the vault, shut till every photo is taken). Into a standing tree, it falls
   the way he pushed if every tile it would lie on is open floor, creek or bank (no rock, wall, camera, tree, stump or log), and he
   stays where he was. Otherwise the tile must hold him up; and on a bare bank he slides straight down until something holds him. A
   camera takes its photo as he reaches it. */
function act(G, s, dir){ var Q = parse(G), L = LIB(), n = L.nb(Q, s.p, dir);
  if (n >= 0 && n === Q.chest && s.f !== Q.full) return { s:s, ev:'shut', moves:[] };
  var fr = L.frameStep(G, Q, s, s.p, dir, init); if (fr) return fr;
  var j = Q.trees.indexOf(n);
  if (j >= 0 && s.t.charAt(j) === '0'){
    var sp = span(Q, j, dir), lg = logsOf(Q, s.t); if (!sp) return { s:s, ev:'bump', moves:[] };
    for (var k = 0; k < sp.length; k++){ var c = Q.cell[sp[k]]; if ((c !== '.' && c !== 'w' && c !== '/') || lg[sp[k]] != null || sp[k] === Q.start + Q.W) return { s:s, ev:'stand', moves:[] }; }
    var t = s.t.substring(0, j) + (dir + 1) + s.t.substring(j + 1);
    return { s:{ p:s.p, f:s.f, t:t }, ev:'fell', moves:[['tree', n, sp[sp.length - 1], 'fall']] }; }
  if (!walk(Q, s.t, n)) return { s:s, ev:Q.cell[n] === 'w' ? 'creek' : 'bump', moves:[] };
  var mv = [['me', s.p, n, 'walk']], at = n, ev = 'step', guard = 0;
  while (!holds(Q, s.t, at) && guard++ < 30){ var m = L.nb(Q, at, 2); if (!walk(Q, s.t, m)) break; mv.push(['me', at, m, 'slide']); at = m; ev = 'slide'; }
  if (at === s.p) return { s:s, ev:'slip', moves:[] };
  var f = s.f, kc = Q.cams.indexOf(at); if (kc >= 0 && !(f >> kc & 1)){ f |= 1 << kc; mv.push(['cam', at, at, 'snap']); ev = 'snap'; }
  return { s:{ p:at, f:f, t:s.t }, ev:ev, moves:mv }; }
function moves(){ return [0, 1, 2, 3]; }
/* STUCK, looked up: every state a player can reach is searched once (lib.explore), and those the vault can still be reached from
   without the lever are kept; any other state (a camera across the creek with every bridge to it laid the wrong way) is stuck. */
var GOOD = {};
function goodOf(G){ if (GOOD[G.id]) return GOOD[G.id]; var K = root.RTT_GYMKIND_FELL, X = LIB().explore(K, G), N = X.list.length, back = [], i, ok = {};
  for (i = 0; i < N; i++) back.push([]); X.edges.forEach(function(e){ if (!e[2]) back[e[1]].push(e[0]); });
  var good = new Uint8Array(N), q = X.wins.map(function(w){ return w[0]; }); q.forEach(function(w){ good[w] = 1; });
  for (var hh = 0; hh < q.length; hh++) back[q[hh]].forEach(function(pp){ if (!good[pp]){ good[pp] = 1; q.push(pp); } });
  for (i = 0; i < N; i++) if (good[i]) ok[key(X.list[i])] = 1; return GOOD[G.id] = ok; }
function stuck(G, s){ return !goodOf(G)[key(s)]; }
function proof(G){ return (G.proof || '').split('').map(function(ch){ return 'URDL'.indexOf(ch); }); }
function enc(path){ return path.map(function(d){ return 'URDL'.charAt(d); }).join(''); }
function goal(){ return 'Photograph every sighting. Then reach the chest.'; }

/* ---- THE LOOK: the clearing is moss and needles, the creek dark water over stones with a pale ripple, a bank of the skid road
   brown mud with streaks down it the way things slide. A standing tree is a fir with its long red trunk, a rock grey with moss on
   its top, a sighting a trail camera strapped to a post with its red light on until its photo is taken. A felled tree is a log of
   red brown bark lying along its tiles, its cut end pale, and the stump it came from stays behind. */
var DECK = 0.45;
function floor(gc){ if (gc.k === '#') return null; var cr = gc.k === 'w', bank = gc.k === '/';
  return { h:cr ? DECK - 0.25 : DECK, mat:['pffloor', { gu:gc.u, gv:gc.v, wk:cr ? 1 : bank ? 2 : 0 }] }; }
function mats(){ return {
  pffloor:['', '', '', 0, function(c, R, h3){ var u = c.gu || 0, v = c.gv || 0, k = c.wk || 0, n = h3(c.ti, c.tj, 341);
    if (c.dt < 0) return R('#3a2618');
    if (k === 1){ var rp = Math.abs(((u * 2 + v * 3 + n * 0.3) % 1) - 0.5) < 0.05; return R(rp ? '#8ac4b8' : n > 0.85 ? '#5a6a64' : n > 0.4 ? '#24484a' : '#1e3e40'); }
    if (k === 2){ var st = Math.abs(((u * 3 + n * 0.2) % 1) - 0.5) < 0.05; return R(st ? '#4a3420' : n > 0.9 ? '#8a6a46' : n > 0.4 ? '#6a4a30' : '#5a4028'); }
    if (u < 0.03 || u > 0.97 || v < 0.03 || v > 0.97) return R('#2e5a2e'); return R(n > 0.95 ? '#7ab04a' : n > 0.6 ? '#467a3c' : n < 0.2 ? '#6a4a2a' : '#386a34'); }] }; }

function camFn(B){ B.vox(-0.6, -0.6, 0, 0.6, 0.6, 1.4, function(set){
  B.tube(set, 0, 0, 0, 0, 0, 1.25, 0.1, 0.1, '#6a4428'); B.blob(set, 0, 0.1, 0.9, 0.3, 0.2, 0.32, function(x, y, z){ return z > 1.12 ? '#6a7a4a' : '#4a5a3a'; }); B.blob(set, 0, 0.3, 0.92, 0.12, 0.05, 0.12, function(){ return '#0e1418'; }); }, 0.05); }
function rockFn(B){ B.vox(-0.8, -0.8, 0, 0.8, 0.8, 1.1, function(set){ B.blob(set, 0, 0, 0.42, 0.62, 0.55, 0.46, function(x, y, z){ return z > 0.62 ? '#5a9a3a' : x + y > 0.3 ? '#4a4a44' : '#7a7a72'; }); }, 0.06); }
function treeFn(H){ return function(B){ B.vox(-0.9, -0.9, 0, 0.9, 0.9, H, function(set){ B.tube(set, 0, 0, 0, 0, 0, H * 0.45, 0.22, 0.18, '#6a3a22');
  for (var k = 0; k < 4; k++){ var z0 = H * (0.38 + k * 0.15), r = 0.8 - k * 0.17; B.blob(set, 0, 0, z0 + 0.25, r, r, 0.32, function(x, y, z){ return (x + y) > 0.2 ? '#1e3f26' : '#2a5230'; }); } }, 0.08); }; }
function stumpFn(B){ B.vox(-0.5, -0.5, 0, 0.5, 0.5, 0.5, function(set){ B.blob(set, 0, 0, 0.2, 0.32, 0.32, 0.22, function(x, y, z){ return z > 0.36 ? '#d8b07a' : '#5a2e1a'; }); }, 0.05); }
function logFn(B){ B.vox(-0.85, -0.85, 0, 0.85, 0.85, 0.6, function(set){ B.tube(set, -0.82, 0, 0.3, 0.82, 0, 0.3, 0.27, 0.27, '#7a4428'); }, 0.05); }
function logVFn(B){ B.vox(-0.85, -0.85, 0, 0.85, 0.85, 0.6, function(set){ B.tube(set, 0, -0.82, 0.3, 0, 0.82, 0.3, 0.27, 0.27, '#7a4428'); }, 0.05); }

function view(R){ var Q = R.Q, ctx = R.ctx, s0 = null;
  var spC = R.sprite('gympfcamera', camFn, 1.2, 1.2, 1.4), spR = R.sprite('gympfrock', rockFn, 1.6, 1.6, 1.1), spT2 = R.sprite('gympftree2', treeFn(3.2), 1.8, 1.8, 3.2), spT3 = R.sprite('gympftree3', treeFn(4.4), 1.8, 1.8, 4.4),
    spS = R.sprite('gympfstump', stumpFn, 1, 1, 0.5), spH = R.sprite('gympfloghz', logFn, 1.7, 1.7, 0.6), spV = R.sprite('gympflogvt', logVFn, 1.7, 1.7, 0.6);
  function P(x, y, z){ return R.scr(x, y, z); }
  // the red light on a camera not yet photographed
  function light(i){ var c = R.at(i), q = P(c[0] + 0.18, c[1] + 0.32, DECK + 1.1); ctx.fillStyle = 'rgba(232,58,42,.95)'; ctx.beginPath(); ctx.arc(q[0], q[1], Math.max(2, R.kk() * 1.6), 0, 7); ctx.fill(); }
  return {
    lay:function(s){ s0 = s; },
    move:function(m, u){ if (u < 1) return; var w = R.at(m[2]); if (m[0] === 'cam'){ R.burst(w[0], w[1], DECK + 1.1, ['#ffffff', '#e8f4ff', '#c8e0d8'], 14, 0.9, 0.8); R.sfx('blip'); } else if (m[0] === 'tree'){ R.burst(w[0], w[1], DECK + 0.6, ['#2a5230', '#3e8a34', '#8a6a46'], 22, 0.8, 1.1); R.sfx('blip'); } },
    things:function(ds){ if (!s0) return; var s = s0, lg = logsOf(Q, s.t);
      for (var i = 0; i < Q.cell.length; i++){ (function(i){ var ch = Q.cell[i], w = R.at(i), j = Q.trees.indexOf(i);
        if (j >= 0){ var d = +s.t.charAt(j); if (!d) ds.push({ x:w[0], y:w[1], kd:function(){ R.drawSprite(Q.tall[j] === 3 ? spT3 : spT2, w[0], w[1], DECK); } }); else ds.push({ x:w[0], y:w[1], kd:function(){ R.drawSprite(spS, w[0], w[1], DECK); } }); }
        else if (ch === 'o') ds.push({ x:w[0], y:w[1], kd:function(){ R.drawSprite(spR, w[0], w[1], DECK); } });
        else if (ch === 'p') ds.push({ x:w[0], y:w[1], kd:function(){ R.drawSprite(spC, w[0], w[1], DECK); if (!(s.f >> Q.cams.indexOf(i) & 1)) light(i); } });
        if (lg[i] != null){ var dd = +s.t.charAt(lg[i]) - 1, z = Q.cell[i] === 'w' ? DECK - 0.2 : DECK; ds.push({ x:w[0], y:w[1] - 0.01, kd:function(){ R.drawSprite(dd % 2 ? spH : spV, w[0], w[1], z); } }); } })(i); } },
    ground:function(){},
    hot:function(){ return []; } }; }

root.RTT_GYMKIND_FELL = { id:'fell', gyms:GYMS, input:'step', calm:true, unit:'step', hello:'Walk into a tree and it falls the way you push it.',
  parse:parse, init:init, key:key, act:act, step:act, moves:moves, stuck:stuck, proof:proof, enc:enc, goal:goal,
  me:function(G, s){ return s.p; }, place:function(G, s, i){ return { p:i, f:s.f, t:s.t }; },
  deck:function(G, s, i){ var Q = parse(G); return walk(Q, s.t, i) || i === Q.lever; },
  tell:{ snap:'Photo taken.', fell:'Timber! It makes a bridge.', stand:'No room. The tree will not fall that way.', creek:'Too deep to wade. You need a bridge.', slide:'The bank is too steep. You slide down.', slip:'Too steep. You slide straight back.', shut:'Not yet. Photograph every sighting first.',
    stuck:'No tree is left to bridge the way. Undo it, or Restart.' },
  dur:function(how){ return how === 'slide' ? 0.09 : how === 'snap' || how === 'fall' ? 0.05 : 0.15; },
  floor:floor, mats:mats, view:view };
})();
