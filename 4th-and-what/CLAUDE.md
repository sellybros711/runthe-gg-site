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
  receiver goes. The route and concept libraries (`routes.js`) only make drawn points.
- **The layout is the owner's template** (2026-10-31): Play, Studio, Learn, Playbooks, Test vs
  Defense, Print, on turf. Watch in 3D keeps the pixel stadium. Teams, team codes and player
  tracking are the next build, with their own SQL.
- **Only Move moves a player** (the owner, 2026-10-31). No other tool, and no long press, ever
  changes where a man lines up.
- **Reads are ordered, up to three** (`play.targets`). The QB goes through them in order; the last
  one is the checkdown when the pocket goes.
- **Every number in copy comes from the engine** (the distance, the yards, the spot, the pocket
  time). Write the sentence without the number otherwise.
- **A retune is three things:** the change in `config.js`, `node 4th-and-what/build/tune.mjs 300`,
  and the new rates in the vault's `4th-and-what-formulas.md`. The engine test holds the rates
  within a band of real 4th down conversion.
- **Playbooks need a Run The Games account** (the owner's call, 2026-10-30). They live in the
  shared cloud saves (`ps_saves`, game `fourth_and_what`: slot `index` and one `b-<id>` a book),
  with a local copy for speed. No new table. `assets/cloudsave.js` signs in through the arcade's
  `RTG_AUTH`; it is shared by five games, so a change to it bumps its `?v=` on every page.
- **A name typed by hand is never changed.** Rules rename only plays whose name was never edited
  (`nameEdited`). Concepts beat single route words; the most exact route rule wins.
- **Any down, distance and spot** in Play. 4th and 5 on the opponent's 40 stays the default.
- **Test it forces each call** (`run(..., { call })`), still rolling the call first so the dice
  after it fall the same way. Results are stored per distance and flagged when the play changes.
- **No guide opens by itself.** How it works is behind the `?` button.
- **PXHD is borrowed, not copied** (`/setlist/pxhd.js`). Do not edit it from here; a change it
  needs goes to the agent that owns it.
- **Sibling scripts carry `?v=`**: bump it and run `node scripts/check-cachebust.mjs --update`.
- Never edit another game's files from here.
