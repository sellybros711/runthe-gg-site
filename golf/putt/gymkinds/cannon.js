/* golf/putt/gymkinds/cannon.js: the HUMAN CANNONBALL kind of trail gym (RTT_GYMKIND_CANNON), the Big Top's. A kind file: the
   registry (gyms.js, its KINDS README) finds it by its global, the frame (trail.js) plays it, check-putt proves it.

   THE PUZZLE is the circus's, up in the rigging of the big top: platforms stand over the long drop to the ring, and nobody can walk
   across the drop. The circus cannons stand on the platforms, and a juggler's clubs lie about them, every one to be picked up
   before the vault (the show's strongbox under the far wall) will open. Walk into a cannon from behind, the way its barrel points,
   and he climbs in and it fires him: he flies straight out of its mouth over everything, the drop, the crates and the other
   cannons, and lands in the first safety net on that line. A cannon with no net down its line before the wall will not fire. And
   every time a cannon fires, the crew wheel every cannon in the tent round a quarter: a gold cannon turns clockwise and a silver
   one the other way. So the read is never only where a cannon points now, but where it will point after the next shot, and the
   order the shots are fired in is the puzzle.

   THE GATEKEEPER'S TWIST is Jellara's jelly pad, as the circus trampoline: step onto one and it throws him two tiles on, the way he
   was walking, over whatever is between, as long as there is somewhere to land; and a landing on another trampoline throws him on
   again. A throw fires no cannon and turns nothing.

   He moves TILE BY TILE (a step kind).

   THE LAYOUTS ARE HAND DESIGNED, never random. Row 0 is the far wall (the top of the screen), the last row the near wall with the
   gate in it. The frame's five characters (# G @ L C, gyms.js) and this kind's own:
     .  a platform         x  the drop (no way across but a cannon or a trampoline)         n  a safety net (he can walk on it)
     o  a crate (in the way, and a cannon flies over it)         j  a juggling club to pick up (on a platform)
     ^ > v <  a gold cannon pointing up, right, down or left (it turns clockwise every shot)
     u r d l  a silver cannon pointing up, right, down or left (it turns the other way)
     t  a trampoline (the gatekeeper's)
   THE STATE is { p, f, k }: his tile, the clubs picked up (a bit each) and how many shots have been fired, counted round in fours
   (four quarter turns bring every cannon back). A few hundred states, so solve() and audit() are the registry's own breadth first
   search (lib), and stuck() is looked up from one search of every state. */
(function(){
var root = typeof window !== 'undefined' ? window : globalThis;
var LIB = function(){ return root.RTT_PUTT_GYMS.lib; };

/* THE GYMS. moves and proof are the solver's fewest steps and one shortest solution (U R D L), recorded from solve().
   The civilian's lines nudge, never solve. */
var GYMS = [
/* THE RIGGING, mid-world: three platforms up in the tent over the drop, and four cannons. The lesson is the kind's one rule: a
     cannon fires you the way it points, and every shot turns them all. */
  { id:'bt1', kind:'cannon', world:'bigtop', leg:9, name:'The Rigging', badge:'Rigging Badge', mech:['cannon'], pay:500, look:{ wall:'plank' },
    hint:'Before you climb into a cannon, work out where it will point after the shot before it.',
    moves:31, proof:'LLLUDLUURRRRDLDDLDLUULLLLLRRRRU',
    who:{ look:{ skin:'medium', polo:'red', hat:'black', pants:'black', hair:'black', hairStyle:'short', cap:true, shoes:'black', gender:'male' } },
    say:['Climb into a cannon from behind. It fires you to the next net.',
      'Every shot turns every cannon. Gold turns one way and silver the other.',
      'Before you climb in, count the shots you have fired so far.'],
    rows:[
      '#####C#####',
      '#j.n......#',
      '#.....n.n.#',
      '#xxxxxxxxx#',
      '#..^xxxn.j#',
      '#.n.xxx...#',
      '#j..xxx.u.#',
      '#xxxxxxxxx#',
      '#.......n.#',
      '#.^...>j..#',
      '#L...@....#',
      '#####G#####'
    ] },
  /* THE HUMAN CANNONBALL, the gatekeeper: four platforms over the drop, six cannons and four trampolines, Jellara's jelly pads
     as the circus's own. It cannot be solved with the trampolines walled off (one club is out on a ledge only a trampoline
     reaches). Its hint is the one idea the room turns on, and nothing more. */
  { id:'bt2', kind:'cannon', world:'bigtop', leg:18, name:'The Human Cannonball', badge:'Cannonball Badge', mech:['cannon', 'hop'], pay:1000, keeper:true, look:{ wall:'plank' },
    hint:'The cannons only count the shots. A shot you did not need still turns every cannon for the next one.',
    moves:40, proof:'LLULDDLRDRRRRRUDRRUDLULLLRLUULLLLLLRRRRU',
    who:{ look:{ skin:'light', polo:'blue', hat:'red', pants:'white', hair:'red', hairStyle:'bun', cap:true, shoes:'red', gender:'female' } },
    say:['A trampoline throws you two tiles on. It needs somewhere to land.',
      'If a trampoline only wobbles, you are still standing on it. Step off it another way.',
      'Sometimes the way up starts with a trip back down.'],
    rows:[
      '#####C#####',
      '#j...n....#',
      '#.n....n..#',
      '#xxxxxxxxx#',
      '#xxxxxxxxx#',
      '#.^.xxx^..#',
      '#n.txjt.n.#',
      '#xxxxxxxxx#',
      '#t.n.x.nlj#',
      '#.>.tx....#',
      '#xxxxxxxxx#',
      '#.n.....n.#',
      '#j.^...v..#',
      '#L...@....#',
      '#####G#####'
    ] }
];

var DIRC = '^>v<', DIRL = 'urdl';
var PARSED = {};
function parse(G){ if (PARSED[G.id]) return PARSED[G.id]; var clubs = [], guns = [];
  var Q = LIB().room(G, function(ch, i){ if (ch === 'j') clubs.push(i); else if (DIRC.indexOf(ch) >= 0 || DIRL.indexOf(ch) >= 0) guns.push(i); else if ('xnot'.indexOf(ch) < 0) return false; });
  Q.clubs = clubs; Q.guns = guns; Q.full = (1 << clubs.length) - 1;
  Q.base = guns.map(function(i){ var ch = Q.cell[i]; return DIRC.indexOf(ch) >= 0 ? DIRC.indexOf(ch) : DIRL.indexOf(ch); });
  Q.spin = guns.map(function(i){ return DIRC.indexOf(Q.cell[i]) >= 0 ? 1 : -1; }); return PARSED[G.id] = Q; }
function init(G){ var Q = parse(G); return { p:Q.start, f:0, k:0 }; }
function key(s){ return s.p + ':' + s.f + ':' + s.k; }
// the way cannon g points after k shots
function aim(Q, g, k){ return ((Q.base[g] + Q.spin[g] * k) % 4 + 4) % 4; }
// can he stand on tile i
function stand(Q, i){ if (i < 0) return false; var ch = Q.cell[i]; return ch === '.' || ch === 'n' || ch === 'j' || ch === 't'; }
// the first net down the line from tile i going d, or -1 (a wall stops the flight short of it)
function netFrom(Q, i, d){ var L = LIB(), at = L.nb(Q, i, d); while (at >= 0 && Q.cell[at] !== '#' && Q.cell[at] !== 'G' && Q.cell[at] !== 'C' && Q.cell[at] !== 'L'){ if (Q.cell[at] === 'n') return at; at = L.nb(Q, at, d); } return -1; }
// picked up on arrival at tile i
function pick(Q, f, i){ var kc = Q.clubs.indexOf(i); return kc >= 0 ? f | (1 << kc) : f; }
/* ONE STEP. The frame's tiles first (the gate, the lever, the vault, shut till every club is picked up). Into a cannon from behind,
   it fires him to the first net down its line, and every cannon turns a quarter its own way; from any other side he only bumps it.
   Onto a trampoline, it throws him two tiles on if he can land there, again and again while he lands on trampolines. */
function act(G, s, dir){ var Q = parse(G), L = LIB(), n = L.nb(Q, s.p, dir);
  if (n >= 0 && n === Q.chest && s.f !== Q.full) return { s:s, ev:'shut', moves:[] };
  var fr = L.frameStep(G, Q, s, s.p, dir, init); if (fr) return fr;
  var g = Q.guns.indexOf(n);
  if (g >= 0){ if (aim(Q, g, s.k) !== dir) return { s:s, ev:Q.cell[s.p] === 'x' ? 'bump' : 'side', moves:[] };
    var to = netFrom(Q, n, dir); if (to < 0) return { s:s, ev:'nonet', moves:[] };
    return { s:{ p:to, f:pick(Q, s.f, to), k:(s.k + 1) % 4 }, ev:'fire', moves:[['me', s.p, n, 'walk'], ['me', n, to, 'fly'], ['gun', n, (s.k + 1) % 4, 'turn']] }; }
  if (!stand(Q, n)) return { s:s, ev:Q.cell[n] === 'x' ? 'drop' : 'bump', moves:[] };
  var mv = [['me', s.p, n, 'walk']], at = n, ev = 'step', guard = 0;
  while (Q.cell[at] === 't' && guard++ < 12){ var a1 = L.nb(Q, at, dir), a2 = a1 >= 0 ? L.nb(Q, a1, dir) : -1;
    if (a1 < 0 || Q.cell[a1] === '#' || Q.cell[a1] === 'G' || Q.cell[a1] === 'C' || Q.cell[a1] === 'L' || !stand(Q, a2)){ if (ev === 'step') ev = 'wobble'; break; }
    mv.push(['me', at, a2, 'bounce']); at = a2; ev = 'bounce'; }
  var f = pick(Q, s.f, at); if (f !== s.f){ mv.push(['club', at, at, 'pick']); if (ev === 'step') ev = 'club'; }
  return { s:{ p:at, f:f, k:s.k }, ev:ev, moves:mv }; }
function moves(){ return [0, 1, 2, 3]; }
/* STUCK, looked up: every state a player can reach is searched once (lib.explore), and those the vault can still be reached from
   without the lever are kept; any other state is stuck. */
var GOOD = {};
function goodOf(G){ if (GOOD[G.id]) return GOOD[G.id]; var K = root.RTT_GYMKIND_CANNON, X = LIB().explore(K, G), N = X.list.length, back = [], i, ok = {};
  for (i = 0; i < N; i++) back.push([]); X.edges.forEach(function(e){ if (!e[2]) back[e[1]].push(e[0]); });
  var good = new Uint8Array(N), q = X.wins.map(function(w){ return w[0]; }); q.forEach(function(w){ good[w] = 1; });
  for (var hh = 0; hh < q.length; hh++) back[q[hh]].forEach(function(pp){ if (!good[pp]){ good[pp] = 1; q.push(pp); } });
  for (i = 0; i < N; i++) if (good[i]) ok[key(X.list[i])] = 1; return GOOD[G.id] = ok; }
function stuck(G, s){ return !goodOf(G)[key(s)]; }
function proof(G){ return (G.proof || '').split('').map(function(ch){ return 'URDL'.indexOf(ch); }); }
function enc(path){ return path.map(function(d){ return 'URDL'.charAt(d); }).join(''); }
function goal(){ return 'Pick up every juggling club. Then reach the chest.'; }

/* ---- THE LOOK: the platforms are boards painted red and cream in the light of the tent, the drop is the dark of the tent far
   below with the ring's sawdust showing faint at the bottom, a net is a square of cream rope mesh. A cannon is a barrel on a
   carriage, red and gold or blue and silver, pointing where it points now; a club is a white juggling club with a red band; a crate
   is a costume trunk; a trampoline is a round black bed in a red frame. */
var DECK = 0.45;
function floor(gc){ if (gc.k === '#') return null; var dr = gc.k === 'x', nt = gc.k === 'n';
  return { h:dr ? DECK - 0.9 : nt ? DECK - 0.08 : DECK, mat:['btfloor', { gu:gc.u, gv:gc.v, wk:dr ? 1 : nt ? 2 : 0 }] }; }
function mats(){ return {
  btfloor:['', '', '', 0, function(c, R, h3){ var u = c.gu || 0, v = c.gv || 0, k = c.wk || 0, n = h3(c.ti, c.tj, 343);
    if (c.dt < 0) return R('#2a1418');
    if (k === 1){ return R(n > 0.97 ? '#d8b878' : n > 0.6 ? '#1a0e1e' : '#140a16'); }
    if (k === 2){ var m = Math.abs(((u * 5) % 1) - 0.5) < 0.09 || Math.abs(((v * 5) % 1) - 0.5) < 0.09; if (u < 0.05 || u > 0.95 || v < 0.05 || v > 0.95) return R('#8a6a3a'); return R(m ? '#f4ecd8' : '#2a1a22'); }
    if (u < 0.03 || u > 0.97 || v < 0.03 || v > 0.97) return R('#5a1418'); var pl = Math.floor(u * 4) % 2; return R(n > 0.94 ? '#e8d0a0' : pl ? '#b8323a' : '#c8403a'); }] }; }

function gunFn(gold, d){ var V = [[0, -1], [1, 0], [0, 1], [-1, 0]][d], ux = V[0], uy = V[1], px = -uy, py = ux; return function(B){ B.vox(-0.8, -0.8, 0, 0.8, 0.8, 1.2, function(set){
  var body = gold ? '#c8302a' : '#2a4ab8', trim = gold ? '#f4c840' : '#d8dce6', wood = function(){ return '#5a3a1e'; }, tr = function(){ return trim; };
  B.blob(set, 0, 0, 0.3, 0.5, 0.5, 0.24, wood);
  B.tube(set, -ux * 0.55, -uy * 0.55, 0.6, ux * 0.62, uy * 0.62, 0.74, 0.3, 0.22, body);
  B.tube(set, ux * 0.58, uy * 0.58, 0.73, ux * 0.66, uy * 0.66, 0.74, 0.25, 0.25, trim); B.tube(set, -ux * 0.55, -uy * 0.55, 0.6, -ux * 0.62, -uy * 0.62, 0.6, 0.32, 0.32, trim);
  B.blob(set, px * 0.45, py * 0.45, 0.3, Math.abs(px) * 0.12 + Math.abs(py) * 0.3, Math.abs(py) * 0.12 + Math.abs(px) * 0.3, 0.3, tr);
  B.blob(set, -px * 0.45, -py * 0.45, 0.3, Math.abs(px) * 0.12 + Math.abs(py) * 0.3, Math.abs(py) * 0.12 + Math.abs(px) * 0.3, 0.3, tr); }, 0.06); }; }
function clubFn(B){ B.vox(-0.5, -0.5, 0, 0.5, 0.5, 1.1, function(set){ B.tube(set, 0, 0, 0.05, 0, 0, 0.5, 0.06, 0.16, '#fbf8f0'); B.tube(set, 0, 0, 0.5, 0, 0, 0.95, 0.16, 0.1, '#fbf8f0'); B.tube(set, 0, 0, 0.38, 0, 0, 0.46, 0.17, 0.17, '#c8302a'); }, 0.04); }
function crateFn(B){ B.vox(-0.8, -0.8, 0, 0.8, 0.8, 0.9, function(set){ B.blob(set, 0, 0, 0.42, 0.62, 0.5, 0.42, function(x, y, z){ return Math.abs(x) > 0.5 && Math.abs(y) > 0.38 ? '#e0b030' : z > 0.72 ? '#8a5a32' : '#6a4428'; }); }, 0.06); }
function trampFn(B){ B.vox(-0.8, -0.8, 0, 0.8, 0.8, 0.5, function(set){ B.tube(set, 0, 0, 0.05, 0, 0, 0.34, 0.62, 0.62, '#c8302a'); B.tube(set, 0, 0, 0.34, 0, 0, 0.38, 0.5, 0.5, '#1a1a22'); }, 0.05); }

function view(R){ var Q = R.Q, ctx = R.ctx, s0 = null;
  var spGold = [], spSilv = [], spC = R.sprite('gymbtclub', clubFn, 1, 1, 1.1), spO = R.sprite('gymbtcrate', crateFn, 1.6, 1.6, 0.9), spT = R.sprite('gymbttramp', trampFn, 1.6, 1.6, 0.5);
  // a cannon is drawn pointing each way: four sprites a colour
  for (var d = 0; d < 4; d++){ spGold.push(R.sprite('gymbtgun_g' + d, gunFn(true, d), 1.6, 1.6, 1.2)); spSilv.push(R.sprite('gymbtgun_s' + d, gunFn(false, d), 1.6, 1.6, 1.2)); }
  return {
    lay:function(s){ s0 = s; },
    move:function(m, u){ if (u < 1) return; var w = R.at(m[2]); if (m[0] === 'club'){ R.burst(w[0], w[1], DECK + 0.8, ['#ffffff', '#c8302a', '#f4c840'], 14, 0.8, 0.8); R.sfx('blip'); }
      else if (m[0] === 'gun'){ var g = R.at(m[1]); R.burst(g[0], g[1], DECK + 0.9, ['#ffe08a', '#ff8a3a', '#e8e8e8'], 26, 1, 1.2); R.sfx('blip'); } },
    things:function(ds){ if (!s0) return; var s = s0;
      for (var i = 0; i < Q.cell.length; i++){ (function(i){ var ch = Q.cell[i], w = R.at(i), g = Q.guns.indexOf(i);
        if (g >= 0){ var a = aim(Q, g, s.k); ds.push({ x:w[0], y:w[1], kd:function(){ R.drawSprite(Q.spin[g] > 0 ? spGold[a] : spSilv[a], w[0], w[1], DECK); } }); }
        else if (ch === 'o') ds.push({ x:w[0], y:w[1], kd:function(){ R.drawSprite(spO, w[0], w[1], DECK); } });
        else if (ch === 't') ds.push({ x:w[0], y:w[1], kd:function(){ R.drawSprite(spT, w[0], w[1], DECK); } });
        else if (ch === 'j' && !(s.f >> Q.clubs.indexOf(i) & 1)) ds.push({ x:w[0], y:w[1], kd:function(){ R.drawSprite(spC, w[0], w[1], DECK); } }); })(i); } },
    ground:function(){},
    hot:function(){ return []; } }; }

root.RTT_GYMKIND_CANNON = { id:'cannon', gyms:GYMS, input:'step', calm:true, unit:'step', hello:'Walk into a cannon from behind and it fires you. Every shot turns every cannon.',
  parse:parse, init:init, key:key, act:act, step:act, moves:moves, stuck:stuck, proof:proof, enc:enc, goal:goal,
  me:function(G, s){ return s.p; }, place:function(G, s, i){ return { p:i, f:s.f, k:s.k }; },
  deck:function(G, s, i){ var Q = parse(G); return stand(Q, i) || i === Q.lever; },
  tell:{ fire:'Boom! Every cannon turns a quarter.', club:'A juggling club. Got it.', side:'Climb in from behind. That is the way it fires.', nonet:'No net down that line. It will not fire.', drop:'Too far to jump. Find a cannon.', bounce:'Boing! The trampoline throws you on.', wobble:'Nowhere to land. The trampoline only wobbles.', shut:'Not yet. Pick up every club first.',
    stuck:'No cannon can take you where you need to go. Undo it, or Restart.' },
  dur:function(how){ return how === 'fly' ? 0.4 : how === 'bounce' ? 0.2 : how === 'turn' || how === 'pick' ? 0.05 : 0.15; },
  floor:floor, mats:mats, view:view };
})();
