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
node shut-the-door/test/lesson.mjs             the lesson on the worst pitch
node shut-the-door/check-replays.mjs           stored outings replayed against their scores (--self-test)
node shut-the-door/test/check-browser.mjs      the whole game in Chromium at 390x844 and 1440x900
node shut-the-door/pipeline/band_sweep.mjs     the bands measured on the real packs (--relative)
```

## Rules a change here must keep

- **Unlisted until the owner launches it.** Noindexed, no ad tag, not in the sitemap, linked from no
  page, not on the newsletter list. Launching is an edit to `check-posture.mjs` in the same commit.
- **Not part of the Arcade.** No Arcade link, tile or scaffolding.
- **Grade the decision, never the outcome.** Every call is graded before it resolves. The band is
  relative to the moment (`rel` = lost over the state's mean lost); score and percentile use absolute
  hold% lost. `BANDS` in `contract.js` changes only with `band_sweep.mjs` evidence.
- **Two taps and a release a pitch.** A pitch type, a cell, then one tap on the release meter
  (`meter.js`). Nothing else. The release (q) scales the miss and never the grade. The meter can be
  turned off in settings (no q: his own command, 1.0x). No grade or popup between pitches; the
  meter's one quiet word is execution, not a grade.
- **The grid is catcher's view in data, pitcher's view on screen.** Mirror with `screenCol()` only.
  Copy says inside and away, never left and right.
- **Deterministic.** One seeded stream, four draws per pitch in a fixed order. The daily seed is the
  day's, the same for everyone. No `Math.random` in the engine. q changes only the spread the two
  miss draws are scaled by, never which draws are taken. A call without q is exactly 1.0x, so old
  stored outings replay unchanged (`fixtures/replays-pre-meter.json` holds that).
- **Rules 2** (2026-10-22, CONTRACT.md 5b): the hitter adjusts, the arm tires, a repeat keeps less
  release, coarser scouting. Every effect is a function of the outing's log, never a new draw. A new
  outing's kept calls carry `r: 2`; a call without `r` replays as rules 1, exactly. The grade prices
  the history (one pitch ahead, then the table). The strengths live in `grade.js R2`; change them only
  with the strategy measurements in the README, and rebuild the packs (`pool.js`: the pool and
  `pack.seq`) when they move.
- **Every scenario fact and every pro example is real and sourced.** Proxy spots (before 2008) are
  flagged in the data and the UI. Nothing is invented to fill a gap: a missing pro example is null.
- **The lesson** picks the worst pitch, and only a principle its own numbers show.
- **Players left out of the closer pool and the pro examples**: Emmanuel Clase, Felipe Vázquez,
  Roberto Osuna (the owner kept Chapman's scenario). The list is in `pipeline/closer_pool.py`.
- **mock-api.js** takes over only on a `?mock...` test switch. A player always gets the real engine.
- **Cache versions.** Every sibling script carries `?v=`; packs carry their own `v` in
  `data/schedule.json`, fetched with `SCHEDULE_V` in `api.js`. The edit, the bump and the record in one commit.
- **The pitch library never goes in git** (3.4 GB rebuilt from cached chunks). Only packs are committed.
