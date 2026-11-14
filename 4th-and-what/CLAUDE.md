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
  Defense, Print, on turf. The page opens on Home (the owner, 2026-11-01): the 4TH & WHAT banner over hundreds of plays rotating, which is the way into the daily: a card in its bottom right corner says the day's down, spot, teams and clock (the owner, 2026-11-06), never what really happened, "Draw a play", "Playbook Builder" and "Daily Defense", then the site footer. **Play is the video game** (the owner, 2026-10-31): 4th and what? (since 2026-11-06 the owner's mockup: a night stadium, the field strip to spot the ball, a tile picks the distance, Play now goes), Call it (since 2026-11-13: the defense lines up and shows its look, three cards and Draw your own), snap it in the 3D stadium, then the result card (Run it back, Save play, Save card, the breakdown). Keep Play a game first. The Studio (since 2026-11-06, the owner's mockup) is the same night stadium: the play's setup in the command deck (formation, name, tag, star, save, level and hash), a searchable library, the tools above the glowing field (the owner, 2026-11-06), and one dock under it for field view, Save to playbook, Test vs Defense and Run play. Watch in 3D keeps the pixel stadium. Share sends a video of the snap (`clip.js`, the owner 2026-11-06): it is recorded behind the result card, so the tap can hand the phone the file, and a browser that cannot record shares the line alone. Teams, team codes and player
  tracking are the next build, with their own SQL.
- **The daily is one real NFL 4th down a day** (the owner, 2026-11-01). `daily.js` picks it from
  `data/fourths.json` (built by `build/fourths.mjs` from nflverse play-by-play, CC-BY 4.0, credited
  on the page) on the Eastern day, the same for everybody. Every fact on its card is a field of
  that row; never type one by hand. Its intro is a big moment (the owner, 2026-11-06): the night
  stadium, the scoreboard, the down, the stakes, the ball on a strip of field, a glowing gold button. Make the call opens Call it (since 2026-11-13) with the day's look and the day's hand, the same for everybody; Draw your own is a card. The streak shows for everybody: the server's when signed in, else the device's days in a row (`streakOf`). The first snap is the day's, against the day's seed; every
  snap after it is practice and never posted. Save play stays on the card. The server is
  `supabase/162_fourth_and_what_daily.sql` (one row a player a day, the first post stands). Rebuild
  the data after a season and bump `fourths.json`'s `?v=` in `daily.js`. Never reshuffle the order
  once it is live: the day's play would change under people mid-streak.
- **Daily Defense is the engine's answer** (the owner, 2026-11-01: "It shows you a play and you
  pick what defense you think covers it the best"). `trivia.js`: one play a day from the concept
  pool at a distance from `data/defense.json` (built by `build/trivia.mjs`: only days with one or
  two clearly best calls). Your pick locks; then the play is snapped 100 times against each call
  with the day's seeds, and the fewest first downs given up is the best call. Never type an
  answer by hand. Never reorder live days. Kept on the device, no server.
- **Levels: High School, College, NFL** (the owner, 2026-11-01). `config.js` `LEVELS`: each is a
  patch on the NFL tuning (speeds, the QB's arm and accuracy, how fast the defense reads and
  closes, hands, tackling) plus its real hash marks. `SC.level` and `SC.hash` pick it; the engine
  plays it and `res.level` says which. Play has a Level and Hash picker (the level is kept on the
  device); a playbook has a level that Run it and Test use. A play's NFL numbers stay in `stats`,
  the others in `statsBy[level]` (`B.statsOf`). The daily 4th down and Daily Defense are always the
  NFL from the middle. The NFL patch is empty: never retune the NFL through a level. High school
  and college are sensible ranges, not exact data; say so in copy that quotes them.
- **The look is the snap** (the owner, 2026-11-13: play cards and a pre-snap read). The snap's seed is
  fixed before the snap (`FAW_FLOW.pending()`), and Call it and the draw screen show
  `FAW_ENGINE.look()` with it: the defense lined up and its shell, never the call or the blitz. The
  coverage is the first roll, the defense aligns to show it (`config.js` `shell`: two deep for cover 2,
  one deep for 1 and 3, nobody deep for 0), and a `shell.disguise` share of snaps shows another and
  rotates after the snap. The disguise and the hand (`calls.js` `deal`) each roll on their own stream
  off the seed, so they never move the play's dice. A run, a quick pass and a shot, never a run from
  Empty, a sneak only at 1 or 2.
- **Go For It is the main mode** (the owner, 2026-11-13). `goforit.js`: a run of 4th downs at the NFL
  from the middle, each through Call it with the run's own seed. Convert and go again from the spot,
  the distance by `LADDER` (how many converted); a touchdown restarts from your own 25; a stop is a
  new possession from your own 35; an interception costs `PICK` (2) stops. `STOPS` (3) stops end the run (the plan said one; measured, one
  stop ended 58% of runs on the first snap). The run and its next seed are kept on the device, so a
  reload resumes the same down against the same look. The best run is kept on the device too.
  **Today's run** (Phase 2): snap k of the day's run is seeded from the Eastern day and k (`dailySeed`), the
  same for everybody; the first run of the day that ends is posted (`supabase/169`, the first post
  stands) and the board shows on the card. Practice (any down, spot, level and hash) is the second button. A player's very first Go For It snap
  gets `calls.js` `FIRST` (QB Sneak, Stick, Levels: all two thirds or better at 4th and 1); the hand,
  never the snap.
- **Your record and the moments** (the launch plan, Phase 2). `profile.js`, on the device (`faw_profile`):
  snaps, conversions, the longest 4th down converted, the best run, the signature play, and eight
  football moments, each earned once and read straight off the engine's result. No currencies, no pay
  to win, nothing locked behind them.
- **The feel** (the owner, 2026-11-13: sound on by default, with mute). `feel.js` makes every sound with
  Web Audio (nothing to download) and starts on the Snap it tap; `faw_sound` keeps the choice. The 3D
  picture zooms and slides to follow the ball (`play.js`, `ui.zoom`), never past an edge. A spot within
  a yard of the sticks hides its caption for the measurement. The stamp's margin is the engine's spot
  against the line to gain (`A.marginText`). Presentation only: nothing here touches the sim.
- **Only Move moves a player** (the owner, 2026-10-31). No other tool, and no long press, ever
  changes where a man lines up.
- **A run is what was drawn** (the owner, 2026-11-01: "i ran a run play and the play didn't
  take place"). With Run, a drag from any player gives him the ball and the drag is his path; no
  QB tap first. The ball changes hands where the QB meets him (the mesh), or is pitched when the
  path takes him away. The carrier runs the path to its end, then the open field. Runs have their
  own tackle numbers (`runBroken`, `drive`) so they gain like real runs.
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
- **Any down, distance, spot, level and hash** in Play. 4th and 5 on the opponent's 40, the NFL, the
  middle of the field stays the default.
- **Test it forces each call** (`run(..., { call })`), still rolling the call first so the dice
  after it fall the same way. Results are stored per distance and flagged when the play changes.
- **Always dark** (the owner, 2026-11-06: "make the whole game dark"). No light theme and no theme
  button; the page ignores the suite's shared `runthegrid_theme` and never writes it.
- **No guide opens by itself.** How it works is behind the `?` button.
- **PXHD is borrowed, not copied** (`/setlist/pxhd.js`). Do not edit it from here; a change it
  needs goes to the agent that owns it.
- **Sibling scripts carry `?v=`**: bump it and run `node scripts/check-cachebust.mjs --update`.
- Never edit another game's files from here.
