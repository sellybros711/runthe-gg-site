/* golf/putt/gymkinds/push.js: the PUSH kind of trail gym (RTT_GYMKIND_PUSH), Pirate Cove's. A kind file: the registry
   (gyms.js, its KINDS README) finds it by its global, the frame (trail.js) plays it, check-putt proves it.

   Moved here from gyms.js (2026-10-17) with ZERO change to its rules: the same layouts, the same step(), the same
   solver, audit, shutIn and walk test, so Pirate Cove's gyms solve in the same 52 and 60 steps, by the same proofs,
   over the same 37,063 and 102,121 states. What it draws (the barrels, the belts' chevrons, its holes and belts in
   the floor) moved here from trail.js line for line, and draws pixel for pixel as it did.

   He moves TILE BY TILE (a stick or an arrow steps one tile, a tap steps toward it), because the pieces in here are
   grid pieces: a barrel goes one tile a push, a conveyor carries you tile by tile. A gym is two or three rooms joined
   by doors, a reset lever by the entrance that puts every piece back, and a vault chest at the far end.

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
  { id:'pirate1', kind:'push', world:'pirate', leg:9, name:'The Powder Store', badge:'Powder Badge', mech:['barrel'], pay:500, look:{ wall:'stone' },
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
  { id:'pirate2', kind:'push', world:'pirate', leg:18, name:'The Cargo Hold', badge:'Cargo Badge', mech:['barrel', 'conveyor'], pay:1000, keeper:true, look:{ wall:'plank' },
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


/* ---- THE KIND'S INTERFACE (gyms.js, KINDS README). A step kind: the frame steps it, and its own lever, chest and gate
   tiles are answered by step() itself, as they always were. */
var DECK = 0.45, PIT = -0.5, SUNK = -1.3;   // the frame's deck, a hole's floor, and a barrel sunk in one (trail feet)
var G_STEP = 0.15, G_RIDE = 0.1, G_FILL = 0.26;
// its holes and belts in the floor, in each world's colours (the deck's own are the frame's)
var PAL = { pirate:{ pit:['#14425a', '#3f8fb4', '#0a1c26'], belt:['#3a3f48', '#22262c', '#ffd23a'] } };
function goal(){ return 'Reach the vault. You can push a barrel but never pull it.'; }
function enc(path){ return path.map(function(d){ return 'URDL'.charAt(d); }).join(''); }
/* THE FLOOR: a hole sits down at PIT with water in it, a belt carries its chevrons. Baked into the trail's picture
   (trail.js asks floor() for the height and the material of every point of the room, and mats() paints them). */
function floor(gc){ var pit = gc.k === 'o' && gc.u > 0.07 && gc.u < 0.93 && gc.v > 0.07 && gc.v < 0.93, cd = CONV[gc.k];
  if (!pit && cd == null) return null;
  return { h:pit ? PIT : DECK, mat:[pit ? 'gpit' : 'gconv', { gu:gc.u, gv:gc.v, gc:gc.c, gr:gc.r, cd:cd }] }; }
function mats(th, deck){ var GP = PAL[th] || PAL.pirate;
  return {
    // a hole: dark water down in it, a ripple of light on it, and its near edge in the deck's shadow
    gpit:['', '', '', 0, function(c, R, h3){ var n = h3(c.ti, c.tj, 43), v = c.gv || 0; if (c.dt < 0) return R(deck[2]);
      return R(v < 0.3 ? GP.pit[2] : n < 0.08 || ((c.ti * 3 + c.tj * 5) % 17) < 2 ? GP.pit[1] : GP.pit[0]); }],
    gconv:['', '', '', 0, function(c, R){ var d = c.cd, u = c.gu || 0, v = c.gv || 0, a = d === 1 ? u : d === 3 ? 1 - u : d === 2 ? v : 1 - v, s = d === 1 || d === 3 ? v : u;
      if (u < 0.05 || u > 0.95 || v < 0.05 || v > 0.95) return R(GP.belt[1]);
      var ch = ((a * 2 + Math.abs(s - 0.5) * 1.2) % 1 + 1) % 1; return R(c.dt < 0 ? GP.belt[1] : ch < 0.22 ? GP.belt[2] : GP.belt[0]); }] }; }
/* WHAT MOVES, DRAWN (the frame's room R, browser only): a barrel where the state has one, and one sunk in every filled
   hole; a push slides it, a fill drops it in with a splash; the belts' bright chevrons slide the way they run. */
function view(R){ var Q = R.Q, disp = [], conv = [], spr = R.sprite('gymbarrel', function(B){ R.BRK.barrel(B, 0, 0); }, 1.8, 1.8, 2);
  Q.cell.forEach(function(k, i){ if (CONV[k] != null) conv.push([i, CONV[k]]); });
  function draw(t){ R.drawSprite(spr, t.x, t.y, t.o.z); }
  return {
    lay:function(s){ disp = s.b.map(function(i){ var q = R.at(i); return { x:q[0], y:q[1], z:DECK, sunk:false, i:i }; });
      Q.holes.forEach(function(h, k){ if (s.f & (1 << k)){ var q = R.at(h); disp.push({ x:q[0], y:q[1], z:SUNK, sunk:true, i:h }); } }); },
    move:function(m, u){ var a = R.at(m[1]), b = R.at(m[2]), o = disp[m[0]]; if (!o) return; var uu = m[3] === 'fill' ? Math.min(1, u / 0.55) : u; o.x = a[0] + (b[0] - a[0]) * uu; o.y = a[1] + (b[1] - a[1]) * uu;
      if (m[3] === 'fill' && u > 0.55) o.z = DECK + (SUNK - DECK) * Math.min(1, (u - 0.55) / 0.45) * Math.min(1, (u - 0.55) / 0.45);
      if (m[3] === 'fill' && u >= 1 && !o.splash){ o.splash = 1; R.burst(b[0], b[1], DECK + 0.3, ['#7cc8ff', '#e6f6ff', '#8a5a34'], 14, 1.2, 0.8); R.sfx('blip'); } },
    things:function(ds){ disp.forEach(function(o){ ds.push({ k:'gbar', x:o.x, y:o.y - (o.sunk ? 0.02 : 0), o:o, kd:draw }); }); },
    // the belts run: a bright chevron slides along each, the way it carries
    ground:function(tsec){ if (!conv.length) return; var T = R.T, ctx = R.ctx, lw = Math.max(1, Math.round(R.kk() * 0.9));
      ctx.save(); ctx.strokeStyle = 'rgba(255,224,96,0.85)'; ctx.lineWidth = lw; ctx.lineCap = 'round';
      conv.forEach(function(q){ var c = q[0] % Q.W, r = (q[0] / Q.W) | 0, d = q[1], x0 = R.x0 + c * T, y0 = R.y0 + r * T;
        for (var k = 0; k < 2; k++){ var a = ((R.reduce ? 0.5 : tsec * 1.4) + k * 0.5) % 1; if (a < 0.3) continue;
          var pt = function(al, ac){ var u = d === 1 ? al : d === 3 ? 1 - al : ac, v = d === 2 ? al : d === 0 ? 1 - al : ac; return R.scr(x0 + u * T, y0 + v * T, DECK + 0.02); };
          var p0 = pt(a - 0.26, 0.22), p1 = pt(a, 0.5), p2 = pt(a - 0.26, 0.78); ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke(); } });
      ctx.restore(); } }; }

var root = typeof window !== 'undefined' ? window : globalThis;
root.RTT_GYMKIND_PUSH = { id:'push', gyms:GYMS, input:'step', CONV:CONV,
  parse:parse, init:init, key:key, step:step, act:step, moves:function(){ return [0, 1, 2, 3]; },
  me:function(G, s){ return s.p; }, place:function(G, s, i){ return { p:i, b:s.b, f:s.f }; },
  solve:solve, audit:audit, proof:proof, enc:enc, onFoot:onFoot, shutIn:shutIn,
  // the game's own reset button lit only when he is truly shut in: not when the lever is merely out of walking reach
  stuck:function(G, s){ return !onFoot(G, s) && shutIn(G, s); },
  goal:goal, tell:{ edge:'That\'s a hole. You can\'t walk on it.' },
  calm:true, unit:'step', hello:'One tile a step. Undo takes one back.',
  dur:function(how){ return how === 'fill' ? G_FILL : how === 'slide' || how === 'ride' ? G_RIDE : G_STEP; },
  floor:floor, mats:mats, view:view,
  deck:function(G, s, i){ return deck(parse(G), s, i); }, isHole:function(G, s, i){ return isHole(parse(G), s, i); } };
})();
