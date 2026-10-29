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
