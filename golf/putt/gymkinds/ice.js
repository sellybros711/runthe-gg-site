/* golf/putt/gymkinds/ice.js: the ICE SLIDE kind of trail gym (RTT_GYMKIND_ICE), Ice Age's. A kind file: the registry
   (gyms.js, its KINDS README) finds it by its global, the frame (trail.js) plays it, check-putt proves it.

   THE PUZZLE is the classic ice gym. The rink is glacier ice. Step onto it and you slide, and you keep sliding until
   something stops you: a wall, a rock, the frame round the room, or a patch of snow (snow stops you dead, on it).
   You cannot stop halfway, and you cannot push anything. So the question in every room is never "how do I get
   there" but "what would stop me there", and the answer is usually to slide somewhere else first.

   THE ROOM (rows, row 0 the far wall, the last row the near wall with the gate in it):
     #  wall              =  ice (you slide on it)          .  snow (it stops you, on it)
     o  a rock (it stops you, in front of it)               @  where you stand coming in (snow; the gate is below it)
     L  the reset lever (slide or step into it: back to the start)
     C  the vault chest (slide or step into it and it opens: reaching it IS solving the gym)
   and in the gatekeeper:
     ^ > v <  one-way ice: you slide over it only the way it points (any other way it is a wall), and keep going
     w        a lane of open water (a wall: the ice ends at it) that the frost bell freezes
     f        a lane of ice that the frost bell thaws into open water
     *        the frost bell. Slide or step into it and it rings: every w lane freezes and every f lane thaws, both
              at once. Ring it again and they swap back. A lane tile is never beside the bell, so the lane under you
              never thaws while you stand on it.

   THE STATE is where he stands (p), whether the bell has swapped the lanes (t), and whether the vault is reached
   (v: the move into the chest ends there, so the slide plays before the vault opens). solve() and audit() are the
   registry's own breadth first search (lib), over at most a few hundred states, so every state a player can reach is
   searched to the end. A pocket of the rink that every slide out of leads back into is a real dead end: stuck() says
   so, and the frame lights Restart. That is a wrong move that teaches: the rink is read before it is skated. */
(function(){
var root = typeof window !== 'undefined' ? window : globalThis;
var LIB = function(){ return root.RTT_PUTT_GYMS.lib; };
var ONEWAY = { '^':0, '>':1, 'v':2, '<':3 };

/* THE GYMS. Hand designed. moves and proof are the solver's (U R D L, a letter a slide), recorded from solve(). */
var GYMS = [
  /* THE GLACIER RINK, mid-world: the rule and nothing else. Ice, snow, rocks. The vault is in plain sight up the
     middle, and the straight line to it overshoots every time. The aha: you get to the vault by sliding AWAY from it
     first, to the one rock that stops you in the right lane. */
  { id:'ice1', kind:'ice', world:'iceage', leg:9, name:'The Glacier Rink', badge:'Frost Badge', mech:['ice'], pay:500, look:{ wall:'stone' },
    moves:11, proof:'RULUURDRURU',
    who:{ look:{ skin:'light', polo:'teal', hat:'white', pants:'navy', hair:'grey', hairStyle:'ponytail', cap:false, gender:'female' } },
    say:['I taught skating here for thirty years. Once you push off, the ice decides where you stop. Not you.',
      'Stop looking at the vault. Look for what would stop you next to it.',
      'Sometimes the way forward starts by going the wrong way. Honest. Try the long way round.'],
    rows:[
      '###########',
      '#===oCo===#',
      '#=====o===#',
      '#=========#',
      '#=======.=#',
      '#=========#',
      '#====o====#',
      '#=.oo=====#',
      '#==o==o===#',
      '#o=======o#',
      '#=========#',
      '###L.@.####',
      '#####G#####'
    ] },
  { id:'ice2', kind:'ice', world:'iceage', leg:18, name:'The Ice Palace', badge:'Glacier Badge', mech:['ice', 'switch'], pay:1000, keeper:true, look:{ wall:'stone' },
    moves:28, proof:'URDLURDRUDLURURDLULDLURULDRU',
    who:{ look:{ skin:'medium', polo:'white', hat:'grey', pants:'black', hair:'darkbrown', hairStyle:'short', cap:true, hatStyle:'cap', gender:'male' } },
    goal:'Slide to the vault. The bell swaps the water and the ice.',
    say:['I ring that bell every winter. Some years it freezes the pond. Some years it does the opposite.',
      'That bell swaps both lanes at once. And those arrows only let you through one way.',
      'Hang in there. Open water stops you just like a rock does. Sometimes that\'s the whole point.'],
    rows:[
      '###########',
      '#===oCo===#',
      '#=========#',
      '#=====o===#',
      '#o===o====#',
      '####^##f###',
      '#oo======o#',
      '#o=======o#',
      '#====*====#',
      '#===o===o=#',
      '###w###^###',
      '#==o======#',
      '#=======o=#',
      '#=o=======#',
      '#=========#',
      '###L.@.####',
      '#####G#####'
    ] }
];

/* ---- a layout, read once (lib.room reads the frame's five; this kind reads the rest). Q.lane is every lane tile,
   Q.bell the frost bells. */
var PARSED = {};
function parse(G){ if (PARSED[G.id]) return PARSED[G.id]; var lane = [], bell = [];
  var Q = LIB().room(G, function(ch, i){ if (ch === '=' || ch === 'o' || ONEWAY[ch] != null) return; if (ch === 'w' || ch === 'f'){ lane.push(i); return; } if (ch === '*'){ bell.push(i); return; } return false; });
  Q.lane = lane; Q.bell = bell;
  bell.forEach(function(b){ for (var d = 0; d < 4; d++){ var n = LIB().nb(Q, b, d); if (n >= 0 && lane.indexOf(n) >= 0) throw new Error(G.id + ': a lane tile beside the bell'); } });
  if (Q.cell[Q.start] !== '.') throw new Error(G.id + ': the start is snow');
  return PARSED[G.id] = Q; }
function init(G){ parse(G); return { p:parse(G).start, t:0, v:0 }; }
function key(s){ return s.p + '|' + s.t + '|' + s.v; }
// a lane tile is water when it starts as water and the bell has not swapped it, or starts as ice and it has
function water(Q, s, i){ var k = Q.cell[i]; return (k === 'w' && !s.t) || (k === 'f' && !!s.t); }
// what a tile does to a slide coming in going d: 'go' (ice: on you go), 'stop' (snow: you stop on it), 'wall' (you stop before it)
function feel(Q, s, i, d){ if (i < 0) return 'wall'; var k = Q.cell[i];
  if (k === '.') return 'stop'; if (k === '=') return 'go';
  if (ONEWAY[k] != null) return ONEWAY[k] === d ? 'go' : 'wall';
  if (k === 'w' || k === 'f') return water(Q, s, i) ? 'wall' : 'go';
  return 'wall'; }

/* ONE MOVE: a slide. From where he stands, going d, tile after tile until something stops him. Returns { s, ev, moves }:
   ev 'slide' (he moved), 'ring' (he reached the bell: the lanes swap), 'bump' (nothing happened), and the frame's
   'reset', 'exit' and the vault reached (v:1). moves is the one slide, ['me', from, to, 'slide<tiles>']. */
function act(G, s, d){ var Q = parse(G), L = LIB(), p = s.p, n, mv = [];
  for (var guard = 0; guard < 99; guard++){ n = L.nb(Q, p, d);
    if (n === Q.gate && p === s.p) return { s:s, ev:'exit', moves:mv };
    if (n >= 0 && Q.cell[n] === 'L') return { s:init(G), ev:'reset', moves:mv };
    if (n >= 0 && Q.cell[n] === 'C') return done({ p:p, t:s.t, v:1 }, 'slide');
    if (n >= 0 && Q.bell.indexOf(n) >= 0) return done({ p:p, t:s.t ? 0 : 1, v:0 }, 'ring');
    var f = n === Q.gate ? 'wall' : feel(Q, s, n, d);
    if (f === 'wall'){ if (p === s.p) return { s:s, ev:bumpEv(Q, s, n, d), moves:mv }; return done({ p:p, t:s.t, v:0 }, 'slide'); }
    p = n; if (f === 'stop') return done({ p:p, t:s.t, v:0 }, 'slide'); }
  return done({ p:p, t:s.t, v:0 }, 'slide');
  function done(s1, ev){ if (s1.p !== s.p) mv.push(['me', s.p, s1.p, 'slide' + dist(Q, s.p, s1.p)]); return { s:s1, ev:ev, moves:mv }; } }
function dist(Q, a, b){ return Math.abs(a % Q.W - b % Q.W) + Math.abs(((a / Q.W) | 0) - ((b / Q.W) | 0)); }
// what a move that went nowhere bumped into, for the one line the frame says the first time (tell)
function bumpEv(Q, s, n, d){ if (n < 0) return 'bump'; var k = Q.cell[n]; if ((k === 'w' || k === 'f') && water(Q, s, n)) return 'water'; if (ONEWAY[k] != null && ONEWAY[k] !== d) return 'oneway'; return 'bump'; }
function won(G, s){ return s.v === 1; }
function proof(G){ return (G.proof || '').split('').map(function(ch){ return 'URDL'.indexOf(ch); }); }
function enc(path){ return path.map(function(d){ return 'URDL'.charAt(d); }).join(''); }

/* ---- WHAT IT LOOKS LIKE. The floor is baked once into the trail's picture (floor() and mats(), the KINDS README):
   glassy blue ice with long bright streaks, and snow a step above it, bright white, so the tiles that stop you read
   at a glance as the only white on the rink. One-way ice carries white chevrons pointing the way it runs. A lane sits
   a little down in the floor; what is in it (open black water or a sheet of ice) changes, so the view draws it each
   frame, and the bell that swaps it carries the same frost blue rim as every lane tile. Rocks and the bell stand up. */
var DECK = 0.45, ICE_H = DECK - 0.04, SNOW_H = DECK + 0.07, LANE_H = DECK - 0.28;
var IC = ['#a6d8f2', '#dff4ff', '#6eaed2', '#4f93bf'], SN = ['#f6f9fc', '#e9eff5', '#b6c6d4', '#ffffff'], WT = ['#0c3448', '#3f8fb4', '#051824'];
function floor(gc){ var k = gc.k, ex = { gu:gc.u, gv:gc.v, gc:gc.c, gr:gc.r };
  if (k === '=' || k === 'o') return { h:ICE_H, mat:['icI', ex] };
  if (ONEWAY[k] != null){ ex.cd = ONEWAY[k]; return { h:ICE_H, mat:['icA', ex] }; }
  if (k === 'w' || k === 'f') return { h:LANE_H, mat:['icW', ex] };
  if (k === '#') return { h:DECK, mat:['icB', ex] };
  return { h:SNOW_H, mat:['icS', ex] }; }
function mats(){
  function edge(c, e){ var u = c.gu || 0, v = c.gv || 0; return u < e || u > 1 - e || v < e || v > 1 - e; }
  return {
    // snow: soft white, a faint sparkle, its near face in a cool shade so its step up off the ice shows
    icS:['', '', '', 0, function(c, R, h3){ if (c.dt < 0) return R(SN[2]); var n = h3(c.ti, c.tj, 61); return R(edge(c, 0.04) ? SN[1] : n < 0.04 ? SN[3] : n < 0.3 ? SN[1] : SN[0]); }],
    // ice: pale glassy blue with long diagonal streaks of light, a darker seam round each tile so the grid reads
    icI:['', '', '', 0, function(c, R, h3){ var u = c.gu || 0, v = c.gv || 0; if (c.dt < 0 || edge(c, 0.045)) return R(IC[2]);
      var st = ((u * 0.7 + v) * 2.2 + (c.gc || 0) * 0.37 + (c.gr || 0) * 0.21) % 1; return R(st < 0.07 || h3(c.ti, c.tj, 45) < 0.025 ? IC[1] : IC[0]); }],
    // one-way ice: a deeper blue tile with two bold white chevrons pointing the way it runs, outlined in navy
    icA:['', '', '', 0, function(c, R){ var d = c.cd, u = c.gu || 0, v = c.gv || 0; if (c.dt < 0 || edge(c, 0.045)) return R(IC[3]);
      var a = d === 1 ? u : d === 3 ? 1 - u : d === 2 ? v : 1 - v, sd = Math.abs((d === 1 || d === 3 ? v : u) - 0.5);
      for (var k = 0; k < 2; k++){ var q = a - (0.36 + k * 0.3) + sd * 0.85; if (sd < 0.38 && q > -0.13 && q < 0.13) return R(Math.abs(q) > 0.07 ? '#1f5a8a' : '#ffffff'); }
      return R('#86c4ea'); }],
    // a lane's bed: black water, drawn over each frame by the view (ice or water, as the bell has it)
    icW:['', '', '', 0, function(c, R){ return R(c.dt < 0 ? WT[2] : WT[0]); }],
    // under a wall: snow in the wall's shadow
    icB:['', '', '', 0, function(c, R){ return R(SN[2]); }] }; }
// a rock on the ice: grey granite, a cap of snow on it
function rockFn(B){ B.vox(-0.9, -0.9, 0, 0.9, 0.9, 1.5, function(set){
  B.blob(set, 0, 0, 0.45, 0.72, 0.64, 0.55, function(x, y, z){ var n = Math.sin(x * 9 + z * 7) * Math.sin(y * 8 - z * 5); return n > 0.45 ? '#9aa6b4' : n < -0.5 ? '#5e6a78' : '#7a8696'; });
  B.blob(set, -0.15, 0.1, 0.8, 0.42, 0.38, 0.32, function(x, y, z){ return Math.sin(x * 11 + y * 7) > 0.6 ? '#9aa6b4' : '#7f8b9b'; });
  B.blob(set, 0, -0.02, 1.0, 0.5, 0.42, 0.2, function(x, y, z){ return z > 1.05 ? '#ffffff' : '#e6eef6'; }); }, 0.1); }
// the frost bell: a little frame of dark timber with a bell of frosted bronze hung in it, and a frost blue rim round its foot
function bellFn(B){ B.vox(-0.9, -0.9, 0, 0.9, 0.9, 2.4, function(set){
  B.blob(set, 0, 0, 0.08, 0.72, 0.62, 0.12, '#7cc8f2');
  B.tube(set, -0.55, 0, 0, -0.55, 0, 2.0, 0.1, 0.09, '#4a3426'); B.tube(set, 0.55, 0, 0, 0.55, 0, 2.0, 0.1, 0.09, '#4a3426');
  B.tube(set, -0.7, 0, 2.0, 0.7, 0, 2.0, 0.1, 0.1, '#5e4230');
  B.tube(set, 0, 0, 1.95, 0, 0, 1.7, 0.04, 0.04, '#2a2a30');
  B.tube(set, 0, 0, 1.72, 0, 0, 0.95, 0.12, 0.38, function(t, z){ return z > 1.5 ? '#e8f4ff' : t > 0.9 ? '#8a6a3a' : Math.sin(z * 20) > 0.7 ? '#e8f4ff' : '#c9a456'; });
  B.blob(set, 0, 0, 0.88, 0.1, 0.1, 0.1, '#5a4626'); }, 0.08); }
/* WHAT MOVES, DRAWN. He is the only piece that moves (the frame walks him; a slide is one long glide). The rocks and
   the bell stand where they are; the lanes swap with a shimmer when the bell rings, and stay as the state has them. */
function view(R){ var Q = R.Q, T = R.T, lanes = Q.lane, t = 0, shown = 0, swapAt = -9, rocks = [], bells = Q.bell.slice();
  Q.cell.forEach(function(k, i){ if (k === 'o') rocks.push(i); });
  var rock = R.sprite('gymrock', rockFn, 1.8, 1.8, 1.6), bell = bells.length ? R.sprite('gymbell', bellFn, 1.8, 1.8, 2.5) : null, now = 0;
  function quad(i, z, inset){ var c = i % Q.W, r = (i / Q.W) | 0, x0 = R.x0 + c * T + inset, y0 = R.y0 + r * T + inset, x1 = R.x0 + (c + 1) * T - inset, y1 = R.y0 + (r + 1) * T - inset;
    return [R.scr(x0, y0, z), R.scr(x1, y0, z), R.scr(x1, y1, z), R.scr(x0, y1, z)]; }
  function path(ctx, q){ ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]); for (var k = 1; k < 4; k++) ctx.lineTo(q[k][0], q[k][1]); ctx.closePath(); }
  return {
    lay:function(s){ if (s.t !== t){ t = s.t; swapAt = now; R.sfx('blip'); lanes.forEach(function(i){ var q = R.at(i); R.burst(q[0], q[1], DECK + 0.3, ['#ffffff', '#bfe6ff', '#7cc8f2'], 6, 1, 0.6); }); } },
    move:function(){},
    things:function(ds){ rocks.forEach(function(i){ var q = R.at(i); ds.push({ x:q[0], y:q[1], kd:function(e){ R.drawSprite(rock, e.x, e.y, ICE_H); } }); });
      if (bell) bells.forEach(function(i){ var q = R.at(i); ds.push({ x:q[0], y:q[1], kd:function(e){ var sw = R.reduce ? 0 : Math.max(0, 1 - (now - swapAt) / 0.8) * Math.sin((now - swapAt) * 30) * 0.12;
        R.drawSprite(bell, e.x + sw, e.y, SNOW_H); } }); }); },
    /* the lanes: what is in each one now, eased across a swap. Open water is black with a slow glint; ice is a pale
       sheet over it. Every lane tile has a frost blue rim, the bell's colour, so what the bell changes is marked. */
    ground:function(tsec){ now = tsec; if (!lanes.length) return; var ctx = R.ctx, kk = R.kk(), a = R.reduce ? 1 : Math.min(1, (tsec - swapAt) / 0.35), lw = Math.max(1, Math.round(kk * 0.9));
      ctx.save();
      lanes.forEach(function(i){ var wet = water(Q, { t:t }, i), ice = wet ? 1 - a : a, q = quad(i, DECK - 0.02, 0);
        path(ctx, q); ctx.fillStyle = WT[0]; ctx.fill();
        if (!R.reduce && ice < 1){ ctx.globalAlpha = 1 - ice; ctx.strokeStyle = WT[1]; ctx.lineWidth = lw; var c = i % Q.W, r = (i / Q.W) | 0;
          for (var k = 0; k < 2; k++){ var ph = (tsec * 0.6 + k * 0.5 + c * 0.13) % 1, y = R.y0 + (r + 0.25 + ph * 0.5) * T, p0 = R.scr(R.x0 + (c + 0.25) * T, y, DECK - 0.02), p1 = R.scr(R.x0 + (c + 0.6) * T, y, DECK - 0.02);
            ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke(); } }
        if (ice > 0){ ctx.globalAlpha = ice; path(ctx, quad(i, DECK - 0.02, T * 0.04)); ctx.fillStyle = IC[0]; ctx.fill();
          var s0 = quad(i, DECK - 0.02, T * 0.22); ctx.strokeStyle = IC[1]; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(s0[3][0], s0[3][1]); ctx.lineTo(s0[1][0], s0[1][1]); ctx.stroke(); }
        ctx.globalAlpha = 1; path(ctx, quad(i, DECK - 0.02, T * 0.03)); ctx.strokeStyle = '#3fb0ff'; ctx.lineWidth = Math.max(2, Math.round(kk * 1.4)); ctx.stroke(); });
      ctx.restore(); },
    // the bell is the one thing in here that does something when you reach it
    hot:function(){ return bells; } }; }

root.RTT_GYMKIND_ICE = { id:'ice', gyms:GYMS, input:'step', calm:true,
  parse:parse, init:init, key:key, act:act, step:act, moves:function(){ return [0, 1, 2, 3]; }, won:won,
  me:function(G, s){ return s.p; }, place:function(G, s, i){ return { p:i, t:s.t, v:0 }; },
  proof:proof, enc:enc, goal:function(){ return 'Slide to the vault. On ice you stop only when something stops you.'; },
  hello:'You slide till something stops you. Undo takes one back.', unit:'slide',
  tell:{ water:'That\'s open water. It won\'t hold you.', oneway:'That ice only runs one way.' },
  dur:function(how){ var n = +String(how).replace(/\D/g, '') || 1; return Math.min(0.75, 0.06 + n * 0.065); },
  floor:floor, mats:mats, view:view };
})();
