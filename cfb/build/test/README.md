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
| `test_gates.mjs` | What an account is for. School colours and the full trophy case signed in, signed out, and with the sign-in library blocked entirely. |
| `render_school_colors.mjs` | Draws all 83 schools' landed reel tiles onto one sheet, and reports any trim that cannot be told from its background. "Are the colours right" is a question you answer by looking. |
| `postgrest_stub.mjs` | Not a test. A PostgREST-shaped front end for the real database, so the browser talks to something that parses its URLs independently. |

```
psql -d cfbtest -f cfb/build/test/test_leaderboard.sql          # look for FAIL
node cfb/build/test/test_score_parity.mjs cfbtest
(nohup python3 -m http.server 8080 &)
(nohup node cfb/build/test/postgrest_stub.mjs 5555 cfbtest &)
node cfb/build/test/test_board_e2e.mjs
node cfb/build/test/test_gates.mjs
node cfb/build/test/render_school_colors.mjs   # then look at the sheet
```

## Five bugs these caught, so far

**`scoreOf()` disagreed with the column on every negative half.** `Math.round` rounds a
half toward positive infinity; Postgres `round()` rounds a half away from zero. 6,800 of
27,217 combinations were one whole step out, which would have shown players a place
counted against a score their row does not have. Found by the sweep, not by reading.

**The first version of that sweep reported everything green** because it fed the client
the value Postgres had already rounded. Rounding was the step under test, so it tested
nothing. The fix is why `score_parity` keeps `raw_diff` alongside `point_diff`.

**A signed-in trophy case spun forever when the board could not answer.** `careerRows`
stayed null on a failed fetch, so every repaint asked again and showed the spinner again,
and there was no state in which it stopped. Found by stopping Postgres underneath a
signed-in session, which is the accident worth having.

**Every gate said "accounts are offline" before the library had a chance to load.** The
game's initial auth state had no `waiting` key, so the gates read `undefined` and went
straight to the apology. On a slow connection the first thing a player saw was a message
about something that was about to work.

**Half the schools were drawn in a colour they do not play in.** `hexToHsl` reports hue 0
for anything achromatic, because that is what the formula returns when there is no hue to
report, and the wheel then forced a saturation floor onto it. White came back `#dd3c3c`
and black came back `#671e1e`: Kentucky is blue and white and was drawn with a red border,
Iowa is black and gold and was drawn on dark red. Reported from a phone, not caught here,
which is why `render_school_colors.mjs` now exists.
