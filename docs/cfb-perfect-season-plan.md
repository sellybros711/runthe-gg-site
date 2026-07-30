# College Football: Perfect Season — Build Plan

A college-football clone of **The Perfect Season** (`/football/`), living at **`/CFB/`**.
Same core loop — spin a wheel, draft players from real team-seasons under a budget,
simulate a season chasing a perfect record — reskinned and re-tuned for college.

> **Status:** Planning complete. Data pipeline blocked pending network-policy change
> (see "Data source" below). This doc is the handoff spec for building the game.

---

## Decisions (locked)

| Question | Decision |
|---|---|
| Path | `/CFB/` |
| Year range | **2005–2025** |
| Teams | **Power 5 + notable Group of 5** (e.g. 2017 UCF, 2007 Boise State, 2008 Utah, 2010 TCU) |
| Data source | **collegefootballdata.com API** (CFBD) — key held by the user |
| Budget mechanic | **NIL budget** (replaces the salary cap) |
| Season length | **12 regular-season games → 12-team CFP → 16-0 perfect season** |

---

## Data source — IMPORTANT constraint

The CFBD API (`api.collegefootballdata.com`) is the intended source. In the original
build session, this environment's **network policy was set to `Trusted`**, which is a
curated allowlist that **blocks `api.collegefootballdata.com` with a hard 403**.

**Fix:** the environment's **Network access** setting must be changed from `Trusted`
to the most permissive tier (e.g. "No restrictions" / "Unrestricted"), then a **new
session** started. Confirmed reachable hosts under `Trusted` were only
`raw.githubusercontent.com` (github.com releases and api.github.com were also blocked).

Once CFBD is allowlisted, the build fetches from it directly. The **shipped game needs
no live API** — all data is baked into `CFB/data/*.json` at build time, exactly like the
NFL version (whose data is committed rather than fetched live).

The API key must **never** be committed to the repo or placed in the environment
variables box (which is world-readable to environment users). Pass it via an env var at
build time only, e.g. `CFBD_KEY=... node CFB/build/01-players.mjs`.

### Fallback (if CFBD cannot be allowlisted)
`raw.githubusercontent.com/sportsdataverse/cfbfastR-data/main/player_stats/csv/player_stats_<year>.csv`
is reachable and real (~20MB/year), but it is **play-by-play level with no position
column** and no clean roster/recruiting/coach data — requiring heavy aggregation and
dropping some chemistry links. Lower fidelity; only use if the API stays blocked.

---

## Architecture — mirror the NFL game exactly

The NFL game is vanilla JS, no framework, self-contained per directory. Clone the module
layout and the IIFE-global pattern.

```
CFB/
  index.html            # single-page app, all screens + inline CSS/JS  (~500KB)
  engine.js             # headless logic: scoring, chemistry, schedule, sim  → window.CFB_ENGINE
  run.js                # draft loop + run state machine + budget mgmt        → window.CFB_RUN
  board.js              # leaderboard client (Supabase PostgREST)             → window.CFB_BOARD
  auth.js               # accounts wrapper over shared Supabase Auth          → window.CFB_AUTH
  simulator.js          # offline calibration/validation harness (Node)
  how-to-play.html
  manifest.webmanifest
  og.png  favicon-48.png  icon-192.png  apple-touch-icon.png
  challenge/index.html  # challenge share-link redirect
  data/                 # ALL committed, built from CFBD
    cfb_player_seasons.json
    cfb_team_season_rosters.json
    cfb_team_seasons.json
    cfb_league_context.json
    cfb_coaches.json
    cfb_battery.json
    cfb_curated.json
    cfb_display_calibration.json
  build/                # CFBD ingest → shipped JSON (mirror football/build/)
    01-players.mjs  02-teams.mjs  03-chemistry.mjs  04-display.mjs  05-awards.mjs  lib.mjs
```

Dependency chain (unchanged from NFL): `engine.js` ← `run.js` ← `index.html`; `board.js`
and `auth.js` independent.

---

## What changes vs. the NFL game

### Roster slots — UNCHANGED
`['QB', 'RB', 'WR', 'WR', 'TE', 'FLEX']`. FLEX accepts RB/WR/TE. College uses the same
offensive skill positions, so the draft loop ports directly.

### Budget — NIL budget ($14M)
Replaces the $140M salary cap. Player "prices" become NIL deal values derived from
production (same VOR pricing curve, scaled down ~10×). Re-spin ladder scales to
`[0.5, 1.0, 1.5]` ($M). All floor-enforcement logic (`reserveFloor`, `assignedFloors`,
`canFinishAfter`) ports unchanged apart from the dollar magnitudes.

### Season & playoffs
| NFL | College |
|---|---|
| 17 regular-season games | **12** |
| 12 wins → playoffs | **10+ wins → 12-team CFP contention** |
| 15 wins → bye | **12 wins → top-4 seed, first-round bye** |
| 3 playoff rounds | **4 rounds**: First Round → Quarterfinal → Semifinal → National Championship |
| 20-0 perfect | **16-0 perfect** (12 reg + 4 playoff, or 12 + bye + 3) |
| SB boss = 1972 Dolphins | **Title boss = an all-time great CFB team** (e.g. 2019 LSU 15-0, 2001 Miami) |

Schedule generation: 12 opponents from unique programs, normalized strength, max ~3
elite opponents. Optional conference/rivalry flavor on opponent labels.

### Chemistry links
Same saturation curve (max +15%, min −10%). Remap the link types:

| NFL | College | Bonus |
|---|---|---|
| Battery | Battery (QB↔receiver) | +10% |
| Teammates | Teammates (same team-season) | +5% |
| Franchise | **Program** (same school, diff years) | +3% |
| Family | Family (brothers, curated) | +3% |
| College | **Home state** (same state) | +2% |
| Draft class | **Recruiting class** (same class year) | +2% |
| System | **Conference** (same conference) | +2% |

In **One Program** mode, suppress program/conference links (trivially universal).

### Roster-structure multiplier — port with CFB schemes
Keep QB-support / run-pass balance / concentration / floor-depth logic. Replace the 10
NFL offensive schemes with college ones (Air Raid, Spread option, RPO, Pro-style,
Triple option, Power run, West Coast, etc.), each with a `detect()` → fit + 1–3% bonus.

### Display score transform
Same CDF-percentile mapping, recalibrated to **higher-scoring college scorelines**
(`04-display.mjs` builds `cfb_display_calibration.json` from historical CFB scores).

### Game modes
| NFL | College |
|---|---|
| Free Play | Free Play |
| One Franchise | **One Program** (lock to one school) |
| Eras Draft | Eras Draft (2000s / 2010s / 2020s) |
| Salary Cap Survivor | **NIL Crisis** (star's NIL inflates 10%/game) |
| Trade Machine | **Transfer Portal** (portal window every ~3 games) |
| Challenge Bowl | Challenge Bowl |

### Visual identity
Same dark-navy base + position colors (QB red / RB green / WR blue / TE orange / FLEX
purple). Gold/amber accent for a college feel. College field canvas (team-branded end
zones, midfield logo). **~130-team colorway database** (vs. 32 NFL teams).

---

## Backend (Supabase — shared project)

Reuse the shared auth project (sign-in works across all RunThe.gg games). New migrations
mirroring the football set:

- `70_cfb_perfect_season.sql` — core `cfb_runs` table (seed, picks, rng_calls, wins,
  losses, point_diff, chemistry, team_rating, structure_mult, roster JSON, run_mode,
  program), computed `score` column, indexes.
- Follow-ons mirroring `51_`–`60_` as features land (accounts already shared, board
  check, avatars, colorways, run modes, era mode, rank windows).

`board.js` talks to PostgREST directly (public read via anon key). `auth.js` uses the
supabase-js CDN client. Store seed + picks for future server-side replay verification.

---

## Build order

1. **`CFB/build/` data pipeline** — CFBD ingest → committed `CFB/data/*.json`.
   *(Blocked until CFBD host allowlisted.)*
   - `01-players.mjs` — player season stats + positions, per-game mean/SD, NIL/VOR pricing
   - `02-teams.mjs` — team-seasons: records, conference, points allowed (P5 + notable G5)
   - `03-chemistry.mjs` — battery / teammate / program / recruiting-class / home-state / conference
   - `04-display.mjs` — CFB score calibration
   - `05-awards.mjs` — badges (Heisman finishes, All-America, statistical milestones)
2. **`engine.js`** — port scoring / schedule / 12-team CFP / 16-0.
3. **`simulator.js`** — validate win & score distributions BEFORE any UI.
4. **`run.js`** — draft loop, NIL budget, modes.
5. **`index.html`** — port UI, colorways, college field, gold accent.
6. **Supabase migrations** + `board.js` + `auth.js`.
7. **Homepage + SEO + PWA** — add game card to root `index.html`, `sitemap.xml`, manifest.

---

## Key constants to re-tune (from NFL → CFB)

| Constant | NFL | CFB (proposed) |
|---|---|---|
| Budget cap | 140 | **14** ($M NIL) |
| Re-spin ladder | [5,10,15] | **[0.5,1.0,1.5]** |
| Regular-season games | 17 | **12** |
| Playoff-berth wins | 12 | **10** |
| Bye / top-seed wins | 15 | **12** |
| Playoff rounds | 3 | **4** |
| Perfect record | 20-0 | **16-0** |
| Score scale (`SCALE`) | 3.05 | recalibrate (college scores higher) |
| Chemistry max/min | +15% / −10% | unchanged |

All other engine tuning (consistency blend, home-field, shape strength) starts from the
NFL values and is re-validated via `simulator.js`.

---

## Branch

All work on **`claude/college-football-game-plan-5600hh`**.
