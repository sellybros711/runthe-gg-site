/* golf/putt/gymkinds/stone.js: the STONE BRIDGE kind of trail gym (RTT_GYMKIND_STONE), Medusa's Isle's. A kind file: the
   registry (gyms.js, its KINDS README) finds it by its global, the frame (trail.js) plays it, check-putt proves it.

   THE PUZZLE. He is in the court of Medusa's temple, and her stone head stands on its plinth in the middle of the floor. Pools
   of sea water cut the court up, and he cannot walk on water. Her gaze runs out of the head one straight line of tiles at a
   time, and WHERE IT PASSES OVER THE WATER THE WATER TURNS TO STONE, for good: a stone bridge he can walk on. Plates in the floor
   are marked with an arrow: step onto one and she turns to look the way it points, and her gaze falls along that line. But a
   tile in her gaze is a tile he must never stand on: step into her line, or be on it when she turns, and he is turned to stone
   and wakes back at the gate (what he has picked up and the bridges he has made stay as they are). Owl coins lie about the
   court, and the vault opens once every coin is picked up. So every bridge is made by her looking along it, and crossed only
   once she has been turned to look somewhere else: the order of the plates is the puzzle.

   THE GATEKEEPER'S TWIST is Neon Arcade's mirror, as Perseus' polished bronze shield: a shield set in the floor turns her gaze a
   right angle, so a line of hers can be bent round a corner to a pool she could never see straight on. He cannot stand on a
   shield.

   He moves TILE BY TILE (a step kind). A bump into a wall, the water, a rock or the head is no step.

   THE LAYOUTS ARE HAND DESIGNED, never random. Row 0 is the far wall (the top of the screen), the last row the near wall with
   the gate in it. The frame's five characters (# G @ L C, gyms.js) and this kind's own:
     M   Medusa's head on its plinth (he cannot walk into it; her gaze starts there)
     ~   sea water (he cannot walk on it; her gaze turns it to stone)      .   the court's marble floor
     r   a statue (stops him and her gaze)                                 o   an owl coin (picked up as he steps on it)
     ^ > v <   a plate: step on it and she looks that way (up the screen, right, down, left)
     / \   a bronze shield (the gatekeeper's): turns her gaze a right angle, as a mirror would
   G.look is the way she looks as he walks in ('^', '>', 'v' or '<'); the water along that line is stone already.

   THE STATE is { p, d, k, m }: where he stands, the way she looks (0 up, 1 right, 2 down, 3 left), the coins picked up (a bit a
   coin) and the water turned to stone (a bit a pool tile). A few thousand states, so solve() and audit() are the registry's own
   breadth first search (lib). */
(function(){
var root = typeof window !== 'undefined' ? window : globalThis;
var LIB = function(){ return root.RTT_PUTT_GYMS.lib; };
var DV = [[0, -1], [1, 0], [0, 1], [-1, 0]], ARROW = { '^':0, '>':1, 'v':2, '<':3 };

/* THE GYMS. moves and proof are the solver's fewest steps and one shortest solution (U R D L), recorded from solve().
   The civilian's lines nudge, never solve. */
var GYMS = [
  /* THE STONE COURT, mid-world: Medusa's head in the middle of the court, pools on every side of her, and four plates to turn her
     by. Each bridge is hers to make, and hers to stop looking at. */
  { id:'md1', kind:'stone', world:'medusa', leg:10, name:'The Stone Court', badge:'Owl Badge', mech:['stone'], pay:500, look:{ wall:'stone' }, look0:'<',
    moves:28, proof:'ULULRDRRRRULUUUUURLLLLLLRRRU',
    who:{ look:{ skin:'light', polo:'white', hat:'white', pants:'white', hair:'brown', hairStyle:'curly', cap:false, shoes:'white', gender:'male' } },
    say:['Where her gaze crosses the water, the water turns to stone. You can walk on stone.',
      'Never stand in her line. Turn her to look somewhere else before you cross.',
      'Every plate you step on turns her. Think about where she looks when you leave it.'],
    rows:[
      '####C####',
      '#o..~..o#',
      '#...~...#',
      '#.r.~...#',
      '#~~~M~~~#',
      '#...~...#',
      '#.^.~.v.#',
      '#<.....>#',
      '#L..@...#',
      '####G####'
    ] },
  /* THE SHIELD HALL, the gatekeeper: her head against the side wall, and bronze shields on the floor that bend her gaze round
     corners onto pools she cannot see straight on. */
  { id:'md2', kind:'stone', world:'medusa', leg:18, name:'The Shield Hall', badge:'Gorgon Badge', mech:['stone', 'mirror'], pay:1000, keeper:true, look:{ wall:'stone' }, look0:'>',
    hint:'A shield bends her gaze. Look along her line to the shield, and then where the shield sends it.',
    moves:51, proof:'ULUUUURRRUULUURUUUUDDDDLDDLDDLLLLUURUULUUUUDDRRUURU',
    who:{ look:{ skin:'tan', polo:'white', hat:'white', pants:'white', hair:'black', hairStyle:'long', cap:false, shoes:'gold', gender:'female' } },
    say:['A bronze shield turns her gaze aside, the way a mirror turns light.',
      'The water her gaze touches through a shield turns to stone as well.',
      'Before you cross a bridge, make sure no shield is sending her gaze along it.'],
    rows:[
      '####C####',
      '#o~...~o#',
      '#~~...~~#',
      '#...r...#',
      '#~~~.~~~#',
      '#.......#',
      '#\\..M../#',
      '#..<.>..#',
      '#.~o~o~.#',
      '#.......#',
      '#...@.L.#',
      '####G####'
    ] }
];

var PARSED = {};
/* THE ROOM: the frame's five through lib.room, and the kind's own. Q.head is the head's tile, Q.pool lists the water tiles (a bit
   each), Q.plate maps a plate tile to the way it turns her, Q.rock and Q.mir mark statues and shields, Q.coin lists the coins. */
function parse(G){ if (PARSED[G.id]) return PARSED[G.id]; var pool = [], plate = {}, rock = {}, mir = {}, coin = [], head = -1;
  var Q = LIB().room(G, function(ch, i){ if (ch === 'M'){ head = i; return; } if (ch === '~'){ pool.push(i); return; } if (ch === 'r'){ rock[i] = 1; return; }
    if (ch === '/' || ch === '\\'){ mir[i] = ch; return; } if (ch === 'o'){ coin.push(i); return; } if (ARROW[ch] != null){ plate[i] = ARROW[ch]; return; } return false; });
  Q.head = head; Q.pool = pool; Q.plate = plate; Q.rock = rock; Q.mir = mir; Q.coin = coin; Q.allK = (1 << coin.length) - 1; Q.pi = {}; pool.forEach(function(t, j){ Q.pi[t] = j; });
  return PARSED[G.id] = Q; }
function at(Q, c, r){ return c < 0 || r < 0 || c >= Q.W || r >= Q.H ? -1 : r * Q.W + c; }
/* HER GAZE along d: out from the head a tile at a time, turned a right angle by a shield, until a wall, a statue, the head, the
   vault, the lever or the gate stops it. Returns the tiles it falls on (the shields' own tiles are not among them). */
function gaze(Q, d){ var out = [], c = Q.head % Q.W, r = (Q.head / Q.W) | 0, dx = DV[d][0], dy = DV[d][1], seen = {};
  for (var k = 0; k < 80; k++){ c += dx; r += dy; var n = at(Q, c, r); if (n < 0) break; var ch = Q.cell[n];
    if (ch === '#' || ch === 'M' || Q.rock[n] || n === Q.chest || n === Q.lever || n === Q.gate) break;
    if (Q.mir[n]){ var key = n + ':' + dx + ':' + dy; if (seen[key]) break; seen[key] = 1; var t = dx; if (Q.mir[n] === '/'){ dx = -dy; dy = -t; } else { dx = dy; dy = t; } continue; }
    out.push(n); }
  return out; }
// the water along her gaze turns to stone
function petrify(Q, m, line){ for (var i = 0; i < line.length; i++){ var j = Q.pi[line[i]]; if (j != null) m |= (1 << j); } return m; }
function init(G){ var Q = parse(G), d = ARROW[G.look0 || 'v']; return { p:Q.start, d:d, k:0, m:petrify(Q, 0, gaze(Q, d)) }; }
function key(s){ return s.p + ':' + s.d + ':' + s.k + ':' + s.m; }
// can he stand on tile n with the water as m
function open(Q, m, n){ if (n < 0) return false; var ch = Q.cell[n]; if (ch === '#' || ch === 'M' || Q.rock[n] || Q.mir[n] || n === Q.lever || n === Q.chest || n === Q.gate) return false;
  var j = Q.pi[n]; return j == null || !!(m & (1 << j)); }

/* ONE STEP. The frame's tiles first (the gate, the lever); the vault opens with every coin in hand. Then the walk: onto a plate
   she turns, her new line turns its water to stone, and if he stands in her line (stepped into it, or she turned onto him) he is
   turned to stone and wakes at the gate. */
function act(G, s, dir){ var Q = parse(G), L = LIB(), n = L.nb(Q, s.p, dir);
  if (n === Q.chest) return s.k === Q.allK ? { s:s, ev:'open', moves:[] } : { s:s, ev:'shut', moves:[] };
  var f = L.frameStep(G, Q, s, s.p, dir, init); if (f) return f;
  if (!open(Q, s.m, n)) return { s:s, ev:'bump', moves:[] };
  var mv = [['me', s.p, n, 'walk']], d = s.d, m = s.m, k = s.k, ev = 'step', j = Q.coin.indexOf(n);
  if (j >= 0 && !(k & (1 << j))){ k |= 1 << j; mv.push(['coin', n, n, 'take']); ev = 'take'; }
  if (Q.plate[n] != null && Q.plate[n] !== d){ d = Q.plate[n]; var line = gaze(Q, d), m2 = petrify(Q, m, line); mv.push(['head', Q.head, Q.head, 'turn', d, m2]); if (m2 !== m) ev = 'bridge'; m = m2; }
  if (gaze(Q, d).indexOf(n) >= 0){ mv.push(['stone', n, n, 'stone']); mv.push(['me', n, Q.start, 'wake']); return { s:{ p:Q.start, d:d, k:k, m:m }, ev:'stone', moves:mv }; }
  return { s:{ p:n, d:d, k:k, m:m }, ev:ev, moves:mv }; }
function moves(){ return [0, 1, 2, 3]; }
function proof(G){ return (G.proof || '').split('').map(function(ch){ return 'URDL'.indexOf(ch); }); }
function enc(path){ return path.map(function(d){ return 'URDL'.charAt(d); }).join(''); }
function goal(G){ return parse(G).coin.length > 1 ? 'Pick up every owl coin, then step into the vault.' : 'Pick up the owl coin, then step into the vault.'; }

/* ---- THE LOOK: the court's floor is white marble slabs; a pool is sunk a little, its water drawn live (it turns to stone); a plate
   is a bronze disc with its arrow cut in it; a statue is a grey figure; a shield a bronze disc on its rim. Medusa's head is the
   bust of the holes (olive snakes, a pale green face), and the tiles her gaze falls on are lit a cold jade, so the danger and the
   bridge she is making can always be read. */
var DECK = 0.45;
function floor(gc){ if (gc.k === '#' || gc.k === 'M') return null; var k = gc.k === '~' ? 1 : ARROW[gc.k] != null ? 2 : 0;
  return { h:k === 1 ? DECK - 0.25 : DECK, mat:['mdfloor', { gu:gc.u, gv:gc.v, hk:k, ar:ARROW[gc.k] == null ? -1 : ARROW[gc.k] }] }; }
function mats(){ return {
  mdfloor:['', '', '', 0, function(c, R, h3){ var u = c.gu || 0, v = c.gv || 0, k = c.hk || 0, n = h3(c.ti, c.tj, 97);
    if (k === 1) return R(n > 0.6 ? '#3a6a8a' : '#2a5a7a');
    if (c.dt < 0 || u < 0.04 || u > 0.96 || v < 0.04 || v > 0.96) return R('#8a867c');
    if (k === 2){ var du = u - 0.5, dv = v - 0.5, rr = Math.hypot(du, dv); if (rr > 0.42) return R('#c8c4ba'); var a = c.ar, fx = a === 1 ? du : a === 3 ? -du : 0, fy = a === 0 ? -dv : a === 2 ? dv : 0, side = a === 1 || a === 3 ? Math.abs(dv) : Math.abs(du);
      if (fx + fy > -0.2 && side < 0.3 - (fx + fy) * 0.9 && fx + fy < 0.3) return R('#3a2410'); return R(rr > 0.36 ? '#7a5420' : '#c8913a'); }
    return R(n < 0.15 ? '#c8c4ba' : n > 0.9 ? '#f6f4ee' : '#e2ded6'); }] }; }

function view(R){ var Q = R.Q, T = R.T, ctx = R.ctx, s0 = null, turnT = null, flash = null;
  function P(x, y, z){ return R.scr(x, y, z == null ? DECK + 0.015 : z); }
  function quad(i, z, col){ var c = R.at(i), h = T * 0.49, a = P(c[0] - h, c[1] - h, z), b = P(c[0] + h, c[1] - h, z), d = P(c[0] + h, c[1] + h, z), e = P(c[0] - h, c[1] + h, z);
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(d[0], d[1]); ctx.lineTo(e[0], e[1]); ctx.closePath(); ctx.fill(); }
  // a pool tile: sea water rippling, or the stone it was turned to
  function pool(i, j, m, tsec){ if (m & (1 << j)){ quad(i, DECK, '#a8a49a'); var c = R.at(i), p = P(c[0], c[1]); ctx.strokeStyle = '#7a766e'; ctx.lineWidth = Math.max(1, R.kk() * 0.5);
      ctx.beginPath(); ctx.moveTo(p[0] - T * 4, p[1]); ctx.stroke(); return; }
    var w = R.reduce ? 0 : Math.sin(tsec * 2 + i) * 0.5 + 0.5; quad(i, DECK - 0.2, w > 0.7 ? '#4a8ab0' : '#3a7aa0');
    var cc = R.at(i), q = P(cc[0] + (w - 0.5) * T * 0.4, cc[1] - T * 0.15, DECK - 0.2); ctx.fillStyle = 'rgba(232,242,246,.6)'; ctx.fillRect(Math.round(q[0]), Math.round(q[1]), Math.max(2, Math.round(R.kk() * 2)), Math.max(1, Math.round(R.kk() * 0.6))); }
  // an owl coin: a silver disc with the owl stamped on it
  function coin(x, y, tsec, j){ var c = P(x, y, DECK + T * 0.14), e = P(x + T * 0.2, y, DECK + T * 0.14), rx = Math.max(2, Math.abs(e[0] - c[0])), g = R.reduce ? 0 : Math.sin(tsec * 2.4 + j) * rx * 0.12;
    ctx.fillStyle = '#8a8a94'; ctx.beginPath(); ctx.ellipse(c[0], c[1] + rx * 0.2 + g, rx, rx * 0.55, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#e8e8f0'; ctx.beginPath(); ctx.ellipse(c[0], c[1] + g, rx, rx * 0.55, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#a8a8b4'; ctx.lineWidth = Math.max(1, rx * 0.12); ctx.beginPath(); ctx.ellipse(c[0], c[1] + g, rx * 0.7, rx * 0.38, 0, 0, 7); ctx.stroke(); ctx.fillStyle = '#ffd860'; ctx.fillRect(Math.round(c[0] - rx * 0.2), Math.round(c[1] + g - rx * 0.1), Math.max(1, Math.round(rx * 0.12)), Math.max(1, Math.round(rx * 0.12))); ctx.fillRect(Math.round(c[0] + rx * 0.1), Math.round(c[1] + g - rx * 0.1), Math.max(1, Math.round(rx * 0.12)), Math.max(1, Math.round(rx * 0.12))); }
  // a statue of an earlier visitor: a grey figure on a round base
  function statue(x, y){ var b = P(x, y, DECK), t = P(x, y, DECK + T * 1.3), e = P(x + T * 0.3, y, DECK), rx = Math.max(3, Math.abs(e[0] - b[0]));
    ctx.fillStyle = '#d8d4cc'; ctx.beginPath(); ctx.ellipse(b[0], b[1], rx * 1.2, rx * 0.5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#a8a49a'; ctx.beginPath(); ctx.moveTo(b[0] - rx * 0.6, b[1]); ctx.lineTo(b[0] + rx * 0.6, b[1]); ctx.lineTo(t[0] + rx * 0.35, t[1] + rx * 0.6); ctx.lineTo(t[0] - rx * 0.35, t[1] + rx * 0.6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#b8b4aa'; ctx.beginPath(); ctx.arc(t[0], t[1] + rx * 0.2, rx * 0.4, 0, 7); ctx.fill(); }
  // a bronze shield on its rim, turned the way it bends her gaze
  function shield(i){ var c = R.at(i), sl = Q.mir[i] === '/' ? 1 : -1, h = T * 0.42, a = P(c[0] - h, c[1] + h * sl, DECK + T * 0.35), b = P(c[0] + h, c[1] - h * sl, DECK + T * 0.35);
    ctx.lineCap = 'round'; ctx.strokeStyle = '#3a2410'; ctx.lineWidth = Math.max(6, Math.abs(b[0] - a[0]) * 0.32); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    ctx.strokeStyle = '#e8b860'; ctx.lineWidth = Math.max(3, Math.abs(b[0] - a[0]) * 0.2); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
  // Medusa's head on its plinth: olive snakes for hair, a pale green face, her eyes turned the way she looks
  function head(tsec){ var w = R.at(Q.head), d = s0 ? s0.d : 0, b = P(w[0], w[1], DECK), c = P(w[0], w[1], DECK + T * 1.25), e = P(w[0] + T * 0.4, w[1], DECK), rx = Math.max(5, Math.abs(e[0] - b[0]));
    ctx.fillStyle = '#e2ded6'; ctx.fillRect(Math.round(b[0] - rx * 0.8), Math.round(c[1] + rx * 0.6), Math.round(rx * 1.6), Math.max(2, Math.round(b[1] - c[1] - rx * 0.6)));
    for (var k = 0; k < 9; k++){ var a = k / 9 * 6.283 + (R.reduce ? 0 : Math.sin(tsec * 2 + k) * 0.15), sx = c[0] + Math.cos(a) * rx * 0.75, sy = c[1] + Math.sin(a) * rx * 0.62;
      ctx.strokeStyle = k % 2 ? '#3e5a22' : '#6a8a3a'; ctx.lineWidth = Math.max(2, rx * 0.2); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.quadraticCurveTo(sx + Math.sin(a * 3) * rx * 0.3, sy, sx + Math.cos(a) * rx * 0.3, sy + Math.sin(a) * rx * 0.3); ctx.stroke(); }
    ctx.fillStyle = '#c4d8b4'; ctx.beginPath(); ctx.ellipse(c[0], c[1], rx * 0.5, rx * 0.58, 0, 0, 7); ctx.fill();
    var ex = DV[d][0] * rx * 0.12, ey = DV[d][1] * rx * 0.08; ctx.fillStyle = '#eaffea'; [-1, 1].forEach(function(sd){ ctx.beginPath(); ctx.arc(c[0] + sd * rx * 0.2 + ex, c[1] - rx * 0.08 + ey, Math.max(1.5, rx * 0.1), 0, 7); ctx.fill(); });
    ctx.fillStyle = '#4a2a2a'; ctx.beginPath(); ctx.ellipse(c[0], c[1] + rx * 0.3, rx * 0.12, rx * 0.09, 0, 0, 7); ctx.fill(); }
  return {
    lay:function(s){ s0 = s; turnT = null; flash = null; },
    move:function(m, u){ if (m[0] === 'head'){ if (u >= 1){ s0 = { p:s0.p, d:m[4], k:s0.k, m:m[5] }; R.sfx('blip'); } return; }
      if (m[0] === 'stone'){ flash = u < 1 ? m[1] : null; return; }
      if (u < 1) return; if (m[0] === 'coin'){ var q = R.at(m[1]); R.burst(q[0], q[1], DECK + 0.3, ['#ffffff', '#e8e8f0', '#ffd860'], 8, 0.8, 0.6); } },
    things:function(ds, tsec){ if (!s0) return; var s = s0;
      Q.pool.forEach(function(i, j){ var q = R.at(i); ds.push({ x:q[0], y:q[1] - T * 0.45, kd:function(e, ts){ pool(i, j, s0.m, ts || tsec);
        if (gaze(Q, s0.d).indexOf(i) >= 0) quad(i, s0.m & (1 << j) ? DECK + 0.02 : DECK - 0.18, 'rgba(150,236,190,' + (R.reduce ? 0.42 : 0.38 + 0.08 * Math.sin((ts || tsec) * 4)).toFixed(3) + ')'); } }); });
      Q.coin.forEach(function(i, j){ if (s.k & (1 << j)) return; var w = R.at(i); ds.push({ x:w[0], y:w[1], kd:function(e, ts){ coin(w[0], w[1], ts || tsec, j); } }); });
      Object.keys(Q.rock).forEach(function(i){ var w = R.at(+i); ds.push({ x:w[0], y:w[1], kd:function(){ statue(w[0], w[1]); } }); });
      Object.keys(Q.mir).forEach(function(i){ var w = R.at(+i); ds.push({ x:w[0], y:w[1], kd:function(){ shield(+i); } }); });
      var wh = R.at(Q.head); ds.push({ x:wh[0], y:wh[1] + 0.3, kd:function(e, ts){ head(ts || tsec); } }); },
    // the tiles her gaze falls on, lit a cold jade; a tile where he was turned to stone flashes white
    ground:function(tsec){ if (!s0) return; var line = gaze(Q, s0.d), pulse = R.reduce ? 0.42 : 0.38 + 0.08 * Math.sin(tsec * 4);
      line.forEach(function(i){ quad(i, Q.pi[i] != null && !(s0.m & (1 << Q.pi[i])) ? DECK - 0.18 : DECK + 0.02, 'rgba(150,236,190,' + pulse.toFixed(3) + ')'); });
      if (flash != null) quad(flash, DECK + 0.03, 'rgba(255,255,255,.8)'); },
    hot:function(){ return []; } }; }

root.RTT_GYMKIND_STONE = { id:'stone', gyms:GYMS, input:'step', calm:true, unit:'step', hello:'Her gaze turns water to stone. Step on a plate to turn her. Never stand in her line.',
  parse:parse, init:init, key:key, act:act, step:act, moves:moves, proof:proof, enc:enc, goal:goal,
  me:function(G, s){ return s.p; }, place:function(G, s, i){ return { p:i, d:s.d, k:s.k, m:s.m }; },
  deck:function(G, s, i){ var Q = parse(G); return open(Q, s.m, i) || i === Q.lever; },
  tell:{ shut:'The vault stays shut. An owl coin is still out there.', bridge:'Her gaze turns the water to stone.', stone:'She looked at you. You wake back at the gate.', stuck:'No way to finish from here. Undo it, or Restart.' },
  dur:function(how){ return how === 'turn' ? 0.25 : how === 'stone' ? 0.3 : how === 'wake' ? 0.2 : 0.15; },
  floor:floor, mats:mats, view:view };
})();
