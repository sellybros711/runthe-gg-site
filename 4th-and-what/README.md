# 4th and What

A single play. You are the coach on 4th down and you are going for it: pick
the distance, draw the play on the clipboard, snap it, watch your players run
exactly what you drew against a defense that picks its call every snap.

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
| `clipboard.js` | the whiteboard: the four tools, hold to move, undo, clear. Pointer events |
| `rig.js` | the players, traced from a small 3D model and painted by PXHD |
| `stage.js` | the stadium and the perspective camera, with Putt Putt's console pass |
| `play.js` | the play, drawn from the engine's frames, with slow motion and captions |
| `ui.js`, `share.js` | the screens, the result, the share line |
| `build/tune.mjs` | conversion rate by distance for a sensible playbook, against real 4th downs |
| `build/sheet.mjs` | renders the look for review (players, poses, a phone frame) |
| `test/engine.test.mjs` | the four plays, determinism, the rates |
| `test/check-browser.mjs` | the whole game in Chromium, phone and desktop |

The painter, PXHD, is not copied here: the page imports `/setlist/pxhd.js`,
the generated copy Segue serves (kept in step with golf by
`scripts/setlist/extract_pxhd.mjs`). Without it the players are flat tokens.

## Scripts

```
node --test 4th-and-what/test/engine.test.mjs
node 4th-and-what/test/check-browser.mjs [shots dir]
node 4th-and-what/check-posture.mjs
node 4th-and-what/build/tune.mjs [seeds] [--plays]
node 4th-and-what/build/sheet.mjs [out dir]
```

Add `?seed=N` to the url to replay an exact snap (the result's debug toggle
shows the seed).

## Not built in v1 (TODOs in the code)

Account integration beyond the sign in the shell gives (board, streaks,
trophies), dailies and more scenarios, real players or teams, penalties,
audibles, motion, kicks, a game clock, sound, money, ads.
