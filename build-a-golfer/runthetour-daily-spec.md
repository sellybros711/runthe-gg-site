# RunTheTour — Daily Challenge spec (single-round, real courses, course records)

Status: planning locked, not yet built. Replaces the current season-style daily.

## 0. The loop
One UTC day → **one real course** (deterministic, same for everyone) → **one 18-hole
round**. Preview → set game plan → draft (career-mode draft) → play hole-by-hole with
strategy decisions → post your to-par. Lowest score ever at a course = its **course
record**, kept on a Course Records page. New famous course each day.

## 1. Decisions (locked)
- **Competition = human-only.** No AI field. You post a to-par; it ranks on the day's
  global board and challenges the all-time **course record** for that course. No fake
  pros. *Cold-start note:* until the player base grows you may solo-own records — that's
  fine; records are persistent and globally contestable, and the preview shows the
  standing record (or "unclaimed — set it") as your target. Par is the baseline goal.
- **All four strategy layers in:** game plan (global), signature-hole decisions, daily
  conditions, mulligan-from-streak. (Detail in §4.)
- **Draft = career-mode draft** (peak-card pool, rarity pulls, 2 re-spins, one skill per
  golfer). Reuses scrSetup + the draft screen.
- **Courses:** `courses.json` — 16 real venues, real per-hole par/yardage/names + the
  DataGolf `fit` weights. 14 verified, 2 (East Lake, Sedgefield) structure-accurate.

## 2. Course rotation
Deterministic per day so everyone shares the course. Seeded permutation of the 16 (a
shuffled cycle: all 16 appear before any repeats, re-shuffled each cycle by the cycle
index). `dayKey = todayKey()` (UTC YYYYMMDD). Course record persists across recurrences.

## 3. The hole-by-hole engine (the core new build)
Each course's 18 holes come from `courses.json` (par, yards, name). Derive per hole:
- **holeSkillWeights** — which skills the hole tests, from par + length, then tilted by
  the course `fit` and the day's conditions:
  - Par 3: approach-heavy + (short→short-game / long→distance) + putting.
  - Par 4: driving (dist+acc) off the tee + approach + putting; long (≥470y) leans
    distance/approach; short/drivable (≤330y) is a risk hole (often signature).
  - Par 5: distance (reachable-in-2 → eagle look) + approach + putting; very long
    (≥600y) leans accuracy/approach (3-shot).
- **holeDifficulty** — from length-vs-par and a course difficulty constant (calibrated so
  a course's scoring matches reality; e.g. Oakmont brutal, River Highlands scorable).

Per-hole sim (deterministic, fair):
- `eff = weightedBlend(playerSkills, holeSkillWeights)` (0–99, course fit + conditions
  already folded into the weights).
- `mu = holeDifficulty − (eff − 80)*SLOPE + conditionMean + planMean`.
- `score_to_par = mu + gauss(seed)*sigma` where `seed = mulberry32(dayKey ^ courseHash
  ^ holeIndex)` and `sigma = baseSigma * planSigmaMult * conditionSigmaMult`.
- Map continuous → discrete outcome via thresholds → eagle(−2)/birdie(−1)/par/bogey(+1)/
  double(+2)/triple+(+3), tuned to a realistic distribution. Sum 18 = round to par.
- **Fairness:** seed depends only on (day, course, hole) — NOT the player — so the same
  build + same decisions always yields the same round; your build and choices are the
  only variables. Two identical builds tie. Server can re-sim to verify (anti-cheat).

**Calibration target (Monte Carlo, Phase 1):** strong build (OVR ~87) at a *fitting*
course in normal conditions ≈ **−5 to −9**; average build ≈ near par; weak build over;
realistic eagle/double rates; course-to-course difficulty spread true to life.

## 4. Strategy layers
1. **Game plan (global dial):** Conservative / Balanced / Aggressive, chosen on the
   preview. Conservative: sigma ×0.8, mean +0.15 (safer, fewer birdies & doubles).
   Aggressive: sigma ×1.3 and a mean *bonus on holes your build fits* but bigger blow-up
   tail when it doesn't — rewards reading the course, punishes a mismatched gamble.
2. **Signature-hole decisions:** each course's 2–3 signature holes pause for **Attack**
   vs **Play Safe**, overriding the global plan on that hole. Attack = strong aggression
   (eagle/birdie upside if the hole's key skill is high; double+ risk if low). Safe =
   conservative (tight, near par). This is the core skill moment.
3. **Daily conditions (seeded):** wind (calm/breezy/windy/gusting) + firmness, shown in
   the preview. Windy → accuracy & approach weighted up, distance down, sigma up across
   holes. Changes the draft read day to day.
4. **Mulligan from streak:** a daily streak ≥3 grants **1 mulligan** for the round —
   re-sim a single hole (the one just played), keep the better result. Spent once.

## 5. Screens
- **scrDailyPreview** — course card: name/location, par/yardage, character label +
  "What wins here" (top fit skills), today's conditions, signature holes, and the
  standing course record (target). Game-plan dial. → "Draft your golfer".
- **Draft** — reuse scrSetup + draft (career-mode draft).
- **scrDailyRound** — hole-by-hole: hole card (n, par, yards, name), running to-par vs
  the course-record line, day cells filling in. Signature holes prompt Attack/Safe.
  Mulligan button when available. Tap-through or auto-advance.
- **scrDailyResult** — final to-par, vs course record (claimed? margin), vs par, the
  round scorecard, share card, streak, "new course tomorrow". Posts to backend.
- **Course Records page / overlay** — all 16 courses with record holder + score + date
  + your personal best; today's course highlighted.

## 6. Backend — `supabase/24_runtour_daily.sql` (mirror 22/23 pattern)
- `runtour_daily_scores`: id, user_id, display_name (server-attributed from profiles),
  course_key text, day int, to_par int, ovr int, skills jsonb, decisions jsonb,
  created_at. **Unique (user_id, day)** — one ranked play/day (upsert/replace).
- `runtour_submit_daily(...)` — SECURITY DEFINER; username from profiles; **clamp
  to_par to a plausible floor by OVR** (can't post an impossible round); upsert on
  (user_id, day).
- `runtour_daily_board(p_day, p_course)` — lowest to_par for that day/course (the day
  board).
- `runtour_course_records()` — per course_key: min(to_par) all-time + holder username +
  ovr + day (the records page).
- RLS public-read; writes only via the definer fn. Fails open client-side (no
  backend/migration → local-only, no crash).
- **Owner applies the migration** in the Supabase SQL editor (like 22/23).

## 7. One play per day
Reuse the existing daily gate (`bag_daily` localStorage by `todayKey`). Daily is
single-and-done; no career continuation. Streak extends the existing daily streak.

## 8. Retention levers
New famous course daily · streak (extended) · persistent course records with your name ·
chase records you don't hold · daily share card (course + score) · daily-specific tee
badges later (records held, sub-65 round, streak length).

## 9. Build phases (each reviewable)
1. **Engine** — load courses.json, derive hole weights/difficulty, per-hole sim,
   conditions + game-plan + signature math, Monte Carlo calibration. (Headless, no UI.)
2. **Daily flow UI** — preview → draft → hole-by-hole round → result. One-per-day, local
   only (no backend yet). Playable end to end.
3. **Backend** — `24_runtour_daily.sql` + submit/board/records client wiring + Course
   Records page. Owner applies migration.
4. **Polish** — share card, streak/mulligan UX, daily tee-badge tie-ins, balance pass.

## 10. Open knobs (flagged for tuning)
SLOPE, baseSigma, per-par hole-weight blends, course difficulty constants, plan/condition
multipliers, outcome thresholds, OVR score-floor clamp, mulligan streak requirement.

## Phase 1 — COMPLETE: calibrated hole-by-hole engine
`daily-engine.js` (+ `daily-engine.calibrate.js` Monte-Carlo harness). Standalone/headless
now; ported inline into the HTML in Phase 2. Anchored to the season model so daily scores
feel consistent with career mode.

**Model:** per hole → archetype (par+length) picks a skill-weight template, tilted by the
course `fit` (sharpened, `FIT_POWER`) + daily conditions → effective skill → latent
`mu = shift + holeShape + courseDiff − (eff−80)·SLOPE_H + plan + cond (− aggFit)` →
`z = mu + N(0, LATENT_S·planSd·condSd)` → bucketed to eagle/birdie/par/bogey/double/triple by
fixed `TH` thresholds set from real PGA hole-scoring frequencies. RNG seeded by
(day ^ courseHash ^ hole) only → fair & server-verifiable.

**Calibration (Monte Carlo, balanced/breezy unless noted):**
- Score by OVR: 80 → +0.4, 86 → −1.0, 90 → −1.8, 92 → −2.2; ~0.22 strokes/OVR pt (≈ season 0.238). Round sd ~3.1–3.3.
- Outcomes/round: eagle 0.07, birdie 3.9, par 11.5, bogey 2.1, double 0.34, triple+ 0.11 (realistic).
- Fit reward (equal OVR 86): course-matched −1.5 vs mismatched −0.4 → ~1.1 strokes for reading the course.
- Strategy (OVR-88 fitting build, Augusta): conservative −0.2 (sd 2.5) / balanced −0.8 (sd 3.0) /
  aggressive −0.9 (sd 3.8, best −11) — aggressive = same mean, higher ceiling + blow-up risk.
  Mismatched bomber aggressive: +4.3 (p90 +10) — punished. A real game-plan decision.
- Conditions (Augusta, OVR 86): calm −0.6 / breezy +0.2 / windy +1.8 / gusting +3.5, rising variance.
- Course difficulty spread ~5 strokes: River Highlands / Pebble easiest, Valhalla / Quail / East Lake hardest.

**Known limitation (flagged):** course difficulty is derived from length-per-par only, so brutal-but-
short venues (Oakmont) read mid-pack. Drop in a real DataGolf course scoring-difficulty figure later to fix.

**Tuned constants (in CFG):** SCORE_SHIFT −0.06, SLOPE_H 0.019, SHAPE_SCALE 1.5, FIT_POWER 4.0,
LATENT_S 0.92, COURSE_DIFF_SCALE 0.045, PLAN/COND/TH/AGG_FIT_BONUS as in the file.

## Phase 2 — COMPLETE: daily flow UI (local)
Inlined DAILY_COURSES (16 real courses) + the calibrated engine into build-a-golfer.html. New flow: title Daily button → scrDailyPreview (course card, what-wins-here, conditions, signature holes, standing course record, game-plan dial) → career-mode draft (scrSetup+draft) → scrBuild Tee-off → scrDailyRound (hole-by-hole, color-coded scorecard strip, signature Attack/Play-Safe prompts, streak mulligan, auto-play) → scrDailyResult (to-par, record claim, OUT/IN scorecard) + overlayCourseRecords (all 16, record holders). Deterministic course rotation (cycles all 16) + seeded conditions. One-play-per-day via bag_daily. Local course records in bag_courserecords. Replaces the old season-style daily. Verified end-to-end headless (preview→draft→18 holes→result→records) + non-daily regression, zero JS errors. Backend (Phase 3) not wired yet.
