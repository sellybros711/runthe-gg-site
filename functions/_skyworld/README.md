# The Sky World (testers only)

Every game we have built, as a floating island in the sky, and every agent working on them. Owned by
the Sky World Agent. Its spec and design are in the knowledge base: `agents/sky-world/`.

**It is visible to nobody but testers** (any row in `stumpire_testers`). `/skyworld/` serves a sign in
screen that names nothing. Everything past it, the world's code and its data, answers a non-tester
exactly as Stumpire does: the site's 404 page, or `{"error":"not_found"}`, status 404.

## Where things are

| | |
|---|---|
| `../skyworld/[[path]].js` | the Pages Function: the sign in screen, `/skyworld/api/*`, `/skyworld/m/*` |
| `api.js`, `db.js` | the API and the tester check (the role read with the service role, never `stumpire_access()`) |
| `discover.js` | every game, its status and its files, from GitHub. Never a hand kept list |
| `layers.js` | which district a file belongs to |
| `kinds.js` | which landmark an island gets |
| `github.js`, `world.js` | the GitHub source and the cached world model (ten minutes) |
| `web/shell.html` | the sign in screen |
| `web/m/*.js` | the browser modules, classic scripts sharing `window.SKY_W`. `MODULE_FILES` in `build/pages.mjs` is the one list and its order; `boot.js` loads the rest from it |
| | `noise.js` the hash and noise · `landmarks.js` each island's landmark · `ui.js` the chrome · `status.js` each status's name, colour and look |
| | `layout.js` where everything is, and the scenes · `land.js` the ground · `props.js` what stands on it · `paint.js` the pictures and IndexedDB |
| | `camera.js` · `input.js` · `world.js` drawing, the frame loop, going in and out, the start · `ideas.js` the Advisor's ideas |
| `pages.js` | generated from `web/` by `build/pages.mjs`; never edit it by hand |

The islands are painted by Putt Putt's renderer (`golf/putt/hole3d.js`), owned by the Golf Course
Agent and loaded read only at the versions `golf/index.html` loads, so a Golf release needs no change
here. If its `API_VERSION` moves, the world draws a flat map and says so.

## Env

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE`, `SUPABASE_ANON` (already set for the tester games) and
`SKY_GITHUB_TOKEN`: a fine grained GitHub token, read only, on `runthe-gg-site` and `runthe-gg-kb`.

## Checks

```
node functions/_skyworld/build/pages.mjs          after editing web/
node --test functions/_skyworld/test/*.test.mjs
node functions/_skyworld/check-posture.mjs
```
