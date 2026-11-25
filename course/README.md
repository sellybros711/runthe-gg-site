# Run The Course (unlisted)

A golf course tycoon you play as a character on the property. You take over a run-down 3-hole
municipal course: mow the greens at dawn, check groups in at the counter, send them off tee 1, and
stand on a floor pad to spend cash. Golfers are simulated shot by shot on the holes. This is phase 1:
one playable shift, grey box. The whole game it grows into is in the knowledge base.

**Unlisted until launch** (the owner, 2026-11-25): a plain public folder at `runthe.gg/course`, no
tester gate, noindexed, linked from nowhere, off the home page and the newsletter list.
`check-posture.mjs` holds that. Launching is one deliberate commit that flips two flags in that file.

**The notes are in the vault** (`sellybros711/runthe-gg-kb`): start at `games/course/course-overview.md`.

## How it is built

| | |
|---|---|
| `config.js` | every number the game plays (shift, golfers, economy, stars, the shot model). Start here. Nothing else holds a tuning number |
| `map.js` | the property, laid out for 18 holes from day one: holes 1 to 3 open, 4 to 9 as locked plots, the back nine tract across the road |
| `rng.js` | the seeded generator and the only maths the sim may use (`+ - * /` and `sqrt`, a summed-uniform normal, headings from a table) |
| `shot.js` | the shot model, and `playRounds()`: N rounds for a skill on a course with nobody there |
| `sim.js` | the simulation: one state object on a fixed tick, a command queue, the route graph, the watchdog, the economy, `replay()`, the goal line |
| `bot.js` | a player who only follows the goal line. The headless script, the tests and the browser check drive shifts with it |
| `render.js` | the renderer. three.js lives behind this one file: one static mesh, instanced golfers, no allocation in `draw()` |
| `models/`, `build/models.mjs` | the art: five packs of Kenney's CC0 models (trees, cars, buildings, golf pieces, animated people), and the script that packs them from the kits. The game starts on coded shapes and swaps to the models when they land |
| `input.js` | one thumb: drag for a joystick, tap to travel, WASD |
| `store.js` | where a course is kept: the device first, the account when signed in, a guest's shifts claimed on sign in |
| `analytics.js` | first party events to `/api/course/e`, off in the EU, the UK and Switzerland, inert under a browser driver |
| `main.js`, `index.html` | the loop, the HUD, the results card, the menu, the debug tools (`?debug`) |
| `functions/_course/`, `functions/api/course/[[path]].js` | the save route: who is asking, the replay, the database, the events |
| `supabase/187_course.sql` | the course on the server. Only the service role reads or writes it |

## The rules the code keeps

- **The sim is pure and deterministic.** Same seed, config and command log give the same shift in
  Node, on the server and in every browser. It reads no clock and no DOM, and never calls
  `Math.random`, `sin`, `cos`, `pow`, `exp`, `log` or `hypot` (engines can disagree in the last bit).
- **Every input is a command** (`dir`, `goto`, `exit`), stamped with its tick. Nothing else changes state.
- **Golfers walk a graph made from the hole list.** A group holds a tee until the hole ahead is
  clear. A watchdog moves on any group that has not advanced in `shift.watchdogS` and counts it.
- **The server owns a signed in course.** The page files a shift's command log once, when the shift
  ends. The server re-runs it with this same `sim.js` and keeps its own numbers. Nothing is sent on a
  timer, a frame or a poll. A day played with a debug tool is never saved.
- **A guest plays on the device.** Unfiled shifts are kept in order (up to 30) and filed after sign
  in when the account has no course yet. An account that already has a course keeps it.
- **No guide opens by itself.** The goal line is part of the HUD. How it works is behind a button.

## Scripts

```
node course/test/serve.mjs                    play locally at http://localhost:8788/course/ (?debug for the tools)
node --test course/test/*.test.mjs            shot model, routing, economy, save and load, the save route
node course/headless.mjs --shifts 20          twenty shifts with no renderer; exits 1 on a stuck group
node course/check-posture.mjs                 unlisted, linked from nowhere
node course/test/check-browser.mjs            a whole shift at 390x844 and 1440x900 in Chromium
node scripts/check-dashes.mjs course functions/_course functions/api/course
```

A change to any module here is the edit, its `?v=` bump in every file that imports it, and
`node scripts/check-cachebust.mjs --update`, in one commit. Bump `CONFIG.version` when a number changes.
