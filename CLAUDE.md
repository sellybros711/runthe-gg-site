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
push or pull request touching a guarded directory
(`.github/workflows/dash-check.yml`).

The guarded list inside that script is `wrestling`, `hoops`, `globe`,
`mythiball`, `golf`, `cfb`, `football` and `assets`. The rest of the repo
predates the rule and still contains hundreds of em dashes; add a directory to
`GUARDED` only after cleaning it, never before, or the check becomes noise
people learn to ignore.

**`GUARDED` and the workflow's `paths:` are two copies of one answer.** They had
already drifted: `globe` was on the list and triggered no CI run, so a dash added
there failed only for whoever next ran the checker by hand. Add a directory in
both places, in the same commit.

**Cleaning `football` turned up twenty dashes a player could see**, which an
audit had reported as zero. The audit's extractor dropped any string containing
`</` as code, and that is most of the strings that build UI. What it missed: the
Challenge Bowl share text (the one piece of copy here that gets posted in
public), the same scoreline on screen, two sentences spliced by a dash, six
empty-value placeholders, and the `<title>`, `og:title` and `twitter:title` of
both challenge share pages. Scores and empty values take a hyphen; a title takes
the pipe every other title on the site uses.

**A sweep over a directory has to read its own diff for non-comment lines.**
`golf` carried 244 dashes, 186 of them em dashes in code comments, and it was
cleared in one pass to get it on the list. Nine of those were not prose: the em
dash was doing a second job as the EMPTY VALUE in a career-milestone tile, the
string a tile shows when the figure is zero, so reading every dash as
punctuation turned every blank tile into a stray comma. Nothing threw and no
test caught it. A hyphen is the replacement there, the same as for a range. It
is the same miss as the football placeholders above, found from the other side.

Run the checker against anything ad hoc:

```
node scripts/check-dashes.mjs path/to/file-or-dir
```

### The rest of the copy rules

```
node scripts/check-copy.mjs              the guarded pages
node scripts/check-copy.mjs path/to/file something else
node scripts/check-copy.mjs --list       every string it reads
```

The dash rule can be enforced over whole files because a dash is a character. The
rest of the rules are about ENGLISH, and a code comment here is prose for the next
person that is allowed to run long and use whatever words it needs. So this one
reads the strings a PLAYER sees and nothing else: promotional language, AI
vocabulary, curly quotes, filler, hedging, chat artifacts, emoji.

**Getting the extraction wrong is silent, and it already happened twice.** The
first walk dropped every string containing `</` as code, which is most of the
strings that build UI, and reported zero problems in a game that had twenty. The
second desynced on the regex literal `/[&<>"']/g` in `store.js`, read its double
quote as a string opener, and fed every comment after it to the rules. The walker
knows a regex literal from a division now. If this checker ever reports a problem
inside a code comment, that is the bug, not the comment.

**Two things it deliberately does not fail on.** Sentence length is printed as a
warning and ignored by the exit code, because "QB, RB, two WR, TE and a flex" is
four commas and exactly right. And it does not look for the rule of three: three
is the number of kinds of special college season there are, and whether a group of
three is information or padding is a person's job.

### A number a player reads has to be the number the game plays

```
node scripts/check-numbers.mjs            the guarded pages
node scripts/check-numbers.mjs --list     every claim it found
node scripts/check-numbers.mjs --update   re-record the coverage counts
```

The in-game rules sheet in `cfb/index.html` already does this right:

```js
const cap = M0(E.CONSTANTS.CAP_MUSD);
const R1  = E.CONSTANTS.RESPIN_LADDER_MUSD.map(M0).join(', then ');
```

So tuning `CAP_MUSD` rewrites the sheet. **It rewrites nothing else.** `$11M` is
hardcoded twenty-two times across six files (`cfb/index.html`,
`cfb/how-to-play.html`, the homepage, `about.html`, `cfb/og-source.html`,
`football/index.html`), and a static page cannot interpolate. Change the cap and
the game charges the new one while every page describing it promises the old one.
Nothing throws. The only symptom is a guide that lies, found by a player.

This is the same class as "five years" surviving on six Commissioner screens after
a term stopped being five seasons. **When a number is in copy, either interpolate
it or write the sentence without it.** This is the checker for the half of the site
that cannot interpolate.

**The JSON-LD is the worst place to keep a stale number.** `cfb/how-to-play.html`
carries a schema.org `HowTo` block repeating the budget, the re-spin ladder, the
game count and the top-twelve rule, and that block is what Google renders in a rich
result. It is covered because `copyOf()` already reads it: the step text comes out
as string literals like any other copy.

**A claim is accepted if it matches EITHER game, and that is a deliberate
weakening.** `cfb/index.html` sells the NFL game on its own front page and the
homepage describes both, so a page cannot be tied to one engine. The cost is that
two games sharing a value would hide a stale claim about one behind the other. They
share none today (11 against 140, 12 against 17), and the collision is checked on
every run, so the day they collide is a failure here rather than a silent hole. The
season range is the one fact allowed to overlap, because both games are refreshed
to the same last season by definition; what it still catches is the end that moves.

**Coverage is half the check.** A regex that finds nothing passes. Reword
`$11M NIL budget` to `eleven million in NIL` and this file goes quiet and green
while the thing it guards walks away. That is how an extractor in this repo has
failed twice already, so the counts are RECORDED in `scripts/numbers.json` the way
`check-cachebust.mjs` records hashes. A dropped claim and a new one both fail, and
both want thirty seconds and a re-record. It runs in CI on the engines, the pages,
the player data and its own files (`.github/workflows/numbers-check.yml`).

**It has a sibling, and they do not overlap.** `scripts/check-howto.mjs` holds the
arcade's twelve "How to play" blocks to `arcade/tokens.js`, after every one of them
said four already-free games "come free with a RunThe.GG account". Same lesson,
different surface: `check-howto` covers `arcade/`, `check-numbers` covers the
football and college games plus the homepage and `about.html`. Neither checks
English; `check-copy.mjs` does that.

**A build script that writes words onto an image is copy**, so `cfb/build/06-og.mjs`
is on `check-copy.mjs`'s guarded list. It writes the headline baked into
`og-challenge.png`, which is the most public text the college game produces, since
it is what a shared challenge link shows in a feed, and nobody reading the source of
a build step is reading it as prose.

**Its curly apostrophe stays, and that is the second time this has been settled.**
An audit flagged `You’ve been Challenged` there because every other instance of
that phrase on the site writes it straight. It is the same case the curly-quote
rule was narrowed for: a single-quoted JavaScript string, where a straight
apostrophe costs a backslash. The rule now catches a LEFT single quote and curly
DOUBLE quotes, which is what arrives by paste, and leaves `’` alone. Changing it
back would also be worse typography in a display face.

## A school is singular

`Oregon is 12-0.` `Oregon has not lost a game.` `Georgia wins it.`

A place name standing in for a program takes a SINGULAR verb in this sport. The
plural is the British habit for club sides, and in an American football game it
reads as writing by somebody who does not watch it. A player found `Oregon are
12-0 and nobody is watching` on the office screen, and once it is pointed at you
cannot unsee it.

Two exceptions, and both are ordinary grammar rather than a carve-out:

- **Two subjects joined by "and" take a plural verb.** `Oregon and Ohio State are
  both unbeaten`, `Houston and West Virginia want their kickoff back`.
- **A nickname is plural.** Nothing in this repo uses one (`c.school` is always
  a school name), but `the Ducks are` would be right if anything did.

Pronouns are looser and deliberately left alone. `Oregon won it. Their roster
cost more than eleven athletic departments spend on everything` is how a beat
writer talks, and forcing `its` into a quote makes it sound like a filing.

### The guard

The name is never in the string. Every one of these is `c.school + ' is '` or a
`{champ}` token, so grepping `docket.js` for "Oregon are" finds nothing and
always will. So the last section of `cfb/build/test/commish/test_docket.mjs`
plays real seasons across all nine beats and reads the RENDERED sentence, over
the docket, the podium and the cutscenes.

It masks every school name to one character before scanning, longest name first.
Without the sort, `West Virginia want` is read as `Virginia want` and reported as
a plural, and the fix somebody then makes is to break a correct sentence.

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

**The prompt card is the store's too, and for the reason everything else here is.** There are
three of them (the football front page, the football profile, the college profile) and each
page used to draw its own, so on one day, about one purchase, they read "4 modes", "3 modes"
and a sentence. `RTG_STORE.card()` and `.cardInner()` draw all three now, and the `.pwc-marks`
rule is in the store's injected CSS rather than in either page.

What it says is **Unlimited**, over the three marks the sheet's hero row uses, in the same
order. A count was the wrong half to lead with: what a free account meets is the counting, so
the value is the word that answers it. **The three are the three tiles, not the four named
lines under them.** One Franchise Dynasty is a dynasty with the pool locked to one club, so
it sits under the trophy in both places. Counting it separately is how a card ends up
claiming four of something a reader can only find three of. Both suites assert the value, the
mark count and that no digit followed by "modes" has reappeared.

That CSS rule is written `.pw-card .pwc-go .pwc-marks`, a class deeper than it looks like it
needs. The football page carries `.pw-card .pwc-go span{display:block}`, so a shorter selector
loses, the three marks stack into a column, and nothing anywhere reports it.

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

**A free player loses a dynasty on two things and a clock is not one of them.** Ending it
themselves, and being fired. Every other way one can go is a bug, and every one of them is
silent, because nothing throws when a save is removed. Two have already been found:

- **`dynNewSheet` cleared the save and asked the allowance afterwards.** So the trade this
  sheet exists to make (this run for a new one) could be taken halfway: the dynasty went,
  `beginDynastyDraft` then refused on a spent day, and the player was left with the spent
  sheet and nothing. Every `dynClear` that trades one run for another now checks the day
  BEFORE it clears, and `dynastyReplaceSheet` checks again on the press, because it is the
  one path that reaches `beginDraft` without going back through the gate.
- **The front door refused to open a saved run on a spent day.** It protected nothing: the
  wall that matters is inside the run, at `dynToWinter`. A dynasty the game will not let you
  look at reads as a dynasty the game has taken, however good the countdown beside it is. The
  door resumes always; a spent day only changes the line under it, to when the next season
  lands.

The mid-season gap is already covered and worth not re-breaking: `spendTheDay` calls
`dynSave` immediately, and `dynAtRest` allows a save at `SEASON` week 0, so a tab closed
mid-season comes back to the squad screen with `paidSeason` already set. The season is
replayed and not re-charged.

## A run in progress belongs to the account

```
node football/check-cloudsave.mjs                    the dynasty, both directions
node cfb/build/test/commish/test_cloudsave.mjs       the term and the career (needs :8080)
```

`supabase/103_cloud_saves.sql` is the record and `/assets/cloudsave.js` is the one client
both games use. A dynasty and a commissioner's term were both in localStorage and nowhere
else, which loses them to clearing site data, a private window, iOS evicting a site nobody
visited for a week, a phone that is not the laptop, and a second account signing in on the
same browser. **None of those throws.** The only symptom is a front page offering to start
something the player was forty seasons into.

**localStorage is still written first and synchronously, and that is deliberate.** A dynasty
autosaves on every cut and every signing, and a game that waited on a round trip for each of
those would be worse than one that loses a save. The browser copy is a cache of the table
now; the upload rides behind through `RTG_SAVE.queue`, which keeps one request in flight per
slot and builds the payload at SEND time so what goes up is the run as it stands when the
wire is free.

**Every call fails soft, and null means "no opinion", never "you have no save".** A shelf
that cannot be reached must never be the reason a run goes, which is the entire point of the
file. Both suites assert the mode is exactly as playable with the network on fire.

**Progress decides a conflict, not a clock.** Every write carries how far the run has got
(`dynProgress`, `termProgress`, `careerProgress`), and the server refuses one that would move
a save backwards, handing back what is stored so the caller can adopt it. Device clocks are
wrong often enough to matter and last-write-wins fails in exactly the direction this exists
to prevent. It costs one thing: a deliberate restart on a second device would lose to a stale
browser holding season 40. That is why **starting over DELETES rather than overwriting**, in
`dynClear`, in `beginDynastyDraft` and in `newTerm`, and the trade is the right way round.
Losing a restart costs a redraft; losing a forty season dynasty cannot be undone.

**A delete goes through the same queue as the saves.** Starting over deletes the row and
saves the new run a moment later, and raced over the open network the delete can arrive
second and take the NEW run with it. `RTG_SAVE.drop` is queued per slot, so it also discards
whatever write of the old run was still pending.

**Adopting only happens where it is safe.** The football pull lands on the front page and the
commish pull only while `#s-gate` is showing, because replacing `world` under somebody
mid-beat swaps the sport out from under a decision they are making. The mark is dropped
rather than kept when it has to skip, so the next visit asks again.

**The football page has ONE game key and three slots**, and `FB_SLOTS` is where the three
become one thing. `open` and `club` are the two dynasties, `trade` is a Trade Machine season.
The key is still `ps_dynasty`, which is historical rather than descriptive: it was written
when a dynasty was the only run being kept. Changing it now would strand every row already on
the shelf, which is the one thing a save table must never do to itself. One key is also what
keeps the boot to a single round trip; a second key for the Trade Machine would be a second
request on every boot for every signed in player, which is most of them, to ask something the
first request already answered.

A trade run measures progress by phase and week rather than by seasons finished, because it
IS one season. `TRADE_PHASE_RANK` exists because the playoff weeks do not continue the
regular season's numbering, so a week-only measure goes backwards at the seeding screen and
the server then refuses every save for the rest of the run, with nothing on screen to say so.

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

**`situation.js` is the second place that number lives, and it is not in the page.**
`sit.lastYear` and `sit.seasonsLeft` are how an authored item asks whether this is the final
season, and both were arithmetic on a literal 5. Nothing threw. Media day's "this is the last
July of your contract" fired in year five of an eight year term, three summers early, and
then never again in the year it was true, while a three year leash reached its last summer
with the item still locked. Both read `world.termSeasons` now, with the same five season
fallback the page uses, and `test_situation.mjs` asserts a three, an eight and a save from
before renewals, through the media item's own gate rather than through the flag.

**And the copy has to survive a renewal too, which is where most of this hid.** Six
player-facing strings said "five" on a screen the contract had already made wrong: the
calendar footer, the situation strip's "Season 3 of 5", the ending's champions heading, the
tape's lede, the share card's opening sentence and two lines in `report.js`. None of them is
reachable by a checker, because "five years" is a correct English sentence. **When a number
is in copy, either interpolate it or write the sentence without it.** The share card now
names the years rather than counting them, which is true whatever the contract said and true
when a sacking cut it short.
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

### The sport can grow a new part

```
node cfb/build/test/commish/probe_longrun.mjs             30 runs of 50 seasons
node cfb/build/test/commish/probe_longrun.mjs --bold      the commissioner who takes every door
node cfb/build/test/commish/probe_longrun.mjs --years 80 --runs 40
```

**Measure before writing more content, because the obvious fix is the wrong one.** The probe
plays long terms and reports what a commissioner actually meets. Before frontiers existed:

| by year | distinct items | ledger fields moved (of 63) |
|---|---|---|
| 5 | 34.0 | 28.3 |
| 25 | 57.7 | 38.0 |
| 50 | 61.4 | **38.6** |

The right column is the one that matters. **The sport stopped moving at year 25.** Every field
a ruling could push had been pushed, and the next twenty-five years pushed them back and forth
inside the same sixty-three. Writing another hundred items would have given a player more to
read and the same sport underneath.

**A THREAD IS NOT THE ANSWER AND IS NOT MEANT TO BE.** `plant` puts a consequence in the
future, the payoff item rules on it, `cut` files it, and the world is the same shape
afterwards. That is right for a lawsuit. A **frontier** (`cfb/commish/frontier.js`) is the
other kind of change: crossing one **seats a bloc**, **grafts fields onto the ledger**, and
**opens items that could not have existed before**, and none of it unwinds.

**`opens` rides on exactly one option of one item.** `docket.js` copies it onto the edit,
`ledger.applyEdit` performs the crossing BEFORE it writes, and the order is load-bearing: the
same ruling usually sets the fields the crossing just grafted, so run the other way round the
`set` throws on a path that is one line from existing.

**The era is derived, never stored.** It is the highest era with a frontier crossed in it. A
stored era is a second copy of an answer and the two drift the first time somebody adds one.

**Three rules hold the ladder together and all three are load-bearing:**

- **Every rung gates on `FR.open()`, never on a year.** A conservative fifty year term sees
  none of it and is playing correctly. Gate on the year and it is a cutscene.
- **The strange option is never the only option, and never the safe one.** A ladder whose
  rungs are all "yes" is a corridor.
- **Nothing is announced.** No tech tree, no "you have unlocked". The room gets bigger and the
  arguments get stranger, which is what it would feel like.

**A refused frontier goes quiet for four years** (`FR.quiet`). The ordinary `recency()` penalty
is right for an argument the sport has every year and far too gentle for these: measured at
it, every run refused the same door four or five times. Turning down the fund is a decision a
commissioner defends for years.

**Reachability is measured, not assumed**, because a rung nobody reaches is the unearnable
badge again. The floor and the ceiling are both failures: nobody crossing anything means the
gates are too tight, everybody on Mars by year 12 means it is not a chain.

| | year 50 | reaches the colony |
|---|---|---|
| ordinary run | era 3.8, ledger 91 fields, 13 in the room | 7% |
| takes every door | era 4.9, 14.8 in the room | 93% |

**Four guards in `test_docket` exist because four things went wrong writing this**, and each
one was silent:

- **A frontier nothing opens is dead content.** `antitrust` was declared with no item that
  crosses it. The chain sweep walks it the way a term does (cross what is open, look again)
  and reports an unreachable rung like any other unreachable item.
- **Every bloc a frontier seats must be written in `blocs.js`.** The two lists are in two
  files, and a name in one and not the other seats somebody with no weights, so `react()` dots
  an undefined and puts NaN on the desk.
- **Every bloc in the room needs its OWN voice.** `line()` falls back to `VOICE.Fans` and says
  nothing about it, so the first term to seat a President had the President of the United
  States answering with "My grandfather sat in that stadium. He would not recognize the
  schedule." Right number, right mood, somebody else's sentence, and a wrong line is a valid
  string. Five bands, `VARIETY` lines in each, and no line shared with another bloc.
- **A grafted path is not a typo and the guard has to know the difference.** `FR.allPaths()`
  is what keeps that list finite; a path in neither the opening world nor any frontier is
  still the error the check exists for.

**The term fixture samples twelve seeds now, and that is a fix rather than a loosening.** It
pinned one magic seed, had already broken once, and broke again the day the ladder was
written, for the same reason both times: the pick is deterministic on the pool, so **adding
any item anywhere reshuffles every seed's term**. A magic number is a test that fails on the
one action this mode sees most of, which is somebody writing content. What those assertions
are about is a property of the docket, and a property is checked across a sample. The replay
assertion still pins one seed, because determinism IS a claim about one term.

**Two field-shape mistakes worth not repeating**, both caught by `test_desk` and both invisible
in the source: `posture.bowlTieIns` holds a BOOLEAN and an item wrote the string `'open'` into
it, and an option `set` a METER directly. Meters are derived from effects, which is why there
is no name for one in `PATH_NAME` and why the desk had nothing to print.

**`cross()` enforces the chain as well as `open()` does**, and that is not belt and braces.
`open()` is what an item's `when()` asks, and an item is hand-written data: the one thing an
author can forget is the gate. Forget it and `opens: 'colony'` puts a team on another planet
in a sport that has not let anybody hire an agent yet, with nothing anywhere complaining. It
THROWS, the same way `applyEdit` throws on a path the world does not have and for the reason
that file gives.

#### An allowlist in the middle of a ruling ate the whole mechanic

**`fallout.merge` folded the tail into the edit by naming the keys worth keeping**, so it
silently deleted anything added later, and only on the rulings a tail happened to roll on.
`written` had already been bolted back on at the bottom of that function for exactly this
reason, years earlier, which was the warning nobody read.

What it cost, in order: `opens` went missing, so `applyEdit` no longer crossed the frontier,
so it was asked to write a field the crossing grafts, so it threw by design in the middle of
the ruling handler. No ledger write, no room, the screen frozen on the desk, and the button
the player had just pressed doing nothing for ever. **Every headless suite passed**: the
docket resolved the option correctly, the ledger applied the edit correctly, and the two were
only ever wrong together, in the page, when a third thing fired.

It starts from a copy of the whole edit now. `test_docket` asserts the PROPERTY rather than
the key: every field of the ruling survives the merge, whatever the fields turn out to be
next year.

#### The walk that found it

```
node cfb/build/test/commish/test_longterm.mjs              a term, the ladder, both tiers
node cfb/build/test/commish/test_longterm.mjs --seasons 12
```

Nothing else here plays the mode. Every other suite asks whether one screen is right, and the
bug above lived in the join between three files that were each individually correct. This one
takes beats the way a player does, then crosses all ten rungs through the real desk, and
collects `pageerror` throughout, because a mid-beat exception leaves the last screen up and
stops responding, which is the only symptom a player ever gets.

**Four screens a walker has to know about**, each of which cost a round of hunting:

| screen | what it needs |
|---|---|
| `#b-desk` | ONE button, two jobs: it starts the month, relabels to "Tap to skip", and only opens the desk on the press after the walk finishes |
| `s-press` | media days is a lectern: the answers are `.opt` divs, not buttons, then `#b-say` |
| `s-room` | media days ends here too, not just rulings. One button, `#b-next` |
| `s-year` | drawn at the end of EVERY season. `#b-year-next` carries on; only `#b-term-share` marks a term that is really over |

That last row is `test_ending`'s lesson arriving a second time: **key on structure, never on
what a button says.** Reading `s-year` as the ending stopped a five season walk after the
first autumn and reported a mode that had seized up.

**The bot takes the middle option**, which is the fixture bot every other suite here uses.
Measured over forty terms: always-first is fired 36 times of 40 and 12 of those in year one,
random 30 of 40, middle 11 of 40. Always-first tests the removal screen rather than the mode.

### A setting has to LOOK like a setting

**The mode is nothing but named rules and what they currently say, so a value printed as
ordinary text is unreadable.** The doctrine sheet named a rule in 25px display caps and set
its state directly under it in 34px display, which produced this:

```
GOING PRO AND COMING BACK
allowed
```

One sentence with a line break in it. Nothing failed: the sheet rendered, the words were
right, and a reader could not tell which half was the name. `pathValue()` answers in ordinary
English (`allowed`, `this office`, `12 teams`, `a phone company`), so there is never anything
in the TEXT to tell a rule from its state. The treatment has to do all of it.

**Three surfaces, one idea, and they must not drift apart:**

| where | what a value looks like |
|---|---|
| the sheet a rule opens | `stateCard()`: a labelled box, eyebrow reading `Right now`, a rule down the left edge, gold when you moved it off what you inherited |
| the year card's nine rows | the value is a chip, the name is quiet beside it |
| the settled card | the same chip, in green, because that card is the green one |

**The value is never bigger than the name above it.** That is the original mistake stated as a
rule. The label and the box are what make it findable; the size never was, and a value set
louder than the rule it belongs to is a screen whose loudest thing answers a question the
reader has not been asked yet.

**`stateCard()` sizes the value off its own length**, in three bands, because one call answers
`yes` and `Mercedes-Benz Stadium, Atlanta`. Bands rather than a continuous scale, so two
sheets opened one after the other look like the same screen. The longest band drops the caps
too: caps are what make a short value read as a token and what make a long one hard to read.

**`moved` is decided on the PRINTED value, not the raw one.** Shares round to whole percent,
so 0.224 against 0.221 is a change in the ledger and no change at all on the card, and a gold
"was 22%" under a value reading 22% tells somebody they did something they cannot see.

**`test_page.mjs` checks the parts that carry the meaning, not the words**: that the value is
labelled, that it is in a box, and that it is between 18px and the heading's own size. That
floor is not belt and braces. Writing the ceiling is what put a paragraph of prose outside a
CSS comment, which swallowed every rule for the value after it, and the one-sided check read
15px against a 25px name and PASSED.

**One pane serves every one of these sheets and it scrolls.** `showFact()` resets it, AFTER
adding the `on` class: the sheet is `display:none` while shut, and a `scrollTop` written to an
element with no layout box is dropped and then handed back the moment it becomes visible. Put
first, the reset did nothing at all and nothing said so.

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

### Full Team, and the screen that has to say the most

```
node football/check-fullteam.mjs   the door, the gate, and the draft screen
```

Twelve slots instead of six, and the side of the ball alternating pick by pick. Everything
that goes wrong here goes wrong SILENTLY: the draft renders, the wheels turn, the game is
playable, and the picture is describing a different pick from the one the board is offering.

**The field lit the wrong half, and it was not a corner case.** The glow read
`run.roster.length` and the BOARD chose its pool from `nextOpenSlot()`. Those are not the
same number: a man goes into whatever open slot fits him rather than the next one along, so
the two come apart the first time anybody signs against the slot order. Of the roster shapes
reachable inside six men, **1,190 have the two readings naming different sides**, and the
cheapest is the second pick of the game. Take a running back first and he lands in slot 2,
so `roster.length` is 1 (slot 1 is a DL) while the first open slot is 0 (the QB). The board
then served quarterbacks while the field glowed blue over the defense. Driven for real, the
old reading was wrong on **four of six picks**. Anything asking which side is picking must
call `nextOpenSlot()`, which is what `dataNow()` uses to choose the pool.

**The checker proves it is testing something.** A run where the two readings never diverged
would pass green having exercised nothing, which is the badge-that-cannot-be-lit trap in a
different coat, so it takes a running back first on purpose and then ASSERTS that the old
reading disagreed at least once.

**What the screen shows for it.** The lit half says which side the man comes from, the open
chips on the other side are dimmed to .5 so they recede without leaving, and the unit label
already printed at the line of scrimmage comes up to that half's colour. The first attempt
dimmed to .26 and a phone screenshot showed the offensive half of a defensive pick with
visibly nothing in it: the field read as a six man squad. Dimmed, not hidden.

**The side is NOT in the HUD, and that was tried.** `Spin 6 of 12 · Defense` truncates to
`DEF...` at 390px against the money line beside it, which answers the question with the
first three letters of the answer. The field carries it instead.

**`hp-ft` is the door's own fill and the checker asserts it.** `.hp-full` is the shared card
shape, worn by the Trade Machine too, and on it alone this door had no colour at all:
shot on a 390px phone between a saturated red/blue pair and a gold-bordered dynasty card, it
read as a control you cannot press rather than as a quiet one. The fill is red, a dark seam,
then blue, which is the pair above joined into one control, which is what the mode is. Not
warm, so the note on `.hp-full` about two warm cards reading as a menu of side modes still
holds.

#### The results screen had to show its working, and two of its numbers were wrong

The mode that asks for twelve picks explained less than the one that asks for six. Every
single-unit mode ends on a sentence a player can check by hand: so many squad FPPG, this
much chemistry, this much for how the six fit, which IS the overall. Full Team got
`Offense 15.7 and Defense 99.4, averaged` and stopped. Two numbers and a verb.

**Composing that sentence in the page is what made it wrong, three ways at once.** Driven
to a real results screen it read:

```
99 squad FPPG, +2.1% chemistry and -44% for how the six fit together,
which is a 57.5 team overall.  You spent $277.0M of $140.0M.
```

- **`-44% fit`** was `rosterStructure()` over all TWELVE men, which is the
  0.57-for-everybody reading `overallOf` warns about. That team's halves were at -12% and
  +3%.
- **`+2.1% chemistry`** was the flattened average. The units are rated with their own two,
  and the same screen was printing those a few hundred pixels lower.
- **`You spent $277.0M of $140.0M`** printed `CONSTANTS.CAP_MUSD` on a mode given
  `FULL_CAP_MUSD`. A legal roster reported as $137M over a cap it was never under. Use
  `R.capOf(run)`, which is what every gate in run.js already asks, **and count the coach**:
  he comes out of the same cap, so a hire was money neither this line nor the Spent cell
  saw.

**So the parts ship with the answer.** `fullSideRatings()` returns `parts` (each side's
points, chemistry, fit, men, the talent scale and the defence's raw product) and the table
is drawn from them. A breakdown that disagrees with the rating is no longer a thing that
can happen, because it IS the rating's working.

**Both unit rows arrow rather than equal, and that is the honest sign.** Two things sit
between the inputs and a unit's rating and neither is a lever: `FULL_TALENT` scales both
sides (a fitted constant, identical for everybody, so printing it would dress tuning up as
a decision) and a defence's product is points it GIVES UP, which `defenseOverall()` puts on
the offence's ladder. The mean and the coach below them do equal, and carry equals signs.
**The How close tab already explains the scale in a sentence a player can use**, so the two
are halves of one explanation; do not delete that paragraph as a duplicate of the table.

**Three display bugs found by looking at it rather than by reasoning**, all the same shape:
a term at 1.004 printed `0% FIT`, a coach at +0.08% printed `0%` above a number he had
moved from 65.9 to 66.0, and a `const` read a hundred lines before its own line threw TDZ
and took the whole results screen down. **Decide on the PRINTED value, not the raw one**,
which is the rule the commish state card already carries.

**The arithmetic is guarded in the ENGINE, not through a played season**, because what can
go wrong is multiplication. `check-fullteam.mjs` rebuilds each side from its own parts and
asserts the fit is per side rather than over all twelve. Building that fixture caught the
same class twice: `player_seasons.json` holds no defenders at all (they are a second
download, which is why every path into the mode calls `loadDefensePool` first), and a
defender's production is `idp_ppg_mean` on disk, copied onto `ppr_ppg_mean` as the pool
arrives. Both mistakes put twelve men with no production into the empty branch, where every
identity holds at zero and the whole section passes green. **It asserts the fixture is a
real team before it asserts anything about it.**

**It is still unannounced and this file is one of the two things checking that.**
`fullteam-access.js` ships `FULLTEAM_LIVE = false`, the door is BUILT by
`ensureFullButton()` rather than revealed, and the checker asserts from the reader's end
that an account off the list gets no door, no node, and the words nowhere in the page.
`check-premium.mjs` asserts the same thing from the other end.

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

## The arcade's "How to play" blocks

```
node scripts/check-howto.mjs
```

Each of the twelve game pages carries a `<details class="gj">` block: what the game
is, the rules, what a day costs, and three tips. The tips and the entitlement
paragraph are two different kinds of copy and they go wrong in the same way, which
is why one checker covers both.

**Nothing reads a tip, so a tip goes stale in silence.** It is not a rule, no code
consults it, and the game keeps working perfectly while the advice stops being true.
Two of the three Sportegories tips were wrong on inspection: "bank the easy
categories" asked the player to work out which those were, and the page prints the
tier on every row. A draft tip naming the hard rows by position would have been true
and useless for the same reason, and false the day anyone retuned `TIER_PLAN`.

**So write a tip from the code, not from the game's description.** Read what the
screen actually shows before writing advice about it. The good tips are the ones
naming a mechanic the rules state but never draw a conclusion from: a player can only
be used once in Sportegories, a clue costs no guess in Guess the Player, an
unrecognised spelling costs nothing in Alma Mater, a Reveal never reaches the
crossword board.

**The entitlement paragraph is the same fact written by hand twelve times**, and it
was wrong on all twelve. It said the four free games "come free with a RunThe.GG
account". They do not: `tokens.js` gives them to a signed-out visitor with no
sign-up, and what an account adds is that the result is SAVED, plus one play of each
card game, once ever. So twelve pages asked a stranger to sign up for something
already free, which is the wall the "A VISITOR PLAYS FIRST" note in `tokens.js`
exists to knock down. Nothing failed, and nothing could.

`check-howto.mjs` holds the names and the numbers to `tokens.js`: the free four by
name, "all twelve" against `GAMES`, "five of the games" against the pages that
actually load `mode.js`, and that every card game says its free play is once ever
rather than daily. It runs in CI on any arcade page or on `tokens.js`
(`.github/workflows/howto-check.yml`). Section 8 of `check-sportegories.mjs` does the
narrower job for that game's tips.

**Two surfaces say "how to play" and both need the edit.** The block above is the
long one; `arcade/howto.js` is the "?" modal that AUTO-OPENS on a first visit, which
makes it the more read of the two.

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
