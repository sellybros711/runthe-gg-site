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
psql -d cfbtest -f supabase/63_cfb_run_mode.sql
```

`stub_supabase.sql` is the slice of Supabase the migration leans on: the `profiles`
table from `10_accounts.sql`, the `anon` and `authenticated` roles, and an `auth.uid()`
that reads a session setting instead of a JWT so a test can submit as a guest, as one
account and then as another. It also seeds the two accounts the browser suites sign
in as, because `cfb_submit_run()` reads the display name out of `profiles` and an
empty table records a null name rather than failing, which reads as a product bug
in a database that was simply never filled in.

Run the two migrations in order, on a database that has never had them: that is the
same thing launch day does to the production project, and it is worth having proved
before the day rather than during it.

## The suites

| File | What it proves |
|---|---|
| `test_leaderboard.sql` | Every rule `cfb_submit_run()` claims to enforce, with a case that passes and a case that is refused. Plus ownership, claiming, renaming, idempotency, the ordering key, and that all four board queries are index scans at 200,000 rows. 49 assertions. |
| `test_score_parity.mjs` | `board.js`'s `scoreOf()` computes exactly what the generated `score` column computes, across all 27,217 results the game can produce. |
| `test_board_e2e.mjs` | Real seasons played in Chromium, submitted through the real validator, listed on the real board. Guest and signed-in. Plus: a board that is not there leaves the results screen intact. |
| `test_conference.mjs` | Conference Draft: that the wheel never once leaves the conference (checked against the conference each team was in *that season*), that the run records which competition it belongs to, and that the six boards stay apart. |
| `test_gates.mjs` | What an account is for. School colours and the full trophy case signed in, signed out, and with the sign-in library blocked entirely. |
| `test_challenge.mjs` | Challenge a friend end to end: the link carries the roster, both seats see the identical game from opposite sides, spectators get spectator buttons, and a mangled link just opens the game. |
| `test_ranks_tab.mjs` | The Where it ranks tab in all three of its lives: pinned off, no `cfb_runs` on the server, and a board that answers. The middle case is the pre-launch state and must reach the *same* placeholder as the first, because "not open yet" and "did not answer" are different facts. |
| `test_launch.mjs` | The things that are nobody's subsystem: every internal link and sitemap entry resolves, a cold visit's weight and time-to-playable, the head and structured data on both pages, alt text and button names, sideways scroll at eight widths, a whole season with fonts and ads and the board all refused, and the card on the site's front page. |
| `render_school_colors.mjs` | Draws all 83 schools' landed reel tiles onto one sheet, and reports any trim that cannot be told from its background. "Are the colours right" is a question you answer by looking. |
| `postgrest_stub.mjs` | Not a test. A PostgREST-shaped front end for the real database, so the browser talks to something that parses its URLs independently. |
| `gzip_server.mjs` | Not a test. A static server that gzips the way GitHub Pages gzips. `python3 -m http.server` does not, and the 5MB player file goes over the wire at 727K, so an uncompressed measurement measures a page nobody is served. |

```
psql -d cfbtest -f cfb/build/test/test_leaderboard.sql          # look for FAIL
node cfb/build/test/test_score_parity.mjs cfbtest
(nohup python3 -m http.server 8080 &)
(nohup node cfb/build/test/postgrest_stub.mjs 5555 cfbtest &)
node cfb/build/test/test_board_e2e.mjs
node cfb/build/test/test_gates.mjs
node cfb/build/test/test_conference.mjs
node cfb/build/test/test_challenge.mjs
node cfb/build/test/test_ranks_tab.mjs
(nohup node cfb/build/test/gzip_server.mjs &)                   # 8081, gzipped
node cfb/build/test/test_launch.mjs
node cfb/build/test/render_school_colors.mjs   # then look at the sheet
```

## Seven bugs these caught, so far

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

**A conference run recorded itself as free play.** The PostgREST stand-in passes arguments
positionally, so the mode parameter added to `cfb_submit_run()` had to be added there too;
missing, it silently took its default. Worth keeping as a lesson about the stub: a new
parameter needs adding in two places, and the failure is quiet.

**Adding an argument to the test helper broke sixteen unrelated tests.** `create or replace
function` only replaces a function with the *same* argument list. A new parameter creates a
second overload beside the old one, and then every call that fits both is ambiguous. The
suite now drops every overload of its helpers before defining them.
