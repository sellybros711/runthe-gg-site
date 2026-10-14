# The Perfect Season (the NFL game) and its weekly Fantasy Challenge

This file holds the decisions for this game. The repo-wide rules are in the root CLAUDE.md.

## The Perfect Season front page is one switcher and one button

`#s-intro` in `football/index.html`. The quick drafts are one question with three answers,
so they are one control: `#hp-mode` (Offense, Defense, Full Team), then `#b-start`, which
names what it drafts (`HOME_GO`: Draft your offense, your defense, your full team) and calls
whichever door the switcher names. The longer modes sit under it in `#hp-longer`, stacked on
a phone and two across on a desktop.

**The button is frosted glass, and the thing behind the glass is drawn inside it.** It sits
on flat dark, and a backdrop blur of flat dark is flat dark. So `.hp-go-fx` holds two soft
lights in the mode's colours under a translucent tint, a sheen and a grain layer, at
`z-index:-1` inside an `isolation:isolate` button. Drop the isolation and that layer paints
under the page instead of under the label. The label is measured in real Anton: "Draft your
full team" leaves about eleven pixels at 320, so anything longer needs measuring first.

**THE OLD DOORS ARE STILL IN THE MARKUP AND STILL DO THE WORK.** `#b-start` calls
`beginDraft`, `beginDefenseDraft` or `fullDoor`, the same functions `#b-start-off`,
`#b-start-def` and `#b-start-full` always called, so the account wall, the day's allowance
and a saved Full Team season are all decided exactly where they were. `#hp-split` and
`#b-start-full` are kept and never drawn: the pair for anything that presses it directly,
the Full Team door because `ensureFullButton` is where that mode's save and meter state
lives, and `paintHomeMode` reads it into the tab note, the button label and the line under
the button. Delete either and nothing throws; the Full Team tab just stops knowing whether
there is a run to resume.

**A TAB IS DRAWN ONLY FOR A MODE THIS ACCOUNT CAN PLAY**, asked of `canPlayDefense` and
`canPlayFull`, the two calls that used to decide whether those doors existed. With Offense
alone there is no question and the switcher goes. The choice is remembered on the device
(`ps_home_mode`), and a remembered mode the account can no longer play falls back to
Offense rather than to a hidden tab.

**THE FIELD FOLLOWS THE SWITCHER, and it is twelve chips that are never torn down.** Six a
side, updated in place by `heroChips`, so a switch changes where each one stands and the
CSS transition on `left` and `top` does the rest: the side you left runs off its own end,
the side you picked runs on, and Full Team folds both toward one line with the draft's own
`fullY()`. Rebuilt instead, a switch is a cut. The markings are the draft field's own
(`fieldMarkings`) in a `.hmk` layer that fades, so the grass never repaints under men who
are mid-run. On Full Team the hero only signs where a name has room (`HERO_FULL_OK`): a
lineman's name lands on the receiver across the line, and the back's runs off the bottom.

**SHORT SCREENS KEEP THE BUTTON ABOVE THE FOLD**, which this page has always measured. The
switcher costs about sixty pixels the old pair did not, so under 760 tall the name goes
back to one line and the slot list stands down, under 640 the subtitle goes, and under 600
the kicker. Measured: 320x568, 360x640, 375x667, 390x664 and 844x390 all land Spin on
screen. Re-measure after touching anything above it.

**The name is two lines on a tall phone and on a desktop**, "Season" in red, and back to
one line on a short phone. Its size is `min(14vw,84px)` rather than the old one-line fit,
because "THE PERFECT" is eleven of the eighteen characters.

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

### Game Day: badges for playing while the real league is

```
node football/check-gameday.mjs           every badge on the shelf, lit and dark, against the real schedule
node football/build/nfl-schedule.mjs      rebuild football/data/nfl_schedule.json
```

Asked for by the owner: badges that pull people in while NFL games are on. Twenty of them on
a `Game Day` shelf. The base one is **Home crowd**: finish a season during a real game with a
player from either team in it. Everything else builds on that: 8 and 32 teams, both sidelines,
a division game, four live teams at once, the three night games, a Sunday doubleheader,
international, Thanksgiving, the playoffs, the Super Bowl, a club that goes on to win, an
underdog that does, and 3, 8 and 18 different NFL weeks.

**STILL DERIVED, AND IT NEEDED NO MIGRATION.** A row's `created_at` is written by the server,
so a phone clock cannot move it. The other half is `football/data/nfl_schedule.json`, built off
nflverse's `games.csv`: every kickoff as a UTC instant, both clubs in this site's codes (their
`LA` is our `LAR`), the game type, the closing favourite, the final score, and a list of tags
worked out in Eastern time at build time (`div intl tnf snf mnf early late thanks xmas post sb`)
so the page never does time zone arithmetic. A game is ON from its kickoff to `GAME_DAY_MS`
(three and a half hours) after it. **It is retroactive**: the file starts at the 2025 season,
so every row filed on a game day since then is judged the moment the shelf ships.

**The club is the player's franchise, not his city.** A 2000 St. Louis Ram counts for today's
Rams, the same way the club collections already work.

**FILED, NOT DRAFTED.** The time on a row is when the season finished. A run is a few minutes,
so the badge copy says "finish a season" rather than claim a draft time nothing records.

**`.github/workflows/nfl-schedule.yml` refreshes it twice a day and commits only when it
moved.** A flexed kickoff, a final score and the playoff games all arrive on nobody's
timetable, and a stale file is badges that silently do not light. The builder writes no clock,
for the injury file's reason, and the check runs against the fresh file before it is committed.
The page fetches it `no-cache` with no `?v=`, because a bot rewrites it under one name.

**No schedule is "not known", never "no".** `achReady` loads the file beside the defensive pool
and `achEvaluate` passes it as `opts.schedule`; with none, every Game Day test is false, which
is the absent-is-not-zero rule this file already runs on.

**They can only be earned in season**, which is a wait rather than a wall, so they are in the
catalog and count toward GOAT. The tier rungs are absolute badge counts, so twenty more badges
only gives everybody more to earn.

**THE COLLEGE GAME HAS ITS OWN SHELF, 21 BADGES ON SATURDAYS.** `cfb/achievements.js` carries
the same design with the sport's own days: a noon kickoff, a night game, a weeknight, a
neutral site, Thanksgiving week, conference title games, bowls, the playoff and the title game,
10 and 25 schools, and 3, 8 and 14 weeks. The schedule is `cfb/data/cfb_schedule.json`, built by
`cfb/build/cfb-schedule.mjs` off sportsdataverse's cfbfastR-data, which is on
raw.githubusercontent and so reachable from the sandbox as well as a runner. Only games the
game's own 83 schools play are kept, a school is matched by NAME (all 83 match the source
exactly, and the build refuses to write if one stops), a game whose kickoff is still TBD is
left out until it has a time, the underdog is the lower pregame Elo, and the window is four
hours because a college game runs longer.

**The college time is only the server's for a signed-in player.** That cabinet is read off the
board; a guest's is this browser's history, stamped by the phone, the same as every calendar
badge here, and a guest's badges are offered rather than kept. The page fetches the schedule at
boot, never awaited, and every `evaluate` call passes it; `test_gameday.mjs` reads each call.

`nfl-schedule.yml` builds both files as independent steps, so one source being down never stops
the other landing, and goes red afterwards if either failed. `test_achievements.mjs` hands the
Game Day shelf to `test_gameday.mjs` by name rather than demanding a synthetic career light it,
and `test_cabinet.mjs` now reads the shelf count off the catalog instead of a literal 8.

**The check asks both halves of every claim**: a badge lights at the right moment and stays
dark a minute before kickoff, after the window, for the wrong club, across two moments, across
two weeks, and for the favourite winning. It also holds the schedule to the catalog (every tag a
badge reads exists in the file) and the page to the wiring. Two defects were reintroduced to
prove it bites: a window that never closes, and an upset that ignores the favourite.

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

**`arcade_card_year` is the one grant that is SOLD with an end.** Twelve months, and it does
not renew. No copy anywhere may imply it does, and the receipt has to show the end date. The
other row that ends is a PRIZE rather than a sale: the Fantasy Challenge winner's 30 days of
Pro (see that section), which is the same two game rows with an end date and a `fantasy:`
source, and the receipt says "Won" and prints the end the same way.

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

### Perfect Season and Run The Bundle can be sold yearly, and a lifetime row does not move

```
node scripts/stripe/check-checkout.mjs       who may buy what, through the real endpoint
node scripts/stripe/replay-webhook.mjs       every plan event, through the real webhook, against a real Postgres
psql -d yr -f supabase/test/premium_yearly_test.sql   (its header lists the chain)
psql -d capt -f supabase/test/arcade_cap_test.sql    the ranked cap after 125 (its header lists the chain)
```

`supabase/124_premium_yearly.sql`, `functions/api/stripe/_offer.js` and one switch,
`YEARLY_LIVE` in `_bundles.js`, on since launch (2026-09-27); false is the kill switch. Perfect Season $19.99 a year, Run The Bundle
$34.99 a year for NEW buyers. The runbook is `functions/api/stripe/README.md`.

**THE RULE THAT WINS OVER EVERYTHING: a lifetime row never moves.** A `premium_unlocks` row
with no end date is never given one, never overwritten and never deleted by a checkout, a
renewal, a cancel, a refund, a lapse, a portal change or a Fantasy prize. It is held twice:
every writer says `where expires_at is not null`, and a BEFORE UPDATE trigger hands back the
old row whatever the update asked for, except for `fulfilled_at` going from null to a time
once. **Two guards on purpose**, because the first is a clause somebody deletes while
tidying, and the SQL test proves each one by removing it.

**ONE ROW PER PRODUCT HOLDS BECAUSE THE ROW KEEPS ITS PARTS.** A lifetime unlock, a plan and a
Fantasy pass for the same product share one row, so the row carries `sub_until` (what plans
grant, grace included) and `grant_until` (what fixed grants give), and `expires_at` is the
later of the two. One number cannot hold "the latest of all grants": once a pass is folded
into a plan's end, a refund cannot take the plan's days back without taking the prize's. Every
reader already asks `expires_at`, so none of them changed. A writer that sets `expires_at`
alone (the old webhook, a hand edit) has it filed as the fixed grant by the trigger.

**THE PLANS ARE NOT IN THE ARCADE CARD'S `subscriptions` TABLE**, and that is the finding to
read before "fixing" it. That table is keyed by user and eight SQL functions plus
`arcade/board.js` read any active row there as an Arcade Card member, so a Perfect Season plan
written there hands its buyer unlimited ranked arcade plays. They live in
`premium_subscriptions`, keyed by `stripe_sub_id`. The webhook tells a plan from an Arcade
Card by its PRICE first and its metadata second, because a plan changed in the portal keeps the
metadata it was bought with.

**THE STATUS DECIDES, NOT THE EVENT.** Stripe delivers out of order and more than once, so
`premium_sub_apply()` reads the plan as it now stands: active extends, past due holds, a
cancel ends at `ended_at` (no grace after a cancel), a full refund or a chargeback ends it now
and remembers the period it took back, and a finished plan stays finished whatever arrives
late. Grace is seven days, the owner's call, in `premium_yearly_grace()` and nowhere else.

**THE BONUS IS INSERT IF ABSENT, AND THAT IS THE WHOLE OF "ONCE PER ACCOUNT, EVER".** The Run
The Bundle coins and pack are the `runtour_pack` row, written `on conflict do nothing` by any
paid-for Run The Bundle event. Never a merge: a merge re-sends `fulfilled_at` as null over a
row the golf side already paid out, and 103's redeem pays the coins again. The old one-time
path had exactly that merge and now splits the bonus row out too.

**A REFUND OF THE PAYMENT THAT BOUGHT THE BONUS TAKES IT BACK, and nothing else does.**
`supabase/125_arcade_cap_and_bonus_refund.sql`: after a full refund or a chargeback on a plan,
`premium_reclaim_bonus()` removes the bonus row if THIS plan wrote it inside the refunded
invoice's period, and takes redeemed coins back out of the wallet (floored at zero). The
period is read off the invoice's LINES and never off `invoice.period_start`, which on a
subscription invoice is the year just billed: read that way, refunding a renewal takes the
first year's bonus. It is the one null-expiry row anything deletes, because 124's trigger hands
back every update to such a row. A one-time bundle's bonus is never touched, and the Tour
Pack cannot be taken back at all (packs live in the golf page).

**Run The Diamond Pro's refund is remembered on its own row.** Stripe does not cancel a
subscription when a charge is refunded, so everything after still reads `active` for that
period. `grantRecurring` ends the grant and writes `payload.refunded_through`; an event whose
period ends on or before it grants nothing, which is `premium_sub_apply`'s rule for the plans.

**The arcade's ranked cap asks `arcade_card_active()`**, since 125. It read the Arcade Card's
`subscriptions` table alone, so a Run The Bundle buyer, whose card is a `premium_unlocks` row,
saw unlimited on the page and was refused their fifth score by the server.

**THE PAGE NEVER DECIDES ONCE OR YEARLY.** `/api/stripe/offer` answers from `_offer.js`, which
says `year` only when the switch is on, both yearly prices are set AND the database answers
`premium_yearly_ready()`. So the switch before the SQL keeps selling the one-time bundles, which
is what "correct on both sides of the migration" means here. The page sends the plan it showed,
and the checkout answers `409 offer_changed` to a mismatch, so nobody is charged for something
their screen did not say. `RTG_STORE.onPlan` redraws every card and an open store when the
answer lands.

**Gold names, the owner's call:** a subscriber is gold on rows filed while subscribed, and
those rows stay gold. Subscribing does not reach back and gild older rows; a lifetime purchase
still does. **And the backfill trigger answers to the two football products now**: 107 fired on
any insert, so buying Diamond Pro or Floor Pro gilded every football row the account had.

**What `check-premium` holds**: a lifetime owner reads exactly what they always read (the
receipt, "nothing to renew", the thank you), a subscriber reads "Renews on" or "Ends on" and a
Manage your plan button that opens the portal for the plan, a lapsed subscriber reads that it
ended and is back on the free allowance, the yearly sheet never says lifetime, one payment or no
subscription, the yearly card sub holds one line at 360 and up, and offer_changed and
already_subscribed are handled.

**The value claim is two sums.** Sold once, $19.99 + $49.99 + $9.99 = $80, save $45. Sold
yearly, $19.99 + $49.99 = $70 a year, save $35: the coins come once, so counting them would make
the struck price true for one year and false for every renewal.

#### THE COLLEGE GAME SENT NO PLAN, SO NOBODY COULD BUY IT

```
node cfb/build/test/test_store.mjs             the offer, the press and the receipt
node cfb/build/test/commish/test_clock.mjs     the wall's own buy path
```

`checkout-bundle.js` reads a body with no `plan` on it as `'once'`, and from the day
`YEARLY_LIVE` went true that is a mismatch, so it answered **409 `offer_changed` to every
purchase made from the college game**, on both of its buy paths. Neither handled that error,
so the button read "Checkout couldn't start. Try again" and went on reading it. **Nothing
threw, the store drew perfectly and every price on it was right**: the only symptom was that
the game could not be bought, which no screen anywhere reports.

**THE PLAN IS THE ONE `RTG_STORE.wire` HANDS OVER, not the one the module holds now.** Those
come apart exactly when it matters, which is the switch flipping under an open sheet: the
wired one is what the buyer READ, and sending anything else charges somebody for a screen
they were never shown. Both college paths take it as a third argument now, the way the
football page already did.

**A REFUSAL IS A DOOR RATHER THAN AN ERROR MESSAGE.** `offer_changed` redraws the offer at
the real price. `already_subscribed` opens the Customer Portal with `scope: 'plan'`, because
a plan is changed or cancelled there and never bought twice. On the commissioner wall the
redraw is the WALL'S OWN PAINTER (`wallOffer`), because two walls draw the store into `w-act`
with two different preambles and a redraw that rebuilt the markup would be a third copy of
one of them.

**`cfb/auth.js` IS A SECOND COPY OF `football/auth.js` AND HAS TO BE PORTED TO.** It grew
`premiumPlans()`, `sub_until`/`grant_until` on the unlocks read with the fallback for a
database without 124, and a `scope` on `billingPortal`. One account holds one plan whichever
door it was bought through, so a receipt only one of the two games can read is a receipt half
the buyers cannot find.

**THE RECEIPT'S THREE STATES, and only one of them says "for good".** A row a plan is keeping
alive says when the plan renews or ends, a Fantasy pass still says Won, and a lifetime row
reads **exactly** what it read before any of this. The paragraph under the list stops
promising that nothing renews when a plan is billing, and the button says Manage your plan.

**THE "YOU'RE PRO" SHEET WAS FIXED AND IS UNREACHABLE ON THIS PAGE**, which is worth knowing
before somebody hunts for a way to test it. All four callers of `openPremium` are shut for an
owner: `premiumPitch()` excludes them, and `commishShut()` returns false for them on its
second line. Its own comment claims the branch is reachable and on the football page it is.
It was fixed anyway, because it is one new door away.

**TWO SUITES WERE WALKING THE ONE-TIME STORE while production sold the yearly one.** Neither
stubbed `/api/stripe/offer`, so the fetch 404'd and `RTG_STORE` fell back to `'once'`: every
section in both files was asking questions about a store nobody is being shown. Two
assertions in `test_store` were pinned to the words "one payment" and would have demanded a
sheet that lied. **The claim is now "true about the plan it drew"**, read off
`RTG_STORE.plan()`, so it follows the switch on its own and covers both sides of it.

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

**UNTIL 143 THE SHELF HAD NEVER ACCEPTED A SAVE, FOR ANY GAME.** `ps_save_put` is
`returns table (ok, slot, progress, ...)`, so `slot` is an OUT variable and its own `where ...
and slot = p_slot` raised "column reference slot is ambiguous" on every call: 102's `used`
trap at a second function. Read off the live database, `ps_saves` held zero rows. Every caller
fails soft, so nothing said so; it was reported as Putt Putt progress resetting to hole 1 on a
tester's second device. `supabase/143_ps_save_put_fix.sql` qualifies every column, preflight
row 57 asks the body, and `supabase/test/ps_saves_test.sql` (on `ps_saves_base.sql`) fails on
103 alone. `.github/workflows/putt-diag.yml` reads the shelf, read-only.

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

#### And it could not run at all against any database it was written for

**`pg_get_functiondef` RAISES on an aggregate**, and the `proc` CTE walked every row of
`pg_proc` in `public` and called it on all of them. `create extension citext` puts
`min(citext)` and `max(citext)` there, and `10_accounts.sql` needs citext because an
account's `username` is one. So every real Supabase project answered this file with **one
line reading `ERROR: "min" is an aggregate function` and not a single row of the report.**

That is **this file's own header argument arriving from a side it did not expect.** It asks
the catalog rather than calling anything, precisely so one missing piece cannot take the
whole report down, and then took the whole report down on a catalog function raising over a
row nothing was asking about. `prokind = 'f'` is the whole fix: nothing here asks about an
aggregate, a window function or a procedure.

**It was found by running it, which is the only way it could be.** Every guard in this repo
had passed, because no guard runs this file: it is a paste, and the one thing a paste has
never had is a harness. A scratch Postgres built from `supabase/test/fantasy_base.sql` (which
creates the citext extension, because the real `profiles` needs it) reproduces it exactly.

**The fantasy chain is six rows now rather than one**, because the ways those six files go
missing are not one failure at different sizes. 113 refuses every lineup and says so. 110,
111 and 112 each leave a screen that renders perfectly and is quietly a week behind, or
empty, or silent about who is in. A single row reading "the fantasy layer" would answer NO
to all six and say which of those is happening about none of them. Each was proved by
staging the chain one file at a time and watching its row turn over at exactly the right
step, plus the pre-fix 109 for 113's row and a deliberate 111-before-110 for 111's.

`col` and `trg` were added for those rows and are **deliberately not allowlists**, which is
the trap the `has_table` block above them already carries as a warning. They ask the catalog
for every column and every trigger in the schema and let the row do the filtering, so a check
naming something nobody added to a list up top cannot quietly read false for ever.

#### The one button that applies the fantasy chain

```
.github/workflows/fantasy-sql.yml     dry run by default, tick "apply" to commit
```

**IT NAMED FOUR FILES THAT ARE NOT ON MAIN, AND READING THAT AS "A PLAN THAT WAS RENAMED"
WAS WRONG.** `109_fantasy_access.sql`, `110_fantasy_core.sql`, `111_fantasy_model.sql` and
`supabase/test/fantasy_preflight.sql` are a **second fantasy stack**, on
`claude/fantasy-league-build-brief`, an odds poller with a Cloudflare Worker behind it. That
branch has dispatched this workflow twice and both runs went green.

So main's copy was only ever what makes the Run workflow button exist, which GitHub grants
off the default branch, and that branch's own commit message says so. Dispatched from main
it correctly could not find its files, and "did you dispatch from the right branch" was the
RIGHT diagnosis read as a wrong one. **The Actions tab is what settles a question like
that**, and it was not looked at: a workflow with two green runs on it is not a workflow
that has never run, and no amount of reading the file says so.

Editing it on main costs that branch nothing, because `workflow_dispatch` runs the workflow
file from the ref you pick.

**What IS real is that both chains number from 109 and both are applied to one database.**
109 through 112 name different files on the two branches. Nothing collides in the database,
since the objects have different names, and a merge would put two 109s, two 110s, two 111s
and two 112s in one directory. This repo already tolerates that (108, 101, 102 and 103 are
each taken twice), so it is a thing to know rather than a thing to fix in a hurry.

**THE ORDER IS LOAD BEARING AND IT IS THE FILENAME ORDER.** 110 restates two of 109's
functions, 111 and 112 each restate 110's board, and 113 restates 109's submit, so for
anything touched more than once the LAST file to run wins. **111 before 110 is the one hazard
with a silent symptom**: 110 carries a copy of `fantasy_board` with no `games` key, so the
tables and the writer end up in place under a board that never answers with a scoreboard, and
the live screen shows sixteen games with no score on any of them for ever. The preflight row
for 111 asks the board's own body rather than the table's existence, so it catches exactly
that.

**109 WAS NOT RE-APPLIABLE AND THAT IS WHAT MAKES A ONE BUTTON APPLY WORTH ANYTHING.** 110
changed the return type of `fantasy_standings`, `create or replace` refuses to change a
return type, and a `returns table` function's row type IS its return type. So against any
database that had 110, re-running the chain died half way with "cannot change return type of
existing function". 109 carries the same `drop function if exists` that 110 already carried,
for the same reason and in the same words. Nothing depends on it in the catalog sense: 114's
`fantasy_settle_week` calls it, and plpgsql resolves a call at CALL time rather than
recording a dependency.

Every one of the six is written to be applied twice, and the whole chain was run three times
over against a scratch Postgres 16 to say so. **Re-running the workflow is safe and is the
point**: it is how you find out whether what is deployed is what is in the repo.

**The dry run is a real run** and rolls back, proved from the other side rather than argued:
after a dry run of all six against a database holding nothing but the account tables,
`fantasy_weeks` and `fantasy_prizes` are both still absent. The dry file carries its own
`begin`/`rollback` and the apply uses `--single-transaction`, which is the one asymmetry
here: wrapping a second transaction around a file that already opens one means the inner
rollback throws away the outer one too and psql finishes by committing nothing with a
warning, which is the right result reached by an accident nobody should have to reason about.

**The read-back is the SITE WIDE preflight and not a fantasy one.** Writing a second report
asking a version of the same questions is `commish_my_tenure`'s standing warning about two
implementations of one answer. What the step does have to do on its own is decide, and it
**reads the same file twice** rather than restating the six checks: once aligned for a person
and once with `-tA -F '|'` for an awk, because judging a verdict off column positions in an
aligned table is how the old version of this step came to grep for `NOT READY`, **a string
this report has never printed.** A fantasy row reading NO after an apply is an error and
names which; anything else on the site missing is a warning, because taking the run red on a
migration nobody dispatched here teaches everybody that this workflow goes red for reasons
that are not its business.

**Two more workflows in that folder belong to that branch and are deliberately LEFT ALONE.**
`fantasy-status.yml` reads `supabase/test/fantasy_status.sql` and `fantasy-deploy.yml`
deploys the Worker at `fantasy/worker` with an `ODDS_API_KEY`. Neither file is on main and
both are on the branch, so they are on main for the same reason this one is: the button.
Deleting them from main would take the button away from a branch that is using it.

#### What the first read-back found, which is the whole argument for having one

**114 was applied and its TRIGGER was not.** The live database carries `fantasy_prizes`,
both its unique indexes and `result_seen_at` on `fantasy_entries`, and has no
`fantasy_settle_on_scored` on `fantasy_weeks`. Two independent sources in one run said so:
the preflight row read NO, and psql's own `drop trigger if exists` printed `trigger
"fantasy_settle_on_scored" for relation "public.fantasy_weeks" does not exist, skipping`.

**It is the one object in that file whose absence is invisible from every side.** The table
is there to be read, the popup's `fantasy_my_result` answers, the page draws, and nothing
anywhere throws. What does not happen is that a week going final settles the top three, so
there is no placement for any entrant, no winner recorded, and nobody paid. A competition that runs and pays nobody, reported by no one,
because there is nothing on any screen to report.

**Pasting a file into the SQL editor and reading "Success" is not the same claim as the
objects existing**, and that is the finding rather than the trigger. The fix was one
dispatch with apply ticked.

### More ways to play is a grid on a wide screen, in both football games

```
node scripts/check-modes-grid.mjs     both sheets, four widths, and the leak
```

Asked for by the owner, to match the baseball game's sheet: tiles with the icon on top, **two
across from 760px**, and the list it always was under that. Two and not three, because these
sheets hold three modes and two: a third column would be a third of a row of nothing. **Phones
are untouched**: every rule is inside the media query and `.mc-grid` has no base rule.

**THE WIDTH IS KEYED ON THE CONTENT, NOT ON A FLAG.** Every sheet on both pages draws into one
`#sheet-in`, and several never set a `data-kind` (the college conference picker this sheet
opens is one). A width written by `modeMenu` would leak into the next sheet and widen a
sign-in form. `.sheet .inner:has(.mc-grid)` is true of this sheet and stops being true the
moment the pane is redrawn. The guard presses Close and How to play to prove it.

**A CARD THAT IS NOT A MODE TAKES THE WHOLE ROW.** One Franchise is a panel with two doors in
it (`.mc-split`), and the college sign-in card is an account form. **The sign-in card sat as a
grid cell for a day**: it is drawn BETWEEN the two tiles, so it took the second column and put
Commish Simulator on a row of its own. Spanning alone does not fix that, because it still
splits the tiles, so on the grid it also takes `order:1` and goes after them. A phone keeps it
directly under Conference Draft, which is the card it is about.

**THE GUARD SHIPPED MEASURING A DESIGN THAT DID NOT.** Two sessions built this grid in
parallel and the CSS that landed is the other one's (two across from 760). This checker was
written against three across from 900, so it went red on main with nothing wrong with the
page, apart from the sign-in card above. It asks the shipped design now. **A guard merged
without its page is a guard for a page nobody has.**

**The guard counts columns off the tiles' own left edges and rows off `offsetTop`**, which is
the laid out box and ignores the press transform. The spanning claim was proved by taking
each half of the sign-in rule out alone: without the span it names the card at 387 of 786px,
and without the order both desktop widths come back one column.

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

### A guide is shown once, and the account remembers it

```
node football/check-popups.mjs     the guide, the rules sheets, two devices and the old keys
```

Reported by a player: the same pop-ups and directions ten times, after saying they did not
need them. Every guide on The Perfect Season was remembered in ONE BROWSER, so a new phone, a
private window or a cleared jar put it back in front of somebody who had played for months.
The dynasty rules stood in front of EVERY run unless a box was ticked, and the crest's "what's
new" sheet opened on every visit until its box was ticked. Both boxes held in one browser.

**`hasSeen` and `markSeen` are the one answer** (`ps_seen_v1`). Three rules, one per cause:

- **Once, ever.** A guide is marked seen the moment it is on screen. The dynasty rules lost
  their "don't show this again" box, because there is nothing left for it to switch off. The
  rules pill and How to play still open the sheet on demand.
- **On the account.** The list rides on the run shelf as a `seen` slot under `ps_dynasty`, so
  it costs no request: `dynCloudPull` already fetches the whole shelf. Merged as a UNION, and
  its progress is the count, so the server's "never backwards" rule is the right rule for it.
- **A history is not new.** `careerLoad` files `seenFromRows`: any run retires the first-run
  guide, a dynasty retires the dynasty rules, a Trade Machine season its rules. A saved run in
  any slot does the same for a guest. **The first-run guide WAITS for the account** (bounded)
  before it decides, because the player most at risk is signed in on a phone they have never
  used here, and the guide fires before their rows arrive.

**The old keys are still READ** (`SEEN_LEGACY`): `ps_seen_guide`, `ps_dynintro`,
`ps_dynintro_off` and `ps_tmintro`. Nobody is shown something again on the day this ships.

**The crest's "what's new" sheet is retired**, not made once. It was an announcement from
August, and the profile circle already leads to Customize.

**Memory is a fallback, never a second copy.** `seenMem` is written only when storage
throws, so clearing storage really does make a browser new, which is what the checks rely on.

### Every football board opens on All time

`defaultWin()` in `football/index.html`. Every competition used to open on Today. Asked
for by the owner in two steps: first the era and One Franchise boards (forty-odd of them
against one free board, so Today on one club's board is usually empty or one row), then
all of them. The tab marked `on` in the markup is All time too, so the first paint agrees.

**It is applied when the competition CHANGES, never on a repaint.** Picking one in
`#lb-comp` lands on All time, and so does `openBoard` when a finished run moves the board
to another competition (`compKey()` is the before and after). Reopening the same board
keeps whatever window was picked on it. `showMyRowOnBoard` uses it too, which is safe for
the reason its comment gives: a run played minutes ago is on the all-time board, and the
pinned-row fallback depends on the axis rather than the window. A tap on a placing cell on
the results screen still opens the window that cell names. It stays a function rather
than a literal so a board that wants its own default later is one line.

**The college game does the same**, asked for right after: `lbWindow` in `cfb/index.html` starts
at `'all'`, the All time tab is the one marked `on` in the markup, and both ways the competition
changes (the `#lb-comp` select and `openBoard(mode)` with a different mode) set it back.

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

### Every game is played out on one broadcast field, in both football games

```
node scripts/check-fieldcast.mjs     the renderer's rules, and that both pages draw on it
```

Asked for: the drive charts on the home page's two cards, but bigger, for the real games. So
`/assets/fieldcast.js` is the picture every game is played on: the playoff broadcast, the bowl,
the challenge bowl, the boss battle and the Full Team live games. A lit stadium with a dot matrix
crowd (the home cards' motif), an LED ribbon board, the field in perspective, the last three
drives as lanes that recede as the game goes on, and the drive in progress played out snap by snap
with the ball, the blue and yellow lines and the down and distance over the ball. Touchdowns, field
goals, misses, turnovers and safeties get their own moment.

**THE FIELD IS QUIET AND THE STADIUM IS NOT, which is the owner's call.** The first version drew
six drives with a result pill on each, fifteen players chasing the ball, a banner across the whole
middle of the field, a white flash, a screen shake, confetti and a blinking ribbon board, all at
once. Verdict: visually great, a little overwhelming. So the stands keep all their life (the
crowd, the lights, the ribbon, the eruption on a score) and the field carries what a viewer is
following: three drives, one result pill on the drive that just ended, the ball, the two lines,
and a small call plate over the far half. **Add to the field only what replaces something already
on it.** The kick to the posts stays, because it is the one moment that shows where the ball went.

**IT IS ONE FUNCTION DEEP IN EACH PAGE.** `drawDriveChart` in `football/index.html` and in
`cfb/index.html` hands its drives to `RTG_FIELD.paint` and returns; the old chart is still below
that line, whole, because a blocked or stale copy of the file must still leave a game with a
picture. Every caller was already going through `drawDriveChart`, so no call site learned
anything new beyond an optional `extra` (the ribbon board's words, and the boss board's flags).

**IT DECIDES NOTHING.** The start, the end, the result and the clock of every drive are the
page's. What is drawn between them is seeded off the drive itself, so a repaint of one moment is
one picture and no game stream is touched.

**THE MOMENTS FIRE THEMSELVES**, off the clock crossing the end of a drive, so no page calls
anything to get a touchdown. A jump crosses too much to be a moment and fires nothing: Sim to the
end and the final repaint land on 3600 from wherever they were. A clock that goes backwards is a
new game on the same canvas.

**THE DOWNS ARE INVENTED, SO THE ONE PAGE WITH REAL ONES TURNS THEM OFF.** The playoff broadcast
builds its drives backwards from a score, so a down and distance made up from the drive is as
honest as the drive. The boss board plays forward down by down: it passes `downs:false` and puts
the sim's own `down` and `toGo` on the live drive as `sit`, and at a fourth down the field shows
exactly the 4th and 1 the card under it is asking about, with the two sides set at the line.
A made up "2nd and 7" over a real fourth down call would be the two halves of one screen
disagreeing, which this repo has paid for on every screen it has happened on.

**TWO LOOK-ALIKE COLOURS ARE SPLIT IN THE RENDERER**, not per page. The field paints both sides'
players, lanes and end zones, and the boss board had no guard: against Seattle every player on
the field was blue. The playoff broadcast's coral swap is the rule for every caller now.

**THE STANDS ARE THE HOME TEAM'S.** A home crowd is the home side's colours and shades of
them, with the visitors about one fan in eight (measured, 12%), packed into the corner by their
own end zone and a few scattered through the bowl. A neutral site is split down the middle.
The home side scoring lights the whole bowl; the visitors scoring lights their corner and
nothing else. `frame.home` says whose building it is and the engines never name a host (a home
field there is an EDGE), so each screen answers it off something a player can see:

| screen | whose crowd |
|---|---|
| NFL playoff broadcast, Full Team live games | the better seed, off the bracket just shown; the Super Bowl is neutral |
| a boss battle | theirs: it is played in the boss's building |
| the CFP | the better seed in the first round, which is on campus; every round after is neutral |
| a bowl, the challenge bowl | neutral |

**The crowd is counted as it is seated** (`st.crowd`), so the guard reads the mix rather than
the arithmetic that was meant to produce it. The first tuning came out at exactly 10.0%, which
is the edge of the band that was asked for rather than inside it.

**THE PICTURE IS READ BACK, NOT RE-DERIVED.** `test_credits.mjs` holds a field goal's bar to the
distance the call names, and it used to rebuild the flat chart's geometry to find the bar. A
camera in perspective has no fixed row, so the renderer records each drive's drawn leading edge
(`RTG_FIELD.inspect`) and hands back its own pixel to yard mapping; the pixel just behind that
edge has to be the drive's colour or the record is lying. **It caught a real fault the first time it ran**: the result
pill (FG, TD, INT) was centred a fixed 2.2 yards past the end of the bar, and on the near lanes
it is wider than that, so it sat on top of the exact spot the kick was taken from. It is placed
clear of the chevron by its own half width now.

**It keeps drawing between the page's frames**, which is what lets a score hold the clock while
the crowd erupts and the banner plays: its own loop runs while the canvas is on screen, at thirty
frames a second when nothing but the crowd is moving, and stops the moment `offsetParent` is
null. Reduced motion gets no slides and no ambient loop.

**The canvas is 196 to 320px tall, up from 160**, because a picture with a stadium in it needs the
room. `check-fullteam.mjs` measures the boss board's calls and Continue against a phone, which is
the layout that extra height could have broken, and it is green.

### A Speed button slows every broadcast, in both football games

Reported by players: the playoff games went by too fast to follow. `/assets/simspeed.js` is
one device setting (`rtg_simspeed_v1`, shared by both pages because they share an origin):
Normal, Slow (1.6x as long) and Slower (2.4x). Every `<button data-simspeed>` is the control,
and it sits beside Sim to the end on the playoff broadcast and the bowl screen in both games,
and beside Sim the rest on the NFL live board.

**It is applied in two places and nowhere else.** `buildTimeline` builds each segment through
`paced()`, whose `ms` is a getter that multiplies by `simMul()` the FIRST time it is read, which
is the moment the segment starts. So a change lands on the next segment and never halfway
through one: read every frame, a slower setting would wind the clock back, and the field reads a
clock going backwards as a new game. The live board multiplies each duration by `simMul()` AFTER
`bossPace`'s floors, so Slow is really slower on a Wild Card that is already sitting on them.

**Normal is exactly 1**, so every timed check here measures the shipped pace. A blocked or stale
`simspeed.js` reads as Normal.

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

#### A tie goes to overtime, and it used to go to the projection

```
node football/check-overtime.mjs   the overtime rules, as properties, on the real engine
```

Reported by a player: a 19-0 Full Team season reached the Super Bowl, the last extra point
TIED it 24-24, and the screen said YOU LOSE. `bossSimAdvance` ended every game at 3600 and
settled a tie with `sim.youExp >= sim.themExp`, so the side the pregame projection disliked
lost every tie it ever reached, in the boss battle and in every live Full Team playoff game,
with nothing on screen to say why. Measured against the old engine: **0 of 600** tied games
won by the weaker side.

**A tie now plays overtime, under the NFL's playoff rule**: a fresh coin toss, both sides get
one possession whatever the first one does, then the next score wins. It never ends level,
because neither game that uses this can. `bossOtDecided` is the one rule, read by
`bossEndDrive` (so a winning touchdown takes no extra point) and by `bossSimAdvance` between
drives. `sim.ot.level` keeps the tied score, because the first overtime drive is played before
the page gets to announce overtime, and reading the score at that moment printed "tied 30-24".

**Behind in overtime there is no next possession**, so three rules change there and nowhere
else: the sim never punts, it kicks only when three points tie it, and the player is asked on
every fourth down wherever the ball is. `fullCoachCall` does the same for a hired coach, off
`d.ot` on the decision. `bossClock` counts periods past 4 and the page labels them OT
(`qLabel`), so a decision asked in overtime is never drawn at 0:00 of the fourth. A game
decided in overtime reads F/OT on the bug and "in overtime" in the verdict.

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
Six slots (QB, RB, RB, WR, WR, TE), a $110M cap, three whole drafts (five for Pro), one submitted. Half PPR,
scored on what the six actually do. **It is a page of its own rather than a screen inside
the football game**, because it shares nothing with that engine: no season, no sim, no
ratings. What it shares is accounts, the palette and the tester pattern.

**IT IS LAUNCHED, IN BETA, AND WHAT IT ASKS FOR IS AN ACCOUNT.** `fantasy-access.js` ships
`FANTASY_LIVE = true`, so the door is built for everybody. What decides whether it OPENS is
whether somebody is signed in, and those are two questions kept apart the way the Commish
door and the One Franchise lock keep theirs:

| | asks | so that |
|---|---|---|
| whether the door is DRAWN | `show()` | everybody finds the mode |
| whether it OPENS | `allowed()` | nothing drafts that cannot enter |

A guest gets the same door wearing a padlock and the press opens the sign-in sheet. **The
lock is fully pressable**: `.mc-soon` sets `pointer-events:none` and is deliberately not
reused, because a lock a thumb falls straight through is a lock with no way to the thing
that opens it.

**THE POINT OF THE GATE IS WHERE THE REFUSAL LANDS, NOT THAT THERE IS ONE.**
`fantasy_submit` has always refused a signed out lineup itself, in the one place that can,
because there is a prize. Without the gate a stranger who follows a link drafts five whole
lineups, chooses one, presses the last button of the mode and meets a wall. The work is the
drafting. This is still a feature flag and not a permission.

**THE DOOR IS A NEON SIGN AND THE COLOUR IS THE STATE.** Red until a lineup is in, green
once one is. It is the only door on this page whose border answers a question rather than
naming a mode, and it earns it: one lineup a week against a clock makes "have I entered this
week" the single thing a returning reader wants off the front page. It reads the mode's OWN
`ps_fantasy_<season>_w<week>` record, which `save()` writes only after the server has said
yes, so a refused entry can never light it green. **It fails soft to RED**, which is the safe
direction: an unknown answer costs a tap onto a screen that says you are already in, where
green on a bad read would tell somebody they had entered a competition they had not. What it
cannot see is another device, and that is recorded rather than fixed: asking the server needs
`entries.js`, a client and a round trip on every front page paint, for a border colour.
**A guest holding a lineup is still red**, because a browser keeps localStorage across a sign
out and a green door telling a stranger they are in is the one thing this light must never
say.

**SO IT IS THE ONLY FILLED, GLOWING DOOR ON THE FRONT PAGE, and that is what makes it read.**
Reported as the home screen feeling crowded, and the cause was that every door shouted: a
saturated red and blue pair, a solid red and blue Full Team slab, a gold Dynasty card and a
neon sign, one under the other. The Offense and Defense pair stays filled because it is the
game. Full Team carries its red and blue as a gradient EDGE on a dark card (the dark seam
between the two is kept, so it is still the pair joined), Dynasty is shorter, and Tutorial,
How to play and Leaderboard are underlined text rather than three more boxes. A neon door
among filled doors is one more loud thing; among outlined ones it is the sign.
`check-fullteam.mjs` still asserts `hp-ft` carries its own colour, which is now the edge.

**THREE ACCESS FILES NOW, AND THEY ARE STILL THREE FILES.** `fullteam-access.js` says in as
many words "when a third mode wants this, merge them". This is the third and the merge is
DEFERRED. It was deferred while this one was unlaunched, for the obvious reason, and it is
**still** deferred now that all three flags are true, for a different one: this file is no
longer the same SHAPE as the other two. It has a show/allow split they do not have, because
it is the only mode here that asks for an account. Merging means teaching the other two a
question they never ask, and the way that fails is a door that is never built, which reports
nothing. Do it on a day with nothing on the clock.
`check-fullteam.mjs` walks **every** `*-access.js` on disk now rather than naming two, so the
lists cannot drift and a fourth mode is covered without anybody remembering.

#### On lock day the front page reminds you, once

```
node football/check-fantasy.mjs                 the section named THE LOCK DAY REMINDER
node cfb/build/test/test_fantasy.mjs            the college half, at the end of the browser walk
```

Asked for by the owner: a pop-up that promotes the weekly challenge, with a live countdown to
the lock and the prize, once per account, every week, from midnight on the day lineups lock.
`/assets/fantasy-promo.js` is the rule and the sheet, and both front pages call
`RTG_FANPROMO.init` (and `check()` on every auth change). One file, because the rule is one
sentence in both games.

**THE DAY IS THE POINTER'S, NEVER A WEEKDAY.** It reads `locks_at` off `fantasy_now.json` or
`cfb/data/fantasy/now.json` and shows when the Eastern date equals the lock's Eastern date and
the lock has not passed. A Thursday NFL lock and a Friday college slate are the same rule.

**IT IS NOT SHOWN** over an entered week (the mode's own record, written only on a yes), when
the page does not draw the fantasy door, off the front page, over an open sheet or the first
visit guide, or before auth has answered, because the mark has to land on the right account.

**ONCE PER ACCOUNT IS ON THE SHELF.** Marked seen the moment it is on screen, to the browser
(`rtg_fanpromo_v1`) and, signed in, to `ps_saves` game `rtg_promo`, slot `nfl` or `cfb`, as a
set of week keys whose count is the progress. The shelf is asked before the sheet opens, with
a four second ceiling, and null is no opinion. Seen anywhere counts, which is the quiet
direction. The college front page loads `cloudsave.js` for this. No migration: 103's slots
are free-form.

**IT IS OFF UNDER AUTOMATION** (`navigator.webdriver`) unless `window.RTG_FANPROMO_TEST` is
set. A modal that appears one day a week would otherwise fail every front page suite in the
repo on that day and no other. A check that wants it sets the flag and gets the real rule.

**"wins 30 days of Pro" is in it**, so `check-fantasy`'s hold on the prize length reads this
file too.

#### The look is one file, and the share card is one source for both competitions

```
(nohup python3 -m http.server 8080 &) ; node football/build/fantasy-og.mjs
```

`football/fantasy/skin.js` is the presentation layer the NFL page and the college page
share: the stadium ground, the gold hairline on every card, the home hero (crest, six chips,
three steps, three tiles), the cap bar under the money, the slot strip in position colours,
the segmented live tabs and the podium places. **It is CSS carried in a script**, loaded
synchronously right after each page's own `<style>`, because `check-cachebust` reads a
`<script src>` and not a `<link>`, and a stylesheet caches exactly like a script. Each page's
own `<style>` still holds the layout every checker measures, so **nothing in skin.js may
move a control**: it paints, and where it changes a size it makes a control smaller.

**The share card** is `football/fantasy/og-source.html`, rendered to `football/fantasy/og.png`
and, with `?league=cfb`, to `cfb/fantasy/og.png`. It carries no number that can go stale (no
cap, no week, no count), and the source is on `check-copy`'s list because its words are baked
into an image. Bump the `?v=` on both pages' `og:image` and `twitter:image` and on the alias
below together after a rebuild.

**`Football/Fantasy/` is a capitalised alias**, the Mythiball and Wrestling arrangement:
paths are case sensitive here, and `runthe.gg/Football/Fantasy` is the URL that gets typed and
pasted, so it is a noindexed stub that refreshes to `/football/fantasy/` and carries the same
link preview tag for tag, because a chat app reads the head without following the refresh.

**A card's stat line carries two kinds of production at most**, the position's own first
(`statLine` in `weekly-pool.mjs`). Josh Allen's one catch made his line 58 characters in week 4
of 2026 and it was cut off at 360; the board is sized for about 40.

#### A published week's cap is the WEEK's, and the constant is only the next one's

```
node football/check-fantasy.mjs --quick   the section named THE LIVE WEEK CARRIES ITS OWN CAP
```

**IT SHIPPED BROKEN AND NOTHING ANYWHERE THREW.** Week 3 of 2026 was published to the server
at **$90M** with 414 prices. `CAP_MUSD` went to **110** the next day, with the pricing change
that earned it. `fantasy_weeks.cap_musd` does not move, ever, because a price may never move
once anybody has drafted against it and `fantasy_submit` checks a lineup against the ROW.

So the page and the server disagreed by $20M. A lineup spending $95M drafted perfectly,
looked legal on every screen, and would have been refused at the last press of five drafts.

**AND THE BOARD ITSELF MOVES, WHICH IS WORSE THAN THE REFUSAL.** The cap reaches `ceilingAt`
through `boardFor`, which sets the guaranteed signable seat and the reserve floor, so a board
drawn at 110 is not the board drawn at 90 with a different number over it. It is a different
board, and two readers on two deploys would have drafted different weeks.

**IT WAS ALSO VISIBLE AS THE THING A PLAYER REPORTED.** Greedy drafting on that board leaves
**$10.6M** at $110M, $5.8M at $100M and **$2.2M** at the $90M it was priced for. "I picked
the best player every round and still had leftover money" is that row of the table. The cap
binds at 90 and strands 0 of 120 drafts, which is what it was tuned for.

**SO THE POOL CARRIES ITS OWN CAP AND EVERYTHING ASKS THE POOL.** `weekly-pool.mjs` writes
`cap_musd` at build time, `publish-week.mjs` sends the POOL's cap to the server rather than
the constant (or a republish of an older week would send today's cap with yesterday's
prices), and the page reads it off the week it fetched into one `CAP` that every screen
spends. One answer, three readers, and `CAP_MUSD` is only ever the seed for the next build.

**THE FALLBACK IS THE LOUD HALF, NOT THE QUIET ONE.** `capFor` answers the constant for a
pool built before the key existed, which is right, and is exactly the original defect if the
live week ever loses it. So `check-fantasy.mjs` asserts the live pool CARRIES one rather than
trusting the fallback, and asserts the cap changes the board, **which its own first draft got
wrong**: at pick one with the whole cap in hand every drawn man is affordable at either cap,
so the fixture compared two identical boards and would have reported the defect as fixed.
Measured, the two agree at pick one and differ on 240 of 360 (seed, pick) pairs once money
has been spent, so the fixture spends first.

**AND THE POOL WAS THE ONE DATA FILE FETCHED WITHOUT REVALIDATION.** `fantasy_now.json` and
the injury file are both `no-cache` and this was not, which cost nothing while a week's
filename only ever appeared with its final contents. It stopped costing nothing the moment
the pool grew a cap: the name does not change when the file does, so a returning visitor
would be served their own cached copy, find no cap on it and fall back to the constant.

**AND THE LINEUPS ALREADY DRAFTED AT THE WRONG CAP ARE REOPENED, NOT SUBMITTED.** Fixing the
cap stopped new over-cap drafts and did nothing about the ones in people's browsers. The
owner's own review screen read "$106.7M of $90M spent" under SENDING..., and the page had no
check of its own: it posted a lineup `fantasy_submit` was always going to refuse. Only
testers were affected, because the launch and the fix went out in one commit, so the public
has only ever drafted at $90M.

Asked "raise the week to $110M, or reopen the over-cap drafts", the owner chose to reopen.
`reopenOverCap()` runs at boot: any unsubmitted draft spending more than the week's cap
becomes a fresh draft in the same chance, so nobody loses one of their five, and the home
note names which. **The new seed is DERIVED from the old one**, never drawn, or a reload
would be a re-roll. A legal draft is untouched, a submitted one is never touched (the row is
the server's and was accepted under the cap), and a partial draft over the cap is reopened
too because its next board would have negative money. It **fails open** in a try, since it
runs before anything is drawn for every visitor with a saved week.

**The submit button checks the cap as well**, which reopening makes unreachable. That is the
point of it. The guard proves it from both sides: with reopening removed the second line
refuses the press and nothing is sent, and with both removed the leak is reported the moment
it happens rather than after the page has moved on to the board, which is where the first
draft of that check crashed before it could say anything.

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

**NO WEEKLY PROJECTION IS LICENSABLE**, so one was built and then tested. Over 6,720
draftable player-weeks of 2022 to 2024, against a 5.887 baseline mean error:

| | mae |
|---|---|
| the season to date alone | 5.887 |
| plus the best matchup term found | 5.878 |
| plus the best recency term found | 5.867 |

Neither is a term, and both are still out. **The recency term is worse than useless for a
number that is PRINTED**: it takes the bias from +0.54 to +1.06, because the last three games
of a man near the top of the board run hot.

#### The projection was fitted POOLED, and the mode is played one week at a time

```
node football/build/test/probe_early.mjs
```

What shipped was `shrunkPPG + PROJ_LIFT`, one flat constant fitted over that same pool from
week four on, so the shortest sample in it was three games and most of it was men with eight
or ten. **Week three was never in the sample at all.** A player does not meet the pool. They
meet ONE WEEK, and inside one week nearly every man has the same number of games, so a
correction fitted at the pool's average sample length is right at exactly one point of the
season:

| games played | 1 | 2 | 3 | 4 | 5 | 6+ |
|---|---|---|---|---|---|---|
| what it was out by | +3.20 | +1.93 | +1.02 | +0.48 | -0.03 | -0.16 |

Right about October, a third low about September. At two games, which is what week three is,
that is 11.6 points on a six man lineup projected at 35.8. **Reported by a player** as the
projection feeling too low to be half PPR, and they were right.

**AND THE SHRINK TOWARD ZERO WAS AVAILABILITY WEARING A SAMPLE SIZE COSTUME.** Zero is where a
man who is not on the field scores, so shrinking toward it is an argument about whether he
PLAYS rather than about how much evidence there is, and the two only look alike because a man
with two games in week ten has missed eight. Grouped by the share of his club's games a man
has already played:

| share of his club's games | under .5 | .5 to .8 | .8 to 1 | every one |
|---|---|---|---|---|
| he scores this much of his own average | 0.404 | 0.605 | 0.739 | 0.914 |
| and he blanks | 59.6% | 39.0% | 24.1% | 8.9% |

The first row is one minus the second to three decimals, at every share. Held to men who have
played every one of their club's games, the games effect on the LEVEL all but vanishes and
what is left is an ordinary shrink for a thin sample.

**So there are two terms and they answer two questions**: how often he plays, and what he
scores when he does, which is the season to date shrunk toward what his POSITION is doing on
this board. **The prior is the part that was missing.** `shrunkPPG` is a shrinkage estimator
with its prior set to zero, which is why it needed a constant bolted on the end and why that
constant could only ever be right at one sample length: the prior's own contribution is
`K*M/(g+K)` and it SHRINKS as the sample grows, where a bolted-on constant does not.

**Per position and not one level for everybody**, because one level shrinks a tight end up
toward a quarterback's rate and a quarterback down toward a tight end's, on the same board, at
the same time. Measured, one global level over-projects both ends of a week three board.

**Fitted on two seasons and reported on the third, rotating the holdout.** The level multiple
came back **0.800 on all three rotations** and K at 2.25, 2.50 and 2.50 against the `SHRINK_K`
of 2 the price already carries, so it is pinned to that rather than given a second constant.
Pinning costs nothing: the worst mis-calibrated cell moves 2.03 to 2.01, 3.21 to 3.49 and 1.96
to 1.65 across the three held out seasons. On a held out season:

| | 1 | 2 | 3 | 4 | 5 | 6+ | worst cell | mae |
|---|---|---|---|---|---|---|---|---|
| shipped | +3.45 | +2.18 | +1.39 | +0.90 | +0.24 | +0.17 | 5.59 | 6.03 |
| plays x rate | +0.12 | +0.26 | +0.01 | +0.31 | -0.26 | +0.08 | **2.01** | **5.81** |

Better on the error as well as on the bias, which is worth stating because a calibration fix
usually costs accuracy and this one does not.

**NOT ONE OF THE 408 PRICES ON THE LIVE BOARD MOVED.** `pricePool` still runs on `shrunkPPG`,
the cap was swept against those prices, and the projection is not an input to any of it. The
probe measures that rather than asserting it from the algebra.

**What it costs is that the projection is no longer a monotone restatement of the price.** Two
men at one price project differently when one of them has missed a Sunday. That is real and it
is on the card already, as how many of his club's games he was there for, so the card says
`1 of 2 games` rather than `1 game`: in week ten the bare count says nothing at all.

**The card still shows no per man projection.** What the board shows is what he has DONE and
how available he has been, which is both halves of what the projection reads. The lineup's
projected total comes after the six are in, and it is the one number this mode prints about
the future.

#### And the price was blind to whether he plays, which is worth 2.87 points

```
node football/build/test/probe_price.mjs          the two bias axes, 2022 to 2024
node football/build/test/probe_price.mjs --board  who moves on the live board, by name
```

Reported by a player as the price feeling too weighted toward what a man has done all
season and not enough toward what he is expected to do this week. **It is measurable and
it was true.**

`shrunkPPG` is what the price runs on and it is **blind to availability**: a man who has
played two of his club's three games and a man who has played all three are the same row
to it, because the shrink toward zero discounts a thin SAMPLE, which is a different
question. `projectedPoints` is what the card prints and it knows, because the refit two
sections up put `plays` in it. So the two came apart that day and nothing put them side by
side.

Measured over **21,291 draftable player-weeks**, holding the price band fixed:

| at equal price | scores this week |
|---|---|
| played every one of his club's games | the reference |
| missed one | **2.87 points less** |

That is most of a seventh of a six man lineup, paid for and not delivered, and it is worst
where it costs most: the $25-48M band ran **-8.21**.

**Nothing could report it.** Every price was a correct summary of September, every
projection on every card was right, and no screen ever showed the two disagreeing.

**`PRICE_PROJ_W` was the answer and it shipped at 0.25**, blending the projection into the
estimate the price is built from. **It is 1 now**, which the section after this one records.
The bounding argument is kept because it is what the move had to answer:

| | 0 | 0.25 | 0.5 | 0.75 | 1 |
|---|---|---|---|---|---|
| absence gap | -2.87 | **-2.53** | -2.15 | -1.68 | -1.39 |
| thin sample gap | -1.25 | **-1.25** | -1.28 | -1.33 | -1.42 |
| price/proj rank agreement | .896 | **.943** | .980 | .994 | .999 |
| budget minus top at $90M | +1.3 | **+2.4** | +3.5 | | |
| top minus random at $90M | 11.2 | **9.7** | 7.3 | | |

**The top of the range is ruled out by the CARD.** At 0.75 and past it the price IS the
projection in rank, and the whole reason the projection was refitted was to stop it being a
restatement of the price. The residual between them is the decision this mode is built
around.

**The middle is ruled out by the CAP**, and that one cost a measurement rather than an
argument. `probe_cap.mjs` picks $90M because it is the band where spending everything and
holding money back trade places; at 0.5 the budget bot is 3.5 clear there and the crossover
walks to about 105. **That is not the blend being wrong**: a more accurate price against a
CONVEX price curve genuinely does reward spreading money, so better pricing moves that
band. The honest answer at 0.5 is to move the cap with it, which is a bigger change and not
one to make mid-season, because the cap is on every published week row and moving it makes
two weeks incomparable.

**The control is what says 0.25 is SAFE rather than merely small.** `SHRINK_K` was fitted on
sample size and took that gap 3.48 to 0.12, so a fix for availability that re-opens it has
moved the defect rather than removed it. At 0.25 that axis does not move at all to two
decimals. A cheaper looking candidate, `shrunkPPG * playShare`, is worse on **both** axes at
once (-2.06 and -1.43), because it discounts a thin sample twice.

**What it does to a board**, which is the half a reader can see: on week 3, 217 of 414 men
move by more than a million and **only six move by more than three**, and those six are the
men who missed a game (Zay Flowers $12.1M to $7.7M). At 0.5 it is 97 men past three million,
which is a rebuild rather than an adjustment. **It does not close the gap and is not meant
to**: an eighth of a defect this file now knows the size of.

#### And then it was asked for whole: `PRICE_PROJ_W` is 1

```
node football/build/test/probe_cap.mjs --runs 600 --caps 95,100,105,108,112,118
node football/check-fantasy.mjs --quick   the section named THE PRICE IS THE PROJECTION
```

Asked for in as many words: the price should be based solely on what a man is projected to
do this week, as accurately and as freshly as the mode allows. The section above ends by
saying going further is available, costs the cap, and is a decision about the MODE rather
than about the pricing, to be taken deliberately rather than quietly. **It was taken.**

**What it buys is half the absence gap**, -2.87 to -1.39, against an eighth at a quarter.
**What it costs is the residual**: at .999 rank agreement the price IS the projection, so
the decision the card used to carry is gone. What replaces it is the thing a reader knows
and the board cannot: the matchup, the weather, who is starting, and the report on any man
it has not spoken about yet. The thin sample gap widens 1.25 to 1.42, which is 0.17 of a
point against 1.48 gained, so it is a trade rather than a wash and it is the axis to watch
if the board starts feeling generous to a man with one week in him.

##### The cap had to move, and stranding is what forced it rather than balance

`draft.js`'s own header had already written down that a more accurate price against a CONVEX
curve rewards spreading money and walks the crossover up. Re-swept on the week 3 board:

| cap | top | budget | random | top minus random | budget minus top | stranded |
|---|---|---|---|---|---|---|
| **90** | 69.5 | 73.9 | 64.7 | 4.8 | +4.3 | **41 of 500** |
| 100 | 75.3 | 77.3 | 65.9 | 9.5 | +2.0 | 0 |
| 105 | 78.2 | 78.8 | 66.1 | 12.1 | +0.7 | 0 |
| **110** | **80.8** | **80.4** | **66.2** | **14.5** | **-0.4** | **0** |
| 118 | 84.0 | 82.5 | 66.4 | 17.5 | -1.4 | 0 |

**AT $90M IT STRANDED**, which is not a balance question: the board comes up with nothing
signable and the player is looking at a screen with no way on. Driven bot by bot on the real
`spin`, a greedy drafter strands **28 of 600** at $90M and **0** at $110M. The cause is the
projection shrinking a thin sample toward the POSITION LEVEL where `shrunkPPG` shrank it
toward zero, so the cheap end of the board lifts and the reserve floor lifts with it.

**It ships at $110M**, the round number inside the half point band (105 to 112, centred on
108), which is the same rule that picked 90 against a crossover of 93.

**AND DRAFTING IS WORTH WHAT IT WAS**, which is the number to read before assuming a more
accurate price flattens the mode. Each pricing at ITS OWN crossover: `shrunkPPG` at $100M is
14.7, the projection at $110M is 14.5. **The 4.8 at $90M was the wrong cap and not the
pricing.** At a MATCHED cap the projection does differentiate less (14.5 against 18.3), which
is the honest cost and is what a fair price does: when every man is worth what he costs, any
lineup that spends the cap scores about the same.

**What it costs is that week 3 and week 4 are not comparable.** The cap rides on each
published week row, so nothing already out there is repriced and week 3 keeps its $90M for
ever. Two weeks under two caps is a real loss and it is the price of changing the pricing.

##### And the projection grew the one live signal the mode has

"As accurate as possible" is a claim about the PROJECTION rather than about the blend. What
it did not read is the game status report: `plays` is availability measured BACKWARDS off
games already missed, and the report is what the club says about Sunday. Measured over the
same 21,291 draftable player-weeks, actual against what the projection expected:

| status | men | proj | actual | actual/proj | blanked |
|---|---|---|---|---|---|
| no report | 17,179 | 4.75 | 4.37 | 0.919 | 44.8% |
| on it, no call | 2,179 | 7.34 | 7.87 | 1.073 | 21.0% |
| **questionable** | **1,066** | **6.20** | **4.33** | **0.699** | 47.7% |
| doubtful | 122 | 6.28 | 0.02 | 0.003 | 99.2% |
| out | 744 | 5.38 | 0.00 | 0.000 | 100.0% |

**A QUESTIONABLE MAN DELIVERS SEVEN TENTHS OF HIS PROJECTION** and the board charged full
price for him: a 43% overpay on about one board row in twenty, and the largest single
inaccuracy left in the price.

**ONLY QUESTIONABLE IS PRICED, and the split is principled rather than cautious.** Read the
blank column: a questionable man blanks 47.7% against a clear man's 44.8%, almost no change
for a group whose projection is a third higher, so he is not mostly missing the game. He is
PLAYING HURT and producing less, which is a fact about his points. Out and doubtful are about
ABSENCE, `D.hurt` already takes those men off the board, and **36% of men out in one week's
report are playing by the next**, so a price near zero on one of them is a free star the
moment he is cleared.

**AND IT IS ONLY READ WHEN THE REPORT IS THIS WEEK'S**, which is measured rather than a
formality. The same table against the PREVIOUS week's report, which is what a build running
before the club has filed anything sees: questionable **0.951** against 0.699, doubtful 0.693
against 0.003, out 0.336 against 0.000. **70.6% of last week's questionable men are cleared
by this week**, so a week old designation is worth nothing and applying the discount to one
would be a 30% cut on a man his club has passed fit.

**The build reads the SAME FILE the page reads**, `injuries_<season>_w<week>.json`, rather
than fetching the CSV again, so the price, the red chip and the sheet are one answer about
one hamstring. Its absence is exactly the old behaviour, so a fixture or a probe rebuilding
2022 prices on `plays` alone with nothing to be wrong about.

**0.70 IS MEASURED ON THE FINAL REPORT AND THAT IS THE ONE SOFT EDGE.** nflverse keeps ONE
ROW per player-week rather than a history, and **78% of them were last modified on a Friday**,
so the table above is the report as it FINISHED. There is no way from that archive to measure
what a Wednesday build would have seen. Said rather than implied.

##### PRACTICE IS THE SIGNAL, AND IT IS WHAT MAKES THE TUESDAY BUILD WORTH ANYTHING

The first version of this priced off the DESIGNATION alone, and left the Tuesday build
collecting nothing, on the reading that the report for the coming week is first filed on the
Wednesday so `injuryFactor` correctly returns 1 for every man. **The live file's own commit
history says exactly when that happens**: `report_week` was still 2 at 11:10pm Eastern on the
Tuesday and 3 by 3:05pm on the Wednesday. So a Tuesday 11am build can never see this week's
report, and the conclusion drawn from that was that the build day would have to move.

**It does not, because PRACTICE PARTICIPATION is a different signal and a better one.**
Measured over the same 21,291 player-weeks:

| practice | men | actual/proj |
|---|---|---|
| full | 1,880 | 1.082 |
| **limited** | 1,076 | **0.814** |
| **did not practise** | 1,131 | **0.233** |

Two things follow and both matter. **Practice is filed on the WEDNESDAY with the first
report**, where a Sunday game status is not final until the Friday, which is after the week
has already locked, so the designation a build can see is never the one that was measured.
And **practice survives a week where a designation does not**:

| | a week old designation | a week old practice line |
|---|---|---|
| questionable / limited | 0.951 | 0.979 |
| out / did not practise | 0.336 | **0.511** |

**A man who did not practise at all last week delivers 0.511 of his projection this week**,
and that is a large, measured discount a Tuesday build can read. So there are two tables,
`INJ_THIS_WEEK` keyed on the PAIR and `INJ_LAST_WEEK` keyed on practice alone, and which one
a build gets is decided by the clock rather than by anybody's choice. **The build day did not
have to move.**

The pair is worth keying on because the spread across it is large: a questionable man who
practised in full delivers 0.886, one who was limited 0.711, and one who did not practise at
all 0.448. A table on the designation alone prices all three the same.

**NOTHING IS EVER PRICED ABOVE 1**, and the measured numbers invite it: a man on the report
practising in full delivers 1.104. That is the projection under-reading good players (their
projection runs a third higher than the pool's), which is a level bias rather than an
availability signal, and paying for it here would be fixing one estimator's bias inside
another.

**And a report more than one week old is not news.** The 0.511 was measured one week apart; a
man who missed practice in week 3 says nothing about week 7.

###### `report_week` IS A MAX OVER THE MEN, AND THE PRICE WAS READING IT AS A DATE

`injuries.mjs` keeps each man's LATEST report row, so one file holds designations of several
ages at once, and `report_week` is the highest of them. The live week 3 file reads
**`report_week: 3` off exactly ONE man**, while 23 of the others were last reported in week 2
and 7 in week 1.

`injuryFactor` took that one number for the whole file, so **every one of the 31 was priced as
this week's news**: a fortnight old designation discounted as though the club had said it on
Wednesday. **Nothing throws.** A stale designation is a real designation, the table lookup
succeeds, and the price it produces looks exactly like a price.

**The week is a fact about the MAN.** It is on every row already, as `w`, so the fix is to read
it: `injuryFactor` takes `p.report_at` and the file's own `report_week` is kept for the page's
sentence and the log and never for a price. Repriced men on the live board go **17 to 6**, and
the six are the did-not-practise men, which is the signal the whole table is about.

**THE SHEET HAD BEEN SAYING THE RIGHT THING ON SCREEN THE WHOLE TIME.** `injuryReport` reads
`e.w` and writes `From the week 2 report. Week 3 has not been filed yet, so this is the last
thing that was said about him.` So a reader tapping a red row was correctly told the news was a
week old, while the price beside it had discounted him as though it were today's. Two answers to
one question, one of them on screen and right, and the one that moved money was the wrong one.
That is the nearest thing this had to a visible symptom and it reads as the page working.

**The guard drives the REAL report rather than rows it invented**, because the defect is a
property of the file's shape and an invented row cannot have it. Reintroduced, it reports
`no man more than a week old is discounted at all: 7 men, worst x0.448`.

**It asserts a PROPERTY over every man in the file, which the first draft did not.** That
version hunted one hand picked pair (a questionable man who did not practise, reported two
weeks back) and would have gone quiet on any week whose report happens not to contain one.
And it pinned the filename, which accumulates one a week. It reads the newest report on disk
and asks the rule of everybody in it.

**Both directions, or the property passes on a function that discounts nobody.** "No man over
a week old is discounted" is true of an `injuryFactor` that returns 1 for everything, so the
clause beside it asks that the RECENT men are discounted. Proved: stubbed to return 1, it
reports `0 of 24 men within a week of the report are discounted`.

**And the first version of its message wrote the expected value in as a literal**, so it failed
while printing the `x1` it had just refused. A failure that misreports what happened costs the
next person the round it takes to disbelieve it. Every number is read back now.

**The read-back counts men rather than restating the max**, for the same reason: one fresh row
made a fortnight old report log as "priced off the report for this same week". It prints how
many men are reported for this week, how many are a week old, and how many are older.

##### The build was reading a report seventeen hours old, and nothing refreshed it

The price reads `injuries_<season>_w<week>.json`, and that file is written by a DIFFERENT job
on a different clock: `fantasy-injuries.yml` fires at 11:20am and 6:20pm Eastern, and
`fantasy-pool.yml` fires at 11:00. **So the board was priced off a report last refreshed at
twenty past six the previous evening.** Nothing anywhere said so: the prices are ordinary, the
board drafts, and the one number the whole pricing pass is about is out of date.

The pool job refreshes the report itself now. A refresh that fails carries on and prices on
availability alone, because a report that cannot be fetched must not stop the week.

**AND THE REFRESH CANNOT GO FIRST, SO THE BOARD IS BUILT TWICE.** `injuries.mjs` scopes the
report to the men ON THE BOARD, so it reads the week's pool file and exits 1 with
`no pool for 2026 week 4. Build it first.` **The first version of this put the refresh above the
build**, where it does nothing at all: no report is written, the board prices off whatever was
last committed, and the defect is intact behind a step that looks exactly like the fix. Driven
for a week with no pool file, which is every Tuesday, that is what it reports.

So it is build, refresh, build again. **The ID SET DOES NOT DEPEND ON THE REPORT**, which is
what makes the first pass a valid scope for the second: `eligible` comes off played games, the
schedule and `minGames`, and none of those reads a designation. Driven on the live week 3
board with the report present and with it moved aside, the same 414 men come back in the same
order and 5 prices differ. A build is under a second against the nflverse cache the first pass
warms.

Driven end to end for week 4: build 1 prices `0 of 414` with no report, the refresh writes one,
build 2 prices `1 of 414` with ages `{"older":30,"a week old":1}`. Week 3's own files were put
back afterwards, because **a published week must never be repriced**, and `fantasy_now.json`
had to go back with them: the build advances the pointer.

**AND IT COMMITS THE REPORT, WHICH THE FIRST VERSION DELIBERATELY DID NOT.** That version
scoped the `git add` to the pool, the results and the pointer, on the argument that the
injuries job owns that file and commits only when it moves, which is the rule that stops a
hundred Cloudflare deploys a weekend. The rule is real and it is about the CADENCE, and this
job commits once a week either way, so the report rides in that one commit for nothing.

**What the first version actually cost is the Tuesday job going red.** An uncommitted refresh
is an UNSTAGED CHANGE, and the push-rejection branch under it runs `git pull --rebase`, which
refuses outright: `cannot pull with rebase: You have unstaged changes`, exit **128**, straight
into the loop's `|| exit 1`. That loop is there because other scheduled jobs push to main, so
the one branch it exists for was the one branch that could not work. Driven both ways against
a real repo with an unrelated upstream commit: unstaged is exit 128 and a red job, committed is
exit 0, a clean tree and both files on main.

**The quieter half is the page.** It fetches `injuries_<season>_w<week>.json` for whatever week
`fantasy_now.json` points at, so a commit that advanced the pointer and left the report behind
serves a board with no injury chips until the injuries job next runs, twenty minutes later. A
week with no file is a state the page handles by design, which is exactly why nothing would
have reported it.

**The two jobs never write the same file.** The injuries job writes the LIVE week's report, and
on the Tuesday the pointer has not moved yet, so it is still the week just played; this job
writes the week it is building. Both `git add` with the same glob and both are no-ops on the
other's file.

**And the log says which report it got**, because a Tuesday build and a Wednesday one are
priced off different amounts of information and the prices alone do not say which. The
read-back was driven all four ways (a Wednesday report, a Tuesday one, none at all, and a pool
built before `report_ages` existed) with its body extracted from the yaml rather than retyped,
which is how the pool filename in it was found to be wrong: it said `pool_` where the build
writes `weekly_`, so it would have thrown on a file that does not exist rather than reporting
anything.

##### A price cannot be live, and that is the rule rather than a limitation

"As live as possible" runs into the one thing this mode cannot bend: **a price may never move
once anybody has drafted against it.** Two entrants drafting at different times against
different prices are not in one competition, and there is a prize.

**What IS live is availability**, and it already was: `fantasy-injuries.yml` refreshes the
report twice a day, the page merges it over the board, and a man ruled out after the build
leaves the wheel. What that cannot do is move his price.

**AND THE RULE WAS A SENTENCE IN A COMMENT WITH NOTHING KEEPING IT.** Every statement
`publish-week.mjs` emits is an UPSERT, so a second run of the Tuesday job against a week that
is already out rewrites `cap_musd` and all 400-odd prices under every lineup entered. Their
stored `spend` was checked against the old numbers and is then a total of a board that no
longer exists, and nothing throws. **It went from annoying to fatal when the cap started
moving**: a rebuild now hands entrants a budget they never drafted with.

So the SQL refuses, rather than the script, because the script has no database to ask and the
SQL is what actually runs. Driven against a real Postgres 16, both arms: a week with no
entries publishes 414 prices at the new cap, and a week with one entry **raises, exits 3 so
`set -e` catches it, and leaves the cap and all 414 prices exactly where they were.** The
results path is deliberately not guarded, because results are published after a week and
entries obviously exist by then.

##### Two guards that were reading a number rather than a claim

**`probe_board.mjs` swept `[70, 80, 90]`**, chosen when the cap WAS 90 so the sweep ran up to
it. With the cap at 110 the whole table sat below the game, reporting 82 stranded drafts at
its own top row while the mode strands none. It is anchored on `DRAFT.CAP_MUSD` now. A sweep
that does not contain the value it is about is a sweep about a different game.

**And the cap visibility check pooled three bots**, two of which never approach the cap:
`thrifty` takes the cheapest man on every board by definition, so its presses dilute the ratio
with ones where nothing could ever be out of reach. Survivable at $90M, and at $110M the
pooled figure fell to 1.4% and failed while `probe_board` reported a spending drafter meeting
an unaffordable man on 22.3% of presses. **The page had not stopped showing the cap. The
measurement was averaging it away.** It counts BOARDS for the one bot that can run out of
money now.

**Its floor has to clear two different boards**, which is worth knowing before tightening it.
The suite reads the pool FILE on disk, and that file is week 3, published and drafted against,
so it must not be rebuilt: until the next Tuesday build this runs the OLD board at the NEW
cap. Week 3's shipped pool reads 8.8%, a pool priced at `PRICE_PROJ_W = 1` reads 19.8%, and
the same pool at the old $90M cap reads 42.3% and strands.

**And `#b-more` ran out, which is the same lesson from the other side.** The search for a
grey row drafts again through the real control, and that control was `#b-more`, which takes
the next of five CHANCES: the search could never look at more than five drafts. Five stopped
being enough at $110M. Measured over 4,000 greedy drafts on the shipped board, a man out of
reach appears on **12.1%** of boards, the median search finds one on the FIRST draft, p90 is
5 and p99 is 16, so **a five draft search fails 9.8% of runs**. A flake reporting its own
seed, about a feature that was on one board in eight the whole time.

**The answer is to never leave the draft screen.** `#b-abandon` re-seeds the current chance
and costs nothing, and the only reason it failed when this section was first written is that
the walk had finished a draft and moved on to the review screen, where that button does not
exist. So the walk signs at most five of the six, inspects all six boards, and abandons
rather than completing: the button is always there, chances are never spent, and the search
runs to 24 against a measured p99 of 16 and a worst case of 33.

**And the first two drafts of the new guard measured the fixture rather than the page.**
Asserting that discounting one man moves nobody else, it was asked of the DEAREST man and 47
others moved: the ceiling is anchored on the best man ON THE BOARD, so marking the anchor
questionable rescales everything under him, which is the pricing working. Moved to the middle
of a 60 man slice, 56 others still moved, because at 60 men the discounted man becomes the
bottom of the VOR range himself and `lo` moves with him. **A fixture small enough to change
its own percentiles is measuring the fixture.** Over the real 414 man board, 0 others move.

**THE PRICE COULD NOT READ AVAILABILITY WHERE IT SAT.** `pricePool` ran on line 533 and
`played_of` and `positionLevels` were both computed AFTER it, so the whole fix is half an
ordering change. Left alone, `projectedPoints` falls back to `plays = 1` when `played_of` is
missing and a level of 0 when the map is: no error, an ordinary looking set of prices, and
the exact defect still in them. **So `pricePool` throws** rather than trusting the order to
be remembered, on a missing level map and on any man with no `played_of`, and both halves
were proved by removing them.

**A WEEK ALREADY PUBLISHED MUST NOT BE REPRICED.** A price may never move once anybody has
drafted against it, and `fantasy_prices` for the live week is on the server. This changes
what the next Tuesday build produces and nothing that is already out.

##### The probe measured the new default against itself, and the guard is what caught it

Its baseline column was written `f: null`, meaning "price it the way the build does", which
was right for exactly as long as the build priced at zero. **The moment `PRICE_PROJ_W`
shipped that column became the blend**, so the file would have reported the defect it had
just fixed as untouched. Every rule states its own weight now, so moving the constant cannot
move what this file thinks it is comparing against.

**And the injection technique it inherited stopped working in the same instant.**
`probe_early.mjs` fakes a candidate estimate by scaling `half_ppg` so `shrunkPPG` lands on
the number wanted, which is sound while `pricePool` reads `shrunkPPG` and nothing else. With
a blend inside `pricePool` that estimate is blended a SECOND time: every column read one
weight to its right and the baseline read the shipped default. It surfaced as the whole
table shifting left by one column, which is visible only because the old numbers were on
screen a minute earlier. **`pricePool` takes the weight as an argument now**, so a blend is
one parameter and nothing is applied twice.

**`probe_early.mjs` had already been dead for a pass**, and this is how it was found. It
imports `PROJ_LIFT`, which the pass it argued for REMOVED from `weekly-pool.mjs`, so it has
thrown on load ever since and nothing said so, because a probe is a command somebody types
rather than a thing CI runs. The constant is declared locally as the history it is, and its
`shipped` candidate is the projection that actually ships, so its baseline column means what
its heading says.

#### But once the six ARE in, the total has to show its working

Reported by a player looking at five finished lineups: they wanted each man's projected
points for the week. The rule above is about the WHEEL, where the six are not in yet and a
per man figure would be the page guessing at a decision the reader is still making. On the
review screen and the entry screen the six are in and the total is already printed, so the
argument does not reach them. What those two screens had was **a headline with no working**:
`63.0` against `77.0` is two numbers to trust rather than two lineups to compare, and a
reader cannot tell a total carried by one man from six solid ones, which on a Sunday is most
of what separates them. That is the Full Team results screen's rule arriving at the screen
where somebody is choosing.

**It goes in the `.rs` column, the one the result screen puts the REAL score in**, and that
is the point rather than reuse. The rightmost figure on a man's row is his points on every
screen: projected before the games, real after, same place, same face, same size. A reader
learns one column and the card's own eyebrow says which of the two it is, so six rows do not
each repeat the word. **After the games it is deliberately not doubled up**: `.rs` is the
real score by then and the projection is already beside the real TOTAL on `in-vs`, which is
where this mode has always said it belongs, because the gap between the two is a fact about
the lineup rather than about any one man.

**THE PARTS ADD UP TO THE TOTAL EXACTLY, and that is a property rather than a hope.** Every
`proj` in the pool is one decimal and `D.projected` is their sum, so a reader can check the
headline by eye. Measured over 20,000 random lineups: no rounding seam, ever. So the guard
asserts the arithmetic **on the rendered page** and needs no tolerance. Asking `draft.js`
whether its own sum adds up is asking a function whether it agrees with itself; what can
actually break is a painter printing to a different precision from the one the total was
summed at, and only the glass can see that. Reintroduced as `toFixed(0)` it reports
`17+15+7+10+5+10=63.7`, which renders perfectly and is exactly the defect nothing else here
would catch.

**The price stays, quieter, to its left.** The money is spent by the time anybody reads the
review screen, so it is no longer a decision, but the spend line under the card is a total
with the same problem the projection had. Measured at 360 and 390: the longest name in the
pool (`Jacory Croskey-Merritt`, 144px) sits in a 198px column at the tightest, so nothing
truncates and the six rows hold one height.

#### The cap bound the lineup and never once appeared on screen

```
node football/build/test/probe_board.mjs
```

Reported by a player as always having enough for all the top men. **They did, by
construction.** `eligible()` filtered the position to men the roster could sign and `spin()`
drew from the DEPTH dearest of THOSE, so every man on every board was affordable, at every
pick, always. The cap decided the whole lineup and was never once seen.

**The cap sweep cannot find this and is not wrong.** `probe_cap.mjs` asks whether the cap
binds over a whole draft and on the live board it does: greedy gets through 97% of it, the
crossover with a budget bot is exactly at $90M, nothing strands. That is a question about the
totals and this is a question about one press.

**And the whole-pool price distribution is a red herring.** 48% of the 408 men sit at the
$3.0M floor, which looks alarming and means nothing: the wheel reaches 144 men and **0.7% of
those** are at the floor.

**What was actually wrong is the reach.** A spin draws five of the DEPTH dearest, so the
dearest man OFFERED is about the `DEPTH/(DRAW+1)`th best at that position: at a depth of
forty, the seventh, which on this board is **$24.4M against a $48M ceiling and $90M to
spend**. Nothing is ever refused, so nothing is ever a decision.

**So the board shows the men you cannot afford.** Drawn from the DEPTH dearest at the slot
regardless of what is left, a board holds something out of reach on **25.7%** of presses. One
seat is GUARANTEED signable, filled with the dearest man in range when the draw produced
none, because the reserve floor's job does not go away: drawn with no guarantee at all it
strands every single draft, which is the empty screen with no way on.

**The takeable count is what had to be checked before doing it**: 5.0, 5.0, 4.9, 4.5, 3.6,
3.0 across the six picks. A last slot offering one signable man and four grey ones is the
wheel picking the team.

**NARROWING THE REACH WAS THE OTHER CANDIDATE AND IT IS WORSE.** At a depth of 20 the dearest
man offered at the first press goes to $29.5M and the takeable count at the last two picks
falls to 1.7 and 1.3. That buys the budget by taking the decision away. `DEPTH` and
`CAP_MUSD` are both unchanged, and the cap sweep is unchanged in shape after it: crossover
still at 90, 97% spent, zero stranded.

**`canSign()` is one call and every reader asks it**: what greys a row, what refuses the
press, and what all three bots in `check-fantasy.mjs` and all four in `probe_cap.mjs` sign
from. That is the Full Team glow's lesson, where the picture read `roster.length` and the
board read `nextOpenSlot()` and the two came apart on four picks of six.

**The price is the one thing on a grey row that is NOT dimmed**, because it is the reason the
row is grey. That is only possible because the row itself is never faded: opacity on a parent
applies to the whole subtree and a child cannot opt back out, so the first version's
`opacity:1` on the price inside a faded row was a rule that did nothing. The parts are dimmed
instead.

**The guard presses the grey row rather than looking at it**, which is the dynasty lock's rule
again, and it walks up to eight drafts to find one. Greedy meets an out of reach man on about
a quarter of boards, so a six pick draft misses entirely about one time in five: the first
version walked ONE draft, came back "never once refused anything" and was reporting its own
seed.

#### A press asks before it spends

```
node football/check-fantasy.mjs   the section named A PRESS ASKS BEFORE IT SPENDS
```

Reported by a player: a press signed somebody outright, so a thumb landing on the wrong row
took a slot and money. **There is no undo here and there should not be one**, because a board
is derived from `(seed, pool)` and the roster, so putting a man back would have to un-draw the
board he was taken from. The only way out was **Start this draft again**, which throws away
every pick made so far to correct the last one.

**WHAT THE SHEET SAYS IS THE CONSEQUENCE, not "are you sure".** A confirm that only asks for a
second tap is a tap somebody learns to make without reading, and it would be the Full Team
coach grid's problem in miniature: a control that costs an action and tells you nothing. So it
names him, names the slot he fills, and says **what is left for the rest of the lineup** once
he is paid for. That last number is the one the row cannot say.

**THE TWO PRESSES ARE DIFFERENT MOMENTS AND THE SECOND ONE IS CHECKED AGAIN.** A sheet sits
open for as long as somebody leaves it open, so the draft can be started again or the chance
switched underneath it. `signPending` refuses a sheet about a board that is gone rather than
applying it to whatever is on screen now. That is `dynNewSheet`'s lesson arriving at a draft
board, and **it is not theoretical**: with the clause removed the guard drives exactly that
sequence and reports `0 -> 1`, a man signed into a draft that had just been restarted.

**Closing is the SAFE answer here**, which is the difference from the injury sheet where either
is, so the scrim closes it too and tapping around the edge can only ever cost a press.

**The row's two refusals are unchanged and now have a second thing to assert.** An injured row
still opens the REPORT and an over-budget row still does nothing, and both are sheets over the
board, so "a sheet came up" has stopped being the same claim as "the right sheet came up". A
press that offered to sign a man the page has already said cannot play would render perfectly.

**`matchup()` is the club line written once.** The row and the sheet both draw a man's club and
who he plays, so `.club` and `.vs` are one CSS rule each rather than the `.who s .club` pair
they were: `em` and `i` are italic by default, and the second surface to forget those rules
prints the code in italics with nothing to say so.

**THE SHARED HELPER IS WHAT MADE THE GUARD CHEAP, AND IT IS ALSO WHAT MAKES A MISSING CONFIRM
LOUD.** Every walk in `check-fantasy.mjs` signs through `signOne`, so the confirm went in once.
Removed from the page, the suite dies in its first browser section naming `#cf-sheet` rather
than timing out on a slot that never fills. It waits for that selector by NAME instead of
leaving it to the click's own timeout, because "the confirm never opened" and "the confirm
opened and its button does nothing" are two different faults and a bare click reports both as
the same thirty second hang.

**Measured at 360x740 with the longest name the pool can produce**, which is
`Jacory Croskey-Merritt`: nothing overflows and both buttons are fully on the screen. What is
asserted is the BUTTONS and not the height, because the sheet is bottom anchored, so a tall one
pushes its own eyebrow off the top and that is fine. The control the page is waiting on going
off the screen is what must never happen, which is the boss battle's Continue button arriving
at a sheet.

#### The board reveals, and it does not step

Reported alongside the two above: nothing is revealed and the screen is jumpy.

**Measured first, and the obvious diagnosis was wrong.** The hoops draft board's fault was a
collapse (`drawInto` emptied the containers and the court moved 1,554px). Here the board's top
never moved at all. What was wrong is that there was no motion of any kind: five men were
replaced by five different men between two frames, with nothing on screen saying which one was
taken.

**The rows are in the DOM before they are readable**, dealt 55ms apart, which is what keeps
the box exact on the first frame. A skeleton of placeholders cannot: a row with a two line
stat line is 74px and a one line one is 63, so stand-ins step the moment the real men arrive.

**A press is acknowledged before the board changes.** The row you took goes green and holds
for 170ms while the other four fall away. **A second press inside that window is refused**, or
a double tap signs a man out of the previous slot's board into the next slot. The state is
written immediately and only the PAINT waits.

**AND THE STAT LINE IS FLOORED AT TWO LINES AS WELL AS CLAMPED AT TWO.** The clamp held a row
to one height within ONE board and said nothing about the next one, so a board of one line
stat lines is 63px a row and the one after it is 74: signing somebody moved everything under
the board by up to **31px**, on four presses of five, measured through the real page at
390x844. Now 0px on every press.

**Every timer is cancelled on a screen change and checks it is still working on the draft it
was started for.** A stagger firing into a board that has been rebuilt leaves rows stuck at
opacity 0: a board with men on it nobody can read, and nothing throws. `show()` cancels, so
callers going TO the draft screen show it BEFORE they paint it.

**The guard measures the glass over a whole draft at a phone**, and asserts properties that
survive a redesign: every row ends up readable, it is over inside a bound, and the thing under
the board does not move while it happens. Both defects were proved by reintroducing them
alone, **and one of its claims was passing vacuously**: with the stagger stopped part way,
`signed` is 0 and the worst settle time is 0, so a bare `< 1500` reported green on a board
that never became readable at all.

**The top of the board is the best man on it, not the 99th percentile.** That anchor is
inherited from a pricing built over tens of thousands of finished seasons where the 99th
percentile is deep. One week is about 500 men, so it is five men in: measured over twelve
weeks, four to seven men sat on the $48M ceiling every week with up to 7.6 points of
projection between them, and the dearest slot was "take the highest projection". Anchored at
the maximum, exactly one man reaches it every week by construction.

**The board is priced against ITSELF.** A man whose club is idle is off it and out of the
anchors, or a leader sitting a bye sets a ceiling nobody draftable can reach.

#### A row is three lines, and the clubs wear their own colours

Reported with a screenshot: the stat line was hard to read, and the teams should be colour
coded. Both were true and they are one fix.

**The matchup and the stats shared the NAME COLUMN**, which is about 215px at 390, so
`DET vs NYJ · 533 pass yds, 6 TD, 9 rush yds, 0 TD` ran to two lines with `TD` orphaned on
the second. The stats are a row of their own now, spanning the whole button: **334px against
215**, one line, at every width down to 320 with 47px still spare in the harness's own wider
fallback face.

**It retires the two line floor rather than working around it.** That `min-height:2.6em` was
there because a board whose five stat lines all fitted on one line was 63px a row and the
next board was 74, so signing somebody moved everything under the board by up to 31px. Every
row is now a name, a matchup and a stat line whatever is on it, so one height is a property
of the SHAPE and not of a number somebody has to remember.

**A GRID AND NOT A WRAPPING FLEX ROW**, which is a correction. `flex-wrap` with
`flex:0 0 100%` on the stat line is the obvious way to give it a row and works perfectly at
390. Wrap is a property of the CONTAINER, so it cannot be granted to one child: at 320 the
chip, the name and the price no longer fit on one line either, the price wrapped onto its
own, and that row came out **121px against the other four at 81**. Named areas are two rows
at every width by construction.

##### Thirty of the thirty two club colours are unreadable as published

`football/fantasy/clubs.js`. This is the hoops wheel's finding arriving at a second game. The
row sits on `#131a2b` and against it only Cincinnati and Denver clear 4.5:1; Las Vegas is
**1.21:1** and Pittsburgh **1.03:1**. Dropping the site's table in would have given a board
where almost every tag was invisible, with nothing to report.

**The PRIMARY is lifted, and that is right for twenty nine of the thirty two.** Picking
whichever of a club's two published colours reads better puts **fourteen clubs in one gold
bucket**, because most NFL secondaries are gold, and worse it stops naming the club:
Washington comes out gold rather than burgundy, Dallas silver rather than navy. The primary is
the identity, so the primary is what is lifted: hue kept, lightness raised until it clears,
saturation floored on the way up or a navy arrives as a pale grey.

##### A BLACK HAS NO HUE TO LIFT, AND THE MEASURE FOR THAT WAS THE WRONG ONE

Reported by a player: Vegas should be white and Pittsburgh should be yellow. They are right,
and Pittsburgh was the worse of the two, because **the Steelers were on the board in blue**.

| | published primary | shipped as |
|---|---|---|
| Las Vegas | `#000000` | `#828282`, a mid grey |
| Pittsburgh | `#101820` | `#4f86bc`, **a blue** |
| New Orleans | `#101820` | `#4f86bc`, the same blue |

**HOW MUCH COLOUR A HEX CARRIES IS ITS CHROMA AND NOT ITS HSL SATURATION.** Saturation is
divided by how dark a colour is, so it EXPLODES near black: `#101820` is **6% chroma** and
reads **0.33 saturation**, which sailed over a floor of 0.12 and was then raised to 0.45 on
the way up. A hue that is six percent of a black pixel is noise, and the lift was amplifying
the noise into a colour. This is the hoops wheel's own note ("HSL lightness is not
brightness") arriving one step along, at saturation.

**`CHROMA_MIN` is 0.08 and the band is thin, which is worth knowing before moving it.** Sorted,
the primaries run 0.0 (Las Vegas), 6.3 (the two blacks), **9.0 (GREEN BAY)** and 12.2. About
one point of room each side, and Green Bay is what the top of that gap defends: `#203731` is a
genuine dark green with very little chroma in it, and a floor at 0.10 turns the Packers grey.

**IT CHANGES NO COLOUR ON THE BOARD TODAY**, because all three clubs it fires on are named in
`SECOND` and sourced from a colour needing no lift at all. It is the backstop: without it the
next club to publish a black primary goes quietly blue and nothing anywhere says so.

**`SECOND` is three clubs, written out by hand.** Vegas silver, Pittsburgh gold, New Orleans
gold, and all three clear unaided (7.54:1, 9.87, 9.38) so what ships is the published hex
untouched. **New Orleans was not reported and is on the list anyway**: it publishes the
identical `#101820`, so it drew the identical blue, and fixing one of that pair leaves the
same complaint on the board. **Nothing in a pair of hexes says which one a fan would name**, so
this is observed rather than derived, the way the sprite pack's `FILE_DRAWS` is: the geometry
can say a primary is colourless and cannot say Cleveland's brown is fine while Carolina's black
second colour would be worse. The guard asks for membership of a list, and the list is short on
purpose.

**Both directions are asserted, because a club wrongly ADDED to that list is the blanket rule
above arriving by the back door**, and the way that shows up is a board where most tags are
yellow.

**AND THE FIRST VERSION OF THAT GUARD PASSED GREEN ON THE DEFECT.** It walked
`Object.keys(CLUBS.SECOND)`, which is the keys of the thing under test, so an emptied list has
nothing to disagree with. The three codes are written out in the checker now. A second copy of
a three item list is the right price for a claim that is about the page rather than about
itself.

**The drift check reads BOTH hexes now**, which is not thoroughness: three clubs are drawn from
their second colour, so a stale second entry is a club wearing a colour the site does not think
it has. Before those three existed it read the primary alone and the second column could have
been anything at all.

**The blues converge and that is the league, not a defect.** Three pairs are identical in the
published data before anything is done to them (New England and Seattle are both `#002244`,
Dallas and the Rams both `#003594`, Cincinnati and Denver both `#FB4F14`). It was four until
New Orleans and Pittsburgh came off their shared `#101820`. The tag carries the three letter
CODE, so the colour is reinforcement and never what identifies the club.

**THE RAMS HAD NO COLOUR AT ALL, AND A FIVE ROW BOARD MEETS THEM ABOUT ONE WEEK IN SIX.**
nflverse spells them `LA` and the site's table spells them `LAR`, so that one club fell
through to the line's own grey: not an error, not a wrong colour, a tag nobody would think to
question. It is `espn.mjs`'s own note about `WSH` and `WAS` arriving at a colour. Found only
because the guard asks every code the POOL can produce rather than the five a board dealt, and
it is an ALIAS rather than a new row in the table, because that table is asserted to match
`engine.js` hex for hex and a club added to suit this page's data source would break the
comparison that stops the two copies drifting.

**The lift judged the unrounded colour and shipped the rounded one**, which is half a step and
is the difference between 4.48 and 4.50: Green Bay and the Giants were accepted and then did
not clear. Decide on the value that ships, which is this repo's own rule at a fourth door.

##### Two measurements that were of the animation rather than of the layout

**`getBoundingClientRect()` INCLUDES TRANSFORMS.** The reveal animates each row in at
`scale(.985)`, so read mid deal every row came back 80px where its laid out height is 81, and
two rows read differently from each other purely by where they had got to. "Every row is the
same height" passed or failed on timing. `offsetHeight` is the used layout box and ignores
transforms, which is the property actually being claimed.

**`scrollWidth` IS FLOORED AT `clientWidth`**, so a spare computed from it is zero on a row
that fits and zero on a row that exactly fills. It reported `0px spare` on a board with 117px
of room and could never have said anything else. Measured with a Range over the text node it
reads what is actually there.

**And one 39px failure was the screenshot I took to look at the board.** Three runs without it
report 0px. This file's own rule applies to its own instrument: it is not a flake until it is
measured, so it was measured rather than dismissed.

**The name line needed an explicit `line-height`**, because `normal` is a font metric: it
wobbled 21.638px to 21.750px name to name, which rounded to two different whole pixels at some
widths and one at others. Pinned, the row is three line heights and its padding, which is
arithmetic.

#### A man who is not playing is not a pick

```
node football/build/injuries.mjs                 what the report says about the live week
node football/build/injuries.mjs --write         and write the file the page reads
node football/check-fantasy.mjs --quick          the engine half, no browser
node football/check-fantasy.mjs                  the chip, the press and the sheet
```

Reported by a player with a screenshot: the wheel offered **Nico Collins at $8.5M**, and he
had been ruled out in week 2 with a hamstring. It was right to. The pool is built from what a
man has DONE and from the SCHEDULE, and neither of those has any idea whether he will be on
the field, so nothing anywhere refused him. The board rendered, the price was correct, the
lineup was legal, and it was worth nought.

**Two sources, and they answer two different questions.**

| | asks | so that |
|---|---|---|
| `players.csv` | is he on a roster at all | injured reserve is not a designation to read |
| `injuries.csv` | what did his club file this week | Out, Doubtful, Questionable, the body part, the practice |

**Injured reserve, Out and Doubtful all take a man OFF THE BOARD.** That is a reversal, made
by the site's owner on launch day, and the old argument is worth keeping so nobody restores
it by accident. An Out or Doubtful man used to be **drawn in red and refused on the press**,
on the ground that the report is the most useful thing a board can say about a man a reader
was about to take. The answer to that is arithmetic: a board is five seats, and a seat
holding a man nobody can take offered the reader nothing. It was a choice that was not a
choice. **Doubtful goes with Out because the data says it is Out**: 99.2% of doubtful men
blank, against 47.7% of questionable ones. Questionable is a real decision and stays.

It is done in `applyInjuries` in the page, beside injured reserve, and `D.hurt()` in
`draft.js` still refuses both as a second line. **`BY_ID` is never filtered**, so a man
signed before he was ruled out stays in that reader's lineup and his chip still opens the
report.

The guard's non vacuous half is the COUNT: the front page prints how many men are on the
board, and that number is asked for with all three removed, while the live file is required
to hold at least one Out or Doubtful man. Without that second clause the old rule and the
new one give the same count and the assertion says nothing.

#### The report cannot say Out until Friday, so the site can

```
football/data/fantasy_ruled_out.json     keyed "season-week", id and name
node football/build/injuries.mjs --write the list is applied here, and by the workflow
```

**Found by the owner on launch day: Jayden Daniels was offered, unmarked, and was not
going to play.** Every row in the file was correct. nflverse had him as `Elbow, Did Not
Participate In Practice` with NO designation, because for a Sunday game the Wednesday and
Thursday reports are PRACTICE reports and Out, Doubtful and Questionable are only filed on
the Friday. So a man his club has already ruled out reads, in the one source this trusts,
exactly like a man having a rest day, for two of the four days a week is open.

**The list is applied in the BUILDER and not the page**, so there is still one file saying
who cannot play and the twice daily refresh keeps it. The workflow runs the builder, the
builder reads the list, and the bytes stay identical until the report or the list moves.

**The name is written beside the id and both must match the board, or it throws.** A hand
edited list of opaque ids is how the wrong man is ruled out: one transposed digit and a fit
receiver leaves every board with nothing to say why. A name alone is worse, for the reason
`check-namesakes` exists.

**It never softens a roster** (injured reserve stays `off`), and **it does not pretend to be
the report**: the entry carries `by: 'site'` and the sheet says RunThe.GG ruled him out,
because every other sheet names the official NFL report as its source and that would be
false about exactly him. **A ruling outranks the report**, so an entry for a man who is
cleared has to be deleted by hand.

#### And a designation expires when his club files without him

Rebuilding for Daniels turned up the opposite fault. The builder kept the LATEST ROW per
man, so Kyler Murray and Jauan Jennings came out "out (week 2)" off a Minnesota that had
already filed week 3 with eight names and neither of theirs. The report lists the men a
club is worried about; a man it leaves off is practising in full. It was already wrong (they
were drawn red and refused) and it went invisible the same afternoon, when Out stopped
being drawn: two healthy players would simply have left every board.

**The rule is per CLUB and not per calendar.** A row is dropped once its club has filed a
newer week. On a Tuesday no club has filed the coming week, so every carry forward the
header argues for is untouched. It is keyed on the row's own club, which is the one that
filed it.

**THE SPLIT IS MADE IN `draft.js` AND NOT IN THE PAGE**, because four separate things ask a
version of "can this man fill this slot": what greys a row, what refuses the press, what the
reserve floor promises the last slot will cost, and which man fills the guaranteed signable
seat. Written in the page, the board offers a seat that refuses the press, or worse promises
a $3.0M tight end who is on injured reserve and strands the draft at the last slot with
nothing legal on it. That is the Full Team glow's lesson: the picture and the rule read one
function. `D.hurt()` is that function and `canSign` already carried the other half.

**The reserve floor has to step over them**, and the guard nearly could not see it: 48% of
the board sits at the $3.0M minimum, so knocking out ONE man at the floor leaves the floor
exactly where it was and the assertion compares a number with itself. It marks every man at
the floor now, and it moves.

#### It is its own file, because prices must not move and injuries must

`football/data/injuries_<season>_w<week>.json`, fetched beside the pool and merged over it.
A price may never move once anybody has drafted against it, so the board is written on the
Tuesday and left alone. The game status report is first filed on the **Wednesday**, firmed up
on the Thursday and final on the Friday, and a club can file an IR move on any day. Baked
into the pool, the only way to learn somebody is out would be to reprice the board underneath
everybody who had already used it.

**The week's report does not exist on the Tuesday and that is not an error.** The file carries
`report_week`, which is allowed to be behind the week being played, and the sheet SAYS so:
"From the week 2 report. Week 3 has not been filed yet, so this is the last thing that was
said about him." A man ruled out on Sunday is the best available answer about next Sunday
until Wednesday, and printing it as this week's would be inventing a certainty nobody has.

**`.github/workflows/fantasy-injuries.yml` refreshes it twice a day and commits only when it
moved**, which is about three times a week. That is the opposite of `fantasy-live.yml`, which
commits nothing because it runs every ten minutes: a hundred commits a weekend is a hundred
Cloudflare deploys. At twice a day a static file is the simplest thing that works, with no
migration and no round trip, and **a week with no file behaves exactly as the mode did before
any of this existed**.

##### And that rule shipped false, because the file carried a clock nothing read

The report was written with `built: new Date().toISOString()`, so its bytes changed on every
run whether or not one word of it had moved. `git diff --cached --quiet` was therefore never
quiet and the job committed on **every firing, twice a day, for ever**, which is the hundred
deploys the cadence argument above exists to avoid, arriving at a third of the rate and by a
door nobody was watching. **The first cron run after it shipped proved it**: one commit,
`{"off":5,"flagged":20,"known":35}` either side, and a one line diff holding nothing but the
timestamp.

**That is 110's `results_sig` argument arriving at a static file.** A clock written on every
CHECK says the answer changed every time anybody looked at it, which is the frozen feed
wearing a fresh timestamp. There the fix was a signature over the rows; here it is to not
write the clock at all, because the file IS the comparison and git already records when it
last moved. **Nothing read `built`**: not the page, not the sheet, not the guard. Neither
sibling data file carries one either, so it was the exception rather than the convention.
`report_week` is what a reader actually needs and the sheet already prints it, and a run that
fails is loud rather than silent, because the workflow goes red and its read-back step throws.

**THE FIRST GUARD RACED THE CLOCK AND PASSED WITH THE DEFECT IN.** Written as two builds back
to back, it compared two `new Date().toISOString()` calls that land in the same millisecond,
so it reported byte equality on exactly the output it was written to catch. It bites on about
one run in however many milliseconds the two calls straddle, which is nothing. `Date` is
driven an hour between the two builds now, which is this repo's own rule about the late meter
answer: **a timing property cannot be checked by hoping to lose the race.** Reintroduced, it
reports `the output carries a clock`.

**And it asks for byte stability rather than for the absence of one field.** Written
`!out.built` it would pass the day somebody adds a different timestamp under a different name,
which is exactly how this one arrived. Proved end to end against live nflverse data: two real
builds, identical bytes.

**A BOARD IS DERIVED FROM (seed, pool), SO A POOL THAT SHRINKS REDRAWS IT**, and that is
accepted rather than worked around. Inside one visit nothing moves, which is what the reload
guard is about. Across a refresh an unsigned board can come back with a different man on it,
and the alternative is a wheel that goes on offering somebody the league has ruled out
because it was drawn before anybody knew. What is stored is ids, so nothing a reader has
actually SIGNED can move: `BY_ID` is built before the merge and is never filtered, or a
lineup holding a man who went on IR on the Wednesday would be a screen reporting five.

**A cleared man is not a warning.** 55 of the priced men carry a report row with no
designation and **45 of those practised in full**: one board row in nine wearing a mark that
means "he was on the report and he is fine". They are dropped at BUILD time rather than hidden
in the page, because a row nothing can draw is a row nothing can open. The ten who did not
practise fully keep their chip, which on a Tuesday is the most useful thing the report has.

#### The chip, and the press it takes

**The red chip is now only ever seen in a LINEUP**, on a man somebody signed before he was
ruled out, because the wheel no longer offers Out or Doubtful men at all (see above). On the
board a chip is gold (`Q`) or the quiet `INJ` of a man who did not practise and has no
designation yet, and both of those are real picks.

**Red for a man who will probably not play, gold for a man who might.** Two decisions, two
colours; one colour for both would be the board saying the same thing about a hamstring that
has ruled somebody out and one that has not. `Q` is the one abbreviation kept, because it is
what a questionable man is called everywhere this mode's readers have seen one. DOUBT is not
a word, so it is spelled.

**AN INJURED ROW IS NOT `disabled`, AND THAT IS LOAD BEARING.** A disabled button swallows
every pointer event in its subtree, so a chip on one could be read and never tapped, and the
report is the whole reason that row is drawn. The press is refused by `canSign` instead,
which is the same call that greyed it.

**And a row that refuses and does nothing is a wall**, which is this repo's own rule about a
locked door arriving at a list. Pressing anywhere on an injured row opens the report. **Found
by the guard**, which clicked one and waited thirty seconds for a signing that was never
coming.

**Two things only a screenshot could say**, both of which render perfectly:

- **The name was truncated to make room.** `cannot be picked` is sixteen characters in the
  price column, which took about 26px off the name and left `Zay Flow...` on the one row
  where knowing who it is matters most. It is `cannot pick`, the same length as the
  `over budget` that sits in that slot already.
- **The name line had to become a flex row.** As a block with `text-overflow`, a chip on it
  wraps onto a second line and that row is taller than the other four, which is the board
  stepping again. The name is what shrinks, inside its own element; the chip never does.

**What the sheet says is the REPORT and it does not pretend to be anything else**: the
designation, the body part and whether he practised, which is what a club is obliged to
publish and what every fantasy site is reading when it says a man is questionable. It is not
a beat writer's paragraph and the last line names the source. Writing the other kind needs a
news feed, and **the two that would serve are refused by this machine's egress proxy**, so
nothing here could have been checked against one. Said plainly rather than shipped as a
sentence that looks like reporting.

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

**EVERY NUMBER IN THAT TABLE IS A PRICE BUILT ON `shrunkPPG` AND THE CAP IS $110M NOW.** The
same sweep against a price built on the projection puts the crossover at about 108 and $90M
strands, which is written up in full under `PRICE_PROJ_W`. The rule that picked the value did
not change; the board it was measured on did.

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

#### And it settled last week ahead of publishing this one, so this one was never published

**THE STEP'S OWN COMMENT SAID THE WRITE THAT MUST NOT BE MISSING GOES FIRST, AND THE CODE
UNDER IT PUT THAT WRITE SECOND.** The comment was right and it had been read as a
description of the code rather than as a claim about it, which is the direction that costs
something: `fantasy_results` carries a foreign key onto `fantasy_weeks`, the previous week
had no row, the results publish raised, `set -e` took the step down, and **the board this
job exists to write was never sent at all.**

It happened on the first Tuesday after the chain was deployed, and the log says it in one
line: `Key (season, week)=(2026, 2) is not present in table "fantasy_weeks"`. Week 2 was
played before any of this existed, so no week row for it was ever written and none ever
should be. The run went red, `Commit the week` was skipped with it, and what a reader would
have met is a mode drawing a wheel that refuses every submit.

**THE FILE ON DISK CANNOT ANSWER WHETHER A WEEK WAS OPENED, WHICH IS THE WHOLE MISS.** The
guard was `[ -f results_<season>_w<prev>.json ]`, and `Score the week that just ended`
writes that file on every single run, for any week that has been PLAYED. Played and open
are two different questions and only the server holds the second. It asks
`fantasy_weeks` now, **on its own line and never inside the `if`**, because `set -e` does
not fire on a command in a condition: written there, an unreachable database hands the test
an empty string and the step carries on past a question it never got an answer to.

**The board publish moved above it, and nothing is given up.** "Results before prices" is
the two BUILD steps' rule and it is about the files: a week whose board rolls forward on
disk before its result is written is a week somebody played and can never see. On the server
these are two tables about two different weeks, neither reads the other, and
`fantasy_now.json` is not written in that step at all.

**Both arms were driven against a real Postgres 16 holding the chain**, with the step body
extracted from the workflow by yaml rather than retyped. The shipped order reproduces the
live failure exactly, same message and same exit 3, with **week 3 priced 0**. The order that
ships now publishes 408 prices and skips week 2 by name. The other three branches were
driven too, and the one that matters is that a week which really WAS opened still gets its
results: 40 rows, rather than a guard that has quietly stopped settling anything.

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

#### "No lineups before the lock" was implemented as "no rows", and those are two claims

```
psql -d fantasy -f supabase/112_fantasy_entrants.sql
psql -d fantasy -f supabase/test/fantasy_entrants_test.sql
node football/check-fantasy.mjs      the section named WHO IS IN
```

The argument one section up is sound and is not weakened by any of this: a list of everybody's
lineups before kickoff is the answer key handed to whoever enters last. What was wrong is that
the rule was enforced by answering NOTHING, so the only thing this screen could say to
somebody who had just entered was a count on a label. Reported by a player, who asked to land
on the board after submitting and see who else was in.

**THE PRE-LOCK ANSWER IS A LIST OF NAMES, AND IT IS A SEPARATE FUNCTION RATHER THAN A FLAG ON
THE STANDINGS.** `fantasy_entrants` selects no pick, no projection, no spend and no score, so
the payload a reader gets before kickoff CANNOT carry a lineup however the page draws it.
Nulling those columns out of `fantasy_standings` would have been one `case` away from leaking
the thing the lock exists to protect, and the way that fails is silent: a correct looking board
with the answer key in the network tab. **So the SQL test asserts the key set as a SET.**
Written as "no picks key" it goes quiet the day somebody adds a fourth field, which is exactly
how a leak of this shape would arrive.

**EXACTLY ONE OF THE TWO IS EVER POPULATED**, and the lock is the one thing that decides.
Entrants before it, rows after. Two lists of names would be two answers to one question, and
they would disagree the first time either was edited. `entry_no` is the same key either side,
because no entry can arrive after the lock, so a row does not change key at kickoff.

**IT DISCLOSES NOTHING NEW.** These are the display names the board already publishes after the
lock, and the entry count is already public before it. What changes is that the count has the
names in it.

**The door is drawn when the board has something to SAY, read off the answer rather than off
the clock.** It used to be the lock and nothing else, correctly: before 112 the only pre-lock
answer was no rows, so a button here would have taken somebody somewhere to be told nothing,
and that is still exactly what it does against a database without the migration.

**ABSENT IS NOT EMPTY, and the entry count is what tells them apart.** SQL is deployed by hand
and this page by a push, so a database still on 111 answers with no `entrants` key at all while
the week genuinely has entries in it. Read as "nobody", that is the page telling a reader the
competition is empty on the evening it fills up. So the page falls back to the sentence it has
always drawn, and the guard's first arm IS that database: the fixture leaves the key out
entirely rather than defaulting it to an array.

**A third sentence arrived with it that nobody had ever read.** This screen could not be
reached before the first kickoff until there was something to say, so "Week 3 is not being
played right now. This is how it finished" was only ever seen after a week had finished. Read
before one starts it is wrong about a week nobody has played a down of.

**The pre-lock list is asked once per visit and not polled.** `boardLive` is unchanged, so the
twenty second poll still only runs while the games are on. A list that moves a handful of times
between Tuesday and Thursday does not need a request every twenty seconds for two days, and
`openLive` asks on the way in, which is the moment somebody wants it.

**A SUBMIT LANDS ON THE BOARD, not on your own six.** The entry screen is a correct receipt and
answers the wrong question. The board carries the confirmation anyway, because the reader's own
row is on it and is marked, so nothing is lost by going to the screen that also says who else
is in. The receipt is one press back, and the guard asserts that from the other end: moving a
destination is how a redirect quietly costs a screen.

**And the two halves are guarded in two files, which is 107's own split.**
`check-fantasy.mjs` fabricates an `entrants` array and hands it to the painter, so it says
nothing about what the server sends; `supabase/test/fantasy_entrants_test.sql` drives the real
function. Four defects were reintroduced one at a time to prove that file bites: dropping the
lock clause, adding a fourth key carrying the lineup, dropping the `coalesce` on `is_me`, and
`security invoker` in place of `security definer`.

**One of its claims could only ever pass, and the shape is worth recognising.** The first
version asserted that `anon` may CALL the function, on 109's "RLS narrows a grant, it does not
make one". That rule is about TABLES: Postgres gives PUBLIC execute on a new function by
default, so the assertion passed with the grant line deleted. What actually says something is
the definer: `anon` gets the list AND is refused a direct read of `fantasy_entries`, and both
halves have to be asserted together or the pair is one careless `security invoker` from being a
list nobody can read and one careless policy from being a table anybody can.

#### A refusal said into an empty room is a button that does nothing

Reported as "nothing happens when I press submit". Something did: the server refused it, in one
of the nine sentences below, and the page wrote that sentence into `#r-say`, which is the lede
at the TOP of the review screen. Measured through the real page at 390x844: the page is 1691px,
the reader has scrolled to the Submit button at y=673, and **the refusal landed at y=-715,
which is 694px above the top of the window.**

**Nothing threw, nothing rendered wrong, and the sentence was correct.** It was 694px away from
the thumb that had just pressed the button.

It is its own box now, red, directly above the button, with a `scrollIntoView` for the case
where it still is not. **The guard measures the rectangle against the phone rather than reading
the text**, because `innerText` does not care where an element is and that section passed on
this for as long as it has existed. It asserts the lede is NOT carrying it as well, so the box
cannot quietly move back to the top of the screen.

**The page owns the JOIN and not the words.** Those nine sentences are written to stand alone
and start lowercase (`sign in to enter`), so pasted after a full stop they read `Not entered.
sign in to enter`. `asSentence()` capitalises the first letter and closes it, which is
presentation rather than translation: not one word moves. Found by taking a screenshot and
reading it, which is the fourth time on this mode.

#### And what it was actually saying was `column p.display_name does not exist`

```
psql -d fantasy -f supabase/113_fantasy_submit_username.sql
```

**AN ACCOUNT'S NAME IS `username`.** `supabase/10_accounts.sql` has no `display_name` column
at all, and every other board on this site copies the name out with `select username::text`:
108 for hoops, 97 for baseball, 53 and 66 when they denormalise it onto a run.
`fantasy_submit` alone asked for `p.display_name`, so **every entry anybody ever tried to make
raised**, and not one lineup was ever recorded. The column on `fantasy_entries` is correctly
called `display_name` and is not what was wrong: only the READ from `profiles` was.

**THE FIXTURE IS WHY NO TEST CAUGHT IT, and it said so in its own comment.**
`supabase/test/fantasy_base.sql` built `create table public.profiles (id, display_name)` under
a line reading **"Only the column 109 reads"**. That is a stand-in written to agree with the
code it stands in for rather than with the table that exists, so all four suites (109, 110,
111, 112) passed against a database production does not have. It is the real shape now, citext
and unique constraint included, and the 109 suite fails on the old read with the player's exact
error at line 101.

**A fixture allowed to invent the schema can only ever certify that a function agrees with
itself.** That is this repo's oldest lesson arriving at the account layer, and it is the fifth
time a stand-in here has been wrong in silence.

**`raise exception` IS `P0001`, AND THAT IS THE ONE HONEST WAY TO TELL A SENTENCE FROM
MACHINERY.** `SAY` in `entries.js` asked whether a message was short and not an all-caps code.
`column p.display_name does not exist` is 36 characters of lower case English and passed both
halves, so the page put the inside of the database on screen, under SUBMIT THIS LINEUP, on a
phone. Nine sentences reach a reader because a person wrote them with `raise exception`, which
carries SQLSTATE `P0001`; a missing column is 42703, a missing function 42883, a denied table
42501, and PostgREST's own refusals are `PGRST...`. **Keyed on `code`, so it is a property of
how the message was produced rather than a second copy of nine strings**, which is the thing
the paragraph above refuses to write.

**The machinery is MOVED rather than dropped.** Reading the raw message off a player's
screenshot is exactly how this was found in one round, so it goes to `console.warn`: a
developer gets the whole answer and nobody is shown a column name mid-draft.

**And the JS stub had the same fault as the SQL fixture, in the same week.** It answered
`{ message }` with no `code`, because nothing read one. A stub that cannot express the
defect a player met is a stub shaped to suit the checker, so it sends the SQLSTATE now, which
is what PostgREST always sends. Both halves of the new arm were proved by restoring the old
filter: it reports `Not entered. Column p.display_name does not exist.`, which is the
screenshot.

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

**Pro buys DRAFTS, and that reverses a rule this mode launched on.** It said Pro must not buy
draws or entries, because selling an advantage in a prize competition is a different kind of
product. The owner decided otherwise (2026-10): a free account gets **three** drafts a week and
Pro gets **five**, on both competitions. Still one ENTRY each, and Pro does not change a price,
a board or a score. `chancesAllowed()` on each page is the rule.

**What it is worth, measured before it was built** on the week 4 board, as projected points of
the best lineup a reader can submit: careful drafting 77.3 from three drafts against 78.2 from
five, **about a point**; casual drafting 69.8 against 71.4, **about a point and a half**. Two
good drafters with five each finish within about a point of each other, so the edge is the
size of the race for first. **It also has a legal shape worth checking with somebody
qualified**: the draft wheel is random per reader, there is a prize, and payment now buys more
draws at it, which is the prize, chance and consideration triple a free contest normally
avoids. Said out loud rather than designed around quietly.

**Pro is `premium_products()`**, so a plan, a lifetime bundle and a Fantasy prize pass all count
and a lapsed one does not. **An unknown answer is free**, because auth.js answers `[]` on any
error and that never hands out the paid edge by accident. **A draft already made is never taken
away**: the count is at least the drafts that exist, so a lineup started under the old five, or
during a pass, can still be finished and submitted. It is the browser's rule, as the five always
were: the server checks a lineup and never how many drafts it came from. The review screen tells
a free account that has run out that Pro gets five, and links to `#pro`, which opens the store
on each game's front page the way `#signin` opens the account sheet.

#### A man ruled out can be swapped, before his game

```
psql -d fantasy -f supabase/119_fantasy_swap.sql
psql -d fantasy -f supabase/test/fantasy_swap_test.sql
node football/build/publish-out.mjs | psql "$SUPABASE_DB_URL"
node football/check-fantasy.mjs   the section named A MAN RULED OUT CAN BE SWAPPED
```

Reported by a player: a lineup that went in on the Tuesday holds a man his club rules out
on the Friday, and the only thing the mode did about it was score him zero. The report goes
final on the Friday and the week locks on the Thursday, so **the swap works after the lock**.
A swap that stopped at the lock would help almost nobody.

**The rule is the server's and every clause is a row.** The man going out is in your lineup,
is on `fantasy_out`, and his game has not kicked off. The man coming in plays the same
position, is on this week's board, is not out himself, has not kicked off, and keeps the six
under the week's cap. Each refusal is its own sentence and the SQL test asserts each by its
sentence. **An unknown kickoff is refused, never read as not started**, which is the same
fail-closed rule the submit runs on.

**Nothing downstream needed changing, and that is the reason it is a rewrite of `picks`.**
Every score on the site is derived from `picks` at read time: the board, your place, the
settle in 114. So a swap is one `array_replace` and the new man is scored from then on.
`spend` and `projected` move with it, and `swaps` keeps the history on the row.

**`publish-out.mjs` fills the two things the server needs** off the two files the page
already reads: `fantasy_out` from the injury file (off, Out and Doubtful, the same three the
page takes off the wheel, and a site ruling counts), and `team` and `kick` on
`fantasy_prices`. **It never touches a price.** `fantasy-injuries.yml` runs it on every
firing, because a site ruling arrives by a push rather than by the report. A missing secret
or a database without 119 is a warning there, not a red run: the file has already been
committed, and the swap fails closed either way.

**The page only offers what it expects the server to take.** The call is drawn on the entry
screen for a man who is out and still to play, and only for an entry on the account. The
sheet lists the men the server would take in, best projection first, twelve at most. A
refusal shows the server's own sentence, because a game can kick off while the sheet is
open. `swap` rides on `API_VERSION` 3, so a stale `entries.js` costs the offer and never the
page.

**What it cannot do, said plainly.** A late inactive on Sunday morning is not in the Friday
report, so he is only swappable once he is on `football/data/fantasy_ruled_out.json`. After
the lock a swapper can see the field's lineups, which is a small edge. And a man out whose
owner never comes back still scores zero: nothing swaps for somebody who is not there.

### The board moves while the games are being played

```
node football/build/live-results.mjs --why        what it would do, and why
node football/build/live-results.mjs | psql "$SUPABASE_DB_URL"
psql -d fantasy -f supabase/110_fantasy_live.sql
psql -d fantasy -f supabase/test/fantasy_live_test.sql
```

**109 already scored a live board correctly and nobody could tell.** A score is DERIVED, so
the instant a `fantasy_results` row lands every entry that holds that man is right. What was
missing was a writer during the games, and any way for the screen to say WHEN it last moved.
A frozen feed and a quiet afternoon are the same picture.

#### The source does move during a weekend, and that was measured rather than assumed

nflverse fills its weekly stats file in as games finish. Measured on the real 2026 file: the
build cache taken at **11:25pm ET on the Sunday of week 2 held 975 rows across 28 clubs**, and
once the Sunday night and Monday night games were in it held **1,107 across 32**. Those two
snapshots are also the fixture the whole chain was proved on, end to end, and the reorder
between them is real: of eight lineups drafted through the real wheel, **five changed place**.

**What is still NOT measured is whether it moves DURING a game**, and the difference decides
whether the board ticks over or jumps a game at a time. So the writer records both clocks and
one weekend of them answers it with data:

| | |
|---|---|
| `checked_at` | the last time anything LOOKED |
| `results_at` | the last time the answer actually CHANGED |

`results_sig` is what makes the pair honest. The writer upserts the same rows every few
minutes whether or not anything moved, so `results_at = now()` on every write would report a
change every time it was checked: the frozen feed wearing a fresh timestamp. The signature is
taken over the week's rows AS STORED, after the write, so it is a fact about the table rather
than about what the writer thinks it sent.

#### Three things the live path broke that the Tuesday path never could

All three had cost nothing for as long as the only run happened two days after the last
whistle.

- **THE SCHEDULE SAYING A GAME IS OVER IS NOT THE STATS BEING IN.** `games.csv` carries a
  final score the moment a game ends and the player rows land minutes later. `final` was read
  off the schedule alone, so a run at the exact minute the Monday night game ended would mark
  the week SCORED on incomplete stats, and `fantasy_mark_results` will not un-say it. Final
  now means both: every game played AND every club that played has somebody with a row. The
  28-club snapshot is exactly the state it refuses, and it names the four clubs it is waiting
  for.
- **THE CACHE NEVER EXPIRES.** Right for 1999 to last year, and a board that never moves for
  a season being played: served from disk, the writer would poll the same bytes all afternoon.
  In a GitHub runner the workspace is empty so it fetches anyway, which made it correct BY
  ACCIDENT and would have broken silently the day somebody added a cache step to speed the
  workflow up. `maxAgeMs` is opt-in, the default is unchanged, and the live path passes 0.
- **`weekly-pool.mjs --write` REPOINTED THE LIVE WEEK BACKWARDS.** Building an old week to
  make a fixture is an ordinary thing to want, and every one of those quietly moved
  `fantasy_now.json` back: the mode serves a week that finished a fortnight ago, nothing
  throws, the board is a real board. Found by doing it. The pointer only ever goes forward
  now, and the week's own JSON is still written.

#### The writer is a cron that decides for itself

**The cron is a wide net in UTC and `live-results.mjs` makes the real decision off
`games.csv`**, which is in Eastern and is already the one source for when a game starts.
`fantasy-pool.yml` answers daylight saving by listing both entries and asking which fired,
which is right for a job that must run at one exact hour; this one wants to be awake for a
whole game day, so nothing here reads a wall clock at all and a clock change moves nothing.

**The window has a tail and the tail is the point.** A game is watched from ten minutes before
kickoff to six hours after, and then the week stays watched for as long as a club that has
played is missing its stats. The stats land AFTER the game, so a window closing at the final
whistle would stop watching at the exact moment the last game's points were about to arrive.

**It commits nothing.** The live board is a Supabase read, so a score that moves costs one
write and no deploy; committing `results_*.json` every ten minutes would be a hundred commits
and a hundred Cloudflare deploys a weekend to publish a file the live screen does not read.

**`set -o pipefail` is load bearing in the workflow.** Without it the exit status is psql's, so
a build that failed outright pipes nothing into a psql that succeeds and the run goes green
having scored nobody: the one failure here that looks exactly like a quiet afternoon.

**Nothing scored yet is a real state and not an error.** Before the Thursday kickoff nflverse
has no rows for the week, and an emitter that threw there would take the workflow red every
single week for the one condition that is certain.

#### The cron never fired, so the job is a loop now

**Not one of the six scheduled firings inside the first Thursday's game window ran.** GitHub's
cron is best effort and drops runs under load, which it is allowed to do. The board read 0.0
for all 27 entrants with nothing red anywhere, because a job that never starts cannot fail.

So a firing only has to WAKE the job. `fantasy-live.yml` loops: every two minutes while ESPN
says a game is on, every ten while a kickoff is inside three hours or a club's stats are
missing, and it stops when there is nothing to watch. `live-results.mjs --status FILE` is what
decides, written as a file because the exit code already means "failed". A loop still going at
five and a half hours dispatches itself (the one event the job's own token may start) and the
concurrency group queues the new run behind it. The repository is public, so the minutes are
free. One failed tick does not end the loop; three in a row do, and any failure takes the run
red when it ends.

#### And nflverse is hours late, so the points during a game are ESPN's box score

```
node football/build/test/test_box.mjs
```

The second half of the same 0.0. nflverse writes a game's player rows hours after the whistle
(still missing at 11:25pm ET after Thursday's game), so even a job that ran had nobody to
score. `football/build/espn-box.mjs` reads ESPN's per game summary for every game that has
started and whose clubs nflverse has not written, joins each athlete on `espn_id` to the pool's
gsis id through `players.csv`, and scores him.

**IT NEVER PAYS.** It fills only men nflverse has no row for, nflverse replaces them by upsert
the moment it lands, and a week is only marked final off nflverse. The rule is written out
(nflverse ships totals, never the rule) and it matches `fantasy_points` on **18,443 of 18,443**
2025 regular season rows with no two point conversion. That is the one thing a box score cannot
see: a man who scores one reads two points low until nflverse lands.

The "N of 16 games" count takes ESPN's finished games when that is more than `games.csv` has.
It is display only; `final` stays nflverse's alone.

#### A row opens into its lineup, and the leader wears the prize

```
node football/check-fantasy.mjs   the section named A ROW OPENS INTO ITS LINEUP
```

Every row on the live board is a button, and pressing it folds out the six men with each one's
points and whether his game is on. `fantasy_standings` already returned `picks` after the lock
and nothing drew them. What each man has scored is one plain read of `fantasy_results`, which
110 made public (a man's points are a fact about a game, not about anybody's entry), asked
beside the board on every poll so the two are one instant. No migration.

**Open lineups stay open across polls** (`BOARD_OPEN`, by row key), or a lineup somebody was
reading would fold shut every twenty seconds. **The leader is green with a PRO pill** only once
somebody has a point: straight after the lock the order is who entered first, and marking that
row as winning a prize would invent a leader. Green rather than gold, because gold on this page
already means a podium AFTER the week. All four claims were proved by mutation.

#### A man in a lineup shows what he did, and a live one shows where he is headed

```
psql -d fantasy -f supabase/126_fantasy_results_line.sql
node football/check-fantasy.mjs   the section named A ROW OPENS INTO ITS LINEUP
```

Asked for by the owner off a screenshot of the Sunday board: points and nothing about how.

**The stat line was already built and dropped on the floor.** `weekly-results.mjs` and
`espn-box.mjs` both hand `resultsSQL` a line (`211 pass yds, 2 TD`) as `scores[id][1]`, and
it wrote the number and threw the sentence away. 126 adds `fantasy_results.line` and
`resultsSQL` writes it.

**THE WRITER ASKS FOR THE COLUMN BEFORE WRITING IT**, inside a `do` block, because the live
job pipes that SQL every two minutes during a game and the SQL is deployed by hand. An
unguarded write to a missing column fails the whole script and freezes the board for the
afternoon over display text. plpgsql resolves a column when the statement runs, so the
update inside the `if` is never looked at without 126. Driven both ways against Postgres
16. The page does the same from its side: a 400 naming `line` is asked again without it.

**The projection is `pts + proj * share of the game left`**, off the `proj` the man was
priced on and the scoreboard's period and clock. Only while his game is on: before it the
card already said, and after it the score is the answer. No overtime and no chasing a hot
half, deliberately. The guard checks it as arithmetic off the pool's own `proj`.

#### The rows are keyed on the ENTRY, and the key is not the entry's id

A board that animates cannot do without a stable row key. Keyed on PLACE, row one is always
row one and nothing ever moves: the scores change under a board that never animates. Keyed on
the NAME, two readers sharing one are a single row and a rename is a row that teleports.

**It is not `fantasy_entries.id` either, and that is a disclosure decision.** That column is a
bigserial over every entry ever made, so a public board carrying it publishes how many entries
this mode has taken in total. `entry_no` is the same count taken WITHIN the week, which gives
away only the order people entered, and the tiebreak already publishes that by putting the
earlier entry above on a tie.

**A HASH OF THE ID WOULD HAVE BEEN WORSE THAN EITHER.** md5 over a small integer is brute
forced in a second, so it would have looked like a defence and been none. This file would
rather make no claim than a false one.

**It is stable for exactly as long as it needs to be**, and that rests on a property the mode
already has: no entry can arrive after the lock, and the board does not open until the lock.
The set of entries in a live week is frozen from the first kickoff.

#### Three read policies that were granting nothing

**RLS narrows a grant, it does not make one.** 109 found this once on `fantasy_entries`, where
reading your own entry raised permission denied behind a perfectly good read-own policy. It is
true of `fantasy_weeks`, `fantasy_prices` and `fantasy_results` too, and was missed because
every screen reads them through a security definer function, which never consults the policy.

Nothing was broken. What was wrong is that **109 says otherwise in as many words**, over
`fantasy_prices`: "PUBLIC READ, deliberately, and it gives nothing away". Verified against a
real database, `anon` was denied on all three. A comment claiming an access rule the database
does not have is the dangerous direction, because the next person to want a direct read finds
it refused and goes looking at the policy, which was never the problem. 110 grants all three
and asserts it as a real read as the real role. **`fantasy_entries` is deliberately not
widened**: the sanctioned way to see somebody else's lineup is the board, and that gate is the
competition.

#### FLIP, and the one forced reflow

The rows are measured where they are, the list is rebuilt in its new order, they are measured
again, each is given the INVERSE of the distance it just travelled, and that is played back to
nothing. The browser lays out once and animates a transform, so fifty rows sliding past each
other cost the compositor and nothing else.

**Read everything, then write everything.** Both loops are one phase each and the single
`offsetWidth` between them is the only forced reflow in the move. Measuring one row and then
writing its transform before measuring the next is fifty reflows for one animation, on the
frame the page is also parsing a poll.

**The transition is declared in CSS and driven from script.** Written as a keyframe, every row
would replay it on every repaint, because the painter rebuilds the list and a new node starts
its animations over. That is the hoops bracket's own lesson.

**Which way it went is marked for the half second it is going.** A row that climbed and a row
that fell look identical once they have arrived, and the move is over in half a second: without
the mark the only reader who knows what happened is the one who was watching that exact row.
**A row whose SCORE moved and whose PLACE did not gets its own tick**, because most of a quiet
afternoon is exactly that and the board would otherwise look frozen while working perfectly.

**The first paint never animates.** There is nothing to move from, and fifty rows flying in
from wherever they were measured is a screen announcing itself.

#### `show('s-in')` was cancelling the whole feature, three ways at once

`paintIn` ends with `show('s-in')`, which was a harmless re-assert of a class that was already
set. It stopped being harmless the moment `show` grew teeth, and **none of the three throws**:

- the poll was CANCELLED by the first live repaint, so the board updated once and never again,
- the move timers went with it, so every row that had just moved kept its mark for ever,
- and `scrollTo(0, 0)` yanked a reader half way down the board back to the top, every twenty
  seconds, for as long as they watched.

Showing the screen you are already on is not a screen change, and it returns early now. Found
by the guard rather than by reading.

#### What the guard measures, and the two shapes it got wrong first

It drives two real states through the page's own poll and reads the glass: a row that changed
place is caught MID FLIGHT, still drawn where it was, which is the one moment at which a board
that reorders without animating and a board that animates are distinguishable. Proved by
reintroducing both defects: with the invert removed nothing is moving, and keyed on the place
instead of the entry **three separate assertions fail**.

**Two handles are published for it and nothing on the page reads either.** `__rtgPoll` asks
once through the real poll and the real painter, and `__pollMs` shortens the interval. That is
`window.RTF_LIVE`'s argument in the hoops game: the claim is about the SECOND answer, and
waiting the real twenty seconds would put twenty seconds into the suite per assertion.

**A mark coming off is a bound, not a snapshot.** The first draft asserted the marks were gone
at one arbitrary instant after the move, which is a claim about the suite's own arithmetic;
measured, they come off at about 620ms. It waits for them now, which still catches the defect
worth catching: a mark that is never removed at all.

**And every fixture timestamp is relative to the PAGE's clock.** `openPage` pins `Date.now()`
inside the browser, and these sections run at a point DURING the games, hours from the real
time the suite runs at. Built off the harness's own `Date.now()`, a `checked_at` meant to be
"a moment ago" lands sixteen hours in the page's past and the board correctly reports a feed
that has stopped. The first draft did that and failed on the one assertion it existed to prove.

#### The poll

Twenty seconds, and it **only runs while there is something to see**: not before the lock, not
after the week is settled, and not while the tab is hidden. `visibilitychange` restarts it AND
asks immediately, because coming back to the tab is the moment somebody checks.

**A null answer leaves the board alone rather than blanking it.** A leaderboard that hid itself
on one bad request would flash empty every time a phone changed cell tower. **And it keeps
asking after one**, because a board that gave up after a single unreachable poll would stay
frozen for the rest of the afternoon on a reader whose train went into a tunnel.

**Three ways an answer can be stale by the time it lands**, and all three are guarded: the
reader left the screen, the poll was stopped, or the live week rolled over under a slow
request. A board painted for the wrong week is somebody else's competition on your screen.
### The real games, and a board that is its own screen

```
node football/build/test/test_scores.mjs     the feed's parser and the fallback
node football/build/nfl-scores.mjs --why     what the live week looks like right now
node football/check-fantasy.mjs              the screen, the pill and the scoreboard
psql -d nfl_scores -f supabase/test/nfl_scores_test.sql   after 109, 110 and 111
```

`supabase/111_nfl_scores.sql` adds `nfl_games`, `football/build/espn.mjs` reads the feed,
`football/build/nfl-scores.mjs` composes a week, and `s-live` in `football/fantasy/index.html`
draws it. One pinned button reaches it while the games are on.

**The board used to live under the entry screen and that was wrong twice over.** A reader who
never drafted has no entry screen, so on the one afternoon a leaderboard is worth looking at
they had no way to it at all, which is the dynasty board that rendered perfectly and had no
door arriving at a second mode. And a board hung under a lineup reads as a footnote to it,
when on a Sunday it is the thing somebody opened the page for.

**Moving it gave the board back two of its four states.** While it sat under the entry screen
the reader had entered BY DEFINITION, so an empty answer could only ever mean the week had not
locked and "nobody yet" was a sentence that could not be true. On a screen open to somebody
who never drafted it can be, so all four are written: unreachable, not open yet, nobody has
entered, and here is the board.

**THE WINDOW IS ASKED OF THE SCHEDULE, NEVER OF THE DAY OF THE WEEK.** "Thursday to Monday" is
what a normal week works out to and is not what it means: a Saturday slate in December, a
London kickoff at half past nine in the morning and the Friday after Thanksgiving are the same
question with three different answers, and a rule written in weekday names is wrong about all
three with nothing to say so. The button is up from the first kickoff until six hours after the
last one. The first kickoff is also exactly when the board opens, so one fact decides both.

**It is pinned rather than put on a screen**, because which screen somebody is on when they
want the scores is not something the page gets to decide. `body.haslive` gives the column a
floor to sit above: a fixed pill over the last control is a button covering the way out, which
is the boss battle's Continue arriving at a different screen. It is hidden on the screen it
opens (a door into the room it is standing in) and on the draft screen, which cannot be reached
inside the window anyway because the week locks at the first kickoff.

**A minute is how often the button asks whether it should be there.** Nothing else on this page
ticks before the lock, since the poll only runs once the board is open, so without it somebody
sitting on the home screen at a quarter past eight on the Thursday would have to reload to find
the thing this was built for.

**The entry screen keeps a way to the board and that is not a duplicate door.** The pill is a
live control and disappears at about seven on the Tuesday morning; a leaderboard whose only
door was a live one would go with it. Both open the same screen.

**TWO PANELS, ONE AT A TIME, AND THAT IS ARITHMETIC RATHER THAN TASTE.** Sixteen games is about
980px at 390 and a full board is fifty rows, so whichever of the two is drawn second is behind
a scroll of the other for the whole afternoon. Stacked, the competition this site is actually
about sat under the entire NFL slate. Found by taking a screenshot and looking at it.

**Each door lands on what it promised**: the pill says Live scores and opens the games, the
entry screen's button says the board and opens the board. A single default would make one of
the two a control that takes you somewhere other than where it said. That is the premium card's
own lesson, where the card read one thing and the sheet it opened read another, and both suites
assert it for the same reason. Both panels stay in the DOM and the poll paints both, so
switching is instant and neither is ever a screen that has to load.

**`BOARD_SEEN` is deliberately NOT reset when the screen opens, and it was, for a pass.** The
reasoning was that opening a screen is not watching a row move. The premise is false: the poll
has been painting that board all along, while the reader was on their own six or on the games,
so THE ROWS ON SCREEN ALREADY ARE `BOARD_SEEN`, and an animation from there is one honest step.
Resetting only threw away the first move after somebody arrives, which is the move they came
for. What stops a hidden panel animating is `boardShowing()`, which is a different question
asked in a different place: measured inside `display:none` every rectangle is zero and every
row appears to have travelled the height of the page.

#### The scoreboard has two sources and the schedule is what names a club

| | knows |
|---|---|
| the pool, which every visitor already downloads | the sixteen games and when they kick off |
| `nfl_games`, written by the cron | what has happened since |

**The slate is derived from the pool rather than fetched.** Each man carries his club, his
opponent, which of them is at home and the kickoff, so sixteen games fall out of a file the
page has already read. Measured on the live week 3 board: all sixteen, because all thirty two
clubs have a priced man. **So the screen is complete before anything has been written at all**,
which is also what it looks like against a database that never got the migration.

**A club with nobody priced would drop its game**, which is why the server's rows are merged
over the top rather than used only for the scores. `nfl_games` is written off `games.csv`, the
whole schedule, so a game the pool cannot see arrives the first time the writer runs.

**THE FEED IS JOINED ON ESPN'S OWN EVENT ID AND NEVER ON A CLUB CODE.** `games.csv` carries an
`espn` column holding the event id of every game. ESPN writes WSH and LAR where nflverse writes
WAS and LA, so a name-matched join would have silently dropped two clubs every week and looked
like two byes. What the feed supplies is a state, a quarter, a clock and two numbers. Every
name on the screen is ours.

**An event that cannot be made sense of takes its own game out of the answer and nothing
else.** A state that is not one of the three the page draws, a competition with one side, a
score that will not parse: each of those leaves that game on the schedule's answer, so the
board shows a kickoff time rather than half a scoreline. The fixture attaches all three to
REAL week 3 games for that reason, so the fallback has somewhere to catch them.

**BEFORE KICKOFF A SCORE IS NOT NIL-NIL, IT IS NOTHING.** ESPN answers "0" and "0" for a game on
Thursday morning, and stored as a scoreline the board would say Atlanta and Green Bay were
level. It answers a period of 0 and a clock of "0:00" too, which is a pre-game row carrying a
quarter. Both are dropped. That is `next-week.mjs`'s own trap (`Number('')` is 0) arriving from
the other side.

**Overtime is derived from the quarter and never from the word OT in a sentence.** `type.detail`
is display text, it has been spelled more than one way, and a finished game past the fourth went
to overtime, which is arithmetic.

**The status is read off the COMPETITION and not off the event.** Both carry one and they can
disagree; reading the event's copy is how a board freezes at pre-game for a whole afternoon with
every other field perfect. The sample payload carries a stale event status for that reason and
the guard asserts the live one wins.

#### A game only ever moves forwards, and that is what a feed outage needs

Every ten minutes a tick arrives that knows less than the row already does, because the fallback
can only ever say "kickoff is at 8:15" about a game in its fourth quarter. Taken, the board flips
a live game back to pre-game twice an hour all afternoon and forward again when the feed returns.
**Nothing throws, every row is a valid row, and the only symptom is a scoreboard that flickers.**

So `nfl_put_games` ranks the three states and keeps the furthest along answer. A source that
knows less writes nothing. **What it costs is that the cron cannot write a correction**: a game
wrongly marked final stays final until somebody updates it by hand, and that is the right way
round, because the failure it prevents happens every time the feed blinks and the one it causes
needs the feed to be wrong.

**A pre-game row whose kickoff has passed says "Under way" rather than a time.** That is what a
feed outage looks like from the reader's side, and printing 8:15 beside a game that started an
hour ago would be the page inventing the one thing nobody knows.

**The merge is done in a CTE and not inside the `on conflict`.** Written as a `do update set`
full of rank comparisons, every column carries its own copy of the same test and then whether the
row MOVED has to be asked a third time by comparing the old row against an expression restating
all of them. It was written that way first and ran to thirty lines. Resolved before the write,
the rule is written once, `moved` is a comparison of two rows, and `excluded` is already the
answer.

#### The games ride in `fantasy_board`, which is why 111 restates it

The live screen shows two things that are about ONE INSTANT: what the games are doing, and what
that has done to the standings. Asked as two calls they are two instants, about twenty seconds
apart in an order nobody controls, and the reader gets a board that has already paid for a
touchdown the scoreboard beside it has not shown. Both read as one of the two being broken.

**APPLY 111 AFTER 110.** 110's copy of `fantasy_board` has no `games` key in it, so the other
order leaves a live screen whose scoreboard is permanently empty with nothing anywhere saying
why. That is the one ordering hazard in the file.

**The games are answered even when the week is not.** A week with no `fantasy_weeks` row is a
competition nobody published, and the football is on regardless: the screen draws the scoreboard
and says the board is not open, which is two true sentences rather than one blank panel.

#### The cron writes both halves, and the feed cannot take it red

`live-results.mjs` scores the week and writes the scoreboard on the same tick, from one snapshot.
The scoreboard half is allowed to fail on its own: scoring the week is what matters and a picture
is a picture, so `buildScores` swallows everything the feed can do and the caller catches the
rest.

**SCORES FIRST, THEN THE WEEK.** They are two statements and psql applies them as it reads them,
so a failure between the two leaves the scoreboard written and the week unscored rather than the
other way round. The Tuesday build settles a week; nothing settles a scoreboard.

**ESPN CANNOT BE REACHED FROM THE DEVELOPMENT SANDBOX**, and that is worth saying plainly rather
than leaving somebody to read a green suite as proof the feed works. `site.api.espn.com` is
refused by the egress proxy on the CONNECT. So:

| | |
|---|---|
| verified here | the parser against a saved payload, every malformed event, and the whole fallback against the real schedule |
| NOT verified | that ESPN sends a payload of that shape |

A hand written fixture can only prove the parser handles the shape it was told about. **The
first real verification is a run of `fantasy-live.yml`**, and what to read in its log is the
number the feed answered: sixteen games and a feed that matched none, while a game is on, is the
feed's week numbering disagreeing with ours and looks exactly like a quiet afternoon from every
other angle. The job says so in as many words. **There are two ways of asking for that reason**:
the week form is one request for the whole slate and is the one most likely to be wrong in a way
nobody here can test, so a week that matches none of our games is re-asked by DAY, and a date is
not a numbering convention and cannot be off by one.

**What a feed that never works at all costs is a quarter and a clock.** The slate, the clubs and
the kickoffs are the schedule's, and `games.csv` fills in a final score a few hours after each
whistle, so the week still ends with a correct scoreboard. That half IS verifiable here and the
guard drives it against a week already played.

#### Three things the guards found, and two of them were the guards

**A `do $$` block is one transaction, so `now()` inside it is one timestamp.** The claim that an
unchanged write leaves `updated_at` alone passed with its defect in: a writer stamping the clock
on every single look is indistinguishable from one that stamps it only on a change when both are
read inside one transaction. The writes are separate statements now, which is also what they are
in life. Same class as this repo's three wrong extractors, arriving at a test fixture.

**The entry screen asks before the board does.** Boot lands on the reader's own lineup and starts
watching there, so the first fixture answer is spent before anybody presses anything. Listed
once, the board's own first paint was already the second state and the move the section exists
for had happened off screen: it reported four rows arriving mid flight and nothing marked as
having moved.

**And two things on the entry screen that only a screenshot could say.** Both render, both are
valid strings, and no assertion in that suite was looking at either.

- **It read "undefined of undefined games are in."** The live path handed `paintIn` the six
  scores and nothing else, and that function prints how far into the week it is off two fields
  the payload did not carry. The counts are passed now, and the sentence is written without
  them when there are none, which is this repo's oldest rule about a number in copy. The guard
  is a net over the WHOLE screen rather than that one line: `undefined`, `NaN` and `null` are
  what a missing field prints, none is a word any copy here would use, and any of the three
  reaching a reader is the same bug wherever it lands.
- **A man who scored 8.2 was described as having done nothing.** "played, nothing to show" is
  the right line for somebody who was out there and never touched the ball, and a live row
  carries no stat line, so every man who had done anything got it. The two cases are told apart
  by the SCORE now rather than by whether there is a line to print.

#### The prize is decided, and one half of it must not go where it looks like it goes

The top three get something. First takes 30 days of Pro; all three get a mark on the account
and a profile image only a winner has.

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

**The prize is NOT the product the store sells, and that is what lets it be automatic.** It
used to be a 100% off code for the lifetime bundle, and the rule here was that an automated path
from "won a week" to "owns the product" is a second way to obtain what the store sells. A pass
that ends is not that product, so it is granted straight to `premium_unlocks` by the database
with no Stripe involved (next section). Do not turn it back into a lifetime grant without
putting the hand back in the loop.

**The result sheet says something kind to everybody and throws confetti for one.** Second
is "so close", third is a podium finish, the top half had a good week, and everybody else
is told every week starts from zero, plus that they beat their projection when the PRINTED
difference says they did. No line promises anything about the next board, because the
sheet can open after that week has locked. Confetti is first place only, skipped under
reduced motion, sits above the sheet with no pointer events, and goes when the sheet
closes. `check-fantasy.mjs` asserts all of it, including that a tap on Close still lands
on Close under the confetti, and each claim was proved by reintroducing its defect.

#### The winner gets 30 days of Pro, and nobody is told the result until it is on

```
psql -d pass -f supabase/120_fantasy_pro_pass.sql
psql -d pass -f supabase/test/fantasy_pass_test.sql      (its header lists the chain)
node football/check-fantasy.mjs                           the sheet, the door and the copy
node football/check-premium.mjs                           the receipt says "Won"
```

**115 holds EVERY entrant's result back** until first place has left `none`, so the whole
field hears it at the moment the winner has been paid. That was asked for by the owner when
the prize was a Stripe code minted by a separate job, because a winner who looked in the gap
was told "1st" with nothing on the sheet. `void` and `granted` count as ready.

**THE PRIZE IS 30 DAYS OF PRO NOW, not the lifetime bundle**, asked for by the owner on the
first week it could be won. `supabase/120_fantasy_pro_pass.sql` writes `ps_premium` and
`cfb_premium` rows with `expires_at` 30 days out and `source` `fantasy:<season>-w<week>`,
and `premium_products()` stops answering them when that passes. **Nothing runs on day 30.**
Every gate on the site already reads the expiry: `premium_products()`, 104's commish clock
and 106's dynasty meter.

**IT IS PAID INSIDE THE SETTLE**, so there is no gap and no second job. `fantasy_settle_week`
(114's trigger) calls `fantasy_grant_pass` in the same transaction as the live writer's final
tick. `scripts/stripe/mint-winner-code.mjs` is deleted, both workflows lost their mint step,
and no Stripe secret is needed for a week to close.

**Four rules in `fantasy_grant_pass`, each proved by breaking it:**

- **A permanent row is never touched.** A winner who already bought the bundle keeps it for
  good; the sheet says "Pro is already yours" and prints no end date.
- **A second win adds 30 days to the END of a running pass**, not to today.
- **A field of one is voided**, not paid, and told so. `p_force` pays one by hand.
- **It acts only on `none`**, so a re-settle or a re-run of the chain pays nobody twice.

**A PASS IS NEVER A GOLD NAME.** `display_pro` is stamped on a board row when it is filed and
never taken off, so a pass would leave gold names on rows for ever after it ended. 120
restates 107's `ps_is_pro` and its backfill trigger to skip a `fantasy:` source. **So
re-running 107 on its own undoes that** and gilds the next season any pass holder files;
re-run 120 after it. The backfill now also fires on UPDATE, because a winner who then buys
has their rows updated by the webhook's upsert rather than inserted.

**Checkout does not count a pass as owning the bundle** (`checkout-bundle.js` filters
`source=not.like.fantasy:*`). Counted, a winner could never buy the bundle for good, during
the pass or after it, because the row outlives its end date as the record of the win.

**The receipt says "Won in the Fantasy Challenge"** and "Your Pro pass ends on", never
"Bought" or "You paid once", on both the football and college profiles.

**The length is one number in SQL and two lines of copy** (the board's "wins 30 days of Pro"
and the leader pill's title). `check-fantasy.mjs` holds the copy to the `interval` in 120.
The sheet prints the END DATE the server wrote rather than a count, so it cannot drift.

**114 and 115 drop `fantasy_my_result` before making it** now, because 120 adds two return
columns (`prize_state`, `pass_until`) and `create or replace` refuses a new return type.
Without the drop, re-running the chain over a database that has 120 dies at 115 with
"cannot change return type", which is 109's own lesson. `fantasy_prizes_test.sql` and
`fantasy_ready_test.sql` describe the code era and run BEFORE 120.

**The page asks about THIS week first, then last week**, because the week that closed on
Monday night is still `POOL.week` until Tuesday's build rolls the board. The ack is keyed
on the week, so a reader told on Monday is not told again on Tuesday.

**A profile image only a winner has is a claim about an account, so it is the board's own
problem**: `display_pro` is already the pattern, a derived boolean written by a trigger rather
than typed, because a mark anybody can set is a mark that means nothing.
