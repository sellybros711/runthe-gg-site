/* golf/putt/gymkinds/air.js: the SUIT AIR kind of trail gym (RTT_GYMKIND_AIR), Red Planet's. A kind file: the registry
   (gyms.js, its KINDS README) finds it by its global, the frame (trail.js) plays it, check-putt proves it.

   THE PUZZLE. Outside the colony there is no air, so he walks the room on the air in his suit. Every step uses one
   breath of it, and the gauge on the far wall counts what is left. Oxygen tanks stand about the floor: step onto one and
   the suit fills right up, and that tank is empty for good. Rock samples lie in the dust, and the sample vault opens
   only once every sample is picked up. Out of air and not on a tank, he can go no further (Restart lights). So the walk
   is a budget: which tank to save for later, which sample to grab on the way to a tank and which on the way back, and
   when a full suit is wasted by filling it too soon. The aha in each room is an order that looks wrong: a detour past
   the near tank, or a sample left behind on purpose.

   THE GATEKEEPER'S TWIST is Ice Age's slide, as the polar cap's ice: step onto the ice and he slides on in that line
   until something stops him (a wall, a boulder, or the dust at the ice's edge, where he stops on the first tile off
   it). A whole slide costs one breath, however far it goes, so the ice is the cheap way across the room, if he can
   use where it leaves him.

   He moves TILE BY TILE (a step kind: the stick, the arrows, the pad, or a tap toward a tile).

   THE LAYOUTS ARE HAND DESIGNED, never random. Row 0 is the far wall (the top of the screen), the last row the near
   wall with the gate in it. The frame's five characters (# G @ L C, gyms.js) and this kind's own:
     o   an oxygen tank: fills the suit to full, once
     s   a rock sample: picked up as he steps on it
     x   a boulder (it stops him, in front of it)
     =   polar ice (the gatekeeper's): he slides on it
   G.air is how much air a full suit holds (and what it holds coming in).

   THE STATE is { p, a, t, k }: where he stands, the air left, the tanks used (a bit a tank) and the samples picked up
   (a bit a sample). A few thousand states at most, so solve() and audit() are the registry's own breadth first search
   (lib), and stuck() its bounded search from the state. */
(function(){
var root = typeof window !== 'undefined' ? window : globalThis;
var LIB = function(){ return root.RTT_PUTT_GYMS.lib; };

/* THE GYMS. moves and proof are the solver's fewest steps and one shortest solution (U R D L), recorded from solve().
   The civilian's lines nudge, never solve. */
var GYMS = [
  /* THE DUST BOWL, mid-world: air, tanks and samples, nothing else. */
  { id:'mars1', kind:'air', world:'mars', leg:9, name:'The Dust Bowl', badge:'Dune Badge', mech:['air'], pay:500, look:{ wall:'stone' }, air:5,
    moves:21, proof:'ULLULUUUURRDDDDUUUURU',
    who:{ look:{ skin:'medium', polo:'white', hat:'white', pants:'white', hair:'black', hairStyle:'short', cap:true, hatStyle:'ppastrohelmet', top:'ppspacesuit', shoes:'white', gender:'male' } },
    say:['Your suit doesn\'t hold much air. Every step out there takes a breath.',
      'A tank fills you right up. Fill up when you are nearly empty, not when you are nearly full.',
      'You don\'t have to grab a sample the first time you pass it.'],
    rows:[
      '#########',
      '####C####',
      '#.o.....#',
      '#s.sx...#',
      '#.xs....#',
      '#.......#',
      '#o.o.x..#',
      '#.......#',
      '###L@####',
      '####G####'
    ] },
  /* THE ICE SHELF, the gatekeeper: the same budget, and a sheet of polar ice where a whole slide costs one breath. */
  { id:'mars2', kind:'air', world:'mars', leg:18, name:'The Ice Shelf', badge:'Polar Badge', mech:['air', 'ice'], pay:1000, keeper:true, look:{ wall:'stone' }, air:6,
    moves:23, proof:'UUULDLRRRRDRLUUUUUDLULU',
    who:{ look:{ skin:'light', polo:'white', hat:'white', pants:'white', hair:'red', hairStyle:'ponytail', cap:true, hatStyle:'ppastrohelmet', top:'ppspacesuit', shoes:'white', gender:'female' } },
    say:['The ice is the cheap way across. One breath and you go till something stops you.',
      'Walking the long way round costs you. Look for what stops a slide where you want it.',
      'A boulder in the right place is worth more than a tank.'],
    hint:'Don\'t slide along the ice. Go straight across it, up or down. One breath hops a whole band and drops you on the dust past it.',
    rows:[
      '#########',
      '####C####',
      '#.....o.#',
      '#....s..#',
      '#x.....x#',
      '#..s....#',
      '#====x==#',
      '#.o.s...#',
      '#======.#',
      '#......o#',
      '###L@####',
      '####G####'
    ] }
];

var PARSED = {};
/* THE ROOM: the frame's five through lib.room, and the floor's own. Q.tanks and Q.samples are their tiles (a bit each,
   in reading order), Q.ice whether a tile is ice, Q.rock whether it is a boulder. */
function parse(G){ if (PARSED[G.id]) return PARSED[G.id]; var tanks = [], samples = [], ice = {}, rock = {};
  var Q = LIB().room(G, function(ch, i){ if (ch === 'o') tanks.push(i); else if (ch === 's') samples.push(i); else if (ch === '=') ice[i] = 1; else if (ch === 'x') rock[i] = 1; else return false; });
  Q.tanks = tanks; Q.samples = samples; Q.ice = ice; Q.rock = rock; Q.full = G.air || 6; Q.allK = (1 << samples.length) - 1;
  return PARSED[G.id] = Q; }
function init(G){ var Q = parse(G); return { p:Q.start, a:Q.full, t:0, k:0 }; }
function key(s){ return s.p + ':' + s.a + ':' + s.t + ':' + s.k; }
// a tile he cannot stand on: off the room, a wall, a boulder, or one of the frame's tiles (the frame answers those)
function blocked(Q, n){ return n < 0 || Q.cell[n] === '#' || Q.rock[n] || n === Q.gate || n === Q.lever || n === Q.chest; }
// arriving on tile n with air a: a full tank fills him (and is used), a sample is picked up
function land(Q, s, n, a){ var t = s.t, k = s.k, ti = Q.tanks.indexOf(n), si = Q.samples.indexOf(n);
  if (ti >= 0 && !(t & (1 << ti))){ t |= 1 << ti; a = Q.full; } if (si >= 0) k |= 1 << si; return { p:n, a:a, t:t, k:k }; }

/* ONE STEP. The frame's tiles first (the gate, the lever); the vault opens with every sample in hand; a step costs a
   breath (none left, no step); onto ice, he slides on until the next tile would stop him or he is off the ice. */
function act(G, s, d){ var Q = parse(G), L = LIB(), n = L.nb(Q, s.p, d);
  if (n === Q.chest) return s.k === Q.allK ? { s:s, ev:'open', moves:[] } : { s:s, ev:'shut', moves:[] };
  var f = L.frameStep(G, Q, s, s.p, d, init); if (f) return f;
  if (Q.rock[n]) return { s:s, ev:'bump', moves:[] };
  if (s.a <= 0) return { s:s, ev:'out', moves:[] };
  var p = n;
  if (Q.ice[n]){ for (;;){ var m = L.nb(Q, p, d); if (blocked(Q, m)) break; p = m; if (!Q.ice[p]) break; } }
  var ns = land(Q, s, p, s.a - 1), mv = [['me', s.p, p, Q.ice[n] ? 'slide' : 'walk']];
  if (ns.t !== s.t) mv.push(['tank', p, p, 'fill']); if (ns.k !== s.k) mv.push(['sample', p, p, 'take']);
  return { s:ns, ev:ns.t !== s.t ? 'fill' : ns.k !== s.k ? 'take' : Q.ice[n] ? 'slide' : 'step', moves:mv }; }
function moves(){ return [0, 1, 2, 3]; }
function proof(G){ return (G.proof || '').split('').map(function(ch){ return 'URDL'.indexOf(ch); }); }
function enc(path){ return path.map(function(d){ return 'URDL'.charAt(d); }).join(''); }
function goal(G){ return parse(G).samples.length > 1 ? 'Pick up every sample, then step into the vault.' : 'Pick up the sample, then step into the vault.'; }

/* ---- THE LOOK: rust dust slabs, polar ice pale blue with a sheen, boulders, the tanks (white, a green band, grey once
   used), the samples (a blue crystal in a rock, glowing), and the air gauge on the far wall: a pip a breath. */
var DECK = 0.45, WALLTOP = 0.95;
function floor(gc){ if (gc.k === '#') return null; return { h:DECK, mat:[gc.k === '=' ? 'mice' : 'mdust', { gu:gc.u, gv:gc.v }] }; }
function mats(){ return {
  mdust:['', '', '', 0, function(c, R, h3){ var u = c.gu || 0, v = c.gv || 0, n = h3(c.ti, c.tj, 71); if (c.dt < 0 || u < 0.04 || u > 0.96 || v < 0.04 || v > 0.96) return R('#7a3a20');
    if (u < 0.12 || v < 0.12) return R('#d8875a'); if (u > 0.88 || v > 0.88) return R('#9a4a2a'); return R(n < 0.12 ? '#a8502e' : n < 0.5 ? '#c4683e' : '#bc6038'); }],
  mice:['', '', '', 0, function(c, R, h3){ var u = c.gu || 0, v = c.gv || 0, n = h3(c.ti, c.tj, 73); if (c.dt < 0) return R('#7fb8d8');
    if (Math.abs(u - v) < 0.06 && u > 0.2 && u < 0.6) return R('#ffffff'); if (u < 0.04 || u > 0.96 || v < 0.04 || v > 0.96) return R('#9fd0e8'); return R(n < 0.3 ? '#d8f0fa' : '#c8e6f4'); }] }; }

function view(R){ var Q = R.Q, T = R.T, ctx = R.ctx, s0 = null, anim = {};
  function P(x, y, z){ return R.scr(x, y, z == null ? DECK + 0.015 : z); }
  function disc(x, y, z, rad, fill, line){ var c = P(x, y, z), e = P(x + rad, y, z), f = P(x, y + rad, z), rx = Math.max(1, Math.abs(e[0] - c[0])), ry = Math.max(1, Math.abs(f[1] - c[1]));
    ctx.fillStyle = fill; ctx.beginPath(); ctx.ellipse(c[0], c[1], rx, ry, 0, 0, 7); ctx.fill(); if (line){ ctx.strokeStyle = line; ctx.lineWidth = Math.max(1, R.kk() * 0.5); ctx.stroke(); } }
  // an oxygen tank standing on the floor: a white cylinder, a green band and a valve; grey and slumped once it is used
  function tank(i, used, tsec){ var q = R.at(i), x = q[0], y = q[1], w = T * 0.22, h = T * 0.85, b = P(x, y), t = P(x, y, DECK + h), e = P(x + w, y), px = Math.max(2, Math.abs(e[0] - b[0]));
    disc(x + T * 0.05, y + T * 0.06, null, w * 1.1, 'rgba(0,0,0,0.3)');
    ctx.fillStyle = used ? '#7a7a84' : '#f4f4f8'; ctx.fillRect(b[0] - px, t[1], px * 2, b[1] - t[1]);
    ctx.fillStyle = used ? '#5a5a62' : '#c8c8d0'; ctx.fillRect(b[0] + px * 0.4, t[1], px * 0.6, b[1] - t[1]);
    var band = P(x, y, DECK + h * 0.55); ctx.fillStyle = used ? '#4a4a52' : '#3fd07a'; ctx.fillRect(b[0] - px, band[1] - px * 0.35, px * 2, px * 0.7);
    ctx.beginPath(); ctx.ellipse(t[0], t[1], px, px * 0.45, 0, 0, 7); ctx.fillStyle = used ? '#8a8a94' : '#ffffff'; ctx.fill();
    ctx.fillStyle = '#2a2a32'; ctx.fillRect(t[0] - px * 0.25, t[1] - px * 0.7, px * 0.5, px * 0.6);
    if (!used && !R.reduce){ var g = 0.25 + 0.2 * Math.sin(tsec * 3 + i); ctx.fillStyle = 'rgba(120,255,170,' + g.toFixed(3) + ')'; ctx.beginPath(); ctx.arc(t[0], t[1] - px * 0.9, px * 0.8, 0, 7); ctx.fill(); } }
  // a rock sample: a small red rock split open on a blue crystal, glowing until picked up
  function sample(i, tsec){ var q = R.at(i), x = q[0], y = q[1], c = P(x, y, DECK + T * 0.3), e = P(x + T * 0.4, y, DECK + T * 0.3), px = Math.max(2, Math.abs(e[0] - c[0]));
    var g = R.reduce ? 0.35 : 0.3 + 0.15 * Math.sin(tsec * 2.6 + i); ctx.fillStyle = 'rgba(120,210,255,' + g.toFixed(3) + ')'; ctx.beginPath(); ctx.arc(c[0], c[1], px * 1.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#5a1a0a'; ctx.beginPath(); ctx.moveTo(c[0] - px, c[1] + px * 0.5); ctx.lineTo(c[0] - px * 0.6, c[1] - px * 0.4); ctx.lineTo(c[0] + px * 0.7, c[1] - px * 0.5); ctx.lineTo(c[0] + px, c[1] + px * 0.5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#3fb8ff'; ctx.strokeStyle = '#0a2a4a'; ctx.lineWidth = Math.max(1, R.kk() * 0.5); ctx.beginPath(); ctx.moveTo(c[0] - px * 0.45, c[1]); ctx.lineTo(c[0] - px * 0.1, c[1] - px * 1.3); ctx.lineTo(c[0] + px * 0.5, c[1]); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e6f8ff'; ctx.fillRect(c[0] - px * 0.08, c[1] - px * 0.8, Math.max(1, px * 0.16), px * 0.5); }
  // a boulder: rust red, lit from the upper left
  function boulder(i){ var q = R.at(i), x = q[0], y = q[1], rad = T * 0.42, c = P(x, y, DECK + rad * 0.8), e = P(x + rad, y, DECK + rad * 0.8), px = Math.max(2, Math.abs(e[0] - c[0]));
    disc(x + T * 0.06, y + T * 0.08, null, rad, 'rgba(0,0,0,0.3)');
    var gr = ctx.createRadialGradient(c[0] - px * 0.35, c[1] - px * 0.35, px * 0.1, c[0], c[1], px); gr.addColorStop(0, '#e8865a'); gr.addColorStop(0.7, '#b84a26'); gr.addColorStop(1, '#5a1a0a');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(c[0], c[1], px, px * 0.85, 0, 0, 7); ctx.fill(); ctx.strokeStyle = '#3a0e06'; ctx.lineWidth = Math.max(1, R.kk() * 0.5); ctx.stroke(); }
  /* THE GAUGE, on the far wall: a pip a breath the suit holds, lit green for what is left (amber at two, red at one),
     and a sample tally beside it. Wall, not floor. */
  function gauge(s, tsec){ var n = Q.full, w = Math.min(Q.W - 2, 1.0 + n * 0.55), x0 = R.x0 + (Q.W / 2 - w / 2) * T, y0 = R.y0 + 0.2 * T, y1 = R.y0 + 0.9 * T, z = DECK + WALLTOP + 0.06;
    var a = R.scr(x0, y0, z), c = R.scr(x0 + w * T, y1, z); ctx.save(); ctx.fillStyle = '#1e1412'; ctx.strokeStyle = '#ff8a4a'; ctx.lineWidth = Math.max(1, R.kk() * 0.8);
    ctx.fillRect(a[0], a[1], c[0] - a[0], c[1] - a[1]); ctx.strokeRect(a[0], a[1], c[0] - a[0], c[1] - a[1]);
    var pw = (c[0] - a[0]) / (n + 1.6), ph = (c[1] - a[1]) * 0.5, col = s.a <= 1 ? '#ff4a3a' : s.a <= 2 ? '#ffb347' : '#3fd07a', pul = R.reduce || s.a > 1 ? 1 : 0.6 + 0.4 * Math.sin(tsec * 6);
    for (var k = 0; k < n; k++){ ctx.globalAlpha = k < s.a ? pul : 1; ctx.fillStyle = k < s.a ? col : '#3a2a26'; ctx.fillRect(a[0] + pw * (0.4 + k), a[1] + ph * 0.5, pw * 0.7, ph); }
    ctx.globalAlpha = 1; var got = 0; for (var j = 0; j < Q.samples.length; j++) if (s.k & (1 << j)) got++;
    ctx.font = '700 ' + Math.round(ph * 1.2) + 'px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = got === Q.samples.length ? '#9cff8a' : '#7fd8ff'; ctx.fillText(got + '/' + Q.samples.length, a[0] + pw * (n + 0.75), (a[1] + c[1]) / 2);
    ctx.restore(); }
  return {
    lay:function(s){ s0 = s; anim = {}; },
    move:function(m, u){ anim[m[1] + m[0]] = { u:u };
      if (u >= 1 && m[0] === 'tank'){ var q = R.at(m[1]); R.burst(q[0], q[1], DECK + 0.8, ['#c8ffd8', '#ffffff'], 10, 0.9, 0.7); R.sfx('blip'); }
      if (u >= 1 && m[0] === 'sample'){ var q2 = R.at(m[1]); R.burst(q2[0], q2[1], DECK + 0.3, ['#7fd8ff', '#ffffff'], 8, 0.8, 0.6); } },
    things:function(ds, tsec){ if (!s0) return; var s = s0;
      Object.keys(Q.rock).forEach(function(i){ var q = R.at(+i); ds.push({ x:q[0], y:q[1], kd:function(){ boulder(+i); } }); });
      Q.tanks.forEach(function(i, b){ var q = R.at(i); ds.push({ x:q[0], y:q[1], kd:function(){ tank(i, !!(s.t & (1 << b)), tsec); } }); });
      Q.samples.forEach(function(i, b){ if (s.k & (1 << b)) return; var q = R.at(i); ds.push({ x:q[0], y:q[1], kd:function(){ sample(i, tsec); } }); }); },
    hot:function(){ return []; },
    ground:function(tsec){ if (s0) gauge(s0, tsec); } }; }

root.RTT_GYMKIND_AIR = { id:'air', gyms:GYMS, input:'step', calm:true, unit:'step', hello:'Every step uses a breath of air. A tank fills you up once.',
  parse:parse, init:init, key:key, act:act, step:act, moves:moves, proof:proof, enc:enc, goal:goal,
  me:function(G, s){ return s.p; }, place:function(G, s, i){ return { p:i, a:s.a, t:s.t, k:s.k }; },
  deck:function(G, s, i){ var Q = parse(G); return Q.cell[i] !== '#' && !Q.rock[i]; },
  tell:{ shut:'The vault stays shut. A sample is still out there.', out:'Out of air. Undo it, or Restart.', fill:'Full tank. That one is empty now.', stuck:'Not enough air to finish. Undo it, or Restart.' },
  dur:function(how){ return how === 'slide' ? 0.3 : 0.15; },
  floor:floor, mats:mats, view:view };
})();
