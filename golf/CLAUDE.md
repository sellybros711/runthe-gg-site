# Run The Tour and Putt Putt Tour

The repo-wide rules are in the root CLAUDE.md. This file holds only what a change to `golf/` must
obey. The why, the history and the full design live in the knowledge base.

## The knowledge base

`sellybros711/runthe-gg-kb`, folder `games/golf/`. Start at `golf-overview.md`, and read
`golf-owner-rulings.md` before designing anything. In a cloud session it is cloned at
`/home/user/runthe-gg-kb`. If it is not there, attach it (add_repo) before a design task. A small
fix that only touches code can go ahead without it.

| task | read |
|---|---|
| a new hole, par, stars, aces, the solver | `golf-putt-hole-design.md` |
| a new world | `golf-putt-worlds.md` |
| stars, lives, members, guests, the daily | `golf-putt-progression.md` |
| saves, sync, server lives | `golf-putt-accounts.md` |
| trails, chests, puzzles, finds, putters | `golf-putt-trails.md`, `golf-putt-trail-loot.md` |
| drawing holes and trails, render speed | `golf-putt-rendering.md` |
| the tracer, the 3D golfer | `golf-tour-tracer.md`, `golf-tour-golfer3d.md` |
| coins, packs, shards, items, boosts, ratings past 99 | `golf-tour-economy.md` (the Golf Economy Agent's) |

After a meaningful change, update the matching note by pull request on the knowledge base. Decisions
there are append-only: a changed decision is a new dated note that supersedes the old one.

## Commands

```
node golf/putt/check-putt.mjs               physics, real greens, both tours replayed under par, dailies, the page
node golf/putt/check-putt.mjs --quick       physics, the real greens and the page
node golf/putt/solve.mjs --tour main        search every hole for the par it should carry (the best part of an hour)
node golf/putt/solve.mjs --tour members --only 3,7 --write    re-solve edited holes and record their routes
node golf/putt/ace.mjs <tour> <n>           build an ace for one hole, then verify it with robust()
node golf/putt/fair.mjs --tour main         how often each hole's route goes wet or out with a person's error
node golf/putt/build-cards.mjs              re-cut the home cards from the signature holes (then bump CARD_V)
node golf/check-golfer3d.mjs                every look, every aim, every shot (server on :8099)
node golf/check-tracer3d.mjs                every course draws, nothing the ball rests on moves (server on :8099)
node golf/check-boosts.mjs                  every boost from item to golfer, sim and screen; the frozen baseline (server on :8099)
node golf/econ-sim.mjs                      a casual, regular and heavy player through a season, then their wins
```

## Rules a change here must keep

**Holes**

- Every hole has an obstacle, a puzzle or a moving part. Par climbs world by world. A new world carries
  more set pieces a hole than the one before it. check-putt asserts all three.
- **There are no tunnels.** check-putt fails on one.
- Par is the solver's: the obvious route plus one, never under 3. Change a hole and run
  `solve.mjs --only N --write`, then write the par it prints into `LEVELS`. CI only replays `routes.json`.
- Three stars is two under par, or a `three` that is exactly par minus one. It must be makeable.
- Moving `PACE` re-times every moving hole: re-solve all of them with `--write`.
- Routes are recorded at full precision. Never round them.
- A Hallows Night hole has at most two moving or wet pieces and par 3 (the signature 4).
- Every hole stays under 34% wet or out in `fair.mjs`, and each tour's mean under 10%.
- **A ball never comes to rest on a ferry.** A deck pulls away gently and stops hard, so the ball is put
  ashore; a ferry hole's deck overlaps the land at each dock and its channel is walled on its long sides.
- **A skin name is global.** A second `snowman` in `SKIN` silently replaces the first everywhere.
- Never put a real course name on screen.

**A new world, all in one commit**

| where | what |
|---|---|
| `putt.js` | a `THEMES` entry, its skins in `SKIN`, a `GLOW`, the `WORLDS` row, 18 `LEVELS`, 18 `TOUR_NAMES`, the `.wm-`, `.wt-` and `data-wt` CSS, `CARD_ART`, a `sigReward`/`worldReward` |
| `land.js`, `mapland.js` | `BUILD.<theme>`, `PAL` and `WORLD.<theme>` |
| `trail.js` | a `KIT`, its `LIFE`, a `BUILD` for each new landmark with its `LMSIZE` |
| `putt.js` again | a `GREETERS` host, three `TRINKETS` and a `TRINKET_COL`, a `DOOR_NAMES` entry and its CSS |
| `build-cards.mjs` | the signature hole the home card is cut from |
| `build-home-plates.mjs <theme>` | the First Tee's picture of the world, then its theme in `FT_PLATES` and a bump of `FT_PLATE_V` |
| `routes.json` | `solve.mjs --tour main --only <the 18> --write`, then each `par` set to what it prints |

**Code**

- **Every file is inside one function wrapper and publishes one global.** A bare top level `render()` in
  `hole3d.js` once replaced the site's own painter and froze the whole site.
- Every unlock check goes through `opened()`, never `tp.lv` directly.
- `pmerge` only adds, and every server call fails soft (null is no opinion).
- `PUTT_LIVE` is the launch. There is no localStorage override, on purpose.
- **The First Tee home rides the same switch.** `ftLive()` is `puttOn()`: Putt Putt testers (and everybody once
  `PUTT_LIVE` is true) get the First Tee, its hubs (`protour`, `putthub`, `me`) and five tabs; everybody else gets
  the classic home (`scrTitleClassic`, the seven tabs, `tourStepsClassic`, `maybeLoginBonusClassic`). Change the
  classic home only for a fix: it is retired at launch. The closet (`setup` with `setupEdit`) wears the Me
  page's dressing room on the same switch (`ftClosetOn`, `body.ftcloset`); a new career's setup does not.
- The login gift on the First Tee waits to be claimed (`bag_login_pend`, `claimLoginGift`). Never pay it on sight there.
- **No guide or tour opens by itself** on the First Tee either: its guided tour starts from How to play only.
- `putt_lives_refill` carries its own copy of `PUTT_TESTERS`: keep the two lists in step.
- **A heart is three lives**: 9, or 18 with a Tour Pass, and every lost life comes back 24 hours after it went
  (`146_putt_lives_nine.sql`, `st.back`). Deploy 146 before the page that reads `back_at`.
- **A spare life fills a heart** whenever the hearts are below the max (`spareFill`). Signed in, only the server
  fills it (`putt_lives_spare`, `150_putt_lives_spares.sql`, keyed by the spare's id), cancelling the clock due
  back last. Deploy 150 before the page. Its SQL test runs in `putt-check.yml`.
- **Paid lives** (nine for $4.99, three for $2.99, `PUTT_LIVES_ENABLED`) sell through the site's own checkout, not
  `create-checkout`. The Store Agent owns them. They sell at any time and can go over the max: the extras are
  `putt_lives.extra` (151), lost before a heart, drawn as a red +N. The buttons are on the Out of Lives sheet, the
  Over par card and the Lives sheet the hearts open (`buyRow`, `wireBuy`, `livesSheet`). The switch, `LIVES_BUY`,
  `LIVES_EXTRA_MAX` and the server's `PUTT_LIVES` move together: `node scripts/stripe/check-putt-lives.mjs`.
  **Re-running 146 after 151 undoes 151.**
- `LIGHT` in `hole3d.js` is copied from PXHD: change one and change both.
- **When the picture changes, bump the `?v=` of putt.js, trail.js or hole3d.js**, or a returning player
  sees the old cached trail. A renderer speedup must match the old render pixel for pixel: hash the
  pixels and the depth buffer before and after.
- `consolePass` never writes pure black. check-tracer3d refuses it.
- A screen claims the full screen tracer only through `hvFullSet(mode)`. Change a chip's height and
  change its row in `HV_FULL_SIZE`.
- `G3D_LIVE = false` is the 3D golfer's kill switch.
- **ICON is the tier for an overall of 100 and up** (`ovrIcon`, `ovrTier`): the player's own career golfer only, on the
  First Tee switch. `check-boosts.mjs` holds it. Never give it to world golfers or the Daily.
- **The 3D menu golfer** (`RTT_G3D.pic`, `g3dPic` in index.html) draws the golfer and the hat, glasses, club and
  cleat tiles in the menus. It rides the First Tee switch (`g3dMenuOn` asks `ftLive()`), and anything it cannot
  draw falls back to today's picture. Every menu change in `golfer3d.js` runs only while `MO` is set: the course
  golfer must stay the same pixel for pixel (hash its frames before and after).
- **One golfer in every mode.** A mode draws your golfer through `modeLook(look, kind)`: the equipped putter on
  every green and walk, and the career's age stamped on. An aura shows wherever the golfer is drawn (the
  `hvsw-glow` pulse, `host.aura()` on a canvas). `check-golfer3d.mjs` section 4 holds all of it.

**Economy**

- **A boost in `golf/boosts-baseline.json` is never lowered, removed, moved or re-statted** (the owner,
  2026-10-16). New boosts are added; check-boosts fails on the rest. Never rewrite the baseline.
- **A new item gets the power its rarity buys** (the ladder in `golf-tour-economy.md`), on its slot's
  stats. A Tour Pass piece, a colour, a pattern or a free item carries none.
- **A career stat and overall may pass 99.** Never clamp the player's golfer back to 99 outside the
  Daily. A screen that shows a rating shows `buildPlayer()`'s, in three digits that fit.
- **Run check-boosts and econ-sim before and after** any change to an item, a price, a pack or a boost.

