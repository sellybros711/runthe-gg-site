# RunTheHouse

Sixteen people, one prize, a sealed house. Nobody in it is scripted: every
opponent is generated fresh, forms their own opinions of you, builds their own
alliances behind your back, and votes on their own maths. Lives at
`runthe.gg/house/`.

**Status: playable end to end.** Stages 1 to 9 of `GDD.md` §15 are in. The
design doc's build order says nothing reaches the frontend until the harness
produces sane numbers; it does, see Calibration below, so the UI sits on top of
a validated engine.

## Files

| File | Role |
|---|---|
| `GDD.md` | The design document. Every rule and formula, and the open questions. |
| `index.html` | The whole game UI, self-contained apart from the modules below. |
| `rng.js` | mulberry32 over four named streams. Browser: `window.RH_RNG`. |
| `tree.js` | The skill tree, the archetype resolver, XP and levels. `RH_TREE`. |
| `generate.js` | Name pools, cast generation, baseline affinity. `RH_GEN`. |
| `engine.js` | Trust, belief, decay, detection, threat, alliances, votes, blame, the Panel. `RH_ENGINE`. |
| `comps.js` | Comp definitions, blended resolution, throwing. `RH_COMPS`. |
| `run.js` | The week loop state machine, save and restore. `RH_RUN`. |
| `powers.js` | The six secret powers, their award schedule and AI policies. `RH_POWERS`. |
| `scenes.js` | Energy, the scene and beat banks, and the A/B/C resolution. `RH_SCENES`. |
| `policy.js` | A scripted player. Answers every `needsInput` through the same surface the UI uses. `RH_POLICY`. |
| `strings.js` | Authored copy fragments. `RH_STRINGS`. |
| `playtest.js` | Plays one full run as readable text. The design instrument. |
| `simulator.js` | The validation harness. Run after any change to a weight. |
| `lint-strings.js` | Enforces the §17 copy rules over strings.js, scenes.js and index.html. |

Every module is dual-target: `require` in Node, a global in the browser. All of
them are wrapped in an IIFE because they load as plain script tags and share one
global scope; see the note at the top of any of them.

## Running it

```sh
python3 -m http.server 8899      # then open /house/
node house/playtest.js           # one run as text
RH_SEED=8842 node house/playtest.js
node house/simulator.js          # the gate
node house/simulator.js --levels # progression parity
node house/simulator.js --throws # thrown comp backfire
node house/simulator.js --tree   # tree maths and archetype reachability
node house/simulator.js --seat   # the player's seat, played for real
node house/simulator.js --skill  # the human comp curve
node house/lint-strings.js       # copy rules
```

## Calibration

600 headless runs, no human at the keyboard. Targets are in `GDD.md` §15.

| Proxy | Measured | Target |
|---|---|---|
| Week 1 boot was most trusted | 7.5% | under 10%, chance is 6.25% |
| Comp beast to Final 5, **with** cover | 47.2% | above the 31.5% field |
| Comp beast to Final 5, **no** cover | 24.8% | below the field |
| Winner above median trust at Final 5 | 47.8% | 45 to 70%, chance is 40% |
| Archetype win rate, highest | 8.1% | under 10.5%, baseline 6.25% |
| Cast At Risk at least once | 98.9% | over 60% |
| Alliance median lifespan | 3 weeks | 3 to 5 |
| Alliances alive at the end | 6.0% | under 12% |
| Runs with a blindside | 100%, 8.7 per run | over 85% |
| Unanimous Panel votes | 8.2% | under 20% |
| One vote Panel finishes | 37.5% | over 25% |
| Pairs in the top trust band at Final 5 | 2.4 | about 2 |
| Blame landed correctly | 53.2% | 45 to 70% |
| Level 60 vs level 1 win ratio | 1.20x | under 1.5x |

**The comp beast proxy is split by cover, and the flat version was asking the
wrong question.** "Comp beasts survive worse than the field" conflates two
populations the design wants to behave in opposite ways. Winning too often makes
you the biggest threat in the room; whether that kills you depends on whether you
have the room. Measured flat, the two average to parity and the proxy reports a
failure while the model does exactly what it should.

## The axes

`--axes` is the balance test that matters: does being good at both halves of the
game pay. Both inputs are read at Final 10 and the outcome at the end, because
measuring total comp wins against final placement is circular.

| | win% | reached F5 | avg finish |
|---|---|---|---|
| high comp + high social | 11.3% | 46.1% | 5.73 |
| low comp + high social | 13.9% | 61.4% | 4.89 |
| high comp + LOW social | 5.6% | 30.3% | 6.73 |
| low comp + low social | 7.0% | 43.9% | 5.91 |

Social is the dominant axis, which is correct for a social game, and **a floor
game is worth about 5.7 points of win rate to a comp winner**. Before the `cover`
mechanism it was worth nothing: a well-liked comp winner finished 6.72 against
6.24 for the same player with no friends, so social investment was actively
harmful and the whole Floor Game trunk was a trap.

The honest residual: comps still cost a socially strong player a little, because
holding power means naming people and the house remembers. A small tax now
rather than the death sentence it was.

23 archetypes are reachable. The tree is 63 nodes and 372 tokens against 84
tokens at the level cap, so a maxed account holds 22.6% of it.

Two targets in the design doc were set before there was data and are documented
as recalibrated rather than tuned toward:

- **Week 1.** Nobody has information in week one, so beating chance at picking
  out the most-trusted player is not something the simulation can do honestly.
- **The 70% thrown-comp backfire.** Measured, it runs 13.6% with twelve players
  left and 71.4% at Final 5. A single thrown comp is invisible in a full house;
  the house only starts reading throws at three in a row. Forcing it flat would
  mean hardcoding "the thrower gets named", which is the outcome-as-rule that
  §1's design pillar exists to forbid.

## The rule that governs changes

Nothing in the engine may hardcode an outcome the simulation is supposed to
produce. Percentages in the design doc are calibration targets for
`simulator.js`, not die rolls. If comp winners are not getting targeted, fix a
weight in `engine.js` K; do not add `if (compWins > 3) threat += 20`.

Every tunable lives in `engine.js` K. A number that cannot be swept cannot be
tuned, which is why the Panel's juror noise moved out of an inline literal the
moment it turned out to dominate the endgame.

## The player's seat, measured

`policy.js` plays that chair through the real player surface: energy, scenes,
A, B or C, and every `needsInput` the loop can raise. It is competent rather
than optimal and has no privileged access to anything the UI lacks.

450 runs per setting, `--seat`:

| risk | A / B / C | avg finish | win% | reached the Panel |
|---|---|---|---|---|
| 0 | 1 / 96 / 3 | 6.75 | 7.7% | 69.0% |
| 0.25 | 2 / 80 / 19 | 6.81 | 7.7% | 67.7% |
| 0.5 | 4 / 44 / 52 | 7.51 | 7.7% | 62.0% |
| 0.75 | 6 / 17 / 76 | 7.51 | 6.3% | 62.0% |
| 1 | 6 / 9 / 85 | 7.58 | 4.3% | 63.0% |

The AI stand-in over the same seeds finishes 7.06 and wins 5.7%, so **the
harness was not measuring a fiction**: a person in that chair does roughly what
the stand-in did, slightly better, which is what a deliberate target-picker
should manage against generic weights.

**This measurement found a real bug.** Before it existed, the risky column was a
strict trap: C carried negative expected trust, about minus 3 a scene against
B's plus 5.6, and win rate fell monotonically from 7.2 percent at risk 0 to 2.8
percent at risk 1. The design says C is the only column that can move the game;
the arithmetic said do not touch it. `scenes.js RISK` now holds the constants
that fix it, and they are on a mutable object because the first two attempts at
this could not be swept at all.

Risk 0 through 0.5 now sit level and heavy spam is punished. That is the shape
to keep: C is a lever you pull when you need something, not a better default.

## Not built yet

`GDD.md` §18 has the live list. The short version: the Split House twist still
has no voting rule and is unbuildable as specified, the store and the Supabase
leaderboard are deliberately last, and Move In Night is one dialogue beat where
it should be several.
