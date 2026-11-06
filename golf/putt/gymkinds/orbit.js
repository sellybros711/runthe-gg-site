/* golf/putt/gymkinds/orbit.js: the RING STATION kind of trail gym (RTT_GYMKIND_ORBIT), Saturn Rings'. A kind file: the
   registry (gyms.js, its KINDS README) finds it by its global, the frame (trail.js) plays it, check-putt proves it.

   THE PUZZLE. The station's decks turn. Each turntable is a round section of floor, three tiles across, with bulkheads
   standing on it and ring shards lying on it. Step onto a turntable's switch (a gold plate on the deck beside it) and
   the whole section turns a quarter, clockwise, with everything on it. The vault opens once every ring shard is picked
   up. So the way across is made, not found: the bulkheads that block the way one turn are the way through the next,
   and a shard riding the section comes round to a side he can reach. He is never on a section while it turns (its
   switch is off it), so nothing he stands on moves under him.

   THE GATEKEEPER'S TWIST is the Ice Age slide, as ring ice: step onto the ice and he slides on in that line until
   something stops him (a wall, a bulkhead, or the deck at the ice's edge, where he stops on the first tile off it).

   He moves TILE BY TILE (a step kind: the stick, the arrows, the pad, or a tap toward a tile).

   THE LAYOUTS ARE HAND DESIGNED, never random. Row 0 is the far wall (the top of the screen), the last row the near
   wall with the gate in it. The frame's five characters (# G @ L C, gyms.js) and this kind's own:
     s   a ring shard (picked up as he steps on it; one inside a turntable rides it round)
     w   a bulkhead on a turntable (it turns with the section)
     1 2 the switch of turntable 1 or 2: arriving on it turns that section a quarter clockwise
     =   ring ice (the gatekeeper's): he slides on it
   G.discs lists the turntables' middles, [column, row] each, in the order of their switches. A turntable is the three
   by three block round its middle.

   THE STATE is { p, r, k }: where he stands, the quarter turns of every section (two bits a section) and the shards
   picked up (a bit a shard). A few thousand states at most, so solve() and audit() are the registry's own breadth first
   search (lib), and stuck() its bounded search from the state. */
(function(){
var root = typeof window !== 'undefined' ? window : globalThis;
var LIB = function(){ return root.RTT_PUTT_GYMS.lib; };

/* THE GYMS. moves and proof are the solver's fewest steps and one shortest solution (U R D L), recorded from solve().
   The civilian's lines nudge, never solve. */
var GYMS = [
  /* THE TURNING DECK, mid-world: one turntable between the gate and the vault, a shard in the alcove beside it. The way
     north is open from the start; the alcove opens on one turn, and the way north again on the next, not a turn back. */
  { id:'saturn1', kind:'orbit', world:'saturn', leg:9, name:'The Turning Deck', badge:'Ring Badge', mech:['orbit'], pay:500, look:{ wall:'stone' },
    discs:[[4, 5]], moves:28, proof:'UURRRLLUULLLRRRDDRRLLLUUUUUU',
    who:{ look:{ skin:'medium', polo:'white', hat:'white', pants:'white', hair:'black', hairStyle:'short', cap:true, hatStyle:'ppastrohelmet', top:'ppspacesuit', shoes:'white', gender:'male' } },
    say:['This deck turns. Step on the gold plate and watch what comes round.',
      'The wall that blocks you one turn is the way through the next.',
      'Going back the way it came is not the only way to undo a turn.'],
    rows:[
      '#########',
      '####C####',
      '#.......#',
      '#.......#',
      '###w..###',
      '##sw.w###',
      '###w..###',
      '#......1#',
      '#.......#',
      '###L@####',
      '####G####'
    ] },
  /* THE ICE RING, the gatekeeper: two turntables, three shards (one riding the lower deck) and a hall of ring ice between
     them, whose slide ends on the upper deck's plate. */
  { id:'saturn2', kind:'orbit', world:'saturn', leg:18, name:'The Ice Ring', badge:'Titan Badge', mech:['orbit', 'ice'], pay:1000, keeper:true, look:{ wall:'stone' },
    discs:[[4, 9], [4, 4]], moves:33, proof:'URRLLUUUUULLRRUURLDDLLRLRUULRUURU',
    who:{ look:{ skin:'light', polo:'white', hat:'white', pants:'white', hair:'red', hairStyle:'ponytail', cap:true, hatStyle:'ppastrohelmet', top:'ppspacesuit', shoes:'white', gender:'female' } },
    say:['Two decks, two plates. Each plate only turns its own deck.',
      'The ice takes you a long way for one step. See where it leaves you.',
      'A shard on a deck rides with it. Bring it round before you leave it behind.'],
    hint:'You\'ll go up through the top deck more than once. Each turn of it opens a different way up, to a different shard. Come back down and turn it again.',
    rows:[
      '#########',
      '####C####',
      '#.......#',
      '###...###',
      '##sw..s##',
      '###www###',
      '#2=.=.=.#',
      '#.......#',
      '###www###',
      '###..s.##',
      '###ww.###',
      '#.....1.#',
      '###L@####',
      '####G####'
    ] }
];

var PARSED = {};
/* THE ROOM: the frame's five through lib.room, and the kind's own. Q.sec maps a tile inside a turntable to [section,
   dx, dy] (its place from the middle); Q.wall0 and Q.shard0 say what stood where before any turn; Q.shards lists every
   shard as [tile, section or -1, dx, dy]; Q.sw maps a switch tile to its section; Q.ice whether a tile is ice. */
function parse(G){ if (PARSED[G.id]) return PARSED[G.id]; var raw = {}, sw = {}, ice = {};
  var Q = LIB().room(G, function(ch, i){ if (ch === 's' || ch === 'w'){ raw[i] = ch; return; } if (ch === '1' || ch === '2'){ sw[i] = +ch - 1; return; } if (ch === '=') { ice[i] = 1; return; } return false; });
  var sec = {}, wall0 = {}, shards = [];
  (G.discs || []).forEach(function(d, k){ for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++){ var i = (d[1] + dy) * Q.W + d[0] + dx; sec[i] = [k, dx, dy]; } });
  Object.keys(raw).forEach(function(t){ var i = +t, c = raw[i], q = sec[i]; Q.cell[i] = '.';
    if (c === 'w'){ if (!q) throw new Error(G.id + ': a bulkhead off a turntable at ' + i); wall0[q[0] + ':' + q[1] + ':' + q[2]] = 1; }
    else shards.push(q ? [i, q[0], q[1], q[2]] : [i, -1, 0, 0]); });
  shards.sort(function(a, b){ return a[0] - b[0]; });
  Q.sec = sec; Q.wall0 = wall0; Q.shards = shards; Q.sw = sw; Q.ice = ice; Q.allK = (1 << shards.length) - 1; Q.nd = (G.discs || []).length;
  return PARSED[G.id] = Q; }
function init(G){ var Q = parse(G); return { p:Q.start, r:0, k:0 }; }
function key(s){ return s.p + ':' + s.r + ':' + s.k; }
function rotOf(s, k){ return (s.r >> (k * 2)) & 3; }
// a quarter turn clockwise takes the place (dx, dy) to (-dy, dx), with y down the screen
function turn(dx, dy, n){ for (var j = 0; j < n; j++){ var t = dx; dx = -dy; dy = t; } return [dx, dy]; }
function unturn(dx, dy, n){ for (var j = 0; j < n; j++){ var t = dx; dx = dy; dy = -t; } return [dx, dy]; }
// where a shard is now: off a section, where it lay; on one, turned with it
function shardAt(G, Q, s, j){ var sh = Q.shards[j]; if (sh[1] < 0) return sh[0]; var d = G.discs[sh[1]], q = turn(sh[2], sh[3], rotOf(s, sh[1])); return (d[1] + q[1]) * Q.W + d[0] + q[0]; }
// a bulkhead stands on tile i now (only ever on a turntable)
function wallAt(Q, s, i){ var q = Q.sec[i]; if (!q) return false; var o = unturn(q[1], q[2], rotOf(s, q[0])); return !!Q.wall0[q[0] + ':' + o[0] + ':' + o[1]]; }
function blocked(Q, s, n){ return n < 0 || Q.cell[n] === '#' || wallAt(Q, s, n) || n === Q.gate || n === Q.lever || n === Q.chest; }
// arriving on tile n: a shard there is picked up, a switch turns its section
function land(G, Q, s, n){ var k = s.k, r = s.r, mv = [];
  for (var j = 0; j < Q.shards.length; j++) if (!(k & (1 << j)) && shardAt(G, Q, s, j) === n){ k |= 1 << j; mv.push(['shard', n, n, 'take']); }
  var sw = Q.sw[n]; if (sw != null){ var cur = (r >> (sw * 2)) & 3; r = (r & ~(3 << (sw * 2))) | (((cur + 1) & 3) << (sw * 2)); mv.push(['deck', sw, cur, 'turn']); }
  return { s:{ p:n, r:r, k:k }, mv:mv }; }

/* ONE STEP. The frame's tiles first (the gate, the lever); the vault opens with every shard in hand; a bulkhead stops
   him; onto ice he slides on until the next tile would stop him or he is off the ice. */
function act(G, s, d){ var Q = parse(G), L = LIB(), n = L.nb(Q, s.p, d);
  if (n === Q.chest) return s.k === Q.allK ? { s:s, ev:'open', moves:[] } : { s:s, ev:'shut', moves:[] };
  var f = L.frameStep(G, Q, s, s.p, d, init); if (f) return f;
  if (wallAt(Q, s, n)) return { s:s, ev:'bump', moves:[] };
  var p = n, slid = !!Q.ice[n];
  if (slid){ for (;;){ var m = L.nb(Q, p, d); if (blocked(Q, s, m)) break; p = m; if (!Q.ice[p]) break; } }
  var o = land(G, Q, s, p), mv = [['me', s.p, p, slid ? 'slide' : 'walk']].concat(o.mv);
  return { s:o.s, ev:o.mv.some(function(m){ return m[0] === 'deck'; }) ? 'turn' : o.s.k !== s.k ? 'take' : slid ? 'slide' : 'step', moves:mv }; }
function moves(){ return [0, 1, 2, 3]; }
function proof(G){ return (G.proof || '').split('').map(function(ch){ return 'URDL'.indexOf(ch); }); }
function enc(path){ return path.map(function(d){ return 'URDL'.charAt(d); }).join(''); }
function goal(G){ return parse(G).shards.length > 1 ? 'Pick up every ring shard, then step into the vault.' : 'Pick up the ring shard, then step into the vault.'; }

/* ---- THE LOOK: the station's lavender deck plates, the turntables a ring of pale ice with a gold rim, ring ice pale blue
   with a sheen, the bulkheads (white blocks with a gold band) and the shards (glinting ice crystals), the switches gold
   plates with an arrow turning clockwise. A turn plays as the section swinging round a quarter. */
var DECK = 0.45, WH = 0.9;
function floor(gc){ if (gc.k === '#') return null; return { h:DECK, mat:[gc.k === '=' ? 'oice' : 'odeck', { gu:gc.u, gv:gc.v }] }; }
function mats(){ return {
  odeck:['', '', '', 0, function(c, R, h3){ var u = c.gu || 0, v = c.gv || 0, n = h3(c.ti, c.tj, 81); if (c.dt < 0 || u < 0.04 || u > 0.96 || v < 0.04 || v > 0.96) return R('#4a4470');
    if (u < 0.12 || v < 0.12) return R('#9a94cc'); if (u > 0.88 || v > 0.88) return R('#5e5890'); return R(n < 0.1 ? '#6c66a6' : '#7670b0'); }],
  oice:['', '', '', 0, function(c, R, h3){ var u = c.gu || 0, v = c.gv || 0, n = h3(c.ti, c.tj, 83); if (c.dt < 0) return R('#7fb8d8');
    if (Math.abs(u - v) < 0.06 && u > 0.2 && u < 0.6) return R('#ffffff'); if (u < 0.04 || u > 0.96 || v < 0.04 || v > 0.96) return R('#9fd0e8'); return R(n < 0.3 ? '#d8f0fa' : '#c8e6f4'); }] }; }

function view(R){ var Q = R.Q, T = R.T, ctx = R.ctx, G = Q.G, s0 = null, swing = {};
  function P(x, y, z){ return R.scr(x, y, z == null ? DECK + 0.015 : z); }
  function mid(k){ var d = G.discs[k], i = d[1] * Q.W + d[0], q = R.at(i); return q; }
  // the angle a section stands at now: while it turns, swinging from where it was to a quarter on
  function ang(k, s){ var w = swing[k]; if (w) return (w.from + w.u) * Math.PI / 2; return rotOf(s, k) * Math.PI / 2; }
  function spot(k, dx, dy, a){ var c = mid(k), ca = Math.cos(a), sa = Math.sin(a); return [c[0] + (dx * ca - dy * sa) * T, c[1] + (dx * sa + dy * ca) * T]; }
  // the turntable's disc on the deck: pale ring ice inside a gold rim, three ticks so its turn reads
  function plate(k, s, tsec){ var c = mid(k), a = ang(k, s), n = 40, rr = T * 1.45, j;
    ctx.fillStyle = '#b8d4f0'; ctx.beginPath(); for (j = 0; j <= n; j++){ var t = j / n * 6.283, p = P(c[0] + Math.cos(t) * rr, c[1] + Math.sin(t) * rr); j ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); } ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = Math.max(2, R.kk() * 1.2); ctx.stroke();
    ctx.strokeStyle = 'rgba(90,110,170,0.7)'; ctx.lineWidth = Math.max(1, R.kk() * 0.6);
    for (j = 0; j < 4; j++){ var ta = a + j * Math.PI / 2 + Math.PI / 4, p1 = P(c[0] + Math.cos(ta) * rr * 0.55, c[1] + Math.sin(ta) * rr * 0.55), p2 = P(c[0] + Math.cos(ta) * rr * 0.9, c[1] + Math.sin(ta) * rr * 0.9);
      ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke(); }
    var hub = P(c[0], c[1]); ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.arc(hub[0], hub[1], Math.max(2, R.kk() * 1.6), 0, 7); ctx.fill(); }
  // a bulkhead: a white block standing on its section, a gold band round it
  function bulk(x, y){ var hw = T * 0.44, b0 = P(x - hw, y + hw), b1 = P(x + hw, y + hw), t0 = P(x - hw, y + hw, DECK + WH), top0 = P(x - hw, y - hw, DECK + WH), top1 = P(x + hw, y - hw, DECK + WH), t1 = P(x + hw, y + hw, DECK + WH);
    ctx.fillStyle = '#d8dcec'; ctx.fillRect(b0[0], t0[1], b1[0] - b0[0], b0[1] - t0[1]);
    var band = P(x - hw, y + hw, DECK + WH * 0.55); ctx.fillStyle = '#ffd34d'; ctx.fillRect(b0[0], band[1] - R.kk(), b1[0] - b0[0], Math.max(2, R.kk() * 2));
    ctx.fillStyle = '#f4f6fc'; ctx.beginPath(); ctx.moveTo(top0[0], top0[1]); ctx.lineTo(top1[0], top1[1]); ctx.lineTo(t1[0], t1[1]); ctx.lineTo(t0[0], t0[1]); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#4a4470'; ctx.lineWidth = Math.max(1, R.kk() * 0.5); ctx.stroke(); ctx.strokeRect(b0[0], t0[1], b1[0] - b0[0], b0[1] - t0[1]); }
  // a ring shard: a pale blue ice crystal, glinting
  function shard(x, y, tsec, j){ var c = P(x, y, DECK + T * 0.35), e = P(x + T * 0.3, y, DECK + T * 0.35), px = Math.max(2, Math.abs(e[0] - c[0]));
    var g = R.reduce ? 0.35 : 0.3 + 0.15 * Math.sin(tsec * 2.6 + j); ctx.fillStyle = 'rgba(190,230,255,' + g.toFixed(3) + ')'; ctx.beginPath(); ctx.arc(c[0], c[1], px * 1.6, 0, 7); ctx.fill();
    ctx.fillStyle = '#9fd8ff'; ctx.strokeStyle = '#2a4a7a'; ctx.lineWidth = Math.max(1, R.kk() * 0.5);
    ctx.beginPath(); ctx.moveTo(c[0], c[1] - px * 1.4); ctx.lineTo(c[0] + px * 0.7, c[1]); ctx.lineTo(c[0], c[1] + px * 0.6); ctx.lineTo(c[0] - px * 0.7, c[1]); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(c[0] - px * 0.15, c[1] - px * 0.9, Math.max(1, px * 0.2), px * 0.6); }
  // a switch: a gold plate on the deck, a curved arrow on it turning clockwise, the number of its section
  function swPlate(i, k, tsec){ var q = R.at(i), x = q[0], y = q[1], hw = T * 0.36, a = P(x - hw, y - hw), b = P(x + hw, y + hw);
    ctx.fillStyle = '#c8a040'; ctx.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); ctx.strokeStyle = '#ffe48a'; ctx.lineWidth = Math.max(1, R.kk() * 0.7); ctx.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
    var c = P(x, y), rr = Math.abs(b[0] - a[0]) * 0.3, sp = R.reduce ? 0 : tsec * 1.2; ctx.strokeStyle = '#3a2a10'; ctx.lineWidth = Math.max(1.5, R.kk());
    ctx.beginPath(); ctx.arc(c[0], c[1], rr, sp, sp + 4.6); ctx.stroke(); var ea = sp + 4.6, ex = c[0] + Math.cos(ea) * rr, ey = c[1] + Math.sin(ea) * rr;
    ctx.fillStyle = '#3a2a10'; ctx.beginPath(); ctx.moveTo(ex + Math.cos(ea + 1.57) * rr * 0.6, ey + Math.sin(ea + 1.57) * rr * 0.6); ctx.lineTo(ex - Math.cos(ea) * rr * 0.4, ey - Math.sin(ea) * rr * 0.4); ctx.lineTo(ex + Math.cos(ea) * rr * 0.4, ey + Math.sin(ea) * rr * 0.4); ctx.fill();
    if (Q.nd > 1){ ctx.font = '700 ' + Math.max(8, Math.round(rr * 1.1)) + 'px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ffffff'; ctx.fillText(String(k + 1), c[0], c[1]); } }
  return {
    lay:function(s){ s0 = s; swing = {}; },
    move:function(m, u){ if (m[0] === 'deck'){ swing[m[1]] = { u:u, from:m[2] }; if (u >= 1){ var c = mid(m[1]); R.burst(c[0], c[1], DECK + 0.3, ['#ffe48a', '#ffffff'], 8, 0.7, 0.5); R.sfx('blip'); } }
      if (u >= 1 && m[0] === 'shard'){ var q = R.at(m[1]); R.burst(q[0], q[1], DECK + 0.3, ['#9fd8ff', '#ffffff'], 8, 0.8, 0.6); } },
    things:function(ds, tsec){ if (!s0) return; var s = s0;
      for (var k = 0; k < Q.nd; k++){ var a = ang(k, s);
        Object.keys(Q.wall0).forEach(function(t){ var p = t.split(':'); if (+p[0] !== k) return; var w = spot(k, +p[1], +p[2], a); ds.push({ x:w[0], y:w[1], kd:function(){ bulk(w[0], w[1]); } }); }); }
      Q.shards.forEach(function(sh, j){ if (s.k & (1 << j)) return; var w; if (sh[1] < 0) w = R.at(sh[0]); else w = spot(sh[1], sh[2], sh[3], ang(sh[1], s)); ds.push({ x:w[0], y:w[1], kd:function(){ shard(w[0], w[1], tsec, j); } }); }); },
    hot:function(){ return []; },
    ground:function(tsec){ if (!s0) return; for (var k = 0; k < Q.nd; k++) plate(k, s0, tsec); Object.keys(Q.sw).forEach(function(t){ swPlate(+t, Q.sw[t], tsec); }); } }; }

root.RTT_GYMKIND_ORBIT = { id:'orbit', gyms:GYMS, input:'step', calm:true, unit:'step', hello:'Step on a gold plate and its deck turns a quarter. Bring every shard round.',
  parse:parse, init:init, key:key, act:act, step:act, moves:moves, proof:proof, enc:enc, goal:goal,
  me:function(G, s){ return s.p; }, place:function(G, s, i){ return { p:i, r:s.r, k:s.k }; },
  deck:function(G, s, i){ var Q = parse(G); return Q.cell[i] !== '#' && !wallAt(Q, s, i); },
  tell:{ shut:'The vault stays shut. A shard is still out there.', turn:'The deck turns a quarter.', stuck:'No way to finish from here. Undo it, or Restart.' },
  dur:function(how){ return how === 'slide' ? 0.3 : how === 'turn' ? 0.45 : 0.15; },
  floor:floor, mats:mats, view:view };
})();
