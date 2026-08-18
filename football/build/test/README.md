# Tests

```
node football/build/test/test_scorelines.mjs
node football/build/test/test_game_scripts.mjs
node football/build/test/test_drives.mjs
node football/build/test/test_defense.mjs

(nohup node cfb/build/test/gzip_server.mjs &)
node football/build/test/test_bracket.mjs
BROWSER=1 node football/build/test/test_defense.mjs
```

The first four need no database, no browser and no network. They read
`data/display_calibration.json` and play games through the real engine. The last two
drive the page in Chromium and need a server, which is why they are listed apart.
`test_defense.mjs` appears in both lists on purpose: its pool and balance halves run
anywhere, and `BROWSER=1` adds a played season on top.

| File | What it proves |
|---|---|
| `test_scorelines.mjs` | That the scores on screen are scores the NFL has actually produced, and that changing how a scoreline is rendered cannot change who won. |
| `test_game_scripts.mjs` | That a finished game reads like a real one: when the points land across the four quarters, how often the lead changes hands, and that a tie goes to overtime under the playoff rules. |
| `test_drives.mjs` | Who has the ball and when it changes hands, including the coin toss and the second half kickoff. |
| `test_bracket.mjs` | That the postseason field is a real fourteen team bracket at every seeding, and that what it draws about your own run agrees with what the run recorded. |
| `test_defense.mjs` | That One Stop, the defense draft, is the same game from the other side: a $30M defender buys what a $30M receiver buys, the draft moves the scoreboard as much, a defensive season is as winnable, every scheme can be drafted for on purpose, and the formation on the field fits in its box at every width. |

## What `test_defense.mjs` is really guarding

Not "the mode exists". A defense mode can be completely broken and still look fine.

On the rating alone, drafted defenses land within 9.5% of each other where offenses
spread over 22.5%: IDP scoring is tackle-led, and tackle counts barely separate
starters. Nothing in the mode would throw or render wrong if that compression came
back. Every season would simply play the same, and the draft would quietly stop
mattering.

What closes the gap is `defenseStructure` reading WHAT KIND of defense a roster is,
which is why the schemes are tested as hard as the balance. Two assertions draw the
distinction on purpose, one on the rating alone and one on the rating times structure,
so a regression says which half broke. Three more draft toward the pass rush, toward
coverage, and toward tacklers, and check each strategy actually produces the defense it
is chasing: a scheme reachable only by luck is a lottery ticket rather than a decision.

## And the formation

Six defensive spots (DL DL LB DB DB FLEX) can hold exactly four shapes: the one with the
flex still open, and the three the flex closes into. The browser half draws all four at
four widths and measures the rendered pixels, checking that no disc lands on another
chip's name and that nothing escapes the field.

That is not a cosmetic assertion. A formation breaks by a label sliding under a face, and
it breaks silently: nothing throws, the season still plays, and the only symptom is a
picture nobody can read. The offense's own formation had no such test and had to be solved
by hand twice, once when the flex chip landed on the running back's name and once when the
fallback table and the live one disagreed about where he stood.

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

## How much of the page is covered

Two files here open a browser: `test_bracket.mjs` on the postseason, and
`test_defense.mjs` on One Stop's gate, draft, formation and season. The engine is covered
thoroughly. The page is covered on those screens and nowhere else, so a green run says
nothing about a normal draft, the season screen, the results card or the leaderboard, and
nothing at all about the offensive formation. The college game has a real browser suite
under `cfb/build/test/` if you want the shape of one.

## One Stop is finished and gated

`DEFENSE_LIVE` in `football/index.html` is `false`, so the mode card says Coming Soon and
cannot be pressed. That is not caution. `ps_runs_run_mode_ck` lists the recordable modes
by name, so until `supabase/80_football_defense_mode.sql` is applied the database rejects
every defense run outright, and a player would get a season that vanishes on submit.

To open it:

1. run `supabase/80_football_defense_mode.sql`
2. deploy with names in `DEFENSE_TESTERS`, who get the real mode on the real database
   while everybody else still sees Coming Soon
3. flip `DEFENSE_LIVE` to `true` and deploy again, which opens it to everybody

The migration comes first in every version of that plan, testers included: the other
order records nothing and shows a save failure nobody can act on.

`DEFENSE_TESTERS` is a feature flag, not a permission. The list ships in the page, so it
is readable by anybody who opens the console and forgeable by anybody who cares to. That
is fine for hiding an unannounced mode and would not be fine for anything else; the
database is what decides whether a run is recorded and it does not consult the list.

All three states are covered by `BROWSER=1 node football/build/test/test_defense.mjs`, so
the flip is a one-line change with a test behind it.

`test_bracket.mjs` writes an instrumented copy of the game to
`football/__test_bracket.html`, drives it, and deletes it. That name is deliberate:
`__test*.html` is in `.gitignore` because the site deploys straight from `main`, and
a committed copy of the game carrying a test hook would be served at runthe.gg.
