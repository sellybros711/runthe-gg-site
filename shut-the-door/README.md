# Shut The Door: engine, data and backend

Agent A's half of the game. `CONTRACT.md` is the spec and wins over this file. Agent B's README
(if there is one) covers the UI. The vault note `games/shut-the-door/shut-the-door-mechanics` has
the shape. This file has the formulas.

## Files

| file | what it is |
|---|---|
| `contract.js` | the lead's constants (grid, bands, pitch types, epoch). Imported, never retyped |
| `rng.js` | mulberry32, the site's `hashSeed`, the normal quantile, four draws a pitch |
| `grade.js` | the miss tables, the outcome mix, hold% for every state, the grade and its reason |
| `engine.js` | an outing: the draw, the runner moves, the end rules, the result and its score |
| `api.js` | `window.STD_API`, the four async calls, localStorage, the submit |
| `meter.js` | `window.STD_METER`, the release meter: the timing to q, and the bar on the mound |
| `share.js` | `window.STD_SHARE.text(result, dailyNumber)` |
| `auth.js` | `window.STD_AUTH`, the site's account client, plus `submit`, `board`, `myStats` |
| `pool.js` | node only, at build time: hold tables into the pack, the closer pool's outings |
| `check-replays.mjs` | replays stored daily results and flags a score the calls do not produce |
| `pipeline/` | Python and two node scripts, never loaded by the page |
| `data/packs/<id>.json` | one pack per scenario, under 1.5 MB |
| `data/schedule.json` | each day to a pack and a daily number |
| `data/closers.json` | the closer pool's policies (pool.js plays them, the tests replay them) |
| `data/verify/*.json` | every scenario fact, with its sources |
| `scenarios/` | `CANDIDATES.md` (the verified list) and `scenarios.json` (the approved ten) |
| `test/` | `engine.mjs` (synthetic pack), `packs.mjs` (every real pack), `api.mjs` (the four calls) |
| `3d/` | the mound in 3D. `boot.js` (`window.STD_STAGE`, tiny) imports `stage.js` from the home screen; it draws every pitch from the engine's PitchResult (`play.js`). Assets in `3d/assets/`, licences in `lab/LICENSES.md`. The people move with Mixamo animations: only the baked clips inside our glb files ship, never the raw FBX (`.gitignore` refuses them) |
| `lab/` | the 3D dev page and its pipeline (`check-deform.mjs`, `check-fit.mjs` for the headgear, `check-load.mjs --game`, `shoot.mjs`, `stamp.mjs`) |
| `mound.js`, `sprites.js`, `anim.js` | the old drawn mound, used only where WebGL is missing (`anim.js` also times the scorebar's runners) |

## The pipeline

Free data only: Baseball Savant (Statcast, and PITCHf/x from 2008), the MLB Stats API, and
Retrosheet (through the Chadwick Bureau's GitHub mirror, which also has the register used to map
Retrosheet ids to MLBAM ids). Python 3.11, pandas, numpy, requests, SQLite. No pyarrow.

```
cd shut-the-door/pipeline
python3 prep.py                 the grid is contract.js's grid (0 mismatches)
python3 build_library.py        the library: 2008-2025, every pitch, trimmed (slices.json)
python3 verify_scenarios.py     every candidate's facts into data/verify
python3 closers.py              the regular-season scenario search
python3 closer_pool.py          data/closers.json
python3 build_packs.py          the ten packs, staged in cache/stage
for f in cache/stage/*.json; do node ../pool.js "$f" ../data/closers.json "../data/packs/$(basename "$f")"; done
node build_schedule.mjs         data/schedule.json
python3 report.py               pipeline/report.md
```

`.github/workflows/shut-the-door-data.yml` runs the same steps on GitHub's runners and commits back
only `data/` and `report.md`.

**The library never goes in git** (Pages refuses a file over 25 MB). Savant's search answers at
most 25,000 rows, so a season is fetched in five-day chunks; a chunk at the cap is split and asked
again. Each chunk is kept trimmed to `savant.LIB` and gzipped in `cache/chunks` (about 1 MB per
chunk, under 1 GB for 2008-2025), and `cache/library.sqlite` is rebuilt from the chunks. The
workflow caches the chunks, never the SQLite file. Requests are spaced (`STD_POLITE_S`, 0.6 s) and
one at a time per worker. `prefetch.py` fills chunks from a second process.

## A pitch

1. **The grade, first.** Hold% of the call against hold% of the best call in that state
   (`grade.js` `gradeCall`). The outcome never touches it.
2. **The miss.** The target cell's centre plus a normal miss of `sigmaFt` in x and
   `sigmaFt / kernelZoneFt` in normalised height, both times the release's spread
   (`contract.js spreadOf(q)`: 0.6x for a perfect release, 1.5x for a bad one, 1.0x without `q`).
   The grade's miss table (`kernelFor`) is the same normal at 1.0x, integrated over each cell: the
   grade prices the call at his own command, and the release is execution (CONTRACT.md section 5).
3. **The outcome.** The pack holds, for this batter, this pitch type, the cell it crossed and the
   count bucket, the chance of each of 14 outcome keys (ball, called strike, swinging strike, foul,
   hit by pitch, single, double, triple, home run, error, and an out on the ground, a line, a fly or
   a pop-up), per mille. The library draw picks the key from that row: the same row the grade
   priced. The key's real pitch (one per key, cell and batter) gives the velo, the batted ball and
   the `drawn` id and tier.
4. **The runners.** For a ball in play, the advancement table for that key at the current outs and
   bases, chosen by the runner draw. Walks and hit batsmen force runners.

Four draws a pitch, always, in that order (miss x, miss z, the outcome, the runners), from one
mulberry32 stream per outing. Daily seed: `hashSeed('shut-the-door-' + day)`.

Under rules 2 (below) steps 1 to 3 also read the outing's log: the grade prices the history, the miss
is also scaled by the arm (`fatigueOf`) and a repeat keeps less release (`spreadOf(q, repeat)`), and
the row is the pack's row adjusted for what the hitter has seen (`rowsCtx`). Same four draws.

## Rules 2: the hitter adjusts, the arm tires (2026-10-22)

The owner: "I've never given up a run yet. Can we up the difficulty?" CONTRACT.md 5b is the rule;
`grade.js R2` holds every setting. A new outing plays rules 2 and its calls carry `r: 2`; a call
without `r` replays as rules 1, exactly.

**Why it was easy (measured on main, 400 outings a strategy a pack, an ordinary release).** Mean hold%
over the ten packs. The closer pool holds 78.2, real 2015-2025 spots about 83.

| player | rules 1 | rules 2 |
|---|---|---|
| the same pitch to the same spot every pitch (the best such call per pack) | 84.1 | 63.7 |
| the screen's top call every pitch (heat map, swing map, scout card) | 82.0 | 61.7 |
| the screen's top six, at random | 82.5 | 72.4 |
| the screen's top call, mixing types and spots and not leaning on the zone (strong) | 81.9 | 76.4 |
| his pitches at their usage, a random strike, a chase pitch with two strikes | 82.0 | 78.1 |
| the closer pool (real closers' choices) | 78.2 | 76.1 |
| the grade's best call every pitch (the ceiling) | 91.7 | 92.2 |

Nothing in rules 1 answered a pitcher who repeats himself: each pitch's outcome came from the pack
row for that pitch, cell and count, the same however often the batter had seen it. Any steady
strategy beat the real closers, and a single repeated call beat them in all ten packs.

**Each effect alone** (rules 2 with only that effect, mean change against rules 1 in hold%, ordinary
release; the strong player, the screen's top call, the repeated call, the pool): the hitter adjusting
to the pitch +2.6, -9.0, -10.0, -2.0 (the fresh look pays, the repeat costs); where he has aimed
-8.2, -8.1, -7.3, -0.1; the arm -0.6, +1.3, +0.8, +0.6 (centred: it bites only in long outings);
a repeat keeping less release, with a perfect release, 0.2, -2.6, -2.1, 0.3; coarser scouting -0.7,
-1.0, 0.4, 0.3. Runs of 300 outings, so a point is noise.

**Measured and modelled.** `pipeline/effects.py` (2024, `pipeline/effects.json`): within about 5%
key by key for repeats, a flat spread by pitch count, 1% wider with runners on, because the data is
chosen by the pitchers. So the shares, the pitch counts and the runners-on spread are used as
measured, and the strengths (`FAMILIAR`, `EFFECT`, `ZONE`, `FATIGUE.rate`) are a labelled model
tuned to the owner's target: a strong player who reads the screen and mixes holds about what the
pool holds. Change them only with these runs (`pipeline/strategies.cjs`) and
rebuild every pack with `pool.js` (the pool and `pack.seq`).

**The pool.** `pool.js` plays it under rules 2, maps a closer's pitch family onto every pitch the
scenario pitcher has in it by usage (not only the most used), and stores `pack.seq`: the familiarity
(`L`) and zone share of aims (`Z`) its calls show, which rules 2 centres on. The pool held 79.5 and
holds 76.8 (pack builds); its calls band 19/28/33/21, from 22/33/30/15, because the grade now prices
the history the pool's calls ignore. `BANDS` did not change: heart fastballs grade mostly orange and
red in 10 of 10 packs (9 of 10 before; Chapman's three-run lead now 66%).

## Effort and the free aim point (2026-10-22, retuned 2026-10-23)

The owner's two stop meter: a pitch is a type, an aim, an effort stop (`e`) and an accuracy stop
(`q`). CONTRACT.md 5c and 5d are the rules; `grade.js EFFORT` and `meter.js EFFORT_WINDOW` hold the
settings, each marked data, game choice, game rule or model. Rules stay 2: a call without `e` or `at`
plays exactly as before (`e` 0.5 and `[0, 0]` are the neutral values), so no stored outing moves
(`check-replays.mjs --self-test` holds rules 1 rows and rules 2 rows made before effort, every pitch,
speed and arm).

**Where the speed comes from (data).** `pipeline/effort.py arsenal` reads each scenario pitcher's own
pitches from the Savant search his arsenal came from, ranks each type by speed and keeps the mean
speed and break of five slices: his slowest 5%, the second, middle and fourth fifths, his fastest 5%
(`arsenal[i].stuff`, `data/effort_arsenal.json`). Chapman 2016's four-seam reads 97.4, 100.1, 101.1,
102.1, 104.4. A type with fewer than 40 tracked pitches of his own, and Eckersley 1988 (no
tracking), shows his average plus the league's typical spread (`src: 'league'`). Every speed shown
is one he threw.

**What a harder pitch does (data).** `pipeline/effort.py league` on every 2024 regular season pitch
(643,123 in groups of 100 or more by pitcher, type and season; `pipeline/effort.json`). By slice of
his own speed, slowest to fastest, observed over the same family in the same cell, exact count and
platoon:

| family | speed against his mean (mph) | whiffs | home runs | hits | called strikes | location spread |
|---|---|---|---|---|---|---|
| fastballs | -2.5 to +2.2 | x0.78 to x1.13 | x1.34 to x0.75 | x1.08 to x0.92 | flat | his fastest +3% |
| breaking | -2.9 to +2.6 | x0.83 to x0.99 (x1.05 at the fourth fifth) | flat to x0.79 | flat | x1.06 to x0.81 | his fastest +11% |
| offspeed | -2.7 to +2.4 | flat to x0.86 | flat | flat to x1.07 | flat to x0.92 | his fastest +6% |

A harder breaking ball breaks about 1 in less; a harder changeup whiffs less (separation is the
pitch). Relievers' speed is flat across an outing (within 0.2 mph). A measured association: the
count and the spot are held, his intent is not.

**What is a game choice, not data** (the owner, 2026-10-23: effort should be a real weapon, and max
every pitch still not the best play). Above the middle, every measured ratio's distance from 1 is
multiplied by `EFFORT.GAME` = 8 (floored at 0.2), and the spread's by `SPREAD_GAME` = 2. So a max
effort fastball whiffs about 2x and gives up a fifth of the home runs, and a max effort breaking
ball is rarely called a strike and misses 22% wider. The direction is always the data's. Below the
middle the data is used as measured. **Game rule:** the window, x1.25 at `e` 0 and x0.6 at `e` 1.
**Model (tuned):** a pitch counts 2 pitches on the arm at max and 0.5 at the softest; the load over
1 builds a strain that easier pitches pay back, and the arm's miss is x (1 + 0.05 x strain).

**Measured effect** (`pipeline/strategies.cjs`, 1,000 outings a strategy a pack, ten packs, rules
2; mean hold%, then the median outing's percentile). `none` is the meter as it was, one stop. The
releases: ordinary (the meter's tap model), good (half its miss, a third of its slips), perfect.

| player, release | none | always e 0 | always e 0.5 | always e 1 | smart mix |
|---|---|---|---|---|---|
| strong, ordinary | 76.6 · 56th | 75.7 · 57th | 76.6 · 56th | 70.6 · 43rd | 81.1 · 55th |
| strong, good | 78.4 · 58th | 77.0 · 59th | 78.4 · 58th | 76.7 · 49th | 81.6 · 56th |
| strong, perfect | 79.0 · 62nd | 77.7 · 63rd | 79.0 · 62nd | 81.6 · 56th | 82.7 · 60th |
| average, ordinary | 78.0 · 58th | 77.1 · 60th | 78.0 · 58th | 59.0 · 32nd | 80.1 · 58th |
| average, good | 79.9 · 62nd | 77.7 · 62nd | 79.9 · 62nd | 67.5 · 40th | 81.2 · 62nd |
| average, perfect | 80.5 · 63rd | 78.5 · 64th | 80.5 · 63rd | 75.9 · 50th | 82.7 · 63rd |
| screen's top call, good | 61.7 · 31st | 60.9 · 32nd | 61.7 · 31st | 55.7 · 24th | 65.3 · 30th |

The smart mix saves it for the put-away: max with two strikes, easy early in the count, at three
balls and on the changeup or splitter, ordinary otherwise. For a strong player who times well it
holds 3.2 points more than never changing effort (3.7 with a perfect release); max on every pitch
is worse than the smart mix for every player and release, and worse than never changing it for all
but the strong player with a perfect release (more walks: 22% of batters for a good timer at max, the strain, and a breaking
ball that will not get a called strike). The median percentile moves less than hold: the smart mix
throws about a pitch more an outing, and the score adds up points lost per pitch. The closer pool
plays without effort and is unchanged (76.8).

**The free aim point: the grade prices the exact spot** (the owner, 2026-10-23). A call's value is the
miss table centred on its aim point; the best call and the state's mean stay the cells' centres, and
what the player reads stays on the cell. The same runs, no effort, ordinary release (hold and walks
do not depend on the grade; the percentile does):

| aim, every pitch | strong: hold · walks · median pct (graded at the centre, before) | average: hold · walks · median pct (before) |
|---|---|---|
| the centre | 76.6 · 4.9% · 56th | 78.0 · 6.6% · 58th |
| random in the cell | 76.9 · 5.9% · 54th (54th) | 77.9 · 7.7% · 56th (57th) |
| far corner from the heart | 69.2 · 27.7% · 43rd (34th) | 71.2 · 20.6% · 42nd (37th) |
| near corner to the heart | 74.9 · 0.7% · 50th (63rd) | 78.7 · 1.6% · 59th (68th) |

The near corner's edge (7 to 10 percentile points when the grade priced the centre) is gone: -6 for
the strong player, +0.2 for the average one. Those calls now grade as the near strikes they are (the
strong player's band mix goes from 11/35/37/17 to 13/12/22/54).

**Bands.** `band_sweep --relative` reads exactly as on main (pool calls 19/28/33/21, heart fastballs
orange or red in 10 of 10 packs, lowest 66%): the grade reads neither stop, and the pool aims at
centres. The pool, `pack.seq`, the hold tables and the pros rebuilt identical (`pool.js`). `BANDS`
did not change.

## The tiers (that batter, similar batters, league)

`pipeline/model.py`. For each arsenal pitch:

- **league**: every pitch of that type by a pitcher of the same hand within 2 mph of this
  pitcher's average, to a batter of this side, in the league window (real spots: the season and
  the ones either side; proxy spots: 2021-2025), by cell, count bucket and key. Smoothed toward
  the same type at any velocity (40 pitches).
- **similar**: the 25 batter-seasons nearest to him. Real spots: by chase, zone swing, whiff by
  family and damage on contact (heart, edge, overall). Proxy spots: by season line (AVG, OBP, SLG,
  HR per PA), since the man has no tracked pitches.
- **batter**: his own pitches against this hand, that season and the one before.

The batter and similar tiers scale the league table by ratio, at a coarser grain so a few hundred
pitches mean something: 7 regions of the grid by two strikes or not by pitch family. In each group
his outcome mix is shrunk toward the similar batters' (80 pitches), theirs toward the league's
(200), and the ratio to the league's mix scales every cell of the group, key by key (capped at
0.2 to 5), then the row is renormalised. A batter is `profileTier: 'batter'` with 300 or more
pitches against that hand, else `similar`.

Each key's real pitch is his own if he has one of that type, in that cell, with that outcome,
within 3 mph (tier `batter`), else a similar batter's (`similar`), else the league pool's
(`league`).

## Hold%, and the grade

States are (batter index, balls, strikes, outs, bases, margin) with margin = us minus them, from
0 (tied) to the starting lead. A run that ties does not end the outing (the owner's call,
2026-10-20), so a tied game is a state like any other. Each state has a goal: with the lead, hold
it (three outs at margin 1 or more); once tied, keep them from going ahead (three outs at margin
0). `goalOf(st)` is that least margin. A state's value is its goal's chance: three outs are 1, a
go-ahead run is 0, and with the lead a move into a tie is 0 (a blown save), exactly as when a tie
ended the outing, so every grade before a tie is unchanged. After a tie the same recursion, the
same `lost` and the same relative bands grade every call on the tie's goal, and the grade says
`tied: true`. Hold% of a state is the best call's, by a recursion that ends because the count only
moves forward within a plate appearance (a two-strike foul is a self-loop, solved in closed form)
and between plate appearances outs, runs or runners only climb (the advancement table keeps
runners: after + runs + outs = before + 1). `pool.js` solves every state and stores the table
dense in the pack (`hold.h` the goal's chance, `hold.r` expected runs to the end of the outing,
`hold.b` the best call; `margins + 1` slots per base-out-count, pack format 2); the browser grades
from it.

A call's value is the mix over the miss table of each outcome's next state. `lost = best - value`
in points of hold%. The band is `contract.js bandOf(lost)`. The thresholds are the lead's, and
`pipeline/band_sweep.mjs` measures any candidate set on the real packs (absolute, or `--relative`
to the state's mean lost). `reDelta` is the call's expected runs
minus the best call's.

**The reason line** is one fact with its number from the pack: green, a note about that pitch and
place if one fits, else what the best call holds; otherwise a note about the best call, his damage
in the called cell (xwOBA on contact), the count (three balls, two strikes), or the two hold%s.
Notes come from the batter's own data: chase rates in a region with two strikes (only when above
the league's), whiff rates by pitch, xwOBA on contact by part of the zone.

## Command

`model.py command_of`. For each pitch type, his location spread (the root-mean-square distance of
his pitches from his own mean location in each count bucket and batter side, groups of 10 or more,
with the small-group correction) against the league's for that type and hand. His spread is
shrunk toward the league mean by his pitch count (150 pitches of prior). `sigmaFt = 0.45 x his /
league`, and `command = 50 + 10 z`, clamped to 20-80. 0.45 ft is a game setting (the average
pitcher's miss per axis): Statcast does not record the catcher's target, so it is not measured.

## The outing score and percentile

```
score = max(0, 700 - 20 * total pts lost) + {door_shut: 300, tie_held: 200, doors_open: 100, walk_off: 0}
```

The result's part is 100 points a rank (`contract.js OUTCOME_RANK`). A held tie is a blown save, a
full step under a door shut, and the game goes on level, a full step over door's open. After a tie
the points lost are points of the tie's goal.

So the hold% kept across the outing decides most of it, and the result decides the rest. The
percentile is the share of the closer pool's outings for that scenario this beats (ties count
half).

## The closer pool, and pitched like

`pipeline/closer_pool.py`. A closer season is 15 or more entries into a 9th inning with a lead of 1
to 3. The pool is the 40 pitchers with the most such entries, 2015-2025 (Clase excluded by the
lead's ruling). Each one's policy, from his pitches in the 8th inning or later in those seasons:
the share of hard, breaking and offspeed by count bucket, and where those pitches went by family
and bucket, in a batter-relative grid (mirrored for a left-handed batter), smoothed toward his own
spread and then the league's.

`pool.js` plays each policy through the scenario at least 2,000 times in all: his family maps to
the scenario pitcher's most used pitch of that family (or the nearest family he has), his
location becomes the target, and the engine adds this pitcher's miss on top (so the pool is a
little wilder than the men in it). The sorted scores are `pool.scores`.

**Pitched like** is the nearest closer by a 15-number vector: family share in each count bucket
(12), then the share of targets in the zone, on its ring and out of it. The player's vector is
built from his calls (`engine.js styleVector`), each closer's from his real pitches.

## The lesson (CONTRACT.md section 15)

`lesson.js`, loaded before `engine.js` (which reads `window.STD_LESSON`). After the outing, the pitch
with the most hold% lost. In the state before it, the gap between the best call and yours splits
exactly over the outcome keys: `sum (p_best - p_call) x (value after the key - value of your
call)`, with p each call's outcome mix through the miss table. The keys group into walk risk (the
takes: ball, hit by pitch, called strike), whiffs (swinging strike, foul), damage (hits, errors)
and outs in play. The group that explains the most picks the kind of principle; the count, the
bases, the platoon and the two calls pick which one, and each principle must be shown by its own
numbers (`SHOWS`) before it is used. The copy is templates, every number from the pack or the
grade. `pattern` is one note on the whole outing when one is true (mostly fastballs against a
lineup that misses the breaking ball, mostly out of the zone with walks, mostly in the zone).

**The pro** is a real pitch: `pipeline/pros.py` tags every pitch by a closer pool pitcher
(2015-2025) with each principle it shows and keeps the best per (principle, count bucket, platoon,
family, batter-relative cell): postseason first, then leverage. `pool.js` keeps in each pack only
the rows within one cell of a best call that pack's hold table can produce. The lesson takes the
one in the best call's cell, else a neighbour; none, and `pro` is null.
`pipeline/check_pros.py` checks every one against the library (count, type, cell, result).

When no principle is shown by the numbers for the worst pitch (about 1 in 400 non-green outings
on the real packs), the lesson is null rather than invented.

## The proxy path (before 2008)

Eckersley 1988 and Rivera 2001. The facts come from Retrosheet event files; the replay of the
whole game is checked against Retrosheet's game log line score. The arsenal is public reporting
(Eckersley: a fastball and a slider, velocity and usage set by the proxy and flagged as such) or
the pitcher's own nearest tracked season (Rivera: 2008). The league tier uses modern pitches of
that type, hand and velocity band (2021-2025); the similar tier is matched on season line. Each is
`resolution: 'proxy'`.

## Adding a scenario

1. Add it to `pipeline/candidates.json` and run `verify_scenarios.py`; read `data/verify/<id>.json`.
2. Add it to `scenarios/scenarios.json` with its title and arsenal source (`regular`,
   `postseason`, or `proxy` with the source).
3. `build_packs.py <id>`, `pool.js`, `build_schedule.mjs`, then `node test/packs.mjs`. Report its
   band spread before it goes in the rotation.

## Accounts

`supabase/153_shut_the_door.sql`: `shutdoor_outings` (user, day: the calls, outcome, pitches,
score, percentile, pitched like, strip), `shutdoor_streaks`, and three functions, all security
definer: `shutdoor_submit` (Eastern day within one, the first submit stands, streak of doors shut on
consecutive days, a blown save or a missed day resets it, returns `{taken, streak, best, rank,
players}`), `shutdoor_board(day, limit)` and `shutdoor_my_stats()`.
`supabase/155_shut_the_door_tie_held.sql` lets `tie_held` in (the check, the submit's guard) and
adds `tieHeld` to the stats; a held tie resets the streak like any blown save. Its test is
`supabase/test/shut_the_door_test.sql`. The page needs supabase-js loaded with `defer` (as
`baseball/index.html` loads it) for `auth.js` to come alive; without it the game plays as a guest.
