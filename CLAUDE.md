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
about something that actually reaches `ps_runs`. A dynasty knows whether its boss battle was
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
node cfb/build/test/test_store.mjs     the same offer and receipt on the college page
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

### What the free allowance actually counts

**Dynasty counts SEASONS, the Trade Machine counts RUNS, and the server says which.**
`supabase/101_dynasty_seasons.sql` is the whole rule: three dynasty seasons a day, one more
for a boss battle won, spent one per kickoff on whatever run the player is in. A firing ends
the day outright. The Trade Machine is one run a day, unchanged, because a run there IS one
season.

The old rule metered a START, and the mode it produced was the entire game with a wait in
front of it: begin on Monday, still be playing that same run at season 60 without the game
asking again. The only thing the bundle sold was re-drafting.

**A firing ending the day is not spite, it is what stops the budget buying a reroll.** Fired
in season one with two seasons left, the cheapest use of them is a string of fresh season
ones until one drafts well. That is both the behaviour the meter exists to discourage and
the worst possible way to meet the mode. The season one mercy from
`100_daily_grace_reasons.sql` is gone for exactly the same reason: under a budget of three it
IS the reroll button.

**`unit` is what makes the page correct on both sides of the migration.** SQL is deployed by
hand, the page is not, so `ps_attempts_state` returns `'season'` or `'run'` and every gate
and every line of copy reads `dailySeasons()`. A database still on 100 answers without the
column, the page falls back to `'run'`, and it goes on enforcing and describing the rule
that database is actually keeping. Both rules are asserted in `check-premium.mjs`, which is
why that file has two sections rather than one, and the season section can go when the
migration has been deployed everywhere it needs to be.

**The stop is at the results screen, not the kickoff.** `dynToWinter` is the gate, so a
player out of seasons is refused before the winter rather than after it. Blocking at
`startSeason` alone would let somebody age a roster and work the wheel for a season they
cannot start; it is still guarded there, as a backstop for a second dynasty in the other
slot spending the budget out from under this one.

**The dynasty clock is 24 hours from when the day ENDS, per account.**
`supabase/102_dynasty_rolling_day.sql` moved it off the shared Eastern midnight, because a
calendar reset hands somebody who sits down at 11pm three more seasons an hour later and
makes somebody who sits down at 9am wait fifteen hours for the same three. Same budget,
different game, decided by nothing the player did. The wait starts at one of exactly two
moments, and `paintOver` is where both of them land: the last season of the budget finishes,
or the run is fired. A run that merely stops in the middle has not ended a day, so no clock
runs and the seasons left are still there whenever they come back.

**The Trade Machine keeps the calendar day and that is not an oversight.** One run there IS
one sitting, so there is no finished-the-day moment separate from the run for a personal
clock to hang on. `unit` is still what tells the two apart, and every countdown and fallback
sentence on the page is written off `dailySeasons()` for exactly that reason.

**Dynasty has its own table now.** `ps_daily_attempts` is keyed on (user, mode, DAY), and a
rolling window that happened to cross midnight would silently become two rows and hand out a
second budget. The shape of the key is the rule, so `ps_dynasty_day` holds one row per
player with no day in it: `locked_until` null means open, in the future means waiting, in
the past means the row is stale and the next WRITE rolls it forward. Rolling lazily is what
keeps `ps_attempts_state` `stable`, which is what keeps drawing the front page from ever
being able to cost somebody a season.

**`ps_attempt_day_end` must never extend a wait that is already running.** The results
screen it is called from is reopened from a save every time somebody comes back to a
finished run, so a second stamp would turn looking at your own dynasty into another day's
punishment. `check-premium.mjs` asserts both halves: that a shut day with no clock on it
starts one, and that a clock already running is never restarted.

**Boot BOTH views before shipping anything that touches this.** A crash that only hit
testers has already shipped: moving the store out of `football/index.html` left
`pwArt('star')` behind on the home prompt card, which only a tester sees, so
`pwArt is not defined` threw during boot and took the game to the loading screen. The store
had been verified in the plain view. That is the first section of `check-premium.mjs`.

It intercepts `/api/stripe/checkout-bundle` and answers with an error rather than a session
url, deliberately: **Stripe is live and there is no test mode**, so a request that gets out
ends at a real payment page and a url in the answer would navigate there. Use a 100% off
promotion code for tester runs. `cfb/build/test/test_store.mjs` does the same on the
college side, and never lets a request out either.

**The college game sells and receipts it too, from `cfb/index.html`.** Both halves are on
the profile: a Go Pro card for a non-owner and a Your Pro access row for an owner, the same
two rows the football profile carries, and the receipt reads `premium_unlocks` through
`premiumUnlocks()` in `cfb/auth.js`. The RECEIPT is deliberately ungated: a buyer who paid
on the football page owns what they own here whether or not this game shows them a mode.
The OFFER is gated on `commishOn()`, the same call the front page door makes, because while
`COMMISH_LIVE` is false the only thing it sells is a mode the reader cannot see, and a card
that takes money for a shut door is worse than no card.

**A store you can only reach by being refused is a wall.** Before that card existed the sole
way to the offer from this game was to open Commissioner Simulator and be turned away at its
gate, which nobody who cannot see the mode will ever do.

### Commissioner Mode is free at one season a day

```
node cfb/build/test/commish/test_clock.mjs        the page obeys the clock
psql -d clock_test -f supabase/test/commish_clock_base.sql
psql -d clock_test -f supabase/104_commish_free_clock.sql
psql -d clock_test -f supabase/test/commish_clock_test.sql   the clock counts
```

**There is no paywall on the door any more.** A signed in account without `cfb_premium`
plays a whole five season term, one season every 24 hours. What is bought is the
impatience, not the game: Pro plays the next season immediately. The gate in
`cfb/commish/index.html` used to stop a non-owner dead, which meant the only way to find
out whether the mode was worth $19.99 was to pay $19.99.

**The clock is the server's**, in `supabase/104_commish_free_clock.sql`, for the reason
`99_daily_attempts.sql` spells out: a limit that gates a paid tier is worth bypassing, and
in a browser it is bypassed by clearing site data. Every function there reads
`premium_unlocks` itself, so a paying account is **never written to that table at all** and
cannot be metered by a client bug or unmetered by a client lie.

**It meters a SEASON, not a start**, and that is the difference from Dynasty. Meter the
start here and a player quits after season one, takes the job again, and replays season one
forever. The check lives at the top of `office()` because that is the one door every path
into a season goes through, and `world.cleared` records the last year the save paid for, so
a **reload cannot walk around it**: the year has already advanced in the save by the time
the wall appears.

**It fails OPEN.** An unreachable clock lets the season through. The two mistakes are not
symmetric: a wrongly granted season costs a fraction of one sale, and a wrongly refused one
costs a player who was engaged enough to come back. `clock.js`'s header argues it at length.

**A rolling 24 hours drifts, and that is a known cost.** Play at 6pm and tomorrow opens at
6pm, but nobody taps at exactly 6pm, so the window walks later each day. If it ever bites,
shorten `commish_free_wait()` to about twenty hours rather than moving to a calendar day: a
shorter wait walks the window backwards into the player's evening instead of out of it.

#### The two games give different daily allowances, ON PURPOSE

| | free allowance | clock starts |
|---|---|---|
| Dynasty | **3 seasons a day**, plus one for a boss battle won | when the budget is spent, or on a firing |
| Commissioner | **1 season a day** | when each season ends |

**Do not unify these.** They are two different units of play wearing the same word. A
dynasty season is a draft and a schedule, and three of them is one sitting. A Commissioner
season is a whole year of rulings, a media day and a playoff, and one of them is already a
longer sitting than three dynasty seasons. Matching the numbers would make one of the two
modes wrong, and which one depends on nothing but which file somebody edited second.

The mechanism IS shared and should stay shared: both are a rolling 24 hours held by the
server, both read `premium_unlocks` themselves, and both fail open. It is only the count and
the trigger that differ.

**The player is told, on the screen where it would otherwise look like a bug.** The
Commissioner wall says the rule is one a day, says why (a season here is a full year of
rulings), and says the NFL game sets its own pace. It does NOT print Dynasty's number: that
number lives on Dynasty's own server and its own screen, and a copy here is a copy that goes
stale the next time somebody tunes it. `ps_day_allowance` and `commish_free_wait()` are each
the single place their own rule lives.

### A term is a contract, and Pro gets renewed

**A TERM IS NO LONGER FIVE SEASONS AND THEN THE MODE IS OVER.** "Take the job again" built a
brand new 2025 and threw the sport away, which is the one thing this mode is about. A pro
account that serves its term is offered an EXTENSION that keeps the sport: the playoff it
expanded, the money it moved, the conferences it let die, the room that is angry with it.

**The length is the verdict on the last term**, read off `meters.standing` through
`RENEWALS`: 3 years on a short leash up to 8 for a room that would have signed you for life.
A sacking is not renewed at all, because the room voted you out and there is nothing to
extend; what is offered there is somebody else's sport from the top.

**`TERM_SEASONS` is now only the FIRST contract.** Anything asking how long the current one
is must call `termLen(w)`, which reads `w.termSeasons`. A save written before renewals has
none and is a five season term, which is what it was signed as.

**A renewal keeps the world, so four things need a term floor**, and `report.js` is not one
of them: it already scopes everything through `years(world)`, which is `startYear` to
`year`. The four that read the world whole are the doctrine (`sinceTerm`), the rulings
count, the titles count (`termTitles`) and the career shelf row. Left alone, term three
would be graded on the work of terms one and two. They are scoped BY YEAR rather than by
clearing the record, because history entries carry their year, champions are keyed by year,
and `situation.js` reads last year's champion across the boundary so a new contract opens
with the sport's actual memory.

**A free account gets ONE contract**, counted by `commish_term_done()` in the same
migration. It is filed from `logTerm()`, which already guards a term against being recorded
twice (`careerLogged` lives on the save, so it survives the reload of a finished ending).
The cap is enforced at BOTH doors: `paintNext()` ends the career on the screen where it runs
out, and the gate checks on the next visit, because otherwise coming back tomorrow hands out
a fresh term. **Resuming is never capped**: a term still running is that one contract.

**A walk that detects the ending by the NEXT button's label will break.** It says four
different things now. `cfb/build/test/commish/test_ending.mjs` keys on `#b-term-share` being
shown instead, which is structural; the old string check silently stopped recognising the
ending, clicked through it and started a fresh term, and reported seven terms and seven
removals rather than one.

`/assets/store.js` **injects its stylesheet at load, not on first use**, and that is a fix
rather than a preference. The block styles more than the offer: `.pw-pill` beside an account
name and `.pw-line` on the receipt come out of it, and neither goes through `html()` or
`art()`. `game()` injected nothing, so an OWNER was exactly the visitor who could reach the
receipt without the CSS, because an owner is never shown the pitch card that would have
warmed it. Four unstyled paragraphs, nothing thrown, nothing to report.

**A redirect back from Stripe must land on the host the buyer left from.** Both
`www.runthe.gg` and `runthe.gg` serve this site and neither redirects to the other, so they
are two localStorage jars and a session signed in on one does not exist on the other. Every
Stripe endpoint built its return url out of `SITE_URL`, which is the apex, always: a www
buyer came back signed out, the page polled `premium_products()` as nobody, and the screen
straight after paying apologised for a slow webhook that had already delivered. The base is
`siteBase()` in `functions/api/stripe/_site.js` now, which prefers the request's own origin
when it is this site. The same trap has bitten a link in the CFB header. Never write an
absolute `https://runthe.gg` url in anything a player follows.

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
  roster mandates out of a list of **four**, the even ones are boss battles out of a list of
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

### A phone gets a MENU, a desktop gets the room

The home screen is the clubhouse. It is called the clubhouse everywhere the
player can see and in the code; the seven places a character says "dugout" mean
the one beside the field during a game and are left alone.

**These are two designs, not two sizes of one, and that is the whole lesson of
this screen.** `landscapeRoom()` draws a room: four objects hung on a wall, a
small sign over each, and a rail underneath that names whatever the pointer is
on. `renderPhoneMenu()` draws four buttons: real text, real type sizes, the
mode's own drawing as an icon, one line of caption, and the clubhouse present as
a strip of floor with the team standing on it. `renderMenu` picks by `ROOMFILL`.

**The room cannot carry this screen at phone width, and five attempts is enough
evidence.** The rail is what tells you what the objects do, and a phone has no
pointer to drive one, so what arrived was a picture with four labels on it.
Every fix aimed at SIZE failed, because size was never the fault:

| attempt | what came back |
|---|---|
| fill the window | a strip of room over half a screen of dead card stock |
| draw it closer in | legible, and still a picture rather than a menu |
| make them lockers | four frames holding a bat rack, a clipboard, a framed photo and a chalkboard: four objects of wildly different real size, above two people as tall as one frame. It stopped depicting anything. |

The arithmetic underneath: four modes need four labels a thumb apart and
readable at arm's length, and four lockers side by side in 358 CSS pixels are 89
each, which does not hold the word EXHIBITION. Any grid that fixes that stops
being a room.

**Real text is the point, not a detail.** Everything in a canvas is drawn at
whatever the browser's scaling leaves it: the room's signs came out at six CSS
pixels once and nothing in the code said so. A button's label is set in CSS and
arrives at the size it asks for, and the suite asserts the computed font size
rather than a number derived from a layout.

Two things are easy to undo by accident:

- **A rotation is not a render.** Which menu a window gets is decided once per
  render, so without the resize and orientationchange listener a phone turned
  sideways keeps whichever one it had. It used to be the room that went stale
  that way; now it is the choice between the two. It has already been deleted
  once by a patch that replaced the block around it, and only the suite noticed.
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
