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

## 2. COURSE FIT — per-course skill-weight multipliers (measured)

Course fit is now **measured per-course from real DataGolf historical SG** — the spread-ratio of each
SG category vs the tour-wide baseline (gain 2.3, clamp 0.82–1.35) — shipped as `course_fit.json`.
The old hand-tuned bucket table is gone.

Apply: look up the event's course, reweight the 8 skills by its `mult`, renormalize to 1.0, and feed the
event-effective overall into §1. Courses not listed (thin sample / brand-new) → neutral 1.0, or a fresh
DataGolf course-fit pull.

Per-course fields:

- `mult` — the 8 skill multipliers. `dist` and `acc` **share the measured driving multiplier**; clu is
  always `1.0` (no course signal).
- `driving_split` / `dist_tilt_hint` — splitting the shared driving multiplier into distance vs accuracy
  is the **one open refinement** (DataGolf course-fit "B"). `driving_split:"B"` flags it as pending;
  `dist_tilt_hint` ∈ [0,1] hints the lean (0 = accuracy-leaning … 1 = distance-leaning; `null` = unknown).
  Until it's measured, dist and acc carry the same value.
- `rounds` — sample size; `confidence` — low / medium / high. Weight any new DataGolf pulls by these.

**The four majors are the only remaining gaps.** Augusta (Masters) and the rotating Open / links venues
aren't in the measured set, so they keep their hand-tuned profiles until measured. Map each scheduled
event to its real course (`build-a-golfer.html` inlines the relevant subset of `course_fit.json` so the
game stays a single self-contained file; `course_fit.json` is the source of truth in the repo).

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
- **§2 done** — `course_fit.json` added; per-course multipliers wired for the 12 non-major schedule events;
  the 4 majors stay hand-tuned (the flagged gaps); Scottish Open & 3M Open default to neutral (not measured).
- **§3 done** — field drawn only from data-grounded players (`fld` flag), size 120, ~top-65 cut.
- **§4 / §5 parked** — both need `DG_KEY` + deploy approval; key must stay server-side.
