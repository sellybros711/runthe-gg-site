/* golf/putt/gymkinds/gravity.js: the GRAVITY kind of trail gym (RTT_GYMKIND_GRAVITY), Moon Base's. A kind file: the
   registry (gyms.js, its KINDS README) finds it by its global, the frame (trail.js) plays it, check-putt proves it.

   THE PUZZLE is the station's gravity. Four thrusters sit on the console in front of you, one for each way. Tap one
   and gravity turns that way: EVERY loose moon rock in the bay slides that way until a wall, a fixed block or another
   rock stops it. One rock is the moon rock (it glows). Get it to rest in the crater and the vault opens. You never
   move one rock alone, so the other rocks are your stoppers: the crater sits in open floor, and the moon rock only
   stops on it when something is already waiting on the far side. That is the difference from Ice Age's slide, where
   only the golfer moves and the rocks never do.

   THE GATEKEEPER'S TWIST is the Schoolyard's switch, as an AIRLOCK: a pressure plate and a door in a wall. The door is
   open while a rock sits on the plate (or in the doorway itself, so it never shuts on one) when the thrusters fire,
   and shut otherwise. The airlock reads the plate as gravity turns, so a rock that slides off the plate on that tap
   still lets the others through on it.

   THE LAYOUTS ARE HAND DESIGNED, never random. The room's own characters (the frame reads # G @ L C):
     o  a moon rock (loose)      M  the moon rock, the one that has to reach the crater      x  the crater
     ^ > v <  the thrusters, on the console row below the bay (a tap turns gravity that way)
     p  the airlock's pressure plate      d  the airlock door, in a wall
   A tap on the lever (L) is Restart, as the button is.

   THE STATE is where the rocks are, the moon rock first. The search is the registry's own (lib.solve, lib.audit:
   breadth first over the four thrusters), a few hundred states a room, so every state a player can reach is searched
   to the end. A tilt cannot always be undone (two rocks jammed in a corner stay jammed), so a room can be lost:
   stuck() is the registry's own search from the state, and the frame lights Restart when it says so. */
(function(){
var root = typeof window !== 'undefined' ? window : globalThis;
var LIB = function(){ return root.RTT_PUTT_GYMS.lib; };
var THRUST = { '^':0, '>':1, 'v':2, '<':3 }, DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/* THE GYMS. moves and proof are the solver's fewest taps and one shortest solution (U R D L, a letter a thruster),
   recorded from solve(). */
var GYMS = [
  /* THE GRAVITY BAY, mid-world: the rule and nothing else. Three rocks, the moon rock and the crater out in the open.
     Tilt straight at the crater and the moon rock sails over it every time. The aha: send the other rocks first, so
     they wait beyond the crater, and then the moon rock stops on it. */
  { id:'moon1', kind:'gravity', world:'moon', leg:9, name:'The Zero-G Bay', badge:'Orbit Badge', mech:['gravity'], pay:500, look:{ wall:'stone' },
    moves:12, proof:'DLULURDRDRUL',
    who:{ look:{ skin:'medium', polo:'white', hat:'white', pants:'navy', hair:'black', hairStyle:'short', cap:false, gender:'male' } },
    say:['Gravity is off in this bay. One push from a thruster and everything floats that way till it hits something.',
      'The moon rock never stops on its own. Something has to be waiting for it.',
      'Forget the moon rock for a minute. Where do the other rocks end up?'],
    rows:[
      '#########',
      '#.......#',
      '#.#.x.o.#',
      '#.......#',
      '#....Mo.#',
      '#...#...#',
      '##.....o#',
      '#..#....#',
      '#########',
      '#^.>.v.<#',
      '#L..@..C#',
      '####G####'
    ] },
  /* THE AIRLOCK, the gatekeeper: the moon rock is sealed in the upper bay, the crater below, and the only way through is
     the airlock, which opens while a rock sits on its plate. The plate is in the far corner, so a rock has to be parked
     on it and kept there while the moon rock goes down through the door, and then the crater still wants its stopper. */
  { id:'moon2', kind:'gravity', world:'moon', leg:18, name:'The Airlock', badge:'Lunar Badge', mech:['gravity', 'switch'], pay:1000, keeper:true, look:{ wall:'stone' },
    moves:22, proof:'RULDLURULDURDRULDURDLU',
    who:{ look:{ skin:'deep', polo:'gold', hat:'white', pants:'black', hair:'black', hairStyle:'bun', cap:false, gender:'female' } },
    say:['That airlock only opens while there\'s weight on the plate. Safety rule. I wrote it.',
      'The plate doesn\'t care which rock is on it. Any rock will do.',
      'Get the door open first and keep it open. The crater can wait.'],
    rows:[
      '#########',
      '#p......#',
      '#.o...#.#',
      '#..#o.M.#',
      '#..o....#',
      '#######d#',
      '#...x...#',
      '#.......#',
      '##......#',
      '#########',
      '#^.>.v.<#',
      '#L..@..C#',
      '####G####'
    ] }
];

var PARSED = {};
/* THE ROOM: the frame's five through lib.room, and the bay. Q.rock0 is the rocks at the start (the moon rock first),
   Q.crater, Q.thr (tile -> direction), Q.plate (or -1), Q.doors. Q.solid(i, open) is whether a rock stops before tile
   i: a wall, a thruster, the frame's tiles, or a shut door. */
function parse(G){ if (PARSED[G.id]) return PARSED[G.id]; var rocks = [], moon = -1, crater = -1, thr = {}, plate = -1, doors = [];
  var Q = LIB().room(G, function(ch, i){
    if (ch === 'o') rocks.push(i); else if (ch === 'M') moon = i; else if (ch === 'x') crater = i; else if (ch === 'p') plate = i; else if (ch === 'd') doors.push(i);
    else if (THRUST[ch] != null) thr[i] = THRUST[ch]; else return false; });
  if (moon < 0 || crater < 0) throw new Error(G.id + ': a gravity room needs its moon rock (M) and its crater (x)');
  Q.rock0 = [moon].concat(rocks); Q.crater = crater; Q.thr = thr; Q.plate = plate; Q.doors = doors;
  Q.solid = function(i, open){ var k = Q.cell[i]; if (k == null || k === '#' || k === 'L' || k === 'C' || k === 'G' || THRUST[k] != null) return true; if (k === 'd') return !open; return i === Q.start; };
  return PARSED[G.id] = Q; }
// the state: the rocks' tiles, the moon rock first. A new object a move, never one changed in place.
function init(G){ return { r:parse(G).rock0.slice() }; }
function key(s){ return s.r[0] + '|' + s.r.slice(1).sort(function(a, b){ return a - b; }).join(','); }
// is the airlock open: a rock on the plate, or one standing in the doorway (it never shuts on a rock)
function open(Q, r){ if (Q.plate < 0) return false; for (var k = 0; k < r.length; k++) if (r[k] === Q.plate || Q.doors.indexOf(r[k]) >= 0) return true; return false; }
/* GRAVITY TURNS. Every rock slides the way the thruster points until something stops it. They go from the far side
   first, so a rock that meets another that has already landed stops against it and they stack. */
function tilt(Q, r, d){ var op = open(Q, r), dx = DIRS[d][0], dy = DIRS[d][1], ord = r.map(function(p, k){ return k; }), out = r.slice(), taken = {};
  function far(p){ return (p % Q.W) * dx + ((p / Q.W) | 0) * dy; }
  ord.sort(function(a, b){ return far(r[b]) - far(r[a]); });
  r.forEach(function(p){ taken[p] = 1; });
  ord.forEach(function(k){ var p = r[k]; delete taken[p]; for (;;){ var n = p + dx + dy * Q.W; if (Q.solid(n, op) || taken[n]) break; p = n; } taken[p] = 1; out[k] = p; });
  return out; }
/* A TAP. A thruster turns gravity; the lever is Restart; anything else answers plain. moves, for the picture: a
   ['rock', from, to, 'slide'] for every rock that moved (the moon rock's is 'moon'). */
function act(G, s, i){ var Q = parse(G), d = Q.thr[i];
  if (i === Q.lever) return { s:init(G), ev:'reset', moves:[] };
  if (d == null) return { s:s, ev:'plain', moves:[] };
  var n = tilt(Q, s.r, d), mv = [];
  n.forEach(function(p, k){ if (p !== s.r[k]) mv.push(['rock', s.r[k], p, k ? 'slide' : 'moon']); });
  if (!mv.length) return { s:s, ev:'still', moves:[] };
  return { s:{ r:n }, ev:'tilt', moves:mv }; }
function moves(G){ var Q = parse(G); return Object.keys(Q.thr).map(Number); }
function won(G, s){ return s.r[0] === parse(G).crater; }
// the recorded proof is the thrusters' letters (U R D L); a move is the thruster's tile
function proof(G){ var Q = parse(G), at = {}; Object.keys(Q.thr).forEach(function(t){ at['URDL'.charAt(Q.thr[t])] = +t; });
  return (G.proof || '').split('').map(function(c){ return at[c]; }); }
function enc(path){ var out = ''; path.forEach(function(t){ out += 'URDL'.charAt(THRUST_OF[t]); }); return out; }
// enc is asked for the path the solver found, in the tiles of whichever gym it solved, so it reads each thruster from that tile
var THRUST_OF = {};
GYMS.forEach(function(G){ G.rows.forEach(function(row, r){ for (var c = 0; c < row.length; c++){ var d = THRUST[row.charAt(c)]; if (d != null) THRUST_OF[r * row.length + c] = d; } }); });
function goal(G){ return G.id === 'moon2' ? 'Get the moon rock through the airlock and into the crater.' : 'Get the moon rock into the crater.'; }

/* ---- THE PICTURE. What changes is drawn each frame (view.things): the rocks (grey, with craters; the moon rock
   glowing), the crater, the thrusters on the console, the plate, and the airlock door shut or slid open. */
var D_SLIDE = 0.32, ARROW = [[0, -1], [1, 0], [0, 1], [-1, 0]];
function view(R){ var Q = R.Q, T = R.T, Z = R.DECK + 0.015, rocks = Q.rock0.slice(), anim = {};
  function P(x, y, z){ return R.scr(x, y, z == null ? Z : z); }
  function disc(x, y, z, rad, fill, line){ var ctx = R.ctx, c = P(x, y, z), e = P(x + rad, y, z), f = P(x, y + rad, z), rx = Math.max(1, Math.abs(e[0] - c[0])), ry = Math.max(1, Math.abs(f[1] - c[1]));
    ctx.fillStyle = fill; ctx.beginPath(); ctx.ellipse(c[0], c[1], rx, ry, 0, 0, 7); ctx.fill(); if (line){ ctx.strokeStyle = line; ctx.lineWidth = Math.max(1, R.kk() * 0.5); ctx.stroke(); } }
  // a rock: a small grey ball standing on the deck, lit from the upper left, two craters; the moon rock glows cyan
  // gravity is off in the bay, so every rock floats a little off the deck and bobs, its shadow left on the floor beneath it
  function rock(x, y, moon, tsec){ var ctx = R.ctx, rad = T * 0.34, bob = R.reduce ? T * 0.12 : T * (0.08 + 0.08 * Math.sin((tsec || 0) * 1.7 + x * 1.3 + y * 0.7)), z = R.DECK + rad + bob, c = P(x, y, z), e = P(x + rad, y, z), px = Math.max(2, Math.abs(e[0] - c[0]));
    disc(x + T * 0.06, y + T * 0.08, Z, rad * 0.9, 'rgba(0,0,0,0.3)');
    if (moon){ var g = 0.35 + 0.15 * Math.sin((tsec || 0) * 3); ctx.fillStyle = 'rgba(127,216,255,' + g + ')'; ctx.beginPath(); ctx.arc(c[0], c[1], px * 1.45, 0, 7); ctx.fill(); }
    var gr = ctx.createRadialGradient(c[0] - px * 0.35, c[1] - px * 0.35, px * 0.1, c[0], c[1], px);
    gr.addColorStop(0, moon ? '#ffffff' : '#e4e1da'); gr.addColorStop(0.7, moon ? '#c8e8ff' : '#a9a6a0'); gr.addColorStop(1, moon ? '#7fa8d0' : '#6a6870');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(c[0], c[1], px, 0, 7); ctx.fill(); ctx.strokeStyle = '#2a2a34'; ctx.lineWidth = Math.max(1, R.kk() * 0.5); ctx.stroke();
    ctx.fillStyle = moon ? 'rgba(80,120,170,0.5)' : 'rgba(70,68,80,0.5)'; [[-0.3, 0.1, 0.24], [0.28, -0.22, 0.17]].forEach(function(q){ ctx.beginPath(); ctx.arc(c[0] + q[0] * px, c[1] + q[1] * px, q[2] * px, 0, 7); ctx.fill(); }); }
  // where rock k stands this frame: its tile, or partway along its slide while one plays
  function at(k){ var p = rocks[k], a = anim[p], q = R.at(p); if (a){ var b = R.at(a.to), u = a.u * a.u * (3 - 2 * a.u); return [q[0] + (b[0] - q[0]) * u, q[1] + (b[1] - q[1]) * u]; } return q; }
  // a thruster: a squat engine block with its arrow, lit amber
  function thruster(t, d){ var q = R.at(t), ctx = R.ctx, hw = T * 0.38, a = P(q[0] - hw, q[1] - hw), b = P(q[0] + hw, q[1] + hw);
    ctx.fillStyle = '#3a4258'; ctx.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); ctx.strokeStyle = '#8a96b0'; ctx.lineWidth = Math.max(1, R.kk() * 0.6); ctx.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
    var v = ARROW[d], L = T * 0.26, w = T * 0.14, tip = P(q[0] + v[0] * L, q[1] + v[1] * L), l = P(q[0] - v[0] * L * 0.4 - v[1] * w, q[1] - v[1] * L * 0.4 + v[0] * w), r = P(q[0] - v[0] * L * 0.4 + v[1] * w, q[1] - v[1] * L * 0.4 - v[0] * w);
    ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.moveTo(tip[0], tip[1]); ctx.lineTo(l[0], l[1]); ctx.lineTo(r[0], r[1]); ctx.closePath(); ctx.fill(); }
  // the airlock door: a bar across the doorway when shut, slid into the wall when open
  function door(t, op){ var q = R.at(t), ctx = R.ctx, hw = T * 0.5, y0 = q[1] - T * 0.12, y1 = q[1] + T * 0.12, sx = op ? T * 0.42 : 0;
    var a = P(q[0] - hw + sx, y0, R.DECK + 0.6), b = P(q[0] + hw + sx, y1, R.DECK + 0.6); ctx.fillStyle = op ? '#5a6680' : '#eef2f8'; ctx.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
    ctx.fillStyle = op ? '#3df2c2' : '#ff5577'; var m = P(q[0] + sx, q[1], R.DECK + 0.6); ctx.fillRect(m[0] - R.kk(), a[1], 2 * R.kk(), b[1] - a[1]); }
  return {
    lay:function(s){ rocks = s.r.slice(); anim = {}; },
    move:function(mv, u){ if (mv[0] !== 'rock') return; anim[mv[1]] = { to:mv[2], u:u }; if (u >= 1 && mv[3] === 'moon' && !anim['s' + mv[1]]){ anim['s' + mv[1]] = 1; R.sfx('blip'); } },
    things:function(ds, tsec){
      // the crater and the plate lie on the deck, so they go in at the far edge of their tile, behind anything on it
      var cq = R.at(Q.crater); ds.push({ x:cq[0], y:cq[1] - T * 0.45, kd:function(){ disc(cq[0], cq[1], Z, T * 0.42, '#2a2a3a', '#8e8b94'); disc(cq[0] - T * 0.04, cq[1] - T * 0.05, Z, T * 0.3, '#14141e'); } });
      if (Q.plate >= 0){ var pq = R.at(Q.plate); ds.push({ x:pq[0], y:pq[1] - T * 0.45, kd:function(){ disc(pq[0], pq[1], Z, T * 0.4, open(Q, rocks) ? '#3df2c2' : '#ff5577', '#2a2a34'); disc(pq[0], pq[1], Z, T * 0.26, '#eef2f8'); } }); }
      Q.doors.forEach(function(t){ var q = R.at(t); ds.push({ x:q[0], y:q[1], kd:function(){ door(t, open(Q, rocks)); } }); });
      Object.keys(Q.thr).forEach(function(t){ var q = R.at(+t); ds.push({ x:q[0], y:q[1] - T * 0.45, kd:function(){ thruster(+t, Q.thr[t]); } }); });
      rocks.forEach(function(p, k){ var w = at(k); ds.push({ x:w[0], y:w[1], kd:function(){ rock(w[0], w[1], k === 0, tsec); } }); }); },
    // the thrusters are what to tap
    hot:function(){ return Object.keys(Q.thr).map(Number); },
    ground:function(){} }; }

root.RTT_GYMKIND_GRAVITY = { id:'gravity', gyms:GYMS, input:'tap', calm:true, parse:parse, init:init, key:key, act:act, moves:moves, won:won, proof:proof, enc:enc,
  goal:goal, tell:{ plain:'Tap a thruster on the console.', still:'Nothing moved. Every rock is already as far as that way goes.' },
  hello:'Gravity is off in here. Tap a thruster and every rock floats that way.', unit:'tap', me:function(){ return null; }, place:function(G, s){ return s; },
  dur:function(){ return D_SLIDE; }, view:view };
})();
