# Last Shot (testers only)

One possession. You are the coach. It starts in a timeout with a blank clipboard: draw a play,
Run It, and your five run exactly what you drew with 22.0 on the clock, down 1. Score in the last
4.9 to win. Score earlier and they get the ball back.

**Nobody but testers can see it.** The page and its browser modules are served by
`functions/last-shot/[[path]].js` to a row in `stumpire_testers` (the one tester list), never as
static files. Everybody else gets the site's 404 page, exactly as Stumpire answers them. It is in no
nav, sitemap, home page or newsletter list, and its share line links `/arcade/`. A tester signs in
at `/arcade/` first (that sets the signed page cookie), then opens `/last-shot`.

**The notes are in the vault** (`sellybros711/runthe-gg-kb`): `games/last-shot/last-shot-overview.md`
starts there, with the rules, the sim, the shot quality formula and the defensive schemes. How the
gate works for every tester game is `platform/platform-tester-gate.md`.

## My Playbooks

Home has two parts: **Play the scenario** (the game) and **My Playbooks** (needs a Run The Games
account). A playbook play is drawn as a **storyboard**: Next frame opens a frame where everyone
ended, earlier frames show faintly, Play frame runs just that frame. Frames are presentation only:
the sim never reads them. Plays are named from the coach's terminology, tested against every
defense (switch, fight over, go under; zones come next), and printed as frames side by side.
Storage is the shared cloud saves (`/assets/cloudsave.js`, game `last_shot`), no new table.

## Where things are

| | |
|---|---|
| `scenario.js` | the one scenario object: score, clock, rosters, every tuning number. Start here |
| `playbook.js` | the play format, the order rule, screen names, what makes a play illegal |
| `sim.js` | the possession as a pure fixed-step sim (60 Hz, no DOM, no Math.random) |
| `motion.js`, `defense.js`, `shot.js` | how bodies move; man to man and the three screen schemes; shot quality |
| `board.js` | the clipboard: Move, Screen, Pass, Shoot, Undo, Clear, Run It (pointer events) |
| `court.js`, `view.js` | the live court, drawn with Run The Floor's rig (`/hoops/baller.js`, read only) |
| `client.js`, `share.js` | home, the page flow, the result and the share line |
| `book.js`, `book-ui.js` | playbooks: the model, the store (local first, cloud behind), the file; the screens |
| `names.js` | the terminology: names from the set and the actions, in the coach's words |
| `testit.js` | Test it: every defense, forced after the roll, the same every time |
| `diagram.js`, `export.js` | a play drawn the way a coach prints it; every print and export option |
| `web/play.html` -> `pages.js` | the page shell and modules as strings, built by `build/pages.mjs` |
| `gate.js`, `db-supabase.js` | who gets in (pure), and the one database question |
| `check-posture.mjs` | tester only, linked from nowhere, the same 404 as Stumpire |

## Scripts

```
node functions/_lastshot/build/pages.mjs          after editing web/play.html or any browser module
node functions/_lastshot/build/dev-server.mjs     local play at /last-shot (?as=nobody for the 404)
node --test functions/_lastshot/test/*.test.mjs   the gate beside Stumpire's, the sim, the three test plays
node functions/_lastshot/check-posture.mjs
node functions/_lastshot/test/check-browser.mjs   a whole play on a phone in Chromium
node functions/_lastshot/test/check-playbook.mjs  the storyboard and My Playbooks, phone and desktop, cloud in memory
```

The seed for any result is behind **Seed** on the result screen. The same seed and the same play
always give the same result.
