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

The guarded list inside that script is `wrestling`, `hoops`,
`mythiball`, `golf`, `cfb`, `football`, `assets`, `baseball` and `arcade`. The rest of the
repo predates the rule and still contains hundreds of em dashes; add a directory to
`GUARDED` only after cleaning it, never before, or the check becomes noise
people learn to ignore.

**`GUARDED` and the workflow's `paths:` are two copies of one answer.** They had
already drifted: `globe` (RunTheGlobe, since removed) was on the list and triggered no CI run, so a dash added
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

**`arcade` carried 199**, and one was a player's: the archive bar read "Past days
need an Arcade Card" and a dash. The rest were comments, READMEs, three
generators' file headers and the 2026-07-23 audit records. None was an empty
value. Its data files (jerseys, rosters, the Sportegories corpus) are rebuilt by
bots and are guarded too, so a scraped name carrying an en dash fails here.

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

**An escaped quote was the third way it went wrong.** A contraction in a
single-quoted literal is `you\'re`, and the backslash counted against the
prose-shape filter. A line of copy full of markup and digits sat just over that
threshold, so the escape pushed it out of every checker that reads copy. Found when
a contraction pass took one "all 17 games" claim out of `check-numbers`' count
without changing a word the player sees. `tidy()` unescapes quotes now.

### The football and college games talk like the owner

Casual, with hype saved for the big moments. The Perfect Season, College Football,
Commissioner Mode, both how-to pages and the store all use contractions now
(`don't`, `you're`, `it's`). The results verdicts, the rank lines and the purchase
thank-you were rewritten by hand. Commissioner Mode's characters kept their own
voices and only picked up the contractions, the same call the Segue pass made about
the crowd's slang.

**A contraction pass has to know a subject from an object.** "The six that can
remove you are on the strip" is not "you're", and "the one before it is still
here" is not "it's". A regex cannot tell those apart, so the pass only contracts
`it is`, `you are` and the rest when the pronoun opens a clause: at the start of a
sentence, or after `and`, `but`, `so`, `if`, `when` and the like. It also leaves
`what there is to`, `it is its own` and `of it is` alone. Read the diff for
anything that slipped through before shipping one.

**Two checkers read the old spelling and had to take both.** `check-fullteam`
matched "could not be looked up here" and `test_store` asserted the page never
says "could not". Before a sweep, grep the checkers for the phrases being
contracted, as well as the page's own `.test(` calls.

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

**A DATA FILE IS NOT A SCRIPT AND CACHES EXACTLY LIKE ONE.** Six games fetch a pool
with a hand-written version on it (`fetch('data/players.json?v=3')`), fourteen of
them in all, and this checker saw none of them for as long as it has existed. Found
when hoops derived multi-position eligibility onto all 16,057 rows: a returning
visitor on the cached `v=3` would have gone on drafting the old pool, and **the only
symptom is somebody insisting a feature is not there.** No crash, no wrong screen,
and quieter than a stale script because the game still works. A version built from a
variable (`'...?v=' + DATA_VERSION`) is skipped rather than mangled, since that is
the problem already solved.

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

## No game opens a tutorial by itself

The owner's call (2026-10-13): a first visit goes straight into the game. Every guide,
tour and coach card is still there, behind a button, and nothing calls it on a timer, on
boot or on a first screen. Older sections below that describe a guide "firing once" are
history; the guide is the same and only the trigger is gone.

| game | the way in |
|---|---|
| Run The Tour | Guided Tour in the menu, and the button in How to Play (`replayTour`) |
| The Perfect Season | Tutorial on the front page (`#b-tut`); `firstRunGuide()` is kept and check-popups drives it |
| College | Tutorial on the front page (it was always optional) |
| Run The Floor | Show me around, inside the How to play card (`#b-home-tour`, `frgOpen`) |
| Run The Diamond | Quick start, at the top of How to play (`#b-how-quick` opens `#sheet-first`) |
| MythiBall | Settings, Coaching tips (`PREFS.tips`, off unless turned on; the old `coach` key is ignored) |
| The wrestling game | Help, Walkthrough (`startTour('hub')`); the spot explainer no longer fires mid-match |
| Segue | Show me around, under How it works (`#guideBtn`) |
| The arcade | the "?" on every game (it already never auto-opened) |

Still automatic, deliberately, because they are not tutorials: feature announcements (Run
The Tour's roster hint), the rules sheet the first time a mode is started (Dynasty, the
Trade Machine), Putt Putt's world greeters, the wrestling tab tips (one toast each), and
the fantasy lock day reminder.

## The release newsletter

```
psql -d news -f supabase/test/newsletter_test.sql     the list's rules, against a real Postgres
```

`scripts/newsletter/README.md` is the runbook. A player ticks a box in a game's profile or on
the home page (`/assets/newsletter.js`), or a guest types an address on the home page and
confirms it. When something big ships, `.github/workflows/newsletter.yml` has Claude draft the
issue from the commits since the last one, mails a preview, and sends only after a required
reviewer approves the `send` job.

**The agent only reads commits that touch a game in `scripts/newsletter/games.json`.** That is
what keeps an unreleased game out of an email, so a game goes on that list the day it goes on
the home page and not before.

**Addresses are never in `profiles`**, which is world-readable. They are in
`newsletter_subscribers`, which no browser role can select.

**The reveal animation on the home page adds the class `in`, and so does a signed-in account
panel.** The nav and the newsletter box read `#acct.in` as "signed in", so `.rv` sits on a
wrapper around `#acct` and never on `#acct` itself. On `#acct` it drew a signed-in chip in the
nav for a guest who scrolled.

## Where each game's notes live

Each game keeps its own decisions in a CLAUDE.md in its directory, which loads when you work there: `football/` (The Perfect Season and the weekly Fantasy Challenge), `cfb/` (College Football, Commissioner Mode and the College Fantasy Challenge), `wrestling/`, `mythiball/`, `setlist/` (Segue), `hoops/` (Run The Floor), `baseball/` (Run The Diamond), `arcade/` and `golf/` (Run The Tour and Putt Putt Tour). The full file as it stood before the split is kept in `docs/CLAUDE-archive.md`.

## Session notes

Never append session logs or progress notes to any CLAUDE.md. Put those in docs/NOTES.md. Game-specific decisions go in that game’s CLAUDE.md.
