/* golf/putt/gyms.js: the trail gyms, Putt Putt's puzzles between holes (RTT_PUTT_GYMS). THE KIND REGISTRY.

   The owner's brief (2026-10-16): "much more intricate and puzzling, more sparse, and much more rewarding", inspired
   by Pokemon gyms. Two a world: one mid-world, and one guarding the trail into the world's last hole. And (2026-10-17)
   every world gets a genuinely DIFFERENT KIND of puzzle, not one puzzle reskinned. So a gym is a ROOM (walls, a gate,
   a lever, a vault chest: the FRAME, the same in every world) with a KIND of puzzle inside it. This file is the
   registry that finds the kinds and answers for them; each kind lives in its own file under golf/putt/gymkinds/.

   It draws nothing and touches no record. trail.js lays a gym into its trail and plays it (the frame: the room, the
   camera, the civilian, the docked panel, the controls, undo), putt.js pays for it. It runs in node too: check-putt.mjs
   and econ-sim.mjs load it with every kind file (gyms-node.mjs) to solve and price every gym.

   ================================================================================================= KINDS README
   For the builder of a new kind. Read this, then golf/putt/gymkinds/push.js (the live kind, Pirate Cove) and
   golf/putt/gymkinds/example.js (a tiny tap kind in no world, there to be copied).

   ONE FILE A KIND, ONE GLOBAL A FILE. A kind is golf/putt/gymkinds/<id>.js, inside one function wrapper, publishing
   exactly one global named RTT_GYMKIND_<ID> (the id in capitals: push.js publishes RTT_GYMKIND_PUSH). Its gyms (the
   layouts, the civilian, the pay) live in that same file. It touches nothing shared: the registry FINDS kinds by
   that prefix (it scans the globals, so there is no list here to edit and no shared object to push into), and
   check-putt finds the files by listing gymkinds/. Kinds never call each other.

   ADDING ONE, in one commit:
     1. golf/putt/gymkinds/<id>.js, as below.
     2. golf/index.html: <script defer src="putt/gymkinds/<id>.js?v=1"></script>, after gyms.js and before trail.js.
        A later change to the file bumps its ?v=.
     3. node scripts/check-cachebust.mjs --update, then node golf/putt/check-putt.mjs. Section 5b picks the file up
        by itself: it solves each of its gyms, replays the recorded proof, audits it, and holds the claims every gym is held to.
        It also fails a kind file that has gyms in a world but no script tag on the page.
     4. Its world stops carrying small trail puzzles by itself (putt.js asks gymWorld()); nothing to wire.

   A GYM ENTRY (in the kind's gyms list): { id, kind, world, leg (9 mid-world, 18 the gatekeeper), name, badge, pay
   (500, or 1000 with keeper:true), keeper, mech (the mid-world gym's one mechanic; the gatekeeper's is that and an
   earlier world's, a pair check-putt holds), look:{ wall:'stone'|'plank' }, who:{ look } (the civilian), say:[three
   lines: a nudge, a plainer one after two resets, a warmer one after five; never the moves or a position], moves and
   proof (the solver's fewest moves and one shortest solution, recorded from solve(), never hand written), rows (the
   room), goal (optional: overrides the kind's goal line) }. world:null with test:true keeps a gym out of every world.

   THE ROOM (rows, row 0 the far wall at the top of the screen, the last row the near wall). The frame reads five
   characters and the kind reads the rest:   #  wall   G  the gate (in the near wall)   @  where you stand coming in
   (the tile above G)   L  the reset lever   C  the vault chest.   The frame zooms the room to fit what the panel
   leaves free (a step in on a wide screen, a step out on a phone), so keep a room to about eleven tiles wide and
   seventeen deep: then a 390 phone shows a tile at about 25 CSS pixels. lib.room() parses the five for a kind.

   THE INTERFACE. A kind is { id, gyms, input, ...functions }. G is a gym entry, s a state, Q what parse returns.
   Every function is pure: a state is never changed in place, a move returns a new one (or the same object when
   nothing moved), so the frame's UNDO is a stack of the states it had, and a state is shown by drawing it.
     input        'step' (the stick, the arrows, the pad or a tap on the floor steps a tile: push, rune path, volcano,
                  mimic, ice slide), 'tap' (a tap on a tile acts on it: lights, pipes, mirrors, islands), or 'own'
                  (the kind takes over input and drawing inside the room: the trick shot, see TAKING OVER INPUT).
     parse(G)     -> Q: { W, H, cell (an array of the characters, '#' walls), start, gate, lever, chest, ...its own }.
                  Cache it by G.id: the frame asks often.
     init(G)      -> the start state. key(s) -> a string, equal for equal states (the solver's and undo's test).
     act(G, s, m) -> { s, ev, moves }: a move from the kind's own move list. ev is the frame's 'bump' (nothing
                  happened), 'reset' (the lever: s is the start), 'open' (the vault is reached), 'exit' (out
                  through the gate), or any word of the kind's own (a move that changed s). moves animates it:
                  [who, from tile, to tile, how], who 'me' (the golfer: the frame walks him) or the kind's piece.
     moves(G, s)  -> every move worth trying from s (the solver's and the audit's edges): [0,1,2,3] for a step
                  kind, the tappable tiles for a tap kind.
     step(G,s,d)  a step kind's input (d 0 up, 1 right, 2 down, 3 left; up is away from the camera). Defaults to act.
     tap(G, s, i) a tap kind's input (i the tile tapped). Defaults to act.
     won(G, s)    -> true once the puzzle is solved, for a kind whose last move is not a walk into the chest: the
                  frame opens the vault the moment it is true. A step kind can instead return ev 'open' from act.
     me(G, s)     -> the golfer's tile in s, or null when the state does not hold him (a tap kind: he stays where
                  he stood). place(G, s, i) -> s with him on tile i (re-entering puts him on the start).
     solve(G)     -> { ok, moves, path, states }: the fewest moves and one shortest path (moves for act).
     audit(G)     -> { ok, states, stuck, ... }: from every reachable state the vault can still be reached, or the
                  state says it is stuck (stuck(G, s) is true there, and the frame then lights Restart and says so).
     proof(G)     -> G.proof as a list of moves. enc(path) -> the string recorded in G.proof.
     stuck(G, s)  -> true when nothing but Restart leads on (the frame asks after each move, then lights Restart).
                  Optional: the default searches up to 40,000 states from s, so a kind that can tell sooner says so.
     goal(G)      -> the one line goal, always shown in the panel. What to do, never how: 'Make the floor one colour.'
     tell         { ev:'a line' }: said once, the first time the kind's own event ev happens ('edge' for push).
     dur(how)     -> seconds a move of that how takes to play (default 0.15).
     floor(gc)    -> null, or { h, mat } for a floor tile: gc is { i, c, r, k, u, v } (k the layout character, u and
                  v where in the tile, 0 to 1). h is the height (the deck is 0.45, its holes sit at -0.5), mat a
                  land material [name, extra]. mats(theme, deck) -> { name:['', '', '', 0, fn(c, R, h3)] } paints them
                  (see push.js). Baked once into the trail's picture, so only what never moves goes here.
     view(R)      -> the drawing of what moves, made once a trail by the frame (browser only; the next section).
   Defaults: lib.solve and lib.audit are a breadth first search over moves() and act() that a kind gets for free
   (push keeps its own, which counts the lever and its walk test the way the game always has).

   HOW THE FRAME DRAWS A KIND. The frame draws the room's floor (its deck, plus floor()), walls, gate, lever and vault,
   the golfer, the civilian, the highlights, and the panel. view(R) draws the pieces. R is the room:
     R.G, R.Q, R.T (a tile in trail feet), R.DECK (the deck's height), R.x0, R.y0 (the room's far left corner),
     R.at(i) -> [x, y] the middle of tile i, R.tile(x, y) -> the tile there or -1, R.scr(x, y, z) -> device pixels,
     R.ctx, R.kk() (device pixels an art pixel), R.reduce (reduced motion), R.sprite(key, buildFn, w, d, h) -> a
     cached sprite at the land's size, R.drawSprite(sp, x, y, z), R.BRK (the trail's breakables: a barrel, a crate),
     R.burst(x, y, z, cols, n, size, power), R.sfx(name), R.say(text, ms), R.ground(clientX, clientY) -> [x, y] on
     the deck, R.commit(s, ev, moves) (apply a state the kind worked out itself: history, win test and animation as
     for any move), R.busy() (a move is playing).
   and the view answers:
     lay(s)            show state s as it stands (when the trail opens, after a move has played, after Undo and Restart)
     move(m, u, tsec)  play move m ([who, from, to, how], not 'me') at u, 0 to 1
     things(ds, tsec)  push what stands in the room into the scene's far to near list: { x, y, kd:function(t, tsec) }
                       is drawn in its turn (t is that entry), behind what is nearer the camera
     ground(tsec)      draw on the floor, over the picture and under everything that stands (belt chevrons)
     over(tsec)        optional: draw over the scene (an aim line), still inside the room
     hot(s)            optional: the tiles worth a subtle highlight. Without it the frame highlights, for a step
                       kind, every piece a step would move, and for a tap kind every tile a tap would change.
   THE GOAL LINE is goal(G) (or G.goal), shown under the gym's name in the docked panel the whole time he is in the
   room. The civilian's lines and the frame's own messages go in the same panel. Nothing is ever drawn over the board.

   TAKING OVER INPUT (input:'own', the trick shot room). The frame still owns the room, the panel, Undo, Restart, Leave
   and the payout, but forwards the board's input to the view instead of stepping:
     view.pointer(type, e, pt)  type 'down', 'move', 'up'; pt is R.ground(e.clientX, e.clientY), the point on the
                                deck under the finger, in trail feet. A press on the panel never reaches it.
     view.key(e)                a key the frame does not use itself (Z, Backspace and R are the frame's).
     view.tick(tsec, dt)        every frame while he is in the room; return true while something is moving (the
                                ball rolling), and Undo, Restart and Leave wait for it.
   The kind plays its own move (aim, power, the ball rolling with the real physics: window.RTT_PUTT.simulate(C, x,
   y, vx, vy) on a course from RTT_PUTT.finishCourse({ bounds, comps, stimp, cup, cupR, matFn }), the same calls
   check-putt makes) and, once the ball is at rest, hands the frame the result: R.commit(nextState, 'shot', []).
   The frame records it for Undo, counts it, tests won(), and opens the vault. Its act(G, s, m) takes a move as a
   shot ({ a, v }: angle and speed) so the solver can search shots on a grid in node, where there is no page.

   A WORKED EXAMPLE, golf/putt/gymkinds/example.js (RTT_GYMKIND_EXAMPLE, world null, not on the page): three lamps,
   a tap flips a lamp and its neighbours, light all three. Its whole interface is a few lines and lib does the rest:
     input:'tap', parse: lib.room plus its lamps, init: the lamps as a bit mask, key, act(G, s, i): flip i and its
     neighbours, moves: the lamp tiles, won: every bit on, goal:'Light every lamp.', view: a lamp drawn lit or dark.
   check-putt solves it, replays its proof and audits it like any other gym, and its page section plays it in a real
   room by tapping.

   THE FRAME IS ONE PLACE. Every kind gets the same panel, controls (Undo, Restart, Leave; Z, Backspace and R), the
   same civilian, vault and pack, the same badge, and the same check-putt claims. A kind never pays, saves, or
   draws outside its room. =========================================================================================== */
(function(){
var API_VERSION = 2;
var TILE = 1.6;   // a tile in trail feet: a barrel (1.4 ft) fills one, and an eleven tile room fits a phone's width
var DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];   // up, right, down, left (up is away from the camera)
var PREFIX = 'RTT_GYMKIND_';
var root = typeof window !== 'undefined' ? window : globalThis;

/* THE KINDS, FOUND. Every global named RTT_GYMKIND_<ID> is a kind (see the README above). Found rather than listed,
   so a kind file is added without touching this one. Once the page has loaded every deferred script the set cannot
   change, so it is kept; before that (and in node) it is looked for again each time. rescan() forgets it, for a check
   that adds a kind's script after the page has loaded. */
var memo = null;
function scan(){ if (memo) return memo;
  var ids = Object.keys(root).filter(function(k){ return k.indexOf(PREFIX) === 0 && root[k] && root[k].id; }).sort(), K = {}, list = [], gyms = [];
  ids.forEach(function(k){ var kd = root[k]; K[kd.id] = kd; list.push(kd); (kd.gyms || []).forEach(function(G){ if (!G.kind) G.kind = kd.id; gyms.push(G); }); });
  var out = { K:K, list:list, gyms:gyms };
  if (typeof document !== 'undefined' && document.readyState === 'complete') memo = out;
  return out; }
function rescan(){ memo = null; return scan().list.map(function(k){ return k.id; }); }
function kinds(){ return scan().list.slice(); }
function kind(id){ return scan().K[id] || null; }
function kindOf(G){ var k = G && kind(G.kind); if (!k) throw new Error((G && G.id) + ': no kind ' + (G && G.kind)); return k; }

/* ---- what every kind gets for free (lib) */
function nb(Q, i, d){ var c = i % Q.W, r = (i / Q.W) | 0, nc = c + DIRS[d][0], nr = r + DIRS[d][1]; return nc < 0 || nr < 0 || nc >= Q.W || nr >= Q.H ? -1 : nr * Q.W + nc; }
/* THE ROOM, READ: its size, the five characters the frame owns, and every other character left in cell for the kind.
   extra(ch, i, Q) is asked about every character that is not one of the five or '.'; it returns false for a
   character the kind does not know, which throws. */
var ROOMS = {};
function room(G, extra){ if (ROOMS[G.id]) return ROOMS[G.id];
  var rows = G.rows, H = rows.length, W = rows[0].length, Q = { G:G, W:W, H:H, cell:[], start:-1, gate:-1, lever:-1, chest:-1 };
  for (var r = 0; r < H; r++){ if (rows[r].length !== W) throw new Error(G.id + ': row ' + r + ' is ' + rows[r].length + ' wide, not ' + W);
    for (var c = 0; c < W; c++){ var ch = rows[r].charAt(c), i = r * W + c, k = ch;
      if (ch === '@'){ Q.start = i; k = '.'; } else if (ch === 'G') Q.gate = i; else if (ch === 'L') Q.lever = i; else if (ch === 'C') Q.chest = i;
      else if (ch !== '#' && ch !== '.' && !(extra && extra(ch, i, Q) !== false)) throw new Error(G.id + ': what is ' + ch + ' at ' + c + ',' + r);
      Q.cell.push(k); } }
  check(G, Q); return ROOMS[G.id] = Q; }
function check(G, Q){ if (Q.start < 0 || Q.gate < 0 || Q.lever < 0 || Q.chest < 0) throw new Error(G.id + ': a gym needs @, G, L and C');
  if (Q.gate !== Q.start + Q.W) throw new Error(G.id + ': the gate is the tile below @'); }
/* A STEP INTO ONE OF THE FRAME'S TILES, for a step kind that wants the usual meaning: off the room or into a wall
   nothing, the gate out, the lever back to the start, the chest open. null when the tile is the kind's to answer. */
function frameStep(G, Q, s, p, d, init){ var n = nb(Q, p, d), k = n < 0 ? '#' : Q.cell[n];
  if (n === Q.gate) return { s:s, ev:'exit', moves:[] }; if (k === 'L') return { s:init(G), ev:'reset', moves:[] };
  if (k === 'C') return { s:s, ev:'open', moves:[] }; if (k === '#') return { s:s, ev:'bump', moves:[] }; return null; }
/* THE SEARCH. Every state reachable from the start by the kind's moves (a 'reset' is an edge back to the start, a
   win is an 'open' or a state won() says is solved), breadth first, so the first win found is the fewest moves. */
function explore(K, G, cap){ cap = cap || 3000000; var s0 = K.init(G), k0 = K.key(s0), seen = {}, list = [s0], par = {}, edges = [], wins = [], i = 0, won = K.won;
  seen[k0] = 0; par[k0] = null;
  while (i < list.length){ var s = list[i], ks = K.key(s), from = i++; if (won && won(G, s)){ wins.push([from, null]); continue; }
    var ms = K.moves(G, s);
    for (var j = 0; j < ms.length; j++){ var r = K.act(G, s, ms[j]);
      if (r.ev === 'open'){ wins.push([from, ms[j]]); continue; }
      if (r.ev === 'exit' || r.ev === 'bump' || r.s === s) continue;
      var kn = K.key(r.s), to = seen[kn];
      if (to == null){ if (list.length >= cap) return { overflow:true, n:list.length }; to = seen[kn] = list.length; list.push(r.s); par[kn] = [ks, ms[j]]; }
      edges.push([from, to, r.ev === 'reset']); } }
  return { list:list, seen:seen, par:par, edges:edges, wins:wins, k0:k0 }; }
function solveLib(K, G){ var X = explore(K, G); if (X.overflow) return { ok:false, why:'too many states (' + X.n + ')' };
  if (!X.wins.length) return { ok:false, why:'it cannot be solved', states:X.list.length };
  var w = X.wins[0], ks = K.key(X.list[w[0]]), path = []; while (X.par[ks]){ path.unshift(X.par[ks][1]); ks = X.par[ks][0]; }
  if (w[1] != null) path.push(w[1]);
  return { ok:true, moves:path.length, path:path, states:X.list.length }; }
// from s, can a win be reached without going back to the start? (bounded: past cap it answers yes)
function reaches(K, G, s0, cap){ cap = cap || 40000; var seen = {}, q = [s0], h = 0; seen[K.key(s0)] = 1;
  while (h < q.length){ var s = q[h++]; if (K.won && K.won(G, s)) return true; var ms = K.moves(G, s);
    for (var j = 0; j < ms.length; j++){ var r = K.act(G, s, ms[j]); if (r.ev === 'open') return true; if (r.ev === 'reset' || r.ev === 'exit' || r.ev === 'bump' || r.s === s) continue;
      var k = K.key(r.s); if (seen[k]) continue; seen[k] = 1; if (q.length >= cap) return true; q.push(r.s); } }
  return false; }
/* THE AUDIT. A state from which no move leads to the vault (Restart aside) must say so (stuck), because then the frame
   lights Restart and tells him; a state that says so must really be one. ok when both hold everywhere. */
function auditLib(K, G){ var X = explore(K, G); if (X.overflow) return { ok:false, why:'too many states' };
  var N = X.list.length, back = [], i; for (i = 0; i < N; i++) back.push([]);
  X.edges.forEach(function(e){ if (!e[2]) back[e[1]].push(e[0]); });
  var good = new Uint8Array(N), q = X.wins.map(function(w){ return w[0]; }); q.forEach(function(w){ good[w] = 1; });
  for (var h = 0; h < q.length; h++) back[q[h]].forEach(function(p){ if (!good[p]){ good[p] = 1; q.push(p); } });
  var st = K.stuck || function(G2, s){ return !reaches(K, G2, s); }, stuck = 0, missed = 0, alarms = 0, ex = null;
  for (i = 0; i < N; i++){ var says = !!st(G, X.list[i]); if (!good[i]){ stuck++; if (!says){ missed++; if (!ex) ex = X.list[i]; } } else if (says) alarms++; }
  return { ok:missed === 0 && alarms === 0, states:N, stuck:stuck, missed:missed, alarms:alarms, dead:stuck, example:ex }; }

/* ---- the registry: every question about a gym, answered by its kind */
function parse(G){ return kindOf(G).parse(G); }
function init(G){ return kindOf(G).init(G); }
function key(G, s){ return kindOf(G).key(s); }
function act(G, s, m){ return kindOf(G).act(G, s, m); }
function step(G, s, d){ var K = kindOf(G); return (K.step || K.act)(G, s, d); }
function tap(G, s, i){ var K = kindOf(G); return (K.tap || K.act)(G, s, i); }
function moves(G, s){ return kindOf(G).moves(G, s); }
function won(G, s){ var K = kindOf(G); return !!(K.won && K.won(G, s)); }
function input(G){ return kindOf(G).input || 'step'; }
function me(G, s){ var K = kindOf(G); return K.me ? K.me(G, s) : null; }
function place(G, s, i){ var K = kindOf(G); return K.place ? K.place(G, s, i) : s; }
function solve(G){ var K = kindOf(G); return K.solve ? K.solve(G) : solveLib(K, G); }
function audit(G){ var K = kindOf(G); return K.audit ? K.audit(G) : auditLib(K, G); }
function proof(G){ return kindOf(G).proof(G); }
function enc(G, path){ return kindOf(G).enc(path); }
// stuck: nothing but Restart leads on from here (the frame lights Restart and says so)
function stuck(G, s){ var K = kindOf(G); return K.stuck ? !!K.stuck(G, s) : !reaches(K, G, s); }
function goal(G){ return G.goal || kindOf(G).goal(G); }

// the gym on a trail: the world's two, by the leg of the hole the trail leads into
function all(){ return scan().gyms; }
function at(world, leg){ var gs = all(); for (var i = 0; i < gs.length; i++) if (gs[i].world === world && gs[i].leg === leg) return gs[i]; return null; }
function byId(id){ var gs = all(); for (var i = 0; i < gs.length; i++) if (gs[i].id === id) return gs[i]; return null; }
// what the civilian says: the nudge, after two resets the plainer one, and after five a warmer one still (never the moves)
function clue(G, resets){ return G.say[resets >= 5 && G.say[2] ? 2 : resets >= 2 && G.say[1] ? 1 : 0]; }
/* ALL 22 BADGES (two gyms a world, eleven worlds) unlock the Puzzle Master item. The item is not in the game yet: it
   needs art the owner approves first. This is the condition it will be wired to. */
var MASTER = { badges:22, item:'Puzzle Master', wired:false };

var api = { API_VERSION:API_VERSION, TILE:TILE, DIRS:DIRS, MASTER:MASTER, PREFIX:PREFIX, kinds:kinds, kind:kind, kindOf:kindOf, rescan:rescan,
  parse:parse, init:init, key:key, act:act, step:step, tap:tap, moves:moves, won:won, input:input, me:me, place:place, solve:solve, audit:audit, proof:proof, enc:enc,
  stuck:stuck, goal:goal, at:at, byId:byId, clue:clue,
  lib:{ nb:nb, room:room, check:check, frameStep:frameStep, explore:explore, solve:solveLib, audit:auditLib, reaches:reaches } };
// every gym of every kind found (a getter, so a kind loaded after this file is in it)
Object.defineProperty(api, 'GYMS', { enumerable:true, get:all });
root.RTT_PUTT_GYMS = api;
})();
