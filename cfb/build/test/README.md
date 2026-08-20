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
psql -d cfbtest -f supabase/53_football_profile_avatars.sql
psql -d cfbtest -f supabase/62_cfb_leaderboard.sql
psql -d cfbtest -f supabase/63_cfb_run_mode.sql
psql -d cfbtest -f supabase/64_cfb_bowl_key.sql
psql -d cfbtest -f supabase/66_cfb_profile_avatars.sql
psql -d cfbtest -f supabase/67_cfb_named_board.sql
psql -d cfbtest -f supabase/86_cfb_point_diff_board.sql
node cfb/build/test/postgrest_stub.mjs 5555 cfbtest &
python3 -m http.server 8080 &
```

`53_football_profile_avatars.sql` is in that list only for the `profiles.avatar_initials`
column, which `66_cfb_profile_avatars.sql` backfills from. It is the NFL game's migration
and its own statements against `ps_runs` will error on a database that has no NFL tables.
Those errors are expected here and harmless: the column is added before them.

Every FAIL in `test_leaderboard.sql` this setup has ever produced on working code came
from running it against a database that was missing one of these files rather than from
the code it tests, so check the schema before you read a red line as a regression.

The database name has to be the SAME one the PostgREST stand-in is serving. The browser
suites seed rows with `psql` and read them back through `board.js`, so if the two point at
different databases every seeded assertion still passes and only the ones that cross the
seam fail. That reads like a code regression in the leaderboard and is not one.

`stub_supabase.sql` is the slice of Supabase the migration leans on: the `profiles`
table from `10_accounts.sql`, the `anon` and `authenticated` roles, and an `auth.uid()`
that reads a session setting instead of a JWT so a test can submit as a guest, as one
account and then as another. It also seeds the two accounts the browser suites sign
in as, because `cfb_submit_run()` reads the display name out of `profiles` and an
empty table records a null name rather than failing, which reads as a product bug
in a database that was simply never filled in.

Run the migrations in order, on a database that has never had them: that is the
same thing launch day does to the production project, and it is worth having proved
before the day rather than during it.

## The suites

| File | What it proves |
|---|---|
| `test_leaderboard.sql` | Every rule `cfb_submit_run()` claims to enforce, with a case that passes and a case that is refused. Plus ownership, claiming, renaming, idempotency, the ordering key, and that every board query is an index scan at 200,000 rows, on all three axes and in both directions. The differential axis is checked the same way the two it sits beside are, against the indexes `86_cfb_point_diff_board.sql` adds. |
| `test_score_parity.mjs` | `board.js`'s `scoreOf()` computes exactly what the generated `score` column computes, across all 27,217 results the game can produce. |
| `test_scorelines.mjs` | That the scores on screen are scores college football has actually produced. Names every calibration key the engine reads one at a time, then demands each final be a hi/lo pair that appears in `real_pairs`, that across a few thousand real seasons nobody ever scores 1 or 4, that 2 and 5 stay near their real rates, and that the mean lands within three points of the real one. The pair check is the load-bearing one: it is what noticed that the sampler was switched off. |
| `test_player_data.mjs` | The shipped data files, checked for what a player notices before a test does: that nobody has a fantasy average beside a blank stat line, that no name is one the pipeline would correct, that no chemistry label names a suffix instead of a man, and that every team the wheel can land on offers four men to choose between. Every assertion in it exists because somebody found it on their phone first. No database, no browser, no key. |
| `test_achievements.mjs` | That every badge in the catalog can actually be earned. Builds a career out of the real player file, one designed to earn all 246, and demands the evaluator hand back all 246. Every simultaneous-roster badge is solved against the six slots, the two-back cap, the two-per-team-season cap and the $11M budget before it is believed, and the three-Heisman roster that does not fit is kept in as the negative case. No database, no browser. |
| `test_cabinet.mjs` | The trophy case drawn on a 360px phone rather than counted: the eight shelf headings add up to the whole catalog, the biggest shelf opens and draws all of it, and nothing hangs off the side. Signed in is stubbed, because the full shelves are a signed-in feature, and the board URL points at a dead port so the case falls back to this browser's own seasons. |
| `test_board_e2e.mjs` | Real seasons played in Chromium, submitted through the real validator, listed on the real board. Guest and signed-in. Plus: a board that is not there leaves the results screen intact. |
| `test_conference.mjs` | Conference Draft: that the wheel never once leaves the conference (checked against the conference each team was in *that season*), that the run records which competition it belongs to, and that the six boards stay apart. |
| `test_gates.mjs` | What an account is for. School colours and the full trophy case signed in, signed out, and with the sign-in library blocked entirely. **Currently broken**, and not by anything it tests: the profile sheet became a hub and five pages, and this suite still drives the old tab strip. Its signed-out cases assert an information architecture that no longer exists, so fixing it is a product decision rather than a selector swap. |
| `test_challenge.mjs` | Challenge a friend end to end: the link carries the roster, both seats see the identical game from opposite sides, spectators get spectator buttons, and a mangled link just opens the game. |
| `test_bowl_key.mjs` | Which bowl a season played, as the row records it. Sweeps every reachable (wins, rank) and demands the database and `seedFromRanking()` agree on the tier, round-trips all 37 bowl names through the slug and back, and proves the named-bowl badges are earnable signed in, which they were not before `64_cfb_bowl_key.sql`. |
| `test_report_card.mjs` | The coach's report card, which a player reported as making no sense: a $4.8M quarterback in the 99th percentile of his position reading WEAK under a badge saying DUAL THREAT. Checks the arithmetic the panel now claims (the four lines sum to the whole shortfall, to within a rounding point), that all three words are reachable and none of the four lines is stuck on one, that a big-name rushing quarterback is never marked down for his legs, and that the panel draws with a reason under every bar. |
| `test_slot_chooser.mjs` | The sheet a two-position man puts up, read off a 390px screen: that tapping him asks rather than assumes, that every option names the spot and says what it leaves behind, and that the copy is the short one. Deterministic, because two-position men are 143 of 14,154 players and clicking until one turns up took minutes: the page seeds a run from `Date.now()` and `Math.random()`, so both are pinned and the first spin is always 2008 Texas A&M with Ryan Tannehill on the board. |
| `test_arcade_ad.mjs` | The arcade house ad in `/assets/arcade-ad.js`, shared by the homepage, the NFL game and the golf game, **driven through the homepage** because the college game no longer runs it. Checks the panel itself (ten games named, the count agreeing with the grid, the link opening in a new tab) and the promises: once a visit, checked across a second tab because that is the case sessionStorage alone gets wrong; never again once the box is ticked; never stacked on a sheet already open; the opt-out on screen without scrolling at six widths, because an ad that hides its own off switch has earned everything said about it; and the page surviving storage that throws instead of answering. Its last section holds the removal in place: the college game must keep asking nobody, and must not even load the script. |
| `test_bracket.mjs` | The twelve-team playoff bracket, which replaced a strength ladder that had no field in it at all and put a four seed opposite a four seed. Two halves: over 3,600 brackets, that nobody meets their own seed, that no team is in the field twice, that every round has somebody in the other seat, and that nobody knocked out comes back; then two real runs driven to the screen, a four seed with a bye and an eleven seed playing all four rounds. On the screen it checks the shape (4/4/2/1), that a bye seed watches the first round resolve before their own opponent exists, that no round is filled in before the one in front of it is played, that the number beside your opponent is their seed in THIS bracket, and that the rail scrolls sideways without the page doing so. Deterministic: `window.PS_CFB_SEED` pins the run, because a good roster makes the playoff about one season in six and a suite that drafts and hopes fails at random. |
| `test_tutorial.mjs` | The coached practice draft, ported from the football game and themed for this one. Checks the three claims that make it worth having: it TEACHES (the coach bar reads the live run, so the money it quotes falls as spots fill rather than being copy), it COSTS NOTHING (a practice draft is flagged on screen and reaches neither the season history, the leaderboard nor a badge), and it does not BLOCK the game (every tile can be scrolled clear of the fixed bar and tapped). It also asserts the opening board is still the one the seed was chosen for, 2018 Oklahoma with Kyler Murray at $4.8M of $11M next to a $0.30M back and a tight end who can only play flex: if the wheel stops dealing that, the tutorial still runs but stops teaching. The re-spin price assertion is there because writing the tutorial found the button advertising $1M for a fee the engine charges $500K for. |
| `test_credits.mjs` | Whose touchdown it was, and how long the kick was. The postseason broadcast used to know a touchdown had happened and never whose, so a drafted roster could play a whole playoff without one of its six names being said, and "You field goal" said nothing at all about what happened. Engine half: one credit per touchdown of yours and none for anybody else's, a quarterback credited with a score always ran it in, nobody catching a pass from himself, all six men reachable, the kick distribution having a median in the thirties and a real fifty-plus tail rather than a flat draw across the legal range, and fifty whole seasons played twice, once with the commentary being built between the weeks and once without, asserted identical, because a draw taken from the season's own rng would silently rewrite the rest of the year rather than throw. Screen half: a real run driven to a bye seed's playoff and a second, weaker one driven to a bowl, reading the log and the call banner off the page. It also builds the LONGEST call the engine can write, from the two longest names in the data, and measures it at 320px, because the call sits directly above the log and a box that changes size moves everything under it mid-animation. **The last section draws the drive chart on a canvas and reads the bar back off the pixels**, converting where it stops into a kick and checking the game would have called that number: "the chart draws endYard" is only true for a FINISHED drive, the renderer interpolates one still running, and the call lands exactly on that boundary, which no assertion about the data can see. Run it with `--browser` for everything after the engine half. |
| `test_gate_modes.mjs` | The two things an account buys: Conference Draft is signed-in only, and a guest who finishes a draft is asked once, on the screen where the ask is worth something. Driven in all THREE auth states, because the interesting failures are the two that are not "signed out": a member must see no padlock and no pitch, and somebody whose sign-in script is blocked must be told the cause rather than told to sign in. That last case takes fifteen seconds on purpose, since `auth.js` polls for the library before calling it blocked and a slow connection is indistinguishable from a blocked CDN until the deadline. Also holds the layout: the sheet is four rows and two buttons, which is taller than a 320x568 phone, so the action row is sticky and the test measures that the way in is on screen WITHOUT scrolling and that neither button wraps. Wrapping is counted with a Range over the label, because comparing scrollHeight to line-height counts the button's own padding as a second line and reports every button as wrapped. |
| `test_ticker.mjs` | The poll ticker pinned along the bottom of the front page: that its RECTANGLE lands on screen rather than merely reporting `position:fixed`, that it clears whatever the mobile ad strip owns, that nothing on the page ends up behind it with the page scrolled to the bottom, and that it disappears the moment another screen takes over. |
| `test_ranks_tab.mjs` | The Where it ranks tab in all three of its lives: pinned off, no `cfb_runs` on the server, and a board that answers. The middle case is the pre-launch state and must reach the *same* placeholder as the first, because "not open yet" and "did not answer" are different facts. |
| `test_launch.mjs` | The things that are nobody's subsystem: every internal link and sitemap entry resolves, a cold visit's weight and time-to-playable, the head and structured data on both pages, alt text and button names, sideways scroll at eight widths, a whole season with fonts and ads and the board all refused, and the card on the site's front page. |
| `probe_perfect.mjs` | Not a test. Unbeaten seasons bucketed by TEAM OVERALL, which is the frame a player uses: "I built a 96 and went 15-0" is a sentence about a number on their own screen, and `probe_bracket.mjs` answers by drafting policy instead. Drafts wide, caps each band at the same number of rosters and plays them all equally deep, because playing everything drafted gives the middle of the range hundreds of rosters and the top a handful, which is backwards when the top is the band in question. Reports 12-0, playoff, bye, title and unbeaten separately. **Tune on the 12-0 column**, not the unbeaten one: unbeaten lands about thirty times in twelve thousand seasons a band, so two candidates there differ by twenty events against twenty-four, and two readings taken while tuning `WEEK_UPSET` looked like results and were noise. `--upset`, `--foelow`, `--foehigh`, `--wfloor`, `--wfull` and `--marquee` sweep the season's difficulty dials without editing the engine, over the identical rosters and seeds. |
| `find_seeds.mjs` | Not a test. Finds the run seeds `test_bracket.mjs` pins with `window.PS_CFB_SEED`, and prints the pick list it drives the browser with. That suite needs one run that finishes top four and sits out the first round and one that finishes 5-12 and plays all four, and a seed that drifts to the other shape stops covering what the file claims to cover. Which seed lands where is a property of the season, so anything that moves the season stales them: `WEEK_UPSET` took seed 106 off the bye path the day it went in. |
| `probe_bracket.mjs` | Not a test. The postseason a real run walks through: playoff, bye, title and perfect-season rates per drafting policy, and who a four seed actually meets by seed and by record. Measured the ladder before the bracket went in and the bracket after, so the change could be shown not to have moved the game's difficulty. |
| `tune_bracket.mjs` | Not a test. The same rates at 57,200 seasons a candidate, with the rosters drafted once and held, which is what `probe_bracket.mjs` cannot give you: a 0.24% title rate is sixteen titles there and noise. Sweeps the two bracket tier breaks and the two late round pivots, and can run the old ladder for comparison over the identical seasons. Tune with this one, look at the other. |
| `probe_report.mjs` | Not a test. Scores the report card over 2,100 drafts, the old page-side formulas alongside the engine's own, which is how the disagreement was found: the run-and-pass meter drew red on 15.5% of rosters for a split the engine charges nothing for. |
| `render_school_colors.mjs` | Draws all 83 schools' landed reel tiles onto one sheet, and reports any trim that cannot be told from its background. "Are the colours right" is a question you answer by looking. |
| `postgrest_stub.mjs` | Not a test. A PostgREST-shaped front end for the real database, so the browser talks to something that parses its URLs independently. |
| `gzip_server.mjs` | Not a test. A static server that gzips the way GitHub Pages gzips. `python3 -m http.server` does not, and the 5MB player file goes over the wire at 727K, so an uncompressed measurement measures a page nobody is served. |

```
psql -d cfbtest -f cfb/build/test/test_leaderboard.sql          # look for FAIL
node cfb/build/test/test_score_parity.mjs cfbtest
node cfb/build/test/test_scorelines.mjs                         # no database, no browser
node cfb/build/test/test_achievements.mjs                       # no database, no browser
node cfb/build/test/test_player_data.mjs                        # no database, no browser
node cfb/build/test/test_credits.mjs                            # no database, no browser
(nohup python3 -m http.server 8080 &)
(nohup node cfb/build/test/postgrest_stub.mjs 5555 cfbtest &)
node cfb/build/test/test_board_e2e.mjs
node cfb/build/test/test_gates.mjs
node cfb/build/test/test_conference.mjs
node cfb/build/test/test_challenge.mjs
node cfb/build/test/test_ranks_tab.mjs
node cfb/build/test/test_bowl_key.mjs cfbtest
(nohup node cfb/build/test/gzip_server.mjs &)                   # 8081, gzipped
node cfb/build/test/test_ticker.mjs
node cfb/build/test/test_report_card.mjs
node cfb/build/test/test_arcade_ad.mjs
node cfb/build/test/test_slot_chooser.mjs
node cfb/build/test/test_cabinet.mjs
node cfb/build/test/test_bracket.mjs
node cfb/build/test/test_tutorial.mjs
node cfb/build/test/test_credits.mjs --browser
node cfb/build/test/test_gate_modes.mjs
node cfb/build/test/test_launch.mjs
node cfb/build/test/render_school_colors.mjs   # then look at the sheet
```

## Twelve bugs these caught, so far

**Four badges in the trophy case could not be earned by anybody.** Three asked for a
Heisman winner and no player in the shipped file carried an award, because stage 5 of the
build joins `cfb_awards.csv` and had never been run against it. The fourth asked for +10%
chemistry against an engine that clamps chemistry at +8% on a curve that only approaches
it, so the true ceiling is +7.9% and only from a roster of six men out of one program.
None of the four threw, none looked wrong, and every test in this directory passed with
them dead on the shelf. `test_achievements.mjs` exists because of them, and the rule it
enforces is that a badge that cannot be earned is worse than no badge.

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

**Nine badges were impossible for anybody with an account.** Six New Year's Six badges, the
sweep of all six and both RunThe.GG Bowl badges key off `bowl_key`, and `cfb_runs` had no
such column: which bowl inside a tier is a draw made in the browser and it was never sent.
A signed-in trophy case is rebuilt from board rows, so those nine could not fire, while a
guest playing the same seasons earned them from local history. That asymmetry is why
nobody noticed. `64_cfb_bowl_key.sql` adds the column; `test_bowl_key.mjs` asserts the
badge is EARNED rather than merely listed, because a locked badge carries the same name
and the same description and differs only by a class.

**The database and the engine picked the bowl tier from different variables.** `engine.js`
needs six wins to go bowling and then reads the RANKING: top 18 a New Year's Six, top 40 a
major. 62 read the LOSS COUNT: three or fewer a New Year's Six, five or fewer a major. So a
9-3 team ranked 44th played a small bowl on screen and recorded as a New Year's Six, and a
6-6 team ranked 15th did the reverse. Survivable while the tier only chose a word; not
survivable once the row also carried which bowl, because then the tier and the slug came
from different rules and "win all six New Year's Six bowls" could be completed with six
small-bowl trophies. The fix is in 64, and the test now sweeps all 143 reachable
(wins, rank) pairs against `seedFromRanking()` instead of spot-checking four of them.

**A `position:fixed` bar pinned itself to the wrong thing.** The poll ticker was moved to the
bottom edge of the front page and landed 916px down an 844px phone, which is to say off it.
`.screen.on` animates in with `animation-fill-mode:both`, which keeps the last keyframe
applied after the run, and Chromium resolves that frame's `transform:none` to an identity
matrix rather than to no transform at all. An identity matrix is still a transform, and a
transform on an ancestor makes it the containing block for every fixed descendant. Nothing
about the CSS that placed the bar looked wrong, and `getComputedStyle` still said `fixed`.
Only the rectangle gave it away, which is why `test_ticker.mjs` measures one.

**Four suites shared one flake, and it was theirs, not the game's.** Signing a player who
can fill two slots opens a sheet asking which one, and the sheet covers the wheel and
swallows every click until it is answered. Every browser suite drafted by clicking the
first live tile in a loop that knew nothing about the sheet, so once one of those players
came up the loop retried the same blocked click until Playwright's 30s timeout and the
whole run died on a screen that was working correctly. It looked intermittent because
which players the wheel offers depends on the run, and re-running usually "fixed" it,
which is the worst way for a harness bug to present. All four loops now answer the sheet
before looking for the next tile. If a suite here fails on `intercepts pointer events`,
suspect the harness before the page.
