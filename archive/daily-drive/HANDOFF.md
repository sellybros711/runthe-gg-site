# RunTheDrive — Build Handoff

Everything below is working, simulated, and validated. Four files:

| File | What it is |
|---|---|
| `runthedrive_drive_generator.js` | Daily seed, field position, defensive gameplan, scouting report |
| `runthedrive_engine.js` | Play resolution, drive state machine, call grading, share cards |
| `runthedrive_playbook.json` | 6 schemes, 72 plays, all stats data-derived |
| `runthedrive_simulator.js` | Validation harness — run this after any change |

Data behind all of it: nflverse play-by-play (262,841 filtered plays, 60,611
drives) + FTN charting (108,114 charted plays). Both free.

---

## VALIDATED — 6,000 simulated drives per policy

| Player type | TD | FG | FG-or-better | Turnover | On downs | Clock |
|---|---|---|---|---|---|---|
| **Skilled** (best EV vs visible box) | **34.8%** | 13.9% | 48.7% | 13.7% | 30.2% | 6.0% |
| **Spammer** (quick pass every down) | 17.6% | 19.1% | 36.7% | 9.1% | 47.7% | 4.5% |
| **Average** (situation-blind) | 5.2% | 16.0% | 21.2% | 10.3% | 62.0% | 4.5% |

Skilled hits your 35% target. Spam is now clearly punished (17.6%), which the
first playbook version failed to do.

**But the skill gradient is now very steep** — 34.8% vs 5.2% for situation-blind
play. That's a 30-point spread, and a new player who doesn't read football well
could land near the bottom and churn. Real users won't be as blind as that
policy (it ignores down and distance entirely), but this is the number to watch
in beta. If new-user retention is bad, soften `DIFFICULTY` before touching
anything else.

Other checks, all passing:
- **Determinism** — same date + same decisions → identical result, every user
- **Defense can't see your play** — enforced by function signature, not discipline
- **Defense reacts to personnel** — box 5.28/6.08/6.76/7.46 by backfield vs measured 5.15/5.97/6.60/7.34
- **Defensive call mix** within ~7 points of league across all five columns
- **Scouting report** — 0 contradictions in 10,174 claims across 3,000 drives

---

## The one constant you'll tune

```js
let DIFFICULTY = Number(process.env.RTD_DIFFICULTY ?? -10.0);
```

RunTheDrive has no punt — every 4th down is a conversion attempt or a kick,
where real offenses punt on 42.6% of drives. That alone pushes scoring well
above the real 23.5% TD rate. This one constant scales success rates back down.
Solved by simulation, not guessed:

| DIFFICULTY | Skilled TD% |
|---|---|
| -26 | 44.4% |
| **-33** | **34.8%** ← shipped |
| -38 | 25.9% |
| -44 | 17.7% |
| -50 | 10.2% |

Change it, re-run `runthedrive_simulator.js`, read the new rate. That's the
whole tuning loop.

---

## Contracts Coby must not break

**1. The defense never sees the play.**
```js
defensiveCall(dateStr, gameplan, playNumber, down, distance, backfieldCount, blitzSlots)
```
There is no play parameter. If one ever gets added, the core promise dies.

**2. Blitzes are a budget, not a coin flip.**
A drive is ~8 snaps. A 7% per-play blitz chance still blitzes twice in eight
snaps often enough to make a "rarely blitzes" report a lie. `buildBlitzSlots()`
allocates a fixed count and pre-assigns the slots, so the report describes
exactly what the player will see. Side benefit: blitzes become countable, so
"they've used both" is real reasoning.

**3. Scouting report lines are generated, never hand-written.**
Every line renders from a live gameplan parameter. Hand-authored text drifts out
of sync the moment a parameter changes. Uncertainty comes from *withholding*
lines and from banded language — never from a false statement.

**4. Grade the call, not the outcome.**
`gradeCall()` compares your play's EV against the best play in your playbook,
using only what the player could see (box count yes, blitz no). A correct call
that gets picked off still grades A. This is what makes variance feel like
variance instead of a con.

**5. Strip `_hiddenGameplan` before it reaches the client.**
It's on the day object for server-side resolution. If it ships to the browser,
the game is solved on day one.

---

## Known issues, ranked

**1. ~~Play-level sameness~~ — FIXED.** Every play now carries its own measured
numbers, derived from real signatures: runs by `run_gap` x `run_location`,
passes by air-yard band x field location x play-action. **52 distinct stat
profiles across 72 plays** (the remaining overlaps are plays that genuinely
share a signature). Each play also carries `success_by_distance`, so
specialization is real: Outside Zone converts 64.3% at 1-2 yards and 41.0% at
10+, while Power runs 61.8% and 32.1%.

**1b. NEW — selection bias in per-play stats (watch this).** Measured play stats
reflect *when coordinators choose to call them*. A 15-19 yard play-action throw
succeeds 62.3% of the time in the NFL partly because coaches only call it on a
favourable look. Hand a player that call on every down and it beats reality.
The `DIFFICULTY` constant currently absorbs this globally, which is why it sits
at -33 rather than a gentle -10. That's blunt. The surgical fix is **usage
constraints** — limit how often a premium call is available per drive — which
is also better gameplay than a flat penalty. Worth doing before launch.

**2. Schemes aren't balanced.** Average EPA by scheme runs Wide Zone +0.154 down
to West Coast +0.045, because Wide Zone has the most access to the under-center
deep shot. That's *realistic* but everyone will pick it. The intended
counterweight is the box-draw mechanic plus daily gameplan variance; **I have
not verified it actually balances.** Needs a per-scheme simulation sweep.

**3. Spam is still viable.** Quick-pass-every-down gets 29.2% versus 36.0% for
skilled play. Skill wins, but not decisively. Worth watching in beta.

**4. Weather is cosmetic.** No measured weather effect exists in the data.
It's flagged loudly in the code — don't wire it into the resolver without data.

**5. Yardage bands ignore situation.** The same distribution is used on
3rd-and-1 as on 1st-and-10, which slightly over-rewards short-yardage. Real fix
is situational yardage bands; the difficulty constant currently absorbs it.

**6. Still missing from the data:** coverage type (man/zone) and run concept
(inside/outside zone, gap). Both available free from NFL Big Data Bowl tracking
data as a later enhancement — not a launch blocker.

---

## What's left before it's playable

1. **Two-tap UI flow** — pick personnel → see the defensive alignment → call the play
2. **Pixel play-out** — 8 outcome animations (explosive/success/failure/sack/INT/fumble/TD/aborted snap)
3. **Supabase** — team name, day streak, daily results, leaderboard
4. **Share card rendering** — text generator is done; needs the image layer
5. **Situational play specialization** — known issue #1

Suggested Coby prompt format, matching your usual workflow:

> read runthedrive_engine.js and runthedrive_drive_generator.js then apply ONLY
> the changes below

The engine is pure logic with no DOM dependencies, so it drops into the existing
structure without touching game rendering.
