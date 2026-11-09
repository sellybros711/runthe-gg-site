/* golf/putt/gymkinds/grow.js: the GROW kind of trail gym (RTT_GYMKIND_GROW), Wonderland's. A kind file: the registry (gyms.js, its
   KINDS README) finds it by its global, the frame (trail.js) plays it, check-putt proves it.

   THE PUZZLE is Alice's in the hall of doors (Lewis Carroll, 1865, chapters 1 and 2). He is the size he came in at, and the hall
   changes that: step onto the DRINK ME bottle and he shuts up like a telescope, small; step onto the EAT ME cake and he opens out
   like the largest telescope that ever was, big. Each stays where it is, to be used again. The size decides where he can go:
     a little door        only a small one goes through it
     a narrow gap         anyone but a big one squeezes through it
     a box hedge          only a big one steps over it
     the glass table      the golden key lies on top of it: walk into it to take the key, but a small one cannot reach it
     the locked door      a little door with the golden key's lock: a small one with the key goes through it
   The vault is out in the garden, past the locked door. So the key wants him tall and the door wants him small, and the bottle and
   the cake are never where the walk would like them. The puzzle is the order: which to eat, which to drink, and where to be when.

   THE GATEKEEPER'S TWIST is Ice Age's ice, as the Pool of Tears that Alice cried when she was nine feet high: step into the pool
   and he swims on the way he went until he reaches its far bank (any size can swim it), and steps out there if he can.

   He moves TILE BY TILE (a step kind). A bump into a wall, a door he is the wrong size for, the table or a hedge is no step.

   THE LAYOUTS ARE HAND DESIGNED, never random. Row 0 is the far wall (the top of the screen), the last row the near wall with the
   gate in it. The frame's five characters (# G @ L C, gyms.js) and this kind's own:
     b  the DRINK ME bottle      c  the EAT ME cake      o  a little door      O  the locked little door
     n  a narrow gap             h  a box hedge          k  the glass table with the golden key      w  the Pool of Tears
   THE STATE is { p, z, k }: where he stands, his size (0 as he came, 1 small, 2 big) and whether he has the key. A few hundred
   states, so solve() and audit() are the registry's own breadth first search (lib). */
(function(){
var root = typeof window !== 'undefined' ? window : globalThis;
var LIB = function(){ return root.RTT_PUTT_GYMS.lib; };

/* THE GYMS. moves and proof are the solver's fewest steps and one shortest solution (U R D L), recorded from solve().
   The civilian's lines nudge, never solve. */
var GYMS = [
  /* THE HALL OF DOORS, mid-world: the key on its table behind a row of box hedges, the bottle behind another, the locked door
     between them at the top. The rule and nothing more: the key wants you tall and the door wants you small. */
  { id:'won1', kind:'grow', world:'wonderland', leg:9, name:'The Hall of Doors', badge:'Golden Key Badge', mech:['grow'], pay:500, look:{ wall:'plank' },
    moves:25, proof:'UULLLUUUURDDRRRRUUURULLLU',
    who:{ look:{ skin:'light', polo:'white', hat:'white', pants:'black', hair:'brown', hairStyle:'bun', cap:false, shoes:'black', gender:'female' } },
    say:['The bottle shrinks you and the cake makes you tall. Both stay put, so you can come back to them.',
      'A small one cannot reach the table. A big one cannot fit the little door.',
      'Think of the order. What do you need to be tall for, and what to be small for?'],
    rows:[
      '#####C#####',
      '#...nOn...#',
      '#.k.#.#.b.#',
      '#hhh#.#hhh#',
      '#...#n#...#',
      '#...h.h...#',
      '#.c.......#',
      '#.........#',
      '#L...@....#',
      '#####G#####'
    ] },
  /* THE POOL OF TEARS, the gatekeeper: the hall's corner behind a little door, the Pool of Tears with the key's table on an island
     in it, and the locked door across the pool. A bottle on each side of it and the cake in between, so he is small, then tall,
     then small again, and swims the pool between. */
  { id:'won2', kind:'grow', world:'wonderland', leg:18, name:'The Pool of Tears', badge:'Telescope Badge', mech:['grow', 'ice'], pay:1000, keeper:true, look:{ wall:'plank' },
    hint:'The key wants you tall and the door wants you small. Eat the cake once the little door is behind you.',
    moves:26, proof:'UURRRRLLLLLLULUURDLUURRRRU',
    who:{ look:{ skin:'light', polo:'black', hat:'white', pants:'black', hair:'grey', hairStyle:'short', cap:false, shoes:'black', gender:'male' } },
    say:['Step into the pool and you swim on until you reach its far bank. Any size can swim.',
      'You cannot stop in the middle of the pool. Look where each swim comes ashore.',
      'There is more than one bottle in this hall. You may need to change size twice.'],
    rows:[
      '#####C#####',
      '#b.o.On...#',
      '#h#######.#',
      '#wwwwhwwww#',
      '#www.kwwww#',
      '#wwwwhwwww#',
      '#hhhhhhh###',
      '#.c.#.....#',
      '#...o..n.b#',
      '#####...#.#',
      '#L...@....#',
      '#####G#####'
    ] }
];

var PARSED = {};
function parse(G){ if (PARSED[G.id]) return PARSED[G.id]; var Q = LIB().room(G, function(ch){ return 'bcoOnhkw'.indexOf(ch) >= 0 ? undefined : false; });
  return PARSED[G.id] = Q; }
function init(G){ return { p:parse(G).start, z:0, k:0 }; }
function key(s){ return s.p + ':' + s.z + ':' + s.k; }
// can he stand on tile n at size z, with the key or not; and if not, why not
function why(Q, n, z, k){ if (n < 0) return 'bump'; var ch = Q.cell[n];
  if (ch === '#' || n === Q.lever || n === Q.chest || n === Q.gate) return 'bump';
  if (ch === 'k') return 'table'; if (ch === 'h') return z === 2 ? null : 'hedge'; if (ch === 'n') return z === 2 ? 'narrow' : null;
  if (ch === 'o') return z === 1 ? null : 'door'; if (ch === 'O') return z !== 1 ? 'door' : k ? null : 'locked'; return null; }
// what the tile he arrives on does: the bottle makes him small, the cake big
function arrive(Q, s, n, mv){ var ch = Q.cell[n], z = s.z, ev = null;
  if (ch === 'b' && z !== 1){ z = 1; mv.push(['size', n, n, 'drink']); ev = 'drink'; }
  if (ch === 'c' && z !== 2){ z = 2; mv.push(['size', n, n, 'eat']); ev = 'eat'; }
  return { p:n, z:z, k:s.k, ev:ev }; }

/* ONE STEP. The frame's tiles first (the gate, the lever, the vault); the table gives up its key to a hand that can reach it; then
   the walk, what the tile he arrives on does, and in the Pool of Tears the swim to its far bank. */
function act(G, s, dir){ var Q = parse(G), L = LIB(), n = L.nb(Q, s.p, dir);
  var f = L.frameStep(G, Q, s, s.p, dir, init); if (f) return f;
  if (n >= 0 && Q.cell[n] === 'k'){ if (s.k) return { s:s, ev:'bump', moves:[] }; if (s.z === 1) return { s:s, ev:'reach', moves:[] };
    return { s:{ p:s.p, z:s.z, k:1 }, ev:'key', moves:[['key', n, s.p, 'take']] }; }
  var w = why(Q, n, s.z, s.k); if (w) return { s:s, ev:w === 'bump' ? 'bump' : w, moves:[] };
  var mv = [['me', s.p, n, 'walk']], a = arrive(Q, s, n, mv), ev = a.ev || 'step', guard = 0;
  while (Q.cell[a.p] === 'w' && guard++ < 30){ var m2 = L.nb(Q, a.p, dir); if (m2 < 0 || why(Q, m2, a.z, a.k) || L.frameStep(G, Q, a, a.p, dir, init)) break;
    mv.push(['me', a.p, m2, 'swim']); a = arrive(Q, a, m2, mv); if (ev === 'step') ev = 'swim'; if (a.ev) ev = a.ev; }
  return { s:{ p:a.p, z:a.z, k:a.k }, ev:ev, moves:mv }; }
function moves(){ return [0, 1, 2, 3]; }
function proof(G){ return (G.proof || '').split('').map(function(ch){ return 'URDL'.indexOf(ch); }); }
function enc(path){ return path.map(function(d){ return 'URDL'.charAt(d); }).join(''); }
function goal(){ return 'Take the golden key. Go out by the little door to the vault.'; }

/* ---- THE LOOK: the hall's floor is warm boards, the garden's lawn past its far wall, the Pool of Tears a sunken pool of clear
   blue with ripples. A box hedge is a clipped green block knee high, a narrow gap two tall red curtains with a slit between them,
   a little door a small arched wooden door (open while he is small), the locked one the same with a gold lock, the glass table a
   pale top on thin legs with the golden key on it, the bottle Tenniel's little bottle with its paper label, the cake a little round
   cake marked in currants. His size rides over him: a bottle over a small one, a cake over a big one. */
var DECK = 0.45;
function floor(gc){ if (gc.k === '#') return null; var k = gc.k === 'w' ? 1 : 0;
  return { h:k ? DECK - 0.3 : DECK, mat:['grfloor', { gu:gc.u, gv:gc.v, gk:k, gr:gc.r }] }; }
function mats(){ return {
  grfloor:['', '', '', 0, function(c, R, h3){ var u = c.gu || 0, v = c.gv || 0, n = h3(c.ti, c.tj, 97);
    if (c.gk === 1){ var w = Math.sin(c.ti * 0.23 + Math.sin(c.tj * 0.19) * 2) + Math.sin(c.tj * 0.15 - c.ti * 0.09); return R(w > 1.2 ? '#e8f4ff' : w > 0.6 ? '#9ac8f0' : n > 0.6 ? '#3a6aa8' : '#2e5a98'); }
    if (c.dt < 0) return R('#5a3e2a'); if (u < 0.04 || u > 0.96) return R('#6a4a30');
    var pl = Math.floor(v * 4), wd = h3(pl, c.gr || 0, 11); return R(Math.abs(v * 4 - pl - 0.5) > 0.46 ? '#5e4028' : n > 0.85 ? '#a07450' : wd > 0.5 ? '#8a6040' : '#946a46'); }] }; }

function view(R){ var Q = R.Q, T = R.T, ctx = R.ctx, s0 = null, puff = {};
  function P(x, y, z){ return R.scr(x, y, z == null ? DECK + 0.015 : z); }
  function W0(x, y){ var b = P(x, y, DECK), e = P(x + T * 0.5, y, DECK); return [b, Math.max(4, Math.abs(e[0] - b[0]))]; }
  function rect(x, y, w, h, c){ ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); }
  function hedge(x, y){ var q = W0(x, y), b = q[0], rx = q[1]; rect(b[0] - rx, b[1] - rx * 1.1, rx * 2, rx * 1.1, '#2e6a2e'); rect(b[0] - rx, b[1] - rx * 1.4, rx * 2, rx * 0.4, '#4a9a46');
    for (var k = 0; k < 6; k++) rect(b[0] - rx + k * rx * 0.34, b[1] - rx * (0.5 + (k % 2) * 0.3), rx * 0.18, rx * 0.16, '#1e4a22'); }
  function narrow(x, y){ var q = W0(x, y), b = q[0], rx = q[1], h = rx * 3; [-1, 1].forEach(function(sd){ rect(b[0] + sd * rx * 0.3 - (sd < 0 ? rx * 0.7 : 0), b[1] - h, rx * 0.7, h, '#b8283a');
      for (var k = 0; k < 4; k++) rect(b[0] + sd * rx * 0.3 - (sd < 0 ? rx * 0.7 : 0) + k * rx * 0.18, b[1] - h, rx * 0.06, h, '#8a1a2a'); }); rect(b[0] - rx * 1.05, b[1] - h - rx * 0.2, rx * 2.1, rx * 0.25, '#c8a050'); }
  function door(x, y, locked, open){ var q = W0(x, y), b = q[0], rx = q[1], h = rx * 1.4;
    rect(b[0] - rx * 0.8, b[1] - h, rx * 1.6, h, '#c8a050'); ctx.fillStyle = '#c8a050'; ctx.beginPath(); ctx.arc(b[0], b[1] - h, rx * 0.8, Math.PI, 0); ctx.fill();
    if (open){ rect(b[0] - rx * 0.6, b[1] - h, rx * 1.2, h, '#2a1a10'); rect(b[0] + rx * 0.5, b[1] - h * 1.05, rx * 0.25, h * 1.05, '#7a4a24'); return; }
    rect(b[0] - rx * 0.6, b[1] - h, rx * 1.2, h, '#7a4a24'); ctx.fillStyle = '#7a4a24'; ctx.beginPath(); ctx.arc(b[0], b[1] - h, rx * 0.6, Math.PI, 0); ctx.fill();
    rect(b[0] - rx * 0.03, b[1] - h * 1.3, rx * 0.06, h * 1.3, '#4a2a12'); ctx.fillStyle = '#ffd84a'; ctx.beginPath(); ctx.arc(b[0] + rx * 0.35, b[1] - h * 0.5, rx * (locked ? 0.16 : 0.1), 0, 7); ctx.fill();
    if (locked) rect(b[0] + rx * 0.32, b[1] - h * 0.46, rx * 0.06, rx * 0.16, '#1a0e06'); }
  function table(x, y, has, tsec){ var q = W0(x, y), b = q[0], rx = q[1];
    [-0.6, 0.6].forEach(function(o){ rect(b[0] + o * rx - rx * 0.04, b[1] - rx * 1.6, rx * 0.08, rx * 1.6, '#bfe0f4'); });
    ctx.fillStyle = 'rgba(214,236,248,.85)'; ctx.beginPath(); ctx.ellipse(b[0], b[1] - rx * 1.6, rx * 0.9, rx * 0.32, 0, 0, 7); ctx.fill();
    if (has){ var g = R.reduce ? 0 : Math.sin(tsec * 3) * rx * 0.04; rect(b[0] - rx * 0.3, b[1] - rx * 1.72 + g, rx * 0.42, rx * 0.1, '#ffd84a'); ctx.fillStyle = '#ffd84a'; ctx.beginPath(); ctx.arc(b[0] + rx * 0.18, b[1] - rx * 1.67 + g, rx * 0.12, 0, 7); ctx.fill(); } }
  function bottle(cx, cy, rx){ ctx.fillStyle = '#7ab0e0'; ctx.beginPath(); ctx.ellipse(cx, cy - rx * 0.6, rx * 0.5, rx * 0.6, 0, 0, 7); ctx.fill();
    rect(cx - rx * 0.14, cy - rx * 1.6, rx * 0.28, rx * 0.5, '#a8d4f8'); rect(cx - rx * 0.16, cy - rx * 1.8, rx * 0.32, rx * 0.22, '#b07a44'); rect(cx - rx * 0.36, cy - rx * 0.8, rx * 0.72, rx * 0.3, '#f4ecd8'); }
  function cake(cx, cy, rx){ rect(cx - rx * 0.6, cy - rx * 0.5, rx * 1.2, rx * 0.5, '#b8743a'); ctx.fillStyle = '#fff4e0'; ctx.beginPath(); ctx.ellipse(cx, cy - rx * 0.5, rx * 0.6, rx * 0.22, 0, 0, 7); ctx.fill();
    [-0.3, 0, 0.3].forEach(function(o){ rect(cx + o * rx - rx * 0.05, cy - rx * 0.55, rx * 0.1, rx * 0.08, '#3a1a1a'); }); }
  return {
    lay:function(s){ s0 = s; puff = {}; },
    move:function(m, u){ if (u < 1) return; var w = R.at(m[1]);
      if (m[0] === 'size'){ R.burst(w[0], w[1], DECK + 0.4, m[3] === 'drink' ? ['#ffffff', '#9ac8f0', '#7ab0e0'] : ['#ffffff', '#fff4e0', '#e8a050'], 12, 0.8, 0.7); R.sfx('blip'); }
      if (m[0] === 'key'){ R.burst(w[0], w[1], DECK + 1.2, ['#ffffff', '#ffe9a0', '#ffd84a'], 12, 0.8, 0.7); R.sfx('blip'); } },
    things:function(ds, tsec){ if (!s0) return; var s = s0;
      for (var i = 0; i < Q.cell.length; i++){ (function(i){ var ch = Q.cell[i]; if ('bcoOnhk'.indexOf(ch) < 0) return; var w = R.at(i);
        ds.push({ x:w[0], y:w[1], kd:function(e, ts){ ts = ts || tsec;
          if (ch === 'h') hedge(w[0], w[1]); else if (ch === 'n') narrow(w[0], w[1]); else if (ch === 'o') door(w[0], w[1], false, s.z === 1); else if (ch === 'O') door(w[0], w[1], true, s.z === 1 && !!s.k);
          else if (ch === 'k') table(w[0], w[1], !s.k, ts);
          else { var q = W0(w[0], w[1]); if (ch === 'b') bottle(q[0][0], q[0][1], q[1] * 0.7); else cake(q[0][0], q[0][1], q[1] * 0.8); } } }); })(i); }
      // his size, riding over him: the bottle over a small one, the cake over a big one; the key once he has it
      if (s.z || s.k){ var me = R.at(s.p); ds.push({ x:me[0], y:me[1] + T * 0.3, kd:function(e, ts){ var c = P(me[0], me[1] + T * 0.3, DECK + T * 1.5), e2 = P(me[0] + T * 0.3, me[1], DECK), rx = Math.max(3, Math.abs(e2[0] - c[0])), g = R.reduce ? 0 : Math.sin((ts || tsec) * 3) * rx * 0.1;
        if (s.z === 1) bottle(c[0] - rx * 0.5, c[1] + g, rx * 0.8); else if (s.z === 2) cake(c[0] - rx * 0.5, c[1] + g, rx); if (s.k){ rect(c[0] + rx * 0.3, c[1] - rx * 0.6 + g, rx * 0.5, rx * 0.12, '#ffd84a'); } } }); } },
    hot:function(){ return []; },
    ground:function(){ } }; }

root.RTT_GYMKIND_GROW = { id:'grow', gyms:GYMS, input:'step', calm:true, unit:'step', hello:'The bottle makes you small. The cake makes you big. Your size says where you fit.',
  parse:parse, init:init, key:key, act:act, step:act, moves:moves, proof:proof, enc:enc, goal:goal,
  me:function(G, s){ return s.p; }, place:function(G, s, i){ return { p:i, z:s.z, k:s.k }; },
  deck:function(G, s, i){ var Q = parse(G); return !why(Q, i, s.z, s.k) || i === Q.lever; },
  tell:{ drink:'DRINK ME. You shut up like a telescope.', eat:'EAT ME. You open out like a telescope.', key:'The golden key. Now for the little door.', reach:'The key is up on the table. You are too small to reach it.',
    door:'A little door. Only a small one gets through.', locked:'Locked. The golden key is on the glass table.', hedge:'A box hedge. Only a big one steps over it.', narrow:'Too narrow for you at this size.',
    swim:'You swim across the Pool of Tears.', stuck:'No way to finish from here. Undo it, or Restart.' },
  dur:function(how){ return how === 'swim' ? 0.2 : 0.15; },
  floor:floor, mats:mats, view:view };
})();
