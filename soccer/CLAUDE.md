# Run The Pitch (the World Cup squad builder)

The repo-wide rules are in the root CLAUDE.md. This file holds only what a change to `soccer/`
must obey. The why, the history and the full design live in the knowledge base.

## The knowledge base

`sellybros711/runthe-gg-kb`, folder `games/soccer/`. Start at `soccer-overview.md`, which lists
every note, and read `soccer-owner-rulings.md` before designing anything. In a cloud session it is
cloned at `/home/user/runthe-gg-kb`. If it is not there, attach it (add_repo) before a design task.
A small fix that only touches code can go ahead without it.

| task | read |
|---|---|
| Team OVR, the sim, the published odds | `soccer-sim.md` |
| accounts, the solo boards, the Daily, badges | `soccer-accounts-boards.md` |
| challenge links, the Online Friendly, the pool, computer squads | `soccer-online.md` |
| the club side, Club Draft, The Cup of Champions | `features/soccer-club-draft.md` |
| the player data | `soccer-data.md` (the data itself is the Rosters Agent's) |

## Commands

```
node soccer/check-db-reads.mjs                what a finished game reads; no poll while hidden (CI: soccer-checks)
node soccer/check-club.mjs                    the club side: names, squads, balance, a whole club run (--quick, --names)
node scripts/check-dashes.mjs soccer/<file>    soccer/ is not in GUARDED yet: check what you touch
node scripts/check-cachebust.mjs               gameLogic.js and the assets the page pins
node scripts/check-adsense.mjs                 the Pitch's banner screens and slots
node scripts/check-home-games.mjs              the home page card
```

## Rules a change here must keep

**One file, one engine**

- The game is `soccer/index.html` (script, CSS and markup) and `gameLogic.js` at the root (`G`).
  `gameLogic.js` carries a `?v=` in the page. Change it and bump it, then
  `node scripts/check-cachebust.mjs --update`, in the same commit.
- The data loads at `?v=` + `DATA_VERSION`. `check-cachebust` skips a version built from a variable,
  so a change to `data/players_all.json` bumps `DATA_VERSION` by hand. The data is the Rosters
  Agent's.

**Two sides: a club side and a World Cup side** (the owner's call, 2026-11-26)

- A club draft is a normal draft whose state carries `gs.club`. The two sides share the draft,
  the reveal and the sim; ask `isClub()` where they differ. Never fork a second copy of the flow.
- **Club names, never brands, never crests.** A club shows as plain text and a three letter chip.
  A name that carries a company's brand shows as the city or the unbranded name: `NAMES` in
  `soccer/club.js`. `check-club` fails on a branded name (`--names` prints what every club is shown as).
- The club cup is **The Cup of Champions**. No club screen says "World Cup" except a man's own
  World Cups line; shared copy goes through `cw()`.
- The cup's sides sit on the World Cup pool's rating scale, and the wheel is weighted by squad
  size, so both sides draft to the same strength and the published odds hold for both.
  `check-club` measures it. Change the spin or the pool and rerun it.
- Until its boards exist, a club run writes nothing to the server, and its door shows only after
  `/soccer/?club=1`.

**Numbers a player reads**

- `how-to-play.html` publishes the trophy odds (86 a couple of percent, 90 one in five, 92 two in
  five, 99 over 80%). Retuning `winProbability`, `belowThresholdPenalty`, `earlyRoundPenalty` or
  `eliteBoost` rewrites those sentences in the same commit, measured with `testWinThreshold`.
- Team OVR is the official number after `applyLeadershipBonus`. Every board, share and link uses
  that one, never the base.

**Badges are two copies of one list**

- `ACHIEVEMENTS` in the page and `_my_metrics`, `_ach_level` and `_my_badges` in `supabase/19` agree.
  A badge change is a migration and a page change together. Bump `ACH_VERSION` when the set changes.

**The Daily Challenge is fair**

- The 11 spins come from the UTC date and the theme (`buildDailySequence`). No re-spins. The
  server keeps the first attempt of the day (`submit_daily`). Nothing on the page may let a later
  attempt replace it.

**The database**

- Read only what is shown or what changed. The history (`loadMyDrafts`) is read once a visit, when
  the profile shows it; a finished game is folded in (`foldMyDraft`), never reread. A rank is a
  count, never the board's rows. No poll talks to the server while the tab is hidden
  (`pollHidden`). `check-db-reads` holds all of it.
- The pool fills only while someone's page calls `soccer_wc_pool_state` (it adds the computer
  squads). A change to the polls keeps that true or moves the fill to the server.

**Online play**

- Both clients play the same match from a shared seed, in the canonical host then guest order
  (`withSeededRandom`). Never pass "me first": the sim is not symmetric.
- `profiles` is shared with every game. Change it only after checking the others.
