/* golf/putt/gymkinds/lantern.js: the NIGHT WATCH kind of trail gym (RTT_GYMKIND_LANTERN), London's. A kind file: the registry
   (gyms.js, its KINDS README) finds it by its global, the frame (trail.js) plays it, check-putt proves it.

   THE PUZZLE is a heist turned round. Arsene Lupin has hidden what he stole about a dark warehouse, and his men walk it as night
   watchmen, each with a bull's-eye lantern. Every jewel is to be picked up before the strongbox (the vault) will open. Each
   watchman walks his own beat, a tile a step, the way he is facing; at the end of it he turns about where he stands, which takes
   him a step. His lantern lights his own tile and the four tiles in front of him, up to a crate or a wall. A step that would end
   in a lantern's light is not taken: he would be seen there. Nobody moves while he stands still, so the read is the watchmen's
   beats, and the order and the moment to cross each one.

   THE GATEKEEPER'S TWIST is the Ice Age's ice, as the gallery's polished floor: step onto it and he slides on till something
   stops him, over tile after tile in a single step, so a hall a lantern sweeps can be crossed between two of its steps. A watchman
   never walks on the polish.

   He moves TILE BY TILE (a step kind).

   THE LAYOUTS ARE HAND DESIGNED, never random. Row 0 is the far wall (the top of the screen), the last row the near wall with the
   gate in it. The frame's five characters (# G @ L C, gyms.js) and this kind's own:
     .  the floor        o  a crate (in the way, and the light stops at it)        j  a jewel to pick up
     ^ > v <  a watchman on the floor there, facing and walking up, right, down or left        i  polished floor (the gatekeeper's)
   THE STATE is { p, f, k }: his tile, the jewels picked up (a bit each) and the watch's clock, the steps taken counted round its
   period (every beat comes back to where it began). A few thousand states, so solve() and audit() are the registry's own breadth
   first search (lib), and stuck() is looked up from one search of every state. */
(function(){
var root = typeof window !== 'undefined' ? window : globalThis;
var LIB = function(){ return root.RTT_PUTT_GYMS.lib; };

/* THE GYMS. moves and proof are the solver's fewest steps and one shortest solution (U R D L), recorded from solve().
   The civilian's lines nudge, never solve. */
var GYMS = [
/* THE NIGHT WATCH, mid-world: a dark warehouse by the docks where Lupin's men keep watch, four of them on their beats, and three
     jewels to take back. The lesson is the kind's one rule: they take a step each time you do, and their light is where you must
     never stop. */
  { id:'ld1', kind:'lantern', world:'london', leg:9, name:'The Night Watch', badge:'Night Watch Badge', mech:['lantern'], pay:500, look:{ wall:'stone' },
    moves:28, proof:'UUUUDUDLLLUUURRRRRRRULULLULU',
    who:{ look:{ skin:'light', polo:'navy', hat:'navy', pants:'navy', hair:'brown', hairStyle:'short', cap:true, shoes:'black', gender:'male' } },
    say:['The watchmen take a step each time you do. Watch one go round his beat.',
      'A lantern lights the tiles in front of him, as far as a crate. Stand where it cannot reach.',
      'Stepping back and forth is a way to wait. He keeps walking while you do.'],
    rows:[
      '#####C#####',
      '#..o.j.o..#',
      '#v.......o#',
      '#...ooo...#',
      '#........j#',
      '#o.<..o...#',
      '#...o.o..^#',
      '#.j.......#',
      '#o...>..o.#',
      '#o.......o#',
      '#L...@....#',
      '#####G#####'
    ] },
  /* LUPIN'S HEIST, the gatekeeper: the gallery of a great house the night Lupin's men come for its jewels, and the polished floor of
     its long gallery, the Ice Age's ice as the house's parquet. Four lanterns cross the gallery in turn, so no walk up it goes unseen;
     a slide up the polish is a single step. It cannot be solved with the polish walked like the boards. Its hint is the one idea the
     room turns on, and nothing more. */
  { id:'ld2', kind:'lantern', world:'london', leg:18, name:'Lupin’s Heist', badge:'Gentleman Thief Badge', mech:['lantern', 'ice'], pay:1000, keeper:true, look:{ wall:'stone' },
    hint:'A lantern only catches you where you stop. On the polish you can pass right through its light and stop beyond it.',
    moves:40, proof:'RRRRUUULLLLUURRRURDLLLDLDLLDUDULRRRUUUUU',
    who:{ look:{ skin:'light', polo:'purple', hat:'black', pants:'black', hair:'brown', hairStyle:'bun', cap:true, shoes:'black', gender:'female' } },
    say:['The polish is slick. Step onto it and you slide till something stops you.',
      'Nobody walks the gallery unseen. Every tile of it is somebody’s at some moment.',
      'Lupin planned this to the second. Every lantern has a moment when it looks away.'],
    rows:[
      '#####C#####',
      '#.........#',
      '#o.>..o..j#',
      '#......v..#',
      '#ooo...ooo#',
      '#oo>.ioooo#',
      '#ooooi.>oo#',
      '#oo.<ioooo#',
      '#ooooi<.oo#',
      '#.j.......#',
      '#o..v..o..#',
      '#.....o...#',
      '#L...@...j#',
      '#####G#####'
    ] }
];

var DIRC = '^>v<', REACH = 4;
var PARSED = {};
function gcd(a, b){ return b ? gcd(b, a % b) : a; }
function parse(G){ if (PARSED[G.id]) return PARSED[G.id]; var jewels = [], men = [];
  var Q = LIB().room(G, function(ch, i){ if (ch === 'j') jewels.push(i); else if (DIRC.indexOf(ch) >= 0) men.push([i, DIRC.indexOf(ch)]); else if ('oi'.indexOf(ch) < 0) return false; });
  men.forEach(function(m){ Q.cell[m[0]] = '.'; });
  Q.jewels = jewels; Q.full = (1 << jewels.length) - 1;
  // each watchman's beat, played out step by step until it comes round: his tile and his facing at every tick of it
  Q.beats = men.map(function(m){ var p = m[0], d = m[1], seq = [], seen = {};
    while (seen[p + ':' + d] == null){ seen[p + ':' + d] = seq.length; seq.push([p, d]); var n = LIB().nb(Q, p, d); if (walk(Q, n)) p = n; else d = (d + 2) % 4; }
    return seq; });
  Q.per = Q.beats.reduce(function(a, b){ return a * b.length / gcd(a, b.length); }, 1);
  Q.lit = {}; return PARSED[G.id] = Q; }
// can a watchman walk onto tile i (plain floor or a jewel; never the polish, a crate or the frame's tiles)
function walk(Q, i){ if (i < 0) return false; var ch = Q.cell[i]; return ch === '.' || ch === 'j'; }
// can he stand on tile i
function stand(Q, i){ if (i < 0) return false; var ch = Q.cell[i]; return ch === '.' || ch === 'j' || ch === 'i'; }
// does a lantern's light stop at tile i
function opaque(Q, i){ if (i < 0) return true; var ch = Q.cell[i]; return ch === '#' || ch === 'o' || ch === 'G' || ch === 'L' || ch === 'C'; }
// where every watchman is at tick k: [[tile, facing], ...]
function men(Q, k){ return Q.beats.map(function(b){ return b[k % b.length]; }); }
// the tiles lit at tick k (each watchman's own, and REACH tiles ahead of him up to a crate or a wall): { tile:1 }
function lit(Q, k){ if (Q.lit[k]) return Q.lit[k]; var L = LIB(), on = {};
  men(Q, k).forEach(function(m){ on[m[0]] = 1; var at = m[0]; for (var r = 0; r < REACH; r++){ at = L.nb(Q, at, m[1]); if (opaque(Q, at)) break; on[at] = 1; } });
  return Q.lit[k] = on; }
function init(G){ var Q = parse(G); return { p:Q.start, f:0, k:0 }; }
function key(s){ return s.p + ':' + s.f + ':' + s.k; }
function pick(Q, f, i){ var kj = Q.jewels.indexOf(i); return kj >= 0 ? f | (1 << kj) : f; }
/* ONE STEP. The frame's tiles first (the gate, the lever, the vault, shut till every jewel is picked up). He never walks into a
   watchman. Onto the polish he slides on till something stops him. Then the watch takes its step, and a step that ends in a
   lantern's light is not taken. */
function act(G, s, dir){ var Q = parse(G), L = LIB(), n = L.nb(Q, s.p, dir);
  if (n >= 0 && n === Q.chest && s.f !== Q.full) return { s:s, ev:'shut', moves:[] };
  var fr = L.frameStep(G, Q, s, s.p, dir, init); if (fr) return fr;
  if (!stand(Q, n)) return { s:s, ev:'bump', moves:[] };
  var now = men(Q, s.k), on = function(i){ return now.some(function(m){ return m[0] === i; }); };
  if (on(n)) return { s:s, ev:'guard', moves:[] };
  var mv = [['me', s.p, n, 'walk']], at = n, ev = 'step';
  while (Q.cell[at] === 'i'){ var a1 = L.nb(Q, at, dir); if (!stand(Q, a1) || on(a1)) break; mv.push(['me', at, a1, 'slide']); at = a1; ev = 'slide'; }
  var k1 = (s.k + 1) % Q.per; if (lit(Q, k1)[at]) return { s:s, ev:'seen', moves:[] };
  var f = pick(Q, s.f, at); if (f !== s.f){ mv.push(['jewel', at, at, 'pick']); if (ev === 'step') ev = 'jewel'; }
  mv.push(['watch', s.k, k1, 'walk']);
  return { s:{ p:at, f:f, k:k1 }, ev:ev, moves:mv }; }
function moves(){ return [0, 1, 2, 3]; }
/* STUCK, looked up: every state a player can reach is searched once (lib.explore), and those the vault can still be reached from
   without the lever are kept; any other state is stuck. */
var GOOD = {};
function goodOf(G){ if (GOOD[G.id]) return GOOD[G.id]; var K = root.RTT_GYMKIND_LANTERN, X = LIB().explore(K, G), N = X.list.length, back = [], i, ok = {};
  for (i = 0; i < N; i++) back.push([]); X.edges.forEach(function(e){ if (!e[2]) back[e[1]].push(e[0]); });
  var good = new Uint8Array(N), q = X.wins.map(function(w){ return w[0]; }); q.forEach(function(w){ good[w] = 1; });
  for (var hh = 0; hh < q.length; hh++) back[q[hh]].forEach(function(pp){ if (!good[pp]){ good[pp] = 1; q.push(pp); } });
  for (i = 0; i < N; i++) if (good[i]) ok[key(X.list[i])] = 1; return GOOD[G.id] = ok; }
function stuck(G, s){ return !goodOf(G)[key(s)]; }
function proof(G){ return (G.proof || '').split('').map(function(ch){ return 'URDL'.indexOf(ch); }); }
function enc(path){ return path.map(function(d){ return 'URDL'.charAt(d); }).join(''); }
function goal(){ return 'Pick up every jewel unseen. Then reach the strongbox.'; }

/* ---- THE LOOK: the warehouse floor is old boards in the dark, the gallery's polish a pale gleaming parquet, a crate a stout tea
   chest. A watchman is one of Lupin's men in a watchman's caped coat and cap, his bull's-eye lantern held out the way he faces,
   and its light lies on the floor in a warm wash, tile by tile, as far as it reaches. A jewel is a cut gem glinting on the boards. */
var DECK = 0.45;
function floor(gc){ if (gc.k === '#') return null; return { h:DECK, mat:['ldwfloor', { gu:gc.u, gv:gc.v, wk:gc.k === 'i' ? 1 : 0 }] }; }
function mats(){ return {
  ldwfloor:['', '', '', 0, function(c, R, h3){ var u = c.gu || 0, v = c.gv || 0, k = c.wk || 0, n = h3(c.ti, c.tj, 377);
    if (c.dt < 0) return R('#1a1410');
    if (k === 1){ var pq = (Math.floor(u * 4) + Math.floor(v * 4)) % 2; if (u < 0.03 || u > 0.97 || v < 0.03 || v > 0.97) return R('#6a5a3e'); return R(n > 0.93 ? '#fff8e0' : pq ? '#c8b48a' : '#a8946a'); }
    if (u < 0.03 || u > 0.97 || v < 0.03 || v > 0.97) return R('#120c08'); var pl = Math.floor(v * 3) % 2; return R(n > 0.95 ? '#4a3a24' : pl ? '#2a2016' : '#32261a'); }] }; }

function manFn(d){ var V = [[0, -1], [1, 0], [0, 1], [-1, 0]][d], ux = V[0], uy = V[1]; return function(B){
  B.solid(-0.8, -0.8, 0, 0.8, 0.8, 2.3, function(x, y, z){ var r = Math.hypot(x, y), f = x * ux + y * uy, sd = -x * uy + y * ux, lx = x - ux * 0.46, ly = y - uy * 0.46;
    if (Math.abs(lx) < 0.13 && Math.abs(ly) < 0.13 && z > 0.92 && z < 1.22) return z > 1.16 || z < 0.97 ? '#c8a040' : f > 0.5 ? '#fff4c0' : '#ffd870';   // the bull's-eye lantern, lit on its front
    if (z < 0.55) return Math.abs(Math.abs(sd) - 0.12) < 0.08 && Math.abs(f) < 0.1 ? '#16161a' : null;   // his legs
    if (z < 1.35) return r < 0.28 - (1.35 - z) * 0.05 ? (Math.abs(sd) < 0.03 && f > 0.2 ? '#c8a040' : '#3a4a5c') : null;   // the long coat, its brass buttons
    if (z < 1.62) return r < 0.4 - (z - 1.35) * 0.6 ? '#2a3644' : null;   // the cape over his shoulders
    if (z < 1.98) return Math.hypot(x, y, z - 1.8) < 0.18 ? (f > 0.1 && Math.abs(sd) < 0.12 && z < 1.82 ? '#3a2a1a' : '#e0b890') : null;   // his face and whiskers
    if (z < 2.1) return r < 0.2 || (f > 0 && f < 0.3 && Math.abs(sd) < 0.14 && z < 2.0) ? '#141418' : null;   // the peaked cap
    return null; }, 0.05); }; }
function jewelFn(B){ B.solid(-0.4, -0.4, 0, 0.4, 0.4, 0.7, function(x, y, z){ var r = Math.abs(x) + Math.abs(y) + Math.abs(z - 0.32) * 0.9; if (r > 0.28) return null; return z > 0.4 ? '#dff8ff' : x + y > 0 ? '#3ac8e8' : '#1a7aa8'; }, 0.035); }
function crateFn(B){ B.solid(-0.75, -0.75, 0, 0.75, 0.75, 1.1, function(x, y, z){ var ax = Math.abs(x), ay = Math.abs(y); if (ax > 0.66 || ay > 0.66 || z > 1.02) return null;
    if ((ax > 0.58 && ay > 0.58) || z > 0.96 && (ax > 0.58 || ay > 0.58)) return '#4a3018'; if (z > 0.96) return Math.abs(x - y * 0.2) < 0.06 ? '#5a3a20' : '#b8925a';
    if (Math.abs(z - 0.5) < 0.04) return '#5a3a20'; return Math.sin(z * 30) > 0.8 ? '#7a5a32' : '#8a6a3a'; }, 0.06); }

function view(R){ var Q = R.Q, T = R.T, ctx = R.ctx, s0 = null, tick = null, spJ = R.sprite('gymldjewel', jewelFn, 0.8, 0.8, 0.7), spO = R.sprite('gymldcrate', crateFn, 1.6, 1.6, 1.1), spM = [];
  for (var d = 0; d < 4; d++) spM.push(R.sprite('gymldman' + d, manFn(d), 1.6, 1.6, 2.4));
  var Z = DECK + 0.012; function P(x, y){ return R.scr(x, y, Z); }
  function wash(i, a){ var c = i % Q.W, r = (i / Q.W) | 0, x0 = R.x0 + c * T, y0 = R.y0 + r * T, p = [P(x0 + 0.04 * T, y0 + 0.04 * T), P(x0 + 0.96 * T, y0 + 0.04 * T), P(x0 + 0.96 * T, y0 + 0.96 * T), P(x0 + 0.04 * T, y0 + 0.96 * T)];
    ctx.fillStyle = 'rgba(255,222,130,' + a.toFixed(2) + ')'; ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); for (var j = 1; j < 4; j++) ctx.lineTo(p[j][0], p[j][1]); ctx.closePath(); ctx.fill(); }
  // where each watchman stands now, between two ticks while the watch takes its step
  function stand(k0, k1, u){ var a = men(Q, k0), b = men(Q, k1); return a.map(function(m, w){ var p = R.at(m[0]), q = R.at(b[w][0]); return { x:p[0] + (q[0] - p[0]) * u, y:p[1] + (q[1] - p[1]) * u, d:u < 0.5 ? m[1] : b[w][1] }; }); }
  return {
    lay:function(s){ s0 = s; tick = null; },
    move:function(m, u){ if (m[0] === 'jewel'){ if (u >= 1){ var w = R.at(m[1]); R.burst(w[0], w[1], DECK + 0.6, ['#bff4ff', '#3ac8e8', '#ffffff'], 14, 0.8, 0.8); R.sfx('blip'); } return; }
      if (m[0] === 'watch') tick = u < 1 ? [m[1], m[2], u] : null; },
    things:function(ds){ if (!s0) return; var s = s0, at = tick ? stand(tick[0], tick[1], tick[2]) : stand(s.k, s.k, 0), on = lit(Q, tick && tick[2] > 0.5 ? tick[1] : s.k);
      // the lanterns' light on the floor, under everything that stands
      Object.keys(on).forEach(function(k){ var i = +k, q = R.at(i); ds.push({ x:q[0], y:q[1] - T * 0.49, kd:function(){ wash(i, 0.56); } }); });
      for (var i = 0; i < Q.cell.length; i++){ (function(i){ var ch = Q.cell[i], w = R.at(i);
        if (ch === 'o') ds.push({ x:w[0], y:w[1], kd:function(){ R.drawSprite(spO, w[0], w[1], DECK); } });
        else if (ch === 'j' && !(s.f >> Q.jewels.indexOf(i) & 1)) ds.push({ x:w[0], y:w[1], kd:function(){ R.drawSprite(spJ, w[0], w[1], DECK); } }); })(i); }
      at.forEach(function(m){ ds.push({ x:m.x, y:m.y, kd:function(){ R.drawSprite(spM[m.d], m.x, m.y, DECK); } }); }); },
    ground:function(){},
    hot:function(){ return []; } }; }

root.RTT_GYMKIND_LANTERN = { id:'lantern', gyms:GYMS, input:'step', calm:true, unit:'step', hello:'Keep out of the lanterns. The watchmen take a step each time you do.',
  parse:parse, init:init, key:key, act:act, step:act, moves:moves, stuck:stuck, proof:proof, enc:enc, goal:goal, men:men, lit:lit,
  me:function(G, s){ return s.p; }, place:function(G, s, i){ return { p:i, f:s.f, k:s.k }; },
  deck:function(G, s, i){ var Q = parse(G); return stand(Q, i) || i === Q.lever; },
  tell:{ seen:'Not there. His lantern would catch you.', guard:'A watchman stands there. Go round him.', jewel:'A jewel. Got it.', slide:'The polish takes you. You slide till something stops you.', shut:'Not yet. Pick up every jewel first.',
    stuck:'You cannot get past them from here. Undo it, or Restart.' },
  dur:function(how){ return how === 'slide' ? 0.09 : how === 'pick' ? 0.05 : 0.15; },
  floor:floor, mats:mats, view:view };
})();
