# College Football and Commissioner Mode

This file holds the decisions for this game. The repo-wide rules are in the root CLAUDE.md.

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

### The Commish door is always there, and a shut one offers the bundle

Who SEES the mode and who gets SOLD to are different questions, and `cfb/index.html` keeps
them apart on purpose:

| | asks | so that |
|---|---|---|
| the front page door and the modes sheet card | `commishShow()` | everybody finds the mode |
| the offer card | `commishOn()`, which still wants a signed in account | nothing is sold to somebody who cannot own it |

A purchase is tied to an account, so a card asking a stranger for money cannot be honoured;
`test_store` asserts that. The DOOR had no business behind the same test once the mode
launched, because a signed out visitor then got no sign anywhere on `/cfb/` that
Commissioner Simulator exists.

**The tap is taken in exactly one case and the history is why.** This page used to take
EVERY non-owner's click and repaint it as the store. That was removed the day the free tier
shipped, and the bug report was a signed in free account tapping the door, getting the
store, and reading the whole mode as locked with no way in. A free account with a season in
hand still goes straight through, plays it, and is sold nothing on the way.

What is different is the reader that helped nobody: a free account whose season is spent, or
whose one free term is finished. They tapped, watched the mode load, and landed on the wait
wall, which carries the offer. The offer was always where that tap ended. It arrives a
screen sooner now, and the difference from the version that produced the bug report is that
the tap is only taken when the door is genuinely shut.

**`blocked()` in `clock.js` is that rule, written once, and it is deliberately NOT what
decides.** The mode decides by SPENDING, because only the server can, and `seasonWall()`
reads `ok` off that answer. This is a hint for a screen that would rather offer the store
than send somebody through a door it knows is shut, so being wrong costs a tap rather than a
season. It fails open like everything else in that file: an unknown answer sends them to the
mode, which asks properly and draws the right screen either way.

`preventDefault` fires only on that branch, so middle click, open in a new tab and a long
press keep working the way an anchor should.

#### The door is a character card, and there is one commissioner

`cfb/commish/portrait.js` draws him: a man in a navy suit, the same on the front page door,
the new term screen and the office header. **There is deliberately one of him.** The owner
asked for the customization to stay minimal, so there is nothing to pick. Every id inside
the SVG carries the caller's suffix (`CM_PORTRAIT(size, id)`), because two portraits on one
page sharing a gradient id paint each other and the face goes flat with nothing thrown.

The door (`ensureCommishDoor`) reads a term in progress off `cfb_commish_term`, the save the
mode writes, and shows the season and its three meters (`revenue`, `health`, `standing`)
with a Resume button. A term with `careerLogged` set is finished and is not offered. The
save carries the whole tape, so it is parsed once per page load (`commishTerm`). The sentence
under the name and its unbreakable tail did not move: test_store still holds it to two lines.

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
| Dynasty, new runs | **1 a day** (106, a second meter) | when the run is started |
| Commissioner | **1 season a day** | when each season ends |
| Trade Machine | **1 run a day** | Eastern midnight |
| Full Team | **1 run a day** | Eastern midnight |

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

### The standings, and the one board allowed to hold everybody

```
node cfb/build/test/commish/test_standings.mjs   the screen, in a browser, four states
createdb tenure_test && psql -d tenure_test -c 'create role authenticated; create role anon;'
psql -d tenure_test -f supabase/test/terms_base.sql
psql -d tenure_test -f supabase/96_commish_terms.sql
psql -d tenure_test -f supabase/105_commish_tenure.sql
psql -d tenure_test -f supabase/test/tenure_test.sql
```

**The whole competitive layer was built, deployed and invisible.** `95_commish_choices.sql`
records what everybody did with one item, `96_commish_terms.sql` records what a whole term
added up to and ranks it, `splits.js` has carried the client call for both since the day it
shipped, and `commish_doctrine_board` **was called by nothing**. A player saw their placement
once, on the ending screen, in the second the term finished, and then it was gone: no way
back, no way to see who was above them, nothing to send anybody. That is a receipt, not a
board. `commish_term_standing` was not wired at all.

Nothing failed, because every call in `splits.js` resolves to null rather than rejecting.

**The score board is scoped to a doctrine and that is not negotiable**, for the reason 96's own
header gives at length: ranking six report cards on one line rewards upsetting nobody, because
the way to do well on the books AND the audience AND the room at once is to take no side, and
a board like that quietly tells every commissioner to play the same careful term. The question
is not who ran college football best, it is who ran it best out of the people who wanted what
you wanted. Nine boards, no way to be top of all of them.

**Tenure is the one exception and the test it passes is the test any future global board must
pass.** Years in the chair has no set of values behind it: you can last forty years as a
Landlord or as a Reformer, and the room removes you for losing it rather than for what you
believed. If a proposed board would tell somebody how to play, it belongs inside a doctrine.

**`105_commish_tenure.sql` SUMS, and that is a decision about what `years` means.** A row's
`years` is ONE CONTRACT: `renewTerm()` sets `world.startYear` to the current year, so five
seasons then a renewal for eight files rows of 5 and 8 rather than one of 13. Ranking on
`max(years)` would rank the longest CONTRACT and punish the commissioner the mode is most
pleased with, the one the room kept re-signing. The tiebreak is FEWER TERMS, because twenty
years over two contracts and twenty over six are not the same person, and `terms` is on the
row so a reader can see which is which rather than trusting the order.

**A term with no score is on the tenure board and not on the doctrine board.** One is sorted by
score and cannot rank a null; the other is time somebody spent doing the job.

**`commish_my_tenure` writes the ordering out a second time by hand**, and that is the thing
most likely to rot here. Your place is counted against EVERYBODY, not against the fifty rows
the board returned, because a page that worked out "you are 51st" by failing to find itself in
the top fifty would tell the two hundredth commissioner the same thing as the fifty first. Two
implementations of one ordering is exactly the shape that drifts, so the last section of
`tenure_test.sql` walks every account and asserts the two agree.

**A board has four states and three of them ship broken.** Unreachable, nobody has finished a
term, and you have not finished one: each needs a different sentence, because a blank box is
how a feature teaches somebody it is broken and a spinner that never resolves is worse. On a
mode this new "nobody yet" is the COMMON case, so it says being first is the prize.

#### Two things called the standings

`paintStandings(el, sim)` already existed and draws the PLAYOFF table. The board painter was
called that too for about an hour. **Function declarations hoist and the later one wins**, so
every call resolved to the playoff painter, which opens `if (!el) return;` and was being handed
nothing: it returned immediately, every time, and threw NOTHING. The screen opened, stayed
blank, and the console was clean. It is `paintBoards` now. Same failure as the wrestling game's
one-file collision in the section below, with a quieter symptom, because the survivor had a
guard clause instead of a missing function.

**`doctrine.profile()` answers null with no rulings, which is correct and is a trap.** It reads
the rulings made so far, so it is null at the START of a term, which is the most likely moment
somebody opens a board. Reading only the live term meant the gold "this is your doctrine" mark
never appeared for anybody and every board opened on the Caretaker. It falls back to the career
shelf, which stores the doctrine's NAME rather than its id, so it maps back through `NAMES`.

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

## College Fantasy Challenge, a competition of its own

```
node cfb/build/test/test_fantasy.mjs --quick   the builders, no network, no browser
node cfb/build/test/test_fantasy.mjs           and the page, in a browser, against a stub
node cfb/build/fantasy/pool.mjs [--week N]     the week about to be played (dry by default)
node cfb/build/fantasy/injuries.mjs --write    who is out, for the live week
node cfb/build/fantasy/live.mjs --why          what a live tick would do
psql -d cfbf -f supabase/test/fantasy_base.sql, 101, 111, then 128, then
psql -d cfbf -f supabase/test/cfb_fantasy_test.sql
```

`cfb/fantasy/index.html` is the NFL page ported, and it lives only in the college game
(the door is on `/cfb/`). **It shares no row with the NFL challenge**: its own tables
(`cfb_fantasy_*`, `supabase/128_cfb_fantasy.sql`), its own board, its own prize, its own
localStorage key (`cfb_fantasy_<season>_w<week>`). `football/fantasy/entries.js` serves both
and reads `window.PS_FANTASY_PREFIX` at call time; absent is the NFL. The page test asserts
not one call reaches an NFL table and not one key is written under `ps_fantasy_`, because a
port's quiet failure is keeping a piece of what it was ported from.

**ESPN IS THE ONLY SOURCE.** No CFBD key is set, and nothing else reachable carries college
box scores. `site.api.espn.com` answers 403 to some runner IPs, so `espn.mjs` asks
`site.web.api.espn.com` first. ESPN athlete ids are CFBD's, so a man's prior season in
`cfb_player_seasons.json` joins on `player_id`.

| | how |
|---|---|
| the slate | the twenty highest scoring FBS games of the week (`pickSlate`), by rank, spread and total |
| the season so far | `cfb/data/fantasy/season_<season>.json`, every finished week's box scores, read once |
| the projection | season to date, a prior from last season, availability and the Vegas implied total |
| the cap | swept on each week's own board (`cap.mjs`), the round number where greedy and budget cross |
| the swap | any man, before his game, for a man at his position priced at his price or up to a quarter (and at least $5M) below |
| settling | ESPN's box score, final once every game is over and the last kicked off 4.5 hours ago |

**THE SWAP IS OPEN TO ANY MAN, not only a flagged one.** College football files no injury
report, so the page flags what it can find (ESPN's out and suspended roster groups, any
designation ESPN carries, and who missed his team's last game) and the entrant acts on the
rest. The band stops it being an upgrade: never above his price. The band rides on the week
row, so the page and the server read one number.

**THE WEEK LOCKS AT THE FIRST SLATE KICKOFF**, which is often a Thursday or Friday night.
**THERE IS NO RESULTS FILE**: points live only in `cfb_fantasy_results`, and the page shapes
the server's answer as the NFL page's file so nothing downstream branches.

Workflows: `cfb-fantasy-pool.yml` (Monday 11am Eastern, dry run by hand), `cfb-fantasy-injuries.yml`
(twice a day, commits only when the report moved), `cfb-fantasy-live.yml` (a loop woken by a
wide cron net from Thursday evening to early Sunday UTC). The prize is the NFL's rule
exactly: 30 days of Pro on the `fantasy:` source prefix (`fantasy:cfb-<season>-w<week>`), so
the gold name, checkout and receipt filters that already skip a pass skip this one too.
