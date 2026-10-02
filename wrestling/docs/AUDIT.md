# Run The Ropes: audit

What the game is today, read end to end before anything changes. Line numbers are
`wrestling/index.html` unless a file is named. Screenshots of every screen on a 390 by 844
phone and a 1440 by 900 desktop, in both graphics modes, were captured and the contact
sheets are in `docs/shots/` (`today-phone.png`, `today-desktop.png`, `today-match.png`).

## 0. Corrections to the brief

| The brief said | What the code says |
|---|---|
| Nine promotions | Correct. Two indie, three regional, three national, one global (`world.js`). |
| Archetypes shape stats | Correct, and there are **six**: Powerhouse, Technician, High-Flyer, Brawler, Showman, All-Rounder. The start screen says "all eight" (line 1952), which is wrong. |
| Starts at 21 with a 40 overall | Starts at 21 with **OVR 33 or 34** whatever the archetype (`BASE_ATTRS` 5842). |
| Dashboard tabs: This Week, Training, Locker Room, Merch Stand, The Business, The World, Backstage, Career Record | Five nav groups on a bottom bar: **Hub** (the week sheet lives inside it, there is no This Week tab), **Skills** (Arsenal, Training, Mentors), **Gear** (Locker, Merch Stand, Ropes Pass, My Card), **Roster** (Locker Room, Backstage, The World), **Career** (Business, Record). The Hall of Fame screen opens only on retirement. |
| Matches are singles with momentum and damage bars | Singles plus 14 stipulations: tag, hardcore, ladder, cage, submission, last man standing, grudge or street fight, triple threat, I Quit, iron man, a six man steel dome, a briefcase ladder match, tables ladders and chairs, plus a battle royal, three round tournaments and five night foreign tours. |
| A premium Ropes Pass | **There is no real money anywhere.** The PRO lane costs 25,000 coins, earned in play. No Stripe, no `premium_unlocks` row, no ads, no AdSense tag. |
| Integrated with the RunThe.GG account, trophies, streaks, leaderboards | **None of it.** The career game loads no `auth.js`, no Supabase, no `cloudsave.js`. Everything is in localStorage. The "streak" is the game's own 7 day coin track. |
| Appearance: face, hair, gear, boots, colors | Nine catalogue slots (hair, face, mask, attire, boots, extras, pattern, tattoo, aura), four colours, a build of three, and belt carry. 148 cosmetics. Details in section 6. |
| Wrestler art | Two renderers already exist: **Smooth** (default, gradient vector) and **Retro** (rect pixels with a black outline pass), toggled per device by `rtr_gfx`. Neither is the sister games' style. Section 7. |

## 1. Architecture

One page, `index.html`: 20,627 lines, 1.36MB, one 1.18MB inline script (2298 to 20625).

| file | global | what | loaded by |
|---|---|---|---|
| `index.html` | everything | the career game | itself |
| `moves.js` | `RTR_MOVES` (144), 8 categories, 5 tiers | move catalogue | index |
| `legends.js` | `RTR_LEGENDS` (66), 6 eras | mentors (real people, legal names) | index |
| `cosmetics.js` | `RTR_COSMETICS` (148), packs, rarity | store and look editor | index |
| `world.js` | `RTR_PROMOS` (9), `RTR_CHARS` (43), factions (6) | the fictional world | index |
| `roster.js`, `corrections.js`, `personalities.js` | real roster data | Booking Sim only | `booking/` |
| `booking/index.html` | own | a separate promotion booking sim | `/wrestling/booking/` |
| `verify.mjs` | | Playwright regression suite | CLI |

Script sections, in order: save slots (2304), constants and schedules (2324), PPVs (2405),
belts (2469), the three rooms (crowd, locker, office) (2868), season goals (3064), crowd
reaction and turns (3300), free agency (3478), moments and ceremonies (3529), RNG and toast
(3843), coin economy, dailies and pass (3887), locker room and factions (4130), save and
migrate (4451), both renderers and icons (4515 to 5765), wrestler math (5765), creation
(5799), the living world (6165), nav and tour (6735), rulebook (7023), router `go()` (7156),
arenas (7215), home (7568), hub (7727), offers and stipulations (8404), feuds (8690), the live
match engine (8946 to 12420), booking sheet (12420), `applyMatch` (12723), dirt sheet and
result (13251), `advanceWeek` (13750), non match events (14268), year end, retirement and
Next Chapter (14501), training, shop and pass screens (14717), the `RPK` brand kit (15177),
promos (15507), crew and deal (17480), The World (17814), Backstage (17964), scenes
(18320), pundits (19794), lineage, record and Hall of Fame (20304).

`go(s)` toggles one of 19 `.screen` divs, paints the nav, calls that screen's renderer and
**saves on every navigation**.

## 2. State and saves

`G = { schema:1, w:{ name, nick, align, era, style, look, attrs, mastery, moves, custom,
finisher, tp, xp, finisherName, finisherNameB, catch, entrance, gimmick }, prefs, car:{ about
120 fields, 80 of them added lazily }, bag:{ coins, owned, shards, packs, pass, streak, daily },
world, story, rel, log, hist, hi }`.

| key | holds |
|---|---|
| `rtr_baw_v1`, `_s1`, `_s2`, `_s3` | four career slots |
| `rtr_baw_slot` | active slot |
| `rtr_baw_v1_prev` | one backup, **slot 0 only** |
| `rtr_baw_legends_v1` | Hall of Legends, capped at 60 |
| `rtr_gfx` | smooth or retro |

**Versioning is a trap.** `SCHEMA = 1` and `load()` returns null for any other value, so the
first schema bump would silently erase every save. `migrate()` backfills fields within
schema 1. The redesign must add real versioned migration (section 11, PLAN phase A0).

## 3. Creation

Quick Setup rolls everything; Full Setup has ring name, nickname, two finisher names,
catchphrase, difficulty (Rookie x0.92, Pro x1, Legend x1.10 on **opponent OVR only**),
entrance theme (8), alignment (3), era (6, gates mentors), archetype (6), then the look
editor. Quick Setup does not clear the Full Setup inputs, so a typed finisher name leaks
into a quick career. The starting promotion is chosen by archetype fit: Grit City or Cellar
Door. Every career opens the same way: age 21, an indie, a match in week 1, the
`first_night` scene, the guided tour.

## 4. The week, the body, the money

A week is booked by `bookWeek` (12437): a tour night, a tournament round, a match (30 to 86
percent by standing, schedule and feud), a promo (7 percent plus), or a dark week. The
player picks one prep (gym, tape, spar, rest, work the room) and may talk to the office (nine
asks gated by "pull"). `advanceWeek` (13750) handles recovery, wear, pay, popularity caps by
tier, reaction drift, loyalty and betrayal, free agency, scouting, tours, world ticks and
year end at week 41. Nine injury types, chronic damage, three schedules (Light Loop,
Full Time, Every Town). Money is kayfabe dollars; coins are the meta currency.

## 5. Promotions, titles, matches, events

**Promotions.** Grit City Wrestling and Cellar Door Pro (indie), Steel Belt Championship
Wrestling, Sunset Coast Wrestling, Crimson Rose (regional), Apex Championship Wrestling,
Kaiju Puroresu, Lucha Eterna (national), Colossus Wrestling Federation (global). You only
move on free agency or a scouting offer. 24 belts. House rosters are thin: Kaiju and Lucha
Eterna have three wrestlers each, Apex four.

**The match engine** (8946 to 12420) is genuinely good and should be kept: phases (Feeling
Out, The Shine, The Heat, The Comeback, Finish Stretch), limb targeting, momentum, ref
bumps, run ins, near falls, mash windows, three decision points with shown odds, and a
match rating built from craft, pace, psychology and variety that is separate from the result.
`simMatch` (12682) is a second, simpler model that only `verify.mjs` calls, so the career
harness tests a match the player never plays.

**Events.** 71 authored player facing events: 40 data driven `SCENES` (with `when`
predicates and a priority), 13 `SEGMENT_LIB` fallbacks, 4 feud events, 1 rookie event, 6
hallway events, 7 life events. Plus 7 world event types, 9 office asks, 7 season goals, 70
promo chips, 39 signature cuts, 6 booker directives, 9 named bookers, 5 pundits, 5 feud
kinds, 6 factions. The full scene table with triggers and weights is in the engine report
appended at the end of this file.

**Career end.** Retire any time, a farewell tour of 4, 12 or 26 weeks, forced retirement odds
from 36, or catastrophic injury. Legacy score, a D to A plus grade, a local Hall of Legends.
Next Chapter offers three routes: walk with the next wrestler (the promised keepsake move is
never granted), take a booker's chair (sets a flag nothing reads), or start fresh (which
writes a duplicate Hall entry).

## 6. Wrestler appearance today

**Stored** as a flat bag of strings in `G.w.look`: `skin, hair, gear, trim` (hex),
`hairStyle, face, mask, attire, boots, acc, pattern, tattoo, aura, build, beltCarry`.
Ownership is `G.bag.owned[cosmeticId] = true`, per save slot. A migration needs both maps:
cosmetic **id** to new id for ownership, and saved **value** to new value for looks.

| slot | count | values |
|---|---|---|
| hair | 24 | short bald buzz long pony mullet spiky afro mohawk topknot flames dreads undercut wild hornhair slick widow bun curls fauxhawk braids halfshave frosted waist |
| face | 19 | none beard stache goatee warrior skull tribal mutton scar halfpaint venom soul handlebar fullbeard eyeblack crossface visorpaint bloodied mist |
| mask | 15 | none lucha half hood demon tiger skullmask phantom jaguar wolf insect bull crow dragon samurai |
| attire | 17 | trunks tights singlet tank jacket duster shorts vest bodysuit armor crop sash harness hoodie gi chaps robe |
| boots | 13 | short tall sneak pads wraps platform goldboot barefoot hightop combat cowboy steel spiked |
| extras | 22 | none wrist elbow shades chain cape belt knee bandana gloves scarf wings armband necklace towel tassels visor facemask armorpad spikes feather crown |
| pattern | 17 | solid stripe split flame stars gold bolt check scales royal pinstripe polka zigzag camo gradient tigerstripe web |
| tattoo | 10 | none sleeve chest full tribalink neck barbwire leg back kanji |
| aura | 11 | none spark smoke flame storm halo ice neon void pyro gilded |
| build | 3 | lean athletic heavy (free) |
| belt carry | 3 | waist shoulder hand (free) |

21 items are free from the start. Everything else comes from the **Merch Stand** (three
packs at 2,400, 6,500 and 15,000 coins with pity; direct buy at 3,000 to 60,000 by rarity;
forging with shards) or the **Ropes Pass** (free tier 25 `a_jacket`, PRO tier 20 `m_demon`,
PRO tier 50 `h_flames`). Values outside the catalogue that must still map: `hairStyle:'swoop'`
(four authored characters, drawn differently by the two renderers), `attire:'ref'`,
`attire:'bodypaint'`.

**NPC looks are seeded by catalogue order** (`oppLook`, 8953): adding or reordering any
cosmetic re-rolls the face of every generated wrestler. The new system must seed off a
stable key, not a list index.

**Real people are never drawn** (roster, mentors and personalities are text only). Likeness
risk lives in cosmetic names: `m_tiger` "Tiger Mask" is a trademarked character name and is
the highest concern; `f_mist` "Green Mist", `m_crow`, `m_demon` and the war paints evoke
specific real performers' signature looks. All are flagged for renaming or redesign in the
migration table (DESIGN.md).

## 7. The art: today, and the family it has to join

**Today.** Both renderers draw a posed SVG rig (`JOINT`, 43 `POSES`) at about 64 by 90 units.
Smooth is rounded gradient tubes with a translucent inner line; Retro is `<rect>`s with a 1px
lit edge and a black outline pass. Smooth is the default, so most players have only ever seen
a vector puppet. Retro is closer to pixel art but is a different pixel style from the sister
games: flat rects, a uniform black ring, no light model, and arbitrary non integer scales.

**Run The Floor (`hoops/baller.js`)** is the reference. A 44 by 64 grid, about four heads
tall. Every part is a shape with its own surface normal (tapered tubes for limbs, row tables
for the head and torso, ellipses for hands), lit from the upper left
(`[-0.52, -0.6, 0.6]`). Five step ramps turn cool (hue 238) in shadow and warm (hue 52) in the
light, holding chroma; skin uses its own warmer ramp. A part in front draws a line in its own
dark step on the part behind it. The outline is one ring outside the silhouette, a dark mix of
whatever it borders, lighter on the lit side, never flat black. Two frame breath (everything
above the knee drops one cell) on a page wide 720ms timer, frozen under reduced motion.
Integer scale only, `image-rendering: pixelated`, cached data URLs.

**Run The Tour (golf)** is the same family with three deliberate differences: a chibi 44 by
56 grid, RGB ramps instead of hue rotation, and the outline inside the silhouette. Note that
`golf/pxgolfer.js` is a stale generated copy; the live golfer is the `PXHD` renderer inside
`golf/index.html`.

**Decision for wrestling (prototyped, awaiting approval):** match hoops exactly (grid cell,
head size, ramps, light, contact lines, outline, breath, pipeline) and widen the canvas to 56
by 72 so five builds fit without changing the pixel size. See DESIGN.md.

## 8. Design inventory

| | count | notes |
|---|---|---|
| font families | 4 loaded | Anton, Barlow Semi Condensed, Cinzel (loaded, **never used**), system mono; Georgia hardcoded for quotes; `--sans` used but undefined |
| colour literals | 281 in CSS, 352 in JS | 101 near greys, about 30 near blacks for two surfaces; gold at 34 alphas, black at 30 |
| reds | 6 | brand red, bright red, `#f0907f` (63 uses, no token), `#c0392b`, `#e0685a`, booking's own |
| font sizes | 53 | 47 rules at 9.5px or smaller |
| letter spacings | 29 | |
| paddings | 116 | no spacing scale |
| radii | 27 | cards from 9 to 20px |
| box shadows | 53 | almost all used once |
| button treatments | 7+ | one needs eight `!important`s to escape the global rule |
| keyframes | 52 | `btnGlow` animates box shadow forever on home |
| breakpoints | 430 520 640 720 760 860 761 900 | |
| inline `style=` | 448 | tokens cannot reach them |

Icons: 34 pixel `PICO` and 34 vector `PICO_SM`, plus emoji and dingbats shipped as UI icons
(a lock emoji on locked cosmetics, a fork and knife for catering, nine Unicode symbols on the
backstage map), which render per platform.

## 9. Visual and UX problems seen in the screenshots

1. **A modal opens over every screen on day one.** The season goal card covers the hub and
   every tab until dismissed; the onboarding toast ("Rolled: Brawler") overlaps its Got It
   button on a phone.
2. **Desktop is a phone column in a void.** At 1440 wide the match ring is about 470px wide
   and two thirds of the screen is empty. Names truncate ("DIAMOND ST...") in the bars even
   with room to spare.
3. **The entrance overlay collides with itself** on a phone: the gimmick line and the name
   plate overprint each other.
4. **A cream number strip** sits between dark chrome and dark content, with 9px brown labels
   at 3.5:1.
5. **Two art styles in one frame.** Retro mode puts pixel sprites inside smooth gradient
   chrome; the logo is pixel art in both modes.
6. **No focus styles**, 39 clickable divs with no role or tabindex, toasts not announced.
7. **Reduced motion** covers four of 52 animations. The full arena white flash and screen
   shake ignore it, which is the most serious photosensitivity issue in the game.
8. **A 15px dead strip** on the right of every page at phone width (`scrollbar-gutter`
   reserved on a page that does not scroll sideways).
9. **Copy promises things the code does not do**: eight archetypes, a keepsake move, a
   "went into the office" badge, promo style remembered across careers, rival promotions
   that burn bridges.
10. **Possible trademark collisions**: "GCW" is also a real promotion's initials; "King of
    the Ring", "Best of the Super Juniors", "The Cruiserweight Classic" and a "Tokyo Dome"
    reference are real event names; move "Natural Selection"; cosmetic "Tiger Mask".

## 10. Where careers feel the same

1. Scene picks are seeded by `year-week-trigger`, not by the career, so two careers see the
   same scene on the same week.
2. `continueCareer` reseeds the RNG from the calendar on every resume, so resumed careers
   replay the same random stream.
3. Eight yearly dilemmas carry weight 5 to 7 against 0.4 to 1.6 for everything else and
   crowd the deck.
4. A feud runs on four fixed backstage events, every third week.
5. Every match asks the same three questions with the same names.
6. Every archetype starts at OVR 33, and mentors plus repeatable repackaging pull every build
   toward a capped all 90s wrestler by mid career.
7. National rosters of three or four wrestlers repeat opponents weekly.
8. The opening is identical every time.
9. One feud at a time, forced onto the card every six weeks.

**Route map today:** one spine. Indie to regional to national to global by reputation and
OVR thresholds, with free agency as the only fork. Tours, tournaments and factions are side
loops that rejoin the spine. Endings: one Hall screen graded D to A plus, inducted or not.
There are effectively **two outcomes** (inducted, not inducted) and **one route**.

## 11. Bugs and debt

High impact:
- The wallet, gear, pass and streak live in the career save and **reset every new career**,
  although the economy is designed around persistence. Each of four slots runs its own pass.
- Kayfabe dollars leak into coins: a signing bonus (30,000 to 90,000 dollars) is added to
  the coin wallet; sponsor and signing life events also write coins directly.
- Unlimited farms: repackaging adds +3 attributes per use; turning adds standing and
  momentum per use; 66 mentor camps stack to the cap.
- `load()` erases saves on any schema change.
- The backup only protects slot 0, and restore writes the wrong slot.
- Contract no compete and downside are stored and never enforced; leaving a company keeps its
  secondary and tag titles.

Dead code: `simMatch` (only tests use it), `takeMatch`, `tagOffers`, `doTrainWeek`,
`arcOverAdjust`, `areRivalPromos`, and twelve more.

Performance: `renderWeek` calls `bookWeek` twice; every navigation serialises the whole
save; the live match rebuilds a full SVG figure with gradients on every pose change, with no
cache; up to six blurred, blended, animated beams plus 22 flashes run during a match; 1.18MB
of script and text banks parse on every load with nothing lazy.

Security: player text (names, finishers, catchphrase) goes into `innerHTML` unescaped. Self
XSS today; a real problem the moment share cards or leaderboards show it to others.

## 12. What to keep

The match engine's phase structure and quality model, the three rooms (crowd, locker,
office), the scene format with `when` predicates and priorities, the promo chip system, the
booker personalities, the living world tick, the injury and wear model after its last fix,
and the pundit voices. The redesign is a new skin, a new body, and a much bigger story engine
on top of a sim that already works.

---

# Appendix A: engine report

Read-only audit of `/home/user/runthe-gg-site/wrestling/`. Line numbers are `wrestling/index.html` unless a file is named. Function-name line numbers are where the `function` keyword sits (approximate to within a line or two).

Headline: the game is a large, mostly well-commented single-file sim (20,627 lines, 1.36MB, one 1.18MB inline `<script>` starting at line 2298). Its biggest problems are not crashes. They are (a) a meta-economy whose wallet, gear and pass silently reset every new career, while two code paths leak kayfabe dollars straight into that wallet, (b) several unlimited stat or standing farms (repackage, turn, mentors), (c) deterministic seeds that make every career see the same scene on the same week, and (d) copy that promises things the code does not do.

---

## 1. Architecture map

### Files and who loads them

| file | global | contents | loaded by |
|---|---|---|---|
| `index.html` | everything | the career game, one inline script (2298-20627) | itself |
| `moves.js` | `RTR_MOVE_CATS` (8), `RTR_TIERS` (5), `RTR_MOVES` (144), `RTR_STARTER_MOVES` (4) | move catalogue | `index.html` line 2294 (`?v=3`) |
| `legends.js` | `RTR_ERAS` (6), `RTR_LEGENDS` (66) | mentors | `index.html` 2295 (`?v=2`) |
| `cosmetics.js` | `RTR_RARITY`, `RTR_PACKS` (3), `RTR_COSMETICS` (148), `RTR_PALETTE`, `RTR_SHARD_COST` | store and look editor | `index.html` 2296 (`?v=4`) |
| `world.js` | `RTR_PROMOS` (9), `RTR_CHARS` (43), `RTR_REL_DEFAULT`, `RTR_FACTIONS` (6) | the fictional world | `index.html` 2297 (`?v=3`) |
| `roster.js` | `RTR_ROSTER` (286) | real wrestlers under legal names, for the Booking Sim | `booking/index.html` 511 only |
| `corrections.js` | `RTR_CORRECTIONS` (267 keys) | ratings overlay for the roster | `booking/index.html` 512 only |
| `personalities.js` | `RTR_PERSONALITIES` (30) | managers / free agents | `booking/index.html` 513 only |
| `booking/index.html` | own | separate "Promotion Booking Sim" (125KB), linked from the career home page | `/wrestling/booking/` |
| `verify.mjs` | n/a | regression suite (Playwright); drives the page with harness hooks | CLI |
| `build-logo.mjs`, `logo-source.html`, `og-source.html` | n/a | brand/OG build | CLI |

The career game itself does not load `roster.js`, `corrections.js` or `personalities.js`.

### Script layout (major sections by banner comment)

| line | section |
|---|---|
| 2304-2323 | save slots (`SAVE`, `SLOT_KEYS`, `activeSlot`, `slotSummary`, `listSlots`) |
| 2324-2400 | core constants: `WEEKS_PER_YEAR=40`, `ATTRS`, `TIERS`, `SCHEDULES`, `INJURIES`, `GIMMICKS` |
| 2405-2480 | PPVs (`PPV_WEEKS`, `PPV_ROTATION`, `nextPpv`, `ppvForShot`), `workTier` |
| 2469-2865 | belts: `BELT_CONFIG`, `BELT_PLATE`, `BELT_ART`, `beltSVG`, `heldBelts`, `titlesHeldBy` |
| 2868-3060 | "numbers with context" bands, the three rooms (`sentiment`, crowd/locker/office) |
| 3064-3260 | season goals (`SEASON_GOALS`, `assignSeason`, `seasonReport`) |
| 3300-3480 | crowd reaction / lean / turns (`reactionOf`, `crowdShift`, `maybeTurn`) |
| 3478-3540 | `freeAgentOffers`, `PRODUCT_FIT` |
| 3529-3850 | accolades, moments queue, ceremony, coach cards, thresholds/milestones |
| 3843-3870 | `G`, `RNG`, `rnd`, `pushLog`, `toast`, `modal` |
| 3887-4130 | coin economy, daily streak, daily objectives, Ropes Pass |
| 4130-4440 | locker room: factions, allies, tag teams, stables, managers, betrayal |
| 4451-4505 | `save`, `load`, `migrate` |
| 4515-5765 | pixel renderer (retro) + smooth renderer (`wrestlerSVGRetro`, `wrestlerSVGSmooth`), icons (`PICO`, `PICO_SM`), poses |
| 5765-5800 | wrestler math (`ovr`, `tierOf`, `checkUnlocks`, `moveEligible`) |
| 5799-6165 | character creation (`STYLES`, `startCreate`, `doQuickStart`, look editor, `finishCreate`, `startingPromotion`) |
| 6165-6735 | living world (`initWorld`, `worldTick`, `spawnRookie`, `generateWorldEvent`, roster arcs, scouting) |
| 6735-6865 | pager widget and nav (`NAVG`, `paintBotNav`) |
| 6864-7025 | guided tour |
| 7023-7160 | rulebook (`RULES`) |
| 7156-7215 | router `go()`, `decorateHeader`, `refreshHud` |
| 7215-7570 | ring, arenas (`ARENA_DEF`, `venueHTML`, `ringSVG`) |
| 7568-7727 | home screen, slot picker, `continueCareer` |
| 7727-8410 | career hub (`renderCareer`, `renderWeek`, `renderBizPanel`, inbox) |
| 8404-8690 | difficulty, `makeOffers`, `STIP_RULES`, `commitFinish` |
| 8690-8945 | rivalry storylines, `STORY_KINDS`, `inferStoryKind`, `backstageEvent` |
| 8946-12420 | live match engine (choreography, triple threat, ref, phases, decisions, pins, `finalizeFight`, `skipFight`) |
| 12420-12720 | booking sheet (`pullOf`, `bookWeek`, prep, office asks, `goBooking`, `simMatch`) |
| 12723-13250 | `applyMatch` (all post-match consequences) |
| 13251-13750 | dirt sheet, result screen, press conference, post-match mic |
| 13748-14270 | `advanceWeek`, tours, tournaments, rumble, injuries |
| 14268-14500 | non-match events (`maybeBackstage`, rookie meet, life events, hallway) |
| 14501-14720 | rest / mentor weeks, `yearEnd`, retirement, Hall of Legends, Next Chapter, backup |
| 14717-15180 | training, moves, mentors, shop, pass screen, packs, card/dossier |
| 15177-15510 | `RPK` pixel brand kit, share card |
| 15507-17460 | promos (chip system, cuts, directives, bookers, rhythm mode) |
| 17480-17815 | crew (allies/teams/stables), deal screen, turn, repackage |
| 17814-17965 | The World screen |
| 17964-18320 | Backstage floor plan |
| 18320-19795 | scenes and segments (`SCENES` 40, `SEGMENT_LIB` 13), voices, dilemmas/fx/arcs |
| 19794-20030 | the media (`PUNDITS` 5) |
| 20026-20300 | `pickScene`, `playScene`, segments, effects |
| 20304-20627 | lineage, record, Hall of Fame, legends, boot (`paintRings(); renderHome();`) |

### Router and screens

`go(s)` (7156) toggles `.screen` divs (`s-home`, `s-start`, `s-create`, `s-career`, `s-fight`, `s-match`, `s-moves`, `s-train`, `s-mentors`, `s-locker`, `s-shop`, `s-pass`, `s-crew`, `s-promo`, `s-deal`, `s-world`, `s-backstage`, `s-record`, `s-hof`; markup 1860-2260), paints nav, calls the screen's render function and then **`save()` on every navigation**. Render map:

| screen | renderer |
|---|---|
| career (Hub) | `renderCareer` 7729 → `renderWeek` 8095, `renderBizPanel` 8307, `renderStoryPanel` 7832 |
| moves (Arsenal) | `renderMoves` 14742 |
| train (Training) | `renderTrain` 14719 |
| mentors | `renderMentors` 14782 |
| locker | `renderLookEditor` 5996 |
| shop (Merch Stand) | `renderShop` 14830 |
| pass (Ropes Pass) | `renderPass` 14893 |
| card (My Card) | `openCard` 15071 (modal, not a screen) |
| crew (Locker Room) | `renderCrew` 17480 |
| backstage | `renderBackstage` 18040 |
| world (The World) | `renderWorld` 17814 |
| deal (Business) | `renderDeal` 17625 |
| record | `renderRecord` 20381 |
| hof | `renderHof` 20494 |
| home | `renderHome` 7568 |

### Navigation, correcting the assumed tab names

The assumed tabs ("This Week, Training, Locker Room, Merch Stand, The Business, The World, Backstage, Career Record") are partly wrong. The real structure is `NAVG` (6779): five groups on a bottom tab bar plus a raised Pass button.

| group | sub-tabs |
|---|---|
| Hub | Hub (`career`; the week sheet is inside it, there is no "This Week" tab) |
| Skills | Arsenal, Training, Mentors |
| Gear | Locker, Merch Stand, Ropes Pass, My Card |
| Roster | Locker Room (`crew`), Backstage, The World |
| Career | Business (`deal`), Record |

Inner pagers: Hub has `['Business','Attributes']` (7807); Business has `['Contract','The Road','Character','The Body']` (17658); Record has Story So Far / Matches / Titles / Accolades / Splits / Faced (20391); The World has one chip per promotion plus Titles / Rankings / Factions (17819). The Hall of Fame (`s-hof`) is not on the nav; it opens on retirement.

---

## 2. State model and save format

### Globals
`G` (career state), `RNG` (3843), `MS` (live match state, 8948), `PM`/`PMCTX` (promo, 15520/15539), `CREATE`, `LOOKCTX`, `PAGER`, `TOUR_I`, `FIGHT_SPEED`, `COMM_SAID`, `SAY_SAID`, `LAST_RESULT`, plus `window._pendingManagerName`/`_pendingFamilyOf` for keepsakes.

### The career object (`finishCreate` 6080, `G={...}` at 6087)
```
G = {
  schema: 1, screen, savedAt,
  w:   { name, nick, align, era, style, look{...}, attrs{po,te,ae,ch,ps,to,st}, mastery{8 cats},
         moves[], custom[] (mentor-taught moves), finisher, tp, xp,
         finisherName, finisherNameB, catch, entrance, gimmick{id,name,heat,since} },
  prefs: { difficulty, promoPlay },
  car: { age, year, week, rep, pop, cond, morale, mom, rec{w,l,d}, title, secondary, tagTitle,
         reigns[], earnings, streak, rivalId, plan{a,b}, mentor, mentorWeeks, injWeeks, retired,
         offers, milestones[], deal{promo,years,weeksLeft,weekly,sched,creative,merch,signedY,
         downside,noCompete,signingBonus}, standing, wear, injuries[], hurt, accolades[],
         yearLog[], turns, reaction, lean, promos[], ... plus ~80 lazily-added fields:
         booking, prep, inbox[], allies[], managerId, faction, titleShot, mitb, tourn,
         tourPending, storiesResolved[], definingRivalId, chronic[], awards[], yearAwards[],
         gimmickPast[], arcs[], fx[], _scenesSeen[], _sentHist[], freeAgent, faOffers,
         retireOnWeek, retireReason, familyOf, pendingCeremony, tourDone, ... },
  bag: { coins, lifetime, owned{}, shards, packs{}, epoch, pity, streak{}, daily{}, pass{}, _rebased },
  world: { news[], champions{promo:{world,secondary}}, teams[], turns{}, retired{}, factionFeud,
           brands{}, lineage{}, debuts, releases, arcs{}, brewingFeuds[] },
  story: { charId, stage, beats[], events, kind, shape, reason, ... } | null,
  rel / relationships (per character respect/heat), log[], hist[], hi[]
}
```

### localStorage keys
| key | holds |
|---|---|
| `rtr_baw_v1`, `rtr_baw_v1_s1..s3` | four career slots (`SLOT_KEYS` 2309) |
| `rtr_baw_slot` | active slot index |
| `rtr_baw_v1_prev` | one backup, slot 0 only (14704) |
| `rtr_baw_legends_v1` | Hall of Legends, capped at 60 (14633) |
| `rtr_gfx` | smooth/retro preference (4775) |

### Versioning and migration
`SCHEMA=1` and `load()` rejects any other schema (returns null, so a schema bump silently makes the save vanish rather than migrating). `migrate()` (4469) backfills `deal`, `standing`, `reaction`, `lean`, `wear`, injuries arrays and gimmick, and re-baselines the wallet when `bag.epoch !== COIN_EPOCH` (2). `migrateChampions()` (6208) and `rehydrateCharOverrides()` (4144) run in `continueCareer` (7717).

### Cloud save
None. The career game does not load `/assets/cloudsave.js`, `auth.js` or Supabase, and writes nothing to `ps_saves`. The comment at 3949 says so explicitly. Everything is per-browser.

### Autosave cadence
`save()` runs on every `go()`, every week action, every modal choice, and on `visibilitychange`/`pagehide`/`beforeunload` (4465). Saves are a full `JSON.stringify(G)` each time.

---

## 3. Character creation

Entry: `s-start` (1884) offers **Quick Setup** ("Book Me Now", `quickStart` 5929) and **Full Setup** (`startCreate` 5851 → `doStartCreate` 5856 → two steps).

**Quick Setup** (`doQuickStart` 5913): rolls name (`rollName`, from `NAME_A`/`NAME_B` 6070), 55% chance of a nickname from `NICKS` (12), alignment from `face,face,heel,heel,tweener`, a random era, a random archetype, a random look (owned items only), then `finishCreate`. It does not clear the finisher/catchphrase/difficulty inputs, so anything typed in an abandoned Full Setup leaks into a Quick Setup career.

**Full Setup** fields (markup 1976-2010):
- Ring Name (max 22, Roll button), Nickname (26), Finisher Name, Second Finisher Name, Catchphrase
- Difficulty: `rookie` (opponent OVR x0.92), `pro` (x1), `legend` (x1.10) (`diffOppMult` 8404). Applied only to opponent OVR in `makeOffers` (8498).
- Entrance Theme: metal, punk, hiphop, orchestral, electronic, country, funk, silent (8)
- Alignment: face, heel, tweener
- Came Up In (era): Golden Age, Hardcore Era, Ruthless Aggression, Modern Era, Puroresu, Lucha Libre (gates which mentors open first)
- Archetype (`STYLES` 5808), **six**, not eight as the start-screen copy says (line 1952):

| archetype | start bonus | grow | mastery | dmg out / in | decision edges | perk |
|---|---|---|---|---|---|---|
| Powerhouse | po+11 to+6 | po1.5 to1.3 | slam1.6 strike1.3 | 1.18 / 0.88 | fin .08 grind .06 | Heavy Hands |
| Technician | te+11 ps+6 | te1.5 ps1.35 | sub1.6 suplex1.4 tech1.4 | 1.0 / 0.96 | counter .14 chain .12 | Ring General |
| High-Flyer | ae+12 st+5 | ae1.6 st1.25 | aerial1.7 | 1.06 / 1.10 | risk .16 | Gravity Optional |
| Brawler | to+11 po+6 | to1.55 po1.25 | hardcore1.7 strike1.3 | 1.08 / 0.80 | survive .14 fire .08 | Cast Iron |
| Showman | ch+12 ps+5 | ch1.6 ps1.2 | showman1.7 | 0.96 / 1.0 | crowd .16 heat .14 fire .10, popMult 1.35 | Draws Money |
| All-Rounder | ps+5 te+5 ch+5 | all 1.15 | none | 1.0 / 0.94 | .04 on everything, tpBonus .25 | Complete Package |

- Step 2 look editor: Hair, Face, Mask, Attire, Boots, Extras, Pattern, Tattoos, Aura plus colours Skin, Hair, Gear, Trim (`LOOK_TABS` 5982).

**Starting values** (6091): age 21, year 1 week 1, rep 0, pop 5, cond 100, morale 70, momentum 50, standing 50, wear 0, 1,500 coins. Base attributes `BASE_ATTRS` (5842) po32 te32 ae30 ch30 ps28 to34 st36; every archetype starts at OVR 33-34. Four starter moves. First gimmick is random from the 14 `GIMMICKS` matching alignment (its stat bonus `b` is **not** applied at creation; it is only applied on repackage).

**Starting location**: `startingPromotion()` (6157) picks the indie whose `PRODUCT_FIT` best suits the archetype: Grit City Wrestling (brawler/powerhouse) or Cellar Door Pro (technician/high-flyer). Ties go to the first (GCW). One-year developmental deal.

**New Game Plus keepsakes** (`offerKeepsake` 5868): if any past career was inducted, pick one of finisher name, second finisher, catchphrase, entrance, "walk with you at ringside" (Hall legend as manager), or "carry the name" (family lineage).

---

## 4. The week loop

Hub → `renderWeek` (8095) calls `bookWeek` (12437), which picks the week:
1. a pending tour night, else a tournament round, else `maybeStartTourn` (5% roll once rep 1200+ and standing 52+);
2. match with probability `0.44 + standing/220 + sched.pop*0.12 + tier*0.03` (+0.12 with a live feud, -0.08 on a 3-loss streak), clamped 0.30-0.86; the first week is always a match;
3. promo with probability 0.07 (+0.04 stale act, +0.05 feud);
4. otherwise a dark week.

Match placement uses `pullOf` (12429, 0-3 from standing, title, crowd, tier): pull 0 takes the worst of the offers, pull 3 the best. A feud unbooked for 6 weeks is forced onto the card.

Player actions in a week:
- **Prep** (one of): Hit the gym (+30 XP, +55 on a dark week), Study the tape (better odds), Spar with an ally, Put your feet up (+10/+20 condition), Work the room (+1.6 standing) (`prepOptions` 12515).
- **Talk to the office** (pull ≥1, once a week, failure costs 3-6 standing): more time, different opponent, pitch a stipulation (pull 2), ask to go over (pull 3), demand a title shot, start a feud, ask for your release (`officeOptions` 12562).
- Head to the ring (`goBooking` 12661), which may first play a pre-match scene, or Call It A Week (`endDarkWeek` 12556) which may play an "any" scene.
- Injured: Rest & Rehab (`doRest`, +22 condition) or Work Through It. In mentor camp: Train This Week.

`advanceWeek` (13750): daily progress, fx/arc tick, week++, expire title shots, farewell-tour retirement, condition recovery `11 - sched.wear*4`, momentum decays to 50, wear (+`sched.wear*0.34` a week, or heals 1.2 a week down to a floor of `(age-21)*4` while injured), standing drifts to 52, payday (`deal.weekly*sched.pay` + `merchWeekly()` into kayfabe earnings), gimmick heat decay, popularity capped by tier (38/64/85/100), reaction drift, healing, loyalty and betrayal checks, defining-rival return (1.5%), free agency when the deal runs out, scouting offers, year end at week 41, `worldTick`, tour offers (6% once rep 800+), power rankings, mid-year report; then `maybeBackstage` 260ms later.

**Training**: TP are earned from XP (100 XP per TP, from matches, gym prep, events) and spent on the Training screen (`spendTP` 14738, +`growMult` per point). `doTrainWeek` (14502) exists but nothing calls it (dead). Moves unlock automatically when both the attribute gate (`val`) and the category's mastery tier are met (`checkUnlocks` 5786). Mastery comes from the two game-plan categories.

**Injuries** (`takeInjury` 14211): 9 types (ankle, hamstring, elbow, ribs, shoulder, knee, concussion, back, neck), weighted by the move families used. Severity from wear, condition and chronic count. Green bodies and anyone with a 10+ week layoff in the last 2 years cannot draw the top 3 entries. Healing may leave a permanent chronic penalty (`healUp` 14193). Four chronic injuries plus a 12-week neck/back injury ends the career.

**Schedules** (`SCHEDULES` 2349): Light Loop (pay .72, wear .52, injury .58), Full-Time, Every Town (pay 1.34, pop 1.32, wear 1.70, injury 1.58).

**Money** is kayfabe (`c.earnings`), from weekly downside, merch and purses. **Coins** are the meta currency (section 9).

**Contracts** (`freeAgentOffers` 3478, `signDeal` 17713, `renegotiate` 17747): up to 5 offers ranked by "want", with weekly guarantee, years, creative control, merch %, signing bonus, no-compete and downside. No-compete and downside are stored and never enforced (see section 11).

**Year end** (`yearEnd` 14511): age +1, growth to the peak (26-31 depending on mileage), decline from 31-38, pop -1.5, awards (Match/Wrestler/Rookie of the Year and yearly badges), awards ceremony, season report, and a random forced retirement roll from age 36.

**PPVs** at weeks 10, 20, 30, 40, with names per promotion.

---

## 5. Promotions

**Nine, confirmed** (`world.js` lines 13-40):

| tier | promotions | product |
|---|---|---|
| Indie (rep 0, OVR 0) | GCW Grit City Wrestling; CDP Cellar Door Pro | Hardcore / Deathmatch; Workrate Indie |
| Regional (rep 1400, OVR 44) | SBCW Steel Belt Championship Wrestling; SCW Sunset Coast Wrestling; CR Crimson Rose | Old-School Territory; Flash & Spectacle; Joshi |
| National (rep 5200, OVR 59) | ACW Apex Championship Wrestling; KJP Kaiju Puroresu; LE Lucha Eterna | Sports-Based; Strong Style; Lucha Libre |
| Global (rep 14000, OVR 70) | CWF Colossus Wrestling Federation | Global Sports-Entertainment |

House rosters (from `RTR_CHARS`, 43 total): GCW 6, CDP 5, SBCW 4, SCW 5, CR 5, ACW 4, KJP 3, LE 3, CWF 8. Kaiju and Lucha Eterna have three wrestlers each, which is thin for a national company over a long career (rookies spawn at 3% a week to refill).

**Moving between them**: you only leave on free agency (deal expiry, a granted release, or a scouting offer from `maybeScoutingOffer` 6513). Offers are filtered to at most one tier above what your rep earns. The tier you actually work is the lower of earned tier and your promotion's tier (`workTier` 2461). National and global houses get a red/blue brand split (`initWorld` 6183).

`PROMO_RIVALRIES` (6174) and `areRivalPromos` (6180) claim "signing with one burns respect at the other". Nothing calls `areRivalPromos`; the rule is not implemented.

**Titles** (`BELT_CONFIG` 2469): every promotion has a world and a secondary belt; six have tag titles (SCW, CR and LE do not). 24 belts, each with its own plate art. World tracking (`G.world.champions`) holds only `world` and `secondary`; tag titles exist only on the player (`c.tagTitle`).

---

## 6. Match engine

**Stipulations** (`STIP_RULES` 8616), 14 plus the Battle Royal:
singles, tag, hardcore, ladder, cage (Steel Cage), sub (Submission Match), lms (Last Man Standing), grudge (Grudge Match, also labelled "Street Fight" on the aggressive feud track), triple (Triple Threat), iquit (I Quit), iron (Iron Man, 20 minute falls), chamber ("Steel Dome", six-man), mitb (Briefcase Ladder Match), tlc (Tables, Ladders, Chairs); plus `rumble` (Battle Royal, separate `runRumble` 14055). Tournaments (`TOURN_NAMES` 13931: King of the Ring, The Summer Cup, Best of the Super Juniors, The Cruiserweight Classic) are three-round brackets. Tours (`TOUR_OFFERS` 13885) are five one-night foreign matches.

**Structure**: `startFight` (10720) builds `MS` (hp bars for each side as **damage taken**, momentum -100..100, four limb damage meters, clock, near falls). `runFight` (10933) loops beats through `PHASES` (10328): Feeling Out (2), The Shine (3), The Heat (4), The Comeback (3), Finish Stretch (open). Each beat is your move (`myMove` from your game plan) or theirs (`oppMove`, by style), with damage, quality and limb work. Spots: ref bumps, run-ins, cheap shots, belt shots, count-outs, hot tags, blood, triple-threat swaps and steals, over-the-top in rumbles.

**Player choices**: `finishDecision` (Go for the finisher / Grind them down / Play to the crowd), `midDecision` (High-Risk Spot / Chain Wrestling / Work the Crowd), `comebackDecision`, `chooseTarget` (limb), and mash windows (`tapWindow` 8985) for kick-outs, submission escapes and ladder climbs. Each option shows a success percentage from attributes, momentum and archetype edges.

**Outcome**: decided inside the live loop by covers (`coverChance` 11526: 96% after a finisher, else from damage and phase), submissions, climbs, count-outs and DQs, and normalised to what the stipulation allows by `commitFinish` (8665). Speed button cycles 1x/2x/4x (`cycleSpeed` 8950). Skip (`skipFight` 12391) resolves the rest with an Elo-style odds formula `1/(1+10^((oppOvr-meOvr)/16))` nudged by the match so far.

**Match rating** (`finalizeFight` 12305): `12 + craft*0.62 + pace*0.14 + stip mod + manager`, where craft blends move quality, governing attributes, psychology and opponent OVR; then bonuses for near falls, variety, limb focus, submission payoff, title stakes, blood, decisions won; penalties for short matches, repetition, green psychology, stamina, condition, ref bumps. Star rating is derived from the 0-100 score.

`simMatch` (12682) is a second, simpler quality model that **the game never calls**. Only `verify.mjs` uses it (lines 176, 368, 721, 1492), so the multi-year career harness and the economy test measure a different match model from the one players play.

---

## 7. Events, decisions, stories

Events are a mix: the `SCENES` and `SEGMENT_LIB` tables are data-driven with `when` predicates; the feud, life, hallway and rookie events are hardcoded inside functions.

### SCENES (18722, 40 entries; `pickScene` 20026)
Triggers: `prematch` (walk to gorilla), `any` (off weeks/end of week), `signing`, `titlewin`. Due arcs outrank everything, then the highest `priority`, then a weighted pick seeded only by `year-week-trigger`.

| id | tag | trigger | weight | fires when |
|---|---|---|---|---|
| dil_shoulder | The Trainer's Room | prematch | 7 | 4+ matches, once a year |
| dil_offer | The Parking Lot | any | 6 | year 2+, standing 45+, once a year |
| dil_tape | The Hotel Room | any | 6 | week 7+, once a year |
| dil_favour | The Favor | any | 6 | year 2+, standing 48+, once a year |
| dil_green | The Green Boy | prematch | 6 | standing 52+, 8+ matches, once a year |
| dil_gimmick | The Note | any | 6 | act freshness ≤42, week 9+, once a year |
| dil_travel | The Drive | any | 5 | week 5+, condition ≤72, once a year |
| dil_ceiling | The Conversation | any | 6 | year 3+, standing 55+, no title, once a year |
| arc_comeback | Cleared to Return | prematch | 1, prio 4 | a seeded comeback arc is due |
| arc_offer_back | The Office | any | 1, prio 4 | a seeded offer arc is due |
| feud_s1 | The Hallway | prematch | 6, prio 2 | feud stage 0-1 |
| feud_s2 | Personal | prematch | 6, prio 2 | feud stage 2 |
| feud_s3_signing | Contract Signing | prematch | 8, prio 3 | title feud at stage 3+ |
| feud_s3 | Tonight | prematch | 7, prio 2 | non-title feud at stage 3+ |
| feud_post | Afterwards | any | 5, prio 2 | a feud resolved in the last 3 weeks |
| ally_wavering | Your Corner | prematch | 8, prio 3 | an ally's loyalty is slipping |
| betrayal_open | The Turn | prematch | 8, prio 3 | betrayal feud stage 0-1 |
| veteran_lesson | The Lesson | prematch | 7, prio 3 | veteran feud stage 0-1 |
| underdog_pep | Before the Bell | prematch | 6, prio 3 | underdog feud stage ≤2 and someone to talk to |
| first_night | Your First Night | prematch | 1, prio 5 | no matches yet |
| booker_direction | A Word From the Office | prematch | 1 | standing <48 |
| contract_whisper | The Parking Lot | any | 1 | ≤10 weeks left on the deal |
| rival_ambush | Ambush | prematch | 1.4 | a rival exists |
| champ_sizeup | Champion Visit | prematch | 1.3 | a champion to cast |
| locker_accusation | The Locker Room | any | 0.9 | house of 3+ |
| ally_pep | A Friend | prematch | 1 | an ally exists |
| rookie_asks | A Rookie | any | 1 | standing 55+ and a rookie |
| interviewer | Interview | prematch | 1 | always |
| wild_snake | The Parking Lot | any | 0.5 | always |
| wild_impostor | Gorilla Position | prematch | 0.5 | always |
| wild_catering | Catering | any | 0.6 | house of 3+ |
| wild_fan | Backstage | any | 0.5 | always |
| wild_repossession | The Parking Lot | any | 0.4 | house of 3+ |
| wild_wrongname | Gorilla Position | prematch | 0.4 | always |
| callback_mic | Production | any | 1.6 | you stole the mic earlier |
| callback_snake | Catering | any | 1.6 | you saved or ratted on the snake earlier |
| rel_hallway | The Hallway | any | 1.5 | house of 2+ |
| signing_day | Signing Day | signing | 1 | on signing |
| title_night | After the Bell | titlewin | 1 | after a title win |
| callback_office | A Word From the Office | any | 1.5 | you told the office off earlier |

### SEGMENT_LIB (19598, 13; legacy single-beat fallback when no scene qualifies)
champVisit (title shot target exists), rivalAmbush (feud), interviewer (always), gmWarning (standing <45), allyPep (an ally), lackeyMessage (no shot, standing 50+), youngAsk (standing 55+), agentNote (4+ matches), cameraman (pop 35+), medic (condition ≤62), merchTable (pop 45+), roadStory (year 2+), writerPitch (standing 60+). Because `interviewer` and several `wild_*` scenes are always eligible, segments only appear when the scene deck is exhausted for that trigger.

### Hardcoded events (`maybeBackstage` 14268, fired after each week)
- **Feud backstage** (`backstageEvent` 8884), every week where `week % 3 === 0` while a feud is live: 4 events: parking-lot jump, interview burial, costs you a match, truce offer (stage 1+). Each has 3 choices moving heat/respect/pop/condition/momentum and advancing the stage.
- **Rookie meet** (`rookieMeetEvent` 14288): 1 event, 4 choices, from the pending-rookie queue.
- **Hallway** (`nonRivalBackstage` 14412), week % 5 with no feud, 55%: 6 events: ally_help, ally_favor, mid_respect, mid_workout, mid_gossip, vet_meeting (after a <50 match).
- **Life** (`lifeEvent` 14320), week % 7 with no feud, 45%: 7 events: podcast, sponsor (pop 45+), signing (comic con), hometown (pop 55+), scandal (pop 40+, 35%), talkshow, documentary (pop 70+).

### World (`worldTick` 6338, `generateWorldEvent` 6621)
Per week: title change elsewhere 10%, rookie debut 3%, signing 2%, release 1.2%, team forms 4%, turn 3%, retirement 0.8%. Plus one of 7 "sports news" types about a third of weeks: staleChamp, defection, injury, turn, upset, feudBrew, signing. Roster arcs (`ARCS` 6566): rising, hot, cold, stagnant, career year, hurt.

**Event count**: 40 scenes + 13 segments + 4 feud + 1 rookie + 6 hallway + 7 life = **71 authored player-facing events**, plus 7 world event types and 7 per-week world rolls, 7 season goals, 9 office asks, tournament/tour/rumble/scouting offers.

### Inbox and news
`pushInboxItem` (8943) keeps 12 items; `newsPush` (6303) keeps 120 in "The Ropes Report". The dirt sheet (`showDirtSheet` 13385) and five invented pundits (`PUNDITS` 19803: Dave Kesler, Renee Okafor, Mickey Brandt, Terrence Shaw, Wendy Lin) react to matches.

### Promos
`beginPromo` (16781). Modes: crowd, callout, title, talkshow. Play styles: Skip (median), Quick Cut, Ride the Wave (three timing taps), Build the Promo (stance, chips, replies). 70 chips in `CHIP_BANK` (15631), 39 signature cuts in `CUT_BANK` (16087), 6 booker directives (`DIRECTIVES` 16556: build, sell, soften, heat, feud, push), 9 named bookers (`BOOKERS` 16569). `G.prefs.promoPlay` is described as "remembered across careers" (comment ~16820) but prefs live in the per-career save and reset at creation.

### Feuds and story kinds
One story at a time (`G.story`). `STORY_STAGES` Spark, Escalation, Personal, Blow-Off, Settled. Stipulation ladders by shape (aggressive, cool, cerebral, underdog) (`RIV_STIP_BY_SHAPE` 8712). Kinds (`STORY_KINDS` 8733): grudge, title, betrayal, underdog, veteran. `inferStoryKind` (8751) reads the reason sentence with regexes (betrayal words, underdog words), then belts, then veteran traits and OVR gaps, else grudge. Feuds start from losses, office callouts, scenes, betrayals, world `feudBrew`, and the defining-rival return.

### Locker room
Allies, tag teams, stables, managers, factions (6: The Kingmaker's Court, The Grit City Family, The Sunset Syndicate, The Iron Blossom Dojo, Los Eternos, The Gatekeepers), loyalty, betrayal (`checkBetrayal` 4386). Per-character respect/heat relationships (`rel` 4219).

### Fan reaction and alignment
`reaction`, `lean` (-100 heel to +100 face), `alignMismatch`, `crowdShift`, `maybeTurn`; manual turns (`doTurn` 17766) and repackages (`doRepackage` 17798). Gimmick freshness decays every week.

### Mentors and arsenal
66 legends across 6 eras (26 legendary, 24 epic, 15 rare, 1 common), using real wrestlers' legal names and real signature move names. A camp costs 3 weeks, gives a permanent attribute block (+16 to +30 total) and teaches a tier-5 move with no gate (`completeMentor` 14810). Access: rep 400/1500/4500/12000 by rarity, era match or double the rep. Total available from all 66: 2,002 attribute points. Moves: 144 in 8 categories over 5 tiers (mastery 0/70/200/420/750).

---

## 8. Career end and the Next Chapter

Ways a career ends:
1. Retire any time (`confirmRetire` 20491).
2. Farewell tour of 4, 12 or 26 weeks (`announceRetirement`), auto-retires on the date in `advanceWeek`.
3. Forced at year end from age 36: odds `5% at 40+, +8% at 44+, +14% at 48+, + mileage*3% + 5% per chronic injury`.
4. Catastrophic injury (4+ chronic and a 12+ week neck/back).

`retire()` (14593): 2,000 coins, `archiveToLegends()` (legacy score `rep/60 + reigns*14 + wins*1.4 + pop*0.7 + OVR*0.6`, grade D to A+, inducted at 120+), go to the Hall of Fame screen. `renderHof` shows grade, four area bars (In the ring, Draw, Business, Character), a highlight reel, career-defining rival, year ribbons, championships, and lets you induct one NPC as "this year's class" (`pickHofClass`).

"Begin The Next Chapter" (`startNextChapter` 14658):
- **Walk with the next wrestler**: moves to an empty slot and starts a new career with the legend as manager and family lineage. The copy also promises "a keepsake move from your finisher tree"; no move is granted.
- **Take a booker's chair**: sets `c.wentIntoOffice`, which nothing reads. The copy promises a "went into the office" badge on the Hall entry; there is none (the entry was already written at retirement).
- **Just start something new**: `newCareerConfirm`, which archives the career to the Hall again (a second, duplicate Hall entry for every retired career that takes this route).

There is no Hall of Fame across accounts or online; the Hall of Legends is local (60 entries) and is named "Hall of Immortals" on one line of the HOF screen.

---

## 9. Monetization and accounts

- **No real money, no ads, no accounts.** The page carries no AdSense tag, no Stripe, no Supabase, no `premium_unlocks` product, and no RunThe.GG sign-in. It is `noindex, nofollow` (line 7).
- **Merch Stand** (`renderShop` 14830): cosmetic only (148 items, no stat effects). Three packs (Locker Room 2,400 / Main Event 6,500 / Hall of Fame 15,000 coins) with a floor rarity and pity; direct buy at 3,000 / 9,000 / 24,000 / 60,000 by rarity; forging with shards (4/8/16/32). Every pack drops +2 shards.
- **Ropes Pass** (4045-4125, `renderPass` 14893): 60-day seasons from 1 Sep 2026, 50 tiers, free and PRO lanes, XP = 0.5 per coin earned, capped at 1,000 XP a day. **PRO costs 25,000 coins**, not money; it gives 1.25x coins and the PRO lane. The comment at 4041 says it should become a real-money pass once there is an account layer.
- **Daily loop**: a 7-day streak track (`STREAK_TRACK`, coins and packs; a 2-3 day gap holds the streak, 4+ resets) and 3 daily objectives from a pool of 10 seeded by date (+250 and 2 shards for all three).
- **Coin faucet** (`awardCoins` 3932): match by card position (22/38/65, x1.6 on PPV), quality bonus (15-140), title win 350, defense 90, feud end 200, promo 20/+45, season goal 400, battle royal 300, career end 2,000.

---

## 10. Where careers feel the same

1. **Scene choice is seeded by the calendar, not the career.** `pickScene` seeds its weighted pick on `${year}-${week}-${trigger}` (20049), `pickSegment` on `${year}-${week}-seg` (19786), the backstage floor on `${year}-${week}-${promo}` (18019), and the dirt-sheet headline rotation on the week (13280). Two careers with the same eligible pool on Y2W14 get the same scene.
2. **The RNG is reseeded from the calendar on every resume.** `continueCareer` sets `RNG = year*104729 + week*7919 + 1` (7723). Every career resumed on the same week replays the same random stream (tournament rolls, world events, offers, injuries). Only the very first session's seed includes `Date.now()` (6103).
3. **Dilemmas crowd out the rest.** The eight `dil_*` scenes carry weights 5-7 against 0.4-1.6 for everything else, so whenever one is eligible it almost always wins; they come back every year (`sceneRecalls(id+year)`).
4. **Feuds run on four events.** During any feud, every third week fires `backstageEvent`, which is one of four fixed situations with fixed choices and fixed effects ("Answer with a promo: Charisma decides how it lands" ignores charisma). A long feud repeats them.
5. **Matches ask the same three questions.** The finish decision and mid-match decision are the same three cards every time, with the same names.
6. **Every archetype starts at OVR 33-34 on an indie**, and mentors (2,002 attribute points on offer) and repackaging (see 11) pull every build toward a capped all-90s wrestler, so archetypes converge by mid-career.
7. **Tiny national rosters.** Kaiju and Lucha Eterna have three wrestlers each and ACW four, so the same opponents return every week at that tier.
8. **The opening is identical.** Always 21, always GCW or CDP, always a debut match in week 1, always the `first_night` scene, always the tour.
9. **Only one feud at a time**, and the office forces it onto the card every six weeks, so mid-career weeks become feud weeks.

---

## 11. Bugs, dead code, performance

### Economy and progression (high impact)
- **The wallet, gear, pass, streak and daily all reset with every new career.** They live in `G.bag` inside the per-slot career save, and `finishCreate` writes a fresh `bag` (6100). The economy is designed around persistence ("gear outlives the wrestler", cosmetics.js header; `verify.mjs` 702 asserts the store takes "8+ careers" to clear), but nothing carries across. With four slots, each slot also runs its own pass (4x the daily XP cap) and streak.
- **Kayfabe dollars leak into coins.** `signDeal` adds `signingBonus` (a dollar amount, roughly 30,000 at national tier and about 90,000 at global) straight to `G.bag.coins` (17721). The `sponsor` life event pays 8,000 or 14,000 coins (14345), `signing` 600, and `ally_favor` costs 200, all written directly to `G.bag.coins` and bypassing `awardCoins`. A full career is meant to earn about 20,000 coins.
- **Unlimited stat farm via repackage.** `doRepackage` (17798) adds the gimmick's +3 attribute block every time, with no cost beyond popularity (floored at 1) and no cooldown.
- **Unlimited standing/momentum farm via turning.** `doTurn` (17766) gives +4 standing and +10 momentum every time; it is repeatable.
- **Mentors stack to the cap.** Each camp is a +16 to +30 permanent block and a gate-free tier-5 move; 66 are available.
- **Gimmick bonus not applied at creation** (only on repackage), so the first gimmick's listed bonus is cosmetic.
- **Secondary title defenses pay no coins** (`applyMatch` 12746 checks `defense` and `tag_defense` but not `secondary_defense`).

### Rules that are written and not enforced
- `PROMO_RIVALRIES`/`areRivalPromos` (6174-6181): never called.
- Contract `noCompete` and `downside` (3498-3507, 17718): stored, never read; payday uses `deal.weekly`.
- Signing elsewhere relinquishes `c.title` only; `c.secondary` and `c.tagTitle` from the old promotion are carried over (17725).
- Next Chapter: no keepsake move; `wentIntoOffice` never read; duplicate Hall entry via `newCareerConfirm` (14702).
- Promo play style "remembered across careers" is not.
- `backstageEvent` "Charisma decides how it lands" uses a fixed effect.

### Save and slot bugs
- The backup is slot 0 only: `newCareerConfirm` copies `SAVE` (slot 0) rather than the active slot, and `restoreBackup` writes back into slot 0 then `continueCareer` loads the active slot (14704-14716).
- `startCreate`/`quickStart` "Erase & Start" deletes the save without archiving it to the Hall.
- `load()` returns null on any schema mismatch, so a future `SCHEMA` bump erases saves silently.
- Keepsake "manager" pick writes to `G.car.pendingManagerName` if a previous career is still in memory, which `finishCreate` then cannot see (5895 vs 6126).
- An inducted NPC from `pickHofClass` enters the Hall list with `inducted:true`, so the next keepsake picker offers "carry the name" and "manager" for an NPC.
- Unbounded arrays persisted every save: `G.hi` (no cap anywhere), `c.reigns`, `c.accolades`, `c.milestones`, relationships.

### Copy and content
- Start screen says "Pick your archetype from all eight" (1952); there are six.
- Trademarked or real event names the blocklist misses: "King of the Ring", "Best of the Super Juniors", "The Cruiserweight Classic" (13932-13935), "Tokyo Dome undercard" (13887), and move "Natural Selection" in legends.js.
- The booking sim roster uses at least one ring name rather than a legal name ("Jordynne Grace", roster.js), against the repo rule.
- Mentors are real people under legal names with their real signature moves; legal naming is the repo's convention, but it is still a likeness question worth flagging.

### Dead code (only the definition references the name)
`simMatch` (12682, used by verify.mjs only), `takeMatch` (12414), `tagOffers` (7936), `doTrainWeek` (14502), `arcOverAdjust` (6617), `areRivalPromos` (6180), `arsenalScore` (5795), `champName` (16779), `currentPpv` (2453), `facOf` (4150), `isChampion` (2826), `listSlots` (2323), `loyaltyOf` (4249), `managerAlly` (4264), `passTier` (4073), `promoKinds` (16535), `pronounsFor` (15608), `storyKind` (8750), `_oppAlign` (16704). Test hooks `RTR_AUTO`, `RTR_FORCE`, `RTR_WIN` ship in production (harmless).

### Performance
- `renderWeek` calls `bookWeek()` twice per render (8100 and 8125).
- `go()` serialises and writes the whole save on every navigation; `renderHome` parses the save each time (`load()`).
- `poseSet` (9468) rebuilds a full wrestler SVG via `innerHTML` on every pose change in a match, with no cache (the smooth renderer emits gradients for every limb).
- Hub, week and record screens rebuild entirely with `innerHTML` on every click.
- About 1.18MB of inline JS including large text banks (`SCENES` ~875 lines, chip/cut/reply/say banks), parsed on every page load; nothing is lazy.
- localStorage is shared with every other game on the origin; four slots plus the Hall, with unbounded arrays, is a quota risk.

### Security
Player-entered name, nickname, finisher names and catchphrase are interpolated into `innerHTML` and `toast()` unescaped throughout (self-XSS only, since nothing is shared or synced; the share card text should be checked if it is ever posted).

# Appendix B: appearance report

Scope: `wrestling/index.html` (20,627 lines, one inline script), `cosmetics.js`, `world.js`, `roster.js`,
`personalities.js`, `legends.js`, `verify.mjs`, `build-logo.mjs`, `og-source.html`, `logo-source.html`,
`booking/index.html`. Line numbers are index.html unless stated. No repo files were edited.

## 0. Headline findings (things a redesign must not trip over)

1. **The look object is a flat bag of strings stored verbatim in the save** (`G.w.look`). Slot values are the
   catalogue's `v` strings (not the `id`s); ownership is keyed by `id` (`G.bag.owned[id]=true`). A migration
   table needs BOTH: `id -> new id` for ownership, `v -> new v` for every saved look.
2. **NPC looks are seeded by index into the catalogue order** (`oppLook`, ~8953): `pool(slot)[hash % pool.length]`.
   Adding, removing or reordering ANY cosmetic in a slot re-rolls the look of every generated NPC (rookies,
   tour opponents, Hall-legend managers, filler cast). It is deterministic, not stored, so nothing breaks, but
   every procedural face changes. `oppLook` also only rolls masks from `['lucha','half','hood']`.
3. **Two value spaces exist beyond the shop catalogue**:
   - `hairStyle:'swoop'` is used by 4 authored characters in `world.js` (Kip Sterling L154, Duke Kaiser L294,
     Rico Delacroix L339, Lux Delgado L406) and is in **no** renderer branch. Retro draws NO hair (they render
     bald); Smooth falls through to the default `cap()` (short hair) at ~5676. The two styles disagree.
   - `attire:'ref'` (referee, `REF_LOOK` ~9418) and `attire:'bodypaint'` (in the `BARECHEST` table ~4792 but in
     no catalogue entry and no branch) are renderer-only values.
   - `acc:'none'`, `face:'none'`, `mask:'none'`, `tattoo:'none'`, `aura:'none'`, `pattern:'solid'` are real values.
   - `beltCarry` (`waist|shoulder|hand`) and `build` (`lean|athletic|heavy`) live in the look but are not catalogue items.
4. **Five aura values have no bespoke art**: `spark`, `smoke`, `flame`, `storm`, `gilded` all fall to the generic
   two-colour sparkle branch (4859 retro / ~5316 smooth), distinguished only by palette.
5. **Ownership is per save slot and resets on a new career** (`finishCreate` ~6100 writes `bag:{owned:{}}`),
   although cosmetics.js says "gear outlives the wrestler". Not stored on any server; localStorage only.
6. **No real person in roster.js / personalities.js / legends.js has a look or is ever drawn.** The career game
   (index.html) does not load roster.js or personalities.js (script tags 2294-2297 load moves, legends, cosmetics,
   world only); the booking sim loads them and draws no wrestler figures; mentors (legends.js) are text-only.
   Likeness exposure lives in the **cosmetic names/designs**, not the rosters (section 5).

## 1. Customization options

### Look slots and the editor
- `LOOK_TABS` (~5982): `hairStyle`(slot hair) · `face` · `mask` · `attire` · `boots` · `acc` (label "Extras") ·
  `pattern` · `tattoo` · `aura`; plus synthetic tabs `build`, `belt` ("Title" = belt carry), `color`.
- `COLOR_TABS` (~5993): `skin` (pal skin), `hair` (Hair Color), `gear`, `trim`. Colours are free swatches.
- `slotKey(slot)` (~15020) maps catalogue slot -> look key (`hair -> hairStyle`, others identity).
- `renderLookEditor(bodyId, avId, L, ownedOnly)` (~5996): tile picker, each tile a live `wrestlerSVG` preview,
  framed by `FRAME={hairStyle:'head',face:'head',mask:'head',boots:'legs'}` else `full`. Locked items show 🔒.
- `setLook(k,v)` (~6057) writes and saves; `randomizeLook()` (~6060) picks owned items, 60% chance to drop a mask,
  random build and colours.

### Body types (build)
`lean` (bw=-2) · `athletic` (default, bw=0) · `heavy` (bw=+3). `bw` widens torso/limbs in the rig
(retro ~4790, smooth similar). Not a catalogue item; always free.

### Belt carry
`BELT_CARRY_OPTS` (~2611): `waist` (default) · `shoulder` · `hand`. Stored as `look.beltCarry`.

### Colour palettes (`RTR_PALETTE`, cosmetics.js L98)
- skin (6): `#f3d3b3 #e8bd95 #d29b6e #b2764a #8a5533 #5d3a22`
- hair (10): `#241a12 #4a2f1b #8a5a2b #c99b3d #e8dcc0 #b03a2e #3b6ea5 #7a3f9d #e0e0e0 #22c2a8`
- gear (12 listed, 11 survive): `#C6392C #e0b341 #2f7fbf` **`#3aa濃` (typo, filtered out at L105)** `#5bb083 #7a3f9d #e07b39 #F4E8DB #1a1a1a #d2687a #2fbfa8 #8a1c1c`
- trim (6): `#F4E8DB #e0b341 #1a1a1a #C6392C #2fbfa8 #7a3f9d`
- Authored world.js looks also use off-palette hexes (e.g. `#4a8f76 #5e7f8a #3f7fbf #c0455f #c0392b`), and pundits
  use their own (`#8a8177 #2f3a4a` ...). A palette swap must not assume looks hold palette values only.

### Default look `DEFLOOK` (~4516)
```
skin:'#e8bd95', hair:'#4a2f1b', gear:'#C6392C', trim:'#F4E8DB', hairStyle:'short', face:'none', mask:'none',
attire:'trunks', boots:'tall', acc:'wrist', pattern:'solid', build:'athletic', tattoo:'none', aura:'none'
```
Every renderer call does `Object.assign({},DEFLOOK,L)`, so missing keys default.

### Full cosmetic catalogue (`window.RTR_COSMETICS`, cosmetics.js; 148 items, no duplicate ids)
Rarity config `RTR_RARITY` (L21): common 3000c / rare 9000c / epic 24000c / legendary 60000c direct buy;
shards per dupe 1/3/8/20; forge cost `RTR_SHARD_COST` common 4 / rare 8 / epic 16 / legendary 32.
Packs `RTR_PACKS`: `p_base` Locker Room 2400c×3, `p_elite` Main Event 6500c×4 (rare floor), `p_legend` Hall of Fame 15000c×5 (epic floor).
"free" = `owned:true` (always available). Note the v3 commons (`h_slick h_widow f_soul a_crop b_barefoot
b_hightop x_armband g_pinstripe t_neck`) are NOT free; they must be bought/pulled.

#### slot `hair` (24)

| id | v (render value) | name | rarity | free |
|---|---|---|---|---|
| h_short | short | Short Crop | common | yes |
| h_bald | bald | Bald | common | yes |
| h_buzz | buzz | Buzz Cut | common | yes |
| h_long | long | Long Hair | common | yes |
| h_pony | pony | Ponytail | rare |  |
| h_mullet | mullet | Business/Party | rare |  |
| h_spiky | spiky | Spiked Up | rare |  |
| h_afro | afro | Afro | rare |  |
| h_mohawk | mohawk | Mohawk | epic |  |
| h_topknot | topknot | Top Knot | epic |  |
| h_flames | flames | Flame Mane | legendary |  |
| h_dreads | dreads | Dreadlocks | rare |  |
| h_undercut | undercut | Undercut | rare |  |
| h_wild | wild | Wild Mane | epic |  |
| h_horns | hornhair | Horned Crest | legendary |  |
| h_slick | slick | Slicked Back | common |  |
| h_widow | widow | Widow’s Peak | common |  |
| h_bun | bun | Fighter’s Bun | rare |  |
| h_curls | curls | Loose Curls | rare |  |
| h_fauxhawk | fauxhawk | Faux Hawk | rare |  |
| h_braids | braids | Twin Braids | epic |  |
| h_halfshave | halfshave | Half Shave | epic |  |
| h_frosted | frosted | Frosted Tips | epic |  |
| h_waist | waist | Waist-Length Mane | legendary |  |

#### slot `face` (19)

| id | v (render value) | name | rarity | free |
|---|---|---|---|---|
| f_none | none | Clean | common | yes |
| f_beard | beard | Beard | common | yes |
| f_stache | stache | Moustache | common | yes |
| f_goatee | goatee | Goatee | rare |  |
| f_warrior | warrior | War Paint | epic |  |
| f_skull | skull | Skull Paint | epic |  |
| f_tribal | tribal | Tribal Paint | legendary |  |
| f_mutton | mutton | Mutton Chops | rare |  |
| f_scar | scar | Scarred | epic |  |
| f_halfpaint | halfpaint | Half Paint | epic |  |
| f_venom | venom | Venom Paint | legendary |  |
| f_soul | soul | Soul Patch | common |  |
| f_handlebar | handlebar | Handlebar Stache | rare |  |
| f_fullbeard | fullbeard | Full Beard | rare |  |
| f_eyeblack | eyeblack | Eye Black | rare |  |
| f_crossface | crossface | Cross Paint | epic |  |
| f_visorp | visorpaint | Visor Paint | epic |  |
| f_bloodied | bloodied | Crimson Mask | legendary |  |
| f_mist | mist | Green Mist | legendary |  |

#### slot `mask` (15)

| id | v (render value) | name | rarity | free |
|---|---|---|---|---|
| m_none | none | No Mask | common | yes |
| m_lucha | lucha | Lucha Mask | rare |  |
| m_half | half | Half Mask | rare |  |
| m_hood | hood | Executioner Hood | epic |  |
| m_demon | demon | Demon Mask | legendary |  |
| m_tiger | tiger | Tiger Mask | epic |  |
| m_skullm | skullmask | Bone Mask | epic |  |
| m_phantom | phantom | Phantom Mask | legendary |  |
| m_jaguar | jaguar | Jaguar Mask | rare |  |
| m_wolf | wolf | Wolf Mask | rare |  |
| m_insect | insect | Hornet Mask | epic |  |
| m_bull | bull | Bull Mask | epic |  |
| m_crow | crow | Carrion Mask | legendary |  |
| m_dragon | dragon | Dragon Mask | legendary |  |
| m_samurai | samurai | Samurai Menpo | legendary |  |

#### slot `attire` (17)

| id | v (render value) | name | rarity | free |
|---|---|---|---|---|
| a_trunks | trunks | Classic Trunks | common | yes |
| a_tights | tights | Full Tights | common | yes |
| a_singlet | singlet | Singlet | rare |  |
| a_tank | tank | Tank Top | rare |  |
| a_jacket | jacket | Entrance Jacket | epic |  |
| a_duster | duster | Long Coat | legendary |  |
| a_shorts | shorts | Fight Shorts | common | yes |
| a_vest | vest | Leather Vest | rare |  |
| a_bodysuit | bodysuit | Full Bodysuit | epic |  |
| a_armor | armor | Ring Armor | legendary |  |
| a_crop | crop | Crop Top | common |  |
| a_sash | sash | Shoulder Sash | rare |  |
| a_harness | harness | Strap Harness | rare |  |
| a_hoodie | hoodie | Ring Hoodie | rare |  |
| a_gi | gi | Dojo Gi | epic |  |
| a_chaps | chaps | Leather Chaps | epic |  |
| a_robe | robe | Entrance Robe | legendary |  |

#### slot `boots` (13)

| id | v (render value) | name | rarity | free |
|---|---|---|---|---|
| b_short | short | Low Boots | common | yes |
| b_tall | tall | Tall Boots | common | yes |
| b_sneak | sneak | Wrestling Shoes | rare |  |
| b_pads | pads | Padded Kickers | epic |  |
| b_wraps | wraps | Foot Wraps | common | yes |
| b_platform | platform | Platform Boots | epic |  |
| b_gold | goldboot | Gilded Boots | legendary |  |
| b_barefoot | barefoot | Barefoot | common |  |
| b_hightop | hightop | High Tops | common |  |
| b_combat | combat | Combat Boots | rare |  |
| b_cowboy | cowboy | Cowboy Boots | rare |  |
| b_steel | steel | Steel Toes | epic |  |
| b_spiked | spiked | Spiked Boots | legendary |  |

#### slot `acc` (22)

| id | v (render value) | name | rarity | free |
|---|---|---|---|---|
| x_none | none | None | common | yes |
| x_wrist | wrist | Wrist Tape | common | yes |
| x_elbow | elbow | Elbow Pads | rare |  |
| x_shades | shades | Shades | rare |  |
| x_chain | chain | Chain | epic |  |
| x_cape | cape | Cape | epic |  |
| x_belt | belt | Title Belt | legendary |  |
| x_kneepads | knee | Knee Pads | common | yes |
| x_bandana | bandana | Bandana | rare |  |
| x_gloves | gloves | Fingerless Gloves | rare |  |
| x_scarf | scarf | Ring Scarf | epic |  |
| x_wings | wings | Entrance Wings | legendary |  |
| x_armband | armband | Arm Bands | common |  |
| x_necklace | necklace | Pendant | rare |  |
| x_towel | towel | Neck Towel | rare |  |
| x_tassels | tassels | Arm Tassels | rare |  |
| x_visor | visor | Combat Visor | epic |  |
| x_facemask | facemask | Protective Mask | epic |  |
| x_armorpad | armorpad | Shoulder Plate | epic |  |
| x_spikes | spikes | Spiked Pauldrons | legendary |  |
| x_feather | feather | Feather Headdress | legendary |  |
| x_crown | crown | The Crown | legendary |  |

#### slot `pattern` (17)

| id | v (render value) | name | rarity | free |
|---|---|---|---|---|
| g_solid | solid | Solid | common | yes |
| g_stripe | stripe | Side Stripe | common | yes |
| g_split | split | Split Color | rare |  |
| g_flame | flame | Flames | epic |  |
| g_stars | stars | Stars | epic |  |
| g_gold | gold | Gold Trim | legendary |  |
| g_bolt | bolt | Lightning | rare |  |
| g_check | check | Checker | rare |  |
| g_scales | scales | Scales | epic |  |
| g_royal | royal | Royal Trim | legendary |  |
| g_pinstripe | pinstripe | Pinstripe | common |  |
| g_polka | polka | Polka Dots | rare |  |
| g_zigzag | zigzag | Zig Zag | rare |  |
| g_camo | camo | Camo | epic |  |
| g_gradient | gradient | Fade | epic |  |
| g_tigerst | tigerstripe | Tiger Stripes | legendary |  |
| g_web | web | Web | legendary |  |

#### slot `tattoo` (10)

| id | v (render value) | name | rarity | free |
|---|---|---|---|---|
| t_none | none | None | common | yes |
| t_sleeve | sleeve | Sleeve | rare |  |
| t_chest | chest | Chest Piece | rare |  |
| t_full | full | Full Body Ink | epic |  |
| t_tribalink | tribalink | Tribal Ink | legendary |  |
| t_neck | neck | Neck Ink | common |  |
| t_barbwire | barbwire | Barbed Wire | rare |  |
| t_leg | leg | Leg Piece | rare |  |
| t_back | back | Shoulder Piece | epic |  |
| t_kanji | kanji | Kanji Chest | legendary |  |

#### slot `aura` (11)

| id | v (render value) | name | rarity | free |
|---|---|---|---|---|
| au_none | none | No Aura | common | yes |
| au_spark | spark | Sparks | rare |  |
| au_smoke | smoke | Smoke | rare |  |
| au_flame | flame | Flame Aura | epic |  |
| au_storm | storm | Storm Aura | legendary |  |
| au_halo | halo | Golden Halo | legendary |  |
| au_ice | ice | Frost Aura | rare |  |
| au_neon | neon | Neon Frame | rare |  |
| au_void | void | Void Shroud | epic |  |
| au_pyro | pyro | Ringside Pyro | legendary |  |
| au_gilded | gilded | Gilded Aura | legendary |  |

### Renderer-handled values per slot (grep of `L.<slot>==='…'` in both renderers; identical sets)
- hairStyle: all 24 catalogue values handled (bald = no branch, `hs!=='bald'`). `swoop` NOT handled (see §0.3).
- face: all handled. mask: all 14 non-none handled. tattoo: all 9 non-none handled.
- attire: `armor chaps crop duster gi harness hoodie ref robe sash singlet tank vest` have branches; `trunks,
  tights, shorts, bodysuit` are handled through the tables `FULLTIGHTS={tights,singlet,bodysuit,armor,gi}`,
  `BARECHEST={trunks,shorts,harness,sash,chaps,bodypaint}`, `SLEEVED={jacket,duster,gi,robe,hoodie}` (~4791). `jacket` via SLEEVED.
- boots: branches for `barefoot combat cowboy goldboot hightop pads platform spiked steel wraps`; height from
  `BOOTTOP={tall:70,goldboot:70,spiked:69,pads:72,platform:68,wraps:74,combat:71,cowboy:70,hightop:75,steel:72}`
  (~4888 / 5365); `short`/`sneak` fall to the default top 77.
- acc: all 21 non-none handled (`knee` is the value of `x_kneepads`).
- pattern: all 16 non-solid handled.
- aura: bespoke `halo pyro ice void neon`; `spark smoke flame storm gilded` = generic sparkle, palette only (§0.4).

## 2. Storage

### Save
- Keys: `rtr_baw_v1` (slot 0), `rtr_baw_v1_s1/_s2/_s3`; active slot `rtr_baw_slot` (~2304). Backup `<key>_prev`.
  `SCHEMA=1`; `load()` rejects other schemas, `migrate(o)` (~4472) is the only migration hook.
- `G.w.look` = the look object (shape = DEFLOOK keys + optional `beltCarry`). Written by `finishCreate` (~6087,
  `look:Object.assign({},CREATE.look)`), `setLook`, `randomizeLook`.
- `G.bag` = `{coins, lifetime, owned:{[cosmeticId]:true}, shards, packs:{[packId]:n}, epoch, pity, streak, daily, pass}`.
- Hall of Fame list `rtr_baw_legends_v1` (`archiveToLegends` ~14636) stores NO look (only names/stats/keepsakes).
- Device setting `rtr_gfx` = `'smooth'|'retro'` (not in the save).
- No server table for cosmetics or looks (comments at ~3955 and ~4062 say the career game has no account layer).

### How non-player wrestlers get a look
| who | source | stored? |
|---|---|---|
| 43 authored `RTR_CHARS` (world.js) | hand-written `look:L(skin,hair,gear,trim,{…})` via `L()` helper (world.js L44) | static file |
| Rookies (`spawnRookie` ~6237, id `r_<name>_<n>`) | `oppLook(id,name)` | in memory only (CHARS.push) |
| Hall-legend manager keepsake (~6128) | `oppLook('legend_<name>', name)` | in memory |
| Unknown opponents / tour (`tour_<id>`) / partners / extras | `oppLook` via `extraLookFor` (~9795) | no |
| Home-page filler cast (`homeRing` ~7553) | `oppLook('h'+i,'x')` | no |
| Referee | `REF_LOOK` (~9418), attire `ref` | constant |
| 5 pundits (`PUNDITS` ~19800) | hand-written partial looks | constant |
| OG/link-card champion | `HERO_LOOK` in build-logo.mjs L31 | build script |

`oppLook(id,name)` (~8953): FNV-ish hash of `id||name`, LCG `nx(n)`; picks skin/hair/gear/trim from PAL, then
hairStyle, face, attire, boots, acc, pattern from `COSM.filter(slot).map(v)` **in catalogue order**, build from
3, mask 1-in-4 from `lucha|half|hood`. Never rolls tattoo or aura.

Authored world.js value usage: hairStyle `long mullet short pony topknot buzz mohawk swoop spiky bald`; face
`beard goatee stache warrior skull tribal none`; attire `trunks tank singlet tights duster jacket`; boots
`tall sneak short pads`; acc `elbow wrist shades cape chain belt`; pattern `stripe split stars gold flame solid`;
mask `lucha demon`; build `heavy lean`.

## 3. Rendering

### Shared rig
- `JOINT` (~4692): `shL[18,31] shR[46,31] elL[17,43] elR[47,43] hipL[27,53] hipR[37,53] knL[27,68] knR[37,68]
  neck[32,26] pelvis[32,52] root[32,50]`. Figure space ~64 units wide, head top ~y4, feet ~y87.
- `POSES` (~4699), 43 poses, each a bag of angles (`shL elL shR elR hipL knL hipR knR torso head body:[dx,dy,rot]`):
  `stand ready run runBack grapple lockup strike wind chop clothes kick bigboot stomp lift carry press held vert
  prone proneUp splash dive climb kneel bridge pin submit taunt celebrate point stagger reel guard corner whip
  ropes raised refIdle refWatch refUp refDown refNo refRaise`. `poseOf(n)` falls back to stand.
  `HURT={reel,prone,proneUp,stagger,held,vert,submit,bridge}` squeezes eyes shut (~5114 / 5293).
- Bones/buckets: `B={back,thighL,shinL,thighR,shinR,torso,upArmL,loArmL,upArmR,loArmR,head}`; assembly
  `rig(M)` nests leg (hip->knee) and upper (pelvis torso -> arms, neck head) with `rotate()` transforms.
- viewBoxes: default `-6 -8 76 104`; `frame:'head'` `17 -7 30 36`; `frame:'legs'` `14 40 36 50`;
  wide (`frame:'action'` or |body rot|>=40) `-24 -14 112 118`.
- Options: `opt.pose`, `opt.frame`, `opt.title`, `opt.belt={art,carry}`.
- Dispatcher `wrestlerSVG(L,opt)` (4784) -> smooth or retro by `gfxSmooth()`.

### Retro `wrestlerSVGRetro` (4785-~5190)
- Pure `<rect>`s, `shape-rendering="crispEdges"`, 1 unit = 1 pixel (no explicit grid size; ~64×90 figure).
- `P(x,y,w,h,f)` (4666) one rect; `LIMB(x,y,w,h,c)` (4670) rect + 1px left highlight (+24) + right shadow (-34)
  + bottom shadow (-24); `shade(hex,amt)` (4667); `OL()` outline box; `PIECE(boxes,col,o)` stacks boxes into one
  silhouette; `HEAD(c)` cranium+jaw.
- Outline pass: every rect filled `OUTLINE='#120f0f'` (4518) is split into `OUTB`, the rest `FILB`, and the rig is
  emitted twice (`rig(OUTB)+rig(FILB)`) so one continuous border surrounds the posed silhouette (~5160).
- Palette: look colours + derived shades; fixed accents `#e0b341` (gold), `#C6392C`, `#F4E8DB`, `#1a1a1a`, etc.

### Smooth `wrestlerSVGSmooth` (5226-5754)
- Same JOINT/POSES/rig; local shadowed `P`/`LIMB` (5252/5257) draw rounded, gradient rects so the ~150 long-tail
  gear items keep placement. `GR(c)` = per-figure cylindrical gradient id `wf<N>g<k>` (counter `WSN`).
  Hand-drawn paths for body (TUBE), head, common hair, beards, lucha/half/hood masks, boots, trunks.
- `FIG_INK='rgba(20,10,6,.30)'` inner line on every fill; the OUTLINE pass is built then dropped (no black border).
- Back-hair layer `HB` injected via `'@@HB@@'` placeholder under neck/face (5554).
- Output `<svg … class="figsm">` with `<defs>` gradients; same viewBoxes.

### `rtr_gfx` toggle
`gfxSmooth()` (4774) reads `localStorage.rtr_gfx !== 'retro'` (default smooth); `setGfx(smooth)` writes it and
toggles `html.gfx-retro`, which sets CSS `--pxr:pixelated` (CSS L48-50; default `auto`). A switch reloads the page.

### Icons
- `PICO` (4533) 16×16 crispEdges rect icons (34): `trophy crown fire medal swap shield knife cross graphUp
  graphDown mask dice star starBig money dumbbell bed handshake microphone pen tape clipboard check ticket dove
  swords bandage fist impact spin lock bird brain chair` (+ `_wrap` helper).
- `PICO_SM` (4584) smooth versions of the same ids. `pico(id,size)` (4656). `CAT_PICO` maps move categories.
  `SCREEN_ICO` (7187) screen-header icons via CSS var.

### Belts
- `BELT_CONFIG` (2469) 9 promos × world/secondary/tag = 24 named belts; `BELT_PLATE` (2495) six 11×9 masks
  `round shield star block oval diamond` (chars `. M D G H`); `BELT_ART` (2554) per belt `{shape,metal,gem,strap}`;
  `BELT_ART_DEFAULT`; `beltArtFor(name)` (2597). Functions: `beltPlate` (2618), `beltOnFigure(art,carry)` (2644),
  `beltSVG(art,size)` (2680), `beltPlateSmooth` (2700), `beltOnFigureSmooth` (2733), `beltSVGSmooth` (~2761).
  Belt on figure is hooked at `opt.belt` (retro ~5037, smooth ~5547). Separate from the `acc:'belt'` cosmetic
  ("Title Belt", legendary), which draws a generic gold belt.

### Venues / crowd
- `ARENA_DEF` (~7245) per promo: `mat, apron, pad, rope, glow, seats(2/3/4/6), dens, dim, tone[], wall, trim`;
  `arenaOf(pid)`. `venueCSS(T)` (~7290) builds the crowd as stacked radial-gradient decks (soft blobs in smooth,
  hard dots in retro). `venueRng(seed)`, `venueHTML(T,pid)` (7334): truss/pipe, cans, beams, camera flashes,
  screen vs banner (`seats>=4`), `ringDressHTML`, `dressArena(root,pid)`, `cageSVG(front)`.

### RPK pixel kit (15176 `RPK BEGIN` … 15380 `RPK END`)
IIFE `RPK` with palettes `K RED DROP GOLD CREAM ROPE PAD POST MAT APRON GEM SPARK`, `grid/outline/stamp`, 5×7
font `F`, `text/textW/norm/star/plate/lockup/icon(N)/arena(w,h,o)/toCanvas/draw/fromCanvas`. Lifted by marker
from `logo-source.html` and `og-source.html` (built by `build-logo.mjs`); `paintBrand()` (15384) paints
`canvas[data-rpk]`; `drawShareCard(cv)` (15424) 140×200 grid at 8× with a head-and-shoulders crop of
`wrestlerSVGRetro` (viewBox rewritten to `8 -5 50 44`). verify.mjs 4q compares built PNGs to the kit cell-for-cell.

## 4. Sold / unlocked cosmetics
- **Merch Stand** (`renderShop` 14830; screen `#shop`): packs (3), every locked item by slot at `RAR[rarity].price`
  (`buyItem` ~14985) or forge with shards (`craftItem` ~15057). `openPack` (~15025) draws from
  `COSM.filter(not owned)`, rarity floor/boost/pity; dupes become shards; every pack +2 shards.
- **Ropes Pass** (~4062): 60-day season, 50 tiers, free and PRO lanes (PRO = 25,000 coins). Cosmetic rewards by id:
  FREE tier 25 `a_jacket`; PRO tier 20 `m_demon`, PRO tier 50 `h_flames` (+5000c). Other tiers: coins/shards/packs.
- Streak track gives packs `p_base` (day 4) / `p_elite` (day 7). No other cosmetic grants found (grep `cos:'`,
  `owned[`).
- Free at start: `owned:true` items (21, marked "free" in the §1 table). Create screen and Locker both use `ownedOnly=false`
  (locked shown, not selectable).
- Ownership: `G.bag.owned[id]` per save slot, localStorage; `migrate()` keeps owned/shards across the coin rebase.
- **Ids that must be preserved or mapped**: all 148 ids (ownership keys) and all `v` values (saved looks), plus
  `p_base p_elite p_legend` (pack inventory keys `G.bag.packs`), Pass reward ids `a_jacket m_demon h_flames`,
  and renderer-only values `swoop ref bodypaint none solid` and `beltCarry`/`build` enums. Also verify.mjs
  section "two styles, one rig" iterates `COSM` per slot and `BELT_PLATE` shapes, and the hair-back check names
  `pony mullet dreads`.

## 5. Real names and likeness
- `roster.js`: 286 workers under legal names across 8 fictional promotions (Colossus 102, Vanguard 68, Crossfire
  28, Rising Sun 24, Lucha Suprema 19, Sakura Joshi 19, Starlight Joshi 15, Pure Circuit 11). Keys: id, name,
  promotion, tier, align, ratings, age, salary. **No look fields.** Booking sim only, which draws no figures.
- `personalities.js`: 30 (13 free agents, 13 retired legends e.g. Steve Austin, Dwayne Johnson, Mark Calaway,
  4 managers e.g. Paul Heyman). No looks. Booking sim only.
- `legends.js`: 66 mentors (`RTR_LEGENDS`) under legal names, 6 eras. No looks; rendered as text cards only.
- `world.js` 43 career characters are fictional; looks hand-written.
- **Cosmetics that evoke a real performer's signature gear (flag for the redesign)**:
  - `m_tiger` "Tiger Mask": the NAME is a trademarked character (Tiger Mask, NJPW/manga); also not on the
    verify.mjs blocklist. Highest concern.
  - `m_demon` "Demon Mask" (+ La Señora Muerte's authored demon mask/duster/chain): Bálor "Demon" association;
    it is also a Pass reward id.
  - `f_mist` "Green Mist": Great Muta / Tajiri signature spot.
  - `m_crow` "Carrion Mask": crow face/hair evokes Sting (Steve Borden is in personalities.js).
  - `f_warrior` "War Paint", `f_tribal`, `f_venom`, `f_skull`, `f_halfpaint` face paints: Ultimate Warrior /
    Sting-style paint; check final designs are not a specific pattern.
  - `h_flames` "Flame Mane", `m_hood` "Executioner Hood", `a_duster`, `x_feather` "Feather Headdress"
    (cultural-appropriation rather than likeness), `t_kanji` "Kanji Chest", `m_samurai`, `f_bloodied` "Crimson Mask"
    (generic term). Generic, but worth a deliberate look.
  - build-logo.mjs `HERO_LOOK` (slick hair, full beard, red trunks with stripe, heavy) is generic.

## 6. Where a figure is drawn (call site, function, container and size)
| line | function | screen | frame/pose | container size |
|---|---|---|---|---|
| 4161 | checkRecruit | recruit card | full | 80px wide |
| 6007-6054 | renderLookEditor | Create (`#cAvWrap`, `.avwrap.big`) and Locker (`#lockAv`) preview + tiles | full/head/legs; belt previews | avwrap max-h 330/400px; tiles `.tpf` 76px tall (head 74) |
| 6856 | paintProfile | sidebar profile chip `.pf-av` | head | 28×28 circle |
| 7565 | homeRing | home ring `.hr-fig` | HOME_CARDS poses | 150px wide |
| 7600 | renderHome | save-slot card `.rc-fig` | full | 62px |
| 7740 | renderCareer | career avatar `#carAv` (.avwrap) | full + belt | ≤330px tall |
| 7846/7868 | renderStoryPanel | story chips `.cav`, storycard | head | 56-58px / 52px |
| 9469 | poseSet | live match `.fighter` (me/opp/ref/extras) | any pose, frame action, belt | 250px (176 mobile, 196 inmatch, 210 promo) |
| 10774 | startFight | scoreboard portraits `.fpt` | head | 52×52 (opp mirrored) |
| 13413 | bookPoster | match poster `.bkp-fig` | ready | 140px (112 mobile) |
| 13431 | resultHero | result stage `.mh-fig` | celebrate/kneel/stagger | 150px (196 ≥900px) |
| 15004 | revealPack | pack reveal `.rv-art` | slot frame | 140px tall |
| 15096 | openDossier | dossier `.dos-fig` | full | 80×100 |
| 15154 | drawCard | trading card `.pcfig` | full | fills card height |
| 15424 | drawShareCard | share PNG (canvas) | retro, crop | 50×44 cells at 8× |
| 17510/17542 | renderCrew | crew cards `.cc-av` | head | 42px |
| 17937/17956 | renderWorld | world char cards `.cav` | head | 56px |
| 18062/18119 | renderBackstage, backstageOpen | `.bs-av`, `.bs-menu-av` | head | 54 / 56px |
| 19956 | punditPortrait | pundit set | head | set-specific |
| 20084/20208 | playScene, playSegment | `.scene-av` | head | 78×78 |
| 20326 | charProfile | character profile | full | 110px |
| 20553 | renderHof | Hall of Fame `.avwrap` | full | ≤330px |
| build-logo.mjs L44 | og/link card | taunt + belt | retro |

## 7. Other notes for the migration
- verify.mjs guards that will need updating: "two styles, one rig" (L1209-1320: identical transform order across
  styles for all poses, every slot value draws in two poses without NaN, hair-back layer order, gradient id
  uniqueness, PICO_SM covers PICO, every BELT_PLATE draws smooth, trunks cover crotch, retro toggle), "every belt
  has its own design" (L865), "the pixel brand draws" (L1329), brand files 2b (L81), coin economy catalogue price
  sum (L727).
- `--pxr` is used by ~15 CSS rules for `image-rendering`.

# Appendix C: design inventory

Files: `wrestling/index.html` (20,627 lines; one `<style>` block lines 31-1823, markup 1824-2293, main script 2298-20625, plus `moves.js`, `legends.js`, `cosmetics.js`, `world.js`), and `wrestling/booking/index.html` (2,176 lines; `<style>` 30-212).
All line numbers below are `wrestling/index.html` unless marked BOOKING.
Counts were produced by regex over the CSS block (CSS), the static markup (HTML) and the script (JS). JS colour counts are dominated by sprite art (wrestler, belt, icon palettes), so they are reported separately from UI colours.

---

## 1. Fonts

| | where | used |
|---|---|---|
| Google Fonts link | line 30: `Anton`, `Barlow Semi Condensed` 500-900, `Cinzel` 600-800, `display=swap` | |
| `--display` | `'Anton',Impact,'Arial Narrow',sans-serif` (line 38) | 96 `font-family` uses |
| `--body` | `'Barlow Semi Condensed',system-ui,...` (line 40) | 7 explicit uses (inherited from `body`) |
| `--mono` | `ui-monospace,'SF Mono',Menlo,Consolas,monospace` (line 41); **smooth mode repoints it to Barlow** (line 57) | 74 uses |
| `--serif` | `'Cinzel',...` (line 39) | **0 uses in the career page.** Cinzel is downloaded for nothing (3 weights). Booking uses it once (`.title-card .tname`). |
| `Georgia,serif` hardcoded | `.scene-line` 461, `.scene-outcome-line` 496, `.sb-quote` 1150 | 3, bypasses tokens |
| `var(--sans)` | `.sbrow-arrow` line 1158 | **undefined token**, falls back to inherited font |
| SVG text | line 19969 `font-family="ui-monospace,monospace"` (LIVE bug in media portrait) | 1 |
| Canvas | brand title/icons are pixel art (RPK kit, `paintBrand()` line 15384), not font text | |

No `@font-face` blocks. Anton is a single 400 weight, but 6 rules set `font-weight:800` on `--display` text (`.scene-ident`, `.media-name`, `.scene-continue button`, `.hl-l`, `.arc-k`, `.sr-grade`): browser faux-bold.

## 2. Tokens (`:root`, lines 32-49)

```
--cream #F4E8DB   --oncard #F4E8DB   --ink #0c0b0b
--brandred #C6392C   --brandred-bright #e05446
--gold #e0b341  --green #5bb083  --blue #6aa7c4  --purple #b08ac6
--text #F2EADD  --text-dim #cabda8  --text-faint #9b917f
--panel rgba(255,255,255,.045)  --panel-raised rgba(255,255,255,.075)
--line rgba(244,232,219,.13)
--display / --serif / --body / --mono (above)
--pagebg  two red radial glows + #151113 -> #0c0b0b gradient
--bg #0c0b0b
--pxr auto   (html.gfx-retro: pixelated, line 50)
```
Usage in CSS: `--gold` 135, `--cream` 134, `--line` 107, `--text-faint` 87, `--text-dim` 82, `--brandred` 46, `--panel` 39, `--text` 26, `--green` 21, `--brandred-bright` 8, `--blue` 2.
**Defined and never used:** `--purple`, `--oncard`, `--ink`, `--panel-raised`, `--serif`. **Used and never defined:** `--sans`.
Local per-component custom props: `--vc --vg --va --vb --vd` (venue), `--a0 --a1` (banner), `--pcf --pcfg` (player card), `--arGlow`, `--h2ico`, `--px --py --dx --dy --mx --cr --pp --pg` (FX).

Missing tokens that the CSS clearly wants: a "bad/heel" red (`#f0907f`, 26 CSS + 37 JS literal uses), a dark surface (`#171313`/`#1a1512`/`#0b0909`...), a gold gradient (`#f2d27a -> #c69a2c` repeated), radii, spacing, type scale, shadows.

## 3. Colour

**CSS: 281 distinct colour literals, 688 occurrences. HTML: 4. JS: 352 distinct, 1,373 occurrences** (mostly sprite palettes; UI inline-style colours are mixed in).

Top CSS literals: `#f0907f` 26 · `rgba(224,179,65,.5)` 15 · `rgba(255,255,255,.06)` 15 · `rgba(0,0,0,.55)` 13 · `rgba(224,179,65,.55)` 13 · `rgba(224,179,65,.10)` 12 · `rgba(0,0,0,.6)` 12 · `#fff` 11 · `rgba(0,0,0,.5)` 11 · `rgba(0,0,0,.28)` 11 · `#000` 11 · `rgba(224,179,65,.6)` 10 · `rgba(0,0,0,.2)` 9 · `rgba(198,57,44,.16)` 8 · `rgba(224,179,65,.08)` 8 · `rgba(198,57,44,.55)` 8 · `#f6d97a` 8 · `rgba(224,179,65,.45)` 7 · `rgba(0,0,0,.25)` 7 · `#c6392c` 6 (brandred re-typed) · `rgba(0,0,0,.18)` 6 · `rgba(224,179,65,.35)` 6 · `rgba(255,255,255,.05/.02)` 6 each · `rgba(0,0,0,.24)` 6 · `#f4e8db` 5 (cream re-typed) · `#e0b341` 5 (gold re-typed) · `rgba(244,232,219,.05)` 5 · `rgba(224,179,65,.11/.4)` 5 each · `#0b0909` 5 · `rgba(0,0,0,.75)` 5 · `#3b3437` 5 · `rgba(0,0,0,.8/.9)` 5 each · `#5bb083` 4 · `#6aa7c4` 4 · `#17130c` 4 · `#f2d27a` 4.

Top JS literals (UI + sprite): `#e0b341` 182 · `#c6392c` 102 · `#f4e8db` 73 · `#1a1a1a` 61 · `#c8ced4` 59 · `#f0907f` 37 · `#5bb083` 31 · `#8a8177` 28 · `#a37518` 25 · `#f4c95b` 23 ... The three brand tokens are typed out 357 times in JS instead of `var(--...)`.

**Alpha sprawl (CSS):** gold `rgba(224,179,65,a)` in **34 different alphas** (136 uses); black `rgba(0,0,0,a)` 30 alphas (122); white 28 alphas (72); brand red 25 alphas (58); cream 14 alphas (26).

**Near-grays (|r-g-b| <= 14), whole file: 101 distinct hexes.** Dark surfaces alone: `#0c0b0b #0b0909 #0e0b0b #0a0809 #0b0a0a #100c0d #100d0d #120f0f #140d0d #141011 #141113 #151113 #161113 #171112 #171113 #171313 #1a1416 #1a1512 #1a1516 #1b1414 #1c1416 #1d1a1a #1e1a1a #1e1e24` ... (about 30 "near-black" values for what is visually one or two surfaces). Modal/toast/tour card use `#171313`, booking modal `#1a1712`, `.bk-tag` `#1a1512`, `.fclock` `#0b0909`, botnav `#171112 -> #0b0909`.

Semantic colours used without tokens: heel/bad `#f0907f` (career) vs `#f08a76` (booking); face `#7dc4a4`, pass/pro purple `#cbaade`/`#cbb46a`, streak orange `#f0b060`, `#c0392b` (`.advice.bad`, a fourth red), `#e0685a` (opponent plate), `#5b9fd1` (player plate).

## 4. Type scale

CSS `font-size`: **53 distinct values.** Most used: 10px 40 · 11px 40 · 12px 37 · 9.5px 32 · 13px 29 · 12.5px 29 · 11.5px 27 · 10.5px 23 · 15px 19 · 14px 16 · 13.5px 14 · 9px 13 · 19px 11 · 16/17/20px 7 · 22px 6 · 24px 4 · 21px 4 · 26/28/23/30px 3 · 18px 3 · 38/25/54/34/44px 2 · plus 8px, 8.5px, 14.5px, 15.5px, 27px, 36px, 40px, 46px, 52px, 76px, 82px, 84px, 120px, 170px and 9 `clamp()` expressions.
Inline (JS/HTML templates): 18 more distinct (11px x14, 12px x7, 9px x5 ...), 448 `style="..."` attributes in the file.
Body sizes in the 12-13.5 band are split into 12 / 12.5 / 13 / 13.5 (four values doing one job); labels into 9 / 9.5 / 10 / 10.5 / 11 / 11.5.
`letter-spacing`: **29 distinct values** (.01em to .45em; .06em 21, .02em 19, .14em 18, .16em 15 ...).
**110 rules set text at 10.5px or smaller; 47 at 9.5px or smaller** (8px, 8.5px, 9px, 9.5px), most of them uppercase with wide tracking and `--text-faint`.

## 5. Spacing, radii, borders, shadows

- `padding`: **116 distinct values** (10px 12px 10, 11px 13px 8, 9px 11px 7, 12px 14px 7, 9px 12px 5, ... 1px 5px, 2px 7px, 3px 9px, 13px 15px, 16px 14px ...). Cards alone use 9/11, 10/12, 11/13, 12/14, 13/15, 14/16, 16.
- `margin`: 53 distinct. `gap`: 14 distinct (8px 30, 6px 25, 10px 23, 12px 18, 5px 14, 7px 12, 9px 6, 14px 4, 18, 3, 4, 2, 11, 6/12). No spacing scale.
- `border-radius`: **27 distinct** (12px 27, 999px 22, 8px 17, 10px 17, 3px 17, 50% 13, 9px 13, 14px 13, 4px 11, 11px 8, 16px 8, 6px 8, 1px 5, 99px 5, 2px 4, 7px 3, 13px 3, 0, 20px, 18px, 5px + 5 asymmetric). Cards are 9, 10, 11, 12, 13, 14, 16, 18, 20 depending on component. Pills use both `999px` and `99px`.
- `border`: 67 distinct declarations. Widths 1, 1.5, 2, 2.5, 3px (1px solid var(--line) 83, 1.5px solid var(--line) 12, 3px left accent strips on ~10 components). Dashed separators use 4 different white alphas (.06/.07/.08/.09) plus `var(--line)`.
- `box-shadow`: **53 distinct, nearly every one used once.** Only `0 4px 12px -6px rgba(0,0,0,.5)` (x3, banner chips) repeats. A shared "surface" shadow was retrofitted at line 1803 (`inset 0 1px 0 rgba(255,255,255,.055),0 12px 26px -20px rgba(0,0,0,.95)`) over 17 classes (`.card,.tile,.bizcard,.crewcard,.wk-alt,.goal,.promocard,.rankcard,.bs-room,.rooms,.slot,.movecard,.bkg,.pmmode,.hcard,.bksheet`) but not over `.opt`, `.chip`, `.decopt`, `.faccard`, `.storycard`, `.perkcard`, `.charcard`, `.passhead`, `.pr-lane`, `.dailypanel`, `.advice`, `.injcard` etc.
- `z-index`: 0-10 for in-arena layers, 30 topbar, 44 botnav, 45 sitebar, 100, 110 moment, 130 confetti, 150 card + tour, 200 scene (and toast). `${10-i}` dynamic.

## 6. Buttons (7+ treatments)

1. **Global `button`** (189-195): pill 999px, 1.5px `--brandred` border, faint gradient fill, cream text, 13px/800/uppercase/.06em, `transition:all .12s`; hover = solid red. Variants `.ghost` (line border, dim text), `.gold` (gold border/text, gold fill on hover), `.big` (13px 28px, 15px). `:disabled` opacity .35.
2. **Gold gradient CTA**: `.pcshare .pcs-go` (`#f2d27a -> #c69a2c`, dark text, no border), `.tapwin .tw-b` (3D pressed gold with `0 7px 0 #7a5c12` lip), `.navfab .nf-disc`.
3. **`.scene-continue button`** (499): a *different* gold gradient `#c9a24d -> #a6842f`, radius 8px (not pill), Anton faux-bold, .24em tracking.
4. **`.scene-walk button`**: text-only link button.
5. **`.pc-cta`** (1271): a span styled to look exactly like the global button (duplicated rules) inside `.pathcard`.
6. **Tab/chip buttons with their own recipes:** `.gfxseg button` (segmented, red when on), `.sb-nav button` (28px pill, gold when on), `.botnav button` (icon over label), `.subnav button` (radius 8px, transparent, gold on), `.navrow button`, `.pgr-c`/`.pgr-a` (radius 9px), `.rulechip` (8 `!important`s to undo the global button), `.tabrow .tab` (red on), `.navhelp` (`!important` gold).
7. **Shrunken overrides:** `.bk-quickrow button` 11px 6/8, `.wk-extras-toggle button`, `.pr-lane button` 11px 5/10, `.tourcard .trow button`, `.advice .ad-b`, plus inline `style="padding:4px 10px;font-size:11px"` repeated in JS templates (e.g. line 14775) and on the home "Promotion Booking Sim" link (line ~1881).
Selected state is expressed three ways: red border + red inset ring (`.opt.sel`, `.tile-opt.on`), gold border + gold tint (`.chip.on`, `.slot.active`, `.subnav .on`, `.rulechip.on`), red tint (`.step.on`, `.tabrow .tab.on`, `.pgr-c.on`). Hover borders also alternate between red (`.opt`, `.bkg`, `.charcard`, `.decopt`, `.tile-opt`) and gold (`.wk-alt`, `.slot`, `.bs-opt`, `.scene-opt`, `.chip`).

Booking page button is a fourth palette entirely: base border is `--gold` which is **aliased to red** (BOOKING line 35 `--gold:#C6392C`), text `--gold-bright` which is **cream**, hover fills red with near-black text; adds `.danger`.

## 7. Cards / panels

~45 surface classes, each re-specifying background, border, radius and padding:
`.card` (panel, 1px line, 14px, 16px) · `.tile` (12px, 12/14) · `.opt` (1.5px, 12px, 14) · `.perkcard` (gold gradient, 12px) · `.movecard` (3px left strip, 10px) · `.tile-opt` · `.faccard` (white gradient, 1.5px, 14px) · `.storycard` (red gradient, red border) · `.inbox-item` (black .25, 3px left strip, 9px) · `.promocard` · `.titlebelt` (9px) · `.rankcard` (10px) · `.bs-ppvcard` (9px) · `.brewrow` (2px left strip, 6px) · `.slot` (9px) · `.bs-budget` · `.bs-room` · `.scenecard` (brown gradient `#1a140b`, gold border) · `.charcard` (black .28) · `.flog` · `.fdec` · `.decopt` · `.bizcard` (11px) · `.injcard` (red) · `.wk-alt` (11px) · `.bksheet` (gold, 14px) · `.ppvcard` · `.arc` (3px left strip) · `.pathcard` · `.crewcard` (13px) · `.pmmode` · `.chip` (11px) · `.cutcard` (gold/red) · `.pmpreview` (dashed) · `.advice` (4 states) · `.bkg` (13px) · `.goal` (11px) · `.passhead` · `.passpro` (purple) · `.pr-lane` · `.dailypanel` · `.unlockcard` (green) · `.momentcard` (18px) · `.tourcard` · `.tourgoal` · `.resumecard` (16px) · `.hcard` · `.modal` (`#171313`, red border, 16px) · `.rulecall`.
Left-accent-strip cards alone use 2px, 3px, `border-left` with `border-radius:0 6px 6px 0`, `0 9px 9px 0`, `0 10px 10px 0`.

## 8. Navigation chrome

- **Site bar** `.sitebar` (#sitebar, lines 99-130, markup 1830): fixed, `rgba(14,11,11,.9)` + blur, contains `.sb-home` ("RunThe.GG" back link, hard `href="https://runthe.gg"` absolute), `.sb-mark` (16px pixel icon canvas + "RUN THE ROPES" in Anton, `onclick="go('home')"` on a div), `.sb-coin` wallet pill, `.sb-prof` avatar pill (`max-width:40vw`). Second row `.sb-nav` = the **header rail**: 5 group pills (28px tall, 9.5px mono labels; labels hidden < 520px), desktop only (>= 761px) since line 1810.
- **Number strip** `#topbar .topbar` (75-83, markup 1846): cream gradient band with 3px red bottom border, sticky under the site bar, 5 HUD cells (Yr·Wk, Age, OVR, Pop, Where), labels 9px `#94764a` on cream, values 16px. Hidden on home/create/start.
- **Tab bar** `#botnav nav.botnav` (151-176, markup 2266): phone only (<= 760px). 5 groups split around a raised gold `.navfab` disc for the Ropes Pass (48px disc, -13px lift). Icons via `pico(NAV_ICON[...],21)` (`hub:star, skills:dumbbell, gear:mask, roster:swords, legacy:trophy`). Red `.navdot` badges (hub dailies, pass tiers). 9.5px uppercase labels.
- **In-screen sub-nav** `.subnav` (navHTML ~6789): sibling tabs per group + "? Help". Scrollbars hidden; no scroll affordance.
- **`.pgr` pager**: `‹ chips › n/N`, the only aria-labelled controls on the page.
- **`body.inmatch`** (919-929, toggled in `go()` line 7165 for `fight` and `promo`): hides `.sb-nav`, `#topbar`, `#botnav`; arena grows to 420px (phone `clamp(250px,42vh,360px)`), fighter 196px.
- **Booking** has its own chrome: cream `.masthead` (h1 30px, HUD) + sticky `.tabs` underline bar at `top:57px` (hard-coded masthead height), no site bar, no tab bar, no theme/gfx toggle UI, no link back to runthe.gg in the chrome.
- **No `<footer>`** on either page. `<nav>` is used only for the tab bar.

## 9. Icon systems

- `PICO` (line 4533, 34 ids + `_wrap`): 16x16 pixel icons, `shape-rendering="crispEdges"`. `PICO_SM` (4584, 34 ids): smooth vector versions built from `ICO_S/ICO_L/ICO_F` helpers. `pico(id,size)` (4656) picks by `gfxSmooth()`. Ids: trophy crown fire medal swap shield knife cross graphUp graphDown mask dice star starBig money dumbbell bed handshake microphone pen tape clipboard check ticket dove swords bandage fist impact spin lock bird brain chair. `CAT_PICO` maps move categories. **`pico()` returns `''` for an unknown id**, while its header comment (4531) says it "falls back to the emoji": an unknown id renders nothing.
- `NAV_ICON` (tab bar), `SCREEN_ICO` (headers, below).
- Belt plates `beltPlate` (2618) / `beltPlateSmooth` (2700); `.beltico`, `.beltchip`.
- Inline one-off SVGs in markup (path cards, coin, arrows).
- **Emoji / glyphs in UI strings** despite the stated "no stock emoji" rule: 🔒 (lock badge on locked cosmetics, line 6048; locked moves 14774), 🍽 Catering room icon (18030), and Unicode symbol glyphs as icons: ✎ ♛ ♜ ✱ ▤ ▶ ★ (backstage rooms 18029-18036, rendered in `.bs-room-ico`), ♪ (entrance theme 9351), ✔ (owned move 14773), ✓ (`.chip.on::before` 1367 and 4 template strings), ✕ (card close 2268), ● (log opener 904), • default inbox icon (7881-8364), ‹ › pager, → (45, CTA arrows), ← (3), ★ (12, star ratings). `.momentcard .mo-i` and `.inbox-item .ico` accept either emoji text or SVG (3552). These glyphs fall to the OS font, so they change look per platform and ignore Smooth/Retro.

## 10. Motion

- **52 `@keyframes`** (lines): pcIn 314, pkShake 347, rvIn 349, rvB 358, caretBlink 465, moreBob 486, sceneIdentFlash 501, critPulse 534, shk 601, vsweep 626, vflash 629, vsheen 640, hangsway 679, bob 752, ringA 761, sparkA 763, dustA 765, spdA 767, mwA 770, burstA 772, dmgA 774, callA 789, pinB 796, crowdBuzz 801, beltA 805, slapA 808, pinA 809, bkpL 824, bkpV 827, mhUp 854, mhStamp 862, mhConf 868, powA 877, pyroA 887, flashA 890, logA 898, decA 907, sheetIn 953, ppvPulse 1040, logoFloat 1185, btnGlow 1216, starIn 1505, sheen 1521, bannerIn 1522, chipIn 1535, confF 1551, momentIn 1560, statPop 1561, feudPulse 1575, arrUp 1640, arrDown 1641, scrIn 1795, blkIn 1800. (`bkpR` and `pinb` referenced via shared names.)
- Infinite loops: pkShake, caretBlink, moreBob, critPulse, vsweep, vflash, vsheen, hangsway, bob, crowdBuzz, ppvPulse, **logoFloat (home title, forever)**, **btnGlow (start CTA, animates box-shadow = repaint every frame)**, arrUp/arrDown.
- Transitions: 41 distinct declarations; durations .05 .07 .08 .1 .12 .13 .14 .15 .16 .18 .25 .28 .3 .32 .35 .38 .4 .45 .5 .6 .62 .7 .8 .9s; easings: default, `ease`, `ease-out`, `linear`, and 7 different cubic-beziers (`.2,.8,.3,1` `.3,.9,.3,1` `.2,1,.3,1` `.3,1,.4,1` `.2,.9,.25,1` `.3,.7,.3,1` `.2,1.3/1.4/1.5/1.6,.4,1` overshoots). Bare `transition:.12s`/`.14s`/`all .12s` (13 rules) transition every property including layout. `width` is animated on 11 bars (layout, not compositor).
- Screen entrance: `.screen.active` `scrIn` .28s + first six children `blkIn` .42s staggered by `!important` delays (1795-1801), excluding `#s-fight`/`#s-promo`.

### prefers-reduced-motion
CSS: four blocks only: venue beams/flashes/tron sheen (663), booking poster (834), match headline confetti/stamp (871), screen entrance (1801). JS: two `matchMedia` checks (9363, 19996).
**Not covered:** arena `shk` screen shake, `flash` white full-arena flash (flashA .85 opacity), `critPulse`, `crowdBuzz`, `pyroA`, `confF` confetti (z 130), `logoFloat`, `btnGlow`, `pkShake`, `hangsway`, `moreBob`, `arrUp/Down`, `ppvPulse`, `feudPulse`, all hover lifts, the 3D card flip, `.pcard` .62s transform. Booking page has no reduced-motion handling at all (and few animations).

## 11. Breakpoints

`@media` max-width: **430, 520, 640, 720, 760, 860**; min-width: **761, 900**; container query `@container (max-width:560px)` on `.arena,.homering` (611, 654). 640 is the workhorse (15 blocks). Desktop/phone rail split at 760/761. 860 handles hub column order and nav scrolling; 900 enlarges the match headline. Booking uses only 640.

## 12. Smooth vs Retro (`html.gfx-retro`)

Set at boot from `rtr_gfx` (4781-4783; booking reads the same key in a head script). Differences:
- `--pxr`: `auto` vs `pixelated` (line 50), applied via `image-rendering:var(--pxr)` on 14 rules (sprites, avatars, icons, header icon).
- `--mono`: Barlow + `tabular-nums` page-wide in smooth (57-58); real system monospace in retro.
- Venue rig retro overrides (659-662): beams unblurred hard-banded, flashes square, can glows off, mat pool hard-edged; `.pow` hard rings (878).
- JS: `wrestlerSVGSmooth` vs `wrestlerSVGRetro` (4784-5226), `PICO_SM` vs `PICO`, `beltPlateSmooth` vs `beltPlate`, pundit sets/crowd per CLAUDE.md.
- **Not switched:** the home logo, site-bar mark and favicons are pixel art in both modes (`.homelogo`/`.sbm-mark` hard-code `image-rendering:pixelated`), the emoji/symbol glyphs, and all chrome (radii, gradients, shadows) are identical in both, so Retro is "pixel sprites inside a smooth app".
- The toggle UI is `.gfxrow/.gfxseg` (60-64), a 32px segmented pill on the home screen only.

## 13. venueHTML() lighting rig (7334)

Seeded by promotion id (`venueRng`, FNV + xorshift) so a building is stable. `n = T.seats` (2 indie, 3 regional, 4 national, 6 global) drives: beams 2/3/4/6, cans 2/4/6/8, camera flashes 3/8/14/22. Output inside `.venue` (inserted after `.crowd`/`.hr-crowd` by `dressArena`):
- `.v-truss` (or `.pipe` for indies): CSS-hatched truss.
- `.v-can` lamps, alternating warm `#fff1dc` and the arena pad colour.
- `.v-beam` conic washes, `vsweep` rotate between `--va/--vb` over `--vd` 7-13s with random negative delays; indies get two `.still` warm washes.
- `.v-flash` 3px dots blinking (`vflash`, 3.5-10.5s).
- Money buys a screen: `n >= 4` `.v-tron` (16:7 screen, promo short name, scanline + `vsheen`), else `.v-banner` on two ropes in apron colours.
`ringDressHTML` adds `.v-pool` (mat light) and `.v-apron` lettering inside `.ringback` (full name, short name under a 560px container). `dressArena` also restyles the crowd height by seats and sets `--arGlow`. Uses `color-mix()` (no fallback for older Safari < 16.2: beams become transparent there) and `mix-blend-mode:screen` + `filter:blur(6px)` on every beam (GPU cost with 6 beams + 22 flashes).

## 14. decorateHeader / SCREEN_ICO (7187-7194)

`SCREEN_ICO = {career:starBig, moves:fist, train:dumbbell, mentors:brain, locker:mask, shop:money, pass:ticket, crew:handshake, deal:pen, world:swords, backstage:microphone, record:trophy, hof:crown, start:star, create:mask}`. `decorateHeader` renders `pico(id,64)` to an SVG data URI and sets `--h2ico` on the screen's direct `h2`, painted by `.screen > h2::after` (1789) at 84px (64px on phone), rotated -8deg. Header itself (1773-1795): 92px min-height card, 16px radius, red/gold radial lights, inset 4px red left edge, three faux ropes `::before` masked off the right edge, title `clamp(28px,6.4vw,40px)`.
Missing from the map: `home` (no h2), `fight`, `match`, `promo` (fall back to `star` if they have an h2). Icon is in smooth or retro style depending on mode at first decoration only (`h._ico===s` cache means a later mode switch keeps the old icon until the page reloads; the toggle reloads anyway).

## 15. Screens (via `go()`, line 7156)

Static `.screen` divs: `s-home` 1860, `s-start` 1884, `s-create` 1968, `s-career` 2040 (Hub), `s-fight` 2061 (live match), `s-match` 2128, `s-moves` 2141 (Arsenal), `s-train` 2148, `s-mentors` 2155, `s-locker` 2162, `s-shop` 2178 (Merch Stand), `s-pass` 2185 (Ropes Pass), `s-crew` 2192 (Locker Room), `s-promo` 2199 (promo/mic segment), `s-deal` 2226 (Business), `s-world` 2233, `s-backstage` 2240, `s-record` 2247, `s-hof` 2254. 19 screens.
`go()` call frequency: career 18, start 5, home 4, deal 4, crew 3, train/shop/pass/match/hof/fight 2, promo/locker/create/backstage 1; others via `NAVG`/`goGroup`. Nav groups (`NAVG` ~6777): Hub[career] · Skills[moves, train, mentors] · Gear[locker, shop, pass, card*] · Roster[crew, backstage, world] · Career[deal, record]. (*`card` opens an overlay, not a screen.)
Overlays: `#modalBack .modal` 2272, `#sceneBack .scenecard` 2274 (backstage cinematic), `#momentBack` / `#ceremonyBack .momentcard` 2278/2285, `#tourBack` 2286 (spotlight tour), `#cardOv .pcov` 2268 (3D player card), `.confetti`, `#toast` 2292.
Booking: `#startScreen` + tab `.panel`s (own router).

---

## 16. Inconsistencies (concrete)

1. **~30 near-black surface hexes and 101 near-gray hexes** for what should be 3-4 surface tokens; dialogs alone use `#171313`, `#1a1512`, `#1a140b->#0d0906`, `#1a1712` (booking).
2. **Five reds:** `--brandred #C6392C`, `--brandred-bright #e05446`, `#f0907f` (63 literal uses, no token), `#c0392b` (`.advice.bad`), `#e0685a` (opponent plate), plus booking `#f08a76`, `--red2 #8f231b`, `--gold2 #9e2a20`.
3. **Three golds / gold gradients:** `--gold #e0b341`, `#f6d97a`, `#f4c95b`, `#cbb46a`, `#c69732`, gradients `#f2d27a->#c69a2c` vs `#c9a24d->#a6842f`, and **in booking `--gold` means red**. A component copied between the two pages changes colour silently.
4. **Gold at 34 alphas, black at 30, white at 28, red at 25.**
5. **Buttons styled at least 7 ways** (section 6); primary CTA is sometimes red-outline pill, sometimes solid gold gradient, sometimes a brown-gold 8px-radius Anton button; `.rulechip` needs 8 `!important`s to escape the global button rule, `.navhelp` 4.
6. **Selected-state and hover colour are not systematic**: red vs gold for the same meaning across `.opt/.tile-opt/.chip/.slot/.subnav/.step/.tabrow`.
7. **27 radii**: cards at 9-20px, pills at 999px and 99px, small chips at 4/6/8/9px.
8. **53 font sizes and 29 letter-spacings**; body copy split across 12/12.5/13/13.5/14.
9. **53 one-off box-shadows**; shared "surface" treatment covers 17 classes and misses ~25 sibling card types, so some cards have a lit edge and drop and adjacent ones are flat.
10. **448 inline `style=` attributes** (many font-size/padding overrides inside template strings), so a token change does not reach them.
11. **Brand tokens re-typed as hex 357 times in JS** (`#e0b341` 182, `#c6392c` 102, `#f4e8db` 73).
12. **Dead / phantom tokens:** `--purple --oncard --ink --panel-raised --serif` unused; `--sans` used but undefined; Cinzel loaded but unused on the career page.
13. **Georgia serif** for scene quotes vs the declared `--serif` (Cinzel) vs `--mono` for media quotes: three "quote voices".
14. **Faux-bold Anton** in 6 rules.
15. **Icon rule broken**: stated "no stock emoji", but 🔒, 🍽 and 9 Unicode dingbats ship as UI icons; `pico()` silently returns empty for unknown ids.
16. **Two cream bands on a dark app**: the number strip (and booking masthead) is a light cream gradient with brown 9px labels, unlike every other surface.
17. **Booking vs career chrome diverge**: different header, tabs, button colours, modal colour, badge colours, focus colour (gold-as-red outline with offset vs red without), no sitebar/back link.
18. Bars animate `width` with 6+ different durations/easings for the same "meter fills" idea (`.fbar i`, `.momfill`, `.xpbar i`, `.ph-bar`, `.hc-bar`, `.bar`).

## 17. Accessibility problems

- **No focus styles on any button or clickable card.** The only focus rule is `select:focus,input:focus` (198). With 111 `<button>`s plus 39 `<div onclick>` and 3 `<span onclick>` (cards, `.sb-mark`, `.term`, `.frules`, HUD cells, room bodies), keyboard users get the UA ring at best and nothing at all on the divs: **0 `tabindex`, 0 `role="button"`**, so the divs are unreachable by keyboard.
- Only 7 `aria-label`s in the file (pager arrows, card close, logo, a few). Icon-only buttons (tab bar on narrow widths where labels hide, `.sb-coin` until filled, `.sb-prof` with name hidden < 520px, `.pgr-a`) depend on `title` or nothing. All `pico` SVGs are `aria-hidden`, correct, but their buttons then have no name when the text label is hidden (`.sb-nav button span{display:none}` < 520px).
- **Small text:** 47 rules at <= 9.5px (8px `.tile-opt .tr`, 8.5px `.ch-al`, 9px HUD labels, `.pr-lab`, `.bk-ov span`, `.navdot`, `.scene-tag` with .32em tracking), mostly uppercase `--text-faint`. The tab bar labels are 9.5px.
- **Contrast** (computed): `--text-faint #9b917f` on page 6.3:1, on a panel 5.5:1 (ok), but many faint labels are further dimmed with `opacity` (.6-.75: `.term-q`, `.scene-tag` .75, `.pgr-x`, `.momsub` .65) landing near 3:1. `--brandred #C6392C` used as text (`.sb-home span`, `.flog .open::before`, `.pc-list` bullets) is 3.8:1 on the page. Cream-strip HUD labels `#94764a` on cream 3.5:1 at 9px; topbar `.sub #8a6a1e` 3.9:1 at 10px. `button:hover` cream on brandred 4.3:1 (just under 4.5 at 13px). Disabled/locked content at opacity .35-.55 (`button:disabled`, `.chip.off`, `.tile-opt.locked`, `.movecard.lock`, `.bs-opt.off`, `.prow`).
- **State shown by colour alone** in several places (heel/face/stage chips, `.dp.good/mid/bad` percentages, `.mv-d` up/down colour, red vs blue fighter bars, `.prow.ready`).
- **Reduced motion** only covers 4 groups; full-arena white flash (`.flash.go`, opacity .85) and screen shake run regardless; this is the most significant vestibular/photosensitivity issue. Infinite `logoFloat` and `btnGlow` on the home screen.
- Tap-to-flip card, tap-to-expand `.frules`, `.term` glossary tooltips: mouse/tap only.
- `<html lang="en">` present; no skip link; screens are `display:none` toggles with no focus management or `aria-live` on screen change; toasts (`#toast`) are not announced (no `role="status"`).
- `user-select:none` on the mash button only (fine).

## 18. Mobile layout risks

- **Tap targets under 44px:** header rail pills 28px, gfx toggle 32px, pager arrows 32px, banner chips 34px, swatches 30px, `.subnav button` ~24px (5px padding, 11px text), `.rulechip` ~22px, `.pr-lane button` ~22px, `.bk-quickrow button` ~25px, `.tile-opt .tlock` 12px glyph, `.pcx` close 36px, inline `padding:4px 10px;font-size:11px` buttons.
- **Hover-only affordances on touch:** ~43 `:hover` rules, many with `transform:translateY(-2px)` lifts and colour fills that stick after a tap on iOS; no `@media (hover:hover)` guard anywhere. `button:hover` turns the button solid red on tap and it stays red.
- **Hard-coded vertical offsets:** topbar `top: env + 48px`, `body.hasnav` padding 82px, inmatch 58px, botnav reserved 76/80px, toast 80px above botnav, booking `.tabs top:57px` (breaks if the masthead wraps, which it does at 640 when HUD wraps). Any text-size change or wrap in the site bar desynchronises these.
- **Fixed heights:** `.arena` 340/250/420px, `.homering` 272/212px, `.flog` 96px, `.pcard3d min(500px,72vh)`, `.modal max-height:88vh`, `min-height:100vh` on body: `vh` on iOS Safari includes the URL bar; no `dvh/svh` used.
- **The `.screen > h2` header** reserves 92px right padding on phones for the icon; at 320px wide (main padding 12px) the title gets ~190px, and `clamp(28px,...)` long titles ("Locker Room", promotion names) wrap to 3 lines inside an 84px-min box.
- **Number strip** packs 5 cells with 18px gaps into one row with no wrap rule; at 320px with a long "Where" value it overflows (value is 12px but not ellipsized).
- **Hidden scrollbars** on `.subnav`, `.navrow`, `.pgr-chips`, `.sb-nav` with no fade/edge affordance: off-screen tabs are invisible.
- `.sb-prof max-width:40vw` + `.sb-coin` + `.sb-home` + `.sb-mark` in one 320px row: the mark is ellipsized to fit; coin value growth (5+ digits) pushes it further.
- **GPU load on phones:** venue rig up to 6 blurred `mix-blend-mode:screen` beams + 8 cans + 22 flashes + tron sheen + crowd + cage SVG layers, all animating while the match also animates fighters, pyro and `box-shadow` glows; `btnGlow` animates box-shadow continuously on the home screen.
- `color-mix()` in beams/tron with no fallback (older iOS shows no beams).
- The 3D flip card (`perspective`, `backface-visibility`) inside `inset:0` overlay is known-fragile on older Android WebViews.
- `scrollbar-gutter:stable` reserves a gutter on desktop only; fine. `overscroll-behavior-y:none` disables pull-to-refresh (intentional).

## 19. Shared site chrome

- Career page: its own `.sitebar` with a `RunThe.GG` home pill (absolute `https://runthe.gg`, which CLAUDE.md warns about for the www/apex split), its own wordmark, wallet and profile. No shared `/assets/` header/footer script is loaded; no footer; the four game scripts are local (`moves.js?v=3`, `legends.js?v=2`, `cosmetics.js?v=4`, `world.js?v=3`). Manifest + favicons local. Unlisted: `robots noindex,nofollow`.
- Booking page: separate masthead/tabs, favicons via `../`, same Google Fonts link, no manifest, no back-to-site link in chrome, loads `../roster.js`, `../corrections.js`, `../personalities.js`.
- The only cross-page link is the ghost button "Promotion Booking Sim →" on home (`location.href='booking/'`).

# Appendix D: the sister games' sprites

Read-only audit of `/home/user/runthe-gg-site`. Two sister systems, plus one stale copy.

| | Run The Floor (hoops) | Run The Tour (golf), live | Run The Tour, hub copy |
|---|---|---|---|
| file | `hoops/baller.js` (715 lines) | `golf/index.html` `PXHD` IIFE, lines 16854-17176 | `golf/pxgolfer.js` (1405 lines) |
| global | `window.RTF_BALLER` (also `module.exports`) | internal (`PXHD.render/renderMap/ramp/mix`) | `window.RTGolfer` |
| grid | **44 x 64** | **44 x 56** | 44 x 56 |
| drawing method | procedural rig: shapes with normals | procedural rig: shapes with normals (`Sprite`) + authored char maps imported as parts | flat authored char map (`PXG_BODY`), palette letters, `pxShade` offsets |
| outline | OUTSIDE silhouette, a dark mix of the bordering part's darkest ramp step with INK | INSIDE silhouette, the part's own shadow step ("owner: no dark outer ring") | none for body (map has shading chars), items get rim/under-edge shading |

The hub copy (`golf/pxgolfer.js`) says on line 1 it is GENERATED by `build-a-golfer/gen-pxgolfer.mjs`, and that directory does not exist in the repo. It is the pre-PXHD flat painter and has drifted from the game. Do not use it as the reference; the live golfer is `PXHD` inside `golf/index.html`.

---

## A. Run The Floor: `hoops/baller.js`

### Grid, centre, light
- `var W = 44, H = 64;` (line 28). `var CX = 22;` centre line between columns 21 and 22 (line 189).
- `LIGHT = normalize([-0.52, -0.6, 0.6])` (line 190): light from the UPPER LEFT, toward the viewer.
- `INK = '#0d1019'` (line 191), used only mixed into the outline.

### Rendering pipeline
1. `paint(look, opts)` (line 271) returns a **64-row x 44-col array of hex strings or null**. Pure, no DOM. Node can require it.
2. `canvas(look, opts)` (line 654): `s = Math.max(1, Math.round(o.scale || 4))`, canvas `W*s x H*s`, a ground shadow ellipse `ctx.ellipse(22*s, 63.1*s, 11*s, 1.3*s)` at `rgba(0,0,0,.28)` (skipped if `shadow:false`), then one `fillRect(x*s, y*s, s, s)` per cell. Integer scale only.
3. `url(look, opts)` (line 676): `toDataURL('image/png')`, cached by `keyOf` (normalized look, c1, c2, num, pose, age>=33, frame, scale, shadow), FIFO capped at 80.
4. `img(look, opts, cls)` (line 687): returns `<img class="rtf-baller ..." src=frame0 data-b0 data-b1 width=W*scale height=H*scale>`. `pose:'trophy'` or `still:true` gets one frame.
5. `breathe()` (line 697): one page-wide `setInterval` at **720 ms** swaps every `img.rtf-baller[data-b0]` between `data-b0` and `data-b1`. Skipped under `prefers-reduced-motion`. Auto-started on load (line 714).

### Display scale and image-rendering
- CSS in `hoops/career-ui.js` line 210: `img.rtf-baller{image-rendering:pixelated;image-rendering:crisp-edges;}`.
- Heights used (career-ui.js 211-230): 64, 80, 96, 128, 160 px; scenes.js line 78: `.sc-cast img{height:min(46vh,320px);image-rendering:pixelated}`.
- CLAUDE.md: heights are "mostly multiples of half a cell" (64/H = 1x, 96 = 1.5x, 128 = 2x, 160 = 2.5x, 320 = 5x) which is whole device pixels on a 2x screen. The canvas is built at scale 2/3/4/6 and CSS rescales it; the rule is only that the final device-pixel scale is whole.
- Calls: `portrait()` scale 3 default (career-ui.js 260), Look sheet scale 4 (318), Hall card scale 4 (943), rival chip scale 2 still (590), scenes `scale: 6` (scenes.js 446, 450).

### Palette logic
- `ramp(hex, cool, soft)` (lines 140-164), five steps `[deep shadow, shadow, base, light, highlight]`, HSL:
  - shadows: hue turned toward `cool` (default **238**, blue) by 28 / 14 degrees, saturation *1.08+.06 / *1.05+.03 (HOLD chroma), lightness *0.46 / *0.72.
  - lights: hue toward **52** (warm yellow) by 7 / 13 degrees, sat *0.98 / *0.9, lightness `l + (1-l)*0.2` / `*0.46`.
  - near black lifted first: `if (l < 0.15) { l = 0.15 + l*0.4; s = max(s,.18); if grey h = 222 }`; a grey gets `h=220, s=.06+s` so it has a hue to turn.
  - `soft` (skin): cool hue 355 (red), turns only 10/5 degrees, saturation capped `min(s,.55)` and scaled `.62/.78` in shadow, lights toward 52 by 4/8. "Or a pale face in shade reads as a sunburn."
- `toward(h, goal, by)` (line 128) turns hue the short way round.
- `rgb/hexOf/mix/lum/contrast` (91-103), `hsl/fromHsl` (111-126). `inkOn(bg, want)` (106): keep the club's second colour if contrast >= 2.6, else white or near black.
- Team colours: `paint` takes `opts.c1, opts.c2` (the jersey's two colours; career-ui passes `C.colorsOf(L).primary/secondary`, i.e. `E.clubSkin(code)`). If `contrast(c1,c2) < 1.4` then `c2 = inkOn(c1)` (line 276). Jersey/shorts = `ramp(c1)`, trim/piping/stripes = `ramp(c2)`, number = `ramp(inkOn(c1,c2))`, suit jacket = `ramp(mix(c1,'#14161c',.66))`, tie = c1 or c2 by contrast, cap = `ramp(c1)`, cap logo `ramp(c2)`. "club" gear options use c1/c2.
- Fixed gear colours: `FIXED = { white:'#f2f2f0', black:'#1d1f24', red:'#d13a32', gold:'#e8b33c' }` (line 46). Shoes `ramp(FIXED[...])`, socks `ramp('#ecebe6')`, trousers `ramp('#2a2e38')`, shirt `ramp('#f1f1ec')`, gold `ramp('#e3a92f',18)`, ball `ramp('#e2762a',8)`.
- Skins (line 32), 8 hexes light to dark: `#f6d6bb #efc39f #dfa77d #c88c60 #aa6f45 #8b5735 #6c4027 #4b2c19`; skin ramp is `ramp(skinHex, 355, true)`.
- Hair colours (line 33): black, darkbrown, brown, auburn, blonde, platinum, red, blue. Hair ramp cool 250. Age >= 33 greys: `mix(hair,'#c9c9c4', min(.75,(age-32)/12))` (line 282). Beard uses the natural colour even if hair is dyed, darkened 12%.

### Shading (normal-based)
- `Rig` (line 231): per-cell `pid` (part id), `lev` (0..4 ramp level), `col`.
- `Rig.add(name, o, shape)` (line 239): shape(px,py) returns a 2D normal [nx,ny] or null; `nz = sqrt(1-nn)`; `l = n . LIGHT - ao + lift`; level thresholds `l>0.9 -> 4, >0.66 -> 3, >0.22 -> 2, >-0.16 -> 1, else 0`. Options: `ramp`, `group` (pieces of one limb never line each other), `line` (false = draws no line on parts behind), `ao` (darken, e.g. neck 0.34), `lift` (cloth uses -0.12), `flat` (squash normal), `clip(x,y)`.
- Shape primitives: `tube(pts)` (line 197) tapered capsule through `[x,y,r]` points with cylinder normals; `ellipse(cx,cy,rx,ry)` (210); `rows(y0,y1,hw,cx,flat)` (219) row-table barrel shape, flatter top-to-bottom (`flat` default 0.55; torso uses 0.12 so cloth shades across, not up/down); `table(y0,list)` (229).
- Later parts overwrite earlier (painter's order = z order); part id = draw order.

### The three finishing passes
1. `shadeRun()` (258) maps level to ramp colour.
2. Detail over shading (lines 472-599): jersey piping found (any jersey cell touching torso/neck skin gets `J2[3 or 2]`), 4x6 bitmap DIGITS number with a drop shade, shorts waistband/stripes/hem/folds, sock stripes, shoe laces, face pixels hand-set (brows row 9, eyes row 11 at x 18,19 / 24,25, nose 21-22 rows 11-13, mouth row 15), stubble checker, hair texture by hash/modulo per style, hairline shadow (head cell under hair drops a level), knuckles.
3. Breath (602): `frame===1` shifts every row above the knee (row 45, suit 42) down one cell. Legs stay planted.
4. `opts.parts` (611) returns part names per cell instead of colours (used by `hoops/check-career.mjs` 531-570).
5. Contact line (614-631): where a part in FRONT (higher id, different group, `line!==false`) borders a part behind, the behind cell takes its own `ramp[0]` (left/top neighbour) or `ramp[1]` (right/bottom).
6. Selective outline (634-645): every EMPTY cell 4-adjacent to the figure becomes `mix(neighbourPart.ramp[0], INK, litSide ? 0.5 : 0.76)`; the right/bottom neighbour ("lit side" flag per probe) wins. So outline is a dark tint of what it borders, lighter on lit side, never flat black.

### Proportions (44x64)
- Head rows 4-17 (`HW` half widths 3.0..5.9..2.6, line 380), hair to row 1, ears at y 11.6.
- Neck 16-20, torso rows 18-36 (`T` half widths 5.0 up to 9.7), shorts 35-47, legs knee ~46-57, shoes 56-61, sole 62, ground shadow 63.
- About 4 heads tall ("a little over four heads tall, the sports sprite's proportion").
- Shoulder joint `CX +- (9.4 + bw*.75), y 22.2`. Build: `bw` (shoulders) lean -0.7 / strong +0.9; `am` (limb radius) -0.15 / +0.35.
- check-career asserts: no part touches the grid edge, every pose has head/hands/shoes, every pose breathes, >= 24 colours per figure.

### Poses (6) and frames
`stand, ball, up, trophy, suit, cap` (arm joints per pose lines 303-312). `suit` and `cap` swap tank/shorts for jacket/trousers. Two frames each (breath), trophy is still. Timer 720 ms.

### Look fields (all validated by `normal()`, line 52; `DEFAULT` line 49)
- `skin` 0..7 index; `hc` 0..7 hair colour index
- `hair`: fade, buzz, afro, twists, braids, flattop, curly, bun, long, bald
- `beard`: none, stubble, goatee, full
- `band` (headband): none, white, black, club, red
- `sleeve` (right arm): none, white, black, club
- `shoes`: white, black, club, red, gold
- `build`: lean, standard, strong
- per-draw opts (not look): `c1, c2, num, pose, age, frame, scale, shadow, still, parts`
- `lookFor(seed)` (74): FNV-1a `hash('look:'+seed)` bytes pick each field; used for rivals and new players.

### How hoops uses it
- `career-ui.js` 247-261 `lookOf(L)` / `portrait(L,o)`; fallback SVG jersey if baller.js missing (264). Look chooser `lookRows` (305-319) and `openLook` (709).
- `scenes.js`: rooms are pure CSS gradients/clip-paths (not pixel art), lines 115-140. The cast is `B.img(..., scale: 6)` (446, 450) in `.sc-cast img` with `image-rendering:pixelated`, height `min(46vh,320px)`. Each beat names `pose` (stand/ball/up/trophy/suit/cap).

---

## B. Run The Tour: `golf/index.html` PXHD (live) and `golf/pxgolfer.js` (stale hub copy)

### Grid
- `const PXG_W=44, PXG_H=56;` (index.html 15550; pxgolfer.js 115). PXHD: `const W=44, H=56, C=22.5;` (16855).
- 3/4 swing golfers are a separate system: `PXG_DIR8_W=24, PXG_DIR8_H=26` (16792), authored 8-direction and 4-direction (`PXG_SW4`) char maps, plus `SW4_HR=10` headroom rows.

### Rendering pipeline (standing golfer)
- `pxGolferCanvas(look, opts)` (17177) resolves `avLook(look)` (15527) then calls `PXHD.render({...})`, caching canvases in `_pxCanvas` (FIFO cap `PX_CACHE_CAP=64`, `pxCacheSet` 16701).
- `PXHD.render(o)` (17135): canvas `W*px x H*px` with **`px = 7`** fixed (308 x 392), ground shadow `ellipse(22*px, 54*px, 12*px, 2*px)` at `rgba(0,0,0,.22)`, then `Sprite.paint`, one `fillRect` per cell.
- `pxGolferURL(look)` (17439) `toDataURL`, cached.
- Display: `<img>` scaled by CSS height, not integer-snapped: `pxFigureHTML(look,h)` default 60 px (17479), cutscenes `csFigH(k) = clamp(innerHeight*0.30, 150, 300) * k` (21630), `.pxfig .pximg{object-fit:contain;image-rendering:crisp-edges;image-rendering:pixelated}` (CSS line 1718), `.cs-fig{image-rendering:pixelated}` (22513), `.avatarfig.fullbody.av-setup-full{height:min(56vh,520px)}` (744). So golf does NOT enforce whole-number device scale the way hoops does; it relies on `pixelated`.
- Head chip: `pxAvatarChip(look,sz)` (17476) crops rows ~4-26 by CSS offset.

### Idle animation
- `pxGolferIdleURL(look)` (17450): breathe frame COMPOSITED from the base canvas: rows above `PX_IDLE_SPLIT=42` drawn 1 sprite pixel (7 canvas px) lower, rows below (legs, shadow) unchanged. Same idea as hoops (hoops splits at the knee row 45).
- Global ticker (17483-17497): `setInterval(..., 700)` swapping `img.pxidle` between `data-base` and `data-breathe`; new images join at the ticker's current phase (`_pxFlip`) to avoid a snap; reduced motion shows base only. Hoops: 720 ms. Golf: 700 ms.

### Palette logic (PXHD)
- `ramp(hex,o)` (16868), 5 steps `[deep, shade, base, light, spec]`, done in RGB mixing, not hue rotation:
  - non-skin: `COOL='#2a2a68'`, `WARM='#fff7dc'`; `dk(a,c) = mix(mix(hex,'#000',a*sp), COOL, c)`, `lt(a,w) = mix(mix(hex,'#fff',a*sp), WARM, w)`; result `[sat(dk(.34,.20),1.08), sat(dk(.15,.10),1.05), hex, lt(.16,.10), lt(.34,.24)]` (shadows get a saturation bump).
  - skin: `COOL='#5a2338'` (red-violet), `WARM='#fff0d0'`, `[dk(.30,.22), dk(.13,.10), hex, lt(.12,.10), lt(.26,.20)]`.
  - comment: "An RGB mix rather than a hue rotation, so a white polo shades lavender, not green."
- `skinRamp(hex)` (16874): dark skin (lum<.3) gets spread .55 and warm-tan lights (`mix(hex,'#e8b48a',.16)`, `mix(hex,'#f4cfa8',.30)`).
- `hairRamp(hex)` (16876): very dark hair (lum<.2) gets lavender-grey lights (`#8a7a9a`, `#b8aac8`).
- Colours come from `avLook` (15527): skin is a continuous `skinTone` 0..100 interpolated across 8 SKINS stops (`skinRampHex`), or a named skin id; shirt/hat from POLOS + COSMETIC_SHIRTS; pants PANTS; shoes SHOES; 17 HAIRS. Age greys hair crown/temples (`AGE_GREY_START=30`, crown full 56, temples full 46, max .88 toward `#d9d8d1`) and tans skin (15498-15530). No team colours: golf is the player's own outfit choices.
- Fixed colours `PXG_FIX={k:'#181019', l:'#cfd2d7', g:'#c99a2a', n:'#232733', G:'#2d323c', H:'#525a68', F:'#cfd3da'}` (16692) and in render: glove `#f7f8f5`, belt `#2a2420`, lens `['#040508',...]`, gold `#d6a640`, cap patch auto-contrasts to hat (`#1b2b4a` or `#f1ede2`).
- Legacy painter (`pxgolfer.js`, and the 3/4 swing sprites in index.html): flat palette letters with `pxShade(hex,amt)` = add amt to each RGB channel (16693), e.g. skin `j` -26, `x` +20; shirt `d` -26, `v` +34.

### Shading (PXHD)
- `LIGHT = normalize([-.55,-.72,.72])` (16904): upper left, same direction as hoops (hoops `[-0.52,-0.6,0.6]`).
- Normals: `nEll`, `nCylV` (vertical cylinder), `nCylSeg` (limb), `nFlat`. Masks: `ell`, `rect`, `poly`, `seg`, `and/or/not`, `mir` (mirror about C=22.5).
- `toneOf` (16905): `d = n.LIGHT + bias`; `d>0.94 -> 3 (4 if gloss), >0.80 -> 3, >0.40 -> 2, >0.08 -> 1, else 0`; `gloss>1 && d>.88 -> 4`; plus per-cell `dt` nudge. Note thresholds differ from hoops (0.9/0.66/0.22/-0.16).
- Per-cell overrides: `s.tone(x,y,t)` (fixed level), `s.nudge(x,y,d)` (relative), `s.set(...)`.

### `Sprite.prototype.paint` (16914): the finishing passes
1. tone per cell.
2. contact shadow (AO): a cell whose top/right/left neighbour is a different material drawn LATER (higher z) drops one level (unless `noAO`/`noCast`).
3. inner contour: a cell bordering (down/right/left) a different material drawn EARLIER takes `ramp[min(tone,1)]` (the overlapping part gets a line on its own edge, i.e. the part in front draws the line; hoops puts it on the part behind).
4. soft outline INSIDE the silhouette: any cell with an empty neighbour; shadow side (empty below/right) gets `ramp[clamp(t-1,0,1)]`, lit side (empty above/left) `ramp[clamp(t-1,0,2)]`. No pixel is added outside the figure. ("owner: no dark outer ring").
5. `only` paints one tagged layer (shoe, hat, top, leg, ew) for shop thumbnails.

### Parts / layers (PXHD `build`, 16952-17134)
Material names (`m`): hair, pants, shoe, sole, saddle, lace, belt, shirt, button, jacket, tie, jbutton, skin, glove, pupil, brow, mouth, blush, hat, hatbtn, patch, patchmark, band, dlens, frame, gold, glint, strap, mirror, and `x:<hex>` for authored-map colours. Tags (for `only`): shoe, leg, top, hat, ew.
Order: long hair behind; legs (two poly tubes, crease tone); shoes (ellipses rows ~50-55); belt rows 37-38; torso poly rows 21.8-37.6, sleeves, collar flaps, buttons; arms converge to a two-hand grip at y ~38-41 (lead hand gloved); neck; ears; head (`ell(C,14,7.9,8.4)` top + jaw poly to y 21.2); face (dot eyes 2 px tall at x 19 and 25 rows 15-16, brows row 13, mouth row 19, blush); hair (procedural for short/curly/long/afro/buzz/swoop; other styles imported from `PXG_HAIR` maps with an ellipsoid normal fitted to the map's bounding box via `importMap` 16934); hats (cap, visor, bucket, flat procedural; others imported); eyewear; club and ball last.
`importMap(s,map,roleOf,o)` lets any authored char map join the lit rig: roles `c/b/w` hat (base/-1/+1), `t/d/v` shirt, `s/j/x` skin, `h/i/Y` hair, `p/q/m` pants, `o/z/u` shoe. This is the cleanest reuse hook: author a map in letters, get normal shading for free.

### Proportions (44x56)
Head + hair occupy rows ~3-22 (head ellipse centre 14, ry 8.4) of a figure from row ~3 to the soles at 55. About **2.8-3 heads tall**: chibi, big head, dot eyes. Torso 22-38, legs 38.5-52.4, shoes ~50-55. Hoops is noticeably taller and more realistic (about 4 heads, real eyes with whites, nose, ears).

### Poses
Standing golfer: ONE pose (address, club across the body), plus the breathe frame. Swing/putt/chip animation uses the separate 24x26 3/4 maps (`pxSw4`: full = [address, top, address, finish], putt 3 frames; `pxDir8`) drawn flat with `pxShade` palettes at `px=7`.

### Look fields (golf)
`skin` (id) or `skinTone` 0..100, `hair` (17 colours), `hairStyle` (short, swoop, curly, long, buzz, afro, mohawk, mullet, ponytail, topknot, spiky), `polo`, `hat` (colour), `cap` bool, `hatStyle` (cap, visor, bucket, flat + ~30 novelty), `pants`, `shoes`, `shirtPat` (~60 patterns, `PXPAT` 16704+), `eyewear`, `top` (cardigan, blazer, cape, duckfloatie), `leg` (plusfours), `cleats`, `club`, `ball`, `lefty`, `gender`, `age`, `country`, `caddie`. `DEFLOOK` at pxgolfer.js 86 / index.html equivalent.

### Other golf pixel assets
- `golf/pixel-icons/`: Python builders writing 18x18 icon grids into `golf/index.html` (`PXICONS`, `PXI`, `PX_COINS`, `PX_TOKEN`). Coloured set uses body `m`, shade `d`, light `h`, and a **1px dark outline `k` added last** (`draw.py` `outline()` line 123, colour `#2a2412` in `pxIconSVG` 3850). Rendered as SVG `<rect>`s with `shape-rendering="crispEdges"`.
- `golf/roster/` is a data refresh (DataGolf), no sprites.
- Scene backdrops (`pxCardBgCanvas` 10972) are 96x132 canvases with smooth organic blobs, not strict pixel art; cutscene rooms are CSS.

---

## Consistency between the two

Same family, not identical. Shared:
- 44 columns wide, a mid-column centre (hoops 22, golf 22.5).
- Procedural rig: shapes with 2D normals, z = draw order, light from the upper left toward the viewer, 5-step ramps (deep, shade, base, light, highlight) whose shadows go cool and lights go warm, skin with its own warmer shadow.
- Contact lines between overlapping parts instead of black outlines; edge pixels in a shade of the part rather than flat black.
- Two-frame idle breath: upper body drops one cell, legs planted, global page timer (700 vs 720 ms), reduced motion = still frame, cached data URLs, `image-rendering: pixelated`, soft drop shadow ellipse under the feet.

Different:
| | hoops baller | golf PXHD |
|---|---|---|
| height | 64 rows, ~4 heads | 56 rows, ~3 heads (chibi) |
| ramp math | HSL hue rotation (cool 238 / warm 52) | RGB mix toward `#2a2a68` / `#fff7dc` |
| tone thresholds | .9 / .66 / .22 / -.16 | .94(gloss) / .80 / .40 / .08 |
| outline | one ring OUTSIDE, dark mix with `#0d1019` (0.5 lit side, 0.76 shadow side) | inside the silhouette, the part's own shadow steps, nothing added outside |
| contact line | on the part BEHIND | on the part IN FRONT, plus a contact-shadow AO step on the part behind |
| canvas | integer `scale` param (2,3,4,6) and CSS heights at half-cell multiples | fixed `px=7`, CSS heights arbitrary (60, 150-300, 56vh) |
| colour source | team colours `c1/c2` with contrast fixes (`inkOn`) | player-chosen outfit, no team |
| poses | 6 full-body poses on the same rig | 1 standing pose; swings on a separate 24x26 flat map set |
| face | eye whites + pupils, brows, nose, mouth, ears | dot eyes, brows, mouth, blush |
| breathing split | knee row 45 (suit 42), timer 720 | row 42, timer 700 |
| breath frame | re-painted (`frame:1`) | composited from the base canvas |

## Recommendation for wrestling

Copy the hoops `baller.js` architecture: it is the cleaner, self-contained, testable one (node-requirable `paint()`, `normal()`, `parts:true`, team colours with `inkOn`, multiple poses on one rig, integer scale). Reusable verbatim: `rgb/hexOf/mix/lum/contrast/inkOn`, `hsl/fromHsl/toward/ramp`, `tube/ellipse/rows/table`, `Rig` (`add/set/level/shadeRun`), the contact-line and outline passes (lines 614-645), `canvas/url/img/breathe`, `lookFor/hash/normal`. For authored gear (masks, belts, title plates) borrow golf's `importMap` idea: author a letter map and shade it with an ellipsoid normal fitted to its own bounds. Keep 44 wide; 64 tall matches hoops (wrestlers want the realistic ~4-head build, not golf's chibi). Display at heights that are whole multiples of half a cell (32/64/96/128/160/320 px) with `image-rendering:pixelated`.
