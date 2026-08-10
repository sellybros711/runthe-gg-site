# Tests

```
node football/build/test/test_scorelines.mjs
```

No database, no browser, no network. It reads `data/display_calibration.json` and
plays games through the real engine.

| File | What it proves |
|---|---|
| `test_scorelines.mjs` | That the scores on screen are scores the NFL has actually produced, and that changing how a scoreline is rendered cannot change who won. |

## Why the second half of that matters more than the first

`rng` is one sequential stream shared by every game in a season. `toFootballScore`
draws from it, so if the sampler and the fallback consumed different numbers of
values, switching between them would shift the stream and silently rewrite the
result of every later week. That would not look like a rendering change. It would
look like the leaderboard quietly disagreeing with itself, and it would invalidate
every run recorded before the change.

Both paths draw exactly one value, and the suite asserts it. Anyone adding a second
draw to either path breaks the run history of a live game; that assertion is what
tells them before it ships rather than after.

## The bug this was written for

`toFootballScore` read `cal.internal_offense_q`. `build/04-display.mjs` writes
`internal_offence_q`, with a c. No such key as the first has ever existed in the
calibration file, so the guard in front of the real-scoreline sampler was true on
every call and every score this game had ever shown came out of the arithmetic
fallback instead.

Measured over 40,000 games, against the 7,276 real games the calibration is built
from:

| | before | after | real |
|---|---|---|---|
| scorelines the NFL has never produced | 14.35% | 0.00% | n/a |
| a team scores 4 | 0.588% | 0.000% | 0.000% |
| a team scores 2 | 1.035% | 0.010% | 0.014% |
| a team scores 5 | 0.828% | 0.043% | 0.043% |

Nothing threw, no test failed, and no single score looked absurd, because the
fallback returns a plausible number. That is why this suite checks which PATH ran
and not only what came out of it: a typo in the other direction would put the game
straight back where it was, and every assertion about averages would still pass.

The college game had the identical typo, found first, fixed the same way. If you
are adding a third game, take the calibration key names from the build stage rather
than from memory.

## There is no browser suite here

The college game has one, under `cfb/build/test/`. This game does not. The engine is
covered; the page is not. Worth knowing before you assume a green run means the UI
is fine.
