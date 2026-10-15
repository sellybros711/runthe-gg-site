# MythiBall

The repo-wide rules are in the root CLAUDE.md. This file holds only what a change to `mythiball/`
must obey. The why, the history and the full design live in the knowledge base.

## The knowledge base

`sellybros711/runthe-gg-kb`, folder `games/mythiball/`. Start at `mythiball-overview.md`, which lists
every note, and read `mythiball-owner-rulings.md` before changing how anything looks. In a cloud
session it is cloned at `/home/user/runthe-gg-kb`. If it is not there, attach it (add_repo) before a
design task. A small fix that only touches code can go ahead without it.

| task | read |
|---|---|
| the characters and sprites | `mythiball-sprites-*.md`, `mythiball-collection-brand.md` |
| layout, the window, controls on a phone | `mythiball-window-*.md`, `mythiball-camera-*.md` |
| how it draws | `mythiball-renderer.md`, `mythiball-ball-labels.md`, `mythiball-readability.md` |
| difficulty, batting, defence, pace | `mythiball-difficulty*.md`, `mythiball-batting.md`, `mythiball-defence.md`, `mythiball-pace.md` |
| tuning numbers | `mythiball-calibration.md`, `mythiball-smoothness.md` |

After a meaningful change, update the matching note by pull request on the knowledge base. Decisions
there are append-only: a changed decision is a new dated note that supersedes the old one.

## Commands

```
node mythiball/check-posture.mjs     unlisted, the capital alias, the brand, every park's scenery
node mythiball/check-collection.mjs  the ten starters, the packs, the ladder, your own player
node mythiball/check-rules.mjs       whole games and the sport's arithmetic (add a count: 400)
node mythiball/verify-rules.mjs      the rules replayed in a headless browser
node mythiball/check-reach.mjs       every control inside the window (--quick: one screen)
node mythiball/check-firstpitch.mjs  whether a stranger can read one pitch
node mythiball/check-motion.mjs      the menus move and every entrance finishes
node mythiball/check-frames.mjs 70 normal --phone --cpu=4    frame times on the machine that matters
node mythiball/check-skill.mjs       what a person hits, four rungs of skill, both swings
node mythiball/check-bat.mjs         the swing's own curves, and that skill pays
node mythiball/check-runs.mjs        runs per game (--jobs=N to run several at once)
node mythiball/calibrate.mjs         the pitch duel against its TARGETS bands (--quick for a loop)
node mythiball/whiff.mjs 3000        what the other dugout does with a swing
node mythiball/sprites/tools/build_rig.mjs           bake the roster into the page (--dry, --sheet)
```

## Rules a change here must keep

**Posture**

- **It is served and unlisted**: not in the sitemap, not indexable, no ad tag, linked from nowhere.
  Unlisted is the whole gate. It is not access control, so never describe the link as private.
- `Mythiball/index.html` (capital M) is a redirect stub with its own robots tag. Keep it.
- **The localStorage keys are still `allstars.*`** from when it was Run The All-Stars. Never rename
  them: that throws away every tester's save.
- `mythiball/proto3d/` is a separate, noindexed page the game never loads. Three.js is vendored with
  its version in the folder name, so a new version is a new folder.

**Characters**

- The roster is drawn by the rig and baked into the page by `build_rig.mjs`. The pack is the
  reference the owner chose, twice: compare against it before moving any proportion.
- **Nobody plays for both clubs, and the opponent yields.** The draft is never refused (a season's
  opponents are not arranged when the player drafts). The opponent swaps in a substitute matched on
  ratings, chosen without a random number, so the schedule's strength does not move.

**Engine**

- **A rating must never buy you less.** Every rating-to-number function moves one way over 0 to 100
  (`pitchScatter` is the one that goes down), and the suite walks all of them.
- **A timer fires into its own play or not at all.** A callback checks it is the SAME play, not just
  that a play exists.
- Smooth and Retro are one renderer with one branch. `PREFS.smooth` ships true.
- A comment is a claim. Words like `always`, `never` and `the only` in a comment have been wrong
  three times here; check them when you touch the code beside them.
