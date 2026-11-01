# 4th and What

A game and a coaching tool, laid out on the owner's template (2026-10-31):
**Play** (any down, distance and spot, against a defense that picks its call
every snap), the **Studio** (draw a play, or build it from the route and
concept libraries), **Learn** (a position at a time, with a quiz),
**Playbooks** (plays kept on your Run The Games account, named in your own
terminology), **Test vs Defense** (every defense, many snaps each) and
**Print** (cards with backs, call sheets by situation, wristbands, scout
cards, practice scripts, install packets).

**Served and unlisted until the owner puts it live.** Anyone handed
runthe.gg/4th-and-what can play it; nothing on the site links to it, it is
noindexed and off the sitemap and the newsletter list. `check-posture.mjs`
holds all of that, and launching is a deliberate edit to it.

**The long form is in the knowledge base** (`sellybros711/runthe-gg-kb`,
`games/4th-and-what/`): the rules, the sim, the completion and run formulas,
the defensive calls, the look, and the owner's decisions. Read
`4th-and-what-overview.md` there first. This file is only the map.

## Where things are

| | |
|---|---|
| `config.js` | the SCENARIO (distance, spot, roster) and every tuning number, commented. Start here |
| `formations.js` | the five sets, and the defense each one draws (and its box count) |
| `engine.js` | the play, simulated: a pure function of scenario, play and seed. No DOM, no clock, no Math.random |
| `rng.js` | mulberry32 off the seed |
| `routes.js` | the route library (a route at a depth for any player) and the concept library (Mesh, Smash, Snag, Inside Zone and the rest) |
| `turf.js` | the field from above on turf, the play, the defense and its coverage, and the engine's frames. Every screen draws with it |
| `rig.js` | the players, traced from a small 3D model and painted by PXHD (Watch in 3D) |
| `stage.js` | the stadium and the perspective camera, with Putt Putt's console pass |
| `play.js` | Watch in 3D: the play in the stadium, with slow motion and captions |
| `home.js` | Home's banner: a package of hundreds of plays (every concept, formation, side and jet motion) run by the engine, rotating |
| `flow.js` | Play, the video game: 4th and what?, draw it (the Studio in game mode), snap it in 3D, the result card and its Save card |
| `app.js` | the shell: the six views, the situation, the Studio's draft, the account, the save box |
| `studio.js` | the Coach Studio: Move, Route, Block, Run, Read, Motion, Erase, the players panel, the card, flip |
| `game.js` | the breakdown: a snap on turf, the coverage, the timeline, the result and why |
| `library.js` | Playbooks: the books, the play cards, sections, terminology, the file |
| `learn.js` | Learn: Learn, Practice, Quiz and Master for one position |
| `testview.js` | Test vs Defense |
| `printview.js` | Print: presets, every export option, the live preview |
| `share.js` | the share line |
| `names.js` | the coach's terminology, and the name it gives a play (route, concept, formation and run words) |
| `book.js` | playbooks on the account (the shared cloud saves, game `fourth_and_what`), play numbers, situations, the playbook file |
| `cards.js` | the back of a play card (a line a player, the QB's reads), the assignment quiz, flip |
| `diagram.js` | a play drawn as a printed coaching diagram, the defense in letters, coverage, depths |
| `export.js` | every export layout and option: cards and backs, call sheets, wristbands, scout cards, scripts, installs |
| `build/tune.mjs` | conversion rate by distance for a sensible playbook, against real 4th downs |
| `build/sheet.mjs` | renders the look for review (players, poses, a phone frame) |
| `test/engine.test.mjs` | the four plays, determinism, the rates |
| `test/playbook.test.mjs` | names from terminology, which rule wins, Test it's calls, the playbook file |
| `test/print.test.mjs` | card backs, the quiz, flip, play numbers, wristband codes, the call sheet's if and then |
| `test/check-browser.mjs` | the whole game in Chromium, phone and desktop |

The painter, PXHD, is not copied here: the page imports `/setlist/pxhd.js`,
the generated copy Segue serves (kept in step with golf by
`scripts/setlist/extract_pxhd.mjs`). Without it the players are flat tokens.

## Scripts

```
node --test 4th-and-what/test/*.test.mjs
node 4th-and-what/test/check-browser.mjs [shots dir]
node 4th-and-what/check-posture.mjs
node 4th-and-what/build/tune.mjs [seeds] [--plays]
node 4th-and-what/build/sheet.mjs [out dir]
```

Add `?seed=N` to the url to replay an exact snap (Play's debug toggle shows
the seed).

## Not built in v1 (TODOs in the code)

Results on the shared board, streaks and trophies, dailies and more scenarios,
sharing a playbook by link, real players or teams, penalties,
audibles, motion, kicks, a game clock, sound, money, ads.
