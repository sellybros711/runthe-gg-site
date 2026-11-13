/* golf/putt/gymkinds/herald.js: the HERALD kind of trail gym (RTT_GYMKIND_HERALD), Olympus's. A kind file: the registry
   (gyms.js, its KINDS README) finds it by its global, the frame (trail.js) plays it, check-putt proves it.

   THE PUZZLE. He is Hermes' runner in the halls of Olympus, among the clouds, and he carries the gods' messages. Each god has a
   seat in the hall, and each has one sealed scroll lying somewhere on the floor. He can carry ONE scroll at a time: step onto a
   scroll with his hands empty and he picks it up, and with a scroll already in his hands he only walks over the next one. Step
   onto a god's seat with that god's scroll and the message is given, his hands are free again, and that god opens the bronze
   doors that are hers or his. The vault opens once every god has had their message. So a scroll is never only something to
   fetch: one lying in a doorway is picked up the moment he steps there, and then the scroll he wanted has to wait. The puzzle
   is the round, which messages to carry first and which way to walk so as not to pick up the wrong one too soon.

   THE GATEKEEPER'S TWIST is Jellara's jelly pad, as Hermes' winged sandals: step onto the sandals and they fly him two tiles on,
   the way he was walking, over whatever is in between (the open sky, a cloud, a shut door, never a wall). With nowhere to land
   they only flutter, and he stays standing on them. A flight that lands on a scroll picks it up the same as a step.

   He moves TILE BY TILE (a step kind). A bump into a wall, the sky, a cloud or a shut door is no step.

   THE LAYOUTS ARE HAND DESIGNED, never random. Row 0 is the far wall (the top of the screen), the last row the near wall with the
   gate in it. The frame's five characters (# G @ L C, gyms.js) and this kind's own:
     a b d   a god's sealed scroll             A B D   that god's seat (step on it with the scroll to give it)
     1 2 3   a bronze door, opened for good once the scroll of a, b or d is given
     ~   the open sky (he cannot walk on it)     r   a bank of cloud (stops him)     s   the winged sandals (the gatekeeper's)

   THE STATE is { p, k, h, d }: where he stands, the scrolls picked up (a bit a god), the scroll in his hands (0 none, else the
   god's number plus one) and the messages given (a bit a god). A few thousand states, so solve() and audit() are the registry's
   own breadth first search (lib). */
(function(){
var root = typeof window !== 'undefined' ? window : globalThis;
var LIB = function(){ return root.RTT_PUTT_GYMS.lib; };

/* THE GYMS. moves and proof are the solver's fewest steps and one shortest solution (U R D L), recorded from solve().
   The civilian's lines nudge, never solve. */
var GYMS = [
  /* THE MESSENGER'S ROUND, mid-world: Zeus and Hera, two scrolls side by side by the gate, and Zeus' seat behind Hera's door. */
  { id:'oly1', kind:'herald', world:'olympus', leg:9, name:'The Messenger’s Round', badge:'Caduceus Badge', mech:['herald'], pay:500, look:{ wall:'stone' },
    moves:30, proof:'ULURRRUURUUDDDDLLLUUUUULLLRRRU',
    who:{ look:{ skin:'light', polo:'white', hat:'white', pants:'white', hair:'brown', hairStyle:'curly', cap:false, shoes:'gold', gender:'female' } },
    say:['One scroll at a time. Step on a scroll with empty hands and it is yours to carry.',
      'Each god opens their own doors once their message comes. Who opens the way to whom?',
      'Look at where each scroll lies before you walk. Some are easy to pick up too soon.'],
    rows:[
      '####C####',
      '#A.2.#..#',
      '#..#.#.B#',
      '#r~#.#~.#',
      '#..~.~..#',
      '#..r.r..#',
      '#..ba...#',
      '#.......#',
      '#L..@...#',
      '####G####'
    ] },
  /* THE GATE OF THE HOURS, the gatekeeper: Zeus, Hera and Athena, a band of open sky across the hall, and Hermes' winged sandals
     that fly him over it one way on each shore. */
  { id:'oly2', kind:'herald', world:'olympus', leg:18, name:'The Gate of the Hours', badge:'Thunderbolt Badge', mech:['herald', 'hop'], pay:1000, keeper:true, look:{ wall:'stone' },
    hint:'Athena opens the way to Zeus. Her message lies across the sky, so make the first crossing with empty hands.',
    moves:51, proof:'LULUURRRDDLLLLURDLLUURRUULLULRDRRRRUDLLDDLLLRRRUUUU',
    who:{ look:{ skin:'light', polo:'white', hat:'white', pants:'white', hair:'black', hairStyle:'bun', cap:false, shoes:'gold', gender:'female' } },
    say:['The sandals fly you two tiles on, the way you walked onto them.',
      'A flight can only go one way. Think about how you will get back.',
      'A scroll you fly onto is picked up, the same as one you walk onto.'],
    rows:[
      '####C####',
      '#A.#.#b.#',
      '#..3.1..#',
      '#r##.##r#',
      '#B..d...#',
      '#....s..#',
      '#~~~~~~~#',
      '#.s.....#',
      '#D..a...#',
      '#L..@...#',
      '####G####'
    ] }
];

var PARSED = {}, LET = 'abd', SEAT = 'ABD', DOOR = '123';
/* THE ROOM: the frame's five through lib.room, and the kind's own. Q.scroll[j] and Q.seat[j] are god j's scroll and seat tiles,
   Q.door maps a door tile to its god, Q.rock marks the clouds and the sky, Q.sky the sky alone, Q.pad the sandals. */
function parse(G){ if (PARSED[G.id]) return PARSED[G.id]; var scroll = [], seat = [], door = {}, rock = {}, sky = {}, pad = {};
  var Q = LIB().room(G, function(ch, i){ var j = LET.indexOf(ch); if (j >= 0){ scroll[j] = i; return; } j = SEAT.indexOf(ch); if (j >= 0){ seat[j] = i; return; }
    j = DOOR.indexOf(ch); if (j >= 0){ door[i] = j; return; } if (ch === 'r'){ rock[i] = 1; return; } if (ch === '~'){ rock[i] = 1; sky[i] = 1; return; } if (ch === 's'){ pad[i] = 1; return; } return false; });
  var n = 0; for (var j = 0; j < 3; j++){ if ((scroll[j] == null) !== (seat[j] == null)) throw new Error(G.id + ': god ' + LET.charAt(j) + ' needs a scroll and a seat'); if (scroll[j] != null) n = j + 1; }
  Q.scroll = scroll; Q.seat = seat; Q.door = door; Q.rock = rock; Q.sky = sky; Q.pad = pad; Q.n = n; Q.allD = 0;
  for (j = 0; j < n; j++) if (scroll[j] != null) Q.allD |= 1 << j;
  return PARSED[G.id] = Q; }
function init(G){ return { p:parse(G).start, k:0, h:0, d:0 }; }
function key(s){ return s.p + ':' + s.k + ':' + s.h + ':' + s.d; }
// can he stand on tile n with the messages given as d
function open(Q, d, n){ if (n < 0) return false; var ch = Q.cell[n]; if (ch === '#' || Q.rock[n] || n === Q.lever || n === Q.chest || n === Q.gate) return false;
  var j = Q.door[n]; return j == null || !!(d & (1 << j)); }
// what the tile he arrives on does: a scroll picked up with empty hands, a message given at its god's seat
function arrive(Q, st, n, mv){ var k = st.k, h = st.h, d = st.d, ev = null, j;
  for (j = 0; j < Q.n; j++){ if (Q.scroll[j] === n && !(k & (1 << j))){ if (!h){ k |= 1 << j; h = j + 1; mv.push(['scroll', n, n, 'take']); ev = 'take'; } else ev = 'full'; } }
  for (j = 0; j < Q.n; j++){ if (Q.seat[j] === n){ if (h === j + 1){ d |= 1 << j; h = 0; mv.push(['seat', n, n, 'give']); ev = 'give'; } else if (h) ev = 'wrong'; } }
  return { p:n, k:k, h:h, d:d, ev:ev }; }

/* ONE STEP. The frame's tiles first (the gate, the lever); the vault opens once every message is given. Then the walk, and what
   the tile he arrives on does; the sandals fly him two tiles on if he can land there, and the landing tile does its part too. */
function act(G, s, dir){ var Q = parse(G), L = LIB(), n = L.nb(Q, s.p, dir);
  if (n === Q.chest) return s.d === Q.allD ? { s:s, ev:'open', moves:[] } : { s:s, ev:'shut', moves:[] };
  var f = L.frameStep(G, Q, s, s.p, dir, init); if (f) return f;
  if (!open(Q, s.d, n)) return { s:s, ev:'bump', moves:[] };
  var mv = [['me', s.p, n, 'walk']], a = arrive(Q, s, n, mv), ev = a.ev || 'step', guard = 0;
  while (Q.pad[a.p] && guard++ < 20){ var mid = L.nb(Q, a.p, dir), land = mid < 0 || Q.cell[mid] === '#' ? -1 : L.nb(Q, mid, dir);
    if (land >= 0 && open(Q, a.d, land)){ mv.push(['pad', a.p, a.p, 'flap'], ['me', a.p, land, 'fly']); var b = arrive(Q, a, land, mv); ev = b.ev && b.ev !== 'full' && b.ev !== 'wrong' ? b.ev : 'fly'; a = b; continue; }
    mv.push(['pad', a.p, a.p, 'flutter']); if (ev === 'step') ev = 'flutter'; break; }
  return { s:{ p:a.p, k:a.k, h:a.h, d:a.d }, ev:ev, moves:mv }; }
function moves(){ return [0, 1, 2, 3]; }
function proof(G){ return (G.proof || '').split('').map(function(ch){ return 'URDL'.indexOf(ch); }); }
function enc(path){ return path.map(function(d){ return 'URDL'.charAt(d); }).join(''); }
function goal(){ return 'Carry each god their message, then step into the vault.'; }

/* ---- THE LOOK: the floor is white marble slabs with a thin gold line between them, the sky a sunken band of deep blue with soft
   white cloud drifting in it, a cloud bank a heap of soft white cloud, a god's seat a gold dais with a white throne on it, a door
   a pair of bronze leaves (gone once it is open), the sandals a pair of gold sandals with white wings. The scrolls are rolled
   parchment tied with the god's colour; a scroll he carries rides in his hand. */
var DECK = 0.45, GOD = ['#e8b830', '#8a5ad8', '#3a8ad8'];
function floor(gc){ if (gc.k === '#') return null; var k = gc.k === '~' ? 1 : SEAT.indexOf(gc.k) >= 0 ? 2 : 0;
  return { h:k === 1 ? DECK - 0.3 : DECK, mat:['hrfloor', { gu:gc.u, gv:gc.v, hk:k, gs:SEAT.indexOf(gc.k) }] }; }
function mats(){ return {
  hrfloor:['', '', '', 0, function(c, R, h3){ var u = c.gu || 0, v = c.gv || 0, k = c.hk || 0, n = h3(c.ti, c.tj, 99);
    if (k === 1){ var w = Math.sin(c.ti * 0.21 + Math.sin(c.tj * 0.17) * 2) + Math.sin(c.tj * 0.13 - c.ti * 0.07); return R(w > 1.1 ? '#e8eef8' : w > 0.6 ? '#9ab4e0' : n > 0.6 ? '#3a5aa8' : '#2e4a96'); }
    if (k === 2){ if (c.dt < 0 || u < 0.08 || u > 0.92 || v < 0.08 || v > 0.92) return R('#b8963a'); return R(n > 0.7 ? '#ffe9a0' : '#e8c860'); }
    if (c.dt < 0 || u < 0.04 || u > 0.96 || v < 0.04 || v > 0.96) return R('#d8b850');
    return R(n < 0.12 ? '#e2ded4' : n > 0.9 ? '#ffffff' : '#f4f2ec'); }] }; }

function view(R){ var Q = R.Q, T = R.T, ctx = R.ctx, s0 = null, fl = {};
  function P(x, y, z){ return R.scr(x, y, z == null ? DECK + 0.015 : z); }
  // a bank of cloud: soft white lobes, blue grey beneath
  function cloud(x, y, tsec, i){ var b = P(x, y, DECK), e = P(x + T * 0.45, y, DECK), rx = Math.max(4, Math.abs(e[0] - b[0])), dr = R.reduce ? 0 : Math.sin(tsec * 0.8 + i) * rx * 0.04;
    [[-0.5, -0.3, 0.55, '#c8d6ee'], [0.5, -0.3, 0.55, '#c8d6ee'], [-0.45, -0.55, 0.5, '#ffffff'], [0.45, -0.55, 0.5, '#ffffff'], [0, -0.8, 0.6, '#ffffff'], [0.15, -0.95, 0.3, '#f8fbff']].forEach(function(q){
      ctx.fillStyle = q[3]; ctx.beginPath(); ctx.arc(b[0] + q[0] * rx + dr, b[1] + q[1] * rx, q[2] * rx, 0, 7); ctx.fill(); }); }
  // a god's seat: a white throne on the gold dais, a ribbon of the god's colour, lit once the message is given
  function seat(x, y, j, given){ var b = P(x, y, DECK), e = P(x + T * 0.4, y, DECK), rx = Math.max(4, Math.abs(e[0] - b[0]));
    if (given){ ctx.fillStyle = 'rgba(255,240,180,0.45)'; ctx.beginPath(); ctx.ellipse(b[0], b[1] - rx * 0.6, rx * 1.1, rx * 1.3, 0, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#d8d4ca'; ctx.fillRect(Math.round(b[0] - rx * 0.6), Math.round(b[1] - rx * 1.5), Math.round(rx * 1.2), Math.round(rx * 1.1));
    ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(b[0] - rx * 0.7), Math.round(b[1] - rx * 0.6), Math.round(rx * 1.4), Math.round(rx * 0.45));
    ctx.fillStyle = GOD[j]; ctx.fillRect(Math.round(b[0] - rx * 0.6), Math.round(b[1] - rx * 1.5), Math.round(rx * 1.2), Math.max(1, Math.round(rx * 0.2))); }
  // a bronze door: two leaves in its frame, while it is shut
  function door(x, y, j){ var b = P(x, y, DECK), e = P(x + T * 0.5, y, DECK), rx = Math.max(4, Math.abs(e[0] - b[0])), h = rx * 1.8;
    ctx.fillStyle = '#7a4a1a'; ctx.fillRect(Math.round(b[0] - rx), Math.round(b[1] - h), Math.round(rx * 2), Math.round(h));
    ctx.fillStyle = '#d8963c'; ctx.fillRect(Math.round(b[0] - rx * 0.9), Math.round(b[1] - h * 0.94), Math.round(rx * 0.86), Math.round(h * 0.9)); ctx.fillRect(Math.round(b[0] + rx * 0.04), Math.round(b[1] - h * 0.94), Math.round(rx * 0.86), Math.round(h * 0.9));
    ctx.fillStyle = GOD[j]; ctx.beginPath(); ctx.arc(b[0], b[1] - h * 0.55, rx * 0.22, 0, 7); ctx.fill(); }
  // a scroll lying on the floor (or in his hand): rolled parchment tied with the god's colour
  function scroll(x, y, z, j, tsec){ var c = P(x, y, z), e = P(x + T * 0.3, y, z), rx = Math.max(3, Math.abs(e[0] - c[0])), g = R.reduce ? 0 : Math.sin(tsec * 2.4 + j) * rx * 0.08;
    ctx.fillStyle = '#c8b48a'; ctx.beginPath(); ctx.ellipse(c[0], c[1] + g + rx * 0.1, rx, rx * 0.32, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#f4ead0'; ctx.beginPath(); ctx.ellipse(c[0], c[1] + g, rx, rx * 0.3, 0, 0, 7); ctx.fill();
    ctx.fillStyle = GOD[j]; ctx.fillRect(Math.round(c[0] - rx * 0.12), Math.round(c[1] + g - rx * 0.32), Math.max(1, Math.round(rx * 0.24)), Math.max(1, Math.round(rx * 0.66))); }
  // the winged sandals: a pair of gold sandals, a white wing at each heel, fluttering
  function sandals(x, y, tsec, i){ var c = P(x, y, DECK + 0.02), e = P(x + T * 0.4, y), rx = Math.max(3, Math.abs(e[0] - c[0])), q = fl[i] || 0, wf = R.reduce ? 0.2 : 0.2 + Math.sin(tsec * 6 + i) * 0.15 + q * 0.4;
    [-0.35, 0.35].forEach(function(o){ ctx.fillStyle = '#b8963a'; ctx.beginPath(); ctx.ellipse(c[0] + o * rx, c[1], rx * 0.22, rx * 0.5, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#e8c860'; ctx.beginPath(); ctx.ellipse(c[0] + o * rx, c[1] - rx * 0.04, rx * 0.16, rx * 0.42, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(c[0] + o * rx, c[1] + rx * 0.3); ctx.lineTo(c[0] + o * rx + Math.sign(o) * rx * 0.55, c[1] + rx * (0.1 - wf)); ctx.lineTo(c[0] + o * rx + Math.sign(o) * rx * 0.2, c[1] + rx * 0.38); ctx.closePath(); ctx.fill(); }); }
  return {
    lay:function(s){ s0 = s; fl = {}; },
    move:function(m, u){ if (m[0] === 'pad'){ fl[m[1]] = Math.sin(Math.PI * u); if (u >= 1){ fl[m[1]] = 0; if (m[3] === 'flap'){ var q = R.at(m[1]); R.burst(q[0], q[1], DECK + 0.3, ['#ffffff', '#ffe9a0'], 8, 0.7, 0.6); R.sfx('blip'); } } return; }
      if (u < 1) return; var w = R.at(m[1]);
      if (m[0] === 'scroll'){ R.burst(w[0], w[1], DECK + 0.3, ['#ffffff', '#f4ead0', '#e8c860'], 8, 0.8, 0.6); R.sfx('blip'); }
      if (m[0] === 'seat'){ R.burst(w[0], w[1], DECK + 0.6, ['#ffffff', '#ffe9a0', '#e8b830'], 14, 0.9, 0.8); R.sfx('blip'); } },
    things:function(ds, tsec){ if (!s0) return; var s = s0;
      Object.keys(Q.rock).forEach(function(t){ var i = +t; if (Q.sky[i]) return; var w = R.at(i); ds.push({ x:w[0], y:w[1], kd:function(e, ts){ cloud(w[0], w[1], ts || tsec, i); } }); });
      Object.keys(Q.door).forEach(function(t){ var i = +t, j = Q.door[i]; if (s.d & (1 << j)) return; var w = R.at(i); ds.push({ x:w[0], y:w[1], kd:function(){ door(w[0], w[1], j); } }); });
      Object.keys(Q.pad).forEach(function(t){ var i = +t, w = R.at(i); ds.push({ x:w[0], y:w[1], kd:function(e, ts){ sandals(w[0], w[1], ts || tsec, i); } }); });
      for (var j = 0; j < Q.n; j++){ (function(j){ if (Q.seat[j] == null) return; var w = R.at(Q.seat[j]); ds.push({ x:w[0], y:w[1] - T * 0.2, kd:function(){ seat(w[0], w[1] - T * 0.2, j, !!(s.d & (1 << j))); } });
        if (Q.scroll[j] != null && !(s.k & (1 << j))){ var v = R.at(Q.scroll[j]); ds.push({ x:v[0], y:v[1], kd:function(e, ts){ scroll(v[0], v[1], DECK + T * 0.08, j, ts || tsec); } }); } })(j); }
      // the scroll in his hands rides over his tile
      if (s.h){ var me = R.at(s.p), hj = s.h - 1; ds.push({ x:me[0], y:me[1] + T * 0.3, kd:function(e, ts){ scroll(me[0], me[1] + T * 0.3, DECK + T * 0.9, hj, ts || tsec); } }); } },
    hot:function(){ return []; },
    ground:function(){ } }; }

root.RTT_GYMKIND_HERALD = { id:'herald', gyms:GYMS, input:'step', calm:true, unit:'step', hello:'Carry one scroll at a time. Give each god their own.',
  parse:parse, init:init, key:key, act:act, step:act, moves:moves, proof:proof, enc:enc, goal:goal,
  me:function(G, s){ return s.p; }, place:function(G, s, i){ return { p:i, k:s.k, h:s.h, d:s.d }; },
  deck:function(G, s, i){ var Q = parse(G); return open(Q, s.d, i) || i === Q.lever; },
  tell:{ shut:'The vault stays shut. A god still waits for a message.', take:'A scroll. You carry it now.', full:'Your hands are full. One scroll at a time.', give:'The message is given. Their doors open.',
    wrong:'That scroll is for another god.', fly:'The winged sandals fly you on.', flutter:'The sandals flutter. Nowhere to land.', stuck:'No way to finish from here. Undo it, or Restart.' },
  dur:function(how){ return how === 'fly' ? 0.32 : how === 'flap' || how === 'flutter' ? 0.14 : 0.15; },
  floor:floor, mats:mats, view:view };
})();
