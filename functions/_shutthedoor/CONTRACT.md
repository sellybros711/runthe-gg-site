# Shut The Door: the shared contract

Status: DRAFT for owner approval (2026-10-17). Owned by the lead. Agent A (engine, data, backend)
and Agent B (UI) both build against this file and change it only through the lead. Anything B
needs that is missing goes in `CONTRACT_REQUESTS.md`; the lead answers there and edits this file.

The stack has no TypeScript and no build step, so the types are JSDoc. On approval the lead turns
the type blocks below into `contract.js` (typedefs plus the frozen constants), and both agents
import the constants from there rather than retyping a number.

## 0. Where it lives and how it is served

Tester-only games keep all code under `functions/_<game>/`, because any folder at the site root is
served to the public (the vault's `platform-tester-gate`). So the "self-contained game folder" is:

```
functions/_shutthedoor/            everything, never served as files (_redirects 404s /functions/*)
functions/shut-the-door/[[path]].js   the page Function: /shut-the-door and /shut-the-door/m/<file>.js
functions/api/shut-the-door/[[path]].js  the API Function: /api/shut-the-door/*
```

Browser code is plain ES modules, built into `pages.js` as strings and served only through the gate
(the Last Shot pattern). A non-tester gets the site's `404.html` with a 404 on every route.

## 1. Words and units

| term | meaning |
|---|---|
| us | the closer's team. The player always pitches for us |
| them | the batting team |
| day | the Eastern calendar day, `YYYY-MM-DD` (`America/New_York`), like every daily on the site |
| daily number | `floor((day - EPOCH) / 1 day) + 1`, EPOCH = the first tester day |
| hold | the outing ends with 3 outs and our lead intact |
| hold% | the probability of a hold from a state, under best play from here on. The grading unit |
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

If the owner picks the centre-field camera, the UI mirrors the picture left to right for display
only. The data, the engine and every cell index stay in catcher's view.

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
 * @property {'door_shut'|'doors_open'|'walk_off'} outcome
 * @property {number} pitches       what the real pitcher threw in this spot
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
 *             throws: Hand, arsenal: ArsenalPitch[]}} pitcher
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
 * @typedef {Object} PitchCall        two taps, nothing else
 * @property {PitchType} type         must be in the pitcher's arsenal
 * @property {Cell} cell
 */
```

## 6. Pitch result

```js
/**
 * @typedef {'ball'|'called_strike'|'swinging_strike'|'foul'|'foul_tip'|'hit_by_pitch'|'in_play'} PitchCallResult
 * @typedef {'single'|'double'|'triple'|'home_run'|'out'|'double_play'|'sac_fly'|'error'|'fielders_choice'} InPlayResult
 *
 * @typedef {Object} PitchResult
 * @property {number} n               pitch number in the outing, from 1
 * @property {PitchCall} call
 * @property {PlatePoint} actual      after command noise
 * @property {Cell} actualCell
 * @property {number} velo            the drawn real pitch's mph
 * @property {'take'|'swing'} batter
 * @property {PitchCallResult} result
 * @property {{bb: 'ground'|'line'|'fly'|'popup', ev: number, la: number, spray: number,
 *             result: InPlayResult, text: string}} [inPlay]   spray: degrees, 0 = centre field
 * @property {{b: number, s: number}} countBefore
 * @property {{b: number, s: number}} count     after; resets to 0-0 when the plate appearance ends
 * @property {number} outs           after
 * @property {number} bases          after
 * @property {{from: number, to: number}[]} runnerMoves   0 = batter, 1..3 bases, 4 = scored
 * @property {number} runs           scored on this pitch
 * @property {boolean} paOver
 * @property {{id: string, tier: 'batter'|'similar'|'league'}} drawn   the real pitch used
 *                                    (id = Statcast game_pk:at_bat_number:pitch_number)
 */
```

v1 has no stolen bases, pickoffs, wild pitches, balks, intentional walks or fatigue. Errors and
hit-by-pitches happen because the drawn real pitch had one.

## 7. Pitch grade

Every call is graded **before** the pitch resolves: the hold% the call is worth on average, against
the best call available in that state. The outcome never changes the grade.

```js
/**
 * @typedef {'green'|'yellow'|'orange'|'red'} Band
 *
 * @typedef {Object} PitchGrade
 * @property {Band} band
 * @property {number} value          hold% of the call, 0..100
 * @property {number} best           hold% of the best call
 * @property {number} lost           best - value, pts, >= 0
 * @property {PitchCall} bestCall
 * @property {string} reason         one line, from the batter's profile or the state:
 *                                   'chases sliders down and away 48% with two strikes'
 * @property {number} reDelta        run expectancy of the call minus the best, runs (shown in debug)
 */
```

Bands (constants in `contract.js`, tuned by Agent A against the tests and reported to the lead
before they change):

| band | lost |
|---|---|
| green | `<= 0.5` pts (the best call, or within half a point, as Two-Minute Drill does) |
| yellow | `<= 1.5` pts |
| orange | `<= 4.0` pts |
| red | `> 4.0` pts |

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
 * @property {'door_shut'|'doors_open'|'walk_off'} outcome
 * @property {number} pitches
 * @property {Band[]} strip
 * @property {number} score          higher is better: hold% kept across the outing plus the result
 *                                   (formula owned by Agent A, documented in the engine README)
 * @property {number} percentile     0..100: share of the closer pool's outings this beats
 * @property {{name: string, reason: string}} pitchedLike
 * @property {Reveal} reveal
 * @property {'beat'|'matched'|'lost'} vsReal   outcome first (door_shut > doors_open > walk_off),
 *                                              then fewer runs allowed
 * @property {string} share          the share text, built by share.js
 * @property {{streak: number, best: number, rank: number|null, players: number}} [account]
 *                                   daily mode, signed in: what the server recorded
 */
```

End rules: three outs with our lead intact is `door_shut`. A run that ties is `doors_open` and
ends the outing. A run that puts them ahead is `walk_off` when `walkOffLive`, otherwise
`doors_open`. If one play ties it and goes ahead, the go-ahead rule decides.

## 9. The engine API (the only thing the UI calls)

All four are async, so the UI does not care where the work runs.

```js
/** @returns {Promise<Scenario>}  without reveal */
getScenario(day)

/** daily: the server issues the seed and returns the in-progress outing if one exists.
 *  practice: unscored, any seed, never written.
 *  @returns {Promise<OutingState>} */
startOuting(scenarioId, seed, { mode })

/** @returns {Promise<{pitchResult: PitchResult, pitchGrade: PitchGrade, state: OutingState}>} */
throwPitch(outingId, pitchCall)

/** @returns {Promise<OutingResult>} */
finishOuting(outingId)
```

Deterministic: the same scenario, seed and calls give the same results on any device. One seeded
stream (`mulberry32`), drawn in a fixed order per pitch: miss x, miss z, the library draw, the
runner draw. No `Math.random`, no wall clock.

How it runs (lead's proposal, see the plan):

- `engine.js` is pure and synchronous. `api.js` wraps it with the four async calls above.
- Pitches resolve in the browser for an instant animation, from the day's pack.
- Daily mode: `startOuting` asks the server for the seed (one per player per day), and each
  `throwPitch` also records the call on the server, so a reload resumes the same outing and a
  bad result cannot be rerolled. `finishOuting` sends nothing new: the server replays the recorded
  calls with the same engine, writes the result and streak, and returns the reveal and percentile.
- Practice mode never touches the server.
- `debug: {seed, tiers}` is exposed on the state behind the tester debug toggle.

## 10. The daily pack (what the server stores per day, and the browser downloads)

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
`share.js` (see the open question in the plan about linking a gated path).

## 12. Storage (own tables, migration `152_shut_the_door.sql` or the next free number)

| table | key | holds |
|---|---|---|
| `shutdoor_days` | `day` | number, scenario id, pack (jsonb), reveal (jsonb), published at |
| `shutdoor_outings` | `(user_id, day)` | seed, calls (jsonb), version, status, outcome, score, percentile, pitched like, strip |
| `shutdoor_streaks` | `user_id` | current doors shut in a row, best, last day |

RLS on with no policies, every RPC `security definer`, execute granted to `service_role` only: the
API Function is the only caller, as for every tester-only game. The tester list is the one
`stumpire_testers`, read directly (not `stumpire_access()`), as Last Shot does.

The streak is "doors shut in a row": a door shut on consecutive days. A blown save or a missed day
resets it.

## 13. The mock

`fixtures/mock-scenario.json` (written by the lead on approval) is one complete scenario in this
shape, with a tiny pack, so Agent B builds and tests the whole UI before Agent A's engine exists.
Agent B's `mock-api.js` implements the four calls over it.
