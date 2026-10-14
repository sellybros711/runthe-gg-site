# The wrestling game

This file holds the decisions for this game. The repo-wide rules are in the root CLAUDE.md.

## The wrestling game

`wrestling/index.html` is the whole career game in one self-contained file, by
site convention (the golf game at `golf/index.html` is the model). A name
collision anywhere in that script kills the entire thing, and the browser only
reports the symptom (`X is not defined`), so after editing:

```
python3 -c "
import re
s=open('wrestling/index.html').read()
b=max(re.findall(r'<script[^>]*>(.*?)</script>',s,re.S),key=len)
open('/tmp/x.js','w').write(b)
" && node --check /tmp/x.js
```

Then the regression suite, which needs no network:

```
node wrestling/verify.mjs            script tags resolve, no trademarks, both pages load,
                                     the title rule, and 2 careers x 4 years of invariants
node wrestling/verify.mjs --quick    everything but the careers
```

It covers `wrestling/booking/` too. That page loads `../roster.js`, `../corrections.js`
and `../personalities.js`, which look unused from the career game and are not: they
were deleted once as dead code and the booking sim shipped broken for a week. The
suite's first section fails on any script tag that points at a missing file.

### A stipulation only speaks its own language

**A NEAR-FALL IS A TWO COUNT.** Every stipulation counts the same drama into
`MS.nearFalls` (a hold nearly escaped, a climb nearly made), so the NUMBER is right
everywhere and only the WORD can be wrong. It was, in four shared places at once: the
closing log line, the result screen's stat row, the reasons the match was good, and the
phase banner, which is logged in EVERY match that reaches the stretch. So a ladder match
told you about its near-falls.

**`commitFinish` is a NORMALIZER, and that is why none of this ever failed.** It rewrites
an illegal finish TYPE to one the stipulation allows, so a pinfall in a ladder match comes
out as a climb and the RESULT is always right. What it cannot fix is the picture: a belt
shot behind the referee played the whole 1-2-3 and logged "you slide the cover in" under a
result reading "pulled down the prize". Two paths reach `pinSequence` without going through
`coverAttempt`'s gate (the tag turn, which is in a tag match and is fine, and the belt shot,
which is not), and the belt shot's own gate asks `noDQ`, which is a question about
disqualification rather than about whether a fall counts.

`fallNoun(o,n)` and `timeLabel(o)` are the one place the word lives: near-falls where a fall
ends it, escapes in a submission match, close calls everywhere else. **The guard reads the
WORDS and not the finish type**, because the finish type was never wrong.

**A climb stipulation cannot end by count-out.** Ladder, briefcase and TLC are fetched from
the floor, so being counted out for leaving the ring contradicts the one thing the match
asks you to do. TLC carried `noDQ` and not `noCount`, which is what gave the oversight away;
all three carry both now.

**A thin sample is a coin toss on this.** The first sweep ran one match per stipulation and
called four of six clean, because a match that ends before the stretch never logs the phase
banner. The check plays each stipulation several times and asserts at least one run REACHED
the stretch, or the run proves nothing about the line that carried the bad word.

### The late career was a spiral, and rest is what ends it

Reported as the game getting sloppier the longer it ran. Measured over a fourteen year
career: years 9 to 13 spent **30 to 38 of 40 weeks injured**, and the severity index had
saturated so nearly every draw was a 12-to-34 week neck. `c.wear` only ever climbed, so
mileage drove injuries, injuries added weeks, and nothing pulled the number back.

Three things turn it into an equilibrium, and **each fails silently**, a decade into a save:

- **Wear comes off during a layoff**, 1.2 a week, down to a floor of `(age-21)*4`. The floor
  is the miles that never come off, so a 35 year old can rehab back to heavy miles and never
  to a rookie's legs. Without it the fix overshoots and a veteran reads "fresh legs".
- **Chronic damage stops compounding past four entries.** It is a list with no ceiling, so a
  twenty year veteran's own file guaranteed his next injury.
- **After any ten week layoff the top of the injury table is off the menu for two years.**
  One catastrophe is a story; one every spring is a treadmill.

**Measured over twelve fourteen-year careers (168 career-years) rather than one**, which is
what the first pass got wrong: matches a year fall from 26 in year one to about 17 by year
seven and then **plateau**, oscillating 15 to 20 through year fourteen rather than falling to
nothing. Injured weeks settle around 20. Wear pins at the floor (52 to 55 at that age).
**The plateau is the claim, not the number**: the old behaviour was monotonic, and the guard
fails if the last four years each play fewer matches AND spend more weeks hurt.

The distribution needs a dozen careers and lives in a probe. What is in `verify.mjs` is that
each of the three mechanisms still bites, because a green distribution would pass just as
well on a fix that had quietly stopped working.

### Smooth and Retro, and why the smooth figure is the pixel rig

```
node wrestling/verify.mjs --quick   the section named "two styles, one rig"
```

The game draws in two styles and **Smooth is the default**. Retro is the pixel
game exactly as it was, kept whole behind a toggle on the home screen rather than
deleted: `wrestlerSVGRetro` is byte for byte the old `wrestlerSVG`. It is a device
setting (`rtr_gfx` in localStorage), not part of a save, because it is about the
screen in front of you. Switching reloads the page, because figures, icons and
belts drawn in the old style are sitting in markup all over it (the inbox, the
news, the locker) and a reload is the one repaint that cannot miss any of them.

**THE SMOOTH FIGURE IS THE SAME RIG, AND THAT IS THE WHOLE DESIGN.** Every bone
sits on the joints in `JOINT`, every pose is the bag of angles in `POSES`, and the
rig is assembled by the same transforms. So a suplex, a pin or a ref's count lands
on exactly the same marks in either style and nothing in the match engine knows
which one it is drawing. The guard asserts that as a property of the markup: for
all 43 poses, the ordered list of transforms the two figures emit is identical.
Pointing one knee at the hip joint fails 26 of them.

What changes is the ink. The body is tapered tubes, a real torso and a real head,
each lit by a cylindrical gradient.

**THERE IS NO BLACK OUTLINE, and that was asked for after the first version had
one.** The pixel figure needs its border to read as a figure at all; round an
illustration it is the sticker look. The outline pass is still BUILT (the gear code
draws its own borders in `OUTLINE` and they route there) and then left out, so what
separates the figure from the ring is its own shading and the drop shadow the page
already puts under it. **Every fill carries a thin translucent inner line instead**
(`FIG_INK`, a shadow at .30 rather than an ink line): without it an arm crossing a
chest of the same skin disappears into it, because a smooth gradient has no shading
steps to tell them apart.

**So the rig guard compares against HALF of Retro.** Retro emits the rig twice (the
outline pass, then the fills) and smooth once. The whole-body move wraps both passes
and comes first, so it is set aside before the halves are split; the first draft did
not and failed 39 poses on a correct page.

**The long tail of gear is the pixel code, read smooth.** About a hundred and fifty
patterns, masks, boots and accessories are each a handful of `P()` and `LIMB()`
calls in figure space. Inside `wrestlerSVGSmooth` those two names are shadowed by
rounded, gradient versions, so every item keeps its placement. The pieces a reader
looks at first (the body, the face, twenty four hairstyles, the beards, the three
masks an opponent can roll, boots and trunks) are drawn by hand. **A new gear item
written in `P()` works in both styles on day one**, and the guard draws every value
of every slot in two poses and fails on a throw, a NaN or an undefined.

**Hair that hangs behind the head has its own layer**, `HB`, dropped in under the
neck and face. The first version drew a mullet and dreads straight across the face.
**The first guard for it could not fail**: it looked for the marker leaking into the
output, and the rig split keeps shapes only, so a forgotten marker is discarded
silently and the tail simply is not there. What it asserts now is that a pony, a
mullet and dreads are drawn at all AND drawn before the face fill, proved by
deleting the drop-in and by moving the pony to the front.

**The trunks come down through the middle.** The first smooth trunks cut a notch
up between the legs to y 51.4 while the torso's skin ends at 53.6, so every bare
legged attire showed skin at the crotch. Reported with a screenshot. The guard asks
the drawn shape (`isPointInFill` at the middle of the crotch) on every attire that
draws trunks, and with the notch back it names all twelve.

**Gradient ids carry the figure's own counter.** Two wrestlers on one screen with
the same id would paint each other, and a def inside a `display:none` screen does
not resolve for anybody else. Asserted.

**What else went smooth, and the rule for each:**

| surface | smooth | retro |
|---|---|---|
| wrestlers | `wrestlerSVGSmooth` | `wrestlerSVGRetro` |
| icons | `PICO_SM`, one per `PICO` id, same 16 unit square | `PICO` |
| belts | `beltPlateSmooth`, the same six plate shapes as real outlines | `beltPlate`'s 11x9 masks |
| pundit sets | no crisp edges, props get rounded corners | crisp |
| the crowd | soft blobs | hard dots |
| `image-rendering` | `--pxr: auto` | `html.gfx-retro` sets `pixelated` |

**Every icon has a smooth drawing and the guard says so**, because an id falling
back to its pixel square is a pixel icon on a smooth screen, the one resolution rule
MythiBall already carries. The fallback exists so a NEW id can never render as
nothing; the guard is what stops that fallback being used in anger.

**The belt keeps what makes the twenty four tell apart.** Shape, metal, stone and
strap are unchanged, so the existing "no two belts share a design" guard is still
the one that matters.

**The page chrome follows the figure.** Seventy odd rules set labels and stats in a
system monospace, the pixel game's terminal voice. Smooth points `--mono` at the
body face and turns `tabular-nums` on page wide, which is the column the monospace
was really there for (Run The Floor's lesson). Retro keeps the monospace.

**The booking sim follows the same setting and has no toggle of its own.**
`wrestling/booking/` reads `rtr_gfx` in a head script, before first paint, and
takes the same `--mono` override: it has no figures to redraw, so what Smooth
changes there is the voice. It had been left in the terminal face while the career
page went smooth, which is one game showing two styles. The guard reads the face
actually applied, in both styles, because a rule that loses the cascade renders
exactly like a rule that is missing.

The roster, the mentors in `legends.js`, the free agents in `personalities.js` and the
booking sim's promotions all use LEGAL names and invented companies. No ring names,
no trademarked match or event names, no catchphrases. The suite's second section
carries the blocklist; add to it when you remove something.

### The voice is a fan talking, and the game reads some of its own sentences

Everything a player reads is written the way a wrestling fan talks to a friend:
contractions, American spelling, short lines. It used to say "you are not going
out tonight" and "cheque" and "half four". A rulebook entry explains the rule in
one breath and keeps every real number.

**Rewording can break the game, because a few functions match its own prose.**
`inferStoryKind` picks a feud's story type by regex over the reason sentence the
loss trigger wrote, and it looked for "not ready" and "does not consider you".
Contracted, those read "aren't ready" and "doesn't consider you", the match
missed, and a two loss underdog story started as a title story ten times in
twelve. Nothing threw. The `underdog did not start` check in `verify.mjs` is what
caught it. The promo reader's `TONE` lists and the scene lint's `SITS` regex are
the same shape. Before a wording sweep, grep for `.test(` over prose and write
both spellings into any regex that reads a sentence the game produced.

### The brand is pixel art, and Run The Tour's title was the lead rather than the template

```
(nohup python3 -m http.server 8080 &) ; node wrestling/build-logo.mjs
```

Asked for with golf's pixel title as the inspiration and not as something to copy. Tour stands
gold letters on a putting green, with a ball for the O and the pin at the end. This is a wrestling
title card:
- ROPES in red block letters with a straight drop, and the O is a championship plate.
- Three ring ropes run behind the word between two turnbuckle posts.
- It all stands on the ring canvas over a navy apron.
- RUN THE sits on a black and gold nameplate.

The icon is a ring corner with the plate in front of it.

**One kit, one drawing.** The palette, a 5 x 7 font, the title, the icon and an arena scene live in
the game between `RPK BEGIN` and `RPK END`. `logo-source.html` and `og-source.html` lift that block
out by those markers, which is golf's arrangement. So the home title, the site bar mark, the logo
files, the link card and the share card can never become five versions of one mark.

| | where |
|---|---|
| the home title and the site bar mark | `paintBrand()`, painting every `canvas[data-rpk]` |
| the logo files | `lockup.png`, `logo.png`, `favicon-16/32/48.png` |
| the phone icons | `icon-180`, `-192`, `-512`, `icon-maskable-512.png`, and `manifest.webmanifest` |
| the link card | `og.png`, from `og-source.html` |
| the share card | `drawShareCard()`, behind Share card on the flip card |

**A cell is a whole number of device pixels, never CSS pixels.** On a 2.625 phone a 3x title in CSS
is 7.875 device pixels a cell, which is two widths of pixel and mush. `paintBrand()` picks the device
cell first and lets the CSS size follow, so the title can come out a pixel off a round number and is
hard edged everywhere.

**The files have to be what the kit draws.** Section 4q of `verify.mjs` repaints the favicon and the
lockup from the kit and compares them cell for cell with the committed files. An edit to the kit that
nobody rebuilt fails there, rather than leaving a tab showing last week's mark while the page paints
this week's.

**The wrestler on the link card is the game's.** The builder opens the real page, draws the look it
carries with `wrestlerSVGRetro()`, reads the stat names out of `ATTRS`, and works out the OVR with
`ovr()`. So the figure is one the game draws and the rating is one it would give those stats. The
card reports a box for every block, and the builder refuses to write if one is over the frame or on
top of another. `PREVIEW=path` writes the card anyway, for looking at a failure. That is how the url
strip was caught running under the champion.

**The share card is head and shoulders, never the whole figure.** Golf crops its golfer to a bust
because a full standing figure can trip a social site's sensitivity filter on upload, and a wrestler
in trunks is that problem twice over. A champion carries the belt over the shoulder on the card,
because at the waist the crop cuts it off. The figure reaches the grid through an `Image`, which can
fail without throwing, so the card records it in `cv._drew` and 4q reads that.

**The tile labels are chosen to fit, not cut.** A 31 cell tile holds five letters of this font, and
the first version truncated RECORD and EARNED to RECOR and EARNE. They are W-L, BELTS, POP and CASH.

### The menus and the match got a production pass, and none of it can fail loudly

```
node wrestling/verify.mjs --quick   the section named "the building, the menus and the match mode"
```

**The building is the LIGHT, not the tint.** Every venue used to be one dim crowd texture
over a black box, so a bingo hall and a stadium differed only by a colour. `venueHTML()`
builds a rig scaled off the building's `seats`: a pipe with two cans and two still washes
for an indie basement, a truss with sweeping coloured beams for a national room, and a
screen over the stage once there is money for one (`seats >= 4`, a banner on two ropes
below that). Camera flashes, a pool of light on the canvas and the promotion's name on the
apron come with it. It is seeded off the promotion id, so a building is the same building
every time.

**Two pieces live INSIDE `.ringback`**, the mat pool and the apron lettering, because the
ring shrinks toward the floor when a spot spills outside (`.wide`), and anything painted
beside it would stay put while the ring moved.

**A match takes the rails off.** `go()` sets `body.inmatch` on the fight and promo screens,
which hides the header rail, the number strip and the tab bar. They are all ways to leave,
and mid match there is nowhere to go (Skip is on the screen). The ring gets the height
back. The call box sits ABOVE the play by play (`order:-1`), because under a full log it
opened below the bottom of a phone and the match sat paused on a question nobody could see.

**One rail per device.** A phone steers with the tab bar, a desktop with the header rail.
Both used to show at once, which was the same six buttons twice on every screen.

**A screen header's icon is a CSS variable on the `h2`, never a child of it.** The career
title is rewritten with `innerHTML` every week, so a child icon would be wiped with it.
`decorateHeader()` sets `--h2ico` once per screen and the rewrite cannot touch it. A new
screen with a direct `h2` needs a line in `SCREEN_ICO`, and the verify section asks.

**The entrance motion is opacity on the screen and a `backwards` fill on its children.**
A transform left filling `forwards` on a screen makes it the containing block for anything
fixed inside it, and the stagger would then move overlays that have nothing to do with it.

### The match is played in a real-time 3D ring

```
node wrestling/ring3d/check.mjs      poses, clips, builds, a real match, and both fallbacks
wrestling/ring3d/lab.html            every clip and pose on buttons (?manual drives frames by hand)
```

`wrestling/ring3d/` is a Three.js stage (0.180.0, vendored at
`assets/vendor/three-0.180.0/`, the version in the path so an upgrade is a new folder and
never a stale cache). It draws the wrestlers as small 3D models at about 280 lines, blown up
with `image-rendering:pixelated`, toon shaded with an inverted hull outline, so it is the
game's pixel look given depth rather than a different game.

| file | what it is |
|---|---|
| `rig.js` | one procedural body per look, built from `RTR_PX` looks, baked to one skinned mesh |
| `poses.js` | a pose for every name the match engine asks for, plus the referee's |
| `moves.js` | two actor clips for all nine move families, picked by the move's name |
| `arena.js` | the building, themed off the promotion; cage and hanging prize |
| `stage.js` | the scene, the camera director, the clip player, sparks and dust |
| `boot.js` | the door: `window.RTR_3D`, because `index.html` is a classic script |

**THE ENGINE STILL DECIDES EVERYTHING.** The 3D ring is a renderer. `fmv`, `poseSet` and
`impact` in `index.html` forward to it, and `exchange` and `spot` await `R3D.play` where
they used to await a CHOREO routine. A clip calls `hit` at its contact frame, which is when
the engine applies damage, so a clip that never calls it is a move that never lands.

**A device that cannot draw WebGL plays the classic SVG ring, exactly as before**, and so
does `rtr_ring3d = '0'` (the 3D ring switch in Help) and `?ring2d`. The guard plays a match
with the whole folder blocked, because a stage that throws on boot leaves the classic ring,
which renders perfectly, and a regression there would look like a working game.

**A MOVE KEEPS WALL CLOCK TIME.** The match engine's waits are timers, so a clip running at
render speed falls behind them on slow frames. The stage clamps each frame at 0.05 s for the
camera and the sparks only. Clamped everywhere, a Last Man Standing match in a software
WebGL browser ran past the suite's minute and never reached a result.

**A FOOT IS DRAWN AT ITS ANKLE TARGET, so the target is bounded twice.** It never goes
through the canvas and never reaches past the leg. Unbounded, a blend from lying to standing
pointed the pelvis frame's down at the floor from a pelvis a foot off it, and ten clips put a
foot two feet under the mat. The guard measures every joint of every clip, frame by frame.

**A PITCH LERPS THE SHORT WAY ONLY IF YOU WRITE IT THAT WAY.** The moonsault lands at
`-1.5 * PI`, which is the splash pose's `+PI / 2`, and a hold key reading the plain splash
pose turned the body a full circle through the canvas. A key after a flip repeats the flip's
angle.

**Every pose name the engine uses must be in `POSES`.** An unknown name falls back to the
ready stance, so a pin would be two men standing. The guard reads the names out of
`index.html` and asserts the reader found them.

**The modules version each other**, `stage.js` importing `./rig.js?v=1`. Change a file and
bump the number where it is imported, all the way up to `boot.js?v=` in `index.html`;
`check-cachebust.mjs` now follows module imports from every script it records, so it holds
the chain.

The game is unlisted: not linked from the homepage, nav or sitemap, and
noindexed. Keep it that way unless asked. **The og tags do not change that.** A
robots tag tells a crawler not to index and does nothing to a chat app unfurling
a link somebody was handed, which is how an unlisted game reaches its testers.
