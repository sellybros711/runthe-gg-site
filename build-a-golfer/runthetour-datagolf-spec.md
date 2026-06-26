# Run The Tour — DataGolf Integration Spec

Reference doc for the DataGolf work produced this session. Pull the section you're implementing.
Assumes you already have the repo, `golfers.json`, `dg_transform.py`, and the prototype.

**Standing rules for any task in here:** dev-only; no deploy/push/live changes without explicit
approval; DataGolf key lives in `DG_KEY` env var, never committed, never logged, never sent to the
browser. Surface decisions rather than guessing.

Reference constants (don't re-derive): 8 skills + weights — dist .11, acc .12, app .21, sht .10,
scr .08, bnk .06, put .19, clu .13 (sum 1.0). Overall = weighted average. Tour average overall = 80.

---

## 1. SIM RETUNE  (do first — biggest quality win, no API)

Rebuild the season sim on these constants, measured from 246,968 real PGA rounds (2004-2018).
The previous formula's winners ran ~6-8 strokes too hot; its average-player anchor (74) was wrong.

Per-round score relative to par, per player:

    score_to_par = BASE - (overall - 80) * 0.238 + gauss(0, SIGMA)

- `0.238` = strokes per overall point. Overall **80 = tour average** (SG 0). Drop the old `(74 - overall)`.
- Regular: `BASE = +0.45`, `SIGMA = 2.80`
- Major:   `BASE = +2.20`, `SIGMA = 2.90`
- **Remove the final-round variance multiplier.** Round 4 spread = rounds 1-3 spread in the data.
- **Composure is not a variance term.** No measured Sunday-choke effect. Allowed use: an optional tiny
  mean nudge on the final round of majors only (cap ±0.4 strokes). Mostly a rating/flavor stat; comment
  that it's the one non-data-grounded knob.

Validate (median over many sims should land near):

| Metric | Regular | Major |
|---|---|---|
| Winner total to par | -15.4 (sd 5.0, range -33..-3) | -8.6 (sd 6.4, range -20..+5) |
| 36-hole cut (~65th) | -0.6 (≈ E) | +4.6 |
| Field per-round score-to-par spread (sd) | 2.89 | 3.18 |

`BASE` is calibrated for the ~120-player field in §3. Change field size/shape → re-tune `BASE` by bisection
(~1500 sims/step) until the median winner hits target.

---

## 2. COURSE FIT — per-course measured multipliers (`course_fit.json`)

Each course rewards different skills. Instead of bucketed guesses, use **measured** per-course multipliers in
`course_fit.json` — built from the spread of each SG category at that course vs tour-wide, across ~20 years of
real rounds. 85 courses covered (essentially the whole recurring regular-season schedule), each with high
confidence on the recurring tour stops.

Apply per event: look up the event's course → take its `mult` (8 skills) → multiply the base skill weights
(dist .11, acc .12, app .21, sht .10, scr .08, bnk .06, put .19, clu .13) by those multipliers → renormalize
to sum 1.0 → that's the event-effective weighting; compute the player's event-effective overall and feed it to
§1. Multipliers are clamped 0.82-1.40 so fit shades outcomes without overwhelming raw skill. `clu` is always 1.0
(no course signal for composure).

Examples from the file (reads like real golf): Riviera rewards short game, driving suppressed (0.82); Muirfield
Village is a ball-striking test (approach + short ~1.28); Pebble rewards approach/short on tiny greens; Redstone
and TPC Four Seasons are bomber tracks (driving 1.35); Harbour Town and Colonial are precision courses.

**A/B division (this is the efficient split):**

- **A (the file, done):** combined **driving**, **approach**, **short game**, **putting** — measured, for every
  recurring venue. `dist` and `acc` both currently carry the same measured **driving** multiplier.
- **B (DataGolf course-fit pull, where it matters):** the **distance-vs-accuracy split** only. A cannot separate
  bomber-from-accuracy cleanly (both correlate with off-the-tee gains almost everywhere). Each course carries a
  `dist_tilt_hint` (directional only) until a DataGolf course-fit pull refines `dist` vs `acc`. Prioritize courses
  where the split actually changes drafting (clear bomber or clear accuracy tracks).

**Major venues are now in the file**, sourced in three tiers (see each course's `source` + `confidence`):

- **Augusta** — fully measured from 5 recent editions (high confidence).
- **Recent rotating majors** (Oakmont, Pinehurst, Winged Foot, Shinnecock, Brookline, LACC, Oak Hill, Southern
  Hills, Valhalla, Kiawah, Aronimink, St Andrews, Portrush, Hoylake, Troon) — `measured+expert blend`: one real
  recent edition (~450 rounds) tempered 50/50 with documented venue character, so one week's setup doesn't
  dominate (medium confidence).
- **Non-recent venues** (Merion, Erin Hills, Oakland Hills, Baltusrol, Olympic Club, Carnoustie, Muirfield-Scotland,
  Birkdale, Lytham, Royal St George's, Turnberry) — `expert` character only, no SG since 2018 (kept as floor).

**Any course missing from the file** → default to 1.0, the major-archetype fallback below, or a DataGolf pull.
Don't fall back to neutral for a major — it should feel distinct.

Major-archetype defaults (fallback only, for a venue with no entry at all):

| Major type | dist | acc | app | sht | scr | bnk | put | clu |
|---|---|---|---|---|---|---|---|---|
| Masters (Augusta) | 1.10 | 0.85 | 1.30 | 1.25 | 1.20 | 1.10 | 1.20 | 1.00 |
| U.S. Open (penal) | 0.90 | 1.40 | 1.20 | 1.15 | 1.25 | 1.10 | 1.10 | 1.00 |
| The Open (links) | 0.95 | 1.10 | 1.10 | 1.25 | 1.35 | 1.15 | 1.15 | 1.00 |
| PGA Championship | 1.10 | 1.00 | 1.15 | 1.00 | 1.00 | 1.00 | 1.05 | 1.00 |

Each course in the file also has a `confidence` (high/medium/low) and `rounds` count — prefer high-confidence
fits, treat low-confidence ones as soft.

**This game wires it in by mapping each of the 18 scheduled events to a canonical real course and inlining that
subset of `course_fit.json` as `COURSEFIT` (so the build stays a single self-contained file; `course_fit.json` is
the source of truth in the repo). The four majors map to Augusta / Valhalla (PGA) / Oakmont (U.S. Open) /
St Andrews (The Open). Scottish & 3M Opens have no entry yet → neutral.**

---

## 3. CALIBRATED FIELD

Replace the hand-picked ~36 rivals so positions and prize money are credible.

- Field from roster players with `data_source` = current/historical, sampled to ~120 regular / ~144 major.
  Always insert the user's build.
- Target spread: mean overall ≈ 80, sd ≈ 4 (most 74-86, stars to ~92). Down-sample the top tail if sampling
  over-weights legends.
- Keep the existing PGA payout curve on purse; FedEx-style points on a parallel curve.

---

## 4. LIVE "THIS WEEK" MODE  (highest retention upside; runtime API)

Draft a golfer, score against this week's real PGA event. Base `https://feeds.datagolf.com`, key via `DG_KEY`,
**rate limit 45 req/min** (5-min suspension if exceeded — cache aggressively).

- Field: `/field-updates?tour=pga&file_format=json&key=$DG_KEY`
- Live stats: `/preds/live-tournament-stats?stats=sg_ott,sg_app,sg_arg,sg_putt,sg_total,distance,accuracy,scrambling&round=event_avg&display=value&file_format=json&key=$DG_KEY`

Flow: pull field → user drafts from real entrants → poll live stats during play (cached) → score the build off
the real per-skill SG the drafted golfers post → live leaderboard ticker. Key stays server-side; build behind a
flag; not public until approved.

---

## 5. AUTO-REFRESH (weekly) so active ratings never go stale

Re-pull and regenerate `golfers.json` via `dg_transform.py`. Pull:
`https://feeds.datagolf.com/preds/skill-ratings?display=value&file_format=csv&key=$DG_KEY`

Normalization is fixed (tour avg = 80, elite ≈ 96):

    rating = clamp(58, 99, round(80 + 16 * (value / anchor)))

| skill | DataGolf field | anchor |
|---|---|---|
| dist | driving_dist | 20.0 |
| acc | driving_acc | 0.10 |
| app | sg_app | 0.95 |
| sht | sg_arg | 0.45 |
| put | sg_putt | 0.62 |
| scr | round(0.7*sht + 0.3*put) | — |
| bnk | derived from sht | — |
| clu | manual — preserve existing | — |

Must honor: only overwrite matched active players (accent-normalized "First Last", ø→o etc.); **never** touch
historical/reputation rows or composure; re-derive overall/archetype/signature; emit a coverage report.
The post-2004 historical legend pull was a one-time job — not part of the weekly refresh.

---

## Implementation status (this repo, dev branch — nothing deployed)

- **§1 done** — sim rebuilt on the measured model; `BASE` re-bisected for our field (reg 0.91 / maj 2.74;
  the eligible pool runs mean ~82 with stars to 95), plus a small per-event course-difficulty draw to match
  the winner-spread targets. Validated vs the table above.
- **§2 done (v3, measured majors)** — `course_fit.json` expanded to the full measured set (incl. major
  venues in three source tiers). All 18 schedule events map to a real course; the 4 majors are now measured
  too — Masters→Augusta (fully measured), PGA→Valhalla, U.S. Open→Oakmont, The Open→St Andrews (Old) (the
  rotating-major measured+expert blends). Scottish & 3M Opens still default to neutral (no entry yet).
- **§3 done** — field drawn only from data-grounded players (`fld` flag), size 120, ~top-65 cut.
- **§4 / §5 parked** — both need `DG_KEY` + deploy approval; key must stay server-side.

---

## 6. IP note

Deriving our own ratings/sim from DataGolf stats is fine (same as the MLB engine). Piping their live model
**outputs** verbatim into a commercial/wagering product is a licensing question — check terms before doing that.
