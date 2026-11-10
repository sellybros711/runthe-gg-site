/* golf/putt/gymkinds/raft.js: the RAFT kind of trail gym (RTT_GYMKIND_RAFT), the Mississippi's. A kind file: the registry (gyms.js,
   its KINDS README) finds it by its global, the frame (trail.js) plays it, check-putt proves it.

   THE PUZZLE is Huck's on the river (Mark Twain, "Adventures of Huckleberry Finn", 1884, and the pirates' raft to Jackson's Island in
   "The Adventures of Tom Sawyer", 1876). He walks the banks and the sandbars, and he cannot walk on the water. A raft lies moored in
   a backwater. Step onto it and he is aboard. Aboard, a step onto water POLES the raft one tile that way, with him on it; and if that
   tile is in the CURRENT (the water runs one way there, drawn as streaks) the current takes the raft on, tile after tile, the way it
   runs, until the bank, a snag or still water stops it. So the raft goes upstream only in still water, a run of current is a one way
   road, and where the raft comes to rest is a place, not a choice. A step onto a bank from the raft puts him ashore, and the raft
   waits where it is: it moves only with him aboard. Bundles of supplies (the ham, the bacon, the fishing lines the boys took to the
   island) lie on the banks, and every one has to be gathered before the vault, the chest on the far bank, will open.

   THE GATEKEEPER'S TWIST is Volcano Island's cracking floor, as the rotten planks of a wrecked steamboat's deck: a plank holds him
   once, and the moment he steps off it, it breaks and falls into the river. Where it was is still water then, and the raft can be
   poled through where the deck stood in its way. A plank broken in the wrong place can leave a bundle out of reach for good.

   He moves TILE BY TILE (a step kind). A bump into a wall, a tree, a snag or the water is no step.

   THE LAYOUTS ARE HAND DESIGNED, never random. Row 0 is the far wall (the top of the screen), the last row the near wall with the
   gate in it. The frame's five characters (# G @ L C, gyms.js) and this kind's own:
     .  bank or sandbar (he walks it)       ~  still water (a backwater)        > < ^ v  the current, running that way
     R  the raft, moored on still water    k  a snag in the river (stops the raft)     t  a cottonwood on the bank (stops him)
     b  a bundle of supplies, on the bank   x  a rotten plank (he walks it once; then it is still water)
   THE STATE is { p, r, b, x }: his tile, the raft's, the bundles gathered (a bit each) and the planks broken (a bit each). He is aboard
   when p is r. A few thousand states, so solve() and audit() are the registry's own breadth first search (lib), and stuck() is looked
   up from one search of every state. */
(function(){
var root = typeof window !== 'undefined' ? window : globalThis;
var LIB = function(){ return root.RTT_PUTT_GYMS.lib; };

/* THE GYMS. moves and proof are the solver's fewest steps and one shortest solution (U R D L), recorded from solve().
   The civilian's lines nudge, never solve. */
var GYMS = [
  /* JACKSON'S ISLAND, mid-world: the pirates' raft moored in the backwater by the gate, the river running down the room in two
     channels round the island, and the supplies left on the island and the far bank. The lesson is the river's one rule: the
     current takes the raft one way only, so the way back up is through the still water, and the order the bundles are fetched in
     is decided by where the current puts him down. */
  { id:'ms1', kind:'raft', world:'mississippi', leg:9, name:'Jackson’s Island', badge:'Pirate Raft Badge', mech:['raft'], pay:500, look:{ wall:'plank' },
    moves:28, proof:'RRRUUUULUDLLLLUULUULUUURRRRU',
    who:{ look:{ skin:'light', polo:'white', hat:'tan', pants:'brown', hair:'blond', hairStyle:'short', cap:false, shoes:'brown', gender:'male' } },
    say:['The current only goes one way. The still water lets you pole back up.',
      'Where the raft stops is where the river puts it. Look at what stops it.',
      'Before you pole into the current, look where it will leave you.'],
    rows:[
      '#####C#####',
      '#..b.....t#',
      '#.~~vv~~..#',
      '#.~kvvk~~.#',
      '#..~vv~b~.#',
      '#t.~vv~~~.#',
      '#.b~vv.k~.#',
      '#..~vv~~~.#',
      '#.~~vv~~R.#',
      '#L...@....#',
      '#####G#####'
    ] },
  /* THE WRECK OF THE WALTER SCOTT, the gatekeeper: the wreck lies across the river, her rotten deck planks bridging it, and the raft
     is moored above her. The planks are the way across on foot, and every plank he crosses falls in behind him and opens the river to
     the raft. Its hint is the twist and nothing more: a broken plank is water the raft can use. */
  { id:'ms2', kind:'raft', world:'mississippi', leg:18, name:'The Wreck of the Walter Scott', badge:'Steamboat Badge', mech:['raft', 'crack'], pay:1000, keeper:true, look:{ wall:'plank' },
    hint:'Every plank you cross falls in behind you. Think about which ones should fall, because the raft can pass where they were.',
    moves:37, proof:'URRRRLLLLLLLLRUUUDURLRUUUULLLLLLLRRRU',
    who:{ look:{ skin:'light', polo:'white', hat:'navy', pants:'navy', hair:'grey', hairStyle:'short', cap:true, shoes:'black', gender:'male' } },
    say:['The planks hold you once. After that they are river.',
      'A plank you break is a gap the raft can float through.',
      'Cross the wreck where you want the river open, and nowhere else.'],
    rows:[
      '#####C#####',
      '#.b.......#',
      '#~~~~~~~~~#',
      '#>>>>>>>>>#',
      '#.~~.~~~.~#',
      '#xx~.~xx~.#',
      '#<<<<<<<<<#',
      '#~R~.~~~~~#',
      '#b.......b#',
      '#L...@....#',
      '#####G#####'
    ] }
];

var PARSED = {};
var FLOW = { '^':0, '>':1, 'v':2, '<':3 };
function parse(G){ if (PARSED[G.id]) return PARSED[G.id]; var bags = [], planks = [], raft = -1;
  var Q = LIB().room(G, function(ch, i){ if (ch === 'b') bags.push(i); else if (ch === 'x') planks.push(i); else if (ch === 'R') raft = i; else if ('~><^vkt'.indexOf(ch) < 0) return false; });
  if (raft < 0) throw new Error(G.id + ': a raft gym needs its raft (R)');
  Q.cell[raft] = '~'; Q.bags = bags; Q.planks = planks; Q.full = (1 << bags.length) - 1; Q.r0 = raft; return PARSED[G.id] = Q; }
function init(G){ var Q = parse(G); return { p:Q.start, r:Q.r0, b:0, x:0 }; }
function key(s){ return s.p + ':' + s.r + ':' + s.b + ':' + s.x; }
function broken(Q, x, i){ var k = Q.planks.indexOf(i); return k >= 0 && !!(x >> k & 1); }
// can he stand on tile i (the bank, a sandbar, a bundle's tile, a plank that has not fallen)
function land(Q, x, i){ if (i < 0) return false; var ch = Q.cell[i]; return (ch === '.' || ch === 'b' || (ch === 'x' && !broken(Q, x, i))) && i !== Q.lever && i !== Q.chest && i !== Q.gate; }
// can the raft float on tile i (still water, the current, or where a plank has fallen)
function water(Q, x, i){ if (i < 0) return false; var ch = Q.cell[i]; return ch === '~' || FLOW[ch] != null || (ch === 'x' && broken(Q, x, i)); }
var DR = [[0, -1], [1, 0], [0, 1], [-1, 0]];
/* ONE STEP. The frame's tiles first (the gate, the lever, the vault, shut till every bundle is his). Ashore: a step onto the bank, or
   onto the raft. Aboard: a step onto the bank puts him ashore, and a step onto water poles the raft there, and the current carries
   it on. A plank he steps off falls in. */
function act(G, s, dir){ var Q = parse(G), L = LIB(), n = L.nb(Q, s.p, dir), aboard = s.p === s.r;
  if (n >= 0 && n === Q.chest && s.b !== Q.full) return { s:s, ev:'shut', moves:[] };
  var f = L.frameStep(G, Q, s, s.p, dir, init); if (f) return f;
  var x = s.x, b = s.b, mv = [], ev = 'step';
  var leave = function(){ var k = Q.planks.indexOf(s.p); if (!aboard && k >= 0 && !(x >> k & 1)){ x |= 1 << k; mv.push(['plank', s.p, s.p, 'fall']); ev = 'crack'; } };
  var take = function(t){ var k = Q.bags.indexOf(t); if (k >= 0 && !(b >> k & 1)){ b |= 1 << k; mv.push(['bag', t, t, 'take']); ev = 'bag'; } };
  if (land(Q, x, n)){ mv.push(['me', s.p, n, 'walk']); leave(); take(n); if (aboard && ev === 'step') ev = 'ashore'; return { s:{ p:n, r:s.r, b:b, x:x }, ev:ev, moves:mv }; }
  if (!aboard){ if (n === s.r){ mv.push(['me', s.p, n, 'walk']); leave(); if (ev === 'step') ev = 'board'; return { s:{ p:n, r:s.r, b:b, x:x }, ev:ev, moves:mv }; } return { s:s, ev:'bump', moves:[] }; }
  if (!water(Q, x, n)) return { s:s, ev:'bump', moves:[] };
  mv.push(['raft', s.p, n, 'pole'], ['me', s.p, n, 'pole']); ev = 'pole';
  var r = n, guard = 0; while (FLOW[Q.cell[r]] != null && !broken(Q, x, r) && guard++ < 40){ var m = L.nb(Q, r, FLOW[Q.cell[r]]); if (!water(Q, x, m)) break; mv.push(['me', r, m, 'drift'], ['raft', r, m, 'drift', 'with']); r = m; ev = 'drift'; }
  return { s:{ p:r, r:r, b:b, x:x }, ev:ev, moves:mv }; }
function moves(){ return [0, 1, 2, 3]; }
/* STUCK, looked up: every state a player can reach is searched once (lib.explore), and those the vault can still be reached from
   without the lever are kept; any other state (a bundle out of reach for good, or no way left to the vault) is stuck. */
var GOOD = {};
function goodOf(G){ if (GOOD[G.id]) return GOOD[G.id]; var K = root.RTT_GYMKIND_RAFT, X = LIB().explore(K, G), N = X.list.length, back = [], i, ok = {};
  for (i = 0; i < N; i++) back.push([]); X.edges.forEach(function(e){ if (!e[2]) back[e[1]].push(e[0]); });
  var good = new Uint8Array(N), q = X.wins.map(function(w){ return w[0]; }); q.forEach(function(w){ good[w] = 1; });
  for (var hh = 0; hh < q.length; hh++) back[q[hh]].forEach(function(pp){ if (!good[pp]){ good[pp] = 1; q.push(pp); } });
  for (i = 0; i < N; i++) if (good[i]) ok[key(X.list[i])] = 1; return GOOD[G.id] = ok; }
function stuck(G, s){ return !goodOf(G)[key(s)]; }
function proof(G){ return (G.proof || '').split('').map(function(ch){ return 'URDL'.indexOf(ch); }); }
function enc(path){ return path.map(function(d){ return 'URDL'.charAt(d); }).join(''); }
function goal(){ return 'Gather every bundle. Then reach the chest.'; }

/* ---- THE LOOK: the banks summer grass with a sandy edge, the river brown and slow, its still backwaters darker and smooth, its
   current marked in pale streaks the way it runs (baked: the river never changes, only the raft moves on it). A snag is a dead
   tree's grey limbs standing up out of the water, a cottonwood a round green tree, a bundle a sack tied with a cord and a ham
   beside it, the raft a square of lashed logs with its little wigwam and a steering oar, and a rotten plank a grey board with a
   crack in it, over the water it will fall into. */
var DECK = 0.45;
function floor(gc){ if (gc.k === '#') return null; var wet = gc.k === '~' || gc.k === 'R' || gc.k === 'k' || gc.k === 'x' || FLOW[gc.k] != null;
  return { h:wet ? DECK - 0.3 : DECK, mat:['rffloor', { gu:gc.u, gv:gc.v, wk:wet ? (FLOW[gc.k] != null ? 2 + FLOW[gc.k] : 1) : 0 }] }; }
function mats(){ return {
  rffloor:['', '', '', 0, function(c, R, h3){ var u = c.gu || 0, v = c.gv || 0, k = c.wk || 0, n = h3(c.ti, c.tj, 211);
    if (k === 1) return R(n > 0.94 ? '#7a9aa0' : n > 0.55 ? '#4e6e76' : '#486870');
    if (k >= 2){ var d = k - 2, a = d === 0 || d === 2 ? u : v, b = d === 0 || d === 2 ? v : u, w = Math.sin(b * 12.6 + Math.sin(a * 9.4) * 0.8);
      return R(Math.abs(((a * 3 + (d === 1 || d === 2 ? -b : b) * 0.4) % 1) - 0.5) < 0.05 && w > -0.2 ? '#b8d0d0' : n > 0.6 ? '#6e8c94' : '#5e7f86'); }
    if (c.dt < 0) return R('#5a4a2a'); if (u < 0.04 || u > 0.96 || v < 0.04 || v > 0.96) return R(n > 0.5 ? '#c8b080' : '#5e8a3a');
    return R(n > 0.92 ? '#8ab85a' : n < 0.18 ? '#5e8a3a' : n < 0.5 ? '#6a9a44' : '#74a64c'); }] }; }

function raftFn(B){ B.vox(-0.8, -0.8, 0, 0.8, 0.8, 1.5, function(set){
  for (var k = 0; k < 5; k++){ var y = -0.62 + k * 0.31; B.tube(set, -0.72, y, 0.12, 0.72, y, 0.12, 0.15, 0.15, k % 2 ? '#8a6038' : '#a87a44'); }
  B.tube(set, -0.45, -0.75, 0.27, -0.45, 0.75, 0.27, 0.05, 0.05, '#d8c090'); B.tube(set, 0.45, -0.75, 0.27, 0.45, 0.75, 0.27, 0.05, 0.05, '#d8c090');
  B.blob(set, 0.05, 0, 0.6, 0.34, 0.3, 0.42, function(x, y, z){ return z > 0.85 ? '#b8986a' : Math.abs(y) < 0.08 && x < -0.2 && z < 0.6 ? '#3a2814' : '#c8a870'; });
  B.tube(set, 0.7, 0.55, 0.3, 0.9, 0.9, 1.1, 0.04, 0.04, '#6a4a26'); }, 0.06); }
function bagFn(B){ B.vox(-0.6, -0.6, 0, 0.6, 0.6, 1.2, function(set){ B.blob(set, -0.12, 0, 0.42, 0.42, 0.4, 0.42, function(x, y, z){ return x + y > 0.2 ? '#b8a07a' : '#d8c8a0'; });
  B.tube(set, -0.12, 0, 0.78, -0.12, 0, 1.0, 0.14, 0.06, '#8a6a3a'); B.blob(set, 0.32, 0.1, 0.22, 0.2, 0.18, 0.2, function(x, y, z){ return z > 0.3 ? '#f4ece0' : '#a84a32'; }); }, 0.06); }
function snagFn(B){ B.vox(-0.7, -0.7, 0, 0.7, 0.7, 1.6, function(set){ B.tube(set, 0, 0, 0, 0.1, 0, 1.2, 0.16, 0.1, '#7a6a52'); B.tube(set, 0.05, 0, 0.8, 0.5, 0.2, 1.4, 0.08, 0.05, '#8a7a62');
  B.tube(set, 0.05, 0, 0.6, -0.45, -0.15, 1.1, 0.08, 0.05, '#8a7a62'); B.tube(set, 0.1, 0, 1.2, 0.0, 0.3, 1.55, 0.05, 0.03, '#9a8a72'); }, 0.06); }
function treeFn(B){ B.vox(-0.9, -0.9, 0, 0.9, 0.9, 2.6, function(set){ B.tube(set, 0, 0, 0, 0, 0, 1.2, 0.18, 0.14, '#6a4a2a');
  B.blob(set, 0, 0, 1.75, 0.8, 0.8, 0.75, function(x, y, z){ return z > 2.1 && x < 0.1 ? '#8ac05a' : x + y > 0.4 ? '#3e7a2e' : '#5a9a3e'; }); }, 0.08); }

function view(R){ var Q = R.Q, T = R.T, ctx = R.ctx, s0 = null, rx = null, ry = null, falling = {};
  var spR = R.sprite('gymraft', raftFn, 1.6, 1.6, 1.5), spB = R.sprite('gymbundle', bagFn, 1.2, 1.2, 1.2), spK = R.sprite('gymsnag', snagFn, 1.4, 1.4, 1.6), spT = R.sprite('gymtree', treeFn, 1.8, 1.8, 2.6);
  function P(x, y, z){ return R.scr(x, y, z); }
  // a rotten plank: grey boards across the tile over the water, a dark crack through them
  function plank(i){ var c = R.at(i), h = T * 0.48, z = DECK, a = P(c[0] - h, c[1] - h, z), b = P(c[0] + h, c[1] - h, z), d = P(c[0] + h, c[1] + h, z), e = P(c[0] - h, c[1] + h, z);
    ctx.fillStyle = '#8a8070'; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(d[0], d[1]); ctx.lineTo(e[0], e[1]); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#5a5244'; ctx.lineWidth = Math.max(1, R.kk() * 0.5); for (var k = 1; k < 3; k++){ var p0 = P(c[0] - h, c[1] - h + 2 * h * k / 3, z), p1 = P(c[0] + h, c[1] - h + 2 * h * k / 3, z); ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke(); }
    ctx.strokeStyle = '#2a2418'; var q0 = P(c[0] - h * 0.6, c[1] - h * 0.3, z), q1 = P(c[0] - h * 0.1, c[1] + h * 0.1, z), q2 = P(c[0] + h * 0.5, c[1] - h * 0.2, z); ctx.beginPath(); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]); ctx.lineTo(q2[0], q2[1]); ctx.stroke(); }
  return {
    lay:function(s){ s0 = s; var q = R.at(s.r); rx = q[0]; ry = q[1]; falling = {}; },
    move:function(m, u){ if (m[0] === 'raft'){ var a = R.at(m[1]), b = R.at(m[2]); rx = a[0] + (b[0] - a[0]) * u; ry = a[1] + (b[1] - a[1]) * u; return; }
      if (u < 1) return; var w = R.at(m[1]);
      if (m[0] === 'bag'){ R.burst(w[0], w[1], DECK + 0.6, ['#ffffff', '#f4ece0', '#d8c8a0'], 10, 0.8, 0.7); R.sfx('blip'); }
      if (m[0] === 'plank'){ falling[m[1]] = 1; R.burst(w[0], w[1], DECK, ['#c8b98a', '#8a8070', '#ffffff'], 12, 0.9, 0.7); R.sfx('blip'); } },
    things:function(ds){ if (!s0) return; var s = s0;
      for (var i = 0; i < Q.cell.length; i++){ (function(i){ var ch = Q.cell[i], w = R.at(i);
        if (ch === 'k') ds.push({ x:w[0], y:w[1], kd:function(){ R.drawSprite(spK, w[0], w[1], DECK - 0.3); } });
        else if (ch === 't') ds.push({ x:w[0], y:w[1], kd:function(){ R.drawSprite(spT, w[0], w[1], DECK); } });
        else if (ch === 'b'){ var k = Q.bags.indexOf(i); if (!(s.b >> k & 1)) ds.push({ x:w[0], y:w[1], kd:function(){ R.drawSprite(spB, w[0], w[1], DECK); } }); } })(i); }
      ds.push({ x:rx, y:ry - T * 0.05, kd:function(){ R.drawSprite(spR, rx, ry, DECK - 0.25); } }); },
    // the planks still standing, drawn on the deck over the water they will fall into
    ground:function(){ if (!s0) return; Q.planks.forEach(function(i, k){ if (!(s0.x >> k & 1) && !falling[i]) plank(i); }); },
    hot:function(){ return []; } }; }

root.RTT_GYMKIND_RAFT = { id:'raft', gyms:GYMS, input:'step', calm:true, unit:'step', hello:'Step aboard the raft and pole it. The current carries it on.',
  parse:parse, init:init, key:key, act:act, step:act, moves:moves, stuck:stuck, proof:proof, enc:enc, goal:goal,
  me:function(G, s){ return s.p; }, place:function(G, s, i){ return { p:i, r:s.r, b:s.b, x:s.x }; },
  deck:function(G, s, i){ var Q = parse(G); return land(Q, s.x, i) || i === Q.lever; },
  tell:{ board:'Aboard. Step onto the water to pole the raft.', drift:'The current takes the raft on.', bag:'A bundle of supplies.', crack:'The rotten plank falls into the river.', shut:'Not yet. Gather every bundle first.',
    stuck:'No way to finish from here. Undo it, or Restart.' },
  dur:function(how){ return how === 'drift' ? 0.14 : how === 'pole' ? 0.2 : how === 'fall' ? 0.05 : 0.15; },
  floor:floor, mats:mats, view:view };
})();
