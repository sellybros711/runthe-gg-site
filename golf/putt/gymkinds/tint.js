/* golf/putt/gymkinds/tint.js: the LIGHT FILTER kind of trail gym (RTT_GYMKIND_TINT), Crystara's. A kind file: the
   registry (gyms.js, its KINDS README) finds it by its global, the frame (trail.js) plays it, check-putt proves it.

   THE PUZZLE. He walks the crystal hall carrying a colour of light. The clear crystal floor takes any light. The
   coloured crystal (rose, cyan or gold) is solid to every light but its own: carrying rose, the rose crystal is floor
   and the cyan and gold stand up as walls. Step onto a filter (a prism set in the floor) and his light turns its
   colour; the white filter makes it clear again, and clear light passes no coloured crystal at all. Light shards lie
   about the hall, and the vault opens once every shard is picked up. So the way across is a sequence of colours: the
   filter he needs is often behind the crystal of another, and the order he takes them in is the puzzle.

   THE GATEKEEPER'S TWIST is Volcano Island's cracking floor, as cracked crystal: a cracked tile breaks into the void
   the moment he steps off it, so he can cross it only once.

   He moves TILE BY TILE (a step kind: the stick, the arrows, the pad, or a tap toward a tile).

   THE LAYOUTS ARE HAND DESIGNED, never random. Row 0 is the far wall (the top of the screen), the last row the near
   wall with the gate in it. The frame's five characters (# G @ L C, gyms.js) and this kind's own:
     r b y   rose, cyan and gold crystal (floor only to that light)
     R B Y   the rose, cyan and gold filters      W   the white filter (clear light again)
     s       a light shard (picked up as he steps on it)
     %       cracked crystal (the gatekeeper's): it breaks once he steps off it

   THE STATE is { p, c, k, x }: where he stands, the colour he carries (0 clear, 1 rose, 2 cyan, 3 gold), the shards
   picked up (a bit a shard) and the cracked tiles broken (a bit a tile). A few thousand states, so solve() and audit()
   are the registry's own breadth first search (lib). */
(function(){
var root = typeof window !== 'undefined' ? window : globalThis;
var LIB = function(){ return root.RTT_PUTT_GYMS.lib; };

/* THE GYMS. moves and proof are the solver's fewest steps and one shortest solution (U R D L), recorded from solve().
   The civilian's lines nudge, never solve. */
var GYMS = [
  /* THE COLOUR HALL, mid-world: the vault behind a band of cyan crystal, the cyan filter behind rose, a shard behind gold. */
  { id:'crystara1', kind:'tint', world:'crystara', leg:9, name:'The Colour Hall', badge:'Prism Badge', mech:['tint'], pay:500, look:{ wall:'stone' },
    moves:21, proof:'UURRRUDLLULUUULLDURRU',
    who:{ look:{ skin:'tan', polo:'white', hat:'white', pants:'white', hair:'black', hairStyle:'short', cap:true, hatStyle:'ppastrohelmet', top:'ppspacesuit', shoes:'white', gender:'male' } },
    say:['Your light is your key. Only its own colour of crystal lets you through.',
      'Every filter is behind some other colour. Work out which one you need first.',
      'The white filter is not a waste. Sometimes clear light is the way back.'],
    rows:[
      '#########',
      '####C####',
      '#bbbbbbb#',
      '#.s#.#y.#',
      '#rr#B#yy#',
      '#.....rs#',
      '#R..W..Y#',
      '#.......#',
      '###L@####',
      '####G####'
    ] },
  /* THE RAINBOW VAULT, the gatekeeper: three colours, three shards, and cracked crystal that takes only one crossing. */
  { id:'crystara2', kind:'tint', world:'crystara', leg:18, name:'The Rainbow Vault', badge:'Crystal Badge', mech:['tint', 'crack'], pay:1000, keeper:true, look:{ wall:'stone' },
    moves:28, proof:'UUUULLUULDDDDRRRUURRRUUULLLU',
    who:{ look:{ skin:'brown', polo:'white', hat:'white', pants:'white', hair:'black', hairStyle:'bun', cap:true, hatStyle:'ppastrohelmet', top:'ppspacesuit', shoes:'white', gender:'female' } },
    say:['Cracked crystal takes you once. Then it is gone.',
      'Count your crossings before you start. A crack you need twice is a crack you lose.',
      'Walk the whole hall in your head first. A broken crack never comes back.'],
    rows:[
      '#########',
      '####C####',
      '#yyy%bbb#',
      '#s.#%#.s#',
      '#rr#.#bb#',
      '#Y.%.%.B#',
      '#..#R#..#',
      '#s.....W#',
      '#.......#',
      '###L@####',
      '####G####'
    ] }
];

var PARSED = {};
var COLS = { r:1, b:2, y:3 }, FILT = { R:1, B:2, Y:3, W:0 };
/* THE ROOM: the frame's five through lib.room, and the kind's own. Q.tint maps a coloured tile to its colour, Q.filt a
   filter tile to the colour it gives, Q.shards and Q.cracks list their tiles (a bit each). */
function parse(G){ if (PARSED[G.id]) return PARSED[G.id]; var tint = {}, filt = {}, shards = [], cracks = [];
  var Q = LIB().room(G, function(ch, i){ if (COLS[ch]){ tint[i] = COLS[ch]; return; } if (FILT[ch] != null){ filt[i] = FILT[ch]; return; }
    if (ch === 's'){ shards.push(i); return; } if (ch === '%'){ cracks.push(i); return; } return false; });
  Q.tint = tint; Q.filt = filt; Q.shards = shards; Q.cracks = cracks; Q.allK = (1 << shards.length) - 1;
  Q.cix = {}; cracks.forEach(function(i, j){ Q.cix[i] = j; });
  return PARSED[G.id] = Q; }
function init(G){ var Q = parse(G); return { p:Q.start, c:0, k:0, x:0 }; }
function key(s){ return s.p + ':' + s.c + ':' + s.k + ':' + s.x; }
// can he stand on tile n carrying colour c, with the cracks broken as in x
function open(Q, s, n, c){ if (n < 0 || Q.cell[n] === '#' || n === Q.lever || n === Q.chest || n === Q.gate) return false;
  var t = Q.tint[n]; if (t && t !== c) return false; var j = Q.cix[n]; if (j != null && (s.x & (1 << j))) return false; return true; }

/* ONE STEP. The frame's tiles first (the gate, the lever); the vault opens with every shard in hand; coloured crystal
   not his colour stops him, and so does a broken crack. Leaving a crack breaks it; arriving on a filter takes its
   colour; arriving on a shard picks it up. */
function act(G, s, d){ var Q = parse(G), L = LIB(), n = L.nb(Q, s.p, d);
  if (n === Q.chest) return s.k === Q.allK ? { s:s, ev:'open', moves:[] } : { s:s, ev:'shut', moves:[] };
  var f = L.frameStep(G, Q, s, s.p, d, init); if (f) return f;
  if (!open(Q, s, n, s.c)) return { s:s, ev:'bump', moves:[] };
  var c = s.c, k = s.k, x = s.x, mv = [['me', s.p, n, 'walk']], ev = 'step';
  var j0 = Q.cix[s.p]; if (j0 != null){ x |= 1 << j0; mv.push(['crack', s.p, s.p, 'break']); ev = 'break'; }
  var sj = Q.shards.indexOf(n); if (sj >= 0 && !(k & (1 << sj))){ k |= 1 << sj; mv.push(['shard', n, n, 'take']); ev = 'take'; }
  if (Q.filt[n] != null && Q.filt[n] !== c){ mv.push(['light', c, Q.filt[n], 'tint']); c = Q.filt[n]; ev = c ? 'tint' : 'clear'; }
  return { s:{ p:n, c:c, k:k, x:x }, ev:ev, moves:mv }; }
function moves(){ return [0, 1, 2, 3]; }
function proof(G){ return (G.proof || '').split('').map(function(ch){ return 'URDL'.indexOf(ch); }); }
function enc(path){ return path.map(function(d){ return 'URDL'.charAt(d); }).join(''); }
function goal(G){ return parse(G).shards.length > 1 ? 'Pick up every light shard, then step into the vault.' : 'Pick up the light shard, then step into the vault.'; }

/* ---- THE LOOK: clear crystal deck plates (pale cyan, a bright facet line), the coloured crystal a tinted plate, the
   filters a small prism on a white plate. In the room the crystal not his colour stands up as a block of that colour,
   his own colour lies flat as floor; shards are glinting white crystals, a broken crack is a hole onto the stars, and
   a ring of his light shines round him. */
var DECK = 0.45, WH = 0.9;
var HUE = ['#eef8ff', '#ff8ad8', '#5ce1ff', '#ffd34d'], DARK = ['#7a86c8', '#a83a8a', '#2a7aa8', '#a87a10'];
function floor(gc){ if (gc.k === '#') return null; var c = COLS[gc.k], f = FILT[gc.k];
  return { h:DECK, mat:[c ? 'ttint' : f != null ? 'tfilt' : 'tdeck', { gu:gc.u, gv:gc.v, tc:c || 0, tf:f == null ? -1 : f, ck:gc.k === '%' ? 1 : 0 }] }; }
function mats(){ return {
  tdeck:['', '', '', 0, function(c, R, h3){ var u = c.gu || 0, v = c.gv || 0, n = h3(c.ti, c.tj, 91); if (c.dt < 0 || u < 0.04 || u > 0.96 || v < 0.04 || v > 0.96) return R('#3a2a6a');
    if (c.ck && (Math.abs(u - v) < 0.05 || Math.abs(u + v - 1.1) < 0.04 || Math.abs(u - 0.3) < 0.03 && v > 0.5)) return R('#4a3a8a');
    if (Math.abs(u - v) < 0.04) return R('#ffffff'); if (u < 0.12 || v < 0.12) return R('#d8f4ff'); if (u > 0.88 || v > 0.88) return R('#7ab8d0'); return R(n < 0.1 ? '#a8e0ee' : '#9fd8e8'); }],
  ttint:['', '', '', 0, function(c, R, h3){ var u = c.gu || 0, v = c.gv || 0, t = c.tc || 1; if (c.dt < 0 || u < 0.04 || u > 0.96 || v < 0.04 || v > 0.96) return R('#3a2a6a');
    if (Math.abs(u - v) < 0.05) return R('#ffffff'); if (u < 0.12 || v < 0.12) return R(HUE[t]); return R(DARK[t]); }],
  tfilt:['', '', '', 0, function(c, R, h3){ var u = c.gu || 0, v = c.gv || 0, f = c.tf < 0 ? 0 : c.tf; if (c.dt < 0 || u < 0.04 || u > 0.96 || v < 0.04 || v > 0.96) return R('#3a2a6a');
    if (u < 0.1 || v < 0.1 || u > 0.9 || v > 0.9) return R(HUE[f]); return R('#f4f8ff'); }] }; }

function view(R){ var Q = R.Q, T = R.T, ctx = R.ctx, s0 = null, glow = null;
  function P(x, y, z){ return R.scr(x, y, z == null ? DECK + 0.015 : z); }
  // a block of coloured crystal standing up: a tinted box with a white facet down its face
  function block(x, y, t){ var hw = T * 0.46, b0 = P(x - hw, y + hw), b1 = P(x + hw, y + hw), t0 = P(x - hw, y + hw, DECK + WH), top0 = P(x - hw, y - hw, DECK + WH), top1 = P(x + hw, y - hw, DECK + WH), t1 = P(x + hw, y + hw, DECK + WH);
    ctx.fillStyle = DARK[t]; ctx.fillRect(b0[0], t0[1], b1[0] - b0[0], b0[1] - t0[1]);
    ctx.fillStyle = HUE[t]; ctx.beginPath(); ctx.moveTo(top0[0], top0[1]); ctx.lineTo(top1[0], top1[1]); ctx.lineTo(t1[0], t1[1]); ctx.lineTo(t0[0], t0[1]); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = Math.max(1, R.kk() * 0.7); ctx.beginPath(); ctx.moveTo(b0[0] + (b1[0] - b0[0]) * 0.25, b0[1]); ctx.lineTo(b0[0] + (b1[0] - b0[0]) * 0.45, t0[1]); ctx.stroke();
    ctx.strokeStyle = '#1a1036'; ctx.lineWidth = Math.max(1, R.kk() * 0.5); ctx.strokeRect(b0[0], t0[1], b1[0] - b0[0], b0[1] - t0[1]); }
  // a filter: a little prism standing on its plate, in its colour
  function filter(x, y, f, tsec){ var c = P(x, y, DECK + 0.05), e = P(x + T * 0.3, y), px = Math.max(3, Math.abs(e[0] - c[0])), top = P(x, y, DECK + T * 0.55);
    ctx.fillStyle = HUE[f]; ctx.strokeStyle = '#1a1036'; ctx.lineWidth = Math.max(1, R.kk() * 0.5);
    ctx.beginPath(); ctx.moveTo(c[0] - px, c[1]); ctx.lineTo(c[0] + px, c[1]); ctx.lineTo(top[0], top[1]); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.moveTo(c[0] - px * 0.6, c[1] - 1); ctx.lineTo(top[0] - 1, top[1] + px * 0.4); ctx.lineTo(top[0], top[1]); ctx.closePath(); ctx.fill();
    if (!R.reduce){ var g = 0.25 + 0.15 * Math.sin(tsec * 2.4 + x); ctx.fillStyle = 'rgba(255,255,255,' + g.toFixed(3) + ')'; ctx.beginPath(); ctx.arc(top[0], top[1], px * 0.5, 0, 7); ctx.fill(); } }
  // a light shard: a glinting white crystal
  function shard(x, y, tsec, j){ var c = P(x, y, DECK + T * 0.35), e = P(x + T * 0.3, y, DECK + T * 0.35), px = Math.max(2, Math.abs(e[0] - c[0]));
    var g = R.reduce ? 0.35 : 0.3 + 0.15 * Math.sin(tsec * 2.6 + j); ctx.fillStyle = 'rgba(220,250,255,' + g.toFixed(3) + ')'; ctx.beginPath(); ctx.arc(c[0], c[1], px * 1.6, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#3a2a6a'; ctx.lineWidth = Math.max(1, R.kk() * 0.5);
    ctx.beginPath(); ctx.moveTo(c[0], c[1] - px * 1.4); ctx.lineTo(c[0] + px * 0.7, c[1]); ctx.lineTo(c[0], c[1] + px * 0.6); ctx.lineTo(c[0] - px * 0.7, c[1]); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  // a broken crack: a hole onto the void, stars in it
  function hole(x, y){ var hw = T * 0.44, a = P(x - hw, y - hw), b = P(x + hw, y + hw); ctx.fillStyle = '#0e0820'; ctx.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
    ctx.fillStyle = '#ffffff'; for (var k = 0; k < 3; k++){ var sx = a[0] + (b[0] - a[0]) * ((k * 0.37 + 0.2) % 1), sy = a[1] + (b[1] - a[1]) * ((k * 0.61 + 0.3) % 1); ctx.fillRect(Math.round(sx), Math.round(sy), Math.max(1, R.kk()), Math.max(1, R.kk())); } }
  return {
    lay:function(s){ s0 = s; glow = null; },
    move:function(m, u){ if (u < 1) return; if (m[0] === 'shard'){ var q = R.at(m[1]); R.burst(q[0], q[1], DECK + 0.3, ['#ffffff', '#9ff0ff'], 8, 0.8, 0.6); }
      if (m[0] === 'crack'){ var q2 = R.at(m[1]); R.burst(q2[0], q2[1], DECK + 0.1, ['#9fd8e8', '#ffffff'], 10, 0.7, 0.5); R.sfx('blip'); }
      if (m[0] === 'light'){ var me = R.at(s0 ? s0.p : Q.start); R.burst(me[0], me[1], DECK + 0.5, [HUE[m[2]], '#ffffff'], 10, 0.8, 0.6); R.sfx('blip'); } },
    things:function(ds, tsec){ if (!s0) return; var s = s0;
      Object.keys(Q.tint).forEach(function(t){ var i = +t, c = Q.tint[i]; if (c === s.c) return; var w = R.at(i); ds.push({ x:w[0], y:w[1], kd:function(){ block(w[0], w[1], c); } }); });
      Object.keys(Q.filt).forEach(function(t){ var i = +t, w = R.at(i); ds.push({ x:w[0], y:w[1], kd:function(e, ts){ filter(w[0], w[1], Q.filt[i], ts || tsec); } }); });
      Q.shards.forEach(function(i, j){ if (s.k & (1 << j)) return; var w = R.at(i); ds.push({ x:w[0], y:w[1], kd:function(e, ts){ shard(w[0], w[1], ts || tsec, j); } }); }); },
    hot:function(){ return []; },
    ground:function(tsec){ if (!s0) return; var s = s0;
      Q.cracks.forEach(function(i, j){ if (s.x & (1 << j)){ var w = R.at(i); hole(w[0], w[1]); } });
      // his light: a ring of his colour on the floor round him (clear light is a faint white one)
      var me = R.at(s.p), c = P(me[0], me[1]), e = P(me[0] + T * 0.5, me[1]), rr = Math.abs(e[0] - c[0]);
      ctx.strokeStyle = s.c ? HUE[s.c] : 'rgba(255,255,255,0.6)'; ctx.lineWidth = Math.max(2, R.kk() * 1.4); ctx.beginPath(); ctx.ellipse(c[0], c[1], rr, rr * 0.55, 0, 0, 7); ctx.stroke(); } }; }

root.RTT_GYMKIND_TINT = { id:'tint', gyms:GYMS, input:'step', calm:true, unit:'step', hello:'Your light is your key. Step on a filter to change its colour.',
  parse:parse, init:init, key:key, act:act, step:act, moves:moves, proof:proof, enc:enc, goal:goal,
  me:function(G, s){ return s.p; }, place:function(G, s, i){ return { p:i, c:s.c, k:s.k, x:s.x }; },
  deck:function(G, s, i){ var Q = parse(G); return open(Q, s, i, s.c) || i === Q.lever; },
  tell:{ shut:'The vault stays shut. A shard is still out there.', tint:'Your light changes colour.', clear:'Your light is clear again.', 'break':'The cracked crystal breaks behind you.', stuck:'No way to finish from here. Undo it, or Restart.' },
  dur:function(){ return 0.15; },
  floor:floor, mats:mats, view:view };
})();
