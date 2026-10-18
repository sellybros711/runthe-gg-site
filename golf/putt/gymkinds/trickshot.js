/* golf/putt/gymkinds/trickshot.js: the TRICK SHOT kind of trail gym (RTT_GYMKIND_TRICKSHOT), the Clubhouse's. A kind file:
   the registry (gyms.js, its KINDS README) finds it by its global, the frame (trail.js) plays it, check-putt proves it.

   THE PUZZLE: a putting puzzle with the real ball, in the club's trick shot room. Numbered bottles stand on the felt and
   go down ONLY IN ORDER: the next one topples when the ball reaches it and the ball runs on; one out of order rings and
   stays up, a post the ball bounces off. The cup is under a brass lid until the last bottle is down, then the lid slides
   off and the cup can be sunk, which opens the vault. Bank boards, a trophy plinth, a keg and (in the gatekeeper) a rack
   on a clock are the furniture. Every putt is the putting game's own physics (RTT_PUTT.simulate on the room's course,
   with the targets added to it in putt.js), so what the solver proves is what the player rolls.

   input:'own'. The frame keeps the room, the panel (name, goal line, civilian), Undo, Restart, Leave and the payout, and
   hands this kind the board's pointer, keys and clock (view.pointer, view.key, view.tick). Pull back from anywhere and
   let go: the further back, the harder. The arrows aim and set the pace on a keyboard, Space putts. A move is a shot,
   { a, ft, t } (the aim in radians, the pace in feet on flat felt, and on a room with a clock the moment it is struck),
   so act() plays one in node for the solver. The score is strokes: a room has a stroke limit, and out of strokes is
   stuck (the frame lights Restart). A room never costs a life. Undo takes the last putt back.

   THE ROOM: the felt is the 'f' tiles of the rows, laid in the frame's room; the course (in the putting game's feet) is
   mapped onto it. Nothing is written over the board: the bottles carry their numbers, the cup its lid, and every message
   goes to the frame's panel.

   The fewest strokes and one shortest route (moves, proof) are recorded from this file's solve() and the fairer search
   in golf/putt/trick.mjs (node golf/putt/trick.mjs --only <id> --write), never written by hand. check-putt section 5b
   solves each room again and replays the proof; 5c holds every putt of it to a birdie putt's room for error and to
   fair.mjs's person. The guide for the owner (the aha and the solution shot by shot) is kept outside the game. */
(function(){
var root = typeof window !== 'undefined' ? window : globalThis;
var RATE = 1.45;   // the room's clock runs at the putting game's PLAY_RATE, so a putt plays back at the speed a hole's does

/* THE ROOMS. f(T, K) lays the course the way a putting hole is laid (K: the putting game's own hole kit), in the
   game's feet; felt is that course's rectangle [x0, y0, x1, y1], laid over the 'f' tiles. bottles are the targets in
   order. limit is the stroke limit (the fewest plus two), banks (the first room) asks every bottle to be one bank. */
var GYMS = [
  /* THE TROPHY ROOM, mid-world (the trail into hole 9). It teaches the order and the bank: a screen board between the
     tee and bottle 1, a shelf board between 1 and 2, the trophy plinth between 2 and 3, so each bottle is one bank off
     a wall from where the last left the ball, then the cup. */
  { id:'clubhouse1', kind:'trickshot', world:'clubhouse', leg:9, name:'The Trophy Room', badge:'Trophy Badge', mech:['bottle'], pay:500, look:{ wall:'plank' },
    moves:4, proof:'[[3.7000980142279785,13,0],[3.787364476827695,19,4.683333333333341],[0.19198621771937624,23,9.481250000000008],[2.076941809873252,9,14.037500000000023]]',
    limit:6, banks:1, goal:'Knock the bottles down in order, then sink it.',
    who:{ look:{ skin:'light', polo:'white', hat:'navy', pants:'navy', hair:'brown', hairStyle:'short', cap:true, gender:'male' } },
    say:['The bottles only fall in order. Hit one early and it just rings at you.',
      'Can\'t see a straight line to the next one? Neither can I. The walls can.',
      'Picture the bottle on the far side of the wall, and aim at that.'],
    felt:[-5.5, -15, 5.5, 0], tee:[0, -2.2], cup:[2.8, -6], bottles:[[-3, -7.5], [-3, -12.5], [3, -12.5]],
    f:function(T, K){ var H = K.hole([K.rm(-5.5, 0, 5.5, -15)], [0, -2.2], [2.8, -6]);
      K.board(H, T, -0.75, -5.35, -2.35, -4.45, 0.36); K.board(H, T, -3.9, -10, -1.6, -10, 0.36); K.blk(H, T, -0.8, -11, 0.8, -13.2); K.bowl(H, 2.8, -6, 1.4, 0.06); return H; },
    rows:[
      '###########',
      '#fffffffff#', '#fffffffff#', '#fffffffff#', '#fffffffff#', '#fffffffff#', '#fffffffff#',
      '#fffffffff#', '#fffffffff#', '#fffffffff#', '#fffffffff#', '#fffffffff#', '#fffffffff#',
      '#L..@....C#',
      '####G######'
    ] },
  /* THE BACK BAR, the gatekeeper (the trail into hole 18). Five bottles, numbered so the obvious line always meets the
     wrong one: 5 stands between the tee and 1, and 3 between 1's spot and 2. Two rails flank a lane up the middle, a
     rack slides across the room above it on a clock, and bottle 4 waits by the keg in the far corner. The aha is the
     order and the angles: a rail takes the ball round 5 to 1, and 2 and 3 can go in one putt off the side wall. */
  { id:'clubhouse2', kind:'trickshot', world:'clubhouse', leg:18, keeper:true, name:'The Back Bar', badge:'Back Bar Badge', mech:['bottle', 'rack'], pay:1000, look:{ wall:'plank' },
    moves:5, proof:'[[4.363323129985823,21,1.2],[2.775073510670984,27,6.872916666666641],[5.1487212933832724,31,11.645833333333334],[5.532693728822025,29,19.25416666666664],[0.7504915783575616,5,24.102083333333308]]',
    limit:7, goal:'All the bottles, in order. Then sink it.',
    who:{ look:{ skin:'medium', polo:'navy', hat:'white', pants:'navy', hair:'black', hairStyle:'ponytail', cap:false, gender:'female' } },
    say:['I tend this bar. Every new member tries the straight line first. Every one of them hears that ring.',
      'The ball keeps rolling after a bottle goes. Where it rolls is half the shot.',
      'Some of those bottles line up nicer from the back of the room than from the tee.'],
    felt:[-5, -15, 5, 0], tee:[0, -1.5], cup:[0, -3.6], bottles:[[-1.55, -9.4], [-3.65, -13.0], [-2.6, -11.2], [1.5, -13.8], [-0.96, -6.4]],
    f:function(T, K){ var H = K.hole([K.rm(-5, 0, 5, -15)], [0, -1.5], [0, -3.6]);
      K.board(H, T, -2.2, -4.2, -2.2, -8.3, 0.36); K.board(H, T, 2.2, -4.2, 2.2, -8.3, 0.36);
      H.movers.push({ k:'slide', ax:-2.8, ay:-10.7, bx:2.8, by:-10.7, len:2.0, ang:0, w:0.5, period:3.4, phase:0, skin:T.slider });
      K.bumps(H, T, [[3.1, -12.4, 0.6]]); K.bowl(H, 0, -3.6, 1.1, 0.05); return H; },
    rows:[
      '##########',
      '#ffffffff#', '#ffffffff#', '#ffffffff#', '#ffffffff#', '#ffffffff#', '#ffffffff#',
      '#ffffffff#', '#ffffffff#', '#ffffffff#', '#ffffffff#', '#ffffffff#', '#ffffffff#',
      '#L.@....C#',
      '###G######'
    ] }
];

var PT = function(){ return root.RTT_PUTT; };
var LIB = function(){ return root.RTT_PUTT_GYMS.lib; };

/* THE ROOM, READ: the frame's five characters through lib.room, and the felt's tiles. Q.fc0, Q.fr0 is the felt's first
   column and row, Q.fw, Q.fh its size in tiles. */
var PARSED = {};
function parse(G){ if (PARSED[G.id]) return PARSED[G.id]; var fc0 = 1e9, fr0 = 1e9, fc1 = -1, fr1 = -1;
  var Q = LIB().room(G, function(ch, i, Q0){ if (ch !== 'f') return false; var c = i % G.rows[0].length, r = (i / G.rows[0].length) | 0;
    fc0 = Math.min(fc0, c); fr0 = Math.min(fr0, r); fc1 = Math.max(fc1, c); fr1 = Math.max(fr1, r); });
  Q.fc0 = fc0; Q.fr0 = fr0; Q.fw = fc1 - fc0 + 1; Q.fh = fr1 - fr0 + 1; return PARSED[G.id] = Q; }

/* THE COURSE: the room laid as a putting hole (the game's own builders, so its walls, boards and kegs are a hole's),
   with the bottles as its targets. Built once a room. */
var COURSE = {};
function course(G){ if (COURSE[G.id]) return COURSE[G.id]; var P = PT(); if (!P) throw new Error('trickshot: the putting game is not loaded');
  var K = { hole:P.lvHelpers.hole, rm:P.lvHelpers.rm, board:P.lvKit.board, blk:P.lvKit.blk, bumps:P.lvKit.bumps, bowl:P.lvKit.bowl };
  var C = P.buildFrom({ custom:function(T){ var T2 = {}; for (var k in T) T2[k] = T[k]; T2.block = 'plank'; T2.bumper = 'barrel'; return G.f(T2, K); }, tpl:'ts-' + G.id, seed:P.hstr('trick:' + G.id), theme:'clubhouse', name:G.name });
  C.targets = G.bottles.map(function(q, i){ return { x:q[0], y:q[1], r:P.TGT_R, n:i + 1 }; }); C.tk = 0; C.limit = G.limit;
  return COURSE[G.id] = C; }
function timed(C){ return C.movers.length + C.bridges.length + C.turns.length + (C.ferries || []).length > 0; }
// one putt: the aim, the pace in feet (or a speed), struck at t on the room's clock, with tk bottles already down
function roll(G, x, y, tk, m){ var P = PT(), C = course(G), v = m.v != null ? m.v : P.speedFor(C, m.ft); C.tk = tk;
  try { return P.simulate(C, x, y, Math.cos(m.a) * v, Math.sin(m.a) * v, m.t || 0); } finally { C.tk = 0; } }
// the walls a putt meets before its first bottle goes down: how many banks the shot is
function banksOf(r){ var k = 0; for (var i = 0; i < r.ev.length; i++){ var e = r.ev[i]; if (e[1] === 'topple' || e[1] === 'cup') break; if (e[1] === 'wall') k++; } return k; }

/* THE STATE: where the ball lies (the game's feet), how many bottles are down, the strokes, whether it dropped, and the
   room's clock when it came to rest (the solver strikes the next putt from there). A new object a putt. */
function init(G){ return { x:G.tee[0], y:G.tee[1], tk:0, n:0, h:false, t:0 }; }
function key(s){ return s.x.toFixed(3) + ',' + s.y.toFixed(3) + ',' + s.tk + ',' + s.n + (s.h ? ',h' : ''); }
function after(G, s, m){ var r = roll(G, s.x, s.y, s.tk, { a:m.a, ft:m.ft, v:m.v, t:m.t != null ? m.t : s.t }), x = r.rest[0], y = r.rest[1];
  if (r.water || r.out){ x = s.x; y = s.y; }
  return { r:r, s:{ x:x, y:y, tk:r.holed ? G.bottles.length : (r.tk | 0), n:s.n + 1, h:!!r.holed, t:(m.t != null ? m.t : s.t) + r.t + 2 } }; }
function act(G, s, m){ if (s.h || s.n >= G.limit || !m) return { s:s, ev:'bump', moves:[] }; var o = after(G, s, m); return { s:o.s, ev:'shot', moves:[] }; }
function won(G, s){ return !!s.h; }
function stuck(G, s){ return !s.h && s.n >= G.limit; }
// a coarse fan, for anything that asks for every move (the solver and the audit search finer, below)
function moves(G, s){ var out = []; if (s.h || s.n >= G.limit) return out; for (var d = 0; d < 360; d += 10) for (var ft = 6; ft <= 30; ft += 8) out.push({ a:d * Math.PI / 180, ft:ft, t:s.t }); return out; }

/* THE SEARCH. Layer by layer, a stroke at a time: from each place a fan of aims two degrees apart and paces three feet
   apart (and three moments, in a room with a clock), keeping the putts that knock the next bottle down or drop, and of
   those only the ones whose neighbours (a degree of aim, most of a foot of pace, a beat either side) do the same. A
   layer keeps the four places with the most bottles down, the steadiest first. The fewest strokes it finds is moves. */
function did(G, r, want){ return !r.water && !r.out && (want > G.bottles.length ? r.holed : (r.tk | 0) >= want && !r.holed); }
function robust(G, s, m, want, wide){ var D = (wide ? 1.8 : 0.9) * Math.PI / 180, F = wide ? 1.6 : 0.8, nb = [[D, 0, 0], [-D, 0, 0], [0, F, 0], [0, -F, 0]], ok = 0;
  if (timed(course(G))) nb.push([0, 0, wide ? 0.24 : 0.12], [0, 0, wide ? -0.24 : -0.12]);
  for (var i = 0; i < nb.length; i++){ var t = (m.t != null ? m.t : s.t) + nb[i][2]; if (did(G, roll(G, s.x, s.y, s.tk, { a:m.a + nb[i][0], ft:Math.max(1, m.ft + nb[i][1]), t:Math.max(0, t) }), want)) ok++; }
  return wide ? ok : ok >= nb.length - 1; }
function solve(G){ var C = course(G), n = G.bottles.length, T0 = timed(C) ? [0, 1.2, 2.4] : [0], front = [{ s:init(G), path:[] }], shots = 0;
  for (var depth = 1; depth <= G.limit; depth++){ var next = [], fin = null;
    for (var f = 0; f < front.length; f++){ var F = front[f], s = F.s, byWant = {};
      for (var k = 0; k < T0.length; k++) for (var d = 0; d < 360; d += 2) for (var ft = 3; ft <= 33; ft += 3){
        var m = { a:d * Math.PI / 180, ft:ft, t:s.t + T0[k] }, r = roll(G, s.x, s.y, s.tk, m); shots++;
        if (r.water || r.out) continue; var want = r.holed ? n + 1 : (r.tk | 0); if (!r.holed && want <= s.tk) continue;
        if (G.banks && !r.holed && banksOf(r) !== G.banks) continue;
        (byWant[want] = byWant[want] || []).push(m); }
      // of each outcome, an even sample is tested for room for error (testing every one costs minutes and finds the same)
      Object.keys(byWant).forEach(function(w){ var L = byWant[w], want = +w, step = Math.max(1, Math.floor(L.length / 30));
        for (var i = 0; i < L.length; i += step){ var m = L[i]; if (!robust(G, s, m, want)) continue; var path = F.path.concat([m]);
          if (want > n){ if (!fin) fin = path; continue; }
          next.push({ s:after(G, s, m).s, path:path, sc:robust(G, s, m, want, true) }); } }); }
    if (fin) return { ok:true, moves:depth, path:fin, states:shots };
    next.sort(function(p, q){ return (q.s.tk - p.s.tk) || (q.sc - p.sc); }); front = [];
    for (var i = 0; i < next.length && front.length < 4; i++){ var c = next[i]; if (front.some(function(o){ return o.s.tk === c.s.tk && Math.hypot(o.s.x - c.s.x, o.s.y - c.s.y) < 0.8; })) continue; front.push(c); }
    if (!front.length) break; }
  return { ok:false, why:'no route inside ' + G.limit + ' strokes', states:shots }; }
/* THE AUDIT. A room has one dead end, and it says so: out of strokes (stuck, and the frame lights Restart). So from the
   start, every place on the proof, and places a few stray putts from each of them, the audit asks that stuck() is true
   exactly where no stroke is left, and that wherever one is left, some putt still knocks the next bottle down (or
   drops): no place on the felt is shut off from the next bottle. */
function audit(G){ var n = G.bottles.length, pf = proof(G), st = [init(G)], s = init(G), rnd = 9001, missed = 0, alarms = 0, dead = 0, i, j;
  var rand = function(){ rnd = (rnd * 1103515245 + 12345) & 0x7fffffff; return rnd / 0x7fffffff; };
  pf.forEach(function(m){ s = act(G, s, m).s; st.push(s); });
  st.slice().forEach(function(s0){ for (j = 0; j < 2; j++){ var r = act(G, s0, { a:rand() * 2 * Math.PI, ft:4 + rand() * 26, t:s0.t }); if (r.ev === 'shot') st.push(r.s); } });
  var s1 = init(G); for (i = 0; i < G.limit; i++) s1 = act(G, s1, { a:Math.PI / 2, ft:2, t:s1.t }).s; st.push(s1);   // a player who taps it about until the strokes are gone
  st.forEach(function(q){ var left = !q.h && q.n < G.limit, any = false;
    // aims nearest the next bottle (or the cup) first, so a place with a straight line answers at once
    var nx = G.bottles[q.tk] || G.cup, a0 = Math.atan2(nx[1] - q.y, nx[0] - q.x);
    if (left) for (var d = 0; d <= 180 && !any; d += 1) for (var sg = -1; sg <= 1 && !any; sg += 2) for (var ft = 6; ft <= 30 && !any; ft += 8){ var r = roll(G, q.x, q.y, q.tk, { a:a0 + sg * d * Math.PI / 180, ft:ft, t:q.t }); if (r.holed || (r.tk | 0) > q.tk) any = true; }
    var says = stuck(G, q); if (!q.h && !left) dead++;
    if (left && !any) missed++; if (says !== (!q.h && !left)) alarms++; });
  return { ok:missed === 0 && alarms === 0, states:st.length, stuck:dead, dead:dead, missed:missed, alarms:alarms }; }
// the recorded proof is the route as JSON, every putt [aim, pace, moment] at full precision
function proof(G){ return JSON.parse(G.proof || '[]').map(function(q){ return { a:q[0], ft:q[1], t:q[2] }; }); }
function enc(path){ return JSON.stringify(path.map(function(m){ return [m.a, m.ft, m.t || 0]; })); }

/* WHERE THINGS ARE IN THE ROOM: the felt's tiles carry the course, a point of the game's feet to a point of the trail. */
function mapper(G, R){ var Q = parse(G), F = G.felt, T = R.T, sx = Q.fw * T / (F[2] - F[0]), sy = Q.fh * T / (F[3] - F[1]), X0 = R.x0 + Q.fc0 * T, Y0 = R.y0 + Q.fr0 * T;
  return { sx:sx, sy:sy, k:(sx + sy) / 2, to:function(x, y){ return [X0 + (x - F[0]) * sx, Y0 + (y - F[1]) * sy]; }, from:function(x, y){ return [F[0] + (x - X0) / sx, F[1] + (y - Y0) / sy]; },
    dirTo:function(a){ return Math.atan2(Math.sin(a) * sy, Math.cos(a) * sx); }, dirFrom:function(a){ return Math.atan2(Math.sin(a) / sy, Math.cos(a) / sx); } }; }
/* WHERE HE STANDS AT ADDRESS (the owner, 2026-10-17: never over a bottle or the cup). He stands beside the ball, a tile
   to three to one side of it in its own row (a row or two nearer the camera only when neither side has room), never in front of
   it, and on the side away from the nearest thing he is putting at: a bottle still standing, or the cup. His sprite
   stands up the screen about two tiles from his feet, so a tile is no good if a standing bottle or the cup is within
   COVER of it, across and up. At the tee he stands where he came in. cover(G, s, i) is that test, for check-putt. */
var COVER = { x:0.95, up:2.5, down:0.8 };
function cellOf(G, x, y){ var Q = parse(G), F = G.felt; return [Q.fc0 + (x - F[0]) * Q.fw / (F[2] - F[0]), Q.fr0 + (y - F[1]) * Q.fh / (F[3] - F[1])]; }
function marks(G, s){ var out = []; for (var i = s.tk | 0; i < G.bottles.length; i++) out.push(cellOf(G, G.bottles[i][0], G.bottles[i][1])); out.push(cellOf(G, G.cup[0], G.cup[1])); return out; }
function cover(G, s, i){ var Q = parse(G), c = i % Q.W + 0.5, r = ((i / Q.W) | 0) + 0.5;
  return marks(G, s).some(function(m){ return Math.abs(m[0] - c) < COVER.x && m[1] > r - COVER.up && m[1] < r + COVER.down; }); }
function me(G, s){ if (!s.n && !s.h) return parse(G).start;
  var Q = parse(G), b = cellOf(G, s.x, s.y), r0 = Math.max(0, Math.min(Q.H - 1, Math.floor(b[1]))), c0 = Math.floor(b[0]), M = marks(G, s), near = null, best = null;
  M.forEach(function(m){ var d = Math.hypot(m[0] - b[0], m[1] - b[1]); if (!near || d < near.d) near = { d:d, m:m }; });
  var away = near && near.m[0] > b[0] ? -1 : 1;   // the side away from the nearest mark
  [0, 1, 2].forEach(function(dr){ [1, 2, 3].forEach(function(dc){ [away, -away].forEach(function(sd){ var r = r0 + dr, c = c0 + sd * dc; if (r < 0 || r >= Q.H || c < 0 || c >= Q.W) return;
    var i = r * Q.W + c, ch = Q.cell[i]; if (ch !== 'f' && ch !== '.' && ch !== '@') return;
    var sc = (cover(G, s, i) ? 100 : 0) + dr * 10 + (dc - 1) * 3 + (sd === away ? 0 : 1); if (!best || sc < best.sc) best = { i:i, sc:sc }; }); }); });
  return best ? best.i : Q.start; }
function place(G, s){ return s; }
// the felt, baked into the trail's picture: the 'f' tiles are green baize
function floor(gc){ return gc.k === 'f' ? { h:0.45, mat:['tsfelt'] } : null; }
function mats(){ return { tsfelt:['#2f7a46', '#2a6f40', '#36844f', 0.12] }; }

/* THE DRAWING (view). The rails, the boards, the plinth, the keg, the rack, the bottles, the lid, the ball and the aim,
   in the frame's room. What stands goes into the frame's far to near list (things), the rails, the cup and the lid lie
   on the floor (ground), and the aim and the pace meter are drawn last (over). */
var CURRENT = null;   // the view of the room he is in, for the checks (RTT_GYMKIND_TRICKSHOT.test)
function view(R){ var G = R.G, P = PT(), C = course(G), M = mapper(G, R), n = G.bottles.length, Z = R.DECK, ctx = R.ctx;
  var st = init(G), ball = [st.x, st.y], tkSeen = 0, tdown = {}, tring = {}, lidAt = 0, rolling = null, aim = Math.atan2(G.bottles[0][1] - G.tee[1], G.bottles[0][0] - G.tee[0]), pow = 0, drag = null, keyAim = false, sunk = false;
  var clock0 = performance.now() / 1000, clockOff = 0;
  function clock(tsec){ return (tsec - clock0) * RATE + clockOff; }
  function S(x, y, z){ var q = M.to(x, y); return R.scr(q[0], q[1], z == null ? Z : z); }
  function ppf(){ var a = R.scr(0, 0, Z), b = R.scr(1, 0, Z); return Math.hypot(b[0] - a[0], b[1] - a[1]); }   // device pixels a trail foot
  function quad(pts, z0, h, top, side){ // a box standing on a footprint of four corners (the game's feet), its faces far to near, then its top
    var lo = pts.map(function(p){ return S(p[0], p[1], z0); }), hi = pts.map(function(p){ return S(p[0], p[1], z0 + h); }), faces = [];
    for (var i = 0; i < 4; i++){ var j = (i + 1) % 4; faces.push({ y:(pts[i][1] + pts[j][1]) / 2, p:[lo[i], lo[j], hi[j], hi[i]] }); }
    faces.sort(function(a, b){ return a.y - b.y; }); ctx.fillStyle = side; ctx.strokeStyle = 'rgba(20,10,4,.55)'; ctx.lineWidth = Math.max(1, R.kk() * 0.5);
    faces.forEach(function(f){ ctx.beginPath(); f.p.forEach(function(q, k){ k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.closePath(); ctx.fill(); ctx.stroke(); });
    ctx.fillStyle = top; ctx.beginPath(); hi.forEach(function(q, k){ k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  function blockPts(b){ if (b.rot){ var q = b.rot; return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(function(u){ var a = u[0] * q.hl, w = u[1] * q.hw; return [q.cx + q.c * a - q.s * w, q.cy + q.s * a + q.c * w]; }); }
    return [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]]; }
  function drawBlock(t){ var b = t.b, tall = b.rot ? 0.55 : 1.1; quad(blockPts(b), Z, tall, b.rot ? '#b07a44' : '#8a5a2e', b.rot ? '#6a3e1c' : '#4a2a12'); }
  function drawKeg(t){ var u = t.u, c = S(u.x, u.y, Z), rr = u.r * M.k * ppf(), hh = 1.5 * M.k, top = S(u.x, u.y, Z + hh), sq = 0.55;
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(c[0] + rr * 0.2, c[1] + rr * 0.1, rr * 1.1, rr * sq, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#7a4a26'; ctx.fillRect(c[0] - rr, top[1], rr * 2, c[1] - top[1]); ctx.beginPath(); ctx.ellipse(c[0], c[1], rr, rr * sq, 0, 0, Math.PI); ctx.fill();
    ctx.fillStyle = '#3a3036'; [0.22, 0.78].forEach(function(f){ var y = top[1] + (c[1] - top[1]) * f; ctx.fillRect(c[0] - rr, y - R.kk() * 0.6, rr * 2, R.kk() * 1.2); });
    ctx.fillStyle = '#a8703e'; ctx.beginPath(); ctx.ellipse(top[0], top[1], rr, rr * sq, 0, 0, 7); ctx.fill(); ctx.strokeStyle = '#3a3036'; ctx.lineWidth = Math.max(1, R.kk() * 0.6); ctx.stroke(); }
  function drawRack(t){ var segs = P.moverAt(t.m, t.c); segs.forEach(function(g){ var hw = t.m.w / 2, dx = g[2] - g[0], dy = g[3] - g[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L * hw, ny = dx / L * hw;
    quad([[g[0] + nx, g[1] + ny], [g[2] + nx, g[3] + ny], [g[2] - nx, g[3] - ny], [g[0] - nx, g[1] - ny]], Z, 0.7, '#c9a227', '#6a4a12'); }); }
  function drawBall(t){ if (sunk) return; var c = S(t.x, t.y, Z), r = Math.max(P.BALL_R * M.k * ppf() * 1.6, 3.6 * R.kk());
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(c[0] + r * 0.3, c[1] + r * 0.15, r * 1.05, r * 0.6, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(c[0], c[1] - r * 0.8, r, 0, 7); ctx.fill(); ctx.strokeStyle = 'rgba(30,40,30,.55)'; ctx.lineWidth = Math.max(1, R.kk() * 0.5); ctx.stroke(); }
  // a bottle: amber glass, a cream label, a gold foil neck. It falls the way the ball was going; one rung shakes and flashes red.
  // Its number rides on a round tag over it while it stands, upright to the screen and sized for a phone; down, a small dim one
  function drawBottle(t){ var i = t.i, q = G.bottles[i], now = performance.now() / 1000, Hb = 1.7, dn = tdown[i];
    var fall = dn ? Math.min(1, (now - dn.at) / 0.32) : (i < tkSeen ? 1 : 0), ang = dn ? dn.ang : -Math.PI / 2, th = fall * fall * Math.PI / 2 * 0.94;
    var rg = tring[i] != null ? now - tring[i] : 9, wob = rg < 0.7 ? Math.sin(rg * 38) * 0.1 * (1 - rg / 0.7) : 0;
    var base = S(q[0], q[1], Z), tq = M.to(q[0], q[1]), top = R.scr(tq[0] + Math.cos(ang) * Math.sin(th) * Hb + wob * Hb * 0.4, tq[1] + Math.sin(ang) * Math.sin(th) * Hb, Z + Math.cos(th) * Hb);
    var at = function(f){ return [base[0] + (top[0] - base[0]) * f, base[1] + (top[1] - base[1]) * f]; }, k = R.kk(), wB = Math.max(0.62 * M.k * ppf(), 5 * k), wN = wB * 0.4, nxt = i === tkSeen && !rolling && !sunk;
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(base[0] + wB * 0.25, base[1] + wB * 0.06, wB * 0.75, wB * 0.36, 0, 0, 7); ctx.fill();
    if (nxt){ var pu = 0.5 + 0.5 * Math.sin(now * 3.8); ctx.strokeStyle = 'rgba(241,208,74,' + (0.55 + 0.4 * pu) + ')'; ctx.lineWidth = Math.max(2, k * 1.4); ctx.beginPath(); ctx.ellipse(base[0], base[1], wB * (0.95 + 0.18 * pu), wB * (0.95 + 0.18 * pu) * 0.62, 0, 0, 7); ctx.stroke(); }
    if (rg < 0.7){ ctx.strokeStyle = 'rgba(255,80,60,' + (1 - rg / 0.7) + ')'; ctx.lineWidth = Math.max(2, k * 1.6); ctx.beginPath(); ctx.ellipse(base[0], base[1], wB * (1 + rg * 1.6), wB * (1 + rg * 1.6) * 0.62, 0, 0, 7); ctx.stroke(); }
    var a0 = at(0.06), a1 = at(0.58), n0 = at(0.66), n1 = at(0.96), seg = function(p, q2, w, col, cap){ ctx.lineCap = cap || 'round'; ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q2[0], q2[1]); ctx.stroke(); };
    seg(a0, a1, wB + 2 * k, '#2a1406'); seg(a1, n1, wN + 2 * k, '#2a1406'); seg(a0, a1, wB, '#a5561a'); seg(a1, n0, wN, '#a5561a'); seg(n0, n1, wN, '#e2b53e'); seg(at(0.2), at(0.42), wB * 0.96, '#f4ead2', 'butt');
    var up = fall < 1, Rr = (up ? 8.5 : 5.5) * k, tag = up ? [top[0], top[1] - Rr - 2 * k] : at(0.5);
    if (up){ ctx.strokeStyle = 'rgba(26,14,6,.7)'; ctx.lineWidth = Math.max(1, k * 0.6); ctx.beginPath(); ctx.moveTo(top[0], top[1]); ctx.lineTo(tag[0], tag[1] + Rr); ctx.stroke(); }
    ctx.globalAlpha = up ? 1 - fall * 0.8 : 1; ctx.fillStyle = up ? (nxt ? '#F1D04A' : '#ffffff') : 'rgba(20,12,6,.55)'; ctx.strokeStyle = '#1a0e06'; ctx.lineWidth = Math.max(1.5, k * 1.1);
    ctx.beginPath(); ctx.arc(tag[0], tag[1], Rr, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = up ? '#1a0e06' : 'rgba(255,255,255,.85)'; ctx.font = '900 ' + Math.round(Rr * 1.3) + 'px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), tag[0], tag[1] + Rr * 0.07); ctx.globalAlpha = 1; ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic'; }
  // the felt's cushions: dark wood rails round its edge, lying on the floor
  function rails(){ var F = G.felt, w = 0.28; [[F[0], F[1] - w, F[2], F[1]], [F[0], F[3], F[2], F[3] + w], [F[0] - w, F[1] - w, F[0], F[3] + w], [F[2], F[1] - w, F[2] + w, F[3] + w]].forEach(function(b){
      quad([[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]], Z, 0.3, '#7a4a26', '#3e2412'); }); }
  // the cup, its brass collar and, until the last bottle is down, its brass lid with a keyhole; open, it glows green
  function cup(tsec){ var c = S(C.cup[0], C.cup[1], Z), k = ppf() * M.k, r = Math.max(C.cupR * k, 4 * R.kk()), sq = 0.62, open = tkSeen >= n;
    ctx.fillStyle = '#c9a227'; ctx.beginPath(); ctx.ellipse(c[0], c[1], r * 1.5, r * 1.5 * sq, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#0d0f0c'; ctx.beginPath(); ctx.ellipse(c[0], c[1], r, r * sq, 0, 0, 7); ctx.fill();
    var u = open ? (lidAt ? Math.min(1, (tsec - lidAt) / 0.45) : 1) : 0, e = u * u * (3 - 2 * u), L = r * 1.75;
    if (open){ var pu = 0.5 + 0.5 * Math.sin(tsec * 3.3); ctx.strokeStyle = 'rgba(126,224,129,' + (0.55 + 0.4 * pu) * e + ')'; ctx.lineWidth = Math.max(2, R.kk() * 1.4);
      ctx.beginPath(); ctx.ellipse(c[0], c[1], L * (1.05 + 0.12 * pu), L * (1.05 + 0.12 * pu) * sq, 0, 0, 7); ctx.stroke(); }
    if (open && e >= 1) return;
    var lx = c[0] + e * L * 2.3, ly = c[1]; ctx.globalAlpha = 1 - e * 0.65;
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(lx + L * 0.12, ly + L * 0.2, L * 1.06, L * sq * 1.06, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#7a5a12'; ctx.beginPath(); ctx.ellipse(lx, ly + L * 0.1, L, L * sq, 0, 0, 7); ctx.fill();
    var g = ctx.createLinearGradient(lx - L, ly - L, lx + L, ly + L); g.addColorStop(0, '#fff0a8'); g.addColorStop(0.45, '#d9ad3a'); g.addColorStop(1, '#8a6414');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(lx, ly, L, L * sq, 0, 0, 7); ctx.fill(); ctx.strokeStyle = '#4a3408'; ctx.lineWidth = Math.max(1, R.kk() * 0.8); ctx.stroke();
    if (!open){ ctx.fillStyle = '#2a1c04'; ctx.beginPath(); ctx.arc(lx, ly - L * 0.16 * sq, L * 0.2, 0, 7); ctx.fill(); ctx.beginPath(); ctx.moveTo(lx - L * 0.1, ly - L * 0.1 * sq); ctx.lineTo(lx + L * 0.1, ly - L * 0.1 * sq); ctx.lineTo(lx + L * 0.16, ly + L * 0.42 * sq); ctx.lineTo(lx - L * 0.16, ly + L * 0.42 * sq); ctx.closePath(); ctx.fill(); }
    ctx.globalAlpha = 1; }
  // the aim: white dots along the line the ball starts on, a fixed length (direction and power are two separate things),
  // and the pace meter, a bar standing beside the ball
  function aimLine(){ var b = S(ball[0], ball[1], Z), k = R.kk(), ux = Math.cos(aim), uy = Math.sin(aim);
    for (var f = 0.6; f <= 4.2; f += 0.6){ var q = S(ball[0] + ux * f, ball[1] + uy * f, Z); ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.arc(q[0], q[1], 2 * k, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.beginPath(); ctx.arc(q[0], q[1], 1.3 * k, 0, 7); ctx.fill(); }
    if (pow <= 0) return; var h = 26 * k, w = 4 * k, x = b[0] + 12 * k, y = b[1] - h - 6 * k;
    ctx.fillStyle = 'rgba(10,8,6,.75)'; ctx.fillRect(x - 1 * k, y - 1 * k, w + 2 * k, h + 2 * k);
    var gr = ctx.createLinearGradient(0, y + h, 0, y); gr.addColorStop(0, '#7ee081'); gr.addColorStop(0.6, '#F1D04A'); gr.addColorStop(1, '#e5483a'); ctx.fillStyle = gr; ctx.fillRect(x, y + h * (1 - pow), w, h * pow); }
  function lying(i, tsec){ var dn = tdown[i]; return i < tkSeen && (!dn || tsec - dn.at >= 0.32); }
  function say(t, ms){ try{ R.say(t, ms || 2600); }catch(e){} }
  var MAXFT = 34, PULL = 7;   // the pace at a full pull, in feet; a full pull is PULL trail feet of drag
  function canShoot(){ return !rolling && !sunk && !(R.busy && R.busy()) && st.n < G.limit && !st.h; }
  /* A PUTT: played by the physics at once, then shown over the next seconds at the game's rate; once the picture
     reaches the end of it, the frame is handed the new state (R.commit) with his walk to the ball. */
  function shoot(a, ft, t){ if (!canShoot()) return false; var now = performance.now() / 1000; if (t != null) clockOff += t - clock(now);
    var m = { a:a, ft:ft, t:clock(now) }, o = after(G, st, m); rolling = { r:o.r, s:o.s, t0:now, ev:0, from:st, lid:false }; pow = 0; drag = null; keyAim = false; try{ R.sfx('tap'); }catch(e){} return true; }
  /* how a putt is played is the kind's hello, which the frame says as he walks in */
  function tick(tsec){
    var Rl = rolling; if (!Rl) return false; var el = (tsec - Rl.t0) * RATE, pts = Rl.r.pts, i = 0;
    while (i < pts.length - 1 && pts[i + 1][2] <= el) i++; var a = pts[i], b = pts[Math.min(pts.length - 1, i + 1)], u = b[2] > a[2] ? Math.max(0, Math.min(1, (el - a[2]) / (b[2] - a[2]))) : 1;
    var px = ball[0], py = ball[1]; ball = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
    while (Rl.ev < Rl.r.ev.length && Rl.r.ev[Rl.ev][0] <= el){ var e = Rl.r.ev[Rl.ev++];
      if (e[1] === 'topple'){ tdown[e[2]] = { at:tsec, ang:M.dirTo(Math.atan2(ball[1] - py, ball[0] - px)) }; tkSeen = e[2] + 1; try{ R.sfx(tkSeen >= n ? 'coin' : 'blip'); }catch(er){}
        if (tkSeen >= n){ lidAt = tsec; say('All down. The lid is off. Sink it.'); } else say('Bottle ' + tkSeen + ' down. ' + (n - tkSeen) + ' to go.'); }
      else if (e[1] === 'ring'){ tring[e[2]] = tsec; say('Out of order. Bottle ' + (e[2] + 1) + ' rang and stayed up.', 3200); }
      else if (e[1] === 'cup'){ var cq = M.to(C.cup[0], C.cup[1]); try{ R.burst(cq[0], cq[1], Z + 0.6, ['#7ee081', '#F1D04A', '#ffffff'], 30, 1.2, 1.2); }catch(er){} } }
    if (!Rl.lid && tkSeen < n && Math.hypot(ball[0] - C.cup[0], ball[1] - C.cup[1]) < C.cupR){ Rl.lid = true; say('The lid is on. Bottles first.'); }
    if (Rl.r.holed && el > Rl.r.t) sunk = true;
    if (el > Rl.r.t + (Rl.r.holed ? 0.3 : 0.15)){ rolling = null; var from = me(G, Rl.from), to = me(G, Rl.s), mv = from !== to && !Rl.s.h ? [['me', from, to, 'walk']] : [];
      R.commit(Rl.s, 'shot', mv);
      if (!Rl.s.h){ var left = G.limit - Rl.s.n; setTimeout(function(){ if (left <= 0) say('Out of strokes. Restart sets the bottles back up. No life lost.', 6000); else if (left <= 2 || (Rl.s.tk | 0) === (Rl.from.tk | 0)) say(left === 1 ? 'Last stroke.' : left + ' strokes left.', 2400); }, 90); }
      return false; }
    return true; }
  var api = {
    lay:function(s){ st = s; ball = [s.x, s.y]; tkSeen = s.tk; sunk = !!s.h; rolling = null; pow = 0; drag = null;
      for (var i = 0; i < n; i++){ if (i >= s.tk) delete tdown[i]; else if (!tdown[i]) tdown[i] = { at:-9, ang:-Math.PI / 2 }; } lidAt = s.tk >= n ? (lidAt || -9) : 0;
      var nx = G.bottles[s.tk] || C.cup; if (!keyAim) aim = Math.atan2(nx[1] - s.y, nx[0] - s.x); },
    move:function(){},
    things:function(ds, tsec){ var c = clock(tsec);
      C.blocks.forEach(function(b){ var p = M.to((b.x0 + b.x1) / 2, b.y1); ds.push({ x:p[0], y:p[1], b:b, kd:drawBlock }); });
      C.bumpers.forEach(function(u){ var p = M.to(u.x, u.y); ds.push({ x:p[0], y:p[1], u:u, kd:drawKeg }); });
      C.movers.forEach(function(m){ var p = M.to((m.ax + m.bx) / 2, m.ay); ds.push({ x:p[0], y:p[1], m:m, c:c, kd:drawRack }); });
      G.bottles.forEach(function(q, i){ if (lying(i, tsec)) return; var p = M.to(q[0], q[1]); ds.push({ x:p[0], y:p[1] + 0.01, i:i, kd:drawBottle }); });
      var bp = M.to(ball[0], ball[1]); ds.push({ x:bp[0], y:bp[1] + 0.02, kd:function(){ drawBall({ x:ball[0], y:ball[1] }); } }); },
    // a bottle that has finished falling lies on the felt, under the ball and everything that stands
    ground:function(tsec){ rails(); cup(tsec); for (var i = 0; i < n; i++) if (lying(i, tsec)) drawBottle({ i:i }); },
    over:function(){ if (!rolling && !sunk && (drag || keyAim) && canShoot()) aimLine(); },
    hot:function(){ return []; },
    pointer:function(type, e, pt){ if (type === 'down'){ if (!canShoot()) return; drag = { p:pt }; pow = 0; return; }
      if (!drag) return; var dx = drag.p[0] - pt[0], dy = drag.p[1] - pt[1], L = Math.hypot(dx, dy);
      if (L > 0.2){ aim = M.dirFrom(Math.atan2(dy, dx)); pow = Math.min(1, L / PULL); } else pow = 0;
      if (type === 'up'){ var p0 = pow; drag = null; if (p0 > 0.04) shoot(aim, Math.max(2, p0 * MAXFT)); else pow = 0; } },
    key:function(e){ var fine = e.shiftKey ? 0.25 : 1;
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight'){ if (!canShoot()) return true; keyAim = true; aim += (e.code === 'ArrowLeft' ? -1 : 1) * 0.035 * fine; return true; }
      if (e.code === 'ArrowUp' || e.code === 'ArrowDown'){ if (!canShoot()) return true; keyAim = true; pow = Math.max(0, Math.min(1, pow + (e.code === 'ArrowUp' ? 1 : -1) * 0.04 * fine)); return true; }
      if (e.code === 'Space' || e.code === 'Enter'){ if (pow > 0.04) shoot(aim, Math.max(2, pow * MAXFT)); return true; }
      return false; },
    tick:function(tsec){ return tick(tsec); },
    // for the checks: a putt at an exact aim, pace and moment, and what the room shows
    shoot:shoot, state:function(){ return { s:st, rolling:!!rolling, tkSeen:tkSeen, sunk:sunk, ball:ball.slice() }; }
  };
  CURRENT = api; return api; }

root.RTT_GYMKIND_TRICKSHOT = { id:'trickshot', gyms:GYMS, input:'own', calm:true, parse:parse, init:init, key:key, act:act, moves:moves, won:won, stuck:stuck, solve:solve, audit:audit,
  proof:proof, enc:enc, me:me, place:place, floor:floor, mats:mats, view:view, goal:function(G){ return G.goal; }, tell:{},
  hello:'Pull back from anywhere and let go. Undo takes a putt back.', unit:'stroke',
  course:course, roll:roll, banksOf:banksOf, timed:function(G){ return timed(course(G)); }, robust:robust, after:after, cover:cover, test:{ view:function(){ return CURRENT; } } };
})();
