# Data Runbook: building the real 1901+ pricing dataset

## What actually shipped is bWAR, and this file used to say otherwise

**`baseball/data/players.json` carries Baseball-Reference bWAR and nothing
else.** The 50/50 FanGraphs blend described below was designed, written and
never ran: `build_positions.py` wraps the FanGraphs fetch in a try/except that
prints `Skipping fWAR blend` and falls through to bWAR-only when FanGraphs
answers 403, which is what happened on the run that produced the shipped file.

Nothing failed and nothing could. A bWAR-only pool is a perfectly good pool, so
the only symptom was this document describing a number the game does not have,
which is the dangerous direction: the next person reads the blend as fact and
explains a mismatch with it.

Checked against published bWAR on the seasons where the two sources are known to
diverge, every shipped row lands on bWAR:

| | shipped | bWAR | fWAR | a 50/50 blend |
|---|---|---|---|---|
| Bonds 2001 | 11.86 | 11.9 | 12.5 | 12.2 |
| Bonds 2002 | 11.73 | 11.8 | 12.7 | 12.3 |
| Trout 2012 | 10.54 | 10.5 | 10.1 | 10.3 |

The bWAR and fWAR columns there were RECALLED rather than fetched, because both
sites are refused by the dev sandbox's egress proxy (see step 2). Treat the
table as evidence about which SOURCE is in the file, not as an audit of any one
number. **Ted Williams 1941 ships as 10.36 against a remembered 10.6** and wants
checking on a machine with a network: a real gap there means a stale pull, and
the fix is re-running the fetch below.

## The build records what it did, so this file cannot lie again

The paragraph above is a document describing the data, written by hand, which is
exactly the arrangement that went wrong: the blend was skipped in an exception
handler, the build printed `Skipping fWAR blend` and carried on, and nothing
anywhere recorded which source had actually won.

`build_positions.py` writes **`pipeline/provenance.json`** on every run now:

```json
{ "war_source": "bwar", "war_source_note": "fWAR blend skipped: HTTP 403",
  "split_stints": false, "anchor_ip": 210, "rows": 44344, "seasons": [1901, 2025] }
```

It is written by the build from what the build did, so it cannot drift from the
file beside it the way prose can. `--require-fwar` turns a skipped blend into a
hard failure for the run that means to have one: asking for a blend and silently
not getting it is the whole of the original bug.

## And it is no longer a laptop job

`fetch_inputs.py` still says "run this on a normal machine", and that was the
other half of the problem: the pool was whatever somebody's machine produced on
the day. `.github/workflows/baseball-data.yml` runs the three stages on a GitHub
runner, where both sources are reachable, prints what the fetch actually got,
drives the shipped pool through `check-labels.mjs` before committing, and commits
`provenance.json` alongside the data.

**That workflow is what settles Ted Williams.** One dispatch, then read 1941 out
of the rebuilt pool.

## The 2,939 seasons a traded player does not have

`combine()` collapses a mid-season move into one row labelled `TOT`, which is
correct arithmetic and makes the man **undraftable**: three separate filters keep
TOT off every board, so somebody who changed clubs in July is on neither club's
wheel. Rickey Henderson's 1989, Tom Seaver's 1977 and Bartolo Colon's 2002 are
all simply absent, 33 of them at 6.0 WAR or better, 6.6% of the pool.

`--split-stints` emits one row per club instead, so each board offers what he did
there. **It defaults to off, and turning it on is not a one-step change.** The
price curve is convex (`1.5 * war ** 1.6`), so half the WAR costs far less than
half the price, and a great player's half-season would become the best value on
the board. Run the build with the flag, then re-measure the cap sweep's
best-available against budget-bot gap, and only then ship the pool. The gap is
the mode; it was +11.2 rating points at the shipped cap.

**Leave it on bWAR.** A blend matches NEITHER published source, so it turns a
number a player can check into one they cannot, and "where did you get this"
becomes unanswerable. The page names the source on the draft screen for the
same reason.

`W_BLEND` stays in both scripts because the blend is still the right option if
anybody wants it. It is not what is running.

## IT IS A WORKFLOW NOW, AND THIS SECTION USED TO SAY OTHERWISE

**`.github/workflows/baseball-data.yml` is where the refresh runs.** Dispatch it,
read its log, and it commits the pool. The instructions below used to say the raw
pull "has to run somewhere without that allowlist, such as Coby's machine or any
normal dev box", so the pool was whatever one laptop produced on the day, with no
record of which sources answered. That is precisely how the FanGraphs blend above
came to be described as fact for months.

It still cannot run in this sandbox, and that half is unchanged:
baseball-reference.com and fangraphs.com are refused by the egress proxy on the
CONNECT. What changed is that a GitHub runner is not somebody's laptop.

**The four stages are `fetch_inputs.py`, `build_pricing.py`,
`build_positions.py`, `compact_pool.py`**, and the last one was missing from this
document and from the workflow for the life of both. `build_positions.py` ends at
`priced_players_enriched.json`, which carries verbose column names; the game
fetches `players.json`, which carries compact keys. Nothing turned one into the
other, so every run committed a file it had never written.

### LAHMAN IS `lahman.py` AND NOT `pybaseball.lahman`

The snippet that used to sit here called `pybaseball.lahman.appearances`,
`people` and `teams`. All three are broken, two different ways, and **both arrive
as a warning the build prints and carries on past**:

- It downloads `chadwickbureau/baseballdatabank/archive/master.zip`, and **that
  repository has been taken down**. A missing repository and a missing branch
  answer identically, with GitHub's 404 page, so the symptom is `File is not a
  zip file`.
- There is no `lahman.teams` in pybaseball 2.2.7. It is `teams_core`.

A refresh on that path built a pool with a position on **0 of its 60,208
batters** and **22,019 closers against the saves column's 905**. Every price in it
was right, which is what made it survivable and what made it invisible.

`lahman.py` replaces it. **The CURRENT database comes from CRAN**, because SABR
maintains Lahman now and publishes it through a Box folder with no link a script
may fetch (that folder's own download endpoint answers HTTP 512 from a runner).
The R package that redistributes it is the hand download, published, and CRAN's
GitHub mirror serves every table on its own path as `.RData`, current to 2025.

**So `pyreadr` is in the install list and is not optional in practice.** Without
it `from_cran` returns `None` at its first statement and the reader falls through
to zip mirrors that stop in **2021**, which is 2,421 batters with no position.
The build does not stop there; `pool_shape.py` does, two stages later, on the
staleness clause. A refusal at the right stage would be better and is not what
this is.

## 1. Install deps
```bash
pip install pandas numpy pybaseball pyreadr
```

## 2. Fetch the inputs into ./data
```bash
python3 fetch_inputs.py
```

It gets the bWAR bulk files direct from Baseball-Reference, the FanGraphs
leaderboards through pybaseball, and the four Lahman tables through `lahman.py`.
A source that does not answer is reported and the build carries on by design, so
**the log is the only place a 403 shows**, and reading it is how the blend's
absence should have been caught the first time. `provenance.json` records what
actually answered, so the claim and the data cannot drift again.

Notes:
- FanGraphs' `batting_stats`/`pitching_stats` cover 1901+ but pre-1920 fWAR coverage thins; the pipeline falls back to bWAR-only for any season it can't match, and lists those in `coverage_report.txt`.
- `war_daily_bat.txt` carries **no position column at all**. Its `runs_position` is a run value, so the bulk WAR files cannot stand in for Lahman Appearances. Known only because the fetch step prints the headers.

## 3. Build the priced dataset, and then the pool the game downloads
```bash
python3 build_pricing.py
python3 build_positions.py
python3 compact_pool.py
```

**The last line is the one this document used to stop before.** `build_pricing`
prices every player-season and `build_positions` adds positions, closer flags and
the starter innings anchor, and both of them end at a verbose frame that no
browser ever fetches. `compact_pool.py` is what turns it into
`baseball/data/players.json`, and it is also where the **WAR floor of 0.50**
lives: 65,515 rows sit under it, half of them a September call-up or somebody
hurt in April, and a board drawn from them is names nobody recognises at a price
nobody will pay.

## 3a. And then read the two gates before shipping anything
```bash
python3 reference_seasons.py ../data/players.json /tmp/pool_before.json
python3 pool_shape.py         ../data/players.json /tmp/pool_before.json
```

**They fail differently on purpose.** The ten reference seasons read WAR and
price, and on the rebuild that had no positions at all they agreed **to the
decimal**, because the bulk WAR files had fetched cleanly. A pool can be perfectly
correct about every number it prints and still be the wrong pool, so `pool_shape`
asks about shape: row count, coverage as a share, and how recent each column
actually reaches.

## 4. Outputs (in ./out)
- `priced_players.csv` / `.json`: one row per player-season 1901+:
  `bbref_id, name, season, team, role, primary_pos, eligible_pos, is_closer, bwar, fwar, rwar, rwar_source, price_m`
- `decade_benchmarks.csv`: best real team win% per decade (Era-mode targets), incl. `proj_wins_162`.
- `coverage_report.txt`: row counts, fWAR match rate, price range, unmatched sample.

## Locked constants (top of build_pricing.py, the tuning knobs)
```
W_BLEND  = 0.5     # rWAR = 0.5*bWAR + 0.5*fWAR
COEF     = 1.5     # price = 1.5 * rWAR^1.6
EXPONENT = 1.6     # calibrated when the cap was $245M. It is $170M now.
PRICE_FLOOR_M = 1.0
POOL_MIN_YEAR = 1901
ELIG_GAMES    = 10   # min games at a position to be draft-eligible there
CLOSER_MIN_SV = 20   # saves to flag a closer option
SP_GS_RATIO   = 0.5  # GS/G >= this => starter-eligible
```

## Known items to smoke-test on real data

**The three below were open questions and two of them have answers now**, from
the shipped pool rather than from reasoning. They are kept because what was
decided is more useful than the question was.

- **fWAR join is name+season** (with accent/suffix normalization). Still open in
  principle and moot in practice: FanGraphs answers 403 and the blend has never
  run, so nothing is currently joined on a name. If it ever does run, check
  `coverage_report.txt` and, if the miss rate is material, swap in the Chadwick
  register crosswalk (`key_bbref` to `key_fangraphs`) for an exact-ID join.
- **Mid-season trades** are collapsed to one season row (bWAR summed, team =
  `TOT`). **ANSWERED: that costs 2,939 seasons**, 33 of them at 6.0 WAR or
  better, and a traded player then has no draftable row for that year at all.
  Rickey Henderson's 1989, Tom Seaver's 1977 and Bartolo Colon's 2002 are simply
  absent. `split_stints` is a workflow input rather than a default, because half
  a season at a fraction of the price moves the draft economy: the price curve is
  convex. **Re-run the cap sweep and compare the best-available against budget-bot
  gap before shipping the result.**
- **Two-way players** appear in both bat and pitch spines. **ANSWERED: both rows
  are kept**, because a draft has to put a man in one slot. 42 seasons, and
  Ohtani 2023 is 6.11 batting and 3.80 pitching, which is a reader looking up 9.9
  and finding neither. `indexData` marks the halves and every surface says which
  half it is. The mark is derived from the pool rather than stored, or it is a
  second copy of an answer.
- **`TOT` is not a club.** Three separate filters keep multi-club rows off every
  board, so nothing reachable carries it, and `check-labels.mjs` asserts that as
  a fact rather than as a requirement.
