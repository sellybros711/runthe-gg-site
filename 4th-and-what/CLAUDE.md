# 4th and What: the rules a change must keep

The why behind each rule is in the knowledge base, `games/4th-and-what/` (start at
`4th-and-what-overview.md`). The site rules in the root `CLAUDE.md` apply too.

- **Unlisted until launch.** No link, nav entry, home page tile, sitemap entry or newsletter
  listing, and the page stays noindexed with no ad tag. `node 4th-and-what/check-posture.mjs`.
  Launching is one deliberate commit that flips `INDEXED` and `LINKED` in that file.
- **The sim is pure and deterministic.** `engine.js`, `formations.js`, `config.js` and `rng.js`
  read no clock, no DOM and no `Math.random`, and decide with `+ - * /` and `sqrt` only (no
  `Math.pow`, `exp`, `sin`; `atan2` only turns a velocity into the picture's heading). Same seed, same play,
  same result on every device.
- **Players run exactly what was drawn.** The engine may decide when the QB throws, never where a
  receiver goes.
- **Every number in copy comes from the engine** (the distance, the yards, the spot, the pocket
  time). Write the sentence without the number otherwise.
- **A retune is three things:** the change in `config.js`, `node 4th-and-what/build/tune.mjs 300`,
  and the new rates in the vault's `4th-and-what-formulas.md`. The engine test holds the rates
  within a band of real 4th down conversion.
- **No guide opens by itself.** How it works is behind the `?` button.
- **PXHD is borrowed, not copied** (`/setlist/pxhd.js`). Do not edit it from here; a change it
  needs goes to the agent that owns it.
- **Sibling scripts carry `?v=`**: bump it and run `node scripts/check-cachebust.mjs --update`.
- Never edit another game's files from here.
