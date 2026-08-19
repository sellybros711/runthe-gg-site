# Tests

```
node football/build/test/test_scorelines.mjs
node football/build/test/test_game_scripts.mjs
node football/build/test/test_drives.mjs
node football/build/test/test_credits.mjs
node football/build/test/test_defense.mjs

(nohup node cfb/build/test/gzip_server.mjs &)
node football/build/test/test_bracket.mjs
BROWSER=1 node football/build/test/test_defense.mjs
BROWSER=1 node football/build/test/test_credits.mjs
```

The first five need no database, no browser and no network. They read
`data/display_calibration.json` and play games through the real engine. The last three
drive the page in Chromium and need a server, which is why they are listed apart.
`test_defense.mjs` and `test_credits.mjs` appear in both lists on purpose: their arithmetic
halves run anywhere, and `BROWSER=1` adds a rendered half on top.

| File | What it proves |
|---|---|
| `test_scorelines.mjs` | That the scores on screen are scores the NFL has actually produced, and that changing how a scoreline is rendered cannot change who won. |
| `test_game_scripts.mjs` | That a finished game reads like a real one: when the points land across the four quarters, how often the lead changes hands, and that a tie goes to overtime under the playoff rules. |
| `test_drives.mjs` | Who has the ball and when it changes hands, including the coin toss and the second half kickoff. |
| `test_credits.mjs` | That the name on a playoff touchdown is a name the roster earned: credit follows what a man actually is and how he played, a defense's takeaways fit the men who made them, and none of it touches the stream the season is played out of. |
| `test_bracket.mjs` | That the postseason field is a real fourteen team bracket at every seeding, and that what it draws about your own run agrees with what the run recorded. |
| `test_defense.mjs` | That the defense draft is the same game from the other side: a $30M defender buys what a $30M receiver buys, the draft moves the scoreboard as much, a defensive season is as winnable, every scheme can be drafted for on purpose, and the formation on the field fits in its box at every width. |

## Names on the plays, and why only in the postseason

`E.touchdownCredits` puts one of your six on every touchdown the broadcast calls, and
`E.takeawayScript` does the same job for the defense draft, where your offense is the league's and
the men you drafted only appear going the other way. Both are drawn rather than simulated,
on the same bargain the scoring script already makes: the game was settled in fantasy space
long before either runs, and the only question left is which legal version of it to show.

They run on the two screens a game is WATCHED on, the playoff broadcast and the Challenge
Bowl, and nowhere else. That is a decision about what the screens are, not a limit on the
code. Those two have a running clock, a call banner and (in the postseason) a drive chart,
and are paced to be looked at. A regular season week is a score that flashes past in about
half a second on the way to sixteen more, and a line of commentary under it is something to
read rather than something to watch. This shipped to the season screen at first and it was
wrong: it turned a fast, skimmable season into a wall of text. `gameCredits` returns null for
a non-playoff result, so the box score for a regular week is exactly what it always was.

The Bowl differs from the postseason in two ways that are worth knowing. BOTH TEAMS GET
NAMES, because a person drafted each side: a season's opponent is a historic team modelled as
a team rather than as players, so there only your six can be named, and `opts.team` on
`touchdownCredits` is what the Bowl uses for the other half. And it has no per-man box score
behind it, because `resolveHeadToHead` resolves to two team totals rather than six samples a
side, so `bowlMen` sets each man's `pts` equal to his `avg`: form of exactly 1 for everybody,
which is the honest reading of a game that never sampled them individually. Credit there
follows what a man IS rather than how he played that day.

`bowlMen` also filters to QB, RB, WR and TE, and that is a guard rather than tidiness. A
defender carries `rush_ppg` too and it means his PASS RUSH, while the credit weight adds
rushing to receiving, so a defensive roster reaching that screen would hand touchdowns to
defensive ends on the strength of their sack numbers. Two assertions cover it, and one of
them deliberately runs a defence through the credits WITHOUT the filter to show the danger is
real rather than theoretical.

Two things in here are load-bearing and neither is obvious.

The first is the RNG, and it is the one that would cost real runs. Every game in a season
comes out of one sequential stream, so a draw taken from it to pick a scorer consumes a
value the next week depends on and silently rewrites the rest of the year. Nothing throws.
The leaderboard just stops agreeing with itself and every run recorded before the change
becomes unreproducible, which is the same failure `toFootballScore` shipped once and the
reason that one is asserted to draw exactly one value on each of its paths. The credits are
seeded off the finished game instead, and the first assertion in `test_credits.mjs` plays
fifty seasons with the blurbs being built between the weeks and demands the results come out
identical to the same seasons played without them.

The second is that the attribution has to be about the man. A name on the wrong kind of play
is worse than no name: it tells a player their nose tackle leads the team in interceptions
while the box score beside it says he rushed the passer all year. That was not hypothetical.
Reading a defender's coverage and pass rush columns alone looked principled, but the cheap
end of the pool is tackle-led and carries about zero in both, so every drafted defender fell
through to one shared tackle-derived fraction and the defensive ends picked off as many
passes as the safeties, at an identical 58%. The position is the prior now and the columns
adjust it, which is what `POS_INTERCEPTION_SHARE` is; a J.J. Watt lands near 17%
interceptions and an Ed Reed near 90%, and a roster with nothing in either column still
splits on what its men are. Four assertions cover that, including the thin-line case
specifically, because that is the one that regressed silently.

The blurbs are also copy, so they are held to the copy rules. `test_credits.mjs` checks its
own output for dashes, which `scripts/check-dashes.mjs` cannot do because it reads source
files and these sentences are assembled at runtime. It also checks the phrasing bands: a
goal-line verb on a fifty yard run reads as broken rather than as random.

## The field goal distance, and the picture above it

The log calls a kick at its distance, and that distance is READ OFF THE DRIVE rather than
drawn beside it. The chart sits directly above the log and has already decided where the
drive stalled, so an independent draw would put a 20 yard kick under a bar that stops at
midfield: both plausible, visibly disagreeing, and the chart is what a player is watching
while the call is up. The kick is the seven yards back to the holder plus the ten of the end
zone, which is where the real arithmetic comes from too.

Deriving it that way exposed something `generateDrives` had always had wrong. It picked the
yard line a field goal drive ended on directly and evenly, between the opponent's 23 and 40.
That drew a tidy picture and nothing ever read it back, so nothing ever noticed: as
distances it is a median 48 yard kick with 41% of them from fifty or longer, against a real
median near 38 and 15 to 20%, and a drive essentially never reached the 20. It draws the
DISTANCE first now and puts the end of the bar where that lands.

`E.fieldGoalDistances` survives as the fallback and is not dead code. A score landing within
five seconds of the next one is resolved without a drive being drawn for it at all, and
those kicks still have to say something. One assertion checks that path is still reachable,
so if it ever stops being reachable the fallback goes rather than quietly rotting.

The browser half is what actually proves the claim. Everything else here reasons about
`d.endYard`, which is an argument about the code: both the call and the chart are supposed to
come from that one number. The `BROWSER=1` half draws the chart as it ships, reads the bar
off the canvas, converts where it stops back into a kick and checks the game would have
called that number, at six distances and on both sides of the ball. It lands within about a
yard every time, and the yard is the arrow tip at the leading edge, which is part of what a
player sees as the end of the drive.

It also pins the boundary the whole thing turns on. "The chart draws `endYard`" is only true
of a FINISHED drive; the renderer interpolates one that is still running, and the call lands
exactly on that boundary. Measured halfway through, the same drive reads as a 54 yard kick
and at the call it reads 30. If that ever moved by a frame the bar and the number under it
would part company, and no assertion about the data would see it.

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

## The two numbers the results screen makes a claim with

Team overall and the typical record are the only things on that page that are a claim about
the game rather than a report of it, and on a defense both were computed as though six
defenders were an offense.

The overall is points times chemistry times shape. On offense that runs about 3 to 95, which
is why the number doubles as its own percentage and why the bands sit at 75 and 50. IDP
scoring is a smaller currency: the identical product on a defense tops out at 55.4, so a
perfectly drafted defense could never reach the green band and the best one the pool can
build was shown as a red 49. It is not only cosmetic. `weeklyEdgeVs`, `seedFromRecord`,
`playoffShare` and `finalEdge` all read the overall against constants calibrated on the
offense's range, so a top defense got no class edge, no elite seeding path and the title
game's full penalty. `E.defenseOverall` maps it onto the offense's scale through the fifth
and ninety-fifth percentiles of 6,000 drafted rosters a side, which lands a greedy defense
at 79.9 against a greedy offense's 78.2.

The typical record came out of `playRun`, which resolved a defensive roster through
`resolveGame`. The same six defenders project 10.24 wins as a defense and 1.48 as an
offense, and 1.48 is the 2-15 that was being printed under a season that finished 10-7.

Both are asserted here, and the second one as a difference rather than as a tuned range: the
claim is that the projection plays the mode.

## The scoreboard row

The How close table also prints what each roster does to the SCOREBOARD rather than to a
fantasy total: points scored a game on a draft, points allowed a game on a defense, yours
against the best you could have had. Only the side of the ball you drafted, because on a defense your offense is the league's average and on an offense your defense is not yours either,
so the other half is a number no different pick could have moved.

The subtle part is the RNG. `toFootballScore` turns the engine's continuous score into a
scoreline the NFL has really produced, and it draws a value. Drawing that from the season's
own stream would consume numbers the next game depends on and silently rewrite every later
week, which is the failure mode the section below this one is about. The scores get a second
seeded stream, and the first assertion here is that the records did not move because of it.

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
`test_defense.mjs` on the defense draft's gate, draft, formation and season. The engine is covered
thoroughly. The page is covered on those screens and nowhere else, so a green run says
nothing about a normal draft, the season screen, the results card or the leaderboard, and
nothing at all about the offensive formation. The college game has a real browser suite
under `cfb/build/test/` if you want the shape of one.

## The defense draft is finished and gated

It lives on the FRONT PAGE now, not in the mode menu. The single Start a run button splits
into Offense and Defense for anybody who can play it, and `paintHomeStart` is the only thing
that decides which of the two controls is on screen. The mode was called Lockdown while it
was being built; it is called Defense everywhere a player can see, and the stored `run_mode`
is still `defense`, which it always was.

THE GATE CHANGED SHAPE WITH THE MOVE, and the shape is the decision. There is no greyed-out
Coming Soon card any more: somebody who cannot play it sees the front page exactly as it has
always been, one full-width Start a run, with no sign the other half exists. A padlocked
Defense button on the home screen would advertise an unannounced mode to every visitor,
which a card buried two taps deep in a menu did not.

`DEFENSE_LIVE` is `true` now, and both migrations are applied. It shipped `false` first, and
that was not caution: `ps_runs_run_mode_ck` lists the recordable modes by name, so until
`supabase/80_football_defense_mode.sql` was applied the database rejected every defense run
outright and a player would have got a season that vanished on submit.

The order it went out in, which is the order to repeat for the next mode:

1. run `supabase/80_football_defense_mode.sql`, then
   `supabase/81_football_defense_submit.sql`
2. deploy with names in `DEFENSE_TESTERS`, who get the split on the real database while
   everybody else still sees the one button
3. flip `DEFENSE_LIVE` to `true` and deploy again, which opens it to everybody

Both migrations, not just the first. 80 widens the table's CHECK so a defense row can
exist; `ps_submit_run` is the only thing that writes one and validates the mode and the
slot names again on its own, rejecting `defense` and rejecting `DL`. 81 is that half. A
deploy that lands before 81 does not misfile a run, it loses it: the function raises and
the season is never recorded.

The migrations come first in every version of that plan, testers included: the other
order records nothing and shows a save failure nobody can act on.

`DEFENSE_TESTERS` is a feature flag, not a permission. The list ships in the page, so it
is readable by anybody who opens the console and forgeable by anybody who cares to. That
is fine for hiding an unannounced mode and would not be fine for anything else; the
database is what decides whether a run is recorded and it does not consult the list.

LIVE TO EVERYBODY IS NOT THE SAME AS OPEN TO EVERYBODY. The draft still needs a free
account, because the Defense board lists runs by name and a run with no name on it cannot be
on it. So a signed-out visitor can press Defense and is walled, and for the first day of the
launch that wall was the One Franchise one: it had been written for a single mode and
hard-coded its name, its blurb and where the sign-up lands, so pressing Defense produced a
sheet headed One Franchise explaining thirty-two club leaderboards, and finishing the sign-up
dropped them in the club picker. The Defense half was left spinning behind it too, because
`beginDefenseDraft` downloaded six megabytes of defenders before `beginDraft` said no and
only the failure path put the button right. The copy comes off the mode now, the account
check happens before the download, and four assertions in this suite hold all three of those:
the sheet names Defense and says nothing about a franchise, the button is still pressable,
and the sign-up is recorded as wanting the defense draft.

All three states are covered by `BROWSER=1 node football/build/test/test_defense.mjs`, so
the flip is a one-line change with a test behind it. That half also asserts the mode did not
get COPIED to the front page: a card left behind in the menu would be a second door to the
same draft, reached through different code and gated separately.

Two things there are worth knowing before a failure sends anybody hunting. The front page
already scrolls sideways by about 119px at 390 wide, in both states, with no visible element
wider than the viewport, so something off-screen has been contributing to `scrollWidth`
since before the split existed; the assertion measures the split against the page WITHOUT it
rather than against zero. And the season the suite drafts is not seeded, so it sometimes
makes the playoffs: a run that does stops at seeding and has submitted nothing, so the run
is walked to the end before the submit is read off the wire. Without that the three
assertions about the submit body passed or failed on whether the drafted defense happened to
be any good.

`test_bracket.mjs` writes an instrumented copy of the game to
`football/__test_bracket.html`, drives it, and deletes it. That name is deliberate:
`__test*.html` is in `.gitignore` because the site deploys straight from `main`, and
a committed copy of the game carrying a test hook would be served at runthe.gg.
