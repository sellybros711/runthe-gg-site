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
`mythiball`, `golf`, `cfb`, `football`, `assets` and `baseball`. The rest of the
repo predates the rule and still contains hundreds of em dashes; add a directory to
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

**`baseball` was a contained job**: 57 offenders across six files, and almost
all of them wanted a colon, a full stop or a pair of parentheses.

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

### The OTHER pair of hand-written numbers, and it is the silent one

A `?v=` is not the only number a page keeps about a sibling script. Several also pin the API
they expect and refuse the module when it disagrees:

```js
const BOARD_VERSION=17;
const B=(window.PS_BOARD&&window.PS_BOARD.API_VERSION===BOARD_VERSION)?window.PS_BOARD:{...
```

**A stale `?v=` fails loudly**, as a missing function on somebody's phone. **This one fails
softly, by design**, and that is what makes it worse. The page falls through to a stub that
answers every call with null, so a `board.js` that is blocked, or a version behind, degrades
to "not reachable" instead of taking the game down.

**It shipped.** Adding `dynRunState` and `dynRunStart` moved `board.js` to `API_VERSION: 17`
and `BOARD_VERSION` in the page stayed at 16, so **every visitor ran on the stub**: the
leaderboard printed the stub's own `lastError` ("board.js failed: 0 blocked") and the
profile's runs played and best rating came back as dashes, because `mine()` and `ranks()`
answer null. Nothing threw, no check went red, and the site looked exactly like a site whose
network was having a bad day. Reported by a player.

`check-cachebust.mjs` holds the pair now. It reads the comparison out of the page, resolves
the receiver through any alias to its global, and resolves the global to whichever script on
that page assigns it. **By who SETS it, never by what it is called**: the first draft asked
for a `PS_` prefix, which is the football game's convention and nobody else's, and reported
that it could not tell which module `E` was on a hoops page that is entirely correct
(`RTF_ENGINE`, `RTF_RUN`). Seven pins across the site today.

**Coverage is half of it, the same as `check-numbers`.** A page that COMPARES an
`API_VERSION` and yields no pair is a broken reader, not a clean page, so that is a failure.
The rule keys on the comparison rather than on the word, because the stub below it writes
`API_VERSION:BOARD_VERSION` into itself and would otherwise count as a pin.

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
node scripts/check-account-states.mjs  both games come up in all eight account states
```

That last one asks the dumbest question of every state rather than one rule of one
state: does the page start, does it throw, is there something to press. A boot crash
in ONE account state has already shipped here (`pwArt is not defined`, below), and it
shipped past a green suite because no check opened that state. The three states worth
knowing about are the ones where there is no answer to work with: accounts offline,
the premium call erroring, and the premium call never coming back.

**Measure type in a headless browser and you are measuring the FALLBACK face.** The
Google Fonts request does not resolve in the dev sandbox, so `document.fonts` is empty
and Anton is silently replaced by a generic sans about 36% wider per character. That is
enough to make a headline that fits look like it overflows the viewport by 119px, and
to make a check that asserts on width report a bug that does not exist. `document.fonts
.check('100px Anton')` answers **true** either way and will not save you. Measure the
string in the asked face against a known fallback: if the two widths match, the face
never arrived. `.htitle h1` carries the arithmetic that was verified this way.

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
**four** of them (the football front page, the football profile, the college front page, the
college profile) and each page used to draw its own, so on one day, about one purchase, they
read "4 modes", "3 modes" and a sentence. `RTG_STORE.card()` and `.cardInner()` draw all four
now, and the `.pwc-marks` rule is in the store's injected CSS rather than in either page.

**The college front page was the one that had no card at all**, so the offer lived two taps
behind the avatar and the only screen every visitor to that game sees never mentioned that it
has a paid tier. That is a quieter version of the wall the college profile card was added to
knock down: a store you can only reach by going looking for it. `ensurePremiumCard()` there
mirrors `ensureCommishDoor()` beside it, built rather than shipped hidden and removed when the
answer changes, and it is gated on `premiumPitch()`, which asks `commishOn()`. While
`COMMISH_LIVE` was false the only thing that card sold on that game was a mode the reader
could not open, so the door and the card appear together. **That day has been and gone**: the
flag is true, and the two are drawn together because they always ask the same question.

**And the WORDS drifted anyway, which is the same fix arriving twice.** Moving the markup in
stopped the cards having different shapes and left the two strings as arguments each caller
passed, so the football front page read "Unlock every mode" while both profiles read "Unlock
everything". The football page even carried a comment claiming "it says the same thing on all
three" directly above the line that passed something else: the claim was about the markup and
read as a claim about the sentence. **`cardInner()` and `card()` take no words at all now**,
not even an overridable default, because a default that can be overridden is the same argument
with a politer name. It is `PW_CARD_TITLE` and `PW_CARD_SUB`, once.

The title is **the heading of the sheet the card opens**. A reader who presses "Unlock every
mode" and lands on an `<h2>` reading "Unlock everything" has to stop and work out whether they
got the screen they asked for. Both suites assert the two cards match each other AND match that
heading, because value and mark count agreed across all three cards the whole time the words did
not, and a check on the parts the store owned could not see the parts it did not.

**The sub is measured, not written.** The card's text column is whatever the value and the marks
leave: 200px at 390px of viewport once the fourth mark is there, 170px at 360. `No daily limits.
One payment, lifetime.` needs 240 and wrapped on every phone anybody holds, leaving `lifetime.`
alone on a second line. `No daily limits. Pay once.` holds one line at 360 and up. The sheet
still says "One payment" on a chip beside each price and that is not drift: the sheet has the
room, the card has a third of it, and the CLAIM is the same. `check-premium.mjs` asserts the
line count at each width rather than counting characters, because the column depends on the mark
count and the mark count depends on the reader.

What it says is **Unlimited**, over the marks the sheet's hero row uses, in the same order. A
count was the wrong half to lead with: what a free account meets is the counting, so the value
is the word that answers it. **The marks are the TILES, not the named lines under them**, and
the number is derived rather than written: three on the college page, four for a football
reader who can open Full Team. One Franchise Dynasty is a dynasty with the pool locked to one
club, so it is itemised on the Premium card and has no tile and no mark of its own. Counting it
separately is how a card ends up claiming more of something than a reader can find. Both suites
assert the value, that the card and the sheet claim the SAME number, and that no digit followed
by "modes" has reappeared.

That CSS rule is written `.pw-card .pwc-go .pwc-marks`, a class deeper than it looks like it
needs. The football page carries `.pw-card .pwc-go span{display:block}`, so a shorter selector
loses, the three marks stack into a column, and nothing anywhere reports it.

#### The sheet has to be SQUARE, and nothing but a measurement can tell you it is not

Everything in this section fails silently. A ragged hero row renders, reads and sells
perfectly well. The only symptom is that it looks wrong, and looking wrong is invisible to
every other check in the repo, so it is measured: `check-premium.mjs`'s last section boots the
real store at 320, 360, 390 and 560 and asserts a PROPERTY at each one.

**A grid row stretches every cell to its tallest, so every tile has to be the same four
things.** The Dynasty tile alone carried a `.pw-also` line naming One Franchise Dynasty, and
at 390px that made the top row 167.6px against the bottom row's 128.6px, with about sixty
pixels of nothing under TRADE MACHINE beside it. The mode is named on the card below now,
in the list a guard already holds to the wording on the receipt, so nothing was lost.

**It came back the same afternoon by a different door**, which is why the guard asks for one
height across the row and never for a number. With `.pw-also` gone, the step-down for the
longest name was written at `max-width:359px`, and COMMISSIONER MODE still wrapped at 360,
which is what a Galaxy reports. **Pick the first width with real room, not the last one that
fails**: the name needs about 148px of tile, 370px of viewport gives it 151 and 390 gives it
161, so the breakpoint is 389. Three pixels is a coincidence. This is the 549px note two
sections up, arriving again.

**The price row holds two kinds of thing and they align two ways.** `$34.99` and a struck
`$80` are prices and share a BASELINE. A chip is a box, and a box hung off a baseline sits
low: `One payment` started 10px down a 28px numeral and finished 3px below it. Chips centre.
**Two pills on one row have to be the same pill**: `Save $45` had `align-self:center` and
`One payment` did not, one drew its outline with a real border (which adds 2px to the box)
and the other with an inset shadow (which adds none), and the pair sat 4.7px out of step at
two type sizes. None of that is visible in the source of either rule.

**A wrapped row is not a misaligned one.** At 320px that row genuinely cannot hold a price, a
struck price and two pills, and dropping the pills to a second line is right. So the assertion
is scoped to chips BESIDE the price, meaning overlapping it vertically. The first draft
grouped them by rounded top instead, which put two chips five pixels apart into two buckets,
compared each with itself, and passed green on the exact defect it was written for.

**The sheet has a height ceiling because the complaint was scrolling.** 1090px at 390px before
this pass, 918px after, guarded at under 1000. That is room to add a line and a failure on
adding a block. Move it when the sheet is meant to grow, never to make a run pass.

### What the free allowance actually counts

**Dynasty counts SEASONS, the Trade Machine counts RUNS, and the server says which.**
`supabase/101_dynasty_seasons.sql` is the whole rule: three dynasty seasons a day, one more
for a boss battle won, spent one per kickoff on whatever run the player is in. A firing ends
the day outright. The Trade Machine is one run a day, unchanged, because a run there IS one
season.

The old rule metered a START, and the mode it produced was the entire game with a wait in
front of it: begin on Monday, still be playing that same run at season 60 without the game
asking again. The only thing the bundle sold was re-drafting.

#### And a SECOND meter counts how often you start one

`supabase/106_dynasty_one_run_a_day.sql`. Three seasons a day meters how much you PLAY, and
those two questions come apart the moment somebody does not like their draft: abandon after
a season and the budget buys three rosters, which is "one team, one life" turned into three
rolls of the wheel. So a NEW run is its own allowance, one per rolling day. Resuming costs
nothing here and never did.

**It adds a column and restates nothing, deliberately.** A `runs` counter beside `used` would
have to be reset where the window rolls forward, which is inside `ps_attempt_spend`, and that
function has already been restated once by `105_fullteam_daily.sql`: copying 102's body over
the top would silently undo 105 and take Full Team's meter with it. **A timestamp needs no
reset.** `run_at` is when the last new run started, so the question is arithmetic on it and
no existing function is touched at all. Same shape `commish_free_clock` uses, for the same
reason.

**Read at the door, written at the wheel.** `runDayShut()` answers off a cached read, so the
front page can draw the door without a round trip and an obvious refusal costs nothing;
`B.dynRunStart()` is the write and it fires from inside the `dynastyIntro` callback, at the
last moment before the board opens, so backing out of the rules sheet spends nothing. The
write is never awaited: every allowance on this page fails open, and hanging the wheel on a
round trip would be the one gate here that can cost somebody their turn to a tunnel.

**Every gate sits above every line that destroys a save**, which is `dynNewSheet`'s lesson
arriving at a second door. **Two paths reach `beginDraft`** and both carry the check:
`beginDynastyDraft`, above `dynRead` and `dynClear`, and the replace sheet's own button,
which is the one path that does not go back through it. A sheet also sits open for as long
as somebody leaves it open, so the day can shut underneath it, and `check-premium.mjs` drives
exactly that: opened on an open day, pressed on a shut one, and the assertion that matters is
that the dynasty it would have traded away is still there.

**The door says so before the tap**, on its own branch after the season one. Seasons left and
no run to spend them on is a state the season branch cannot describe: what is used up is the
fresh start rather than the budget, so "Day done" would be wrong about both halves.

#### The meter has four writers and only one of them is a READ

`dailySpend`, `dailyGrace` and `dailyDayEnd` each guarded their write with `if (r && r.used
!= null)`. `dailyEnsure`, which is the BOOT read and therefore the OLDEST answer of the four,
wrote whatever came back with no guard at all. One missing clause, two defects, both silent,
because every allowance here fails open: nothing is ever wrongly refused, so nothing throws.

- **A null erased a real answer.** `attemptsState` answers null on any blip. Stored, it reads
  everywhere as "no opinion", so the door loses its countdown and `dailySeasons()` falls back
  to `'run'`, which puts the season copy back on the old run rule mid-session.
- **A stale answer undid a spend.** Land the boot read after a kickoff and `used` goes back
  down. Measured through the real page: 2 back to 1, a season already played handed back.

So there is **one writer now**, `dailyPut`, which refuses anything without a `used`, and
`dailyWrote` counts the writes. `dailyEnsure` captures the count at ASK time and drops its
answer if anything wrote while it was out, because whatever overtook it is strictly fresher.
`dailyForget` BUMPS that count rather than zeroing it: a read for the previous account can
still be in flight, and zeroing would match the 0 the next ask captures. `runDayEnsure` (106)
had the identical shape and carries the identical three clauses.

**The re-arm is a separate clause from the state guard, and they look like one line.**
`dailyPut` is what refuses to store a null. `dailyEnsure`'s own null test decides whether to
ASK AGAIN, which is a question only the boot read has, and it is **bounded at three tries**
because that function is called from every paint of the front page.

**It was found from the harness side, which is the part worth not misreading.** Adding a
second background call shifted the timing enough that the null landed between two stubbed
states in `check-premium.mjs`, and the symptom was a boss-win toast that never appeared. The
suite was fixed so no section asks the real meter, which is right on its own terms and is
**not** this fix: the page had the same race with nothing stubbed. Each of the three clauses
was proved by reintroducing it alone, and each breaks exactly one assertion.

**A LATE METER ANSWER NEVER MOVES THE COUNT BACKWARDS** is that guard, and it drives the order
by hand rather than racing it: the answer is held open and landed at the moment under test.
A timing bug cannot be checked by hoping to lose the race.

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

**The football page has ONE game key and FOUR slots**, and `FB_SLOTS` is where the four
become one thing. `open` and `club` are the two dynasties, `trade` is a Trade Machine season,
`full` is a Full Team season. The key is still `ps_dynasty`, which is historical rather than descriptive: it was written
when a dynasty was the only run being kept. Changing it now would strand every row already on
the shelf, which is the one thing a save table must never do to itself. One key is also what
keeps the boot to a single round trip; a second key for the Trade Machine would be a second
request on every boot for every signed in player, which is most of them, to ask something the
first request already answered.

A trade run measures progress by phase and week rather than by seasons finished, because it
IS one season. `TRADE_PHASE_RANK` exists because the playoff weeks do not continue the
regular season's numbering, so a week-only measure goes backwards at the seeding screen and
the server then refuses every save for the rest of the run, with nothing on screen to say so.
A Full Team run is one season too and shares that ladder rather than copying it.

**`full` was added because the mode grew a meter, and the order is the lesson.** Full Team was
the last run on this page kept nowhere at all: no key, no slot, so a closed tab lost twelve
picks and a season. That was survivable while starting again cost nothing but time. It stops
being survivable the moment a run costs a day, because the charge lands at KICKOFF: a dropped
connection in week three would take the run AND the allowance, and leave somebody looking at a
door telling them to come back tomorrow for a season they never finished. That is `dynNewSheet`
again, the trade taken halfway. **Save first, then meter.**

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
`COMMISH_LIVE` was false the only thing it sold was a mode the reader could not see, and a
card that takes money for a shut door is worse than no card. **The flag is true now**, so
both are drawn, and what the gate still does is keep them from ever coming apart.

**A store you can only reach by being refused is a wall.** Before that card existed the sole
way to the offer from this game was to open Commissioner Simulator and be turned away at its
gate, which nobody who cannot see the mode will ever do.

#### One Franchise Dynasty is the paid mode, and a shut door has to say so

Reported as a free account being able to play it. They could: they are on
`dynasty-access.js`'s list, which comps that one mode so a tester holding no row can go on
testing it. That is written up in the file and is working as designed, and **the gate itself
was always right**: `beginDynastyDraft` refuses a franchise to anybody `canPlayClubDynasty()`
turns down, at the top of the function, above every line that touches a save.

**What was actually wrong is that nobody else could see the mode at all.** One function decided
both who may OPEN it and whether the door is DRAWN, so a free account and a guest got the One
Franchise card with no Dynasty half on it: no door, no lock, no mention. The only ways to learn
the mode exists were to buy the bundle and read the receipt, or to be on the list. **That is the
wall the college front page's card was added to knock down**, standing on this page instead, and
the fix is the Commish door's rule arriving here:

| | asks | so that |
|---|---|---|
| whether the Dynasty door is drawn | `clubDynastyShow()` | everybody finds the mode |
| whether it opens | `canPlayClubDynasty()` | only an owner starts one |

A non-owner gets the same door wearing a padlock, and pressing it opens the sheet that sells it,
which is where that tap was always going to end.

**`.mc-soon` is the wrong treatment and is deliberately not reused.** It sets
`pointer-events:none`, and a lock a thumb falls straight through is a lock with no way to the
thing that opens it. The locked door is fully pressable and wears the gold every paid thing on
this site wears, rather than the grey of something broken.

**RESUMING IS NEVER GATED, and that is the half most easily lost when a mode goes behind a
payment.** It is already written three times on this page, and putting a row in front of it
would break it in the worst place: a saved One Franchise dynasty belongs to whoever played it,
the tester list can shorten, and neither may be the thing that takes a career away. So the save
is read without asking who owns what, and a door that says Resume resumes. **The footnote under
it is the paid action**, because "Start a different club" is a new run and is the one route left
to one; without that clause a lapsed account's only way to start one would be the small print
under their own Resume.

**The guard presses the lock rather than looking at it.** A lock on a door that opens anyway is
decoration and a door that refuses with nothing behind it is the wall this replaced, so the walk
clicks it and reads which sheet comes up. Reintroduced, a lockless shut door lands on the club
picker and is then refused in silence, which is exactly the bad state.

### The three modes are LIVE, and a missing migration is the silent way to break them

```
psql ... -f supabase/test/launch_preflight.sql     or paste it into the SQL editor
```

`DYNASTY_LIVE`, `FULLTEAM_LIVE` and `COMMISH_LIVE` are all true. Two of those three fail
SILENTLY against a database missing a migration: the mode plays perfectly, the player
finishes a season, and the row is refused on submit with nothing said to them. Nobody
reports it, because nothing looks broken. **A green checkout of this repo tells you nothing
about that**, and Cloudflare deploys from main on its own, so the deploy and the schema move
independently.

`launch_preflight.sql` is the read-only answer: one paste, one row per migration, and the
`if_missing` column says what each absence actually costs. It **asks the catalog and never
calls anything**, because Postgres resolves a function call at parse time, so one missing
function in a query that called them would fail the whole statement with "function does not
exist" and report nothing about the other eleven. Verified both ways against a real Postgres
16: every row NO on a bare database, ALL PRESENT once the chain is loaded.

**Commissioner is the forgiving one of the three.** It writes its own tables rather than a
`ps_runs` row and its clock fails open, so a database missing `104` gives seasons away
instead of losing them. Dynasty and Full Team lose the season.

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
old reading was wrong on **four of six picks**. One source for both, always.

**Then they agreed on the wrong reading, and that shipped too.** They were made to agree on
`nextOpenSlot()`, and the LOWEST OPEN SLOT is not the side the mode is meant to be picking.
`FULL_SLOTS` is interleaved (QB, DL, RB, DL, ...) so that reading the side off it would
alternate for free, and the premise is false for the reason above: the lowest open slot only
moves when somebody happens to FIT it. Take a tight end first and he lands in slot 8 while
slot 0 stays open, so the next pick is offensive again, and again, until a quarterback turns
up.

A player reported three defenders in a row. Measured over **360 completed drafts** across
three ways of drafting, **not one alternated**, every one had a run of three or more picks on
the same side, and the longest was six. The usual shape was the whole offense and then the
whole defense:

```
O:TE O:RB O:WR O:RB O:WR O:QB  D:DL D:LB D:DB D:DL D:LB D:DB
```

**So the side is COUNTED, not read off a slot.** `fullPickIsDefensive()` is the one source
both the pool and the glow draw from: twelve picks, even offensive and odd defensive, which
is `FULL_SLOTS`' own parity and six a side either way. **The slot is still free**, because
this decides the POOL and not where the man lands: `slotChoices()` still puts him in whatever
open spot on that side fits him, so the defensive FLEX and the two DL spots are unchanged.

It also **strands fewer drafts**. Under the old reading two of those three bots failed to
fill twelve slots on 14 and 15 of 120 attempts, since taking a whole side before starting the
other is how a draft runs out of money for the second half. Alternating, all 120 finished for
all three.

**The checker proves it is testing something, and the alternation is its own assertion.** A
run where the lowest open slot never disagreed with the pick count would pass green having
exercised nothing, which is the badge-that-cannot-be-lit trap in a different coat, so it takes
a running back first on purpose and then ASSERTS that the replaced reading disagreed at least
once. Asserting only that everything on screen AGREES is what let five defenders in a row
pass: reintroduce the old reading and the glow, the tiles and the pool are still unanimous,
and the sequence reads `ODDDDD`. The suite now fails on the sequence itself.

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

**IT IS LAUNCHED NOW, and both checkers assert the opposite of what they used to.**
`fullteam-access.js` ships `FULLTEAM_LIVE = true`, so the door is built for everybody and
`check-fullteam.mjs` asserts an account on no list gets one. The door is still BUILT by
`ensureFullButton()` rather than revealed, and that is not leftover: the flag can go back,
and a hidden node still ships to everybody.

**What replaced "nobody can see it" as the invariant** is the shape of the paid tier, which
is the half that can still break quietly: a free account gets the mode plus a meter, an
owner gets the mode with the meter off, and NEITHER is ever refused the door. The mode being
free to ENTER is the whole design (see the GOAT denominator argument below), so a door that
came back as a wall would reverse it silently, and no error anywhere would say so.
`check-premium.mjs` asserts that from the other end.

#### One run a day, free, and the bundle removes the counting

```
node football/check-fullteam.mjs                    the door, the save and the allowance
psql -d fullteam -f supabase/test/daily_base.sql    then 99, 100, 101, 102, 105, then
psql -d fullteam -f supabase/test/fullteam_daily_test.sql
```

**It could have been sold outright and is not.** Full Team is the most distinctive mode on the
page and the obvious thing to put behind the bundle at launch. Three things say no, and the
third is the one that settles it:

- **The site already ran this experiment and reversed it.** Commissioner Mode's gate used to
  stop a non-owner dead, which meant the only way to find out whether the mode was worth $19.99
  was to pay $19.99. And "a store you can only reach by being refused is a wall".
- **The card's one word.** The bundle leads with **Unlimited** over three tiles, chosen because
  what a free account meets is the counting. One access-gated mode makes that word cover
  something it does not.
- **THE GOAT DENOMINATOR, which is a ceiling and not a wait.** `CATALOG.length` is what
  `crest.js` divides by and it is deliberately one number for everybody. Full Team's shelf is
  **24 badges** and the catalog went **457 to 481** the day the mode launched. Behind a hard
  gate, every free account's GOAT is capped at **95.0% permanently**, by badges no amount of
  play can reach. Every other limit here is a wait.

**It takes the Trade Machine's rule, not Dynasty's**, because a Full Team run IS one season, so
there is no finished-the-day moment separate from the run for a personal rolling clock to hang
on. Eastern calendar day, one run, which is what `ps_day_allowance` already answers for
anything that is not a dynasty.

**What `105_fullteam_daily.sql` actually changes is small.** `ps_day_allowance` and
`ps_day_unit` already answered 1 and `'run'` for every non-dynasty mode. What stood in the way
was the table's CHECK constraint and the `p_mode not in ('dynasty','trade')` guard at the top
of four functions, under which the branch said `'trade'` eight times where it meant "the mode
that was asked for". Generalising that branch to `p_mode` is the only reason those bodies are
restated rather than altered in a line.

**And writing its test found that 102 had none, and was broken.**
`ps_attempt_spend('dynasty')` incremented with an unqualified `set used = used + 1`, and that
function `RETURNS TABLE (ok, used, ...)`, so `used` is an OUT parameter and Postgres refused the
statement as ambiguous. **It threw on every dynasty kickoff.** Nothing said so, because
`dailySpend()` catches and fails open by design, so the season went ahead and was never counted
and a three-a-day budget silently never decremented. The trade branch below it always had the
alias. `supabase/test/fullteam_daily_test.sql` opens with the regression written as what a
player would notice (spend three, the third is the last) rather than as the error text.

**The gate is at the door, the charge is at the kickoff, and the two are different moments on
purpose.** Reading is free, so it can save somebody the twelve picks of a draft they would not
be allowed to play; the write waits until they commit. `startSeason()` carries a backstop on
`attemptPaid` for the ways round it, and never on the clock, so finishing a season already paid
for is never refused.

**The door never shuts.** A saved run always says Resume, whatever the meter says, and a spent
day changes only the line under the name. That is the dynasty door's lesson arriving a second
time.

**Whether the offer NAMES Full Team is asked of who can play it, and that is a reversal worth
reading before undoing it.** `fullTeamSold()` used to read the LIVE flag alone, on the argument
that a price is one product for everybody and a tester must not be shown a different offer from
a stranger's. That is the right rule for what the bundle CONTAINS and the wrong one for what a
card should NAME, and the two were being run together. What it cost: a tester who could play
Full Team, and whose daily limit on it the bundle removes, opened the store and found the mode
unmentioned. The offer was silent to exactly the people able to act on it.

So `fullTeamSold()` is `canPlayFull()` now, and the store line, the receipt and the unlocked
sheet's wording read it. The case the gate is actually for still holds, because it is the same
gate: a reader with no Full Team door is told nothing about it, so nothing ever sells a mode
they cannot find. `check-premium.mjs` asserts the store and the receipt still sell the same
list, because they live in two files and nothing else notices when they drift.

**It IS a fourth tile, and the count is derived rather than written.** It was a line and not a
tile while the hero row was three, on the ground that the prompt card's `.pwc-marks` mirrors
that row and a fourth would desync them. The answer was to grow both: `cardMarkKeys()` and the
hero row both add Full Team for a reader who can open it, so the card and the sheet it opens
claim the same number of things for the same person. Neither suite pins a number. They derive
the count from `RTG_FULLTEAM` and assert the two agree, because written as 3 or 4 it would be
right about one reader and a lie about the other, and whichever it was would be the one nobody
ran.

#### Full Team was too hard, and the row it was fitted against was one roster replayed

**`buildFullToBudget` took an rng and never called it.** So the `mid` row of
`simulator.js --fullteam`, the row that stands for careful play and the row `FULL_TALENT` and
`FULL_CAP_MUSD` were solved against, was ONE deterministic roster played N times. It measured
schedule luck, not the range a player meets. `buildToBudget`, the offense bot it is read
beside, spreads its per-slot spend with a jitter term, so the two rows were never the same
kind of thing and the comparison between them was measuring the builders.

**And every column in that report was a middle.** A win rate, a median record, a mean rating.
Those are the right numbers for asking whether a mode is FAIR and the wrong ones for asking
what it feels like to COMPETE in, because nobody competes against the median: a board is a
list of the best seasons anybody played. Both tables carry the tail now (best, p90, and the
share of seasons at 15, 16 and 17-0). Two modes can share a median and have nothing in common
at the top.

With an honest bot, what careful play actually got at `FULL_TALENT = 0.78`:

| | careless | careful | solved |
|---|---|---|---|
| quick draft | 25% wins, 4-13 | **61%, 11-6, 42% playoffs** | 81%, 14-3 |
| Full Team, before | 8%, 1-16 | **43%, 7-10, 4.5% playoffs** | 81%, 14-3 |

and in 400 seasons Full Team never once passed 15 wins, where the quick draft reaches 17-0.
Reported by a player as "way too hard", and they were right.

**The cause is that the mode is TWO-SIDED.** An imperfect roster is punished on both sides at
once, so the penalty compounds: points allowed swing **2.06x** across the drafting range where
the quick draft's swing **1.16x**, against a points-scored swing of about 2.8x in both.

**IT IS NOT A LEVEL PROBLEM AND NO CAP FIXES IT.** Swept $280M to $400M, the careless row
never moved at all, because a careless drafter does not spend the cap. And the talent that
puts the careful row right sends the solved row past 88%.

##### Two fixes that read perfectly and gutted the mode

Both were caught by one thing: **the solver's own split**, now printed with a verdict.

- **Compressing the whole suppression curve** put the win rates almost exactly on the
  reference rows, and the optimal roster went from **$159.5M off / $100.4M def** to
  **$242.0M / $17.9M**. With defence worth less, the solver stopped buying any.
- **Capping only the penalty** broke it the other way, for the mirror reason: a ceiling on the
  penalty is a ceiling on the reason to avoid it.

Twelve picks across two units is the whole premise, so a mode whose best roster spends nine
tenths of the cap on one side is not balanced however good its win rate looks. **The cliff is
sharp**: defence is worth 39% of the cap down to a `FULL_DEF_SUPPRESS_MAX` of 1.40 and 7% at
1.35. It ships at **1.45**, the first value with real room rather than the last one that
passes.

##### And a third instrument fault behind those two

**`FULL_OPTIMAL_CACHE` was keyed on the budget alone**, and the solve reads the live constants
through `fullStrength`. So in any sweep the first cell solved was the only one solved: a
defmax sweep printed nine identical splits, and the `optimal` row of a talent sweep was pinned
to whichever talent ran first. Keyed on budget, talent and the suppression ceiling now.

**The rating column did not track the dial either.** It called `overallOf`, which takes no
constants and so always rates against the engine's built-in `FULL_TALENT`, printing a rating
for a game the row beside it was not playing. It calls `fullOverall(..., constants)` now.

##### What shipped, and what it costs

`FULL_TALENT` **0.78 to 0.90**, `FULL_DEF_SUPPRESS_MAX` **1.45**, the cap unchanged. The
careful row now sits on the quick draft's: 11-6 against 11-6, playoffs 45.8% against 41.8%, a
perfect season in 1.0% against 0.8%.

**The solved row overshoots, at 91% against 81%, and that is a decision rather than an
oversight.** The careful and solved rows cannot both be hit with these dials, because twelve
picks across two pools give a solver far more room to be right than six do. The row that was
chosen is the one a person actually plays: a full knapsack over both pools is not something a
human does at twelve slots, while a careful draft is what everybody does.

**Existing board rows were set under the old numbers** and will sit low against new ones.

#### An 85 has to mean what 85 means everywhere else

Reported by a player: a team went **20-0 and read 85**, which is not what 85 means anywhere
on this site. The instinct was right and the reason is bigger than the number looking small.

**`liveRating()` hands the Full Team overall to `weeklyEdgeVs`, `seedFromRecord`,
`playoffShare` and `finalEdge`**, and those are cut against `CLASS_FLOOR` 84, `ELITE_FLOOR` 95
and `FINAL_EDGE_PIVOT` 95. Measured at matched drafting quality, before the fix:

| roster | median | clears 84 | reaches 95 | title-game neutral |
|---|---|---|---|---|
| Full Team, spends the cap | 75.5 | **8%** | **0%** | **0%** |
| quick draft, careful | 82.2 | 46% | 10% | 10% |

So the weekly class edge, the strength vote on the seed and a neutral title game were all
**switched off in that mode**, and nothing anywhere reported it. It is also the explanation
for the standing measurement that a Full Team squad "never takes the top seed": the seed vote
starts at 95 and the mode could not reach 95.

**This is `defenseOverall`'s problem one level up, and it had the same three symptoms.** The
mean of two units is an honest reading of what twelve men produce and it is NOT a team
overall, because a Full Team splits ONE cap across two units where a quick draft spends a
whole cap on six men. So it reported every full roster weaker than a six man squad drafted
with the same care.

`fullTeamScale()` is the same answer `defenseOverall` already is: a line through three anchors
measured off the two modes. A careless twelve reads where a careless six reads, so the bottom
does not move. A roster that **deliberately spends the cap** reaches `CLASS_FLOOR`, which is
where the quick draft's careful play sits. The best roster the mode can produce reads **100**,
so the top of the scale is reachable and means "you cannot do better". Clearance after it is
45% against the quick draft's 46%.

**The units are not touched.** `off` and `def` are still what each side produces.

**The results screen printed the old identity as an equals sign**, so the coach row now ends
at the MEAN and a new row arrows the mean to the overall. It arrows for the reason the defence
row arrows: it is a step between what the roster produces and what the number means, not a
term the player multiplied. `check-fullteam.mjs` asserts the new identity, that the map is
monotone, and both anchors.

**What it costs.** Turning those mechanics on is a buff, and it lands on GOOD drafts rather
than careful ones: the careful row is unchanged at 11-6 and 46% playoffs, and a roster that
spends the whole cap went to 13-4 with 80% playoffs. `FULL_TALENT` was left at 0.90 because
pulling it back takes the careful row off target and barely moves the strong one.

**`full_elite` is now easy and is deliberately not raised.** Badges are DERIVED from the rows
the board keeps, so raising the threshold takes a gold off everybody who earned it on the old
scale. It is worth moving to about 85 **on the day the Full Team board is reset, and not
before**. `check-badges.mjs` cannot see this: it proves a badge is REACHABLE, and a trivial
badge is reachable too.

#### A coach who would make the team worse is not offered

The table holds 115 men. An ordinary drafted roster can afford most of them, and **58% of
those LOWER that roster's rating**. The grid already sorted best-first and marked the top
cell, so the answer was at the top and the other two thirds of the page was a list whose only
function was to be scrolled past.

**There is no trade being hidden, which is what makes the cut safe rather than
paternalistic.** By this screen the roster is drafted and the money left buys nothing else:
unspent cap is production you never fielded, worth zero. So a coach who costs money and lowers
the rating is not a cheap option or a risky one, he is strictly worse than the free No coach
button already under the grid.

**Flat men stay.** The rating is the MEAN of his two sides, so +6% offense and -6% defense
nets to zero on the headline and still changes what this team scores and what it allows. That
is a real choice and it is the player's. For the same reason the printed value is rounded to
the band BEFORE it is printed: `(-0.04).toFixed(1)` is the string `-0.0`, a minus sign on a
man the filter just certified as costing nothing. Same rule as the commish state card, and as
the fit and coach percentages one screen along.

**The cut is at DISPLAY, never in `coachMarket()`.** `check-badges.mjs` walks that market by
index to hire twenty-five different coaches, so shrinking it would quietly shrink what the
badge sweep can reach.

**Three states on the line under the heading, not two, and the middle one is not rare.**
Measured over 75 real drafts through `run.js`:

| how you draft | affordable | would help | money left |
|---|---|---|---|
| greedy | 22.7 | 1.1 | $3.5M |
| thrifty | 115.0 | 52.6 | $219.2M |
| value | 115.0 | 49.1 | $188.6M |

A player who SPENDS THE CAP, which is the good way to draft, arrives with about three million
and twenty-odd coaches in reach, and on **24 of those 75 drafts not one of them improves the
team**. Falling back to the full list on exactly that run would put the whole sift in front of
the player who earned the cleanest answer, so the screen says there is nobody worth hiring
instead. Nothing affordable at all is a different sentence again: the first is about the
money, the second is about the roster.

**`#b-coach-none` joined it too, which is the SEVENTH time**, on the same screen as three of
the others. Nothing hid that button at all, so after a hire the coach screen carried "No
coach, I will call it myself" directly under the man just paid for: an offer to undo the
decision the confirmation sheet had asked for. It works, because `hireCoach` refunds a
previous hire through `remaining()`, and that is exactly why it read as a leftover rather
than a control. **Hiding it is two edits and the first alone does nothing**: `.btn` sets
`display:block`, so the painter's `hidden` never took. The guard reads `getComputedStyle`
rather than the attribute for that reason, and each half was proved by removing it alone.
The grid stays live, so changing your mind BETWEEN coaches is untouched; what is gone is
going back to nobody after hiring.

**`#co-grid` joined the `[hidden]` list, which is the fifth time in this file.** `.cogrid`
sets `display:grid`, so the `hidden` the painter has always written on an empty market never
took. It cost nothing while the empty case meant a grid with no children anyway. It is now a
padded, margined box between the rating card and the line explaining why there is nothing in
it.

#### The playoffs are played forward, and the hire decides who calls them

```
node football/check-fullteam.mjs   the last section drives a real wild card, both ways
```

**EVERY Full Team playoff game plays forward now**, drive by drive on the boss battle's
board, and stops at the two real calls: fourth down, and the two point try. What hiring a
coach decides is WHO ANSWERS. No coach and the reader is asked. A coach and he answers, and
the screen says what he decided before it plays it.

Declining a coach used to buy a PLAN EDITOR: three dials (tempo, fourth down, pressure) set
once before kickoff. That is neither what a coach does nor what calling it yourself means,
and measured over 264 seasons an axis at a time it was barely a decision either:

| plan | win% | median |
|---|---|---|
| neutral | 78.3 | 14-3 |
| ball control, balanced or up tempo | 78.3 each | 14-3 |
| punt it | 79.2 | 14-3 |
| go for it | 77.3 | 13-4 |
| contain | 78.6 | 14-3 |
| blitz | 77.0 | 13-4 |
| all conservative | 80.2 | 14-3 |

**Tempo is exactly inert**, because it multiplies both scores, and the other two have one
right answer each. Three questions, one dead and two with a dominant answer, standing in for
the thing the player was asking for.

**It is the playoff calls now.** `fullSimCreate` is `resolveGameFull`'s arithmetic played
FORWARD, drive by drive, driven by `bossSimAdvance` and `bossSimResolve` unchanged, so an
uncoached roster meets the real fourth downs and the real two point tries on the boss
battle's own board. `liveCalls()` is the one place that asks, and the answer is Full Team
with no coach.

**What it cannot borrow is the boss sim's SCORING, which is why it is its own function
rather than a flag.** A boss sim models your offence against their scoring rate and nothing
you drafted touches what they score. That is right for six men on one side of the ball and
it throws away half of Full Team, where what the other team scores is what your six
defenders allow. Run as-is it would have played the twelve man mode as a six man one and
nothing on screen would have looked wrong.

**`advanceWeek` RECORDS rather than decides when a game arrives pre-played.** That is its
`pre` argument, and `nextGame()` was lifted out of it so the live game and the resolved one
ask one source who the opponent is and how hard. Three things follow and none is obvious:

- **The resolver is not called at all.** Calling it and overriding the winner would put a box
  score on the results screen that disagrees with the scoreline above it.
- **So there are no `lines`.** A forward sim scores on drives rather than by sampling each
  man, so there is no honest per-player column. Every reader already guards on it, including
  the playoff broadcast, which is right: the live game WAS the broadcast.
- **And no fantasy-space numbers either.** `yourScore` and `oppScore` carry the football
  score, because for a game played forward that IS the score. `live: true` says why, rather
  than leaving a reader to infer it from two fields agreeing.

**The board is shared, not copied.** `liveBoard()` sets up the screen both forward-played
games use, because a screen that exists twice is a screen that says two different things
about the same game inside a year. See the four premium cards.

**What it costs, measured over 800 games rather than argued.** The forward path is a little
harder than the resolver: 79.5% of games for the resolver, 78.3% taking every fourth down
and every two, 75.9% punting and kicking everything. So the calls are worth about 2.4 points
and a good caller still lands about a point under what the resolver would have handed them.
Added to losing the dials, an uncoached team is down roughly two points of regular season win
rate and about one of playoff win rate. Recorded rather than compensated. What it buys is
four games a player actually decides.

##### And a coach who only moved a multiplier was the same problem wearing a name

He cost real money, the hire sheet described his philosophy at length, and then nothing on
any screen ever showed him doing anything. Reported as wanting to be told when he goes for
two and fails. **The only way that sentence can be true is if he is really making the call**,
so the coached playoff game plays forward too and `fullCoachCall` answers it.

**IT DRAWS NO RANDOM NUMBER, which is the property that makes the screen honest.** The page
prints what he decided BEFORE `bossSimResolve` plays it, so a call that read the dice first
would be a coach who already knew. It is also what lets a reader check him: the situation is
on screen and the rule is the same every time.

**The fourth down axis is a REACH IN YARDS**, which is the plainest shape it could have and
the only one that makes the three settings visibly different: go for it goes on 4th and 3 or
less, standard on 4th and 2 or less, punt it never goes at all. Above all three, every coach
keeps the ball when the clock is against him and three points cannot save the game. The two
point chart is late and short: six margins, gated on the fourth quarter, because before that
a point is a point.

**`fullSimCreate` takes the coach and HALF the plan, and which half is the interesting part.**
Tempo and pressure are carried, because nothing in a forward sim models playing fast or
blitzing, so the multiplier is the whole of them. **`FOURTH_MEAN` is NOT carried.** In the
resolver it IS going for it, because there are no fourth downs to play; here there are, so
adding it on top would pay a team twice for the same aggression. The two SWING terms go for
the mirror reason: they widen the resolver's sampling, and this sim's spread comes from
drives, turnovers and kicks.

**Measured over 1500 games an arm**, forward against the resolver on the same rosters:

| who calls it | forward | the resolver |
|---|---|---|
| always safe | 70.1 | |
| coach, punt it | 71.1 | 74.5 |
| coach, standard | **72.9** | **73.1** |
| coach, go for it | 73.8 | 72.1 |
| always bold | 74.3 | |

**A standard coach is where he was**, 72.9 against 73.1, so the mode's balance survives the
move. Two things did change and both are worth knowing. **The fourth down axis flips sign**:
conservative was better under the resolver and is worse here, because a fourth down that is
actually played is usually worth playing. And **a player calling it themselves has a ceiling
above any coach**, 74.3 against 73.8, which is the right shape for the trade: the money and
the calls against his two multipliers.

**What it costs a reader, said plainly.** Both paths lose the playoff broadcast and with it
the playoff box score, because a forward sim scores on drives rather than by sampling each
man and a per-player column here would be invented. The regular season keeps both.

**The calls go in the LOG, and that is the half a reader keeps.** The narration over the
field is one line the next drive paints over, and under Sim the rest it is gone in a frame,
so a coached game would have made four decisions and left no sign of any of them. Both
readers get the rows, because two logs that listed different things would be the only screen
on this page whose shape depended on who was looking.

##### A call can hand back another call, and the second one was being dropped

**`bossSimResolve` can return a DECISION where the caller expects a finished drive.** A
fourth down conversion that reaches the end zone finishes the drive through `bossEndDrive`,
which is the same function that pauses a touchdown for the two point try, so in the second
half of a close game it hands one back and returns before the automatic extra point is added.

The page's loop ignored that and went back to `bossSimAdvance`, which asks nothing about
`pending`: it started the next drive and never came back. **The touchdown scored six, the
point was never kicked and the two point try was never offered.** It fires on about one game
in fifteen played bold (20 of the checker's 300), and **it has been shipping in the BOSS
BATTLE since the two point try was added there**.

**`check-boss.mjs` cannot see it and that is not a gap in it.** Its subject is whether the
drive log agrees with the score bug, and both of them read `sim.you`, so a score that is
uniformly one point short agrees with itself perfectly.

**The guard measures the cost as ARITHMETIC, not as a win rate, and the first draft of it
failed for the right reason.** Comparing points a game between the two loops showed the
BROKEN arm scoring more: honouring the handback takes an extra draw from the stream, so the
two games diverge at the first hit and a per-game aggregate cannot see a one point defect
through that. A touchdown is worth six plus whatever is decided after it, so the claim is
that the dropped ones finish at exactly six. Read at the event, deterministic, and nothing
downstream can touch it.

#### A fourth down is asked in the middle of a drive, and the field only knew about finished ones

```
node football/check-fullteam.mjs   the section that plays one game at the real pace
```

`bossFlush` animates drives out of `sim.drives`, and a drive is only pushed there when it
ENDS. A genuine fourth down stops the sim half way through one, so the board asked for a
decision about a march it had drawn nothing of: the drive arrived as a static bar under the
question, at full length, in one frame. Then the call was taken, the drive eventually ended,
and `bossAnimateDrive` replayed it **from its own `tStart`**, which ran the game clock
backwards by the length of the drive. Reported by a player as the go-for-it decisions not
lining up with the picture.

**The engine was right the whole time.** `bossSimResolve` on a conversion returns
`{converted:true}` with no `end`, leaves `sim.cur` alone and the next `bossSimAdvance` carries
the same drive on. Nothing about the football needed changing; what was missing was that the
screen had no memory of how far into a drive it had drawn.

**So there are two counters and they answer different questions.** `bossShown` is how many
COMPLETED drives have been animated, which indexes `sim.drives`. `bossShownTo` is the game
clock the field has been drawn up to, which is finer, because the picture can be part way
through a drive that `bossShown` has not counted yet. `bossLiveTo` runs the drive out to the
call before the call is asked, and `bossAnimateDrive` starts at `Math.max(d.tStart,
bossShownTo)` and scales its duration to the tail rather than to the whole drive.

**The bar could not grow, and the reason was one word.** `bossDraw`'s live overlay was built
with `tEnd: upTo`. `drawDriveChart` calls a drive active while its `tEnd` is still AHEAD of
`upTo` and interpolates across that span, so a drive whose end was always `upTo` was never
active and snapped to the current ball spot on every frame. It is `sim.clock` now, which is
where the ball has actually got to, so an earlier `upTo` draws the march part way.

**A resumed drive needs an ANCHOR, and without one the fix has a visible jump in it.** A
drive's bar is a straight sweep from the line of scrimmage to wherever the drive ends up, and
that line does not pass through the spot the ball was stopped at: a fourth down at the 55 on a
drive that goes on to score interpolates to about the 72 at the same instant, so the bar
leapt seventeen yards the moment the call was taken. `drawDriveChart` takes an optional
`{t, y}` and sweeps the tail from there. Only the boss board passes it.

**The clock is the instrument, because it is the one thing on that screen that has to move one
way.** The field is a canvas and the score is allowed to sit still. A game clock that goes
back is wrong on its face, and it went back by a hundred game-seconds or more rather than by
a rounding error.

**Sampled through a MutationObserver, never polled.** The replay lasts as long as the drive
takes to animate, so a poll would PROBABLY catch it, and "probably" is how two thin samples in
this file already passed on the defects they were written for.

**Two claims, and the second is the half about the run-up.** Monotonicity catches the replay.
What catches the missing run-up is counting the clock writes between the drive row logged last
and the call being offered: `bossLiveTo` animates that stretch so there are frames of it, and
without it there is exactly ONE write, the jump inside `bossShowDecision`. **The threshold is
2 rather than a frame count**, because rAF under load is not a number a checker gets to assume
and the defect gives exactly one either way. For the same reason the guard does not assert a
maximum forward step: a slow frame is indistinguishable from a jump, and monotonicity is not.

**It is the one walk here that does not press Sim the rest.** `bossFast` skips the animation
by design, so the fast path cannot see any of this; the button goes in at the end to bring the
game home. A two point try is excluded from the run-up count on purpose: its touchdown is
already pushed and drawn, so one write is the right number there.

**And it needs a page of its own, which is the harness lesson here.** The coached walk above
breaks out of its loop the moment the bracket takes the screen after a Continue, and that
leaves a `nbrkShow` callback pending which opens another game seconds later. The board is
module state, so it replaces whatever is there. On the shared page the tape read a clean climb
to 192 seconds and then a reset to 1ST 15:00, and the first reading of that failure was spent
deciding whether the page or the harness had done it. Waiting for an empty log and a 0-0 bug
is NOT enough: the game the section starts is itself fresh at that moment and the leftover
lands after it. **A page with no leftovers by construction is the only version of this that is
about the page.** The failure message carries the series around the step for the same reason:
a clock that goes back by a drive and a clock that has been reset are two different faults
reported by one number.

**THE ANCHOR IS THE PART NOTHING GUARDS, and that is worth knowing before trusting a green
run.** A wrong anchor costs a jump in the BAR and nothing the clock can see, so both
assertions above pass with it removed. Checking it means looking at the field while a fourth
down is converted, or writing a pixel read the section does not have.

#### A playoff game is paced against the broadcast, and it arrived paced like a boss battle

```
node football/check-fullteam.mjs   the section that times a coached postseason
node football/_pace-probe.mjs      deleted; the numbers below are what it measured
```

The live board IS the boss battle's board, so it arrived with the boss battle's pace, and that
pace is deliberately slow for a reason that does not transfer: a boss is one season in six and
the thing a dynasty builds toward. **A postseason is that same board four times in a row.**
Measured over 60 games a round:

| | resolved broadcast | live board, before | after |
|---|---|---|---|
| Wild Card | 13.4s | 57.9s | **13.2s** |
| Divisional | 17.5s | 57.8s | **19.0s** |
| Conference Championship | 21.1s | 58.1s | 22.4s |
| Super Bowl | 25.7s | 57.9s | 26.0s |
| the whole postseason | 77.6s | **231.7s** | **83.5s** |

**Two faults, not one.** It was four times too slow, and it was FLAT: the Super Bowl was paced
exactly like the Wild Card, where the resolved broadcast's own `PACE` table escalates and the
comment over it says that escalation is the whole point. Reported by a player asking for the
Full Team playoff games to go faster.

**`bossPace` scales the FOOTBALL and never the calls**, which is `bossFast`'s own rule arriving
at a dial instead of a button. The beat that shows what a coach decided, and the one that shows
how it turned out, are the mode rather than pacing: hurried, they take back the thing the calls
were added for. The boss battle passes no pace, so every number is byte-identical at 1.

**Three floors are absolute and they are what stops the Wild Card going lower.** A drive has to
read as a bar sweeping across the field rather than a bar appearing, the run-up to a fourth down
is the drive the call is about, and a touchdown gone before the number under it has finished
moving is what this screen was asked to stop doing. Those are a number of FRAMES, and no round's
pace gets a vote on that. They are why the Wild Card lands 2.6s over its resolved counterpart
rather than on it, and taking `LIVE_PACE` lower buys nothing because the floors are already what
that round is made of.

**Timed for real, never re-derived.** Every duration on that board is a `setTimeout` or an rAF
ramp, so a checker could sum them, and would then be a second copy of the answer. A wall clock
cannot drift. The band is 8 to 34 seconds against a defect worth 3.5x, so it has room for CI
load and none for the regression.

**It walks the whole postseason, and that is two things rather than thoroughness.** A ladder
cannot be shown by one game, and a genuine fourth down is rare enough in a single game that
timing one leaves the call assertion dark most runs, which is the badge nothing can light. Over
two rounds it meets about four calls. **Reading the table is the other half and cannot replace
it**: with the pace removed from the caller, the table still escalates perfectly and three timed
assertions fail.

**The call timer measured nothing at all on its first draft, and it passed.** It keyed on the
state cell reading `THE CALL`, and **nothing ever sets that cell back**, so after the first call
of the game every reading said `THE CALL` and the timer re-armed on writes that were not calls.
It reported ~1460ms, which is the gap between two ordinary drives, and **it did not move when the
call beat was deliberately broken**. It keys on `.cw`, the bold caller name, which
`bossShowDecision` writes and nothing else does: its presence IS the decision being announced and
its absence is the line painting over it. Correct, it reads 1201ms, and 301ms with the defect in.

#### A control the game is waiting on goes above the record of it

The call box and the verdict sat UNDER the drive log, which is capped at 40vh and fills up
all game. Measured on a phone with a fourteen drive log:

| | 390x844 | 360x740 |
|---|---|---|
| the call box starts at | 775, so 69px of viewport left | 726, so 14px left |
| the Continue button starts at | 888, **off screen** | 839, **off screen** |

So a player got the question and none of the buttons, and the way out at the final whistle
was not on the screen at all. Reported by a player with a screenshot of a two point call they
had to go looking for. **The Continue button has been off the bottom of the boss battle since
that screen shipped**, which nobody reported because a game that has ended will wait.

**The order is the field, what just happened, what to do about it, and only then the record
of everything before it.** The log is the thing you scroll to. A control the game is waiting
on is not. After the move the calls start at 393 and the verdict at 506 on both.

**The guard measures a REAL call, at the moment it is offered, on the deepest button of the
worst one**, because the fault grows with the log: a check on the first call of the game
would pass on a screen that breaks by the fourth quarter.

**And it asserts against a PHONE rather than against its own window**, which is the same
trap as the share card's sampling stripe one section down. The harness opens 390x900 and a
phone is 844 or 740. Reintroduced, the deepest button measures 853 to 934, so that run would
have failed on `vh` too, by 34px, and it is 34px only because the game happened to run 28
drives. The defect IS the log's height, so a shorter game shrinks that margin to nothing
while the screen is just as broken on the phone it was reported from.

#### The share card was built for six and Full Team drafts twelve

Every y on `drawShareCard`'s canvas between the two rules was a constant written for a six
man roster. So a Full Team card printed its seventh row THROUGH the closing rule and the next
five on top of the team rating, the chemistry, the spend, the dare and the link, all at once.
The card still rendered, still saved and still shared. Reported by a player with a screenshot.

**One column of twelve is not the answer, and the arithmetic is the reason rather than
taste.** The band from the first baseline to the closing rule is 526px. Twelve rows in it is
44px a row against a 52px position chip and a 50px name, so everything in the block has to
come down by more than half and the card's biggest text after the record ends up smaller than
its own footnotes.

**So it is two columns of six**, which keeps the row height and the type where they were and
spends width instead, and width is what this roster has spare. The year and the city move
UNDER the name, because half a card cannot hold both on one line and the name is the half
worth the room. **The split is by side of the ball**, never by halving the list: `FULL_SLOTS`
interleaves, so the first six slots are three offensive men and three defensive ones and a
straight halving gives two columns that each look like a mistake.

**Six is untouched, and that is asserted from the other end**: the six man card was rendered
before and after and came back BYTE IDENTICAL. `cardRosterLayout` returns exactly what the
old constants did for anything up to six.

**And the tagline fell through to "Classic Mode. Six spins, one roster" for the third time.**
The comment above that line already records the defense card and the Trade Machine card doing
the same thing. Every mode added since it was written has had to be added to it.

**THE GUARD READS THE CANVAS, and its first draft passed on the exact defect it was written
for.** Checking that the layout function's numbers add up only asks whether the code agrees
with itself, so the check samples pixels: the clearance between the closing rule and the
footer's first line has to be empty. The first version sampled a 20px stripe ABOVE the rule,
and rows are 94 apart with caps about 36 tall, so most of the pitch is gap: the stripe landed
between the sixth row and the seventh and read zero on a card whose seventh row was printed
straight through the footer. **A thin sample of a sparse column is a coin toss on where the
sample lands.** The band is the whole clearance now, and reintroducing the one column layout
puts 4,754 lit pixels in it.

**Measuring type in this harness measures the FALLBACK face**, which is the note two sections
up arriving again, and here it is the safe direction: Google Fonts does not resolve in the
sandbox, so names are set about a third wider than the condensed display face a real visitor
gets. A card that fits here fits on a phone with room spare.

#### The run detail sheet was built for six too, and its sort had two bugs under the size one

```
node football/check-fullteam.mjs   the last section, at a 740px phone
```

Reported by a player with a screenshot of their own 20-0 Full Team run opened from the
leaderboard. Three faults in one sheet, and only the first is about size.

**The rows were written for six.** A roomy row is 55px with its gap, so twelve are 726px under
a 127px header: seven men on a phone and you scrolled for the rest of your own team. A roster
over six gets **one line a man** now, 31px, and the twelve come to 450px, which fits on the
shortest phone worth supporting. Measured through the real sheet: 878px deep in a 634px pane
before, 577 after. **Six is untouched**, because six fits and has read the same way for a year.

**What the tight row gives up is the stat line and nothing else.** The name, the year, the
club, the fantasy points, the price and the award chip all stay. The slot note MOVES onto the
name line rather than being dropped: in the chip's own column it is a second line, which would
make the two flex rows of a Full Team roster taller than the other ten. That is the premium
sheet's hero row rule arriving at a list, and the guard asks for one height across all twelve
rather than for a number.

**The price went beside the score rather than under it**, and that is not tidying. Stacked,
that column is 28px and is the TALLEST thing in the row, so it and not the name was setting the
row height. On one baseline the row goes 40px to 31, which is 108px over twelve men and the
whole difference between fitting a 740px phone and not.

**`flex:0 0 34px` on the chip set its HEIGHT, not its width.** `.tagwrap` is a flex COLUMN, so
a basis on a child is vertical: the chip became 34px tall and dragged every row to 46. The base
rule has the same shorthand and is saved by `.rrow .tagwrap .tag{flex:0 0 auto}` sitting above
it, which the new rule tied with on specificity and beat on order. **The width goes on the
wrap**, which stretches the chip to it anyway.

**And the club absorbs the overflow, not the name.** Given both the same shrink they lose width
in proportion to how much they have, so a row 14px too wide cut `Adrian Peterson` as well as the
year beside it. The name is what the row is for.

##### Two sorting bugs that the size fix would have left in place

**`byPositionOrder` picked ONE position list** and Full Team has both sides: the rule was "any
defender present, use the defensive list", so every offensive player fell to the not-in-the-list
rank and the whole offense was filed behind the whole defense.

**And the tie-break read the wrong slot list.** It was always `E.SLOTS`, the six man OFFENSIVE
list, in which DB does not appear and FLEX does. So a defensive back in the flex spot ranked 5
and the two real backs ranked not-found, and **the reserve printed above the starters**. Against
`FULL_SLOTS` the real backs are at 7 and the flex at 10, which is the order the draft filled
them. `slotListFor()` answers which of the three lists a roster was built on, read off the men
and never off the run, because a row opened from the leaderboard is somebody else's and carries
no mode. FLEX is in all three lists, so it cannot be what decides.

**A defense run had the second bug too**, quietly, for the same reason: its six were sorted with
the offense's slot list, so its flex man also sorted above the position he is the reserve for.

##### And the defenders were not there at all, because the fetch asked the MODE

Reported next, from the same sheet: a Full Team run opened from the leaderboard showed its six
offensive players, no defense, and a line reading **"6 of the six could not be looked up
here"**, which is a sentence that cannot be true.

**The defenders are a second download.** Every browser has the offensive pool and only a
browser that has opened a mode needing defenders has theirs, so a leaderboard row is resolved
against half the data it needs. `runDetail` already knew that and went and got them, gated on
`row.run_mode === 'defense'`, which was every mode with defenders in it on the day that line
was written. **Full Team's rows say `full`.** It asks the roster's own SLOTS now: a slot list
carries DL, LB and DB whatever the mode is called, so it is right for both modes today and for
the next one without anybody remembering, and an old offensive row still triggers no download.

**The fixture has to be a page that never drafted**, which is the part worth copying. Every
other assertion in that section runs on the page the roster was built on, where the pool is
loaded and this defect cannot appear at all. The row is built there, carried out as plain data
the way the server hands it over, and opened on a page that has only ever seen the front page.
That is exactly what happens to a reader tapping somebody else's run, and it is the only
arrangement in which the bug exists.

**Two phases, and the first is deterministic.** `runDetail` draws synchronously and then starts
the download, so the frame right after the call IS the half-resolved sheet: six rows and the
count line. The wording is read there. The second phase waits for the redraw and asks for
twelve. That first phase is also what proves the fixture is real: a page that already held the
defenders would resolve twelve immediately and assert nothing.

**And the sentence under it was the six man identity, which is wrong three ways on twelve
men.** The results screen already refuses to print it and says the working is in the table
instead; this sheet had no such branch. `runPayload` files `rosterStructure` over ALL TWELVE,
which is the 0.57-for-everybody reading `overallOf` warns about, so the FIT is the wrong
number; a Full Team rating is `fullTeamScale`'s 0 to 100 team overall, so "points a game
against an average defense" is the wrong QUANTITY; and "the six" is the wrong WORD. A row
carries one `structure_mult` and one squad total, so there is no honest working to draw here
the way the results screen draws it from parts. It says what is still true instead: how the
roster is shaped, and what the rating is.

**The grouping and the ordering are two different fixes and need two different assertions.**
`rdRoster` splits the men by position, so the Offense and Defense headings are correct even with
the old sorter behind them: reintroduced, the headings assertion passes green and the two order
assertions fail. Neither rebuilds the old rule to compare against. The claims are that offense
comes before defense, that each group runs in its own list's order, and that no man in a flex
slot appears above a man in his own named slot at the same position.

### A dynasty screen says which season it is, and `seasonTag()` is why

A dynasty is the one mode on this page where the same screen comes round again, so
"Regular season complete" over a 13-4 is identical in season one and season forty and the
run is the only thing that knows the difference. The squad screen, the schedule and the boss
battle named it; the whole postseason did not.

| screen | what carries it |
|---|---|
| `s-squad` | `q-step` |
| `s-season` | `v-caleye` on the calendar |
| `s-seed` | `sd-eye` |
| `s-nbrk` | `nbrk-eyebrow`, not the round title under it |
| `s-po` | `po-round` |
| `s-over` | `ar-lab`, which already said it |

**The tail goes on the EYEBROW, never on the heading.** "Wild Card" is what the screen is and
stays the loudest thing on it. Which season it belongs to is the quiet half, and the eyebrow
is already the quiet half. A middot joins them, because `bg-eye` already did it that way.

**`seasonTag()` exists for the empty string, not for the season.** Every one of these elements
is static markup that the Trade Machine and Full Team are drawn into on the same page, so the
label has to be REWRITTEN on every paint rather than only set when there is a season to name.
Written `if (dynasty) set-with-season`, a dynasty in the other slot leaves its season number on
a mode that has no seasons: a sentence that is wrong rather than missing, and nothing throws.
Returning `''` makes the concatenation unconditional, so **the reset cannot be the half
somebody forgets**.

**The guard walks the postseason TWICE and the second walk is the whole point.** The first
version flipped the run to a Trade Machine and called `paintSeed` alone, so only one of the
three elements was drawn a second time, and the careless conditional PASSED on the other two
because nothing ever painted them as a non-dynasty. It rebuilds the same seed, flips the flags
before pressing the button, and asserts none of the three carries the tag.

Three things that each cost a round, all of them about the harness rather than the page:

- **A layout assertion needs a laid out element.** Finding the card by id while a run screen
  was up reported "0 lines in a 0px column" instead of saying the front page was not showing.
- **`advanceWeek` does not stop at week 17.** Reading the phase in a loop ran the whole
  postseason, so the run was `over` before anything was looked at, and `startPlayoffs` then
  threw "not at seeding". A greedy draft also does not reach the playoffs every year, so the
  seed is searched for rather than assumed.
- **`/Season/i` matches "Regular season complete".** The absence to assert is the TAG, not the
  word.

### A leaderboard nobody can open renders perfectly

The Dynasty board had a table, two axes, three queries and no way in. The only thing that
ever set `lbDynasty` was `boardFromRun()`, which needs a finished dynasty season on screen,
and `openBoard()` cleared the flag on every other path with a comment explaining that Dynasty
board is only ever a run's own board. So it was reachable from exactly one place, and a
player who went looking for it from the front page could not find it. **Nothing was broken
and nothing could report it.** Found by a player, not by a check.

It is a competition in the `#lb-comp` select now, gated on `canPlayDynasty()` the way Full
Team and the Trade Machine are gated on theirs.

**The select had to stop hiding itself, and that is the part worth reading before undoing
it.** `boardChrome` hid `.lbmode` on this board because Dynasty's axis tabs (Longest runs /
High score) stand in for it. That held while the board was only ever a run's own board. It is
false the moment the select is the way IN: you would land on Dynasty and have to close the
whole screen to look at anything else. **The sort bar is what those tabs actually replace**,
so the sort bar is what hides now and the select stays up on both.

**The rebuild key named two of the four gates.** `paintComp` only rebuilds the select when
`dataset.tm` changes, and that string was built from `canPlayTrade()` and `canPlayDefense()`
and neither Full Team nor Dynasty. Auth resolves after the first paint, so an option whose
gate is not in the key can only ever appear if it was already eligible on the very first
paint, which for a signed in player it is not. Every gate in the select is in the key now.

**And its blurb was written after the request rather than before it.** Nothing in that
sentence depends on what comes back, so below the `await` the unreachable branch returned
early and left the LAST board's sentence sitting under a Dynasty table: switching over with
the network down read "Free runs only. Each franchise has its own board." A wrong sentence
rather than a missing one, and nothing throws.

`check-premium.mjs` drives both directions, because the way back is the half that never
existed, and it asserts the run-based route still works: adding a second way in must not cost
the first.

### A board row cannot answer a question about the account that wrote it

```
node football/check-premium.mjs        the two marks, on both boards
createdb pro_live
psql -d pro_live -f supabase/test/dynboard_base.sql
psql -d pro_live -f supabase/98_football_gauntlet_board.sql
psql -d pro_live -c 'create table public.subscriptions(user_id uuid, status text, current_period_end timestamptz);'
psql -d pro_live -f supabase/101_premium_bundles.sql
psql -d pro_live -f supabase/107_board_pro_and_live.sql
psql -d pro_live -f supabase/test/board_pro_live_test.sql
```

A gold name for a Pro account and a LIVE badge on a dynasty still being played. Both are
decoration, neither moves a rank, and **neither is knowable in the browser**. `premium_unlocks`
is RLS'd to its owner, so nobody can see who else paid; nothing about somebody else's save
reaches this page at all. So they are columns: `display_pro` and `dynasty_over`, written by
`supabase/107_board_pro_and_live.sql`.

**Without that migration both go quiet and nothing else changes.** An absent column reads as
undefined, which is falsy for one and is not the `false` that means live for the other, so the
board is exactly the board it was. Same shape as every other optional column on these rows, and
`board.js` probes for `display_pro` on the classic path the way it already probes for the crest.

**`display_pro` publishes who has paid**, for anybody with a row on a public board. That is a
disclosure and it is written up in 107's header: one boolean, naming no product, no price and
no date. **It is DERIVED and never typed.** Two triggers read `premium_unlocks` directly and
they are the only writers, so it cannot be forged into a gold name the way a crest ring can be
forged into a gold circle. It honours `expires_at`, and it is scoped to `ps_premium` and
`cfb_premium`: an Arcade Card buyer has no Pro tier in this game and marking them would be
saying something false.

**GOLD ON THE NAME, NEVER ON THE ROW.** Gold on this board is an ACHIEVEMENT (a perfect season,
the top step) and the blue rail is WHOSE row it is. Both have to keep meaning that, and a paid
account is neither. The name text had never carried a colour, so it was the one surface free to
say something new. Nothing else on the row moves: no pill, no badge, nothing competing with the
champion mark already in front of the name. A reader who does not know what it means reads a
slightly nicer name, which is the right amount to be told.

**The solid gold is the base and the gradient is the upgrade, and writing it the other way round
loses every Pro player.** `background-clip:text` needs `color:transparent` to show at all, so a
browser without the clip would render an invisible name. The plain rule paints a warm gold and
an `@supports` block replaces it. The sheen is seven seconds a pass over a gradient whose
darkest stop is still gold, so no point in the cycle is dimmer than the base: a board is
twenty-five names and anything quicker is twenty-five things flashing at somebody hunting for
one row.

#### The LIVE badge is Dynasty's alone, and the cutoff is the page's own judgement

Every other board here ranks finished seasons. A dynasty is the one run that spans days, so it
is the only one where "are they still playing it" is a question.

`dynasty_over` is **three-valued** and only the `false` lights up. `null` is every row written
before this existed, and a board of LIVE badges on runs from six months ago is worse than no
badge at all. That is the "absent is not zero" rule the daily meter already runs on; a column
defaulted to `false` would have lit the entire history on deploy.

**What no column can ever know is a run somebody walked away from.** Nothing reaches the server
when a player closes the tab for the last time, so an abandoned run stays `false` for ever. The
page refuses to call anything live whose furthest season is older than `DYN_LIVE_HOURS`, which
is **48**: two days of a free account's three-a-day budget, long enough that somebody who plays
each evening is still live in the morning. **The cutoff is in the page and not in SQL on
purpose**, because it is a judgement about what "still going" means to a reader rather than a
fact about the run, so it moves in a deploy instead of a migration.

**`dynClear` is where the end is posted, because that function IS what ending a dynasty means
here.** Four paths finish one (the firing at the results screen, the drop button, and the two
places a new draft clears the slot it is taking) and hanging the call on any one of them would
leave the other three broadcasting LIVE for ever. The id comes off the save about to be deleted
rather than off `run`, because `beginDynastyDraft` clears the slot it is TAKING, which may be
the other one. Never awaited, fails soft, and not retried: a dynasty that ends with the network
down keeps a stale badge, which is the cheapest thing on this screen to be wrong about.

**The pin needs no column for either mark**, and that is not a shortcut. It is not a board row:
it is the run in this browser's hands, so it is live by the fact that it is being drawn, and the
viewer's own unlocks are the one account this page can read.

##### One account wore four of them, and the missing fact was the SLOT

```
psql -d dyn_slot -f supabase/108_dynasty_slot.sql
psql -d dyn_slot -f supabase/test/dynasty_slot_test.sql
```

Reported with a screenshot: four rows of the Dynasty board wearing LIVE, all one player.
`FB_SLOTS` has **two** dynasty slots, so two is the ceiling. Every one of the four was a true
statement of "not explicitly ended, and played inside 48 hours" wearing a word that means
something else, which is the paragraph above arriving as a bug: the window was the only thing
standing between an unposted end and a wall of red, and two days is long enough for a tester
to play four runs.

**The server knew every dynasty and when each one's furthest season landed, and not which of
the two slots it occupied**, so it could not tell the newest run in a slot from the ones
abandoned behind it. `supabase/108_dynasty_slot.sql` adds `dynasty_slot`, and
`dynasty_current` is the newest unfinished run in each slot. Two an account, by arithmetic on
rows the server already has, rather than by hoping a fire-and-forget client call got through.

**`dynasty_over` still means exactly what it meant.** Folding the two into one column would
make "was this ended" un-askable and take 107's own test with it. A stale run is not over:
nobody ended it, and that is the whole reason this exists.

**It repairs the rows already on the board.** Every dynasty filed before today has a null
slot and they share one bucket, so an account's older unfinished runs stop being current the
moment a newer one exists. Four badges become one with nobody editing a row. An account that
genuinely had two going loses one until its next season is filed, which is the small error in
the quiet direction and is self-healing.

**RANKED OVER ALL OF THE ACCOUNT'S RUNS, NOT ONLY THE UNFINISHED ONES**, and that is the
clause most likely to be simplified wrongly. Rank the unfinished alone and a stale run whose
slot was later taken by a run that has since FINISHED floats back to the top and wears the
badge again. **A guest is not ranked at all**: `user_id` is null for a run filed by nobody, so
a partition on it would put every guest run in the world into one bucket.

**A SLOT BELONGS TO THE DYNASTY AND IS STORED ON A SEASON, and the first draft did not close
that join.** Written `coalesce(p_slot, dynasty_slot)` in the tag, it reads like it defends the
recorded slot and defends nothing, because every season is its OWN ROW and the row being
written was inserted a moment earlier with a null in it. One season from a browser one deploy
behind would then be the furthest season, the view reads the slot off that row, and a well
recorded dynasty drops into the null bucket. A null argument INHERITS the dynasty's own slot
now. **And the test of it passed with the defect in**, because it asked
`bool_and(dynasty_slot = 'club')` over the dynasty's rows and **`bool_and` ignores nulls**, so
the one row that had been blanked was the one row not counted. It reads the row the board
reads.

**The column order in the view is 107's with the new one appended**, which is load-bearing
rather than tidy: `create or replace view` may add columns at the END and may not rename or
reorder, so a more natural order fails outright. A `drop view` first would work and is worse,
because it takes the grants with it and leaves a window where the board does not exist.

**AND THE TAG DROPS THE SLOT RATHER THAN THE SEASON, which is the version pin's own problem
in the one place a pin cannot reach.** SQL is deployed by hand and the page by a push, so
there is a window where the page asks for a function the database does not have. PostgREST
resolves an rpc by its ARGUMENT NAMES, so a five argument call against a database on 107 is
not a slower answer and not a null: it is 404 PGRST202, the season is never tagged, the run
has no `dynasty_id`, and it is simply not on the Dynasty board with nothing on screen saying
so. A refusal that names the SIGNATURE is retried without the slot. What that gives up is a
badge that is briefly wrong, and it heals on the next season filed after the migration.

**The two halves are guarded in two files, the same split 107 runs on.**
`check-premium.mjs` fabricates the column and hands it to the painters, so it says nothing
about what writes it; `supabase/test/dynasty_slot_test.sql` drives the real function and the
real view. Three defects were reintroduced one at a time to prove that file bites: ranking the
unfinished separately, dropping the guest clause, and dropping the inheritance.

#### Every way this breaks renders perfectly, so the guard measures the screen

The rows are fabricated and handed straight to the painters, covering live, live and paid,
finished and paid, neither, and the run three days old that no column will ever mark as over.

- **The pill is asserted as a HEIGHT, not only as a display.** `.lbr .who span` claims every
  span inside `.who` as a block at (0,2,1), which is the exact cascade the champion mark lost:
  a pill that loses it takes the row's whole width and drops the name onto a second line. So
  `.lbr .who b .livepill` is written a class deeper than it looks like it needs, and the guard
  compares a row wearing one against a row that is not. **It measures the NAME and not the
  ROW, because the row has a 75px floor set by the avatar beside it**: a name pushed onto a
  second line fits inside that, so the first draft compared rows, read 75 against 75 with the
  pill computing to `display:block`, and certified the defect. The name goes 20px to 39.
- **AND THAT RULE SETS A COLOUR TOO, which the first version of both the CSS and the guard
  missed.** The fix was written from the champion mark's bug and the champion mark is an SVG
  with its own fill, so the colour half of that cascade had never cost anything. Here it did:
  `.lbr .who span` also sets `color:var(--dim-2)` for the sub line, so the pill shipped as a
  red box with a red dot and the word in the grey of the row behind it. **Found by taking a
  screenshot and looking at it**, and the section had just passed green on it. The guard asks
  that the word is not the sub line's colour and that it is reddish, which is the property
  rather than the hex. **It reads the sub line as `.who > span` and the child combinator is
  load-bearing**: the pill is a span too, nested inside the name, so a descendant selector
  matches the PILL, and the comparison was the pill against itself. It can never differ, so
  the assertion failed on a correct page. Same class as this repo's three wrong extractors,
  arriving at a one line read.
- **The podium's dot has no box, and that was the second thing only looking could say.** With
  the word collapsed, the pill's 1px border drew a ring 4px across a 5px dot, which reads as a
  bullseye rather than as a light that is on. A chip is a container for a label; with no label
  there is nothing to contain, so the border and the fill go and the glow carries it.

**The SQL half has its own file**, because the page's guard fabricates the columns and
therefore says nothing about what writes them. `supabase/test/board_pro_live_test.sql` drives
the real triggers and the real functions: a free account, a buyer, an Arcade Card holder (who
is NOT Pro here), an expired unlock, a guest run, and the backfill that gilds rows already on
the board. Four of its claims were proved by reintroducing a defect alone.

**Its exception test asserted nothing on the first draft, and the shape is worth recognising.**
Written as `claim(false)` inside the `begin` arm, the failure it raises is caught by that
block's own `when others` and reported as a pass, so the check certified 98's not-found guard
while the guard was deleted. **An exception test cannot assert inside the block it is
watching**: the flag is set in the handler and read after the block.
- **The gilding is asserted on the NAME and the ROW is asserted UNCHANGED**, because the whole
  argument above is about which of the two may carry it.
- **The champion mark survives a transparent name** because its SVG carries an explicit fill
  rather than `currentColor`. Asserted, since `-webkit-text-fill-color:transparent` on the
  parent is exactly the kind of thing that takes a sibling with it.
- **On the podium the word is collapsed to its dot in CSS**, not dropped from the markup. A step
  is about 93px of text at 390px and a 36px pill in front of an 11.5px name truncates most names
  to two syllables. `font-size:0` leaves LIVE in the accessibility tree, so the pill stays ONE
  element with one spelling rather than a second element that can drift.

### A dynasty score is quadratic, so its abbreviation needs more than one rung

`dynastySeasonScore` multiplies a season by its own season number, so a run's total grows
with the SQUARE of its length and has no ceiling. The corner on the front page had one rung,
`M`, and the record reached 1,524,900,000 and printed **`1524.9M`**: a correct abbreviation
of a number nobody writes that way, and longer than the exact figure it replaced. Reported by
a player. `B` and `T` both arrive on their own, from nobody doing anything new.

**The band is picked on the raw value and the string can round past it.** 999,999,999 is
under a billion, takes the `M` band, and 999.999999 to one decimal is `1000.0`, which strips
to `1000M`. That is the same fault again, from the inside. `dynHiNum` re-bands on the printed
value, which is the commish state card's rule at a fourth door.

**Abbreviated where the slot is fixed, exact where the row can give.** The door and a podium
step are boxes the number cannot argue with, and `.pod .pr` carries no ellipsis, so a billion
runs out of a 110px step with nothing to stop it. A list row shrinks the NAME instead and
keeps the figure, which is where somebody checking whether they beat it by four hundred
points is going to look. Measured at 390px: the score column goes 73px to 101px at eight
figures and takes 61px off the name.

**The guard measures the shape, not the width.** This harness renders the FALLBACK face,
about a third wider than the condensed one a real visitor gets, so an overflow measured here
is not proof of one on a phone. What it asserts is that a podium step never carries a raw
comma number, which is true in any face, plus the whole ladder including the rounding seam.

### The boss battle, and the one screen that checks itself

```
node football/check-boss.mjs      six seeds, taking the field goal
node football/check-boss.mjs go   the same, going for it on fourth down
```

**Its own file because its subject is a page.** `check-dynasty.mjs` drives `run.js` in node and
never opens a browser, and a boss battle is a sim playing forward down by down while a screen
animates it, pauses for a call, and writes a drive log beside it. The engine was right the
whole time the screen was wrong.

**This is the only place on the site that prints a RUNNING SCORE next to a list of drives**, so
it is the only place a reader can check the game against itself, and the only place where
getting it wrong is visible without anything throwing.

**`bossRescoreLast()` ran on every decision and belongs to one of them.** It stamps the current
score onto the TOP row of the log. It exists because a touchdown that pauses for a two point
try is logged when the drive ends, which is BEFORE the conversion, so that row needed updating
after. **A fourth down is the other way round**: the drive has not ended when the call is made,
`bossSimResolve` ends it and pushes it, and `bossFlush` logs it a moment later. So the top row
at that instant belonged to somebody else. Kick a 29 yarder to go 14-55 up to 17-55 and the
three landed on Seattle's field goal above it, so the row for your own kick repeated 17-55 and
the kick read as though it had scored nothing. Reported by a player.

**Asked structurally, not by the decision's kind.** The question is whether anything has been
produced that is not on screen yet, and `bossShown` against `bossSim.drives.length` is exactly
that question. A two point try pushes no drive, so they match and the top row is the touchdown
being converted. A fourth down that ends the drive pushes one, so they do not.

**The assertion is a property of the column, never a number.** Read bottom to top: only the
team that scored on a drive may move, a drive that scored nothing may move neither, and the
last row has to be the final on the bug. A pinned final score passes on a log whose middle is
nonsense, which is exactly the log that was shipping, because the bug above the field was
right the whole time.

**It samples seeds.** The fault needs a fourth down call to land next to somebody else's
drive. Measured with the bug reintroduced: three of six seeds show it, so a one-seed check
would have been a coin flip on whether the file was worth having.

#### Sim the rest, and what it deliberately does not skip

A boss battle animates every drive and is the longest watch in the mode, so `bossFast` hurries
the FOOTBALL: the drive animation, the beat after a score, the handoff between drives.

**It still stops for your calls.** Fourth down and the two point try are not pacing, they are
the mode: the screen exists so a boss is a set of decisions rather than a number that appears.
A run lost to a call the page made for you is the worst thing this mode could do.

**One way, and the flag survives the decisions it pauses at.** Pressing it takes the control
away rather than toggling, and somebody who asked for the rest of it fast meant after the call
too. **The fast path hands back through `setTimeout(cb,0)` rather than calling `cb`
directly**: `bossFlush` calls it per drive, so a synchronous handoff would run the whole game
inside one frame, with a stack as deep as the game is long and no paint between the first
drive and the verdict.

`.bg-skip` sets `display:flex`, so it carries its own `[hidden]` rule. That is the sixth time
in this file.

`check-boss.mjs` drives every one of its runs through that button, so if it stopped working
the whole file would time out.

### The elite band's top was written past what the game can draft

Asked for: make a 95+ quick draft roster win a bit more. What a rating band actually wins,
measured over 1800 real drafts:

| rating | win% | median | 17-0 |
|---|---|---|---|
| 85-90 | 68.2% | 12-5 | 0.0% |
| 90-95 | 79.7% | 14-3 | 0.9% |
| **95-100** | **85.7%** | **15-2** | **9.8%** |
| 100+ | 88.7% | 15-2 | 7.7% |

**Three constants anchored the top of the elite band above anything anybody drafts.** Over
3000 rosters: p90 93.7, p99 99.3, p999 103.0, max 104.9. Against that, `CLASS_TOP` was 115,
`ELITE_FULL` 105 and `ELITE_POLISH_FULL` 105. So the stretch above `CLASS_FULL` was never
more than a fifth earned (a 101 roster collected 0.004 of the 0.06 on offer), and the seed
vote was fully earned by nothing. All three sit at **103** now, the top of the real ladder.

**None of them touch the fitted stretch, and that is why they were the ones to move.**
`weeklyEdgeBand` is segmented: 95 to 100 is `at(rating)`, and the header over `CLASS_PIVOT`
says plainly that 95 through 100 is what `SCALE` was solved against, so moving it means
re-sweeping `SCALE`. The edge at 95 is byte-identical after this change; 101 goes 1.2083 to
1.2281.

**What it bought**, on the archetype `SCALE` is anchored to: 90.1% to 91.1% of games, median
15.3-1.7 to 15.5-1.5, titles 14.2% to 15.5%, and 20-0 from 1.9% to 2.5%. Targets block still
reads all within tolerance.

**THE 95-100 BAND ITSELF BARELY MOVED, AND THAT IS THE HONEST LIMIT OF THIS.** Both riders
were swept and both are small: doubling `ELITE_POLISH` moved a 95+ win rate 85.3% to 85.5%,
because it inherits `weeklyEdgeVs`'s damper and pays almost nothing against contenders. And
loosening that damper from `CLASS_FOE_LOW` 1.0 to 1.4, which is a large loosening of a
deliberate rule, bought 85.8% to 86.2% and 17-0 from 8.3% to 8.7%. **The 95-100 band is
governed by `at()` and `SCALE` and nothing else**, so lifting it is a re-calibration of the
whole game rather than a constant to nudge. Do not reach for the damper: it was added because
the undamped edge made 17-0 five times likelier, and it is worth 0.4 points.

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

## Fantasy Challenge, the weekly one

```
node football/check-fantasy.mjs            the gate, a whole entry, the lock, the phone
node football/check-fantasy.mjs --quick    the draft engine only, no browser
node football/build/weekly-pool.mjs --season 2026 --week 3 --write
node football/build/next-week.mjs          which week is about to be played
node football/build/test/probe_weekly.mjs     what a season to date is worth
node football/build/test/probe_projection.mjs whether a projection can beat it
node football/build/test/probe_cap.mjs        what cap makes the draft a decision
```

`football/fantasy/index.html` is the mode and `football/fantasy/draft.js` is the football.
Six slots (QB, RB, RB, WR, WR, TE), a $90M cap, five whole drafts, one submitted. Half PPR,
scored on what the six actually do. **It is a page of its own rather than a screen inside
the football game**, because it shares nothing with that engine: no season, no sim, no
ratings. What it shares is accounts, the palette and the tester pattern.

**IT IS NOT LAUNCHED AND THE FLAG IS NOT A LOCK.** `fantasy-access.js` ships
`FANTASY_LIVE = false`, so the door on the front page is BUILT for a tester and for nobody
else. The file is served to every visitor and the list is a console line from being edited.
Say that plainly rather than implying the page is private. It is the same gate the unlisted
games run on.

**THREE ACCESS FILES NOW, AND THEY ARE STILL THREE FILES.** `fullteam-access.js` says in as
many words "when a third mode wants this, merge them". This is the third and the merge is
DEFERRED, which is written in the new file's header: the other two ship `LIVE = true`, so
merging means editing two launched modes and their callers in the middle of building an
unlaunched one, and the way that fails is a door that is never built, which reports nothing.
`check-fullteam.mjs` walks **every** `*-access.js` on disk now rather than naming two, so the
lists cannot drift and a fourth mode is covered without anybody remembering.

### The price is what he has done. The projection is the same number.

`football/build/weekly-pool.mjs` builds one week's board from weeks 1 to N-1 plus the
SCHEDULE, and nothing may read week N. "Everybody with a row in week N" is one filter away
and would be a pool with the future in it: it excludes exactly the men who were inactive,
hurt or rested, which is what the game asks a player to predict.

**Half PPR is derived and asserted on every build.** nflverse ships standard and full PPR and
no half. `fantasy_points + receptions == fantasy_points_ppr` holds exactly on all 18,130 REG
rows of 2024, so half is standard plus half a catch. If that identity ever stops holding the
build THROWS rather than quietly paying the wrong number.

**A short sample cannot be priced like a long one, and the fix is the opposite of the obvious
one.** On the raw average, 2024 week 8 put Russell Wilson at the $48M ceiling off ONE game
beside Lamar Jackson at the same price off seven. Regressing toward the position's median
made every measure worse, monotonically, because a man is on this board BECAUSE his one game
was big, so a prior above his estimate pushes him further out. Toward ZERO at `SHRINK_K = 2`,
the gap between what a one game man and a six game man deliver at the same price goes 3.48 to
0.12, and r and mean error both improve at the same time.

**And K was first fitted on the wrong objective.** Correlation asks whether the board is in
the right ORDER; what pricing promises is that equal price means equal expected points, which
is BIAS. Fitted on r, shrinkage of any kind looked strictly harmful and the thing it exists to
fix went unmeasured.

**THE PROJECTION IS THE SEASON TO DATE AND A CONSTANT, and that is a measurement rather than
laziness.** No free weekly projection is licensable, so one was built and then tested. Over
6,720 draftable player-weeks of 2022 to 2024, against a 5.887 baseline mean error:

| | mae |
|---|---|
| the season to date alone | 5.887 |
| plus the best matchup term found | 5.878 |
| plus the best recency term found | 5.867 |

Neither is a term. **The recency term is worse than useless for a number that is PRINTED**: it
takes the bias from +0.54 to +1.06, because the last three games of a man near the top of the
board run hot. What ships is one addition, `PROJ_LIFT = 0.54`, because the shrink leaves every
estimate low by that much and six men is three points of lineup projection a reader would
watch come in high every week. **A flat offset and not a fitted line**: least squares wants a
slope of 0.972, and a slope under one flattens the board by pulling the best men toward the
middle. All three candidates land inside 0.013 of each other and remove the bias exactly, so
the tiebreak is what they disturb.

**So price and projection are the same quantity up to a constant, which means THE BOARD
CANNOT CONTAIN A DECISION ITS OWN NUMBERS RESOLVE.** The dearest man on any board is also the
highest projected one. That is why the card shows the STAT LINE and the price and no per man
projection: the edge is everything the board cannot see, which is injuries, snap shares,
weather and who is actually starting. The lineup's projected total is shown after the six are
in, which is the one number this mode prints about the future.

**The top of the board is the best man on it, not the 99th percentile.** That anchor is
inherited from a pricing built over tens of thousands of finished seasons where the 99th
percentile is deep. One week is about 500 men, so it is five men in: measured over twelve
weeks, four to seven men sat on the $48M ceiling every week with up to 7.6 points of
projection between them, and the dearest slot was "take the highest projection". Anchored at
the maximum, exactly one man reaches it every week by construction.

**The board is priced against ITSELF.** A man whose club is idle is off it and out of the
anchors, or a leader sitting a bye sets a ceiling nobody draftable can reach.

### The cap is the crossover, and the wheel only reaches as far as the league starts

`probe_cap.mjs` sweeps the cap against two real strategies. GREEDY takes the dearest man
offered; BUDGET holds back a share for each remaining slot.

| cap | greedy | budget | budget-greedy | greedy spends |
|---|---|---|---|---|
| 70 | 41.2 | 46.0 | +4.7 | 100% |
| 80 | 47.3 | 49.6 | +2.2 | 99% |
| **90** | **52.2** | **52.6** | **+0.4** | **97%** |
| 93 | 53.5 | 53.6 | +0.1 | 96% |
| 100 | 56.0 | 55.3 | -0.7 | 94% |
| 125 | 60.2 | 59.0 | -1.3 | 81% |

Above the mid nineties the cap stops binding and spending everything early is simply right.
Below the eighties, holding money back is. They cross at 93 and are inside half a point from
90, which is the only band where a drafter has to look at the board rather than apply a rule.
**It ships at the round number inside that band** rather than at the crossover: four tenths
of a point on a fifty point lineup, and `$90M` is a figure somebody can hold in their head.

**Taking whatever the wheel offers scores 39.5**, which is 12.8 behind both. Drafting matters.

**VALUE PER DOLLAR IS NOT A THIRD STRATEGY** and the probe keeps a row to say so. The price
curve is convex on purpose, so points per million always picks the cheapest man on the board
and finishes 22 points behind. Anybody reaching for a ratio here should see that row first.

**DEPTH IS A CEILING, NOT THE NUMBER.** Week three has 42 quarterbacks with a game to their
name and 168 receivers, so a flat 40 is the whole quarterback position and a quarter of the
receivers. Driven, a quarterback board came up Caleb Williams, Jalen Hurts, Trevor Lawrence,
Kenny Pickett and Mason Rudolph: two of five were men who will not take a snap, and the board
reads as junk rather than as a choice. The depth is the smaller of the ceiling and **how many
of that position the league starts**, derived from the clubs playing this week times how many
of that position this lineup asks for. No table to keep in step, and a bye week narrows the
wheel by itself.

**THE RESERVE FLOOR IS NOT OPTIONAL.** A draft that spends so much on a quarterback that no
tight end is affordable strands, and it strands silently: the board comes up empty and the
player is looking at a screen with no way on. `reserveAfter()` is what stops it, and
`check-fantasy.mjs` plays 1,200 drafts three ways to say so. The page still carries a sentence
for an empty board, because a screen that would trap somebody should say which of the two it
is rather than going blank.

### The boards are per player, and the five chances are what makes that survivable

Asked and answered: with a prize for the top three, every entrant meets their OWN wheel rather
than a shared one. **Recorded here rather than argued again: part of the gap between first and
fourth is who was offered whom.** The alternative, seeding the week so everybody spins the same
wheel, is what hoops Daily does and is written up under "Today's run" above.

**What carries most of the weight against that is the FIVE.** Measured at the shipped cap, the
standard deviation of one draft against the best of five:

| | one draft | best of five |
|---|---|---|
| taking whatever is offered | 6.76 | 4.17 |
| drafting greedily | 3.33 | 1.01 |

So two entrants who both draft well submit lineups within about a point of each other, where a
single draft each would have put them three apart.

**A CHANCE STORES A SEED, AND A RELOAD MUST NOT RE-ROLL IT.** Boards are rebuilt from the seed
rather than stored, so pressing reload comes back to the same five men. Without it, five
chances are as many as somebody has patience for, and nothing about that is visible: the board
renders, the draft finishes, the lineup is legal. `check-fantasy.mjs` drives the reload through
the page rather than through `draft.js`, because the property is that what is STORED is enough
to rebuild the board: a seed kept only in a variable passes every engine assertion.

### The week, the lock and the clock

**`fantasy_now.json` says which week is live and the build writes it.** The page reads it and
never carries a week number, because a hand-written number beside a generated file is the class
of thing this repo keeps a checker for. Shipping a week is one command.

**THE WEEK LOCKS AT THE FIRST KICKOFF, not at the Sunday one.** A Thursday game is a real game
and a lineup submitted after it has started is a lineup submitted knowing how one of its men
did.

**The schedule is in Eastern and the offset is not a constant.** `gameday` and `gametime` are
wall clock in America/New_York and the season crosses a clock change in early November, so a
hardcoded `-04:00` puts every game from week ten an hour out, which is enough to lock a week
after the Thursday game has kicked off. `easternInstant()` asks the zone rather than assuming
it. Verified across the change: week 3 and week 10 both resolve to 8:15pm ET.

**`next-week.mjs` asks the schedule, never the calendar**, and it asks for the earliest week in
which NOT ONE game has been played. "The first week with an unplayed game" is the obvious
version and it sticks forever on a postponement. And `home_score` is BLANK for an unplayed
game while `Number('')` is 0, so read naively every future game looks like a nil-nil draw that
has already happened and the season reads as finished in September.

**`.github/workflows/fantasy-pool.yml` builds the week every Tuesday at 11am Eastern**, which is
after the Monday night game and two and a half days before the Thursday lock. Two cron entries
and the job asks WHICH SCHEDULE FIRED rather than what time it is now, which is the fix
`setlist-data.yml` carries a long note about. Nothing is committed unless `check-fantasy
--quick` passes.

### The week is scored, and the loop closes on the home screen

```
node football/build/weekly-results.mjs --season 2026 --week 3
node football/build/weekly-results.mjs --season 2026 --week 3 --write
```

The other half of `weekly-pool.mjs`. That file is forbidden from reading week N; this one reads
week N and nothing else, because by the time it runs there is nothing left to predict.

**A MAN WITH NO ROW SCORED ZERO, and that is a result rather than a gap.** nflverse writes a row
for a man who was active and did nothing, and no row at all for one who was inactive, hurt,
benched or cut. All four are nought on a fantasy lineup, and telling them apart is exactly what
the drafter was being asked to do. Read as "unknown" instead, a lineup quietly totals five men.
So the screen prints `0.0` AND says `did not play`: a zero beside nothing reads as a rendering
fault.

**IT REFUSES AN UNFINISHED WEEK unless asked twice.** Publishing mid-Sunday shows somebody a
total that climbs all afternoon, which reads as the game being broken rather than as the Monday
night game not having kicked off. `--partial` is the deliberate override, and the page carries
the honest wording for it (`3 of 16 games are in. This will move.`) because the workflow can be
run by hand.

**THE RESULT IS FOUND BY ASKING, NOT BY A POINTER.** `fantasy_now.json` says which week is live;
nothing says which weeks are scored. The page derives `results_<season>_w<week>.json` from the
week it already knows and treats a 404 as "not scored yet". A pointer would be a third
hand-written field kept in step by two build scripts writing one file, and its failure mode is a
week that is scored on disk and unscored on screen. It costs one request that usually misses.

**ONE SCREEN, TWO STATES.** The entry and the result are the same six men either side of the
games, so they are one painter. A second screen would be two places describing one lineup, and
they would disagree the first time one was edited. What changes is the big number, the label over
it, and whether each row carries what he did.

**THE PROJECTION STAYS ON SCREEN NEXT TO THE REAL NUMBER.** 71.4 is a good week or a bad one
depending on what the board thought, and the gap is the only thing on the page that tells a
drafter whether the calls they made off what the board could not see were the right ones.

**And the LOOP CLOSES ON THE HOME SCREEN.** The week rolls over on Tuesday, so the entry screen
for the week just played stops being what the page shows, and without a card on the way in the
only thing that ever told somebody how they did is gone before most of them come back. It reads
last week's own key and last week's own POOL, because an entry stores player ids and this week's
board cannot name last week's men: somebody on a bye, cut or traded is simply not in it, and six
ids resolved against the wrong week silently draw a four man lineup. One week back and no
further: a season of cards on the front page is a screen you scroll past to reach the draft.

**The Tuesday workflow scores BEFORE it builds**, and the order is the point rather than
tidiness: a week whose board rolls forward before its result is written is a week somebody played
and can never see. That step is allowed to have nothing to do, because week one has no week zero
and a manual mid-week run hits a week the build correctly refuses.

### The entry is the server's, and this one fails CLOSED

```
psql -d fantasy -f supabase/test/fantasy_base.sql
psql -d fantasy -f supabase/109_fantasy_challenge.sql
psql -d fantasy -f supabase/test/fantasy_challenge_test.sql
node football/build/publish-week.mjs --season 2026 --week 3 | psql "$SUPABASE_DB_URL"
```

`supabase/109_fantasy_challenge.sql` holds the week, the board and the results.
`football/fantasy/entries.js` is the only thing that talks to it. **The client sends six ids
and nothing else**: the cap, the lock, the slot shape and whether a man was even on this
week's board are all answered from rows, because a client that can post any six players at
any price is a client that can win a prize with a lineup it invented.

**IT FAILS CLOSED, AND THAT IS THE REVERSAL TO READ BEFORE COPYING ANYTHING HERE.** Every
other allowance on this site fails open and argues for it at length: an unreachable
Commissioner clock lets the season through, because a wrongly granted season costs a
fraction of a sale and a wrongly refused one costs a player who came back. That inverts when
there is a prize. A week with no row is a week with no entries.

**The week carries its own cap and slots** rather than the migration hardcoding them, which
is `108_hoops_leaderboard.sql`'s own warning heeded. `publish-week.mjs` writes them off the
same `draft.js` the page drafts against, so an entry is checked against the rules the board
it came from was built with.

**A score is derived and never stored**, so a corrected stat re-scores every row on the next
read with no backfill and no settle job to forget. `spend` and `projected` ARE stored, and
the difference is what each is about: the score is a fact about the games, those two are
facts about the draft at the moment it was entered.

**THE BOARD OPENS AT THE LOCK**, and that is about the competition rather than privacy. Every
entrant meets their own wheel, so before kickoff a list of everybody's lineups and their
projections is the answer key handed to whoever enters last. What is answered before the lock
is how many have entered.

**On the entry screen an empty board is a SHUT one, never an empty one.** The reader has an
entry by definition, so once the board opens their own row is in it: a "nobody yet" line
there is a sentence that cannot be true, printed at the moment it is most likely to be read.
That is the four-states rule bending, because two of the four cannot happen on this screen.

**The name is copied at submit time**, unlike every other board here, which reads it live. A
board of a finished week is a record of who entered it, and somebody renaming themselves in
November should not rewrite week 3's result.

#### A submit has three answers and the page draws all three

**`entries.js` is not `board.js` and must not become it.** Every call in `board.js` fails
soft and resolves to null, because a leaderboard that will not draw costs nothing: the season
it is reading was already recorded. Nothing else records a fantasy lineup, so the same
treatment is a player who believes they are in a competition they are not in.

| | |
|---|---|
| `{ok:true}` | in, and the row is there |
| `{ok:false, why}` | refused, and the server's own sentence says why |
| `{ok:null}` | nobody knows, including this page |

**THE THIRD IS RECONCILED RATHER THAN GUESSED.** A request can land, write the row and lose
its answer, so the page ASKS: `mine()` is the one thing that can settle it. Read as a failure
it tells somebody to try again on a week they are already in, and they then meet "you have
already entered this week" and read the mode as broken. **Nothing is written locally until
the server has said yes**, which is `dynNewSheet`'s lesson at a new door.

**What the reader sees is the server's own sentence**, not a translation. Every refusal in
`fantasy_submit` is already written for a person, so a second copy in the page would be nine
strings that drift the first time one is edited. What the client refuses to pass on is
anything that does not look like one, because a reader shown `PGRST202` has been told nothing.

#### What the two guards found

`check-fantasy.mjs` stubs the server and **not one request reaches the real one**, which is
this file's version of the Stripe note: the live project holds the real competition, so a
checker that let a request out would enter a lineup on somebody's account.

- **`is_me` came back NULL for a signed out reader**, because `user_id = auth.uid()` is null
  when the uid is. The page reads it as falsy and looks right, which is what makes it worth
  fixing rather than leaving.
- **The read-own policy had no grant behind it**, so reading your own entry raised permission
  denied. RLS narrows a grant, it does not make one.
- **A claim that the score's LEFT join was load bearing passed with an inner join in its
  place**, because a missing row contributes null to a `sum` and null adds the same as
  nothing. The comment was the half that was lying. It asserts the arithmetic and the join
  KEY now, and a week 2 carrying wild numbers on the same ids is what catches a join that
  forgets the week.
- **A fixture arm that could never fire.** `if (s.submit && s.submit !== 'ok')` catches the
  string `'lost'` too, so the lost-answer arm was served an ordinary refusal and the branch
  it exists for was unreachable. It reported the page failing to reconcile something it had
  never been asked to.
- **Three of the four submit arms end on the screen they START on**, so
  `waitForSelector('#s-review.on')` returns in the same tick and every assertion after it
  reads the page before the answer has landed. The button's label is the one thing that is
  different while a submit is in flight.

#### What is still NOT built

**Accounts are free to make, so nothing stops one person entering five times under five
accounts.** That can be made harder and not impossible, and it should be said out loud rather
than designed around quietly.

**Pro must not buy draws or entries.** The bundle sells the counting away. Selling an advantage
in a prize competition is a different kind of product and this mode has no paid tier at all,
which is why there is no `fantasySold()` beside `fullTeamSold()`.

#### The prize is decided, and one half of it must not go where it looks like it goes

The top three get something. First takes the Pro bundle; all three get a mark on the account and
a profile image only a winner has.

**A WEEKLY WIN MUST NEVER ENTER `achievements.js`'s CATALOG**, and this is the Full Team gate
argument arriving from the other side. `CATALOG.length` is the denominator `crest.js` divides by
and it is one number for everybody, so a badge for finishing top three in a weekly competition
is a badge almost nobody can ever light: every other account's GOAT would be permanently capped
below 100% by something no amount of play can reach. That is the ceiling the bundle refused to
put in front of Full Team, and it would arrive here by accident the first time somebody files a
winner's badge in the obvious place. A winner's mark belongs on its own surface, outside the
denominator.

**It also cannot be DERIVED the way every other badge here is.** The cabinet is retroactive
because every badge is a question about rows in `ps_runs`, and a fantasy entry is not one of
those. Whatever holds a win has to be its own record.

**The bundle grant is a `premium_unlocks` row and should be written by hand while the numbers
are small.** An automated path from "won a week" to "owns the product" is a second way to obtain
the thing the store sells, and the store has exactly one on purpose.

**A profile image only a winner has is a claim about an account, so it is the board's own
problem**: `display_pro` is already the pattern, a derived boolean written by a trigger rather
than typed, because a mark anybody can set is a mark that means nothing.

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

The sprites came from a generator and now come from a HANDOFF PACK, and the
generator is kept because the pack cannot answer everything:

```
python3 mythiball/sprites/tools/audit.py        what is in the pack
python3 mythiball/sprites/tools/build_table.py  build V2_SPRITES from it
python3 mythiball/sprites/tools/install.py      swap it into the page
python3 mythiball/sprites/tools/install.py --revert   put the generator back
python3 mythiball/gen_sprites_v2.py > sprites.js      the old parametric one
```

**THE STILLS ARE WHAT MADE THE SWAP POSSIBLE, NOT THE ANIMATION STRIPS.**
`mythiball/sprites/source_reference/sprites_64/` carries all 68 characters in
right and left with no gaps at all, including the 13 the handoff lists as
omitted. The animation strips cover 55 characters and **141 of their 330 are
unusable**, so building off strips alone would have restyled part of a roster
and left the rest generated, which reads worse than either style on its own.
The same is true INSIDE a character: a pack idle over a generated swing makes
a man change species when he swings. So a character is built entirely from the
pack, the stills are the floor, and a working strip upgrades a pose from a
still to a drawn frame on top. Of the 1,156 poses, **642 are drawn frames**,
611 stand on a still, and 13 are a character the pack drew exactly once.

**AND 751 WAS A MISCOUNT THAT READ LIKE PROGRESS.** The builder counted a pose
as drawn when its source did NOT begin `source_reference`, which is true of a
strip frame and equally true of the string `repeat of idle`. So 151 characters
standing perfectly still were filed as drawn art and the number went up every
time the fallback was used more. It counts what the source actually says now.
A tally written as "not the bad case" will count the next case nobody thought
of, and it will count it on the good side.

**A FRAME IS GOOD OR BAD ON ITS OWN, AND READING THE STRIP'S VERDICT THREW ART
AWAY.** The audit classifies a STRIP, because a strip is what an artist
redraws, and the first build read that verdict straight: one clipped frame in
a four frame swing condemned the other three, so acrobat's follow through fell
back to a still while the drawn follow through sat in the file untouched.
Asking about the FRAME recovered **86 poses**. It is the clipping rule's own
mistake one level up: do not condemn good art because of its neighbour.

#### The swing did not swing, and two faults compounded into it

Every pose falling back inside a strip landed on **frame zero**, because the
walk was written `[the frame asked for] + [0, 1, 2, ...]`. Three poses come
off the swing strip (load #0, swing #2, follow #3) and four off the pitch
strip, and the middle frame of each is the one the artist drew widest, so it
is the one that touches the canvas edge and gets refused. Measured on the
built table: **`swing` was pixel identical to `load` on 31 characters** and
**`release` to `windup` on 32**. The bat came round by not moving. Nothing
threw and nothing could, because a repeated frame is a perfectly valid frame.

So the walk goes **outward from the frame asked for**, which keeps a
substitute inside the same beat of the action, and **prefers a frame no other
pose has claimed**. A claimed one is still allowed last: the right action
drawn twice beats a still. The same 637 strip frames come through either way,
so this bought nothing in art and redistributed all of it.

**AND `ready` HAD A BRANCH THAT COULD NEVER FIRE.** It preferred the front
still for `ready` and `load`, guarded on the front existing and differing from
idle, and it was written before idle BECAME the front still. After that change
the two are the same object, the test was false every time, and **28 batting
stances quietly fell through to a repeat of idle**. Anything with no drawn
frame stands on the PROFILE now rather than on idle, which is not a
second best: a right handed batter is drawn unflipped and a lefty is mirrored,
the pitcher the same way, so the pack's right facing still already points
where the action goes. Idle faces the reader, and a character with no strips
used to stand square to the camera through a whole at bat.

Between them, poses the reader cannot tell from idle went **151 to 18**. The
18 are the nine characters with no front view and no strips, where there is no
second drawing to reach for. That is the art order, not a defect.

#### The game was showing a quarter of the frames the artist drew

**274 drawn, usable frames were never on screen.** A run strip is FOUR
frames and a real cycle: contact, passing, the other contact, passing. The
page played a two pose toggle off frames 0 and 2, so every runner in the
game shuffled between two legs positions while the other two sat in the
file. The swing strip is four beats and the page showed three, so the bat
went from over the shoulder to the ball with nothing in between.

**Nothing about the ART was wrong, which is why no check moved when this
was fixed and none would have caught it.** Every guard here asks whether a
drawing is right, present, or distinct from its neighbour. None of them
asked whether the GAME ever puts it on screen.

**The stride rate is unchanged, and that is arithmetic rather than taste.**
Frames 0 and 2 are the two CONTACTS, the moments a foot lands. The old
toggle put a contact up every `p`, so four frames run at HALF that period
to keep the feet landing at the same rate. Run four at `p` each and the
legs move half as fast: the same man, suddenly wading.

**`runPose` is the cycle written ONCE.** It was written out four times, at
three path sites and the batter's walk up, each as its own `stride ? a : b`.
Four copies of a rule is four places to forget it, and the fifth thing that
wanted it was the swing.

**AWAY IS STILL TWO POSES and that is the art rather than the cadence.**
The pack has no rear view at all, so `backrun1` and `backrun2` are both the
left facing still and a runner going to second does not animate either way.
It is written as a cycle anyway, so the day those frames exist it is one
line rather than a fifth copy.

**Every character is already drawn to the same standard**, which is worth
knowing before anybody orders art to fix how the game looks. The thirteen
with no animation at all have stills statistically identical to the
fifty five with a full set: 1617 opaque pixels against 1593, 75 colours
against 71, 61 rows tall against 62. They are the same artist's work. What
makes one character look better than another here is whether he MOVES.

**And there is no shared rig to lift, which was measured before it was
believed.** If the artist had posed one template, the swing silhouettes
would agree with each other MORE than the stills do. Across 45 humanoid
characters the stills agree at 0.70 and the swing frames at 0.34 to 0.46,
so every swing was drawn individually. Within one character the still and
the contact frame overlap at 0.35, so a warp between them is a deformation
large enough to destroy 64x64 art. Transferring motion from a character who
has it to one who does not is not available.

#### Nineteen characters played the game as somebody else

**Medusa stood at the plate as a gorgon and took the swing as a brown haired
woman in a blue dress.** Apollo stood holding a lyre and played as a CENTAUR.
Krampus batted as Humpty Dumpty, Humpty Dumpty batted as Medusa, Ares played as
a gentleman in a top hat. Nineteen of the sixty eight, on every screen, since
the pack was installed.

**The stills and the strips came out of the pack under one name and only the
stills are that character.** So a character is correct exactly where it stands
still (`idle`, `catch`, `throw`, `back`, `slump`, all off `source_reference`)
and is somebody else the moment it does anything. That is a man changing
species when he swings, which is the reason this file already gives for
building a character entirely from the pack, arriving from INSIDE the pack.

**Nothing could report it and nothing did.** Every frame is a valid frame, every
pose is present, every pose is its own drawing, and each one differs from idle,
which is every property the guards here ask for. Found by rendering all 55 and
looking.

**NO AUTOMATIC MATCHER IS AVAILABLE, and two were written before that was
believed.** The pack redrew every character for the strips: measured, a
character's strips and its own stills share **zero exact colours**, and
quantising both (3, 4 and 5 bits, three mass floors) never separates a known
good pairing from a known bad one at any setting. The first matcher weighted
colours by mass and confidently filed every dark figure under `black_cat`; the
second weighted by inverse frequency and filed Alice under `werewolf`. **Both
contradicted the eye on characters already confirmed**, which is the only reason
they were not believed. That is the fourth and fifth wrong extractor here.

**So `FILE_DRAWS` in `build_table.py` is an OBSERVATION, written the direction
it was observed**: the file on the left draws the character on the right. The
builder wants the inverse and computes it, because a hand written inverse is a
second copy of an answer.

**What corroborates it is the SHAPE, not any one row.** The nineteen sit in two
CONTIGUOUS runs of `manifest.json`'s own key order, 13-22 and 33-42, and each
run is a **closed permutation of itself**: every file in it draws another
character from the same run, exactly once. Nothing outside those two runs is
touched, and all 36 other files are their own character. A closed permutation
inside a contiguous block is what a packaging bug looks like. A string of
eyesight mistakes would not close.

`check_file_draws()` asserts exactly that on every build: a name the pack does
not have, two files claiming one character, and a chain that leaves its block
are each named. Proved by introducing all three.

**It costs nothing in coverage**, which is the sign it was purely a naming
fault: 807 poses from a drawn frame before and after, 647 on a still before and
after. The same frames, under the right characters.

**A SECOND FAULT WAS WRITTEN UP HERE AND DOES NOT EXIST.** Twelve characters
ship their strips fully opaque with the background baked in, and their outline
is the same near black as that background, so the reading was that
`border_background`'s flood walks along the outline and into the figure: 204
frames arrive opaque, 35 of them clean down to under 900 pixels, `usable_frame`
refuses those, and about 35 drawn frames were being thrown away. It is the
failure that function's own docstring predicts at `tol=12`, arriving at `tol=0`
because the two colours are identical, which is what made it convincing.

**Measured, the flood removes ZERO non-background pixels across all 204.** The
35 frames hold under 900 pixels of anything that is not the border colour
before the flood is run at all: they are blank cells, and refusing them is the
mass floor doing its job. There is nothing to recover. A prediction that fits
the shape of a bug is not a measurement of one, and this one sat in the file
for a pass as an open TODO worth thirty five frames.

#### The batter stood at the plate holding an axe

`pose === 'batting'` drew the `back` frame, which was right when the sprites
were generated: `back` was a REAR view and a batter is seen from behind the
catcher. The pack has no rear view, so `back` is the LEFT facing still. What
that produced, on the screen a player looks at longest: **the batter waiting on
the pitch faced away from the pitcher, holding whatever he idles with** (Paul
Bunyan his axe, Tom Sawyer a fishing rod, Popeye a pipe), and then a bat and a
right facing body appeared in the frame he swung in.

It is `ready` now, the pack's drawn batting stance: **37 characters had one the
game never showed**, and it faces the way every swing frame faces.

**`ready` WAS DOING TWO JOBS AND THE OTHER ONE BROKE THE SAME WAY.** It was the
fielder's set as well, so the four infielders spent every pitch holding a
batting stance in the dirt. The pack contains no fielding art, which is what
`catch` and `throw` already stand on a still for, so the crouch is gone rather
than wrong.

**AND THE PROP BAT BECAME A SECOND BAT.** The page draws a bat out of three
`fillRect`s over the sprite, written when every figure was parametric and held
nothing. The pack draws real bats in its swing and batting stance strips, so
**55 of the 68 were handed two**. `spr.b` is the builder's answer to which
poses already carry one, because the builder is what chose the frame and
nothing in a 64x64 bitmap says whether there is a bat in it.

**The guard counts `fillRect` calls rather than reading the source.** The prop
is a canvas primitive with no handle to ask about, and a source match would
pass the day somebody moves the same three rectangles. The sprite arrives by
`drawImage` and the shadow is an ellipse, so inside one `drawRunner` call a
`fillRect` IS the prop. Reintroduced, it reports 37 of 37.

#### And the pitcher threw it to third base, for as long as the pack has been in

Reported from a phone: the pitcher looks like he is throwing to a base rather
than to home. He was.

**This camera stands behind the catcher, so the man on the mound is seen from
the FRONT.** The pack's `windup`, `kick` and `release` are a **left facing
profile**: rendered all sixty eight and looked at, every one of the three turns
him side on and swings the arm across the screen. So every pitch in the game was
a man throwing sideways while the ball flew at the reader, and the two halves of
the picture disagreed about which way the ball was going.

**Nothing could report it, and this is the sharpest case of that on the page.**
Each frame is the right frame, drawn by the right artist for the right
character, present, distinct from its neighbours, its own drawing, correctly
seated and carrying no bleed. That is EVERY property the guards here ask of a
drawing. They ask whether a frame is good art. None of them asks whether it is
the right VIEW.

**`cheer` is the answer and it is front on with both arms raised**, which from
this angle is the top of a windup. **67 of the 68 have one that is their own
drawing** (nessie has no arms and stands on her still), so the windup animates
for almost everybody.

| | what the pack drew |
|---|---|
| `idle`, `catch`, `throw`, `ready` | front on |
| `cheer` | front on, arms up |
| `windup`, `kick`, `release` | **left profile** |
| `load`, `swing`, `follow`, `run1-4` | left profile |

**THE PACK DREW NO FRONT FACING THROW**, so the delivery is arms down, arms up,
arms down, and the BALL carries the rest: it rides his hands, over his head
while they are up and at his hip when they come down. Two frames is less than
three, and three of a man throwing to third is worth less than two of a man
throwing at you. Stated as a loss rather than faked, which is `slump`'s own rule
one section up.

**It is the same frame the strikeout celebration uses, deliberately.** The pack
drew one arms-up drawing and both moments ARE arms up. They are a whole beat
apart, one carries a ball and a live meter and the other a callout, so nothing
has to tell them apart by the picture alone.

**THE ALLOWLIST IS WRITTEN OUT BY HAND AND THAT IS NOT LAZINESS.** This file
already records two automatic matchers written for this pack and thrown away,
both of which confidently contradicted the eye, and nothing in a 64x64 bitmap
says which way a figure is turned. So the front facing set was established by
rendering the roster and looking, and the guard asks for membership of it.

**What it really defends against is the obvious edit.** The three poses are
literally NAMED `windup`, `kick` and `release`, so restoring "the pitching
animation" means reaching for exactly the three that are wrong. The guard reads
the PICTURE over a whole real pitch rather than at an instant, because the
pitcher's branch is a chain of `else if` and the way it breaks is one of them
winning at a moment nobody sampled. Reintroduced, it reports `windup, kick`.

**A STRIP FRAME IS ABOUT 15% SHORTER THAN A STILL, which is a pack-wide fact
nobody had written down.** Measured over all 68, the lit height of a strip frame
against the same character's `idle`: median **0.83 to 0.86**, worst **0.55**
(mrsclaus 64 rows to 44). So any figure crossing between a still and a strip
visibly changes size, and the pitcher always did, at the end of the old windup.
It is not introduced here and it is not fixed here: pose heights legitimately
differ, so there is no honest way to normalise them from the bitmap, and a
per-character scale factor would be a second copy of an answer. Worth knowing
before reading a size pop anywhere in this game as a bug in the page.

#### A bat reaching the side of its cell is not a clipped frame

The build refused any frame with a pixel in column 0 or 63, on the audit's own
clipping rule. That threw away **124 frames, and 101 of them were the swing and
pitch strips**, whose middle frame is CONTACT and RELEASE: the two most
important drawings in the game, rejected because a bat reaches the side of its
own 64px cell.

**What the rule was really catching is BLEED.** A strip is one image cut into
cells and several characters are drawn wider than their cell, so a wing, a foot
or a bat from the frame next door lands inside this one: a blob floating beside
the character with nothing holding it up. That is a DETACHED component touching
a side edge, and the character is always the largest one, so it is never what
goes. Measured, 36 of the 124 have nothing but bleed on the edge and every one
of the rest is a whole figure filling its canvas.

**The bleed comes off BEFORE the baseline is measured**, or the blob is what
gets seated on y=62 and the character floats above the dirt by however tall it
was.

**What is left to refuse is a figure the canvas really did cut**, and that is
`edge_run`: the longest unbroken run of drawing down a side column, measured
after the bleed. Across the pack it runs 0 to 30 and then one at 51, which is
fire_breather's idle at over three quarters of the frame height flat against
the wall. `EDGE_RUN_MAX` is 40, in the gap.

**IT BOUGHT ALMOST NO NEW POSES AND THAT IS NOT THE POINT.** Drawn frames went
634 to 642, because the walk was already substituting a neighbour. What moved
is WHICH frame each pose gets: **poses that had to substitute went 138 to 49**,
so 89 of them now show the drawing the animation actually intended.

##### And it only ever looked at the SIDES, while the bleed is mostly vertical

Reported by a player looking at the clubhouse: the four characters on the floor
had black fragments hanging off them. They did. **Nineteen of the sixty eight
carried a piece of a DIFFERENT figure** in a pose that screen can show: a pair
of somebody else's shoes floating over Alice's head, 278 pixels of another
character lying at Hermes' feet, a spare head along the bottom of Krampus and
the Headless Horseman.

**The premise one line up is false one step earlier.** "A strip is one image cut
into 64px cells" is true, and every strip really is a single row of them, so the
only neighbour `drop_edge_bleed` looked for was left or right. But the strips
were themselves cut out of a TALLER sheet, so a 64px cell catches the bottom of
the figure above it or the top of the one below. Opened by hand,
`hermes_pitch` frame 2 is Mrs Claus with her head clipped off at the top of the
cell and the next Mrs Claus's white hair intruding along the bottom.

**The measurement is what named it, and it is the shape of a check doing its job
on one axis.** Over the shipped table, of 558 detached blobs:

| touching | count |
|---|---|
| a SIDE edge | **0** |
| the top | 71 |
| the bottom | 284 |
| no edge at all | 203 |

Zero on the sides is the rule working perfectly. Everything else was never
asked about.

**Nothing could report it**, which is why it took a player: a stray blob is a
valid drawing, every pose was present, every pose was its own drawing and
differed from idle, and that is every property the guards here ask for. They ask
whether a frame is its own art. None asked whether it is ONLY its own art.

**A TOP OR BOTTOM BLOB NEEDS A CLEARANCE AND A SIDE ONE DOES NOT**, and that
asymmetry is the whole of the fix. Sideways, the neighbour is past the cell wall
and a character's own arm reaches the edge still attached to the character, so
touching the edge is the entire test. Vertically the figure STANDS on the bottom
edge, so a foot drawn clear of the leg is a detached blob on that edge and is
not bleed.

**`BLEED_GAP` is 3 and the band it sits in is empty**, which is `MASS_FLOOR`'s
rule rather than a guess. Of the 400 blobs on a top or bottom edge: 10 within a
pixel of the figure, **none at 2 or 3**, 10 at 4 to 6, and 380 at 7 or more. The
ten it keeps are the case it exists for, and the biggest is Paul Bunyan's boot
in `run1` and `run2`, 123 pixels of his own character drawn clear of his leg.

**It took nothing away**, which is the sign it is purely subtractive of bleed:
drawn frames 807 before and after, poses on a still 647 before and after. The
same art, with somebody else's removed. Edge strays went **355 to 4**, and the
four are the feet above.

**AND EIGHTEEN FIGURES CAME DOWN ONTO THE DIRT**, which is the paragraph above
about seating paying off a second time. `cleaned()` drops the bleed BEFORE it
measures the baseline, so a bottom edge intruder was the lowest thing in the
frame and was what got seated on y=62, leaving the character hovering above it.
Measured across all 1,360 frames: 1,342 baselines unchanged, **18 moved, every
one of them DOWN**, the biggest being zombie's batting stance by five rows. Not
one moved up, which is what says this was a correction rather than a shuffle.

##### And the pitcher hovered over his own mound, because a guard read the wrong edge

Found by looking at the plate camera: the pitcher stood on the infield dirt
with the mound, its rubber and a strip of grass drawn BELOW him, empty.
Measured, his `windup` frame left **17 empty rows** of its 64 row cell under
the figure, which at that camera is 35 logical pixels of air.

**A sprite is drawn with the bottom of its CELL on the dirt**, so an unseated
frame is a figure hovering over its own shadow. `cleaned()` seats every frame
on y=62 and the refusal above it was written:

```python
if shift > 0 and top - shift < 0:
    shift = top          # as far down as there is room for
```

**That reads as "there is not enough room above to move it down" and is about
the wrong edge.** Moving content DOWN drops rows off the BOTTOM, and the
target is y=62 with row 63 spare, so nothing lit is ever lost: a downward
shift cannot clip. What the clause actually did was refuse the whole shift for
any figure drawn against the top of its cell, **which is exactly the frame
that needs seating most**.

| | frames of 1,360 |
|---|---|
| sitting six rows or more above the ground | **291** |
| of those, refused by that one clause | **287** |
| after the fix | **0** |

The worst was 39 rows, more than half the cell.

**They are complete figures rather than clipped ones**, which was settled by
opening the pack's own strip rather than by reasoning: the middle two frames
of a run are drawn high in the cell with a neighbour's hat bleeding in
underneath, `drop_edge_bleed` takes the bleed off, and the figure is left
where the artist put it. Hat, face and both feet are all there.

**There was no animation bounce to lose**, which is the thing to check before
seating anything. If seating flattened a stride it would already have
flattened the other 1,070 frames the builder does seat, and the medians say it
seats them: the pack's convention is feet on the floor with the motion in the
limbs.

**It cost nothing.** 807 poses from a drawn frame and 647 on a still, before
and after, and the table is 1186KB either way. The same art, standing on the
ground.

**`check-posture.mjs` holds it**, beside the bleed rule and for the same
reason: what shipped was data rather than behaviour. The gap is 1 by
construction, so anything over that means a seat was refused. **Proved by
pointing it at the table that shipped one pass ago: 296 problems against 0 on
the rebuilt one**, and by lifting one frame ten rows, which it names exactly.

##### And the EDGE was the wrong half of the rule

The fix above shipped with "ten frames in the clubhouse still carry a small
mark" written under it as an accepted cost, on the argument that the 203 blobs
touching no edge are part art (Mother Nature's leaves, the ball off Alice's
bat) and part bleed, and no geometry tells the two apart. **The first half of
that is true and the conclusion was wrong**, because the rule has two tests in
it and the argument only weighed one.

**Requiring the blob to TOUCH the top or the bottom catches the neighbour that
reached all the way in and misses the one the sheet cut short.** A bar of
somebody's shoulder stopping two rows inside the cell, a hat, a shoe: **87 of
those survived**, and they are what the ten clubhouse marks were.

**The CLEARANCE is what tells art from bleed, and it always was.** A ball, a
falling leaf or a prop is drawn WITH the figure and overlaps its rows, so it
has no clearance to be dropped for. The edge was never doing that work. So the
clearance is the whole test now, above or below, edge or not, and the blobs
that OVERLAP the figure are still never touched.

**All 87 were rendered and looked at one at a time**, which is the only way
this question has ever been settled here. Not one is art: every one sits in the
debris field at the head or the foot of a cell, beside other obvious fragments.
57 of them are within two rows of a cell edge and the deepest eight were blown
up on their own before this changed.

**It took nothing away.** 807 poses from a drawn frame and 647 on a still,
before and after, and the table went 1188KB to 1186KB. The same art, with two
kilobytes of somebody else's removed.

**`check-posture.mjs` holds it now**, in the sprite section beside the row
width and the palette keys, because the thing that shipped was data rather than
behaviour. It walks every pose of every character, resolves a reference first,
and reports any detached blob clear of the figure by `BLEED_GAP`. **The gap is
written in both files on purpose**: the checker reads what the builder wrote,
so a rebuild at a different gap fails here instead of shipping. **And the edge
test came out of both in the same commit**, or the checker would have gone on
certifying the 87.

**Proved by pointing the widened guard at the table that shipped one pass
ago**: 58 poses named, against 0 on the rebuilt one.

**Proved by pointing it at the table that shipped**: 265 problems against 0 on
the rebuilt one. A guard that has only ever seen the fixed file is a guard
nobody knows the teeth of.

#### A frame has to hold most of its own character

`usable_frame`'s floor was a flat 200 pixels, written to catch a blank, and a
character here is 1,300 to 2,800. So it let through four frames where the
PERSON had walked out of the canvas and left his kit behind: **a bat and a hat
lying on the grass** (long_john_silver), a bat and one shoe (mother_nature),
popeye's bat with a sliver of leg, and a fire_breather cut off at the waist.
Every one passed, because a bat really is more than 200 pixels.

The floor is a share of that character's own still. Sorted, the four sit at
0.13, 0.15, 0.25 and 0.29 and the next frame up is 0.38, so `MASS_FLOOR` is
0.33, the middle of the gap rather than the last value that passes.

**IT CANNOT BE TIGHTER, and humpty_dumpty is why.** His whole strip set runs
0.38 to 0.42 of his still, because he is drawn as a big egg standing still and
a smaller figure moving. That is an artist's choice about one character, so a
floor at 0.45 would delete his entire animation set and report it as a cleanup.

It also RECOVERED one: fire_breather's `cheer` took celebrate#0, which is the
half figure, and now takes celebrate#1, which is whole.

#### A random draw asserted as an absolute flaked about once in sixty runs

`RANDOMIZE PUTS THE BEST ARM ON THE MOUND` is a rule and is deterministic. The
two assertions under it were not: they pressed the real button forty times and
demanded no starter under 55 PIT and none at or under 40. Measured over 200,000
draws, the best arm of nine lands under 55 on **0.04%** of them, which is
**1.6% over forty presses**, so that section went red on a build nobody had
touched. That is the commish magic seed and the chase gap arriving a third
time.

**The depth is a fact about the ROSTER, so it is asked of the pool in closed
form.** The chance that nine men drawn from the unlocked roster contain no arm
at all is hypergeometric and exact, so there is nothing left to flake.

#### The batter celebrated his own strikeout

`slump` is the beat after a called third strike, and it was sourced from the
pack's **celebrate** strip, so for **51 of the 68** the picture was the batter
throwing both arms in the air over being rung up. **Nothing could report it.**
The pose was present, it was its own drawing, and it differed from the walk
back, which is every property the guard on it asked for. Found by rendering
every character's slump onto one sheet and looking at it.

**The art is right and was pointed at the wrong man.** It is `cheer` now and
the PITCHER wears it over the same beat, which is what that screen should
always have been saying. Nothing was thrown away and nothing was drawn.

**`slump` IS THE WALK BACK AND ONLY THAT, which is a loss stated plainly.**
The generator made a slump by dropping a parametric figure's arms five pixels
and all sixty eight inherited it. Hand drawn art has nothing in a 64x64 bitmap
that says which pixels are an arm, so the offset has nothing to move, and the
pack drew no dejection. He turns away from the plate, which is the same left
facing still `back` is, so it is a reference and costs nothing. The day
somebody draws a real slump it plugs straight in. `NO_STRIP` in the builder
refuses to source it from a strip again, because the way this comes back is
somebody reaching for the nearest looking frame, and the nearest looking frame
means the opposite.

**The guard that replaced it asks the PICTURE.** The old one asked the table,
and the table was fine: the art was right, the beat was right, the pose went
to the wrong man. So it spies on `drawRunner` over one real frame of the plate
camera and reads back who was drawn with what. It draws rather than reading a
flag, because the pitcher's branch is one `else if` in a chain and the way it
breaks is a branch above it winning.

**FIVE POSES THE PACK CANNOT DRAW STAND ON ITS STILLS.** There is no rear view
in the pack and no fielding art anywhere. `back` and the two backruns are the
LEFT still, so the game reads a profile where it used to read a pair of
shoulders: a camera change rather than a hole, and what most baseball games
show. `catch` takes the FRONT still, which exists for 59 of the 68 and falls
back to left for the other nine, because it has to differ from the right
facing idle or it is a pose nobody can tell happened. `throw` stands on the
right still and really is the same drawing as idle for a character whose pitch
strip was never drawn. Nothing here is generated, which is the handoff's own
rule for fielding art.

**`left` IS EXACTLY `mirror(right)` FOR EVERY CHARACTER**, measured, so the
pack ships a flip rather than a second drawing. The game already mirrors at
draw time (`drawRunner`'s flip, and the lefty batter), so nothing needs a
second copy.

#### A repeated pose is a reference, and it was 37.7% of the table

**Never duplicate art.** A pose that comes out pixel identical to one already
built is stored as `'@thatpose'` and `v2Frame` resolves it before decoding.
Lossless: the same drawing either way, and the two poses share one decoded
rows array instead of building the same one twice.

It is not a rounding saving, because the repeats are structural rather than
accidental. `back` and the two backruns are one left facing still, `catch` and
`throw` are one right facing still, and everything the pack cannot draw stands
on a still as well. Measured over the built table, **37.7%** of it was one
string written again: **1,500KB to 960KB**, and the page **2.21MB to 1.62MB**.

`'@'` is safe as the mark because a row is palette LETTERS, digit run counts
and `.` for transparent, so it can never begin a real row. The resolution is
one step and the builder only ever points at a pose holding pixels, but the
walk is bounded anyway: a hand edited table that pointed two poses at each
other would otherwise lock the page up.

**IT SILENTLY DEFEATED THREE GUARDS, WHICH IS THE PART TO REMEMBER.** All
three compared the STORED STRING (`f.catch === f.idle`, `f.slump !== f.back`),
and against a reference that comparison answers the storage question rather
than the drawing question. `'@idle'` is not `f.idle`, so **the catch, slump
and distinct-pose checks would all have passed on exactly the defect they
exist for**, and the walk back check would have failed on a correct table
because `'@back'` has no rows to count. They ask `v2Frame(k, p).join('/')`
now. Same class as this repo's three wrong extractors, arriving at the data
this time rather than at the parser.

The new guard on it walks all sixteen poses of all sixty eight: every one
decodes to the declared size, every target exists, and **a target may not
itself be a reference**. Proved by pointing one pose at a name that does not
exist and another at a reference, and watching both come back named.

**TWO GUARDS WERE ASKING FOR ART NOBODY DREW**, and they were changed rather
than deleted. Both asserted sixteen DISTINCT drawings a character, which the
generator could promise because a pose there was an arm offset on a parametric
figure. Hand authored art has three views and partial animation, so a
character whose strips were never drawn cannot have sixteen distinct
drawings. What they assert now is the half that still means something: every
pose present, every one decoding to the declared size, catch differing from
idle (the pack CAN answer that one), and a FLOOR under how many action poses
are their own drawing, so a build that quietly went back to stills for
everybody still fails. Filling `docs/ART_ORDER.md` can only make that floor
greener.

**THE INSTALLER MATCHES BRACES AND WILL NOT SEARCH FOR `\n};`.** That works
exactly once. The generated table was pretty printed and ended on its own
line; the built one is minified onto one, so a second run searched past the
table and deleted every line between there and the next block that happened to
close that way. **The page still parsed**, `V2_SPRITES` was still an object,
and the symptom was `Sound is not defined` a thousand lines below the damage.
It refuses to write now unless six sentinel declarations survive the swap, and
running it twice is a no-op.

**AND MINIFYING IT SILENTLY EMPTIED `check-posture.mjs`.** Its sprite section
parsed the table LINE BY LINE, because the generator wrote one frame per line.
Built, it is JSON on one line, so every pattern in there stopped matching and
the key set came back empty: the section reported one problem, that all 68
roster characters have no sprite, while the three checks it actually exists for
(row width, palette keys, missing poses) ran over nothing at all. **A check
reporting the whole roster is not reporting a problem, it is reporting that it
cannot read the file**, and this is the fourth time an extractor here has been
wrong in silence. It `JSON.parse`s the table now, resolves `'@pose'` before
measuring a drawing (a reference has no rows of its own), and asks for all
twenty poses rather than the fifteen that existed when it was written. Proved by
mutation: a dangling reference, a two row short frame and a dropped `cheer` are
each named.

**SIZE IS HEIGHT, NEVER FRAME WIDTH.** `drawCharacter` asked for
`HERO_W * scale`, which on 32x50 art gave a person 1.56 times that tall. The
pack's frames are SQUARE, so the identical line drew everyone twice as wide
and the batter covered the strike zone he is meant to be swinging at.
`HERO_DRAW_H` pins the on screen height and the width follows from whatever
shape the frame is, so the next change of frame shape costs nothing.

Every character is drawn from a PUBLIC DOMAIN source and `mythiball/PD_SOURCES.md`
is the register: source, what the sprite shows, what it avoids. The avoid column
is the point. Disney's Peter Pan, Universal's Frankenstein, MGM's green witch and
ruby slippers are all still owned, and a redraw that drifts back toward one of
them is the failure mode.

### The window is the frame, and the strike zone was 34 pixels across

Reported as the game sitting in a box rather than being played, and as the
strike box being too small to aim at on a phone. Both are the same fault.

**It was a 920px column of cream paper with a picture of a ballgame in it.**
On a 1440x900 desktop the field drew 924x635 with 250 pixels of paper down
each side and the page scrolled anyway; on a 390 phone it was 358x246 in an
844 tall window, under a quarter of the screen. `body.ingame` takes the whole
window now: no page scroll, no card around the field, and the arena is the
one child that grows.

**THE ZONE IS WHY THIS IS A GAMEPLAY FIX AND NOT A LOOK.** `plateGeom` sizes
the zone against the batter, which is right, so it is a fixed 92x120 of the
960x660 world and its size ON SCREEN is whatever the field is drawn at. At
358 wide that is **34x45 CSS pixels against a thumb of about 45**: aiming was
not a skill, it was a guess. Measured after, across six viewports:

| | before | after |
|---|---|---|
| 390x844 | 34x45 | **78x102** |
| 390x664 | | 52x68 |
| 320x568 | | 44x58 |
| 844x390 sideways | | 53x70 |
| 1440x900 | 88x115 | **138x180** |

**THE TWO CAMERAS GET DIFFERENT ANSWERS AND THAT IS THE WHOLE RULE.**
`fitFieldCanvas` lets the PLATE view COVER, because everything it is about
(the zone, the bat, the ball, the catcher) is within a third of a frame of
the plate, so what the crop throws away is stand. The wide view may NOT: a
ball in the right field corner is the entire point of it, and a camera that
cropped the corners during a play would hide the play. So the wide view
contains, and what is left is the letterbox `drawField` already paints. (A
whole scale cannot contain exactly, and what that costs is measured below.)

**IT NEEDS NO COORDINATE MATHS, AND THAT IS THE REASON IT IS CSS.**
`fieldPointFromEvent` maps a pointer through the canvas's own
`getBoundingClientRect`, so a canvas moved and resized in CSS is read
correctly with nothing to keep in step. Written as a transform inside the
paint instead, the drawing and the input would be two copies of one answer
and the aim would drift from the picture the first time either moved.
Asserted rather than argued: four known points in zone units, driven through
real screen coordinates on desktop and on a phone, come back within **0.014
zone units**.

#### And the CSS crop broke the grid, which is the one thing that pass exists for

The first full bleed version was an oversized canvas cropped by the arena's
`overflow`, for the reason directly above: it needs no coordinate maths at all.
What it cost is that the BITMAP stayed capped while the canvas grew. On a 390
phone at device ratio 3 the browser was handed 1280 pixels to show across 2397,
so it upscaled by **1.873**. Every canvas here is `image-rendering: pixelated`,
so that is not blurry, it is **ragged**: at a fractional nearest neighbour scale
some blocks take two device pixels and some take one. That is exactly what the
one resolution pass exists to prevent, arriving at the last step instead of the
first.

**The old guard could not see it**, because it reads the bitmap, where the blit
was still a clean 4x, and never asked what the browser did with that bitmap
afterwards.

**So the canvas is exactly the arena now and the crop moved into the blit.**
`FIELD_CAM` is the one answer the paint, the crisp HUD pass and
`fieldPointFromEvent` all read. The bitmap is the arena's own device pixels, the
world is drawn at a whole `scale` of them, and what does not fit is a SOURCE
rectangle handed to `drawImage` rather than an overhang. The browser scales
nothing. Measured after: `scale` a whole 3 to 12 across six screens, bitmap to
arena exactly **1.000** on every one.

**What it costs in FILL was written up here as small and it is not.** The claim
was "0.4 to 0.9 megapixels against the 1.13 of the fixed 1280x880 it replaced",
which is what an arena sized canvas costs in CSS pixels. The arena is sized in
DEVICE pixels, so a 390 phone at ratio 3 is **1.65 megapixels a frame** and a
1920x1080 retina desktop is 3.6. Nobody had multiplied by the ratio. See the
next section: the framing stays, and the drawing comes back down.

#### So the page draws at a WHOLE FRACTION of the screen, and the browser finishes

The camera above is right about the grid and it is 1.65 megapixels a frame on a
390 phone at ratio 3, where the fixed bitmap it replaced spent 1.13. Measured
at 4x throttle, changing nothing but the ratio, **the fill is the frame**: 1.65
MP ran 36.3 and 36.6 ms with about two thirds of frames over 33ms, and 0.18 MP
ran 19.7 and 20.0 with 1.5%.

**That contradicts this file's own note that `setCPUThrottlingRate` leaves
rasterizing alone, and the note is what is wrong.** Headless Chromium has no
GPU here, so the compositor is on the CPU and the throttle slows it with
everything else. A real phone composites on its GPU, so these numbers are a
**ceiling** on what a player feels rather than a reading of it. What is not in
doubt is that the pixels are spent.

**The browser is allowed the last step as long as it is a WHOLE one.** A whole
number upscale of a whole number grid is still a whole number grid: a block ends
up `scale` device pixels across either way, and what changes is how much of that
magnification the page pays for. `fieldDraw` picks the **smallest divisor of
`scale` that is still at CSS resolution or better**. On a ratio 3 phone at scale
8 that is 4, so the page draws a quarter of the pixels.

**THE FRAMING IS NOT ALLOWED TO MOVE**, which is what makes this a drawing
change rather than a camera one. Deciding the whole camera in CSS pixels was
tried first and it CROPS: `ceil` overshoots by a fifth at 2.50 where it
overshoots by a fifteenth at 7.49, so the phone lost 16 blocks of world. The
scale, the crop and the offset are all still worked out in device pixels.

**What it bought, interleaved, two runs an arm**, alternating because this
file's own history records an A B A pass reading 9.5ms of nothing but a page
warming up:

| bitmap | mean | over 33ms | over 50ms |
|---|---|---|---|
| 0.48 MP | 34.0, 34.7 | 39%, 45% | 3.4%, 3.9% |
| 1.65 MP | 37.6, 37.2 | 62%, 60% | 7.9%, 8.1% |

The arms do not overlap on any of the three, which is what the single runs
before them could not say. A visible hitch halves.

**IT IS STILL OUT OF BAND, AND THAT IS THE FULL BLEED LAYOUT RATHER THAN THIS.**
The field was a 358x246 box and it is the window now, so drawn at CSS resolution
it is about two and a half times the pixels the boxed version spent. That is the
thing that was asked for. Taking `draw` below the floor would buy the rest and
would be drawing the type and the sprites softer than the screen can show, which
is the one thing the resolution pass exists to refuse.

**A prime scale gets nothing**, and that is worth knowing before reading a flat
result as a broken function. The step has to be whole, so `draw` has to DIVIDE
`scale`: at scale 7 the divisors are 1 and 7 and the floor rules out 1, so the
wide camera on a ratio 3 phone draws at full device resolution like everything
else. The plate camera is where the game sits and it lands on 8.

**Two things read the draw resolution and two deliberately do not.** The bitmap
and the crisp HUD pass are in bitmap pixels, so both are `draw`. The element's
CSS size and `FIELD_VIEW` are about the SCREEN, so both are `scale`: sized off
the bitmap the picture would shrink to a fraction of the arena instead of being
upscaled onto it, and read off the draw the ball's minimum size would grow on
exactly the phones that floor exists for.

**The wide camera is contain ROUNDED UP, which is a crop.** The scale has to be
whole, and rounding down spends the whole rounding loss on bars: a desktop at
2.54 drops to 2 and draws a 640 wide field in a 1280 arena, half the window
dark. Rounding up spends it on the binding axis. Measured over six screens it
crops nothing on three and 8.8%, 13% and 25% of ONE axis on the other three,
**and the 25% case was looked at rather than reasoned about**: the foul lines,
both corners and the whole wall are still in frame, because the world carries
margin around the park.

**Two guards were reading the old camera and both had to change.** This is the
repo's oldest lesson arriving at the checkers rather than the page:

- `one grid` derived the scale as `cv.width / (FIELD_W / PIX)`. That was true
  while the canvas held the whole world, and the canvas holds a CROP now, so
  bitmap over world is the crop's share and has no reason to be whole. **Asked
  the old way it passed on the canvas the browser was upscaling by 1.87.** It
  reads `FIELD_CAM`, and the second claim is the one the old shape could not
  make at all: the browser's last step is a whole number and the bitmap times
  that step is exactly the pixels the arena occupies.
- The upright zone measurement used `r.width / FIELD_W` and `r.height /
  FIELD_H`, which under a crop are two different scales, so it answered a zone
  **37 by 68** for a box that is 92 by 120. Not even the right shape. It inverts
  `FIELD_CAM` the way `fieldPointFromEvent` does.

**And one guard was pinning a number rather than a claim.** `the ball is four
CSS pixels on a phone` asserted `FIELD_VIEW < 0.5`, and the fix made the field
BIGGER: a logical pixel went from just under half a CSS pixel to exactly half.
`ballCss` on its own cannot fail, because the floor is four over the view and
the check multiplies it back, so what it asks now is that the floor really is
above the five logical pixels it replaced.

**The plate camera's focus is not the middle of the picture.** The zone sits
at world x 442 to 534 and the batter is drawn to the RIGHT of it, about 553
to 750, so a crop centred on the canvas cut his bat off at the frame's edge.
596 holds both.

**Four layout faults, and every one of them was silent:**

- **`flex:1 1 auto` gave the arena nothing.** Its basis is its own content
  and the canvas inside it is absolutely positioned, so the content is
  nothing: the deck below claimed more than the window had, free space came
  out NEGATIVE, and the arena measured **zero pixels tall**. The field fell
  back to drawing at its bitmap size and the fit was skipped every frame.
- **`#app` is a plain block**, so a flex child two levels down inherits
  nothing from the wrap and is content sized. The screen measured 515 of a
  900 tall window. The chain has to be unbroken.
- **A cover only zooms once the box is taller than its width over 1.4545**,
  which on a 390 phone is 268 pixels. At an arena of 265 the field is width
  limited, the scale is 1, and the zone comes out 37 on a 664 tall phone
  against 74 on an 844. The arena's floor is what makes the cover engage.
- **Sideways, the arena spanned thirty grid rows.** That worked while its
  height came from the field's own aspect; given a height of its own, those
  thirty tracks absorbed it and squeezed every item in the right hand column
  into a row about eleven pixels tall. The line score came out 8 pixels high
  with its table painted over the swing buttons. It is absolutely positioned
  on the left now and the deck flows in the padding it leaves.

##### THE DECK IS TOO TALL FOR A SHORT PHONE, and this is the open one

Measured through the real page while pitching, which is the tallest the deck
gets:

| | window | arena | the deck wants | what happens |
|---|---|---|---|---|
| 390x844 | 844 | 473 | 367 | the at bat card is cut to 47 of 97 |
| 360x780 | 780 | 437 | 367 | cut to **19** |
| 360x640 | 640 | 358 | 359 | cut to 16, **and 58px is off the window** |
| 320x568 | 568 | 318 | 372 | cut to 16, **and 103px is off** |

**`.atbat` is the only child in the deck with any shrink in it**, so the whole
of a short window's shortfall lands there, and what a player sees is one line
cut mid sentence: `The Great Ape cannot handle the`. Past that, the arena's
floor wins outright and the page runs longer than a window that
`overflow:hidden` then cuts, so the End Game row is off the bottom with no way
to scroll to it.

**Making the card rigid is not the fix and was tried**: the shortfall moves
straight to the window, so 390x844 went from a clipped card to a page 54 pixels
too long. **Capping the arena's floor is not the fix either**: reserving enough
for the deck takes the arena under the cover threshold on a 360 phone, and the
zone falls from 46 to about 30, which is the thing that floor was raised for.

**What is actually wrong is that the deck needs about 360 pixels**, and on a 640
tall phone there are 582 to share with the field. The answer is a smaller deck,
which is a design pass rather than a flex rule: the at bat card on one line, and
End Game somewhere other than a permanent 39 pixel row under the play by play.
Nothing here should be changed by moving a `flex` value.

**The SWING button is the pitcher's now, and only his.** Batting, a tap on
the field has always done both jobs: `touchstart` puts the bat where the
finger is and the click that follows swings it, so **the tap IS the aim and
the timing**. The button underneath could only ever swing at wherever the bat
already was, which on a phone is wherever you last touched, so it was the one
control that could not aim: pressing it was a worse swing than tapping,
offered in bigger type. It is also 70 pixels of deck, and on a phone the deck
is what the zone is paying for. Pitching keeps it, because at the moment the
ball goes there is nothing left to aim: the spot was already chosen.

**Both how-to surfaces were edited in the same commit**, which is this repo's
own rule about the coach notes teaching a removed control.

**And it kept the batter's word, so a phone showed TWO THROW BUTTONS.** Relabelled
from SWING to THROW it read as a second copy of the pitch panel's own Throw a few
hundred pixels above it, in bigger type and a louder colour, and **it was dead for
most of the time it was on screen**: the only thing it does is call `releaseNow`,
which exists for the 1150ms the release meter sweeps. Before that, the biggest
reddest control on the phone did nothing at all. Found by taking a screenshot of a
real at bat and looking at it, which is how three things on this page have been
found now.

It says **RELEASE** and it is on screen for exactly as long as there is a release
to make. **The paint loop owns that and `refreshHud` cannot**, which is the point
worth keeping: `refreshHud` fires on a ball, a strike or an out, and a meter starts
and ends between two of those. `refreshReleaseButton` sits beside
`refreshStealButton` in the frame loop and writes only when the answer changes.

**The copy was left alone deliberately.** The long page already says "click, tap or
Space" and the short notes say "stop the bar in the green", both of which are true
on every device. The button is confined to 900px and under by its own CSS, so
naming it would be a note that is wrong on a desktop.

**The guard changed from a button to the zone, and that is a change rather
than a loosening.** The sideways section used to find the SWING button and
assert it was above the fold. There is no button while batting, so it now
measures the zone: where it lands, and how big it is, in both orientations,
with a floor of 40. **The size floor is the point of it**: the defect that
section was written for drew a 182 pixel field sideways, which puts the zone
at about 17 across, and being on the screen is not the same question as being
reachable. It caught a real shortfall on its first run (37 across at 390x664)
and a second on its second: it was measuring during the WIDE camera, before a
pitch was live, where the zone is correctly small because there is nothing to
hit. It waits for `plateViewActive` now.

**The gap before a pitch is thinking time and it was too short.** Reported as
wanting longer to think. What a batter gets is `betweenPitches` plus
`windup`, because the meter is up but frozen through the windup, so the two
are one pause: **2.1 seconds, now 3.2**. That sum is the whole claim; what a
game's median pitch to pitch comes out at is longer again and is not
re-measured, because `scratchpad/pacing.mjs` needs several games an arm to
say anything. Only that one beat moved: the beats after something HAPPENS are
ceremony, and nobody is deciding anything while the ball is in the outfield.

**And a fixed wait in the suite broke on it.** The late break section slept
2600ms for a pitch, which was the flight plus its windup with about 200 to
spare, and 100 more of windup took the spare away: the umpire had not called
it, the count had not moved, and the section reported the mechanic as gone.
It waits on the pitch being resolved now. A fixed wait past a beat somebody
is allowed to tune is a test that fails on the next tuning pass.

### A phone gets a MENU, a desktop gets the room

The home screen is the clubhouse. It is called the clubhouse everywhere the
player can see and in the code; the seven places a character says "dugout" mean
the one beside the field during a game and are left alone.

**These are two designs, not two sizes of one, and that is the whole lesson of
this screen.** `landscapeRoom()` draws a room: four objects hung on a wall, a
small sign over each, and a rail underneath that names whatever the pointer is
on. `renderPhoneMenu()` draws a strip of floor with the team standing on it.
`renderMenu` picks by `ROOMFILL`. **The HERO is what differs now, and nothing
under it does**: both then get the franchise panel, the four mode tiles and the
wire, from the same three functions.

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

#### The room was the whole menu, and a room is not a menu

**The desktop used to be the room and nothing else.** Four objects on a wall,
and the way to find out what any of them did was to point at one and read a
rail. That works exactly as well as the phone version did before it was rebuilt,
which is to say it is a picture with four labels on it, and the argument two
paragraphs up applies to both. **The room is the HERO now and the tiles are the
menu under it**, on every width. `check-premium.mjs`'s own rule about a door
that is drawn versus a door that opens is the same idea: a reader has to be able
to find the mode.

**The franchise is the button, and what it says is read off the save.** It was
the second of four identical rows, no louder than How To Play, and it is the
thing a returning player came back for. `franchisePanel()` reuses the `season`
thing's own `go`, so there is exactly one place that knows what starting or
resuming a franchise means, and the line above it (`Year 3`, `2-1`, `Game 4 of
7`) is read off `State.season` rather than written. **The status used to be
printed twice**, once there and once in a sentence further down the card, and
the second copy is gone rather than kept in step.

**Nothing in the copy carries a number that is not counted.** The roster line is
`ROSTER.length`, the wire's unlock count is counted off `isUnlocked`, and no
line anywhere invents a batting average. This repo's oldest rule about numbers
in sentences, on a screen that had no interpolation in it at all.

**The cast is four of them, drawn at random, and each on its own clock.** The
room stood the FIRST TWO draftable characters on the floor, so every visit was
the same two people and the clubhouse read as a set. `clubhouseCast()` shuffles
once per visit and keeps the answer as module state, because **the room repaints
on every hover**: picked inside the painter, the people would reshuffle each
time the pointer crossed the bat rack. Each one gets its own period and offset,
so nothing ever lines up into a machine.

**A pose that decodes to the same drawing is not a frame.** Thirteen of the
sixty eight characters have no animation strips, so `ready` and `cheer` ARE
`idle` for them. `castPoses()` asks `v2Frame` for the decoded drawing, which is
the same lesson the sprite guards learnt when aliasing arrived: a loop swapping
one frame for an identical one is not animation and nothing would report it.

**They are their own canvas, over the room's.** The room is a detailed drawing
that changes only when the pointer moves; the people change several times a
second. In one canvas every breath would repaint the whole clubhouse.

**THE FIRST TICK IS DEFERRED, and that is not tidiness.** `renderMenu` builds
the whole tree before handing it to the page, so a canvas asked to paint during
the build is not in the document yet: `runCast`'s `isConnected` guard fired on
frame one, stopped the loop, and **the clubhouse came up with nobody in it**.
Nothing threw. `requestAnimationFrame` for the first tick as well as the rest.

**The loop stops the moment the menu is left**, the way the live game and the
bracket already do, and `REDUCED` (one `matchMedia` beside `ROOMFILL`) holds
everybody on one frame.

**A phone tile stands up rather than lying down, and that is what buys the type
its size.** Beside a 46px icon, a half width tile has about 110px of text
column, which forces the name to 11px. That is the six-pixel signs arriving
again, so the tiles go to a column and the name holds 16px. **Keyed on
`body.roomfill`, never on a width**, which is the rule two bullets up: a
768x1024 tablet is past no width breakpoint and IS the phone menu, so a width
query gave it the desktop row and a 13px name on a touch screen.

**An existing rule won on order and nothing said so.** The first grid was
`.modes`, which this page already carries as
`repeat(auto-fit,minmax(200px,1fr))` about two hundred lines earlier, so a
two-column grid rendered three across. Everything the redesign added is
prefixed `hmode`.

**The Meet the players tile is the one whose picture IS what it opens**, two of
the cast on a pair of card edges. The overlap was .70 of the card, which puts
the front card's edge at .30 and the back character's centre at .35: a sliver of
shoulder and a lot of white. **It looked fine in the first screenshot because
the character drawn there happened to be left biased**, which is luck rather
than a layout. It is .60 now, edge at .40 against a centre at .30.

**The desktop guards changed on purpose and both say the same thing.** Two
assertions read "a desktop gets the room and no doors", which was true while the
room WAS the menu. They ask for `room && doors === 4` now. A guard that still
demanded zero would be holding the page to a design it no longer has.

The regression suite, which is the thing to run after editing:

```
node mythiball/check-posture.mjs   unlisted, and the capital alias still lands
node mythiball/verify-rules.mjs    the rules replayed in a headless browser
node mythiball/calibrate.mjs       the pitch duel's rates against TARGETS bands (minutes; --quick for a loop, --easy/--hard for a tier)
node mythiball/check-frames.mjs 70 normal --phone --cpu=4   frame times, on the machine that matters
node mythiball/check-runs.mjs      runs per game, with a defence that turns up (--jobs=N to run several at once)
node mythiball/check-bat.mjs       the swing's own curves, and that skill pays
node mythiball/check-firstpitch.mjs  whether a stranger can READ one pitch
node scripts/check-dashes.mjs      mythiball is on the GUARDED list
```

`calibrate.mjs` is the hoops TARGETS idea at the plate: real pitches from an
unsteered arm against the real CPU swing AI, with swing, whiff, chase, foul
and called-strike rates held to bands. The opponent is pinned because a
random club moved whiff per swing by twenty points between identical runs.
Small samples (hit mix, contact quality) are printed as information rather
than banded, so no target flaps on noise. The meter has already paid for
itself once: it measured the CPU at 55 whiffs per hundred swings, the swing
jitter tiers came down about a fifth, and it measures in the mid forties
now (MLB runs about 25). The file's header records the procedure, and any
further move repeats it: measure, touch the jitter, measure again.

### EVERY OTHER CHECKER HERE ASKS WHETHER SOMETHING IS CORRECT

```
node mythiball/check-firstpitch.mjs
```

Reported as the game seeming very off inside one or two pitches, after weeks
of green suites. It was, and nothing in this file could see it, because the
question every guard here asks is whether a thing is DRAWN RIGHT and the
question nobody had asked is whether it can be SEEN.

**The audit loop is what produced that.** Pick a file, find a real silent
defect, fix it, prove it, write it up. That loop never terminates on a
codebase this size, because there is always another silent defect, and it
never arrives at PLAYABLE because playable was never the target. This file
reached four thousand lines of correct findings while the strike zone was a
hairline nobody could find.

**So this checker measures THE GLASS, never the source.** A zone drawn at
`lineWidth = 2` is a claim about logical field pixels; what a thumb aims at
is CSS pixels after the camera, the crop and the browser's own last step.
The numbers are read back off the canvas and out of `FIELD_CAM`. Every
assertion is a PROPERTY that survives a redesign: a contrast ratio, a size
floor, a state that has to end. Pinning pixels would make it a test of the
three phones somebody thought of, which is the mistake this file exists to
stop repeating.

#### The ball was still sitting there when the next pitch was due

`pitch.closed` was only ever set where the AT BAT ends: a ball in play, a
walk, an out. Every other outcome is most of them, so after a called ball, a
called strike, a foul, a foul bunt and a whiff the arrived ball went on
being drawn in the catcher's mitt for the whole gap.

Measured on a 390 phone: the flight is **42 to 46 frames over about 700ms**,
and the ball then sat motionless on the plate for **152 to 157 frames, which
is 2.5 seconds**. The reader spent three and a half times longer looking at
where the pitch stopped than at the pitch. Through the checker with the
defect reintroduced: **662 frames of a ball in the mitt over 22 seconds, and
it never cleared once.**

**Nothing failed and nothing could.** A ball drawn in the mitt is a valid
drawing, the flight was correct, the call was correct.

`clearPitchSoon` is the one place, called from all four sites. It carries
the identity check this file already runs at three other doors: **a timer
fires into its OWN pitch or not at all**, because the next pitch, a new at
bat or a new game can all have replaced it while the hold was out.

**A FOULED BALL IS NOT IN THE MITT**, so the foul and the foul bunt clear at
zero rather than after a beat. Held, the picture is a ball sitting on the
plate while the log says it was fouled off.

**The camera is not affected, which is the thing to check before moving
this.** `plateViewActive` asks `pitch && !closed` OR `plateHold`, and every
one of those sites sets `plateHold` to its own beat plus 300ms, so the plate
view is held by the second clause throughout. Closing the pitch early cuts
nothing away.

#### And a hairline is not a target

The strike zone was a **2px LOGICAL** line, which is **1.78 CSS pixels** on a
390 phone, measuring **2.23:1** against the grass behind it, with a 6% fill
at **1.33:1**. Three to one is the floor for a large graphical object
somebody has to locate; under about 1.5 it is a shape you have to already
know is there. It is **3.73:1** now.

**THE WIDTH IS COUNTED IN BLOCKS, AND THE FIRST FIX COUNTED CSS PIXELS.**
Written `3 / FIELD_VIEW` it asks for three CSS pixels, which is right on a
phone and is **1.8 logical pixels on a desktop**. The world is drawn into
`pixWorld` at `PIX` logical pixels to the block, so that is six tenths of a
block: the line cannot be solid, it antialiases to partial coverage, and it
washes out. Both phones cleared 3 and the desktop came back at **2.48**.

**A line narrower than a block is a line this world cannot draw**, which is
the one-resolution rule the blit already runs on arriving at a stroke. So
`zoneLineMin()` is a whole number of blocks, at least one, and enough of
them to cover three CSS pixels on whatever screen this is. The halo is a
block each side for the same reason.

**It is read across three screens on purpose**: the fault was a length
written in the wrong unit, which is exactly the class of bug that looks fine
on the machine it was written on.

#### And it was not even, because a stroke is centred on its path

Reported from a desktop screenshot: the left edge of the box was visibly
thicker than the right. It was. The zone runs **147.33 to 178 blocks** across,
so `strokeRect` put half a line on each side of a boundary at one end and on
a whole block at the other, and the same `lineWidth` drew two different
widths on two sides of one rectangle.

**No width fixes a stroke**, because half of it always falls either side of
the path. It is **four filled bands on the block grid** now, which are the
same number of blocks by construction whatever the camera is doing, and the
rectangle itself is snapped to the grid. `plateGeom` is untouched: the snap
moves the drawn box by at most half a block and the aim maps where it always
did.

#### THE CHARACTERS WERE SUPER BLURRY AND THE FIELD WAS NOT

The oldest kind of finding in this file, reported by a player, invisible to
every guard, and one rounding.

A character is drawn into `pixWorld` through a `1/PIX` transform, so **three
logical units are one pixel of the blit**, and the destination was rounded to
a whole LOGICAL unit. Two positions in every three therefore put the bitmap
between two pixels, **and a bitmap between two pixels is resampled across its
WHOLE SURFACE rather than at its edges.** The chalk is a path and antialiases
only where it ends; a person is a photograph of a person.

Measured through one character at three of the sizes this game draws, the
share of his own pixels that are one of his own palette colours:

| | logical destination | on the grid |
|---|---|---|
| a fielder, 36.67 blocks | 37.3% | **100%** |
| the pitcher, 55.67 blocks | 45.8% | **100%** |
| the batter, 78 blocks | 55.1% | **100%** |

**NOT ONE OF THE TWENTY SIZES THIS GAME DRAWS IS ON THE GRID** in the other
direction either: blocks per pixel of the 64px art runs 0.234 to 1.219 and
never lands on a whole ratio. That is not what was wrong and it is worth
knowing before reading the numbers above as a claim about the art. What the
snap buys is that the ART'S OWN upscale, which is `fillRect` and has hard
edges by construction, is the only resampling left in the path.

A character is also **built at the pixels the blit covers** rather than in
logical units and reduced three to one on the way in. Measured, that alone
changes nothing (100% either way once the destination lands), so it is kept
for a different reason: a cached sprite is a ninth of the canvas it was.

**The idle bob is one pixel of the BLIT, not one logical unit.** A third of a
block would put the figure between two pixels on alternate beats, so every
standing character would go soft and sharp about twice a second.

**And `drawK` asks the context rather than assuming `PIX`.** The same function
draws the clubhouse and the photo scene through transforms of their own, and
`drawRunner`'s mirror makes the scale negative.

**THE GUARD ASKS THE DESTINATION, NOT THE PIXELS.** A colour count cannot say
whose pixel it is: a figure overlaps the grass, the dirt and the man behind
him, and three ad hoc attempts at it in one afternoon each reported the
opposite of what the eye and the controlled probe both said. The property is
exact and it is the one that broke. Proved by reintroducing the rounding,
which reports **20 of 20 figures off the grid**.

**A half pixel of CSS is a separate hazard and it was NOT this.** The canvas's
own offset came out at 1.5px on a 1512x850 desktop, because centring divides
by two. It is snapped to a whole device pixel now, which is right on its own
terms, and the edge profile is byte identical either way: Chromium happened to
round it. Three of nine screens still land the canvas on a fraction, all of
them from the arena's own layout, and all three are a hundredth of a pixel or
a quarter of one.

### The game is the window, and the deck floats on it

Reported as still looking like a wide box on the screen. It was. Measured
while pitching, which is the tallest the deck ever gets:

| | the field got | now |
|---|---|---|
| 1512x850 desktop | 69% of the window | **95%** |
| 390x844 phone | 65% | **83%** |
| 320x568 phone | 55% | **74%** |

**The arena is `inset:0` and the controls are an overlay.** This file's own
note about the deck said what it needed was to be SMALLER and called that a
design pass rather than a flex rule. The answer is not smaller, it is out of
the flow: a control that sits over the picture costs the picture the
control's own height and nothing else. It also ends the feedback the old
`flex` basis note is about, because nothing the deck does can reach the
camera any more.

**THE AT BAT CARD IS GONE.** It is the same three facts as the placards on
the field and the board above them, laid out as a card with a portrait of the
man who is already the biggest thing on screen holding a bat. Sideways lost
it a year ago on exactly that argument and nothing was missed; the argument
was never about the width.

**THE SCOREBOARD WAS OVER THE PITCHER.** Centred on the window, and the
pitcher stands at world x 480 of 960, so the board sat across the face of the
man about to throw in both cameras. It is right aligned under the away side's
own placard now, and under 600px that placard is hidden so the board goes
back to the top.

#### The camera has to know what the deck is standing on

**The middle of the picture is not the middle of what a player can see.**
Framed on the canvas, the zone's bottom edge came out under the swing row:
the one thing somebody has to find, half behind the one thing they press.

`deckCoverBlocks` is that measurement, and it is **the OVERLAP and never the
deck's own height**. A window too tall for this picture keeps the deck under
the field, where it is just as tall and covers nothing; asked for a height,
the camera would frame the plate a third of the way up a screen with nothing
over it. It is written out as `--deck` as well, because the two bottom
placards are CSS and cannot ask: one measurement, two readers.

**AND THE OVERLAY IS NOT FOR EVERY WINDOW.** The world is 320 by 220 blocks
and the plate camera covers the arena, so what it can show across is about the
arena's aspect times 220. The plate and the batter need about 120 of them.
A 390 by 810 arena comes out at **97**, and the strike zone's own left edge was
outside the frame. There is no framing that fixes that: the picture is the
wrong shape for the hole. So the overlay is gated at `min-aspect-ratio: 3/4`
and a tall window keeps the deck under the field, winning back what this pass
actually removed rather than what it could not.

**The zone is clamped into the crop on top of all that**, because a phone
still crops hard and the batter is the thing that may be lost. `PLATE_KEEP_X`
and `PLATE_KEEP_Y` pull the crop toward the zone from either side, after the
focus and before the world's own edge, which is last because it is the only
one of the three that cannot be argued with.

**EVERY PIXEL THE DECK IS TALL IS A PIXEL THE CAMERA OWES**, and the world
runs out. At 1280x800 the plate crop is 190 of the world's 220 blocks, so
there are 30 blocks of headroom and the deck may cost at most 22 of them. The
pitch name over the swing row came to 27 and the zone went back under the
buttons, at 24 pixels and then at 8. Beside each other they cost 17, and End
Game moved out of the flow into a corner chip because its own row was 33
pixels of that budget spent on the control nobody is looking for.

**A `:not()` chain beats almost everything you write after it.** The rule that
gives the deck its gutters carries three of them, so written with
`position:relative` in it, it beat every later rule that wanted a deck item
out of the flow: the End Game chip asked for a corner and drew in the flow at
the bottom left, under the deck it was meant to sit on. It sets margins and
nothing else now, and what needs a position is what needs a z-index.

**The callout was on the pitcher too**, at 38% of the arena, which is the
mound in both cameras: every call in the game was announced across his face.
Half way down is the band of outfield grass with nothing in it, and it is
still above the zone.

#### There are two batter's boxes and the camera only ever framed one

Reported as nothing, because a screenshot of it looks fine about a quarter of the
time. `drawPlateView` mirrors the hitter about the scene's own `cx` of 480: a lefty
stands at 638 and a righty at 322. The plate camera's focus was the single number
**596**, and the comment over it said the batter is drawn "about 553 to 750",
which is the first-base box and only the first-base box. **That comment is the
whole bug**, written as a fact about the scene by somebody who had looked at one
half of it.

**What it cost, on a 390 phone.** The crop is 117 of the world's 320 blocks and it
held blocks 140 to 257. A righty's box is 68 to 146, so **8.1% of him was in
frame**: a sliver of shoulder at the left edge, with the strike zone stranded in
the left third of the screen and nothing beside it. **52 of the 68 characters bat
right.** At 360 it is 9.4% and at 320 it is 35%.

| | in frame |
|---|---|
| a lefty, any screen | 100% |
| a righty, 390 phone | **8.1%** |
| a righty, 320 phone | 35% |
| either, sideways or desktop | 100% |

Sideways and on a desktop the crop is wide enough to hold both boxes, so **there
is nothing wrong at all on the two screens a developer works on**, which is most
of why it survived. Everything else about it is correct: the scene renders, the
swing plays, the aim maps, and the zone is never clipped, because the keep box
holds the zone and the keep box is the only thing that was ever asked about.

**Found by taking a screenshot and looking at it, which is the fourth time on this
page**, and it nearly survived that too: the man at the plate in the shot was one
of the sixteen lefties, so the picture looked composed.

**So the focus mirrors with the hitter.** `plateFocus()` asks `currentBatter()`,
which is the same call the plate painter makes, so the camera and the scene cannot
disagree about which side of the plate to look at. `batsLeft` is a pure hash of the
key, so it costs nothing and can never flip inside an at bat.

**THE KEEP BOX DOES NOT MIRROR, and that is the half most likely to be tidied up
afterwards.** The zone is drawn at 442 to 534 whichever box the hitter stands in,
so it is a fact about the scene rather than about the at bat, and a keep box
mirrored about `cx` would land at blocks 139 to 176 and stop holding the very thing
it exists for. At 390 the mirrored focus asks for `sx` 63 and the keep box refuses
below 64, so the two disagree by one block and the keep box wins. That is the
arrangement it was written for, working.

**What a narrow phone loses instead is the CATCHER**, who is a sliver at the far
corner and is the one figure here that most reference games do not draw at all.
The note on `PLATE_KEEP_X` used to say the BATTER was the thing a narrow phone
gives up. He is not context: his swing is the entire feedback loop.

**The guard puts each of the sixty eight in the box and RE-FITS**, and the first
draft of it read one camera against 68 hypothetical batters, which cannot see a
camera that follows the hitter: it reported the fixed page as still broken. It
also asserts the crop MOVES between the two boxes, because a run where both hands
framed identically would pass having exercised nothing, and it exempts a screen
holding the whole scene, which correctly never moves. Reintroduced, five
assertions fail and name `popeye (R) 8.1% in frame`.

**The sky above the park is NOT this and is not a defect.** The plate scene is 220
blocks tall and a 390 phone shows 208 of them, because `cover` binds on the height
and there are only 12 blocks of vertical freedom. Framing a shorter band would
make the scale larger and the crop NARROWER: at 140 blocks the phone would show 78
across, which is the width of the batter alone. The sky is what buys the
horizontal room.

##### And then the focus moved to the plate, because the whole view read as angled

Reported next, from the same phone: **why is this angled.** It was.

**Everything in this scene radiates from home**: the base paths, both foul lines,
the batter's boxes. So where the plate sits across the frame is what decides
whether the picture reads square or oblique, and it sat at **21%**. One foul line
swept across the entire frame, the other was off it, and the origin they both
point at was jammed against the left edge.

596 was the midpoint of the zone and the batter TOGETHER, chosen to keep all of
him in frame. The focus is the **zone itself** now (488 is `zx`), so the plate
lands at 48% and the foul lines are symmetric about it.

**IT IS A PICK AND NOT A TUNING VALUE**, because the two cannot both be had.
Rendered at four framings and looked at:

| focus | plate at | zone spans | least visible batter |
|---|---|---|---|
| 596 | 21% | 10-36% | 94.9% |
| 545 | 32% | 21-47% | 83.2% |
| 505 | 43% | 32-58% | 64.5% |
| **488** | **48%** | **37-63%** | **55.9%** |

The arithmetic underneath: a portrait phone shows 117 of the world's 320 blocks,
the batter's sprite is 78 of them, and he has to stand clear of a 31 block zone.
Holding the plate axis AND all of him needs **183 blocks**. No framing does both.
**The playtester was shown all four and chose square.**

**What is cropped is always his BACK**, the edge facing away from the plate, so
his swing and the bat's whole arc are in frame at every setting and on every
screen. That is what the guard holds. The ball's whole range and the zone stay at
100% everywhere too.

**THE GUARD'S SHARE WENT 70 TO 25, AND THAT IS NOT A BAND LOOSENED TO PASS.** The
framing was deliberately changed underneath it, so a guard still demanding 70
would be holding the page to a camera it no longer has. That distinction is the
whole of why this paragraph exists: the rule against moving a band to make a run
pass is about moving the band INSTEAD of fixing the page, and here the page moved
first, on purpose, at the player's request.

**THE BINDING SCREEN IS TALL AND LOW RATIO, NOT NARROW**, which is not the order
anybody guesses and is the second time this file has had to say it. A 320 phone
gets **160** of the world's blocks; a 360x950 at ratio 2 gets **90**, and that is
where the batter bottoms out at **37.1%**. Measured across every plausible phone
rather than assumed, and that screen is in the sweep now. Against a defect of 8.1%
and an unmirrored focus of 0%, a floor of 25 is the middle of a real gap.

**THE REAL ANSWER IS A SMALLER BATTER AND IT IS NOT TAKEN HERE.** At 2.5 times the
zone's width he is what makes this a trade at all; drawn smaller, the plate could
be centred with all of him beside it and nothing given up. That is a scene change
rather than a camera one, so it wants looking at before it ships.

##### And measuring that turned up the ball leaving the frame, which was everybody's

`PLATE_KEEP_X` was `[144, 181]`, a box around the zone and nothing else. A pitch
lands anywhere inside **1.7 zone units**, so the ball reaches blocks **136.6 and
188.7**. Driven through the real pitcher, 4,000 pitches:

| framing | pitches drawn off the frame |
|---|---|
| the first-base box, which this page has always shipped | **2.27%** |
| the mirrored box, with the keep box left alone | **5.63%** |

So **one pitch in forty four already vanished** before any of this, and the fix
above would have made it one in eighteen. The two hands do not get the same room
because the zone sits at 488 against the scene's cx of 480, so mirroring the focus
does not mirror the zone.

**What it looks like is the ball disappearing at the instant it arrives**, which is
the instant somebody is deciding whether to swing. Nothing throws: a ball drawn
outside the source rectangle is simply not blitted.

**So the keep box holds what the ARM CAN THROW, derived from the clamp.**
`PITCH_LOC_MAX` is the one place 1.7 lives now; it was written out **four** times,
in `throwPitch`, again in the late break's re-clamp (which moves the ball after
release), and twice in the batter's own aim cursor. A hand-written 189 beside a 1.7
is two copies of one answer, and `check-numbers`' lesson applies to a camera as
much as to a sentence. The cursor reading the same bound is a free consequence
worth knowing: the bat can now never be put somewhere the frame does not show.

**WHAT GIVES IS THE BATTER, and that is the honest trade rather than a miss.** The
batter is 78 blocks, the ball's range is 52, and their union is 120 against the 117
a 390 phone can show. So about three blocks of his TRAILING edge go: his back, the
side away from the plate. Measured across every phone width in use, on the LIT
figure rather than the 64px cell:

| | worst figure in frame | ball | zone |
|---|---|---|---|
| 320, 360, sideways, desktop | 100% | 100% | 100% |
| 390 | 94.9% | 100% | 100% |
| 412 (the narrowest crop of any phone) | **81%** | 100% | 100% |

**412 binds and 320 does not**, which is not the order anybody guesses: its device
ratio is low against its height, so it gets fewer device pixels across to spend.
Any new screen worth checking is found by measuring, never by taking the smallest.

**A batter's back is cheaper than a ball that disappears**, and the two read
differently as well as costing differently: a ball that vanishes reads as a fault,
where a figure cropped at the frame's edge reads as a camera. It was looked at
rather than reasoned about, on the 412 phone that loses the most.

**THE GUARD MEASURES THE LIT FIGURE, NEVER THE CELL.** A cell is 64 wide and a
character's drawing is 40 to 64 of it, so counting the cell counts transparent
margin as a man: the same phone reads 82.5% of the cell and 81% of the figure.

**And what it asks of him is STRUCTURAL, because on the narrowest screen the three
things cannot all fit.** The claim is that his PLATE-FACING edge is in frame, so
his swing and the bat's whole arc are, whichever box he is in. The 70% share beside
it is a backstop against gross loss and sits against a measured worst of 81 and a
defect of 8.1. The two catch different directions and both are needed: with the
keep box widened and the focus NOT mirrored, one character comes back at **0%**,
entirely off the frame, while his plate-facing edge is still technically inside it.

#### And the wide camera left a black hole, which the full bleed layout made bigger

Found by walking the first two pitches again after the pass above. Before the
first pitch, and on every ball in play, the wide view is up, and on a portrait
phone it was a strip of ballgame floating in the arena's near black:

| | picture | arena | dead |
|---|---|---|---|
| 390x844 | 389x293 | 390x696 | **58%** of the arena |
| 360x740 | 360x330 | 360x592 | 44% |
| 320x568 | 320x220 | 320x420 | 48% |
| sideways, desktop | | | under 1% |

**THE WIDE VIEW CONTAINS**, because a ball in the right field corner is the
entire point of it, and the world is 320 by 220 blocks (an aspect of 1.45)
against a phone arena of about 0.56.

**No camera fixes it, and all three were worked out rather than tried:**

- Filling the HEIGHT means cropping to **117 of 320 blocks** across, which
  loses both foul lines.
- Filling the WIDTH still runs the world out vertically at any scale. The
  world is not tall enough for that shape.
- Shortening the arena to what the wide view can fill takes the plate view's
  strike zone from **78 CSS pixels to 41**, which is the floor, and the zone
  being findable is what this whole pass is for.

So the band stays and stops reading as a hole. The arena is painted with the
picture's OWN top and bottom rows, so the sky goes on being sky and the
outfield goes on being grass, and the seam is invisible because the two
colours are the same colour.

**IT IS READ, NEVER WRITTEN.** Thirteen parks paint thirteen skies, from a
cool blue through a sunset orange to a desert haze, and `drawField` shades
each one, so a hex typed into the stylesheet would be wrong in twelve of them
and wrong again the day somebody adds a park. `fieldBand` takes two pixels out
of `pixWorld`, which is the small CPU canvas rather than the display one, so
nothing is read back off the GPU.

**It samples on a camera change and never per frame.** The key is the crop, so
a cut between the two views takes one sample and holding either takes none.

**The split is at half and that is exact rather than lucky**: the canvas is
centred, so the band above is entirely in the top half and the band below
entirely in the bottom, whatever size the band comes out.

**The guard sweeps every park on two phones**, and asks the coverage question
first: a screen with nothing to fill proves nothing about the fill. **Its
"never the near black" clause passed green on the defect** until unset was
counted as the fallback, which is exactly what a missing custom property is.
Proved by removing the sampler: four failures, the colours reported as null.

#### The guard measures the glass, and it found two things the eye did not

`check-firstpitch.mjs`'s fourth section reads where the zone lands in CSS
pixels and where the deck starts, across five screens. On its first run it
reported the 1280x800 overlap above, which no screenshot of a 1512 window
would ever have shown.

**Its other report was the check being wrong, and the shape is familiar.** A
phone held sideways puts the deck in a COLUMN beside the field, and a column
that starts high up the window is not standing on anything. Read as a height
it failed on a screen with nothing wrong with it. The claim is about overlap,
so it is only asked where the two share a column.

### Nobody plays for both clubs

```
node mythiball/verify-rules.mjs    the section named "nobody plays for both clubs"
```

A roster is drafted out of the same sixty eight the opponents are built from,
and nothing stopped a player taking a man the club they are playing already
fields. The at bat card printed it out loud: **"The Great Ape at bat VS THE
GREAT APE PITCHING"**.

Measured over 6,800 matchups against all seventeen clubs:

| | before | after |
|---|---|---|
| a character on BOTH sides | **73.5%** of games | **0%** |
| the same man batting and pitching | 1.47% | 0% |

**Nothing could report it.** Both lineups were legal, every rating was read
correctly and the game played perfectly. Real baseball cannot field one man
twice and a game that does reads as broken inside one pitch.

**THE OPPONENT YIELDS, and it has to.** A season schedules clubs the player
has never seen at the moment they draft, so a rule on the DRAFT would be a
rule about a game that has not been arranged yet.

**The substitute is matched on RATINGS**, because an opponent's strength is
part of the balance every win rate in this game is measured against. Taking
whoever happens to be free would make the schedule easier by exactly how
often the player drafts well. Measured, the club's batting line moves **1.12
of about 150** over **1.16 substitutions a game**, so it is the same club.

**IT DRAWS NO RANDOM NUMBER.** The choice is a pure function of the man being
replaced and who is already spoken for, so a matchup gives the same nine every
time it is opened and no seeded stream anywhere moves. Their own card is
reserved as well, or the substitute would be somebody further down it and the
club would field one man twice by a different door.

**The guard sweeps every club rather than sampling one**, because the overlap
is a property of two hand written lists and the way it comes back is somebody
adding a character to one of them. **It asserts the overlap still EXISTS
first**: a sweep where nothing would have collided proves nothing, which is
`check-numbers`' coverage argument in a third place. Proved by making
`opposingNine` hand back the roster, which reports 2,515 of 3,400.

**IT BROKE A FIXTURE ON THE FIRST RUN, WHICH IS WHAT THE SUITE IS FOR.** The
development section asserted that your years belong to your side by handing
the opponent YOUR OWN NINE and looking one man up on each card. That is the
plainest way to ask it and it is no longer available, so the lookup found
undefined and the section threw. The claim is asked of whoever they actually
field now, which is stronger than the mirror was: **every man on their card is
the roster's own object and somebody on yours is not**. The mirror is kept as
an assertion of its own, that a club asked for your nine fields none of them.

### The first notes named hardware the reader does not have

The coach cards are the one screen a stranger cannot skip: a modal over the
field, before the first pitch. Every card was written once for every device,
so a phone was told the bat follows **"your mouse (or your finger, or the
arrow keys)"** and that **keys 1, 2 and 3** change the swing.

**And the one control a phone HAS was named as an arrow key.** Holding a side
of the picture is the phone's late break, written up in `drawField`'s own
note, and the card said "hold **left or right** to bend it".

That is the clubhouse rail's mistake arriving at the screen where it costs
most: the rail said "Point at something to see what it does" to a touch
screen. **A note that lists three ways to do a thing is a note a stranger has
to sort before they can follow it, and they are reading it with a pitch about
to be thrown.**

**`COARSE` is a POINTER query and not a width**, for the reason `ROOMFILL`'s
own note gives about tablets: a 768 wide tablet is past no phone breakpoint
and still has no mouse, and a narrow window on a desktop still has one. What
the sentence is about is the hardware, so that is what it asks. It is read
once at load, because a reader who plugs a mouse in mid at bat should not have
a modal re-render underneath them.

**THE LONG PAGE IS DELIBERATELY LEFT DEVICE NEUTRAL**, and that is the one
place this repo's two-surfaces rule does not mean two identical edits. It
already carries both halves of every control (`hold left or right (an arrow
key, or a side of the picture)`), because it is a reference somebody may read
on a laptop about a phone. The modal is read ON the device, once, at the worst
possible moment to be reading anything.

**The guard asks a WORD LIST, which is the one claim no measurement of the
glass can make.** A note that names a mouse to a finger is wrong however well
it is laid out. It also asserts the two devices are actually told apart and
are read two different sets, because a query that answered the same on both
would hand one set to everybody and the other arm would have nothing to catch.
Proved by pinning the branch false: four cards reported on a phone.

### A band a sample cannot resolve is measuring the sample, for the third time

`DISCIPLINE IS NOT SILENCE` asks that a strike down the middle draws the same
swings on every tier, and it went red at **easy 62.4 against hard 71.6** on a
build that had not touched the dugout.

**It is not a flake until it is measured, and "flake" is not a root cause.**
Repeated over 60 runs of that exact fixture, which draws a random club and a
random seated batter:

| | mean gap | sd | worst of 60 |
|---|---|---|---|
| 500 pitches a cell | **0.00** | 3.03 | 7.40 |
| 4,000 a cell | 0.07 | **0.93** | 2.22 |

So the property holds exactly and the threshold of 8 was **2.6 sigma** wide:
about one run in 120. Swept across all seventeen clubs at 1,200 pitches the
gap runs -2.3 to +3.9, and across the nine batters of one club it runs -1.7 to
+1.7, so neither the club nor the batter is what moved.

**THE SAMPLE IS WHAT MOVES, NEVER THE BAND.** Loosening the threshold to 12
would make the check unable to see the inversion it exists for. Two cells of
3,500 extra pitches cost about a second. This is the chase sweep's own lesson
one section below it, and the commish magic seed two games over.

### Difficulty is what the other dugout KNOWS

`DIFF` used to hold three columns and all three were about the player's half of
the duel: ball speed, sweet spot width, pitcher skill. Played from the MOUND,
every tier was the same opponent, so choosing hard bought a harder swing and
changed nothing about the game you pitched.

Two columns answer that, and both are measured through `calibrate.mjs --easy`
and `--hard` rather than read, because a dugout that stopped chasing altogether
renders perfectly and breaks nothing.

- **`chase` touches only pitches OUT of the zone.** A harder dugout is not a
  quieter one, it is a pickier one: measured at 500 pitches, chase runs 30.6 /
  24.8 / 11.6 across the tiers while the swing rate on a strike down the middle
  moves 73.8 to 76.0, which is noise. Discipline is not silence, and the guard
  asserts both halves.

  **THE GAP IS NOT THE SAME ON EVERY OPPONENT, and the guard used to measure
  whichever one it drew.** `swingProb` is clamped to a 0.05 floor, and `chase` is
  an offset on top of the batter's CON and the batting TEAM's patience, so a
  patient dugout pushes the base against that floor, the hard tier clamps, and
  the gap compresses. Measured over all seventeen it runs **8.4 to 23.0, mean
  16.8**, and the smallest belongs to the most patient team in the game (The Kids
  Table, patience 0.14). At 500 pitches the standard error on that gap is about
  1.8 points, so a threshold of 8 against that one team is a **coin toss**: it
  came up 6.8 and failed the suite on a build that had not touched the dugout at
  all. That is the magic seed lesson from the commish term fixture, in a
  different coat.

  So the sweep walks **every team style** now. `currentBattingTeamStyle()` reads
  `State.opponent` live, so swapping it needs no restart, and the batter is held
  fixed to isolate the term that actually moves: patience spans 0.22 across the
  league where the CON term spans about 0.05.

  **AND THAT FIX TRADED ONE FLAP FOR ANOTHER, which is worth reading before
  writing the next one.** Sweeping all seventeen teams meant dropping the per cell
  sample from 500 to 200 to keep the suite's runtime sane, and at 200 pitches a
  rate near 5 to 20 percent carries a standard error of 2 to 3 points. So easy
  against MEDIUM went inside the noise: The Marauders came back 19.0/20.5/8.0 and
  The Kids Table 14.0/4.5/5.5 on a build that had not touched the dugout. A strict
  three way order per team at that sample is measuring the sample.

  So ordering is asserted **on the pool** (the dial is `diff.chase`, global, and a
  team's patience is a constant offset on top of it) and per team only on **easy
  against HARD**, which is the full width of the dial and the one comparison that
  survives at this sample, so a team that genuinely inverted it is still caught.
  The **SIZE of the gap is on the mean**, because the clamp legitimately compresses
  it against the most patient dugout and demanding eight points there is a coin
  toss rather than a rule.
- **`read` is memory.** `patternRead` keeps a ROLLING window of the last 20
  pitches the player CALLED and answers how hard the bat is sitting on this
  one. An arm nobody steers writes nothing, because there is no pattern in a
  random draw, which is also what keeps `calibrate.mjs`'s neutral arm out of it.
  The floor is half the window: a repertoire is three or four pitches, so an
  honest mix sits near .30 and punishing anything lower would punish honesty.

**A full read takes a hard bat's timing error from .082 to .024, and that is
the point rather than an overshoot.** It takes twenty straight fastballs to get
there. **Two ways out, and both are the real ones**: mix, which the log line
tells the caller to do once per hitter, or paint the edge, because the corner
penalty is +0.12 against a read worth at most 0.11. A read that could not be
pitched around would be a punishment rather than a hitter.

**It is said out loud, once per batter.** A difficulty that changes what the
opponent knows is invisible otherwise: the player just meets hard contact and
reads it as luck.

#### A swing that misses half the time is not a backyard game

```
node scratchpad/whiff.mjs 3000 medium     the tuning instrument
node mythiball/calibrate.mjs              the tripwire
```

The CPU whiffed on **about 47 swings in every hundred**, against MLB's 25, and
the note in `calibrate.mjs` called that "still arcade-hot". It is the wrong way
round: a backyard game is a CONTACT game. The ball is in play constantly and a
strikeout is a thing that occasionally happens, not the most common outcome of a
swing. It sits at **28** now, and balls in play per swing went from 27.9 to 40.8
at medium, which is nearly half again as many plays for the half of the game that
fields them.

**THE FIRST ATTEMPT MOVED THREE POINTS AND READ AS A SUCCESS.** `calibrate.mjs`
gets about 80 swings out of a 150 pitch run, so at a true rate near 40 one
standard error is **5.4 points**. Two runs came back 36.4 and 43.9 on builds one
dial apart: they are the same measurement. The dial was cut from .15 to .125 on
the strength of the difference between them. **A file that cannot resolve the
move is not the file to tune in**, and that is now written in its own header:
`calibrate.mjs` plays real innings through the real buttons, which is what makes
it a good tripwire and a bad micrometer.

The instrument that can answer stubs `setTimeout` into a queue, calls the game's
own `throwPitch` and `scheduleCpuSwing`, then drains the queue once. **Nothing
about the jitter model is copied**, which is the whole point: a second copy of
that arithmetic would measure itself. 3000 swings an arm, in seconds.

**WHIFF WAS ALREADY FLAT ACROSS THE TIERS AND THAT IS THE DESIGN, NOT AN
ACCIDENT.** 47.4 / 47.8 / 46.2 on easy, medium and hard. Those numbers were
cancelling `DIFF.sweetWidth` (.26 / .20 / .16), so a harder dugout was never one
that missed less. What a tier buys is CONTACT: balls in play ran 24.0 / 27.9 /
31.5.

**So the three are solved separately, and scaling them together inverts them.** A
uniform cut was tried first and gave easy 27.6 against hard 34.3, which is a hard
dugout making worse contact than an easy one. Nothing would have reported it.
Solved per tier, whiff is flat at about 28.3 and the tier spread in balls in play
nearly doubles:

| | jitter | whiff | in play |
|---|---|---|---|
| easy | .115 | 28.0 | 34.1 |
| medium | .068 | 28.4 | 40.8 |
| hard | .030 | 28.6 | 47.9 |

**Only the timing jitter moved.** The aim spread (`locJ`) also makes whiffs, by
putting the barrel out of reach, and cutting both at once would overshoot and
leave nobody knowing which did it.

**The player's own bat was not touched and did not need to be.** `check-bat.mjs`
puts an ordinary swing at 94% contact and a sharp one at 100: the player was
never the one missing. This dial is the CPU's half.

##### And cutting it killed the read, because one constant was doing two jobs

The retune above pushed hard's base jitter down to .030, near the `clamp(jitter,
0.03, 0.40)` floor, and the read is subtracted BEFORE that clamp. So there was
nothing left for it to remove: a hard dugout sitting on twenty straight
fastballs timed the ball **0.015 off against 0.014** for a dugout guessing.
**The whole mechanic was dead and the only symptom was that it stopped
mattering.** Caught by `verify-rules.mjs`, which is the reason that assertion
exists.

**IT CANNOT BE FIXED BY BACKING THE DIAL OFF, and that was measured rather than
assumed.** The obvious move is to take hard's whiff down through the aim spread
instead and leave the timing headroom alone. It does nothing: `locJ` from .8 to
.40 on hard moves whiff **36.3 to 36.4**. Whiff here is essentially ALL timing,
which is `check-bat`'s binary window arriving from the other side. The barrel is
rarely what misses, so there is no second lever to trade against.

**The other tempting fix is worse and is the one to refuse.** Leaving hard's
jitter high enough for the read puts hard's whiff at 36 against easy's 28, which
is the tier INVERSION rejected one section up, arriving by a different door.

So the two jobs are separated and the clamp is written twice on purpose:

```js
jitter = clamp(jitter, 0.03, 0.40);      /* the dugout's own limit */
jitter = Math.max(jitter - read, 0.012); /* what knowing the pitch buys */
```

The FLOOR is about the dugout on its own merits: nobody times a pitch perfectly
just by being good. The READ is the one term allowed to beat it, because knowing
what is coming is exactly what it is for, and it gets its own floor. Sharpness,
fatigue and the corner penalty are ordinary modifiers and still land above the
clamp.

**The counterplay is unchanged and is what makes this safe.** Mix, and the read
decays to nothing. Or paint the edge, because the corner penalty is added after
this. And the whiff target is untouched, because an unsteered arm writes no
pattern: re-measured after the fix at 27.2 / 28.1 / 27.8.

**A TUNING PASS CAN KILL A MECHANIC IN A FILE IT NEVER EDITED.** Nothing about
the read changed. Its own assertions on `patternRead` all still passed, because
the function was right the whole time; what broke was the headroom underneath it
somewhere else. That is worth assuming about the next dial that moves.

### The defence had no play to MAKE, only one to lose

Both fielding windows this game had (the grounder throw, the fly catch) fire only
on a ball ALREADY labelled an out, so the only thing either can do is downgrade
it. A hit was automatic and the fielding side watched it land. That is backwards
from the sport and from every baseball game there is: the thrill of fielding is
taking a hit AWAY from somebody, and there was no way to.

**What made it fixable is that the sim already knew.** `buildPlaySim` computes,
per fielder, the earliest moment he can be where the ball is, and then throws
that away on anything labelled a hit. It is recorded as `sim.robSlack` now: for
the man best placed, how much time to spare he has getting to where the ball
comes down. Positive is camped under it, negative is late by that much, and a
tenth of a second late is a dive.

**Measured over 900 balls in play, 96 of 219 hits (44%) land where a fielder
could already be standing.** That is NOT the game playing wrong: the hit rate on
balls in play is about right (roughly real BABIP). It is the GEOMETRY and the
OUTCOME disagreeing, because the trajectory decides the result at contact and the
fielders are animated on afterwards. That gap is the only place a robbery can
live, and it is why this is a fielding fix rather than a batting one.

**A miss costs NOTHING and that asymmetry is the whole design.** The play is
planned as the hit and stays the hit: no amendment, no apology, the normal apply
fires on its own clock and nobody watching would know a window had been open.
Green turns it into an out. The other two windows are the opposite on purpose,
and nobody presses a button they think can hurt them, which is why the coach
notes say so in as many words.

**The gate is physics the sim already computes, never a roll.** You cannot rob
what nobody could reach. `ROB_ARC` (120) is what keeps a bloop single honest:
measured, a single's arc runs 29 at the tenth percentile to 147 at the ninetieth,
so a ball that genuinely drops in front of somebody is well under it and a deep
fly that fell in is well over. **Out of reach is about TIME, not distance**, and
the first draft of the guard got that wrong: it aimed into the gap with a two
second hang time and the gate correctly said yes, because a fielder can jog to a
ball that stays up that long.

**It fires on 21% of hits, which is 1.9 chances a side per game**, across singles,
doubles and triples. That is an event rather than a coin flip bolted to the
batting model. Re-measure it with the probe if either constant moves: half of
every hit becoming a timing bar is not fielding.

**The green scales with how close he was**, from a full 0.177 half-width for a man
already standing there down to 0.086 for a dive, plus his own glove. Most
candidates saturate at the top, which is right: the routine-looking ones are the
ones you should catch.

**Three windows can open once the ball is hit and the notes named none of them**
for as long as they existed, so a player met a bar on screen with no idea what it
wanted. The pitching notes carry a fielding step now. The `ring` the batting
notes must never mention is still forbidden there and is the truth here, because
`drawCatchRing` is what draws it.

**And the LONG page still said "Two plays need you"**, so the robbery went
undocumented on the more thorough of the two how to play surfaces for as long as
it has existed. Same lesson as the arcade's twelve blocks: two surfaces say how to
play and both need the edit, every time.

#### DOING NOTHING WAS THE WORST OUTCOME BOTH WINDOWS HAD

Neither window distinguished a player who pressed at the wrong moment from one who
never pressed at all, and the second is most of the people who have never played
this before.

- **The grounder's timeout called `finish(-1)` and fell through the distance
  maths.** `ideal` sits near 0.55 and `yellowHalf` is 0.14, so `d` came out about
  1.55, past every band: an ignored ground ball was a **throwing error**, batter
  safe and every runner up an extra base. The comment on that very line said
  "fielder holds it: batter safe", which is the single below it. **The comment was
  right and the code was not**, which is the dangerous direction, because the next
  person fixes the code to match.
- **The fly window said `if (t < 0) outcome = 'miss'` outright**, and a miss there
  is the ball over his head for a **TRIPLE**.

So a player who did not yet know these controls existed conceded an error on most
ground balls and a triple on most fly balls, all game. That is not a guess about
how it felt: measured from the other side, a defence that pressed nothing gave up
**27 to 32 runs a nine against 5.5**, which is the whole of that gap.

**After the fix that same arm measures 15.8**, so ignoring the defence still costs
about three times what playing it costs. That is the shape it should have: a real
price rather than a catastrophe. The window is still worth playing, and a player
who has not found it yet is not being handed a different sport.

**THE RULE IS THAT NOT REACTING IS NEVER WORSE THAN REACTING BADLY.** Pressing at
the wrong moment stays the worst outcome, because you committed and got it wrong,
and that is what keeps the windows worth playing. Letting the bar run out is
passive: the fielder holds the ball, or never leaves his feet, so the batter
reaches and nobody else moves up. Both expiries are a **single** now.

**The guard DRIVES it rather than computing it**, because the arithmetic is what
was wrong in the first place. It opens each window for real, presses nothing, and
reads back what the game scored.

**And the notes can now tell the truth about all three**, which is what they are
for: let the bar run out and the batter reaches, nothing worse; miss the robbery
and nothing is lost at all. Nobody presses a button they think can hurt them, and
before this the fear was correct.

**A play keeps a finish timer that nulls `g.play` and moves the batter along**, so
a test that hits a second ball 700ms after the first is torn down by the first
one's clock and reports a window that never opened. Each case in the guard waits
the previous one out.

### A franchise remembered only its win column

A club here has a city, a nickname, a park with an effect on it, a record book and
a Retire the club button, and every one of those promises CONTINUITY. What
actually carried from one year to the next was W-L and nothing else: `perPlayer`
is per season and `seasonLine()` keeps the year, the record, the rank and whether
you won it. So you could draft Dracula in year one, watch him hit twelve,
re-draft him in year two, and the game had no memory that he had ever played for
you. That is what made redrafting read as a reset rather than a decision.

**The roster is NOT locked between years and that is right.** "Play Year N+1"
sends you back to the draft with everything you have unlocked on the board, which
is what makes the unlock ladder worth climbing. The gap was never the redraft, it
was that the club could not tell you which of these men were yours.

`S.careers` is that memory, and `foldCareers` builds it.

**Idempotence is the load-bearing property and it is not obvious why.** The draft
for year N+1 happens BEFORE `startSeason` folds anything, so numbers read while
picking would otherwise be a year out of date. `foldCareers` is pure over
(`careers`, `perPlayer`, `team`, `year`) and never touches its argument, so
drawing a screen with it and starting a year with it give the same answer. Get
that wrong and every re-signed player's record doubles, silently, on a screen
nobody would think to check.

**A year is counted off the ROSTER, not off the stat sheet.** A ninth man who
never got an at bat still spent the season on the club, and counting years from
`perPlayer` would quietly leave him off his own record. He gets `1 year here` and
no row of zeros pretending to be a career.

Two surfaces, and the first is the one that changes a decision: a green line on
the draft card for anybody who has worn the shirt, and a Club careers table on the
record book screen. **A first year franchise is unmarked and looks exactly as it
always did**, which the guard asserts from the other end.

### A franchise had memory and no arc

**Nothing in the game read `S.year`. Only the labels did.** A club had a record
book, a ladder of unlocks and (since the careers pass above) a memory of every man
who wore the shirt, and year ten still played exactly like year one: the same
board, the same league, the same numbers. `opponentSharpness()` ramps game one to
game seven and reads `results.length`, which resets every April, so even the one
existing arc was annual.

**Two halves fix that and NEITHER WORKS ALONE.** A man who has worn your shirt is
better at what he did in it, and the league sharpens with your tenure. Development
on its own is a club that wins by turning up. A rising league on its own is a
punishment for playing a fourth season. Together the redraft becomes the decision
the mode was missing: your veterans are now better than the board, and the new
unlock is not.

**The roster stays unlocked, which is the rule this must not break.** "Play Year
N+1" still opens the whole board, because that is what makes the ladder worth
climbing. What changed is that walking away from a four year man now costs
something a drafter can read on his card.

**It is DERIVED from the career record, never stored.** `devOf(k)` is a pure
function of what `careerOf(k)` already holds, which buys three things at once: it
cannot drift from a second copy (the commish era's rule), it is idempotent for
free so drawing the draft screen twice cannot double it (the trap `foldCareers` is
written around), and **every save that already exists gets its veterans developed
the day it ships** rather than starting everybody from scratch.

**It pays for what he DID, not for turning up.** A bat only develops off at bats
and an arm only off outs, so the ninth man who never played keeps his year on the
record and earns no rating for it.

**ONE SEAM, because a rating is read 139 times.** Those reads sit on a dozen
receivers (`ctx`, `batter`, `pitcher`, `runner`, `c`, `b`), so hooking them would
be the Full Team glow bug waiting to happen. The lineup is built in exactly one
place, `startGame`, so `developed()` is applied there and everything downstream
follows. **Only your side**: the opponent draws the roster's own numbers even when
their lineup names the same character, which the guard asserts against a mirror
lineup.

**The card shows what you would actually field.** A draft card printing the
roster's own figures would understate every man this club has kept, and the drafter
would be choosing on numbers the game does not use. The raised rating is marked in
the grid and the gain is named under it (`+4 CON`, not `+7`), because the named
stat says what kind of player he has become.

#### Three things it got wrong, and two needed a screenshot

- **A RATING MUST NEVER BUY YOU LESS, and this one did.** The 99 clamp is the
  whole of the diminishing return (a 96 has three points of room, a 60 has thirty
  nine) and part of this roster is written AT or ABOVE it. A flat
  `clamp(base + v, 1, 99)` handed the game's 100 power man **a point off** for his
  years of service. The probe reported him gaining -1. That is `sendOdds`' rule at
  a third door, after the send curve and the monotonicity sweep.
- **The card promised gains that never landed.** It printed the bump a man was
  OWED, so somebody at the ceiling was told "+4 POW" and gained nothing.
  `developed()` records what was actually APPLIED now, which is the commish state
  card's rule (decide on the printed value, not the raw one) arriving at a draft
  screen.
- **A raised PIT drew RED.** `.statgrid b.up` (0,2,1) loses to `.statgrid span.arm
  b` (0,2,2) two rules above it, and `--gold` in this palette is red, so the one
  number on the card meaning HE GOT BETTER was the only one printed in the colour
  that means trouble. Nothing threw and no assertion could see it. **Found by
  looking at the card**, which is the same shape as the football prompt card's
  `.pwc-marks` selector.

**And `developed()` guards its own output.** Nothing hands it an already developed
man today, because the lineup comes from `ROSTER_BY_KEY` and the card from
`ROSTER`, both raw. It returns early on `c.dev` anyway: it derives off the KEY, so
feeding it its own output would add the bump to a base that already carries it and
silently double every veteran on whichever screen somebody wired up second.

**The tenure ramp is deliberately smaller than the in season one.** Game one to
game seven is worth 0.75 of that dial; a whole career is worth **0.30**, plateauing
after six years. The shape of a season stays the loudest thing in it and tenure is
the bass note underneath. **Exhibition does not get it at all**: a one off is not a
franchise year and has to stay the fixed, knowable thing somebody reaches for when
they want a game rather than a career.

### The friendly button was the worst path

**Randomize is the first thing a new player touches**, because it is what somebody
presses who does not want to read sixty-eight cards. It shuffled the ORDER as well
as the nine, and the first pick starts on the mound, so the man it put there was a
coin toss.

Measured over 4000 draws: **52% of them opened with an arm under 55 PIT while the
same nine men held a median best of 74.** Ordering alone threw away 27 points of
PIT. Nothing could have caught it, because a random draft is a valid draft, and the
only symptom was a bad first game with nothing on screen to explain it.

**The nine are still random.** Only the order changes, which is the part the player
did not pick and the part the game says matters. Measured after: 0 of 60 below 55,
0 that started anyone but the best arm on the club.

**A hand draft is left alone and told what it is doing.** Somebody who chose their
own order made a choice. The rule lives behind the info dot, which is the right
place for a rule and the wrong place for a fact about THIS draft, so the footer
names the starter and his PIT and, in gold, the better arm already picked. It
never reorders.

### The picture disagreed with the book on one play in six

`buildPlaySim`'s own comment says a hit's throw "gets there just after he does:
that is what a hit looks like, and it is the whole difference between this and an
out." Nothing checked it, and it was false on **66 of 420 plays**. What a player
sees when it is wrong is a fielder standing on the bag holding the ball while the
runner jogs up and is called safe. Nothing throws.

Two faults, and **finding the first made the measurement worse before it got
better**, which is why the guard asserts a property and never a number.

**The horizon.** `simRunPath` reports `reached` as the moment a runner touches his
bag, and when the loop runs out first it reports the END OF THE SIM instead. Home
to third is 3.33 diamond units and the slowest man runs 0.342 a second, so he
needed about 9.9 and a nine second horizon reported 9.12 every time. Everything
downstream trusts that number: the throw is timed against it, the close play is
read off it, `deadAt` comes from it. `SIM_MAX_S` is 15 now, which covers first to
home at the slowest speed (13.49s) with room. It costs sample arrays, 900 entries
per runner instead of 540.

**The one sided guard.** `lateThrow` asked only that the fielder not HOLD the ball
too long, never that the throw not LAND too early, so when the runner was further
off than the hold allowed, the launch clamped to `ready` and the ball beat him to
the bag by whatever was left.

**There were THREE untimed throws in that branch and each fix uncovered the
next**: the `lateThrow` clamp, the last-resort `throwTo(from, 1, at + 1.0)`, and
the one inside the cutoff relay, `throwTo(cutoffUV, ..., ready2 + 1.2)`. The last
one put the ball on third five seconds before the runner. Measured after all
three: **0 of 357**. When nobody can be thrown out the ball now comes in BEHIND
the play, to a bag the lead runner has already touched, after he has touched it,
which is what an infield actually does.

### A strikeout had no frame, and a pose is one offset rather than 68 drawings

The batter reverted to his neutral stance and stood in it for the whole
`afterOut` beat, so the screen looked the same whether he had just been rung up
or was waiting on the next pitch. That is the most frequent thing that happens to
a hitter.

**The generator is parametric**, so `slump` is one entry in `ARM_OFF` plus a line
in `POSES` that all sixty eight characters inherit. It weighs about **61KB of
sprite table**, which is what one pose across this roster costs (0.96MB for
fifteen). Adding a pose is cheap; this section exists because judging it is not.

**The generator reproduces the in-page table byte for byte**, so splicing is safe
and that is worth checking before you splice. Adding a pose GROWS each
character's palette, which shifts every letter and changes every string, so a
string compare says everything changed. **Decode and compare pixels instead**:
1020 existing frames came back identical.

**Two things here were only findable by LOOKING, and a count of distinct frames
was happy through both.**

- At an eight pixel drop the arms hang PAST the shoes and cover them, so a
  slumping Zeus reads as a man with no feet standing on two white posts. Five
  clears the floor.
- A one pixel leg sink, tried so the quadrupeds would get something, clipped
  every biped's shoes off the bottom of the 50px box and moved exactly one of the
  seven. It is back at zero.

**Seven characters have no arms to drop** (the lion, the dog, the chupacabra, the
phoenix, the dragon, nessie, the cat), which is the same reason `raised_arms`
skips them. Their slump is their `back` frame. A dragon taking a called third
strike is a dragon standing there.

**The head cannot drop.** `cy` is per archetype and set after the body, so a
slumped skull means threading the pose through every archetype's head draw. The
arms carry it, and at the plate camera's 5.2x the batter is the biggest thing on
screen.

### How long a game actually takes, and Fast now reaches its target

**Normalise PER HALF INNING.** A game that ends early on the mercy rule flatters a
wall clock, and both samples here did: one stopped in the 4th, one in the 5th.

| Fast | per half inning | 5 innings | median pitch to pitch | gaps over 8s |
|---|---|---|---|---|
| beat 0.60 | 80.2s | **13.4 min** | 3.31s | 2 |
| beat 0.45 | 48.7s | **8.1 min** | 2.94s | 0 |

Same harness, before and after, and the second run reached the fifth inning where
the first reached the fourth: more baseball in less time. The target is five to
ten minutes, so Fast is inside it now and was never close before.

**NORMAL IS DELIBERATELY UNTOUCHED.** Its rhythm is the one a playtest asked for
in as many words ("slow down a lot", recorded in `BASE_BEAT`), and the setting
that exists to trade ceremony for pace is the one that should reach the target.
The default stays the playtested game.

#### More contact does NOT make the game faster, which was predicted and is wrong

The contact retune cuts whiffs from 47 per hundred swings to 28, so at bats end
sooner, so the game should be quicker. That was written down as an expected
free win before it was measured. It is not one. Driven through the real buttons
at Normal, the shipped build against the build one commit before it:

| | before | after |
|---|---|---|
| wall clock | 698.0s | 686.9s |
| pitches | 131 | 122 |
| balls in play | 47 | 49 |
| seconds per pitch | 5.33 | **5.63** |
| median pitch to pitch | 4.23s | **4.23s** |

**The per event rhythm does not move at all**, to two decimal places, and the
seconds per PITCH go UP. That is the mechanism: fewer pitches, but a larger
share of the ones left are balls in play, and a ball in play costs a play
animation plus `afterHit` where a whiff cost `afterWhiff`. It trades cheap
events for expensive ones at close to par.

**AND THE PER HALF INNING FIGURE SAYS THE OPPOSITE OF THE WALL CLOCK, because
neither sample is a controlled one.** 77.6s before against 114.5s after, which
would be a large regression, except the after game was a **0-28 mercy blowout
in 6 half innings** and the before game a 4-16 over 9. Scoring is what fills an
inning with play animations, and this pass RAISED scoring, so the two are not
separable at one game an arm. What is safe to say is the negative: the retune
buys no pace, and the direction of any residual effect is toward slower innings
in a high scoring game rather than faster ones.

**Do not tune a beat off this.** It is n=1 an arm on a measurement whose own
header says to normalise per half inning, and the two arms disagree about which
way to normalise. Settling it needs several games an arm, and nothing currently
depends on the answer.

#### And then the whole table went up by a third, which overturns the note above

Reported by the same playtester whose "slow down a lot" is what `BASE_BEAT`'s
own header records, after the thinking gap alone had already been raised from
2.1s to 3.2s: **the game moves a little too fast, it should be natural.**

**A playtested number is only playtested until the same person plays it again.**
That is the whole licence for moving `normal`, which this file twice says is
deliberately untouched.

**What was measured before anything moved**, because "too fast" has three
candidates and only one of them is this table:

| | |
|---|---|
| the pitch flight | **2.0s** for a fastball, **2.7s** for a curveball, at medium against an average arm |
| the thinking gap | `windup` + `betweenPitches`, **3.2s** |
| an out to the next pitch | `afterOut` + `intoAtBat` + `windup`, **3.4s** |

Real baseball is about 0.4s of flight, so **the ball was never the quick part**
and slowing it would have made the timing game easier rather than the pace
calmer. It is the dead time.

**Scaled UNIFORMLY by 1.3 rather than tuned beat by beat**, because the report
was about the game and not about one pause: the ratios the playtest settled all
survive and only the tempo moves. The thinking gap is **4.2s** and an out to the
next pitch is **4.4s**. Normal is now exactly what Relaxed was, which is the
cheapest way to say what changed; Relaxed goes slower again.

**FAST'S MULTIPLIER MOVED SO THAT FAST DID NOT**, and this is the half most
easily got wrong. Its 0.45 was solved against the old table for a five to ten
minute game and measured at 8.1 minutes. The table is 1.3x now, so leaving 0.45
alone would have taken Fast to about **10.5 minutes** and out of its own target
without anybody touching Fast. **0.346 x 1.3 is 0.45 of the old base**, so every
Fast beat lands on the same millisecond it was measured at.

**The METER is untouched on all three.** It scales the pitch sweep, which is how
hard the timing is, and the report was about pace. That is also why the default
was not simply moved to Relaxed, which is the one line version of this: it would
have handed everybody a 1.20 meter, making the game easier under a change named
for its pacing.

**Two ways this measurement went wrong before it went right**, both worth not
repeating:

- The harness pressed `#swing-btn`, which is the PHONE control and is not visible
  at desktop width, so it never swung once and timed a game of nothing but called
  strikeouts, reporting a clean 0-20 loss. `scratchpad/pacing.mjs` presses Space,
  which the coach notes name and which is always there.
- An attribution probe that FORCED each next pitch reported the ordinary ball or
  strike as 69% of the clock, and it was measuring the pitch FLIGHT: calling
  `throwPitch` directly skips the very beats it was trying to weigh. **Cutting the
  beat by a quarter moved its number from 1.41s to 1.39s, which is what gave it
  away.** Only the COUNT attribution survived (two thirds of transitions are
  ordinary pitches).

### It was worth being slower

`sendOdds` decides how often a runner waved round actually scores, and it was two
separate curves rather than one curve with a bonus on the end. Crossing the floor
RESTARTED the odds from a lower base:

| | slower | faster | cost of speed |
|---|---|---|---|
| second to home on a single | 74: **47.7%** | 75: **35.0%** | -12.7 pts |
| first to home on a double | 84: **54.3%** | 85: **30.0%** | **-24.3 pts** |

**Tom Sawyer is 84 and Huck Finn is 86**, so waving both round sent the faster man
home less often. Nothing could report it: every number involved is a valid
probability and the play resolves correctly against whichever one it is handed.
The only symptom is that the fast man you drafted for his legs keeps getting
thrown out.

One curve now, with the fast bonus ADDED to it. The guard asserts MONOTONICITY
over the whole scale rather than the two numbers that were wrong, because a cliff
can come back at any floor somebody tunes later.

#### And then the gate came down, because this is a backyard game

That fix left the ODDS honest and the PERMISSION untouched, and the permission
was the whole gap. A runner scored from second on a single **24% of the time**
against about 60% in the real game, and the note here said to measure the run
environment before touching it. Measured (`check-runs.mjs`, about 5.5 a nine):
scoring is not broken, so there is room.

**Only 35% of the roster cleared the old floor of 75.** Two thirds of the league
stopped at third on a base hit, so the play at the plate, which is the best thing
that happens in a game of backyard baseball, mostly did not happen. **Speed now
decides the ODDS rather than the PERMISSION**, which is the arcade shape:
everybody runs, the fast ones make it.

| | tries | scores | thrown out at the plate |
|---|---|---|---|
| second to home, was | 35% | 24% | 11% |
| second to home, now | 71% | **59%** | **12%** |
| first to home on a double, was | 22% | 14% | 8% |
| first to home on a double, now | 53% | **45%** | 8% |

**THE THIRD COLUMN IS WHY THE FLOOR COULD COME DOWN THIS FAR**, and it is the
thing to check before reading this as a difficulty cut. The runners who now score
are the ones who used to HOLD, not runners who used to be safe: outs at the plate
move 11% to 12%. A version of this that bought the scoring with outs would gut
the mode and would pass a check that only read the scoring rate, so the guard
asserts both.

**Two outs drops the floor another ten points**, and that is arithmetic rather
than feel. Holding at third is worth something only if somebody is coming up
behind him, and with two out there is one batter left. Ten points is where the
floor's own odds fall from about .61 to about .50, which is where the trade turns
over. It reads 63% scoring and 16% thrown out, and an out at the plate with two
away ends an inning that was ending anyway.

**The floor is still there.** A statue rounding third is a joke rather than a
decision, and `sendClears` is what the SEND and HOLD button overrides.

**IT MOVED TO MODULE SCOPE, AND THAT IS HALF THE FIX.** `sendOdds` was a local
const inside `applyHitMutation`, so `verify-rules.mjs` carried a hand-copied
duplicate of the arithmetic in order to sweep it, and the nine-curve sweep in the
section below could not reach it **at all**: the curve the whole sweep was
written for was the one curve not in it. The copy would have gone on passing on a
curve the game had stopped playing. One definition now, read by both, and the
sweep walks eleven curves.

### A rating must never buy you less, and the sweep that says so

`sendOdds` was an instance of a CLASS. Any function mapping a rating to a number
is meant to move one way, and a piecewise one can turn round at a seam with every
value it returns still a perfectly valid number. So the suite walks all nine of
them end to end, over 0 to 100, including the one that must go DOWN
(`pitchScatter`: more control, less scatter).

Writing it found one more thing, in the oldest idiom in the file. **`c.spd || 50`
reads a legitimate ZERO as average**, so the slowest man imaginable would run like
a median one. Nobody on the roster is 0 (Lady Liberty is 1), which is exactly what
makes it a trap rather than a fault: it goes off the year somebody writes a
statue. `ratingOr(v, d)` is `||` with the hole taken out, and every rating is read
through it.

### A timer fires into its OWN play or not at all

**Seen once, never reproduced, and real.** `Cannot read properties of null
(reading '0')` turned up in one probe run and then survived about eight hundred
forced pitches across three harness shapes without coming back. It was found by
READING instead.

A ground out schedules its throw window for `meetAt`, and the callback checked
that `g.play` existed, not that it was the SAME play. A play can be torn down
inside that window and a new one begun, and **if the new one is a HOME RUN its sim
has no `meetUV` at all**, because nobody meets a ball in the seats. That is why it
is so rare: it needs the replacement to be a homer, about one ball in play in
twenty.

The guard DRIVES the sequence rather than waiting for it, and pins the error text,
so the fix is tied to the symptom actually observed: reading a homer's `meetUV[0]`
produces exactly that string.

This is the swing timer's own lesson ("the first check is against the GAME, not
just the pitch") arriving at a **third** door, after `catchActive` and
`throwActive`. Three schedulers carry the identity check now: the throw window,
the catch window and the robbery.

#### And a scheduler is not a closer, which was three more of the same

**"Three schedulers carry the identity check" was true and was read as the whole
answer.** A scheduler decides whether to OPEN a window. The window then stands
open, and what it does when it CLOSES was a different question nobody had put.
`startCatchWindow`'s expiry, `startRobWindow`'s, and the ordinary apply timer all
asked whether there was **a** play and then resolved into it.

**Surfaced by a full `calibrate.mjs` run**, which reported one page error reading
`Cannot read properties of null (reading '0')`: the exact string the section above
exists for, at a door that fix did not reach. Every target was in band; the error
was the only thing wrong with the run.

**DRIVEN, never waited for**, which is that section's own rule. Open the window on
a fly ball, replace the play with a home run, let the 900ms expire. Measured, with
the guards removed:

| | what the stale window did |
|---|---|
| the catch window | marked the **home run** `applied`, so its own outcome never landed |
| the robbery, pressed | turned somebody else's **triple into a fly out** |
| the apply timer | resolved the home run **787ms early**, with the ball still in the air |

**THE CRASH IS THE RARE SYMPTOM AND THE QUIET ONE IS EVERY TIME.**
`resolveCatch` sets `applied` on its first line, so a stale window spoiled
whatever play it found, on every replacement. The throw is only null when the
replacement has no meeting point, which is a ball in the seats and about one in
twenty. That is why this went a year without a report: the crash needs a
coincidence and the corruption needs nothing.

**Returning costs nothing, which is what makes the guard safe.** Every play
schedules its own resolution, so a timer that declines to act on a stranger
leaves that stranger to its own clock a moment later. Nothing is dropped.

**The flag goes back on THIS play, not on whatever is there now.** Written
`if (g.play) g.play.catchActive = false` a stale window turns off a flag the new
play has just set, which is a second bug hiding inside the first one's line.

**The listeners come off BEFORE the identity check**, or a window that resolves
into a stranger leaks its keydown and click handlers for the rest of the game.

**THE APPLY ARM NEEDS A PAGE OF ITS OWN**, and it failed once for exactly the
reason the football boss battle's pacing walk needs one. Run after the two window
arms, their pending transition timers (`play = null` at `arriveMs + 500`) fire
inside its fixture, so the home run's OWN apply correctly declines and the arm
reads a play that is never applied at all. **That failure was the harness, not the
page**, and the first reading of it was spent deciding which. It carries an
assertion that the replacement was applied at all, so the next time that happens
it says so rather than looking like the defect.

### Smoothness, measured, and one honest null result

```
node mythiball/check-frames.mjs                              desktop, which proves nothing
node mythiball/check-frames.mjs 70 normal --phone --cpu=4    the run that matters
```

**It is a meter with bands, like `calibrate.mjs`, and the bands are generous on
purpose.** Frame timing is noisy: the same build measured 1.01%, 1.25% and 1.71%
of frames over 33ms in three consecutive runs. A band tight enough to catch a 10%
regression would flap on nothing, and a check people learn to ignore is worse than
no check. What it catches is the render doubling, a hitch appearing, or a leak.

**Input is not the problem and the header records why nobody should re-measure
it.** Press to the game ACTING is 0.20ms (p90 2.2ms); press to the next frame is
21.3ms against a 20ms floor at that throttle. The swing paints on the very next
frame, which is the best there is.

**The first attempt at that number said 50ms and was measuring the harness.** The
rAF watcher was armed only after the keypress had gone out through CDP and come
back, so it reported the round trip. It is armed before the press now and every
timestamp is taken in the page.

**A headless desktop is the easiest case there is**, and it says 60fps mean with
one frame over 33ms in 4203. The run that matters is a phone viewport with the CPU
throttled to a mid range handset.

| | mean | p95 | over 33ms | over 50ms |
|---|---|---|---|---|
| desktop | 16.7ms (60fps) | 18.5 | 0.02% | 0% |
| phone, 4x throttle | ~20ms (50fps) | ~28 | ~1.3% | ~0.1% |

**At 4x throttle the render simply costs most of the frame.** `drawField` runs at
2.48ms mean, which is about ten of a sixteen millisecond budget once throttled.
That is the honest capability, and further gain needs a cheaper `drawField`, not a
hitch hunt.

**WASTED WORK WAS FOUND AND REMOVED, AND IT DID NOT MAKE THE GAME SMOOTHER.** Both
halves of that sentence are measured.

- The log rebuilt all fourteen lines and forced a layout with `scrollHeight` on
  every `refreshHud`, which runs on every ball, strike, out and base change. It
  appends now, and `refreshHud` went from 7.96ms to 5.36ms on the throttled phone.
- `runnerCache` was keyed on the raw float SCALE while the canvas it built depends
  on the rounded pixel size, and the batter's walk up ramps that scale
  continuously: a fresh 1600 fillRect build every frame of the walk, every at bat,
  and an unbounded cache as well as a hitch.
- `spriteCanvas` had no cache at all, so `refreshAtBatCard` rebuilt the batter's
  48px avatar from scratch on every HUD refresh: the same four sprites came back
  nine, eight, eight and five times in forty five seconds.

One `spriteStore` now holds one built sprite per character, size and frame.
Sprite builds fell from **305 a minute to 118, with zero repeats** (all that is
left is first time warming). `spriteCanvas` hands back a COPY, because callers
append what they get to the DOM and a node can only live in one place.

**And the A/B says none of it moved the frame times.** Three runs each way:
frames over 33ms came out 1.25 / 1.71 / 1.01 after against 1.35 / 1.20 / 1.42
before, with p95 identical. **The 73% correlation between long frames and sprite
builds was real and I misread it**: a build lands in a long frame because both
cluster on the same events (a new batter means a new sprite AND a HUD rebuild AND
a play starting), not because 1.5ms of building makes a 33ms frame. Keep the
changes because they are strictly less work and they fix an unbounded cache; do
not keep them because they made it smooth.

#### The same null result, and the instrument fault that hid it twice

The display bitmap was a fixed **1440x990 on every screen**, 1.43M pixels a frame.
A 390px phone shows that canvas 358 CSS pixels wide, which at a device ratio of 3
is **1074 device pixels, 0.79M**. So the game wrote 81% more pixels than the screen
could show and the browser resampled the surplus away. That reads like an obvious
win and it is worth **0.3ms a frame**.

**The first A/B said 9.5ms and was measuring the warm up.** Three runs, A B A, came
out 35.6 / 6.2 / 16.3 percent of frames over 33ms, and the whole gap was read as the
fix when the series is simply a page getting faster as it runs. Interleaved and
repeated, three runs an arm, the arms are 23.3 and 23.0 with **3.4ms of spread
inside a single arm**. This is the sprite cache's lesson arriving a second time, from
the other side: there the correlation was real and the cause was not, here the
difference was real and the cause was the running order.

**AND `setCPUThrottlingRate` ONLY SLOWS THE MAIN THREAD.** It throttles script, not
rasterizing and not compositing, so a change that moves pixel COUNT rather than
javascript is close to invisible to `check-frames.mjs` however many times it is run.
A null result from that file is a null result **about the main thread** and never
proof that a real phone would not care. That is recorded in its header so the next
person does not re-run it expecting an answer it cannot give.

#### It has never had one block size, and that is the reason it changed anyway

Measured by reading a row of the stands back out of the bitmap and counting run
lengths: at 1440 the 320 pixel world is blown up **4.5x**, which is 160 blocks four
device pixels wide and 160 blocks five device pixels wide. The whole one-resolution
pass exists so the field's grid and the sprites' grid read as ONE grid, and it never
had a single block size to read. **Nothing failed and nothing could.** A ragged grid
renders, reads and sells perfectly well.

So `fieldBitmapWidth()` picked the smallest WHOLE multiple of the world that covers
what the screen can show, between two and four:

| screen | can show | bitmap | scale |
|---|---|---|---|
| 390 at ratio 3 | 1074 | 1280 | 4x |
| 360 at ratio 2 | 658 | 960 | 3x |
| 320 at ratio 2 | 640 | 640 | 2x |
| desktop 1280 | 924 | 960 | 3x |
| 1920 at ratio 2 | 2210 | 1280 | 4x (the ceiling) |

Every screen was at or under the 1440 it replaced, so it was **never more work than
before**, and every one had one block width.

**`FIELD_CAM` REPLACED THAT FUNCTION AND THE WHOLE TABLE ABOVE IS HISTORY.** It was
right about the bitmap and said nothing about what the browser did with the bitmap
afterwards, which is where the full bleed layout broke it. The live rule is in the
section above ("the window is the frame"): the canvas is the arena's own device
pixels and the crop is a source rectangle. The floor of 2 survives it.

**The floor is 2x and it is not decoration.** Below it the blit is DOWNscaling the
art, and the grid stops landing on whole pixels in the other direction.

**`FIELD_K` was 1.5 and is DELETED.** It was the old fixed blow-up, kept for a while
as a ceiling on the bitmap, and once the canvas became the arena's own device pixels
nothing read it at all. A constant nothing reads is a number the next person tunes
expecting something to happen. The crisp HUD pass replays queued type at
`FIELD_CAM.scale / PIX`, off the same camera the blit used, so the type and the
picture cannot come apart.

**The sizer is asked every frame and writes almost never.** Resizing a canvas clears
it, which is free in a loop that redraws every pixel every frame and ruinous if it
ran every frame. It has to be in the loop rather than on a resize listener, because
the canvas also changes size when the arena is first laid out and when a browser
moves between screens, and only one of those three fires a resize.

**`PIX` is read inside the function and not into a const beside it.** It is declared
below `FIELD_W`, so a const there is read before its own line and throws on load,
which takes the page rather than one number. Same TDZ as the football results screen.

**The guard asserts the PROPERTY, never a width**, over six viewports: the scale is a
whole number, the blit lands on the grid, and the bitmap is exactly the pixels the
arena occupies. (That last one replaced "never over 1440", which was a claim about
the bitmap and therefore blind to the browser upscaling it.) Pinning the numbers
would make it a test of whichever devices somebody thought of. It reads
the row **up in the stands**, where the field is flat colour, because a row through
the sprites or the chalk has real edges in it and the run lengths would be the art
rather than the grid.

**A ROW IS NEVER PURE BLOCKS, AND ASKING FOR THAT WAS THE BUG.** The crisp pass
replays queued type on the DISPLAY canvas at full resolution AFTER the blit, on
purpose, so any row crossing it carries single pixels that owe nothing to the grid.
The first draft demanded one run length and failed on five viewports of six,
reporting 182 blocks of four and 24 of one as a ragged grid. It was reading the type.
**A standalone version of the same scan passed, which is worse than failing**: its row
happened to miss the words, so the check was a coin toss on where they landed. That is
the third time an extractor in this repo has been wrong in silence.

So the claim is about the BLIT: the most common run is the scale, and what is not a
whole multiple of the scale is a sliver. Measured, off-grid pixels run **0% to 4.4%**
of the row across the six, against a threshold of 8%.

**What that still catches is the one thing only pixels can say**, which is
`imageSmoothingEnabled` coming back on. Proved rather than assumed, by forcing it back
on and re-reading: the modal run goes from 4 to **1** and the off-grid share to
**57.2%**. A check that can only pass is worth nothing.

### A comment is a claim, and most of them are checkable

Auditing what the code says about itself has found **three real bugs** in this
file: the throw meant to arrive "just after he does" that beat a safe runner by
five seconds, the coach notes teaching a removed control, and the send odds that
made speed a cost.

A sweep of the strong claims (`always`, `never`, `the only`, `one source`, and any
comment carrying a number) found **three more, and all three were the COMMENT
lying about correct code**, which is the dangerous direction: the next person
fixes the code to match.

| the comment said | the code does |
|---|---|
| `a pitcher under CON 70` | reads `pitcher.pit` |
| `windup for the first 65% of travel, release for the last 35%` | backwards on both halves: the windup is before the travel, the release is its first third |
| `Rabid Dog always swings` | 0.95, deliberately, so he can still take ball four |

The CON one matters most, and it is the exact confusion the bullpen note was
written to kill: **CON is a batting stat** that stood in for an arm nobody had
until every character got a pitching rating.

**What the guard asserts is the half that can drift silently.** A checker cannot
read English, but it can read a stat name out of the shipped source, and it can
test a structural claim: every character has a sprite with every pose (there is no
fallback path), and the higher seed hosts across thirty seeded brackets.

### The run environment is 4.5 runs a nine, and four harnesses said otherwise

```
node mythiball/check-runs.mjs         4 games an arm, about half an hour
node mythiball/check-runs.mjs 2 fast  a quicker read
```

**It is not broken and never was.** Measured through the real swing AI, with the
game's own line score: **about 5.5 runs a team over nine innings** against the real
game's 4.5. Six games, all going the distance: 3, 3, 5, 1, 6 and 4 in six innings
each, 22 runs in 36 innings.

**QUOTE THE POOL, NOT A RUN.** The first four games came out at exactly 4.5 and
that was written down as the answer, because a sample landing on the real world's
own number reads as confirmation. The next two came out at 7.5 on identical code.
Per game the spread is 1.5 to 9.0 a nine, so four games is not enough to call a
tenth of a run and this file should never carry one. What the sample IS good enough
for is the only question that was being asked: whether scoring is broken. It is
not.

It took five attempts and the first four were instrument faults, so the checker
exists to stop anybody spending a sixth.

**THE FAULT THAT HID IT IS WORTH READING BEFORE WRITING ANY HARNESS HERE.** A
fielding window nobody answers does NOT resolve as a neutral out. The grounder
window's timeout is `setTimeout(() => finish(-1), duration + 20)`, and `t = -1` is
further from ideal than `yellowHalf`, so it lands in the **error** branch: the
batter reaches and every runner moves up. The fly window expires as a **miss** the
same way. So a harness that presses nothing boots every routine ground ball and
drops every catchable fly, all game, every game.

Measured, that one omission WAS worth **27 to 32 runs a nine against 5.5**. It is
the whole of the difference. (Those two figures are the old game, kept as history:
once an ignored window became a single rather than the worst outcome it had, that
arm fell to **15.8**. Re-measure it after anything that touches an expiry, because
that is what it measures.) The samples that ended 0-18, 2-19 and 0-20 were not a bad
bat and not a broken run environment, which are the two answers this was stuck
between for months. They were **a defence with its hands tied**, which is a third
thing neither of those names.

**TWO HARNESSES AGREEING IS NOT EVIDENCE.** A tracker doing its own counting and
the game's own line score both reported the same wrong answer, because they shared
this defect rather than because it was true. What broke the tie was changing the
harness rather than adding another one.

**Only the CPU's runs count**, and the first draft of the report did not do that.
The player's side never swings in these harnesses, so it scores zero by
construction, and averaging a real team with a non-participant halves the answer:
it printed 1.5 for a defence that had conceded 3.6. The CPU is the AWAY side,
because `startGame` runs with `youHome` true.

The robbery is deliberately left unanswered, because a miss there costs nothing by
design and playing it would flatter the defence instead.

**What this does to the send gate.** A runner scores from second on a single 24% of
the time here against about 60% in the real game, and two thirds of that gap is the
`spd >= 75` gate deciding who even tries. That read like a number waiting to be
loosened, and the old note here said to measure the run environment before touching
it. Measured: scoring is **already at or a little above** the real game's figure.

**THAT GATE HAS SINCE BEEN LOOSENED ANYWAY, AND THE ARGUMENT IT OVERTURNS IS WORTH
KEEPING.** The note used to finish "sending more runners pushes it further up rather
than correcting anything", which is correct arithmetic and the wrong target: it is
measuring an arcade game against MLB and calling the distance an error. A backyard
game is a HIGH SCORING game, so a run environment a little over the real one is
where this wants to sit, and the send gate was the one place it was quietly under.
See the gate's own section above for what moved and what it cost. **The lesson is
not "ignore the real figure"**: it is that the real figure is a landmark and not the
target, and which side of it to sit on is a design call that has to be written down
rather than inferred from how close a number is to 4.5.

It needs more games than you think to see any of this: the per game spread is 1.5 to
9.0 a nine, so a tuning move worth half a run is invisible under about twenty, which
is what `--jobs` is for.

**Re-measured after the gate came down and the contact retune landed: 6.2 a nine**,
game by game 1.5 to 12.0 over eight games. Both changes push scoring up and both
were meant to, so up is the result rather than a surprise; what it confirms is that
neither ran away with it. Eight games cannot call a tenth of a run, so read that as
"a little over where it was" and nothing finer.

What `calibrate.mjs` independently says, and it agrees: the contact model is not
broken either, at roughly 9 or 10 hits per 27 balls in play at both tiers.

### Twenty games is the sample, so the harness runs them at once

```
node mythiball/check-runs.mjs 20 fast --jobs=4
```

A five inning game at Fast is about eight minutes of WALL CLOCK and **almost none of
it is work**: the cost is the game's own beats, which are `setTimeout` waits. So
twenty games serially is hours of a machine waiting, and the honest way to get the
sample is to run several pages at once rather than to hurry any one of them.

**A harness-only speed below Fast was the other option and is refused.** It would
change the very timings the measurement runs through, which is how four of the five
earlier attempts at this number went wrong. Four pages waiting on their own timers
are four identical games; one page waiting on a shorter timer is a different game.

**What has to be watched is the rAF watcher that plays the fielding windows.** It
fires on a `setTimeout` at an exact millisecond, so a starved page could miss windows
and quietly take the defence's hands away again, which is the exact defect this file
exists to prevent and which reads as a broken run environment rather than as a broken
harness. It is measured rather than assumed: **`windows played` is printed on every
run**, so a starved run is visible in the report itself.

**A serial and a parallel run must load the same build.** The pages read
`mythiball/index.html` off disk at `goto` time, so an edit landing between the two
arms compares two different games and reports it as a harness difference. An
in-flight comparison was thrown away for exactly this reason.

**Measured on four pages at once: 101 fielding windows played across 8 games**, so
the watcher is not being starved. That is the number to read before trusting any
run this file prints.

**A RESTART HAS TO WAIT ON THE GAME, NOT ON A CLOCK.** Every SECOND game on each
page came back `0 in 1` in the nobody-fields arm: a fresh game already over, at
inning one, with nobody having scored. It waited a fixed 900ms after restarting
and then read `over`, which in the window before the restart settles is still the
FINISHED game's flag. The loop broke instantly and the box was then read off the
new game, so a one inning nothing was filed as a real row, four times, inflating
that arm.

**It is the harness and not the game, and that was driven rather than assumed.**
The obvious reading is the bug class this file already carries (a timer firing
into a game that is not its own), and it is the wrong one: a probe that ends a
game by mercy, by an ordinary finish and not at all, then restarts, gets a live
game every time. Only the arm that MERCY-ends ever showed it, which is what made
the game look guilty. Worth remembering before the next "0 in 1" is read as a
mode that broke.

### The swing's own curves, and what skill actually buys

```
node mythiball/check-bat.mjs
```

`calibrate.mjs` measures the pitch duel as RATES: how often a swing whiffs, fouls or
puts the ball in play. What it cannot see is the SHAPE of the function underneath,
and `swingGeometry` is pure, so it can be swept directly the way `sendOdds` is.

It walks timing and aim across all three swing modes, asserts worse never helps,
asserts the mode ordering (contact widens the window, power narrows it) and that a
better CON both reaches further and makes better contact on the same imperfect
swing. Then it drives 400 real swings a row through `resolveSwing` and reports
against bands, with the error expressed **in units of the window** rather than in
meter units, which is the fix for its own first draft: measured against the meter,
three of four rows came back at 100% and the check certified nothing.

**What it found is a property worth knowing before tuning any of this.** The timing
window is close to BINARY: inside it you connect essentially always, outside it you
mostly do not. So skill does not live in whether you connect, it lives in contact
QUALITY, which falls 0.99 / 0.74 / 0.45 / 0.08 across perfect, sharp, ordinary and
blind swings. That is the backyard shape rather than a fault, and it is why the
whiff dial below moves contact quality very little.

**Its monotonicity check passed on everything until it was proved to have teeth.**
The first draft multiplied by a direction term in the wrong place and flagged every
healthy curve, which is the safe failure; the version that ships was checked by
reintroducing a seam.

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
node hoops/check-board.mjs        the leaderboard, in a browser, in every state
node hoops/check-live.mjs         the game you play yourself, and its fit
node hoops/check-bracket.mjs      the playoff bracket, and the field it draws
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

### Three doors, and one of them was already built

| | the wheel | what it is |
|---|---|---|
| the league | season and club both spin | the game |
| One Franchise | the club is held, the year spins | a history exam about one club |
| Decades | both spin inside one era | six men who could have met on the floor |

**Decades needed no engine work at all, and that is the lesson.** `ERAS` has been
in `engine.js` and the era filter has been in `drawable()` since the day `run.js`
was written, and nothing on the page could ever set one. A whole mode, shipped,
exercised by the fixtures, unreachable. Same shape as the football game's Dynasty
leaderboard that rendered perfectly and had no way in: **look for the door before
building the room.**

**A LOCK OF ANY KIND HAS TO REACH THE RESERVE FLOOR.** `cheapestForSlot` reads the
200 cheapest men per position across all 16,057 rows, and in a restricted run not
one of them may be drawable. Left alone the floor promises a $2.2M centre off a
club this run can never spin, the budget reads bigger than it is, and the draft
strands itself at the last slot with no legal player at any price. **Nothing
throws**: `sign()` refuses and the player is left on a board of greyed names. One
filter answers both locks (`lockedPool`), so neither can be the one somebody
forgets.

What that turned up is worth not re-deriving:

- **The club lock moves the floor and the era lock does not.** 36 of 180 club
  readings differ from the league's; **0 of 36 era readings do**, because a decade
  holds 1,252 to 3,696 rows and 34 to 121 men priced at the minimum, at every
  position, so the six cheapest legal bodies cost the same 6 x $2.0M either way.
  `verify.mjs` asserts the zero rather than a difference that is not there.
- **It stops being defensive the moment the two COMPOSE.** The Lakers in the
  eighties floor at $19.9M against the league's $12.0M.
- The club sweep also asserts the locked floor is never UNDER the league's, and
  that the two pools actually come apart. A sweep that only asserted thirty drafts
  finish would pass on the unlocked floor and report green on the exact defect it
  was written for. Same lesson as `check-fullteam`'s replaced reading.

**One Franchise kills chemistry as a decision and that is accepted, not missed.**
Everybody on a locked roster shares the club, so the franchise link fires on every
pair and the bonus sits at **+2.30 of a possible +2.50** whatever gets drafted,
measured over 360 runs across all thirty clubs. Best-available finishes **46.8
wins against 42.0** off the whole league. Decades does not have this: chemistry
there runs +0.67 to +1.13 and still has to be gone looking for. The how-to says so
on the page rather than leaving somebody to wonder why their Celtics team rates
high.

**So every mode keeps its own best.** `c.byClub` and `c.byEra`, never mixed into
`bestWins`. The spread between decades is bigger than the One Franchise gap:
best-available takes the seventies to 49.6 wins and the aughts to 40.7, which is
nine wins between two modes wearing the same word, and one shared record would
retire the league best to whoever picked the shallowest priced era.

**The span in the constant is not the span in the file.** `ERAS.seventies` is
`[1970, 1979]` and the data starts in 1974. `R.eraSeasons` reads the same list
`drawable()` filters, which is the only honest span; the same rule put
`R.clubSeasons` behind the club picker rather than the founding year, which would
have promised twenty-eight seasons of Celtics that do not exist.

**`E.team()` cannot be an existence check and one was written against it.** Its
last fallback returns `{ name: code }`, so `team('NOPE').name` is the truthy
string `'NOPE'` and the guard passed for every string there is. An unknown club
would have silently emptied the wheel. `hasTeam()` is the gate.

### The draft board lost 1,289px on every spin

Measured at 390x844 and 360x740. `drawInto` emptied `#tabs` and `#opts` before the
reels started, so the page collapsed to the height of a reel and grew back a beat
later: **the court under the board jumped 1,554px up the screen and back down, six
times a run** plus every re-spin. Nothing threw and no check in the repo could see
it. It was most of what "the draft does not feel clean" was.

**The height is a property of the board and the board is already decided.**
`run.js` resolves the draw before a single frame animates, so the real tiles go up
at once and the page settles before anything moves. What is held back is the
READING of them, which is what the reel is for: `visibility:hidden` over a shimmer,
because it is the one that keeps the layout box exactly. A skeleton of fixed-height
placeholders was tried first and **cannot** be exact, since a tile with an award row
is 26px taller than one without. Court movement is 84px now, and what is left is
the honest difference between two boards.

Three things that were repeating the answer rather than adding to it, all found by
reading one screen at 390px:

- **"2011 Spurs" on every tile.** A board is one team-season, so that line said the
  same words as the two reels directly above it, once per player. What is there
  instead is the chemistry a signing would ADD, named rather than counted.
- **The club note under the reels, under a lock.** `teamNote` is the same founding
  year and title list six picks running. In a locked run what changes is the
  SEASON, so what is said is whether they won it.
- **"SIGNABLE" alone over ten signable players.** A divider only earns its line when
  there is something on the other side of it.

### It did not say what it was

Driven beside The Perfect Season at 390px, the difference on a first visit is not a
feature: the NFL game opens with a card headed FIRST TIME HERE, three numbered
steps, a stated goal and an arrow reading START HERE. This one opened with a wheel.
It has the same guide now, once per browser, on the front page only.

**It points at the button and leaves it live.** The scrim stops at the top of the
dock, so the way out of the guide is the thing the guide is telling you to do.
Anchored to the dock rather than measured against the page, because `--dock` is
already measured on every render and the target is pinned.

Two defects the harness caught that looking would not have:

- `inset:0` covers the dock whatever the scrim does, so with pointer events on the
  wrapper **the Start button was not the element at its own centre**. A screenshot
  shows an arrow over a button and nothing wrong; `elementFromPoint` says otherwise.
- Centred at `62vh`, the panel's own text scrolled inside itself at both widths. **A
  guide whose explanation is below its own fold is worse than a terser one.**

**Every number in it is read out of the constants and the data.** The cap has been
swept twice in this game's short life. The first draft of step two said a star costs
half the cap, which is false: the top price in 16,057 rows is Bob McAdoo's 1975 at
**$60.0M against $126M**, and nobody is over half. It prints the real dearest man.

### A box score is a DECOMPOSITION of the scoreline, never a second model

You draft Jordan's 1996 and until this shipped nothing anywhere told you what
he did in any of the 82. The playoff games were the worst of it: `playoffSeries`
has always returned its individual games and nothing ever drew one, so a run
that ended 3-4 in the Finals gave you the series score and not one thing that
happened in it.

Every game opens now: quarters for both sides, and a box score for your six.

**The load-bearing decision is that `resolveGame` still settles the score and
these lines are apportioned to hit it exactly.** A possession sim that DECIDED
the score would replace the win-share model fitted to twenty-two real NBA
records, and every TARGETS band would need re-solving. And two models of one
game disagree: verify already caught the animated season and the instant season
producing different records off one seed. So nothing downstream reads any of
this, and **the one property it must have is that it adds up**. Six identities
are asserted over a real season: the points column IS the scoreline, a man's
field goals and free throws produce his points, nobody makes more than he takes,
the minutes fill the game, the quarters are the scoreline, and a game that went
to overtime was level at the end of regulation.

Three things the measurement found that reasoning did not:

- **The league shot 59%.** Two scale-ups were folded into one term. Six men
  covering 240 minutes absorb a whole bench's shots, which is real extra WORK
  and passes into attempts in full; a hot night is mostly efficiency and only
  partly volume. Separated, the league shoots 46.3% against a real 46%.
- **The minutes column added to 153 of 240**, because it printed `mp`, which is
  his minutes in a ten man rotation. A box score saying six men played two
  thirds of the game and scored all of the points is arguing with itself.
- **`PTS_SD_K` is not what makes this concentrated.** Swept 1.45 to 0.55, the
  leading scorer's share moved 34.9% to 32.2% and the median game high moved 41
  to 38. **The concentration is the premise and no constant fixes it**: the dial
  is the roster size, and that is the game. It is set for the TAIL alone.

**`apportionCapped` was wrong on 73% of inputs** and the minutes needed it. It
pinned the over-cap men and the under-floor men in the same pass, which throws
away the redistribution between them: weights `[1,1,1,32,27,26]` over 240 pinned
three at the floor and three at the ceiling, arrived at 198, and had nothing
unpinned left to give the other 42 to. **One side per pass.**

**No box score for the opponent, deliberately.** The schedule knows which real
club you played and the sim never used their players: an opponent here is a net
rating. Five invented lines for five real men, printed as this game's own
record, is the one thing on that screen that would not be true.

**Each game draws off the run's seed and its own address**, never a shared
stream, so opening game 41 twice shows the same 41 points, a reload does not
rewrite history, and drawing a SCREEN never moves the season somebody comes back
to.

**A box score nobody opens is a box score nobody has**, so the run names its own
best night on the results screen and links to it. Asserted against a brute force
sweep rather than against itself, because an off-by-one would name the second
best game and nothing would look wrong.

### A field the page reads off an outcome has to be a field outcomes have

`out.spendLeft` was read on the results screen and `outcomeOf` has never set it.
`undefined > 15` is false, so on **every run this game has ever played** the branch
behind it was dead and the cap advice, which is the central lesson of the whole
game, never once appeared: a draft that finished $88M under was told its roster had
no shape instead. Nothing threw, nothing rendered wrong, and no check could see it.

So `verify.mjs` builds a real outcome and asserts **every `out.<field>` in the page
is one of its keys**. The whole class, not the one name, and proved by mutation.
Two things about writing it:

- **Its first draft failed on the COMMENT explaining the fix.** Block comments come
  out before the scan now. Third time an extractor in this repo has read a comment
  as code.
- **The scan asserts it found something.** A regex that matches nothing passes,
  which is `check-numbers`' coverage argument in one line.

Two more on that screen, both found only by looking at it:

- **One fact, three times.** "3 wins short of the play-in" was the gauge's big
  number, the gauge's sentence, and the story line under the record. The gauge is
  how it ENDED; `seasonStory` is the season's SHAPE. They cannot collide now
  because they are never about the same thing.
- **"1404th of 1403 all time".** `nationalRank` INSERTS your roster into the table
  of real team-seasons, so the denominator has to count it. Visible only on a
  deliberately terrible draft; the top end read "1st of 1403" and was wrong by the
  same one without looking like anything.

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

### Today's run, and the one mode that gives two people the same question

The other three doors are the same game with the wheel constrained. This one is
the same game with its SEED pinned to the date, so everybody who plays on a
given day gets the same six spins and two records are comparable for the first
time in this game. `run.daily` is the day number and it rides in the run, not in
a page variable beside it: a draft resumed tomorrow and filed against today
would overwrite a result somebody set for a different puzzle.

**The day rolls at Eastern midnight**, which is what every other calendar-day
clock on this site already uses. UTC rolls at 7 or 8pm Eastern, which takes the
puzzle away in the middle of the evening somebody is playing it, and the
visitor's own midnight gives two people in one group chat different puzzles on
the same night, which is the whole thing this mode is for. `easternISO()` asks
`Intl` and **falls back to the local date rather than throwing**: a browser with
no time zone database answers the wrong puzzle, and a browser with no game
answers nothing.

**`dayNumberOf` does its arithmetic in UTC on purpose.** Two local midnights are
23 or 25 hours apart across a clock change, which floors to the wrong day twice
a year and hands two players different puzzles with nothing anywhere throwing.

**The epoch was written as the UTC date and was a day out.** Day 1 read as day 0
for most of its own evening, and only `Math.max(1, ...)` made it look right. A
clamp is a guard against a wrong clock, not a place to keep an off-by-one.

**One a day, and the guard is on the DAY rather than on the count.** Replaying
today is refused by `dailyRecord`, because a second attempt at the same puzzle
is a different game from the one everybody else played. **There is no anti-cheat
beyond that and there should not be**: abandoning a draft mid-run leaves the day
open, so somebody who wants to see the board twice can, and with no server and
no leaderboard the only person they are beating is themselves.

**One day is not a streak.** Every first-time player finished the daily and was
handed a gold "1 DAY" for having played once, which says nothing and devalues
the number on the day it starts meaning something. The door shows it from two,
and only while it is still alive: a count that ended last March is a fact about
March, and printing it beside today's door reads as a claim about right now. It
survives today being UNPLAYED, because a streak breaks on a day missed rather
than on a day not yet played, so yesterday's run is what it stands on.

**The streak mark on the results screen is read off YESTERDAY.** `bestsSet` runs
before `dailyRecord` files today, deliberately and as three separate statements
rather than as fields of one object literal, because otherwise the whole thing
depends on property evaluation order, which is a rule nobody should have to
know. Read after, every mark in that function is a tie rather than a beat.

#### A shared result has to say which game it was

`drawShareCard`'s tagline was the literal `Six NBA seasons, one cap, 82 games.`,
which is false for One Franchise, false for Decades and false for the daily.
**That is the football card's fallthrough arriving a fourth time**: its own
section above records "Classic Mode. Six spins, one roster" surviving three
modes, because a literal has no branch to forget.

`cardTag(r)` derives it, `shareText` puts the mode in the FIRST line (which is
the line a chat app shows as a preview), and `shareDare` gives the daily its own
question, because every other dare asks somebody to go and play a game and this
one asks them to play the SAME six spins, which is the only dare here with one
answer.

**The defence is not a fourth branch, it is that no two modes may share a
tagline.** `verify.mjs` asserts all four are different and that no locked mode
falls through to the league's, so a fifth door cannot inherit the fourth's
words either.

#### A badge earned in silence is a badge nobody has

`badges.js` computes forty-odd badges off the whole career and the only surface
it had was a tab inside a sheet, so a badge was earned invisibly and found weeks
later by somebody who happened to look. `recordRun` answers with what the run
CHANGED now, and the results screen draws it second, above the playoffs.

**Nothing stores "earned", by design.** Every badge is derived, which is what
makes the cabinet retroactive and impossible to lose, so the only way to know
what a run earned is to ask the same question either side of the write. `before`
is a second `loadCareer()` rather than a copy, because that function JSON-parses
on every call and the two objects are therefore independent.

**It is kept on the run rather than shown once.** It is a receipt and not a
notification: somebody reopening a finished season should still see which badges
that season lit, the same way they still see its record. Recomputed on the
results screen it would answer "nothing new" every time, correctly, because the
career already holds all of them.

**A first run sets no record**, and neither does a first run on a club or in a
decade. It is trivially the best of one, and a screen congratulating somebody
for beating nobody is the unearnable badge in reverse.

#### Run it back means the same game, and two buttons could not keep that promise

The results screen's Run it back really does replay the mode. **The daily is the
one game that cannot be run back**, so after one it says what it actually does.
And the front page's Start button is wired to `startRun` with no arguments, so
it has always been the whole league whatever was played last: it said "Run it
back" after any finished run, which was true while the league was the only mode
and became a promise it cannot keep the day the doors went in.

**The other doors are on the results screen now**, which is the screen a player
is on at the moment they will take another one, and was the one screen with none
on it. Whichever mode the run WAS is left out, because Run it back is already
that button directly above and offering it twice makes two controls out of one
decision.

#### The guards lift the real functions out of the page

`verify.mjs` brace-matches `cardTag`, `dayNumberOf`, `dailySeed`, `dailyRecord`,
`freshBadges`, `bestsSet` and `shareDare` out of `index.html` and drives them.
**Never a copy of the arithmetic**: a second implementation agrees with itself,
which is exactly what mythiball's send curve did for as long as its sweep
carried a hand-written duplicate of the curve it was sweeping. The list of names
is itself asserted, because a reader that finds nothing lets every assertion
below it pass green, which is how an extractor in this repo has been silently
wrong three times.

**The day walk runs in a child process under `TZ=America/New_York`.** It has to:
the claim is that the arithmetic is immune to a clock change, and on a CI
machine running UTC the broken version passes. Proved by reintroducing it.

### The leaderboard, and why there are four of them

```
node hoops/check-board.mjs                        the page, in a browser, in every state
createdb hoops_board && psql -d hoops_board -c 'create role authenticated; create role anon;'
psql -d hoops_board -f supabase/test/hoops_board_base.sql
psql -d hoops_board -f supabase/108_hoops_leaderboard.sql
psql -d hoops_board -f supabase/test/hoops_board_test.sql
```

`supabase/108_hoops_leaderboard.sql` is 50_football_perfect_season.sql's SHAPE
and not its copy. The two games agree on what a leaderboard is (a table only a
security-definer function may write, every derived field owned by the server,
RLS read for everybody, one index per query the client actually makes) and
disagree on every number in it, because one plays 17 games and the other plays
82. Read that file's header for the argument this one inherits.

**FOUR COMPETITIONS, NOT ONE BOARD WITH A FILTER, and the two locked ones are
scoped again by key.** That is measured rather than tidy, and the measurements
are already in this file: One Franchise pins chemistry at +2.30 of a possible
+2.50 whatever gets drafted, so best-available finishes 46.8 wins there against
the league's 42.0, and the decades are nine wins apart for the same drafting.
One board would retire the record to whoever picked the deepest franchise or
the shallowest era, and every number on it would still look reasonable.

**`lock_key` is one column and not two.** A club and a decade are mutually
exclusive: every door sets one or neither, and a run carrying both is refused
rather than stored. Two nullable columns would need two more indexes to answer
the same two questions, and would allow a row whose mode says club while its
era column is populated, which is a state no reader would know what to do with.

**The losses are the regular season's alone, which is where this differs from
the football table.** A round here is a SERIES, so a bracket loss is four wins
and three losses for somebody and the games it took are in nothing the client
sends. 58-24 is the record a basketball fan means, and putting playoff series
into the win column would make every number on the board unreadable against a
real team's.

**A pick is the engine's own `pkey`, `<id>|<season>|<CLUB>`, and the club has
to be in it.** The football table stores `<id>:<season>` because a player has
one row a year there. Here **755 of 16,057 rows are a player traded
mid-season**, who has a row per club, so id and season together name two
different half-seasons at two different prices. Dropping the club would have
made those rosters unrenderable and the two halves indistinguishable, on 5% of
players, with nothing on screen to say which one it picked. It is `E.pkey()`'s
format exactly and not a wire format translated at each end, because the client
looks a row up in the map it already keys by that string.

#### The migration hardcodes the engine, and the drift is silent

Eight constants are literals in the SQL, on purpose, so the file can be read on
its own and pasted into an editor with no dependency. The comment over them
said "MUST MATCH hoops/engine.js CONSTANTS" and nothing made that true.

**It fails in the worst direction.** Move `TOP_SIX_WINS` in the engine and the
game starts producing seasons the server labels with the other seed, or refuses
outright for a bracket that is now the wrong length. The page fails soft, so a
refused run resolves to null and the screen says the board is not reachable: a
live, correct game whose leaderboard quietly stopped accepting anything,
reported by nobody, because that is exactly what a board looks like before the
migration has been run. `verify.mjs` holds all eight, the slot list, the four
modes, and the daily epoch, which lives in two files because one is deployed by
hand and the other by a push.

**The score is computed twice and has to agree twice.** `board.js` recomputes
the stored generated column locally, because the results screen counts the runs
ahead of you before the insert has come back: a client that shifts a
differential differently from the column counts against a number that is in
nobody's row. Swept over every (wins, differential) pair rather than spot
checked, along with the property the shift and the clamp exist for, which is
that one more win always outranks any differential.

**Postgres rounds a half AWAY FROM ZERO and `Math.round` rounds it toward
positive infinity**, so `round(-7.55, 1)` is -7.6 and `Math.round(-75.5)/10` is
-7.5: one whole step of the score column, on any season with a negative
differential landing on a half. `roundTo` is lifted from `cfb/board.js`, where
it was found.

#### A board has four states and three of them ship broken

Unreachable, nobody has finished a run, and you have not finished one. Each
needs its own sentence, because a blank box is how a feature teaches somebody
it is broken and a spinner that never resolves is worse. On a game this new
"nobody yet" is the COMMON case, so it says being first is the prize rather
than apologising. That is the commissioner standings' lesson arriving here, and
`check-board.mjs` asserts the four sentences are four different sentences.

**A missing migration is told apart from a bad network**, because the remedy is
different and only one of them is worth waiting out.

**THE GAME OUTLIVES THE BOARD**, which is the point of every soft failure in
`board.js`. A run finished against a database that has never seen the migration
still plays, still records in the career and still lights its badges, and the
only thing missing is a row on a list. The last section of `check-board.mjs` is
that assertion, and it is the one that would catch somebody making the board a
dependency.

#### The version pair, again, and this is the silent one

`NEED_BOARD` in the page against `BOARD_API_VERSION` in `board.js`. A stale
`?v=` fails loudly. This one falls through to a stub that answers null to
everything, so a `board.js` a version behind degrades to "not reachable" and
looks exactly like a bad network day. **The football game shipped exactly that
for a release**, and the section above on `BOARD_VERSION` tells the whole
story. `check-cachebust.mjs` found this pin on its own, by who SETS the global,
and there are eight pins across the site now.

#### Accounts are the site's, and nothing here is a gate

`hoops/auth.js` adds NO new account system: `profiles` from
`supabase/10_accounts.sql`, the same providers, the same default supabase-js
storage key, so signing in here signs you in on the football and college games.
It deliberately has no premium anything, because this game has no paid tier,
and the four purchase functions in `cfb/auth.js` are not stubbed here either: a
function answering "you own nothing" is a door one line from being opened.

**The display name is never sent.** `rtf_submit_run()` reads it out of
`profiles` for `auth.uid()`, and the test asserts structurally that the
function has no argument that could carry one.

**A run finished signed out is claimed on the way in**, from two places: the
submit itself, for somebody already signed in, and the auth callback, for
somebody who signs in afterwards. The id rides in the saved run, so it survives
the reload a Google redirect puts in the middle of it, which is the case that
would otherwise lose every name.

#### Three things about the harness, and two of them cost an hour

**`content-range` is not a CORS-safelisted response header.** PostgREST returns
the exact count there, and a cross-origin stand-in that does not name it in
`Access-Control-Expose-Headers` hands the page a response whose header
JavaScript cannot read. `countOf()` then answers null, every count comes back
as "no opinion", and the standing reports the board unreachable while the LIST
beside it renders perfectly: a harness fault that looks exactly like the defect
the file is written to catch.

**Waiting on the roster to grow is a race, and waiting a fixed 700ms is the
same race.** The roster grows INSIDE `sign()`, which spins the next board a
beat later (`setTimeout(spin, 240)`), so a wait that fires on the roster
returns while the board on screen is still the one just signed from. The next
pass clicks a tile off a board about to be replaced, two signings land against
one draw, and the draft stalls with an empty board and no way on but the Spin
button. The wait is for the next board to be up and readable: the roster has
grown, there is a fresh draw, and the tiles are out of `pending`. A slower loop
never hits it, which is why it took three drafts of the file.

**An assertion that could only pass.** "The sheet opens on the run's own board"
was checked against a LEAGUE run, and `lbMode` defaults to the league, so
deleting the line that reads the run passed green. It plays a Decades run now.
The same trap caught the second path a second time: opened once from the
standing, `lbMode` is already the run's board, so the front page would land
there whether or not it looks at the run at all. That check reloads first.

### The bracket, and the field it draws around you

```
node hoops/check-bracket.mjs            the arithmetic and the screen
node hoops/check-bracket.mjs --quick    the arithmetic only, no browser
```

The postseason used to be a list of rows: one line a round, the round's name,
what the opponent played like, and WON or LOST. Correct, and it is a receipt
rather than a bracket. `s-brk` is the football game's `s-nbrk` in this sport:
sixteen seats in the NBA's shape, a **fixed** tree (1/8 meets 4/5, 2/7 meets
3/6, no reseeding, which is the real rule and is simpler than the NFL's),
walked forward a round at a time with the other games flipping to their
winners one after another and the player's held back.

**IT DECIDES NOTHING.** The opponent each round is a net rating drawn by
`poBeginRound`, and the whole postseason is fitted against the title rate of
every team-season in the data. A bracket that picked the opponent instead
would quietly rebuild the difficulty curve. What is drawn here is the field
AROUND that path, and the fourteen games the player is not in are simulated
for the reveal alone.

#### It names nobody, and that is this game's rule rather than a shortcut

The football bracket prints real clubs because there the opponents ARE real
team-seasons off the difficulty ladder. Here they are not. The results screen
has said "played like a 58 win team" since the day it shipped, for the reason
written over it: printing "the 1996 Bulls" over a number the model rolled
tells somebody they beat a team that was never in the room. **A bracket of
real names would be that mistake fifteen times on one screen.**

So every seat is a **seed and a record**, which is how an NBA bracket reads
anyway, and no seat is a claim about anybody who ever played. `check-bracket`
reads the seat painter's own source for a reach at `nickname`, `franchise` or
`teamName`, and reads every seat off the rendered page for anything that is
not a record, the player, or TBD.

**THE TWO NUMBERS ARE KEPT APART, DELIBERATELY.** A seat's record is the
FIELD's shape: what a 3 seed won. The strength the engine actually drew is
what you are playing, and the draw is deliberately wide (`TITLE.SERIES_SD`),
so the two disagree and should. The seat carries the seed and the note under
the rail carries the form: **"The 3 seed, playing like a 58 win team."** One
sentence, two facts, neither pretending to be the other. Read as one claim
they would make the bracket look like it was lying about its own seeding.

That note is read off `run.po.cur.oppNet` and never off the pending game,
which answers with the points and the home court, meaning the rating already
converted for this matchup.

#### A column is empty until the round that feeds it has been played

**This shipped in the first draft and it is the whole reason the file has a
spoiler section.** Every decoration game is decided the first time its pairing
is asked for, and a first round's pairings are SEEDS, so they exist before a
ball is thrown: the conference final column named the 5 seed while the first
round was still being revealed, which tells a reader who wins their own
semifinal before their first round is over. A perfectly rendered bracket,
reading ahead.

The seats know their teams either way. `brkKnown()` only governs whether they
are DRAWN, and TBD is what an unfed seat says.

**THE FIRST ROUND IS ALWAYS KNOWN, and gating it behind the play-in was the
second version of the same mistake.** A play-in run arrived at a bracket of
sixteen TBDs with one game in front of it. The play-in feeds exactly one SEAT,
so that is handled a seat at a time (`brkSeatIn`) rather than by hiding seven
games whose pairings are seeds.

#### The column is built around the player's own record

A worse seed showing more wins than a better one is a bracket arguing with its
own seeding. Per-seed bands cannot promise that, because the player's record
is the one number in the column that is not ours to choose: the engine lets a
43 win run into the play-in, which sits under any band written for an 8 seed.

So `brkColumnWins` **anchors on the player's seat** and spreads everybody else
away from it, upward for the better seeds and downward for the worse.
Monotone by construction, swept over every anchor a run can arrive with, and
asserted again off the rendered page because the two halves of that claim (the
arithmetic and what is printed) are different questions.

**A play-in run is the 7 seed**, and both halves of that come from one place:
`seedFromRecord` is what decided there would be a play-in round at all, so
reading `bye` rather than the win total again means the seed and the schedule
cannot come apart.

**THE SEAT THE PLAY-IN FEEDS HAS THREE ANSWERS AND ALL THREE ARE NEEDED.**
`brkEntrant` is asked once, in the field, and everything above the first
round is fed from it: a substitution made in the painter instead would seat
the right club in the first round and carry the wrong one into the semis.

| the play-in is | the seat holds |
|---|---|
| not decided | nobody, because the first round drew the player into a seat while the game deciding whether they are in it was still on the screen above |
| won | the player |
| LOST | whoever beat them |

That last row is what lets the field finish. Without it a play-in loss left
the seat empty, so every round after it stayed permanently TBD and **the
postseason the player had just been knocked out of never happened at all**.
It is also what the real bracket does.

**The play-in is ONE box, because the engine's play-in is one game.** The real
thing is four games over two nights and drawing that would be a picture of a
tournament the run never plays. Its opponent carries a record and **no seed**:
the winner is the 7 seed, so neither side is one yet, and a chip reading 8
beside a first round column that also has an 8 would be two different clubs
wearing one number.

#### What moves, and what it costs

The whole field is redrawn on every step, which is what the football bracket
does and is fine here for the same reason: it is sixteen seats of text. **So
the animation cannot live on the seats.** A keyframe on `.brk-t.won` would
replay for every settled seat on every step, because innerHTML builds a new
node and a new node starts its animations over. Exactly one key is marked
`just` at a time and only `.just` carries the flip, so the game that has this
moment is the only thing moving.

The live ring is a pseudo-element on transform and opacity rather than an
animated `box-shadow`, so the one thing looping on this screen costs the
compositor and not a repaint.

**The reveal is the same length whatever the round is.** A first round is
eight games and a conference final is two, so a fixed step makes the first
round four times the wait for the same beat: the step is `2400 / games`.

**Nil apiece prints nothing.** A series that has not tipped off showed a 0 on
both seats, which is two numbers saying the same nothing on the one box the
reader is watching. A 0 beside a 4 is a sweep and stays.

**The bracket finishes without you**, and that is worth the beat. A run that
goes out in the first round has watched a field it is now not in, and walking
the rest of it out says what the postseason did rather than stopping the
screen the moment the reader stops mattering to it. `check-bracket` drives
that over 320 runs, out at every round including the play-in, and asserts
somebody is holding the trophy and that it is never the player who went out.

#### Two things about its guard, and both were the check rather than the page

Both showed up only on a PLAY-IN run, which is the shape the first browser
pass happened not to draw, so both passed green once before failing.

**A pairing with an empty chip is the rule working.** One first round seat is
correctly TBD while the play-in that feeds it is still on the screen above,
and the first draft read `''` as 0 and reported a 7 seed paired with nobody
as a bracket that does not add up.

**"Nothing past the round being played" is the wrong line.** The first round
is always drawn, so on a play-in run the correct first round read as fifteen
seats reading ahead. What must be hidden is everything past the LATER of the
round being played and the first round, which on a bye run is the same column
and on a play-in run is one along.

#### The door moved onto it

A game the series can end in is offered here now, **above the rail**. The rail
is the tallest thing on this screen and it scrolls, so a control the game is
waiting on underneath it is one the player has to go looking for. That is the
live board's own call-box rule, and the guard measures it against a phone
rather than against its own window.

`show()` stops the bracket walk when the screen is left, the same way it stops
the live game and the season reveal, and for the same reason: a bracket
deciding rounds behind another screen is a series that moved without anybody
watching it.

**A reload lands on the bracket**, not on the season screen. `run.po` carries
the whole thing and holds no rng and no player objects, so it survives JSON;
the 82 game strip behind it is a season already played and rebuilding it is a
reveal of something the reader has seen. Rounds already played are drawn
settled, because a bracket that came back as a page of TBD reads as a run that
had not started.

### The court is a hardwood floor, and the club goes ON it

The court on all three screens (the home hero, the draft, the results) was a
flat brown radial gradient with four white outlines over it, which reads as a
DIAGRAM of a court. A floor is what the sport is played on and it is the one
surface in this game a fan already has a picture of.

**Seven background layers, and the top one is a custom property.** The tint is
`--floor-tint` and the six under it are the wood: a varnish sheen, light across
the boards, board to board tone, the seams, the grain, and the maple. The club
rule swaps the TINT and nothing else.

**That is the whole point of the restructure, because the flat version was one
`background` and `body.clubbed .court` replaced it outright.** Do that now and
every plank goes the moment a club reel lands, which is a court that looks
perfect in the state a developer opens the page in and flat for the whole
draft. Nothing throws. `verify.mjs` asserts the club rule sets `--floor-tint`
and never `background`, and both defects were proved by reintroducing them.

**FOUR PERIODS THAT DO NOT DIVIDE INTO EACH OTHER, or it is a barcode.** One
repeating gradient at one period is found by the eye in about a second. The
planks are 6.1%, the board tone is 21.7% and the grain is 1.63%, so no two ever
line up and nothing has to be random.

**The seams were at .30 and the floor was corduroy.** Two sets of vertical
stripes at high contrast stop reading as boards and start reading as cloth.
They are a hairline at .17 now, and the TONE is what separates one board from
the next. The grain is .022 for the same reason: it is a third set of vertical
stripes and is the layer most able to ruin this.

**The boards run away from the reader**, because this camera looks at a half
court from centre with the basket at the top, and a real floor is laid baseline
to baseline. Laid the other way they read as decking.

**Three parts were added as markup and every court needs all of them**: the
apron (`.oob`, the same boards under a darker stain rather than a different
surface), the backboard (`.bb`, three pixels that turn a hoop floating on a
floor into a basket) and the two corner threes (`.c3`, which the arc alone
cannot draw). The guard counts them against the number of courts rather than
naming them, so the next part is covered without anybody remembering.

**The club wash is .42 and was .62, and the difference is measured by looking.**
At .62 a club painted the top third of the floor a solid colour and the planks
disappeared into it, which is the flat court arriving by a different door. At
.42 it is a floor lit in the club's colours. **The layer count and the layer
types are identical in both states**, so the .35s fade between clubs still
interpolates.

### A game seven is not a scoreline

```
node hoops/check-live.mjs            the engine and the page
node hoops/check-live.mjs --quick    the engine half, no browser
```

`resolveGame` samples two totals and `gameBox` decomposes one of them into six
lines. That is the right shape for 82 games and the wrong shape for the game a
whole run comes down to, because there is nothing in it to decide: the score
exists before the first possession and every screen after it reads a number
that was already there.

So an elimination game or a Finals game can be **played**. Possession by
possession, a real clock, a running score, a live box score, and it stops at
the two calls a coach actually makes. **Playing decides it**, which is the
whole point and is also the thing that makes the rest of this section
necessary.

#### It is not a second model, and that is the whole engineering problem

`gameBox`'s header argues at length that a possession sim which DECIDED the
score would replace the win-share model fitted to twenty-two real NBA records,
and that two models of one game disagree. Both are still true. What changed is
that this sim does not get to be a different model: it is **fitted to
`resolveGame`**, so a neutral caller playing a game forward and the resolver
settling the same game are two samplers of one distribution rather than two
opinions about basketball.

The mean is arithmetic: the per-possession scoring rate is solved from the same
`pointsFor` and `pointsAgainst` the resolver is handed. **Matching the spread
is not**, and it is the reason `LIVE.PULL` exists. A possession is worth 0, 2
or 3 points, so ninety-nine independent ones give a game total SD near 11.5
against the resolver's effective 9.02. Left alone, every series played live
would be wider than every series simmed, a seven game bracket would swing more,
and the title rate would move: the one number this game's calibration is
anchored to. So each possession's rate is pulled back toward the pro-rata
expectation by how far the running total has drifted from it, which is
`CONSISTENCY`'s own idea applied inside a game rather than to its total.

**Fitted over four matchups and 10,000 games each**, not one:

| | residual against `resolveGame` |
|---|---|
| mean | +0.2 points, both sides, every matchup |
| spread | within 0.15 of the resolver's 8.9 to 9.1 |
| win rate, calls suppressed | within 0.6 points |
| win rate, the auto caller answering | within 1.3 points |

So **playing is worth about seven tenths of a point of win rate** before the
player makes a single call of their own, and that is the auto caller: two late
decisions the resolver never asks. Recorded rather than compensated, which is
the football forward sim's own note, and it is the right sign. A mode that
asked somebody to play four games and then handed them a worse result than
skipping is a mode nobody should play.

**The win error tracks the spread exactly, in both directions.** A live game
wider than the resolver pushes every matchup toward a coin flip and a tighter
one pushes it away, so one dial lands both, and a fit that got the spread right
and the win rate wrong would mean something else was broken.

#### Two ways it was silently wrong, and neither is visible in an even game

**THE CLOCK MUST NOT DECIDE WHEN THE GAME IS OVER.** The first version ticked a
fixed number of seconds off a clock and ended the game when the clock ran out.
Regulation divides into 198 possessions exactly, so after 198 ticks the clock
sits a hair above zero rather than on it, and the 199th possession belongs to
whoever went first. **That is a whole extra possession for your side in every
simmed game**: +1.3 points and +4.1 of win rate against the resolver, with the
other side landing exact, which is what an asymmetry that size looks like. It
also ran 198 usually and up to 206 sometimes once the clock jittered, so a game
a player WATCHED and the same game simmed were not the same game. `liveTick`
divides what is left by what is left to play, which cannot drift, and the
period ends on the possession count.

**AND THERE IS NO FAST CLOCK.** An earlier draft took a `fast` flag that
dropped the jitter, used by `liveFinish` so a simmed game did not bother
rolling for it. That is a second game: both call windows are measured against
this clock, so an evenly ticking one asks a different set of questions at a
different set of scores. Sim the rest hurries the screen and never the
basketball, which is the football boss battle's rule, and one clock is the
cheapest way to keep it.

**THE PULL IS MEASURED AGAINST A FIXED REFERENCE, NOT AGAINST THE TEAM'S OWN
RATE.** Written `k0 * (1 - pull)` the correction is worth a fixed FRACTION of a
make, so it moves more points for a team scoring 118 than for one scoring 101.
Over four matchups that put a favourite's spread at 8.57 against an underdog's
9.02 on the same dial, mirrored on the other side, where `resolveGame` allows
every team the same 9.02 whatever it scores. **A one matchup fit cannot see
it**, which is why the sweep and the guard both walk four.

#### Which games are offered

A game the series can END in, either way, plus every Finals game. One rule
rather than a list, and the two halves of it are the elimination game and the
closeout. Measured over 170 playoff runs: **mean 2.6 a run, median 2, p90 5**,
and a year that reaches a game seven Finals can offer thirteen, which is the
run that deserves them. The play-in is one game, so it is always one.

#### The bracket is one loop, and it is the loop that already existed

`generatePlayoffs` used to play every round and hand back a finished bracket.
A game the player is going to play cannot be settled before they see it, and
the rest of the bracket after it depends on how it went, so the loop had to
become turnable one game at a time: `poCreate`, `poNext`, `poRecord`,
`poAdvance`, `poFinal`. **`generatePlayoffs` is now four lines over that
runner**, so there is no bracket that only one path can produce. Two of them
would drift the first time a round was added, and the symptom would be a simmed
season and a played one giving one seed two different brackets.

**Proved byte for byte rather than argued.** The rng is drawn in the old order
(the round's opponent, then its games one at a time), and the two
implementations were run over 4,000 seeds: a `live: false` on every row was the
entire difference, so the flag is written only when it is true. `check-live`
asserts the same thing from the page's side, by simming every game through the
new walk and comparing against `playSeason`.

**`run.po` has no underscore**, which is the opposite of everything else
mid-run on this page. A bracket is the one thing a player can be halfway
through for as long as they leave the tab open, because the door waits for
them. Under an underscore, a reload in the middle of a Finals comes back to a
run with a season, no bracket and no way to finish it. So the runner holds
plain data only: no rng, no player objects. **What `outcomeOf` needs is
recomputed and never stored**, because chemistry, fit and the two ratings are
pure functions of the roster and the totals are a walk over a season already on
the run. A second copy of an answer is how a reload comes back disagreeing with
itself.

**A LIVE GAME DRAWS FROM ITS OWN STREAM**, off the run's seed and the game's
address, exactly as `gameDetail` does and for one of the same reasons: the
run's stream is what every game AFTER this one is drawn from, and playing a
Game 7 for four minutes and then finding the Finals drew a different opponent
would look like nothing at all. So simming every game and playing every game
give the same bracket around them, and only the games actually played differ.
A live game in progress is deliberately NOT resumed after a reload: its sim is
a board mid-possession, and rebuilding one from storage would be a second way
to build a game. The bracket comes back to the door and offers the same game
again.

#### The board, and what makes it smooth

Everything that moves is a transform or an opacity. The score is a scale pop,
the lead bar is one `scaleX` on a full width block, the play rows and the
verdict are keyframes, and the only thing javascript touches every frame is the
text of two numbers and a clock. No width animation, nothing that asks for a
layout on a frame the page is also simulating a possession in. The one layout
read in the loop is the `offsetWidth` that restarts a transition already on an
element.

**The pace is per quarter and the last two minutes are their own thing.** A
game is 198 possessions, so one flat pace is either a twenty second blur or a
four minute sit, and what anybody came for is the fourth quarter. That is the
resolved broadcast's escalation arriving at a live board.

**A CONTROL THE GAME IS WAITING ON GOES ABOVE THE RECORD OF IT.** The call box
and the verdict sit above the play by play, which is capped at 40vh and fills
up all game. That is the football boss battle's own lesson, and the guard
measures the deepest option and the Continue button against a **740px phone**
rather than against its own window.

**The six men's live points are the half a resolved game cannot show at all**:
whose night it is, while it is his. They are asserted to add to the team score
ON THE SCREEN and not only in the engine, and that assertion caught the bug it
was written for on its first run: `livePlay` built the record the page reads
and **dropped `who`**, so the page's `p.who != null` guard was never true, the
six chips sat at zero for a whole game, and the play by play beside them named
the scorer every time. Nothing threw, because undefined is not null.

**A GAME THAT WAS PLAYED KEEPS ITS OWN SHEET.** `gameDetail`'s default is a
decomposition drawn off the game's address, which is the honest answer for 82
games and the wrong one for the two or three somebody sat through: they would
open their own Game 7 from the results table and find a third quarter that did
not happen. So a live row carries its real lines and its real quarters, and
the sheet prints DIFFERENT COLUMNS for it. No minutes, no rebounds, no
assists: nothing in a forward sim counts them, and a column added to match the
other sheet's shape would be the invented-opponent mistake in miniature.

**Three things on this screen were only findable by looking at it**, which is
this repo's oldest lesson arriving at a new page. All three render, read and
sell perfectly well:

- **A one game round is not a series.** The play-in door read `PLAY-IN` over
  `GAME 7`. `need` is 1 there, so both sides are at need minus one before a
  ball is thrown and `elimination` and `closeout` are true by arithmetic. It
  is `Win or go home`, asked FIRST, because either of the other two labels is
  a sentence about a series that does not exist.
- **A double full stop**, because the series line ended in one and the caller
  joined it to the reason with another: "the run is over.. Nothing left".
  `seriesLine` returns null rather than a sentence when there is no series,
  and never ends in punctuation.
- **The play by play read as though it ran backwards.** It is newest first, so
  a row at 0:12 of the first quarter sits directly under one at 11:53 of the
  second, and there was nothing on either to say they were different quarters.
  The quarter is part of the time now.

**`show()` stops the live loop and the bracket walk**, the same way it already
stops the season reveal and for a worse failure. Left running, a live game
plays itself to the horn and RECORDS the result: somebody who pressed the
wordmark in the middle of a Game 7 would come back to a series that had moved
without them. Stopped rather than ended, so the bracket is still at that game
and coming back offers the same door.

**Sim the rest still stops for your calls.** A run lost to a decision the page
made for you is the worst thing this screen could do.

**`window.RTF_LIVE` is published and nothing on the page reads it.** A call
happens in about one game in five and a played game is most of a minute, so a
guard that waited for one would be dark on most runs, which is the unearnable
badge in a different coat. The handle lets `check-live.mjs` put the board into
a genuine last shot and then press the page's own loop: the real sim, the real
tick, nothing about the decision faked. It carries a `resume` rather than
exporting the tick because a caller that has just rewritten the state has a
timer pending on the old one, and every version of this that forgot to clear it
ran two loops at once.

#### Four things about the harness, and each cost a round

**`.opts:not(.pending)` is load-bearing in every walk that drafts.**
`.opts.pending` hides the tile's CHILDREN and sets `pointer-events:none` on the
tile, so the tile itself is a visible box with a size and `waitForSelector`'s
own visibility test passes on a board still mid-spin. A scripted `.click()`
ignores pointer events, so the walk signed off a board nobody could have read,
and `reelBusy` was still true when `sign()`'s own `setTimeout(spin, 240)` fired:
`drawInto` returns at its first line while a reel is moving, so no draw was ever
made and the draft sat on an empty board for ever. `check-board.mjs` had the
same latent race and carries the same fix.

**Wait on the attribute, not on Playwright's idea of visible.** While Sim the
rest is running the page turns a hundred and forty possessions over on
zero-delay timers, and the visibility poller can sit behind that for a whole
thirty second timeout on an element whose `hidden` came off seconds earlier.
Instrumenting it with a polling loop made it pass, which is the tell.

**A driven fixture has to be internally consistent.** Setting twenty seconds on
the clock with a hundred and fifty possessions still to play makes EVERY
remaining possession a last shot, so the board correctly stopped and asked
about all of them and the next section waited for a verdict that could never
arrive. The clock and the possession count are locked together in a real game,
so the fixture locks them too.

**Driving a call consumes the endgame**, so the call cannot be tested in the
same game a pacing section already simmed to the horn. The browser half opens
two runs, and the second one earns its cost twice: it is also the reload test.
For the same reason ONE driven call answers both call questions rather than
two answering one each: Sim the rest is pressed in the same evaluate that sets
the fixture, so the question coming up with the flag already on IS the claim
that a pacing control never takes a decision away. Written as a second
fixture after an earlier call, the game was already over by the time it ran
and the board had nothing left to stop for.

**A walk that waits on the verdict is measuring whether the game happened to
have a decision in it.** Sim the rest stops for a call, which is the design,
so the pacing section timed out on about one run in five and finished in a
second on the rest. It answers them now. The first reading of that failure was
spent on Playwright's visibility heuristic, which was not the fault.

**Starting the next run is a click, not a context.** The first draft of
`findRunWithDoor` opened a fresh browser context per attempt, which reloads and
re-indexes sixteen thousand rows every go, so six attempts was all the file
could afford and six was not enough: the page's own walk takes the first
affordable tile rather than best-available, which misses the bracket often.
Going home and pressing Start again is the same fresh run at a fraction of the
cost, so it can afford to try until it gets one.

#### What the guard asserts, and what was proved by breaking it

The bands in section 2 are **derived from the sample and not typed**: one
standard error on a spread near 9 is `9/sqrt(2N)`, and on the difference of two
independent arms it is `sqrt(2)` of that. `--quick` deliberately does NOT cut
that section, because forty thousand forward games take under two seconds and
cutting the sample bought a second and cost the band its teeth. The seeds are
fixed, so it is deterministic rather than flaky.

Three defects were reintroduced one at a time to prove the file has teeth:
removing the pull blows the spread past the band, the old fixed tick fails the
fit, and **the possession parity assertion has to say EXACTLY equal**. Written
as "within one" it passes on the defect it exists for, because one is not a
rounding allowance there, it is the whole bug.

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

## Run The Diamond, the baseball game

`baseball/`, at `/baseball/`. Same split as hoops: `engine.js`, `run.js`,
`achievements.js` and `board.js` load beside the page and carry cache versions,
so **read the cache-busting section above before editing any of them**.

```
node baseball/check-atbats.mjs    the at-bat simulator, against real brackets
node baseball/check-bracket.mjs   the playoff field, against real runs
```

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
**fitted** over 220 drafted rosters against the season simulator (rms 1.5 wins).
Refit rather than nudge. The scale then hangs on two things a player already
knows: **88 wins is the wild card line and rates 50, and the 116-win record
rates 100**.

What the bands are worth, over 260 drafts, which is what the verdicts and the
badge thresholds are pinned to:

| rating | mean wins | Octobers | titles |
|---|---|---|---|
| 70-80 | 99.4 | 100% | 40% |
| 60-70 | 98.1 | 100% | 25% |
| 50-60 | 92.7 | 90% | 3% |
| 40-50 | 86.0 | 40% | 0% |
| under 40 | 73.5 | 2% | 0% |

The draft grade is a separate scale and is **not** inflated: it is the share of
the WAR on your own board that you walked away with, and best-available medians
B+ while a careless draft gets an F. It only ever needed to say what it graded.

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

## Two people can share a name, and `name|sport` is not a person

```
node scripts/check-namesakes.mjs
```

`arcade/data.js` folds `former.js` and `supplement.js` onto the curated corpus,
keyed on name plus sport. That key is not a person. The Browns' Hall of Fame
tackle and a linebacker who played for four clubs in the 2010s were one record,
so the tackle was handed the linebacker's college. Alma Mater asked where Joe
Thomas went and marked Wisconsin wrong. **A player sent a screenshot.**

**Nothing failed and nothing could.** The fold backfills empty fields, so it
throws nothing, breaks no test, and leaves the pool exactly as healthy as before.
The only symptom was the game stating a false thing about a real person, in the
one place a quiz has to be trusted. Five famous players were affected: Joe
Thomas, Josh Allen, Lamar Jackson, Michael Thomas and Chris Jones all wore
somebody else's school.

**A shared club proves sameness; a missing one proves nothing.** Sixteen pairs
share a name and a sport with no club in common, and only nine are two people.
The other seven are one person whose clubs are written two ways: Cleveland
Indians against Cleveland Guardians, Brooklyn against Los Angeles Dodgers, the
Washington Senators against the Minnesota Twins, plus Negro Leaguers carrying no
club at all. So this is not a rename list, which would be three sports of
franchise history to maintain before it could answer anything.

**What separates the nine is POSITION**, every one: tackle against linebacker,
quarterback against cornerback, first baseman against outfielder. So
`samePerson()` calls it the same person unless the clubs, the numbers AND the
position all disagree. Deliberately permissive, because the costs are not
symmetric: a wrongly blocked backfill loses one player a college, a wrongly
allowed one marks somebody's right answer wrong. **Do not normalize the position
strings.** "Guard" against "Point Guard" is what keeps the two Dee Browns apart,
and folding them together would re-merge them.

It costs one known false negative. Ronnie Lott really did finish at Kansas City
and really did play both corner and safety, so his former row is refused; he is
carried by `stars.js`, so nothing about him moves.

**Refusing is not the whole fix.** It left those five with no college and dropped
them out of Alma Mater, which is honest and not finished. `supplement.js` carries
the real ones, in rows that match their entity on club and position so the
backfill is allowed through.

**The same key contaminates two more front-facing things, and both are fixed at the
point of use rather than upstream.**

**The club printed under a player's name.** `primary.js` answers "which club is he
of", and it is addressed by name, so it inherits every namesake; it counts off
jersey stints that begin in 1990, so an older career comes back truncated. Randy
Johnson's Seattle decade is not truncated in that file, it is ABSENT, so he looked
like a man who debuted in Arizona in 1999 and came back a Diamondback. The header
of `build-primary.mjs` used him as the example of what its floor cut prevents, and
the floor never saw him. Rickey Henderson came back a Met and Roger Clemens a
Yankee. Two fixes: the build now refuses a career whose stints start more than a
decade after the decade list says it began, and `data.js` drops any `pt` that is
not one of the clubs the record already has. The documented fallback is the first
club, which is always a true thing to say.

**The Number Game's questions.** A round there is one jersey stint joined to a
curated player BY NAME, so a father's stint arrives under his son's card: what
number did Patrick Ewing wear for the 2011 Hornets (Ewing Jr.), Tim Hardaway for
the 2019 Mavericks, Antonio Brown for the 2003 Bills, seven years before he was
drafted. 87 of 3124 rounds. Nobody plays outside their own career, so the decades
the record already gives the player settle it without knowing who the other man
is, and `_ownStint()` in `arcade/table/index.html` drops them before a round is
built.

`check-namesakes.mjs` builds the corpus twice, once as the site does and once
with every namesake row deleted before the fold, and requires the two to be
identical. **Two weaker versions came first and both were wrong.** Asking whether
an entity HOLDS the namesake's value reported nine problems that were not:
contemporaries share a decade, and `hp=0` only means neither was a high pick.
Asking whether the fold MOVED a field then reported eighteen, because the
supplement legitimately fills Joe Thomas in with Wisconsin. Attribution by value
cannot settle it when two sources are allowed to agree.

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
