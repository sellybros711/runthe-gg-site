/* golf/putt/gymkinds/pipes.js: the PIPES kind of trail gym (RTT_GYMKIND_PIPES), Candy Works'. A kind file: the registry
   (gyms.js, its KINDS README) finds it by its global, the frame (trail.js) plays it, check-putt proves it.

   THE PUZZLE: a candy factory's pipe works. A vat of chocolate, striped candy pipes on the floor, valves, and moulds.
   Tap a pipe and it turns a quarter (clockwise from above). Tap a valve and it opens or shuts. Chocolate runs from the
   vat through every pipe joined to it, live, the moment a tap joins them. Fill every mould and the vault opens.

   THE RULES (act):
     - chocolate runs from the vat's spout through every open end that meets an open end. A shut valve stops it (no
       mess). A mould takes it from any side and does not pass it on.
     - an open end that meets nothing (the floor, a wall, a pipe turned the other way) pours chocolate on the floor: a
       SPILL. Nothing more can be done until it is undone (Undo) or the room is put back (Restart, the lever).
     - a mould the chocolate reaches fills, and STAYS full when the flow is cut or turned away: it has set. So the
       moulds can be filled one at a time, by pipes that serve one and then are turned to serve the next.
     - the gatekeeper's twist: pipes striped the same colour TURN TOGETHER. A tap on one turns every pipe of its stripe.
       Red striped pipes turn alone.

   So a pipe joined to live chocolate cannot be turned without pouring it out (turned, its ends move): shut the valve
   first, turn, open again. That is the order the civilians hint at, and the spill is the wrong move that teaches it.

   THE ROOM (rows): the frame's five (# G @ L C, gyms.js) and
     V  the vat (its spout is the one side with a piece next to it)     M  a mould
     s  a straight pipe      e  an elbow      t  a tee         (they turn when tapped)
     S  E  T                 the same, fixed (bolted down: a tap does nothing)
     X  a fixed cross (four ways, all joined)
     =  a valve, east to west          H  a valve, north to south          (shut at the start; a tap opens or shuts)
   G.spin is a digit for every s e t S E T in reading order: how many quarter turns clockwise from its base (a straight
   runs north to south, an elbow opens north and east, a tee north, east and south). G.link (the gatekeeper) is a
   letter for every s e t in reading order: '.' turns alone, the same letter turns together.

   solve() and audit() are the registry's (lib): a breadth first search over every tap. A spilled state has no moves,
   and stuck() says so, so the frame lights Restart there (Undo takes the spill back too). Every state that has not
   spilled can still be solved: shut the valves and every pipe is free to turn, and a full mould never hurts. */
(function(){
var root = typeof window !== 'undefined' ? window : globalThis;
var LIB = function(){ return root.RTT_PUTT_GYMS.lib; };
var DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];   // north (away from the camera), east, south, west: bits 1, 2, 4, 8
var BASE = { s:5, e:3, t:7, S:5, E:3, T:7, X:15, '=':10, H:5 };
var TURNS = { s:1, e:1, t:1 };
function turn(m, n){ for (var k = 0; k < n; k++) m = ((m << 1) | (m >> 3)) & 15; return m; }

/* THE GYMS. world, leg, the mechanic (the world's own first; the gatekeeper adds its twist), the room, and the
   civilian by the gate: a nudge, a plainer line after two restarts, a warmer one after five (never the moves). moves
   and proof are the solver's fewest taps and one shortest solution (the tapped tiles), recorded from solve(). */
var GYMS = [
  /* THE FUDGE ROOM, mid-world (the trail into hole 9): one vat, two valves, three moulds. The lessons: a valve shut is
     a stopper, so one line can run while the pipes past the other valve are set; a full mould stays full, so one
     elbow can feed two moulds in turn; and a pipe with chocolate in it pours out when it is turned the wrong way. */
  { id:'candy1', kind:'pipes', world:'candy', leg:9, name:'The Fudge Room', badge:'Fudge Badge', mech:['pipe'], pay:500, look:{ wall:'stone' },
    moves:11, proof:'37,49,55,67,67,67,76,76,65,73,67',
    who:{ look:{ skin:'medium', polo:'white', hat:'white', pants:'pink', hair:'brown', hairStyle:'ponytail', cap:false, gender:'female' } },
    say:['I\'m on my break, so I\'m just watching. Open a valve too early and you\'re mopping fudge.',
      'Here\'s what took me a week. A full mould stays full. You don\'t have to fill them all at once.',
      'Pipes only turn one way. Sometimes the long way round is the short way. Ask me how I know.'],
    rows:[
      '#########',
      '#...C...#',
      '#M..M...#',
      '#S..S...#',
      '#s..S...#',
      '#S..s.M.#',
      '#s..S.S.#',
      '#T=Se.S.#',
      '#H..eSe.#',
      '#V......#',
      '#L.....@#',
      '#######G#'],
    spin:'0010011000130213' },
  /* THE STRIPE WORKS, guarding the trail into the world's last hole: three valves, seven moulds, and pipes striped the
     same colour that turn together. Each side has an elbow that feeds a mould above it or one below, and a pair of
     straights striped alike, one across while the other is along, so a side's two moulds are never open together. The
     three pink pieces (both elbows and the middle tee) turn as one. The lesson: fill one mould a side, shut that side's
     valve so its pipes are dry, then turn its stripe; and the pink tee in the middle swings from one pair of moulds to
     the next with its foot still joined, so the middle can keep running while both sides are dry. */
  { id:'candy2', kind:'pipes', world:'candy', leg:18, name:'The Stripe Works', badge:'Stripe Badge', mech:['pipe', 'stripe'], pay:1000, keeper:true, look:{ wall:'plank' },
    moves:15, proof:'28,34,40,40,49,58,66,66,28,68,68,34,40,66,68',
    who:{ look:{ skin:'tan', polo:'gold', hat:'red', pants:'navy', hair:'black', hairStyle:'short', cap:true, hatStyle:'cap', gender:'male' } },
    say:['Our tour guide says pipes with the same stripe are hooked together. Turn one and they all turn. I tried it.',
      'My mom says you can\'t do both sides at once in here. Do one side. Then the other.',
      'The guide says a dry pipe never spills when it turns. That\'s what the valves are for.'],
    rows:[
      '#########',
      '#......C#',
      '#M..M..M#',
      '#s..S..s#',
      '#S.MtM.S#',
      '#S..s..S#',
      '#S..H..S#',
      '#eS=X=Se#',
      '#s..S..s#',
      '#M..V..M#',
      '#.......#',
      '#L.....@#',
      '#######G#'],
    spin:'100030010002110001', link:'bca.aabc' }
];

// ---- a room, read once
var PARSED = {};
function parse(G){ if (PARSED[G.id]) return PARSED[G.id];
  var Q = LIB().room(G, function(ch){ return BASE[ch] != null || ch === 'V' || ch === 'M' ? true : false; });
  var spin = (G.spin || '').split('').map(Number), link = (G.link || '').split(''), sp = 0, lk = 0;
  Q.pipeAt = {}; Q.rots = []; Q.fixed = {}; Q.valves = []; Q.valveAt = {}; Q.moulds = []; Q.mouldAt = {}; Q.vat = -1; Q.grp = []; Q.kindAt = {};
  Q.cell.forEach(function(ch, i){
    if (ch === 'V'){ if (Q.vat >= 0) throw new Error(G.id + ': one vat'); Q.vat = i; }
    else if (ch === 'M'){ Q.mouldAt[i] = Q.moulds.length; Q.moulds.push(i); }
    else if (ch === '=' || ch === 'H'){ Q.valveAt[i] = Q.valves.length; Q.valves.push(i); Q.kindAt[i] = ch; }
    else if (ch === 'X'){ Q.kindAt[i] = 'x'; Q.fixed[i] = 15; }
    else if (BASE[ch] != null){ if (sp >= spin.length) throw new Error(G.id + ': spin is short'); var n = spin[sp++]; if (!(n >= 0 && n <= 3)) throw new Error(G.id + ': a spin is 0 to 3');
      Q.kindAt[i] = ch.toLowerCase();
      if (TURNS[ch]){ Q.pipeAt[i] = Q.rots.length; Q.rots.push({ i:i, ch:ch, r0:n % 4, g:link[lk] && link[lk] !== '.' ? link[lk] : null }); lk++; }
      else Q.fixed[i] = turn(BASE[ch], n % 4); } });
  if (sp !== spin.length) throw new Error(G.id + ': spin is long');
  if (G.link && lk !== link.length) throw new Error(G.id + ': link is not one a turning pipe');
  if (Q.vat < 0 || !Q.moulds.length) throw new Error(G.id + ': a vat and a mould at least');
  if (Q.moulds.length > 20 || Q.valves.length > 20) throw new Error(G.id + ': too many to keep as a mask');
  // the turning groups: a pipe turns with every pipe of its stripe
  Q.rots.forEach(function(p, k){ Q.grp[k] = p.g ? Q.rots.map(function(p2, k2){ return p2.g === p.g ? k2 : -1; }).filter(function(x){ return x >= 0; }) : [k]; });
  // the vat's spout: the one side with a piece next to it
  var sides = [0, 1, 2, 3].filter(function(d){ var n = LIB().nb(Q, Q.vat, d); return n >= 0 && (Q.kindAt[n] || Q.mouldAt[n] != null); });
  if (sides.length !== 1) throw new Error(G.id + ': the vat needs exactly one piece beside it');
  Q.spout = sides[0]; Q.all = (1 << Q.moulds.length) - 1;
  Q.tiles = Q.rots.map(function(p){ return p.i; }).concat(Q.valves);
  return PARSED[G.id] = Q; }

/* THE STATE: r the turns of every turning pipe (a digit each), v the valves open (a bit each), f the moulds full (a
   bit each), x a spill (0, or 1 + the tile * 4 + the side it pours from). A new object a move, never one changed. */
function init(G){ var Q = parse(G); return { r:Q.rots.map(function(p){ return p.r0; }).join(''), v:0, f:0, x:0 }; }
function key(s){ return s.r + '|' + s.v + '|' + s.f + '|' + s.x; }
// the open ends of the piece on tile i in state s (0 for a tile with no pipe)
function ends(Q, s, i){ var k = Q.pipeAt[i]; if (k != null) return turn(BASE[Q.rots[k].ch], +s.r.charAt(k));
  if (Q.fixed[i] != null) return Q.fixed[i]; if (Q.valveAt[i] != null) return BASE[Q.kindAt[i] === '=' ? '=' : 'H']; return 0; }
/* THE FLOW: from the vat's spout, every piece joined end to end, breadth first (so its order is the order the
   chocolate reaches them, for the drawing). Returns the wet tiles in order with the tile each was reached from, the
   moulds reached (a mask), and the first spill. */
function flow(Q, s){ var nb = LIB().nb, seen = {}, order = [[Q.vat, 0, -1]], q = [Q.vat], reach = 0, spill = 0;
  seen[Q.vat] = 1;
  for (var h = 0; h < q.length; h++){ var t = q[h], m = t === Q.vat ? 1 << Q.spout : ends(Q, s, t), dp = order[h][1];
    for (var d = 0; d < 4; d++){ if (!(m & (1 << d))) continue; var n = nb(Q, t, d);
      if (n === Q.vat) continue;
      if (n >= 0 && Q.mouldAt[n] != null){ reach |= 1 << Q.mouldAt[n]; if (!seen[n]){ seen[n] = 1; order.push([n, dp + 1, t]); } continue; }
      var nm = n < 0 ? 0 : ends(Q, s, n);
      if (!(nm & (1 << ((d + 2) % 4)))){ if (!spill) spill = 1 + t * 4 + d; continue; }
      if (Q.valveAt[n] != null && !(s.v & (1 << Q.valveAt[n]))) continue;
      if (!seen[n]){ seen[n] = 1; order.push([n, dp + 1, t]); q.push(n); } } }
  return { order:order, reach:reach, spill:spill }; }

/* ONE TAP. A turning pipe turns a quarter with every pipe of its stripe; a valve opens or shuts; the lever puts the
   room back. Then the chocolate runs: a spill, or every mould it reaches is full from now on. */
function act(G, s, i){ var Q = parse(G);
  if (i === Q.lever) return { s:init(G), ev:'reset', moves:[] };
  if (s.x) return { s:s, ev:'bump', moves:[] };
  var k = Q.pipeAt[i], vi = Q.valveAt[i], r = s.r, v = s.v, mv = [], ev;
  if (k != null){ var a = r.split(''); Q.grp[k].forEach(function(k2){ a[k2] = String((+a[k2] + 1) % 4); mv.push(['pipe', Q.rots[k2].i, Q.rots[k2].i, 'turn']); }); r = a.join(''); ev = 'turn'; }
  else if (vi != null){ v = s.v ^ (1 << vi); mv.push(['valve', i, i, 'valve']); ev = v & (1 << vi) ? 'opened' : 'shut'; }
  else return { s:s, ev:'bump', moves:[] };
  var n1 = { r:r, v:v, f:s.f, x:0 }, fl = flow(Q, n1);
  if (fl.spill){ n1.x = fl.spill; ev = 'spill'; }
  else if ((s.f | fl.reach) !== s.f){ n1.f = s.f | fl.reach; ev = 'fill'; }
  // the chocolate's own move, for the drawing: it runs out to where it now reaches (the new state rides along)
  mv.push(['choc', Q.vat, Q.vat, ev === 'spill' || ev === 'fill' || fl.order.length !== flow(Q, s).order.length ? 'pour' : 'flow', n1]);
  return { s:n1, ev:ev, moves:mv }; }
function moves(G, s){ return s.x ? [] : parse(G).tiles.slice(); }
/* A TAP ON THE SCREEN: the frame finds the floor tile under the finger, and a valve's wheel stands up off its tile, so
   a tap on the wheel lands on the tile behind it. A tap on a tile that holds nothing to work, just behind a valve,
   works the valve. Every other tap is act's. */
function tap(G, s, i){ var Q = parse(G), n = i + Q.W; if (Q.pipeAt[i] == null && Q.valveAt[i] == null && i !== Q.lever && Q.valveAt[n] != null) i = n; return act(G, s, i); }
function won(G, s){ return !s.x && s.f === parse(G).all; }
function stuck(G, s){ return !!s.x; }
function proof(G){ return (G.proof || '').split(',').filter(Boolean).map(Number); }
function enc(path){ return path.join(','); }
function goal(G){ return parse(G).moulds.length > 1 ? 'Fill every mould with chocolate.' : 'Fill the mould with chocolate.'; }

/* ---- THE FLOOR: the factory's tiles, cream and vanilla in a check with caramel grout and a few sprinkles, a seam round every tile so the grid reads. Baked
   into the trail's picture (floor() for every tile of the room but the walls, mats() paints it). */
var DECK = 0.45;
function floor(gc){ if (gc.k === '#') return null; return { h:DECK, mat:['pfloor', { gu:gc.u, gv:gc.v, gc:gc.c, gr:gc.r }] }; }
function mats(){ return {
  pfloor:['', '', '', 0, function(c, R, h3){ var u = c.gu || 0, v = c.gv || 0, e = u < 0.05 || u > 0.95 || v < 0.05 || v > 0.95;
    if (c.dt < 0) return R('#b98a6a'); if (e) return R('#c98a5a');
    // a sprinkle or two baked into a tile, at spots fixed by the tile so they never streak
    var odd = ((c.gc || 0) + (c.gr || 0)) % 2, SPR = ['#ff4fa8', '#2fc99a', '#ffd23a', '#4f9dff'], sd = ((c.gc || 0) * 7 + (c.gr || 0) * 13) % 11;
    if (sd < 4){ var su = 0.2 + (sd * 0.17) % 0.6, sv = 0.25 + (sd * 0.29) % 0.5; if (Math.abs(u - su) < 0.06 && Math.abs(v - sv) < 0.03) return R(SPR[sd]); }
    return R(odd ? '#fbe3c4' : '#fff3df'); }] }; }

/* ---- THE DRAWING (browser only, the frame's room R). Everything here is drawn on the frame's canvas in the room's
   own projection (R.scr), so it sits on the floor at the land's size and turns smoothly:
     a turning pipe is a candy cane tube, white with stripes (a stripe's colour is the pipes that turn with it; plain
     red turns alone); a fixed pipe is brown factory pipe with steel clamps; a valve is a steel pipe with a wheel on
     top, red shut and green open; the vat is a copper pot of chocolate; a mould a pink tray.
     chocolate in a pipe shows down its middle, a glass window that runs dark and moving the way it flows. When a tap
     changes the flow it runs out from the vat tile by tile, and a spill pours from the open end into a puddle. */
var TZ = 0.42, STRIPE = { solo:'#e5304c', a:'#ff4fa8', b:'#1fc493', c:'#ffae17', d:'#3d8bff' };
var CH = ['#4a250f', '#6e3a1b', '#a8693d'];
function view(R){ var Q = R.Q, T = R.T, ctx = R.ctx, cur = null, wet = {}, par = {}, nwet = null, npar = null, u0 = 1, maxD = 1, turnU = {}, valveU = {}, spill = 0, nspill = 0, fillU = 1, nf = 0;
  var V = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  function readFlow(s){ var fl = flow(Q, s), w = {}, p = {}; fl.order.forEach(function(o){ w[o[0]] = o[1]; p[o[0]] = o[2]; }); return { w:w, p:p, fl:fl }; }
  function px(ft){ var a = R.scr(0, 0, DECK), b = R.scr(ft, 0, DECK); return Math.abs(b[0] - a[0]); }
  function line(pts, w, col, dash, off){ ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, w); ctx.setLineDash(dash || []); ctx.lineDashOffset = off || 0; ctx.beginPath();
    pts.forEach(function(q, k){ if (k) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }); ctx.stroke(); ctx.setLineDash([]); }
  function dot(q, r, col){ ctx.fillStyle = col; ctx.beginPath(); ctx.arc(q[0], q[1], Math.max(1, r), 0, 7); ctx.fill(); }
  // is tile i wet as drawn now (mid pour: the new chocolate reaches out from the vat as u runs)
  function isWet(i){ if (!nwet) return wet[i] != null; if (nwet[i] == null) return false; if (wet[i] != null) return true; return nwet[i] <= u0 * maxD + 0.5; }
  function parentOf(i){ return nwet && nwet[i] != null ? npar[i] : par[i]; }
  /* ONE TUBE: the ends of a piece from its tile's middle, turned by ang (a quarter turn is PI/2, clockwise from above),
     in the piece's look: 'cane' (a turning pipe, its stripe colour), 'brown' (fixed), 'steel' (a valve). */
  function tube(i, ends, ang, look, stripe, tsec){ var c = R.at(i), z = DECK + TZ, ca = Math.cos(ang), sa = Math.sin(ang), w = px(T * 0.6), kk = R.kk();
    var arms = []; for (var d = 0; d < 4; d++) if (ends & (1 << d)){ var vx = V[d][0] * ca - V[d][1] * sa, vy = V[d][0] * sa + V[d][1] * ca; arms.push([d, vx, vy]); }
    var mid = R.scr(c[0], c[1], z), sh = R.scr(c[0] + 0.12, c[1] + 0.1, DECK + 0.02);
    function end(a, k, zz){ return R.scr(c[0] + a[1] * T * k, c[1] + a[2] * T * k, zz == null ? z : zz); }
    // the shadow on the floor, then the outline, the body, its stripes and its shine
    arms.forEach(function(a){ var e = end(a, 0.5, DECK + 0.02); line([[sh[0], sh[1]], [e[0] + (sh[0] - mid[0]) * 0, e[1]]], w, 'rgba(90,30,60,0.18)'); });
    var edge = look === 'cane' ? '#8c2448' : look === 'steel' ? '#4a5262' : '#3a2010', body = look === 'cane' ? '#fff6f9' : look === 'steel' ? '#c9d0dc' : '#9a6440';
    ctx.lineCap = 'butt';
    arms.forEach(function(a){ var e = end(a, 0.5); line([mid, e], w + 2 * Math.max(1, kk * 0.7), edge); });
    dot(mid, w / 2 + Math.max(1, kk * 0.7), edge);
    arms.forEach(function(a){ var e = end(a, 0.5); line([mid, e], w, body); });
    dot(mid, w / 2, body);
    if (look === 'cane') arms.forEach(function(a){ var e = end(a, 0.5); line([mid, e], w, stripe, [w * 0.42, w * 0.42], w * 0.21); });
    if (look === 'brown') arms.forEach(function(a){ var e = end(a, 0.47); line([R.scr(c[0] + a[1] * T * 0.4, c[1] + a[2] * T * 0.4, z), e], w + 2 * Math.max(1, kk * 0.7), '#b8bec8'); });
    arms.forEach(function(a){ var e = end(a, 0.5); line([[mid[0], mid[1] - w * 0.28], [e[0], e[1] - w * 0.28]], Math.max(1, w * 0.16), 'rgba(255,255,255,0.55)'); });
    // the window down the middle: pale and empty, or chocolate running the way it flows
    var wt = isWet(i), p = parentOf(i), cw = Math.max(3, w * 0.5), glass = look === 'cane' ? '#ffe4ee' : '#efe8e0';
    arms.forEach(function(a){ var e = end(a, 0.5), n = LIB().nb(Q, i, a[0]), inward = wt && n === p, pts = inward ? [e, mid] : [mid, e];
      if (!wt){ line(pts, cw, glass); return; }
      line(pts, cw, CH[1]); line(pts, Math.max(2, cw * 0.5), '#e8b070', [cw * 0.7, cw * 1.1], R.reduce ? 0 : -(tsec || 0) * px(2.6)); });
    dot(mid, cw / 2, wt ? CH[1] : glass);
    // a turning pipe has a knob on top in its stripe's colour, with a white arrow round it: tap to turn
    if (look === 'cane'){ var kn = R.scr(c[0], c[1], z + 0.42), kr = w * 0.5, ky = kr * 0.62;
      ctx.fillStyle = '#5a1430'; ctx.beginPath(); ctx.ellipse(kn[0], kn[1] + kk, kr, ky, 0, 0, 7); ctx.fill();
      ctx.fillStyle = stripe; ctx.beginPath(); ctx.ellipse(kn[0], kn[1], kr, ky, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1, kk * 0.9); ctx.beginPath(); ctx.ellipse(kn[0], kn[1], kr * 0.62, ky * 0.62, 0, -2.4, 1.5); ctx.stroke();
      var ax = kn[0] + Math.cos(1.5) * kr * 0.62, ay = kn[1] + Math.sin(1.5) * ky * 0.62, ah = Math.max(2, kr * 0.38);
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(ax - ah, ay - ah * 0.2); ctx.lineTo(ax + ah * 0.3, ay + ah * 0.55); ctx.lineTo(ax + ah * 0.2, ay - ah * 0.9); ctx.closePath(); ctx.fill(); }
    ctx.lineCap = 'butt'; }
  // the vat: a copper pot, chocolate turning slowly in it, and its spout pipe
  function vat(i, tsec){ var c = R.at(i), r = T * 0.5, top = DECK + 1.9, kk = R.kk();
    tube(i, 1 << Q.spout, 0, 'brown', null, tsec);
    var a = R.scr(c[0] - r, c[1], top), b = R.scr(c[0] + r, c[1], top), mt = R.scr(c[0], c[1], top), mb = R.scr(c[0], c[1], DECK + 0.05), ry = Math.abs(R.scr(c[0], c[1] + r, top)[1] - mt[1]);
    var rx = (b[0] - a[0]) / 2, hgt = mb[1] - mt[1];
    ctx.fillStyle = 'rgba(90,30,60,0.22)'; ctx.beginPath(); ctx.ellipse(mb[0] + rx * 0.15, mb[1], rx * 1.05, ry * 1.05, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#9a4f22'; ctx.beginPath(); ctx.ellipse(mb[0], mb[1], rx, ry, 0, 0, Math.PI); ctx.lineTo(a[0], mt[1]); ctx.ellipse(mt[0], mt[1], rx, ry, 0, Math.PI, 0, true); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d0844a'; ctx.fillRect(Math.round(a[0] + rx * 0.25), Math.round(mt[1]), Math.max(2, Math.round(rx * 0.3)), Math.round(hgt));
    ctx.fillStyle = '#ffd0a0'; ctx.fillRect(Math.round(a[0] + rx * 0.35), Math.round(mt[1] + hgt * 0.1), Math.max(1, Math.round(kk)), Math.round(hgt * 0.7));
    [0.3, 0.75].forEach(function(f){ ctx.fillStyle = '#7a3a18'; ctx.fillRect(Math.round(a[0]), Math.round(mt[1] + hgt * f), Math.round(rx * 2), Math.max(1, Math.round(kk))); });
    ctx.fillStyle = '#e8a06a'; ctx.beginPath(); ctx.ellipse(mt[0], mt[1], rx, ry, 0, 0, 7); ctx.fill();
    ctx.fillStyle = CH[0]; ctx.beginPath(); ctx.ellipse(mt[0], mt[1], rx * 0.82, ry * 0.78, 0, 0, 7); ctx.fill();
    var sw = R.reduce ? 0.6 : (tsec || 0) * 0.9; ctx.strokeStyle = CH[2]; ctx.lineWidth = Math.max(1, kk * 1.5); ctx.beginPath(); ctx.ellipse(mt[0], mt[1], rx * 0.45, ry * 0.4, 0, sw, sw + 2.2); ctx.stroke();
    // rivets round its rim, and steam curling up off the chocolate
    for (var rv = 0; rv < 7; rv++){ var ra = Math.PI * (0.1 + rv * 0.13), rp = [mt[0] + Math.cos(ra) * rx * 0.98, mt[1] + Math.sin(ra) * ry * 0.98 + hgt * 0.12]; ctx.fillStyle = '#ffd0a0'; ctx.fillRect(Math.round(rp[0] - kk * 0.7), Math.round(rp[1]), Math.max(1, Math.round(kk * 1.4)), Math.max(1, Math.round(kk * 1.4))); }
    for (var sp = 0; sp < 3; sp++){ var ph = R.reduce ? sp / 3 : ((tsec || 0) * 0.35 + sp / 3) % 1, st = R.scr(c[0] + Math.sin(ph * 6 + sp) * T * 0.15, c[1], top + 0.3 + ph * 2.2), sr = px(T * (0.14 + ph * 0.22));
      ctx.fillStyle = 'rgba(255,255,255,' + (0.55 * (1 - ph)).toFixed(3) + ')'; ctx.beginPath(); ctx.arc(st[0], st[1], sr, 0, 7); ctx.fill(); } }
  // a mould: a pink tray of four bars, empty (dimpled) or full (chocolate with a shine); filling, the chocolate rises
  function mould(i, tsec){ var c = R.at(i), k = Q.mouldAt[i], full = cur && (cur.f & (1 << k)), filling = nf && (nf & (1 << k)) && !full, f = full ? 1 : filling ? Math.min(1, fillU * 1.2) : 0;
    var h = T * 0.46, zt = DECK + 0.3, P = function(x, y, z){ return R.scr(c[0] + x, c[1] + y, z); }, kk = R.kk();
    var q = [P(-h, -h, zt), P(h, -h, zt), P(h, h, zt), P(-h, h, zt)], fr = [P(-h, h, zt), P(h, h, zt), P(h, h, DECK), P(-h, h, DECK)];
    function poly(pp, col){ ctx.fillStyle = col; ctx.beginPath(); pp.forEach(function(p, j){ if (j) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.closePath(); ctx.fill(); }
    poly(fr, '#b8336f'); poly(q, '#ff7fb6'); ctx.strokeStyle = '#ffd23a'; ctx.lineWidth = Math.max(1, kk * 0.7); ctx.beginPath(); q.forEach(function(p, j){ if (j) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.closePath(); ctx.stroke();
    // four round bonbon cups: empty they are dark pink hollows, filling the chocolate swells up in them, full each is a
    // bonbon with a white drizzle across it
    for (var a = 0; a < 2; a++) for (var b = 0; b < 2; b++){ var cc = P(-h * 0.45 + a * h * 0.9, -h * 0.45 + b * h * 0.9, zt), cr = px(h * 0.38), cy = cr * 0.62;
      ctx.fillStyle = '#b83a72'; ctx.beginPath(); ctx.ellipse(cc[0], cc[1], cr, cy, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#d9668f'; ctx.beginPath(); ctx.ellipse(cc[0], cc[1] + cy * 0.2, cr * 0.85, cy * 0.7, 0, 0, 7); ctx.fill();
      if (f > 0){ ctx.fillStyle = CH[1]; ctx.beginPath(); ctx.ellipse(cc[0], cc[1] - cy * 0.3 * f, cr * (0.5 + 0.45 * f), cy * (0.5 + 0.5 * f), 0, 0, 7); ctx.fill();
        ctx.fillStyle = CH[2]; ctx.beginPath(); ctx.ellipse(cc[0] - cr * 0.3, cc[1] - cy * (0.3 * f + 0.35), cr * 0.25 * f, cy * 0.2 * f, 0, 0, 7); ctx.fill();
        if (f >= 1) line([[cc[0] - cr * 0.6, cc[1] - cy * 0.2], [cc[0] - cr * 0.2, cc[1] - cy * 0.55], [cc[0] + cr * 0.2, cc[1] - cy * 0.15], [cc[0] + cr * 0.6, cc[1] - cy * 0.5]], Math.max(1, kk), '#fff4e0'); } }
    if (full && !R.reduce){ var tw = ((tsec || 0) * 0.8 + k * 0.37) % 3; if (tw < 0.25){ var st = P(h * 0.4, -h * 0.4, zt + 0.3); ctx.fillStyle = '#fff'; ctx.fillRect(Math.round(st[0] - kk), Math.round(st[1]), Math.max(1, Math.round(kk * 2)), Math.max(1, Math.round(kk))); ctx.fillRect(Math.round(st[0]), Math.round(st[1] - kk), Math.max(1, Math.round(kk)), Math.max(1, Math.round(kk * 3))); } } }
  // a valve: steel pipe and a wheel on a stem, red shut and green open; it spins as it is turned
  function valve(i, tsec){ var c = R.at(i), k = Q.valveAt[i], open = cur && (cur.v & (1 << k)), u = valveU[i];
    tube(i, BASE[Q.kindAt[i] === '=' ? '=' : 'H'], 0, 'steel', null, tsec);
    var zt = DECK + TZ + 0.7, r = T * 0.46, m = R.scr(c[0], c[1], zt), b0 = R.scr(c[0], c[1], DECK + TZ), rx = px(r), ry = rx * 0.6, kk = R.kk();
    if (u != null) open = u < 0.5 ? !open : open;
    line([b0, m], Math.max(2, kk * 1.4), '#4a5262');
    var col = open ? '#27c46a' : '#e5304c', dk = open ? '#13703a' : '#8a1426', spin = (u != null ? u * Math.PI : 0) + (open ? 0.5 : 0);
    // a big wheel: a dark rim under a bright one, four fat spokes, and a hub in the same colour, red shut and green open
    ctx.lineWidth = Math.max(3, kk * 3); ctx.strokeStyle = dk; ctx.beginPath(); ctx.ellipse(m[0], m[1] + kk * 1.2, rx, ry, 0, 0, 7); ctx.stroke();
    ctx.strokeStyle = col; ctx.beginPath(); ctx.ellipse(m[0], m[1], rx, ry, 0, 0, 7); ctx.stroke();
    for (var j = 0; j < 4; j++){ var a = spin + j * Math.PI / 2; line([m, [m[0] + Math.cos(a) * rx, m[1] + Math.sin(a) * ry]], Math.max(2, kk * 2), col); }
    ctx.lineWidth = Math.max(1, kk); ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.ellipse(m[0], m[1] - kk, rx * 0.9, ry * 0.85, 0, 3.6, 5.4); ctx.stroke();
    ctx.fillStyle = dk; ctx.beginPath(); ctx.ellipse(m[0], m[1], rx * 0.32, ry * 0.32, 0, 0, 7); ctx.fill(); ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(m[0], m[1] - kk * 0.5, rx * 0.24, ry * 0.24, 0, 0, 7); ctx.fill(); }
  // a spill: chocolate pours out of the open end (drawn over everything, so it is never lost behind a pipe) into a
  // puddle on the floor that spreads
  function spot(x){ var t = ((x - 1) / 4) | 0, d = (x - 1) % 4, c = R.at(t); return { d:d, e:[c[0] + V[d][0] * T * 0.5, c[1] + V[d][1] * T * 0.5] }; }
  function puddle(x, tsec, u){ var S = spot(x), f = Math.max(0.2, u), p = R.scr(S.e[0] + V[S.d][0] * T * 0.25, S.e[1] + V[S.d][1] * T * 0.25, DECK + 0.02), rr = px(T * 0.8 * f), wob = R.reduce ? 0 : Math.sin((tsec || 0) * 3) * 0.04;
    ctx.fillStyle = CH[0]; ctx.beginPath(); ctx.ellipse(p[0], p[1], rr * (1 + wob), rr * 0.52, 0, 0, 7); ctx.fill();
    ctx.fillStyle = CH[1]; ctx.beginPath(); ctx.ellipse(p[0], p[1] - rr * 0.05, rr * 0.84, rr * 0.4, 0, 0, 7); ctx.fill();
    ctx.fillStyle = CH[2]; ctx.beginPath(); ctx.ellipse(p[0] - rr * 0.3, p[1] - rr * 0.15, rr * 0.22, rr * 0.08, 0, 0, 7); ctx.fill(); }
  function stream(x, tsec){ var S = spot(x), top = R.scr(S.e[0], S.e[1], DECK + TZ), arc = R.scr(S.e[0] + V[S.d][0] * T * 0.15, S.e[1] + V[S.d][1] * T * 0.15, DECK + TZ + 0.1), bot = R.scr(S.e[0] + V[S.d][0] * T * 0.25, S.e[1] + V[S.d][1] * T * 0.25, DECK + 0.05), w = px(T * 0.22);
    ctx.lineCap = 'round'; ctx.strokeStyle = CH[0]; ctx.lineWidth = w + 2; ctx.beginPath(); ctx.moveTo(top[0], top[1]); ctx.quadraticCurveTo(arc[0], arc[1], bot[0], bot[1]); ctx.stroke();
    ctx.strokeStyle = CH[1]; ctx.lineWidth = w; ctx.stroke(); ctx.setLineDash([w * 0.6, w * 1.2]); ctx.lineDashOffset = R.reduce ? 0 : -(tsec || 0) * px(3); ctx.strokeStyle = '#e0a868'; ctx.lineWidth = Math.max(1, w * 0.35); ctx.stroke(); ctx.setLineDash([]); ctx.lineCap = 'butt'; }
  function ang(i){ var u = turnU[i]; return u == null ? 0 : -(1 - u) * Math.PI / 2; }
  function draw(t, tsec){ var i = t.i, k = Q.pipeAt[i];
    if (i === Q.vat) return vat(i, tsec);
    if (Q.mouldAt[i] != null) return mould(i, tsec);
    if (Q.valveAt[i] != null) return valve(i, tsec);
    if (k != null){ var pr = Q.rots[k]; return tube(i, ends(Q, cur, i), ang(i), 'cane', STRIPE[pr.g || 'solo'], tsec); }
    if (Q.fixed[i] != null) return tube(i, Q.fixed[i], 0, 'brown', null, tsec); }
  var pieces = []; Q.cell.forEach(function(ch, i){ if (i === Q.vat || Q.mouldAt[i] != null || Q.kindAt[i]) pieces.push(i); });
  /* THE FACTORY ROUND THE PUZZLE, art only: a chocolate river running along the top of the far wall, lollipops and
     gumdrops standing on the side walls, a candy cane railing along the near wall, and a striped awning over the vault. */
  var WZ = DECK + 0.95, gcol = Q.gate % Q.W, deco = [];
  for (var dr = 2; dr < Q.H - 2; dr += 3) [0, Q.W - 1].forEach(function(dc, k){ deco.push({ x:R.x0 + (dc + 0.5) * T, y:R.y0 + (dr + 0.5) * T, k:(dr + k) % 2 ? 'gum' : 'pop', n:dr + k }); });
  function river(tsec){ var y = R.y0 + T * 0.5, a = R.scr(R.x0 + T * 0.35, y, WZ + 0.02), b = R.scr(R.x0 + (Q.W - 0.35) * T, y, WZ + 0.02), w = px(T * 0.55);
    ctx.lineCap = 'round'; line([a, b], w + 4, '#3a1c0a'); line([a, b], w, CH[1]);
    line([[a[0], a[1] - w * 0.15], [b[0], b[1] - w * 0.15]], Math.max(2, w * 0.25), '#c98a52', [w * 0.6, w * 1.4], R.reduce ? 0 : -(tsec || 0) * px(1.5));
    line([[a[0], a[1] + w * 0.2], [b[0], b[1] + w * 0.2]], Math.max(1, w * 0.12), '#8a4e26', [w * 0.3, w * 2], R.reduce ? 0 : -(tsec || 0) * px(1.1)); ctx.lineCap = 'butt'; }
  function lolly(t, tsec){ var kk = R.kk(), base = R.scr(t.x, t.y, WZ), top = R.scr(t.x, t.y, WZ + 1.5), r = px(T * 0.32), cols = [['#ff4fa8', '#fff4f8'], ['#2fc99a', '#fffbe8'], ['#ffae17', '#fff4f8']][t.n % 3];
    if (t.k === 'pop'){ line([base, top], Math.max(2, kk * 1.6), '#fff8f0'); ctx.fillStyle = cols[1]; ctx.beginPath(); ctx.arc(top[0], top[1], r, 0, 7); ctx.fill();
      ctx.strokeStyle = cols[0]; ctx.lineWidth = Math.max(2, r * 0.28); ctx.beginPath(); for (var q = 0; q < 26; q++){ var an = q * 0.55 + (R.reduce ? 0 : (tsec || 0) * 0.5), rr = r * q / 26; if (q) ctx.lineTo(top[0] + Math.cos(an) * rr, top[1] + Math.sin(an) * rr); else ctx.moveTo(top[0], top[1]); } ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = Math.max(1, kk * 0.7); ctx.beginPath(); ctx.arc(top[0], top[1], r, 0, 7); ctx.stroke(); return; }
    var g = R.scr(t.x, t.y, WZ + 0.05), gr = px(T * 0.3); ctx.fillStyle = cols[0]; ctx.beginPath(); ctx.ellipse(g[0], g[1], gr, gr * 0.5, 0, 0, Math.PI); ctx.lineTo(g[0] - gr, g[1]); ctx.ellipse(g[0], g[1] - gr * 0.3, gr, gr * 0.9, 0, Math.PI, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; [[-0.4, -0.7], [0.2, -0.9], [0.45, -0.4], [-0.1, -0.3]].forEach(function(o){ ctx.fillRect(Math.round(g[0] + o[0] * gr), Math.round(g[1] + o[1] * gr), Math.max(1, Math.round(kk)), Math.max(1, Math.round(kk))); }); }
  // the railing: a candy cane post at every tile of the near wall but the gate's, and a striped rail between
  function railing(){ var y = R.y0 + (Q.H - 0.5) * T, z1 = WZ + 0.55, kk = R.kk(), pw = Math.max(2, px(T * 0.12)), runs = [[0, gcol - 1], [gcol + 1, Q.W - 1]];
    runs.forEach(function(rn){ if (rn[1] < rn[0]) return; var a = R.scr(R.x0 + (rn[0] + 0.3) * T, y, z1), b = R.scr(R.x0 + (rn[1] + 0.7) * T, y, z1);
      ctx.lineCap = 'round'; line([a, b], pw + 2, '#8c2448'); line([a, b], pw, '#fff6f9'); line([a, b], pw, '#e5304c', [pw * 1.2, pw * 1.2]); ctx.lineCap = 'butt';
      for (var c2 = rn[0]; c2 <= rn[1]; c2++){ var p0 = R.scr(R.x0 + (c2 + 0.5) * T, y, WZ), p1 = R.scr(R.x0 + (c2 + 0.5) * T, y, z1); line([p0, p1], pw, '#fff6f9'); line([p0, p1], pw, '#e5304c', [pw * 0.8, pw * 0.8]); } }); }
  // the awning over the vault: pink and white stripes on two poles, its front edge scalloped
  function awning(){ var cq = R.at(Q.chest), kk = R.kk(), hw = T * 0.62, yb = cq[1] - T * 0.55, yf = cq[1] - T * 0.05, zb = DECK + 2.9, zf = DECK + 2.4, n = 6;
    [-1, 1].forEach(function(sx){ line([R.scr(cq[0] + sx * hw * 0.95, yf, DECK + 0.4), R.scr(cq[0] + sx * hw * 0.95, yf, zf)], Math.max(2, kk * 1.4), '#c8ccd8'); });
    for (var k = 0; k < n; k++){ var xa = cq[0] - hw + 2 * hw * k / n, xb = cq[0] - hw + 2 * hw * (k + 1) / n, pts = [R.scr(xa, yb, zb), R.scr(xb, yb, zb), R.scr(xb, yf, zf), R.scr(xa, yf, zf)];
      ctx.fillStyle = k % 2 ? '#fff6f9' : '#ff4fa8'; ctx.beginPath(); pts.forEach(function(q, j){ if (j) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }); ctx.closePath(); ctx.fill();
      var m = R.scr((xa + xb) / 2, yf, zf), rr = Math.abs(pts[2][0] - pts[3][0]) / 2; ctx.beginPath(); ctx.arc(m[0], m[1], rr, 0, Math.PI); ctx.fill(); }
    line([R.scr(cq[0] - hw, yf, zf), R.scr(cq[0] + hw, yf, zf)], Math.max(1, kk), '#c93a7a'); }
  return {
    lay:function(s){ cur = s; var F = readFlow(s); wet = F.w; par = F.p; nwet = null; npar = null; turnU = {}; valveU = {}; spill = s.x; nspill = 0; nf = 0; fillU = 1; },
    move:function(m, u, tsec){
      if (m[0] === 'pipe'){ turnU[m[1]] = u; if (u >= 1) delete turnU[m[1]]; return; }
      if (m[0] === 'valve'){ valveU[m[1]] = u; if (u >= 1) delete valveU[m[1]]; return; }
      if (m[0] === 'choc'){ var s1 = m[4]; if (!nwet || m !== this._m){ this._m = m; var F = readFlow(s1); nwet = F.w; npar = F.p; maxD = 1; for (var q in nwet) maxD = Math.max(maxD, nwet[q]); nspill = s1.x; nf = s1.f & ~cur.f;
          // a tap that turns a pipe shows it turned at once, the chocolate then runs: the turned state is the one drawn
          cur = { r:s1.r, v:s1.v, f:cur.f, x:0 }; }
        u0 = u; fillU = Math.max(0, (u - 0.55) / 0.45); if (u >= 1 && nspill && !this._sp){ this._sp = 1; R.burst(R.at(((nspill - 1) / 4) | 0)[0], R.at(((nspill - 1) / 4) | 0)[1], DECK + 0.6, CH, 10, 1, 0.6); } if (u < 1) this._sp = 0; } },
    things:function(ds){ pieces.forEach(function(i){ var q = R.at(i); ds.push({ x:q[0], y:q[1] - 0.05, i:i, kd:draw }); });
      deco.forEach(function(t){ ds.push({ x:t.x, y:t.y, k:t.k, n:t.n, kd:lolly }); });
      var cq = R.at(Q.chest); ds.push({ x:cq[0], y:cq[1] + 0.02, kd:awning }); ds.push({ x:R.x0, y:R.y0 + Q.H * T, kd:railing }); },
    ground:function(tsec){ river(tsec); var x = nwet ? (u0 > 0.9 ? nspill : 0) : spill; if (x) puddle(x, tsec, nwet ? Math.min(1, (u0 - 0.9) * 10) : 1); },
    over:function(tsec){ var x = nwet ? (u0 > 0.9 ? nspill : 0) : spill; if (x) stream(x, tsec); } }; }

root.RTT_GYMKIND_PIPES = { id:'pipes', gyms:GYMS, input:'tap', calm:true, parse:parse, init:init, key:key, act:act, tap:tap, moves:moves, won:won, stuck:stuck,
  proof:proof, enc:enc, goal:goal, view:view, floor:floor, mats:mats,
  tell:{ stuck:'Chocolate on the floor. Undo it, or Restart.' },
  hello:'Tap a pipe to turn it. Tap a valve to open it. Undo takes one back.', unit:'tap',
  dur:function(how){ return how === 'pour' ? 0.7 : how === 'valve' ? 0.22 : how === 'turn' ? 0.2 : 0.12; },
  flow:function(G, s){ return flow(parse(G), s); }, ends:function(G, s, i){ return ends(parse(G), s, i); } };
})();
