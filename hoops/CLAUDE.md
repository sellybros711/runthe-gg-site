# Run The Floor, the NBA game

The repo-wide rules are in the root CLAUDE.md. This file holds only what a change to `hoops/` must
obey. The why, the history and the full design live in the knowledge base.

## The knowledge base

`sellybros711/runthe-gg-kb`, folder `games/hoops/`. Start at `hoops-overview.md`, which lists every
note, and read `hoops-owner-rulings.md` before designing anything. In a cloud session it is cloned at
`/home/user/runthe-gg-kb`. If it is not there, attach it (add_repo) before a design task. A small
fix that only touches code can go ahead without it.

| task | read |
|---|---|
| Career: the sim, the league, the story | `hoops-career-*.md` (eleven notes, listed in the overview) |
| Conquest, Fix History, Six Passes | `hoops-modes-*.md` |
| the draft, the roster, systems and pace | `hoops-draft*.md`, `hoops-roster-*.md` |
| the box score, a game seven, the bracket | `hoops-sim-box-score.md`, `hoops-game-seven*.md`, `hoops-bracket*.md` |
| the front page, badges, the daily, boards | `hoops-front-page.md`, `hoops-badges.md`, `hoops-daily-share.md`, `hoops-leaderboard.md` |
| player data and seasons | `hoops-data.md` |
| accounts, arenas, the economy | `hoops-accounts.md`, `hoops-arenas.md`, `hoops-economy.md` |

`hoops/design/` holds the Career rebuild's plan, audits and reports. They have not moved yet.

After a meaningful change, update the matching note by pull request on the knowledge base. Decisions
there are append-only: a changed decision is a new dated note that supersedes the old one.

## Commands

```
node hoops/verify.mjs             draft legality, seed replay, calibration, the system prose
node hoops/check-posture.mjs      discoverability (it is unlaunched)
node hoops/check-career.mjs       careers end to end (--quick: the engine only)
node hoops/check-story.mjs        events, calendar, arcs, people, the page
node hoops/check-saves.mjs        frozen version 1 saves migrate and play on unchanged
node hoops/sim-career.mjs         a thousand careers against the story bible
node hoops/check-moments.mjs      the playable moments and cutscenes (--quick: no browser)
node hoops/check-modes.mjs        Conquest, Fix History and Six Passes (--quick: no browser)
node hoops/check-draft.mjs        the draft screen's shape, desktop and phone
node hoops/check-live.mjs         a game seven, the engine and the page
node hoops/check-bracket.mjs      the playoff bracket (--quick: the arithmetic only)
node hoops/check-badges.mjs       every badge reachable, against real runs
node hoops/check-board.mjs        the leaderboard in every state
node hoops/check-home.mjs         the front page's order and fold
node hoops/check-cloudsave.mjs    the run, the career and the daily on two devices
node hoops/check-arenas.mjs       arenas, the camera and the Locker
node hoops/check-rosters.mjs      the roster file, the season, the handover
node hoops/build/check-fetch.mjs  the scrapers' parsers against saved markup
node hoops/build/replay-careers.mjs --story off --against base.json   old careers byte identical
```

The economy has its own suite: `check-economy`, `check-wardrobe`, `check-closet`, `check-earn`,
`check-idles`, `check-packs`, `check-shopart`, `check-daily`, `check-pass`, `check-card` and
`check-polish`, all `node hoops/<name>.mjs`.

## Rules a change here must keep

**Launch and caching**

- **It is unlaunched**: noindexed, not in the sitemap, no ad tag, not linked. `check-posture.mjs`
  asserts all four, so launching means editing that guard on purpose. Removing the noindex alone fails
  nothing and puts an unfinished game in front of AdSense review.
- `engine.js` and `run.js` load beside the page with a `?v=`. Change one and bump it, then
  `node scripts/check-cachebust.mjs --update`, in the same commit.
- `board.js` is pinned: `NEED_BOARD` in the page against `BOARD_API_VERSION` in `board.js`. Move
  both together, or every visitor runs on the stub and the boards read "not reachable". The same goes
  for any module whose `API_VERSION` the page checks. `check-cachebust.mjs` holds the pairs.

**The engine**

- **A box score decomposes the scoreline. It is never a second model.** The same holds for a game
  seven and the bracket: one loop, the one that already existed.
- **Story features sit behind `storyOn`.** `replay-careers --story off` must stay byte identical.
- **A save is versioned and migrated** (`LIFE_VERSION`). `migrate()` never moves a number the sim
  reads. Never regenerate `hoops/build/fixtures/` with the current engine.
- `legacyScore` is integer arithmetic, because the server derives the same score and they must agree.
- A season is named for the year it ENDS: 2026 is 2025-26.

**People**

- **Only the invented are drawn.** Anyone on a real roster is the faceless rig in his club's kit.
  No store item is ever drawn on a real man.
- The coaches table is the one place a real name is typed. Everyone else is generated.

**Guards**

- `verify.mjs` lifts real functions out of `index.html` (`dailyRecord`, `bestsSet`, `freshBadges` and
  others) and drives them in node. Never copy the arithmetic into a guard. Never put a page-level
  call inside a lifted function: it is a ReferenceError in an unrelated suite.
- A guard that finds nothing must fail, not pass. Every extractor list is asserted.
- `check-saves` and the frozen fixtures are the proof old careers still play. Do not "fix" a failure
  there by updating the fixtures.
