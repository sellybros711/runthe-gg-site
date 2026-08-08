# Segue: the leaderboard and account tests

Three suites, and they test three different things. Running only one of them
proves less than it looks like it does.

| | what it proves |
|---|---|
| `test_leaderboard.sql` | the SQL **refuses** what it claims to refuse |
| `test_username.sql` | one account, two display names, and the two namespaces cannot collide |
| `test_board_e2e.mjs` | `board.js` and the SQL **agree** about the wire between them |
| `scripts/setlist/check_data.mjs` | the page still treats all of it as **optional** |

## Running them

Postgres 16 or later, and nothing else. Supabase is not required: the parts of
it these files need — `auth.uid()`, `auth.users`, `profiles`, `citext`, and the
`anon` and `authenticated` roles — are stubbed by `stub_supabase.sql`. The
production project already has every one of them, created by Supabase itself or
by `supabase/10_accounts.sql`, so that file is **not** part of a deploy.

```sh
createdb seguetest
psql -d seguetest -f setlist/build/test/stub_supabase.sql
psql -d seguetest -f supabase/67_setlist_leaderboard.sql
psql -d seguetest -f supabase/68_setlist_username.sql
psql -d seguetest -f setlist/build/test/test_leaderboard.sql       # 93 assertions
psql -d seguetest -f setlist/build/test/test_username.sql          # 40 assertions

node setlist/build/test/postgrest_stub.mjs 5556 seguetest &
node setlist/build/test/test_board_e2e.mjs http://localhost:5556

node scripts/setlist/check_data.mjs
```

All three suites are **re-runnable against the same database**, and that took a
deliberate fix in each. The SQL one resets the two usernames at the top, because
its own rename case changes one of them and a second run would otherwise fail
five assertions that have nothing to do with renaming. The end-to-end one stamps
a per-run nonce into every set of picks, because `segue_submit_run()` swallows a
repeat of the same picks at the same score inside a minute — correct in
production, and enough to hand the second run rows the first one left behind.

## Why the stub is a real server and not a mocked `fetch`

Mocking `fetch` would prove that `board.js` agrees with a mock somebody wrote to
match `board.js`. What is worth testing is the seam: the URLs it builds, the
operators it puts in them, the `Content-Range` it reads a count out of, and the
shape of the payload `segue_submit_run()` receives. All of that has to survive
contact with something that parses it independently, and the validator on the
other side has to be the real one.

`postgrest_stub.mjs` therefore understands only the query shapes `board.js`
actually emits and answers anything else with a 400. A new shape appearing
should break the test until it is understood, rather than being served wrong.

It passes arguments to the RPC **positionally**, which PostgREST does not.
That is on purpose: a parameter added to the function has to be added here too,
where PostgREST would silently let it take its default.

It has already earned its keep once. `segue_set_name()` returns `text`, and the
stub's `send()` passes a string straight through because every other caller
hands it a body that is *already* JSON. So the route emitted the bare word
`ProbeName` — invalid JSON — and the client read `null` out of a call that had
plainly worked. Real PostgREST answers `"ProbeName"`. A mocked `fetch` written
to match the client would never have shown that.

## What none of this proves

The score is computed in the browser against a CSV that lives in the browser.
Nothing here can recompute a total, so the total is client-reported and a
determined person can post a show they did not draft. The header of
`supabase/67_setlist_leaderboard.sql` says exactly what the coherence checks do
and do not buy, and why the board should not be the basis for a prize until
there is an edge function that replays a show from its picks.
