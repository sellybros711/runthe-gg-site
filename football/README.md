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

At the shipped `SCALE = 1.95`, N=4000 runs per archetype:

| Archetype | Reg win% | GDD §9 | Record | Playoffs | Bye | Title | 20-0 |
|---|---|---|---|---|---|---|---|
| Random affordable | 59.2% | 0.62-0.68 low | 10.1-6.9 | 35.5% | 4.0% | 1.9% | 0.1% |
| Decent ($75M used) | 77.2% | 0.76-0.80 ok | 13.1-3.9 | 84.4% | 19.2% | 8.8% | 0.2% |
| Well-built (no chem) | 86.4% | 0.83-0.86 ok | 14.7-2.3 | 98.8% | 58.1% | 29.0% | 2.9% |
| Optimal + chemistry | 90.5% | 0.88-0.90 ok | 15.4-1.6 | 99.9% | 78.6% | 45.0% | 7.7% |
| One-franchise stack | 80.2% | reference | 13.6-3.4 | 87.3% | 35.5% | 16.4% | 1.2% |

Measured on the regular season only, so the win rate stays comparable to §9
(playoff opponents come from the top strength quartile and would drag down the
average for exactly the rosters that reach them). Three of four rows land in
band; the bottom rung sits about 3 points low because the reachable spread is
wider than §9 assumed, and no single `SCALE` fixes that. 1.95 is chosen because
it puts the perfect-season rate squarely in the 3 to 6% §9 asked for. Archetypes are cap-optimal rosters solved
by DP at a given budget, so the ladder measures player skill rather than the
harness's own clumsiness, an earlier greedy builder scored 70.6% where 84.7%
was reachable, which would have mis-tuned `SCALE` by about 0.4.

Also validated:

- `--schedule`: spread between the easiest and hardest franchise is **0.13
  z-units across 17 games** (0.008/game), so franchise choice is cosmetic, as
  §7 requires.
- `--chem`: chemistry rises 7.3% → 14.9% from two to six linked players, with
  marginal gains of +3.75/+2.50/+1.07/+0.31 points and no hard cap reached.
- `--draft`: 1,500 drafts under an always-re-spin, always-buy-the-most-expensive
  policy. **Zero over-cap runs, zero dead ends**, correct slot shape in every
  run, and no team-season drawn more than twice. Also checks that the daily seed
  is stable within a date and that a run serialized mid-draft resumes on the same
  RNG stream.
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
| Rivals | -3% | Old rivals: Patriots and Jets |

An earlier version phrased the same-team link as "Both wore [code] colors" using
a British spelling, which named a three letter code and explained nothing. There
are no British spellings anywhere in this directory.

Lines on the field are colored by strength so several of them do not read as one
tangle: **gold and thick** for a big link, **green** for a good one, **thin blue**
for a small one, **red** for one that hurts. A legend under the field lists only
the bands actually on screen, and each row in the chemistry panel carries a dot in
its band's color. In the draft list each option shows a short reason in the same
color, like "+2.7% Both Steelers".

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
sticky block at the top, so the field stays visible while you scroll the player
list. Below that: the two wheels, then a tab per open spot, then the players.

Tabs are colored by position, and each spot appears **once** with a count, even
though there are two WR slots. An earlier build printed an identical "WR SPOT"
group twice, which just read as a bug. Selecting a tab also outlines the matching
empty spot on the field, so the two always agree.

Position colors: QB red, RB green, WR blue, TE orange, FLEX purple. Wins are
green, losses red.

## Player rows

Each row leads with fantasy points per game, then the real season line, on one
line:

```
Dez Bryant      18.7 FPPG . 90 rec, 1,371 yds, 12 TD      $34.0M
                [3rd in receiving TDs]
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

- **The $15M re-spin fee comes out of the $100M cap.** Two re-spins is 30% of
  your budget, so fishing for chemistry costs you a player tier elsewhere.
- A re-spin is **blocked** if it would leave less than $3M per unfilled slot.
  §5 wants the reserve floor to be a passive warning on *signings*, bankrupting
  yourself is a lesson the game may teach, but a re-spin that makes the draft
  unfinishable is a dead end, not a lesson. With the current numbers ($100M −
  $30M in fees vs an $18M minimum roster) this block is defensive rather than
  load-bearing; it matters if the cap or fee is ever retuned.
- An **unaffordable draw re-rolls free and does not consume the team-season**.
  Charging you, or shrinking the visible pool, for a draw you could never use
  would be punishing randomness.
- **A team-season can come up twice in a run, never more.** This is what makes
  the Battery and Teammates links reachable at all. See the chemistry note below.
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

## The post-run reveal

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
included, since chemistry depends on the whole roster and cannot be folded into
the DP. Solves in about 20ms.

The honest limit, stated in the UI rather than glossed over: it holds your six
drawn **teams** fixed. It cannot know what the wheel would have shown after a
different pick, because the wheel reacts to who you have already signed.

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
