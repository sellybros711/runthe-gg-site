# Run The Floor Career: audit

Date: 2026-10-01. Read end to end: `hoops/career.js` (4,034 lines),
`career-ui.js` (1,067), `scenes.js` (617), `baller.js` (715), and the Career
markup and CSS in `hoops/index.html`. The mode was played on a 390x844 phone
and a 1440x900 desktop, high school start, random answers, scenes on: 56
distinct screens captured on each (`audit-phone.jpg`, `audit-desktop.jpg`). Then
1,000 headless careers were run, plus 600 more with a bug probe.

Appendices, kept verbatim from the two code reads:
`AUDIT-events.md` (every card, the state model, the step machine, memory,
seeding, bugs) and `AUDIT-design.md` (the design inventory).

---

## 1. Architecture

| file | role |
|---|---|
| `career.js` | The whole engine. `newLife`, `step`, `choose`, `act`, `retireNow`, the season sim, the road (high school, college, pro year), draft, contracts, free agency, the coach carousel, the rival, life cards, press conferences, legacy. Node and browser (`window.RTF_CAREER`). Pure and seeded: every draw is `rngAt(L, tag)` off (seed, year, tag), so a reload replays exactly. |
| `career-ui.js` | Draws `#s-car` (builder, hub, Hall card) by rebuilding HTML strings on every press, injects its own stylesheet, saves `rtf.life.v1` through `RTF_MODES_UI.write` (so the career is on the account via `cloud.js` slot `life`), files the board row. |
| `scenes.js` | The broadcast layer: one overlay, rooms drawn in CSS, typewriter, tap to advance, skip, an off switch. Decides nothing: it tells beats after the engine moved and answers a card through `C.choose`. |
| `baller.js` | The player sprite, painted procedurally to canvas and cached as data URLs. Final; documented only. |
| `index.html` | The front-page Career hero, the dock, shared chrome, the leaderboard Career tab. |
| `supabase/130_hoops_careers.sql` | The Career board (deployed by hand). |

**State.** One object `L` (the agent's appendix section 2 lists every key):
identity, look, ratings, meters (health, morale, fame, trust), `pot`, `eth`,
`dur`, contract, team, history rows, road state `am`, `season`, `pending`
cards, `log`, `flags`, `rival`, `life`, `rep`, the league picture (clubs, nets,
coaches, rosters). **Save:** `rtf.life.v1 = { cur, hof, last }`. `L.v` is
written as 1 and never read: **there is no migration path today.**
`career-ui.load()` drops `last` on reload.

**Step machine.** Road: `hs_pre → hs_reg → hs_po → hs_off` three times, then
college (`col_pre`, non-conference, conference, tournament, March, `col_off`)
or a pro year, then `combine` and the draft. NBA: `pre → early → mid → late →
po → off`, a card or two between stretches.

---

## 2. Every event and scene

110 card types reach a player today: 47 NBA pool events, 20 road events, 21
cards built in code, 5 press conference topics, and the clutch cards. About 266
choices in all. 7 between-card actions (Talk to the coach, Ask for a trade, Off
the court items). Every one was dealt at least once in 600 random careers.
Full table: `AUDIT-events.md` section 1.

Scenes (17): `draft`, `undrafted`, `debut`, `title`, `ring2`, `finals_loss`,
`g7_make`, `g7_miss`, `mvp`, `allstar`, `ncaa`, `state`, `trade`, `milestone`,
`retire`, `hall`, `rival_mvp`, plus 9 card intros (`presser`, `clutch`,
`amclutch`, `offers`, `commit`, `signing`, `declare`, `after`). Rooms: arena,
press, draft, studio, gym, locker, hall.

---

## 3. Routes and outcomes reachable today, and where careers converge

```
create ─┬─ high school (3 yrs) ─┬─ college 1 to 4 yrs ─┐
        │                       ├─ overseas year ──────┤
        │                       └─ G League year ──────┤
        └─ draft night (4 backgrounds) ────────────────┴─ combine, workout, agent, draft
             └─ lottery / first / second round / undrafted (1.7%)
                  └─ NBA seasons ─ free agency, trades, carousel ─ retire
                       └─ verdict (6 tiers) × after (11 sentences)
```

Measured, 1,000 careers, three policies:

| measure | value |
|---|---|
| crashes, stuck careers | 0, 0 |
| distinct event ids in all 1,000 careers | 88 |
| distinct events per career | 46.8 (out of about 124 cards dealt) |
| **events two careers share** | **76%** |
| draft slot: lottery / rest of first / second / undrafted | 34% / 17% / 47% / 1.7% |
| verdicts: Inner circle / First ballot / Hall / Ballot / Good / Journeyman | 8 / 10 / 15 / 15 / 33 / 19% |

**Where it converges:**
- every NBA season deals the same `training` card (about 15 per career);
- recurring events with static text come back yearly: night out about 6 times,
  slump 5 to 6, hot streak, film session, charity, family money about 4 each;
- the Game 7 card about 4.4 times per career, identical copy;
- every career walks combine, workout, agent, draft;
- the road always gives exactly 3 summer cards, an offers card and a commit;
- almost no choice is remembered (see section 5); the life arc is one way
  (single to married, no divorce);
- endings: 6 verdicts × 11 one-line epilogues, and the persona is free of
  performance (an 8 point journeyman can read "Face of the league", shot
  `059-hall` in the phone sheet).

---

## 4. Real people in drama: the biggest finding

The brief says real players and coaches appear only in basketball contexts.
**Today they are the subject of drama events.** Tokens `{mate}`, `{mate2}`,
`{star}`, `{vet}`, `{opp}` resolve to real players off the data, and NBA
`{coach}` to a real coach. Examples (career.js line):

- 2175 `teammate_fight`: "{mate} shoves you in practice."
- 1904 `rival_trash`: "{opp} called you overrated." (a fictional quote)
- 1786 `night_out`: "{mate} is organizing it", then "Photos surface."
- 1829 `stuck`: "{coach} does not listen to podcasts. {mate} sends it to him."
- 1966 `docuseries`: "Episode six says too much about {coach}."
- 2063 `superteam`: "{opp} and {opp2} call you the same night." (private recruiting)
- 1765, 1776 `vet_mentor`, `rookie_duty`: a real veteran pulls you aside and
  hands you a breakfast order.
- 1845 `teammate_touches`: "{star} wants the ball."

18 events need rewriting before any new content. The plan (PLAN.md Phase 0)
seeds three invented teammates into every NBA locker room to carry this, types
every token as real or invented, and fails the build on a real token in a
drama event.

---

## 5. Memory

Choices are almost never remembered. Of all the answers, only these leave a
trace a later event reads: draft stock, the draft promise, `savvy` (two
events), `longevity`, a trade request, rival wins, the hometown flag, the
Game 7 make, an envelope. Write-only flags that nothing reads:
`tripleDoubles`, `dunk`, `threes`, `winners`, `press`, `gym`, `moved`,
`olympic`, `restYears`, `overseas`. Relationships do not exist beyond the
trust meter. The rival has no opinion of you. Press tones are not stored.
(`AUDIT-events.md` section 4.)

---

## 6. Design inventory, summary

(Full: `AUDIT-design.md`.)

- **Type:** Anton and Archivo; the pixel face is loaded and never used in
  Career. About 17 body sizes and 10 display sizes; the eyebrow role uses 7
  letter-spacings and two weights.
- **Color:** 11 near-black surfaces, 6 golds, semantic colors typed as
  literals that disagree with the theme (`#3ddc97` against `--green #22c55e`).
- **Shape:** 11 radii, about 12 hand-written ghost button variants, two sheet
  implementations.
- **Motion:** entrances replay on every re-render; meter fills never animate
  (the element is replaced); scenes hard-cut because `.sc-room.out` is never
  applied; confetti restarts every beat.
- **The sprite** (documented, not changed): 44x64 grid, five-step ramps per
  material, cool shadows and warm highlights, light from the upper left,
  outlines in a dark shade of the neighbour and never black, interior contact
  lines on the part behind, two-frame breath, six poses, painted to canvas at
  integer scales 2, 3, 4 and 6.
- **Sprite crispness:** shown at 80, 96, 160 and `min(46vh,320px)` CSS pixels.
  64 rows into 96 or 80 is not a whole multiple, so under `pixelated` the cells
  come out uneven. The new system pins every sprite to a whole-number scale.

---

## 7. Visual and UX problems seen in play

- The hub is one long column on every width. On desktop the content is a
  660px strip in a 1440px window.
- The primary action (`#cr-next`) scrolls away on a phone; there is no dock
  entry for Career.
- The season table runs off the right edge on a phone (the record column is
  cut).
- Scene rooms are flat CSS boxes (the draft stage is three rectangles) while
  the player is detailed pixel art: the two styles do not meet.
- The press room is a light polka-dot wall under white HUD text.
- The receipt after a choice is a small box that reads like a log line
  ("YOU: DENISE TISDELL / Denise Tisdell it is.").
- The story log has a year off by one: "2031: You declare for the 2030 NBA
  Draft."
- No team re-theming beyond the identity card's gradient.
- Fonts come from Google Fonts with a fallback stack; when the request is slow
  the mode renders in Impact and system UI.

---

## 8. Accessibility

- No `:focus-visible` style; focus is dropped to `<body>` after every press
  (whole-screen rebuild).
- Scene overlay and Career sheet are not dialogs: no role, no focus move, no
  trap; Career sheet has no Esc.
- Typewriter text is not announced.
- Selected chips, options and tabs are shown by color only.
- Contrast: white on the orange button's top stop 2.83:1; `--dim` labels on the
  decision card 3.69:1; "Tap to continue" about 3.5:1; text on raw club colors
  unchecked.
- Tap targets under 44px in the look chooser and the top bar.
- Retire uses `confirm()`.

---

## 9. Performance

- Full rebuild of the screen per press; the builder re-runs `newLife` on every
  chip tap; the hub rebuilds up to 160 log rows per step.
- The sprite breath is a 720ms interval swapping the `src` of every sprite on
  the page, hidden screens included.
- The draft count-up interval leaks across a re-render.
- Animations are mostly transform and opacity already (good), except the meter
  `width` transition.

---

## 10. Bugs

Confirmed by probe (details and counts in `AUDIT-events.md` section 7):

1. A hurt or benched player takes the Game 7 shot (56 and 538 of 2,933).
2. `late` cards run after standings, seeds and awards: a buzzer beater flips a
   record after seeding (258 cases), and minutes, usage, rest and risk from
   late cards do nothing.
3. The same timing hole on the road: high school cards come after all 26
   games, so "starting by February" and "sit three games" never apply.
4. A trade request made in a contract's last year survives free agency and
   trades you a year after you re-sign (51 cases).
5. The Olympics fire a year early (2027, 2031).
6. The rival can start on your own team.
7. A draft promise can push you down the board.
8. "Rest and recover" promises a slower decline and does nothing.
9. Restricted free agency is a label only.
10. The workout card says three teams and can show one or two.
11. "Two years with {partner}" can fire after one.
12. The overseas year skips development, health and the rival.
13. `retireNow()` drops the season in progress.
14. `career-ui.load()` drops `last`.
15. The coach search fires and hires when the card is dealt, not answered.
16. The story log's declare line is a year off.
17. Persona contradicts performance on the Hall card.

---

## 11. Where the wishlist and the code disagree

1. **Real people.** Section 4. Must change first.
2. **Sprite sheets.** There are no image sprites; everything is painted
   procedurally and cached. Keep that for new pixel art (zero requests, one
   grid) rather than adding sheet files. Same goal, better answer here.
3. **Fonts.** Self-hosting is the right call for performance and for the
   fallback problem in section 7, and it adds files. Your decision.
4. **"Every career different"** is mostly a content-memory problem, not a
   systems problem: the engine's seeding and step machine are sound. Phase C
   ports the existing events to a data schema with no behavior change (proved by
   replaying seeded careers) before adding anything.
5. **Leaderboards by challenge and Vault** need a database migration deployed
   by hand, like 130 was.
6. **Owners.** The engine generates owner names already, which is right; the
   brief's "team owner" cast member is written as an invented ownership group.
7. **Playing alongside your son** is legend-layer rare inside one career; the
   family tree in Phase E is the real route.
