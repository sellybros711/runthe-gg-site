# The Perfect Season (the NFL game) and its weekly Fantasy Challenge

The repo-wide rules are in the root CLAUDE.md. This file holds only what a change to `football/` must
obey. The why, the history and the full design live in the knowledge base.

## The knowledge base

`sellybros711/runthe-gg-kb`, folder `games/football/`. Start at `football-overview.md`, which lists
every note, and read `football-owner-rulings.md` before designing anything. In a cloud session it is
cloned at `/home/user/runthe-gg-kb`. If it is not there, attach it (add_repo) before a design task. A
small fix that only touches code can go ahead without it.

| task | read |
|---|---|
| Full Team | `football-full-team*.md` (five notes) |
| plans, the bundle, the free meter | `football-plans-pricing.md`, `football-premium-bundle.md`, `football-free-meter.md` |
| saves, migrations, the live modes | `football-run-on-account.md`, `football-migrations.md` |
| boards, badges, the broadcast | `football-leaderboards.md`, `football-live-badge.md`, `football-badges.md`, `football-broadcast.md` |
| the Fantasy Challenge | `fantasy-*.md` (fourteen notes, listed in the overview) |

After a meaningful change, update the matching note by pull request on the knowledge base. Decisions
there are append-only: a changed decision is a new dated note that supersedes the old one.

## Commands

```
node football/check-fullteam.mjs      Full Team: the door, the gate, the save, the allowance
node football/check-dynasty.mjs       Dynasty
node football/check-cloudsave.mjs     the dynasty saved both directions
node football/check-premium.mjs       what each product unlocks
node football/check-daylock.mjs       a daily lock opens when its countdown ends (fake clock)
node football/check-popups.mjs        the guide, the rules sheets, two devices
node football/check-badges.mjs        every badge proved reachable (--quick: fewer runs)
node football/check-gameday.mjs       the Game Day shelf
node football/check-boss.mjs          the boss battle (add go: going for it on fourth down)
node football/check-overtime.mjs      a tie goes to overtime
node football/check-simspeed.mjs      Slow and Slower pace by the drive, Normal untouched
node football/check-fantasy.mjs       the Fantasy Challenge (--quick: the engine, no browser)
psql ... -f supabase/test/launch_preflight.sql    the live modes' migrations are applied
```

The fantasy week: `build/next-week.mjs`, `build/weekly-pool.mjs`, `build/publish-week.mjs`,
`build/injuries.mjs`, `build/weekly-results.mjs`, `build/live-results.mjs` and `build/nfl-scores.mjs`,
all `node football/<path>`. Their probes are in `football/build/test/`.

## Rules a change here must keep

**Caching and versions**

- Every sibling script in `index.html` carries a `?v=` (`engine.js`, `run.js`, `board.js` and the
  rest). Change one and bump it, then `node scripts/check-cachebust.mjs --update`, in the same commit.
- `board.js` is pinned by `BOARD_VERSION` in the page against its `API_VERSION`. Move both together,
  or every visitor runs on the stub and the boards read "not reachable". It has shipped broken once.

**The live modes**

- `DYNASTY_LIVE` (`dynasty-access.js`), `FULLTEAM_LIVE` (`fullteam-access.js`) and `COMMISH_LIVE`
  (`cfb/commish/access.js`) are true. A database missing a migration fails
  SILENTLY: the season plays and the row is refused on submit. Run `launch_preflight.sql` against the
  real database after any migration. Cloudflare deploys from main on its own, so the deploy and the
  schema move independently.
- The fantasy SQL goes through `.github/workflows/fantasy-sql.yml` (dry run by default).

**The daily locks**

- A cached meter answer runs out at its own `resetsAt` (`dailyLapse`), and a cached one-new-dynasty
  refusal at its `nextAt`. A gate reads the meter through `dailyShut`, `dailyLeft`, `dailyResetsAt`
  and `dailyAllow`, which retire it, never off `dailyState` directly.
- `ps_attempt_day_end` never stamps a lock that has already run out (`154_dynasty_day_end_lapsed.sql`).
  Stamping one turned a countdown at zero into a fresh 24 hours.

**Overtime**

- Overtime follows the NFL's playoff rules (the owner's call, 2026-10-22): a toss, 15 minute periods,
  both sides possess, then the next score wins, and a defensive score on the first possession ends it.
  `otPlanFor` in `engine.js` is the one place that decides it; the broadcast and the drive picture play
  its plan (`script.ot`) and never invent a possession of their own.

**The Fantasy Challenge**

- **A price never moves once anybody has drafted against it.** The board is written on the Tuesday
  and left alone. Availability is live; prices are not.
- **Injuries are their own file** (`football/data/injuries_<season>_w<week>.json`), merged over the
  pool, because prices must not move and injuries must.
- **The entry is the server's, and it fails CLOSED.** `football/fantasy/entries.js` is the only thing
  that talks to `109_fantasy_challenge.sql`.
- A published week's cap is that week's. The constant is only the next week's.
- **The week opens Tuesday, and three things make sure of it** (the owner's rule, 2026-10-22):
  `fantasy-pool.yml` (Tuesday 11am Eastern, catch-ups Wednesday and Thursday morning),
  `fantasy-watchdog.yml` (every two hours Tuesday afternoon to Thursday, dispatches the build
  if the week is not live), and the issue "Fantasy Challenge: the week did not open". A
  scheduled or watchdog run never rebuilds a week that is already live.
- Pro buys drafts, never a price, a board or a score. One entry each.

**Accounts and money**

- A yearly plan's grace lives in `premium_yearly_grace()` and nowhere else.
- The Run The Bundle bonus is insert if absent. That is the whole of "once per account, ever".
