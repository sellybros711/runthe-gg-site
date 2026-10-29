/* golf/putt/gymkinds/lasers.js: the LASERS kind of trail gym (RTT_GYMKIND_LASERS), Neon Arcade's. A kind file: the
   registry (gyms.js, its KINDS README) finds it by its global, the frame (trail.js) plays it, check-putt proves it.

   THE PUZZLE: a laser maze in the back room of an arcade. An emitter fires a beam across the floor. Mirrors turn it a
   right angle. Tap a mirror and it flips. Some mirrors (and splitters) ride a rail: tap a free spot on the rail and it
   slides there, through every spot between. A cabinet can ride a rail too, and stops the beam wherever it stands.
   Light the vault's sensor with the beam and the vault opens. The beam is live: it draws again after every tap, and
   it is where it is between taps too.

   THE RULES (act, beam):
     - the beam runs from the emitter one tile at a time. A mirror turns it a right angle, from either face. A splitter
       (the gatekeeper's) lets half of it through and turns the other half, so the beam forks. A wall, a cabinet, the
       lever, the chest or the emitter stops it.
     - an ALARM EYE the beam touches trips the alarm, at once, whatever else the beam is doing. Nothing more can be done
       until it is undone (Undo) or the room is put back (Restart, the lever). So the ORDER of the taps matters, not
       only where everything ends up: a tap that swings the beam across an eye on its way to somewhere better trips it.
     - the vault opens the moment every sensor is lit at once (the gatekeeper has two) with no eye touched.

   THE ROOM (rows): the frame's five (# G @ L C, gyms.js) and
     ^ > v <  the emitter, firing that way           O  a sensor             A  an alarm eye
     / | \ -  a mirror, standing that way (a tap turns it an eighth: / | \ - and round)
     f  g     a mirror bolted down, as / and as \   p  q  a splitter, as / and as \ (a tap flips it to the other)
     B        a cabinet (stops the beam)
     :        a rail                                 m  w  a mirror on a rail, as / and as \ (a tap on it flips it)
     b        a cabinet on a rail                    y  z  a splitter on a rail, as / and as \ (a tap on it flips it)
   A rail is a straight run of rail tiles (: m w b y z) with exactly one rider on it. A tap on a free rail tile slides the
   rider there; a tap on a riding mirror or splitter flips it.

   solve() and audit() are the registry's (lib): a breadth first search over every tap. A tripped state has no moves
   and stuck() says so, so the frame lights Restart (Undo takes it back too). */
(function(){
var root = typeof window !== 'undefined' ? window : globalThis;
var LIB = function(){ return root.RTT_PUTT_GYMS.lib; };
var EMIT = { '^':0, '>':1, 'v':2, '<':3 };
// a mirror turns the beam: '/' sends east to north, north to east, west to south, south to west; '\' the other way
var SLASH = [1, 0, 3, 2], BACK = [3, 2, 1, 0];
var STOP = { '#':1, B:1, L:1, C:1, G:1 };
var GYMS = [
  /* THE BACK ROOM, mid-world (the trail into hole 9): the emitter fires along a row into a bolted mirror that turns
     the beam up the room into a cabinet. The sensor is on the same row, just past that bolted mirror. Four turning
     mirrors (three at the corners of a square, one in its path), a riding mirror for the fourth corner, and six eyes.
     The lesson: a mirror has two faces, so the beam can be sent round the square and back into the bolted mirror from
     below, which turns it onto the sensor; a mirror in the way is turned edge on to let the beam by; and the riding
     mirror is slid into the beam edge on, where it changes nothing, and only then turned. */
  { id:'neon1', kind:'lasers', world:'neon', leg:9, name:'The Back Room', badge:'Beam Badge', mech:['mirror'], pay:500, look:{ wall:'stone' },
    moves:12, proof:'29,29,29,56,56,56,83,83,83,32,31,31',
    who:{ look:{ skin:'dark', polo:'navy', hat:'black', pants:'black', hair:'black', hairStyle:'short', cap:true, hatStyle:'cap', gender:'male' } },
    say:['Watch the red eyes. Touch one with the beam and the whole place goes off. I learned that the loud way.',
      'That sensor looks blocked, right? Mirrors work from both sides.',
      'The beam moves the second you tap. Think about where it goes on the way, not just where it ends up.'],
    rows:[
      '#########',
      '#.....C.#',
      '#.A.B...#',
      '#.|.:m:A#',
      '#.......#',
      '#A......#',
      '#.\\.....#',
      '#.......#',
      '#>..f..O#',
      '#.-./..A#',
      '#.A.A...#',
      '#.......#',
      '#L.....@#',
      '#######G#'] },
  /* THE HIGH SCORE ROOM, guarding the trail into the world's last hole: the beam runs straight up the room, and a
     splitter rides a rail along it. Wherever the splitter stands, half the beam goes on up and half is turned off to
     one side of its row, east or west by which way it faces. Eyes line the walls. At the top a turning mirror and a
     riding mirror take the through half to the first sensor; the second is at the east end of the top rail row. Two
     turning mirrors guard the rows where the splitter has to stop. The lesson: a splitter can only be flipped where
     both sides of its row are safe, and only slid past an eye facing away from it, so the way up is stop, flip,
     slide, in the right places, once the guards are turned to make those places safe. */
  { id:'neon2', kind:'lasers', world:'neon', leg:18, name:'The High Score Room', badge:'High Score Badge', mech:['mirror', 'splitter'], pay:1000, keeper:true, look:{ wall:'plank' },
    moves:14, proof:'51,74,74,23,22,23,24,94,76,76,49,49,31,31',
    who:{ look:{ skin:'light', polo:'purple', hat:'white', pants:'navy', hair:'blonde', hairStyle:'ponytail', cap:false, gender:'female' } },
    say:['That splitter sends the beam two ways at once. The eyes don\'t care which half touches them.',
      'You can\'t turn it just anywhere. Check both sides of a spot before you turn it there.',
      'I hold the high score in here. My secret? I stop halfway and look before I go on.'],
    rows:[
      '#########',
      '#.C.A.OA#',
      '#A..-w::#',
      '#...:..O#',
      '#...:.AA#',
      '#...:./.#',
      '#A..:...#',
      '#A..:...#',
      '#A-.:...#',
      '#...:..A#',
      '#...y...#',
      '#...^.A.#',
      '#.A..A..#',
      '#L.....@#',
      '#######G#'] }
];

// ---- a room, read once
var PARSED = {};
function parse(G){ if (PARSED[G.id]) return PARSED[G.id];
  var Q = LIB().room(G, function(ch){ return EMIT[ch] != null || '/\\|-pqfgOABmwbyz:'.indexOf(ch) >= 0 ? true : false; });
  Q.emit = -1; Q.edir = 0; Q.flips = []; Q.flipAt = {}; Q.sensors = []; Q.alarms = []; Q.rails = []; Q.railAt = {}; Q.split = {};
  var m0 = [], O0 = { '/':0, '|':1, '\\':2, '-':3, p:0, q:2 };
  Q.cell.forEach(function(ch, i){
    if (EMIT[ch] != null){ if (Q.emit >= 0) throw new Error(G.id + ': one emitter'); Q.emit = i; Q.edir = EMIT[ch]; }
    else if (O0[ch] != null){ m0.push(O0[ch]); Q.flipAt[i] = Q.flips.length; Q.flips.push(i); if (ch === 'p' || ch === 'q') Q.split[i] = 1; }
    else if (ch === 'O') Q.sensors.push(i); else if (ch === 'A') Q.alarms.push(i); });
  if (Q.emit < 0 || !Q.sensors.length) throw new Error(G.id + ': an emitter and a sensor at least');
  // the rails: straight runs of rail tiles, one rider each (a riding mirror flips too, so it has a flip bit)
  var nb = LIB().nb, RT = { ':':1, m:1, w:1, b:1, y:1, z:1 }, done = {};
  Q.cell.forEach(function(ch, i){ if (!RT[ch] || done[i]) return;
    var horiz = RT[Q.cell[nb(Q, i, 1)]] || RT[Q.cell[nb(Q, i, 3)]], d = horiz ? 1 : 2, back = horiz ? 3 : 0, a = i;
    while (nb(Q, a, back) >= 0 && RT[Q.cell[nb(Q, a, back)]]) a = nb(Q, a, back);
    var run = [], rider = -1, rk = null; for (var t = a; t >= 0 && RT[Q.cell[t]]; t = nb(Q, t, d)){ run.push(t); done[t] = 1; if (Q.cell[t] !== ':'){ if (rider >= 0) throw new Error(G.id + ': one rider a rail'); rider = t; rk = Q.cell[t]; } }
    if (rider < 0) throw new Error(G.id + ': a rail with no rider'); if (run.length < 2) throw new Error(G.id + ': a rail of one tile');
    var R = { run:run, p0:run.indexOf(rider), k:rk === 'b' ? 'b' : 'm', split:rk === 'y' || rk === 'z', horiz:!!horiz, bit:-1 };
    if (R.k === 'm'){ R.bit = Q.flips.length; Q.flips.push(-1 - Q.rails.length); m0.push(rk === 'w' || rk === 'z' ? 2 : 0); }
    run.forEach(function(t){ Q.railAt[t] = Q.rails.length; }); Q.rails.push(R); });
  Q.m0 = m0.join('');
  var b0 = beam(Q, { m:Q.m0, p:Q.rails.map(function(R){ return String.fromCharCode(97 + R.p0); }).join(''), t:0 });
  if (b0.eye) throw new Error(G.id + ': the beam starts on an eye'); if (b0.lit === (1 << Q.sensors.length) - 1) throw new Error(G.id + ': it starts solved');
  Q.tiles = Q.flips.filter(function(i){ return i >= 0; }); Q.rails.forEach(function(R){ Q.tiles = Q.tiles.concat(R.run); });
  return PARSED[G.id] = Q; }

/* THE STATE: m how every mirror and splitter stands (a digit each, the fixed ones and then the riding ones: 0 /, 1 |,
   2 \, 3 -, so a tap is one more, an eighth of a turn), p where every rider is along its rail (a letter each, 'a' the
   first tile), t the alarm tripped (0, or 1 + the eye's tile). */
function init(G){ var Q = parse(G); return { m:Q.m0, p:Q.rails.map(function(R){ return String.fromCharCode(97 + R.p0); }).join(''), t:0 }; }
function key(s){ return s.m + '|' + s.p + '|' + s.t; }
/* what stands on tile i in state s: '' (the beam passes), a mirror '/', '|', '\' or '-', a splitter 'p' (/), 'q' (\)
   or 'k' (turned square, so the beam goes straight through it), 'B' (it stops), or the cell */
var MIR = ['/', '|', '\\', '-'], SPL = ['p', 'k', 'q', 'k'];
function orient(s, k){ return +s.m.charAt(k); }
function what(Q, s, i){ var ch = Q.cell[i], fk = Q.flipAt[i], rk = Q.railAt[i];
  if (fk != null){ var o = orient(s, fk); return Q.split[i] ? SPL[o] : MIR[o]; }
  if (rk != null){ var R = Q.rails[rk]; if (R.run[s.p.charCodeAt(rk) - 97] !== i) return ''; if (R.k === 'b') return 'B'; var o2 = orient(s, R.bit); return R.split ? SPL[o2] : MIR[o2]; }
  if (ch === '.' || ch === '@') return ''; if (ch === 'f') return '/'; if (ch === 'g') return '\\'; return ch; }
/* THE BEAM: every tile it crosses, as segments [from tile, to tile, how it ends] for the drawing, every sensor it lights
   (a mask) and the first eye it touches. A fork (a splitter) runs both ways; a tile and a heading crossed once is not
   crossed again, so a beam that comes back on itself ends. */
function beam(Q, s){ var nb = LIB().nb, segs = [], lit = 0, eye = 0, seen = {}, q = [[Q.emit, Q.edir, 0]];
  for (var h = 0; h < q.length && h < 400; h++){ var t = q[h][0], d = q[h][1], dp = q[h][2], a = t, n = 0;
    for (;;){ var nx = nb(Q, a, d); n++;
      if (nx < 0){ segs.push([t, a, 'wall', d, dp]); break; }
      var w = what(Q, s, nx), sk = nx + ',' + d;
      if (seen[sk]){ segs.push([t, nx, 'loop', d, dp]); break; } seen[sk] = 1;
      if (w === 'O'){ lit |= 1 << Q.sensors.indexOf(nx); segs.push([t, nx, 'sensor', d, dp]); break; }
      if (w === 'A'){ if (!eye) eye = 1 + nx; segs.push([t, nx, 'eye', d, dp]); break; }
      if (STOP[w] || EMIT[w] != null){ segs.push([t, nx, 'stop', d, dp]); break; }
      // a mirror turned square: edge on to the beam it lets it by, face on it stops it
      if (w === '|' || w === '-'){ if ((w === '|') === (d % 2 === 1)){ segs.push([t, nx, 'stop', d, dp]); break; } a = nx; continue; }
      if (w === 'k'){ a = nx; continue; }
      if (w === '/' || w === '\\'){ segs.push([t, nx, 'turn', d, dp]); q.push([nx, w === '/' ? SLASH[d] : BACK[d], dp + n]); break; }
      if (w === 'p' || w === 'q'){ segs.push([t, nx, 'split', d, dp]); q.push([nx, w === 'p' ? SLASH[d] : BACK[d], dp + n]); q.push([nx, d, dp + n]); break; }
      a = nx; } }
  return { segs:segs, lit:lit, eye:eye }; }

/* ONE TAP. A mirror turns an eighth (/ to | to \ to - and round again) and a splitter flips (/ to \ and back); a free
   rail tile brings its rider there; a riding one turns or flips the same way; the lever puts the room back. Then the beam runs again: an eye trips the
   alarm. So a mirror cannot go from / to \ without standing square in between, where it blocks or lets by. */
// a mirror turns on by an eighth; a splitter flips, / to \ and back, so it never stands square
function turnAt(m, k, split){ return m.slice(0, k) + ((+m.charAt(k) + (split ? 2 : 1)) % 4) + m.slice(k + 1); }
function act(G, s, i){ var Q = parse(G);
  if (i === Q.lever) return { s:init(G), ev:'reset', moves:[] };
  if (s.t) return { s:s, ev:'bump', moves:[] };
  var fk = Q.flipAt[i], rk = Q.railAt[i], m = s.m, p = s.p, mv = [], ev;
  if (fk != null){ m = turnAt(m, fk, Q.split[i]); mv.push(['mirror', i, i, 'flip']); ev = 'turn'; }
  else if (rk != null){ var R = Q.rails[rk], at = R.run[s.p.charCodeAt(rk) - 97];
    if (at === i){ if (R.k === 'b') return { s:s, ev:'bump', moves:[] }; m = turnAt(m, R.bit, R.split); mv.push(['mirror', i, i, 'flip']); ev = 'turn'; }
    else { p = s.p.slice(0, rk) + String.fromCharCode(97 + R.run.indexOf(i)) + s.p.slice(rk + 1); mv.push(['rider', at, i, 'slide']); ev = 'slide'; } }
  else return { s:s, ev:'bump', moves:[] };
  var n1 = { m:m, p:p, t:0 }, bm = beam(Q, n1);
  // a rider slides through every tile between: the beam at each of them counts, so sliding across an eye's line trips it
  if (ev === 'slide'){ var R2 = Q.rails[rk], a0 = s.p.charCodeAt(rk) - 97, a1 = p.charCodeAt(rk) - 97, st = a1 > a0 ? 1 : -1;
    for (var k = a0 + st; k !== a1 && !bm.eye; k += st){ var mid = beam(Q, { m:m, p:s.p.slice(0, rk) + String.fromCharCode(97 + k) + s.p.slice(rk + 1), t:0 }); if (mid.eye) bm = { eye:mid.eye, lit:0 }; } }
  if (bm.eye){ n1.t = bm.eye; ev = 'alarm'; }
  else if (bm.lit === (1 << Q.sensors.length) - 1) ev = 'lit';
  mv.push(['beam', Q.emit, Q.emit, 'beam', n1]);
  return { s:n1, ev:ev, moves:mv }; }
function moves(G, s){ if (s.t) return []; var Q = parse(G);
  return Q.tiles.filter(function(i){ var rk = Q.railAt[i]; if (rk == null) return true; var R = Q.rails[rk]; return R.run[s.p.charCodeAt(rk) - 97] !== i || R.k === 'm'; }); }
/* A TAP ON THE SCREEN: the frame finds the floor tile under the finger, and a mirror stands up off its tile, so a tap
   on its top lands on the tile behind it. A tap on a tile with nothing to work, just behind a mirror, a splitter or a
   riding mirror, works that piece. Every other tap is act's. */
function tap(G, s, i){ var Q = parse(G), n = i + Q.W;
  if (Q.flipAt[i] == null && Q.railAt[i] == null && i !== Q.lever && n < Q.cell.length){ var w = what(Q, s, n); if (w && '/|\\-pqk'.indexOf(w) >= 0) i = n; }
  return act(G, s, i); }
function won(G, s){ var Q = parse(G); return !s.t && beam(Q, s).lit === (1 << Q.sensors.length) - 1; }
function stuck(G, s){ return !!s.t; }
function proof(G){ return (G.proof || '').split(',').filter(Boolean).map(Number); }
function enc(path){ return path.join(','); }
function goal(G){ return parse(G).sensors.length > 1 ? 'Light both sensors at once.' : 'Bounce the beam into the sensor.'; }

/* ---- THE FLOOR: the arcade's carpet, deep blue in a check, a dark seam round every tile and a neon stud where four
   tiles meet, so the grid reads. Baked into the trail's picture (floor() for every tile of the room but the walls, mats() paints it). */
var DECK = 0.45;
function floor(gc){ if (gc.k === '#') return null; return { h:DECK, mat:['lfloor', { gu:gc.u, gv:gc.v, gc:gc.c, gr:gc.r }] }; }
function mats(){
  return { lfloor:['', '', '', 0, function(c, R){ var u = c.gu || 0, v = c.gv || 0, eu = u < 0.05 || u > 0.95, ev = v < 0.05 || v > 0.95;
    if (c.dt < 0) return R('#0c0a1e');
    // a neon stud where four tiles meet, a dark seam along the rest of each edge
    if (eu && ev) return R(((c.gc || 0) + (c.gr || 0)) % 2 ? '#2bf0ff' : '#ff2bd6'); if (eu || ev) return R('#2a2466');
    return R(((c.gc || 0) + (c.gr || 0)) % 2 ? '#1b1640' : '#181338'); }] }; }

/* ---- THE DRAWING (browser only, the frame's room R), on the frame's canvas in the room's projection (R.scr):
     the emitter is a black box with a hot lens; a mirror a silver panel standing on the tile's diagonal on a round
     base (a splitter a gold framed glass one); a rail a steel track in the floor; a cabinet an arcade cabinet with
     its screen lit (one on a rail stands on wheels); a sensor a green dish on a post, bright when lit; an eye a red
     dome that glares. The beam is drawn over it all, a hot pink line with a white core; after every tap it races
     out again from the emitter along its new way, and a flipped mirror swings round as it goes. */
var BZ = 0.95, BEAM = ['rgba(255,43,94,0.22)', '#ff2b5e', '#fff0f4'];
function view(R){ var Q = R.Q, T = R.T, ctx = R.ctx, cur = null, bm = null, nbm = null, u0 = 1, maxL = 1, flipU = {}, slide = null, tripAt = -9, ns = null;
  function px(ft){ var a = R.scr(0, 0, DECK), b = R.scr(ft, 0, DECK); return Math.abs(b[0] - a[0]); }
  function poly(pp, col){ ctx.fillStyle = col; ctx.beginPath(); pp.forEach(function(p, j){ if (j) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.closePath(); ctx.fill(); }
  function line(a, b, w, col, dash, off){ ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, w); ctx.setLineDash(dash || []); ctx.lineDashOffset = off || 0; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.setLineDash([]); }
  // a box standing on the floor: its top and its near face (the camera looks down and from the near side)
  function box(cx, cy, hw, hd, z0, z1, top, front, side){ var P = function(x, y, z){ return R.scr(cx + x, cy + y, z); };
    poly([P(-hw, hd, z0), P(hw, hd, z0), P(hw, hd, z1), P(-hw, hd, z1)], front);
    if (side){ poly([P(hw, -hd, z0), P(hw, hd, z0), P(hw, hd, z1), P(hw, -hd, z1)], side); poly([P(-hw, -hd, z0), P(-hw, hd, z0), P(-hw, hd, z1), P(-hw, -hd, z1)], side); }
    poly([P(-hw, -hd, z1), P(hw, -hd, z1), P(hw, hd, z1), P(-hw, hd, z1)], top); }
  // a mirror or a splitter: a panel on the tile's diagonal ('/' runs from the near left corner to the far right), turned by a
  function panel(cx, cy, a, split, bolt){ var r = T * 0.4, ca = Math.cos(a) * r, sa = Math.sin(a) * r, z0 = DECK + 0.18, z1 = DECK + 1.5, kk = R.kk();
    var b = R.scr(cx, cy, DECK + 0.02), br = px(T * 0.3); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(b[0], b[1], br * 1.1, br * 0.55, 0, 0, 7); ctx.fill();
    ctx.fillStyle = bolt ? '#5a6070' : '#3a3460'; ctx.beginPath(); ctx.ellipse(b[0], b[1] - kk, br, br * 0.5, 0, 0, 7); ctx.fill();
    if (bolt) [-1, 1].forEach(function(sx){ ctx.fillStyle = '#c8ccd8'; ctx.fillRect(Math.round(b[0] + sx * br * 0.6 - kk), Math.round(b[1] - kk * 2), Math.max(2, Math.round(kk * 2)), Math.max(2, Math.round(kk * 2))); });
    var p0 = R.scr(cx - ca, cy + sa, z0), p1 = R.scr(cx + ca, cy - sa, z0), p2 = R.scr(cx + ca, cy - sa, z1), p3 = R.scr(cx - ca, cy + sa, z1);
    poly([p0, p1, p2, p3], split ? 'rgba(255,214,90,0.9)' : '#7a86a8');
    var i0 = R.scr(cx - ca * 0.86, cy + sa * 0.86, z0 + 0.1), i1 = R.scr(cx + ca * 0.86, cy - sa * 0.86, z0 + 0.1), i2 = R.scr(cx + ca * 0.86, cy - sa * 0.86, z1 - 0.1), i3 = R.scr(cx - ca * 0.86, cy + sa * 0.86, z1 - 0.1);
    poly([i0, i1, i2, i3], split ? 'rgba(160,240,255,0.75)' : '#cfe6ff');
    line([(i3[0] + i2[0]) / 2, (i3[1] + i2[1]) / 2], [(i0[0] * 0.7 + i1[0] * 0.3), (i0[1] * 0.7 + i1[1] * 0.3)], Math.max(1, kk), 'rgba(255,255,255,0.8)');
    if (split){ line(i3, i1, Math.max(1, kk * 0.8), 'rgba(255,255,255,0.6)', [kk * 2, kk * 2]); }
    // its frame, thick enough to read when it stands edge on to the camera
    var fw = Math.max(2, px(T * 0.1)); ctx.lineCap = 'round'; [[p0, p3], [p1, p2], [p3, p2]].forEach(function(e){ line(e[0], e[1], fw, split ? '#c98a12' : bolt ? '#8a90a8' : '#ff2bd6'); }); ctx.lineCap = 'butt';
    ctx.strokeStyle = split ? '#c98a12' : bolt ? '#8a90a8' : '#ff2bd6'; ctx.lineWidth = Math.max(1, kk); ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(p3[0], p3[1]); ctx.closePath(); ctx.stroke(); }
  // the angle a piece stands at: / at an eighth turn, then | , \ and - ; a tap swings it on by an eighth
  function angOf(o, i){ var a = Math.PI / 4 * (1 + o), u = flipU[i]; return u == null ? a : a - (1 - u) * Math.PI / 4; }
  function cabinet(cx, cy, k, tsec, rides){ var hw = T * 0.4, hd = T * 0.32, z0 = DECK, z1 = DECK + 2.3, kk = R.kk(), scrc = ['#2bf0ff', '#ff2bd6', '#ffe02b', '#7cff6a'][k % 4];
    if (rides){ [-1, 1].forEach(function(sx){ var w0 = R.scr(cx + sx * hw * 0.7, cy + hd, DECK + 0.08); ctx.fillStyle = '#0a0a12'; ctx.fillRect(Math.round(w0[0] - kk * 1.5), Math.round(w0[1] - kk * 1.5), Math.max(2, Math.round(kk * 3)), Math.max(2, Math.round(kk * 3))); }); }
    box(cx, cy, hw, hd, z0 + (rides ? 0.12 : 0), z1, '#3a1050', '#2a0c3c', '#1c0828');
    var a = R.scr(cx - hw * 0.72, cy + hd, z1 - 0.35), b = R.scr(cx + hw * 0.72, cy + hd, z1 - 1.05);
    ctx.fillStyle = '#05040a'; ctx.fillRect(Math.round(a[0]), Math.round(a[1]), Math.round(b[0] - a[0]), Math.round(b[1] - a[1]));
    var fl = R.reduce ? 0.8 : 0.65 + 0.35 * Math.abs(Math.sin((tsec || 0) * 2 + k)); ctx.globalAlpha = fl; ctx.fillStyle = scrc;
    ctx.fillRect(Math.round(a[0] + kk * 2), Math.round(a[1] + kk * 2), Math.max(1, Math.round(b[0] - a[0] - kk * 4)), Math.max(1, Math.round(b[1] - a[1] - kk * 4))); ctx.globalAlpha = 1;
    var m = R.scr(cx - hw * 0.9, cy + hd, z1 - 0.15), n = R.scr(cx + hw * 0.9, cy + hd, z1 - 0.15); line(m, n, Math.max(1, kk * 1.2), '#ff2bd6');
    var j0 = R.scr(cx, cy + hd, DECK + 1.05); ctx.fillStyle = '#ffe02b'; ctx.fillRect(Math.round(j0[0] - kk), Math.round(j0[1] - kk * 3), Math.max(1, Math.round(kk * 2)), Math.max(1, Math.round(kk * 3))); }
  function emitter(cx, cy, d, tsec){ box(cx, cy, T * 0.36, T * 0.36, DECK, DECK + 1.25, '#2c2a3a', '#1a1824', '#121018');
    var V = [[0, -1], [1, 0], [0, 1], [-1, 0]][d], l = R.scr(cx + V[0] * T * 0.36, cy + V[1] * T * 0.36, DECK + BZ), r = px(T * 0.13), pulse = R.reduce ? 1 : 0.8 + 0.2 * Math.sin((tsec || 0) * 6);
    ctx.fillStyle = 'rgba(255,43,94,' + (0.35 * pulse) + ')'; ctx.beginPath(); ctx.arc(l[0], l[1], r * 1.8, 0, 7); ctx.fill();
    ctx.fillStyle = '#ff2b5e'; ctx.beginPath(); ctx.arc(l[0], l[1], r, 0, 7); ctx.fill(); ctx.fillStyle = '#fff0f4'; ctx.beginPath(); ctx.arc(l[0], l[1], r * 0.45, 0, 7); ctx.fill();
    var t0 = R.scr(cx - T * 0.2, cy + T * 0.36, DECK + 1.0); ctx.fillStyle = '#ffe02b'; ctx.fillRect(Math.round(t0[0]), Math.round(t0[1]), Math.max(2, Math.round(px(T * 0.4))), Math.max(1, Math.round(R.kk()))); }
  function sensor(cx, cy, lit, tsec){ var z = DECK + 1.1, kk = R.kk(), b = R.scr(cx, cy, DECK), t = R.scr(cx, cy, z), r = px(T * 0.3);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(b[0], b[1], r, r * 0.5, 0, 0, 7); ctx.fill();
    line(b, t, Math.max(2, kk * 2), '#4a4e60');
    if (lit){ var g = R.reduce ? 0.8 : 0.6 + 0.4 * Math.abs(Math.sin((tsec || 0) * 5)); ctx.fillStyle = 'rgba(124,255,106,' + (0.35 * g) + ')'; ctx.beginPath(); ctx.ellipse(t[0], t[1], r * 1.9, r * 1.3, 0, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#1e5a2a'; ctx.beginPath(); ctx.ellipse(t[0], t[1], r, r * 0.62, 0, 0, 7); ctx.fill();
    ctx.fillStyle = lit ? '#7cff6a' : '#2f8a40'; ctx.beginPath(); ctx.ellipse(t[0], t[1] - kk * 0.5, r * 0.72, r * 0.42, 0, 0, 7); ctx.fill();
    ctx.fillStyle = lit ? '#f4fff0' : '#5ac46a'; ctx.beginPath(); ctx.ellipse(t[0], t[1] - kk * 0.5, r * 0.28, r * 0.17, 0, 0, 7); ctx.fill(); }
  function eye(cx, cy, hot, tsec){ var kk = R.kk(), b = R.scr(cx, cy, DECK), t = R.scr(cx, cy, DECK + 0.75), r = px(T * 0.26);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(b[0], b[1], r * 1.1, r * 0.55, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#2a2230'; ctx.fillRect(Math.round(t[0] - r * 0.5), Math.round(t[1]), Math.round(r), Math.round(b[1] - t[1]));
    var fl = hot && !R.reduce ? (Math.sin((tsec || 0) * 18) > 0 ? 1 : 0.4) : 1;
    if (hot){ ctx.fillStyle = 'rgba(255,30,40,' + (0.45 * fl) + ')'; ctx.beginPath(); ctx.arc(t[0], t[1], r * 2.4, 0, 7); ctx.fill(); }
    ctx.fillStyle = hot ? '#ff3838' : '#a8141e'; ctx.beginPath(); ctx.arc(t[0], t[1], r, Math.PI, 0); ctx.lineTo(t[0] + r, t[1] + r * 0.3); ctx.lineTo(t[0] - r, t[1] + r * 0.3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = hot ? '#fff4c0' : '#ffd0d0'; ctx.beginPath(); ctx.arc(t[0], t[1] - r * 0.3, r * 0.42, 0, 7); ctx.fill();
    ctx.fillStyle = '#1a0006'; ctx.beginPath(); ctx.arc(t[0] + r * 0.08, t[1] - r * 0.3, r * 0.2, 0, 7); ctx.fill(); }
  // the rails, in the floor: a steel track along every rail tile, with a slot down its middle
  function rails(){ var kk = R.kk();
    Q.rails.forEach(function(Rl){ var a = R.at(Rl.run[0]), b = R.at(Rl.run[Rl.run.length - 1]), ex = Rl.horiz ? T * 0.45 : 0, ey = Rl.horiz ? 0 : T * 0.45;
      var p0 = R.scr(a[0] - ex, a[1] - ey, DECK + 0.02), p1 = R.scr(b[0] + ex, b[1] + ey, DECK + 0.02);
      line(p0, p1, px(T * 0.42), '#3c4058'); line(p0, p1, px(T * 0.3), '#8a90a8'); line(p0, p1, Math.max(2, px(T * 0.08)), '#14121e');
      Rl.run.forEach(function(t){ var q = R.at(t), o = Rl.horiz ? [0, T * 0.2] : [T * 0.2, 0];
        [-1, 1].forEach(function(sg){ var s0 = R.scr(q[0] + o[0] * sg - (Rl.horiz ? T * 0.04 : 0), q[1] + o[1] * sg - (Rl.horiz ? 0 : T * 0.04), DECK + 0.03), s1 = R.scr(q[0] + o[0] * sg + (Rl.horiz ? T * 0.04 : 0), q[1] + o[1] * sg + (Rl.horiz ? 0 : T * 0.04), DECK + 0.03); line(s0, s1, Math.max(1, kk), '#c8ccdc'); }); }); }); }
  // where a rider stands as drawn (mid slide it is on its way)
  function riderAt(k){ var Rl = Q.rails[k], at = R.at(Rl.run[cur.p.charCodeAt(k) - 97]); if (slide && slide.k === k){ var a = R.at(slide.from), b = R.at(slide.to); return [a[0] + (b[0] - a[0]) * slide.u, a[1] + (b[1] - a[1]) * slide.u]; } return at; }
  // THE BEAM: its segments as points, and how far along it is drawn (it races out after a tap)
  function segPts(sg){ var a = R.at(sg[0]), b = R.at(sg[1]), V = [[0, -1], [1, 0], [0, 1], [-1, 0]][sg[3]], how = sg[2];
    var s0 = sg[0] === Q.emit ? [a[0] + V[0] * T * 0.36, a[1] + V[1] * T * 0.36] : a, k = how === 'turn' || how === 'split' || how === 'sensor' || how === 'eye' ? 0 : how === 'loop' ? 0 : 0.45;
    if (how === 'wall' || how === 'stop') return [s0, [b[0] - V[0] * T * k, b[1] - V[1] * T * k]];
    return [s0, b]; }
  function drawBeam(B, upto, tsec){ if (!B) return; var w = px(T * 0.1), kk = R.kk();
    B.segs.forEach(function(sg){ var pp = segPts(sg), L = Math.abs(pp[1][0] - pp[0][0]) + Math.abs(pp[1][1] - pp[0][1]), start = sg[4] * T, f = upto == null ? 1 : Math.max(0, Math.min(1, (upto - start) / Math.max(0.01, L)));
      if (f <= 0) return; var e = [pp[0][0] + (pp[1][0] - pp[0][0]) * f, pp[0][1] + (pp[1][1] - pp[0][1]) * f], a = R.scr(pp[0][0], pp[0][1], DECK + BZ), b = R.scr(e[0], e[1], DECK + BZ);
      var gs = R.scr(pp[0][0], pp[0][1], DECK + 0.03), ge = R.scr(e[0], e[1], DECK + 0.03);
      line(gs, ge, w * 2.2, 'rgba(255,43,94,0.18)');
      ctx.lineCap = 'round'; line(a, b, w * 3, BEAM[0]); line(a, b, w, BEAM[1]); line(a, b, Math.max(1, w * 0.35), BEAM[2]);
      if (!R.reduce) line(a, b, Math.max(1, w * 0.6), 'rgba(255,255,255,0.7)', [kk * 2, kk * 7], -(tsec || 0) * px(6)); ctx.lineCap = 'butt';
      if (f >= 1 && (sg[2] === 'stop' || sg[2] === 'wall')){ var sp = R.reduce ? 1 : 0.6 + 0.4 * Math.random(); ctx.fillStyle = 'rgba(255,240,244,' + sp + ')'; ctx.beginPath(); ctx.arc(b[0], b[1], Math.max(1.5, w * 0.9), 0, 7); ctx.fill(); } }); }
  function lenOf(B){ var m = 1; B.segs.forEach(function(sg){ var pp = segPts(sg); m = Math.max(m, sg[4] * T + Math.abs(pp[1][0] - pp[0][0]) + Math.abs(pp[1][1] - pp[0][1])); }); return m; }
  function draw(t, tsec){ var i = t.i, w = what(Q, cur, i);
    if (t.rider != null){ var Rl = Q.rails[t.rider], q = riderAt(t.rider); if (Rl.k === 'b') return cabinet(q[0], q[1], t.rider + 2, tsec, true);
      return panel(q[0], q[1], angOf(orient(cur, Rl.bit), Rl.run[cur.p.charCodeAt(t.rider) - 97]), Rl.split); }
    var c = R.at(i);
    if (i === Q.emit) return emitter(c[0], c[1], Q.edir, tsec);
    if (w === 'O') return sensor(c[0], c[1], !!((nbm && u0 >= 1 ? nbm : bm).lit & (1 << Q.sensors.indexOf(i))), tsec);
    if (w === 'A') return eye(c[0], c[1], cur.t === i + 1 || (ns && ns.t === i + 1 && u0 >= 0.95), tsec);
    if (w === 'B') return cabinet(c[0], c[1], i, tsec, false);
    if (Q.cell[i] === 'f' || Q.cell[i] === 'g') return panel(c[0], c[1], Q.cell[i] === 'f' ? Math.PI / 4 : Math.PI * 3 / 4, false, true);
    if (Q.flipAt[i] != null) return panel(c[0], c[1], angOf(orient(cur, Q.flipAt[i]), i), !!Q.split[i]); }
  var fixedT = []; Q.cell.forEach(function(ch, i){ if (i === Q.emit || ch === 'O' || ch === 'A' || ch === 'B' || ch === 'f' || ch === 'g' || Q.flipAt[i] != null) fixedT.push(i); });
  return {
    lay:function(s){ cur = s; bm = beam(Q, s); nbm = null; ns = null; flipU = {}; slide = null; u0 = 1; },
    move:function(m, u, tsec){
      if (m[0] === 'mirror'){ flipU[m[1]] = u; return; }
      if (m[0] === 'rider'){ slide = { k:Q.railAt[m[1]], from:m[1], to:m[2], u:u }; return; }
      if (m[0] === 'beam'){ if (m !== this._m){ this._m = m; ns = m[4]; nbm = beam(Q, ns); maxL = lenOf(nbm); this._z = 0;
          // the pieces stand where the tap leaves them from the start of the move; the flip and the slide play over it
          cur = { m:ns.m, p:slide ? cur.p : ns.p, t:0 }; }
        u0 = u; if (slide && u >= 1){ cur.p = ns.p; slide = null; }
        if (ns.t && u >= 0.95 && !this._z){ this._z = 1; var e = R.at(ns.t - 1); R.burst(e[0], e[1], DECK + 1, ['#ff3838', '#ffd0d0', '#fff'], 12, 1, 0.7); R.sfx('blip'); } } },
    things:function(ds){ fixedT.forEach(function(i){ var q = R.at(i); ds.push({ x:q[0], y:q[1], i:i, kd:draw }); });
      Q.rails.forEach(function(Rl, k){ var q = riderAt(k); ds.push({ x:q[0], y:q[1] + 0.01, i:-1, rider:k, kd:draw }); }); },
    ground:function(){ rails(); },
    over:function(tsec){ if (nbm) drawBeam(nbm, u0 * maxL * 1.02, tsec); else drawBeam(bm, null, tsec); } }; }

root.RTT_GYMKIND_LASERS = { id:'lasers', gyms:GYMS, input:'tap', calm:true, parse:parse, init:init, key:key, act:act, tap:tap, moves:moves, won:won, stuck:stuck,
  proof:proof, enc:enc, goal:goal, view:view, floor:floor, mats:mats,
  tell:{ stuck:'Alarm! Undo that tap, or Restart.' },
  hello:'Tap a mirror to flip it. Tap a rail to slide what rides it. Undo takes one back.', unit:'tap',
  dur:function(how){ return how === 'beam' ? 0.45 : how === 'slide' ? 0.35 : how === 'flip' ? 0.22 : 0.15; },
  beam:function(G, s){ return beam(parse(G), s); }, what:function(G, s, i){ return what(parse(G), s, i); } };
})();
