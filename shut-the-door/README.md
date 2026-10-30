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
python3 third_outs.py           third_outs.json: the plays that end a half, from Savant's play text
python3 build_packs.py          the ten packs, staged in cache/stage
for f in cache/stage/*.json; do node ../pool.js "$f" ../data/closers.json "../data/packs/$(basename "$f")"; done
python3 tracking.py arsenal && python3 tracking.py packs     release and spin (then pool.js on each committed pack)
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
   bases, chosen by the runner draw. Walks and hit batsmen force runners. Every row is a legal MLB
   play (`check-rules.mjs`, below), and a run that crosses before a legal third out counts.

Four draws a pitch, always, in that order (miss x, miss z, the outcome, the runners), from one
mulberry32 stream per outing. Daily seed: `hashSeed('shut-the-door-' + day)`.

Under rules 2 (below) steps 1 to 3 also read the outing's log: the grade prices the history, the miss
is also scaled by the arm (`fatigueOf`) and a repeat keeps less release (`spreadOf(q, repeat)`), and
the row is the pack's row adjusted for what the hitter has seen (`rowsCtx`). Same four draws.

## Rules 2: the hitter adjusts, the arm tires (2026-10-22)

The owner: "I've never given up a run yet. Can we up the difficulty?" CONTRACT.md 5b is the rule;
`grade.js R2` holds every setting. A new outing played rules 2 and its calls carried `r: 2` (since
2026-10-24 rules 3, which is rules 2 plus the third out, and `r: 3`); a call without `r` replays as
rules 1, exactly.

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

## The third out, and every in-play row a legal play (rules 3, 2026-10-24)

**What was wrong.** `pipeline/advance.py` follows runners by their ids to the next plate
appearance. A play that ends the half has none in that half, so it was written by a rule: the batter
out, then the runners nearest him, and no runs. On a two-out hit that kept the runner from first on
first while the batter behind him was put out further round (the 3D agent's find: Eckersley's
triple, state 17, moves `[[0,-1]]`), and it threw away runs that count: a two-out single, the runner
from second scores, the batter is thrown out at second, is a run (Official Baseball Rules 5.08(a)).
It also wrote a two-out force out as the batter out at first, with the forced runner kept on.

**The fix, at the source.** `pipeline/third_outs.py` reads every such play from Savant's play text
and score, 2015-2025 regular season (the advancement table's seasons): two-out hits and errors with
an out on the play, two-out fielder's choices, one-out double plays and none-out triple plays.
Each man on the play (named through the Stats API from the base ids) gets the last thing the text
says of him: scores, to a base, or out. A runner it never names stayed, or was forced up a base
when a safe man ends on his bag. A play is kept only when its outs end the half, its runs are the
official score's, and nobody passes anybody. 40,264 plays kept; 1,701 left out because they ended
the game (as `advance.py` leaves those out); 7 left out for a name or a count that did not tie up.
`advance.apply_third_outs` splits each modelled row into those plays, in place, by their counts:
the row's own share is kept (the table's share of half-ending plays matches the real plays' within a
tenth of a point in every state), and every other row keeps its place for the runner draw. One state
had no real play of its own (an error, two out, runner on third): it takes the real singles' plays
there, a labelled model (27 of 28 score the runner, then the batter is out). A batter out at two out
on a ball that is not a hit is the play as it was. The committed packs are patched the same way
(`python3 pipeline/advance.py --patch <pack> <staged>`, then `pool.js`), no library needed.

| row kind (each pack holds the same table) | before | after |
|---|---|---|
| a runner passed, or the batter out on a hit with a runner kept short of his base | 18 | 0 |
| a run lost on a third out, or a force out shown as the batter out | every modelled row | 0 |
| the stored bases after a third out not where the runners stand | 29 | 0 |
| all checks (`check-rules.mjs`), all ten packs | 470 of 8,160 rows | 0 of 8,550 |

**Rules 3.** The engine counts a run on a third out when the row has one (`grade.js THE THIRD OUT`):
it is the go-ahead run if it puts them ahead, and a held tie if it ties it. A new outing's calls carry
`r: 3`. A call with `r: 2`, or none, replays under its own rules, where a third out scores none: on
today's table that is the old hold table exactly (each split sums to the row it replaced; checked
state by state on all ten packs, no difference), so every stored outing replays to its score
(`check-replays.mjs` solves that table for it). The server's guard does not read `r`: no SQL.

**What moved** (rules 3 against rules 2 on the same packs). The hold table moves at most 1.5 points in
any state (two out, a runner in scoring position, a one-run lead). The closer pool holds 0.0 to 0.5
points less per pack (Eckersley 70.7 to 70.3, Rivera 66.7 to 66.2, Yamamoto 67.9 to 67.6); its
calls band 19/28/33/20, from 19/28/33/21, heart fastballs orange or red in 10 of 10 packs (lowest
66%), so `BANDS` did not change. The same calls in 3,000 random outings: 8 end differently, the
score is about 3 points lower (more of a pitch's value is now at stake), and the percentile against
each pack's own pool moves -0.03 on average. The median pool outing sits at the 47th to 52nd.

`check-rules.mjs` runs every row of every pack through the engine's own transition and holds it to
the rules: no runner passes another or shares a base, the batter on a hit of k bases touched base k,
nobody goes back, the outs, runs and bases add up, no run on a third out made by the batter before
first or by a force, every run shown scoring is counted, and the scoring fits the play. CI runs it.

## Rules 4: the call by location, ABS challenges, the bright band (2026-10-24)

CONTRACT.md 5f is the rule. These are the measurements. `pipeline/umpire.py` makes every number below
from the 2024 regular season chunks (Baseball Savant, 711,899 pitches, 2,429 games).

**The call.** Rules 3 called a take by the cell it crossed: the cell's real ball and called strike
split, wherever in the cell. Measured on every pack (random calls, 3,000 outings): cell 12 (the heart)
was never a ball, but a take 4-6 inches inside the edge was a ball 11.6% of the time (2024 umpires:
0.4%) and one 6 inches or more outside was a strike 9.4% (2024: 0.04%). A pitch at the middle of the
plate in a top or bottom cell is that case. Rules 4 calls it where it crossed (`contract.js UMPIRE`,
the 2024 called strike rate by signed half inch from the edge): 4-6 inches in 0.5% balls, 6 or more
in 0%, 6 or more out 0% strikes, the edge itself about 70% strikes. The grade splits each cell's takes
the same way one pitch ahead (`grade.js callMass`), so the draw and the grade stay one table.

**ABS.** The batter's challenge model, fitted on 2024's called strikes to MLB's 2025 spring test
(4.4% of called strikes) and Triple-A 2025 (batters won 45%): 4.4%, 44.6%. Played by the closer pool
on every pack (2,000 outings): the batter 0.11 challenges an outing, 4.0% of called strikes, won 53%;
the model catcher (the pool and the strategy runs) 0.14, 2.5% of called balls, won 39%.

**Errors** (the owner: "they shouldn't make errors on simple plays"). No change under rules 4 (rules 5
changed it: see below): the engine matches
the majors. Reached on error, 2024: 1 per 112 balls in play, 1 per 53 soft grounders (under 80 mph),
1 per 351 lazy flies and popups. The engine on every pack under rules 4: 1 per 106, 1 per 56, 1 per
374. A routine grounder is where real errors happen. The error rows are the real plays (`error` key,
the drawn pitch is a real reached-on-error), so the mapping is right.

**The bright band.** At q 0.85 or more the pitch lands within 3 inches of the aim point (1.2 inches a
side at 0.85, 0.6 at 1), in the zone when aimed in it. The strategy table (`strategies.cjs`, 300 runs
a pack, rules 3 then rules 4 with the model catcher's challenges), the mean over the packs of hold%
and the median outing's percentile:

| strategy, release | hold% | median percentile |
|---|---|---|
| smart, ordinary | 76.0 to 79.6 | 55.5 to 59.5 |
| smart, perfect | 78.8 to 82.5 | 61.3 to 70.1 |
| visible, ordinary | 61.6 to 66.3 | 30.5 to 30.2 |
| visible, perfect | 61.8 to 70.5 | 31.5 to 40.2 |
| average, perfect | 79.8 to 84.9 | 62.8 to 67.4 |
| best, perfect | 93.8 to 95.6 | 99.8 to 99.8 |
| the closer pool | 75.7 to 77.9 | 50.4 to 50.2 |

A perfect timer's edge over an ordinary one went from 6 to 11 percentile points (smart) and from 1 to
10 (visible). The pool was replayed under rules 4, so the median stays at the 50th. Its bands moved
under a point (19/27/33/21 to 20/27/33/19); `BANDS` is unchanged (`band_sweep.mjs --relative`: heart
fastballs mostly orange and red in 10 of 10 packs, lowest 63%). `pack.hold`, `pack.seq` and the pros
are unchanged (`pool.js` measures `seq` under rules 3, so a rules 3 outing replays exactly).

## Rules 5: the routine play (2026-10-25)

The owner: "I don't want them to be completely error-free, but it should be extremely rare on a
routine play." A GAME RULE (CONTRACT.md 5g, `contract.js ROUTINE`). A routine play is a grounder of
50-95 mph within 6 degrees of a fielder's spot, a fly ball at 30 degrees or more of 80-95 mph, or any
popup. A ball with no tracked speed (the 2010-2012 library) goes by its type and spray. A routine
error keeps 4% of its share on a grounder and 20% on a fly or popup. The rest is the cell's real out
of its kind. The library draw is read inside the error's slice, so no draw moves and no other key
changes. A new outing's calls carry `r: 5`; `r: 4` rows replay exactly
(`fixtures/replays-rules4-pre-routine.json`, three rows each with a routine error).

**2024 Savant** (`pipeline/umpire.py`, regular season): a routine grounder an error 1 per 44, a
routine fly or popup 1 per 364, the rest 1 per 129. At KEEP: 1 per 1,096 and 1 per 1,821.

**The engine** (the closer pool's calls, 8,000 outings a pack, all ten packs, rules 4 then rules 5):

| errors | rules 4 | rules 5 |
|---|---|---|
| all balls in play | 1 per 124 | 1 per 193 |
| routine grounders | 1 per 54 | 1 per 1,484 |
| routine flies and popups | 1 per 361 | 1 per 1,767 |
| not routine | 1 per 134 | 1 per 134 |

**Strategies** (`strategies.cjs`, 300 runs a pack, mean over packs, rules 4 then 5): smart ordinary
hold 79.7 to 80.0, median percentile 61 to 61; smart perfect 82.5 to 82.7, 69 to 69; visible ordinary
66.3 to 66.8, 30 to 29; visible perfect 70.5 to 70.9, 37 to 37; best perfect 95.6 to 95.8, 100; the
pool 77.9 to 78.0, 51 to 51. `BANDS` unchanged; the pool's bands 19.8/26.9/33.6/19.7 to
19.9/26.8/33.6/19.6 (band_sweep: 20/27/33/19 both). Packs rebuilt with `pool.js`: `hold`, `seq` and
`pros` byte-identical, pack v10, `SCHEDULE_V` 10.

## Rules 6: the runners read the ball (2026-10-26)

The owner: "We need to ensure runners are advancing in realistic situations, and tagging up in
realistic situations." CONTRACT.md 5h. The advancement row is drawn from the table's rows, each
weighted by how real runners went on a ball of that carry band and side (`pack.runners`, from
`pipeline/runners.py`: every 2024 ball in play with a runner on, Savant's play text read runner by
runner). Same draw, same legal rows. A new outing's calls carry `r: 6`; `r: 5` rows replay exactly
(`fixtures/replays-rules5-pre-runners.json`). `pool.js` copies `data/runners.json` into each pack.

```
python3 shut-the-door/pipeline/runners.py [--season 2024] [--from DIR]   writes data/runners.json
```

**Carry** (`contract.js carryOf`): Statcast distance from exit velocity and launch angle, R2 0.94,
15.6 ft mean error on 65,405 air balls.

**2024 against the engine** (closer pool calls, 1,500 outings a pack, all ten packs; hold / score /
thrown out, or as labelled):

| play | real 2024 | rules 5 | rules 6 |
|---|---|---|---|
| fly out, runner on 3rd, under 2 outs, carry 200-250 ft | 79 / 13 / 7 | 28 / 67 / 5 | 68 / 25 / 7 |
| the same, 250-280 ft | 38 / 52 / 10 | 22 / 76 / 2 | 31 / 58 / 11 |
| the same, 300 ft and up | 0 / 99 / 1 | 22 / 76 / 2 | 2 / 97 / 1 |
| fly out, runner on 2nd tags to 3rd, 300 ft and up | 53 | 34 | 56 |
| the same, 200-250 ft | 3 | 44 | 2 |
| line out, runner on 1st doubled off, under 200 ft | 29 | 10 | 20 |
| the same, 300 ft and up | 2 | 12 | 2 |
| single, runner on 1st to 3rd, ball to left / right | 10 / 40 | 26 / 27 | 13 / 36 |

The marginals stay real (fly out with a runner on 3rd, all depths: 23 / 73 / 4 real, 17 / 79 / 4
rules 6). Scoring from 2nd on a single by outs (0-1, 2) and from 1st on a double were already the
table's real rates and stay so. The closer pool's hold rate moves 0 to 0.9 points; the grade, the
hold table, `seq` and BANDS are unchanged. The 2011 and 1988 packs move least: their balls carry no
tracked speed, so most have no class.

**Arm strength** (2024 Savant outfield arm, report only, no fielder is in the pack): on a 240-300 ft
fly with a runner on 3rd, the strongest third of arms (92 mph) hold him 41% against 19-20% for the
rest; on a single with a runner on 2nd the arm barely moves the send (70 / 68 / 72 scored).

## Rules 7: the running game (2026-10-26)

The owner: "Runners could also steal ... They may win or lose that moment", then "yes add pickoffs
and slide step". CONTRACT.md 5i. `pipeline/steals.py` reads every 2022 and 2024 regular season game
feed from the Stats API, pitch by pitch (a compact line a pitch, `cache/steals-<season>.json.gz`).
It adds the people's season stats, Savant's sprint speed and pop time, and each spot's real catcher
and runners, and writes `data/steals.json`. `pool.js` copies a spot's part in as `pack.steal`.

```
python3 shut-the-door/pipeline/steals.py [--seasons 2022,2024] [--threads 6]
```

**Real** (the feeds; 2024, then 2022): steal of second 81.7% safe of 3,554 (78.1% of 2,602), third
86.2% of 530 (81.8% of 351). League 2024: 3,617 SB, 961 CS, 79.0%. Late (8th inning on), a steal of
second per pitch with one on: down 1 2.53%, down 2 0.81%, down 3 0.25%, tied 3.98% (early 2.39%),
safe 85-89%. Pickoff, out per throw: first 1.6% of 9,219 throws, second 4.2% of 684, third 9.7% of 93
(2022: 0.7%, 5.6%, 13.3%). After one throw at him the runner is safe less often (-0.14 z, about 3
points), after two no less (-0.02). He also goes 1.8 times as often after a throw, measured against
the same runner. That is the pitcher reading the runner, so the engine does not use it.

**The quick delivery**: a second of pop time is worth 1.95 z of steal success (330 catcher seasons
2016-2025), so 0.25 s quicker is -0.49 z (79% to about 63% for an average steal). Cross-check: the
best fifth of 2024 pitchers at holding runners allowed 71.3% (-0.24 z).

**The engine** (closer pool calls, 1,500 outings a pack, all ten packs): 1.0% of pitches with a steal
on see an attempt, safe 80.5%; with a quick delivery on every pitch, 65.7%. 5.9% of outings have a
steal, and 74 caught stealings ended an outing. By pack, from 0.24% (Pressly 2022)
to 2.67% (Diaz 2025). The closer pool's hold rate moves -1.0 to +0.2 points; the grade, the
hold table and BANDS are unchanged.

## Rules 8: the closer's outing to the end of the game (2026-10-30)

The owner: "I don't want a daily scenario to ever only let a user play one out." CONTRACT.md 5j. A
spot is the closer's real outing from the spot to the end of the game: every half he pitched, to the
final out, or to the last out of regulation when extras followed. It asks for at least three outs
(`test/packs.mjs`). Between two of his halves his team bats its real half, from the play by play.

```
python3 shut-the-door/pipeline/halves.py <verify id> ...             halves, between, line into the verify file
python3 shut-the-door/pipeline/build_packs.py <scenario id>          stages the pack with the later halves' batters
node shut-the-door/pipeline/add_halves.cjs <pack> <staged> <pack>    adds them to the committed pack, nothing else moves
python3 shut-the-door/pipeline/steals.py --halves <scenario id>      their runners, and each later half's catcher
node shut-the-door/pool.js <pack> data/closers.json <pack>           the table over every half, both centres, the pool
node shut-the-door/pipeline/halves_meta.cjs <pack> ...               a one-half pack's format 4 (nothing else moves)
```

**The record** (`halves.py`, MLB's live feed): his halves are his team's defensive halves from the
spot, each one he pitched in, through regulation. A later half's lineup is by batting slot from the
spot's first batter's slot: whoever batted in that slot in that real half, else whoever held it when
the half began (the feed's substitutions in order). His team's half is every plate appearance with
the feed's event and description, the scorer's short form (from the event, the batted ball's
trajectory and the fielders the feed credits), runs, outs, the runners after it, hits and errors.
The plays' runs must equal the line score's for the half, and the hits and errors counted over the
whole game must equal the feed's totals, or H and E are null.

**The model** (`grade.js THE HALVES`): a state carries its half; three outs before the last half go
to the next half's first state with his team's real runs on the margin. The value is the goal's
chance at the outing's end, so a state is solved for a goal (`solve(st, g)`), and a state below the
goal is 0 only when his team's runs to come cannot lift it. The table covers every half
(`hold.halves`) and the other goal where one is asked (`hold.alt`, only when his team scored
between). The first half is the one-half model exactly: a rules 7 outing plays there
(`Model.singleModel`, its table solved on load, a few seconds; `pack.seq.L` as before). Rules 8
reads `pack.seq.full`, the pool's sequencing over whole outings: hitters who have seen him for two
innings are more familiar, and the adjustment is centred on what real closers face then.

**Chapman 2016 (today's daily when it shipped).** In with two out and a man on in the bottom of the
8th, 6-3. Rules 7 asked one out; rules 8 asks four: the 8th, the Cubs' real top of the 9th (Ross
walked, Heyward forced Coghlan 4-6 and stole second, Báez struck out on a foul bunt as Heyward took
third on Gomes's throwing error, Fowler 6-3: no runs), then the bottom of the 9th, Michael Martinez
in Crisp's slot and Miguel Montero catching. Real: 35 pitches, 3 runs, held the tie.

| Chapman 2016 | rules 7 | rules 8 |
|---|---|---|
| start hold% (best play) | 99.77 | 99.17 |
| pool door shut / held tie / door's open / walk-off | 1964 / 27 / 9 / 0 | 1831 / 87 / 5 / 77 |
| pool pitches an outing | 6.0 | 23.4 |
| pool calls green / yellow / orange / red | 25 / 30 / 28 / 16% | 22 / 27 / 33 / 18% |
| pool score median, share at 300 or less | 993, 1.3% | 916, 12.1% |
| pack | 0.75 MB | 0.97 MB |

The best-call outing is all green and the median pool outing lands at the 50th (`test/packs.mjs`).
**The score floor.** `700 - 20 x points lost` reaches 0 at 35 points, and two halves lose about four
times as many points as one out, so 12% of the pool's outings score only their result bonus. That is
not changed here: the formula is the lead's (engine.js THE OUTING SCORE).

## Release and spin, for the picture (2026-10-24)

`pipeline/tracking.py arsenal` reads each scenario pitcher's own pitches from the Savant search his
arsenal came from (the same URL as `effort.py arsenal`) and writes `data/tracking_arsenal.json`;
`tracking.py packs` puts it into the committed packs, then `pool.js` rebuilds them. Per arsenal
pitch: `release {x, z, ext}` (release_pos_x, release_pos_z, release_extension, feet, catcher's view),
`armAngle` (arm_angle), `spin {rate, axis, active}` (release_spin_rate; spin_axis as a circular mean;
active spin from Savant's active spin leaderboard for that season). On the pitcher: `release` and
`armAngle` over all his arsenal pitches, and `tracking` (the system, season, games and count).
`3d/pitch.js releaseOf` reads `pitcher.release`. CONTRACT.md 4 has the shape.

What Savant has, and so what is null: PITCHf/x seasons (Feliz 2011) carry release x and z only;
spin axis and rate from 2015 (Chapman 2016 and on); arm angle from 2020 (Pressly 2022 and on, not
Hader 2019 or Chapman 2016); active spin from 2016, observed before 2020 and spin-based after, and
for the regular season only, so Buehler 2024 and Yamamoto 2025 (postseason arsenals) carry their
regular season's. A proxy spot (Eckersley 1988, Rivera 2001) is null throughout: Rivera's 2008
arsenal stands in for his stuff, not his 2001 hand. Savant's leaderboards file a knuckle curve under
curve, so a KC takes that column only when he throws no CU.

Nothing the engine reads moves: every pack rebuilt with `pool.js` is byte for byte the pack on main
once the new fields are taken out (hold, pool, `seq`, pros and build report), `band_sweep --relative`
and `strategies.cjs` print the same output, and `test/packs.mjs` holds every tracked pitcher's
fields in range (his hand's side, spin 1,000 to 3,500 rpm, axis 0 to 360).

**Hader 2019's sinker.** Savant types it SI: 960 of his 1,189 regular season pitches in the search,
the same in 2018, the 2019 pitch arsenal leaderboard (a sinker speed, no four-seam), and the sinker
column of the active spin leaderboard in 2019 and every season 2020 to 2025. So it stays SI. Its 16.9
in of ride and 96.8% active spin at a 150 degree axis are real: a low slot lefty's backspin sinker.

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
