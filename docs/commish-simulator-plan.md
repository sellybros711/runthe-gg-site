# Commish Simulator: build plan

A new mode inside **College Football: Perfect Season** (`/cfb/`). Not a draft and not a
season: you are the **commissioner of college football**, and the sport is yours to run.

> **Status:** Stage 0 is built. `cfb/commish/ledger.js` and `cfb/commish/blocs.js` are
> headless and dependency-free, and `cfb/build/test/commish/test_ledger.mjs` plays a whole
> five-season term with no UI and replays it from a seed. Nothing is on screen yet.
>
> Stage 0 deliberately does not depend on either fork below, which is why it could start
> before they are answered. **Stage 1 does.** Both are marked **DECIDE**.

---

## The pitch, in one line

Every other mode in this game asks what you would do with a roster. This one asks what you
would do with the sport.

You are not a coach and not an athletic director. You are the person in the room when
college football decides what it is going to be: who is in which conference, how many teams
play for the title, what a player is owed, who gets the money. You rule, the room reacts,
and **the sport you changed is the one you have to run next year**.

---

## What the two reference games actually do

**[Fantasy President Career](https://fantasypresidentcareer.com/)**: the US presidency,
governed month by month.

- The player **writes what the president does** in free text, plus optional public
  messaging. It is not a list of four buttons.
- Fallout comes back across **press framing, 24 voter personas, 32 stakeholder groups, all
  50 states, and focus groups**.
- Freemium: the first year of a presidency is free.

**[Football President Career](https://www.footballpresidentcareer.com/)**: world football,
run from the top.

- Judged on **revenue, global support, and the satisfaction of four blocs**.
- The fail condition is a coalition: **anger the Federation Chairs and two other blocs and
  you are out**.
- **One big decision per round**, results revealed as you go.
- A policy can be **tested against the full 22-member Council** before you pass it, with a
  world map and all 22 reactions.
- Two modes: take office mid-tournament at a real World Cup, or take one nation from thin
  margins to qualifying.

### What to take

| Take | Why |
|---|---|
| The bloc model | It is the whole genre. A decision is only interesting because somebody loses. |
| Meters, few and legible | Revenue, support, standing. Three numbers a player can hold in their head. |
| The coalition fail condition | Better than a single health bar: it makes you count votes, not points. |
| One big decision per beat | Pace. A wall of small choices is admin, not office. |
| The reaction surface | Seeing all of the room answer at once is the payoff, and it is cheap to build. |
| Test a policy before passing it | Turns a guess into a read. Football President's best idea. |
| Freemium shape | A free slice that ends where the story gets good. |

### What to leave, for now

Free text as the primary input. Reasons under **The decision system** below.

### What only this game can do

**In both reference games, a decision only ever comes back as opinions.** People react,
meters move, a headline runs. There is no America underneath the president game and no
football underneath the football president game. They are very good conversation
simulators, and that is the whole ceiling of the genre.

We already own a working college football simulator. It plays games, produces scores, ranks
the country and crowns a champion off real 2005-2025 data: 1,380 team seasons, 83 schools,
real conference membership per year, real polls.

**So a ruling here does not have to come back as opinions. It can come back as football.**

Expand the playoff from twelve to sixteen. The reference games tell you the SEC is annoyed
and revenue is up six percent, and move to the next item. This one tells you that, and then
plays the season out and shows you the sixteen-team bracket: real teams, your seeding rule,
actual games. And when the four teams your expansion let in go 0-4 and lose by four
touchdowns, that is not a scripted consequence somebody wrote for you. It is what your rule
did, and it is on the docket next winter as somebody else's motion to undo it.

The player does not get told what the room thinks of their rule. They watch their rule
happen.

The same applies to everything else on the ledger. Kill the Pac-12 and next season's games
genuinely have no Pac-12 in them. Widen the revenue gap and the schools you starved get
measurably worse on the field over a few years. Rewrite the selection rule and watch a team
you would have picked get left out by your own words.

**A second and smaller payoff, kept separate because it is not the point.** The draft mode
already in this game could be playable inside the world you built: move Oregon to the Big
Ten as commissioner and Conference Draft offers Oregon under the Big Ten. That is a nice
thing to have. The feature is the paragraph above it.

---

## The core loop

A **beat** is one item on the calendar. Each beat runs the same five steps.

1. **The docket.** One to three items land, each with the case for, the case against, and
   who is pushing it. Real subject matter: realignment, playoff format, revenue
   distribution, NIL, the portal, media rights, eligibility, gambling, officiating,
   scheduling, the breakaway threat.
2. **You rule.** Not just yes or no. Most rulings carry **dials**: expand the playoff, yes,
   but to twelve or sixteen, with how many autobids, and are the byes real. The dials are
   where the ripple lives.
3. **The room reacts.** Every bloc answers at once, each with a number and one line in its
   own voice. This is the screen the mode is remembered for.
4. **The sport changes.** The ruling writes to the **world ledger** below. Durable, not a
   score.
5. **The consequences arrive.** Some the same beat. Some three seasons later, when a
   conference you starved comes back with a lawsuit.

---

## The world ledger

This is the difference between a simulation and a quiz. A ruling does not add points, it
**edits the sport**, and later beats read the edit.

```
membership   which school is in which conference, per season
playoff      size, autobids, byes, selection rule, sites, revenue per round
money        the distribution formula, the media deal, when it expires, who signed it
labour       NIL rules, revenue share %, employment status, portal windows, eligibility clock
rules        conference game count, clock, replay, overtime, targeting
posture      gambling policy, TV windows, bowl tie-ins, non-revenue sport guarantees
pressure     legal exposure, congressional attention, unionisation drive
```

Three properties the ledger has to have, or the mode is a quiz with nice art:

- **Every field is read by something.** A field nothing reads is a field that does not exist.
- **Edits compound.** Cut the Group of Five's share in year one and their fail-state in year
  four is a consequence you caused, not a die roll.
- **The ledger is the save file.** It is what a returning player resumes into, and it is
  small: a few dozen fields and a membership map. It serialises the way a run does.

---

## The blocs

Football President uses four. Fantasy President uses thirty-two. College football's real
politics has a natural nine, and nine is the number: enough that a coalition is a real
count, few enough to fit on a phone.

| Bloc | Wants | Hates | When it turns |
|---|---|---|---|
| **SEC** | More of everything, and to be asked first | Anything that flattens the money | Threatens to take its inventory and go |
| **Big Ten** | Parity with the SEC, footprint, presidents kept happy | Being second in the room | Same, and it has the same power |
| **ACC** | To survive the grant of rights | Being told to wait | Members start suing to leave |
| **Big 12** | A seat and a bid | Being lumped with the Group of Five | Poaches, or gets poached |
| **Group of Five** | Access, a guaranteed bid, a share | Being the undercard forever | Files antitrust, goes to Congress |
| **The networks** | Windows, inventory, one negotiation | Fragmentation, a devalued regular season | The next deal comes in under the last |
| **The players** | Money, health, freedom to move | Being told they are amateurs | Organises, and then you are bargaining |
| **The presidents** | Cover, academic fig leaf, cost control | Anything that ends up in a deposition | Vote you out. They can. |
| **The fans** | Rivalries, tradition, games at a sane hour | Being told what they love is inefficient | Attendance and ratings, which the networks then read |

**Washington and the courts** sit outside the table as a **tenth actor you cannot please,
only manage.** They do not have a satisfaction number. They have a fuse, and it is lit by
what you do to the other nine.

---

## The meters

Three, on screen always.

- **Revenue.** What the sport makes. You distribute it, you do not own it.
- **The health of the sport.** Ratings, attendance, and competitive balance rolled into
  one. The one that erodes quietly while every individual decision looks fine.
- **Your standing.** You serve at the members' pleasure, and the members have a vote.

Plus **legal exposure**, which is not a meter but a fuse. It does not tick down. It fires.

### Losing

Two ways, and neither is a health bar hitting zero.

1. **The coalition.** Lose the SEC and the Big Ten in the same offseason and you are gone,
   whatever the other numbers say. This is Football President's rule and it is the right
   one: it makes the player count votes.
2. **The vote.** Standing at zero triggers a no-confidence vote of the presidents, which
   you can survive if the blocs you kept are the ones that matter.

Losing is not a game over screen. It is the end of a term, and it gets a legacy card the
same as a good one: what the sport looked like when you found it, and what it looks like
now.

---

## The calendar

College football has a better clock than a calendar month, so use it. **A season is nine
beats.**

| # | Beat | What lands |
|---|---|---|
| 1 | Winter meetings | Structure and rules. The big ones. |
| 2 | Portal window and signing day | Labour, eligibility, the roster economy |
| 3 | Spring | Courts and Congress. The bill you cannot vote on. |
| 4 | Media days | You take questions. Public messaging, on the record. |
| 5 | September | The season opens, and the first thing goes wrong |
| 6 | October | The middle. Ratings come in and the networks have opinions. |
| 7 | November | Rivalry weekend, and realignment rumours because that is when they happen |
| 8 | Championship weekend and selection | Your format, meeting reality for the first time |
| 9 | The playoff and the year in review | The bill for everything above |

**A term is five seasons**, renewable if the room wants you back. Forty-five beats to a
term, which at one big decision each is a real career and not an evening.

---

## The decision system: **DECIDE**

The fork that everything else waits on.

### Option A: authored decisions, deep state *(recommended for v1)*

A hand-written docket. Each item is data: the situation, the options, the dials, and what
each combination writes to the ledger. Bloc reactions are computed from the ledger edit and
each bloc's own weights, not authored per option.

- Runs with no network, like every other mode in this repo.
- Deterministic, testable, and a seed replays exactly, which is how everything else here is
  verified.
- Free. No per-decision cost, so a paying player is not a variable cost.
- Costs writing. A term is 45 beats and it wants maybe 120 items to feel unrepeated.

### Option B: free text and a model

The player writes what they do, like Fantasy President, and a model reads it into a ledger
edit and writes the fallout.

- The infrastructure is already here. The site runs on Cloudflare Pages with Functions
  (`functions/api/stripe/*`), so a server-held key and a `/api/commish/rule` endpoint is the
  same shape as the Stripe checkout that already ships.
- Enormously better ceiling. "I let the Pac-12 die but guarantee its members a bid for six
  years" is not on anybody's list of four buttons.
- Per-decision cost against a subscription price, on a mode designed for 45 beats a term.
- Non-deterministic, so the repo's replay-a-seed discipline does not apply to it.
- Needs moderation, and needs an answer for what happens when the model is down mid-term.

### The recommendation

**Build A. Design for B.** Keep the ledger edit as the interface between a ruling and the
world, so a ruling's *source* can change later without the world model moving. Then the
first LLM layer is the cheapest and safest one: **authored choice, generated prose.** The
player still picks, the ledger edit is still deterministic, and the model only writes the
press column and the blocs' lines in their own voices. If the model is down, the authored
fallback line shows and nothing breaks.

Full free text becomes a later upgrade, priced knowingly, once the loop is proven.

---

## Real names: **DECIDE**

This repo already uses real schools, real conferences and real player seasons, and that is
fine: they are facts, and the draft game presents them as facts.

A commissioner sim is a different shape, because the actors talk. There is a real
difference between "2005 Alabama went 9-2" and a fabricated quote attributed to a named
living commissioner about a decision they never made.

**Recommendation: real institutions, no named individuals.** The SEC reacts, the Big Ten
reacts, Ohio State's president reacts as "a Big Ten president". Everything the player cares
about survives, because the player cares about the SEC, not about who signed the letter.
It also ages better: the plan does not need editing when somebody changes jobs.

Worth an explicit decision either way rather than defaulting into it.

---

## Playing the sport you built

The payoff feature, and the reason this belongs in `/cfb/` rather than as its own site.

The engine already takes a format and produces a season. `seedFromRanking` reads
`PLAYOFF_TEAMS` and `PLAYOFF_BYES`. `prepareData` builds the field from those constants.
Conference Draft already narrows the pool to one conference's real membership per season.

So:

- **The playoff you designed is the playoff that gets played.** Sixteen teams with six
  autobids produces a sixteen-team bracket with six autobids, in the same bracket UI.
- **Realignment is real.** Move Oregon to the Big Ten in your world and Conference Draft in
  your world offers Oregon under the Big Ten.
- **The money shows up in the football.** A widened revenue gap moves the strength band the
  have-nots are drawn from, and the seasons you play afterwards are the seasons your
  distribution formula produced.

None of that needs new simulation. It needs the constants to come from the ledger instead
of from `CONSTANTS`, which is a small, contained change with one honest risk: **the main
game's balance is tuned against fixed constants** (see `MARGIN_GAIN`, `POOL_GAMMA`,
`tune_bracket.mjs`). A commissioner's world must therefore be **its own competition with
its own leaderboard**, never mixed with free play, for exactly the reason the Defense Draft
and the Trade Machine are ranked apart in the NFL game: two numbers that look alike and
mean different things.

---

## Access: testers now, paid later

Both halves already exist in this repo. Nothing new has to be invented.

### Now: testers

The pattern is written down in `supabase/80_football_defense_mode.sql`: a name list in the
page and a `LIVE` flag, with the database side applied **first** so a tester's work is not
rejected by a constraint they cannot see.

1. Migration first, so a commissioner term can be saved before anybody is invited.
2. Deploy with names in `COMMISH_TESTERS`, who get the real mode against the real database.
   Everybody else sees the card and a "Coming soon".
3. Flip `COMMISH_LIVE` when it is ready for everybody.

### Later: paid

`public.subscriptions` (from `supabase/53_grid_pro.sql`) is already written by the Stripe
webhook at `functions/api/stripe/webhook.js`, read-own under RLS, with checkout and the
customer portal beside it. `supabase/72_comp_passes.sql` grants hand-made passes with
`price_id='comp'`, which is exactly how a tester gets in without a card.

So the paid rollout is: a new price in the same Stripe product, an entitlement check
alongside `arcade_card_active`, and comp passes for testers. The runbook at
`functions/api/stripe/README.md` already describes every step.

**The free slice.** Fantasy President gives away the first year. The equivalent here is
**the first season, all nine beats, ending at the year-in-review**, which is exactly where
the ripple starts to pay off and therefore exactly where somebody wants the second season.

---

## Build order

Each stage ships something you can look at. No stage depends on a later one.

| Stage | What | Done when |
|---|---|---|
| **0** | The ledger and the bloc model, headless, in Node | **Done.** A term simulates in a test with no UI and a seed replays identically |
| **1** | One beat, end to end: docket, ruling, reactions, ledger edit | One decision plays on a phone and the room answers |
| **2** | The full nine-beat season and the year in review | A season plays start to finish, tester-gated, saving to the database |
| **3** | Playing the sport you built: format and membership feed the engine | A sixteen-team playoff you designed runs in the bracket UI, on its own board |
| **4** | The five-season term, consequences with long fuses, the legacy card | A term ends, well or badly, and says what you did to the sport |
| **5** | Paid rollout | Stripe price, entitlement check, comp passes, free first season |

**Stage 0 is the one to get right.** Everything above it is presentation. If the ledger is
wrong, no amount of UI makes a decision matter.

---

## Files, if it goes the way the rest of the repo goes

`/cfb/` is one self-contained `index.html`, and this mode is too big for it. `hoops/` is the
precedent for splitting: `engine.js` and `run.js` beside the page, carrying cache versions.

```
cfb/commish/index.html        the mode's own page
cfb/commish/ledger.js         the world, headless, testable in node
cfb/commish/blocs.js          who reacts and how
cfb/commish/docket.js         the authored items
cfb/commish/data/*.json       realignment history, media deals, the real calendar
cfb/build/test/commish/*.mjs  the suite
supabase/9X_commish.sql       the term save, the board, the entitlement check
```

Anything beside the page **carries a `?v=` cache version**, and the rule in `CLAUDE.md`
applies with no exceptions: the edit, the bump and the record in one commit.

---

## Open questions

1. **Free text or authored?** Recommendation above is authored first, generated prose next,
   free text as a priced upgrade. This decides the architecture and the running cost.
2. **Real named people, or institutions only?** Recommendation is institutions.
3. **Era.** Does a term start in the present and run forward into a sport you invent, or can
   you take office in 2011 and stop realignment before it happens? The second is a better
   hook and needs the 2005-2025 membership history the data already carries.
4. **Where does it live?** A mode card inside `/cfb/`, or its own entry on the site's front
   page? It is a different game to the draft, and the front page is how anybody finds it.
5. **Price.** Its own subscription, or is it what the existing Arcade Card grows into?
   One card across the site is a much easier thing to sell than a second card.
