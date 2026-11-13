/* golf/putt/gymkinds/giant.js: the GIANT kind of trail gym (RTT_GYMKIND_GIANT), the Beanstalk's. A kind file: the registry (gyms.js,
   its KINDS README) finds it by its global, the frame (trail.js) plays it, check-putt proves it.

   THE PUZZLE is Jack's in the giant's house ("Jack and the Beanstalk", Joseph Jacobs 1890 and Benjamin Tabart 1807). "Fee-fi-fo-fum,
   I smell the blood of an Englishman": the giant smells him out, and for every step Jack takes the giant takes TWO great strides
   after him. Each stride he goes the way that brings him nearest: across the room first, if a stride across brings him closer and
   nothing stands in his way, and otherwise up or down the room, if that brings him closer; if neither does, he stands where he
   is. So he is quick and he is stupid. A great stone, the table or the oven stops him as it stops Jack, and a giant who has to go
   round a thing will not, so Jack can hide behind one and let him come up against it. Catch Jack he must not: a stride onto Jack's
   tile ends the run (Restart lights). Every bag of gold has to be picked up (step onto it) before the way home opens: the vault is
   the top of the beanstalk.

   THE GATEKEEPER'S TWIST is Ice Age's ice, as the giant's wet-scrubbed flagstones: step onto them and Jack slides on the way he went
   until something stops him (a wall, a stone, the edge of the flags, onto dry floor at their far side), and the giant, in his
   great boots, walks across them as on any floor. And the golden harp: the giant is asleep until Jack lifts it, and then it cries
   "Master! Master!" and he wakes.

   He moves TILE BY TILE (a step kind). A bump into a wall or a stone is no step, and the giant does not move either.

   THE LAYOUTS ARE HAND DESIGNED, never random. Row 0 is the far wall (the top of the screen), the last row the near wall with the
   gate in it. The frame's five characters (# G @ L C, gyms.js) and this kind's own:
     s  a great stone, the table or the oven (stops both)    b  a bag of gold    h  the golden harp    i  wet flagstones (Jack slides)
     Z  where the giant stands at the start (Y: the same, asleep until the harp is lifted)
   THE STATE is { p, g, b, a, h, c }: Jack's tile, the giant's, the bags taken (a bit each), whether the giant is awake, whether
   Jack holds the harp, and whether he has been caught. A few tens of thousands of states, so solve() and audit() are the
   registry's own breadth first search (lib), and stuck() is looked up from one search of every state. */
(function(){
var root = typeof window !== 'undefined' ? window : globalThis;
var LIB = function(){ return root.RTT_PUTT_GYMS.lib; };

/* THE GYMS. moves and proof are the solver's fewest steps and one shortest solution (U R D L), recorded from solve().
   The civilian's lines nudge, never solve. */
var GYMS = [
  /* THE GIANT'S KITCHEN, mid-world: two bags of gold just inside the door, the giant by the oven, and the great stones of the
     kitchen (the table, the woodpile, the copper) between Jack and the beanstalk. The gold is easy; getting home past him is not.
     The lesson is his rule and nothing more: he always comes the nearest way, so a stone between you is a wall he walks into, and
     the oven and the copper are ways through that only Jack fits. */
  { id:'bn1', kind:'giant', world:'beanstalk', leg:9, name:'The Giant’s Kitchen', badge:'Bag of Gold Badge', mech:['giant'], pay:500, strides:2, look:{ wall:'stone' },
    moves:26, proof:'UUULLUUDDRRURRRDDUULUULLUU',
    who:{ look:{ skin:'light', polo:'red', hat:'white', pants:'black', hair:'brown', hairStyle:'bun', cap:false, shoes:'black', gender:'female' } },
    say:['He takes two strides for every step you take. He always comes the nearest way.',
      'A great stone between you and him is a wall he walks straight into. Let him.',
      'Lead him where you want him, then go round the other side.'],
    rows:[
      '#####C#####',
      '#...s.s...#',
      '#........s#',
      '#.s.....s.#',
      '#...s.oZ.s#',
      '#...o.s..s#',
      '#.s..b.s..#',
      '#.s..b....#',
      '#L...@....#',
      '#####G#####'
    ] },
  /* THE GOLDEN HARP, the gatekeeper: the giant asleep by the bag of gold he was counting, the harp just inside the door, a second bag
     in the middle of the hall and two runs of wet flags. The harp is in reach at once, but lifting it wakes him, and from then on
     both bags have to be had under his nose: the wet flags carry Jack past him faster than he can stride (its hint, held against
     its proof: of the proof's four slides, the last two are taken with the giant two tiles and then one tile away). */
  { id:'bn2', kind:'giant', world:'beanstalk', leg:18, name:'The Golden Harp', badge:'Golden Harp Badge', mech:['giant', 'ice'], pay:1000, keeper:true, strides:2, look:{ wall:'stone' },
    hint:'He only walks, even on the wet flags. Let him come close to them, then slide away where his strides cannot follow.',
    moves:48, proof:'ULLLLUUUURRRRLDLDDRRRURLDLRURULUULULUURRRRRDULLU',
    who:{ look:{ skin:'light', polo:'white', hat:'white', pants:'brown', hair:'grey', hairStyle:'short', cap:false, shoes:'brown', gender:'male' } },
    say:['The giant is asleep. The harp will wake him when you lift it.',
      'On the wet flags you slide until something stops you. He just walks.',
      'Think about where he will be when the harp cries out. Then think about the way home.'],
    rows:[
      '#####C#####',
      '#.........#',
      '#...s.Ybs.#',
      '#....ss...#',
      '#.siiii...#',
      '#....b....#',
      '#....ss...#',
      '#...siii..#',
      '#......s..#',
      '#h....s...#',
      '#L...@....#',
      '#####G#####'
    ] }
];

var PARSED = {};
function parse(G){ if (PARSED[G.id]) return PARSED[G.id]; var bags = [], gs = -1, sleep = false, harp = -1;
  var Q = LIB().room(G, function(ch, i){ if (ch === 'b') bags.push(i); else if (ch === 'h') harp = i; else if (ch === 'Z' || ch === 'Y'){ gs = i; sleep = ch === 'Y'; } else if ('sio'.indexOf(ch) < 0) return false; });
  Q.bags = bags; Q.full = (1 << bags.length) - 1; Q.g0 = gs; Q.sleep = sleep; Q.harp = harp; if (gs >= 0) Q.cell[gs] = '.'; return PARSED[G.id] = Q; }
function init(G){ var Q = parse(G); return { p:Q.start, g:Q.g0, b:0, a:Q.sleep ? 0 : 1, h:Q.harp < 0 ? 1 : 0, c:0 }; }
function key(s){ return s.p + ':' + s.g + ':' + s.b + ':' + s.a + s.h + s.c; }
// can Jack stand on tile n (free); can the giant (big: never in the oven or the copper, which Jack fits)
function free(Q, n){ if (n < 0) return false; var ch = Q.cell[n]; return ch !== '#' && ch !== 's' && n !== Q.lever && n !== Q.chest && n !== Q.gate; }
function big(Q, n){ return free(Q, n) && Q.cell[n] !== 'o'; }
var DR = [[0, -1], [1, 0], [0, 1], [-1, 0]];
/* ONE STRIDE OF THE GIANT'S toward Jack: across if that brings him nearer and he can, else up or down if that does, else none */
function stride(Q, g, p){ var gc = g % Q.W, gr = (g / Q.W) | 0, pc = p % Q.W, pr = (p / Q.W) | 0;
  if (pc !== gc){ var n = g + (pc > gc ? 1 : -1); if (big(Q, n)) return n; }
  if (pr !== gr){ var m = g + (pr > gr ? Q.W : -Q.W); if (big(Q, m)) return m; }
  return g; }
/* ONE STEP. The frame's tiles first (the gate, the lever, the vault, which stays shut till every bag and the harp are his); then
   the step, the slide over wet flags, what he picks up, and the giant's two strides after him. */
function act(G, s, dir){ var Q = parse(G), L = LIB(), n = L.nb(Q, s.p, dir);
  if (s.c) return { s:s, ev:'bump', moves:[] };
  if (n >= 0 && n === Q.chest && (s.b !== Q.full || !s.h)) return { s:s, ev:'shut', moves:[] };
  var f = L.frameStep(G, Q, s, s.p, dir, init); if (f) return f;
  if (!free(Q, n)) return { s:s, ev:'bump', moves:[] };
  var mv = [['me', s.p, n, 'walk']], p = n, guard = 0, ev = 'step';
  while (Q.cell[p] === 'i' && guard++ < 30){ var m2 = L.nb(Q, p, dir); if (!free(Q, m2) || m2 === s.g) break; mv.push(['me', p, m2, 'slide']); p = m2; ev = 'slide'; }
  var b = s.b, a = s.a, h = s.h, g = s.g;
  [n].concat(mv.slice(1).map(function(q){ return q[2]; })).forEach(function(t){ var k = Q.bags.indexOf(t); if (k >= 0 && !(b >> k & 1)){ b |= 1 << k; mv.push(['bag', t, t, 'take']); ev = 'gold'; } });
  if (p === g || n === g) return { s:{ p:p, g:g, b:b, a:a, h:h, c:1 }, ev:'caught', moves:mv };
  if (!h && p === Q.harp){ h = 1; a = 1; mv.push(['harp', p, p, 'take']); ev = 'harp'; }
  else if (!h && mv.some(function(q){ return q[2] === Q.harp; })){ h = 1; a = 1; mv.push(['harp', Q.harp, Q.harp, 'take']); ev = 'harp'; }
  if (a && s.a){ for (var k2 = 0; k2 < (G.strides || 1); k2++){ var g2 = stride(Q, g, p); if (g2 !== g) mv.push(['giant', g, g2, 'stride']); g = g2; if (g === p) return { s:{ p:p, g:g, b:b, a:a, h:h, c:1 }, ev:'caught', moves:mv }; } }
  return { s:{ p:p, g:g, b:b, a:a, h:h, c:0 }, ev:ev, moves:mv }; }
function moves(){ return [0, 1, 2, 3]; }
/* STUCK, looked up: every state a player can reach is searched once (lib.explore), and those the vault can still be reached
   from without the lever are kept; any other state (caught, or with no way left to the vault) is stuck, and Restart lights. */
var GOOD = {};
function goodOf(G){ if (GOOD[G.id]) return GOOD[G.id]; var K = root.RTT_GYMKIND_GIANT, X = LIB().explore(K, G), N = X.list.length, back = [], i, ok = {};
  for (i = 0; i < N; i++) back.push([]); X.edges.forEach(function(e){ if (!e[2]) back[e[1]].push(e[0]); });
  var good = new Uint8Array(N), q = X.wins.map(function(w){ return w[0]; }); q.forEach(function(w){ good[w] = 1; });
  for (var hh = 0; hh < q.length; hh++) back[q[hh]].forEach(function(pp){ if (!good[pp]){ good[pp] = 1; q.push(pp); } });
  for (i = 0; i < N; i++) if (good[i]) ok[key(X.list[i])] = 1; return GOOD[G.id] = ok; }
function stuck(G, s){ return !goodOf(G)[key(s)]; }
function proof(G){ return (G.proof || '').split('').map(function(ch){ return 'URDL'.indexOf(ch); }); }
function enc(path){ return path.map(function(d){ return 'URDL'.charAt(d); }).join(''); }
function goal(G){ return parse(G).harp >= 0 ? 'Take the gold and the harp. Then climb home.' : 'Take every bag of gold. Then climb home.'; }

/* ---- THE LOOK: the giant's floor of great grey flagstones, their joints wandering (warped, never a grid), the wet flags dark and
   shining. A great stone is a grey block as high as Jack; a bag of gold a fat sack tied at the neck; the harp a golden harp on its
   foot. The giant is a great man three times Jack's height in a green coat, his beard, his club, who sleeps sitting down until he
   wakes. Over Jack rides what he carries: a bag, the harp. */
var DECK = 0.45;
function floor(gc){ if (gc.k === '#') return null; var k = gc.k === 'i' ? 1 : 0;
  return { h:DECK, mat:['gtfloor', { gu:gc.u, gv:gc.v, gk:k, gr:gc.r, gc:gc.c }] }; }
function mats(){ return {
  gtfloor:['', '', '', 0, function(c, R, h3){ var n = h3(c.ti, c.tj, 151), w = Math.sin(c.ti * 0.13 + Math.sin(c.tj * 0.11) * 2.2), w2 = Math.sin(c.tj * 0.12 - Math.sin(c.ti * 0.09) * 2);
    var joint = Math.abs(w) < 0.06 || Math.abs(w2) < 0.06;
    if (c.gk === 1){ var sh = Math.sin(c.ti * 0.21 + c.tj * 0.17) + Math.sin(c.tj * 0.23 - c.ti * 0.07); return R(joint ? '#3a4048' : sh > 1.3 ? '#e8f0f8' : sh > 0.7 ? '#8a98a8' : '#5e6a78'); }
    if (c.dt < 0) return R('#4a4640'); return R(joint ? '#5a564e' : n > 0.92 ? '#b4ae9e' : w > 0.5 ? '#9c978a' : w2 > 0.4 ? '#8e897c' : '#968f82'); }] }; }

function giantFn(sit){ return function(B){ B.vox(-1.4, -1.4, 0, 1.4, 1.4, 4.6, function(set){
  if (sit){ B.blob(set, -0.2, 0, 1.0, 0.8, 0.7, 0.9, '#4a6a32'); B.tube(set, 0.1, -0.35, 0.35, 1.1, -0.4, 0.25, 0.25, 0.2, '#5a4a2a'); B.tube(set, 0.1, 0.35, 0.35, 1.1, 0.4, 0.25, 0.25, 0.2, '#5a4a2a');
    B.blob(set, 0.15, 0, 2.15, 0.55, 0.55, 0.55, function(x, y, z){ return x > 0.25 && z < 2.1 ? '#7a4a2a' : '#e8b890'; }); B.tube(set, 0.5, -0.9, 0.9, 0.6, 0.9, 1.0, 0.12, 0.12, '#6a4a2a'); return; }
  B.tube(set, 0, -0.32, 0, 0, -0.32, 1.5, 0.26, 0.24, '#5a4a2a'); B.tube(set, 0, 0.32, 0, 0, 0.32, 1.5, 0.26, 0.24, '#5a4a2a');
  B.blob(set, 0, 0, 2.35, 0.7, 0.8, 1.0, function(x, y, z){ return Math.abs(z - 1.7) < 0.08 ? '#3a2410' : '#4a6a32'; });
  B.tube(set, 0, -0.85, 3.0, 0.4, -1.05, 1.9, 0.2, 0.18, '#4a6a32'); B.tube(set, 0, 0.85, 3.0, 0.5, 1.0, 2.0, 0.2, 0.18, '#4a6a32');
  B.tube(set, 0.5, 1.05, 1.6, 0.9, 1.1, 3.4, 0.14, 0.2, '#6a4a2a');   // his club
  B.blob(set, 0.05, 0, 3.75, 0.5, 0.5, 0.55, function(x, y, z){ if (x > 0.32 && Math.abs(z - 3.85) < 0.06 && Math.abs(Math.abs(y) - 0.17) < 0.07) return '#1a1410'; return x > 0.2 && z < 3.6 ? '#7a4a2a' : z > 4.05 ? '#5a3a1e' : '#e8b890'; }); }, 0.1); }; }
function stoneFn(B){ B.vox(-0.85, -0.85, 0, 0.85, 0.85, 1.7, function(set){ B.blob(set, 0, 0, 0.75, 0.75, 0.7, 0.78, function(x, y, z){ var n = Math.sin(x * 7 + z * 5) * Math.sin(y * 6 - z * 7); return n > 0.4 ? '#b4ae9e' : n < -0.4 ? '#7a766a' : '#9c978a'; }); }, 0.1); }
function sackFn(B){ B.vox(-0.6, -0.6, 0, 0.6, 0.6, 1.3, function(set){ B.blob(set, 0, 0, 0.45, 0.5, 0.5, 0.45, function(x, y, z){ return x + y > 0.3 ? '#a88a44' : '#d0b468'; }); B.tube(set, 0, 0, 0.85, 0, 0, 1.15, 0.16, 0.08, '#c8a050'); }, 0.08); }
function harpFn(B){ B.vox(-0.7, -0.7, 0, 0.7, 0.7, 1.9, function(set){ B.tube(set, 0, 0, 0, 0, 0, 0.15, 0.4, 0.4, '#a87a14'); B.tube(set, -0.35, 0, 0.1, -0.35, 0, 1.7, 0.09, 0.08, '#d8a020');
  B.tube(set, -0.35, 0, 1.7, 0.4, 0, 1.4, 0.08, 0.08, '#f2c43a'); B.tube(set, 0.4, 0, 1.4, 0.35, 0, 0.2, 0.08, 0.08, '#d8a020');
  for (var k = 0; k < 4; k++){ var x = -0.2 + k * 0.17; B.tube(set, x, 0, 0.2, x, 0, 1.5 - k * 0.06, 0.025, 0.025, '#fff4c8'); } }, 0.06); }

function view(R){ var Q = R.Q, T = R.T, ctx = R.ctx, s0 = null, gx = null, gy = null, gone = {};
  var spG = R.sprite('gymgiant', giantFn(false), 2.8, 2.8, 4.6), spZ = R.sprite('gymgiantsit', giantFn(true), 2.8, 2.8, 3), spS = R.sprite('gymstone', stoneFn, 1.7, 1.7, 1.7), spB = R.sprite('gymsack', sackFn, 1.2, 1.2, 1.3), spH = R.sprite('gymharp', harpFn, 1.4, 1.4, 1.9);
  return {
    lay:function(s){ s0 = s; var q = R.at(s.g); gx = q[0]; gy = q[1]; gone = {}; },
    move:function(m, u){ if (m[0] === 'giant'){ var a = R.at(m[1]), b = R.at(m[2]); gx = a[0] + (b[0] - a[0]) * u; gy = a[1] + (b[1] - a[1]) * u; if (u >= 1) R.sfx('blip'); return; }
      if (u < 1) return; var w = R.at(m[1]);
      if (m[0] === 'bag'){ gone[m[1]] = 1; R.burst(w[0], w[1], DECK + 0.6, ['#ffffff', '#ffe9a0', '#d8a020'], 12, 0.8, 0.7); R.sfx('blip'); }
      if (m[0] === 'harp'){ gone[m[1]] = 1; R.burst(w[0], w[1], DECK + 1.2, ['#ffffff', '#fff4c8', '#f2c43a'], 16, 0.9, 0.8); R.sfx('blip'); } },
    things:function(ds){ if (!s0) return; var s = s0;
      for (var i = 0; i < Q.cell.length; i++){ (function(i){ var ch = Q.cell[i]; var w = R.at(i);
        if (ch === 's') ds.push({ x:w[0], y:w[1], kd:function(){ R.drawSprite(spS, w[0], w[1], DECK); } });
        else if (ch === 'b'){ var k = Q.bags.indexOf(i); if (!(s.b >> k & 1) && !gone[i]) ds.push({ x:w[0], y:w[1], kd:function(){ R.drawSprite(spB, w[0], w[1], DECK); } }); }
        else if (i === Q.harp && !s.h && !gone[i]) ds.push({ x:w[0], y:w[1], kd:function(){ R.drawSprite(spH, w[0], w[1], DECK); } }); })(i); }
      ds.push({ x:gx, y:gy, kd:function(){ R.drawSprite(s.a ? spG : spZ, gx, gy, DECK); } });
      // what Jack carries rides over him: the harp once he has it, a bag for the gold
      if (s.b || (s.h && Q.harp >= 0)){ var me = R.at(s.p); ds.push({ x:me[0], y:me[1] + T * 0.3, kd:function(){ var c = R.scr(me[0], me[1] + T * 0.3, DECK + T * 1.5), e2 = R.scr(me[0] + T * 0.3, me[1], DECK), b0 = R.scr(me[0], me[1], DECK), rx = Math.max(3, Math.abs(e2[0] - b0[0]));
        ctx.fillStyle = '#d0b468'; ctx.beginPath(); ctx.ellipse(c[0] - rx * 0.5, c[1], rx * 0.45, rx * 0.5, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#6a3a14'; ctx.fillRect(Math.round(c[0] - rx * 0.6), Math.round(c[1] - rx * 0.55), Math.max(1, Math.round(rx * 0.25)), Math.max(1, Math.round(rx * 0.12)));
        if (s.h && Q.harp >= 0){ ctx.strokeStyle = '#f2c43a'; ctx.lineWidth = Math.max(1, rx * 0.15); ctx.beginPath(); ctx.moveTo(c[0] + rx * 0.3, c[1] + rx * 0.5); ctx.lineTo(c[0] + rx * 0.3, c[1] - rx * 0.6); ctx.lineTo(c[0] + rx * 0.9, c[1] - rx * 0.3); ctx.lineTo(c[0] + rx * 0.8, c[1] + rx * 0.5); ctx.stroke(); } } }); } },
    hot:function(){ return []; },
    ground:function(){ } }; }

root.RTT_GYMKIND_GIANT = { id:'giant', gyms:GYMS, input:'step', calm:true, unit:'step', hello:'The giant takes two strides for every step you take. Do not let him catch you.',
  parse:parse, init:init, key:key, act:act, step:act, moves:moves, stuck:stuck, proof:proof, enc:enc, goal:goal, stride:stride,
  me:function(G, s){ return s.p; }, place:function(G, s, i){ return { p:i, g:s.g, b:s.b, a:s.a, h:s.h, c:s.c }; },
  deck:function(G, s, i){ var Q = parse(G); return free(Q, i) || i === Q.lever; },
  tell:{ gold:'A bag of the giant’s gold.', harp:'Master! Master! The harp cries out, and the giant wakes.', caught:'Fee-fi-fo-fum! He has you. Undo it, or Restart.', shut:'Not yet. Take everything first.',
    slide:'Wet flags. You slide.', stuck:'No way home from here. Undo it, or Restart.' },
  dur:function(how){ return how === 'stride' ? 0.12 : how === 'slide' ? 0.1 : 0.15; },
  floor:floor, mats:mats, view:view };
})();
