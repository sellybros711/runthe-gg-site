# Shut The Door: plan and agent briefs

Status: DRAFT for owner approval (2026-10-17). Nothing is built until approved.
The contract is `CONTRACT.md` beside this file.

## What Step 0 found

| question | answer |
|---|---|
| model for a tester-only top-level game | **Last Shot** (`/last-shot`, branch `claude/last-shot-agent-setup-aewpfl`, not merged): code in `functions/_lastshot/`, a page Function that verifies the `stmp` cookie and asks `stumpire_testers`, the site 404 to everybody else, modules built into `pages.js`, its own CI workflow and posture check |
| the gate rules | vault `platform/platform-tester-gate.md`: one tester list, no new flag, the same 404 as Stumpire byte for byte, out of sitemap, nav, home page and newsletter, `X-Robots-Tag: noindex` |
| shared shell | there is none: each game carries its own header, footer, theme and `auth.js` copy. All share the one Supabase project and the default session key, so one sign-in covers every game. Theme key `runthegrid_theme` |
| daily | Eastern day (`en-CA` in `America/New_York`), `dayNumberOf(iso)` from an epoch, the save keyed by day so rollover needs no reset |
| results, boards, streaks | per game tables written only by `security definer` RPCs. Best template: `148_putt_daily_board.sql` plus the streak from `52_grid_daily.sql`. Tester games call them through their API Function with the service role |
| in-progress state | localStorage with a game prefix, plus a server row for the daily (Stumpire's `stumpire_plays` with a version check) |
| stack | plain JS, no bundler, no TypeScript, no lint step. Tests are plain `node` scripts or `node --test`. Python for data pipelines, run by hand as a GitHub Actions workflow (`baseball-data.yml`) |
| next migration number | 152 (to be rechecked against open PRs at build time) |

## Blockers and calls I need from you

1. **Data hosts are blocked in this container.** `baseballsavant.mlb.com`, `www.retrosheet.org` and
   `statsapi.mlb.com` all fail here. Two ways, and I recommend both:
   - add those three hosts to this environment's allowed domains, so Agent A can iterate on the
     pipeline in the session;
   - the reproducible build runs as a hand-triggered GitHub Actions workflow, like
     `baseball-data.yml`, whose runners can reach them.
   Without the first, Agent A writes the pipeline blind and every data step costs a workflow round trip.
2. **The share link.** Your format ends `runthe.gg/shut-the-door`. The vault rule for tester games
   is that a pasted result never names the gated path (Last Shot links `/arcade/`), and you do not
   want the Arcade linked. My recommendation: `runthe.gg` during the tester period, switched to
   `runthe.gg/shut-the-door` at launch (one constant). Or keep your link as written.
3. **How a tester gets in.** A page load carries no sign-in token, so the gate reads a cookie, and
   today only the Arcade hub mints it. Options:
   - **(a)** testers sign in at `/arcade/` once every 12 hours, as for every tester game. Touches
     nothing. But it routes this game through the Arcade.
   - **(b, recommended)** a small generic endpoint `/api/tester/me` (mints the same cookie for anyone
     on the tester list, names no game) and one call to it from the home page's existing sign-in.
     A tester signed in on runthe.gg can then open `/shut-the-door` directly. It is a few lines in
     `index.html`, which is the site shell, not another game.
4. **Camera.** I recommend **catcher's eye**: the grid, Statcast and every scouting heat map are
   all drawn from behind the plate, so reading the batter and throwing the pitch are literally the
   same picture. Broadcast centre field is prettier and needs a mirrored grid. Filed as an open
   question either way.
5. **Pre-2015 data.** Savant has pitch tracking back to 2008 (PITCHf/x). I propose 2008 to 2014
   scenarios resolve `real` from it, so only pre-2008 games are `proxy`. Or hold to 2015+ as written.

## The build, in order

1. **Contract frozen** (you approve this). The lead writes `contract.js` and `fixtures/mock-scenario.json`.
2. **Vault docs** (Section 7): `games/shut-the-door/` with overview (alias "The Closer"), gameplay,
   mechanics, data, UI, decisions (the six dated decisions), features, open questions; `shut-the-door`
   added to `GAMES` in `scripts/vault-lib.mjs` and to the games index as a standalone title. Merged
   by vault PR once `vault-check` is green.
3. **Agents A and B in parallel**, in separate git worktrees on the same branch family, each owning
   its own files (below). B runs on the mock. The lead answers `CONTRACT_REQUESTS.md`.
4. **Seed scenarios**: Agent A verifies the ten candidates below against the data and lists them
   for you before building any pack.
5. **Integration**: the lead merges both, swaps the mock for the real API, runs every check, and
   plays a full outing in Chromium at 390x844.
6. **One PR** on the site for you to review and merge. Then the migration is applied and the daily
   publish workflow starts.

### Who owns which file

| | Agent A | Agent B | lead |
|---|---|---|---|
| `engine/` (resolution, grading, pool, rng), `api.js`, `share.js` | ✓ | | |
| `pipeline/` (Python), `packs/`, `scenarios/` | ✓ | | |
| `gate.js`, `db-*.js`, server API, both Functions, SQL, workflows | ✓ | | |
| `ui/` (screens, sprites, animation, menus), `web/play.html`, `mock-api.js` | | ✓ | |
| `CONTRACT.md`, `contract.js`, `fixtures/`, `build/pages.mjs`, `CONTRACT_REQUESTS.md` answers | | | ✓ |

## Seed scenarios (candidates; Agent A verifies every fact from the data first)

| # | spot | pitcher | hand | resolution | real result |
|---|---|---|---|---|---|
| 1 | 2025 WS Game 7, bottom 11th, up 5-4 | Yoshinobu Yamamoto | R | real | door shut |
| 2 | 2024 WS Game 5, bottom 9th, up 7-6 | Walker Buehler | R | real | door shut |
| 3 | 2016 WS Game 7, bottom 10th, up 8-7, 2 out, man on 1st | Mike Montgomery | L | real | door shut |
| 4 | 2016 WS Game 7, bottom 8th, up 6-3, 2 out, man on 1st | Aroldis Chapman | L | real | doors open |
| 5 | 2019 NL Wild Card, bottom 8th, up 3-1 | Josh Hader | L | real | doors open |
| 6 | 2017 WS Game 2, top 9th, up 3-2 | Kenley Jansen | R | real | doors open |
| 7 | regular season, a top closer's highest-leverage save, 2023-2025 | Agent A picks from data | R | real | door shut |
| 8 | regular season, the same, a left-hander | Agent A picks from data | L | real | door shut or blown |
| 9 | 1988 WS Game 1, bottom 9th, up 4-3 | Dennis Eckersley | R | proxy | walk-off |
| 10 | 2001 WS Game 7, bottom 9th, up 2-1 | Mariano Rivera | R | proxy | walk-off |

Alternates: 2011 WS Game 6 Neftali Feliz (real if 2008+ is allowed), 1993 WS Game 6 Mitch Williams
(proxy, LHP), 2005 NLCS Game 5 Brad Lidge vs Pujols (proxy), 2022 WS Game 6 Ryan Pressly. Mix:
four holds, four blown, two left open on regular season; four left-handers; two proxy. Rotation for
the tester period: day number mod 10.

## Risks I see now

- **The pool and the grade are one model.** If the hold% model is off, both the grade and the
  percentile are off together. Agent A must report calibration: hold% predicted against real
  outcomes of 2015+ save situations.
- **Low-leverage spots grade everything green** (a three-run lead with nobody on barely moves
  hold%). That is honest, but dull. Agent A reports the band spread per scenario; if a scenario
  has no oranges or reds available, it is a weak daily.
- **The pack is in the browser**, so a determined tester could read the best call before throwing.
  Accepted for testers; v2 can move grading to the server.
- **Library size.** Pages rejects any file over 25 MB, and the repo deploys whole. The pitch
  library stays out of git (built and cached by the workflow); only the packs are committed.

---

## Brief: Agent A (engine, data, backend)

You are Agent A on Shut The Door, a tester-only daily baseball game on runthe.gg. Read first:
root `CLAUDE.md` (no em or en dashes anywhere, ever), `functions/_shutthedoor/CONTRACT.md` (your
spec; you change it only through the lead), this plan, the vault notes
`platform/platform-tester-gate.md` and `games/shut-the-door/*`, and Last Shot on branch
`claude/last-shot-agent-setup-aewpfl` (`functions/_lastshot/`, `functions/last-shot/`) as the pattern
for the gate, the page Function, `pages.js` and CI. Stumpire (`functions/_stumpire/`,
`supabase/133_stumpire.sql`, `134_stumpire_score.sql`) is the pattern for the API Function, the
day row, the play row with a version check and service-role-only RPCs.

**You own:** `functions/_shutthedoor/engine/`, `api.js`, `share.js`, `pipeline/`, `packs/`,
`scenarios/`, `gate.js`, `db-supabase.js`, `db-memory.js`, `server.js`, `test/`, `README.md`,
`functions/shut-the-door/[[path]].js`, `functions/api/shut-the-door/[[path]].js`, the migration and
its `supabase/test/` pair, `.github/workflows/shut-the-door-checks.yml`,
`.github/workflows/shut-the-door-data.yml`, `.github/workflows/shut-the-door-daily.yml`.
**You never touch** `ui/`, `web/`, `mock-api.js`, or any other game.

**Data (free only).** Python 3.11, pandas, pybaseball, SQLite (no pyarrow). Statcast via Savant CSV
search, chunked by date (the 25k row cap). Keep per pitch: pitcher, batter, stand, p_throws, type,
velo, pfx, plate_x, plate_z, sz_top, sz_bot, balls, strikes, outs, bases, inning, scores,
description, bb_type, launch speed, angle, spray, events, delta_run_exp. The library is a trimmed
SQLite file, out of git (`.gitignore`), cached by the data workflow. Retrosheet event files for the
proxy-era spots (batter order, pitch sequences where recorded). Every fact in a scenario carries a
source in `sources`.

**Resolution.** Command noise from the pitch's `sigmaFt` on the target point gives the actual point
and cell. Draw a real pitch matching type, actual cell, count bucket (ahead, even, behind, two
strikes) and platoon, tiered: that batter, then similar batters (cluster on chase, zone swing, whiff
by type, damage map), then league. Record the tier. In play: take the drawn real batted ball and
apply it to the current base-out state with an advancement table built from the data (a drawn
double play with nobody on first becomes a ground out). End rules exactly as the contract says.

**Grading.** hold% by value iteration over (batter index, count, outs, bases, margin) with the best
call at every state, from the same library. Grade every call before resolving: for each arsenal
pitch and cell, the miss table times the outcome table times next-state hold%. Bands and the
reason line as in the contract. Grade the decision, never the outcome.

**Pool and comparison.** Closer personalities from real closers' pitch selection by count bucket
and situation, 2015+ (pitch family share by count, zone, edge and chase rates). Each runs through
each scenario at least 2000 times at build time; the sorted scores go in the pack. "Pitched like":
nearest closer by that vector over the player's outing, with the one feature that decided it as the
reason.

**Backend.** Mirror Stumpire: one day row per day with the pack, a daily publish workflow three days
ahead, one outing row per (user, day) with seed, calls and a version, the server replaying the calls
at finish to write the result, the streak and the board. Gate on `stumpire_testers` role directly,
exactly as Last Shot's `gate.js`, with Stumpire's 404. Trophies: leave a marked `TODO(v2 trophies)`
hook where the result is written.

**Tests** (`node --test functions/_shutthedoor/test/*.test.mjs`): all fastballs down the middle grades
mostly orange and red; a scripted best-call outing grades all green; a scripted median outing lands
within 40 to 60 percentile; determinism (same seed and calls, same everything); the gate side by side
with Stumpire's 404 for every kind of non-tester; the pack shape against the contract; `pages.js` not
drifted.

**Order of work.** (1) pipeline and a 2023 library slice; (2) verify the ten candidate scenarios
from data and send the list to the lead, then stop until it is approved; (3) engine plus tests on one
scenario; (4) the pool; (5) all packs; (6) backend, SQL, workflows; (7) `README.md`: the pipeline,
fallback tiers, the grading formula, the pool, the proxy path, how to add a scenario.

Report to the lead at the end of each step: what is done, test output, the band spread per
scenario, anything that needs the contract changed.

## Brief: Agent B (UI, UX, animation, menus)

You are Agent B on Shut The Door, a tester-only daily baseball game on runthe.gg. You are the
closer: one real save situation a day, the real batters in order, the pitcher's real arsenal, two
taps a pitch, every pitch graded. Read first: root `CLAUDE.md` (no em or en dashes anywhere; short
sentences; a number a player reads comes from the engine), `functions/_shutthedoor/CONTRACT.md`
(your spec), this plan, the vault's `games/shut-the-door/*`, and for the look: Run The Floor's rig
(`hoops/baller.js`, the vault's `hoops-presentation`) and RunTheTour's golfer (`PXHD` in
`golf/index.html`). Last Shot (`functions/_lastshot/`, branch `claude/last-shot-agent-setup-aewpfl`)
shows how a gated page loads its modules and uses a rig read only.

**You own:** `functions/_shutthedoor/ui/`, `web/play.html`, `mock-api.js`, `CONTRACT_REQUESTS.md`
(you write, the lead answers). **You never touch** the engine, data, server, SQL, or any other game.
Read other games' files; never edit them.

**Build only against the four API calls.** Until Agent A lands, `mock-api.js` serves
`fixtures/mock-scenario.json`. Anything you need that the contract lacks: a line in
`CONTRACT_REQUESTS.md`, then carry on with a stub.

**Shell.** Mirror a top-level game's own header, footer, sign-in and theme (copy the pattern into
your files; do not import another game's page code). Light and dark through `runthegrid_theme`.
Mobile first at 390x844; works at 1440x900. Every action one or two taps. Voice: lowercase, direct,
short sentences, no hype words.

**Screens.**
1. Home: day, title, one-paragraph setup, the pitcher's card (arsenal: name, velo, usage), the
   situation, the doors shut streak, "take the mound". Already played: result, share, "back tomorrow".
2. Mound: the committed camera (the owner's pick), batter sprite with handedness, count, outs, base
   diamond, score, pitch number, the grade strip pinned on top. Batter card one tap away: chase rate,
   whiff by pitch type, the heat map on the same 5x5 grid. Arsenal buttons along the bottom, tap a
   cell, confirm. "shut it" on the confirm when `state.shutItLive`.
3. Pitch: the ball leaves the hand, flies the pitch's `shape`, lands at `actual` so a miss shows,
   the batter takes, swings, fouls or puts it in play, the call. In play: a short result with runners
   moving on the diamond. Under about 3 seconds, skip on tap.
4. Grade card: band pill, best call, reason. Tap anywhere to dismiss. The first time a green pitch
   gets hit: "good pitch. the grade is the decision, not the result."
5. Result: DOOR SHUT, DOOR'S OPEN or WALK-OFF, strip, percentile, pitched like, the reveal, beat,
   matched or lost, share, "run it back" (practice), streak.
6. Menus: how to play (short, visual, behind a button, never opened by itself), stats, past dailies
   (locked shell), settings (sound, and the tester debug toggle showing seed and tier per pitch).

**Rules.** Never a modal the player must read. The zone grid and the heat map share one geometry
and one component. The proxy note is small and quiet ("modern pitch data"). Pixel sprites drawn on
canvas, generic uniforms in `pitcher.teamColors`, no logos, no likenesses. No tutorial opens by
itself.

**Checks you add:** `test/check-browser.mjs` (Playwright, Chromium at 390x844 and 1440x900: plays a
whole outing on the mock, every screen, no console errors), and `node scripts/check-dashes.mjs
functions/_shutthedoor` clean. Report to the lead with screenshots of every screen.
