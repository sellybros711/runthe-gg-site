/* golf/putt/gyms.js: the trail gyms, Putt Putt's puzzles between holes (RTT_PUTT_GYMS).

   The owner's brief (2026-10-16): "much more intricate and puzzling, more sparse, and much more rewarding", inspired
   by Pokemon gyms. Two a world: one mid-world, and one guarding the trail into the world's last hole.

   A GYM is a walled arena beside the trail with a gate in. Out on the trail he walks as he always does; through the
   gate he moves TILE BY TILE (a stick or an arrow steps one tile, a tap steps toward it), because the pieces in here
   are grid pieces: a barrel goes one tile a push, a conveyor carries you tile by tile. A gym is two or three rooms
   joined by doors, a reset lever by the entrance that puts every piece back, and a vault chest at the far end.

   This file is only the rules, the layouts and the proof. It draws nothing and touches no record: trail.js lays a gym
   into its trail and plays it, putt.js pays for it. It runs in node too (check-putt.mjs loads it to solve every gym).

   THE LAYOUTS ARE HAND DESIGNED, never random. Each is a small grid of characters, row 0 the far wall (the top of the
   screen) and the last row the near wall with the gate in it:

     #  wall             .  deck            o  a hole in the deck (a barrel pushed in fills it; you cannot walk it)
     b  a barrel         @  where you stand coming in (the gate is the tile below it)
     G  the gate         L  the reset lever (walk into it: every piece goes back)
     C  the vault chest (walk into it and it opens: reaching it IS solving the gym)
     < > ^ v  a conveyor (candy's mechanic): it carries you, or a barrel, tile by tile until a tile that is not one

   THE RULES (step):
     - a step into a wall, the gate's posts, a hole or the chest's sides does nothing; into the lever resets; into the
       chest opens it; into the gate leaves the gym (its pieces stay where they are until the lever).
     - a step into a barrel pushes it one tile if that tile is deck, a conveyor or a hole. Never a pull. Into a hole it
       drops and fills it, and the hole is deck from then on. Onto a conveyor it rides it to the end.
     - a conveyor carries whoever stands on it, one tile at a time, until the tile under them is not a conveyor or the
       next one is taken (a wall, a barrel, a hole for you); a barrel it carries into a hole fills it.

   solve() is a breadth first search over (where you are, where every barrel is, which holes are filled): the fewest
   steps to the chest. audit() walks every state a player can reach and asks that from each of them the chest can
   still be reached, counting the lever, so no gym can leave a player stuck where even the lever is out of reach. */
(function(){
var API_VERSION = 1;
var TILE = 1.6;   // a tile in trail feet: a barrel (1.4 ft) fills one, and a nine tile room fits a phone's width
var DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];   // up, right, down, left (up is away from the camera)
var CONV = { '^':0, '>':1, 'v':2, '<':3 };

/* THE GYMS. world, leg (the trail into that hole of the world: 9 is mid-world, 18 its last hole), the mechanics
   (the world's own first, then the earlier world's it is paired with), the rooms as one grid, and the civilian who
   stands by the gate: one line that nudges toward what to do, never how, and a plainer one after two resets. pay is
   the vault chest's coins, look how trail.js builds its walls, and moves and proof the solver's fewest steps and
   one shortest solution (U R D L), which check-putt.mjs solves again and holds them to. The guide for the owner (the aha and the solution step
   by step) is kept outside the game. */
var GYMS = [
  /* THE POWDER STORE, mid-world (the trail into hole 9): barrels and holes, two rooms. The lesson is that a filled hole
     is deck, so a barrel can be pushed over one barrel into the hole beyond it, and so you can walk where a hole was
     to get behind a barrel you could not reach. */
  { id:'pirate1', world:'pirate', leg:9, name:'The Powder Store', badge:'Powder Badge', mech:['barrel'], pay:500, look:{ wall:'stone' },
    moves:52, proof:'UURRRULLDLUUDDLLLURRDRUUUURRRRUULLLLLLLRDDLLUUUURRRR',
    who:{ look:{ skin:'medium', polo:'gold', hat:'red', pants:'navy', hair:'black', hairStyle:'ponytail', cap:false, gender:'female' } },
    say:['Careful with those barrels. You can push them, but you can\'t pull them back. My brother learned that the hard way.',
      'Here\'s what got me. A barrel in a hole is just more floor.',
      'Still stuck? That barrel in the middle isn\'t the one for the vault. Ask yourself what it\'s really for.'],
    rows:[
      '###########',
      '#.b.oC#...#',
      '#o#.###...#',
      '#......b..#',
      '#.#.#.#.#.#',
      '#....o....#',
      '#####o#####',
      '#...o.o...#',
      '#..b...b..#',
      '#.........#',
      '#.........#',
      '###L.@.####',
      '#####G#####'
    ] },
  /* THE CARGO HOLD, guarding the trail into the world's last hole: barrels with Candy Works' belts, three rooms. The
     lesson is that a belt carries a barrel as readily as it carries you, so the holes up in the hold that no walk can
     reach are filled by sending barrels up the belt, and they arrive in the order they were sent. The belt down the
     left side is the way back. */
  { id:'pirate2', world:'pirate', leg:18, name:'The Cargo Hold', badge:'Cargo Badge', mech:['barrel', 'conveyor'], pay:1000, keeper:true, look:{ wall:'plank' },
    moves:60, proof:'ULLUUUULLULURRRRRRLLDLDLULURRRRRRULLDURDDLRUULDDLRRDLLDLUUUU',
    who:{ look:{ skin:'tan', polo:'navy', hat:'white', pants:'khaki', hair:'brown', hairStyle:'short', cap:true, hatStyle:'cap', gender:'male' } },
    say:['Those belts in there don\'t care what\'s riding them. You, a barrel, whatever. Took my kids forever to figure out why that matters.',
      'You\'ll never walk to every hole in there. Doesn\'t mean a barrel can\'t get there.',
      'Once you ride that belt up, there\'s no carrying anything with you. Whatever you need up there has to go first.'],
    rows:[
      '###########',
      '#v..#C#...#',
      '#v..#o#.<<#',
      '#v...o...^#',
      '#v.......^#',
      '#v.......^#',
      '#v#######^#',
      '#v.....o.^#',
      '#v.b.....^#',
      '#v..b..o.^#',
      '#v....o.o^#',
      '#v###.#####',
      '#v>>>o#...#',
      '#v.b.#....#',
      '#.........#',
      '###L.@.####',
      '#####G#####'
    ] }
];

// ---- a layout, read once: its size, what each tile is, where the pieces start
var PARSED = {};
function parse(G){ if (PARSED[G.id]) return PARSED[G.id];
  var rows = G.rows, H = rows.length, W = rows[0].length, cell = [], holes = [], barrels = [], start = -1, gate = -1, lever = -1, chest = -1, hi = {};
  for (var r = 0; r < H; r++){ if (rows[r].length !== W) throw new Error(G.id + ': row ' + r + ' is ' + rows[r].length + ' wide, not ' + W);
    for (var c = 0; c < W; c++){ var ch = rows[r].charAt(c), i = r * W + c, k = ch;
      if (ch === 'b'){ barrels.push(i); k = '.'; } else if (ch === '@'){ start = i; k = '.'; } else if (ch === 'o'){ hi[i] = holes.length; holes.push(i); }
      else if (ch === 'G') gate = i; else if (ch === 'L') lever = i; else if (ch === 'C') chest = i;
      else if (!(ch === '#' || ch === '.' || CONV[ch] != null)) throw new Error(G.id + ': what is ' + ch + ' at ' + c + ',' + r);
      cell.push(k); } }
  if (start < 0 || gate < 0 || lever < 0 || chest < 0) throw new Error(G.id + ': a gym needs @, G, L and C');
  if (gate !== start + W) throw new Error(G.id + ': the gate is the tile below @');
  if (holes.length > 30) throw new Error(G.id + ': too many holes to keep as a mask');
  return PARSED[G.id] = { G:G, W:W, H:H, cell:cell, holes:holes, hi:hi, barrels:barrels.sort(function(a, b){ return a - b; }), start:start, gate:gate, lever:lever, chest:chest }; }

// the state: where you are, the barrels (sorted), the filled holes (a bit a hole)
function init(G){ var Q = parse(G); return { p:Q.start, b:Q.barrels.slice(), f:0 }; }
function key(s){ return s.p + '|' + s.b.join(',') + '|' + s.f; }
function nb(Q, i, d){ var c = i % Q.W, r = (i / Q.W) | 0, nc = c + DIRS[d][0], nr = r + DIRS[d][1]; return nc < 0 || nr < 0 || nc >= Q.W || nr >= Q.H ? -1 : nr * Q.W + nc; }
function isHole(Q, s, i){ var h = Q.hi[i]; return h != null && !(s.f & (1 << h)); }
// a tile something can stand on: deck, a conveyor, a filled hole
function deck(Q, s, i){ if (i < 0) return false; var k = Q.cell[i]; if (k === '.' || CONV[k] != null) return true; return k === 'o' && !isHole(Q, s, i); }

/* ONE STEP. Returns { s, ev, moves }: the new state (the same object when nothing moved), what happened ('walk',
   'push', 'fill', 'bump', 'edge', 'reset', 'open', 'exit'), and every piece's moves in order, for the animation:
   [who, from, to, how] with who 'me' or a barrel's index into s.b before the step. */
function step(G, s, d){ var Q = parse(G), n = nb(Q, s.p, d), mv = [];
  if (n < 0) return { s:s, ev:'bump', moves:mv };
  var k = Q.cell[n];
  if (n === Q.gate) return { s:s, ev:'exit', moves:mv };
  if (k === 'L') return { s:init(G), ev:'reset', moves:mv };
  if (k === 'C') return { s:s, ev:'open', moves:mv };
  if (k === '#') return { s:s, ev:'bump', moves:mv };
  if (isHole(Q, s, n)) return { s:s, ev:'edge', moves:mv };
  var b = s.b.slice(), f = s.f, bi = b.indexOf(n), ev = 'walk';
  if (bi >= 0){ var m = nb(Q, n, d), was = s.b.indexOf(n);
    if (m < 0 || b.indexOf(m) >= 0) return { s:s, ev:'bump', moves:mv };
    if (isHole(Q, { f:f }, m)){ f |= 1 << Q.hi[m]; b.splice(bi, 1); mv.push([was, n, m, 'fill']); ev = 'fill'; }
    else if (!deck(Q, { f:f }, m)) return { s:s, ev:'bump', moves:mv };
    else { b[bi] = m; mv.push([was, n, m, 'push']); ev = 'push'; } }
  mv.push(['me', s.p, n, bi >= 0 ? 'push' : 'walk']);
  /* THEN THE BELTS RUN until nothing on them can move: a barrel or you on a conveyor goes on a tile whenever the next
     one is free (a barrel into a hole fills it), so a queue of barrels held up at a belt's end moves up the moment the
     front one is pushed off. The barrels go first, in the order they sit along the belt from its end, then you. */
  var p = n, moved = true, guard = 0;
  while (moved && guard++ < 200){ moved = false;
    for (var j = 0; j < b.length; j++){ var at = b[j], cd = CONV[Q.cell[at]]; if (cd == null) continue; var to2 = nb(Q, at, cd);
      if (to2 < 0 || to2 === p || b.indexOf(to2) >= 0) continue;
      if (isHole(Q, { f:f }, to2)){ f |= 1 << Q.hi[to2]; mv.push([idOf(at), at, to2, 'fill']); b.splice(j, 1); j--; moved = true; if (ev === 'walk') ev = 'fill'; continue; }
      if (!deck(Q, { f:f }, to2)) continue;
      mv.push([idOf(at), at, to2, 'slide']); b[j] = to2; moved = true; }
    var pc = CONV[Q.cell[p]]; if (pc != null){ var q = nb(Q, p, pc); if (q >= 0 && b.indexOf(q) < 0 && deck(Q, { f:f }, q)){ mv.push(['me', p, q, 'ride']); p = q; moved = true; } } }
  b.sort(function(x, y){ return x - y; });
  return { s:{ p:p, b:b, f:f }, ev:ev, moves:mv };
  // which barrel a move is, for the animation: its tile at the start of the step, followed through this step's moves
  function idOf(at){ for (var z = mv.length - 1; z >= 0; z--) if (mv[z][0] !== 'me' && mv[z][2] === at) return mv[z][0]; return s.b.indexOf(at); } }

/* THE PROOF. Every state a player can reach from the gate, every step out of it, and the fewest steps to the chest.
   The lever is a step like any other (back to the start), so a state from which only the lever leads on is fine
   (it is a wrong move that teaches) and a state from which not even the lever can be reached is a softlock. */
function explore(G, cap){ cap = cap || 3000000; var s0 = init(G), k0 = key(s0), seen = {}, list = [s0], par = {}, edges = [], wins = [], i = 0; seen[k0] = 0; par[k0] = null;
  while (i < list.length){ var s = list[i], ks = key(s), from = i++;
    for (var d = 0; d < 4; d++){ var r = step(G, s, d);
      if (r.ev === 'open'){ wins.push(from); continue; }
      if (r.ev === 'exit' || r.s === s) continue;
      var kn = key(r.s), to = seen[kn];
      if (to == null){ if (list.length >= cap) return { overflow:true, n:list.length }; to = seen[kn] = list.length; list.push(r.s); par[kn] = [ks, d]; }
      edges.push([from, to]); } }
  return { list:list, seen:seen, par:par, edges:edges, wins:wins, k0:k0 }; }
function solve(G){ var X = explore(G); if (X.overflow) return { ok:false, why:'too many states (' + X.n + ')' };
  if (!X.wins.length) return { ok:false, why:'the chest cannot be reached', states:X.list.length };
  // BFS order: the first state found next to the chest is the nearest; the path back is its parents
  var w = X.wins[0], ks = key(X.list[w]), dirs = [];
  while (X.par[ks]){ dirs.unshift(X.par[ks][1]); ks = X.par[ks][0]; }
  dirs.push(dirOpen(G, X.list[w]));
  return { ok:true, moves:dirs.length, path:dirs, states:X.list.length }; }
function dirOpen(G, s){ for (var d = 0; d < 4; d++) if (step(G, s, d).ev === 'open') return d; return -1; }
function audit(G){ var X = explore(G); if (X.overflow) return { ok:false, why:'too many states' };
  var N = X.list.length, back = []; for (var i = 0; i < N; i++) back.push([]);
  X.edges.forEach(function(e){ back[e[1]].push(e[0]); });
  var good = new Uint8Array(N), q = X.wins.slice(); q.forEach(function(w){ good[w] = 1; });
  for (var h = 0; h < q.length; h++) back[q[h]].forEach(function(p){ if (!good[p]){ good[p] = 1; q.push(p); } });
  var stuck = 0, dead = 0, ex = null, missed = 0;
  /* dead: the chest is only reachable through the lever (a wrong move was made, and the lever undoes it). stuck: not
     even the lever can be reached (a barrel shut the way back). The game offers its own reset whenever the lever cannot
     be walked to (onFoot), so a stuck state the walk test calls reachable would be a real softlock: missed counts those. */
  var noLever = explore0(G, X), alarms = 0;
  for (i = 0; i < N; i++){ var s = X.list[i], lost = !onFoot(G, s) && shutIn(G, s);
    if (!good[i]){ stuck++; if (!lost){ missed++; if (!ex) ex = s; } } else { if (lost) alarms++; if (!noLever[i]) dead++; } }
  return { ok:missed === 0 && alarms === 0, states:N, stuck:stuck, missed:missed, alarms:alarms, dead:dead, example:ex }; }
/* SHUT IN: from here neither the lever nor the vault can be reached by any steps at all (pushes included). The game asks
   it only when the lever cannot simply be walked to (onFoot), and offers its reset button only when it is true, so a
   barrel queue that boxes him in for a moment, which a push undoes, never shows the button. The search is of the states
   reachable from here, which a shut in player has few of; past cap it answers no (not shut in). */
function shutIn(G, s0, cap){ cap = cap || 40000; var seen = {}, q = [s0], h = 0; seen[key(s0)] = 1;
  while (h < q.length){ var s = q[h++]; for (var d = 0; d < 4; d++){ var r = step(G, s, d);
      if (r.ev === 'reset' || r.ev === 'open') return false; if (r.ev === 'exit' || r.s === s) continue;
      var k = key(r.s); if (seen[k]) continue; seen[k] = 1; if (q.length >= cap) return false; q.push(r.s); } }
  return true; }
/* CAN HE WALK TO THE LEVER from here, pushing nothing (a belt still carries him)? When he cannot, the game shows its own
   reset button, so a barrel pushed across the way back never leaves a player shut in. */
function onFoot(G, s){ var Q = parse(G), seen = {}, st = [s.p]; seen[s.p] = 1;
  while (st.length){ var p = st.pop();
    for (var d = 0; d < 4; d++){ var n = nb(Q, p, d); if (n < 0) continue; if (n === Q.lever) return true;
      if (!deck(Q, s, n) || s.b.indexOf(n) >= 0) continue;
      var q = n, guard = 0; while (CONV[Q.cell[q]] != null && guard++ < 99){ var q2 = nb(Q, q, CONV[Q.cell[q]]); if (q2 < 0 || s.b.indexOf(q2) >= 0 || !deck(Q, s, q2)) break; q = q2; }
      if (!seen[q]){ seen[q] = 1; st.push(q); } } }
  return false; }
// the recorded proof as directions, for replaying a solved gym the way it was left
function proof(G){ return (G.proof || '').split('').map(function(ch){ return 'URDL'.indexOf(ch); }); }
// which states reach the chest WITHOUT pulling the lever: the ones a player is not yet lost in
function explore0(G, X){ var N = X.list.length, back = [], i; for (i = 0; i < N; i++) back.push([]);
  X.list.forEach(function(s, from){ for (var d = 0; d < 4; d++){ var r = step(G, s, d); if (r.ev === 'reset' || r.ev === 'open' || r.ev === 'exit' || r.s === s) continue; back[X.seen[key(r.s)]].push(from); } });
  var ok = new Uint8Array(N), q = X.wins.slice(); q.forEach(function(w){ ok[w] = 1; });
  for (var h = 0; h < q.length; h++) back[q[h]].forEach(function(p){ if (!ok[p]){ ok[p] = 1; q.push(p); } });
  return ok; }

// the gym on a trail: the world's two, by the leg of the hole the trail leads into
function at(world, leg){ for (var i = 0; i < GYMS.length; i++) if (GYMS[i].world === world && GYMS[i].leg === leg) return GYMS[i]; return null; }
function byId(id){ for (var i = 0; i < GYMS.length; i++) if (GYMS[i].id === id) return GYMS[i]; return null; }
// what the civilian says: the nudge, after two resets the plainer one, and after five a warmer one still (never the moves)
function clue(G, resets){ return G.say[resets >= 5 && G.say[2] ? 2 : resets >= 2 && G.say[1] ? 1 : 0]; }
/* ALL 22 BADGES (two gyms a world, eleven worlds) unlock the Puzzle Master item. The item is not in the game yet: it
   needs art the owner approves first. This is the condition it will be wired to. */
var MASTER = { badges:22, item:'Puzzle Master', wired:false };

var root = typeof window !== 'undefined' ? window : globalThis;
root.RTT_PUTT_GYMS = { API_VERSION:API_VERSION, TILE:TILE, DIRS:DIRS, CONV:CONV, GYMS:GYMS, MASTER:MASTER, parse:parse, init:init, key:key, step:step, solve:solve, audit:audit, onFoot:onFoot, shutIn:shutIn, proof:proof, at:at, byId:byId, clue:clue,
  deck:function(G, s, i){ return deck(parse(G), s, i); }, isHole:function(G, s, i){ return isHole(parse(G), s, i); } };
})();
