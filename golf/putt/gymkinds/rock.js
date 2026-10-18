/* golf/putt/gymkinds/rock.js: the COOLING ROCK kind of trail gym (RTT_GYMKIND_ROCK), Volcano Island's. A kind file: the
   registry (gyms.js, its KINDS README) finds it by its global, the frame (trail.js) plays it, check-putt proves it.

   THE PUZZLE. The floor is a crust of cooling rock over lava. Every tile of it cracks and falls into the lava the moment
   he steps off it, so he can never stand on it again. The vault opens only when the whole floor is gone: he has to walk
   a path that crosses every tile exactly once and ends at the vault. A step onto lava is no step at all, a step into the
   vault with rock still standing finds it shut, and a walk that strands a tile is lost (Restart lights). The aha is in
   the corners and the nooks: a tile with one way in has to be the first or the last, and the obvious snake leaves one
   tile behind.

   THE GATEKEEPER'S TWIST: thick rock. A thick tile takes two crossings before it cracks through (the first leaves it
   split, the second drops it), so he has to come back over it once, and only once. A thick tile is a crossroads: the
   path can cross itself there, which is the only way through a floor no single snake can cover.

   He moves TILE BY TILE (a step kind: the stick, the arrows, the pad, or a tap toward a tile).

   THE LAYOUTS ARE HAND DESIGNED, never random. Row 0 is the far wall (the top of the screen), the last row the near wall
   with the gate in it. The frame's five characters (# G @ L C, gyms.js) and this kind's own:
     r   cooling rock: cracks into lava when he steps off it
     R   thick rock (the gatekeeper's): cracks when he steps off it, falls in the second time
   The start (@) and the lever are solid ground. The far wall is two rows deep, and the count of the rock still
   standing glows on it, off the floor he plays on.

   THE STATE is { p, m, n }: where he stands, the tiles stepped off at least once (a bit a tile) and the thick tiles
   stepped off twice. A tile is lava when its bit is in m (thick: in n). solve() is a breadth first search over that;
   stuck() asks, by a search remembered for the gym, whether the rest of the floor can still be crossed to the vault,
   and audit() holds that answer to a backward search over every state a player can reach. */
(function(){
var root = typeof window !== 'undefined' ? window : globalThis;
var LIB = function(){ return root.RTT_PUTT_GYMS.lib; };

/* THE GYMS. The civilian stands by the gate (three lines: a nudge, a plainer one after two restarts, a warmer one after
   five; never the moves or a tile), and moves and proof are the solver's fewest steps and one shortest solution (U R D
   L), recorded from solve(). The guide for the owner (the aha and the solution step by step) is kept outside the game. */
var GYMS = [
  { id:'volcano1', kind:'rock', world:'volcano', leg:9, name:'The Cinder Floor', badge:'Cinder Badge', mech:['crack'], pay:500, look:{ wall:'stone' },
    moves:25, proof:'UURRDRUULULDLLDLDLUURURRU',
    who:{ look:{ skin:'tan', polo:'black', hat:'gold', pants:'khaki', hair:'black', hairStyle:'short', cap:true, hatStyle:'cap', gender:'male' } },
    say:['Every rock in there drops into the lava the second you step off it. No second chances.',
      'Look for the tiles with only one way in. Those decide everything.',
      'Don\'t rush the open middle. It\'s the corners that bite you.'],
    rows:[
      '#########',
      '#########',
      '####C####',
      '##rrrrr##',
      '#rrrrrrr#',
      '#rrrrrrr#',
      '#rr#r#rr#',
      '###L@####',
      '####G####'
    ] },
  { id:'volcano2', kind:'rock', world:'volcano', leg:18, name:'The Caldera', badge:'Caldera Badge', mech:['crack', 'thick'], pay:1000, keeper:true, look:{ wall:'stone' },
    moves:32, proof:'UURLLLDLUURULURRDRRRDDDRUUUULLLU',
    who:{ look:{ skin:'light', polo:'gold', hat:'white', pants:'navy', hair:'blonde', hairStyle:'ponytail', cap:false, gender:'female' } },
    say:['See the striped rock in there? It\'s thicker. Takes two trips before it gives.',
      'You can\'t walk every tile in one line. You\'ve got to cross your own path somewhere.',
      'The thick rock is where you cross. Plan the second trip before you take the first.'],
    rows:[
      '#########',
      '#########',
      '####C####',
      '#rrrrrrr#',
      '#rrrrrrr#',
      '#rr###rr#',
      '#rrrRrrr#',
      '#rr#r#rr#',
      '###L@####',
      '####G####'
    ] }
];

/* ---- THE ROOM: the frame's five characters through lib.room, and this kind's rock. Q.bit[i] is a field tile's bit,
   Q.field its tiles, Q.thick the bits of the thick ones, Q.all every bit. */
var PARSED = {};
function parse(G){ if (PARSED[G.id]) return PARSED[G.id]; var field = [], thick = 0;
  var Q = LIB().room(G, function(ch, i){ if (ch !== 'r' && ch !== 'R') return false; if (ch === 'R') thick |= 1 << field.length; field.push(i); });
  if (field.length > 30) throw new Error(G.id + ': too many rock tiles to keep as a mask (' + field.length + ')');
  Q.field = field; Q.bit = {}; field.forEach(function(i, k){ Q.bit[i] = k; }); Q.thick = thick; Q.all = field.length === 31 ? -1 : (1 << field.length) - 1;
  return PARSED[G.id] = Q; }
function init(G){ return { p:parse(G).start, m:0, n:0 }; }
function key(s){ return s.p + ':' + s.m + ':' + s.n; }
// a tile is lava: stepped off once (thick: twice)
function lava(Q, s, i){ var b = Q.bit[i]; if (b == null) return false; var f = 1 << b; return Q.thick & f ? !!(s.n & f) : !!(s.m & f); }
// what is left standing: a thick tile counts twice until its first crossing
function left(Q, s){ var c = 0; for (var k = 0; k < Q.field.length; k++){ var f = 1 << k; if (Q.thick & f){ if (!(s.n & f)) c += s.m & f ? 1 : 2; } else if (!(s.m & f)) c++; } return c; }
// stepping off tile p: it cracks (a thick tile the first time) or falls in
function off(Q, s, p){ var b = Q.bit[p]; if (b == null) return { m:s.m, n:s.n }; var f = 1 << b;
  if (Q.thick & f && s.m & f) return { m:s.m, n:s.n | f }; return { m:s.m | f, n:s.n }; }

/* ONE STEP. The frame's tiles first (a wall, the gate, the lever), then: the vault opens only when the tile he leaves
   is the last rock standing; lava is no step; anything else is a step, and the tile he left cracks behind him.
   moves: the tile he leaves cracking (with his step, so it goes as he goes), then his step. */
function act(G, s, d){ var Q = parse(G), L = LIB(), n = L.nb(Q, s.p, d), k = n < 0 ? '#' : Q.cell[n];
  if (k === 'C'){ var o = off(Q, s, s.p); return left(Q, { m:o.m, n:o.n }) === 0 ? { s:s, ev:'open', moves:[] } : { s:s, ev:'shut', moves:[] }; }
  var f = L.frameStep(G, Q, s, s.p, d, init); if (f) return f;
  if (lava(Q, s, n)) return { s:s, ev:'lava', moves:[] };
  var o2 = off(Q, s, s.p), mv = [];
  if (Q.bit[s.p] != null) mv.push(['rock', s.p, s.p, lava(Q, o2, s.p) ? 'fall' : 'split']);
  mv.push(['me', s.p, n, 'walk']);
  return { s:{ p:n, m:o2.m, n:o2.n }, ev:'step', moves:mv }; }
function moves(){ return [0, 1, 2, 3]; }

/* THE SEARCH, breadth first: the fewest steps to an open vault, and how many states a player can reach. */
function explore(G, keep){ var s0 = init(G), seen = new Map(), list = [s0], par = [-1], pd = [-1], wins = [], edges = keep ? [] : null; seen.set(key(s0), 0);
  for (var h = 0; h < list.length; h++){ var s = list[h];
    for (var d = 0; d < 4; d++){ var r = act(G, s, d); if (r.ev === 'open'){ wins.push([h, d]); continue; }
      if (r.ev !== 'step' && r.ev !== 'reset') continue;
      var k = key(r.s), to = seen.get(k); if (to == null){ to = list.length; seen.set(k, to); list.push(r.s); par.push(h); pd.push(d); }
      if (edges) edges.push([h, to, r.ev === 'reset']); } }
  return { list:list, seen:seen, par:par, pd:pd, wins:wins, edges:edges }; }
function solve(G){ var X = explore(G, false); if (!X.wins.length) return { ok:false, why:'it cannot be solved', states:X.list.length };
  var w = X.wins[0], path = [w[1]], i = w[0]; while (X.par[i] >= 0){ path.unshift(X.pd[i]); i = X.par[i]; }
  return { ok:true, moves:path.length, path:path, states:X.list.length }; }
/* CAN THE REST STILL BE CROSSED, from s to the vault? A search, remembered for the gym (a state's answer never changes),
   cut short where the rock still standing has come apart (a tile he can no longer reach is a tile he can never cross),
   or where a tile still standing has fewer than two ways in and out (counting where he stands, and the vault for the
   last tile): he could step onto it but never off it. The audit holds both cuts to the full search. */
var MEMO = {};
function apart(Q, s){ var seen = {}, st = [s.p], need = 0, got = 0, L = LIB(); seen[s.p] = 1;
  for (var k = 0; k < Q.field.length; k++){ var t = Q.field[k]; if (t === s.p || lava(Q, s, t)) continue; need++;
    for (var d0 = 0, deg = 0; d0 < 4; d0++){ var u = L.nb(Q, t, d0); if (u >= 0 && (u === s.p || u === Q.chest || (Q.bit[u] != null && !lava(Q, s, u)))) deg++; }
    if (deg < 2) return true; }
  while (st.length){ var p = st.pop(); for (var d = 0; d < 4; d++){ var n = L.nb(Q, p, d); if (n < 0 || seen[n] || Q.bit[n] == null || lava(Q, s, n)) continue; seen[n] = 1; got++; st.push(n); } }
  return got < need; }
function finish(G, s){ var Q = parse(G), M = MEMO[G.id] || (MEMO[G.id] = new Map()), k = key(s), v = M.get(k); if (v != null) return v;
  v = false;
  if (Q.bit[s.p] == null || !apart(Q, s)){
    for (var d = 0; d < 4 && !v; d++){ var r = act(G, s, d); if (r.ev === 'open') v = true; else if (r.ev === 'step') v = finish(G, r.s); } }
  M.set(k, v); return v; }
function stuck(G, s){ return !finish(G, s); }
/* THE AUDIT. Every state a player can reach, and from each, by a backward search over the real steps (the lever and
   Restart left out), whether the vault can still be opened. stuck() must say so exactly where it cannot. */
function audit(G){ var X = explore(G, true), N = X.list.length, back = [], i; for (i = 0; i < N; i++) back.push([]);
  X.edges.forEach(function(e){ if (!e[2]) back[e[1]].push(e[0]); });
  var good = new Uint8Array(N), q = X.wins.map(function(w){ return w[0]; }); q.forEach(function(w){ good[w] = 1; });
  for (var h = 0; h < q.length; h++) back[q[h]].forEach(function(p){ if (!good[p]){ good[p] = 1; q.push(p); } });
  var nst = 0, missed = 0, alarms = 0, ex = null;
  for (i = 0; i < N; i++){ var says = stuck(G, X.list[i]); if (!good[i]){ nst++; if (!says){ missed++; if (!ex) ex = X.list[i]; } } else if (says) alarms++; }
  return { ok:missed === 0 && alarms === 0, states:N, stuck:nst, missed:missed, alarms:alarms, dead:nst, example:ex }; }
function proof(G){ return (G.proof || '').split('').map(function(ch){ return 'URDL'.indexOf(ch); }); }
function enc(path){ return path.map(function(d){ return 'URDL'.charAt(d); }).join(''); }
function goal(G){ return parse(G).thick ? 'Cross every rock to the vault. Thick rock takes two.' : 'Cross every rock once, then step into the vault.'; }

/* ---- THE LOOK: Volcano Island's own. Black basalt slabs with a red glow in their seams; a thick tile raised and banded;
   lava, once a tile is gone, bright and moving, with a dark crust at its edges; the tile he stands on starting to glow
   through its cracks; and the count still standing burning on the far wall. */
var DECK = 0.45, WALLTOP = 0.95;
var ROCK = { volcano:{ slab:['#594c4c', '#4d4142', '#1e1817', '#7c6c6a', '#2e2626'], thick:['#86705e', '#766252', '#a48c78', '#c2aa94', '#3e3028'], ground:['#6a5e58', '#5a504a'], seam:['#9a3412', '#c8501c'] } };
function floor(gc){ if (gc.k === '#') return null; var th = gc.k === 'R';
  return { h:th ? DECK + 0.12 : DECK, mat:[th ? 'vthick' : gc.k === 'r' ? 'vslab' : 'vground', { gu:gc.u, gv:gc.v, gc:gc.c, gr:gc.r }] }; }
// a slab: its seam glowing red, its far and left edges catching the light, its near and right edges in shadow
function slab(P, u, v, n, base, alt, hi, lo){ if (u < 0.05 || u > 0.95 || v < 0.05 || v > 0.95) return n < 0.5 ? P.seam[0] : P.seam[1];
  if (u < 0.14 || v < 0.14) return hi; if (u > 0.86 || v > 0.86) return lo; return n < 0.4 ? alt : base; }
function mats(th){ var P = ROCK[th] || ROCK.volcano;
  return {
    vslab:['', '', '', 0, function(c, R, h3){ if (c.dt < 0) return R(P.slab[2]); var n = h3(c.ti, c.tj, 53);
      return R(n < 0.06 ? P.slab[2] : slab(P, c.gu || 0, c.gv || 0, n, P.slab[0], P.slab[1], P.slab[3], P.slab[4])); }],
    // thick rock: paler, raised, with bands across it
    vthick:['', '', '', 0, function(c, R, h3){ if (c.dt < 0) return R(P.thick[4]); var u = c.gu || 0, v = c.gv || 0, n = h3(c.ti, c.tj, 59), band = Math.abs(((u * 0.6 + v) * 3) % 1 - 0.5) < 0.09;
      return R(slab(P, u, v, n, band ? P.thick[2] : P.thick[0], band ? P.thick[2] : P.thick[1], P.thick[3], P.thick[4])); }],
    vground:['', '', '', 0, function(c, R, h3){ var u = c.gu || 0, v = c.gv || 0, n = h3(c.ti, c.tj, 61); if (c.dt < 0 || u < 0.05 || u > 0.95 || v < 0.05 || v > 0.95) return R(P.slab[2]); return R(n < 0.4 ? P.ground[1] : P.ground[0]); }] }; }

/* WHAT MOVES, DRAWN (the frame's room R, browser only). All of it is on the floor (ground), so he always stands in front. */
function view(R){ var Q = R.Q, T = R.T, ctx = R.ctx, s0 = null, anim = {};
  function basis(i, z){ var c = i % Q.W, r = (i / Q.W) | 0, x = R.x0 + c * T, y = R.y0 + r * T, o = R.scr(x, y, z), ex = R.scr(x + T, y, z), ey = R.scr(x, y + T, z);
    return [ex[0] - o[0], ex[1] - o[1], ey[0] - o[0], ey[1] - o[1], o[0], o[1]]; }
  function inTile(i, z, fn){ var B = basis(i, z); ctx.save(); ctx.transform(B[0], B[1], B[2], B[3], B[4], B[5]); fn(1 / Math.max(1, Math.hypot(B[0], B[1]))); ctx.restore(); }
  function hash(a, b){ var h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return h - Math.floor(h); }
  // cracks out from near a tile's middle: three or four jagged lines, the same every time for a tile
  function cracks(i, n){ ctx.beginPath(); for (var k = 0; k < n; k++){ var a = hash(i, k) * 6.28, x = 0.5 + (hash(k, i) - 0.5) * 0.12, y = 0.5 + (hash(i + 3, k) - 0.5) * 0.12; ctx.moveTo(x, y);
      for (var j = 1; j <= 3; j++){ var r = j * 0.15, b = a + (hash(i * j, k) - 0.5) * 0.9; ctx.lineTo(0.5 + Math.cos(b) * r, 0.5 + Math.sin(b) * r); } } }
  // a tile gone to lava: bright and slowly moving, with a dark crust round its rim
  function lavaTile(i, tsec, a){ var t = R.reduce ? 0 : tsec; inTile(i, DECK - 0.02, function(p1){ ctx.globalAlpha = a;
    ctx.fillStyle = '#2a0c06'; ctx.fillRect(0, 0, 1, 1);
    var g = ctx.createRadialGradient(0.5, 0.5, 0.05, 0.5, 0.5, 0.62); g.addColorStop(0, '#ffd04a'); g.addColorStop(0.45, '#ff7a1a'); g.addColorStop(1, '#b8280c');
    ctx.fillStyle = g; ctx.fillRect(0.07, 0.07, 0.86, 0.86);
    ctx.fillStyle = 'rgba(255,240,170,0.55)'; for (var k = 0; k < 3; k++){ var ph = (t * 0.35 + hash(i, k)) % 1, x = 0.2 + hash(k, i) * 0.6, y = 0.2 + ((hash(i, k + 7) + t * 0.05) % 1) * 0.6, r = 0.05 + 0.05 * Math.sin(ph * Math.PI);
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
    ctx.strokeStyle = 'rgba(30,10,6,0.85)'; ctx.lineWidth = Math.max(0.05, 2.5 * p1); ctx.strokeRect(0.07, 0.07, 0.86, 0.86); ctx.globalAlpha = 1; }); }
  // a crack through a tile: dark lines with lava light in them (the tile he stands on, and a thick tile crossed once)
  function crackTile(i, z, n, glow, tsec){ inTile(i, z + 0.01, function(p1){ var pul = R.reduce ? 0.8 : 0.6 + 0.4 * Math.sin(tsec * 5);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; cracks(i, n);
    ctx.strokeStyle = '#120806'; ctx.lineWidth = Math.max(0.04, 3 * p1); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,' + (glow ? 150 : 110) + ',40,' + (glow ? pul : 0.85).toFixed(3) + ')'; ctx.lineWidth = Math.max(0.02, 1.4 * p1); ctx.stroke(); }); }
  /* THE COUNT, burning on the far wall: a basalt plaque with the number of rock still standing once he steps off the
     tile he is on (so it reads none, a tick, as he steps into the vault), glowing hotter as it falls. It is wall, not
     floor. */
  function plaque(s, tsec){ var o = off(Q, s, s.p), n = left(Q, { m:o.m, n:o.n }), w = 2.4, x0 = R.x0 + (Q.W / 2 - w / 2) * T, y0 = R.y0 + 0.25 * T, y1 = R.y0 + 1.75 * T, z = DECK + WALLTOP + 0.06;
    var a = R.scr(x0, y0, z), b = R.scr(x0 + w * T, y0, z), c = R.scr(x0 + w * T, y1, z), d = R.scr(x0, y1, z), dn = R.scr(x0, y1, DECK + WALLTOP - 0.25);
    ctx.save(); ctx.fillStyle = '#1a1412'; ctx.beginPath(); ctx.moveTo(d[0], d[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(c[0], c[1] + dn[1] - d[1]); ctx.lineTo(d[0], dn[1]); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2e2624'; ctx.strokeStyle = '#7a240e'; ctx.lineWidth = Math.max(1, R.kk() * 0.9); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath(); ctx.fill(); ctx.stroke();
    var cx = (a[0] + c[0]) / 2, cy = (a[1] + c[1]) / 2, h = c[1] - b[1], hot = Q.field.length ? 1 - n / (Q.field.length + bits(Q.thick)) : 1, pul = R.reduce ? 1 : 0.8 + 0.2 * Math.sin(tsec * 3);
    // a small rock and the count beside it
    var rs = h * 0.26, rx = cx - h * 0.62; ctx.fillStyle = '#4a4245'; ctx.strokeStyle = '#ff7a1a'; ctx.lineWidth = Math.max(1, R.kk() * 0.7);
    ctx.beginPath(); ctx.moveTo(rx - rs, cy + rs * 0.6); ctx.lineTo(rx - rs * 0.6, cy - rs * 0.7); ctx.lineTo(rx + rs * 0.5, cy - rs * 0.8); ctx.lineTo(rx + rs, cy + rs * 0.6); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.font = '700 ' + Math.round(h * 0.62) + 'px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = n ? 'rgba(255,' + Math.round(200 - 110 * hot) + ',' + Math.round(80 - 60 * hot) + ',' + pul.toFixed(3) + ')' : '#9cff8a'; ctx.fillText(n ? String(n) : '✓', cx + h * 0.28, cy + h * 0.03);
    ctx.restore(); }
  function bits(m){ var c = 0; while (m){ c += m & 1; m >>>= 1; } return c; }
  return {
    lay:function(s){ s0 = s; anim = {}; },
    move:function(m, u){ anim[m[1]] = { u:u, how:m[3] }; if (u >= 1 && m[3] === 'fall'){ var q = R.at(m[1]); R.burst(q[0], q[1], DECK + 0.2, ['#ffb03a', '#ff5a1a', '#2a1a14'], 10, 1.1, 0.8); } },
    things:function(){},
    hot:function(){ return []; },
    ground:function(tsec){ if (!s0) return; var s = s0;
      Q.field.forEach(function(i){ var A = anim[i], th = !!(Q.thick & (1 << Q.bit[i])), z = th ? DECK + 0.12 : DECK;
        if (lava(Q, s, i)) return lavaTile(i, tsec, 1);
        if (A && A.how === 'fall'){ crackTile(i, z, 4, true, tsec); lavaTile(i, tsec, A.u); return; }
        if (th && (s.m & (1 << Q.bit[i]))) crackTile(i, z, 3, false, tsec);
        if (A && A.how === 'split') crackTile(i, z, 3, true, tsec);
        if (i === s.p) crackTile(i, z, th && (s.m & (1 << Q.bit[i])) ? 4 : 2, true, tsec); });
      plaque(s, tsec); } }; }

root.RTT_GYMKIND_ROCK = { id:'rock', gyms:GYMS, input:'step', calm:true, unit:'step', hello:'One tile a step. Undo takes one back.',
  parse:parse, init:init, key:key, act:act, step:act, moves:moves, solve:solve, audit:audit, stuck:stuck, proof:proof, enc:enc, goal:goal,
  me:function(G, s){ return s.p; }, place:function(G, s, i){ return { p:i, m:s.m, n:s.n }; },
  deck:function(G, s, i){ var Q = parse(G); return Q.cell[i] !== '#' && !lava(Q, s, i); },
  left:function(G, s){ return left(parse(G), s); },
  tell:{ lava:'That\'s lava now. You can\'t go back on it.', shut:'The vault stays shut. There\'s still rock standing.', stuck:'A rock\'s cut off now. Undo it, or Restart.' },
  dur:function(how){ return how === 'fall' || how === 'split' ? 0.15 : 0.15; },
  floor:floor, mats:mats, view:view };
})();
