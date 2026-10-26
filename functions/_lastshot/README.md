# Last Shot (unlisted preview)

One possession. You are the coach. It starts in a timeout with a blank clipboard: draw a play,
Run It, and your five run exactly what you drew with 22.0 on the clock, down 1. Score in the last
4.9 to win. Score earlier and they get the ball back.

**Anybody with the link can play it at `/last-shot`; nobody is pointed at it.** It was tester-only
until the owner opened it on 2026-10-26. It is still unlisted: the page is noindexed, and it is in no
nav, sitemap, home page or newsletter list. Its share line links `/arcade/`. The page and its browser
modules are served by `functions/last-shot/[[path]].js` from `pages.js`, never as static files.
Launching it is a deliberate edit to `check-posture.mjs`.

**The notes are in the vault** (`sellybros711/runthe-gg-kb`): `games/last-shot/last-shot-overview.md`
starts there, with the rules, the sim, the shot quality formula and the defensive schemes.

## Where things are

| | |
|---|---|
| `scenario.js` | the one scenario object: score, clock, rosters, every tuning number. Start here |
| `playbook.js` | the play format, the order rule, screen names, what makes a play illegal |
| `sim.js` | the possession as a pure fixed-step sim (60 Hz, no DOM, no Math.random) |
| `motion.js`, `defense.js`, `shot.js` | how bodies move; man to man and the three screen schemes; shot quality |
| `board.js` | the clipboard: Move, Screen, Pass, Shoot, Undo, Clear, Run It (pointer events) |
| `court.js`, `view.js` | the live court, drawn with Run The Floor's rig (`/hoops/baller.js`, read only) |
| `client.js`, `share.js` | the page flow, the result and the share line |
| `web/play.html` -> `pages.js` | the page shell and modules as strings, built by `build/pages.mjs` |
| `serve.js` | what `/last-shot` answers (pure): the page, a module, or nothing |
| `check-posture.mjs` | unlisted: noindexed, linked from nowhere public |

## Scripts

```
node functions/_lastshot/build/pages.mjs          after editing web/play.html or any browser module
node functions/_lastshot/build/dev-server.mjs     local play at /last-shot
node --test functions/_lastshot/test/*.test.mjs   what it serves, the sim, the three test plays
node functions/_lastshot/check-posture.mjs
node functions/_lastshot/test/check-browser.mjs   a whole play on a phone in Chromium
```

The seed for any result is behind **Seed** on the result screen. The same seed and the same play
always give the same result.
