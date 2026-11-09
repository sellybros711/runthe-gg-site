/* golf/putt/gymkinds/knight.js: the KNIGHT kind of trail gym (RTT_GYMKIND_KNIGHT), Through the Looking-Glass's. A kind file: the
   registry (gyms.js, its KINDS README) finds it by its global, the frame (trail.js) plays it, check-putt proves it.

   THE PUZZLE is the White Knight's (Lewis Carroll, 1871, chapter 8). The whole country is a great game of chess, and in this
   square he moves the way a knight does: two tiles one way and one to the side, jumping over whatever is between. A tap on a tile
   a knight's move away jumps him there. He can jump over a hedge or a brook, but never land on one. The Red Knight's pawns stand
   about the square: land on a pawn and it is taken. Take every pawn, then land on the gold square, the eighth square where the
   crown is, and the vault opens. A tap on the lever is Restart, as the button is.

   THE GATEKEEPER'S TWIST is Volcano Island's cracking floor, as Humpty Dumpty's eggs: an egg lies on some squares. Land on one and
   it holds you; jump off it and it breaks behind you, and nothing can land there again. So the order of the jumps is everything.

   THE LAYOUTS ARE HAND DESIGNED, never random. Row 0 is the far wall, the last row the near wall with the gate in it. The frame's
   five characters (# G @ L C, gyms.js) and this kind's own:
     h  a hedge      ~  a little brook      p  a red pawn      Q  the gold square (the crown)      e  an egg
   THE STATE is { p, m, x, c }: where he stands, the pawns taken (a bit each), the eggs broken (a bit each) and whether he has
   landed on the crown with every pawn taken (the win). A few thousand
   states, so solve() and audit() are the registry's own breadth first search (lib). */
(function(){
var root = typeof window !== 'undefined' ? window : globalThis;
var LIB = function(){ return root.RTT_PUTT_GYMS.lib; };
var JUMPS = [[1, -2], [2, -1], [2, 1], [1, 2], [-1, 2], [-2, 1], [-2, -1], [-1, -2]];

/* THE GYMS. moves and proof are the solver's fewest jumps and one shortest solution (the tiles tapped), recorded from solve().
   The civilian's lines nudge, never solve. */
var GYMS = [
  /* THE KNIGHT'S FIELD, mid-world: four pawns about a field cut by hedges and brooks, the gold square at the top. The lesson is the
     knight's move itself, that a knight cannot reach a square next to him at all, and that a jump goes over anything. */
  { id:'lg1', kind:'knight', world:'lookingglass', leg:9, name:'The Knight’s Field', badge:'White Knight Badge', mech:['knight'], pay:500, look:{ wall:'stone' },
    moves:14, proof:'69,52,41,34,41,60,67,56,39,28,11,22,29,12',
    who:{ look:{ skin:'light', polo:'white', hat:'white', pants:'white', hair:'grey', hairStyle:'short', cap:false, shoes:'black', gender:'male' } },
    say:['A knight goes two squares one way and one to the side. He jumps over anything.',
      'A square right next to you is the hardest one to reach. Go round to it.',
      'Take the pawns in the order the jumps allow, not the order they stand in.'],
    rows:[
      '####C####',
      '#..Q..h.#',
      '#.h..~..#',
      '#p..h..p#',
      '#.~..p..#',
      '#..h..~.#',
      '#.p..h..#',
      '#..~....#',
      '#L..@...#',
      '####G####'
    ] },
  /* THE GOLDEN CROWN, the gatekeeper: a pawn in each corner, and Humpty Dumpty's eggs on the few squares a knight reaches the top
     corners and the crown from, each good for one landing. Take the corner pawns from the eggs the crown does not need, and keep
     one for the last jump: that order is the whole puzzle (its hint, held against its proof: the last jump is off an egg). */
  { id:'lg2', kind:'knight', world:'lookingglass', leg:18, name:'The Golden Crown', badge:'Queen Alice Badge', mech:['knight', 'crack'], pay:1000, keeper:true, look:{ wall:'stone' },
    hint:'An egg holds you only once. Save the eggs you will need on the way to the crown, and use the others first.',
    moves:21, proof:'106,97,106,115,102,89,68,47,38,29,20,41,64,73,60,39,48,35,12,25,16',
    who:{ look:{ skin:'light', polo:'red', hat:'red', pants:'black', hair:'black', hairStyle:'short', cap:false, shoes:'black', gender:'male' } },
    say:['An egg holds you once. Jump off it and it breaks behind you.',
      'Count the eggs you need for the crown. Keep those for last.',
      'If a square can only be reached one way, that way is precious. Do not break it early.'],
    rows:[
      '#####C#####',
      '#p...Q...p#',
      '#..eh.he..#',
      '#.e~...~..#',
      '#....h....#',
      '#.h..p..h.#',
      '#....~....#',
      '#.~.....~.#',
      '#p.h...h.p#',
      '#.........#',
      '#L...@....#',
      '#####G#####'
    ] }
];

var PARSED = {};
function parse(G){ if (PARSED[G.id]) return PARSED[G.id]; var pawns = [], eggs = [];
  var Q = LIB().room(G, function(ch, i){ if (ch === 'p') pawns.push(i); else if (ch === 'e') eggs.push(i); else if ('h~Q'.indexOf(ch) < 0) return false; });
  Q.pawns = pawns; Q.eggs = eggs; Q.crown = Q.cell.indexOf('Q'); Q.full = (1 << pawns.length) - 1; return PARSED[G.id] = Q; }
function init(G){ return { p:parse(G).start, m:0, x:0, c:0 }; }
function key(s){ return s.p + ':' + s.m + ':' + s.x + (s.c ? ':c' : ''); }
// the tile a knight's jump j from tile i lands on, or -1 off the room
function jump(Q, i, j){ var c = i % Q.W + JUMPS[j][0], r = ((i / Q.W) | 0) + JUMPS[j][1]; return c < 0 || r < 0 || c >= Q.W || r >= Q.H ? -1 : r * Q.W + c; }
// can he land on tile n with eggs x broken; and if not, why not
function why(Q, n, x){ var ch = Q.cell[n]; if (ch === '#' || n === Q.lever || n === Q.chest || n === Q.gate) return 'bump';
  if (ch === 'h') return 'hedge'; if (ch === '~') return 'brook'; var k = Q.eggs.indexOf(n); if (k >= 0 && (x >> k & 1)) return 'broken'; return null; }
function isJump(Q, a, b){ for (var j = 0; j < 8; j++) if (jump(Q, a, j) === b) return true; return false; }
/* ONE TAP. The lever is Restart and the gate is out; a tile a knight's move away that he may land on is a jump: a pawn there is
   taken, and the egg he jumps off breaks behind him. */
function act(G, s, i){ var Q = parse(G);
  if (i === Q.lever) return { s:init(G), ev:'reset', moves:[] };
  if (i === Q.gate) return { s:s, ev:'exit', moves:[] };
  if (i < 0 || i >= Q.cell.length || i === s.p) return { s:s, ev:'bump', moves:[] };
  if (!isJump(Q, s.p, i)) return { s:s, ev:Q.cell[i] === '#' ? 'bump' : 'far', moves:[] };
  var w = why(Q, i, s.x); if (w) return { s:s, ev:w, moves:[] };
  var m = s.m, x = s.x, ev = 'jump', mv = [['me', s.p, i, 'jump']], kp = Q.pawns.indexOf(i), ke = Q.eggs.indexOf(s.p);
  if (ke >= 0){ x |= 1 << ke; mv.push(['egg', s.p, s.p, 'crack']); ev = 'crack'; }
  if (kp >= 0 && !(m >> kp & 1)){ m |= 1 << kp; mv.push(['pawn', i, i, 'take']); ev = 'take'; }
  var c = 0; if (i === Q.crown){ if (m !== Q.full) ev = 'early'; else { c = 1; ev = 'crown'; } }
  return { s:{ p:i, m:m, x:x, c:c }, ev:ev, moves:mv }; }
/* STUCK, looked up: every state a player can reach is searched once (lib.explore), and those the vault can still be reached
   from without the lever are kept; any other state is stuck, and the frame lights Restart. */
var GOOD = {};
function goodOf(G){ if (GOOD[G.id]) return GOOD[G.id]; var K = root.RTT_GYMKIND_KNIGHT, X = LIB().explore(K, G), N = X.list.length, back = [], i, ok = {};
  for (i = 0; i < N; i++) back.push([]); X.edges.forEach(function(e){ if (!e[2]) back[e[1]].push(e[0]); });
  var good = new Uint8Array(N), q = X.wins.map(function(w){ return w[0]; }); q.forEach(function(w){ good[w] = 1; });
  for (var h = 0; h < q.length; h++) back[q[h]].forEach(function(p){ if (!good[p]){ good[p] = 1; q.push(p); } });
  for (i = 0; i < N; i++) if (good[i]) ok[key(X.list[i])] = 1; return GOOD[G.id] = ok; }
function stuck(G, s){ return !goodOf(G)[key(s)]; }
function moves(G, s){ var Q = parse(G), out = []; for (var j = 0; j < 8; j++){ var n = jump(Q, s.p, j); if (n >= 0 && !why(Q, n, s.x)) out.push(n); } return out; }
// won once he has landed on the crown with every pawn taken (kept in the state, so a solved gym shown again with him back at the
// gate is still solved)
function won(G, s){ return !!s.c; }
function proof(G){ return (G.proof || '').split(',').filter(Boolean).map(Number); }
function enc(path){ return path.join(','); }
function goal(){ return 'Take every red pawn. Then jump onto the crown.'; }

/* ---- THE LOOK: the square's turf in soft warped greens, never a check, the little brooks sunk in it, clear blue. A hedge is a
   clipped green block knee high; a red pawn a chessman of the Red side; the gold square a gold tile with the crown on a cushion;
   an egg a white egg in a little nest, and a broken one its shell in pieces. Over him rides a little white knight's head, the way
   he moves. The squares he can jump to are the frame's highlights (moves). */
var DECK = 0.45;
function floor(gc){ if (gc.k === '#') return null; var k = gc.k === '~' ? 1 : gc.k === 'Q' ? 2 : 0;
  return { h:k === 1 ? DECK - 0.3 : DECK, mat:['knfloor', { gu:gc.u, gv:gc.v, gk:k, gr:gc.r, gc:gc.c }] }; }
function mats(){ return {
  knfloor:['', '', '', 0, function(c, R, h3){ var u = c.gu || 0, v = c.gv || 0, n = h3(c.ti, c.tj, 131);
    if (c.gk === 1){ var w = Math.sin(c.ti * 0.21 + Math.sin(c.tj * 0.17) * 2) + Math.sin(c.tj * 0.13 - c.ti * 0.08); return R(w > 1.2 ? '#e8f4ff' : w > 0.6 ? '#a8d4f4' : n > 0.6 ? '#4a8ac8' : '#3a7ab8'); }
    if (c.gk === 2){ var e = Math.min(u, v, 1 - u, 1 - v); return R(e < 0.08 ? '#a87a20' : n > 0.8 ? '#ffe9a0' : '#e8c050'); }
    if (c.dt < 0) return R('#3a5a2a'); var b = Math.sin(c.ti * 0.09 + Math.sin(c.tj * 0.07) * 1.6) + Math.sin(c.tj * 0.08 - c.ti * 0.05) * 0.8;
    return R(n > 0.97 ? '#ffffff' : n > 0.95 ? '#ffd84a' : b > 0.9 ? '#86c66c' : b < -0.9 ? '#5e9a4a' : n > 0.5 ? '#74b85e' : '#6aae56'); }] }; }

function view(R){ var Q = R.Q, T = R.T, ctx = R.ctx, s0 = null;
  function P(x, y, z){ return R.scr(x, y, z == null ? DECK + 0.015 : z); }
  function W0(x, y){ var b = P(x, y, DECK), e = P(x + T * 0.5, y, DECK); return [b, Math.max(4, Math.abs(e[0] - b[0]))]; }
  function rect(x, y, w, h, c){ ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); }
  function hedge(x, y){ var q = W0(x, y), b = q[0], rx = q[1]; rect(b[0] - rx, b[1] - rx * 1.1, rx * 2, rx * 1.1, '#2e6e34'); rect(b[0] - rx, b[1] - rx * 1.4, rx * 2, rx * 0.4, '#4e9a48');
    for (var k = 0; k < 6; k++) rect(b[0] - rx + k * rx * 0.34, b[1] - rx * (0.5 + (k % 2) * 0.3), rx * 0.18, rx * 0.16, '#1a4022'); }
  function pawn(cx, cy, rx, c, dk){ rect(cx - rx * 0.55, cy - rx * 0.25, rx * 1.1, rx * 0.25, dk); ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(cx - rx * 0.4, cy - rx * 0.25); ctx.lineTo(cx + rx * 0.4, cy - rx * 0.25); ctx.lineTo(cx + rx * 0.16, cy - rx * 1.05); ctx.lineTo(cx - rx * 0.16, cy - rx * 1.05); ctx.closePath(); ctx.fill();
    rect(cx - rx * 0.32, cy - rx * 1.15, rx * 0.64, rx * 0.12, dk); ctx.fillStyle = c; ctx.beginPath(); ctx.arc(cx, cy - rx * 1.42, rx * 0.3, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.arc(cx - rx * 0.1, cy - rx * 1.52, rx * 0.09, 0, 7); ctx.fill(); }
  function crown(cx, cy, rx, ts){ var g = R.reduce ? 0 : Math.sin(ts * 2.4) * rx * 0.06; rect(cx - rx * 0.6, cy - rx * 0.35 + g, rx * 1.2, rx * 0.3, '#c8283a');
    ctx.fillStyle = '#ffd84a'; ctx.beginPath(); ctx.moveTo(cx - rx * 0.5, cy - rx * 0.4 + g); for (var k = 0; k <= 4; k++){ ctx.lineTo(cx - rx * 0.5 + k * rx * 0.25, cy - rx * (k % 2 ? 0.75 : 1.05) + g); } ctx.lineTo(cx + rx * 0.5, cy - rx * 0.4 + g); ctx.closePath(); ctx.fill(); }
  function egg(cx, cy, rx, broken){ rect(cx - rx * 0.55, cy - rx * 0.2, rx * 1.1, rx * 0.22, '#a8844a');
    if (broken){ ctx.fillStyle = '#f4ecd8'; [[-0.3, -0.3], [0.15, -0.35], [0.35, -0.22]].forEach(function(o){ ctx.beginPath(); ctx.moveTo(cx + o[0] * rx, cy + o[1] * rx); ctx.lineTo(cx + (o[0] + 0.2) * rx, cy + (o[1] - 0.25) * rx); ctx.lineTo(cx + (o[0] + 0.28) * rx, cy + o[1] * rx); ctx.closePath(); ctx.fill(); }); return; }
    ctx.fillStyle = '#f4ecd8'; ctx.beginPath(); ctx.ellipse(cx, cy - rx * 0.6, rx * 0.36, rx * 0.5, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(cx - rx * 0.12, cy - rx * 0.78, rx * 0.1, rx * 0.14, 0, 0, 7); ctx.fill(); }
  function horse(cx, cy, rx){ ctx.fillStyle = '#f4f0e4'; ctx.strokeStyle = '#1a1a22'; ctx.lineWidth = Math.max(1, rx * 0.08);   // a white knight's head, the chessman
    ctx.beginPath(); ctx.moveTo(cx - rx * 0.4, cy); ctx.lineTo(cx + rx * 0.4, cy); ctx.lineTo(cx + rx * 0.3, cy - rx * 0.5); ctx.lineTo(cx + rx * 0.55, cy - rx * 0.8); ctx.lineTo(cx + rx * 0.2, cy - rx * 1.2); ctx.lineTo(cx - rx * 0.15, cy - rx * 1.15); ctx.lineTo(cx - rx * 0.4, cy - rx * 0.6); ctx.closePath(); ctx.fill(); ctx.stroke();
    rect(cx + rx * 0.1, cy - rx * 0.95, rx * 0.1, rx * 0.1, '#1a1a22'); }
  return {
    lay:function(s){ s0 = s; },
    move:function(m, u){ if (u < 1) return; var w = R.at(m[1]);
      if (m[0] === 'pawn'){ R.burst(w[0], w[1], DECK + 0.8, ['#ffffff', '#e8283a', '#8a1424'], 12, 0.8, 0.7); R.sfx('blip'); }
      if (m[0] === 'egg'){ R.burst(w[0], w[1], DECK + 0.4, ['#ffffff', '#f4ecd8', '#ffd84a'], 10, 0.7, 0.6); R.sfx('blip'); } },
    things:function(ds, tsec){ if (!s0) return; var s = s0;
      for (var i = 0; i < Q.cell.length; i++){ (function(i){ var ch = Q.cell[i]; if ('hpQe'.indexOf(ch) < 0) return; var w = R.at(i);
        ds.push({ x:w[0], y:w[1], kd:function(e, ts){ ts = ts || tsec; var q = W0(w[0], w[1]);
          if (ch === 'h') hedge(w[0], w[1]);
          else if (ch === 'p'){ if (!(s.m >> Q.pawns.indexOf(i) & 1)) pawn(q[0][0], q[0][1], q[1] * 0.75, '#c8283a', '#8a1424'); }
          else if (ch === 'Q') crown(q[0][0], q[0][1], q[1] * 0.8, ts);
          else if (ch === 'e'){ if (s.p !== i) egg(q[0][0], q[0][1], q[1] * 0.8, !!(s.x >> Q.eggs.indexOf(i) & 1)); } } }); })(i); }
      // the knight's head riding over him, the way he moves
      var me = R.at(s.p); ds.push({ x:me[0], y:me[1] + T * 0.3, kd:function(){ var c = P(me[0], me[1] + T * 0.3, DECK + T * 1.6), e2 = P(me[0] + T * 0.3, me[1], DECK), rx = Math.max(3, Math.abs(e2[0] - c[0])); horse(c[0] + rx * 0.9, c[1], rx); } }); },
    hot:function(s){ return movesFor(s); },
    ground:function(){ } };
  function movesFor(s){ var out = []; for (var j = 0; j < 8; j++){ var n = jump(Q, s.p, j); if (n >= 0 && !why(Q, n, s.x)) out.push(n); } return out; } }

root.RTT_GYMKIND_KNIGHT = { id:'knight', gyms:GYMS, input:'tap', calm:true, unit:'jump', hello:'You move like a knight. Tap a square two away and one to the side.',
  parse:parse, init:init, key:key, act:act, tap:act, moves:moves, won:won, stuck:stuck, proof:proof, enc:enc, goal:goal,
  me:function(G, s){ return s.p; }, place:function(G, s, i){ return { p:i, m:s.m, x:s.x, c:s.c || 0 }; },
  tell:{ take:'A red pawn, taken.', crack:'The egg breaks behind you.', broken:'That egg is broken. Nothing can land there now.', hedge:'A knight cannot land on a hedge. He can jump it.',
    brook:'A knight cannot land in a brook. He can jump it.', far:'A knight moves two squares one way and one to the side.', early:'The crown waits. Take every pawn first.',
    stuck:'No way to finish from here. Undo it, or Restart.' },
  dur:function(how){ return how === 'jump' ? 0.3 : 0.15; },
  floor:floor, mats:mats, view:view };
})();
