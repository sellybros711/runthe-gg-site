/* golf/putt/gymkinds/spade.js: the SPADE kind of trail gym (RTT_GYMKIND_SPADE), Treasure Island's. A kind file: the registry
   (gyms.js, its KINDS README) finds it by its global, the frame (trail.js) plays it, check-putt proves it.

   THE PUZZLE is the dig for Flint's treasure (Stevenson, "Treasure Island", 1883, chapters 31 to 33). He walks a stretch of the
   island's sand with a spade over his shoulder, and the spade holds ONE load of sand at a time. Heaps of sand stand about, and
   pits lie open, and he can walk through neither. Walk into a heap with the spade empty and he digs it away: the heap is gone
   (sand to walk on) and the spade is full. Walk into a pit with the spade full and he fills it: the pit is gone and the spade is
   empty. A full spade cannot dig and an empty one cannot fill. The marks of the map (an X burnt into the sand) are where the
   treasure lies, and every one has to be dug before the vault, the treasure chest under the far wall, will open. A mark is dug
   like a heap, with an empty spade, and digging it fills the spade and leaves an open pit where it was: a hole he cannot walk
   through until he fills it again. So the read is the order: where each load comes from, and where it has to go.

   THE GATEKEEPER'S TWIST is the Mississippi's raft, as Ben Gunn's coracle, the little boat of goatskin he keeps on the island: it
   lies on the water by the shore, and with him aboard a step onto water poles it one tile that way, and in a run of current the
   current takes it on, tile after tile, until the shore, a rock or still water stops it. A step onto the shore puts him ashore,
   and the coracle waits. He cannot dig or fill from the coracle. One mark lies across the water, so it cannot be dug without it.

   He moves TILE BY TILE (a step kind). A bump into a wall, a rock, the water, or a heap or pit he cannot work is no step.

   THE LAYOUTS ARE HAND DESIGNED, never random. Row 0 is the far wall (the top of the screen), the last row the near wall with the
   gate in it. The frame's five characters (# G @ L C, gyms.js) and this kind's own:
     .  sand (he walks it)     h  a heap of sand     u  an open pit     X  a mark of the map (the treasure, buried)     o  a rock
     ~  still water     > < ^ v  the current, running that way     R  the coracle, on still water
   THE STATE is { p, f, h, u, x, y, r }: his tile, the spade full (1) or empty (0), the heaps dug, the pits filled, the marks dug and
   the marks filled again (a bit each), and the coracle's tile. A few thousand states, so solve() and audit() are the registry's
   own breadth first search (lib), and stuck() is looked up from one search of every state. */
(function(){
var root = typeof window !== 'undefined' ? window : globalThis;
var LIB = function(){ return root.RTT_PUTT_GYMS.lib; };

/* THE GYMS. moves and proof are the solver's fewest steps and one shortest solution (U R D L), recorded from solve().
   The civilian's lines nudge, never solve. */
var GYMS = [
  /* THE SAND HILLS, mid-world: the dunes behind the beach, two marks of the map to dig, the heaps and pits of somebody's earlier
     digging in the way, and a pit right in front of the chest. The lesson is the kind's one rule: one load at a time, so every
     load that is dug has somewhere it has to go. */
  { id:'ti1', kind:'spade', world:'treasure', leg:9, name:'The Sand Hills', badge:'Spade Badge', mech:['spade'], pay:500, look:{ wall:'stone' },
    moves:30, proof:'UUURRRUULURRLDLLLLLULLRDRRUUUU',
    who:{ look:{ skin:'tan', polo:'white', hat:'red', pants:'navy', hair:'black', hairStyle:'short', cap:true, shoes:'brown', gender:'male' } },
    say:['The spade holds one load. Dig a heap, and it is full.',
      'A full spade fills a pit. An empty one digs. It never does both.',
      'Before you dig, ask where that sand is going.'],
    rows:[
      '#####C#####',
      '#oooouoooo#',
      '#X..o.o..X#',
      '#.h.u.u.h.#',
      '#oo.ooo.oo#',
      '#...h.h...#',
      '#.u.....u.#',
      '#.o.....o.#',
      '#L...@....#',
      '#####G#####'
    ] },
  /* FLINT'S TREASURE, the gatekeeper: the plateau under the tall tree, the anchorage cutting in across it, one mark on the sand
     spit out in the water and the rest on the near shore, and Ben Gunn's coracle pulled up in the shallows. The coracle is the
     only way to the spit, and the current runs back one way only. Its hint is the twist and nothing more. */
  { id:'ti2', kind:'spade', world:'treasure', leg:18, name:'The Treasure Dig', badge:'Doubloon Badge', mech:['spade', 'raft'], pay:1000, keeper:true, look:{ wall:'stone' },
    hint:'You cannot dig from the coracle. Think about what the spade holds when you step aboard.',
    moves:31, proof:'RUULRRDRURRUULLLLRUUULDLDLUUUUU',
    who:{ look:{ skin:'tan', polo:'brown', hat:'tan', pants:'brown', hair:'grey', hairStyle:'long', cap:false, shoes:'brown', gender:'male' } },
    say:['The coracle only goes where you pole it. The current takes it on.',
      'Look at where the current leaves the coracle before you go.',
      'Fill your spade before you sail, or empty it. It matters which.'],
    rows:[
      '#####C#####',
      '#ooooUoooo#',
      '#....u.o..#',
      '#~~~~~~~~~#',
      '#~~.X.~~~~#',
      '#~~.h.~~~~#',
      '#<<<<<<<R~#',
      '#..u.X.uu.#',
      '#.h..o..h.#',
      '#L...@....#',
      '#####G#####'
    ] }
];

var PARSED = {};
var FLOW = { '^':0, '>':1, 'v':2, '<':3 };
function parse(G){ if (PARSED[G.id]) return PARSED[G.id]; var heaps = [], pits = [], marks = [], raft = -1;
  var Q = LIB().room(G, function(ch, i){ if (ch === 'h') heaps.push(i); else if (ch === 'u' || ch === 'U') pits.push(i); else if (ch === 'X') marks.push(i); else if (ch === 'R') raft = i; else if ('o~><^v'.indexOf(ch) < 0) return false; });
  if (raft >= 0) Q.cell[raft] = '~'; Q.heaps = heaps; Q.pits = pits; Q.marks = marks; Q.allX = (1 << marks.length) - 1; Q.r0 = raft; return PARSED[G.id] = Q; }
function init(G){ var Q = parse(G); return { p:Q.start, f:0, h:0, u:0, x:0, y:0, r:Q.r0 }; }
function key(s){ return s.p + ':' + s.f + ':' + s.h + ':' + s.u + ':' + s.x + ':' + s.y + ':' + s.r; }
function bit(m, k){ return !!(m >> k & 1); }
// can he stand on tile i: sand, a heap dug away, a pit filled, a mark filled again (never the water, a rock, a frame tile)
function sand(Q, s, i){ if (i < 0 || i === Q.lever || i === Q.chest || i === Q.gate) return false; var ch = Q.cell[i];
  if (ch === '.') return true; var k;
  if ((k = Q.heaps.indexOf(i)) >= 0) return bit(s.h, k);
  if ((k = Q.pits.indexOf(i)) >= 0) return bit(s.u, k);
  if ((k = Q.marks.indexOf(i)) >= 0) return bit(s.y, k);
  return false; }
function water(Q, i){ if (i < 0) return false; var ch = Q.cell[i]; return ch === '~' || FLOW[ch] != null; }
function copy(s, o){ var n = { p:s.p, f:s.f, h:s.h, u:s.u, x:s.x, y:s.y, r:s.r }; for (var k in o) n[k] = o[k]; return n; }
/* ONE STEP. The frame's tiles first (the gate, the lever, the vault, shut till every mark is dug). Ashore: onto sand he walks; into
   a heap or a buried mark with the spade empty he digs it; into a pit or a dug mark with the spade full he fills it; onto the
   coracle he goes aboard. Aboard: onto the shore he steps off, onto water he poles, and the current carries him on. */
function act(G, s, dir){ var Q = parse(G), L = LIB(), n = L.nb(Q, s.p, dir), aboard = s.r >= 0 && s.p === s.r;
  if (n >= 0 && n === Q.chest && s.x !== Q.allX) return { s:s, ev:'shut', moves:[] };
  var fr = L.frameStep(G, Q, s, s.p, dir, init); if (fr) return fr;
  if (n < 0) return { s:s, ev:'bump', moves:[] };
  if (sand(Q, s, n)){ return { s:copy(s, { p:n }), ev:aboard ? 'ashore' : 'step', moves:[['me', s.p, n, 'walk']] }; }
  if (aboard){ if (!water(Q, n)) return { s:s, ev:'bump', moves:[] };
    var mv = [['boat', s.p, n, 'pole'], ['me', s.p, n, 'pole']], r = n, ev = 'pole', guard = 0;
    while (FLOW[Q.cell[r]] != null && guard++ < 40){ var m = L.nb(Q, r, FLOW[Q.cell[r]]); if (!water(Q, m)) break; mv.push(['me', r, m, 'drift'], ['boat', r, m, 'drift']); r = m; ev = 'drift'; }
    return { s:copy(s, { p:r, r:r }), ev:ev, moves:mv }; }
  if (n === s.r) return { s:copy(s, { p:n }), ev:'board', moves:[['me', s.p, n, 'walk']] };
  var k;
  if ((k = Q.heaps.indexOf(n)) >= 0){ if (s.f) return { s:s, ev:'full', moves:[] }; return { s:copy(s, { f:1, h:s.h | 1 << k }), ev:'dig', moves:[['heap', n, n, 'dig']] }; }
  if ((k = Q.pits.indexOf(n)) >= 0){ if (!s.f) return { s:s, ev:'empty', moves:[] }; return { s:copy(s, { f:0, u:s.u | 1 << k }), ev:'fill', moves:[['pit', n, n, 'fill']] }; }
  if ((k = Q.marks.indexOf(n)) >= 0){ if (!bit(s.x, k)){ if (s.f) return { s:s, ev:'full', moves:[] }; return { s:copy(s, { f:1, x:s.x | 1 << k }), ev:'treasure', moves:[['mark', n, n, 'dig']] }; }
    if (!s.f) return { s:s, ev:'empty', moves:[] }; return { s:copy(s, { f:0, y:s.y | 1 << k }), ev:'fill', moves:[['mark', n, n, 'fill']] }; }
  return { s:s, ev:'bump', moves:[] }; }
function moves(){ return [0, 1, 2, 3]; }
/* STUCK, looked up: every state a player can reach is searched once (lib.explore), and those the vault can still be reached from
   without the lever are kept; any other state (a load with nowhere to go, a pit that shuts the way for good) is stuck. */
var GOOD = {};
function goodOf(G){ if (GOOD[G.id]) return GOOD[G.id]; var K = root.RTT_GYMKIND_SPADE, X = LIB().explore(K, G), N = X.list.length, back = [], i, ok = {};
  for (i = 0; i < N; i++) back.push([]); X.edges.forEach(function(e){ if (!e[2]) back[e[1]].push(e[0]); });
  var good = new Uint8Array(N), q = X.wins.map(function(w){ return w[0]; }); q.forEach(function(w){ good[w] = 1; });
  for (var hh = 0; hh < q.length; hh++) back[q[hh]].forEach(function(pp){ if (!good[pp]){ good[pp] = 1; q.push(pp); } });
  for (i = 0; i < N; i++) if (good[i]) ok[key(X.list[i])] = 1; return GOOD[G.id] = ok; }
function stuck(G, s){ return !goodOf(G)[key(s)]; }
function proof(G){ return (G.proof || '').split('').map(function(ch){ return 'URDL'.indexOf(ch); }); }
function enc(path){ return path.map(function(d){ return 'URDL'.charAt(d); }).join(''); }
function goal(G){ return parse(G).r0 >= 0 ? 'Dig every mark. The coracle crosses water. Then reach the chest.' : 'Dig every mark of the map. Then reach the chest.'; }

/* ---- THE LOOK: the island's sand, pale and warm, with the turf showing at the room's edge; a rock a grey boulder; a heap a mound
   of the same sand; a pit a dark hole with its spoil round the rim; a mark a red X burnt into the sand, and once dug a pit of its
   own with the corner of a chest showing in it; the water the anchorage's deep green, its current streaked; the coracle a round
   little boat of goatskin on a frame of withies. A full spade shows as a little heap of sand at his feet. */
var DECK = 0.45;
function floor(gc){ if (gc.k === '#') return null; var wet = gc.k === '~' || gc.k === 'R' || FLOW[gc.k] != null;
  return { h:wet ? DECK - 0.3 : DECK, mat:['tifloor', { gu:gc.u, gv:gc.v, wk:wet ? (FLOW[gc.k] != null ? 2 + FLOW[gc.k] : 1) : 0 }] }; }
function mats(){ return {
  tifloor:['', '', '', 0, function(c, R, h3){ var u = c.gu || 0, v = c.gv || 0, k = c.wk || 0, n = h3(c.ti, c.tj, 331);
    if (k === 1) return R(n > 0.94 ? '#6ab0a8' : n > 0.55 ? '#266a72' : '#1e5a64');
    if (k >= 2){ var d = k - 2, a = d === 0 || d === 2 ? u : v, b = d === 0 || d === 2 ? v : u, w = Math.sin(b * 12.6 + Math.sin(a * 9.4) * 0.8);
      return R(Math.abs(((a * 3 + (d === 1 || d === 2 ? -b : b) * 0.4) % 1) - 0.5) < 0.05 && w > -0.2 ? '#c8ece4' : n > 0.6 ? '#3a8a90' : '#2e7a82'); }
    if (c.dt < 0) return R('#8a7650'); if (u < 0.04 || u > 0.96 || v < 0.04 || v > 0.96) return R(n > 0.5 ? '#b8a070' : '#c8b07c');
    return R(n > 0.95 ? '#f4e8c8' : n < 0.12 ? '#b8a070' : n < 0.5 ? '#c8b07c' : '#d8c08a'); }] }; }

function rockFn(B){ B.solid(-0.75, -0.75, 0, 0.75, 0.75, 1.3, function(x, y, z){ var r = Math.hypot(x, y * 1.1, z * 1.1); if (r > 0.7 + Math.sin(x * 9 + z * 7) * 0.05) return null;
    return z > 0.8 && Math.sin(x * 13 + y * 11) > 0.4 ? '#8a9a52' : x - y > 0.2 ? '#948e7c' : '#7a7466'; }, 0.06); }
function heapFn(B){ B.solid(-0.78, -0.78, 0, 0.78, 0.78, 0.95, function(x, y, z){ var r = Math.hypot(x, y); if (z > 0.9 * (1 - Math.pow(r / 0.76, 2))) return null;
    return Math.sin(x * 17 + y * 13 + z * 9) > 0.7 ? '#e8d8a8' : x + y < -0.2 ? '#d8c08a' : '#c4ac78'; }, 0.06); }
function pitFn(dug){ return function(B){ B.solid(-0.8, -0.8, -0.05, 0.8, 0.8, 0.32, function(x, y, z){ var r = Math.hypot(x, y);
    if (r < 0.48){ if (z > 0.02) return null; if (dug && x > 0 && x < 0.32 && y > -0.2 && y < 0.2) return Math.abs(x - 0.16) < 0.03 ? '#c8a040' : '#4a3018'; return '#1a140c'; }   // the dark hole (a chest's corner in a dug mark)
    if (r < 0.76 && z < 0.3 * (1 - Math.abs(r - 0.62) / 0.16)) return Math.sin(x * 19 + y * 7) > 0.5 ? '#d8c08a' : '#b8a070'; return null; }, 0.05); }; }
// the red X of the map, burnt into the sand (a flat sprite, so the scene never paints over it)
function markFn(B){ B.solid(-0.75, -0.75, 0, 0.75, 0.75, 0.08, function(x, y, z){ if (Math.max(Math.abs(x), Math.abs(y)) > 0.5) return null;
    return Math.abs(x - y) < 0.11 || Math.abs(x + y) < 0.11 ? '#c8302a' : null; }, 0.04); }
function boatFn(B){ B.solid(-0.75, -0.75, 0, 0.75, 0.75, 0.7, function(x, y, z){ var r = Math.hypot(x, y); if (r > 0.66 || z > 0.5) return null;
    if (r < 0.54 && z > 0.12) return Math.floor(Math.atan2(y, x) * 3) % 2 ? '#6a5030' : null; if (r < 0.58 && z > 0.12) return null; return Math.sin(Math.atan2(y, x) * 8) > 0.6 ? '#4a3420' : '#8a6a44'; }, 0.05); }
function view(R){ var Q = R.Q, T = R.T, ctx = R.ctx, s0 = null, boatAt = null;
  var spR = R.sprite('gymtirock', rockFn, 1.5, 1.5, 1.3), spH = R.sprite('gymtiheap', heapFn, 1.6, 1.6, 1.0), spP = R.sprite('gymtipit', pitFn(false), 1.6, 1.6, 0.4),
    spM = R.sprite('gymtimark', pitFn(true), 1.6, 1.6, 0.4), spB = R.sprite('gymtiboat', boatFn, 1.5, 1.5, 0.7), spX = R.sprite('gymtix', markFn, 1.5, 1.5, 0.1);
  function P(x, y, z){ return R.scr(x, y, z); }
  return {
    lay:function(s){ s0 = s; boatAt = null; },
    move:function(m, u){ if (m[0] === 'boat'){ var a = R.at(m[1]), b = R.at(m[2]); boatAt = u < 1 ? [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u] : null; }
      else if (u >= 1 && (m[0] === 'heap' || m[0] === 'pit' || m[0] === 'mark')){ var w = R.at(m[1]); R.burst(w[0], w[1], DECK + 0.4, m[0] === 'mark' && m[3] === 'dig' ? ['#e8c048', '#fff0a0', '#d8c08a'] : ['#d8c08a', '#c4ac78', '#e8d8a8'], 10, 0.6, 0.6); R.sfx('blip'); } },
    things:function(ds){ if (!s0) return; var s = s0;
      for (var i = 0; i < Q.cell.length; i++){ (function(i){ var ch = Q.cell[i], w = R.at(i), k;
        if (ch === 'o') ds.push({ x:w[0], y:w[1], kd:function(){ R.drawSprite(spR, w[0], w[1], DECK); } });
        else if ((k = Q.heaps.indexOf(i)) >= 0){ if (!bit(s.h, k)) ds.push({ x:w[0], y:w[1], kd:function(){ R.drawSprite(spH, w[0], w[1], DECK); } }); }
        else if ((k = Q.pits.indexOf(i)) >= 0){ if (!bit(s.u, k)) ds.push({ x:w[0], y:w[1] - 0.6, kd:function(){ R.drawSprite(spP, w[0], w[1], DECK - 0.05); } }); }
        else if ((k = Q.marks.indexOf(i)) >= 0){ if (!bit(s.x, k)) ds.push({ x:w[0], y:w[1] - 0.7, kd:function(){ R.drawSprite(spX, w[0], w[1], DECK); } }); else if (!bit(s.y, k)) ds.push({ x:w[0], y:w[1] - 0.6, kd:function(){ R.drawSprite(spM, w[0], w[1], DECK - 0.05); } }); } })(i); }
      if (s.r >= 0){ var bw = boatAt || R.at(s.r); ds.push({ x:bw[0], y:bw[1] - 0.3, kd:function(){ R.drawSprite(spB, bw[0], bw[1], DECK - 0.25); } }); }
      if (s.f){ var me = R.at(s.p); ds.push({ x:me[0] + 0.5, y:me[1] + 0.4, kd:function(){ R.drawSprite(spH, me[0] + 0.5, me[1] + 0.4, DECK - 0.55); } }); } },
    ground:function(){},
    hot:function(){ return []; } }; }

root.RTT_GYMKIND_SPADE = { id:'spade', gyms:GYMS, input:'step', calm:true, unit:'step', hello:'Walk into a heap to dig it. Walk into a pit to fill it. One load at a time.',
  parse:parse, init:init, key:key, act:act, step:act, moves:moves, stuck:stuck, proof:proof, enc:enc, goal:goal,
  me:function(G, s){ return s.p; }, place:function(G, s, i){ return copy(s, { p:i }); },
  deck:function(G, s, i){ var Q = parse(G); return sand(Q, s, i) || i === Q.lever || i === s.r; },
  tell:{ dig:'The spade is full. Find a pit for that sand.', fill:'The pit is filled. The spade is empty again.', treasure:'A mark of the map, dug! Now there is a pit where it was.', full:'The spade is full. Fill a pit first.', empty:'The spade is empty. Dig some sand first.',
    board:'Aboard the coracle. Step onto the water to pole it.', drift:'The current carries the coracle on.', shut:'Not yet. Dig every mark of the map first.',
    stuck:'There is no way to finish the dig from here. Undo it, or Restart.' },
  dur:function(how){ return how === 'pole' ? 0.22 : how === 'drift' ? 0.12 : how === 'dig' || how === 'fill' ? 0.25 : 0.15; },
  floor:floor, mats:mats, view:view };
})();
