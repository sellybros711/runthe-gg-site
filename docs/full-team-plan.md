# Full Team: build plan

A twelve-man mode inside **The Perfect Season** (`/football/`). Six on offense, six on
defense, **one shared cap**, and both sides of the ball resolved in the same game.

> **Status: the engine half is built and unreachable from the live game.**
> `resolveGameFull` and `overallOf(..., 'full')` are in `engine.js`, and `playRun` reaches
> them only through `opts.full`, which nothing outside the harness passes. There is no
> page, no draft screen, no run mode and no migration yet. The cap is being measured by
> `node football/simulator.js --fullteam` before any of that is written.
>
> **The cap is measured: about $170M shared across all twelve.** See below for the table
> it was read off.
>
> Gated to the tester list when it becomes reachable, on the same footing as Commish
> Simulator in the CFB game.

---

## The pitch, in one line

The current game asks whether you can build an offense. This one asks whether you can build
a **team**, and it is the first mode that can hand you a 34-point offense that cannot get a
stop.

---

## The finding that shortened this plan

The original ideation assumed Full Team meant a second engine. It does not, and the reason
is worth writing down because it changes the build order.

`resolveGame` and `resolveGameDefense` are exact mirrors, and each already computes half of
Full Team:

| | your points | opponent points |
|---|---|---|
| offense mode | **your drafted offense** | what that team really scored |
| defense mode | a free, below-average offense | **held down by your drafted defense** |
| **full team** | **your drafted offense** | **held down by your drafted defense** |

Full Team is the diagonal. Both terms already exist, individually calibrated, and
`resolveGameFull` is the two of them side by side. It needed no new football.

**What it does need is a new cap, and that is not a detail.** Each of the other two modes
leans on a crutch that this one removes: offense mode hands you the opponent's real scoring,
defense mode hands you an offense deliberately held under average by `DEF_OFFENSE_SCALE`.
Draft both and both crutches are gone at once, so twelve men bought at the six-man cap is
not a slightly strong team, it is an unbeatable one.

---

## The cap is the mode

One shared budget across all twelve. **Not two budgets of $140M**, and this is the single
most important design decision in the mode.

The question Full Team asks is *do I take the $48M edge rusher or the $48M quarterback*.
A split cap deletes that question and leaves two unrelated six-man drafts stapled together.
Shared, and almost certainly not double: if $140M buys six, $280M for twelve makes every
man cheap in relative terms and every roster good.

Where the number lands is **measured, not guessed**:

```
node football/simulator.js --fullteam
PS_CAPS=155,165,175,185 PS_N=300 node football/simulator.js --fullteam
```

It plays whole seasons at a range of caps against three levels of play, and prints the
offense mode's own rows at the top so the Full Team rows have something to be read against.

### The measured answer: about $170M

| cap | careless win% | careful win% | careful playoff% | careful title% |
|---|---|---|---|---|
| offense mode, $140M for 6 | 24.7% | 60.9% | 38.3% | 0.0% |
| $140M | 10.8% | 36.9% | 0.0% | 0.0% |
| **$170M** | **16.7%** | **63.5%** | **37.5%** | **0.0%** |
| $200M | 21.5% | 79.0% | 89.2% | 0.8% |
| $240M | 23.1% | 96.9% | 100.0% | 26.7% |
| $280M | 22.8% | 98.3% | 100.0% | 55.0% |

$170M lands on the shipped mode almost exactly: 63.5% against 60.9%, a 37.5% playoff rate
against 38.3%, and no titles at either. $200M is already a different game and $240M is a
mode where careful play goes 17-0 a quarter of the time.

**It is not double, and it is not the $220M the ideation guessed.** Twelve men at $170M is
about $14M a man against offense mode's $23M, and the reason is the crutches: removing both
at once is worth more than the roster is, so the men have to be cheaper to compensate.

**One thing $170M does NOT reproduce, and it is a design decision rather than a miss.**
Careless play wins 16.7% here against 24.7% in offense mode, because a randomly drafted
defense gets torched: points allowed run 89 against the reference's 70. That is the mode's
new failure state working as intended, a team that scores and cannot get a stop, and it also
means Full Team punishes thoughtlessness harder than the free game does. Fine for a paid
mode aimed at people who already know the game. Worth knowing before it is anybody's first
experience of it.

**Refit, do not nudge.** If the player data is rebuilt, run the sweep again rather than
moving the cap by hand.

---

## What is built

- `engine.js` `splitSides(roster)` , offense and defense by position, one place.
- `engine.js` `resolveGameFull(...)` , the diagonal above. Samples across the whole
  roster in roster order, so a shared seed stays a seed.
- `engine.js` `overallOf(roster, chem, 'full')` , the mean of the two side ratings, not
  the sum. Both halves are already on the 0-to-100 scale the seeding constants expect, so
  averaging keeps a full team on it. It also says the right thing about the mode: a 92
  offense behind a 40 defense is a 66 team.
- `engine.js` `FULL_SLOTS` , `QB RB WR WR TE FLEX DL DL LB DB DB FLEX`.
- `playRun(..., { full: true })` , the season loop, unchanged otherwise.
- `simulator.js --fullteam` , the cap sweep.

Nothing above is reachable from the page. The live game is untouched.

---

## What is not built, in the order it should be

**1. The cap.** Read it off the sweep. Everything downstream assumes a number, and picking
it late means rebalancing twice.

**2. The database.** `ps_runs_run_mode_ck` lists the recordable modes by name, so until it
is widened the database **rejects every full team run outright**. `80_football_defense_mode.sql`
is the template: widen the constraint, add the four partial indexes for the mode's board.
The lesson that file records applies here word for word: **run the migration before adding
anybody to the tester list**, because a tester whose season is rejected on submit learns
exactly as little as no tester at all.

**3. The tester gate.** `football/fullteam-access.js`, modelled on `cfb/commish/access.js`
rather than on the inline `DEFENSE_TESTERS` array, because two pages will ask (the home
screen card and the mode itself) and a list written twice is a list that drifts. Usernames
lowercased, account ids accepted as a second way on, **no email addresses in the file**: it
is served to anybody who requests it.

It is a feature flag and not a permission. The list ships in the page, readable and
forgeable by anybody who opens the console. That is fine for hiding an unannounced mode. The
database is what decides whether a run is recorded, and it must not consult this list.

**4. The draft.** Twelve picks is double the longest part of the session. Draft offense and
defense in **alternating rounds** rather than six then six, so the shared cap is felt
continuously instead of discovered at pick seven.

**5. The results screen.** One column, two meanings, and the box score has to say which: an
offensive line is points on the board and sums to the score; a defensive line is a share of
the suppression effort and sums to the defensive total, which is **not points and must never
be printed as if it were**. `resolveGameFull` returns them already split.

**6. Decisions.** Deliberately last. See below.

---

## Decisions, and why they are not in the first version

The ideation asked for fourth-down and two-point choices. That is a real feature and it is
the one thing here that genuinely needs a second engine, because **if your choice can change
the outcome, the score cannot have been decided before you chose**, and this engine decides
the score first and invents a plausible game afterwards.

Three ways to get there, cheapest first:

- **Doctrine.** Set tendencies before the season, feed them in as modifiers like chemistry
  and scheme. Nearly free, reuses every bit of calibration, and has no moment of tension.
- **Floating conversions.** Let the engine decide the drives, but leave the *conversion
  points* unfitted: it says you scored four touchdowns, you choose 1 or 2 after each, and
  the margin is genuinely yours. Preserves the calibration, honest, cheap. Cannot give you
  fourth down, because that changes whether a drive scores at all.
- **A real drive engine.** Down, distance, field position, clock. The score emerges. This is
  the honest answer and it is a different engine with its own constants and its own
  calibration from zero.

Ship Full Team without any of them first. The twelve-man shared-cap draft is a complete mode
on its own and it is the part that is nearly free. Then prototype floating conversions as a
two-week test of whether decisions feel good in this game at all, before funding the third.

**If decisions do land, ask sparingly.** Twenty-one games times six decisions is 126 taps a
season, which turns a three-minute coffee break into a twenty-minute session and a different
product. Interrupt three or four times a game, when it is genuinely close, and auto-resolve
the rest from doctrine. Tension comes from rarity.

---

## Coaches

A coach is a thirteenth asset bought from the same cap, and he should do three things:
set the default doctrine, move the odds on the decisions themselves, and carry a **scheme
that rewards a roster shape**. The third is what makes him a draft decision rather than a
bonus, because a scheme you cannot field is worth nothing. `coaches.json` and the chemistry
links that read it already exist.

Not in the first version.

---

## Pro, and what is behind it

A one-time unlock is far easier to operate than a subscription. If it becomes a
subscription, the recurring value has to be **persistence** rather than features: a
franchise that carries across seasons, ageing players, a roster you keep and rebuild.
Features are why somebody buys once; continuity is why they renew.

**The classic draft and the defense draft stay free and undegraded, forever.** The free game
is the funnel, and the fastest way to kill this is to make the current game feel like a demo.

One rule holds regardless of what is sold: **anything that writes must be gated server side
inside `ps_submit_run`.** Only cosmetics may be gated in the client, because the client is
readable by anybody who opens the console.

---

## What worries me

**Balance is the long pole, not the UI.** The cap sweep is the start of it, not the end.

**Two calibrations become three.** This repo stays honest because every mode has a harness
that proves it. Full Team needs the same, and that is real ongoing cost every time the
player data is rebuilt.

**The meta gets solved.** If decisions ever matter, someone will work out the optimal
fourth-down policy and post it. That argues for ranking a Pro board on
decisions-above-neutral rather than on record, because record rewards the roster and that
figure rewards the player.
