/* golf/putt/gymkinds/slope.js: the SNOW SLOPE kind of trail gym (RTT_GYMKIND_SLOPE), the Himalayas'. A kind file: the registry
   (gyms.js, its KINDS README) finds it by its global, the frame (trail.js) plays it, check-putt proves it.

   THE PUZZLE is the expedition's, on a steep snow slope under the ridge: the room rises from the door to the far wall, and a few
   sightings are up on it, each a camera on a rock ledge, and every one has to be photographed before the vault, the expedition's
   chest under the far wall, will open. The snow is too steep to stand on: after every step, if he is on open snow he slides
   straight down the slope until something holds him, a ledge, a fixed rope, a boulder below him or the foot of the slope. On a
   ledge he can walk along it; on a fixed rope he can climb up or down it. A step up onto open snow only slides him back where he
   was, so it is no step at all. So the way up is the ropes and the ledges, and the snow is the quick way down: the read is where a
   slide will drop him, and which ledge it has to drop him on.

   THE GATEKEEPER'S TWIST is Volcano Island's cooling rock, as the cornices of wind packed snow along the ridge: a cornice holds him
   like a ledge, but the moment he steps off it, it breaks away and is open snow from then on. A way used once is gone, and a slide
   that used to stop on it now runs on past.

   He moves TILE BY TILE (a step kind).

   THE LAYOUTS ARE HAND DESIGNED, never random. Row 0 is the far wall (the top of the screen, the top of the slope), the last row
   the near wall with the gate in it. The frame's five characters (# G @ L C, gyms.js) and this kind's own:
     .  open snow (he slides down off it)      =  a rock ledge (holds him)        |  a fixed rope (holds him, and he climbs it)
     x  a boulder (stops him; he can stand on the snow above it)                  p  a camera sighting to photograph (on a ledge)
     k  a cornice (the gatekeeper's): holds him once, and breaks away as he steps off it
   The foot of the slope (the row the start is on) is level snow: the near wall holds him there.
   THE STATE is { p, f, b }: his tile, the photos taken (a bit each) and the cornices broken (a bit each). A few thousand states at
   most, so solve() and audit() are the registry's own breadth first search (lib), and stuck() is looked up from one search of
   every state. */
(function(){
var root = typeof window !== 'undefined' ? window : globalThis;
var LIB = function(){ return root.RTT_PUTT_GYMS.lib; };

/* THE GYMS. moves and proof are the solver's fewest steps and one shortest solution (U R D L), recorded from solve().
   The civilian's lines nudge, never solve. */
var GYMS = [
  /* THE SNOW SLOPE, mid-world: ledges of rock across the slope, ropes fixed between them, and three cameras out on the ledges. The
     lesson is the slope's one rule: off a ledge the snow takes him straight down, so a camera above is reached by a rope, and a
     camera below by stepping off in the right place. */
  { id:'hm1', kind:'slope', world:'himalayas', leg:9, name:'The Snow Slope', badge:'Slope Badge', mech:['slope'], pay:500, look:{ wall:'stone' },
    hint:'Work back from the chest. Find the rope that reaches it, then the ledge that rope starts from.',
    moves:29, proof:'LULLLRRRUUUUUURRRDRLLLLUUUURU',
    who:{ look:{ skin:'medium', polo:'red', hat:'red', pants:'black', hair:'black', hairStyle:'short', cap:true, shoes:'brown', gender:'male' } },
    say:['The snow is too steep to stand on. Step off a ledge and you slide to the bottom.',
      'The ropes are the only way up. The snow is the quick way down.',
      'Before you step onto the snow, look straight down. That is where you will stop.'],
    rows:[
      '#####C#####',
      '#...|====.#',
      '#...|...x.#',
      '#.|.|.p=p=#',
      '#.|.|..==.#',
      '#.|.==....#',
      '#.|.|..x..#',
      '#p===.....#',
      '#L...@....#',
      '#####G#####'
    ] },
  /* THE CORNICE, the gatekeeper: the ridge's cornices of wind packed snow hold him once and break away behind him, so a ledge that
     caught one slide will not catch the next. Its hint is the twist and nothing more. */
  { id:'hm2', kind:'slope', world:'himalayas', leg:18, name:'The Cornice', badge:'Cornice Badge', mech:['slope', 'rock'], pay:1000, keeper:true, look:{ wall:'stone' },
    hint:'A cornice breaks as you leave it. Work out which slide needs it most, and save it for that one.',
    moves:53, proof:'RRRURUUUUULUUULLLLLUULLURRDRRRRRURUUUUULULLLLLUURURUU',
    who:{ look:{ skin:'light', polo:'blue', hat:'blue', pants:'black', hair:'brown', hairStyle:'bun', cap:true, shoes:'brown', gender:'female' } },
    say:['The cornices are wind packed snow. They hold you once, then they break away.',
      'A broken cornice is open snow. A slide goes straight past it.',
      'Count your cornices. Each one is a single use.'],
    rows:[
      '#####C#####',
      '#..=.=.p=.#',
      '#.xx|=..k.#',
      '#k=|=.|=|.#',
      '#p.=.=..||#',
      '#..|=x=|.=#',
      '#==...==.=#',
      '#x.=x===.=#',
      '#.k=.=...p#',
      '#x.kk..x|=#',
      '#L...@....#',
      '#####G#####'
    ] }
];

var PARSED = {};
function parse(G){ if (PARSED[G.id]) return PARSED[G.id]; var cams = [], cor = [];
  var Q = LIB().room(G, function(ch, i){ if (ch === 'p') cams.push(i); else if (ch === 'k') cor.push(i); else if ('=|x'.indexOf(ch) < 0) return false; });
  Q.cams = cams; Q.cor = cor; Q.full = (1 << cams.length) - 1; Q.foot = (Q.start / Q.W) | 0; return PARSED[G.id] = Q; }
function init(G){ var Q = parse(G); return { p:Q.start, f:0, b:0 }; }
function key(s){ return s.p + ':' + s.f + ':' + s.b; }
// what holds him on tile i: a ledge, a rope, a camera's ledge, an unbroken cornice, the foot of the slope
function holds(Q, i, b){ var ch = Q.cell[i]; if (ch === '=' || ch === '|' || ch === 'p') return true; if (ch === 'k') return !(b >> Q.cor.indexOf(i) & 1); return ((i / Q.W) | 0) >= Q.foot; }
// can he be on tile i at all (not a wall, a boulder or one of the frame's tiles)
function open(Q, i){ if (i < 0) return false; var ch = Q.cell[i]; return ch === '.' || ch === '=' || ch === '|' || ch === 'p' || ch === 'k'; }
var DR = [[0, -1], [1, 0], [0, 1], [-1, 0]];
/* ONE STEP. The frame's tiles first (the gate, the lever, the vault, shut till every photo is taken). Then the tile he steps onto
   must be open; stepping off a cornice breaks it; and if he stands on open snow, he slides straight down until a ledge, a rope or
   a cornice holds him, or a boulder or the foot stops him. A camera's ledge takes its photo. A step that slides him back where he
   was is no step. */
function act(G, s, dir){ var Q = parse(G), L = LIB(), n = L.nb(Q, s.p, dir);
  if (n >= 0 && n === Q.chest && s.f !== Q.full) return { s:s, ev:'shut', moves:[] };
  var fr = L.frameStep(G, Q, s, s.p, dir, init); if (fr) return fr;
  if (!open(Q, n)) return { s:s, ev:'bump', moves:[] };
  var b = s.b, ci = Q.cor.indexOf(s.p); if (ci >= 0) b |= 1 << ci;
  var mv = [['me', s.p, n, 'walk']], at = n, ev = 'step', guard = 0;
  while (!holds(Q, at, b) && guard++ < 30){ var m = L.nb(Q, at, 2); if (!open(Q, m)) break; mv.push(['me', at, m, 'slide']); at = m; ev = 'slide'; }
  if (at === s.p && b === s.b) return { s:s, ev:'slip', moves:[] };
  if (ci >= 0) mv.push(['cor', s.p, s.p, 'break']);
  var f = s.f, k = Q.cams.indexOf(at); if (k >= 0 && !(f >> k & 1)){ f |= 1 << k; mv.push(['cam', at, at, 'snap']); ev = 'snap'; }
  return { s:{ p:at, f:f, b:b }, ev:ev, moves:mv }; }
function moves(){ return [0, 1, 2, 3]; }
/* STUCK, looked up: every state a player can reach is searched once (lib.explore), and those the vault can still be reached from
   without the lever are kept; any other state (a camera left on a ledge nobody can reach again) is stuck. */
var GOOD = {};
function goodOf(G){ if (GOOD[G.id]) return GOOD[G.id]; var K = root.RTT_GYMKIND_SLOPE, X = LIB().explore(K, G), N = X.list.length, back = [], i, ok = {};
  for (i = 0; i < N; i++) back.push([]); X.edges.forEach(function(e){ if (!e[2]) back[e[1]].push(e[0]); });
  var good = new Uint8Array(N), q = X.wins.map(function(w){ return w[0]; }); q.forEach(function(w){ good[w] = 1; });
  for (var hh = 0; hh < q.length; hh++) back[q[hh]].forEach(function(pp){ if (!good[pp]){ good[pp] = 1; q.push(pp); } });
  for (i = 0; i < N; i++) if (good[i]) ok[key(X.list[i])] = 1; return GOOD[G.id] = ok; }
function stuck(G, s){ return !goodOf(G)[key(s)]; }
function proof(G){ return (G.proof || '').split('').map(function(ch){ return 'URDL'.indexOf(ch); }); }
function enc(path){ return path.map(function(d){ return 'URDL'.charAt(d); }).join(''); }
function goal(){ return 'Photograph every sighting. Then reach the chest.'; }

/* ---- THE LOOK: the slope is snow in the blue of its shade, rising to the far wall, with long faint streaks down it the way the snow
   slides. A ledge is a band of grey rock with snow on its lip, a fixed rope a red line pegged down the slope, a boulder a grey rock
   with a cap of snow, a cornice a curl of wind packed snow (cracked once it has broken away), and a sighting a camera on its tripod
   on its ledge, a line of huge prints in the snow beyond it until its photo is taken. */
var DECK = 0.45;
function floor(gc){ if (gc.k === '#') return null; var led = gc.k === '=' || gc.k === 'p', rope = gc.k === '|', cor = gc.k === 'k';
  return { h:led ? DECK + 0.12 : cor ? DECK + 0.08 : DECK, mat:['slfloor', { gu:gc.u, gv:gc.v, wk:led ? 1 : rope ? 2 : cor ? 3 : 0 }] }; }
function mats(){ return {
  slfloor:['', '', '', 0, function(c, R, h3){ var u = c.gu || 0, v = c.gv || 0, k = c.wk || 0, n = h3(c.ti, c.tj, 331);
    if (c.dt < 0) return R('#5a5650');
    if (k === 1) return R(v < 0.18 ? (n > 0.5 ? '#f4f8fc' : '#e8f0f8') : n > 0.8 ? '#a8a49a' : n > 0.35 ? '#86827a' : '#6e6a62');
    if (k === 2){ if (Math.abs(u - 0.5) < 0.07) return R(n > 0.5 ? '#c8302a' : '#a8241c'); if (Math.abs(u - 0.5) < 0.16 && Math.abs(v - 0.5) < 0.06) return R('#5a5e66'); }
    if (k === 3) return R(v < 0.3 ? '#ffffff' : n > 0.5 ? '#eef4fa' : '#dfe8f2');
    if (u < 0.03 || u > 0.97) return R('#c8d8e8'); var st = Math.abs(((u * 3 + n * 0.2) % 1) - 0.5) < 0.04; return R(st ? '#d4e2f0' : n > 0.92 ? '#ffffff' : n < 0.3 ? '#dfe8f2' : '#eaf1f8'); }] }; }

function camFn(B){ B.vox(-0.6, -0.6, 0, 0.6, 0.6, 1.4, function(set){
  B.tube(set, 0, 0, 0.95, -0.4, -0.3, 0, 0.04, 0.04, '#5a4a3a'); B.tube(set, 0, 0, 0.95, 0.4, -0.3, 0, 0.04, 0.04, '#5a4a3a'); B.tube(set, 0, 0, 0.95, 0, 0.45, 0, 0.04, 0.04, '#5a4a3a');
  B.blob(set, 0, 0, 1.08, 0.24, 0.18, 0.16, function(){ return '#2a2a2e'; }); B.tube(set, 0, -0.12, 1.1, 0, -0.34, 1.1, 0.09, 0.09, '#1a1a1e'); B.blob(set, 0, -0.35, 1.1, 0.07, 0.03, 0.07, function(){ return '#9ad0e8'; }); }, 0.05); }
function rockFn(B){ B.vox(-0.8, -0.8, 0, 0.8, 0.8, 1.2, function(set){ B.blob(set, 0, 0, 0.45, 0.62, 0.55, 0.5, function(x, y, z){ return z > 0.7 ? '#f4f8fc' : x + y > 0.3 ? '#6e6a62' : '#86827a'; }); }, 0.06); }
function corFn(B){ B.vox(-0.6, -0.6, 0, 0.6, 0.6, 0.5, function(set){ B.blob(set, 0, 0.1, 0.12, 0.55, 0.42, 0.22, function(x, y, z){ return z > 0.18 ? '#ffffff' : '#dceaf6'; }); }, 0.05); }

function view(R){ var Q = R.Q, T = R.T, ctx = R.ctx, s0 = null;
  var spC = R.sprite('gymslcamera', camFn, 1.2, 1.2, 1.4), spR = R.sprite('gymslrock', rockFn, 1.6, 1.6, 1.2), spK = R.sprite('gymslcornice', corFn, 1.2, 1.2, 0.5);
  function P(x, y, z){ return R.scr(x, y, z); }
  // a broken cornice: a crack across its tile and the snow fallen away below it
  function cracked(i){ var c = R.at(i), h = T * 0.5, z = DECK + 0.02, a = P(c[0] - h * 0.8, c[1] - h * 0.1, z), b = P(c[0] + h * 0.8, c[1] + h * 0.15, z);
    ctx.strokeStyle = 'rgba(58,92,136,.8)'; ctx.lineWidth = Math.max(1, R.kk() * 0.6); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + R.kk()); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
  // the prints beyond a camera not yet photographed
  function prints(i){ var c = R.at(i); for (var k = 0; k < 3; k++){ var q = P(c[0] - T * 0.6 + k * T * 0.6, c[1] - T * (0.55 + (k % 2) * 0.12), DECK + 0.13);
    ctx.fillStyle = 'rgba(90,118,152,.75)'; ctx.beginPath(); ctx.ellipse(q[0], q[1], R.kk() * 2.2, R.kk() * 1.1, 0, 0, 7); ctx.fill(); } }
  return {
    lay:function(s){ s0 = s; },
    move:function(m, u){ if (u < 1) return; var w = R.at(m[1]); if (m[0] === 'cam'){ R.burst(w[0], w[1], DECK + 1.2, ['#ffffff', '#e8f4ff', '#a8c8d8'], 14, 0.9, 0.8); R.sfx('blip'); } else if (m[0] === 'cor'){ R.burst(w[0], w[1], DECK + 0.3, ['#ffffff', '#dceaf6', '#a8c4dc'], 16, 0.7, 0.9); R.sfx('blip'); } },
    things:function(ds){ if (!s0) return; var s = s0;
      for (var i = 0; i < Q.cell.length; i++){ (function(i){ var ch = Q.cell[i], w = R.at(i);
        if (ch === 'x') ds.push({ x:w[0], y:w[1], kd:function(){ R.drawSprite(spR, w[0], w[1], DECK); } });
        else if (ch === 'k' && !(s.b >> Q.cor.indexOf(i) & 1)) ds.push({ x:w[0], y:w[1], kd:function(){ R.drawSprite(spK, w[0], w[1], DECK); } });
        else if (ch === 'p') ds.push({ x:w[0], y:w[1], kd:function(){ R.drawSprite(spC, w[0], w[1], DECK + 0.12); } }); })(i); } },
    ground:function(){ if (!s0) return; for (var i = 0; i < Q.cell.length; i++){ var ch = Q.cell[i]; if (ch === 'k' && (s0.b >> Q.cor.indexOf(i) & 1)) cracked(i); else if (ch === 'p' && !(s0.f >> Q.cams.indexOf(i) & 1)) prints(i); } },
    hot:function(){ return []; } }; }

root.RTT_GYMKIND_SLOPE = { id:'slope', gyms:GYMS, input:'step', calm:true, unit:'step', hello:'The snow is too steep to stand on. Off a ledge, you slide down.',
  parse:parse, init:init, key:key, act:act, step:act, moves:moves, stuck:stuck, proof:proof, enc:enc, goal:goal,
  me:function(G, s){ return s.p; }, place:function(G, s, i){ return { p:i, f:s.f, b:s.b }; },
  deck:function(G, s, i){ var Q = parse(G); return open(Q, i) || i === Q.lever; },
  tell:{ snap:'Photo taken.', slide:'The snow takes you down.', slip:'Too steep. You slide straight back.', shut:'Not yet. Photograph every sighting first.',
    stuck:'There is no way back up to a camera now. Undo it, or Restart.' },
  dur:function(how){ return how === 'slide' ? 0.09 : how === 'snap' || how === 'break' ? 0.05 : 0.15; },
  floor:floor, mats:mats, view:view };
})();
