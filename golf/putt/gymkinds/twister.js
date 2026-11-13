/* golf/putt/gymkinds/twister.js: the TWISTER kind of trail gym (RTT_GYMKIND_TWISTER), Oz's. A kind file: the registry
   (gyms.js, its KINDS README) finds it by its global, the frame (trail.js) plays it, check-putt proves it.

   THE PUZZLE. He walks a stretch of yellow brick road cut up by beds of poppies, which he must never step into (he
   would fall asleep). Little twisters wander the road, each one up and down its own track, a tile every step he takes.
   When a twister reaches the tile he is on (or the two of them pass each other) it picks him up and sets him down on
   its own mark, a ring of bricks somewhere in the room: over the poppies, or right back by the gate. Oil cans lie on
   the road, and the vault opens once every can is picked up. So every step is also a clock: which twister to meet,
   where, and which one to keep clear of, and the long way round is sometimes the way to be in the right place when the
   right twister comes by.

   THE GATEKEEPER'S TWIST is the ice slide (Ice Age's), as silver bricks: on silver he slides on the way he was going
   until the next tile stops him. The twisters still take one tile for the whole slide.

   He moves TILE BY TILE (a step kind: the stick, the arrows, the pad, or a tap toward a tile). A bump into a wall or
   the poppies is no step, so nothing moves.

   THE LAYOUTS ARE HAND DESIGNED, never random. Row 0 is the far wall (the top of the screen), the last row the near
   wall with the gate in it. The frame's five characters (# G @ L C, gyms.js) and this kind's own:
     ~   poppies (he cannot step in)      o   an oil can (picked up as he steps on it)
     m   a twister's mark (road)          =   silver bricks (the gatekeeper's): he slides across them
   Each twister is in the gym's tw list: { mark:[col, row], path:[[col, row], ...] }. It walks its path a tile a step
   and, at the end, comes back along it, so a path of n tiles takes 2(n - 1) steps to come round.

   THE STATE is { p, k, t }: where he stands, the cans picked up (a bit a can) and the step count round the twisters'
   common period. A few thousand states, so solve() and audit() are the registry's own breadth first search (lib). */
(function(){
var root = typeof window !== 'undefined' ? window : globalThis;
var LIB = function(){ return root.RTT_PUTT_GYMS.lib; };

/* THE GYMS. moves and proof are the solver's fewest steps and one shortest solution (U R D L), recorded from solve().
   The civilian's lines nudge, never solve. */
var GYMS = [
  /* THE TWISTER BARN, mid-world: cans across the poppies, two twisters on the road, one of them a ride back to the gate. */
  { id:'oz1', kind:'twister', world:'oz', leg:9, name:'The Twister Barn', badge:'Cyclone Badge', mech:['twister'], pay:500, look:{ wall:'plank' },
    moves:24, proof:'URLLUULLUDRRRRRRRRUURRRU',
    who:{ look:{ skin:'light', polo:'blue', hat:'blue', pants:'blue', hair:'blonde', hairStyle:'ponytail', cap:true, hatStyle:'bucket', shoes:'white', gender:'female' } },
    say:['A twister always sets you down on its own mark. Look where each mark is.',
      'Every step you take, every twister takes one too. Count them.',
      'The long way round can put you in the right place at the right time.'],
    tw:[ { mark:[1, 2], path:[[1, 5], [2, 5], [3, 5], [4, 5], [5, 5], [6, 5], [7, 5]] },
      { mark:[4, 7], path:[[7, 2], [6, 2], [5, 2], [4, 2], [3, 2]] } ],
    rows:[
      '#########',
      '####C####',
      '#mo....o#',
      '#~~~.~~~#',
      '#o~...~.#',
      '#.......#',
      '#.~.~.~.#',
      '#...m...#',
      '###L@####',
      '####G####'
    ] },
  /* THE GATEHOUSE, the gatekeeper: twisters and silver bricks together. A slide ends where something stops it, and a
     twister may be waiting there. */
  { id:'oz2', kind:'twister', world:'oz', leg:18, name:'The Gatehouse', badge:'Emerald Badge', mech:['twister', 'ice'], pay:1000, keeper:true, look:{ wall:'plank' },
    hint:'There is no way back down from the top row. Pick up every can on the road below before a twister carries you up.',
    moves:26, proof:'UULLLUURRURRDURRDDLLLLLRRU',
    who:{ look:{ skin:'tan', polo:'green', hat:'green', pants:'green', hair:'black', hairStyle:'short', cap:true, hatStyle:'bucket', shoes:'white', gender:'male' } },
    say:['On the silver you keep sliding. Only something in the way stops you.',
      'A slide is one step to a twister, however far you go.',
      'Think about where you stop, and who will be there when you do.'],
    tw:[ { mark:[7, 2], path:[[1, 6], [2, 6], [3, 6], [4, 6], [5, 6], [6, 6], [7, 6]] },
      { mark:[4, 9], path:[[2, 4], [3, 4], [4, 4], [5, 4], [6, 4]] },
      { mark:[1, 2], path:[[7, 8], [7, 7], [7, 6], [7, 5]] } ],
    rows:[
      '#########',
      '####C####',
      '#mo...om#',
      '#~~~~~~~#',
      '#=.....o#',
      '#.~=~=~.#',
      '#.......#',
      '#o~=.=~.#',
      '#=.....=#',
      '#...m...#',
      '###L@####',
      '####G####'
    ] }
];

var PARSED = {};
/* THE ROOM: the frame's five through lib.room, and the kind's own. Q.poppy, Q.ice and Q.mark mark their tiles, Q.cans
   lists the cans (a bit each), Q.tw the twisters with their tracks as tiles and the period they all come round in. */
function parse(G){ if (PARSED[G.id]) return PARSED[G.id]; var poppy = {}, ice = {}, mark = {}, cans = [];
  var Q = LIB().room(G, function(ch, i){ if (ch === '~'){ poppy[i] = 1; return; } if (ch === '='){ ice[i] = 1; return; } if (ch === 'm'){ mark[i] = 1; return; }
    if (ch === 'o'){ cans.push(i); return; } return false; });
  Q.poppy = poppy; Q.ice = ice; Q.mark = mark; Q.cans = cans; Q.allK = (1 << cans.length) - 1;
  var lcm = 1, gcd = function(a, b){ return b ? gcd(b, a % b) : a; };
  Q.tw = (G.tw || []).map(function(w){ var tr = w.path.map(function(q){ return q[1] * Q.W + q[0]; }), n = tr.length, lap = [];
    for (var k = 0; k < n; k++) lap.push(tr[k]); for (k = n - 2; k > 0; k--) lap.push(tr[k]);
    lcm = lcm * lap.length / gcd(lcm, lap.length); return { mark:w.mark[1] * Q.W + w.mark[0], track:tr, lap:lap }; });
  Q.P = lcm;
  return PARSED[G.id] = Q; }
function init(G){ var Q = parse(G); return { p:Q.start, k:0, t:0 }; }
function key(s){ return s.p + ':' + s.k + ':' + s.t; }
// where twister j stands at step t
function twAt(Q, j, t){ var L = Q.tw[j].lap; return L[t % L.length]; }
// can he stand on tile n (step onto it, slide onto it, be set down on it)
function open(Q, n){ if (n < 0) return false; var ch = Q.cell[n]; if (ch === '#' || n === Q.lever || n === Q.chest || n === Q.gate) return false; return !Q.poppy[n]; }
function can(Q, k, n, mv){ var j = Q.cans.indexOf(n); if (j >= 0 && !(k & (1 << j))){ mv.push(['can', n, n, 'take']); return k | (1 << j); } return k; }

/* ONE STEP. The frame's tiles first (the gate, the lever); the vault opens with every can in hand. Then the walk (and a
   slide on silver), the twisters' step, and a twister that meets him carries him to its mark. */
function act(G, s, d){ var Q = parse(G), L = LIB(), n = L.nb(Q, s.p, d);
  if (n === Q.chest) return s.k === Q.allK ? { s:s, ev:'open', moves:[] } : { s:s, ev:'shut', moves:[] };
  var f = L.frameStep(G, Q, s, s.p, d, init); if (f) return f;
  if (!open(Q, n)) return { s:s, ev:'bump', moves:[] };
  var t1 = (s.t + 1) % Q.P, mv = [], ev = 'step', p = n, k;
  Q.tw.forEach(function(w, j){ var a = twAt(Q, j, s.t), b = twAt(Q, j, t1); if (a !== b) mv.push(['tw', a, b, 'drift', j]); });
  mv.push(['me', s.p, n, 'walk']); k = can(Q, s.k, n, mv);
  for (var guard = 0; Q.ice[p] && guard < 40; guard++){ var nx = L.nb(Q, p, d); if (!open(Q, nx)) break; mv.push(['me', p, nx, 'slide']); p = nx; k = can(Q, k, p, mv); if (ev === 'step') ev = 'slide'; }
  // a twister on the tile he ends on, or one that crossed him on the way (he stepped where it was as it stepped where he was)
  for (var j = 0; j < Q.tw.length; j++){ var a2 = twAt(Q, j, s.t), b2 = twAt(Q, j, t1);
    if (b2 === p || (ev === 'step' && a2 === n && b2 === s.p)){ var mk = Q.tw[j].mark;
      mv.push(['whirl', p, p, 'whirl', j], ['me', p, mk, 'carry'], ['drop', mk, mk, 'drop', j]); p = mk; k = can(Q, k, p, mv); ev = 'carry'; break; } }
  if (ev === 'step' && k !== s.k) ev = 'take';
  return { s:{ p:p, k:k, t:t1 }, ev:ev, moves:mv }; }
function moves(){ return [0, 1, 2, 3]; }
function proof(G){ return (G.proof || '').split('').map(function(ch){ return 'URDL'.indexOf(ch); }); }
function enc(path){ return path.map(function(d){ return 'URDL'.charAt(d); }).join(''); }
function goal(G){ return parse(G).cans.length > 1 ? 'Pick up every oil can, then step into the vault.' : 'Pick up the oil can, then step into the vault.'; }

/* ---- THE LOOK: the road is yellow brick, laid in courses; the poppies a bed of red flowers on dark leaves, a step down;
   silver bricks shine; a mark is a ring of emerald bricks round a red poppy. In the room the twisters are grey funnels
   turning where they stand, their tracks dotted on the road, the cans are tin oil cans with their spouts. */
var DECK = 0.45;
function floor(gc){ if (gc.k === '#') return null; var k = gc.k === '~' ? 1 : gc.k === '=' ? 2 : gc.k === 'm' ? 3 : 0;
  return { h:k === 1 ? DECK - 0.25 : DECK, mat:['ozroad', { gu:gc.u, gv:gc.v, hk:k }] }; }
function mats(){ return {
  ozroad:['', '', '', 0, function(c, R, h3){ var u = c.gu || 0, v = c.gv || 0, k = c.hk || 0, n = h3(c.ti, c.tj, 97);
    if (k === 1){ if (n > 0.55){ var pu = (u * 3) % 1, pv = (v * 3) % 1; return R(Math.hypot(pu - 0.5, pv - 0.5) < 0.12 ? '#1e1410' : n > 0.8 ? '#ff4a3a' : '#e8262a'); } return R(n > 0.3 ? '#2f7a2a' : '#245a20'); }
    if (c.dt < 0 || u < 0.04 || u > 0.96 || v < 0.04 || v > 0.96) return R('#14683a');
    if (k === 3){ var rr = Math.hypot(u - 0.5, v - 0.5); if (rr < 0.12) return R('#e8262a'); if (rr > 0.26 && rr < 0.4) return R(((Math.atan2(v - 0.5, u - 0.5) * 2) | 0) % 2 ? '#2fb36a' : '#ffffff'); }
    var row = Math.floor(v * 3), mo = (v * 3) % 1 < 0.12 || ((u * 2 + (row & 1) * 0.5) % 1) < 0.07;
    if (k === 2){ if (mo) return R('#8a909e'); if (Math.abs(u - v) < 0.05) return R('#ffffff'); return R(n < 0.2 ? '#e8ecf4' : '#c8ccd8'); }
    if (mo) return R('#b8841e'); return R(n < 0.15 ? '#e6b628' : n > 0.92 ? '#ffd84a' : '#f0c232'); }] }; }

function view(R){ var Q = R.Q, T = R.T, ctx = R.ctx, s0 = null, tw = {}, whirl = null, drop = null;
  function P(x, y, z){ return R.scr(x, y, z == null ? DECK + 0.015 : z); }
  // a twister: a grey funnel standing on its tile, narrow at the foot, bands of wind turning up it, a leaf caught in it
  function funnel(x, y, tsec, j, big){ var k = R.kk(), H = T * (big ? 1.5 : 1.15), n = 7, sp = R.reduce ? 0 : tsec * 5 + j, i;
    for (i = 0; i < n; i++){ var z = DECK + H * i / (n - 1), rr = T * (0.1 + 0.32 * Math.pow(i / (n - 1), 1.2)), sw = Math.sin(tsec * 2 + j + i * 0.5) * T * 0.04,
        c = P(x + sw, y, z), e = P(x + sw + rr, y, z), rx = Math.max(2, Math.abs(e[0] - c[0]));
      ctx.fillStyle = i % 2 ? 'rgba(96,100,122,.75)' : 'rgba(210,214,228,.8)'; ctx.beginPath(); ctx.ellipse(c[0], c[1], rx, rx * 0.4, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = Math.max(1, k * 0.5); ctx.beginPath(); ctx.ellipse(c[0], c[1], rx, rx * 0.4, 0, sp + i, sp + i + 2.2); ctx.stroke(); }
    var la = sp * 0.8, lp = P(x + Math.cos(la) * T * 0.3, y + Math.sin(la) * T * 0.15, DECK + H * (0.5 + 0.3 * Math.sin(la))); ctx.fillStyle = j % 2 ? '#e8262a' : '#5a9a3a';
    ctx.fillRect(Math.round(lp[0]), Math.round(lp[1]), Math.max(2, Math.round(k)), Math.max(2, Math.round(k))); }
  // a tin oil can with its long spout, a shine down its side
  function oil(x, y, tsec, j){ var c = P(x, y, DECK + T * 0.22), e = P(x + T * 0.16, y, DECK + T * 0.22), px = Math.max(2, Math.abs(e[0] - c[0])), g = R.reduce ? 0 : Math.sin(tsec * 2.4 + j) * px * 0.12;
    ctx.fillStyle = '#9aa0ae'; ctx.strokeStyle = '#3a3e48'; ctx.lineWidth = Math.max(1, R.kk() * 0.5);
    ctx.beginPath(); ctx.ellipse(c[0], c[1] + g, px, px * 1.1, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(c[0] + px * 0.5, c[1] + g - px * 0.6); ctx.lineTo(c[0] + px * 1.8, c[1] + g - px * 1.9); ctx.lineWidth = Math.max(1.5, R.kk() * 0.9); ctx.strokeStyle = '#7a808e'; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.beginPath(); ctx.ellipse(c[0] - px * 0.4, c[1] + g - px * 0.2, px * 0.2, px * 0.5, 0, 0, 7); ctx.fill(); }
  return {
    lay:function(s){ s0 = s; tw = {}; whirl = null; drop = null; },
    move:function(m, u){ if (m[0] === 'tw'){ var a = R.at(m[1]), b = R.at(m[2]); tw[m[4]] = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]; return; }
      if (m[0] === 'whirl'){ whirl = u < 1 ? [m[1], u] : null; return; }
      if (m[0] === 'drop'){ if (u >= 1){ var q = R.at(m[1]); R.burst(q[0], q[1], DECK + 0.3, ['#ffffff', '#c8ccd8', '#e8262a'], 10, 0.8, 0.7); R.sfx('blip'); } return; }
      if (u < 1) return; if (m[0] === 'can'){ var q2 = R.at(m[1]); R.burst(q2[0], q2[1], DECK + 0.3, ['#ffffff', '#c8ccd8', '#f0c232'], 8, 0.8, 0.6); } },
    things:function(ds, tsec){ if (!s0) return; var s = s0;
      Q.cans.forEach(function(i, j){ if (s.k & (1 << j)) return; var w = R.at(i); ds.push({ x:w[0], y:w[1], kd:function(e, ts){ oil(w[0], w[1], ts || tsec, j); } }); });
      Q.tw.forEach(function(w, j){ var at = tw[j] || R.at(twAt(Q, j, s.t)); ds.push({ x:at[0], y:at[1] + 0.01, kd:function(e, ts){ funnel(at[0], at[1], ts || tsec, j, false); } }); });
      if (whirl){ var wq = R.at(whirl[0]); ds.push({ x:wq[0], y:wq[1] + 0.02, kd:function(e, ts){ funnel(wq[0], wq[1], ts || tsec, 9, true); } }); } },
    // each twister's track, dotted on the road, and a thin line from its track to its mark so a player can see where it takes him
    ground:function(tsec){ var k = R.kk(); Q.tw.forEach(function(w, j){ ctx.fillStyle = 'rgba(70,72,96,.5)';
        w.track.forEach(function(i){ var c = R.at(i), p = P(c[0], c[1]); ctx.beginPath(); ctx.arc(p[0], p[1], Math.max(1.5, k * 0.9), 0, 7); ctx.fill(); });
        var mq = R.at(w.mark), mp = P(mq[0], mq[1]); ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = Math.max(1, k * 0.6); ctx.beginPath(); ctx.arc(mp[0], mp[1], Math.max(3, k * 3.2), 0, 7); ctx.stroke(); }); },
    hot:function(){ return []; } }; }

root.RTT_GYMKIND_TWISTER = { id:'twister', gyms:GYMS, input:'step', calm:true, unit:'step', hello:'Twisters take a step each time you do. One that meets you sets you down on its mark.',
  parse:parse, init:init, key:key, act:act, step:act, moves:moves, proof:proof, enc:enc, goal:goal,
  me:function(G, s){ return s.p; }, place:function(G, s, i){ return { p:i, k:s.k, t:s.t }; },
  deck:function(G, s, i){ var Q = parse(G); return open(Q, i) || i === Q.lever; },
  tell:{ shut:'The vault stays shut. A can is still out there.', carry:'A twister picks you up and sets you down on its mark.', slide:'You slide on the silver bricks.', stuck:'No way to finish from here. Undo it, or Restart.' },
  dur:function(how){ return how === 'carry' ? 0.55 : how === 'whirl' ? 0.3 : how === 'drop' ? 0.12 : how === 'slide' ? 0.1 : 0.15; },
  floor:floor, mats:mats, view:view };
})();
