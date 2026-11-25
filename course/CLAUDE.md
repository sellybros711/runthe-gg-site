# Run The Course: the rules a change must keep

The why behind each rule is in the knowledge base, `games/course/` (start at `course-overview.md`).
The site rules in the root `CLAUDE.md` apply too. `course/README.md` says how the game is built.

- **Unlisted until launch** (the owner, 2026-11-25). No link, nav entry, home page tile, sitemap entry,
  `games.json` entry or newsletter listing, and the page stays noindexed with no ad tag.
  `node course/check-posture.mjs`. Launching is one deliberate commit that flips `INDEXED` and
  `LINKED` in that file. The owner launches it, never the agent.
- **The sim is pure and deterministic.** `sim.js`, `shot.js`, `rng.js` and `bot.js` read no clock, no
  DOM and no `Math.random`, and decide with `+ - * /` and `sqrt` only. The server re-runs a filed
  shift with these files, so a change that breaks this breaks every save.
- **Every number is in `config.js`.** A number a player reads is interpolated from it. Bump
  `CONFIG.version` when one changes.
- **The server owns a signed in course.** Cash, stars and unlocks are written only by
  `functions/api/course` with the service role, from its own replay. Never trust a number from the page.
- **Saves send only what changed:** one shift, once, when it ends. No timer, no poll, nothing while
  the tab is hidden. A new database function that rewrites jsonb goes in `scripts/save-writes.json`.
- **No guide opens by itself.** The goal line is part of the HUD.
- **Nothing in `golf/` is changed or loaded.** Money and ads are other agents' work.
- **One phase at a time.** Do not start a later phase without the owner asking.

```
node --test course/test/*.test.mjs
node course/headless.mjs --shifts 20
node course/check-posture.mjs
node course/test/check-browser.mjs
node scripts/check-dashes.mjs course functions/_course functions/api/course
node scripts/check-cachebust.mjs
```
