/* golf/putt/gymkinds/runes.js: the RUNE PATH kind of trail gym (RTT_GYMKIND_RUNES), the Lost Temple's. A kind file: the
   registry (gyms.js, its KINDS README) finds it by its global, the frame (trail.js) plays it, check-putt proves it.

   THE PUZZLE. The floor is carved with symbols. A stone tablet laid on the far wall shows them in an order (sun, moon,
   star). He may only step on the symbol that comes next on the tablet, and the tablet goes round and round as he walks:
   sun, moon, star, sun, moon, star. A wrong symbol is a trap: darts fly, and he is thrown back to the start of the room.
   The plain slabs by the door are safe ground, and standing on one starts the tablet again from its first symbol.
   THE SEALS: some symbols are rimmed in gold. A gold rune lights when he steps on it in the tablet's order, and stays
   lit; the vault is sealed until every one is lit. A trap puts them all out; going back to the safe slabs does not.
   The aha is the route: every gold rune has to be reached on its beat, the beat is set by the floor, and the only way
   to change it is a loop or a walk back to the slabs, so the order the seals are taken in is the whole puzzle.

   THE GATEKEEPER'S TWIST: pressure stones. A stone is a mirror. Stepping on one turns the tablet round: the next symbol
   is the one he just came off, and from there it reads backwards (sun, moon, stone, moon, sun, star...), until a stone
   turns it back. So the symbols he just walked lead straight back the way he came, a corridor walked in is walked out
   again, and a stretch of floor that no forward reading can cross is crossed backwards.

   He moves TILE BY TILE (a step kind: the stick, the arrows, the pad, or a tap toward a tile), one symbol a step.

   THE LAYOUTS ARE HAND DESIGNED, never random. Row 0 is the far wall (the top of the screen), the last row the near wall
   with the gate in it. The frame's five characters (# G @ L C, gyms.js) and this kind's own:
     a b c d e   a carved symbol: a sun, a moon, a star, an eye, a wave (G.tablet says which are on the tablet, in
                 order; one that is not on it is always a trap)
     .           a plain slab: safe ground, and the tablet starts again from its first symbol (or its last, read backwards)
     p           a pressure stone (the gatekeeper's): safe to step on, and it turns the tablet round
     1 2 3 4 5   a gold rune (a seal): the symbol at that place on the tablet (1 its first), which has to be lit
   The far wall is two rows deep: the tablet lies on top of it, over the room and off the floor he plays on.

   THE STATE is { p, l, d, m }: where he stands, the tablet's place of the last symbol he stepped on (-1 on safe ground,
   so the next is the tablet's first), which way the tablet reads (1 forwards, -1 backwards), and the gold runes lit (a
   bit a seal). A trap is the start again, stones and seals and all. The search is a breadth first one over that (lib.solve), the audit lib.audit: a trap is an
   ordinary move back to the start, so no state is ever stuck, and every wrong step teaches and costs only the walk. */
(function(){
var root = typeof window !== 'undefined' ? window : globalThis;
var LIB = function(){ return root.RTT_PUTT_GYMS.lib; };
var SYMS = 'abcde';

/* THE GYMS. tablet is the order of the symbols, the civilian stands by the gate (three lines: a nudge, a plainer one
   after two restarts, a warmer one after five; never the moves or a tile), and moves and proof are the solver's fewest
   steps and one shortest solution (U R D L), recorded from solve(). The guide for the owner (the aha and the solution
   step by step) is kept outside the game. */
var GYMS = [
  /* THE GLYPH HALL, mid-world (the trail into hole 9). Sun, moon, star, and ten gold runes on a floor five wide, the
     vault in its top row. Three gold runes sit in the row by the safe slabs, and the slabs start the tablet again without
     putting the gold out, so walking back to them is part of the route. A ring of six tiles reads round to the beat it
     started on, so walking one is how the beat is changed, and the order the gold is taken in is the puzzle. */
  { id:'temple1', kind:'runes', world:'temple', leg:9, name:'The Glyph Hall', badge:'Glyph Badge', mech:['rune'], pay:500, look:{ wall:'stone' },
    tablet:'abc', moves:49, proof:'LUUUURDDLUURRRDDDDLUURDDLULDLULUUUURUULDDRURDRUUL',
    who:{ look:{ skin:'light', polo:'teal', hat:'white', pants:'khaki', hair:'auburn', hairStyle:'ponytail', cap:true, hatStyle:'cap', gender:'female' } },
    say:['I got darted four times in there before lunch. The tablet on the back wall isn\'t decoration.',
      'It goes round and round. Sun, moon, star, then sun again. Every single step.',
      'Hey, you\'re close. Stop staring at the vault. The good path wanders off first.'],
    rows:[
      '#######',
      '#######',
      '#acCac#',
      '#2bccb#',
      '#caa2c#',
      '#babc1#',
      '#1c3ab#',
      '#c2a2c#',
      '#2a2a1#',
      '#L.@..#',
      '###G###'
    ] },
  /* THE SUNKEN SHRINE, guarding the trail into the world's last hole. Sun, moon, star, eye, ten gold runes and two
     stones. Reading forwards only, no order of the gold works (the search finds none with the stones walled off): some
     gold can only be reached on its beat backwards, so each stone is walked to, pressed, and walked back from. */
  { id:'temple2', kind:'runes', world:'temple', leg:18, name:'The Sunken Shrine', badge:'Shrine Badge', mech:['rune', 'stone'], pay:1000, keeper:true, look:{ wall:'stone' },
    tablet:'abcd', moves:59, proof:'LUUUURRRDULDRLURDULLLDDDDRRULDRUURUDLDDLLUUUURULLDUURRRRULL',
    who:{ look:{ skin:'deep', polo:'purple', hat:'white', pants:'stone', hair:'black', hairStyle:'short', cap:false, gender:'male' } },
    say:['Those round stones in the floor? Step on one and the whole tablet flips on you. Ask me how I know.',
      'Backwards isn\'t wrong in there. Backwards is how you get home.',
      'You\'re doing fine. Sometimes the way forward is walking back the way you came.'],
    rows:[
      '#######',
      '#######',
      '#bbCa4#',
      '#3d1b3#',
      '#p3bad#',
      '#3da2c#',
      '#acb1p#',
      '#bbc3b#',
      '#da3dd#',
      '#L.@..#',
      '###G###'
    ] }
];

/* ---- THE ROOM: the frame's five characters through lib.room, and this kind's: symbols, safe slabs and stones */
var PARSED = {};
function parse(G){ if (PARSED[G.id]) return PARSED[G.id];
  var Q = LIB().room(G, function(ch){ return SYMS.indexOf(ch) >= 0 || ch === 'p' || (ch >= '1' && ch <= '5') ? true : false; });
  var tab = G.tablet || 'abc'; Q.tab = tab; Q.n = tab.length; Q.stones = []; Q.runes = []; Q.seal = {}; Q.seals = [];
  // a seal is written as the tablet place of its symbol (1 its first): it becomes that symbol, with a bit of its own
  Q.cell.forEach(function(k, i){ if (k >= '1' && k <= '5'){ if (+k > tab.length) throw new Error(G.id + ': seal ' + k + ' is past the tablet'); Q.seal[i] = Q.seals.length; Q.seals.push(i); Q.cell[i] = k = tab.charAt(+k - 1); }
    if (k === 'p') Q.stones.push(i); else if (SYMS.indexOf(k) >= 0) Q.runes.push(i); });
  if (Q.seals.length > 20) throw new Error(G.id + ': too many seals');
  Q.all = (1 << Q.seals.length) - 1;
  return PARSED[G.id] = Q; }
function init(G){ return { p:parse(G).start, l:-1, d:1, m:0 }; }
function key(s){ return s.p + ',' + s.l + ',' + s.d + ',' + s.m; }
// which place on the tablet comes next: the first (or the last, read backwards) from safe ground
function next(Q, s){ return s.l < 0 ? (s.d > 0 ? 0 : Q.n - 1) : ((s.l + s.d) % Q.n + Q.n) % Q.n; }

/* ONE STEP. The frame's tiles first (a wall, the gate, the lever, the vault), then: a plain slab is safe and starts the
   tablet again; a stone turns it round; the symbol that comes next is a step; any other symbol is a trap, and he is
   thrown back to the start with the tablet as it began. moves: his step, then the trap's darts and his flight back. */
function act(G, s, d){ var Q = parse(G), L = LIB(), n = L.nb(Q, s.p, d);
  // the vault stays sealed until every gold rune is lit
  if (n >= 0 && n === Q.chest && s.m !== Q.all) return { s:s, ev:'sealed', moves:[] };
  var f = L.frameStep(G, Q, s, s.p, d, init); if (f) return f;
  var k = Q.cell[n], walk = ['me', s.p, n, 'walk'];
  if (k === '.') return { s:{ p:n, l:-1, d:s.d, m:s.m }, ev:'walk', moves:[walk] };
  // a stone is a mirror: the tablet turns round and reads back from the symbol he came off, so the way in is the way out
  if (k === 'p') return { s:{ p:n, l:s.l < 0 ? -1 : ((s.l + s.d) % Q.n + Q.n) % Q.n, d:-s.d, m:s.m }, ev:'stone', moves:[walk, ['stone', n, n, 'press']] };
  var at = Q.tab.indexOf(k);
  if (at >= 0 && at === next(Q, s)){ var b = Q.seal[n], m = b == null ? s.m : s.m | (1 << b);
    return { s:{ p:n, l:at, d:s.d, m:m }, ev:'rune', moves:[walk, ['rune', n, n, m !== s.m ? 'seal' : 'lit']] }; }
  return { s:init(G), ev:'trap', moves:[walk, ['trap', n, n, 'trap'], ['me', n, Q.start, 'thrown']] }; }
function moves(){ return [0, 1, 2, 3]; }
/* STUCK: no step leads on to the vault (Restart aside). A trap is a step back to the start, so this is rare, but it is
   answered exactly: the whole room is searched once (lib.explore), the states that reach the vault found by a search
   backwards over the steps (the lever left out), and remembered for the gym. lib.audit holds it to its own search. */
var GOOD = {};
function stuck(G, s){ var g = GOOD[G.id];
  if (!g){ var K = root.RTT_GYMKIND_RUNES, X = LIB().explore(K, G), N = X.list.length, back = [], i; for (i = 0; i < N; i++) back.push([]);
    X.edges.forEach(function(e){ if (!e[2]) back[e[1]].push(e[0]); });
    var ok = new Uint8Array(N), q = X.wins.map(function(w){ return w[0]; }); q.forEach(function(w){ ok[w] = 1; });
    for (var h = 0; h < q.length; h++) back[q[h]].forEach(function(p){ if (!ok[p]){ ok[p] = 1; q.push(p); } });
    g = GOOD[G.id] = { seen:X.seen, ok:ok }; }
  var at = g.seen[key(s)]; return at == null ? false : !g.ok[at]; }
function proof(G){ return (G.proof || '').split('').map(function(ch){ return 'URDL'.indexOf(ch); }); }
function enc(path){ return path.map(function(d){ return 'URDL'.charAt(d); }).join(''); }
function goal(G){ return parse(G).stones.length ? 'Follow the tablet. Light every gold rune. Stones turn it round.' : 'Follow the tablet. Light every gold rune, then open the vault.'; }

/* ---- THE LOOK: the Lost Temple's own. Sandstone slabs with a dark seam round each, the symbols cut into them and
   inlaid in colour (each its own shape and its own colour, so neither alone has to be read), the tablet in pale stone
   on the far wall, and the stones round with a spiral cut in them. */
var DECK = 0.45, WALLTOP = 0.95;
var COL = { a:'#ffc93a', b:'#8fd3ff', c:'#ff8fb4', d:'#7be08f', e:'#c7a2ff' };
var SLAB = { temple:['#cdb488', '#c2a77a', '#7c6440', '#e2cfa4'] };
function floor(gc){ if (gc.k === '#') return null; return { h:DECK, mat:['rslab', { gu:gc.u, gv:gc.v, gc:gc.c, gr:gc.r, safe:gc.k === '.' || gc.k === 'L' || gc.k === 'C' }] }; }
function mats(th){ var S = SLAB[th] || SLAB.temple;
  return { rslab:['', '', '', 0, function(c, R, h3){ var u = c.gu || 0, v = c.gv || 0, e = u < 0.06 || u > 0.94 || v < 0.06 || v > 0.94, n = h3(c.ti, c.tj, 47);
    if (c.dt < 0 || e) return R(S[2]);
    // a safe slab is one smooth stone with a border cut round it; a carved one is weathered
    if (c.safe){ var bd = u < 0.14 || u > 0.86 || v < 0.14 || v > 0.86; return R(bd ? S[1] : n < 0.06 ? S[1] : S[3]); }
    return R(n < 0.07 ? S[2] : n < 0.3 ? S[1] : S[0]); }] }; }

/* A SYMBOL, drawn in a unit square (0 to 1 across and down it): each its own filled shape in its own colour, so either
   alone tells them apart at a glance on a phone. glyph() is the outline path (for the stones' spiral too); sym() draws
   one filled, with a dark rim. */
function glyph(ctx, k){ ctx.beginPath();
  if (k === 'a'){ ctx.arc(0.5, 0.5, 0.17, 0, 7); for (var i = 0; i < 8; i++){ var a = i * Math.PI / 4; ctx.moveTo(0.5 + Math.cos(a) * 0.25, 0.5 + Math.sin(a) * 0.25); ctx.lineTo(0.5 + Math.cos(a) * 0.37, 0.5 + Math.sin(a) * 0.37); } }
  else if (k === 'b'){ ctx.arc(0.5, 0.5, 0.33, 0.75, 2 * Math.PI - 0.75, false); ctx.arc(0.64, 0.5, 0.25, 2 * Math.PI - 1.45, 1.45, true); ctx.closePath(); }
  else if (k === 'c'){ for (var j = 0; j < 10; j++){ var r = j % 2 ? 0.15 : 0.37, b = -Math.PI / 2 + j * Math.PI / 5, x = 0.5 + Math.cos(b) * r, y = 0.54 + Math.sin(b) * r; if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.closePath(); }
  else if (k === 'd'){ ctx.moveTo(0.1, 0.5); ctx.quadraticCurveTo(0.5, 0.08, 0.9, 0.5); ctx.quadraticCurveTo(0.5, 0.92, 0.1, 0.5); ctx.closePath(); }
  else if (k === 'e'){ ctx.moveTo(0.14, 0.6); for (var q = 0; q < 4; q++) ctx.quadraticCurveTo(0.22 + q * 0.18, q % 2 ? 0.76 : 0.26, 0.32 + q * 0.18, 0.5); }
  else if (k === 'p'){ ctx.arc(0.5, 0.5, 0.3, 0, 7); ctx.moveTo(0.5, 0.5); for (var t = 0; t < 26; t++){ var an = t * 0.5, rr = 0.012 * t; ctx.lineTo(0.5 + Math.cos(an) * rr, 0.5 + Math.sin(an) * rr); } } }
function sym(ctx, k, rim){ var col = COL[k] || '#ffffff'; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (k === 'a'){ glyph(ctx, k); ctx.strokeStyle = rim; ctx.lineWidth = 0.17; ctx.stroke(); ctx.strokeStyle = col; ctx.lineWidth = 0.09; ctx.stroke();
    ctx.beginPath(); ctx.arc(0.5, 0.5, 0.17, 0, 7); ctx.fillStyle = col; ctx.fill(); return; }
  if (k === 'e'){ glyph(ctx, k); ctx.strokeStyle = rim; ctx.lineWidth = 0.2; ctx.stroke(); ctx.strokeStyle = col; ctx.lineWidth = 0.11; ctx.stroke(); return; }
  glyph(ctx, k); ctx.strokeStyle = rim; ctx.lineWidth = 0.1; ctx.stroke(); ctx.fillStyle = col; ctx.fill();
  if (k === 'd'){ ctx.beginPath(); ctx.arc(0.5, 0.5, 0.13, 0, 7); ctx.fillStyle = '#123a1c'; ctx.fill(); ctx.beginPath(); ctx.arc(0.46, 0.46, 0.04, 0, 7); ctx.fillStyle = '#ffffff'; ctx.fill(); } }

/* WHAT MOVES, DRAWN (the frame's room R, browser only). Nothing in here stands up: the symbols, the stones, the tablet
   and the traps are all drawn on the floor (ground), over the baked slabs, so the golfer always stands in front of them. */
function view(R){ var Q = R.Q, T = R.T, s0 = null, fl = null, ctx = R.ctx;
  // the floor's projection for a tile: its far left corner and how far across and down it reaches on the screen
  function basis(i, z){ var c = i % Q.W, r = (i / Q.W) | 0, x = R.x0 + c * T, y = R.y0 + r * T, o = R.scr(x, y, z), ex = R.scr(x + T, y, z), ey = R.scr(x, y + T, z);
    return [ex[0] - o[0], ex[1] - o[1], ey[0] - o[0], ey[1] - o[1], o[0], o[1]]; }
  function inTile(i, z, fn){ var B = basis(i, z); ctx.save(); ctx.transform(B[0], B[1], B[2], B[3], B[4], B[5]); fn(B); ctx.restore(); }
  function px(B){ return 1 / Math.max(1, Math.hypot(B[0], B[1])); }   // one device pixel, in the tile's unit square
  // a symbol inlaid in the floor: a round plate tinted its colour, the symbol filled on it, brighter where he stands
  // a seal: a gold square round the plate, dull until lit, then bright with the gold glowing on the slab
  function carve(i, k, lit, seal, on){ inTile(i, DECK + 0.01, function(B){ var col = COL[k] || '#ffffff', p1 = px(B);
    if (seal){ if (on){ ctx.fillStyle = 'rgba(255,214,70,0.55)'; ctx.fillRect(0.05, 0.05, 0.9, 0.9); }
      ctx.strokeStyle = on ? '#fff0a0' : '#b8902a'; ctx.lineWidth = Math.max(0.06, 3 * p1); ctx.strokeRect(0.08, 0.08, 0.84, 0.84);
      ctx.strokeStyle = on ? '#e8a400' : '#6a4a14'; ctx.lineWidth = Math.max(0.025, 1.2 * p1); ctx.strokeRect(0.15, 0.15, 0.7, 0.7); }
    ctx.globalAlpha = lit ? 0.75 : 0.32; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0.5, 0.5, 0.4, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    ctx.save(); ctx.translate(0.09, 0.09); ctx.scale(0.82, 0.82); sym(ctx, k, 'rgba(50,30,10,0.85)'); ctx.restore(); }); }
  // a pressure stone: a round plate standing proud of the floor, or pressed flush and glowing when it has turned the tablet
  function stone(i, down){ inTile(i, DECK + (down ? 0.01 : 0.12), function(B){ var p1 = px(B);
    ctx.fillStyle = 'rgba(40,26,10,0.45)'; ctx.beginPath(); ctx.arc(0.5, 0.56, 0.38, 0, 7); ctx.fill();
    ctx.fillStyle = down ? '#e8a24a' : '#b9a27a'; ctx.strokeStyle = '#5a4428'; ctx.lineWidth = 2 * p1; ctx.beginPath(); ctx.arc(0.5, 0.5, 0.36, 0, 7); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = down ? '#fff2c8' : '#6e5a3c'; ctx.lineWidth = Math.max(0.05, 2 * p1); ctx.lineCap = 'round'; glyph(ctx, 'p'); ctx.stroke(); }); }
  /* THE TABLET, laid on the far wall's top: its symbols in order with arrows between them the way it reads, and after
     the last a faded copy of the one that comes round again, so it says it repeats. The symbol that comes next is
     ringed. Read backwards (a stone), the arrows point the other way and turn orange. It is wall, not floor: nothing
     he can step on is under it. */
  function tablet(s, tsec){ var n = Q.n, slots = n + 1, wl = Math.min(Q.W - 2, slots * 1.45 + 0.5), x0 = R.x0 + (Q.W - wl) / 2 * T, y0 = R.y0 + 0.2 * T, y1 = R.y0 + 1.8 * T, z = DECK + WALLTOP + 0.06;
    var a = R.scr(x0, y0, z), b = R.scr(x0 + wl * T, y0, z), c = R.scr(x0 + wl * T, y1, z), dd = R.scr(x0, y1, z), dn = R.scr(x0, y1, DECK + WALLTOP - 0.25), lw = Math.max(1.5, R.kk() * 1.1);
    var back = s.d < 0, nx = next(Q, s), w = c[0] - dd[0], h = c[1] - b[1], cell = (w - 0.5 / wl * w) / slots, left = dd[0] + 0.25 / wl * w, ns = Q.seals.length, cy = a[1] + h * (ns ? 0.4 : 0.5), sz = Math.min(cell * 0.82, h * (ns ? 0.62 : 0.8));
    ctx.save();
    ctx.fillStyle = '#6b5434'; ctx.beginPath(); ctx.moveTo(dd[0], dd[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(c[0], c[1] + (dn[1] - dd[1])); ctx.lineTo(dd[0], dn[1]); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e9dcb6'; ctx.strokeStyle = '#7c6440'; ctx.lineWidth = Math.max(1, R.kk() * 0.8); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(dd[0], dd[1]); ctx.closePath(); ctx.fill(); ctx.stroke();
    for (var k = 0; k < slots; k++){ var ghost = back ? k === 0 : k === n, si = ghost ? (back ? n - 1 : 0) : back ? k - 1 : k, ch = Q.tab.charAt(si), cx = left + (k + 0.5) * cell;
      if (!ghost && si === nx){ ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.strokeStyle = back ? '#ff8a2a' : '#e8a400'; ctx.lineWidth = lw * 1.3;
        ctx.beginPath(); ctx.arc(cx, cy, sz * 0.6, 0, 7); ctx.fill(); ctx.globalAlpha = R.reduce ? 1 : 0.65 + 0.35 * Math.sin(tsec * 4); ctx.stroke(); ctx.globalAlpha = 1; }
      ctx.save(); ctx.globalAlpha = ghost ? 0.38 : 1; ctx.translate(cx - sz / 2, cy - sz / 2); ctx.scale(sz, sz); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      sym(ctx, ch, 'rgba(60,38,14,0.9)'); ctx.restore();
      // the arrow to the next slot, the way it reads
      if (k < slots - 1){ var tx = cx + cell / 2, ar = Math.max(2, sz * 0.13), dir = back ? -1 : 1;
        ctx.strokeStyle = back ? '#d0641a' : '#9a7a3a'; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(tx - dir * ar * 0.6, cy - ar); ctx.lineTo(tx + dir * ar * 0.6, cy); ctx.lineTo(tx - dir * ar * 0.6, cy + ar); ctx.stroke(); } }
    // the seals, a gold pip each along the tablet's foot: bright once lit
    var pr = Math.max(2.5, h * 0.085), gap = Math.min(pr * 3, (w * 0.86) / Math.max(1, ns)), px0 = (dd[0] + c[0]) / 2 - gap * (ns - 1) / 2, py = a[1] + h * 0.85;
    for (var q = 0; q < ns; q++){ var lit = !!(s.m & (1 << q)); ctx.fillStyle = lit ? '#ffd23a' : '#8a7a5a'; ctx.strokeStyle = lit ? '#fff4b0' : '#5a4a30'; ctx.lineWidth = Math.max(1, R.kk() * 0.6);
      ctx.beginPath(); ctx.moveTo(px0 + q * gap, py - pr); ctx.lineTo(px0 + q * gap + pr, py); ctx.lineTo(px0 + q * gap, py + pr); ctx.lineTo(px0 + q * gap - pr, py); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    ctx.restore(); }
  // a trap going off: the tile flashes red, darts cross it, and a puff of dust where he lands
  function trap(tsec){ if (!fl) return; var age = tsec - fl.t; if (age > 0.9){ fl = null; return; }
    inTile(fl.i, DECK + 0.02, function(B){ var p1 = px(B), a = Math.max(0, 1 - age / 0.9); ctx.fillStyle = 'rgba(220,40,20,' + (0.55 * a).toFixed(3) + ')'; ctx.fillRect(0.04, 0.04, 0.92, 0.92);
      ctx.strokeStyle = 'rgba(60,30,10,' + a.toFixed(3) + ')'; ctx.lineWidth = 3 * p1; for (var q = 0; q < 3; q++){ var u = Math.min(1, age / 0.35) * 1.6 - 0.3, y = 0.25 + q * 0.25; ctx.beginPath(); ctx.moveTo(u - 0.3, y); ctx.lineTo(u, y); ctx.stroke(); } }); }
  return {
    lay:function(s){ s0 = s; },
    move:function(m, u, tsec){ if (m[3] === 'trap' && (!fl || fl.i !== m[1] || tsec - fl.t > 1)){ fl = { i:m[1], t:tsec || 0 }; var q = R.at(m[1]); R.burst(q[0], q[1], DECK + 0.6, ['#e8d8b0', '#c8a070', '#8a2a14'], 12, 1.2, 0.9); R.sfx('blip'); R.say('A trap! Back to the start.', 2600); }
      if (m[3] === 'seal' && u >= 1){ var q3 = R.at(m[1]); R.burst(q3[0], q3[1], DECK + 0.5, ['#ffd23a', '#fff4b0'], 10, 1, 0.7); R.sfx('blip'); }
      if (m[3] === 'press' && u >= 1){ var q2 = R.at(m[1]); R.burst(q2[0], q2[1], DECK + 0.4, ['#ffd27a', '#e8a24a'], 8, 1, 0.6); R.sfx('blip'); R.say('The stone clicked. The tablet turned round.', 2600); } },
    things:function(){},
    // the tiles he may step on next: the symbol that comes next beside him, and a stone (the frame rings them softly)
    hot:function(s){ var out = []; for (var d = 0; d < 4; d++){ var r = act(R.G, s, d); if (r.ev === 'rune' || r.ev === 'stone') out.push(r.moves[0][2]); } return out; },
    ground:function(tsec){ if (!s0) return; var s = s0;
      Q.runes.forEach(function(i){ var b = Q.seal[i]; carve(i, Q.cell[i], i === s.p, b != null, b != null && !!(s.m & (1 << b))); });
      Q.stones.forEach(function(i){ stone(i, s.d < 0); });
      tablet(s, tsec); trap(tsec); } }; }

root.RTT_GYMKIND_RUNES = { id:'runes', gyms:GYMS, input:'step', calm:true, unit:'step', hello:'One tile a step. Undo takes one back.',
  parse:parse, init:init, key:key, act:act, step:act, moves:moves, stuck:stuck, proof:proof, enc:enc, goal:goal, next:function(G, s){ return next(parse(G), s); },
  me:function(G, s){ return s.p; }, place:function(G, s, i){ return { p:i, l:s.l, d:s.d, m:s.m }; },
  tell:{ sealed:'The vault is sealed. Light every gold rune first.' },
  dur:function(how){ return how === 'thrown' ? 0.45 : how === 'trap' ? 0.3 : how === 'press' ? 0.12 : how === 'lit' || how === 'seal' ? 0.01 : 0.15; },
  floor:floor, mats:mats, view:view };
})();
