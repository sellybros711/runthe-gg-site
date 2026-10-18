/* golf/putt/gymkinds/lights.js: the LIGHTS kind of trail gym (RTT_GYMKIND_LIGHTS), the Schoolyard's. A kind file: the
   registry (gyms.js, its KINDS README) finds it by its global, the frame (trail.js) plays it, check-putt proves it.

   THE PUZZLE: a classroom floor of tiles, each lit (gold) or dark (blue). Some tiles carry a SWITCH, drawn as a chalk
   plus: a tap on it flips that tile and the four tiles next to it (up, down, left, right; only floor tiles flip). The
   mid-world gym is solved when the whole floor is one colour. A tap kind: the golfer stands where he came in, and the
   state is only the floor.

   THE GATEKEEPER'S TWIST is the Clubhouse's windmill, as a schoolyard PINWHEEL. A pinwheel flips the four tiles its
   blades point at, and not its own tile, then turns an eighth: pointing straight (up, down, left, right) it flips
   those four, and next time, pointing on the diagonals, it flips the four corner tiles round it, and so on. So two taps
   on a pinwheel are not nothing (they flip all eight round it), and it takes four to put one back. The floor is
   solved when the lit tiles are exactly the ones chalked on it (G.chalk, '*' a tile to light).

   THE LAYOUTS ARE HAND DESIGNED, never random. The room's own characters (the frame reads # G @ L C):
     o  a dark floor tile      O  a lit floor tile
     s  a switch on a dark tile      S  a switch on a lit tile
     p  a pinwheel on a dark tile, pointing straight      P  the same on a lit tile
     .  plain deck (not part of the floor: nothing flips it)
   A tap on the lever (L) is Restart, as the button is.

   The search is the registry's own (lib.solve, lib.audit: breadth first over every tap). Every tap can be undone by
   taps (a switch by itself again, a pinwheel by three more), so every state a player can reach can reach the start and
   so the solution: nothing here is ever stuck, which stuck() says and lib.audit proves state by state. */
(function(){
var root = typeof window !== 'undefined' ? window : globalThis;
var LIB = function(){ return root.RTT_PUTT_GYMS.lib; };

/* THE GYMS. world, leg (the trail into that hole of the world), mech (the mid-world gym's one; the gatekeeper's is that
   and the Clubhouse's windmill), the room, and the civilian by the gate: three lines that nudge, never the taps. moves
   and proof are the solver's fewest taps and one shortest solution (the tapped tiles), recorded from solve(). */
var GYMS = [
  /* THE CLASSROOM, mid-world: a 5 by 5 floor, twelve switches, no twist. The lesson is that a tap twice is no tap at
     all, so each switch is either in the answer or not, and order never matters; and that a tile only one switch can
     reach says, all by itself, whether that switch is in. That decides the next, six links deep. Pressing the dark
     switches (the obvious move) is wrong on eleven of the twelve. */
  { id:'school1', kind:'lights', world:'school', leg:9, name:'The Classroom', badge:'Gold Star Badge', mech:['switch'], pay:500, look:{ wall:'stone' },
    moves:9, proof:'30,32,39,41,48,58,66,67,68',
    who:{ look:{ skin:'light', polo:'green', hat:'white', pants:'khaki', hair:'auburn', hairStyle:'ponytail', cap:false, gender:'female' } },
    say:['I teach in there. Every one of those switches does more than you\'d think. Watch the tiles around it.',
      'Here\'s a thing I tell my class. Pressing a switch twice is the same as never pressing it.',
      'Look for a tile only one switch can reach. That switch has no choice. Start there.'],
    rows:[
      '#########',
      '#C......#',
      '#.......#',
      '#.oSOSo.#',
      '#.ssOSs.#',
      '#.oSOsO.#',
      '#.OoSOO.#',
      '#.oSSSo.#',
      '#.......#',
      '#L.....@#',
      '#######G#'
    ] },
  /* THE SCIENCE FAIR, the gatekeeper: seven switches and four pinwheels, and a heart chalked on the floor says which
     tiles to light. Three of the pinwheels want only their corners (three taps each), the fourth both its patterns. */
  { id:'school2', kind:'lights', world:'school', leg:18, name:'The Science Fair', badge:'Blue Ribbon Badge', mech:['switch', 'windmill'], pay:1000, keeper:true, look:{ wall:'stone' },
    moves:16, proof:'30,31,32,38,39,39,39,41,41,41,42,57,57,57,59,59',
    who:{ look:{ skin:'brown', polo:'navy', hat:'black', pants:'grey', hair:'black', hairStyle:'buzz', cap:false, gender:'male' } },
    say:['My daughter built the pinwheel floor for the science fair. Won a ribbon. I still can\'t do it.',
      'Keep an eye on which way a pinwheel points. It never hits the same tiles twice in a row.',
      'A pinwheel takes four taps to come back around. Sometimes three is what you want.'],
    rows:[
      '#########',
      '#C......#',
      '#.......#',
      '#.OSSSO.#',
      '#.sPoPs.#',
      '#.sOOos.#',
      '#.oPoPO.#',
      '#.OoOOO.#',
      '#.......#',
      '#L.....@#',
      '#######G#'
    ],
    chalk:[
      '.........',
      '.........',
      '.........',
      '...*.*...',
      '..*****..',
      '..*****..',
      '...***...',
      '....*....',
      '.........',
      '.........',
      '.........'
    ] }
];

var ORTH = [[0, -1], [1, 0], [0, 1], [-1, 0]], DIAG = [[1, -1], [1, 1], [-1, 1], [-1, -1]];
var PARSED = {};
/* THE ROOM: the frame's five through lib.room, and the floor. Q.lights is every floor tile in reading order (bit k of
   the state is lights[k]), Q.li the bit of a tile, Q.sw the switches and pinwheels ({ i, pin, b } with b the bit of
   a pinwheel's turn), Q.lit0 the floor lit at the start, Q.want the chalk (null: one colour, either one). */
function parse(G){ if (PARSED[G.id]) return PARSED[G.id]; var lights = [], lit = 0, sw = [], nPin = 0;
  var Q = LIB().room(G, function(ch, i){ if ('oOsSpP'.indexOf(ch) < 0) return false;
    if (ch === 'O' || ch === 'S' || ch === 'P') lit |= 1 << lights.length;
    if (ch === 's' || ch === 'S') sw.push({ i:i, pin:false }); else if (ch === 'p' || ch === 'P') sw.push({ i:i, pin:true, b:nPin++ });
    lights.push(i); });
  if (lights.length > 30) throw new Error(G.id + ': too many floor tiles for a mask');
  var li = {}; lights.forEach(function(t, k){ li[t] = k; });
  Q.lights = lights; Q.li = li; Q.sw = sw; Q.lit0 = lit; Q.all = lights.length === 30 ? 0x3fffffff : (1 << lights.length) - 1; Q.want = null; Q.swAt = {};
  sw.forEach(function(w){ Q.swAt[w.i] = w;
    // what it flips: a switch its own tile and the four round it; a pinwheel the four its blades point at, either way
    w.plus = mask(Q, w.i, ORTH, !w.pin); w.diag = w.pin ? mask(Q, w.i, DIAG, false) : 0; });
  if (G.chalk){ var want = 0; G.chalk.forEach(function(row, r){ for (var c = 0; c < row.length; c++) if (row.charAt(c) === '*'){ var k = li[r * Q.W + c]; if (k == null) throw new Error(G.id + ': chalk off the floor at ' + c + ',' + r); want |= 1 << k; } }); Q.want = want; }
  return PARSED[G.id] = Q; }
function mask(Q, i, dirs, self){ var c = i % Q.W, r = (i / Q.W) | 0, m = self ? 1 << Q.li[i] : 0;
  dirs.forEach(function(d){ var nc = c + d[0], nr = r + d[1]; if (nc < 0 || nr < 0 || nc >= Q.W || nr >= Q.H) return; var k = Q.li[nr * Q.W + nc]; if (k != null) m |= 1 << k; });
  return m; }
// the state: the floor as a mask (m) and which pinwheels point on the diagonals (d). A new object a move.
function init(G){ return { m:parse(G).lit0, d:0 }; }
function key(s){ return s.m + ':' + s.d; }
/* A TAP. A switch flips its plus; a pinwheel flips where it points and turns. The lever is Restart; a floor tile with
   nothing on it answers plain (the frame says once what to tap). moves, for the
   picture: a ['tile', t, t, 'flip'] for every tile that flips, and the pinwheel's ['pin', i, i, 'spin']. */
function act(G, s, i){ var Q = parse(G), w = Q.swAt[i];
  if (i === Q.lever) return { s:init(G), ev:'reset', moves:[] };
  if (!w) return { s:s, ev:Q.li[i] != null ? 'plain' : 'bump', moves:[] };
  var diag = w.pin && (s.d >> w.b & 1), f = diag ? w.diag : w.plus, mv = [];
  Q.lights.forEach(function(t, k){ if (f >> k & 1) mv.push(['tile', t, t, 'flip']); });
  if (w.pin) mv.push(['pin', i, i, 'spin']);
  return { s:{ m:s.m ^ f, d:w.pin ? s.d ^ (1 << w.b) : s.d }, ev:w.pin ? 'spin' : 'flip', moves:mv }; }
function moves(G){ return parse(G).sw.map(function(w){ return w.i; }); }
function won(G, s){ var Q = parse(G); return Q.want != null ? s.m === Q.want : s.m === 0 || s.m === Q.all; }
function proof(G){ return (G.proof || '').split(',').filter(Boolean).map(Number); }
function enc(path){ return path.join(','); }
function goal(G){ return G.chalk ? 'Light the chalked tiles, and only those.' : 'Make the whole floor one colour.'; }

/* ---- THE PICTURE. The schoolroom's floor is baked (floor(), mats()): a varnished board floor, and under each floor
   tile a dark grout frame. What changes is drawn each frame on top of it (view.things): every floor tile in its colour,
   a switch's chalk plus, a pinwheel's four blades pointing where it will flip next, and the gatekeeper's chalk. */
var LIT = ['#ffd23a', '#fff1a0', '#c99a14'], DARK = ['#2f4a7a', '#4a68a0', '#1c2e52'], CHALK = 'rgba(255,255,255,0.92)', BLADE = ['#e8483a', '#3a8fe8', '#ffd23a', '#3ac06a'];
var D_FLIP = 0.22, D_SPIN = 0.22;
function floor(gc){ if (gc.k === '#') return null; var tile = 'oOsSpP'.indexOf(gc.k) >= 0;
  return { mat:['lfloor', { gu:gc.u, gv:gc.v, gc:gc.c, gr:gc.r, lt:tile ? 1 : 0 }] }; }
function mats(){ return {
  // boards run across the room, a seam every quarter tile; a floor tile's grout frame shows round its coloured face
  lfloor:['', '', '', 0, function(c, R, h3){ var u = c.gu || 0, v = c.gv || 0, n = h3(c.ti, c.tj, 47);
    if (c.dt < 0) return R('#6e4a2c');
    if (c.lt && (u < 0.07 || u > 0.93 || v < 0.07 || v > 0.93)) return R('#232a38');
    var pl = Math.floor(v * 4), seam = Math.abs(v * 4 - Math.round(v * 4)) < 0.05;
    return R(seam ? '#9c7445' : n < 0.05 ? '#b88a52' : (pl + (c.gc || 0) + (c.gr || 0)) % 2 ? '#d9b07a' : '#cfa46c'); }] }; }
function view(R){ var Q = R.Q, G = R.G, T = R.T, Z = R.DECK + 0.015, m = 0, d = 0, flip = {}, spin = {};
  function P(x, y){ return R.scr(x, y, Z); }
  function quad(c, r, a0, a1, h){ var x0 = R.x0 + c * T, y0 = R.y0 + r * T, ym = y0 + T / 2, hh = (a1 - a0) * h / 2;
    return [P(x0 + a0 * T, ym - hh * T), P(x0 + a1 * T, ym - hh * T), P(x0 + a1 * T, ym + hh * T), P(x0 + a0 * T, ym + hh * T)]; }
  function poly(pts, col){ var ctx = R.ctx; ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (var j = 1; j < pts.length; j++) ctx.lineTo(pts[j][0], pts[j][1]); ctx.closePath(); ctx.fill(); }
  function line(a, b){ var ctx = R.ctx; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
  // a tile: its face in its colour, a lighter top edge, a darker near edge, squashed flat half way through a flip
  function tile(t, k){ var c = t % Q.W, r = (t / Q.W) | 0, on = m >> k & 1, u = flip[t], h = 1;
    if (u != null){ h = Math.abs(Math.cos(u * Math.PI)); if (u > 0.5) on ^= 1; h = Math.max(0.08, h); }
    var C = on ? LIT : DARK; poly(quad(c, r, 0.08, 0.92, 0.84 * h), C[2]); poly(quad(c, r, 0.11, 0.89, 0.76 * h), C[0]);
    if (h > 0.6){ var x0 = R.x0 + c * T, y0 = R.y0 + r * T + T * (0.5 - 0.38 * h); poly([P(x0 + 0.11 * T, y0), P(x0 + 0.89 * T, y0), P(x0 + 0.89 * T, y0 + 0.1 * T), P(x0 + 0.11 * T, y0 + 0.1 * T)], C[1]); } }
  function chalkLine(w){ var ctx = R.ctx; ctx.strokeStyle = CHALK; ctx.lineWidth = Math.max(1.5, R.kk() * w); ctx.lineCap = 'round'; }
  // a switch: a chalk plus whose arms reach toward the four tiles it flips, round a ring for its own
  function plus(t){ var q = R.at(t), a = T * 0.4, b = T * 0.13; chalkLine(1.2);
    [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(function(dv){ line(P(q[0] + dv[0] * b, q[1] + dv[1] * b), P(q[0] + dv[0] * a, q[1] + dv[1] * a)); });
    var ctx = R.ctx, c0 = P(q[0], q[1]), cx = P(q[0] + b * 0.8, q[1]), cy = P(q[0], q[1] + b * 0.8); ctx.beginPath(); ctx.ellipse(c0[0], c0[1], Math.abs(cx[0] - c0[0]) || 1, Math.abs(cy[1] - c0[1]) || 1, 0, 0, 7); ctx.stroke(); }
  // a pinwheel: four bright blades round a pin, pointing straight or on the diagonals, turning an eighth a tap
  function pin(w){ var q = R.at(w.i), base = (d >> w.b & 1) ? Math.PI / 4 : 0, u = spin[w.i], a = base + (u != null ? u * Math.PI / 4 : 0), L = T * 0.42, ctx = R.ctx;
    for (var j = 0; j < 4; j++){ var th = a + j * Math.PI / 2, dx = Math.sin(th), dy = -Math.cos(th), px = -dy, py = dx;
      var tip = [q[0] + dx * L, q[1] + dy * L], s1 = [q[0] + dx * L * 0.55 + px * T * 0.13, q[1] + dy * L * 0.55 + py * T * 0.13];
      poly([P(q[0], q[1]), P(tip[0], tip[1]), P(s1[0], s1[1])], BLADE[j]);
      ctx.strokeStyle = 'rgba(20,20,30,0.7)'; ctx.lineWidth = Math.max(1, R.kk() * 0.4); line(P(q[0], q[1]), P(tip[0], tip[1])); }
    var c0 = P(q[0], q[1]); ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(c0[0], c0[1], Math.max(2, R.kk() * 1.1), 0, 7); ctx.fill(); }
  // the gatekeeper's chalk: a dashed chalk square inside every tile to be lit
  function chalk(t){ var c = t % Q.W, r = (t / Q.W) | 0, ctx = R.ctx, p = quad(c, r, 0.2, 0.8, 0.6); chalkLine(0.55); ctx.setLineDash([Math.max(2, R.kk() * 1.6), Math.max(2, R.kk() * 1.1)]);
    ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); for (var j = 1; j < 4; j++) ctx.lineTo(p[j][0], p[j][1]); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]); }
  return {
    lay:function(s){ m = s.m; d = s.d; flip = {}; spin = {}; },
    move:function(mv, u){ if (mv[0] === 'tile') flip[mv[1]] = u; else if (mv[0] === 'pin') spin[mv[1]] = u;
      if (u >= 1 && mv[0] === 'pin' && !spin['b' + mv[1]]){ spin['b' + mv[1]] = 1; R.sfx('blip'); } },
    /* each tile is a thing in the scene's far to near list rather than paint on the ground, so a sprite drawn before
       it (a balloon, the vault) that has the scene drawn back over it never takes a tile's colour with it */
    things:function(ds){ Q.lights.forEach(function(t, k){ var q = R.at(t); ds.push({ x:q[0], y:q[1] - T * 0.45, kd:function(){ var ctx = R.ctx; ctx.save(); tile(t, k);
      if (Q.want != null && Q.want >> k & 1) chalk(t); var w = Q.swAt[t]; if (w){ if (w.pin) pin(w); else plus(t); } ctx.restore(); } }); }); },
    // no rings: the floor is all colour, and a switch's chalk plus or a pinwheel is the mark of a tile to tap
    hot:function(){ return []; },
    ground:function(){} }; }

root.RTT_GYMKIND_LIGHTS = { id:'lights', gyms:GYMS, input:'tap', calm:true, parse:parse, init:init, key:key, act:act, moves:moves, won:won, proof:proof, enc:enc,
  goal:goal, stuck:function(){ return false; }, tell:{ plain:'That tile has no switch on it.' },
  hello:'Tap a switch to flip it. Undo takes one back.', unit:'tap', me:function(){ return null; }, place:function(G, s){ return s; },
  dur:function(how){ return how === 'spin' ? D_SPIN : D_FLIP; }, floor:floor, mats:mats, view:view };
})();
