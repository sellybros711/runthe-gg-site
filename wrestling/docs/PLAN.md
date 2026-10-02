# Run The Ropes: the plan

Small shippable phases, in order. Every phase leaves the game playable, keeps every existing
save loading, and ends with: the game played on a 390 by 844 phone and a 1440 by 900 desktop,
screenshots of every changed screen reviewed against DESIGN.md, `node wrestling/verify.mjs`
green, the dash and copy checkers green, and the career simulator run.

## Decisions needed before Phase A

These change the plan. Each has a recommendation.

| # | question | recommendation |
|---|---|---|
| 1 | Which direction: A Main Event, B Territory Tape, C Fight Card? | **A**, with B and C as the look of the lowest stages |
| 2 | Approve the wrestler sample sheet (builds, frame B, proportions, the 56 by 72 canvas)? | approve, then Phase A1 builds the full layer set |
| 3 | The game has two art modes today (Smooth default, Retro). The new sprites replace both. Retire the toggle? | **yes**: one game, one style, as the sister games have. The `rtr_gfx` key is read once to show a "the look has changed" note, then ignored |
| 4 | Coins, cosmetics and the pass reset with every new career, although the store is designed for them to persist. Make them account wide (per browser, across careers and slots)? This is an entitlement change. | **yes**, and nobody loses anything: on first load every slot's owned items are merged into one locker |
| 5 | Signing bonuses and two life events write kayfabe dollars straight into coins (tens of thousands). Stop the leak? | **yes**; existing balances are left alone |
| 6 | The game has no RunThe.GG account, cloud save, trophies or leaderboards. Phase E's leaderboards need them. Add them? | **yes**, using the site's existing account system and `cloudsave.js`, with one new Supabase table for the boards (deployed by hand, as every board migration is) |
| 7 | The 1.18MB inline script cannot run in node, so a 1,000 career simulator cannot test it. Split the engine into sibling files (`wrestling/engine/*.js`, node requirable, cache versioned) and lazy load the story data? | **yes**; the page stays the same URL and the same single game |
| 8 | Sound: the game has none. Add short chiptune stings, crowd and impacts, muted by default? | your call; it is listed as phase B9 and is skipped unless approved |
| 9 | Rename the trademark risks found in the audit ("GCW" initials, "King of the Ring", "Best of the Super Juniors", "The Cruiserweight Classic", "Tokyo Dome", "Tiger Mask", "Natural Selection")? Ids stay, only names change. | **yes** |
| 10 | Keep the game unlisted (noindex, no home page link) for the whole redesign? | **yes**, until Phase F |

### The answers (2026-10-02)

| # | answer |
|---|---|
| 1 | A, Main Event |
| 2 | approved |
| 3 | yes, retire the toggle |
| 4 | yes |
| 5 | yes, and the wider coin economy is decided later |
| 6 | yes, with every SQL migration saved for the very end |
| 7 | **not split**, to save effort: the simulator drives the real page in a headless browser instead (`wrestling/sim/run.mjs`) |
| 8 | not now; later, and only a little |
| 9 | yes |
| 10 | yes, unlisted |

## Phase A0 · Foundations (no visible change)

Done: save version 2 with a migration chain and a raw backup per old version; per slot
backup and restore; a career seed that salts every scene pick, and the random stream saved
and carried on across a resume; player text stripped of markup characters on the way in and
in old saves; one `legacyOf()`; the simulator. Item 3 below is dropped by decision 7.

**The baseline the simulator measured (1,000 careers, the game as it is before Phase C):**
no career hit a fault, and the balance is off almost everywhere, in ways the story engine has
to fix rather than a constant:

| | today, all three difficulties | target (NARRATIVE.md section 12) |
|---|---|---|
| median career | 17 to 18 years on every difficulty | 15 to 19 / 13 to 17 / 10 to 15 |
| reach national TV, win a title | 100% | 40 to 98% depending on difficulty |
| Hall of Fame | **100%**: `legacyOf` medians about 1,100 against a bar of 120 | 10 to 50% |
| world title | 7 to 10% | 12 to 60% |
| career ended by injury | 0% | 6 to 18% |
| distinct scenes a career can meet | 30 | the catalog's 489 |

Difficulty barely moves anything, and the legacy formula's scale makes the Hall and its
grades meaningless. Both are Phase C work (C11 to C13) and are measured, not guessed, now.

1. Save version 2 with a migration chain: `load()` never returns null for an old schema again;
   it migrates forward and keeps a per slot backup of the pre migration save.
2. Fix the slot 0 only backup and restore.
3. Split the engine out of `index.html` into `wrestling/engine/` (decision 7), with `?v=`
   versions recorded by `check-cachebust`.
4. The headless career simulator (`wrestling/sim/run.mjs`): random, scripted and greedy
   choice policies, all three difficulties, a coverage table (every event, route, match type,
   ending), and the balance bands from NARRATIVE.md section 12 as assertions.
5. Career seeded RNG for scenes and resumes (audit section 10, items 1 and 2), so two careers
   stop seeing the same scene on the same week.
6. Escape player text everywhere it reaches `innerHTML`.

## Phase A1 · The wrestlers

1. `pxwrestler.js` grows to the full layer set in DESIGN.md section 2 and the full migration
   table in section 10, so every one of the 148 cosmetics has a pixel version.
2. The 14 animation sets, with the guards: no part on the canvas edge, head, hands and feet
   present in every frame of every build, 24 colours minimum, every combination of slots
   renders without NaN, gaps or clipping (sampled exhaustively per slot pair).
3. Save migration of looks: every saved `look` converts to its closest new look; ownership
   ids are kept, so nothing bought is lost. A fixture set of old saves (one per cosmetic) is
   loaded and checked.
4. NPC looks seeded off a stable key, not catalogue order. All 43 authored characters,
   bookers, the cast and pundits redrawn with hand written looks.
5. The creator rebuilt around a live animated preview, randomize, and the new slots.
6. Family check: a Ropes wrestler beside a Run The Floor player at the same scale, in the
   style guide and in `verify.mjs`.

## Phase A2 · The re-skin

One screen group per step, each shippable: home and creation · the Hub · Skills (Arsenal,
Training, Mentors) · Gear (Locker, Merch Stand, Ropes Pass, My Card) · Roster (Locker Room,
Backstage, The World) · Career (Business, Record) · match chrome · promo · Hall of Fame and
Next Chapter · site bar and nav. Each step: tokens only, components only, the new icon set,
no emoji, focus states, 44px targets.

Then: the dashboard (wrestler card, this week's booking, the five meters with tooltips),
promotion theming on signing, count ups and deltas, the "what changed and why" receipt after
every decision, thumb reach primary actions, autosave on every decision (already true, kept).

## Phase B · Matches and shows

B1 entrances by theme style and stage · B2 the pixel ring view acting out every beat · B3
broadcast bars and commentary that names the feud · B4 player choices at key moments, timing
spots each with a non timed alternative · B5 star rating and crowd heat separate from the
result, great losses pay · B6 the new match types and promotion specialties · B7 promos as a
playable system on the new components · B8 weekly shows building to supershows with full
cards · B9 sound, only if approved · B10 ceremony scenes and the Scenes off switch.

Done so far: B2 the pixel ring view; B3 decisions that name your own moves and catchphrase,
and a call at the bell that names the feud or the belt; B4 an untimed alternative to every
mash and promo beat (Timing off); B5 crowd heat as its own number beside the stars; B10's
switch, as Milestone cards off in Help (backstage scenes carry choices, so they always play).
Still to do: B1 entrances, B6 new match types, B8 supershow cards, the ceremony scenes.

## Phase C · The story engine

C1 data driven events (prerequisites, weights, cooldowns, rarity, chains), lazy loaded by
stage · C2 the flag memory and quote system · C3 the two layer tags · C4 multi month feuds ·
C5 booking politics and the push meter · C6 gimmicks, turns the crowd can reject,
catchphrases, gear evolution on the sprite · C7 hidden traits · C8 the relationship web for
the cast · C9 factions and tag teams with matching gear · C10 the living world (promotions
rise, fall, merge, raid, invade; lineages; awards) · C11 the body (wear by style, rehab arcs,
ring rust, visible aging) · C12 money and life · C13 legacy tracking and Hall probability ·
C14 the media layer. Also fixes the audit's farms (repackage, turn, mentor stacking) and
enforces the contract terms that are stored and ignored today.

## Phase D · Content

The catalog in `NARRATIVE-EVENTS.md`, in batches by stage so each batch can ship: S0 and S1
with the origins · S2 and S3 with the routes up · S4 and S5 · adversity · outside the ring ·
twilight · the legend layer (behind its setting) · endings and epilogues · secret endings.
After each batch the simulator's coverage table must show every new event firing and none
over its rarity band.

## Phase E · Replay, discovery, sharing

The Vault · the written career story · Next Chapter as a legacy (student or second generation
with traits, the family resemblance on the sprite, the old rivals) · challenge careers and a
daily seed · leaderboards on the account (decision 6) · share cards as pixel event posters.

## Phase F · Polish

Every screen and state on phone, tablet and desktop against DESIGN.md; empty, loading and
error states; a read of every line of copy for voice and continuity (wrong promotion, wrong
alignment, wrong title, things that did not happen). Then the launch decision.

## Risks

- **Scope.** This is a rebuild of most of a 20,000 line game. The phases are ordered so each
  one is worth shipping even if the next never happens.
- **Two art styles at once.** Between A1 and the end of A2, new sprites will sit in old
  chrome. A2 starts with the screens players see most so the seam is short.
- **The simulator is only as honest as its policies.** Coverage will be reported per policy,
  and anything only a scripted policy can reach is listed, not hidden.
