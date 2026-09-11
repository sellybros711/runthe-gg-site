# Repo conventions

## Never use em dashes or en dashes

No `—`, no `–`, anywhere. Not in copy the player reads, not in placeholder
strings, not in code comments, not in `<title>` tags, not in commit messages,
not in PR descriptions. The same goes for the entities and escapes that produce
them: `&mdash;`, `&ndash;`, `&#8212;`, `&#8211;`, `—`, `–`.

This is not a style preference to weigh against readability. It is a hard rule.
If a sentence seems to need one, the sentence needs rewriting.

**Write this instead**, in rough order of how often it is the right answer:

| Instead of | Use | Example |
|---|---|---|
| explanation or naming | a colon | `Freshness 40/100: starting to go stale` |
| a second full sentence | a full stop | `Rep is there. You need OVR 62.` |
| a clause starting "and", "but", "so" | a comma | `You showboated, and paid for it.` |
| a genuine aside | parentheses | `(the bars above are damage taken, not lives)` |
| a number range | a hyphen | `out 1-8 weeks`, `elite 88-96` |
| fields on one line | a middot `·` | `CDP · Indie Circuit · Year 1` |
| a fragment the dash was propping up | nothing | delete it and close the gap |

Two dashes in one sentence (`X — like this — Y`) almost always wants commas or
parentheses, never one of each.

## Short sentences. Few commas.

Player-facing copy is read on a phone, mid-game, by somebody who wants to press
the next button. Write it in short declarative sentences. A comma splicing two
clauses together is nearly always two sentences that have not been separated yet.

| Instead of | Write |
|---|---|
| `You needed 10 wins and got 14. Season 4 is yours, and it takes 11.` | `Needed 10. Won 14. Season 4 needs 11.` |
| `Everybody you kept is a year older, at whatever that year really was.` | `Everyone is a year older.` |
| `You are $8M over, so no club can offer you anybody.` | `$8M over. No club can offer you a player.` |
| `Some get better, most get worse, and a few are out of the league.` | `Some improve. Most decline. Some are gone.` |

This sits with the dash rule above rather than against it: that table sends a
dash to a comma, and this one sends the comma to a full stop when what follows
it could stand alone.

It applies to copy the player reads. Code comments in this repo are prose that
explains a decision to the next person, and they can take the room they need.

### Enforcement

```
node scripts/check-dashes.mjs
```

Exits non-zero and prints `file:line` for every offender. It runs in CI on any
push or pull request touching `wrestling/**` (`.github/workflows/dash-check.yml`).

The guarded list inside that script is `wrestling`, `hoops`, `globe` and
`mythiball`. The rest of the repo predates the rule and still contains hundreds
of em dashes; add a directory to `GUARDED` only after cleaning it, never
before, or the check becomes noise people learn to ignore.

Run the checker against anything ad hoc:

```
node scripts/check-dashes.mjs path/to/file-or-dir
```

## Sibling scripts carry a hand-written cache version

The game pages load their engine and run loop as separate files:

```
<script src="engine.js?v=52"></script>
```

`index.html` revalidates on every visit and those files do not. Change one and leave
the number alone and a RETURNING visitor gets the new page against the script they
already had. It fails on their phone, mid-run, and on nobody's development machine,
because a developer's browser has never seen the old file. It has shipped that way
once already, as `E.overallOf is not a function` in the main game.

So a change to one of those files is three things in one commit: the edit, the bump,
and the record.

```
node scripts/check-cachebust.mjs            # verify
node scripts/check-cachebust.mjs --update   # after bumping
```

It runs in CI on any push or pull request touching an `.html` or `.js` file
(`.github/workflows/cachebust-check.yml`), and it covers every page on the site that
versions a script beside it, found rather than listed.

## The football game's badge cabinet

`football/achievements.js` is the badge catalog for The Perfect Season, and every badge in
it is DERIVED from the run rows the leaderboard already keeps rather than stored anywhere.
That is what makes a cabinet retroactive, account-shaped rather than browser-shaped, and
impossible to lose by clearing site data. It is also the constraint: a badge can only ask
about something that actually reaches `ps_runs`. A dynasty knows whether its boss game was
won and never writes it down, so no badge asks. Reaching season 11 is the honest version of
the same claim.

Two shelves are gated on their mode's own launch flag:

| shelf | appears when |
|---|---|
| Dynasty | `dynasty-access.js` sets `DYNASTY_LIVE = true` |
| Full Team | `fullteam-access.js` sets `FULLTEAM_LIVE = true` |

**On the LIVE flag and not on the tester list, deliberately.** `CATALOG.length` is the
denominator `crest.js` divides by and it is the definition of GOAT, so a catalog whose size
depended on who was looking would give two players with identical cabinets two different
ranks. One number for everybody, and it steps up on the day a mode launches. Nobody replays
anything: ranks are derived, so seasons a tester already played are counted the moment the
shelf appears.

### The premium bundle, and the check that boots both views

```
node football/check-premium.mjs        the page, in a real browser, both views
node scripts/stripe/verify-bundles.mjs the catalog against the webhook and the constraint
```

One store, not a store per game. `/assets/store.js` is the offer and both The Perfect
Season and Commish Simulator draw it; its two buttons post `perfect-season` and
`run-the-bundle` to `/api/stripe/checkout-bundle`, and **both bundles unlock both games**
(the $19.99 grants `ps_premium` AND `cfb_premium`). Never build a bundle, a price or an
unlock belonging to one game, and never a second payment path. The catalog is
`functions/api/stripe/_bundles.js` and the runbook is that folder's README.

**What decides is the `premium_unlocks` row, read only through `premium_products()`.** The
tester lists in `dynasty-access.js` and `fullteam-access.js` decide who SEES any of this
and are feature flags, never permissions. A signed in account without the row gets the free
allowance and then the store; the row removes the limit rather than unlocking the door.

**`arcade_card_year` is the one grant that ends.** Twelve months, and it does not renew. No
copy anywhere may imply it does, and the receipt has to show the end date.

**Boot BOTH views before shipping anything that touches this.** A crash that only hit
testers has already shipped: moving the store out of `football/index.html` left
`pwArt('star')` behind on the home prompt card, which only a tester sees, so
`pwArt is not defined` threw during boot and took the game to the loading screen. The store
had been verified in the plain view. That is the first section of `check-premium.mjs`.

It intercepts `/api/stripe/checkout-bundle` and answers with an error rather than a session
url, deliberately: **Stripe is live and there is no test mode**, so a request that gets out
ends at a real payment page and a url in the answer would navigate there. Use a 100% off
promotion code for tester runs.

### A badge you add has to be proved reachable

```
node football/check-badges.mjs           # the full sweep, a few minutes
node football/check-badges.mjs --quick   # fewer runs, for a fast loop
```

It plays Dynasty and Full Team for real through `run.js`, in the order the screens drive it,
turns each finished season into the board row the page would file, and names any badge that
nothing lit. The basketball game is why it exists: its first catalog asked for three things
that game could not produce and **nothing failed**, because a badge that cannot be earned
throws no error and breaks no test.

It has already caught the same class of thing twice here:

- "Field a full squad rated 90 or better" was impossible. A Full Team rating is clamped to
  100 and averaged across two units, while a six man offense is unclamped and a good one is
  already past 110, so the threshold had been read off the wrong ladder. 350 simulated
  squads peaked at 54.9.
- The dynasty score ladder went to two million against a measured best of 198,000.

A badge reported UNREACHED is a question, not a number to move: it means either the mode
cannot do it or no strategy in the checker was trying. Two lists excuse one, `GRIND` for a
bigger count of a proved thing and `SKILL` for a feat the bots are not good enough for, and
neither is a free pass. Each entry names another badge that must actually light on that run,
chains resolve to the end, and only the end counts.

### What the mode can actually produce

Measured, and worth knowing before writing a badge that names any of it:

- **A dynasty has no length.** It ends when the owner ends it and at no other point. There
  was a `DYNASTY_MAX_SEASONS = 25` in `engine.js` that nothing in the game read, and this
  file used to call it the design ceiling; it was the balance simulator's loop guard, and it
  has been removed. The simulator keeps its own, named for what it is.
- The win bar is `DYNASTY_BASE_WINS` plus one every `DYNASTY_STEP_SEASONS`, **capped at
  `DYNASTY_WIN_BAR_MAX`**. The cap is not decoration: a season is 17 games, so the old
  uncapped line asked for 17 of 17 at season 91 and 18 at season 101, which is a mode that
  becomes arithmetically impossible rather than hard. Difficulty past the cap comes from the
  squeeze the mode already runs on, a frozen cap against a roster that ages every winter.
- **A milestone every `DYNASTY_MILESTONE_EVERY` seasons, alternating**: the odd ones are
  roster mandates out of a list of **four**, the even ones are boss games out of a list of
  **six**, both cycling. There is no separate boss constant. A boss is every second milestone,
  so the boss interval is twice the cadence and is derived.
  **The cadence is 3, and it shipped as 5.** `simulator.js --dynasty` runs the rule the game
  actually ships (`one life`) and reports both how far runs get and how much of the authored
  content they meet. On the bot's best winter, 200 runs:

  | | every 5 | every 3 |
  |---|---|---|
  | mandates met, mean | 0.58 | **1.04** |
  | bosses met, mean | 0.34 | **0.70** |
  | met a boss | 30.5% | **42.0%** |
  | met a second boss | 3.0% | **22.0%** |

  Nothing was written to get there. Six bosses and four mandates already existed, and at a
  cadence of five nine of the ten were content for almost nobody: the second boss sat at
  season 20 against a median run of 3 and a ninetieth percentile of 15. Moving the cadence
  moved the schedule onto the reach curve. The reach curve itself did not move, because
  `playDynasty` in the simulator models no milestone and neither reward, which is worth
  knowing before reading those columns as a balance check.
  The bot is crude and a person does better. Even so, the third boss now sits at season 18
  against a p90 of 15, so a badge naming it is unprovable by `check-badges.mjs`, which is the
  same problem the old cadence had at every rung.
- A Full Team squad reaches the Super Bowl in about one season in twenty and wins it in
  about one in a hundred, and never takes the top seed.

## The wrestling game

`wrestling/index.html` is the whole career game in one self-contained file, by
site convention (the golf game at `golf/index.html` is the model). A name
collision anywhere in that script kills the entire thing, and the browser only
reports the symptom (`X is not defined`), so after editing:

```
python3 -c "
import re
s=open('wrestling/index.html').read()
b=max(re.findall(r'<script[^>]*>(.*?)</script>',s,re.S),key=len)
open('/tmp/x.js','w').write(b)
" && node --check /tmp/x.js
```

Then the regression suite, which needs no network:

```
node wrestling/verify.mjs            script tags resolve, no trademarks, both pages load,
                                     the title rule, and 2 careers x 4 years of invariants
node wrestling/verify.mjs --quick    everything but the careers
```

It covers `wrestling/booking/` too. That page loads `../roster.js`, `../corrections.js`
and `../personalities.js`, which look unused from the career game and are not: they
were deleted once as dead code and the booking sim shipped broken for a week. The
suite's first section fails on any script tag that points at a missing file.

The roster, the mentors in `legends.js`, the free agents in `personalities.js` and the
booking sim's promotions all use LEGAL names and invented companies. No ring names,
no trademarked match or event names, no catchphrases. The suite's second section
carries the blocklist; add to it when you remove something.

The game is unlisted: not linked from the homepage, nav or sitemap, and
noindexed. Keep it that way unless asked.

## MythiBall, the baseball game

`mythiball/index.html`, the same one-file convention as wrestling above. Sixty
eight public domain characters play arcade baseball: a plate camera behind the
catcher, hitting on timing plus where the bat is, pitching on aim plus a
release meter.

**It was called Run The All-Stars and lived at `allstars/`.** Both names are
gone from the code. What did NOT change is the localStorage keys, which are
still `allstars.season.v1` and its siblings: they are invisible to the player,
and renaming them would throw away the save of every tester who has already
played. Leave them.

It is SERVED, and unlisted, and those are two different facts:

| | wrestling | hoops | MythiBall | setlist |
|---|---|---|---|---|
| answers at a runthe.gg URL | yes | yes | **yes** | yes |
| in `sitemap.xml` | no | no | no | **yes** |
| indexable | no | no | no | **yes** |
| carries the AdSense tag | no | no | no | yes |
| linked from the homepage or nav | no | no | no | no |

So a tester who is handed `runthe.gg/mythiball/` can play it and nobody else
can find it. **Unlisted is the whole of the gate.** It is not access control:
anyone with the URL is in, and if the game ever needs a real gate it needs a
real one rather than a quiet path. Say so rather than implying the link is
private.

`Mythiball/index.html` (capital M) is a redirect stub to the lower case path,
the way `Wrestling/` and `Tour/` answer theirs, because the capitalised URL is
the one that gets typed and pasted. It carries its own robots tag.

The sprites are generated, never hand-edited in the page:

```
python3 mythiball/gen_sprites_v2.py > sprites.js    # then splice V2_SPRITES in
```

Every character is drawn from a PUBLIC DOMAIN source and `mythiball/PD_SOURCES.md`
is the register: source, what the sprite shows, what it avoids. The avoid column
is the point. Disney's Peter Pan, Universal's Frankenstein, MGM's green witch and
ruby slippers are all still owned, and a redraw that drifts back toward one of
them is the failure mode.

### The menu is a room, and a phone gets LOCKERS

The menu is a clubhouse. It is called the clubhouse everywhere the player can
see and in the code; the seven places a character says "dugout" mean the one
beside the field during a game and are left alone.

**There are two arrangements and they are different designs, not two sizes of
one.** A desktop gets `landscapeRoom()`: four objects hung on a wall with a
small sign floating over each, and a rail underneath that says what the thing
under the pointer does. A phone gets `closeRoom(boxW, boxH)`: four LOCKERS,
one frame per mode, all the same size, each with a nameplate on it and its
object scaled to fit inside. `drawClubhouse` draws whichever `ROOM.lockers`
says, and reads every position out of `ROOM`.

**Why they had to diverge.** The wall-and-signs arrangement depends on the
rail, and a phone has no pointer to drive one. What a first-time player got
was a picture with four labels on it and no way to tell the picture was the
menu. The four also carry very different weight as drawings: authored, they
are 150x200, 176x168, 150x168 and 246x146, so the chalkboard is the biggest,
loudest thing on the screen and it is the least important door in the room.
**Three rounds went into making everything bigger and neither fault was a
size.** A locker fixes both at once: it obviously presses, and four of them
are four equal boxes whatever is inside.

**A locker is a container, and that inverts the whole layout problem.** Before,
every drawing was a fixed pixel size, so the ROOM had to shrink until four of
them fit, and how big anything came out was whatever the browser's scaling left
it. Ask for 760 room pixels in a 358 pixel box and a 13px sign arrives at six,
with nothing in the code saying so. A locker scales its contents, so the layout
can size the lockers to the window instead. `closeRoom` therefore composes **one
to one with the screen**: a room pixel IS a CSS pixel, type asked for at 18
arrives at 18, and the canvas keeps its 2x backing store so it stays crisp.

Which grid (four across, two by two, one column) is picked by **the worst
drawing in it**: for each shape, work out what a locker leaves for the object
inside, fit all four, and take the arrangement where the one that comes out
smallest comes out largest. That is the thing a player squints at.

The tunnel, the shirt rail and the bat bag belong to the wide room. In a locker
room the wall is lockers, which is what a clubhouse wall is.

Four things are easy to undo by accident:

- **A rotation is not a render.** The layout is chosen once per render, so
  turning the phone left the upright room in a sideways window, showing a fifth
  of the picture. There is a resize and orientationchange listener, and the
  suite turns a phone both ways. It has already been deleted once by a patch
  that replaced the block around it, and only the suite noticed.
- **`thingBox(t)` is the only thing that knows where a door really starts**, and
  a sign floating above an object and a nameplate inside a locker are not the
  same rectangle. Work it out by hand anywhere (the hotspot, the pointer
  outline, a check) and that copy measures a box half the layouts do not have.
  One guard did exactly that and passed for a week.
- The canvas is `object-fit: contain`, so if the scene's shape and its box's
  shape drift apart the picture letterboxes while the hotspots stay where they
  were. `renderMenu` measures the real box on the frame after it mounts and
  recomposes if the guess was off. Assertions measure the PAINTED picture,
  never the element, or a letterboxed room reads as a full one.
- `body.roomfill` is one `matchMedia` in the script that the stylesheet keys
  off. Write that query out a second time in CSS and the two drift.

The same arithmetic broke the GAME screen sideways: `#field` derives its width
from a height budget that assumed 265px of furniture above and below, which in a
390 tall window left 125, so an 844 wide phone drew a 182 wide field. Sideways is
not short of width, it is short of height, so under `max-height: 560px` the
furniture goes in a column beside the field instead of above and below it.

The regression suite, which is the thing to run after editing:

```
node mythiball/check-posture.mjs   unlisted, and the capital alias still lands
node mythiball/verify-rules.mjs    the rules replayed in a headless browser
node scripts/check-dashes.mjs      mythiball is on the GUARDED list
```

## Segue, the setlist game

`setlist/index.html`, same one-file convention. It is NOT in the same state as
the wrestling game above and the difference is deliberate, so it is written
down here rather than inferred from that paragraph:

| | wrestling | setlist |
|---|---|---|
| in `sitemap.xml` | no | **yes** |
| indexable | no, noindexed | **yes** |
| linked from the homepage or nav | no | no |

So Segue is live and findable by search, and a visitor browsing runthe.gg will
not stumble on it. Linking it from the homepage is the step that launches it,
and it has not been taken. `check_data.mjs` asserts all three of those, so
changing any of them means changing a guard on purpose.

It has its own regression suite, which is the thing to run after editing:

```
node scripts/setlist/check_data.mjs
node setlist/verify-scoring.mjs
```

## Run The Floor, the NBA game

`hoops/`, at `/hoops/`. The football and college football skeleton reskinned for
basketball, and the direct sibling of `baseball/`, which is the previous reskin
of the same thing. Unlike the two one-file games above, it is split the way the
football and college games are: `engine.js` and `run.js` load beside the page and
carry cache versions, so **read the cache-busting section above before editing
either**.

It is an **unlaunched preview**, on the same footing as the wrestling game:

| | wrestling | hoops | setlist |
|---|---|---|---|
| in `sitemap.xml` | no | no | **yes** |
| indexable | no, noindexed | no, noindexed | **yes** |
| carries the AdSense tag | no | no | yes |
| linked from the homepage or nav | no | no | no |

That noindex is doing more work than it looks like. `scripts/check-adsense.mjs`
audits every INDEXABLE page and skips noindexed ones, so the robots tag is the
only thing keeping an unfinished game out of the surface AdSense reviews. Remove
it and nothing fails: hoops silently becomes the 32nd indexable page, and the
checker then starts demanding an ad tag on it. `hoops/check-posture.mjs` asserts
all four rows of that column, so launching the game means editing a guard on
purpose.

The regression suite, none of which needs a network:

```
node hoops/check-posture.mjs      discoverability, per the table above
node hoops/build/check-fetch.mjs  the scraper's parsers, against saved markup
node hoops/verify.mjs             draft legality, seed replay, and calibration
node hoops/check-badges.mjs       every badge is reachable, against real runs
```

`check-badges.mjs` takes about two minutes, because proving a badge is reachable
means playing 900 seasons six different ways. It earns that: the first badge
catalog asked for three things this game cannot produce (six decorated players
on one roster, a chemistry bonus of +2, missing the playoffs at a rating of 80),
and **nothing failed**. The cabinet rendered, the squares stayed dark, and the
only symptom was three achievements nobody would ever earn. Two more looked
unreachable and were not: no strategy in the check was chasing chemistry or
building under the cap, which is a gap in the CHECK. The fix there was adding
the strategies a player would use, never loosening a threshold to suit a bot.

`verify.mjs` prints a **TARGETS** block. Read it after any change to the data or
the constants: it states what the balance is supposed to look like and flags what
is outside its band.

**Two targets are out of band today and no constant will fix them.** The four
numbers that turn win shares into a record are now FITTED to twenty-two real NBA
records (rms 3.5 wins), so a roster is worth what it was worth in life: rating
all 1403 team-seasons puts the 2012 Bobcats last at 10.5 wins and the 1996 Bulls
first at 73.8. What is still off is the GAP between a thoughtless draft and a
perfect one, which never exceeds about six wins at any cap, because
`build-players.mjs` prices players off `p.w` alone. Price being a monotone
function of value means the board holds no bargains, so best-available is close
to optimal. Fixing it means pricing on something other than value, or widening
what roster shape is worth. Both are design changes. The TARGETS block says all
of this at the point of failure, so read it there rather than trusting this
paragraph to stay current.

**Refit, do not nudge.** If the data changes shape, re-run the solve rather than
moving one constant: they trade off against each other, and the reason the
previous set was uniformly 15 wins low is that no single number showed it.

### The data pipeline

Basketball-Reference is **blocked from the dev sandbox and open from GitHub's
runners**, the same split `scripts/build-register.mjs` documents. So the fetch
cannot be run here, and `.github/workflows/hoops-data.yml` exists to run it.
That workflow file is also on `main`, on its own, because GitHub will not
dispatch a `workflow_dispatch` workflow unless it exists on the default branch.

```
node hoops/build/fetch-nba.mjs --from 1974 --to 2025    box scores, win shares, position, team
node hoops/build/fetch-draft.mjs --from 1960            draft year and college
node hoops/build/fetch-awards.mjs --from 1974           MVP, All-NBA, All-Star and the rest
node hoops/build/fetch-teams.mjs                        franchises (this one DOES run locally)
node hoops/build/build-players.mjs --from hoops/build/raw/nba_player_seasons.json
```

Championships are **not** fetched. `teams.json` already carries every title year,
so `build-players.mjs` hands the ring to everyone on that roster.

Things worth knowing before you change it:

- **A season page carries the PLAYOFF table too.** The scrape must stay scoped to
  the regular-season table, which `seasonTables()` does by table id and document
  order, either of which alone is a silent failure. This shipped once: win shares
  join on player and club, so a finalist's playoff row simply overwrote his
  season, Jordan's 1996 arrived at 4.7 win shares instead of 20.4, and nothing
  failed. `verify.mjs` now asserts the shape of the win-share distribution plus
  six great seasons by name.
- **Never demand a particular way of writing a link.** The draft fetch returned
  zero picks for sixty-six years on four separate runs because the parser wanted
  `href="/players/...`, which assumes a relative origin, a double quote, and
  nothing after `.html`. Six of seven plausible forms fail that. Ask for the
  path.
- **Not every season is 82 games.** 1999 played 50, 2012 66, 2021 72, and 2020
  between 63 and 75 by club. Win shares are a counting stat, so `build-players`
  normalizes each club to an 82 game schedule, or Iverson's 1999 MVP season
  arrives looking like a rotation guard. A club that played 78 or more counts as
  full: in the modern game nobody plays all 82, and treating rest days as a short
  season inflates recent players.
- **Draft year and college are on no season page.** They are chemistry inputs,
  so without `fetch-draft.mjs` the `alma_mater` and `draft_class` links are
  permanently silent rather than wrong. It reads the per-year draft pages (about
  seventy requests) rather than five thousand player pages.
- **A playing-time floor of 12 mpg across 20 games** is applied at build time.
  Without it the wheel spends most of its time on players who appeared in nine
  games, and every visitor downloads three times the file.
- **A title is filed under the club's MODERN code, and a roster is not.** A
  franchise table writes one row of honours per club as it exists today, so
  `WAS` carries 1978 and the 1978 roster is `WSB`; `OKC` carries 1979 and the
  1979 roster is Seattle. Both of those rings joined to nobody and nothing
  failed. `titlesByCode()` in the engine walks each franchise's aliases and
  hands every title year to the record whose own lifetime contains it.
  `verify.mjs` asserts that every season in the data has a champion in it, which
  is what catches this class of miss. 2024 was simply absent from the table.
- **A club's published hex is not usable on the page.** The reels take the
  drawn club's colors, and San Antonio's black, Brooklyn's black and every navy
  are within a hair of `#0d1117`. `wheelColors()` floors each color into a range
  that shows, then lifts the band by MEASUREMENT until it clears the fill,
  because HSL lightness is not brightness: the original Hornets' purple at
  lightness 55 is darker than their teal at 26 and came back at 1.16:1. All 45
  franchises are asserted in `verify.mjs`, because the way this breaks is that
  somebody corrects one club's hex and three others go dim without either being
  the club they were looking at.
- **Hardware is decoration and that is why it needs asserting.** The engine
  never reads `aw` and no rating moves for it, so a wrong award can sit there for
  a year without a single number looking odd, and the failure mode is telling a
  visitor something false about a real person. `verify.mjs` checks the codes, the
  prestige ordering (the page shows the first entry as the best and ranks
  nothing itself) and every ring against `teams.json`.
- **`hoops/data/teams.json` is a second source** (the static franchise table in
  `nba_api`) joined on the team code. NBA.com and BBRef disagree on three codes,
  and BBRef's `CHA` is the **Bobcats** while `CHO` is the Hornets, which is a
  different club rather than an alias. `check-posture.mjs` asserts every team
  code in the player data has a franchise row, because that join fails silently.

The fetch has now run. `hoops/data/players.json` holds **16,057 player-seasons
from 1974 to 2025**, 14,612 of them with a draft year and 13,109 with a college.
If it ever holds 171 rows again, the game has fallen back to
`hoops/build/seed-rosters.mjs`: values entered from memory and rounded, which
must never be shown to a player as a fact about a real season. The dev banner
said so and has come off, because saying it now would be false in the other
direction.

## Segue's data

Its data refreshes itself daily at 6am Eastern
(`.github/workflows/setlist-data.yml`) and commits three files:
`goose.csv` (performances), `goose_shows.csv` (every show, past and future,
with tour names) and `goose_latest.json` (last night's setlist plus the next
three dates, for the home screen). A refresh APPENDS: song esteem is derived
but its ceiling is pinned, so adding a show touches the rows it adds plus any
song a curator wrote up, and nothing else. `data_drift.mjs` enforces that,
failing any refresh where a derived value moved for a song whose own history
did not.
