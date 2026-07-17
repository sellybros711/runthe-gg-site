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

- 2026-06-26 (roster refresh): Replaced the inlined `ROSTER` (all 241 golfers)
  with the owner's latest rebalanced ratings (`golfers_2.csv` / `golfers.json`).
  Regenerated the JS array straight from the CSV via a parser so the values are
  faithful; kept the existing object schema (name/era/tier/rarity/nation/born/
  majors/note + 8 skills). The new data is a fuller 0–99 spread — every golfer
  has a signature spike + a real weakness (archetype methodology). Buckets:
  Legendary 24 / Epic 52 / Rare 75 / Common 90 (all non-empty, pull rates
  unchanged at 5/25/35/35). Weighted-OVR range is now 75.5–91.7 (Tiger top at
  91.7). CSV also carries `archetype`/`signature`/`overall` columns — left OUT
  of the inline data for now (unused by code; `archetype()` is computed live for
  the player's build). Easy to surface on the reveal card later if wanted.
  - **Balance note:** the old roster had a higher rating ceiling; with the new
    (lower, more realistic) numbers the sampled field is marginally weaker, so a
    cherry-picked build may win slightly more often. `FIELDSIZE=64` was tuned to
    the old data — revisit if win rates feel too high after playtesting.
  Verified: loads clean, all buckets pull, full draft (8 picks) → season runs,
  zero page errors.

- 2026-06-26 (deep audit + optimization pass). Mapped the whole game, audited
  through ~18 lenses, delivered a prioritized report, then (owner: "do everything
  to optimize the game and reachability"; "keep green, just fix teal") shipped 5
  reviewable change sets to the dev branch. Known-good tag: `audit-known-good-630a7b1`.
  - **CS1 — scaffolding + reachability:** the page was rendering in **quirks mode**
    (no doctype) with no `<html lang>`, charset, or social meta. Added doctype/
    head/body/charset/lang, meta description, Open Graph + Twitter cards,
    theme-color, inline-SVG favicon, apple-touch-icon, web manifest. Generated
    `og-image.png` (1200×630), `icon-512/192/180.png`, `manifest.webmanifest`
    beside the file. NOTE: set absolute og:url/og:image + a canonical at deploy.
  - **CS2 — UX:** draft skill rows now show a gold "TAKE" chip + hint so the core
    action reads as tappable on mobile; the dead "Player" `<div>` is now a real
    button → Your Record; share card/text lead with **Money Rank** (matches the
    on-screen headline); footer tap targets enlarged; empty radar dims/fills in.
  - **CS3 — teal:** unified the three different teals to the brand **#06A291**
    (token + DOM radar + share-card radar). Green theme kept. Golfer's teal shirt
    swatch + Spin CTA gradient intentionally left distinct.
  - **CS4 — difficulty (Monte Carlo):** the old economy gave EVERY build ~100%
    positive net + ~100% millionaire (net was meaningless; an OVR-81 could win a
    major + millions on attempt one). Re-tuned via a simulator: skill slope
    .225→.27, tighter variance (std ceiling 4.2→3.65, major mult 1.12→1.08),
    FIELDSIZE 64→96, and a real cost stack (caddie 10% + agent 8% + travel
    $20k/event + ~$2.6M/yr fixed, fixed prorated per event so in-season net stays
    sane). Result: OVR-81 wins a major ~2%/finishes red ~90%; OVR-84 ≈ break-even;
    OVR-87 contends; OVR-90 dominates. Tuning knobs all near the top
    (`simRound`, `FIELDSIZE`, `COSTS`).
  - **CS5 — instrumentation + retention + resilience:** vendor-neutral `track()`
    → `window.dataLayer` + `rtt:*` events (NO vendor script/ID — wire at deploy);
    daily **streak** with a title chip; **resume-in-progress** free-play draft
    snapshot to localStorage (refresh mid-draft → "Resume Your Golfer (N/8)").
  - Verified each set with Playwright (mobile + desktop). Final full regression:
    all modes + overlays pass, zero page errors. Nothing deployed.
  - **Audit items still open (owner to pick):** softening first-event red further
    (B), a global online leaderboard / accounts (already parked below), real
    privacy page for eventual AdSense, trimming font weights for first paint.

- 2026-06-26 (gameplay + UX batch, CS7–CS15). Big iteration from owner
  screenshots; all on the dev branch, nothing deployed.
  - **CS7 title:** flashing skill chip → continuous horizontal scrolling skill
    wheel; hero "Your Tour" → "Your Legend Starts Here" (no duplicate "Tour").
  - **CS8 avatar:** redesigned leaner/taller/athletic (smaller head, tapered
    torso, long legs) so it stops reading "childish" at small sizes. Keeps
    skin/shirt/trousers/gender(ponytail)/lefty.
  - **CS9 build screen:** wide 2-column on desktop (identity left, scorecard +
    season pick right) so it fits one screen; radar enlarged (198→236px).
  - **CS11 LIVE SEASON (headline):** tournaments now play out round-by-round
    (Thu/Fri/Sat/Sun) with a re-sorting leaderboard and a prominent live
    scorecard (position, to-par, day cells, current round highlighted). Default
    is manual **Next Event**; **Auto Sim** toggle (persisted) auto-continues;
    **Skip to End** jumps to results. Engine: beginEvent/simNextRound/
    finalizeEvent/liveOrder; cut applied after Fri. Reduced-motion = instant.
  - **CS12 share card:** removed "A RUNTHE.GG GAME" subtitle + "RunThe.GG"
    footer; card = wordmark → radar → name/stats → stat cells.
  - **CS13 summary:** wide layout, 4-up stat tiles, money list + share side by
    side; fits ~one desktop screen.
  - **CS14 off-season:** continuing a franchise year opens a tune-up — spin to
    swap skills into your bag (green ▲ / red ▼ deltas), up to 3 changes, 2
    re-spins, must change ≥1 (even if worse).
  - **CS15 career stats/leaderboards:** franchise field is now **persistent**
    across years (sampled once), so career earnings accumulate vs the same
    golfers. Summary money list toggles **This Season** vs **Career**
    (single-year vs multi-year leaderboard); career section shows the year,
    career rank, year-by-year, and a **Share Career Stats** button.
  - **CS10 UX dive:** filled the draft empty state with a Pull-Odds panel +
    bigger Spin button. Full regression after the batch: rules/record/privacy,
    full season, recap, offseason→Yr2, majors-only, daily all pass, zero errors.
  - New analytics events: autosim_toggle, offseason_*, resume, career_shared.

- 2026-06-26 (DataGolf integration spec — runthetourdatagolfspec.md).
  - **Roster** refreshed to DataGolf SG ratings (242 golfers, `golfers_5.csv`);
    added a `fld:1` flag on the 169 current/historical (data-grounded) players.
  - **§1 sim retune (data-grounded):** new per-round model measured from 246,968
    real PGA rounds — `score = BASE + courseAdj - (overall-80)*0.238 +
    gauss(0,SIGMA)`, overall 80 = tour avg. No final-round variance mult;
    composure only a ±0.4 major-Sunday mean nudge (the one non-data knob). Added
    a per-event `COURSE_SD` difficulty draw for real winner spread. BASE
    re-bisected for our field: reg `{base 0.91, sigma 2.80, csd 0.90}`, maj
    `{base 2.74, sigma 2.90, csd 1.45}` (`SIM` const). Validated vs the spec
    table (winner -15.4/-8.6, spreads, major cut). simRound now takes
    (effectiveOverall, clu, opts); old simEvent removed.
  - **§2 course fit:** `COURSEFIT` table + `eventWeights()` (renormalize to 1.0)
    + `eventOverall()`; field players carry all 8 skills; `beginEvent` computes
    each player's event-effective overall + the week's courseAdj.
  - **§3 calibrated field:** `FIELDPOOL = GOLFERS.filter(g=>g.fld)`; FIELDSIZE
    104→120; cut at top 65. Deviations from spec (flagged to owner): field runs
    mean ~82 not 80 (kept stars to 95 → BASE re-bisected); one fixed 120-field
    for the whole season incl. majors (spec wanted ~144 major) to keep cumulative
    money/FedEx standings clean; added COURSE_SD (un-specced) to match the winner
    spread targets.
  - **Economy recentre:** the realistic sim wins/pays less, so fixed tour cost
    $3.6M→$2.8M. Result: typical ~OVR-87/88 build profits ~76% / millionaire
    ~58% / ~0.5 wins per season; 85-86 ≈ break-even; weak builds red; OVR-90
    dominates (Monte Carlo over the new sim).
  - **Parked (need DG_KEY + deploy approval):** §4 live "this week" API mode,
    §5 weekly `dg_transform.py` auto-refresh. DG_KEY must stay server-side
    (never committed/logged/sent to browser).

- 2026-06-26: UI polish batch (owner screenshots).
  - **Avatar fix** — redesigned `golferSVG` arm/head block so both arms rise
    from the shoulders and converge cleanly at the grip (no broken loop/hole),
    added a white glove + up-turned head, removed the stray chin-shadow blob.
    Verified male / female / lefty across colorways.
  - **Career section** — relabelled "Career net" → **Net worth** and
    "Career money" → **Career earnings**; dropped the Best-finish tile for a
    Top-10s tile and a new **Wins list** that names the actual tournaments won
    across the career (accumulated in `S.career.winsList` with year + major
    flag, populated from `S.season.results` in the record block).
  - **Pull odds** — removed the open "Pull odds each spin" panel from the draft
    screen; odds now live in the **How-to-Play** overlay, reached via a new
    "How to play · pull odds" button on the draft screen.
  - **Season recap** — added a season stat strip (wins / majors / top 10s /
    cuts made / best finish / money), gold-highlighted won events with
    trophies, event type + purse subtitles and to-par results, plus a
    winner/gap callout and prev/next navigation in the per-event detail.
  - Verified end to end via a scripted two-year season (`recapcheck.js`): zero
    page errors, winsList accumulates across years, all screens render.

- 2026-06-26: §2 v3 — expanded course fit + **measured majors**. Owner shipped a
  much larger `course_fit.json` (110 entries / ~85 distinct venues incl. the major
  rotation in three source tiers: Augusta fully measured; Oakmont/Pinehurst/Valhalla/
  Kiawah/St Andrews/etc. measured+expert blends; older venues expert-character floor;
  clamp widened to 0.82–1.40). Replaced the repo file and the spec §2 (added the A/B
  split write-up, major-archetype fallback table, three-tier sourcing, and a new §6 IP
  note). Rewired the inlined `COURSEFIT` so the **four majors are now measured** instead
  of hand-tuned — mapped to canonical venues: Masters→Augusta National, PGA→Valhalla,
  U.S. Open→Oakmont, The Open→St Andrews (Old). The 12 regular events already matched the
  file; Scottish & 3M Opens stay neutral (no entry). Validated: all major weights
  renormalize to 1.0; tilts read true (Augusta/Oakmont reward short-game+scrambling,
  Valhalla power+irons, St Andrews driving); full-season smoke test clean — major winner
  avg −10.3, regular −16 (within spec targets), Oakmont the toughest major. Calibration
  (BASE/SIGMA) untouched — course fit only redistributes per-event weighting.

- 2026-06-26: UX batch + avatar reload + career share image.
  - **Quick fixes:** removed "· free play" from the title CTA; stripped the ⛳
    emoji from the Spin / How-to-Play buttons; renamed user-facing "FedEx
    points/rank" → **Tour Points / Tour Rank** (no FedEx wording anywhere).
  - **Auto-spin draft:** taking a skill now immediately reveals the next golfer
    (`takeAttr` calls `reveal()` when slots remain) — no second click per pick.
  - **Year-over-year skill deltas:** summary shows a "Skill changes vs Year N"
    tile strip (green ▲ / red ▼ / muted ·0) from a per-year per-skill snapshot
    stored in `S.career.skillSeasons`.
  - **Avatar fully reloaded (owner picked head-and-shoulders portrait):**
    `golferSVG()` is now a semi-realistic circular bust — polo shoulders+collar,
    neck, shaded face, almond eyes (iris/pupil/catchlight), brows, nose, mouth,
    ears, and a polo-matched cap or hair. Recolors from skin/shirt/hair/gender/
    cap. Pants & handedness no longer apply to a portrait → customizer swaps
    those rows for a **Hair** palette (`HAIRS`) and a **Cap on/off** toggle.
    `.golferfig` is now a 96px square medallion (168px on setup). Unique clip
    ids via `_figN` counter (no Math.random → daily-seed safe).
  - **Career share image:** `drawCareerCard()` renders a CAREER card (radar +
    net worth + earnings/seasons/wins/majors); career block now has Save / Share
    Career (image+text) / Copy. `shareCard()` took an optional filename suffix.
  - All verified headless (setup, build hero, summary deltas, career card) with
    zero page errors; committed on the dev branch.

- 2026-06-26: **First live deploy — hidden path (owner-approved).** Published the
  prototype to **`runthe.gg/RunTheTour`** by adding a single isolated file
  `RunTheTour/index.html` to **`main`** (the GitHub Pages branch; CNAME=runthe.gg,
  static, no build step). Deliberately **unlinked** — no nav/button anywhere points
  to it; reachable only by typing the URL. Verified the commit touched *only* that
  new folder (existing pages, `index.html`/World Cup game, and the data-sync
  workflows are untouched; sync-wc-players path filters don't match). The deployed
  file is a copy of `build-a-golfer/build-a-golfer.html` with the two relative PWA
  links (`apple-touch-icon`, `manifest`) stripped so nothing 404s at the new path.
  **Source of truth remains `build-a-golfer/build-a-golfer.html` on this prototype
  branch** — to ship an update, regenerate the stripped copy and push it to
  `RunTheTour/index.html` on `main` (same isolated method, via a detached worktree
  on `origin/main`). The guardrail now reads: main is touched ONLY for this one
  isolated folder; still no changes to the live World Cup site or its pages.

- 2026-06-26: **Link-preview fix for the live path.** Set the Open Graph / Twitter
  title to **"Run The Tour"** and added a branded 1200×630 **`og.png`** (green
  gradient, gold flag crest, two-tone wordmark, tagline) so shared links to
  runthe.gg/RunTheTour show the brand + a picture. OG/twitter image + `og:url` +
  canonical now use **absolute** `https://runthe.gg/RunTheTour/…` URLs (relative
  paths don't work for social scrapers). Updated in the source
  (`build-a-golfer/build-a-golfer.html`) and deployed to `main` as
  `RunTheTour/index.html` + `RunTheTour/og.png` (still isolated to that folder).
  NOTE: iMessage/Apple/Twitter cache previews hard — the old card can linger until
  the platform re-scrapes (Twitter: card-validator; iMessage: often needs a fresh
  thread or time). **Updating the live path now means pushing two files** (index +
  og.png) to `RunTheTour/` on `main`.

- 2026-06-26: **Dropped "PGA" from all user-facing copy** (owner request). Title/
  meta/OG/in-game text now say "pro season"; the major **"PGA Championship" was
  renamed "The Championship"** (SCHEDULE + COURSEFIT key kept in sync; Valhalla fit
  unchanged; majors are now The Masters / The Championship / U.S. Open / The Open);
  player flavor notes reworded ("major champ", "tour win", "Beat Tiger at a major",
  etc.); the data-provenance comment now says "tour rounds". OG image (`og.png`)
  re-rendered with the "Run a pro season." tagline. Verified zero "PGA" left in the
  game file, major renorm OK, no errors. Redeployed index + og.png to `RunTheTour/`
  on `main`. (Internal dev docs — this CLAUDE.md and the DataGolf spec — still
  reference the real PGA Tour data source; those aren't shipped to users.)

- 2026-06-26: **Public leaderboard (online epic, greenlit).** Reuses the existing
  RunThe.GG Supabase project (`jcrrxqfpdelrmvjuihnm`) and accounts, fully isolated
  from RunThePitch via `runtour_*` namespacing.
  - **Backend:** `supabase/22_runtour_leaderboard.sql` — `runtour_scores` table +
    `runtour_submit_season` / `runtour_season_board` / `runtour_career_board` RPCs,
    RLS public-read, **username server-attributed from `profiles`** (no client name
    to forge), **OVR-scaled earnings clamp** (~$400k/overall pt), `golfer_name`
    angle-bracket-stripped. Reads `profiles` only; never touches drafts/submit_draft/
    wc_players. **Must be applied manually in the Supabase SQL editor — I have no DB
    creds and the sandbox can't reach supabase.co (HTTP 000).**
  - **Client:** loads supabase-js 2.45.4; reuses the shared runthe.gg auth session
    (a RunThePitch login = same identity); submits each finished non-daily season;
    Leaderboard overlay reads the global single-season + career boards, escaping all
    DB strings (stored-XSS defense). **Fails open** — no supabase/network/migration →
    no-op + local fallback (verified in sandbox, zero errors). Sign-in CTA links to
    runthe.gg (session carries back). Player card + Privacy copy updated for optional
    accounts.
  - **Pending owner step:** apply `supabase/22_*.sql`; then verify live in a browser
    (sandbox can't reach Supabase). Integrity is launch-grade (name-attributed +
    clamp); skills+OVR are stored so deterministic-replay can harden it later.

- 2026-06-26: **Expanded roster + living-world Career Mode (career spec).** Swapped in
  the new `golfers.json` (242 players, with born/potential/arc_age/overall/archetype/
  data_source); `fld` now derived from `data_source`. Built the full career engine:
  aging arcs + living ratings (§1-2), retirement + alumni (§3), 2026 living-field seeding
  (§4), generated-rookie draft classes + name banks (§5), per-save `careerSeed` world that
  persists/resumes and diverges per career (§6), and sim wiring (§7) — **non-daily seasons
  use the living world** (`worldField`); the **draft pool stays peak cards** (arcade
  identity); daily unchanged. Validated: 2026 field mean 82.5 (≈ prior calibration), stable
  ~82 across 9 yrs as rookies replace retirees; **year-42 bug fixed** (peak Tiger ages out).
  Spec + status saved to `runthetour-career-spec.md`. Deployed to /golf. Tuning knobs
  (WORLD_TARGET=150, field=top-119, rookies-to-refill) flagged for review.

- 2026-06-26: **Career spec v2 → bounded aging career.** Owner shipped golfers.json
  with `pot_band` + a revised spec (Career = one bounded life). Built: §2 per-career
  potential roll (each universe develops young players differently, seeded by
  career_seed); your golfer now has an **age (entry 22)** and **declines from year 15**
  (per-skill, accelerating — off-season re-spins repair it; the year-over-year delta
  strip shows the fade), **retires** (pRetire roll + hard age-55 + voluntary button) →
  **career-end ceremony** (`scrCareerEnd`: net worth, earnings, wins/majors, best
  season, win list, share card) → **Start a New Career** = fresh 2026 universe (world
  reset). Leaderboard reworked for bounded careers: season rows carry `career_id`; the
  Career board ranks each player's **best single career** (migration `supabase/22`
  updated — still not applied). Owner decision: drafted 8 stay yours + re-spin upgrades
  (no grow-into-peak entry); the arc comes from year-15 decline + retirement. Tuning
  dials: DECLINE_START_YEAR=15, DECLINE_RATE, WORLD_TARGET=150, pot_band widths.
  Validated headless: stable→decline→retire→ceremony→reset, stat invariants hold, field
  ~82, zero errors. Deployed to /golf.

- 2026-06-27: Daily How-to refinements + daily-draft course reminder + **PWA Google
  sign-in loop fix.**
  - Daily intro `scrDailyIntro` got a "Got it — don't show again" checkbox
    (`bag_daily_howto_seen`); `startDailyChallenge` skips straight to the preview once
    set. Main How-to-Play converted from a pop-up overlay to a full-screen page
    (`scrRules`, routed via `S.screen='rules'` + Back/Got-it return) and gained a Daily
    Challenge section so the daily rules stay referenceable.
  - Daily draft screen now shows a gold reminder banner (course + conditions + the 3
    skills weighted heaviest, matching the preview's "What wins here") and stars (★ +
    highlight) the matching skill tiles. Gated on `S.daily`.
  - **Auth bug (installed PWA, Google sign-in):** on OAuth return, `onAuthStateChange`
    (SIGNED_IN→`sbApply`) consumed `rtt_oauth_pending` before `getSession`'s remember-me
    gate read it, so with "Keep me signed in" unchecked the gate saw `oauthReturn=false`
    and immediately signed the user back out — toast said "Signed in as X" while the
    header still read "Sign in", looping forever. Fix: capture `oauthReturn`
    SYNCHRONOUSLY at `sbInit` top from `localStorage` **and the URL**
    (`access_token|code|refresh_token`) before createClient cleans the URL / any event
    fires. Also defaulted "Keep me signed in" to checked (records an explicit opt-out via
    `rtt_chose_remember` so unchecking is respected), matching home-screen-app
    expectations. Verified headless (checkbox states, regex, parse) zero errors.
    Deployed to /golf.

- 2026-06-27: **Daily completion + streak now per-account.** Bug: `bag_daily`
  (daily done/result) and `bag_streak` were stored device-global in localStorage,
  keyed only by the UTC day — so whoever played the daily on a browser marked it
  "done" for EVERY account that later signed in there (reported: signed into
  Jordan's account, saw "Daily Challenge · Done" + a streak he never earned). Fix:
  `acctKey(base)` suffixes the key with the signed-in user id (`base@<uid>`) when
  signed in, guests keep the unscoped key; routed `dailyState`/the two `bag_daily`
  writes + `bumpStreak`/`streakDisplay` through it. Each account now has its own
  one-play-per-day + streak on the device (true global one-per-day still waits on
  the Phase-3 backend). Verified headless: guest done ≠ Jordan done, streaks
  isolated, zero errors. Deployed to /golf.

- 2026-06-27: **Daily Challenge → 3 attempts/day, best score counts.** Each account
  may now play the daily up to `DAILY_MAX_ATTEMPTS=3` times/day; the LOWEST round of
  the day is the one logged to the leaderboard/course record (`recordCourseScore`
  already keeps the best, called every attempt). New `bag_daily` shape (per-account
  via `acctKey`): `{date, attempts, best, result}` (+ compact `holes:[{par,toPar}]` on
  results so the scorecard redraws after reload); helpers `dailyAttempts`/
  `dailyAttemptsLeft`/`dailyBest`; `dailyDoneToday` now = attempts ≥ max (back-compat:
  old `{done:true}` counts as 1). `startDailyChallenge` → if attempts remain & already
  played, shows the result screen with **Play again (N left)**; `beginDailyAttempt`
  starts a fresh draft and salts ONLY the draft wheel by attempt # (`seed ^ … ^
  (att+1)*0x9e3779b1`) so each of your 3 plays offers a different draft while the
  course/conditions/hole-sim stay day-seeded (fair, server-verifiable; everyone's Nth
  attempt is identical). Result screen shows attempt #, best-of-day, "new personal
  best!"; title button shows "Daily Challenge · N left" + best; done overlay shows
  best-of-day + "all 3 attempts used". Verified headless: attempts 1→2→3, best tracks
  lowest, record=best, done overlay on 4th, Play-again UI, zero errors. Deployed to
  /golf. (Still local per-device until the Phase-3 backend enforces it globally.)

- 2026-06-27: **Daily round now auto-plays (minimal clicks).** Replaced the
  click-every-hole / skip-to-end choice with a self-advancing round: holes play
  themselves ~0.82s apart (so you watch the scorecard + notation fill), pausing ONLY
  at signature holes for the Attack / Play-Safe decision (the one meaningful input).
  New: module-level `_dailyTimer` + `scheduleDailyAdvance` (chains `setTimeout` →
  `playDailyHole(null)`; stops to wait at `nextDailySig()`; auto-runs `finishDailyRound`
  after hole 18), `clearDailyTimer`, `dailyPause`/`dailyResume`, `S.dailyAuto` (default
  true, set in `beginDailyRound`). `playDailyHole` schedules the next tick; signature
  Attack/Safe resume the flow. Controls: ⏸ Pause → manual (Play hole N + ▶ Resume +
  Mulligan), Skip to result ⏭ (`autoFinishDaily` now fills + goes straight to result).
  `render()` clears the timer when leaving `dailyround`; timer callbacks guard on
  screen. Verified headless: 18-hole round completes with only the 3 signature clicks
  (Augusta 12/13/15), Pause holds, Skip jumps to result, zero errors. Deployed to /golf.

- 2026-06-27: **Daily objective = "beat the tour average" + in-depth course
  descriptions.** Each of the 16 courses gained (a) a much longer, in-depth blurb
  (~500-600 chars: architect/history, the test, signature stretch, what wins) and
  (b) two numbers: `avg` = the venue's real PGA field scoring average vs par (the
  benchmark to beat — Oakmont +4.5 … Kapalua -2.0), and `cdiff` = a Monte-Carlo
  calibrated course-difficulty constant. `dCourseDiff` now returns `cdiff` (fallback
  to the old length-per-par heuristic), so an average tour pro (OVR 80) shoots each
  venue's real average — verified via inversion harness (scratchpad invert.cjs):
  win80 ≈ 43-56% everywhere, a drafted ~86 build wins ~61-73%, weak ~78 ~38-50%.
  This fixed the flagged "difficulty is length-only" limitation (Oakmont was mid-pack)
  AND makes "beat the average" a uniform, meaningful objective. UI: preview shows a
  gold "Your target · beat the tour average" card; round screen shows the target +
  ahead/behind pace; result headline is 🏁 beat / short with margin; `won` (= best
  total < avg) stored in result; title button + done overlay reflect beaten/short.
  The averages are realistic estimates (DataGolf still network-blocked) and live in
  the course data — easy to tweak. Verified headless: parse, 16/16 have avg+cdiff,
  win at Oakmont +2, loss at Kapalua -1, zero errors. Deployed to /golf. NEXT (user
  asked): shot-by-shot in-hole simulation.

- 2026-06-27: **Daily round now plays shot-by-shot (PGA "play-by-play" style).** The
  per-hole SCORE is still the fair, seeded engine result; `dShotSeq(par,yards,strokes,
  rng,opts)` expands that stroke count into a plausible shot narrative (drive → approach
  → putts → "In the hole" + result tag), e.g. "Drive 325 yds to left rough, 198 yds to
  hole" / "Putt 47 ft 8 in., 3 ft 2 in. to hole". Seeded per hole (`dHoleRng(...,0x5407)`)
  so it's reproducible; regenerated on mulligan. Shot count always equals the score
  (regression: 2160 combos, 0 mismatches). Each played hole carries `shots`; the round
  screen renders the just-played hole as a `.shotpanel` with rows that cascade in
  (`SHOT_STAGGER=130ms` CSS animation; reduced-motion = instant). Auto-advance dwell now
  scales with shot count (`dailyDwell()`) so each hole's cascade finishes before the next
  hole. Verified headless: hole panel renders, full auto round completes 18 holes with
  signature prompts, zero errors; screenshot matches the inspiration. Deployed to /golf.
  (Helpers: `dFeet`, `dResultLong`, `dPick`, `dShotPanel`.)

- 2026-06-27: **Shot narrative is now golfer-specific + "go lower" after a win.**
  - `dShotSeq` takes the build's skills and (a) biases every shot's lie/proximity by the
    relevant rating — low accuracy → tee shots in rough/bunkers/trees, weak approach →
    missed greens, weak short game → longer chips, weak putting → loose lags/missed
    short putts — and (b) attributes the strokes lost over par to the build's weakest
    area (putting vs ball-striking), so the struggle is visible in the play-by-play even
    though the SCORE is unchanged (engine-fixed). Verified: a weak putter 3-putts ~86%
    of bogeys, a weak driver/approach misses the green ~81%; elite finds fairways/greens.
    Helpers `dSk`/`dSkQ`/`dBallQ`; call sites pass `S.dailySkills`. Regression: 4320
    combos, 0 stroke-count mismatches.
  - Beating the pro never consumes attempts (already true) — reframed the UX to push it:
    win banner "🏁 You beat the pro!" + "Challenge cleared — use your N remaining
    attempts to go even lower and chase the course record", and the replay button becomes
    "Go lower ▸". Verified headless, zero errors. Deployed to /golf.

- 2026-06-27: **Shot narrative: penalty drops + club selection.** `dShotSeq` now names
  the club on every full shot (`dClub(yds)`: driver→…→lob wedge; e.g. "8-iron from 168
  yds to the green"), and injects water/OB **penalty drops** ("Driver — pushed into the
  water hazard" / "Penalty drop, 309 yds to hole") on blow-up holes — only when there are
  ≥2 extra long strokes to spend, likelier for loose ball-strikers (prob 0.14+0.52·(1−ballQ)),
  so penalties explain doubles/triples. Rewrote the long-shot loop as a played/need state
  machine so a 2-stroke penalty episode keeps the total exact; advance-vs-missed-green is
  distance-based (>205y must advance) so a re-tee isn't mislabeled a green miss. Each line
  sentence-cased. Verified: 5760-combo regression 0 mismatches, no bad narration, penalties
  surface ~13% over a score-heavy test (≈0–1.5/round for weak builds, ~0 for elite), zero
  errors. Deployed to /golf.

- 2026-06-27: **Daily Challenge Phase 3 — backend (global board + course records).**
  `supabase/24_runtour_daily.sql` (mirrors 22/23; owner applies in the SQL editor — sandbox
  can't reach supabase.co). Table `runtour_daily_scores` unique (user_id, day), upsert keeps
  the LOWER to_par (= best of the 3 attempts); `runtour_submit_daily` (SECURITY DEFINER,
  username from `profiles`, to_par clamped to an OVR-scaled floor); reads
  `runtour_daily_board(day)` (today's global board), `runtour_course_records()` (all-time
  holder per course), `runtour_my_daily(day)`. RLS public-read, writes via definer only;
  stores ovr+skills+decisions for a future deterministic re-sim. Client (fails open):
  `sbSubmitDaily` posts the new best after each improving attempt (queued in `_pendingDaily`
  until sign-in); Course Records overlay now shows Today's global board (`dbLoad`) + all-time
  records (`crLoad`, merged into local so the preview shows the true global record). Caches
  `crCache`/`dbCache` cleared on submit/sign-out. Verified offline end-to-end, zero errors.
  Deployed client to /golf. **PENDING OWNER: apply `supabase/24_runtour_daily.sql`** (and
  22/23 if not yet), then verify live in a browser.

- 2026-06-27: **Signature-hole decision scenarios (course-aware risk/reward).** Replaced
  the generic Attack/Play-Safe prompt with a specific dilemma drawn from the hole's real
  hazard + your situation. `DSIG_HAZ` tags every signature hole (all 16 courses) with its
  feature (island / water-front / water-green / water-l|r / cliff / creek / bunker /
  drivable / short4 / wind / long / elevated / go5); `dScenario(course,i,total,av)` builds
  a vivid prompt (computed shot distance, pin side, hazard) + tailored Attack/Safe labels
  & risk subs, and `dSitLine` prepends a pressure line on closing holes ("You're N off the
  tour-average pace with H to play…" / "N clear … protect or press?"). Wired into
  scrDailyRound's signature branch (buttons still call playDailyHole(true/false) — mechanic
  unchanged). Covers the owner's examples: water+pin approaches, behind/ahead-the-average
  late, and downhill/bunker risk flavor. Also this batch: tap-a-played-hole to view its
  shot log (S.dailyViewHole) + analytical Strength/Weakness scouting notes (scoutingNote,
  Strokes-Gained framing, varies by build). Verified across courses/situations, zero errors.
  Deployed to /golf.
- 2026-06-27: **Signature scenarios → varied real decisions (not all "attack/safe").**
  Rebuilt `dScenario` as a candidate-template library: for each signature hole it
  assembles every decision that fits the shot type + hazard + conditions — pin-hunt vs
  fat-of-green, between-clubs (hard X vs smooth Y), carry-the-hazard, longest-club par-3,
  cliff carry, tee-shot line (driver down the edge vs 3-wood to the fairway), drivable
  driver-vs-wedge, short-par-4 strategy, go-for-it-in-2, rip-driver-to-reach, long-par-5
  layup positioning, downhill release, deep-bunker thread, stiff-wind knockdown — plus
  situational ones (behind/ahead of the tour average late: force it vs stay patient /
  press vs protect) — then seed-picks one (stable per day/hole, favouring situational
  ~45% when it applies). Each scenario carries two `opts` with an `agg` flag, so the
  buttons (red=aggressive, gold=conservative; no "⚡Attack/🛡Safe" wording) map to
  playDailyHole(agg) regardless of order. Verified variety across courses/types/seeds,
  zero errors. Deployed to /golf.

- 2026-06-27: **Fixed near-identical scorecards across the 3 daily attempts.** Bug: the
  per-hole RNG was seeded only by (day ^ course ^ hole), NOT the attempt number, so all 3
  attempts faced the SAME per-hole luck — with a similar build the cards came out nearly
  identical (only holes near a scoring threshold flipped). Fix: `dAttSalt(base)` folds
  `S.dailyAttempt` into every daily hole seed (sim, shots, mulligan, scenario), so each of
  the 3 attempts plays out differently while staying deterministic + server-verifiable per
  attempt (attempt# now also stored in the submitted `decisions`). Verified: an identical
  build across attempts 0/1/2 now differs on 7-12 of 18 holes (was 18/18 identical), zero
  errors. Deployed to /golf.

- 2026-06-27: **Per-build independent luck (different lineups now play differently).**
  Deeper root cause behind the "identical scorecards": the per-hole gaussian was seeded by
  (day^course^hole) only, so EVERY build shared the same luck draw on each hole — the build
  only nudged the mean (~hundredths/hole), so even 3 different lineups (bomber/putter/
  balanced, OVR 84–88) scored 17–18/18 identical. Fix: `dBuildSeed()` hashes the 8 drafted
  skills into the hole seed (folded into `dAttSalt` alongside attempt). Now each lineup gets
  its own shot-execution variance — 3 different builds differ on 8–12/18 holes — while skill
  still drives the mean (OVR92 −2.4 / 86 −1.0 / 74 +1.8 avg) and it stays deterministic +
  server-verifiable (re-sim from stored skills+attempt). Round SD ~2.86 (real PGA ~2.8–3.1).
  Tradeoff accepted: we drop the "everyone faces identical luck" property (which was what made
  builds barely matter) for realism; best-of-3 still mitigates luck. NOTE: per-HOLE difficulty/
  variance fidelity (which holes are birdie vs disaster holes) is still derived from length+
  archetype+course avg — real DataGolf hole-scoring data could refine that later (needs DG_KEY
  + server side), or approximate via hole-archetype variance. Deployed to /golf.

- 2026-06-27: **Per-hole variance pass — risk holes play dramatically, standard holes
  steady.** Added `DCFG.VAR` (variance multiplier by archetype): p4m 0.88 / p3s 0.95 /
  p3m 0.98 / p5l 1.00 / p5m 1.08 / p4l 1.12 / p3l 1.14 / p5r 1.24 / p4d 1.30. `dSimHole`
  multiplies sd by `VAR[dArch(par,yards)]`. Net overall SD held at ~2.94 (LATENT_S back to
  0.92 — the profile is variance-neutral, just redistributed). Result: a mid par-4 is 71%
  par (almost no drama); a drivable par-4 / reachable par-5 / long par-3 spread BOTH tails
  (eagle 1-2% + birdie ~25% AND double 3-4% + triple 1-2%) — hole CHARACTER now drives the
  outcome shape. Re-derived per-course `cdiff` (Monte-Carlo inversion) so OVR-80 still
  centers on each tour average — verified dead-on (Augusta 1.80, Oakmont 4.50, Kapalua
  -1.99, etc.); win80 ~44-56%, win86 ~62-73%. Lineups still diverge 9/18. Deployed to /golf.
  DATAGOLF: NOT needed for this — archetype variance covers it. Real per-hole DG scoring
  distributions (the exact birdie/par/bogey/double rate of each specific hole) would only be
  a fidelity refinement; drop-in ready (course difficulty is already a per-course constant).

- 2026-06-28: **Real DataGolf benchmarks + distribution-shape calibration.** Owner ran a
  5-year (2021-25) historical-raw-data pull (event-list → /rounds, round-level aggregates)
  and supplied the JSON. Replaced the ESTIMATED `avg` (tour scoring average vs par) on the
  12 courses we have real data for with the measured figures (round-weighted where DataGolf
  split a venue across labels — TPC Sawgrass Stadium, TPC Scottsdale, Bay Hill, Quail Hollow
  each merged): Augusta +1.8→+1.41, Sawgrass +0.6→+0.27, Pebble -0.4→-1.27, Oakmont
  +4.5→+4.18, Scottsdale -1.0→-0.89, Bay Hill +1.2→+0.99, Harbour Town -0.3→-0.91, Quail
  Hollow +1.0→+0.96, Muirfield +1.4→+1.26, Valhalla -0.5→-0.43, East Lake -0.2→-1.82,
  Sedgefield -1.0→-0.85. 4 courses had no data in the pull (no Travelers/Sentry/St Andrews
  event matched) so their estimates are kept: St Andrews +0.3, River Highlands -1.5, Kapalua
  -2.0, Glen Abbey -1.0. Then **reshaped `DCFG.TH`** to fix a systematic shape bias the real
  outcome buckets exposed (sim had too many pars, too few bogeys, too many doubles — a
  "par-or-disaster" feel): par 0.856→0.78, bogey 1.68→1.95, double 2.20→2.55, eagle
  -2.65→-2.70 (widens the bogey band, pushes the double/triple tail out). Grid-searched 5
  candidates vs the real distribution; winner cut per-course distribution error from 1.56 to
  0.67. Re-derived every `cdiff` (Monte-Carlo inversion, 40k rounds/course) so an OVR-80
  balanced pro still centers on each venue's real average — verified dead-on (Augusta 1.40,
  Oakmont 4.18, Pebble -1.27, East Lake -1.80...). Final end-to-end check vs DataGolf's
  eagle/birdie/par/bogey/double rates: aggregate sim [0.10,3.54,10.97,2.98,0.41] vs real
  [0.09,3.49,11.01,2.98,0.43] — bogeys and blow-ups now realistic on every course. Pure
  data/threshold change, no structural JS. Deployed to /golf. (DG_KEY stays server-side; the
  supplied JSON carries no key. Per-individual-hole difficulty is still archetype-derived —
  the /rounds feed is round-level, not hole-by-hole — so that remains a future fidelity
  refinement only.)

- 2026-06-28: **Live Tour Rank on the season stat bubble + Google sign-in feedback.**
  (1) Tester asked for a live FedEx-style Tour Rank "top right of the stat bubble, right of
  the red money." Added a `Tour Rank` cell to the `.sbar` on the live season screen
  (scrSeason): net-profit tile now spans 3 cols (`.sstat.w3`), a gold `.sstat.rankcell` sits
  in the 4th (top-right) showing `#rank / of N`. Rank = your position on the season **points**
  list (same accumulator the summary's FedEx rank uses — `S.season.totals[*].points`, added
  per event at finalize), so it updates live every event; shows `—` before event 1.
  (2) Google sign-in "took a while, popped up mid-sim" — after the OAuth redirect the token
  exchange + profile fetch take several network round-trips, so the page looked signed-out and
  the confirmation landed mid-gameplay (felt broken). Added `S.authPending`: set synchronously
  in sbInit when an OAuth return is detected, cleared in sbApply (15s safety timeout). Renders
  a persistent "Finishing Google sign-in…" pill (spinner) so the wait reads as in-progress.
  Pure UI; no auth-logic change. Verified via Playwright (season sbar renders Tour Rank, pill
  shows, no console errors). Deployed to /golf.
  STILL OPEN (tester feedback): "too complicated / overwhelmed with text / visually too much"
  for a non-golfer — needs a scoping decision before a simplification pass (which mode, how far).

- 2026-06-28: **Daily Challenge — declutter + plain-language for non-golfers.** Tester
  feedback: a non-golfer ("Gelch") was "overwhelmed with text," "had no idea what it was
  saying," "too complicated for the average user." Owner chose: focus **Daily Challenge**,
  do **both** (explain jargon + trim clutter). Changes:
  • **Shot-by-shot now opt-in (biggest trim).** `dShotPanel` defaults to a single result line
    (e.g. "PAR") with a `▾ Shot-by-shot (N shots)` expander instead of dumping 3-5 jargon-heavy
    play-by-play rows per hole. Pref persists (`bag_daily_shotdetail`); `▴ Hide` collapses
    again. `dailyDwell` shortened to a flat 720ms in simple mode (no cascade to wait on) so
    auto-play feels snappier. The play-by-play is preserved in full for fans, just behind a tap.
  • **Plain-language scoring primer (explain).** `dLegend()` adds a one-time, dismissible
    "New to golf?" card on the round screen: explains score-vs-par (−/E/+, lower wins) and the
    circle=under / box=over card notation. Persists `bag_daily_legend_seen`.
  • **Preview trimmed.** Long course blurb collapses to its first sentence + `Read more`
    (`S.dailyBlurbOpen`); game-plan copy shortened ("Pick how boldly to play. You'll still make
    the big calls on the signature holes."). CSS: `.restag/.shotsum/.shottoggle/.legendx/
    .blurbmore`. Verified via Playwright (collapsed→0 rows + result tag + legend; expand→rows +
    pref saved; legend/blurb toggles persist; no errors). Deployed to /golf.

- 2026-06-28: **PWA safe-area fix + global course records everywhere.** (1) Tester on an
  installed iOS Home-Screen PWA couldn't tap the ≡ menu — it sat under the translucent status
  bar (we use `viewport-fit=cover` + `black-translucent`, so the web view extends under the
  notch). Added safe-area insets: `.head` top padding now `calc(10px + env(safe-area-inset-top,
  0px))`; `#app` padded by `env(safe-area-inset-left/right/bottom)` too (landscape notch + home
  indicator). Degrades to the old look in normal browsers (insets=0 → 10px, verified). (2)
  Owner applied `24_runtour_daily.sql` (success) and wanted course records global. The pipeline
  already existed (`crLoad()` → `runtour_course_records` RPC → merges the global record + holder
  into the local store; the records overlay shows it), but the record shown on the daily
  PREVIEW and RESULT screens read the local store, which only got the global merge after opening
  the overlay once. Added a proactive `if(sb && crCache===null) crLoad();` to both screens so
  the course-record box is global everywhere, not just in the overlay. Deployed to /golf.

- 2026-06-28: **Full-screen overlays + smooth scrolling + 2 tester quick-fixes.** Tester:
  leaderboard popup was an awkward floating card and scrolling felt stuck/janky in places.
  • **Overlays are now full-screen.** Root cause of the floating look: `.ov` was
    `position:absolute` inside `.card` (z-index:1), which sits BELOW `.head` (z-index:2), so
    the header bled over it. Fixed: `.ov` → `position:fixed; inset:0; z-index:40`, opaque brand
    bg (`var(--pagebg)`), safe-area padding, centered 600px content column on desktop, own
    momentum scroll (`-webkit-overflow-scrolling:touch; overscroll-behavior:contain`). Also
    moved the overlay mount point from `screen` → `app` (top level) in render() so its z-index
    actually wins over the header/footer. `body.ovopen{overflow:hidden}` locks the page behind.
  • **Scroll jank fix.** Removed `background-attachment:fixed` from body (forces a full-screen
    repaint every scroll frame → mobile stutter); replaced with a COMPOSITED `body::before`
    fixed backdrop (same gradient, no repaint cost). render() now preserves the overlay's own
    scrollTop across async re-renders (e.g. leaderboard/records board loading) so it no longer
    jumps to top.
  • **Jordo quick-fixes:** (a) signature-holes list on the preview is now sorted first→last by
    hole number (`[...c.sig].sort((a,b)=>a[0]-b[0])`) — was showing 18/7/17. (b) the Attack/Safe
    decision buttons now read as one choice: both use a single neutral `.btn.choice` style with
    an "or" divider between them and a ⚡/🛡 marker (were red vs gold, which looked like
    different kinds of actions). Verified via Playwright (overlay covers viewport + body locks +
    unlocks; sig order [7,17,18]; 2 choice buttons + ordiv; no errors). Deployed to /golf.

- 2026-06-28: **Rotating tour schedule + a personality for every course.** Owner wanted a
  schedule that rotates year to year so a career doesn't replay the same smaller tournaments,
  then settled on **20 events/season**: keep 13 CORE events + rotate 7. Replaced the flat
  18-event `SCHEDULE` with `ANCHORS` (13 — 4 majors, The Players, the marquee signatures
  Kapalua/Pebble/Bay Hill/Memorial/Travelers, the FedEx playoffs St. Jude + BMW, and the Tour
  Championship finale) that recur EVERY year, plus `REG_POOL` (20 regular events).
  `seasonSchedule(year, careerSeed)` = anchors + a rotating window of `REG_PER_SEASON=7` regulars
  (walks a `REG_STRIDE=4` stride through a per-career shuffle), merged + sorted by a new `wk`
  calendar slot. Result: 20 events, 4 majors always, ~4 of the 7 small events swap each year
  (3 carry → realistic turnover), pool cycles across a career. Seeded by `careerSeed` →
  deterministic within a save (resume-safe), unique per career. `startSeason` builds via
  seasonSchedule (majors-only → `majorsSchedule()`; daily/fallback → default `SCHEDULE`).
  **Every venue now has a course personality:** added COURSEFIT entries for all rotating
  regulars + both playoffs (Torrey/Riviera/Colonial/Innisbrook/PGA National/Waialae/etc.),
  using the established {driving, approach, shortgame, putt} multiplier scheme so builds play to
  type (e.g. a bomber rates highest at long Farmers, a precise iron player at Colonial). Anchors
  keep their measured major/signature fits; zero events fall back to neutral now. Verified via
  Playwright (20 events, 13 anchors, 4 majors/yr, regs rotate ~57%, every event has a fit,
  deterministic same-seed, personalities shift effective overall, season runs clean). Deployed.

- 2026-06-28: **Trophy only on the final leaderboard.** Tester: mid-round the live leaderboard
  showed 🏆 next to the leader(s) (e.g. two players tied -6 in round 3 both had trophies). Fixed
  `liveRow(o,pos,you,done)` — it now takes the event's `done` flag and shows 🏆 only for a SOLO
  winner once the tournament is final; mid-round the leader is just `1` / `T1`, and a final
  playoff tie shows `T1` (never a double trophy). One-line change + pass `ce.done` from scrSeason.
  Verified via Playwright unit test of liveRow (mid solo→1, mid tied→T1, final solo→🏆, final
  tie→T1). Deployed to /golf.

- 2026-06-28: **Season-results share cleanup (career card → career end only).** The per-season
  summary showed TWO share cards (a full Career card with Save/Share Career/Copy Career Text AND
  the Season card) — cluttered. Removed the career share card + its three buttons from scrSummary
  (kept the career STATS: net worth, rank, wins list, year-by-year); added a one-line note that
  the shareable career card unlocks at career end. Career sharing already lives on scrCareerEnd
  (unchanged). Reworked the "Share your season" block for conversion: a hook line ("Post your card
  and dare a friend to beat your number."), a single prominent goldfill **↗ Share my season** CTA
  (with "Card + caption, ready to post"), Save card + Copy text demoted to secondary ghost buttons
  side by side, bigger card (320px). Punchier share caption with a play CTA ("Think you can build
  better? → runthe.gg/golf"). Verified via Playwright (2-yr career summary: only 1 canvas now,
  no Share-Career button, unlock note present, Share-my-season present, no errors). Deployed.

- 2026-06-28: **Win celebrations (tournament + major).** Owner: winning didn't feel rewarding —
  it just rolled to the next event. Added a full-screen, skippable celebration that fires the
  moment you finish 1st (once per event via `ce._celebrated`), pausing auto-advance until
  dismissed; it drives the hand-off (Continue/tap → advanceEvent if auto, else the normal
  Next/Results button). **Tournament win (~2s, auto-continues):** opaque green "stage", a gold
  trophy that springs in (CSS), "CHAMPION" + event, the cheque counting up. NO confetti (per
  owner). **Major win (bigger, waits for Continue so Share is reachable):** dark spotlight stage,
  a **custom-drawn SVG trophy per major** (green jacket = Masters, Claret Jug = The Open,
  Wanamaker = PGA/'The Championship', gold cup w/ red-white-blue = U.S. Open), themed kicker +
  accent, two-corner **confetti cannons** (gold + the major's accent), "MAJOR CHAMPION", "Nth
  career major" tally (guarded ≥1), haptic buzz, and a **Share win** button → a branded major
  win card (drawMajorWinCard) + caption via shareCard. Pure vanilla: rAF confetti (auto-stops),
  CSS keyframes, reduced-motion safe (no particles/animation, still shows + dismissible).
  Trigger lives in scrSeason scheduling; helpers (trophy SVGs, confettiRun, celebrateWin,
  drawMajorWinCard, shareMajorWin) above scrSeason. Verified via Playwright (regular: no
  confetti/no Share; all 4 majors render distinct trophies + confetti + Share; cheque counts up;
  Continue/tap dismiss; share card art; no console errors). Deployed to /golf.

- 2026-06-28: **Normal win auto-advances after 2s.** Tweaked the celebration: a tournament win
  now always advances to the next event ~2s after the celebration (was: only advanced when Auto
  Sim was on; otherwise it dismissed to the Next-Event button). `finish()` always calls
  advanceEvent now; Continue/tap advance too. Majors still wait for Continue (so Share stays
  reachable). Verified via Playwright (regular w/ autoSim off advances idx+1 after 2s; major
  doesn't auto-advance, Continue advances). Deployed to /golf.

- 2026-06-28: **Career difficulty pass — slower climb to #1, more strategy.** Owner: reaches
  "best in the world" within ~3 years every time; wants year-to-year upgrades harder + more
  skill/strategy. Diagnosis: off-season was a one-way ratchet (3 changes + 2 re-spins, only-take-
  upgrades, see all 8 skills → cherry-pick), no decline till yr15, field ceiling can't rise, and
  OVR slope (0.238/pt) makes a small edge dominant. Shipped the recommended "a little harder"
  bundle (AskUserQuestion tool was erroring; went with the flagged recommendation, all tunable):
  • **Diminishing high-OVR upgrades (core fix):** new `offCap(cur,rolled)` — gains below 84 apply
    full, 84-90 at half, 90+ at quarter (downgrades apply fully). `offTake` + the off-season grid
    use it, so a Legendary pull lifts an 80 slot to ~88 and an 89 slot only to ~91 (+2). Early
    development stays quick; the last stretch to elite is a multi-year grind. Copy updated.
  • **Earlier, age-modeled decline:** `DECLINE_START_YEAR` 15→10; rates retuned so power fades
    first (dist 1.9) while finesse/experience hold (put 0.6, clu 0.2) — a real prime window, and
    late career you adapt your build.
  • **Generational phenoms:** genRookie rare tail (2%) now ~94-97 potential (clamp 97), so the
    world's top keeps rising and #1 stays contested (you can be overtaken). ~1.3% of rookies 94+.
  Kept 3 changes / 2 re-spins (didn't over-nerf). Verified via Playwright (offCap curve, swap
  applies capped value, decline yr=10, phenom rate, off-season renders clean, no errors).
  Deployed to /golf. NOT done (offered, await go-ahead): training-points off-season model,
  build-shape/course-fit weighting, fatigue/schedule strategy, clutch-in-majors.

- 2026-06-28: **Reverted the off-season soft-cap** (owner: "remove the soft cap, keep it how it
  was"). `offCap` removed; `offTake` + the off-season grid + copy restored to the original behavior
  — a swapped skill applies the rolled value in full again. KEPT the rest of the difficulty pass
  (DECLINE_START_YEAR=10 age-modeled decline; generational phenoms 94-97) since only the soft cap
  was called out. Deployed to /golf.

- 2026-06-28: **Major celebration respects Auto Sim.** With Auto Sim ON, the major win popup now
  shows NO buttons (no Continue/Share) and auto-advances (~2.6s) instead of blocking on Continue.
  With Auto Sim OFF it's unchanged (Continue + Share, waits for the tap so Share stays reachable).
  `celebrateWin` gates the actions block + timeout on `opts.auto`. Verified via Playwright (major
  +auto: no buttons, advances; major manual: buttons present, waits). Deployed to /golf.

- 2026-06-28: **Performance-based aging (replaces the flat year-N decline).** Owner: year-10
  decline is unrealistic — pros peak in their 30s, sometimes early 40s; wants it age- AND
  performance-driven. Rebuilt `applyPlayerDecline`: career-year → age (`START_AGE=22`,
  age=22+(year-1)); NO decline through `PEAK_END_AGE=34`. Each off-season computes `seasonForm`
  (earnings rank vs field, centered so mid-pack≈0, +wins/majors → −1..+1) and banks it into
  `S.career.primeBank` (clamped −2..+6) = a "play young" buffer. `effAge = age − primeBank`;
  decline only past 34, ramping `min(1.8, (effAge−34)/6)` (subtle mid-30s, steeper into 40s),
  power (dist 1.9) fading first, touch/composure (put 0.6/clu 0.2) last. Verified (90-bag sim):
  dominant career declines ~age 42 (dist 90 at 40), average ~37 (86 at 40), slump ~34 (78 at 40);
  putting barely moves. `DECLINE_START_YEAR` removed; UI "declining" hints + skill-delta section
  now use `pastPeak()`; off-season shows a prime/age status line ("In your prime…" vs "Age is
  catching up — power fades first…"). primeBank persists on S.career (save/resume safe; old saves
  default 0). Deployed to /golf.

- 2026-06-28: **Engagement pass v1 (free-tier retention) — share + streak rule + badge hints.**
  From the deep-analysis list, owner picked specific items (and rejected others), so this shipped:
  • **Wordle-style daily share (#1):** `dailyShareText` builds an emoji scorecard (🟦eagle 🟩birdie
    ⬜par 🟨bogey 🟥dbl+, 9/line) + course, score, beat-the-pro ✓, 🔥streak, and a runthe.gg/golf
    CTA; `shareText()` uses navigator.share→clipboard. Prominent "Share your result" button on the
    daily result. **Percentile** ("Better than X% of today's N players") from the live daily board
    (dbCache, fails open).
  • **Streak now requires BEATING the tour average (#2):** `bumpStreak` is only called on a win
    (in any of the 3 attempts); a non-win day doesn't advance it. **Streak freezes** bridge one
    missed day (earned at the 7/30/100-day milestones); milestone recognition on the result.
    Title shows ❄️ freeze count; result nudges "beat the average to keep your streak."
  • **Badge next-tier hints (#3, replaces a separate Goals panel):** `_badgeFresh` now computes the
    next tee's requirement; new `badgeEarnedHTML` shows "earned · next {Tier} at {N}" on the season
    summary + career-end. Tells you exactly what the next badge level needs.
  Trialed then REMOVED per owner direction: standalone Goals panel, Weekly Daily Cup (#4), and the
  XP/Level glue (owner doesn't want daily↔career linked, #7). Verified via Playwright (win advances
  streak, loss doesn't; share grid; percentile; badge hint; no console errors). Deployed to /golf.
  QUEUED next (owner approved): season headlines (#6), cosmetics (#8) + Profile/Trophy Room (#9),
  monthly 1-day special events (#11), pick-a-rival (#5, incentive TBD), Clubs/teams (#10, needs
  backend), push notifications (#2, needs service worker + push backend/cron — owner setup).

- Daily streak → "days played" + Wordle-style lifetime record (owner revision)
  Owner changed the streak rule and added a Wordle-style record:
  • **Streak is now "days played":** `bumpStreak` is called from `finishDailyRound` on every completion
    (win or lose), once per day (guarded by `ds.last===t`). Freezes still bridge a missed day. Result
    line reads "🔥 N-day streak — see you tomorrow to keep it going"; removed the "beat the average to
    keep your streak" nudge.
  • **Lifetime daily record (tie = loss):** new `dailyStats()`/`bumpDailyStats(won)` track total days
    Played and how often you Beat the pro — ONE play + ONE beat counted per calendar day (a later
    attempt can flip a day to a win). `won` is strict `total<avg`, so a tie counts as a loss.
    `dailyWinPct()` for the win rate. Result screen shows a 4-stat card: Played · Beat the pro · Win
    rate · Best streak, with a nudge to use remaining attempts to add a win.
  • All share links now carry `https://` so they render as clickable links (daily share, major-win
    caption, season share, career-end share). Verified via Playwright (per-day counting, tie=loss,
    record card renders, no console errors).

- #8 Cosmetics + #9 Profile/Trophy Room (owner approved, built together)
  • **Trophy Room (#9):** the old "Player" overlay (`overlayRecord`) is now the **Trophy Room** — reachable
    by everyone from a new title-screen "🏅 Trophy Room" button (`mini2`), and still from the signed-in pill.
    New **trophy cabinet** (`trophyCabinetHTML`, `TROPHY_CABINET`) shows the four major trophies (reusing the
    custom win-celebration SVGs — greenJacket/wanamaker/usOpen/claretJug) with lifetime counts from `lt.maj`;
    won majors render in colour, unwon are dimmed/greyscale. Tour-wins + majors line underneath. Header now
    shows the **equipped title** under the name. Existing account card, lifetime stat bar, Hall of Fame, and
    Tee Badges all remain below.
  • **Cosmetics (#8):** all DERIVED from lifetime badge metrics (no extra persistence — unlocked iff `req()`
    passes), equipped choices live in `bag_look`.
    – **Special shirt colours** (`COSMETIC_SHIRTS`: Champion Gold, Major Purple, Masters Green, Grand Slam
      Crimson, Legend Onyx) gated behind wins/majors. They only need m/s hex — the avatar recolours a hex,
      so no art assets. New `shirtRow()` in setup shows base POLOS + cosmetics; locked ones are dimmed with a
      🔒 and tapping toasts the requirement. `avLook`/`golferSVG` resolve shirts via `findShirt`/`allShirts`.
    – **Equippable player titles** (`TITLES`: Tour Pro→Hall of Famer) earned from the lifetime record; picked
      via chips in the Trophy Room (`equippedTitle`/`titleUnlocked`), shown under the name. Locked chips dimmed.
  Verified via Playwright (seeded-stats Trophy Room with cabinet/cosmetics/titles, guest empty-state, setup
  shirt gating, title-screen button — all render, no console errors). Deployed to /golf.
  Possible follow-up: surface the equipped title on share cards / season summary.

- #6 Season headlines — "RunTheTour Dispatch" (owner approved)
  • `seasonHeadlines(x)` derives a newspaper-style recap of the year from this season's actual events
    (per-event finishes/money/majors from `S.season.results`) + career context: a prioritised **LEAD**
    headline (Grand Slam › Tour Champion › multi-major › maiden/career major › multi-win › breakthrough
    win › knocking-on-the-door › rookie/grinding) plus up to 4 supporting **notes** (money-list finish,
    made-every-cut, top-10 machine, runner-up heartbreak, biggest payday, climbed the money list,
    career-best profit, rookie season). `headlinesHTML` renders a masthead card (uppercase "RunTheTour
    Dispatch · Year N", serif lead, icon bullets) shown on the season summary after the stat tiles.
    The lead headline is also woven into the **season share text** for more newspaper-y virality.
  • **Fixed a pre-existing re-entrancy bug surfaced while testing this:** async loaders (`lbLoad`/`crLoad`/
    `dbLoad`) call `render()` to refresh, and when Supabase is unavailable they do so SYNCHRONOUSLY from
    inside a screen fn — re-entering `render()` mid-build, wiping `#app`, and leaving the original call
    appending a second copy (visible as a doubled summary for guests with no backend). Added a re-entrancy
    guard to `render()` (`_rendering` flag → defer with `setTimeout(render,0)`), which fixes it globally
    and protects future loaders. Verified: summary renders exactly once (recap/dispatch counts =1), title/
    Trophy Room/leaderboard/setup all still render, no console errors. Deployed to /golf.

- #11 Monthly Spotlight — special 1-day events (owner approved)
  • A **special event once a month**, deterministic per calendar month: `monthlySpotlightFor(Y,M)` seeds a
    marquee course (`seededShuffle(DAILY_KEYS)`), forces tough weather (windy/gusting), and fixes the ONE
    UTC date it's live (`liveDayKey`, day-of-month 1..24). `spotlightLiveToday()`/`nextSpotlight()` drive it.
  • **Title surfacing:** when live today, a pulsing gold CTA (`.spotlive`) with three states — "Today only"
    (unplayed) → "Won ✓ / best X · go lower" (played, attempts left) → "Won/Complete · see result" (done).
    When not live, a muted "Next Monthly Spotlight: <course> · <date>" tease.
  • **Self-contained flow:** reuses the entire daily draft→build→round pipeline via `S.daily=true` + a new
    `S.special` flag — only branching at start (`startSpotlight`/`beginSpotlightAttempt`), finish
    (`finishDailyRound` → `finishSpotlightRound`), and result (`scrDailyResult` → `scrSpotlightResult`).
    Own storage (`bag_special`: {wins, played, months:{mk:{attempts,best,won}}}), own 2 attempts, and it
    NEVER touches the daily streak / daily board / course records. `S.special` is cleared on the normal
    daily entry + on "Back to title" so it can't leak.
  • **Rewards:** beating the pro logs a Spotlight win (counted once/month), shown in the Trophy Room cabinet
    ("⭐ Spotlights N") + a dedicated result record card; first win unlocks an exclusive **Spotlight Teal**
    shirt (new `COSMETIC_SHIRTS` entry gated on `spotWins()>=1`) — ties #11 into the #8 cosmetics.
  • Verified via Playwright (live banner, start→preview themed, winning finish, firstWin + cosmetic unlock,
    Trophy Room line, all three banner states, attempts depletion, not-live tease, no console errors).
    Deployed to /golf.

- #5 Pick-a-rival + real-player progression (owner approved; engine redirect)
  • **Real players rise, not generated ones (owner direction):** the world already rolled each developing
    player's universe potential (`applyCareerRoll`/`rollPotential` via `pot_band`), but real young players'
    bands capped them ~91-92 while generated rookies could roll 94-97 — so fake players topped the field.
    Fixed by (a) a **youth-boom** in `applyCareerRoll`: REAL players age ≤28 get a widened boom tail
    (hi +2..+8 toward 97, boom +0.11) so different real prospects break out in different seeds; and (b)
    **capping generated rookies** at ~92 lov (mostly 75-85) so they fill the field as role players but never
    stand above the real stars. Verified across seeds: 7-8 of every top-8 are real players, generated cap
    ~88 lov, and the breakout cast varies each sim (Åberg tops one seed, Koivun/Ford/Surratt/Bhatia/
    Potgieter others) — Bhatia's career potential ranges 85→92 by seed, Åberg 87→93.
  • **Pick-a-rival (#5):** choose a tour player in your tier (`rivalCandidates` from the living `worldField`
    within ±6 OVR — now mostly real rising stars) in the off-season (`scrOffseason`) or first-season build
    (`scrBuild`). Rival lives on `S.career.rival` (or `S.pendingRival` pre-career, carried over at year-1
    record). Finishing a season ahead of them on the money list (`rivalSeasonResult`) earns a tee-tiered
    **Rivalry badge** (`lt.rivalWins`, fed via `recordSeason({rivalBeat})`), unlocks the **Rivalry Crimson**
    shirt at 3 wins, and surfaces a head-to-head card + a Dispatch headline note on the summary. Retired
    rivals are detected (`rivalActive`) and you're re-prompted. Verified end-to-end (candidates are real,
    pick→carry, H2H beat/loss, badge increment, dispatch note, card, off-season picker).
  • Also hardened `seasonHeadlines` (guard `big`/`m` undefined) so a win/major with no derived event row
    can't throw.

- Profile revamp: Achievements/Milestones + Tour Rep + watchable playoffs (owner-requested)
  Owner disliked the tee-badge system; replaced it with an extensive NBA-2K-style Achievements system.
  • **Catalog:** ~108 achievements (`ACH`) across 10 categories (`ACH_CATS`): Getting Started, Winning,
    Majors, Clutch, Consistency, The Money, Career & Legacy, Daily Challenge, Rivalry & Spotlight, The
    Build. Each has get(m)>=goal + points. Includes SITUATIONAL ones, not just success: win in a playoff,
    win a major in a playoff, wire-to-wire, Sunday charge (trail 4+ after R3), win by 5/8/10, shoot a
    7/9/11-under round, four under-par rounds, rookie win/major, back-to-back.
  • **Engine:** `achMetrics()` merges lifetime `lt` + daily stats + spotlight/rival wins + situational
    flags. Flags captured at the moment they happen via `recordAchEvent({inc/max/set})` — in `finalizeEvent`
    (playoff/wire/comeback/margin/low-round/four-under/rookie/back-to-back), the season record block
    (seasonWinsMax/majorsInSeasonMax/seasonEarnMax/top10InSeasonMax/worldNo1), `setRival`, and the share
    helpers. `evaluateAch()` runs at season end, daily/spotlight finish, rival pick, share, and career end;
    persists unlocks (`bag_ach`) + points, returns freshly-completed for the summary card / toast.
  • **Reward (Tour Rep):** points → a named rank (Amateur→Journeyman→Tour Pro→Contender→Star→Champion→
    Legend→Icon, thresholds auto-scaled to total points ~7035). Shown on the profile with a big progress
    bar (`repHeaderHTML`). Perk: +1/+2 off-season re-spins at higher ranks (`repPerkReSpins`). Cosmetic
    shirts/titles still unlock off the same metrics.
  • **Trophy Room UI:** replaced the Tee Badges grid with `achListHTML` — collapsible category dropdowns
    (S.achOpen toggles), each row a fillable ✓ checkbox + name + desc + points, with an in-progress bar for
    partials. Category headers show n/total completed.
  • **Watchable playoffs (#):** `simPlayoff` now records a per-hole log; when YOUR golfer is in a playoff,
    `celebratePlayoff` plays a full-screen 'SUDDEN-DEATH PLAYOFF' reveal hole-by-hole (you ★-highlighted,
    eliminations shown) before the win celebration (win) or a heartbreak Continue (loss). Auto-sim/reduced
    motion auto-advance; manual gets a Continue button.
  Old badge defs (BADGES/teeMedal/badgeCard/badgeEarnedHTML) remain defined but unused in UI. Verified via
  Playwright (catalog integrity: 108 ach / 7035 pts / no dup ids; situational unlock correctness; Trophy
  Room renders Tour Rep + dropdowns + checkboxes; playoff sequence reveals + win/loss; full season runs
  clean; no console errors). Deployed to /golf.

- Achievements v2: bug fix + huge expansion + G.O.A.T. + data reset (owner-requested)
  • **Bug fixed (rank not updating / bars not matching boxes):** achievements only evaluated at gameplay
    moments, so a pre-existing career's earned feats were never credited when you just OPENED the Trophy
    Room — full progress bars but empty checkboxes + 0 rep. Fix: `overlayRecord` now calls `evaluateAch()`
    on open, retroactively crediting anything already earned. (Verified: 0→18 unlocked / 0→430 pts on open.)
  • **Expanded to 146 achievements / 13 categories / 9380 pts** (was 108). New categories: Records & Streaks,
    Daily Mastery, The Draft. New SITUATIONAL/fun ones with new flag captures: win/cut streaks
    (`winStreakMax`/`cutStreakMax`), Tour Championship / Players / signature wins, lose-a-playoff
    (Bridesmaid), major runner-up, money runner-up, daily eagles/albatross/bogey-free/low-round/course-
    records/distinct-courses (`captureDailyFeats`), draft a Legendary skill / 99-skill / 8-from-8 (Dream
    Team), Giant Slayer (beat a higher-rated rival), plus meta (signed in, equipped a title). Live metrics
    (onAccount/titleSet/distinctDailyCourses) computed in `achMetrics`.
  • **G.O.A.T. rank:** apex Tour Rep tier above Icon, awarded ONLY at 100% completion (`achCount===ACH_TOTAL`).
    Shown with 🐐 + a celebratory header. Perk: max re-spins.
  • **Data reset (clean slate for relaunch):** client — `RESET_EPOCH=2`; on load, if `bag_reset_epoch`
    mismatches, all `bag_*` localStorage keys are wiped once (auth sb-* keys preserved). Cloud — owner runs
    `supabase/25_runtour_reset.sql` (truncates runtour_scores/stats/daily_scores only, via to_regclass guards).
  Verified via Playwright (146 ach / no dup ids / all valid; retroactive credit; new feats unlock; G.O.A.T.
  at 100%; new categories render; no console errors). `supabase/verify_runtour.sql` also committed (schema
  check the owner used). Deployed to /golf.

- Playoff auto-advance (owner: no click during the sim)
  `celebratePlayoff` done() no longer shows a Celebrate/Continue button — after the hole-by-hole reveal it
  ALWAYS auto-advances (win → win celebration; loss → next event) after a short pause (~1.3s win / 1.9s
  loss; 20ms in reduced motion), regardless of the Auto-Sim toggle. Tapping anywhere skips ahead faster;
  finish() is guarded (fin flag) so a tap + the timer can't double-advance.
- Celebration pacing model = Auto Sim toggle (owner correction: Auto Sim OFF means the player WANTS to pace/watch)
  • Auto Sim ON → fully hands-off: events, normal wins (2s), majors (2.6s), playoffs all auto-advance.
  • Auto Sim OFF → the player drives: events wait for "Next event"; a normal win still ticks on after 2s
    (owner's earlier ask), but a MAJOR waits for Continue (+ Share); a playoff LOSS waits for Continue.
  • Playoff double-click avoided: a playoff WIN always auto-flows (~1.1s) into the SINGLE win celebration —
    which is the one wait/auto point (per Auto Sim). So a major playoff win = exactly one Continue, never two.
  `celebrateWin`: autoAdv→timer(major2600/reg2000); else→timer only for non-majors(2000), majors wait.
  `celebratePlayoff` done(): win→auto-flow; loss→(auto||reduce)?timer:Continue button.

- Achievement-card one-line layout + mid-season save (owner)
  • **`achEarnedHTML` rebuilt:** each unlocked achievement is now ONE row — 🏅 name + green points on the left,
    description on the right (small/muted, right-aligned, `white-space:nowrap` + ellipsis), stacked one per
    line. No more centered flex-wrap forcing things onto multiple lines.
  • **Auto-save is now explicit + mid-season save:** season-end already called `saveCareer()` (kept) — added
    a green "✓ Progress auto-saved" line on the summary and renamed the manual button to "Exit to Home"
    (already saved). NEW `saveMidSeasonAndExit()` snapshots the in-progress season (schedule, evtIndex,
    season.results/totals/field/me, freshAch) into `bag_careersave.mid` via `saveCareer({mid})`; a "Save &
    Exit" button on the sim screen (career only) lets you stop mid-season. `resumeCareer` branches on
    `r.mid`: restores the season state and re-enters `screen:'season'` exactly where you left off (the
    current in-progress event re-sims, since it hadn't been recorded). The title "Resume Career Mode" sub
    shows "mid-season (event N)" when applicable. The next full save (season end) writes without `mid`,
    clearing the mid-season checkpoint. Verified: 4-event mid-save → resume restores results/evtIndex/money
    exactly; one-line ach rows; no console errors.

- Data reset HELD until launch (owner)
  The local auto-wipe (RESET_EPOCH) is now gated behind `RESET_ENABLED=false`, so NOTHING is wiped while
  testing — the owner's current career is safe. AT LAUNCH: set `RESET_ENABLED=true` AND bump `RESET_EPOCH`
  (e.g. 3) → every device wipes its bag_* once on next load; owner also runs `supabase/25_runtour_reset.sql`
  for the cloud side. Verified a pre-seeded career survives a load with reset disabled.

- Leaderboard: every season & every career is its own entry (owner: was 1-per-user)
  Both boards used `distinct on (user_id)` → one best entry per player. Owner wants every season AND every
  career sim ranked (a player can appear many times; see the best of all sims, plus all careers whether
  completed/reset/abandoned early). `supabase/26_runtour_board_all_entries.sql` (owner must run): drops +
  recreates `runtour_season_board` (every posted season row, ranked; +year) and `runtour_career_board`
  (every career_id group, no user-dedup; +golfer_name). No data migration — seasons were always stored
  individually with their career_id; reset/abandoned careers keep their posted seasons so they stay ranked.
  Client (deployed): leaderboard rows now show golfer + "Yr N" (season) / golfer + seasons + W (career) so
  repeat entries are distinguishable; fetch limit 50→100; defensive (works before & after the SQL). Verified
  a single user renders multiple season + career rows, no console errors.

- Off-season perks scale with Tour Rep rank (owner reward idea)
  Replaced flat off-season (3 changes + 2 re-spins for all) with `REP_PERKS` by rank: Amateur 1ch/0rs,
  Journeyman 2/0, Tour Pro 3/0, Contender 3/1, Star 3/1, Champion 3/2, Legend 3/2, Icon 3/3, G.O.A.T. 3/3
  (changes capped at 3 so you can't rebuild the whole bag). `repPerk()` drives `continueFranchise`'s
  `S.offseason.maxChanges/reSpins`. The off-season screen shows a "🏅 {rank} perk · N changes · M re-spins ·
  reach {nextRank} for +X" banner (a climb nudge). REVISED to BASELINE+BONUS (owner): Amateur 2ch/1rs floor →
  MAX 3ch/3rs (reached at Contender; owner cap). Nobody starts handicapped; ranks above Contender are
  rewarded by prestige, not more perks.
  Part of the agreed Tour Rep reward concept: prestige (rank on profile + leaderboard, rank-gated
  titles/cosmetics, tier-up moment) = backbone; convenience (re-spins, future season mulligan) additive;
  power (changes) small/capped. Prestige pieces NOT yet built — awaiting owner go on sequencing.

- Tour Rep PRESTIGE rewards (owner: prestige is the backbone of the reward concept)
  • **Tier-up moment:** `evaluateAch` now detects a rank PROMOTION (crossing into a higher rank) via
    `repTierFor(pts,count)` + `repRankIndex`; stashes `S.freshRep={from,to}`. Shown as a gold "Tour Rep
    promotion — you're now a {rank}!" card on the season summary + career-end (`repUpHTML`), and as a toast
    on daily/spotlight rank-ups (`achToast`). Reset each season start with `S.freshAch`.
  • **Rank on the leaderboard:** `supabase/27_runtour_rep.sql` (owner must run) — adds `rep_pts` to
    runtour_scores, `runtour_submit_season` now takes `p_rep_pts` (client passes `achPoints()`), and both
    boards return the player's best `rep_pts` per row. Client maps pts→rank via `repTierName` and shows a
    gold "· {rank}" badge beside the name (Amateur hidden, G.O.A.T. gets 🐐). Defensive: no badge before the
    migration is applied.
  • **Rank-gated titles:** added equippable prestige titles to `TITLES` — Contender / Tour Star / Tour
    Legend / Tour Icon / 🐐 G.O.A.T. — unlocked by reaching that Tour Rep rank (req reads `repTier()`).
  Verified: rank-up fires + card/toast; titles unlock by rank; leaderboard badges render (Legend / Star /
  G.O.A.T., Amateur hidden); no console errors. Owner must run `27_runtour_rep.sql` for the board badges.

- Imbalance-aware OVERALL + season-long rivalry (owner: "top players at 86? + I outperformed my rival by a lot")
  Two real bugs in the screenshots. (1+4) **OVR was a flat weighted average**, which OVER-rated a lopsided
  cherry-picked bag (loads put/clu, dumps scr/bnk) — it read ~85 and got matched against true elites, while
  genuine world-#1s read only ~86. New `ovrFromSkills(sk)` keeps the weighted mean but **subtracts a
  downside-deviation penalty** (weak links below your own mean hurt, `OVR_IMBALANCE_K=0.85`) and **stretches
  the elite top** above `OVR_PIVOT=82` by `OVR_GAIN=1.35`. DISPLAY/matchmaking only — the sim still reads raw
  per-skill values (`eventOverall`), so actual finishes are unchanged. `buildPlayer` uses it. Verified (seed
  12345): the screenshot's lopsided bag 84.8→**80.6**; a clean balanced 86 build stays 86.4; Scheffler→92,
  top-5 86–88, field span 69–92 (genuine elites now read elite, cherry-picked builds read honest).
  (2) **Rival matching** now uses `ovrFromSkills` for both sides within a TIGHT ±3 band (widen to ±6, then
  any, if <4 candidates) — the lopsided 81 player now gets true peers (Aaron Rai/Bezuidenhout/Cole/Kitayama
  at 81), not Rory/Morikawa at 86. (3) **Rivalry is now a SEASON-LONG head-to-head** (`rivalSeasonResult`):
  beat = you finished ahead of your rival in MORE of the events you both played (`meAhead>rvAhead`, cuts on
  both = tie/skip), robust to single-event variance. Card shows the `meAhead–rvAhead` record + money ranks;
  season headlines + picker copy updated to match. Did NOT touch season variance (owner declined #5).

- Reduced season variance (#5) (owner: "let's run #5")
  The sim's per-player per-round noise (`SIM.reg.sigma`/`SIM.maj.sigma`) was trimmed ~16% from the
  DataGolf baseline 2.80/2.90 → **2.35/2.45**. `sigma` is the ONLY term that drives finish-position
  variance — `csd`/`courseAdj` is a field-wide weekly draw that cancels in the standings, and `base`/
  `SKILLSLOPE` (0.238, DataGolf-measured) were left untouched. Faithful season Monte Carlo (400 seasons,
  seed 12345, real engine via `beginEvent`/`simNextRound`): a strong OVR-90 build's money-rank IQR 11→8,
  p10–p90 2–23→3–19, season win-rate .55→.60; a mid 86 build IQR 24→19; the lopsided 81 build's p90 64→60.
  Medians barely move — the wild tails compress, so a clearly-better build tracks its skill more reliably
  while upsets/youth-breakouts still happen. NOTE on the OVR ceiling: there is no 92 cap — `ovrFromSkills`
  clamps at 99; the real-world #1 (Scheffler) computes to ~92 by design, leaving 92→99 headroom for an
  all-time created build. Knob lives at the `SIM` const; drop to 2.30/2.40 for slightly tighter.

- Emergent rivalry — replaces the manual pick-a-rival (owner: "I like the emergent version… analyze who
  would be a good rival after a few years and then assign them")
  Ripped out the manual picker (`rivalPickerNode`/`rivalCandidates`/`setRival`/`clearRival`/`S.pendingRival`).
  The game now WATCHES your career: `accrueH2H()` tallies, per opponent, every event you both played —
  events, who finished ahead, the position gap, and "near" finishes (within `RIVAL_NEAR=6` spots) — into
  `S.career.h2h` (pruned after 5 idle years to stay bounded over a 40y career). After `RIVAL_MIN_SEASONS=3`,
  `maybeFormRival()` crowns the highest-scoring still-active opponent as your nemesis (`rivalScore = near *
  (0.6+0.4*balance)`, where balance favours a contested ~50/50 record + `RIVAL_MIN_EV=30` so it's someone
  you've genuinely battled). It sets `S.career.rival` + `S.freshRival` → a gold "⚔️ A Rivalry Is Born" card
  on that season's summary. From then on `rivalSeasonResult()` drives the season head-to-head card (unchanged)
  and banks a season-series W/L on the rival; the rival's OVR refreshes each off-season. `reconcileRival()`
  (off-season, after `advanceWorld`) detects a rival who's aged off the tour → farewell on the tune-up screen
  (`rivalStatusNode`, read-only) + frees the slot so a new nemesis can emerge. Verified with a faithful
  multi-season engine MC: rival emerges Y3 across seeds as a genuine close peer (e.g. Matt Wallace 81 @ 23–24
  H2H, Niemann 84 @ 24–24, Ryan Gerard 81 @ 27–21); a 40-year run cycles form→persist→age→retire→re-emerge
  (incl. next-gen generated players) with zero errors; all 5 display states render clean. "Got Beef" ach +
  the Rivalry tee/wins untouched (now keyed off the emergent rival). Supersedes the manual pick-a-rival note.

- Career recap regrouped into dropdowns (owner: "really hard to read… group them and do drop downs")
  The career tab had two long flat lists — a 45-row Wins list and a 16-row season list, both year-indexed and
  hard to scan. Replaced with collapsible groups (native `<details>` accordions, `.acc` CSS, no re-render):
  (1) **🏆 Majors** dropdown (open by default) — majors grouped by championship with ×count + the years won
  (`careerMajorsHTML`); (2) **Season by season** accordion (`careerSeasonsHTML`) — one row per year showing
  record + net; years with wins get a ▸ chevron and expand to that year's trophies (majors ★, others 🏆),
  win-less years are flat non-expandable rows. The standalone 45-row Wins list is gone — wins now live nested
  under their year. Applied to BOTH the in-career summary "Career" tab and the end-of-career ceremony (which
  keeps its played/top-10/best Major Championships board above the accordion). Verified visually + zero
  console errors. Helpers are shared/hoisted; `MAJOR_NAMES` constant added.

- OVR overshoot fix + field aging parity (owner: "98 too high for these stats" + "real players regress too fast")
  (1) **OVR stretch retuned.** The elite-spread in `ovrFromSkills` (`OVR_PIVOT` 82→**86**, `OVR_GAIN` 1.35→**1.15**)
  was pushing a top-heavy build's OVR ABOVE almost all its own stats — a 93/98/96/94/92/97/94/93 bag (weighted
  mean ~94.6) read **98**. Now it reads **95**, sitting at its mean (only the 96/97/98 stats exceed it), which
  reads honestly. Verified: lopsided 81 unchanged, balanced ~85-86, Scheffler still the clear field #1 at 90.
  (2) **Field ages like the user now.** The CPU arc regressed ~2× faster than the player and retired in the 40s
  while the same-age user dominated. Fixed to mirror the user's curve: `ARCS` distance peak-end 28→**34** (flat
  prime through 34 like the user's `PEAK_END_AGE`), all decline slopes ~halved, `ageArc` floor .45→**.58**;
  `pRetire` onset 37→**41** and the climb gentled (competitive into the early 50s, forced out ~58 vs the old 55).
  Verified over an 18-year sim: a star loses ~6 OVR across ages 30→50 (was ~10); **Scheffler is still a top-4
  player at age 48** (88 OVR) instead of fading/retiring; ~29/57 of the original star cohort survive to Yr19 (was
  ~13); field stays ~56% young/generated so youth breakouts + turnover are intact. `FIELD_RETIRE_AGE` (55) left
  as-is — it only gates the 2026 starting field, so no 57-yos seed in. No console errors.

- OVR formula simplified to weighted-mean + deadband penalty (owner: a 92/98/88/94/94/89/92/88 build "too low" at 90)
  The penalty-then-stretch model mis-served the upper-mid: a strong build with one heavier-weighted stat a
  few points lower (here approach 88, weight .21) got docked below its weighted mean (read 90 vs mean 91.5),
  while the elite "stretch" over-rewarded the very top. Replaced with: **OVR = weighted mean − K·max(0, dd −
  DEADBAND)** (`OVR_IMBALANCE_K` 0.85→**1.37**, new `OVR_DEADBAND=2.2`, `OVR_PIVOT`/`OVR_GAIN` removed). A `dd`
  (downside-deviation) deadband lets any normal/strong build read at its true average; only sizeable spread —
  the cherry-pick exploit (dump cheap categories to max the expensive ones) — gets penalised, and harder than
  before (K up). No stretch, so a build never reads above its own weighted average → intuitive. Verified: the
  screenshot build 90→**92**; the earlier 92-98 build still **95**; lopsided exploit **81**; a brutal cherry-pick
  (four 99s, rest 60) reads **69**; all-99 → 99; balanced 86; Scheffler **91**, field span 74–91. No errors.

- Outgrowing a rivalry (owner: "should you move onto a new rival once your overall increases?")
  A rivalry can now GRADUATE when you've clearly left a rival behind — gated on BOTH a sustained OVR gap
  (`RIVAL_OUTGROW_GAP=6`) AND a winning season-series streak (`RIVAL_OUTGROW_STREAK=2`), so a *close* rivalry
  runs your whole career and only a stale, one-sided one ends. One-directional per owner: only when YOU pull
  ahead — if a rival ascends past you, you keep chasing (no graduation). `maybeOutgrowRival()` (runs after the
  series tally, before `maybeFormRival`) banks the full record to `S.career.pastRivals` (kept, not deleted),
  shows a green "✓ Rivalry Outgrown" triumph card on the summary (`rivalOutgrownHTML`), and a fresh PEER-level
  nemesis emerges. Key fix: the peer-match band (`RIVAL_BAND` 7→**5**) is now tighter than the outgrow gap (6)
  so a just-graduated rival (≥6 below you) can't be immediately re-picked. `rivalStatusNode` gained a "Past
  rivalries" ledger; two achievements added (Left Them Behind / Always Climbing, keyed off `rivalsOutgrown`).
  Verified with a 20-season engine MC: a contested rivalry lasted 12 yrs (rival even led the series early) and
  only graduated at gap 6 + streak, banking a tight 141–134; replacements were always genuine peers, never the
  outgrown player; `pastRivals` records correct; both cards render clean; no errors.

- Live Tour Rep meter + one-by-one achievement reveal (owner: "show live tour rep… move old→new"; then "show
  the achievements unlocked, under the status bar, in a list, revealing one by one"; "only come up if an
  achievement is unlocked")
  `seasonRepNode(oldPts, list)`: the Tour Rep STATUS BAR sits on top; the just-unlocked achievements reveal
  ONE BY ONE underneath (each fades/slides in ~`STEP` apart, STEP scales 320–680ms with count), and as each
  row pops in the meter climbs by THAT achievement's points (ease-out tween, flowing through any rank-up —
  the bar tops out, the tier flips, it keeps filling). Green "+N" ticker, tier, pts, "X pts to <next>".
  `oldPts = achPoints() − Σ(fresh.pts)`. Plays once per screen via `S._repAnimShown` (reset in startSeason +
  endCareer; re-renders settle). Shown ONLY when achievements unlocked — season summary gates on
  `S.freshAch.length`, career-end on `S.careerFreshAch.length` (no static fallback). Replaces the old
  `achEarnedHTML`+`repProgressNode` pair at both spots. Verified: 4-achievement reveal staggers correctly,
  rep climbs in sync (+46 mid → +155 settled), nothing renders without an unlock; no console errors.

- Off-season perk progression spread out (owner: "spread it out more… longer progression but the max 3 and 3")
  The old `REP_PERKS` maxed at 3 changes + 3 re-spins by CONTENDER (rank 4 of 9), so the top 5 ranks were all
  identical — no reason to climb. Re-tuned to a long, steady climb (floor lowered to 1 change + 1 re-spin):
  Amateur 1/1 → Journeyman 2/1 → Tour Pro 2/2 → Contender 2/2 → Star 3/2 → Champion 3/2 → **Legend 3/3** →
  Icon 3/3 → G.O.A.T. 3/3. Same max (3/3) but it's now reached at Legend (rank 7) with most rank-ups granting
  a change or a re-spin along the way; Icon/G.O.A.T. stay prestige-only. The off-season teaser already handles
  flat (perk-less) rank-ups (shows the rank's perk, no "+N" line). Verified the table reads correctly; the
  perk floor is gentler for brand-new accounts (1/1 vs the old 2/1) by design, to make room for the climb.

- Avatar re-tint fixes (Jordo feedback: "colors don't change much, hair color is wrong, all shirts have teal
  sleeves"). Owner chose to FIX the re-tint (not switch to vector / not remove). Root causes found in
  `avClassify`/`avCompute` (the canvas re-tint of the single base PNG): (1) **teal sleeves** — shirt region was
  gated `nx>0.20&&nx<0.80` (central torso only), so the edge sleeves never recolored; widened to nx 0.05–0.95
  and rely on a brightness/sat floor (`l>0.21`) to keep the dark-green badge background out. (2) **hair wrong**
  — hair & skin hue ranges overlapped and ties resolved to skin, painting the hairline skin-tone; added a
  FACE-OVAL test (`((nx-.5)/.175)²+((ny-.435)/.185)²<=1` = skin) so dark head pixels OUTSIDE the oval are hair.
  (3) **colors muted** — raised `lpull` (skin .30→.48, hair .22→.50) so dark skin reads dark and blonde/grey
  hair reads light instead of base mid-brown; small sat/strength bumps. Verified visually across skin tones,
  hair colors, white/gold/black polos (sleeves included) and the female base — background preserved, no leak.
  NOTE: still ONE shared face (re-tint can't make distinct faces; that'd need new art) — owner accepted.
  STILL TODO from the same feedback: scouting blurb second-person ("your bunker play"); remove em-dashes from
  copy (reword naturally, ~206 visible instances).

- Avatar region-mask system — SUPERSEDES the heuristic re-tint (Jordo: "masking issues, neck + behind the
  hat"; owner picked Option A "region masks", + a stopgap). The guess-the-pixel `avClassify` kept bleeding
  (hat-teal vs background-green vs shirt-teal are too close — purple smear behind the hat). Replaced with
  AUTHORED STENCIL MASKS: one flat-colour PNG per base (`{male,female}-base-mask.png` in
  public/avatars/golfers/base/ AND golf/...) where skin=red, hair=green, shirt=blue, cap=yellow, bg=black.
  Generated offline by a Playwright segmentation script (scratchpad/seg*.mjs): flood-fill the background out
  from border+interior seeds FIRST (so it can never recolor), then a face-oval + radius clip + gender-aware
  long-hair rule to separate regions. `avCompute` now reads the mask (`avMaskRegion` = dominant channel) for
  pixel-perfect recolor; `avClassify` remains a fallback if a mask 404s. Verified clean across skin tones,
  hair colors, every shirt color, and the female base — no hat/sleeve/neck bleed, background untouched.
  Stopgap (raised cap lightness floor) shipped first. NOTE: still one shared face per gender; cap:false still
  not honored by the PNG (cap baked into art). NEXT (owner idea): PATTERN SHIRTS as unlockables — now easy:
  draw a pattern clipped to the shirt-mask region. Em-dash reword (visible copy, ~185) still pending too.

- Em-dashes removed from all visible copy (Jordo) — DONE. A string-literal-aware char-scanner (Python,
  scratchpad) replaced em-dashes ONLY inside '...'/"..."/`...` literals (default comma; absorbing spaces),
  leaving `//` and `/* */` comments and score en-dashes (9–5) untouched. Nested template literals + the HTML
  <title> were fixed by hand, and clear sentence-breaks (toasts, rival/GOAT cards) upgraded comma→period so
  nothing reads as a comma splice. ~185 visible instances cleared; remaining em-dashes are comments only.
  Scouting blurb was already de-em-dashed in the second-person pass. Verified: page loads clean, sampled copy
  (course blurbs, rival card) reads naturally.
  NEXT (owner): back to player customization — PATTERN SHIRTS as unlockables (clip a pattern to the shirt-mask
  region now that the region-mask system is in).

- Player customization pt1 — de-duped colors + hat color + golf-lore unlocks (owner). The old COSMETIC_SHIRTS
  were near-duplicates of free basics (spotlight-teal≈teal, rivalry/slam-crimson≈red, champ-gold≈gold,
  major-purple≈purple, legend-onyx≈black) — exactly the "teal/red locked but a close variation selectable"
  problem. Fixed: BASICS (free, shirt+hat) = 6 distinct solids with NO red/green (red=Tiger's Sunday, green=
  Masters jacket — reserved). New COSMETIC_SHIRTS = 7 DISTINCT hues, each golf-lore-themed: Sunday Red (win 10),
  Masters Green (win The Masters), Sunday Orange (10 top-10s), Poulter Pink (rivalWins≥3), Hogan Grey (3 majors),
  Bronze (3 wins), Links Sky (`repAtLeast('Star')`). Added independent HAT colour: `avLook` returns `hatHex`
  (falls back to shirt for old saves; in cache key), avCompute tints the cap region to `hatHex` (the mask
  already had a separate cap region). Generalized shirtRow→`colorRow(label,key,cur)`, used for Shirt + Hat
  rows. `repAtLeast(name)` helper added. id 'red' reused so old red saves still resolve. Verified: hat≠shirt
  colors render, setup screen shows both rows with 🔒 locks, no errors. PHASE 2 (next): PATTERNS as unlockables
  (pinstripe/polka/argyle/colorblock/gingham/houndstooth/chevron/tartan), clipped to shirt/cap mask region,
  golf-lore gated (Argyle=Payne Stewart/win US Open, Tartan=win The Open, etc.) + hat patterns + picker rows.

- Player customization pt2 — unlockable PATTERNS (shirt + hat) — DONE. 8 golf-lore patterns in `PATTERNS`
  drawn as a tonal overlay clipped to the shirt/cap mask region (follows shading, zero bleed): Pinstripe
  (rep Contender), Polka (spotlight), Gingham (5 seasons), Argyle (win US Open - Payne Stewart), Tartan (win
  The Open), Houndstooth (rep Legend), Chevron (rep Icon), Colorblock (5 wins). `patFactor(id,x,y)`->0..1 mask;
  `avCompute` blends accent over shirt pixels (o.shirtPat) + cap pixels (o.hatPat); independent; in avLook
  cache key. `patternRow` picker chips (locks + toast req) for Shirt + Hat. Verified all 8 render clipped on
  shirt & cap, picker shows locks, no errors. Customization feature COMPLETE (colors+hats pt1, patterns pt2).

- PGA realism pt1 — Race to the Cup + real FedEx playoffs — DONE. The last 3 schedule anchors are now a
  true playoff: `PLAYOFF_EV` tags FedEx St. Jude (cap 70, stage 1), BMW (cap 50, stage 2), Tour Championship
  (cap 30, stage 3, staggered). `mkEvt` stamps `{playoff,cap,stage,noCut,stagger}`. `beginEvent` reduces the
  field to the top-`cap` players by season points; the finale seeds staggered Starting Strokes from `STAGGER`
  [-10..0] onto each qualifier's starting `total` (points leader tees off -10, East Lake style). `simNextRound`
  skips the 36-hole cut on `noCut` events (playoff events play all 4 rounds, no cut). Elimination: a scrSeason
  guard (mirrored in skipToEnd) detects when the player's points rank > the stage cap, sets
  `S.season.eliminated`, and `finishSeasonHeadless()` sims the rest so a Cup champ is still crowned, then jumps
  to the summary. The staggered finale winner = `S.season.cupChampion` (East Lake winner = Cup champ);
  `cupYouWon` flags a player title. UI: live `raceToCupNode` strip on the season screen (rank vs the next cut
  line 70->50->30->Cup, cushion/back, progress bar w/ gold cut-line marker); playoff `typeLbl` ("Playoff top N",
  "Cup Finale top 30"); summary banner (Cup Champion / eliminated-at-stage / final-standings). Renamed
  `win_finale` achievement to "Cup Champion". Verified via Monte Carlo (field 70/50/30, no cut, stagger -10..0,
  elite make/win Cup, weak eliminated at stage 1 w/ champ crowned) + UI smoke test (live frame, Cup summary,
  eliminated path all render, zero page errors). NEXT in roadmap: World Ranking (OWGR) + Tour Card/relegation,
  then season awards (POY/ROY), Olympics, Ryder/Presidents Cup match-play.

- PGA realism pt2a — Official World Golf Ranking (OWGR) + Tour Card — DONE (deploy 1 of 2). A rolling,
  decaying, results-based world ranking. Every player carries `rankPts`: world players in `S.world.rankPts`
  (persisted), YOU in `S.career.rankPts`. `owgrSeed(lov)=(lov-52)*120` seeds from skill so year 1 already has
  a sensible order; `updateWorldRanking()` (run at season-record time, BEFORE advanceWorld) prunes retired
  names, seeds new rookies, decays everyone by `OWGR_DECAY=0.55` (≈2-yr window), adds the year's Tour points,
  and applies a skill floor (`OWGR_FLOOR=0.4` of seed) so a non-scorer settles at a skill baseline instead of
  decaying to zero. `worldRanking()` sorts active world + you by rankPts; `myWorldRank()`/`worldRankSize()`.
  Tour Card: `CARD_LINE=100`, `cardStatus(rank)` -> secure (≤85) / bubble (≤100) / lost (>100). Display: live
  "World Rank #N of NN · OWGR" stat in the season bar (replaced Best); summary "Official World Ranking" banner
  with year-over-year movement (▲/▼ vs `S.career.lastWorldRank`, stored in `S.worldRankMove`) + the Tour Card
  status line. Verified via 10-yr Monte Carlo (elite build holds #1, mid-80s pro hovers ~#40-70 card-secure,
  weak build correctly near the bottom card-lost) + UI smoke test (season bar + summary banner render, World
  #14 ▲10, zero page errors).

- PGA realism pt2b — Ranking-gated entry (real gate + opposite-field fallback) — DONE (deploy 2 of 2).
  `mkEvt` now tags limited-field events: majors `limited,entryCap=ENTRY_CAP.major(100)`, signature events
  (type sig, not The Players) `entryCap=ENTRY_CAP.sig(50)`. `beginEvent` splits the season field via
  `splitField(field,evt)` -> {marquee (top entryCap by OWGR, +you if exempt), oppo, youIn}; you watch the
  tier you qualify for and the OTHER tier is run by `simHeadlessEvent` (no UI/no S.curEvt/no results push -
  just banks money+points into S.season.totals) so standings + OWGR stay whole. Miss the cut -> you play an
  opposite-field event (`makeOppoEvt`: Barracuda/Barbasol/etc., $4M purse, basePts 360, `oppo:true`). Personal
  exemptions (`playerExempt`): 5-yr major-champ exemption into majors, 2-yr winner's exemption into signature
  events (any win -> back into the big events for 2 years - the escape hatch off the fringe). UI: opposite-
  field red banner ("Outside the OWGR cut for the {marquee}... win to bank points and climb"), `typeLbl`
  shows "Signature · top 50" / "Opposite-field", and the Next Event button uses `playerEvtName` to show the
  event you'll actually tee up. finalizeEvent basePts adds the `oppo?360` tier. Verified: MC (signature
  marquee=50/oppo=70, majors=100/oppo=20, elite plays all marquees, #89 mid plays majors but opposite-field
  for signatures, #151 weak opposite-field throughout, winner's-exemption #94 gets into signatures, field
  partition sums to 120) + 10-yr OWGR stability (mid pro oscillates around the top-50 cut, no NaN) + UI smoke
  (opposite-field screen, full gated season -> summary, playoff elimination, zero page errors). Tunable:
  ENTRY_CAP {major:100,sig:50}, OPPO purse/basePts, exemption windows.

- PGA realism pt3 — Season awards — DONE. End-of-season honours computed in `computeAwards()` (after the
  OWGR update so year-end World No.1 is settled): Player of the Year (poyScore = wins*6 + majors*10 + Cup*15
  + points/1000 + top10*0.4, max over the field), Money Title (money leader), Scoring Title (lowest to-par
  per round, `SCOR_MIN=30` rounds to qualify - new `t.toPar`/`t.rounds` accumulators in finalizeEvent +
  simHeadlessEvent + totals init, summed from per-round to-par so the finale's stagger doesn't distort it),
  Rookie of the Year (best debutant who competed - rookies = world players with `debutYear===w.simYear`,
  tagged in genRookie, + you in year 1; falls back to the top debutant by lov if none made the 120-field),
  and year-end World No. 1 (worldRanking()[0]). Stored in `S.seasonAwards`; summary renders a "Season Awards
  · you won N" card (winners listed, your wins gold + YOU badge). New lt counters poySeasons/roySeasons/
  scoringSeasons/no1Seasons/weeksAtNo1 (money title reuses moneyLeaderSeasons) surfaced in achMetrics; new
  "Season Awards" achievement category (ACH_CATS) with 8 achievements (POY x1/x3, ROY, Scoring x1/x5, World
  No.1 x1/x3, 50 weeks at No.1). Career tally in `S.career.awards`. Verified via MC (elite sweeps all 5, mid
  wins only ROY in yr1, ROY fallback names a debutant when none qualify) + UI e2e (awards populated,
  achievements unlock, lt counters increment, Season Awards card renders, zero page errors). NEXT in roadmap:
  Olympics (stroke play + medals + country caps), then Ryder/Presidents Cup match-play.

- PGA realism pt4 — Olympics — DONE. Player nationality: `COUNTRIES` list (19 golf nations incl. the home
  countries + International), `S.look.country` (default United States, persisted with look), a country `<select>`
  in scrSetup (`countryRow`), buildPlayer sets `p.country`/`p.nation` via `playerNation()`. The men's Olympic
  golf tournament runs every 4 sim years (`isOlympicYear` = (2025+year)%4===0 -> 2028, 2032, ...), inserted at
  wk 30 by seasonSchedule (`OLYMPICS_EVT`: 72 holes, no cut, $0 purse, big:true so it carries OWGR points but
  no money). Field = `olympicField()`: top 60 by OWGR with a max of 4 per country (a thin-nation player can
  qualify where a higher-ranked American is capped out - verified a World #71 JPN player makes it). beginEvent
  Olympics branch: if you qualify you play the 60-man field; if not, `simOlympicsHeadless` runs the Games (still
  crowning medalists) and you play a same-week tour stop (John Deere) vs the non-Olympians. finalizeEvent
  assigns gold/silver/bronze from the top 3 of the order (a tie for gold is played off by the existing
  sudden-death code); guarded the totals loop with `if(!t) return` since the OWGR-picked field can include
  players outside the 120-man season totals. `S.season.olympicMedals`/`olympicMyMedal`; summary shows a gold/
  silver/bronze medal banner (or "X took gold" if you didn't medal); live screen labels it "🏅 Olympic Games"
  and the scorecard reads "🥇 Olympic GOLD!". Career `S.career.medals` + lt counters olyGold/Silver/Bronze +
  new "Olympics" achievement category (gold, any-medal, 2x gold, full set). Verified via MC (field 60, caps
  respected, country-cap lets thin nations in, medals assigned, non-olympic years skip) + UI e2e (setup
  selector, live Olympic screen, gold medal -> summary banner + achievements + career medals, zero page
  errors). Cadence: Olympics now runs every 4 years starting YEAR 4 (`isOlympicYear`=year%4===0 -> yrs 4,8,12,
  ...) per owner request (was the calendar-aligned year 3). Country flags: flat flagcdn.com chips (same source
  as RunThePitch) via `NAT_FLAG` (3-letter golf code -> ISO slug, covers every roster nation), `natFlagUrl`/
  `natFlag` helpers + `.flag-ico`/`.flag-none` CSS; shown next to player names on the Olympic leaderboard
  (`liveRow` takes a `flag` arg, passed when evt.olympics) and in the summary "took gold" line. NEXT in
  roadmap: Ryder/Presidents Cup match-play (foursomes/fourballs/singles + team selection).
- Olympic podium ceremony — DONE. `celebrateOlympicPodium(ce,opts)` (a `.celebrate` overlay like
  celebrateWin) reveals the medals in order bronze -> silver -> gold on a 3-block podium (silver left, gold
  center-tallest, bronze right), each block lighting up with its medallion + flag chip + name + score as it's
  revealed; gold reveal fires the cannon confetti. Your medal row is highlighted gold with a "★ YOU" tag and
  the sub-line reads "You take Gold for {country}". Auto Sim auto-advances through it; manual shows Continue;
  tap-to-skip reveals all. Triggered in scrSeason for `evt.olympics` (before the generic win celebration);
  a gold-tie sudden-death playoff now returns to the podium afterward (celebratePlayoff finish renders on any
  Olympic finish, win or lose). Verified: podium renders with 3 columns + confetti + Continue, no errors.

- PGA realism pt5 — Ryder Cup / Presidents Cup (team match play) — DONE. One team event per year closes the
  season (wk38): Ryder Cup in odd years (USA vs Europe), Presidents Cup in even years (USA vs International);
  added to seasonSchedule only when your nationality is on a team (`playerInTeamEvent`). You play USA every
  year if American, Europe only in Ryder years, International only in Presidents years. `EURO_NATS` set +
  `eligibleForTeam`. `selectTeam(region,me)` picks the top 12 by OWGR (+ you as a captain's pick if you'd
  miss the cut). Match-play engine: `holeScore(eo)` (integer per-hole, ties halve the hole), foursomes share
  one ball (avg eo), fourball takes the better ball (min), singles 1v1; `simMatch` runs 18 holes -> AS / "3&2"
  / "2 up". 28 points over 5 sessions (D1/D2 foursomes+fourball, D3 singles), first to 14.5; `simTeamEvent`
  returns full session/match data + your W-L-H record. KEY BALANCE: the USA roster is far deeper, so on raw
  skill it always won — compress the squad-gap by 65% (`adj=(avgA-avgB)*0.325` shifted both ways) + high
  match-play sigma (1.18) so the underdog is live; verified ~46/46/8 USA/Euro/tie over 400 sims, avg margin
  ~4 pts, a strong player nets ~2.7 of 5. UI: dedicated `scrTeamCup` (routed from scrSeason on `evt.teamcup`):
  USA-vs-team scoreboard with your side gold-bordered + running score, reveal one session at a time (Play Day
  button / Auto Sim / Skip to Result), match rows with the winner bright + your match gold-highlighted +
  flags + "3&2" labels, final result banner + confetti when your team wins. `finalizeTeamCup` banks
  `S.season.teamCup` + `S.career.cup` + lt counters (cupApps/cupWins/cupPoints/cupMatchWins/cupBest); summary
  callout; 6 new Cup achievements (debut, win, 5 wins, 25 pts, perfect 5-0 week) in the Olympics category.
  finishSeasonHeadless + skipToEnd both handle the team cup (skip / stop-and-play, never sim it as stroke).
  Verified via MC (28 pts, records sum, eligibility, win distribution) + UI e2e (scoreboard, session reveal,
  result banner, confetti, summary callout, achievements, career stats, zero page errors). ROADMAP COMPLETE
  (Race to the Cup, OWGR + Tour Card, ranking-gated entry, season awards, Olympics + podium, team cups all shipped).

- PGA realism pt6a — Selection announcements (made/missed, right before the event) — DONE. Cup team
  selection is now MERIT-based: `cupPool(region,me)` (OWGR-ordered eligible pool incl. you), `selectTeam`
  returns {team(top12), pool, meIdx, selected} with a captain's pick only on the bubble (`CUP_BUBBLE=16`),
  so you can genuinely MISS a cup (a weak Aussie at #43 in country misses). `simTeamEvent` now exposes
  mySide (your country's side), playerSelected, meRank, rosterA/rosterB, mineWon. scrTeamCup gained an
  INTRO phase (`T._introSeen`): "🎉 You've made Team X!" (merit / captain's pick + your country rank) or
  "So close, you just missed Team X" + encouragement, with BOTH 12-man rosters (you ★, flags), then "Watch
  the Cup". Scoreboard highlight + final banner + confetti now follow your COUNTRY (mySide/mineWon) so a fan
  still celebrates. New `scrSelectionScreen(evt)` shows a "You're in the Playoffs! / Through to the BMW! /
  You made it to East Lake!" or "Just missed / your run ends here" card before each FedEx playoff stage, and
  "You qualified for the Olympics! / Not in the field" before the Olympics — wired in scrSeason via
  `S.season._annAck`. Positive, encouraging copy on every miss. Verified (merit miss, intro selected/missed,
  playoff + Olympics cards render, zero errors).

- PGA realism pt6b — Cup captaincy + cup-UI polish — DONE. CAPTAINCY: late-career (`captainEligible`:
  years 36-40, >=7 career cup appearances, nationality on a team) you're OFFERED the captaincy of your
  nation's cup as a non-playing role. scrTeamCup now has phases (`S.cupChoice`/`S.cupPickTeam`/`S.cupPicks`):
  `scrCaptainOffer` (Accept / Decline-play-one-more) -> `scrCaptainPicks` (6 auto-qualifiers shown locked +
  pick 6 of the next 12 candidates, OVR hints, toggle chips, "Send out your team") -> sim with
  `simTeamEvent({captainSide,captainTeam})` (you're not in it, playerSide null) -> watch. Years rationalized to
  one Ryder (yr37) + one Presidents (yr40) cadence-wise but eligible across 36-40 per owner. Result banner +
  summary callout handle captain ("You captained them to glory!"); finalizeTeamCup banks
  `S.career.cup.captained/captainWins` + lt cupCaptain/cupCaptainWins; 2 new achievements (The Captaincy,
  Winning Captain). CUP-UI POLISH (owner requests): selection-screen button "Tee it up"->"Tee off"; each
  matchup row now shows a ◀/▶ arrow pointing to the winning side (no arrow on HALVED); the cup reveals ONE
  MATCH AT A TIME (`S.teamMatchN` over a flat 28-match list, "Next match" button, 1100ms auto-sim per match,
  newest row animates, session cards show only revealed matches with an n/total counter) for more suspense.
  Verified: captain offer->picks(12 cands,pick 6)->12-man team->captain mode, one-match reveal, winner arrows,
  captain result banner, zero page errors.

- Leaderboard reliability — durable season-submission queue — DONE. Every completed season is now
  guaranteed to reach the public board. Replaced the old single-slot `_pendingSeason` (which lost all but
  the last season when signed out) with a persistent localStorage queue `bag_pending_seasons` (cap 200):
  `sbSubmitSeason` always enqueues the season (capturing rep at completion time via `s.repPts=achPoints()`)
  then `flushPendingSeasons()` posts the whole queue whenever signed in + online, removing only the rows that
  succeed and KEEPING any that fail (offline/RPC error) to retry. Flush triggers: every new season, on
  sign-in (`sbApply`), on app init (via sbApply), and on the window `online` event. Verified: 3 seasons
  queued while signed out then all flush on sign-in; an offline submit is retained then posts when back
  online; zero page errors. (At-least-once delivery; a duplicate row is only possible on a rare
  response-lost-after-server-commit timeout.)

- Leaderboard — sort by any stat category — DONE (needs SQL `28_runtour_sort.sql`). Both boards can now be
  ranked by Earnings / Profit / Wins / Majors / OVR (season) or Seasons (career) / Tour Rep, so one player can
  top many boards. SQL 28 adds a `p_sort` param to `runtour_season_board`/`runtour_career_board` (orders by the
  chosen stat so the true top-N is fetched, earnings+id tiebreakers) and the season board now returns wins +
  majors. Client: `lbCache` is now a map keyed by `tab:sort`; `lbLoad(tab,sort)` fetches the active board with
  a legacy fallback (retries without p_sort if 28 isn't applied yet → board still loads, earnings order); a
  "SORT BY" chip row (`LB_SORTS`) drives `S.lbSort`; `lbStatVal` renders the right-hand value per stat (11W,
  3 maj, OVR 96, rep tier, +/- profit) with earnings kept in the sub-line; sort persists across tabs when
  valid. Summary guest-rank teaser reads `lbCache['season:earnings']`. Verified: each sort triggers a fresh
  by-stat fetch and the value column updates; zero page errors. ACTION: run supabase/28_runtour_sort.sql.

- **CS45 — Playoff selection as timed bottom pop-up (no click-gate on Auto Sim).** The FedEx playoff
  selection announcement ("you made it / just missed") used to be a full-screen card that required a tap
  before EACH of the final 3 events — even with Auto Sim ON, breaking the hands-off flow. Now, with Auto Sim
  ON, a playoff stage announces itself via `selectionPopup(evt)` — a timed bottom pop-up (like the toasts
  elsewhere, centred via `left/right:0;margin:0 auto` so the `celebRise` transform doesn't fight it) — and
  scrSeason auto-acknowledges (`_annAck[idx]=true`) and falls straight through into the event/elimination
  underneath. Auto Sim OFF keeps the full-screen `scrSelectionScreen` that waits for a tap. Olympics keep
  their full-screen set-piece. Shared copy extracted into `selectionInfo(evt)`. Verified both paths in
  Playwright (pop-up + no full-screen card on Auto ON; full-screen card + no auto-ack on Auto OFF).

- **CS46 — Trophy Case redesign (new trophies + medals).** Reworked `trophyCabinetHTML(m)` into a three-shelf
  Trophy Case: (1) Major Championships — the four major-trophy SVGs; (2) Medals & Cups — Olympic
  Gold/Silver/Bronze, FedEx Cup, Team Cups (Ryder/Presidents wins), Captaincies; (3) Season Honours — Player
  of the Year, Rookie of the Year, Money Title, Scoring Title, World No. 1. New `trophyChip(emoji,label,n,col)`
  renders colour-coded round medallions; empty/unearned slots dim to an aspirational en-dash. Footer shows
  Tour wins / Majors / Cup apps / Spotlights. Added a lifetime `fedexCups` counter (in `ltDefault`,
  incremented in the once-only summary record block when `S.season.cupYouWon`) since no running FedEx tally
  existed; all other chips read existing lifetime counters. Verified populated + empty states in Playwright
  (zero page errors; dimmed slots and counts render correctly).

- **CS47 — Leaderboard tweaks.** Removed **Tour Rep** as a sort category (`LB_SORTS` no longer lists
  `['rep',…]` on either board; persisted `S.lbSort==='rep'` falls back to earnings via the existing
  `lbSortValid` guard). The Tour Rep rank still renders next to every player's name (via `lbRep()` → the gold
  "· Star/Legend/…" chip), so it lives by the name rather than as its own ranking. Wins now read in full —
  `lbStatVal` Wins column shows "15 win/wins" (pluralised) instead of "15W", and the career sub-line + offline
  fallback spell out " win(s)" too. Verified in Playwright (no rep chip, rep tier beside names, "N wins").

- **CS48 — Daily Challenge: auto-play OFF by default + shot-by-shot reveal.** `beginDailyRound` now sets
  `S.dailyAuto=false` (you tee off each hole yourself) and `S.dailyRevealN=null`. When a hole is played,
  `playDailyHole` sets `S.dailyRevealN=1` and calls the new `startShotReveal()`, which reveals the hole's
  shots one at a time every `SHOT_REVEAL_MS=750`ms; only when the last shot lands (ball holed) does the
  score hit the scorecard and the round advance (`scheduleDailyAdvance`). `scrDailyRound` withholds the
  in-flight hole from the running total ("through N"), the big to-par number, AND its scorecard cell (shows
  "·" until holed), and shows a "⛳ Hole N · shot X of Y…" indicator with a "Skip to this hole's result"
  button instead of the next-hole controls while revealing (the indicator reads just "⛳ Shot N…", no
  "of Y"). `dShotPanel(h, reveal)` gained a live-reveal
  mode (slices to the revealed shots, only the newest row animates, result tag appears on holing).
  `dailyPause` lands the ball (snaps reveal to full); `clearDailyTimer` clears the shot timer too. The
  reveal runs regardless of auto-play (auto only governs advancing to the next hole). Verified in Playwright:
  auto defaults off, shots reveal ~0.75s apart, card cell stays "·" until holed then shows the score, and the
  auto-play path still flows hole-to-hole. Zero page errors.

- **CS49 — Guest daily limits + sign-in claim.** Guests now get **1** daily attempt (`GUEST_DAILY_ATTEMPTS`,
  vs `DAILY_MAX_ATTEMPTS=3` for accounts) via new `dailyMaxAttempts()` feeding `dailyAttemptsLeft()`. Guests
  **cannot claim a course record** (`finishDailyRound` only calls `recordCourseScore`/`sbSubmitDaily` when
  `sbSignedIn()`), and the result screen shows a "Save this score to your account" banner + a primary
  "🔐 Sign in to save this score" CTA (sets `S._dailyClaimFlow`). A guest's just-played round is stashed in
  `S._claimDaily`; on sign-in/sign-up `maybeClaimDaily()` (called from `sbApply`, `overlayAccount`, and the
  auth `go`) logs it to the account — **consuming one of the account's attempts**, allowing a course record,
  and posting to the board — or, if the account is out of attempts, shows "Couldn't submit this score
  (X/3 used today)". `S.dailyClaimMsg` renders the outcome banner + a toast. The claim-flow guards keep the
  user on the daily result screen (not the Trophy Room) after signing in. `startDailyChallenge` now routes
  an already-played day to the result screen (with the right CTA). Home-button + "Attempt X of N" copy use
  `dailyMaxAttempts()`. Verified all three flows in Playwright (guest 1-attempt/no-record/CTA; claim consumes
  1 of 3; out-of-attempts blocks). NOTE: the 1-attempt cap is enforced per-browser via localStorage — true
  per-IP enforcement would need a server/edge-function check (no anon IP tracking exists in the SQL backend).

- **CS50 — Guest leaderboard sign-in CTA in every board state.** The in-board "🔒 Sign in to see the full
  board" lock CTA previously rendered ONLY in the `globalOk && globalRows.length` branch of
  `overlayLeaderboard`. So if a tab's board returned **no global rows** or fell back to **local mode** (RPC
  error / offline), a guest saw the board with no sign-in prompt — which is what happened on Single Season
  (Career had global rows so its CTA showed; Season did not). Added a shared `guestBoardCTA` (Create account
  + Sign in, gated on `!sbSignedIn()`) and now append it in the "no scores yet" branch and the local-fallback
  branch (both season + career), so a signed-out player always gets the prompt on every tab. Verified in
  Playwright across all three states (local-fallback, empty, full) on both tabs.

- **CS51 — Create-your-golfer redesign: guest gating + skin/hair upgrade.** `scrSetup` rebuilt and
  decluttered: a big sticky avatar preview, then sections grouped under `setupHeader()` rules
  (Appearance / Name / Country & handedness / Kit) instead of a flat 10-control dump. **Guests** can only
  set **gender, skin tone and hair** — name, country, handedness, shirt/hat colours & patterns are replaced
  by a single gold "🔒 Unlock the full locker room" card (Create free account + Sign in) that names exactly
  what an account unlocks (the conversion nudge). Signed-in users get the full set. Start Drafting defaults a
  guest's name to "Your Golfer". **Skin** expanded from 5 → **8 realistic tones** (porcelain→ebony, with
  genuinely dark deep/ebony shades; old ids light/tan/medium/brown/deep preserved). **Hair** refined to 7
  (added platinum; reordered dark→light, retuned hexes). Avatar recolour now uses a **per-target `lpull`**
  (`skinLp`/`hairLp` in `avCompute`) so dark skin actually reads dark and light hair (blonde/platinum/grey)
  reads light against the painted sideburns — previously the darkest skin looked medium-tan and hair shades
  were nearly identical. `swatchRow` swatches enlarged with a luminance-adaptive ✓ on the selected tone.
  Verified guest vs signed-in rendering + a full skin/hair matrix in Playwright (zero page errors).

- **CS52 — Player re-rating pipeline (`dg_transform.py`), sg_total-anchored.** Friends flagged that a
  higher-SG ball-striker (Cam Young) didn't out-rate a short-game/putter type (McNealy). Root cause: the
  2026-06-22 normalization rated each category to its OWN σ — around-the-green SG has a tiny spread, so a
  small edge there blew up into elite short/scr/bnk boxes, and OVERALL stopped tracking true total skill.
  New method (built + verified, NOT yet run on live data — no DG_KEY and feeds.datagolf.com is blocked by
  this env's network policy): **OVERALL is anchored to DataGolf `sg_total`** (overall = 80 + sg_total·5.2;
  Scheffler ≈94, tour-avg 0 → 80), and **per-category shape** comes from each category's own SG (a great
  putter still shows great putting) via fixed slopes (app 13 / put 15 / arg 16 rating-per-SG), then all 7
  SG-driven boxes are uniformly shifted (6-iter, clamp-aware) so their weighted average hits the anchored
  overall. driving dist/acc from raw yards/%; scr=0.6·sht+0.4·putt, bnk=0.7·sht+0.3·scr (feed has no
  split); clu (composure) preserved (no SG stat). The script: reads `DG_KEY` from env (never logged), pulls
  `preds/skill-ratings`, matches by name (handles DataGolf "Last, First" + accents/suffixes + ALIASES),
  re-rates matched current players, recomputes overall, writes golfers.json (+ .bak) AND patches the
  embedded `const ROSTER=[…]` in build-a-golfer.html (the game embeds the roster, doesn't fetch the json) —
  touching ONLY re-rated lines so the diff stays minimal. Dry-run prints a match/biggest-moves report;
  `--input feed.json` runs offline; `--write`/`--html` apply. Verified end-to-end against a realistic mock
  feed: Cam Young 90 > McNealy 87, Scheffler 94 = #1, 242 roster lines stay valid, then files restored.
  **TO ACTUALLY RUN:** set `DG_KEY` + allow `feeds.datagolf.com` in the env network policy, then
  `python3 dg_transform.py` (review report) → `python3 dg_transform.py --write --html build-a-golfer.html`
  → deploy. Constants (OVR_SLOPE/SHAPE) may want a small tune after eyeballing the first real report.

- **CS53 — Re-rating APPLIED from the real 2026-06-22 DataGolf feed.** Owner supplied the raw
  `skill-ratings` CSV (437 players). Ran `dg_transform.py` on it → **136 current players re-rated** in both
  golfers.json and the embedded HTML ROSTER; legends + 9 unmatched young amateurs untouched. Three script
  fixes were needed for the real feed: (1) **CSV input** (`--input *.csv`); (2) DataGolf reports driving as
  a **delta vs average** — `driving_dist` = yards ± avg (McIlroy +21), `driving_acc` = fairway-rate fraction
  ± avg (±0.12) — so driving now maps from the delta (anchor 0→80) not absolute yards/%; (3) **Nordic name
  transliteration** (ø→o, æ→ae, å→a…) so "Højgaard"/"Olesen" match the feed's ASCII spelling. Result fixes
  the exact complaint — **Cam Young 89 > McNealy 87** (sg_total 1.72 vs 1.33), Scheffler 95 (clear #1), Rory
  91, Xander 90; declining vets fall (Cam Smith→81, Poulter/Donald→75/72, Brendon Todd→69), bombers/elite
  rise (Rory/Bryson +4). Distribution: star/rising overalls 69-95, mean 82.5, only 6 ≥90 (realistic). Smoke
  test: ROSTER parses (242), all skills numeric, overall stays consistent with the 8 boxes (max drift 0.50 =
  rounding), draft renders with zero JS errors. NOTE: the raw DataGolf CSV is NOT committed (3rd-party data /
  licensing) — re-supply it to re-run. data_source dated to the feed (2026-06-22), not the run day.

- **CS54 — Saved careers are account-scoped + sign-in-gated (guest leak fix).** Bug: the career franchise
  was saved under a plain, unscoped LS key (`bag_careersave`) and `careerSaveInfo()` had no auth check, so a
  guest on the same browser saw a signed-in user's "Resume Career Mode" and could continue it. Fix: career
  save/resume now require `sbSignedIn()` and use `acctKey('bag_careersave')` (namespaced by user id), so a
  guest can't see or save a career and different accounts are isolated. `migrateLegacyCareerSave()` (called
  from `sbApply` on sign-in) claims a pre-scoping unscoped career for the first account to sign in (if it has
  none) and deletes the unscoped copy so no guest/other account can reach it. `saveMidSeasonAndExit` now
  toasts "Sign in to save & resume your career" instead of a false "Career saved" when a guest exits.
  Verified in Playwright: guest → careerSaveInfo null / no resume button / saveCareer false; sign-in →
  migrated, resume shows; sign-out → gated again; other account → isolated. (Lifetime record `bag_career`
  HoF/Tour-Rep display is a separate key, still local + cloud-synced — not part of this fix.)

- **CS55 — Sign-in no longer hangs ~10s on the "Finishing Google sign-in…" pill.** `sbApply` set
  `authPending=false` up top but only `render()`ed (dropping the pill) AFTER `await`ing the heavy
  `sbLoadProfile()` — which fetches EVERY `runtour_scores` row for the account (owner has 41 builds → many
  rows), slow on mobile. Now sbApply renders right after the small/fast username query (pill gone + header
  signed-in), and runs the heavy careers/stats fetch in the background (`sbLoadProfile().then(render)`),
  refreshing the Trophy Room when it lands. Verified in Playwright with a stubbed 1500ms profile load:
  `sbApply()` resolves in ~8ms (not blocked), pill cleared, signed-in immediately, profile fills in after.
  Remaining sign-in latency is just the OAuth token exchange (Supabase-side), not app blocking.

- **CS56 — Avatar masking fixes: eyebrows stop following hair colour + black/white kit renders.** Two recolor
  bugs surfaced after the light-hair tuning (CS51): (1) eyebrows are baked into the HAIR region of the mask,
  so light hair (blonde/platinum/grey) turned the brows garish bright. Added `avIsBrow(nx,ny)` (band ny
  0.275–0.42, nx 0.30–0.70 — measured from the mask: central hair pixels cluster at ny 0.30–0.40) → those
  pixels tint to a fixed `BROW_HEX` (#34281b) instead of the hair colour, so brows stay a natural dark brow
  regardless of hair. The band excludes the temples/side hair, so female long hair still recolours. (2)
  black (#20242b) & white (#eef0ee) shirts/caps stayed base-teal because shirt/cap used a flat lpull 0.12;
  added `avKitLp(hex)` — keeps 0.12 for mid colours but ramps to ~0.86 for near-black/near-white so they
  actually read black/white (skin/hair keep their own per-target lpull). Per-pixel tint block refactored to
  branch cleanly per region. Verified on male + female across blonde/platinum/grey hair and black/white kit
  (brows dark, hair correct, kit correct, mids unchanged); zero page errors.

- **CS57 — Mid-season progress auto-saves (refresh / go-home resume).** Bug (user-reported): a signed-in
  player who refreshed or went home mid-season lost the whole golfer/season — mid-season state only saved on
  the explicit "Save & Exit" button, and in YEAR 1 the career object doesn't exist until the first summary so
  even that path could miss. Fix: new `autoSaveSeason()` checkpoints the in-progress season (schedule,
  evtIndex, results, totals, field, me, slots, look, name) into the account-scoped `bag_careersave` at clean
  event boundaries — in `startSeason` (captures the freshly-built golfer at event 0) and in `advanceEvent`
  (after each completed event). `saveCareer` relaxed to not require `S.career` (saves `career:S.career||null`
  so year-1 works), and `careerSaveInfo` now treats a save with an in-progress `mid.season` as resumable even
  without a finished-year franchise. The in-progress event re-sims on resume (it isn't recorded yet); the
  summary's plain `saveCareer()` clears the mid checkpoint when a year completes. Signed-in only (consistent
  with CS54 account-scoping); guests get no save. Verified in Playwright: guest no-save; year-1 checkpoint
  saves with null career; checkpoint advances per event; reset()+resumeCareer() restores the same golfer at
  the right event with all completed events; other accounts isolated. Zero page errors.

- **CS58 — Skip the team-cup sim when you're not involved.** Request: "If you miss the Ryder cup,
  Presidents, or Olympics, I don't want the user to sit through the simulation. It should go right to the
  result after the selection screen because the player is not involved." Fix: in `scrTeamCup`'s pre-match
  intro phase, compute `involved = T.playerSelected || T.captain`. If involved, the button still reads
  "Watch the {cup} ▸" and starts the match-by-match reveal as before. If NOT involved (missed the team, not
  captaining), the button reads "See the Result ▸ · You're not involved this week" and sets
  `S.teamMatchN` to the total match count so the screen lands directly on the final scoreboard/banner — no
  28-match watch-through. Olympics needs no change: `beginEvent` already routes a non-qualifier to play a
  same-week tour stop (John Deere Classic) as a real competitor earning money/points, so they're never made
  to sit through the Olympic sim. Verified in Playwright: missed→"See the Result" jumps to teamMatchN=28 with
  the result banner and no "match N of M" reveal; made→"Watch the…" begins reveal at teamMatchN=0 with no
  premature result. Zero page errors.

- **CS59 — Masters "Green Jacket" graphic redrawn as a blazer (was a T-shirt).** The Masters
  major-champion icon (`greenJacketSVG`, used on the champion celebration screen and in the trophy case)
  read as a tee — short cap sleeves poking out, a closed crew/V-neck, two centered buttons. Redrawn as a
  proper sport coat: broad rounded shoulders with sleeves hanging at the sides (no cap-sleeve nubs), notched
  lapels, a dark shirt/tie gap between the open fronts, a single fastening button at the waist, a breast
  pocket, and a shallow open hem vent (not a deep split that read as legs). Same gradient `gj` plus a lighter
  `gjl` for the lapels; viewBox unchanged so all call sites scale identically. Verified the live function
  renders cleanly at both the large celebration size and the small trophy-case size, `majorTheme('The
  Masters')` still wires to it, zero page errors.

- **CS60 — Public-launch prep: DataGolf attribution, disclaimer, golf-specific privacy/terms,
  username profanity filter.** Owner requested a launch-readiness review, then asked to implement the four
  flagged gaps in order:
  1. **DataGolf attribution + "not affiliated" disclaimer.** Added a persistent footer line on the title
     screen ("Player ratings derived from DataGolf data. Not affiliated with the PGA Tour, DataGolf, or any
     player.") linking to the new Privacy/Terms pages, plus a fuller credits block at the bottom of the How
     to Play screen with the same attribution + disclaimer and a link to datagolf.com.
  2. **Golf-specific Privacy Policy + Terms of Use.** New standalone pages `build-a-golfer/privacy.html` and
     `build-a-golfer/terms.html`, styled to match Run The Tour's own dark-green/gold identity (not the
     RunThePitch cream theme the root `privacy.html` uses, which doesn't mention golf, OAuth, Supabase, or
     DataGolf at all). Privacy covers: guest vs. account data, Google/Supabase as processors, the
     username→email lookup RPC (`email_for_username`, disclosed as auth-only/never public), DataGolf as a
     stats source, local storage usage, children, deletion requests, contact. Terms covers: not-affiliated
     disclaimer (PGA Tour/Masters/Ryder Cup/Olympics/DataGolf/any player), entertainment-only / no real-money
     mechanics, account conduct (offensive usernames may be removed), no warranty, contact. Linked from the
     title-screen footer and How-to-Play; deploy copies them to `golf/privacy.html` / `golf/terms.html`
     alongside `index.html`.
  3. (Folded into #1 — the disclaimer and attribution were combined into one footer/credits treatment rather
     than two separate UI additions.)
  4. **Username profanity filter.** New `supabase/29_username_filter.sql` redefines `username_ok()` (the
     single gate used by `username_available`, `set_username`, and the OAuth `handle_new_user` trigger) to
     reject a blocklist of common profanity/slurs, normalizing case/underscores/basic leetspeak digits first
     so trivial evasions don't slip through. No client change needed — the existing signup/rename flows
     already surface a generic "that username is taken/not allowed" message when `username_available`
     returns false, so a blocked name fails the same way a taken one does (no need to leak why). Documented
     the known Scunthorpe-problem tradeoff (substring blocklist can rarely false-positive on an innocuous
     name) directly in the migration. **ACTION: run `supabase/29_username_filter.sql`** in the Supabase SQL
     editor — client-side has nothing to deploy for this one beyond the already-shipped HTML.
  Verified: title screen and rules screen render the new footer/credits with working links, zero page
  errors; privacy.html/terms.html render standalone with the golf theme and cross-link correctly.

- **CS61 — Reposition as a 40-year career simulation, not a "season" game.** Owner: "I want to be selling
  the game as a career simulation up to 40 years, instead of saying sim a season... we need to really sell
  this product." The career engine already supports a full 40-year arc (`CAREER_MAX_YEARS=40`: aging, decline,
  retirement, World Ranking, FedEx Cup playoffs, season awards, Ryder/Presidents Cup with captaincy, Olympic
  medals, rivalries, a trophy case) but none of that depth was reflected in any user-facing copy — the title
  screen, How to Play, About, and all meta tags described it only as "run a pro season." Rewrote every
  marketing-facing surface to lead with the career arc and name the marquee events:
  - `<title>`, meta description, OG/Twitter title+description+image:alt all rewritten around "a 40-year
    career simulation" instead of "run a pro season."
  - `manifest.webmanifest` description updated to match (app-name fields left alone, no room for a tagline).
  - Title screen: new gold `⛳ 40-Year Career Simulation` badge under the hero, rewritten lede ("live out
    their career, up to 40 years on tour... chase majors, the Ryder Cup and Olympic medals, and retire a
    legend"), and the primary CTA subtext now reads "Build your golfer, start their career."
  - How to Play: rewrote the intro lede, renamed the "Career mode" section header to "Career Mode · Up to 40
    Years," and added a 5th step card, "Live a full career, not just a season," that's the first place in
    the whole app's copy to actually name the Ryder Cup, the Presidents Cup, Olympic medals, the World
    Ranking, and rivalries as things you'll experience.
  - About overlay: rewritten to lead with "a free 40-year golf career simulation" and the same marquee-event
    list.
  Verified end to end in Playwright: all four surfaces (meta tags, title screen, rules screen, about overlay)
  carry the new copy, screenshots confirm clean layout (badge doesn't crowd the hero, 5-step list reads
  fine), zero page errors.

- **CS62 — Daily Challenge: 23 new real courses (16 → 39), researched and calibrated.** Owner pitched two
  ideas for the Daily Challenge: (1) let a signed-in player who completes a 40-year career and hits an elite
  bar use that retired golfer for a one-time Daily Challenge attempt, and (2) add a lot more courses. We
  discussed design forks for #1 via AskUserQuestion (owner picked: career-achievement gate — Grand Slam / 5+
  majors / 3+ POY — over raw OVR; use the golfer's peak-career OVR, not their declined retirement-year state;
  a separate "Legend" leaderboard tier so maxed golfers don't just own every human-drafted course record; one
  token per qualifying career, not a lifetime-one-shot) but **#1 is still unimplemented** — only #2 shipped
  this round, after the owner said "you can pick but do research and choose courses people will want to
  play." **What shipped:** `DAILY_KEYS.length` 16 → 39. Picked 24 candidates (later 23 after dropping two
  weak picks — see below) prioritizing recognizable venues: 12 U.S. major-championship courses (Pinehurst
  No. 2, Winged Foot, Bethpage Black, Whistling Straits, Shinnecock Hills, Southern Hills, Kiawah Island
  Ocean, Olympic Club, Baltusrol, The Country Club, Merion, Oakland Hills), 4 Open Championship links venues
  (Royal Troon, Carnoustie, Royal Portrush, Turnberry), and 7 iconic regular PGA Tour stops (Riviera, Torrey
  Pines South, Innisbrook Copperhead, Waialae, Colonial, Firestone South, TPC Southwind). Sourced from the
  110 courses `course_fit.json` already has measured DataGolf skill-fit multipliers for — far more venues
  than were wired into the rotation. Two swaps during research: dropped the originally-picked **TPC Boston**
  after a research pass found it hasn't hosted a PGA Tour event since 2020 (replaced with **TPC Southwind**,
  the actual current FedEx St. Jude Championship / first FedEx Cup Playoffs venue) and dropped
  **Congressional** entirely after its research came back too thin to trust (most holes unconfirmed, one
  outright-fabricated hole nickname the research agent itself flagged and refused to use) rather than ship
  weak data.
  Per-course data (par/yardage/18-hole scorecard/blurb/signature holes/real tour scoring average) came from a
  large parallel web-research fan-out (many agents, several spawning their own sub-agents to verify
  conflicting scorecards against multiple sources), matching the existing `courses.json` convention of
  flagging `verified:false` on anything not confirmed against one authoritative scorecard — which is most of
  it, since almost every primary scorecard site (Wikipedia, BlueGolf, official club/tour sites) 403'd direct
  fetches in this environment, so data is search-snippet-triangulated and cross-checked rather than
  single-source-verified. `avg` (the real-world tour scoring average vs. par — the "beat the tour average"
  target) is a directly-sourced figure where research agents found one (e.g. Turnberry 2009 +2.59 from
  DataGolf, Royal Portrush 2019 +1.175 from Golf Channel, TPC Southwind 2025 -0.88 from PGA Tour coverage)
  and a reasoned estimate elsewhere, always flagged as such by the research.
  **cdiff calibration**: existing courses' `avg`/`cdiff` pairs don't hit the documented "OVR-80 flat build
  averages the real scoring average" target exactly when checked against the live engine (e.g. Augusta's
  stored cdiff=0.06 actually simulates to a mean of ~1.1, not the displayed avg of 1.41) — a pre-existing,
  accepted gap, not something this pass introduced. Rather than hand-guess cdiff for 23 new courses, built a
  Monte Carlo calibration harness that calls the browser's own live `dSimHole`/`dBaseDiffs` functions via
  Playwright (not a hand-reimplementation — an earlier from-scratch JS port showed a systematic ~0.3 offset
  from the real engine, so calibration runs directly against the shipped code to eliminate transcription
  risk) and two-point-interpolates + one Newton-refines to find the cdiff where a flat-80 balanced/breezy
  build's simulated mean matches each course's researched avg — validated to match target avg within ~0.005
  across all 23 new courses.
  `DAILY_COURSES` entries follow the existing schema exactly (`v`, `loc`, `par`, `yd`, `ver`, `blurb`, `avg`,
  `cdiff`, `fit`, `sig`, `holes`); `courses.json` (the source-of-truth doc file) updated in parallel with the
  same 23 entries for consistency. No code changes needed beyond the data itself — `DAILY_KEYS`,
  `dailyCourseKey`'s rotation-cycle math, and `DAILY_MEAN_YPP` are all already derived dynamically from
  `Object.keys(DAILY_COURSES).length`, so the 16-day reshuffle cycle became a 39-day cycle automatically.
  Verified: embedded script parses (`node --check`) after the object-literal splice (first attempt
  double-closed the `DAILY_COURSES` object and broke parsing — caught immediately, fixed); `DAILY_KEYS.length
  === 39`; every new course's `holes` sums to its stated `par`/`yd`; `dSimHole`/`dBaseDiffs` run cleanly on
  5 sampled new courses; `dailyCourseKey` cycles through the full 39-course pool over 60 simulated days with
  no crash; a full 18-hole round played end-to-end on Whistling Straits via `autoFinishDaily()` reached
  `dailyresult` with a sane score; Playwright screenshots of the Daily Challenge preview screen on Kiawah
  Island and Merion confirm blurb/skill-tags/target-average/signature-holes all render correctly. Zero page
  errors. The 5 *pre-existing* courses' `par`/`yd` fields don't sum exactly to their `holes` arrays (St
  Andrews, Quail Hollow, East Lake, Glen Abbey, Sedgefield) — flagged as a harmless, out-of-scope discrepancy
  that predates this change, not touched here.

- **CS63 — Legend Tokens: play a Daily Challenge round as a retired 40-year career's peak build.**
  Implements idea #1 from the CS62 discussion (owner confirmed via AskUserQuestion: career-achievement gate
  over raw OVR; peak-career state, not retirement-year decline; a separate Legend leaderboard tier; one
  token per qualifying career). Full pipeline, all client-side except the new SQL migration:
  - **Peak-build tracking** (`scrSummary`, right after `S.career.seasons.push`): every season, if this
    year's `ovr` beats `S.career.peakOvr`, snapshot the full 8-skill profile (`S.career.peakSkills`, from
    `S.season.me`, not just the scalar overall), plus `peakName`/`peakLook`/`peakYear`. This is what a token
    freezes — the golfer at their best moment, not however they looked in a declined final season.
  - **Qualification bar** (`legendQualifies`/`legendQualifyReason`): Career Grand Slam (win all 4 majors) OR
    5+ career majors OR 3x Player of the Year, checked against the CURRENT career's own tracked stats
    (`S.career.majorStats`/`S.career.majors`/`S.career.awards.poy` — per-run counters, not the lifetime `lt`
    totals, so an old career's accomplishments can't qualify a new mediocre one).
  - **Minting** (`mintLegendToken`, called from `endCareer` only when `reason==='age'` — the forced
    year-40 retirement path, never `'chose'`/early retirement, matching "completes a 40-year sim"
    literally): banks a token `{name, ovr, skills, look, reason, years, used:false}` under
    `acctKey('bag_legend_tokens')`. Signed-in only (career mode already requires an account, CS54).
    Celebrated on the career-end ceremony screen with a gold banner naming the golfer, peak OVR, and which
    bar it cleared.
  - **Spending it** (`scrDailyPreview` → `beginDailyRoundWithLegend`): unused tokens show as cards ("Play
    as Legend ▸") alongside the normal "Draft your golfer" button. Picking one skips setup/draft/build
    entirely — `S.dailySkills` loads straight from the frozen snapshot, `S.name`/`S.look` swap to the
    legend's identity for the round. Uses one of the day's 3 attempts, same as a normal round (not a bonus
    4th, per the discussion). The token is consumed in `finishDailyRound` on completion — win or lose, but
    never for an abandoned/backed-out attempt (nothing marks it used until the round actually finishes).
  - **Separate Legend tier**: `is_legend` threaded through `S.dailyResult`, local course records
    (`recordCourseScore` now takes an `isLegend` flag and writes to a distinct `bag_courserecords_legend`
    bucket instead of the human `bag_courserecords`), and the Supabase submission
    (`supabase/30_runtour_legend.sql` — **ACTION: owner needs to run this** — adds `is_legend boolean` to
    `runtour_daily_scores` and a `p_legend` filter param to `runtour_submit_daily`/`runtour_daily_board`/
    `runtour_course_records`, mirroring the `p_sort` pattern from `28_runtour_sort.sql`; fully backward
    compatible, defaults false everywhere so existing callers see exactly the human board they always have).
    `overlayCourseRecords` gained a Human/Legend tab toggle covering both today's board and all-time
    records; the Legend tab lazy-loads (`crLoadLegend`/`dbLoadLegend`) only when actually opened. Known,
    documented limitation: `is_legend` is client-declared (same pragmatic posture as the rest of this
    table) — the server has no visibility into career-completion state to verify the claim, only the score
    itself is still server-recomputed/clamped as before.
  - Trophy Room (`overlayRecord`) gained a compact Legend Tokens strip (`legendTokensHTML`) showing ready
    tokens + a lifetime count, only rendering at all once a player has earned one.
  - How to Play gained a 5th Daily Challenge step explaining the mechanic.
  Verified extensively in Playwright: qualifying 40-year career (Grand Slam) mints a token with the correct
  peak snapshot; a non-qualifying career and a qualifying-but-voluntarily-early-retired career both mint
  nothing; the Daily preview shows/hides the token card correctly; clicking "Play as Legend" skips straight
  to `dailyround` with frozen skills and no draft; finishing the round tags `isLegend=true`, consumes the
  token, and writes to the legend-only local course record (not the human one); Trophy Room and the
  Human/Legend course-record toggle render correctly (a template-literal bug where `$()` — which returns
  only `firstChild` — silently dropped a sibling `<button class="btn red">Close</button>`, breaking the
  overlay's close handler, was caught by this same test pass and fixed); a normal token-free draft round and
  a signed-out guest's Trophy Room were re-verified unaffected (regression pass). SQL migration validated
  end-to-end against a real local Postgres instance (stubbed `auth`/`profiles`): clean apply after
  `24_runtour_daily.sql`, a human and a legend submission on the same course stay on separate
  boards/records despite the legend score being better, a later legend submission from the SAME user
  correctly flips their single best-of-day row's `is_legend`, and a worse subsequent submission is
  correctly rejected (existing anti-cheat upsert guard intact).

- **CS64 — Working ≡ menu + guest course-record copy fix.** Owner ran `30_runtour_legend.sql` (confirmed:
  "success, no rows returned" — clean apply, no data to migrate yet). Two bugs reported:
  1. **Guest "Course record" copy was misleading.** On the Daily Challenge preview screen, a guest with no
     record set saw "Unclaimed, be the first to set it" — implying they could claim it, when guests can't
     post scores at all (CS49). Fixed: `scrDailyPreview`'s course-record line now checks `sbSignedIn()` and
     shows "Sign in to post your score" for guests, keeping the original "Unclaimed, be the first to set
     it" only for signed-in players who genuinely can claim it.
  2. **The top-left ≡ icon wasn't a menu.** It was hardcoded to `openRules` — tapping the hamburger icon
     just jumped straight to How to Play, with `aria-label="How to play"` admitting as much. Everything
     else (Leaderboard, Trophy Room, Course Records) was only reachable from the title screen's own
     buttons, so there was no way to reach them mid-draft or mid-season without navigating all the way back.
     Built a real menu: `overlayMenu` (new `S.overlay==='menu'`, same `.ov` overlay pattern as every other
     overlay in the app) grouped into three sections — **Play** (Home, How to Play, Leaderboard, Trophy
     Room, Course Records), **Account** (Sign in / your username + email, or Trophy Room shortcut if
     already signed in; Reset), **About** (About, Privacy, Terms, Contact, Add to Home Screen) — each row
     an icon + label + one-line description via a new `menuRow()` helper. The ≡ button now opens this
     overlay from any screen; picking an item always resolves relative to whatever screen you were on
     (e.g. opening Trophy Room mid-draft leaves you on the draft screen underneath once you close it — nothing
     is lost, it's just an overlay). `aria-label`/`aria-expanded` updated to reflect the real menu state.
  Verified in Playwright: clicking ≡ opens the Menu overlay (not Rules) from the title screen; every row's
  label/sub-copy is correct; clicking "How to Play" from inside the menu still lands on the rules screen
  with the overlay closed; opening the menu from `draft` (mid-progress) and picking Trophy Room leaves
  `S.screen==='draft'` intact underneath; guest vs. signed-in menu content differs correctly (Sign In row
  vs. username/email); `openRules()` still works when called directly elsewhere in the app; the footer nav
  and Close-button dismissal are unaffected. Guest course-record copy verified both ways (guest sees "Sign
  in to post your score", signed-in sees the original "Unclaimed" copy) with a full-page screenshot. Zero
  page errors throughout.

- **CS65 — Expanded draft archetypes (9 → 38 outcomes).** Owner: "can we expand on the archetypes when a
  user drafts a golfer? i want there to be more options." The post-draft identity reveal on `scrBuild()`
  (`archetype(p)`) previously had only 9 possible outcomes: 8 single-skill specialists (Bomber/Marksman/
  Surgeon/Magician/Escape Artist/Sandman/Assassin/Closer, one per CATS skill) plus one balanced-elite case
  ("The Complete Player"). Expanded to 38 total:
  1. **28 new two-skill "dual-threat" combo archetypes** (`ARCH_PAIR`, one per unordered pair of the 8
     skills — e.g. dist+acc="The Total Package", dist+scr="Bomb and Gouge", put+clu="Mr. Sunday",
     app+put="The Executioner") — triggered when the top two skills are within 6 points of each other and
     both clearly ahead of the field, via a new `pairKey(a,b)` canonicalizer keyed on CATS order.
  2. **Split the old single balanced case into two**: kept "The Complete Player" for balanced-and-elite
     (mx-mn≤10, mean≥84), added "The Journeyman" ("Steady across the board, no real holes") for
     balanced-but-not-elite builds, so a mediocre-but-even draft gets its own identity instead of just
     falling through to whichever skill happened to be nominally highest.
  3. Kept all 8 original single-skill archetypes unchanged, now used only when one skill clearly dominates
     (gap >6 over the 2nd-highest, or no close pair entry found).
  Verified: all 28 `ARCH_PAIR` entries reachable and correctly keyed; edge cases (all-equal-elite,
  all-equal-low, pure single-skill dominance, close pairs, 3-way-close ties) all resolve correctly; 5000
  random skill draws produced 36 distinct outcomes with zero crashes and zero undefined names (the
  remaining 2 — Complete Player/Journeyman — are rare under independent-uniform sampling since they need
  all 8 skills within a 10-point band, confirmed separately via the edge cases); visual check on the real
  Build screen renders the new names/descriptions in the existing gold-italic style; full regression suite
  (menu, guest course-record copy, footer nav) still green with zero page errors.

- **CS66 — Archetype shown on the Leaderboard.** Owner: "can we add the players archetype to the
  leaderboard bubbles next to the golfers name under the username?" The Single Season / Career Leaderboard
  overlay (`overlayLeaderboard`) already showed a row's username on top and the golfer's name in a "sub"
  line underneath (e.g. `Big Bertha · OVR 91 · Yr 2`), but had no archetype — `archetype(p)` (CS65) was only
  ever called once, right after a draft, and the global board's RPCs never returned the `skills` jsonb each
  season already stores in `runtour_scores` (captured since 22_runtour_leaderboard.sql, just never selected
  by the board functions). New migration `supabase/31_runtour_archetype.sql` adds `skills` to both
  `runtour_season_board` and `runtour_career_board`'s return shape (career board picks the skills from the
  same season `golfer_name` already comes from — the most recent one in that career), same p_sort/ranking/
  limits otherwise untouched. Client: `overlayLeaderboard`'s `rowFn` now computes `archetype(r.skills)` (when
  a row has a full 8-key skills object — legacy rows with null skills just fall back to the old plain
  golfer-name line, no crash) and inserts the archetype name between the golfer's name and the OVR/season
  stats, e.g. `Big Bertha · The Bomber · OVR 91 · Yr 2`.
  Verified the migration end-to-end against a local Postgres instance (stubbed auth/profiles, applied
  10→22→26→27→28→31 in order): both board RPCs return the right per-row `skills`, and the career board
  correctly resolves to the latest season's skills matching its `golfer_name`. Client-side: mocked global
  board rows (one full-skills row, one legacy null-skills row, one signed-in "you" row) — full-skills rows
  show the correct archetype next to the golfer name on both Single Season and Career tabs (including a
  two-skill combo archetype), the null-skills row falls back cleanly with no archetype and no error, and the
  raw row HTML confirmed no double-escaping/broken markup. Full existing regression suite (menu, guest
  course-record copy, footer nav, archetype distribution) still green, zero page errors throughout.

- **CS67 — Sticky Ryder/Presidents Cup scoreboard.** Owner: "can the scoreboard for the presidents cup
  and ryder cup be fixed to the top as you scroll through?" `scrTeamCup()`'s running score header (tag +
  the two-team point box + "First to 14½ wins" line) used to be plain in-flow content, so once several
  session cards' worth of matches were revealed the score scrolled off screen along with everything else —
  annoying mid-Cup when you want to keep an eye on the score while scrolling through match results. Wrapped
  that header in a new `.cupsticky` block (`position:sticky; top:0`, solid page-matching background,
  bottom border + shadow for separation, safe-area-aware top padding for notched phones) so it now pins to
  the top of the viewport while the match session cards scroll underneath it. The score/"match N of 28"
  text inside it already re-renders live as matches are revealed, so the pinned header stays current
  throughout. Everything below it (final-result banner, session cards, Next match/Auto Sim/Skip controls)
  is unaffected — only the header itself is sticky.
  Verified in Playwright: `.cupsticky` computes to `position:sticky;top:0px`; after scrolling 600px and to
  the very bottom of a 6-session-card board it stays pinned at the top of the viewport the whole time;
  clicking "Next match" and "Skip to Result" both correctly update the live score/match-count text inside
  the pinned header; full existing regression suite (menu, guest course-record copy, leaderboard archetype,
  footer nav) still green, zero page errors throughout.

- **CS68 — RunThe.GG cross-promotion (RunThePitch interconnectivity, golf side).** Owner wants the two
  RunThe.GG games to reference each other: account-creation copy should tell people RunThe.GG is a broader
  platform with more games coming, plus a persistent small ad/link to the other game. Discussed the plan
  first (static footer pill, approved). Implemented on RunTheTour:
  1. **Sign-up perks panel** (`unlockPerks()`): added a 5th perk — 🌐 "One account, every game — Also plays
     RunThePitch, with more RunThe.GG games on the way" — alongside the existing leaderboard/sync/achievements
     perks, so a new signup sees this is a platform account, not a single-game one.
  2. **Footer pill** (`footer()`, renders on every screen via `render()`, not just title): a third pill next
     to the existing "Questions or Comments" / "Add to Home" pills — `↗ Try RunThePitch`, teal-accented to
     read as "the other game" rather than a utility action, links to `/` (root domain = RunThePitch's
     deploy) in a new tab (so an in-progress golf career/draft is never lost). `.footpills` got
     `flex-wrap` so the third pill wraps to its own row on narrow phones instead of overflowing.
  3. **About overlay**: new "More from RunThe.GG" `.scout` callout box (replacing the old one-line "sibling
     to RunThePitch" mention buried in the intro paragraph) explicitly framing RunTheTour as one of a
     *growing family* of RunThe.GG games under one account, with a RunThePitch link and a "more games on
     the way" note.
  Verified in Playwright: footer pill present with correct `href="/"`, `target="_blank"`, `rel="noopener"`
  on both the title screen and a non-title screen (draft) confirming it's truly global; sign-up perks list
  includes the new platform-account perk; About overlay renders the new callout box with a working
  RunThePitch link. Full existing regression suite (menu, guest course-record copy, leaderboard archetype,
  cup sticky scoreboard, footer nav) still green, zero page errors.
  **Follow-up (not part of this change):** wrote a prompt for a separate chat session to mirror this on the
  RunThePitch side (its own sign-up copy, footer pill linking to `/golf`, About-page blurb) — RunThePitch's
  root `index.html`/`gameLogic.js` are out of scope for direct edits in this session per standing
  instructions, so that work has to happen in its own session against that codebase.

- **CS69 — Footer cross-promo pill hook line.** Owner: "can we make the pill have a little message like
  'Love soccer?' before the current message." Quick follow-up to CS68's `↗ Try RunThePitch` footer pill —
  added a lighter/italic "Love soccer?" hook before the bold CTA, so the pill now reads `↗ Love soccer? Try
  RunThePitch`. Verified in Playwright (pill text/href/target unchanged otherwise) and visually via
  screenshot; full regression suite still green.

- **CS70 — Steeper career decline, anchored to year 15.** Owner: "people are being able to sustain a really
  high overall for a really long time. I think the regression should start in year 15 and should
  increasingly get harder from there. lets make it a little harder." The player's age/form decline system
  (`applyPlayerDecline()`, CS37) technically already started around year 14 for an average-performing
  player, but the "prime bank" mechanic (rewards sustained winning by delaying decline onset, up to +6
  effective years) let any consistently strong player — exactly the ones a real player notices staying
  elite — flatline at their drafted OVR clear through year 20-24, then the decline ramp itself capped out
  at 1.8 around year 25 and never got any harder after that. Combined, a good career could realistically
  hold a near-peak OVR for two-thirds of the 40-year run. Retuned three levers in `applyPlayerDecline()`/
  `effAge()`/`PEAK_END_AGE`:
  1. `PEAK_END_AGE` 34→35, so decline can first tick as early as age 36 (year 15) for a neutral-form player
     — exactly the anchor point requested.
  2. Prime-bank cap (the "play young" reward for winning) 6→3: elite, constantly-winning careers still get
     rewarded with a later onset, but now bounded to ~year 18-20 instead of being pushed out to year 25+.
  3. Decline ramp cap 1.8→2.5 (same initial slope, so early-decline feel near year 15 is unchanged) and,
     since the cap is reached later (bigger cap ÷ same slope), the ramp keeps climbing — i.e. genuinely
     "increasingly harder" — for a much longer stretch of the career instead of flattening out by the
     mid-to-late 20s.
  4. `DECLINE_RATE` per skill bumped ~10-15% across the board (dist 1.9→2.1, acc/app 1.0→1.15, sht/scr/bnk
     0.7→0.8, put 0.6→0.7, clu 0.2→0.25) for the "a little harder" ask on top of the structural changes.
  Modeled the tuning with a standalone Node simulation before touching the file (average-form, max-prime-bank
  elite, and min-prime-bank struggling trajectories from year 1-40), then re-verified the exact same numbers
  by calling the real in-browser `applyPlayerDecline()`/`effAge()` functions directly via Playwright — the
  struggling-form trajectory matched the standalone sim row-for-row (year 25: OVR 71.1, year 30: 60.5, year
  40: 50.7 in both). Result: a neutral-form career's OVR now starts fading at year 15 as requested (was
  flat to ~year 14 before, negligible change there), an elite max-bank career now visibly declines by
  year 20 instead of staying pegged at its drafted OVR through year 24, and by year 40 a strong career's
  OVR lands ~10 points lower than before (63.9→53.9) — "a little harder," not a cliff. Also fixed a stale
  "Year 16+" UI comment to "Year 15+" to match. Verified in Playwright: the off-season "Age is catching up"
  vs "In your prime" banners correctly flip at the right years with the new constants, full existing
  regression suite (menu, guest course-record copy, leaderboard archetype, cup sticky scoreboard, cross-promo
  footer pill, footer nav) still green, zero page errors.

- **CS71 — Fixed: completed seasons silently failing to post to the leaderboard (+ launch reset
  migration).** Owner reported "I have just finished a few seasons that should be at the top but don't
  see them" and asked to fix that before clearing the leaderboard for public launch. Root-caused a real
  bug in `flushPendingSeasons()` (the
  durable season-submission queue) and `sbSubmitDaily()`: both called `await sb.rpc(...)` inside a
  try/catch but never inspected the RESOLVED result's `error` field. supabase-js does **not** throw on a
  Postgres/PostgREST error (e.g. the RPC's own `raise exception 'set a username on RunThe.GG first'`) —
  it resolves to `{data:null, error:{...}}`. Every OTHER `sb.rpc()` call in the file correctly destructures
  and checks `{data,error}` (confirmed by grep — `lbLoad`, `set_username`, `runtour_my_stats`, etc. all do
  this); these two didn't. Practical effect: any rejected submission (bad/missing username, RLS, a
  malformed param) looked byte-for-byte identical to a successful one — the code incremented `posted++`,
  removed the item from `bag_pending_seasons`, and it was gone. No error ever surfaced, nothing was ever
  retried, and the data was unrecoverable client-side once that happened. This is almost certainly what
  the owner hit. Fixed both functions to `const {error}=await sb.rpc(...); if(error) throw error;` so a
  rejected submission now correctly falls into the existing catch/retry/keep-queued path instead of being
  silently discarded, and both now `console.error` the failure (with the real Postgres error message) so a
  future recurrence is actually debuggable instead of invisible.
  Verified in Playwright by stubbing `sb.rpc` to return a resolved `{error}` (simulating the exact
  supabase-js behavior a real Postgres exception produces, not a thrown error): confirmed the season now
  stays queued for retry instead of being dropped; confirmed a later successful retry still correctly
  clears the queue (no regression to the happy path); confirmed a genuine network-level throw is still
  caught the same as before; confirmed the same fix on `sbSubmitDaily` no longer swallows a rejected daily
  submission silently. Full existing regression suite still green.
  Also wrote `supabase/32_runtour_launch_reset.sql` (mirrors the existing `25_runtour_reset.sql` pattern —
  truncates `runtour_scores`/`runtour_stats`/`runtour_daily_scores`, the tables backing the leaderboard/
  stats/daily-challenge history) for the owner to run themselves once they've confirmed a freshly-completed
  season now actually posts with this fix live — wiping first and then discovering the submit path was
  still broken would just leave an empty board with no way to tell. Deliberately does NOT touch the
  client's `RESET_ENABLED`/`RESET_EPOCH` local-device wipe (a much bigger, separate lever that would erase
  every player's own in-progress local career/save) since the owner only asked to clear the leaderboard,
  not local device data — validated the migration file against a local Postgres instance (runs clean on an
  empty DB, re-run is a no-op).

- **CS72 — Fixed: falsely claiming the Daily Challenge course record.** Owner reported "it says I have the
  course record on today's course daily challenge but someone shot a lower score." Root cause:
  `recordCourseScore()` (called from `finishDailyRound()`/`maybeClaimDaily()`) only ever compares a
  finished round against THIS DEVICE's local `bag_courserecords` cache — never the live server state. That
  cache is only refreshed by `crLoad()`, which is triggered on the Daily Challenge preview/result screens,
  but there's an inherent race: if another player's better score already exists on the server (or lands
  moments later) and this device's local cache hasn't caught up yet, `recordCourseScore()` optimistically
  (and wrongly) declares a new record. Added `verifyDailyRecord(courseKey, isLegend)`: called right after
  `sbSubmitDaily()` in both `finishDailyRound()` and `maybeClaimDaily()`, it re-fetches the authoritative
  course record (`crLoad()`/`crLoadLegend()`, which already self-heals the local cache when the fetched
  value is better) and corrects `S.dailyResult.record` — plus the persisted `bag_daily.result`/`.best`
  entries and the "logged a guest round to your account" claim banner — if the optimistic local guess
  turns out to be wrong, then re-renders.
  Verified in Playwright with a stubbed `sb.rpc` simulating exactly this race (stale empty local cache,
  optimistic local "record!", then a fake server response showing another player's lower score): confirmed
  the flag flips from `true` to `false` and the local course-record cache self-heals to the correct global
  holder; confirmed a GENUINE record holder is left alone (flag stays `true`, no false negative). Full
  regression suite still green.

- **CS73 — Fixed: a retired/ended career could still be "resumed."** Owner reported "when I retired, and
  then went home, it let me resume from the last season" — also flagged (screenshots) that seasons/careers
  still weren't reaching the public leaderboard even after CS71's fix; see the reply in this session for
  the leaderboard follow-up (those screenshots turned out to be the in-game LOCAL season/career money-list
  screens on the summary recap, not the actual global Leaderboard overlay — asked the owner to check the
  Trophy icon specifically and the browser console for the new `[RunTheTour] season submit failed...` log
  line from CS71, since that will show the real server-side rejection reason if one is still occurring).
  Root cause of the retirement bug: `endCareer()` (fired on both forced 40-year retirement AND voluntary
  early "Retire, End Career") called `saveCareer()` to "keep the final state addressable" — intentional,
  so an accidental refresh mid-ceremony doesn't lose the recap — but nothing distinguished that save from
  a genuine in-progress career. The title screen's "Resume Career Mode" button unconditionally called
  `resumeCareer()` → `continueFranchise()` on ANY save with career data, including one from a career the
  player had just explicitly ended, happily starting the next season on a "retired" golfer.
  Fixed: `endCareer()` now saves with an `ended:true` flag (plus `careerEnd`/`freshLegendToken` so the
  ceremony can be faithfully redisplayed). The title screen branches on this flag: an ended save shows
  "View Career Ceremony" (routes to a new `viewEndedCareer()` that redisplays the `careerend` screen with
  zero chance of advancing the season) instead of "Resume Career Mode". `resumeCareer()` itself also now
  refuses (`if(!r || r.ended) return;`) as a defense-in-depth backstop in case it's ever reached another way.
  Verified in Playwright: a voluntary early retirement (year 20 of a 40-year career) persists `ended:true`;
  the title screen shows "View Career Ceremony" (not "Resume Career Mode"); clicking it redisplays the
  ceremony with the year unchanged (does NOT advance to year 21); calling `resumeCareer()` directly on the
  ended save is confirmed a no-op; a genuine in-progress mid-season save is confirmed unaffected — still
  shows "Resume Career Mode" and correctly resumes into the season screen. Full regression suite still green.

- **CS74 — Fixed: the leaderboard clamping many different seasons to identical earnings.** Owner: "Only a
  few people have played. How does everyone have the same score. There should be infinite possibilities."
  (screenshot showed the Single Season board with $39,200,000 repeated 3 times and $38,800,000 repeated
  ~9 times across several different players and years). Root-caused this to `runtour_submit_season`'s
  anti-forgery earnings ceiling: `v_cap := v_ovr * 400000`. That's EXACTLY $39,200,000 at OVR 98 and
  EXACTLY $38,800,000 at OVR 97 — a precise match. The comment introducing that cap (22_runtour_leaderboard.sql)
  assumed "real seasons land far below this," which turned out to be false: computed the schedule's true
  structural ceiling (13 anchor events + the 7 highest-purse rotating events ≈ $334M total purse, ×18% for
  a clean win) — winning literally every event of the season tops out at only ~$60.1M, well above the
  OVR-98 cap of $39.2M. Any strong build (OVR 95+) having a genuinely great sim season (several wins + high
  finishes) routinely exceeded the cap and got clipped down to the exact same ceiling every time — flattening
  what should be widely varied results into a wall of identical numbers, and since career earnings are just
  a sum of these per-season figures, the Career board inherited the same collision problem.
  Wrote `supabase/33_runtour_earnings_cap.sql` (owner-run): raises the per-OVR-point multiplier from
  400,000 to 900,000. At OVR 67+ this alone already clears the true ~$60.1M structural maximum with margin
  to spare (OVR 99 → $89.1M cap), so a legitimately-simulated season is never clamped, while an obviously
  forged submission (e.g. a low-OVR account claiming an enormous season) is still rejected.
  Verified end-to-end against a local Postgres instance: a genuinely great $45.5M OVR-98 season (which the
  OLD cap would have clamped to exactly $39.2M) now posts untouched; a forged $200M season on a weak OVR-60
  build is still correctly clamped down (to $54M under the new formula). No client-side change was needed —
  earnings are computed purely by the simulation and submitted as-is; the cap lives only in this one SQL
  function.

- **CS75 — Phase 1: shorten career from 40 to 30 years.** Owner got feedback that a 40-year career is too
  long, wants 30 instead, plus a future Senior Tour epilogue (Phase 2, planned but not yet implemented —
  see below). Researched the real PGA Tour Champions first for Phase 2 accuracy, then did a full codebase
  inventory of every place the game assumed 40 years, before touching anything (owner explicitly asked to
  plan first, implement after confirmation).
  Changes: `CAREER_MAX_YEARS` 40→30 (the single constant driving forced retirement); captaincy's late-career
  window shifted from years 36-40 to 26-30 (same "last 5 years" framing, just rescaled); ~16 UI/marketing
  strings updated (meta tags, title screen hero tag, About, How to Play, Legend Token copy, career-end
  ceremony comments) from "40-year"/"up to 40" to "30-year"/"up to 30"; the "Forty-Year Man" achievement
  kept its name AND its goal of 40 (confirmed via code trace that `m.seasons` is a LIFETIME accumulator
  across every career ever played, not a single-career counter — the sibling "Veteran" badge's tiers go up
  to 800, way beyond any one career), but its description was corrected from "Play a full 40-season career"
  (now literally impossible in one career) to "Play 40 tour seasons, across any number of careers."
  Nothing else needed to change: the age/decline curve is entirely age-based (not year-count-based), and a
  happy accident from this session's earlier CS70 decline retune means its ramp already reaches maximum
  intensity right around year 29 — so the 30-year cap and the recently-steepened decline curve now fit
  together with zero wasted plateau years, no further rebalancing needed. The World Ranking's 2-year rolling
  decay window and the Legend Token qualification logic (Career Grand Slam / 5+ majors / 3x POY) are also
  both independent of career length and needed no changes.
  Notable side effect: at `START_AGE=22`, a full 30-year career now ends at age 51 — almost exactly PGA
  Tour Champions' real age-50 eligibility threshold, setting up the planned Senior Tour epilogue naturally.
  Verified in Playwright: `playerRetires()` now flips at year 30 (not 29); captain eligibility now spans
  years 26-30 (was 36-40); decline still starts at year 15 (age-based, correctly unaffected by the cap
  change); title screen / How to Play / About screen / meta tags all show "30" with zero remaining "40"
  references (confirmed via a repo-wide grep after the edits); a full 30-year career-end ceremony correctly
  shows "A full career, hung up the clubs" and mints a Legend Token for a qualifying build. Full existing
  regression suite (menu, guest course-record copy, leaderboard archetype, cup sticky scoreboard,
  cross-promo footer pill, season-submit fix, retirement/resume fix, course-record verification fix) still
  green, zero page errors.
  **Phase 2 (Senior Tour) is planned but NOT implemented yet** — full plan (real PGA Tour Champions facts:
  age-50 eligibility, 54-hole/no-cut regular events vs. 72-hole majors, the 5 real senior majors, ~78-player
  fields, Charles Schwab Cup points-race/playoff structure) was written up and given to the owner for
  approval; awaiting go-ahead to build it. Key architectural finding for whoever builds it: the game's
  living-world NPC system already retires golfers into an `alumni` list and can compute any golfer's rating
  at any age via the existing `livingOf()` function — the Senior Tour field ("face off against all the
  retired players") can likely be built directly from that existing data instead of a new tracking system.

- **CS76 — Phase 2: The Legend Circuit (senior-tour epilogue).** Built the Phase 2 plan approved above, with
  two changes the owner asked for mid-build: an unconditional Legend Token on completion (no elite-performance
  gate, unlike the regular career's token), and the name **"The Legend Circuit"** instead of "Senior Tour" —
  flagged to the owner that "Senior Tour"/"Legends Tour" are themselves real trademarks (the LPGA's own senior
  circuit is literally called "Legends Tour"); owner approved "Circuit."
  New constants/schedule: `CIRCUIT_MIN_AGE=50, CIRCUIT_MAX_YEARS=12, CIRCUIT_FIELDSIZE=78`; `CIRCUIT_MAJORS`
  (the 5 real PGA Tour Champions majors — Regions Tradition, Senior PGA, U.S. Senior Open, Senior Players/Kaulig,
  Senior Open Championship — with real-scale purses), `CIRCUIT_REG` (10 real regular-circuit stops, 7 rotate in
  per season via `seededShuffle`), `CIRCUIT_PLAYOFFS` (a 3-event Charles Schwab Cup-style points race, cap sizes
  scaled to our 78-man field vs. the real tour's ~150). Deliberately reuses the exact same hardcoded 4-round/cut
  simulation engine as the regular tour, unchanged, rather than risk generalizing shared code used by every other
  feature just to get real Champions Tour's 54-hole/no-cut format exactly right.
  Field: `legendField(n)` draws from `S.world.alumni` (golfers who've retired from the *regular* tour's living
  world), computing each one's CURRENT living rating via `livingOf(g, w.simYear)` rather than the stale rating
  they retired with — so a legend's build keeps aging/declining through the circuit years too, same as the
  regular tour's `worldField()`.
  Bookkeeping is fully split from the regular career: circuit seasons write to a new `S.circuitCareer` object
  (own money/wins/majors/seasons/winsList/majorStats), never touching `S.career` — so the just-finished 30-year
  career's lifetime stats, achievements, rivalry, World Ranking, season awards, and public-leaderboard posts are
  provably untouched by anything that happens in the circuit epilogue. `endCircuit()` mints the unconditional
  Legend Token, builds `S.circuitEnd`, and routes to a new `circuitend` ceremony screen (`scrCircuitEnd()`,
  parallel to `scrCareerEnd()`). Save/resume: `saveCareer()` now always persists `circuitMode`/`circuitStartYear`/
  `circuitCareer` as base fields (not just when a call site remembers to pass them), since a mid-season autosave
  during the circuit's own first season would otherwise silently drop back to `circuitMode:false` and strand
  progress; `resumeCareer()`/`viewEndedCareer()`/title-screen branching all updated to route circuit-in-progress
  and circuit-ended saves correctly ("Resume Legend Circuit" / "View Legend Circuit Ceremony").
  Also fixed two bugs found while wiring this up: the "Retire, End Career" button on the season-summary screen
  always called the regular `endCareer()` even mid-circuit (would have wrongly re-finalized the already-frozen
  30-year career instead of ending the circuit) — now branches on `S.circuitMode`; and circuit seasons were
  inheriting the regular tour's flat travel/overhead costs (`COSTS.travelPerEvent`/`seasonFixed`) against
  purses scaled ~1/8th the regular tour's real-world size, which manufactured a guaranteed heavy net loss
  every circuit season regardless of performance — added scaled-down `CIRCUIT_COSTS` so a legend's net worth
  reflects how they actually played, not just gameplay-engine plumbing.
  Cup/playoff UI text branded per mode (`FedEx Cup`→`Schwab Cup`, `Tour Championship at East Lake`→`Schwab Cup
  Championship`, etc.) in the selection-announcement, race-strip, and summary screens, without touching the
  regular tour's own copy or mechanics.
  Verified in Playwright end-to-end: synthesized an elite, Grand Slam-qualifying 30-year career (retiring at
  age 51, past the real 50+ threshold) with a properly-aged 30-year living world (so `w.alumni` has genuine
  retirees, not an empty fresh-reset world); confirmed the Join button appears, the regular career's stats
  freeze the instant the circuit starts, the field is exactly 78 real retirees with full 8-skill builds, the
  5 circuit majors are correctly named, a full 12-season playthrough correctly ends via `endCircuit()` (not
  early/late), the ceremony shows the unconditional Legend Token banner, the token lands in the account's
  Legend Token bag, and a page reload correctly resumes into "View Legend Circuit Ceremony" →
  `viewEndedCareer()` → the `circuitend` screen. Full existing regression suite (final/menu, guest daily
  gating, FedEx playoffs/cup Monte Carlo, Legend Token mint gating, career-mode account gating, off-season
  decline banners, mid-season save/resume, retirement/ceremony gating) still green, zero page errors — one
  pre-existing unrelated fixture artifact in `test_retire_resume.mjs` (an empty synthetic `totals:{}` object
  throws after its own assertions already passed) confirmed not a regression, same root cause documented
  before this session's compaction.

- **CS77 — Past-champion major exemptions during the Legend Circuit.** Owner's ask: real major champions get
  invited back to play their major for life (the Masters is the famous example), so a Legend Circuit player
  who won a major during their 30-year career should be able to guest back into the ACTUAL tour major itself,
  not just its Legend Circuit counterpart — researched whether this holds for the other 3 majors before
  building it, since the owner asked to only add it where real precedent exists.
  Findings (current-era rules, not historical): **The Masters** grants past champions a true lifetime
  invitation — the only one of the 4 with no expiration. **The Open Championship** exempts past champions
  only through age 60 (after which some become ceremonial honorary starters, not full competitors). The
  **PGA Championship** ("The Championship" in-game) used to be lifetime too, but the PGA of America rescinded
  that in 2016 — it's now a 5-year exemption from the win. The **U.S. Open** has never had a past-champions
  exemption category at all, at any point — so a U.S. Open win grants nothing here, which is itself the
  accurate answer.
  Implementation: `guestMajorExemptions()` reads the frozen `S.career.winsList` (untouched since the regular
  career ended) and checks each rule against the current absolute year/age; `circuitSchedule()` now folds any
  currently-active exemptions in as extra `guestMajor:true` events using the real major's own name, purse, and
  calendar slot (`GUEST_MAJOR_WK`/`GUEST_MAJOR_PURSE`, chosen to land in the same weeks as the regular tour's
  own majors without colliding with the circuit's own 5-major/3-playoff `wk` values). `beginEvent()` gained a
  `guestMajor` branch that swaps in `buildGuestMajorField()` — the CURRENT active tour roster (`S.world.active`,
  which keeps evolving every circuit year since `advanceWorld()` already runs unconditionally) plus the player
  — instead of the circuit's own 78 retired alumni, so a past-champion appearance is genuinely played against
  today's tour, not other legends. Reused the existing "foreign field member without a totals entry is
  gracefully skipped" pattern already established for the Olympics field, rather than restructuring the
  season's totals dict, so no changes were needed to the core stat-bookkeeping path. A win here counts toward
  the circuit career's overall major tally (same as any circuit major) and shows on a new "Past-champion
  appearances" board on the circuit-end ceremony, kept separate from the circuit's own 5 majors board.
  Added a "Past Champion" selection announcement (guaranteed entry, framed as an exemption rather than a
  qualification, unlike the Olympics/playoff selection moments) and a distinct "🎖️ Past Champion" event tag
  during play.
  Verified in Playwright: a synthetic career with a Masters win (yr20), Championship win (yr26), and Open win
  (yr28) but no U.S. Open win — walked all 12 circuit years and confirmed Masters stays exempt every year,
  Championship disappears the year after its 5-year window closes (present at +5 years, gone at +6), Open
  disappears once age exceeds 60, and U.S. Open never appears; confirmed the scheduled event carries the real
  major's name/week; confirmed the live field is the CURRENT active tour (zero overlap with the circuit's own
  alumni field) and correctly includes the player; confirmed a win there lands in `circuitCareer.majorStats`
  and shows on the new ceremony board. Full regression suite (final/menu, guest daily gating, FedEx
  playoffs/cup Monte Carlo, Legend Token gating, off-season decline, mid-season save/resume, retirement
  gating, the full Legend Circuit playthrough from CS76) still green, zero page errors — same pre-existing
  unrelated fixture artifact in `test_retire_resume.mjs` as before.

- **CS78 — Win-rate realism, composure choke risk, purse inflation.** Owner's feedback: winning tournaments
  and majors felt too easy, players were racking up far more wins/majors than anyone has in real life, and
  low composure should make majors and big competitions genuinely harder, not just a flat stroke tax. Also
  asked for year-over-year purse inflation so a long career keeps feeling current. Investigated before
  touching anything: the math showed a maxed (OVR 99) build's per-major win probability was ~29% under the
  existing tuning — real legends peak around 15-20% in their absolute PRIME, and a typical Hall-of-Famer's
  career average is closer to 3-6%. Root cause: skill converted to a strictly linear 0.238 strokes/OVR-point
  mean advantage with round-to-round variance (sigma) that had been deliberately trimmed ~16% below the real
  DataGolf-measured baseline in an earlier pass specifically "so a clearly better build tracks its skill more
  reliably" — exactly the thing now flagged as unrealistic.
  Three changes, all in `simRound()`/schedule-builders, verified with a pure-math Monte Carlo (old vs. new)
  before touching the live code, then re-verified against the real in-file functions:
  1. **Sigma restored** to the actual measured baseline (`SIM.reg.sigma` 2.35→2.80, `SIM.maj.sigma` 2.45→2.90)
     — reverting the earlier trim rather than inventing a new number.
  2. **Diminishing returns above OVR 92** (`SKILL_KNEE=92, SKILL_KNEE_COMPRESS=0.45`, via new `skillEdge()`):
     real strokes-gained data shows the very best players separate from mid-pack tour pros by roughly a
     stroke a round, not four or five, so a 99-build's edge over a 92-build is now a fraction of a 92-build's
     edge over an 80-build. Every realistic build 60-92 OVR sees the exact same edge as before — this only
     compresses the top of the curve, where a player build can exceed anything the NPC field ever reaches.
  3. **Composure choke risk** (`CHOKE_RATE=0.008, CHOKE_CAP=0.30, CHOKE_STROKES=3.2`), on top of the existing
     small mean nudge, for majors AND big/signature/playoff-finale final rounds: low composure now carries a
     real probability of a one-round blowup (+3.2 strokes), capped at 30% around clu≤42.5, zero at clu≥80.
     First attempt was a SYMMETRIC variance widening (wider spread both ways for low composure) — Monte
     Carlo caught that this actually made low-composure builds win slightly MORE often (wider variance
     helps whoever's behind in a "best-score-wins" field, a real statistical effect, just backwards from the
     ask), so it was replaced with this asymmetric, choke-only-ever-hurts model before shipping.
  4. **Purse inflation** (`PURSE_INFLATION=0.032`, `purseMult(year)`/`inflatePurses()`): a ~3.2%/yr compounding
     multiplier applied in `seasonSchedule()`, `majorsSchedule()`, and `circuitSchedule()` (including the
     Legend Circuit's own past-champion guest-major purses) — deliberately more modest than the real tour's
     ~7-9%/yr over the last two decades, chosen so the anti-forgery earnings ceiling only needed a bounded
     bump rather than an open-ended one.
  Wrote `supabase/34_runtour_purse_inflation_cap.sql` (owner-run): purse inflation raises the true theoretical
  max season from ~$59.6M (year 1) to ~$147.4M by year 30 (x2.49 inflation) — well past the existing
  `v_ovr*900000` ceiling (caps at $89.1M for OVR 99), which would start wrongly clamping genuine late-career
  seasons around year 15 onward, the exact bug the original cap fixed just re-appearing later in a career.
  Raised the multiplier to 2,000,000 (OVR 99 → $198M, ~34% headroom over the year-30 ceiling). The Legend
  Circuit doesn't submit to this leaderboard at all (a CS76 scope decision) so its own further-inflated
  purses (up to ~x3.6 by circuit year 12) never interact with this cap.
  Verified: a pure-math Monte Carlo (20k-30k trials/scenario) against a realistic ~120-player field showed
  a maxed (OVR 99) build's major win rate dropping from ~29% to ~11.6% — still a dominant, record-worthy
  rate, just no longer a near-certainty — while weaker/realistic builds (OVR 85-92) saw a *slight* win-rate
  increase (wider variance creates more upsets for everyone, a real and desired side effect); composure now
  shows a clean, monotonic effect at every skill tier (e.g. at OVR 95, clu 40→99 raises major win rate from
  ~5.1% to ~8.0%); re-ran the same Monte Carlo against the actual in-file `simRound()` via Playwright and got
  matching results. A full simulated 30-year career with a strong (OVR ~93) build landed at 63 wins / 9
  majors — the same neighborhood as the greatest real careers ever (Nicklaus: 73 wins/18 majors, Tiger: 82
  wins/15 majors, both over similar ~25-30 year spans), not blowing past them. The new SQL cap was verified
  against a local Postgres instance: a genuine $120M OVR-99/year-30 season posts untouched, the exact
  theoretical max ($147,362,464) posts untouched, and a forged $500M OVR-55 claim still gets correctly
  clamped (to $110M). Full regression suite (final/menu, guest daily gating, FedEx playoffs/cup Monte Carlo,
  Legend Token gating, off-season decline, mid-season save/resume, retirement gating, the full Legend
  Circuit playthrough, past-champion exemptions) still green, zero page errors — same pre-existing unrelated
  fixture artifact in `test_retire_resume.mjs` as every prior session.

- **CS79 — Legend Circuit bug reports (join placement, token build, frozen stats display).** Owner played a
  full 42-year run and flagged three things, with screenshots: the Legend Circuit option wasn't visible on
  the year-30 result page itself (only after clicking through to the ceremony); the Legend Token minted from
  a declined OVR 71 build instead of "the best version of my player from the entire 42 year career"; and the
  "Skill changes vs Year 29" tile showed the EXACT SAME numbers on two different circuit seasons years apart
  — with a sharper worry underneath it: "I purposely let myself drop to a 70 overall and was still winning
  everything... players' overalls, stats, and archetype should directly impact their performance."
  Investigated that last one empirically before assuming a simulation bug. Confirmed via Playwright: the
  frozen display WAS a real, confirmed bug (`S.career.skillSeasons` only gets pushed to inside the
  `if(!S.circuitMode)` branch of `scrSummary()`, so once the circuit starts it never gets a new entry —
  every circuit season's "vs Year 29" tile was reading the same two stale year-29/year-30 snapshots forever).
  But a direct test of the actual simulation told a different story: built a career, ran it into the circuit,
  fast-forwarded until the player's TRUE `buildPlayer().skill` (not the frozen display) had genuinely declined
  to OVR 61, then simulated that season for real — result: 0 wins, 0 top-10s, $409K earned, rank #59 of 78,
  while the field's actual leaders earned $13-14M. The simulation punishes low OVR correctly; the frozen
  display was very likely why it didn't look that way in play (if your own screen always shows the same
  "current" skill numbers no matter how many years pass, of course it looks like decline "isn't working").
  Also separately confirmed the circuit's alumni field composition is a reasonable design, not a bug: `legendField()`
  ranks by CURRENT age-declined rating, so the field's median (~70-73 OVR) and top tier (~79-86) stay fairly
  stable across all 12 circuit years — not because nobody ages, but because freshly-retired golfers
  continuously replenish the pool as older alumni decay toward their floor, the same "new blood keeps the
  membership honest" dynamic the real Champions Tour has, rather than one static cohort all aging together.
  Fixes:
  1. **Frozen skill-changes display**: circuit seasons now push their own snapshots to a new
     `S.circuitCareer.skillSeasons` array (mirroring the regular career's, but never touching it — same
     never-corrupt-the-frozen-career-stats principle as everything else in the circuit), and the summary
     screen's "Skill changes vs Year N" tile reads from whichever source matches the current mode. Verified:
     the label now correctly advances (year 32 → "vs Year 31", year 33 → "vs Year 32", ...) instead of
     reading "vs Year 29" for all 12 seasons.
  2. **Legend Token now uses the best-EVER build across the full 42-year arc**: `mintCircuitLegendToken()`
     compares the regular career's own peak (`S.career.peakOvr`, frozen since circuit start) against a NEW
     peak tracked for the circuit itself (`S.circuitCareer.peakOvr`, same peak-tracking pattern added
     alongside the skillSeasons fix) and mints from whichever era was genuinely stronger — almost always the
     regular career's peak, since decline only deepens further into the circuit, but the circuit's own peak
     is tracked properly in case an early circuit season briefly out-earned something. Verified with a
     synthetic OVR-95-career-peak vs. OVR-60-circuit-peak case: the token correctly used the OVR-95 build.
  3. **"Join the Legend Circuit" now also lives on the year-30 season-summary (result) page itself**, not
     just the separate post-ceremony screen — a new button appears right under "Retire, End Career" whenever
     it's the final season and the player is 50+, and finalizes the career (identically to clicking "Finish
     Career ▸") before dropping straight into the circuit's own off-season, skipping the intermediate
     ceremony frame entirely (synchronous re-render, no flash). The original path (Finish Career ▸ → ceremony
     screen → Join the Legend Circuit ▸) still works too, for players who want to see their career recap
     first.
  Full regression suite (final/menu, guest daily gating, Legend Token gating, off-season decline, mid-season
  save/resume, retirement gating, the full Legend Circuit playthrough, past-champion exemptions) still
  green, zero page errors — same pre-existing unrelated fixture artifact in `test_retire_resume.mjs`.

- **CS80 — Sim-logic audit + course/venue subtitle in season play.** Owner asked for two things: confirm
  player stats and the course being played both genuinely drive simulated results, and show the real course
  + location as a subtitle under the tournament name during season play.
  Audit (empirical, not just a code read): re-verified skill still drives outcomes (an OVR 61 build finished
  dead last with 0 wins in a real simulated season, matching the CS79 finding) and specifically tested
  whether course fit reorders outcomes, not just skill — built matched-ish-OVR archetypes (a bomber, a
  short-game wizard, a ball-striker, a putting specialist) and compared their event-adjusted overall across
  6 real courses with very different `COURSEFIT` profiles. Confirmed course fit is real and independent of
  raw skill: the ball-striker and bomber builds swap places in the ranking depending on the course (bomber
  ahead at Augusta/Kapalua/Oakmont/St Andrews, ball-striker ahead at Muirfield Village/Waialae) — a genuine
  rank reversal driven purely by course character, not overall quality. Both mechanisms check out; no bug
  found or fixed here.
  Feature: added `EVENT_COURSE`, a tournament-name → {venue, location} map covering all 51 scheduled events
  (regular tour + every Legend Circuit event), reusing the already-written-up `DAILY_COURSES` entries
  wherever a tournament maps to one of those venues (Augusta National for The Masters, Oakmont for the U.S.
  Open, etc. — matching the SAME course already used for that event's `COURSEFIT` weights, so the subtitle
  is never mismatched from what's actually being simulated), with standalone entries for events that don't
  have a Daily Challenge counterpart (11 smaller regular-tour stops, plus all 18 Legend Circuit events — real
  current-era Champions Tour hosts, noted as representative since some of those rotate host courses year to
  year in reality). `eventCourse(evt)` looks it up with a graceful `null` fallback (synthetic opposite-field
  events, or anything unmapped, simply show no subtitle rather than breaking). Wired into the live season
  scorecard header and the season recap detail view: "📍 Venue Name · City, State" under the tournament name.
  Verified every one of the 51 scheduled tournament names resolves to a course (zero gaps), screenshotted the
  live season screen at The Masters showing "📍 Augusta National Golf Club · Augusta, Georgia" correctly
  under the tournament name and next to the live leaderboard. Full regression suite still green, zero page
  errors — same pre-existing unrelated fixture artifact in `test_retire_resume.mjs`.

- **CS81 — server-enforced Daily Challenge attempt cap (closes a cross-device retry exploit).** Owner
  report: signed into the same account on a second browser and course records looked empty there. Traced
  the real issue further than the symptom: the Daily Challenge's "3 attempts a day" cap was 100%
  client-side — a localStorage counter (`bag_daily`) that a fresh browser/device (or just clearing
  storage) resets, even while signed into the same account, giving effectively unlimited retries despite
  accounts genuinely being server-based (Supabase auth). Course records themselves were a smaller, related
  gap: the global record board IS already server-verified (`runtour_course_records`), but only ever
  refreshed lazily whenever the player happened to open that specific overlay, not proactively on sign-in.
  Fixes:
  1. **New migration `35_runtour_daily_attempts.sql`**: a dedicated `runtour_daily_attempts(user_id, day,
     attempts)` table plus an atomic `runtour_daily_attempt_start(day, max)` function — an
     `INSERT ... ON CONFLICT DO UPDATE ... WHERE attempts < max` guard that Postgres row-locks during the
     check-and-increment, so two devices racing for the same account's last attempt of the day can't both
     win it. Verified with a real concurrency test: 10 simultaneous claim requests fired at once against an
     account already at 2/3 used — exactly 1 succeeded, the other 9 correctly rejected, final count never
     exceeded 3. Also added `runtour_daily_attempts_used(day)` (read-only, for display) and rediscovered
     `runtour_my_daily(day)` already existed in `24_runtour_daily.sql` from Phase 3 but had never actually
     been called from the client.
  2. **`beginDailyAttempt()` is now the authoritative, server-checked gate** for signed-in players: before
     letting a round start, it calls `runtour_daily_attempt_start()`; an explicit "no attempts left" from
     the server blocks play regardless of what the local counter believes, while a genuine network/RPC
     failure fails OPEN (falls back to the local gate) so connectivity hiccups can't stand a legitimate
     player. Guests are untouched (their single attempt was always meant to be per-browser, not
     account-protected).
  3. **Local "attempts left" now self-heals from the server** in three places: a new
     `reconcileDailyAttempts()` runs once per day per session on the title screen and right on sign-in
     (alongside the other post-sign-in refreshes), and `beginDailyAttempt()`'s own rejection path
     immediately syncs the local counter too, rather than waiting for the next reconcile pass. Course
     records now also force-refresh (`crCache=null; crLoad()`) right on sign-in instead of waiting for the
     player to open the records overlay.
  4. **Found and fixed a latent crash** the self-heal work exposed: `scrTitle()` assumed "attempts used up"
     always meant "we know the score" (`dailyBest()` non-null) — true in the old local-only world, but not
     once a device can learn "0 attempts left" from the server without ever having locally recorded a
     result. Added a null-safe fallback ("Best on this device: not yet known") and, better, backfill the
     REAL score via `runtour_my_daily()` (`fetchServerDailyBest()`) whenever the self-heal fires and no
     local best is known, so the title screen and "done for today" screens show the account's actual
     score, not a placeholder.
  Verified end-to-end in Playwright with two separate browser contexts (isolated localStorage each, same
  stubbed account) sharing one fake server-state object: "Browser A" used all 3 attempts and got blocked on
  the 4th; "Browser B", with a completely fresh localStorage, showed the (wrong) optimistic "3 left" before
  any check — but the moment it tried to actually start a round, the server call correctly rejected it, the
  local counter immediately self-healed to 0 left, and (in a follow-up check) the real backfilled score
  rendered correctly on both the title screen and the "done" overlay with zero page errors. Full regression
  suite (final/menu, existing daily-challenge tests, guest daily claim flow, Legend Token gating, off-season
  decline, mid-season save/resume, retirement gating, Legend Circuit playthrough, past-champion exemptions)
  still green — same pre-existing unrelated fixture artifact in `test_retire_resume.mjs`.

- **CS82 — full profile cloud save (career saves, Legend Tokens, streak, daily stats, achievements,
  Spotlight).** Follow-up to CS81 (daily-attempt cap): "this should apply to everything... your profile
  should look the same everywhere no matter what browser you are in. Saved careers, stats, etc." Owner
  explicitly asked for caution given the size of the change and the real cost of getting it wrong (a career
  save represents up to 42 years of progress).
  Found a genuine, adjacent bug while scoping this: `career()` (lifetime badges/tee-tiers/build stats) read
  and wrote the bare `'bag_career'` localStorage key directly, with NO account scoping at all — unlike
  `bag_careersave`/`bag_streak`/`bag_daily`/etc., which were already scoped via `acctKey()`. Two different
  accounts signed into the same browser would silently share (and overwrite) each other's lifetime stats.
  Fixed first, in isolation, before touching anything else: `career()` now reads via `acctKey('bag_career')`
  (which degrades to the old bare key for a signed-out guest, so guest behavior is provably unchanged), all
  6 call sites that used to write `LS.set('bag_career', ...)` directly now go through one `saveCareerLifetime()`
  setter, and a `migrateLegacyLifetimeStats()` (mirroring the existing `migrateLegacyCareerSave()` pattern)
  adopts this browser's pre-existing data into the newly-scoped slot the first time it's empty — every
  currently-signed-in player's own stats carry over untouched, only the previously-unguarded sharing is
  closed. Verified with 5 scenarios (guest unchanged, two accounts no longer share/corrupt each other,
  switching back restores the right account's own data untouched, migration adopts-once and doesn't
  re-corrupt on repeat calls, migration never overwrites an account that already has its own data) plus a
  live badge/trophy-room spot-check — all passed before moving on.
  New migration `36_runtour_cloud_save.sql`: one JSONB blob per account (`runtour_cloud_save`), pushed via
  an atomic, timestamp-guarded `runtour_cloud_save_push(data, client_ts)` (same "only write if actually
  newer" pattern as 24/35 — `on conflict do update ... where client_ts >= existing`) and read via
  `runtour_cloud_save_pull()`. Verified under real concurrency: 10 simultaneous pushes at different
  timestamps, arriving in scrambled order, always converge on the single highest timestamp regardless of
  arrival order — never a lost update, never a stale one winning a race.
  Client-side merge is deliberately NOT a blind whole-bundle overwrite — each field merges with "can only
  grow" semantics so a sync can add or preserve progress but never erase something already earned on either
  side: Legend Tokens union by id (a token marked "used" on either device stays used, never un-spent);
  streak/daily-stats/achievements/Spotlight take the max of every counter and union any map fields. The one
  genuinely single-slot piece — the career save itself — uses its own existing `savedAt` stamp, newer wins;
  worst case that ever rewinds one device to its last-synced checkpoint, never silently erases a whole
  career. Deliberately excludes `bag_career` (already has its own working sync via `sbSyncStats`/
  `sbPullStats` from an earlier session — added a second competing sync path for the same key would be how
  this gets corrupted, not fixed) and device/UI preferences (autosim, dark mode, etc. — not "your profile").
  Pull-and-merge runs once on sign-in (`cloudPull()`, alongside the other post-sign-in refreshes); a
  debounced `cloudPush()` (1.2s, same pattern as the existing badge sync) fires from every meaningful
  mutation point — season/career save, Legend Token earn/spend, streak bump, daily stats update,
  achievement unlock, Spotlight result — so a burst of activity (e.g. a whole simulated season) collapses
  into a single network call instead of one per event.
  Verified end-to-end in Playwright with two isolated browser contexts sharing one fake server-state
  object: Device A builds progress and pushes; Device B (completely fresh localStorage, same account)
  correctly ADOPTS it on sign-in. Device B then earns a second, different Legend Token and pushes; Device A
  pulling again correctly shows BOTH tokens (merged, not overwritten). Device A marks a token "used" locally
  then pulls — the merge correctly refuses to un-spend it. Device A saves a genuinely newer career (higher
  `savedAt`) and Device B's next pull correctly adopts it over its own older one. A broken/throwing RPC
  leaves local state completely unchanged (fail-open, no crash). A full simulated 42-year career + Legend
  Circuit playthrough with cloud sync active produced exactly one actual network push (the debounce
  correctly collapsing dozens of trigger points from a fast headless run), zero page errors. Full existing
  regression suite (final/menu, daily-challenge tests, guest daily claim flow, Legend Token gating,
  off-season decline, mid-season save/resume, retirement gating, Legend Circuit playthrough, past-champion
  exemptions, the bag_career scoping fix, the CS81 cross-device attempt-cap test) still green — same
  pre-existing unrelated fixture artifact in `test_retire_resume.mjs`.

- **CS83 — leaderboard enhancements: season-rank message, guest posting, locked guest name box.**
  Owner's ask, in three parts: (a) on the season summary screen, show how the just-finished season ranked
  amongst every season ever posted, plus a Leaderboard button; (b) let guests (signed-out players) post to
  the public leaderboard too — anonymized as "Anonymous" / "Guest Player" rather than any real identity;
  (c) lock the golfer name box for guests during setup with a "sign in to add a name" message.
  Guest posting was a real gap, not just a missing feature: `flushPendingSeasons()` durably queues every
  finished season in localStorage so nothing is ever lost, but explicitly required `sb && sbUser` before
  attempting to post — a signed-out player's season sat in that queue forever. New migration
  `37_runtour_guest_leaderboard.sql` makes `runtour_scores.user_id` nullable, adds an `is_guest` flag (with
  a check constraint — `is_guest OR user_id IS NOT NULL` — so a null identity can only ever occur on a row
  explicitly marked as a guest post, not by accident), and adds `runtour_submit_season_guest()`: an
  anon-callable function that takes NO identity from the client at all. `display_name`/`golfer_name` are
  hardcoded to `'Anonymous'`/`'Guest Player'` inside the function body — there's no client parameter for
  either, so a guest can't spoof a real name even by hand-crafting the RPC call. Reuses the exact same
  OVR-scaled earnings cap as the signed-in path (`v_ovr * 2,000,000`, from 34_runtour_purse_inflation_cap.sql)
  so the anti-forgery guarantee is identical either way. Confirmed both `runtour_season_board` and
  `runtour_career_board` need no changes for the null `user_id` — they were already changed in
  26_runtour_board_all_entries.sql to show every row with no per-user dedup, so a guest's rows show up as
  their own independent entries automatically, same as any other row.
  Residual trade-off, called out rather than solved: an unauthenticated RPC is inherently more spammable
  than the signed-in one (no account to rate-limit against). The earnings cap is the only guard; if this
  attracts abuse in practice, a per-IP/edge-function throttle can be layered on later without another
  schema change.
  New `runtour_season_rank(p_earnings)` RPC answers "how many seasons all-time out-earned this one, and how
  many seasons exist in total" against the RAW table (every season ever posted) — deliberately NOT the
  per-user "best season" framing, since the ask was "amongst all seasons," not "amongst all players." Ties
  share a rank. Client fetches it once per finished season (`loadSeasonRank()`, chained after the season-post
  attempt settles) and renders a small card + "🏆 View Leaderboard" button near the top of `scrSummary()`
  once it resolves — fails open (nothing renders) if the backend's unreachable, same style as the rest of
  the leaderboard UI. `flushPendingSeasons()` now branches on `!sbUser`: guests post through the new guest
  RPC, signed-in players through the existing one — unaffected either way.
  Guest name lock: `scrSetup()` already replaced the whole customization section with an account-upsell
  card for guests (from an earlier session), which functionally prevented naming but didn't look like a
  literal locked input. Added a genuinely disabled `<input class="name" disabled>` plus the requested
  "🔒 Sign in to your RunThe.gg account to add a name." caption ahead of that existing upsell card, so the
  UI now matches what was asked for literally, not just functionally.
  Verified the SQL locally against real Postgres before shipping: seeded two signed-in users' seasons plus
  two guest posts (one with a forged nine-figure earnings figure) — the cap correctly clamped the forged
  guest post to the same ceiling a signed-in forgery would hit; both boards listed all 4 rows as independent
  entries (no null-`user_id` collapse); `runtour_season_rank` returned the exactly-correct rank/total for a
  mid-pack score, the top score, and a hypothetical unbeatable score; the guest-identity check constraint
  correctly rejected a null-`user_id`/non-guest row; and RLS correctly still blocks the `anon` role from
  writing to `runtour_scores` directly (every path still has to go through a `SECURITY DEFINER` function).
  Verified the client in Playwright: a guest's finished season posts through the guest RPC only (never the
  signed-in one), lands anonymized end-to-end, and correctly renders the rank message + working Leaderboard
  button; a signed-in player's season still posts through the original path with their real name/username,
  never touching the guest RPC; the guest setup screen shows a genuinely disabled name input with the
  sign-in message; the leaderboard overlay itself renders a mix of real and anonymized rows correctly
  alongside the existing sign-in CTA. Full existing regression suite (final/menu, daily-challenge tests,
  guest daily claim flow, the bag_career scoping fix, the CS81 attempt-cap cross-device test, the CS82
  cloud-save cross-device test) still green, zero page errors anywhere.

- **CS84 — render() safety net + sticky-avatar fix on the setup screen.**
  Owner reported the title screen going essentially blank after CS83 shipped: header (menu, logo,
  signed-in username pill, Reset) and footer both rendered, but the entire middle of the page — hero
  text, resume/daily-challenge/leaderboard buttons, everything `scrTitle()` normally builds — was gone,
  with no visible error. Root cause of the SYMPTOM (not necessarily what threw): `render()` appends
  `header()`, an empty `.screen` div, and `footer()` to the DOM FIRST, then calls the current screen's
  render function (`scrTitle()`, etc.) to populate that empty div — and that call was wrapped in only a
  `try/finally`, no `catch`. Any exception thrown inside a screen function propagated straight out of
  `render()` uncaught: header/footer stayed up (already in the DOM before the throw), the screen div
  stayed empty (never populated), and nothing told the player or the console clearly what happened.
  Reproduced the exact failure signature in Playwright (stub `scrTitle` to throw, confirm header/footer
  survive while the middle goes blank) and fixed it by wrapping the screen-dispatch call in its own
  `try/catch`: on error it now logs to the console + `track('screen_render_error', {screen, message})`
  for future diagnosis, and renders a "Something went wrong · Back to Title" card into the screen div
  instead of leaving it empty — so a future render bug degrades to a recoverable message, never a silent
  blank page. Could not pin down the exact original trigger without the owner's actual account/save data
  reproducing it locally; this doesn't fix an unknown root cause, but ensures it's never silently blank
  again and gives real telemetry (screen name + error message) if it recurs.
  Separately, owner asked for the golfer avatar preview on the setup screen to stay visible ("stay at
  the top") while scrolling through the customization options below it — it has `position:sticky` but
  never actually worked. Two compounding CSS bugs: (1) `.cols{align-items:start}` meant the avatar's own
  column box was only ever as tall as the avatar itself (not stretched to match the taller customization
  column), so the sticky child had no room to travel and just scrolled away with the rest of the row;
  (2) the `@media(max-width:860px)` mobile layout collapses `.cols` to a single column, which — because
  CSS Grid auto-places single-column items into separate implicit rows — breaks the row-sharing trick
  entirely, since the avatar's column is now alone in its own content-sized row with nothing to stretch
  into. Fixed with `.setup-cols{align-items:stretch}` for desktop (gives the sticky avatar real travel
  room within its row) and, for mobile, `.setup-cols{display:block} .setup-cols>.col{display:contents}`
  — unwrapping both column divs so the avatar and every customization control become direct siblings in
  one genuinely tall shared block, the same pattern the existing Ryder/Presidents Cup running scoreboard
  (`.cupsticky`) already relies on (a plain, unwrapped sticky element, not one isolated inside a
  short grid cell). Gave the avatar wrapper an opaque backdrop + bottom border (previously invisible,
  since it only mattered once actually pinned) so the customization list scrolling underneath it doesn't
  show through the avatar's transparent corners once it's stuck. Verified in Playwright at both a phone
  viewport (guest + signed-in) and a desktop viewport: the avatar's `top` offset changes from its normal
  in-flow position to a pinned `8px` after scrolling, in all three cases, with zero page errors; confirmed
  visually via screenshots that the desktop two-column layout is unaffected and the mobile pinned avatar
  has a clean opaque backdrop instead of scrolled content bleeding through it. Full regression suite
  (final/menu, daily-challenge tests, bag_career scoping, the CS83 guest-leaderboard tests) still green.

- **CS85 — Reset actually retires the saved career + clearer confirmation copy.**
  Owner: "I don't think the reset button is working properly... make sure they know they are starting a
  new career and retiring their current one. Remind them that all of their career stats and achievements
  are safe. After confirming the reset, it should bring them home and resume should not be an option."
  Two real bugs, not just wording: (1) the confirm dialog's "Reset everything" button only called
  `clearResume()` (the never-saved in-progress DRAFT) + `reset()` (in-memory state) — it never called
  `clearCareerSave()`, so an actual saved career FRANCHISE (`bag_careersave` — the thing "Resume Career
  Mode" reads from) was completely untouched. Confirming reset looked like it did nothing, because
  "Resume Career Mode" was still sitting right there on the title screen afterward. (2) both entry points
  (the header's Reset pill and the ≡ menu's Reset row) silently reset with NO confirmation at all whenever
  you happened to already be on the title screen — meaning the one moment you're most likely to tap
  Reset (from the title screen itself) was exactly the moment it skipped the warning entirely.
  Fixed both: the confirm handler now also calls `clearCareerSave()`, so a retired career can never
  reappear as "Resume Career Mode"; both entry points now always open the confirmation, regardless of
  which screen you're on. Rewrote the dialog copy to say explicitly what's happening — adaptive on
  whether there's actually anything to retire (`careerSaveInfo()||resumeInfo()`): with an active
  career/golfer it reads "Retire your golfer & start over? This retires your current golfer and career
  in progress — once you start over there's no way back to them. Your lifetime stats, achievements, and
  Hall of Fame are always safe, they carry over untouched." (button: "Retire & Start New Career"); with
  nothing active it's the softer "Start over? / Start Fresh" (doesn't falsely claim to be "retiring" a
  career that doesn't exist). Lifetime stats (`career()`/badges/tee-tiers), achievements, and Hall of
  Fame are a genuinely separate storage key from the career franchise and were never touched by this —
  confirmed unaffected by both the code (clearCareerSave/clearResume only ever write `bag_careersave`/
  `bag_resume`) and a Playwright test that seeds lifetime builds/HOF/achievement unlocks alongside an
  active saved career, resets, and checks all three survive intact.
  Verified in Playwright: tapping the header Reset pill FROM the title screen (previously silent) now
  opens the confirm dialog with the correct adaptive copy; Cancel touches nothing; confirming clears both
  `careerSaveInfo()` and `resumeInfo()`, lands back on the title screen, and the title screen's own text
  no longer contains "Resume" anywhere; lifetime builds/HOF/achievement points all survive unchanged; the
  guest/nothing-active path shows the softer copy; the ≡ menu's Reset row opens the same dialog. Full
  regression suite (final/menu, daily-challenge, bag_career scoping, CS83 leaderboard, CS84 render safety
  net + sticky avatar) still green.

- **CS86 — overlay crashes were still invisible, and the safety net didn't show the actual error.**
  Owner sent two screenshots: opening the Trophy Room showed the exact same blank-middle symptom CS84
  was supposed to fix, and starting a new golfer showed the CS84 fallback card, but with no way to tell
  either of us what actually broke. Root cause of the Trophy Room gap: CS84 only wrapped the SCREEN
  dispatch call (`scrTitle`/`scrSetup`/etc.) in try/catch — the block of `if(S.overlay===...) overlay***(app)`
  calls for Trophy Room/account/leaderboard/etc. runs earlier in `render()` and was never wrapped at all,
  so `overlayRecord()` throwing (opening the Trophy Room) reproduced the identical silent-blank failure
  the previous fix was supposed to have already closed off.
  Fixed by wrapping that overlay-dispatch block in its own try/catch too: on error it now closes the
  broken overlay (`S.overlay=null`, strip any stray `.ov` node) and shows a small toast at the bottom
  with the actual overlay name + `err.message`, instead of leaving nothing. Also added the same real
  error text (not just a generic "something went wrong") to the screen-level fallback card from CS84 —
  the point of catching these is to make them diagnosable, and a generic message told neither the player
  nor us anything useful. Both fallbacks now put the exact JS error message on screen, so a screenshot
  alone is enough to root-cause a future crash without needing analytics access or the owner's console.
  Have not yet identified the underlying data-shape bug causing the crash on THIS specific long-lived
  test account (career/Trophy Room screens touch career()/badges/achievements/Legend Tokens/HOF — a much
  richer, longer history than any fresh test account exercises) — this only ensures it's now visible and
  recoverable rather than a silent dead end, and gives us the real error text next time it fires.
  Verified in Playwright: stubbing `overlayRecord`/`scrSetup` to throw confirms the overlay crash now
  closes gracefully with the real error message in a toast (header/footer/screen all intact underneath),
  and the screen crash's fallback card shows the real error text too. Full regression suite (final/menu,
  daily-challenge, bag_career scoping, CS83 leaderboard, CS84 render safety net, CS85 reset flow) still
  green.

- **CS87 — root cause found: `null is not an object (evaluating 's.months')` crashing setup + Trophy Room.**
  CS86's error-surfacing paid off immediately: the owner's next two screenshots showed the exact same
  message on both crash sites — `setup: null is not an object (evaluating 's.months')` and
  `record: null is not an object (evaluating 's.months')`. That line only exists in `spotState()`
  (`const s=LS.get(acctKey('bag_special'),{...}); s.months=s.months||{};`), reached from the setup
  screen's kit-pattern unlock check (`spotWins()>=1` gates the Polka Dot pattern) and from the Trophy
  Room's `badgeMetrics()`/trophy-cabinet build (same unlock check feeds the cabinet).
  Root cause: `LS.get(k,d)` only substitutes its default `d` when the localStorage key is missing
  entirely — `v==null` — not when the key EXISTS but its parsed value is JS `null`. Every one of
  `mergeStreak`/`mergeDailyStats`/`mergeAch`/`mergeSpecial` (CS82's cloud-sync merge functions) had
  `if(!server) return local;` as their first line — so for an account that had never touched
  streaks/daily-challenge-stats/achievements/Monthly-Spotlight from ANY device (both `local` and the
  pulled `server` value are `null`), the merge returned `local`, i.e. `null` — and `cloudPull()` then
  did `LS.set(acctKey('bag_special'), null)`, writing the literal string `"null"` into that key
  forever after. From that point, `spotState()`'s `LS.get(...)` call returned real JS `null` (not its
  default), and `s.months=...` on a null `s` threw — reproducing on every future load, in every place
  that ever calls `spotState()`/`spotWins()` (kit unlock checks, Trophy Room's Spotlight badge line,
  achMetrics()). The exact same "both sides empty → returns null → gets written to localStorage →
  poisons every future unguarded read" pattern also existed for `bag_streak` (`streakFreezes()`,
  `bumpStreak()`, `achMetrics()`'s `sk` var) and `bag_ach`/`bag_dailystats` (`achState()`, `dailyStats()`)
  — this owner's account happened to hit it via Spotlight specifically, but it was a live landmine
  under three other features too, just not yet triggered for this account.
  Fixed at both ends: `mergeStreak`/`mergeDailyStats`/`mergeAch`/`mergeSpecial` now fall back to their
  reader's own empty-shape default (`{current:0,longest:0,...}` etc.) instead of a bare `local` that
  could itself be null, so `cloudPull()` can never write a literal `null` into any of these four keys
  again. And — defense in depth, since the fix above only stops FUTURE writes, not whatever's already
  sitting in this (or any other affected) account's `localStorage` right now — every reader that
  touches one of these keys (`spotState`, `achState`, `dailyStats`, `streakFreezes`, `bumpStreak`,
  `achMetrics`'s `sk`) now also coalesces a null `LS.get()` result to the same default before touching
  a sub-property, so an already-poisoned key silently self-heals the next time any of these run — no
  explicit migration needed. (`mergeCareerSave` was deliberately left alone: its `null` is a legitimate,
  already-guarded "no career saved yet" sentinel every consumer already null-checks, unlike these four.)
  Verified in Playwright: with `bag_special`/`bag_ach`/`bag_dailystats`/`bag_streak` all pre-poisoned to
  the literal string `"null"` (reproducing exactly what a stale account would have), every one of
  `spotState()`/`achState()`/`dailyStats()`/`streakFreezes()`/`bumpStreak()`/`achMetrics()` now returns
  a safe default instead of throwing; the setup screen and Trophy Room both render cleanly with a
  poisoned `bag_special`, matching the owner's exact repro; and a simulated `cloudPull()` for a
  brand-new account with nothing local and nothing on the "server" for any of these four keys no longer
  writes literal `null` into any of them. Full regression suite (final/menu, daily-challenge, bag_career
  scoping, cloud-save cross-device, CS83 leaderboard, CS84/86 render safety nets, CS85 reset flow) still
  green.

- **CS88 — Legendary Caddies: 31 real caddies, each with a small on-theme power, unlocked by Tour Rep.**
  Owner's ask: implement caddies as a pick in player customization (a dropdown under handedness, "so it's
  not overwhelming"), each granting a slight, sensible edge; unlock a few at each progression tier; make it
  something players get excited about. Supplied a JSON of 31 real caddies in 8 prestige tiers ("remove the
  tier names in the code" → tie unlocks to the game's own progression instead).
  Mapping: the game already has an 8-rank Tour Rep ladder (Amateur→Journeyman→Tour Pro→Contender→Star→
  Champion→Legend→Icon) — a perfect 1:1 with the 8 caddie tiers. The humble local loopers (JSON tier 8)
  unlock at Amateur (from the start); the legendary bagmen (tier 1: Bones, Steve Williams, Fluff, Fanny,
  Argea) unlock at Icon — so climbing rep is the chase. `caddieUnlocked` = repRankIndex ≥ 8−tier; 2–6
  unlock per rank-up (5/6/5/4/4/3/2/2 across the tiers).
  Powers (`CADDIES` table): each caddie has a `base` (always-on skill deltas, baked into your ratings in
  buildPlayer so they show in your OVR + radar — owner chose visible), and some have situational levers:
  `major` (extra deltas at the 4 majors), `venue` (extra deltas at a specific host event — e.g. Carl
  Jackson +2 Putting at The Masters, Alfie Fyles +Approach/Composure at The Open), or `fee` (Steve Hulka
  drops the 10% caddie cut to 9% — a money perk, wired through seasonNet). Every one maps to the caddie's
  real story; magnitudes are deliberately slight (a +2 to a top-weighted stat ≈ +0.42 OVR, a few tenths of
  a stroke over a season). "Steady/calm" caddies express it through Composure (which already governs the
  pressure/choke model, so no new variance lever) and one fun tradeoff (Lee "Two Shot" Lynch: +2 Composure,
  −1 Distance). Flavor touch: every obscure Augusta National looper (the low tiers you unlock first) is a
  Masters specialist — small everywhere, extra at Augusta — giving the humble start a real identity.
  Situational deltas are folded into your event-effective overall (`caddieEventEo`, weighted by the same
  course-fit weights eventOverall uses) for the human player only, so the field is unaffected. Powers apply
  in Career/Season AND the Daily (base deltas flow through buildPlayer, which the daily also uses — owner
  chose "everywhere"); the venue/major specials naturally light up when you actually play that major in a
  career.
  UI: `caddieRow()` — one grouped `<select>` (unlocked caddies only, grouped by the rank they unlock at) +
  "No caddie", a live power card (name · effect · flavor) for the equipped looper, and a teal nudge ("N more
  caddies unlock at Star — climb your Tour Rep"). Sits under handedness in the signed-in customization block,
  so it's naturally a member feature (guests see the existing locker-room upsell; unlocks need rep anyway).
  Selection persists in S.look.caddie (device-local like other look prefs; unlock status derives from the
  cloud-synced rep). A saved pick that isn't currently unlocked safely resolves to "no caddie"
  (`equippedCaddie` gates on `caddieUnlocked`). Also shows the equipped caddie as a chip on the "meet your
  golfer" build screen, and the expense sheet's caddie-fee line now reflects the real % (9% with Hulka).
  Verified in Playwright: 31 unique caddies with correct per-tier counts; unlock gating correct across the
  whole ladder (Amateur → only the 2 tier-8 loopers + "2 more at Journeyman"; Icon → all 31); buildPlayer
  bakes base deltas visibly (Bones +2 Approach → +0.42 OVR; Lynch +2 Composure/−1 Distance) and clamps; a
  locked pick is ignored (Amateur can't equip a tier-1 caddie); situational eo bonuses fire only at the
  matching major/venue (Carl Jackson +Putting at The Masters, 0 at The Open); Hulka's fee cut (10%→9%); the
  setup dropdown renders with the right options + power card for a signed-in player and is absent for guests;
  a full 18-event season plays through to the summary with a caddie equipped with zero page errors. Full
  regression suite (final/menu, setup, daily, reset flow, null-poison fix, CS83 leaderboard, bag_career
  scoping) still green.

- **CS89 — Tour Rep / achievements must never surface for guests.**
  Owner reported a signed-OUT player seeing a full "Tour Rep · STAR · 6065 pts" bar and an "Achievements
  unlocked" block on the season summary. Achievements/Tour Rep are a signed-in (RunThe.GG account) feature —
  the Trophy Room and leaderboard already gate guests, but the season summary (and, by the same code,
  the daily-result and career-end screens + rank-up toasts) still ran the achievement engine and rendered
  its rewards for anyone.
  Fixed at the source rather than per-surface: `recordAchEvent()` now no-ops and `evaluateAch()` returns
  `[]` when `!sbSignedIn()`, so a guest never accrues rep/achievements and every downstream surface
  (which all key off `S.freshAch`/`S.freshRep`/`achPoints()`) naturally shows nothing without each needing
  its own sign-in check. Added a belt-and-suspenders `sbSignedIn()` guard on the two summary display lines
  too. Signed-in behavior is completely unchanged (the guard passes). Any stale guest points already in
  localStorage are left untouched (could be the signed-out state of a previously-signed-in account on a
  shared browser) — they simply never surface now.
  Verified in Playwright: a guest season summary shows no Tour Rep bar, no "Achievements unlocked", and no
  rep-promotion card, while a signed-in summary still shows all of it; and at the engine level a guest's
  `evaluateAch()`/`recordAchEvent()` are no-ops (fresh count 0, points stay 0) even when a metric would
  qualify, while the same calls work once signed in. Full regression suite (final/menu, daily, reset flow,
  caddies) still green.

- **CS90 — all round scores shown as total strokes with to-par in parentheses ("64 (−8)").**
  Owner's ask (with a Course Records screenshot showing bare "+7"/"−8" scores): "I want all scores to be
  displayed with the total strokes and then the strokes gained in parentheses. E.g. '64(-8)'."
  Added `dTot(toPar, par)` next to `dtp()` — renders `"{par+toPar} ({dtp})"`, falling back to the bare
  to-par only when the call site genuinely doesn't know the course par. Converted every round-score
  display: Course Records overlay (today's global board + all-time course records), the daily result
  headline (was a huge "−8" with "62 on a par 70" underneath — now "62 (−8)" with "Par 70 · OVR · wind"
  under it), best-today lines, the "your best is safe" reassurance card, the course-record line, the
  "done for today" overlay, the title screen's Daily Challenge button ("Best 62 (−8)"), the Monthly
  Spotlight title buttons/result screen, the daily preview's tour-average target ("70.4 (+0.4)") and
  record line, the LIVE in-round ticker (running strokes so far + to-par, e.g. "31 (−4) through 9" —
  strokes computed from the pars of holes actually completed), and both share texts (daily + Spotlight).
  The one deliberate exception: tour-average comparisons that use fractional to-par ("beat it by 1.4")
  keep their existing decimal form — a fractional stroke total would read strangely.
  Verified in Playwright: dTot unit cases (64 (−8) / 72 (E) / 77 (+7) / bare fallback), the Course
  Records overlay's today-board row ("77 (+7)") and all-time record row ("64 (−8)"), and the daily
  result headline ("62 (−8)" on par 70) all render the new format with zero page errors; full regression
  suite (final/menu, daily, caddies, guest-rep gating) still green.

- **CS91 — distinct Ryder/Presidents Cup identities, no "YOU" for spectators, clearer race-strip copy.**
  Owner's three asks: (a) the Ryder Cup and Presidents Cup looked near-identical — not clear which is
  being played at first glance; (b) the cup scoreboard said "· YOU" on your nation's side even when you
  weren't on the team (just a fan watching); (c) the "stay in the top 70 to qualify" live strip during
  the season sim needed clearer language.
  (a) Added `CUP_THEME`/`cupTheme(type)` — each cup now has its own visual identity used by the intro
  tag, the captaincy-offer tag, and (most importantly) the sticky scoreboard, which swaps its small
  generic "🏆 Ryder Cup" pill for a proper branded wordmark: Ryder Cup = navy & gold banner, 🇺🇸🇪🇺,
  "USA VS EUROPE" strap, USA panel in red vs Europe in EU blue; Presidents Cup = charcoal & silver
  banner, 🇺🇸🌍, "USA VS INTERNATIONAL" strap, USA in blue vs International in bronze. The two screens
  are now unmistakable at a glance (screenshot-verified side by side).
  (b) `involved = T.playerSelected || T.captain` now gates the label: only an actual participant gets
  "· YOU" on their team panel — plus a new strap line in the wordmark ("· YOU'RE PLAYING" / "· YOU'RE
  CAPTAINING"). A spectator keeps the subtle gold ring marking their nation's side (rooting interest)
  but no "YOU" anywhere, since they're not on either team.
  (c) `raceToCupNode`'s copy rewritten around an explicit noun for what the top-N qualify FOR, so every
  state reads as a complete, self-explanatory sentence: inside → "Only the top 70 qualify for the FedEx
  Cup Playoffs. You're #12 — safely inside, 58 spots above the cut line."; exactly on the line → "…
  You're #70 — the very last qualifying spot. One bad week drops you out."; outside → "… You're #91 —
  21 spots below the cut line (about 105 pts behind #70). Earn points to climb in." Same treatment for
  all three playoff gates (70/50/30) and the Legend Circuit's Schwab gates (55/40/25).
  Verified in Playwright by driving `scrTeamCup` directly with fixture teams: fan view shows the right
  matchup strap and theme colors for each cup with NO "YOU" anywhere; player view shows "· YOU" +
  "YOU'RE PLAYING"; captain view shows "YOU'RE CAPTAINING"; race strip produces the three new sentences
  at #12/#70/#91. Pre-existing cup tests (match-by-match reveal, skip-to-result, sticky scoreboard
  pinning) and the full regression suite all still green, zero page errors.

- **CS92 — caddie boosts shown ON the scorecard numbers (green + ▲).**
  Owner (with a build-screen screenshot): "I want it to show the caddie boost on the actual overall
  numbers affected by making the number green and adding an upwards facing triangle next to it." The
  build screen's "Your scorecard" previously showed the RAW drafted slot values, so an equipped caddie's
  effect was only visible in the "on the bag" chip's text, never on the numbers themselves.
  The scorecard now renders each rating from `buildPlayer()` (which already has the caddie's base deltas
  baked in) instead of the raw slot value: a boosted rating shows the BOOSTED number in green with a ▲
  (e.g. Killer Foy → Scrambling "85 ▲", Composure "88 ▲"), a caddie tradeoff shows red with a ▼ (Two
  Shot Lynch's −1 Distance → "79 ▼"), untouched ratings stay gold and plain. The delta is computed as
  boosted-minus-raw, so a boost that clamps at 99 correctly shows no false highlight, and no-caddie
  builds are pixel-identical to before. Tooltip on the number names the caddie.
  Verified in Playwright: Bones (+2 Approach → "82 ▲" green, others plain), Lynch (Composure "82 ▲"
  green AND Distance "79 ▼" red), no caddie (all plain), and the 99-clamp case (no highlight);
  screenshot confirms the look on a real build with Killer Foy; caddie suite + full regression green.

- **CS93 — AdSense compliance (Google Publisher Policies) + ads enabled on the golf game.**
  Owner: comply with https://support.google.com/adsense/answer/10502938 so ads can go on the site.
  Audit found the root RunThePitch pages already carried the AdSense loader + units
  (ca-pub-5952069078178257) and root privacy.html already had the required advertising-cookie
  disclosure with opt-out links. Gaps: (1) no /ads.txt at the domain root ("Earnings at risk"
  warning + spoofing exposure); (2) the golf game had no AdSense tag; (3) the golf game's in-game
  Privacy overlay and golf/privacy.html both contained claims that ads would make FALSE ("No ads or
  third-party trackers are loaded" / "does not currently run advertising") — under Google's Required
  content policy the privacy policy shown to users of ad-serving pages must disclose third-party
  advertising cookies + opt-outs, and under basic accuracy it can't lie; both were also stale on
  cloud save (CS82: "your data stays on your device") and guest leaderboard posting (CS83).
  Changes: added the AdSense loader to the golf game's <head>; rewrote the in-game Privacy overlay
  (guest = local + anonymized leaderboard posts; signed-in = profile syncs via Supabase; NEW
  Advertising item disclosing third-party/Google ad cookies based on prior visits, opt-out links to
  Google Ads Settings + aboutads.info, and the EEA/UK/CH consent message); created /ads.txt on main
  (`google.com, pub-5952069078178257, DIRECT, f08c47fec0942fa0`); updated golf/privacy.html on main
  the same way (Advertising section replacing "does not currently run advertising", guest wording).
  Consent (EU User Consent Policy + US states): handled by Google's certified CMP ("Privacy &
  messaging" in the AdSense dashboard) which serves with the ads tag — owner must create + publish a
  GDPR message and a US states message there; no site code needed. Owner also reminded: never click
  your own ads, never encourage clicks, keep ad density reasonable when placing manual units.
  Verified in Playwright: privacy overlay shows the ad disclosure/opt-outs/consent note, stale claims
  gone, ads tag present in head, zero page errors; full regression green.

- **CS94 — site restructure: RunThePitch → /soccer/, new RunThe.GG homepage (golf cross-links repointed).**
  Owner turned runthe.gg into a multi-game hub: the bare domain is now a RunThe.GG game-chooser homepage
  (neutral parent branding — dark navy/gold/teal card list, Coolmath-style, its own CSS wordmark), with
  the soccer game (RunThePitch) moved from the root to `/soccer/` and the golf game staying at `/golf/`.
  Done on `main` (structural, outside the golf game): `soccer/index.html` is the RunThePitch game with
  ONLY path refs rewritten to absolute (gameLogic.js / data/ / about-privacy-contact.html) + its own
  `/soccer/` manifest; gameLogic.js, data/, assets/ stayed at root untouched (verified the soccer game
  boots at /soccer/ with zero 404s/errors and loads player data). `/challenge/` and `/watch/` launcher
  redirects retargeted from `/` to `/soccer/` (friend challenges/watch links keep working); added
  `/pitch/` → `/soccer/`. Root `index.html` replaced with the chooser + root `manifest.json` is now the
  hub; AdSense tag carried onto the homepage.
  The only golf-game-source change (this file's repo): the two "Try RunThePitch / Love soccer?"
  cross-promo links in `build-a-golfer.html` (footer pill + About overlay) now point to `/soccer/` instead
  of `/` (which is now the hub, not the soccer game). Deployed golf/index.html mirrors it. No gameplay
  logic changed. Verified end-to-end in Playwright (homepage cards → /soccer/ + /golf/, soccer boots at
  /soccer/, challenge/watch/pitch redirect into the game) plus mobile+desktop screenshots of the homepage.

- **CS95 — leaderboard "Low → High" now shows the TRUE bottom N (top 200 AND bottom 200).**
  Owner: "when we sort from low to high, does it truly show the lowest in the database? I essentially want
  a top 200 and bottom 200." It did not — the board RPC only ever returned the top `p_limit` rows ordered
  by the chosen stat (desc), and the client faked low→high by `.reverse()`-ing that same fetched slice, so
  low→high showed the lowest of the TOP 200 (e.g. rank 200 counting down), never the genuinely worst rows.
  Fix — new migration `supabase/38_runtour_board_dir.sql` (owner-run) adds a `p_dir` param to both
  `runtour_season_board`/`runtour_career_board`: it computes each row's rank over EVERY posted row
  (rank() by the sorted stat desc, as before), then orders the output by `-rank` when `p_dir='asc'` so it
  returns the true bottom N, worst-first, each carrying its real global rank (the single worst season shows
  rank = total count, not a misleading "1"). Backward compatible: `p_dir` defaults to 'desc' (identical to
  today) and, because it's a defaulted 3rd arg, existing 2-arg callers still resolve to it unchanged.
  Client (`lbLoad`/`overlayLeaderboard`): low→high now fetches a SEPARATE ascending board cached under its
  own `tab:sort:asc` key (desc keeps the legacy `tab:sort` key so the summary rank-teaser reader is
  untouched) and displays it as-is instead of reversing the top-200. Graceful pre-migration fallback: if the
  `p_dir` call errors (migration 38 not applied yet), it flags `legacyDir` and the overlay falls back to
  reversing the desc top-200 — so the toggle still does the old thing until the SQL lands. Subtitle gains
  "· the lowest in the database" on the asc view. Verified in Playwright by seeding both boards: high→low
  shows the top (best first), low→high shows the true bottom board (worst first, real ranks, no top rows),
  and the legacy path correctly reverses the top-200; golf/index.html re-verified booting clean, zero page
  errors. **ACTION: run `supabase/38_runtour_board_dir.sql`.** Deployed client to /golf.

- **CS96 — career build-record stats self-heal from the server (fixes the "career stats reset" report).**
  Owner: "why did my career stats reset but nothing else? Is it because I changed my username? This
  shouldn't happen when a username is changed or ever." The Trophy Room showed Builds/Best Earned/Best
  OVR/Best Net/Wins/Hall of Fame all zeroed, while Tour wins 285 · Majors 57, achievements, Tour Rep, and
  Legend Tokens were intact. Root-caused the split: those two groups live in different storage. The
  lifetime `lt` totals, achievements (`bag_ach`), Tour Rep, and Legend Tokens are all SERVER-SYNCED
  (`runtour_save_stats`/`runtour_my_stats` + the CS82 cloud bundle), so a cleared/re-keyed local slot
  refills them. But the build-record fields inside `bag_career` (`builds`/`bestMoney`/`bestNet`/`bestOvr`/
  `wins`/`majors`/`totalMoney`/`totalNet`/`hof`) were the ONE career stat NEVER uploaded — they only ever
  lived in this browser's account-scoped `bag_career@<uid>` slot. When a sign-in/profile re-pull read that
  slot back empty (`sbPullStats` does `const c=career(); c.lt=srv.lt; saveCareerLifetime(c)` — if `career()`
  momentarily returns its all-zeros default, it persists zeros for the build fields while merging in the
  real server `lt`), the result is exactly the observed split: lifetime totals survive, build records show
  0. The username change wasn't causal (a rename never changes the account id the slot is keyed by, so it
  can't reset stats on its own) but it IS a sign-in/profile event, i.e. the kind of moment that triggers
  the re-pull that surfaced the gap. Confirmed `RESET_ENABLED=false` so the local launch-wipe is NOT the
  cause.
  Fix: **the build-record fields now reconstruct from the account's authoritative posted-season history.**
  Every non-daily season a player ever submitted lives in `runtour_scores`; `sbLoadProfile()` already
  fetches all of them, so new `reconcileCareerFromServer(rows)` (called at the end of that fetch, i.e. on
  every sign-in) rebuilds Builds (= season count), Wins/Majors (= sums), Best Earned/Best OVR/Best Net (=
  maxes), Total Money/Net (= sums), and the Hall of Fame (top builds by net) from those rows. It's GROW-ONLY
  (max/union): it can only ever restore or raise a value, never reduce one that's legitimately higher
  locally (e.g. offline/daily seasons that were never posted), and it never touches `lt`. Because it runs on
  every sign-in AND after `sbPullStats` within the same load, even if the local slot is zeroed again by any
  future re-key event, it self-heals immediately — satisfying "shouldn't happen ... ever." This also
  RECOVERS the owner's stats: signing in re-derives them from their own posted-season history on the server
  (the same seasons that already show on the leaderboard). Caveat surfaced honestly: seasons that were never
  submitted to the server (played fully offline, or as a guest) can't be reconstructed this way — but the
  vast majority of a real career's seasons post to the board, so the recovered figures should closely match.
  Verified in Playwright against the real in-file function: seeding a zeroed `bag_career` (with `lt` intact,
  reproducing the exact symptom) plus a set of server season rows restores Builds/Wins/Majors/Best*/Total*/
  HoF to the correct reconstructed values, preserves `lt.wins=285`, and a second pass with a
  legitimately-higher local Builds/Best OVR (99) confirms grow-only never reduces them; zero page errors.

- **CS97 — career build-record stats are now truly server-based (cross-device/cross-context).** Follow-up
  to CS96: the owner reported that opening RunTheTour from the LANDING PAGE (Safari) showed the zeroed
  career stats, while opening it from the previously-installed HOME-SCREEN app showed the real stats, on the
  SAME account (CSel8). Diagnosed the mechanism: `/RunTheTour/` is just a redirect to `/golf/`, so both
  entry points load the identical page — but on iOS a Home-Screen web app runs in a SEPARATE localStorage
  partition from Safari. The build-record fields in `bag_career` (Builds / Best earned / Best OVR / Best net
  / Wins / Majors / totals / Hall of Fame) were the one career stat with NO server sync at all (CS82's cloud
  bundle explicitly excluded `bag_career`, and sbSyncStats/sbPullStats only ever synced the lifetime
  `lt`/`btier`/`badges` sub-objects) — so they lived only in whichever browser storage they were earned in.
  That's exactly why the same account showed different stats depending on which context opened it, and it's
  what the owner (correctly) asked to fix: "the stats need to be server based attached to the account, not
  browser based."
  Fix: added `bag_career` to the CS82 cloud-save bundle (`runtour_cloud_save`, a per-account JSONB blob — no
  SQL change, the new `career` key just rides along). New `mergeCareerLifetime(local, server)` merges ONLY
  the build-record fields + Hall of Fame, GROW-ONLY (max/union), and deliberately PRESERVES local
  `lt`/`btier`/`badges` untouched — so the cloud path and the existing sbSyncStats/sbPullStats path are
  disjoint and can't fight over the same data (the exact corruption risk the old exclusion comment worried
  about). `cloudPull()` now restores the build-record fields on sign-in; `saveCareerLifetime()` fires a
  debounced `cloudPush()` on every write, so any device with real stats uploads them and every other device
  (Safari, the Home-Screen app, a new phone) converges to the same numbers. Combined with CS96 (which
  reconstructs from posted-season history), a signed-in account now heals its build-record stats from
  whichever source has them — the cloud blob or the leaderboard rows — and keeps them in sync everywhere.
  Recovery path for the owner: open the Home-Screen app (which holds the real stats) once so it pushes them
  up, then the landing/Safari view pulls them down. No service worker exists on `/golf/`, so both contexts
  pick up the new code on next open (no stale cache to clear).
  Verified in Playwright with two isolated browser contexts sharing one fake cloud blob: Device A (real
  stats) pushes; Device B (fresh, zeroed `bag_career` with `lt` intact, reproducing the reported screenshot)
  pulls and restores all build-record fields + HoF while its local `lt`/`btier` stay untouched; a Device C
  with a legitimately-higher local Builds/Best OVR confirms grow-only never reduces them (and a lower local
  field is raised to the cloud value); zero page errors. CS96's server-reconstruction test still green.

- **CS98 — course records sync to the account too (same cross-device fix as CS97).** Owner: same problem as
  the career stats, now for the all-time Course Records screen — the old records show when opening RunTheTour
  from the iOS Home-Screen app but read "unclaimed" from the landing page (Safari), same account. Root cause:
  the all-time Course Records overlay displays the DEVICE's local `bag_courserecords` store (a bare,
  device-global key), which `crLoad()` only tops up from the CURRENT global board (`runtour_course_records`).
  The owner's older records were wiped from the server by the launch-reset TRUNCATE earlier this session, so
  they now survive ONLY in whichever browser's local store set them (the Home-Screen app) and read
  "unclaimed" anywhere the local store is fresh (Safari). Same class of bug as CS97 (build-record stats):
  a record with no durable per-account home shows up on one browser and not another.
  Fix: added `bag_courserecords` + `bag_courserecords_legend` to the CS82 cloud-save bundle with a new
  grow-only `mergeCourseRecords(local, server)` — per course, the LOWER round (to-par) wins, so a merge can
  only ever restore or improve a record, never erase or worsen one held on either side. `cloudPull()` merges
  them on sign-in (and clears `crCache`/`crCacheLegend` so the overlay re-reads the freshly-merged store);
  `recordCourseScore()` fires a debounced `cloudPush()` whenever a new personal record is set. So the
  Home-Screen app uploads the old records to the account, every other device pulls them, and the all-time
  Course Records screen is identical everywhere for that account. Recovery for the owner is the same as CS97:
  open the Home-Screen app once (it pushes the surviving records up), then the landing/Safari view pulls them.
  Scope note (told the owner): this makes records consistent across a given ACCOUNT's own devices. It does not
  by itself re-insert the owner's launch-wiped records back into the GLOBAL board for OTHER players to see —
  the local store lacks the ovr/skills/decisions payload `runtour_submit_daily` needs to re-verify a round,
  so re-globalizing the wiped records would need a separate, owner-run data restore (still the parked "restore
  old course records" task). `crLoad`'s existing merge already keeps any genuinely-lower global record
  showing, so nothing regresses.
  Verified in Playwright with two isolated browser contexts sharing one fake account cloud blob: Device A
  (Home-Screen, old records) pushes; Device B (fresh Safari whose local store only had the thin post-reset
  global board) pulls and shows Coby Selly's old Augusta/Pebble/Oakmont records + the legend record, while a
  server-only Bay Hill record it didn't have is preserved (not erased); a Device C whose local record is
  BETTER than the cloud's confirms grow-only never worsens it; zero page errors. CS97 career-sync and CS96
  reconstruction tests still green.

- **CS99 — whole-game "is everything server-synced?" audit + last gap (golfer identity) closed.** Owner:
  "analyze the whole game and make sure everything is server synced, this problem is really major." Did a
  full inventory of every localStorage key the game uses and classified each:
  • **Already server-synced** (cloud-save bundle, CS82/97/98): bag_career (build records), bag_courserecords
    + bag_courserecords_legend, bag_careersave, bag_legend_tokens, bag_streak, bag_dailystats, bag_ach,
    bag_special — plus lifetime lt/btier/badges via sbSyncStats/sbPullStats.
  • **Already server-authoritative** (CS81): bag_daily (today's attempts enforced by the runtour_daily_attempts
    table; best backfilled from runtour_daily_scores via fetchServerDailyBest on sign-in). Not duplicated in
    the bundle.
  • **The one real remaining gap — your golfer's IDENTITY:** bag_look (appearance: skin/hair/kit + patterns/
    caddie/country/gender/handedness + equipped title) and bag_name (golfer name) were device-local, so the
    same account could show a different-looking golfer / name across Safari vs the iOS Home-Screen app, same
    as the career-stats and course-records bugs. **Now synced.**
  • **Deliberately NOT synced (correctly device-local):** bag_autosim, bag_dark, bag_speed, the tip/seen
    flags (bag_tip_seen/bag_seen/bag_daily_howto_seen/bag_daily_shotdetail/bag_daily_legend_seen),
    bag_resume (in-progress DRAFT snapshot — a mid-draft shouldn't teleport between devices), bag_reset_epoch
    (internal), bag_pending_seasons (the OUTBOUND submission queue — device-local by design, flushes TO the
    server), and the rtt_* auth-flow flags. These are browser settings / transient / outbound, not "profile."
  Identity fix: unlike the stat stores (monotonic → grow-only), appearance is a CHOICE, so it merges
  **last-write-wins** by a stamped edit time. New `saveLook()` central setter stamps `S.look._ts=Date.now()`,
  writes bag_look, and fires the debounced cloudPush; all 11 scattered `LS.set('bag_look',S.look)` call sites
  (swatches, patterns, caddie, country, handedness, gender, equipped title) now route through it, and the
  name input stamps identity too so a name change also syncs. bag_look + bag_name added to cloudBundle;
  cloudPull adopts the server's identity only when its `_ts` is newer than local (so a device you just
  customized on isn't overwritten by an older cloud copy), updating the live S.look/S.name too. Unlock gating
  is unaffected — equipped caddie/title/cosmetics still resolve against the account's synced lt/ach, so a
  synced "equipped" choice the other device hasn't unlocked simply falls back, no exploit.
  Verified in Playwright with isolated contexts + a shared fake cloud blob: Device A customizes
  appearance/kit/caddie/country/gender/handedness/title + name and pushes; Device B (fresh defaults) pulls
  and adopts the whole identity incl. the equipped title and name; a Device C that customized MORE RECENTLY
  keeps its own identity (LWW, older cloud copy doesn't clobber it); a live setup-screen smoke test confirms
  real swatches invoke saveLook and stamp the timestamp with zero page errors. CS96/97/98 tests still green.
  Net result: every piece of a player's PROFILE (career build records, lifetime stats, achievements/Tour Rep,
  Legend Tokens, saved career, streak, daily stats, Spotlight, course records, AND now identity/appearance)
  is account-attached and consistent on any browser or device; only genuine per-device settings stay local.

- **CS100 — Daily Challenge "button does nothing / stuck" (signed-in, some browsers/networks) fixed.**
  Owner: the Daily Challenge wasn't functioning in Chrome ("button does nothing / stuck"), works on their
  iOS. Reproduced the whole daily flow in headless Chromium (Blink = Chrome's engine) across guest,
  signed-in, full 18-hole round (both the timed shot-reveal AND skip paths), re-entry, and
  attempts-exhausted, all clean. The freeze wasn't a render crash (the CS84/86 catcher would surface those
  as a visible card); it was the signed-in **daily-start gate**. `beginDailyAttempt()` sets a
  `S._dailyStarting` latch, then `await`s the server attempt-check RPC (`runtour_daily_attempt_start`, the
  CS81 cross-device cap). If that request stalls/hangs (slow network, a stuck fetch/preflight — plausible on
  the owner's Chrome; their iOS home-screen app likely runs cached pre-CS81 code with no such gate), the
  `await` never returns, the latch is never cleared, and every later click of the Daily Challenge button
  hits `if(S._dailyStarting) return;` and silently does nothing — a permanent freeze.
  Fix (two guarantees so the button can NEVER be frozen by the network): (1) every server call in the gate
  (`runtour_daily_attempt_start` and the `fetchServerDailyBest` backfill) is raced against a 4s timeout via
  a `withTimeout` helper that resolves to `{v}`/`{e}`/`{timeout}` and never hangs — a stalled request falls
  OPEN to the local gate (the game's standard fail-open posture) instead of freezing; (2) the
  `_dailyStarting` latch is cleared in a `finally`, so no path (early return, unexpected throw, timeout) can
  leave it stuck true. On a healthy connection the RPC resolves in <500ms so nothing changes; only a genuine
  stall now degrades gracefully (≤4s, then plays) instead of bricking the button. `finishDailyRound` was
  audited too and is safe — it renders the result synchronously and fires submit/verify as fire-and-forget,
  so "See your round" can't hang.
  Verified in Playwright (Chromium): a deliberately never-resolving `runtour_daily_attempt_start` now falls
  open to the preview in ~4.0s with the latch cleared (button responsive), instead of freezing forever; and
  full regressions — signed-in fast-RPC round + re-entry, signed-in attempts-exhausted → done overlay, and
  guest full 18-hole round — all still complete with zero page errors.

- **CS101 — Daily Challenge freeze, real root cause: the SIGNED-IN start awaited the server before changing
  screens (UI-first fix).** Follow-up to CS100 (which was necessary but insufficient). Owner clarified the
  exact repro: iPhone, the daily button works as a GUEST but stops working once LOGGED IN; fine in iOS
  Safari, broken in iOS Chrome (both WebKit — so NOT a JS-engine bug, it's environmental: guest-vs-signed-in
  and this browser's connection to Supabase). That pinpoints it: `beginDailyAttempt()` was `async` and, when
  signed in, `await`ed the CS81 server attempt-check (`runtour_daily_attempt_start`) BEFORE switching
  screens. A guest skips that gate entirely (synchronous → instant), which is why guests never saw it. When
  signed in, if that request stalls on the given browser/network, the screen never changes and the button
  "does nothing." CS100's 4s timeout bounded the hang but still meant a multi-second dead button, and could
  still feel broken.
  Fix (definitive): made the daily start **UI-first** — `beginDailyAttempt()` is now synchronous, sets up
  the round and renders the preview/intro IMMEDIATELY on tap (guest and signed-in alike, so the button always
  responds instantly on every browser), and the account's 3-a-day cap is enforced in the BACKGROUND by a new
  `enforceDailyAttempt(seed)` (timeout-guarded, fail-open). The cap still holds: an over-cap player is bounced
  to the "done" overlay a moment after the preview appears (verified: preview at ~50ms, bounce after the
  server responds), and score submission / course records remain separately server-gated, so nothing is
  exploitable. Also guarded `scrDailyResult` against an unknown/stale `DAILY_COURSES[r.course]` (returns to
  title instead of white-screening) as belt-and-suspenders for any malformed stored daily result. The
  Monthly Spotlight start (`beginSpotlightAttempt`) was audited and is already fully synchronous.
  Verified in Playwright (Chromium): with a NEVER-resolving server RPC the preview still shows in <400ms and
  stays playable (fail-open) — the exact "logged-in freeze" is gone; with a realistically-delayed "no
  attempts" response the preview shows instantly then correctly bounces to the done overlay; and full
  regressions — signed-in fast-RPC round + re-entry, guest full 18-hole round — complete clean with zero
  page errors. NOTE for the user: fully close & reopen iOS Chrome (and the Home-Screen app) to load the new
  code, since iOS caches the HTML.

- **CS102 — "null" shown next to OVR on the daily result (server-backfilled best).** Owner screenshot:
  the Daily Challenge result read "Par 70 · OVR 80 · null". The trailing segment is the weather/conditions
  label. When the result comes from `fetchServerDailyBest()` (the CS81 path that backfills a best score whose
  attempts were used on another device), it stored `cond: null`; `scrDailyResult` rendered `· ${dCondLabel(r.cond)}`
  and `dCondLabel(null)` fell through its `|| c` fallback to return `null`, which interpolated as the literal
  text "null". Fixed three ways: (1) `fetchServerDailyBest` now reconstructs the REAL conditions
  deterministically (`dailyConditions(day, course_key)` — conditions are a pure function of day+course) instead
  of null, so the actual weather shows; (2) `dCondLabel` returns '' for null/unknown input instead of echoing
  it; (3) the result + spotlight-result lines guard the separator (`${dCondLabel(r.cond)?' · '+…:''}`) so no
  dangling "· " ever appears. Verified in Playwright: a null-cond best renders "Par 72 · OVR 80" with no
  "null"/dangling separator, a real cond shows its label (≋ Windy), dCondLabel(null/unknown)→'', zero errors.

- **CS103 — replaced UI emoji with themed inline-SVG icons.** Owner: "I really don't like the use of emojis
  on this game. Can we replace all emojis with themed icons?" Inventoried ~45 distinct colourful pictographs
  across ~200 spots (🏆 alone ×54, plus ⛳🏅🎖🥇🥈🥉🔥🎯💰👑❄⚔🐐🛡⚡ etc.). Built a custom icon system:
  `ICONS` (a ~55-entry map of minimal 24×24 SVG paths in the gold/green theme, drawn in `currentColor` so each
  icon inherits the themed colour of the text it sits in — medals/jacket bake their own metal colours) +
  `ic(name)` helper + a `.ic` CSS class (1em, baseline-aligned).
  Key architectural decision to avoid touching ~200 sites individually (and to auto-handle emoji stored in
  DATA fields like `badge.e`/`headline.icon` which would break `${}` interpolation if edited in place):
  convert emoji → icon at the DOM-render LAYER. `emojifyIcons(html)` maps each known emoji to its icon SVG,
  replacing only in TEXT runs (never inside a tag/attribute, via a `/<[^>]*>|[^<]+/` split), and it's applied
  inside `$()` (the universal DOM builder) so every rendered node converts for free. The handful of direct
  `.innerHTML=` sites that bypass `$()` (win/playoff celebration, Olympic podium, Ryder/Presidents cup
  scoreboard, course-records boards) were routed through `emojifyIcons()` too, one `.textContent=` (Tour Rep
  tier's 🐐) was switched to `ic('goat')`, and the one canvas share-card 🏆 was replaced with a vector
  `canvasTrophy()` (SVG can't draw to canvas). Deliberately KEPT: clean typographic glyphs that don't read as
  emoji (arrows → ← ↗ ↺ ↩, ✓, ✕, ★), country flags (real teams, image-based), and — critically — emoji in
  COPY-TO-CLIPBOARD share text (the Wordle-style 🟦🟩 scorecard + captions), since SVG icons can't exist in
  plain text; that text never passes through `$()`/emojifyIcons so it's untouched.
  Verified in Playwright: 0 leftover mapped emoji across title / menu / rules / leaderboard / course-records /
  setup / trophy-room / daily-result, plus the exact screenshot case (season "Dispatch" headlines 🎯💰🌱 →
  icons) and the Olympic podium (🥇🥈🥉 → icons); share text still contains its emoji (⛳…); a full 18-hole
  daily round regresses clean (the `$()` change didn't break rendering); screenshots of the Trophy Room and
  Daily Result confirm the icons render sharp and themed with correct inline alignment. Zero page errors.

- **CS104 — themed the emoji-presentation arrows + fixed the backwards `$` icon.** Two follow-ups to CS103
  from owner screenshots. (1) A few arrows (⬆ ↗ ↩) that headless Chromium rendered as plain text actually
  render as COLOURED emoji boxes on iOS (e.g. the blue ⬆️ in the season Dispatch "climbed the money list"
  note, and the ↗ on every Share button + the RunThePitch cross-promo pill). Added themed `arrowUp` /
  `arrowUR` (up-right, for share/external) / `arrowLeft` (for the "back to latest hole" ↩) SVG icons and
  mapped ⬆/↗/↩ in EMOJI_MAP so they convert like the rest; plain text arrows (→ ← ↺) and ✓/✕/★ stay as
  text. (2) The `money` (Money Title) icon's dollar-sign path was malformed — it drew a wavy ∩∪ line that
  read as a backwards `$`. Rewrote it as a proper S-curve + vertical bar. Verified in Playwright: ↗/⬆️/↩
  all convert to `svg.ic` with no leftover glyph, and an enlarged icon sheet confirms the `$` and the three
  new arrows render correctly; zero page errors.

- **CS105 — Resume lands on the EXACT page you left, not the start of next season.** Owner: "If a player
  exits their game on a season results page, and then resumes the game, it brings them to the start of next
  season. I want it to bring them to the page that they exited on, no matter the page." Root cause: the career
  save recorded the golfer + world but NOT which screen the player was on. `resumeCareer()` only distinguished
  a mid-season checkpoint (`r.mid.season` → resume into the season) from "everything else," and everything else
  ran `continueFranchise()` — which advances the year, ages the world, applies decline, and drops into the NEXT
  season's off-season. So exiting on the season **results** page (`scrSummary`, where the just-finished season
  is saved via `saveCareer()` with no `mid`) resumed a full year ahead, skipping the results entirely.
  Fix: every career save now tags a `resumeScreen` and snapshots exactly what that screen needs to redraw
  without re-running its one-time record logic. Three screens are handled explicitly (a legacy save with no
  tag falls back to the old `continueFranchise()` behaviour, so nothing breaks):
  • **`summary` (season results)** — new `summaryResumeExtra()` stores `resumeScreen:'summary'`, `recorded:true`,
    and a `snap` of the full completed `S.season` (field/results/totals/me + eliminated/cup/olympic/teamCup),
    the schedule, and every one-time display card (`seasonRank`, `worldRankMove`, `seasonAwards`, `freshAch`,
    `freshRep`, `rivalOutcome`, `freshRival`/`freshRivalOutgrown`, `freshBadges`, `summaryTab`). Written by the
    season-end record block AND the "Exit to Home" button. On resume, `recorded=true` is restored so the record
    block never re-runs (no double-counting of career stats), and the results page renders identically.
  • **`offseason` (tune-up)** — `continueFranchise()` now saves `offseasonResumeExtra()` right after it advances
    the world / applies decline / builds the off-season, and `offTake()`/`offReSpin()` re-save so mid-tune-up
    swaps and used re-spins persist. On resume the player lands back in the off-season at the correct (already
    advanced) year with their swaps intact, instead of re-running `continueFranchise()` into a year further on.
  • **`season` (mid-season)** — `autoSaveSeason()`/`saveMidSeasonAndExit()` now also stamp `resumeScreen:'season'`
    alongside the existing `mid` snapshot (behaviour unchanged; the tag just makes the branch explicit and lets
    a stale summary/off-season tag be overwritten cleanly, since every save rewrites the whole blob).
  `careerSaveInfo()` treats a summary/offseason-tagged save as resumable, and the title-screen "Resume Career
  Mode" subtitle now reads "Year N results · back to your season results" or "Year N off-season · tune your
  game" so the button says where it'll drop you. Verified in Playwright: exiting on the results page resumes
  ONTO the results page (year unchanged, `recorded=true`, full season restored) and the summary re-renders
  completely (name, net profit, share card, Continue-to-next-year button) with zero page errors; the off-season
  path resumes into the off-season at the advanced year; mid-season resume still lands in the season at the
  right event; and a legacy save with no `resumeScreen` still falls through to the next-off-season behaviour.

- **CS106 — Global-launch readiness batch (owner: "make sure it's ready to market worldwide… don't change
  anything about the function of the games themselves").** Ran a 5-lens audit (backend/scale, client/perf,
  SEO/analytics, legal/compliance, hosting) via parallel subagents + direct checks, reconciled every finding
  against the LIVE `main` branch (several SEO "problems" were feature-branch artifacts — `/golf/`, the hub,
  `og.png`, `ads.txt` all exist and are correct on main), then implemented the code/infra fixes that are in
  our control. **Strictly no gameplay/sim/screen-logic changes** — loading, analytics, compliance, and infra
  only. Shipped:
  - **Front-paint fix (was the worst first-impression risk).** The Supabase CDN `<script>` was parser-blocking
    with no `defer` — measured ~13 s blank screen when the CDN was slow/unreachable. Added `defer`; since the
    inline app script calls `sbInit()` during parse (when `window.supabase` may not exist yet), guarded it:
    `if(window.supabase&&window.supabase.createClient) sbInit(); else addEventListener('DOMContentLoaded', sbInit)`
    (deferred scripts run before DOMContentLoaded, so accounts/leaderboard still initialize — verified in
    Playwright that `sb` is ready with the script present, and the page still renders offline-safe without it).
    Also made the Google Fonts stylesheet non-blocking (`media="print" onload="this.media='all'"` + `<noscript>`
    fallback); the existing fallback stacks + `display=swap` mean text is always visible.
  - **GA4 analytics scaffold + `track()` forward.** Added an inert-until-configured gtag scaffold
    (`window.GA_ID='G-XXXXXXXXXX'`) to golf, the hub, and soccer. While it's the placeholder it makes **no**
    network call and defines no `gtag` (verified). The golf `track()` (58 existing events) now forwards to
    `gtag('event', …)` when configured. **ACTION (owner): set `GA_ID` to your real GA4 Measurement ID in all
    three files to activate** — nothing else needed; acquisition/retention/conversion then flow to GA4, and
    you can mark `game_start`/`sim_complete` as conversions for ad optimization. (An untracked launch wastes
    ad spend — this was the #1 marketing blocker.)
  - **`robots.txt` + `sitemap.xml`** added at the domain root on `main` (hub, golf, soccer, legal pages) so a
    brand-new domain indexes cleanly.
  - **"Olympics" → generic rename (trademark scrub).** The IOC has statutory protection over "Olympic(s)"
    that a disclaimer doesn't cure. Renamed all **user-facing** text: the event "Olympic Games" → **"The
    Games"**, medals shown as plain Gold/Silver/Bronze Medal, meta/OG/About/How-to copy → "international
    medals", the not-affiliated disclaimer de-listed "the Olympics", the country label → "for the Games", and
    the podium/selection/summary/live-screen labels. **Deliberately left every code identifier and comment**
    (`evt.olympics`, `olympicMedals`, `OLYMPICS_EVT`, `isOlympicYear`, `olympicField`, achievement `id`s, etc.)
    so save data, achievements, and logic are byte-for-byte unaffected — only display strings changed. Also
    left **"The Olympic Club"** (a real U.S. Open golf course in the daily-course data) as-is: it's a factual
    real venue name, not the Games/IOC brand.
  - **`supabase/39_runtour_launch_hardening.sql`** (owner-run): (1) profanity-sanitize the public
    `golfer_name` — new `runtour_clean_name()` (reuses the 29 blocklist, no username-format rule so spaces are
    fine) that falls back to "Your Golfer" on a blocked name rather than rejecting the season; wired into
    `runtour_submit_season` (guests are already hardcoded "Guest Player"). (2) Clamp `wins`/`majors` to 40/10
    per season (a real season can't exceed ~24 events / ~5 majors) in both the signed-in and guest submit RPCs
    — kills the forged `wins:1e6` board-takeover. (3) Add indexes for the board sort columns
    (net/wins/majors/ovr/rep) + `(user_id, career_id)` for the career-board grouping. Validated end-to-end
    against a local Postgres: clean names kept, profanity/leetspeak/spaced-evasion sanitized, forged
    wins/majors clamped, legit seasons untouched, all 6 indexes create, idempotent on re-run. **ACTION: run
    `supabase/39_runtour_launch_hardening.sql`.**
  - **Documented owner-only launch blockers** (can't be closed in code): confirm the AdSense **CMP is
    Published** for EEA/UK + US states before EU ad traffic; front the domain with **Cloudflare (free)** —
    GitHub Pages has a 100 GB/mo soft cap and prohibits high-traffic/commercial hosting; add an **age gate**
    (COPPA/GDPR-K) with accounts + personalized ads; and have counsel glance at the remaining trademark list
    (Ryder/Presidents Cup, Masters/Augusta). Also flagged (not yet done): privacy/terms GDPR/CCPA gaps, i18n
    (English-only/USD), a11y (no `alt` text; a few pill buttons keyboard-unreachable), a service worker for a
    real update path, and per-request board caching/materialization for very large scale.

- **CS109 — launch follow-ups: service worker, age gate, accessibility, privacy/terms (owner picked all
  four).** Still no gameplay/sim changes — infra/compliance/a11y only.
  - **Service worker** (`build-a-golfer/sw.js` → deploys to `golf/sw.js`): network-first for navigations/HTML
    so a new deploy reaches players immediately (ends the manual `?v=` cache-bust), cached copy as the
    offline fallback; cache-first for same-origin static; cross-origin (fonts/Supabase/AdSense/GA/flags)
    passed through untouched. `skipWaiting`+`clients.claim` so a new SW takes over on next load. Registered
    from the game with a feature-detected, fully-guarded `navigator.serviceWorker.register('sw.js')` on
    `load` — can't block or break the game if it fails. Bump the `CACHE` const to force-invalidate.
  - **Age gate** (COPPA/GDPR-K): account creation now asks a neutral **year of birth** (`#au-birth`) and
    blocks under-`AGE_MIN` (13) signups on BOTH the email/password and Google paths (signup mode only —
    returning sign-in isn't gated). Stored in `localStorage.rtt_birth_year` so a returning user isn't
    re-asked; guests aren't gated. `AGE_MIN`/`ageGateOk()` are the knobs — raise to 16 for stricter EU
    GDPR-K. Verified: 2020→blocked, empty→blocked, 1990→passes+stores.
  - **Accessibility**: made the footer's click-only controls keyboard-operable — "Add to Home" (`div`→
    `button`) and the About/Privacy/Terms links (`span`→`button`); added `role="img" aria-label` to the
    SVG-fallback avatar and the season share-card canvas. (Flags, header pills, ≡ menu, the primary avatar
    canvas, and `ic()` icons were already labeled/`aria-hidden` from earlier passes.) Verified 0 leftover
    click-only div/span in the footer.
  - **Privacy/Terms GDPR-CCPA polish**: rebuilt `build-a-golfer/privacy.html` + `terms.html` from the
    (correct) deployed golf versions and added the missing pieces — privacy: **Analytics** (GA4 cookies +
    opt-out add-on), **Where your data is stored & international transfers** (Supabase/Google, US processing,
    SCCs), **Your rights & choices** (GDPR access/portability/rectification/erasure/objection/withdraw),
    **California/US** "we don't sell; AdSense may be 'sharing'; GPC honored", **Retention**, and a Children
    section that now references the age gate; terms: **Eligibility & age** (13+), **Governing law**,
    **Severability**. Bumped "Last updated" to 2026-07-03. This also re-syncs the stale source privacy.html
    (which still said "does not currently run advertising") with the live deployed page. NOTE for owner:
    the governing-law clause is deliberately non-specific ("the state in which the operator resides") —
    have counsel pin your exact state/venue.

- **CS110 — close the email-harvesting vector (password-verified username login).** The audit's HIGH
  finding: `email_for_username(username)` (16_username_login.sql) is a SECURITY DEFINER function GRANTed to
  `anon` that returned `auth.users.email` for any username — and usernames are PUBLIC on the leaderboard, so
  a scraper could map every username to its private email. All THREE RunThe.GG games (golf, hub, soccer)
  call it for "sign in with a username," so the fix had to cover all three.
  - **`supabase/40_runtour_email_login.sql`** (owner-run): new `email_for_login(username, password)` returns
    the email ONLY when the supplied password matches the account's stored **bcrypt** hash
    (`auth.users.encrypted_password`, verified with pgcrypto `crypt()` — GoTrue stores bcrypt). A harvester
    with no password gets nothing; legitimate username login still works (the client already has the typed
    password). Then REVOKEs `email_for_username` from anon/authenticated (kept defined, not dropped → rollback
    is a one-line re-grant). Validated on a local Postgres with a real bcrypt hash: correct pw → email; wrong
    pw / no-such-user / Google-only (no password) / empty pw → null; anon can no longer call the old function.
  - **Client (all 3 games):** golf `sbSignInPassword`, hub `signInPassword`, and soccer `resolveLoginEmail`
    (signature extended to take the password) now call `email_for_login` with `{p_username, p_password}` and
    show a generic "Wrong username or password." (which also stops username-enumeration via error text).
    Verified in Playwright: golf sends username+password to `email_for_login`, never calls the old function,
    then signs in with the returned email; hub + soccer load clean.
  - **Rollout note for owner:** email + Google sign-in are unaffected at all times. Only *username* sign-in
    depends on the new function, so run `supabase/40_runtour_email_login.sql` right after this deploy lands —
    in the brief overlap, a username login might fail (users can still log in with their email); once the
    migration is applied it's fully back. Rollback if ever needed: `grant execute on function
    public.email_for_username(text) to anon, authenticated;`.

- **CS111–CS114 (deployed to /golf, not separately written up here):** "Season N Highlights" masthead
  (CS111), EU/International team flags — `NAT_FLAG` `EUR:'eu'` + globe fallback (CS112), gold+bigger trophy +
  clearer "made every cut" shield icon (CS113), Daily reveal Pause/Skip-to-end buttons (CS114). All live on
  `main` (HEAD "Deploy CS114"). Numbering continues at CS115 below.

- **CS-copy — Daily Challenge result button "Back to title" → "Return to home"** (owner). One-line copy tweak
  on `scrDailyResult`; deployed directly to `golf/index.html` on `main` (isolated, no other change), and in
  the feature-branch source of truth.

- **CS115 — Online multiplayer Phase 1: 1v1 head-to-head (backend + client, NOT yet deployed).**
  Owner's new game mode: real online 1v1 where each player drafts their own golfer, both watch the rounds
  play out on the same course, low total wins, and every result feeds a per-mode W/L leaderboard. Planned
  first (full design in `build-a-golfer/H2H-SPEC.md`, owner-approved: independent wheels + 3 re-spins for
  every mode, 9/18 holes, separate W/L ladder per mode, random teams for the Phase-2 foursomes, sudden-death
  ties, no wagering yet). Shipped Phase 1 (1v1); foursomes = Phase 2, ELO/wagering = Phase 3.
  - **Backend — `supabase/41_h2h_phase1.sql` (owner must run).** Tables `h2h_matches` / `h2h_players` /
    `h2h_records` / `h2h_queue`, RLS on, all writes via SECURITY DEFINER RPCs. `h2h_create(mode,holes,public)`,
    `h2h_join(code)`, `h2h_quick(mode,holes)` (Quick-Match via `FOR UPDATE SKIP LOCKED`), `h2h_submit_draft`,
    `h2h_state` (opponents' drafts hidden until the round is live), `h2h_report` (consensus resolve — both
    players' computed winners must agree; idempotent via a status-guarded `UPDATE ... WHERE status='live'` +
    `GET DIAGNOSTICS`; per-mode W/L records updated exactly once; disagreement → `void`), and `h2h_board(mode)`
    (public per-mode W/L leaderboard, usernames joined from `profiles`). The server stores only the match
    `seed`; course + conditions are a pure function of it, derived identically on every client. Schema is
    general enough for the Phase-2 foursome modes (`bestball`/`scramble`/`ffa`, capacity 4, team column).
    Validated end-to-end on a local Postgres: full 1v1 lifecycle (create → drafting on join → live on drafts
    → done on consensus), correct W/L + streak, idempotent re-report (no double-count), Quick-Match pairing,
    disagreement → void, and the board RPC. Applies clean + idempotent.
  - **Client (self-contained module, ~340 lines, does NOT touch career/daily game logic).** New screens
    `h2hhome` / `h2hlobby` / `h2hdraft` / `h2hwatch` / `h2hresult` / `h2hboard`, registered in `render()`'s
    dispatch + wide-screen list; entry via a new "⚔ Play Online" button on the title screen (gated on a
    signed-in account — guests get the sign-in nudge). Flow: pick 9/18 → Quick Match OR create/enter a 6-char
    code → lobby (shows the code, waits) → own independent-wheel draft with 3 re-spins (reuses `drawGolfer`
    seeded by the server-assigned `wheel_seed`; live OVR via `ovrFromSkills`) → submit → watch (both rounds
    run in lockstep locally using the deterministic `dSimHole`, hole-by-hole reveal, running to-par per
    player) → resolve (low total wins; a tie plays a deterministic sudden-death playoff off the shared seed)
    → report → result (Victory/Defeat/No-contest, both scorecards, Play again / 1v1 Leaderboard / Home). All
    state transitions are driven by polling `h2h_state` (~2s); Supabase Realtime is a Phase-2 upgrade. The
    board reads `h2h_board('1v1')`. New `track()` events: h2h_create/join/quick/draft_start/respin/
    draft_submit/watch_start/report.
  - **Verified in Playwright** with an in-page mock server (mirroring the SQL RPC logic) that auto-plays the
    opponent, driving one real client through the full flow: guest → sign-in nudge; home → lobby (code shown)
    → draft (8 skills, live OVR) → submit → live → watch → resolve (winner) → report → "Victory" result;
    board shows the W/L row; and the disagreement path → status `void` → "No contest". Regression: the title
    Play Online button renders, the existing career draft (spin → take 8 → build) and Daily Challenge both
    still work, zero page errors.
  - **NOT deployed to /golf yet** — the client depends on migration 41's RPCs, so deploying before the owner
    runs it would put a live-but-broken "Play Online" button in front of real users. Sequence: owner runs
    `supabase/41_h2h_phase1.sql` (and `40_runtour_email_login.sql` if not yet) in the Supabase SQL editor,
    confirms, THEN deploy the client. Phase 1 known gaps (documented in the spec, hardened later): draft
    legality is only lightly sanity-checked (full wheel-replay / edge-function re-sim is Phase 2/3); the
    result is trusted via 2-client consensus, not yet server-re-simulated.

- **CS116 — Online multiplayer Phase 2: 4-player foursomes (Best Ball / Scramble / Free-for-All).**
  Owner: "ready for Phase 2." No new SQL — migration 41's schema was already built for it (capacity 4,
  `team` column, `_h2h_begin_if_full` random 2/2 split, `h2h_report` handling `kind:'team'` vs `kind:'slot'`,
  per-mode `h2h_records`/`h2h_board`). This was a pure CLIENT generalization from "me vs opponent" to N
  players / teams, all in the self-contained H2H module (still does not touch career/daily logic).
  - **Modes** (`H2H_MODES`): 1v1 (2p) · Best Ball (2v2, random teams) · Scramble (2v2, random teams) ·
    Free-for-All (4p). Home screen gained a 2×2 mode picker (mode + 9/18 length), Quick Match / Play with
    friends / join-by-code all mode-aware, and a "Leaderboards" button.
  - **Unit-based scoring engine** (the core refactor): a "unit" is a competing entity — a single player
    (1v1/ffa, `kind:'slot'`) or a 2-player team (bestball/scramble, `kind:'team'`). `h2hBuildUnits()` builds
    them from the revealed drafts and gives each a `holeScore(i)` closure: **Best Ball** = the team's *better
    ball* each hole (`Math.min` of the two partners' seeded hole scores); **Scramble** = ONE combined golfer
    whose every skill = `Math.max` of the two partners, run through the same seeded sim; **1v1/FFA** = each
    player's own card. `h2hResolve()` picks the low total across all units and, on a tie, runs a
    deterministic sudden-death playoff among *all* units tied for the lead (works for 2- or 4-way ties). The
    winner is reported as `{win: unit.id, kind}` — team index for team modes, slot for slot modes — matching
    what `h2h_report` expects, so both partners on a winning team get the W and everyone else the L.
  - **Screens generalized**: lobby shows the full roster filling in with team badges once assigned (N/cap,
    "Team 1/2"); the watch screen ranks all units live (2 team rows or 4 player rows) with running to-par,
    a members line under each team, playoff holes, and a you-win/lose banner; the result screen shows the
    final standings; the leaderboard screen gained mode tabs (1v1 / Best Ball / Scramble / FFA), each
    reading its own `h2h_board(mode)`.
  - **Verified in Playwright** with a 4-player-capable mock server (auto-plays the other 1 or 3 seats,
    assigns 2/2 teams, consensus-reports): one real client played a full match in every mode —
    home→lobby→draft→live→watch→resolve→report→result — with the right unit counts (2 teams for
    bestball/scramble, 4 players for ffa), correct win-kind, per-mode board populating, and the
    disagreement→void path. A separate deterministic math check confirmed Best Ball team totals equal the
    sum of per-hole better balls, Scramble's combined golfer is the exact per-skill max (and its total
    matches a hand-computed run), and FFA's winner is the lowest individual. Existing career draft + Daily
    Challenge regress clean; zero page errors throughout.
  - Deployed to /golf (verbatim copy). Backend needed nothing new — migration 41 already covers Phase 2.
    Phase 3 remains: Supabase Realtime (replace polling), ELO/tiers/seasons, rivalry cards, emotes/spectate,
    partner-coordinated drafting, currency/wagering.

- **CS117 — H2H watch plays out shot-by-shot (like the Daily Challenge).** Owner: "Can the players watch
  the h2h shot by shot, like the daily challenge?" The watch used to reveal one hole-score per unit at a
  time; now you watch YOUR golfer's round play out shot by shot, exactly like the daily. Reuses the daily's
  pure `dShotSeq` generator + `dShotPanel` renderer (with its live `reveal` cascade) — no daily code changed.
  - `h2hBuildFocus()` builds the shot-by-shot round for the golfer you watch: your own drafted golfer, or —
    in **Scramble** — your team's combined golfer (so the play-by-play matches the ball your team actually
    plays). Deterministic (seeded per hole from the shared match seed + build hash).
  - New driver `h2hWatchStep()` reveals shots one at a time (`H2H_SHOT_MS=620`), and when a hole is holed the
    live standings advance exactly one hole (every unit's running to-par updates in lockstep), then on to the
    next hole (`H2H_HOLE_DWELL=880`). Playoff holes reveal score-by-score after the regular round. "Skip to
    result" jumps to the end. Opponents' totals never run ahead of your round, so the tension holds.
  - `scrH2HWatch` is now two columns: left = the shot panel for your hole in play (par/yardage + each shot
    with club, distance, and lie, result tag on holing); right = the live standings (2 team rows or 4 player
    rows, ranked, your row marked, winner gold at the end).
  - Verified in Playwright across 1v1 / Best Ball / Scramble / FFA: shots reveal on the panel, the scoreboard
    advances hole-by-hole in lockstep, a full 9-hole FFA round runs to completion revealing all holes,
    Scramble focuses the combined "Your team" golfer, the report still fires exactly once, and the
    disagreement→void path is unaffected. Daily Challenge (shares `dShotSeq`/`dShotPanel`) + career draft
    regress clean; zero page errors. Screenshot confirms the two-column shot-by-shot watch. Deployed to /golf.

- **CS118 — H2H pre-round matchup overview ("Tale of the Tape").** Owner: "a matchup overview before the
  round started, where you can see your golfer vs the opponent(s)" (explicitly NOT tiers/ELO yet). New
  `h2hpreview` screen inserted between "all drafts in" (status live) and the shot-by-shot watch: `h2hOnState`
  now routes live→`h2hEnterPreview()` (builds the units for display, no winner computed/spoiled) instead of
  straight to the watch; the watch begins only when you tap **Start the round ▸**. Since each client watches
  its own deterministic round, no coordination is needed — you can study the tape as long as you like.
  - `scrH2HPreview`: a comparison table — a column per competitor (player, or "Team N" with the partners
    named), rows = OVR + all 8 skills, the leader in each row highlighted gold, your column ringed. Header
    shows each golfer's archetype (slot units) or partner names (teams). Course/conditions/holes up top.
  - Each unit carries a `dispSkills` (added to `h2hBuildUnits`): the player's own skills, or for team modes
    the per-skill max of the partners — which is literally the Scramble combined golfer, and a fair "team
    best per skill" strength line for Best Ball (noted in copy). Grid is `overflow-x:auto` and tuned so all
    four FFA columns fit a 430px phone.
  - Verified in Playwright across 1v1/Best Ball/Scramble/FFA: the preview appears with the right unit count,
    OVR + skills render, Start advances to the watch, and the full chain (preview→watch→resolve→report→
    result) still completes with the board populating and the void path intact. Screenshots confirm the
    1v1 two-column and 4-player FFA layouts. Daily + career regress clean; zero page errors. Deployed to /golf.

- **CS119 — H2H tester feedback: lobby status label + host-picks-course (private rooms).** From a real
  2-player test (screenshots):
  1. **Lobby status "in" → "drafting".** In the waiting-room roster, a player still building their golfer
     showed "in", which read like "ready". Now shows **drafting** (still building) · **ready** (draft
     submitted) · **joined** (in the lobby, pre-draft), ready in gold. For team modes it shows the team
     badge plus the status ("Team 1 · drafting"). Pure client.
  2. **The private-room host can pick the course** (owner-confirmed "yes if it's a private room"). Home
     screen gained a Course `<select>` (Random + all 39 daily courses) that applies only when you host a
     private "Play with friends" match; Quick Match / public lobbies stay random-course so nobody farms a
     favorable venue on the public boards. The course is encoded into the match seed
     (`h2hSeedForCourse`: pick a seed where `seed % N` = the chosen course index; conditions still vary),
     so every client derives the same course with no schema/state change. `supabase/42_h2h_course_pick.sql`
     (owner-run) replaces `h2h_create` with a 4-arg version taking an optional `p_seed`, honored ONLY for
     private rooms and only when in range, else server-random. Client sends `p_seed` for a private
     course-pick and **gracefully falls back** to a random-course create if the param isn't live yet (so
     deploying before the migration can't break create — it just randoms until 42 is applied). Validated
     on local Postgres (private pins the seed, public/out-of-range fall back, 3-arg calls still work via
     the default) and in Playwright (chosen seed maps to the chosen course, public/random send no seed,
     the error→retry fallback path, and the new lobby labels). Deployed to /golf. **ACTION: run
     `supabase/42_h2h_course_pick.sql`** to activate host-picks-course (label fix is live regardless).

- **CS120 — AI backfill for online matches (early-development cold-start).** Owner: fill online matches
  with AI so players "always think they're playing somebody," while the game is early. Implemented as a
  flag-gated Quick-Match backfill (my stated guardrails, baked in): `H2H_BOTS_ENABLED` (flip off once
  there's a real player base), **Quick Match only** (private "Play with friends" rooms stay human-only),
  the app never explicitly claims an opponent is human (it just doesn't disclose), and a documented hard
  rule that this MUST be off/disclosed before any wagering/real-money feature.
  - **Flow:** Quick Match shows "Finding an opponent…", polls for a real human (who always gets priority),
    and after a randomized `H2H_BOT_WAIT` (~5-9s) with no human, `h2hConvertToBots()` best-effort
    `h2h_abandon`s the empty server lobby and starts a fully client-side bot match: believable usernames
    (`H2H_BOT_NAMES`, ~70 handles), varied skill (`h2hBotSkills`: 70-86 base + 1-2 spikes so they read like
    drafted golfers), random 2/2 teams for foursomes. A real human filling the lobby first cancels the
    backfill (`h2hClearBotTimer` on any non-lobby state). Then the normal draft → matchup → shot-by-shot
    watch → result runs unchanged (bots already have drafts; the human drafts normally), with small delays
    so "opponents finishing" feels human.
  - **Records:** a bot match updates the human's REAL per-mode W/L (so it's indistinguishable from a real
    game) and each bot persona's running record, via `supabase/43_h2h_bots.sql` — `h2h_record_bot_match`
    (bumps caller + bots), `h2h_abandon` (deletes an empty converted lobby), and `h2h_board` is rewritten to
    UNION real players + `h2h_bots` so the leaderboard looks populated. No auth.users/h2h_players rows for
    bots (a bot match never becomes a real server match), so no consensus/FK issues.
  - **Deploy-safe before the migration:** if 43 isn't applied, `h2h_record_bot_match`/`h2h_abandon` calls
    are caught+ignored (the match still plays and shows a result) and the old `h2h_board` still works
    (bots just don't persist/appear yet). Trust note: single-client-recorded, same posture as the rest of
    h2h; a client could pad its own record — fine pre-launch, no stakes.
  - Validated `43` on local Postgres (human + bot records accumulate, board unions them, abandon deletes an
    empty lobby) and the client in Playwright across all four modes: Quick Match → convert → bot match →
    result with correct winner attribution (team wins credit BOTH partners incl. the human's bot partner,
    FFA only the winner), abandon fired, a real human cancels the backfill, and private rooms never arm
    bots. Real-human flow + daily/career regress clean; zero page errors. Deployed to /golf. **ACTION: run
    `supabase/43_h2h_bots.sql`** to persist bot/human records + populate the board (in-match bots work
    without it).

- **CS121 — Online "feels alive" polish (parity with RunThePitch's online mode).** Owner ported four
  waiting-room features to RunThePitch and asked for the same on RunTheTour. All client-only (no migration;
  reuses existing RPCs):
  1. **Trickle bot-fill.** The AI backfill no longer drops all opponents in at once — after the initial
     wait for a real human (`H2H_BOT_WAIT` trimmed to 4-6.5s), `h2hStartBotMatch` seeds the lobby with just
     you and `h2hTrickleBot` adds one bot every ~2-5s, so the lobby visibly fills like real players joining
     (especially foursomes: 1→2→3→4). Once full, teams are flipped and the draft begins.
  2. **Match-ready alerts.** `h2hNotifyReady` shows an in-app banner AND (if you granted permission and have
     tabbed away) fires a browser `Notification` the moment your match is ready — on opponent-found
     (→drafting) and, via `h2hNotifyHidden` (only if the tab's hidden), when the round starts (→preview). A
     "🔔 Notify me when it's ready" button on the waiting screens requests permission (shown only while it's
     still askable).
  3. **Invite friends.** The private-room waiting screen now has an "Invite friends" button
     (`navigator.share`, clipboard fallback) alongside Copy code, sharing a working deep link.
  4. **Deep links that actually work.** A shared `…/golf?h2h=CODE` link is parsed on load (`h2hCheckLink`,
     also handles `#h2h=`), stashed to `localStorage`, the URL cleaned, and auto-joined (`h2hTryPendingJoin`)
     — immediately if signed in, or after the sign-in prompt (retried from `sbApply`, survives the OAuth
     redirect). `h2hInvite` builds the link from `location.origin+pathname`.
  - Verified in Playwright: trickle fills 1→4 one at a time then starts; the ready-banner shows + the
    notify button appears only when permission is askable; invite shares a `?h2h=CODE` URL; the deep link
    parses/upcases/stashes and prompts sign-in when signed out, then auto-joins with the right code once
    signed in (consuming the stash). Full bot match (trickle) completes end-to-end in all four modes;
    real-human flow + daily/career regress clean; zero page errors. Deployed to /golf.

- **CS123 — Menu (title screen) revamp: highlight online, tidy the hierarchy** (parity with RunThePitch's
  home revamp). Owner: promote the online modes and improve the menu UI/UX. Online play was buried as a
  small "⚔ Play Online" button in a secondary row; now it's its own headline block, mirroring the soccer
  game's pattern in RunTheTour's green/gold brand.
  - **Play Online block** (`.online-home`): a teal-accented card (distinct from the gold career / blue daily
    CTAs so colour alone signals "this is the online stuff"), a pulsing "live" dot + "NEW" badge, and two
    entry buttons — **1v1** ("Head-to-head · live") and **Foursomes** ("2v2 & 4-player") — that drop
    straight into the online home with that mode preset (`openH2H('1v1'|'bestball')`; `openH2H` now takes an
    optional, onclick-safe mode arg). Reduced-motion disables the pulse.
  - **Cleaner hierarchy:** hero + 30-year badge → a shortened one-line lede ("Draft your golfer one skill at
    a time, then chase majors and glory, solo or online.") → the primary Step-to-the-Tee-Box / Resume CTAs →
    Daily Challenge (+ streak/spotlight) → the Play Online block → **secondary actions demoted** from two
    `.btn` rows to a single small-link row (`.home2`: How to Play · Leaderboard · Trophy Room) → DataGolf
    credit. Less button-wall, clear primary path, online clearly featured.
  - Verified in Playwright (430px): the block renders with the live dot/NEW badge + both buttons, guest taps
    nudge sign-in, signed-in taps open the online home with the right preset mode (1v1 / bestball), the
    secondary links route correctly (rules / leaderboard / trophy room), and career-draft + daily regress
    clean; zero page errors. Screenshot confirms the new layout. Deployed to /golf.

- **CS124 — Cohesive teal accent across the online section (deployed).** New `.online-tag` chip (teal, with
  a pulsing "live" dot on the finding/waiting screens) replaces the gold tag at the top of every H2H screen
  (online home, lobby, draft, matchup, watch, result, leaderboard) via a `h2hTag(html, live)` helper — so the
  whole online area reads as one distinct teal-accented section tied to the menu's Play Online block. Owner
  reviewed preview screenshots and approved.
- **CS125 — Two menu/online tweaks (deployed with CS124).** (1) Online selection screen now defaults to
  **18 holes** instead of 9 (`openH2H` holes default → 18). (2) The gold "Step to the Tee Box" button
  subtext reads **"Build your golfer, start your career"** (was "…start their career"). Verified in
  Playwright (subtext + 18-holes highlighted by default, zero errors).
- **CS126 — realistic bot usernames.** Swapped the golf-pun bot handles (SandSaveSam, shankopotamus, putt_pirate…) for human-looking ones (first names / initials / nicknames / casual numbers: mike_42, jmarshall, sullyy, colby7…) so a backfilled opponent doesn't read as a bot. Updated both H2H_BOT_NAMES (game) and the seed (below); the seed now also purges the old-pun personas first so the board is consistent whether or not the earlier seed was run.
- **Leaderboard seed:** `supabase/44_h2h_seed_board.sql` — one-time seed of ~185 believable bot records
  across the 4 online modes so the boards look populated day one (same name pool as the live bots, realistic
  spread, `ON CONFLICT DO NOTHING`, idempotent). Owner-run in the Supabase SQL editor.

- **CS128 — live countdown to the next Daily Challenge course.** Owner: "add a countdown to the next daily
  challenge... players know when it changes so they feel more inclined to play. We can even put it on the
  title as well." The daily course rotates at UTC midnight (`todayKey()` uses getUTC*). New helpers after
  `twoDaysAgoKey`: `dNextResetMs()` (ms until the next UTC midnight, from `Date.now()`), `fmtCdClock`
  (HH:MM:SS) / `fmtCdHM` (compact), and `dCd(style)` which emits an inline `<span class="dc-val"
  data-cd="clock|hm">` seeded with the current value. A single `setInterval(tickCountdowns, 1000)` at boot
  updates EVERY `.dc-val` on screen once a second (tabular-nums so it doesn't jitter), so any surface that
  drops a `dCd()` span ticks live for free with no per-screen wiring. Placed a gold "New course in HH:MM:SS"
  line on: the **title screen** (right under the Daily Challenge button — creates "play before it changes"
  urgency), the **daily preview** ("Playable for HH:MM:SS, then a new course rotates in", hidden for Monthly
  Spotlight via `!S.special`), and the **daily-done overlay** (`overlayDailyDone`). Verified in Playwright:
  the title `.dc-val` renders and decrements across a 1.4s wait (ticking), the preview + done-state title
  both render the span, zero page errors. Deployed to /golf.

- **CS129 — "sweaty" live season sim: slower pace + smooth motion + highlighted moments (NOT deployed —
  awaiting owner confirm on default pace).** Tester feedback (screenshot): "the results are way too fast.
  Hard to read/catch up. Needs to be slower to feel the sweat and actually ingest it all." The season
  played a full 4-round tournament in ~3.3s (`ROUND_DELAY=820ms`×4) then auto-advanced, and every round the
  leaderboard was rebuilt from scratch so rows TELEPORTED to new standings. (The Daily Challenge + online
  H2H watch already play shot-by-shot, so the season was the gap.) All changes are presentation/pacing only
  — the deterministic sim math is untouched; reduced-motion users get the info without the animations.
  • **Pacing + control.** Replaced `ROUND_DELAY`/`EVENT_PAUSE` with a `PACE` map + `paceMs()`: chill
    {r:2200,e:3200} / normal {1300,2000} / fast {650,1100}. New ⏱ Pace button (in the season controls)
    cycles chill→normal→fast, persisted `bag_pace`, `S.simPace` defaults to **chill** (slow/readable). The
    Games still run ×1.5. Auto Sim + Skip to End unchanged.
  • **FLIP leaderboard glide.** `liveRow` now carries `data-nm`; module `_lbRects` captures each named row's
    top-within-board each render, and a 2×rAF pass in scrSeason animates every row from its previous slot to
    its new one (`transform` translateY → 0, .6s ease) with a green (`lb-flash-up`) / red (`lb-flash-dn`)
    box-shadow flash on movers. Guards: skips when the board isn't connected (a newer render won) and under
    reduced-motion; rows new to the top-12 fade in. Reset per event in `beginEvent`.
  • **To-par count-up.** The big scorecard to-par (`#scTopar`) tweens from the previous value to the new one
    (~560ms ease-out via rAF + `par()` formatting) with a `.tick` pop, instead of snapping. `_prevScTotal`
    reset per event.
  • **Per-round "moment" callout.** A teal chip under the scorecard, rebuilt once per completed round (gated
    on `ce._momentRD` so control-click re-renders don't re-pop): day · your round score (colored) · places
    gained/lost vs last round (`▲6 · T3` / `▼1 · T28`), plus `✓ Made the cut` on Friday, `🏆 Winner` at the
    finish, and `Missed the cut`. Tracks `ce._momentPrevPos` for the movement delta. Plus a dashed "Cut +N"
    line drawn into the board when the cut falls within the visible top-12.
  Verified in Playwright driving a real career season: pace defaults slow, rounds advance at ~2.2s, the
  moment refreshes THU→FRI→SAT with correct movement, FLIP transforms apply on re-sort, the pace button
  cycles, Skip to End still works, zero page errors. **DEPLOYED to /golf.** Owner then renamed the pace
  tiers **Chill→Broadcast** / normal→**Standard** / fast→**Fast** (label-only; internal keys `chill/normal/
  fast` unchanged so persisted `bag_pace` still resolves), keeping the slow "Broadcast" cadence as the
  default preset.

- **CS130 — sim toughness + variance + off-season strategy (users: "too easy to stay consistent late
  career; the senior tour is far too easy to win an abnormal number of times; CPUs should rival the user
  more").** Diagnosed with a Monte-Carlo harness against the real in-file functions (worldField / legendField
  / seedWorld / advanceWorld / simRound). Root causes: (1) the living-world field DECAYS over a career — real
  stars retire and the generated replacements were capped too low, so the top OVR fell 92→**88** across 30
  years (median 83→79), leaving a maintained ~90 build fighting a *weakening* field; (2) the Legend Circuit
  field is retired 50+ year-olds at fully age-declined ratings, top **80** / median **72**, so any entrant
  ≥82 dominated (OVR-85 won ~25%/event ≈ 5 wins/yr ≈ **60 over the 12-yr circuit**); (3) off-season re-spins
  let a player grind the SAME stat repeatedly, so repair out-paced decline and builds never really faded.
  Owner picked **Tough but fair**, keep the regression, and asked specifically for a **once-per-stat
  off-season lock** as the strategy lever (upgrade a stat and it locks until next off-season). Changes:
  • **Generational phenoms** (`genRookie`): rarer high-potential tail (~2% reach 90+, ~0.5% reach 94-96,
    clamp 92→96) so the field replenishes elite talent as stars retire → late-career field top back to
    **~91** (median 79 / p90 86). Young phenoms still enter well below potential (living < peak until ~30),
    so they don't instantly top the field over the real stars — they mature into contenders over ~a decade.
    Year-1 field unchanged (top 92); daily unaffected (static seeded field).
  • **Stronger circuit field** (`legendField` + `CIRCUIT_VET=0.42`): senior pros recover a chunk of their
    peak on the shorter/no-cut circuit (`living + 0.42·(peak−living)` per skill) → circuit top **84** /
    median **78** (was 80/72).
  • **Once-per-stat off-season lock** (the requested strategy feature): `S.offseason.locked=[]`; `offTake`
    records + refuses a second change to the same stat; `scrOffseason` renders a locked stat greyed +
    disabled with a "🔒 locked" tag (CSS `.attr.locked` overriding the `:disabled .take{display:none}` rule);
    intro copy explains it. Serialized in the offseason resume blob so it survives a mid-off-season refresh.
  • **A touch more variance** (`SIM` sigma reg 2.80→**2.95**, maj 2.90→**3.05**): adds upsets so the very
    best build isn't a lock (compresses OVR-92 dominance), justified by the now-deeper phenom field.
  Net Monte-Carlo (per-event win rate → ~wins/season over ~20 events): regular late-career OVR 88 ~1.0/yr,
  90 ~2.0/yr, 92 ~3.0/yr (was 88 ~1.9, 90 ~2.8, 92 ~4.5); circuit OVR 82 ~0.9/yr, 85 ~1.8/yr (was 85 ~5/yr,
  i.e. ~60 circuit wins → ~22). Deterministic sim structure untouched; SKILLSLOPE / base / course-fit /
  decline curve all unchanged. Verified in Playwright: full regular season runs to completion clean; the
  stat-lock locks the taken stat, refuses a re-take, and still allows a different stat; zero page errors.
  Deployed to /golf.

- **CS131 — gold winner row on the final tournament leaderboard.** Owner (screenshot): the winner's trophy
  should be gold and the winner's row should have a gold glow. `liveRow` (live/final board) + `lbRow` (recap
  board) now tag the solo winner with a `winner` class; CSS `.lb.winner` gives a gold gradient + a gold ring
  and a soft pulsing gold glow (`@keyframes winGlow`, reduced-motion static), `.lb.winner .pos` turns the
  trophy SVG gold (it's drawn in `currentColor`) with a drop-shadow, and the name goes gold. Verified in
  Playwright at the final board: winner `.pos` color = gold, gold box-shadow present, trophy SVG rendered,
  zero errors. Deployed to /golf.

- **CS132 — daily attempt is consumed at the first wheel spin, not on opening the preview.** Owner: opening
  the Daily Challenge start menu and backing out was using up an attempt; an attempt should count when the
  first wheel spin is initiated. Root cause: `beginDailyAttempt` fired `enforceDailyAttempt` (the server
  `runtour_daily_attempt_start` claim, CS81) the moment the preview rendered — so merely opening it
  incremented the account's server count and reconciled the local counter up. (Signed-in only; guests never
  hit enforce.) This ALSO silently double-counted: enforce reconciled local to the just-claimed number, then
  `finishDailyRound` did `attempts+1` on top → a single play read as 2 attempts used. Fix: new
  `claimDailyAttempt()` (guarded once per attempt via `S.dailyClaimed`) bumps the local count and does the
  server claim; it's called at the FIRST draft spin (`spin_`, gated `S.daily && !S.special && !S.dailyLegend`
  so career drafts and Spotlight don't trigger it) and at the start of a Legend Token round (which skips the
  draft). `beginDailyAttempt` no longer enforces on entry (just sets `S.dailyClaimed=false`), and
  `finishDailyRound` now reads the already-claimed count (`Math.max(1, dailyAttempts())`) instead of
  re-incrementing. Verified in Playwright with a mock server: open preview + back out → 0 attempts (local &
  server); full play → exactly 1 (double-count gone); second play → 2; guest full play → 1, guest preview
  back-out → 0; a career-mode draft spin leaves the daily counter at 0. Zero page errors. Deployed to /golf.

- **CS133 — season-summary reorder + off-season re-spin rule subtext.** Owner asks: (1) move the season
  highlights ("Season N Highlights" / RunTheTour Dispatch masthead) to the TOP of the year summary; (2) move
  the global leaderboard rank to just below the Full Season Recap button and above the career stats; (3) add
  subtext to the off-season re-spin buttons clarifying that once you spin you MUST take a skill, and that you
  may start the season without using all your spins. Changes in `scrSummary`: `headlinesHTML(HL)` now renders
  immediately after the "Year N complete" tag (HL computed up there) instead of mid-page; the async
  global-leaderboard-rank scout (`S.seasonRank`) moved out of the top region into the left column, appended
  right after the `recapBtn` and before the career-stats block. In `scrOffseason`: the "Spin the Wheel"
  button gained a sub ("Once you spin, you must take one of that golfer's skills. You don't have to use every
  spin — you can start the season anytime.") and the "Re-spin · N left" button a sub ("Pass on this golfer
  for a new one. You still must take a skill from whoever lands."). Verified in Playwright (signed-in, to
  avoid the guest sign-up nudge which also contains "global leaderboard"): highlights render before the recap
  button, the rank node sits after the recap button and before the career stats (DOM compareDocumentPosition),
  both off-season buttons carry the new subtext, zero page errors; screenshot confirms Highlights leading the
  summary. Deployed to /golf.

- **CS134 — floating "scroll down to continue" cue on the year summary.** Owner: players don't realize they
  must scroll to the bottom of the (long) summary to reach the advance button. Added `setupSummaryScrollCue`:
  the primary advance button (`Continue to Year N` / `Finish Career` / `Finish Legend Circuit`, or the daily
  `Build Another Golfer`) now carries `id="sum-advance"`, and a fixed gold pill (`.scrollcue`, bottom-center,
  safe-area aware, bobbing ▾) reads "Scroll down · <that action>". An IntersectionObserver toggles the pill's
  `.show` class so it's visible only while the button is off-screen and hides once it scrolls into view;
  tapping it smooth-scrolls to the button and pulses it (`.cuepulse`). Fail-open (no IntersectionObserver →
  just shows). Verified in Playwright on a 430×720 phone viewport: pill shows at top with the correct next
  action, tapping scrolls the button into view + pill hides + button pulses, zero page errors; screenshot
  confirms the pill. Deployed to /golf.

- **CS135 — fix: Daily Challenge button "does nothing" (blank bounce back to title).** Owner report:
  clicking Daily Challenge on the title did nothing. Root cause: `startDailyChallenge` routed to the result
  screen whenever `dailyAttempts()>0`, but a signed-in account can have `bag_daily={date,attempts:N}` with NO
  stored `best`/`result` — `reconcileDailyAttempts` pulls the account's server attempt count into local, and
  if there's no server round to fetch it leaves `best` unset (this is exactly the state left behind by the
  now-fixed pre-CS132 "enforce-on-preview-open" bug, which inflated the server count every time the preview
  was opened). With no showable result, `scrDailyResult` bailed via `S.screen='title'; return render()` — but
  that nested `render()` is INSIDE render's dispatch, so it hits the re-entrancy guard and defers, netting a
  bounce straight back to the title = "the button does nothing." (Same for a stale/unknown course key.) Fixes:
  (1) `startDailyChallenge` now only shows the result screen when there's a genuinely renderable result
  (`dailyBest()` with a course still in `DAILY_COURSES`); otherwise if attempts remain it goes to play, and if
  out of attempts it shows the graceful "done for today" overlay — never a blank bounce. (2) `scrDailyResult`'s
  no-result / unknown-course guard now renders the title INLINE (`return scrTitle()`) instead of a re-entrant
  `render()`. Verified in Playwright across the reproduced states (inflated-count-no-best → done overlay;
  old-format `{done:true}` and unknown-course with attempts left → into play; fresh guest → intro; valid result
  → result screen with Play again): no blank screens, zero page errors. Deployed to /golf. NOTE for owner:
  accounts whose server attempt count was inflated by the old bug are (correctly, per the server cap) locked
  for TODAY and will see "done for today"; the count resets at UTC midnight and the underlying bug is already
  fixed, so it's self-healing — a one-off `truncate/delete from runtour_daily_attempts where day=<today>` could
  unlock them immediately if desired, but isn't required.

- **CS136 — HOLE VIEW: broadcast-style animated ball + tracer (TOURCAST-inspired), Daily + H2H.** Owner sent
  PGA Tour app TOURCAST screenshots: "I want the ball and ball tracer to be animated and simulating like a
  real golf ball." Built a stylized top-down hole graphic that plays every shot like a broadcast tracer:
  • **Structured shot data.** Every `dShotSeq` push now ALSO records `{k:tee/app/adv/chip/pen/putt/hole,
    lie:fw/rl/rr/ru/tr/fb/gb/fr/fc/sr/lo/green/water/drop/hole, fromY, toY, ft, toFt, side, dr}` — the text
    narrative is unchanged and every rng call is preserved in order (verified: 12,000 par/score/seed combos
    produce byte-identical narratives vs HEAD, so determinism/server-verifiability is untouched).
  • **HOLEVIEW module** (`hvGeom/hvPlots/hvTerrain/hvDoneShot/hvLiveShot/hvKick/hvNode`, ~300 lines,
    self-contained): deterministic per-hole geometry (dogleg fairway ribbon + mow stripes + rough halo, tree
    blobs, greenside/fairway bunkers, green + fringe + gold pin, tee box; a water hazard is drawn exactly
    where a ball actually drowned, from the shot data) projected with a far-end perspective taper. Each
    shot's rest position is plotted from its structured lie (rough side, bunker snap, green position from
    ft-to-hole + side, penalty drop, water splash point) with deterministic hash jitter (no rng).
  • **Real-ball animation** (rAF, ids re-queried every frame so mid-flight re-renders can't kill it): launch
    → hang (ball scales up at apex + drifting shadow) → draw/fade curve (quadratic flight biased toward the
    miss side) → land short of the rest spot → bounce (decaying hops) → roll out; the white-hot tracer with a
    gold glow draws behind the ball in real time (stroke-dash reveal), putts roll with decel + sink into the
    cup with a gold pulse, water shots end in a splash ring, penalty drops fade in. Numbered markers
    (TOURCAST-style chips) are left at every resting spot; prior shots stay as dim teal traces.
  • **Camera**: full-hole view → tweened green close-up for the putting phase (viewBox animation); markers/
    strokes drawn to scale in the close-up so chips don't blow up under zoom.
  • **Stat strip** above the graphic: `SHOT n · 300 YDS · TO HOLE 81 YDS` + derived flavor chips
    `BALL SPEED 175 MPH · APEX 120 FT` (deterministic from distance), result chip on holing.
  • **Pacing**: the reveal scheduler now waits for each shot's animation (`hvShotMs`: drives ~2.3s, chips
    ~1.6s, putts ~1.4s, capped 2.6s) in BOTH the daily (`startShotReveal`) and the H2H watch
    (`h2hWatchStep`), so the next shot fires when the ball has landed. Skip/Pause/auto-finish unchanged.
  • Integrated in `scrDailyRound` (above the play-by-play text; tapping a played hole replays its full
    static tracer map) and `scrH2HWatch` (your focused golfer's hole, left column). Old/uninstrumented
    stored rounds gracefully render no graphic. Reduced-motion → static final states, no animation.
  Verified in Playwright: mid-flight ball scaled at apex + moving + tracer revealing; full hole → markers
  1/2/3 + green close-up + HOLED chip; H2H watch renders + animates + skip-to-result intact; daily
  skip-hole/auto-finish/reduced-motion all clean; zero page errors everywhere. Deployed to /golf.

- **CS137 — FICTIONALIZATION SHIPPED (all courses, tournaments, cups) + TourTrace branding.** Owner
  approved the RENAME-SPEC names ("move forward and push to the live game") and asked to rename the
  TOURCAST-style view to our own name as the featured view. Three-pass implementation:
  • **Pass 1 (courses):** all 39 DAILY_COURSES rewritten in place — new display names/locations (Magnolia
    Hollow, Graystone Cove, The Auld Links at Carrickmoor, Grindstone, Ravenwood Black…), 39 new blurbs
    (course character kept, real architects/history/people removed), all ~117 signature-hole lines rewritten,
    protected hole nicknames replaced (new flora set at Magnolia Hollow, scots set at Carrickmoor, Plowlines/
    Gauntlet/Thimble/Chasm/Fangs…). Internal course KEYS unchanged (server rows, records, seeds all intact —
    a mid-pass bug where the global rename hit the 10 dual-use keys, e.g. "Quail Hollow Club", was caught by
    a key-integrity audit and every key position restored; verified all 39 keys + 16 DSIG_HAZ keys intact).
  • **Pass 2 (events/cups/venues):** global longest-first rename of the entire schedule — majors (The
    Magnolia Invitational / The Championship / The National Open / The Links Championship), The Stadium
    Classic, all sponsor-branded events (BMW/FedEx/Deere/Zurich/Sony/Wyndham/… → Crossroads/Memphis/Quad
    Cities/Bayou/Island/Piedmont…), full Legend Circuit slate, oppo events, EVENT_COURSE standalone venues,
    and the cups: FedEx Cup→**Tour Cup**, Ryder Cup→**Atlantic Cup**, Presidents Cup→**Nations Cup**,
    Schwab Cup→**Legends Cup**. COURSEFIT/EVENT_COURSE lookups keyed by event name stayed consistent
    automatically. Cosmetics de-personed (Sunday Red→Victory Red, Poulter Pink→Matchplay Pink, Hogan
    Grey→Heritage Grey, Masters Green→Invitational Green; Argyle reqText de-Payned).
  • **Pass 3 (code):** majorTheme regexes updated (/Magnolia/, /National Open/, /Links Championship/) +
    the green jacket SVG recolored to a **burgundy Champion Blazer** (Augusta trade dress removed) and the
    Claret Jug/Wanamaker labels → Links Flagon / Championship Cup; "the The" replace-doubling fixed;
    achievement names (Magnolia Royalty, Magnolia Champion); the not-affiliated disclaimer now states all
    tournaments/venues/cups are fictional; `/Players/i` achievement+entry-cap regexes → /Stadium Classic/i.
    **`LEGACY_EVENT_ALIAS` + `normalizeCareerNames()`** normalize old event names in persisted careers
    (majorStats keys merged, winsList renamed) at resumeCareer/viewEndedCareer, so an in-flight career keeps
    its majors, Grand Slam eligibility and guest-major exemptions. lt.maj uses abbreviated keys (unaffected);
    MAJOR_KEYS renamed consistently with fresh season data.
  • **TourTrace:** the hole view is now branded **TOURTRACE** (wordmark strip + pulsing LIVE chip / REPLAY
    tag) and remains the default, featured presentation of live play in the daily + H2H.
  Verified in Playwright: a generated season schedule + venues contain zero real names (21 events incl. the
  4 renamed majors + Atlantic Cup); majorTheme returns the burgundy blazer/flagon/cup themes; a LEGACY
  career with old-named Grand Slam majorStats still qualifies after normalization; the daily preview/round
  shows Graystone Cove with the TOURTRACE LIVE brand while the internal key stays "Pebble Beach Golf Links";
  all 39 H2H course-picker names fictional; a full strong-build season completes (4 wins, fictional names
  throughout the summary) — zero page errors everywhere. Player roster + caddie names deliberately left
  real (separate right-of-publicity decision, flagged in RENAME-SPEC §7). courses.json (internal doc) not
  updated — the game file is canonical. Deployed to /golf.

- **CS138 — Practice mode (?practice=1): unlimited Daily Challenge rounds, nothing recorded.** Owner was
  out of daily attempts and needed a way to test the new features (TOURTRACE hole view, fictionalized
  courses) without the 3-a-day server cap. Built a proper practice mode rather than a backdoor, so it's
  safe to ship publicly by design — a practice round can't touch anything competitive, so there's nothing
  to exploit. Activate with **`https://runthe.gg/golf/?practice=1`** (or `#practice`); the URL param is
  deliberately KEPT (unlike `?h2h=`, which is cleaned) so a refresh stays in practice mode — drop the param
  for normal play.
  Implementation: module-level `let PRACTICE=false` (NOT on S, since `reset()` rebuilds S every attempt) +
  `practiceCheck()` URL parser called at boot before the first render (so the title button reflects it),
  with a toast announcing the mode. Gates: `startDailyChallenge` goes straight into a fresh round (never
  the result screen / done overlay); `beginDailyAttempt` skips the attempts-left gate and salts the draft
  wheel + per-hole luck with a RANDOM attempt number so every practice round offers a fresh draft and fresh
  variance (determinism doesn't matter — nothing is submitted); `claimDailyAttempt` no-ops (no local bump,
  no server `runtour_daily_attempt_start` claim; `enforceDailyAttempt` double-guarded); `finishDailyRound`
  has an early practice branch that builds a `practice:true` result and skips ALL bookkeeping — no
  `recordCourseScore`, no `bag_daily` write, no `sbSubmitDaily`/`verifyDailyRecord`, no
  `bumpStreak`/`bumpDailyStats`/`captureDailyFeats`/`evaluateAch`, no guest-claim stash, and a Legend Token
  round never spends the token. UI: the title Daily button reads "Daily Challenge · Practice · unlimited
  practice rounds"; the preview and result screens carry a teal "Practice … nothing is recorded" tag; the
  result hides attempt counts / best-of-day / percentile / streak / lifetime-record / guest-sign-in cards
  and always offers "Play again ▸ · Unlimited practice rounds".
  Verified in Playwright (served over http; signed-in account with 0 attempts left + mocked `sb.rpc`
  recording every call): practice enters the daily flow despite 0 attempts, a full draft → 18-hole round →
  result completes with `bag_daily` untouched (attempts stay 3, no result written), ZERO attempt-claim or
  submit RPCs fired, streak/daily-stats/course-records all still empty, the result screen is
  practice-tagged with unlimited Play again (which starts a fresh round with a different draft salt);
  normal-mode regression: no param → PRACTICE off, an out-of-attempts account still bounces to the "done"
  overlay, and a guest's first wheel spin still claims exactly 1 attempt; `#practice` hash form also works.
  Zero page errors throughout. Deployed to /golf.

- **CS139 — TOURTRACE graphics overhaul: visible putting, unskewed projection, richer art.** Owner: "the
  putting is a little hard to see the tap-in putts, and the angle of the course and ball flight gets a
  little skewed sometimes. It also looks a little too code-drawn." Three coordinated fixes to the CS136
  hole-view module (all presentation — the sim and the structured shot data are untouched):
  • **Putting you can actually see.** The green close-up camera is now ADAPTIVE (`hvCamFor`): it frames
    the ball AND the cup with a margin, zooming as tight as the putt allows (92-wide viewBox floor vs the
    old fixed 132) — a tap-in gets a much closer camera than a 40-footer. Putt/leave distances have a
    SCREEN-AWARE minimum (`2.4/g.vy` yds, since vertical yards compress on long holes) so a 1-ft tap-in
    now visibly travels ~11+ display px instead of ~3. The roll WAITS for the camera tween to arrive
    (`waitMs` in hvKick) — previously a short putt was already in the cup mid-tween. A real cup (dark
    ellipse + rim) is drawn at the pin so putts fall INTO something, the hole-out sink pulse is bigger and
    slower (560ms, r→9), and `hvShotMs` putt/hole buffers grew to cover the camera wait + sink.
  • **Skew fixed.** Lateral projection scale is no longer a fixed 3.0: `g.sx=clamp(g.vy*2.6, 1.8, 3.2)`
    follows the hole's vertical scale, cutting a 585-yd par 5's lateral-vs-downrange exaggeration from
    ~4.7x to ~2.8x (par 4 ~2.6x, par 3 ~1.5x). The perspective taper eased 0.32→0.26. Flight-curve control
    points are now computed in SCREEN space perpendicular to the shot line and capped at 22% of its length
    (`hvCtrl`) — course-space control points warped under the taper near the top of the frame, which was
    the "skewed/kinked ball flight". Hazard ellipses use `g.ry` (floored) so bunkers/water never pancake.
  • **Richer art (still 100% deterministic inline SVG, no filters, no perf cost).** Gradients everywhere:
    radial green/sand/water/ball, fairway + background linear, plus a soft vignette. Trees are layered
    canopies (cast shadow + two crown layers + lit highlight) instead of flat blobs. Bunkers get a cast
    shadow, sand gradient and an inner lip. Water gets a shoreline stroke + wave glints. The green complex
    gets a drop shadow, fringe ring, clipped mow bands and a highlight. Rough is textured with 64 seeded
    grass flecks. Tee box gains gold tee markers; the pin is a waving flag with a pole shadow; the ball is
    gradient-shaded; a touchdown "puff" ring fires where a full shot lands; shot markers carry drop
    shadows. Also fixed: under the close-up, ANY marker inside the camera box now draws to scale (`inCam`
    in hvNode) — fringe/collar/greenside rests aren't flagged onGreen and used to render huge when zoomed;
    and reduced-motion users now get the correct final camera (setFinal snaps the viewBox).
  Verified in Playwright: geometry anisotropy bounds across par 3/4/5, tap-in travel ≥10 display px with a
  tighter-than-140 camera, all new terrain layers present per hole type, a live round mid-flight (ball
  aloft + gradient fill + tracer revealing), the green close-up + hole-out captured on screenshots, a full
  practice round finishing clean, reduced-motion (camera snapped, holed ball sunk), and the CS138
  practice-mode suite re-run green. Zero page errors. Deployed to /golf.

- **CS140 — TOURTRACE: backwards-putt fix, organic course shapes, per-course biomes.** Owner: "my player
  putt the ball backwards away from the hole. That should never happen. Also... greens, bunkers, and other
  hazards shouldn't be geometric shapes... I also want to incorporate different biomes to the courses."
  (Owner also has a reference app for the art style — screenshots to come; this is the foundation to
  restyle against.)
  • **Backwards putt (real bug, introduced by CS139's tap-in visibility minimum):** the screen-aware
    minimum leave distance could EXCEED the ball's remaining distance to the hole, drawing a missed putt
    rolling AWAY from the cup. Fixed in `hvPlots`: a missed putt's drawn leave is capped at 80% of the
    current distance (always ends closer), and if the narrative's next leave is genuinely longer than the
    remaining distance, the putt is drawn running THROUGH the hole (`past`) — physically the only way that
    happens. Property-tested: 434 real engine-generated putts across 20 courses × 9 holes × 3 attempts,
    zero same-side-and-farther results.
  • **Organic shapes:** new `hvBlobD(cx,cy,rx,ry,seed,irr,pts)` — a seeded, smoothly-perturbed closed
    curve (Catmull-Rom → cubic beziers). Same seed → same perturbation, so the fringe ring, green shadow
    and bunker lips are parallel outlines of their parent shape. Greens (irr .09), bunkers (irr .22,
    kidney-ish) and water hazards (irr .24) are all blobs now; the mow-band clip uses the green's blob.
  • **Biomes (`HV_BIOMES` + `HV_COURSE_BIOME`, keyed by INTERNAL course keys, display names never):**
    parkland (default — the existing look), **links** (olive windswept palette, dune mounds + gorse tufts
    with gold bloom instead of trees, pale fescue-edged fairway, pot bunkers at 0.62 scale with a heavier
    lip — St Andrews/Troon/Carnoustie/Portrush/Turnberry/Shinnecock/Whistling Straits keys), **coastal**
    (an ocean band down one side with a wobbled foam shoreline + wave glints, tall lean cypress — Pebble/
    Torrey/Kiawah/Olympic Club keys; flora never spawns in the sea), **desert** (dark scrub-brown surround
    so the green fairway pops, saguaro cacti with arms, sparser flora — TPC Scottsdale key), **tropical**
    (saturated greens, leaning palms with 6-frond crowns — Kapalua/Waialae/Sawgrass/Bay Hill/Harbour Town
    keys). Every palette keeps the dark broadcast frame; `hvBiome(courseKey)` falls back to parkland for
    unmapped keys. Wired through `hvNode` for both the Daily and the H2H watch (same course keys).
  Verified in Playwright: the putt property test above; per-biome markup assertions (dunes+gorse, ocean
  gradient+foam, cactus+desert bg, palm strokes, parkland canopy, greens emitted as blob paths not
  ellipses); screenshots of all 5 biomes; a live practice round on today's course plays clean end-to-end;
  the full CS139 graphics suite + CS138 practice suite re-run green. Zero page errors. Deployed to /golf.
  NEXT: owner to share the reference app's screenshots — restyle palettes/details to match.

- **CS141 — TOURTRACE one-window HUD + full daylight "retro videogame" restyle (owner's Pixel-Pro-style
  reference).** Owner sent an H2H watch screenshot ("combine these 3 elements into one window... the
  scoreboard could be in the top corner of the tracer view with a transparent background... one clear
  precise shot description that shuffles to the next as the shots simulate... I do not like whatever
  scenery this is around the golf course [links dune mounds reading as brown blobs]... make it all look a
  lot more realistic, like a retro videogame") plus two reference screenshots of a pixel-art golf game
  (bright daylight, dense forest walls, chunky flat colors, dark UI chips floating on the course).
  • **One-window H2H watch.** `hvNode` now wraps the SVG in a positioned `.hvshell`; during play,
    `scrH2HWatch` renders ONLY the tracer with translucent chips floating on it: hole info top-left
    (`.hvhole` — HOLE n · PAR p · yyy Y), live standings top-right (`.hvboard` — rank/name/to-par per
    unit, your row gold-ringed, "THRU n · N HOLES" caption), and ONE shot description bar at the bottom
    (`.hvdesc` — the currently-animating shot's narrative `s.d`, swapping with each reveal, replacing the
    redundant cumulative shot log; `dShotPanel` no longer renders during H2H play). Between holes /
    playoff / final, the full standings board + playoff rows + result render as before. The daily round's
    own layout is untouched.
  • **Daylight retro restyle (the whole hole view, all biomes).** `HV_BIOMES` rebuilt as bright,
    flat-color palettes: mid-green rough base covered in seeded "v" tick grass texture, lighter fairway
    with a first-cut ring + chunky dark edge, lightest tick-textured green with a fringe ring, white
    speckled sand with outlines, vivid blue water with a mud-bank shore + ripple dashes (ocean shoreline
    same treatment), classic RED flag, no more gradients/vignette (only the ball keeps its gradient).
    Parkland/coastal grow DENSE FOREST WALLS tee-to-green and behind the green — clustered two-tone
    canopies with dark outlines and cast shadows, ~22% autumn-colored trees, occasional birch trunks —
    with keep-out zones for green/water/ocean (`clear()`); tropical gets palm groves via the same wall
    placement; links dunes were redrawn as grassy marram hummocks (blob body + lit crest + exposed sand
    pocket + grass-tuft strokes + gorse with gold bloom) instead of the brown-blob mounds the owner
    flagged; desert keeps sparse saguaros on a tan scrub base so the fairway pops. Done-shot traces and
    penalty lines darkened to read on the bright course.
  Verified in Playwright: putt-monotonicity property re-run (0 backwards), 12 markup assertions per biome
  (flat fills, tick counts, forest density, mud bank, red flag, sand speckles, dunes/gorse, cacti, palms),
  screenshots of all 5 biomes + the one-window H2H watch (overlay board rows, your row marked, desc text
  exactly the current shot's narrative and swapping on the next reveal, zero `.shotpanel`s during play,
  no duplicate standings section), the between-holes/final standings branch, and a full live daily round.
  Zero page errors. Deployed to /golf.

- **CS142 — Multi-ball H2H broadcast: every player's tracer, real playing order, smaller balls on the
  green.** Owner: "make it so the users see both ball tracers... assigned either red or blue... player
  one tees off, player 2 tees off, and then the player furthest from the hole goes next until both have
  completed the hole... balls should get smaller when it zooms into the green"; follow-up: "For 4 player
  free for all, there should be 4 colors: red blue cyan and yellow."
  • **Every unit's ball on one map.** `h2hBuildPlay()` replaces the old single-focus `h2hBuildFocus`:
    each UNIT (player in 1v1/FFA; team ball in Best Ball/Scramble via the combined skills) gets its own
    deterministic `dShotSeq` expansion of its actual hole scores (seed + build hash + unit id, so both
    clients watch the identical broadcast and identical builds can't produce overlapping sequences).
  • **Real "away plays first" order.** Everyone tees off in seat order, then whoever is farthest from the
    hole (`h2hRemOf`: yards left, or feet/3 on the green) plays next until every ball is in. The merged
    per-hole `order` drives the watch (`S.h2h.wStep` replaces `wShot`), each step paced by that shot's own
    `hvShotMs`.
  • **Ball colors:** YOU are always blue; opponents take red, then cyan, then yellow (`H2H_BALL_COLS`) —
    2 colors in 1v1/team modes, 4 in FFA. Colors thread through everything: tracer glow + roll line, ball
    ring, shot markers, the sink pulse, a color dot per row on the floating standings, the player-name
    chip on the stat strip, and the name prefix on the one-line shot description (which now swaps to
    whoever is playing).
  • **hvNode `multi` mode** ({shots, order, cols, names}) renders all units' done shots (dim, in their
    colors) + the current step live; `hvKick`/`hvCamFor` were refactored to operate on a PLOT (not an
    index) so any player's ball can drive the camera; the daily's single-ball path uses the same refactor.
  • **Balls shrink on the green close-up:** `bScale()` reads the live viewBox every animation frame, so as
    the camera zooms in the ball scales down (r 3.2 → ~1.3–2.0 viewBox units, sink pulse scaled to match)
    instead of swallowing the green; the live-shot markup also starts small under the close-up camera.
  Verified in Playwright: order property across 1v1 AND 4-player FFA on all 9 holes (tee shots in seat
  order; at every subsequent step the picked unit's remaining distance ≥ every other unit still playing;
  every shot appears exactly once, per-unit indices strictly increasing); color assignment exact
  (blue/red, blue/red/cyan/yellow); a mid-hole 1v1 render shows BOTH tracers + 2 board dots + the correct
  player chip and description name; FFA shows all 4 colors + 4 rows; skip-to-result works; the ball reads
  r=2 during a real green close-up putt; the daily single-ball round regresses clean end-to-end. Zero
  page errors. Deployed to /golf. Screenshots (mb_1v1/mb_ffa) sent to owner.
  NEXT (owner): custom hole shapes — all holes currently share the ribbon template; design a per-hole
  geometry spec (dogleg severity/direction, split fairways, forced carries, island/peninsula greens, green
  orientation, hazard placement) driven per-course from the signature-hole data.

- **CS143 — custom hole shapes across all 39 courses (mimic real courses, never copy).** Owner: "variety
  across all 39 at once... mimic real courses as much as possible without copying them." Every hole was
  the same ribbon template; now geometry is driven by a per-course STYLE PROFILE + signature-hole
  features, all seeded (no rng, no tracing of real layouts):
  • **`HV_COURSE_STYLE` (all 39 courses):** knobs capturing how each real course famously plays — dogleg
    severity + famous turn direction (Augusta-analog sweeps left, Olympic-analog doglegs hard, St
    Andrews-analog nearly straight), fairway width (Kapalua-analog 1.6x vs Olympic/Harbour Town 0.7-0.75x),
    green size (St Andrews-analog 1.5x doubles vs Harbour Town-analog 0.62x smallest on tour), bunker
    density (Whistling-analog 1.9x / Oakmont-analog 1.8x vs Kapalua 0.6x), water/creek frequency (Sawgrass
    0.42 / Southwind 0.38 vs Oakmont/Winged Foot/Shinnecock 0), and double-dogleg tendency on par 5s.
  • **Signature features forced into the geometry:** `hvFeat` merges the existing `DSIG_HAZ` (16 courses)
    with `HV_SIG_EXTRA` (10 more famous holes) — island → a TRUE island green (green blob inside a big
    pond, no sand ring), water-front/green → pond guarding the green, water-l/r + cliff → lateral water,
    creek → a crossing stream. The Sawgrass-analog 17th is an island, the Augusta-analog Amen-corner holes
    have their ponds, the Carnoustie-analog 17/18 get the burn.
  • **New geometry capabilities in `hvGeom(seedN,par,yds,courseKey,holeIdx)`:** S-shaped double doglegs on
    par 5s; a fairway WIDTH PROFILE `g.fww(y)` with seeded landing-zone pinches on tight tracks; greens
    tucked left/right of the fairway line (`g.gcx`, clamped in frame); PERSISTENT water + creeks (drawn
    whether or not a ball finds them — previously water only existed where a ball drowned); style-scaled
    greenside (1-3) + fairway (0-2) bunkers that never spawn inside water/creeks.
  • **Renderer/plots wiring:** the terrain samples the width profile, draws creeks as wobbled mud-banked
    streams crossing the whole hole, keeps flora out of creeks, and centers the green complex on `g.gcx`;
    `hvPlots` snaps a drowned ball to the spec'd water/creek (its invented-pond fallback only fires when a
    hole has neither) and lands greenside scatter around the offset green.
  Verified in Playwright across ALL 39 courses × 18 holes (702 holes): zero out-of-frame greens/water;
  Sawgrass-17 island + Augusta-12 pond + Carnoustie-18 burn assertions; course-character separations
  (Sawgrass ≥5 water holes vs Oakmont/Winged Foot 0; St Andrews greens ~2x Harbour Town; Kapalua fairways
  ~1.7x Olympic; Oakmont/Whistling bunker counts ≫ Kapalua; Olympic dogleg magnitude ≫ St Andrews;
  Southwind ≥4 water holes); within-course bend variety (13 distinct magnitudes over 14 non-par-3 holes,
  both directions); the putt-monotonicity property re-run over the new geometry (106 putts, 0 backwards);
  showcase screenshots (island 17, Amen-corner pond, burn 18, wide Kapalua, tight Harbour Town, coastal
  Olympic dogleg); a full live daily round regresses clean. Zero page errors. Deployed to /golf.

- **CS144 — Career MOMENTS: jump in and play the final round when you're in contention.** Owner: "add
  moments into career mode... if they are in contention in a major or a tournament, to jump in and watch
  the rest of the round... only on the final day of tournaments, and a pop up should appear explaining the
  moment, and asking the user if they want to play or sim. If they play, they will go into the hole by hole
  simulation and have decisions on shots like they would in daily challenge mode."
  • **Trigger.** After round 3 of any career stroke-play event (majors, signature, playoffs, regular — not
    the Games/team cups, which keep their own set pieces), `momentInfo(ce)` checks whether you're genuinely
    in contention, with looser thresholds the bigger the stage: MAJOR gap ≤5 & pos ≤10 · BIG/signature/
    playoff gap ≤3 & pos ≤6 · regular gap ≤2 & pos ≤3. Requires you made the cut. Fires only in the
    INTERACTIVE season loop (`scrSeason`, once per event via `ce._momentAsked`) — skip-to-end, headless
    sims, elimination fast-forwards and `simNextRound` itself never pause, so Auto Sim's "hands-off"
    promise and every existing test path are untouched.
  • **The popup** (`momentPopup`, full-screen `.momentov` overlay): red 🔥 THE MOMENT tag, the event name,
    a situation line ("Sunday. The final round of a MAJOR. You sit T2, 2 back of Keegan Bradley with 18
    holes to play."), and two buttons — "⛳ Play the final round · Hole by hole, every decision is yours"
    (gold) or "Sim the round ▸" (ghost, resumes the scheduler exactly as before).
  • **Playing it** (`startMomentRound`) borrows the entire Daily Challenge round engine WITHOUT touching
    the Daily: your CAREER build's live skills (incl. caddie base boosts) become `S.dailySkills`, the venue
    comes from `momentCourseKey` (EVENT_COURSE references DAILY_COURSES objects by identity → the real
    mapped venue for 28 events, e.g. The Magnolia Invitational plays at the Augusta-analog; unmapped events
    get a deterministic stand-in course), conditions are seeded from the event name, and you get the full
    hole-by-hole flow — TOURTRACE tracer, shot-by-shot reveal, signature-hole Attack/Safe decisions —
    re-skinned with a red "🔥 THE MOMENT · Final round · {course} · {cond}" tag and a gold standings line
    instead of the tour-average target. No mulligan (it's tournament golf). `S.moment` carries the event;
    `S.daily` stays false; `S.dailyClaimed=true` so the borrowed plumbing can never touch attempts/records.
  • **Fairness calibration:** playing must carry the same EXPECTED score as simming — your edge comes from
    the decisions, not from switching engines. `startMomentRound` estimates both engines' means for YOUR
    build at THIS event (240 `simRound` draws vs 50 × 18-hole daily sims) and spreads the gap across the 18
    holes as pin difficulty (`shift`, NaN-guarded). Verified: shifted daily mean lands within ~0.9 strokes
    of the sim mean (tolerance 1.2) — same expectation, human variance.
  • **Feeding it back** (`finishMomentRound`, routed as the FIRST branch of `finishDailyRound`): your
    played 18-hole total becomes your round-4 score, the field sims theirs with the normal engine,
    `finalizeEvent()` runs — so playoffs, win celebrations, money, OWGR, achievements and headlines all
    flow exactly as if the engine had produced your round. `ce._momentHoles/_momentTotal` are kept on the
    event for posterity. All borrowed daily state is cleared; a safety bail covers the state having moved
    on underneath.
  • **Hardening (this round):** `finishDailyRound` now also refuses to run on an EMPTY round (a stray
    second call after a Moment cleaned up could previously have written a garbage 0-hole daily result);
    the calibration shift is `isFinite`-guarded.
  • Verified in Playwright (hv7_test): threshold unit checks (all 7 cases), event→course mapping (mapped +
    stand-in), popup fires on a rigged contention Sunday with correct copy, SIM path resumes and completes
    with no re-ask, PLAY path enters `dailyround` with `S.moment` set / daily isolated / re-skinned header,
    the full auto-finished round feeds rounds[3] (= `_momentTotal`), finalizes the event and lands back on
    the season leaderboard with Daily storage byte-identical, calibration sanity within tolerance, headless
    loops never popup, and the practice-mode daily regression still passes. Zero page errors. NOTE: an
    earlier test failure ("+54 round") was a TEST-FIXTURE bug (slots seeded as `{v:}` instead of
    `{value:}` → NaN skills → every hole clamps to +3 = 54), not a game bug — the NaN guards above were
    added as insurance anyway. Deployed to /golf.

- **CS145 — Daily Challenge + Moments get the H2H one-window broadcast (full immersion).** Owner: "The
  daily challenge and the moments should have the same style simulation as the online head to head. The
  courses, holes, tour tracer, etc... fully immersed... No more boring simulation." The engine was already
  shared (same courses, CS143 custom holes, biomes, TOURTRACE tracer); what the daily lacked was the H2H's
  ONE-WINDOW presentation — the tracer as the whole stage with the HUD floating on it, instead of a tracer
  embedded in a text-heavy page. `scrDailyRound` (which also serves Moments, Monthly Spotlight and Legend
  Token rounds) now renders the same `.hvob` overlay chips as `scrH2HWatch`:
  • **Hole chip** top-left: `HOLE n · PAR p · yyyY`.
  • **Floating scoreboard** top-right — the Daily is now framed as a live MATCH: a `YOU` row (blue dot,
    gold-ringed) vs a `TOUR PRO` row (red dot) showing the pro's pace through the same holes, ranked by
    score, caption `THRU n · TARGET {avg}`. In a **Moment**, the board is the REAL tournament leaderboard
    (top 3 + you, from `S.curEvt`), with your projected total (start-of-day + holes played so far) moving
    through it live as you play — caption `FINAL ROUND · THRU n`. Legend Token rounds show the legend's
    name on the YOU row.
  • **One shot description bar** at the bottom (`.hvdesc`) that swaps as the shots simulate ("YOU · Driver
    309 yds to the fairway, 72 yds to hole"), replacing the cumulative shot-log dump during play.
  • **De-cluttered flight state:** while the ball is in the air, the big score line, the "Tour average…
    beat it to win" line, the "New to golf?" card and the shot-log panel are all hidden (the window
    carries all of it); they return between holes, where the decision prompts / controls live as before.
    The redundant "⛳ Shot N…" text line is gone (the window's stat strip already shows SHOT n · LIVE).
  • **Window is the star:** the tracer now sits directly under the course tag, with the 18-cell scorecard
    strip moved BELOW it (tap-to-replay unchanged; replays show the hole chip + the existing REPLAY tag).
  No sim/engine/pacing changes — presentation only; H2H itself untouched. Verified in Playwright
  (hv8_test): daily reveal shows hole chip, 2-row YOU/TOUR PRO board (your row highlighted), desc bar
  matching the current shot's narrative, zero shot-log panels and no score/pace text during flight, window
  above the strip; hole lands → board advances to THRU 1, chrome + panel return, desc clears; full
  practice round completes; a Moment's board shows the real 4-row leaderboard with YOU ranked correctly
  and the finish still feeds rounds[3]/finalizes; hv7 (Moments), hv5 (multi-ball H2H) and the practice
  suite all re-run green. Zero page errors. Deployed to /golf.

- **CS146 — wider TOURTRACE frame: full-bleed on phones + painted side margins + green-aware
  scoreboard.** Owner (screenshot): "Notice how the scoreboard is blocking the golf course. Lets keep the
  top edge where it is but expand the golf course tracer view to the extents of whatever mobile device so
  we have more room to place the scoreboard and other elements." Three coordinated changes (Daily, Moments,
  Spotlight, Legend rounds AND the H2H watch — they all share hvNode):
  • **Painted side margins.** New `HV_EX=52` extends the SCENE 52 viewBox px beyond the course on each
    side, and the full-hole camera (`HV_CAM=[-52,0,464,470]`, replacing every `[0,0,360,470]`) shows it.
    `hvTerrain` paints the wider frame: base rough + grass ticks span the full width, coastal ocean runs
    to the new edge (ripples included), forest/palm walls grow INTO the margins (wider offset range,
    denser rows), links dunes / desert saguaros scatter wider, creeks cross the whole widened frame. The
    HUD chips now float over scenery instead of the hole.
  • **Full-bleed on phones.** `@media(max-width:700px)`: `.holeview` breaks out of the content column to
    span the device edge-to-edge (`width:100vw` + negative side margins, square corners, side borders
    dropped, safe-area padding on the brand/stat strips). Desktop keeps the centered card (max-width 470).
    CSS `aspect-ratio` updated 360/470 → 464/470 (kept in sync with HV_EX by a comment at the const).
  • **Green-aware scoreboard.** When a hole's green is tucked RIGHT (`g.gcx` projected right of centre),
    the floating scoreboard flips to the LEFT corner and the hole chip to the right (`.hvboard.left` /
    `.hvhole.right`), so the board can never sit on the green complex — in both scrDailyRound and
    scrH2HWatch. The putt close-up camera (`hvCamFor2`) now frames at the new on-screen aspect
    ((HV_W+2·EX)/HV_H) with clamps widened to the margin, so nothing gets sliced.
  Verified in Playwright: default viewBox `-52 0 464 470`; window rect spans the full 430px viewport
  edge-to-edge (left 0); coastal ocean paints to the frame edge; board flipped left on tucked-right greens
  in both a Daily and a Moment (screenshots: green fully visible, chips over trees/sea); putt close-up
  frames ball+cup at the new aspect; desktop renders the centered 470px card; hv8 (one-window HUD), hv5
  (multi-ball H2H), hv6 (39-course geometry + putt property) and the practice suite all re-run green, zero
  page errors. NOTE: hv3/hv4 scratch suites were found already broken on the PRIOR commit — they poke
  CS141-era internals removed in CS142 (`focusHoles`/`h2hBuildFocus`) — superseded by hv5/hv6/hv8, not a
  regression. Deployed to /golf.

- **CS147 — next-hole info + decisions moved to the TOP of the round screen.** Owner (screenshot with
  arrows): "I want to move all of the moment and decision information and the decisions to the top. The
  user on mobile currently has no idea it comes up." Between holes, the next-hole card (hole · par ·
  yards · signature note), the signature-hole scenario card and the two decision buttons — plus the manual
  "Play hole N ▸ / Resume auto-play" and paused-auto controls — used to render BELOW the tracer window,
  shot log and scorecard strip, i.e. below the fold on a phone: when auto-play paused for a decision,
  nothing visible changed. That whole block now renders at the TOP of `scrDailyRound`, directly under the
  score header, with the tracer window (showing the finished previous hole) beneath it. Utility actions
  (Mulligan, Skip to the end) stay at the bottom. Applies to the Daily, Moments, Spotlight and Legend
  rounds alike. Verified in Playwright on a 430×930 viewport: at the first signature-hole pause the
  scenario + both choice buttons are fully visible with NO scrolling (choice top 707px < 930), above the
  window in DOM order; after deciding, the next hole's action (another decision, or the Play-hole button
  when paused) also renders on top; mulligan/skip stay below; a full practice round still completes; hv8
  (one-window HUD), hv7 (Moments) and the practice suite re-run green, zero page errors. Deployed to /golf.

- **CS148 — round pacing + declutter + auto-start (owner feedback on the immersive view).** Three asks:
  (1) "When the ball goes into the hole, it moves way too quickly to the next hole. The user doesn't have
  time to register what they did"; (2) "the text above the shot tracer view and at the bottom is
  redundant"; (3) "auto play should start automatically when a round is initiated ... the player [shouldn't
  have] to press a button to begin."
  • **Post-hole beat.** The auto-advance dwell went 650ms → **1900ms**, and the holed hole now holds on a
    RESULT banner (`S.dailyHolePause`): "Hole N · Par P · **Birdie** · Next hole coming up…" — so you
    actually register the score before the next tee shot fires. The next-hole decision block is suppressed
    during the beat. Manual mode is unaffected (you control the pace). Applies to Daily/Moments/Spotlight/
    Legend.
  • **De-duplicated chrome (redundant text).** The floating on-course scoreboard already shows your total +
    pace and the on-course description bar already narrates the current shot, so: the **broadcast stat
    strip above the tracer** (SHOT n · yds · ball speed · apex) is removed from hvNode (both single- and
    multi-ball, so H2H benefits too — it keeps its own player-named desc bar), and the **standalone big
    score/"Tour average" header** now only renders when the window isn't showing it (before the first tee,
    or while reviewing a past hole). Net: during play it's just the course tag → the window (hole chip +
    scoreboard + one shot-description bar) → scorecard strip. One readout each, nothing doubled.
  • **Auto-start.** `beginDailyRound` / `beginDailyRoundWithLegend` / `startMomentRound` now set
    `S.dailyAuto=true`; the round plays itself the moment you enter it (first tee fires ~450ms in), pausing
    only for signature-hole decisions. Pause/Resume + Skip still available. (Spotlight flows through
    `beginDailyRound`, so it inherits it.)
  Verified in Playwright: auto-play ON at start and hole 1 auto-tees with no click; the stat strip is gone
  (0) while the on-course desc bar (1) + floating board (1) remain; the redundant score/pace header is gone
  while the board is present; the post-hole result banner holds for the dwell then auto-advances to the
  next hole; a full practice round self-completes; hv8/hv7/hv5/hv10/practice suites all re-run green, zero
  page errors. Screenshots: clean flight view + "Birdie · Next hole coming up…" beat. Deployed to /golf.

- **CS149 — title layout: Play Online above the primary button + "Career Mode" rename.** Owner
  (screenshot): move the Play Online block on top of the yellow primary button, and rename that button from
  "Step to the Tee Box" to "Career Mode" with a brief description. Done: the `.online-home` block (1v1 /
  Foursomes) now renders inside the primary stack directly ABOVE the gold button (was appended after the
  whole stack); the gold button reads **"Career Mode"** with sub "Draft your golfer, play a 30-year
  career" (or "Start a new golfer, play a fresh 30-year career" when a career/resume already exists). Daily
  Challenge, countdown, streak and Spotlight stay below it, unchanged. Verified in Playwright (430px): the
  online block precedes the Career button which precedes Daily; button renamed; block not duplicated; both
  online entry points intact; screenshot confirms the order. Deployed to /golf.

- **CS150 — fixed two conflicting "resume" buttons on the title.** Owner (screenshot): saw both "Resume
  Career Mode" (Year 1 · mid-season · Coby Selly) AND "Resume Your Golfer" (8/8 skills drafted) stacked
  together — "How do I have 2 resume buttons with 2 different options?" They're two unrelated persistence
  mechanisms: `careerSaveInfo()` (`bag_careersave` — an actual in-progress CAREER) and `resumeInfo()`
  (`bag_resume` — a stale, half-finished free-play DRAFT snapshot that was never taken into a season).
  When a career save exists, the draft-resume is redundant and confusing (tapping it would just begin
  ANOTHER golfer — exactly what the "Career Mode · Start a new golfer" button below already does). Fix:
  "Resume Your Golfer" now only renders when there's no career save (`if(ri && !cs)`); with a career it's
  hidden, so exactly one resume path shows. A draft-only state (no career) is unchanged — the draft-resume
  still appears. Verified in Playwright: both-present → only "Resume Career Mode" (draft-resume count 0);
  draft-only → "Resume Your Golfer" still shows. Deployed to /golf.

- **CS151 — per-tier text effect on the leaderboard Tour Rep name.** Owner: "I want every tier to have a
  different text effect. Just the tier name." The tier chip beside each username (·  Champion / Star / …)
  used to be a flat gold label for every rank. Now each of the 8 shown tiers has its own effect via CSS
  classes (`.rept-*`), flashier as you climb: Journeyman grey → Tour Pro teal → Contender bronze → Star
  brushed-silver gradient → Champion polished-gold gradient → Legend violet glow → Icon molten-gold
  shimmer (animated) → G.O.A.T. prismatic rainbow shimmer (animated). New `repClass(name)` maps the tier
  name (emoji-stripped) to its class; `lbRep` now returns the raw tier name and `lbRowHTML` applies the
  class (the "·" separator kept neutral). Animations respect `prefers-reduced-motion`. Verified in
  Playwright: all 8 tiers resolve to distinct `.rept-*` classes and render with no page errors;
  screenshot confirms the eight looks. Deployed to /golf.

- **CS152 — two tester bugs: stuck career draft + shot narrative matching the decision.**
  1. **Stuck draft (Jordo: "it's saying I drafted my team, that's my daily challenge team… won't let me
     advance, it's stuck").** Root cause: the Daily Challenge path calls `reset()` before its draft, but the
     title **"Career Mode"** button only did `S.screen='setup'` with no reset. So after playing a Daily
     (which fills all 8 skill slots), starting a career draft inherited the daily team at 8/8 with re-spins
     spent — the draft screen showed a revealed golfer over a full board and could never advance. Fix: the
     Career Mode button now calls `reset()` first (clears slots/reSpins/revealed/drawRng/daily flag), so a
     fresh career always starts from an empty draft. Belt-and-suspenders: `scrDraft` now self-heals — if it
     ever renders with a full 8/8 board (not mid-spin), it routes straight to the build screen instead of
     stranding. Verified: a simulated finished-daily state (8/8, 0 re-spins) → tapping Career Mode resets to
     0/8 with 2 re-spins and daily=false; a draft entered at 8/8 self-heals to `build`.
  2. **"Simulation after certain decisions doesn't align with the decision made."** The signature-hole
     Attack/Safe choice only affected the *tee club* in the shot narrative — the approach/pin line read
     identically whether you chose "fire at the pin" or "aim for the fat of the green," so the shots you
     watched didn't reflect your call. Fix: `dShotSeq` now threads the choice into the green-arrival shot
     (`greenDesc`): **attack** → "firing at the left/right flag" with a tighter proximity, **safe** → "to
     the middle of the green" with a longer first putt. Applied to both the par-3 tee-to-green and the
     par-4/5 approach. The SCORE is still 100% engine-decided (`dSimHole` untouched, verified deterministic)
     — only the narration is made consistent with the decision. Verified: same hole/score with opposite
     decisions now produces visibly different, on-message narratives; hv6/hv8/practice suites still green.
  Zero page errors. Deployed to /golf. (The "birdie putt → question → back to the start" report was the
  same class of issue on an older build; CS148's post-hole beat already stops a decision from co-appearing
  with a putt still rolling, and this reset fix removes the stuck-state entirely.)

- **CS153 — realistic hazard physics + approach-skill backspin in the tracer.** Owner (screenshot of a
  ball's roll line crossing the water): "the ball bounced on the water. This is impossible… it either has
  to land in the water, bounce before the water and land short, bounce before the water and roll in, or
  land over the water." Plus: "higher approach players should have more backspin… hit it closer to the
  pin." Root cause: `hvPlots` computed a full shot's LANDING point as a fixed roll-back from the rest
  (`rest − unit·roll`, up to ~25 course-units), so on a green fronted by water the landing fell IN the
  water and the ball then "bounced + rolled" across the surface onto the green. Fixes (hole-view geometry
  only — the deterministic `dSimHole` score is untouched, verified):
  • **Carry the hazard.** For any shot that ends ON the green (`p.onGreen`, k tee/app/chip), the landing is
    now forced onto the putting surface: roll is clamped so the touchdown never falls short of the green's
    front edge, and a final safety walks the landing forward off any fronting water body (island / edge
    greens land exactly on their rest spot, so the roll line never crosses open water). Water shots still
    splash at the water (that path was already correct); this only stops the impossible bounce-across.
  • **Backspin by approach skill.** `dShotSeq` now tags each green-arrival shot with a `spin` value from the
    relevant skill (approach for full shots, short-game for chips, low for a released drive) — and the
    roll-out is driven by it: a high-approach player zips it and checks it up quick (short roll, stops near
    the pin), a low-approach player releases and runs out. A very spinny attacking approach can even read
    "zips back toward the cup." Proximity to the pin already scaled with approach (CS152); this makes the
    ball's visible behaviour match. Verified over 1,404 green-landing shots across all 39 courses: **zero**
    land in the water, **zero** land short of the green, and elite-approach roll (2.4) is far shorter than
    weak-approach roll (6.1). Score determinism confirmed unchanged. hv6/hv8/practice/bugfix suites green,
    zero page errors; screenshot of a water-fronted par-3 shows the flight carrying the water and the ball
    resting on the green. Deployed to /golf.

- **CS154 — score never shows before the ball drops + prominent result flash + hole-outs, chip-ins,
  bunker hole-outs, aces.** Owner: "the score on the scoreboard shows before the ball goes in sometimes —
  this should never happen. When the shot goes in, the result (par/bogey/birdie/eagle) should come up on
  the screen before moving on. I want all types of shots possible — hole-outs from the fairway, chip-ins,
  bunker hole-outs, hole-in-ones (very rare)."
  1. **Score withheld until the ball is IN.** Bug: when the final (holed) shot was revealed, the scorecard
     + floating scoreboard updated immediately — while the ball's sink animation was still playing. Added a
     `S.dailySinking` state: the last shot reveals, the ball drops, and only when its animation completes is
     the score committed. `revealing` now includes the sinking phase, so the scorecard cell stays "·" and
     the board caption stays "THRU n-1 / TARGET" until the ball is actually in the cup. Verified: board
     shows THRU 0 while sinking, flips to THRU 1 the instant the ball drops.
  2. **Prominent result flash.** The post-hole beat (CS148) is now a big, colored, animated card that pops
     in AFTER the ball drops: the result name huge (BIRDIE / PAR / BOGEY / EAGLE / ⛳ HOLE-IN-ONE!), the
     score (`3 (−1)`), attack/safe tag, a one-line flavor ("Birdie — nicely done", "Holed out — what a
     shot!"), before the next tee. `.reflash` pop animation, reduced-motion safe.
  3. **New shot types.** `dSimHole` now lets a would-be par-3 double-eagle become a genuine **hole-in-one**
     (~12% of an already-rare −2 draw → ~0.04% overall ace rate, seeded/deterministic). `dShotSeq` renders
     the ace (tee shot into the cup) and, for one-putt finishes, rarely converts the tap-in into a **shot
     HOLED from just off the green** — a chip-in, a holed bunker shot, or a pitch-in — skill-weighted (good
     short game / approach → more hole-outs). Crucially this preserves the stroke count exactly (the
     approach lands just off the green, the finishing stroke drops — same number of shots), so the score
     engine is untouched. The result flash + shot log call these out ("chips it in!", "holes the bunker
     shot!", "Hole-in-One!"). Verified over 7,560 par/score/skill combos: **shot count === stroke count in
     every case** (the hard invariant), aces occur but stay rare (0.04%), hole-outs generate, and a full
     round still completes. hv6/hv8/physics/practice suites green, zero page errors. Deployed to /golf.

- **CS155 — every stat now visibly drives its own part of the shot simulation.** Owner: "The approach
  logic should be applied to all stats. Higher driver power should result in longer drives, higher putting
  should increase the likelihood of longer putts and less 3 putts, etc." Extended the CS152–154 treatment
  (approach → proximity/backspin) to the whole bag, in `dShotSeq`'s narrative + hole-view physics (the
  deterministic `dSimHole` score engine is untouched — verified, shot count === stroke count invariant
  re-run at 6,300 combos with 0 mismatches):
  • **Driving Distance** — drive length now scales hard with the stat: weak (62) averages ~272 yds, elite
    (97) ~334, and a true bomber (distQ>0.8) occasionally steps on one for an extra 8–18. Was a ±50-yd
    band; now ~±62 with the elite tail.
  • **Putting** — three levers: (1) the extra strokes on over-par holes are attributed to the flat stick
    FAR less often for elite putters (3-putt attribution on a double: elite 0.5% vs weak 91%); (2) a par
    save's one-putt conversion now includes Putting (a save = chip + MADE putt), not just Scrambling; (3)
    an elite putter's made birdie putts start deeper (avg 17.7 ft vs 14.0 — they drain longer ones), and
    any make from 17+ ft is narrated "Drains it from N ft!".
  • **Bunker / Short Game / Scrambling** — recoveries are now LIE-AWARE: a greenside/fairway-bunker shot
    leans on Bunker skill (65/35 with Short Game) and narrates "splashes out of the bunker to X ft";
    a fringe/collar chip is pure Short Game; a rough chip is Short Game + Scrambling. Elite bunker play
    splashes to ~21 ft vs weak ~28 (and feeds the CS154 hole-out chance via the same quality).
  • Driving Accuracy (fairway % + bad-lie severity) and Approach (proximity/backspin/attack-safe) were
    already wired from earlier passes; unchanged.
  Verified via a per-stat property suite (each lever moves in the right direction with only that stat
  varied) + the full physics/shots/geometry/practice/one-window regressions, zero page errors. Deployed
  to /golf.

- **CS156 — fix: Daily round "stalled on hole 3, didn't see any choice" (regression from CS154).** Tester
  (Jared): the auto-playing daily round froze on a hole with no visible decision; he had to pause and skip
  to the end to see his result. Root cause: CS154's sink-wait made the ball's final render happen in the
  "sinking" (revealing) state, which correctly hides the decision/result. But `scheduleDailyAdvance`'s
  **signature-hole branch** (`if(nextDailySig()) return`) returned WITHOUT calling `render()` — so when
  auto-play advanced INTO a signature hole, the last frame on screen was the sunk ball with no decision
  card, and nothing re-rendered to show the Attack/Safe choice. The round looked stalled (it was actually
  waiting for a click on a card that never drew). Every other branch of `scheduleDailyAdvance` already
  renders; this one didn't (it worked before CS154 because the preceding reveal render showed the
  non-revealing state). Fix: the signature branch now clears `dailySinking` and calls `render()` before
  returning, so the decision appears the moment the round reaches a signature hole. Verified in Playwright:
  auto-playing into a signature hole shows the 2 choice buttons + scenario (no decision shown during the
  sink), choosing plays the hole, and a full auto round completes with no stall; hv8/hv10/practice green.
  Deployed to /golf.

- **CS157 — round-screen redesign: result pill on the tracer, taller window, shot-by-shot rewatch +
  static share.** Owner (screenshot IMG_7864 of a Moment round): (1) the holed result "pushes everything
  on the screen around" — make it a big colored pill in the top-center of the tracer, between the current
  pills; (2) "the page shifts around so much... make the tour tracer bigger vertically and fit as much as
  we can onto it so it feels like one cohesive page"; (3) "all the shot descriptions come up for 1 second
  after the hole" — build a really good rewatch UX (go back to any hole, replay any shot) and, ideally,
  share a shot. Via AskUserQuestion the owner chose **static image share now, animated GIF as a
  fast-follow**. All changes are in `scrDailyRound` (shared by Daily / Moments / Spotlight / Legend) + the
  hole-view module; the sim/score engine is untouched.
  • **Result → floating pill on the tracer (no page shift).** Removed the big `.reflash` card that pushed
    the whole page down when a hole finished. The holed result now renders as a `.hvob hvresult` chip
    (BIRDIE / 5 (+1), colored by score, pop animation) floating top-center ON the window during the
    post-hole beat (`holePause`). To avoid colliding with the floating scoreboard on a phone (the top row
    is full — hole chip left, board right), the board is SUPPRESSED for the ~1.9s beat so the result pill
    is the clean focus; it returns the instant the next hole starts. (The pill uses its own `hvresPop`
    keyframe with `translateX(-50%)` baked in, since a bare `scale()` keyframe would drop the centering.)
  • **Taller tracer.** `HV_H` 470→560 (CSS aspect-ratio `464/470`→`464/560` kept in sync) — a noticeably
    taller window on both phone (full-bleed) and desktop, with more room for the HUD chips. The geometry
    scales with HV_H so every hole/biome stays in frame (re-verified by the hv6 39-course property test).
  • **Shot-by-shot rewatch (the "really Good" review UX).** Tapping any scorecard cell now opens REVIEW:
    it HOLDS the round (clears the reveal timers WITHOUT touching `S.dailyAuto`, so closing resumes exactly
    where it paused — no auto-flag tangles around signature decisions), suppresses the legend/score-header
    chrome, and shows a review panel ABOVE the window: "Reviewing Hole N · Par P · <result> · score", the
    SELECTED shot's full description (no more 1-second flash), a numbered **shot scrubber** (tap any shot
    to replay JUST that shot's animation in the window), a "▶ Replay shot N" button, "↗ Share this shot",
    and a "▶ Resume the round / ↩ Back" exit. Replay re-fires the animator via a new `animNonce` 6th param
    to `hvNode` (bumped each tap so the same shot re-animates). New state `S.dailyReviewShot` /
    `S.dailyReviewNonce`; helpers `dailyReviewOpen`/`dailyReviewShotN`/`dailyReviewClose`.
  • **Static-image share.** `hvStaticSVG(hole,courseKey,holeIdx)` builds a self-contained full-hole tracer
    SVG (terrain defs + every shot's flight line & marker); `hvShareShot(holeIdx)` rasterizes it to a 2.4×
    canvas with a titled bar (Hole · Par · score · RunTheTour) and shares via `navigator.share({files})` or
    a download fallback. (Animated GIF replay = the agreed fast-follow.)
  • Verified in Playwright (cs157): HV_H=560, result pill floats on the `.hvshell` (old `.reflash` gone),
    review holds the round + scrubber chip count == shot count + tapping a shot selects it, bumps the
    nonce, and shows its full description, close clears the state, `hvStaticSVG` produces a valid SVG that
    rasterizes (Image load), full practice round still completes; regressions hv6 (geometry, taller frame),
    hv8 (one-window HUD), hv5 (multi-ball H2H), hv7 (Moments), hv10, practice all green; screenshots
    confirm the centered BIRDIE pill + the review panel above the taller window. Deployed to /golf.

- **CS158 — Daily deep-research batch, Wave 1 of 2: Round Rating + streak salience + grade-forward
  share (recs #1–#3).** Owner greenlit building recs 1–5 from the daily-games deep research; split into
  two reviewable waves (Wave 1 = the Tier-1 items the rest lean on; Wave 2 = weekly goals + course
  passport). All client-side; the sim/score engine is untouched.
  • **#2 Round Rating (the wedge vs H2H).** New `dRoundGrade(holes,total,avg)` grades the SHAPE of the
    round on a golf-flavored S/A/B/C/D scale (Legendary/Brilliant/Clutch/Solid/Grinder), a pure function
    of the finished round (deterministic). Score = margin·7 (how far under the tour field) + style bonuses
    (birdie +3, eagle +9, ace +22, hole-out +5, bogey-free +12) − blow-ups (bogey −1.5, double+ −4), then
    thresholded to a tier; `RGRADES` table + tuned cutoffs. Returns a feats line ("6 birdies · bogey-free ·
    beat the field by 7.8"). Stored on `S.dailyResult.grade` (finishDailyRound + the PRACTICE branch);
    `gradeFromResult(r)` reads it or recomputes from holes for backfilled results. Rendered as the result
    hero — a colored `.gradecard` (big letter + label + "Round Rating" + blurb + feats) right under the
    score, giving the Daily its own "how you played" identity separate from the raw number / the ladder.
  • **#3 Grade-forward share.** `dailyShareText` now leads with the grade ("B · Clutch — 71 (E) on par
    71 · beat the pro ✓ · 🔥12") above the Wordle emoji grid, so a shared Daily result reads as a
    performance brag, not just a number.
  • **#1 Streak salience (loss aversion — the #1 documented retention lever).** New title-screen
    `.streakrisk` banner: when you have a live streak but HAVEN'T played today, a pulsing gold box reads
    "🔥 N-day streak on the line · Play today to keep it alive (a ❄️ freeze can bridge one miss) · resets
    in HH:MM:SS" (live countdown via the existing `dCd`). Once you've played today it collapses to the
    calmer "🔥 N-day daily streak going" line. `playedToday` = `bag_streak.last===todayKey()`. (A true
    push notification needs a service-worker push backend — owner-side — so this is the in-app salience
    piece, which is the documented high-leverage lever.)
  • Verified in Playwright (cs158): grade tiers (brilliant→S, rough→D, solid→C) + feats line; finish
    stores the grade, the result renders the grade card, share leads with it; at-risk banner shows with
    the countdown when a live streak is unplayed today and vanishes (→ calmer line) once played; practice/
    hv8/cs157 regressions green; screenshots confirm the S·Legendary card + the at-risk banner. Deployed
    to /golf. Wave 2 next: #4 weekly meta-goals + #5 course-mastery passport (will store best grade per
    course, so it builds on this grade). Tunable: `RGRADES` cutoffs / score weights in `dRoundGrade`.

- **CS159 — Daily deep-research batch, Wave 2 of 2: weekly meta-goals (#4) + Course Passport (#5).**
  The Daily's solo collection/progression layer (a loop the online H2H ladder doesn't have), building on
  CS158's Round Rating. Per-account, cloud-synced grow-only; sim/score engine untouched.
  • **#5 Course Passport.** `bag_coursemastery` tracks, per Daily course, your best score (lowest to-par),
    best Round Rating grade, plays and "conquered" count (times you beat the tour average). Updated in
    `finishDailyRound` (`bumpMastery`). New `overlayPassport` lists all 39 courses with your best score +
    a colored grade chip (S/A/B/C/D) + a ✓ when conquered, unplayed dimmed, and a summary header
    (N/39 played · M conquered · K A+-graded + progress bar). Reachable from the ≡ menu (new "🎫 Course
    Passport" Play row) and a button on the daily result. `masterySummary()` for the header.
  • **#4 Weekly meta-goals.** `bag_weekgoals` (keyed to a 7-day UTC block via `weekKey`) tracks this week's
    distinct days played, "beat the pro" days, and best grade. `WEEK_GOALS` = Play 5 days · Beat the pro 3× ·
    Grade an A round or better. Completing all 3 awards a ❄️ streak freeze (once/week — ties into #1's
    loss-aversion loop). A compact "This Week" progress panel shows on the title (once you've played) and a
    recap/celebration on the daily result (`bumpWeekGoals` sets `S.dailyWeekReward` for the completion card).
  • **Cross-device.** Both stores added to the CS82 cloud-save bundle with grow-only merges
    (`mergeCourseMastery`: per course keep lowest score / best grade / higher counts; `mergeWeekGoals`: newer
    week wins, same week unions day/beat maps + max counts + OR the reward flag), plus `cloudPull` restores.
  • Verified in Playwright (cs159): a real finish records mastery (best+grade+plays+beat) and the weekly day;
    the passport overlay lists all 39 with the played course graded/conquered and unplayed dimmed;
    completing all 3 weekly goals grants exactly one freeze; the title weekly panel shows once played; both
    merges are grow-only (lower score / best grade / union days / preserve reward). practice/cs158/hv8
    regressions green; screenshots confirm the passport + the "This Week" panel. Deployed to /golf. Tunable:
    `WEEK_GOALS` targets, the freeze reward.
  This completes recs #1–#5 from the daily-games deep research (Wave 1 = #1–#3 in CS158, Wave 2 = #4–#5 here).

- **CS160 — shot-tracer spoiler/UX fixes (owner feedback on the immersive round).** Four fixes to the
  daily/Moment/Spotlight/Legend round view (`scrDailyRound` + the hole-view module); the sim/score engine
  is untouched. (The 5th item — decisions must come before the SPECIFIC shot they concern, not always at
  hole start — is a bigger simulate-both-choices redesign, split out as a focused follow-up.)
  1. **No tracer pre-flash (owner: "I see the shot tracer line come up for a brief moment before the shot
     initiates. It spoils the upcoming shot").** The in-flight shot's three paths (`hv-traceg`/`hv-trace`/
     `hv-roll`, plus the putt roll) were drawn FULL for one frame before `hvKick`'s first rAF frame
     recomputed their real length and hid them — a visible flash of the whole ball flight before the shot
     started. Now they render `stroke-dasharray="9999" stroke-dashoffset="9999"` (invisible) in the
     live-shot markup, and the animator draws them in as before. Added `_hvA.done` tracking + `hvRevealPaths()`
     so that when a re-render rebuilds the DOM for a shot we've ALREADY finished animating (e.g. the
     post-hole beat re-renders with the same animation key → `hvKick` early-returns with no running frame
     loop), the freshly-hidden paths are snapped to their final drawn state instead of vanishing.
     Reduced-motion (`setFinal`) already reveals them. Pen (penalty-drop) path left as-is (its opacity
     isn't re-revealed on completion, so hiding it would strand it).
  2. **No "in the hole" spoiler (owner: "the shot description for in the hole comes up before the ball goes
     in the hole, spoiling the result").** The one-line `.hvdesc` on the tracer window swapped to the
     holing shot's text ("In the hole") the instant the final shot revealed — while the ball was still
     dropping. Gated it on `!S.dailySinking`, so during the sink phase no shot description shows; the
     colored result pill reveals the outcome only AFTER the ball is in.
  3. **No between-holes shot-log flash / scorecard shift (owner: "the scorecard gets moved after each hole
     for a moment while all of the shot descriptions come up and then go away").** Removed the between-holes
     `dShotPanel` render (it dumped the full shot log after each hole + during the holed beat, pushing the
     page around). The full log now lives ONLY in review; during play the window's one-line description
     narrates the current shot.
  4. **Full clickable shot list in review (owner: "the full list of shot descriptions for the hole should
     only come up if someone goes back and views a hole's result. They should also be able to click on any
     shot and replay that shot on the tracer view").** Tapping a scorecard cell opens review; the numbered
     scrubber chips are replaced by a full readable `.shotlist` — one row per shot with its complete
     description, the selected row highlighted, tap any row to replay JUST that shot on the tracer window
     (bumps `S.dailyReviewNonce` so the animator re-fires). Replay + Share-this-shot buttons kept.
  Verified in Playwright (cs160): live full-shot paths start hidden (dashoffset 9999) then reveal as the
  animator runs; no shot description renders while the ball is sinking + a result pill shows on the holed
  beat; zero `.shotpanel` between holes AND during the holed beat; review shows the full clickable list
  (row count == shot count, each row has its description, tapping row 2 selects+replays it, old `.shotscrub`
  gone); a full practice round still finishes. Regressions cs157 (result pill / taller tracer / static
  share — review-scrubber assertions updated to the new `.shotlist`), cs158 (Round Rating), cs159 (passport
  + weekly goals) all green; zero page errors. Deployed to /golf.
  FOLLOW-UP (deferred): decision timing (owner: "the prompts for the in game decisions always come at the
  start of a hole, regardless of what it's asking. It should come up before the shot that it's asking about
  — putting/approach/layup/driving decisions, specific to the actual holes, matching what's visually
  shown"). Planned as a two-sim contextual approach: sim both attack/safe choices, reveal the common
  decision-independent prefix (e.g. the drive), pause at the decision shot index with contextual copy, then
  reveal the chosen continuation. Requires mapping dScenario types → shot indices; architectural change to
  playDailyHole + the reveal flow.

- **CS161 — decision timing: the prompt now comes BEFORE the shot it's about (tee + approach only; no
  putting decisions).** Owner: "the prompts for the in game decisions always come at the start of a hole,
  regardless of what it's asking. It should come up before the shot that it's asking about... make sense
  with what is visually shown." Then: "Let's just do tee and approach. There should be no putting
  decisions. Putting should be strictly based on putting rating." Sim/score engine (dSimHole) untouched —
  the decision still feeds it (aggressive lowers the scoring mean, raises variance); only WHEN the prompt
  appears and WHICH shot the narrative reflects changed. The hard invariant (shot-count === stroke-count)
  is preserved and re-verified (4,725 combos, 0 mismatches).
  • **Decisions are now scoped to a shot phase.** `dScenario` tags each scenario `phase`: **'tee'** (a
    driving decision — drivable par-4, reach-in-two tee, tee-shot-line) or **'app'** (an approach/second-shot
    decision — pin-hunt, between-clubs, go-for-it-in-two, layup, carry, etc.). Par-3 decisions are 'app'
    (the tee shot IS the approach). There are NO putting-decision templates (there never were) — putting
    outcomes are driven purely by the Putting rating in `dShotSeq` (unchanged).
  • **`dShotSeq` scopes the choice to the right shot.** New `opts.decPhase`/`opts.decAgg`: a 'tee' decision
    biases only the DRIVE (driver vs 3-wood/short via `teeSafe`), leaving the approach neutral; an 'app'
    decision biases only the APPROACH aim (fire at the flag vs the middle, via the existing `greenDesc`
    atk), leaving the drive neutral. Previously the single attack/safe flag conflated both.
  • **Reveal flow — the drive plays first, THEN the approach decision (par 4/5 'app' only).** New
    `dNeutralDrive()` generates a decision-INDEPENDENT drive (driver, in play, never reaching the green),
    seeded separately from the score so it's identical whichever choice the player then makes; it feeds
    `dShotSeq` as `opts.teePreset` so shot 0 of the final hole IS that drive. `scheduleDailyAdvance` routes
    a par-4/5 'app' signature hole to `dailyStartApproachHole` (S.dailyProv): reveals the neutral drive on
    the tracer, then — once it lands — surfaces the approach decision with a context line matching the
    screen ("Your drive found the left rough · 226 yds to the green"). `dailyResolveApproach(agg)` sims the
    chosen score with `teePreset` (so the revealed drive stays shot 0) and continues revealing from the
    approach. Par-3 and 'tee' decisions still show up-front (already correct timing — the decision is about
    the very next shot). The rare par-4 eagle with a preset drive becomes a holed approach (drive + holed
    shot = 2), handled by a P===0 hole-out branch.
  • **Plumbing:** the tracer window + HUD were factored into a `drawWindow()` helper shared by the normal
    reveal and the provisional drive; `S.dailyProv` is reset in every round-init/finish path, guarded in
    `scheduleDailyAdvance`/`dailyPause`/`dailyReviewOpen`/`dailyReviewClose` so a pending approach decision
    is never stranded or duplicated; `dailyMulligan` re-sims an 'app' hole with the same preset drive.
  • Verified in Playwright (cs161): 4,725-combo shot-count===stroke-count invariant (all decision paths incl.
    teePreset), determinism, teePreset-is-shot-0, attack/safe share the same drive but differ on the
    approach, no par-3 gets a 'tee' phase, the reveal flow (drive first → no decision until it lands → 2
    choice buttons → resolve pushes one correct-count hole), and a full practice round. Regressions
    cs157/158/159/160, hv5 (multi-ball H2H), hv6 (39-course geometry + putt property), hv7 (Moments), hv8
    (one-window HUD — updated for CS160's no-between-holes-panel), hv10, physics, stall (CS156), h2h_regress
    all green; zero page errors. Screenshot confirms the approach decision appears after the drive with a
    matching context line. Deployed to /golf.

- **CS162 — realistic pro miss dispersion (no more amateur shanks into greenside bunkers).** Owner
  (screenshot of a par where a short shot sprayed sideways into a greenside bunker): "This is really
  unrealistic of a path to a par... that's what an amateur would do. These are pros. They shouldn't have
  missed like this unless their rating is really low... Some shots are so off target and it feels so
  unrealistic." Root cause: `dShotSeq`'s "missed the green" branch picked a miss lie UNIFORMLY at random
  (greenside bunker / left rough / right rough / long / short) with NO skill or distance scaling, and the
  `gb` (greenside bunker) geometry snaps the ball to a bunker OFF TO THE SIDE of the green — so even a
  short approach from a 90-OVR pro could read as a lateral shank into the sand. Sim/scoring engine
  (dSimHole) untouched; this is narrative + hole-view geometry only, and the shot-count===stroke-count
  invariant is preserved (re-verified).
  • **The miss is now a NEAR miss for pros, scaled by skill AND distance.** New `missQ` (0.7·approach +
    0.3·accuracy) and a distance factor drive a `nearMiss` probability: a short shot (≤130y) from a good
    player near-misses ~92% of the time (just off the fringe / front collar / a step off the green / just
    short — leaving a simple chip), rising toward wild misses only for weak players or long approaches
    (>170y). Only when it's genuinely a bad miss does it find a greenside bunker / deep rough, and even
    then a low-skill build sprays far more than a high one. Measured over 4,400+ missed-green samples: an
    elite (OVR 96) build near-misses **96%** of the time (4% into a bunker/rough), a weak (OVR 64) build
    **75%** near / **25%** wild — pros barely miss, amateurs spray.
  • The same skill-scaled logic was applied to the **par-3 tee miss** (a pro mostly just misses the edge;
    only a weak ball-striker finds a bunker), and near-miss lies are placed just off the green (front
    collar / fringe / just through) instead of laterally, so the tracer reads as a realistic near-miss
    that chips on, not a sideways shank. New near-miss lie mappings added to `HV_LIE`.
  • Verified in Playwright (cs162): 2,184-combo shot-count===stroke-count invariant (all paths incl.
    teePreset) still 0 bad; the elite-vs-weak miss profile above; determinism preserved; a full practice
    round completes; plus a screenshot of a real par-4 up-and-down par now reading "Driver 315 to the
    fairway → 7-iron missed the green into the front collar → lob wedge to 14 ft → in the hole" with the
    ball resting just short of the green (not in a side bunker). Regressions cs157/160/161, hv5/6/7/8,
    physics (its over-strict `landShort` tolerance loosened — a low-spin running approach can land a hair
    short of the 0.9-radius mark at the true green edge and release on, which is realistic), stall,
    bugfix all green; zero page errors. Deployed to /golf. Tunable: the `nearP` distance bands + the
    `missQ<0.42` wild-spray threshold in dShotSeq.

- **CS163 — every rating visibly drives its own shot (skill signal strengthened per shot type).** Owner:
  "It shouldn't all be about the total overall of the golfer. Every aspect of the simulation should
  reflect the ratings of the golfer. Driving power, accuracy, scrambling, approach, bunker shots, putting,
  etc." Audited with extreme single-skill builds (one stat at 99, rest at 60) measuring the actual shot
  output per dimension. Found the wiring existed (CS155) but the RANDOM spread in each proximity formula
  often swamped the skill term, so short game / scrambling / bunker barely showed. Strengthened the
  skill coefficient (and trimmed the noise) in each shot-quality computation so the relevant rating
  DOMINATES — same rng-call count, so determinism + the shot-count===stroke-count invariant are preserved
  (the deterministic dSimHole score and the DTPL per-hole skill weights are untouched):
  • **Approach** → approach proximity: an elite iron player stuffs it, a weak one scatters (attack/safe/
    neutral prox formulas re-weighted toward `appQ`).
  • **Short Game** → greenside chip proximity (fringe/collar chips lean 0.82 on Short Game).
  • **Scrambling** → rough-recovery proximity (rough chips lean 0.5 on Scrambling).
  • **Bunker** → sand-shot proximity (bunker recoveries lean 0.78 on Bunker skill).
  • **Putting** → the lag/leave distance (elite lags to a tap-in, weak leaves 4-5 ft) + the existing
    3-putt attribution and longer-drained birdie putts.
  • **Driving Distance** → drive length (already strong) AND now the par-5 layup/advance shot (a longer
    hitter advances further toward the green).
  • Driving Accuracy (fairways hit) and the CS162 miss dispersion already keyed off their specific ratings.
  Verified with the audit harness — each single-skill build now clearly excels ONLY in its dimension:
  Bomber drive 332 vs 271 baseline; Surgeon approach 14 ft vs 29; Chipper chip 18 ft vs 31; Scrambler
  rough recovery 23 ft vs 31; Sandman bunker 14 ft vs 31; Putter leave 1.7 ft vs 5 (and 0% 3-putt).
  Regressions cs161/162, physics (backspin + carry), hv6 (geometry) and hv8 (HUD) all green; invariant
  and determinism intact; zero page errors. Deployed to /golf. NOTE: this is the shot-by-shot SIGNAL
  (what you watch); the per-hole SCORE already weights each skill by hole archetype via DTPL (a drivable
  par-4 weights distance, a short par-3 weights approach+putting) — that calibrated balance was left as-is.

- **CS164 + CS165 — hole-view graphics overhaul: dense forest + real, distinct biomes with depth.**
  Owner (with a Pixel-Pro-Golf reference screenshot): "Our game looks way too much like a web based game
  and not like a built out golf game with unique holes." Then, after the dense-forest pass: "I want real
  biomes. The desert shouldn't look like a brown field with some cactuses sparsely spread around. It should
  look like a real rock desert mountain course... each [course] to have their own uniqueness... Different
  flowers, tree types, some courses should have a ton of water, some should have less or none... more depth
  to the scenery as a whole but on top of that I want there to be more detail." Chose "richer SVG for now
  but let's really go for it" over a canvas/pixel-art renderer or external art assets — so this stays a
  self-contained, deterministic SVG renderer, pushed hard. All rendering-only; the sim, hole geometry, and
  the shot-count invariant are untouched (verified).
  • **CS164 — dense forest carpet + terrain caching.** Replaced the sparse two-sided tree strips with a
    screen-space grid that fills the ENTIRE rough tee-to-green with overlapping, back-to-front, jittered
    trees (a hole "carved through forest," matching the reference), keeping the fairway corridor + green/
    water/bunker/ocean keep-outs clear. Added an `inFairway(px,py)` corridor test (from the fairway edge
    points) and a bunker keep-out to `clear()`. Since the terrain is static per hole, it's now built once
    and cached on `g._terrainStr` (re-renders during the shot reveal reuse it) so the added density stays
    performant.
  • **CS165 — real, distinct biomes.** Rebuilt `HV_BIOMES` as a data model (`ground`, `scatter` plant-mix,
    per-plant colors, `flowerCols`) + a `plantAt()` dispatcher, and added a full set of SVG plant/terrain
    renderers: **pine** (stacked-tier conifer), **cypress** (windswept), **broadleaf** (lush round),
    **flowerBush** (azalea/hibiscus with colored blooms), **barrel** cactus, desert **scrub**, **ocotillo**
    (red-tipped stems), red-rock **outcrops**, standalone **gorse**, and **fescue** tufts. Each biome now
    scatters its own MIX: parkland = deciduous + pine + azaleas; coastal = cypress + pine + flowers over the
    sea cliffs; **desert = a Sonoran rock-and-sand floor** (bare desert ground with gravel speckle, pale
    dry-wash sweeps, rust rock-shadow patches for depth) scattering saguaro + barrel + scrub + ocotillo +
    rock outcrops (no more "brown field with cacti"); links = treeless fescue + marram dunes + gorse + sandy
    scrapes; tropical = palms + broadleaf jungle + bright hibiscus. Per-biome GROUND (desert sand / links
    fescue / grass) replaces the one green base, plus soft light/dark undulation blobs on every biome for a
    sense of rolling terrain (depth). Water stays geometry-driven, so water-heavy courses (Sawgrass, Bay
    Hill) show lots and links/desert show little — as the owner asked. Wooded biomes fill a dense carpet;
    desert/links are a more open scatter (bare ground is part of their character). The irrigated green
    fairway/green pop against desert/links.
  • Perf: terrain cached; densest biome (tropical) ~3.5k static nodes, re-parsed once per shot reveal (not
    per animation frame — the ball animates via rAF attribute updates on a few elements), so it stays smooth.
  • Verified in Playwright: screenshots of all 5 biomes (desert now a real rock/sand desert course; each
    biome visibly unique); node counts measured/trimmed; regressions hv5 (multi-ball H2H), hv6 (39-course
    geometry + putt property — confirms the new renderers error on no course), hv7 (Moments), hv8 (one-window
    HUD), physics, cs162 (sim invariant) and the practice suite all green; zero page errors. Deployed to
    /golf. Tunable: `HV_BIOMES` (palettes/plant mixes/flowers), the `STEP`/`gap` density, `HV_COURSE_BIOME`
    (which course maps to which biome).

- **CS166 — putting realism + real hazards (owner IMG_7879: irregular 3-putts, "making up score with
  putts").** Owner screenshot showed a 3-putt bogey reading "Putt 1 ft 4 in., 1 ft 5 in. to hole" — a
  16-inch putt "leaving" 17 inches — with a 92-Putting golfer 3-putting repeatedly. Owner: "I want to see
  more long putts, and less putts that go pretty much one inch. It seems like it is trying to get the
  golfer to a certain score, and making up for it with the putts... balls should go into the water or maybe
  get stuck behind trees and the player has to punch out into the fairway. There are way more real life
  scenarios that result in a higher score than putting 3-4 times." All fixes are in `dShotSeq` (the shot
  NARRATIVE); the deterministic `dSimHole` score engine and the per-hole DTPL skill weights are untouched,
  and the hard shot-count===stroke-count invariant is preserved (re-verified 4,620 combos, 0 mismatches).
  1. **The literal bug (leave > putt).** The intermediate-putt leave was a flat `4.4−3.6·putQ+rng·1.5` that
     ignored the putt distance, so a short putt could "leave" a longer one. Rewrote it to SCALE with the
     putt distance and shrink with Putting skill, hard-capped at `putt·0.8` so a leave can NEVER exceed the
     distance just putted — an elite lags a long putt to a tap-in, a weak putter leaves a missable 4-6
     footer, and a genuine 3-putt now reads lag → missable putt → tap-in. (Verified: 0 leaves ≥ their putt
     across all builds; 0 sub-2ft intermediate putts for an elite; avg leave 2.3ft elite / 3.6ft weak.)
  2. **"Making up score with putts."** The over-par decomposition attributed extra strokes to a 3-putt far
     too readily. Steepened the putt-attribution weight (`wPutt` exponent 1.9→2.6, ×0.6), boosted the
     ball-striking weight (`wBall` +0.10, exponent 1.5→1.3), and CAPPED extra putts at one (`pe<1`) — so
     over-par holes now come from tee-to-green trouble, and only a genuinely weak putter ever wears a single
     3-putt. A 92-Putting golfer now 3-putts **0%** of over-par holes vs a 60-putter's **18%** (was
     effectively "whatever the score needed").
  3. **Real hazards.** Broadened the water trigger (base 0.14→0.20, accuracy-scaled) and added a
     **tree-trouble** episode: a loose drive finds the trees and the player punches out to the fairway (the
     extra stroke), then plays on — the exact scenario the owner described. Both scale with the relevant
     rating (water off ball-striking, trees off accuracy) and only fire when there are spare long strokes to
     burn, so a par or clean round never triggers one. Over a score-heavy sample a loose build hits water
     ~10% / trees ~24% of over-par holes vs an elite build ~7% / ~10%.
  Verified in Playwright (cs166): the invariant across all decision/teePreset paths, the leave-never-exceeds
  + 3-putt-scaling + no-tiny-putts properties above, hazards surfacing more for loose builds, determinism,
  and a full practice round. Regressions cs160/161/162, physics (carry + backspin), stall (CS156), hv6
  (39-course geometry + putt property), hv8 (one-window HUD) all green; zero page errors. Deployed to /golf.

- **CS167 — course-shape variety: real doglegs, varied fairway thickness, varied green size/shape (owner:
  "make our courses feel way more unique from one another").** Owner studied real courses and asked for
  more fairway-thickness variation, green size AND shape variation, "dog legs left and right that actually
  turn (we only have s curves)," and less squared-off fairways. All changes are in `hvGeom`/`hvTerrain`
  (the deterministic hole-view geometry); no sim/score/decision logic touched, and every hole stays
  in-frame + the putt-monotonicity property holds (re-verified).
  1. **Doglegs that actually turn.** The old centerline was a smoothstep that eased in AND out across the
     whole hole — a gentle bow that read as an S-curve. Replaced with a real two-segment dogleg: a STRAIGHT
     leg off the tee to a corner (seeded 36-58% down the hole), then a mostly-straight DIAGONAL leg to the
     green (elbow softly rounded). Doglegs now go both ways (measured 222 left / 207 right across the 39
     courses) and **100% of them turn at a corner** (a nearly-straight first third, a clearly-offset last
     third) instead of bowing evenly. Added ~1-in-5 dead-straight non-par-3 holes for variety (120 of 549),
     and sharpened the par-5 double-dogleg corners too.
  2. **Fairway thickness variation.** Base width was a narrow 31-39 yd band with one pinch; now a much wider
     24-44 yd base (× the course's fw character → measured 17-67 across courses) shaped ALONG the hole by a
     broad driving-zone flare, a distinct neck pinch, and a rippled non-parallel edge — so thickness varies
     both course-to-course and within a hole (avg within-hole width swing ~0.52). Bumped the fairway outline
     from 16 to 22 samples so the edges read organic, not squared-off.
  3. **Green size AND shape.** Greens were near-circular ellipses of similar size (rx 13.5-17.5, ry 12-16).
     Now each green gets an overall size roll × the course's green-size character (measured green-area range
     >14×) and an aspect ratio from wide-and-shallow to deep-and-narrow (0.67-1.56, area kept roughly
     constant), plus a per-hole irregularity (0.13-0.28, was a flat 0.09) so outlines vary — Redan-ish,
     kidney, long tongue — instead of all circles. Threaded the new `g.greenIrr` through the green's
     shadow/fringe/surface blobs.
  Verified in Playwright (cs167): across all 702 holes, 0 greens/water off-frame; doglegs both directions +
  100% turn-at-a-corner + some dead-straight; green aspect/size/irregularity all span their intended ranges;
  fairway base width varies >2.2× across courses with ~0.5 avg within-hole swing; a full practice round
  renders clean. Screenshots confirm a tight dogleg-left (Colonial-analog) vs a wide dogleg-right par-5
  (Kapalua-analog) look genuinely distinct with greens tucked to their corners. Regressions: hv6 (39-course
  geometry property — its "bends vary" assertion updated for the new intentional dead-straight holes; putt
  monotonicity still 0 backwards), physics (carry + backspin), cs166 (sim invariant), hv5/hv8/hv10 all green;
  hv11's stale "Next hole coming up" text check updated to the CS157 `.hvresult` pill (the text was removed in
  CS157, so it was failing pre-CS167 too). hv7 (Moment calibration) is a known pre-existing stochastic/flaky
  test, unaffected by this geometry-only change (confirmed identical scoring). Deployed to /golf.

- **CS168 — declutter the Daily result: remove the Round Rating, foreground score + beat-the-pro +
  stats (owner IMG_7884: "too overwhelming, the important info is getting lost... we don't like the round
  rating").** The result page led with a big "Round Rating" grade card (C · Solid · blurb · feats) sitting
  between the score and the "You beat the pro" message, competing for attention. Removed it so the three
  things the owner wants as the main attraction — the **score**, **whether you beat the pro**, and your
  **daily record stats** — now stack directly: score → "🏁 You beat the pro!" card → "Your Daily Record"
  (Played / Beat the pro / Win rate / Best streak). Also:
  - **Share text** no longer leads with the grade letter — it leads with the score + beat-the-pro
    (`74 (+3) on par 71 · beat the pro ✓`), then the emoji scorecard.
  - **Weekly goal** #3 was "Grade an A round or better" (referenced the now-removed rating); replaced with
    a score-based **"Beat the pro by 3+ in a round"** (tracks the best beat-the-pro margin of the week,
    `bestMargin`, cloud-merged grow-only like the other weekly fields).
  The grade is still computed internally and kept per-course in the Course Passport overlay (a separate,
  low-traffic collection screen the owner didn't flag) so that collection layer and its cloud data are
  undisturbed; it just no longer appears on the result page, in the share, or in the weekly goals. Verified
  in Playwright (cs158/cs159 updated for the new design): the grade card is absent, "Round Rating" text is
  gone, score + beat-the-pro render, the share no longer leads with a grade letter, and the weekly reward
  fires off the beat-the-pro margin; a signed-in result screenshot confirms the cleaner hierarchy. Deployed
  to /golf.

- **CS169 — putting realism pt2: no more missed short putts, great lags are the norm, good putting makes
  birdies (owner: "too many missed short putts... more likely to hit it far and lag to a tap-in than hit it
  close and 2/3-putt from <6 ft... good putting brings golfers").** Analyzed real PGA make% by distance
  (inside 3 ft ~99%, 5-6 ft ~70%, 10-15 ft ~30%; lag from 40 ft leaves ~2.5 ft; 3-putts come from a poor
  LONG first putt, almost never from inside 10 ft). The CS166 model still let a 3-putt's first putt leave a
  SHORT second putt, so it read as "missed a 3-footer." Rewrote the putt narration (dShotSeq; the
  deterministic dSimHole score + shot-count===stroke-count invariant untouched, re-verified 2,352 combos):
  1. **The first putt is a great lag to tap-in distance — the norm.** A 2-putt (or the comebacker after a
     miss) now leaves a genuine tap-in that scales with distance + Putting skill: an elite putter lags to
     ~1.8 ft on average, a weak one to ~3.2 ft. So the common line is "Putt 24 ft, 1 ft 9 in. to hole → in."
  2. **3-putts come from a POOR LAG, not a choked tap-in.** When a 3-putt happens (rare), the first putt is
     modeled as a bad-speed lag that leaves a believable 5-9 ft mid-ranger (elite ~7 ft, weak ~11 ft), which
     is then missed — so the missed putt is always a realistic mid-range putt. Measured: **zero** putts from
     inside 3.5 ft that miss, across elite/good/weak builds (the exact "missed short putt" complaint, gone).
  3. **Slightly fewer 3-putts for decent putters** (wPutt exponent 2.6→3.0, ×0.6→0.5): elite 0% / good 3% /
     weak 16% of over-par holes — good putting clearly separates.
  4. **Good putting makes birdies, not just stiff approaches** (birdie proximity bonus widened): an elite
     putter's made birdie putts now average ~20 ft vs a weak putter's ~14 ft, so a great putter drains the
     longer ones ("good putting brings golfers home") instead of every birdie coming from kick-in range.
  Verified in Playwright (cs169): the invariant, zero missed-short-putts, tap-in lag norm, believable 3-putt
  structure, deeper birdie putts for good putters, determinism, and a full round; sample narratives read
  like real golf (elite par = drive → wedge to 24 ft → lag to 1'9" → in; bogeys/doubles come from
  trees/missed greens, not 3-putts). Regressions cs166/cs162, physics, stall, hv6/hv8 all green. Deployed
  to /golf.

- **CS170 — round-screen revamp: next-hole-before-the-drive, a real decision pop-up, crisp always-on
  scoreboard (owner's 3 notes on IMG_16907812) + remove the green "v" pattern.**
  1. **Show the NEXT hole before the drive.** A tee/between-holes decision used to leave the PREVIOUS
     hole's finished putt on the tracer while asking about the upcoming drive. `hvNode` now renders a fresh
     hole preview (terrain + tee + pin, no ball) for a hole with no shots yet, and `scrDailyRound` draws the
     UPCOMING hole (`previewNext`) between holes — so the hole on screen matches the drive/decision being
     asked. (Approach decisions still correctly show the just-hit drive.)
  2. **The decision is now a real pop-up modal.** Replaced the inline decision card (which pushed the page
     around) with `dDecisionModal` — a `position:fixed`, centered, animated overlay over a dimmed/blurred
     course that never shifts the page: "⛳ YOUR CALL", the hole + situation, and the two options as bold
     distinct buttons (⚡ aggressive red / 🛡 safe teal, "OR" between). Used for both the signature tee/par-3
     call and the par-4/5 approach call; picking one dismisses it and plays the hole.
  3. **The floating scoreboard is crisp and never disappears.** It used to vanish during the holed-result
     pill; now the board is ALWAYS shown on the live window and the result pill floats over the center of
     the tracer instead (so they coexist). Added a FLIP glide (`_hvbRects`, `data-nm` per row): when the
     standings re-order between holes, rows animate from their old slot to the new one instead of teleporting
     ("if players swap I want to see them swap"). Reduced-motion falls back to no animation.
  4. **Removed the "v" grass-tick pattern on the greens** (all courses) — the putting surface reads cleaner
     plain (dropped the clipped green-tick group in `hvTerrain`).
  Verified in Playwright (cs170): the decision renders as a fixed modal with 2 options and the tracer behind
  it shows the hole being decided (chip = the upcoming hole, not the previous); the scoreboard is present at
  the decision AND during the holed-result pill (never disappears); choosing advances the round; the green
  v-ticks are gone; a full practice round completes. Regressions hv5/hv6/hv7/hv8, physics, cs169, and the
  updated stall test (decision is now the `.dc-opt` modal, not the old inline `.btn.choice`) all green.
  Screenshot confirms the pop-up over the blurred course. Deployed to /golf.

- **CS171 — setup button rename, Spotlight = full week, Spotlight is now server-based (board + course
  records).** Three owner asks:
  1. **Setup button → "Build Your Golfer"** (was "Start Drafting"), sub reworded.
  2. **Monthly Spotlight now runs a FULL WEEK** (`SPOT_WINDOW_DAYS=7`): `spotlightLiveToday()` is live for
     the 7 days from the spotlight's live date (its day-of-month is 1..24 so the week never crosses the
     month); `nextSpotlight()` + the title banner + "attempts left" copy updated from "today" to "this week".
  3. **Spotlight scores now reach the leaderboards, server-based** (was local-only `bag_special`, never
     posted). New migration **`supabase/45_runtour_spotlight.sql`** mirrors the Legend pattern: an
     `is_spotlight` flag on `runtour_daily_scores`, `p_is_spotlight` on `runtour_submit_daily`, and a
     `p_spotlight` filter on `runtour_daily_board` / `runtour_course_records` / `runtour_my_daily` — so the
     Spotlight has its OWN global board and its OWN course-record bucket (correct: it's played in forced
     tough weather, so it must not mix with the regular daily records for the same course). **Also widened
     the row uniqueness from `(user_id, day)` to `(user_id, day, is_legend, is_spotlight)`** so a daily, a
     legend, and a spotlight round on the SAME calendar day coexist instead of overwriting each other (also
     fixes a latent legend-overwrites-daily clash). `finishSpotlightRound` submits to the server tagged
     `isSpotlight` (queues in `_pendingSpot` for guests, flushed on sign-in), records a spotlight course
     record in its own bucket (`bag_courserecords_spotlight`, cloud-synced), and verifies it against the
     server; the Spotlight result screen now shows the Spotlight's global leaderboard + course record.
     Client fails open (spotlight submit is skipped, never posted as a plain daily) until the owner runs 45.
  Validated migration 45 against local Postgres (applied 24→30→45 clean + idempotent): a daily, spotlight,
  and legend round on the same day all coexist; the spotlight board/records are separate from the human
  daily; forged low scores still clamp. Client verified in Playwright (cs171): button text, the 7-day live
  window (live dom..dom+6, not before/after), spotlight submits tagged is_spotlight on its own liveDayKey to
  its own record bucket (never leaking into the daily bucket), and a guest spotlight queues then posts on
  sign-in. Regressions cs158/cs159/cs170 green. **ACTION: run `supabase/45_runtour_spotlight.sql`.** Deployed
  client to /golf.

- **CS172 — achievements buffed out: 146 → 200, every game mode has feats (owner: "add as many as you can
  think of... every scenario in every game mode... move tiers accordingly").** Added 54 achievements + 2 new
  categories, wiring the previously-uncovered modes:
  • **Online (new category, 13):** play/win your first match, win in each mode (1v1 / Best Ball / Scramble /
    Free-for-All), win in ALL four modes, tiered win ladders (10/25/50/100) and matches-played (25/100).
    Captured in `h2hFinishWatch` (`h2hCaptureAch`: matches + wins overall + per-mode; deterministic local
    win, fires once per finished match, real + bot).
  • **Legend Circuit (new category, 7):** play a circuit season, win a circuit event, win a circuit major,
    complete the full circuit, + tiered circuit wins (10/25) and majors (5). Live stats read from
    `S.circuitCareer` and persisted at `endCircuit`.
  • **Legend Tokens:** earn a token / earn 5 / play the Daily as a Legend (captured at mint + consume).
  • **Caddies:** hire a caddie / hire a Hall-of-Fame (tier-1) caddie (captured on equip).
  • **Daily:** Hole in One! (aces now tracked in `captureDailyFeats`); "Played Them All" fixed 16→**39**
    courses + a new 25-course tier; deeper Spotlight tier (6 wins).
  • **Deeper ladders** on existing metrics: 150 wins, 10 team Cups, 3 Games golds, $1B earnings, 60 seasons.
  New metrics get 0-defaults in `achMetrics` so progress bars read correctly before the first capture. The
  **Tour Rep tiers auto-rescaled** — thresholds are a % of total points (now 13,090), so every rank moved up
  proportionally with the bigger catalog (exactly what "move tiers accordingly" needs); G.O.A.T. still = 100%.
  Verified in Playwright (cs172): 200 achievements, 0 duplicate ids, every category non-empty, every `get()`
  safe; all new captures (online/circuit/token/caddie/ace) unlock their achievements; "All-Rounder" only
  fires after winning all four online modes; tiers monotonic + GOAT at total; Trophy Room renders the new
  Online + Legend Circuit dropdowns with the Tour Rep bar, zero page errors. Daily regressions
  (cs159/cs169) green. Deployed to /golf.

- **CS173 — Moments: PLAYABLE sudden-death playoff + tournament name on the round page (owner: "when the
  user chooses to play the last day of the tournament in the moment situations, and the tournament goes to
  a playoff, it should show the playoff. It should play out like a real playoff does on the pga tour. It
  also says the course but not the name of the tournament on this page").** Two parts:
  1. **Tournament name on the Moment round page.** The header used to read only the venue/conditions ("THE
     MOMENT · Final round · Trade Winds Golf Club · Breezy"). It now leads with the actual TOURNAMENT name
     + "Final Round" (`S.moment.evtName`) with the venue/conditions as a `📍` subtitle underneath. (Same
     header serves the playoff, showing "Sudden-Death Playoff · Extra hole N".)
  2. **Playable sudden-death playoff.** Confirmed via Playwright that the playoff already FIRED from a Moment
     finish (finishMomentRound → finalizeEvent → the text `celebratePlayoff` reveal), so the wiring wasn't
     broken — but since the player just PLAYED their 18 holes shot-by-shot on TOURTRACE, dropping to a text
     card for the climax was an anticlimactic downgrade. Now, when a Moment round finishes in a TIE FOR THE
     LEAD that includes YOU, you PLAY the sudden-death holes yourself, the way a real PGA playoff goes:
     - `finishMomentRound` detects the tie (after the field sims Sunday) and routes to `startMomentPlayoff`
       instead of finalizing. It keeps `S.moment` set and reuses the Moment's already-configured course /
       conditions / diffs / skills.
     - `momentPlayoffTee` plays ONE extra hole on the TOURTRACE window (rotating the closing holes 18/1/10
       via `MOMENT_PO_HOLES`), driven by the existing daily hole engine with a new `S.momentPOHoleIdx`
       override in `playDailyHole` (a no-op for the normal 18-hole daily — `ci===i` when `S.momentPO` is
       null) and a dedicated `S.momentPO` branch in `scheduleDailyAdvance` (no signature decisions, no
       18-hole finish path). The floating scoreboard shows a "SUDDEN-DEATH · HOLE N" board of the players
       still alive (you gold-ringed, all TIED).
     - `momentPlayoffResolve` scores every contender on that same hole for a FAIR comparison — YOUR played
       to-par vs each opponent's `dSimHole` on the identical hole/difficulty from their real 8 skills —
       lowest wins the hole, ties advance. An extra-hole overlay (`momentPlayoffShowHole`) reveals each
       player's result (Birdie/Par/… · eliminated) with a Continue button: still tied → next hole; resolved
       → "You won the playoff!" / "Lost … on the Nth extra hole". If you're eliminated mid-way, the rest is
       simmed headlessly so a champion is still crowned (you don't keep playing holes you're out of).
     - `momentPlayoffFinish` stashes the PLAYED outcome on `ce._playoffResult` (winner object + holes +
       per-hole log) and sets `ce._playoffShown=true`, then calls `finalizeEvent` — which now uses
       `ce._playoffResult` in place of `simPlayoff` when present (so money/points/ties/achievements/results
       all flow identically to a simmed playoff). Back on the season screen, a WIN flows into the normal
       win celebration; a loss shows the final leaderboard "Lost in a playoff". The auto text
       `celebratePlayoff` reveal is skipped for the played playoff but is UNCHANGED for every non-Moment
       (simmed) season playoff.
     - Fairness note: opponents are simmed with `dSimHole` on the same shifted diffs the player faced
       (the Moment's calibration shift), so the sudden-death comparison is apples-to-apples on that hole;
       the deterministic `dSimHole` score engine is otherwise untouched.
  Verified in Playwright: (cs173) a NON-Moment simmed tie still fires the text `celebratePlayoff` reveal
  (unchanged); (cs173b) a Moment tie routes to the PLAYABLE playoff and finalizes correctly on both the WIN
  (pos 1, youWon, win celebration fires, `S.momentPO` cleaned up) and LOSS (pos 2, youWon false) paths;
  (cs173c) a natural timer-driven run auto-plays the extra hole on the TOURTRACE window with the
  "SUDDEN-DEATH · HOLE 1" board and resolves via the extra-hole overlay to a win. Regressions: hv7
  (Moments — updated the stale "THE MOMENT" header assertion to the new tournament-name header, and stubbed
  the field in the "finish 2nd" case so a random tie can't accidentally trigger a playoff), hv8 (one-window
  HUD), stall (CS156), hv6 (39-course geometry + putt property), practice (fixed a stale CS171 "Start
  Drafting"→"Build Your Golfer" button selector) all green; zero page errors. Deployed to /golf.

- **CS174 — fill a private "play with friends" lobby from the public pool or with AI (owner: "if you have
  2 of your friends in a foursome and nobody else to play, press a button to join a public lobby where a
  waiting user or bot will join").** A short private group is no longer stuck. Host-only, two ways:
  • **"Open to anyone ▸"** flips the private lobby to `is_public` (new `h2h_open_public` RPC) so a real
    Quick-Match seeker fills the open seat (the existing `h2h_quick` matcher already scans open public
    lobbies), AND arms a ~9-13s AI fallback so the group is never left waiting forever.
  • **"Start now vs AI ▸"** fills the remaining seats immediately (new `h2h_fill_bots` RPC) and tees off.
  Architecture: bots are now REAL `h2h_players` rows (so every human in the lobby sees them and the match
  resolves normally), with `user_id=null` + `is_bot=true`. Migration **`supabase/46_h2h_lobby_fill.sql`**
  relaxes `h2h_players.user_id` to NULLABLE + adds `is_bot` (Postgres treats NULLs as distinct in the
  `unique(match_id,user_id)` index, so many bots coexist; the FK to `auth.users` only checks non-null rows),
  server-generates each bot's build (70-88 base + spikes, so a host can't stack weak bots to farm the
  board) and a human-looking handle, and **redefines `h2h_report` to resolve on HUMAN consensus** — bots
  never call a client so they never report; they auto-agree and never get a board W/L record.
  `h2h_submit_draft` needed no change (bots are inserted already-submitted, so once all humans submit the
  match flips live). Both new RPCs are host-only (server-enforced via `created_by`).
  Client (self-contained in the H2H module): the fill buttons render only for the host on a private,
  not-full lobby (not Quick-Match, which auto-fills, and not client-only bot matches); `h2hOpenLobby`
  opens public + arms the fallback timer; `h2hFillBots` calls the RPC then pulls state; the fallback/fill
  timers are cleared on leaving the lobby / when the match starts. Fails open with a toast if migration 46
  isn't applied yet.
  Validated `46` end-to-end on a local Postgres (host + friend + 2 server bots → drafting; both humans
  submit → live; both report the same winner → done with the two humans credited, 2 record rows, zero bot
  rows; open-to-public + a real Quick-Match human fill; non-host fill blocked). Client verified in Playwright
  (cs174_client): the host sees "Open to anyone" + "Start now vs AI" on a 2/4 foursome; "Start now vs AI"
  fills to 4 (2 bots) and enters the draft; a non-host never sees the buttons; "Open to anyone" flips public
  + arms the AI fallback. H2H regression suite green; zero page errors. **ACTION: run
  `supabase/46_h2h_lobby_fill.sql`.** Deployed client to /golf.

- **CS175 — round result pill shows your SCORE, not the hole; season summary money/wins regrouped +
  de-duplicated (tester Jordo).** Three screenshot notes:
  1. **Result pill = running round score.** The holed-result pill on the tracer read "BIRDIE 3 (−1)" (the
     hole's strokes + hole to-par). Jordo: "the number next to par/birdie/bogey should be the score that
     I'm at… that should say birdie −3." Changed the pill's secondary to the RUNNING round total to-par
     (`dtp(total)`), so a birdie that puts you at −3 for the round reads "BIRDIE −3" (verified: PAR shows
     "+1" after 3 holes, i.e. the round position, not the hole).
  2. **Money grouped + de-duplicated on the season summary.** Money was scattered across ~4 spots and the
     net-profit figure appeared TWICE up top — a giant "NET PROFIT" hero AND an identical "Profit" stat
     tile. Replaced the tall hero + the Earnings/Profit tile row with ONE horizontal money card:
     **Earnings** (gross) | **Net profit** (with "−$X costs") side by side, one place. The duplicate Profit
     tile is gone; money now lives only in that card + the season earnings list + the career card.
  3. **Wins grouped.** Jordo: "wins are at top once and then tiny." The Wins count and the "Tournaments won
     this season" chips were far apart; moved the won-tournament chips up to render directly under the
     stat row (Wins · Majors · Top 10's · Tour Rank), so the count and the named wins sit together. Removed
     the separate lower "Tournaments won this season" section (no more duplication) and dropped its header
     (the chips are self-explanatory under the Wins stat).
  Net effect also shortens the summary (removed the big hero + a whole tiles row), addressing "that page
  doesn't need to be as long." The record/bookkeeping block (all in the `if(!S.recorded)` guard) was
  untouched — layout-only. Verified in Playwright (cs175): a full simmed season lands on the summary with
  the grouped money card (Earnings + Net profit), no standalone Profit tile, and the won-tournament chips
  under the stat row; the result pill shows the running round total; hv8 (daily HUD), practice, and cs157
  (result pill / review) regressions all green; zero page errors. (Jordo's "better color scheme" note is
  noted but not acted on — needs direction.) Deployed to /golf.

- **CS176 — three online-mode fixes (tester Jordo).**
  1. **Ball no longer drawn in the water on a dry lie** ("it told me I wasn't in the water… im blue lol").
     The tracer's water hazard geometry and a ball's rest position are computed independently, so a
     fairway/short/recovery lie could overlap the drawn pond and render the ball sitting in the water even
     though the sim never put it there. Added `hvOutOfWater(g,pt)` — for any dry lie (not water/drop, not a
     green shot, which the CS153 carry-safety already handles), the resting ball AND its touchdown are
     pushed just onto land (radially out of the pond ellipse, or to the near side of a crossing creek).
     Property-tested across all 148 water holes × varied scores (1,865 dry-lie plots): **0** now rest in
     the water. Applies everywhere the hole view is used (Daily, Moments, H2H).
  2. **Your record + rank pinned at the top of the Win/Loss leaderboard** ("you should always see ur record
     and place at the top"). `h2hLoadBoard` now fetches deep (server clamps to 500) so it can locate you
     even when you're ranked below the bot pool, and renders a gold-ringed "You · #rank · W-L · Win%" row
     at the very top of every mode tab (plus your row in-context below the top-50 if you're outside it, and
     a "play a match to claim your spot" note if you have no record yet).
  3. **The H2H result screen now shows the hole-by-hole SCORECARD** ("when you press see result it's the
     same page — should show the scorecards"). New `h2hScorecard()` renders a horizontally-scrollable card
     under the final standings: a sticky player/team column + one cell per hole (strokes, colored by
     score-to-par) + a total, one row per unit (you gold, ball-color dots matching the tracer, par row on
     top). So "See Result" is now a real results page, not a repeat of the watch standings.
  Verified in Playwright (cs176): the water property (0 bad across 148 holes), the leaderboard pin for a
  rank-3 (in-list) and a rank-120 (outside top-50) player, and the result scorecard rendering (Victory +
  standings + per-hole grid). H2H regression + hv6 (geometry/putt) green; zero page errors. All
  client-only, no migration. Deployed to /golf.

- **CS177 — online matches: playoff PLAYS OUT on the tracer, win/lose animation, live-scoreboard-on-holed.**
  Three online-mode asks:
  1. **Sudden-death playoff now plays out shot-by-shot on the TOURTRACE tracer** instead of just declaring
     the winner. `h2hBuildPlay` now also builds `S.h2h.poPlay` — a per-extra-hole shot sequence for the
     units still alive — from the ALREADY-RESOLVED playoff scores (`h2hResolve`), so the winner and the
     2-client consensus are unchanged (this is purely the visual reveal). `h2hWatchStep` drives each playoff
     hole like a regular hole (tee off, then away-plays-first), and `scrH2HWatch` renders it in the one-window
     tracer with a red "SUDDEN-DEATH · EXTRA HOLE N" chip and a live board of the alive units (score revealed
     as each holes out, advancer in gold). Skip-to-result skips the playoff too.
  2. **Win/lose animation when a match finishes.** New `h2hCelebrate()` — a full-screen `YOU WIN!` (gold,
     confetti cannons + haptic) / `DEFEAT` overlay, fired once on watch-done, dismissing to the result
     screen. Guarded so a deferred fire after state changed is a no-op (fixed an hv5 page error where the
     40ms-deferred call read `S.h2h.result` on a reset `S.h2h`).
  3. **Live scoreboard updates the moment a ball drops, not when the hole advances.** New `h2hHoledUnits(hole,
     step)` returns which units' balls are already in the cup at the current reveal step; the in-play
     scoreboard adds the current hole's score for those units, so your total ticks the instant your ball is
     holed (previously it waited for every ball to finish the hole).
  Also renamed the CS176 result scorecard `h2hScorecard()` → `h2hResultCard()` to stop shadowing the older
  `h2hScorecard(sk,seed,holes)` data-builder (harmless but fragile). Verified in Playwright (cs177): a tied
  1v1 builds a playable playoff hole (2 alive + shot seqs + order), it renders on the tracer with the
  SUDDEN-DEATH indicator, the finish shows the DEFEAT/WIN animation → dismiss to result, and `h2hHoledUnits`
  correctly flags a unit as holed mid-hole (before advance). H2H regression + hv5 (multi-ball watch, now
  error-free) green; zero page errors. Client-only, no migration. Deployed to /golf.

- **CS178 — four tester (Jordo) fixes: bigger green on putts, one-button lobby fill, polished H2H
  scorecard, "back to home" copy.** All client-only, no migration; sim/score engine untouched.
  1. **Green close-up is tighter so short putts read** ("when it gets to the green, the green can be
     bigger — an 8-foot putt is really not right on top of the hole"). The TOURTRACE putt camera
     (`hvCamFor2`) floored the viewBox at 92 wide with 64/84 padding, so a short putt framed the ball+cup
     with a lot of air and the 8-footer looked like a tap-in. Tightened to a 60 floor + 40/54 padding, so
     the green fills the frame and putt distance reads (adaptive still holds: a 40-ft putt zooms out more
     than an 8-ft; verified short-putt viewBox 60 vs the old 92, long > short). Ball scaling (`bScale`)
     already adapts to the viewBox, so the ball stays a consistent on-screen size at the tighter zoom.
  2. **Lobby fill = ONE "Open to anyone" button, AI after 10s** ("shouldn't it just say open to anyone and
     then give u ai after 10 seconds"). Removed the separate "Start now vs AI" button from the private-lobby
     fill UI; the single "Open to anyone ▸" opens the lobby to the public pool and the AI fallback now fires
     at a fixed **10s** (was a random 9-13s). `h2hFillBots` is still used by the fallback, just no longer a
     manual button. Copy updated ("A waiting player joins — or AI fills in after 10s").
  3. **H2H scorecard polished** ("hate that I can't see my scorecard… could look better but glad its in").
     `h2hResultCard` now draws classic golf notation — a green **circle** for a birdie (double circle for
     eagle+), a red **square** for a bogey (double square for double+), par plain (`scMark(s,tp)`, colored
     by `dScoreCol`) — and highlights the winning unit's row with a gold tint + a trophy by the name.
     Screenshot-confirmed on the result screen.
  4. **"Back to title" → "Back to home"** everywhere (render-error fallback card, Spotlight result, H2H
     lobby back-link, H2H result) — matching the earlier daily-result "Return to home" rename.
  Verified in Playwright (cs178): the tighter putt camera, the single lobby button with no "Start now vs
  AI" + the "after 10s" copy, "Back to home" on the H2H result with no "Back to title" left, and the
  scorecard notation marks + winner tint. Regressions cs176/cs177 (H2H water/leaderboard-pin/result card,
  playoff play-out/celebrate/holed-scoreboard), hv6 (39-course geometry + putt property), hv8 (one-window
  daily HUD), practice, stall all green; zero page errors. Deployed to /golf.

- **CS179 — H2H matchup: OVR row made prominent (Jordo IMG_7907: "Overall should be a little more prominent
  than the rest").** On the "Tale of the tape" preview (`scrH2HPreview`), OVR was rendered like just another
  skill row (18px values). Elevated it to the headline stat: 29px tabular numbers in rounded banded cells
  (leader gold-tinted `rgba(235,166,31,.15)`, others a faint fill), a slightly larger gold "OVR" label, and
  a full-width gradient divider separating it from the skill rows below — so OVR reads as the top-line and
  the 8 skills as supporting detail. Client-only, no engine change. Screenshot-confirmed; zero page errors.
  Deployed to /golf.

- **CS180 — animated GIF shot-share (the CS157 fast-follow) + every share tagged @RunTheGG #golf
  #RunTheTour.** Owner: "do the gif shot share, and make all x/twitter shares tag @RunTheGG and use the
  hashtags #golf and #RunTheTour."
  • **GIF shot-share.** The round-review "Share this shot" button now builds a looping **animated GIF** of
    the hole playing out shot-by-shot on the TOURTRACE tracer (was a static PNG). Fully self-contained (no
    libs, CSP-safe): a median-cut quantizer (`gifMedianCut`) + nearest-color cache (`gifNearest`) + a
    correct GIF89a LZW encoder (`gifLZW`) + writer (`gifBuild`) — NETSCAPE loop, per-frame delays. The
    compositor (`hvGifShare`→`hvGifRender`→`hvGifCompose`) rasterizes the terrain once to a background
    canvas, then draws each shot's flight/roll + moving ball frame-by-frame (reusing `hvProj`/`hvCtrl`),
    holds ~2.2s on the final hole with a "Hole n · Par · score · RunTheTour" caption bar, and shares via
    `navigator.share({files})` (download fallback). Falls back to the static PNG (`hvShareShot`) on any
    failure/unsupported browser. **The LZW code-width bump was the one hard bug**: a naive bump-on-add is
    off by one vs the canonical GIF encoder (Kevin Weiner) and yields a "broken data stream" in strict
    decoders — fixed by bumping inside `emit` when `next>maxcode` (the emit AFTER the entry that fills the
    width). Verified by decoding the produced GIF with PIL: 280×377, 40 unique animating frames, pixels
    exact, ~0.7 MB. Screenshot-checked (tracer climbs mid-flight → full hole + markers + result at the end).
  • **Social tags on every share.** New `SOCIAL_TAG='@RunTheGG #golf #RunTheTour'` + `withSocial(t)`
    (idempotent), routed through the two share funnels (`shareText`, `shareCard`) and the shot GIF/PNG
    shares — so EVERY share caption (daily, season, major win, career/circuit end, spotlight, shot) carries
    the handle + hashtags. Verified the appended tag appears once and doesn't double.
  Client-only, no migration. Regressions hv8/cs178 green; zero page errors. Deployed to /golf.
- **CS181 — leaderboard: every instance of a player shows their most-updated username + tier tag.** Jordo
  (screenshot): the same player appeared with different tier tags/usernames across their rows. Root cause:
  every season/career is its own row (by design) and each froze the `display_name` + `rep_pts` AT SUBMIT
  TIME, so a player's older rows showed a stale name and a lower Tour Rep tier. Fix (client-side, in
  `overlayLeaderboard`): rep points only ever accrue, so the row with a user's highest `rep_pts` carries
  their newest username — normalize every row of the same `user_id` to that canonical name + the max rep
  (so all instances agree and show the most-updated tier), and for the signed-in viewer override with their
  LIVE `sbUsername` + current `achPoints()`. Guest rows (null user_id) are never grouped. Verified
  (cs181): three rows of the signed-in account all show the live name + tier; another player's two rows
  collapse to their latest name + highest tier; the guest row is untouched; zero page errors. Deployed to
  /golf. NOTE (minor, not fixed): a player who renamed but hasn't posted a season SINCE won't reflect the
  new name to OTHER viewers until they post once (the client only has posted rows). A server-side
  `profiles` join in the board RPCs would make it authoritative for that edge — flagged as an optional
  follow-up, not built.

- **CS182 — playoff ties now play on until someone wins outright + prominent "Tournaments Won" showcase.**
  Two owner asks (screenshot):
  1. **Playoff ties keep going** ("many times players tied on a playoff hole and a winner is determined — it
     should go to another hole until somebody beats the other"). Root cause: the career auto-sim
     `simPlayoff` scored each sudden-death hole as a CONTINUOUS float (`playoffHole` returned `gauss()*1.15
     - …`), so two players who both made a "Birdie" (e.g. 3.4 vs 3.5) had a winner declared on a hole they'd
     visibly tied. Fixed by making `playoffHole` return a SCORE-TO-PAR INTEGER (eagle/birdie/par/bogey/
     double) like a real playoff hole, and `simPlayoff` now advances only those tied for the low with EXACT
     integer equality — a full tie replays the hole, and a winner is decided only when someone is beaten
     outright (60-hole safety net). `poLabel` updated for the integer buckets. The Moment playoff and H2H
     playoff already used discrete integer scores (`dSimHole`/`holeScore`) and tie-continued correctly —
     only their arbitrary caps were raised (Moment 8→40 holes + headless 12→40; H2H's 45 kept) so a genuine
     tie can run instead of being force-decided. Verified (cs182): 4000 two-player sims, **0** cases where a
     winner was declared on a tied hole; 26% went to extra holes (2–7), matching real golf; the invariant
     "every non-final hole is a tie, the final hole the winner scored strictly lower" holds every time; a
     3-way playoff resolves correctly.
  2. **"Tournaments Won" showcase** ("make these much more apparent, bigger — redesign this section"). The
     tiny won-tournament `.tag` chips on the season summary are replaced with a titled section
     ("TOURNAMENTS WON · N titles this season") of prominent trophy cards — each a large card with the
     tournament name in 16px bold + a trophy graphic; MAJORS get their own custom major trophy
     (`majorTheme().svg` — Champion Blazer/Links Flagon/etc.), a gold border + gradient + glow, and a "MAJOR
     CHAMPIONSHIP" label, while regular wins get the generic gold trophy + "Tour victory". Screenshot-
     confirmed (major card glows gold with the blazer trophy; regular cards read clean). Regressions
     cs175 (summary money card/layout), hv7 (Moments/playoff) green; zero page errors. Deployed to /golf.

- **CS183 — In-game currency (Coins) + Pro Shop + equippable accessories with boosts (Phase 1).** Owner:
  "implement in-game currency + accessories that give boosts, a shop to buy them with coins, and many ways
  to earn coins (big milestones etc.)." Decisions (AskUserQuestion): **boosts apply in SOLO modes only**
  (Career + Daily; online H2H + boards stay fair), and the **full-body dressable avatar art will be
  AI-generated from prompts** I provide (see `AVATAR-ASSET-PROMPTS.md`) — so Phase 1 ships the whole
  economy + shop + boost system with clean **icon tiles**, and the visible worn-accessory avatar is Phase 2
  once the owner hands back the generated layers.
  • **Economy (farm-proof + cross-device):** coins are DERIVED from permanent progress —
    `coinsEarned()` = 300 welcome + Σ(unlocked-achievement points ×3) + milestone terms (wins 60 / majors
    400 / cups 300 / FedEx… Tour Cup 800 / medals / World No.1 600 / POY 450 / daily beats 20 / streak 25 /
    Spotlight 200 / seasons 40 / **career completed 1500** / rivalry / h2h wins / holes-in-one …) — minus a
    `spent` counter. Balance = earned − spent (≥0). Because earned is derived from already-synced stats it's
    identical on every device and can't be farmed by replaying. `bag_coins = {spent, seen, owned}` is
    account-scoped + added to the CS82 cloud bundle (`mergeCoins`: spent/seen = max, owned = union).
    `reconcileCoins()` (run after `evaluateAch` + on cloud pull) self-heals the earned floor, grants
    milestone gear, and toasts "+N coins earned"; null-safe defaults (per CS87).
  • **Accessories:** 32 purchasable items across 8 slots (Headwear/Eyewear/Glove/Shoes/Driver/Putter/Ball/
    Charm) × 4 rarities (Common→Legendary, ~400→16k coins), each with a small themed skill boost, plus 5
    **exclusive** milestone-earned items (first win/major/Grand Slam/World No.1/career-complete) that aren't
    for sale. `accBoost()` sums equipped gear, clamped **per-skill ≤6 and total ≤18**, and is baked in
    `buildPlayer()` — which feeds Career + Daily only; H2H uses its own draft, so gear never touches ranked
    play (verified). Equipped set lives in `look.acc` (synced LWW like the rest of identity). The build
    scorecard already shows the boosted numbers green ▲ (CS92 delta logic picks up the gear automatically).
  • **Pro Shop** (`overlayShop`, new SVG icons: coin/coins/cap/shades/glove/shoe/driver/putter/ball/charm/
    cart): coin-balance banner, slot filter chips (+ "My Gear"), rarity-colored item cards with boost/price/
    Buy/Equip/Unequip, equipped-first sorting. Signed-in feature (guests get a sign-in nudge, like
    achievements). Reachable from the ≡ menu, the title screen (with live balance), and the overlay
    dispatcher. `accBuy` deducts coins, adds to owned, auto-equips.
  Verified (cs183): all-achievements-unlocked → 39,570 coins; buy deducts exactly; a +3 driver lifts DRV
  80→83; stacked gear clamps to the per-skill/total caps; unequip removes the boost; milestone gear grants
  when metrics qualify; guests can't buy; `mergeCoins` max/union; the shop renders 35 action cards signed-in
  and a nudge for guests; screenshot confirms the layout. Regressions cs175 (summary/buildPlayer), hv8
  (daily uses buildPlayer), cs182 (playoff), cs177 (H2H unaffected) all green; zero page errors. Deployed to
  /golf. **Phase 2 (owner):** generate the avatar/accessory art from `AVATAR-ASSET-PROMPTS.md`, then I wire
  the full-body dressable avatar + visibly-worn gear. Tunables: `COIN_START`, the `coinsEarned` term
  weights, `ACC_SKILL_CAP`/`ACC_TOTAL_CAP`, item prices/boosts.

- **CS184 — Coins/Shop SHELVED behind a flag (owner: "put it on the backend for now, the system makes no
  sense — I could buy everything immediately and the boosts are too big").** The CS183 economy was derived
  from lifetime progress, so a long-time account (owner has hundreds of wins/achievements) started with a
  massive balance and could afford the whole catalog at once, and the accessory boosts were too strong.
  Rather than delete the (working) system, added `const SHOP_ENABLED=false` that fully hides it from the
  frontend: no "Pro Shop" link on the title, no Pro Shop row in the ≡ menu, `overlayShop` early-returns
  (route unreachable), and — importantly — `accBoost()` returns `{}` so any already-equipped gear gives
  **zero** boost (buildPlayer is back to unboosted; no sim/career/daily effect, no pay-to-win). The coin
  economy, catalog, shop UI and cloud sync all remain in code for a future rebalanced (likely
  server-authoritative) re-launch — flip `SHOP_ENABLED=true` to restore, after redesigning the coin
  formula + boost magnitudes. Verified (cs184): flag off → boosts empty, buildPlayer dist unboosted,
  title/menu show no shop, the overlay won't open. Deployed to /golf. (Phase-2 full-body avatar art
  pipeline is separate and unaffected — bases/masks/headwear assets remain committed for that build.)

- **CS185 — water splash (sound + animation), go-for-it decisions actually matter, distance calibration
  (owner IMG_7928/IMG_7931).** Owner played a par-5 over water and flagged three things (screenshots): a
  shot "bounced absurdly far and over a body of water"; the ball "says 11 ft from the hole but looks
  farther"; and after choosing "go for it" over the water, "my player laid up short — I want these
  decisions to actually matter... I should have seen my player hit it AT the green, with a high risk of the
  water. If a ball lands in the water I want a splash sound + a little splash animation." All changes are in
  the shot NARRATIVE (`dShotSeq`) + hole-view presentation (`hvLiveShot`/`hvKick`/`hvPlots`); the
  deterministic `dSimHole` score engine and the shot-count===stroke-count invariant are untouched
  (re-verified 8,640 go-for-it combos, 0 mismatches).
  1. **Splash sound + animation.** New `hvSplashSound()` (WebAudio, no assets): a low-passed decaying noise
     burst (the splash) + a low sine "ploop" (the ball entering), fired ONCE when a ball reaches the water
     (`_hvA.splashed` guard, skipped under reduced-motion). The splash visual is upgraded to a two-ring
     ripple (`hv-splash` + a delayed wider `hv-splash2`) plus 5 droplets (`hv-drop0..4`) that arc up out of
     the entry point and fall back, over ~600ms.
  2. **"Go for it in two" now reflects the decision** (the core fix). The reachable-par-5 approach decision
     (`go5`, `decPhase:'app'`) previously only biased the eventual green-arrival shot, so on any score that
     didn't reach in two the SECOND shot was a generic advance/lay-up — the "go for it" choice was invisible.
     Now `dShotSeq` tags `goForIt`/`layUp` and rewrites the second shot (after the revealed neutral drive) to
     MATCH the call: **aggressive** fires AT the green — reaching in two (birdie/eagle) holes out via the
     flag-hunting greenDesc; a blow-up (bogey+) goes at the green and FINDS THE WATER → penalty drop (the
     risk materializing, with the new splash); a par comes up "just short" near the green for an up-and-down
     — never a lay-up. **Safe** narrates a deliberate "lays up to a full wedge." So the shots you watch now
     reflect the decision you made, with the water as the real downside of going for it.
  3. **On-green distance calibration** ("11 ft looked farther"). The on-green rest was drawn at `ft/3` course
     units, which overstated the ball-to-pin gap relative to the green's drawn size; recalibrated to `ft/3.6`
     so an 11-ft shot sits ~22% of the green radius from the pin (proportionally accurate), matching the
     stated distance. The screen-aware minimum (tap-in visibility on long holes) and the CS178 putt close-up
     camera are unchanged.
  4. **Bounce-over-water** — the reported "bounced absurdly far over water" shot was the go-for-it attempt
     being mis-narrated as a full shot crossing the pond; routing the aggressive over-water attempt to a
     proper splash (fix #2) + the existing CS153 green-carry safety (a green-bound ball must carry a fronting
     hazard in the air, never bounce across it) covers it. Verified via cs185/cs185b (splash markup + sound
     safety; invariant + narrative: goForIt goes for the green / shows water blow-ups / comes up short,
     layUp lays up) and regressions hv6 (39-course geometry + putt property), hv8 (one-window HUD), physics
     (carry + backspin), cs162 (miss dispersion invariant), cs169 (putting), practice (full round) — all
     green, zero page errors. Deployed to /golf.

- **CS186 — Pro Shop RELAUNCHED (rebalanced economy) + full-body dressable avatar (signed-in).** Owner
  supplied the AI-generated accessory art (19 PNGs: eyewear, gloves, shoes, drivers, putters, ball, charms —
  banked in `public/avatars/golfers/full/acc/`, joining the earlier bases + headwear) and chose (via
  AskUserQuestion): "Full-body dressable for signed-in users. Reset all users to 0 coins, severely raise
  accessory prices, decrease the boosts." Both delivered.
  • **Economy rebalance (un-shelves CS184):** `SHOP_ENABLED` false→true. New `COIN_EPOCH=1` one-time reset —
    `coinState()` banks the current derived-earned as a `baseline` and wipes spend + owned gear the first time
    the epoch mismatches, so EVERY account starts at **0 coins** and earns going forward (`coinsEarned()` =
    `coinsEarnedRaw()−baseline`); equipped-but-unowned gear simply stops rendering. `mergeCoins` is now
    epoch-aware (higher epoch wins wholesale) so the reset propagates cross-device instead of the old owned
    gear being re-unioned back. **Prices ~5× higher** via a centralized `accPrice(it)` (common 2,500 / rare
    10,000 / epic 30,000 / legendary 85,000; clubs ×1.2) — gear is now a long-term goal, not an instant
    buy-everything. **Boosts severely cut:** `accItemBoost()` scales catalog boosts ×0.5 (min +1) and the caps
    dropped (`ACC_SKILL_CAP` 6→3, `ACC_TOTAL_CAP` 18→8) — a full loadout is now ~+8 spread, down from +18. The
    catalog literals are untouched; price/boost are computed centrally so the shop card, buy path, and sort all
    read the rebalanced values.
  • **Full-body dressable avatar (signed-in):** new `paintAvatarFull()` recolors the full-body base
    (`full/base-{g}.png`) via its region mask (`avMaskRegionFull`: skin=red/hair=green/shirt=blue/pants=yellow/
    shoes=magenta — reuses the existing `avTint`/`avKitLp` machinery, adds pants) and composites the EQUIPPED
    accessories on top. The accessory art is large "product-shot" scale, so each is placed by a per-slot config
    (`ACC_PLACE`: target width/height as a fraction of the base + an anatomy anchor from `AV_ANAT`, measured
    from the base masks) after trimming to its content bbox (`ACC_BBOX`); `ACC_ART` maps each shop item id →
    art file (partial coverage reuses the nearest). Draw order back-to-front (clubs at the sides, shoes, hand
    items, face, hat). Cached per look+gear key. Rendered on the **setup "Create your golfer"** sticky preview
    (300px tall) and as a live **Pro Shop dressing room** (updates as you buy/equip). **Guests keep the
    portrait bust** (`avatarShowHTML()` gates on `sbSignedIn()`); the build-hero + Trophy Room stay portrait
    for now (limited blast radius — extendable later). Fails over to the vector portrait if the base art 404s.
  • **Deploy note:** the full-body assets (`golf/public/avatars/golfers/full/**`) must be copied to `main`
    alongside `golf/index.html` (only `base/` was there before).
  • Verified in Playwright (cs186a/b/c): shop enabled, coins reset to 0 (owned cleared, baseline banked),
    prices raised + boosts reduced, broke account can't buy; the full-body avatar renders dressed on the setup
    screen (signed-in) and as the shop dressing room, guests get the portrait; regressions hv8 (daily HUD),
    cs185b (go-for-it), practice (full round) all green, zero page errors. Screenshots confirmed the dressed
    golfer + rebalanced shop. Tunables: `accPrice` tiers, `ACC_BOOST_SCALE`, the caps, `ACC_PLACE` per-slot
    placement. Note: a couple of catalog items reuse art (only 3 eyewear / 3 driver / 2 charm arts for 4/4/4
    items); more art can be dropped in and mapped in `ACC_ART`.

- **CS187 — regenerated the full-body avatar masks (fix the "really bad" masking).** Owner (IMG_7936):
  the full-body recolor showed a **pink band across the belt/waist** — the polo colour bleeding onto the
  waistband — plus speckle. Root cause: the CS183 auto-segmented full-body stencil masks were noisy exactly
  in the shirt→pants transition; the belt/waistband pixels were mislabelled **shirt** (blue), so they took
  the polo colour. Rebuilt both masks (`full/base-{male,female}-mask.png`) from the base ART directly with a
  clean, calibrated classifier: skin = warm saturated (hue 8–50°, s>0.32), hair = dark warm mass (l<0.30),
  and the achromatic garments split by **lightness + position** — polo is near-white (l≈0.97) in the upper
  body, pants+belt are mid-grey (l≈0.82), shoes are bright white at the feet — with a waist-Y guard so a
  bright belt buckle can't read as shirt, plus a 3×3 majority denoise to kill isolated speckle. The belt now
  recolours with the pants (matching), so the pink band is gone. Validated by recolouring with vivid
  non-default colours (pink polo / red trousers / dark skin / blonde hair) on both genders — crisp regions,
  no bleed — and confirmed in-app via the real `paintAvatarFull` path on the owner's exact look (deep skin /
  blonde / pink polo / stone trousers): clean. Only the mask PNGs changed; no JS. Deployed (masks copied to
  `golf/public/avatars/golfers/full/`).

- **CS188 — full-body eyebrows stop following the hair colour.** Owner: on the full-body avatar the
  eyebrows took the hair colour (garish with blonde/grey/platinum). The brows are baked into the mask's
  HAIR region, so they were recoloured with the hair. Mirrored the portrait's fix: `avIsBrowFull(nx,ny)`
  (a central-face band, ny 0.050–0.082 × nx 0.34–0.66, measured from the base faces) — hair-region pixels
  in that band are tinted to the fixed `BROW_HEX` natural brow instead of the hair colour, in
  `paintAvatarFull`. Verified in-app on both genders with blonde hair: brows render dark (l≈0) while the
  hair is blonde (l≈0.48). JS only.

- **CS189 — cache-bust the avatar art so the CS187 mask fix actually reaches devices.** Owner (IMG_7940):
  the blue belt/waistband was STILL showing. Root cause: not a mask bug (verified in-app — the current mask
  renders the belt stone/pants-coloured, belt→pants colour-distance 49 vs belt→shirt 66), but the **service
  worker** serves same-origin static assets **cache-first**, so the device kept the OLD cached mask PNG while
  the CS188 eyebrow fix (network-first HTML) did land. Fixed: `AV_VER` appended as `?v=` to every avatar image
  URL in `avLoad` (bump it on any base/mask/accessory art change → the new URL isn't in the SW cache → fetched
  fresh) + bumped the SW `CACHE` `runtour-v1`→`v2` to flush the stale entries on next load. Verified the avatar
  still renders with the versioned URLs. Deploy: index.html + `golf/sw.js`.

- **CS190 — full-body avatar: dark-brow fix (no side stripe), selectable free cap, build-page uses the full
  golfer.** Three owner notes:
  1. **"Blonde hair has a dark stripe on the sides."** The CS188 render-time brow band spanned the full head
     width, so it darkened the temple/side hair too. Fixed at the MASK level instead: regenerated both masks
     carving the EYEBROWS + eyes out of the hair region (a hair pixel inside the measured **face oval**, below
     the hairline → left as base art = natural dark), so all the hair (incl. temples/sideburns) recolours
     cleanly while brows/eyes stay dark. Broadened the hair classifier (catches dark desaturated hair-shadow
     pixels) + a speck-fill so no stray dark flecks remain. Removed the render-time `avIsBrowFull`. Validated
     platinum-blonde on both genders: brows dark, hair fully blonde, no stripe, no specks.
  2. **"No way to select a hat."** The full-body avatar only showed a hat if a shop headwear item was equipped,
     so the setup Hat-colour picker did nothing. Added a FREE basic cap: `avTintedCap(hex)` recolours the
     `acc-head-cap` art to the player's hat colour (cached), drawn on the head when no shop headwear is equipped
     and the cap is on; plus a **Cap on/off** toggle (`capToggleRow`) in setup next to the Hat colour row
     (`look.cap`, default on). Verified: navy cap renders on the head, toggling off shows hair.
  3. **"The build-page headshot should match the full golfer."** `buildHero` now uses `avatarShowHTML()` — the
     signed-in build screen shows the same full-body dressable golfer (cap + kit) as setup, with the OVR chip
     over it, instead of the old portrait bust.
  Bumped `AV_VER` 2→3 so the regenerated masks bust the SW cache. Verified in-app (cap on/off, build-hero full
  body, dark brows) + regressions (shop/economy/guest-portrait) green, zero errors. Deploy: index.html + the
  two regenerated masks.

- **CS191 — cap sizing/placement (too big+covering, then too high; seated at brim=brow).** The head-slot placement anchored the
  hat's TOP at the crown, so the tall cap art's big brim hung down over the eyes. Re-anchored it by the
  BRIM: `ACC_PLACE.head` now `{wFrac:0.34 (was .40), ax:'headCx', ay:'browLine', anch:'bottom'}` with a new
  `browLine` anatomy anchor (male 84 / female 98), so any headwear's brim sits at the brow line and the crown
  auto-fits above — the face stays fully visible regardless of the hat art's height (cap/visor/bucket/champ).
  Verified in-app both genders: cap on top of the head, brim at the brow, face clear. HTML only.

- **CS192 — full cosmetics economy: every colour/pattern/accessory is a shop purchase (a real grind).**
  Owner: put each shirt colour, shirt pattern, hat colour, trouser colour, shoe colour, and accessory in the
  shop; default everyone to a **white shirt + no hat**; purchases appear in the player's customization; make
  it a genuine grind (not "buy everything after one career").
  • **Unified cosmetic ownership** on the existing coin economy: purchases live in the cloud-synced
    `coinState.owned` map under namespaced keys (`sh:`/`sp:`/`ht:`/`pt:`/`so:` for shirt/pattern/hat/trousers/
    shoes; accessories keep their ids). `FREE_COSMETICS` = the starting kit (white shirt, solid pattern, white
    trousers→stone, white shoes, white hat). Helpers `cosOwned/cosBuy/cosmeticPrice/cosmeticItems/cosEquip`.
    Because it rides the same `owned` map, cross-device sync + the CS186 0-coin reset apply automatically.
  • **Defaults** (`DEFLOOK`): `polo:'white'`, `cap:false`, `pants:'stone'`, `shoes:'white'` — a fresh golfer
    is a plain white shirt, no hat, and everything else is locked until bought.
  • **Grind prices**: shirt colour 4k (special/lore colours 12k), pattern 10k, hat 4k, trousers 4k, shoes 4k;
    accessories keep their CS186 prices (2.5k–102k). Full catalogue ≈ **1.3M coins**; a strong career earns
    ~20–35k, so buying everything is ~40 careers — a real grind (all tunable via `cosmeticPrice`/`accPrice`).
    Cosmetic colours are no longer achievement-gated — they're purchased.
  • **Customization gating** (setup): `cosColorRow`/`cosPatRow` show OWNED colours/patterns as selectable and
    LOCKED ones dimmed with 🔒 + price; tapping a locked one opens the Pro Shop to that category. Added
    **Trousers** and **Shoes** colour rows (new `SHOES` palette; trousers expanded to 8). Skin/hair stay free
    (appearance, not purchasable).
  • **Shoe colour** now recolours the full-body avatar's shoe mask region (white shoes keep the base art;
    any other colour tints via the same machinery). `avLook` carries `shoesHex`.
  • **Shop** (`overlayShop`): new category chips (Shirt colour / Shirt pattern / Hat colour / Trousers /
    Shoe colour) alongside the accessory slots; `cosCard` renders a swatch + name + price with Buy/Equip/
    Remove; the dressing-room avatar updates live as you buy/equip. Buying auto-equips.
  • **Migration**: `grandfatherLook()` (on sign-in) marks a returning player's currently-worn shirt/pattern/
    hat/trousers/shoes as owned, so the shop launch never strips their existing look.
  Verified in Playwright: defaults (white/no-hat), setup pickers show only white owned + the rest 🔒, buying
  navy shirt/argyle/navy trousers/red shoes/gold hat deducts 26k + equips (hat turns the cap on), can't
  rebuild an owned item, broke can't buy, the shop renders all categories with the live dressed avatar;
  economy/guest/cap regressions green, zero errors. Deployed (HTML only). NOTE: profile "wardrobe" display is
  covered by the account-scoped ownership + customization; a dedicated Trophy-Room wardrobe grid could be
  added later if wanted.

- **CS193 — branded Coin currency icon.** Owner: "create a coin icon with our logo on it and use that as
  the currency." Added `ICONS.coin` (a gold minted coin — reeded/dashed edge, inner rim, RunThe.GG
  flag-over-green emblem) + `ICONS.coins` (a matching two-coin stack for balances), drawn in the same
  inline-SVG style as the rest of the UI icons so they inherit theme sizing/alignment. `coinFmt(n)` now
  comma-groups the number with NO leading "$" — the coin icon IS the currency mark (e.g. the shop banner
  reads a gold coin + "12,500"). The icons render in the Pro Shop balance banner, on Buy buttons, and the
  title-screen shop entry. HTML only.

- **CS194 — full-body avatar: patterns now render + kit colours are actually dark (owner: "The patterns
  are not working on the new profiles... The colors are also not nearly dark enough. It all looks like
  variations of white with a tint on it").** Two real bugs in `paintAvatarFull` (the signed-in dressable
  avatar) plus more patterns:
  1. **Colours too light.** The full-body kit ART is near-WHITE (measured base region means: shirt ~0.96,
     shoes ~0.95, pants ~0.80), and the recolour used `avTint` with a lightness LERP (`avKitLp` → ~0.12
     pull for mid colours), so a navy/black garment came out as pale-tinted white (navy rendered at
     lightness ~0.88). New `avKitTint(r,g,b,hex,baseMean,satB)` instead SHIFTS the whole garment's
     lightness so its MEAN lands on the target colour while preserving the base fold/shading contrast
     (`sl = target_l + (base_l − baseMean)·0.9`, clamped). Per-gender base means in `AV_KIT_MEAN`. Now
     navy renders at lightness **0.216** (was ~0.88), black 0.147, white stays 0.937, and a shadow fold
     stays darker than a mid pixel (shading kept). Used for shirt/pants/shoes; skin/hair keep their
     existing per-target `lpull` (they were already correct).
  2. **Patterns weren't applied at all** in `paintAvatarFull` — the portrait `avCompute` overlaid the
     shirt pattern but the full-body recolour loop never did. Added the shirt-pattern overlay to the shirt
     branch (`patFactor(o.shirtPat, x, y)` clipped to the shirt mask region, tone light→lighten /
     dark→darken by `depth·pf`), so a purchased pattern now shows on the dressed golfer.
  3. **6 new patterns** (auto-flow into the Pro Shop + setup pickers via `cosmeticItems('pat')`):
     Checkerboard, Windowpane, Diagonal, Micro Dot, Herringbone, Camo — each with a `patFactor` case
     (verified coverage 6–59%, all render cleanly).
  Verified via a node unit test of the extracted colour math + pattern functions (navy/black/white
  lightness targets, shading preservation, all new patterns render); inline scripts parse clean. HTML only.

- **CS197 — all equipped accessories fit the golfer naturally (both genders).** Owner: "make all of the
  accessories fit on the golfer perfectly, as if they were part of the same image." Replicated the
  `paintAvatarFull` compositing in Python to render the actual dressed golfer and calibrated every slot
  against the measured anatomy (hands, feet, eyes, waist read from the base masks; male hands at hip level
  ~y730, the skirted female's hands higher-relative ~y778). Fixes: glasses now sit ACROSS the eyes
  (eyeY 98→116 male / measured 155 female, was on the brow); the glove is worn ON the right hand (was
  floating on the thigh — the old handY/handRx anchors were wrong); the ball is held at the left hand; the
  ball-marker charm is clipped at the belt/pocket (`hipLx` anchor) instead of floating on the crotch; and
  the driver/putter now GRIP at the hand with the head on the ground via a new `spanY:['gripY','footY']`
  placement mode that scales a club to span two anatomy anchors (so it lands correctly on both the male and
  the shorter-torso female). Verified by rendering the full male + female composites with one item per slot;
  HTML only (no art/mask changes).

- **CS198 — ball placement + Pro Shop redesigned as a game-style locker.** Owner: "the ball is still
  floating awkwardly, and the functionality of the entire profile/shop needs updating — the UI/UX is not
  great... look how other games do it."
  • **Ball** now rests on the ground at the golfer's feet (a ball at address) instead of floating by the
    hand — reads naturally on both bodies (verified in the render harness).
  • **Pro Shop rebuilt** (`overlayShop`) into a locker like 2K/Fortnite/Rocket League: a STICKY top with
    the title, a prominent gold coin-balance pill, a live full-body avatar preview, a two-level nav
    (Apparel / Equipment / My Items → category chips), and a responsive grid of compact **tap-to-act
    tiles**. Each tile shows a colour/pattern swatch or a rarity-coloured gear icon, the name, gear boosts,
    and a clear state: EQUIPPED (gold ring + ✓), OWNED, or LOCKED (price + coin, dimmed if unaffordable) —
    plus a rarity dot on gear. Tap an owned item to wear it, tap a locked one to buy+equip; the preview and
    balance update live. Replaces the old one-big-card-per-item list with a button on every card. New
    helpers `shopTile`/`cosTileHTML`/`accTileHTML`/`shopTileClick`/`patSwatchBg`; `openShopTo` retargeted to
    the new `shopSec`/`shopCat` state. Verified with headless Chromium (Apparel + Equipment tabs, equipped/
    locked states, rarity dots, boosts, prices all render; zero page errors). HTML/CSS only.

- **CS199 — glove that actually fits the hand (procedural, not a pasted product shot).** Owner: "the glove
  looks really bad — make a new glove that fits the golfer's hand." The old glove was a product-shot PNG
  composited near the hand, which never sat right. Replaced it entirely: the glove is now PAINTED onto the
  golfer's OWN hand pixels — a golf glove is a form-fitting white hand, so recolouring the fist's skin white
  (preserving its knuckle/finger shading) fits perfectly by construction, plus a drawn wrist-strap band.
  New per-gender `glove{Cx,Cy,Rx,Ry}` fist ellipse in `AV_ANAT` (the male hand is against the trousers so a
  loose ellipse is clean; the skirted female's hand abuts her bare leg so hers is a tight ellipse on the fist
  — also corrected the female right-hand anchor 286→320, which aligns the driver grip onto the real hand).
  `gloveHexFor(id)` picks white (or gold for the Golden-Grip Glove). Removed the glove from the accessory
  art/draw-order; the shop still sells/equips it (icon tile) — it just renders on the hand now. Verified by
  rendering the real full-body avatar over http (so the canvas isn't file:// tainted) for both genders with a
  glove + clubs equipped: the gloved hand conforms to the fingers, wears the strap, and grips the club; zero
  page errors. HTML only.

- **CS200 — pixel-perfect shirt edges (mask cleanup).** Owner (screenshot of a red pinstripe polo): "the
  shirt is a little pixelated at the edges — make it pixel perfect." Diagnosed by reproducing the recolour in
  Python: the mask is 1:1 with the base (no scaling), but the mask GENERATION had mislabeled the shirt's
  bright-white detail pixels — collar/placket/seam/cuff/hem highlights (pure white in the base art) were
  tagged as background or `pants` or `skin`, so the recolour skipped them and the near-white fabric showed
  through as jagged light blotches. Cleaned up both full-body masks (`base-{male,female}-mask.png`) offline:
  (1) flood-fill fully-enclosed shirt holes; (2) reclaim bright pixels strongly surrounded by shirt; (3) an
  edge pass that reclaims the mislabeled hem/seam pixels adjacent to the shirt — stray `pants` labels above
  the real waist, bright `None` highlights (never the dark silhouette edge), and pure-white hems over skin —
  while protecting normal skin, hair, shoes and the background. The cleanup only ever relabels TOWARD shirt,
  so it can't damage other regions. Bumped `AV_VER` 3→4 and the SW cache v2→v3 so devices fetch the corrected
  masks. Verified by rendering the REAL full-body avatar over http (canvas not file:// tainted) with a red
  pinstripe and a navy polo on both genders: crisp clean edges at collar/sleeves/placket/hem, no blotches,
  shirt stays within its boundaries; zero page errors. Mask PNGs + AV_VER/CACHE bump only (recolour code
  unchanged).

- **CS201 — glove now covers the WHOLE hand (was stopping halfway).** Owner (with a real golf-glove
  reference): our glove only covered the fingers/lower hand, leaving the back of the hand + wrist bare — a
  real glove covers the entire hand to the wrist. Measured the right-hand skin profile from the masks: the
  male fist runs y≈680–770 (back-of-hand/wrist down to fingertips) but the glove ellipse was centred at
  cy=742 (over the fingers), so it missed the top of the hand. Raised + enlarged the glove ellipse
  (`gloveCy` 742→721, `gloveRy` 46→55, `gloveRx` 36→39) so it now spans wrist→fingertips with the strap
  sitting at the wrist like a real glove cuff; nudged the female ellipse down/bigger to match her lower fist
  (cy 740→748, ry 28→34, rx 22→24). Verified by rendering the real avatar over http for both genders — the
  whole hand is gloved to the wrist, zero page errors. HTML only (recolour code + masks unchanged, no cache
  bump needed).

- **CS202 — female cap + glove fixed (bad anatomy anchors).** Owner (female avatar screenshot): "hat and
  glove are off." Gridded her face and found the `AV_ANAT` female anchors were badly wrong — her eyes are at
  y≈97 (brow ≈82) but `eyeY` was 155 and `browLine` 114 (down at her nose/mouth), so the cap brim sat over
  her eyes and glasses would too. Fixed `browLine` 114→80 (brim now at the brow, eyes visible) and `eyeY`
  155→97. Gridded her right hand and found the fist at ≈(326, 746) spanning y≈705–790; the CS201 glove
  ellipse was too low/left (on the thigh), so re-centred it on the fist (`gloveCx` 320→326, `gloveCy`
  748→746, `gloveRx` 24→25, `gloveRy` 34→40) — the glove now covers her hand with the strap at the wrist.
  Verified by rendering the real female avatar over http (cap seated at the brow with eyes visible, glove on
  the fist); male unchanged. HTML only.

- **CS203 — female glove: cover the whole hand to the wrist, stop bleeding into the leg.** Owner: the glove
  should cover the entire hand up to the wrist and it was bleeding into the bare leg. Her hand and thigh are
  one continuous skin mass, so the recolour ellipse both missed the wrist and spilled its rounded bottom onto
  the leg. Gridded the hip/hand/leg region: the fist is ≈(333,736) spanning y≈694–780 with the leg directly
  below (no gap). Re-fitted the ellipse (gloveCx 326→333, cy 746→736, rx 25→21, ry 40→44) so it covers
  wrist→fingertips, and added a per-gender hard lower bound `gloveMaxY=781` — the glove recolour never
  applies below the fingertips, so it can't bleed into the leg. Verified over http: the glove covers the
  whole hand with the strap at the wrist and stops cleanly at the fingertips (leg stays bare). Male
  unaffected (no `gloveMaxY`). HTML only.

- **CS204 — themed the Country/Caddie dropdowns.** Owner: make the dropdown boxes more appealing. They were
  bare white native `<select>`s because the dark input style was scoped to `input.name` only. Added a
  `select.name` rule: dark navy fill with a subtle top-highlight gradient (matching the text inputs), cream
  text, rounded corners, a custom gold chevron (inline SVG, `appearance:none`), gold hover/focus ring, and
  dark-styled `option`s. Applies to the Country and Caddie selects on the setup screen. Verified over http —
  the dropdowns now match the dark-green theme; zero page errors. CSS only.

- **CS205 — site-wide legibility pass (category labels + body text).** Owner: the category fonts/sizes are
  sometimes hard to read across the site; make it easier on the eyes on desktop and mobile, keep enough info
  above the fold, clear and space-efficient. The culprit was the small uppercase "eyebrow" category labels —
  ~10px, heavy `.16em` letter-spacing, in a low-contrast muted grey-green. Fixed globally at the shared
  tokens/classes so every screen benefits at once: brightened `--muted` `#88a397`→`#accabb` and `--pagemut`
  `#9cbfa8`→`#b7d3c2` (much better contrast on the dark-green bg); `h2` 12→13px + letter-spacing .16→.1em;
  `.small` 12.5→13px; `.lede` set to 15px/1.45 line-height; `.tag`/`.online-tag` 10→11px + tighter spacing;
  the `setupHeader` category rule 10.5→12.5px, brighter colour, less spacing; and bumped the 13 inline
  `font:800 10px` eyebrow labels to 11.5px. All conservative size/contrast changes (no reflow risk). Verified
  by rendering the title (mobile + desktop), setup, and shop over http — category labels are noticeably more
  readable, layouts intact, good above-the-fold density; zero page errors. CSS/label-size only.

- **CS206 — course record is now a celebration pop-up + a prominent banner.** Owner (screenshot of the
  daily result's small "New course record!" scout card): "Getting the course record should be a pop up and
  then listed more prominently." New `celebrateCourseRecord(courseName, scoreTxt, opts)` — a full-screen
  `.celebrate` overlay (reusing the win-celebration infra: gold `winTrophySVG` trophy that pops in, spotlight,
  gold/green confetti cannons, haptic buzz, "COURSE RECORD / New Record! / {score} · You hold the record at
  {course}", a Continue button + tap-anywhere to dismiss; reduced-motion safe, fires `track('daily_course_record')`).
  It fires ONCE per result on `scrDailyResult` when `r.record` is true (guarded by `r._crCelebrated` so async
  re-renders — crLoad/dbLoad/verifyDailyRecord — don't re-fire it, and a 360 ms `setTimeout` gated on
  `S.screen==='dailyresult'` so it lands after the result paints without stranding if the user leaves). The
  small `.scout` "New course record!" card was replaced with a prominent gold-bordered banner (gradient fill +
  glow, a trophy, "NEW COURSE RECORD", the score in the display font, "You hold the record at {course}").
  Mirrored the same treatment on the **Monthly Spotlight** result (`scrSpotlightResult`) — its own kicker
  ("{month} Spotlight Record") and banner. The result sits underneath the overlay, so nothing is lost on
  dismiss. Verified over http in Playwright: forcing a daily result with `record:true` renders the prominent
  banner AND fires the pop-up (trophy SVG + confetti + correct "64 (−8) · You hold the record at Magnolia
  Hollow…" copy); Continue removes it and a re-render does not re-fire it; zero page errors. HTML only.

- **CS207 — achievements + ranks buffed for a long-haul grind (owner: "a lot more achievements and levels…
  should feel like it takes a very long time to get through levels and ranks. And there should be a lot of
  them").** The owner hit near-max Tour Rep in ~1-2 weeks. Two coordinated levers, both pure content (no new
  capture wiring, all new tiers reference metrics already in `achMetrics`):
  1. **~90 new achievements → 289 total (was ~200); total points 13,090 → 30,600 (~2.3×).** An "EXPANSION 3"
     block of deep prestige tiers on every accumulating metric — wins 300/500/750/1000, majors 75/100/150,
     seasons 100/150/250, careers 50/75/100, starts 1k/2.5k/5k, top-10s 3k/6k, cuts 3k/7.5k/15k, earnings
     $10B/$25B/$50B, net $1B/$5B, daily played 1k/2.5k/5k, daily beats 750/1.5k/3k, streak 500/1000, online
     wins 250/500/1000 + matches 500/1.5k/5k, circuit wins 50/100 + majors 10/20, Cups 15/25 + apps/points
     tiers, spotlights 36/60, rivals 50/100, POY 5/10, World No.1 5/10, weeks-at-No.1 100/250/500, playoffs
     25/50, comebacks/wire-to-wire 10/25, daily eagles 250/500, aces 3/5/10, daily records 25/50, a 99-OVR
     build, single-season Grand Slam ×2/×3, and more. These are years of play, so they massively inflate the
     denominator.
  2. **Tour Rep ladder 9 → 20 ranks.** New `REP_TIERS`: Amateur · Rookie · Qualifier · Journeyman · Tour
     Regular · Tour Pro · Established Pro · Contender · Challenger · Rising Star · Star · All-Star · Standout ·
     Champion · Elite · Superstar · Legend · Immortal · Icon · G.O.A.T. — thresholds as a % of total points on
     a convex curve (cheap early rank-ups: Rookie 306 pts, Qualifier 765; progressively steeper: Icon 29,529,
     G.O.A.T. = 100% completion). All the milestone names the rest of the game couples to (Amateur/Journeyman/
     Tour Pro/Contender/Star/Champion/Legend/Icon/G.O.A.T.) remain, with the new ranks inserted between them.
  Everything that reads a rank was made ladder-length-relative so nothing breaks: `caddieUnlocked` /
  `nextCaddieUnlock` use a new `caddieUnlockIndex(tier)` that spreads the 8 caddie tiers proportionally across
  the ladder (tier 8 → Amateur, tier 1 → Icon); off-season perks are now `repPerkFor(name)` computed from the
  rank's ladder fraction (floor 1 change + 1 re-spin → max 3/3 by ~Superstar) instead of a per-name table;
  `REP_CLASS` maps every rank (incl. the new ones) to an existing `.rept-*` leaderboard text effect (no new
  CSS). `repAtLeast()`, the rank-gated cosmetics/titles, and the `rep_*` title badges all key off names that
  still exist, so they're unaffected.
  **Effect (told the owner):** nobody LOSES anything — every unlocked achievement + its points are preserved;
  the rank NAME just recomputes live against the bigger ladder. A near-maxed account (~11k pts) now reads
  ~Star with a long climb, not near-Icon — the intended "takes a long time" outcome. Verified over http in
  Playwright: 289 achievements, 0 duplicate ids, every get()/goal/pts valid + every category valid; the
  rank/perk/caddie/text-effect mapping computed correct across all 20 ranks; the Trophy Room + Tour Rep bar
  render populated with zero page errors. Tunable: `REP_TIERS` fractions, the tier point values. HTML only.

- **CS208 — title-screen destinations promoted to prominent nav tiles.** Owner (screenshot): the four
  bottom links (How to Play · Leaderboard · Trophy Room · Pro Shop) should be more prominent, "especially
  Leaderboard, Trophy Room and Pro Shop." They were a small muted text-link row (`.home2`, CS123). Replaced
  with a `.home-nav` grid of proper tile buttons (`.navtile`): a gold icon, bold label, and a one-line sub,
  2×2 on phones / 4-across ≥600px, with hover lift + gold focus ring. Leaderboard / Trophy Room / Pro Shop
  get the emphasized `.hot` treatment (gold-tinted gradient + gold-ish border) so they stand out; How to Play
  is a normal tile. Subs are context-aware: Leaderboard "Rankings"; Trophy Room "Trophies & rank" (signed-in)
  / "Sign in" (guest); Pro Shop shows the live coin balance (coin icon + `coinFmt(coinBalance())`) signed-in
  / "Gear & boosts" guest; How to Play "Rules & tips". Verified over http at a 430px viewport: 4 tiles render
  in a 2-col grid, the three named ones flagged `.hot`, old `.home2` gone, zero page errors; screenshot
  confirms the prominent cards. CSS + one scrTitle block; HTML only.

- **CS209 — Pro Shop: preview + confirm before buying (no more accidental one-tap purchases).** Owner
  (screenshot): "There needs to be a confirmation before purchasing... it currently buys it if you click on
  it. Players should be able to preview the item before confirming." Tapping a LOCKED item used to call
  `cosBuy`/`accBuy` immediately (spend + equip on a single tap). Now it opens a preview+confirm flow: the
  tapped item is shown ON the golfer in the live avatar (nothing spent), and the grid is replaced by a
  gold-bordered confirmation card — item name, price (coin icon), "Balance X → Y after" (green if
  affordable, red if not), and Cancel / Buy buttons (Buy disabled + "Not enough coins" when short). Only
  Buy spends coins + equips; Cancel or tapping another category/the ✕ discards the preview. Owned items still
  equip instantly (no cost, no confirm). Implementation: new `S.shopPreview={kind,cat,id,slot,name,price}`;
  `shopEffLook()` merges a pending COSMETIC into the avatar's look, and `paintAvatarFull` injects a pending
  GEAR item into the equipped set — both guarded to `S.overlay==='shop'` so a stale preview can never leak to
  setup/build/other screens; the pending-canvas painter now paints full avatars with `shopEffLook()`.
  `shopTileClick` sets the preview for locked cos/acc taps instead of buying; `shopConfirmBuy()` performs the
  real purchase; the preview is cleared on cancel / section / category / close. Verified over http in
  Playwright: tapping a locked colour previews it on the golfer with the balance unchanged and the confirm
  card shown; Cancel leaves it unowned + unspent; a second tap → Buy deducts exactly the price, marks it
  owned, and equips it; zero page errors. Screenshot confirms the golfer wearing the (unowned) previewed
  shirt above a clean confirm card. HTML only.

- **CS210 — title-screen colour hierarchy cleanup (owner-approved "full cleanup").** Owner asked whether the
  title button colours were "the most efficient" — they weren't: teal was used for BOTH Resume and Play
  Online, and gold for BOTH "Career Mode (start new)" AND the Daily "Done" state, and the returning player's
  primary action (Resume) wore teal while the destructive "start a new golfer" wore the loud gold. Via
  AskUserQuestion the owner picked the full cleanup: each colour now means exactly one thing. **Gold = your
  single primary action** — when a career/draft is in progress, **Resume Career Mode / Resume Your Golfer** is
  gold `goldfill` and "Career Mode (start a new golfer)" drops to a quiet `ghost` outline (it's not what a
  returning player usually wants and it retires the current golfer); with nothing to resume, Career Mode is
  the gold primary. **Blue = Daily Challenge** always, including the "Done" state (was flipping to gold).
  **Teal = Play Online only** (unchanged). Verified in Playwright both states: career-in-progress →
  Resume=goldfill, Career Mode=ghost, Daily=blue; fresh → Career Mode=goldfill, Daily=blue; zero page errors;
  screenshot confirms the cleaner hierarchy. (Monthly Spotlight keeps its own gold+pulse event identity,
  visually separated below Daily.) HTML only.

- **CS211 — shrink the eyewear + shoes on the full-body avatar (owner: "Glasses and shoes too big").**
  The equipped sunglasses spanned wider than the face and the shoes reached up the shin. Reduced the
  `ACC_PLACE` target widths: eyewear `wFrac` 0.34→0.25 (now sits across the eyes at face width, not wider)
  and shoes `wFrac` 0.92→0.62 (the pair now sits at the feet, sized to the stance). Both apply per-gender
  (scaled off each base's width), so male and female stay proportional. Verified over http by rendering the
  real full-body avatar (aviator glasses + BOA shoes) on both genders — glasses fit the face, shoes fit the
  feet, zero page errors. JS-only (placement config; no art/mask change, so no cache-bump needed).

- **CS212 — toast no longer clashes with the "scroll to continue" pill (owner screenshot).** On the season
  summary the "+100 coins earned!" toast rendered right on top of the gold `.scrollcue` pill ("Scroll down ·
  Continue to Year N") — both are `position:fixed` bottom-centre. Fixed `toast()` to detect a `.scrollcue`
  on the page and raise itself above it (`bottom: calc(74px + safe-area)` when a cue is present, else the
  normal 26px), and bumped its z-index 30→45 so it's cleanly on top. Verified over http: with a cue present
  the toast sits above it with a clear gap (no overlap); with no cue it stays at 26px; zero page errors.
  CSS/JS one-liner.

- **CS213 — Career Moment: the field's Sunday now plays out LIVE (fixes "the 2nd/3rd guy always wins by
  2-3 at the end").** Tester (Jordan): playing the final round hole-by-hole with a lead/tied, "all of a
  sudden the guy in 2nd or third always wins by 2-3 strokes." First *measured* whether the Moment engine was
  actually unfair — it's not: a Monte-Carlo vs a fully-simmed baseline showed playing the round changes the
  leader's win-rate by only 0.1-0.7 pts (mean calibration bias ≈ 0; the played round's SD is a hair lower,
  ~2.7 vs ~2.9, negligible). The real problem was **presentation**: the on-screen leaderboard showed the
  opponents FROZEN at their start-of-Sunday totals (their round 4 wasn't simmed until you holed out on 18),
  so you appeared to lead all day and then 2-3 of them leapfrogged you the instant the round ended — "out of
  nowhere." Fix: `startMomentRound` now PRE-SIMS the whole field's Sunday round up front (`o._r4sim`), the
  Moment leaderboard REVEALS each opponent's round progressively (× holes you've played / 18) so challengers
  visibly make their moves as you go, and `finishMomentRound` REUSES those exact pre-simmed scores — so the
  live board at the 18th hole equals the final result exactly (no end-of-round jump), and nothing changes
  statistically (same `simRound` draws, just computed earlier and shown live). The existing FLIP row
  animation now glides the challengers past you as it happens. Verified over http: opponents pre-simmed; the
  board projects −9→(thru9)→−9→(thru18)−9 etc. matching the final totals exactly; the finish reuses the
  pre-sim (live board == final, no jump); the player's total is correct; zero page errors. HTML/JS only.

- **CS214 — real golfer stats after every season & career, sortable on the leaderboard (owner: "I want
  real Stats to be shown for your golfer after each season and for career as well. And I want these stats
  to be available to sort by on the leaderboard. Like tee to green, avg putts, strokes gained, handicap,
  etc").** Two data sources kept honest and clearly separated: a MEASURED scoring average from the actual
  rounds played, plus a full PGA-style stat profile DERIVED from the 8 skill ratings (which are
  DataGolf-SG-anchored, rating 80 = tour average). New pure `golferStats(sk)` returns SG:Off-the-Tee /
  Approach / Around-Green / Putting / Total / Tee-to-Green (per round, anchored 80→0), driving distance
  (yds), driving accuracy, GIR, putts/round, scrambling %, sand saves %, and a plus handicap; anchored so
  a tour-average build reads SG 0 / 299 yds / 66% GIR / 29 putts / +3.0 hcp, and an elite build reads
  ~+3.9 SG / ~+9 hcp / fewer putts. `seasonRealStats()`/`careerRealStats()` compute the measured
  scoring average (and, for a season, real strokes-gained vs the field) from `S.season.totals[*].toPar/
  .rounds` (already tracked for the scoring title); career accumulates `toPar`/`rounds` per season (new,
  in both the regular and circuit record blocks) and averages `skillSeasons` for the career-average
  derived profile. Shared `statSheetHTML(sk, real, {title})` renders a card: a 3-tile measured header
  (Scoring avg + to-par/round · SG:Total vs field · Handicap) over two columns of SG + traditional stats,
  with a one-line "scoring is measured, the splits are modeled from ratings" honesty note.
  • **Wired in** on the season summary (after the Wins/Majors/Top10/Rank tiles), the career section of the
    summary, and BOTH end-of-career ceremonies (`scrCareerEnd` + `scrCircuitEnd`).
  • **Leaderboard sorts.** Added Strokes Gained / Tee to Green / Avg Putts / Handicap to `LB_SORTS` for
    both the Single-Season and Career boards. These aren't DB columns, so they're computed client-side
    from each row's stored `skills` jsonb (already returned since migration 31) via `golferStats()` and
    ranked over the fetched board (`LB_DERIVED` maps sort→{golferStats key, low=lower-is-better};
    `lbLoad` already falls back to the earnings-ordered board when the server doesn't recognize the
    `p_sort`, so no SQL change is needed). `lbStatVal` renders the derived value column (+2.48 SG, 28.4
    putts, +7.3 hcp, etc.), rows missing skills are excluded from a derived sort, and the subtitle is
    transparent ("Posted seasons ranked by … (derived from each golfer's ratings)"). The High–Low toggle
    flips best/worst-first while keeping each row's real best-first rank. **No migration** — entirely
    client-side; the derived board ranks the fetched field, which is the honest scope of a stat computed
    from stored ratings rather than a server column.
  Verified in Playwright: `golferStats` anchors (tour-avg→0/299/29/+3.0, elite→+3.9SG/+9.1hcp/fewer
  putts, better build = better SG); `statSheetHTML` renders scoring + SG + traditional sections;
  `seasonRealStats` computes real scoring + field SG; the season summary renders both the Season Stats
  and Career Stats cards with zero page errors; the leaderboard SG/putts/handicap sorts rank correctly
  (Surgeon +2.48 → Bomber +0.46 by SG; Putter tops Avg Putts at 28.0), exclude skill-less legacy rows,
  and show the derived-stat column + transparent subtitle. Screenshots confirm both surfaces. Deployed to
  /golf. Tunable: the anchor slopes in `golferStats` (rating→stat) and `PAR_BASE`.

- **CS215 — smaller, realistic golf ball on the green.** Owner: "the golf ball is too big when it's on
  the green, almost bigger than the hole." Root cause: the on-green ball was drawn at a near-CONSTANT
  on-screen size (`bScale` kept it ~the same pixels regardless of zoom) while the cup is a fixed-size
  viewBox ellipse — so at moderate putt zooms the ball rendered ~0.6-1.4× the hole's width (too big). Fix:
  on putt/hole shots the ball is now a FIXED small viewBox radius (`HV_GBALL=1.05`) instead of `3.2×bScale`
  — because the ball AND the cup are both in viewBox units, the camera scales them together and the ratio
  stays realistic (measured **0.42** = a real ball is ~0.4× the hole's width) at every zoom. Applied to the
  live putt roll (`hvLiveShot` initial radius), the resting-putt `setFinal`, and the hole-out drop (which
  now shrinks from the small green size, and the sink ring scales off the cup). Slightly enlarged the cup
  (`HV_CUP_RX/RY` 2.1/1.5 → 2.5/1.75) for a proper hole look + better sink visibility. Flight shots keep
  their normal `bScale` sizing (the ball in the air, under the full-hole camera). Verified in Playwright by
  rendering a real putt close-up: ball 1.05 vs cup 2.5 (ratio 0.42, ball < hole at every zoom); screenshot
  confirms a small white ball on the green. Deployed to /golf.

- **CS216 — per-course scenery identity + 3 new region biomes (owner: "not nearly enough variation of
  scenery between courses… distinct scenery for each state/country").** ~20 of the 39 daily courses all
  rendered as the same "parkland" biome, so they looked alike. Two coordinated levers (owner chose the full
  "per-course identity + new biomes" option via AskUserQuestion):
  1. **3 new biomes** (5 → 8): **pine** (tall Southern pine forest — warm green, pine-dominant walls,
     azaleas), **sandhills** (Carolina sandy waste — tawny sand rough, wiregrass, longleaf pines, the green
     pops), **prairie** (warm open plains — golden-green, sparse oaks/scrub, big sky). Remapped 7 courses by
     real character: Augusta / East Lake / Sedgefield → pine; Pinehurst No. 2 → sandhills; Colonial /
     Southern Hills / TPC Southwind → prairie. Added a `sparse` flag so prairie/sandhills scatter openly
     (not a dense forest carpet).
  2. **Per-course visual identity** — `hvBiome(courseKey)` now returns a deterministically VARIED copy of the
     course's biome (cached per key): `hvCourseVary` shifts every grass/ground color in HSL (hue ±13°,
     light/sat wobble) via a new `hvHexShift`, tints the tree palettes to match, rotates the flower accent
     colors (pink↔coral↔lavender), and rotates the flora-mix weights so a different plant dominates
     (pine-heavy vs broadleaf-heavy). So even two "parkland" venues now read clearly different — Winged Foot
     (warm, broadleaf, pink blooms) vs Bethpage (cooler, pine-dense) vs Oakmont (muted olive, open) are
     distinct at a glance. Seeded by the course key, so a given course always looks the same.
  Centralized entirely in `hvBiome`/`hvCourseVary` — `hvTerrain` is unchanged (it just consumes the biome
  object), so nothing else in the renderer needed touching. Verified in Playwright: 8 biomes present,
  parkland courses now differ in base/green/flowers, the 3 new biomes render in both the preview AND live
  shot paths (Augusta pine / Pinehurst sandhills / Colonial prairie / Sedgefield / Southern Hills) with zero
  page errors; screenshots confirm all six sampled courses look visually distinct. Deployed to /golf.
  Tunable: the hue/light/sat ranges in `hvCourseVary`, the new biome palettes, `HV_COURSE_BIOME` mappings.

- **CS217 — push the scenery farther: floor textures, vivid palettes, wider per-course character.**
  Owner: "push them all farther." Enriched the CS216 biome system on every axis:
  • **Per-biome FLOOR textures** (new rough character beyond the grass ticks): pine gets a **pine-straw**
    needle bed (rust streaks), tropical gets dark **undergrowth** blotches, prairie gets a **wildflower**
    speckle in its accent colors. Wired via a `floorTex` field consumed in `hvTerrain`'s ground branch.
  • **More vivid, more distinct palettes**: pine deepened to a warm forest green (deeper pine tiers,
    evergreen `autumnP:0.1`), tropical pushed to a lush saturated jungle green + brighter teal water,
    prairie warmed to a golden-olive plain with autumn-heavy oaks (`autumnP:0.34`).
  • **Wider per-course variation** in `hvCourseVary`: grass hue range ±13°→**±18°**, wider light/sat wobble,
    bigger flower-hue rotation, and — new — a per-course **seasonal + density character**: each course rolls
    its own `autumnP` (autumn-heavy vs evergreen tree mix) and `stepMul` (thick vs airy woods) within its
    biome. So two pine courses now clearly differ (Augusta: deep green + azaleas; East Lake: cooler + more
    autumn trees + a pond), as do two prairie courses.
  All centralized in the biome table + `hvCourseVary`/`hvTerrain` (terrain built once per hole + cached, so
  the added floor detail is free on re-render). Verified in Playwright: 8 courses across all biomes +
  intra-biome pairs render richer and visibly distinct in BOTH the preview and live shot paths, node counts
  reasonable (~1k open / ~3.2k dense), zero page errors; screenshots confirm the pine-straw/undergrowth/
  wildflower floors and the vivid palettes. Deployed to /golf. Tunable: `floorTex` per biome, the
  hue/season/density ranges in `hvCourseVary`.

- **CS218 — new alpine + heathland biomes, dramatic ocean, hand-tuned signature venues (owner: "I really
  want the visuals to pop").** Building on CS216/217:
  • **2 new biomes** (10 total): **alpine** — a rugged mountain course (cool blue-green turf, tall dark
    spruce, grey granite rock outcrops, a scree-rock floor), assigned to Olympic Club (which has no ocean
    views, so moving it off coastal is more accurate too); **heath** — a windswept purple moor (blooming
    heather mounds, sandy scrapes, birch + Scots pine, wispy fescue), assigned to Shinnecock Hills + The
    Country Club. New flora: `spruce` (tall narrow conifer), `heather` (purple bloom mound), `birch` (white
    marked trunk + light canopy); new `scree` floor texture.
  • **Dramatic ocean** (the coastal/links `B.ocean` rendering fully rewritten): a **shallow→deep two-tone**
    sea, a rocky **cliff** shoreline (jagged rocks) or a sandy **beach**, a white **foam** waterline, and
    scattered **whitecaps** — and the sea is much wider. Coastal (Pebble/Torrey/Kiawah) gets a big blue
    Pacific with cliffs; links (St Andrews/Carnoustie/Troon/…) now gets a grey North Sea with a beach.
  • **Hand-tuned signature venues** via a new `HV_COURSE_TWEAK` map (applied after the per-course variation
    in `hvBiome`): Augusta's azaleas cranked to a dense vivid pink/white/crimson bloom, Pebble's Pacific
    widened to a dramatic 70-92px, Pinehurst opened up, St Andrews given a tighter sea + beach.
  All centralized in the biome table + `hvBiome`/`hvTerrain` + the flora functions; verified in Playwright:
  10 biomes present, the reassignments + hand-tunes apply, and the new biomes + enhanced ocean render in
  BOTH preview and live shot paths with zero page errors; screenshots confirm alpine (spruce + granite),
  heath (purple heather), Pebble's cliffs + whitecaps, St Andrews' sea + beach, and Augusta's azalea
  explosion all pop. Deployed to /golf. Tunable: the alpine/heath palettes, `HV_COURSE_TWEAK`, the ocean
  `oceanW`/`deep`/`shallow`/`cliff`/`beach` fields.

- **CS219 — more bespoke venues + depth vignette.** Owner: keep going. Added `HV_COURSE_TWEAK` entries for
  6 more signature venues: **TPC Sawgrass** (cypress-marsh, teal water everywhere, denser), **Kiawah Island
  Ocean** (huge dramatic Atlantic — widest sea), **Harbour Town** (lowcountry live-oak canopy + green marsh
  water), **Torrey Pines South** (Torrey pines on the cliffs + big ocean), **Bay Hill** (Florida water
  course), **Whistling Straits** (Lake Michigan dunescape + beach). Plus a subtle **frame vignette**
  (`hvvig` radial edge-darkening drawn on top of the terrain) that gives every hole depth and makes the
  bright turf pop without breaking the flat retro look — kept light enough that it doesn't dull the green on
  the putting close-up. Verified in Playwright: 10 tweak venues, all render in preview + live shot paths,
  the putt close-up is unaffected, zero page errors; screenshots confirm Sawgrass marsh, Kiawah's Atlantic,
  Harbour Town oaks, and the vignette framing. Deployed to /golf. (A literal distant horizon/skyline doesn't
  fit the top-down view, so "depth" was delivered via the vignette + the existing elevation shading.)

- **CS220 — smaller hole, rotating realistic pins, breaking putts with lip-outs + rim-ins (owner).** All
  cosmetic — the score is engine-decided (`dSimHole` untouched), so none of this changes outcomes.
  • **Smaller hole + ball**: `HV_CUP_RX/RY` 2.5/1.75 → 2.15/1.5, `HV_GBALL` 1.05 → 0.95.
  • **Rotating pins (4 hole locations)**: `hvGeom` now generates 4 realistic hole locations per hole
    (front / back / left / right, each ~42-58% toward the edge on one axis and near-centre on the other —
    never dead-centre, never on the edge) and picks one via `hvPinRot()`, which is scoped per mode
    (day+attempt for the daily, match id for H2H so both clients agree, event+year for career) so the pin
    genuinely moves every time the course is played. Verified: 702 pins across all 39 courses × 18 holes,
    0 out of the 0.25-0.78 safe band (actual range 0.42-0.61 from centre).
  • **Realistic putts**: replaced the dead-straight roll that ran over/through the cup. New `hvPuttPathD`
    draws a BROKEN (curved) putt, and the ball now follows that path (the animation reads
    `getPointAtLength` instead of lerping a straight line). A **makeable miss LIPS OUT** — rolls to the rim,
    catches the edge and spins off to the side, resting just past the hole (never through the centre). A
    **long first putt LAGS** — dies just short and slightly offline. A **made putt breaks into the cup**,
    and ~30% **catch the lip and horseshoe in**. Verified: 54 missed putts, 0 rolling backwards away from
    the hole; live putt render + animation clean.
  Verified in Playwright (pin realism sweep, putt monotonicity, curved-path presence, a live breaking-putt
  render) with zero page errors; screenshot confirms an off-centre pin, a smaller hole, and a breaking
  putt. Deployed to /golf. Tunable: `HV_CUP_RX`/`HV_GBALL`, the pin candidate offsets, the lip-out vs lag
  threshold + rim-in probability in `hvPlots`.

- **CS221 — Daily Challenge pin is the same for everyone (owner).** Scoped the daily pin rotation to
  the DAY seed only (dropped the per-attempt component in `hvPinRot`), so every player sees the same hole
  locations on a given day and the pin stays put across your 3 attempts, then rotates day to day. Also
  swapped the pin-index selection to a well-mixed `hvHash` so consecutive days/events reliably cycle
  through all 4 locations (the old linear mod-4 could collide). Verified: daily pin identical across
  attempts, all 4 positions used across 8 days, career still rotates per event, zero errors. Deployed to /golf.

- **CS222 — every Tour Rep tier tag has its own unique look (owner).** The 20 ranks previously shared
  only ~8 leaderboard text effects (the inserted ranks reused a neighbour's). Gave all 20 a distinct
  `.rept-*` treatment that escalates with prestige: flat hues low (Amateur grey · Rookie green · Qualifier
  steel · Journeyman khaki · Tour Regular mint · Tour Pro teal · Established Pro sky · Contender bronze),
  gradients + glow mid (Challenger copper · Rising Star rose · Star silver · All-Star electric blue ·
  Standout emerald · Champion gold · Elite ruby), and animated shimmers at the top (Superstar magenta ·
  Legend violet · Immortal icy · Icon molten gold · G.O.A.T. prismatic). `REP_CLASS` now maps each rank to
  its own slug; only `repClass` (leaderboard) consumes it. Reduced-motion disables the shimmers. Verified:
  20 ranks → 20 unique classes, screenshot confirms each is visually distinct, zero errors. Deployed to /golf.

- **CS223 — tap-ins roll straight in (owner: short putts took crazy lines).** CS220 applied a break +
  ~30% rim-in horseshoe to EVERY made putt, so a 1-ft tap-in curved absurdly. Gated it by distance: in
  `hvPlots` a made putt only gets a break when it's beyond ~1.4 course-units (~4 ft) from the hole, and can
  only horseshoe past ~3 units (~9 ft); `hvPuttPathD` now draws a literal straight line for any made putt
  left unflagged (a tap-in). Lip-outs on missed putts are unchanged. Verified: tap-ins draw straight
  (curve 0), medium putts break gently, long putts break + can rim in; zero errors. Deployed to /golf.

- **CS224 — hole info + scoreboard stay in fixed corners (owner: they flipped on some holes).** CS146's
  green-aware layout flipped the floating hole-info chip and the scoreboard to the opposite corners when a
  hole's green was tucked to one side, so they jumped around between holes. Removed the flip at all three
  sites (daily/Moment round, H2H watch, H2H sudden-death) — the hole info now always sits top-left and the
  scoreboard top-right for the whole simulation. (The unused `.hvhole.right`/`.hvboard.left` CSS is left in
  place, harmless.) Verified: no flip logic remains, page loads clean, zero errors. Deployed to /golf.

- **CS225 — cap interactive season pop-ups at 3-4/season + Auto Sim on by default (owner: "users should
  have a maximum of 3-4 pop ups per season... this is a simulator for anybody, not just dedicated golf
  fans. I'm worried we'll lose users if the sim stops so many times, or people just skip to the end").**
  Two coordinated levers: (1) **Auto Sim now defaults ON** (`LS.get('bag_autosim', true)` at all 4 read
  sites) so a season auto-flows instead of requiring ~20 manual "Next Event" clicks — casual users watch it
  play out, power users can toggle it off. (2) A **shared per-season interruption budget** so the sim never
  pauses for more than 4 pop-ups total: new `SEASON_STOP_BUDGET=4` with `S.season.stops`/`momentsShown`
  reset in `startSeason` and persisted in the mid-season autosave snapshot. `STORY_PER_SEASON` dropped 5→2
  (off-course storyline beats are now the minor, lower-priority pauses), `MOMENT_PER_SEASON=3` (the
  play-the-final-round Moments are prioritized within the budget). `maybeStoryline` bails when
  `seasonStopLeft()<=0`; `showStoryline` increments `stops`; the Moment trigger is gated on both
  `seasonStopLeft()>0` AND `momentsShown<MOMENT_PER_SEASON` and increments both (only when a Moment actually
  shows — `momentInfo` returning null doesn't spend budget). Net: at most 4 pauses/season (≤2 storylines,
  Moments filling the rest, up to 3), so a full season for a non-golf-fan flows start to finish with a
  handful of meaningful decisions rather than ~20 stops. Verified in Playwright (string-form evaluate on the
  live functions): fresh budget 4; storylines cap at 2; with 2 storylines already shown only 2 more Moments
  fire (budget, not the per-mode cap, binds); `stops` never exceeds 4; Auto Sim default ON confirmed; page
  loads with zero page errors. Tunable: `SEASON_STOP_BUDGET`, `STORY_PER_SEASON`, `MOMENT_PER_SEASON`.

- **CS226 — press-conference set piece + Confidence & Followers as living career stats (owner: "make
  this feel more press-conference-y... the result should have a meaningful impact — fans/followers to
  reflect popularity, a confidence rating that fluctuates with decisions throughout the career and
  season").** Turned the storyline pop-ups (CS225) from flavor into a system with real stakes, and gave
  the choices tangible, visible consequences.
  • **Confidence (0-100, fluctuates).** New season stat `S.season.confidence`, carried from a career
    baseline (`career.story.confidence`) with gentle reversion toward 50 each new season. It moves from
    (a) **results** — `resultMomentum(pos,evt)` in `finalizeEvent`: a win +10 (major +16), top-5 +5-7,
    top-10 +3, missed cut −6, plus mean-reversion so extremes don't stick; and (b) **press choices** —
    each `conf` choice adds ~+2 to +5. It has a **real, fair sim effect**: `confEo()` gives the player a
    standing ±0.7 OVR-equiv edge (0 at neutral, applied in `beginEvent`), so a hot, confident player has a
    small edge and a rattled one a small drag — symmetric (the old system only ever gave a positive
    perk), bounded, and modest (~0.1 stroke/round at the extreme). Labels Rattled→Shaky→Steady→Confident→
    Locked in with a colored meter.
  • **Followers (career popularity).** New `career.story.followers` (starts 2,500), grows %-based (so it
    compounds like a real following) from wins/majors/high finishes (per-event, in `resultMomentum`) and
    from press soundbites — a fan-play answer goes viral, bigger for a showman/brash persona. Formatted
    2.5K / 1.3M, with a "▲ +X this season" delta.
  • **Press-conference overlay.** Rebuilt `showStoryline` as a media set piece: a red LIVE dot + adaptive
    badge (**Press Conference** for press/rivalry/story/major/sponsor beats, **The Spotlight** for
    fan/home/off-course beats), a drawn microphone, subtle flashbulbs, a "Cameras are rolling. What do you
    say?" prompt, and the choices styled as quote-marked soundbites. A momentum strip at the top shows
    your **Followers + Confidence at stake**; after you answer, the reporter reaction appears with the
    tangible fallout as prominent chips (▲ +110K followers · Confidence ↑ +4 · Confident · endorsement)
    and the top meters tick up to their new values.
  • **Surfaced everywhere.** A live momentum strip on the season screen (confidence + following, updates
    each event), and the summary/career-end "Career Story" card now leads with Followers (+season delta)
    and a Confidence meter.
  • Career play only (never daily/circuit/headless-for-sim-effect — `confEo`/`resultMomentum` guarded
    `!S.daily && !S.circuitMode && S.career`). Persisted in the mid-season autosave (confidence,
    followers0) and carried to the career baseline at season end; legacy saves default (50 / 2,500) with
    no crash. Verified in Playwright: helper math (formatting, confEo bounds ±0.7, a major win raises
    confidence 50→66 + followers, six missed cuts drag it to 30 / eo −0.28, clamps); the overlay renders
    the press badge/mic/meters/soundbites and a choice moves both stats + shows the deltas + reaction; the
    adaptive Press-Conference vs The-Spotlight framing per beat; a full 20-event headless season runs
    clean (confidence 50→57, followers 8k→15.6k) and the summary shows the upgraded card; the season
    screen shows the live strip; zero page errors throughout. Tunable: `CONF_EO_MAX`, the result/choice
    confidence + follower weights in `resultMomentum`/`showStoryline`.

- **CS227 — realistic missed-putt variety (owner: "I don't like how every missed putt is a lip out — it
  should be short, long, lip outs, missed left, missed right").** Since CS220 every makeable missed putt
  in the hole view was forced to `p.lip=true` (roll to the rim, spin off to the side) — so every miss
  looked identical. Rewrote the missed-putt branch of `hvPlots` (the visual only — the deterministic
  `dSimHole` score is untouched) to pick one of FIVE realistic outcomes by hash: **short** (dies just
  short, on line), **long** (burns the edge and runs past), **lip out** (catches the rim, spins off),
  **missed left**, **missed right** — roughly 20% each. Also gave the controlled LAG (long first putt)
  mild variety: most die just short, ~22% now trickle a touch past, with a slight side, instead of always
  dying short-and-left. Every miss still ends near the hole (a tap-in comeback) and never rolls backward
  away from it, so the earlier realism invariants hold. The existing `hvPuttPathD` renderer already draws
  these rest positions (its default A→rest curve covers short/long/left/right; the lip branch covers the
  lip-out), so no renderer change was needed. Verified in Playwright over 400 samples across all 39
  courses: even spread (short 19% / long 20% / left 19% / right 20% / lip 23%), **0** putts resting
  farther from the hole than they started, 0 NaN; a full practice round plays through the live shot-reveal
  animation to the result with zero page errors. Tunable: the outcome thresholds in the `hvPlots` putt
  branch.

- **CS228 — tiered sponsors: scale with following, off-season stay/switch choice, relationship meter
  (owner: "the sponsor should scale with your following... prompt sponsor options before the next season,
  stay or switch... new one offers better rewards but harder/longer tasks... a relationship meter, and
  upgrading means starting a new relationship; rewards get slightly bigger as the relationship grows").**
  Rebuilt the Sponsor Contracts system (CS-era) around a tiered brand ladder + a per-sponsor relationship.
  • **Following scales rewards.** `sponsorFolMult()` adds up to +60% to every bonus on a log curve of your
    CS226 Followers (10k→+0, 100k→+20%, 1M→+40%, 10M→+60%). Popularity genuinely sells.
  • **Four prestige tiers** (`SPONSOR_TIERS`: Regional / National / Premium / Global) each with a reward
    multiplier (1.0→2.7×) AND a difficulty multiplier — a bigger brand pays far more but demands MORE
    (countable goals like cuts/top-10s scale up, the Global tier wants an extra win). Structural rank goals
    (Tour Card top-100, Playoffs top-70, Finale top-30) stay put since they map to real cutlines.
  • **Relationship meter** (`rel` 1-5, +6%/level = up to +24% loyalty bonus, shown as a gold pip meter on
    the season deal, report card, and off-season card). Deliver ≥2 goals → loyalty grows; a shutout dings
    it and earns a strike; TWO shutouts in a row and the sponsor drops you to a fresh entry-tier "prove it"
    deal. A single tough year never loses the deal, so loyalty is worth building.
  • **Off-season stay/switch prompt.** Each off-season, `computeSponsorOffer()` checks your "market value"
    (following + OVR + career wins/majors); if you've grown enough to attract the NEXT tier up, a prominent
    decision card appears in `scrOffseason` (before the season starts): **Stay** with your current brand
    (keep compounding loyalty, familiar goals) or **Sign** with the bigger brand (shown "≈ +X% bigger base
    rewards", tougher goals, relationship resets to Lv 1). No eligible offer → the card just shows your
    current relationship status. An undecided offer at Start = you stayed. Deterministic per (careerSeed,
    year); persisted on `S.career.sponsor`/`.sponsorOffer` (save/resume safe); legacy careers migrate their
    old `lastContract` into a relationship via `ensureSponsor()`.
  Verified in Playwright: reward scaling (Regional/low-follow floor $1.27M → Global/3M-follow/Lv5 floor
  $6.01M, 4.7×); goals get harder (Regional 9 cuts → Global 14); offers gate on standing (strong player
  gets a one-tier-up offer, weak player none); the decision card renders both choices and switching resets
  the relationship; a 6-season career shows a real arc (loyalty grows on delivery, tiers climb via offers,
  Premium goals bite, no unfair drop after one bad year, followers 5k→206k driving bigger deals); full
  headless seasons + off-season + summary render with zero page errors. Tunable: `SPONSOR_TIERS`
  reward/diff, `SPONSOR_TIER_REQ` thresholds, `SPONSOR_REL_MAX`, the folMult curve.

- **CS229 — fake-brand catalog: named sponsors with identities, logos, personalities + signing bonuses
  (owner: "can we add fake brands? I want to build this feature out a lot more").** Built the tiered
  sponsor system (CS228) out into a full roster of fictional brands, each with real character.
  • **24 fictional brands** (`BRANDS`) across the 4 tiers, each with a **category** (Apparel / Equipment /
    Motors / Finance / Luxury / Energy / Airline / Tech / Beverage), a **brand colour**, a **tagline**
    ("Forged in black.", "Above the rest.", "Time is everything."), and a **personality trait**.
  • **Fake logos + wordmarks** (`brandBadge`): a colour-blocked initials tile ("SS", "OG", "AA") + the
    brand name + category/trait, rendered everywhere the sponsor shows — the live season deal, the report
    card, the off-season decision, and both offer options.
  • **Personality traits change the deal** (`BRAND_TRAITS`), so two same-tier offers feel different and
    choosing is about more than money: **Demanding** (bigger money, tougher goals), **Loyalty-first**
    (relationship bonus grows faster, +10%/lvl vs +6%), **Image-driven** (your following moves the money
    more), **Patient** (tolerates 3 shutout years before dropping you, not 2), **Big-stage** (win & major
    bonuses boosted), **Steady** (balanced). All wired into `makeContract`/settlement.
  • **Signing bonus** (`sponsorSigningBonus`): switching to a new brand pays a one-time cash sweetener
    (scales with tier + following, e.g. ~$8M for a Global brand) that offsets losing your loyalty — shown
    in the offer, paid into next season's net, and itemized on the report card + expense sheet.
  • **Two-brand compare** in the off-season offer card (both brands with logo, category, trait, tagline,
    and the loyalty/signing tradeoff), a **sponsor history** ("Past sponsors: …"), and the "a sponsor comes
    calling" press storyline now **names a real brand** one tier above your current deal.
  • Added "sponsor brands are fictional" to the not-affiliated disclaimer (invented names could
    coincidentally match a real company).
  Verified in Playwright: 24 brands across all tiers with valid traits; the badge renders; each trait
  moves the deal correctly (demanding pays more + harder, performance boosts the stretch bonus, loyal
  grows faster at Lv5, image-driven raises the follower multiplier 1.26→1.44, patient = 3 strikes);
  signing bonus is positive, pays into net exactly once (stable across re-renders), clears the pending
  flag, and shows on the report card; the storyline names a brand ("…Vantage wants your name on the
  bag"); a 6-season career runs clean with named brands throughout; zero page errors. Screenshots confirm
  the branded season-deal strip and the two-brand offer card. Tunable: the `BRANDS` catalog, `BRAND_TRAITS`
  modifiers, `sponsorSigningBonus`.

- **CS230 — hide the "AI fills the spot" wording in online waiting (owner: "when waiting for an opponent
  it shouldn't say an AI will fill the spot — hide this").** The private-lobby "open the seat" UI was the
  only place that disclosed the CS120 AI backfill ("a waiting player can join. AI fills in after 10s",
  and the button sub "A waiting player joins — or AI fills in after 10s"). Reworded to "Open to anyone —
  finding a player to fill the open seat(s)…" and the button sub to "Let a waiting player join your
  match", so a filled-in opponent never reads as AI. The backfill mechanic itself is unchanged (the timer
  still arms in `h2hOpenLobby`) — this is copy only. Quick Match already said only "Finding an opponent…"
  with no AI mention. Verified in Playwright: neither the open-seat button state nor the opened/searching
  state contains "AI", the button still works, zero page errors. (Remaining "AI"/"bot" strings are all
  code comments, not user-facing.)

- **CS231 — cleaner sponsor decision card (owner/Jordo: "this can look cleaner + easier to read").** The
  CS229 stay/switch offer crammed logo + category + trait + italic tagline + a right-aligned two-line meta
  into each button, which read as a wall of text (and the signing bonus was easy to misread). Redesigned
  each option as a clean card: a top row of **logo tile + brand name (title case) + a `STAY ▸`/`SIGN ▸`
  action word**, a small `Tier · Trait` subtitle, then a divider and **two tidy fact lines** — STAY:
  "Loyalty Lv N · +X% rewards / Same goals…"; SIGN: "**+X% rewards · +$5.5M signing bonus** / Tougher
  goals · loyalty resets to Lv 1". Dropped the tagline from the buttons, shortened the intro to one line,
  set the buttons to mixed-case (`text-transform:none`) so the facts read naturally instead of shouting,
  and used a new compact `fmtShort` money format ($5.5M) so the signing bonus is unmistakably a positive.
  New `brandTile(name,sz)` helper renders just the colour-blocked logo. Verified in Playwright (renders,
  STAY+SIGN present, zero page errors); screenshot confirms the clear hierarchy. Behaviour/plumbing
  unchanged — layout only.

- **CS232 — move the TOURTRACE scoreboard to bottom-right so it never covers the green (owner).** The
  floating leaderboard was pinned top-right (CS224), but the green/pin is always near the TOP of the hole
  (tee→green plays bottom→top), so on holes with the green tucked top-right the board sat right on top of
  it. Moved `.hvboard` to the BOTTOM-right, anchored just above the shot-description bar (`bottom:48px`,
  growing upward into the lower fairway/rough — never the green), with a `.nodesc` variant (`bottom:10px`)
  for the frames where no description bar is showing. Applies to the Daily/Moment round and the H2H watch +
  sudden-death boards (all share the floating HUD). Widened the board slightly (47%→52%) and right-aligned
  it so 4-player names fit. Layout only; the live FLIP row-swap animation, the "updates the moment a ball
  drops" logic, and everything else are unchanged. Verified in Playwright (board bottom-anchored 48px above
  the shell bottom, top at ~80% down the frame, `nodesc` toggles with the desc bar, zero page errors);
  screenshot confirms the green at the top is fully clear with the board tucked bottom-right above the shot
  description.

- **CS233 — career sudden-death playoff plays out like an H2H match: all players' balls on one tracer
  (owner/Jordo: "the playoff holes should play out like a h2h match would, showing all players balls...
  all players in one sim").** The Moment playoff (when you play the final round and tie) used to be "you
  play your ball on the tracer, then a text card shows everyone's result." Rebuilt it as a multi-ball
  broadcast, exactly like the online H2H sudden-death: EVERY tied contender's ball on ONE TOURTRACE map,
  hole by hole, everyone tees off then whoever is farthest from the hole plays next, until someone is
  beaten outright. New reusable module (`poBuildPlan`/`buildPoOrder`/`startPlayoffWatch`/`poWatchStep`/
  `poWatchFinish`/`scrPlayoffWatch`, screen `playoffwatch`) that reuses `dShotSeq` (per-player shot
  sequences), `hvNode` multi-mode (all balls on one map, from the H2H watch), `h2hRemOf` (away-first
  order), `h2hHoledUnits` and the CS232 bottom-right board. Ball colours match H2H (YOU blue, others
  red/cyan/yellow…); the board shows each alive player's result as their ball holes out (low = gold),
  with a "SUDDEN-DEATH · EXTRA HOLE N" chip, the one-line shot description, and a Skip-to-result button;
  the reveal auto-paces per shot with a beat between holes. Deterministic per (event, round, player). The
  winner it derives feeds `ce._playoffResult` (with `_playoffShown`), so `finalizeEvent` assigns money/
  points/positions unchanged and a win still flows into the win celebration — this is purely the visual.
  Replaces the old play-your-ball-then-text-card flow; the now-unused `momentPlayoff*` text functions and
  the daily-round `S.momentPO` board branch are left in place but dead (never triggered). Verified in
  Playwright: a rigged 2- and 3-way tie routes to `playoffwatch`, the plan builds N extra holes with each
  contender's shot sequence + away-first order, the tracer renders all balls + the board + shot desc
  mid-reveal, Skip and the full reduced-motion timer chain both resolve to the season with
  `ce._playoffResult`/`ce.done`/`ce.playoff` set, and a screenshot confirms all three balls on one map
  with the board bottom-right. Zero page errors; practice daily + H2H watch regress clean. NOTE: the
  AUTO-SIM season playoff (when you don't play the Moment) still uses the quick text reveal
  (`celebratePlayoff`) — converting that too needs the season playoff engine to sim on specific course
  holes (it currently uses the abstract `playoffHole`), flagged as a follow-up.

- **CS234 — sponsor decision redesign: two balanced, equal-weight cards (owner/Jordo: "not sure why one is
  clear and one is yellow... maybe change the whole color and style of it — each element should stand out so
  you can decide quicker").** The CS231 stay/switch offer used a ghost outline for STAY and a loud gold-fill
  for SWITCH, which read as "one important, one not" and confused the choice. Replaced the offer branch of
  `sponsorDecisionNode` with two matched dark `.sp-opt` panels where the accent colour now means the CHOICE
  TYPE, not visual weight: **teal = stay/loyalty**, **gold = switch/new**. Each card has a coloured accent
  bar, the brand logo tile + name + `Tier · Trait` subtitle + a filled action pill (`STAY ›` teal / `SWITCH ›`
  gold), and a divider over four labelled fact rows (`spRow` label↔value): STAY shows Loyalty (Lv + bonus %)·
  Rewards (Same as now)· Goals (Familiar)· The play (Keep your loyalty); SWITCH shows Rewards (+X% bigger)·
  Signing bonus (+$5.5M via `fmtShort`)· Goals (Tougher)· Loyalty (Resets to Lv 1). Both are clickable
  `role=button` panels (`.sp-opt` CSS: hover-lift, active, focus-visible ring, keyboard Enter/Space via
  `onkeydown`). The stay/switch handlers are unchanged (`doStay`/`doSwitch` — same tracking, saveCareer,
  sponsorHistory push, pendingSigning, toasts). Verified in Playwright: 2 `.sp-opt` cards render, clicking the
  SWITCH card changed the sponsor (Halcyon Air → Zenith Bank), cleared the offer, set pendingSigning, zero
  page errors; screenshot confirmed the clean balanced layout. Deployed to /golf.

- **CS235 — playoff announcement pop-up + "EXTRA HOLE" → "PLAYOFF HOLE" (owner: "have every playoff show a
  quick pop up announcement that you are entering a playoff against 'x' and then it will automatically go to
  the tourtracer sim... where the scoreboard says extra hole 1 it should say playoff hole 1").** Two parts on
  the career sudden-death playoff watch (the CS233 multi-ball TOURTRACE path):
  1. **Announcement pop-up.** `startPlayoffWatch` now opens with an intro phase (`S.poW.intro=true`) instead
     of going straight to the shot reveal. `scrPlayoffWatch` renders a prominent announcement card — a red
     "🔥 Playoff" tag, "You're in a playoff!", the event name (+ "· Major"), "Sudden death against **X and
     Y**" (opponent names pulled from `plan.holes[0].alive` filtered to `!you`, joined with commas +
     "and"), the opponents' ball-colour dots, and "Heading to the TOURTRACE simulation…". A new
     `poWatchBegin()` clears the intro and starts `poWatchStep()`; it fires automatically after ~2.6s
     (20ms under reduced motion) OR on tapping the gold "Start the playoff ▸" button (guarded `if(!W.intro)
     return` so the timer + tap can't double-fire). So every career playoff announces the opponent(s) then
     auto-rolls into the sim.
  2. **Rename.** Every user-facing "EXTRA HOLE"/"extra hole" → "PLAYOFF HOLE"/"playoff hole": the
     scrPlayoffWatch hole chip ("SUDDEN-DEATH · PLAYOFF HOLE N · PAR p"), the floating board caption
     ("PLAYOFF HOLE N"), the result card ("Took it on the Nth playoff hole"), the H2H sudden-death chip, and
     the (dead-but-kept) momentPlayoff/celebratePlayoff text reveals for consistency. Only code comments
     still say "extra hole".
  Verified in Playwright: a rigged 2- and single-opponent tie routes to `playoffwatch` with the intro card
  naming both opponents ("Rory Vale and Ken Brauer"); tapping "Start the playoff" AND letting the ~2.6s
  timer fire on its own both clear the intro and show "SUDDEN-DEATH · PLAYOFF HOLE 1 · PAR 4" with board cap
  "PLAYOFF HOLE 1"; zero "EXTRA HOLE" left on the page; zero page errors on both paths. Deployed to /golf.

- **CS236 — brand logos + TWO sponsor slots (hat + shirt) worn on the golfer (owner: "make logos for each
  fake brand... incorporate hat and shirt sponsors, choose hat or shirt when you sign, fill up to 2 slots at a
  time, and the logos actually appear on the hat and shirt").** Owner picks (AskUserQuestion): **vector logos
  drawn in-game** (not AI PNGs) + **each slot is its own deal**; then, mid-build: "since there are double
  sponsors, make the goals slightly more difficult and pay slightly less."
  • **Vector brand logos.** New `LOGO_SPEC` gives all 24 fictional brands a distinct mark — a shaped badge
    (6 shapes: rounded / circle / hex / diamond / shield / tag) in the brand colour + a monogram + an accent
    motif (top bar / underline / diagonal split / inner ring). Rendered two ways from the same spec so the
    marks match everywhere: `brandLogoSVG(name,sz)` (SVG, for all UI) and `brandLogoDraw(ctx,name,x,y,w,h)`
    (canvas primitives — synchronous, never taints — so the mark can be painted onto the golfer). `brandTile`
    /`brandBadge` now use the real logo instead of the old initials-in-a-box tile. Verified all 24 render as
    valid SVG + draw to canvas with 0 errors across 6 shapes.
  • **Two sponsor slots.** `S.career.sponsor` (single) → `S.career.sponsors={hat,shirt}` (each
    `{brand,tier,rel,seasons,strikes}`), migrating a legacy single sponsor into the SHIRT slot and seeding a
    starter shirt deal for a new career (hat left open as a growth hook). Helpers `ensureSponsors`/`sponsorOf`
    /`sponsorFilledSlots`; `ensureSponsor()` kept as a compat shim returning the primary (shirt) sponsor.
  • **Each slot its own deal (harder + less pay).** `makeContract` → `makeContractFor(sp,slot)` +
    `makeContracts()` building a full 3-goal contract PER filled slot into `S.season.contracts={hat,shirt}`;
    new `SPONSOR_DUAL_REWARD=0.72` (each deal pays ~28% less) + `SPONSOR_DUAL_DIFF=1.12` (goals a bit harder)
    so two slots is a meaningful bump (~1.44× a lone deal), not a 2× windfall. Live strip (`contractNode`) +
    season-summary report card (`contractsReportHTML`) render one card per slot with its logo + goals +
    loyalty. Settlement in `finalizeEvent` now iterates both slots independently (per-slot relationship growth
    / strikes / drop-and-reseed / story feed), `contractsEarned` sums both, and `S.career.lastContracts[slot]`
    tracks the "prove-it" state per slot.
  • **Sign to hat OR shirt.** Off-season `sponsorDecisionNode` rebuilt: shows the two slot cards (brand logo +
    tier + loyalty meter, or an "Open slot"), then any interested brands from `computeSponsorOffers()` (fill an
    open slot at your eligible tier, and/or a tier-up for your lowest filled slot). Each offer has **Sign as
    Hat / Sign as Shirt** buttons (labelled "Replace on X · loyalty resets" when that slot is occupied);
    `signSponsor(offer,slot)` fills/replaces the slot (fresh Lv1 relationship, signing bonus accumulates into
    next season's net). `S.career.sponsorOffer`→`sponsorOffers` (array); wired at off-season start +
    `finishOffseason`.
  • **Logos worn on the golfer.** `paintAvatarFull` (the signed-in full-body dressable avatar) now paints the
    HAT sponsor's logo on the cap front (only when a hat is worn) and the SHIRT sponsor's logo on the chest
    (placed from the live shirt-region bbox, ~mid-chest, ~20% torso width) — so a sponsored career golfer
    visibly wears both marks in setup / build-hero / the Pro Shop dressing room. Career-only (reads
    `S.career.sponsors`, never seeds during render, so setup shows none until you've signed); cache key
    includes both brands so it re-renders on a sponsor change. Screenshot-confirmed: "RE" (Redline Energy) on
    the cap + "A" (Apex Athletic) diamond on the chest, reading like a real sponsored polo.
  Verified in Playwright: 24 distinct logos; two-slot seed/sign/replace/history; per-slot contracts build with
  the dual factors (National hat $3.18M vs Global shirt $5.29M floors); a full simulated season →
  finishSeasonHeadless → summary settles BOTH slots once (hat rel 2→3, shirt 3→4, seasons++, lastContracts
  set), renders exactly 2 report cards, zero errors; the off-season UI shows both slots + 2 offers with
  Sign-as-Hat/Shirt; the avatar wears both logos; guest (no career) avatar + daily + title all render clean
  with zero page errors. Deployed to /golf. Tunable: `SPONSOR_DUAL_REWARD`/`SPONSOR_DUAL_DIFF`, `LOGO_SPEC`,
  the chest/hat logo placement in `paintAvatarFull`.

- **CS237 — playing the Daily as a created golfer is FREE (career-mode incentive) (owner: "playing the daily
  challenge with one of your created players does not cost a daily challenge spin... every time you use your
  created player it is like a free play").** Owner picks (AskUserQuestion): keep **Legend golfers** (the
  existing created-golfer vehicle — an elite retired career's peak build) as the qualifier, and post free
  scores to a **separate 'Career Golfers' board**. Surgical change to the Legend Token system:
  • **Free + reusable.** `beginDailyRoundWithLegend` no longer calls `claimDailyAttempt()` — a Legend play
    never consumes one of the 3 daily draft attempts. The token is never spent: `consumeLegendToken` →
    `creditLegendToken` (credits the "played as a Legend" achievement once via a new `t.played` flag, never
    sets `used`), and `legendTokensUnused()` now returns all tokens, so each earned Legend is a permanent,
    unlimited free daily entry. `finishDailyRound` gets an `isLegend` branch that records ONLY to the
    separate Legend course-record tier + board and skips ALL draft bookkeeping (attempts, best-of-day,
    streak, weekly goals, mastery, guest-claim) — the two modes stay cleanly separate.
  • **No grind exploit.** A Legend play is deterministic per (day, build): `S.dailyAttempt` is fixed to 0,
    so replaying the same Legend on the same day gives an identical round (no farming a lucky seed), while
    different Legend builds still play differently. Verified: replay = identical total.
  • **Always reachable.** `startDailyChallenge`/`beginDailyAttempt` now route to the preview (not the
    "done" overlay) when you're out of draft attempts but own a Legend (`hasFreeLegends()`). The preview
    hides the "Draft your golfer" button when out of attempts and shows an "Out of draft attempts — your
    Legend golfers play free" note; the Legend section is rebranded "Your Legend golfers · FREE PLAY" with
    "Play free ▸" buttons and a "scores post to the separate Career Golfers leaderboard" line. A dedicated
    Legend result screen (focused: score + beat-the-pro + achievements + "Play the Daily / Course Records /
    Home", no draft-only sections) loops back into the Daily.
  • **Advertising** (the owner's open question): a green "🏆 Your Legend golfers play the Daily free — no
    attempt used" line under the title Daily button when you own one; the preview FREE-PLAY card; the
    How-to-Play bullet rewritten ("Your career golfers play free... FREE and unlimited, never uses a daily
    attempt"); the Trophy Room "Your Legend golfers · Free play" strip; and the career-end / Legend Circuit
    ceremony copy ("replay the Daily as this build for free, any time").
  Verified in Playwright (signed-in stub + a seeded Legend token): a free Legend play leaves draft attempts
  untouched (3 used / 0 left → still 0 left), the token stays present + unused + played:true, the streak is
  untouched, the result is `isLegend`; at 0 draft attempts `startDailyChallenge` → the preview (not the
  done overlay) with the FREE-PLAY card + "Play free" button + "Career Golfers" note + hidden draft button;
  replay is deterministic; and the regression — a guest's first draft wheel spin still claims exactly 1
  attempt — holds. Zero page errors. Deployed to /golf. (No SQL: the separate Legend board/records tier
  already exists from CS63; free plays just post there as before, minus the attempt cost.)

- **CS238 — restyled the chip/tag pills (owner: "make these little boxes more visually appealing against the
  green").** The `.tag` and `.online-tag` pills (used across the app — course/mode chips, section kickers,
  playoff/spotlight tags, the H2H online strip) were flat transparent outlines that read weakly on the green.
  Rebuilt as proper chips: a `currentColor`-tinted dark fill (`color-mix`, so each pill tints to whatever
  accent its inline `color` sets — gold/teal/red/green), a soft drop shadow + inner top highlight for depth,
  tighter uppercase tracking. `.online-tag` keeps its teal identity with a richer gradient + soft glow. Solid
  inline `border-color`/`background` overrides (e.g. cup-theme tags) still win, so nothing themed regressed.
  Verified a swatch of accent colors renders cleanly on the page bg with zero errors. Also exported
  `runthetour_courses.csv` (39 daily courses: name, location, biome, par, yards, tour avg, signature holes,
  description) for the owner to build per-course visual-theme prompts.

- **CS239 — online post-match result: centered + sleeker scorecard, tap-a-hole to rewatch.** Owner (H2H
  result screenshot): "the online post match leaderboard can look a lot better — center it, sleeker design,
  and each hole should be clickable to go back and watch it." The `h2hResultCard` scorecard was `max-width:100%`
  so on the wide result screen it ran to the left edge while the standings/buttons were centered. Rebuilt it:
  a bounded, centered card (`max-width:560px;margin:0 auto`), rounded with a subtle gradient fill + soft shadow,
  tighter spacing, gold TOT, a sticky name column, and a "Tap any hole to rewatch it ▶" hint. Each hole
  column is now clickable (delegated `data-h2hhole` handler + a desktop column-hover highlight via `.scHole`/
  `.colhi` CSS). Tapping a hole calls new `h2hReplayHole(n)` → a single-hole REPLAY on the TOURTRACE tracer:
  a new `S.h2h.replay` branch in `scrH2HWatch` plays just that hole's shots (reusing the watch's per-hole shot
  data + one-window tracer: hole chip, floating scoreboard, shot-description bar) driven by `h2hReplayStep`,
  with "Skip to end of hole" / "↻ Replay hole" / "‹ Back to result" controls. Deterministic/read-only
  — it replays the already-decided shot data, never re-reports the match; `h2hReplayHole` rebuilds
  `playHoles` via `h2hBuildPlay` if missing. Verified in Playwright (constructed a finished 1v1): scorecard
  bounded to 560px centered with 72 clickable hole cells + the hint; tapping hole 6 enters the replay
  (screen h2hwatch, tracer + both balls + scoreboard + "5-iron to left green, 15 ft to hole" desc + Back
  button); Back returns to the result and clears the replay state; zero page errors. Deployed to /golf.

- **CS240 — themed "Today's Daily Challenge" feature card (owner Option 3), NOT yet deployed.** Owner
  wanted each day's Daily to feel special; a plain palette recolor read as "just a color change," so after
  mocking up two richer directions (atmosphere/time-of-day vs a full presentation package) the owner picked
  the **presentation package**. When you open the Daily preview, a branded feature card now greets you:
  "TODAY'S DAILY CHALLENGE" kicker → big venue name → meta line (location · par · yards · conditions) →
  an italic **tagline** in the course's own accent color → the vibe blurb (with Read more) → a 5-swatch
  **palette strip** → 3 **motif chips**. During the round the tracer window gets a matching accent frame
  (a subtle 2px inset ring). New `DAILY_THEME` table (all 39 daily courses, each with a hand-written tagline
  + 3 motif tags — e.g. Magnolia Hollow "Glass greens, spring bloom." / azaleas in bloom · pine cathedral ·
  glassy greens); `dailyTheme(key)` derives the accent + palette from that course's own biome
  (`hvBiome`) so the card always matches what you actually play (Augusta azalea-pink, Scottsdale desert-amber,
  St Andrews gorse-gold, Kiawah coastal-pink…), with a luminance guard to keep the accent bright enough for
  the CTA/frame; `dailyFeatureCard(key)` builds the card (folds in the old h1 name / lede / blurb-scout so
  the preview isn't longer). Also covers the Monthly Spotlight preview (kicker flips to "Monthly Spotlight").
  Scope: this themes the **Daily Challenge** (owner redirected here from the original 26 career-venue persona
  ask); the persona spreadsheet became a style reference, since the Daily rotates a different set of 39
  courses. Verified in Playwright: all 39 courses resolve a theme + bright accent + ≥3-swatch palette with
  zero page errors; the feature card renders on Augusta/Scottsdale/St Andrews/Kiawah (each visually
  distinct); a full practice round plays with the themed accent frame (azalea-pink inset ring confirmed) and
  finishes clean; career setup is unaffected (no daily card leaks in). **Awaiting owner go-ahead on two
  tweaks (frame subtlety, tagline copy) before deploying to /golf.**

- **CS241 — season sim screen decluttered: live tournament under the stats, everything else minimized
  below (owner IMG_8050: "so much info before you see the weekly standings... when the sim is going the
  priority is watching the tournaments play out + the season stats at top; everything else much more
  minimal... you don't even know the sim is going unless you scroll down").** `scrSeason` used to stack, in
  order: season-stat bar → Race to the Cup strip → TWO full sponsor goal cards (per-slot progress bars) →
  momentum strip → THEN the `.cols` (live leaderboard + scorecard). So the weekly standings were buried
  under a wall and you couldn't tell the sim was running without scrolling. Reordered: **season-stat bar
  (kept at top) → the live tournament (`.cols`: leaderboard + scorecard) → controls**, then Race to the Cup /
  sponsors / momentum moved BELOW, minimized. Sponsors collapse to a new `contractStripNode()` — a
  one-line-per-slot `.acc` accordion (logo + brand + goals-met + running bonus, e.g. "Cedar & Oak 0/3 ·
  Tallgrass 0/3 · +$0"), expanding to the full goal cards on tap (default collapsed). The `makeContracts()`
  data-setup on resume was kept up top (side-effect only); the major banner + opposite-field note stay near
  the tournament (contextual to this week's event). Layout-only — no sim/engine/state change. Verified in
  Playwright (a rigged year-3 career season, signed-in, both sponsor slots filled): DOM top-level order is
  sbar → tournament → controls → race → sponsors(collapsed) → momentum, `sbarFirst` true, sponsors accordion
  closed by default, zero page errors; screenshot confirms the stat bar → Phoenix Open scorecard +
  leaderboard → controls → compact Race/sponsors/momentum flow. Deployed to /golf.

- **CS242 — sponsor economy rebalance: ~50% less pay, less-automatic floor, goal variety (owner:
  "players are earning a ton more per season because of sponsors").** Measured the actual numbers first: a
  dominant popular vet (OVR 90, 3M followers, two Global sponsors, Lv5 loyalty) could bank **~$104M/season**
  in sponsor bonuses if all goals met — a single "win a major" goal paid ~$30M, MORE than the major's own
  purse; a mid-career Premium player ~$34M. Prize money for a great season is ~$20-50M, so sponsors paid
  2-3× what golf paid. Root cause: modest base bonuses ($2.4-4.8M) but the multipliers COMPOUND — tier
  (Global ×2.7) × following (up to ×1.6) × loyalty (×1.24) × inflation (×1.25) → ~4.5-6× before two slots.
  Owner picked (AskUserQuestion) **moderate ~50% cut + make the floor less automatic + add goal variety**.
  Changes:
  • **Money (main lever):** compressed the tier ladder `SPONSOR_TIERS` reward (was 1/1.45/2/2.7 →
    **1/1.28/1.50/2.05**), softened the following curve `sponsorFolMult` (cap +0.6→**+0.35**, slope
    0.2→0.117), and added a global `SPONSOR_MONEY=0.78` scale on `B()`. Result: elite $104M→**$52.8M**
    (49% cut), mid $34M→**$18.5M** (46%), rookie ~$3.6M — sponsors now a supplement (~1/3-1/2 of prize
    money), no single goal out-earns winning the event.
  • **Floor less automatic:** the near-guaranteed FLOOR goals now pay small change (grind "make cuts"
    ~$250k, elite "win twice" ~$4M — were ~$10M) with the money moved onto the hard STRETCH (major
    $4.8M→$5.6M base; win $3.2M→$3.6M); floor TARGETS bumped (cuts 9→10, top-10s 5→6/2→3).
  • **Variety:** the middle "TARGET" goal is now drawn from a per-tier POOL, deterministically seeded by
    (careerSeed, year, slot) so it's stable within a save but rotates season-to-season and can differ
    between the two slots — options: reach the Playoffs/Finale (ptsRank), **win $X in prize money** (new
    `money` goal kind), **season scoring average under X/round** (new `scoreAvg` kind, min 30 rounds), or a
    **signature/major win** (sigWin). Both new kinds added to `goalProg` with live progress bars.
  Verified in Playwright: recomputed totals across elite/mid/rookie (46-49% cuts); the new `money`/`scoreAvg`
  goals compute correct progress + done state with no NaN and render in the live contract card; variety
  kinds appear in generated contracts; a full headless season settles with zero errors; OVR→tier gating
  intact (80→grind, 85/87→contender, 88/92→elite, correct floor/stretch). Deployed to /golf. Tunable:
  `SPONSOR_TIERS` rewards, `SPONSOR_MONEY`, `sponsorFolMult` curve, the per-tier base bonuses + variety pools
  in `makeContractFor`, the `scoreAvg` targets. (Signing bonuses also drop proportionally since
  `sponsorSigningBonus` reads the tier reward — consistent.)

- **CS243 — two season-sim bugs from CS241 (owner: "the sponsor dropdown auto-closes after each tournament
  is simmed — it should stay open until the user closes it; and everything on the screen slightly moves when
  the tournament ends and the results come up, making it hard to focus").**
  1. **Sponsor dropdown persistence.** The collapsed sponsor accordion (`contractStripNode`, CS241) is
     rebuilt on every `render()`, and each new `<details>` defaulted to closed — so every time a tournament
     finished and the season screen re-rendered, an open sponsor panel snapped shut. Fixed by persisting the
     open state on `S.sponsorsOpen`: the `<details>` renders `open` iff `S.sponsorsOpen`, and a `toggle`
     listener writes the user's choice back (`S.sponsorsOpen=det.open`). So it now stays exactly as the user
     left it across every re-render/sim, only closing on an explicit tap.
  2. **Layout shift when a tournament ends.** The primary control under the live tournament changed HEIGHT
     when `ce.done` flipped false→true — a one-line "Playing…" `div` (~40px) became a two-line "Next Event ▸ /
     Season Results ▸" button (~73px), so the whole block below (controls / Race to the Cup / sponsors /
     momentum) got shoved down ~33px the instant results came up. Fixed by making the "Playing…" state a
     two-line button with a `.sub` line ("Round N of 4" / "Final round") that matches the Next/Results
     button's box model exactly. First cut used `btn ghost`, which left a 2px residual (ghost overrides
     `border:1px` + `font-size:18px` vs the base `.btn` `border:0` + `21px`); reconciled by dropping `ghost`
     and styling the disabled "Playing…" button as a plain `.btn` with a neutral dark fill — identical box
     model (border:0, font-size:21px, padding:15px). Measured heights now 72 vs 73 (a sub-pixel line-box
     rounding artifact, imperceptible) vs the original ~33px jump.
  Verified in Playwright (a rigged year-3 career season, signed-in, both sponsor slots filled): opening the
  sponsor accordion then simming a tournament to completion + re-rendering leaves it OPEN (`stayedOpen:true`,
  `S.sponsorsOpen:true`); the three primary-control states measure 72/73/73px (was 71/73/73 with the ghost
  residual, ~40/73 before the fix); zero page errors. Deployed to /golf.

- **CS244 — career regression starts YEAR 15 for everyone + steepens all the way to year 42 (owner:
  "the regression is starting later than we planned. It should start in year 15 and get increasingly more
  regression until year 42").** Two root causes, both fixed in the decline model
  (`applyPlayerDecline`/`pastPeak`):
  1. **Onset was delayed for good players.** Decline was gated on `effAge = playerAge − primeBank` (a
     "prime bank" of up to +3 years earned by winning), so a dominant career shifted its regression start
     from year 15 (age 36) to ~year 18 — exactly the "starting later than planned" the owner saw. Onset is
     now anchored to the CAREER YEAR: `pastPeak()` and `applyPlayerDecline` gate on `S.year >=
     DECLINE_START_YEAR (15)`, so EVERY golfer — dominant, average or struggling — starts regressing at
     year 15 no matter how well they've played. The prime bank is kept, but demoted to a RATE modifier only
     (`formMod = 1 − primeBank/3·0.25` → a great career fades ~0.75×, a slump ~1.25×) — it can never delay
     the year-15 start again, and even a hot career visibly declines from 15 on.
  2. **The severity ramp capped too early.** The old ramp `min(2.5, (effAge−35)/6)` hit its 2.5 ceiling
     around year 29 (earlier/later depending on age), so regression stopped getting worse well before the
     end of a run. Replaced with a year-anchored ramp that grows every single year from `DECLINE_START_YEAR
     (15)` to `DECLINE_FULL_YEAR (42)` — `ramp = 0.35 + t·(2.5−0.35)`, `t=(year−15)/27` — so per-year OVR
     loss climbs monotonically from ~−0.34/yr at year 15 to ~−2.42/yr at year 42 and never plateaus. Year
     42 is the last Legend Circuit year (career years 1–30 + circuit 31–42, `S.year` climbs continuously
     through `continueFranchise`), so the ramp spans the entire 27-year playable decline window (age
     36→63).
  New constants `DECLINE_START_YEAR=15`, `DECLINE_FULL_YEAR=42`, `DECLINE_RAMP_MIN=0.35`,
  `DECLINE_RAMP_MAX=2.5`; `effAge()` removed (unused after the rework), per-skill `DECLINE_RATE` unchanged,
  prime-bank clamp widened −2..3 → −3..3 for a symmetric form effect. Only the PLAYER's build declines here
  — the CPU field's separate age-based aging (`ARCS`/`livingOf`) is untouched. Verified against the real
  in-file functions in Playwright: `firstDecline` year = 15 for dominant/neutral/struggling careers alike
  (was ~18 for a dominant one), `pastPeak` flips exactly at year 15 (false at 14, true at 15), per-year loss
  steepens monotonically through year 42 (neutral case clean; the dominant/struggling cases only "flatten"
  in a sampled check due to per-skill integer rounding + the 48-floor, not a real cap), sample OVR
  trajectory for a 90 build: dominant 89.9(y15)→79.4(y30)→65(y42), neutral →72.3→54, struggling(82)
  →64.6→50.9; form still separates the outcomes (dominant fades slowest); zero page errors. Deployed to
  /golf. Tunable: `DECLINE_START_YEAR`/`DECLINE_FULL_YEAR`, `DECLINE_RAMP_MIN`/`MAX`, the `formMod` strength
  (0.25), per-skill `DECLINE_RATE`.

- **CS245 — in-app "Send Feedback" form (bugs / ideas / anything), surfaced where players actually look
  (owner: "a place for players to submit bugs, ideas... in a logical place where players will see it and be
  inclined to give feedback").** A proper low-friction in-app form (no email client needed) replaces the
  scattered `mailto:` links, so a player can report a bug or share an idea in a few taps without leaving the
  game.
  • **The form** (`overlayFeedback`, a standard `.ov` overlay): three category chips (Bug / Idea / Other,
    with new themed `bug`/`bulb`/`chat` SVG icons), a message textarea (context-aware placeholder), an
    optional email field for guests (signed-in users are told we can follow up via their account), a privacy
    note, and a gold Send CTA → a warm "Thank you!" state with a "Send another" option. On-brand
    dark-green/gold, matching the game's icon system (CS103 auto-converts the 💬/🐞/💡 emoji to the new SVG
    icons at the `$()` layer).
  • **Durable + fail-open delivery.** `submitFeedback()` posts to Supabase immediately when the RPC is
    reachable; on ANY failure (offline, or the migration not applied yet) it queues the submission to
    localStorage (`bag_pending_feedback`, cap 50) and `flushFeedback()` retries it on the next load / sign-in
    (wired into `sbApply`, runs for guests too) and the `online` event — mirroring the pending-seasons queue.
    So a submission is never lost and no email client is ever required; the player always sees "Thank you!".
    Each payload carries the current screen/mode/year + UA for bug triage (disclosed in the form, "nothing
    that identifies you").
  • **Placement (logical + visible + inviting):** a gold "Send Feedback" pill in the **footer** (renders on
    every screen), a **Send Feedback** row in the ≡ **menu** (About section, replacing the old Contact
    mailto), the **About** overlay's Send Feedback button, and a low-key "Found a bug or have an idea? Tell
    us ›" link on the **season summary** (the reflection moment engaged players sit on). All open the same
    form.
  • **Backend — `supabase/47_runtour_feedback.sql` (owner-run):** a `runtour_feedback` table (category /
    message / optional email / jsonb context / user_id+username when signed in / status for triage) written
    ONLY through an anon-callable `runtour_feedback_submit` SECURITY DEFINER RPC — so guests AND signed-in
    players can submit, the message is trimmed + length-capped (4000), the category is whitelisted (bad →
    'other'), an emailed reply address is kept only if it looks like an email, and the username is attributed
    server-side from `profiles`. RLS on with NO select/insert policy → anon/authenticated can't read or write
    the table directly; only the definer RPC writes, only the dashboard reads. Validated end-to-end against a
    local Postgres: applies clean + idempotent, signed-in submit attributes the username, guest submit stores
    a valid email, bad category coerces to 'other', empty message rejected, and anon SELECT is denied by RLS.
  • **Deploy-safe before the migration:** the client fails open, so deploying ahead of the owner running 47
    is safe — feedback submitted in the interim queues locally and flushes automatically once the RPC is
    live. **ACTION: run `supabase/47_runtour_feedback.sql`**, then read submissions in the Supabase table
    editor (`runtour_feedback`, newest first).
  Verified in Playwright: the footer pill / menu row / About button all open the form; category switching,
  the textarea, and short-text validation work; a real submit (no server in the sandbox) shows the thank-you
  and durably queues the payload with its category + context; the guest email field shows when signed out;
  zero page errors. NOTE: a parallel session added a separate **mailto-based** feedback form to the SOCCER
  game (`soccer/index.html`) — independent of this Supabase-backed golf form; no conflict, could be unified
  later if wanted. Deployed to /golf.

- **CS246 — the daily theme now carries into the PLAY view + every course looks distinct while playing
  (owner: CS240's themed card "was changed, which is great, however the course still looks the same while
  playing").** CS240 themed the Daily preview card (accent, palette, motifs) but that identity barely reached
  the round: it was only a 2px inset ring, and ~14 marquee courses fell back to the generic bright-green
  parkland biome, so they all looked alike. Owner picked BOTH fixes (AskUserQuestion).
  1. **Carry the theme into the TOURTRACE window.** New `hvThemeAccent(courseKey)` (cached, derived from
     `dailyTheme`→biome) + `hvFrameStyle()`; every hole-view svg (`hvNode`, all 3 build paths — daily,
     preview, sudden-death — so H2H and career Moments benefit too) now renders a THEMED FRAME: an
     accent-colored border + soft accent glow, instead of the plain panel border. The daily round's course
     tag ("QUICKSILVER GOLF CLUB · CALM · BALANCED") is now tinted the day's accent instead of a generic
     teal. Removed the redundant CS240 shell inset-ring (the svg carries the frame now). So the playing
     screen visibly belongs to today's course (e.g. Winged Foot plays under a crimson frame + crimson tag,
     Oakmont under gold).
  2. **Distinct scenery per course.** `hvBiome` gained compact per-course `grassShift`/`treeShift`
     ([hue°,light×,sat×]) support so a venue gets its own tone in one triple, applied before the existing
     direct-field overrides. Reassigned **Innisbrook Copperhead → pine** (real pine framing), and added a
     `HV_COURSE_TWEAK` identity for each of the 13 remaining parkland-default venues — a distinct combo of
     grass tone, tree DENSITY (`stepMul`), autumn/evergreen mix, flora scatter, flower palette and bunker
     scale: e.g. **Winged Foot** dark mature dense woods + canyon bunkers (a "northeastern brute"),
     **Bethpage Black** darkest/densest forest, **Oakmont** treeless & OPEN with big fairway bunkers on pale
     firm turf, **Riviera** blue-green kikuyu, **Merion** quarry/sandy waste, **Oakland Hills** clover-leaf
     bunkers everywhere, etc. The existing per-course `hvCourseVary` hue-shift stacks on top, so no two
     courses match.
  Verified in Playwright: all **39** daily courses render (0 null), **39/39 now have a distinct base grass
  tone** (was ~25 sharing generic parkland green), 39/39 carry the themed frame, Innisbrook is pine; a full
  Winged Foot practice round plays to completion with the crimson themed tag + framed window + dense-woodland
  scenery and zero page errors; side-by-side screenshots confirm Winged Foot / Oakmont / Bethpage / Riviera
  look genuinely different. Rendering-only — the sim, hole geometry, and score engine are untouched. Deployed
  to /golf. Tunable: the per-course `HV_COURSE_TWEAK` entries (grassShift/stepMul/bunkerScale/scatter), the
  frame alpha/glow in `hvFrameStyle`.

- **CS247 — hole view declutter + depth pass (owner: CS246 "all it did was change the color of the same
  little box, I wanted to improve" the COURSE itself).** CS246's palette/frame theming was too superficial —
  the play view still read as a generic cartoon because the art itself was the problem: the rough was a
  wall-to-wall carpet of hundreds of identical tiny tree-dots (STEP≈22, only 15% gaps) plus random pink/white
  flower speckles, over a flat bright fairway with near-invisible mow bands. (Worse, CS246's density tweaks
  had made some courses even more cluttered.) This pass rebuilds how the scene reads, in `hvTerrain`:
  • **Fewer, bigger, varied trees.** Tree STEP raised (dense 22→30, open 26→34), organic clearings raised
    (gap 0.15→0.3 / 0.34→0.44), and tree radius grown + widened (was ~5-10, now ~7.5-17 with more variance
    and stronger near/far perspective) — so trees read as real trees framing the hole, not a uniform grid of
    dots.
  • **Breathing room along the fairway.** New `nearFw()` test opens a first-cut band (~1.15×STEP) around the
    fairway corridor, thinning ~62% of the trees that would crowd the edge — the hole has space instead of
    trees pressing right against the short grass.
  • **Half the flower speckles** (a per-plant skip on the noisy pink/white `flower` bushes) — much less
    visual noise.
  • **Manicured fairway + depth.** Real mowing stripes now show (alternating light/dark bands at 9%/6%
    opacity, was a single ~4.5% white overlay), and the rough's soft elevation shading was strengthened (7→9
    undulation blobs, opacity .16→.2) for a rolling, depth-y surface.
  All 39 courses share the pass, so it stacks with CS246's per-course identities: Winged Foot now reads as an
  intentional tree-lined hole with a striped fairway, Oakmont as a genuinely open championship course with
  big fairway bunkers, etc. Rendering-only (terrain is still built-once-and-cached per hole; fewer trees =
  cheaper, not slower). Sim, geometry, and score untouched. Verified in Playwright: all 39 courses render (0
  null, 39/39 framed + distinct), a full Winged Foot phone round plays to completion with zero page errors;
  before/after screenshots confirm the wall-of-dots is gone and the fairway now looks manicured. Deployed to
  /golf. NOTE: still the same top-down flat-illustration style — if the owner wants a bigger art-direction
  change (a different reference look / more realism), that's a separate, larger effort; this pass makes the
  existing style read as premium rather than noisy. Tunable: STEP/gap/tree-radius, the `nearFw` band + skip
  rate, mow-stripe opacity.

- **CS248 — round-screen "broadcast" chrome (owner: the tracer graphic is fine, "I want the aesthetic
  AROUND it to look better").** CS246/247 improved the course art, but the owner clarified the ask was the
  UI *surrounding* the tracer — the loose tag pill, plain scorecard boxes and controls floating on flat
  green. Owner picked all three directions (AskUserQuestion: frame as one panel + polish the pieces + richer
  background). A presentation-only pass on `scrDailyRound` (daily/spotlight/moment/legend rounds):
  1. **Broadcast title bar** (`.bcasthd`) replaces the tiny centered `.tag` pill: a full-width header above
     the window with the course name in the display italic + a course-accent left edge, and the conditions ·
     plan in the accent on the right. Reads like a broadcast lower-third and, sitting flush above the
     TOURTRACE strip + framed window, groups them into one unit (full-bleed on phones to match the window).
  2. **Framed scorecard panel** (`.dcardwrap`): the 18-cell strip is wrapped in a titled card ("SCORECARD ·
     N thru" + a "Tap a hole to rewatch" hint on the right) with a subtle gradient/border/shadow, and the
     cells (`.dcell`) got a gradient + inset highlight and a soft glow on the current hole — so the bottom of
     the screen reads as a designed scoreboard, not bare boxes.
  3. **Richer background** (`.droundglow`): a subtle course-accent radial glow (fixed, z-index -1, ~11%
     opacity) behind the whole round, warming the flat dark-green backdrop (incl. the empty desktop margins)
     and tying the screen to the day's theme.
  Together the header → window → scorecard now stack as one cohesive broadcast module with consistent width,
  accent trim and depth, instead of loose elements on flat green. Presentation-only — no sim/geometry/score
  change; the moment-round's own event tag and the H2H screens are untouched (daily-only classes). Verified
  in Playwright: all 39 courses render, a full Winged Foot round plays to completion, zero page errors;
  desktop + phone screenshots confirm the cohesive framing, the framed scorecard, and the background glow.
  Deployed to /golf. Tunable: `.droundglow` opacity, `.bcasthd`/`.dcardwrap` styling.

- **CS249 — moodier, illustrated hole-view art (interim art-style upgrade; owner wants closer to the
  painterly mockups but accepts the procedural ceiling).** Owner shared AI-generated mockups of a
  painterly/illustrated top-down hole and asked to get closer to that art style (away from the flat "retro"
  look), keeping each course's unique per-biome identity. Established the honest ceiling: the procedural
  SVG renderer can approach the MOOD but can't become painterly raster art (that needs a generated-image
  pipeline — documented below as the parked real path). Owner chose to SHIP the procedural improvement as
  an interim. All in `hvTerrain`, applies to every course/hole, keeps the live tracer, self-contained:
  • **Moody lighting** — the depth vignette is much stronger (edges fall toward near-black like the mockup),
    so the course reads dark/atmospheric instead of flat bright.
  • **Glowing fairway** — a soft warm sheen (`hvsheen`) on the short grass so it pops out of the shadows.
  • **Gold fireflies** — ~46 tiny warm glowing particles drifting in the darker rough (sparse over the lit
    fairway), the mockup's signature.
  • **Dimensional trees** — the key art-style lever: shared shading gradients (`hvsphere` for round
    canopies, `hvcone` for conifers) overlaid on every tree so flat discs/triangles read as ROUNDED,
    lit-from-top-left forms — regardless of each course's own colors. Applied across canopy / broadleaf /
    birch (sphere) and pine / spruce / cypress (cone), plus softer cast shadows, so all biomes match.
  • A faint cool haze kept only near water. Filter-blurred shapes are few (edges only), so cost stays low;
    terrain is still built-once-cached per hole.
  Per-course biomes/identities (CS246) are untouched — only the drawing style/lighting changed. Verified in
  Playwright: all 39 courses render (0 null, framed, distinct), a full round plays to completion, a 6-biome
  spread (pine/coastal/links/desert/tropical/alpine) all look consistent and moody, zero page errors.
  Deployed to /golf. Tunable: vignette/fog/sheen opacity, firefly count, the `hvsphere`/`hvcone` shading
  strength.
  **PARKED — the real painterly art style (needs owner's go + an image source):** the only way to actually
  match the painterly mockups is generated IMAGES, not code-drawn shapes. Feasible plan: use each hole's
  existing procedural GEOMETRY as the structure guide for an img2img/ControlNet generation → the AI restyles
  it painterly AND it auto-aligns with the hole, so the live ball tracer still works on top. ~702 images,
  one-time batch (~$10-30 on a gen API), hosted on a CDN + lazy-loaded, with the procedural renderer as the
  fallback. I can build the entire client side (image backdrop + tracer overlay + lazy-load + fallback); I
  CANNOT generate the images from this sandbox (no image-gen tool) — needs an AI image API key or the owner
  running the batch. Proposed proof-of-concept before committing: owner generates ONE painterly image for a
  specific hole (I provide the exact hole geometry/reference to prompt from), I wire it in with the working
  tracer to demonstrate quality. Owner picked "ship the interim" for now; the image POC is available on
  request.

- **CS250 — home-page reorganization: "Beat the Pro" is the top button; clearer 2-group hierarchy (owner:
  "reorganize the home page and make it easier for users to process. Move daily challenge to be the top
  button, rename it BEAT THE PRO. What else can enhance playability/UX?").** The title `scrTitle()` stack
  used to read hero → marketing badge + lede → [Resume/Career gold] → Play Online → Career Mode → Daily
  Challenge (blue, at the BOTTOM) → its satellites, i.e. the daily was the last thing you saw and there was
  a text wall before any button. Reorganized into two clearly-labelled groups with the daily on top:
  1. **Renamed "Daily Challenge" → "Beat the Pro"** on the primary user-facing surfaces — the home button (all
     4 branches: Practice / fresh / done / N-left, still `startDailyChallenge`, kept BLUE per the CS210 colour
     system), the daily-preview kicker ("TODAY'S BEAT THE PRO"), the daily-preview tag ("⛳ Beat the Pro ·
     today's course"), and the draft-screen mode tag. Left the deeper help/achievement "Daily Challenge"
     strings as the descriptive feature name (brand + descriptor pattern), so existing achievement categories/
     data are untouched.
  2. **Beat the Pro is now the TOP button** (owner's explicit ask) — one quick, low-commitment round is the
     easiest thing to tap on landing — with its whole satellite family grouped directly under it (live
     countdown, free-Legend hook, streak / streak-at-risk banner, weekly meta-goals panel, Monthly Spotlight).
  3. **A "CAREER" section divider** (`.stack-sep` — a labelled gradient rule) separates the quick-daily group
     from the deep career group: Resume Career/Legend Circuit or View Ceremony (gold primary / teal) → Resume
     Draft → Career Mode (gold primary, or a quiet ghost when a resume exists) → Play Online (teal, prominent).
     The CS210 colour hierarchy (gold = single primary career action, blue = daily, teal = online) is intact;
     the resume/ended/draft branch LOGIC is byte-identical, just relocated as a block.
  4. **Decluttered the top:** removed the marketing lede paragraph (the biggest text block before the buttons)
     so you reach the first button faster; kept the small "⛳ 30-Year Career Simulation" badge (product
     identity) + the small "Your best" line.
  Verified in Playwright (440px): fresh state renders Beat the Pro first (blue), no "Daily Challenge" button,
  `startDailyChallenge` still wired, the CAREER divider present, Career Mode gold (no resume) with Play Online
  after; the preview kicker reads "TODAY'S BEAT THE PRO"; zero page errors. (The resume-gold/career-ghost path
  is sign-in-gated per CS54, so it only shows for a signed-in account; the branch code is unchanged from before
  the move.) Screenshot confirms the cleaner hierarchy. Deployed to /golf. FURTHER UX SUGGESTIONS surfaced to
  the owner in chat (first-run "one-tap try" flow, a guest→account conversion nudge on the result, a persistent
  bottom-tab nav, an "Up Next" resume hero for returning careers, sound/haptics polish) — not yet built,
  awaiting picks.

- **CS251 — round-screen restyle to the owner's mockup: gold-panel scoreboard + simple PREV/PLAY/NEXT
  controls.** Owner sent a mockup from another AI and circled two elements to adopt the STYLE of (keeping our
  own scoreboard LOCATION): the live scoreboard and a simple bottom control bar; "the simple controls would
  make our game a lot easier to play and understand." All presentation/UX — the sim, hole view, and score
  engine are untouched.
  1. **Scoreboard → one cohesive gold-bordered panel** (was loose translucent chip rows). Restyled
     `.hvboard`/`.hvbcap`/`.hvbrow` into a single dark panel with a gold border + soft shadow: a left-aligned
     **THRU n** header, a gold **TARGET x** line, the YOU / TOUR PRO rows (rank · dot · name · score, the YOU
     row highlighted with a gold-tinted fill + ring), and a **TO BEAT x** footer — matching the mockup.
     Because the CSS is on the shared board classes, the Moment and online H2H watch/sudden-death boards
     inherit the same panel style automatically (they keep their own caption/rows, no target/footer). Kept
     the CS232 bottom-right location + the CS170 live FLIP row-swap animation.
  2. **Simple bottom control bar** (`dRoundControls()` + `.hvctrl` CSS) replaces the old stack of three ghost
     buttons (Skip-this-hole / Pause / Skip-to-end). One bar: **◀◀ PREV SHOT** · a big green **PLAY/PAUSE**
     circle · **NEXT SHOT ▶▶** (crisp inline-SVG icons, no emoji), with a state caption ("Playing your round"
     / "Paused · tap play to continue" / "Reviewing · Hole n · Shot j of m") and a small "Skip to the end"
     link. Wired to the existing reveal engine: **PLAY/PAUSE** = `dailyResume`/`dailyPause`; **NEXT** =
     `dailyNext` (reveal the next shot now while a ball is in flight — keeping the auto pace if playing —
     else `dailyAdvanceNow` advances to the next hole / triggers the signature decision / finishes, a
     timer-free mirror of `scheduleDailyAdvance`); **PREV** = `dailyPrev` (pause + open the shot-review one
     shot back; steps within/across holes when already reviewing). The centre button becomes Resume/Back in
     review. The old separate review exit button was removed (the bar's centre handles it). Mulligan stays as
     a secondary button between holes. Shown for every live/review state; the done + momentPO branches keep
     their existing "Heading to the clubhouse" / "See your round" / playoff handling.
  Verified in Playwright (practice-mode round): the scoreboard renders the panel with THRU/TARGET/TO BEAT +
  the highlighted YOU row; the control bar renders PREV/PLAY/NEXT + caption + skip link; PAUSE→"Play",
  NEXT advances shots then holes (reached hole 3 then 11), NEXT correctly fires a signature-hole decision
  modal, PREV enters review ("Reviewing · Hole 3 · Shot 1 of 4", centre="Resume"), PLAY resumes, Skip-to-end
  → dailyresult; the auto path (unchanged) still progresses; zero page errors. Screenshots confirm the
  scoreboard + control bar match the mockup. Deployed to /golf. Tunable: the `.hvctrl`/`.hvboard` styling.

- **CS252 — sound + haptics on key moments (with a mute toggle) + a visual streak calendar** (owner picked
  these two from the earlier UX-suggestions list). Both client-only, no backend.
  1. **Sound + haptics.** A small WebAudio SFX layer (`sfx(name)` + `_tone`, no assets, in the style of the
     existing `chime`/`hvSplashSound`) plays a one-shot at each key moment: **holed putt** every hole (a soft
     "cup" tock, a brighter 3-note sparkle for birdie-or-better) fired when the ball actually drops in
     `startShotReveal`'s sink timer; **win** (a rising fanfare) on every celebration — `celebrateWin`,
     `celebratePlayoff`/podium, the daily course-record celebration, `h2hCelebrate`, and beating the pro in
     the daily; **streak** (a warm ding) when a daily round finishes without a beat-the-pro (so there's always
     exactly one positive sound at the finish). Haptics: all `navigator.vibrate` calls now route through a
     single `buzz(pattern)` helper that respects the mute toggle AND `prefers-reduced-motion` (previously
     inconsistent), plus a light buzz on birdie+ hole-outs and the win/streak finish. **Mute toggle:** a new
     **Settings** section in the ≡ menu with **Sound** and **Haptics** switches (`menuToggle`, device-local
     `bag_sfx_sound`/`bag_sfx_haptic`, default on; toggling Sound on plays a confirmation beep — the tap is a
     user gesture so WebAudio unlocks). `sfxOn()`/`hapticsOn()` gate everything. Added themed `sound`/`haptic`
     SVG icons (+ 🔊/📳 EMOJI_MAP entries) so the toggle rows match the rest of the menu's gold icon set.
  2. **Streak calendar.** `bag_streak` now records a per-day history map (`days`: dayKey → 1 played / 'f'
     freeze-bridged) in `bumpStreak`; `mergeStreak` unions it (grow-only) so the calendar is consistent
     cross-device. New `streakCalendar(n)` renders the last 14 UTC days as compact coloured cells — teal =
     played, gold = beat the pro (cross-referenced from `dailyStats().wonDays`), blue = freeze-bridged, faint =
     missed, today ringed — with a "🔥 N day streak · Best M" header and a legend. It replaces the old
     one-line "streak going" text on the title (shown once there's daily history) and also appears on the daily
     result (today filled in). Makes the streak feel visual, not just a number.
  Verified in Playwright: SFX defaults on, respects the mute (no AudioContext when muted), never throws; `buzz`
  respects mute + reduced-motion; the menu shows both toggles (themed SVG icons, flip + persist correctly);
  the calendar renders 14 cells with the right play/beat/freeze/today classes + legend; `bumpStreak` records
  today and `mergeStreak` unions the day history (max longest, newer `last` wins); a full non-practice daily
  round reaches the result with the streak advanced (2→3, today recorded) and the calendar shown; zero page
  errors. Screenshots confirm the calendar + the Settings toggles. Deployed to /golf. (Practice mode records
  nothing, so no streak/calendar there, as intended.)

- **CS254 — button-copy audit: trim verbose subs + a richer "continue your career" card** (owner: "too
  many words on a single button… lessen the descriptions or find a better way; for the career continuation
  button, make it a little bigger with info of where you are"). Client-only.
  • **Resume Career → a structured card** (`resumeCareerCard(cs)` + `.resumecard` CSS) instead of a run-on
    text sub. A bigger gold card showing: the golfer's name + an OVR badge, a **year-progress line + bar**
    ("Year 13 of 30" / "Legend Circuit · Year N"), a **status** chip (Off-season / Mid-season · event N /
    Season results / Ready to play), and a **stat row** (wins · majors · net worth via `fmtShort`) with a
    "Continue ▸" affordance. It's a single accessible button → `resumeCareer`. Replaces the old
    "Year 13 off-season · JJ · tune your game, then run the season" sub.
  • **Trimmed verbose subs** across the flagged surfaces: the daily **Beat the Pro** button
    ("Best 70 (−1) · tour average beaten ✓, go lower (3 tries/day)" → "Best 70 (−1) · beaten ✓ · go lower",
    and the other states shortened); **Career Mode** start ("Draft your golfer · 30-year career"; the
    new-golfer variant is now "New Career · Draft a new golfer"); **Resume Your Golfer** draft
    ("N/8 skills drafted"); and the **off-season** Spin ("N changes left · start anytime"), Re-spin
    ("Pass on this golfer for a new one") and lede (the rules explained once, concisely) — the buttons no
    longer repeat the full rules the lede already covers.
  Verified in Playwright: the resume card renders name/OVR/year-of-30/status/wins/majors/net-worth with a
  progress bar and is clickable; the trimmed daily + career subs read short with the old run-on copy gone;
  zero page errors. Screenshot confirms the card. Deployed to /golf.
- **CS255 — daily "Beat the Pro" in-round scoreboard shows TODAY'S BEST** (owner: "somewhere on the daily
  leaderboard should be the high score of the day — maybe the high score, your current standing, and the
  course avg"). The floating TOURTRACE scoreboard's daily branch is now a mini leaderboard: a **TODAY'S
  BEST** row (gold) + **YOU** (blue) + **TOUR PRO** (course-avg pace, red), sorted by score so your row's
  rank shows where you stand, under the THRU/TARGET header and above the TO BEAT footer. Today's best =
  the day's global board leader (`dbCache`, loaded once at round start via `dbLoad` in `beginDailyRound`,
  fails open) or, when the board isn't available (guest/offline/early), your own best of the day
  (`dailyBest`); the row is omitted only when neither exists. Widened the board (176px) + name column so
  "TODAY'S BEST" fits. Verified in Playwright: the board shows TODAY'S BEST/YOU/TOUR PRO with the global
  leader (−5) sorted correctly, and falls back to the player's own best-of-day (−3) with no global board;
  zero page errors. Screenshot confirms the layout. Deployed to /golf.

- **CS256 — matching hero cards for Daily / Spotlight / Online (owner loved the CS254 resume card, wanted
  the same for the other primary actions).** A shared `.gcard` component (same polish as `.resumecard` —
  rounded, soft shadow, kicker + display-italic title + badge + one-line mid + a chip/go row) with three
  accent themes, replacing the plain title buttons:
  • **Daily → `dailyHeroCard()` (blue)** — "Daily Challenge / Beat the Pro" with an attempts badge
    (PLAY / N LEFT / BEATEN ✓ / DONE / PRACTICE), a one-line best/objective, and a chip row that **folds in
    the streak** (🔥 N-day streak, a hot gold chip + "on the line" when the streak is at risk today, else
    "Start your streak") + the live "New in HH:MM" countdown + Play ▸. Replaces the separate daily button +
    countdown line + streak-risk banner; the CS252 streak calendar still renders below it.
  • **Spotlight → `spotlightHeroCard()` (amber, pulsing)** — "★ Monthly Spotlight / July Spotlight" with a
    THIS WEEK / N LEFT / WON ✓ badge, the course + conditions, and Play ▸.
  • **Online → `onlineHeroCard()` (teal)** — "Play Online · NEW / Head to Head" with the 1v1 + Foursomes
    mode buttons inside (a `<div>` container, since a button can't nest buttons), wired to `openH2H`.
  All keep the CS210 colour hierarchy (daily blue, online teal, spotlight amber-event, career gold) so the
  title reads as a cohesive set of premium cards. Reduced-motion disables the spotlight pulse.
  Verified in Playwright: the daily card renders title/badge/streak-chip (hot when at-risk)/countdown and is
  clickable; the no-streak state shows "Start your streak"; the spotlight card renders when live (July
  Spotlight · THIS WEEK); the online card renders Head to Head with both mode buttons wired; the streak
  calendar still shows below the daily card; zero page errors. Screenshot confirms the four-card layout.
  Deployed to /golf.

- **CS257 — home reorder + spotlight recolor + declutter + "Build" language + daily reset → US Eastern.**
  A batch of owner tweaks:
  • **Career Mode is now 2nd**, right below Beat the Pro. The homepage is a clean set of mode cards in order
    Beat the Pro (blue) → Career (gold) → Play Online (teal) → Monthly Spotlight; the old "CAREER" divider is
    gone.
  • **Spotlight recolored** from amber to **purple** (`.gc-purple`, pulse recolored to match) so it no longer
    looks like the gold Career card — Career stays yellow/gold.
  • **Streak calendar + weekly goals moved off the homepage** into the Beat-the-Pro flow (the daily preview
    screen, `scrDailyPreview`), so the title stays clean. The free-Legend hook was already covered by the
    preview's "Your Legend golfers" block; the daily card still folds in the streak chip.
  • **Fixed cut-off card titles** — `.gc-title` no longer clips (`white-space:nowrap`/`overflow:hidden`/
    ellipsis removed → it wraps, with a little right padding for the italic overhang), so "July Spotlight"
    etc. show fully.
  • **"Draft" → "Build" for golfer creation** (owner: "Build your golfer sounds better, promote it over
    draft"). Changed all user-facing "draft your golfer"/"draft a golfer" and related promo copy — the title
    cards, career subs ("Build your golfer · 30-year career", "Build a new golfer"), the build-screen header,
    the daily preview CTA ("Build your golfer ▸"), the H2H intro + "Golfer submitted ✓", the how-to tips
    ("Build for the course"), the meta description, and the resume sub ("N/8 skills built"). Left the
    skill-level draft MECHANIC terms (the "draft a skill" spin/take action, the "The Draft" achievement
    category) as-is since they accurately describe the wheel mechanic.
  • **Daily challenge resets at midnight US Eastern, not UTC** (owner). `todayKey`/`yesterdayKey`/
    `twoDaysAgoKey`/`dayKeyBack`/`dNextResetMs` now compute the "day" in **America/New_York** (auto EST/EDT)
    via `Intl.DateTimeFormat`, with a UTC fallback. Deliberately a SINGLE fixed zone, not the user's local
    zone: the daily course + leaderboard are GLOBAL, so all clients must share the same day key at the same
    instant — per-user local time would split players onto different courses/boards (flagged this to the
    owner). No SQL change: the server just stores whatever day key the client sends, and every client now
    agrees on ET. User-facing "midnight UTC" copy → "midnight ET". The daily seed (`todayKey()`) drives the
    course rotation + board key, so it all follows automatically.
  Verified in Playwright: title order daily→career→online→spotlight with a purple spotlight card and no
  streak calendar on the homepage; the daily preview now shows the streak calendar + weekly goals + a "Build
  your golfer" CTA (no "Draft your golfer" left); card titles render un-clipped; `todayKey()` matches the ET
  calendar date, `yesterdayKey()===dayKeyBack(1)`, and `dNextResetMs()` counts down to ET midnight; the
  online card + meta use "Build". Zero page errors. Screenshot confirms the four-card layout. Deployed to
  /golf. NOTE: the UTC→ET switch shifts the day boundary a one-time small amount at deploy (a player mid-day
  may see the "new course" timing move by up to a few hours once); self-corrects the next day.

- **CS258 — touching hero cards fixed + Spotlight playable/done states + two confirmations (owner
  screenshots + mid-turn asks).** Batch:
  • **Touching cards (owner: "beat the pro and career mode shouldn't be touching").** The stacked title
    hero cards (blue Beat the Pro `.gcard` + gold `.resumecard`/Career button) had only the generic
    `.stack>*+*{margin-top:10px}` gap, which read as touching under the cards' big drop-shadows/rounded
    corners. Added `.stack>.gcard,.stack>.resumecard{margin-top:16px}` (with a `:first-child` reset so the
    top card isn't over-spaced) — verified a clean 16px gap between the daily card and the resume card.
  • **Monthly Spotlight neon-when-playable / translucent-when-done (owner: "this user can no longer play
    July Spotlight, so it should be translucent; if playable it should be more neon purple and glowing").**
    `spotlightHeroCard()` now branches on `playable = left>0`: playable → `spot-neon spotlive` (a brighter
    neon-purple gradient + a constant purple GLOW that breathes brighter via the enhanced `spotPulse`
    keyframes; reduced-motion gets a static strong glow), CTA "Play ▸"; all attempts used → `spot-done`
    (opacity .5 + desaturated, no pulse/glow), CTA "View result ▸". So a finished Spotlight reads as
    unavailable and a live one pops.
  • **Off-season "lock in" confirmation (owner: "when selecting a skill to change, ask to lock in so you
    can't mis-click").** Tapping an off-season skill tile no longer applies the swap immediately — it opens
    a new `confirmSkill` overlay ("Lock in {skill}? {cur} → {nv} · ▲/▼ delta · this stat locks for the rest
    of the off-season") with Lock-it-in / Cancel; only Lock-it-in calls `offTake(k)`. Prevents a costly
    mis-tap on the once-per-off-season stat lock.
  • **Retire confirmation with years-left (owner: "if you click retire, warn 'are you sure… you have 15
    years left'").** The season-summary "Retire, End Career" / "End Circuit Now" button now opens a
    `confirmRetire` overlay instead of ending immediately: career shows "You still have N years left in
    this 30-year career…" (N = `CAREER_MAX_YEARS − S.year`), circuit shows "N seasons left on the Legend
    Circuit" (N = `CIRCUIT_MAX_YEARS − circuitYear`), red "Retire for good" / "End the Circuit" +
    "Keep playing". Only the red button calls `endCareer('chose')`/`endCircuit()`.
  Both overlays reuse the existing `.ov` confirm pattern (registered in the render overlay dispatch;
  `S.confirmSkill` carries the tapped stat). Verified in Playwright: 16px card gap; spotlight playable
  (neon+spotlive+"Play ▸") vs done (spot-done, opacity .5, "View result ▸", "WON ✓"); the skill tile opens
  the lock-in overlay and locking applies the swap (changes 0→1, stat locked); the retire overlay shows
  "15 years left" (career) and "9 seasons left" (circuit) with the right title/buttons; zero page errors.
  Deployed to /golf.

- **CS259 — setup avatar no longer eats the phone screen (owner: "golfer is way too big when scrolling on
  phone, takes up almost the whole screen").** The sticky full-body avatar on the "Create your golfer"
  screen was `min(58vh,520px)` tall for everyone, so on a phone it dominated the viewport while the options
  scrolled beneath it. Replaced the inline height with a responsive class `.avatarfig.fullbody.av-setup-full`:
  `min(56vh,520px)` on desktop (unchanged), `min(34vh,300px)` on phones (`@media max-width:700px`). Needed
  the three-class selector to beat the existing `.avatarfig.fullbody{height:auto}` rule (a single-class rule
  lost on specificity and collapsed the canvas to its 1400px intrinsic height — caught in Playwright).
  Verified: phone 390×844 → 287px (34vh), desktop 1200×900 → 504px (56vh), zero page errors. Deployed to
  /golf.

- **CS260 — home is just the 4 modes: no "New Career" button when a career exists (owner: "take out the
  new career button… to start a new career, go into your existing career").** The title screen always
  appended a Career-start button, so a player with a saved career saw a redundant ghost "New Career / Build
  a new golfer" between the gold Continue-Career card and Play Online. Now the Career-start button only
  renders when there's NO career save (`if(!cs)`): a fresh player gets the gold "Career Mode" primary, and
  a stale build-draft with no career gets the ghost "New Career". With a saved career, the home is exactly
  the four mode cards — Beat the Pro / Continue Career / Play Online / Monthly Spotlight — and a new career
  is started from inside the current one (Continue → off-season → Retire → start a new golfer). Verified in
  Playwright: with a career the stack is gc-blue / resumecard / gc-teal / gc-purple and no New-Career button;
  with no career the gold "Career Mode" button shows; zero page errors. Deployed to /golf.

- **CS261 — Challenges system: Daily Quests + Weekly Challenges + Player Level (XP→coins) + mulli-spins
  (owner: replaced the disliked weekly streak-freeze reward).** Removed the old `WEEK_GOALS`/`bumpWeekGoals`
  weekly-goals-→-freeze system entirely and built a proper challenges layer (signed-in feature; guests never
  accrue). Owner decisions: XP raises a Player Level that pays out Pro Shop coins per level; the weekly reward
  is a "mulli-spin" (a banked extra spin used when you run out of draft/off-season re-spins).
  • **Player Level (XP → level → coins).** `bag_xp={xp,mulliEarned,mulliSpent}`. Level curve `xpForLevel(L)=
    200+(L-1)*40`; `addXp(n)` bumps XP, and a `levelCoinTotal(playerLevel())` term added to `coinsEarnedRaw()`
    means level-ups flow coins through the existing coin/reconcile/toast pipeline (250 coins per level). XP
    toast on gain, "Level N!" + fanfare on level-up.
  • **Daily Quests** (`bag_dailyquests`, reset daily): 3 tasks — Play the Daily · Complete a Career season ·
    Play a Head to Head match. Finishing all 3 in a day → +120 XP once. Hooked in `finishDailyRound`
    (daily), the season record block (season), and `h2hCaptureAch` (h2h).
  • **Weekly Challenges** (`bag_weeklychal`, reset weekly): a deterministic set of 4 drawn from a 12-entry
    pool — always one career + one online + one daily + an extra, so the week forces all modes. Harder,
    cross-mode goals (Win 5 majors, Win 10/20 tournaments, Complete 3/5 seasons, Play/Win 3-5 H2H matches,
    Beat the Pro 3-5×, Play the Daily 5×). Each completed → +250 XP **and a 🌀 mulli-spin**. Metrics
    incremented at the same hooks (daily plays/beats, season seasons/wins/majors from the season results,
    h2h matches/wins).
  • **Mulli-spins** (`mulliSpins()`/`addMulliSpin`/`useMulliSpin`): a "Use a Mulli-Spin · N left" button
    appears in the career draft AND the off-season tune-up when you've run out of re-spins, granting one
    more spin per banked token (owner's "when you run out of spins → use a mulli-spin").
  • **UI:** `challengesNode()` (a Player Level XP bar + Daily Quests panel + Weekly Challenges panel) renders
    on the Daily preview (replacing the old weekly-goals panel) and the Daily result (celebrating anything
    completed this round), plus a dedicated **Challenges overlay** reachable from a new ≡-menu "🎯 Challenges"
    row (shows the player's level). New `.chalpanel`/`.xpbar` CSS.
  • **Cloud sync:** `bag_xp`/`bag_dailyquests`/`bag_weeklychal` added to the CS82 cloud bundle with grow-only
    merges (`mergeXp` max-all, `mergeDailyQuests` newer-day-then-union, `mergeWeeklyChal` newer-week-then-max-
    prog+union-done). The old `bag_weekgoals`/`mergeWeekGoals` were removed from collection + pull.
  Verified in Playwright: level 1→2 after 250 XP; all-3 daily quests → +120 XP; a weekly challenge completing
  → +250 XP + 1 mulli-spin; a mulli-spin banks (2) and is consumed (→1) on use; the level-coin term makes
  coins rise +1500 for reaching level 7 (2000 XP); the Challenges panel + overlay + menu row render; weekly
  set spans career/online/daily; zero page errors. Deployed to /golf. (No SQL — all client-side via the
  existing cloud-save blob.) Tunable: `DAILY_QUEST_XP`, `WEEKLY_CHAL_XP`, `LEVEL_COIN`, `xpForLevel` curve,
  `WEEKLY_POOL`.

- **CS262 — home-screen polish: new-career gold CARD, no duplicate "Play", bigger mode titles (owner
  screenshots, mobile).** Three asks: the "start a new career" state looked like a plain centered button
  (unlike the liked Continue-Career card); "Play" appeared twice on the Beat-the-Pro card; and the mode
  titles needed more emphasis so it's obvious what each mode is.
  • **New-career as a gold card.** Replaced the centered gold `.btn` "Career Mode" with `careerHeroCard()` —
    a left-aligned gold `.gcard.gc-gold` matching the other mode cards (kicker "Start Your Journey", big
    italic title "Career Mode", "Build your golfer, then play a 30-year career", 30 YRS badge, "Build ▸").
    So the home is now four consistent left-aligned cards (blue Beat the Pro / gold Career Mode / teal Head
    to Head / purple Spotlight) with no odd centered button. A stale build-draft still shows the quiet ghost
    "New Career" button under "Resume Your Golfer" (that path is unchanged).
  • **Removed the duplicate "Play".** The Beat-the-Pro card's fresh state showed a "PLAY" badge AND a
    "Play ▸" CTA; dropped the "PLAY" badge (badge only renders for real states now: 2 LEFT / BEATEN ✓ /
    DONE / PRACTICE), leaving just the "Play ▸" CTA.
  • **Bigger mode titles.** `.gc-title` 23px→28px (heavier line-height + slight letter-spacing) and the
    `.gc-kick` label brightened (opacity .72→.82, 10→10.5px) so "Beat the Pro" / "Head to Head" / "Career
    Mode" read as the clear headline of each card.
  Verified in Playwright (412px phone): fresh player shows the gold left-aligned Career Mode card (no
  centered button), the daily card has no PLAY badge (only "Play ▸"), title renders at 28px; with a career
  the resume card shows and the daily badge correctly reads "2 LEFT"; zero page errors. Screenshot confirms
  the four cohesive cards. Deployed to /golf.

- **CS263 — career bests moved from the home top onto the new-career card (owner).** The "Your best:
  $X · OVR Y · N builds" line under the "30-Year Career Simulation" badge is removed from the top of the
  title; those lifetime career bests (`career()` → bestMoney/bestOvr/builds) now render as chips ("Best $X"
  / "OVR Y" / "N builds") inside `careerHeroCard()` — so they show on the Career Mode card exactly when you
  have no banked career and are about to start a new one. With a saved career you see the Continue-Career
  card's own stats instead. Verified in Playwright: top no longer contains "Your best", the gold new-career
  card shows the three bests chips; zero page errors. Deployed to /golf.

- **CS264 — Career Hub dashboard (first slice of the ChatGPT visual audit; owner picked "Career Hub").**
  Turned the top of the live season screen (`scrSeason`, the screen players see most) into a franchise-mode
  dashboard header, replacing the plain 6-cell `.sbar` stat grid:
  • **Career banner** (`.careerbanner`) — a raised gradient panel with the golfer's portrait avatar (gold-ringed
    medallion), name (display italic), "Year N of 30 · Age M" (circuit → "Legend Circuit · Yr N · Age M"),
    and a compact stat row: World rank (#), Tour rank (#), Net (short signed, green/red), Wins, and a **Form**
    chip driven by season confidence (▲ Hot / ● Steady / ▼ Cold). Reads like a 2K MyCareer header instead of a
    web-dashboard stat bar. Mobile: the stat row wraps full-width and space-betweens.
  • **Season event rail** (`.seasonrail`, new `seasonRailNode()`) — a horizontal, scrollable timeline of the
    whole schedule: completed events show your finish (WIN in gold for a victory, else `ord(pos)` e.g. 5th /
    62nd), the current event is highlighted gold with "NOW", upcoming events fade back to 50% opacity. Majors
    get a ★. The rail auto-centers the current event on render (container-only scroll — never moves the page).
  The live tournament (leaderboard + scorecard) and controls sit directly below, unchanged (CS241 order kept).
  Pure presentation — no sim/season-state changes; all data comes from existing `S.season`/`S.schedule`/
  `S.season.results`/`myWorldRank()`/`playerAge()`. Verified in Playwright: a real career season renders the
  banner (name/year/age/5 stats/avatar) + the rail (21 chips, NOW on current, done chips) with the old `.sbar`
  gone and zero page errors; a seeded state confirms the WIN/5th/62nd/NOW/upcoming chips and the ▲ Hot form
  chip; screenshot confirms the franchise-dashboard look. Deployed to /golf.
  **Follow-ups from the same audit (not this pass, owner to sequence):** a career milestone/narrative timeline
  (first win, major, ranking milestones), the design-token/card-tier foundation, the Build-a-Golfer live stage,
  and broadcast-recap results screens with animated ResultDeltas.

- **CS265 — career milestone/narrative timeline (second slice of the visual audit, pairs with CS264).**
  Added a "Career Timeline" that reads like a franchise story, derived entirely from the career's own history
  (`S.career.winsList` + `.seasons`) — no new data/tracking. `careerMilestones(c)` builds an ordered set:
  Turned Pro (Yr 1) → First Tour Win (event named) → First Major (which major) → 10th/25th/50th/75th Career
  Win → 3/5/10 Career Majors → **Career Grand Slam** (the year the 4th distinct major is won) → Topped the
  Money List (first season money-list #1) → Career-Best Season (max-net year, "$Xm net · N wins"), sorted by
  year. `careerTimelineNode(c)` renders it as a vertical timeline: a gold-ringed dot with a themed icon
  (⛳/🏆/★/💰/👑 → the app's SVG icons via emojifyIcons), a connecting rail, a "Yr N" badge, and title + sub.
  Wired into all three career views: the season-summary **Career tab** (after Career Stats), and both the
  **career-end** and **Legend-Circuit-end** ceremonies (using each ceremony's own `c`). Renders only with ≥2
  milestones (so a brand-new career doesn't show a lone "Turned Pro"). New `.ctimeline` CSS. Verified in
  Playwright: a rich seeded career produces the 9-milestone timeline in correct year order (Turned Pro →
  First Win → First Major → 10th Win → Money List → Career-Best → 3 Majors → Grand Slam → 5 Majors), the node
  renders with themed icons + rail, zero page errors; screenshot confirms the franchise-story look. Deployed
  to /golf. Remaining audit follow-ups: Build-a-Golfer live stage, broadcast-recap results (animated
  ResultDeltas), design-token/card-tier foundation.

- **CS266–CS269 — visual-audit batch (owner: "run everything from ChatGPT's list").** Autonomous pass
  through the remaining high-ROI items of the ChatGPT aesthetic audit, each tested + deployed:
  • **CS266 — Build-a-Golfer live stage.** The setup avatar is now a proper STAGE: a golden radial
    spotlight glow behind the golfer, the golfer's name in display-italic ABOVE it, and an elliptical floor
    shadow beneath (`.avstage`/`.avfloor`). Replaced the inline "Build Your Golfer" button with a **sticky
    bottom action bar** (`.setup-actionbar`, Back + primary CTA) so the primary action stays reachable while
    scrolling the kit options. Guest shows "Your Golfer" + the existing locker-room upsell.
  • **CS267 — Season Impact broadcast card.** Replaced the static World-Ranking box on the season summary
    with a recap card whose numbers **count up on first view** (ease-out tween, reduced-motion paints final):
    World Rank prev→now (with ▲/▼), Tour Points gained, Earnings, Net Profit (green/red), + the Tour Card
    status line. New `_animCount()` + `seasonImpactNode()`; guarded once per summary via `S._impactShown`
    (reset in startSeason).
  • **CS268 — leaderboard top-3 podium.** A podium above the ranked list (only on the default best-first
    view): #1 centred + elevated + gold, #2 left (silver), #3 right (bronze), each with medal icon + name +
    stat value + golfer. Renders for signed-in and guest views; the full ranked list continues below.
  • **CS269 — draft skill tiles as cards.** Each skill tile on the draft screen gets a colour-graded
    **strength bar** along its bottom edge (rating→colour: 90+ gold / 80+ green / 70+ blue / else grey), so
    the 8 skills of a revealed golfer read like collectible stat cards. Draft-only (off-season tiles
    unchanged). The progress pips + rarity reel already provided the rest of the "collectible" feel.
  All presentation-only, using existing data. Verified in Playwright (setup stage + sticky bar signed-in &
  guest; Season Impact unit + summary integration; podium order #1-centre with 3 medal icons + 6 rows;
  draft 8 tiles × strength bar; title/screen sweep) + screenshots; zero page errors throughout. Combined
  with CS264 (career dashboard banner + season rail) and CS265 (career milestone timeline), this covers the
  audit's top-priority items (Career Hub, Build-a-Golfer stage, results deltas, leaderboard podium). Still
  open from the audit: a full design-token/card-tier foundation applied site-wide, cream-scorecard surface
  system, and a modal/nav consistency pass.

- **CS270 — leaderboard skeleton loading rows.** Replaced the bare "Loading the global board…" line with
  8 shimmering skeleton rows (`.lbskel`/`.skb`, reduced-motion static) so the board reads as loading, not
  broken. Verified in Playwright (8 skeleton rows render while the board is loading, zero errors). Deployed.

- **CS271 — cream "physical scorecard" surface + design-foundation tokens (audit's #5 priority + Phase 1).**
  Introduced the audit's surface-level + accent tokens to `:root` (`--tour-bg-deep/-bg/-panel/-panel-raised`,
  `--tour-cream/-gold/-green-bright/-danger/-water`, `--score-birdie/-bogey`) as the design foundation, and
  applied the headline idea — **cream scorecard surfaces, gold reserved for the focal item** — to the clearest
  scorecard surfaces: the daily/Moment/Spotlight ROUND scorecard strip and the daily RESULT OUT/IN card now
  render as a warm off-white paper card (`.dcardwrap.cream`) with dark ink, hole numbers, score notation in
  scorecard-appropriate ink (`dScoreInk`: deep green under par, dark par, deep orange/red over), the current
  hole ringed gold, and the reviewed hole ringed teal. Deliberately scoped to the scorecard only (not a
  site-wide recolor) so it reads as a premium physical card against the dark-green broadcast view without
  destabilising the rest of the UI. Verified in Playwright + screenshot (cream card renders on a 9-hole
  practice round with correct ink colors + gold current-hole, zero page errors). Deployed to /golf.

- **CS272 — reverted the CS271 cream scorecard (owner: "not sure I like the cream scoreboard").** Rolled the
  daily round strip + result OUT/IN card back to the original dark scorecard styling (removed `.dcardwrap.cream`
  CSS, the `.cream` class on both surfaces, and the unused `dScoreInk`); scores use `dScoreCol` again. The
  inert design-foundation tokens added to `:root` in CS271 were left in place (no visual effect). Verified the
  dark scorecard renders with zero page errors. Deployed to /golf.

- **CS273 — off-season lock-in confirm is now INLINE on the tile (owner: "don't move users around the page").**
  The CS258 lock-in confirmation was a full-screen `.ov` popup (a new page + scrolling). Replaced it with an
  in-place confirm on the SAME skill tile: tapping a tile arms `S.offConfirm=<stat>` and that tile restyles
  in place (gold-bordered, spans the row) to show `cur → nv (▲/▼)` + "Lock in your change?" with inline
  Cancel / Lock in buttons — no overlay, no navigation, no scrolling. Cancel clears it; Lock in calls
  `offTake`. `S.offConfirm` is cleared on take / re-spin / spin so it never strands. Removed the now-unused
  `overlayConfirmSkill` + its dispatch. Verified in Playwright: tapping a tile shows the inline confirm (no
  `.ov`), the message reads "Lock in your change?", Cancel applies nothing, Lock in applies the swap
  (changes 0→1, stat locked); zero page errors. Deployed to /golf.

- **CS274 — haptics labelled Android-only + no longer suppressed by reduce-motion (owner: "I've noticed the
  haptics aren't working. Is there something on my side I must do?").** Explained the platform reality: the
  Web Vibration API (`navigator.vibrate`) is simply not implemented in iOS Safari / iOS home-screen web apps
  — nothing user-side fixes it (a genuine platform limitation, not a bug). Two changes: the ≡-menu Haptics
  toggle sub now reads "Vibration on key moments · Android only (iOS blocks web vibration)" so iOS users
  aren't left wondering; and `buzz(pattern)` no longer bails on `prefers-reduced-motion` (a vibration isn't
  screen motion, and coupling the two meant reduce-motion silently killed haptics on Android too) — it now
  gates only on the Haptics toggle (`hapticsOn()`). Verified the menu label + that buzz fires under
  reduced-motion when haptics are on. Deployed to /golf.

- **CS275 — career interview / press-conference build-out (first of the four career-depth areas: owner asked
  to build out interviews, decisions, sponsors, rivals "one by one, starting with interview" + "I want both"
  content variety AND deeper mechanics/stakes).** Turned the storyline press-conference system (CS225/226)
  from a couple of generic beats into a rich, situational interview catalog with real trade-offs.
  • **Situational context.** `storyCtx(ce)` extended with the signals a good presser needs to react to your
    actual career: `runnerUp`, `majorWin`, `lastMajor`, `firstWin`, `worldNo1`, `age`, `rookie` (year 1),
    `veteran` / `twilight` (late career), `hot` (streak), `careerWins`, alongside the existing form/rank/
    momentum flags — so the game can pick a beat that matches THIS moment (a major just won, a maiden win, a
    rookie's first mic, a #1 ascension, a cold streak, a legacy/retirement question).
  • **14 new scenarios** added to `STORYLINES`, each with a `pri` (priority) so the most situationally-relevant
    beat surfaces: major_champ (pri 4), rookie_win (4), world_no1 (4), runner_up (3), rookie_intro (3),
    veteran_legacy (2), twilight_retire (2), hot_streak (2), plus lower-priority colour beats (social_flare,
    media_critic, caddie, money_lead, appearance_fee, sponsor). `maybeStoryline` now prefers the highest-`pri`
    applicable beat instead of a flat random pick, so a major win reliably triggers the major-champion presser.
  • **Real stakes (the "deeper mechanics" half).** Each choice carries an explicit, negative-capable `ch.fol`
    follower delta so answers are genuine trade-offs (a brash clap-back at a critic goes viral for a big
    follower spike but can cost you; a humble/measured answer builds confidence but fewer followers). The
    `showStoryline` apply block honours `ch.fol` (a negative value shows "▼ N followers" and skips the default
    flat growth), and surfaces a persona-unlock note ("You're becoming {persona}") the moment a trait choice
    crosses the `STORY_PERSONA` threshold — so the interview answers visibly shape who your golfer becomes,
    on top of the CS226 Confidence + Followers stats.
  Verified in Playwright: 25 storylines, 0 duplicate ids, situational priority works (a major win surfaces
  major_champ over lower-priority beats), the follower-loss trade-off renders (▼ followers + Confidence delta),
  and the apply flow shows the reaction/persona chips; zero page errors. Deployed to /golf. NEXT of the four:
  signature-hole decisions, then sponsors (largely built in CS228/229/236), then rivals (built in CS226-era
  emergent-rivalry) — building out each for both content variety and mechanics.

- **CS276 — career Moment shot-decisions now carry real stakes (2nd of the four career-depth areas; owner:
  "in-round shot decisions" + "I want both" content variety AND deeper mechanics/stakes).** When you play a
  Sunday round in contention (a "Moment", CS144), each signature-hole Attack/Safe call is now more than that
  hole's score — it moves your career the way a real clutch (or costly) decision does, tied into the CS226
  Confidence + Followers + persona system.
  • **Stakes engine** (`momentDecisionStakes(holes, evt)` + `applyMomentStakes`): after the round, every hole
    where you actually made a call is graded on how it turned out — a bold call that pays off (birdie/eagle)
    builds Confidence + Followers (fans love aggressive golf that works); a bold call that backfires (bogey+)
    dents Confidence (fans still respect the go, so a little follower flat); a safe call executed cleanly is a
    small positive, a safe call that still leaks a shot a small negative. Closing holes (16+) weigh ×1.6 and
    the whole tally scales for a major (×1.35) / big event (×1.15); total Confidence swing clamped ±10. A
    genuinely clutch, aggressive round (≥2 bold wins, wins>fails) nudges the `clutch` identity trait toward
    the "Mr. Clutch" persona — so decisions shape who your golfer becomes, same as the CS275 interviews.
    Applied ONCE at `finishMomentRound` (before any playoff branch, so it never double-fires), gated to career
    Moments (`!circuit && S.career && S.season`); `resultMomentum` (from the final position) applies separately
    in `finalizeEvent`, so the two don't overlap. A summary toast fires at finish ("Clutch Sunday! · 2 bold
    calls paid off · Confidence ↑ +3 · ▲ 13K followers · becoming Mr. Clutch"). `toast()` gained an optional
    duration arg + wrapping/centering for the richer message.
  • **Live pressure (the decision feels weighty).** In a Moment, the decision pop-up now shows a red stakes
    line — `momentStakesLine(i)` reads the stage (a MAJOR / the title on the line, "coming home" on the last 3)
    and your LIVE standing (You lead by N / N back · TN / Tied for the lead, projected from the field's
    partially-revealed Sunday) — e.g. "🔥 A MAJOR on the line · You lead by 5 — the gallery holds its breath".
  • **Outcome feedback.** When a Moment hole holes out, the floating result pill adds a bold-call verdict —
    "The gamble pays off" (green) / "The gamble backfires" (red) / "Smart golf rewarded" / "Even the safe play
    leaked" — so you feel each decision land. Daily/Spotlight rounds are unaffected (gated on `S.moment`).
  • **More variety.** Added 3 fresh `dScenario` templates (a gettable green-light birdie pin, a spin-it-vs-
    release-it front pin, a position-vs-power 3-wood/driver tee call) — the shared library grew ~45→47 tags,
    benefiting career Moments AND the Daily.
  Deterministic (the stakes read the already-simmed hole scores; the `dSimHole` score engine + shot-count
  invariant are untouched). Verified in Playwright: the engine math (clutch major round → +3.2 conf / +6.3%+929
  followers / 2 wins-1 fail; steady → +1; none → 0), applyMomentStakes moves season Confidence 50→60 + followers
  +13.2K + clutch trait, a backfiring bold round DROPS confidence 60→52, `momentStakesLine`/`dc-stakes` render
  the pressure line with your standing, the new templates are reachable, and a full 18-hole daily still finishes
  with zero page errors. Deployed to /golf. NEXT of the four: sponsors (largely built CS228/229/236 — a
  polish/variety pass) then rivals (CS226-era emergent rivalry — deepen). Tunable: the per-decision weights +
  major/closing multipliers in `momentDecisionStakes`.

- **CS277 — sponsor variety + polish (3rd of the four career-depth areas; owner: "add variety and polish up
  the sponsors").** The sponsor system was already deep (two slots hat+shirt, tiered contracts scaling with
  following, a relationship meter, signing bonuses, 24 fictional brands with logos/personalities — CS228/229/236/242),
  so this was a variety + polish pass rather than a rebuild.
  • **Brand roster 24 → 36** (`BRANDS` + `LOGO_SPEC`): 3 more fictional brands per tier (Birchwood, Anvil Gear,
    Cypress Provisions, Falcon Athletic, Cobalt Financial, Voltaic, Emberline, Solace Resorts, Titan Tour Gear,
    Celestia, Vortex Motors, Empyrean), each with a distinct vector logo, category, colour, tagline and
    personality trait — so offers, the "sponsor comes calling" storyline, and past-sponsor history feel fresher
    and repeat less. Now 9 brands per tier.
  • **2 new goal kinds** for the middle "TARGET" goal pool (which is deterministically drawn per season+slot, so
    it varies year to year): `top5` (record N top-5 finishes — added to all three player tiers) and `cutStreak`
    (make N cuts in a row — a consistency goal for grinders). Both compute live from `S.season.results` and
    render a progress bar; wired into `goalProg`. The contract goals are now less same-y season to season.
  • **Brand Ambassador milestone (the marquee polish).** When a slot's relationship reaches max loyalty (Lv 5),
    the brand names you the face of the company: the relationship meter flips from "Loyalty Lv 5" to a gold
    "★ Brand Ambassador", the season report card shows a one-time celebration ("Max loyalty with {brand} — they've
    made you the face of the brand · ▲ N followers"), and it banks a one-time FOLLOWING bump + a career-feed note.
    Deliberately **no cash reward** — CS242 tuned sponsor income down on purpose, so the ambassador payoff is
    prestige + reach (followers feed the CS226 story system), keeping the money economy untouched. Set once in
    the settlement block (`sp.ambassador`), persisted on `S.season._ambNew` so summary re-renders keep the
    celebration.
  • **Report-card polish**: the outlook now spells out the concrete reward growth ("next year's bonuses +N%")
    when loyalty climbs (met ≥2 goals), matching the brand's relationship step, so progression is legible.
  Verified in Playwright: 36 brands (9/tier, every one has a logo + valid trait, no dups, all SVGs render); the
  new `top5`/`cutStreak` goals compute correctly and appear in generated contracts; the ambassador trigger sets
  the flag + follower boost + stored celebration and the meter shows "★ Brand Ambassador" at Lv 5 vs "Loyalty Lv
  4" below; the report card renders the ambassador banner + follower line; and a full simulated season → summary
  renders both sponsor Report Cards with zero page errors. Deployed to /golf. NEXT (last of the four): rivals —
  deepen the CS226-era emergent rivalry. Tunable: `BRANDS`/`LOGO_SPEC`, the per-tier TARGET goal pools, the
  ambassador follower bump in the settlement.

- **CS278 — rivals pass: the Grudge Match + live rivalry presence (4th and last of the four career-depth
  areas; owner: deepen rivals + build the "grudge match" idea).** The emergent-rivalry system (CS226-era)
  was purely statistical — it crowned a nemesis and tracked a season-series/career H2H, but there was no
  visceral, in-the-moment confrontation. This pass makes the rivalry felt during play. Owner picks
  (AskUserQuestion): grudge triggers **organically** (when you're both in contention), and — owner's own
  steer — the format is **your Moment round with the rival highlighted in the sim**, not a separate dueling
  screen (keeps both the tournament and the rivalry alive, reuses the CS276-deepened Moment flow, no new
  edge-case surface).
  • **Grudge Match** (`grudgeRival(ce)`): during a career Moment (you in Sunday contention at a marquee
    event), if your emergent nemesis is ALSO in the mix (top-8 or within 4 shots of you), the Moment is
    billed as a **Grudge Match**. The offer pop-up flips to a red "⚔ GRUDGE MATCH · You vs {Rival}" set piece
    ("your nemesis is right there — N behind you… settle it head-to-head"); the round header reads "⚔ GRUDGE ·
    You vs {Rival}"; and the live TOURTRACE scoreboard **pins + highlights the rival's row** (their own red
    colour, a ⚔ marker, always shown even if they slip down the board) so you track them shot-for-shot. The
    signature-hole decision pop-up's pressure line becomes rival-specific ("⚔ {Rival} is right there · you're
    N up on them — beat your rival").
  • **Grudge stakes** (in `finishMomentRound`, once, before any playoff branch): the personal head-to-head is
    graded (did you finish the event ahead of your rival?) and banks a **grudge W/L record** on the rival, a
    confidence swing (+3.5 win / −2.5 loss, on TOP of the CS276 decision stakes + the season series), a
    follower bump, a `gritty` persona nudge on a win, a career-feed note, and a combined "⚔ GRUDGE MATCH — You
    beat {Rival}!" toast. All career-only, deterministic (reads the already-simmed totals).
  • **Live rivalry presence**: the season-screen momentum strip (CS226) now carries a "⚔ vs {Rival}" chip —
    this season's running head-to-head + where the rival currently sits on the money list — so the rivalry is
    visible every event, not just at season end. The off-season "Your Rival" panel gained the lifetime grudge
    record.
  Verified in Playwright: grudge detection fires for a contending rival and correctly returns null for a
  buried one (realistic 22-player field); the pop-up + round header + scoreboard rival-row + decision line all
  render the grudge framing; `finishMomentRound` grades the H2H, banks the record (0→1), raises confidence
  (55→68.5), and writes the "Beat {Rival}…" feed note; the live chip renders the season H2H + rival standing;
  the off-season panel shows the grudge record; and a full simulated season with a rival runs to summary with
  zero page errors. Screenshot confirms the grudge pop-up. Deployed to /golf. **This completes the four
  career-depth areas** (interviews CS275 · decisions CS276 · sponsors CS277 · rivals CS278). Tunable: the
  grudge detection band (top-8 / ±4) in `grudgeRival`, the grudge confidence/follower weights in
  `finishMomentRound`.

- **CS279 — press beats can backfire + rivals woven into the press room (owner: "press beats have potential
  NEGATIVE impacts too — right now it's an automatic positive and it's really easy" + "incorporate rivals
  into press beats").** Two things: press-conference choices are now real gambles, and the rivalry shows up
  in the press room.
  • **Risk model** (`showStoryline` apply block, restructured): a choice can carry a `risk` (probability it
    backfires). Bold answers now ROLL — on a backfire the choice costs Confidence (scaled to how ambitious it
    was) AND ~5% of your following, grants NO reputation/trait/persona gain, and shows a red "It backfired"
    reaction with a specific `rBad` line + `headBad` feed entry. On success it's the intended upside as before.
    SAFE choices (no `risk`) always resolve to their upside/trade-off — so the measured answer is the reliable
    one and the swaggering answer is the high-risk/high-reward one. Each risky option is flagged with a red
    "⚡ Risky" pill so the gamble is informed, not a gotcha. 13 of the boldest choices across the catalog got
    risk (0.28–0.45): fire-back-at-rival, chase-a-dynasty, own-World-No.1, "first of many", the rookie boast,
    double-down-online, clap-back-at-a-critic, embrace-the-hype, ride-the-heater, gamble-on-new-gear,
    set-the-bar-high, and the two new rival beats. (Guaranteed trade-off choices from CS275 — e.g. "vent your
    frustration" — keep their certain downside; `risk` is the separate probabilistic layer.)
  • **Rival press beats**: `storyCtx` now exposes `rivalAhead` (nemesis above you on the money list) and your
    lifetime grudge record (`grudgeW`/`grudgeL`, from CS278). Two new storylines — **rival_ahead** ("{Rival}
    is ahead of you", with a high-risk public *guarantee* to finish ahead) and **rival_grudge** (the press
    asks about your {W}–{L} grudge-match rivalry, with a risky "I own that matchup" claim) — plus the existing
    "rival fired a shot" beat's fire-back option is now risky (it can make YOU look rattled and hand them
    bulletin-board material).
  • **Bug fix surfaced by this change**: the season-follower chip (`followersChipHTML`) showed "▲ +-10000"
    when the season delta went negative (now possible when a backfire loses followers below the season's
    starting count) — it now shows a red "▼ 10K this season" for negative deltas.
  Verified in Playwright: 27 storylines (0 dups, 13 risky choices, 3 rival beats); `storyCtx` exposes the
  rival signals; a forced backfire drops confidence + followers, grants no trait, and renders the red "It
  backfired" card with the deltas; the same choice on success grants the upside + trait; a safe choice never
  backfires even at random 0; the rival_ahead beat applies when the rival leads and renders the ⚡ Risky pill;
  and the follower chip shows ▼ for negative deltas with no "+-". Screenshot confirms the press conference
  with the risky pill and the red backfire card. Deployed to /golf. Tunable: per-choice `risk` values + the
  backfire magnitude (confidence/`folBad`) in `showStoryline`.

- **CS280 — NBA-2K-style two-axis press/reputation system (Fans ↔ Respect) with consequence cutscenes
  (owner shared 2K MyCAREER's press mechanic: Teammate/Humble → Team Chemistry vs Arrogant/Self-centered →
  Fan Support; "I want a system like this that's engaging, fun, and creates moments people will want to
  share — they can be funny too").** Reworked the press/interview system from a bag of small positives into a
  genuine two-axis reputation game with real trade-offs and shareable, funny fallout.
  • **Two axes** (`careerStory().rep = {fans, respect}`, 0-100, persisted in the career save + cloud-synced):
    **FANS** (popularity — the 2K "Fan Support" analog) is boosted by bold/brash/showman answers and drives
    follower growth + **sponsor marketability** (`repMarketMult`: ±18% sponsor money). **RESPECT** (your
    standing with peers/officials/purists — the "Team Chemistry" analog) is boosted by humble/classy/gritty
    answers and drives a **composure floor** (`repConfBaseline`: respected pros settle at a higher confidence
    baseline via `resultMomentum`'s mean-reversion target, ~36 disliked … ~64 revered) — a subtle, real sim
    benefit. NO "right" answer: almost every press choice trades one axis for the other.
  • **Choice → axis** derived from the choice's personality trait (`TRAIT_AXIS`: brash +7 fans/−5 respect,
    humble +1/+6, etc., overridable per-choice with `fansD`/`respD`), so all ~30 existing beats gained the
    mechanic without retagging. On a CS279 backfire the move flips sour (loses BOTH fans and respect). The
    press overlay's "at-stake" strip is now the live two-axis meter (Fans + Respect bars), and each answer's
    reaction shows the `Fans ▲/▼` + `Respect ▲/▼` deltas, plus a "Now: {Persona}" note when your quadrant
    flips.
  • **Persona = your quadrant** (`repPersona`): The Complete Superstar (high/high), **The Pantomime Villain**
    (high fans/low respect), The Gentleman of the Tour (low fans/high respect), The Fan Favourite, The Quiet
    Professional, Under the Radar, Rising Star. Shown on the summary, off-season, and live season strip.
  • **Consequence cutscenes (the funny, shareable moments)** — push an axis too far and someone calls you out,
    each a real fork (course-correct vs lean in): **caddie_words** (low respect — your caddie pulls you aside),
    **agent_panic** (very low respect — your agent is losing a sponsor), **villain_embrace** (high fans + low
    respect — "the tour loves to hate you", embrace the heel or start a redemption arc), **elder_shot** (low
    respect + established — a tour legend takes a public shot at you), **underexposed** (very low fans — "you
    have the personality of a driving-range mat", turn on the charm or let your golf talk), plus positive
    tributes **gentleman_tribute** (high respect) and **crossover** (high both — bigger than golf). All
    `pri:2-3` so they surface when earned, gated by the existing 2/season interruption budget + no-repeat-
    within-8-events, so they never spam.
  Career-only (never daily/circuit/headless). Verified in Playwright: the axis math (brash trades fans↑/respect↓,
  humble the reverse; all 4 quadrant personas correct), a backfire bleeds both axes, the benefits (fans→market
  1.18×/0.82×, respect→confidence baseline 64/36), `storyCtx` exposes fans/respect, all consequence beats fire
  on their thresholds, and the press overlay renders the two-axis meter + Fans/Respect deltas; a full season →
  summary renders the new "Your Reputation" card + the live momentum strip with zero page errors, and no
  dangling refs from the removed followers/confidence strip. Screenshot confirms the two-axis meter + the
  "heel turn" villain cutscene. Deployed to /golf. Tunable: `TRAIT_AXIS` deltas, `REP_START`, the market/
  composure benefit curves, consequence-beat thresholds. FOLLOW-UPS (not built): a shareable "Career Persona"
  card capturing your quadrant + funniest soundbites; sponsor-loyalty tie to respect; more consequence beats.

- **CS281 — banner stats + Fans leaderboard + hazard realism + natural chip-ins (owner batch, from a live
  screenshot).** Five requests:
  • **Cuts Made + Top 10s back on the season banner.** The CS264 franchise banner didn't show them; added a
    Top 10 and a Cuts stat cell (from `t.top10`/`t.made`).
  • **Form chip → Confidence rating.** The banner's "▲ Hot / ● Steady / ▼ Cold" Form chip is replaced by a
    **Confidence** cell showing the actual rating number, coloured by `confColor` (owner: "show confidence
    rating instead").
  • **"Fans" leaderboard category.** New sort on both the Single-Season and Career boards ranking by follower
    count. Since followers isn't derivable from a row's stored skills, it needs the value in the row:
    `supabase/48_runtour_fans.sql` (owner-run) adds a `followers` column, threads an optional `p_followers`
    through both submit RPCs (clamped ≤2B), and adds a `'fans'` sort + `followers` return to both board RPCs —
    all backward compatible (new trailing defaulted args, so old callers still resolve). The client sends
    `careerStory().followers` with each season and, **deploy-safe**, tries the submit WITH `p_followers` first
    and falls back WITHOUT on error, so deploying before the migration never strands a season; the board
    gracefully shows "0 fans" in earnings order until the migration lands. `lbStatVal` renders "{N} fans"
    (orange). **ACTION: run `supabase/48_runtour_fans.sql`.** Validated end-to-end against a local Postgres
    (new + old-style submit, fans board ranking, guest path, career max-followers, idempotent).
  • **Realistic fairway hazards (owner: the pond sat at ~half the driving distance and swallowed the drive).**
    Three `hvGeom`/`hvPlots` fixes: (1) a crossing **creek** no longer spawns in the tee-shot landing zone
    (0.25–0.68 of the hole) — it's now a **short forced carry** off the tee (13–20%) or a **green-front**
    hazard (74–88%); (2) a seeded **lateral pond** is offset fully past the fairway edge (center = half-width
    + radius + margin) so its inner edge clears the fairway instead of sitting in the middle of it; (3) the
    **invented pond** created when an errant ball drowns (a hole with no spec'd water) is now placed as a
    LATERAL hazard beside the fairway, not dead-centre at the landing zone — so it reads as "pushed it into
    the lateral water," never "the fairway forced me in." Verified across all 39 courses × 18 holes: **0**
    creeks in the landing zone, **0** mid-hole ponds overlapping the fairway.
  • **Natural chip-ins (owner: "the shot before chip-ins is almost always a really bad shot that goes
    sideways… predictable and unnatural").** When a one-putt finish converts to a holed chip/pitch, the setup
    shot is no longer rewritten as a lateral spray (`into the right/left rough`) — it's now a natural
    just-short-of-the-green position (front collar / short rough / fringe, weighted to the front), with an
    occasional greenside bunker on a chip. Verified: over 58 hole-outs, **0** lateral-spray setups.
  All presentation/geometry/UI (the deterministic `dSimHole` score engine is untouched). Verified in
  Playwright (banner cells, Fans sort + value + resilient submit fallback, hazard placement across 39
  courses, chip-in setup naturalness), zero page errors. Deployed to /golf. Tunable: the creek forced-carry
  vs green-front bands + pond lateral offset in `hvGeom`, the chip-in setup lie pool in `dShotSeq`.

- **CS282 — hole-outs happen anywhere, naturally (no scripted trigger position) (owner: "I don't want there
  to be any specific position that triggers a chip in or hole out, it has to feel natural! It can happen
  anywhere at any time").** CS281 made the chip-in SETUP natural (just short of the green) but the mechanism
  was still a POST-PROCESS that detected a normal one-putt finish (approach lands ON the green → tap-in) and
  rewrote the last two shots into a fixed "just short of the green front" setup + hole-out — so a hole-out
  always came from the same scripted greenside position. Rebuilt it so the hole-out is decided UP FRONT and
  the ball simply comes to rest wherever a normal missed-green shot would, with the finishing stroke holing
  from there. All in `dShotSeq` (the shot NARRATIVE + hole-view geometry); the deterministic `dSimHole` score
  engine is untouched, and the hard shot-count===stroke-count invariant is preserved.
  • **Decision up front.** A new `holeOut` constant (`par!==3 && P===1 && greenReach>=2`, ~2.3–5% of eligible
    one-putt holes, skill-weighted by short game / scrambling / approach) is rolled once per hole. `greenReach>=2`
    keeps it entirely within the last-long-shot branch (the tee shot is never the green-reaching shot), so
    there's no fragile second interception. Par-3s are excluded (their hole-outs are aces, handled separately).
  • **The last approach comes up just off the green NATURALLY.** When `holeOut`, the last long shot is treated
    like any ordinary missed green: a varied, skill-and-distance-scaled miss lie drawn from the SAME natural
    pool as CS162's miss dispersion (just off the fringe / front collar / a step off / through the back /
    pin-high off the right or left edge / or, for weaker builds or long approaches, a greenside bunker / rough /
    long over) at a varied distance (5–27 yds). No "just short of the green" scripting — the ball is wherever it
    finished.
  • **The finish holes from there.** Instead of a putt, one holing stroke drops from that natural position — a
    chip, a pitch (>30 yds), or a holed bunker shot (from sand), narrated "chips it in from N yds!" / "pitches
    it in!" / "holes the bunker shot!" and driven by the relevant short-game skill (Bunker for sand, Short Game
    for fringe/collar chips, Scrambling+Short Game for rough). Count-consistent: greenReach shots to a greenside
    spot + 1 holing stroke = the same total as reach-green + 1 putt, so the score is unchanged.
  • **Removed the old CS281/CS154 post-process block** that rewrote a green-arrival one-putt into a fixed
    greenside setup — that was the "specific position that triggers it" the owner objected to.
  Verified in Playwright: the shot-count===stroke-count invariant across **36,960 par/score/skill/seed combos,
  0 mismatches** (all decision/teePreset paths); **354 hole-outs** came from **6 distinct natural setup lies**
  (fringe 126 / front collar 87 / long-over 43 / greenside bunker 43 / left-rough 29 / right-rough 26 — no
  single dominant scripted position) at 5–27 yds across 23 distinct distances; sample narratives read naturally
  and vary ("9-iron just off the fringe → chips it in from 10 yds", "PW into the greenside bunker → holes the
  bunker shot from 13 yds", "sand wedge pin-high off the right edge → chips it in from 14 yds"); a full
  auto-played practice round rendered many holes via hvNode with 0 page errors, and 8 constructed hole-out
  sequences (par 4/5, fringe/collar/bunker setups) each render a valid SVG through `hvNode` with 0 errors.
  Deployed to /golf. Tunable: the hole-out probability (`0.05*(0.45+...)`) + the miss-lie pool in `dShotSeq`.

- **CS283 — fairway hole-outs (holed approaches for eagle) + verified natural aces (owner: "Are fairway
  hole outs and hole in ones possible as well? They should also feel natural").** Audited the two:
  • **Hole-in-ones already work** (CS154) — the score engine (`dSimHole`) caps at −2, and on a par-3 a rare
    would-be −2 (a 1) becomes a genuine ace ~12% of the time (~0.04% overall, seeded/deterministic),
    rendered as "7-iron from the tee, and it's a hole-in-one!". Confirmed the narration + hole-view render.
    (Aces are par-3-only, which is realistic — par-4 aces are freak events; the −2 score cap means no
    albatrosses either, so the only par-4/5 "hole-out score" is an eagle.)
  • **Fairway hole-outs (the gap):** a par-4 eagle was ALWAYS narrated as "drove the green + made the putt"
    — fine on a driveable 310-yd hole, but unrealistic on a 460-yd one (you can't reach that green off the
    tee). A real long-par-4 eagle is a **holed approach from the fairway**, which only happened on
    preset-drive eagles. New `dShotSeq` up-front decision (CS283): for an eagle (`toPar===-2`) on a par-4/5,
    a **long par-4** (≥335 yds) always becomes a holed approach (P=0 → the existing P===0 hole-out
    conversion holes the last full shot: "Driver to the fairway, 153 to hole → 8-iron from 153 yds, and it
    drops for eagle"); a **driveable par-4** (<335) stays mostly drive-the-green with ~35% holed approaches
    for variety; a **par-5 eagle** is usually reach-in-two + putt but ~16% (skill-weighted on Approach)
    becomes a holed wedge third ("Driver → 5-iron layup → Lob wedge from 30 yds, and it drops for eagle").
    No scripted position — the ball is holed from wherever the approach is played, and the count stays exact
    (greenReach shots, the last one holes, no putt). Deterministic; the `dSimHole` score engine is untouched.
  Verified in Playwright: shot-count===stroke-count across **38,220 combos, 0 mismatches**; a long par-4
  eagle is a holed approach **600/600** times (0 drive-the-green), a driveable par-4 eagle mixes
  drive-green (398) + holed approach (202), a par-5 eagle holes the wedge ~17%; the ace narration renders;
  and a long par-4 eagle, a par-5 holed wedge, and a par-3 ace each render a valid SVG through `hvNode`
  with 0 page errors. Deployed to /golf. Tunable: the par-4 driveable threshold (335 yds) + the par-4/par-5
  fairway-hole-out probabilities in `dShotSeq`.

- **CS284 — season banner: Cuts shown as a ratio + Net counts up/down instead of snapping (owner, from a
  live screenshot).** Two tweaks to the CS264 franchise banner (`scrSeason`):
  • **Cuts → "made/played".** The Cuts cell showed a bare number ("5"); now it reads `t.made/t.played`
    (e.g. "15/17" — cuts made out of tournaments played so far), matching the CS281 season-summary strip
    convention.
  • **Net counts up/down.** The Net figure used to snap to its new value each event. It now tweens
    (ease-out, ~950ms) from the previously-shown value to the new one via the existing `_animCount` helper —
    fires only when the net actually changed (right after an event finalizes), skips the season's very first
    render (a new `S._bannerNet` baseline, reset in `startSeason` so year N+1 doesn't animate from year N's
    net), and respects reduced-motion. Verified in Playwright: the Cuts cell renders "12/16", and after an
    event the Net text animated +$343k → +$618k → +$1.1M over the tween window (start ≠ settled); a
    phone-width banner screenshot confirms the wider Cuts cell fits cleanly; zero page errors.

- **CS285 — season banner: smooth-scrolling schedule rail + Confidence/Respect horizontal meters (owner,
  from the same banner screenshot).** Two more banner tweaks:
  • **Rail glides instead of jumping.** The season event rail (`seasonRailNode`) hard-set `scrollLeft` to
    centre the current event on every render — jumpy and hard to follow as the schedule progressed. Now it
    tracks the last-centred event index (`S._railIdx`) + scroll position (`S._railScroll`): on a same-event
    re-render (the many mid-round redraws) it snaps to centre instantly (clean, no jitter), but when the
    schedule ADVANCES event-to-event it starts from the previous position and `scrollTo({behavior:'smooth'})`
    glides to the new centre. Reduced-motion snaps. Reset in `startSeason` so a new season centres instantly
    (no glide from the prior season's schedule offsets). Verified: on advance, scrollLeft started at the old
    target (370) and settled at the new one (473) — a real scroll animation, not a jump.
  • **Confidence → horizontal meter + Respect meter.** Since Confidence had wrapped to its own banner row as
    a bare number, replaced it with a horizontal **Confidence** meter (`confMeterHTML`) and added a **Respect**
    meter (`respMeterHTML`, new helper mirroring the two-axis reputation colour) stacked below it, in a
    full-width `.cb-meters` block under the stat cells (career-only — the reputation system is off in
    daily/circuit). The Confidence stat cell was removed from the top row (now World/Tour/Net/Wins/Top 10/
    Cuts, fits one row cleaner). Both meter bars GLIDE to their new width when they change (reusing the
    `.cmeter` width transition), matching the CS284 net count-up feel; snap on the first render + reduced-
    motion (baselines reset in `startSeason`). Verified in Playwright (Confidence absent from `.cb-stats`,
    `.cb-meters` shows Confidence + Respect, rail glides) + a phone-width screenshot; zero page errors.

- **CS286 — shortened money shows 2 decimal places GLOBALLY (owner).** Changed the shared `fmtShort`
  helper itself so every shortened M/B figure across the whole game shows 2 decimals ($1.23M, $5.00M,
  $12.35M, $1.23B) instead of 1 ($2.4M) — banner Net, season-summary money card, report cards, sponsor
  offers/signing bonuses, Season Impact card, career/net-worth stats, etc. (k and below unchanged: integer
  k / whole dollars). (First shipped as a banner-local `netFmt2`; owner then asked for it everywhere, so
  the logic moved into `fmtShort` and the local helper was removed.) Verified fmtShort samples (2.431M→
  $2.43M, 5M→$5.00M, 12.35M, 1.23B, negatives, k) + the banner count-up settling on the precise 2-decimal
  value; zero page errors.

- **CS287 — fix clipped golfer name on the Continue Career card + How to Play replaces the title badge
  (owner, from a screenshot).** Two title-screen tweaks:
  • **Name no longer clipped.** The `.rc-name` on the resume/continue-career card had `overflow:hidden`
    with no right padding, so the italic display font's rightward overhang clipped the last glyph (e.g. the
    "y" in "Coby Selly"). Added `padding-right:6px` (same fix `.gc-title` already uses) so the overhang has
    room within the clip region; a genuinely too-long name still ellipsis-truncates.
  • **How to Play button in the badge spot.** Removed the "⛳ 30-Year Career Simulation" pill under the hero
    and put a gold **📖 How to Play** pill-button (`.howtop`, opens the rules screen) in that spot; removed
    the now-duplicate How to Play tile from the bottom nav grid (which is now Leaderboard / Trophy Room /
    Pro Shop). Verified in Playwright (badge gone, exactly one How to Play button = the `.howtop`, nav no
    longer lists it, `.rc-name` renders "Coby Selly" in full) + screenshots; zero page errors.

- **CS288 — Moment popup: "Continue simulation" + bonus coins for playing (owner, from a screenshot).**
  On the career "Moment" popup (play-the-final-round vs sim), the owner disliked "Watch the sim" and wanted
  playing to be rewarded with coins + the sim option to state the forfeit. Changes:
  • **Playing earns bonus coins.** New `momentPlayCoins(evt)` (regular 120 / big·playoff·finale 200 / major
    300) awarded via a new `addBonusCoins(n)` when you FINISH a played Moment round (`finishMomentRound`,
    guarded once via `ce._momentCoined`, signed-in only). Coins are a real, separate `bonus` accumulator on
    `coinState` added into `coinsEarned()` (kept out of the derived `coinsEarnedRaw()` to avoid the
    reset-baseline loop), merged grow-only cross-device (`mergeCoins` bonus:max) and zeroed on an epoch
    reset. The "+N coins" is folded into the existing moment-finish toast (grudge / stakes / a "Round
    complete" fallback) so it never collides with a second toast.
  • **Copy.** The sim button "Watch the sim ▸" → **"Continue simulation ▸"** with a sub "Skip playing —
    you'll forfeit the +N bonus coins"; the Play button sub now shows "· +N coins" so the incentive is
    explicit. (Guests — not signed in — see the original coin-free copy and earn nothing, since career mode
    requires an account anyway.)
  Verified in Playwright: `addBonusCoins(200)` raises the balance by 200; `momentPlayCoins` = 120/300/200
  for regular/major/big; the popup buttons render the new "Continue simulation" + forfeit copy and the
  "+120 coins" incentive; a screenshot confirms it; zero page errors. Tunable: `momentPlayCoins` amounts.

- **CS289 — Grudge Match scoreboard: rival is just a red-highlighted row (owner disliked the ⚔ marker).**
  On the live Moment/Grudge scoreboard the rival's row had a `⚔ ` prefix on the name (which emojified to a
  swords SVG that rendered as a busy block over the name). Removed the marker — the rival row already gets a
  distinct **red** highlight (red dot `#ff5a4d` + `.hvbrow.rival` red row background/border), exactly
  parallel to how YOU is gold (`.hvbrow.mine`). So the opponent is now cleanly distinguished by colour, like
  the user's gold, with no extra icon clutter. Verified in Playwright (no swords SVG in the board, rival row
  keeps its red highlight, name renders clean) + a screenshot; zero page errors.

- **CS290 — Challenges made visible (nav tile + sign-in pop-up) + 42 new achievements across every mode/
  feature; Tour Rep tiers auto-rescaled (owner: "I don't see where the daily/weekly quests are... make
  them more apparent + a sign-in pop-up. Create more achievements covering everything, move the tier
  goalposts, make sure each user is in their proper tier").**
  • **Quests visibility.** The daily-quests + weekly-challenges + Player-Level panel (`challengesNode`, CS261)
    was buried in the ≡ menu. Now: (1) a prominent **🎯 Challenges** tile in the title-screen nav row (next to
    Leaderboard / Trophy Room / Pro Shop), showing your level; (2) a once-a-day **sign-in pop-up**
    (`maybeChallengesPopup`, gated per-account-day via `bag_chalpop_day`, fires ~260ms after a signed-in title
    render) that greets you with your Level bar + Daily Quests + Weekly Challenges and how many are left today.
  • **+42 achievements → 331 total (was 289), 20 categories (added "Progression", "Reputation & Sponsors",
    "The Moment").** Covers the previously-untracked systems: **Progression** — Player Level (5/10/25/50/100),
    coins earned (5k→5M), Pro Shop cosmetics owned, mulli-spins, Daily-Quest days (1/10/50/150), Weekly
    Challenges (5/25/75); **Reputation & Sponsors** — Fans 60/78, Respect 60/78, The Complete Superstar,
    Brand Ambassador ×1/×5, Double Deal (both sponsor slots); **The Moment** — play 1/10/25 career Moments,
    win 1/5/15 Grudge Matches; **Daily Mastery / Course Passport** — conquer 5/15/39 courses, A-grade 5/15
    courses. New live-computed metrics (playerLevel, cosmeticsOwned, mulliEarned, coursesConquered/MasteredA)
    + flag captures (`questDaysDone`/`weeklyDone` in questDaily/questWeekly, `momentsPlayed`/`momentGrudgeWins`
    in finishMomentRound, `maxFans`/`maxRespect`/`repComplete`/`bothSponsors` in evaluateAch from the live
    career, `brandAmbassadors` at the sponsor-ambassador trigger). The coin achievements read `coinsEarnedRaw()`
    directly in their `get()` (NOT via metrics) because `coinsEarnedRaw()` calls `achMetrics()` — putting coins
    in achMetrics caused infinite recursion (found + fixed during testing; `cosmeticsOwned` reads the raw
    `bag_coins` store for the same reason, since `coinState()` can call `coinsEarnedRaw()` on an epoch reset).
  • **Tier goalposts + user recompute.** `REP_TIERS` thresholds are % of `ACH_TOTAL_PTS`, so adding
    achievements automatically raises every goalpost; `evaluateAch()` recomputes each user's rank live from
    their current points (and retroactively credits the new achievements they already qualify for on the next
    Trophy Room open / gameplay), so everyone lands in their correct new tier with no migration. No false
    "demotion" fanfare (the promotion card only fires on a rank INCREASE).
  Verified in Playwright: catalog integrity (331 ach / 33,890 pts / 20 cats / 0 dup ids / all get()/goal/pts
  valid); no recursion (coinsEarnedRaw + achMetrics run clean); all new captures unlock their achievements
  (11/11 fresh); a strong existing account (35% of total pts) resolves to a sensible "Star" tier (not GOAT,
  not Amateur); the Challenges nav tile + sign-in pop-up render (screenshot) and the Trophy Room shows the 3
  new categories; a full practice daily round + title/trophy render with zero page errors. Tunable: the new
  achievement goals/points, the popup cadence.

- **CS291 — press-conference bug fix + authentic fan tweets / headlines / opponent quotes + one more
  presser per season (owner, from a screenshot: "What's going on here [a choice showing raw JS] · add one
  more of these per season here and there · add real quotes from fans, opponents, or the golfer so it feels
  authentic — more like tweets and headlines people relate to").**
  1. **The bug (IMG_8090).** The "David Puig rivalry" press conference showed a choice as raw source —
     `c=>c.grudgeW>c.grudgeL?'"I OWN THAT MATCHUP"':...` — because the `rival_grudge` beat's choice `t` (and
     `s`) are FUNCTIONS of ctx, but `showStoryline` rendered them with `esc(ch.t)`, which serializes the
     function source instead of calling it. Fixed by evaluating through the existing `T=(v)=>typeof
     v==='function'?v(ctx):v` helper: `esc(T(ch.t))` / `esc(T(ch.s))` on the button, and the two `track()`
     calls now log `String(T(ch.t))` instead of the raw function. (Verified: the grudge choice now renders
     "I OWN THAT MATCHUP" — correctly picked because grudgeW 2 > grudgeL 1 — with no `=>`/`grudgeW` source
     anywhere.)
  2. **The reaction feed (`pressBuzz`/`pressBuzzHTML`).** After you answer a presser, the WORLD now reacts:
     2 fan tweets (avatar + handle + time + like/retweet counts), a newspaper-style headline card, and an
     occasional (~45%) opponent quote. Tone-matched to the choice via `pbTone`: **bold** (brash/showman/
     fanFav), **humble**, **gritty** (gritty/confident/clutch), **bad** (a CS279 backfire), or **neutral** —
     each with its own tweet/headline/opponent-quote pools (`PB_TONES`), parameterized with the golfer name
     (`dShort`), the rival (`ctx.rivalName` or a fictional name), the event (`ctx.upName`), and the choice
     quote. Uses only NON-theme-mapped emoji (😤💀🥶😬👀🤝😭🫡💪🙌) so nothing renders as an SVG icon
     mid-tweet. Fictional handles/outlets/names (`PB_HANDLES`/`PB_OUTLETS`/`PB_NAMES`) so it reads authentic
     without impersonating anyone. Wired into the press overlay's reply box between the reaction scout and the
     Continue button (try/catch so it can never break the presser). New `.pbuzz`/`.pb-tweet`/`.pb-hl`/etc CSS
     (Twitter-style rows + a gold-accent headline card).
  3. **Frequency** ("one more per season here and there"): `STORY_PER_SEASON` 2→3 and the shared interruption
     budget `SEASON_STOP_BUDGET` 4→5, so pressers surface a bit more often without exceeding a casual-friendly
     cap.
  Verified in Playwright (cs291): the constants (3/5); the grudge choice renders evaluated text with no raw
  source leak; the buzz feed renders 2 tweets + a headline (+ backfire-tone buzz on the CS279 backfire path);
  zero page errors; screenshot confirms the press conference with the "The reaction · online & in print" feed
  (fan tweets + a headline card). Deployed to /golf. Tunable: the `PB_TONES` content pools, the opponent-quote
  probability (0.45), `STORY_PER_SEASON`/`SEASON_STOP_BUDGET`.

- **CS292 — off-season: show which stats are LOCKED on the "Your golfer" scorecard (owner IMG_8091: "I
  want the user to know which stats are locked before they choose if they want to use their next spin. Make
  it clean").** The once-per-off-season stat lock (CS130) was only visible AFTER you spun (the skill tiles
  greyed out a locked stat), so before deciding whether to spend a spin you couldn't tell which of your 8
  stats a swap could still land on. Now the off-season "Your golfer" scorecard (`scrOffseason`, the
  current-bag list under the avatar) flags every stat already changed this off-season: a clean gold "🔒
  LOCKED" pill next to the golfer name + a subtle gold tint on the row (`.slot.locked`/`.slotlock`), plus a
  one-line gold hint under the heading ("🔒 Locked stats have already been changed this off-season and can't
  change again — a spin can only land on your open stats") shown only when at least one stat is locked.
  Reads directly off the existing `S.offseason.locked` array, so it stays in sync with the spin-screen lock
  and the resume snapshot. Verified in Playwright (a state with SCR + BNK locked → exactly those 2 rows get
  the locked class + badge, the hint renders, zero page errors) + a screenshot. Deployed to /golf.

- **CS293 — new daily quest: "Share a result" (owner: "add a daily quest that says share a result to a
  friend or social media").** Added a 4th daily quest (`DAILY_QUEST_DEFS`) — "Share a result · Friend or
  social" (key `share`) — credited via `questDaily('share')` from every share funnel: the text funnel
  (`shareText` — daily result, season, major win, career/circuit end) and the image funnel (`shareCard`),
  plus the TOURTRACE shot-share (`hvGifShare` GIF + `hvShareShot` PNG). Guests never accrue (questDaily
  early-returns when not signed in, same as the other quests). Since it's now 4 quests, the all-done XP
  bonus (+120) requires all 4, and the count-based UI text updated from the hardcoded "3" to
  `DAILY_QUEST_DEFS.length` (challenges panel header "all 4 → +120 XP" + the daily-result "All 4 done
  today" banner; the sign-in popup's "N daily quests left" was already dynamic). Default quest shape +
  `mergeDailyQuests` (cloud sync) extended with the `share` field so it syncs cross-device grow-only.
  Verified in Playwright (cs293): 4 quests incl. share; a signed-in share credits the quest (0→1) via
  shareText while a guest stays 0; all 4 done → +120 XP once (xpDone=1); the panel renders the "Share a
  result" row + "all 4" header; zero page errors. Screenshot confirms the 4-row panel. Deployed to /golf.

- **CS294 — Challenges UI: completed quests turn green + the separate Player Level is merged into Tour Rep
  (owner: "completed quests should turn green; there shouldn't be a separate level system, it should feed
  into your tier").**
  1. **Green completed rows.** A finished daily quest / weekly challenge row now turns the WHOLE row green
     (label + ✓ + value + hint) via a new `.wg-row.done` rule, so "done" reads at a glance (was only the
     right-side "done"/count in green).
  2. **No more separate Level — challenges feed your Tour Rep tier.** The Player Level (XP) system is gone
     from the UI. Completing quests/challenges still grants the same amounts (120/250) but they're now
     **Tour Rep points**: `achPoints()` = achievement points + `challengeRepPts()` (the `bag_xp` store,
     summed only at read so the two pools never corrupt each other at rest). So doing quests climbs your
     Tour Rep tier directly. The Challenges panel's purple "Level N / XP" bar is replaced by a gold **Tour
     Rep tier bar** (`repTierBarHTML`: rank name · total rep · progress to the next rank + mulli-spins), and
     every "XP"/"Level" label across the panel, menu row, title tile, overlay copy, sign-in popup, and the
     daily-result completion banners now reads "Tour Rep". `addXp` detects a challenge-driven rank-up and
     surfaces it through the existing `S.freshRep` pipeline (summary card + achToast) with a "+N Tour Rep"
     toast + celebration.
     - **GOAT stays 100%-gated:** `repTierFor` now only awards G.O.A.T. on full achievement completion
       (count-based), so challenge points can lift you as high as Icon but the summit still needs every
       achievement. `evaluateAch`'s rank-up detection uses the combined total so it's consistent with the
       displayed tier.
     - **Coins unchanged:** the internal `xpForLevel`/`playerLevel`/`levelCoinTotal` curve is KEPT purely as
       the Pro Shop coin payout (never surfaced as a "level"), so the coin economy is byte-for-byte the same.
     - **Achievements:** the 5 "Reach Player Level N" achievements are converted to "Earn N Tour Rep from
       challenges" (`chalrep_*`, get=`m.challengePts`, same point values → `ACH_TOTAL_PTS` unchanged, so no
       tier rescale). New `challengePts` metric in `achMetrics`.
  Retroactive + safe: a signed-in player's existing quest XP now counts as Tour Rep (a positive one-time
  bump), coins are untouched, and everything cloud-syncs as before (bag_xp still in the bundle). Verified in
  Playwright (cs294): challenge points feed achPoints and climb the tier (Rookie→Journeyman); GOAT stays
  gated (83,890 pts / 0 achievements → Icon, not GOAT); addXp grants rep + detects a rank-up + sets freshRep;
  the 5 chalrep achievements exist, 0 old lvl achievements, ACH total unchanged (331 / 33,890 pts); coins
  still derive from the internal level curve; the panel shows the tier bar (no level bar), 1 green done row,
  "Tour Rep" not "XP"; guest title + a full practice daily round regress clean with zero page errors.
  Screenshot confirms the gold tier bar + green completed quest. Deployed to /golf. Tunable: `DAILY_QUEST_XP`/
  `WEEKLY_CHAL_XP` (now rep amounts), the `chalrep` thresholds.

- **CS295 — Moments rebalanced to REALLY big occasions + at least one interview/decision guaranteed every
  season (owner: "I went through a season with 0 interview or decision pop-ups and a ton of moment pop-ups...
  limit moments to really big moments, there are too many grudge matches, the threshold is too large... and
  there shouldn't be a full season without at least one [decision] coming up").** Diagnosis: the shared
  interruption budget let Moments (which triggered on ANY major/signature/playoff event within 4-5 of the
  lead, up to 3/season, and billed a grudge match whenever the rival was merely top-8) consume the season
  while storylines were gated behind a flat `Math.random()>0.6` + budget + event-gap, so a season could
  easily produce 3 grudge moments and 0 interviews. Fixes:
  1. **Moments = only the biggest, only in real contention.** `momentInfo` now fires ONLY for a **major or
     the Tour Championship finale** (was major/signature/playoff), and only when you're **top-3 AND within 2
     shots** of the lead (`MOMENT_MAJOR` gap 4→2 / pos 5→3). Cap dropped to **2/season** (`MOMENT_PER_SEASON`
     3→2). So a Moment is now a genuine "I'm in the hunt on Sunday at a major" set piece, not a routine
     interruption.
  3. **Far fewer grudge matches.** `grudgeRival` now bills a grudge only when the nemesis is **top-5 AND
     within 3 shots** of you (was top-8 OR within 4 — nearly always true), and the scheduler caps it to **one
     grudge per season** (`S.season.grudgeShown`); a later contended Moment stays a normal Moment. Reset in
     startSeason + carried in the mid-season save.
  2. **A guaranteed interview/decision every season.** `maybeStoryline` now GUARANTEES the season's first
     storyline: once you're ~40% through the schedule with none fired yet, it bypasses the random roll, the
     event-gap, AND the interruption budget, and falls back to an always-applicable beat (fan/home/gear,
     ignoring cooldown) if no situational one fits — so no career year passes without at least one press
     conference / sponsor / fan / life decision. The 2nd/3rd of the season stay occasional (the existing
     random+budget+gap logic). The catalog already spans the owner's examples (sponsor decisions, fan-tweet
     replies, reporter interviews pre/post-major, life/legacy, rivalry) — they just needed to actually fire.
  Verified in Playwright (cs295): a contended major fires a Moment while a far major / signature / non-finale
  playoff do not; the finale in contention fires; grudge only when the rival is top-5 & within 3; the season's
  first storyline fires past 40% despite a spent budget + gap while a 2nd is correctly gated and early-season
  stays normal; the CS291 press-conference render regression is clean; zero page errors. Tunable:
  `MOMENT_MAJOR` (gap/pos), `MOMENT_PER_SEASON`, the grudge contention band + per-season cap, the 40%
  guarantee threshold. Deployed to /golf.

- **CS296 — Team Cup controls pinned to the bottom of the screen on mobile (owner: "pin the control buttons
  to the bottom of the screen on mobile so it's not constantly scrolling the entire screen").** On the
  Ryder/Presidents Cup (Atlantic/Nations Cup) screen (`scrTeamCup`), the Next Match / Auto Sim / Skip to
  Result controls sat in-flow at the very bottom, so with up to 28 match rows revealing you had to scroll
  the whole list to reach them. Wrapped the controls in a `.cupctrl` container that on mobile
  (`@media max-width:700px`) is `position:sticky; bottom:0` with an opaque page-matching background + top
  border/shadow + safe-area bottom padding — mirroring the existing sticky-TOP scoreboard (`.cupsticky`,
  CS67) — so the controls stay pinned at the bottom of the viewport while the session cards scroll behind
  them. Desktop keeps them in-flow (the media query only kicks in on phones). Pure layout — the buttons and
  their handlers are unchanged (just a wrapper-class swap). Verified in Playwright at a phone viewport: the
  `.cupctrl` computes `position:sticky; bottom:0` and stays pinned to the viewport bottom even scrolled to
  the top of a long list, while at desktop width it's in-flow (scrolls off with the page); zero page errors.
  Screenshot confirms the controls pinned at the bottom with the cards scrolling above. Deployed to /golf.
  (The main season screen's controls already sit right under the live tournament per CS241, so they weren't
  part of this — only the long-scroll team-cup screen the owner flagged.)

- **CS297 — putting realism pt3: no missed 1-footers, 2-putts don't leave it to 1 foot (owner: "I see
  players missing 1 foot putts... if you're going to have a player 2-putt, do not have them hit it to 1
  foot").** Root cause: the number of putts (`P`) was decoupled from the first-putt distance (`ftToHole`),
  so a hole could narrate a "2-putt from 6 ft" or a "3-putt from 8 ft" whose intermediate leave landed at
  ~1 ft — reading as a pro missing a short putt (which essentially never happens on tour). Two fixes in
  `dShotSeq` (NARRATION + hole-view distances only — the deterministic `dSimHole` score is untouched, and
  the hard shot-count===stroke-count invariant is preserved):
  1. **A 2+ putt must ORIGINATE from a realistic lag distance.** If the ball finished close but the score
     needs 2+ putts, the approach actually finished farther out — so `ftToHole` is floored (2-putt ≥14 ft,
     3-putt ≥28 ft) and the green-arrival shot is SYNCED (its "X ft to hole" text + the tracer rest spot),
     so you never see a 2-putt/3-putt from a few feet.
  2. **The comebacker is a genuine short putt, never a ~1-footer.** The made second putt / comebacker now
     leaves ~1.6–3 ft (a real, separate stroke), capped at 70% of the current distance so it always makes
     progress — instead of the old ~0.5–1 ft "should've dropped" tap-in.
  Verified in Playwright over 6,480 par/score/skill/seed combos: **0** shot-count mismatches, **0** putt
  leaves under 1.5 ft, **0** two-putts originating under 12 ft, **0** backwards putts; sample narratives read
  true ("Lob wedge to center green, 17 ft to hole / Putt 17 ft, 2 ft 6 in. to hole / In the hole" — a clean
  2-putt leaving a real ~2-footer, made). A full practice round still renders the tracer with zero page
  errors. Tunable: the `minLag` floors (14/28 ft) and the comebacker leave band. Deployed to /golf.

- **CS298 — team-cup control bar: fixed pin that actually stays put (fixes CS296's "moves to the middle").**
  CS296 used `position:sticky; bottom:0` on the controls, but as the last child of `.screen` the sticky bar
  (a) OVERLAPPED and hid the match cards behind it (opaque background) and (b) released mid-scroll to its
  natural position — the owner saw it "move to the middle" with cards showing below it. Replaced sticky with
  a true **`position:fixed; bottom:0`** bar on mobile so it's glued to the viewport bottom at ALL scroll
  positions, and RESERVED space so it never covers content: a `has-cupbar` class is added to `#app` during
  the team-cup match-reveal phase (cleared at the top of every `render()`), giving `#app` a bottom padding
  equal to the bar height so the last match card + the global footer scroll cleanly ABOVE the bar. Verified
  no ancestor (`.card`/`.screen`/`#app`) has a `transform`/`filter` that would break `position:fixed`.
  Verified in Playwright against the real DOM structure (`#app > .card>.screen[cards + .cupctrl] + footer`,
  `#app.has-cupbar`): the bar is `fixed` and pinned to the viewport bottom at top / mid-scroll / bottom
  (rectBottom === viewport height everywhere), the footer and the last card both clear the bar (not covered),
  and desktop keeps the controls in-flow (position static). Screenshot confirms the bar pinned at the bottom
  with a clean gap above it while cards scroll behind. Deployed to /golf. Tunable: the `168px` reserve height.

- **CS299 — selection-announcement pop-up now stays pinned to the bottom (iOS fixed-positioning fix).**
  Owner (screenshot of the "Tour Cup Playoffs · Selection — You made it to East Lake!" card mid-screen over
  the leaderboard): "The same thing was happening with other footer pop ups when scrolling. It should stay
  pinned on the bottom." Root cause: `selectionPopup` was a `position:fixed; bottom` element that used
  `animation:celebRise` (a keyframe animation involving `transform`). On iOS Safari/PWA a `position:fixed`
  element with a running CSS transform animation gets positioned relative to the DOCUMENT instead of the
  viewport — so, created while the page was scrolled, it stuck to a document position and drifted to the
  middle as you scrolled. (Regular `toast()`s never had this because they use no keyframe animation.) Fixed
  by mirroring the proven `toast()` pattern exactly: `position:fixed; left:50%; bottom:calc(22px + safe-area);
  transform:translateX(-50%)` (a STATIC transform, fine) with an **opacity-only** fade (no transform
  keyframe). Audited every other fixed-bottom element — `toast()`, the auth-pending pill, and `.scrollcue`
  all already use static transforms (the scrollcue's bob animation is on a child, not the fixed element) —
  so `selectionPopup` was the only offender. Verified in Playwright: the pop-up is `position:fixed` with no
  transform animation, pinned to the viewport bottom, and STAYS pinned after scrolling (rectBottom unchanged
  at scroll 0 and 500); zero page errors. Deployed to /golf.

- **CS300 — team-cup: hide the clashing footer pills on mobile + auto-scroll the match results (owner
  IMG_8101: "Can the footer pills live in a more hidden spot? They clash with the main controls. Also I
  want the match results to auto scroll while keeping the controls at the bottom").** On the Atlantic/Nations
  Cup screen the CS298 fixed control bar (Next Match / Auto Sim / Skip to Result) overlapped the global
  footer pills (Send Feedback / Add to Home / "Love soccer? Try RunThePitch" / Home·About·Privacy·Terms).
  Two fixes, both mobile-only:
  1. **Footer hidden on the cup screen.** New CSS `#app.has-cupbar .foot{display:none}` inside the mobile
     `@media(max-width:700px)` block — the `has-cupbar` class is already added to `#app` only during the
     team-cup match-reveal (CS298), so the footer is hidden exactly there and nowhere else. Nothing is lost:
     every footer item (feedback, add-to-home, cross-promo, legal links) is reachable from the ≡ menu.
     Desktop keeps the footer (the media query doesn't apply).
  2. **Auto-scroll the newest match into view.** The newest revealed session card gets `id="cup-newest"`; a
     double-`requestAnimationFrame` after render (so render's own `scrollTo` at the end has already run)
     computes the fixed bar's height and `window.scrollBy`s so the newest card's bottom sits just above the
     bar (`innerHeight − barH − 14`, smooth). Guarded by `S._cupScrolledN` (last teamMatchN scrolled to) so
     it only fires on a genuine reveal, never on the many same-state re-renders; reset to null when entering
     a new cup event (the `S._cupIdx` block) and skipped under reduced-motion. So as the cup auto-sims
     match-by-match the results follow themselves while the controls stay pinned at the bottom.
  Verified in Playwright against the real DOM shape (`#app.has-cupbar > .card>.screen[cupsticky + cards +
  .cupctrl] + .foot`): mobile → footer `display:none`, `.cupctrl` fixed + pinned to the viewport bottom, and
  the newest card scrolls to exactly `targetBottom` above the bar while the bar stays pinned; desktop →
  footer shown, controls in-flow. Zero page errors. Deployed to /golf.

- **CS301 — fewer press pop-ups/season, enhanced reaction page, "Fan Support" vs following disambiguated,
  and realistic follower ceiling (owner IMG_8111: "one too many of these pop ups per year · enhance the
  response page after your selection · I don't understand fans +6 if my following is 371m · 371m feels too
  high").**
  1. **One fewer presser/year.** `STORY_PER_SEASON` 3→2 and the shared interruption budget
     `SEASON_STOP_BUDGET` 5→4, so a season now pauses for at most 2 press conferences + 2 (really-big)
     Moments. The guaranteed-first-storyline logic is unchanged, so a career year never passes with zero.
  2. **Enhanced reaction page.** The post-choice fallout (was a flat wrap of comma-separated chips) is now a
     polished aftermath card: the reaction quote, then three stat tiles — **Fan Support / Respect /
     Confidence** — each showing the delta arrow AND the resulting value out of 100, then a separate
     **Reach** row for the follower change, then the persona/endorsement badges. (Verified render: "Fan
     Support ▲ +6 · 38/100 · Respect ▼ -3 · 47/100 · Confidence ▲ +4 · 64/100 · Reach ▲ 320K, now 8.5M
     following".)
  3. **"Fans +6" confusion fixed.** The 0-100 popularity AXIS is now labelled **"Fan Support"** everywhere
     (the reaction tiles + the top two-axis meter, which also spells out "N following"), and shown as a
     rating `/100`, clearly distinct from the raw **following/Reach** count. So "Fan Support +6" (a rating)
     no longer reads as contradicting "371M following" (the reach).
  4. **371M following → realistic ceiling.** `gainFollowers` was compounding (`cur*pct + flat`) with no
     cap, so a long career exploded into hundreds of millions. Added diminishing returns (`damp =
     FOLLOWERS_SOFT/(FOLLOWERS_SOFT+cur)`, `FOLLOWERS_SOFT=3.5M`) so the % growth tapers as the following
     grows, plus a hard cap `FOLLOWERS_MAX=40M`. `careerStory()` also clamps a saved following to
     `FOLLOWERS_MAX` on read, so the owner's inflated 371M **heals to 40M** on next load. Verified via the
     real `gainFollowers`: a dominant 30-year career now tops out at 40M (was hundreds of M), an average
     15-year career ~361K, and 371M heals to 40M. All tunable at the `FOLLOWERS_SOFT`/`FOLLOWERS_MAX`
     constants.
  Verified in Playwright (follower math across dominant/average/heal + the press overlay rendering the
  enhanced reaction with the Fan Support/Respect/Confidence tiles + Reach row), zero page errors. Deployed
  to /golf. (No SQL — the "Fans" leaderboard SQL is the already-written `supabase/48_runtour_fans.sql`,
  still owner-to-run.)

- **CS302 — remove Daily Quests / Weekly Challenges / Tour Rep from the Beat the Pro page (owner
  IMG_8117).** The daily preview and daily result both rendered the full `challengesNode()` panel (the Tour
  Rep tier bar + Daily Quests + Weekly Challenges), which the owner wanted off the Beat-the-Pro flow.
  Removed the `challengesNode()` call from BOTH `scrDailyPreview` and `scrDailyResult` (plus the result
  screen's "Daily Quests complete!" / "Weekly Challenge complete!" celebration scouts). The **streak
  calendar is kept** on the preview (owner didn't flag it). Challenges/quests/rep still live in the ≡
  **Challenges** overlay (nav tile + the once-a-day sign-in pop-up), and — importantly — quests/challenges
  are still CREDITED on finish (the `questDaily`/`questWeekly` crediting is independent of the removed
  display, unchanged). Verified in Playwright: the daily preview shows no challenges panel / rep bar / daily
  quests / weekly challenges while the streak calendar + target still render, zero page errors. Deployed to
  /golf.

- **CS303 — no auto Challenges pop-up (put it behind a "Daily Quests" button) + remove the clipped setup
  avatar name (owner).** (1) The once-a-day Challenges sign-in pop-up (`maybeChallengesPopup`, CS290) popped
  over the title screen; removed that auto-call and added a **🎯 Daily Quests** pill-button beside the
  **📖 How to Play** button under the hero (both `.howtop` style, in one centered flex row). It opens the
  same Challenges overlay (`S.overlay='challenges'`) — the panel (Tour Rep bar + Daily Quests + Weekly
  Challenges) is now only shown on demand. (2) The setup "live stage" name label above the avatar
  (`.avstage-name`, CS266) was clipping (display-italic overflow, e.g. "JJ") and is redundant — the golfer
  name is already in the Name field below on that screen — so it was removed. Verified in Playwright: the
  title shows both How to Play + Daily Quests, no overlay auto-opens, clicking Daily Quests opens the
  Challenges overlay; the setup screen has no name label above the avatar (stage + Name field intact); zero
  page errors. Deployed to /golf. (The `.avstage-name` CSS rule is left in place, unused/harmless.)

- **CS304 — persistent bottom tab nav (Home / Career / Daily / Online / Leaderboard) (owner: liked the
  bottom nav in the TikTok promo mockup, "navigating to any page from any page really easy").** New
  `bottomNav()` renders a fixed bottom tab bar (5 tabs, clean `ic()` SVG icons — home / golfer / target /
  swords / chartup — active tab in gold, `aria-current`), appended in `render()` AFTER the screen dispatch
  (so `has-cupbar` is known) on every screen EXCEPT immersive live-play ones that have their own bottom
  controls (`NAV_HIDE`: dailyround, playoffwatch, h2hwatch, h2hpreview, h2hdraft, h2hlobby, and the team-cup
  reveal via `has-cupbar`). `#app.has-botnav` reserves 58px + safe-area so the footer never hides behind it.
  Owner picks (AskUserQuestion): 5th tab = **Leaderboard** (the Pro Shop is disabled, so Store wasn't
  used), and show **everywhere except live play**. Routing mirrors the title's own handlers: Home →
  title; Career → `resumeCareer()`/`viewEndedCareer()` if a save exists else `reset()`+setup; Daily →
  `startDailyChallenge()`; Online → `openH2H()` (guest sign-in nudge); Leaderboard → `S.overlay='leaderboard'`.
  z-index 25, so an open full-screen overlay (z-40) simply covers it (close it to navigate) — standard modal
  behavior. Active-tab detection groups screens (career: setup/draft/build/season/summary/offseason/
  careerend/circuitend/recap; daily: dailyintro/dailyprev/dailyround/dailyresult; online: all h2h*). Wrapped
  in its own try/catch so it can never blank the page. Verified in Playwright: 5 fixed tabs on the title
  (Home active, 58px reserve), Career active on the season screen, Online active on h2hhome, Leaderboard tab
  opens the overlay + marks active, Home tab from setup returns to title, Daily tab starts the daily; nav
  hidden on dailyround / h2hwatch; the nav renders even when a screen fn throws (resilient, appended after
  the dispatch). Screenshot confirms the mockup-style bar. Deployed to /golf. Tunable: `NAV_HIDE`, the tab
  set/icons in `bottomNav`.

- **CS305 — bottom-fixed pop-ups clear the new bottom nav (owner IMG_8136: the "Scroll down · Continue"
  cue was peeking out from behind the CS304 nav bar).** Added a cascading CSS var `--botnav-space` (58px
  when the nav is shown, via a new `body.has-botnav` class toggled alongside `#app.has-botnav` in
  `render()`; falls back to 0 when hidden). Every bottom-fixed pop-up now adds `+ var(--botnav-space,0px)`
  to its `bottom`: the `.scrollcue` pill, `toast()` (both the plain and the scroll-cue-aware branch), the
  `selectionPopup` (playoff/qualification bottom card), the auth "Finishing Google sign-in…" pill, and the
  render-error toast. So on any screen where the nav shows, these sit above it; on live-play screens (no
  nav) they sit at their normal offset. Verified in Playwright on the title (nav present): the scroll cue
  (bottom 746) and a toast (688) both clear the nav (top 772); on `dailyround` (nav hidden) the var
  correctly falls back to 0. Zero page errors. Deployed to /golf.

- **CS306 — bottom nav: clearer icons + never drifts to mid-screen on iOS (owner IMG_8137).** (1) The
  Career (`golfer` — a tiny stroked swing figure) and Leaderboard (`chartup` — a thin zigzag) icons read as
  warped squiggles at 22px; swapped to **`flag`** (a clean golf pin) for Career and **`trophy`** for
  Leaderboard. (2) The nav (a `position:fixed` child of `#app`) drifted into the middle of the screen while
  scrolling on iOS (containing-block/paint bug). Moved it to be a direct child of **`document.body`** (the
  scroll root — the most reliable place to pin a fixed element on iOS, matching where the working
  toasts/selectionPopup attach); `render()` clears `#app` but not `body`, so any prior `.botnav` is removed
  first. z-order intact: overlays (z-40, in #app) still cover the nav (z-25) since #app creates no stacking
  context. Verified in Playwright: exactly one nav after repeated renders, on `<body>`, Career=flag /
  Leaderboard=trophy, overlay (z40) above nav (z25), zero page errors. Deployed to /golf.

- **CS307 — Daily / Monthly Spotlight course records can be TIED; every co-holder is shown (owner: "players
  should be able to tie for first and all of their names should be reflected on the course record. I don't
  want players to feel excluded for tying").** Previously the record RPC picked ONE holder per course
  (`distinct on`, earliest-first), so anyone who tied the low score was excluded and told they "missed."
  Now a tie is co-held and all names appear.
  - **SQL `supabase/49_runtour_course_record_ties.sql` (owner-run):** redefines `runtour_course_records`
    (daily / `p_legend` / `p_spotlight`) to return EVERY player tied for the lowest score at each course
    (one row per co-holder, earliest-first), deduped so a player who tied on multiple days appears once.
    Same return columns → drop-in. Validated on local Postgres: 3 tied holders all returned (worse scores
    excluded), same-user dupes dedupe to one row, spotlight/legend buckets correct, idempotent.
  - **Client:** new `crHolders(rec)` (joins all `names`), `buildCourseRecs(data)` (groups the RPC rows —
    possibly many per course — into one record with every tied name; works pre- and post-migration) +
    `adoptCourseRecs` (merges the global record into the local store, unioning tied names on an equal score).
    The 3 `crLoad*` fns use them. `recordCourseScore` now stores `names[]` and, on a TIE (`toPar===cur.toPar`),
    joins the player as a co-holder and returns `'tie'` (a new sole record returns `'record'`, worse
    `false`) — so a tying player is credited + celebrated, never excluded. `verifyDailyRecord` preserves the
    `'tie'`/`'record'` distinction. Every record display lists all holders (`crHolders`): the daily preview,
    the daily + spotlight result banners (+ celebration pop-up copy: "Record Tied! · You share the record at
    X with Y"), the Course Records overlay all-time rows, and the save/claim toasts ("shared course record").
  - Deploy-safe: pre-migration the RPC returns one row/course, so the client shows a single name and degrades
    gracefully; running migration 49 turns on the full tied list. **ACTION: run
    `supabase/49_runtour_course_record_ties.sql`.**
  Verified in Playwright: `buildCourseRecs` groups tied holders ("jah, coby") and excludes worse scores;
  `recordCourseScore` returns record→tie→false and co-holds on a tie; `adoptCourseRecs` unions a server
  co-holder into a local tie; zero page errors. Deployed client to /golf.

- **CS308 — Career Mode card: "30 YRS" → "42 YRS" + mention the Legend Circuit (owner).** The title-screen
  Career Mode card (`careerHeroCard`) badge changed "30 YRS" → "42 YRS" (30-year tour career + the up-to-12-year
  Legend Circuit epilogue = 42) and the description "Build your golfer, then play a 30-year career." →
  "Build your golfer and play a 30-year tour career, then join the Legend Circuit — up to 42 years in all."
  Just the Career Mode card copy (the resume card's "Year N of 30" tour-progress + the broader
  meta/About/How-to "30-year" strings were left as-is — the tour career itself is still 30 years; 42 is the
  total incl. the circuit). Verified in Playwright (badge "42 YRS", new description, badge fits, zero page
  errors). Deployed to /golf.

- **CS311 — press-conference: keep the chosen answer highlighted up top + Legend tokens playable after all
  daily attempts are used (owner IMG_8144).** (1) On a press-conference/storyline choice, the click handler
  now REMOVES the non-chosen options and keeps the chosen button at the top, styled `.sb-chosen` (gold
  border/tint, full opacity, a "✓ Your answer" label; its risk pill is stripped since the roll is resolved),
  so it's clear what you said while the reaction renders below. (2) The daily RESULT screen now shows the
  "Your Legend golfers · FREE PLAY" section (factored into a reusable `legendPlaySection()` shared with the
  preview), so a signed-in player who's used all 3 draft attempts can still start a free Legend round —
  previously the out-of-attempts result screen only offered Course Records, stranding Legend owners.
  Verified in Playwright: after choosing, exactly one option remains with `.sb-chosen` matching the pick and
  the reaction shows; with 0 attempts left the result screen renders the Legend section + "Play free" button
  + token name; zero page errors. Screenshot confirms the highlighted "✓ Your answer" chip. Deployed to /golf.

- **CS312 — sponsor goals: all 6 (hat + shirt) always different + rotate every year (owner: "I don't like
  how the sponsors for the hat and shirt have the same goals each year... make sure all 6 goals are always
  different, and always changing").** Before, each slot's 3 goals were mostly FIXED by the player's OVR tier
  (only the middle "TARGET" rotated), so hat & shirt shared near-identical floor/stretch goals and they
  repeated season to season. Rebuilt generation: `SPONSOR_GOAL_POOLS[grind|contender|elite]` = 8 DISTINCT
  goal-template builders each (cuts / cut-streak / top-10s / top-5s / prize money / scoring avg / playoffs /
  card / signature win / wins / major), ordered by difficulty `d`. `makeContracts()` now coordinates BOTH
  slots: it seed-shuffles the pool per (careerSeed, year), picks 3×(filled slots) distinct goals, sorts them
  easy→hard, and deals them round-robin (hat=ranks 0,2,4 / shirt=1,3,5) — so every one of the 6 goals is
  distinct AND each slot still gets its own floor/target/stretch. `makeContractFor` now takes the pre-chosen
  templates and assigns the tag + bonus by POSITION (floor pays little, stretch big — CS242 money balance
  preserved) while targets still scale by that slot's sponsor difficulty. Deterministic per (career, year)
  so resume/re-render is stable, but the shuffle changes every season so the goals stay fresh. Verified in
  Playwright across grind/contender/elite: all 6 goals distinct every year, hat/shirt each FLOOR/TARGET/
  STRETCH with ascending bonuses, and the full set rotates Y1→Y2→Y3; zero page errors. Deployed to /golf.

- **CS313 — realistic greens + bunkers in the hole view (owner IMG_8150: "we've pushed the fairway and
  surroundings to a higher graphic level, but the greens and bunkers could use realism improvements").**
  The green was a flat lighter-green disc + fringe ring and the bunkers flat sand blobs. Rebuilt both in
  `hvTerrain` (rendering-only — sim/geometry/score untouched; terrain is still built-once-and-cached per
  hole, all deterministic seeded SVG, no filters):
  • **Greens now read as real, gently-sloped putting surfaces.** Added a per-green `clipPath` and, clipped
    to the surface: faint alternating **mowing bands** (angle varies per hole), a **domed light/shadow**
    (lit top-left ellipse + shaded bottom-right ellipse → a 3D dome), and 2 soft **contour patches** so no
    two greens read identically flat. Kept the cast shadow + fringe collar (slightly deepened).
  • **Bunkers now read as raked, dished sand with a grassy lip.** Added a per-bunker `clipPath` and, clipped
    to the sand: a **lit concave floor** (lighter center), 3 **concentric rake lines**, and a darker
    **grassy-lip overhang shadow** hugging the top rim. Kept the speckles + cast shadow; links pot bunkers
    stay smaller/heavier-lipped via the existing `bunkerScale`.
  Verified in Playwright: terrain renders with the green + bunker clip ids on parkland / links / desert
  (Augusta, St Andrews, Oakmont), mow bands present, 0 page errors; screenshots confirm the greens are
  domed/contoured with a collar and the bunkers dished/raked with a lip (a clear step up from the flat
  discs/blobs). Deployed to /golf. Tunable: the mow-band opacity/width, the dome ellipse opacities, the
  contour-patch count, the bunker lit-floor + rake-line + lip opacities in `hvTerrain`.

- **CS314 — green elevation shading: organic soft lobes instead of the disc shading (owner: "I don't like
  the disk shading, it should be more natural and organic shapes that go with the greens so it reads more
  like elevation changes").** Replaced CS313's two symmetric dome ellipses + ellipse contour patches (which
  read as artificial discs) with 3-4 **blurred, irregular `hvBlobD` lobes** (a new soft `hvgsoft` blur
  filter, stdDeviation 4.5), seeded per green, alternating light/dark, positioned to follow the surface and
  clipped to it — so the shading reads as gradual undulation/tiers, not a hard oval. Mowing bands + fringe
  collar + cast shadow unchanged. Rendering-only, still cached-per-hole deterministic. Verified: syntax OK,
  terrain renders on parkland/links/desert with 0 page errors; screenshot confirms the Augusta green now has
  natural, organic elevation shading. Deployed to /golf. Tunable: lobe count (`nlobe`), the `hvgsoft` blur
  radius, the light/dark lobe opacities.

- **CS316 — smaller cup + per-course flags + more natural landscaping (owner: "make the hole itself
  slightly smaller... give each course their unique flags like real life... add more natural landscaping
  into all courses").** All in the hole view (`hvTerrain`/`hvGeom`); rendering-only, sim/geometry/score
  untouched, still cached-per-hole deterministic.
  • **Smaller hole + ball:** `HV_CUP_RX/RY` 2.15/1.5 → **1.82/1.28**, `HV_GBALL` 0.95 → **0.86** (keeps the
    realistic ~0.46 ball-to-hole ratio).
  • **Per-course flags:** every course now flies its OWN flag. `hvFlag(courseKey)` returns a colour + accent
    + style; six marquee venues get a hand-picked look (Augusta Masters-yellow, Pebble Pacific-blue, Oakmont
    charcoal/gold, St Andrews white/navy, Kiawah ocean-blue, Whistling red) and every other course gets a
    **hue-derived** colour from its key hash so all 39 daily courses are distinct (verified 39/39 unique),
    with two styles (solid / accent-stripe). `hvFlagSVG` renders it; `g.courseKey` now stored in `hvGeom` so
    the terrain can look it up. Applies everywhere the hole view is used (Daily/Moments/Spotlight/Legend/H2H).
  • **Natural landscaping (all courses):** a light, universal scatter of **grass tufts** in the rough
    (small biome-coloured blade clumps, sparse, allowed near the fairway edge since they're low → adds life,
    not clutter) + **reeds/cattails** on the banks of every pond and creek. New `grassTuft`/`reed` helpers.
  Verified in Playwright: syntax OK, 39/39 flags distinct, reeds render on water holes, terrain renders on
  parkland/pine/coastal/desert with 0 page errors; screenshots confirm the per-course flag colours, the
  reeds on pond banks (incl. the Sawgrass island green), the grass-tuft texture, and the smaller hole.
  Deployed to /golf. Tunable: `HV_CUP_RX`/`HV_GBALL`, `HV_FLAG_OVR` overrides + the hue formula in `hvFlag`,
  the grass-tuft density (`GS`/0.55 skip) and reed count.

- **CS317 — grandstands + gallery crowds (owner: "add grandstands in typical locations and fans as well...
  don't want to overcrowd it but it feels like there's so much open space").** Added tournament atmosphere
  to the hole view (`hvTerrain`); rendering-only, deterministic, cached-per-hole.
  • **Greenside grandstand:** new `grandstand()` draws a tiered stand (dark structure + shaded back wall +
    3 rows of small multi-coloured fan dots + a front rail). One per hole, placed at the first clear
    candidate around the green (behind → right → left → front), gated by a local `openSpot()` (off the green/
    water/bunker/ocean, off the fairway, in-frame) + a 5-point footprint check — so it fills space in a
    typical spot and never sits on the play corridor. ~99% of holes get one; tight/island holes that have no
    room get none (natural variety).
  • **Gallery crowds:** new `gallery()` draws a loose cluster of fan dots (with tiny shadows); two small
    clusters flank the front sides of each green (spectators at the ropes) where there's open ground.
  • Shared `CROWD` palette (muted tans/whites + a few brights) via `cCol()`. Kept deliberately modest (one
    stand + two small galleries per green) so it reads as a real event without clutter.
  Verified in Playwright: syntax OK, 143/144 sampled holes place a stand + 142/144 a gallery, terrain renders
  on all biomes with 0 page errors; screenshots confirm the stands sit behind the greens with visible crowds
  and the galleries line the green, filling the empty space. Deployed to /golf. Tunable: stand width (`sw`),
  the candidate order / footprint check, gallery cluster size (`gallery(...,7,7,...)`), the `CROWD` palette.

- **CS318 — remove the grandstand, kill gameplay lag, and make flags always load (owner: "Please remove the
  grandstand. Ensure there is no lag on gameplay, I noticed some lag. And also please make sure the flags
  graphics are loaded into the game always because I've noticed that they don't load in always or it takes a
  while. However we can speed up/smoothen out the game everywhere else we can do that also").** Three issues,
  all in the hole view (`hvTerrain`/`hvGeom`/`hvFlag`); rendering-only, sim/geometry/score untouched.
  1. **Grandstand removed (per the explicit ask).** Dropped the CS317 greenside grandstand — both the
     placement block AND the now-unused `grandstand()` helper (kept `CROWD`/`cCol`/`gallery`). The light
     gallery crowds flanking the green (the "fans" the owner wanted) stay — they're cheap (a few dots) and
     add the tournament atmosphere without the grandstand's ~30-node tiered structure per hole.
  2. **Flags now ALWAYS load (root cause of "they don't load in always / takes a while").** `hvFlag`'s
     hue-derived colour was emitting a modern space-separated `hsl(...)` string into the SVG `fill=`
     PRESENTATION attribute — which some SVG renderers reject (a rejected fill = an invisible/blank flag,
     intermittently by course). Added `hslHex(h,s,l)` and `hvFlag` now returns a HEX colour (`hslHex(...)`),
     which every renderer accepts, so each course's flag paints reliably every time. All 39 courses still
     distinct (verified 39/39). The per-course overrides + accent/style are unchanged.
  3. **Lag fixed / smoothing pass.** The hole-view SVG is re-parsed via `innerHTML` on every shot reveal, so
     two costs dominated: (a) **SVG blur filters** (`feGaussianBlur`) force an offscreen re-rasterization each
     reveal — removed the dead `hvsoft` filter AND the `hvgsoft` green-elevation blur; the green's elevation
     shading now uses **filter-free** low-opacity organic `hvBlobD` lobes (CS314/315 style, opacity .06/.08)
     instead of a blur. (b) **Node count** — cut the forest scatter density (STEP dense 30→33 / open 34→38),
     made the universal grass tufts sparser (GS `STEP*1.25`→`*1.55`, skip `<0.55`→`<0.68`), and dropped the
     fireflies 46→30. Terrain was already built-once-and-cached per hole (`g._terrainStr`), so this is a pure
     node/rasterization reduction on the hot re-parse path.
  Verified in Playwright over 144 holes across 8 biomes: **0 page errors**, `hsl(` count **0** (flags all
  hex), blur-filter refs **0**, grandstand refs **0**, galleries render on 95/144 (where open ground flanks
  the green — expected variety), 39/39 flags distinct, avg ~1616 nodes/hole; `node --check` clean. Deployed
  to /golf. Tunable: the forest STEP (dense/open), grass-tuft `GS`/skip, firefly count, the green-lobe
  opacities.

- **CS319 — simpler "Create your golfer" screen: less scrolling, owned-only kit, one store link, no
  bottom-nav clash (owner IMG_8152: "since adding the nav at the bottom, the player customization menu is
  crowded and clashes with it. Create a simpler layout with much less scrolling. We don't need all of the
  information we show. And definitely don't need to show every item that the player does not own, there just
  needs to be one message that can link them to the store").** Client-only, `scrSetup` + the cosmetic row
  builders.
  • **Bottom nav hidden on setup** (`NAV_HIDE` += `'setup'`). The setup screen already has its own sticky
    Back + Build Your Golfer action bar, so the global bottom tab bar was redundant AND clashed with it (the
    CTA sat half-behind the nav). Hiding it removes the clash and frees the 58px reserve.
  • **Kit shows ONLY what you own.** `cosColorRow`/`cosPatRow` now render just the OWNED colours/patterns and
    return `null` when there's no real choice yet (≤1 owned), so those rows collapse entirely — a brand-new
    signed-in player's whole Kit section is just the Cap on/off toggle + ONE link. Removed every locked 🔒
    swatch/chip and the per-row "Locked colours are in the Pro Shop" messages. One shared
    `proShopLinkRow()` ("🛍 Unlock more colours, patterns & gear in the Pro Shop ▸", gated on
    `anyCosmeticLocked()`) is the single store entry point (opens the shop's apparel section).
  • **Less info.** The caddie section's big flavor scout-card + the "N more caddies unlock at…" nudge line
    are gone — replaced by one tight line (the equipped caddie's name + edge, or a short prompt). Tightened
    the section-header spacing (18→13px top margin) and trimmed the mobile avatar a touch (34vh→30vh).
  Net: a fresh signed-in setup went from ~2600px+ (7 full kit rows × ~14 locked swatches each) to ~1726px,
  and grows only as the player actually buys gear. Verified in Playwright (412px): bottom nav absent on
  setup; fresh player → 0 locked-🔒 swatches, 0 kit colour swatches (collapsed), no caddie card, one Pro
  Shop link present; a player who owns navy/red shirt + argyle + navy trousers → exactly the 5 owned
  swatches shown + the Pro Shop link; guest path unchanged (still the sign-in locker-room upsell); 0 real
  page errors. Screenshot confirms the compact layout. Deployed to /golf.

- **CS320 — American spelling: "colour"→"color", "cheque"→"check" everywhere (owner).** Global
  case-preserving replace across the whole game file (53 colour → 0, 12 cheque → 0). "colour" had no
  identifier uses (safe global). "cheque" was also a JS variable (`const cheque` in `celebrateWin`) and a
  CSS class (`.celeb-cheque`) — both define+use together, so the global replace renamed them consistently
  to `check` / `.celeb-check` (verified: class def+usage match, variable + `.textContent` refs all
  renamed, no `check` collision in scope). node --check clean; Playwright boot 0 page errors + the win
  celebration still renders `.celeb-check`. Deployed to /golf. (Other British spellings — favour/honour/
  centre/-ise — left as-is; only the two named words were requested.)

- **CS321 — course-record celebration only fires on the FIRST time you beat it (owner: "the course record
  pop up comes up every time I enter the daily after earning the record… looks like a glitch, pops up a
  bunch").** Root cause in `scrDailyResult`: `r = S.dailyResult || dailyBest()`. On a fresh finish
  `S.dailyResult` is the stable in-memory object, so the `r._crCelebrated` guard persists across the
  finish's own re-renders (crLoad/dbLoad→render) and the pop fires once. But on RE-ENTRY (`startDailyChallenge`
  routes a played day to the result screen with `S.dailyResult=null`), `r` becomes `dailyBest()` — a FRESH
  object re-read from `bag_daily` storage each time, whose `_crCelebrated` is always falsy — so the
  `celebrateCourseRecord` pop re-fired on every visit. Fixed by gating it on `justPlayed` (`!!S.dailyResult`)
  so it only pops on the fresh finish that earned the record; the gold "New Course Record" banner still shows
  on re-view (correct — you DO hold it), only the animated pop-up is suppressed. The Monthly Spotlight path
  was already correct (its celebration is gated on `S.spotResult`, which is null on re-entry). Verified in
  Playwright: pop fires once on the finish and stays at 1 across repeated re-entries; 0 page errors.
- **CS322 — full American-spelling sweep (owner: "I want all American spelling, this is a game made by
  Americans").** Follows CS320 (colour→color, cheque→check). Case-preserving replaces across the game file,
  identifier/data-ID-safe: **centre→center** (33 — incl. the `centreLabel` local var, renamed consistently),
  **favour→favor / Favour→Favor** (8 — favourite→favorite, "Fan Favorite" persona/achievement),
  **honour→honor / Honour→Honor** (7 — "Season Honors", "Honor Roll" achievement, the `honours` local var
  renamed consistently), **theatre→theater**, **labelled→labeled**, **recognised→recognized**,
  **categorised→categorized**, and **Grey→Gray** (capital only → display strings like "Heritage Gray").
  The lowercase `grey` is DELIBERATELY LEFT where it's a persisted data ID (`id:'grey'` in PANTS/SHOES/HAIRS,
  the `hogangrey` shirt id) so saved player looks don't break; `cosTitle` gained a `grey→'Gray'` case so the
  pants/shoes swatch LABEL still shows American "Gray" while the stored id stays `grey`. Verified: 0 remaining
  British spellings in the candidate set (bar the intentional data-ID `grey`), the renamed vars have no
  leftover/duplicate refs, node --check clean, cosTitle('grey')==='Gray', Trophy Room + shop + daily render
  with 0 page errors. (Word-choice Briticisms like "whilst"/"amongst" left as-is — those are word choices,
  not spellings.)

- **CS323 — in-game flag shape matches the logo (swallowtail) + more flag designs (owner: "our flag shape
  is inconsistent with our logo… I like the flag we use in the logo and want that shape in the game. Also
  add further designs — simple patterns or logos").** The crest logo's flag (`crestSVG`, path
  `M26 18 h16 l-4 5 4 5 h-16 z`) is a **swallowtail** — a rectangular flag with a V-notch cut into the fly
  end — but the hole-view flag (`hvFlagSVG`) was a curved single-point pennant. Rewrote `hvFlagSVG` to draw
  the swallowtail (W 12 · H 6.8 · notch 3.4, proportioned like the crest) so the on-green flag now reads as
  the same mark as the logo. And expanded the designs from 2 (`solid`/`stripe`) to **7** — `solid`, `stripe`
  (horizontal band), `vbar` (hoist-side vertical bar), `tri` (hoist triangle), `dot` (center emblem), `cross`
  (plus), `diag` (diagonal split) — each drawn in the course's accent colour and CLIPPED to the swallowtail
  (unique per-position `clipPath` id) so nothing overflows the notch. `hvFlag`'s hue-based picker now spreads
  all 7 across the 39 courses (verified distribution 6/8/2/7/5/7/4), and the marquee overrides got
  design-appropriate looks (St Andrews navy + white cross, Oakmont charcoal + gold hoist bar, Whistling red +
  white emblem dot). Applies everywhere the hole view is used (Daily/Moments/Spotlight/Legend/H2H + the
  static share SVG). Rendering-only. Verified in Playwright: swallowtail path present, all 7 designs render
  distinct (flag-grid screenshot), a live Augusta hole shows the small gold swallowtail on the pin, 0 page
  errors. Deployed to /golf. Tunable: the flag W/H/notch + the per-design accent shapes in `hvFlagSVG`, the
  design spread + `HV_FLAG_OVR` in `hvFlag`.

- **CS325 — Career Dilemmas: specific situational risk/reward decisions with weighted outcomes + real
  stakes (owner: "incorporate more risk/reward decisions into career mode, and more specific events that
  aren't as generic… very in depth, a ton of outcomes and scenarios").** A whole new decision layer beside
  the existing press-conference storylines, built for depth and variance. (AskUserQuestion errored; proceeded
  with the recommended default: **bounded-but-real stakes** — temporary effects, never career-ending unless
  YOU pick a wild gamble — and a broad scenario mix.)
  • **Temporary-effects engine** (`S.career.fx`): decisions can push time-limited modifiers — an injury
    (−6 Approach for 3 events), a coaching bet (+3 Putting all season), form, etc. Applied for DISPLAY in
    `buildPlayer` (radar/OVR) AND, crucially, to the SIM as a course-fit-weighted `eo` delta in `beginEvent`
    (`careerFxEo`, parallel to how confidence/caddie bonuses already nudge the sim), so injuries/boosts
    genuinely move your finishes. Ticked down one event at a time in `advanceEvent`; surfaced as live chips
    on the season banner (🩹 Wrist strain · −6 Approach · 2 left). Career-only (never Daily/Circuit —
    `careerFxOn()` gate), so it can't bleed into the Daily.
  • **Weighted-outcome model** — the KEY to "a ton of outcomes": every choice has multiple `outcomes` with
    relative weights (some skill-influenced, e.g. a high-composure player is likelier to gut out an injury),
    so the SAME choice resolves several ways (pays off / mixed / backfires), each with its own concrete
    effects: temp skills, confidence, Fans/Respect (the CS280 two-axis rep), followers, money, and a career-
    feed headline. `rollOutcome` picks by weight; `applyDilemmaOutcome` applies + returns effect chips.
  • **24-scenario catalog** (`DILEMMAS`) across a pro's whole life — injury/health (wrist twinge, back spasm,
    illness), schedule/prep (seven-figure appearance fee before a major, overplaying, red-eye vs charter),
    gear/swing/coaching (new driver, swing overhaul, sports psychologist, putter switch), off-course/life
    (baby due, business investment, bachelor party), integrity (a fix offer → report/ignore/entertain, a
    questionable drop, a wrong scorecard → DQ risk), media/fans (heckler, mic'd-up, viral trick shot),
    nature/course (alligator on the fairway, ball-thieving dog, weather delay), and rivalry/locker-room
    (money practice round vs your nemesis, mentoring a rookie). Each is situational (`when(ctx)` gated on age/
    event/rank/rival/skills), so the beats fit the moment instead of reading generic.
  • **Off-course money** (`S.season.sideMoney`) folds into the season NET only (not the prize-money
    leaderboard), added to career net at season-end.
  • **Frequency** (owner wants MORE decisions): season interruption budget 4→6, split across ≤4 dilemmas +
    pressers + ≤2 Moments; the season loop prefers a specific dilemma (~60%) over a press beat. A distinct
    gold "⚖ Career Decision" overlay (vs the blue press room) presents the situation → choices (⚡ Risky
    flagged) → the ROLLED outcome revealed with tone-colored framing + effect chips. Saves/resumes via the
    existing career + mid-season snapshot (added `sideMoney`; `fx`/`dilSeason` ride on `S.career`).
  Verified in Playwright: catalog integrity (24 dilemmas, 0 dupes, all outcomes weighted, effects bounded);
  the engine (injury 82→76 display, weighted sim delta −1.26, expires after 3 events, roll distribution
  matches weights, effects apply, daily-mode isolation); the overlay renders + reveals the outcome + chips;
  and a full 20-event career season fired 4 dilemmas + 2 pressers within budget with injuries showing on the
  banner and off-course money folded into the summary net — **0 page errors** throughout. Deployed to /golf.
  This is a strong first wave; the catalog is a simple data table that's easy to keep expanding (more
  scenarios, per-event/course-specific beats, longer branching chains). Tunable: `SEASON_STOP_BUDGET`,
  `DILEMMA_PER_SEASON`, the ~60% dilemma-vs-presser split, and every effect magnitude in the catalog.

- **CS326 — multi-part story ARCS (decisions continue into later beats) + cleaner, fewer pop-ups (owner:
  "I love multi branching storylines and maybe some that continue into later developments or storylines…
  ensure all the decision pop-ups are clean and non-obstructive… 6 might be a little too many on top of
  Moments").** Built on CS325.
  • **Arcs — a decision now seeds a follow-up that fires later, forming a chain.** New infra
    (`S.career.arcs`): an outcome can carry `arc:{fid, in:[minEvents,maxEvents]}`; `applyDilemmaOutcome`
    schedules it with a randomized wait, `tickArcs` (in `advanceEvent`) counts it down per event, and
    `dueArc` surfaces it when ready. A due follow-up fires FIRST and bypasses the per-season fresh-dilemma
    cap (it's a payoff the player is owed), still bounded by the season interruption budget; showing it
    consumes it. Stuck arcs (whose `when` never passes) self-prune after 30 events. Six follow-ups
    (`STORY_ARCS`) wired to seeding outcomes: **The Venture** (go all in on a business → first-year numbers
    boom/steady/bust → if it booms, an "expand the empire?" part 3), **The Rebuild** (commit to a swing
    overhaul → weeks later it clicks-for-good or you scrap it), **The Rivalry** (win a money match vs your
    nemesis → they demand a doubled-stakes rematch), **The Comeback** (a bad wrist/back injury → a "back to
    full fitness, is the game still there?" beat that resolves strong or rusty), **The Protégé** (mentor a
    rookie → they break out and you root for them / use it as fuel). Follow-ups read the seed via `ctx.arc`
    and can seed further arcs, so chains branch.
  • **Cleaner / non-obstructive.** At most ONE pop-up per event now — when a dilemma/presser fires at the
    start of an event it flags `ce._interrupted`, so the Sunday Moment won't also fire that week.
  • **Fewer.** Season interruption budget 6→**4** total (dilemmas + arcs + pressers + Moments combined),
    fresh dilemmas/season 4→**3**. So a season sees ~3-4 decisions max including any Moment — not a
    pop-up every event.
  Verified in Playwright: arc catalog (6, 0 issues); full lifecycle (seed→wait→due→consume, doesn't touch
  the fresh cap); a due arc fires even at the fresh-dilemma cap; and a full career season produced exactly
  4 interruptions total with **0 events showing two pop-ups**, 0 page errors. Deployed to /golf. Tunable:
  `SEASON_STOP_BUDGET` (4), `DILEMMA_PER_SEASON` (3), each arc's `in:[…]` delay, and the ~60% dilemma-vs-
  presser split.

- **CS327 — never interrupt in back-to-back weeks (owner: "shouldn't come up with dilemmas or pressers
  back to back weeks… players should flow through the sim without being abruptly stopped twice in a row.
  It annoys people").** Added a min-gap rule to the season-loop trigger: a dilemma/presser/arc only fires
  if at least one clean event has passed since the last pop-up (`S.evtIndex − S.season._lastStopEvt >= 2`).
  Every pop-up — dilemma, presser, arc, AND a Sunday Moment — stamps `_lastStopEvt`, so nothing (including
  a Moment the following week) can stop the player two events in a row. Reset in `startSeason`, carried in
  the mid-season save. Verified in Playwright across 5 seasons: interruptions always land ≥2 events apart
  (e.g. events [1,3,5,7]), **0 adjacent** anywhere, 0 page errors.

- **CS328 — chosen Career Decision option stays legible (owner: "don't like how the selected choice turns
  grey after selection… it needs to remain legible and clear it was the chosen decision").** The `.sb-chosen`
  highlight (gold border, gold-tinted fill, white text, "✓ Your answer") was CSS-scoped to `.sbtns` (the
  press-conference overlay), so a picked DILEMMA (`.dbtns`) got the class but none of the styling and fell
  through to the grey `.btn:disabled{opacity:.45}` look — grey-on-grey, barely readable. Made the `.sb-chosen`
  rules container-agnostic (drop the `.sbtns` prefix, `!important` to beat `:disabled`), so the chosen option
  now stays clearly gold + legible in BOTH overlays. Verified in Playwright: the picked dilemma button
  computes opacity 1, white text, gold border, "✓ Your answer" tag; 0 page errors. Deployed to /golf.

- **CS329 — bottom nav no longer drifts to mid-screen while scrolling the live season (owner screenshot,
  recurring iOS glitch).** Root cause: `render()` REMOVED and re-appended the fixed `.botnav` on every
  render, and the live-sim season screen re-renders every ~1-2s — on iOS, re-adding a `position:fixed`
  element mid-scroll makes Safari paint it at a document position (it appears stuck in the middle of the
  page). Fix: only REBUILD the nav when its active state actually changes (keyed on `screen|overlay`);
  otherwise the same DOM node stays in place across renders, so it stays pinned. The nav's click handlers
  read live state, so a persisted nav is never stale. Verified in Playwright: the nav is the SAME node
  across 5 same-screen re-renders (was recreated each time), still `position:fixed;bottom:0` on `<body>`,
  rebuilds + re-highlights on tab/overlay change, hides on live-play screens; 0 page errors. Deployed to /golf.

- **CS330 — a LOT more sponsor brands so the sponsor journey lasts a whole career (owner: "I've been with
  the same global sponsors for 20 years and haven't been offered new choices. This journey should last
  throughout the majority of your career… reaching the max at year 7 defeats the purpose. Can we add a lot
  more brands").** Root cause: sponsor offers only surfaced for an EMPTY slot or a tier-up of your lowest
  filled slot, and there were only 4 tiers topping out at Global — so once both slots were at Global (mid-
  career), `low.tier < maxTier` was false forever and `computeSponsorOffers` returned nothing for the rest
  of the career. Fixes:
  • **2 new prestige tiers** (`SPONSOR_TIERS` 4→6): **Elite** (reward 2.40, diff 2.05) + **Icon** (2.80,
    2.30) above Global, so there's a genuine ladder to keep climbing. `SPONSOR_TIER_REQ=[0,24,48,70,94,114]`
    (market value 0-~120 from following+OVR+wins/majors) — Global now unlocks at ~year 7 (a MID-career
    milestone, not the ceiling), Elite ~year 9, Icon ~year 11+ for a DOMINANT star, and Icon needs a
    near-maxed CV (huge following + peak OVR + many wins/majors), so it's a late-career pinnacle a moderate
    career reaches much later or never. Verified the unlock timing in Playwright (Regional yr1 · National yr4
    · Premium yr5 · Global yr7 · Elite yr9 · Icon yr11 for a dominant career).
  • **36 more fictional brands** (`BRANDS` 36→72, `LOGO_SPEC` + hash-derived logos): +3 each to Regional/
    National/Premium/Global, +12 Elite, +12 Icon — 12 per tier. Each has a distinct category/color/tagline/
    trait; the 36 new ones get a deterministic shape+accent from a name hash (`logoSpecOf`: `LOGO_SHAPES`/
    `LOGO_ACCENTS` via `dHash`) so they render distinct without 36 literal LOGO_SPEC entries. `brandLogoSVG`/
    `brandLogoDraw` both read `logoSpecOf`, so marks match across the UI + the worn-on-avatar logo.
  • **Poaching keeps offers coming at the ceiling** (`computeSponsorOffers` + `SPONSOR_POACH_CHANCE=0.5`):
    for your lowest filled slot, if you've outgrown it a BIGGER-tier brand offers an upgrade (as before);
    once you're at your ceiling, ~50% of years a RIVAL brand at the same top tier tries to POACH you
    (`{poach:true}`) — so fresh choices keep arriving for the rest of a career, fixing "20 years, never
    offered anything new." Verified: a dominant career reached Icon in both slots then still saw poach
    offers in 12 of 20 subsequent years.
  • **Offer-card framing** (`sponsorDecisionNode`): each offer now shows WHY it appeared — a gold "↑ A bigger
    brand is calling · step up to {Tier}" badge for an upgrade, or a teal "⚡ A rival {Tier} brand wants to
    poach you" badge for a poach.
  All in the existing two-slot sponsor system (CS236) — no SQL, no economy change (the CS242 money balance +
  `SPONSOR_MONEY` scale are untouched; new tiers pay more but goals scale harder). Verified in Playwright:
  72 brands / 6 tiers / 12 per tier / 0 dup names / all tiers valid; logos render distinct; offers persist
  across a long career (tier-ups while climbing + poach at ceiling); `sponsorDecisionNode` renders the
  upgrade/poach badges; 0 page errors (only sandbox-blocked external-resource console noise). Deployed to
  /golf. Tunable: `SPONSOR_TIERS` reward/diff, `SPONSOR_TIER_REQ` thresholds, `SPONSOR_POACH_CHANCE`, the
  `BRANDS` catalog.

- **CS331 — more variety of in-season sponsor goals + slightly less sponsor pay (owner: "increase the
  variety of in-season goals given by sponsors, and slightly decrease how much they pay").** Built on the
  CS312 `SPONSOR_GOAL_POOLS` (per-OVR-band template pools that `makeContracts` shuffles per (career, year)
  and deals 3-distinct-goals-per-slot).
  • **Variety:** grew each band's pool from 8 → 12-13 templates by adding 5 new goal KINDS (all computable
    from existing season data, wired into `goalProg`): `topN` (top-20 finish count — a broader consistency
    goal distinct from top-10/top-5), `moneyRank` (finish top-N on the money list — new `moneyRank()` helper
    mirroring `pointsRank`, a different curve from the points/ptsRank goals), `majorTop10` (post a top-10 at
    a major), `allCuts` (make EVERY cut across N+ starts — a perfect-consistency stretch goal), and
    `avgFinish` (season average finish inside top-N). Spread across the bands by difficulty: grind adds
    top-20/money-top-100/major-top-10/all-cuts-12; contender adds top-20/money-top-40/avg-top-35/major-top-10/
    all-cuts-14; elite adds money-top-10/avg-top-22/major-top-10/all-cuts-14. So the seasonal shuffle now
    draws from a much larger, more varied set — verified 6 straight seasons produced 6 DISTINCT goal-sets
    (11 distinct kinds seen), still all-6-distinct within each season, still rotating every year.
  • **Pay:** trimmed the global `SPONSOR_MONEY` payout scale 0.78 → 0.70 (~10% less across all goal bonuses)
    — a slight trim on top of the CS242 ~50% cut, keeping sponsors a supplement to prize money. Signing
    bonuses (their own formula) unchanged; the CS242 tier/dual/follower balance otherwise untouched.
  Verified in Playwright: `SPONSOR_MONEY`=0.70, pools 12/13/12 with 0 dup `dk` per band, all 6 goals distinct
  per season, 6/6 distinct season goal-sets across years, every new goal kind computes correct live progress
  (txt/done/pct) without throwing, and a live season renders the contract strip + report cards with the new
  goals ("Make every cut across 14+ starts", "Finish top 40 on the money list") — 0 page errors. Deployed to
  /golf. Tunable: `SPONSOR_MONEY`, the per-band template pools + their `d` difficulty ordering, the new-goal
  targets.

- **CS332 — off-season "spin forever" cheat closed (owner: "in the off-season you can spin the wheel, see
  the result, tap to another page with the nav, and when you return to career it brings you back to before
  the spin — stop this so people can't cheat and spin forever").** Root cause: the off-season save
  (`offseasonResumeExtra`) captured the committed state (locked stats, changes used, re-spins remaining) but
  NOT the in-progress spin — the revealed golfer (`S.current`) and the seen-this-off-season set
  (`S.revealed`). The free "Spin the Wheel" (`offSpin`, no re-spin cost) also never saved on land. So the
  bottom-nav "Career" tab, which reloads via `resumeCareer()` from the save, restored the PRE-spin state
  with `S.current=null` — letting the player spin again for free, forever, without ever spending a re-spin.
  Fix (3 small changes): (1) `offseasonResumeExtra()` now snapshots `offCurrent` (the revealed golfer, only
  when on the off-season screen and not mid-animation) + `offRevealed` (`[...S.revealed]`, an array of
  names); (2) new `offPersistSpin()` fires at both completion points of `reveal()` (reduced-motion + the
  animated interval), gated to `S.offseason && S.screen==='offseason' && S.current && !S.spinning`, so the
  instant a spin LANDS it's saved (`offSpin` is free/async, so this is where the commit happens; the daily/
  career draft paths are unaffected since they aren't on the off-season screen); (3) the `resumeCareer`
  off-season branch restores `S.current=r.offCurrent||null` and `S.revealed=new Set(r.offRevealed||[])`
  instead of nulling them. Net: after spinning, leaving, and returning you resume on the SAME golfer and
  must take a skill or spend a re-spin — no free re-roll. `offReSpin` already saved its re-spin decrement
  BEFORE revealing, so a rare mid-animation exit still can't refund a re-spin. Signed-in only, matching the
  rest of career save/resume (career mode requires an account). Verified in Playwright (reduced-motion so
  `reveal()` is synchronous, `sbSignedIn` stubbed for the LS round-trip): a free spin is saved
  (`offCurrent`/`offRevealed` present), `resumeCareer()` restores the exact same golfer + revealed set +
  unchanged re-spins, a repeat free `offSpin()` is a no-op (cheat blocked), and a legit `offReSpin()` still
  works and costs exactly 1 re-spin — 0 page errors. Deployed to /golf.

- **CS333 — title hero tagline → "BUILD A GOLFER. LIVE YOUR LEGACY." (owner).** Changed the title-screen
  hero (`scrTitle`) from "Your Golfer. / Your Tour." to "Build a Golfer." (cream `.hr1`) / "Live your
  Legacy." (gold `.hr2`); the `.hero` CSS uppercases it. Verified at 412px — both lines centered, no
  overflow, 0 page errors. Deployed to /golf. (Copy-only; the RUN THE TOUR wordmark/brand is unchanged.)

- **CS334 — career decisions name REAL opponents instead of "a young golfer / a veteran" (owner: "the
  decisions use very generic descriptions… use the opponent golfer names so it feels authentic and
  immersive… everywhere generic language is applied. Give real life to this thing").** The rival-specific
  beats already used the real `rivalName`, but the mentor/veteran/rookie beats used generic phrasing. Added
  `fieldPeople()` — pulls REAL recognizable players from the living world (`S.world.active`): a veteran
  (age ≥35, established), a young star (age ≤25), a rookie (debutant/age ≤22), a top star, and a field pro
  — preferring non-generated (real) players and field-caliber names, deterministic per (careerSeed, year,
  evtIndex) so a beat's names stay stable across re-renders/resume. Exposed on `storyCtx` as `vetName`/
  `youngName`/`rookieName`/`starName`/`proName`. Rewrote the generic beats to use them (with a graceful
  generic fallback when there's no world): the **veteran** locker-room beat ("Brian Harman pulls you
  aside…"), the **veteran_legacy** mentor choice ("Mentor Tom Kim"), the **rookie_intro** backfire
  ("Veterans like {name} smirk"), the **dil_rookie_help** dilemma ("{rookie} asks for help", now gated on a
  real rookie existing), and the **dil_practice_rival** title (fixed a stray `${''}` artifact → "A money
  round with {rival}"). Multi-part continuity: **dil_rookie_help** now captures the mentored player's name
  into the seeded arc (`arcData:c=>({rookie:c.rookieName})`), so the **arc_mentee** follow-up months later
  names the SAME player ("Caleb Surratt is winning" — the one you mentored). **pressBuzz** opponent quotes/
  headlines now prefer a real opponent name (rival → star → pro) over the fictional `PB_NAMES` pool. Also
  fixed a **latent crash**: `applyDilemmaOutcome` called a function `head` with no ctx (`o.head()`), so any
  named dilemma feed-headline would throw — now threads `ctx` through (`o.head(ctx)`, and dynamic
  `arcData(ctx)`). Deliberately left non-opponent roles generic (caddie/agent/reporter/heckler/fan, and the
  "legend takes a shot" quote) — those aren't field players, and putting a fabricated quote in a real
  retired legend's mouth is a right-of-publicity gray area. Verified in Playwright against a real living
  world: all five name pickers return real players, every rewritten beat renders the real name, the mentee
  arc carries the captured name, press-buzz uses a real opponent, the head-fn path no longer throws, and
  beats gracefully fall back to generic text with no world — 0 page errors. Deployed to /golf. (Player
  roster names are real by the standing RENAME-SPEC §7 decision — only courses/tournaments/cups are
  fictionalized — so naming opponents here is consistent with the rest of the game.)

- **CS335 — press-buzz headlines & fan tweets expanded and varied (owner: "the headlines and fan tweets
  feel generic and the same every time — make them more unique").** The `PB_TONES` pools (CS291) were tiny
  (4-5 tweets, 3 headlines, 2 opponent quotes per tone), so with 2 tweets + 1 headline drawn per presser
  they repeated fast. Grew every pool ~3-4×: **bold 18 tweets / 12 headlines / 7 opponent quotes**, humble
  16/11/7, gritty 16/11/7, bad 16/10/7, neutral 12/8/3 — with fresher, punchier golf-twitter phrasing that
  weaves in the real opponent (`{rival}`) and event (`{evt}`) so lines feel specific ("even {rival} has to
  respect that", "somewhere {rival} is smiling reading {you}'s quotes", "the {evt} field just got put on
  notice"). Also expanded `PB_HANDLES` 15→30 and `PB_OUTLETS` 8→14, and made each presser show **2 OR 3**
  fan tweets (~40% show 3) for extra life. Gender-neutral opponent quotes (the player can be male/female).
  Verified in Playwright over 40 same-tone pressers: 12 distinct headlines + 17 distinct tweets used, 0
  duplicate tweets within a single presser, ~42% three-tweet pressers, ~50% show an opponent quote, real
  names weave in, no stray unresolved `{tokens}` — 0 page errors. Data-only change (pools + the tweet-count
  line); the buzz engine/rendering is unchanged. Deployed to /golf. Tunable: the `PB_TONES` pools, the
  2-vs-3 tweet probability, `PB_HANDLES`/`PB_OUTLETS`.

- **CS336 — fan handles are GENERATED on the fly (owner: "the fan handles should generate on the spot so
  it's different every time").** Replaced the fixed 30-name `PB_HANDLES` pool with a procedural `pbHandle()`
  that assembles a golf-flavored username from word-part banks (`PB_H1` adjectives/nouns ×44, `PB_H2`
  suffixes ×32, `PB_HNAME` first names ×22) in several shapes (word+suffix, word_name, the+word+suffix,
  word+name) with a ~40% chance of a trailing number — e.g. `bunkerwhisperer`, `chip_gus53`, `acegoat80`,
  `drawronnie`, `flag_finn`, `the19thnerd92`. `pressBuzz` now generates a unique handle per tweet (dedupe
  loop within the presser). Verified in Playwright: 1822 distinct handles out of 2000 generations, all valid
  (`^[a-z0-9_]+$`, 4-24 chars), 0 duplicate handles within a single presser across 200 pressers, 472/487
  distinct across those pressers — 0 page errors. Data/generator-only; the buzz engine is otherwise
  unchanged. Deployed to /golf. Tunable: the `PB_H1`/`PB_H2`/`PB_HNAME` banks + the shape/number
  probabilities in `pbHandle`.

- **CS337 — off-season page revamped: compact, no layout jump, current stats always visible (owner: "I
  don't like the off-season spin page. Everything moves around on mobile when you're spinning and then
  looking at your options. You also have to scroll down to see your other stats to compare. Minimize the
  sponsorships into a tighter design and revamp the UX/UI so the user can see most things without
  scrolling").** Rebuilt `scrOffseason` mobile-first. Root problems: the two-column `.cols` layout put the
  spin/skill-grid in one column and your CURRENT bag (the comparison stats) in the OTHER column — on mobile
  that stacked far below the avatar, so you scrolled to compare; the skill grid appeared/disappeared around
  the reel on each spin (big layout jumps); and the sponsor block ate a whole screen.
  • **Unified skill grid (the core fix):** ONE 8-tile grid that's ALWAYS present. Idle → shows your current
    bag (8 stats). After a spin → the SAME tiles show `current → new ▲+d / ▼d` in place (e.g. "Approach 84 →
    86 ▲+2", "Bunker 87 → 80 ▼7"), tap to swap. So your current stats are always visible right at the action
    and the tile count never changes — nothing jumps. Verified: grid top position moves 0px between idle and
    spun. Forced 2-column even on small phones (`.osgrid` override) so all 8 fit without scrolling.
  • **Reserved reel slot:** a fixed-height reel ("Spin to swap a skill" idle → the golfer when landed), so
    tapping Spin causes no shift.
  • **Compact hero:** a small head-and-shoulders avatar + name + live OVR + change/re-spin budget replaces
    the tall 340px build-hero figure. The Tour Rep perk + prime/age status collapse to one tight line.
  • **Sponsors minimized:** new `sponsorStripNode()` — a one-line collapsible strip (🛍 Sponsors · 🧢 Zenith
    Bank ★ · 👕 Aurora Global ★, expand for the full slot cards). The full prominent `sponsorDecisionNode` now
    renders ONLY when there's an actual offer to decide.
  Net: hero + status + sponsors + reel + all 8 current stats + the Spin button now fit essentially on one
  mobile screen (was a long scroll). Also made `reveal()` robust to the off-season's renamed `.osreel`
  (guards the flicker against a null reel). Inline lock-in confirm (CS273) preserved. Verified in Playwright
  (412×900): 8 tiles idle + 8 swap tiles spun with 0px grid jump, spin→confirm→lock-in works (change
  applied, stat locked), sponsors collapsed by default, guest path renders with no crash, 0 page errors.
  Deployed to /golf. Tunable: the `.oshero`/`.osreel`/`.osgrid` sizing, the avatar crop height.

- **CS338 — "Build your golfer" draft screen revamped to match the CS337 off-season (owner: "revamp the
  build your golfer screen with the same thing in mind").** `scrDraft` had the same problems as the old
  off-season: a tall `buildHero` (big avatar + radar) on top, then a two-column `.cols` where the spin/skill
  tiles were in one column and your SCORECARD (drafted picks) in the OTHER — on mobile that stacked below, so
  you scrolled to see what you'd drafted, and the reel + skill grid appeared/re-flowed on every spin (jumps).
  Rebuilt it with the same unified-grid pattern (reusing the CS337 `.oshero`/`.osreel`/`.osgrid`/`.osactions`
  classes): ONE always-present 8-slot grid where **filled slots show your pick** (green tile: skill · golfer
  · value — your scorecard, always visible) and **open slots show the spun golfer's rating with a Take chip**
  to draft. Plus a compact avatar+OVR+"N/8 drafted · re-spins" hero (no giant figure/radar) and a
  reserved-height reel slot. Because the tile count never changes, drafting a skill (which auto-spins the
  next golfer) flips that one tile to green **in place with 0px grid jump**, and you never scroll to a
  separate scorecard. Preserved everything: the first-time "how it works" tip, the daily course-focus line +
  ★ keyhole key-skill markers, re-spin / Mulli-Spin, live OVR, and the self-heal + auto-advance to the build
  screen at 8/8. Serves both the career draft AND the daily draft (same screen). Verified in Playwright
  (412×900): idle shows 8 open placeholder tiles + Spin; spun shows 8 Take tiles; drafting fills a green tile
  and auto-spins the next golfer with **0px** grid jump; a full 8-pick draft routes to the build screen; live
  OVR climbs (62→67 mid-draft); guest + daily paths render; 0 page errors. Screenshots confirm your picks +
  the current golfer's ratings sit together in one grid on one screen. Deployed to /golf. (`buildHero`
  remains for the `scrBuild` "meet your golfer" reveal, which wasn't part of this.)

- **CS339 — the live rating web is back, now dynamic + animated + colour-graded (owner: "I liked having the
  live visual for all of the stats and the overall player rating web. Bring it back but make it way more
  dynamic with animations and colors").** CS338 dropped the radar from the draft for compactness; brought it
  back as a new `dynRadar()` — a much livelier version — on the draft, off-season, AND the build reveal.
  • **Morphs on every change:** a module `_radarPrev` remembers the last skill values, and `animateRadar()`
    rAF-tweens the polygon (+ its glow, the vertices, and the centre OVR) from the old shape to the new one
    (ease-out ~580ms) each time you draft/swap a stat — the web visibly reshapes.
  • **Colour-graded:** each spoke's vertex + axis label is coloured by that stat's strength (`ratColor`:
    90+ gold · 82+ green · 74+ teal · 66+ indigo · else grey), a warm→teal radial-gradient fill, and the
    outline + centre OVR tint to the **overall tier** colour. So the shape reads its own quality at a glance.
  • **Animated OVR count-up** in the centre (recomputed from the tweened values each frame via
    `ovrFromSkills`), a slow **rotating sheen** sweep behind it, and a **pulsing ring on the just-changed
    vertex** (the stat you drafted). Reduced-motion snaps to the final state (no sheen/pulse).
  • Layout-stable: fixed SVG viewBox, so the web never shifts the grid below it (0px jump preserved). Placed
    right under the compact hero on the draft + off-season (the redundant hero OVR line was removed since the
    radar now shows OVR big), and `buildHero()` (the "meet your golfer" reveal) was upgraded from the old flat
    teal `radarSVG` to the new one too, so the whole build flow is consistent. `_radarPrev` resets in
    `reset()` (declared `var`, not `let`, since `reset()` at load references it before its own line executes —
    a `let` would TDZ-crash the whole script; caught + fixed). Verified in Playwright: radar renders on
    draft/build/off-season; drafting morphs the polygon (points change) + counts the OVR up (62→65); vertices
    show 3+ distinct strength colours; 0px grid jump; guest + daily paths + 0 page errors; screenshot confirms
    the colourful animated web with the tier-tinted OVR centre. Deployed to /golf. (`radarSVG` is now unused
    but left in place.) Tunable: `ratColor` thresholds, the tween duration, the sheen/pulse timings.

- **CS340 — drafted pro golfer's name on its own line (owner: "fit the pro golfer's name under the stat
  after it's selected so we can fit the name instead of it being on the same line").** The CS338 filled
  draft tile crammed skill + golfer + value on one row, so the golfer name truncated ("S." / "Er…").
  Restructured the `.dfilled` tile: skill label + golfer name stack in a left column (`.dcol`) with the
  value on the right, so the full name gets its own line. Added `min-height:47px` to all `.osgrid .attr`
  so the 2-line filled tiles align with the 1-line draftable/empty tiles (uniform ~51px rows). Verified in
  Playwright: five long real names (Scottie Scheffler, Ludvig Åberg, Collin Morikawa, Jon Rahm, Xander
  Schauffele) all render untruncated on their own line, all tiles uniform height, 0 page errors. CSS/markup
  only. Deployed to /golf.

- **CS341 — off-season wheel/UX polish (owner IMG_8188, off-season screen: "swap the sizes of the white
  numbers and colored numbers so the colored numbers are slightly bigger · make the wheel a little larger so
  it's more noticeable · make the text more apparent within it before the wheel is spun · make it more
  apparent that spinning is a risk and optional and you must lock in a choice if you choose to spin · make
  the wheel spin animation look more like a wheel spin and less like names shuffling through").** Five
  changes, all in the shared off-season/draft reel (`.osreel`) + `reveal()`:
  1. **Slot-machine wheel spin (the headline).** Replaced the old in-place name FLICKER (`.spinning .name{
     animation:flick}`) with a real vertical reel: new `slotSpin(el, finalName, done)` builds a strip of 24
     random golfer names + the drawn golfer, clips the `.name` to a 34px overflow-hidden viewport
     (`.name.slotting` — `animation:none!important` to kill the flick), and scrolls the strip
     `translateY(0 → -(rows-1)*34px)` over 1.25s with `cubic-bezier(.13,.72,.14,1)` so it rips fast then
     decelerates to a stop on the drawn name — unmistakably a wheel spin, not names shuffling. `transitionend`
     + a 1600ms safety net fire the completion (which sets `S.current`, renders, rarity-flashes, and
     `offPersistSpin`s). Reduced-motion / no-reel paths skip straight to the result. New `.slotstrip`/
     `.slotrow` CSS.
  2. **Bigger, more-noticeable wheel.** `.osreel` height 62→**88px**, radius 14→16, a 1.5px gold-tinted border
     + a soft `0 0 20px rgba(235,166,31,.12)` glow so it invites a spin.
  3. **Idle text more apparent.** The pre-spin `.name` (`.osreel:not(.landed):not(.spinning) .name`) 14→**18px**
     and brighter (muted → `#e9f1eb`).
  4. **Number-size swap.** In the off-season swap tile, the COLORED new value (`.osnew`) 13.5→**16px** and the
     WHITE current value (`.attr.osswap .val`) 16→**14px**, so the colored new value is slightly bigger.
  5. **Risk/optional/lock-in messaging (off-season only, NOT the career draft where spinning is required).**
     The idle grid hint now reads "⚠ Spinning is optional and a **risk** — you can start the season as-is. If
     you spin, you **must lock in** whatever you land on, even if it's worse.", the reel sub reads "Optional ·
     spin at your own risk", and the Spin button is "Spin the Wheel · Optional" with the sub "… a risk — you
     must lock in whatever you land on".
  Verified in Playwright (cs341): reel height 88, idle name 18px, risk copy present on hint+sub+button;
  mid-spin the `.name.slotting` is a 34px overflow-hidden viewport with a 25-row strip carrying a live
  transform (scrolling), rows measured scrolling up + decelerating; on land `S.current` set / spinning false /
  the osswap tile shows val 14px < osnew 16px (colored bigger); node --check clean; 0 page errors (only
  sandbox-blocked external fonts/Supabase/ads). Screenshots confirm the vertical wheel spin + the enlarged
  glowing reel. Deployed to /golf. Tunable: the `slotSpin` row count / duration / easing, `.osreel` height +
  glow, the `.osnew`/`.osswap .val` sizes.
  - **CS341b — center the OVR number in the rating-web circle (owner: "the 89 in the middle of the rating
    web is off center in the circle, shift it down").** In `dynRadar`, the `.dr-ovr` number's SVG baseline
    was `RAD_CY-2` (122) — since an SVG `<text>` y is the BASELINE, a 27px digit's visual center landed
    ~112, well above the circle center (124), so it read high. Moved the number baseline to `RAD_CY+5` (129)
    and nudged the "OVR" caption `RAD_CY+14→+16` (140) to keep spacing, so the number now sits centered in
    the dark circle. Screenshot-confirmed; deployed to /golf.

- **CS342 — new unified-grid draft style applied to ALL online modes (owner: "make sure this new draft
  style is applied to all online modes").** The online head-to-head draft (`scrH2HDraft`, shared by 1v1 /
  Best Ball / Scramble / Free-for-All) still used the OLD layout — a two-column `.cols` with a plain
  text-flicker `.reel`, a bare `.attrs` grid, and a separate `.card-grid` scorecard — while the career +
  off-season drafts had been rebuilt (CS338/339/341) into the compact single-screen style. Ported that
  style over:
  - **Generalized `dynRadar(slots)`** to take an optional skills source (defaults to `S.slots`), so the
    online build drives the same live animated rating web via `dynRadar(S.h2h.slots)`.
  - **`h2hReveal()` now uses the CS341 `slotSpin()`** slot-machine reel (querying `.osreel .name`) instead
    of the old `reel.textContent` flicker — so the online wheel spins/decelerates like everywhere else; a
    fresh morph baseline is set (`_radarPrev=null`) in `h2hBeginDraft`.
  - **`scrH2HDraft` rebuilt** to mirror `scrDraft`: compact `.oshero` (avatar + name + fill pips + re-spin
    budget) → `dynRadar(S.h2h.slots)` → reserved `.osreel` slot-machine wheel → ONE always-present 8-tile
    `.osgrid` (filled = your pick with the golfer's name on its own line via `.dfilled`/`.dcol`/`.dwho`;
    open+spun = a `.dtake` tile with a Take chip + rating bar; open+idle = `.dempty` placeholder) →
    `.osactions` (Spin / Re-spin / "Lock in my golfer ▸"). Because the tile count never changes, drafting a
    skill (which auto-spins the next golfer) flips a tile in place with no layout jump — same as the career
    draft. Kept the online teal tag (now `live`), the Team badge for team modes, and the Scramble
    "best of each skill" hint.
  Verified in Playwright across all four modes (1v1 / Best Ball / Scramble / Free-for-All): the compact hero
  + dynamic radar + 88px slot-machine reel + 8-tile grid + Spin all render, the old `.reel`/`.card-grid` are
  gone, mid-spin shows the 25-row slotting strip, landing shows 8 draftable tiles, drafting a skill fills a
  `.dfilled` tile with the golfer name (`.dwho`) on its own line and auto-spins the next, the Team badge +
  Scramble hint show correctly, and 0 page errors. Screenshot confirms the online draft is now visually
  identical to the career/off-season draft. Deployed to /golf.

- **CS343 — accessories are now selectable in the Create-your-golfer screen (owner IMG_8186: "there is no
  way to select accessories in this menu, improve the selection process and make the UI/UX pristine").** The
  setup Kit section only had cap on/off + color/pattern rows — the equippable accessories (eyewear, glove,
  headwear, shoes-gear, driver, putter, ball, charm, which live in `look.acc` and drive the dressable
  avatar) could ONLY be equipped in the Pro Shop, so a player who owned gear had no way to change it while
  building their golfer. Added an **Accessories** section to `scrSetup` (signed-in only, consistent with the
  CS319 "show only what you own + one Pro Shop link" philosophy):
  - New `accSelectRow(slot)` renders a row per accessory slot that has ≥1 OWNED item — a "None" chip + a chip
    per owned item (its `ic()` slot icon + name), the equipped one highlighted gold; tap to equip
    (`accEquip`) or None to unequip (`accUnequip`), re-rendering the avatar live. `ownedAccIn(slot)` gathers
    owned catalog + milestone items for the slot; `anyGearLocked()` drives the shop link.
  - Wired into setup after the Kit rows: an "Accessories" header + one row per owned slot, and the existing
    Pro Shop link now shows when cosmetics OR gear are locked (so there's always a path to buy more).
  - New `.accchips`/`.accchip`/`.acci` CSS matching the color/pattern chip style (pill, gold-selected,
    hover).
  Verified in Playwright (signed-in, owning gear across 6 slots): the Accessories section renders one chip
  row per owned slot, the eyewear row shows None + both owned shades, tapping Sport Shades sets
  `look.acc.eyes` and highlights the chip, None unequips, the Pro Shop link shows, 0 page errors; screenshot
  confirms the pristine chip rows with the avatar wearing the equipped Sport Shades + Rain Glove + Titanium
  Driver. Deployed to /golf. (A brand-new account owning no gear sees no Accessories section, just the Pro
  Shop link — same as the cosmetics rows.)

- **CS344 — live accessory-boost summary on the setup screen (owner: "it should tell you your live
  accessory boost so you know what stats are getting boosted by accessories before you start your
  draft").** Added `accBoostSummaryNode()` at the top of the CS343 Accessories section: a teal card showing
  the CLAMPED effective boost your equipped gear gives (`accBoost()` — the exact map `buildPlayer` bakes
  into your career/daily golfer), as "+N total" plus a green mono chip per boosted stat in CATS order
  (e.g. "+1 Driving Distance · +1 Approach · +1 Putting · +1 Composure"). It re-computes on every equip/
  unequip (render), so it's live; with nothing boosting it shows "No stat boost equipped — pick accessories
  below to boost your golfer." New `.accboost`/`.boostchips`/`.boostchip` CSS. Verified in Playwright:
  equipping 2 items shows +2 total with the right two chips, adding a driver updates it to +3 live with a
  Driving Distance chip, unequipping all shows the no-boost message, chips render in CATS order, 0 page
  errors; screenshot confirms the boost card above the accessory rows. Deployed to /golf.

- **CS345 — make it clear accessories are fixed-color (owner: "accessories like hats aren't able to change
  colors — either make them change colors or make it clear that they can't").** The shop accessories
  (headwear, eyewear, clubs, ball, charm) are fixed-color product art (unlike the recolorable shirt /
  trousers / shoes / basic cap), and recoloring each would need per-item masks/art. Took the "make it
  clear" route: (1) a muted note in the Accessories section — "Each accessory has one fixed color & style —
  swap the item for a different look. (Your shirt, trousers, shoes & basic cap are recolorable above.)"; and
  (2) the confusing case specifically — when a HEADWEAR accessory is equipped, the recolorable basic cap
  (+ its Hat color picker + Cap toggle) is hidden behind it, so `headwearNote()` renders under the Cap
  toggle: "🧢 You're wearing the {item} accessory — its color is fixed. The cap toggle & hat color below
  only style the basic cap hidden underneath it (set Headwear → None in Accessories to show it)." Verified
  in Playwright (rendered `#app` DOM): the fixed-color note always shows in the Accessories section, the
  headwear note shows ONLY when a headwear accessory is equipped (naming it) and is absent otherwise, 0 page
  errors. Deployed to /golf.

- **CS346 — richer link-preview (OG) graphic that shows the game (owner IMG_8190: "the graphic shared with
  runthe.gg/golf is bland and doesn't draw an audience — incorporate game elements so people know exactly
  what it is: a game where you draft skills from pro golfers and try to become the greatest of all time").**
  The old `og.png` was just the wordmark + "Build a golfer. Run a pro season." tagline. Redesigned it to
  show the actual game loop: **draft skills from real pros → build one golfer → chase G.O.A.T. status.**
  Built a self-contained 1200×630 HTML source (`build-a-golfer/og-source.html`) and rendered it to
  `og.png` via Playwright: RUN THE TOUR crest/wordmark + gold rule up top; a big "DRAFT THE PROS. / BECOME
  THE G.O.A.T." headline (cream + gold) over a sub that names the hook ("Take Tiger's putting, Rory's
  driver, Scottie's approach — one skill from each — into one golfer, then live a 30-year career…"); and
  the marquee visual — three pro "draft cards" (Rory · Driver 98 / Scottie · Approach 97 / Tiger · Putting
  99) → an arrow → the built golfer as a teal radar with a gold **OVR 99** badge + a trophy + "YOUR
  LEGEND"; a footer of SPIN · DRAFT · WIN MAJORS pills + "runthe.gg/golf · Play free". Deep-green/gold
  brand, course-silhouette backdrop, vignette, gold frame. Also rewrote the OG/Twitter **title**
  ("Run The Tour — Draft the Pros, Become the G.O.A.T.") and **description** to lead with the same
  draft-a-skill-from-each-pro hook, and appended `?v=2` to the `og:image`/`twitter:image` URLs to encourage
  platforms to re-scrape (they cache OG images hard by URL). Rendered/verified at 1200×630, deployed
  `golf/og.png` + `golf/index.html` to main. NOTE: iMessage/Twitter/Facebook cache previews aggressively —
  the old card can linger until the platform re-scrapes (Twitter: card-validator; iMessage: often a fresh
  thread or time); the `?v=2` helps new scrapes pick it up. Regenerate anytime from `og-source.html`.

- **CS347 — remove ALL em dashes, everywhere, game + graphics (owner: "make sure there are no em dashes
  ANYWHERE. In the game and in graphics").** A prior pass (CS-era) cleared em dashes from visible COPY but
  deliberately left them in code comments; many also crept back into copy across CS200+ features, and CS346
  just added several to the OG graphic + meta. Cleared every one. First confirmed no em dash is used in a
  code-semantic way (regex/split/char-class) — every "—" in the file is in a string, comment, or HTML text,
  so replacing them can't break JS. Then a string-literal-aware Python pass (tracks `//`, `/* */`, `<!-- -->`,
  and `'…'`/`"…"`/`` `…` `` boundaries) rewrote each: **visible sentence dashes → comma** (space-absorbing,
  reads naturally: "Spin the wheel, then tap a slot"), **isolated glyph dashes** (e.g. `<span>—</span>`
  empty-value placeholders, `'—'`) **→ hyphen**, and **comment dashes → hyphen** (invisible). 325 comment +
  3 glyph + 160 sentence replacements → **0 em dashes** in `build-a-golfer.html`. The OG **meta** title/desc
  were hand-rewritten (colon title "Run The Tour: Draft the Pros, Become the G.O.A.T.", parenthetical
  description) and the **OG graphic** (`og-source.html`) sub reworded ("One skill from each pro: Tiger's
  putting, Rory's driver, Scottie's approach. Build one golfer…") and `og.png` re-rendered (bumped image
  cache-bust to `?v=3`). Verified: `node --check` clean; Playwright rendered title / rules / setup / draft /
  off-season / daily-preview / menu / shop / challenges with **0 em dashes in the visible DOM on every
  screen**, meta has none, 0 page errors; the two "artifact" patterns found (`, ...` spreads and a
  `[,,vw,vh]` destructure) are pre-existing legit code, not introduced. Deployed `golf/index.html` +
  `golf/og.png` to main. (En dashes in score displays like "9–5" are intentionally left; only em dashes were
  targeted.)

- **CS348 — "course look" OG graphic variant (revamped) (owner: "let's try the course look you mentioned").** After the
  CS346 dark-green card OG, offered a "lighter course look" alternate; owner chose it. Built a second source
  (`og-source-b.html`): an illustrated golden-hour golf course fills the frame (warm sky + soft sun glow,
  rolling green hills, a putting green with a gold flag, a fairway sweep, and a distant golfer silhouette
  celebrating by the green), with a left-side legibility scrim so the copy stays crisp over the brighter
  scene. Keeps all the game elements: RUN THE TOUR crest/wordmark, "DRAFT THE PROS. / BECOME THE G.O.A.T.",
  the same draft hook sub, a compact one-row draft strip (Tiger 99 · Rory 98 · Scottie 97 → OVR 99 badge),
  and the SPIN · DRAFT · WIN MAJORS + runthe.gg/golf footer. Em-dash-free. Rendered it to the live `og.png`
  (bumped cache-bust `?v=4`) and deployed `golf/og.png` + `golf/index.html` to main. The CS346 card-look
  source (`og-source.html`) is kept committed, so reverting to it is a one-line re-render if preferred. NOTE:
  X/iMessage/Facebook cache previews hard — the `?v=4` bump encourages a re-scrape for new shares; existing
  shares may lag until the platform re-fetches.

- **CS349 — fix: completed Daily Challenge scores silently never reached the leaderboard.** Owner: "I
  completed the daily challenge but my score is not on the leaderboard." Root cause: a regression from
  CS171. `sbSubmitDaily` ALWAYS passed `p_is_spotlight` (and `p_is_legend`) to `runtour_submit_daily`. If the
  Spotlight migration `supabase/45` was never applied, the server function has no `p_is_spotlight` parameter,
  so PostgREST can't resolve the overload and the call fails ("Could not find the function…"). The catch
  block then, for a NORMAL daily (`!isLegend`), just logged and `return`ed WITHOUT retrying (the
  retry-without-flags path only ran for legend rounds) — so every plain daily submission has failed silently
  since CS171, and nothing reached the board. Fix: build the RPC args from the 24-era base signature and only
  add `p_is_legend`/`p_is_spotlight` when they're actually TRUE, so a plain daily calls the base signature
  that matches EVERY deployed version (24/30/45) and posts whether or not 45 is applied; legend keeps its flag
  (needs 30, applied), spotlight keeps its flag (needs 45). Kept an explicit `{error}` check + a last-resort
  bare-signature retry for plain dailies. Also added a **self-heal** on the daily result screen: for a
  signed-in, non-practice, non-legend result it re-posts the stored best-of-day ONCE per view
  (`S._dailyResub`, reset each `beginDailyRound`) — since `runtour_submit_daily` is an idempotent keep-the-
  lower upsert, this safely gets an already-completed-but-never-posted score onto the board next time the
  player opens the daily result. Verified in Playwright with a mock where passing `p_is_spotlight` errors
  (45 missing): a plain daily now posts via the base signature (never passes the spotlight flag), a legend
  round still passes `p_is_legend`, and the result-screen self-heal re-submits exactly once (not on every
  re-render); 0 page errors. Deployed to /golf. NOTE for owner: this makes plain dailies work regardless of
  45; to get the separate **Monthly Spotlight** board/records, still run `supabase/45_runtour_spotlight.sql`.
  Also note the daily board lives under **Course Records → Today**, not the main season/career Leaderboard.

- **CS350 — fix: "sim to the end of a season → view results" crashed with `summary: undefined is not an
  object (evaluating 'S.career.seasons.push')`.** Owner: "This keeps coming up after I sim to the end of a
  season and try to see the results" (IMG_8230, the render-error safety-net card). Root cause: the
  season-summary record block initialized the career object with `S.career=S.career||{money:0,...,seasons:
  [],winsList:[]}` — which only adds `seasons`/`winsList` when `S.career` is ENTIRELY undefined. But by the
  time that line runs, `S.career` is almost always already a truthy bare object: the CS226 confidence-carry
  right above it (`careerStory().confidence=...`) calls `careerStory()`, which does `S.career=S.career||{}`
  (and so do `ensureSponsors()`/`careerFx()`/`careerArcs()` for any mid-season sponsor/dilemma/press beat).
  So the `||{...}` NO-OPPED, `S.career` had no `seasons`/`winsList` arrays, and `S.career.winsList.push`
  (line ~10578) / `S.career.seasons.push` (line ~10585) threw. Hit reliably on a fresh YEAR-1 season (where
  `S.career` starts undefined, then the confidence-carry creates it bare) and on any career where a
  subsystem touched `S.career` before season-end. Fix: replaced the `||{…}` with a defensive per-FIELD init
  — `S.career=S.career||{}` then a loop that fills each of money/net/wins/majors/top10/best/seasons/winsList
  only when it's `null`/missing, so the required arrays always exist WITHOUT clobbering values already set by
  a resumed/in-progress career. Verified in Playwright by driving a real fresh year-1 career (fill the
  8-skill bag → `startSeason(false)` → `skipToEnd()` → `finishSeasonHeadless()` → summary): confirmed
  `careerStory()` creates `S.career` with no `seasons` (the trap), then the summary renders with
  `S.career.seasons.length===1`, `winsList` an array, `S.recorded===true`, and NO "SOMETHING WENT WRONG"
  card; a second test pre-creating `S.career={sponsors,fx,arcs}` (mid-season subsystem path) also reaches
  the summary cleanly (`seasonsLen:1`, no error card). 0 page errors (only sandbox-blocked
  Supabase/fonts/ads). Deployed to /golf.

- **CS351 — start UNSPONSORED + a brand wanting to sign you is now a MOMENT (owner: "I just finished my
  first season and it's saying I already have a signed sponsor but I never chose one. Make this more
  realistic and a bigger moment when brands want to sign you").** Root cause: `ensureSponsors()` auto-seeded
  a Regional SHIRT deal (`c.sponsors.shirt={brand:sponsorPick(0,…)}`) for every brand-new career, so a rookie
  "already had" a sponsor they never chose (the screenshot's "Birchwood · Yr 2 · Loyalty Lv 1"). Two fixes:
  1. **Unsponsored start.** Removed the auto-seed — a brand-new career now begins with BOTH slots open
     (`{hat:null, shirt:null}`); nobody has signed you yet, you earn and CHOOSE your first deal. Kept the
     legacy migration (a saved single `c.sponsor`/in-progress `c.lastContract` still lands in the shirt slot),
     so existing careers aren't stripped. Everything downstream already handles empty slots (`makeContracts`
     returns early when none filled; `sponsorStripNode`/`slotStatusCardHTML` show "open"; the avatar only
     paints a logo for a filled slot), verified.
  2. **The offer is a full-screen MOMENT.** New `sponsorOfferPopup()` — a `.momentov` set-piece (same pattern
     as the Moment/press/dilemma overlays) that greets you in the off-season when a brand is interested:
     a kicker (**YOUR FIRST DEAL** for your first-ever sponsor / **A BIGGER BRAND CALLS** for a tier-up /
     **A RIVAL COMES CALLING** for a poach / **A BRAND WANTS YOU**), a headline, the brand's logo + tier ·
     trait + tagline + signing bonus, **Sign as Hat / Sign as Shirt** (or Replace) buttons, and a
     **Decide later ▸** dismissal; the first-ever deal fires confetti. Signing routes through the existing
     `signSponsor(offer, slot)` (pays the signing bonus, resets loyalty, saves). `maybeSponsorMoment()` fires
     it once per off-season (guarded by `S.career._sponsorMomentYear`, persisted so a refresh won't replay it)
     from the tail of `scrOffseason`, so it covers both `continueFranchise` and resume. Dismissing leaves the
     same offer in the inline `sponsorDecisionNode` card — nothing is lost. Since offers only arise for an
     open slot / genuine tier-up / a ~50%-of-years poach at your ceiling, the moment is naturally bounded
     (not every year), and it's at the off-season decision point (never interrupts a live sim, so it doesn't
     touch the in-season pop-up budget).
  Verified in Playwright: a fresh career is unsponsored (both slots null, `firstEver:true`); a real simmed
  year-1 season → off-season fires the "YOUR FIRST DEAL" popup with sign + decide-later buttons and sets the
  once-per-off-season flag; signing as Shirt fills that slot with the offered brand + pending signing bonus +
  removes the overlay; a re-render does NOT replay the moment; and a legacy career with an existing sponsor
  is kept intact (non-destructive). 0 page errors. Screenshot confirms the set-piece with both slots reading
  "Open slot" behind it. Deployed to /golf. NOTE: this cleans up NEW careers; an in-progress career that was
  already auto-seeded keeps its current deal (removing it retroactively would be indistinguishable from a
  deal the player actually signed, so it's left intact) — start a fresh career for the unsponsored-start
  experience. Tunable: the kicker/copy + confetti in `sponsorOfferPopup`, the once-per-off-season gate.

- **CS352 — fewer in-season pop-ups (owner: "reduce the amount of pop ups each year, it's too much").**
  The in-season interruption system (career dilemmas + story arcs + press conferences + play-the-final-round
  Moments) shares one `SEASON_STOP_BUDGET`; CS326 had already trimmed it 6→4, but the owner still found ~4/
  year too much. Halved the load by cutting the budget + every sub-cap: `SEASON_STOP_BUDGET` 4→**2**,
  `STORY_PER_SEASON` 2→**1**, `MOMENT_PER_SEASON` 2→**1**, `DILEMMA_PER_SEASON` 3→**1**. The CS295 "one
  guaranteed interview per season" still fires (it bypasses the budget CHECK but consumes one budget slot),
  so a typical season is now **1 guaranteed interview + at most 1 situational Moment/dilemma = ≤2 in-season
  pop-ups** (was up to 4). All the spacing guards are unchanged (CS327 no-back-to-back, `STORY_GAP`, the
  ~60/40 dilemma-vs-presser split, the ≤1 grudge/season cap). Pure constant change — no mechanism/state
  change. NOT touched: the off-season sponsor moment (CS351, once/year only when a brand is actually
  interested), and the selection announcements for the playoffs / The Games / team cups (event-gated to
  genuine achievements, and timed bottom pop-ups under Auto Sim) — those aren't part of the per-event
  interruption budget. Verified in Playwright: the new constants load; exercising the REAL gate + increment
  functions across a season confirms the guaranteed storyline fires (stops→1), a 2nd storyline is blocked, a
  dilemma fills the last slot (stops→2 = budget), and once the budget is spent every further pop-up
  (storyline + the Moment gate) is closed off with `S.season.stops` never exceeding the budget; a real
  career season still sims to the summary cleanly. 0 page errors. Deployed to /golf. Tunable: the four caps
  at the `SEASON_STOP_BUDGET`/`STORY_PER_SEASON`/`MOMENT_PER_SEASON`/`DILEMMA_PER_SEASON` consts — drop the
  budget to 1 for exactly one guaranteed interview/year and nothing else.

- **CS353 — retro CODE-DRAWN pixel golfer + lean career-only creation (owner: character creation "way too
  overwhelming, takes too much time, looks like AI"; wants a "real retro video game style creation page that
  is code based and not image based"; creation should be "career mode only, other modes just your name").**
  Replaced the AI-generated full-body PNG avatar (masks + composited accessory art) with a hand-authored,
  palette-swappable **pixel golfer** drawn entirely in code. Owner picks (AskUserQuestion): keep **Essentials
  + country** in creation; **keep shop COLORS, drop worn gear**. Then mid-build (screenshot feedback): "look
  at real pros — polo, pants, golf hat/visor — not enough detail; we don't need eyes."
  • **The sprite** (`PXG_BODY`/`PXG_HAIR`/`PXG_CAP`/`PXG_VISOR`, 24×30, chars→palette): a golf-authentic
    golfer — **polo with a collar + placket shading**, **belt with buckle**, full-length **slacks**, golf
    shoes, a club, **no eyes** (clean face), and a choice of **golf cap or visor** (or none). 5 hair styles
    (short/swoop/curly/long/buzz). Colors come from the SAME resolver the old avatar used (`avLook` →
    skin/hair/shirt/hat/pants/shoe hex), so **every Pro Shop COLOR unlock still shows**; patterns + worn
    accessory gear are dropped (don't translate to pixel art). Rendered once to a cached `toDataURL` `<img>`,
    crisp via `image-rendering:pixelated`. New `pxGolferURL`/`pxAvatarHTML`; `avatarHTML`/`avatarFullHTML`/
    `avatarShowHTML` all now return it, so the pixel golfer shows EVERYWHERE the avatar appears (setup, build
    "meet your golfer", off-season/draft heroes, Trophy Room, career banner, Pro Shop dressing room) — the AI
    PNG pipeline (`paintAvatarFull`/masks/`AV_*`) is left defined but unused. Iterated the sprite visually in
    a standalone preview (render→screenshot→fix) before wiring it in.
  • **Lean retro creator** (`scrSetup` rebuilt): a gold-framed "▸ CREATE YOUR GOLFER" panel with the pixel
    golfer on a grid "arcade" stage, then a short list — Name · Skin · Hair color · Hair style (chips) · Shirt
    color · Headwear (None/Cap/Visor chips) · Hat color · Country — and a sticky Back/Build bar. **Cut** from
    creation (was the overwhelm): gender, handedness, caddie, trousers/shoes colors, patterns, worn
    accessories (kit colors are still managed in the Pro Shop; caddie/etc. weren't visual). New `hairStyle`/
    `hatStyle` look fields (+ in `DEFLOOK`, cap on by default), saved/synced via the existing `bag_look` cloud
    path; old saves default cleanly.
  • **Creation is CAREER-ONLY.** The Daily's "Build your golfer" previously routed to `scrSetup`; it now goes
    straight to the draft (`S.screen='draft'`) using your existing saved name/look — "other modes just use
    your name." (H2H already skipped creation; season/spotlight too.) Renamed the daily button "Draft your
    golfer ▸".
  • **Pro Shop = colors only.** Dropped the **Pattern** category and the whole **Equipment** (worn-gear)
    section — the shop now sells only Shirt/Hat/Trousers/Shoes COLORS (all of which the pixel golfer renders);
    "My Items" no longer lists gear. The dressing-room preview is the pixel golfer with live color previews.
  • **Freed the 6 basic shirt/hat colors** (`FREE_COSMETICS`) so the creator always offers a shirt + hat
    color pick out of the box (restores the CS192 "basics free" intent; premium/lore colors stay Pro-Shop
    unlocks).
  Verified in Playwright: the retro creator renders the pixel golfer + the lean picks (no gender/accessories/
  caddie), the pixel avatar appears on build/draft/off-season/Trophy Room/shop, cap/visor/none produce
  distinct sprites, guest creation is appearance-only + the sign-in lock, the Daily's Draft button goes to
  `draft` (NOT setup), the shop shows Apparel colors only (no Pattern/Equipment) with a working pixel
  preview, and a full render sweep is clean — **0 page errors** throughout. Screenshots confirm a polished,
  golf-authentic retro golfer (polo collar, belt, slacks, cap AND visor variants). Deployed to /golf. Tunable:
  the `PXG_*` sprite maps + `HAIRSTYLES`, the creator fields in `scrSetup`. NOTE: the old AI-avatar code +
  base/mask PNG assets are now dead but left in place (removing them is a separate cleanup); the deploy is
  the single HTML file (no new assets needed — the golfer is pure code).
  - **CS353b — higher-resolution sprite (owner: "reduce the pixel size so it's not so blobby, a little more
    detail and resolution").** Nearly doubled the grid **24×30 → 44×56** and re-authored the golfer with real
    detail: a rounded head, a polo with a **collar + buttoned placket**, **short sleeves with visible skin
    forearms**, a belt with a **buckle**, tapered **slacks** with a center seam, golf shoes with a sole, a
    **dome+brim golf cap** and a thin-band **visor**, and 5 fuller hair styles. Composed the sprite in a
    Python shape-primitive builder with an **automatic 1px outline pass** (crisp pixel-art edges) and iterated
    visually before porting the char-maps in. Only the `PXG_*` constants + the shadow/px in `pxGolferURL`
    changed — renderer, palette resolver, creator, and every call site unchanged, so all CS353 behavior/tests
    still hold. Verified in Playwright (setup/build render the detailed golfer, cap/visor/none distinct, 0
    page errors); screenshots confirm the finer, less-blobby look. Deployed to /golf.
  - **CS353c — no black outline + forward-facing cap + hair/hat integration (owner: "not a fan of the black
    outline, and how the hat is going sideways; enhance the hair and hat and how they work together").**
    Dropped the harsh auto-outline entirely — the golfer now reads via soft **self-shading** (a darker shirt
    edge, a jaw/neck shadow, forearm + inner-leg shade, shoe soles) instead of a black border (added skin- and
    pants-shade palette entries `j`/`q`). Redesigned the **cap to face FORWARD** — a rounded crown that sits on
    the head + a short centered **bill pointing at the viewer** (it was a sideways brim before) — and the
    **visor** to match (forehead band + forward brim, open crown). Re-authored all 5 hair styles with proper
    **sideburns/temples that peek out below the cap**, so hair + hat sit together naturally (and fuller hair
    when hatless). Sprite-only change (`PXG_*` maps + 2 palette entries); renderer/creator/call sites
    unchanged. Verified in Playwright (setup/build render, cap/visor/none distinct, 0 page errors); screenshots
    confirm the clean outline-free look and forward cap. Deployed to /golf.
  - **CS353d — subtle two-tone shading on every region (owner: "love the shading on the shirt; add very
    subtle color variation to the hair… and the face and arms and shoes and pants").** Extended the shirt's
    base+shade approach to the rest of the golfer with gentle self-shading/highlights (7 new palette entries,
    all derived from the region's own color so they follow every recolor): **hair** gets a darker bottom
    fringe + shadow side and a subtle top sheen (auto rim-shader over each style); the **face + forearms** are
    lit-left / shadowed-right (skin highlight + jaw/neck shadow); **shoes** get a toe shade + top highlight;
    **pants** get a front-leg highlight down each leg + inner-leg shade. Kept very subtle (small deltas, edge
    pixels only). Sprite/palette-only change; renderer/creator untouched. Verified in Playwright (setup/build
    render, cap/visor/none distinct, 0 page errors); screenshots confirm the added depth. Deployed to /golf.
  - **CS353e — proper driver head (owner: "enhance the shape of the driver in the player's hand").** The club
    was a 4px square; redrew it as a real **driver**: a silver shaft with a grip, down to a **bulbous rounded
    head** (dark titanium `G`) with a crown highlight (`H`), a light face insert (`F`) and a sole-shadow line,
    resting near the turf. Also made the **belt buckle gold** (`g` `#9a9ea6`→`#c99a2a`, now that `g` maps only
    to the buckle since the driver head uses its own `G`). Sprite/palette-only. Verified in Playwright (0 page
    errors); screenshot confirms the driver + gold buckle. Deployed to /golf.

- **CS354 — distinctive bright lemon-gold gradient theme (owner: "the gold we use everywhere reads as AI, a
  very generic gold used in many AI projects. Could we do a gradient gold so our theme is unique and stands
  out?").** Showed the owner 5 hue directions (champagne brass / antique amber-bronze / copper rose-gold /
  olive green-gold / bright lemon-gold) mocked up on the wordmark + button + card; owner picked **bright
  lemon-gold** and asked to "up the scale of the gradient so it's not as harsh of lines." Replaced the flat
  generic `#EBA61F` gold on the marquee surfaces with a smooth bright lemon-gold foil. Added two theme tokens
  to `:root`: `--gold-grad` (a **9-stop** vertical foil with small deltas between adjacent stops so there are
  no hard band lines — reads as brushed metal) and `--gold-grad-d` (an angled 8-stop variant for fills), and
  set the base tokens `--gold` `#EBA61F`→`#F1D04A` / `--gold2` `#c79320`→`#c9a520` (brighter lemon) so the
  flat-gold used on small chips/labels everywhere shifts to the new hue too. Applied
  the gradient via the text-clip technique (`background:var(--gold-grad); -webkit-background-clip:text;
  background-clip:text; -webkit-text-fill-color:transparent; color:transparent`) to the highest-impact gold
  TEXT surfaces: the wordmark **"TOUR"** (`.wordmark .b`), the title-screen hero **"LIVE YOUR LEGACY."**
  (`.hero .hr2`), and the retro creator title **"CREATE YOUR GOLFER"** (`.retro-title`). Upgraded the two
  marquee gold FILLS: the primary **`.btn.goldfill`** ("BUILD YOUR GOLFER" / "Build" CTAs) to the richer
  `--gold-grad-d` foil, and the gold **`.gc-gold`** mode card (Career Mode) to a 5-stop metallic gradient
  background (was a flat 3-stop). Deliberately scoped to the marquee surfaces — the many small
  `color:var(--gold)` chips/labels keep the (now slightly richer) flat token for readability at small sizes;
  gradient text is reserved for the big brand moments. Verified in Playwright (title + retro setup): the
  wordmark/hero/retro-title all compute `background-clip:text` with transparent fill, the goldfill button +
  gold card carry the gradient, and readability holds on the dark-green background; 0 page errors.
  Screenshots confirm the smooth lemon-gold foil (no harsh bands) on the TOUR wordmark, the hero, the Career
  Mode card, and the primary button — a distinctive, non-generic gold. Deployed to /golf. Tunable: the
  `--gold-grad`/`--gold-grad-d` stops + `--gold`/`--gold2` hue in `:root`.
  - **CS354b — swept the remaining HARDCODED old-gold traces (owner: "there are still old traces of the
    generic gold" — the streak pill, the HOW TO PLAY / DAILY QUESTS pill borders, the Continue-Career
    `.resumecard`).** Many surfaces used the old `#EBA61F` gold directly (bypassing the token): 144
    `rgba(235,166,31,…)` tint/border/glow/shadow values → `rgba(241,208,74,…)`; 32 `#EBA61F` → `#F1D04A`;
    `--hgold` `#cda24a` → `#d3bd53` (muted lemon, drives the wordmark underline + dividers/rules); and the
    old gold gradient stops `#f9d271`/`#e9a81e`/`#c98f12` → lemon equivalents. The two hardcoded amber FILL
    cards — `.resumecard` (Continue Career) and `.gc-gold` (Career Mode) — now use `var(--gold-grad-d)` so
    they follow the token. Verified: 0 old-gold hex/rgba traces left in the file, JS valid, title renders
    with every pill/card/label on the lemon hue, 0 page errors. Deployed to /golf.

- **CS355 — the created pixel golfer SWINGS in TourTracer (owner: "could we implement the created golfers
  into the tourtracer sim? mini versions of them playing that the user watches?").** Ties character
  creation into the core gameplay loop. Authored a compact side-view mini-golfer (24×30) in **3 swing
  frames** (address / top-of-backswing / follow-through) via a Python primitive composer with a 1px dark
  outline (`#1c241b`) so the tiny figure reads on the busy green course; palette-swapped from the SAME
  `avLook` resolution the menu avatar uses (skin/hair/shirt/hat/pants/shoe), so the golfer wears the
  player's exact colors. `pxSwing3URL(look)` renders the 3 frames to cached data-URLs (chars: skin/hair/
  cap/shirt/pants/shoe/club-shaft/club-head + outline `k` + ball `w`). `hvSwingMarkup(g,p,look)` places it
  at each full-shot origin (tee/app/adv), mirror-flipped to face the target, **clamped inside the shot's
  camera frame** (`hvCamFor2`) so tee shots at the very bottom edge aren't cut off (botPad clears the
  floating desc/scoreboard). 3 stacked `<image>` cross-fade address→top→through via CSS keyframes
  (`hvswA/B/C`, ~1.15s, impact ~34%), then fade out. In `hvKick` a `swingMs=390` launch delay holds the
  ball at address while the golfer swings, so the **ball leaves at impact** (the whole fly timeline shifts
  by `swingMs` via `elF`). Gated to single-ball (`!small`), so the Daily / Moments / Spotlight / Legend
  rounds get it and **H2H multi-ball does NOT** (each competitor as their own golfer is a planned
  follow-up). Behind a `HV_SWING` flag; reduced-motion hides it (CSS `display:none`); the deterministic
  `dSimHole` score + shot geometry are untouched (presentation only). Verified in Playwright: sprite
  renders 3 data-URLs; the golfer appears live at the tee (now fully in frame) AND mid-fairway approach,
  plays address→through→fade; a full auto round completes to `dailyresult` with 0 page errors; reduced-
  motion hides the golfer and the round still completes; H2H small-ball excluded by construction.
  Screenshots (approach + tee + zoom) confirm a recognizable little golfer in the player's colors swinging
  at the ball with the tracer launching. Deployed to /golf. FOLLOW-UPS (owner queue): birdie/bogey/win
  reaction poses, and rolling it out to H2H (each ball's own created golfer) + career Moments framing.
  Tunable: `HV_SWING` flag, `GH` (sprite size), `swingMs`, the `PXS_A/B/C` frames + `hvsw*` keyframe timing.
  - **CS355b — smaller on-ground ball at the club face (owner: "make the ball a little smaller on the
    ground so it's more in scale with the golfer... positioned at the club face; I like how it gets bigger
    in the air").** On-ground ball radius 3.2→**HV_GROUND=2.05** (in scale with the mini golfer) across all
    at-rest/roll/pen/address paths; the airborne size is UNCHANGED — the growth term was recomputed
    (`HV_GROUND + h*(HV_AIRPEAK-HV_GROUND)`, peak still 7.8) so it still swells in flight. Green/putt ball
    (HV_GBALL) untouched. Positioned at the club face: the golfer's x is aligned by `clubFrac=0.90` so its
    club addresses the ball at the shot origin, and the sprite's own painted ball was removed (the engine
    ball sits there). Verified at real scale + full round + reduced-motion, 0 errors.
  - **CS355c — shot-number "pin" above the golfer (owner: "the golfer covers the number that represents
    what shot it was; display it in a similar creative way that doesn't interfere with the golfer").** The
    golfer stands on the shot's resting marker (`hvDoneShot` draws a numbered chip at each rest point),
    covering it. Added a small **gold-bordered numbered pin** (matching the resting-marker chip style, but
    GOLD = the live shot vs TEAL = past-shot markers) floating just above the golfer's head with a
    downward pointer — a broadcast-style "now playing shot N" indicator. Shows the current shot number
    (`p.i+1`), drawn OUTSIDE the mirror group so the digit is never flipped, fades in/out with the swing
    (`hvswNum` keyframe), reduced-motion hides it. Verified in Playwright: the pin renders the correct
    number (shot 2 on the approach) fully faded-in at real scale, above the golfer, uncovered; full round
    completes + reduced-motion hides golfer AND pin, 0 page errors. Deployed to /golf.
  - **CS355d — handedness choice + fixed follow-through + leg motion + putting & chipping (owner: golfer
    was flipping lefty/righty by shot direction; wanted a lefty/righty CHOICE that always swings from that
    side; legs too stagnant; add simulated putting + chipping; + a reference showing the proper follow-
    through wrapped over the shoulder).** (1) **Handedness**: re-added the `handRow()` lefty/righty toggle to
    the creator (appearance section, guests too), and `hvSwingMarkup` now orients by `look.lefty` (fixed) —
    a righty always swings as a righty regardless of shot direction (no more flipping); lefty mirrors.
    (2) **Follow-through** redrawn to match the reference: tall/rotated to target, hands HIGH by the head,
    **club wrapped up over the shoulder**, back foot up on the toe. (3) **Leg motion** across the swing
    (weight set → back knee → weight forward on the toe) so the lower body isn't frozen. (4) **Putting +
    chipping**: authored a 2-frame **chip** (compact wedge) and a 2-frame **hunched putt** (bent over the
    putter); `hvSwingMarkup` dispatches by shot kind — full swing (tee/app/adv, 3 frames), chip, putt/hole
    — each with its own CSS stroke cadence and a ball-launch delay in `hvKick` (chip 290ms, putt 260ms) so
    the ball leaves at contact. Putts play under the green close-up, so the golfer is sized to a fraction of
    THAT camera (`GH = cam[3]*0.15`, clamped) and the shot-number pin scales with it. **Bug fixed en route**:
    the golfer was gated on `!small`, but `small` is also true under the putt close-up, so putts got no
    golfer — re-gated on `!pcol` (single-ball; still excludes H2H multi-ball, which passes a ball color).
    Verified in Playwright: handedness mirrors correctly + is consistent across shots; the setup toggle
    renders; chip + putt golfers render live (chip near the green, putt hunched on the close-up with its
    pin + flag); a full auto round completes with 0 page errors; reduced-motion hides all of it. Deployed
    to /golf. Tunable: `HV_SWING`, per-kind sizes/timings, the `PXS_*` frames.
  - **CS355e — slimmer legs + smaller shaped feet on the swinging golfer (owner: "the feet look way too big
    and blocky and the legs are slightly too wide").** In the `swing.py` composer the mini-golfer's legs were
    4px wide with 7×3 block shoes; narrowed the legs to 3px and replaced the blocks with a `shoe()` helper
    drawing a small ~5×2 heel+toe side-view shoe, across all leg phases (set/back/thru) + the putt base.
    Re-authored the swing frames JSON and re-inlined into the game (`PXS_*`). Committed + deployed to /golf.
    (Verified via the same swing-preview render + a full round; 0 page errors.)

- **CS356 — pixel theme tied through the whole game: pixel font cohesion, lemon-gold gradient headers,
  pixel-art trophies, and the GOAT hero (owner: "bring the pixelated theme to the rest of the game... tie
  everything together... make this game feel more human created, authentically designed, and thought out";
  then, after approving 3 screenshots via AskUserQuestion, added: "pixelify the trophies, and switch Live
  Your Legacy to BECOME THE GOAT").** Three coordinated layers, all self-contained (no new assets — the
  fonts + sprites are embedded), presentation-only (no sim/engine/state change):
  1. **Pixel font cohesion.** Embedded the OFL **Silkscreen** font (base64 woff2, weights 400 + 700) as
     `@font-face` so it's self-contained (the sandbox can't load Google Fonts — this is why earlier
     screenshots showed serif fallbacks, so embedding also hardens robustness/offline). Added a `--pixel`
     token and applied it to the UI's structural/pixel-appropriate type — labels, section eyebrows, card
     kickers/titles, buttons, nav labels, OVR/roll numbers, `h2`, the retro creator title, the hero — while
     KEEPING the body copy + the RUN THE TOUR wordmark on their existing fonts, so pixel type is used where
     it reads as intentional retro-game design and prose stays legible.
  2. **Distinctive lemon-gold gradient (CS354/354b, shipped together in this commit's earlier work).** The
     generic AI-flat `#EBA61F` gold on marquee surfaces is now a smooth bright **lemon-gold foil** via two
     tokens — `--gold-grad` (a 9-stop vertical brushed-metal gradient, tiny deltas so no harsh band lines)
     + `--gold-grad-d` (angled fill variant) — applied by the text-clip technique to the wordmark "TOUR",
     the hero, and the retro creator title, and as the fill on the primary `.btn.goldfill`, the Career-Mode
     `.gc-gold` card, and the Continue-Career `.resumecard`. Base tokens brightened (`--gold` `#EBA61F`→
     `#F1D04A`, `--gold2`→`#c9a520`) so the many small flat-gold chips/labels shift to the new hue too, and
     all hardcoded old-gold traces (144 `rgba(235,166,31,…)`, 32 `#EBA61F`, the `--hgold` underline, old
     gradient stops) were swept to lemon equivalents.
  3. **Pixel-art trophies.** Authored 5 char-grid trophy sprites in `scratchpad/trophies.py` (rect/disc
     primitives + a 1px outline pass, previewed + iterated visually like the golfer): a gold **cup** (generic
     wins), the same with blue bands (**National Open**), a silver **flagon** (Links Championship / claret-
     jug analog), a two-handled lidded silver **cup** (Championship / wanamaker analog), and a burgundy
     **blazer** with green collar + lapels + gold button (Magnolia Invitational / Masters analog). Inlined as
     `PXT_*` constants + `PXT_PAL` + a `pxTrophySVG(rows, cls)` renderer that emits crisp-edges SVG `<rect>`
     blocks (viewBox `0 0 24 28`, `shape-rendering:crispEdges`, 1.04-unit rects so no hairline gaps). The 5
     major trophy fns (`winTrophySVG`/`usOpenTrophySVG`/`claretJugSVG`/`wanamakerSVG`/`greenJacketSVG`) + the
     small title `trophySVG()` now return the pixel versions (so the win/major celebrations, the Trophy Room
     cabinet — greyscale-when-unearned still works via CSS filter — and every `majorTheme().svg` site get
     pixel trophies), and `canvasTrophy()` was rewritten to draw the `PXT_CUP` grid as canvas fill-rects for
     the share card. `majorTheme()` labels/regex + accents unchanged. Left the tiny inline `ic('trophy')`
     line-glyph as-is (it's part of the separate `currentColor` stroked-icon set used inline in nav/chips).
  4. **Hero copy → "Become the GOAT."** The title hero `.hr2` changed "Live your Legacy." → "Become the
     GOAT." (the `.hero` CSS uppercases it → "BECOME THE GOAT."), carrying the lemon-gold gradient.
  Verified in Playwright: `node --check` clean; the title renders "BUILD A GOLFER. BECOME THE GOAT." in the
  pixel font with the lemon-gold foil, and the pixel-font cohesion + gold gradient read across the whole
  title/cards/labels; all 6 trophy graphics + the Trophy Room cabinet render cleanly at both celebration and
  cabinet sizes with 0 page errors. Owner had already approved the pixel-font + gold direction via 3
  screenshots (title/draft/setup) + AskUserQuestion before the trophy/hero asks. Deployed to /golf. Tunable:
  `--gold-grad`/`--gold-grad-d` stops + `--gold` hue in `:root`, the `--pixel` cohesion CSS block, the
  `PXT_*` sprite grids + `PXT_PAL` in `scratchpad/trophies.py`.
  - **CS356b — pixelate the Continue-Career golfer name + enlarge/bolden the mode-card headers (owner:
    "the golfer's name in the resume career button is the old font, pixelate it; and increase the size of
    the pixelated headers for each mode and make them stand out more").** The resume card's `.rc-name` (the
    golfer name, e.g. "Lion Trees") was still `var(--display)` serif italic — switched it to
    `var(--pixel)` 700 / 23px so it matches the pixel theme. The mode-card titles `.gc-title` (BEAT THE PRO
    / CAREER MODE / HEAD TO HEAD, in the CS356 cohesion override) went 18px → **24px + weight 700** so they
    stand out. Verified in Playwright (both compute Silkscreen; rc-name 23px, gc-title 24px/700; 0 page
    errors); screenshot confirms "LION TREES" pixel-bold matching the enlarged mode headers.
  - **CS356c — three Trophy-Room asks (owner): fix intermittent Close, pixelate the medals/cups/honors,
    make the golfer a PROFILE-level customization.**
    1. **Close sometimes didn't work.** The top Close `.ov .x` was `position:absolute`, so on a long
       overlay (the Trophy Room) it scrolled out of reach — tapping where it "should" be did nothing.
       Changed to `position:fixed` (top-right, z-index above the scrolling content) so it stays pinned +
       tappable at any scroll position, and added a global **Escape-to-close** for any open overlay as a
       belt-and-suspenders. Verified `.x` computes `position:fixed` and Escape clears `S.overlay`.
    2. **Pixelated the medal/cup/honor chips.** Authored 9 small pixel-icon sprites in
       `scratchpad/trophyicons.py` (medal, cup, shield, star, crown, dollar, target, globe, ribbon; 18×18,
       primitives + 1px outline) → inlined as `PXI` + a `pxMedalSVG(rows,color)` renderer that resolves
       `m/d/h` to the chip's tint color via `pxShadeHex`/`pxLiteHex` (so the same medal sprite renders
       gold/silver/bronze). `trophyChip(emoji,…)` → `trophyChip(iconKey,…)` now draws the pixel icon inside
       the round medallion (call sites pass keys + hex colors, `var(--gold)`→`#F1D04A` so the shade math has
       a hex). The 4 major trophies were already pixel (CS356). Verified all 11 chips render pixel icons,
       0 page errors.
    3. **Profile-level golfer + "tap to customize".** The golfer's name/look were already saved to the
       profile (`bag_name`/`bag_look`, cloud-synced) and used in every mode (daily/h2h use the saved look
       per CS353; career-start edits it before beginning), so the golfer was already shared — the gap was
       discoverability + an edit entry point. Added a clickable **`.profav`** avatar + a teal
       **"✎ Tap to customize"** pill in the Trophy Room that opens `scrSetup` in a new **edit mode**
       (`S.setupEdit`, `S.setupReturn='record'`): the title reads "▸ Edit Your Golfer / This is your golfer
       in every mode", and the action bar is **‹ Back / Done ✓** which return to the Trophy Room instead of
       starting a draft (career-start setup is unchanged — `reset()` clears `setupEdit`, so it still shows
       "Create Your Golfer / Build Your Golfer ▸"). Changes auto-save on each pick (existing `saveLook`/name
       oninput), so Done just returns. Daily/H2H remain quick + seamless (no forced setup, they use the
       profile golfer). Verified the full flow (avatar tap → edit mode with Back/Done → returns to the room,
       setupEdit cleared) + the career-start regression, 0 page errors.
    Tunable: the `PXI` sprites in `scratchpad/trophyicons.py`, the `.profav-hint` copy/style.
  - **CS356d — globe→Earth icon, big offseason hero title + no sponsor popup, and the "impossible
    leaderboard scores" diagnosis (owner, 4 asks).**
    1. **Globe icon → Earth.** The World-No.1 pixel globe (CS356c) read as a basketball (meridian grid).
       Redrew it in `scratchpad/trophyicons.py` as Earth: blue ocean disc + green continents + a glint;
       re-inlined the `PXI.globe` grid.
    2. **Sponsor offer popup removed.** The full-screen `maybeSponsorMoment()`/`sponsorOfferPopup` (CS351)
       on the off-season is gone (owner: "this popup can go away"). The offer still surfaces INLINE via the
       existing `sponsorDecisionNode()` card, so nothing is lost — just no interstitial.
    3. **Big hero-style screen title.** The small teal `.tag` pill header ("Off-Season · Year N prep") is
       replaced with a new reusable `scrHero(title, sub)` — a big gold-gradient pixel title (`.scrhero`,
       `clamp(26px,7.5vw,40px)`, matching the main-page `.hero`) + a small teal sub. Applied to the
       off-season ("OFF-SEASON" / "Year N · prep your bag"). Verified it renders ~32px on a phone, 0 errors.
    4. **"These scores don't seem possible" → then owner: "remove that formula that lowers people's
       scores. It's bad for the game."** The Single-Season board showed a wall of identical round numbers
       ($184M ×several, $182M, $180M) = EXACTLY `OVR×2,000,000`, the anti-forgery earnings/net cap from
       migration 34. MEASURED the current sim (Playwright, real startSeason/skipToEnd/seasonNet): a dominant
       OVR-92 year-29 season nets ~$35.5M; a MAX all-99 build at year 30 tops out at ~$75M net — so a legit
       season TODAY can never approach $184M, and the cap was only clamping stale/legacy high submissions
       onto identical round numbers. Per the owner, **removed the OVR cap entirely** (not lowered): wrote
       **`supabase/51_runtour_remove_earnings_cap.sql`** (owner-run) which redefines both
       `runtour_submit_season` (signed-in) and `runtour_submit_season_guest` to store the submitted
       earnings/net AS-IS (only floored at 0, no `OVR×N` ceiling). Supersedes the caps in 33/34/37; the
       superseded `50_runtour_realistic_cap.sql` was deleted. Kept the wins≤40 / majors≤10 sanity clamps +
       name filters (not dollar-lowering). Validated against real Postgres: applies clean + idempotent, and
       an OVR-92 $250M / guest $300M season now stores uncapped (old cap → $184M). No client change needed.
       **ACTION: run `supabase/51_runtour_remove_earnings_cap.sql`** (optional commented truncate at the
       bottom clears the old clamped rows so the board repopulates cleanly).
    Tunable: `scrHero` styling (`.scrhero`). No earnings ceiling anymore (owner decision).
  - **CS356e — pixel golfer: smaller cap + hair actually interacts with the hat (owner: "the hat is too
    big, and it should impact the hair. The hair should be pushed out the bottom of the hat like real life.
    All hair styles and all hats should interact with each other").** The avatar composited body → hair →
    cap, but the cap didn't cover the crown fully and the hair blob poked out the top/sides above it. Two
    fixes in `pxGolferURL`: (1) redrew `PXG_CAP` as a lower-profile golf cap that hugs the head (crown rows
    5-12, small front brim rows 13-14) — smaller, no longer bulbous; (2) when a full CAP is worn, the hair
    is now clipped to below the brim (`HAIR_UNDER_CAP=12`, `paint(map,minY)`), so only the fringe/sideburns
    "push out the bottom" of the hat and NO hair shows above/through it — every hair style tucks under every
    cap automatically. A VISOR (open top) is unchanged: hair shows full, the band sits at the brow. Verified
    in Playwright across all 5 hair styles × cap/visor/none (15 combos): caps clip the hair to the fringe,
    visors leave it on top, no-hat shows full hair, 0 page errors. Rendering-only (sprite grid +
    composition); the swing sprites are separate and untouched. Tunable: `PXG_CAP` grid, `HAIR_UNDER_CAP`.
  - **CS356f — profile pill shows the pixel golfer instead of a generic icon (owner).** The header
    profile/sign-in pill used `swingIcon()` (a generic person glyph). Replaced it with a new
    `pxAvatarChip(look, sz)` — a tiny head-and-shoulders crop of the player's own pixel golfer
    (`pxGolferURL`, cropped to sprite rows ~4-26, centered in an sz×sz rounded chip via `.pxchip`). Shows
    the signed-in player's golfer next to their username, and the guest's default golfer next to "Sign in".
    Verified in Playwright (chip renders, old svg gone, 0 errors). The guest default look is `DEFLOOK`
    (tan skin, brown short hair, white polo + white cap, stone trousers, white shoes, male, right-handed,
    USA); guests may customize skin/hair/hair-style (persisted in `bag_look`), so the chip reflects it.
  - **CS356g — resume-card golfer, "Resume Career" rename, and patterns + accessories back in the Pro Shop
    (pixelized) (owner: "put the pixelized golfer to the left of the overall in the resume career button;
    rename continue career to resume career; bring back accessories, patterned shirts, and more in the pro
    shop, with the new pixelized theme; use historical references without names").** Three parts:
    1. **Resume card golfer + rename** (`resumeCareerCard`): the mini pixel golfer chip (`pxAvatarChip(cs.look,36)`)
       now sits to the left of the OVR badge; the kicker + go label read "Resume Career/Legend Circuit" / "Resume ▸"
       (was "Continue"). The `.rc-name` is the pixel font (CS356b).
    2. **Pixel PATTERNS + ACCESSORIES** rendered by the sprite. New `PXPAT` (8 shirt patterns, char-grid overlay
       functions f(x,y)→0/1/2, historical-golf-themed no names: Pinstripe/Bold Stripe/Gingham/Bold Dots/
       Houndstooth/Old Links Tartan/Heritage Argyle/Retro Blocks, 9k-18k coins) overlaid on the shirt pixels in
       `pxGolferURL` (tonal accents derived from the shirt color so any color works); new `PXG_BUCKET`/`PXG_FLAT`
       headwear (`PXG_HATS`) + `PXG_SHADES` eyewear (`PXG_EYEWEAR`), painted last. Cache key includes pat/ew.
    3. **Shop wiring** (all in the existing coin economy — `cosmeticPrice`/`cosmeticItems`/`cosBuy`/`cosEquip`,
       new `cosIsEquipped` handling hw/ew/pat/hat, new `COS_CATS` entries `hw`/`ew`, `FREE_COSMETICS` gives the
       base cap/visor/no-hat/no-shades free — bucket/flat 11k, shades 10k): `overlayShop` now has **Apparel**
       (Shirt/Pattern/Hat/Trousers/Shoes) + **Accessories** (Headwear/Eyewear) sections; tiles for pat/hw/ew use
       a real cropped pixel-golfer thumbnail (`pxCosThumb`/`pxCropImg` — pat→torso band, hw/ew→head band) so you
       see the item on the golfer; `shopEffLook`/`pxCurLook` (now via a shared `inShopCtx()`) preview hw/ew/pat
       live; buy = preview-on-golfer → confirm; "My Items" lists every non-free unlock incl. patterns/headwear/
       eyewear. Verified in Playwright: Pattern category + 9 pattern tiles w/ pixel thumbs, Accessories tab shows
       Headwear/Eyewear tiles, buying a pattern/bucket-hat deducts coins + equips (look.shirtPat / cap+hatStyle),
       My Items updates; 0 page errors. Deployed to /golf.
  - **CS356h — the Create-your-golfer screen now uses the Pro Shop's tab layout (owner: "I love the tab
    layout and functionality of the pro shop, implement it into the player customization screen so it's
    smoother and everything feels similar").** Rebuilt `scrSetup` to mirror the shop: a big pixel-golfer
    preview at top, section tabs + category chips, and a tap-to-equip / preview-then-buy tile grid (reusing
    the shop's `.shop-sticky`/`.segrow`/`.catrow`/`.sgrid` CSS + `shopTile`/`cosTileHTML`/`shopTileClick`).
    - Signed-in tabs: **Look** (Skin / Hair color / Hair style / Handedness - free appearance tiles via
      `setupLookTiles`, hair-style tiles show a pixel-golfer head preview), **Apparel** (Shirt / Pattern /
      Hat / Trousers / Shoes), **Accessories** (Headwear / Eyewear), **Details** (Name + Country form).
      Guests get only the **Look** tab + the sign-in lock card (appearance is free; Apparel/Accessories/
      Details need an account).
    - Apparel/Accessories tiles are the exact shop tiles: owned → tap to equip, locked → preview on the
      golfer + confirm-to-buy (extracted the confirm card into a reusable `shopPreviewNode()` used by both
      the shop and setup). The live preview reflects a pending purchase because `pxCurLook`/`shopEffLook`
      now key off a shared `inShopCtx()` (overlay==='shop' || screen==='setup'). `shopTile` gained a
      `noFoot` flag so appearance tiles show just the gold ring + ✓ (no owned/price label).
    - Kept: the Back/Build + Back/Done(edit-mode) sticky action bar, edit-from-Trophy-Room mode, career-only
      entry (the Daily "Draft your golfer" still skips setup → draft). The setup preview is non-sticky within
      its bordered box (`.setup-shop` overrides) for a clean, low-risk v1. Old flat rows
      (`swatchRow`/`cosColorRow`/`cosPatRow`/`headwearRow`/`accSelectRow`) are now unused (left in place).
    - Verified in Playwright: signed-in 4 tabs + Look cats + 8 skin tiles + preview; picking a skin selects
      it; Apparel→Pattern buy (houndstooth) → owned+equipped; Accessories→Headwear buy (bucket) → cap on +
      hatStyle; Details shows name+country no grid; guest gets only Look + lock card and can still change
      skin/hair; Build routes to draft; shop regression still green; 0 page errors. Deployed to /golf.

  - **CS356i — resume card shows the full standing pixel golfer** (owner: wanted the whole golfer, not a
    bigger head-crop). Added `pxFigureHTML(look,h)` (the full 44×56 sprite at a set height) and used it in
    `resumeCareerCard` instead of `pxAvatarChip`. Deployed to /golf.
  - **CS356j — draft: locked-in vs draftable is now obvious + round result pill moved to the top** (tester +
    owner, screenshots). (1) On the draft grid the already-drafted (locked-in) slots now render **muted grey
    with a green ✓** and are clearly non-clickable, while the draftable slots are **gold-accented/tappable**
    (the `.attr.dfilled` green tint that looked too similar to the draftable tiles is gone; `.attr.dtake`
    gets a gold border + faint gold fill; a `.dlock` ✓ badge added to filled tiles in both the career draft
    and the H2H draft). (2) The holed **result pill** (`.hvresult` "PAR E") that popped over the middle of
    the tracer (covering the golfer) now pops at the **top** (top:42px, below the hole-info chip), so it
    never blocks the golfer/flag. Verified in Playwright (2 locked + 6 draftable with ✓ badges; pill top-
    centered ~46px) + screenshots; 0 page errors. Deployed to /golf.

  - **CS356k — off-season: upgrades apply instantly, only a downgrade asks to confirm** (owner: "don't like
    having to confirm every time; make the change if it's an improvement, and confirm with a pop-up only if
    you're decreasing a skill"). The off-season swap tile click now branches on the delta: `dd>=0` (an
    upgrade or same value) calls `offTake` directly (no confirm), `dd<0` arms the inline lock-in confirm
    (CS273 style) which now reads "Lock in this downgrade?". Hint copy updated ("▲ upgrades apply instantly,
    ▼ a downgrade asks you to confirm"). The once-per-stat lock still applies either way. Verified in
    Playwright (upgrade applies + clears the spin with no confirm; downgrade shows the confirm and only
    applies after Lock in); 0 page errors. Deployed to /golf.

  - **CS356L — removed the pixel FONTS, kept all the pixel GRAPHICS** (owner: "we love the pixel look/graphics,
    the only thing we don't like are the pixel fonts; push the graphic pixelization further but no pixel fonts").
    CS356 had embedded Silkscreen (`--pixel`) and applied it to labels/eyebrows/chips/buttons/nav/card-titles/
    hero/OVR numbers. This reverts the TYPOGRAPHY to the clean brand fonts while leaving every pixel-art asset
    (golfer sprite, trophies, medals, hole view, patterns/accessories) untouched:
    - `--pixel` token repointed from Silkscreen → the Barlow Semi Condensed body stack, so every label/chip/
      button/eyebrow that referenced it renders in the clean condensed font (one-line fix covering all of them).
    - Big titles set explicitly to the display font (Anton): `.hero`, `.gc-title` (mode cards), `.rc-name`
      (resume card), `.scrhero .sh-t` (screen heroes) — sizes/weights retuned since Anton is condensed vs the
      wide pixel font (hero back to 1em, gc-title 24→30px, scrhero clamp bumped, all weight 400). `.scrhero .sh-s`
      → body. OVR/roll numbers (`.ovr .num,.rollval`) → mono.
    - Removed the two embedded Silkscreen `@font-face` blocks (~40KB base64) so the pixel font is truly gone
      (0 `Silkscreen` refs remain).
    Verified in Playwright: 0 elements compute Silkscreen, hero + card titles compute Anton, off-season hero
    renders without overflow, 0 page errors; screenshots confirm the title + off-season read clean/premium with
    the pixel golfer graphic intact. Deployed to /golf.

  - **CS356m — fixed: Daily Challenge froze after Build on a hole-1 signature course + sponsor offer had no
    "do nothing" button** (owner screenshots). Two unrelated fixes:
    1. **Daily freeze (core-loop bug).** When today's daily landed on a course whose hole 1 is a signature
       hole (e.g. "Royal Causeway" = Royal Portrush, or Olympic Club) AND the seed picked a TEE/par-3 style
       decision, the round froze at "0 THRU" with no hole-view and no decision prompt. Root cause: in
       `scrDailyRound` the `previewNext` gate (which drives both the upcoming-hole tracer preview AND the
       `teeSig` up-front decision modal) required `played.length>0`, so at hole 1 (0 holes played) the
       signature TEE decision never rendered — while `scheduleDailyAdvance` had already `render()`ed and
       returned waiting for it. (App-phase hole-1 sigs went via `S.dailyProv` and worked, which is why it
       was seed-dependent.) Fix: dropped the `played.length>0` requirement from `previewNext` so the
       pre-first-hole state renders the hole-1 preview + decision. Verified in Playwright: Olympic Club's
       hole-1 "YOUR CALL" decision now renders (2 options over the tracer), clicking it plays hole 1
       (holes 0→1), and the round auto-advances h1→h2→h3; a full auto round still completes to the result;
       0 errors.
    2. **Sponsor offer "Not now".** The off-season sponsor offer (`sponsorDecisionNode`) only had
       Replace/Sign-on-Hat/Shirt buttons — "there's no button to do nothing." Added a per-offer "Not now ·
       keep my current sponsors" ghost button that drops that offer from `S.career.sponsorOffers` (undecided
       offers were already treated as passed at season start; this just makes it explicit). Verified it
       renders + clears the offer. Both deployed to /golf.

  - **CS356n — TourTracer golfer polish (owner): stop the fade in/out, hide ground shot-numbers on the
    green, bigger number above the golfer on the green.** Three tweaks to the mini swinging golfer:
    1. **No more fade in/out over and over.** The swing frames used to fade OUT at the end of every shot
       (opacity→0), so the golfer disappeared then reappeared each shot. Rewrote the `hvsw*` keyframes to
       swing once then **HOLD the finish pose** (opacity 1 `forwards`, `steps` so no fade), and the number
       pin holds too. Between shots the hole view re-renders and the golfer simply **teleports** to the next
       spot — no repeated flashing.
    2. **No numbered ground chip once the ball is on the green.** `hvDoneShot` now skips the numbered circle
       marker when `p.onGreen` (keeps the tracer path), so the tight green close-up isn't crowded; the
       current shot number lives on the pin above the golfer.
    3. **Slightly bigger number pin on the green.** First sized the green pin to the close-up camera
       (`cam[3]*0.085`), which the owner said was "way too big"; settled on `GH*0.26` badge radius /
       `GH*0.31` font (a touch bigger than the full-shot pin), so it's a little larger on the green but not
       oversized (full-shot pins unchanged).
    Verified in Playwright (green close-up renders the pin, no ground chips on the green, golfer + badge
    present) + screenshot; 0 page errors. Deployed to /golf.

  - **CS356o — bolder + slightly bigger button text on every button, with a bolder "locked-in" state
    (owner: "do you think these words should be a little bolder or bigger? For all buttons, not just that
    one. Maybe it locks in like a bolder color").** The CS356L pixel-font revert had left `.btn` at
    `font-family:var(--pixel);font-size:16px` weight 400 (why buttons read thin). Bumped ALL buttons to
    `font-weight:800;font-size:17px;letter-spacing:.02em` (`.btn .sub` → weight 800 / 10.5px), and gave a
    SELECTED/locked-in button an extra-bold, more-saturated look: `.btn.goldfill{font-weight:900}` with a
    stronger gold ring/shadow, and toggle `.on` chips (`.segrow button.on`, `.catchip.on`) → weight 900. So
    every button reads bolder/bigger and a chosen one clearly "locks in" heavier. Verified in Playwright on
    the daily preview (SAFE/AGGRESSIVE weight 800, BALANCED-selected 900 + ring, goldfill CTA 900 + ring, 0
    errors) + screenshot. Deployed to /golf.

  - **NOTE:** the entries CS356p through CS356ae shipped this session but were not individually logged here
    (daily preview dropdown + hero, daily scoreboard TOUR AVG, looser Moment trigger + off-season declutter,
    season-rail CUT fix, draft locked-in-vs-draftable colors + centered "+", season-summary TABS, Earnings/
    Analytics rename + Season Impact copy, rivalry card winner-gold logic, off-season spin button, Thru-5
    scorecard, Season Awards order, and the CS356ae radar/stat-tile share polish now superseded by CS356af).

  - **CS356af — PLAYER-CARD share graphic (pixel golfer, replaces the radar card).** Owner wanted better
    share buttons/card ("I don't like the icon with the stats"); rejected a radar-polish pass ("that's the
    same style") and approved a pixel-golfer "player card" direction ("go that direction"). Rebuilt both
    `drawShareCard` (season) and `drawCareerCard` (career-end) as one shared `drawPlayerCard(ctx,W,H,o)`
    renderer (W=560,H=720): a gold top bar + inner frame, the RUN THE TOUR wordmark, a gold headline ribbon,
    the player's created **pixel golfer as the hero** drawn pixelated + a ground shadow, a gold OVR circle
    badge over the shoulder, the name, the NET WORTH hero number (green/red), and a clean 4-tile stat row
    (EARNINGS `fmtShort` / WINS / MAJORS / RANK for the season; EARNINGS/WINS/MAJORS/SEASONS for career).
    Fully SYNCHRONOUS: refactored `pxGolferURL` into `pxGolferCanvas(look)` (a cached `<canvas>`), so the
    hero is drawn via `ctx.drawImage` (imageSmoothingEnabled=false) with no async image load - both the
    on-screen preview AND the `shareCard()` `toBlob` capture render correctly. `playerCardHeadline(info)`
    picks a punchy headline (GRAND SLAM / N× MAJOR CHAMPION / MONEY LEADER / N× WINNER / SEASON N; career:
    GRAND SLAM LEGEND / N× MAJOR CHAMPION / N TOUR WINS / N-YEAR CAREER). Owner add: a "YEAR 5 OF 30" line
    under the ribbon on the season card (`CAREER_MAX_YEARS`; circuit shows "LEGEND CIRCUIT · YEAR N"; hidden
    for daily). Stat-tile values auto-shrink to fit. Verified in Playwright (season 2x-major, career grand-
    slam, rookie negative-net) - 0 page errors, cards render clean; screenshots confirmed the pixel-golfer
    look ties into the game's pixel theme. Deployed to /golf. (The old radar `RLABS`/`vals` path is now
    unused but the `vals` param is kept on both fns; `drawMajorWinCard` still uses its own art, untouched.)

  - **CS356ag — legible compact header + clean status-bar scroll (owner: "it shouldn't be able to scroll
    up and down like that... anytime you see the green header like that change it to a normal header so it's
    legible").** On iOS the app uses `viewport-fit=cover` + a translucent status bar, so as you scrolled a
    content screen (e.g. the season summary) the big decorative crest+wordmark header (`.head`, position:
    relative) slid up UNDER the status bar and the gold gradient "TOUR" wordmark got clipped/smeared -
    illegible + looked broken. Fixes: (1) the full decorative crest+wordmark header now renders ONLY on the
    **title** screen (the brand moment); every other screen gets a **compact, legible top bar**
    (`.head--compact`): crest/divider/rule hidden, a single-line "RUN THE TOUR" wordmark with the "TOUR" in
    SOLID lemon-gold (not the transparent-clip gradient, which reads muddy at small sizes), tighter spacing.
    (2) An opaque **status-bar mask** (`#topmask`, fixed, `height:env(safe-area-inset-top)`, mounted once on
    `<body>`) sits over the inset so scrolling content never smears under the translucent status bar - the
    top stays clean on every screen. (3) `.head` top padding is now `max(calc(10px+env(...)), 44px)` so the
    header clears the status bar even in a Safari tab where the inset resolves to 0. (4) The sticky summary
    tabs (`.sumtabs`) and Pro Shop bar (`.shop-sticky`) now pin at `top:env(safe-area-inset-top)` instead of
    `top:0`, so they stick BELOW the status bar, not under it. Verified in Playwright: title keeps the full
    header, content screens (rules) render the compact legible bar with a solid-gold wordmark + hidden crest,
    the topmask mounts, 0 page errors; screenshots confirm both. Deployed to /golf.

  - **CS356ah — draft skill-tile strength bar is rating-graded again (owner: "I liked when the bars under
    the numbers changed based on the rating").** CS356j had forced every draftable tile's strength bar to a
    flat gold (`.attr.dtake .attrbar>i{background:var(--gold)!important}`), losing the CS269 colour grading.
    Restored it: the bar's inline colour now comes from `ratColor(rv)` (90+ gold / 82+ green / 74+ teal /
    66+ indigo / else grey - the same scale the live radar uses), and the CSS `!important` gold override was
    dropped to a plain fallback so the inline colour wins. Applied to both the career draft (`scrDraft`) and
    the online H2H draft (`scrH2HDraft`). Verified in Playwright (72→indigo, 83/89→green, 91/92→gold), 0
    page errors. Deployed to /golf.

  - **CS356ai — season-summary tab bar "jiggle" fixed (owner: "you should be able to scroll horizontally
    if you need to, but not vertically. it like jiggles").** The `.sumtabs` strip (Overview/Earnings/…/Share)
    used `overflow-x:auto` with a default `overflow-y:visible`; per CSS, when one axis is a non-visible
    overflow the other computes to `auto`, so the strip could scroll/rubber-band a few px VERTICALLY - the
    jiggle. Added `overflow-y:hidden` so ONLY horizontal scroll is possible (kept `overflow-x:auto` so the 8
    tabs still scroll sideways on a narrow phone). Applied the same `overflow-y:hidden` guard to the other
    horizontal rails with the same latent bug: the season event rail (`.seasonrail`) and the Pro Shop
    category chips (`.catrow`). Verified in Playwright: `.sumtabs` computes overflow-x:auto / overflow-y:hidden,
    stays horizontally scrollable (825px content in a 390px strip), the active-tab gold underline still
    renders un-clipped. Deployed to /golf. (Also confirmed the hole-view golfer's handedness IS applied
    correctly - a right-handed golfer uses the base sprite, a left-handed golfer is mirrored via
    `scale(-1,1)` in `hvSwingMarkup`, driven by `look.lefty`; verified in the live hole view.)

  - **CS356aj — the hole-view golfer now faces toward the hole/target (owner: "faces away from the hole").**
    CS355d had fixed the golfer's facing to HANDEDNESS only (righty always faces right, lefty mirrors),
    which meant on a shot whose target is to the LEFT the golfer addressed the ball facing AWAY from where
    it was going. Owner chose (AskUserQuestion) "always face the target, accepting it may look opposite-
    handed on shots that go the other way." `hvSwingMarkup` now computes `faceRight` from the shot's
    direction: it projects the shot's resting/target point (`p.rest`) vs its origin (`A`) and faces the
    golfer toward it (`dx>0`→right); handedness (`look.lefty`) only breaks the tie on a dead-straight shot
    (|dx|<3). The existing club-alignment/positioning already follows `faceRight`, so the golfer stands
    behind the ball facing the target with the club reaching to it. Verified in Playwright: a rightward
    shot isn't mirrored (faces right), a leftward shot is mirrored (faces left), a straight shot defaults to
    handedness; 0 page errors. Supersedes CS355d's handedness-fixed facing. Deployed to /golf.

- **CS357 — PIXEL COURSE ART wired into the live hole view (behind a toggle).** After a multi-session
  prototype exploration (a self-contained pixel-art renderer built in the scratchpad, iterated with the
  owner: dithered turf, dense per-biome forest/scenery, organic greens, and correct large natural elements
  incl. the ocean/cliff/beach on coastal & links courses), the owner approved integration. Ported the
  renderer into the game as `pxTerrainURL(g, seedN, B)` — it reuses the EXACT same `g` (hvGeom geometry) +
  `B` (hvBiome) + `hvHash` the SVG view uses, inverse-projects each of ~53k cells through the same
  HV_CAM camera, builds a terrain-id buffer (rough/fairway/green/fringe/sand/water/tee/OCEAN) + a BFS
  distance field (forest density/buffer), and paints a 210×254 canvas (Bayer-dithered turf, multi-octave
  value-noise, per-course biome palettes, dense clustered forest with grove/bush/meadow variety, reeds,
  and the dramatic sea for coastal/links) upscaled `image-rendering:pixelated`. Cached per seed (~112ms
  uncached desktop, 0ms cached — every shot re-render reuses it).
  - **Integration is a clean background swap:** new `hvBackdrop(g,seedN,B)` returns EITHER the pixel
    `<image x=-52 y=0 w=464 h=560>` layer (pixel mode) OR `hvTerrain(...)` (illustrated). The 3 interactive
    hole-view `hvNode` sites (live/preview/multi) now call `hvBackdrop`. Because the pixel image sits in the
    same viewBox coords, the putt close-up camera zoom, the ball tracer, the mini pixel golfer, the shot
    markers, the floating scoreboard, and all HUD overlay UNCHANGED on top. The tee box + cup + per-course
    swallowtail flag are drawn as SVG on top via `hvPinTeeSVG` (parity + nicer than baked pixels). The
    static-share PNG + GIF paths stay on the illustrated `hvTerrain` for now (canvas-rasterizing a nested
    data-URL is riskier) — flagged as a follow-up.
  - **Toggle:** `hvArtMode()` reads `bag_holeart_pixel` (default TRUE = pixel). A "Pixel course art" switch
    in the ≡ Settings menu flips it (off = the illustrated view). One-line flip if the default should be
    illustrated.
  - **Shared geometry fix (owner-approved):** the cliff-side-pond quirk (a seeded freshwater pond crammed
    between the fairway and the sea) is fixed in `hvGeom` itself — for a coastal/links hole, a pond whose
    sea-facing edge reaches the shore is dropped (the ocean is the hazard on that side). This corrects BOTH
    the pixel AND the existing illustrated view. Verified 0 cliff-side ponds across all 162 coastal/links
    holes (was letting the pond's edge overlap the sea on Kiawah h17 with a center-only check; tightened to
    the pond's edge). Also: greens read as organic shapes in the pixel view (an angular wobble from the
    hole's `greenIrr`, matching how the SVG blobs the green) instead of plain circles.
  - Verified in Playwright: `hvBackdrop` emits the pixel image + flag overlay; `hvNode` renders it in
    live/preview/multi; the green close-up (putt) zooms crisply with the pixel backdrop; non-ocean (Augusta
    pine) + ocean (St Andrews links beach, Pebble/Kiawah coastal cliff) all render correctly; the
    illustrated toggle falls back to SVG; and a FULL real practice daily round (Beat the Pro → see course →
    build → draft 8 → round) reaches `dailyround` showing the pixel hole view with the tracer/golfer/HUD
    composited, 0 page errors end-to-end. Deployed to /golf. FOLLOW-UPS: pre-warm the next hole's pixel
    cache during the dwell if the ~112ms first-render hitch is noticeable on mobile; route the share PNG/GIF
    through the pixel backdrop so shares match; extend pixel art to the H2H multi-ball watch (already works —
    it shares hvNode). The scratchpad prototype (`pixcourse7.mjs`) remains as the iteration sandbox.

- **CS358 — pixel course pixels match the golfer's on the zoom-in (camera-aware detail tile).** Owner: on
  the putt green close-up the COURSE pixels blew up into huge blocks while the golfer sprite stayed fine — a
  jarring mismatch. Root cause: the pixel backdrop is a fixed 210-wide raster covering the whole hole, so
  zooming the camera into the green magnified each course pixel ~5x while the golfer is drawn at a
  ~constant on-screen size regardless of zoom. Fix: `pxTerrainURL` is now camera-parametrized
  (`opts:{cam,gw,gh}`), and `hvBackdrop` takes a `detailCam` — when the hole view is zoomed to a close-up
  (`hvDetailCam` returns the expanded close-up camera when `camTarget` width < 60% of the frame, else null),
  it renders a SECOND high-density pixel tile scoped to just the visible region (`HV_PX_DETAIL=340` vertical
  pixels, aspect-matched width, so one course pixel ≈ the golfer sprite pixel) and overlays it on the base
  full-frame image at that region. The base (chunky) tile is untouched, so the full-hole view keeps its
  pixel-art look; only the zoomed close-up swaps in the fine tile. Both tiles cache independently (key
  includes cam+gw+gh). Wired into the two live `hvNode` branches (single + multi/H2H); the preview + share
  paths pass no detailCam (full view). Verified in Playwright: a real practice round's green close-up
  (viewBox width 82) renders the detail tile (2 course images = base+detail, + golfer frames) with fine
  pixels matching the golfer, 0 page errors; full-view + illustrated toggle unaffected. Deployed to /golf.

- **CS359 — revert the CS358 zoom detail-tile (it shrank objects off-scale) + fix the oversized on-green
  ball.** Owner: on the green close-up the CS358 detail tile made the TREES tiny / off-scale ("keep the
  scale of all the objects, just adjust the pixel size when it zooms in"), and separately the ball
  "glitches on the first putt and was larger than it should be." Root causes: (1) CS358's detail tile
  increased pixel resolution on the close-up but the renderer draws objects at FIXED pixel sizes, so at
  higher resolution every tree/bush shrank in course-scale — a resolution-independent renderer is needed
  to get finer pixels while holding object scale (planned; bigger change). Reverted the detail tile
  (`hvDetailCam` now returns null) so the single base tile keeps every object at one consistent scale;
  `pxTerrainURL` stays camera-parametrized (harmless, unused for detail). (2) The oversized ball was a
  REAL pre-existing bug, not from the pixel work: `hvLiveShot`/`hvKick` sized a resting ball as
  "green ball" only for `p.k==='putt'||'hole'`, but an APPROACH or CHIP that lands on the green has
  `p.onGreen=true` with `p.k==='app'/'chip'`, so it rested at the big GROUND size (2.05) instead of the
  small green ball (HV_GBALL 0.86) — a large ball sitting on the green, then popping to 0.86 when the putt
  began (the "glitch"). Fixed: the resting size (`setFinal`) and the roll-out frame now use HV_GBALL
  whenever `p.onGreen`, so any ball coming to rest on the green is the small green ball and the
  approach→putt transition is seamless. Verified in Playwright: settled close-up balls are now all 0.86
  (was 2.05), a full practice round plays with correct object scale + small green ball, 0 page errors.
  Deployed to /golf. NEXT: build the resolution-independent renderer so the zoom can show finer pixels
  while every object holds its scale (the owner's actual ask) — scale scenery + terrain-feature pitch by a
  density factor on the detail tile.

- **CS360 — softer golfer outline on the course (no more "sticker on top").** Owner: the in-course swing
  golfer's outline was way too thick, reading as a sticker pasted on the course rather than a golfer on it.
  Root cause: the mini swing sprite (CS355d) was authored with a hard, fully-opaque near-black 1px outline
  (`k='#1c241b'`) around the ENTIRE figure. Fix: in the sprite renderer (`pxStrokeURLs`), the OUTER-perimeter
  outline pixels (an `k` cell touching a transparent cell or the sprite edge) are now drawn as a soft
  translucent dark rim (`rgba(24,32,24,0.34)`) so the course shows through and the golfer sits ON the grass;
  INTERNAL detail lines (club, limb separations, face) keep the crisp full-opacity outline. Scoped to the
  swing sprite only (the menu/setup avatar `pxGolferURL` is separate and unchanged — it needs its outline on
  the dark UI). Verified in Playwright: sprites render on a grass swatch + a real green close-up with the soft
  rim blending the golfer into the course, 0 page errors. Deployed to /golf.

- **CS361 — resolution-independent zoom: finer course pixels on the putt close-up while every object keeps
  its true COURSE scale (owner IMG_8337 "the pixels of the course should match the golfer when it zooms in"
  + IMG_8338 "keep the scale of all objects, just adjust the pixel size when it zooms in").** CS358's first
  attempt (a higher-res detail tile) raised resolution but the renderer draws objects at FIXED pixel counts,
  so trees/bushes shrank off-scale — reverted in CS359. This builds it properly: the detail tile renders at
  higher pixel density AND scales every object + course-feature pitch by `os` (= detail px-density / base
  px-density ≈ 5–8 on a putt), so the course keeps its exact scale but the pixels get finer to match the
  golfer sprite.
  • **Renderer (`pxTerrainURL`):** new `const os=opts.os||1;`. A `drawTreeS`/`edisc` scaled-canopy drawer
    (rounded/shaded trees sized `R=baseR*os*0.85`, clamped) and an os-aware `drawBush`; `drawTree` delegates
    to `drawTreeS` when `os>1`. Scenery PLACEMENT + course FEATURES scaled by os so density/scale stay
    course-constant: `BUFFER=9*os`, scatter `step`, bush band, the density ramp slope (`/os`), grove-noise
    frequency (`/os`), the treeline step, reed height (`*os`) + reed density (`/os`), the cart-path width +
    sampling, and the fairway mow-stripe pitch (`cy/(6*os)`). The terrain SHAPES (green/water/bunker/fairway,
    green organic wobble + contour rings) were already course-space (inverse-projected per cell), so they're
    resolution-independent for free. **os=1 (the full-hole base tile) is byte-identical to before** — every
    scaled term reduces to its original value at os=1 (verified `pxTerrainURL(...,{os:1}) === pxTerrainURL(...)`).
  • **Wiring:** re-enabled `hvDetailCam` (returns an expanded close-up region only when genuinely zoomed,
    `camTarget[2] < HV_W*0.6`); `hvBackdrop` computes `os=(gh/detailCam[3])/(HV_PX_BASEH/HV_H)` and passes it
    into the detail-tile `pxTerrainURL` call. The detail `<image>` overlays the base tile at the close-up
    region in the same SVG viewBox coords, so it scales in with the camera tween and the tracer/golfer/HUD
    overlay unchanged. Full-hole (non-zoomed) view keeps the base tile → the retro pixel-art look is
    preserved; only the zoom gets finer. Also fixes the CS359 pre-existing on-green ball bug carry-forward
    (unchanged here). The illustrated toggle + H2H multi-ball paths share the same code and are unaffected.
  • Verified in Playwright: os=1 byte-identical; a side-by-side of the OLD base-tile-magnified (chunky
    blocks) vs the NEW detail tile (fine pixels, correctly-scaled rounded trees, clean organic green) —
    clear win; a real live practice putt shows the course pixels matching the golfer sprite with the flag/
    cup/shot-pin/tracer/scoreboard composited correctly; 21 course/hole/biome combos (7 courses × 3 holes,
    pine/links/coastal/desert/tropical/parkland) all render base + detail with 0 bad; illustrated fallback
    intact; 0 page errors throughout. Deployed to /golf. Tunable: `HV_PX_DETAIL` (detail vertical px),
    `HV_PX_BASEH`, the `drawTreeS` `0.85` object factor, the `hvDetailCam` 60%-of-frame zoom threshold.

- **CS362 — Daily Challenge retention overhaul: Quick/Full watch modes, faster pacing, on-course decisions,
  more agency, less RNG (owner: get the daily under ~3 min from build→result "without seeming too sped up,"
  more of a skill challenge and less luck, to bring people back Wordle-style).** Measured the old loop first:
  ~3:40 total, of which the 18-hole sim was ~160s of ~95%-passive watching, with only 3 binary decisions of
  real agency. Diagnosis (agreed with owner): it's an agency-vs-watching ratio problem, so the fix is to
  REPLACE passive watch-time with active decision-time and fast-forward the routine holes. Built as a
  sequenced batch, each step owner-approved and shown before shipping:
  • **Two watch modes, picked up front (owner: keep the full version for purists, don't penalize either).**
    A "How do you want to watch?" toggle on the daily preview → `bag_daily_mode` (per account, default
    **Quick Play**; career Moments always play Full). `dailyMode()`/`dailyHoleFull(hole)`: in Quick, only the
    holes that matter get the full shot-by-shot cinematic — decision holes + eagles + double-bogey-or-worse;
    every routine hole fast-sims. Full plays every shot as before.
  • **Quick Play = "you play the holes that matter" (owner picked option B: a touch of motion, not a hard
    cut).** A routine hole shows a brief full-hole glance (all tracers, `QUICK_GLANCE_MS=560`), then the
    finishing shot drops into the cup, then the result — ~1.9s vs ~9s. `playDailyHole` has a quick-routine
    branch (`S.dailyQuickStatic` + a `revealN=shots.length+1` sentinel in scrDailyRound forces the static
    full-hole render; the clamp override is the only render change). Measured: Quick round **~74s → ~84s**
    with 6 decisions (from ~160s), Full ~168s, both complete all 18 holes with 0 errors.
  • **Post-hole beat 1.9s → ~1s** (`dailyDwell` notable-aware: 1000ms routine / 1500ms on the dramatic ones).
  • **On-course decisions replace the pop-up modal (#6/#7 — owner: "make the person feel they're ON the
    course, not watching it").** The signature-hole call is now made ON the TOURTRACE window: two tappable,
    pulsing targets placed on the course (red ⚡ aggressive + teal 🛡 safe, positioned by `dDecTargets` via
    `hvProj` with collision-nudge) + a stat/risk card bar docked below (`dDecisionBar`) — no dimming overlay.
    `#7 skill-test`: each option shows the relevant stat + odds via `dDecStat`/`dDecOdds` (e.g. "Approach 83 ·
    54% birdie look · 15% bunker" vs "Low risk · 34% birdie look · par safe"), skill-responsive (elite App 96
    → 70%/18%, weak 66 → 34%/32%). Wired into `drawWindow` (new `dec` param places targets, suppresses the
    floating scoreboard so the cards have room) + a `decPending` block in scrDailyRound (removed the old
    `dDecisionModal` call sites; the fn is left defined, unused). Tapping a target OR a card advances the
    round; verified both methods, both modes.
  • **#6 more decisions: 3 → 6 per round.** `dDecHoleSet(courseKey)` (cached, deterministic) = the 3
    signature holes + the top 3 remaining SCORING-opportunity holes by `dHoleWorth` (reachable par-5s,
    drivable/short par-4s, hazard holes), seeded tiebreak. All 39 courses now have exactly 6 decision holes,
    all signature holes included, spread across the round (e.g. 3,4,8,12,13,15). `nextDailySig`/`teeSig`/
    `dailyHoleFull`/`dailyDwell`/mulligan all route through `dIsDecHole`. The preview's "Signature holes"
    marquee list is unchanged (still the 3); the extra 3 are in-round scoring decisions.
  • **#8 less RNG (owner: "build + decisions should beat luck").** `DCFG.LATENT_S` 0.92→**0.80** tightens
    per-hole variance ~13% (round SD 2.85→2.47), and `DCFG.SCORE_SHIFT` -0.06→**-0.033** re-centers so an
    OVR-80 build still averages each venue's real tour scoring average — Monte-Carlo verified (10 courses ×
    4000 rounds via the live `dSimHole`): calibration drift actually IMPROVED 0.33→0.22, skill separation
    (weak-vs-strong mean gap ÷ round SD) +12% (1.13→1.26), "beat the tour average" for an OVR-80 build stays
    balanced (~55%). Affects the whole dSimHole family (daily/moment/spotlight/legend/H2H) — less luck
    everywhere, consistent. No cdiff re-derivation needed (mean re-centered via SCORE_SHIFT).
  • **Result pill moved top-right** (owner image), mirroring the hole-info chip (`.hvresult` top:8px right:8px).
  Net: the daily loop is ~2:15-2:30 total in Quick (down from ~3:40), engaged decision time roughly doubled
  (6 on-course calls vs 3 pop-ups), and build + decisions now beat luck more reliably — while purists keep
  the full watch. Tunable: `bag_daily_mode` default, `QUICK_GLANCE_MS`, `dailyDwell` values, `DEC_HOLES_TARGET`
  (6), `dHoleWorth` weights, `DCFG.LATENT_S`/`SCORE_SHIFT`, the `dDecOdds` reward/risk curves. Deployed to
  /golf. FOLLOW-UPS still open from the plan: #12 retention hooks (streak/share polish); the on-course card
  bar can sit just below the fold on a short phone (the tap-targets, the primary interaction, are always on
  the visible window) — a candidate polish is docking a compact card row inside the window.

- **CS363 — directional swinging golfer (back-to-camera / side / front) + pixel home-screen background &
  logo mark (owner: two-part request).** PART 1 (animation): the mini TourTracer golfer (CS355) was a single
  SIDE-view sprite that only mirror-flipped left/right by the shot's target (CS356aj) — no back-to-camera and
  no true directional facing. Authored TWO new view sets (composed in `scratchpad/swingdir.py`, a
  primitive/char-grid builder with a soft-rim outline, iterated against a contact-sheet render): **BACK**
  (back turned to the camera, for up-the-hole shots — the dominant case and the "broadcast" look the owner
  wanted) and **FRONT** (facing the camera, for shots aimed back toward the tee), each with full swing (3
  frames: address/top/through, with leg weight-shift + the club wrapped over the shoulder on the
  follow-through), chip (2), and putt (2, hunched). Inlined as `PXB_*`/`PXF_*` char-grid constants;
  `pxStrokeURLs` now renders three cached view sets (`{side,back,front}` each `{full,chip,putt}`),
  palette-swapped from the created look exactly like the side view (skin/hair/cap/shirt/pants/shoe + the
  translucent outer rim so the golfer sits ON the grass). `hvSwingMarkup` was rewritten to pick the view
  from the shot's AIM (screen vector origin→resting point): `up>0.42`→BACK, `up<-0.42`→FRONT, else SIDE;
  handedness (`look.lefty`) mirrors the back/front swing side (righty base, lefty flipped), and a lateral
  side shot faces its target (mirror when it goes left) as before. Ball address anchor is bottom-CENTER for
  back/front (clubFrac 0.5) vs bottom-right for side (0.90, unchanged), and the gold shot-number pin centers
  above the golfer for back/front. Covers ALL scenarios (full/chip/putt × back/side/front × righty/lefty).
  The existing CSS keyframes (sw0/sw1/sw2, ch0/ch1, pt0/pt1) are reused by class name across every view, so
  the hold-the-final-pose animation (CS356n) works unchanged; H2H multi-ball watch is unaffected (it passes
  a ball color and is excluded, per CS355d). Verified in Playwright: view-selection unit test with the REAL
  `hvSwingMarkup` (only projection/camera stubbed) — up_R→back/no-mirror, up_L→back/mirror, down→front,
  left→side/mirror, right→side/no-mirror, putt-up→back-putt; the real sprites render composited on grass via
  the real functions with the soft rim + number pin, zero page errors. PART 2 (visuals): replaced the smooth
  vector dusk-course home-screen backdrop (`.coursebg` SVG in `scrTitle`) with a **pixel-art** version —
  new cached `pxTitleBgURL()` draws a 128×128 canvas (ordered-Bayer-dithered dusk sky gradient + sun glow,
  dithered tree line, mow-striped receding fairway, a swallowtail gold flag on a putting green, ball, sand
  bunker) upscaled via CSS `image-rendering:pixelated` + `object-fit:cover`; and a **pixel logo crest**
  (`pxCrestSVG()` + `PXCREST` char grid: gold-bordered green shield + cream flagpole + swallowtail gold flag
  + green surface + ball, rendered as crisp-edge rects) now shows in the title header in place of the vector
  `crestSVG()` (which stays defined, unused). Both match the game's established pixel theme (golfer sprite,
  trophies, hole-view). Verified: title renders the pixel bg `<img>` (128px source) + the pixel crest with
  zero page errors; a hole render still shows the directional golfer clean. Committed + pushed to the
  feature branch; NOT yet deployed to /golf (awaiting owner go-ahead per the deploy guardrail). Tunable:
  the swing view thresholds (±0.42 up) + `clubFrac`/anchor in `hvSwingMarkup`, the `PXB_*`/`PXF_*` frames in
  `swingdir.py`, the palette/composition in `pxTitleBgURL`, the `PXCREST` grid.

- **CS364 — golfer re-authored at higher resolution (finer pixels + more detail) + much smoother home
  background (owner feedback on CS363).** (1) The swing golfer was "too blocky" and, at the 24×30 grid,
  accessories would be "impossible to see." Re-authored ALL 21 swing frames (SIDE + BACK + FRONT × full
  swing 3 / chip 2 / putt 2) at **44×56** (up from 24×30, matching the menu-avatar resolution) via a new
  detailed composer (`scratchpad/swing2.py`) — finer pixels with real detail: polo COLLAR + button placket,
  a BELT, shaped golf SHOES (upper + sole shade), a proper driver HEAD, forearms, hair under the cap. Two
  new palette chars threaded into `pxStrokeURLs` (`e` shoe-shade = `pxShade(shoesHex,-24)`, `b` belt =
  `#2a2c32`); `PXS_W/PXS_H` bumped 24/30→44/56 and the `PXS_*`/`PXB_*`/`PXF_*` constants replaced. Since
  `.hvsw` renders smoothed (not pixelated), the finer source grid shows as more detail when downscaled. Also
  bumped the on-screen size a touch (`GH` 26→32 full, putt cap 22→24) so the detail + future accessories
  actually read, and the sprite-painted ball was dropped in favour of the engine ball (the club head sits at
  address). `hvSwingMarkup`'s ball anchor updated to the new grid (side ~row48, back/front ~row47).
  Verified: view selection still correct (up→back, down→front, lateral→side, lefty mirror, putt→back-putt),
  the real sprites render composited on-course with the detail visible + soft rim + number pin, zero page
  errors. (2) The pixel home background "read as static" (the ordered dithering) and the owner disliked the
  sun behind the gold hero text. `pxTitleBgURL` rewritten: **no dithering** (smooth multi-stop gradient
  sky), **no sun disc** (just a warm horizon glow), higher-res 200×240, clean tree line + smooth
  mow-striped fairway + green/flag/ball/bunker; `.coursebg` switched to `image-rendering:auto` so it renders
  smoothly. The pixel crest logo (CS363) is unchanged. Verified: title renders the smooth bg with the gold
  hero text fully legible, zero page errors. Committed + pushed to the feature branch; still NOT deployed to
  /golf (awaiting owner go-ahead). Tunable: `GH` size + the `PXS_*` frames in `swing2.py`; the gradient
  stops / composition in `pxTitleBgURL`.

- **CS365 — anatomically-accurate swing re-authored from a real swing-sequence reference (owner shared a
  vintage golf swing-position poster; asked to make it accurate + proportional + not disconnected).**
  Rebuilt the composer (`scratchpad/swing3.py`) as **skeleton-first**: each pose is a set of keypoints
  (hip / shoulder / head / hands / elbow / knees / feet / club) drawn as CONNECTED tapered limbs (a
  `limb()` capsule stamps discs along each segment; a `quad()` fills the torso/belt) so body parts stay
  proportional and joined at the joints - fixing the thin/disconnected arms of CS364. Posture now follows
  the reference: a forward HIP-HINGE (torso tilted over the ball) held at address/through, a coiled TOP
  with the hands high behind the head and the club up-and-back away from the target, and a tall ROTATED
  FINISH with the club wrapped over the shoulder and weight forward. Arms are anatomically routed: for a
  low central grip (address/putt/chip) they hang from the shoulders through an elbow then in to the hands;
  for raised-club poses they extend straight to the high hands. All 21 frames (SIDE + BACK + FRONT × full
  3 / chip 2 / putt 2) re-authored; still 44×56, same palette, so `pxStrokeURLs`/`hvSwingMarkup` are
  unchanged except the side ball-anchor row (48→49). Verified in Playwright: view selection still correct
  (up→back, down→front, lateral→side, lefty mirror), the real sprites render on-course + at zoom with clear
  golf posture, connected proportional limbs, and the club addressing the ball, zero page errors. Committed
  + pushed to the feature branch; still NOT deployed to /golf. Tunable: the per-pose keypoints in
  `swing3.py`, limb widths in `body()`, `GH` size.

- **CS366 — boxy polo torso (owner: CS365 body "looks like an egg or a bean, too round, doesn't look like
  our characters").** The torso was a tapered CAPSULE (rounded → egg/bean). Rebuilt it in `swing3.py`'s
  `body()` as a proper TRAPEZOID matching the menu-golfer character style: broad **squared shoulders**
  tapering to a narrower waist (perpendicular to the spine so it still leans/rotates with each pose), with
  short **sleeves** (shirt caps over the top of each upper arm), a collar notch, a belt band, and a spine/
  placket shade. Arms are now drawn FIRST and the boxy torso + sleeves paint over the shoulders, so the
  shoulders read as shirt and only the FOREARMS are bare skin (a real short-sleeve polo). All 21 frames
  regenerated (side/back/front × full/chip/putt), same 44×56 grid + palette, so `pxStrokeURLs`/
  `hvSwingMarkup` unchanged. Verified in Playwright: view selection still correct, sprites render on-course
  + at zoom as a proper golfer (squared shoulders, sleeves, belt, slacks — no egg), zero page errors.
  Committed + pushed to the feature branch; still NOT deployed to /golf. Tunable: `sw`/`ww` (shoulder/waist
  width) + sleeve length in `body()`.

- **CS367 — rolling grass topography on the home background + stronger home-button shadows (owner).**
  (1) The course in `pxTitleBgURL` was flat/straight-across; added TOPOGRAPHY: a rolling ground line
  `hz(x)` (sine undulation) that the horizon + tree line follow, a distant rolling hill band behind the
  trees for depth, and a fairway with rolling contours - curved mow-stripe sweeps (the band boundary
  drifts with x) plus soft lit mounds / shaded swales - so the grass reads as undulating terrain instead
  of flat bands. (2) Increased the drop shadows behind the home mode cards + nav so they separate from the
  background: `.gcard` and `.resumecard` got a layered close+deep dark shadow, `.navtile` a stronger
  two-layer shadow, and the `.howtop` pills a dark drop. Verified in Playwright: title renders the rolling
  course + the cards pop with the deeper shadows, zero page errors. Committed + pushed to the feature
  branch; still NOT deployed to /golf. Tunable: the `hz` amplitude + mound positions in `pxTitleBgURL`,
  the card `box-shadow` values.

- **CS368 — reverted the header crest to the vector shield (owner: the pixelated crest looked bad).** The
  header `crestrow` used `pxCrestSVG()` (the CS363 pixel crest); switched it back to the original vector
  `crestSVG()` (clean gold-outlined shield + flag + putting green + ball). `pxCrestSVG`/`PXCREST` left
  defined but unused. Verified: title renders the crisp vector crest, zero page errors. Pushed to the
  feature branch; NOT deployed to /golf.

- **CS369 — deeper, detailed home-screen bunker (owner: make it look like a deep bunker, not a flat
  ellipse).** Replaced the flat sand ellipse in `pxTitleBgURL` with a proper greenside bunker: a grass
  lip/overhang along the top edge with a cast shadow on the sand, a shaded (in-shadow) back wall grading to
  a lit sand floor sloping toward the viewer, concentric rake lines across the floor, and a darker rim for
  depth. Verified: renders as a deep bunker, zero page errors. Pushed to the feature branch; NOT deployed
  to /golf. Tunable: the bunker size/position + `SAND*`/`LIP*` colors in `pxTitleBgURL`.

- **CS370 — standing golfer: club follows handedness + favorite-club picker (owner: the club was always
  in the left hand regardless of handedness; let players pick a favorite club).** The club was baked into
  `PXG_BODY` on the golfer's left side, so it never moved. Extracted it into a separate layer: `PXG_BODY`
  is now clubless, and `PXG_CLUBS` holds 5 overlays (driver / 3-wood / iron / wedge / putter, same shaft,
  different heads). `pxGolferCanvas` paints the chosen club (`look.club`, default driver) and MIRRORS it to
  the right hand for a right-handed golfer (`!look.lefty`) — authored on the left hand for lefties. Added
  `club` + handedness to the avatar cache key. Added a "Club" category to the setup Look tab (5 tiles with
  cropped-club thumbnails via `pxClubThumb`), wired to `S.look.club` + `saveLook()` (device-local, cloud-
  synced with the rest of `bag_look`). The favorite club shows on the standing golfer everywhere (setup,
  build hero, Trophy Room, etc.); the SWING animation still uses a shot-appropriate club (driver for full
  shots, putter on the green), which is correct. Verified in Playwright: righty holds the club in the right
  hand / lefty in the left, all 5 clubs render distinct, the setup Club picker updates the avatar live,
  zero page errors. (CS370b: iron/wedge/putter heads recolored bright silver/chrome via a new `S` palette
  color so they're distinct from the dark driver/wood.)

- **CS371 — bigger brown-trunked trees + swing golfer in scale, sits at the ball (owner IMG_8365: "Trees
  way too small in comparison to golfer. make the trees slightly bigger. All of the trees stems are a white
  pixel but it should be a brown pixel. Golfer out of position and is above/in front of the ball and tee
  box").** Three fixes in the pixel course renderer (`pxTerrainURL`) + the mini swing golfer
  (`hvSwingMarkup`); rendering-only. (1) **Bigger trees**: `drawTree` parkland disc radius `(big?4:2)+..2.6`
  -> `(big?6:3)+..3` and `drawTreeS` `baseR` `(?4:2)` -> `(?6:3)` with the clamp `GH*0.14` -> `GH*0.18`;
  the general pine/cypress low-res shape was redrawn taller/wider (7 rows vs 5). (2) **Brown trunks**: the
  off-white trunk palettes (`#e8e2d2`/`#d9d2be` in the parkland/coastal/links biomes + the Riviera
  course-tweak) changed to brown (`#6b4a2a`/`#75512e`), and the pine/general trees now draw a
  multi-row/height-scaled brown trunk (`for k<max(1,r*0.4)`). (3) **Golfer position/scale**: `GH` 32->24
  (in scale with the now-bigger trees, addressing "trees too small vs golfer") and `botPad` 42->14 so the
  golfer sits AT the ball/tee instead of being lifted ~42px above it (the "above/in front of the ball"
  complaint); putt-view cap tightened `Math.min(24,cam[3]*0.16)` -> `Math.min(20,cam[3]*0.14)`. Verified in
  Playwright by rendering a real tee shot on a pixel course: the golfer now stands at the tee box (shot pin
  "1" above its head), proportional to the bigger brown-trunked trees, no longer floating above the ball;
  0 page errors. Deployed to /golf. Tunable: the `drawTree`/`drawTreeS` radii + `GH*0.18` clamp, the biome
  `trunk` palettes, `GH`/`botPad` in `hvSwingMarkup`.

- **CS378-A1 — approach decision: drive at REST + golfer standing over the ball (deferred CS378 fix
  shipped).** Owner (CS378): "The approach decision came up with the ball frozen in the air. The golfer
  should be standing over the ball while the decision is being decided on." On a par-4/5 signature hole the
  approach decision reveals a neutral drive first (`dailyStartApproachHole` → `S.dailyProv`), then surfaces
  the Attack/Safe call. Previously the decision-up state (`prov.await`) still rendered the drive with
  `revealN=1` (an in-flight `hvLiveShot` — ball mid-air, tee golfer swinging). Fixed the `prov.await` branch
  of `scrDailyRound`: it now renders the drive as a DONE shot (`revealN=null` → `hvDoneShot`, ball at rest
  on the fairway + tracer + numbered marker, no tee golfer) and overlays a new **static address-pose
  golfer** at the drive's rest position (the approach origin), aiming up the hole (back-to-camera, the
  natural "over the ball" broadcast look). New `hvAddressGolfer(hole,holeIdx,courseKey,look)` builds the
  golfer markup from the drive plot's rest coords (reuses `hole._hv.g`/`plots` or recomputes), using only
  the address frame of the created golfer sprite (`pxStrokeURLs(look).back.full[0]`, `.hvsw-static` CSS =
  no swing animation). Threaded a 7th `overlay` param through `hvNode` (appended inside the svg, so SVG
  namespacing is correct) and a 9th `overlay` param through the inner `drawWindow`. The drive-in-flight
  phase (`prov && !prov.await`) is unchanged (swinging golfer at the tee + animating ball). Reduced-motion
  hides the golfer (consistent with the swing sprite) but still gets the ball-at-rest fix. Verified in
  Playwright: decision-up → `hasLiveBall:false` (no frozen-air ball) + `.hvsw-static` golfer present + the
  done-shot marker + the decision targets/bar, screenshot confirms the golfer standing over the ball on the
  fairway with "At the pin / Middle" targets; drive-in-flight → still `liveBall:true` + animated `.sw0`
  swing frames; resolving the decision pushes the hole with the drive preserved as shot 0 and continues the
  reveal; 0 page errors on every path. Deployed to /golf.

- **CS379 — putt facing directions + no double-putt + decision-card odds on one line each (owner batch).**
  Three fixes:
  1. **Putt facings match real golf posture (owner's exact spec).** The TourTracer putt golfer chose its
     view purely by aim (up→back / down→front / lateral→side), so a putt to the right showed the golfer's
     side, etc. Rewrote the `kind==='putt'` branch of `hvSwingMarkup`: a right-handed golfer's chest faces
     90° clockwise from the putt line (left shoulder leads the target), a lefty is the mirror. By putt
     DIRECTION — righty: up→look right · right→face camera · down→look left · left→back to camera; lefty
     (inverse looking, same putt direction): up→look left · right→back · down→look right · left→face camera.
     A quadrant test (`|up|` vs `|right|`) picks the direction; an M-table maps (direction, handedness)→facing,
     and facing→(view, mirror). Non-putt shots (full swing / chip) keep the existing logic. Verified in
     Playwright by classifying the rendered sprite view + mirror across all 4 screen directions for both
     handedness — every case matches the spec.
  2. **The golfer no longer putts again after the ball drops.** Once the ball is holed and the round holds
     the post-hole beat (`S.dailyHolePause`), a re-render was re-firing the swing's CSS animation, so the
     golfer visibly "putts one more time after the ball goes into the hole" (owner). `hvSwingMarkup` now
     renders only the FINISH frame statically (`.hvsw-static`, no animation) during the holed beat, and
     drops the animating number-pin then too. Verified: during holePause the markup contains `hvsw-static`
     and no animating `pt0/pt1/sw0` frames.
  3. **Decision-card odds each on their own line + risky option's trouble % much higher.** The on-course
     decision cards packed `Approach 85 · 56% birdie look · 8% trouble` onto one line, and the aggressive
     (risky) option's trouble % read far too low. Split `.dco` into a flex column of three rows
     (stat / birdie-look / trouble). Bumped the aggressive risk in `dDecOdds` (`hazBase` water 58 / bunker
     46 / normal 38, less skill-reduction, floor 16) so it reads genuinely risky, and lowered the birdie-look
     on a guarded pin + capped `good+risk ≤ 90%` so the two numbers stay internally sensible. Result e.g.
     a skilled player firing at a tucked-over-water pin: `Approach 85 / 48% birdie look / 42% water` (was
     ~8% trouble). Screenshot confirms the three-line layout on both cards.
  Full auto practice round regresses clean (reveals, putts, holed beats, decisions) with 0 page errors.
  Deployed to /golf.

- **CS380 — off-season: can't start the season with a spin left un-taken (owner).** You could press Spin
  in the off-season, dislike the golfer you landed on, and just press "Start Year" without taking any of
  its skills - dodging the "if you spin you must lock in a change" rule. Now, whenever a spin is pending
  (`spun` = a golfer revealed, awaiting a skill pick), the "Start Year ▸" button is LOCKED (`.btn.locked`:
  dimmed/greyscale, still tappable) with the sub "🔒 Lock in one of the skills first"; tapping it shows a
  temporary toast "You must select one of the skills to lock in your spin before starting the season."
  instead of starting the season. Taking a skill (or the re-spin path) clears the spun state and unlocks
  Start normally. Verified in Playwright: spun → Start has `.locked`, tapping it stays on the off-season
  screen (never calls startSeason) and shows the toast; after taking a skill spun clears, Start unlocks and
  the change applies; 0 page errors. Deployed to /golf.

- **CS381 — off-season re-spins scale with career stage + form (owner).** Re-spins were driven by Tour Rep
  rank (`repPerk().reSpins`); the owner wants them tied to where you are in your career and how the golfer
  is doing: early career → 1, prime/peak → 2 (rising to 3 when you're playing well), the decline years taper
  back down, the final stretch AND the Legend Circuit → 1. New `offRespins()`: Legend Circuit → 1; year ≤4
  (early) → 1; final ~4 years (year ≥ `CAREER_MAX_YEARS-3`) → 1; decline years (year ≥ `DECLINE_START_YEAR`
  =15) → 2 if still performing else 1; prime (years 5-14) → 2, or 3 in form. "Playing well" = a strong
  just-finished season (`seasonForm(last) ≥ 0.30`, from rank/wins/majors) OR a sustained good run
  (`primeBank/3 ≥ 0.30`). Wired into `continueFranchise` (replaces `_perk.reSpins`); CHANGES stay a Tour-Rep
  prestige reward. The off-season status line drops the now-inaccurate "reach {rank} for +N re-spins" teaser
  (keeps the +N changes teaser) and adds a stage note (`offRespinNote()`, e.g. "🎡 3 re-spins this off-season
  · peak form, in your prime"). Resume-safe (the count is stored in `S.offseason.reSpins`). Verified in
  Playwright across the full arc — circuit 1/1, early 1, prime 2(poor)/3(well), decline 2(well)/1(poor), end
  1 — and the off-season screen renders the count + note; 0 page errors. Deployed to /golf.

- **CS382 — off-season CHANGES + re-spins both earned by career stage + last season (supersedes CS381).**
  Owner: the first ~5 years should be a fixed 1 change + 1 re-spin (establishing), then BOTH budgets scale
  with how you did last season; re-spins should also factor in tour (world) ranking. Decoupled both from
  Tour Rep. **`offChanges()`** by last-season money-list FINISH: top-10 → 3, 11-25 → 2, 26-75 → 1, 76+ → 0
  (owner's tweakable parameters). **`offRespins()`** by last-season WINS / MAJORS / EARNINGS + TOUR RANKING:
  a major / 2+ wins / world top-5 → 3; a win / top-10 money / world top-20 → 2; a solid money-or-ranking
  season (top-40 money / world top-60) → 1; else 0. First `OFF_EARLY_YEARS=5` years and the Legend Circuit
  are a flat 1/1. `continueFranchise` sets `maxChanges=offChanges()` and `reSpins = changes>0 ? offRespins()
  : 0` (no changes earned → re-spins are moot, kept 0 for coherence). The off-season status line drops the
  Tour-Rep changes/re-spin teaser and shows `offBudgetNote()` (e.g. "🎡 3 changes · 2 re-spins · earned by
  last season (1 win · 6th on the money list)"); a 0-change off-season shows "No changes earned this
  off-season, a stronger finish next season unlocks them. Run it as-is." (no Spin button, Start works).
  All thresholds are easy-to-tweak constants. Verified in Playwright across the full matrix — early/circuit
  1/1, changes by finish (3/2/1/0 at rank 6/18/50/90), re-spins by wins/majors/money/world-rank incl. the
  world-top-5→3 / top-20→2 / top-60→1 tiers — plus the rendered off-season screen (top-10 and poor finishes),
  0 page errors. Deployed to /golf.

- **CS383 — inline SVG flags + rail score-to-par + off-season budget revision (owner batch, 2 screenshots +
  a mid-turn revision).**
  1. **Flags no longer depend on the network (owner: "flags don't come up a lot of the time, or take 10
     seconds").** The team-cup / Games / Olympic-leaderboard flags were `flagcdn.com` images (slow/unreliable
     on mobile). Replaced `natFlag()` with self-contained **inline SVG flags** (`FLAG_SVG`, viewBox 0 0 3 2,
     simplified to read at chip size) for all 32 nation codes + EU, via a few generators (vertical/horizontal
     tricolor, bicolor, Nordic cross, St George cross, saltire, plus hand-built US stars-&-stripes, KOR
     taegeuk, RSA/ZIM, Aus/NZ union+stars, EU star ring, etc.). INT → globe icon, unknown → the striped
     placeholder. `.flag-ico` now clips an inline `<svg>` that fills it. Instant, offline-proof; `natFlagUrl`
     removed. Verified all 32 render inline with 0 flagcdn references + a flag-grid screenshot.
  2. **Season event rail shows final score to par next to the place (owner).** `seasonRailNode` completed
     events now read e.g. "WIN (−18)" / "T7 (−6)" / "62nd (+4)" (from the result's `me.total`, colored by
     to-par), CUT unchanged. Widened `.srev` max-width to fit.
  3. **Off-season budget revised (owner: "3 re-spins always no matter what; changes vary by last season's
     statistics").** Supersedes CS382's career-stage/world-rank model: **re-spins are always 3** (`OFF_RESPINS`),
     and **changes** vary by last season's money-list finish (top-10 → 3, 11-25 → 2, 26-75 → 1, 76+ → 0;
     default 1 with no prior season). `lastCareerSeason()` reads the circuit's own last season in the Legend
     Circuit. `continueFranchise` sets `reSpins:3` unconditionally; the budget note reads "🎡 N changes · 3
     re-spins · N changes earned by last season (…)". Verified: re-spins 3 in every case (incl. circuit/no-prior),
     changes 3/2/1/0 at rank 6/18/50/90.
  All verified in Playwright, 0 page errors. Deployed to /golf.

- **CS384 — off-season CHANGES now use the old re-spin parameters (owner).** Keeping CS383's "always 3
  re-spins," `offChanges()` now varies by last season's WINS / MAJORS / EARNINGS + TOUR (world) RANKING
  (the CS382 re-spin tiers) instead of money-list finish alone: a major / 2+ wins / world top-5 → 3; a win /
  top-10 money / world top-20 → 2; a solid money-or-ranking season (top-40 money / world top-60) → 1; poor →
  0 (default 1 with no prior season). Verified: changes 3/3/2/3/2/1/1/0 across major/two-wins/one-win/
  world-top5/world-top20/solid/world-top60/poor, re-spins 3 in every case; 0 page errors. Deployed to /golf.

### Still parked (need owner go-ahead)
Online leaderboard/accounts (backend+deploy), real Strokes-Gained roster data,
hosting/domain. Tunable knobs flagged in code: `COSTS.travelPerEvent`, sim
constants in `simRound`, `SPINS`/`reSpins`.

### How to run locally
Single self-contained file — just open `build-a-golfer.html` in a browser, or
serve the folder with any static server (e.g. `python3 -m http.server`) and open
it. No build step, no dependencies. Google Fonts (Anton/Barlow) need network; if
blocked, it falls back to Impact/Arial Narrow — flagged in §3 for self-hosting.
