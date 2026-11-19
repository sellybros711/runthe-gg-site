/* golf/putt/gymkinds/tide.js: the TIDE kind of trail gym (RTT_GYMKIND_TIDE), Loch Ness's. A kind file: the registry (gyms.js, its
   KINDS README) finds it by its global, the frame (trail.js) plays it, check-putt proves it.

   THE PUZZLE is the expedition's, on the shore flats of the loch: a few of her sightings are out on the flats, each a camera set up
   on its tripod, and every one has to be photographed before the vault, the expedition's chest on the far shore, will open. The
   flats are sand at two heights, and the loch's water comes in and goes out with every step he takes: low, then up over the low
   sand, then up over the high sand too, then back down over the high sand, then low again (TIDE, four steps round). He cannot
   step onto sand the water is over, and he cannot stand still, so the read is when, not only where: a long way round can bring
   him to a bar just as it dries. The turf and the rocks never flood. A bump into a wall, a rock or the water is no step, and the
   tide does not move for it.

   THE GATEKEEPER'S TWIST is Ice Age's ice, as the weed on the rocks at the water's edge: a step onto the weed slides him on, the
   way he stepped, over every weed tile, until something stops him or he comes off it onto turf or dry sand. It is all one step,
   so the tide moves once.

   He moves TILE BY TILE (a step kind).

   THE LAYOUTS ARE HAND DESIGNED, never random. Row 0 is the far wall (the top of the screen), the last row the near wall with the
   gate in it. The frame's five characters (# G @ L C, gyms.js) and this kind's own:
     .  turf (never floods)       1  low sand (under water but at low tide)      2  high sand (under water only at the top of the tide)
     ~  the loch (never dry)      r  a rock (stops him)                          p  a camera sighting to photograph (on turf)
     w  weed on the rocks (slides him on)
   THE STATE is { p, n, f }: his tile, the steps taken round the tide (0 to 3) and the photos taken (a bit each). A few hundred
   states, so solve() and audit() are the registry's own breadth first search (lib), and stuck() is looked up from one search of
   every state. */
(function(){
var root = typeof window !== 'undefined' ? window : globalThis;
var LIB = function(){ return root.RTT_PUTT_GYMS.lib; };
// the water's height after n steps, round and round: low, over the low sand, over the high sand, back over the low sand
var TIDE = [0, 1, 2, 1];

/* THE GYMS. moves and proof are the solver's fewest steps and one shortest solution (U R D L), recorded from solve().
   The civilian's lines nudge, never solve. */
var GYMS = [
  /* THE SHORE FLATS, mid-world: the sand bars run across the room between the loch's channels, the high bars and the low ones,
     and three cameras wait out on the turf islands. The lesson is the tide's one rule: the bars dry in turn, and a step taken
     to wait is a step round the clock. */
  { id:'ln1', kind:'tide', world:'lochness', leg:9, name:'The Shore Flats', badge:'Tide Badge', mech:['tide'], pay:500, look:{ wall:'stone' },
    moves:28, proof:'URRRRDUUULRUULRLLLLLLLUURRRU',
    who:{ look:{ skin:'light', polo:'green', hat:'brown', pants:'brown', hair:'grey', hairStyle:'short', cap:true, shoes:'brown', gender:'male' } },
    say:['The water comes in and goes out with every step you take. Watch the sand.',
      'The low sand is only dry when the tide is right out. The high sand floods less often.',
      'If a bar is under water, walk somewhere else and come back. The tide keeps moving.'],
    rows:[
      '#####C#####',
      '#....p..r.#',
      '#~22~~~2~~#',
      '#.p.2.p...#',
      '#~~~222~~1#',
      '#r.r.2.1..#',
      '#2~1~~1~12#',
      '#.......1.#',
      '#L...@....#',
      '#####G#####'
    ] },
  /* THE SKERRIES, the gatekeeper: rocks run out into the loch with weed on them, and the cameras are on the skerries beyond the
     bars. The weed slides him on over the rocks, so where he stops is the weed's choice, and the tide has moved once by then.
     Its hint is the twist and nothing more. */
  { id:'ln2', kind:'tide', world:'lochness', leg:18, name:'The Skerries', badge:'Skerry Badge', mech:['tide', 'ice'], pay:1000, keeper:true, look:{ wall:'stone' },
    hint:'A slide over the weed is one step, however far it goes. Count the tide by steps, never by tiles.',
    moves:48, proof:'URRRRDUUDULUULLUULDRURRLLLUULLURRRRRRRLDDLRUULLU',
    who:{ look:{ skin:'light', polo:'navy', hat:'navy', pants:'navy', hair:'white', hairStyle:'short', cap:true, shoes:'black', gender:'male' } },
    say:['The weed on the rocks is slippery. Once you are on it, you go until something stops you.',
      'Sliding is only one step for the tide, however far you go.',
      'Look at where a slide ends before you start it. Then think about the water when you get there.'],
    rows:[
      '#####C#####',
      '#.2....p..#',
      '#w~2~~~1~~#',
      '#..11~pw~1#',
      '#122~~~~12#',
      '#....w...~#',
      '#12~211~~1#',
      '#r.1.~p..~#',
      '#~~2~~1~11#',
      '#....2...w#',
      '#L...@....#',
      '#####G#####'
    ] }
];

var PARSED = {};
function parse(G){ if (PARSED[G.id]) return PARSED[G.id]; var cams = [];
  var Q = LIB().room(G, function(ch, i){ if (ch === 'p') cams.push(i); else if ('12~rw'.indexOf(ch) < 0) return false; });
  Q.cams = cams; Q.full = (1 << cams.length) - 1; return PARSED[G.id] = Q; }
function init(G){ var Q = parse(G); return { p:Q.start, n:0, f:0 }; }
function key(s){ return s.p + ':' + s.n + ':' + s.f; }
// is tile i dry with the water at level lv: turf, a camera's turf, weed, the frame's tiles, or sand higher than the water
function dry(Q, i, lv){ if (i < 0) return false; var ch = Q.cell[i]; return ch === '.' || ch === 'p' || ch === 'w' || (ch === '1' && lv < 1) || (ch === '2' && lv < 2); }
var DR = [[0, -1], [1, 0], [0, 1], [-1, 0]];
/* ONE STEP. The frame's tiles first (the gate, the lever, the vault, shut till every photo is taken). Then the tile he steps onto
   must be dry when the tide has moved; weed slides him on to where it stops him. A camera's tile takes its photo. */
function act(G, s, dir){ var Q = parse(G), L = LIB(), n = L.nb(Q, s.p, dir), lv = TIDE[(s.n + 1) % 4];
  if (n >= 0 && n === Q.chest && s.f !== Q.full) return { s:s, ev:'shut', moves:[] };
  var fr = L.frameStep(G, Q, s, s.p, dir, init); if (fr) return fr;
  if (!dry(Q, n, lv) || n === Q.lever || n === Q.gate) return { s:s, ev:'bump', moves:[] };
  var mv = [['me', s.p, n, 'walk']], at = n, ev = 'step', guard = 0;
  while (Q.cell[at] === 'w' && guard++ < 20){ var m = L.nb(Q, at, dir); if (m < 0 || !dry(Q, m, lv) || m === Q.lever || m === Q.gate || m === Q.chest) break; mv.push(['me', at, m, 'slide']); at = m; ev = 'slide'; }
  var f = s.f, k = Q.cams.indexOf(at); if (k >= 0 && !(f >> k & 1)){ f |= 1 << k; mv.push(['cam', at, at, 'snap']); ev = 'snap'; }
  return { s:{ p:at, n:(s.n + 1) % 4, f:f }, ev:ev, moves:mv }; }
function moves(){ return [0, 1, 2, 3]; }
/* STUCK, looked up: every state a player can reach is searched once (lib.explore), and those the vault can still be reached from
   without the lever are kept; any other state (hemmed in by the water for good) is stuck. */
var GOOD = {};
function goodOf(G){ if (GOOD[G.id]) return GOOD[G.id]; var K = root.RTT_GYMKIND_TIDE, X = LIB().explore(K, G), N = X.list.length, back = [], i, ok = {};
  for (i = 0; i < N; i++) back.push([]); X.edges.forEach(function(e){ if (!e[2]) back[e[1]].push(e[0]); });
  var good = new Uint8Array(N), q = X.wins.map(function(w){ return w[0]; }); q.forEach(function(w){ good[w] = 1; });
  for (var hh = 0; hh < q.length; hh++) back[q[hh]].forEach(function(pp){ if (!good[pp]){ good[pp] = 1; q.push(pp); } });
  for (i = 0; i < N; i++) if (good[i]) ok[key(X.list[i])] = 1; return GOOD[G.id] = ok; }
function stuck(G, s){ return !goodOf(G)[key(s)]; }
function proof(G){ return (G.proof || '').split('').map(function(ch){ return 'URDL'.indexOf(ch); }); }
function enc(path){ return path.map(function(d){ return 'URDL'.charAt(d); }).join(''); }
function goal(){ return 'Photograph every sighting. Then reach the chest.'; }

/* ---- THE LOOK: the turf green with a shingle edge, the sand bars pale (the high ones a little warmer), the loch dark and peaty.
   The water is drawn live over the sand as the tide comes in and goes out, so what is under water is plain at every step. A rock
   is a grey boulder, the weed a dark green slick over a flat rock, and a sighting a camera on its tripod pointing out over the loch,
   with a dark hump in the water beyond it until its photo is taken. */
var DECK = 0.45;
function floor(gc){ if (gc.k === '#') return null; var wet = gc.k === '~', sand = gc.k === '1' || gc.k === '2';
  return { h:wet ? DECK - 0.35 : sand ? DECK - (gc.k === '1' ? 0.22 : 0.12) : DECK, mat:['tdfloor', { gu:gc.u, gv:gc.v, wk:wet ? 1 : gc.k === '1' ? 2 : gc.k === '2' ? 3 : gc.k === 'w' ? 4 : 0 }] }; }
function mats(){ return {
  tdfloor:['', '', '', 0, function(c, R, h3){ var u = c.gu || 0, v = c.gv || 0, k = c.wk || 0, n = h3(c.ti, c.tj, 311);
    if (k === 1) return R(n > 0.95 ? '#8ab4b8' : n > 0.5 ? '#24434c' : '#203c44');
    if (k === 2) return R(n > 0.9 ? '#b8ae94' : n > 0.45 ? '#cfc6aa' : '#c4ba9e');
    if (k === 3) return R(n > 0.9 ? '#d8cca0' : n > 0.45 ? '#e6dcb4' : '#ddd2a8');
    if (k === 4) return R(n > 0.7 ? '#2e4a2a' : n > 0.3 ? '#3e5a2e' : '#26402a');
    if (c.dt < 0) return R('#4a4a44'); if (u < 0.04 || u > 0.96 || v < 0.04 || v > 0.96) return R(n > 0.5 ? '#a8a294' : '#557e42');
    return R(n > 0.92 ? '#8a5aaa' : n < 0.18 ? '#557e42' : n < 0.5 ? '#5f8e4a' : '#689a50'); }] }; }

function camFn(B){ B.vox(-0.6, -0.6, 0, 0.6, 0.6, 1.4, function(set){
  B.tube(set, 0, 0, 0.95, -0.4, -0.3, 0, 0.04, 0.04, '#5a4a3a'); B.tube(set, 0, 0, 0.95, 0.4, -0.3, 0, 0.04, 0.04, '#5a4a3a'); B.tube(set, 0, 0, 0.95, 0, 0.45, 0, 0.04, 0.04, '#5a4a3a');
  B.blob(set, 0, 0, 1.08, 0.24, 0.18, 0.16, function(x, y, z){ return '#2a2a2e'; }); B.tube(set, 0, -0.12, 1.1, 0, -0.34, 1.1, 0.09, 0.09, '#1a1a1e'); B.blob(set, 0, -0.35, 1.1, 0.07, 0.03, 0.07, function(){ return '#9ad0e8'; }); }, 0.05); }
function rockFn(B){ B.vox(-0.8, -0.8, 0, 0.8, 0.8, 1.2, function(set){ B.blob(set, 0, 0, 0.45, 0.62, 0.55, 0.5, function(x, y, z){ return z > 0.75 ? '#5a8a3e' : x + y > 0.3 ? '#6a6a62' : '#8e8c82'; }); }, 0.06); }
function humpFn(B){ B.vox(-0.7, -0.5, 0, 0.7, 0.5, 0.7, function(set){ B.blob(set, 0, 0, 0.0, 0.55, 0.3, 0.5, function(x, y, z){ return z > 0.3 ? '#3e6046' : '#2e4a3c'; }); }, 0.05); }

function view(R){ var Q = R.Q, T = R.T, ctx = R.ctx, s0 = null;
  var spC = R.sprite('gymcamera', camFn, 1.2, 1.2, 1.4), spR = R.sprite('gymskerry', rockFn, 1.6, 1.6, 1.2), spH = R.sprite('gymhump', humpFn, 1.4, 1.0, 0.7);
  function P(x, y, z){ return R.scr(x, y, z); }
  // the water over a sand bar: drawn live, as deep as the tide is over it
  function flood(i, lv){ var c = R.at(i), h = T * 0.5, z = DECK - 0.05, a = P(c[0] - h, c[1] - h, z), b = P(c[0] + h, c[1] - h, z), d = P(c[0] + h, c[1] + h, z), e = P(c[0] - h, c[1] + h, z);
    ctx.fillStyle = lv > 1 ? 'rgba(32,60,68,.92)' : 'rgba(40,72,80,.82)'; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(d[0], d[1]); ctx.lineTo(e[0], e[1]); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(176,214,214,.5)'; ctx.lineWidth = Math.max(1, R.kk() * 0.4); var p0 = P(c[0] - h * 0.6, c[1], z), p1 = P(c[0] + h * 0.2, c[1], z); ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke(); }
  return {
    lay:function(s){ s0 = s; },
    move:function(m, u){ if (u < 1) return; var w = R.at(m[1]); if (m[0] === 'cam'){ R.burst(w[0], w[1], DECK + 1.2, ['#ffffff', '#e8f4ff', '#a8c8d8'], 14, 0.9, 0.8); R.sfx('blip'); } },
    things:function(ds){ if (!s0) return; var s = s0;
      for (var i = 0; i < Q.cell.length; i++){ (function(i){ var ch = Q.cell[i], w = R.at(i);
        if (ch === 'r') ds.push({ x:w[0], y:w[1], kd:function(){ R.drawSprite(spR, w[0], w[1], DECK); } });
        else if (ch === 'p'){ var k = Q.cams.indexOf(i), got = !!(s.f >> k & 1); ds.push({ x:w[0], y:w[1], kd:function(){ R.drawSprite(spC, w[0], w[1], DECK); } });
          if (!got) ds.push({ x:w[0], y:w[1] - T * 0.9, kd:function(){ R.drawSprite(spH, w[0], w[1] - T * 0.9, DECK - 0.35); } }); } })(i); } },
    ground:function(){ if (!s0) return; var lv = TIDE[s0.n]; for (var i = 0; i < Q.cell.length; i++){ var ch = Q.cell[i]; if ((ch === '1' && lv >= 1) || (ch === '2' && lv >= 2)) flood(i, lv); } },
    hot:function(){ return []; } }; }

root.RTT_GYMKIND_TIDE = { id:'tide', gyms:GYMS, input:'step', calm:true, unit:'step', hello:'Each step, the tide comes in or goes out. Step only onto dry sand.',
  parse:parse, init:init, key:key, act:act, step:act, moves:moves, stuck:stuck, proof:proof, enc:enc, goal:goal,
  me:function(G, s){ return s.p; }, place:function(G, s, i){ return { p:i, n:s.n, f:s.f }; },
  deck:function(G, s, i){ var Q = parse(G); return dry(Q, i, TIDE[s.n]) || i === Q.lever; },
  tell:{ snap:'Photo taken.', slide:'The weed slides you on.', shut:'Not yet. Photograph every sighting first.',
    stuck:'The water has you hemmed in. Undo it, or Restart.' },
  dur:function(how){ return how === 'slide' ? 0.1 : how === 'snap' ? 0.05 : 0.15; },
  floor:floor, mats:mats, view:view };
})();
