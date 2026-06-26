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

### Still parked (need owner go-ahead)
Online leaderboard/accounts (backend+deploy), real Strokes-Gained roster data,
hosting/domain. Tunable knobs flagged in code: `COSTS.travelPerEvent`, sim
constants in `simRound`, `SPINS`/`reSpins`.

### How to run locally
Single self-contained file — just open `build-a-golfer.html` in a browser, or
serve the folder with any static server (e.g. `python3 -m http.server`) and open
it. No build step, no dependencies. Google Fonts (Anton/Barlow) need network; if
blocked, it falls back to Impact/Arial Narrow — flagged in §3 for self-hosting.
