/* golf/putt/gymkinds/hop.js: the JELLY PAD kind of trail gym (RTT_GYMKIND_HOP), Jellara's. A kind file: the registry
   (gyms.js, its KINDS README) finds it by its global, the frame (trail.js) plays it, check-putt proves it.

   THE PUZZLE. He walks a hall of lime jelly cut up by pools of goo and low jelly hedges, neither of which he can walk
   onto. Jelly pads are set in the floor: step onto one and it throws him two tiles on, the way he was walking, over
   whatever tile is in between (goo, a hedge or floor, never a wall). If there is nowhere to land (a wall, goo, a hedge
   or the edge of the room two tiles on) the pad only wobbles and he stays standing on it. Landing on another pad throws
   him again. Jelly beans lie about the hall, and the vault opens once every bean is picked up. So a pad is a one way
   door: the order he takes the pads in, and which way he walks onto each, is the puzzle.

   THE GATEKEEPER'S TWIST is the ice slide (Ice Age's), as slick goo glaze: on a glazed tile he slides on the way he was
   going until the next tile stops him, and a slide that runs onto a pad is thrown on by it.

   He moves TILE BY TILE (a step kind: the stick, the arrows, the pad, or a tap toward a tile).

   THE LAYOUTS ARE HAND DESIGNED, never random. Row 0 is the far wall (the top of the screen), the last row the near
   wall with the gate in it. The frame's five characters (# G @ L C, gyms.js) and this kind's own:
     o   a jelly pad          ~   goo          h   a low jelly hedge          s   a jelly bean (picked up as he steps on it)
     =   glazed jelly (the gatekeeper's): he slides across it

   THE STATE is { p, k }: where he stands and the beans picked up (a bit a bean). A few hundred states, so solve() and
   audit() are the registry's own breadth first search (lib). */
(function(){
var root = typeof window !== 'undefined' ? window : globalThis;
var LIB = function(){ return root.RTT_PUTT_GYMS.lib; };

/* THE GYMS. moves and proof are the solver's fewest steps and one shortest solution (U R D L), recorded from solve().
   The civilian's lines nudge, never solve. */
var GYMS = [
  /* THE BOUNCE HALL, mid-world: beans on ledges over the goo, every ledge a one way hop from a pad below it. */
  { id:'jellara1', kind:'hop', world:'jellara', leg:9, name:'The Bounce Hall', badge:'Wobble Badge', mech:['hop'], pay:500, look:{ wall:'stone' },
    moves:21, proof:'URRURUUDULLDDLDLLULRU',
    who:{ look:{ skin:'light', polo:'white', hat:'white', pants:'white', hair:'brown', hairStyle:'short', cap:true, hatStyle:'ppastrohelmet', top:'ppspacesuit', shoes:'white', gender:'male' } },
    say:['A pad only throws you the way you walked onto it.',
      'Some pads take you somewhere you cannot walk back from. Look before you hop.',
      'If a pad only wobbles, there is nowhere to land. Come at it from another side.'],
    rows:[
      '#########',
      '####C####',
      '#soh.hos#',
      '#~~~~~~o#',
      '#.o~~...#',
      '#..h..h.#',
      '#~o.s.o~#',
      '#.......#',
      '###L@####',
      '####G####'
    ] },
  /* THE GOO VAULT, the gatekeeper: pads and glazed jelly together, a slide that runs onto a pad is thrown on by it. */
  { id:'jellara2', kind:'hop', world:'jellara', leg:18, name:'The Goo Vault', badge:'Jelly Badge', mech:['hop', 'ice'], pay:1000, keeper:true, look:{ wall:'stone' },
    moves:25, proof:'UURRLLLLRUULUDDRRUDDLUUUU',
    who:{ look:{ skin:'deep', polo:'white', hat:'white', pants:'white', hair:'black', hairStyle:'bun', cap:true, hatStyle:'ppastrohelmet', top:'ppspacesuit', shoes:'white', gender:'female' } },
    say:['On the glaze you keep sliding. Only something in the way stops you.',
      'A slide can end on a pad. Then the pad throws you on.',
      'Think about where you will stop before you step on the glaze.'],
    rows:[
      '#########',
      '####C####',
      '#s.h.h.s#',
      '#=~~o~~=#',
      '#=.....=#',
      '#o~h=h~o#',
      '#.==s==.#',
      '#~.o.o.~#',
      '#s=...=s#',
      '#.......#',
      '###L@####',
      '####G####'
    ] }
];

var PARSED = {};
/* THE ROOM: the frame's five through lib.room, and the kind's own. Q.pad, Q.goo, Q.hedge and Q.ice mark their tiles,
   Q.beans lists the beans (a bit each). */
function parse(G){ if (PARSED[G.id]) return PARSED[G.id]; var pad = {}, goo = {}, hedge = {}, ice = {}, beans = [];
  var Q = LIB().room(G, function(ch, i){ if (ch === 'o'){ pad[i] = 1; return; } if (ch === '~'){ goo[i] = 1; return; } if (ch === 'h'){ hedge[i] = 1; return; }
    if (ch === '='){ ice[i] = 1; return; } if (ch === 's'){ beans.push(i); return; } return false; });
  Q.pad = pad; Q.goo = goo; Q.hedge = hedge; Q.ice = ice; Q.beans = beans; Q.allK = (1 << beans.length) - 1;
  return PARSED[G.id] = Q; }
function init(G){ var Q = parse(G); return { p:Q.start, k:0 }; }
function key(s){ return s.p + ':' + s.k; }
// can he stand on tile n (land on it, slide onto it, walk onto it)
function open(Q, n){ if (n < 0) return false; var ch = Q.cell[n]; if (ch === '#' || n === Q.lever || n === Q.chest || n === Q.gate) return false; return !Q.goo[n] && !Q.hedge[n]; }
function bean(Q, k, n, mv){ var j = Q.beans.indexOf(n); if (j >= 0 && !(k & (1 << j))){ mv.push(['bean', n, n, 'take']); return k | (1 << j); } return k; }

/* ONE STEP. The frame's tiles first (the gate, the lever); the vault opens with every bean in hand. Then the walk, and
   what the tile he arrives on does with him: a pad throws him two tiles on if he can land there, glaze slides him on
   while the next tile is open. Each throw and each slide is its own move, so the frame plays them one after another. */
function act(G, s, d){ var Q = parse(G), L = LIB(), n = L.nb(Q, s.p, d);
  if (n === Q.chest) return s.k === Q.allK ? { s:s, ev:'open', moves:[] } : { s:s, ev:'shut', moves:[] };
  var f = L.frameStep(G, Q, s, s.p, d, init); if (f) return f;
  if (!open(Q, n)) return { s:s, ev:'bump', moves:[] };
  var mv = [['me', s.p, n, 'walk']], ev = 'step', p = n, k = bean(Q, s.k, n, mv), guard = 0;
  while (guard++ < 40){
    if (Q.pad[p]){ var mid = L.nb(Q, p, d), land = mid < 0 || Q.cell[mid] === '#' ? -1 : L.nb(Q, mid, d);
      if (land >= 0 && open(Q, land)){ mv.push(['pad', p, p, 'boing'], ['me', p, land, 'hop']); p = land; k = bean(Q, k, p, mv); ev = 'hop'; continue; }
      mv.push(['pad', p, p, 'wobble']); if (ev === 'step') ev = 'wobble'; break; }
    if (Q.ice[p]){ var nx = L.nb(Q, p, d); if (open(Q, nx)){ mv.push(['me', p, nx, 'slide']); p = nx; k = bean(Q, k, p, mv); if (ev === 'step') ev = 'slide'; continue; } }
    break; }
  if (ev === 'step' && k !== s.k) ev = 'take';
  return { s:{ p:p, k:k }, ev:ev, moves:mv }; }
function moves(){ return [0, 1, 2, 3]; }
function proof(G){ return (G.proof || '').split('').map(function(ch){ return 'URDL'.indexOf(ch); }); }
function enc(path){ return path.map(function(d){ return 'URDL'.charAt(d); }).join(''); }
function goal(G){ return parse(G).beans.length > 1 ? 'Pick up every jelly bean, then step into the vault.' : 'Pick up the jelly bean, then step into the vault.'; }

/* ---- THE LOOK: lime jelly deck plates with a soft shine, goo a teal pool with pink bubbles, a hedge a low pink ridge,
   glaze a pale sheen of goo over the plate. In the room the pads are pink and wobble, the beans stand in their colours,
   and a pad squashes as it throws him. */
var DECK = 0.45;
var BEAN = ['#ff5fb8', '#ffb030', '#b894f0', '#9be86a'];
function floor(gc){ if (gc.k === '#') return null; var k = gc.k === '~' ? 1 : gc.k === 'h' ? 2 : gc.k === '=' ? 3 : gc.k === 'o' ? 4 : 0;
  return { h:k === 1 ? DECK - 0.3 : k === 2 ? DECK + 0.35 : DECK, mat:['hjelly', { gu:gc.u, gv:gc.v, hk:k }] }; }
function mats(){ return {
  hjelly:['', '', '', 0, function(c, R, h3){ var u = c.gu || 0, v = c.gv || 0, k = c.hk || 0, n = h3(c.ti, c.tj, 93);
    if (k === 1){ if (n > 0.96) return R('#ffd0ec'); if (n > 0.92) return R('#ff9ad8'); return R(u < 0.06 || v < 0.06 ? '#227068' : '#3fd0b0'); }
    if (c.dt < 0 || u < 0.04 || u > 0.96 || v < 0.04 || v > 0.96) return R('#227068');
    if (k === 2){ var w = Math.sin(u * 12) * 0.08; return R(v < 0.35 + w ? '#ffd0ec' : v < 0.7 + w ? '#ff8ad0' : '#c8408a'); }
    if (k === 3){ if (Math.abs(u - v) < 0.05 || Math.abs(u - v - 0.4) < 0.03) return R('#ffffff'); return R(n < 0.15 ? '#bff8e8' : '#8af0d8'); }
    if (u < 0.12 || v < 0.12) return R('#c0f58a'); if (u > 0.88 || v > 0.88) return R('#78c84a'); return R(n < 0.08 ? '#d8fca8' : '#9be86a'); }] }; }

function view(R){ var Q = R.Q, T = R.T, ctx = R.ctx, s0 = null, sq = {};
  function P(x, y, z){ return R.scr(x, y, z == null ? DECK + 0.015 : z); }
  // a jelly pad: a pink dome on its plate, a shine on it, squashed for a moment as it throws
  function pad(x, y, tsec, i){ var c = P(x, y, DECK + 0.02), e = P(x + T * 0.38, y), rx = Math.max(3, Math.abs(e[0] - c[0])), q = sq[i] || 0, wob = R.reduce ? 0 : Math.sin(tsec * 5 + i) * 0.06;
    var ry = rx * (0.55 + wob - q * 0.25), top = P(x, y, DECK + T * (0.22 - q * 0.12));
    ctx.fillStyle = '#c8408a'; ctx.beginPath(); ctx.ellipse(c[0], c[1], rx, rx * 0.5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#ff5fb8'; ctx.beginPath(); ctx.ellipse(top[0], (top[1] + c[1]) / 2, rx * (0.92 + q * 0.12), ry, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,230,245,0.9)'; ctx.beginPath(); ctx.ellipse(top[0] - rx * 0.35, top[1] + ry * 0.2, rx * 0.22, ry * 0.3, -0.4, 0, 7); ctx.fill(); }
  // a jelly bean standing on end, in its colour, a shine down one side
  function beanAt(x, y, tsec, j){ var c = P(x, y, DECK + T * 0.3), e = P(x + T * 0.2, y, DECK + T * 0.3), px = Math.max(2, Math.abs(e[0] - c[0]));
    var g = R.reduce ? 0 : Math.sin(tsec * 2.6 + j) * px * 0.15; ctx.fillStyle = BEAN[j % BEAN.length]; ctx.strokeStyle = '#14302c'; ctx.lineWidth = Math.max(1, R.kk() * 0.5);
    ctx.beginPath(); ctx.ellipse(c[0], c[1] + g, px * 0.8, px * 1.3, 0.25, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.ellipse(c[0] - px * 0.3, c[1] + g - px * 0.4, px * 0.18, px * 0.45, 0.25, 0, 7); ctx.fill(); }
  return {
    lay:function(s){ s0 = s; sq = {}; },
    move:function(m, u){ if (m[0] === 'pad'){ sq[m[1]] = m[3] === 'boing' ? Math.sin(Math.PI * Math.min(1, u * 2)) : Math.sin(Math.PI * u) * 0.4; if (u >= 1) sq[m[1]] = 0;
        if (u >= 1 && m[3] === 'boing'){ var q = R.at(m[1]); R.burst(q[0], q[1], DECK + 0.2, ['#ff8ad0', '#ffffff'], 8, 0.7, 0.6); R.sfx('blip'); } return; }
      if (u < 1) return; if (m[0] === 'bean'){ var q2 = R.at(m[1]); R.burst(q2[0], q2[1], DECK + 0.3, ['#ffffff', '#ff8ad0', '#9be86a'], 8, 0.8, 0.6); } },
    things:function(ds, tsec){ if (!s0) return; var s = s0;
      Object.keys(Q.pad).forEach(function(t){ var i = +t, w = R.at(i); ds.push({ x:w[0], y:w[1], kd:function(e, ts){ pad(w[0], w[1], ts || tsec, i); } }); });
      Q.beans.forEach(function(i, j){ if (s.k & (1 << j)) return; var w = R.at(i); ds.push({ x:w[0], y:w[1], kd:function(e, ts){ beanAt(w[0], w[1], ts || tsec, j); } }); }); },
    hot:function(){ return []; },
    ground:function(){ } }; }

root.RTT_GYMKIND_HOP = { id:'hop', gyms:GYMS, input:'step', calm:true, unit:'step', hello:'Step on a pad and it hops you two tiles on. Goo and hedges stop you.',
  parse:parse, init:init, key:key, act:act, step:act, moves:moves, proof:proof, enc:enc, goal:goal,
  me:function(G, s){ return s.p; }, place:function(G, s, i){ return { p:i, k:s.k }; },
  deck:function(G, s, i){ var Q = parse(G); return open(Q, i) || i === Q.lever; },
  tell:{ shut:'The vault stays shut. A bean is still out there.', hop:'The pad throws you on.', wobble:'The pad wobbles. Nowhere to land.', slide:'You slide on the glaze.', stuck:'No way to finish from here. Undo it, or Restart.' },
  dur:function(how){ return how === 'hop' ? 0.32 : how === 'boing' || how === 'wobble' ? 0.14 : how === 'slide' ? 0.1 : 0.15; },
  floor:floor, mats:mats, view:view };
})();
