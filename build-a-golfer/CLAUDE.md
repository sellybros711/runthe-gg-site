# RunTheTour (formerly "Build a Golfer") — CLAUDE.md

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

- 2026-06-26: Polish round (owner feedback).
  - **Scroll no longer jumps to top** on same-screen re-renders (e.g. picking
    customization swatches): `render()` preserves `scrollY` unless the view
    (screen+overlay+recapEvent) actually changes.
  - **Reel cleanup**: the "Press spin" placeholder reel is gone; before a spin
    you just see the Spin button. The reel only appears while spinning / after a
    reveal.
  - **Fits one screen**: tightened `.attr`/`.slot`/`.buildhero`/`.screen` sizes
    and capped the radar width, so all 8 skill choices fit on a phone without
    scrolling.
  - **Removed "No empty slots"** scout line (slots always fill under the 2-respin
    cap, so it was always-on and meaningless).
  Verified on a 430×780 viewport, zero page errors.

- 2026-06-26: Real roster (v1) + identity/draft-drama features.
  - **127-golfer roster** (owner CSV→JSON) inlined as `ROSTER` (63 current + 64
    legends), each with name/era/nation/note + 8 skills; `_meta` weights match
    the game's `CATS`. Field is now you + 127; the 36-hole cut scales to ~top
    half of the field. Balance-tested: winners ~-24 reg / -20 major (on target).
    NOTE: deeper field = harder to contend (OVR-90 build medians ~27/128). Easy
    knobs if you want it more winnable: shrink the season field, or a small
    player edge.
  - **Build identity**: archetype label (Bomber/Surgeon/Magician/Assassin/Closer
    /Sandman/Marksman/Escape Artist/Complete Player) + "plays like [real golfer]"
    (nearest by weighted skill distance over the roster) + OVR badge tiers
    (bronze/silver/gold/elite with glow).
  - **Draft drama + onboarding**: reel shows nation + scouting note; a
    "★ LEGEND / ⭐ ELITE" tag + gold glow + toast when a legend/89+ lands; a
    one-time "How it works" tip on first draft (`bag_tip_seen`); a 1×/2× season
    speed toggle (`bag_speed`).
  Verified end to end, zero page errors.

- 2026-06-26: Difficulty tuning + draft-safety.
  - **Field size → 64** (`FIELDSIZE` const). The wheel keeps all 127, but each
    season now draws a 64-player field from the roster (deterministic for daily
    via seed, random per season for free play / franchise). Re-balanced: an
    OVR-90 build now wins ~1/season with ~37% top-10s and ~63% cuts (was ~0.8
    wins / 15% top-10s vs the full 128 field). Tunable via `FIELDSIZE`.
  - **Protect the draft**: confirm-before-Reset overlay when mid-game (title
    screen still resets instantly; record/HOF are preserved either way); and a
    pull-to-refresh guard (CSS `overscroll-behavior-y:none` + a JS touchmove
    guard, since CSS alone isn't enough on iOS) so a stray swipe can't reload and
    wipe an in-progress draft.
  Verified end to end, zero page errors.

- 2026-06-26: New Masters-style header + theme (owner mockup).
  - Header is now a **cream band**: green shield crest (gold flag + putting
    green), a serif wordmark (Cinzel) — "BUILD A" green / "GOLFER" gold, all-caps
    — with a golf-ball divider line above and a double rule below, and refined
    serif **Player / Reset** pills with a swing icon + refresh icon.
  - Layout: cream page + full-width **deep-green game panel** with a gold top
    edge (content centered ~520). Replaces the all-navy full-bleed look; matches
    the mockup (cream header → green panel). Added Cinzel via Google Fonts
    (`--serif`); palette vars `--hgreen`/`--hgold`.
  Verified desktop + mobile, zero page errors.

- 2026-06-26: Expanded roster (241) + Rarity Spin.
  - Roster grew to **241 golfers** (now carries `rarity`/`born`/`majors`/`tier`).
  - **Rarity-weighted pull**: each spin rolls a bucket by fixed rates
    (`PULL_RATES`: Legendary .05 / Epic .25 / Rare .35 / Common .35 — mirrors
    `_meta.rarity_pull_rates`), then a uniform golfer from that bucket excluding
    any already revealed this draft (`S.revealed` set), with bucket re-roll +
    fallback. Verified over 40k draws: 34.4/35.3/25.2/5.1%. Uses a per-draft
    `S.drawRng` — seeded Mulberry32 for daily (reproducible, fair), Math.random
    for free play. Replaces the old uniform `S.pool` draw.
  - **NOTE on architecture**: the spec wants this **server-authoritative**. No
    backend exists yet (parked), so it's implemented **client-side** with
    `PULL_RATES` isolated as one config constant — ready to lift into backend
    config when the server draw is approved.
  - **Flourish**: reel shows rarity tag + colored glow (Rare blue / Epic purple /
    Legendary gold), a toast, and a soft WebAudio chime when a Legendary lands.
  Verified end to end, zero page errors.

- 2026-06-26: Responsive layout + polish overhaul (owner feedback: "looks
  analog/cheap, make it fill the screen").
  - **Wide & responsive**: content-heavy screens (title/setup/draft/season) use a
    full-width container (`.screen.wide`, max 1140) with a 2-column grid
    (`.cols`) that collapses to one column under 860px. Draft = action (reel +
    picks) | build (radar + scorecard); Season = leaderboard | result + controls
    (so you act without scrolling); Setup = figure | form (fits on one screen).
    Title keeps the faded golf-course backdrop, now full-width with centered
    content.
  - **Softer panels**: introduced `--panel`/`--panelb` translucent tokens and
    retinted the navy boxes (tiles/reel/buildhero/scout/sbar/board/ovr) so they
    melt into the green instead of reading as hard boxes.
  - **Re-spin button** is now solid (gold-bordered) while you have spins.
  - Smaller/raised header (wordmark 39px, tighter band).
  Verified desktop (1366) + mobile (412), zero page errors.

- 2026-06-26: Full-bleed unification + premium polish (build-a-player.com
  inspiration: "just a site, not a box" + color/polish).
  - Collapsed the cream header band + green panel into **one full-bleed deep-green
    surface** top to bottom (page bg = green with a top spotlight + bottom
    vignette; `.card` transparent; gold edge removed). Header (crest, serif
    wordmark — "BUILD A" cream / "GOLFER" gold, divider, double rule, Player/Reset
    pills) now sits directly on the green. No boxed card. Cream lives on as
    text/accent, gold accents retained for the Masters classiness.
  - **Premium depth**: layered soft shadows + inset highlights on buttons
    (replaced the flat hard offset shadows), richer gold/teal/red gradients,
    soft shadows on panels, and a background spotlight/vignette for dimension.
  - Recolored header crest/icons/rule for the green surface.
  Verified desktop (1366) + mobile (412), zero page errors.
  NOTE: build-a-player.com itself is Cloudflare-blocked to automated access;
  matched it from the owner's screenshots.

- 2026-06-26: Course-fills-screen, new golfer pose, share-card restyle (owner
  feedback).
  - **Title golf course is now full-bleed**: `.scene` is `position:fixed` over
    the whole viewport (header/content lifted above via z-index) so the dusk
    course IS the entire background on the title.
  - **Golfer redrawn** as a side-profile **address stance**: right-handed faces
    right with a widened stance and the club out front to a ball; left-handed
    mirrors it (faces left). Proper **golf cap** (brim) instead of the
    fedora-looking hat. Still driven by the look colours (skin/polo/pants).
  - Removed the clipboard emoji from "Full Season Recap".
  - **Share card restyled** to the green/gold Masters look: deep-green bg + gold
    frame, Cinzel serif title (BUILD A cream / GOLFER gold) and name, teal radar,
    cream/gold stats, "RunThe.GG" in serif.
  Verified, zero page errors.

- 2026-06-26: Title rename + follow-through golfer + female option + card stats.
  - **Title**: moved the course green/flag right and bunker left so the hero text
    is clear; removed the trophy; renamed **RunTheGreen → RunTheTour** and set the
    hero in the serif (Cinzel) logo style (cream "RUNTHE" / gold "TOUR").
  - **Golfer figure** redrawn as a **follow-through finish** pose (club high
    behind, weight forward, head up), still colour-customizable; added a
    **Male/Female** option (`look.gender`, female has a ponytail) alongside
    handedness (lefty mirrors the swing). Stylized vector, not a photorealistic
    match to the reference render.
  - **Share card** trimmed to 4 stats — **Winnings, Tour Rank, Wins, Majors** —
    and removed the `#` from ranks.
  Verified, zero page errors.

- 2026-06-26 (later): Full **RunTheTour** rebrand + new logo + figure polish.
  - **New header logo** matching the owner's RUN THE TOUR crest: stacked serif
    wordmark — small cream "RUN THE" over large gold "TOUR" (Cinzel), kept the
    shield crest + golf-ball divider + double rule + cream Player/Reset pills.
    Per owner: keep the full-bleed green surface (no cream band) — "only the word
    font and logo" mattered. Title hero changed to the tagline "YOUR TOUR STARTS
    HERE" since the header now carries the brand.
  - **Renamed everywhere**: page `<title>`, top comment, mailto subject, About
    toast, share-card title (RUN THE / TOUR), and the copy-text result
    (RUNTHETOUR …). No "Build a Golfer" brand strings remain (only two
    lower-case "build a golfer" *verb* phrases in body copy).
  - **Daily Challenge** button given its own colour — new `.btn.blue` ("blue
    tees" blue), distinct from the gold primary "Step to the Tee Box".
  - **Golfer figure** re-drawn closer to the reference render: cleaner
    follow-through with layered shading on legs/torso, white shoes + white cap
    with a polo-coloured band, gloved hands high, visible face/ear/jaw. Still
    colour-customizable (skin/polo/pants), Male/Female (ponytail), lefty mirror.
    With teal polo + white pants it reads very close to the owner's picture.
  Verified across header/title/setup-figure (M/F, R/L) and a direct share-card
  render — zero page errors.

### Still parked (need owner go-ahead)
Online leaderboard/accounts (backend+deploy), real Strokes-Gained roster data,
hosting/domain. Tunable knobs flagged in code: `COSTS.travelPerEvent`, sim
constants in `simRound`, `SPINS`/`reSpins`.

### How to run locally
Single self-contained file — just open `build-a-golfer.html` in a browser, or
serve the folder with any static server (e.g. `python3 -m http.server`) and open
it. No build step, no dependencies. Google Fonts (Anton/Barlow) need network; if
blocked, it falls back to Impact/Arial Narrow — flagged in §3 for self-hosting.
