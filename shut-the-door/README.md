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
   `sigmaFt / kernelZoneFt` in normalised height. The grade's miss table (`kernelFor`) is the same
   normal, integrated over each cell, so what is graded is what is played.
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

States are (batter index, balls, strikes, outs, bases, margin) with margin = us minus them. Three
outs with the lead hold (1). A margin of 0 or less is lost (0): door's open and walk-off both lose
the hold. Hold% of a state is the best call's, by a recursion that ends because the count only
moves forward within a plate appearance (a two-strike foul is a self-loop, solved in closed form)
and between plate appearances outs, runs or runners only climb (the advancement table keeps
runners: after + runs + outs = before + 1). `pool.js` solves every state and stores the table
dense in the pack (`hold.h`, `hold.r` expected runs, `hold.b` the best call); the browser grades
from it.

A call's value is the mix over the miss table of each outcome's next state. `lost = best - value`
in points of hold%. The band is `contract.js bandOf(lost)`. `reDelta` is the call's expected runs
minus the best call's.

**The reason line** is one fact with its number from the pack: green, a note about that pitch and
place if one fits, else what the best call holds; otherwise a note about the best call, his damage
in the called cell (xwOBA on contact), the count (three balls, two strikes), or the two hold%s.
Notes come from the batter's own data: chase rates in a region with two strikes (only when above
the league's), whiff rates by pitch, xwOBA on contact by part of the zone.

## The outing score and percentile

```
score = max(0, 700 - 20 * total pts lost) + {door_shut: 300, doors_open: 100, walk_off: 0}
```

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

`supabase/152_shut_the_door.sql`: `shutdoor_outings` (user, day: the calls, outcome, pitches,
score, percentile, pitched like, strip), `shutdoor_streaks`, and three functions, all security
definer: `shutdoor_submit` (Eastern day within one, the first submit stands, streak of doors shut on
consecutive days, a blown save or a missed day resets it, returns `{taken, streak, best, rank,
players}`), `shutdoor_board(day, limit)` and `shutdoor_my_stats()`. Its test is
`supabase/test/shut_the_door_test.sql`. The page needs supabase-js loaded with `defer` (as
`baseball/index.html` loads it) for `auth.js` to come alive; without it the game plays as a guest.
