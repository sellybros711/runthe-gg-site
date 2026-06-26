# Build a Golfer — CLAUDE.md

> Session-continuity doc for Claude Code. Captures the handoff so future sessions
> have context without re-reading the original brief.

## 0. GUARDRAILS (highest priority — read first)

This is an **early-stage prototype in active development**. NOT production. It
**must not be deployed or wired into the live site until the owners manually give
the go-ahead.**

- **Do not deploy** until told manually: no build-and-ship, no hosting config, no
  domain wiring, no DNS, no analytics.
- **Do not merge into or push to the live RunThePitch / runthe.gg site** (the
  `main` branch of this repo, or the live deploy) until approved. It stays a
  separate sibling.
- **Keep it isolated.** All Build a Golfer work lives under `build-a-golfer/` on
  the non-merged branch `claude/build-a-golfer-prototype-9zdmcq`. Do not link it
  from the live site or share a public URL.
- **No deploy/publish/push command without explicit, manual approval.** Before any
  action that could affect anything outside the sandbox, STOP and ASK.
- Treat as a private playground. When in doubt, do less and ask.

### Environment note
This repo (`sellybros711/runthe-gg-site`, CNAME `runthe.gg`) is the LIVE
RunThePitch site. `index.html` is the live World Cup game. Build a Golfer is kept
partitioned under `build-a-golfer/` on a feature branch that is never merged to
`main` and never deployed — this is the handoff-approved "feature branch" option.

## 1. What this is

**Build a Golfer** — single-player golf game in the RunThe.GG family, sibling to
RunThePitch (World Cup game). In-app tagline: *"A RunThe.GG Game."* Vertical
brand: **RunTheGreen**.

**Concept:** Spin a wheel, build a golfer by taking one skill from each real
golfer that lands, then run the build through a full PGA season and see where you
finish and how much you make.

**Source of truth:** `build-a-golfer/build-a-golfer.html` — a single self-contained
HTML file (vanilla JS, no build step) that already runs the full game. This file
is canonical for behavior. Do NOT refactor or port to a framework until the
owners pick a target stack (their Encore project is Vite + React; this is plain
HTML for now).

## 2. Game mechanics (current spec)

**8 skill slots** (each 0–99): Driving Distance, Driving Accuracy, Approach, Short
Game, Scrambling, Bunker, Putting, Composure.

**One mode** (ratings always shown). A hidden-ratings "hard mode" was prototyped
and removed; may return as a harder tier.

**Draft:**
- Press **Spin** → one real golfer revealed from the pool (no repeats in a draft).
- Take **one** of that golfer's 8 skills → fills that slot with the golfer's
  rating. One skill per golfer.
- Repeat until all 8 slots filled.
- **Re-spins capped at 2 for the whole draft.** A re-spin discards the current
  golfer and reveals a new one. After both used, re-spin disappears and you must
  take a skill from whoever is shown. You always fill all 8 slots — the tension is
  being forced into a lesser skill, not leaving holes.

**Overall rating** = weighted average of the 8 skills. Weights: distance .11,
accuracy .12, approach .21, short game .10, scrambling .08, bunker .06, putting
.19, composure .13 (sums to 1.0). Unfilled slots default to a "journeyman"
baseline of **62** (radar baseline; with the 2-re-spin cap all slots fill anyway).

**Roster:** ~36 golfers, mix of current stars + all-time legends, each with
hand-tuned 0–99 ratings reflecting reputation (Bryson 99 distance, Hogan elite
ball-striking, Seve/Cam Smith elite short game + scrambling, Gary Player 99
bunker, Loren Roberts 98 putting, Tiger 99 composure). **Ratings are placeholders
to be replaced with real data later (see §4 item 1).**

**Season sim:**
- Schedule: 18 events incl. 4 majors (Masters, PGA Championship, U.S. Open, The
  Open), several signature events, a finale. A "majors only" option sims the 4.
- Field = ~36 real golfers + player's build (37 total).
- Each event: 4 rounds, a 36-hole cut (low ~22 + ties), scoring vs the field.
- `simRound`: base strokes vs par = `(74 − overall) × 0.225`; `+1.4` for majors;
  per-round SD ≈ `2.4 + (90 − composure) × 0.045` (clamped 1.7–4.2), `× 1.12` in
  final round and majors; weak composure adds strokes on Sunday. Tuned so winners
  land around **−19 at majors** and **−23 at regular events**.
- Money: PGA-style payout curve per event purse. FedEx-style points on a parallel
  curve.
- Per-player season tracking: money, points, wins, majors, top-10s, cuts made,
  best finish, events played, average finish.
- Season **auto-advances** (≈1.6s/event, ≈2.4s/major) with **Pause** and **Skip
  to results** controls — no clicking each event.
- Ends with a summary: money won, money rank vs field, wins, majors, top-10s,
  best finish, FedEx points & rank, full season money list, share card.

## 3. UI / brand (current)

Mirrors the RunThePitch shell.
- Warm **cream** page background with a peach glow.
- Crest + italic-condensed wordmark **"Build a Golfer"** with a small teal
  **"A RunThe.GG Game"** subtitle.
- Dark navy "phone" **card** with a gold top edge holding the whole app.
- Footer: pills + **@RunTheGreen** (placeholder X handle — confirm) + Home /
  About / Privacy / Contact.

**Palette tokens:** navy `#01122A`, cream `#F4E3C9`, teal `#06A291` / `#0FA888`,
deep teal `#07605F`, gold `#EBA61F`, plus course/board greens.

**Fonts:** Anton (display, italic) + Barlow Semi Condensed (body) via Google
Fonts, with Impact / Arial Narrow / system fallbacks. *Flag: confirm host CSP
allows Google Fonts, or self-host Anton.*

**Screens:**
- **Title:** dusk golf-course SVG backdrop (sky, low sun, tree line, fairway with
  mowing stripes, green + flagstick, bunker, ball); trophy; "RunTheGreen" hero; a
  rolling ticker cycling the 8 skill names; single gold **"Step to the Tee Box"**
  button; How to Play + Leaderboard mini-buttons.
- **Draft:** live "build hero" at top = golfer silhouette + live **OVR** badge +
  **8-axis radar chart** (dashed octagon = journeyman 62 baseline, teal polygon =
  your build, gold dots = filled skills); spin reel; skill tiles; re-spin control;
  scorecard list (shows which golfer gave each skill).
- **Season:** persistent standings bar (season earnings, avg finish, events, cuts
  made, best finish); majors get a gold-tinted screen + banner + gold-bordered
  leaderboard; auto-advancing event loop.

## 4. Open items / next steps (TRACK — do NOT build unless asked)

1. **Real roster data** (replace placeholders). Plan: Strokes Gained (OTT,
   approach, around-green, putting) normalized to 0–99 via tour percentiles;
   driving distance, accuracy (fairways hit), scrambling %, sand-save % for the
   rest. **Composure has no clean stat** — define it (final-round / major /
   playoff performance) or rate manually. **Legends predate ShotLink** — estimate
   by reputation / era-adjusted record. Decide roster size (~50 suggested).
   Deliver as clean JSON the game reads.
2. **Expenses / net-profit layer** (designed, not built). Caddie = 10% of
   winnings; travel ≈ $8k per event entered (the knob that can put a weak build in
   the red); optional ≈ $150k season coaching cost. Net = winnings − costs.
   Surface **Net** in green/red on the standings bar and summary instead of
   leading with gross. Travel figure is the tuning knob.
3. **Online mode** (future). Same build flow, then compare your season vs other
   users on a global leaderboard. Foreshadowed by in-app money-rank-vs-field.
4. **Hard mode** (optional return). Ratings hidden during the draft; pick on
   reputation.
5. **Polish backlog.** Upgrade/animate golfer figure; replace emoji flag tiles
   with SVG if reused; money tie-splitting; deeper field for realism; self-host
   fonts.
6. **Naming / handles / domain.** Confirm X handle (`@RunTheGreen` placeholder),
   final name vs "Build a Golfer," and whether it lives on a runthe.gg subpath or
   its own domain — **no production wiring until told.**

## 5. How to work with the owners

- Iterate only inside the dev sandbox. Keep the prototype runnable at every step.
- Surface decisions (stack choice, data schema, expense tuning) — don't guess.
- Before anything that could touch the live site, a remote, or a deploy: STOP and
  ASK.

## 6. Status log

- 2026-06-26: Branch set up, isolated under `build-a-golfer/`. CLAUDE.md created.
- 2026-06-26: Canonical `build-a-golfer.html` (v2, RunThePitch skin, 46 KB,
  single self-contained vanilla-JS file) added from the owner as the source of
  truth — no reconstruction. Verified locally with headless Chromium: title →
  draft → spin (8 attrs, live OVR badge) → full 8-slot draft → majors-only
  season → summary/share card all run end to end with zero page errors. Only
  console message is Google Fonts failing over the sandboxed network
  (`ERR_CONNECTION_CLOSED`), which falls back to Impact/Arial Narrow as designed.
  Nothing merged to `main`, nothing deployed.

- 2026-06-26: Footer cleanup — removed the dead "Roster Updates" pill and the
  "@RunTheGreen on X" line (no such roster feed or X account yet); added a
  "✉ Questions or Comments" pill that opens a mailto to
  `sellybros711@gmail.com` (the same Gmail RunThePitch routes feedback to).
  Redrew the draft/build golfer figure (`golferSVG`) — was a crude blob; now a
  cleaner address-pose silhouette with gradient shirt/trousers, visor, ground
  shadow, and a proper club + ball. Verified, zero page errors.

- 2026-06-26: Optimization pass (benchmarked vs RunThePitch + the build-a-X
  model). Added an offline replay/engagement layer without crossing the parked
  items (online/accounts, real SG data, expenses stay parked):
  - **Local persistence** (localStorage `bag_*`): dark-mode pref, golfer name,
    and a **career record** (builds played, best season earnings, best OVR,
    career wins/majors) with a **Hall of Fame** of top-5 builds by earnings.
  - **Your Record** overlay (replaces the dead "Leaderboard — coming soon"
    toast) + a "Your best: $X · OVR Y · N builds" line on the title once you've
    played.
  - **Visual share card** — a rendered PNG (radar + name + OVR + stat grid +
    RunThe.GG) with Save / native Share / Copy-text, replacing the plain-text
    block.
  - Killed dead-ends: "Add to Home" now fires the PWA install prompt (or iOS
    instructions); footer Home/About/Privacy/Contact are wired (Contact +
    Questions → the RunThePitch Gmail).
  Verified end to end with headless Chromium, zero page errors.
  Still NOT built at that point: online leaderboard/accounts, daily challenge,
  expenses layer, real Strokes-Gained roster.
- 2026-06-26: Second optimization round (owner picked all four next items).
  - **Expenses / net-profit layer** — caddie 10% + $8k/event travel (tunable
    `COSTS` constants); Net surfaced green/red on the standings bar, summary
    headline, share card, and career (best net). Gross no longer leads.
  - **Local achievements** — 8 badges computed per season (First Win, Major
    Champion, Grand Slam, Iron Man, In the Black, Millionaire, Money Leader,
    Against the Odds); fresh unlocks on the summary, full grid in Your Record.
  - **Daily seeded challenge** — UTC-date seed fixes the wheel order AND a
    seeded RNG (`mulberry32`) threaded through the sim, so the same picks give
    the same result for everyone (verified byte-identical across runs). One
    play/day, locked with a result overlay; free play stays unlimited/random.
  - **Online mode**: NOT built (needs backend + deploy → parked). Wrote a
    concrete design at `ONLINE-MODE-PLAN.md` to execute on deploy approval; the
    daily determinism makes server-side re-sim anti-cheat straightforward.
  All verified end to end with headless Chromium, zero page errors.

- 2026-06-26: Character customization + franchise mode (owner request).
  - **Customization** on the build screen: name (existing), skin tone (5),
    shirt colour (7), trousers (5), and right/left-handed (flips the figure +
    club). All persisted to `localStorage bag_look`; the build-hero figure
    updates live. `golferSVG` is now data-driven (`SKINS`/`POLOS`/`PANTS`).
  - **Franchise mode**: the summary now offers "Continue to Year N+1" (same
    golfer, new season) vs "Retire — Build New Golfer". Tracks a cumulative
    multi-year career (net, money, wins, majors) with a per-year list and a
    "Career · N years" section; the share card shows the year. Daily mode stays
    single-and-done (no continue).
  - **Shared RunThe.GG account** (ask #3): NOT built — it's the parked online
    piece AND it touches the live RunThePitch project (shared auth). Designed in
    ONLINE-MODE-PLAN.md ("One RunThe.GG account for every game"): recommended
    shared-Supabase-project approach, gated on two explicit approvals (deploy +
    pointing at the live project). Safe rollout = separate project first.
  Verified end to end with headless Chromium, zero page errors.

- 2026-06-26: Flow + season-viewing improvements (owner feedback).
  - **Setup-first**: customization (name, skin, shirt, trousers, handedness)
    moved to a new pre-draft `scrSetup` screen with a live figure preview —
    you set your look before you start. Both free play and daily route through
    it; removed customization from the build screen.
  - **Compact draft**: the spin reel + attribute tiles now sit above the radar
    (radar moved below) and the reel is shorter, so you pick without scrolling.
  - **Round-by-round + slower pacing**: each event shows a Thu/Fri/Sat/Sun
    mini-scorecard for your golfer; auto-advance slowed to ~2.6s (3.6s majors)
    so results are readable. (`r1/r2` now stored in `simEvent`.)
  - **Season recap** (`scrRecap`): a "Full Season Recap" button on the summary
    opens an event-by-event list (finish + money, majors starred); tap any event
    to replay its full leaderboard + your rounds.
  Verified end to end with headless Chromium, zero page errors.

### Still parked (need owner go-ahead)
Online leaderboard/accounts (backend+deploy), real Strokes-Gained roster data,
hosting/domain. Tunable knobs flagged in code: `COSTS.travelPerEvent`, sim
constants in `simRound`, `SPINS`/`reSpins`.

### How to run locally
Single self-contained file — just open `build-a-golfer.html` in a browser, or
serve the folder with any static server (e.g. `python3 -m http.server`) and open
it. No build step, no dependencies. Google Fonts (Anton/Barlow) need network; if
blocked, it falls back to Impact/Arial Narrow — flagged in §3 for self-hosting.
