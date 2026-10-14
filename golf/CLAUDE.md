# Run The Tour and Putt Putt Tour

This file holds the decisions for this game. The repo-wide rules are in the root CLAUDE.md.

## Putt Putt Tour, a Run The Tour tester preview

```
node golf/putt/check-putt.mjs               physics, real greens, both tours replayed under par, dailies, the page
node golf/putt/check-putt.mjs --quick       physics, the real greens and the page
node golf/putt/solve.mjs --tour main        search every hole for the par it should carry (the best part of an hour)
node golf/putt/solve.mjs --tour members --only 3,7 --write    re-solve edited holes and record their routes
```

`golf/putt/putt.js` is a mini golf game you PLAY inside Run The Tour. **It opens in the 3D world**: the
player's own golfer, in everything they have earned, standing on the trail to the next hole (see the trail
section below). The owner's call: the world is the selling point, so it is the first thing anybody sees. The
hub is one button away (Map, top right): the Daily Challenge on top, and under it the Tour map, a winding
path up through the worlds. The map's World button goes back. `golf/putt/DESIGN.md`
is the analysis of the mini golf games it learns from. **It replaced the Putting Green menu**, which the
owner said was not what was being built.

**TWO TOURS, tabs at the foot of the map** (`TOURS` in putt.js, the owner's design):

| | who | holes | worlds |
|---|---|---|---|
| Putt Putt Tour (`main`) | everybody | 180 | The Clubhouse, Lost Temple, Pirate Cove, Canyon Mine, Volcano Island, Frozen Peak, Sky Islands, Neon Arcade, Schoolyard, Ice Age, 18 each |
| Members Tour (`members`) | Tour Pass holders play; anybody may walk it | 18 | Hallows Night and Harvest Moon, nine each: the season's own holes, one trick a hole on Hallows Night |

**The main tour wears none of the calendar themes**, which belong to the passes and the dailies, and the
check asserts it. The last hole of each world is the signature hole. **Every hole has an obstacle, a
puzzle or a moving part**, and par climbs world by world; both are asserted. The set pieces the holes
are built from are in the engine: loops (an entry speed and a chute that feeds it), rivers (a `FLOW`
material that carries the ball), ramp lanes up or down a tier (`climb`), kickers (`kicker`),
ramp jumps over water, drawbridges on a clock, turntables, sliders, gates, spinners, conveyors, bounce pads.


**THE TOUR GROWS A WORLD AT A TIME, about 50 holes a week** (the owner's pace). Worlds 6 to 8 went in
together as holes 91 to 144, and worlds 9 and 10 (Schoolyard, Ice Age) as holes 145 to 180. What a new world
needs, all of it in one commit:

| where | what |
|---|---|
| `putt.js` | a `THEMES` entry (`iceCol`/`iceCol2` paint `M.ICE` apart from the hazard), its skins in `SKIN`, a `GLOW`, the `WORLDS` row, its 18 `LEVELS`, 18 `TOUR_NAMES`, the `.wm-`, `.wt-` and `data-wt` CSS, `CARD_ART`, and a `sigReward`/`worldReward` each |
| `land.js`, `mapland.js` | `BUILD.<theme>` for the land round a hole, `PAL` and `WORLD.<theme>` for the map |
| `trail.js` | a `KIT` (ground, path, trees, landmarks, hazard, breakable, local), its `LIFE`, and a `BUILD` for each new landmark with its `LMSIZE` |
| `putt.js` again | a `GREETERS` host, three `TRINKETS` and a `TRINKET_COL`, a `DOOR_NAMES` entry and its `.pp-door[data-door=]` CSS |
| `build-cards.mjs` | the signature hole the home card is cut from |
| `routes.json` | `solve.mjs --tour main --only <the 18> --write`, then each `par` set to what it prints (`three` where it says 3 STARS NOT FOUND) |

**A new world has to carry more set pieces a hole than the one before it** (check-putt asserts it, thin
rails excluded), so a world adds a mechanic on top of the old ones rather than replacing them. Frozen Peak
brings ice (`M.ICE`, a quarter of the carpet's grip, so the pace is read off where the ice ends), Sky
Islands wind (belts) and the drop (the hazard painted as cloud), Neon Arcade every machine on a clock,
Schoolyard the playground (the merry-go-round turns, the seesaw is two drawbridges, the bus is a slider and the
sandbox stops a ball), Ice Age all of it at once: glacier ice, tar pits (the hazard painted black), and the
mammoths walking through. **A trail's tar is `slow` ground painted `bogC`**, the Ice Age kit's own colours, so
a bog anywhere else keeps its brown.
**Ice makes aces easy**: a bank onto ice slides on with room for error, so the first draft of Frozen Peak
had four holes acable from the tee. Put a bumper on the line the ice opens up, and re-solve.
**A skin name is global**: the winter theme already had `snowman`, and a second `snowman` in `SKIN`
silently replaces the first for every theme that uses it.
**Anybody may WALK the Members Tour; only the pass PLAYS it** (`membersCanPlay()`, the owner's call: the
world is the best advert the pass has). The tab is open to everybody and, without the pass, walks them into
Hallows Night (or shows its map). Walking up to a hole, tapping one on the map or skipping the trail all reach
`startLevel`, and without the pass that opens `membersSheet`: what the pass is, never a coin price, and a
button to the free Putt Putt Tour ("Play the Putt Putt Tour"), plus Keep looking around from a trail. A tester
gets a preview button (`S.memPreview`). It pays more a hole and carries rewards only members can earn
(`PAY.members`). Trail coins on a Members trail pay whoever walks it.

**HALLOWS NIGHT IS NOT HARDER THAN THE TOUR, IT IS ITS OWN.** Its first nine were every set piece at once on a
clock over the water, and the owner and testers could not beat hole 1. A season hole needs to be UNIQUE, not
hard: each Hallows hole is one haunted idea (an iron gate on a clock, a coffin-shaped court down a lane, a
cauldron open on both sides, one belfry bat, a turning parlour floor, a river of brew, a crypt door on a switch,
a leap over a grave, the haunted mill) with headstones and pumpkins. check-putt holds every Hallows hole to at
most two moving or wet pieces and par 3 (the signature 4). **The trick or treat bonus** (`PAY.members.treat`,
kept as `tp.treat`, merged like `paid`): the first time a Hallows hole is beaten UNDER par it pays 150 coins on
top, and all nine pay 600 and the members-only Jack-o'-Lantern Ball. Harvest Moon still packs more into a hole,
because check-putt asks the second world for more set pieces than the first.

**THREE STARS IS ALWAYS MAKEABLE.** It is two under par (`starsOf`), so on a par 3 it is the ace and
on a longer hole it is the secret line, unless the hole carries its own target (`three`, read through
`threeOf`). A hole whose design cannot be aced fairly carries `three` as a birdie: two jumps in a row,
two tiers with a slow ramp between them, a moat on a clock. check-putt refuses a `three` that is not
exactly par minus one. Asked for by the owner: if three stars needs a hole in one, a hole
in one has to be really possible. The solver's grid steps a degree and a foot and only keeps a putt that
holes ON the grid, which misses most aces (a bank that drops is a window under a degree wide), so
`aceSearch` keeps every putt that passes within two feet of the cup and searches finely round the
closest. It records the ace as `tour:n:3`, and check-putt asks every hole on all three tours for a route
to three stars that replays with `robust()`'s room for error, the same as a birdie putt. A long ace needs a
reason to drop: a dish round the cup (`bowl`) and a bank that sends the ball down the line. Most aces are
firm, 35 to 44 feet on the meter. `PUTT_ACE_SEEDS` hands the solver a known ace line per hole, which it
keeps only if it replays, so a re-solve does not search an hour for a line already found.

Four things made the tour aces real, and each is a rule for the next hole:

- **A river or a loop delivers the ball the same way every time**, so its ace has to come from timing: a
  gate, slider or spinner between the delivery and the cup turns "always the same miss" into a window.
- **Two jumps in one putt cannot be done** (a landing keeps 0.72 of the speed), and some holes have no
  straight line at all. Those carry a birdie target (`three`) rather than a trick.
- **THERE ARE NO TUNNELS, and check-putt fails on one.** The first version gave every hole without a
  straight line a pipe from a corner of the tee box that came up beside the cup. The owner's verdict: it
  hands you the ace, and it looks wrong. Two tiers are joined by an open ramp lane (`climb`, a ridge the
  ball has to be struck firmly enough to climb), a long hole's secret is a kicker ramp in plain sight
  (`kicker`), and the tunnel is gone from the engine: no template, helper, physics or drawing is left.
- **An ace is built, not searched for.** `node golf/putt/ace.mjs <tour> <n>` is the fast method: take the
  real putt that passes nearest the cup and put a backstop board and a dish exactly where that ball
  arrives, or, where nothing passes near, put a bank board where the obvious first putt stops, angled
  by the mirror rule toward the cup. Then verify the one line with `robust()`. That is seconds a hole
  where the blind fan search was minutes.
- **A long straight ace needs capture width.** A degree at 36 ft is half a foot off line. A flat backstop
  board just behind the cup with a 2.2 dish catches both sides; a V backstop sends them off sideways.
- **A par 4 or longer reaches three stars only by its secret line**, or carries a birdie `three`.

**A third tab, the Lab, is for testers only** (`TOURS.lab`, `labOpen()` asks `host.tester()`): six
prototype holes judged here before any idea touches the ninety. Three classic golf templates on the carpet
(Redan, Cape, Biarritz) and three mechanics the tour does not have yet: a banked half pipe (a `crown`
bowl), a door on a switch, and a drop down three tiers (two steep `ridge` steps). The Lab pays nothing
(`PAY.lab`), costs no lives, and every hole is open. Its routes are in `routes.json` as `lab:N` and
check-putt replays them under the same birdie and dryness rules as the tours.

**A door on a switch is a mover of kind `door`** (`switchDoor`, `doorOpen`): shut across a gap until the
ball rolls over its plate, then open for `hold` seconds. The plate is pressed by THIS putt or not at
all, because `simulate` clears every door at the start of a putt, so the solver's state stays the ball
and the clock. The press is written onto the mover (`_p`, on the hole's own clock) and the painters read
it, so the door the player sees is the door the physics used.

**THE RULE IS STARS.** Par or better clears a hole and opens the next one in its world: 1 star for par,
2 under par, 3 for two under (an ace on a par 3), best kept. The worlds open on a RUNNING TOTAL, the owner's call: 40 stars for
every world unlocked (`worldGate`: 40 opens world 2, 80 world 3, and so on; 20 a world on the Members Tour), counted across
every world so far (`starsThrough`), so a player stuck on one world can earn the stars back in another. It
used to be two thirds of each world on its own (36 of 54), then 45 a world. A perfect world is still never required: 54 a
world would be an ace on every hole, and an ace is partly luck. `frontier()` is the one answer to what is open, and it never drops below the
record's stored `lv`, so nobody loses a hole they had reached. Over par takes a life, and it is decided the moment par strokes are used with the ball out,
so nobody putts out a lost hole (`settle()` calls `tourOut(false)`). Quitting or restarting after the
first putt costs a life too. 3 lives, 6 with a Tour Pass; the last one starts a 24 hour clock. Lives are
sold for money only (the refill sheet shows $0.99 and says the checkout opens at launch; a tester gets a
free refill). Lives, the daily, its streak and the rewards are shared by both tours; progress is per tour
(record version 2, migrated from the 50 level tour). The Daily Challenge never costs a life: one scored
try a day, 40 coins to play, 40 more under par, and a streak.

**Par is the solver's, and it means beatable without luck.** `solve.mjs` searches each hole and only
counts a holing putt whose neighbours (a degree of aim, most of a foot of pace, a beat either side on a
moving hole) mostly hole too. Par is that route plus one, never under 3. **The search takes the best part
of an hour, so CI does not run it**: it records every route in `golf/putt/routes.json`, and the check
REPLAYS them, which takes seconds and proves the same thing. Change a hole and its route stops replaying,
so the check fails until `solve.mjs --only N --write` is run again. Write the par it prints into `LEVELS`.

**Everything that moves runs at `PACE` (0.6) of the speed its hole was written at.** Players found the
sliders, gates, spinners, sails, drawbridges and turntables far too quick, so the slowdown is applied once
in the compile (`paced()`, the bridges' period, the turntables' omega) rather than in ninety hole
definitions. Hole code still reads the old numbers. Moving `PACE` re-times every moving hole, so re-solve
all of them with `--write` and replay. Two Gates is one bar shuttling between two doors, so one door is
always open and the puzzle is reading which.

**A bank board is a block laid at an angle** (`board(H, T, ax, ay, bx, by, th)`, `addBoard`), so a hole
can use the angles classic mini golf is built on: a dogleg's outside corner cut by a board, a V of two
boards funnelling to the cup, a diamond room whose walls bank round a centre block. It keeps its bounding
box in `x0..y1` for anything that only needs to keep clear of it, and `rot` for everything that asks
whether a point is IN it. **`inBlock(r, x, y, pad)` is that one answer**: the solver's and the check's
walking-distance maps read it, because a long diagonal board's bounding box would wall off half the room
and the solver would report a playable hole as impossible. The 3D painter and the flat painter turn
their skin into the board's own frame. Angled walls round the course itself are just room polygons
(`pg`), which already worked. The Clubhouse holes were reshaped this way (a dogleg, a skewed slope, a
diamond, a windmill apron, a V funnel, a hexagonal landing court, an octagon round the turntable);
angled boards guiding onto the drawbridge were tried and made it harsher, so that hole kept its curbs.

**Every hole has an obvious line and many have a secret one, and par is set off the OBVIOUS one.**
Reported by the owner: some holes had no logical way to a birdie, the ball went in the water too often,
and every hole read as having one answer. So:

- **Par is the obvious route plus one** (or 3 when the obvious line is an ace). Playing the hole the way
  it looks earns a birdie, so a player who reads it right always has a winnable path.
- **A secret line is one stroke shorter** and is marked with `secret(H, x0, y0, x1, y1)`: a zone only the
  hidden route passes through (a slit in a wall, a kicker ramp, a bank off a side wall). The solver searches twice: once AVOIDING every secret zone (that sets par) and once free (that
  must find a line one shorter, through a zone). `routes.json` keeps both, as `main:n` and `main:n:sc`.
  Every main tour world carries at least one, and the Members Tour at least one in all (its cups sit in
  pens, so a stroke-saving line rarely exists there). Finding it says SECRET LINE FOUND on the result.
- **A long putt can never be robust on its own**, because a degree of aim is wider than the cup at 30
  feet. So an ace needs a funnel: a `bowl()`, a shallow hollow round the cup, and usually a backstop board.
- **Water and the edges have curbs.** Thin `blk()` rails along a pond or a drop, with gaps only where a
  bridge or a ramp is meant to be used, give a player something to aim at. `fair.mjs` plays each hole's
  route with a person's error (2 degrees, 8% pace, 0.12 s) and reports how often it goes wet or out; the
  check holds every hole under 34% and each tour's mean under 10%.

The map's level buttons wear their world (a golf ball, a carved stone, a doubloon, a plank sign, basalt,
a tombstone, a pumpkin), and the hub takes the world's colours off `data-wt`.

**The search is ranked by walking distance to the cup, and that map was quietly wrong.** It was a
Float32Array read back against a 64 bit heap entry, so a cell's own distance looked stale on the way out
of the heap and the spread stopped. On a long hole every place the ball could rest read as unreachable,
the search ranked them all equal, and it reported a perfectly playable signature hole as impossible.
It is a Float64Array now. A solver that says Infinity is a claim about the solver first.

**A route is recorded at full precision.** The first routes rounded the aim to five places and the strike
time to a thousandth of a second, and on a hole with a mill or a spinner that is a different putt: three
members routes stopped dropping on replay. Nothing about the hole had changed.

**Harvest Moon's cups sit in a pen** (`pen()`; Hallows Night's do not any more), three blocks open on one side toward the middle of
the room, so the ball has to be brought round beside the cup and played in sideways. **The first pen opened
on the far side and cost nothing**: a ball bounced off the end wall rolled straight back into it, so the
solver still beat most holes in two. Opened sideways, Graveyard Gate went from two putts to three.

**The home card wears the world you are in** (`RTT_PUTT.cardArt(theme)`, read off `summary().theme`): the top band
of that world's signature hole, cut from the game's own render by `node golf/putt/build-cards.mjs` into
`golf/putt/cards/`, so it is the same pixel art as the courses. A dark wash keeps the text readable. Re-run
it after changing `land.js` or a signature hole, and bump `CARD_V`.

**The main tour pays 4,000 coins a world** (40,000 over ten worlds): 80 a hole and 280 for the signature hole the
first time it is beaten, 20 for a first ace, and 2,000 for finishing the world. Replays pay nothing. They
go through the page's `addBonusCoins`, so a Tour Pass multiplier does not apply. The signature, world, ace
and streak rewards are recorded by name in the Tour record and are not wearable yet.

**A signed in player's record is on the server** (`ps_saves` from 103, game `putt`, slot `tour`, so no
migration). It goes up after every `psave` and comes down when the mode opens and on every sign in
(`RTT_PUTT.sync`, called from `sbApply`, which redraws the home card in place and never re-renders a round).
The page writes localStorage first and never waits on the network. The host hands the module `uid`,
`signedIn`, `rpc` (golf's own `sb.rpc`, null on any error) and `signIn`.

- **Two copies are merged, never chosen between.** `pmerge` only adds: the furthest hole, the best score per
  hole, every ace and payout, every daily played. So a stale phone cannot take a hole away, and a daily
  played on one device is played on all. Lives, the refill clock and the streak come from whichever copy
  changed them last (`st.lt`, stamped only when lives move, so a fresh browser's first save never beats the
  account's lives). The streak comes from the copy that played the later day.
- **Progress is a count of things the merge only adds** (`cloudProg`), so a merged record is never behind
  either copy. A refused write hands back the stored record, which is merged in and sent again, at most
  three times running.
- **Every call fails soft.** null is no opinion and the local record stands.
- **The account's record lands after the first screen, so the screen has to look again** (`pulled()`). The game
  opens on the trail to THIS browser's frontier, and the pull only redrew the map. A phone whose copy was behind
  (a new browser, or Safari evicting a site not visited for a week) stood on the trail to hole 1 with the
  progress sitting on the server. A tester reported it as being reset to level 1. A trail opened by `home()` now
  walks on to the new frontier when the pull moves it; one walked on purpose from the map is left alone.
- **A browser that will not save keeps the session in memory** (`praw`, `pwrite`). Every read is fresh from
  localStorage, so a setItem that throws used to hand back the old record on the next read. Writes are mirrored
  in memory and a refused key is read from the mirror, and the cloud copy is sent from that same read.

**Every putt is saved, and the game reopens on the hole in progress** (`saveCur`, `st.cur`). The hole,
the strokes and where the ball lies go into the Tour record when a putt is struck (ball still at its
starting spot, so closing the tab while a bad putt rolls costs that stroke instead of undoing it) and again
when it stops. Opening the mode goes straight back into that hole, and the lives check is skipped for it,
because the attempt has not cost one yet. Only finishing the hole or leaving through the X (a life, as
before) clears it. Each hole counts its attempts in `tp.tries`, merged as a maximum. A signed in player's
hole in progress follows the account, last change wins (`curT`), the same rule as lives. The Daily Hole is
not resumed: it is one timed try.

**THE WORLD IS HOME** (`home()`, `worldOk()`, `worldTour()` in putt.js). Opening the mode, leaving a Tour
hole and pressing World on the map all land on the trail to the frontier hole of the tour last looked at
(the Putt Putt Tour or the Members Tour). The Lab, the Daily tab, reduced motion and a page without the 3D
golfer open on the map, as before. A hole in progress is resumed before anything else. Escape on the trail
closes the mode; on the map it goes back to the world. The world screen is `.pp-wv` (`.pp-world` is the map's
own class, and sharing it broke the layout). `window.RTT_PUTT_MAPFIRST` makes the mode open on the map, and
check-putt sets it for its map sections; its world section turns it off.

**Every world has a greeter** (`GREETERS`, `greetSpec` in putt.js), a board game host: Pro Pete (a preppy club pro: white polo, visor, slacks), Professor
Fern, Captain Bogey, Dusty, Ranger Mae, Coach Frost, Skye, DJ Pixel, Principal Plum, Grok, and Count Mulligan and Farmer Hayes on
the Members Tour. They are invented, drawn by the same 3D golfer in a look nobody can buy, and stand on the
first trail of their world (from `w * K`), a little up the path or just past the world door. They wait while
the world's title card shows (`greetDelay`), walk up, and talk: a box at the foot of the screen with their
face (the profile picture renderer, `host.portrait(look)`), a name plate, typed pages and a tap for the next.
Walking waits while they talk. The pages are who they are, how the world plays, what clearing it pays, the
star gate to the next world and the hole ahead, all read off the tour rather than typed. They talk on their
own once (`st.met`, merged as a union) and stand by the path after, where Talk plays it again.

**A greeter talks within a BAND of 3.2 ft, never at exactly 3.2.** Each step moved them the distance left to
3.2 ft and they spoke only once closer than that, so in floating point they could stop a hair short for ever,
holding the golfer: the game froze on the first trail of a new world, about one walk in three. They talk at
3.25 now, and check-putt holds a greeter a ten millionth of a foot outside 3.2 and asks that they talk.

**THE WORLDS AHEAD ARE UNDER CLOUD**, the owner's design. Nothing names a world, or any hole in it, until its
clouds part, and they part at its gate: walk up with the stars and the door opens on it.
- **Revealed is a list on the record**, `st.rv` (`'main:1'`), merged as a union and counted in `cloudProg`.
  `revealed()` also counts any hole played in the world, and `startLevel` reveals the world it opens, so a
  skipped walk never leaves you standing under cloud. The first world of each tour and the Lab are never hidden.
- **The map** draws a hidden world as a cloud bank (`.pp-cloudo`) over its band, with no holes, no landscape
  (`mapArt` skips it) and a label reading World N, In the clouds. A tap on it walks to the gate if the stars
  are there and otherwise says how many it asks. The golfer stands at the gate below it.
- **Every other place a name shows** goes through `wName`/`wLabel`: the corner chip, the locked-hole toast, the
  result and world complete popups, the Bag's putter parts and trinket rows, the home card (`summary()` gives
  the last revealed world) and the shut door (`data-door="clouds"`).
- **The walk into it** (`clouded` in `openTrail`) hides the world and hole in its goal line, keeps the old
  world's colours, birds and title, and `trail.js` draws a cloud bank from the top of the wall up
  (`drawClouds`). The door reveals it when the stars are there ("The clouds part"); the bank rolls apart, the
  goal line and title card name the world, and the greeter waiting behind the cloud walks up.

**Every world is alive round you** (`LIFE` in trail.js). Flyers (songbirds, parrots, gulls, vultures, crows, bats,
drones), things in the air (butterflies, petals, fireflies, snow, ash, embers, leaves, dust, neon sparks) and set
pieces: pirate ships sailing Pirate Cove, balloons over Sky Islands, smoke off Volcano Island's vents and lava,
tumbleweeds, ghosts. None of it blocks or can be picked up. Flyers and motes spawn round the golfer and are
recycled out of sight; ships and balloons are 3D props rendered once (`shipFn`, `balloonFn`). **Sizes are in
feet, as whole scene pixels** (`px2`): sized in screen pixels a gull came out a few pixels wide. Reduced motion
draws none of it.

**The shore follows the path** on a sea trail (`SEA`, `P.seaEdge`): a phone shows about ten feet either side of
the golfer, so a sea at the plan's edge was off screen for most of a walk and so were the ships. The camera
also looks a little out to sea there. **A ship is drawn without occlusion**: `occlude()` treats a sprite as a
flat cut-out standing at its anchor, so the sea in front of a long hull painted over its bow.

**The walk to the next hole is a place you walk through** (`golf/putt/trail.js`, `RTT_PUTT_TRAIL`). Next opens a
3D trail of the world, drawn by `hole3d.js` from a scene (`opt.scene`) at a finer art grid (`TART`, an eighth of
a foot a pixel), 110 ft long, so about two screens of walking. The golfer is `golfer3d.js`'s walk
(eight frames a stride plus `ws`, standing), picked off the distance walked so the feet never skate. He is
walked with a stick on a touch screen and with the arrow keys or WASD on a desktop, which draws no stick and
ignores a drag (owner's call); Skip goes to the hole, after a warning naming what the trail still holds (`trailLeft`, the map's own list): Keep walking or skip anyway. A trail with nothing left skips straight through. **There is no Auto walk**, the owner's
call: the walk is the place. Somebody who would rather not walk it goes to the map and plays the next hole from
there, which warns that the trail's rewards are forfeit (`skipWarn`).

**The holes at each end of a walk are the real holes** (`courseFoot` in putt.js, `feet` and `footAt` in the plan).
Each is the compiled course rastered to a grid of codes (carpet, fringe, rail, block, cup, water, sand, ice) and
scaled to fit about 24 ft, laid into the land with its own carpet and wall colours and a flag in the cup. The hole
just played sits behind the start with its cup on the path's line, so he walks away from it;
**ONLY A WORLD STARTS IN A PLAZA** (`spec.plaza`, the trail to a world's first hole, or a trail with no hole
behind it). Every other walk used to open on the same round sandy clearing, and the owner found it repetitive:
going from one hole to the next should feel like one path. So off a plaza the path is run back onto the last
hole's carpet (two points prepended in `plan`) and `start.r` is 1.2, a landing rather than a circle. the next one sits past
the arch with its tee on the path. A player reported starting the walk from 17 to 18 with nothing behind him.

**A hole started from the map warns before the trail's rewards are forfeit** (`skipWarn`, read off `trailLeft`).
It names what the trail to that hole still holds and offers Walk, Play now, or Cancel. It only fires for a hole not
yet beaten on the main tour: a beaten hole's trail is already behind you. A gate that would refuse the hole anyway
(a guest past hole 5, the Members Tour, no lives) shows its own sheet first.

- **Bushes and ferns are walked through** (`PLANT` in trail.js), asked for by the owner. They are left out of the
  baked land and out of `P.cols`, and drawn live each frame, sorted with everything else that moves. As he
  pushes through one it bends away from him on a spring (drawn a strip of art pixels at a time, the top leaning
  most), squashes a little, sheds a few leaves, and swings back past upright once he is past. Rocks, trunks and
  hay still block. Reduced motion draws them upright.
- **Scale is one rule**: the golfer is 4 ft tall at 2/3 scale, so a person is 6 ft, and every tree, lamp,
  chest, fence and landmark is sized in those feet (`TREEH`, `LMSIZE`, `BLOCKR`). Tall things stand off the
  path or screen it only from behind (`screensPath`), and a figure behind something is drawn see-through.
- **Each world has a kit** (`KIT`): ground, path, trees, low plants, landmarks, a hazard (water, lava, ice
  that slides, mud that slows), its own breakables and someone to talk to. Lava sends him back to the path.
- **No two walks are alike, and they do not all walk up the screen.** Asked for by the owner: walking up every
  time was repetitive, so a trail is ROUTED the way a course is (`ROUTES` in trail.js): a dogleg, switchbacks
  across the whole width, a hairpin that turns back toward the camera, round a lake, a cape, esses, a sweep or a
  gentle meander. Each is control points in (across, along) terms, mirrored and jittered, through a centripetal
  spline; where the walk starts and where the arch stands move too, as far as the real holes at each end leave
  room. A lake or cape bends round its middle (`route.mid`), which is a big pond, lava lake or ice sheet in a
  world with a hazard and a landmark in one without. Its clearing sits off to a side with room, never over
  another leg, half the time down a little path and half the time hidden in the trees, and holds a chest or a
  pile to smash. check-putt plans seventeen trails and asserts at least three routes, three kinds of clearing,
  and no two hiding their chests in the same places.
  - **The path is no longer a function of y**, so nothing may be placed at `cx(y)`. Everything beside the walk
    is placed by distance along it (`P.atS`, `P.tanS`, `P.beside(s, side, off)`; side 1 is the walker's right).
    `P.cx` is kept only to answer where the path crosses a line, and `P.arch` is the arch.
  - **A route is drawn again** when it leaves the land, comes within `MINSEP` of its own other leg, loops back
    past the start or the arch, runs too long (`L * 1.85`, a hairpin `L * 2.1`), or, between worlds, crosses the
    wall's line more than once or not heading north (`wallLine`). A straight walk is the last resort.
  - **The chest is a real treasure chest and opening it is a sequence** (`chestFn(lid)`, `drawChest`): oak planks,
    iron bands, gold corners and lock, a domed lid on a hinge, drawn at five lid angles. Shut, it sits in a warm pool
    of light and glints. Walked up to, it rattles (`CH_SHAKE`), the lid swings back (`CH_LID`), light rays pour out,
    and the coins spray out after (`CH_COINS`), under a "600 coins!" that rises off it. It has no square edge: a rounded footprint (`CH_RC`), sides
    that bow out, a bevelled foot and rim, and a lid whose ends round into its dome, built on a sixteenth of a foot.
- **Nothing picked up just vanishes** (`collect`, `drawFx`): it pops up and grows, turns, then flies to where it is
    kept on screen (a coin to the coin count, a golden ball to its counter, any other find to its own row of the
    list) and that spot pulses (`.pp-bump`). A word rises where it was. The speech bubble waits until the find has
    flown (`sayLater`), or it sits on top of it. check-putt asserts the flight, the pulse and the wait.
- **A creek crosses about a third of the trails** in a world with ground to keep off, plus the canyon (`creek` in
    `plan`): water, a lava flow, a frozen creek or a bog, running the whole width of the land, and the path crosses
    it on a bridge (`BUILD.bridge`: wood, stone in the temple and the volcano). A route that doubles back crosses it
    two or three times, a bridge each time. It is part of `poolAt`, so blocking, lava, ice and slow ground need
    nothing new; `deckAt` takes the deck back out of it. A creek is drawn again if it runs along the path, crosses at
    less than a fair angle, or comes near the clearing, the spur, the start, the arch, the wall or a pond.
    check-putt asserts over all 143 main tour trails that the path is never wet and every crossing has a dry bridge,
    then walks him across one.
  - **A pond is spaced from the path by its LONG radius.** It used to be the short one, so a stretched pond's ragged
    edge could reach onto the walk (a pirate trail had two wet path points). `r` on a pool is that long radius now.
- **A phone's plan is 72 ft across** (`halfW` 36, was 28), so a sideways leg is a real change of direction.
    A route reaches at most 26 ft either side (`XR`) on any screen, so a wide desktop plan does not make a long
    walk. On a shore the route keeps to the land side so the sea and its ships stay in sight.
  - **The arrow follows the route.** `along` only searches round where he already is, because a
    doubled-back route puts two legs side by side. The arrow points some way ahead along the path while the arch
    is round a bend, and the yards it gives are what is left to walk.
- **NO COIN LIES LOOSE. Coins are in a chest, ONE A TRAIL**, the owner's call: in the clearing when it holds
  one, else hidden off the path (`hideSpot`: just north of a tree or a rock). Walking up to it opens it and its coins fly out and land round it; each is walked over to pick
  up and paid into the Run The Tour wallet (`COIN_V`, 50 each, through the host's `coins`; a smashed breakable
  pays `BRK_V`, 25). Over every trail that is about 146,000 coins on the main tour (2,571 chest coins and 688
  breakables across 179 trails) and 14,000 on the Members Tour, against 40,000 for clearing the main tour's holes. A chest pays nothing
  itself. Where each coin lands is fixed by the plan (`drops`), so a coin left on the ground is still there next
  time. Breakables are the only other coins. Paying refreshes the wallet pill at the top (`coins()` in putt.js
  rewrites every `[data-bal]`). check-putt opens the chest, picks its coins up and checks the payout.
- **A find never looks like a coin.** `LOOT` in trail.js draws each its own way, bigger than a coin: the golden
  ball on a tee, a key, a heart, a gem in the trinket's colour, a putter. Each stands in a column of light of its
  own colour that shows over the trees. The list under the top of the screen (`hudList`, "On this trail") names
  every find on the trail with the same picture and ticks it off, so a player always knows what to look for.
- **What is on the trail is kept** in the Tour record as `st.trail['tour:to']`: coins (`c`), chests opened
  (`ch`), breakables smashed, the key, the golden ball and the rare things below. `k` is the clearing chest on a
  record from before chests held coins: it reads as opened with its coins already paid. A chest is locked behind
  a fence on more than half the trails that have a clearing chest (`R() < 0.55`), the key somewhere off the path: that
  key and gate is the walk's little puzzle. A golden ball on every trail; all of a world's pays 500
  coins and a named reward. `pmerge` takes the union and `cloudProg` counts them.
- **About half the trails carry a puzzle** (`puzzle()` in the plan, played by `stepPuzzle` and `pushCrate` in run),
  asked for by the owner with a coin bonus as the reward. Four kinds: three **lights** to walk past (the chest turns up
  when all are lit), **footprints** to a spot where the chest is dug up, a **pen** whose gate a **plate** holds open for a
  few seconds, and a pen whose gap a **crate** sits in (pushed toward its rock it jams, from the rock's side it clears).
  The pay is `PZ_COINS` (6) coins out of the puzzle's own chest, an item of kind `prize`, so every trail still has
  the one `chest` the owner asked for and check-putt's chest claims are untouched. Solved is `r.pz`, merged as a flag.
  - **The local gives a clue** (or the greeter, as a last page), a nudge rather than the answer, three wordings a kind
    (`PZ_CLUES`), and on a puzzle trail the local stands near the start so the clue comes first.
  - **It is placed last, on its own random stream** (`'pz:' + spec.key`), after `reachable()`. A trail with no puzzle is
    exactly the trail it was. A puzzle may clear the small trees, bushes and rocks (`TREEH`, `LOWR`) in its footprint
    and never anything else; a kind that does not fit is undone whole (`snap`, `back`) before the next is tried.
  - **A pen's gap faces the camera**, because the lock gate's sprite is never rotated. The plate's gate only shuts
    with the golfer clear of it, and stays open once the chest is had.
  - `spec.pzKind` forces a kind or `'none'`, for checks. check-putt plays every kind and asks that nothing turns up
    early, the gate shuts again, the crate jams one way and not the other, and each pays.
- **The one chest is always findable, never always obvious.** Reported by a player who could not find the chests
  the list named on two trails. They were there: one 20 ft off the path behind a tree canopy, the other in a
  locked clearing. So:
  - a clearing sits 9.5 to 15 ft off the path (it was up to 22), and a hidden chest stands at the SHOULDER of a
    tree or rock 6 to 13 ft from the path or its spur (`hideSpot`), so it peeks out rather than sitting dead
    behind it;
  - a shut chest is drawn see-through where something stands in front of it (`occlude(..., true)` in
    `drawChest`);
  - within 9 ft of a shut chest the walk says "Something glints nearby" and the list's chest row glows
    (`t.hint`, `.near`);
  - `reachable()` floods the land from the start of the walk with the run time's own colliders and body size,
    and moves any key, chest or coin it cannot reach. Measured, no trail needs it today; it is what keeps that
    true when the kits or routes move.
  `walkD` reads the path within 6 ft in y, so it OVERSTATES distance on a diagonal; measure a trail against the
  path points, not against it.
- **The rare things are fixed to trails** (`trailLoot`, `lootSlots`, main tour only), so every player finds
  them in the same places, further off the path than anything else:
  - **Trinkets**, three a world and this game's alone (`TRINKETS`). A world's three pays 300 coins and a
    named reward.
  - **Putt Putt putters**, three, each built from three parts found in the worlds it lists (`PP_PUTTERS`):
    the Scope Putter (aim line four feet longer), the Bank Shot Putter (the aim line is the ball's real path
    off the walls, `bankLine`) and the Lifeguard Putter (once a hole, water or out costs no penalty
    stroke). A built one goes into Run The Tour's closet (`host.grantPutter`, and `syncPutters` on every
    open grants any built before this), and is equipped there like any putter. The Daily Hole is played
    without the perks (`puttEquipped`). `st.pp.eq` is only the fallback for a page with no closet.
- **PUTTERS ARE THEIR OWN CLOSET SLOT, apart from the club sets** (`PUTTERS` in `golf/index.html`, cosmetic
  category `putter`, key `pu:<id>`, `look.putter`). The one equipped is the putter in both games:
  - **Run The Tour:** it adds its Putting boost on top of the set (`cosmeticBoostRows`), and the 3D golfer
    holds it on every putt (`puttLook` in `g3dSet`).
  - **Putt Putt:** its `reach` (0 to 3) sets the aim line (`host.putter()`, 5 to 11 ft), and a Putt Putt
    putter carries its perk (`host.putterNow`).
  - **Where they come from:** Stock is free, seven are pack putters (common to legendary, never sold
    directly, `cosPackOnly`), and the three `pp` putters are only built in Putt Putt.
  - **Closet in Putt Putt:** a Closet button on the hub and every trail opens `closetSheet`, which equips
    any owned putter. "Open the full closet" (`host.closet`) opens the main closet on its Putters page,
    and Back returns into Putt Putt (`setupReturn.putt`).
  - **Sprites:** each putter registers its sprite as `PXG_CLUBS['pu_<id>']` over an existing club shape
    in a finish of its own, so a thumb and the 3D golfer both read it.
  - **Spare lives**, about one trail in ten. Banked (`st.bank`), spent from the out of lives sheet. Spending
    one moves `bused`, losing it moves `bspent`, and the life in play is the difference (`lifeExtra`), so
    two devices merge by the larger of each counter. It is not on the server's lives row.
- **The Bag** (a button on the hub, `bagSheet`) shows the putters, the spare lives, and each world's
  trinkets and golden balls.
- **Where two worlds meet, a wall of the new world stands across the land** with a door on the path, the
  stars door from putt.js. Short of the stars it stays shut and he cannot walk past it.
- **A plan is the same every time** (seeded on the tour and the hole), and the next trail is built ahead
  in slices while a hole is played (`trailAhead`, `trailTick`), so most walks open at once.

check-putt walks one for real: the stick moves him, a coin, the key, the chest and the golden ball are kept,
the arch opens the hole, Skip works, the world door opens with the stars and holds without them.

**Lives are on the server, on its clock** (`supabase/138_putt_lives.sql`, deployed by hand). The Tour record
cannot hold them, because its rule is progress and lives go down. So a signed in player's lives come from
`putt_lives_state`, a life is taken by `putt_lives_spend`, and the 24 hour clock is the server's `now()`. Once
the server has answered for an account (`st.lsrv`) the device never refills on its own clock and a merged
copy never moves them. The first answer seeds the row from the lives the browser had, so nobody is handed a
fresh three. **A database without 138 answers null and lives stay on the device**, as before; preflight row
52 asks for it. The tester refill is `putt_lives_refill`, which carries its own copy of `PUTT_TESTERS`: keep
the two lists in step. The Tour Pass max (6) is the page's word, because the golf wallet is not in this repo;
a forged 6 buys three lives once and never shortens a clock. A guest's lives stay on the device.

What is still not on the server: the Daily Hole has no shared board.

**Some accounts have every hole open for good** (`PUTT_ALL_ACCESS` in `golf/index.html`, `allAccess()` and `opened()`
in putt.js): every hole of every tour, every world out from under cloud, the Members Tour as a preview, and lives never
block a hole. It is ASKED, never written: the record's `lv` stays the hole really reached, so the map's golfer, the walk
home and the server copy keep telling the truth, and taking a name off the list puts the gates back. Every unlock check
goes through `opened()`, never `tp.lv` directly. check-putt signs in as SlimeyB3 for the ordinary gates.

**A guest plays the first five Tour holes free** (`GUEST_HOLES`). Hole 6 opens a sheet asking them to sign
in or create an account, and its buttons close the mode and open the page's account sheet. The Daily Hole
stays open to guests. What a guest played is claimed by the account on the way in (below), then synced.
A host with no `signedIn` gates nobody.

**A record saved signed out is claimed by the account, never lost** (`pmerge` in `pload`). The key is
`bag_ppt_v1@<id>` once the page knows who is playing and the bare key before that, so a session that
opened before sign-in resolved played under the bare key. A player reached hole 18 and came back to
hole 1. A signed-in load folds the bare record in (furthest hole, best score per hole, aces, payouts)
and clears it. Another account's record is never folded in.

**Two hazards were added to the engine for it**: conveyors (`M.BELT`, a zone with a push in
`C.belts`) and bounce pads (a bumper with `e` over 1, capped at `V_MAX`). Mini golf sand is
`MINI_SAND_STIMP`, slow but playable; a real green's bunker still stops a ball dead. Timed gates are a
`slide` mover across a gap in a wall.

**THE DAILY HOLE IS A TOUR HOLE IN THE DAY'S CLOTHES, AND IT IS TIMED.** The old dailies were simple
shapes that put the whole field on one score. `dailyHole()` now deals one of the main tour's holes from
worlds 2 to 5 (`dailyLevel`, a shuffled 72 day cycle, so no hole comes back until all have been dealt),
dressed in the calendar's theme. Par is the tour's, and the tour's recorded route beats it in any theme,
because no tour hole reads its theme for anything but colour; `check-putt` replays it for each day. The
clock runs from the first frame the hole is drawn to the drop, is kept with the score, and breaks ties.

**THE WINDMILL'S SAILS ARE THE BLOCKER** (`blade` in `moverAt`, see `bladeSpan`). It used to be a flat
four arm spinner lying on the carpet in front of the house, which read as a second windmill, with the
sails on the tower only decoration. Now the sails turn in an upright plane just in front of the door,
sweep down to the carpet, and wherever a sail crosses the height of the ball's middle it is a bar across
the doorway. `drawSails` reads the same angle, so what blocks the ball is exactly what is drawn. A
conveyor runs through the tunnel under the house (`millDoor`), because a ball that died in there was
out of sight and the golfer stood on the roof to putt it.

**A BALL BEHIND SOMETHING IS BEHIND IT.** `hole3d.js` hands back `hid(x, y, z)` off the depth the
picture was painted with, so a ball behind a block, a rail or the house is drawn as a faint dashed
outline instead of painted on top of it, and the golfer beside it is drawn faint. **A golfer standing over the cup on screen is drawn faint too** (`golferCovers`, off the rectangle
`drawGolfer0` would draw), so the hole he is putting at is never hidden behind him.

**IT IS NOT LAUNCHED.** The home card, second in the list right after Play 18, is drawn by `puttOn()`
in `golf/index.html` for the `PUTT_TESTERS` usernames and nobody else, read off the server-attributed
`sbUsername`. There is no localStorage override, on purpose: a flag in the browser is a switch any
visitor can flip. Setting `PUTT_LIVE` to true is the launch. The module loads for everybody
(`putt/putt.js?v=`, so the cachebust check holds it) and draws nothing until `open()`.

**A PLAIN SCRIPT'S TOP LEVEL FUNCTION IS A GLOBAL.** `hole3d.js` once declared `render()` unwrapped,
which replaced the game's own screen painter for everybody, and the whole site stopped responding.
Every file here is inside one function wrapper and publishes one global. `check-putt.mjs` asserts the
game still draws its home screen with every module loaded.

**The greens are the game's own.** `fromHost()` reads `hvGeom` (size, outline, pins, bunkers,
water), `hvBiome` (colours) and the fictional venue name through `puttHost()`. Slope is built per
course from `fit.put` and the green words in its blurb. Never put a real course name on screen.

**The physics decides, and the checker plays it.** Stimp is a deceleration, slope is 5/7 g sin,
and the cup catches a ball that falls far enough before its centre leaves the hole. Every Tour
hole, every calendar theme's holes and every daily the check walks is solved by a search, and no shot may leave the course
or roll for ever. The first run found a ball resting on a rail being called out, because the
material grid is a quarter foot: OUT is only believed once the exact polygon agrees.

### A mini golf hole is a small 3D scene, and the land round it is a built place

`golf/putt/hole3d.js` draws a themed hole the way the golfer is drawn: a height field and voxel solids,
painted by PXHD. `golf/putt/land.js` builds the land a hole sits in, one composed place per theme (a
clubhouse with its practice green, a stepped temple in the jungle, a pirate cove with a ship at anchor, a mine in the canyon wall, a volcano with its lava, a tournament grandstand, a churchyard, a farm, a cabin in the pines, a garden, a glen with a round tower, a tulip field, a night fair, a
shore with a lighthouse), owner's rule: a fictional landscape, never a scatter of stickers. A real green
stays on the flat painter.

- **It draws only what stands still.** The ball, the cup, the aim, the windmill's paddles and sails and the
  sliders are drawn every frame through the projection `render()` hands back (`pr`, `zAt`), so they sit on
  the picture. `w2s` takes the 3D camera, and a screen drag becomes a direction on the hole through
  `scrDir`, because up the screen is further than it looks.
- **Nothing tall goes in front of the course.** Trees and buildings stand behind it and beside it; in front
  go low things. `furnish()` fills whatever ground the screen asks for, so a wide hole on a tall phone is
  not left on a bare band (`opt.aspect` grows the land to the stage's shape).
- **A landscape screen never zooms in.** A hole taller than a portrait phone is followed (it opens on the whole
  hole, then the camera rides the ball, and Overview puts it back); on a desktop the whole hole already reads, so
  `camFor` keeps it there and draws no Overview button. check-putt asserts it at 1280x760.
- **Direction and power are two things on screen.** The white dots say where the ball goes and nothing else:
  one size, one spacing, and they never change with the pull (they used to grow with it and read as a power
  bar). How far they reach is the putter tier the player runs in the main game (`host.putter()`, Stock 0 to
  Signature 3, `AIM_FEET` 5 to 11 ft). Power is the POWER meter on the right alone, so the read chip drops its
  pace figure on a mini golf hole. A pool cue was tried and the owner took it out.
- **The top right of a Tour hole says what each star costs** (`starTargets`), read off `threeOf` and par, so a
  hole whose three stars is a birdie shows no separate two star row.
- **A pull back may leave the window.** Positions are read off `clientX` against the canvas, the move and release
  are heard on the window, and a release that never arrives (a blur, a cancel, a lost capture, a move with no
  button down) is read as a release, so the putt goes. check-putt drives the blur.
- **It never holds a frame.** A hole renders once, and the next hole renders ahead while this one is
  played, through `slices()`: a few milliseconds a frame, never while the ball rolls or a pull back is
  held. Measured at 2x CPU throttle, play stays at 60 fps median while it works. Only the first hole of a
  round waits, behind "Setting up the hole".
- **The golfer is the 3D modelled one**, `golfer3d.js`'s putting stroke through `puttHost().golfer3`, side-on
  to the line with the putter on the ball: address while aiming, the take back while a pull is held, the
  through for a moment once it is struck. It is sized off its own figure height (`fig`) and anchored on its
  own ball cell. The flat profile golfer is only the fallback for a page without the 3D golfer.
- **A blocked or stale module, or a render that throws, draws the hole flat.** `check-putt.mjs` asserts
  that, plus every themed hole with no unknown material, open carpet landing on carpet in the picture, and
  the sliced render matching the one-shot render pixel for pixel.

#### The console look is on every hole and every trail

Asked for by the owner: make Putt Putt look like a console game in a browser. It was tried on one hole a world
first and is now on everything themed: the tours, the Lab, the Daily and the trails. `opt.fx` on `hole3d.js`
relights the finished picture and never moves a pixel, so the pixel art stays the pixel art.
`window.RTT_PUTT_FX = 'off'` takes it off everywhere, to compare.

- **Sun shadows.** While the scene is built, each pixel's surface height (`WZ`) and a top-down height map
  (`HM`, a quarter foot a cell) are kept. Each pixel marches toward a low sun in the north west (the upper
  left), and whatever stands in the way darkens it, cool in shadow and warm in the light, with a dithered edge.
  **The sun is `(lx, ly, RISE)`, toward -x and -y.** The first rim light used the opposite sign and lit the
  faces that point away from it; nothing threw.
- **Only what lies on the ground takes a shadow or a dark corner** (within 0.45 ft of `gz`). The painter
  already shades the far side of a tree; shading it twice turned a wood into a black mass.
- **A trail's shadows are lighter** (`SC`, times 0.55), because it is seen close in among trees taller than the
  golfer, and at full strength a wood was a lake of blue. Its painted blob shade (`P.shadeAt`) drops to 0.4
  under the look, so it is a contact shade and the sun casts the real one.
- **The course stands on a plinth.** `CARP` is 0.95 and `RAIL` 1.55 (they were 0.35 and 0.95), so the near
  side shows a base under the rail and the course throws a shadow onto the land. The rail is the same 0.6 over
  the carpet, so it hides no more of the course. The base is drawn in `wallLo` only where a rail stands over the
  land; a rail over a lower room keeps its own colour.
- **The carpet has a nap**: broad strips that catch the light slightly differently, and a tuft here and there.
- **A lit rim along what stands up**: a pixel one inside the outline, where the scene two pixels up or across
  is much further away and the surface faces the sun, takes the light.
- **Water and ice take the sky**, stronger toward the far bank, with a few glints. The glints and tufts use a
  well mixed hash (`hq`); `P.hash3` is an XOR hash and drew them in diagonal lines.
- **A glow at night**: lava, neon and lanterns bleed a soft halo, worked at a quarter size and blurred. Only the
  land and the solids can glow, read before they were relit, so a carpet or a sunlit rim is never a lamp.
- **Haze over the far land, and a grade.** The top of the picture fades toward a pale sky, or into the dark
  on a night world (`night`, off the land's own background). Colour and contrast go up a little.
- **The stage takes the same grade** (`bg`) and the picture hands back `sky` (`top`, `sky`, `bot`), so the
  stage above the far land is a sky that meets it and the stage below fades from the near land.
- **Over the stage, in screen pixels** (`drawFxScreen` in putt.js, `fxScreen` in trail.js): the low sun's warm
  light from the upper left (none at night) and a vignette.

It costs a little over what the render did before (`check-putt` holds a Tour hole under 900ms with it). The
render key carries it, so a cached render without it is never shown in its place.

#### A trail is rendered once, and every pass that made it faster is pixel for pixel

Reported by the owner: the mode looks good and is slow. It took a while to load, lagged, and the walk was too slow.
Measured first. Opening the mode spent 4.5s of a desktop core (about 21s at a phone's 4x throttle) rendering the
trail it opens on, and did it again every time the mode was closed and opened, because the rendered trails lived on
`S`, which `close()` throws away.

- **The paint is PXHD's `Sprite.paint`, ported into hole3d.js.** Same rules, same order, written into one pixel
  buffer. The original did a `fillRect` a pixel and looked each pixel's ramp up three times. A pixel's rules only
  read its neighbours' parts, never their tones, so each pixel is finished on its own and bands only give the frame
  back. `LIGHT` is copied from PXHD, which does not export it: change one and change both.
- **The ground's cells are built only once they are in front** (`splatG`), the land's `t:` keys are interned, the
  shadow march stops above the scene's tallest point (`HTOP`), and `creekD`, `deckAt`, `poolAt` and `footAt` answer a
  repeated point from a one-entry memo (`memo2`), because `h()` and `mat()` ask about the same point in a row.
- **Every one of those was checked as a hash of the pixels and the depth buffer**, over eight trails and twenty two
  holes, before and after. Identical. Do that again after touching the renderer: a faster picture that is a slightly
  different picture is the one way this work can go wrong in silence.
- **Rendered trails are kept** (`TRC` on the module, the newest four) and **on the device** (IndexedDB
  `rtt_putt_trails`, the newest three, through `RTT_PUTT_3D.pack` and `unpack`). The disk key carries the `?v=` of
  putt.js, trail.js and hole3d.js and a hash of a few PXHD ramps (`trailV`), so a change to how a trail is drawn
  renders afresh. **Bump those versions when the picture changes**, or a returning player sees the old drawing.
  The render in progress (`TRJ`) is on the module too, so leaving the mode mid-render keeps the work.
- **The walk draws only the part of the picture on screen**, writes to the page only when a value changes
  (`put`, `cls`), and what stands in front of a thing that stands still is one cached mask (`occMask`) instead of a
  `drawImage` per row-run: 683 draw calls a walking frame became 81.
- **He walks at 10 ft a second, and it was 7.** The stride grew with it (3.4 to 4.4) so the legs still read as walking.

Measured after, desktop and 4x: first open 3.0s and 14s, reopening the mode 0.1s and 0.9s, after a reload 0.75s and 1.7s.
The first open of a trail nobody has rendered is still the slowest thing in the mode.

**The home screen's Play 18 strip is kept too** (`DART_LS` in golf/index.html). It is a 3D terrain render, about
half a second of a desktop, and it ran a moment after every visit's first paint. The last one is in localStorage
under a key naming the course and the code that draws it, and only a 3D strip is kept.

## Run The Tour's tracer is full screen, and the course has a console pass

Asked for by the owner: the Tour Tracer full screen on every device, and the console feel Putt Putt has.

**Whenever the tracer is up, the round screen IS the window** (`body.hvfull`, set in `render()` from
`HV_FULL`). The site header, foot and nav hide; the hole fills the screen and everything else floats on
it as glass: a top bar (menu, the broadcast header, a Card button that opens the scorecard as a sheet),
the chips, the shot caption and the control dock. `hvFullChrome()` builds the top bar as a pass over the
finished screen. **`hvFullSet(mode)` is the one way a screen claims it**: it sets `HV_FULL` and puts the
`hvfs` class the CSS keys off on the screen, so every rule reads `body.hvfull .hvfs`, never a screen's own
class. A screen that does not call it keeps the page.

- **The camera keeps the whole hole in the band between the chrome** (`hvFullFrame`). `HV_FULL_SIZE` is
  how much chrome sits above and below the hole, per layout (`phone`, `wide`, `short` for a phone held
  sideways) and per mode (play, decision, review, mulligan, done). The frame extends the course
  sideways and vertically (`HV_EXL`, `HV_EYT`, `HV_EYB` into `HV_CAML`), and the base tile is painted
  for that whole frame at the same pixel size. Change a chip's height and change its row there, or the
  tee lands under the dock.
- **Each mode is its own frame and its own tile**, cached by camera, so the first decision of a hole
  pays one terrain render.
- **Close-ups scale by the frame's width** (`FL` in `hvCamFor2`), never by a tall phone's height, or a
  short putt zooms half again further in.
- **Centre a fixed element with left, right and margin auto**, never a transform: an entrance animation
  that sets `transform` throws it off screen.
- **Sideways, the decision panel drops its prose** and the frame may widen past `HV_EX_FULL`, or the tee
  sits under the panel.

**The console pass is `consolePass` in `golf/tracer3d.js`**, run on every 3D tile after it is painted. It
relights and never moves a pixel: a contact shadow round everything that stands, foam and glints on
water, a sun rim on the lit edge of objects, light falling off away from the play, haze over the far
end, and a grade (cool shade, neutral highlights, a touch more saturation and contrast). It never
writes pure black, because `check-tracer3d` refuses black and transparent pixels and refuses any lift
of a surface the ball can rest on. `window.__T3D_FX = false` turns it off to compare.

### Quick play, the watch screens and the share GIF are on the same stage

- **A quick play routine hole still has no tracer** (the owner's rule: routine holes only reveal a score).
  It gets the stage anyway (`qfull` in `scrDailyRound`, class `hvq`): the hole's course fills the screen,
  blurred and darkened so it reads as a place and not a tracer, the running score sits in a glass card, and
  the scorecard stays docked over the controls with no Card button. The backdrop is `hvQuickBgURL`, the
  standard-frame tile (the one the GIF uses), so it is cached by hole alone; `hvPrewarmHole` paints it during
  the result beat. The hero centres in what the card leaves (`--hvqcard`, measured after each render).
- **The head to head watch and the career playoff watch** call `hvFullSet` whenever there is a hole to show:
  live, in a playoff, and for a replay. Their header is `hvBcastHd`, their buttons sit in `hvWatchDock`, and
  an announcement, standings or result is a glass card (`hvPanel`) over the hole about to be played or the
  last one played. If the tracer cannot be drawn they set `HV_FULL` back to null and keep the page.
- **The share GIF and the highlight reel** draw the course at the share's own size (`hvPixelScene(...,
  crisp, cam)`, the same 3D tile and console pass the screen shows), with course above and below the hole
  for the glass bars to sit on (`hvShareFrame`), the screen's lens (`hvShareLens`), and the result stamped
  over the course at the end (`hvShareStamp`). `gifBuild` writes each frame after the first as only the
  rectangle that changed, which is what keeps a 360px GIF near 250KB.

## Run The Tour's course golfer is the profile golfer, drawn from a 3D model

```
node golf/check-golfer3d.mjs        every look, every aim, every shot, and who sees it (server on :8099)
```

`golf/golfer3d.js` plays the tracer's shot with the player's own golfer: a small posed 3D model whose every
cell is handed to the profile renderer's own `paint()` (PXHD in `golf/index.html`). So the light, the colour
ramps, the contact shadows and the soft outline are the profile picture's, and the model only says what is in
each cell and which way it faces. One model covers every aim (snapped to eight), both hands, and the full
swing, chip and putt. The golfer stands side-on to the line like a real golfer.

**It is live for everybody**, asked through `g3dOn()`. `G3D_LIVE = false` is the kill switch, which puts it
back to the `G3D_TESTERS` accounts alone. A blocked or stale module falls back
to the old sprites, which are untouched. `PXHD.Sprite` takes a size now, and the 44 by 56 profile grid is the
default, so every profile picture is byte for byte what it was. Measured on 40 looks against the old file.

**Every item in the store is drawn on it, and the hats and glasses come out of one rule.** A hat or a pair of
glasses is built from the profile picture's OWN art, so each wears exactly its own colours and a new one needs
no code. Each row of the front art is spun round the head's up axis (`hull()`): the run through the middle of a
row is a solid slice (a crown, a cone, a brim), a row with a hole in the middle is a band round the head (a
wreath, a hood round the face), and a piece standing off on its own (antlers, horns) is a flat cut-out. Glasses
are a thin layer on the face, with arms run back over the ears. `HAT3D` holds the few that need telling apart:
the halo is a ring, headphones and antlers are flat, the pirate hat is narrow front to back, the mortarboard is
square. The tops, plus fours, cleats and every novelty club (scepter, candy cane, sword, wand, hockey stick,
hot dog, pool noodle, coffin, broom, pitchfork) are modelled. A recoloured club kit draws the club the shot
uses in the kit's finish; a novelty club is the novelty for every shot, so a scepter putts too.

Three things in that art were wrong for 3D and nothing threw:

- **Face and hair pixels under a brim were spun into the hat**, as tan centres on every brim hat. Skin and
  hair characters are left out; the model's own head is underneath.
- **The profile head is shorter than the model's**, so the head poked through the crown of a low hat. A
  closed hat is domed over the top in its crown's colour, and a band is never narrower than the head.
- **The top hat's art carries a stray strip at row 55**, hidden behind the body on the profile. In 3D it lay
  on the grass. Nothing below the shoulders is read, and `check-golfer3d.mjs` asserts no item leaves a piece
  apart from the golfer, which reintroducing the strip fails at every aim.

**The figure's size is read off the head, never the top pixel**, because the page sizes the golfer by it and
a witch hat would otherwise shrink him. The canvas is 94 tall for the same hats. `check-golfer3d.mjs` draws
every hat, glasses, top, legwear, cleats, club, body skin and hair one at a time, from four sides, and asserts
each changes the picture, paints no unknown material, keeps the size and stays on the canvas.

Drawing a set costs about 20ms on a desktop and 60 to 100ms on a throttled phone, once per look, aim and kind
of shot, and the other seven aims are drawn while the page is idle. A hull is marched only inside its own box
and only in front of what is already in the cell.
