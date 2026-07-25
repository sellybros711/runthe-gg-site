# The Perfect Season

Spin a wheel, sign six players from six random NFL team-seasons, then play a
20-game season and try to do what the 2007 Patriots couldn't. Lives at
`runthe.gg/football/`.

**Status: Stages 1–5 complete (data, engine, harness, draft loop). No UI yet.**
The GDD's build order says nothing reaches the frontend until the sim harness
produces sane win rates. It does now — see Calibration below.

> `/football/` previously hosted RunTheDrive, which moved to `/touchdown/`.

## Files

| File | Role |
|---|---|
| `engine.js` | Chemistry resolution, schedule generation, per-game resolution. Headless, no deps. Browser: `window.PS_ENGINE`; Node: `require`. |
| `run.js` | Draft loop and run state: wheel, re-spins, cap accounting, week-by-week advance. Browser: `window.PS_RUN`. |
| `simulator.js` | Validation harness. Run this after any change to data, pricing, or constants. |
| `playtest.js` | Plays one full run as readable text — draft, chemistry, schedule, weekly results, outcome card. The stand-in for the UI. |
| `build/lib.mjs` | Shared build helpers: CSV parsing, cached fetch, franchise normalization. |
| `build/01-players.mjs` | → `data/player_seasons.{json,csv}` |
| `build/02-teams.mjs` | → `data/team_seasons.{json,csv}`, `team_season_rosters.json`, `league_context.json` |
| `build/03-chemistry.mjs` | → `data/battery.json`, `coaches.json`, `curated.json` |

Rebuild everything:

```sh
node football/build/01-players.mjs
node football/build/02-teams.mjs
node football/build/03-chemistry.mjs
node football/simulator.js          # then re-validate
```

Downloads cache in `build/.cache/` (gitignored, ~200MB). First run fetches from
nflverse; later runs are offline.

## Data

9,411 eligible player-seasons and 861 team-seasons, 1999–2025. Eligibility is
≥8 regular-season games — below that the weekly variance estimate is noise.

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
not independent — one multiplies your score, the other divides the opponent's —
so league average points allowed is treated as measured data (per season, in
`league_context.json`) rather than a knob.

## Calibration

At the shipped `SCALE = 1.95`, N=4000 runs per archetype:

| Archetype | Win% | GDD §9 target | 20-0 | ≤1 loss | Median week |
|---|---|---|---|---|---|
| Random affordable | 61.8% | 0.62–0.68 | 0.0% | 0.1% | 4 |
| Decent ($75M used) | 76.5% | 0.76–0.80 | 0.2% | 1.5% | 8 |
| Well-built (no chemistry) | 85.4% | 0.83–0.86 | 2.9% | 13.3% | 13 |
| Optimal + chemistry | 89.5% | 0.88–0.90 | 8.7% | 31.4% | 18 |
| One-franchise stack | 80.5% | reference | 1.1% | 5.9% | 9 |

All four win-rate rows land in band. Archetypes are cap-optimal rosters solved
by DP at a given budget, so the ladder measures player skill rather than the
harness's own clumsiness — an earlier greedy builder scored 70.6% where 84.7%
was reachable, which would have mis-tuned `SCALE` by about 0.4.

Also validated:

- `--schedule`: spread between the easiest and hardest franchise is **0.13
  z-units across 17 games** (0.008/game), so franchise choice is cosmetic, as
  §7 requires.
- `--chem`: chemistry rises 7.3% → 14.9% from two to six linked players, with
  marginal gains of +3.75/+2.50/+1.07/+0.31 points and no hard cap reached.
- `--draft`: 3,000 drafts under an always-re-spin, always-buy-the-most-expensive
  policy. **Zero over-cap runs, zero dead ends**, correct slot shape and no
  repeated team-season in every run. Also checks that the daily seed is stable
  within a date, and that a run serialized mid-draft resumes on the same RNG
  stream.

## Draft rules as settled

- **The $15M re-spin fee comes out of the $100M cap.** Two re-spins is 30% of
  your budget, so fishing for chemistry costs you a player tier elsewhere.
- A re-spin is **blocked** if it would leave less than $3M per unfilled slot.
  §5 wants the reserve floor to be a passive warning on *signings* — bankrupting
  yourself is a lesson the game may teach — but a re-spin that makes the draft
  unfinishable is a dead end, not a lesson. With the current numbers ($100M −
  $30M in fees vs an $18M minimum roster) this block is defensive rather than
  load-bearing; it matters if the cap or fee is ever retuned.
- An **unaffordable draw re-rolls free and does not consume the team-season**.
  Charging you, or shrinking the visible pool, for a draw you could never use
  would be punishing randomness.
- **Division rivals are drawn once and played twice.** You get a home and away
  game against the *same* team-season — the 2007 Patriots twice, not the 2007 and
  2001 Patriots. Their strength therefore counts twice in normalization, which is
  correct: a brutal rival really is two hard games.

## Where this departs from the GDD

Each of these is a measured failure of the spec as written, not a preference.
Details are in the header comment of the file named.

| § | Spec said | Why it changed | Where |
|---|---|---|---|
| 4 | Price on percentile within position+season | Decoupled price from payoff: punting TE was always right, and the best QB of a weak era cost the same as a great one | `build/01-players.mjs` |
| 6 | Sum links, 1–3 full value, 4+ half, clamp +15% | The clamp binds at three same-team players, so the half-value rule never fires and slots 4–6 have no incentive | `engine.js` CHEMISTRY |
| 6 | Export all links as an adjacency file | Several million pairs / >100MB on a static site to answer a 15-pair question | `build/03-chemistry.mjs` |
| 6 | Manual ~1,100-row coach table | `games.csv` already has head coach for every game, no gaps | `build/03-chemistry.mjs` |
| 7 | `defense_modifier = league_avg / opp_allowed` | Inverted — made the 2000 Ravens the easiest matchup in the game | `engine.js` `resolveGame` |
| 7 | "2 same-place finishers" | No standings exist; nothing to finish in front of | `engine.js` `opponentFranchises` |
| 9 | 3–6% perfect **and** median exit week 7–9 | Mutually exclusive under sudden death: median = ln(0.5)/ln(p) | `engine.js` `LIVES` |
| 7 | "The only way to beat 18-1 is to lose zero games" | 19-1 is a better record than 18-1, so there are two tiers | `engine.js` `LIVES` |

## Contracts that must not break

1. **Never join on a raw team abbreviation.** The two sources disagree
   inconsistently: `stats_player` uses era codes for 1999–2002 and current codes
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

## Two things the first playthrough exposed

**Scores are not in football units.** Internally your score averages 73.5 (sd 21)
and the opponent 43.1 (sd 20.5), because your side is a sum of six PPR outputs
and theirs is real points × `SCALE`. Real NFL team-games average ~22 points with
sd ~10, so weekly lines currently read `51.0-22.2`, and one legitimate Gamma tail
produced `38.5-90.4`. The Gamma sampler is correct — verified against its
requested moments to three decimals — this is a units mismatch, not a bug.

§7 wants the death card to read *"Lost 27-24 at Indianapolis"*, so Stage 7 needs
a **display transform**: decide the winner in fantasy space as now, then map both
scores into a football-plausible pair that preserves the winner and the rough
margin. A single divisor will not do it, because the mean gap (73.5 vs 43.1) is
what carries the win probability — scaled down naively, every week reads as a
blowout.

**Value-hunting is a trap, and the UI has to say so.** The price curve is convex,
so points-per-dollar is always maximized at the cheap end. `playtest.js`
deliberately uses that policy and finishes with $40M of $100M unspent and a
roster of streamers. Unspent budget must be unmissable during the draft.

## Not built yet

Stages 6–7: the season UI and the share cards. Stage 5 (wheel, draft loop, run
state) is in `run.js` and validated headlessly, but has no interface yet.

Still open: the post-run reveal — "the best possible squad from your six wheel
results, including the chemistry you missed". That is a cap-constrained
assignment problem over the six drawn team-seasons; `simulator.js` already
contains the DP that solves it for the full pool, so it is a matter of restricting
the candidate set rather than new machinery.

The page is not linked from the homepage or `sitemap.xml` yet — deliberately,
pending review.
