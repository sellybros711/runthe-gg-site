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

### Still parked (need owner go-ahead)
Online leaderboard/accounts (backend+deploy), real Strokes-Gained roster data,
hosting/domain. Tunable knobs flagged in code: `COSTS.travelPerEvent`, sim
constants in `simRound`, `SPINS`/`reSpins`.

### How to run locally
Single self-contained file — just open `build-a-golfer.html` in a browser, or
serve the folder with any static server (e.g. `python3 -m http.server`) and open
it. No build step, no dependencies. Google Fonts (Anton/Barlow) need network; if
blocked, it falls back to Impact/Arial Narrow — flagged in §3 for self-hosting.
