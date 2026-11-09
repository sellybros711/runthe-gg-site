/* golf/putt/gymkinds/obol.js: the OBOL kind of trail gym (RTT_GYMKIND_OBOL), the Underworld's. A kind file: the registry
   (gyms.js, its KINDS README) finds it by its global, the frame (trail.js) plays it, check-putt proves it.

   THE PUZZLE. He is on the banks of the Styx, and the river cuts the cavern into islands. He cannot walk on the water. Charon's
   boat crosses between landings marked with the same letter, and Charon takes ONE OBOL, the old silver coin, for every crossing.
   Obols lie about the islands and he picks one up as he steps on it. Step onto a landing with a coin in his purse and Charon rows
   him straight across to the other landing of that letter, and the coin is spent; with an empty purse he only stands on the boards.
   The vault is on the far island. So the puzzle is the fare: which island to visit for its coins, in what order, and which
   crossing is worth a coin, because a crossing made too soon leaves him somewhere with an empty purse.

   THE GATEKEEPER'S TWIST is Volcano Island's cracked ground, as the brittle earth of the asphodel meadows: he can cross a cracked
   tile once, and as he steps off it the ground falls away into the dark. A way used once is gone. Cerberus sleeps by the vault.

   He moves TILE BY TILE (a step kind). A bump into a wall, the river, a rock or a fallen tile is no step.

   THE LAYOUTS ARE HAND DESIGNED, never random. Row 0 is the far wall (the top of the screen), the last row the near wall with the
   gate in it. The frame's five characters (# G @ L C, gyms.js) and this kind's own:
     ~   the Styx (he cannot walk on it)                         .   the cavern's floor
     a b c d   a landing: Charon rows him to the other landing of the same letter, for an obol
     o   an obol (picked up as he steps on it)                   r   a rock (stops him)
     x   cracked ground (the gatekeeper's): crossed once, it falls away behind him
     K   Cerberus, asleep by the vault (he cannot walk into him)

   THE STATE is { p, k, n, c }: where he stands, the obols picked up (a bit a coin), the coins in his purse, and the cracked tiles
   fallen (a bit a tile). A few thousand states, so solve() and audit() are the registry's own breadth first search (lib). */
(function(){
var root = typeof window !== 'undefined' ? window : globalThis;
var LIB = function(){ return root.RTT_PUTT_GYMS.lib; };

/* THE GYMS. moves and proof are the solver's fewest steps and one shortest solution (U R D L), recorded from solve().
   The civilian's lines nudge, never solve. */
var GYMS = [
  /* THE FERRY LANDING, mid-world: three islands in the Styx, landings on every shore, and fewer obols than landings. */
  { id:'uw1', kind:'obol', world:'underworld', leg:9, name:'The Ferry Landing', badge:'Obol Badge', mech:['obol'], pay:500, look:{ wall:'stone' },
    moves:27, proof:'URRRRULLULUURRDRDLUULLRRRRU',
    who:{ look:{ skin:'light', polo:'navy', hat:'white', pants:'navy', hair:'grey', hairStyle:'short', cap:false, shoes:'black', gender:'male' } },
    say:['Charon takes one obol for every crossing. No coin, no boat.',
      'Count the coins on each island before you cross to it.',
      'A crossing is only worth it if you can pay your way on from there.'],
    rows:[
      '#####C#####',
      '#c........#',
      '#~~~~~~~~~#',
      '#c...~o..r#',
      '#.r..~.r.o#',
      '#..d.~..d.#',
      '#a...~.b..#',
      '#~~~~~~~~~#',
      '#a.....b..#',
      '#.r......o#',
      '#L...@....#',
      '#####G#####'
    ] },
  /* THE GATE OF THE DEAD, the gatekeeper: the islands again, and between them cracked ground that falls away once it is crossed. */
  { id:'uw2', kind:'obol', world:'underworld', leg:18, name:'The Gate of the Dead', badge:'Pomegranate Badge', mech:['obol', 'crack'], pay:1000, keeper:true, look:{ wall:'stone' },
    hint:'Cracked ground holds you once. Gather every obol on this side before you cross it, because there is no way back.',
    moves:30, proof:'URRRRLLLULLLLLUURDRRRRRRRLLLLU',
    who:{ look:{ skin:'light', polo:'wine', hat:'white', pants:'wine', hair:'black', hairStyle:'long', cap:false, shoes:'gold', gender:'female' } },
    say:['Cracked ground holds you once. Then it falls away into the dark.',
      'Every coin costs you a walk. Some walks can only be made once.',
      'Think about the way back before you step on a crack.'],
    rows:[
      '#####C#####',
      '#r..K....b#',
      '#~~~~~~~~~#',
      '#o.r~~~...#',
      '#...xxxx.b#',
      '#c.r~~~d..#',
      '#~~~~~~~~~#',
      '#c..x..d..#',
      '#.r.r....o#',
      '#L...@....#',
      '#####G#####'
    ] }
];

var PARSED = {}, LET = 'abcd';
/* THE ROOM: the frame's five through lib.room, and the kind's own. Q.dock maps a landing tile to the other landing of its letter,
   Q.coin lists the obols, Q.crk lists the cracked tiles (a bit each), Q.rock marks rocks and Cerberus. */
function parse(G){ if (PARSED[G.id]) return PARSED[G.id]; var docks = {}, coin = [], crk = [], rock = {}, dog = -1;
  var Q = LIB().room(G, function(ch, i){ if (ch === '~') return; if (LET.indexOf(ch) >= 0){ (docks[ch] = docks[ch] || []).push(i); return; }
    if (ch === 'o'){ coin.push(i); return; } if (ch === 'x'){ crk.push(i); return; } if (ch === 'r'){ rock[i] = 1; return; } if (ch === 'K'){ rock[i] = 1; dog = i; return; } return false; });
  Q.dock = {}; Q.letter = {}; Object.keys(docks).forEach(function(l){ var d = docks[l]; if (d.length !== 2) throw new Error(G.id + ': landing ' + l + ' needs two ends'); Q.dock[d[0]] = d[1]; Q.dock[d[1]] = d[0]; Q.letter[d[0]] = Q.letter[d[1]] = l; });
  Q.pairs = Object.keys(docks).sort().map(function(l){ return docks[l]; });
  Q.coin = coin; Q.crk = crk; Q.ci = {}; crk.forEach(function(t, j){ Q.ci[t] = j; }); Q.rock = rock; Q.dog = dog;
  return PARSED[G.id] = Q; }
function init(G){ return { p:parse(G).start, k:0, n:0, c:0 }; }
function key(s){ return s.p + ':' + s.k + ':' + s.n + ':' + s.c; }
// can he stand on tile n with the fallen tiles as c
function open(Q, c, n){ if (n < 0) return false; var ch = Q.cell[n]; if (ch === '#' || ch === '~' || Q.rock[n] || n === Q.lever || n === Q.chest || n === Q.gate) return false;
  var j = Q.ci[n]; return j == null || !(c & (1 << j)); }

/* ONE STEP. The frame's tiles first (the gate, the lever, the vault). Then the walk: a cracked tile he leaves falls away; an obol
   he steps on goes in his purse; a landing with a coin in his purse takes him across and the coin is spent. */
function act(G, s, dir){ var Q = parse(G), L = LIB(), n = L.nb(Q, s.p, dir);
  var f = L.frameStep(G, Q, s, s.p, dir, init); if (f) return f;
  if (!open(Q, s.c, n)) return { s:s, ev:'bump', moves:[] };
  var mv = [['me', s.p, n, 'walk']], k = s.k, pn = s.n, c = s.c, ev = 'step', j = Q.coin.indexOf(n), jc = Q.ci[s.p];
  if (jc != null){ c |= 1 << jc; mv.push(['crack', s.p, s.p, 'fall']); ev = 'fall'; }
  if (j >= 0 && !(k & (1 << j))){ k |= 1 << j; pn++; mv.push(['coin', n, n, 'take']); ev = 'take'; }
  if (Q.dock[n] != null){ if (pn > 0){ var to = Q.dock[n]; mv.push(['boat', n, to, 'cast']); mv.push(['me', n, to, 'ride']); return { s:{ p:to, k:k, n:pn - 1, c:c }, ev:'ferry', moves:mv }; }
    if (ev === 'step') ev = 'nofare'; }
  return { s:{ p:n, k:k, n:pn, c:c }, ev:ev, moves:mv }; }
function moves(){ return [0, 1, 2, 3]; }
function proof(G){ return (G.proof || '').split('').map(function(ch){ return 'URDL'.indexOf(ch); }); }
function enc(path){ return path.map(function(d){ return 'URDL'.charAt(d); }).join(''); }
function goal(){ return 'Cross the Styx and reach the vault.'; }

/* ---- THE LOOK: the cavern floor is dark grey stone, the Styx a sunken band of black water with violet glints, a landing a jetty
   of grey boards; a cracked tile is pale asphodel ground with dark cracks, and where it fell a black hole. Charon's boat is a
   long dark skiff; Charon stands in its stern, a grey old man in a dark hooded cloak, his pole in his hands (Virgil's ferryman,
   plain and old, never a skeleton). The obols are small silver coins. Cerberus is a great black dog asleep, three heads on his
   paws. */
var DECK = 0.45;
function floor(gc){ if (gc.k === '#') return null; var k = gc.k === '~' ? 1 : LET.indexOf(gc.k) >= 0 ? 2 : gc.k === 'x' ? 3 : 0;
  return { h:k === 1 ? DECK - 0.3 : DECK, mat:['uwfloor', { gu:gc.u, gv:gc.v, hk:k }] }; }
function mats(){ return {
  uwfloor:['', '', '', 0, function(c, R, h3){ var u = c.gu || 0, v = c.gv || 0, k = c.hk || 0, n = h3(c.ti, c.tj, 97);
    if (k === 1) return R(n > 0.93 ? '#5a5490' : n > 0.6 ? '#22203c' : '#1a1830');
    if (k === 2){ if (c.dt < 0 || v < 0.06 || v > 0.94) return R('#2a2230'); return R(Math.abs(((u * 5) % 1) - 0.5) > 0.44 ? '#3a3038' : n > 0.5 ? '#7a6a5a' : '#6a5a4c'); }
    if (k === 3) return R(n < 0.2 ? '#b8b49a' : n > 0.85 ? '#e8e4d0' : '#d4d0b8');
    if (c.dt < 0 || u < 0.04 || u > 0.96 || v < 0.04 || v > 0.96) return R('#24222e');
    return R(n < 0.15 ? '#3a3848' : n > 0.9 ? '#5a5868' : '#48465a'); }] }; }

function view(R){ var Q = R.Q, T = R.T, ctx = R.ctx, s0 = null, ride = null, flash = {};
  function P(x, y, z){ return R.scr(x, y, z == null ? DECK + 0.015 : z); }
  function quad(i, z, col){ var c = R.at(i), h = T * 0.49, a = P(c[0] - h, c[1] - h, z), b = P(c[0] + h, c[1] - h, z), d = P(c[0] + h, c[1] + h, z), e = P(c[0] - h, c[1] + h, z);
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(d[0], d[1]); ctx.lineTo(e[0], e[1]); ctx.closePath(); ctx.fill(); }
  // the cracks in a cracked tile, or the dark where it fell
  function crack(i, gone){ if (gone){ quad(i, DECK + 0.005, '#0c0a14'); return; } var c = R.at(i), h = T * 0.4, pts = [[-0.9, -0.2], [-0.2, 0.1], [0.3, -0.5], [0.8, 0.3]];
    ctx.strokeStyle = '#4a4636'; ctx.lineWidth = Math.max(1, R.kk() * 0.6); ctx.beginPath(); pts.forEach(function(q, k){ var p = P(c[0] + q[0] * h, c[1] + q[1] * h); k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); });
    var b0 = P(c[0] - 0.2 * h, c[1] + 0.1 * h), b1 = P(c[0] - 0.1 * h, c[1] + 0.9 * h); ctx.moveTo(b0[0], b0[1]); ctx.lineTo(b1[0], b1[1]); ctx.stroke(); }
  // an obol: a small silver coin, a little bob
  function coin(x, y, tsec, j){ var c = P(x, y, DECK + T * 0.12), e = P(x + T * 0.17, y, DECK + T * 0.12), rx = Math.max(2, Math.abs(e[0] - c[0])), g = R.reduce ? 0 : Math.sin(tsec * 2.4 + j) * rx * 0.12;
    ctx.fillStyle = '#7a7a88'; ctx.beginPath(); ctx.ellipse(c[0], c[1] + rx * 0.2 + g, rx, rx * 0.55, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#e4e4ee'; ctx.beginPath(); ctx.ellipse(c[0], c[1] + g, rx, rx * 0.55, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#a8a8b8'; ctx.beginPath(); ctx.ellipse(c[0], c[1] + g, rx * 0.45, rx * 0.25, 0, 0, 7); ctx.fill(); }
  // a rock of the cavern
  function rock(x, y){ var b = P(x, y, DECK), t = P(x, y, DECK + T * 0.7), e = P(x + T * 0.4, y, DECK), rx = Math.max(3, Math.abs(e[0] - b[0]));
    ctx.fillStyle = '#5a5868'; ctx.beginPath(); ctx.ellipse(b[0], (b[1] + t[1]) / 2, rx * 1.1, (b[1] - t[1]) / 2 + rx * 0.2, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#7a788c'; ctx.beginPath(); ctx.ellipse(b[0] + rx * 0.3, (b[1] + t[1]) / 2 + rx * 0.1, rx * 0.5, rx * 0.4, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#9a98aa'; ctx.beginPath(); ctx.ellipse(b[0] - rx * 0.25, (b[1] + t[1]) / 2 - rx * 0.2, rx * 0.45, rx * 0.35, 0, 0, 7); ctx.fill(); }
  // Cerberus asleep: a great black dog lying down, three heads resting on his paws, a slow breath
  function dog(x, y, tsec){ var b = P(x, y, DECK), e = P(x + T * 0.5, y, DECK), rx = Math.max(5, Math.abs(e[0] - b[0])), br = R.reduce ? 0 : Math.sin(tsec * 1.3) * rx * 0.04;
    ctx.fillStyle = '#16141c'; ctx.beginPath(); ctx.ellipse(b[0], b[1] - rx * 0.35, rx * 0.95, rx * 0.42 + br, 0, 0, 7); ctx.fill();
    [-0.62, 0, 0.62].forEach(function(o, k){ var hx = b[0] + o * rx, hy = b[1] - rx * (k === 1 ? 0.62 : 0.5);
      ctx.fillStyle = '#22202a'; ctx.beginPath(); ctx.ellipse(hx, hy, rx * 0.26, rx * 0.2, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#16141c'; ctx.beginPath(); ctx.moveTo(hx - rx * 0.2, hy - rx * 0.1); ctx.lineTo(hx - rx * 0.12, hy - rx * 0.32); ctx.lineTo(hx - rx * 0.02, hy - rx * 0.12); ctx.fill();
      ctx.strokeStyle = '#5a5870'; ctx.lineWidth = Math.max(1, rx * 0.04); ctx.beginPath(); ctx.moveTo(hx - rx * 0.12, hy); ctx.lineTo(hx + rx * 0.02, hy + rx * 0.02); ctx.stroke(); });
    if (!R.reduce){ var zz = (tsec * 0.5) % 1; ctx.fillStyle = 'rgba(220,220,240,' + (0.7 * (1 - zz)).toFixed(2) + ')'; ctx.font = 'bold ' + Math.round(rx * 0.4) + 'px sans-serif'; ctx.fillText('z', b[0] + rx * 0.6, b[1] - rx * (0.9 + zz * 0.6)); } }
  // Charon's skiff, long and dark, Charon in the stern in his hooded cloak, his pole held up
  function boat(x, y, rot){ var e = P(x + T * 0.5, y, DECK), b = P(x, y, DECK - 0.1), rx = Math.max(6, Math.abs(e[0] - b[0])), w = rot ? rx * 0.6 : rx * 1.5, h = rot ? rx * 1.5 : rx * 0.6;
    ctx.fillStyle = '#2a1a12'; ctx.beginPath(); ctx.ellipse(b[0], b[1], w, h * 0.55, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#8a6a4a'; ctx.beginPath(); ctx.ellipse(b[0], b[1] - rx * 0.03, w * 0.94, h * 0.5, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#5a3a2a'; ctx.beginPath(); ctx.ellipse(b[0], b[1] - rx * 0.06, w * 0.86, h * 0.42, 0, 0, 7); ctx.fill();
    var sx = b[0] + (rot ? 0 : w * 0.55), sy = b[1] - (rot ? -h * 0.4 : 0) - rx * 0.1;
    ctx.fillStyle = '#2a2836'; ctx.beginPath(); ctx.moveTo(sx - rx * 0.2, sy); ctx.lineTo(sx + rx * 0.2, sy); ctx.lineTo(sx + rx * 0.12, sy - rx * 0.75); ctx.lineTo(sx - rx * 0.12, sy - rx * 0.75); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#3a3848'; ctx.beginPath(); ctx.arc(sx, sy - rx * 0.82, rx * 0.15, 0, 7); ctx.fill(); ctx.fillStyle = '#c8b8a0'; ctx.beginPath(); ctx.arc(sx - rx * 0.03, sy - rx * 0.8, rx * 0.07, 0, 7); ctx.fill();
    ctx.fillStyle = '#b8b8c4'; ctx.fillRect(Math.round(sx - rx * 0.07), Math.round(sy - rx * 0.74), Math.max(1, Math.round(rx * 0.1)), Math.max(1, Math.round(rx * 0.12)));   // his grey beard
    ctx.strokeStyle = '#6a5040'; ctx.lineWidth = Math.max(1, rx * 0.06); ctx.beginPath(); ctx.moveTo(sx + rx * 0.25, sy - rx * 1.2); ctx.lineTo(sx - rx * 0.1, sy + rx * 0.3); ctx.stroke(); }
  // where a pair's boat waits: at the landing he stands on, else the first one
  function boatAt(pr){ return s0 && (s0.p === pr[0] || s0.p === pr[1]) ? s0.p : pr[0]; }
  function across(a, b){ var A = R.at(a), B = R.at(b); return Math.abs(B[1] - A[1]) > Math.abs(B[0] - A[0]); }
  return {
    lay:function(s){ s0 = s; ride = null; flash = {}; },
    move:function(m, u, tsec){ if (m[0] === 'boat'){ ride = { a:m[1], b:m[2], t0:tsec, dur:R.reduce ? 0.48 : 0.8 }; return; }
      if (m[0] === 'crack'){ if (u >= 1) flash[m[1]] = 1; return; }
      if (u < 1) return; if (m[0] === 'coin'){ var q = R.at(m[1]); R.burst(q[0], q[1], DECK + 0.3, ['#ffffff', '#e4e4ee', '#a8a8b8'], 8, 0.8, 0.6); R.sfx('blip'); } },
    things:function(ds, tsec){ if (!s0) return; var s = s0;
      Q.coin.forEach(function(i, j){ if (s.k & (1 << j)) return; var w = R.at(i); ds.push({ x:w[0], y:w[1], kd:function(e, ts){ coin(w[0], w[1], ts || tsec, j); } }); });
      Object.keys(Q.rock).forEach(function(i){ if (+i === Q.dog) return; var w = R.at(+i); ds.push({ x:w[0], y:w[1], kd:function(){ rock(w[0], w[1]); } }); });
      if (Q.dog >= 0){ var wd = R.at(Q.dog); ds.push({ x:wd[0], y:wd[1], kd:function(e, ts){ dog(wd[0], wd[1], ts || tsec); } }); }
      Q.pairs.forEach(function(pr){ var at = boatAt(pr), w = R.at(at), rot = across(pr[0], pr[1]);
        if (ride && (ride.a === pr[0] || ride.a === pr[1])){ var u = Math.min(1, Math.max(0, (tsec - ride.t0) / ride.dur)), A = R.at(ride.a), B = R.at(ride.b); w = [A[0] + (B[0] - A[0]) * u, A[1] + (B[1] - A[1]) * u]; }
        ds.push({ x:w[0], y:w[1] - T * 0.2, kd:function(){ boat(w[0], w[1], rot); } }); }); },
    // the cracked ground: its cracks, or the dark where it fell
    ground:function(){ if (!s0) return; Q.crk.forEach(function(i, j){ crack(i, !!(s0.c & (1 << j)) || !!flash[i]); }); },
    hot:function(){ return []; } }; }

root.RTT_GYMKIND_OBOL = { id:'obol', gyms:GYMS, input:'step', calm:true, unit:'step', hello:'Charon rows you across for one obol a crossing. Pick up obols as you go.',
  parse:parse, init:init, key:key, act:act, step:act, moves:moves, proof:proof, enc:enc, goal:goal,
  me:function(G, s){ return s.p; }, place:function(G, s, i){ return { p:i, k:s.k, n:s.n, c:s.c }; },
  deck:function(G, s, i){ var Q = parse(G); return open(Q, s.c, i) || i === Q.lever; },
  tell:{ take:'An obol. Charon will take it for one crossing.', ferry:'Charon takes the obol and rows you across.', nofare:'No obol, no boat. Charon waits.', fall:'The cracked ground falls away behind you.', stuck:'No way to finish from here. Undo it, or Restart.' },
  dur:function(how){ return how === 'ride' ? 0.8 : how === 'cast' ? 0.02 : how === 'fall' ? 0.2 : 0.15; },
  floor:floor, mats:mats, view:view };
})();
