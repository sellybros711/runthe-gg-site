# Career: the plan

Each phase ships on its own, keeps every existing save loading, and ends with
the same gate: the headless simulator (1,000+ careers, random and scripted
policies) is green, `check-career.mjs` and the other hoops suites are green,
every changed screen is screenshotted on a 390x844 phone, a 768x1024 tablet and a
1440x900 desktop and reviewed against DESIGN.md, and the sprite renders
byte for byte as before (a pixel hash of `baller.paint()` for 40 looks and
every pose, recorded once and asserted in every phase).

Direction picked 2026-10-01: Arena Arcade. Fonts self-hosted. Sound only
with real animated cutscenes. Every database migration moves to the end
(Phase G).

---

## Phase 0. Foundations (no visible change)

1. **Save version and migration.** `rtf.life.v1` gains `ver: 2`. `migrate(L)`
   runs on load and on cloud adopt, fills every new key with a safe default,
   and is idempotent. Fixtures: a save from today, a draft-night save, a
   finished career, a save from before looks. Asserted in a new
   `hoops/check-saves.mjs`.
2. **The real-people split** (see AUDIT.md section 4). Tokens are tagged
   `real` or `invented`; every event text is checked by a guard that fails if a
   real token appears in an event tagged `drama`, `offcourt` or `legend`.
   Every NBA locker room gets three invented teammates (seeded per club and
   season) who carry the drama the real roster cannot.
3. **The headless simulator** (`hoops/sim-career.mjs`): N careers, policies
   `random`, `first`, `last`, `greedy-fame`, `greedy-ring`, `script:<file>`.
   Reports crashes, stuck careers, event coverage, overlap between careers,
   route and ending frequency against NARRATIVE.md's balance targets, and a
   continuity scan (wrong team, wrong age, a reference to a flag never set).
4. **Lazy data** moves to Phase C step 1, where the events are ported to the
   data schema anyway: moving them twice would be churn.
5. **The sprite guard** (`hoops/check-sprite.mjs`): 960 hashes of every
   existing pose, recorded from the unchanged `baller.js`, so the new cutscene
   poses cannot move a cell of the old ones.

Status: done 2026-10-01. Saves are version 2 (`check-saves.mjs` plays six
frozen version 1 saves on unchanged), the real-people split is enforced
(`check-career.mjs` section 5c), and the simulator runs in CI.

## Phase A. Re-skin everything that exists

1. Tokens and `pixart.js` (crowds, hardwood, brick, icons).
2. Style guide page with every component in every state.
3. Rebuild, on the system: creation (UI around the sprite only), hub with
   the player card, the next decision and five meters with tooltips, decision
   card, receipt, press conference, season and school tables, free agency,
   Off the court sheet, trophy case, Hall of Fame card, every scene room.
4. Team theming live; count-ups, deltas, meter pulses; autosave on every press.
5. Phone: primary action docked in thumb reach (the dock already exists;
   Career gets an entry), no horizontal scroll (the season table becomes a
   card list under 520px), focus kept across renders, sheets as dialogs.
6. Shared chrome: header, front-page hero and the leaderboard Career tab on
   the same tokens so entering and leaving Career has no seam.

## Phase B. Games that feel alive

1. Broadcast package components.
2. Live sim ticker per stretch with speed controls and key moments only.
3. Playable moments engine on a pixel half court: last shot (existing),
   buzzer beater, clutch free throws, final stop, poster dunk, chase-down
   block. Each a short frame animation of the existing sprite (moved and posed,
   never redrawn) plus rim, net and crowd sprites.
4. Ceremonies: jersey reveal, All-Star intro, awards, ring night, banner,
   jersey retirement, Hall speech, on the existing scene player.
5. Animated cutscenes (DESIGN.md section 11): new moving frame sets drawn by
   the existing rig (walk, dribble, jumpshot, dunk, block, celebrate, dejected,
   handshake, wave), a shot timeline in `scenes.js`, pixel sets per room, and
   WebAudio sound cued off the timeline, muted by default.

## Phase C. The story engine

1. Event schema (NARRATIVE.md section 2): prerequisites, weights, cooldowns,
   rarity, chains, flags. The existing 88 events are ported to it first, with no
   behavior change, proved by replaying 1,000 seeded careers before and after.
2. Memory: flags, a person ledger and callbacks.
3. Arcs with setup, escalation, payoff and two or more resolutions.
4. Hidden traits, revealed in play.
5. Build depth: archetype evolution, badges, signature move, position change.
6. Relationship web with meters and memory.
7. Living league: dynasties, award races with real competition, league events.
8. Off-court life systems: money, ventures, family, media.
9. Goals, legacy score, GOAT ladder, Hall probability, records watch, timeline.
10. Media layer: feed, headlines, debate segments, nicknames.

## Phase D. Routes, storylines, outcomes

Content in the order that adds the most variety per event written:
origins, routes to the pros, pro routes, arcs by stage, endings and
epilogues, the recurring cast, the legend layer (with its off switch).
Targets (250+ events, 40+ arcs, 15+ routes, 30+ endings, 20+ legend events,
overlap under 50%) are asserted by the simulator, not counted by hand.

## Phase E. Replay and sharing

The Vault, career archive and written career story, family tree and legacy
careers, difficulty tiers, challenge careers, a daily seeded career,
share cards. Leaderboard UI is built against the existing Career board; the
new boards wait for Phase G.

## Phase F. Polish

Every screen and state on three sizes against DESIGN.md; empty, loading and
error states; a read of every string for voice, typos and continuity.

---

## Phase G. Database (last)

Every migration in one place at the end: challenge and Vault leaderboards,
anything the story engine wants on the server. SQL files, tests against a real
Postgres, preflight rows, and a hand deployment.

## Commits

One commit per numbered step where it stands alone, one per phase at least,
each with the suites green. No phase is marked done with a known failure.

## Where the wishlist and the code disagree

See AUDIT.md section 11. The short version, for your decision:

1. Real players and real coaches are currently the subject of drama events.
   That has to change before anything else is written. Phase 0, step 2.
2. "Sprite sheets over many images": the game has no sprite images at all.
   Every figure is painted procedurally and cached as a data URL. I propose
   keeping that for the new pixel art too (zero network, one grid), rather than
   adding sheet files.
3. Self-hosting fonts adds files to the repo. Your call.
4. Leaderboards by challenge and Vault completion need a database migration:
   moved to Phase G, at the end.
5. Sound: approved together with real animated cutscenes; synthesized with
   WebAudio, so no audio files.
6. "Playing alongside your own son" inside one career needs a son born by
   about 22 and the player still active near 40. It is possible but rare, so it
   lives in the legend layer, and the family tree in Phase E is the main
   route to playing as your son.
