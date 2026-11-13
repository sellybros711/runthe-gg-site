/* golf/putt/gymkinds/gaze.js: the GAZE kind of trail gym (RTT_GYMKIND_GAZE), Cyclops Isle's. A kind file: the registry
   (gyms.js, its KINDS README) finds it by its global, the frame (trail.js) plays it, check-putt proves it.

   THE PUZZLE. He is in the Cyclops' fold, and the Cyclops' one great eye looks out of the rock wall. It looks down one
   straight line of the floor at a time (straight down, or slantwise), and every step he takes it turns to the next line on
   its round, the same round every time. A rock or a sheep stops its gaze, and under a sheep's fleece he is hidden (the way
   Odysseus' men got out of the cave). If the eye's new line falls on him after a step, the Cyclops shoves him: he slides
   straight away from the eye along that line until something stops him. Cheeses lie on the floor, and the vault opens once
   every cheese is picked up. So every step is a clock: where the eye looks next, where to hide, and when a shove is the
   quickest way across the room.

   THE GATEKEEPER'S TWIST is the ice slide (Ice Age's), as wet sea rock: on it he slides on the way he was going until the
   next tile stops him. The eye still turns once for the whole slide.

   He moves TILE BY TILE (a step kind: the stick, the arrows, the pad, or a tap toward a tile). A bump into a wall or a rock is
   no step, so the eye does not turn.

   THE LAYOUTS ARE HAND DESIGNED, never random. Row 0 is the far wall (the top of the screen), the last row the near wall
   with the gate in it. The frame's five characters (# G @ L C, gyms.js) and this kind's own:
     E   the eye, in a wall (a wall he cannot walk into)     o   a cheese (picked up as he steps or slides over it)
     s   a sheep (he can stand under it; it hides him and stops the gaze)
     r   a rock (stops him and the gaze)                     =   wet sea rock (the gatekeeper's): he slides across it
   The eye's round is the gym's round list, each a direction from the eye: 'S' down, 'SW' and 'SE' slantwise down, 'E' and
   'W' along its row, 'NE' and 'NW' slantwise up (an eye in a side wall). It looks along round[t % round.length] at step t.

   THE STATE is { p, k, t }: where he stands, the cheeses picked up (a bit a cheese) and the step count round the eye's
   round. A few thousand states, so solve() and audit() are the registry's own breadth first search (lib). */
(function(){
var root = typeof window !== 'undefined' ? window : globalThis;
var LIB = function(){ return root.RTT_PUTT_GYMS.lib; };
var VEC = { S:[0, 1], SW:[-1, 1], SE:[1, 1], W:[-1, 0], E:[1, 0], N:[0, -1], NW:[-1, -1], NE:[1, -1] };

/* THE GYMS. moves and proof are the solver's fewest steps and one shortest solution (U R D L), recorded from solve().
   The civilian's lines nudge, never solve. */
var GYMS = [
  /* THE SHEEPFOLD, mid-world: two cheeses in the fold, the eye looking straight down and slantwise each way, and the sheep to
     hide under. Its shove can be a quick way back. */
  { id:'cy1', kind:'gaze', world:'cyclops', leg:9, name:'The Sheepfold', badge:'Fleece Badge', mech:['gaze'], pay:500, look:{ wall:'stone' },
    moves:15, proof:'ULULUULUURRRLLL',
    who:{ look:{ skin:'tan', polo:'white', hat:'white', pants:'khaki', hair:'black', hairStyle:'curly', cap:false, shoes:'white', gender:'female' } },
    say:['The eye turns every time you take a step. Watch where it will look next.',
      'Under a sheep he cannot see you. A rock stops his gaze as well.',
      'Being shoved is not always bad. Sometimes it is the quickest way back.'],
    round:['S', 'SW', 'S', 'SE'],
    rows:[
      '#########',
      '####E####',
      '#...o...#',
      '#.s...s.#',
      '#o......#',
      '#..r.r..#',
      '#.......#',
      '#C..s..L#',
      '####@####',
      '####G####'
    ] },
  /* THE GREAT STONE, the gatekeeper: the eye in the side wall and lanes of wet rock across its gaze. A slide ends where
     something stops it, and the eye may be looking there when it does. */
  { id:'cy2', kind:'gaze', world:'cyclops', leg:18, name:'The Great Stone', badge:'Olive Badge', mech:['gaze', 'ice'], pay:1000, keeper:true, look:{ wall:'stone' },
    hint:'Stand in his way on purpose. His shove can carry you right across the room, over the wet rock.',
    moves:22, proof:'UURRULLLLUURUUULLLLRRU',
    who:{ look:{ skin:'tan', polo:'navy', hat:'white', pants:'white', hair:'black', hairStyle:'short', cap:false, shoes:'white', gender:'male' } },
    say:['On the wet rock you keep sliding. Only something in the way stops you.',
      'A slide is one step to the eye, however far you go.',
      'Think about where you stop, and where he will be looking when you do.'],
    round:['E', 'NE', 'E', 'SE'],
    rows:[
      '#########',
      '####C####',
      '#o.=.=.o#',
      '#.s=.=r.#',
      '#..=.=..#',
      'E...o...#',
      '#.r=.=s.#',
      '#o.=.=..#',
      '#..=.=.o#',
      '#.......#',
      '###L@####',
      '####G####'
    ] }
];

var PARSED = {};
/* THE ROOM: the frame's five through lib.room, and the kind's own. Q.eye is the eye's tile, Q.round its round of directions,
   Q.sheep, Q.rock and Q.ice mark their tiles, Q.cheese lists the cheeses (a bit each). */
function parse(G){ if (PARSED[G.id]) return PARSED[G.id]; var sheep = {}, rock = {}, ice = {}, cheese = [], eye = -1;
  var Q = LIB().room(G, function(ch, i){ if (ch === 'E'){ eye = i; return; } if (ch === 's'){ sheep[i] = 1; return; } if (ch === 'r'){ rock[i] = 1; return; }
    if (ch === '='){ ice[i] = 1; return; } if (ch === 'o'){ cheese.push(i); return; } return false; });
  Q.eye = eye; Q.sheep = sheep; Q.rock = rock; Q.ice = ice; Q.cheese = cheese; Q.allK = (1 << cheese.length) - 1; Q.round = G.round.map(function(d){ return VEC[d]; });
  return PARSED[G.id] = Q; }
function init(G){ var Q = parse(G); return { p:Q.start, k:0, t:0 }; }
function key(s){ return s.p + ':' + s.k + ':' + s.t; }
function at(Q, c, r){ return c < 0 || r < 0 || c >= Q.W || r >= Q.H ? -1 : r * Q.W + c; }
// can he stand on tile n (step onto it, slide onto it, be shoved onto it)
function open(Q, n){ if (n < 0) return false; var ch = Q.cell[n]; if (ch === '#' || ch === 'E' || Q.rock[n] || n === Q.lever || n === Q.chest || n === Q.gate) return false; return true; }
// the tiles the eye sees along direction v: out from the eye until a wall, a rock or a sheep stops it (a sheep's tile is not seen)
function gaze(Q, v){ var out = [], c = Q.eye % Q.W, r = (Q.eye / Q.W) | 0;
  for (var k = 1; k < 40; k++){ var n = at(Q, c + v[0] * k, r + v[1] * k); if (n < 0) break; var ch = Q.cell[n]; if (ch === '#' || ch === 'E' || Q.rock[n] || Q.sheep[n] || n === Q.chest || n === Q.lever || n === Q.gate) break; out.push(n); }
  return out; }
function lookAt(Q, t){ return Q.round[t % Q.round.length]; }
function take(Q, k, n, mv){ var j = Q.cheese.indexOf(n); if (j >= 0 && !(k & (1 << j))){ mv.push(['cheese', n, n, 'take']); return k | (1 << j); } return k; }

/* ONE STEP. The frame's tiles first (the gate, the lever); the vault opens with every cheese in hand. Then the walk (and a
   slide on wet rock), the eye turns to its next line, and if that line falls on him he is shoved along it, away from the eye. */
function act(G, s, d){ var Q = parse(G), L = LIB(), n = L.nb(Q, s.p, d);
  if (n === Q.chest) return s.k === Q.allK ? { s:s, ev:'open', moves:[] } : { s:s, ev:'shut', moves:[] };
  var f = L.frameStep(G, Q, s, s.p, d, init); if (f) return f;
  if (!open(Q, n)) return { s:s, ev:'bump', moves:[] };
  var t1 = (s.t + 1) % Q.round.length, mv = [['eye', Q.eye, Q.eye, 'turn', t1]], ev = 'step', p = n, k;
  mv.push(['me', s.p, n, 'walk']); k = take(Q, s.k, n, mv);
  for (var guard = 0; Q.ice[p] && guard < 40; guard++){ var nx = L.nb(Q, p, d); if (!open(Q, nx)) break; mv.push(['me', p, nx, 'slide']); p = nx; k = take(Q, k, p, mv); if (ev === 'step') ev = 'slide'; }
  var v = lookAt(Q, t1);
  if (!Q.sheep[p] && gaze(Q, v).indexOf(p) >= 0){ mv.push(['glare', p, p, 'glare']);
    for (var g2 = 0; g2 < 40; g2++){ var c = p % Q.W, r = (p / Q.W) | 0, q = at(Q, c + v[0], r + v[1]); if (!open(Q, q)) break; mv.push(['me', p, q, 'shove']); p = q; k = take(Q, k, p, mv); if (Q.sheep[p]) break; }
    ev = 'shove'; }
  if (ev === 'step' && k !== s.k) ev = 'take';
  return { s:{ p:p, k:k, t:t1 }, ev:ev, moves:mv }; }
function moves(){ return [0, 1, 2, 3]; }
function proof(G){ return (G.proof || '').split('').map(function(ch){ return 'URDL'.indexOf(ch); }); }
function enc(path){ return path.map(function(d){ return 'URDL'.charAt(d); }).join(''); }
function goal(G){ return parse(G).cheese.length > 1 ? 'Pick up every cheese, then step into the vault.' : 'Pick up the cheese, then step into the vault.'; }

/* ---- THE LOOK: the floor is the cave's worn rock, a sheep's tile has straw on it, wet sea rock shines blue grey, a rock is a
   grey boulder. The eye is drawn in the far wall, big, its iris turned the way it looks; the tiles it sees are lit warm gold
   and the line it will look along next is marked with gold dots, so the next step can always be read. Sheep stand where they
   are; a cheese is a round yellow wheel. */
var DECK = 0.45;
function floor(gc){ if (gc.k === '#' || gc.k === 'E') return null; var k = gc.k === 's' ? 1 : gc.k === '=' ? 2 : gc.k === 'r' ? 3 : 0;
  return { h:k === 3 ? DECK + 0.5 : DECK, mat:['cyfloor', { gu:gc.u, gv:gc.v, hk:k }] }; }
function mats(){ return {
  cyfloor:['', '', '', 0, function(c, R, h3){ var u = c.gu || 0, v = c.gv || 0, k = c.hk || 0, n = h3(c.ti, c.tj, 99);
    if (k === 3){ var rr = Math.hypot(u - 0.5, v - 0.5); return R(rr < 0.42 ? (n > 0.6 ? '#b8b0a4' : n < 0.25 ? '#6e6a62' : '#9a948a') : '#5a5650'); }
    if (c.dt < 0 || u < 0.04 || u > 0.96 || v < 0.04 || v > 0.96) return R('#4a4640');
    if (k === 2){ if (Math.abs(u - v) < 0.05) return R('#e8f6ff'); return R(n < 0.25 ? '#8aa8c0' : '#6a8aa4'); }
    if (k === 1){ return R(n > 0.7 ? '#e2bc5c' : n > 0.4 ? '#c8a04a' : '#8a7a5a'); }
    return R(n < 0.15 ? '#6a5e52' : n > 0.9 ? '#8a7e70' : '#7a6e60'); }] }; }

function view(R){ var Q = R.Q, T = R.T, ctx = R.ctx, s0 = null, turnT = -1, glare = null;
  function P(x, y, z){ return R.scr(x, y, z == null ? DECK + 0.015 : z); }
  // a sheep: a woolly white body, a dark face and legs
  function sheep(x, y, tsec, j){ var k = R.kk(), c = P(x, y, DECK + T * 0.32), e = P(x + T * 0.34, y, DECK + T * 0.32), rx = Math.max(3, Math.abs(e[0] - c[0])), bob = R.reduce ? 0 : Math.sin(tsec * 1.8 + j) * k * 0.4;
    ctx.fillStyle = '#2a221e'; ctx.fillRect(Math.round(c[0] - rx * 0.6), Math.round(c[1] + rx * 0.3), Math.max(2, Math.round(k)), Math.round(rx * 0.5)); ctx.fillRect(Math.round(c[0] + rx * 0.4), Math.round(c[1] + rx * 0.3), Math.max(2, Math.round(k)), Math.round(rx * 0.5));
    ctx.fillStyle = '#ece6d6'; ctx.beginPath(); ctx.ellipse(c[0], c[1] + bob, rx, rx * 0.66, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(c[0] - rx * 0.2, c[1] - rx * 0.18 + bob, rx * 0.6, rx * 0.4, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#2a221e'; ctx.beginPath(); ctx.ellipse(c[0] + rx * 0.9, c[1] - rx * 0.1 + bob, rx * 0.3, rx * 0.36, 0, 0, 7); ctx.fill(); }
  // a cheese: a round yellow wheel with its rind
  function cheese(x, y, tsec, j){ var c = P(x, y, DECK + T * 0.12), e = P(x + T * 0.22, y, DECK + T * 0.12), rx = Math.max(2, Math.abs(e[0] - c[0])), g = R.reduce ? 0 : Math.sin(tsec * 2.4 + j) * rx * 0.1;
    ctx.fillStyle = '#c89a30'; ctx.beginPath(); ctx.ellipse(c[0], c[1] + rx * 0.25 + g, rx, rx * 0.5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffe27a'; ctx.beginPath(); ctx.ellipse(c[0], c[1] + g, rx, rx * 0.5, 0, 0, 7); ctx.fill(); ctx.strokeStyle = '#a87a20'; ctx.lineWidth = Math.max(1, R.kk() * 0.5); ctx.stroke(); }
  // the eye in the far wall: a big round white, a brown iris turned along the line it looks down, a shaggy dark brow
  function eyeDraw(tsec){ var w = R.at(Q.eye), v = lookAt(Q, s0 ? s0.t : 0), c = P(w[0], w[1], DECK + T * 1.1), e = P(w[0] + T * 0.5, w[1], DECK + T * 1.1), rx = Math.max(5, Math.abs(e[0] - c[0]));
    var blink = !R.reduce && (tsec % 4.1) < 0.12;
    ctx.fillStyle = '#2a1a12'; ctx.beginPath(); ctx.ellipse(c[0], c[1], rx * 1.15, rx * 0.85, 0, 0, 7); ctx.fill();
    if (blink){ ctx.fillStyle = '#c89a78'; ctx.beginPath(); ctx.ellipse(c[0], c[1], rx, rx * 0.7, 0, 0, 7); ctx.fill(); }
    else { ctx.fillStyle = '#fbf6ea'; ctx.beginPath(); ctx.ellipse(c[0], c[1], rx, rx * 0.7, 0, 0, 7); ctx.fill(); var ix = c[0] + v[0] * rx * 0.42, iy = c[1] + v[1] * rx * 0.24;
      ctx.fillStyle = '#8a5424'; ctx.beginPath(); ctx.arc(ix, iy, rx * 0.42, 0, 7); ctx.fill(); ctx.fillStyle = '#140c08'; ctx.beginPath(); ctx.arc(ix, iy, rx * 0.2, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.arc(ix - rx * 0.1, iy - rx * 0.1, rx * 0.08, 0, 7); ctx.fill(); }
    ctx.strokeStyle = '#2a1a12'; ctx.lineCap = 'round'; ctx.lineWidth = Math.max(2, rx * 0.22); ctx.beginPath(); ctx.moveTo(c[0] - rx * 1.1, c[1] - rx * 0.55); ctx.quadraticCurveTo(c[0], c[1] - rx * 1.25, c[0] + rx * 1.1, c[1] - rx * 0.55); ctx.stroke(); }
  return {
    lay:function(s){ s0 = s; turnT = -1; glare = null; },
    move:function(m, u){ if (m[0] === 'eye'){ turnT = u < 1 ? m[4] : -1; return; }
      if (m[0] === 'glare'){ glare = u < 1 ? m[1] : null; if (u >= 1) R.sfx('blip'); return; }
      if (u < 1) return; if (m[0] === 'cheese'){ var q = R.at(m[1]); R.burst(q[0], q[1], DECK + 0.3, ['#ffffff', '#ffe27a', '#f0c850'], 8, 0.8, 0.6); } },
    things:function(ds, tsec){ if (!s0) return; var s = s0;
      Q.cheese.forEach(function(i, j){ if (s.k & (1 << j)) return; var w = R.at(i); ds.push({ x:w[0], y:w[1], kd:function(e, ts){ cheese(w[0], w[1], ts || tsec, j); } }); });
      Object.keys(Q.sheep).forEach(function(i, j){ var w = R.at(+i); ds.push({ x:w[0], y:w[1] - 0.01, kd:function(e, ts){ sheep(w[0], w[1], ts || tsec, j); } }); });
      var we = R.at(Q.eye); ds.push({ x:we[0], y:we[1] + 0.4, kd:function(e, ts){ eyeDraw(ts || tsec); } }); },
    // where the eye looks now, lit gold, and the line it turns to next, dotted
    ground:function(tsec){ if (!s0) return; var k = R.kk(), t = turnT >= 0 ? turnT : s0.t, now = gaze(Q, lookAt(Q, t)), nxt = gaze(Q, lookAt(Q, t + 1)), pulse = R.reduce ? 0.44 : 0.4 + 0.08 * Math.sin(tsec * 4);
      now.forEach(function(i){ var c = R.at(i), h = T * 0.48, a = P(c[0] - h, c[1] - h), b = P(c[0] + h, c[1] - h), d = P(c[0] + h, c[1] + h), e = P(c[0] - h, c[1] + h);
        ctx.fillStyle = 'rgba(255,200,60,' + pulse.toFixed(3) + ')'; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(d[0], d[1]); ctx.lineTo(e[0], e[1]); ctx.closePath(); ctx.fill(); });
      ctx.fillStyle = 'rgba(255,236,150,.95)'; ctx.strokeStyle = 'rgba(90,60,10,.7)'; ctx.lineWidth = Math.max(1, k * 0.4); nxt.forEach(function(i){ var c = R.at(i), p = P(c[0], c[1]); ctx.beginPath(); ctx.arc(p[0], p[1], Math.max(2, k * 1.5), 0, 7); ctx.fill(); ctx.stroke(); });
      if (glare != null){ var gq = R.at(glare), gp = P(gq[0], gq[1], DECK + 0.3); ctx.strokeStyle = 'rgba(255,240,180,.9)'; ctx.lineWidth = Math.max(1.5, k); ctx.beginPath(); ctx.arc(gp[0], gp[1], Math.max(4, k * 4), 0, 7); ctx.stroke(); } },
    hot:function(){ return []; } }; }

root.RTT_GYMKIND_GAZE = { id:'gaze', gyms:GYMS, input:'step', calm:true, unit:'step', hello:'The eye turns every time you step. If it looks your way, you get shoved.',
  parse:parse, init:init, key:key, act:act, step:act, moves:moves, proof:proof, enc:enc, goal:goal,
  me:function(G, s){ return s.p; }, place:function(G, s, i){ return { p:i, k:s.k, t:s.t }; },
  deck:function(G, s, i){ var Q = parse(G); return open(Q, i) || i === Q.lever; },
  tell:{ shut:'The vault stays shut. A cheese is still out there.', shove:'The Cyclops sees you and shoves you along his gaze.', slide:'You slide on the wet rock.', stuck:'No way to finish from here. Undo it, or Restart.' },
  dur:function(how){ return how === 'shove' ? 0.09 : how === 'glare' ? 0.25 : how === 'turn' ? 0.15 : how === 'slide' ? 0.1 : 0.15; },
  floor:floor, mats:mats, view:view };
})();
