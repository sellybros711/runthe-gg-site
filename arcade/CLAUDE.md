# The arcade

This file holds the decisions for this game. The repo-wide rules are in the root CLAUDE.md.

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
