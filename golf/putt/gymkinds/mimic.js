/* golf/putt/gymkinds/mimic.js: THE MIMIC kind of trail gym (RTT_GYMKIND_MIMIC), Dino Valley's. A kind file: the
   registry (gyms.js, its KINDS README) finds it by its global, the frame (trail.js) plays it, check-putt proves it.

   THE PUZZLE. A baby dinosaur in the room copies every step you take, mirrored. The mirror rule is one, always the
   same, and drawn on the floor under the baby: the green baby MIRRORS LEFT AND RIGHT (you step left, it steps right;
   you step up, it steps up). Walls stop each of you on your own: when you step and a wall is in its way, you move and
   it does not (or the other way round). That is the only way to change where the two of you stand relative to each
   other, and so the whole puzzle: get yourself onto your nest and the baby onto its nest, both at once, and the vault
   opens.

   In the gatekeeper a second baby joins it, the blue one, which MIRRORS UP AND DOWN (you step up, it steps down; you
   step left, it steps left). Now every wall you use to line one baby up can knock the other one out of line.

   THE ROOM (rows, row 0 the far wall, the last row the near wall with the gate in it):
     #  wall (low, between rooms)    o  a boulder (stops whoever walks into it)    .  floor
     @  where you stand coming in (the gate is below it)    N  your nest (the gold one)
     b  the green baby (mirrors left and right)  n  its nest    d  the blue baby (mirrors up and down)  m  its nest
     L  the reset lever (step into it: everybody back to the start)    C  the vault (it opens once you are all home)
   A baby treats the lever, the gate, the vault and the walls as walls. Nobody walks into anybody: a step that would
   put two of you on one tile, or swap two of you, stops both; a step into one who stays put stops too.

   THE STATE is where each of you stands: { p, b:[the babies] }. solve() and audit() are this kind's own breadth first
   search over every state a player can reach (a few thousand to a few hundred thousand), done once and kept, so
   stuck() is a look up: from a state the nests cannot be reached from (a baby walked into a corner it can never be
   mirrored out of), the frame lights Restart. */
(function(){
var root = typeof window !== 'undefined' ? window : globalThis;
var LIB = function(){ return root.RTT_PUTT_GYMS.lib; };
// how each baby turns your step (d 0 up, 1 right, 2 down, 3 left): green mirrors left and right, blue up and down
var RULE = { green:[0, 3, 2, 1], blue:[2, 1, 0, 3] };
var BABY = { b:'green', d:'blue' }, NEST = { n:'green', m:'blue' };

/* THE GYMS. Hand designed. moves and proof are the solver's (U R D L, a letter a step), recorded from solve(). */
var GYMS = [
  { id:'dino1', kind:'mimic', world:'dino', leg:9, name:'The Hatchery', badge:'Hatchling Badge', mech:['mimic'], pay:500, look:{ wall:'stone' },
    moves:32, proof:'URRRDRUUUUUULLLDLLUUUUUUURRRRDLL', dead:0,
    who:{ look:{ skin:'tan', polo:'rtggreen', hat:'tan', pants:'khaki', hair:'brown', hairStyle:'short', cap:true, hatStyle:'cap', gender:'male' } },
    say:['That little one copies everything I do. Only backwards. Drives me up the wall.',
      'Walls don\'t stop you both. Just whoever walks into one.',
      'You\'re close, I can tell. You don\'t always have to move to make it move. Lean on something and watch.'],
    rows:[
      '###########',
      '#....C....#',
      '#.N....n..#',
      '#....o....#',
      '#.........#',
      '#.........#',
      '#....oo...#',
      '#...o.bo..#',
      '#o.o....o.#',
      '#.o.......#',
      '#.o.......#',
      '#.........#',
      '###L.@.####',
      '#####G#####'
    ] },
  { id:'dino2', kind:'mimic', world:'dino', leg:18, name:'The Nursery', badge:'Nursery Badge', mech:['mimic', 'twin'], pay:1000, keeper:true, look:{ wall:'stone' },
    moves:40, proof:'URRRRRUUUUUULULDRRLUURDDDLDLLLLLLULRRRLL', dead:2195,
    who:{ look:{ skin:'deep', polo:'teal', hat:'white', pants:'khaki', hair:'black', hairStyle:'long', cap:false, gender:'female' } },
    say:['Two of them now. One copies me like a mirror on the wall. The other like a puddle on the floor.',
      'Line one up and the other one slips. Look for the walls that only stop one of them.',
      'You\'re doing fine. Just don\'t let those two end up perfect opposites. Then they copy each other forever.'],
    rows:[
      '###########',
      '#.m.....n.#',
      '#o........#',
      '#...d.....#',
      '#.....b..o#',
      '#.........#',
      '#####C#####',
      '#....o....#',
      '#...o...o.#',
      '#...oN..o.#',
      '#....oo.o.#',
      '#......o..#',
      '#.........#',
      '#.........#',
      '###L.@.####',
      '#####G#####'
    ] }
];

var PARSED = {};
function parse(G){ if (PARSED[G.id]) return PARSED[G.id]; var babies = [], nests = {}, mine = -1;
  var Q = LIB().room(G, function(ch, i){ if (ch === 'o') return; if (BABY[ch]){ babies.push({ i:i, rule:BABY[ch] }); return; }
    if (ch === 'N'){ mine = i; return; } if (NEST[ch]){ nests[NEST[ch]] = i; return; } return false; });
  // lib.room keeps a character of the kind's own in cell: a baby's start tile is floor
  Q.cell = Q.cell.map(function(k){ return BABY[k] ? '.' : k; });
  babies.sort(function(a, b){ return a.rule === b.rule ? 0 : a.rule === 'green' ? -1 : 1; });
  Q.babies = babies.map(function(x){ return x.i; }); Q.rules = babies.map(function(x){ return x.rule; });
  Q.nest = mine; Q.nests = Q.rules.map(function(r){ return nests[r]; });
  if (mine < 0 || Q.nests.some(function(x){ return x == null; })) throw new Error(G.id + ': a nest for you and for every baby');
  return PARSED[G.id] = Q; }
function init(G){ var Q = parse(G); return { p:Q.start, b:Q.babies.slice() }; }
function key(s){ return s.p + '|' + s.b.join(','); }
function open(Q, i){ if (i < 0) return false; var k = Q.cell[i]; return k !== '#' && k !== 'o' && k !== 'L' && k !== 'C' && k !== 'G'; }

/* ONE STEP. You go d; each baby goes its rule's turn of d. Each one is stopped by a wall in its own way, and nobody
   walks into anybody. Returns { s, ev, moves }: ev 'step' (somebody moved), 'bump' (nobody did: 'locked' when you
   walked into the shut vault), or the frame's 'reset' and 'exit'. moves lists the babies first, then you, so the
   frame plays them all as one step. */
function act(G, s, d){ var Q = parse(G), L = LIB(), n = L.nb(Q, s.p, d);
  if (n === Q.gate) return { s:s, ev:'exit', moves:[] };
  if (n >= 0 && Q.cell[n] === 'L') return { s:init(G), ev:'reset', moves:[] };
  var at = [s.p].concat(s.b), to = at.map(function(p, k){ var dd = k ? RULE[Q.rules[k - 1]][d] : d, q = L.nb(Q, p, dd); return open(Q, q) ? q : p; });
  // settle who is stopped by whom, all at once: a mover into a tile another ends on (a stayer's own, or the same tile
  // two head for), or a swap of two, stays put; then again, until nobody else has to
  for (var guard = 0; guard < 8; guard++){ var stop = [];
    for (var a = 0; a < at.length; a++){ if (to[a] === at[a]) continue;
      for (var c = 0; c < at.length; c++) if (c !== a && (to[c] === to[a] || (to[a] === at[c] && to[c] === at[a]))){ stop.push(a); break; } }
    if (!stop.length) break; stop.forEach(function(k){ to[k] = at[k]; }); }
  if (to.every(function(q, k){ return q === at[k]; })) return { s:s, ev:n >= 0 && Q.cell[n] === 'C' ? 'locked' : 'bump', moves:[] };
  var mv = []; for (var k = 1; k < at.length; k++) if (to[k] !== at[k]) mv.push(['b' + (k - 1), at[k], to[k], 'walk']);
  if (to[0] !== at[0]) mv.push(['me', at[0], to[0], 'walk']);
  return { s:{ p:to[0], b:to.slice(1) }, ev:'step', moves:mv }; }
function won(G, s){ var Q = parse(G); if (s.p !== Q.nest) return false; for (var k = 0; k < s.b.length; k++) if (s.b[k] !== Q.nests[k]) return false; return true; }

/* THE SEARCH, done once a gym and kept: every state from the start, and which of them can still reach the nests
   without the lever (good). solve() reads the fewest steps off it, audit() and stuck() read good. It is built a slice
   at a time (grow), so the page can build it in the background the moment the trail opens (view) and a phone never
   stalls on it mid-move; node simply runs it to the end (graph). */
var GRAPH = {}, GROW = {};
function grow(G, budget){ if (GRAPH[G.id]) return true; var W = GROW[G.id];
  if (!W){ var s0 = init(G); W = GROW[G.id] = { list:[s0], seen:{}, par:[-1], pm:[-1], back:[[]], wins:[], i:0 }; W.seen[key(s0)] = 0; }
  for (var n = 0; W.i < W.list.length && n < budget; n++, W.i++){ var i = W.i, s = W.list[i]; if (won(G, s)){ W.wins.push(i); continue; }
    for (var d = 0; d < 4; d++){ var r = act(G, s, d); if (r.ev !== 'step') continue; var kk = key(r.s), j = W.seen[kk];
      if (j == null){ j = W.seen[kk] = W.list.length; W.list.push(r.s); W.par.push(i); W.pm.push(d); W.back.push([]); }
      W.back[j].push(i); } }
  if (W.i < W.list.length) return false;
  var good = new Uint8Array(W.list.length), q = W.wins.slice(); q.forEach(function(w){ good[w] = 1; });
  for (var h = 0; h < q.length; h++) W.back[q[h]].forEach(function(p){ if (!good[p]){ good[p] = 1; q.push(p); } });
  GRAPH[G.id] = { list:W.list, seen:W.seen, par:W.par, pm:W.pm, wins:W.wins, good:good }; delete GROW[G.id]; return true; }
function graph(G){ grow(G, Infinity); return GRAPH[G.id]; }
function solve(G){ var X = graph(G); if (!X.wins.length) return { ok:false, why:'the nests cannot be reached', states:X.list.length };
  var w = X.wins[0], path = []; while (X.par[w] >= 0){ path.unshift(X.pm[w]); w = X.par[w]; }
  return { ok:true, moves:path.length, path:path, states:X.list.length }; }
/* STUCK, in the page: a gym records how many of its states are dead ends (dead, checked by audit() like moves and
   proof). A room with none (every state can still reach the nests) never needs its graph on a phone; one with some
   looks the state up in the graph, built once. */
function stuck(G, s){ if (G.dead === 0) return false; var X = graph(G), i = X.seen[key(s)]; return i != null && !X.good[i]; }
function audit(G){ var X = graph(G), N = X.list.length, dead = 0, missed = 0, alarms = 0, ex = null;
  for (var i = 0; i < N; i++){ var says = stuck(G, X.list[i]); if (!X.good[i]){ dead++; if (!says){ missed++; if (!ex) ex = X.list[i]; } } else if (says) alarms++; }
  /* and the graph itself, checked against a fresh search from a sample of states: from a dead one no steps reach the
     nests, from a good one some do */
  var lib = LIB(), K = root.RTT_GYMKIND_MIMIC, n = 0; for (var j = 0; j < N && n < 24; j += Math.max(1, (N / 24) | 0), n++){ var truth = lib.reaches(K, G, X.list[j], 4e6); if (truth === !!X.good[j]) continue; if (truth) missed++; else alarms++; }
  var rec = G.dead == null || G.dead === dead;
  return { ok:missed === 0 && alarms === 0 && rec, why:rec ? '' : 'recorded dead ' + G.dead + ', found ' + dead, states:N, stuck:dead, missed:missed, alarms:alarms, dead:dead, example:ex }; }
function proof(G){ return (G.proof || '').split('').map(function(ch){ return 'URDL'.indexOf(ch); }); }
function enc(path){ return path.map(function(d){ return 'URDL'.charAt(d); }).join(''); }

/* ---- WHAT IT LOOKS LIKE. The floor is baked once (floor() and mats(), the KINDS README): packed valley earth in tiles
   with a dark seam. Each nest is a ring of twigs round straw in its owner's colour: gold for yours, green and blue
   for the babies'. What moves is drawn by the view: the babies, each in its colour, each with its mirror rule over its
   head (green: a double arrow left and right; blue: up and down), and a nest lights up while the right one stands on
   it, so how close the room is to solved reads at a glance. */
var DECK = 0.45, COL = { gold:'#ffd23a', green:'#62d24e', blue:'#4aa8ff' };
var EARTH = ['#c2a272', '#b69666', '#7e6240', '#6e5636'], TWIG = ['#8a6a3a', '#5e4224'];
var STRAW = { N:['#f0cc5a', '#ffe28a'], n:['#8fd86a', '#c4f09a'], m:['#7cbcff', '#bfe0ff'] };
function floor(gc){ var k = gc.k, ex = { gu:gc.u, gv:gc.v, gc:gc.c, gr:gc.r };
  if (k === '#') return { h:DECK, mat:['mmB', ex] };
  return { h:DECK, mat:['mmE', ex] }; }
function mats(){
  function edge(c, e){ var u = c.gu || 0, v = c.gv || 0; return u < e || u > 1 - e || v < e || v > 1 - e; }
  function earth(c, R, h3){ if (c.dt < 0 || edge(c, 0.04)) return R(EARTH[2]); var n = h3(c.ti, c.tj, 71); return R(n < 0.05 ? EARTH[2] : ((c.gc || 0) + (c.gr || 0)) % 2 ? EARTH[0] : EARTH[1]); }
  return {
    mmE:['', '', '', 0, earth],
    mmB:['', '', '', 0, function(c, R){ return R(EARTH[3]); }] }; }
/* a nest: a ring of woven twigs round a bed of straw in its owner's colour (the land paints its floor on a coarse grid,
   too coarse for a ring, so a nest is a low sprite like any other piece) */
function nestFn(S){ return function(B){ B.solid(-0.8, -0.8, 0, 0.8, 0.8, 0.45, function(x, y, z){ var r = Math.hypot(x, y * 1.08), h = (Math.sin(x * 23 + z * 31) * Math.sin(y * 19 - z * 27));
  if (r > 0.5 && r < 0.74 && z < 0.34 - (r - 0.62) * (r - 0.62) * 9) return h > 0.25 ? TWIG[0] : h < -0.35 ? '#4a321a' : TWIG[1];
  if (r <= 0.52 && z < 0.12) return h > 0.4 ? S[1] : S[0]; return null; }, 0.06); }; }
// a boulder: valley sandstone, moss on its crown
function boulderFn(B){ B.vox(-0.9, -0.9, 0, 0.9, 0.9, 1.5, function(set){
  B.blob(set, 0, 0, 0.45, 0.72, 0.62, 0.55, function(x, y, z){ var n = Math.sin(x * 9 + z * 6) * Math.sin(y * 7 - z * 8); return n > 0.4 ? '#a8946e' : n < -0.45 ? '#6e5e46' : '#8a7a5c'; });
  B.blob(set, 0.1, -0.05, 0.85, 0.42, 0.36, 0.28, function(x, y, z){ return z > 0.98 ? (Math.sin(x * 13 + y * 9) > 0.2 ? '#5a8a3a' : '#4a7430') : '#8a7a5c'; }); }, 0.1); }
// a baby dinosaur in profile, facing f (1 right, -1 left): a round body, a big head with a bright eye, a stubby tail.
// Built at K times a unit baby, so it fills most of its tile and reads on a phone.
function babyFn(main, dark, belly, f){ var K = 1.3; return function(B){ B.vox(-1.3, -0.9, 0, 1.3, 0.9, 2, function(set){
  function tube(ax, ay, az, bx, by, bz, r0, r1, c){ B.tube(set, ax * K, ay * K, az * K, bx * K, by * K, bz * K, r0 * K, r1 * K, c); }
  function blob(x, y, z, rx, ry, rz, c){ B.blob(set, x * K, y * K, z * K, rx * K, ry * K, rz * K, typeof c === 'function' ? function(px, py, pz){ return c(px / K, py / K, pz / K); } : c); }
  [[0.16, 0.13], [-0.16, 0.13], [0.16, -0.12], [-0.16, -0.12]].forEach(function(q){ tube(q[0], q[1], 0.45, q[0] + 0.04 * f, q[1], 0.02, 0.1, 0.09, dark); });
  tube(-0.3 * f, 0, 0.55, -0.85 * f, 0, 0.3, 0.17, 0.05, main);
  blob(0, 0, 0.58, 0.42, 0.3, 0.32, function(x, y, z){ return y > 0.12 && z < 0.6 ? belly : Math.sin(x * 14) * Math.sin(y * 12) > 0.7 ? dark : main; });
  blob(0.4 * f, 0, 0.98, 0.27, 0.23, 0.24, main);
  blob(0.62 * f, 0, 0.9, 0.17, 0.16, 0.13, function(x, y, z){ return z < 0.86 ? belly : main; });
  blob(0.47 * f, 0.17, 1.05, 0.07, 0.05, 0.08, '#ffffff'); blob(0.5 * f, 0.21, 1.05, 0.035, 0.03, 0.045, '#14141a');
  [-0.12, 0.05, 0.22].forEach(function(x, k){ blob((x - 0.05) * f, 0, 0.9 + k * 0.03 - (k === 2 ? 0.05 : 0), 0.06, 0.05, 0.08, dark); }); }, 0.07); }; }
var LOOKS = { green:['#5cbf4a', '#3a8a2e', '#d8f0a8'], blue:['#4a90e2', '#2c5ea6', '#cfe6ff'] };
function view(R){ var Q = R.Q, T = R.T, disp = [], rocks = [], spr = {}, mine = Q.nest, me = Q.start, now = 0;
  // a room with dead ends builds its look up in the background, a slice every frame or so, from the moment the trail opens
  if (R.G.dead) (function slice(){ if (!grow(R.G, 2500)) setTimeout(slice, 16); })();
  Q.cell.forEach(function(k, i){ if (k === 'o') rocks.push(i); });
  var rock = R.sprite('gymboulder', boulderFn, 1.8, 1.8, 1.6), nests = [[mine, 'N']].concat(Q.nests.map(function(n, k){ return [n, Q.rules[k] === 'green' ? 'n' : 'm']; }));
  nests.forEach(function(q){ q.push(R.sprite('gymnest:' + q[1], nestFn(STRAW[q[1]]), 1.8, 1.8, 0.6)); });
  Q.rules.forEach(function(r){ var L = LOOKS[r]; spr[r] = [R.sprite('gymbaby:' + r + ':r', babyFn(L[0], L[1], L[2], 1), 2.6, 1.8, 2.2), R.sprite('gymbaby:' + r + ':l', babyFn(L[0], L[1], L[2], -1), 2.6, 1.8, 2.2)]; });
  function chev(ctx, x, y, d, col, lw){ var a = [[0, -1], [1, 0], [0, 1], [-1, 0]][d], s = T * 0.17, p = function(al, ac){ return R.scr(x + a[0] * al - a[1] * ac, y + a[1] * al + a[0] * ac, DECK + 0.02); };
    var p0 = p(-s, -s * 1.3), p1 = p(s * 0.6, 0), p2 = p(-s, s * 1.3); ctx.strokeStyle = 'rgba(30,22,10,0.55)'; ctx.lineWidth = lw + 2; ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke(); }
  function ring(ctx, x, y, rr, col, lw, a){ var c0 = R.scr(x, y, DECK + 0.02), cx = R.scr(x + rr, y, DECK + 0.02), cy = R.scr(x, y + rr, DECK + 0.02);
    ctx.globalAlpha = a; ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.ellipse(c0[0], c0[1], Math.abs(cx[0] - c0[0]) || 1, Math.abs(cy[1] - c0[1]) || 1, 0, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; }
  return {
    lay:function(s){ disp = s.b.map(function(i, k){ var q = R.at(i), old = disp[k]; return { x:q[0], y:q[1], z:DECK, i:i, rule:Q.rules[k], f:old ? old.f : (i % Q.W < Q.W / 2 ? 1 : -1) }; }); me = s.p; },
    move:function(m, u){ var o = disp[+m[0].slice(1)]; if (!o) return; var a = R.at(m[1]), b = R.at(m[2]); o.x = a[0] + (b[0] - a[0]) * u; o.y = a[1] + (b[1] - a[1]) * u; o.z = DECK + (R.reduce ? 0 : Math.sin(u * Math.PI) * 0.22);
      if (b[0] !== a[0]) o.f = b[0] > a[0] ? 1 : -1; },
    things:function(ds){ nests.forEach(function(q){ var a = R.at(q[0]); ds.push({ x:a[0], y:a[1] - 0.5, kd:function(){ R.drawSprite(q[2], a[0], a[1], DECK); } }); });
      rocks.forEach(function(i){ var q = R.at(i); ds.push({ x:q[0], y:q[1], kd:function(e){ R.drawSprite(rock, e.x, e.y, DECK); } }); });
      disp.forEach(function(o){ ds.push({ x:o.x, y:o.y, o:o, kd:function(e){ R.drawSprite(spr[e.o.rule][e.o.f > 0 ? 0 : 1], e.o.x, e.o.y, e.o.z); } }); }); },
    // on the ground: each nest glows while the right one is on it
    ground:function(tsec){ now = tsec; var ctx = R.ctx, kk = R.kk(), lw = Math.max(2, Math.round(kk * 1.1)), pul = R.reduce ? 1 : 0.75 + 0.25 * Math.sin(tsec * 4);
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      var homes = [[mine, me === mine, COL.gold]].concat(Q.nests.map(function(n, k){ return [n, disp[k] && disp[k].i === n, COL[Q.rules[k]]]; }));
      homes.forEach(function(h){ if (!h[1]) return; var q = R.at(h[0]); ring(ctx, q[0], q[1], T * 0.5, h[2], lw + 1, pul); });
      ctx.restore(); },
    /* over each baby's head, its rule: a double arrow in its colour, left and right for green, up and down for blue.
       Part of the piece (it rides with the baby), never words over the board. */
    over:function(){ var ctx = R.ctx, kk = R.kk(); ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      disp.forEach(function(o){ var c = R.scr(o.x, o.y, o.z + 2.35), e = Math.abs(R.scr(o.x + T * 0.3, o.y, o.z)[0] - R.scr(o.x, o.y, o.z)[0]), h = e * 0.45, v = o.rule === 'blue';
        var ax = v ? 0 : e, ay = v ? e * 0.8 : 0, hx = v ? h : h * 0.8, hy = v ? h * 0.8 : h;
        var draw = function(col, w){ ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(c[0] - ax, c[1] - ay); ctx.lineTo(c[0] + ax, c[1] + ay);
          if (v){ ctx.moveTo(c[0] - hx, c[1] - ay + hy); ctx.lineTo(c[0], c[1] - ay); ctx.lineTo(c[0] + hx, c[1] - ay + hy); ctx.moveTo(c[0] - hx, c[1] + ay - hy); ctx.lineTo(c[0], c[1] + ay); ctx.lineTo(c[0] + hx, c[1] + ay - hy); }
          else { ctx.moveTo(c[0] - ax + hx, c[1] - hy); ctx.lineTo(c[0] - ax, c[1]); ctx.lineTo(c[0] - ax + hx, c[1] + hy); ctx.moveTo(c[0] + ax - hx, c[1] - hy); ctx.lineTo(c[0] + ax, c[1]); ctx.lineTo(c[0] + ax - hx, c[1] + hy); }
          ctx.stroke(); };
        var w = Math.max(2, Math.round(kk * 1.3)); draw('rgba(20,14,6,0.8)', w + Math.max(2, Math.round(kk * 1.2))); draw(COL[o.rule], w); });
      ctx.restore(); },
    hot:function(){ return []; } }; }

root.RTT_GYMKIND_MIMIC = { id:'mimic', gyms:GYMS, input:'step', calm:true, RULE:RULE,
  parse:parse, init:init, key:key, act:act, step:act, moves:function(){ return [0, 1, 2, 3]; }, won:won,
  me:function(G, s){ return s.p; }, place:function(G, s, i){ return { p:i, b:s.b }; },
  solve:solve, audit:audit, stuck:stuck, graph:graph, proof:proof, enc:enc,
  goal:function(G){ return parse(G).babies.length > 1 ? 'All on your nests at once. Green mirrors sideways, blue up and down.' : 'You and the baby on your nests at once. It mirrors left and right.'; },
  tell:{ locked:'The vault opens once you\'re all on your nests.' },
  hello:'One tile a step. The baby copies you. Undo takes one back.', unit:'step',
  dur:function(){ return 0.16; }, floor:floor, mats:mats, view:view };
})();
