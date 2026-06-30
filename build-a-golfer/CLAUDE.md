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

### Still parked (need owner go-ahead)
Online leaderboard/accounts (backend+deploy), real Strokes-Gained roster data,
hosting/domain. Tunable knobs flagged in code: `COSTS.travelPerEvent`, sim
constants in `simRound`, `SPINS`/`reSpins`.

### How to run locally
Single self-contained file — just open `build-a-golfer.html` in a browser, or
serve the folder with any static server (e.g. `python3 -m http.server`) and open
it. No build step, no dependencies. Google Fonts (Anton/Barlow) need network; if
blocked, it falls back to Impact/Arial Narrow — flagged in §3 for self-hosting.
