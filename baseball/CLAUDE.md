# Run The Diamond, the baseball game

This file holds the decisions for this game. The repo-wide rules are in the root CLAUDE.md.

## Run The Diamond, the baseball game

`baseball/`, at `/baseball/`. Same split as hoops: `engine.js`, `run.js`,
`achievements.js` and `board.js` load beside the page and carry cache versions,
so **read the cache-busting section above before editing any of them**.

```
node baseball/check-posture.mjs   the four facts, against two declarations
node baseball/check-atbats.mjs    the at-bat simulator, against real brackets
node baseball/check-bracket.mjs   the playoff field, against real runs
node baseball/check-labels.mjs    what a player-season row says it is
node baseball/check-theme.mjs     both themes, in a browser, on the real screens
node baseball/check-home.mjs      the front page's two designs, and the reel under them
node baseball/check-staff.mjs     the All-Time Staff assignment and its blast radius
node baseball/check-badges.mjs    every badge is reachable, against real runs
node baseball/check-run.mjs       a whole run, in a browser, to the screen it ends on
node baseball/build/icons.mjs     every icon, drawn from the one pixel ball
python3 baseball/build/logo.py    the logo, cut off its stock
```

### IT IS LIVE, and a launch is four edits rather than one

```
node baseball/check-posture.mjs   the four rows, against INDEXED and LINKED
```

Run The Diamond is indexable, in `sitemap.xml`, carrying the AdSense tag behind its
Consent Mode defaults, **and linked from the home page** (launched 2026-09-28, the
owner's call). It was launched once before with a home page link for a day and the
owner took the link back off, which is why the guard has two declarations.

**SO THE GUARD HAS TWO DECLARATIONS RATHER THAN ONE.** `INDEXED` holds the
first three rows (robots, sitemap, ad tag), which move together. `LINKED` holds
the fourth: the home page hub tile, the All games card, the JSON-LD `ItemList`
entry and any nav link. Both are true now. Each group is all or nothing, and
`LINKED` without `INDEXED` is refused outright, because it sends visitors to a page
that tells a crawler to stay away.

**THE HOME PAGE WAS REDESIGNED BETWEEN THE TWO LAUNCHES**, so the first launch's
markup (`e1b7ec63`) no longer fits and the guard's old reading of it went stale: it
asked for a `.gtile` and a per-device card, and the hub is now `<a class="tile
g-...">` tiles plus the `<article class="feat ...">` library the sport filter works
on. It asks for those now, and each was proved by taking it out. The launch touched
every place the home page lists its games: the hub tile, the rotating featured spot
(`G` in the inline script), the card and its filter chip (the counts are written by
hand), the prose paragraph, the FAQ in both its HTML and JSON-LD copies, the
WebSite description, the `ItemList`, the footer, and the On deck strip, which lost
its Baseball coming soon card. The hub holds six tiles beside the featured card on a
desktop, so the More on the way tile came out rather than dropping into a row of its
own. `scripts/newsletter/games.json` gained baseball the same day, which is that
file's own rule.

**The card's picture is the game's own ballpark**, rendered once to
`baseball/park-card.svg` by `node baseball/build/park-card.mjs`, so the home page
shows The Diamond without loading the game's scripts. Re-run it after changing how
The Diamond is drawn and bump the `?v=` on the two references in `index.html`.

**`check-numbers` reads the baseball pool now.** The season range fact knew the
football and college pools only, so "since 1901" on the home page failed against
1999 and 2005. The baseball pool is written with compact keys, so `seasonRange`
reads `s` as well.

**IT IS FOUR EDITS AND EVERY ONE OF THEM IS INVISIBLE ALONE.** A page dropped
from the sitemap is still indexable and still linked, so nothing breaks and it
quietly stops being crawled. A page that keeps its robots tag while sitting in
the sitemap is a contradiction a crawler reports back weeks later. A launched
game with no ad tag is a page in the reviewed surface that cannot serve one,
which is what two AdSense rejections were already traced to. So the four move
together or they do not move.

**THE HOLE THE POSTURE GUARD COVERS IS ONE `check-adsense` CANNOT.** That file
walks every INDEXABLE page and SKIPS anything noindexed, so putting the robots
tag back here does not fail it: it stops auditing this game at all, and the ad
tag, the consent ordering and the policy links go unasked with it. **A guard
that goes quiet when a thing is half reverted is worse than no guard**, so the
state is declared ONCE, as `INDEXED` and `LINKED` at the top of `check-posture.mjs`, and the
rows are asked against the declaration rather than against whatever the files
happen to say. Un-launching means editing that line, which is the whole point.

**THE HOME PAGE REACHES A VISITOR TWICE AND THE TWO DO NOT OVERLAP.**
`.gtiles` is `display:none` until 640px and `.games > .feat` is hidden from 640
down, so tiles are the phone home screen and cards are the desktop one. A link
added to only one of them is a game that exists on one kind of device, renders
perfectly, and is invisible to every other check on the site. Both are
asserted. **And the JSON-LD is a third answer**: the `ItemList` in the home
page's graph is what a search engine reads as the list of games here, so a game
launched in the markup and missing from that block is the stale-number trap in
its worst place. Asserted too, by parsing the block rather than matching text.

**AN ODD NUMBER OF TILES IN TWO COLUMNS LEAVES ONE ALONE**, and the gap beside
it reads as a tile that failed to load. `.gtile.newest` takes the whole row,
which costs nothing because the row was half empty. The class is on the NEWEST
tile and not on baseball, so the seventh game inherits it with no rule to
remember. It is deliberately not `.hero`, which is the arcade's marquee and a
claim about being the flagship.

**The card is `noshots`, which is the one place this launch is visibly thinner
than its siblings.** That modifier has sat unused in the stylesheet since it was
written for a game being redesigned, and this is the first card to want it: info
full width, no showcase rail. Golf has a CSS showcase, football and college have
a live drive canvas, soccer has phone clips. Baseball has none of those and a
bad showcase is worse than an honest empty column, so the right hand third is
open. The share card is NOT the thing to drop in there: `og.png` is a 1200x630
link preview whose headline is sized to be read in a feed, and at 250px its text
is illegible.

**`og-source.html` stays noindexed either way**, and that is asserted on its own
branch rather than folded into the pages. It is the template `build/og.mjs`
renders the share card from and is never served to anybody, so a launch is about
the game and this is a build input. Left indexable it becomes a page with a
headline, no navigation and no reason to exist, and `check-adsense` would then
correctly start demanding an ad tag on it.

**Eight mutations were reintroduced one at a time** and each names exactly one
thing: the robots tag back on, the ad tag off, both sitemap entries gone, the
tile gone, the card gone, the `ItemList` entry gone, the ad tag moved above its
consent defaults, and `og-source.html` made indexable. The `LIVE = false` arm
was driven too, against the launched tree, and reports all seven in the other
direction.

#### The home page describes three games now, so `check-numbers` knows three engines

The moment the game was linked, `index.html` started stating `$170M` and `all
162 games`, and that file knew two engines. It called four correct sentences
defects, which is the right failure: a page claiming a number no game plays is
exactly what it is for, and the fix is to teach it rather than to silence it.
`MLB` is the third `CONSTANTS` import, and the cap and the season are widened.

**THE COLLISION CHECK FIRED ON THE SAME RUN, which is the first time it has.**
That file's own header records the accepted weakening (a claim is allowed if it
matches EITHER game) and the standing warning that two games sharing a value
would hide a stale claim about one behind the other. Baseball's re-spin ladder
is `$5M, $10M, $15M`, which is the NFL game's ladder **exactly**, so adding it
put two games on one set of values. **It is left out**, because it buys nothing
to pay for: the baseball pages are not on `PAGES`, and no guarded page prices a
baseball re-spin. The cap and the season are in because the home page really
does state both and neither collides (170 against 11, 140 and 280; 162 against
12 and 17). The counts are re-recorded: 88 claims across 7 pages.

### The leaderboard is in the preflight now, and it is three rows rather than one

```
psql ... -f supabase/test/launch_preflight.sql     or paste it into the SQL editor
```

`97_baseball_leaderboard.sql` was named zero times in that file. The board fails
soft exactly as every board here does, so an undeployed migration is
**indistinguishable from a network that is down**: every call in
`baseball/board.js` resolves to null, the screen says the board is not
reachable, and it says that on every device for ever while twelve modes play
perfectly, the career records and every badge lights. There is no state in which
a player can tell the two apart. That was survivable while the game was
unlaunched and stops being survivable the day the home page links it.

**TWO ROWS, because they are two failures rather than one at two sizes**, which
is the fantasy chain's own argument arriving inside a single file. Row 23 is the
board not existing. Row 24 is `rtd_runs_daily_once`, the partial unique index
that is the whole of the rule that a browser files one result per puzzle:
without it the board draws, the scores are real, and the daily quietly stops
being a competition because one person can file the same day repeatedly and
every copy ranks. Folded together, the row would answer NO about the board on a
day the board is fine.

**AN INDEX CAN FAIL ON ITS OWN WHERE THE TABLE BESIDE IT CANNOT**, which is why
`idx` was added as a third catalog helper. A unique index is refused outright by
data that already breaks it, and `if not exists` does not save it: that skips on
a name that is taken, never on a duplicate row. Applied through
`--single-transaction` the whole file rolls back and the table is missing too,
which the existing block already catches; pasted into the SQL editor statement
by statement it is 114's trigger all over again, an object whose absence is
invisible from every side. Like `col` and `trg` and **unlike `has_table`**, it
asks the catalog for everything and lets the row filter, so it can never read
false for ever about something nobody added to a list.

`rtd_runs` went on the `has_table` allowlist in the same edit, because that
block is a trap rather than a convenience and the last row added after it was
written read NO against a database where the table was sitting right there.

**Driven against a real Postgres 16, both ways.** Bare database: 24 rows, no
error, both new rows NO and named in the summary. With `97` loaded: both yes.
Then each was proved to bite alone, which is the whole argument for two rows:
dropping the index alone leaves row 23 yes and takes row 24 to NO, and dropping
`rtd_claim_run` takes row 23 to NO on its own.

#### The daily was checked against the UTC date, and the page names it by the Eastern one

Found reading the migration before handing it over to be pasted, and nothing
here could have caught it. `rtd_submit_run` refused a daily whose key was not
`(now() at time zone 'utc')::date`, and `easternISO()` in the page is what
builds the key. The two disagree from **8pm Eastern to midnight in summer and
from 7pm in winter**, so every daily finished in that window, which is when most
people play, was refused as backdated. The board fails soft, so what a player
saw was an evening with nobody on the daily.

**The SQL test encoded the same wrong calendar**, which is why it passed:
`baseball_board_test.sql` built its "today" off UTC too, and a suite that shares
the defect it is testing cannot see it. It asks `rtd_board_day()` at three fixed
instants now (a September evening, a January evening, just past midnight),
because nothing lets a test move `now()`, and asserts the submit reads that
function rather than a calendar of its own. Against the old file it fails
exactly that claim and nothing else.

**Row 25 exists because an early copy of 97 reads as fully deployed.** Every
object rows 23 and 24 ask for is in that copy. What tells it apart is whether
the submit's BODY calls `rtd_board_day(`, so that is what the row asks. The fix
is re-running 97, which is idempotent and was driven over an old copy with no
error.

### October has suspense, and a game 7 is played in front of you

```
node baseball/check-october.mjs     plays seasons until one reaches a decider
```

Asked for as the playoffs going by too fast. **Nothing here decides anything**: the
bracket and every game were settled by the engine before October is shown.

- **The bracket is slower** (`BRK_STEP` 880, was 520) and each series flips in.
- **Your series lands a game at a time** on a strip above the bracket
  (`seriesReveal`): a game waits on screen, lands, and the series line moves. A
  game that can end the series waits longer. Classic and the daily take this path,
  and so does "Sim the series" in the modes that play October out.
- **A deciding game is never revealed there** (`isDecider`: both sides one win
  away). It is played on the game screen behind a Game N card (`g7Intro`), at 1x
  whatever the saved speed was, and the saved speed comes back after it.
- **Tension is read off the game state** (`leverage`): late (7th on) and close
  (two runs or fewer), and the tying run on base or at the plate. It slows the
  pace, tightens the field, and gives a big at bat a "here's the pitch" beat.
- **Skip ahead moves one step and never runs the rest of October.** It used to
  fall through to `simRestOfOctober` whenever no reveal was running, so a player
  tapping it through a series skipped a game 7 still to come. Only the "Sim the
  rest of October" link does that now.

### The leaderboard opens rows, has windows, and marks champions and records

```
node baseball/check-leaderboard.mjs
```

The front page's button opens on Classic, All time. **Every mode board has Today,
This week and All time** (`boardWin`), sent as `created_at=gte` on `B.top`. Days are
Eastern like the daily, and a week starts Monday. The daily board has no window,
because it is one day already, and its tab reads Daily so it is not a second Today.

**It loads a hundred at a time and sorts either way.** `B.top` takes `offset` and
`asc`, and the count over the list is `B.total` with the same window. Low to high
still prints each season's real place, counted down from the total, so the worst
season on a board of 230 reads 230th. The window and the order survive each other.

**A row opens into its twelve** (`boardTeamHtml`). The picks and slots already
ride on every row, so the team is rebuilt against this browser's own pool with no
request. A man not in the pool is a replacement body from a cut, and says so.

**A champion is gold** (`.champ`: a gold edge, a wash and a gold "Champions" word). **A record
season is louder** (`.record`, `is_goat`, 117 wins or more: a moving gold and red
edge and a red "Record" word). A record that also won it all wears both plus a
glow. Only a record moves, and never under reduced motion. The `.record` background
has three layers on purpose, so one keyframe animates both it and `.record.champ`.

### The profile, and everything on it is the server's

```
node baseball/check-profile.mjs     the header circle, the pages, Customize, the career on the server
psql -d rtd_prof -f supabase/test/baseball_pro_base.sql
psql -d rtd_prof -f supabase/127_baseball_profiles.sql
psql -d rtd_prof -f supabase/test/baseball_profile_test.sql
```

Asked for as the NFL game's profile, with every customization it has, and with one rule
from the owner in as many words: run it through the server, so players don't lose
anything. Before this, a baseball career was `rtd_history` in localStorage and nothing
else, and every badge, every career number and every park unlock is DERIVED from that
array. So clearing site data, a private window or a second phone was an empty trophy
case, with nothing said.

**`supabase/127_baseball_profiles.sql` is two tables.** `rtd_profiles` is what the player
CHOSE (club, initials, mark, ballpark) plus what the cabinet EARNED that other people's
screens need to draw (rank, ring, and the chosen club's rung), and it is public to read
because every board row draws the circle. `rtd_career` is what the player PLAYED, the
page's own compact rows, private to its owner.

**THE CAREER ONLY EVER ADDS.** `rtd_career_merge` takes the seasons a device holds and
hands back every season the account has, from every device. A season is keyed by `ts`,
a season the server already holds is never replaced by a later copy, every row is
stamped with the caller as `u` whatever it claimed, and the newest thousand are kept.
That is hoops' cloud save argument (two devices hold two SETS of seasons, not one run
at two points) held in SQL rather than in the page.

**THE BROWSER KEEPS A COPY AND IT IS ONLY EVER A COPY.** It paints the first frame
before the server answers, and it is how a season played in a tunnel reaches the
server later: on every sign-in the device sends every season it holds for the account.
`adoptCareer` then replaces the account's rows with the server's union and leaves the
guest's seasons and other accounts' seasons on the browser exactly where they were.
**A null from the server is "could not ask", never "you have nothing"**, so a dropped
connection can never paint an empty career or send one back. `check-profile.mjs`
section 4 holds that, and removing the null check fails it.

**`HIST_MAX` is 1400**: the server's thousand plus room for guest seasons, which never
leave the browser because guests do not earn badges.

**The ballpark moved onto the account too.** `currentPark` reads the server's choice
first, and a park chosen on a device before this is carried over ONCE, never over a
choice the account has since made. The picker left the trophy case for Customize, which
is where the owner wanted it, and the field's park tag opens Customize.

#### The crest is football's renderer, copied

`baseball/crest.js` is `football/crest.js` with every sport-shaped table replaced: the
thirty clubs playing today off `RTD_ENGINE.TEAM_COLORS` (the Athletics are `ATH` in the
franchise table and their colors are still filed as `OAK`), one field pattern per club
drawn from football's own primitives (pinstripes for the Yankees, ivy for the Cubs, a
halo for the Angels), twelve baseball marks each opened by a baseball badge, and rings
for a title, back to back titles and a season of 117 wins.

**IT IS A COPY ON PURPOSE**, because football's file reads `PS_ENGINE` and `PS_ACH` at
load and is live on the NFL game, and teaching it a second sport makes every baseball
change a change to a shipped football file. **The cost is that a renderer fix has to be
made twice.** The header of each copy says so.

**The marks were redrawn to look struck rather than stuck on.** Every mark has depth now:
a soft offset copy under it and ink lit from above (a gradient from the ink toward the
field), both detail, so a board row at 30px keeps the flat mark it can read. The shapes
carry the details that make them objects: V stitches on the ball, a paneled cap with its
brim's underside, a whole field from above, a mitt with a laced web (a glove drawn as an
open hand reads as a hand), bats with grip tape and a ball, a faceted star, a ring with a
cut stone. The ids did not change, because `rtd_profiles` stores them.

**The club ladder is One Franchise's**: play a club (its colors), reach October with it
(the ring in its second color), win the World Series with it (its pattern). A club never
played is drawn locked and a tap on it saves nothing; so is a mark whose badge is not
earned. **The rank and the ring are derived and pushed, never chosen**, and they are
pushed only when they move.

**`TIER_AT` is football's ladder scaled to a cabinet of about two hundred**, because no
baseball player has worn a rank yet. Refit it against real profiles once there are some.

**What the server cannot check, said plainly.** plpgsql cannot run `achievements.js`, so
a mark or a rank is checked for SHAPE (one of the known ids) and not for the badge behind
it. It is the same trust `ps_set_crest` makes, and a circle decides nothing.

#### Three things to know before touching it

- **The header's icon rule strokes every svg it holds.** A crest is filled, so
  `.pf-btn.crested svg` and the other crest holders take `fill` and `stroke` back, or
  every shape in the circle grows an outline.
- **`.hdr-btn` is declared later in the sheet than the profile rules**, so a profile rule
  at one class loses to it. That is how "Sign in" as text shipped for one pass overflowing
  a 34px circle; it is a person icon now, labelled Sign in, because the header holds five
  things at 320px.
- **The board rows now select `user_id`**, which 97 has always had and nothing read, and
  the circles are asked for after the list is drawn, so a slow answer never holds the
  board up.

### Badges are for accounts, and a badge is a baseball

```
node baseball/check-run.mjs      the Classic walk signed in, the daily walk as a guest
```

Asked for: guests do not get to earn or collect badges. **This game had no
sign-in at all**, so the first half was porting one: `baseball/auth.js` is
`hoops/auth.js` pointed at `rtd_*`, on the site's one account system. Nothing
server side was needed, because `97_baseball_leaderboard.sql` already reads
`auth.uid()` in its submit, claim and rename. `board.js` had always read a
`window.RTD_ACCESS_TOKEN` that nothing set; the page sets it on every auth
change now, so a season submitted signed in is filed under the account.

**A row carries `u`, the account it was PLAYED on, and the cabinet reads only
rows whose `u` is the account signed in now.** Every row is still filed, so
a guest's seasons and titles are still counted on the career line. Three rules
follow, and each is the design rather than a side effect:

- **A season played as a guest never counts**, even after signing in. Signing
  in afterwards is not how a guest collects what they played for.
- **Two accounts on one browser keep two cabinets**, because the filter is the
  id and not "somebody is signed in".
- **Rows filed before this shipped carry no `u`**, so no browser's old history
  turns into badges on the day it first signs in. That was a conscious call:
  every cabinet anybody had before this is empty until they play signed in.

**The results screen says what signing in is for** instead of listing badges
nobody may keep (`lastNewBadges === null` is a guest season), and its button
opens the trophy sheet, which carries the account panel at the TOP: five
states, the same five hoops draws.

**Where this is weakest, said plainly**: the cabinet is still derived from
`localStorage` rows, so it is a gate a determined person could edit. It is the
same trust the whole badge design already makes (no server keeps badges), and
it is enough for what was asked, which is that playing as a guest does not
earn them.

**A badge is drawn as a baseball.** A cream ball with two red seams,
chevron stitches, the shelf's glyph in the middle, and the TIER as the rim
(bronze, silver, gold, purple), the way a trophy ball sits in a display ring.
The ball does not flip in the dark theme, for the same reason the draft
button's hide does not. `BALL_SEAMS` is computed once and shared by every
badge.

### October got harder, and chemistry is capped at +12

Reported by players: the World Series was too easy to win and chemistry was too
strong. Three numbers in `engine.js`, measured over 200 drafts a bot at the $190M cap:

| | was | now |
|---|---|---|
| `TITLE.PIVOT` | 84 | **90** |
| `PLAYOFF_ROUND_STEP` | 0.12 | **0.15** |
| `CHEMISTRY.MAX` | 0.15 | **0.12** |

| bot | wins | Octobers | titles, was | titles, now |
|---|---|---|---|---|
| best available | 89.8 to 87.8 | 58% to 51% | 7.0% | **2.5%** |
| careful | 94.6 to 92.4 | 77% to 70% | 10.0% | **7.5%** |
| chases chemistry | 97.0 to 93.3 | 81% to 76% | 14.5% | **6.5%** |

**The pivot is where the title stops being stiffened**, on the `rating` yardstick
(squadRating), so moving it from 84 to 90 means most rosters now meet a tougher
opponent in the Championship Series and the World Series. The round step makes every
round after the first a little harder for everybody. Titles pooled across the three
bots went 10.5% to 5.5%, and the chemistry chaser went from the best title bot to
level with careful drafting, which is the other half of what was asked.

**Chemistry is a curve toward the cap that never reaches it**, so the cap cut made
the old +12 and +14 badge rungs impossible. The five chemistry rungs keep their share
of the cap (+3, +6, +8, +10, +11) and keep their ids, because a badge is derived from
stored rows. Lowering a threshold strips nobody. The coach's "Great clubhouse
chemistry" line moved from 9 to 7 for the same reason. Player copy that names the cap
reads `E.chemPoints(E.CHEMISTRY.MAX)`, so it moved on its own.

**116 wins is still reachable**: 2 of 500 chemistry drafts, best 121 (13 of 500
before). The quick badge sweep excuses the record rungs and the title-plus-something
rungs on the half of each it lights; the full sweep lights all of them.

**Board rows filed before this sit high**, the same as any balance change on a live
board.

### The cap is $190M now, because $170M made October a coin flip for most drafts

Reported by players: the cap felt too low and it was hard to make the playoffs.
It was measured before anything moved, 200 drafts a bot, after the primary
position and teammate chemistry pass:

| cap | best available | careful | chases chemistry |
|---|---|---|---|
| $170M | 81.4 wins, **29%** Octobers, 1% titles | 90.1, 59%, 2.5% | 89.2, 60%, 5% |
| $180M | 84.8, 46%, 3% | 92.2, 69%, 9.5% | 92.9, 72%, 9% |
| **$190M** | **89.1, 56%, 7.5%** | **93.7, 73%, 11.5%** | **96.2, 80%, 14%** |
| $200M | 92.7, 65%, 13% | 97.2, 83%, 17% | 98.5, 88%, 24% |

**Taking the best man every time is how a new player drafts**, and at $170M
it missed October seven runs in ten. At $190M it makes it more often than not,
and careful play still beats it by about five wins and seventeen points of
Octobers, so the budget is still the decision. A random draft is 56 wins at
every cap, because the board it is offered does not depend on the cap.

**What moved with it:**

- **`bargain_title` went $160M to $180M**, the same $10M under the cap.
  Loosening strips nobody.
- **All-Time Staff's top anchor went 2.91 to 2.77 ERA.** The best staff any
  strategy reached went 2.916 to 2.775, and nine staffs pinned at 100 until it
  moved. The floor is the worst man on every board and no cap touches it.
- **The team rating was deliberately NOT re-anchored.** It is projected wins on
  a line from 31 to 106, so it still says how many wins a roster is worth. About
  3% of chemistry-chasing drafts now reach the 99 ceiling, against none before.
  Re-anchoring would lower every rating a player sees on the day the cap went
  up, and move what the rating badges mean.
- **The quick badge sweep's excuses moved**: seven title and legend rungs light
  now and three Survivor and draft rungs went the other way. The full sweep
  lights all of them.
- **The share card was re-rendered** (`og.png?v=5`), and every `$170M` a reader
  sees says `$190M`. `baseball/check-numbers.mjs` holds them to `CAP_MUSD`.

**Board rows filed before this sit low** against rows filed after. That is the
price of changing the cap on a live board, the same as the football game's
Full Team retune.

The section below is the $170M argument, kept because its method is how the
next move should be measured, and its crossover (holding money back stops
paying somewhere between $230M and $300M) still says where the cap must not go.

### The $170M cap WAS right on its own terms, and the per-slot dollar is the wrong comparison

Asked, because football gives $140M for 6 and $280M for 12 and hoops gives $126M for
6, which is about $23M and $21M a slot against this game's **$14.2M**. That reads as
a third tighter and it is not the difference. Measured over the two boards:

| | a slot's share | that share buys | the dearest man |
|---|---|---|---|
| Run The Diamond | $14.2M | **86.4%** of the board | $103.7M, **7.3 slots**, 61% of the cap |
| The Perfect Season | $23.3M | 85.1% | $48.0M, 2.1 slots, 34% |
| Full Team | $23.3M | 85.1% | $48.0M, 2.1 slots, 17% |

**An ordinary pick costs the same relative amount in both games.** What is different
is the top: a football star costs two of your spots and a baseball star costs seven
of your twelve. That is the PRICE CURVE rather than the cap, and it is why a roster
here cannot hold two genuine all-timers.

**The cap binds, and stopping it binding is what raising it would do.** The fantasy
probe's crossover test, 70 drafts a cell, best-available against a bot that holds a
pro-rata share back for every open slot:

| cap | best-available | holds money back | the gap | best-available spends | titles, careful |
|---|---|---|---|---|---|
| $140M | 48.3 | 64.8 | +16.5 | 100% | 3% |
| **$170M** | **63.6** | **74.8** | **+11.2** | **100%** | **7%** |
| $200M | 75.9 | 83.4 | +7.5 | 99% | 23% |
| $230M | 86.9 | 87.0 | **+0.1** | 98% | 33% |
| $300M | 93.0 | 91.9 | **-1.1** | 86% | 37% |
| $400M | 92.9 | 94.5 | +1.6 | 65% | 49% |

**They cross between $230M and $300M.** Above it, holding money back stops paying and
the draft is "take the best man every time", which is no decision at all. `engine.js`
already records $245M being tried and barely biting. At $170M the gap is eleven rating
points, and **best-available won no title in 70 runs** where careful drafting won 7%.
That gap IS the mode.

**What it costs is 5.2 of 12 spins where the top man on the board is priced out** for
a best-available drafter, against 6.8 at $140M and 3.7 at $200M. That is the axis to
watch if this is ever revisited, not the per-slot dollar.

**Value per dollar is not a third strategy** and the probe keeps its row to say so.
The price curve is convex, so points per dollar always takes the cheapest man on the
board: it spends 14% of the cap and finishes at a rating of 5.5.

### The WAR is Baseball-Reference's, and the runbook said otherwise for months

`baseball/data/players.json` carries **bWAR and nothing else**, 44,344
player-seasons from 1901 to 2025, off the bulk `war_daily_bat.txt` and
`war_daily_pitch.txt` files. Positions and closer flags are Lahman, joined on
`bbrefID`.

**`DATA_RUNBOOK.md` described a 50/50 FanGraphs blend that never ran.**
`build_positions.py` wraps the FanGraphs fetch in a try/except that prints
`Skipping fWAR blend` and falls through to bWAR-only on a 403, which is what
happened. Nothing failed, because a bWAR-only pool is a perfectly good pool: the
only symptom was a document describing a number the game does not have, which is
the dangerous direction, since the next person explains a mismatch with it.
Checked on the seasons where the sources diverge, every shipped row is bWAR
(Bonds 2001 ships 11.86 against bWAR 11.9, fWAR 12.5 and a blend of 12.2).

**Those reference figures were RECALLED, not fetched**, and that is the one soft
spot in this section. Both baseball-reference.com and fangraphs.com are refused
by the sandbox's egress proxy, the same split `hoops/` documents, so nothing here
can verify a single number against its source. What IS solid is the structural
half: the blend is skipped in an exception handler, and fifteen spot-checked
seasons all land on bWAR rather than on a blend.

**TED WILLIAMS 1941 IS SETTLED AT 10.36, AND THE REMEMBERED 10.6 WAS THE BAD
HALF.** It sat here as an open question worth re-checking on a machine with a
network, on the reading that a gap like that is a stale pull. The workflow
fetched `war_daily_bat.txt` fresh, 35MB and 126,547 rows, and all ten of
`reference_seasons.py`'s figures came back identical to the pool that ships. The
pull was never stale. **The way to settle a recalled number is to fetch it, and
the only machine here that can is the runner**, which is why that step prints
both pools side by side rather than one column.

**Leave it on bWAR.** A blend matches NEITHER published source, so it turns a
number a player can check into one nobody can, and "where did you get this"
stops having an answer. The draft screen names the source for the same reason,
and names FanGraphs too, because a reader who finds a different number needs to
know there are two real answers rather than one wrong one.

Reported by a player who looked five up and got five different numbers. Four
things make that happen, and three of them are now labelled:

- **fWAR against bWAR**, which is most of it, and is a source choice rather
  than a defect.
- **A two-way season is two rows**, one per side of the ball, because a draft
  has to put a man in one slot. So each row's WAR is HALF the season: Ohtani
  2023 is 6.11 batting and 3.80 pitching. 42 seasons in the pool, and two of
  them are Ruth and Ohtani, so the row count is misleading about how often it is
  seen. `indexData` marks the halves (derived from the pool, never stored, or it
  is a second copy that drifts) and every surface says which half it is.
- **TOT is not a club.** It is Baseball-Reference's combined row for a man who
  played for more than one club that year. `clubTag` renders it as words.
  **This is belt and braces today and the guard says so**: three separate
  filters keep TOT off every board (`indexData`, `slotPool`, and the board's own
  draw), so no multi-club row is reachable, which `check-labels.mjs` asserts as
  a fact rather than a requirement. The day one of those filters changes is not
  the day to find out the chip is sized for three letters.
- **The pitcher price is innings-normalized and the WAR shown is not.** See
  below.

**`w` is the raw figure and `p` is not.** For a starter,
`price = 1.5 * (w * min(1, 210/ip))^1.6`, so 3,959 rows (32% of starters) carry
a price computed off a discounted WAR, down to a factor of 0.45 for Ed Walsh's
464-inning 1908. That reproduces on 44,267 of 44,344 rows from `w` and `ip`
alone, the 77 misses being a single 0.1 rounding step, so **the page can recompute
the discount without a data rebuild**. Do not close the gap by pricing off the
raw WAR: Walsh goes from $17.6M to about $62M and every number in the balance
table below needs re-measuring.

#### The refresh could not write the pool it committed

```
python3 baseball/pipeline/compact_pool.py          the fourth stage
python3 baseball/pipeline/reference_seasons.py     ten seasons, against a second pool
```

`.github/workflows/baseball-data.yml` exists because both WAR sources are refused
by the development sandbox, so the runner is the only machine in this project that
can rebuild the pool. It ran three stages and then did
`git add baseball/data/players.json`, **on a file it had never written**.

`build_positions.py` ends at `priced_players_enriched.json`, which carries verbose
column names (`bbref_id`, `primary_pos`, `war_raw`) because it is the frame the
build was working in. The game fetches `players.json`, which carries compact keys
(`i`, `pp`, `w`) because every visitor downloads it. **Nothing in the repo turned
one into the other**, so the pool that ships was produced by a step nobody
committed and the workflow could not reproduce it.

**IT IS NOT A CRASH AND NOT A RED RUN.** Every firing would have fetched, built,
found the file unchanged, printed "The pool did not move" and exited green. A
workflow that looks like it refreshes the pool every time and has never once
written a byte of it, which is the worst shape a data job can have and is why
this was found by trying to answer a question with it rather than by a check.

**The compaction rule is read off the shipped file rather than guessed**, and it
is PROVED BY ROUND TRIP: invert it on the pool that ships, run `compact_pool.py`
over the result, and the bytes come back identical on all 44,344 rows. Two things
that read like tidying cost exactly that, and both were caught by the comparison
rather than by reasoning:

- **Coercing a whole number to an int.** The pool came out of pandas, so every one
  of these columns is a float and the file says `7.0` and `217.0`. It diverges at
  Rogers Hornsby, the fifth row.
- **Dropping the ascii escaping.** The file writes `Martínez` rather than the
  byte, so `ensure_ascii=False` changes every accented name in the pool.

What the round trip CANNOT prove is how ties are broken against a fresh build,
because the compact file does not carry the order the enriched frame was in. That
is left to pandas' stable sort, exactly as before, and said rather than implied.

**`pp`, `ep`, `cl` and `ip` are DROPPED rather than written null**, which is not a
micro-optimisation: 145 rows have no position at all (Negro Leagues seasons Lahman
cannot place), every batter has no innings, and 940 pitchers have none either. The
page already reads all four as optional. **The order is price descending and is
load-bearing**: the board walks the pool and the reserve floor reads off the cheap
end, so a pool in input order is a different game.

**The refresh bumps the `?v=` now**, which is the rule this repo already keeps a
checker for arriving at the one writer that cannot do it by hand. The page fetches
`data/players.json?v=N` with the number written by hand; a bot rewriting 4.7MB and
leaving it alone serves a RETURNING visitor the old pool, and the only symptom is
somebody insisting a season is not in the game. It bumps only what `git diff
--quiet` says actually moved, which is what the hoops refresh already does.

**`reference_seasons.py` is a READING and not a guard, and says so.** Every figure
in the section above was recalled rather than fetched, because nothing here can
reach the source, and one of them disagrees with the pool: Ted Williams 1941 ships
at **10.36** against a remembered 10.6. So the refresh prints ten seasons a reader
can look up, **against the pool from before the build**, because a single column of
numbers asks somebody to remember what they were yesterday. Ruth 1923 anchors the
top of the price curve, Walter Johnson 1913 is the dearest arm and so carries the
innings discount, and Bonds 2001 is the row the bWAR against fWAR argument was
settled on.

#### And then it wrote one, and the pool it wrote could not be drafted

```
python3 baseball/pipeline/check_lahman.py    the reader, and the build under it
python3 baseball/pipeline/lahman.py data     the archive, from a machine with a network
python3 baseball/pipeline/pool_shape.py new.json old.json
```

The first refresh that could actually write a pool wrote **109,859 rows against
44,344, a position on 0 of its 60,208 batters, and 22,019 closers against 905**.
Every price in it was right, every name was right, and the ten reference seasons
agreed to the decimal, because the bulk WAR files fetched cleanly. What failed
was Lahman, which is the positions and the closer flags.

**TWO UPSTREAM CHANGES, AND BOTH ARRIVED AS A WARNING THE BUILD PRINTED AND
CARRIED ON PAST.** `pybaseball.lahman` downloads the `master.zip` of
`chadwickbureau/baseballdatabank`, and pybaseball 2.2.7 has no `lahman.teams` at
all: it is `teams_core` now, so `getattr` raised. `lahman.py` reads the archive
itself.

**THE REPOSITORY HAS BEEN TAKEN DOWN, AND THE FIRST READING OF THAT WAS WRONG.**
A missing repository and a missing branch answer identically, with GitHub's own
404 page, so `ZipFile` said `File is not a zip file` about both. Read as a branch
rename, the fix was a list of REFS on that one repository, `main` first: the
runner answered 404 on every one of them, which is what a repository that is not
there says. The Lahman database is SABR's now, published through a Box folder
with no url a script can fetch.

**SO IT IS A LIST OF PLACES AND NOT A LIST OF REFS**, which is the same fault at
a smaller size: refs of one repository are no help when the repository is what
went. `SOURCES` is whole urls, tried in order, upstream first so it wins the day
it comes back, then two community mirrors of the last Chadwick snapshot. That is
the hoops draft fetch's own lesson, which demanded one way of writing a link and
returned zero picks for sixty six years. **Members are found by BASENAME anywhere
in the tree**, because the top directory is named after whichever archive
answered and the tables moved into `core/` at some point, and `People.csv`
answers to `Master.csv` too.

**THE MIRRORS ARE UNOFFICIAL, AND "A MIRROR A YEAR BEHIND COSTS ALMOST NOTHING"
WAS WRITTEN HERE AND IS FALSE.** The argument was that positions and saves barely
move for a season already played, which is true of a season the mirror HAS. A
mirror does not lag by a rounding error: the ones that answer today stop at
**2021**, so a rebuild off them leaves **2,421 batters with no position**. The
pool is then perfectly correct about Babe Ruth and knows nothing about anybody
currently playing, which is the half of the board a reader recognises. Measured
rather than argued, and what now catches it is the staleness clause two sections
down.

**And the first reading of that measurement was wrong too**, in the way this file
keeps warning about: 2,421 divided by the seasons since 2021 gave a plausible
start year, so the deficit was reported as "positions stop at 2017" from
arithmetic rather than from the rows. There are **two** deficits and only one is
the lag. The other is the Negro Leagues, which Lahman added to `People` long
after these snapshots were taken, so those seasons are missing at the OLD end as
well. One cause assumed from one number is how a measurement becomes a guess.

##### WHERE A CURRENT ARCHIVE ACTUALLY COMES FROM: CRAN

```
python3 -c "import lahman; print(len(lahman.table('Appearances.csv')))"
```

SABR maintains Lahman now and publishes it through a Box folder with no link a
script may fetch. Driven from a runner, that folder's own
`rm=box_download_shared_folder` endpoint answers **HTTP 512** on both
`sabr.app.box.com` and `app.box.com`, so both urls came back out of `SOURCES`
rather than sitting there as a branch that can only fail. The R package's own
download script says "Current download URL unknown", so this is not a url anybody
has and did not write down.

**The package that REDISTRIBUTES it is the hand download, published.** CRAN's
GitHub mirror serves every table on its own path as `.RData`, and
`raw.githubusercontent.com` is the one host this sandbox can reach, so it is the
only part of this chain that can be checked from here at all. Version 14.0-0, and
all four tables run **1871 to 2025**.

| | mirror | CRAN |
|---|---|---|
| Appearances | 110,423 rows, to 2021 | **128,512 rows, to 2025** |
| People | 20,662 bbrefIDs | **22,983** |
| shipped batters the archive has never heard of | 1,312 | **75** |
| Pitching | | 57,630 rows, 1,053 seasons of 20+ saves |

Heavy Johnson and Charlie Blackwell (the Negro Leagues end) and Pete
Crow-Armstrong and Wyatt Langford (the recent end) are all present, which is the
two deficits closing from both sides at once.

**IT IS `.RData` AND NOT CSV, so it has its own path rather than joining the zip
chain**, and `from_cran` **answers `None` rather than raising**: no `pyreadr`, no
route, a renamed file are all "this route is shut", and the caller's job is then
to try the zips. A raise there would take down a build with a working fallback
under it. The workflow installs `pyreadr` for that reason, and says so at the
install step, because without it a runner silently falls through to the 2021
mirrors and the staleness clause stops the result anyway, two stages later.

**Its guard refuses to pass vacuously**, which is the half worth copying. With
`pyreadr` missing, `from_cran` returns at its first statement and every stub under
it is never reached, so a green line there would certify a path the check did not
walk. `check_lahman.py`'s last section prints that it did NOT walk it instead.
Both live arms were proved by mutation: letting the fetch error out of `from_cran`
fails two claims, and a `table()` that does not fall through fails one.

##### THE PIPELINE REBUILDS THE POOL NOW, and what moved was 940 pitchers

Driven on a runner with `commit: false`, against the pool that ships:

| | was | now |
|---|---|---|
| rows, batters, pitchers, closers | 44,344 · 24,644 · 19,700 · 905 | **identical** |
| newest season, position, closer | 2025 · 2025 · 2025 | **identical** |
| the ten reference seasons | | **unchanged to the decimal** |
| batter positions | 24,499 | 24,503 |
| **pitchers with innings** | **18,760** | **19,700** |

**The shipped pool was already good, and that is the nuance most easily lost
here.** Positions moved by four, because a laptop run years ago had a Lahman
current enough to cover 99.4% of batters. What was broken was never the pool, it
was the pipeline's ability to REPRODUCE it, and a refresh that cannot reproduce
what ships cannot ship anything either.

**The 940 are Negro Leagues pitchers, 1920 to 1948**: Slim Jones, Bill Foster,
Bullet Rogan, Ray Brown, Dave Brown. The innings column comes from Lahman
`Pitching`, the Chadwick snapshot predates those seasons, so they had no innings
at all. So the second deficit closes on the pitching side too, which the
measurement above had only asked of `People` and `Appearances`.

**IT MOVES NO PRICE, and that was checked rather than assumed.** A starter's
price carries `min(1, 210/ip)`, so gaining an innings figure can only make a man
CHEAPER, and a Negro Leagues season is nowhere near 210 innings. The run reports
**3,959 of 12,461 starters priced below their own WAR**, which is the shipped
count exactly. What the 940 buy is that the innings tag and anything built on it
are now right about them.

**A 404 page is a perfectly good HTTP response**, which is the whole reason the
old failure read as "not a zip file": the request succeeded and the bytes were
HTML. The magic number is checked before the archive is opened, and the refusal
carries what the server actually sent.

##### A pool with no positions is not a worse pool, it is an unplayable one

Every slot in this draft is a position, so a pool with none cannot fill a roster
at all, and the innings guess that stands in for the saves column calls 22,019
player-seasons a closer where the saves say 905. `closerSavePct` reads the CL
slot by name, so that is a quarter of every bullpen handed a genuine closer's
save rate. **Both of those are now fatal by default**, and the escape hatches
(`--allow-no-positions`, `--allow-innings-closers`) are there for somebody
rebuilding the price curve offline rather than for a run that ships.

**AN EXCEPTION IS NOT THE ONLY WAY THE COLUMN ENDS UP EMPTY.** `HAS_POSITIONS =
applied > 0` was the whole test, so zero was the one value it caught and 4% would
have passed: a People table whose `bbrefID` arrives blank gives a clean run that
applies a position to nobody. `POS_FLOOR` is **0.50** and is a CATASTROPHE floor
rather than a quality one, because the shipped pool's 99.4% is measured after the
playing-time floor and this frame is the whole of Baseball-Reference. What holds
the real coverage is `pool_shape.py`, against the pool that ships.

**And the fetch and the builds disagreed about which tables to get.** The fetch
got Appearances, People and Teams; `build_positions.py` loads Appearances, People
and **Pitching**, so the closer flags fell through to a download of their own on
every run, including the runs where the other three worked. `LAHMAN_TABLES` is
one list and `check_lahman.py`'s sixth section holds the two ends of it together.

##### What the guard drives, and the four arms that were lying

`check_lahman.py` needs no network: every archive is built in memory, and the
last section runs the real `build_positions.py` in a copy of its own directory
against a `lahman` module that refuses. **Asserting the source carries a
`sys.exit` would only ask whether the file says what it says.**

- **Three mutations bit and one crashed.** Removing the magic number check sent
  the HTML straight to `ZipFile`, which raised `BadZipFile` from inside the loop
  and took the whole checker down as a traceback: a guard with teeth and no
  voice. Every arm catches the general case now and reports the type it got.
- **Two arms passed because this machine is offline.** They were written against
  the real reader, so the Pitching fetch reached for GitHub and failed, and on a
  runner it would have worked and the arm would have reported the build failing
  to stop. Every arm refuses explicitly now. That is this repo's own rule about a
  timing property checked by hoping to lose the race.
- **One table missing at a time, or the arm proves nothing about its step.**
  Written with no tables at all, reintroducing the Appearances swallow still
  stopped the build, at the PITCHING step one screen down, so the arm passed on
  the exact defect it exists for.
- **The trailing-slash skip cannot be proved by mutation and the section does not
  pretend to.** `posixpath.basename` of a path ending in a slash is the empty
  string, so a directory can never match a table name and the skip is belt and
  braces. What is asserted instead is the requirement underneath it, which
  survives any rewrite of the matching: whatever comes back has to open.
- **And it cannot say the fallback is ours rather than pybaseball's**, because
  pybaseball is not installed here either, so both raise and the guards below
  them fire identically. Section 6 holds the table list; nothing here proves
  which module a machine WITH pybaseball reaches for.

##### The missing stage was a WAR floor, not the playing-time floor it was called

The build frame is 109,859 rows and the pool that ships is 44,344, and what
separates them was in none of the four stages. It was written up here as a
playing-time floor, which is what `hoops/` has and is not what this is.

**Read off the shipped file the way the field rules were**: its lowest `war_raw`
is **exactly 0.50**, 259 rows sit on it, and not one is below. That is a cliff
rather than a distribution, so it is a filter; it is the same on both roles, and
it is on `war_raw` rather than on innings or games, so a pitcher discounted by
the innings anchor still keeps his own floor.

**What it is FOR is the wheel.** Half the men under it are a September call-up or
somebody who got hurt in April, and a board drawn from them is names nobody
recognises at a price nobody will pay. It is also 65,515 rows every visitor would
download to never be offered one of.

**It goes in `compact_pool.py`**, whose job is turning the build frame into the
file the game downloads, so the enriched frame stays whole for anybody measuring
the price curve. **Proved twice**: the round trip is still byte identical on all
44,344 rows, and three rows added under the floor are dropped to reproduce the
shipped pool exactly. The first of those alone proves nothing, because the
shipped pool is already filtered and the floor is vacuous over it.

##### Two more per-club reads, and a flag that could not say no

The rebuild then came back **44,344 rows, 24,644 batters, 19,700 pitchers**,
which is the shipped pool exactly, so the floor above was right. Two columns
still disagreed and `pool_shape.py` stopped it, which is what it is for.

**Closers, 6,041 against 905.** The saves loop set the flag True on a save total
and left it alone otherwise, under a comment saying a reliever with no saves
"could still close". So the innings proxy survived UNDERNEATH the real answer and
the flag meant "pure reliever OR real closer". `closerSavePct` reads the CL slot
by name, so that is most of every bullpen in the game handed a genuine closer's
save rate. **Eligibility is deliberately untouched**: every reliever in the
shipped pool carries `RP;CL`, all 7,239 of them, and only 905 carry the flag.
Being able to close is a roster shape, having closed is a fact about the season,
and narrowing the eligibility would empty the CL slot for most of the board.

**Positions, 22,077 against 24,499**, and this is the pricing build's own per-club
read arriving in the file that actually builds the shipped pool. Appearances is
one row per club and the loop is keyed per season, so a traded player wrote his
key twice and the last stint won. The pricing one THREW, because its answer was
joined and the duplicate multiplied rows; this one just drops a column.

**THAT FIX BOUGHT EXACTLY ONE ROW, and the measurement is what said so.** Eight
games at one club and seven at another is fifteen, which qualifies on the season
and on neither stint, and that is real and almost never happens: 22,077 to 22,078.
The honest reading is that the fix is correct and was not the cause, which is
only knowable by rebuilding and counting.

**What the 2,421 actually were is the mirror.** Reconstructed by blanking
positions from 2017 and the flag from 2022 on the shipped pool, the result lands
within 22 rows of what the runner built, which is what pins the diagnosis rather
than leaving it a plausible story.

**A SHARE CANNOT SEE A SOURCE THAT SIMPLY STOPS, and that is how it got past the
gate.** Coverage went 99.4% to 89.6%, inside a fifteen point band, reading as a
rounding difference, while every missing man was from one year on. So
`pool_shape.py` compares the NEWEST season carrying each column as well as the
share. `STALE_YEARS` is **2**, because Lahman's own release lands in the January
after a season, so a refresh run before it is published is legitimately one year
short of the WAR files, which come from a different source and are current. Two
is that, plus a year of nobody updating a mirror. Proved on the runner's own
pool: it names `positions stop at 2016 and the pool runs to 2025`.

**The chain is green end to end now**: the reference seasons unchanged, the shape
gate passed, `check-labels` reproducing all 44,344 prices from `w`, `ip` and `pp`
with the same 3,959 discounted starters, and `check-numbers` agreeing on 34
claims.

##### AND IT HAS SHIPPED, off the CRAN Lahman rather than off a mirror

Every run before this one was `commit: false`, because a pool whose recent
positions come from a mirror stopping in 2021 is not the pool that ships. With
the CRAN reader in, what landed:

| | shipped before | now |
|---|---|---|
| rows, batters, pitchers, closers | 44,344 · 24,644 · 19,700 · 905 | **identical** |
| batters with a position | 24,499 | 24,503 |
| newest season carrying a position | 2021 from a mirror | **2025** |
| **pitchers with an innings figure** | **18,760** | **19,700** |

**The shipped pool was already good, which is the nuance most easily lost.**
Positions moved by four. What was broken was never the pool, it was the
pipeline's ability to REPRODUCE it, and a refresh that cannot reproduce what
ships cannot ship anything either. The 940 are Negro Leagues pitchers, 1920 to
1948, whose innings the Chadwick snapshot predated: **it moves no price**, because
a starter's discount is `min(1, 210/ip)` and those seasons are nowhere near 210,
and the run reports the same 3,959 discounted starters.

**`provenance.json` is committed with the pool and said 109,859 rows beside a
pool of 44,344.** That is the build FRAME, before the WAR floor, and that file's
own header argues a machine-written record cannot drift from the data next to it.
It was drifting by a factor of two and a half. The shipped counts are written at
`compact_pool.py`, which is the stage that produces them, and the build's own
figure is kept as `built_rows` rather than overwritten, because how many rows the
sources held is a real fact about the run and the only place it is recorded.

##### AND THE TRADED SEASONS ARE BACK, because the sweep said they cost nothing

```
node baseball/pipeline/draft_economy.mjs <pool.json> [other.json] [runs]
```

The build collapsed a traded man's stints into one combined row and then dropped
it from every board, because TOT is not a club, so **2,939 player-seasons were
in the download and draftable from nowhere**. `split_stints` is the input that
splits them back out, and the workflow's own header told whoever ran it to
re-run the cap sweep first, because the price curve is convex and half a
season's WAR costs much less than half the price: a board of half-seasons is a
board of cheap production, which is the one thing the cap exists to make
somebody choose between.

**THERE WAS NO WAY TO RUN THAT SWEEP.** With `commit` off the pool never left
the runner, and the artifact host is refused from the development sandbox on the
CONNECT. So the runner does it: `draft_economy.mjs` plays the same two bots
`probe_cap` is built on, and the number is the GAP between them.

**The first answer was noise and said so.** At the default 40 drafts a bot it
read +10.1 against the shipped pool's +13.0, and 2.9 points is the size of one
standard error on a gap at that sample. At **400 drafts a bot**:

| | gap | best available | holds money back |
|---|---|---|---|
| the pool that ships | **+11.6** | 65.2, 33% Octobers | 76.8, 66% |
| with split stints | **+11.2** | 64.9, 33% | 76.2, 62% |

**-0.4 points against a standard error of 1.3**, so the draft economy does not
move, and the shipped pool's +11.6 lands on the +11.2 this file records from
`probe_cap`, which is what says the probe is measuring the right thing.

So it ships. The pool goes 44,344 rows to 45,379: the 2,939 combined rows leave
and the per-club halves arrive, most of them under the 0.50 WAR floor, which is
why the net is about a thousand rather than three thousand.

**WHAT THE GAP COULD NOT SEE IS THE YARDSTICK, and it moved in the good
direction.** The sweep reads `shownRating`; the all-time rank reads `squadRating`
through `teamStrength`, which rates a REAL club by its best men, and a traded
man used to be a TOT row filed under no club and counted for neither of his. He
counts for both now, so the table grows 2,594 team-seasons to 2,717 while its
shape does not move at all: p50 49.9 to 50.4, p99 81.8 to 81.7, **the top
identical at 95.4**. Over 120 best-available drafts the median is unchanged
(74.7 to 75.1 on the yardstick, 66.7 to 66.8 shown) and the CEILING opens: best
all-time rank **7 to 3**, and the badge sweep reaches 1.

**That makes `rank_one` reachable, which is a fix rather than a side effect.**
This file already records it as excused reluctantly, on the grounds that no bot
reaches 95.4 and that it had only ever lit off a defect in the old yardstick. An
unreachable legend badge is exactly what `check-badges` exists to catch.

**THE EXCUSE LISTS CHURNED BY FIVE IN AND FIVE OUT, and that is the pool moving
rather than ten badges changing.** `rank_one` and four title rungs light now;
`rating_95`, `one_season_5`, two Trade Machine rungs and `daily_title` went the
other way. The full sweep reaches all ten either way. Those lists are a record of
what ONE sweep reaches, so they move whenever the pool does, and reconciling them
is the price of a check that refuses to go quiet.

**THE SWEEP PRINTS ITS OWN ERROR BAR, and that is the half worth keeping.** Two
numbers side by side invite a decision the sample cannot support, and this one
would have been the wrong decision: read at 40 drafts it says don't ship, read
at 400 it says the difference was never there. `economy_runs` is an input and
the default is a tripwire rather than a measurement.

**It runs LAST in the job.** In the middle, a fourteen minute measurement
printed its verdict seven hundred lines from the end of the log, under
everything `check-labels` writes, which is the same failure one level up: a
workflow that tells a person to measure and gives them no way to.

**AND THAT STAGE WROTE THE POOL BEFORE IT COULD NOTICE THE POOL WAS EMPTY.**
`compact()` reads the enriched frame's verbose column names, so handed the
ALREADY COMPACT file, which is an ordinary thing to do by hand, every row misses
and the result is `[]`. It wrote that to disk and exited 0, and the shape gate two
steps later is what caught it: a guard catching another stage's garbage rather
than the stage refusing to make it. It refuses under a tenth of what came in,
which is generous, since the real floor drops about 60% of the frame. **Both arms
were proved**: the wrong file writes nothing and exits 1, and a real frame round
trips to the shipped pool **byte identical**.

### The price was normalized for innings and the engine's value was not

```
node baseball/check-labels.mjs    section 6, which is the half a label cannot cover
```

Reported by a player as the pitcher price being innings-normalized while the WAR
shown is not. The label for it had already shipped: a heavy starter's tile carries
his innings, and the draft screen and how-to-play both explain the rule. **The
label was the small half.** `build_positions.py` scales a starter's WAR by
`min(1, 210/ip)` before pricing him, and `rosterRunPrevention`, `staffEra` and
`staffRunPrevention` all read the season line, so **at equal price a heavy innings
starter bought a better rotation ERA than a light one**, in every band:

| price band | heavy arm's advantage, before | after |
|---|---|---|
| $10-20M | 0.044 ERA | **0.007** |
| $20-30M | 0.066 ERA | **0.005** |
| $30-50M | 0.069 ERA | **-0.004** |

**Nothing could report it.** Every price was a correct summary of a season, every
WAR on every tile was the figure a reader looks up, and no screen ever put the two
side by side. It is the weekly fantasy board's own availability defect arriving in
a different sport: a price built on one estimate and a value read off another.

`workloadWar(p)` is the one reading, and it is a **no-op for everybody but a
starter over the anchor**: relievers and batters are priced raw and have no anchor
to apply.

**`teamStrength` DELIBERATELY STILL READS THE SEASON LINE**, and that is not an
oversight to tidy up. It is the yardstick that ranks a drafted squad against 2,594
real team-seasons, and a real club genuinely did throw those innings, so moving one
side of that comparison and not the other is what would break it. Both sides stay
raw. `check-labels` asserts which reading is in which function, because both
answers are valid numbers and no measurement of an output can say which fit
produced it.

#### CHANGING THE INPUT WITHOUT REFITTING THE COEFFICIENT IS NOT A RE-RANKING, IT IS A NERF

`SP_ERA_PER_WAR` was fitted against the season line, so feeding it a systematically
smaller number makes every rotation in the game worse in absolute terms rather than
only re-ordering them. Measured over 400 drafted starters a side, the anchor takes a
mean **5.42 WAR down to 4.53**, so at the old 0.32 the whole game moved:

| | best available | careful | heavy-arm chaser |
|---|---|---|---|
| before any of this | 83.7 wins, 41% Octobers | 89.6, 61% | 84.9, 45% |
| workloadWar at 0.32 | 79.3, 29% | 85.9, 43% | 80.5, 25% |
| **workloadWar at 0.386** | **83.5, 36%** | **89.3, 59%** | **85.3, 41%** |

**The quick badge sweep is what caught it**, and it caught it the way that file
exists to: nothing dark before, **21 badges nothing could light** after. Every one
of them was a win-a-lot or win-a-title rung, which is the shape of a global nerf
rather than of a re-ranking.

**The ratio is 1.20 for the three bots that draft real players** (best 1.220,
careful 1.196, heavy-arm 1.206) and near 1.0 for the two that draft nobody, because
a $3M arm never threw 300 innings. It is solved against the three that matter, since
they are what a person plays like. **0.386** lands on the old numbers almost exactly,
including the band populations: 97 runs in the 80-90 band either side.

**REFITTING THE COEFFICIENT REINTRODUCES NOTHING**, and that is the part worth being
sure of rather than reasoning about. The arbitrage was that at equal PRICE a heavy arm
bought a better ERA; the price is built on `workloadWar`, so once the ERA is too, two
men at one price have one ERA whatever the coefficient is. It only sets the LEVEL. The
guard measures the gap per price band and is what says so.

**The bottom band is out of that guard on purpose.** Under $10M the price floor packs
thousands of men onto one figure, so "equal price" stops meaning equal and a residual
0.032 survives there. It is the band where the least is at stake and the one no
coefficient can clean.

#### The Trade Machine advertised gains that were losses

The offer sides are a **flat projection** rather than the player row, and it carried
`n, w, p, s, t, half` and nothing else. So the page's own `heavyIP` read `r` as
undefined, answered no for every man alive, and **tagged none of 2,274 offer sides**,
which reads as a pool with no workhorses in it rather than as a projection missing a
field. The comment above that literal already recorded this exact lesson for `half`.

What it cost is the mode's whole promise. `MIN_GAIN_WAR` filtered candidates on the
season line and the sheet's headline was `in.w - out.w`, so measured over 1,578 real
offers **one in five advertised a gain that was really a loss or nothing**, worst case
**"+5.2 WAR" for a swap worth -0.5**. Nothing threw: every figure on the sheet was a
true statement about a season, and the only symptom was a mode that made your team
worse. It is 0 of 1,032 now.

**THE FIGURE ON AN OFFER IS WHAT HE IS WORTH TO YOU, NOT HIS SEASON, and that is the
one place on this page where those two part company on purpose.** Everywhere else a
WAR is the season, because a season is what a reader looks up. An offer is not a card,
it is a button that swaps two men, so every number on it has to describe what happens
when it is pressed, and the headline is `in` minus `out` on exactly the two figures
printed beside it. Printing the season instead makes that subtraction wrong in front
of the reader, on **35.8%** of offer sides. The innings tag rides along as the flag.

**The receipt reads the same subtraction.** `Deal(s) · +N WAR` on the results screen
was summing raw, so it disagreed with the offer it is a receipt for. **And the
headline is rounded from the two figures printed beside it**, or a reader doing
3.3 minus 2.4 gets 0.9 under a headline reading +1.0: 64 of 207 offers disagreed
with their own arithmetic by a tenth. That seam predates the workload reading
rather than arriving with it.

##### IT COST THE ROTATION ALMOST ALL OF ITS OFFERS, and that is mostly the lies going

Measured over 120 runs either side: HEAD shopped SP1 and SP2 on **399 of 909**
offers and the fix shops them on **15 of 522**. That looks like a mode losing its
pitching and is mostly a mode losing its fiction, because **56.4% of HEAD's rotation
offers were not gains at all** against **0% at every other slot**. The whole defect
lived in the rotation.

**The rest of the drop is structural and no threshold fixes it**, which was measured
rather than assumed: `MIN_GAIN_WAR` swept 0.8 down to 0.5 moves rotation offers 15 to
18, and reverting the weakest-first sort to the season line moves it to 12. A
starter's price is `1.5 * workloadWar^1.6`, so once the ERA reads the same figure the
price is built from, **price is monotone in value and an equal-money rotation upgrade
cannot exist**. Only headroom buys one: a bot that leaves half the cap gets 6.8% of
its offers in the rotation against 2.1% for one that spends it.

**A batter is not in that trap** because his slot pool is a position rather than a
curve: same-price upgrades exist among bats and 510 of HEAD's other-slot offers were
already honest. **Do not reach for a smaller starter threshold to win the rotation
back.** It buys three offers, and what it would really be buying back is the 56%.

**And the All-Time Staff sort ranked on the season line** while `staffEra` rated the
staff on `workloadWar`, so the card said ace about a man the ERA underneath it
disagreed with. `check-staff` was reading `.w` too and had become a second copy of the
rule: it asks `E.workloadWar` now, so the sort and the suite cannot drift.

#### What the tile says, and why the conversion is not on the season line

The tile's big number stays the **whole season**, because that is what a reader looks
up and what the source note promises. Under it, in green, is what he is worth here,
written `counts as 2.4`. It read `2.4 here` first, and a player asked what "here" meant.

**It is not on the season line, and two things forbid it.** `.of-side .mt` on a trade
offer is 10px nowrap with an ellipsis at about 28 characters, so everything on that row
is inside a 30 character budget the season, the club and a two-way note have already
spent 23 of: `346 IP` is 6 and `346 IP -> 9.2 WAR` is 16, which does not fit and eats
the number the offer is about. **`check-labels` caught that on the first attempt**, at
32 characters. And the tile already writes ` -> SP1` after that line for a destination
slot, so an arrow there is a second arrow on one row meaning something else.

So it goes in the WAR cell, where the unit already is, and is read from the engine
rather than recomputed: the tile and the season can never disagree about what a man is
worth.

#### What this did NOT do

**The rating scale was not re-anchored**, and the reason is that it did not need to be
once the coefficient was refitted. `PROJ.FLOOR_WINS` is untouched (638 of 1,200 floor
drafts pin at rating 1 either side) and the top came back with the level: the 80-90
band holds the same 97 runs of 360 it held before. Re-anchoring is a change that raises
every rating and therefore makes both rating badges easier for ever, and a badge left
too loose cannot be tightened without stripping it off everybody who earned it. Do not
reach for it to fix a level: refit the coefficient, which is what the level is.

### The field is a ballpark, and the draft board is on the first screen of a phone

Asked for as the field looking a lot better and the draft screen needing work.
`diamondMarkings()` draws stands and a crowd, a padded wall with its home run
line, a warning track, fair grass mown both ways, a grass infield inside a dirt
skin, cut-outs at the bases, a raised mound, and chalk only where a field has
it: the foul lines and the boxes at the plate, never the lines between the
bases. Every colour is a literal, because the field is the sport and stays
green at night. The crowd is seeded, so a redraw never shimmers.
`DIAMOND_SPOTS` did not move, except the DH (81 to 78), whose name no longer
fits under it once it wears a ground.

**A name on the grass has a ground of its own**, a dark pill sized to the
text. A foul line through white type was the first thing a player saw.

**The board moved up about 150px on a 390 phone**, and three pieces of chrome
paid for it, none of them a thing a player uses between spins:

- The roster pips only show once the field scrolls under the sticky bar, so
  they hang below it (`.capwrap .dpips`) instead of holding a 34px blank strip
  above the field.
- Re-spin is a pill on the reels' label row, not its own full width row.
- The position tabs and the sort share one row (`.boardbar`). Under 520px a
  tab with nothing on it is not drawn, and it is what pushed the row past the
  width.

**The coach's take lists the archetype once.** It is the pill in the card's
header, and `coachReport` also returned it as a strength, so a Balanced
Contender read those words twice one line apart. `takesHtml()` drops it from
the rows on both the squad and results screens. The guest badge panel's
button is the ball, like every other primary action here.

### Ballparks are earned, and the account's park is the one the draft is played on

```
node baseball/check-parks.mjs          the catalogue, the art, the unlocks, the page
node baseball/check-parks.mjs --quick  no browser
```

Asked for as custom ballparks a fan would love, unlocked to the profile by rewards
and account tier. `baseball/parks.js` holds twenty seven (see the ladder below); the
big league ones are nods to famous parks (ivy on brick, a tall green wall in left, fountains, a bay, a
white frieze, a dome, a cornfield). **None is named for the park it nods to**,
and none carries a real sign or logo. Those belong to other people, so each is
drawn from what makes the place itself and given a name of its own.

**Unlocks are DERIVED, never stored**, which is the badge cabinet's design at a
second shelf. Every rule is a question about the account's own rows (badges
earned, best wins, Octobers, titles, seasons played, modes played) or about
`isPro()`. So a park is retroactive, follows the account, and cannot be lost by
clearing site data. A guest drafts on the sandlot. The only stored thing is the
CHOICE, on the account (`rtd_profiles.park`) with `rtd_park_v1` as the device's copy.

**THE ROAD TO THE SHOW, which is the owner's design.** Everybody starts on the sandlot and
climbs the real ladder of fields one season count at a time:

| rung | park | seasons |
|---|---|---|
| Sandlot | The Sandlot | from the start |
| Little League | Little League | 3 |
| High School | Varsity Field | 7 |
| College | Campus Yard | 12 |
| Single-A | Riverside Park | 20 |
| Double-A | Depot Field | 30 |
| Triple-A | Capital Park | 45 |
| The Show | The Diamond (`home`) | 60 |

**The Sandlot is drawn in the most detail of the road parks, on purpose**: it is the
field a new player looks at longest. It carries bald spots where the fielders stand,
weeds and dandelions where nobody plays (never on the skin), an old tire, a bike, a mitt
and a ball bucket in FOUL ground so no chip covers them, and on the fence a painted
scoreboard, a missing board with a dog's eyes behind it and two boards nailed back on
crooked. `sandlotGround` and `SANDLOT_WALL` in `parks.js`.

The track goes on through the eight big league parks (80, 100, 125, 155, 190, 230, 280,
350), so a park still arrives every so often for as long as somebody plays. Off the track:
**four SEASONAL parks** (Opening Day Mar 20 to Apr 10, Fireworks Night Jul 1 to 7, Haunted
Hollow Oct 24 to 31, Winter Classic Dec 18 to Jan 3), each earned for good by finishing one
season inside its window on the EASTERN calendar; **two SPECIAL** (October in all seven
modes, five World Series); **three HIDDEN** (a season finished between midnight and 4am
Eastern, a 110-loss season, a 116-win season) whose card shows a dark preview and a hint
until earned; and **two Pro**. The shelf is grouped, leads with any seasonal park open
right now (missing it means a year's wait), then the next rung and how far off it is.

**The winter window wraps the new year and the day is Eastern**, and both are asserted:
a range test written `k >= a && k <= b` never opens Winter Classic, and one read in UTC
puts 11pm on Oct 31 on Nov 1. Each was proved by reintroducing it.

**With no choice made, an account plays on the highest rung it has reached**
(`bestRoadPark`), not on the sandlot: forty seasons in, you play Double-A. A choice the
account can no longer back falls back the same way.

**`128_baseball_parks.sql` widens 127's check constraint** to the whole list. Without it a
new park is chosen on the device and refused by the server in silence, so the next phone
opens on another park. Preflight row 39 asks for it, and `check-parks` holds the SQL list
to `PARKS` so the two cannot drift.

**An account keeps every park the old ladder had already handed it**, the owner's call.
Unlocks are derived, so "had" is `parks.js`'s `LEGACY` rules (badges, wins, a title, the
old season counts) asked only of the rows filed before `LEGACY_UNTIL`, which the page
builds as `info.legacy` in `parkLegacy`. A season played after that earns by the road
alone, so a new account cannot use the old shortcuts. `check-parks` asserts both halves.

**A lower-tier fence is low**, so those backdrops are authored with `lowTop(H)`, which puts
the authoring wall top exactly where a wall H units tall lands (no shift). Fences are drawn
as the wall face: boards (`PLANK_WALL`), chain link (`LINK_WALL`) or a row of sign panels
that follow the wall's curve (`AD_WALL`, using `c.wt`/`c.wb`). A pattern with a fixed tile
height cannot do the signs: the wall face moves with its height, so the stripes land on
nothing. `P.front` hangs things on the wall top (bunting, jack-o-lanterns, snow) and
`P.ground` draws on the dirt in ground coordinates (the rain delay's puddles).

**The field has light and grain, shared by every park.** Grain patterns on the grass, the
dirt and the track (a pattern, not feTurbulence, because the shelf draws thirteen
previews); a lip where the skin meets the grass; worn batter's boxes; a grandstand shadow
across home plate on a day park (`sun`) and a light pool under the towers at night
(`lights`); and haze over the backdrop just above the wall on a day park. **A new layer's
id can collide with a backdrop's own**: Neon Nights already defines `glow`, which is why
the field's is `lglow`, and check-parks names the collision if it comes back.

**A choice the account cannot back falls back to its highest rung**, never to a
park it does not have: signed out, another account on the browser, or a Pro park
after Pro lapses. `check-parks` drives all three through the page, and each was
proved by making `currentPark()` return the stored choice unasked.

**The field keeps its spots and grows a sky.** A park draws the same diamond at
the same coordinates and changes the grass, the dirt, the wall and everything
behind it. The draft and squad fields (`PARKED_FIELDS`) extend the SVG's viewBox
upward by `SKY` (10 units over 68) for the skyline. So `.field.parked` is
`100/78` and `drawField` maps each chip's 68-unit y into the taller box. The home
page hero passes no sky, because its heights are measured against the fold, and
draws the park the account is using (`heroPark`), so a choice is the first thing a
returning player sees. A guest sees the big league park. The profile hub carries
the same park as a banner that opens the shelf, and both are redrawn when the
server answers a change, so a refused save puts the real park back.

**Every SVG id carries the field's suffix AND the park's id.** The profile draws
all thirteen in one sheet beside the draft field. Two parks sharing a gradient id
paint each other, and an id with no match draws nothing. Neither throws.
`check-parks` asserts every `url()` resolves and no id repeats across all
thirteen. Proved by stripping the suffix: every park fails.

**The camera sits low and the wall stands tall**, asked for by the owner: the
catcher was far from the plate and center field stood in the stands. The ground
is drawn flat and squashed toward home by `GROUND_K` (0.85) with the plate at
`GROUND_A`, so the diamond reads wider than tall. The wall face is `WALL_H` units
(6, the ivy 6.6, the cornfield fence 1.4). It carried distance markers for one commit and the owner took them off. The
backdrops were authored against the old wall, so each is shifted down by how far
its wall top moved (`shift`). **`DIAMOND_SPOTS` is the same projection written by
hand**, so `check-parks` holds it to `parks.js`: every fielder at least 3 units
below the foot of the wall, the catcher 3 to 6.2 units in front of the plate.
Both were proved with the old spots. Under 520px the discs are 30px, because at
36 the pitcher's name ran into the catcher on the tighter diamond.

The draft field wears a tag naming its park, and pressing it opens the shelf. A
season that opens a park says so on the results screen (`lastNewParks`, computed
before and after the row is filed, as `lastNewBadges` is), with the park drawn and
a button to play on it next.

### Two ratings, two jobs, and they must not be merged

`squadRating()` reads nine bats and two starters, the same shape a real club
offers, so a drafted squad can be ranked against the 2,594 real team-seasons in
`ratingTable`. It is therefore blind to chemistry, to roster shape and to the
closer, which is most of what the season actually runs on. Measured over ninety
drafts, **three rosters inside 0.4 rating points of each other projected to 68,
81 and 96 wins**, and a player was shown 94 above a 79-83 record.

So there are two numbers:

| | what it reads | what it is for |
|---|---|---|
| `squadRating()` | nine bats, two arms, nothing else | the all-time rank, and `titleEdge` inside `generatePlayoffs` |
| `teamRating()` | the offense and defense the sim runs on | the number on the squad and results screens, and the badges |

`playRun()` returns both, as `rating` and `shownRating`. **Leave `rating` feeding
`generatePlayoffs`**: the balance is measured on it, and swapping it moves the
title rate. The UI reads `shownRating` through one accessor in `index.html` so
nothing picks up the yardstick by accident.

`teamRating()` says what it means in wins. Pythagorean expectation understates
the spread this schedule produces, so `PROJ.SLOPE` and `PROJ.INTERCEPT` are
**fitted** against the season simulator. Refit rather than nudge. Re-measured
over 208 rosters swept across eight drafting-quality levels, each played for 16
seasons: **actual = 1.019 x projected + 1.61, rms 1.60 wins**, over a range of 50
to 107 actual wins. The projection is sound across everything a draft can reach.

#### The scale is anchored on what a DRAFT can produce, at BOTH ends

It used to hang on 88 wins = 50 and the 116-win record = 100. Both are real
things and neither is on the menu: a roster is twelve men under a $170M cap, not
a real club. Reported by a player whose 73-89 season rated **17**. Measured over
240 drafts, four ways:

| how you draft | p50 | best |
|---|---|---|
| cheapest man every time | **1.0** | **1.0** |
| best value per dollar | **1.0** | **1.0** |
| at random | 6.5 | 49.4 |
| best available | 37.5 | 71.4 |

So the top 28 points were unreachable AND the bottom was a wall rather than a
scale: `Math.max(1, ...)` crushed every careless draft onto one number, and two
teams forty wins apart both read 1.0. **Half the distribution was one value.**

Both ends are measured now, through the real draft loop: the FLOOR takes the
worst man on every board (60 drafts, 31 projected wins) and the TOP is strong
drafting (250 drafts, p50 85, p95 98, best **106**). So **99 is the best roster
this cap buys** and 1 is a draft nobody could do worse than, at 1.307 rating
points per win. Re-measure both if the cap or the pool moves: they are facts
about the draft, not preferences.

What the bands are worth, over 390 drafts, which is what the verdicts and the
badge thresholds are pinned to:

| rating | mean wins | Octobers | titles | share of drafts |
|---|---|---|---|---|
| 90+ | 104.2 | 100% | 20% | 1.3% |
| 80-90 | 97.7 | 97% | 10% | 15% |
| 70-80 | 88.7 | 52% | 1% | 26% |
| 60-70 | 81.9 | 21% | 0% | 19% |
| 50-60 | 72.6 | 2% | 0% | 12% |
| under 50 | 66.9 and down | 0% | 0% | 26% |

Whole pool: p25 49, median 67, p95 87, best seen 95.3, and **6.2% on the floor
clamp**, all of them the floor bot. The verdicts (`90 / 80 / 70 / 60`) and the
two rating badges (**80** and **90**) sit on those boundaries.

**THE BADGES MOVED BECAUSE THE SCALE DID**, not because they were mistuned.
Against a scale whose top is now reachable, the old 55 and 70 would have been
handed out for an ordinary draft, and a badge is DERIVED from stored rows, so
one left too loose cannot be tightened later without stripping it off everybody
who already earned it.

**AND THAT PUT THEM OUT OF REACH IN ALL-TIME STAFF, which is a real cost rather
than an oversight.** Both badges read `shownRating`, and staff mode answers that
with `staffRating()`, a separate ERA-based scale this pass did not touch.
Measured over 70 best-available staff drafts it runs p50 60.1, p95 73.8, **max
75.6**, so neither 80 nor 90 lands there any more; on the old 55 and 70 both did.
They are still reachable, in the team modes, so this is not the unearnable badge
`check-badges.mjs` exists to catch. What it means is that staff mode has stopped
being the cheap route to two badges about fielding a great TEAM, which is the
right way round. The honest fix, if the two scales should ever be comparable, is
to anchor `staffRating` on what a staff draft can produce the way `teamRating`
now is, and that is its own measurement rather than a constant to nudge.

**Nothing here touches the balance**, and that is the point of keeping the two
ratings apart: `generatePlayoffs` reads `rating` (squadRating) and never
`shownRating`. Verified rather than asserted, by running 400 identical seeds
against the engine either side of the change and diffing the output.

#### And cutting a player used to change which scale you were graded on

```
node baseball/check-yardstick.mjs         a real cut, and what the run is then graded on
node baseball/check-yardstick.mjs 40      a bigger sample
```

`run._simState.rating` is the yardstick: it feeds `titleEdge` inside
`generatePlayoffs` and the all-time rank on the results screen. **Two different
formulas were writing it.** `advanceGame` seeds it with `squadRating(roster)` and
`rebuildSimState` replaced it with `overallRating(teamWinPct(offense, defense))`,
which is teamRating's inputs through squadRating's tail: a THIRD number, and
exactly the thing the section above forbids in as many words.

**Only `cutPlayer` and `acceptTrade` reach that rebuild**, so it was Cap Survivor
and the Trade Machine, and **cutting is Cap Survivor's whole loop**: the market
puts you over the cap and the sheet reopens until you are under. This was not an
exploit somebody had to find, it was the mode's ordinary path.

Driven over 25 Cap Survivor runs cutting the cheapest man on the roster: the team
got genuinely worse on 25 of 25 (`shownRating` always fell) and **the yardstick
still rose a mean of 8.8 points, moving the all-time rank a mean of 282 places
BETTER**. The direction is arbitrary rather than generous, because the two are
different scales: over 180 rosters the swap ran a median **+15.1** and from -2.9
to +34.1. Paired on identical seeds, 40 runs a mode:

| | yardstick | all-time rank |
|---|---|---|
| Cap Survivor, dearest cut | 78.0 to **65.9** | 141 to **370** |
| Cap Survivor, cheapest cut | 79.1 to **65.1** | 137 to **435** |
| Trade Machine | 94.3 to **75.6** | **4 to 98** |

**The Trade Machine takes three trades a run, so it rebuilt three times and
finished on a mean all-time rank of FOURTH of 2,594 real team-seasons.** Every
run, one of the best team-seasons in history, for accepting the offers the mode
exists to offer. A greedier draft bot read seventh and the guard's own sweep
reads second: every measurement of it lands in the top ten.

**The wins are byte-identical either side** (82.1, 83.5 and 86.1 on both), which
is the thing to check before believing any of it: this moves the grading and
never the play.

**AND THE LEADERBOARD DOES NOT MOVE**, which is what makes this safe to ship on a
live game. Every rating the page displays or files goes through `shownRating()`,
including the board payload, and `scoreOf` is computed from that. Only the
yardstick and the all-time rank change, so rows already on the board stay
comparable with rows filed after it. Existing ranks on a FINISHED run are stored
in the row and do not move either.

**It is a balance change and it was made on purpose**, which is what the old
comment in `rebuildSimState` asked for. A higher rating buys a WEAKER opponent
(`TITLE.PIVOT` was 84 then and is 90 now and the edge is a multiplier on the opponent's scoring), so
at a fixed record a good roster's title rate falls **7.7% back to 5.7%**. Cutting
a player no longer makes October easier.

**The guard asks the REBUILT STATE and never the source.** The defect was a third
number spelled differently, so reading `run.js` for a function name would pass
the day somebody writes it a fourth way. It cuts a real player on a real run and
reads what the run is then graded on.

**Its claim is DIRECTIONAL, and a magnitude threshold was tried first and was not
founded.** Losing one of the nine bats really can move `squadRating` eight points,
so "no cut moves it more than a band" failed on a correct page. What holds is that
a cut which lowers the shown rating may never raise the yardstick: both measure
the same team. The old number raised it on three runs of five.

**And the non-vacuity clause is deliberately not "all of them".** Cutting the
cheapest man weakens the squad on 19 of 20 and occasionally does not, because he
can already be near replacement level and losing him can leave the chemistry or
the roster shape slightly better off. The section needs the cut to be doing real
damage most of the time, not to never fail to.

#### The re-spin looks like a control nobody should press, and the fee is NOT why

**Measured and then NOT changed**, which is the point of writing it down.

Paired on the same seeds, a bot that presses it only when the board is genuinely
poor loses monotonically: 79.0 wins never pressing, 76.3 at 0.63 presses, 69.7 at
2.08, 63.7 at 2.87. About **-5.3 wins a press**. Blind pressing measures the same.

**The mechanic itself works, and works hard.** A re-spin discards the board and
draws three new men off a new team-season, so it is a gamble rather than a re-roll
you keep, and it regresses to the mean exactly as it should:

| best man on the board | presses | gain from redrawing | improved |
|---|---|---|---|
| 0 to 3 WAR | 20 | **+2.88 WAR** | 95% |
| 3 to 5 WAR | 115 | **+1.87 WAR** | 78% |
| 5 to 7 WAR | 154 | +0.26 WAR | 49% |
| 7+ WAR | 111 | **-2.47 WAR** | 14% |

**THE FEE LADDER IS NOT THE LEVER, and the first reading of this said it was.**
Swept at [5,10,15], [4,8,12], [3,6,9], [2,4,6] and [1,2,3], the loss came back
-3.4, -6.4, -5.9, -6.2 and -3.4: no trend, and the spread between ladders is
inside the noise at 60 runs a cell. That is this repo's own rule about a band a
sample cannot resolve, arriving at a sweep.

**Set the fee to ZERO and it still loses**, which is what settles it: 79.7 wins
never pressing against 76.8 pressing three times for free, and the payroll is
$170M in both arms because the cap is spent either way. What the fee actually buys
is roster: **43.9 WAR against 38.9 at [5,10,15], and 43.9 against 42.9 free**. So
the fee is about four of the five WAR lost, roughly 1.5 WAR a press against a
+1.87 WAR board gain, which is close to balanced.

**The residual is the BOT, not the button.** A greedy bot signs the best man on a
better board, which is a pricier man, and strands the tail of its roster. It loses
here even when the press is free. So nothing was changed: no strategy has been
shown to be hurt by the current fee, and cutting a constant because one bot is bad
is the mistake `hoops/check-badges.mjs` already records. **What would settle it is
a bot that re-spins AND manages its budget**, which is a measurement nobody has
made yet.

### Neither the bracket nor the at-bat simulator decides anything

That is the one thing to hold on to before touching either. `generatePlayoffs()`
picks the player's opponents and stiffens them by round and by rating, and the
balance is measured on that. Everything October draws on screen is built around
that path and settles nothing: the bracket simulates the eleven series the player
is not in, and the at-bat engine plays out scores that already exist. Both run on
their own seeded RNG so the season's stream is untouched.

### The bracket

Twelve clubs, four columns, reseeded every round the way MLB's is: the top two
seeds sit out the wild card, then the best seed alive always draws the worst seed
alive. `createBracket()` in `engine.js` holds all of it, which is why
`check-bracket.mjs` can check it; `index.html` only draws.

Three things it gets wrong if you are not careful, all of which render perfectly:

- **`run.playoffs.rounds` stops at the round the run went out in**, so the last
  rung is only the World Series opponent when the run reached the World Series.
  Pinning it as one anyway seated the club that knocked the player out in the
  Division Series as the far side's top seed, and that club then came through as
  the near champion too: a World Series between the 1951 Giants and the 1951
  Giants. Rungs are pinned BY COLUMN (`ladder[3 - firstCol]`), and the array is
  never compacted.
- **The ladder can draw the same club in two rounds**, because the opponent for
  each round is picked at random out of the elite pool. Only the first pinning
  stands.
- **The seat across from the player is the run's own opponent**, written over
  whatever the reseed produced. Without it you watch a series against a club the
  bracket never put there.

**The two sides are not the American and National Leagues and must never be
labelled as such.** A roster is drafted across every era from 71 clubs, half of
which no longer exist and some of which were never in either league, so filing the
1931 Homestead Grays under the AL would be a tidy-looking lie. They are the
player's side and the other one.

#### And its determinism section pinned three magic seeds, which the pool ate

`check-bracket.mjs` went red on a pass that touched no engine, no run loop and no
data file: `DETERMINISM: a run to check determinism against`. It reads exactly
three files and not one of them had changed, so it was pre-existing by
construction, and it is **the magic seed trap this file already documents twice**
arriving in a third game.

The section needs a run that reached October, and asked for one as
`octoberRun(20000) || octoberRun(20001) || octoberRun(20002)`. `octoberRun`
drafts by taking the first man on every board, which is a careless draft:
measured against the shipped pool, **about 30% of seeds reach the playoffs at
all**, so three pins had roughly a **one in three chance of all failing** on any
change to the data. Splitting traded stints back out took the pool 44,344 rows to
45,379, every seeded draw reshuffled, and all three stopped qualifying.

**Measured rather than re-run until green**: the three pinned seeds come back
false deterministically, and **60 of the 200 seeds from 20000 reach October**,
the first being 20005. So the page was right the whole time and the file had no
fixture.

**The seed is not part of the claim**, which is what makes searching the fix
rather than a loosening. What is being asserted is a property of `createBracket`,
that the same run always draws the same field, and ANY October run supplies it.
The search is bounded at two hundred and the failure still means something: no
run in two hundred seeds reaching October would be a real finding about the mode
rather than a missing fixture.

### The at-bat simulator

October is played out plate by plate in every mode except Classic and the daily,
which watch the bracket fill in and never sit through a game. (A finished run can
always go back and watch October from the results screen, whatever mode it was.)
The thing to understand before touching it:

**`resolveGame()` still decides every game.** The season, the bracket and the
balance measured across thousands of runs (89.2 mean wins, 59.8% Octobers, 6.5%
titles) all come from the model that was there before. `simGameScript()` is
handed a final score that already exists and works out the nine innings that
produced it: it spreads the runs across innings the way real innings bunch up,
then plays each half out with real base and out state until exactly that many
runs are in. A second simulator that decided its own games would be a second
balance, and every one of those numbers would need re-tuning.

Two consequences worth keeping:

- **It draws from its own RNG**, seeded off the run seed plus the round and game
  index. Watching a game and skipping it leave the bracket bit-identical, and a
  seed always replays the same game. Do not let it touch the season's stream.
- **The only rule imposed from outside is that the third out cannot land until
  the inning's runs are in.** That is also the only rule real baseball enforces
  about when an inning ends, so it never shows. Everything else (a double play
  wiping out a rally, a runner held at third, a walk-off) falls out of the base
  state. `check-atbats.mjs` asserts the line score always adds up to the score it
  was handed, over 25,000 games plus every game of 25 real brackets, and checks
  the shape against real baseball: plate appearances per game, hits, how often a
  half inning is scoreless.

The opponent bats its own roster: a marquee club carries its season, so the 1927
Yankees send up Combs, Gehrig and Ruth. **A third of those clubs have seven or
eight qualifying bats**, because the build applies a playing-time floor, and the
rest of the order fills in by position rather than by inventing anybody.

### And then the door went too, because the staff can assign itself

```
node baseball/check-staff.mjs        the assignment, the ranking and the blast radius
node baseball/check-staff.mjs 400    a bigger sample
```

Asked for, and it is the section above taken to its conclusion: if SP3 and SP4 are
one job, stop asking. **All-Time Staff opens no chooser at all now.** A starter
fills the rotation, a reliever the bullpen, and the twelve slots re-rank themselves
so SP1 is the ace.

**Two things the sim can hear, and the draft answers both.**

**THE ROTATION TAKES THE BEST ARMS.** A rotation slot is a fifth of 70% of the
innings and a relief slot a seventh of 30%: **14.0% against 4.3%**. That gap beats
the steeper return relief WAR pays (0.55 of an ERA point per win against 0.32), so
the bigger arm belongs in the rotation every time, by 0.021 of staff ERA per win
above the man he displaces.

**And CL**, because `closerSavePct` reads that slot by name and nothing else does.
Both slots sit in the same relief average, so the label costs nothing in ERA and
can only raise the save rate. **That clause is also what keeps the roster LEGAL**,
which is not obvious: a starter who overflowed into the bullpen is not
closer-eligible, and without CL filled first the ranking hands it to him. Nothing
throws. The sim reads him as the closer and converts saves off his WAR.

#### The first rule refused to cross the rotation line, and the card said so

It filled the rotation in DRAFT ORDER and sorted only within each group, on the
argument that a sort free to move a man between them is an optimiser rather than a
tidy-up and would drift every win rate the mode is balanced on. **That is the right
worry about the wrong rule.** Driven for real it put Greg Maddux's 9.1 WAR at RP1
above a 4.7 WAR SP1, because he was picked tenth. The card read as broken, the
staff really was worse, and "sorted by ranking" was the one thing it was not.

**WHAT IT COSTS IS LARGE AND IS NOT A SIDE EFFECT**, measured over 220 drafts a
cell against the same seeds:

| | wins | Octobers | titles | save% | staff ERA |
|---|---|---|---|---|---|
| best-available, draft order | 86.4 | 43% | 2.7% | 82.8 | 3.194 |
| **best-available, ranked** | **94.2** | **76%** | **8.2%** | 85.8 | **3.030** |
| middling draft, draft order | 55.9 | 0% | 0% | 82.4 | 4.173 |
| **middling draft, ranked** | **57.8** | 0% | 0% | 84.6 | **4.136** |

**IT IS NOT A FLAT INFLATION AND THE SHAPE IS THE POINT.** The ERA moves 0.164 for
a good draft and **0.037 for a middling one**, because ranking only pays when there
is a spread to rank: a staff of twelve similar arms is the same staff in any order.
So what this rewards is having a real ace, which is what the mode is about.

**The baseline is the LAZY path and not the good one.** With the chooser up, every
SP slot was a "natural position" for a starter, so the first option on the sheet
was the lowest open SP slot: clicking through gave you draft order. A player who
thought about it already put their best arms in the rotation and is where they
were. So this is not a buff to good play, it is the removal of a trap for careless
play, which is `check-runs`' own "doing nothing was the worst outcome" arriving in
a draft.

**IT MOVES `staffRating`, WHICH WAS ITS OWN DECISION AND HAS SINCE BEEN TAKEN.**
That scale was anchored at `50 + (3.40 - era) * 55` against a measured median ERA
of 3.22, on the draft-order assignment, because that is what a bot signing without
choosing produced. The sort stretches it by about nine points at the top and two in
the middle. See the section below for what re-measuring found.

#### And when it was re-anchored, both ends were dead

```
node baseball/check-staff.mjs     the assignment and its blast radius
```

The stretch above is real and is not what was wrong. Re-measured over **640 drafts
at eight grades of drafting quality**, plus **900 more sweeping how much budget is
held back**, that line had the two defects `teamRating` was rescaled for, at once:

| | |
|---|---|
| the top was dead | the best staff ANY strategy reached is **2.93 ERA**, which that line puts at **75.9**. The top 24 points could not be lit by anybody. |
| the bottom was a wall | **196 of 640** pinned at exactly 1.0, so two staffs a third of a run apart in ERA read the same number. |

**HOLDING MONEY BACK DOES NOT HELP, which is what proves the ceiling is the mode's
and not the bot's.** Swept at 1.2x, 1.6x, 2.1x, 2.6x and 3.2x a slot's pro-rata
share against plain greedy, the best ERA reached runs 3.07, 3.00, 2.96, 2.94, 2.93
and 2.93. Greedy is as good as anything, so the cap does not bind here the way it
binds a team draft, and there is no strategy left to blame the dead top on.

Both ends are anchored now, **4.63 ERA to 1 and 2.91 to 99**, and the scale is
live end to end: **nothing at the ceiling and nothing at the floor** over the same
640, against 196 on the floor before. A sensible draft medians 92, taking the
second best man each time medians 65, the third 45, the fifth 21 and the worst man
alive 8.

**THE RATING SHELF IS SCOPED TO TEAMS, and that is the half that would have gone
wrong quietly.** Every rung of it says "field a team", `best.rating` took the max
over ALL rows, and a staff is explicitly not on the team scale: `staffRating`'s own
header says so. While the staff top was dead at 76 that cost nothing, because a
staff run could never be anybody's best number. Anchored, a sensible staff draft
medians 92 and would have handed out every rung up to "Best on paper" for pressing
the obvious button twelve times. `best.rating` skips `r.staff` now.

**And the staff's own rung moved with the scale rather than being left.** `staff_70`
is `staff_90`: on the old anchors the best staff anybody reached was 77, so 70 was a
little better than a median good draft, and on the new one a median good draft is
92. The badge means what it meant. **This is the moment to do that and the only
one**: a badge is derived from stored rows, so one left too loose cannot be
tightened later without stripping it off everybody who has it, and this game has no
rows yet.

#### The guard, and the four mutations that gave it teeth

Every claim was proved by reintroducing a defect, and **two of the four passed green
on the first attempt**, which is the whole reason the file reads the way it does.

- **"The sort never moves a man across the rotation line" could not fail.** It read
  the ERA, called the sort again and read it again. The sort is idempotent, so a
  sort that crossed the line crossed it identically both times and the delta was
  zero: it compared an already sorted staff with itself. That assertion is gone
  anyway, because the rule it guarded was the wrong one.
- **"The sort does not reach the other modes" could not fail either**, for the same
  reason one level along: with the mode guard removed the sort has ALREADY run
  inside `sign()`, so the fixture was the sorted answer and the second call agreed
  with it. The fixture is deliberately scrambled now, and the check asserts the
  scramble is one a sort would visibly change before asserting it survived.
- **What actually catches a sort that crosses the line is ELIGIBILITY**, which the
  first draft never asked. A reliever at SP1 is an illegal roster the sim reads
  perfectly happily: he is simply rated on the starter's ERA curve from then on.

**The tile prints where he ENDS UP, not where the signing takes him.**
`slotForPlayer` names the slot the pick claims and the re-rank then moves everybody,
so a tile promising the rotation to the sixth-best starter on the board would be
wrong a frame later. `staffLanding()` does the real signing on a clone and reads the
answer back, so there is never a second copy of the ranking rule written out for
display. That is this mode's own tile-and-sheet disagreement, caught before it
shipped a second time.

**A tile can still say Bullpen for a man who ends at CL, and that is honest.** CL is
last in `STAFF_SLOTS`, so it is not an open slot until the twelfth pick: at pick
eleven the answer really was the bullpen, and the later pick is what freed the job.

**The sort runs at the draft and nowhere else.** `cutPlayer` puts a
replacement-level arm in the slot a man was cut from, mid-season, and re-sorting
there would promote the best remaining reliever into CL and hand back the save rate
the player had just lost. A cut is meant to cost something.

### One job, one door, and the chooser was answering with a regex

Reported as "why can't I choose SP2 for Mathewson if that is available". SP2 was
open, the sheet offered SP1 and SP5, and SP2 was not on it.

**`slotGroup()` in the engine is where that question is answered now.** `staffEra`
and `staffRunPrevention` AVERAGE the five rotation slots together and average RP1
through RP5 and SU together, so a staff's five starters are one job with five names
and its six relievers are one job with six. CL is on its own, because it is the one
arm read by name, in `saveRate`.

**The page cannot work that out from the STRING, and three separate loops were
trying to.** Each carried its own `name.replace(/[12]$/,'')`, which strips a trailing
1 or 2 and leaves every other digit alone. In All-Time Staff that makes SP2 the same
job as SP1 and SP5 a job of its own, so the chooser offered nine doors into three
rooms and hid one of them. The tile above it printed a fourth answer again
(`1909 NYG → SP · SP5 · RP…`).

`openJobs(p)` is the one function now, read by the tile and the sheet.

**The same regex was colouring the chips**, from `POS_COLORS`, which names SP, SP1,
SP2, CL and RP and not SP3 to SP5, RP1 to RP5 or SU. So the lineup card drew the
whole back of the rotation and the whole bullpen in the fallback grey that means
"no position", beside two blue starters. `posColor` falls through to the base.

### A man who fits two spots is placed ON THE FIELD, not in a sheet

Asked for: the chooser should be the field we already built, not a pop up. The
`#sheet-pos` sheet is gone, and with it `slotNote()` and `posLabel()`. Pressing a
tile whose man has more than one open job starts a PLACEMENT (`startPick`): every
spot he can take glows gold on the diamond, the pitcher strip and the lineup card,
the rest dim and stop taking presses, and a bar at the foot of the screen names him
with a Cancel. Tapping a gold spot signs him there. Pressing the same tile again,
Cancel or Escape backs out and costs nothing.

**`openJobs` is still the one answer**, so the gold spots are exactly the doors the
sheet used to list and no second copy of the rule exists for display.

**`PICK` is cleared on every way off the board**: a signing, a re-spin, the next
spin and any screen change. A placement left standing across a re-spin would offer
spots for a man who is no longer on the board.

**The page script is an IIFE, so `PICK` is not on `window`.** A walker reads the
DOM instead: `#s-draft.picking` says a placement is up, `.target` marks every gold
spot, and `.natural` marks the one at his own position, which is what
`check-run` taps.

### His own position is his whole WAR, and chemistry means they played together

Asked for from the placement screen: putting a man at his own position should
give his best rating before chemistry, and anywhere else should cost a little.
And every kind of chemistry should actually be in use.

**`slotWar(p, slot)` is the one reading.** A batter at his primary position
(`pp`, with `OF` covering LF, CF and RF) is his season WAR. Another fielding
position costs `POSITION_FIT.OFF`, **8%**. **The DH costs nobody anything**, which
was asked for after it first shipped charging every fielder there: a hitter at DH
is only asked to hit. So there are two questions. `primaryAt` says whether a slot is
his OWN (it wears the star, and DH is only a DH's own), and `offPosition` says
whether it CHARGES him (never at DH). `slotWar`, the offpos ring and the pick bar
read `offPosition`; the star reads `primaryAt`. `check-labels` holds both over the
whole pool, and a shortstop at first still pays.
Pitchers and replacement bodies are never charged. `rosterOffense` and the
defence term in `rosterRunPrevention` read it, so it moves the shown rating and
the season. **`teamStrength` deliberately does not**, for the same reason it
still reads the raw season line: it is the yardstick against real clubs, and a
real club played its men wherever it played them.

**`slotForPlayer` tries his own position first**, then a dedicated slot, then
DH. The page's `openJobs` asks `E.primaryAt` for the star, so the gold star and
the number the season plays are one rule. On the field his own spot pulses and
wears a star; every other spot is quieter and prints the cost, read off
`POSITION_FIT` so tuning it rewrites the label. A man fielded off his position
wears an amber ring on the diamond and an amber WAR on the lineup card, and the
card prints the charged figure rather than the season line.

About two batters a run end up off position, because their own spot was taken.

**THREE OF THE SIX LINKS NEVER ASKED WHETHER TWO MEN PLAYED TOGETHER.** The
battery and the double-play combo needed the same club AND the same drafted
season, which almost never happens across a twelve-man draft (battery lit on 3%
of chemistry-chasing rosters, the DP combo on well under that). A catcher and
the pitcher he caught for four years were strangers if you drafted them from
different seasons. Now:

| link | value | asks |
|---|---|---|
| family | 0.09 | a curated pair |
| reunion | 0.08 | same club, same drafted season |
| battery | 0.07 | a catcher and a pitcher who shared a franchise-season, at C and a pitching slot |
| dp_combo | 0.06 | a 2B and a SS who shared a franchise-season, at those slots |
| **teammates** | **0.05** | **new**: shared any franchise-season in their careers |
| college | 0.04 | went to the same college, any era |
| franchise | 0.03 (was 0.04) | same club, never together |
| era | 0.005 | same era |

`setCareers` builds, per player id, every franchise-season he appears in,
through `franchiseOf` so a Montreal Expo and a Washington National are one
club. `sharedSeason` answers the earliest shared one. Battery and DP ask the
SLOT a man is placed in (`_slot`), not his listed positions, so a shortstop
fielded at DH is not half a double-play combo.

**Measured over 120 drafts a bot:**

| | wins before | wins after |
|---|---|---|
| best available | 81.8 | 83.7 |
| chases chemistry | 82.2 | **90.3** |

Chasing chemistry used to be worth 0.4 wins over taking the best man and is
worth about 6.6 now, which is what makes it a strategy. Teammates links land on
89% of chemistry-chasing rosters, battery on 19%. **0.03 for teammates was
tried and rejected**: it would have made playing together worth less than a
bare shared shirt. The franchise tie came down to keep that order.

**`link_teammates` ("Played together") is a new silver badge**, and the quick
badge sweep moved: eight excuses came off because the chemistry bot now
reaches them, and `rank_one` and `one_franchise_8` went on, because the bot
chases team-mates rather than stacking eight from one club.

#### Two men from the same college share a link

```
python3 baseball/pipeline/build_colleges.py      writes baseball/data/colleges.json
```

Asked for as "college links". `data/colleges.json` is one entry a man (Lahman's
CollegePlaying and Schools, joined to the pool's Baseball-Reference ids through People),
built by the data workflow after the pool and read by `E.setColleges`. A man with several
schools keeps all of them, and a shared one fires the `college` link, labelled "USC
alums". It sits beside the team-mates link rather than instead of it, because two Trojans
who later shared a clubhouse had both.

**The source stops at 2014**, so 3,324 of the pool's 10,254 men have a school and anybody
who played college ball later has none. It under-counts and never invents a pair. The
builder refuses to write if under 15% of the pool matches, because a join that matched
nobody is the one way this fails without an error. `SHORT` holds the names a box score
uses (USC, LSU, Ole Miss) where trimming the full name would not.

**Measured over 120 drafts a bot: it barely moves balance.** It lands on 8% of
best-available rosters and 20% of rosters chasing chemistry, and moves wins by 0.1 to 0.2.
`link_college` ("Old school") is a silver badge.

#### And One Franchise stopped paying the team-mates link

Reported by a player as chemistry feeling too strong in One Franchise. It was: twelve men
from one club almost always overlapped somewhere in their careers, so the team-mates link
fired on nearly every pair. Measured over 100 best-available drafts, One Franchise ran
**14.1% chemistry against Classic's 8.5%**, and the same drafting won **105 games and
reached October 96% of the time** against 89 and 59%.

`chemOpts` suppresses `teammates` in One Franchise now, on the rule the franchise link was
already suppressed under: a link the mode's own rule guarantees is not a choice. After it,
best available lands at 7.7% and 90.7 wins, and a player chasing bonds still earns more
(95.3) through the ones that are choices: a reunion from one season, a battery, a
double-play combo. Those read the shared season directly and are untouched.
`check-franchise.mjs` section 7 holds One Franchise within three points of Classic, off
real drafts, and removing the line fails it.

**Eras and Division stopped paying it too**, the owner's call. Over 100 best-available
drafts each, before and after:

| | before | after |
|---|---|---|
| Classic | 90.0 wins, 65% Octobers, 8.2% chemistry | unchanged |
| Eras | 100.6, 91%, 12.8% | **82.5, 37%, 5.1%** |
| Division | 102.4, 91%, 13.3% | **89.2, 58%, 8.0%** |

Division lands on Classic. **Eras now sits under it**, because that mode already
suppresses the era link, so it lost two links where the others lost one. Recorded
rather than compensated; if Eras should come back up, the lever is the era link, not
team-mates.

### An era card counts FRANCHISES, and says how deep the wheel is

Reported by a player as "shouldn't we have more teams than this from each decade".
The first answer is the league's own shape: MLB had **16 clubs from 1901 to 1960**,
20 in 1961, 24 by 1969, 26 in 1977, 28 in 1993 and 30 from 1998. Anything over that
on a card is the Federal League (1914-15) or the Negro Leagues (1920s to 1940s).

**The second answer is that the card was counting CODES**, so it overstated where it
looked low. The 1950s read 21 because the Braves, A's, Browns, Dodgers and Giants
moved and changed letters; the 2020s read 31 because the Athletics are OAK then ATH.
`eligibleEras` counts `franchiseOf` now, and the card also prints how many team
seasons the wheel can land on (118 in the 1900s, 300 in the 2010s), which is the
number a reader asking about depth actually wants. `check-franchise`'s last section
holds both against the pool, plus 16 for the 1950s and 30 for the 2020s.

### An era card is a decade, so the decade is the biggest thing on it

The era picker wore the franchise card whole: "1920s" in 13px body type over three
lines of small grey facts, thirteen cards of one texture. It is its own card now.
The decade in the display face, a colour per decade off one ramp from sepia (1900s)
to cobalt (2020s), clubs and team seasons as two stat blocks, and the decade's top
forty seasons drawn as a bats against arms bar, which is the thing that actually
changes how a decade drafts. The Pitchers' or Hitters' chip and the best season sit
under it.

**The sample size and the lean are the engine's.** `eligibleEras` returns `top` and
`lean` off `ERA_TOP_N` and its two bands, so the page never restates 40, 22 or 12.

**`.fran-card.era-card`, two classes, is load-bearing.** `.fran-card` sets
`display:block` later in the sheet at equal weight, and the first draft lost to it:
a block rather than a column, the chip stretched full width, and nothing threw.
`check-franchise` section 6 asks every era card for flex, a distinct rail colour, a
bar that fills its track and label rows that hold one line. Removing the second
class fails the flex claim.

### A division card lists the clubs in it TODAY

`divisionClubs` listed every code a division had ever held, so the NL East card
showed FLA beside MIA and MON beside WSN, and Detroit, Milwaukee and Houston each
sat on two cards. Reported by a player. It answers the rows that reach the latest
season in `DIVISIONS` now (read off the table, never typed), so the six cards
name the thirty clubs once each. **The draft is unchanged**: `inDivision` still
reaches every season the division really held, so the Florida Marlins and the
Expos are on the NL East wheel. Only the chips are current. `check-franchise`
asserts thirty, no franchise twice, every one a club playing today, and that the
old names are still drawable.

### More ways to play is a door on a phone and six tiles on a desktop

**On a phone** it is the second door: a filled card with a gold edge, a dot in each
mode's own colour and two modes named under it, read off `MODE_CARDS` in
`paintModesDoor()`. That is called from `boot()` because `MODE_CARDS` is a const
declared further down and a top-level read threw on load. `check-home` asserts at
every phone width that it outranks the three doors under it: a gold edge they lack,
a larger name, a caption on one line.

**On a desktop the front page is a bento**, chosen from three mocks. Everything under
the Draft button used to be full-width bars stacked on each other (the daily, More
ways to play, three door cards), which spent a wide screen on empty space and hid the
six modes behind a click. Now:

- the daily is the tall card on the left (`.hp-bento`, a 1:2 grid);
- the six modes are tiles beside it (`#hp-tiles`, built by `paintModeTiles()` from
  `MODE_CARDS`' `tile` and `line` fields, opened through `pickMode`, the sheet's own
  door), so a mode added to `MODE_CARDS` is a tile with nothing else to remember;
- the phone's door is not drawn (`#s-intro #b-modes{display:none}`);
- How to play, Leaderboard and Trophy case are one row of text links.

Each tile carries a baseball outline in its corner (the ring, both seams and their
stitches), drawn as a CSS mask over the tile's own colour so one drawing wears six
tints. The SVG inside the mask's data URI must percent-encode its double quotes:
left raw, the `"` closes `url("...")` early, the mask silently fails, and what draws
is a tinted square. The text sits at `z-index:1` so the ball stays behind it.

`check-home` section 3 asserts all four at five desktop sizes, and 3b presses the
Eras tile and waits for the decade picker. Hiding the door and the grid were each
reverted to prove the claims bite.

### The season screen is a scoreboard, and it is drawn from the season's own state

It was a record, a strip of 162 squares and a list of scores. It is now one
scoreboard card (the record, then win pace, streak, last ten and run differential,
then a race-to-October meter with the engine's own wild card and division lines on
it), a calendar of six month rows of 27, pause, speed and sim-to-end controls, and a
game log with each opponent's club chip, tags for a shutout, a rout and a one run
game, and milestones written where they happened (streaks, the wild card and
division wins, a hundred wins, out of the race, each month's record).

**`ssBoard` and `ssFeed` walk `RUN._simState` and keep no tally of their own**, so the
animated sim, a fast forward and a pause for a cut or a trade all show one season.
The log is rebuilt from the start of the season on every game rather than appended,
which is what lets a fast forward write the same milestones the slow sim would.

**They are ss-prefixed because the obvious names were taken.** The first draft called
them `paintBoard` and `paintFeed`, which are the leaderboard's and October's. A
function declared twice in this one-script page is not an error: the later one
replaces the earlier everywhere, so the leaderboard would have painted the season and
the live October game threw on every pitch. `check-labels` now fails on any function
declared twice in the page, and `check-run` reads the season screen the instant the
fast forward lands.

### Is $190M enough? Measured per mode, and the cap is not the lever

Asked because $190M over twelve is $15.8M a slot against football's $23.3M and the
college game's $1.8M. **Dollars a slot do not compare across games**, because each
game's price curve is its own. What compares is what a slot's share buys: here
$15.8M is 89% of every player-season in the pool and the median price of a 3 WAR
season ($14.3M). A 5 WAR season medians $24.5M and a 9 WAR one $52.7M, so a roster
holds a handful of stars and fills around them, which is the decision the draft is.

At $190M, 40 runs a cell, October rate for best-available / a spread drafter / a
chemistry chaser: Classic 68/70/85%, Eras 90/93/88%, One Franchise 98/95/100%,
Division 90/95/95%, All-Time Staff 78/68/85%, Trade Machine 53%. **Cap Survivor is the
one low mode**: 18% best-available, 68% spread, 20% chemistry, because the market
raises push a roster that spent the cap into cuts. Raising the cap lifts every mode
together (Classic best goes 30% at $170M, 68% at $190M, 78% at $210M, 90% at $230M)
and past about $230M holding money back stops paying at all. So the cap stays, and if
Cap Survivor needs help the dial is `E.MARKET` (the size of the raises), which moves
that mode alone.

### The desktop page is football's, and the two columns have to be the same length

Asked for: on desktop baseball should look like football, with the lineup card kept
where it is and the same length as the field beside it.

**The row used to step outside the column and the whole page widens now**, which is
`.wrap:has(#s-draft.on)`, football's own arrangement. A row wider than the page it
sits in gives the diamond and the board under it different left edges, so the screen
has two rulers on it: 1020px of field over a 640px column of tiles, which reads as a
panel pasted onto a phone layout. The board goes to three across at the same time,
because two 480px tiles on a 1440 monitor is the same complaint.

**STRETCH, AND THE FIELD PINNED.** The card is twelve rows of fixed height and the
field is an aspect ratio, so left alone they are different lengths. `align-items:
stretch` alone is not enough either: a block card grows and leaves the slack at the
bottom, so the card is a flex column and its rows share what the field's height
gives them. And the FIELD may not stretch: it is an aspect-ratio box, so a stretched
one takes the line's height instead and the diamond is drawn into a shape it was not
laid out for, `inset:0` SVG and all. `align-self:flex-start` is what makes the
stretch mean "the card matches the field" rather than "whichever is taller wins".

**The breakpoint is 1000 and it is arithmetic rather than football's 920.** The card
has a floor: a head and twelve rows at 30px is 411px and nothing makes it shorter.
For the field to reach 411 it needs 604px of width, and 604 plus the 18px gap plus a
340px card plus 28px of page padding is 990. Measured at 920 the field came out 363
against the card's 411, which is the same imbalance wearing the other hat. Under
1000 the page stays one column, where the diamond has the whole width.

Measured through the real page: 445px against 445px at 1440, 1100 and 1040, and 418
against 418 at exactly 1000.

**A `.dcols` grid sat in the stylesheet and was in no markup**, so it set the width
of nothing on any screen. Two columns is the wrong answer on this game anyway: the
lineup card already has the right hand side.

### The front page is one order, and the Draft button is on the first screen

```
node baseball/check-home.mjs      the order, the fold, the flank, the reel, at eleven widths
```

Asked for as "how do we design it better so it doesn't look cheap", and then "on
mobile it looks worse". Measured on a 390x844 phone, **the Draft button started at
865px**, under a 230px logo, a kicker, a tagline card and the field. So the one
control the page is for needed a scroll to find, and the page read as a poster with
a game somewhere under it. Nothing threw. Every piece rendered correctly.

**Both widths read the same order now**: the logo, the picture, the Draft button, one
line of tagline, the daily, More ways to play, and three doors. What differs is only
the STAGE, which is mythiball's clubhouse lesson: a phone stacks the two reels over
the field, and a desktop stands them either side of it (`display:contents` on the two
columns, fixed side widths so the picture takes the spare room). The markup IS the
order, so there is no CSS `order` left to drift and no default order to remember.

**THIS REVERSES TWO EARLIER CALLS, deliberately.** An earlier pass put the name UNDER
the picture as a caption, on the argument that a 62px wordmark spends the top of the
screen saying what the tab already says. That was right about a text wordmark and
wrong about the owner's logo, which is the most distinctive thing on the page and is
drawn small enough (210px across on a phone, 250 on a desktop, 130 on a short phone)
that it costs less than the kicker and tagline it replaced. And the daily used to LEAD
the desktop. It sits under the button on both widths now, because a page that opens
on two offers says neither.

**THE CLAIM IS THE FOLD.** `check-home` asserts the Draft button's bottom edge is
inside the window at 390x844, 360x740, 375x667, 320x568, 768x1024, 999x900 and every
desktop size it walks, including 1280x720. Short screens get a smaller logo and a
shorter field through `max-height` queries rather than a fixed field height. The old
page fails that claim at all eleven sizes, which is how the guard was proved.

**The header hides its own name on the front page and only there**
(`body:has(#s-intro.on) header .lockup`). Two names stacked 60px apart read as a page
that has not decided what it is called. It is `visibility` rather than `display`, so
the header keeps its height and nothing under it moves. The guard asks the same page
twice, with the front page on and off, because a rule that hid the name everywhere
would pass the first half and leave every draft nameless.

**A phone door takes the short word.** The three doors are a third of a phone each,
so "How to play" and "Trophy case" wrapped to two lines and "Leaderboard" ran edge to
edge. Each label carries both (`.hu-long` and `.hu-short`: Rules, Leaders, Trophies)
and the desktop block swaps them back. The guard asks for one line per door at every
phone width.

**`box()` in the guard answers NaN for a missing element, never null.** The first run
against the old page died on a TypeError at the first absent `.htag`, which reported
nothing. With NaN every comparison is false and the claim is named.

#### A reel is three rows, and that was six copies of one number

The desktop draws a bigger reel, and doing it turned up the reason it could not simply
be made taller. The strip lands its target `REEL_H` from the top of the box and the
band is centred at 50%, so **the two agree only while the box is exactly three rows
tall**. That was written out as a 114px height, a 38px band with a -19px offset, a
38px row, a 38px wash and a `REEL_H = 38` in the script: six numbers that have to
agree and nothing making them.

Move any one and the reel spins, eases and lands perfectly, and draws the highlight
around the row above or below the pick. **Nothing throws**, no value anywhere is
wrong, and the only symptom is a wheel lying about what it stopped on.

`--reel-h` is the one answer now. The height is `calc(var(--reel-h) * 3)` by
construction, the band and the wash derive from it, and `reelH()` reads it back off
the box, so a bigger desktop reel is one property. **The phone is unchanged at 38 and
the desktop is 64**, and the landed face sits 2px off its band at BOTH, which is the
box's own 2px border and is what the page read before any of this.

**The guard's first tolerance was a quarter of a row and was too loose to bite.** At
64px that is 16px, and a band written back as a hardcoded 38 lands 13px out: it slipped
through the offset claim and was caught only by the one about the band's height. The
tolerance is a few absolute pixels now, plus the claim no single reading can make: **the
offset must not grow with the row**, because a derivation error is a fraction of a row
and a border is not. Reintroduced, that defect now fails three assertions instead of one.

**The Draft button wears a gold ring and a tag reading START HERE · CLASSIC MODE**,
because beside the daily, the mode tiles and More ways to play the cream ball read as one
option among several rather than the front door. The tag lives in `.hp-go` outside the
button, because `.btn` clips, and takes no pointer. Its gold is fixed in both themes like the
hide, and the glow breathes on opacity alone.

**The daily card's label is a LABEL and not a second control.** The whole card has
always been the button, so the desktop's CTA is drawn inside it and `.dc-go` is the
only thing added. It names what the press does in each state, because the card opens
the draft on an open day and last night's result on a played one, and one sentence for
both would be wrong about one of them. The guard asserts the two differ and that the
card holds no nested control.

**Six defects were reintroduced one at a time** and each is caught by the assertions it
should be: a hardcoded band, a hardcoded row in the script, the reels made a grid again,
the desktop block leaking under its own breakpoint (16 failures), and one sentence for
both daily states. The redesign above removed CSS `order` altogether, so the default
order claim went with it.

#### And it made `check-theme` go red on a screen it never touched

`.tile` was on that file's list of five --edge borders, and **`.tile.hot` paints its own
green edge**: it is the chemistry mark, so a tile can only be hot once there is somebody
on the roster to have chemistry with. The file's own comment already says the `:not()`
are what keep these selectors off a coloured state, and names `.modecard`'s blue and
`.sbtn`'s gold. `.tile` was a third case nobody spotted.

**It stayed latent because unlike the other two its state is a coin flip on the draw.**
That section drafts twice, once per theme, and compares the first `.tile` of two
independent boards. Measured over 30 real drafts at that width, the first tile is hot on
**17%** of them, so the two arms are looking at different states about **one run in
four**. It went red on a front page change that never touched a tile, which is the repo's
own note about a band a sample cannot resolve, arriving at a selector instead of a
threshold. It is `.tile:not(.hot)` now. `.tile.off` is deliberately left in: an
unaffordable tile is still an --edge border, at a different alpha, and only the channels
are compared.

### Both themes

```
node baseball/check-theme.mjs
```

`runthegrid_theme` is the key the whole suite shares, so somebody who set dark on the
arcade arrives here dark, and the boot script runs BEFORE first paint or the page
flashes cream on the way in.

**A dark mode retrofitted onto a cream page fails silently, three ways.** A panel
nobody tokenised stays cream, and its dark text on it passes every contrast rule
there is. A hairline written `rgba(0,0,0,.10)` stops existing, at an alpha nobody can
tell from the panel behind it, so every card loses its edge. And an accent solved
against paper goes unreadable: `#1a5276` is a fine link on cream and 2.1:1 on
charcoal. None of the three throws.

**`--edge` carries CHANNELS and never an alpha.** `rgba(var(--edge),.08)` keeps every
one of the thirty-odd alphas exactly where it was set, so the light theme is byte for
byte what it was and one token flips sixty-one declarations. Written as a handful of
finished colours instead, a .02 tint and a .05 tint collapse into one and the light
page quietly changes under a dark-mode commit.

**Shadows are not on it**, because a shadow is an absence of light rather than a line
drawn on a surface, and flipping those puts a white glow around every card at night.

**TWO OVERLAYS HAD TO COME BACK OFF IT, and a screenshot is what said so.** The reel's
vignette darkens the top and bottom rows of a reel painted in the drawn CLUB'S colours,
so what is under it is not a surface the theme owns. Flipped white it became a veil,
and on a club with pale colours (Milwaukee's gold) the two rows either side of the
selection washed out to nothing. The field's mown stripes are the same case: shade on
grass, and the grass is green at night. The empty position disc's border is a third,
drawn against its own cream fill rather than against the page.

**Only surfaces and ink move.** The field's green, the dirt, the position colours and
the club plates are the SPORT rather than the theme, and inverting those is how a
themed page ends up lying about what it is showing.

**Nothing is repainted on the switch and nothing needs to be**: no code on this page
reads a colour back out of `getComputedStyle`. The one canvas is the share card and it
is built from literals on purpose, because an image somebody posts has to look the same
to everybody rather than like the theme the sharer happened to be in.

#### What the checker fails on is a REGRESSION, and that is the whole design of it

The light theme's accents predate all of this and several are under 4.5:1 on their own:
`--gold` is **2.40:1** on the page's cream, `--leather` 3.53 and `--green` 3.79.
Repainting the brand colour of a live game is a design decision rather than a side
effect of adding a night mode, so the file REPORTS those and does not fail on them. It
would be the easiest thing in the world to "fix" them into a check that passes and a
game that looks like somebody else's.

What it DOES fail on is an element that reads in light and stops reading in dark, and
an absolute floor of 3:1, which is unreadable in anybody's theme.

**Two quiet inks were moved, and that is a change to the light theme said out loud.**
`--dim` measured 4.44:1 on the page's own cream and `--dim-2` 2.93, so every eyebrow,
kicker and "x of 12" on the site was under the bar the arcade is already held to.
Solved against the three surfaces they land on: the page, a panel, and the daily card's
gold tint.

**The club plate picks its own ink.** It was `--tcon:#fff` for all fifty clubs and five
are light enough that white 9px type on them is not readable: Milwaukee's gold at
1.58:1, then Baltimore, Miami and both San Francisco codes between 2.9 and 4.2. A
club's colours are a fact about the club, so `inkOn()` is what gives. Neither theme
moves it, because the plate is the club's colour in both.

#### Three ways the checker was wrong before it was right

- **It read a gradient as opaque.** `linear-gradient(135deg,rgba(184,134,11,.10),
  rgba(184,134,11,.02))` averaged into a solid gold, so the daily card's gold eyebrow
  measured 1:1 against a fill that is really a 6% tint over the page. Four failures, in
  BOTH themes, all invented. This repo's fourth wrong extractor.
- **Its persistence test was measuring the harness.** `addInitScript` runs on every
  document, so the context that pinned the theme key re-pinned it during the reload and
  the page was reported losing a choice it had stored correctly.
- **Its coverage floor was measuring the reels.** The draft loop ends the moment the
  last signing lands and the reels then spin for as long as they spin, so a sleep left
  the walk looking at a screen with no tiles on it: 14 surfaces against the 26 that are
  really there. It waits for a board.

**And section 4 counted where it should have named.** Filtering every translucent
border on the page and asserting a total read 22 edges in dark and 4 in light and could
not say whether that was a missed swap or a slower draft. It asks five selectors by
name, so a selector that is not painted at all is its own failure rather than a smaller
number. The reel's band and the empty disc are correctly white in light and correctly
black in dark, which is exactly what a count cannot tell from a defect.

### The badge cabinet asked about none of the six modes

```
node baseball/check-badges.mjs           every badge, against real runs
node baseball/check-badges.mjs --quick   the CI run, and the strict one
node baseball/check-badges.mjs --list    what lit each badge
```

The catalogue was 36 and is **205**, across nine shelves. Every one of the original
36 ids survives, because a badge is DERIVED from stored rows and renaming one takes
it off everybody who has it.

**THE ROW ALREADY RECORDED SIX MODES AND NOT ONE BADGE ASKED ABOUT ANY OF THEM.**
Eras, One Franchise, Division, Salary Cap Survivor, All-Time Staff and The Trade
Machine have each been on the run row since the day that mode shipped, along with
cuts, trades, efficiency and the chemistry links, and the cabinet asked about none
of it. That is this game's own version of the dynasty leaderboard that rendered
perfectly and had no door: the data was there and the shelf was not. The daily was
the one mode the row did not record, so `rowFromRun` writes it.

**`MODES` names seven and Classic is DERIVED**, because a run that is none of the
six is the quick draft and a seventh flag would be a second copy of an answer. The
daily is deliberately not one of them: it is a Classic draft on a pinned seed, so
filing it as a mode of its own would take every daily out of the Classic count and
leave somebody who only plays the daily with an empty Classic shelf.

**The checker plays the game for real** through `run.js`, in all seven ways and six
ways of drafting, turns each finished season into the row the page files, and names
anything nothing lit. The hoops catalogue is why it exists, and **it found two
unearnable badges on the catalogue's first day**:

- A re-spin rung asking for FIVE of a thing `CONSTANTS.MAX_RESPINS` caps at three.
  The hoops mistake, made again, by the person writing the guard against it. The
  guard asks the TEST rather than the words now: a row that used every re-spin the
  game allows has to light every badge on that shelf.
- **The play streak sorted its day keys as TEXT.** `2026-1-2` sorts after
  `2026-1-19`, so every month was walked out of order and the count reset in the
  middle of it. Measured, **forty consecutive days of play reported a best streak
  of ten**, so "A month straight" had been unearnable since the file was written.
  Nothing threw, the number was plausible, and the only symptom was a streak that
  would not grow. Padded, the key also parses as ISO, so two of them are exactly 24
  hours apart rather than 23 on the day a clock goes forward.

**Three thresholds were measured rather than argued**, over 1,750 played seasons:

- `bargain_title` asked for a title under **$210M against a $170M cap**, so it was
  a second copy of "win the title" wearing gold. It was written when the cap was
  $245M. **$140M was the first replacement and no title in the pool reaches it**:
  the 26 title rosters spent a minimum of $147.8M and a median of $168.9M. It is
  $160M, which is about a fifth of titles.
- `one_franchise_8` is asked of an OPEN draft, because One Franchise fields twelve
  from one club by definition and the badge would have been gold for pressing a
  mode button.
- The chemistry shelf has no "all six" rung: the most any roster carried is four.

**--QUICK IS THE STRICT ONE, which is the opposite of what that flag usually
means.** The two excuse lists are a record of what a sweep REACHES, so they can only
be tuned to one sweep, and the full run reaches strictly more: pruning against it
would then fail the quick one, and that loop has no end. Reachability is hard on
both. The full sweep is three minutes and lights 194 of 205.

**The cabinet folds.** 205 drawn flat is a sheet about nine thousand pixels deep
whose first screen is the same on season one and season a hundred. What you earned
is open and what is left is one tap behind a line saying how much of it there is.
Measured at 390px on a six season career: 3,535px.

**`check-run` asserts what the fold is FOR, not a height.** It held the sheet under a
fixed 4,000px and that was a claim about the dice: each earned badge is an open tile of
about 68px, a first season lights 25 to 50 of them, and the sheet ran 2,800 to 4,388px
while everything that is not an earned tile sat at about 900px in every run. So it
failed on lucky seasons, on main, with nothing wrong. It asserts the LOCKED half (the
sheet minus the earned grids) costs under 1,200px, and the folded sheet is under a
third of the same sheet opened flat, measured in the same run (about 14,600px now).
The earned grids are the ones outside every fold: counted as "outside a shut fold",
forcing every fold open read the whole catalogue as earned and passed.

### A FRANCHISE OUTLIVES ITS CLUB CODE, and One Franchise offered the code

```
node baseball/check-franchise.mjs        the table, the lock, the chemistry, the picker
node baseball/check-franchise.mjs 40     a bigger draft sample
```

Reported by a player: the Marlins have played since 1993 and One Franchise offered
**2012 onward, fourteen seasons**. Baseball-Reference writes the code a club wore
THAT YEAR, so one continuous franchise arrives under several, and every reader of
`t` that compared codes was asking the wrong question.

**It is most of the league rather than one club.** What the picker promised against
what the franchise has actually played:

| | the card said | now |
|---|---|---|
| Marlins | 2012-2025, 14 | **1993-2025, 33** |
| Angels | **1961-2025, 25** | 1961-2025, 64 |
| Athletics | 1968-2024, 57 | **1902-2025, 111** |
| Braves, Dodgers, Giants, Twins, Yankees, Orioles | 1901/1958/1966 on | **the whole century** |
| Rays | 2008-2025, 18 | 1998-2025, 27 |
| Nationals | 2005-2024, 19 | 1969-2025, 52 |

**The Angels card was the one that read as nonsense**, and nobody had looked at it:
`LAA` is 1961-1964 AND 2005-2025 with `CAL` and `ANA` in between, so a span read off
the raw code printed **"1961-2025, 25 seasons"**, sixty-five years with forty of them
missing. Nothing threw, because a span and a count are two independent true facts
about one wrong grouping.

**AND THE QUIETER HALF REACHES EVERY MODE, not just this one.** The chemistry
franchise link asks whether two men played for the same club, written `a.t === b.t`.
So a 2011 Marlin and a 2013 Marlin were strangers, and a 1952 Boston Brave and a 1954
Milwaukee Brave were strangers. **A link that does not fire is a link nobody can see
the absence of.** Measured on a fixed set of 150 drafted rosters, the fix is worth
**+0.46 franchise links a roster and +0.0087 of net chemistry**, which on this game's
own scale (the cap was 0.15 then, about 21 wins) is **about +1.2 wins**. Recorded rather
than compensated: those links should always have fired, so it is a correction and not
a buff, and board rows filed before it sit very slightly low.

#### The years in the table are load-bearing, and two codes prove it

`FRANCHISES` is `[code, firstSeason, lastSeason]`, which is `DIVISIONS`' own shape,
because two codes in this data mean two different things at two different times:

- **`LAA` is the Angels twice**, 1961-1964 and 2005-2025. A lineage keyed on codes
  alone collapses the gap and claims the `CAL` and `ANA` years twice.
- **`BAL` is two unrelated clubs.** 1914-1915 is the **Federal League Baltimore
  Terrapins**, who folded; 1954 on is the Orioles, who are the St. Louis Browns
  moved. So the Orioles lineage starts at 1954 and the Terrapins belong to no
  franchise, which is the truth about them.

**ONLY A FRANCHISE THAT HAS WORN MORE THAN ONE CODE IS LISTED.** `franchiseOf` falls
back to the code itself, so the Cubs need no row and cannot drift from one.

**That fallback had a hole the guard found on its first run, and it is the sharper
half of the lesson.** Returning the bare code is right for the Cubs and wrong for
`BAL`, because `BAL` is *itself a franchise key*: the 1914 Terrapins resolved to
`'BAL'`, were filed under the Orioles' own card, and the picker counted them among
the Orioles' seasons. It returns a sentinel (`BAL*`) now, ONE bucket rather than one
per season, because the Terrapins really were a club for two years and their own two
seasons are team-mates. Caught as `the card says 110 seasons and the lock allows 109`,
which is exactly the size of defect nothing else here would ever report.

#### Thirty cards, and every earlier name is on one of them

**The picker is the thirty clubs playing today and nothing else.** An earlier identity
is not a card: the Boston Braves and the Milwaukee Braves are lines on the Atlanta
Braves, and the Montreal Expos are a line on the Washington Nationals. Asked for in
those words, and it is the right shape for two reasons the first version had to learn.

**A list a reader already has beats a list they have to be taught.** Thirty clubs is
a fact somebody brings with them, so the grid is scannable by a name they were already
looking for, and an era a club spent in another city is exactly where they would look
for it.

**The version it replaces printed a card per identity, and that needed a second line
to be readable at all**: two cards reading "Baltimore Orioles" (the 1901-02 club that
became the Yankees, and the Browns who became the Orioles) and two reading "Washington
Senators" (one became the Twins, one the Rangers). Four true names and two pairs a
reader cannot separate, solved by a `Now the ...` note under each. **Under thirty cards
the collision cannot happen**: the 1901 Orioles and both Senators are lines under the
club they became, and no two cards carry one name.

`inFranchise` is unchanged and still answers for a bare code, so a run locked on `BRO`
or `MON` is still a legal run that still drafts. What went is the DOOR to it, not the
mode, and the guard asserts that from both ends.

**The lineage note is what the franchise contains, in a middot list rather than a
sentence.** Written "the X, the Y and the Z" the Athletics' three earlier names are
three commas on a card two inches wide, which is where this repo's short-sentence rule
bites hardest, and the middot is what it already recommends for fields on one line.

**It lists only what the card can DRAW.** `franchiseCodes('BAL')` names `MLA`, the
1901 Milwaukee Brewers, and the pool holds nine of their rows: too thin to survive
`indexData`, so no board can ever land there and the note read `Earlier: MLA ·
St. Louis Browns`. The codes are collected off the team-seasons the card actually
holds, so it can never name a club a player cannot reach.

#### Three ways the card was measured wrong before it was measured right

**The whole picker is not one row.** The first height assertion asked that every card
match and failed at 80.1 to 113.2 on a correct page: a grid row stretches its own
cells, and a row of cards all carrying a two line note is legitimately taller than a
row carrying none. Asked per ROW, all 23 rows are uniform at 390px and all 15 at
1280px. The premium sheet's rule is about one row and had been copied a level up.

**`scrollWidth > clientWidth` CANNOT SEE AN ELLIPSIS.** The years line rendered
`1902-2025 · 111 seaso...` on screen while `scrollWidth` and `clientWidth` were both
147, because `text-overflow` paints inside the box and the box never reports itself
as overflowing. The check passed on 45 of 45 cards while every long-history card was
cutting the season count, **which is the number this whole fix exists to show**. Found
by taking a screenshot and looking at it, which is the fourth time on this game. What
is asked now is whether the text FITS: the same string measured in the same face with
no constraint, against the room the card gives it, plus the box's own `scrollHeight`
against `clientHeight`, which IS reliable for a line clamp because the clamp hides
whole lines and the box reports them.

**And that probe measured at 16px.** `getComputedStyle(el).font` serialises as the
empty string in Chromium unless every longhand is set, so the first version set
nothing, measured a 10.5px line as 152px wide in a 147px column, and failed four
cards that render perfectly. The longhands are set one at a time now. **A measurement
that silently falls back to a different size is worse than no measurement.**

**THE ARITHMETIC PASSED WHILE THE CARD READ "... Oakland...".** `need > avail *
lines` assumes perfect packing, and real wrapping breaks at spaces and leaves ragged
ends, so 409px over three 147px lines cleared the sum and clipped on the glass. That
is what the `scrollHeight` clause catches, and it is why the note is clamped at
**four**: measured rather than reasoned, on the Athletics, at the narrowest card the
grid draws. It costs height on that one card and a grid row stretches, so nothing
beside it moves.

**EVERY ONE OF THOSE NUMBERS IS THE FALLBACK FACE AND THAT IS THE SAFE DIRECTION.**
Google Fonts does not resolve in this sandbox (`document.fonts.size` is 0), so each
string is set in a face wider than the Archivo a visitor gets: a card that fits here
fits on a phone with room spare, and the converse does not follow. The years line
measured exactly 147px in a 147px column, on the seam, which is why it drew an
ellipsis in a screenshot and may well not on a real phone. **That is the reason
`.fran-yrs` WRAPS rather than being made to fit**: a line that wraps cannot hide the
season count in any face, which is not a claim this harness can make about a line
that truncates.

**`CURRENT_FRANCHISES` holds ATH and not OAK**, because the Athletics' current code is
what the franchise is keyed on, and Oakland is now an earlier identity of it the way
Kansas City and Philadelphia are. **It lives in `engine.js` beside `FRANCHISES` and not
in the page**, because the same question decides which card is drawn and whether a
lineage is complete, and a copy in the page is what the first version had.

#### A card is a name, a span and a best player, and nothing else

The first version carried a depth bar and a season count. **The count is arithmetic on
the span** ("1961-2025" and "64 seasons" are one fact written twice) and the bar is a
fifth thing on a card two inches wide, competing with the one line a reader is actually
choosing on. Asked for as three lines and one colour, and a card is now the club, the
years, the earlier names if there are any, and who its best player was.

**One colour, not two.** `--c1` alone paints the rail, because two club colours on a
30px strip is a flag rather than a marker, and the name beside it is what says which
club it is.

**`.fran-yrs` and `.fran-best` WRAP rather than truncate.** See the ellipsis note
below: a line that wraps cannot hide half of itself in any face, which is not a claim
this harness can make about a line that truncates. It cost a row of height on the
longest names and a grid row stretches, so nothing beside them moves.

#### What the guard asserts, and the one that had teeth and no voice

Every claim is a PROPERTY of the table against the data rather than a number typed
beside it: no season claimed twice, no code in two franchises, spans that never
overlap, and **the card's span equals what the lock actually allows**, because the
picker counts seasons one way and `drawable` filters them another and those are two
answers to one question.

**Section 2 exists because a table that agreed with the raw codes would pass
everything else and fix nothing.** It measures how many franchises are wider than
their own code and names the Marlins by hand, which is `check-numbers`' coverage
argument arriving at a lineage.

**`drawable` is exported for it.** Driven through `spin` instead, the answer is one
seeded sample, and a season a mode can reach is indistinguishable from one it happened
not to draw.

**Eight defects were reintroduced one at a time** and each is named: the raw-code
chemistry (4 failures, including a Terrapin linked to an Oriole), the raw-code lock
(`a Marlins run cannot reach a single season before 2012`), the Terrapins folded back
in, overlapping Angels spans, an Orioles lineage reaching back over the Terrapins, the
Marlins lineage deleted, the identity cards restored (`Oakland Athletics is in the
picker and is not a club playing today`), and one lineage row dropped.

**That last one is the clause that closes the thirty-card rule**, and it needed asking
from the POOL's side rather than the card's. Written as "every past name appears on
some card", dropping `['MLN', 1953, 1965]` from the Braves takes the Milwaukee Braves
off the card AND out of the check, so it passes on the exact defect it exists for. What
is asked instead is that no club deep enough to have had a card of its own belongs to
nothing: reintroduced, it reports `Milwaukee Braves (MLN, 13 seasons)` by name.

**That last one passed on the first attempt and it is worth recognising.** Written to
assume the row exists, deleting it crashed the file with a `TypeError`, and read
through a grep for FAIL **the run looked clean**. That is `check_lahman.py`'s own note
arriving here: an arm that cannot express the defect reports nothing rather than
failing. The helper falls back to the bare code now, and deleting the Marlins lineage
fails six assertions by name.

#### The Eras pool

**The Eras side was measured and is not missing anything.** All thirteen decades are
offered and every one is deep: the thinnest is the 1900s at 102 team-seasons, 17 clubs
and 1,291 men. What the lineage fixes for Eras is the chemistry, not the pool.

### No stock bars, no emoji, and the season waits for you

Asked for by the owner in one pass, with the trophy case and the bracket.

- **A primary action is the baseball button** (`.btn.ball`, seams and a `<span>` label):
  Play the season, Sim to end, Play ball, Share result and Share today's result. A
  share's "Copied" writes into that `<span>`, never over `innerHTML`, or the seams go.
- **Secondary actions are tiles, not full width outlines.** The results screen's Watch
  October, Run it back and Trophy case are one `.acts` row of `.act` tiles with a
  drawn mark each. `.act[hidden]` carries its own `display:none`, which is the
  `[hidden]` pair again, and check-run still reads Watch October off getComputedStyle.
- **The chemistry bolt and the streak flame are drawn** (`ICO_BOLT`, `ICO_FLAME`),
  in the colour of the text they sit in. An emoji is the reader's phone's drawing.
- **The regular season ends on a button** (`#b-season-go`: On to October, or See how
  it went). It used to move on 1.5 seconds after the last out, which took away the
  one screen that tells the story of the 162. Every walker presses it.
- **The draft grade is gone.** The results cells are team rating, the season's place
  on its own board (which used to be a line in the hero), and the all-time rank. The
  Trade Machine's deals and their WAR moved into the subtitle.

**The bracket drew no winner for a series you lost.** `colGames()` built a fresh
object for the seat across from you on every call, `settleMine()` stored the club
that beat you as the result, and the page marks a winner by asking whether a seat IS
the result. So your lost series showed neither side winning and no score, while that
club carried on into the next column. The seat is one object per column now
(`B.oppSeats`), and check-bracket asserts the winner is one of the two seats by
identity: 106 failures with the old engine.

**A bye is not a matchup**: the two bye boxes are dashed and each seat reads Bye.

**The trophy case shelves are cards with the shelf drawn small.** Folded to "15
still to earn" a new account met nine lines of grey text and no badge anywhere. Each
shelf shows its progress and a strip of its badges, rim in their tier, and a new
account's first shelf is open.

### A run in progress survives leaving the page

```
node baseball/check-resume.mjs     the banner asks and saves, and resuming is the same board
```

Asked for by the owner: pressing the banner during a game should ask first, and must
not lose an active draft. Both banner links (`.lockup` and the RunThe.GG pill) leave
the page, so during a run they `confirm()` first and save.

**The save is `rtd_run_v1`, the run as it stood, and it belongs to the account (or
guest) that made it.** It is written after every board (`nextSpin`), on every squad
paint, and on `pagehide` and on the page going hidden, so a closed tab or a reload is
covered as well as the banner. The front page offers it back (`#resume-card`).

**THE BOARD ON SCREEN IS PART OF THE SAVE**, and resuming paints that board rather than
spinning (`nextSpin(RUN.currentDraw)`). A resume that spun again would make leaving the
page a free re-spin. `check-resume` proves it by reintroducing the spin.

**The live season is never saved**, because its random stream is a closure. Once the
first game is played the save stays the squad screen's, and a run is seeded, so coming
back replays the SAME season with the same results. The banner says so when you leave
mid-season. A finished run removes the save in `recordRun` (check-run asserts it), and
so does quitting. Starting a new run over a saved one asks first, before any daily
meter is charged (`okToReplace`).

### The squad screen is a batting order and a staff, and Pro can move them

```
node baseball/check-lineup.mjs     the coach's order costs nothing, nothing beats it, and the page
```

Asked for by the owner: after the draft, all twelve read as a batting order and then
the staff, set strategically for the player, and Pro can move men around before the
season. `lineupList` in the page draws it on the squad screen and the results screen.

**The coach's order is the season's BASELINE, so no balance number moved.**
`LINEUP_WEIGHT` in `engine.js` is what a lineup spot is worth (The Book's reading: the
two best bats hit second and first, the next cleanup, then third and fifth) and it
averages exactly one. `coachOrder` puts the best bats in the heaviest spots, which is
the most any order gets out of these nine, and `orderLoss` charges a different order
what it gives up against that. A run nobody reordered plays exactly the season it
always did. **A different order never pays more**, so moving a man is a choice with a
visible price rather than a way for Pro to buy runs on a leaderboard. Measured: a
reversed order costs about 1.3 wins, a random one about 0.6. `check-lineup` holds
"nothing beats it" by exhaustion over all 362,880 orders of one nine, because asking
`coachOrder` whether `coachOrder` is optimal is asking a function whether it agrees
with itself.

**`run.batOrder` holds ROSTER INDICES and null means the coach's.** A cut or a trade
puts the new man at the same index, so a custom order keeps its spot for whoever
replaces him, and a run on the coach's order is re-ordered by the coach for free.
`R.tagged(run)` is the one roster the season reads, carrying each man's slot and each
hitter's `_bat`; the season, the squad screen and October's at-bat games all read it.

**The arms swap inside a group only** (`canSwapArms`): SP1 with SP2, and in All-Time
Staff inside the rotation or the pen. The closer is its own job because the sim reads
that slot by name for the save rate. Both groups are averaged into the season, so a
swap moves nothing the season reads, only who starts which October game. The coach
sets the rotation at the end of the draft too (`coachArms`, better arm at SP1).

**It can be changed from the end of the draft until the first pitch** (`canReorder`),
and only by Pro. A free account reads the order and a line saying Pro moves it.

### Run The Diamond Pro, and one free play of each mode a day

```
node baseball/check-pro.mjs          the gate, the sheet and the checkout, in a browser
psql -d rtd_pro -f supabase/test/baseball_pro_base.sql
psql -d rtd_pro -f supabase/101_premium_bundles.sql
psql -d rtd_pro -f supabase/121_baseball_pro.sql
psql -d rtd_pro -f supabase/122_baseball_pro_per_mode.sql
psql -d rtd_pro -f supabase/test/baseball_pro_test.sql
```

Asked for by the owner: the six extra modes (Eras, One Franchise, Division, Cap
Survivor, All-Time Pitching Staff, Trade Machine) get **one free start each per
Eastern day**, and **Pro** removes the limit for **$14.99 a year**. Classic and the daily
are never counted and never sold. The Stripe steps are in
`functions/api/stripe/README.md`.

#### It was $9.99 once and is now a yearly subscription

**Run The Floor Pro (basketball) is $14.99 a year too**, the owner's call (2026-10),
made before it ever went on sale (it was planned at $9.99 once). The catalog row carries
`recurring: true`, so it takes exactly the path below, and the Pro sheet in
`hoops/modes-ui.js` writes `PRO_PRICE` with `PRO_TERM` and offers Manage billing to an
owner. The Large Bucket in Run The Tour is an unrelated $9.99.

```
node scripts/stripe/check-recurring.mjs   the checkout and webhook, driven, no network
```

The owner moved the Stripe Price to $14.99 recurring yearly (2026-09), which the code
could not sell: a recurring Price in payment mode is refused by Stripe outright, so the
first press of Get Pro after the env var moved would have failed. `recurring: true` on
the `diamond-pro` catalog row now opens the checkout in subscription mode, with the
bundle key on the subscription's own metadata, because a renewal event carries the
subscription and nothing else.

**The grant is still ONE `premium_unlocks` row, now with an end date**, and that is why
no reader changed: `premium_products()` and `rtd_mode_spend` already honoured
`expires_at`. `grantRecurring` in the webhook sets it from the subscription: the paid
period's end plus three days of grace, a week on `past_due` (the period has already moved
forward, so honouring it would hand a failed card a year), and now for anything dead. A
cancellation at period end stays `active` until then, so it needs no case of its own.

Four things it must never do, each asserted by driving the real files:

- **Write the `subscriptions` table.** It holds ONE row a user and it is the Arcade
  Card's, so a baseball renewal there would overwrite somebody's membership. Removing
  the routing fails six claims.
- **Trust event order.** Every subscription event is read back from Stripe before it is
  written, or a stale "active" landing after "deleted" hands back a year. Removing the
  read-back fails three.
- **Give a row with no end date an end.** The old $9.99 buyers and comps own Pro for
  good, and checkout refuses to sell them a year.
- **Refuse a lapsed subscriber.** Checkout counts only a RUNNING recurring grant as
  owning it; the row outlives its end as the record.

**The price is written once in the page**, `PRO_PRICE` with `PRO_TERM` (" a year")
beside it wherever it is shown, because a price with no term on a subscription reads
as once. Subscribers get **Manage billing**, which opens the Stripe Customer Portal;
`portal.js` allows `/baseball/` as a return path.

**The rule went per mode, then shared, then per mode again, and 122 is the last move.**
121 shipped and was deployed with one token a day shared by all six, keyed on
(user, day). The owner then asked for one of EACH, so `122_baseball_pro_per_mode.sql`
widens the key to (user, mode, day) and nothing else: `rtd_mode_spend` counts the row
its insert wrote, so the key IS the rule. 121's header still describes the shared token
because that is what it deployed. Preflight row 33 asks for the wider key, and the SQL
test fails on a database that has 121 without 122.

**THE RULE IS SAID BEFORE THE FIRST PRESS.** It used to be said only by the refusal, so a
player learned "one a day" by losing their play. The modes sheet opens on a box stating it, with
the reset time and the Pro link, and every unplayed mode wears `1 free today` (the old `New`
sticker is gone to make room). A played one says `Played today` and when it comes back. The
desktop tiles carry the same chip, and `check-pro` asserts all three.

**IT IS THE ONE PRODUCT THAT BELONGS TO ONE GAME, and the rule it bends is kept.** The
store section above says never to build a price or an unlock for one game, and the
reason is a second payment path. `diamond-pro` is a row in `_bundles.js`, sold through
the same `checkout-bundle.js` and granted by the same webhook, so there is still one way
money reaches the site. It is NOT in Run The Bundle, because that changes what the
$34.99 contains and what its "$80 of value" adds up to.

**What is counted is a START**, and `startRun` and `startTrade` are the one door
(`modeBegin`), so Run it back and the result screen's mode doors are gated by the same
line. `pickMode` asks too, **before** a picker opens, because choosing a decade and being
refused at the end of it is a wall with a picker in front.

**Two ledgers.** A signed in account is counted by `rtd_mode_spend` (121), keyed on
`auth.uid()`, so clearing site data or changing phones gives nothing back. A guest has no
account and is counted on the device (`rtd_modeplays_v1`, keyed by who is playing so a
second account on one browser is not refused over the first one's day). **It fails open**:
no server, or a database without 121, lets the run through on the device's word. A Pro
account is never written to the ledger at all.

**`verify-bundles.mjs` reads the LAST definition of `premium_unlocks_product_ck`**, in
numeric migration order, because 121 drops and re-adds it. A text sort puts `99_` after
`121_`, and reading 101 alone would hold the catalog to a list that no longer exists.

**The Pro sheet's X and backdrop were dead on the first draft**, because they are static
markup and only the buttons built inside the sheet were wired. The walk caught it as the
Classic button being unclickable under a sheet that would not close.

### The draft button IS a baseball, and the one light surface allowed at night

Asked for with two screenshots: drop the ball emoji either side of the words, and
make the whole control look like the ball rather than like a brown bar standing
next to one. It is a close crop of a baseball now: hide, a seam sweeping in from
each end, and the label in the red the laces are.

**The stitches are a MIRROR PAIR ACROSS THE SEAM, never a copy**, and getting that
wrong is what the first render looked like. Each stitch leaves the gutter pointing
outward and leans along the curve (`rot(n*side, -LEAN*side)`), so a pair meets as a
shallow chevron. Leaned the same way (`+LEAN*side`) one row comes out nearly
parallel to the seam and the picture stops being a baseball at all, which is
obvious on screen and invisible in the source.

**THE SEAM IS NEAR-VERTICAL AND CHUNKY, AND IT IS THE THIRD SHAPE IT HAS WORN.**
The history is the warning, because both earlier shapes were reported by the
player inside a day of shipping:

| | what it was | what it read as |
|---|---|---|
| first | a tight bow hugging each end | a pale bar with a decoration at each corner |
| second | the same bow STRETCHED 2.1x inward | a pair of thin clipped wings |
| ships | a rebuild: gentle near-vertical seam, laces at 5.5 of a 100 viewBox | the reference photo |

**The stretch made it worse and the reason is worth keeping.** Spreading the same
stitches over a longer, flatter arc thinned the look, clipping the bow's ends at
the button's edge left an open V, and the laces rendered at **1.7px**. What the
reference photo actually has is neither of the first two: a seam spanning the full
height almost straight, laces thick enough to count, standing INSIDE the ball with
leather on both sides. When a drawing reads wrong, rebuild it to the reference
rather than stretching the last attempt again.

**The strip is one button-height square and its POSITION is a share of the
button** (2%, 1% under 360, 4% from 600), so the seam scales with the ball, never
with the width: a wider button shows more leather between the same two seams,
which is what a wider crop of a ball is. Ink to label in the FALLBACK face, which
is wider than the Bebas a visitor gets: about 35px a side at 358 and about 4px at
320, which is an iPhone SE rather than a hypothetical and is why the narrowest
phones pull the seam back a point.

**Four geometries were rendered and looked at in each round**, which is the only
way this has ever been settled here. Round one: one arc bulging inward reads as a
ball, arcs converging at the outer edge read as nothing, converging inward reads
as an ARROW, two shallow arcs read as tyre tread. Round two: near-vertical chunky
is the photo, the same seam finer reads wispy, and the bulge's direction is
indistinguishable at this size.

**One symbol, `<use>`d four times and mirrored in CSS.** Two buttons carry it (the
front page and the first-time guide) at two ends each, and the stitch path is about
a kilobyte, so a second copy for the right hand seam is a second copy of a drawing
that would drift the first time either was retouched. Same rule as mythiball's
repeated poses.

**The corduroy came back**, which is the hoops floor's own note arriving here. The
hide's grain shipped at `.045` over a 3px pitch and the button read as cloth: one
repeating gradient at one period is found by the eye in about a second. It is `.02`
over 7px.

#### The hide does not flip, and that is asserted rather than excused

A baseball is white under lights and white in the afternoon, so it belongs with the
field's green and the club plates on the list of things that are the SPORT rather
than the page. So it is the **one light surface allowed in the dark theme**, and
`check-theme.mjs`'s section 2 excuses it by name.

**An exemption on its own is a hole**, so section 4 carries the other half: the
button's painted `background-color` and `color` have to be the SAME in both themes.
That pair is what tells a deliberate sport colour from a panel nobody tokenised,
which would be light in both places for no reason anybody wrote down. It is read
off the BUTTON and not off `:root`, which is that section's own argument about
`--edge` applied to the pair that must not flip.

**`background:` resets `background-color` to transparent**, so the shorthand is
followed by an opaque `background-color:var(--hide)`. Without it the label's real
backdrop is whatever is behind the button and every contrast probe measures the
page instead of the hide.

#### Two reds, because the checker was pessimistic and right anyway

The label came back **4.49:1**, a hundredth under the bar, on the one control the
whole front page is for. `bgOf` composites a gradient by AVERAGING its `rgba()`
stops, so it modelled the vignette that darkens the ball's ENDS as if it were under
the label in the MIDDLE, where the real backdrop is the flat hide at 6.89:1. The
probe is pessimistic rather than wrong, and arguing the point was not worth it: the
reference photo's text is a deeper brick than the thread anyway.

So `--lace` is the waxed thread, which on a real ball is bright, and `--lace-ink`
is the label, which has to be read rather than admired. `#8a1626` measures 8.23:1
on the hide and clears the probe's own model at about 5.4.

#### Two handles for the seam's ink are wrong, and the guard tried both

`check-home.mjs` asserts the seams never touch the label and are still a ball, at
every width it already walks. Getting at the drawing took three attempts:

- **The `<svg>` BOX is 111px where the drawing inside it is 50.** The arc tops out
  about two thirds across its own box, so measuring the box reports a collision
  that is not there: it failed at 320, 360 and 390 on a page with nothing wrong.
- **`getBoundingClientRect()` on the `<use>` answers 23.3px** in a place the ink is
  50.5 wide. Chromium is not reporting the referenced geometry there, and a guard
  built on it certified a ball at a fifth of its real size.
- **`getBBox()` on the path inside the `<symbol>` works**, even though a symbol
  never renders, and it reads the SHIPPED drawing rather than a second copy of the
  numbers that generated it.

**The "still a ball" claim has been rewritten TWICE and the second rewrite is the
lesson.** The first draft asked ink width over button WIDTH and failed on a correct
desktop, because a wider crop legitimately shows more leather. The second asked
ink width over button HEIGHT, and the rebuild broke it on a correct page: the
photo's seam is deliberately NARROW and bold, so a width test cannot tell the good
shape from the bad ones at all.

**THE DISCRIMINATOR IS THE RENDERED STROKE.** Both bad states this button actually
shipped read **1.7px** on the guard's model (and the letterboxed one drew thinner
still on screen); the rebuild draws at **2.9 and up**, scaling with the button. The
claim is `lace > 2.3`, the middle of that gap, plus a backstop that the seam still
sweeps the button's full height. Proved by restoring the previous commit's page
whole: the guard names it at every width as `stroke 1.7px`.

**The 2.1 era also carried a quiet SVG fault the guard's numbers exposed.** The
symbol's viewBox went to 210x100 while the four `<use>` instances kept
`viewBox="0 0 100 100"`, so the widened drawing was letterboxed inside the old
frame, which is part of why the stretch rendered small and thin. Two viewBoxes
describing one drawing are the `?v=` pair's problem in SVG: nothing throws, and
the only symptom is art that looks wrong. They are the same 100x100 now.

### The logo is the owner's artwork, and the icon is its ball redrawn as pixels

```
python3 baseball/build/logo.py    the logo, cut off its cream stock
node baseball/build/icons.mjs     every icon size, the header mark and the share card mark
```

The home page's title is the owner's logo (`build/logo-source.webp`, kept as
supplied). It sits inside the `h1` with the name as its alt text, so crawlers and
screen readers still read the title in words. It replaced a cut diamond mark that
lasted a day.

**The stock is removed by a flood fill from the border**, because the page shows
the logo on cream AND on the dark theme's charcoal. The fill takes every pale,
low-saturation pixel connected to the edge. It cannot reach inside the sign or
the ball, because both are closed by a dark outline. **It ships as WebP**: 40KB
against 294KB as a PNG, and the artwork is soft painted pixels, so lossy costs
nothing visible.

**The icon is the ball on top of the logo, REDRAWN, not cropped.** The artwork's
pixels sit on no fixed grid, so a crop resampled to 32px or 192px is mush. The
ball in `icons.mjs` is drawn cell by cell on an odd grid (25 cells, with a
two-cell outline like the logo's), and every size is a whole number of pixels
per cell. **The favicon is a different drawing**: 15 cells with plain seams,
because the zigzag stitches smear at 16px.

**The header mark is 26px** so each of its 26 cells (the ball plus its shadow)
lands on exactly 2 or 3 device pixels. The share card draws `mark-256.png` rather
than the SVG, because a canvas that draws an SVG image can refuse to export.

**Five version pins moved together**: the icons and the manifest to `v=3`,
`mark.svg` and `mark-256.png` to `v=2`, and `og.png` to `v=4`, because the card
carries the mark and was re-rendered.

### The share card had no source and no builder, and was set in a fallback

```
(nohup python3 -m http.server 8080 &) ; node baseball/build/og.mjs
```

`baseball/og.png` is the most public thing this game produces: it is what a chat app
draws when somebody pastes a link, and for most people it is the only part of the game
they will ever see. **It shipped with no source file and no builder anywhere in the
repo**, so nobody could re-render it, a cap or a season range moving on it meant
redrawing it by hand, and it was plainly set in a FALLBACK face. That last one is this
repo's own note about measuring type in a headless browser, baked into an image.

**It was also the light page photographed**, which is a picture that cannot argue back:
cream stock, so in a dark thread it arrived as a bright rectangle with the contrast of a
receipt. It is the game's own DARK theme now, which is a real palette this page already
ships rather than a mood invented for a card. `--gold`, `--green` and `--ink` come off
that theme, already lifted until each clears the charcoal. The light theme's green is
`#2e7d32`, which is a tagline nobody can read on this.

**The faces are the page's three and there is no Anton.** Bebas Neue sets the headline
and the pill labels, Bitter the one line of prose, Archivo the wordmark and the footnote.
Anton is the football and basketball cards' face and on this card it would say the wrong
sport.

**Two things were rendered, looked at, and taken back out**, which is why they are
written down rather than silently absent:

- **A 22px blur on the end of the extrude smudged it.** At 158px the soft edge spreads
  under the letter and the whole headline reads slightly out of focus, which is the one
  thing a share card cannot be. The stack is hard the whole way down now, with a single
  tight blur doing nothing but seating the letters on the stock.
- **Seam arcs do not read as stitching at any opacity that is also visible.** Close in,
  one sweeps across the middle and reads as a scratch on the image; far out, the
  curvature is so slight that what is left is a straight diagonal through a corner and
  reads as a rendering artefact. Do not add them back without rendering the result and
  looking at it.

#### A number on a picture can never be interpolated, so the builder refuses

The card names the cap, the roster size and the season range, and once rendered it is a
picture: a cap that moves leaves it promising a figure the game does not charge, with no
reader who can tell and no page to correct. So the builder reads its own rendered text
and holds all three to `E.CONSTANTS.CAP_MUSD`, `E.SLOTS.length` and the min and max
season in `data/players.json`. The range is read off the pool rather than pinned, because
the annual refresh adds a season and this card cannot notice on its own.

**`check-numbers.mjs` WAS THE OBVIOUS HOME AND IS VACUOUS HERE.** Put on that file's
`PAGES` list, `og-source.html` contributed **zero** claims and the total stayed at 34:
`copyOf()` filters through `isCopy()`, which wants three words, and the card says
`$170M cap`, which is two. **A page on a list reading nothing is worse than no page at
all**, because the list then looks like coverage. A check at the point of PRODUCTION
cannot be vacuous, so it lives in the builder, and all three were proved by mutation.

#### And the version on the image is one number in four places

`og.png` is an asset with a hand-written `?v=`, which is exactly the class
`scripts/check-cachebust.mjs` exists for, and **that file cannot see this one**: it reads
a `<script src>`, a module import and a `fetch` of a `.json`, and this is a `<meta>` tag.
Two pages carry it, twice each (`og:image` and `twitter:image`), and nothing held the
four together.

**They came apart inside one edit.** Bumping the card to `v=2` on `index.html` left
`how-to-play.html` asking for `v=1` of a file that had just been rewritten, so the two
pages pointed at one image under two names and a scraper that had seen either one went
on serving the old card out of its own cache. Nothing throws. The only symptom is a share
preview a version behind, on whichever of the two pages somebody happened to paste.

The builder holds the four in step, and what it asks is that they AGREE. **That the
number MOVED when the bytes did is not knowable there**: the pages are edited by hand
either side of the run, so there is no earlier version to compare against, and inventing
a record beside `cachebust.json` would be a second copy of an answer.

**The same drift is live elsewhere on the site and is NOT fixed here.**
`assets/runthegames-og_1200x630.png` is asked for at `?v=4` by the homepage, `about.html`
and `ideas/`, and at `?v=3` by `disclaimer.html`. 35 pages across the site version an
`og:image` by hand and nothing checks any of them.

### Every mode was PLAYED, and the dark board's names were black

A pass that drove all eight modes through the real page and looked at the
screens. What it found, every item silent:

**A BUTTON DOES NOT INHERIT THE PAGE'S INK.** The UA sheet gives it
`buttontext`, black in both themes, so every button-built card that declared no
color of its own shipped black text on the dark theme's charcoal: the draft
tile's name and price, the chooser's slot labels, the franchise cards. Reported
by a player from the live dark board. `button{color:inherit}` is the reset;
every control that declares a color still wins.

**AND CHECK-THEME WAS GREEN THE WHOLE TIME, because its draft helper finishes
the draft.** Section 3 probed the front page and then after `draft(page, 12)`,
and a full twelve hands off to the squad screen, so the BOARD's text was
collected on no run ever: the probe read the screens either side of the one the
defect was on. It probes mid-draft now, while the board exists to be read.
Proved by reverting the reset: two claims fail. Three more dark finds came out
of the widened probe: the WAR temperature rungs were light-theme literals (the
blue "useful" rung was #1a5276, the exact hex the dark token block calls
unreadable, so it drew DIMMER than the grey filler under it and the scale
inverted), the active filter chips borrowed LIFTED accents as fills under white
type (the dark theme lifts accents for ink duty, so the chip got brighter as
the page got darker: dark grads now), and the sticky draft header faded through
a cream literal at night (`--bg-fade` carries the theme's own bg at alpha
zero).

**CUTTING A PLAYER BOUGHT CHEMISTRY.** Every replacement body carries `t:'FA'`
and the cut man's season, so two of them read as the same franchise and often
the same season: a Cap Survivor that cut seven measured **62 of its 66 links
BETWEEN replacements** ("1985 FA reunion"), saturated the +15% cap, printed
"Great clubhouse chemistry" and "+20.8 wins from chemistry" over a roster of
scrubs, and lit five chemistry badges for the cutting. `pairLinks` answers []
when either side is `_repl` now: the seven-cut fixture reads 1.0187 against
1.1499 and an all-real roster is identical. The full badge sweep still lights
its recorded 194 of 205, so the catalogue lost nothing. **Cap Survivor board
rows filed before this sit high**, the honest direction.

**WATCH OCTOBER THREW ON EVERY MISSED RUN.** `.btn` sets display, so the
`hidden` the results screen writes never took (the football file's `[hidden]`
pair, an eighth time): every missed-playoffs run drew the button and pressing
it threw on the bracket that does not exist (`null.rounds`), which reads as a
button that does nothing on the game's most common ending. `.btn[hidden]` is
the rule and `check-run` asserts the pairing off getComputedStyle, in whichever
direction the run it played came out, so it is never vacuous.

Smaller, each verified: a scarce tag beside a three-digit price pushed the
price 35.8px past the tile's edge (the tag ellipsizes now, the price never
gives); the modes sheet said "44 franchises" one screen from the picker whose
interpolated count says 30 (the sentence carries no number now); All-Time
Staff drew an empty archetype capsule on the coach's take (hidden, and legal
because .ro-arch declares no display); the cut sheet's 46vh list is EXACTLY
nine 43px rows on an 844 phone, so three of twelve candidates hid below a
clean edge (a sticky scroll shade now, toggled off the real scroll state, and
NOT a mask or inset shadow: a mask fades cream rows toward a cream sheet,
eight channel points, measured invisible, and an inset shadow paints under
opaque children); and the daily's results screen and share never said DAILY,
on the one mode built around everybody playing the same board (hero sub, share
tag and its own dare now, which is the hoops card's lesson).

**check-theme's section 2 has a second sport-colour exemption**: the landed
reel is painted in the drawn CLUB's published colours, so a draw that lands a
light club (Milwaukee's gold) read as a light surface about one run in
several. `clubbed` and the reel's `wash` are excused by name, like `.ball`.

### And then the seven things the playtest only recommended

The pass above fixed what was broken. These are the seven it wrote down and left
for a decision, taken in one go.

**THE RIBBON WAS CROWNING SEASONS THAT LOST.** `allTimeRank` ranks the ROSTER's
rating against 2,594 real team-seasons and knows nothing about how the season
went, so the gold band at the top of the results hero read "97th-GREATEST TEAM OF
ALL TIME" over 73-89, and on a title run it hung a 101st-place ribbon ABOVE WORLD
SERIES CHAMPIONS, louder than the verdict it was undercutting. It was also a
second copy of the rank cell three rows below it. It shows now only on a **top-100
roster that reached October**, which is the badge catalogue's own band plus the
thing that says the season backed the roster up. Every rank still shows, in its
labelled cell. Proved in both directions in one afternoon: shown on a 98-64 run at
#54, hidden on 87-75 and on 76-86.

**AND THEN THE RIBBON WENT ALTOGETHER, because the rank under it is not a claim
about being great.** It compares twelve star seasons, on paper, against real clubs'
own men, so it is cheap: over 150 drafts a greedy bot lands in the top 100 on 93 and
in the top 10 on 34. A gate at "top 100 and reached October" was therefore shown on
almost every playoff run. A player read "8TH-GREATEST TEAM OF ALL TIME" and a cell
labelled "All-time rank" that tapped through to the leaderboard, where they were 74th,
and called it false. They were right. The ribbon and `crownedRank` are gone from the
screen and the share card. The cell reads `Of 2,717 real MLB teams` (the count comes
from `ratingTable`), opens nothing, and every other surface (the board row, the daily
share, the badges, both how-to pages) says "vs real MLB teams" rather than "all time".
`check-run` section 0 fails on any of those coming back.

**RUN IT BACK NOW REPLAYS THE MODE IT WAS RUN IN.** It said "Draft again" and went
to the front page, whose button is Classic whatever was just played, so the one
control on that screen for doing it again quietly took the mode away. **The daily
is the exception and the button says so** rather than faking it: the board is
pinned to the day, so what it offers is the same draft unpinned. Under it are the
**other six modes**, Classic included, because Classic is on no card and the front
page's button was its only door. The mode just played is left out: Run it back
directly above IS that button.

**THE TRADE MACHINE WAS WEARING A DRAFTED MODE'S CLOTHES.** Its grade cell read
"DRAFTED 96% OF YOUR BOARD" about a roster the mode hands you and forbids you to
re-draft; it counts the deals and what they were worth now. Its squad screen never
said the roster was handed over or that the phone would ring, and the coach's take
marked the cap room red as "$22M left unspent" while that room is the only thing
that buys a deal. **The results screen still counts it**, because by then the
deadlines have gone and room never used is room never used.

**CAP SURVIVOR DID NOT EXIST UNTIL GAME 20.** Its draft and squad screens were
Classic's exactly, so the first sign the mode was on was a shock sheet mid-season,
and by then the drafting decision it should have changed was made. Both screens
carry the rule now, and the draft's version is the one that matters: leave
yourself room. `modeNote()` is the one painter, `.sq-mode` the one rule.

**THE ERA PICKER WAS THIRTEEN BARE BUTTONS** beside a franchise grid carrying a
span, a lineage and a best player, so the mode with the most character on the
board read as the one with the least. `eligibleEras` reads each decade off the
same rows `drawable` filters, and the cards carry the real span, the clubs that
played in it, and its best season. **The character line is DERIVED and most cards
do not get one**: arms in a decade's top forty run 7 (the 2000s) to 28 (the 1900s),
so the bands leave seven of thirteen unlabelled, because a note on every card says
nothing. It also caught the mode card lying: it said "the nineties are all bats"
and the 1990s are the flattest decade there is at 19.

**THE BRACKET RAIL SCROLLED AND NOTHING SAID SO.** Four columns at 150px is 627
against a 362px phone, so the third header renders as "CHAMPI" against the right
edge and reads as a broken layout rather than as a rail. `brkFocus` already walked
to the round being played; what was missing was any sign, before it moves, that
there is more beside what you can see. Edge fades on both sides, off the real
scroll state, which is the cut sheet's shade arriving at a horizontal box.

**AND EVERY BADGE WAS THE SAME BROWN DISC.** The glyph was the TIER (a crown, a
trophy, and a black dot for everything else) and so was the disc colour, so two
hundred badges were two hundred identical medallions. The disc is the tier and the
glyph is the shelf now: nine drawn SVGs, one a group, asserted against `ACH.GROUPS`
so a shelf added later gets the fallback rather than a blank.

**AND THE `.tile:not(.hot)` FLAKE WAS NOT A FLAKE.** check-theme's border section
had carried it for months as "fails about one run in several on draft randomness,
confirmed by re-run, never chased", and it is a fact about WHEN the reading is
taken. A tile goes hot when the man on it would add chemistry to what is already
signed, so after three signings every tile on a board can be hot at once, the
selector then matches nothing, and the claim fails reporting `dark undefined`
about a page with nothing wrong with it. **The first board has nobody signed, so
no tile on it can be hot.** The section samples every board and keeps the FIRST
reading of each selector, which cannot go missing whatever the draw does after.
Three consecutive runs, where the old shape needed several to show one.

**check-badges --quick was failing three, and the diagnosis in the report was
wrong.** It said the sweep played today's daily board; it does not, it passes an
explicit seed. What the three actually were: `mode_franchise_title` was **missing
from its own pattern** (Classic, Survivor and Division each had a
`mode_*_title: mode_*_oct` excuse and One Franchise did not), `bargain_title` is a
title under $160M and the quick sweep reaches a title and not a fifth of one, and
`daily_100w` **had an excuse and did not need one**, which is exactly what section
5 exists to prune. A wrong diagnosis written down confidently is worse than none:
the fix is the list, not a date.

### A whole run, in a browser, to the screen it ends on

```
node baseball/check-run.mjs      a Classic run and a daily, about three minutes
```

**NOTHING HERE REACHED THE RESULTS SCREEN.** `check-atbats` holds the line score to
the score it was handed, `check-bracket` holds the field to the run, `check-badges`
plays the game in node and never opens a page, and the theme walk drafts a few picks
and stops. So the results screen, the trophy cabinet, the share card, the board
submit and the daily record had never been opened in a browser at all, and they are
the last five things a player meets.

It drafts twelve through the real tiles, plays the season, walks October to
`#s-over`, reads what that screen claims, opens the cabinet, presses Share and reads
the canvas, then does the whole thing again as a daily and comes back to the front
page to see whether the card knows.

**EVERY REQUEST OUT OF THE PAGE IS REFUSED AT THE ROUTE**, and the refusals are read
rather than counted. The board is a live Supabase project holding a real
competition, so a submit that got out would file a fabricated season on it. That is
the Stripe note arriving at a different service. What is ASSERTED is the other half:
that the submit path RAN, because `board.js` fails soft by design and one that
quietly stopped submitting looks exactly like one that works.

**Four things a walker of this game has to know**, each of which cost a round:

| | |
|---|---|
| the board | `#opts` is EMPTY until the reels land, because `paintOpts` is `spinBoth`'s callback. Waiting on the container waits on nothing. |
| a tile | is not always a signing. A man who fits two open slots starts a placement on the field (`#s-draft.picking`), and a walk that does not tap a gold `.target` clicks the same tile for ever at "Spin 1 of 12". |
| a sheet | is a scrim over the whole page, so the press after the cabinet lands on the scrim and retries against a sheet nobody closed. It reads as a button that cannot be clicked. |
| the panel | lists at most six badges and then says how many more, so its count comes from the headline. |

**THREE OF ITS OWN ASSERTIONS WERE WRONG FIRST.** It asked the draft grade for a
number and the grade is a LETTER, so it reported a correct screen as broken. It
compared every pixel of the share card with pixel (0,0), which is the border rather
than the stock, and read 97.6% of the image as ink: it would have passed on a card
with one rule drawn across a wash, so it counts colours and the modal colour's share
instead. And it asked the badge panel for eight rows when the panel prints six,
which is an unearnable threshold inside the checker written to stop unearnable
thresholds shipping.

**Proved by mutation rather than by passing.** Filing the row before asking what it
lit takes the panel to nothing, and a card handed back blank takes its colour count
to 1 and its commonest colour to 100%. The badge claim names **"Play ball"**, which
cannot be earned by a history that already contains the season, because the first
version merely looked for the word "badge" and passed on the ordering defect.
