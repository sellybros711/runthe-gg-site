/* golf/putt/gymkinds/islands.js: the ISLANDS kind of trail gym (RTT_GYMKIND_ISLANDS), Sky Islands'. A kind file: the
   registry (gyms.js, its KINDS README) finds it by its global, the frame (trail.js) plays it, check-putt proves it.

   THE PUZZLE: little islands float over the drop, each with bridge pieces on some of its sides. A tap on an island
   turns it a quarter, clockwise, bridges and all. Bridges that meet across a gap join, and the cloud deck by the gate
   and the vault's ledge join anything that reaches them. Join the gate to the vault and he walks across to it (that
   walk is part of the winning tap: the vault opens when he gets there). A tap kind: he waits on the deck while you turn.

   THE TWISTS. A ROPE ties two islands: turn either and the other turns with it, the same way. A GEAR pair (the
   gatekeeper's) turns the OTHER way: turn one clockwise and its partner turns back. An ANCHORED island (a small letter
   in the layout) has no handle and cannot be tapped at all: only its ropes and gears move it.

   THE LAYOUTS ARE HAND DESIGNED, never random. The room's own characters (the frame reads # G @ L C):
     ~  the drop (open sky)       .  the cloud deck (solid: it joins every side)
     A to Z  an island you can turn       a to z  an anchored island (its piece is in isles under its capital)
     (never C, G or L, which are the frame's: the vault, the gate and the lever)
   isles gives each island its piece and how far it starts turned: 'c1' is a corner turned once. The pieces, as they
   stand unturned (sides N E S W, N away from the camera):   s  straight N and S   c  corner N and E
   t  tee N, E and S   e  end N only.   ropes and gears are pairs of island letters ('AB').
   A tap on the lever (L) is Restart, as the button is.

   The search is the registry's own (lib.solve, lib.audit: breadth first over every tap). A tap repeated four times is
   no tap, so every tap can be undone by taps and every state a player can reach can reach the start, and so the
   solution: nothing here is ever stuck, which stuck() says and lib.audit proves state by state. */
(function(){
var root = typeof window !== 'undefined' ? window : globalThis;
var LIB = function(){ return root.RTT_PUTT_GYMS.lib; };

/* THE GYMS. world, leg (the trail into that hole of the world), mech (the mid-world gym's one; the gatekeeper's is that
   and its gears), the room, the islands, and the civilian by the gate: three lines that nudge, never the taps. moves
   and proof are the solver's fewest taps and one shortest solution (the tapped tiles), recorded from solve(). */
var GYMS = [
  /* THE STEPPING STONES, mid-world: seven islands, five ropes, one way across (right, up, left, up through a tee).
     The lesson is that a roped island cannot be turned alone, so an island is often put right by turning the one it
     is roped to, and that a tap repeated four times is nothing, so three taps is a turn back. */
  { id:'sky1', kind:'islands', world:'sky', leg:9, name:'The Stepping Stones', badge:'Cloud Badge', mech:['island'], pay:500, look:{ wall:'stone' },
    moves:9, proof:'24,24,24,25,31,31,31,32,32',
    who:{ look:{ skin:'tan', polo:'sky', hat:'white', pants:'navy', hair:'brown', hairStyle:'short', cap:true, hatStyle:'cap', gender:'male' } },
    say:['I tie these islands up every morning so they don\'t drift off. Some of them are tied to each other.',
      'When an island won\'t sit right, look at what it\'s roped to.',
      'You don\'t have to turn the island you want to fix. Sometimes its neighbour does it for you.'],
    rows:[
      '#######',
      '#~~C~~#',
      '#~~BD~#',
      '#~EFH~#',
      '#~~JK~#',
      '#~~.~~#',
      '#L...@#',
      '#####G#'
    ],
    isles:{ B:'t1', D:'e3', E:'e2', F:'c0', H:'c0', J:'c2', K:'c0' },
    ropes:['KH', 'HF', 'FB', 'EF', 'BD'] },
  /* THE CLOCKWORK ISLES, the gatekeeper: nine islands, seven gear pairs that turn the other way, two ropes, and an
     anchored island in the middle of the only way across (an S up the left, over and up the right) that no tap can
     reach. It turns only as its gears turn it, backwards, and every gear that turns it turns something else that has
     to be put right after. */
  { id:'sky2', kind:'islands', world:'sky', leg:18, name:'The Clockwork Isles', badge:'Cog Badge', mech:['island', 'gear'], pay:1000, keeper:true, look:{ wall:'stone' },
    moves:16, proof:'17,17,17,18,18,18,23,23,23,25,25,25,30,31,31,31',
    who:{ look:{ skin:'porcelain', polo:'purple', hat:'white', pants:'stone', hair:'platinum', hairStyle:'curly', cap:false, gender:'female' } },
    say:['My grandfather geared these islands together. Turn one and the next one fights you.',
      'Gears never turn the same way as their partner. Ropes always do.',
      'That anchored island won\'t take a tap. You\'ll have to move it with its neighbours, then fix them after.'],
    rows:[
      '#######',
      '#~~C~~#',
      '#~~BD~#',
      '#~EfH~#',
      '#~IJ~~#',
      '#~MN~~#',
      '#~~.~~#',
      '#L...@#',
      '#####G#'
    ],
    isles:{ B:'c0', D:'c3', E:'e1', F:'c2', H:'c1', I:'c2', J:'c1', M:'c0', N:'c1' },
    ropes:['MN', 'HD'], gears:['IJ', 'JN', 'FJ', 'FH', 'FB', 'DB', 'EI'] }
];

var N = 1, E = 2, S = 4, Wd = 8, SIDE = [N, E, S, Wd], STEP = [[0, -1], [1, 0], [0, 1], [-1, 0]];
var PIECE = { s:N | S, c:N | E, t:N | E | S, e:N };
function turn(mk, k){ k = ((k % 4) + 4) % 4; for (var j = 0; j < k; j++) mk = ((mk << 1) | (mk >> 3)) & 15; return mk; }
// a straight looks the same turned twice, so it has two ways to stand; every other piece four
function period(p){ return p === 's' ? 2 : 4; }
var PARSED = {};
/* THE ROOM: the frame's five through lib.room, and the islands. Q.isles is every island in reading order ({ i, ch,
   p, r0, per, anch, rope:[island indexes], gear:[...] }), Q.at the island index of a tile, Q.deck the solid tiles. */
function parse(G){ if (PARSED[G.id]) return PARSED[G.id]; var isles = [], at = {};
  var Q = LIB().room(G, function(ch, i){ if (ch === '~') return; if (!/[A-Za-z]/.test(ch)) return false;
    var spec = (G.isles || {})[ch.toUpperCase()]; if (!spec) throw new Error(G.id + ': island ' + ch + ' has no piece');
    at[i] = isles.length; isles.push({ i:i, ch:ch.toUpperCase(), p:spec.charAt(0), r0:+spec.slice(1) || 0, per:period(spec.charAt(0)), anch:ch !== ch.toUpperCase(), rope:[], gear:[] }); });
  var byCh = {}; Object.keys(G.isles || {}).forEach(function(ch){ if ('CGL'.indexOf(ch) >= 0) throw new Error(G.id + ': ' + ch + ' is the frame\'s, not an island'); });
  isles.forEach(function(o, k){ if (byCh[o.ch] != null) throw new Error(G.id + ': two islands ' + o.ch); byCh[o.ch] = k; if (!PIECE[o.p]) throw new Error(G.id + ': what piece is ' + o.p); });
  function pair(list, kd){ (list || []).forEach(function(pr){ var a = byCh[pr.charAt(0)], b = byCh[pr.charAt(1)]; if (a == null || b == null) throw new Error(G.id + ': ' + kd + ' ' + pr + ' ties no island');
    if (!adj(Q, isles[a].i, isles[b].i)) throw new Error(G.id + ': ' + kd + ' ' + pr + ' ties islands that are not side by side'); isles[a][kd].push(b); isles[b][kd].push(a); }); }
  pair(G.ropes, 'rope'); pair(G.gears, 'gear');
  Q.isles = isles; Q.at = at; Q.byCh = byCh;
  Q.tap = isles.filter(function(o){ return !o.anch; }).map(function(o){ return o.i; });
  Q.ties = []; (G.ropes || []).forEach(function(pr){ Q.ties.push([byCh[pr.charAt(0)], byCh[pr.charAt(1)], 'rope']); }); (G.gears || []).forEach(function(pr){ Q.ties.push([byCh[pr.charAt(0)], byCh[pr.charAt(1)], 'gear']); });
  return PARSED[G.id] = Q; }
function adj(Q, a, b){ var d = Math.abs(a - b); return d === Q.W || (d === 1 && ((a / Q.W) | 0) === ((b / Q.W) | 0)); }
// the state: how far each island is turned, as a string of digits (an island's own period), a new string a move
function init(G){ return { r:parse(G).isles.map(function(o){ return o.r0 % o.per; }).join('') }; }
function key(s){ return s.r; }
function solid(Q, i){ var k = Q.cell[i]; return k === '.' || i === Q.start || i === Q.chest; }
// the sides a tile opens on in state s: the deck and the vault every side, an island its piece as turned, else none
function sides(Q, s, i){ if (i < 0) return 0; var k = Q.at[i]; if (k != null){ var o = Q.isles[k]; return turn(PIECE[o.p], +s.r.charAt(k)); } return solid(Q, i) ? 15 : 0; }
/* THE WAY ACROSS, if there is one: a breadth first walk from where he stands over every pair of tiles whose sides
   meet, to the vault. Returns the tiles from the start to the vault, or null. */
function way(Q, s){ var prev = {}, q = [Q.start], h = 0; prev[Q.start] = -1;
  while (h < q.length){ var i = q[h++]; if (i === Q.chest){ var p = [], t = i; while (t >= 0){ p.unshift(t); t = prev[t]; } return p; }
    var me = sides(Q, s, i); for (var d = 0; d < 4; d++){ if (!(me & SIDE[d])) continue; var n = LIB().nb(Q, i, d); if (n < 0 || prev[n] != null) continue;
      if (sides(Q, s, n) & SIDE[(d + 2) % 4]){ prev[n] = i; q.push(n); } } }
  return null; }
/* A TAP. The island turns a quarter clockwise; every island roped to it the same way, every one geared to it the other
   way. The lever is Restart; an anchored island answers 'anchored' and does nothing. moves, for the picture: an
   ['isle', tile, tile, 'cw' or 'ccw'] for each island that turns, and if that joins the gate to the vault, his walk
   across: a step of nothing first (so the turning plays before he sets off), then one 'me' a tile. */
function act(G, s, i){ var Q = parse(G), k = Q.at[i];
  if (i === Q.lever) return { s:init(G), ev:'reset', moves:[] };
  if (k == null) return { s:s, ev:'bump', moves:[] };
  var o = Q.isles[k]; if (o.anch) return { s:s, ev:'anchored', moves:[] };
  var r = s.r.split('').map(Number), mv = [];
  function spin(j, by){ var p = Q.isles[j]; r[j] = ((r[j] + by) % p.per + p.per) % p.per; mv.push(['isle', p.i, p.i, by > 0 ? 'cw' : 'ccw']); }
  spin(k, 1); o.rope.forEach(function(j){ spin(j, 1); }); o.gear.forEach(function(j){ spin(j, -1); });
  var s2 = { r:r.join('') }, w = way(Q, s2);
  if (w){ mv.push(['me', Q.start, Q.start, 'walk']); for (var j = 1; j < w.length - 1; j++) mv.push(['me', w[j - 1], w[j], 'walk']); }
  return { s:s2, ev:'turn', moves:mv }; }
function moves(G){ return parse(G).tap.slice(); }
function won(G, s){ return !!way(parse(G), s); }
function proof(G){ return (G.proof || '').split(',').filter(Boolean).map(Number); }
function enc(path){ return path.join(','); }
function goal(){ return 'Turn the islands to bridge the gap to the vault.'; }

/* ---- THE PICTURE. Baked (floor(), mats()): the open sky far below with cloud drifting in it, the cloud deck, and each
   island's grassy top with the rock of its underside showing on the near side. Drawn each frame on top (view.things):
   every island's bridges as they stand (turning, while a tap plays), its ropes and gears, and an anchored island's iron
   ring. The frame rings every island a tap would turn. */
var SKY = ['#9fd3f2', '#b9e1f7', '#ffffff', '#e8f4fc'], DECKC = ['#f4f1e8', '#e6e1d2', '#c9c2ae'], GRASS = ['#8fd3a0', '#a6e0b4', '#5fa070'], ROCK = ['#c9a46a', '#a07e48'];
var PLANK = ['#b07a42', '#d09a5a', '#6e4a24'], ROPE = '#d8483a', GEAR = ['#e0b24a', '#8a6420'], ISR = 0.45;
var D_TURN = 0.28, D_WALK = 0.2;
function floor(gc){ var k = gc.k; if (k === '#') return null;
  if (k === '~' || /[A-Za-z]/.test(k)) return { mat:['isky', { gu:gc.u, gv:gc.v, isl:k !== '~' ? 1 : 0 }] };
  return { mat:['ideck', { gu:gc.u, gv:gc.v }] }; }
function mats(){ return {
  isky:['', '', '', 0, function(c, R, h3){ var u = (c.gu || 0) - 0.5, v = (c.gv || 0) - 0.5, d = Math.sqrt(u * u + v * v);
    if (c.isl){ if (d < ISR - 0.04) return R(d > ISR - 0.09 ? GRASS[2] : h3(c.ti, c.tj, 61) < 0.1 ? GRASS[1] : GRASS[0]);
      // the rock under the island's near side, tapering to a point below it
      var ud = Math.sqrt(u * u * (1 + Math.max(0, v) * 3) + (v - 0.06) * (v - 0.06)); if (v > -0.05 && ud < ISR + 0.03) return R(v > 0.3 ? ROCK[1] : ROCK[0]); }
    // open sky, far down: soft drifts of cloud in it
    var f = Math.sin(c.ti * 0.07 + 1.7 * Math.sin(c.tj * 0.045)) + Math.sin(c.tj * 0.11 + c.ti * 0.025), m = h3(c.ti, c.tj, 64);
    return R(f > 1.45 ? SKY[2] : f > 1.15 ? SKY[3] : m < 0.015 ? SKY[1] : SKY[0]); }],
  ideck:['', '', '', 0, function(c, R, h3){ var u = c.gu || 0, v = c.gv || 0, n = h3(c.ti, c.tj, 65);
    if (u < 0.04 || u > 0.96 || v < 0.04 || v > 0.96) return R(DECKC[2]); return R(n < 0.15 ? DECKC[1] : DECKC[0]); }] }; }
function view(R){ var Q = R.Q, T = R.T, Z = R.DECK + 0.02, rot = [], spin = {};
  function P(x, y){ return R.scr(x, y, Z); }
  function poly(pts, col){ var ctx = R.ctx; ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (var j = 1; j < pts.length; j++) ctx.lineTo(pts[j][0], pts[j][1]); ctx.closePath(); ctx.fill(); }
  // a bridge: a plank from the island's middle out to the edge of its tile, at angle a (0 north, clockwise)
  function plank(q, a){ var dx = Math.sin(a), dy = -Math.cos(a), px = -dy, py = dx, w = T * 0.18, r0 = T * 0.08, r1 = T * 0.5, ctx = R.ctx;
    function at(t, s2){ return P(q[0] + dx * t + px * s2, q[1] + dy * t + py * s2); }
    poly([at(r0, -w - T * 0.02), at(r1, -w - T * 0.02), at(r1, w + T * 0.02), at(r0, w + T * 0.02)], PLANK[2]);
    poly([at(r0, -w), at(r1, -w), at(r1, w), at(r0, w)], PLANK[0]);
    ctx.strokeStyle = PLANK[2]; ctx.lineWidth = Math.max(1, R.kk() * 0.45);
    for (var t = r0 + T * 0.1; t < r1; t += T * 0.12){ var a1 = at(t, -w), a2 = at(t, w); ctx.beginPath(); ctx.moveTo(a1[0], a1[1]); ctx.lineTo(a2[0], a2[1]); ctx.stroke(); }
    ctx.strokeStyle = PLANK[1]; var e1 = at(r0, -w * 0.5), e2 = at(r1, -w * 0.5); ctx.beginPath(); ctx.moveTo(e1[0], e1[1]); ctx.lineTo(e2[0], e2[1]); ctx.stroke(); }
  function isle(o, k){ var q = R.at(o.i), sp = spin[o.i], a = (rot[k] || 0) * Math.PI / 2 + (sp ? sp[0] * sp[1] * Math.PI / 2 : 0), mk = PIECE[o.p];
    for (var d = 0; d < 4; d++) if (mk & SIDE[d]) plank(q, a + d * Math.PI / 2);
    // the hub: a round of stone the planks meet on
    var ctx = R.ctx, c0 = P(q[0], q[1]), cx = P(q[0] + T * 0.13, q[1]), cy = P(q[0], q[1] + T * 0.13);
    ctx.fillStyle = PLANK[2]; ctx.beginPath(); ctx.ellipse(c0[0], c0[1], Math.abs(cx[0] - c0[0]) + 1, Math.abs(cy[1] - c0[1]) + 1, 0, 0, 7); ctx.fill();
    ctx.fillStyle = o.anch ? '#5a5f6a' : PLANK[1]; ctx.beginPath(); ctx.ellipse(c0[0], c0[1], Math.abs(cx[0] - c0[0]), Math.abs(cy[1] - c0[1]), 0, 0, 7); ctx.fill();
    if (o.anch){ ctx.strokeStyle = '#2a2e36'; ctx.lineWidth = Math.max(1.5, R.kk() * 0.8); ctx.beginPath(); ctx.ellipse(c0[0], c0[1], Math.abs(cx[0] - c0[0]) * 0.55, Math.abs(cy[1] - c0[1]) * 0.55, 0, 0, 7); ctx.stroke(); } }
  /* a tie, drawn off the bridges' line so it never hides one: a rope is a red cord slung across a corner of the gap;
     a gear pair is two brass cogs meshing there, so they read as turning against each other. */
  function tie(t){ var a = Q.isles[t[0]], b = Q.isles[t[1]], qa = R.at(a.i), qb = R.at(b.i), mx = (qa[0] + qb[0]) / 2, my = (qa[1] + qb[1]) / 2, ux = (qb[0] - qa[0]) / T, uy = (qb[1] - qa[1]) / T, px = -uy, py = ux, off = T * 0.34, ctx = R.ctx;
    if (t[2] === 'rope'){ var p0 = P(qa[0] + px * off + ux * T * 0.22, qa[1] + py * off + uy * T * 0.22), p1 = P(qb[0] + px * off - ux * T * 0.22, qb[1] + py * off - uy * T * 0.22), pm = P(mx + px * (off + T * 0.06), my + py * (off + T * 0.06));
      ctx.lineCap = 'round'; ctx.strokeStyle = '#6a1a12'; ctx.lineWidth = Math.max(3, R.kk() * 1.9); ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.quadraticCurveTo(pm[0], pm[1], p1[0], p1[1]); ctx.stroke();
      ctx.strokeStyle = ROPE; ctx.lineWidth = Math.max(2, R.kk() * 1.1); ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.quadraticCurveTo(pm[0], pm[1], p1[0], p1[1]); ctx.stroke();
      [p0, p1].forEach(function(p){ ctx.fillStyle = '#6a1a12'; ctx.beginPath(); ctx.arc(p[0], p[1], Math.max(2, R.kk() * 1.1), 0, 7); ctx.fill(); }); return; }
    [-1, 1].forEach(function(sg){ var gx = mx + px * off + ux * sg * T * 0.13, gy = my + py * off + uy * sg * T * 0.13, sa = spin[a.i] || spin[b.i], ang = (sa ? sa[0] * sg * Math.PI / 4 : 0) + (sg > 0 ? Math.PI / 6 : 0);
      var pts = []; for (var j = 0; j < 16; j++){ var th = ang + j * Math.PI / 8, rr = T * (j % 2 ? 0.09 : 0.13); pts.push(P(gx + Math.cos(th) * rr, gy + Math.sin(th) * rr)); }
      poly(pts, GEAR[1]); var c0 = P(gx, gy), cx = P(gx + T * 0.05, gy), cy = P(gx, gy + T * 0.05); ctx.fillStyle = GEAR[0]; ctx.beginPath(); ctx.ellipse(c0[0], c0[1], Math.abs(cx[0] - c0[0]) + 1, Math.abs(cy[1] - c0[1]) + 1, 0, 0, 7); ctx.fill(); }); }
  return {
    lay:function(s){ rot = s.r.split('').map(Number); spin = {}; },
    move:function(m, u){ if (m[0] === 'isle') spin[m[1]] = [u, m[3] === 'cw' ? 1 : -1]; },
    /* the islands and their ties are things in the scene's far to near list rather than paint on the ground, so a
       sprite drawn before them (a balloon drifting over, the vault) that has the scene drawn back over it never takes
       a bridge with it. A tie is drawn just after the nearer of its two islands, so it lies over their grass (it is slung clear of
       every bridge). */
    things:function(ds){
      Q.ties.forEach(function(t){ var y = Math.max(R.at(Q.isles[t[0]].i)[1], R.at(Q.isles[t[1]].i)[1]) - T * 0.44, q = R.at(Q.isles[t[0]].i);
        ds.push({ x:q[0], y:y, kd:function(){ var ctx = R.ctx; ctx.save(); tie(t); ctx.restore(); } }); });
      Q.isles.forEach(function(o, k){ var q = R.at(o.i); ds.push({ x:q[0], y:q[1] - T * 0.45, kd:function(){ var ctx = R.ctx; ctx.save(); isle(o, k); ctx.restore(); } }); }); },
    ground:function(){} }; }

root.RTT_GYMKIND_ISLANDS = { id:'islands', gyms:GYMS, input:'tap', calm:true, parse:parse, init:init, key:key, act:act, moves:moves, won:won, proof:proof, enc:enc,
  goal:goal, stuck:function(){ return false; }, me:function(){ return null; }, place:function(G, s){ return s; },
  tell:{ anchored:'That one\'s anchored. It only turns when its neighbours do.' },
  hello:'Tap an island to turn it. Undo takes one back.', unit:'tap',
  dur:function(how){ return how === 'walk' ? D_WALK : D_TURN; }, floor:floor, mats:mats, view:view, way:function(G, s){ return way(parse(G), s); } };
})();
