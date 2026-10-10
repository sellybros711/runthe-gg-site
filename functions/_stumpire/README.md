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
| `entities.js`, `data/entities.js` | the dataset, with stable ids (generated) |
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
| `livecheck.js`, `supabase/136_stumpire_rulings.sql` | a challenged strike ruled live, and the rulings remembered |

The client holds no rules. It shows what the server sends: the prompt, the
called count and the tell for the current at-bat only. The called list arrives
after the at-bat ends, and no valid answer is ever sent before it is earned.

## The Stumpire score

`game.js` (`SCORE`, `boxScore`) is the one place it is worked out; the share
line, the board and the screen all read it.

| | points |
|---|---|
| each total base | 10 |
| each hit | 5 |
| each home run | 10 more |
| each run | 15 |
| each strikeout | minus 10 |

Runs are scored the simple baseball way: runners move up as many bases as the
hit is worth, and a called out moves nobody. The base runners on the field are
these runners. A perfect day (five home runs) is 350; the score never goes
below 0. The board ranks by score, then total bases, then fewer outs, then
fewer strikes. `supabase/134_stumpire_score.sql` stores it on the play row
(`stumpire_save_play_v2`); against a database without 134 the save falls back
to the 133 function and the board falls back to total bases.

`GET board` is the day's finished, signed in games, best first. `GET result`
adds the player's streak (days in a row with a finished game, alive through
yesterday), their rank and the size of the field. A ruled answer carries
`rarity`, the percent of fans the model expects to give it.

## Turning it on

It runs itself. `.github/workflows/stumpire-daily.yml` fires when this lands on
main and every night after (about 11pm Eastern), using the repo's
`SUPABASE_DB_URL` secret:

1. applies `supabase/133_stumpire.sql` (idempotent);
2. seeds the testers, only while the table is empty: `csel8` as admin,
   `runnyj`, `malikwillislover`, `slimeyb3` and `jordantest` as testers;
3. imports real search interest (Wikipedia pageviews, cached per month);
4. publishes today and the next two days from the prompt pool, skipping any
   date already published and avoiding prompts used in the last six days;
5. commits `search_avg.json` when it moved, so the admin preview agrees.

Nothing to set in Cloudflare: the page cookie is keyed off the service role
secret the site already has (`STUMPIRE_COOKIE_SECRET` overrides it if set).

To play: sign in at `/arcade/` with a tester account. The Stumpire tile
appears (this also sets the cookie the page needs); tap it. Admin:
`/arcade/stumpire/admin`. Testers are rows, so add or remove one from the
admin page or with SQL; the nightly run never re-adds a removed tester.

The pool is `prompts/seed.json` plus anything saved in the admin tool (the
table's copy wins for the same id). `wildcard: "auto"` picks the wildcard
from just past the called list, seeded by the date; write an entity id to pin
one. Every prompt states its era, because a prompt's years filter its valid
set, and NFL prompts start in 1995 or later (`CONFIG.LEAGUE_COVERAGE`).

## Scripts

```
node functions/_stumpire/build/build-entities.mjs     rebuild data/entities.js (reports lost ids)
node functions/_stumpire/build/import-search.mjs --source fixture|wikipedia|csv [--spot google.csv]
node functions/_stumpire/build/audit-fields.mjs       where an award can be trusted
node functions/_stumpire/build/seed-slate.mjs [--sql] [--date YYYY-MM-DD] [--days N] [--recent used.json] [--extra prompts.json]
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

- **`search_avg` in the repo starts as a synthetic fixture.** Wikimedia is
  refused by the dev sandbox, so the nightly workflow imports the real
  pageviews on a runner before it publishes, follows redirects, skips
  disambiguation pages, and gives anybody with no article the 1st percentile
  of those found. If Wikimedia is down that night, the committed file is used
  and the log says which. Two players sharing a name whose plain title is a
  disambiguation page fall through to it and share its numbers.
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
- **A challenge on a strike is ruled the moment it is made** (`livecheck.js`,
  `CONFIG.LIVE_CHALLENGE`). A strike is always a real player the slate did not
  list, so the server looks him up on Wikidata and judges the prompt's query
  with Sportegories' reading of the record (the two games share one
  vocabulary). The record confirms it: upheld at once, exactly as below. The
  record contradicts it (another league, outside the prompt's years, a
  position he never played): denied at once. The record cannot settle it,
  which is most award prompts because Wikidata lists a fraction of the Pro
  Bowls and All-Star games: it stays open for the admin. A challenge on a
  called out never goes live.
- **Rulings are remembered** in `stumpire_rulings` (136), one per prompt and
  player. An upheld one puts the player on every later slate that deals the
  prompt, as a single, with no challenge; a denial answers a repeat at once and
  is asked again after 30 days. An admin's resolution is saved as final and the
  live check never overturns it. Without 136 challenges still rule live and
  nothing is remembered.
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
