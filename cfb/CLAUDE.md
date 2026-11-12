# College Football and Commissioner Mode

The repo-wide rules are in the root CLAUDE.md. This file holds only what a change to `cfb/` must
obey. The why, the history and the full design live in the knowledge base.

## The knowledge base

`sellybros711/runthe-gg-kb`, folder `games/cfb/`. Start at `cfb-overview.md`, and read
`cfb-owner-rulings.md` before designing anything. In a cloud session it is cloned at
`/home/user/runthe-gg-kb`. If it is not there, attach it (add_repo) before a design task. A small fix
that only touches code can go ahead without it.

| task | read |
|---|---|
| the Commish door, the free season, terms | `cfb-commish-access.md` |
| rulings, the docket, eras and frontiers | `cfb-commish-rules.md` |
| the standings, boards, settings sheets | `cfb-standings-settings.md` |
| the College Fantasy Challenge | `cfb-fantasy.md` (and `fantasy-*.md` in `games/football/`) |

After a meaningful change, update the matching note by pull request on the knowledge base.

## Commands

```
node cfb/build/test/commish/test_clock.mjs       the page obeys the free season clock
node cfb/build/test/commish/test_longterm.mjs    a term, the ladder, both tiers (--seasons 12)
node cfb/build/test/commish/probe_longrun.mjs    30 runs of 50 seasons (--bold, --years 80 --runs 40)
node cfb/build/test/commish/test_standings.mjs   the standings screen, four states
node cfb/build/test/test_fantasy.mjs             the College Fantasy Challenge (--quick: no browser)
node cfb/build/test/test_fanpromo.mjs            the results screen's Fantasy card: open week, no lineup in
```

The SQL suites (`supabase/test/commish_clock_test.sql`, `tenure_test.sql`, `cfb_fantasy_test.sql`)
run against a scratch Postgres; the order of files each needs is in the matching note.

## Rules a change here must keep

**Copy**

- **A school is singular.** `Oregon is 12-0`, never `Oregon are`. Two schools joined by "and" are
  plural, and so is a nickname (`the Ducks are`). Pronouns are left loose on purpose.

**Commissioner Mode**

- **The free season clock is the server's** (`supabase/104_commish_free_clock.sql`). A paying
  account is never written to that table.
- **It meters a SEASON, not a start**, checked at the top of `office()`, so quitting and retaking
  the job cannot replay season one.
- **It fails OPEN.** An unreachable clock lets the season through, on purpose.
- **Do not unify the daily allowances** of the football and college games. A Dynasty season and a
  Commissioner season are different units of play.
- **A term is not five seasons.** Its length is the verdict on the last term, and copy has to
  survive a renewal: never write a term length into a sentence.
- **The score board is scoped to a doctrine.** Tenure is the one global board.
- **A value is never bigger than the name above it** on a settings sheet.
- **A redirect back from Stripe lands on the host the buyer left from.**

**The College Fantasy Challenge**

- ESPN is the only source. The week locks at the first slate kickoff. There is no results file:
  points live only in `cfb_fantasy_results`.
- **The results screen offers it only while entries are open.** From the week opening to its
  lock, to somebody with no lineup in (this browser's record, and signed in,
  `PS_CFB_AUTH.fantasyMyEntry`, which reads `cfb_fantasy_my_entry`). An inline card, never a sheet.
  `fantasyPromoPaint()` holds the rule, and every `show('s-over')` calls it.
- **`fantasyMyEntry` is in `auth.js` and needs `auth.js`'s version moved with it.** Three pages load
  `/cfb/auth.js`, so the `?v=` moves on all of them in one commit.
- **The week opens Monday, and the watchdog makes sure.** `cfb-fantasy-pool.yml` builds it at 11am
  Eastern. `cfb-fantasy-watchdog.yml` asks from Monday noon to Thursday whether the week is open,
  dispatches a catch up if not, and opens an issue from Tuesday. Never before Monday noon: on
  Sunday the next week already reads as next.
- **A scheduled or catch up build never rebuilds a live week**, because a price never moves once
  somebody has drafted. The guard reads the pointer from `origin/main`, not the checkout: a
  dispatched run checks out the commit main was on when it was queued.
- **Only starting quarterbacks are on the board, read off the box scores** (`roles.mjs`, the
  owner's call, 2026-11-12). There is no college depth chart: the starter led his team's passing
  in its latest game, and the regular starter stays until he misses two straight. The Monday
  build prices a starter on his starts. Mid-week a backup is `{ st: 'off', roster: 'QB2' }` in
  the injury file, and no price moves. ESPN's roster stops at 100 names alphabetically, so a
  starter it leaves out is added from the store.
- **`next-week.mjs` is the week, and an unreadable scoreboard fails it.** ESPN answers null rather
  than throwing, which `nextWeek` alone reads as the season over, or as a later week.
