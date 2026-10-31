# Shut The Door, the closer game

The repo-wide rules are in the root CLAUDE.md. This file holds only what a change to `shut-the-door/`
must obey. The why, the history and the full design live in the knowledge base.

## The knowledge base

`sellybros711/runthe-gg-kb`, folder `games/shut-the-door/`. Start at `shut-the-door-overview.md`, which
lists every note and every decision. `CONTRACT.md` here is the shared contract the engine and the UI
are built against, and `README.md` is the engine, data and pipeline.

## Specialist agents

Work on this game goes to three agents in `.claude/agents/`, each owning one group:
`shut-the-door-3d` (motion, rendering, the ball in play, phone performance), `shut-the-door-game`
(rules, grading, scoring, data, scenarios, SQL) and `shut-the-door-ui` (screens, HUD, menus, the
result, the board and the share card). The `qa` agent owns the checks across the site. Each opens a
PR and never merges it.

## Commands

```
node shut-the-door/check-posture.mjs           unlisted until launch (INDEXED and LINKED both false)
node shut-the-door/test/engine.mjs             the engine on a synthetic pack: determinism, end rules, grades
node shut-the-door/test/packs.mjs              every real pack: the contract, all-green best play, median at the 50th
node shut-the-door/test/api.mjs                the four calls, the daily, resume, one submit
node shut-the-door/test/modes.mjs              the vote's candidates and Survivor's sequence, page and server alike
node shut-the-door/test/survivor.mjs           the vote, Survivor, the archive and the Pro gate through the calls
node shut-the-door/test/lesson.mjs             the lesson on the worst pitch
node shut-the-door/check-replays.mjs           stored outings replayed against their scores (--self-test)
node shut-the-door/check-rules.mjs             every in-play row in every pack a legal MLB play
node shut-the-door/test/check-browser.mjs      the whole game in Chromium at 390x844 and 1440x900
node shut-the-door/pipeline/band_sweep.mjs     the bands measured on the real packs (--relative)
```

Long runs (the lab checks in `lab/pipeline/`, `lab/pipeline/checkpoint.mjs` says how they sample and resume):

- Push work to the branch after each meaningful step. A container restart loses what is not pushed.
- Locally, run the sampled checks (`--sample N`, or the check's default) and add `--resume` after a
  restart. Leave the full runs to CI and the nightly (`shut-the-door-nightly.yml`).
- Write long run output to a file (`> run.txt 2>&1`), not only to stdout.

## Rules a change here must keep

- **Unlisted until the owner launches it.** Noindexed, no ad tag, not in the sitemap, linked from no
  page, not on the newsletter list. Launching is an edit to `check-posture.mjs` in the same commit.
- **Not part of the Arcade.** No Arcade link, tile or scaffolding.
- **Grade the decision, never the outcome.** Every call is graded before it resolves. The band is
  relative to the moment (`rel` = lost over the state's mean lost); score and percentile use absolute
  hold% lost. `BANDS` in `contract.js` changes only with `band_sweep.mjs` evidence.
- **A pitch is a type, an aim, then two stops on the meter.** Pick the pitch type, aim anywhere in
  the zone (the cell, plus the free aim point `at` inside it), stop the effort bar (e), then stop the
  accuracy bar (q, the release). Nothing else. The grade prices the exact aim point; everything the
  player reads (scouting, the heat map, the tag, the hitter's history) stays on the cell (CONTRACT.md
  5d). Effort moves the pitch along his own real speed, with measured effects scaled by a labelled
  game multiplier (`grade.js EFFORT`), shrinks or widens the accuracy window and loads the arm
  (CONTRACT.md 5c). The release scales the miss. Neither stop touches the grade. The meter can be turned
  off in settings: no effort stop and no q (his ordinary pitch at his own command, 1.0x); an e never
  rides without a q. No grade or popup between pitches; the meter's one quiet word is execution, not
  a grade.
- **The grid is catcher's view in data, pitcher's view on screen.** Mirror with `screenCol()` only.
  Copy says inside and away, never left and right.
- **Deterministic.** One seeded stream, four draws per pitch in a fixed order. The daily seed is the
  day's, the same for everyone. No `Math.random` in the engine. q changes only the spread the two
  miss draws are scaled by, never which draws are taken. e changes only the drawn row's weights and
  the arm, never which draws are taken. A call without q is exactly 1.0x and a call without e is his
  ordinary pitch, so old stored outings replay unchanged (`fixtures/replays-pre-meter.json` holds
  that, and the self-test holds a rules 2 row without e).
- **Rules 2** (2026-10-22, CONTRACT.md 5b): the hitter adjusts, the arm tires, a repeat keeps less
  release, coarser scouting. Every effect is a function of the outing's log, never a new draw. Rules 3
  (2026-10-24) is rules 2 plus the third out: a new outing's kept calls carry `r: 3`, a call with `r: 2`
  replays as rules 2 and a call without `r` as rules 1, exactly. Rules 4 (2026-10-24, CONTRACT.md 5f)
  is rules 3 plus the call by location, ABS challenges (`ch: 1` on a challenged call; the batter's
  gamble on its own seeded stream, so the four draws never move) and the bright band's release; a
  call with `r: 3` replays as rules 3 (`fixtures/replays-rules3-pre-abs.json`). The grade prices
  the history (one pitch ahead, then the table). Rules 5 (2026-10-25, CONTRACT.md 5g) is rules 4
  plus the routine play: an error on a routine ball (`contract.js ROUTINE`) keeps only `KEEP` of its
  share, read inside the error's slice of the same library draw, and the rest is the cell's real out
  of its kind; a call with `r: 4` replays as rules 4 (`fixtures/replays-rules4-pre-routine.json`).
  Rules 6 (2026-10-26, CONTRACT.md 5h) is rules 5 plus the runners reading the ball: the same runner
  draw on the advancement rows weighted by 2024 runners on a ball of that carry and side
  (`pack.runners`, `pipeline/runners.py`); the grade keeps the table's mix; a call with `r: 5`
  replays as rules 5 (`fixtures/replays-rules5-pre-runners.json`). Rules 7 (2026-10-26, CONTRACT.md
  5i) is rules 6 plus the running game: steals on their own seeded stream (drawn only when a steal
  is on, so the four draws never move), the pickoff (`pa` on the call before) and the quick delivery
  (`ss: 1`, never called "quick pitch"; its costs live in `meter.js QUICK`). None of it is graded. A
  call with `r: 6` replays as rules 6 (`fixtures/replays-rules6-pre-steals.json`). The strengths live in `grade.js R2`; change them only
  with the strategy measurements in the README, and rebuild the packs (`pool.js`: the pool and
  `pack.seq`) when they move.
- **Every ball in play is a legal MLB play** (`check-rules.mjs`): nobody passes anybody, the runs on a
  third out are the ones that count (rules 3, CONTRACT.md 5e), and the half-ending rows are the real
  plays from Savant's play text (`pipeline/third_outs.py`), never a rule.
- **Every scenario fact and every pro example is real and sourced.** Proxy spots (before 2008) are
  flagged in the data and the UI. Nothing is invented to fill a gap: a missing pro example is null.
- **The lesson** picks the worst pitch, and only a principle its own numbers show.
- **Players left out of the closer pool and the pro examples**: Emmanuel Clase, Felipe Vázquez,
  Roberto Osuna (the owner kept Chapman's scenario). The list is in `pipeline/closer_pool.py`.
- **mock-api.js** takes over only on a `?mock...` test switch. A player always gets the real engine.
- **Cache versions.** Every sibling script carries `?v=`; packs carry their own `v` in
  `data/schedule.json`, fetched with `SCHEDULE_V` in `api.js`. The edit, the bump and the record in one commit.
- **The pitch library never goes in git** (3.4 GB rebuilt from cached chunks). Only packs are committed.
