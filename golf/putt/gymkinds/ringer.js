/* golf/putt/gymkinds/ringer.js: the BELL LOFT kind of trail gym (RTT_GYMKIND_RINGER), Notre-Dame's. A kind file: the registry
   (gyms.js, its KINDS README) finds it by its global, the frame (trail.js) plays it, check-putt proves it.

   THE PUZZLE is Quasimodo's, up among the bells. The loft's floor of old oak boards is broken by open shafts where the ropes drop
   to the ringing chamber below, and every bell has to be rung before the chest under the far wall (the vault) will open. A bell is
   rung by riding it: step onto its rope and the bell swings, and carries him SWING tiles the way it is set, clean over a shaft or
   two, to set him down on the boards there. Then it swings back the other way, so the next ride on the same rope carries him
   back. A swing that would set him down anywhere but on the boards (in a shaft, against a beam or a wall) the bell will not
   make, and he does not step. So the read is which way each bell is set, and the order to ride them in so each one is set the
   way it is wanted when he gets to it.

   THE GATEKEEPER'S TWIST is the Himalayas' slope, as the steep lead roof between the towers: step onto the lead and he slides
   straight down it (toward the near wall) until the boards hold him, and a slide goes right over a narrow gap in the leads where a
   step never could. A slide that cannot stop anywhere is no step. So the roof is a one way road down, and the only way across its
   gaps.

   He moves TILE BY TILE (a step kind).

   THE LAYOUTS ARE HAND DESIGNED, never random. Row 0 is the far wall (the top of the screen), the last row the near wall with the
   gate in it. The frame's five characters (# G @ L C, gyms.js) and this kind's own:
     .  the boards        x  an open shaft (no standing; a swing or a slide goes over it)        o  an oak beam (in the way)
     ^ > v <  a bell's rope, the bell set to swing that way first        l  the lead roof (the gatekeeper's: he slides down it)
   THE STATE is { p, d, r }: his tile, the bells turned about (a bit each: set the other way from the start) and the bells rung (a
   bit each). A few hundred states, so solve() and audit() are the registry's own breadth first search (lib), and stuck() is looked
   up from one search of every state. */
(function(){
var root = typeof window !== 'undefined' ? window : globalThis;
var LIB = function(){ return root.RTT_PUTT_GYMS.lib; };

/* THE GYMS. moves and proof are the solver's fewest steps and one shortest solution (U R D L), recorded from solve().
   The civilian's lines nudge, never solve. */
var GYMS = [
  /* THE BELL LOFT, mid-world: the north tower's loft, its floor broken by the shafts, and three bells to ring. The lesson is the
     kind's one rule: a bell carries you the way it is set, and then it is set the other way. */
  { id:'nd1', kind:'ringer', world:'notredame', leg:9, name:'The Bell Loft', badge:'Bell Loft Badge', mech:['bell'], pay:500, look:{ wall:'stone' },
    moves:25, proof:'UURRRURDLLLLLULLDLRRURLLU',
    who:{ look:{ skin:'light', polo:'brown', hat:'brown', pants:'brown', hair:'brown', hairStyle:'short', cap:true, shoes:'brown', gender:'male' } },
    say:['Step onto a rope and the bell swings you over the shafts. Then it swings back.',
      'Each bell is set to swing one way. After a ride it is set the other way.',
      'A bell will not drop you in a shaft. If it cannot set you down, it does not swing.'],
    rows:[
      '#####C#####',
      '#.o.....o.#',
      '#...v.....#',
      '#xxxxxxxxx#',
      '#....x.^.^#',
      '#v.>.x....#',
      '#xxxxxxxxx#',
      '#xxxxxxxxx#',
      '#.^.....^.#',
      '#.........#',
      '#L...@....#',
      '#####G#####'
    ] },
  /* THE LEADS, the gatekeeper: the roof between the towers, the steep leads with their gaps, and the bells of the south tower over
     them, and a bell in the top loft that sends him back down. The bells swing him up and across; the leads slide him down. It cannot be solved with the leads walked like the boards.
     Its hint is the one idea the room turns on, and nothing more. */
  { id:'nd2', kind:'ringer', world:'notredame', leg:18, name:'The Leads', badge:'Bell-Ringer Badge', mech:['bell', 'slope'], pay:1000, keeper:true, look:{ wall:'stone' },
    hint:'A step can never cross a gap in the leads. A slide down them goes straight over one.',
    moves:28, proof:'RRRUULUURLLDLDRDRRUURULLLLUU',
    who:{ look:{ skin:'light', polo:'red', hat:'red', pants:'black', hair:'black', hairStyle:'bun', cap:true, shoes:'brown', gender:'female' } },
    say:['The lead is steep. Step onto it and you slide down till the boards hold you.',
      'You cannot climb the lead. The bells are the way up.',
      'Look down the roof from each bell. Where would a slide take you?'],
    rows:[
      '#####C#####',
      '#..o..v...#',
      '#.........#',
      '#xxxxxxxxx#',
      '#llll...^.#',
      '#llll.<..^#',
      '#llll.....#',
      '#llllxxxxx#',
      '#xxxxxxxxx#',
      '#.>.x.o^.^#',
      '#oooo..o..#',
      '#L...@....#',
      '#####G#####'
    ] }
];

var DIRC = '^>v<', SWING = 3;
var PARSED = {};
function parse(G){ if (PARSED[G.id]) return PARSED[G.id]; var bells = [];
  var Q = LIB().room(G, function(ch, i){ if (DIRC.indexOf(ch) >= 0) bells.push([i, DIRC.indexOf(ch)]); else if ('xol'.indexOf(ch) < 0) return false; });
  Q.bells = bells.map(function(b){ return b[0]; }); Q.set = bells.map(function(b){ return b[1]; }); Q.full = (1 << bells.length) - 1; return PARSED[G.id] = Q; }
function init(G){ var Q = parse(G); return { p:Q.start, d:0, r:0 }; }
function key(s){ return s.p + ':' + s.d + ':' + s.r; }
// the way bell k is set in state s (0 up, 1 right, 2 down, 3 left)
function setOf(Q, s, k){ return (s.d >> k & 1) ? (Q.set[k] + 2) % 4 : Q.set[k]; }
// boards to stand on (and a rope is boards too, where he stands when he is not riding it)
function boards(Q, i){ if (i < 0) return false; var ch = Q.cell[i]; return ch === '.' || DIRC.indexOf(ch) >= 0; }
// can a swing or a slide pass over tile i (anything but a wall, a beam or one of the frame's tiles)
function over(Q, i){ if (i < 0) return false; var ch = Q.cell[i]; return ch === '.' || ch === 'x' || ch === 'l' || DIRC.indexOf(ch) >= 0; }
/* DOWN THE LEADS from tile i: straight toward the near wall over lead and gaps until the boards hold him. The tiles passed (the
   last is where he stops), or null when the slide can find nowhere to stop. */
function slide(Q, i){ var L = LIB(), out = [], at = i, guard = 0;
  while (guard++ < 30){ var ch = Q.cell[at]; if (ch === '.') return out; if (ch !== 'l' && ch !== 'x') return out;
    var m = L.nb(Q, at, 2); if (!over(Q, m)) return ch === 'l' ? out : null; out.push(m); at = m; if (DIRC.indexOf(Q.cell[m]) >= 0) return null; }
  return null; }
/* ONE STEP. The frame's tiles first (the gate, the lever, the vault, shut till every bell is rung). Onto a rope, the bell swings
   him SWING tiles the way it is set, over anything but a wall or a beam, to boards or lead; it is then set the other way, and it
   is rung. Onto the lead, or set down on it, he slides down it till the boards hold him. A step into a shaft or a beam is none. */
function act(G, s, dir){ var Q = parse(G), L = LIB(), n = L.nb(Q, s.p, dir);
  if (n >= 0 && n === Q.chest && s.r !== Q.full) return { s:s, ev:'shut', moves:[] };
  var fr = L.frameStep(G, Q, s, s.p, dir, init); if (fr) return fr;
  if (n < 0) return { s:s, ev:'bump', moves:[] };
  var ch = Q.cell[n], mv = [['me', s.p, n, 'walk']], at = n, d = s.d, r = s.r, ev = 'step', k = Q.bells.indexOf(n);
  if (ch === 'x' || ch === 'o') return { s:s, ev:'bump', moves:[] };
  if (k >= 0){ var w = setOf(Q, s, k), q = n, ok = true; for (var j = 0; j < SWING; j++){ q = L.nb(Q, q, w); if (!over(Q, q)){ ok = false; break; } }
    if (!ok || !(boards(Q, q) || Q.cell[q] === 'l') || Q.bells.indexOf(q) >= 0) return { s:s, ev:'still', moves:[] };
    mv.push(['bell', k, w, 'ring']); mv.push(['me', n, q, 'swing']); at = q; d = d ^ (1 << k); r = r | (1 << k); ev = 'ring'; }
  if (Q.cell[at] === 'l'){ var sl = slide(Q, at); if (!sl) return { s:s, ev:'slip', moves:[] };
    var from = at; sl.forEach(function(t){ mv.push(['me', from, t, 'slide']); from = t; }); if (sl.length){ at = sl[sl.length - 1]; if (ev === 'step') ev = 'slide'; } }
  if (at === s.p && d === s.d && r === s.r) return { s:s, ev:'bump', moves:[] };
  return { s:{ p:at, d:d, r:r }, ev:ev, moves:mv }; }
function moves(){ return [0, 1, 2, 3]; }
/* STUCK, looked up: every state a player can reach is searched once (lib.explore), and those the vault can still be reached from
   without the lever are kept; any other state is stuck. */
var GOOD = {};
function goodOf(G){ if (GOOD[G.id]) return GOOD[G.id]; var K = root.RTT_GYMKIND_RINGER, X = LIB().explore(K, G), N = X.list.length, back = [], i, ok = {};
  for (i = 0; i < N; i++) back.push([]); X.edges.forEach(function(e){ if (!e[2]) back[e[1]].push(e[0]); });
  var good = new Uint8Array(N), q = X.wins.map(function(w){ return w[0]; }); q.forEach(function(w){ good[w] = 1; });
  for (var hh = 0; hh < q.length; hh++) back[q[hh]].forEach(function(pp){ if (!good[pp]){ good[pp] = 1; q.push(pp); } });
  for (i = 0; i < N; i++) if (good[i]) ok[key(X.list[i])] = 1; return GOOD[G.id] = ok; }
function stuck(G, s){ return !goodOf(G)[key(s)]; }
function proof(G){ return (G.proof || '').split('').map(function(ch){ return 'URDL'.indexOf(ch); }); }
function enc(path){ return path.map(function(d){ return 'URDL'.charAt(d); }).join(''); }
function goal(){ return 'Ring every bell. Then reach the chest.'; }

/* ---- THE LOOK: the loft's floor is old oak boards, a shaft a dark square hole with the rope's light far below, a beam a squared
   post of oak, and the lead roof grey with its seams running down it. Each bell hangs over its rope, bronze, drawn back the way it
   will not swing so it leans ready to go, with a gold arrow on the boards under it the way it is set; a bell rung has its gold
   band lit. */
var DECK = 0.45;
function floor(gc){ if (gc.k === '#') return null; var sh = gc.k === 'x';
  return { h:sh ? DECK - 0.9 : DECK, mat:['ndgfloor', { gu:gc.u, gv:gc.v, wk:sh ? 1 : gc.k === 'l' ? 2 : 0 }] }; }
function mats(){ return {
  ndgfloor:['', '', '', 0, function(c, R, h3){ var u = c.gu || 0, v = c.gv || 0, k = c.wk || 0, n = h3(c.ti, c.tj, 391);
    if (c.dt < 0) return R(k === 1 ? '#0c0a10' : '#3a2a1a');
    if (k === 1) return R(Math.hypot(u - 0.5, v - 0.5) < 0.12 ? '#c8a868' : '#14101a');
    if (k === 2){ if (Math.abs(((u * 4) % 1) - 0.5) < 0.06) return R('#4a4e58'); return R(n > 0.92 ? '#a8acb8' : n < 0.3 ? '#6a6e7a' : '#7a7e8a'); }
    if (u < 0.03 || u > 0.97 || v < 0.03 || v > 0.97) return R('#2a1c10'); var pl = Math.floor(u * 3) % 2; return R(n > 0.95 ? '#8a6a3e' : pl ? '#6a4a2a' : '#7a5632'); }] }; }

function beamFn(B){ B.solid(-0.75, -0.75, 0, 0.75, 0.75, 1.9, function(x, y, z){ var ax = Math.abs(x), ay = Math.abs(y); if (ax > 0.42 || ay > 0.42) return null;
    if (z > 1.7) return '#4a3018'; return Math.sin(z * 18 + x * 4) > 0.75 ? '#5a3a20' : ax > 0.36 || ay > 0.36 ? '#5a3a20' : '#7a5232'; }, 0.06); }
// a bell on its rope, leaning a little toward the way it is drawn back (the sprite is drawn shifted on the board)
function bellFn(rung){ return function(B){ B.solid(-0.8, -0.8, 0, 0.8, 0.8, 2.6, function(x, y, z){ var r = Math.hypot(x, y);
    if (z > 2.05) return r < 0.06 ? '#e0c890' : null;   // the rope going up to the yoke
    if (z > 1.95) return r < 0.16 ? '#8a5a1e' : null;   // the crown's loops
    if (z < 0.8) return null; var f = (z - 0.8) / 1.15, w = 0.66 - 0.36 * Math.pow(f, 0.7) + (f < 0.12 ? (0.12 - f) * 0.9 : 0); if (r > w) return null;
    if (z < 0.9) return r > w - 0.12 ? '#f4d080' : '#1a0e06';   // the bright flared rim, the dark mouth
    if (Math.abs(z - 1.15) < 0.05 || Math.abs(z - 1.7) < 0.04) return rung ? '#fff4b0' : '#7a4e18';   // the bands, lit once rung
    return x - y > 0.25 ? '#f0c060' : x - y < -0.25 ? '#a0682a' : '#c8903c'; }, 0.05); }; }
function view(R){ var Q = R.Q, T = R.T, ctx = R.ctx, s0 = null, swing = null, spB = R.sprite('gymndbeam', beamFn, 1.5, 1.5, 1.9), spL = [R.sprite('gymndbell0', bellFn(false), 1.6, 1.6, 2.6), R.sprite('gymndbell1', bellFn(true), 1.6, 1.6, 2.6)];
  var DV = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  function P(x, y, z){ return R.scr(x, y, z); }
  // the gold arrow on the boards under a bell, the way it is set
  function arrow(i, w){ var c = R.at(i), d = DV[w], h = T * 0.32, z = DECK + 0.02, a = P(c[0] - d[0] * h, c[1] - d[1] * h, z), b = P(c[0] + d[0] * h, c[1] + d[1] * h, z),
      l = P(c[0] + d[0] * h * 0.2 - d[1] * h * 0.5, c[1] + d[1] * h * 0.2 + d[0] * h * 0.5, z), rr = P(c[0] + d[0] * h * 0.2 + d[1] * h * 0.5, c[1] + d[1] * h * 0.2 - d[0] * h * 0.5, z);
    ctx.strokeStyle = 'rgba(232,192,96,.9)'; ctx.lineWidth = Math.max(1.5, R.kk() * 0.9); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.moveTo(l[0], l[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(rr[0], rr[1]); ctx.stroke(); }
  return {
    lay:function(s){ s0 = s; swing = null; },
    move:function(m, u){ if (m[0] !== 'bell') return; swing = u < 1 ? [m[1], m[2], u] : null; if (u >= 1){ var w = R.at(Q.bells[m[1]]); R.burst(w[0], w[1], DECK + 1.6, ['#fff0a0', '#e8c070', '#ffffff'], 14, 0.9, 0.8); R.sfx('blip'); } },
    things:function(ds){ if (!s0) return; var s = s0;
      for (var i = 0; i < Q.cell.length; i++){ (function(i){ var ch = Q.cell[i], w = R.at(i), k = Q.bells.indexOf(i);
        if (ch === 'o') ds.push({ x:w[0], y:w[1], kd:function(){ R.drawSprite(spB, w[0], w[1], DECK); } });
        else if (k >= 0){ var sw = setOf(Q, s, k), off = -0.22, d = DV[sw];
          if (swing && swing[0] === k){ d = DV[swing[1]]; off = -0.22 + Math.sin(swing[2] * Math.PI) * 0.6; }
          var bx = w[0] + d[0] * off * T, by = w[1] + d[1] * off * T; ds.push({ x:bx, y:by, kd:function(){ R.drawSprite(spL[s.r >> k & 1], bx, by, DECK); } }); } })(i); } },
    ground:function(){ if (!s0) return; for (var k = 0; k < Q.bells.length; k++) arrow(Q.bells[k], setOf(Q, s0, k)); },
    hot:function(){ return []; } }; }

root.RTT_GYMKIND_RINGER = { id:'ringer', gyms:GYMS, input:'step', calm:true, unit:'step', hello:'Step onto a rope and the bell swings you. Then it swings back.',
  parse:parse, init:init, key:key, act:act, step:act, moves:moves, stuck:stuck, proof:proof, enc:enc, goal:goal, setOf:setOf,
  me:function(G, s){ return s.p; }, place:function(G, s, i){ return { p:i, d:s.d, r:s.r }; },
  deck:function(G, s, i){ var Q = parse(G); return boards(Q, i) || Q.cell[i] === 'l' || i === Q.lever; },
  tell:{ ring:'The bell swings you over. Now it is set the other way.', still:'The bell will not swing you there.', slide:'The lead is steep. You slide down it.', slip:'Too steep there. Nothing would hold you.', shut:'Not yet. Ring every bell first.',
    stuck:'There is no way to set the bells right from here. Undo it, or Restart.' },
  dur:function(how){ return how === 'swing' ? 0.32 : how === 'slide' ? 0.09 : how === 'ring' ? 0.2 : 0.15; },
  floor:floor, mats:mats, view:view };
})();
