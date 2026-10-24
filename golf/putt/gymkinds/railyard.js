/* golf/putt/gymkinds/railyard.js: the RAIL YARD kind of trail gym (RTT_GYMKIND_RAILYARD), Canyon Mine's. A kind file:
   the registry (gyms.js, its KINDS README) finds it by its global, the frame (trail.js) plays it, check-putt proves it.

   THE PUZZLE. A mine yard of rails with switch points, worked like a real one: by shunting. A tap on a switch throws
   it. A tap on a cart's Go lever sends that cart off by itself, a tile a tick, following the switches as they stand
   when it gets to them, until it stops at a buffer stop (or a depot), where it waits facing back out, or rolls into the
   vault. Every ore chute has to be rolled over (it loads into the cart that passes) before the last cart goes into the
   vault. So a yard is solved over several runs, and THE YARD CARRIES OVER from one run to the next: a cart waits where
   it stopped, a flip switch a cart threw stays thrown, a sprung one is back home.
   A run fails at a rockfall, on a plain switch set against it, going round for ever, into the other cart where it is
   parked, or when the last cart goes into the vault with ore still out. A failed run stays on the board where it went
   wrong with a line in the panel saying why; a tap on any switch (or Undo) puts the yard back as it was before that run.

   THE SWITCHES. A switch has a stem and two ways. A cart coming in on the stem goes the way it is set; a cart coming in
   on a way goes out on the stem. Three kinds:
     plain (white)   stays as set. A cart coming in on the way it is NOT set for comes off the rails.
     sprung (blue)   has a home way (a small blue pip). Whatever he sets holds for the first cart through, then it snaps
                     home. A cart can come in on either way (the spring gives).
     flip (orange)   flips to its other way every time a cart goes through it, either way in, whoever's cart it is.
   THE AHAS. A siding that faces away from the cart is got into only by running past it to the buffers and coming back
   (The Sorting Yard), and a cart coming out of one siding can run straight into the next. The vault junction is sprung
   toward the vault, so a cart sent down the line too soon goes in short. In The Deep Junction two carts share the yard,
   and each one's trips throw the orange switches for the other.

   THE LAYOUTS ARE HAND DESIGNED, never random. Row 0 is the far wall (the top of the screen), the last row the near wall
   with the gate in it. The frame's five (# G @ L C) and this kind's own:

     -  |      a straight rail                      +   a crossing (straight over straight)
     r q b d   a bend: r joins right and down, q left and down, b up and right, d up and left
     1 to 9, then A B D E F H I J   a switch: its stem, its two ways and its kind are G.sw[n - 1]: { s:'D',
               w:['L', 'R'], t:'p'|'s'|'f', home (sprung: its home way, 0 or 1), set (plain or flip: how it starts) }
     o  an ore chute    k  a rockfall    x  a buffer stop    c  the cart's depot    e  the second cart's depot
     g  the cart's Go lever    h  the second cart's (a lever stands up into the tile behind its own, so a tap there
               pulls it too, unless that tile is a switch)
   An ore chute, a rockfall, a buffer, a depot and the vault take their rails from what is beside them, and every rail
   end must meet another rail (parse() throws on one that runs into nothing).

   THE STATE is the switches (m, a bit a switch), the ore loaded (got, a bit a chute) and every cart (its tile, the way
   it will roll next, in the vault or not), plus how the last run failed. solve() and audit() are the registry's (lib):
   breadth first over taps, so the fewest moves are the fewest taps, and no state is stuck. */
(function(){
var root = typeof window !== 'undefined' ? window : globalThis;
var DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];   // up, right, down, left (up is away from the camera)
var SIDE = { U:0, R:1, D:2, L:3 };
// the rails a character lays: the sides of the tile it joins (a crossing is two straights over each other)
var RAIL = { '-':[1, 3], '|':[0, 2], 'r':[1, 2], 'q':[2, 3], 'b':[0, 1], 'd':[0, 3], '+':[0, 1, 2, 3] };
// tiles whose rail is read from the rails beside them: an ore chute, a rockfall, a buffer stop, a depot, the vault
var INFER = { o:1, k:1, x:1, c:1, e:1, C:1 };

/* THE GYMS. world, leg (the trail into that hole of the world: 9 mid-world, 18 its last), mech (the first gym's one,
   then the gatekeeper's two: its own and an earlier world's, here Neon Arcade's bumper cars), the civilian at the gate
   (three lines: a nudge, a plainer one after two restarts, a warmer one after five, never the answer), pay, and moves
   and proof: the solver's fewest taps and one shortest solution (the tapped tiles), recorded from solve(), which
   check-putt.mjs solves again and holds them to. The guide for the owner is kept outside the game. */
var GYMS = [
  /* THE SORTING YARD, mid-world (the trail into hole 9). One cart and a main line up the middle, with a split head of
     buffers at the top and four sidings off it: two face up the line (one is blocked by a rockfall), two face down it.
     The lesson is that a siding facing the wrong way is got into by running past it to the buffers and coming back,
     and that a cart coming out of one siding can run straight into the next. The blue switches spring back: the head
     sends the cart to its ore once, and the vault junction takes the cart into the vault whenever it comes down the
     line, ready or not. Five ore, 12 taps at best, 6,497 states. */
  { id:'canyon1', kind:'railyard', world:'canyon', leg:9, name:'The Sorting Yard', badge:'Points Badge', mech:['points'], pay:500, look:{ wall:'plank' },
    moves:12, proof:'16,151,93,38,151,151,38,151,60,151,93,151',
    who:{ look:{ skin:'tan', polo:'gold', hat:'tan', pants:'navy', hair:'brown', hairStyle:'ponytail', cap:true, hatStyle:'cap', gender:'female' } },
    say:['My granddad ran carts in this yard for forty years. He said the trick is knowing where a cart stops, not where it starts.',
      'Some of those sidings face the wrong way to drive straight in. The buffers up top aren\'t there for show.',
      'Blue ones spring back after any cart goes through, even on its way up. Plan every trip, not just the first one.'],
    sw:[
      { s:'D', w:['U', 'L'], t:'p', set:0 },    // 1 the lower siding facing up (the rockfall)
      { s:'U', w:['D', 'R'], t:'p', set:0 },    // 2 the lower siding facing down
      { s:'D', w:['U', 'R'], t:'p', set:0 },    // 3 the upper siding facing up
      { s:'U', w:['D', 'L'], t:'p', set:0 },    // 4 the upper siding facing down
      { s:'U', w:['R', 'L'], t:'s', home:1 },   // 5 the vault junction, sprung toward the vault
      { s:'D', w:['L', 'R'], t:'s', home:0 } ], // 6 the head, sprung toward its empty buffer
    rows:[
      '###########',
      '#..x-6o-x.#',
      '#....|....#',
      '#..r-4.x..#',
      '#..o.|.o..#',
      '#..x.3-d..#',
      '#....|....#',
      '#....|....#',
      '#..x.2-q..#',
      '#..k.|.o..#',
      '#..b-1.x..#',
      '#....o....#',
      '#.C--5-c..#',
      '#L......g@#',
      '#########G#'
    ] },
  /* THE DEEP JUNCTION, guarding the trail into the world's last hole. The same kind of yard turned round, with two
     carts: the green one at the depot and the blue one parked down a siding, each with its own lever. Two of the
     sidings are thrown by orange flip switches, and every cart that goes through one throws it, whoever it belongs to.
     The lesson is that one cart sets the yard for the other: the blue cart's trips leave the flips pointing the green
     cart into the sidings it needs. A cart can run into the other where it is parked. Six ore, 14 taps at best,
     61,884 states. */
  { id:'canyon2', kind:'railyard', world:'canyon', leg:18, name:'The Deep Junction', badge:'Junction Badge', mech:['points', 'bumper cars'], pay:1000, keeper:true, look:{ wall:'plank' },
    moves:14, proof:'93,16,149,93,38,145,137,145,149,149,38,149,145,145',
    who:{ look:{ skin:'light', polo:'navy', hat:'white', pants:'khaki', hair:'grey', hairStyle:'short', cap:true, hatStyle:'cap', gender:'male' } },
    say:['Two carts and one set of points. My partner and I used to argue all day about who went first.',
      'The orange ones flip for every cart that goes through them. Even the cart you\'re not watching.',
      'That blue cart isn\'t in your way. It\'s the best help you\'ve got. Watch what it leaves behind.'],
    sw:[
      { s:'D', w:['U', 'R'], t:'f', set:0 },    // 1 the lower siding facing up, a flip
      { s:'U', w:['D', 'L'], t:'p', set:0 },    // 2 the blue cart's siding, facing down
      { s:'D', w:['U', 'L'], t:'f', set:0 },    // 3 the upper siding facing up, a flip
      { s:'U', w:['D', 'R'], t:'p', set:0 },    // 4 the upper siding facing down
      { s:'U', w:['L', 'R'], t:'s', home:1 },   // 5 the vault junction, sprung toward the vault
      { s:'D', w:['R', 'L'], t:'s', home:0 } ], // 6 the head, sprung toward its empty buffer
    rows:[
      '###########',
      '#.x-o6-x..#',
      '#....|....#',
      '#..x.4-q..#',
      '#..o.|.o..#',
      '#..b-3.x..#',
      '#....|....#',
      '#....|....#',
      '#..ro2.x..#',
      '#..|.|.o..#',
      '#..e.1-d..#',
      '#....o....#',
      '#..c-5-C..#',
      '#@g...h..L#',
      '#G#########'
    ] }
];

var LIB = function(){ return root.RTT_PUTT_GYMS.lib; };
var PARSED = {};
var SWC = '123456789ABDEFHIJ';   // the characters of switch 1, 2, 3 and on (C, G and L are the frame's)
function nb(Q, i, d){ var c = i % Q.W, r = (i / Q.W) | 0, nc = c + DIRS[d][0], nr = r + DIRS[d][1]; return nc < 0 || nr < 0 || nc >= Q.W || nr >= Q.H ? -1 : nr * Q.W + nc; }
function at(Q, i){ return (i % Q.W) + ',' + ((i / Q.W) | 0); }
/* THE YARD, read once: the frame's five through lib.room, then every tile's rails (side[i], the sides it joins), the
   switches (Q.sw by number, Q.swAt by tile), the ore chutes (bit k is chute k), the carts' depots and their Go levers. */
function parse(G){ if (PARSED[G.id]) return PARSED[G.id];
  var Q = LIB().room(G, function(ch){ return !!(RAIL[ch] || INFER[ch] || SWC.indexOf(ch) >= 0 || ch === 'g' || ch === 'h'); });
  var N = Q.W * Q.H, side = [], sw = [], swAt = {}, ore = [], oreAt = {}, carts = [], go = [], i, k;
  for (i = 0; i < N; i++){ k = Q.cell[i]; side.push(null);
    if (RAIL[k]) side[i] = RAIL[k].slice();
    else if (SWC.indexOf(k) >= 0){ var n0 = SWC.indexOf(k), def = G.sw[n0]; if (!def) throw new Error(G.id + ': no switch ' + k);
      var o = { i:i, n:n0, stem:SIDE[def.s], ways:[SIDE[def.w[0]], SIDE[def.w[1]]], t:def.t || 'p', home:def.home || 0 };
      o.set = o.t === 's' ? o.home : (def.set || 0);
      if (swAt[i] || sw[o.n]) throw new Error(G.id + ': switch ' + k + ' twice');
      sw[o.n] = o; swAt[i] = o; side[i] = [o.stem, o.ways[0], o.ways[1]]; }
    else if (k === 'g') go[0] = i; else if (k === 'h') go[1] = i; }
  // an inferred tile joins every rail beside it that runs toward it, and any inferred tile beside it (an ore chute next to its buffer)
  for (i = 0; i < N; i++){ k = Q.cell[i]; if (!INFER[k]) continue; var s2 = [];
    for (var d = 0; d < 4; d++){ var n = nb(Q, i, d); if (n >= 0 && (INFER[Q.cell[n]] || (side[n] && side[n].indexOf((d + 2) % 4) >= 0))) s2.push(d); }
    side[i] = s2;
    if (k === 'o'){ oreAt[i] = ore.length; ore.push(i); }
    if ((k === 'o' || k === 'k') && s2.length !== 2) throw new Error(G.id + ': the ' + k + ' at ' + at(Q, i) + ' joins ' + s2.length + ' rails, not 2');
    if ((k === 'x' || k === 'C' || k === 'c' || k === 'e') && s2.length !== 1) throw new Error(G.id + ': the ' + k + ' at ' + at(Q, i) + ' joins ' + s2.length + ' rails, not 1');
    if (k === 'c' || k === 'e') carts[k === 'c' ? 0 : 1] = { at:i, d:s2[0] }; }
  // every rail end meets a rail: a line that just stops is a buffer stop (x), so a dead end is always drawn as one
  for (i = 0; i < N; i++){ if (!side[i]) continue; side[i].forEach(function(d){ var n = nb(Q, i, d);
    if (n < 0 || !side[n] || side[n].indexOf((d + 2) % 4) < 0) throw new Error(G.id + ': the rail at ' + at(Q, i) + ' runs ' + 'URDL'.charAt(d) + ' into nothing'); }); }
  for (var q = 0; q < sw.length; q++) if (!sw[q]) throw new Error(G.id + ': switch ' + (q + 1) + ' is missing');
  carts = carts.filter(Boolean);
  if (!carts.length || go[0] == null || (carts.length > 1) !== (go[1] != null)) throw new Error(G.id + ': a rail yard needs a cart (c) and its Go lever (g), and a second cart (e) has its own (h)');
  if (side[Q.chest] == null) throw new Error(G.id + ': the vault has no rail into it');
  Q.side = side; Q.sw = sw; Q.swAt = swAt; Q.ore = ore; Q.oreAt = oreAt; Q.carts = carts; Q.go = go;
  // a lever stands up into the tile behind its own, so a tap there pulls it too (unless that tile is a switch or a lever)
  Q.goUp = go.map(function(g){ var u = g - Q.W; return u >= 0 && Q.cell[u] !== '#' && !swAt[u] && go.indexOf(u) < 0 ? u : -1; });
  Q.m0 = 0; sw.forEach(function(o){ if (o.set) Q.m0 |= 1 << o.n; });
  return PARSED[G.id] = Q; }

/* THE STATE. m: the switches as they stand (a bit a switch, 1 its second way); got: the ore loaded (a bit a chute);
   c: every cart as [tile, the way it will roll when sent, 1 once it is in the vault]; f: 0, or how the last run
   failed (the state then holds the yard as it was before that run, and fk the cart that was sent); ld: how much ore
   each cart carries (for the drawing only, so not in the key). The yard stays as a run leaves it: a flip a cart threw
   stays thrown, a cart stopped at a buffer waits there, facing back out, for its next Go. */
function init(G){ var Q = parse(G); return { m:Q.m0, got:0, c:Q.carts.map(function(c){ return [c.at, c.d, 0]; }), f:0, fk:0, ld:Q.carts.map(function(){ return 0; }) }; }
function key(s){ return s.m + '|' + s.got + '|' + s.c.join(';') + '|' + s.f + '|' + s.fk; }
var WHY = { rock:1, points:2, loop:3, short:4, hit:5 };
/* ONE GO: cart k rolls from where it stands, a tile a tick, until it stops at a buffer stop or a depot (then it waits
   there, facing back out), goes into the vault, or fails: 'rock', 'points' (a plain switch set against it), 'loop'
   (round for ever), 'hit' (into the other cart) or 'short' (the last cart in the vault with ore left behind).
   Returns { s, why, at, trace }; with want, trace is tick by tick the moving cart's tile, the switches and the ore. */
function go(G, s, k, want){ var Q = parse(G), m = s.m, got = s.got, c = s.c[k], p = c[0], d = c[1], seen = {}, trace = want ? [{ p:p, m:m, got:got }] : null, ld = s.ld.slice(), all = (1 << Q.ore.length) - 1;
  function snap(){ if (want) trace.push({ p:p, m:m, got:got }); }
  function done(st, why, at2){ return { s:st, why:why || null, at:at2 == null ? p : at2, trace:trace, got:got }; }
  function fail(why){ snap(); return done({ m:s.m, got:s.got, c:s.c, f:WHY[why], fk:k, ld:s.ld }, why, p); }
  function cartsWith(c2){ return s.c.map(function(o, j){ return j === k ? c2 : o; }); }
  for (var t = 0; t < 400; t++){ var sk = p + ',' + d + ',' + m + ',' + got; if (seen[sk]) return fail('loop'); seen[sk] = 1;
    var n = nb(Q, p, d), e = (d + 2) % 4, ch = Q.cell[n];
    for (var j = 0; j < s.c.length; j++) if (j !== k && !s.c[j][2] && s.c[j][0] === n){ p = n; return fail('hit'); }
    p = n;
    if (ch === 'k') return fail('rock');
    if (ch === 'C'){ var c3 = cartsWith([n, e, 1]); snap();
      if (c3.every(function(o){ return o[2]; }) && got !== all) return done({ m:s.m, got:s.got, c:s.c, f:WHY.short, fk:k, ld:s.ld }, 'short', n);
      return done({ m:m, got:got, c:c3, f:0, fk:0, ld:ld }, c3.every(function(o){ return o[2]; }) ? 'won' : 'in', n); }
    if (ch === 'x' || ch === 'c' || ch === 'e'){ snap(); return done({ m:m, got:got, c:cartsWith([n, e, 0]), f:0, fk:0, ld:ld }, 'stop', n); }
    if (Q.oreAt[n] != null && !(got & (1 << Q.oreAt[n]))){ got |= 1 << Q.oreAt[n]; ld[k]++; }
    var o = Q.swAt[n];
    if (o){ var b = (m >> o.n) & 1;
      if (e !== o.stem && e !== o.ways[b] && o.t === 'p') return fail('points');
      d = e === o.stem ? o.ways[b] : o.stem;
      if (o.t === 's') m = o.home ? (m | (1 << o.n)) : (m & ~(1 << o.n)); else if (o.t === 'f') m ^= 1 << o.n; }
    else { var sd = Q.side[n]; if (sd.length !== 4) d = sd[0] === e ? sd[1] : sd[0]; }
    snap(); }
  return fail('loop'); }
// the run a failed state came from, or the one a Go plays (kept a few at a time, for the drawing)
var TRACES = {};
function trace(G, s, k){ var kk = G.id + ':' + key(s) + ':' + k; if (TRACES[kk]) return TRACES[kk]; var ks = Object.keys(TRACES); if (ks.length > 40) TRACES = {};
  return TRACES[kk] = go(G, s, k, true); }
function pre(s){ return s.f ? { m:s.m, got:s.got, c:s.c, f:0, fk:0, ld:s.ld } : s; }
/* A TAP. On a switch: throw it (after a failed run, the yard is put back as it was before that run first). On a Go
   lever: that cart's run, played tick by tick (the golfer pulls the lever, then one move a tick:
   ['cart', tick before, tick after, how, cart]). On the reset lever: the start. */
function act(G, s, i){ var Q = parse(G), o = Q.swAt[i], k = Q.go.indexOf(i);
  if (won(G, s)) return { s:s, ev:'bump', moves:[] };
  if (o){ var b = pre(s), mv = [['sw', i, i, 'flip']]; if (s.f) mv.push(['home', i, i, 'home']);
    return { s:{ m:b.m ^ (1 << o.n), got:b.got, c:b.c, f:0, fk:0, ld:b.ld }, ev:'flip', moves:mv }; }
  if (k >= 0){ if (s.f || !s.c[k] || s.c[k][2]) return { s:s, ev:'bump', moves:[] };
    var r = trace(G, s, k), mv2 = [['me', Q.start, Q.start, 'pull']];
    for (var t = 1; t < r.trace.length; t++) mv2.push(['cart', t - 1, t, t === r.trace.length - 1 ? (r.s.f ? 'crash' : r.why === 'stop' ? 'stop' : 'in') : 'roll', k]);
    return { s:r.s, ev:r.s.f ? 'fail' : 'run', moves:mv2 }; }
  if (i === Q.lever) return key(s) === key(init(G)) ? { s:s, ev:'bump', moves:[] } : { s:init(G), ev:'reset', moves:[] };
  return { s:s, ev:'bump', moves:[] }; }
function tap(G, s, i){ var Q = parse(G), u = Q.goUp.indexOf(i); return act(G, s, u >= 0 ? Q.go[u] : i); }
// every tap worth trying: the switches, and each cart's lever while he plans (after a failed run a switch puts the yard back)
function moves(G, s){ var Q = parse(G); if (won(G, s)) return []; var ms = Q.sw.map(function(o){ return o.i; });
  if (!s.f) Q.go.forEach(function(g, k){ if (!s.c[k][2]) ms.push(g); }); return ms; }
function won(G, s){ return !s.f && s.c.every(function(o){ return o[2]; }); }
/* STUCK. No state of these yards is one the vault cannot be reached from: a failed run puts the yard back, a cart can
   always run back out of where it stopped, and the vault only fails the last cart in. check-putt's audit searches every
   reachable state and would count any stuck one the frame was not told about, so this answers no and is held to it. */
function stuck(){ return false; }
function proof(G){ return (G.proof || '').split(',').filter(Boolean).map(Number); }
function enc(path){ return path.join(','); }
// the goal line, with the gym's own counts in it
function goal(G){ var Q = parse(G), n = Q.ore.length, two = Q.carts.length > 1, kinds = {}; Q.sw.forEach(function(o){ kinds[o.t] = 1; });
  return (two ? 'Both carts in the vault with all ' + n + ' ore.' : 'Load all ' + n + ' ore, then into the vault.') + (kinds.f ? ' Orange flips, blue springs.' : kinds.s ? ' Blue switches spring back.' : ''); }
// what a run says, in the panel: why it failed, or where it stopped
function runLine(G, s0, r){ var Q = parse(G), n = 0; for (var k = 0; k < Q.ore.length; k++) if (r.got & (1 << k)) n++;
  return r.why === 'rock' ? 'Rockfall. That line is blocked.' : r.why === 'points' ? 'Off the rails. That switch was set against it.' :
    r.why === 'loop' ? 'Round and round. It\'ll never get out.' : r.why === 'hit' ? 'Crash! It ran into the other cart.' :
    r.why === 'short' ? 'Only ' + n + ' of ' + Q.ore.length + ' ore loaded. The vault wants it all.' :
    r.why === 'stop' ? 'Stopped at the buffers. Go sends it back out.' : r.why === 'in' ? 'One cart in. Now the other.' : ''; }

/* ---------------------------------------------------------------------------------------------------- THE DRAWING
   Canyon Mine's own look: a packed earth floor, rails of steel on timber ties over a gravel bed, iron mine carts, gold
   ore on the bed of each chute, a rockfall of the canyon's red stone, buffer stops in red and white, and the Go lever
   in green, so it is never taken for the frame's reset lever (red). The rails are sprites drawn on the floor each
   frame (ground), so the switches show how they stand: the way a switch is set glows gold, the other way has a red
   bar across it, and a disc in its middle says its kind (white plain, blue sprung, orange flip) with an arrow the way
   it is set. A sprung switch's home way carries a small blue pip. */
var DECK = 0.45, G_TICK = 0.13;
var EARTH = ['#b4875a', '#a87c50', '#7a5536', '#c49a6c'];
var KCOL = { p:['#f4efe4', '#2a1c10'], s:['#2f86ff', '#ffffff'], f:['#ff8a1a', '#ffffff'] };
// the floor: packed earth, a dark seam on every tile's edge so the grid reads, a few pebbles
function floor(gc){ if (gc.k === '#') return null; return { h:DECK, mat:['ryfloor', { gu:gc.u, gv:gc.v, gc:gc.c, gr:gc.r }] }; }
function mats(){ return { ryfloor:['', '', '', 0, function(c, R, h3){ if (c.dt < 0) return R(EARTH[2]); var u = c.gu || 0, v = c.gv || 0;
  if (u < 0.04 || u > 0.96 || v < 0.04 || v > 0.96) return R(EARTH[2]);
  var n = h3(c.ti, c.tj, 47); return R(n < 0.05 ? EARTH[2] : n > 0.93 ? EARTH[3] : ((c.gc || 0) + (c.gr || 0)) % 2 ? EARTH[0] : EARTH[1]); }] }; }
/* A RAIL TILE at (u, v), for its pairs of sides (a bend 'RD', a straight 'LR', a switch its two, a crossing both): 2 a
   steel rail, 1 a timber tie, 3 the gravel bed, 0 nothing. A straight runs edge to edge; a bend is two arcs round the
   corner between its two sides. */
function railPx(rs, u, v){ var best = 0;
  for (var q = 0; q + 1 < rs.length; q += 2){ var a = rs.charAt(q), b = rs.charAt(q + 1), hv = (a === 'L' || a === 'R') + (b === 'L' || b === 'R');
    if (hv !== 1){ var x = hv === 2 ? v : u, al = hv === 2 ? u : v;
      if (Math.abs(x - 0.32) < 0.055 || Math.abs(x - 0.68) < 0.055) return 2; if (x > 0.17 && x < 0.83 && (al * 4 % 1) < 0.4) best = 1; else if (x > 0.12 && x < 0.88 && best < 1) best = 3; continue; }
    var cu = a === 'R' || b === 'R' ? 1 : 0, cv = a === 'D' || b === 'D' ? 1 : 0, rr = Math.hypot(u - cu, v - cv);
    if (Math.abs(rr - 0.32) < 0.055 || Math.abs(rr - 0.68) < 0.055) return 2;
    var an = Math.atan2(v - cv, u - cu); if (rr > 0.17 && rr < 0.83 && ((an / (Math.PI / 2) * 3.2) % 1 + 1) % 1 < 0.4) best = 1; else if (rr > 0.12 && rr < 0.88 && best < 1) best = 3; }
  return best; }
function box(B, w, d, h, fn, sv){ var zb = B.gz ? B.gz(0, 0) : 0; B.solid(-w / 2, -d / 2, zb - 0.05, w / 2, d / 2, zb + h, function(px, py, pz){ return fn(px, py, pz - zb); }, sv || 0.0625); }
function hsh(a, b, c){ var x = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return x - Math.floor(x); }
function railFn(rs, T){ return function(B){ box(B, T, T, 0.24, function(px, py, pz){ var u = px / T + 0.5, v = py / T + 0.5, r = railPx(rs, u, v);
  if (r === 2) return pz < 0.22 ? (pz > 0.16 ? '#e8ecf2' : '#7c828e') : null;
  if (r === 1) return pz < 0.11 ? (hsh(px * 8 | 0, py * 8 | 0, 3) < 0.2 ? '#4a2e18' : '#6a4426') : null;
  if (r === 3) return pz < 0.05 ? (hsh(px * 16 | 0, py * 16 | 0, 5) < 0.3 ? '#6e6258' : '#8e8072') : null;
  return null; }); }; }
// a mine cart: an iron tub on four wheels, square so it reads the same on either rail, with as much ore in it as it carries
function cartFn(fill, k){ var body = k ? ['#3a6a9a', '#2a4e76'] : ['#3f8a4a', '#2c6636'];
  return function(B){ box(B, 1.6, 1.6, 1.8, function(dx, dy, tt){ var ax2 = Math.abs(dx), ay2 = Math.abs(dy), fl = (tt - 0.3) * 0.12;
    if (ay2 > 0.46 && ay2 < 0.6 && Math.hypot(ax2 - 0.4, tt - 0.22) < 0.2) return Math.hypot(ax2 - 0.4, tt - 0.22) < 0.07 ? '#c8ccd4' : '#1a1a1e';
    if (tt < 0.3 || tt > 1.3 || ax2 > 0.6 + fl || ay2 > 0.46 + fl) return null;
    if (ax2 < 0.47 + fl && ay2 < 0.33 + fl && tt > 0.5){ var top = 0.62 + fill * 0.62 - Math.hypot(dx, dy) * 0.5 * fill;
      if (fill > 0 && tt < top) return hsh(dx * 9 | 0, dy * 9 | 0, tt * 9 | 0) < 0.3 ? '#fff0a0' : hsh(dx * 7 | 0, dy * 7 | 0, 2) < 0.5 ? '#ffc23a' : '#e08a1a';
      return tt < 0.62 ? '#2a1e16' : null; }
    if (tt > 1.18) return '#e0c08a'; if (Math.abs(tt - 0.78) < 0.06 || (ax2 > 0.5 + fl && ay2 > 0.36 + fl)) return '#3a3c42';
    return hsh(dx * 9 | 0, tt * 9 | 0, 5) < 0.14 ? body[1] : body[0]; }); }; }
// an ore chute's load: gold ore heaped on a timber pallet across the rails, glinting; once loaded, the bare pallet
function oreFn(full){ return function(B){ box(B, 1.3, 1.3, 0.9, function(dx, dy, tt){ var r = Math.hypot(dx, dy * 1.1);
  if (tt < 0.1) return Math.abs(dx) < 0.55 && Math.abs(dy) < 0.5 ? ((Math.abs(dy) * 6 | 0) % 2 ? '#5a3a20' : '#7a5230') : null;
  if (!full) return null; var top = 0.1 + Math.max(0, 0.62 - r * 1.15);
  if (tt > top) return null; var h = hsh(dx * 10 | 0, dy * 10 | 0, tt * 10 | 0); return h < 0.18 ? '#fff4b0' : h < 0.55 ? '#ffc23a' : h < 0.85 ? '#e0861a' : '#8a5a2a'; }); }; }
// a rockfall of the canyon's red stone, heaped over the rails
function rockFn(){ return function(B){ box(B, 1.6, 1.6, 1.2, function(dx, dy, tt){ var best = null;
  [[-0.25, -0.1, 0.42], [0.28, 0.05, 0.38], [0, 0.25, 0.34], [0.05, -0.3, 0.3]].forEach(function(q, k){ var d = Math.hypot(dx - q[0], dy - q[1], tt - q[2] * 0.85);
    if (d < q[2] && !best) best = hsh(dx * 7 | 0, dy * 7 | 0, tt * 7 | 0) < 0.2 ? '#6e3a22' : tt > q[2] * 1.2 ? '#d48a5c' : k % 2 ? '#a85a36' : '#b8693e'; });
  return best; }); }; }
// a buffer stop: a red and white beam on two posts, across the end of the line
function bufferFn(side){ return function(B){ box(B, 1.6, 1.6, 1.3, function(dx, dy, tt){ var along = side === 0 || side === 2 ? dy : dx, across = side === 0 || side === 2 ? dx : dy, off = (side === 0 || side === 3 ? -1 : 1) * 0.62;
  if (Math.abs(along - off) > 0.12) return null;
  if (Math.abs(across) > 0.62) return null;
  if (tt > 0.55 && tt < 0.95) return ((across + 1) * 3 | 0) % 2 ? '#f4f0e6' : '#d83a2a';
  if (tt <= 0.55 && Math.abs(Math.abs(across) - 0.42) < 0.08) return '#3a3a40';
  return null; }); }; }
// the Go lever: an iron stand with a long handle and a big green knob, up or pulled toward him
function goFn(pulled, k){ var KN = k ? ['#3a8cff', '#cfe4ff'] : ['#22b84a', '#b6ffb0']; return function(B){ var a = pulled ? 0.9 : -0.25, ca = Math.cos(a), sa = Math.sin(a), PZ0 = 0.75;
  box(B, 1.4, 1.4, 3.2, function(dx, dy, tt){
    if (tt < 0.2 && Math.abs(dx) < 0.55 && Math.abs(dy) < 0.45) return tt > 0.14 ? '#5a5a62' : '#3a3a40';
    if (tt < PZ0 + 0.12 && Math.abs(dx) < 0.22 && Math.abs(dy) < 0.22) return Math.abs(dx) > 0.16 ? '#2e2e34' : '#4a4a52';
    var hy = dy, hz = tt - PZ0, along = hz * ca + hy * sa, side = hy * ca - hz * sa;
    if (Math.abs(dx) < 0.07 && along > 0 && along < 1.75 && Math.abs(side) < 0.08) return '#2e2e34';
    if (Math.hypot(dx, hy - sa * 1.9, hz - ca * 1.9) < 0.32) return Math.hypot(dx + 0.1, hy - sa * 1.9, hz - ca * 1.9 - 0.12) < 0.14 ? KN[1] : KN[0];
    return null; }); }; }

function view(R){ var G = R.G, Q = R.Q, T = R.T, sp = {}, disp = [], path = null, fail = null, pulled = -1, sayAt = -1, told = {};
  function S(k, fn, w, d, h){ return sp[k] || (sp[k] = R.sprite('ry:' + k, fn, w, d, h)); }
  // every rail tile's sprite, by its shape: a switch shows both its ways
  var L = 'URDL', tiles = [];
  Q.side.forEach(function(sd, i){ if (!sd || i === Q.chest) return; var o = Q.swAt[i], rs;
    if (o) rs = L.charAt(o.stem) + L.charAt(o.ways[0]) + L.charAt(o.stem) + L.charAt(o.ways[1]);
    else if (sd.length === 4) rs = 'LRUD'; else rs = L.charAt(sd[0]) + L.charAt(sd[1]);
    if (sd.length === 1) rs = L.charAt(sd[0]) + L.charAt((sd[0] + 2) % 4);
    tiles.push({ i:i, rs:rs }); });
  function railS(rs){ return S('rail' + rs, railFn(rs, T), T, T, 0.3); }
  function cartS(fill, k){ var f = Math.round(fill * 3) / 3; return S('cart' + f + 'k' + k, cartFn(f, k), 1.8, 1.8, 2); }
  var oreFull = null, oreBare = null, rockS = null;
  var cur = { m:Q.m0, got:0, ld:[0, 0] }, st = null;
  function cartsAt(c, k, p){ disp = c.map(function(o, j){ var t = j === k ? p : o[2] ? -1 : o[0]; if (t < 0) return null; var q = R.at(t); return { x:q[0], y:q[1], j:j }; }); }
  function bits(x){ var n = 0; while (x){ n += x & 1; x >>= 1; } return n; }
  // a state as it stands; after a failed run, the yard as it was with that run's cart where it went wrong
  function lay(s){ st = s; pulled = -1; sayAt = -1; fail = null; path = null;
    if (s.f){ var b = pre(s), r = trace(G, b, s.fk), last = r.trace[r.trace.length - 1]; cartsAt(b.c, s.fk, last.p);
      var ld = b.ld.slice(); ld[s.fk] += bits(last.got ^ b.got); cur = { m:b.m, got:last.got, ld:ld }; fail = { at:r.at };
      path = r.trace.map(function(t2){ return t2.p; }); }
    else { cartsAt(s.c, -1, 0); cur = { m:s.m, got:s.got, ld:s.ld.slice() }; } }
  function move(m, u){ if (m[0] === 'sw' || m[0] === 'home'){ if (m[0] === 'home' && u >= 1){ fail = null; path = null; } return; }
    if (m[0] !== 'cart') return; var k = m[4], r = trace(G, st, k), a = r.trace[m[1]], b = r.trace[m[2]], qa = R.at(a.p), qb = R.at(b.p), uu = m[3] === 'crash' ? Math.min(u, 0.55) : u;
    pulled = k; cartsAt(st.c, k, a.p); disp[k] = m[3] === 'in' && u >= 1 ? null : { x:qa[0] + (qb[0] - qa[0]) * uu, y:qa[1] + (qb[1] - qa[1]) * uu, j:k };
    var g2 = u >= 0.5 ? b : a, ld = st.ld.slice(); ld[k] += bits(g2.got ^ st.got); cur = { m:g2.m, got:g2.got, ld:ld };
    if (m[1] === 0 && u < 0.05 && sayAt !== 0){ sayAt = 0; R.sfx('blip'); }
    if (u >= 0.5 && b.got !== a.got && sayAt !== m[2]){ sayAt = m[2]; var nq = null; Q.ore.forEach(function(oi, k2){ if ((b.got & (1 << k2)) && !(a.got & (1 << k2))) nq = R.at(oi); });
      if (nq) R.burst(nq[0], nq[1], DECK + 0.6, ['#ffd23a', '#fff1a0', '#e08a1a'], 10, 1, 0.7); R.sfx('coin'); }
    if (u >= 1 && sayAt !== -2 && m[3] !== 'roll'){ sayAt = -2; var line = runLine(G, st, r);
      if (m[3] === 'crash'){ var q = R.at(r.at); R.burst(q[0], q[1], DECK + 0.8, ['#d8b890', '#8a6a4a', '#ffffff', '#e5483a'], 22, 1.6, 1.1); R.sfx('blip'); R.say(line, 5200); }
      else if (line && !told[r.why]){ told[r.why] = 1; R.say(line, 3600); } } }
  function drawCart(t2){ var o = t2.o, n = Math.max(1, Math.ceil((Q.ore.length || 1) / Q.carts.length)); R.drawSprite(cartS(Math.min(1, (cur.ld[o.j] || 0) / n), o.j), o.x, o.y, DECK, 1, true); }
  function drawSp(t2){ R.drawSprite(t2.sp, t2.x, t2.y, DECK, 1, true); }
  function things(ds){ if (!oreFull){ oreFull = S('orefull', oreFn(true), 1.4, 1.4, 1); oreBare = S('orebare', oreFn(false), 1.4, 1.4, 1); rockS = S('rock', rockFn(), 1.8, 1.8, 1.3); }
    Q.ore.forEach(function(oi, k){ var q = R.at(oi); ds.push({ x:q[0], y:q[1] - 0.05, sp:(cur.got & (1 << k)) ? oreBare : oreFull, kd:drawSp }); });
    Q.cell.forEach(function(ch, i){ if (ch === 'k'){ var q = R.at(i); ds.push({ x:q[0], y:q[1], sp:rockS, kd:drawSp }); }
      if (ch === 'x' || ch === 'c' || ch === 'e'){ var q2 = R.at(i), sd = Q.side[i][0], back = (sd + 2) % 4; ds.push({ x:q2[0], y:q2[1] - 0.02, sp:S('buf' + back, bufferFn(back), 1.8, 1.8, 1.4), kd:drawSp }); } });
    Q.go.forEach(function(g, k){ var gq = R.at(g); ds.push({ x:gq[0], y:gq[1], sp:S('go' + k + (pulled === k ? 1 : 0), goFn(pulled === k, k), 1.6, 1.6, 3.4), kd:drawSp }); });
    disp.forEach(function(o){ if (o) ds.push({ x:o.x, y:o.y + 0.01, o:o, kd:drawCart }); }); }
  // on the floor: the rails, then how each switch stands, then (after a failed run) where the carts went and where it went wrong
  function ground(tsec){ var ctx = R.ctx, kk = R.kk();
    tiles.forEach(function(t2){ var q = R.at(t2.i); R.drawSprite(railS(t2.rs), q[0], q[1], DECK, 1, true); });
    if (path) dots(ctx, kk);
    Q.sw.forEach(function(o){ drawSwitch(ctx, kk, o, (cur.m >> o.n) & 1); });
    }
  // over the scene: where a failed run went wrong, a red cross that pulses (over the cart that stopped there)
  function over(tsec){ if (!fail) return; var ctx = R.ctx, kk = R.kk(), q = R.at(fail.at), z = DECK + 0.9, c0 = R.scr(q[0], q[1], z), cx = R.scr(q[0] + T * 0.32, q[1], z), cy = R.scr(q[0], q[1] + T * 0.32, z), rx = Math.abs(cx[0] - c0[0]), ry = Math.max(Math.abs(cy[1] - c0[1]), rx * 0.75);
    var pul = R.reduce ? 1 : 0.7 + 0.3 * Math.sin(tsec * 5); ctx.save(); ctx.lineCap = 'round';
    [['rgba(40,10,6,0.9)', Math.max(5, kk * 3.2)], ['rgba(255,70,50,' + pul + ')', Math.max(3, kk * 1.9)]].forEach(function(stk){ ctx.strokeStyle = stk[0]; ctx.lineWidth = stk[1]; ctx.beginPath();
      ctx.moveTo(c0[0] - rx, c0[1] - ry); ctx.lineTo(c0[0] + rx, c0[1] + ry); ctx.moveTo(c0[0] + rx, c0[1] - ry); ctx.lineTo(c0[0] - rx, c0[1] + ry); ctx.stroke(); });
    ctx.restore(); }
  // the way each cart went on its failed run, as a line of small dots
  function dots(ctx, kk){ ctx.save(); ctx.fillStyle = 'rgba(255,120,60,0.9)'; var seen = {};
    path.forEach(function(p){ if (seen[p]) return; seen[p] = 1; var q = R.at(p), c = R.scr(q[0], q[1], DECK + 0.24); ctx.beginPath(); ctx.arc(c[0], c[1], Math.max(2, kk * 1.1), 0, 7); ctx.fill(); });
    ctx.restore(); }
  function drawSwitch(ctx, kk, o, b){ var q = R.at(o.i), z = DECK + 0.26, c = R.scr(q[0], q[1], z);
    function edge(d, f){ return R.scr(q[0] + DIRS[d][0] * T * f, q[1] + DIRS[d][1] * T * f, z); }
    var lw = Math.max(3, Math.round(kk * 2.2)), on = o.ways[b], off = o.ways[1 - b], s0 = edge(o.stem, 0.5), w1 = edge(on, 0.5);
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // the way it is set, glowing gold from the stem through the middle
    [['rgba(40,24,6,0.8)', lw + Math.max(2, Math.round(kk * 1.4))], ['#ffd23a', lw]].forEach(function(stk){ ctx.strokeStyle = stk[0]; ctx.lineWidth = stk[1]; ctx.beginPath(); ctx.moveTo(s0[0], s0[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(w1[0], w1[1]); ctx.stroke(); });
    // the other way, barred in red
    var dx = DIRS[off][1], dy = DIRS[off][0], e1 = R.scr(q[0] + DIRS[off][0] * T * 0.36 + dx * T * 0.2, q[1] + DIRS[off][1] * T * 0.36 + dy * T * 0.2, z), e2 = R.scr(q[0] + DIRS[off][0] * T * 0.36 - dx * T * 0.2, q[1] + DIRS[off][1] * T * 0.36 - dy * T * 0.2, z);
    [['rgba(40,10,6,0.8)', lw + Math.max(2, Math.round(kk * 1.2))], ['#e5483a', lw]].forEach(function(stk){ ctx.strokeStyle = stk[0]; ctx.lineWidth = stk[1]; ctx.beginPath(); ctx.moveTo(e1[0], e1[1]); ctx.lineTo(e2[0], e2[1]); ctx.stroke(); });
    // the disc: its kind's colour, an arrow the way it is set
    var cx = R.scr(q[0] + T * 0.22, q[1], z), cy = R.scr(q[0], q[1] + T * 0.22, z), rx = Math.abs(cx[0] - c[0]), ry = Math.abs(cy[1] - c[1]), kc = KCOL[o.t] || KCOL.p;
    ctx.fillStyle = kc[0]; ctx.strokeStyle = 'rgba(20,12,4,0.9)'; ctx.lineWidth = Math.max(1.5, kk * 0.9); ctx.beginPath(); ctx.ellipse(c[0], c[1], rx, ry, 0, 0, 7); ctx.fill(); ctx.stroke();
    var a0 = R.scr(q[0] - DIRS[on][0] * T * 0.1, q[1] - DIRS[on][1] * T * 0.1, z), a1 = R.scr(q[0] + DIRS[on][0] * T * 0.15, q[1] + DIRS[on][1] * T * 0.15, z), px = DIRS[on][1], py = DIRS[on][0];
    var h1 = R.scr(q[0] + DIRS[on][0] * T * 0.04 + px * T * 0.1, q[1] + DIRS[on][1] * T * 0.04 + py * T * 0.1, z), h2 = R.scr(q[0] + DIRS[on][0] * T * 0.04 - px * T * 0.1, q[1] + DIRS[on][1] * T * 0.04 - py * T * 0.1, z);
    ctx.strokeStyle = kc[1]; ctx.lineWidth = Math.max(1.5, kk * 1.1); ctx.beginPath(); ctx.moveTo(a0[0], a0[1]); ctx.lineTo(a1[0], a1[1]); ctx.moveTo(h1[0], h1[1]); ctx.lineTo(a1[0], a1[1]); ctx.lineTo(h2[0], h2[1]); ctx.stroke();
    // a sprung switch's home way: a small blue pip at its edge
    if (o.t === 's'){ var hp = edge(o.ways[o.home], 0.44); ctx.fillStyle = '#2f86ff'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1, kk * 0.6); ctx.beginPath(); ctx.arc(hp[0], hp[1], Math.max(2.5, kk * 1.3), 0, 7); ctx.fill(); ctx.stroke(); }
    ctx.restore(); }
  // the tiles worth a gold ring: the switches, and Go while he plans
  function hot(s){ return moves(G, s); }
  return { lay:lay, move:move, things:things, ground:ground, over:over, hot:hot }; }

var RTT = root.RTT_GYMKIND_RAILYARD = { id:'railyard', gyms:GYMS, input:'tap', calm:true, parse:parse, init:init, key:key, act:act, tap:tap, moves:moves, won:won, proof:proof, enc:enc,
  stuck:stuck, go:go, goal:goal, runLine:runLine,
  hello:'Tap a switch to throw it. Tap Go to send a cart. Undo takes one back.', unit:'tap',
  dur:function(how){ return how === 'pull' ? 0.32 : how === 'crash' ? 0.45 : how === 'in' || how === 'stop' ? 0.3 : how === 'flip' || how === 'home' ? 0.12 : G_TICK; },
  floor:floor, mats:mats, view:view };
})();
