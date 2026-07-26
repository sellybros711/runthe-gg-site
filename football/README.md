# The Perfect Season

Spin a wheel, sign six players from six random NFL team-seasons, then play a
20-game season and try to do what the 2007 Patriots couldn't. Lives at
`runthe.gg/football/`.

**Status: playable. Stages 1-7 complete.** The GDD's build order says nothing
reaches the frontend until the sim harness produces sane win rates; it does, see
Calibration below, so the UI is built on top of a validated engine.

> `/football/` previously hosted RunTheDrive, which moved to `/touchdown/`.

## Files

| File | Role |
|---|---|
| `index.html` | The whole game UI, self-contained. Loads the two modules below plus `data/*.json`. |
| `engine.js` | Chemistry resolution, schedule generation, per-game resolution, display scores. Headless, no deps. Browser: `window.PS_ENGINE`; Node: `require`. |
| `run.js` | Draft loop and run state: wheel, re-spins, cap accounting, week-by-week advance. Browser: `window.PS_RUN`. |
| `board.js` | Leaderboard client: submit a finished run, read rank and totals for today, this week and all time. Browser: `window.PS_BOARD`. Optional, fails soft. |
| `auth.js` | Accounts: the site's existing Supabase Auth, wrapped in eight calls. Browser: `window.PS_AUTH`. Optional, fails soft. |
| `og.png` | The 1200x630 share preview. Rendered from `og-source.html`; regenerate by screenshotting that file at 1200x630. |
| `og-source.html` | Source for the share preview. Not served to players, kept beside it so the card cannot drift from the game's palette. |
| `simulator.js` | Validation harness. Run this after any change to data, pricing, or constants. |
| `playtest.js` | Plays one full run as readable text, draft, chemistry, schedule, weekly results, outcome card. The stand-in for the UI. |
| `build/lib.mjs` | Shared build helpers: CSV parsing, cached fetch, franchise normalization. |
| `build/01-players.mjs` | → `data/player_seasons.{json,csv}` |
| `build/02-teams.mjs` | → `data/team_seasons.{json,csv}`, `team_season_rosters.json`, `league_context.json` |
| `build/03-chemistry.mjs` | → `data/battery.json`, `coaches.json`, `curated.json` |
| `build/04-display.mjs` | → `data/display_calibration.json` (football-score transform) |

Rebuild everything:

```sh
node football/build/01-players.mjs
node football/build/02-teams.mjs
node football/build/03-chemistry.mjs
node football/build/04-display.mjs
node football/simulator.js          # then re-validate
```

Downloads cache in `build/.cache/` (gitignored, ~200MB). First run fetches from
nflverse; later runs are offline.

## Data

9,411 eligible player-seasons and 861 team-seasons, 1999-2025. Eligibility is
≥8 regular-season games, below that the weekly variance estimate is noise.

Sources: nflverse `stats_player` (weekly PPR), `players` (college, draft), and
nfldata `games.csv` (scores, head coaches).

Shipped payload is ~3.5MB of JSON, of which chemistry is 224KB.

### The payload trim

`player_seasons.json` carried 23 fields per row and the page read 19 of them. The
other four (`vor`, `draft_round`, `multi_team`, `team_display`) went out with every
copy of the game for nobody: 4,240KB down to 3,490KB raw, and 590KB down to 515KB
over the wire (`gzip` at its default level 6). That is measured, not estimated, and
it is the single largest thing a first visit downloads, so it matters more once this
is in front of a lot of people.

`team_display` was the interesting one. Three call sites used it, all of which
already had the `team_season_id` in hand, so they now read
`DATA.byTeamSeasonId[id].display` from a file that ships one row per team-season
instead of one copy per player-season. `position_percentile` stayed even though it
looks like a build artifact, because the target-conflict chemistry link reads it at
runtime.

The CSVs keep every working column. `writePair()` takes separate column lists for
the JSON and the CSV precisely so trimming the shipped file does not blind the next
person trying to check the pricing by eye in a spreadsheet.

## The one tuning knob

`SCALE` in `engine.js` converts an opponent's real points into roster-fantasy
space. It is the difficulty dial; solve it by simulation, never by guessing:

```sh
node football/simulator.js --sweep
PS_SCALE=2.1 PS_N=4000 node football/simulator.js
```

The GDD called `SCALE` and `league_avg_pts_allowed` "the two dials". They are
not independent, one multiplies your score, the other divides the opponent's,
so league average points allowed is treated as measured data (per season, in
`league_context.json`) rather than a knob.

## Calibration

**`SCALE` is solved against real play through the actual wheel** (`--policies`),
not against synthetic rosters. That distinction is the whole reason it had to be
re-solved. The §9 archetypes build rosters out of the entire 9,411-player pool,
which stopped describing the game the moment a spin started offering a whole team
to choose from. Measured properly, somebody tapping the top row of a best-first
list was winning 13 games having made no decisions at all, which is what "I am
drafting bad teams that go 15-2" turned out to mean.

The cap is **$140M** and `SCALE` is **2.65**. Both moved together; see below for
why neither could move alone.

At those settings, **150 runs per policy**:

| Policy | Spend | FPPG | Shape | Record | Playoffs | Title | 20-0 |
|---|---|---|---|---|---|---|---|
| Cheapest every time | $42M | 22 | x0.51 | 0-17 | 0% | 0% | 0% |
| Best points per dollar | $61M | 44 | x0.92 | 5-12 | 1% | 0% | 0% |
| Random tap | $81M | 51 | x0.73 | 4-13 | 5% | 0% | 0% |
| Taps the top row | $136M | 79 | x0.86 | 12-5 | 54% | 7% | 0.3% |
| Perfect play (DP) | $137M | 84 | x1.02 | 14-3 | 89% | 16% | 0.9% |

Careless play finishes 12-5 with a coin flip at the playoffs; perfect play wins 14
and takes the title about one run in six. Two wins and 35 points of playoff odds
separate them, which is the room skill needs.

**Use 150 runs, not 40.** The spread across drawn team-sets is wide enough that two
40-run samples of identical settings disagreed by 18 points of playoff odds and by
0.08 of average team shape. Both looked authoritative. That is exactly how a bad
calibration gets locked in, so the sample size is part of the method, not a detail.

### Raising the cap, and why it needed the floor term

At $100M a single $40M player ate a tier off everyone else, so a roster was one
star and five bodies. $140M buys two or three: careless play now lands **2.1
players at or above the $27.4M p90 price, against 1.2 before**.

The cap could not be raised on its own. Measured at $140M with the old structure
model, the gap between tapping the top row and perfect play fell from **3 wins and
46 points of playoff odds to 1 win and 1 point**. Once everything is affordable
there is nothing left to decide, and a bigger budget on its own deletes the game.

What restores it is `STRUCTURE.IDEAL_FLOOR_SHARE`. Across 848 real team-seasons the
two weakest of a team's six skill players average **64% of the roster average**
(median), and even the decile most skewed toward one man sits at 0.50. Three stars
plus three minimum-salary bodies comes out at **0.14**. So the extra money has to
buy a whole offense; you can afford the stars now, you still cannot afford to field
nobody alongside them.

Two results worth reading twice. Random tapping fell from 10-7 to **4-13**, because
random picks build broken offenses and the model finally says so. And perfect play
buys **fewer** expensive players than careless play, 1.4 against 2.1, because the
balanced roster is the better one. That is the decision the bigger budget was
supposed to create.

One flag: the re-spin ladder is still $5M, $10M, $15M as specified, which against
$140M is a smaller proportional bite than it was against $100M (3.6% rather than
5% for the first). Worth revisiting if re-spinning starts to feel free.

This deliberately does **not** hit §9's 3-6% perfect-season target. The owner
played it at that setting and found it too easy, and 20-0 reads better as
near-mythical with the title as the reachable goal. Dropping to 1.70 would restore
a 3.5% perfect rate and also hand careless play a 66% playoff rate, which is the
problem this was fixing.

`--record` still prints the older §9 archetype ladder, which is useful for
comparing rungs of roster quality but no longer describes what a player can
actually reach through the wheel. Trust `--policies` for difficulty.

Also validated:

- `--schedule`: spread between the easiest and hardest franchise is **0.20
  z-units across 17 games** (0.012/game), so franchise choice is cosmetic, as
  §7 requires.
- `--chem`: chemistry rises 7.3% → 14.9% from two to six linked players, with
  marginal gains of +3.75/+2.50/+1.07/+0.31 points and no hard cap reached.
- `--draft`: 3,000 drafts under an always-re-spin, always-buy-the-most-expensive
  policy. **Zero over-cap runs, zero dead ends**, correct slot shape in every run,
  no team-season drawn more than twice, and no person drafted twice. It also
  alternates the two re-spin wheels and asserts that each one moved what it was
  meant to move and never handed back the team just rejected. Plus: the daily seed
  is stable within a date, and a run serialized mid-draft resumes on the same RNG
  stream.
- `--record`: the regular-season win distribution per archetype, and what each
  candidate playoff threshold would mean. This is how the 12 and 15 cutoffs were
  chosen.

## Chemistry, and why it needed help

Chemistry as specified almost never happened. A player deliberately maximizing it
on every pick still averaged about +2%, against a +15% ceiling, and `college` was
often the only link that fired. Two causes, one of them a contradiction inside
the GDD itself:

1. Six uniform draws out of 861 team-seasons rarely share a franchise, a college
   or a draft class, and `draft_year` is null for undrafted players, which
   removes that link for them entirely.
2. §5 forbids a team-season repeating in a run, while §6's two biggest links,
   Battery (+10%) and Teammates (+5%), both require two players from the *same*
   team-season.

With a team-season allowed twice and half of spins favoring a connected team, a
player chasing chemistry now averages +4.2% (median +4.3%, top decile +7.8%, best
seen +11.5%) against +2.2% for someone just taking the best player available.
Every link type fires, Battery included, though Battery stays rare on purpose.

### Reading chemistry

Every label names the thing the two players actually share, as a sentence:

| Link | Worth | Reads as |
|---|---|---|
| Battery | +10% | Brady threw Moss 23 touchdowns in 2007 |
| Teammates | +5% | Teammates on the 2007 Patriots |
| Same team, other year | +3% | Both played for the Lions |
| Brothers | +3% | Brothers |
| College | +2% | Both went to Ohio State |
| Draft class | +2% | Both drafted in 2020 |
| Same coach | +2% | Both coached by Bill Belichick |
| Target conflict | -4% | Two receivers who shared one quarterback |

There is no rivalry penalty. It existed at -3% and was cut: being punished for a
pairing you had no way to see coming is not a decision, it is a tax.

An earlier version phrased the same-team link as "Both wore [code] colors" using
a British spelling, which named a three letter code and explained nothing. There
are no British spellings anywhere in this directory.

Every label also names **who** the link is with, which it did not before. A tile
in the draft list reads `+7.3% Palmer, Threw to him`; the chemistry panel reads
`Carson Palmer and Chad Johnson / Palmer threw Johnson 9 touchdowns in 2005`; a
player's own sheet reads `with Johnson`. Saying only what two players share, as in
`+1.5% Boise State`, stated a fact about nobody in particular and left you to work
out which of your six it applied to.

### The connection rail, and why the lines came off the field

Links used to be drawn as chords straight between chips on the field. At four or
five links they crossed each other, passed under the discs, and cut through the
name labels. There is no routing fix for that: the players sit where the formation
puts them, and the shortest path between two of them goes through whatever is in
between.

So connections got their own space. Under the field is an **arc diagram**: every
spot is a node in one row, and every link is an arc hanging below that row. An arc
cannot cross a player, because the players are all on the line and the arcs are all
under it. Arc depth grows with the span it covers, so a long arc sits outside a
short one rather than on top of it. Tap a node to keep only its arcs, which answers
"who is THIS guy tied to" and is a question the old tangle could not answer at all.

The arc band starts below the whole node block (dot, gap, surname) rather than
level with the dots. Level with the dots, a short arc's apex landed on the surname
under the next node: 2 of 5 arcs, measured.

What stays on the field is a **pip** on each shirt: how many players he connects
to, in his strongest link's color. You still watch the web form as you draft, you
just read it somewhere it can breathe.

The rail sizes itself: hidden entirely until two players are signed, since one
player cannot be connected to anybody, then the node row plus exactly as deep as
the deepest arc present. Fixed at its maximum it reserved a blank half-screen on
the first spin, under six dots that could not be joined to anything yet. The
collapse has to be set inline as well as by class, because the inline height the
sizing writes would otherwise beat the class rule.

Colors are unchanged and still carry the strength band: **gold and thick** for a
big link, **green** for a good one, **thin blue** for a small one, **red** for one
that hurts.

### The wheel was not random, and now it is

Reported as the wheel forcing the same team back so you get a chemistry boost, and
that is exactly what it was doing. `run.js` had a `CONNECTION_BIAS` of 0.3: about
three spins in ten drew from a pool restricted to team-seasons connected to somebody
already signed, walking tiers strongest first so the exact team-season you had just
drafted from was the first candidate.

It existed for a real reason. Chemistry as specified could barely happen: six uniform
draws out of 861 team-seasons rarely share a franchise, a college or a draft class,
and the two biggest links in §6, Battery (+10%) and Teammates (+5%), both need two
players off the **same** team-season, which §5's no-repeat rule forbade outright.

**0.3 per spin sounds mild and was not.** Measured over 600 drafts:

| | with the bias | without |
|---|---|---|
| the same franchise came up twice | 87.7% of runs | 38.2% |
| the same exact team-season came up twice | 65.8% of runs | 1.8% |
| most spins one franchise took | 6 of 6 | 4 of 6 |

Two things compounded to get from 0.3 to seven runs in eight. Every signing widens
the connected set, so later spins have far more to hit than early ones. And the tier
walk never actually declined a tier: the line meant to remember the weakest usable
tier as a fallback assigned the pool unconditionally, so once the bias fired the pool
was **always** restricted and `TIER_TAKE` only chose which tier.

So the bias is gone, along with `connectedTiers()` and the three reverse indexes in
`indexData()` that existed only to serve it. The verification is that `spin()` now
lands on the same numbers as six draws taken straight out of the pool with no game
logic involved at all: 38.4% against 41.0% for a franchise, 1.8% against 2.1% for a
team-season, the small gap being the two-draw cap and the affordability filter.

**The cost is real and accepted:**

| | with the bias | without |
|---|---|---|
| average chemistry | +6.3% | +2.1% |
| runs finishing with no chemistry at all | 7% | 35% |
| Battery links in 600 runs | 109 | 3 |
| a normal player's record (`taps the top row`) | 13-4 | 11-6 |
| that player's playoff rate | 59.2% | 47.1% |
| perfect play's title rate | 15.9% | 12.3% |

Chemistry is now a bonus you notice rather than a subsidy every roster collects, and
the game is harder, which is the direction it is meant to go. Note that perfect play's
title rate drifts further below the 20% the difficulty target names: `SCALE` is the
knob if that matters, and it is deliberately untouched here, because moving it would
change every score already on the leaderboard.

Everything downstream still holds. `--draft` passes all invariants over 3,000 runs:
no over-cap runs, no dead ends, no player signed twice, no re-spin landing back on the
team it was paid to leave. Zero chemistry is a state the UI already had words for, on
both the draft rail ("No connections yet") and the results page ("Nobody here ever
played together, so there is no chemistry this run").

**`MAX_DRAWS_PER_TEAM_SEASON` stays at 2, deliberately.** A genuinely random wheel can
repeat, and 1.8% of runs is what that looks like. Forbidding a repeat would make each
draw depend on the ones before it, which is less random rather than more, and it is
the same class of hidden rule that was just removed.

### One draw, not two

The wheels still reveal in two beats, year and then team, but the year is now read
back off the drawn team-season instead of being chosen first. Choosing the year first
made every year equally likely and then split that evenly among the teams in it, so a
team-season in a thin year was likelier than one in a full year.

Measured, that skew is small: 1.03x between the luckiest and unluckiest team-season on
the first spin, 1.07x on a late one, because every year holds 30 to 32 teams and the
affordability filter almost never empties one. Nobody would have felt it. It is fixed
because a wheel that is supposed to be random costs nothing to make exactly random,
and because leaving a known lean in place is how the last one grew.

Both wheels stay honest either way: every face on either of them is a result that was
really reachable.

## Season structure

You always play all 17 games. An earlier build ended the run on the second loss,
which meant most players never saw a final record and never reached the playoffs.
Going undefeated is still the goal, but a finished season gives you a number.

| Regular season | What happens |
|---|---|
| 15 wins or more | Top seed, first round off, 3 games to the title |
| 12 to 14 wins | Wild card, 4 games to the title |
| 11 wins or fewer | Season over |

One playoff loss ends the run, so a perfect season is 17-0 plus three wins, which
is 20-0.

Thresholds come from the measured win distribution (`--record`), not from NFL
precedent. Every player in the pool is an all-time season, so win totals run
high: at a realistic 10-win cutoff even a random roster reached the playoffs 59%
of the time and a good one got the bye 94% of the time, which made both tiers
meaningless. At 12 and 15 the ladder separates properly, and both are still
records a real team would post.

## The draft screen

### What is left, per spot still to fill

Under the money, not across from it, because it is the same fact read a second way and
the two belong together. `$23.3M per open spot, 6 left` before a single spin, moving on
every signing and every re-spin.

Both halves already existed. `remaining()` takes the re-spin fees off the cap, and
`slotsLeft()` counts the spot being drafted right now as open, which is what makes six
empty spots read as `$23.3M` rather than `$28M`. It is **derived in `paintTop()` on
every repaint** rather than tracked and adjusted, so it cannot drift out of step with
the roster: there is no delta to get wrong.

Two ends of the range say what they are instead of printing an average:

- **One spot left** reads `$70.5M for the last spot`. An average of one is not an
  average, it is the whole budget.
- **No spots left** prints nothing. That case cannot be seen anyway, because the sixth
  signing leaves the draft screen, which `v44.mjs` asserts rather than assumes. The
  guard is a belt, not the only thing holding it up.

`v44.mjs` plays a whole draft and checks the printed figure against money divided by
open spots at every step, parsing both off the screen rather than reading the page's own
variables, so a bug cannot agree with the test by sharing one. It also checks a re-spin
moves both numbers, since the fee comes off the budget: `$140.0M / $23.3M` becomes
`$135.0M / $22.5M`.


Your team never leaves the screen. The money bar and a condensed field are one
sticky block at the top, so the field stays visible while you scroll the players.
Below that: the two wheels, four position tabs, then the players as tiles.

### Five tabs: ALL, then the four positions

**ALL is the default**, and it lists the whole squad in position order. Making
somebody tap through four tabs on every one of six spins just to see what a team
has is work, not a decision.

The four position tabs are QB, RB, WR, TE. There used to be a FLEX tab and a
LOCKED tab too, and both were bookkeeping leaking into the UI: FLEX is a spot on
the roster, not a position anybody plays, and LOCKED was a bin for players who no
longer fit anywhere.

Every player now sits under the position he actually played. FLEX survives as a
mechanic, not as a tab: signing a running back when the RB spot is taken but FLEX
is open still puts him at FLEX, the tile says "goes to flex", and the RB tab stays
live as long as either spot is open. Selecting a tab outlines the exact spot a
signing would fill, which is one chip and not both WRs.

Inside a tab, signable players come first best-first, then the ones you cannot
have, grayed at the bottom with the reason. A position with nowhere left to put
anybody keeps its tab, grays out, and drops to the right end of the row. It is
kept rather than removed so the row does not reshuffle under your thumb between
spins.

### Tiles, not rows

Two to a row. Full-width rows had the name, the season, the stat line, the points
and the price all competing for one line, which is why nearly everything was
truncated with an ellipsis. A tile gives each of them a place: position and price
across the top, name at 19px, season and team, the stat line clamped to two lines,
then points, an award badge and the chemistry tag along the bottom. Names clamp to
two lines so one long name cannot make its tile taller than its neighbor and break
the grid.

Position colors: QB red, RB green, WR blue, TE orange, FLEX purple. Wins are
green, losses red.

### Club colors

The franchise picker fills the chosen bubble with that club's own primary, a keel
line of its secondary, and a text color picked for contrast. When the team wheel
lands, its housing washes once and then **holds** the club's colors: the whole box
becomes the primary, bordered in the secondary, with the team name at weight 900 in
the contrast-checked color. Detroit ends up a blue box with thick white type.

Three things had to be right for that to work, and none of them were at first:

- **The colors reverted after half a second.** `.reelbox.team.done .band` is three
  classes deep and `.reelbox.clubbed .band` is two, and specificity beats source
  order, so the navy settled-state came back the moment `done` replaced `hit`. The
  settled rules now stand aside with `:not(.clubbed)`.
- **Filling the band hid the team name completely.** The band is `z-index:3` and the
  strip carrying the text is `z-index:auto`, and because the strip has
  `will-change:transform` it is its own stacking context, so a `z-index` on the
  landed face cannot lift it out past the band. The club color goes on the housing
  instead, behind every child, which sidesteps the problem and reads stronger.
- **The two decoy faces then read as loudly as the winner.** On a dark housing the
  vignette faded them for free; over a saturated club color it cannot, so they are
  faded explicitly and the winner alone sits at full opacity and weight 900.

The 64 hex values are hardcoded in `engine.js` rather than fetched: nflverse ships
a colors table, but a build step and a shipped data file for values that never
change is the wrong trade.

The text color is **computed**, not listed. The first attempt was a hand-written
set of "bright" clubs and it was wrong for six of them, putting dark text on San
Francisco's `#AA0000` at 2.42:1. Taking whichever of white or near-black has the
higher contrast ratio is always right and needs no maintenance. Worst case after
that is the Chargers' `#0080C6` at 4.37:1, which no text color beats since both
options land there; these labels are large and bold, where 3:1 is the bar.

No `color-mix()` anywhere in this: it needs Safari 16.2, and this page has already
been bitten once by shipping something an iPhone quietly ignored. Layering black
over the club color does the same job everywhere.

## The position colors

The complaint was that red read as orange and blue read as purple, and it is
measurable. On the old set QB/TE sat at **deltaE 19.7** and WR/FLEX at **22.9**, both
under the roughly 25 where two colors stop being mistakable at a glance. They are now
**36.7** and **36.9**.

| | Old | New | Label contrast | Luminance | Chroma |
|---|---|---|---|---|---|
| QB | `#ef4444` | `#ff0a3b` | 7.4:1 | 0.229 to 0.218 | 76 to 91 |
| RB | `#22c55e` | `#22c55e` | 4.6:1 | unchanged | unchanged |
| WR | `#3b82f6` | `#0f93ff` | 6.1:1 | 0.235 to 0.282 | 67 to 63 |
| TE | `#f97316` | `#eb9500` | 4.8:1 | 0.325 to 0.392 | 82 to 78 |
| FLEX | `#a855f7` | `#ba22f1` | 8.2:1 | 0.215 to 0.179 | 92 to 109 |

Three things had to be discovered rather than assumed, and each one killed an
approach that looked obviously right:

**Brightening does not fix similarity.** It was the suggested fix and it moves
lightness, not hue, which is what made them similar. The same five hues turned up
still left WR/FLEX at 25.6. The hues had to move: QB toward rose, TE toward gold, WR
toward a truer sky blue, FLEX toward magenta.

**Brightness and separation pull against each other.** Maximising brightness per
color subject to legibility produced pastels, including a pink QB, and collapsed the
worst pair back to 22.9: pushing lightness up desaturates toward white and drags every
hue together. So separation is the objective and legibility is the constraint, which is
the right way round, because separation was the actual complaint. Where luminance did
not go up, chroma did, which is what reads as vivid.

**Requiring both is provably impossible here.** A search demanding every color be at
least as bright as the one it replaces AND keep its white label legible rejected all
**174,960** candidates. There is no such set.

Green is untouched on purpose. It was never confusable with anything, and it is the
one color with no headroom: `#22c55e` sits exactly on the 4.6:1 line its own label
needs, so any brighter green breaks it.

### The label ink, and a wrong turn worth recording

Brightening looked like it must break the white labels. Against the **pure** colors
white manages only 1.7:1 on a bright green and 2.1:1 on a bright blue, so a
per-position ink was built and set to near-black on three of the five.

Sampling the rendered pixels said the opposite. The chips are a gradient into 45%
black and across a pill that small the gradient carries most of the way: a pure
`#33e66e` renders as `#269d51` to `#1b5837`. Against what is actually there, white
measured 7.3:1 to 11.3:1 on all five and the dark ink measured 1.7:1 to 2.6:1. The
per-position ink was deleted.

The bar is **4.6:1**, because that is exactly what the old palette measured at its
worst on the same element. An absolute 4.5 is a bar the old set did not meet on all
five either, so holding only the new one to it would have been a false comparison.

`v40.mjs` samples those pixels on every run and fails if white ever stops being the
better of the two inks. It also refuses to pass on a sample that landed on the page
background: the first version screenshotted each tag separately, which scrolls it into
view first, and a reflow between the scroll and the capture handed back a picture of
the page for the FLEX tag, reporting a very comfortable 16.3:1 against nothing at all.
It now takes one full-page capture and reads each tag at its own coordinates.

### One palette, not three

`posPaint()` is the only place a position gradient is written. Six call sites used to
spell out the same string by hand in four slightly different forms, and the canvas
share card kept its own hardcoded copy of all five hex values, which meant the first
palette change would have shipped a card drawing last month's colors. The card now
resolves them from the stylesheet.

## When nothing is recorded, say why

Reported: an empty board and no rank after finishing a draft. The screenshot was the
whole diagnosis and the code had thrown it away. It read "0 runs played today" rather
than the offline notice, which means **reads were working and writes were not**, and
that is the one failure that looks exactly like a healthy board with nobody on it.

Every call in `board.js` failed soft and silently. They still fail soft, but the
server's own answer is kept now: PostgREST replies to a rejected call with a code and
a message, and that body is the diagnosis. A failed submit shows it on the results
page, under a panel that says plainly that the run was not recorded rather than
showing a rank the run is not part of.

`probe()` answers "is the database set up" **without writing anything**, by sending a
run the function is bound to refuse, 99 regular wins in a 17 game season, and reading
which way it refuses:

| Response | Meaning |
|---|---|
| 400, "regular wins must be 0..17" | The function is there and working |
| 404 `PGRST202` | The SQL was not run, or PostgREST has not reloaded its schema cache |
| 401 or 403 | anon may not execute it, so the grant did not apply |

`v43.mjs` drives all three against a real Postgres that has been broken on purpose,
and checks the probe leaves the table empty.

### The bug in the fix

The branch that says "this run was not recorded" read `WINDOWS` and `cell` above their
own `const` declarations, which is the temporal dead zone, so it threw a
`ReferenceError` every time it ran and the `catch` around `paintRanks()` painted the
generic line instead. **The failure looked exactly like the one it was written to
explain**, and the only reason it did not ship that way is that the test asserted on
the message text and got the shorter of the two.

## The mark

A helmet built from four interlocking puzzle pieces with a facemask, supplied as a 3D
render. Source kept as `logo-source.png`, the transparent 1024 original.

**The pieces interlock.** Measured seam by seam off the rendered pixels, three of the four
are a clean tab-and-socket pair:

| seam | one side | the other | apart along the seam | depths differ by |
|---|---|---|---|---|
| red / blue | TAB 75px | SOCKET 77px | 4px | 2px |
| red / green | SOCKET 88px | TAB 91px | 4px | 3px |
| green / orange | SOCKET 80px | TAB 85px | 1px | 5px |
| blue / orange | straight | straight | no knob at all | |

Two earlier versions did not get there. The first had two tabs facing each other on one
seam with no socket for either. The second had every seam individually well formed but the
two seams around the red piece disagreed about where it was by 105px, so it could not be
inserted. This one is assembled and every knob has a home.

The blue-to-orange seam is a straight cut with no interlock, which makes it the one edge out
of four that does not read as a joint. It is a cosmetic inconsistency rather than an
impossibility, invisible at icon size, and not worth another render on its own.

### It ships as two pictures

Measured rather than preferred. Rendered on the game's own background at every size it gets
used at, the full mark now holds down to about 44px, which is better than the previous
version's 64 because dropping the speed lines and the floating piece made the composition
tighter. Below that the facemask is the first thing to go to smudge.

| where | which |
|---|---|
| favicon 16 and 32 | the **four pieces only**, facemask dropped |
| favicon 48, apple-touch-icon 180, manifest 192 and 512 | the full mark on the `#111827` plate |
| maskable 512 | the full mark at 66%, so Android's crop to the middle 80% keeps all of it |
| the share card | the full mark at 214px, top right |

The pieces alone still read as an interlocking 2x2 at 32px and keep their structure at 16,
and they are the distinctive half of the mark, so the two are recognizably one brand.
Checked under a circular mask for the maskable one.

`v49.mjs` asserts that every file the page and the manifest point at exists and is the pixel
size it claims, because a 404 or a mismatched icon is invisible in the markup and only shows
up on a real home screen. It checks the share card is cache-busted without pinning the
number, since the card is re-rendered whenever the logo or the palette moves.

The baked drop shadow is a non-issue here: it disappears against `#080b14`.

**Two measurement mistakes worth recording**, both of which produced confident wrong
answers about the seams before being caught by looking at the picture:

- Classifying a pixel as the first palette color within a threshold rather than the
  nearest one. A dark anti-aliased orange edge like `#8a4010` sits 85 from red on its
  widest channel, so phantom red pixels appeared 250px below the red piece and the
  detector reported a socket on both sides of a seam.
- Testing an edge for departures from its own baseline without bounding the window. A
  quarter-disc's outer arc is a far bigger departure than any knob, so the arc was
  repeatedly reported as a seam feature.

## Not built yet

Everything in the GDD's build sequence is done. The leaderboard and accounts are both
live, and the launch pass above is applied.

**Three things are one switch, and it is the owner's to throw.** The page carries
`<meta name="robots" content="noindex">`, is absent from `sitemap.xml`, and is not linked
from the homepage. All the metadata a search result needs is in place behind that switch,
so going public is: delete the noindex line, add a `<url>` block for
`https://runthe.gg/football/` to the root sitemap with `football/og.png` as its image, and
add the homepage tile. The last two touch the root site, which is why they are not done
here.

Known gaps worth a look during playtesting:

- **Often only one option per spin.** With 8-game eligibility many team-seasons
  have a single qualifying QB or TE, so some spins present no real choice. The
  wheel is working as §5 specifies; whether it is *fun* is a feel judgement.
- **No mid-run persistence.** The run state is built to serialize (that is
  asserted in `--draft`) but the page does not yet write it to localStorage, so a
  refresh mid-season loses the run. Use the key prefix `rtps:` when adding it,
  `rtd:v1` belongs to RunTheDrive on the same origin.
- **Two SQL files have to be run once** in the SQL editor, in order:
  `supabase/50_football_perfect_season.sql`, then `supabase/51_football_accounts.sql`.
  Until 50 is run the board reports itself unreachable, which is handled, but no run is
  recorded. Until 51 is run the board works and every row reads Anonymous.
- **Awards and Pro Bowl selections are not in.** Waiting on the data as
  `season, player name, team, award`. Team is required: there are 19 name-plus-season
  collisions in the player file, and every unmatched row will be reported rather than
  dropped.
