# Stumpire (testers only)

Five at-bats against an umpire who has already called the most common answers
to an open prompt. Name something he did not see coming. Everyone gets the same
five prompts each day; the slate turns over at midnight Eastern.

**It is visible to nobody but testers.** Every API route and both page shells
answer 404 to anybody `stumpire_access()` refuses, and the hub adds the tile
only after the API confirms a tester.

## Where things are

| | |
|---|---|
| `config.js` | every tunable number (clock, bands, blend k, ramp, coverage) |
| `normalize.js`, `matcher.js` | the answer engine: tapped id, exact, alias, order free, surname, fuzzy, picker, NO PITCH |
| `entities.js`, `data/entities.json` | the dataset, with stable ids (generated) |
| `query.js` | the prompt query language and field coverage |
| `scoring.js` | prior share, blended expected share, depth, tiers, called list |
| `validate.js`, `publish.js` | the authoring rules, and building a frozen slate |
| `game.js` | the rules as a pure state machine (server only) |
| `api.js` | the API over a database interface |
| `db-supabase.js`, `db-memory.js` | production and in-memory stores |
| `web/*.html` -> `pages.js` | the client and the admin tool (served by a Pages Function, never static) |
| `../api/stumpire/[[path]].js` | `/api/stumpire/*` |
| `../arcade/stumpire/[[path]].js` | `/arcade/stumpire/` and `/arcade/stumpire/admin` |
| `supabase/133_stumpire.sql` | tables, the gate, publish, the freeze trigger |

The client holds no rules. It shows what the server sends: the prompt, the
called count and the tell for the current at-bat only. The called list arrives
after the at-bat ends, and no valid answer is ever sent before it is earned.

## Turning it on

1. Run `supabase/133_stumpire.sql` in the Supabase SQL editor.
2. Set `STUMPIRE_COOKIE_SECRET` (any long random string) in the Pages
   environment beside `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE` and
   `SUPABASE_ANON`. Without it the page shells are a 404 for everybody.
3. Make yourself the first admin:
   ```sql
   insert into stumpire_testers (user_id, role) select id, 'admin' from profiles where username = 'YOU';
   ```
4. Seed the ten sample prompts and publish a test slate for today:
   ```
   node functions/_stumpire/build/seed-slate.mjs --sql | psql "$SUPABASE_DB_URL"
   node functions/_stumpire/build/seed-slate.mjs --sql --date 2026-10-11 | psql "$SUPABASE_DB_URL"
   ```
   It refuses a date that already has a slate, so a re-run never moves a grade.
5. Open `/arcade/` signed in. The Stumpire tile appears for testers; it also
   sets the signed cookie the page shells need. Admin: `/arcade/stumpire/admin`.

Testers are rows, so adding or removing one needs no deploy (the admin page, or
SQL). `stumpire_settings.mode` is `off` (admins only), `testers`, or `public`.

## Scripts

```
node functions/_stumpire/build/build-entities.mjs     rebuild data/entities.json (reports lost ids)
node functions/_stumpire/build/import-search.mjs --source fixture|wikipedia|csv [--spot google.csv]
node functions/_stumpire/build/audit-fields.mjs       where an award can be trusted
node functions/_stumpire/build/seed-slate.mjs [--sql] [--date YYYY-MM-DD]
node functions/_stumpire/build/replay-sportegories.mjs --file answers.csv | --live | --fixture
node functions/_stumpire/build/pages.mjs              after editing web/*.html
node functions/_stumpire/build/dev-server.mjs         local play against the in-memory store (?as=tester|admin|nobody)
node --test functions/_stumpire/test/*.test.mjs
node functions/_stumpire/test/check-browser.mjs       the client in Chromium, phone and desktop
```

SQL: see the header of `supabase/test/stumpire_base.sql`.

### The Sportegories replay

Sportegories does not keep every answer on the server. The only table of typed
answers is `answer_gaps` (78), and it holds just the answers Sportegories could
not settle. So `--live` (service role, from a machine that reaches the project)
or `--file` (a CSV export with an `answer` column) is the real measure.
`--fixture` is synthetic: every NFL, NBA and MLB name in the Sportegories index
typed the ways people type, plus curated nicknames. It is a floor on
regressions, not the launch number.

## Data, honestly

- **`search_avg` is a synthetic fixture today.** Wikimedia is refused by the
  dev sandbox, so `.github/workflows/stumpire-search.yml` runs the real import
  on a runner and uploads the file for review. Seed slates graded on the
  fixture are for testers only. The fixture is flatter than real interest, so
  most seed called lists sit under the 35% coverage band (a warning, shown in
  the authoring tool).
- **Award coverage was measured, not assumed** (`audit-fields.mjs`). MLB
  All-Star is missing for 106 of 266 MVPs, Cy Young winners and Hall of Famers
  since 1940 (Jeter, A-Rod, Judge), so it is blocked in
  `CONFIG.AWARD_COVERAGE`. NBA All-Star and NFL Pro Bowl had six verifiable
  holes, now in `data/fixes.json`. Career stats ride on notable players only,
  so `stat` is never authorable.
- The source index carried 115 people twice (a curated row and a scraped one).
  The build merges them, or one person would be two answers holding half a
  share each.

## Rules decisions worth knowing

- A team prompt is exempt from the ramp's valid-answer counts (12 teams can
  never reach 40) but takes its at-bat's called count, so team prompts belong
  early in a slate.
- An invalid answer's strike keeps the clock running; an expired clock's strike
  starts a fresh 30 seconds for the retry.
- Re-entering an answer already struck in the same at-bat is a NO PITCH, not a
  second strike.
- An arguable answer is never called, and a wildcard cannot be arguable.
- An upheld challenge: the answer joins today's slate as a benefit-of-the-doubt
  single for later players (`stumpire_accept_answer`, the one insert the freeze
  trigger allows), and the challenger's at-bat loses one strike and becomes a
  hit at its frozen tier or a single. A strikeout out comes off the board and a
  game it ended is reopened. The lasting fix (an alias, a missing award) goes in
  `data/aliases.json` or `data/fixes.json` and a rebuild.
- Guest play is modelled (guest id header, `stumpire_claim` on sign in), and
  only reachable in `public` mode: under `testers` a guest is a 404 like anyone
  else unlisted.

## Extension points (not built)

The placeholder Stumpire reads `window.STUMPIRE_CHARACTER = { mood, state }`
(`#ump` carries both as data attributes). Art, Rive animation, lines, sound, the
share card image, reverse and Stretch modes, Batting Practice observed counts
(`stumpire_observed` is where they would join), the paid archive (`GET result`
takes `?date=`) and the Arcade rename are out of scope.
