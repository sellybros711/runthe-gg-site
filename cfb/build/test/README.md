# Tests

Nothing here ships. Everything here runs against a real Postgres and a real browser,
because the two things most worth checking are exactly the two a unit test cannot
reach: what the database refuses, and what the game does when the network does not
answer.

## Setup

```
initdb -D /tmp/pg && pg_ctl -D /tmp/pg -o '-p 5433 -k /tmp' start
createdb -h /tmp -p 5433 cfbtest
export PGHOST=/tmp PGPORT=5433
psql -d cfbtest -f cfb/build/test/stub_supabase.sql
psql -d cfbtest -f supabase/62_cfb_leaderboard.sql
```

`stub_supabase.sql` is the slice of Supabase the migration leans on: the `profiles`
table from `10_accounts.sql`, the `anon` and `authenticated` roles, and an `auth.uid()`
that reads a session setting instead of a JWT so a test can submit as a guest, as one
account and then as another.

## The suites

| File | What it proves |
|---|---|
| `test_leaderboard.sql` | Every rule `cfb_submit_run()` claims to enforce, with a case that passes and a case that is refused. Plus ownership, claiming, renaming, idempotency, the ordering key, and that all four board queries are index scans at 200,000 rows. 49 assertions. |
| `test_score_parity.mjs` | `board.js`'s `scoreOf()` computes exactly what the generated `score` column computes, across all 27,217 results the game can produce. |
| `test_board_e2e.mjs` | Real seasons played in Chromium, submitted through the real validator, listed on the real board. Guest and signed-in. Plus: a board that is not there leaves the results screen intact. |
| `postgrest_stub.mjs` | Not a test. A PostgREST-shaped front end for the real database, so the browser talks to something that parses its URLs independently. |

```
psql -d cfbtest -f cfb/build/test/test_leaderboard.sql          # look for FAIL
node cfb/build/test/test_score_parity.mjs cfbtest
(nohup python3 -m http.server 8080 &)
(nohup node cfb/build/test/postgrest_stub.mjs 5555 cfbtest &)
node cfb/build/test/test_board_e2e.mjs
```

## Two bugs these caught, so far

**`scoreOf()` disagreed with the column on every negative half.** `Math.round` rounds a
half toward positive infinity; Postgres `round()` rounds a half away from zero. 6,800 of
27,217 combinations were one whole step out, which would have shown players a place
counted against a score their row does not have. Found by the sweep, not by reading.

**The first version of that sweep reported everything green** because it fed the client
the value Postgres had already rounded. Rounding was the step under test, so it tested
nothing. The fix is why `score_parity` keeps `raw_diff` alongside `point_diff`.
