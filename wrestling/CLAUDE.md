# The wrestling game

The repo-wide rules are in the root CLAUDE.md. This file holds only what a change to `wrestling/`
must obey. The why, the history and the full design live in the knowledge base.

## The knowledge base

`sellybros711/runthe-gg-kb`, folder `games/wrestling/`. Start at `wrestling-overview.md`, and read
`wrestling-owner-rulings.md` before changing how anything looks. In a cloud session it is cloned at
`/home/user/runthe-gg-kb`. If it is not there, attach it (add_repo) before a design task. A small fix
that only touches code can go ahead without it.

| task | read |
|---|---|
| stipulations, the career curve | `wrestling-career.md` |
| Smooth and Retro, the voice, the brand | `wrestling-look.md` |
| the menus, the match, the 3D ring | `wrestling-match.md` |

`wrestling/docs/` (the design, plan, audit and narrative) stays here. `NARRATIVE-EVENTS.md` is read
by `wrestling/build/events.mjs`, so it must never move.

After a meaningful change, update the matching note by pull request on the knowledge base.

## Commands

`wrestling/index.html` is the whole career game in one file. A name collision anywhere in its
script kills the entire thing, so after editing it, syntax check the big script block:

```
python3 -c "
import re
s=open('wrestling/index.html').read()
b=max(re.findall(r'<script[^>]*>(.*?)</script>',s,re.S),key=len)
open('/tmp/x.js','w').write(b)
" && node --check /tmp/x.js
```

Then:

```
node wrestling/verify.mjs            script tags resolve, no trademarks, both pages load, careers
node wrestling/verify.mjs --quick    everything but the careers
node wrestling/ring3d/check.mjs      poses, clips, builds, a real match, and both fallbacks
```

## Rules a change here must keep

- **`wrestling/booking/` loads `../roster.js`, `../corrections.js` and `../personalities.js`.**
  They look unused from the career game and are not. They were deleted once as dead code and the
  booking sim shipped broken for a week.
- **A stipulation only speaks its own language.** A near fall is a two count. A climb stipulation
  (ladder, briefcase, TLC) cannot end by count-out.
- **The smooth figure is the same rig as Retro.** There is no black outline (the owner's call).
- **Rewording can break the game**: a few functions match the game's own sentences. Grep for a
  phrase before changing it.
- **The engine still decides everything.** The 3D ring is a renderer. A clip calls `hit` at its
  contact frame, which is when damage lands; a clip that never calls it is a move that never lands.
- **A device without WebGL plays the classic SVG ring**, exactly as before.
- **Every pose name the engine uses must be in `POSES`.**
- **The ring's modules version each other** (`stage.js` imports `./rig.js?v=1`). Change a file and
  bump its number where it is imported, all the way up to `boot.js?v=` in `index.html`.
