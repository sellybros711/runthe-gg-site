# Run The Diamond, the baseball game

The repo-wide rules are in the root CLAUDE.md. This file holds only what a change to `baseball/`
must obey. The why, the history and the full design live in the knowledge base.

## The knowledge base

`sellybros711/runthe-gg-kb`, folder `games/baseball/`. Start at `baseball-overview.md`, which lists
every note, and read `baseball-owner-rulings.md` before designing anything. In a cloud session it is
cloned at `/home/user/runthe-gg-kb`. If it is not there, attach it (add_repo) before a design task. A
small fix that only touches code can go ahead without it.

| task | read |
|---|---|
| player data, the pool, the refresh | `baseball-data-*.md`, `baseball-franchises.md` |
| ratings, the cap, October | `baseball-ratings.md`, `baseball-cap-october.md`, `baseball-bracket-sim.md` |
| the staff, chemistry, cards | `baseball-staff.md`, `baseball-chemistry-cards.md` |
| the pages, themes, parks | `baseball-pages.md`, `baseball-themes.md`, `baseball-field-parks.md` |
| Pro, the profile, boards, badges | `baseball-squad-pro.md`, `baseball-boards-profile.md`, `baseball-badges.md` |

After a meaningful change, update the matching note by pull request on the knowledge base. Decisions
there are append-only: a changed decision is a new dated note that supersedes the old one.

## Commands

```
node baseball/check-posture.mjs      the four launch facts, against INDEXED and LINKED
node baseball/check-run.mjs          a whole run, in a browser, to the screen it ends on
node baseball/check-atbats.mjs       the at-bat simulator, against real brackets
node baseball/check-bracket.mjs      the playoff field, against real runs
node baseball/check-october.mjs      plays seasons until one reaches a decider
node baseball/check-labels.mjs       what a player-season row says it is
node baseball/check-theme.mjs        both themes, in a browser, on the real screens
node baseball/check-home.mjs         the front page and the reel
node baseball/check-staff.mjs        the All-Time Staff assignment
node baseball/check-badges.mjs       every badge reachable, against real runs
node baseball/check-parks.mjs        the parks catalogue, art and unlocks
node baseball/check-yardstick.mjs    a real cut, and what the run is graded on
node baseball/check-franchise.mjs    franchise history, the lock, the picker
node baseball/check-lineup.mjs       the coach's order costs nothing
node baseball/check-resume.mjs       a run survives leaving the page
node baseball/check-profile.mjs      the profile and the career on the server
node baseball/check-leaderboard.mjs  the boards
node baseball/check-pro.mjs          the Pro gate, sheet and checkout
node baseball/check-calls.mjs        the manager's call (--engine, --page, --balance)
psql ... -f supabase/test/launch_preflight.sql    the migrations are applied
```

The data pipeline is in `baseball/pipeline/`, and `baseball/pipeline/DATA_RUNBOOK.md` is its runbook
(a checker reads that file, so it stays here).

## Rules a change here must keep

**Launch and caching**

- **It is live**: indexable, in the sitemap, ad tag on, linked from the home page. `check-posture.mjs`
  holds two declarations. `INDEXED` (robots, sitemap, ad tag) and `LINKED` (hub tile, card, JSON-LD,
  nav) are each all or nothing, and LINKED without INDEXED is refused.
- Every sibling script in `index.html` carries a `?v=` (`engine.js`, `run.js`, `parks.js`, `board.js`
  and the rest). Change one and bump it, then `node scripts/check-cachebust.mjs --update`, in the same
  commit.

**The engine**

- **Neither the bracket nor the at-bat simulator decides anything, except a Pro player's call.**
  `generatePlayoffs()` decides every October game, and both run on their own seeded RNG so the
  season's stream is untouched. The one exception (the owner's call, 2026-10-20): in a game a Pro
  player watches, changing pitchers decides the rest of that game, and October carries on from it
  (`settleOctober` in `run.js`). A call only rescales the other side's runs from that point; it
  never re-rolls the game. So a game nobody called is byte for byte the old one, and taking the
  coach's own arm changes nothing. `check-calls.mjs` holds both.
- **Calls come in watched games only**: every October game in the six modes, the deciding game in
  Classic and the daily. Free players watch the coach make the call. A recorded run takes none.
- **Two ratings, two jobs: never merge them.** `squadRating()` ranks against real team-seasons and is
  blind to chemistry, shape and the closer. The season runs on the other number.
- The data is bWAR only, with Lahman positions. There is no FanGraphs blend.
- The share card's numbers are a picture: its builder checks them against `E.CONSTANTS.CAP_MUSD`,
  `E.SLOTS.length` and the pool's season range, and refuses on a mismatch.

**Accounts and money**

- Everything a player earns runs through the server. Unlocks are derived from it.
- The six extra modes are one free start each per Eastern day, keyed (user, mode, day). Classic and
  the daily are never counted or sold. Pro is a yearly subscription.

**The theme checker** fails on a regression only. The light theme's old accents under 4.5:1 are
reported, not failed: repainting a live game's brand colour is a design decision.
