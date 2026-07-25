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

### Getting the strong links to fire at all

Connection tiers had to be separated rather than pooled. A flat "anything
connected" set is dominated by college and draft-class matches, because there are
hundreds of those and only a handful of team-seasons you have signed from. Pooled,
the strongest links stayed as rare as with no bias at all: across six test drafts
every link came back in the weakest band, so coloring by strength had nothing to
show. Tiered, with `TIER_TAKE` deciding whether to stop at each tier:

| `CONNECTION_BIAS` | Best-player chemistry | Chasing it | Gap | Drafts with 2+ colors |
|---|---|---|---|---|
| 0.20 | 4.3% | 5.6% | 1.3 | 56% |
| **0.30** | **4.9%** | **6.8%** | **1.8** | **64%** |
| 0.40 | 6.2% | 7.8% | 1.6 | 70% |
| 0.50 | 7.8% | 9.1% | 1.3 | 80% |

0.30 gives the widest gap between playing for chemistry and ignoring it, which is
the number that matters: the mechanic should be a decision, not a gift. Note the
gap is inherently modest, because franchise, college and draft links attach to the
*team*, so once the wheel hands you a connected team you get the link whoever you
sign. Battery is the one link that is genuinely a player-level choice.

Around 64% of runs now see one team-season come up twice, which is the mechanism
that makes Teammates and Battery possible at all. Two draws per team-season is the
hard cap.

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

## Type

| Variable | Face | Used for |
|---|---|---|
| `--fd` | Big Shoulders Display | Headlines, records, player names, the reels |
| `--fn` | Oswald | Prices, points, tabs, position chips, small labels |
| `--fb` | Chivo | Reading text |

Anton and Archivo were the default free pairing you see on every side project,
which is exactly why they read as generic. Everything goes through the three
variables above, so this is one place to change rather than 47.

The split between `--fd` and `--fn` is not decorative. Big Shoulders is extremely
narrow: excellent at 19px and above, muddy below about 15px, which is where every
price and points figure lives. Oswald is condensed too but has proper numerals and
a lower x-height, so it stays legible small. Fallbacks stay in all three stacks so
a blocked font request degrades instead of reflowing into something else.

## The field

Laid out by the **positions you signed**, not by slot order. Draft a running back
into the flex spot and he joins the backfield rather than standing where a slot
receiver would:

- Two running backs sit either side of the quarterback and still behind him. The
  first one slides across to make room.
- A third receiver moves inside as a slot man.
- A second tight end lines up on the opposite side.
- An empty spot still holds the shape its own position implies, so the formation
  never looks lopsided mid-draft.

Two coordinates are the way they are because of label geometry, not aesthetics. A
**lone** back is offset rather than centered behind the quarterback: dead center,
his disc lands on top of the quarterback's own name and year, because the gap is
26% of a 180px field, about 47px, while a chip's label block runs 41px below its
center. And the inside row sits at 70 and 30 rather than 75 and 25, because a name
label is wider than its chip (78px against 62px, so long surnames fit) which left
the outside receivers' labels lapping 2px onto the tight end and flex discs.

Both were found by measurement, not by looking: a browser sweep walks 49 formations
across 7 different draft orders and asserts that no chip label overlaps another
chip's disc or label. It caught both, and it is the check to re-run after touching
any of these numbers.

Chips and lines are built once and then **moved**, never rebuilt, so a signing
visibly slides the formation into its new shape. Both run off one animation loop
rather than a CSS transition, because SVG line endpoints are attributes and cannot
be transitioned in CSS; sharing a clock keeps the lines attached to the chips while
everything is in motion. A field's first paint snaps into place, since there is
nothing to move from.

## Player tiles

```
┌──────────────────────┐
│ [WR]          $34.0M │
│ Dez Bryant           │
│ 2012 Cowboys         │
│ 90 rec, 1,371 yds,   │
│ 12 TD                │
│ [3rd in receiving TDs]│
│ 18.7 FPPG            │
│ [+2.0% Both Cowboys] │
└──────────────────────┘
```

Badges are **derived from that season's real numbers**, never from award ballots.
nflverse ships no awards feed, so MVP and All-Pro would have to be a hand written
list, and a wrong award on a shipped player card is worse than no award. What is
shown instead is checkable against the stat line printed beside it: where the
player finished in the league that year (`Led the NFL in passing yards`, `3rd in
receiving TDs`) and round-number milestones a fan recognizes (`2,000 yard season`,
`100 catches`, `40 TD passes`). Adding real award winners would mean sourcing them
separately, and it is the one thing here that cannot come from the stats.

## Two wheels, and why spots are not locked to a spin

The wheel is two wheels. The **year** lands first, then the **team** from that
year. Every face on either wheel is a result you could really have landed on:
the year comes from the years actually left in the pool, and the team from that
year's teams in the same pool.

Each reel is a window **three faces tall** with only the middle one lit, so you
watch results go past rather than one value swapping for another. Motion runs off
`requestAnimationFrame`, not a CSS transition, for two reasons:

- The blur has to track the strip's real speed frame by frame, which a transition
  cannot report. It smears at full tilt and is sharp when it stops.
- The old version handed completion to `transitionend` with a `setTimeout` as a
  backstop. Owning the clock means the reel always reaches its end and always
  calls back.

The easing is a long glide with a small overshoot at 82% that settles back onto
the face, and it is exactly zero at t=1, so the reel cannot stop off-center. No
two faces in a row may read the same value, and no decoy may sit directly under
the result: without that the strip looks stuck rather than spinning, and the face
under the winner reads as a glitch. The live reel glows in its own color, red for
year and blue for team, the other sits dimmed with a question mark on it, and
landing flashes the band and kicks the face. There is a 260ms beat between the
two reels or they read as one long spin.

## Cache busting, and the bug that made it necessary

`engine.js` and `run.js` are versioned in two places that have to agree: the
`?v=` on the script tags in `index.html`, and `API_VERSION` inside each file,
checked against `NEED_VERSION` at boot.

This exists because the script tags sat at `?v=2` for weeks while `run.js` kept
changing. A phone that had played before held a months-old `run.js` behind a
current `index.html`. The draw had no `board` on it, so the draft screen threw
`draw.board is not iterable` right after the wheels landed and the game sat there
with no players and nothing to tap. Nothing on screen said anything was wrong.

Three things now stop that:

1. **Bump the `?v=` on both script tags and `API_VERSION` in both files together,
   every time either file changes shape.**
2. On a mismatch the page reloads itself once with a `?fresh=` query to shake the
   cache, then, if it still disagrees, says it is running an old copy. One retry
   only, so it can never become a reload loop.
3. A `window.error` handler puts any unhandled error on screen. A silent throw
   mid-draft is indistinguishable from the game being broken for no reason, which
   is how this went unreported for as long as it did.

The two constants are named `ENGINE_API_VERSION` and `RUN_API_VERSION`, not
`API_VERSION`, because these are plain scripts sharing one global scope in the
browser: two top-level `const API_VERSION` declarations collide and the second
file fails to parse entirely. That happened on the first attempt, and the boot
check above is what reported it.

Spots are no longer assigned to a spin. The GDD locked the slot before each spin
(§2) so positional need would not be random, but the cost was that most spins
were not a decision at all. Measured across all 861 team-seasons:

| Spot | Mean options | Median | Exactly one |
|---|---|---|---|
| QB | 1.1 | 1 | **86%** |
| TE | 2.2 | 2 | 14% |
| RB | 3.0 | 3 | 2% |
| WR | 4.6 | 5 | 0% |
| FLEX | 9.8 | 10 | 0% |

A team carries one starting quarterback, so a slot-locked QB spin can never be a
choice. FLEX already showed the fix, since it accepts three positions and
averages nearly ten options.

So every spin now offers the whole roster and you pick which empty spot to fill.
Measured in the browser over 18 spins: **median 10 options, up to 18**, against a
median of 1 at QB before. A signing goes to its own position's spot if that is
still open, otherwise to FLEX.

The GDD's "unlucky, not unfair" concern still holds, and holds better than it did:
you can always fill something, so a bad draw costs you value rather than
stranding you with one player to take.

## Draft rules as settled

- **Re-spins are one lever per wheel, and the fee comes out of the $140M cap.**
  *New team* keeps the year and lands on a different team in it. *New year* moves
  to a different year and takes whatever team comes up there. Both cost the same,
  so you pick the wheel by what you want to change rather than by what is cheaper.
- **The price is a ladder: $5M, then $10M, then $15M**, by how many you have taken
  rather than by which wheel you spin. Three maximum, so the ceiling is $30M, the
  same as the old two-at-$15M. It used to be one flat $15M for the whole
  team-season: at that price the first re-spin already cost a tier of player, so
  nobody touched it and the second one may as well not have existed. Starting at
  $5M makes the first an easy call and the third something you have to want.
- **A re-spin cannot hand you back what you just rejected.** A team-season may be
  drawn twice in a run, so without an explicit exclusion a $5M re-spin could
  return the same team: 132 times in 3,000 test runs before it was blocked.
- **Whether a wheel has anywhere else to land is checked before it is offered,
  with the fee already deducted.** Keeping the year is no use if that year holds
  only the team you are looking at, and paying $5M can itself push team-seasons out
  of reach. Checking against the pre-fee budget approved re-spins whose constraint
  was then impossible to honor, and the wrong wheel moved: 2 in 3,000 runs, rare
  and still wrong. Both are asserted by `--draft`.
- A re-spin is **blocked** if it would leave less than $3M per unfilled slot.
  §5 wants the reserve floor to be a passive warning on *signings*, bankrupting
  yourself is a lesson the game may teach, but a re-spin that makes the draft
  unfinishable is a dead end, not a lesson. With three re-spins now reachable it
  does real work: `--draft` refuses 6,844 re-spins on this rule across 3,000
  always-re-spin runs, against 3,864 refused for running out.
- An **unaffordable draw re-rolls free and does not consume the team-season**.
  Charging you, or shrinking the visible pool, for a draw you could never use
  would be punishing randomness.
- **A team-season can come up twice in a run, never more.** This is what makes
  the Battery and Teammates links reachable at all. See the chemistry note below.
- **One man, one spot.** A team-season repeating means his teammates come back
  around, and any franchise you have signed from is favored for later spins, so
  his other years keep reappearing too. Measured over 1,800 spins of top-row
  drafting, the best row on the board was somebody already on the roster 15.5% of
  the time, so two Tom Bradys in one huddle was not a corner case. Blocked by
  `player_id`, not by player-season, and `--draft` asserts it over 3,000 runs.
  Balance did not move: perfect play still wins 14 with a 93% playoff rate, which
  says duplicates were a realism problem rather than an exploit.
- **A player you cannot sign is grayed out, not hidden.** The board used to be
  filtered down to what you could afford and fit, so a team's best player was
  simply absent and it read as missing data. Every player the team had is listed
  now, in true points order, with the reason he is out: already on your roster,
  no spot left for his position, or more than you have left to spend. Roughly 13%
  of spins have to say "already on your roster" about somebody, and that is
  exactly the case that used to look like a gap in the list. Players whose
  position has no open spot left have no tab to sit under, so they collect in a
  LOCKED tab at the end.
- **About half of spins after the first favor a team-season connected to
  somebody already signed** (`CONNECTION_BIAS` in `run.js`), so chemistry is
  something you watch build rather than something you rarely luck into.
- **Division games are spread across the season.** The NFL formula produces
  rivals as adjacent pairs, which used to put all six division games in weeks 1
  through 6 and nothing but strangers after that. The order is now shuffled under
  constraints: the two meetings with any opponent sit at least 4 weeks apart, at
  most 2 division games fall in the first four weeks, and at least one lands in
  the closing stretch. Measured over 400 schedules, division games run 31 to 37%
  per week through week 14 and rise to 45 to 47% in weeks 16 and 17, which is how
  real schedules feel. Zero schedules now stack all six early.
- **Division rivals are drawn once and played twice.** You get a home and away
  game against the *same* team-season, the 2007 Patriots twice, not the 2007 and
  2001 Patriots. Their strength therefore counts twice in normalization, which is
  correct: a brutal rival really is two hard games.

## Where this departs from the GDD

Each of these is a measured failure of the spec as written, not a preference.
Details are in the header comment of the file named.

| § | Spec said | Why it changed | Where |
|---|---|---|---|
| 4 | Price on percentile within position+season | Decoupled price from payoff: punting TE was always right, and the best QB of a weak era cost the same as a great one | `build/01-players.mjs` |
| 6 | Sum links, 1-3 full value, 4+ half, clamp +15% | The clamp binds at three same-team players, so the half-value rule never fires and slots 4-6 have no incentive | `engine.js` CHEMISTRY |
| 6 | Export all links as an adjacency file | Several million pairs / >100MB on a static site to answer a 15-pair question | `build/03-chemistry.mjs` |
| 6 | Manual ~1,100-row coach table | `games.csv` already has head coach for every game, no gaps | `build/03-chemistry.mjs` |
| 7 | `defense_modifier = league_avg / opp_allowed` | Inverted, made the 2000 Ravens the easiest matchup in the game | `engine.js` `resolveGame` |
| 7 | "2 same-place finishers" | No standings exist; nothing to finish in front of | `engine.js` `opponentFranchises` |
| 9 | 3-6% perfect **and** median exit week 7-9 | Mutually exclusive while a run can end early: median games survived is ln(0.5)/ln(p). Moot now that all 17 are always played | `engine.js` |

## Contracts that must not break

1. **Never join on a raw team abbreviation.** The two sources disagree
   inconsistently: `stats_player` uses era codes for 1999-2002 and current codes
   from 2003 on (Tomlinson's 2006 is `LAC`, Moss's 2005 is `LV`), while
   `games.csv` uses era codes throughout. Everything normalizes to
   `franchise_id` on ingest. A naive join loses whole franchises silently.
2. **The CSV parser stays quote-aware.** `headshot_url` contains
   `f_auto,q_auto`; `split(',')` shifts every later column and yields wrong
   numbers rather than an error.
3. **Chemistry multiplies the squad score, never individual output**, so it
   cannot cascade through the sim.
4. **`gameLogic.js` at the repo root is RunThePitch's and is loaded live by
   `/soccer/`.** The seeded RNG here is a deliberate copy. Do not refactor the
   two into a shared module.
5. **Re-run `simulator.js` after any data or constant change.** Pricing, the
   cap, and the chemistry curve all move the calibration.

## Display scores

The sim resolves games in fantasy-point space, where your score averages 73.5 (sd
21.0) and an opponent's 43.1 (sd 20.5). Those are not football scores, and §7 wants
the death card to read *"Lost 27-24 at Indianapolis"*.

`toFootballScore` maps the internal margin onto the **real** distribution of NFL
margins (6,967 games, 1999-2025), draws a real total conditioned on that margin,
and splits it. Verified over 60,000 games: **winner preserved in every one**, no
impossible scores, displayed median margin 7 against a real 8 and mean total 44.4
against ~43. It is presentation only, the internal numbers are kept on every
result and nothing downstream reads the displayed pair.

A single divisor cannot do this. The gap between those two means is what carries
win probability, so scaling both sides down renders every week a blowout.

**Value-hunting is a trap, and the UI says so.** The price curve is convex, so
points-per-dollar is always best at the cheap end; `playtest.js` uses that policy
and finishes with $40M unspent. The draft screen keeps remaining budget at the top
and warns when you are about to walk into the last slot with money to burn.

## The results page

Answers four questions in order, because the first build answered them in no
order at all: it opened with the record, then dropped twenty un-collapsed game
rows, then a wall of comparison numbers, and never showed the roster you drafted.

1. **What was my record.** The big number, plus the regular season and the
   playoffs split out so a 15-4 line adds up in your head, plus the seed.
2. **How did the team play.** Points a game, points allowed, difference and
   longest win streak, taken from the scores you were actually shown rather than
   from fantasy totals. Under that, one line for the squad: FPPG, chemistry,
   money spent, team shape.
3. **Who was on it.** The field with its chemistry lines, then a row per spot with
   the season, team, real stat line, FPPG and price.
4. **How close to perfect.** One percentage with a bar, then the spot-by-spot
   reveal below it. The old page opened with six comparison rows and left you to
   add them up.

The schedule is last and shut, in a dropdown, because it is the part you go
looking for rather than the part you need.

Every grid list on the site now uses `minmax(0,1fr)` and `min-width:0` on its
rows. A grid item's default minimum width is its content, so a long stat line
made the whole page scroll sideways: 71px on the results page and 129px on the
draft screen, which had been shipping that way.

### The post-run reveal

Shows the full six-spot lineup, every spot, with your pick above the best pick and
the gap between them, plus both totals. An earlier version listed only the spots
where you lost points and named just the replacement, which gave you a number
without telling you who to drop or what to do differently.

It is a joint optimization rather than six separate comparisons, because the two
things that make a draft hard are cumulative: money spent early is gone later, and
the spot a player fills closes that spot for everyone after him. A DP over (draw,
spot, money) across all 64 spot combinations solves them together, so it can tell
you to take the quarterback off a team you took a receiver from and re-spend the
difference somewhere else. A hill climb then re-checks the answer with chemistry
and roster shape included, since both depend on the whole roster at once and
cannot be folded into the DP. Solves in about 20ms.

**The objective has to be exactly what the season rewards.** When the structure
multiplier was added, the optimizer was still scoring points times chemistry, so
"best" left shape out and could hand back a lineup that genuinely wins fewer
games than the one you drafted. One test run read YOURS 15-2, BEST 14-3, which is
nonsense on its face. Two fixes: shape is in the objective, and the hill climb
also starts from **your own lineup** and keeps whichever start ends higher, since
a climb that only swaps within a spot can otherwise settle below you. Verified
over 50 mixed drafts at 600 replays each: zero cases where the best team scored
below yours, zero shares above 100%, zero inverted records.

It then reports **how each team would actually have done**, not just a points
total. Both your team and the best team are replayed many times against your real
17 opponents, and the table shows the record you would usually post plus how often
the season ends each way:

|  | Yours | Best |
|---|---|---|
| Typical record | 3-14 | 15-2 |
| Money spent | $37.6M | $98.6M |
| Makes the playoffs | 0% | 100% |
| Wins the title | 0% | 33% |

Many replays rather than one, because a single season is mostly luck: a strong
team misses the playoffs often enough that one sample would mislead. Both
projections take about 30ms.

The table used to carry seven rows including a points total. The points row was
cut because it clashed: the stats block above reports raw squad FPPG, while the
optimizer's figure is after chemistry and shape, so the same label showed two
different numbers on one page. The ratio between them is already the headline
percentage, so the row was spent on money instead, which nothing else compares.

A spot can show a **negative** delta, and that is the optimizer working rather
than a bug. Taking a cheaper, worse quarterback to free $8M for a much bigger
gain at receiver is often correct, which is exactly the cascade that made the old
per-spot comparison meaningless.

The honest limit, stated in the UI rather than glossed over: it holds your six
drawn **teams** fixed. It cannot know what the wheel would have shown after a
different pick, because the wheel reacts to who you have already signed.

## Sharing

Two lines and a link:

```
The Perfect Season: 12-6. Out in the Wild Card.
https://runthe.gg/football
```

The old text pasted a 17-character `LLLWLLLLLWLLWWWWL` grid and the whole roster,
which nobody reads, and the bare `runthe.gg/football` did not become a tappable link
in most apps. The scheme is what makes it one.

Everything else moved to a **card drawn on a canvas** at 1080x1350, attached to the
share sheet as a PNG when `navigator.canShare({files})` allows it, and offered as a
download when it does not. Portrait 4:5 because that is what survives being posted
anywhere: the tall limit on most feeds, still readable as a thumbnail in a message.

On it: the record at 250px, how the season ended, the six players with position
chips and the year and club they came from, chemistry, spend, and one line saying
what the game is for whoever has not played it. The background is washed with the
club's primary and keeled with its secondary, so two people who posted the same
record still get cards that look like their own team.

**Every vertical position is a named constant in `CARD`, not an accumulator.** The
first version added up as it went and the footer printed straight through the stats
row. With the anchors written down, a six-row card always lands the same. Two
measured facts are baked into them: the record is 250px type and Big Shoulders has a
cap height near 0.73 of that, so its glyphs reach 182px above their own baseline,
which is what put them through the tagline at first.

The share test scans the rendered PNG for rows containing ink and asserts the blocks
are separated. Its first version used a brightness threshold tuned to the white text
and silently ignored the 55%-white title and 42%-white tagline, which were the pair
actually colliding, so the threshold is deliberately low.

## Picking a favorite team

The feedback was that choosing a team looked pointless. It is not, but nothing on
screen said what it did, so the screen now says it: you are taking that club's place
in the league, which fixes your division, and you play your three rivals twice each,
so six of your seventeen games are settled there. Picking one names the three
teams underneath, which turns it from decoration into a consequence you can see
before you commit.

It also says every division is about as hard as the next, because `--schedule`
measures the spread between the easiest and hardest franchise at 0.012 z-units per
game. Overselling it would be a lie a player could feel.

From then on the club's colors wash faintly across every field, top and bottom end
zones included. Deliberately faint: it should make the run feel like yours, not
repaint the game. A club whose primary is already close to the page's navy, like
Buffalo, will barely show, which is why the secondary is in there too.

## Not built yet

Everything in the GDD's build sequence is done. The page is **not linked from the
homepage or `sitemap.xml`** and there is no leaderboard, both deliberately, pending
review.

Known gaps worth a look during playtesting:

- **Often only one option per spin.** With 8-game eligibility many team-seasons
  have a single qualifying QB or TE, so some spins present no real choice. The
  wheel is working as §5 specifies; whether it is *fun* is a feel judgement.
- **No mid-run persistence.** The run state is built to serialize (that is
  asserted in `--draft`) but the page does not yet write it to localStorage, so a
  refresh mid-season loses the run. Use the key prefix `rtps:` when adding it,
  `rtd:v1` belongs to RunTheDrive on the same origin.
- **Share card is text, not an image.** Matches RunTheDrive's approach; a canvas
  card would need `@napi-rs/canvas` work like `scripts/make-og-*.js`.

The page is not linked from the homepage or `sitemap.xml` yet, deliberately,
pending review.
