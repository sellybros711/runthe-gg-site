# Shut The Door: plan and agent briefs

Status: approved with the owner's changes (2026-10-17). The contract is `CONTRACT.md` beside this file.

## The owner's calls (2026-10-17)

| | |
|---|---|
| access | **not tester-only.** A public page at `runthe.gg/shut-the-door`, kept off the home page, nav, sitemap and newsletter (and `noindex`) until the owner puts it live. The pattern is Run The Floor before its launch, not Stumpire |
| share link | `runthe.gg/shut-the-door`, as written |
| camera | **pitcher's view**: from behind the mound, looking in. The grid is drawn mirrored from Statcast's catcher's view |
| 2008 to 2014 | pitch-tracked (PITCHf/x on Savant), so those spots are `real`. Only pre-2008 spots are `proxy` |
| data | Run The Diamond's `baseball/data/players.json` is season bWAR per player (name, year, team, role). Good for names, teams and the closer list. It has no pitches, counts or locations, so the pitch library comes from Statcast |

## How it is wired (mirrors the top-level games)

| | |
|---|---|
| folder | `shut-the-door/` at the site root, plain scripts, each sibling with `?v=N` recorded by `check-cachebust` |
| shell | its own header, footer, theme (`runthegrid_theme`, light and dark) and `auth.js` copy, as every top-level game carries. One sign-in covers the site |
| daily | the Eastern day, `dayNumberOf(day)` from an epoch, the daily seed from the day, the outing in localStorage keyed by day so rollover needs no reset |
| account | migration `153_shut_the_door.sql`: `shutdoor_outings`, `shutdoor_streaks`, `shutdoor_submit`, `shutdoor_board`, `shutdoor_my_stats`, granted to `authenticated`, with a `supabase/test/` pair and a line in `launch_preflight.sql` |
| hidden | `shut-the-door/check-posture.mjs`: INDEXED and LINKED both false, run on every PR (no path filter) |
| checks | `.github/workflows/shut-the-door-checks.yml`: posture, engine tests, dashes, copy, the migration applied twice against Postgres |

## Data path (the data hosts are blocked in this session)

`baseballsavant.mlb.com`, `www.retrosheet.org` and `statsapi.mlb.com` do not answer from this
container. So the pipeline runs where they do answer: a GitHub Actions workflow
(`shut-the-door-data.yml`, like `baseball-data.yml`) that runs on a push to the engine branch when
`shut-the-door/pipeline/**` changes, and on demand. It caches the pitch library (`actions/cache`,
never in git: Pages refuses any file over 25 MB) and commits back only the packs, the schedule and a
short build report. Slower per round than working locally. Adding the three hosts to the
environment's allowed domains would make it fast, any time.

## The build, in order

1. Lead: `contract.js`, `fixtures/mock-scenario.json`, the posture check. Vault docs (Section 7).
2. Agents A and B in parallel, each in its own worktree and branch (`claude/shut-the-door-engine`,
   `claude/shut-the-door-ui`). B runs on the mock. The lead answers `CONTRACT_REQUESTS.md`.
3. Agent A verifies the ten candidate scenarios from data and the lead brings the list to the owner
   before any pack is built.
4. Lead merges both into `claude/shut-the-door`, swaps the mock for the real API, runs every check,
   plays a whole outing in Chromium at 390x844 and 1440x900.
5. One site PR for the owner. The migration is applied when it merges.

### Who owns which file (all under `shut-the-door/` unless named)

| Agent A | Agent B | lead |
|---|---|---|
| `engine.js`, `grade.js`, `pool.js`, `rng.js`, `api.js`, `share.js`, `auth.js` (client and account calls, no UI) | `index.html`, `ui.js`, `mound.js`, `sprites.js`, `anim.js`, `menus.js`, `style.css`, `mock-api.js` | `CONTRACT.md`, `contract.js`, `fixtures/`, `check-posture.mjs` |
| `pipeline/`, `data/`, `scenarios/`, `test/` (engine), `README.md` | `test/check-browser.mjs`, screenshots | `CONTRACT_REQUESTS.md` answers, `scripts/cachebust.json` at merge |
| `supabase/153_shut_the_door.sql` and its tests, both workflows | | |

## Seed scenarios (candidates; Agent A verifies every fact first)

| # | spot | pitcher | hand | resolution | real result |
|---|---|---|---|---|---|
| 1 | 2025 WS Game 7, bottom 11th, up 5-4 | Yoshinobu Yamamoto | R | real | door shut |
| 2 | 2024 WS Game 5, bottom 9th, up 7-6 | Walker Buehler | R | real | door shut |
| 3 | 2016 WS Game 7, bottom 10th, up 8-7, 2 out, man on 1st | Mike Montgomery | L | real | door shut |
| 4 | 2016 WS Game 7, bottom 8th, up 6-3, 2 out, man on 1st | Aroldis Chapman | L | real | doors open |
| 5 | 2019 NL Wild Card, bottom 8th, up 3-1 | Josh Hader | L | real | doors open |
| 6 | 2011 WS Game 6, bottom 9th, up 7-5 | Neftali Feliz | R | real (PITCHf/x) | doors open |
| 7 | regular season, a top closer's highest-leverage save, 2023-2025 | Agent A picks from data | R | real | door shut |
| 8 | regular season, the same, a left-hander | Agent A picks from data | L | real | either |
| 9 | 1988 WS Game 1, bottom 9th, up 4-3 | Dennis Eckersley | R | proxy | walk-off |
| 10 | 2001 WS Game 7, bottom 9th, up 2-1 | Mariano Rivera | R | proxy | walk-off |

Alternates: 2017 WS Game 2 Kenley Jansen, 1993 WS Game 6 Mitch Williams (proxy, LHP), 2005 NLCS
Game 5 Brad Lidge vs Pujols (proxy), 2022 WS Game 6 Ryan Pressly. Daily rotation until there are
more: day number mod 10.

## Risks

- **The pool and the grade are one model.** If hold% is off, both are off. Agent A reports
  calibration: predicted hold% against how real 2015+ save situations ended.
- **Low-leverage spots grade everything green.** Agent A reports the band spread per scenario. A
  scenario with no orange or red available is a weak daily.
- **The pack is in the browser**, so someone could read the best call before throwing, and a
  submitted result is trusted as other games' are. The stored calls let `check-replays.mjs` flag a
  score the calls do not produce.

---

## Brief: Agent A (engine, data, backend)

You are Agent A on Shut The Door, a daily baseball game at `runthe.gg/shut-the-door`, unlisted until
launch. You are building the engine, the data and the account backend. Read first: root `CLAUDE.md`
(no em or en dashes anywhere, ever; a number in copy comes from the engine; cache versions),
`shut-the-door/CONTRACT.md` (your spec; change it only through the lead), this plan, and the vault
notes under `games/shut-the-door/` (in `/home/user/runthe-gg-kb`). Patterns to copy: `baseball/engine.js`
(a headless engine that is `window.RTD_ENGINE` in the browser and `module.exports` in node),
`baseball/auth.js` (the auth client copy), `supabase/148_putt_daily_board.sql` and the streak in
`supabase/52_grid_daily.sql` (Eastern day check as in `108_hoops_leaderboard.sql`),
`.github/workflows/baseball-data.yml` and `putt-check.yml` (the migration applied twice in CI),
`baseball/check-posture.mjs`.

**You own** the files in your column of the ownership table. **You never touch** B's files, or any
other game.

**Data.** Free only. Python 3.11, pandas, pybaseball, SQLite (no pyarrow). The data hosts are
blocked in this session, so the pipeline runs in `shut-the-door-data.yml` on GitHub Actions: on a push
to your branch that changes `shut-the-door/pipeline/**`, and `workflow_dispatch`. It caches the
library and commits back only `data/` outputs and `pipeline/report.md`. Read results through the
GitHub tools (job logs, the committed report). Statcast via Savant CSV search chunked by date (25k
row cap), 2008 to present, trimmed to what the game uses: pitcher, batter, stand, p_throws, type,
velo, pfx, plate_x, plate_z, sz_top, sz_bot, balls, strikes, outs, bases, inning, scores,
description, bb_type, launch speed, angle, spray, events, delta_run_exp. Retrosheet for the pre-2008
spots. Run The Diamond's `baseball/data/players.json` for names and the closer list where it helps.
Every fact in a scenario carries a source.

**Resolution, grading, pool, end rules:** exactly as the contract. Tiers: that batter, similar
batters (cluster on chase, zone swing, whiff by type, damage map), league. Hold% by value iteration
over (batter index, count, outs, bases, margin) with the best call at every state. Grade every
call before it resolves. Pool: real closers' pitch selection by count bucket and situation, 2015+,
at least 2000 runs per scenario at build time. "Pitched like": nearest closer by pitch family share
by count plus zone, edge and chase rates.

**Account.** The migration and `auth.js` as the contract's section 12 says. `TODO(v2 trophies)` where
the result is written.

**Tests** (`node shut-the-door/test/*.mjs`, plain node with ok/FAIL lines like the other games):
all fastballs down the middle grades mostly orange and red; a scripted best-call outing is all green;
a scripted median outing lands at the 40th to 60th percentile; determinism; the pack against the
contract; the migration's SQL test.

**Order.** (1) pipeline and workflow, a 2023 slice. (2) Verify the ten candidates and send the list
to the lead, then stop until it is approved. (3) Engine and tests on one scenario. (4) The pool.
(5) All packs and the schedule. (6) SQL, `auth.js`, checks workflow. (7) `README.md`: pipeline,
tiers, grading formula, pool, proxy path, adding a scenario. Report at each step: done, test output,
band spread per scenario, anything the contract needs.

## Brief: Agent B (UI, UX, animation, menus)

You are Agent B on Shut The Door, a daily baseball game at `runthe.gg/shut-the-door`. You are the
closer: one real save situation a day, the real batters in order, the pitcher's real arsenal, two
taps a pitch, every pitch graded. Read first: root `CLAUDE.md` (no em or en dashes; short sentences;
every number a player reads comes from the engine), `shut-the-door/CONTRACT.md` (your spec), this
plan, the vault's `games/shut-the-door/`. For the look: Run The Floor's rig (`hoops/baller.js`, the
vault's `hoops-presentation`), RunTheTour's golfer (`PXHD` in `golf/index.html`), and Mythiball's
baseball sprites and plate camera (vault `mythiball-sprites-*`, `mythiball-camera-plate`). Read them;
never edit another game.

**You own** the files in your column. **Build only against the four API calls.** `mock-api.js` serves
`fixtures/mock-scenario.json` until Agent A lands. Anything missing: a line in
`CONTRACT_REQUESTS.md`, then carry on with a stub.

**Shell.** Mirror a top-level game's own header, footer, sign-in sheet and theme (copy the pattern
into your files). Light and dark through `runthegrid_theme`. `noindex` in the head. Mobile first at
390x844; works at 1440x900. Every action one or two taps. Voice: lowercase, direct, short sentences,
no hype words.

**Camera: the pitcher's view.** Behind the mound, looking in: the batter in the box on the correct
side for his hand, the catcher and umpire behind. The grid is drawn mirrored from catcher's view
(contract section 2). Copy says inside and away, never left and right.

**Screens.**
1. Home: day, title, setup paragraph, the pitcher's card (arsenal: name, velo, usage), the situation,
   the doors shut streak, "take the mound". Already played: result, share, "back tomorrow".
2. Mound: batter sprite with handedness, count, outs, base diamond, score, pitch number, the grade
   strip pinned on top. Batter card one tap away: chase rate, whiff by pitch type, the heat map on
   the same grid. Arsenal buttons along the bottom, tap a cell, confirm. "shut it" when
   `state.shutItLive`.
3. Pitch: the ball leaves the hand and flies the pitch's `shape` toward the plate, landing at
   `actual` so a miss shows. The batter takes, swings, fouls or puts it in play. The call. In play: a
   short result with runners moving on the diamond. Under about 3 seconds, skip on tap.
4. Grade card: band pill, best call, reason, tap anywhere to dismiss. The first time a green pitch
   gets hit: "good pitch. the grade is the decision, not the result."
5. Result: DOOR SHUT, HELD THE TIE (since 2026-10-20), DOOR'S OPEN or WALK-OFF, strip, percentile, pitched like, the reveal, beat,
   matched or lost, share, "run it back" (practice), streak.
6. Menus: how to play (behind a button, never opened by itself), stats, past dailies (locked shell),
   settings (sound). `?debug=1` shows seed and tier per pitch.

**Rules.** No modal the player must read. The throw grid and the heat map are one component. The
proxy note is small and quiet ("modern pitch data"). Pixel sprites on canvas, generic uniforms in
`pitcher.teamColors`, no logos, no likenesses. No tutorial opens by itself.

**Checks you add:** `test/check-browser.mjs` (Playwright with `executablePath:
'/opt/pw-browsers/chromium'`, 390x844 and 1440x900, plays a whole outing on the mock, every screen, no
console errors) and `node scripts/check-dashes.mjs shut-the-door` clean. Report with screenshots of
every screen.
