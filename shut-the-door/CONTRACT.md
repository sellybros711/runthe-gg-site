# Shut The Door: the shared contract

Status: approved with the owner's changes (2026-10-17): unlisted not gated, pitcher's view, 2008+ real. Owned by the lead. Agent A (engine, data, backend)
and Agent B (UI) both build against this file and change it only through the lead. Anything B
needs that is missing goes in `CONTRACT_REQUESTS.md`; the lead answers there and edits this file.

The stack has no TypeScript and no build step, so the types are JSDoc. On approval the lead turns
the type blocks below into `contract.js` (typedefs plus the frozen constants), and both agents
import the constants from there rather than retyping a number.

## 0. Where it lives and how it is served

A public, unlisted page at `runthe.gg/shut-the-door`, like Run The Floor before its launch: anyone
with the link can play, and nothing on the site points to it. Until the owner puts it live it is in
no nav, no home page card, no sitemap, no newsletter list, and it is `noindex`. A posture check holds
that (baseball's `check-posture.mjs` pattern, with INDEXED and LINKED both false).

```
shut-the-door/              the game, a top-level folder like baseball/ and hoops/
  index.html                one page, sibling scripts each with ?v=N (check-cachebust)
  engine.js ...             plain scripts: window.STD_* in the browser, module.exports in node
  data/packs/<n>.json?v=N   one pack per scenario
  data/schedule.json?v=N    day to pack
  pipeline/                 Python, never loaded by the page
```

No bundler and no build step, as for every top-level game.

## 1. Words and units

| term | meaning |
|---|---|
| us | the closer's team. The player always pitches for us |
| them | the batting team |
| day | the Eastern calendar day, `YYYY-MM-DD` (`America/New_York`), like every daily on the site |
| daily number | `floor((day - EPOCH) / 1 day) + 1`, EPOCH = the first day it is playable |
| hold | the outing ends with 3 outs and our lead intact |
| hold% | the probability of a hold from a state, under best play from here on. The grading unit. After a tie, the same number for the tie's goal: 3 outs before they go ahead (section 7) |
| pts | percentage points of hold%. `0.5 pts` = half a point of hold chance |

## 2. The grid (one geometry for throwing and for the scouting heat map)

5x5 cells, index `0..24`, row-major, **catcher's view** (the same view as Statcast `plate_x`):
row 0 is high, row 4 is low; col 0 is the catcher's left (the third base side, where a right-handed
batter stands), col 4 the catcher's right.

```
 0  1  2  3  4       rows 1-3 x cols 1-3 = the 9 strike-zone cells
 5  6  7  8  9       the other 16 = chase cells
10 11 12 13 14
15 16 17 18 19       cell(row, col) = row * 5 + col
20 21 22 23 24       inZone(cell) = row in 1..3 and col in 1..3
```

Geometry, in Statcast units:

- Horizontal, feet from the middle of the plate: the zone is `|x| <= 0.83` (half the plate plus a
  ball's radius). Each zone column is `0.553 ft` wide. Each chase column is one more column-width
  outside the zone; anything wider than that still lands in the chase column.
- Vertical, normalised to the batter: `zn = (plate_z - szBot) / (szTop - szBot)`. The zone is
  `0 <= zn <= 1`, each zone row is a third, each chase row is one more third outside, and anything
  beyond still lands in the chase row.
- A cell's **target point** is its centre (for a chase cell, the centre of its one-width band).

**The camera is the pitcher's view** (the owner's call). The pitcher looks in at the plate, so his
left is the catcher's right. The UI draws the grid mirrored left to right: cell 4 is drawn on the
pitcher's left, cell 0 on his right. The data, the engine and every cell index stay in catcher's
view. The throw grid and the heat map are one component, so they mirror together. Copy says
"inside" and "away" (relative to the batter), never "left" and "right".

```js
/** @typedef {number} Cell            0..24, as above */
/** @typedef {'L'|'R'} Hand */
/** @typedef {{x: number, zn: number}} PlatePoint   x in feet (catcher's view), zn normalised */
```

## 3. Pitch types

Statcast codes. The shape tells the UI how to draw the flight.

```js
/** @typedef {'FF'|'SI'|'FC'|'SL'|'ST'|'SV'|'CU'|'KC'|'CH'|'FS'|'FO'|'KN'} PitchType */
/** @typedef {'ride'|'run'|'cut'|'sweep'|'slide'|'drop'|'fade'|'split'|'float'} Shape */
// FF ride, SI run, FC cut, ST/SV sweep, SL slide, CU/KC drop, CH fade, FS/FO split, KN float
```

## 4. Scenario and arsenal

```js
/**
 * @typedef {Object} ArsenalPitch
 * @property {PitchType} type
 * @property {string} name          'four-seam', 'slider', ...
 * @property {number} usage         share of the pitcher's pitches that season, 0..1, sums to 1
 * @property {number} velo          average mph that season
 * @property {number} pfxX          average horizontal break, inches, catcher's view
 * @property {number} pfxZ          average induced vertical break, inches
 * @property {Shape}  shape
 * @property {number} command       20..80 scouting scale; drives the miss size
 * @property {number} sigmaFt       miss size in feet (one standard deviation, each axis), from command
 * @property {{src: 'his'|'league', n: number, velo: number[], pfxX: number[], pfxZ: number[]}} [stuff]
 *                                  his own pitches of this type in each fifth of his velocity,
 *                                  slowest first: mean mph and break (section 5c, effort)
 * @property {Release|null} release   the mean release point of his pitches of this type
 * @property {number|null} armAngle  Savant's arm_angle, degrees, mean (Savant has it from 2020)
 * @property {Spin|null} spin
 */

/**
 * Release and spin are for the picture only (pipeline/tracking.py): the engine, the grade and the
 * pool read none of them. Each is the mean over his real pitches in the Savant search his arsenal
 * came from. A value Savant does not have is null; a proxy spot is null throughout.
 * @typedef {Object} Release         feet, catcher's view (x < 0 is the third base side)
 * @property {number} x              release_pos_x
 * @property {number} z              release_pos_z
 * @property {number|null} ext       release_extension (null in PITCHf/x seasons, before 2015)
 *
 * @typedef {Object} Spin            null before Statcast (2015)
 * @property {number} rate           release_spin_rate, rpm (integer)
 * @property {number} axis           spin_axis, degrees 0..360 (a circular mean), Savant's convention
 * @property {number|null} active    active spin, percent 0..100, from Savant's active spin
 *                                   leaderboard for that season (regular season; observed before
 *                                   2020, spin-based from 2020); null where it has none
 *
 * @typedef {Object} Tracking        null for a proxy spot
 * @property {'statcast'|'pitchfx'} system
 * @property {number} season         the season of the pitches (his year for a real spot)
 * @property {'regular'|'postseason'} games
 * @property {number} n              his tracked pitches of his arsenal's types
 * @property {string|null} active    where active spin came from, or null
 */

/**
 * @typedef {Object} BatterProfile
 * @property {number} chase                 swing rate at chase cells, 0..1
 * @property {number} zoneSwing             swing rate at zone cells, 0..1
 * @property {Object<PitchType, number>} whiff   whiffs per swing by pitch type (types he saw)
 * @property {number[]} heat                25 numbers, one per Cell: damage per swing
 *                                          (xwOBA on contact), the same grid as the throw
 * @property {number[]} swing               25 numbers, swing rate per Cell
 * @property {string[]} notes               short facts the grade reason can quote
 */

/**
 * @typedef {Object} Batter
 * @property {string} id            MLBAM id (proxy-era: Retrosheet id prefixed 'retro:')
 * @property {string} name
 * @property {Hand} bats            for a switch hitter, the side he hits from against this pitcher
 * @property {string} line          season line, 'AVG/OBP/SLG, HR' e.g. '.287/.371/.515, 31 HR'
 * @property {number} szTop         feet, his average top of zone
 * @property {number} szBot         feet
 * @property {BatterProfile} profile
 * @property {'batter'|'similar'|'league'} profileTier   where the profile came from
 */

/**
 * @typedef {Object} Situation
 * @property {number} inning
 * @property {'top'|'bottom'} half
 * @property {number} outs          0..2
 * @property {number} bases         bitmask: 1 = first, 2 = second, 4 = third
 * @property {{us: number, them: number}} score   us leads when the outing starts
 * @property {boolean} usHome
 * @property {boolean} walkOffLive  true when them is the home team in the 9th or later:
 *                                  a go-ahead run for them ends the game
 */

/**
 * @typedef {Object} Reveal          withheld from the browser until the outing is finished
 * @property {'door_shut'|'tie_held'|'doors_open'|'walk_off'} outcome   under the end rules (section 8)
 * @property {number|null} pitches  what the real pitcher threw in this spot; null when the record
 *                                  is incomplete (then pitchesNote says what is known)
 * @property {string} [pitchesNote]  'at least 13 pitches' when pitches is null
 * @property {number} runs          runs he allowed in the spot
 * @property {string} summary       one line: 'struck out 2, walked Davis, then Gibson homered'
 * @property {{batter: string, result: string, pitches: number}[]} plateAppearances
 */

/**
 * @typedef {Object} Scenario
 * @property {string} id            'std-1988-ws1-eckersley'
 * @property {string} day           the day it is the daily
 * @property {number} number        daily number
 * @property {string} title         'Game 1, 1988 World Series'
 * @property {string} setup         one paragraph, house voice
 * @property {{name: string, team: string, teamColors: [string, string], year: number,
 *             throws: Hand, arsenal: ArsenalPitch[], release: Release|null,
 *             armAngle: number|null, tracking: Tracking|null}} pitcher
 *                                  release and armAngle: over all his arsenal pitches
 * @property {Situation} situation
 * @property {Batter[]} batters     the real order he faced, then the lineup continuing,
 *                                  at least 9 entries; the engine wraps if it runs out
 * @property {number} realFaced     how many of `batters` the real pitcher faced
 * @property {'real'|'proxy'} resolution   proxy = no pitch tracking for that game;
 *                                  pitches drawn from modern pitches of a similar profile
 * @property {string[]} sources     where each fact came from
 * @property {Reveal} [reveal]      present only server side and after finishOuting
 */
```

## 5. Player input

```js
/**
 * @typedef {Object} PitchCall        a type, an aim, then the meter's two stops, nothing else
 * @property {PitchType} type         must be in the pitcher's arsenal
 * @property {Cell} cell
 * @property {number} [q]             the release, 0..1, kept to two places. Absent = 1.0x
 * @property {number} [e]             the effort, 0..1, kept to two places (section 5c). Only with q,
 *                                    only under rules 2. Absent = his ordinary pitch (e 0.5)
 * @property {[number, number]} [at] the free aim point inside the cell (section 5d): [u, v], each
 *                                    -0.5..0.5, catcher's view, u to the catcher's right, v up.
 *                                    Rules 2 only. Absent = the cell's centre ([0, 0])
 * @property {number} [r]             the rules it was played under, set by the engine on the kept
 *                                    call: 2 since 2026-10-22, 3 since 2026-10-24 (section 5e).
 *                                    Absent = rules 1 (section 5b)
 */
```

### The release (the owner's call, 2026-10-22)

After the type and the cell, the throw button starts the release meter (`meter.js`): a needle
sweeps a bar, and the tap that stops it is the release. How close the tap is to the mark is `q`.

- **What q does.** It scales the pitch's miss, `sigmaFt`, by `spreadOf(q)` (`contract.js RELEASE`):
  `q = 1` is 0.6x, `q = 0.5` is exactly 1.0x, `q = 0` is 1.5x, linear on each side. A call without
  `q` is 1.0x. The four draws per pitch are the same draws in the same order whatever `q` is; only
  the spread the two miss draws are multiplied by changes. So a stored outing from before the meter
  replays unchanged, and an outing with `q` replays exactly from its calls.
- **The meter.** `q = 1 - |error| / window`, at least 0. The window is 110 ms at command 50 and
  grows with the pitch's command (89 ms at 35, 151 ms at 80), so control pitchers are easier to
  time. The bar shows the band where `q >= 0.5` (tighter than his command) and the band where
  `q >= 0.85` (the bright band, the owner's call 2026-10-23: it was 0.8, now 0.85, so an ordinary tap
  lands in it about 1 time in 5; `meter.js BEST_Q`). The needle runs back and forth until the tap, so nobody is rushed. Escape, or picking
  another pitch or spot, puts it away. One quiet word after the tap (`sharp`, `a bit late`): that is
  execution, never a grade. Practice adds the spread (`miss 0.72x`) so a player can learn it.
- **Off.** A setting turns the meter off (on by default): the call carries no `q`, which is 1.0x,
  his own command. Off is the average release, not a penalty.
- **The grade never sees q.** Every call is still graded before it resolves, on the miss table at
  1.0x: the decision at his own command. A perfect release on a bad call is still a bad call.
- **The score has no execution term.** The score stays `700 - 20 x pts lost` plus the result bonus
  (section 8). The release reaches it only through what happens (a tighter miss changes outcomes,
  and the result bonus follows), the same way luck does. Why no term of its own: the closer pool
  that sets the percentile has no release to score (each closer is played at 1.0x, his real
  command, which already holds his real execution), so a release term would be points the pool can
  never earn, and every timed outing would drift up the percentile for no decision. Through the
  outcome, a player who times well does genuinely better, and the skill shows where it is real.
- **Keeping the pool honest.** The pool stays at 1.0x and is not rebuilt. The meter is tuned so an
  ordinary tap (about 60 ms off, one tap in ten a real slip) averages 1.0x at command 50, so the
  average player meets the pool on level ground, and turning the meter off is exactly level. A
  typical execution spread was considered for the pool and left out: it would not move the pool's
  mean spread (tuned to 1.0x), it would add a guess (our model of a phone tap) to real closers'
  numbers, and it would rebuild every pack for no change a player could see. Across the packs'
  commands (35-72) the model's mean spread runs 1.06x to 0.93x: timing a control pitcher is a
  little easier, as the owner asked. `check-replays.mjs` prints the real players' mean spread from
  stored calls; if it drifts off 1.0, `WINDOW_AT_50` in `meter.js` is retuned, never the pool.
- **How much it is worth** (measured 2026-10-22: the pool's own calls replayed on all ten packs,
  15 outings per closer each): every release perfect lifts the mean percentile about 3 points, every
  release at its worst costs about 6, and the model's ordinary tap lands within about a point of the
  meter off. Execution matters, and the call still matters more.

## 5b. Rules 2: the hitter adjusts, the arm tires (the owner's call, 2026-10-22)

The owner found the game too easy ("I've never given up a run yet") and chose four changes. A new
outing plays rules 2 (`grade.js RULES`), and the engine writes `r: 2` on every kept call (since
2026-10-24 rules 3 and `r: 3`, section 5e: rules 2 plus the third out). A call
without `r` is rules 1: every row stored before, and every saved outing begun before, replays and
finishes exactly as it was played. One outing never mixes the two (a call with the other `r` is
refused). Nothing new is drawn: the four draws per pitch stay the same draws in the same order, and
every effect is a function of the outing's own log.

1. **The hitter adjusts.** Each pitch's outcome row (the pack's per mille row for the cell it
   crossed) is scaled key by key and renormalised, by how familiar the batter is with it: how many
   pitches of that type he has seen this plate appearance, whether one crossed within one cell of
   this one, and (weaker) how many of that type went to earlier batters in the outing. A fresh look
   is the pitcher's best chance; a third look at the same pitch in the same spot is missed less and
   hit harder. And where the pitcher has aimed: once the outing's aims lean on the zone, a zone pitch
   is hit more and taken for a strike less, and a chase pitch is chased more (nibbling, the
   reverse). Both are centred on the closer pool's real sequencing in that pack (`pack.seq`), so a
   pitcher who mixes like the real closers meets the library's own numbers.
2. **A repeat keeps less of the release.** `spreadOf(q, repeat)`: on the second pitch of a type in a
   row, a good release keeps half its tightening (0.8x at best), on the third a quarter (0.9x). A bad
   release and the meter off are unchanged. A game rule on the meter.
3. **Coarser scouting.** The heat map and the scout card read `grade.js scoutView(profile)`: the 16
   chase cells as Statcast's four out-of-zone quadrants, every value in steps (damage .050, swing
   rate 10 points, chase, zone swing and whiffs 5 points). The engine and the grade read the profile
   as it is.
4. **The arm.** His miss is scaled by `fatigueOf(pitch number, bases)`: tighter than his average
   early, wider past 12 pitches (2% a pitch, up to 1.4x), centred on 2024 relievers' real pitch
   counts, and about 1% wider with runners on (measured). It rides on the result as `arm`.

**The grade stays the decision.** Every call is graded before it resolves, with what the hitter has
seen and the arm as it is: the call's adjusted outcome mix through the miss table at the arm's
spread, then the hold table's values for the state that follows. The best call and the state's mean
lost are taken over every legal call priced the same way, so the band is still relative to the
moment. The hold table is solved without history (no table holds every sequence), so the grade looks
one pitch ahead with the history and leans on the table after it. The release is still never read.

**What is measured and what is a model.** `pipeline/effects.py` read every 2024 regular season pitch
(`pipeline/effects.json`). Against the same pitch family, cell, exact count and platoon, repeats
within a plate appearance do within about 5% of the rest, and a reliever's spread is flat with his
pitch count. Both are small because the data is chosen by the pitchers (a pitch is repeated when it
works, a tired arm is taken out), so they cannot say what happens to a pitcher who repeats himself
or stays in. The shares of each kind of repeat, relievers' pitch counts and the runners-on spread
are used as measured. The strengths of the adjustment, the zone effect and fatigue past 12 pitches
are a labelled model, tuned so a strong player who reads the screen and mixes his pitches holds
about what the closer pool holds (README).

## 5c. Effort: the meter's first stop (the owner's calls, 2026-10-22 and 2026-10-23)

A pitch is now a pitch type, an aim (a cell and a point in it, section 5d), then two stops on the
meter: **effort** (`e`), then **accuracy** (`q`, the release above). The effort stop says how hard
he throws it: `e = 0` his softest, `0.5` his ordinary pitch, `1` his hardest. A call carries `e`
beside `q`, kept to two places (`contract.js effortE`). An `e` rides only with a `q` (the meter off
has neither) and only under rules 2. A call without `e` is his ordinary pitch (`e` 0.5), so every
rules 1 and rules 2 outing stored before replays exactly. Rules stay 2.

Each part is marked **data**, **game choice (not data)**, **game rule** or **model**.

1. **The speed shown (data).** `e` walks five slices of his own speed for that pitch type: his
   slowest 5%, the second fifth, the middle fifth, the fourth fifth and his fastest 5%, straight
   between. The speed and break shown are the mean of his own real pitches in that slice, from the
   Savant search his arsenal came from (`arsenal[i].stuff`, `pipeline/effort.py`,
   `contract.js stuffAt`). Chapman 2016's four-seam reads 97.4 at `e = 0`, 101.1 at 0.5, 104.4 at 1.
   A pitch type with fewer than 40 of his own tracked pitches, or a pitcher with none (Eckersley
   1988), shows his average plus the league's typical spread (`src: 'league'`).
2. **What the pitch does (data, then a game choice).** Measured on every 2024 regular season pitch
   (643,123) for each slice: key by key, observed over what the same family does in the same cell,
   exact count and platoon (`grade.js EFFORT.BINS`). His fastest 5% of fastballs: whiffs x1.13,
   home runs x0.75, hits x0.92. A harder breaking ball is called a strike less (x0.81) and breaks
   less. A harder changeup or splitter whiffs less (x0.86). **Game choice, not data:** above the
   middle, each ratio's distance from 1 is multiplied by `EFFORT.GAME` (8), floored at 0.2, so a
   max effort fastball whiffs about 2x and gives up a fifth of the home runs. A max effort breaking
   ball or changeup is punished the same way, in the data's direction. Below the middle the ratios
   are used as measured (`GAME_DOWN` 1).
3. **The miss (data, then a game choice).** His fastest slice misses wider than his middle one:
   fastballs 3%, breaking balls 11%, offspeed 6% (`EFFORT.SPREAD`). **Game choice:** that is
   doubled (`SPREAD_GAME` 2), and applies above the middle only.
4. **The window (a game rule).** The accuracy window is x1.25 at `e = 0`, x1 at 0.5 and x0.6 at 1,
   straight between (`meter.js windowScale`). Both bands shrink with it.
5. **The arm (a model, tuned).** A pitch counts `1 + 1 x (2e - 1)` pitches on the arm above the
   middle (2 at max) and `1 - 0.5 x (1 - 2e)` below (0.5 at the softest) for every later pitch
   (`grade.js loadOf`, `fatigueOf`). The extra over 1 builds a **strain** that easier pitches pay
   back: the arm's miss is x `(1 + 0.05 x strain)`. Max every pitch for ten pitches is about 1.5x the
   miss. Real relievers' speed is flat across an outing (tired arms are taken out), so this is tuned
   with `pipeline/strategies.cjs`, not measured.

The game choices were set so that max effort is a weapon and never a dial to leave at max. Measured
(README): a good timer who saves max effort for the put-away holds about 4 points more than one who
never changes it, and max on every pitch is worse than both.

**The grade never reads this pitch's `e`.** Like `q`, it is how he throws the call, not the call:
pricing it would mean assuming how well the player times the smaller window and looking past one
pitch for the arm. The grade prices the call at his ordinary stuff and his own command. The arm that
earlier efforts left is part of the history the grade prices, as fatigue always was. The score has
no effort term; effort reaches it through what happens, as the release does.

**Determinism.** Still four draws a pitch in the same order. `e` changes the weights of the row the
library draw reads, the miss above the middle and the arm on later pitches, never which draws are
taken.

**What the UI reads** (`meter.js`, `window.STD_METER`): `EFFORT === true` once effort exists;
`windowOf(e, command)`, the bright band (q of `BEST_Q` and up) as `[lo, hi]` fractions of the bar
(command 50 when left out); `veloOf(pitch, e)`, the mph to show. Under them: `windowScale(e)`, `windowMs(command, e)`, `qOf(err, command, e)`
and `bandsFor(command, e)` for the accuracy bar at that effort; `veloFor(arsenalPitch, e)` and
`stuffFor(arsenalPitch, e)` for the speed and break to show; `effortAt(t)` if the effort needle
sweeps (`EFFORT_SWEEP_MS`); `run({command, effort, ...})` draws the accuracy bar at that effort. A
`PitchResult` with `e` carries `stuff: {velo, pfxX, pfxZ, src, spread}`, and its `velo` is that
speed.

**The speed reveal (the owner, 2026-10-23).** The speed is shown after the throw, never before. Before
the release's last tap the UI shows no mph: not on the pitch buttons, the arsenal list or the scout
card's speed, and not in the meter's head. The only speed the UI reveals is the `PitchResult` of the
call it threw: `velo` (always, with or without `e`) and `stuff` (with `e`). `veloOf` and `veloFor` are
the same numbers as `PitchResult.velo` for that `e` (tested), kept for the tests and the lab, and are
not needed before the throw. The arsenal's `velo` in the pack is his average and stays in the pack:
the UI must not show it before the throw.

`STD_METER.POWER` is the player's name for `EFFORT` (the same flag, `true` in the build). The copy
says power. The stored field and every call still say `e`.

## 5d. The free aim point (the owner's calls, 2026-10-22 and 2026-10-23)

The player can aim anywhere in the zone, not only at a cell's centre. A call carries `at: [u, v]`,
the aim's place inside its cell as fractions of the cell's width and height, each -0.5..0.5,
catcher's view: `u` toward the catcher's right (+x), `v` up (+zn). `[0, 0]` is the centre, and a
call without `at` aims there, so every stored outing replays exactly. `contract.js aimAt` clamps it
to the cell and keeps two places; `aimPoint(cell, at)` is the point the engine aims at, and the miss
is added to it as before (the same two draws). Rules 2 calls only (`shutdoor_submit` checks it in
157: absent, null, or two numbers -0.5..0.5).

**The grade prices the exact spot** (the owner, 2026-10-23). The call's value is the miss table
centred on `aimPoint(cell, at)` (`grade.js kernelRowAt`, `Model.keyMixCtx(..., at)`), so an aim at
the edge of a chase cell is priced as the near strike it is. The best call and the state's mean lost
stay over every cell's centre, so the band is relative to the same moment, and an aim that beats
the best centre is green with nothing lost. The lesson prices the same spot.

**Everything the player reads stays on the cell** ("the squares determine the metrics"): the
scouting, the heat map, the tag, and the hitter's history (where pitches crossed is the actual cell,
where he aimed is `call.cell`).

## 5e. Rules 3: the third out (2026-10-24)

Rules 2 and everything after it, plus MLB's third out: a run that crosses before a third out that is
neither a force nor the batter before he reaches first counts (Official Baseball Rules 5.08(a)). If
it puts them ahead it is the go-ahead run; if it ties it, the half ends tied (`tie_held`). Every
in-play row is a legal play from the real play by play (`check-rules.mjs`, README). A new outing's
calls carry `r: 3`; one with `r: 2` or none replays under its own rules, where a third out scores
none, exactly as it was played. Nothing new is drawn.

## 5f. Rules 4: the call, ABS challenges, the bright band (2026-10-24)

Rules 3 and everything before it, plus three things. A new outing's calls carry `r: 4`; a call with
`r: 3` or before replays under its own rules, exactly (`fixtures/replays-rules3-pre-abs.json`).

**The call by location.** A take is called where the ball crossed, not by the cell. The library draw
still decides take or swing from the actual cell's row; a take is then a called strike when the same
draw, read inside the take's share of the row, is under the umpire's chance at that spot
(`contract.js UMPIRE`, `calledStrikeP(zoneDist(x, zn, zoneFt))`: every called pitch of 2024 by its
signed distance from the zone's edge, in half inches). Heart near certain, edges uncertain. The grade
splits each cell's takes the same way one pitch ahead (`grade.js callMass`). No new draw.

**ABS challenges** (MLB's 2026 rules; `contract.js ABS`). Each side has 2 for the outing; a challenge
that wins is kept. Only a called ball or strike, only right away. The ABS zone decides: the ball's
actual location against the zone the grid draws (`zoneDist >= 0` is a strike).
- The batter challenges a called strike by a labelled MODEL (`ABS.BATTER`) fitted to MLB's 2025
  spring training test (4.4% of called strikes challenged by batters) and Triple-A 2025 (batters won
  45%). Its gamble is a draw from the outing's second stream (`hashSeed('abs|' + seed)`), taken only
  when he has a challenge left on a called strike. The outing's four draws a pitch never move.
- The pitcher's side challenges a called ball with the player's button: `challenge(outingId)`
  (section 9). Overturned, the pitch is a called strike and the count, outs and end follow; the call
  carries `ch: 1`, so a replay makes the same challenge.
- Never graded: the call is not the player's decision. The next pitch is graded from the count the
  challenge left.

**The bright band** (the owner, 2026-10-24: "if I have a good release it should go where I aimed").
A release at `q >= PERFECT.BEST_Q` (0.85, the meter's bright band) lands on the aim point plus its
own small miss (1.2 inches a side at 0.85, 0.6 at 1), never more than 3 inches off, and never out of
the zone when aimed inside it, whatever the repeat, effort or arm. A GAME RULE. The same two miss
draws, read as inches. Every other release scales his miss as in section 5.

What the UI needs (a separate UI task):
- `state.abs`: `{left: {pitcher, batter}, challengeLive, events: [{n, by, call, abs, overturned}]}`,
  null before rules 4. Show the challenge button only while `challengeLive` (a called ball, not yet
  challenged, the pitcher's side has one left; also on a ball four that ended the outing, until
  `finishOuting`). The button calls `challenge(outingId)` and redraws from what it returns.
- `pitchResult.abs`: `{called, strike, d}` on every called pitch: the umpire's call, the ABS answer,
  and the inches from the zone's edge (positive inside), for the quick replay against the zone.
- `pitchResult.challenge`: `{by: 'batter'|'pitcher', call, abs, overturned}`: the replay's event and
  the scoreboard's mark. On an overturn `result` is the final call; `abs.called` keeps the umpire's.
- `pitchResult.perfect`: true when the bright band put it on the aim point.

## 5g. Rules 5: the routine play (2026-10-25)

Rules 4 and everything before it, plus one GAME RULE. The owner: "I don't want them to be completely
error-free, but it should be extremely rare on a routine play." A new outing's calls carry `r: 5`; a
call with `r: 4` or before replays under its own rules, exactly, its routine errors included
(`fixtures/replays-rules4-pre-routine.json`).

**What is routine** (`contract.js ROUTINE`, `routineOf(bb, ev, la, spray)`), read from the real
batted ball the cell's error draws:
- a ground ball from 50 up to 95 mph within 6 degrees of a fielder's spot (spray -38 third, -19
  short, 18 second, 42 first: where the 2024 grounders of 60-95 mph went for hits least often);
- a fly ball at 30 degrees or more from 80 up to 95 mph (2024: hits on 1-6% of them);
- every popup;
- a ball with no tracked speed (the 2010-2012 library) by its type and spray alone: a grounder at a
  fielder, a fly ball and a popup.

Not routine, and at their real rates: hard-hit balls (95 mph and up), the slow roller and its
bang-bang throw (under 50 mph), a grounder in the hole or up the middle, line drives, and flies that
are not lazy (the diving and running plays).

**What changes.** Each cell's error key is one real play. When that ball is routine, an error keeps
`ROUTINE.KEEP` of its share (a grounder 0.04, a fly or popup 0.2) and the rest is the cell's real out
of the same kind (`out_ground`, `out_fly`, `out_popup`), with that out's real pitch and advancement
rows (so `check-rules.mjs` holds it). The engine draws the key from the row as it was; on an error it
reads where the library draw fell inside the error's slice, and past KEEP it is the out. No new draw,
and no other key's draw moves. The grade moves the same share one pitch ahead (`grade.js keyMixCtx`);
the hold table after it is unchanged, like the call by location.

## 5h. Rules 6: the runners read the ball (2026-10-26)

Rules 5 and everything before it. The owner: "We need to ensure runners are advancing in realistic
situations, and tagging up in realistic situations." A new outing's calls carry `r: 6`; a call with
`r: 5` or before replays under its own rules, exactly (`fixtures/replays-rules5-pre-runners.json`).

The advancement table (`pack.advance`) is the real share of each runner outcome for a key at a base
and out state. Before rules 6 the row ignored the ball: a 180 ft fly scored the runner from third as
often as a 380 ft one. Now each row's chance is multiplied by a measured ratio and renormalised:

- **The ball's class** (`contract.js runnerClass`): an air ball's carry band (`carryOf`, the 2024
  fit of Statcast distance from exit velocity and launch angle) and side (left, centre, right); a
  ground ball's speed (under 85 mph or not) and side. A ball with no spray or no speed has no class.
- **The row's category** (`runnerCategory`): X when a runner is put out on the bases, else how many
  bases the lead runner went (0 to 3).
- **The ratio** (`pack.runners.ratio`, `pipeline/runners.py`): for each key, lead runner's base, outs
  (0-1 or 2) and class, the category's share on 2024 balls of that class over its share in the key,
  shrunk toward the key's mix by 10 plays.

Every row is still the table's own legal play, and the runner draw is the same draw. The grade keeps
the table's mix: one real ball stands for each key in a cell, and its depth is that ball's, not the
hitter's. A ball in play under rules 6 carries `carry` (feet, air balls) and `cls` for the scene.

## 6. Pitch result

```js
/**
 * @typedef {'ball'|'called_strike'|'swinging_strike'|'foul'|'foul_tip'|'hit_by_pitch'|'in_play'} PitchCallResult
 * @typedef {'single'|'double'|'triple'|'home_run'|'out'|'double_play'|'sac_fly'|'error'|'fielders_choice'} InPlayResult
 *
 * @typedef {Object} PitchResult
 * @property {number} n               pitch number in the outing, from 1
 * @property {PitchCall} call
 * @property {PlatePoint} actual      after command noise, scaled by the release
 * @property {number} spread          the release's scale on his miss (1 without q; section 5b on a repeat)
 * @property {number} [arm]           rules 2: the arm's scale on his miss (fatigue, runners on)
 * @property {Cell} actualCell
 * @property {number} velo            the drawn real pitch's mph; with e, his speed at that effort
 * @property {{velo: number, pfxX: number, pfxZ: number, src: 'his'|'league'|'average'}} [stuff]
 *                                    with e only: the pitch at that effort (section 5c)
 * @property {'take'|'swing'} batter
 * @property {PitchCallResult} result
 * @property {{bb: 'ground'|'line'|'fly'|'popup', ev: number, la: number, spray: number,
 *             result: InPlayResult, text: string, carry?: number, cls?: string}} [inPlay]
 *                                    spray: degrees, 0 = centre field, negative = the left field
 *                                    side. Rules 6: carry, how far the air ball goes (feet,
 *                                    contract.js carryOf), and cls, its class (section 5h)
 * @property {{b: number, s: number}} countBefore
 * @property {{b: number, s: number}} count     after; resets to 0-0 when the plate appearance ends
 * @property {number} outs           after
 * @property {number} bases          after
 * @property {{from: number, to: number}[]} runnerMoves   0 = batter, 1..3 bases, 4 = scored,
 *                                    -1 = put out on the play. A legal MLB play: nobody passes
 *                                    anybody, a runner with no move stayed (left on after the third
 *                                    out), and every move to 4 is a run counted in runs
 * @property {number} runs           scored on this pitch
 * @property {boolean} paOver
 * @property {{id: string, tier: 'batter'|'similar'|'league'}} drawn   the real pitch used
 *                                    (id = Statcast game_pk:at_bat_number:pitch_number)
 * @property {{called: 'ball'|'called_strike', strike: boolean, d: number}} [abs]   rules 4, a called
 *                                    pitch: the umpire's call, the ABS zone's answer, inches from its edge
 * @property {{by: 'batter'|'pitcher', call: string, abs: 'ball'|'strike', overturned: boolean}} [challenge]
 *                                    rules 4: the challenge on this pitch (section 5f)
 * @property {boolean} [perfect]      rules 4: a bright band release, on the aim point
 */
```

v1 has no stolen bases, pickoffs, wild pitches, balks or intentional walks. Fatigue came with rules 2
(section 5b). Errors and
hit-by-pitches happen because the drawn real pitch had one.

## 7. Pitch grade

Every call is graded **before** the pitch resolves: the hold% the call is worth on average, against
the best call available in that state (under rules 2, in that state with that history: section 5b). The outcome never changes the grade.

```js
/**
 * @typedef {'green'|'yellow'|'orange'|'red'} Band
 *
 * @typedef {Object} PitchGrade
 * @property {Band} band
 * @property {number} value          hold% of the call, 0..100
 * @property {number} best           hold% of the best call
 * @property {number} lost           best - value, pts, >= 0
 * @property {number} rel            lost / the state's mean lost over every call; decides the band
 * @property {PitchCall} bestCall
 * @property {string} reason         one line, from the batter's profile or the state:
 *                                   'chases sliders down and away 48% with two strikes'
 * @property {number} reDelta        run expectancy of the call minus the best, runs (shown in debug)
 * @property {boolean} tied          graded after a tie: value, best, lost and rel are on the tie's goal
 */
```

Bands are **relative to the moment** (the owner's call, 2026-10-17): `rel = lost / meanLost`,
where `meanLost` is the mean hold% points lost over every legal call (each arsenal pitch, each cell)
in that state. Fixed point cutoffs failed on the real packs, because one pitch moves hold% by under
a point in a one-run ninth and by almost nothing with a three-run lead. Constants in `contract.js`,
set from `pipeline/band_sweep.mjs --relative`:

| band | rel |
|---|---|
| green | `<= 0.45` (the best call has rel 0) |
| yellow | `<= 0.9` |
| orange | `<= 1.5` |
| red | `> 1.5` |

`PitchGrade` carries `rel` beside `lost`. The score and the percentile stay on absolute `lost`.

**After a tie** (the owner's call, 2026-10-20) the objective is no longer the lead, it is not
letting them go ahead. Every call after a tie is graded on the probability that the inning ends
without a go-ahead run, under best play, with the same relative bands. It is one value function over
one state space: the state carries the margin (0 once tied), and a state's goal is the least margin
that meets it (1 with the lead, 0 tied). With the lead, a move into a tie is worth 0, exactly as
before, so every grade before a tie is unchanged.

Why hold% and not run expectancy: for a closer only the hold matters. Hold% already sees the cases
where run expectancy misleads (tying run on third with one out, a three-run lead with nobody on), so
one unit covers every state. Run expectancy is kept as `reDelta` for debug.

## 8. Outing state and result

```js
/**
 * @typedef {Object} OutingState
 * @property {string} outingId
 * @property {string} scenarioId
 * @property {'daily'|'practice'} mode
 * @property {number} seed
 * @property {'live'|'over'} status
 * @property {number} pitchNo        pitches thrown so far
 * @property {{b: number, s: number}} count
 * @property {number} outs
 * @property {number} bases
 * @property {{us: number, them: number}} score
 * @property {number} batterIndex    into scenario.batters (wrapped)
 * @property {Band[]} strip          one per pitch so far
 * @property {boolean} shutItLive    two strikes and two outs: the confirm button reads 'shut it'
 * @property {PitchResult[]} log
 * @property {PitchGrade[]} grades
 */

/**
 * @typedef {Object} OutingResult
 * @property {'door_shut'|'tie_held'|'doors_open'|'walk_off'} outcome
 * @property {number} pitches
 * @property {Band[]} strip
 * @property {number} score          higher is better: hold% kept across the outing plus the result
 *                                   (formula owned by Agent A, documented in the engine README)
 * @property {number} percentile     0..100: share of the closer pool's outings this beats
 * @property {{name: string, reason: string}} pitchedLike
 * @property {Reveal} reveal
 * @property {'beat'|'matched'|'lost'} vsReal   outcome first, by contract.js OUTCOME_RANK
 *                                              (door_shut 3 > tie_held 2 > doors_open 1 > walk_off 0),
 *                                              then fewer runs allowed, then fewer pitches when
 *                                              his count is known (reveal.pitches a number).
 *                                              Equal pitches, or his count null, is matched.
 * @property {string} share          the share text, built by share.js
 * @property {{scores: number[]}} pool   the closer pool's outing scores here, sorted (B11)
 * @property {{streak: number, best: number, rank: number|null, players: number}} [account]
 *                                   daily mode, signed in: what the server recorded
 */
```

End rules (the owner's call, 2026-10-20: "blowing the save but holding the tie"):

- Three outs with our lead intact: `door_shut`.
- A run that ties does not end the outing. Play goes on in the same inning.
- After a tie, three outs with the game still tied: `tie_held` (label `HELD THE TIE`, in
  `contract.js OUTCOME_LABEL` so it is renamed in one place).
- A run that puts them ahead, before or after a tie: `walk_off` when `walkOffLive`, otherwise
  `doors_open`.
- If one play ties it and goes ahead, the go-ahead rule decides.

A held tie is a blown save: it ranks under `door_shut` and breaks the streak (section 12).

## 9. The engine API (the only thing the UI calls)

All of them are async, so the UI does not care where the work runs. `challenge` came with rules 4.

```js
/** @returns {Promise<Scenario>}  without reveal */
getScenario(day)

/** daily: the server issues the seed and returns the in-progress outing if one exists.
 *  practice: unscored, any seed, never written.
 *  @returns {Promise<OutingState>} */
startOuting(scenarioId, seed, { mode })

/** @returns {Promise<{pitchResult: PitchResult, pitchGrade: PitchGrade, state: OutingState}>} */
throwPitch(outingId, pitchCall)

/** rules 4: the pitcher's side challenges the last pitch's called ball (section 5f). Only while
 *  state.abs.challengeLive, before the next throw and before finishOuting.
 *  @returns {Promise<{pitchResult: PitchResult, state: OutingState}>} */
challenge(outingId)

/** @returns {Promise<OutingResult>} */
finishOuting(outingId)
```

Deterministic: the same scenario, seed and calls give the same results on any device. One seeded
stream (`mulberry32`), drawn in a fixed order per pitch: miss x, miss z, the library draw, the
runner draw. No `Math.random`, no wall clock. A call's `q` (section 5) scales the two miss draws
and never adds or moves a draw. A call's `e` (section 5c) weights the row the library draw reads and
loads the arm, and never adds or moves a draw.

How it runs:

- `engine.js` is pure and synchronous. `api.js` wraps it with the four async calls above. All
  of it runs in the browser from the day's pack, as every daily on the site does.
- Daily mode: the seed is `hashSeed('shut-the-door-' + day)`, the same for everyone (Run The
  Diamond's daily does the same). The same calls get the same luck for every player. `startOuting`
  ignores a passed seed in daily mode.
- One daily per day: the outing (day, calls) is kept in localStorage (`std_outing_v1`) after every
  pitch, so a reload resumes it by replaying the calls. Signed in, `finishOuting` submits it and the
  first submit for (user, day) stands.
- Practice mode ("run it back"): a fresh random seed, never stored or submitted.
- `debug: {seed, tiers}` is on the state, shown when the page is opened with `?debug=1`.

## 10. The daily pack (a static file per scenario, which the browser downloads)

`data/schedule.json` maps each day to a pack and a daily number. The pack carries the reveal too:
what the real pitcher did is public history, and the UI shows it only after the outing.

```js
/**
 * @typedef {Object} Pack
 * @property {number} v              pack format version
 * @property {Scenario} scenario     without reveal
 * @property {Object} library        per batter x pitch type x actual cell x count bucket:
 *                                   the candidate real pitches and their tier
 * @property {Object} advance        runner advancement by in-play result and base-out state
 * @property {Object} hold           hold% by state (batterIndex, count, outs, bases, margin)
 * @property {Object} kernel         per arsenal pitch: the 25x25 miss table (target cell to actual cell)
 * @property {{scores: number[], closers: Object[]}} pool   the closer pool's outing scores (sorted)
 *                                   and the vectors for 'pitched like'
 */
```

The live path is lookups: grading a state multiplies the miss table by the outcome table for every
arsenal pitch and cell, then reads hold% for each next state. No simulation runs live. Target size
under 1.5 MB of JSON per day.

## 11. Share text

```
Shut The Door #12
door shut · better than 71% of closers
pitched like Josh Hader
🟩🟩🟨🟩🟧🟩
runthe.gg/shut-the-door
```

Squares: green 🟩, yellow 🟨, orange 🟧, red 🟥, ten to a line. The URL line is one constant in
`share.js`.

## 12. Storage (own tables, migration `153_shut_the_door.sql` or the next free number)

| table | key | holds |
|---|---|---|
| `shutdoor_outings` | `(user_id, day)` | daily number, scenario id, calls (jsonb), outcome, pitches, score, percentile, pitched like, strip |
| `shutdoor_streaks` | `user_id` | current doors shut in a row, best, last day |

The schedule is the static `schedule.json`, so there is no day table. Written only by
`shutdoor_submit(day, ...)`, `security definer`, granted to `authenticated`, the way every
top-level game writes its board (template: `148_putt_daily_board.sql`, streak from
`52_grid_daily.sql`). It reads the username from `profiles`, refuses a day more than one off the
Eastern day, keeps the first submit, updates the streak and returns `{streak, best, rank, players}`.
`shutdoor_board(day, limit)` and `shutdoor_my_stats()` read. Trophies: a marked v2 hook.

The calls are stored with every result, so `check-replays.mjs` can replay any row offline with the
engine and flag a score the calls do not produce. Each call carries its release `q` when it was
timed (section 5). `156_shut_the_door_release.sql` makes the submit's guard check it: absent, null,
or a number 0..1.

The streak is "doors shut in a row": a door shut on consecutive days. A blown save or a missed day
resets it. A held tie is a blown save, so it resets it too. `155_shut_the_door_tie_held.sql` lets
`tie_held` into the outcome check and the submit's guard, and adds `tieHeld` to
`shutdoor_my_stats()`.

## 13. The mock

`shut-the-door/fixtures/mock-scenario.json` (written by the lead on approval) is one complete scenario in this
shape, with a tiny pack, so Agent B builds and tests the whole UI before Agent A's engine exists.
Agent B's `mock-api.js` implements the four calls over it.

## 14. Lead rulings (2026-10-17, after the first pass)

Scenarios (owner approved): Yamamoto 2025 WS G7, Buehler 2024 WS G5, **Pressly 2022 WS G6** (replaces
Montgomery: one batter, two pitches), Chapman 2016 WS G7, Hader 2019 NL WC, Feliz 2011 WS G6, **Díaz
2025-09-05 at CIN**, **Tanner Scott 2025-06-27 at KC**, Eckersley 1988 WS G1 (proxy), Rivera 2001 WS
G7 (proxy). The verified facts are in `scenarios/CANDIDATES.md`.

- **Starters' arsenals** (Yamamoto, Buehler): the owner chose their postseason mix that October.
- **Rivera** is `doors_open` under the end rules (Womack's double ties it). The reveal tells the rest.
  Superseded 2026-10-20 by the tie rule (section 8): Gonzalez's single scores the go-ahead run after
  the tie, so Rivera is `walk_off`. Chapman 2016 and Feliz 2011 are `tie_held`.
- **Eckersley**: `reveal.pitches` is null with `pitchesNote`, since Retrosheet lacks two at-bats' pitches.
- **Bunts**: none in v1. A real bunt shows only in the reveal.
- **Clase**: not used. Savant's pitch labels stand as published (Hader's sinker draws as `run`).
- **Bands**: Agent A retunes them on the real packs and reports the spread per scenario to the
  lead before `contract.js` changes. Hold% may move less per pitch than 0.5/1.5/4.0 assumes.
- **B1**: accepted. `startOuting` in daily mode never writes or submits at `pitchNo` 0, and
  `finishOuting` on an outing that is over returns the same result and never submits twice.
- **B2**: accepted. `to: -1` is a runner put out (section 6).
- **B3**: confirmed. Negative spray is the left field side.
- **B4**: yes, a guest streak on the device (`std_ui_hist_v1`). Signed in, the server's streak wins.
  `STD_AUTH.myStats()` reads `shutdoor_my_stats()`.
- **B5**: accepted as written, `myStats()` added. `STD_SHARE.text(result, dailyNumber)`.
- **B6**: accepted. `api.js`, `share.js`, `auth.js` load before `mock-api.js`; the lead removes the
  mock's tag at integration.
- **B7**: accepted.

## 15. The lesson: teaching from your worst pitch (owner, 2026-10-17)

The game teaches pitching strategy. After the outing, the result screen opens a card on the pitch
that cost the most hold%: what you threw, what was better, the principle behind it, and a real pitch
from the data where a pro did it. One lesson per outing, so it lands. It never opens by itself as a
modal: it is a card on the result screen, read or skipped.

```js
/**
 * @typedef {'chase_when_ahead'|'strike_when_behind'|'first_pitch_strike'|'avoid_his_damage'
 *   |'attack_his_hole'|'same_side_breaker_away'|'change_eye_level'|'double_play_ball'
 *   |'strikeout_with_runner_on_third'|'dont_walk_the_tying_run'|'use_your_best_pitch'} Principle
 *
 * @typedef {Object} Lesson
 * @property {number} pitchN            which pitch (the one with the most `lost`)
 * @property {PitchCall} call           what you threw
 * @property {PitchCall} bestCall
 * @property {{b: number, s: number}} count
 * @property {number} outs
 * @property {number} bases
 * @property {boolean} tied             the pitch came after a tie: its numbers are on the tie's goal
 * @property {string} batter
 * @property {Principle} principle
 * @property {string} headline          'ahead 0-2, make him chase'
 * @property {string[]} why             2 or 3 short sentences, numbers from the engine:
 *                                      'he swings at 41% of sliders below the zone.'
 *                                      'a fastball over the plate is where he hits .390.'
 * @property {string} nextTime          one line: 'next time ahead 0-2, bury the slider.'
 * @property {{lostPts: number, callValue: number, bestValue: number}} numbers
 * @property {ProExample|null} pro      null when the data has no honest match
 * @property {string} [pattern]         one outing-level note, when one is true:
 *                                      'you threw 9 of 12 fastballs. this lineup chased sliders.'
 *
 * @typedef {Object} ProExample         a REAL pitch from the library, never invented
 * @property {string} pitcher
 * @property {string} batter
 * @property {Hand} bats              the pro example batter's side (B10), so the card can say
 *                                      inside and away in words
 * @property {string} date              'YYYY-MM-DD'
 * @property {string} game              'nlcs game 5' or 'at cin' (postseason first when one fits)
 * @property {{b: number, s: number}} count
 * @property {number} outs
 * @property {number} bases
 * @property {PitchType} type
 * @property {Cell} cell
 * @property {string} result            'swinging strike three', 'ground ball double play'
 * @property {string} id                Statcast game_pk:at_bat_number:pitch_number
 */
```

`OutingResult` gains `lesson: Lesson|null` (null only when every pitch was green, and then the card
says so: `nothing to fix. every pitch was the right idea.`).

Rules:

- **Chosen by the engine, from the grade.** The principle is the one that explains most of the
  gap between the call and the best call: compare their outcome tables (whiff, chase, walk risk,
  damage on contact, ground ball rate, platoon) in that state. No principle that the numbers do not
  show.
- **Every number interpolated** from the pack and the grade. The copy is templates in `lesson.js`
  (Agent A), house voice: lowercase, short sentences.
- **The pro example is a real pitch.** At build time each pack carries a short list of real pitches
  per principle, count bucket and platoon, from the library, by pitchers in the closer pool,
  matching the best call's pitch family and cell (or a neighbour) with a good result. Postseason
  first, then the highest leverage. With no honest match, `pro` is null and the card shows none.
- **Grade cards** keep their one-line reason during play. The lesson is the one longer moment.
- **How to play** gains a short "pitching 101" page listing the principles, one line each, behind
  the menu button like every guide.
