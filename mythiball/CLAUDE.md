# MythiBall

This file holds the decisions for this game. The repo-wide rules are in the root CLAUDE.md.

## MythiBall, the baseball game

`mythiball/index.html`, the same one-file convention as wrestling above. Sixty
eight public domain characters play arcade baseball: a plate camera behind the
catcher, hitting on timing plus where the bat is, pitching on aim plus a
release meter.

**It was called Run The All-Stars and lived at `allstars/`.** Both names are
gone from the code. What did NOT change is the localStorage keys, which are
still `allstars.season.v1` and its siblings: they are invisible to the player,
and renaming them would throw away the save of every tester who has already
played. Leave them.

It is SERVED, and unlisted, and those are two different facts:

| | wrestling | hoops | MythiBall | setlist |
|---|---|---|---|---|
| answers at a runthe.gg URL | yes | yes | **yes** | yes |
| in `sitemap.xml` | no | no | no | **yes** |
| indexable | no | no | no | **yes** |
| carries the AdSense tag | no | no | no | yes |
| linked from the homepage or nav | no | no | no | no |

So a tester who is handed `runthe.gg/mythiball/` can play it and nobody else
can find it. **Unlisted is the whole of the gate.** It is not access control:
anyone with the URL is in, and if the game ever needs a real gate it needs a
real one rather than a quiet path. Say so rather than implying the link is
private.

`Mythiball/index.html` (capital M) is a redirect stub to the lower case path,
the way `Wrestling/` and `Tour/` answer theirs, because the capitalised URL is
the one that gets typed and pasted. It carries its own robots tag.

### Behind the wall: every park has a sky, a horizon and a landmark

```
node mythiball/check-posture.mjs   section 8: every park's scenery is one the game can draw
```

Asked for as better scenery during play. What stood behind the wall was the
oldest drawing on the page: a `landmark(ctx, w, h)` per park, written in
fractions of the field and drawn as a few black rectangles. A castle was three
bars and a clock was a disc. The plate camera drew it at the top of the sky,
which on a phone is exactly where the line score sits. So the one thing that said
whose park this was sat under a table. **The six franchise parks had no
landmark at all.**

**It is `drawScenery` now, one set of functions for both cameras**, and a park
names what stands behind it rather than drawing it:

| | what it is | drawn by |
|---|---|---|
| `body` | `sun`, `lowsun`, `moon`, `bloodmoon` or null | `drawSkyDressing`, with the drifting clouds and the snow |
| `far` | `hills`, `forest`, `city`, `sea`, `crags`, `dunes`, `ice` | `drawFarHorizon`, two layers hazed into the sky |
| `mark` | one of seventeen landmarks | `drawLandmark`, a `switch` |

**Everything is counted in blocks.** `R()` takes block units with the origin at
the landmark's foot and y counting up, so in retro mode the scenery lands on the
field's own grid. In smooth mode it is still pixel art rather than smears.

**The landmark stands on a baseline, not at a height.** Each camera hands in
where the stands' top edge is. On the wide camera that follows the wall's curve.
On the plate camera it is the roofline at 128.

**Where it stands is the CALLER's call**, because only the caller knows what is
laid over its sky. The plate camera puts the landmark 30% into whatever the crop
is and the sun 9% in, because the right of a phone's crop is under the line
score. The wide camera puts the landmark at 0.30 and the sun at 0.66 of the
world, which clears both the park's name and the score. **A desktop's plate crop
starts below the sky altogether**, so there the wide camera carries the park.
That is accepted rather than fought: getting the sky into that crop would mean
moving the camera every guard in this file is written against.

**Nothing reaches above y 14, and the wide sun is placed as if the sky began at
30.** `fieldBand` reads the world's top row at the midline for the letterbox
colour, so a spire or a cloud across that row paints the band above the picture.
And a desktop's wide crop starts a little into the sky, which sliced the top off
a sun placed against the whole of it.

**A name the switch does not know draws nothing and throws nothing.** A park
added with a typo is a park with an empty sky and no report, so check-posture's
section 8 reads every `far`, `body` and `mark` out of the page. It holds them to
what the three functions answer, and it counts the themes: a theme that lost its
scenery line would otherwise drop out of the regex and pass. Both halves were
proved by mutation, with a misspelt landmark and a deleted `far`.

**The haze is 0.10 and was 0.18.** Hazing is what puts a landmark behind the
stands rather than on them. At 0.18 the lavender castle vanished into a pale
blue sky, which a screenshot said and no guard can.

### The 3D prototype is a separate page, and the game does not load it

```
runthe.gg/mythiball/proto3d/      noindexed, linked from nowhere
```

Asked for by the owner: real depth, perspective and animation, judged against
Backyard Baseball. `mythiball/proto3d/` is a standalone page on Three.js 0.180.0,
vendored under `vendor/three-0.180.0/` with the version in the path, so a new
Three.js is a new folder and never a stale cache.

- **The pixel look is the render size.** The scene is drawn into a canvas about
  240 lines tall and blown up with `image-rendering: pixelated`. A level is a
  pixel BUDGET (its height on a 3:2 screen), so an upright phone gets as many
  pixels as a landscape one rather than a 111 pixel sliver.
- **The 68 characters are built from `sprites/cast.js`**, the same specs the 2D
  rig bakes from, by one procedural body in `rig.js`. No model files. Limbs are
  placed by two bone IK from hand and foot targets, so one pose drives every
  build and both hands stay on the bat.
- **Animations are hand keyed** in `anim.js` and sampled on a Catmull-Rom curve.
  Authored for a righty facing +z with his left at +x; a lefty is `mirror()`.
  The swing plane moves with the aim, and the pitch types carry an arm slot tell.
- **It is a whole game now, and its own one.** Two nines built from `names.js`
  (the ratings copied out of ROSTER), innings, outs, a count, runners who stay
  on base and score, and you on both sides: you swing when your team bats and
  pick a pitch and a spot when it fields. The CPU swings off the batter's CON,
  pitches to the count, and a ball in play is decided by the ball flight and the
  fielders' own speeds and arms, not by a table. None of it shares code with
  `mythiball/index.html`, and nothing there reads any of it.
- **`node mythiball/proto3d/check-game.mjs` plays whole games** headless, with
  the page's own autoplay bot on both halves, stepping the clock rather than
  waiting on frames. It fails on a page error, a play that never resolves, or a
  game that never ends. A booted ground ball has to be pickable again
  (`f.missed` expires), and a fielder's catch reach is measured from his own
  height, or a ball rolling to the pitcher's feet on the mound is never fielded.
  Both shipped as stuck games first.
- **Frame times in this sandbox mean nothing**: Chromium here renders WebGL in
  software. The HUD prints fps, p95 and the game logic's own milliseconds so a
  real phone can be read. **Draw calls do mean something**, and the HUD prints
  those too (`renderer.info.render.calls`).
- **A body is two draw calls, not forty.** `rig.js` still builds a character out
  of dozens of primitives, each with its own ink hull, and then `bake()` merges
  them into one skinned mesh for the body and one for the ink. Every node the
  poser moves (trunk, limb segments, hands, feet, and whatever is held or
  toggled: bat, glove, prop, hat, helmet, hair cap) is a bone, and each piece is
  bound rigidly to the node it hung from, so posing goes through the same
  Object3Ds as before. A hidden node gets a zero bone matrix (`VisSkeleton`),
  which is how the bat and the helmet still switch off. The ink hull's push
  along the normal is baked into its vertices. A helmet added later is baked
  as a second pair. The park's static meshes are merged by material too
  (`mergeStatic`). A full field went from 365-669 draws a frame to 38-61, and
  the pixels came out the same to within shadow rounding. Baked meshes own
  their geometry and bone texture, so `Actor.dispose()` frees them: fielders
  are rebuilt every half inning.
- **The offence dials are one object, `TUNE` in `main.js`**, exposed on `PROTO`
  so a sweep can set them before `startGame`. How far the batter goes is a
  race, not a timer: the furthest bag he reaches before a throw there would,
  give or take a little nerve, so a ball in the gap is a double and now and
  then he is thrown out stretching. Three things were needed and each was
  silent:
  - **The batter who reached first had stopped.** He was `done` by the time a
    deep ball was fielded, and raising his target never cleared it. Every
    double attempt was thrown out at second.
  - **The bases are 50 ft and the fence is 142, so the outfield is close.** On
    this field the runner never beat a throw to second. What makes doubles is
    the outfielder's stop, turn and set before he throws (`transfer`, 1.4s
    when he fielded it deep) and grounders that roll on to the track (`drag`).
  - **`rnd` reads `Math.random` at call time**, so a checker can seed it. Seeded,
    the old dials scored 10.8 runs and 30 hits a game (all singles) between two
    bots. The shipped ones score about 15.5 runs, 34 hits, 5 doubles and a
    homer. Unseeded runs of six games differ by more than any dial does.
  Homers count as hits now; they never did.

### The collection: ten to start, packs for the middle, feats for the best

```
node mythiball/check-collection.mjs     the split, the migration, the packs, your player
```

Asked for as a long term grind in the Mario Kart shape: everybody starts with the
same base team and unlocks the rest. Built on the unlock ladder that was already
there rather than beside it.

| | who | how you get them |
|---|---|---|
| `STARTERS` | ten, the storybook core | on the bench from the first game |
| `PACK_POOL` | the middle of the roster, derived | pulled from packs bought with coins |
| `UNLOCKS` | the best, unchanged | earned on the field, the ladder as it was |

**THE BEST ARE NEVER FOR SALE**, and the guard asserts it as a property rather
than a list: every ladder character outranks every pack character on
`charValue`, which is the number the ladder was already ordered by. A pack is
luck and a rung is a feat, so no amount of pulling can be the fastest way to the
best player in the game.

**`PACK_POOL` and its rarity are derived, never listed.** Everybody who is neither
a starter nor on the ladder, split 45/35/20 by value into common, rare and epic. A
character added to the roster is in the packs the day it is written.

**COINS COME FROM PLAYING AND FROM NOWHERE ELSE.** There is no money in any of
this and there must not be: the site has one store and a second payment path
belonging to one game is what it exists to prevent. A game pays by the inning,
more for a win and a harder dugout, 200 for a title and a bonus for the first
win each day. **A forfeit pays nothing**, or quitting is the quick way to a pack.

**A PACK NEVER PAYS BACK ITS PRICE.** The first version paid a coin card of up
to sixty and a fallback of sixty for a finished collection, so a Sandlot Pack
returned 160 for 150 once somebody owned everything. Found by the economy sweep
running away with itself rather than by reading. Every coin a pack can hand out
is capped so three cards are at most the price, and the guard opens four hundred
packs with the collection and the point cap both finished to say so.

**A character slot rolls the rarity first, then hands you somebody you do not
have.** A straight draw makes the last epic a coupon collector's tail of hundreds
of duplicates. So a repeat only happens once that whole tier is yours, and pays
coins back. When the whole pool is yours the slot pays a training card instead.

What that makes of the grind, measured through the real `openPack` at about 45
coins a game: half the pack pool in about 54 games, all of it in about 181 if
Gold Packs are bought once the commons are done, 331 on Sandlot alone. The
ladder's legends and your player's top level are the months long tail.

#### A player who was here before packs keeps everybody

The whole middle of the roster used to be open to anybody, so a tester with a
franchise has men on it who are now pack characters. `migrateCollection` runs
once: any save with games played, a season or a cup is granted the entire pack
pool and flagged `veteran`. Everything rides inside `PROGRESS` under the key the
game has always used, because renaming a save key throws away every tester's
save. Everybody, veteran or not, gets one free pack on the way in.

#### Your player is a roster entry, drawn at runtime

`ME` is a roster shaped object in `ROSTER_BY_KEY.me`, mutated in place when a
point is spent so nothing holding it goes stale, and **deliberately not in
`ROSTER`**. `ROSTER` is also the pool every opponent is built from, so the draft
reads `DRAFTABLE()` and nothing else does. The guard's hard case is your player
NOT in your lineup and rated exactly like the man a club must replace, because
that is the one arrangement in which a leak would actually be picked.

**The sprite is drawn by `meSpriteBuild`** at the pack's 64 pixel grid and in its
grammar: big head, a one pixel near black line around every part, action poses
facing right. It writes the same `{b, f, p}` record the table holds, so the EPX
pass, the caches and every camera read it like any other character. **Each part
outlines itself**, which is what draws the line where an arm crosses a chest.

**A painter that takes fractional coordinates writes a property, not a pixel.**
`g[y][12.4] = 'c'` is legal JavaScript and paints nothing, so the side view lost
its whole cap the first time a body leaned. Every box and every `set` is floored.

**Gear changes the look and never a rating**, or a cosmetic would be a rating for
sale by another name. Growth is XP from games your player is in (a point a level,
top level 60), training cards from packs, a cap of 120 points and 95 a stat.
Changing the look rebuilds the drawing and drops the `me` entries from
`v2FrameCache` and `spriteStore`, or a hat bought mid session is only on the
screens drawn after it.

**Two things only a screenshot said**, both caught before shipping: `.pk-front span`
turned the rarity chips' white text into the chip's own colour, and "Open another"
showed with no coins because `.btn` sets a display and `hidden` never took (this
repo's `[hidden]` pair, again). The guard reads the computed colour and the
computed display for both.

### The brand shares Run The Tour's plumbing and deliberately not its look

```
(nohup python3 -m http.server 8099 &) ; node mythiball/build-logo.mjs
```

Asked for: new branding with Run The Tour's as the reference. **The first pass took "reference" as "copy",
and the owner's verdict was that it was too similar.** It used the Tour's six golds and its extrude, a small
cream word stacked over a big gold one on a grass oval, sparkles, and the Tour's card layout on a dark
night sky. That is the Tour's mark with a baseball in it.

**What is shared now is the pipeline and nothing you can see.** The grid, the outline pass, the 5x7 font and
`toCanvas` at whole scales are the Tour's PIXK. The look is the game's own cabinet palette (scorecard cream,
navy ink, arcade red, the same three colours the page's UI uses) and baseball's own shapes:

| | Run The Tour | MythiBall |
|---|---|---|
| wordmark | gold, extruded, small word over big | red varsity letters on an arch like a jersey, cream ring, navy drop |
| flourish | a waving flag | a script tail that is a pitch's trail, ending in the ball |
| icon | a ball and flag on a green | a stitched sleeve patch, a gold bolt through the ball |
| link card | a dusk course, left and right halves | a cream scorecard and three trading cards |

**If this ever drifts back toward the Tour, that table is the thing to check.** Gold letters, grass under
the wordmark, sparkles and a dark scene are each a step toward the other game.

**The drawing lives in the game**, between `MYPIX BEGIN` and `MYPIX END`, and `logo-source.html` and
`og-source.html` read that block out of the page by its markers. The header draws the patch with the same
kit at boot rather than fetching a file, so the header, the icons and the link preview are one drawing.

**What the builder writes**, every file one of the kit's grids at a whole scale: `logo.png` (the wordmark at
4x), `lockup.png` and `lockup-spin.png` (the ball spinning, four frames side by side), four icons on a cream
plate, three favicons, `mark.png`, `manifest.webmanifest` by hand, and `og.png` at 2400x1260.

**The trading cards are the game's own**: `og-source.html` lifts `V2_SPRITES` and `v2Frame` out of the page
and decodes with the game's own function, and reads each card's name and role off its `ROSTER` row. Each
sprite is drawn at one grid cell a pixel, so the card is one pixel grid edge to edge. **They stand in a row,
not a fan**: fanned, the front card covered the name plates of the two behind it.

**The card carries no count, deliberately.** The roster size is the number a pitch for this game wants to
say, and a picture cannot be re-interpolated: the day a character is added it would go on promising the
old number. "Nine" is the sport rather than a setting.

**Link tags on an unlisted game are right, not a leak.** Robots tells a crawler not to index and does
nothing to a chat app unfurling a link somebody was handed, and while the game is unlisted a handed link
is the only way anybody reaches it. Hoops made the same call. **The capital alias carries the same tags,
tag for tag**, because `runthe.gg/Mythiball` is the URL that gets pasted and a chat app reads the head
without following the refresh.

#### Things only looking could say

- **Bold is every column drawn twice**, which fills the one cell gaps inside M and N. A bold M came out as
  a solid block and a bold N as an H, so DRAFT YOUR NINE read as HIHE. Run The Tour has the same font and
  never met it, because no Tour card sets an M or an N in bold. `BOLDG` draws those two by hand at seven
  wide. Do not go back to doubling them.
- **A grid cell holds one colour**, so a translucent colour `put` into a grid replaces what is under it
  rather than sitting over it. `mix` exists for that.
- **At a radius under 9 the laces cover the ball.** Stitches both sides of the seam read as a baseball at
  the wordmark's size and as an egg with a rash on a 32px icon. Under 9 they go inside only.
- **Stitches across the patch band read as gear teeth.** The patch is sewn with a one pixel running stitch
  along the middle of its band, which is what a sewn patch looks like.
- **`.mark` was already a class on this page** (a small inline badge with a border), so the header mark
  arrived wearing its border and shadow. It is `.bmark`.

**Two bitmaps for the header and CSS picks one.** The header changes size when a game starts, and a
bitmap chosen at boot would be scaled by three quarters over the live field. The kit draws the 32 and
the 16 by hand, which is why there are two rather than one scaled.

#### What check-posture holds

Every `?v=` on one file agrees across the game, the alias and the manifest; every file named exists; both
pages carry identical previews; `og.png`'s real size, read off the PNG header, matches its tags; the
markers exist; the source pages are noindexed; and the header draws with the kit. **What it cannot say is
that the number moved when the bytes did**, because there is no earlier version to compare with. After a
rebuild, bump every reference to a file that changed. A drifted version and a renamed marker were each
reintroduced to prove the check bites.

### The roster is drawn by a rig, and the pack is only the reference now

```
node mythiball/sprites/tools/build_rig.mjs           bake the roster into the page
node mythiball/sprites/tools/build_rig.mjs --sheet   a contact sheet of every idle
```

Reported by the owner as looking low quality and low production value, with the
pixel style kept. They were right, and no filter could fix it: the pack's
characters were rectangles with square heads, about fifty near identical colours
each, and a batting stance that grew a bat in the frame it swung in. Cleaning and
upscaling the old frames was tried first and could not be told apart at game size.

**Every character is a spec, posed and turned into pixels.** `sprites/cast.js`
holds one per character: a build (kid, stocky, giant, lanky, round, small) with any
of its numbers moved, a head shape, and what they wear. The rig between `RIG BEGIN`
and `RIG END` in the page poses it, draws it flat at several times the grid and
gives each pixel the colour covering most of it. **No pixel is a blend of two
colours**, which is what keeps it pixel art rather than a small drawing.

#### The ink and the light are done in pixels, per body part

Reported next by the owner: the body parts looked like individual pieces. They
were. The first rig inked and shaded every SHAPE: an upper arm, a forearm and a
round hand each carried their own black ring and their own shine, so an arm read as
three capsules and a leg as two plus a lozenge. That is what a vector puppet looks
like, and no pixel artist draws a figure that way.

**So the drawing is flat and every shape is filed under a body part.** `part()`
names what is being drawn (`armN`, `legF`, `torso`, `head`, `hairF`, `hat`, `bat`,
and so on). The figure is drawn twice at the big size, once in colour and once
through `idCtx()`, a proxy that paints the current part's id instead of any colour.
Both are reduced by majority, and `light()` does the rest at the target size:

| | what it does |
|---|---|
| the outline | ONE pixel round the whole silhouette, a dark shade of the colour it borders, lighter on the lit top and left |
| a part in front of another | the part BEHIND gets a one pixel line in its own dark shade. A joint inside one part gets nothing, because an arm and its hand are one part |
| shadow | a part is lit as one mass from the upper left: a pixel is in shadow when the part runs out a little way toward the lower right, how far read off the part's own thickness |
| highlight | a rim along the top left edge of the colour a part is mostly made of |

**A part's z is the order it was first named**, which is draw order, and that is
what decides which side of a crossing gets the line. A part in front counts as more
of the part behind it for the shadow test, or an arm laid across a chest would cut a
false shadow edge into the chest.

**Two things only looking at it said.** A shadow that only takes value away turns
skin grey and reads as dirt, so `ramp()` turns the hue toward blue the short way
round and HOLDS CHROMA (holding HSL saturation instead turned a pale face orange the
moment it was darkened). And a black coat drawn black has nowhere darker to put the
line where an arm crosses it, so near black is lifted to a dark blue grey everywhere
except the face, where a pupil is meant to be the darkest thing on the figure.

**`G` was the obvious name and is a local in `draw()`**: the figure's scale is
`const G`, so a function called `G` threw a TDZ error on the first call. It is
`part()`.

**An ink underlay is skipped rather than deleted at every call site.** Props drew a
thick `INK` stroke and then the colour over it, which was their outline; `line()`
drops an `INK` stroke at `OW * 2` or wider, and the outline pass draws it instead.
The table came out a little SMALLER (667KB gzipped against 699KB), because a flat
part with one shadow runs longer than three bands and a shine.

**The heads are not one shape, on purpose.** A head is a superellipse with its own
roundness, width, height, top and jaw, so Frankenstein is a block, Humpty is an egg,
Dracula narrows to a point and Popeye's jaw is wider than his crown. The bodies
vary the same way. Asked for in as many words: more chibi, and not one body.

**AND THEN THE HEADS CAME DOWN, which reverses the chibi half of that.** Reported by
the owner: the heads were far too big, make them more realistic and keep the pixels.
`PROP` in the rig turns every build at once: the head to 0.64 of its written size,
the torso 1.28x, legs 1.48x, arms 1.42x, a longer neck and slightly thicker limbs.
The figure stands about the same height, so the head went from roughly half of it to
roughly a quarter, and no cast spec had to be edited. **It is one table on purpose**:
a proportion written into sixty eight specs is sixty eight places to drift.

- **Eyes shrink less than the head does** (`eye: 1.25`), or a face at this size is two
  single pixels and reads as nobody.
- **Side pose hands are scaled by arm length now**, as the front poses and the feet
  already were. The pose table was written for arms nine units long, so fixed hand
  offsets on a longer arm folded every elbow.
- **The cheer is narrower** (arms up rather than out). `fitScale` shrinks a whole
  character to fit its widest pose, and longer arms thrown sideways cost the big
  bodies (Kong, the golem) a fifth of their size in every pose.
- **Humpty is exempt** (`spec.egg`). His head is his body, and a small one would be a
  different character.

**AND THEN THEY WERE MODELLED ON THE PACK, which moves the numbers above again.** The
owner handed the pack back with "model the characters after these". Set side by side,
the pack's figures are not big-headed so much as BLOCKY: a square head about a third
of the height, a torso half again as wide as the head, short thick legs, and hands and
feet as big as a fist. Ours had a small head on a thin, long body, so the same
character read as a different drawing. `PROP` is now head 0.84, torso 1.1, legs 1.0,
arms 1.05, no added neck, limbs 1.5x as thick, hands and feet 1.3x, width 1.4x, and
`square` pushes every head's superellipse 1.35x toward a block. The head is bigger
than the last pass and the figure no longer reads as all head, because the body grew
with it. **Compare against the pack before moving any of these**: the pack is the
reference the owner chose, twice.

- **The fit starts at 1.5x the spec's own scale.** It used to START at the spec's
  scale, so a character with `scale: 1.02` could never be drawn bigger than that
  however much room the cell had. It still steps down until no pose leaves the frame.
- **A held thing is held out, at the pack's size.** A bolt, a lyre, a goblet, a wreath
  and the rest (`HELD`) were drawn at hand size behind the arm, so Zeus had no bolt on
  screen at all. They are scaled about the hand and drawn in front of it, and the arm
  holding anything comes away from the body. A pole stays behind the arm.
- **Specs that had drifted from the pack were put back**: Popeye in a white shirt,
  the golem's red band, a burlap scarecrow, Robin and Long John clean shaven,
  Esmeralda's red sleeves, Athena's shield.
- **The quadrupeds stay upright, deliberately.** The pack draws the dog, the cat, the
  chupacabra, the centaur, the phoenix, the dragon and Nessie as animals in profile,
  and every character here has to stand in a batter's box and throw from a mound. The
  colours, the heads and the marks follow the pack; the stance does not.

#### Every position is a baseball position

Asked for as the characters and all the positions looking like a real retro baseball
game. The pose table in the rig (`POSES`) was redrawn as baseball mechanics, and the
figure picked up the kit that says baseball before anything else on it does.

| beat | what it is now |
|---|---|
| `ready` | a crouched stance, feet wide, hands up at the back ear, bat up behind the head |
| `load` | the front knee lifted, the bat laid back |
| `swing1` | the stride down, the hands at the belt, the bat trailing flat, the blur starting |
| `swing` | contact: arms out, back heel up, the bat foreshortened toward the plate |
| `follow` | the bat wrapped over the front shoulder, the back foot on its toe |
| `run1-4` | a sprint: a hard lean, the knee driven up, the arms bent and pumping |
| `slide` | NEW. Feet first, leaning back, lead leg out along the dirt |
| `windup` / `kick` / `throw` / `release` | the pitcher from the plate: set, knee up, ball cocked over the head, the arm swept down across the body |
| `field` | NEW. The infielder's ready crouch, glove open low |

**THE PITCHER'S DELIVERY IS FOUR BEATS FACING THE CAMERA NOW, and the `cheer` workaround
is gone.** The pack drew its delivery in profile, so the plate view held his arms up and
let the ball carry the motion. The rig draws the delivery front on, so both cameras play
set, kick and stride over the windup (as shares of THAT pitch's `windupMs`, because the
windup is short when you pitch) and the finish over the first 320ms of the flight. The
ball is in his hand in the stride's drawing, so the white dot that used to be painted over
his hands is gone too. `verify-rules`' front-facing guard READS THE RIG for which poses
face the camera (`view: 'front'`) instead of a written list, and asks that the three
windup beats are three different pictures for every character.

**THE PLATE VIEW'S VECTOR BAT IS GONE.** It swept two brown strokes across the batter
through every swing, which was a straight line through the real bat in his hands. The blur
is baked into `swing1` and `swing` instead: `paintSmear()` runs after the light, paints only
empty pixels, and joins the figure at the barrel, so the bleed guard sees it as attached.

**The contact bat is drawn at 0.7 of its length (`batL`)**, pointing at the plate. Full
length it reached past the cell and `fitScale` shrank every character by a fifth to make
room, which is how this pass first came out: gear right, everybody smaller. Measure with
the fit before adding reach to any pose. `slide` is shifted right inside its cell (`dx`)
for the same reason: reclined, the figure sits left of the hip.

**A BATTER WEARS A HELMET, unless he already wears something.** A hat is part of who
somebody is (Santa, the witch, the top hats), so it stays. Hair that is on fire or alive
(the phoenix, Hades, Medusa) and Humpty, whose head is his whole body, are exempt too:
drawn, a helmet swallowed the egg and the flames poked through the shell. The colour is the
figure's own jersey, **never within a colour distance of 90 of the skin**, or Kong's helmet
came out as the top of his head.

**The glove is a real glove and the overlay mitt is gone.** Fingers, thumb, laced web,
dark pocket and heel, sized off the hand and capped at 5 (Kong's covered his face).
`drawRunnerAt` used to paint a brown disc over the raised hands in `catch`, which would be
a second glove. The slide is a drawing too, so the brown bar that stood in for a foot is
gone and only the dust stays.

**Fielders set while the pitch is live** (`field`) and stand between pitches, in both
cameras. The old comment explaining why there was no crouch was right about the pack and
is replaced.

**What it cost**: the table went 2140KB to 2578KB for two new poses and the detail.

**The grid is 96, up from 64.** `V2_W` and `V2_H` carry it and nothing in the page
should say 64 about a sprite. It costs about 170KB compressed on the page, which was
measured before choosing it.

**The rig lives in the page because the custom player is drawn by it live.** The
roster is baked; the player's look is chosen in the page, so `meSpriteBuild` hands
`meSpec(look)` to `RIG.lazy`, which draws a pose the first time something reads it.
One rig for both is what keeps the player's own character in the same style as
everybody they play with. The builder runs the page's own rig for the same reason:
a baked table and a live player drawn by two copies of one rig would drift.

**Three rules the builder enforces, all of which failed silently first:**

- **One size per character.** A top hat, rabbit ears or both arms up in a cheer
  leave the frame, so `fitScale` finds the largest scale at which no pose does and
  uses it for every pose. Fitting per pose would make a figure shrink when it cheers.
- **Seated.** The lowest pixel of every frame is the second row from the bottom,
  whatever the pose did with the feet, because the camera draws the bottom of the
  cell on the dirt. A run stride with both feet up would otherwise hover.
- **52 colours.** The table format is palette letters, so a character's colours
  past 52 fold into the nearest kept one, by use.

**The pitcher's delivery is front facing now.** The wide camera draws him in
`windup` and `release`, and the pack's were a side profile, which is the same
throwing to third base the plate camera was fixed for. The rig draws them facing the
reader: hands together, the knee up, the arm coming down toward the camera.

**The stance bat is drawn in front of the head.** A chibi head is big enough to hide
a bat held behind it, so `ready` and `load` carry `batFront`. At the plate the bat is
the thing a player looks at.

**The guard that expected some characters with no bat was rewritten, not loosened.**
It was a fact about the pack. Now every character draws one, the check asks for all
of them, and the prop bat fallback is exercised on a fixture with its bat list taken
away, because no real sprite reaches it any more.

**The link card still shows the pack's art.** `og-source.html` reads the grid size
off the rows now, so a rebuild works, but its trading cards were laid out for 64
pixel portraits and were not rebuilt in this pass.

The history below is the pack's, and it is kept because the specs follow its looks.

The sprites came from a generator and then from a HANDOFF PACK. The pack's tools
that wrote the table (`build_table.py`, `install.py`) and both generators are
deleted, because any of them would overwrite the rig's table:

```
python3 mythiball/sprites/tools/audit.py        what is in the pack
```

#### The game was showing a quarter of the frames the artist drew

**274 drawn, usable frames were never on screen.** A run strip is FOUR
frames and a real cycle: contact, passing, the other contact, passing. The
page played a two pose toggle off frames 0 and 2, so every runner in the
game shuffled between two legs positions while the other two sat in the
file. The swing strip is four beats and the page showed three, so the bat
went from over the shoulder to the ball with nothing in between.

**Nothing about the ART was wrong, which is why no check moved when this
was fixed and none would have caught it.** Every guard here asks whether a
drawing is right, present, or distinct from its neighbour. None of them
asked whether the GAME ever puts it on screen.

**The stride rate is unchanged, and that is arithmetic rather than taste.**
Frames 0 and 2 are the two CONTACTS, the moments a foot lands. The old
toggle put a contact up every `p`, so four frames run at HALF that period
to keep the feet landing at the same rate. Run four at `p` each and the
legs move half as fast: the same man, suddenly wading.

**`runPose` is the cycle written ONCE.** It was written out four times, at
three path sites and the batter's walk up, each as its own `stride ? a : b`.
Four copies of a rule is four places to forget it, and the fifth thing that
wanted it was the swing.

**AWAY IS STILL TWO POSES and that is the art rather than the cadence.**
The pack has no rear view at all, so `backrun1` and `backrun2` are both the
left facing still and a runner going to second does not animate either way.
It is written as a cycle anyway, so the day those frames exist it is one
line rather than a fifth copy.

**Every character is already drawn to the same standard**, which is worth
knowing before anybody orders art to fix how the game looks. The thirteen
with no animation at all have stills statistically identical to the
fifty five with a full set: 1617 opaque pixels against 1593, 75 colours
against 71, 61 rows tall against 62. They are the same artist's work. What
makes one character look better than another here is whether he MOVES.

**And there is no shared rig to lift, which was measured before it was
believed.** If the artist had posed one template, the swing silhouettes
would agree with each other MORE than the stills do. Across 45 humanoid
characters the stills agree at 0.70 and the swing frames at 0.34 to 0.46,
so every swing was drawn individually. Within one character the still and
the contact frame overlap at 0.35, so a warp between them is a deformation
large enough to destroy 64x64 art. Transferring motion from a character who
has it to one who does not is not available.

#### Nineteen characters played the game as somebody else

**Medusa stood at the plate as a gorgon and took the swing as a brown haired
woman in a blue dress.** Apollo stood holding a lyre and played as a CENTAUR.
Krampus batted as Humpty Dumpty, Humpty Dumpty batted as Medusa, Ares played as
a gentleman in a top hat. Nineteen of the sixty eight, on every screen, since
the pack was installed.

**The stills and the strips came out of the pack under one name and only the
stills are that character.** So a character is correct exactly where it stands
still (`idle`, `catch`, `throw`, `back`, `slump`, all off `source_reference`)
and is somebody else the moment it does anything. That is a man changing
species when he swings, which is the reason this file already gives for
building a character entirely from the pack, arriving from INSIDE the pack.

**Nothing could report it and nothing did.** Every frame is a valid frame, every
pose is present, every pose is its own drawing, and each one differs from idle,
which is every property the guards here ask for. Found by rendering all 55 and
looking.

**NO AUTOMATIC MATCHER IS AVAILABLE, and two were written before that was
believed.** The pack redrew every character for the strips: measured, a
character's strips and its own stills share **zero exact colours**, and
quantising both (3, 4 and 5 bits, three mass floors) never separates a known
good pairing from a known bad one at any setting. The first matcher weighted
colours by mass and confidently filed every dark figure under `black_cat`; the
second weighted by inverse frequency and filed Alice under `werewolf`. **Both
contradicted the eye on characters already confirmed**, which is the only reason
they were not believed. That is the fourth and fifth wrong extractor here.

**So `FILE_DRAWS` in `build_table.py` is an OBSERVATION, written the direction
it was observed**: the file on the left draws the character on the right. The
builder wants the inverse and computes it, because a hand written inverse is a
second copy of an answer.

**What corroborates it is the SHAPE, not any one row.** The nineteen sit in two
CONTIGUOUS runs of `manifest.json`'s own key order, 13-22 and 33-42, and each
run is a **closed permutation of itself**: every file in it draws another
character from the same run, exactly once. Nothing outside those two runs is
touched, and all 36 other files are their own character. A closed permutation
inside a contiguous block is what a packaging bug looks like. A string of
eyesight mistakes would not close.

`check_file_draws()` asserts exactly that on every build: a name the pack does
not have, two files claiming one character, and a chain that leaves its block
are each named. Proved by introducing all three.

**It costs nothing in coverage**, which is the sign it was purely a naming
fault: 807 poses from a drawn frame before and after, 647 on a still before and
after. The same frames, under the right characters.

**A SECOND FAULT WAS WRITTEN UP HERE AND DOES NOT EXIST.** Twelve characters
ship their strips fully opaque with the background baked in, and their outline
is the same near black as that background, so the reading was that
`border_background`'s flood walks along the outline and into the figure: 204
frames arrive opaque, 35 of them clean down to under 900 pixels, `usable_frame`
refuses those, and about 35 drawn frames were being thrown away. It is the
failure that function's own docstring predicts at `tol=12`, arriving at `tol=0`
because the two colours are identical, which is what made it convincing.

**Measured, the flood removes ZERO non-background pixels across all 204.** The
35 frames hold under 900 pixels of anything that is not the border colour
before the flood is run at all: they are blank cells, and refusing them is the
mass floor doing its job. There is nothing to recover. A prediction that fits
the shape of a bug is not a measurement of one, and this one sat in the file
for a pass as an open TODO worth thirty five frames.

#### The batter stood at the plate holding an axe

`pose === 'batting'` drew the `back` frame, which was right when the sprites
were generated: `back` was a REAR view and a batter is seen from behind the
catcher. The pack has no rear view, so `back` is the LEFT facing still. What
that produced, on the screen a player looks at longest: **the batter waiting on
the pitch faced away from the pitcher, holding whatever he idles with** (Paul
Bunyan his axe, Tom Sawyer a fishing rod, Popeye a pipe), and then a bat and a
right facing body appeared in the frame he swung in.

It is `ready` now, the pack's drawn batting stance: **37 characters had one the
game never showed**, and it faces the way every swing frame faces.

**`ready` WAS DOING TWO JOBS AND THE OTHER ONE BROKE THE SAME WAY.** It was the
fielder's set as well, so the four infielders spent every pitch holding a
batting stance in the dirt. The pack contains no fielding art, which is what
`catch` and `throw` already stand on a still for, so the crouch is gone rather
than wrong.

**AND THE PROP BAT BECAME A SECOND BAT.** The page draws a bat out of three
`fillRect`s over the sprite, written when every figure was parametric and held
nothing. The pack draws real bats in its swing and batting stance strips, so
**55 of the 68 were handed two**. `spr.b` is the builder's answer to which
poses already carry one, because the builder is what chose the frame and
nothing in a 64x64 bitmap says whether there is a bat in it.

**The guard counts `fillRect` calls rather than reading the source.** The prop
is a canvas primitive with no handle to ask about, and a source match would
pass the day somebody moves the same three rectangles. The sprite arrives by
`drawImage` and the shadow is an ellipse, so inside one `drawRunner` call a
`fillRect` IS the prop. Reintroduced, it reports 37 of 37.

#### A bat reaching the side of its cell is not a clipped frame

The build refused any frame with a pixel in column 0 or 63, on the audit's own
clipping rule. That threw away **124 frames, and 101 of them were the swing and
pitch strips**, whose middle frame is CONTACT and RELEASE: the two most
important drawings in the game, rejected because a bat reaches the side of its
own 64px cell.

**What the rule was really catching is BLEED.** A strip is one image cut into
cells and several characters are drawn wider than their cell, so a wing, a foot
or a bat from the frame next door lands inside this one: a blob floating beside
the character with nothing holding it up. That is a DETACHED component touching
a side edge, and the character is always the largest one, so it is never what
goes. Measured, 36 of the 124 have nothing but bleed on the edge and every one
of the rest is a whole figure filling its canvas.

**The bleed comes off BEFORE the baseline is measured**, or the blob is what
gets seated on y=62 and the character floats above the dirt by however tall it
was.

**What is left to refuse is a figure the canvas really did cut**, and that is
`edge_run`: the longest unbroken run of drawing down a side column, measured
after the bleed. Across the pack it runs 0 to 30 and then one at 51, which is
fire_breather's idle at over three quarters of the frame height flat against
the wall. `EDGE_RUN_MAX` is 40, in the gap.

**IT BOUGHT ALMOST NO NEW POSES AND THAT IS NOT THE POINT.** Drawn frames went
634 to 642, because the walk was already substituting a neighbour. What moved
is WHICH frame each pose gets: **poses that had to substitute went 138 to 49**,
so 89 of them now show the drawing the animation actually intended.

##### And it only ever looked at the SIDES, while the bleed is mostly vertical

Reported by a player looking at the clubhouse: the four characters on the floor
had black fragments hanging off them. They did. **Nineteen of the sixty eight
carried a piece of a DIFFERENT figure** in a pose that screen can show: a pair
of somebody else's shoes floating over Alice's head, 278 pixels of another
character lying at Hermes' feet, a spare head along the bottom of Krampus and
the Headless Horseman.

**The premise one line up is false one step earlier.** "A strip is one image cut
into 64px cells" is true, and every strip really is a single row of them, so the
only neighbour `drop_edge_bleed` looked for was left or right. But the strips
were themselves cut out of a TALLER sheet, so a 64px cell catches the bottom of
the figure above it or the top of the one below. Opened by hand,
`hermes_pitch` frame 2 is Mrs Claus with her head clipped off at the top of the
cell and the next Mrs Claus's white hair intruding along the bottom.

**The measurement is what named it, and it is the shape of a check doing its job
on one axis.** Over the shipped table, of 558 detached blobs:

| touching | count |
|---|---|
| a SIDE edge | **0** |
| the top | 71 |
| the bottom | 284 |
| no edge at all | 203 |

Zero on the sides is the rule working perfectly. Everything else was never
asked about.

**Nothing could report it**, which is why it took a player: a stray blob is a
valid drawing, every pose was present, every pose was its own drawing and
differed from idle, and that is every property the guards here ask for. They ask
whether a frame is its own art. None asked whether it is ONLY its own art.

**A TOP OR BOTTOM BLOB NEEDS A CLEARANCE AND A SIDE ONE DOES NOT**, and that
asymmetry is the whole of the fix. Sideways, the neighbour is past the cell wall
and a character's own arm reaches the edge still attached to the character, so
touching the edge is the entire test. Vertically the figure STANDS on the bottom
edge, so a foot drawn clear of the leg is a detached blob on that edge and is
not bleed.

**`BLEED_GAP` is 3 and the band it sits in is empty**, which is `MASS_FLOOR`'s
rule rather than a guess. Of the 400 blobs on a top or bottom edge: 10 within a
pixel of the figure, **none at 2 or 3**, 10 at 4 to 6, and 380 at 7 or more. The
ten it keeps are the case it exists for, and the biggest is Paul Bunyan's boot
in `run1` and `run2`, 123 pixels of his own character drawn clear of his leg.

**It took nothing away**, which is the sign it is purely subtractive of bleed:
drawn frames 807 before and after, poses on a still 647 before and after. The
same art, with somebody else's removed. Edge strays went **355 to 4**, and the
four are the feet above.

**AND EIGHTEEN FIGURES CAME DOWN ONTO THE DIRT**, which is the paragraph above
about seating paying off a second time. `cleaned()` drops the bleed BEFORE it
measures the baseline, so a bottom edge intruder was the lowest thing in the
frame and was what got seated on y=62, leaving the character hovering above it.
Measured across all 1,360 frames: 1,342 baselines unchanged, **18 moved, every
one of them DOWN**, the biggest being zombie's batting stance by five rows. Not
one moved up, which is what says this was a correction rather than a shuffle.

##### And the pitcher hovered over his own mound, because a guard read the wrong edge

Found by looking at the plate camera: the pitcher stood on the infield dirt
with the mound, its rubber and a strip of grass drawn BELOW him, empty.
Measured, his `windup` frame left **17 empty rows** of its 64 row cell under
the figure, which at that camera is 35 logical pixels of air.

**A sprite is drawn with the bottom of its CELL on the dirt**, so an unseated
frame is a figure hovering over its own shadow. `cleaned()` seats every frame
on y=62 and the refusal above it was written:

```python
if shift > 0 and top - shift < 0:
    shift = top          # as far down as there is room for
```

**That reads as "there is not enough room above to move it down" and is about
the wrong edge.** Moving content DOWN drops rows off the BOTTOM, and the
target is y=62 with row 63 spare, so nothing lit is ever lost: a downward
shift cannot clip. What the clause actually did was refuse the whole shift for
any figure drawn against the top of its cell, **which is exactly the frame
that needs seating most**.

| | frames of 1,360 |
|---|---|
| sitting six rows or more above the ground | **291** |
| of those, refused by that one clause | **287** |
| after the fix | **0** |

The worst was 39 rows, more than half the cell.

**They are complete figures rather than clipped ones**, which was settled by
opening the pack's own strip rather than by reasoning: the middle two frames
of a run are drawn high in the cell with a neighbour's hat bleeding in
underneath, `drop_edge_bleed` takes the bleed off, and the figure is left
where the artist put it. Hat, face and both feet are all there.

**There was no animation bounce to lose**, which is the thing to check before
seating anything. If seating flattened a stride it would already have
flattened the other 1,070 frames the builder does seat, and the medians say it
seats them: the pack's convention is feet on the floor with the motion in the
limbs.

**It cost nothing.** 807 poses from a drawn frame and 647 on a still, before
and after, and the table is 1186KB either way. The same art, standing on the
ground.

**`check-posture.mjs` holds it**, beside the bleed rule and for the same
reason: what shipped was data rather than behaviour. The gap is 1 by
construction, so anything over that means a seat was refused. **Proved by
pointing it at the table that shipped one pass ago: 296 problems against 0 on
the rebuilt one**, and by lifting one frame ten rows, which it names exactly.

##### And the EDGE was the wrong half of the rule

The fix above shipped with "ten frames in the clubhouse still carry a small
mark" written under it as an accepted cost, on the argument that the 203 blobs
touching no edge are part art (Mother Nature's leaves, the ball off Alice's
bat) and part bleed, and no geometry tells the two apart. **The first half of
that is true and the conclusion was wrong**, because the rule has two tests in
it and the argument only weighed one.

**Requiring the blob to TOUCH the top or the bottom catches the neighbour that
reached all the way in and misses the one the sheet cut short.** A bar of
somebody's shoulder stopping two rows inside the cell, a hat, a shoe: **87 of
those survived**, and they are what the ten clubhouse marks were.

**The CLEARANCE is what tells art from bleed, and it always was.** A ball, a
falling leaf or a prop is drawn WITH the figure and overlaps its rows, so it
has no clearance to be dropped for. The edge was never doing that work. So the
clearance is the whole test now, above or below, edge or not, and the blobs
that OVERLAP the figure are still never touched.

**All 87 were rendered and looked at one at a time**, which is the only way
this question has ever been settled here. Not one is art: every one sits in the
debris field at the head or the foot of a cell, beside other obvious fragments.
57 of them are within two rows of a cell edge and the deepest eight were blown
up on their own before this changed.

**It took nothing away.** 807 poses from a drawn frame and 647 on a still,
before and after, and the table went 1188KB to 1186KB. The same art, with two
kilobytes of somebody else's removed.

**`check-posture.mjs` holds it now**, in the sprite section beside the row
width and the palette keys, because the thing that shipped was data rather than
behaviour. It walks every pose of every character, resolves a reference first,
and reports any detached blob clear of the figure by `BLEED_GAP`. **The gap is
written in both files on purpose**: the checker reads what the builder wrote,
so a rebuild at a different gap fails here instead of shipping. **And the edge
test came out of both in the same commit**, or the checker would have gone on
certifying the 87.

**Proved by pointing the widened guard at the table that shipped one pass
ago**: 58 poses named, against 0 on the rebuilt one.

**Proved by pointing it at the table that shipped**: 265 problems against 0 on
the rebuilt one. A guard that has only ever seen the fixed file is a guard
nobody knows the teeth of.

#### A random draw asserted as an absolute flaked about once in sixty runs

`RANDOMIZE PUTS THE BEST ARM ON THE MOUND` is a rule and is deterministic. The
two assertions under it were not: they pressed the real button forty times and
demanded no starter under 55 PIT and none at or under 40. Measured over 200,000
draws, the best arm of nine lands under 55 on **0.04%** of them, which is
**1.6% over forty presses**, so that section went red on a build nobody had
touched. That is the commish magic seed and the chase gap arriving a third
time.

**The depth is a fact about the ROSTER, so it is asked of the pool in closed
form.** The chance that nine men drawn from the unlocked roster contain no arm
at all is hypergeometric and exact, so there is nothing left to flake.

#### The batter celebrated his own strikeout

`slump` is the beat after a called third strike, and it was sourced from the
pack's **celebrate** strip, so for **51 of the 68** the picture was the batter
throwing both arms in the air over being rung up. **Nothing could report it.**
The pose was present, it was its own drawing, and it differed from the walk
back, which is every property the guard on it asked for. Found by rendering
every character's slump onto one sheet and looking at it.

**The art is right and was pointed at the wrong man.** It is `cheer` now and
the PITCHER wears it over the same beat, which is what that screen should
always have been saying. Nothing was thrown away and nothing was drawn.

**`slump` IS THE WALK BACK AND ONLY THAT, which is a loss stated plainly.**
The generator made a slump by dropping a parametric figure's arms five pixels
and all sixty eight inherited it. Hand drawn art has nothing in a 64x64 bitmap
that says which pixels are an arm, so the offset has nothing to move, and the
pack drew no dejection. He turns away from the plate, which is the same left
facing still `back` is, so it is a reference and costs nothing. The day
somebody draws a real slump it plugs straight in. `NO_STRIP` in the builder
refuses to source it from a strip again, because the way this comes back is
somebody reaching for the nearest looking frame, and the nearest looking frame
means the opposite.

**The guard that replaced it asks the PICTURE.** The old one asked the table,
and the table was fine: the art was right, the beat was right, the pose went
to the wrong man. So it spies on `drawRunner` over one real frame of the plate
camera and reads back who was drawn with what. It draws rather than reading a
flag, because the pitcher's branch is one `else if` in a chain and the way it
breaks is a branch above it winning.

**FIVE POSES THE PACK CANNOT DRAW STAND ON ITS STILLS.** There is no rear view
in the pack and no fielding art anywhere. `back` and the two backruns are the
LEFT still, so the game reads a profile where it used to read a pair of
shoulders: a camera change rather than a hole, and what most baseball games
show. `catch` takes the FRONT still, which exists for 59 of the 68 and falls
back to left for the other nine, because it has to differ from the right
facing idle or it is a pose nobody can tell happened. `throw` stands on the
right still and really is the same drawing as idle for a character whose pitch
strip was never drawn. Nothing here is generated, which is the handoff's own
rule for fielding art.

**`left` IS EXACTLY `mirror(right)` FOR EVERY CHARACTER**, measured, so the
pack ships a flip rather than a second drawing. The game already mirrors at
draw time (`drawRunner`'s flip, and the lefty batter), so nothing needs a
second copy.

#### A repeated pose is a reference, and it was 37.7% of the table

**Never duplicate art.** A pose that comes out pixel identical to one already
built is stored as `'@thatpose'` and `v2Frame` resolves it before decoding.
Lossless: the same drawing either way, and the two poses share one decoded
rows array instead of building the same one twice.

It is not a rounding saving, because the repeats are structural rather than
accidental. `back` and the two backruns are one left facing still, `catch` and
`throw` are one right facing still, and everything the pack cannot draw stands
on a still as well. Measured over the built table, **37.7%** of it was one
string written again: **1,500KB to 960KB**, and the page **2.21MB to 1.62MB**.

`'@'` is safe as the mark because a row is palette LETTERS, digit run counts
and `.` for transparent, so it can never begin a real row. The resolution is
one step and the builder only ever points at a pose holding pixels, but the
walk is bounded anyway: a hand edited table that pointed two poses at each
other would otherwise lock the page up.

**IT SILENTLY DEFEATED THREE GUARDS, WHICH IS THE PART TO REMEMBER.** All
three compared the STORED STRING (`f.catch === f.idle`, `f.slump !== f.back`),
and against a reference that comparison answers the storage question rather
than the drawing question. `'@idle'` is not `f.idle`, so **the catch, slump
and distinct-pose checks would all have passed on exactly the defect they
exist for**, and the walk back check would have failed on a correct table
because `'@back'` has no rows to count. They ask `v2Frame(k, p).join('/')`
now. Same class as this repo's three wrong extractors, arriving at the data
this time rather than at the parser.

The new guard on it walks all sixteen poses of all sixty eight: every one
decodes to the declared size, every target exists, and **a target may not
itself be a reference**. Proved by pointing one pose at a name that does not
exist and another at a reference, and watching both come back named.

**TWO GUARDS WERE ASKING FOR ART NOBODY DREW**, and they were changed rather
than deleted. Both asserted sixteen DISTINCT drawings a character, which the
generator could promise because a pose there was an arm offset on a parametric
figure. Hand authored art has three views and partial animation, so a
character whose strips were never drawn cannot have sixteen distinct
drawings. What they assert now is the half that still means something: every
pose present, every one decoding to the declared size, catch differing from
idle (the pack CAN answer that one), and a FLOOR under how many action poses
are their own drawing, so a build that quietly went back to stills for
everybody still fails. Filling `docs/ART_ORDER.md` can only make that floor
greener.

**THE INSTALLER MATCHES BRACES AND WILL NOT SEARCH FOR `\n};`.** That works
exactly once. The generated table was pretty printed and ended on its own
line; the built one is minified onto one, so a second run searched past the
table and deleted every line between there and the next block that happened to
close that way. **The page still parsed**, `V2_SPRITES` was still an object,
and the symptom was `Sound is not defined` a thousand lines below the damage.
It refuses to write now unless six sentinel declarations survive the swap, and
running it twice is a no-op.

**AND MINIFYING IT SILENTLY EMPTIED `check-posture.mjs`.** Its sprite section
parsed the table LINE BY LINE, because the generator wrote one frame per line.
Built, it is JSON on one line, so every pattern in there stopped matching and
the key set came back empty: the section reported one problem, that all 68
roster characters have no sprite, while the three checks it actually exists for
(row width, palette keys, missing poses) ran over nothing at all. **A check
reporting the whole roster is not reporting a problem, it is reporting that it
cannot read the file**, and this is the fourth time an extractor here has been
wrong in silence. It `JSON.parse`s the table now, resolves `'@pose'` before
measuring a drawing (a reference has no rows of its own), and asks for all
twenty poses rather than the fifteen that existed when it was written. Proved by
mutation: a dangling reference, a two row short frame and a dropped `cheer` are
each named.

**SIZE IS HEIGHT, NEVER FRAME WIDTH.** `drawCharacter` asked for
`HERO_W * scale`, which on 32x50 art gave a person 1.56 times that tall. The
pack's frames are SQUARE, so the identical line drew everyone twice as wide
and the batter covered the strike zone he is meant to be swinging at.
`HERO_DRAW_H` pins the on screen height and the width follows from whatever
shape the frame is, so the next change of frame shape costs nothing.

Every character is drawn from a PUBLIC DOMAIN source and `mythiball/PD_SOURCES.md`
is the register: source, what the sprite shows, what it avoids. The avoid column
is the point. Disney's Peter Pan, Universal's Frankenstein, MGM's green witch and
ruby slippers are all still owned, and a redraw that drifts back toward one of
them is the failure mode.

### The window is the frame, and the strike zone was 34 pixels across

Reported as the game sitting in a box rather than being played, and as the
strike box being too small to aim at on a phone. Both are the same fault.

**It was a 920px column of cream paper with a picture of a ballgame in it.**
On a 1440x900 desktop the field drew 924x635 with 250 pixels of paper down
each side and the page scrolled anyway; on a 390 phone it was 358x246 in an
844 tall window, under a quarter of the screen. `body.ingame` takes the whole
window now: no page scroll, no card around the field, and the arena is the
one child that grows.

**THE ZONE IS WHY THIS IS A GAMEPLAY FIX AND NOT A LOOK.** `plateGeom` sizes
the zone against the batter, which is right, so it is a fixed 92x120 of the
960x660 world and its size ON SCREEN is whatever the field is drawn at. At
358 wide that is **34x45 CSS pixels against a thumb of about 45**: aiming was
not a skill, it was a guess. Measured after, across six viewports:

| | before | after |
|---|---|---|
| 390x844 | 34x45 | **78x102** |
| 390x664 | | 52x68 |
| 320x568 | | 44x58 |
| 844x390 sideways | | 53x70 |
| 1440x900 | 88x115 | **138x180** |

**THE TWO CAMERAS GET DIFFERENT ANSWERS AND THAT IS THE WHOLE RULE.**
`fitFieldCanvas` lets the PLATE view COVER, because everything it is about
(the zone, the bat, the ball, the catcher) is within a third of a frame of
the plate, so what the crop throws away is stand. The wide view may NOT: a
ball in the right field corner is the entire point of it, and a camera that
cropped the corners during a play would hide the play. So the wide view
contains, and what is left is the letterbox `drawField` already paints. (A
whole scale cannot contain exactly, and what that costs is measured below.)

**IT NEEDS NO COORDINATE MATHS, AND THAT IS THE REASON IT IS CSS.**
`fieldPointFromEvent` maps a pointer through the canvas's own
`getBoundingClientRect`, so a canvas moved and resized in CSS is read
correctly with nothing to keep in step. Written as a transform inside the
paint instead, the drawing and the input would be two copies of one answer
and the aim would drift from the picture the first time either moved.
Asserted rather than argued: four known points in zone units, driven through
real screen coordinates on desktop and on a phone, come back within **0.014
zone units**.

#### And the CSS crop broke the grid, which is the one thing that pass exists for

The first full bleed version was an oversized canvas cropped by the arena's
`overflow`, for the reason directly above: it needs no coordinate maths at all.
What it cost is that the BITMAP stayed capped while the canvas grew. On a 390
phone at device ratio 3 the browser was handed 1280 pixels to show across 2397,
so it upscaled by **1.873**. Every canvas here is `image-rendering: pixelated`,
so that is not blurry, it is **ragged**: at a fractional nearest neighbour scale
some blocks take two device pixels and some take one. That is exactly what the
one resolution pass exists to prevent, arriving at the last step instead of the
first.

**The old guard could not see it**, because it reads the bitmap, where the blit
was still a clean 4x, and never asked what the browser did with that bitmap
afterwards.

**So the canvas is exactly the arena now and the crop moved into the blit.**
`FIELD_CAM` is the one answer the paint, the crisp HUD pass and
`fieldPointFromEvent` all read. The bitmap is the arena's own device pixels, the
world is drawn at a whole `scale` of them, and what does not fit is a SOURCE
rectangle handed to `drawImage` rather than an overhang. The browser scales
nothing. Measured after: `scale` a whole 3 to 12 across six screens, bitmap to
arena exactly **1.000** on every one.

**What it costs in FILL was written up here as small and it is not.** The claim
was "0.4 to 0.9 megapixels against the 1.13 of the fixed 1280x880 it replaced",
which is what an arena sized canvas costs in CSS pixels. The arena is sized in
DEVICE pixels, so a 390 phone at ratio 3 is **1.65 megapixels a frame** and a
1920x1080 retina desktop is 3.6. Nobody had multiplied by the ratio. See the
next section: the framing stays, and the drawing comes back down.

#### So the page draws at a WHOLE FRACTION of the screen, and the browser finishes

The camera above is right about the grid and it is 1.65 megapixels a frame on a
390 phone at ratio 3, where the fixed bitmap it replaced spent 1.13. Measured
at 4x throttle, changing nothing but the ratio, **the fill is the frame**: 1.65
MP ran 36.3 and 36.6 ms with about two thirds of frames over 33ms, and 0.18 MP
ran 19.7 and 20.0 with 1.5%.

**That contradicts this file's own note that `setCPUThrottlingRate` leaves
rasterizing alone, and the note is what is wrong.** Headless Chromium has no
GPU here, so the compositor is on the CPU and the throttle slows it with
everything else. A real phone composites on its GPU, so these numbers are a
**ceiling** on what a player feels rather than a reading of it. What is not in
doubt is that the pixels are spent.

**The browser is allowed the last step as long as it is a WHOLE one.** A whole
number upscale of a whole number grid is still a whole number grid: a block ends
up `scale` device pixels across either way, and what changes is how much of that
magnification the page pays for. `fieldDraw` picks the **smallest divisor of
`scale` that is still at CSS resolution or better**. On a ratio 3 phone at scale
8 that is 4, so the page draws a quarter of the pixels.

**THE FRAMING IS NOT ALLOWED TO MOVE**, which is what makes this a drawing
change rather than a camera one. Deciding the whole camera in CSS pixels was
tried first and it CROPS: `ceil` overshoots by a fifth at 2.50 where it
overshoots by a fifteenth at 7.49, so the phone lost 16 blocks of world. The
scale, the crop and the offset are all still worked out in device pixels.

**What it bought, interleaved, two runs an arm**, alternating because this
file's own history records an A B A pass reading 9.5ms of nothing but a page
warming up:

| bitmap | mean | over 33ms | over 50ms |
|---|---|---|---|
| 0.48 MP | 34.0, 34.7 | 39%, 45% | 3.4%, 3.9% |
| 1.65 MP | 37.6, 37.2 | 62%, 60% | 7.9%, 8.1% |

The arms do not overlap on any of the three, which is what the single runs
before them could not say. A visible hitch halves.

**IT IS STILL OUT OF BAND, AND THAT IS THE FULL BLEED LAYOUT RATHER THAN THIS.**
The field was a 358x246 box and it is the window now, so drawn at CSS resolution
it is about two and a half times the pixels the boxed version spent. That is the
thing that was asked for. Taking `draw` below the floor would buy the rest and
would be drawing the type and the sprites softer than the screen can show, which
is the one thing the resolution pass exists to refuse.

**A prime scale gets nothing**, and that is worth knowing before reading a flat
result as a broken function. The step has to be whole, so `draw` has to DIVIDE
`scale`: at scale 7 the divisors are 1 and 7 and the floor rules out 1, so the
wide camera on a ratio 3 phone draws at full device resolution like everything
else. The plate camera is where the game sits and it lands on 8.

**Two things read the draw resolution and two deliberately do not.** The bitmap
and the crisp HUD pass are in bitmap pixels, so both are `draw`. The element's
CSS size and `FIELD_VIEW` are about the SCREEN, so both are `scale`: sized off
the bitmap the picture would shrink to a fraction of the arena instead of being
upscaled onto it, and read off the draw the ball's minimum size would grow on
exactly the phones that floor exists for.

**The wide camera is contain ROUNDED UP, which is a crop.** The scale has to be
whole, and rounding down spends the whole rounding loss on bars: a desktop at
2.54 drops to 2 and draws a 640 wide field in a 1280 arena, half the window
dark. Rounding up spends it on the binding axis. Measured over six screens it
crops nothing on three and 8.8%, 13% and 25% of ONE axis on the other three,
**and the 25% case was looked at rather than reasoned about**: the foul lines,
both corners and the whole wall are still in frame, because the world carries
margin around the park.

**Two guards were reading the old camera and both had to change.** This is the
repo's oldest lesson arriving at the checkers rather than the page:

- `one grid` derived the scale as `cv.width / (FIELD_W / PIX)`. That was true
  while the canvas held the whole world, and the canvas holds a CROP now, so
  bitmap over world is the crop's share and has no reason to be whole. **Asked
  the old way it passed on the canvas the browser was upscaling by 1.87.** It
  reads `FIELD_CAM`, and the second claim is the one the old shape could not
  make at all: the browser's last step is a whole number and the bitmap times
  that step is exactly the pixels the arena occupies.
- The upright zone measurement used `r.width / FIELD_W` and `r.height /
  FIELD_H`, which under a crop are two different scales, so it answered a zone
  **37 by 68** for a box that is 92 by 120. Not even the right shape. It inverts
  `FIELD_CAM` the way `fieldPointFromEvent` does.

**And one guard was pinning a number rather than a claim.** `the ball is four
CSS pixels on a phone` asserted `FIELD_VIEW < 0.5`, and the fix made the field
BIGGER: a logical pixel went from just under half a CSS pixel to exactly half.
`ballCss` on its own cannot fail, because the floor is four over the view and
the check multiplies it back, so what it asks now is that the floor really is
above the five logical pixels it replaced.

**The plate camera's focus is not the middle of the picture.** The zone sits
at world x 442 to 534 and the batter is drawn to the RIGHT of it, about 553
to 750, so a crop centred on the canvas cut his bat off at the frame's edge.
596 holds both.

**Four layout faults, and every one of them was silent:**

- **`flex:1 1 auto` gave the arena nothing.** Its basis is its own content
  and the canvas inside it is absolutely positioned, so the content is
  nothing: the deck below claimed more than the window had, free space came
  out NEGATIVE, and the arena measured **zero pixels tall**. The field fell
  back to drawing at its bitmap size and the fit was skipped every frame.
- **`#app` is a plain block**, so a flex child two levels down inherits
  nothing from the wrap and is content sized. The screen measured 515 of a
  900 tall window. The chain has to be unbroken.
- **A cover only zooms once the box is taller than its width over 1.4545**,
  which on a 390 phone is 268 pixels. At an arena of 265 the field is width
  limited, the scale is 1, and the zone comes out 37 on a 664 tall phone
  against 74 on an 844. The arena's floor is what makes the cover engage.
- **Sideways, the arena spanned thirty grid rows.** That worked while its
  height came from the field's own aspect; given a height of its own, those
  thirty tracks absorbed it and squeezed every item in the right hand column
  into a row about eleven pixels tall. The line score came out 8 pixels high
  with its table painted over the swing buttons. It is absolutely positioned
  on the left now and the deck flows in the padding it leaves.

##### FOUR CONTROLS WERE OFF THE WINDOW, AND THE ARENA'S OWN FLOOR PUT ONE OF THEM THERE

```
node mythiball/check-reach.mjs          six screens, two minutes of play each
node mythiball/check-reach.mjs --quick  one screen of play, and every sheet
```

`--quick` cuts the screens it PLAYS from six to one. It does not cut the sheet
section, which walks five viewports either way, because opening a plaque costs
seconds where playing a screen costs two minutes.

Measured across eleven viewports, both halves of the game, reading every
pressable control's rectangle against the window rather than looking at a
screenshot. `body.ingame` sets `overflow:hidden`, so a control past the edge is
not a scroll away, it is **gone**.

| | what was off the screen |
|---|---|
| 320x568, batting | `Bunt`, 24px off the right: the third swing was unreachable |
| 320x568, pitching | `End Game`, 24px below the bottom |
| 667x375 sideways, pitching | `Mound`, 18px below the bottom |
| 844x390 sideways, pitching | `Slowball`, 30px off the right |

**A ROW OF CONTROLS THAT DOES NOT WRAP DOES NOT GET SHORTER, IT RUNS OFF THE
SIDE.** `.swing-modes` and `.pitch-select .type-row` were both `display:flex`
with no wrap, so three buttons that want 318 pixels in a 268 pixel deck simply
hung off the end. Wrapping is on the base rule now: it costs nothing when there
is room, and it is the net rather than the plan, because a wrapped row is a
second line of deck and the deck is what the camera pays for.

**THE SWING LABEL NAMED THREE KEYS A PHONE DOES NOT HAVE**, and it was 43 of the
50 pixels that row was over by. `Swing (1/2/3)` is an instruction for a
keyboard, on the row a thumb uses most. It is a POINTER question rather than a
width one, the same way the coach notes are: a narrow desktop window still has
the keys and a 768 tablet still does not, so it reads `COARSE`.

**AND THE TIGHTENING IS NOT BEHIND A WIDTH QUERY, which the first version was.**
What is narrow is the COLUMN and not the window: held sideways the deck is a 253
pixel column beside the field in a 667 pixel window, so a query on the viewport
tightened the phone that needed it and missed the one that needed it more. The
deck's own End Game and Mound buttons have been at ten pixels since the
redesign, so the two pressed rows join them rather than getting a new size.

**THE ARENA'S FLOOR WAS PUSHING A CONTROL OFF THE SCREEN, and it was dead
everywhere else.** It read `min-height:min(56vh, 480px)`. The arena is the one
child of that column with grow, so on any window with spare pixels it takes
everything the deck does not want and the floor is never reached. **The only
window where the floor did anything was one with no spare pixels**, and a flex
box cannot shrink a child below its min-height: at 320x568 the deck wanted 231
of 536, the floor held 318, and the Mound row was laid out 13 pixels below the
bottom of the window.

What the floor is actually for is the plate camera's COVER, which only zooms
once the box is taller than its width over 1.4545; under that the field is width
limited and the zone collapses to something a thumb cannot aim at. **So the
floor is that threshold and nothing else**, written against the WIDTH because
that is what it is a fact about: `69vw` is 220 at 320 wide and 269 at 390, which
is the 268 the threshold was measured at. Above it the arena still takes
everything going, so no screen that fitted before moves: the one arena that
changed is 320x568 while pitching, 318 to 305.

**AND THE SELECTOR FOR THE TIGHTENING WAS WRONG FIRST, which the measurement
caught and reading would not have.** The swing buttons are `.mode-btn` and the
rule asked for `.btn`, so it matched nothing, and the row passed only because
the wrap it had just been given caught it. Under a fine pointer that is the
right answer and on a phone it is a line of deck bought for nothing.

**What the row was really doing is worth seeing**, because `flex-shrink` hides
it: with no wrap the label was being CRUSHED from 90 pixels to 43, its own text
cut, and Bunt still hung off the edge. Two faults in one row, and the crushed
label is invisible in any rule.

**Measured as a touch device, which is the one that ships**, the label reads
`Swing`, the row is 253 of 268 and holds one line, and the deck is smaller than
it was before any of this: the field GREW on every phone. 320x568 batting 421 to
458, 390x844 batting 702 to 705. Under a fine pointer the label keeps its key
names, the row wraps rather than overflowing, and everything still fits.

**Eleven viewports, both halves, both pointer kinds: nothing off the window and
nothing overflowing.** The one arena that got smaller is 320x568 while pitching,
318 to 305, which is the half where you aim a reticle that is floored in CSS
pixels anyway.

##### A CONTROL UNDER ANOTHER ONE IS THE WORSE HALF OF THE SAME FAULT

Off the screen it does nothing. Underneath something else it does the WRONG
thing, and that is the one that cost a game. Measured by asking every pair of
visible controls whether their rectangles meet:

| | what was on top of what |
|---|---|
| 320x568, batting | `End Game` over the whole width of `Bunt` and a sliver of `Power` |
| 667x375 sideways, pitching | `End Game` over ten pixels of `Mound` |

**THE FIRST WAS MINE, ONE COMMIT OLD, AND THE WIDE BRANCH'S OWN NOTE PREDICTED
IT.** Pinning the End Game row to the corner won back the 24 pixels a 320x568
phone was over by while pitching, and then landed it on the swing buttons: the
note above says in as many words that a chip pinned to the bottom of a tall
window lands there. **What actually fixed the overflow is the arena's floor**,
and the pin was redundant the moment that landed. Two fixes for one fault, and
the one that keeps every control apart is the one to keep.

**The second predates all of this.** Out of the flow, the chip lands in the
bottom right corner of whatever is there, and sideways the deck is a column
about a third of the window wide, so `Mound` ran to 572 and the chip started at
562. A tap meaning "change my pitcher" opened the sheet that abandons the game.

**The row keeps its height and its panel colour and gives up side padding**,
because Mound and Steal are pressed and a control has to look like one, and what
a narrow column is short of is width. Twenty pixels: the gap goes minus ten to
plus ten at 667, plus 28 at 720, plus 70 at 844, and nothing wider moves at all.
Four candidates were measured; the two that moved the chip instead bought nothing
or made it worse (putting the row back in the flow at that width pushes the chip
off the bottom).

**AND THE SIDEWAYS DECK HAS A FLOOR, which is recorded rather than fixed.** It is
a fixed 339 pixels of content whatever the window is (a line score, the meter and
its rows, and the controls), so landscape needs 371 pixels of window height.
667x375 makes it by four. **568x320, an iPhone 5 held sideways, is 51 over and
`Mound` is off the bottom**, and it was before any of this. Capping the play by
play there buys nothing, because the play by play is not what is over: the column
is about 170 pixels wide, the three pitch buttons wrap to three lines in it, and
the meter alone is 214. That is a redesign of the sideways deck rather than a
rule, so `check-reach` does not list that screen and this paragraph says why.

##### AND THE LAYOUT CLASS DID NOT FOLLOW A PHONE BEING TURNED

`roomfill` is what the stylesheet keys off, and it is toggled in `render()`.
`onRoomResize` returned early on any screen but the menu, so **a window turned
mid-game kept whichever answer it had at kickoff.** The media queries beside it
follow the window on their own, so what a rotated tablet got was one branch's
CSS with the other branch's class: two halves of one layout describing different
windows, and nothing anywhere saying so.

**It is the rule the menu already runs on, arriving at the game.** The section on
the phone menu says a rotation is not a render and that the listener is what
keeps the two in step; the listener was there and its first statement was a
return. The class is one line and costs nothing to keep current, and the menu
still only repaints on the menu, because that is a canvas redraw and this is not.

**`check-reach` turns every screen sideways mid-game now**, which is a thing a
player does with a phone and nothing here had ever done, and asserts both halves:
that the class agrees with the query, and that no control has left the window or
landed on another one in the new shape.

##### THE GUARD FOR ALL THREE, and nothing else here could see the class

`check-firstpitch` measures the glass and asks whether one pitch can be READ;
`verify-rules` puts the game in a situation and asks whether the rule is right. A
button off the side of the window is neither: the rule is right, the picture is
right, and the control is not there.

**IT PLAYS RATHER THAN POSING, and the first draft of it posed.** Measuring the
first frame of a game would have passed every one of the four faults, because the
deck GROWS: the play by play fills up all game, a pitching deck is taller than a
batting one, and the mound offer and the send button come and go with the
situation. So it plays at each screen and keeps the WORST reading of every
control. **It asks both pointer kinds**, because one of the four was a label
naming keys and the label is shorter on a touch screen.

**IT IS BOUNDED IN WALL CLOCK RATHER THAN IN PRESSES, and it does not wait a game
out.** A press budget is a guess about how fast the game runs. The result screen
has controls of its own and nothing about them depends on how the game got there,
so it is reached by ENDING the game rather than by playing to the last out.

**AND IT PLAYED A SECOND GAME WITHOUT NOTICING.** Pressing Space all game is a
dreadful pitcher, so the other side can reach the mercy rule inside two minutes.
The walk asked for a Continue button BEFORE it asked whether the game was over,
found `Play again` on the result screen, clicked it, and every reading at the end
belonged to a game four pitches old: it reported a play by play of nought lines
on a screen that had just played a whole game. **The final whistle is asked
first now**, and the button list no longer matches anything that starts a game.

**AND ITS COVERAGE CLAIM ASKED THE WRONG THING TWICE.** It wanted two innings
first, which two minutes of a Fast game does not reach, and innings are not what
this is about: the deck grows because the PLAY BY PLAY fills up. Counted in LINES
instead, the threshold is a guess about the font and the phone, and it guessed
sixteen against a measured thirteen. **The cap is the claim**: the log is held to
16vh in a game and scrolls past it, so the deck is as tall as it will ever get
the moment that box OVERFLOWS, and asked of the box there is nothing to guess.
That box is 91 pixels on the shortest phone and holds about five lines, so
thirteen is well past it. Measured on one screen in two minutes: 344 samples,
twelve controls, a full log.

**AND SIDEWAYS THE BOX IS NOT THERE AT ALL NOW**, so that claim reads the game's
own state instead on those two screens. A box that is hidden by design and a box
that never filled are the same reading of `scrollHeight`, which is exactly the
shape of a claim that goes quiet.

##### THE WALK COULD NOT PITCH, AND THEN ITS SPAM ANSWERED EVERY FIELDING WINDOW

Two coverage failures, found by asserting coverage rather than by reading.

**A PITCH IS THREE PRESSES AND SPACE IS ONLY THE THIRD.** Pick a type, press
Throw, then release. Space answers the release meter and nothing else, so a walk
that pressed Space sat on the selection screen for its whole budget: two minutes
of the pitching half produced nought pitches, nought log lines and an inning that
never ended, and it read as the play by play failing to fill rather than as a
pitch never being thrown.

**AND THE FIELDING WINDOWS BELONG TO THE WATCHER, NOT TO THE BLIND PRESS.** The
walk has an rAF watcher that arms each window and presses at its ideal, which is
what makes the fielding realistic; the loop then pressed Space as fast as it could
and resolved every window at a t near nought before that timer fired. Measured:
**nought answered at the ideal across all six screens**, with games finishing 12-0,
because a throw at t=0 is a throw away. Now the loop leaves an open window alone,
and the two halves are asserted separately because they fail differently: a window
that never OPENS means no ball was put in play, and one that opens and is never
ANSWERED means something else got to it first. Scores went to 0-1, 1-0 and 3-0.

##### THE REPLAY CHIP HAD A ROW OF ITS OWN, AND HALF THE SWEEP NEVER SAW IT

Replay is offered while a highlight is stored, which means after a double, a
triple or a home run, so whether a walk ever measures it is a fact about the dice:
it appeared on **two of the six screens and both of those reported it off the
window**. A control half the sweep never looks at is the badge nothing can light,
so the page's own `rememberHighlight` is called at the half way mark with the
longest of the three labels, which is the widest the chip ever gets.

**What it found is that one optional control cost the deck a whole row**, because
it was built beside Steal, Send and the mound offer, and sideways the row it was in
WRAPPED. Measured at 667 by 375, the row was laid out 52 pixels below the bottom of
the window and the page ran 180 pixels long; at 844 by 390 it landed ON the End
Game chip, 32 pixels by 23, so a tap meaning "show me that again" opened the sheet
that abandons the game. It sits with End Game now, in a row that already exists and
that already leaves the flow on a wide window, so a stored highlight costs the deck
nothing and the camera nothing. **The portrait phone's field grew 44 pixels** for
it.

##### AND SIDEWAYS THE PLAY BY PLAY WAS GIVEN 34vh OF A WINDOW WITH NOTHING LEFT

The sideways branch made the screen `display:block`, which is all that was ever
needed to keep the arena out of a grid column and is NOT the same thing as keeping
it out of the flow. What the block cost is that nothing in the deck could shrink,
so the play by play took its share of the window whatever was above it: measured
at 844 by 390 while pitching, the deck's fixed part ended at 344 of 390, the log
took 133 more, and the page ran 87 pixels long with `overflow:hidden` cutting the
rest. At 667 by 375 it was 128 and the log started exactly at the bottom edge, so
the record of the game was not on the screen at all.

**Three things fix it and two of them are the at bat card's own argument.**

- **The column is a flex column**, so the deck's parts can give way.
- **The play by play is HIDDEN sideways**, like the at bat card above it. A 217
  pixel column on a 375 tall phone holds the line score, the pitch rows and the
  way out, and that is all: shrunk instead it is 14 pixels of empty panel, which
  is worse than absent, because a box that is always empty teaches a reader that
  the game has stopped narrating. What it narrates is on the screen anyway, in the
  callout, the placards and the line score, and it comes back the moment the phone
  is turned upright.
- **End Game comes back into the flow**, which is the tall window's own rule
  arriving sideways: the pin exists because every pixel of deck is a pixel the
  camera pushes the picture down by, and sideways the deck is a column BESIDE the
  field and is not standing on the picture at all. Pinned, the flow did not know
  the chips were there and the row above them was laid out to the window's bottom.

**AND THE PITCH TYPES ARE A TWO COLUMN GRID NOW RATHER THAN A WRAPPED ROW.**
Whether three buttons came out as two rows or three depended on how long that
pitcher's pitch NAMES were: The Heat and Fastball pair inside the column and
Curveball and Changeup do not, so the deck was 31 pixels taller against some arms
than others. A grid is two rows whatever the names are, and the NAME is what gives.
Same lesson as the fantasy row's named areas.

**The chip row holds one line by construction too**, and the chip that can lose
letters is the one nobody needs: End Game is the way out of a run and never
shrinks, Replay is an offer to watch something again.

##### AND THE TWO SHEETS THAT OPEN OVER THE FIELD HAD NEVER BEEN OPENED

`check-reach` plays with Space and presses the deck, so the bullpen and the coach
plaque were the two surfaces in this game nothing had ever measured. `.arena` sets
`overflow:hidden`, which is the part that makes this worse than a control off the
side of the window: a plaque taller than the arena is not a scroll away and it is
not merely off screen, it is CUT, by a box two levels up that has nothing to do
with sheets. Both halves of that file's own fault were there:

| | what was gone |
|---|---|
| 320x568 | the sheet is 445px against a 341px arena, so it hung **52px off the TOP** and the heading and the whole note explaining the rule were not drawn |
| 667x375 sideways | **Stay with him**, which is the only way out that does not change your pitcher, ran 23px past the bottom |

So a reader who opened the bullpen sideways to look and not to change anything had
no press left that did not change something. **Nothing threw**, the sheet rendered,
and every arm on it was correct.

**The cap is a percentage of the arena and the middle of the sheet scrolls.** The
heading and the bar stay outside the scroller, because the title says which sheet
this is and the bar is the control the game is waiting on. It is measured after the
sheet is on the page, since a box with no layout box answers zero for
`scrollHeight` and `clientHeight` alike and a read at build time says every sheet
fits.

**THE STATE LINE AND THE RULE WERE ONE PARAGRAPH, and that is what made 320 bad.**
Who is on the mound and how tired he is changes on every open and is the reason
anybody came, so it stays above the scroller. The three sentences after it are a
RULE, and printed first they were 70px of a 178px scrollport: a first look at a 320
by 568 phone met **none of the eight arms**. The rule goes BELOW the arms now,
which is the boss battle's order arriving at a sheet, since the arms are the
decision and the rule is the reference. Visible arms went 0 to 3 there, 4 to 8 at
360x640, and 3 to 6 sideways.

**It is a footnote and deliberately NOT a one shot.** Keying it to a first open the
way the coach cards are keyed was tried and is the worse trade: it hides a rule for
ever to save a scroll, and the how to play page carries the same rule in more
detail anyway, including the recovery rate this sheet never mentioned.

**The shade is the cut sheet's, from the baseball game, for the same reason and
with the same two sided claim.** A row clipped on the scrollport's own edge reads
as the last row, and a cue still showing at the end of the list is the lie the
other way, so it is toggled off the real scroll state and asserted in both
directions. A sticky zero height overlay rather than an inset shadow, because an
inset shadow paints under opaque children and the arms are opaque.

**WHAT THE GUARD ASKS IS REACHABILITY AND NOT CONTAINMENT**, which is the
distinction the play by play claim in the same file already makes. An arm's
rectangle legitimately sits outside the window when it is scrolled away, so what
may never be outside it is the BOX, the heading and the bar; and the scroller has
to actually reach its own last row.

**ITS FIRST DRAFT OPENED THE SHEET IN THE FRAME THE COACH WAS DISMISSED IN**, so
the pitch deck was still being painted and the arena was transiently TALLER than it
ever is in play. With the cap deliberately removed the sheet then FITTED at
320x568 and the guard reported only the sideways arm of its own defect. The arena
is shortest when the deck is tallest, so the pessimistic reading needs the deck
drawn and the log started. Three seconds of play, and both arms are named.

**The coach plaque is measured and is correct today**, 196 to 250px against every
arena in the sweep. It is in the guard because it is the first thing a stranger
meets and a fourth step would break it in silence.

##### THE DECK WAS TOO TALL FOR A SHORT PHONE, and it took three passes to close

**IT IS CLOSED. What follows is the history**, kept because the two things it
rules out are still ruled out and the third pass only worked because they were.
The at bat card is gone from the deck, End Game left the flow, and the section
above finishes it: no control is off the window on any of eleven viewports.

**The one line here that the fix contradicts is the one about the arena's
floor**, so read them together. Capping the floor to RESERVE room for the deck
is still wrong, for the reason given below. What was done instead is that the
floor stopped being a viewport-height number at all: `min(56vh, 480px)` was dead
on every window with spare pixels and harmful on the one without, and it is the
cover threshold in `vw` now, which is the thing it was always standing in for.
The zone on the 360 phone this paragraph worries about does not move.

Measured through the real page while pitching, which is the tallest the deck
gets:

| | window | arena | the deck wants | what happens |
|---|---|---|---|---|
| 390x844 | 844 | 473 | 367 | the at bat card is cut to 47 of 97 |
| 360x780 | 780 | 437 | 367 | cut to **19** |
| 360x640 | 640 | 358 | 359 | cut to 16, **and 58px is off the window** |
| 320x568 | 568 | 318 | 372 | cut to 16, **and 103px is off** |

**`.atbat` is the only child in the deck with any shrink in it**, so the whole
of a short window's shortfall lands there, and what a player sees is one line
cut mid sentence: `The Great Ape cannot handle the`. Past that, the arena's
floor wins outright and the page runs longer than a window that
`overflow:hidden` then cuts, so the End Game row is off the bottom with no way
to scroll to it.

**Making the card rigid is not the fix and was tried**: the shortfall moves
straight to the window, so 390x844 went from a clipped card to a page 54 pixels
too long. **Capping the arena's floor is not the fix either**: reserving enough
for the deck takes the arena under the cover threshold on a 360 phone, and the
zone falls from 46 to about 30, which is the thing that floor was raised for.

**What is actually wrong is that the deck needs about 360 pixels**, and on a 640
tall phone there are 582 to share with the field. The answer is a smaller deck,
which is a design pass rather than a flex rule: the at bat card on one line, and
End Game somewhere other than a permanent 39 pixel row under the play by play.
Nothing here should be changed by moving a `flex` value.

**The SWING button is the pitcher's now, and only his.** Batting, a tap on
the field has always done both jobs: `touchstart` puts the bat where the
finger is and the click that follows swings it, so **the tap IS the aim and
the timing**. The button underneath could only ever swing at wherever the bat
already was, which on a phone is wherever you last touched, so it was the one
control that could not aim: pressing it was a worse swing than tapping,
offered in bigger type. It is also 70 pixels of deck, and on a phone the deck
is what the zone is paying for. Pitching keeps it, because at the moment the
ball goes there is nothing left to aim: the spot was already chosen.

**Both how-to surfaces were edited in the same commit**, which is this repo's
own rule about the coach notes teaching a removed control.

**And it kept the batter's word, so a phone showed TWO THROW BUTTONS.** Relabelled
from SWING to THROW it read as a second copy of the pitch panel's own Throw a few
hundred pixels above it, in bigger type and a louder colour, and **it was dead for
most of the time it was on screen**: the only thing it does is call `releaseNow`,
which exists for the 1150ms the release meter sweeps. Before that, the biggest
reddest control on the phone did nothing at all. Found by taking a screenshot of a
real at bat and looking at it, which is how three things on this page have been
found now.

It says **RELEASE** and it is on screen for exactly as long as there is a release
to make. **The paint loop owns that and `refreshHud` cannot**, which is the point
worth keeping: `refreshHud` fires on a ball, a strike or an out, and a meter starts
and ends between two of those. `refreshReleaseButton` sits beside
`refreshStealButton` in the frame loop and writes only when the answer changes.

**The copy was left alone deliberately.** The long page already says "click, tap or
Space" and the short notes say "stop the bar in the green", both of which are true
on every device. The button is confined to 900px and under by its own CSS, so
naming it would be a note that is wrong on a desktop.

**The guard changed from a button to the zone, and that is a change rather
than a loosening.** The sideways section used to find the SWING button and
assert it was above the fold. There is no button while batting, so it now
measures the zone: where it lands, and how big it is, in both orientations,
with a floor of 40. **The size floor is the point of it**: the defect that
section was written for drew a 182 pixel field sideways, which puts the zone
at about 17 across, and being on the screen is not the same question as being
reachable. It caught a real shortfall on its first run (37 across at 390x664)
and a second on its second: it was measuring during the WIDE camera, before a
pitch was live, where the zone is correctly small because there is nothing to
hit. It waits for `plateViewActive` now.

**The gap before a pitch is thinking time and it was too short.** Reported as
wanting longer to think. What a batter gets is `betweenPitches` plus
`windup`, because the meter is up but frozen through the windup, so the two
are one pause: **2.1 seconds, now 3.2**. That sum is the whole claim; what a
game's median pitch to pitch comes out at is longer again and is not
re-measured, because `scratchpad/pacing.mjs` needs several games an arm to
say anything. Only that one beat moved: the beats after something HAPPENS are
ceremony, and nobody is deciding anything while the ball is in the outfield.

**And a fixed wait in the suite broke on it.** The late break section slept
2600ms for a pitch, which was the flight plus its windup with about 200 to
spare, and 100 more of windup took the spare away: the umpire had not called
it, the count had not moved, and the section reported the mechanic as gone.
It waits on the pitch being resolved now. A fixed wait past a beat somebody
is allowed to tune is a test that fails on the next tuning pass.

### Every screen that is not the game MOVES, and only in two properties

```
node mythiball/check-motion.mjs
```

Asked for: the menus, the pop ups and everything that is not gameplay should be
immersive and exciting, with smooth animation. Before this pass the page had
**two keyframes in sixteen thousand lines**, and the biggest reward in the game
was 26 bits of confetti clipped inside a 55px heading.

**EVERYTHING ANIMATES A TRANSFORM OR AN OPACITY AND NOTHING ELSE.** Those are
the two properties a browser composites, so a card rising costs no layout and
no paint on the frame it moves. The guard READS the stylesheet for it: every
`@keyframes mo-*` block is brace matched and may declare `transform`,
`opacity` and the count-up's `--n`, and nothing else. A breathing ring that
animated its `box-shadow` instead would be a repaint every frame, and it
renders perfectly.

**A SCREEN RISES IN ONCE, ON ARRIVAL, and that rule is the one easiest to
lose.** Most screens here re-render whole on every choice (a city, a colour,
a setting), so an entrance keyed to `render()` replays on every tap and the
page flinches whenever it is touched. `motionAfterRender` runs the
choreography only when the screen CHANGES; a same-screen render pops the
control that was pressed instead. The pressed control is remembered on
`pointerdown` in the capture phase, because the render it causes has emptied
the page before any later handler could look. **A caller that renders a
screen the starter already rendered gets no entrance**, which is the rule
working: `startSeason` and `startCup` render their own hubs.

**NEVER ON THE GAME.** Every rule that could reach a control over the field is
written under `body:not(.ingame)`, and `motionAfterRender` returns on
`'game'`. Six checkers measure rectangles while a pitch is live, and a
position or a transform added to a deck button by a rule written for the menus
is a control that moves off the window with nothing saying so. The coach
plaque and the bullpen get an ENTRANCE, which is over by the time anything is
measured, and nothing that keeps moving.

**A FINISHED ENTRANCE TAKES ITS CLASS WITH IT.** `animation-fill-mode: both`
holds the last keyframe, and a held keyframe beats every ordinary declaration,
so a card that kept `mo-in` could never lift on hover or tilt again. One
`animationend` listener removes it. **And a hidden element gets none**: it
cannot run the animation, so it would keep the class and the first keyframe
until whenever it is shown. The roster's infobox was the case that found
it.

**THE SCOREBOARD COUNTS, AND THE NUMBER IN THE DOM IS THE RESULT FROM THE FIRST
FRAME.** The figure is the element's `::after`, drawn off a registered `--n`
the browser animates, and the element's own text is the score, set
transparent. So a reader, a screen reader and `verify-rules` reading
`#app .card p` all get the answer, while the eye gets the count. **`--n` is
registered `inherits: true` and that is the whole of it working**: a pseudo
element only sees a registered property its host passes down, so registered
`inherits: false` the host counted to 7 and the figure read 0 for ever. It
rendered perfectly, and the guard reads the pseudo element's `counter-reset`
for that reason.

**THE CELEBRATION IS ONE CANVAS, NOT TWO HUNDRED NODES.** Two hundred animated
nodes is two hundred layers. It takes no pointer, stops when its pieces are
down, when the screen changes (`render()` stops it before it empties the
page), or when another starts, and a win screen calls it AFTER the screen is
built, because a celebration started inside the render it belongs to would be
stopped by that same render's check. The cup and the season champion defer
theirs by a timer for the same reason.

**The old trophy's three rectangles were `.trophy` pseudo elements** and they
still matched the drawn cup, so a navy slab hung off its base and the rays drew
at the old bowl's size in the corner. `.trophy.cup` takes every box property
back. Found by looking.

**The tilt and the glare are for a mouse.** They sit under
`(hover: hover) and (pointer: fine)`, in the stylesheet and in the listener,
because a finger has no hover: on a phone a tilt is a card that leans after it
has been let go of. The listener writes custom properties and never a
transform, so the stylesheet stays the one place that says what a tilted card
looks like.

**REDUCED MOTION IS A FULL STOP.** No entrance, no count, no confetti, no
wire ticker, no infinite sheen, and the guard asserts
`document.getAnimations()` is empty on three screens under
`reducedMotion: 'reduce'`, plus that the scoreboard still reads the score with
nothing counting.

**A slam and a rise start outside the box they end in**, and a transformed box
adds to the page's scrollable width: a verdict at twice its size put a
sideways scrollbar under a phone for the half second it took to land. `#app`
is `overflow: clip` off the game, which makes no scroll container (so sticky
still sticks), with a clip margin that keeps the cards' shadows. The guard
samples `scrollWidth` three times during every entrance.

**Proved by mutation**: keeping the entrance class, replaying on the same
screen, a keyframe animating `box-shadow`, and `inherits: false` each fail
their own claims.

#### How to play opens by SHOWING how to play

Asked for: clear animations with simple instructions at the top, before all
the text. The page opened on eight hundred words, so a stranger met the rules
before the controls. `howtoQuickStart()` is four loops above everything else:
**aim, swing, pitch, field**. Each is a picture, a name and one line.

**It is SVG and CSS, not the game's canvas drawers**, and that is the one
place this page departs from "the figures are drawn by the game's own
functions". A canvas repainted every frame would be a second render loop on a
menu screen, running for as long as somebody reads, needing its own stop on
every way off the page. A CSS animation stops with its node. The colours are
the game's (the bat's green oval, the white reticle, the release bar's bands,
the catch ring over its sweet ring), and the drawn figures further down still
hold the detail.

**THE RESTING STATE IS THE LESSON.** Every moving part is drawn at the one
frame that explains its step (the bat on the ball, the cursor stopped in the
green, the ring at its tightest) and the keyframes animate AWAY from that. So
reduced motion is not a blank or a frame zero, it is the answer. The guard
asserts it as relations between drawn things rather than as coordinates, so a
restyle that keeps the lesson keeps passing.

**Every keyframe is `mo-qs-*`**, which puts the loops under the
compositor-only rule the first section of `check-motion` already reads. That
rule now allows `animation-timing-function` inside a keyframe, which is the
easing of the segment starting there rather than an animated property: it is
how the release cursor sweeps linearly and then stops dead.

**The copy is device neutral**, like the rest of this page: "click, tap or
press Space", "the mouse, a finger or the arrow keys". `check-posture` scans
the quick start for stale controls too, because it teaches the same controls
in fewer words and a stale one there is the same lie told first.

**Proved by mutation**: the card moved below the batting card, every loop
stopped, the ring's resting scale removed, and the release cursor resting
outside the green each fail their own claims.

##### And writing its guard found an at bat that started in the wrong game

Every beat before the next batter was `setTimeout(startAtBat, ms)`, which
starts an at bat in whatever game is current when it lands. Six sites: the
first pitch, a hit, two paths to an out, a walk and the break between half
innings. `check-motion` starts games fast enough to leave one inside its first
400ms, and one run in several threw `Cannot read properties of null (reading
'over')`.

**THE THROW IS THE LOUD HALF.** Replace the game inside the beat instead,
which Play again on a result screen can do inside a home run's, and the old
timer begins a SECOND at bat in the new game on top of its own. Driven with a
spy on `startAtBat`: two calls into the replacing game before, one after.
Nothing throws in that case, which is why it had never been seen.

`atBatIn(ms)` captures the game and fires only into it. This is the throw
window's rule, the catch window's and the robbery's, arriving a fourth time at
the one timer every plate appearance goes through. `verify-rules` drives both
halves in "an at bat starts in its own game".

### The home page is a ballpark, on every width

The home screen used to be a drawn clubhouse room (a desktop) and a strip of
floorboard (a phone). The owner's verdict: the dugout does not fit. The game is a
ballpark, so the front door is one. `renderMenu` is one layout for every window:
`parkHero()`, then the franchise panel, the locker, the four mode tiles and the
wire.

**The park is `drawField`, the wide camera's own painter, with no game running.**
So the park on the menu IS the park you play in. `MENU_THEME` is set around that
one call and `currentTheme()` returns it first; nothing else may set it. A running
franchise shows its own park ("Home"); otherwise one opponent park is picked per
visit (`MENU_PARK`) and kept, so a resize does not change the scenery.

**The players stand at the real posts** (`fieldGeom`, `fielderPosts`): a batter, a
pitcher, a catcher and the seven fielders, from `clubhouseCast(10)` (your own
player bats when you have one). They play one pitch on a 4.2 second loop
(`heroBeat`): the windup, the swing and a ball off the bat. Reduced motion holds
the first frame and stops the loop.

Five things to know before touching it:

- **Two canvases, one box.** The park is painted once; the people are an overlay
  repainted at most 30 times a second. `.hero-box` carries `--ar`, the crop's
  shape, so the two cannot disagree.
- **Retro draws at the world's block size** (1/PIX) and CSS blows it up with
  `--pxr`; smooth draws at the size it is shown. `heroCanvas()` is the one place.
- **`drawField` queues its type on `HUD_Q`** for the game's crisp pass. The hero
  replays what it queued onto its own canvas and splices it back off, so the
  game's queue is untouched.
- **The crop is by window SHAPE**, not the `roomfill` class: an upright window
  gets the infield (`HERO_TALL`), anything else the whole park. A short window
  caps the park's height so the franchise button stays near the top.
- **`.pk-box` was already the pack sheet's class.** The first draft used it and
  the park came out 620 wide inside an 880 panel. Every hero class is `hero-*`.

`check-motion`, `check-collection` and `verify-rules` ("the room fills up", the
phone menu, turning it sideways) assert the park is there, keeps its shape, takes
the width the layout allows, and leaves the franchise button above the fold on a
desktop.

**A phone tile stands up rather than lying down**, keyed on `body.roomfill`, so
the name holds 16px. **The franchise is the button**, its status read off the
save by `franchisePanel()`. **A rotation is not a render**: the resize listener
re-renders the menu so the crop follows the phone.

The same height arithmetic broke the GAME screen sideways once: under
`max-height: 560px` the furniture goes in a column beside the field.

The regression suite, which is the thing to run after editing:

```
node mythiball/check-posture.mjs   unlisted, the capital alias still lands, the brand holds, and every park's scenery exists
node mythiball/check-collection.mjs  the ten starters, the packs, the ladder and your own player
node mythiball/sprites/tools/build_rig.mjs --dry   the roster still bakes from its specs
node mythiball/check-rules.mjs     whole games, and the sport's own arithmetic
node mythiball/check-reach.mjs      every control a game offers is inside the window,
                                   including the two sheets that open over the field
node mythiball/verify-rules.mjs    the rules replayed in a headless browser
node mythiball/calibrate.mjs       the pitch duel's rates against TARGETS bands (minutes; --quick for a loop, --easy/--hard for a tier)
node mythiball/check-frames.mjs 70 normal --phone --cpu=4   frame times, on the machine that matters
node mythiball/check-runs.mjs      runs per game, with a defence that turns up (--jobs=N to run several at once)
node mythiball/check-bat.mjs       the swing's own curves, and that skill pays
node mythiball/check-skill.mjs     what a PERSON hits, four rungs of skill, both swings
node mythiball/check-firstpitch.mjs  whether a stranger can READ one pitch
node mythiball/check-motion.mjs    the menus move, every entrance finishes, and
                                   none of it reaches the game
node mythiball/whiff.mjs 3000      what the other dugout does with a swing, at a
                                   sample that can answer (a meter, not a guard)
node scripts/check-dashes.mjs      mythiball is on the GUARDED list
```

`calibrate.mjs` is the hoops TARGETS idea at the plate: real pitches from an
unsteered arm against the real CPU swing AI, with swing, whiff, chase, foul
and called-strike rates held to bands. The opponent is pinned because a
random club moved whiff per swing by twenty points between identical runs.
Small samples (hit mix, contact quality) are printed as information rather
than banded, so no target flaps on noise. The meter has already paid for
itself once: it measured the CPU at 55 whiffs per hundred swings, the swing
jitter tiers came down about a fifth, and it measures in the mid forties
now (MLB runs about 25). The file's header records the procedure, and any
further move repeats it: measure, touch the jitter, measure again.

### A SITUATION IS NOT A GAME, AND THREE RULES DID NOT SURVIVE ONE

```
node mythiball/check-rules.mjs          120 games
node mythiball/check-rules.mjs 400      more of them
```

`verify-rules.mjs` asks whether a SITUATION is handled, and every scenario in it
is one the audit found the game getting wrong: a walk-off walk, a mercy rule, a
tag on a caught fly. So each of its claims is about one line. **Nothing had ever
asked whether the sport's arithmetic holds over a WHOLE GAME**, which is a
different question with a different shape: a property of every state the game
can reach rather than of a state somebody thought to set up.

**THE CLAIM IS THE IDENTITY.** Every batter who comes to the plate in a half
inning either makes an out, scores, or is standing on a base when it ends, so

```
plate appearances = outs + runs + men left on base
```

exactly, every half inning, with no tolerance. It is violated by any runner
duplicated, dropped, advanced twice or put out twice, which is most of the ways
a base-running rule can be wrong, and **not one of them throws**: a runner who
quietly vanishes off second leaves a game that renders perfectly and is missing
a man.

**IT DRIVES THE REAL FUNCTIONS AND NEVER A COPY**, in the order
`scheduleContactPlay` calls them, and what it leaves out is the ANIMATION layer:
a plate appearance here is the outcome applied and the transition taken, which
is what the play timers do once the ball has landed. Timers are suppressed for
the sweep, or a game would take its own eight minutes and the sweep would be a
reading of one.

**Three rules were wrong, and one of them was wrong in every half inning of
every game ever played here.** None of them threw and none of them drew
anything odd.

- **THE HOME TEAM NEVER BATTED IN AN EXTRA INNING IT WAS BEHIND IN.**
  `checkGameOver`'s regulation clause asked `inning > innings` alone, and
  `endHalfInning` flips the half BEFORE it asks, so the clause also fired at the
  end of the TOP of an extra inning, where the number has already passed
  regulation and the home team has not come to the plate. Every extra-inning
  game the away team scored in ended on the spot with a legal-looking final
  score. **What ends a game is a COMPLETED inning, and that is read off the half
  rather than off the number.**
- **THE MAN WHO MADE THE THIRD OUT LED OFF THE NEXT INNING.** Three functions
  ended a half by handing straight to `endHalfInning` and not one advanced the
  order first, so the batter who had just been rung up was standing back in the
  box. **The inning board said so out loud and nobody read it**: `Due up` is
  three names off `bat.idx`, so it led with the man who had just made the third
  out, every half inning, on the one screen between the halves. **Putting the
  advance inside `endHalfInning` is the wrong fix and it is the obvious one**,
  because a half inning can also end on a runner caught stealing, and that
  plate appearance is NOT finished: the batter at the plate
  leads off the next inning, which is the real rule and is what the steal path
  already does. Advancing there would skip a man. So the advance belongs to the
  end of an APPEARANCE, which is what `endPlateAppearance` is.
- **A HIT COULD BE THE THIRD OUT AND THE INNING DID NOT END.** A runner waved
  round and gunned down at the plate is an out charged to a man who came to the
  plate an at bat ago, so the batter is safe, the play is a hit, and `wasOut` is
  false: `afterHitTransition` had no test for three, and the game carried on
  with three outs on the board, a fourth batter and a fifth. **What ends a half
  inning is the third out and never what produced it.**

**A GROUND OUT NOW MOVES THE MEN IT FORCED, and that one is a rule the game
never had rather than a rule it got wrong.** A runner on first stayed on first
for ever, so the fielder's choice, the run-scoring grounder and the whole idea
of a productive out were missing, and what the screen showed was a legal play no
defence would ever choose. The batter is retired at first and everybody on an
unbroken chain of bases behind him moves up; a man on second or third with first
EMPTY was never forced and holds, which is why it walks the chain rather than
shoving every runner along. **Nobody moves on the third out**, because no run
may score on a play whose third out is the batter retired before he reaches
first.

**It is worth +0.58 runs a nine innings a side**, measured through the sweep
against a copy of the page with the rule alone removed, over 200 games an arm on
one seed, which is the controlled comparison: one build, one distribution, the
rule the only difference. That is a real move and it is recorded rather than
compensated, because the old behaviour was not cheaper, it was wrong.

**WHAT WAS NOT RE-MEASURED IS THE ABSOLUTE FIGURE.** `check-runs.mjs` is the
instrument for that, it plays real games through the real buttons, and it takes
the better part of an hour for a sample that its own header says cannot resolve
half a run. So the 6.2 a nine recorded above is now a LOWER BOUND, and the
sweep's +14% says the real number is somewhere near seven. Read it that way, and
if the mode ever needs the run environment settled, that is the file to run
rather than this one: the sweep's outcome distribution is the harness's, not the
game's, so its absolute number means nothing and its difference means everything.

**AN X IS NOT A BLANK, AND THE BOARD HAD A COLUMN TOO MANY.** A home team ahead
when the top of the last inning ends does not bat, and the board wrote the same
empty cell there that it writes for an inning nobody has reached: two different
facts under one blank, and a reader cannot tell a game that stopped early from
one still to be played. It is an X now, the way every line score in this sport
writes it, on the home side and only once the game is finished.

**Writing it exposed a column that was never played.** The board sized itself on
`Math.max(g.innings, g.inning, ...)`, and `endHalfInning` advances the inning
BEFORE it asks whether the game is over, so after the last out of a five inning
game the number reads six and the board drew a sixth column. Empty, it read as a
rendering quirk; with an X in it, it read as a statement that the home team did
not bat in an inning that did not exist. `boardInnings()` leaves `g.inning` out
once the game is over, and keeps it while the game is live because that is the
one moment the lengths do not cover it: the gap between half innings, which is
exactly when the inning board is on screen.

**A SACRIFICE IS NOT AN AT BAT**, which is the whole reason a man who gives
himself up for the runner does not pay for it in his average. Both kinds were
charged one. The sacrifice fly has to be read off the SCORE and never off the
fact that somebody moved, because a man tagging to third is not one; and **a
bunt with nobody on is not a sacrifice at all**, so it is an ordinary out, an
ordinary at bat, and the screen no longer calls it something it was not.

**`recordHit` IS GONE.** Fifty lines nobody called: a second copy of the runner
rule, written before `applyHitMutation` existed, with no send, no hold and no
tag in it. A dead copy of a rule is the worst kind of comment, because the next
person to fix a base-running bug finds two answers and fixes the one that is not
running.

**And extra innings announced themselves every inning.** `inning > innings` is
true of the eleventh and the twelfth as well, so a long game said "tied after
nine, extra innings" at the top of each of them, by which point it had not been
tied for three innings.

#### And on a play the PLAYER fields, the picture never followed the book

`scheduleContactPlay` calls `simReconcile` after the mutation, for the reason
that function's own header gives: the book can send a runner further than the
plan did, so his run is extended from where he is now and the picture agrees.
**The two resolvers a FIELDED play goes through never called it.** An infield
single moves every runner up, a throwing error moves them two, and a caught fly
runs the tag, and in all three the sim left them standing where the plan put
them. It is not a new gap, and the ground out's force made it a third case, so
it is closed rather than worked around.

**AND "NOT ON A BASE" MEANT "HE SCORED", WHICH IS WRONG FOR A MAN PUT OUT ON
ONE.** `simReconcile` reads `g.bases`, so a runner who is off it was assumed to
have reached home. That is right for the two cases it was written for, a runner
waved round and one gunned down at the plate, who really did run there. It is
wrong for a man thrown out at THIRD tagging up from second, and for a man forced
at second on a double play: the picture carried both of them past the bag they
were tagged at and slid them into home. A caller that knows the bag records it
now, in `p.outAt`.

**And the plate marker drew a play at the plate for an out at third.** It puts
the catcher on home with the ball and the runner sliding into him, and `tagUp`
set it for both of its outs, so a man thrown out at third was a picture of a
play at a base nobody was near.

#### Three ways the harness was wrong, and two of them read as the page being wrong

- **OUTS ARE READ ABSOLUTE AND NEVER AS A DELTA.** The outs made in a half ARE
  `g.outs` at the moment it ends, because that counter is what `endHalfInning`
  resets. A delta over one plate appearance is the outs that appearance made,
  which is never three, and the first draft reported every half inning in the
  game as unbalanced.
- **IT DID THE PAGE'S JOB AND HID THE DEFECT IT SHOULD HAVE FOUND.** Every
  branch carried its own `if (g.outs >= 3) endHalfInning()` before handing on,
  so the hit whose third out is a runner gunned down at the plate ended the
  inning HERE and not there, and the third defect above was invisible until the
  branch was replaced by `scheduleContactPlay`'s own four lines verbatim.
- **THE SACRIFICE FLY SCENARIO RACED THE DICE.** `tagUp` reads the SEND button
  only for the team you are managing and the other dugout is always on auto, so
  a scenario that sets the rule on a game you are playing at HOME sets a rule
  nobody consults, and then rolls for the throw. Written that way it passed or
  failed on how fast the man on third happened to be.

**Every guard was proved by reintroducing its defect in a copy of the page**
(`MYTHIBALL_PAGE`, which both browser suites here already take). The extra
innings clause fails two claims, the order fails four, and the third out fails
one, naming itself: `an at bat starts with 3 out`.

**COVERAGE IS HALF OF IT.** A sweep that never reached an extra inning says
nothing about extra innings, and one with no runner thrown out at the plate
never tested the one out charged to a man who came to the plate an at bat ago,
so the counts are asserted. The two claims a random sweep can only meet by luck
are set by hand beside it.

**Both new guards run in CI** (`.github/workflows/mythiball-checks.yml`), and
`check-rules` goes BEFORE `verify-rules` because it is the cheap one and the
broad one: it sweeps games rather than posing situations, so it names a broken
rule in a minute where the other takes the best part of an hour.

### EVERY OTHER CHECKER HERE ASKS WHETHER SOMETHING IS CORRECT

```
node mythiball/check-firstpitch.mjs
```

Reported as the game seeming very off inside one or two pitches, after weeks
of green suites. It was, and nothing in this file could see it, because the
question every guard here asks is whether a thing is DRAWN RIGHT and the
question nobody had asked is whether it can be SEEN.

**The audit loop is what produced that.** Pick a file, find a real silent
defect, fix it, prove it, write it up. That loop never terminates on a
codebase this size, because there is always another silent defect, and it
never arrives at PLAYABLE because playable was never the target. This file
reached four thousand lines of correct findings while the strike zone was a
hairline nobody could find.

**So this checker measures THE GLASS, never the source.** A zone drawn at
`lineWidth = 2` is a claim about logical field pixels; what a thumb aims at
is CSS pixels after the camera, the crop and the browser's own last step.
The numbers are read back off the canvas and out of `FIELD_CAM`. Every
assertion is a PROPERTY that survives a redesign: a contrast ratio, a size
floor, a state that has to end. Pinning pixels would make it a test of the
three phones somebody thought of, which is the mistake this file exists to
stop repeating.

#### The ball was still sitting there when the next pitch was due

`pitch.closed` was only ever set where the AT BAT ends: a ball in play, a
walk, an out. Every other outcome is most of them, so after a called ball, a
called strike, a foul, a foul bunt and a whiff the arrived ball went on
being drawn in the catcher's mitt for the whole gap.

Measured on a 390 phone: the flight is **42 to 46 frames over about 700ms**,
and the ball then sat motionless on the plate for **152 to 157 frames, which
is 2.5 seconds**. The reader spent three and a half times longer looking at
where the pitch stopped than at the pitch. Through the checker with the
defect reintroduced: **662 frames of a ball in the mitt over 22 seconds, and
it never cleared once.**

**Nothing failed and nothing could.** A ball drawn in the mitt is a valid
drawing, the flight was correct, the call was correct.

`clearPitchSoon` is the one place, called from all four sites. It carries
the identity check this file already runs at three other doors: **a timer
fires into its OWN pitch or not at all**, because the next pitch, a new at
bat or a new game can all have replaced it while the hold was out.

**A FOULED BALL IS NOT IN THE MITT**, so the foul and the foul bunt clear at
zero rather than after a beat. Held, the picture is a ball sitting on the
plate while the log says it was fouled off.

**The camera is not affected, which is the thing to check before moving
this.** `plateViewActive` asks `pitch && !closed` OR `plateHold`, and every
one of those sites sets `plateHold` to its own beat plus 300ms, so the plate
view is held by the second clause throughout. Closing the pitch early cuts
nothing away.

#### And a hairline is not a target

The strike zone was a **2px LOGICAL** line, which is **1.78 CSS pixels** on a
390 phone, measuring **2.23:1** against the grass behind it, with a 6% fill
at **1.33:1**. Three to one is the floor for a large graphical object
somebody has to locate; under about 1.5 it is a shape you have to already
know is there. It is **3.73:1** now.

**THE WIDTH IS COUNTED IN BLOCKS, AND THE FIRST FIX COUNTED CSS PIXELS.**
Written `3 / FIELD_VIEW` it asks for three CSS pixels, which is right on a
phone and is **1.8 logical pixels on a desktop**. The world is drawn into
`pixWorld` at `PIX` logical pixels to the block, so that is six tenths of a
block: the line cannot be solid, it antialiases to partial coverage, and it
washes out. Both phones cleared 3 and the desktop came back at **2.48**.

**A line narrower than a block is a line this world cannot draw**, which is
the one-resolution rule the blit already runs on arriving at a stroke. So
`zoneLineMin()` is a whole number of blocks, at least one, and enough of
them to cover three CSS pixels on whatever screen this is. The halo is a
block each side for the same reason.

**It is read across three screens on purpose**: the fault was a length
written in the wrong unit, which is exactly the class of bug that looks fine
on the machine it was written on.

#### And it was not even, because a stroke is centred on its path

Reported from a desktop screenshot: the left edge of the box was visibly
thicker than the right. It was. The zone runs **147.33 to 178 blocks** across,
so `strokeRect` put half a line on each side of a boundary at one end and on
a whole block at the other, and the same `lineWidth` drew two different
widths on two sides of one rectangle.

**No width fixes a stroke**, because half of it always falls either side of
the path. It is **four filled bands on the block grid** now, which are the
same number of blocks by construction whatever the camera is doing, and the
rectangle itself is snapped to the grid. `plateGeom` is untouched: the snap
moves the drawn box by at most half a block and the aim maps where it always
did.

#### THE CHARACTERS WERE SUPER BLURRY AND THE FIELD WAS NOT

The oldest kind of finding in this file, reported by a player, invisible to
every guard, and one rounding.

A character is drawn into `pixWorld` through a `1/PIX` transform, so **three
logical units are one pixel of the blit**, and the destination was rounded to
a whole LOGICAL unit. Two positions in every three therefore put the bitmap
between two pixels, **and a bitmap between two pixels is resampled across its
WHOLE SURFACE rather than at its edges.** The chalk is a path and antialiases
only where it ends; a person is a photograph of a person.

Measured through one character at three of the sizes this game draws, the
share of his own pixels that are one of his own palette colours:

| | logical destination | on the grid |
|---|---|---|
| a fielder, 36.67 blocks | 37.3% | **100%** |
| the pitcher, 55.67 blocks | 45.8% | **100%** |
| the batter, 78 blocks | 55.1% | **100%** |

**NOT ONE OF THE TWENTY SIZES THIS GAME DRAWS IS ON THE GRID** in the other
direction either: blocks per pixel of the 64px art runs 0.234 to 1.219 and
never lands on a whole ratio. That is not what was wrong and it is worth
knowing before reading the numbers above as a claim about the art. What the
snap buys is that the ART'S OWN upscale, which is `fillRect` and has hard
edges by construction, is the only resampling left in the path.

A character is also **built at the pixels the blit covers** rather than in
logical units and reduced three to one on the way in. Measured, that alone
changes nothing (100% either way once the destination lands), so it is kept
for a different reason: a cached sprite is a ninth of the canvas it was.

**The idle bob is one pixel of the BLIT, not one logical unit.** A third of a
block would put the figure between two pixels on alternate beats, so every
standing character would go soft and sharp about twice a second.

**And `drawK` asks the context rather than assuming `PIX`.** The same function
draws the clubhouse and the photo scene through transforms of their own, and
`drawRunner`'s mirror makes the scale negative.

**THE GUARD ASKS THE DESTINATION, NOT THE PIXELS.** A colour count cannot say
whose pixel it is: a figure overlaps the grass, the dirt and the man behind
him, and three ad hoc attempts at it in one afternoon each reported the
opposite of what the eye and the controlled probe both said. The property is
exact and it is the one that broke. Proved by reintroducing the rounding,
which reports **20 of 20 figures off the grid**.

**A half pixel of CSS is a separate hazard and it was NOT this.** The canvas's
own offset came out at 1.5px on a 1512x850 desktop, because centring divides
by two. It is snapped to a whole device pixel now, which is right on its own
terms, and the edge profile is byte identical either way: Chromium happened to
round it. Three of nine screens still land the canvas on a fraction, all of
them from the arena's own layout, and all three are a hundredth of a pixel or
a quarter of one.

### The game is the window, and the deck floats on it

Reported as still looking like a wide box on the screen. It was. Measured
while pitching, which is the tallest the deck ever gets:

| | the field got | now |
|---|---|---|
| 1512x850 desktop | 69% of the window | **95%** |
| 390x844 phone | 65% | **83%** |
| 320x568 phone | 55% | **74%** |

**The arena is `inset:0` and the controls are an overlay.** This file's own
note about the deck said what it needed was to be SMALLER and called that a
design pass rather than a flex rule. The answer is not smaller, it is out of
the flow: a control that sits over the picture costs the picture the
control's own height and nothing else. It also ends the feedback the old
`flex` basis note is about, because nothing the deck does can reach the
camera any more.

**THE AT BAT CARD IS GONE.** It is the same three facts as the placards on
the field and the board above them, laid out as a card with a portrait of the
man who is already the biggest thing on screen holding a bat. Sideways lost
it a year ago on exactly that argument and nothing was missed; the argument
was never about the width.

**THE SCOREBOARD WAS OVER THE PITCHER.** Centred on the window, and the
pitcher stands at world x 480 of 960, so the board sat across the face of the
man about to throw in both cameras. It is right aligned under the away side's
own placard now, and under 600px that placard is hidden so the board goes
back to the top.

#### The camera has to know what the deck is standing on

**The middle of the picture is not the middle of what a player can see.**
Framed on the canvas, the zone's bottom edge came out under the swing row:
the one thing somebody has to find, half behind the one thing they press.

`deckCoverBlocks` is that measurement, and it is **the OVERLAP and never the
deck's own height**. A window too tall for this picture keeps the deck under
the field, where it is just as tall and covers nothing; asked for a height,
the camera would frame the plate a third of the way up a screen with nothing
over it. It is written out as `--deck` as well, because the two bottom
placards are CSS and cannot ask: one measurement, two readers.

**AND THE OVERLAY IS NOT FOR EVERY WINDOW.** The world is 320 by 220 blocks
and the plate camera covers the arena, so what it can show across is about the
arena's aspect times 220. The plate and the batter need about 120 of them.
A 390 by 810 arena comes out at **97**, and the strike zone's own left edge was
outside the frame. There is no framing that fixes that: the picture is the
wrong shape for the hole. So the overlay is gated at `min-aspect-ratio: 3/4`
and a tall window keeps the deck under the field, winning back what this pass
actually removed rather than what it could not.

**The zone is clamped into the crop on top of all that**, because a phone
still crops hard and the batter is the thing that may be lost. `PLATE_KEEP_X`
and `PLATE_KEEP_Y` pull the crop toward the zone from either side, after the
focus and before the world's own edge, which is last because it is the only
one of the three that cannot be argued with.

**EVERY PIXEL THE DECK IS TALL IS A PIXEL THE CAMERA OWES**, and the world
runs out. At 1280x800 the plate crop is 190 of the world's 220 blocks, so
there are 30 blocks of headroom and the deck may cost at most 22 of them. The
pitch name over the swing row came to 27 and the zone went back under the
buttons, at 24 pixels and then at 8. Beside each other they cost 17, and End
Game moved out of the flow into a corner chip because its own row was 33
pixels of that budget spent on the control nobody is looking for.

**A `:not()` chain beats almost everything you write after it.** The rule that
gives the deck its gutters carries three of them, so written with
`position:relative` in it, it beat every later rule that wanted a deck item
out of the flow: the End Game chip asked for a corner and drew in the flow at
the bottom left, under the deck it was meant to sit on. It sets margins and
nothing else now, and what needs a position is what needs a z-index.

**The callout was on the pitcher too**, at 38% of the arena, which is the
mound in both cameras: every call in the game was announced across his face.
Half way down is the band of outfield grass with nothing in it, and it is
still above the zone.

#### The play by play pushed the swing row onto the zone, a line at a time

Reported from a laptop with a screenshot: a black bar across the middle of the
field, lying straight over the strike zone. It was the swing row. **The play by
play sat UNDER it in the flow and grew with every pitch**, so the row rode up the
window a line at a time: `deckCoverBlocks` measured all of it as deck, the camera
had nothing left to pay it with, and by the sixth line the zone was covered.

**Nothing here could see it, because every check measured the first pitch of a
game.** The log is empty then. `check-firstpitch`'s zone section fills it with
twelve lines before it measures now, which is how every game looks by the second
inning, and it asks that the log itself is off the zone as well.

On a wide window the log is out of the flow, in the top left corner under the
score, which is outfield and never the zone or the batter. **The swing row is as
wide as what is in it** rather than edge to edge: a full-width band is a slab
over the batter and the plate wherever it sits.

**And the Mound row was under the picture.** It is static, the arena is
absolutely positioned, so on a wide window the Mound button laid out inside the
window, clear of every other control, and its centre hit-tested to the field
canvas. Nobody could see it or press it. Two rectangles cannot report that, so
`check-reach` hit-tests every control's centre and fails on one that lands in
the arena.

#### A batter is not shown where the pitch is going

The catcher's target is drawn at `pitch.aim`, which is where the arm is TRYING to
put the ball. Shown to a batter during the windup it is the answer printed in the
zone, and a player reported exactly that: a circle saying where the pitch is
going. **Only the pitcher sees it now**, because they chose the spot and it tells
them nothing they do not know. `check-firstpitch` reads it off the drawing calls
(a ring of 11 with a dot of 2 at its centre) in both halves, so a check that never
sees the pitcher's target drawn cannot pass by accident.

#### The pitcher is in the keep, and the deck only counts where it covers the column

Reported from a laptop with a screenshot: a pair of legs on the mound, the park's
sign where the face should be, and no arm. The keep box held the zone and the ball
and nothing above them, so the camera centred on the zone, and a short wide window
started at or below the pitcher's head. Measured at 1366x768 the crop began 55
logical pixels under his head. The zone checks were green the whole time, because
the zone was never what was missing.

**Three changes, and each one was needed:**

- **`plateKeepTop()` is the top of his drawing plus room for the FRESH chip**,
  read off `plateGeom`. It is clamped BEFORE the zone's bottom keep, so the zone
  still wins when the two cannot both be held.
- **`deckOverKeep` counts the deck only where it stands in front of the column the
  ball can land in.** On a wide window the swing row is a box at the bottom left,
  and reserving its whole height cost the camera the 11 blocks the head needed. On
  a desktop the deck is held to half the window less 150 (from 1000 wide), so the
  pitching row wraps at the left instead of reaching the column. Under 1000 it is
  not held, because a sideways phone's End Game went 7 pixels off the window.
- **The camera steps back one whole scale when the head still does not fit.** On a
  21:9 window that leaves bars at the sides, which is the wide camera's answer on
  the same window. The step asks for the head and not for the chip, or a 1366
  laptop would get bars for a picture that was already right.

**The park sign steps aside on the plate camera.** It hangs top centre, which is
the pitcher's face. The wide camera between pitches still shows it.

`check-firstpitch`'s "the pitcher is in the picture" reads the head, the feet and
the sign off the glass on nine screens in both halves. Against the page before the
fix it fails ten claims.

#### There are two batter's boxes and the camera only ever framed one

Reported as nothing, because a screenshot of it looks fine about a quarter of the
time. `drawPlateView` mirrors the hitter about the scene's own `cx` of 480: a lefty
stands at 638 and a righty at 322. The plate camera's focus was the single number
**596**, and the comment over it said the batter is drawn "about 553 to 750",
which is the first-base box and only the first-base box. **That comment is the
whole bug**, written as a fact about the scene by somebody who had looked at one
half of it.

**What it cost, on a 390 phone.** The crop is 117 of the world's 320 blocks and it
held blocks 140 to 257. A righty's box is 68 to 146, so **8.1% of him was in
frame**: a sliver of shoulder at the left edge, with the strike zone stranded in
the left third of the screen and nothing beside it. **52 of the 68 characters bat
right.** At 360 it is 9.4% and at 320 it is 35%.

| | in frame |
|---|---|
| a lefty, any screen | 100% |
| a righty, 390 phone | **8.1%** |
| a righty, 320 phone | 35% |
| either, sideways or desktop | 100% |

Sideways and on a desktop the crop is wide enough to hold both boxes, so **there
is nothing wrong at all on the two screens a developer works on**, which is most
of why it survived. Everything else about it is correct: the scene renders, the
swing plays, the aim maps, and the zone is never clipped, because the keep box
holds the zone and the keep box is the only thing that was ever asked about.

**Found by taking a screenshot and looking at it, which is the fourth time on this
page**, and it nearly survived that too: the man at the plate in the shot was one
of the sixteen lefties, so the picture looked composed.

**So the focus mirrors with the hitter.** `plateFocus()` asks `currentBatter()`,
which is the same call the plate painter makes, so the camera and the scene cannot
disagree about which side of the plate to look at. `batsLeft` is a pure hash of the
key, so it costs nothing and can never flip inside an at bat.

**THE KEEP BOX DOES NOT MIRROR, and that is the half most likely to be tidied up
afterwards.** The zone is drawn at 442 to 534 whichever box the hitter stands in,
so it is a fact about the scene rather than about the at bat, and a keep box
mirrored about `cx` would land at blocks 139 to 176 and stop holding the very thing
it exists for. At 390 the mirrored focus asks for `sx` 63 and the keep box refuses
below 64, so the two disagree by one block and the keep box wins. That is the
arrangement it was written for, working.

**What a narrow phone loses instead is the CATCHER**, who is a sliver at the far
corner and is the one figure here that most reference games do not draw at all.
The note on `PLATE_KEEP_X` used to say the BATTER was the thing a narrow phone
gives up. He is not context: his swing is the entire feedback loop.

**The guard puts each of the sixty eight in the box and RE-FITS**, and the first
draft of it read one camera against 68 hypothetical batters, which cannot see a
camera that follows the hitter: it reported the fixed page as still broken. It
also asserts the crop MOVES between the two boxes, because a run where both hands
framed identically would pass having exercised nothing, and it exempts a screen
holding the whole scene, which correctly never moves. Reintroduced, five
assertions fail and name `popeye (R) 8.1% in frame`.

**The sky above the park is NOT this and is not a defect.** The plate scene is 220
blocks tall and a 390 phone shows 208 of them, because `cover` binds on the height
and there are only 12 blocks of vertical freedom. Framing a shorter band would
make the scale larger and the crop NARROWER: at 140 blocks the phone would show 78
across, which is the width of the batter alone. The sky is what buys the
horizontal room.

##### And then the focus moved to the plate, because the whole view read as angled

Reported next, from the same phone: **why is this angled.** It was.

**Everything in this scene radiates from home**: the base paths, both foul lines,
the batter's boxes. So where the plate sits across the frame is what decides
whether the picture reads square or oblique, and it sat at **21%**. One foul line
swept across the entire frame, the other was off it, and the origin they both
point at was jammed against the left edge.

596 was the midpoint of the zone and the batter TOGETHER, chosen to keep all of
him in frame. The focus is the **zone itself** now (488 is `zx`), so the plate
lands at 48% and the foul lines are symmetric about it.

**IT IS A PICK AND NOT A TUNING VALUE**, because the two cannot both be had.
Rendered at four framings and looked at:

| focus | plate at | zone spans | least visible batter |
|---|---|---|---|
| 596 | 21% | 10-36% | 94.9% |
| 545 | 32% | 21-47% | 83.2% |
| 505 | 43% | 32-58% | 64.5% |
| **488** | **48%** | **37-63%** | **55.9%** |

The arithmetic underneath: a portrait phone shows 117 of the world's 320 blocks,
the batter's sprite is 78 of them, and he has to stand clear of a 31 block zone.
Holding the plate axis AND all of him needs **183 blocks**. No framing does both.
**The playtester was shown all four and chose square.**

**What is cropped is always his BACK**, the edge facing away from the plate, so
his swing and the bat's whole arc are in frame at every setting and on every
screen. That is what the guard holds. The ball's whole range and the zone stay at
100% everywhere too.

**THE GUARD'S SHARE WENT 70 TO 25, AND THAT IS NOT A BAND LOOSENED TO PASS.** The
framing was deliberately changed underneath it, so a guard still demanding 70
would be holding the page to a camera it no longer has. That distinction is the
whole of why this paragraph exists: the rule against moving a band to make a run
pass is about moving the band INSTEAD of fixing the page, and here the page moved
first, on purpose, at the player's request.

**THE BINDING SCREEN IS TALL AND LOW RATIO, NOT NARROW**, which is not the order
anybody guesses and is the second time this file has had to say it. A 320 phone
gets **160** of the world's blocks; a 360x950 at ratio 2 gets **90**, and that is
where the batter bottoms out at **37.1%**. Measured across every plausible phone
rather than assumed, and that screen is in the sweep now. Against a defect of 8.1%
and an unmirrored focus of 0%, a floor of 25 is the middle of a real gap.

**A SMALLER BATTER WAS WRITTEN UP HERE AS THE REAL ANSWER AND IT IS HALF OF ONE.**
The claim was that drawn smaller the plate could be centred with all of him beside
it and nothing given up. **The second half of that is arithmetically false**, and
the sum is two sections down: full containment needs him at about a third of his
size, which the zone's own rules forbid several times over. What shrinking him
really buys is a legible stance rather than a face against the lens, and it is
taken now.

##### And measuring that turned up the ball leaving the frame, which was everybody's

`PLATE_KEEP_X` was `[144, 181]`, a box around the zone and nothing else. A pitch
lands anywhere inside **1.7 zone units**, so the ball reaches blocks **136.6 and
188.7**. Driven through the real pitcher, 4,000 pitches:

| framing | pitches drawn off the frame |
|---|---|
| the first-base box, which this page has always shipped | **2.27%** |
| the mirrored box, with the keep box left alone | **5.63%** |

So **one pitch in forty four already vanished** before any of this, and the fix
above would have made it one in eighteen. The two hands do not get the same room
because the zone sits at 488 against the scene's cx of 480, so mirroring the focus
does not mirror the zone.

**What it looks like is the ball disappearing at the instant it arrives**, which is
the instant somebody is deciding whether to swing. Nothing throws: a ball drawn
outside the source rectangle is simply not blitted.

**So the keep box holds what the ARM CAN THROW, derived from the clamp.**
`PITCH_LOC_MAX` is the one place 1.7 lives now; it was written out **four** times,
in `throwPitch`, again in the late break's re-clamp (which moves the ball after
release), and twice in the batter's own aim cursor. A hand-written 189 beside a 1.7
is two copies of one answer, and `check-numbers`' lesson applies to a camera as
much as to a sentence. The cursor reading the same bound is a free consequence
worth knowing: the bat can now never be put somewhere the frame does not show.

**WHAT GIVES IS THE BATTER, and that is the honest trade rather than a miss.** The
batter is 78 blocks, the ball's range is 52, and their union is 120 against the 117
a 390 phone can show. So about three blocks of his TRAILING edge go: his back, the
side away from the plate. Measured across every phone width in use, on the LIT
figure rather than the 64px cell:

| | worst figure in frame | ball | zone |
|---|---|---|---|
| 320, 360, sideways, desktop | 100% | 100% | 100% |
| 390 | 94.9% | 100% | 100% |
| 412 (the narrowest crop of any phone) | **81%** | 100% | 100% |

**412 binds and 320 does not**, which is not the order anybody guesses: its device
ratio is low against its height, so it gets fewer device pixels across to spend.
Any new screen worth checking is found by measuring, never by taking the smallest.

**A batter's back is cheaper than a ball that disappears**, and the two read
differently as well as costing differently: a ball that vanishes reads as a fault,
where a figure cropped at the frame's edge reads as a camera. It was looked at
rather than reasoned about, on the 412 phone that loses the most.

**THE GUARD MEASURES THE LIT FIGURE, NEVER THE CELL.** A cell is 64 wide and a
character's drawing is 40 to 64 of it, so counting the cell counts transparent
margin as a man: the same phone reads 82.5% of the cell and 81% of the figure.

**And what it asks of him is STRUCTURAL, because on the narrowest screen the three
things cannot all fit.** The claim is that his PLATE-FACING edge is in frame, so
his swing and the bat's whole arc are, whichever box he is in. The 70% share beside
it is a backstop against gross loss and sits against a measured worst of 81 and a
defect of 8.1. The two catch different directions and both are needed: with the
keep box widened and the focus NOT mirrored, one character comes back at **0%**,
entirely off the frame, while his plate-facing edge is still technically inside it.

##### So he came down to 4.6, and FULL CONTAINMENT IS NOT AVAILABLE AT ANY SIZE

He was **5.2 at x 322** and he read as a face against the lens: on a 390 phone the
crop is 117 blocks and he was **78** of them, so a head and a shoulder filled the
left edge and the bat was off the picture. At **4.6 at 344** the whole stance is
legible. Measured through the real camera over all sixty eight:

| | 5.2 at 322 | 4.6 at 344 |
|---|---|---|
| 390x844 at ratio 3 | 55.9% | **69.4%** |
| 412x915 at ratio 2.625 | 50.1% | **62.8%** |
| 360x950 at ratio 2, the binding one | 37.1% | **48.2%** |
| 320x568 at ratio 2 | 87.5% | **100%** |

**THE SIZE IS NOT WHAT WON THAT, AND ON THE BINDING PHONE IT LOSES.** Taken apart,
one change at a time, at the most each is allowed on its own:

| | 390x844 | 360x950 |
|---|---|---|
| shipped, 5.2 at 322 | 55.9% | 37.1% |
| smaller only, 4.6 at 322 | 57.4% | **36.3%** |
| nearer only, 5.2 at 334 | 61.6% | 42.9% |
| both, 4.6 at 344 | **69.4%** | **48.2%** |

He is centred on `batX`, so shrinking him pulls BOTH edges in and the one it pulls
in is the PLATE-FACING edge, which is the half that was in frame. It gives back
almost exactly what it wins. **The gain is the move, and the shrink is what buys the
room to make it**: the mirrored-box rule is `batX < 426 - 16 * batSc`, so at 5.2 he
can only reach 334 and at 4.6 he can reach 344. Ten more logical pixels of travel,
bought with half a point of size.

**So the size is justified on the PICTURE and not on the percentage**, which is the
honest way round. At 5.2 a 390 phone showed a head and a shoulder; at 4.6 it shows
a man holding a bat. That is not a number any guard here can read.

**4.6 AT 344 IS THE FRONTIER, and the pair one step past it is the last value that
passes.** Two rules bound this and they close on each other. His head must stay
below the zone's top edge, which wants him BIGGER (`40 * batSc > 175`, so above
4.375). The MIRRORED box must stay clear of the zone's right edge, which wants him
smaller the nearer he stands (`batX < 426 - 16 * batSc`). **4.4 at 356 was the
first pair tried past the frontier and it satisfies neither properly**: one logical
pixel of head room, and 0.4 the WRONG side of the mirrored box. Solved for eight
pixels of room on each, the answer is 4.6 and 344.

**So `verify-rules` asks for the room as its own assertion**, rather than only
asking the two rules to pass, and it has teeth the pair above cannot prove: 356
fails the original rules as well, so it says nothing about the new one. **4.4 at
347 is the case that does.** Both original rules are GREEN on it, on one pixel, and
the room assertion is the only thing that reports it.

**AND THE THING THAT WAS PROMISED CANNOT BE HAD.** Holding the plate centred AND
the whole batter needs `batX - half >= zoneCentre - cropWidth / 2`, and with both
rules substituted in that is `batSc <= 2.95` against a floor of 4.375. There is no
size that does it, so the trade the 488 framing makes is the real trade and not a
number waiting to be tuned away. What is cropped is still his back, on every
screen.

#### And the middle of the picture was a lawn

Reported as the view still needing a lot of work, with the angle already fixed.
About a **quarter** of a portrait phone's plate view was flat green with nothing in
it at all, between the pitcher's feet and the plate.

**It is geometry rather than missing art, and the crop is what makes it bite.** The
plate camera shows about 350 logical pixels of width around the plate, and
everything this scene draws in that band has diverged outside it by the time it
gets there. Measured at y 500, the two base paths are at x **290 and 670** against
a crop of **312 to 663**, and both foul lines are further out again. So the scene
genuinely contained nothing in the one place the reader looks all game.

**ZOOMING IN IS NOT THE FIX AND IT IS THE OBVIOUS ONE.** `sh` already clamps to the
world's full 220 blocks, so this camera shows sky to catcher and the scale is set
by the arena's height. Framing a shorter band raises the scale and NARROWS the
crop. Worked through rather than driven, because the conclusion does not need a
run: a band of 176 blocks puts a 390 phone at 90 across, which is what the 360x950
already gets, and the batter there is **48.2%** against this phone's 69.4%. Less
lawn bought with the thing the section above spent a pass winning.

**A KEYHOLE IS A REAL BALLPARK FEATURE AND IT IS EXACTLY THE SHAPE OF THE HOLE.**
The retro parks keep a strip of dirt from the mound to the plate, and it is drawn
before both the home circle and the mound so the two ends are covered and it reads
as one continuous piece of infield. It tapers WIDER toward the camera, the way every
other circle of ground in this view already does. Nothing about the camera moves, so
it costs nothing anywhere else.

**Its first version drew a searchlight, and only one park showed it.** The two dirt
ovals carry a lit centre and a darker rim, which is what a circle of ground looks
like from here, and the strip inherited it. A pale tapering wedge with a bright core
IS a beam, and the snow park's track colour is **white**: it drew a spotlight from
the scoreboard to the plate. The strip is darker at both edges and NEUTRAL down the
middle now, so it reads as worn ground. Found by rendering three parks and looking,
which is the fourth time on this page.

### The ball was the smallest thing on the screen it is the point of

Asked for: gameplay and graphics comparable to Backyard Baseball. The whole loop was
walked on a phone as a player meets it (the wait, the flight, the swing, the cut, the
play) and the biggest gap was the same in both cameras. **The ball.** Mid flight it was a
6 logical pixel dot leaving the mound, which is 3.5 CSS pixels on a 390 phone, and it
only became a ball for the last third of the trip. After contact the field camera drew
it as an 8 pixel white disc with a one pixel seam and a shadow two pixels by one, which
against the infield is a speck, and on a base path's chalk was nothing at all. Backyard
Baseball's ball is the biggest, most legible thing on its screen at every moment,
because you cannot time what you cannot see.

- **The plate camera's ball is `6.5 + 6 * e^1.3` now**, 13 logical at release against
  25 at the plate: a 1:2 swell rather than 1:3.6, about a tenth of the pitcher's height
  the whole way. The arrival size did not move, so the mitt still covers it.
- **`ballRadiusMin` is six CSS pixels of radius**, from four. `drawBaseball` draws the
  same dark ring the plate camera's ball has always worn, at a weight scaled to the
  floor, and its shadow is the ball's own width rather than a five logical pixel
  constant. Both ghost trails in the field view were 2 and 3 logical pixels, hardcoded,
  which on a phone is under one CSS pixel: the streak that makes speed read did not
  exist there. They scale off the floor too.

**A BIG HIT LEAVES A COMET**, which is the one piece of Backyard Baseball's grammar this
field never had: the ball you crushed looks crushed. `drawPlaySim` reads `sim.kind`,
and a double, a triple or a home run trails a tapered stroke while it is in the AIR (a
ball rolling in the gap is a ball rolling), gold for a homer. A single keeps its two
quiet ghosts. **The first draft was six ghost discs and against the sky they were six
pale dots a reader had to assemble**; a comet is one shape, so it is a stroke sampled
back along the flight, dark edge first and then the colour, wide at the ball and gone at
the tail. Found by rendering a home run at five instants and looking, which is how the
contact burst's rays got their dark ring the same afternoon: pale rays on pale dirt were
not there over the keyhole.

#### And the PITCH had no streak at all, on the camera the game is played from

That pass gave the ball a floor, a dark ring and a comet on a big hit, and it was all
about the WIDE camera. The plate camera's pitch kept the trail it shipped with: three
discs at 26, 18 and 10 percent white, no dark edge, at nine tenths of the ball's own
radius. Photographed on a desktop, they are three tan blobs on the tan keyhole, which
the composition pass laid down the middle of this exact picture, with a gap between the
last one and the ball. **The streak is what makes a pitch's SPEED read, and speed is
the whole of what a batter is timing.**

It is the comet's shape now, so a moving ball has one language wherever this game draws
one: sampled back along the flight, dark edge first and then the white, wide at the ball
and gone at the tail. Sampled through `platePitchPos`, which is the one flight function
that camera has, so a curveball's trail bends with the curveball.

**THERE ARE TWO PITCH BALLS AND THE OBVIOUS ONE IS THE ONE NOBODY SEES.** `drawField`
has its own, after the early return that hands the picture to `drawPlateView`, and it
looks exactly like the one to fix. An afternoon went into improving it before a
screenshot showed the discs unchanged. **Its ghosts really were on the straight line
between the release point and the plate while the ball itself broke off it**, so a
curveball there trailed like a fastball, and that is fixed too: one function of `e` for
both, the way the plate camera already had it.

**IT IS NOT DEAD, WHICH WAS MEASURED RATHER THAN ASSUMED**, because this repo's own
`recordHit` lesson is that a dead copy of a rule is where the next person spends their
afternoon. `plateViewActive` hands the picture back to the wide camera during a steal, a
tail or a jog, and a pitch can be live in all three. Counted through a real inning with
a probe in the branch: **219 frames**.

**IT COSTS NOTHING, and the single run said otherwise.** `check-frames` came back 47ms
mean with 98% of frames over 33, which reads as a render that has doubled. Interleaved,
two runs an arm against the same build without the trail: **52.84 and 47.41 against
51.54 and 45.51**, a difference smaller than the spread between two passes of one arm.

**AND THE BANDS IN THAT FILE ARE STALE, which is the more useful half.** Run against
`origin/main`, which is what is deployed and has none of this session in it, the same
machine reads **51.47 and 53.13**. Same bytes, and the file's own header records 20ms.
So the numbers are a fact about the box on the day, the bands were anchored two
rendering passes ago, and `check-frames` is a METER for an A/B rather than a verdict on
a build. Do not move those bands to make a run pass, and do not read a red one as a
regression without running both arms.

**THE CONTACT FRAME WAS NEVER SHOWN.** `plateViewActive` returned false the instant
`g.play` existed, and `HITSTOP_MS` shifted every play timer by 80 without holding the
picture, so the cut to the field landed on the same frame as the press. The one thing a
batter presses for was the one thing they never saw, and a hit and a whiff felt the same
at the moment of the thumb. A play holds the plate camera for exactly the hit stop now,
and only a play that began with a swing (`g.contactFx`, set beside `lastSwing.res =
'hit'`): `startedAt` is already shifted by `HITSTOP_MS`, so the hold is the window every
play timer already waits out and the field comes up with the ball at t = 0, which is
where the plate camera leaves it. `HITSTOP_MS` is **150**, because 80 is a fighting
game's number and this beat has a second job.

What is drawn in it: the bat forced onto the contact frame whatever the swing clock
says (which is what a hit stop is), the ball where the pitch landed, a ring and eight
rays opening behind it in the swing's own colour, so a bunt and a power swing read as
their own kind of hit. `verify-rules` asserts both halves: a play scheduled with no swing
behind it still cuts at once, and a swing that connects holds for the hit stop and then
cuts.

**AND THE CATCHER IS GONE FROM THE PLATE CAMERA.** He was a "sliver" at the bottom
right, helmet and shoulders, on the argument that a helmet at the edge says where the
camera stands. On a phone the crop is a third of the scene and the count chip sits in
that corner, so what arrived was a red cap and a brown lump under the placard, cut by
the frame and by the chip, reading as a rendering fault. Backyard Baseball, the mobile
MLB games and The Show's catcher cameras draw no catcher, because the camera IS the
catcher. His mitt stays, as the target and the glove the ball lands in, which is the
only part of him a batter looks at. `catX`, `catY` and `catSc` went with him rather
than staying as constants nothing reads, and the three `verify-rules` claims about his
crown became one claim that there is no catcher geometry: a rule about a figure that is
not drawn is a rule that can only pass.

### Every label on the field was a third of its size, a third of the way to the corner

Found by touring the PITCHING half on a phone, which nothing this session had looked at,
and zooming into a yellow smudge beside the left fielder. It was `THROW TO FIRST · SPACE
OR CLICK`, four CSS pixels tall, a hundred pixels from the bar it belongs under.
`CATCH IT!` was by the light tower.

**`hud()` captures the world context's transform, and that transform already carries
`1/PIX`.** The crisp pass then bridged with `draw / PIX`, so every queued label was
divided by PIX twice: block (160, 209) landed at 13% across and 32% down, which is the
light tower, at a third of its size. Every fielding window's own instruction, the
umpire's `OUT!`, the `GET READY` plate and the replay badge, on every screen, since the
whole-fraction draw pass went in (`ac99f413`). **Nothing threw and nothing could**: a
label drawn in the wrong place is a valid label, and no guard here reads type off the
canvas. The bridge is `draw` now, and the comment over it says why in the same words as
this paragraph so the next person does not re-derive `/ PIX` from the sentence above it.

**And correctly placed they were still five pixels tall on a phone**, because every one
was written in logical pixels and a logical pixel is under half a CSS pixel there. The
crisp pass keeps type sharp; it cannot make it big. `hudPx(px, minCss)` is the ball's
floor arriving at type: a label asks for its logical size or whatever gives it eleven
CSS pixels on this screen, whichever is more, and the throw bar's height and the catch
ring's radii are floored the same way, because a ten pixel bar with a hairline cursor is
not a target either.

**The throw bar was behind the deck on a desktop.** `h * 0.90` is the bottom tenth of the
world, and on a desktop the deck floats over exactly that, so the bar and its cursor sat
behind the pitch buttons and the window was played blind. `FIELD_CAM.deck` is how many
blocks of the crop's bottom the deck covers, measured by `deckCoverBlocks` rather than
assumed, and the bar sits on the deck's top edge when there is one. That is the boss
battle's own rule (a control the game is waiting on goes above the record of it)
arriving at a bar.

**So `check-firstpitch` reads type off the canvas now**, in its last section: it drives a
real throw window and a real catch window on a phone and a desktop, finds the labels'
gold on the glass, and asks where and how big. The throw label has to be centred under
the bar, in the bottom half, at least seven CSS pixels of core, and above the deck where
the deck floats; the catch labels have to bracket the ring. **Its first draft passed the
old page on a desktop, on Humpty Dumpty's straw hat**: 71 gold pixels wide, 8 rows,
centred at the plate, which is exactly the shape of a label. The label is printed on the
bar's near black and a hat is not, so every band records whether the pixels beside it
are dark and the throw claim asks for that; the catch claim asks for a ring's reach in
both axes. Proved with `MYTHIBALL_PAGE` pointed at the commit before the fix: the phone
finds no label at all, the desktop finds the hat and refuses it, four claims red.

**THE CATCH RING WAS DRAWN WHERE THE SPOT WOULD BE WITH THE CAMERA AT REST**, and the
camera is never at rest while a fly ball is in the air. `drawScreenPass` runs after
`camApply` is restored, so the landing spot (a world point) was painted raw while the
fielder running at it was painted under `cameraNow`'s track, zoomed and panned toward
the ball. Measured on a phone through a real fly out: **44 logical pixels** between the
ring and the spot at the moment the window opened (the camera was still panned toward
the plate from the previous play), 3.5 once the track caught up, 8.9 as it eased out.
Fifty CSS pixels between the ring and the glove, at the instant somebody is deciding
when to press, and it drifted while they looked. `camPt()` is `camApply` as a function
of one point, and the spot and the lead line go through it; the ring's SIZE does not,
because it is floored in CSS pixels for a thumb rather than being a thing in the world.
The robbery borrows the catch ring's drawing, so it is covered by the same line.

**The pitcher's reticle and the release cursor were hairlines on a phone**, for the same
reason as the labels. The reticle was a white ring of radius 13 in a 2 logical stroke:
eleven CSS pixels across, under a pixel thick, no dark edge, over the zone's own grid.
The release meter was 16 logical wide with a 4 logical cursor: a two pixel line in a
seven pixel bar, and the release is the whole of pitching. The bat's oval beside them
has had a dark halo, a solid dot and real weight for a year. Both are floored in CSS
pixels through `hudPx` now and the reticle wears the dark ring first. The batting half
got its readability pass first because that is the half that was reported; the pitching
half had every one of the same faults and nobody had toured it.

**The band above the picture went black mid inning, and it was two things meeting.**
`fieldBand` samples the world's top row for the sky, keyed on the crop, and re-samples
when the fit changes. On a phone the log under the field grows a line on every call, so
the arena shrinks and the fit changes DURING A PLAY; and `cameraNow` punches in on a
close play at first, which puts the STANDS at the top of the world canvas. Together: a
sample at exactly the wrong frame, `rgb(5,5,8)` over a blue sky, stuck for the rest of
the inning. Measured through a ground out at first. A sample is refused while anything
is moving the camera (a play, a tail, a steal, a replay, or `Cam.zoom` above rest) and
asked again next frame, and the park is in the key because a new game in a new park
keeps the same crop.

### The horizon was at 40%, and no amount of detail fixes a composition

Put beside Backyard Baseball's plate shot by the playtester, with "we need to be a lot
closer to them". Every pass above this one was detail: the ball, the labels, the
contact frame, the keyhole. All of it was right and the picture still read as a diagram
of a diamond drawn in front of a wall, and the reason is where the ground ENDS.

| | Backyard | ours, before | after |
|---|---|---|---|
| background above the grass | 13% of the frame | **40%**, 16% of it crowd dots | 28% of the world, 9% of a desktop crop |
| pitcher against the batter | about a fifth | **63%** | 41% |
| second baseman against the pitcher | small | **as big** | half |
| foul lines | run to the fence | ended in the outfield grass | run to the fence |
| strike zone | a pane with corner brackets | a nine cell cage in heavy white | a pane with gold corners |

**Everything on the ground was refit to a horizon of 184.** Nothing under `plateGeom`
that a camera guard reads moved: the zone and the batter are where they were, because
every framing assertion in `verify-rules` and `check-firstpitch` is written against them.
What moved is everything that is not them, and it moved as a set: the stands to a strip a
third the height at lower alpha, the infield ring, both base paths, the keyhole, the
mound, the bases and the fence lines, and the seven fielders and three runners onto a
DEPTH SCALE (0.70 at the fence up to 1.25 at the corners, the pitcher at 1.9).

**The pitcher's release point and the arm chip are read off his geometry.** `relY` is the
top of his windup and `pitBall` rides his hands, both as fractions of `HERO_DRAW_H x
pitSc`; the FRESH chip over his head was passed to `drawScreenPass` as the literal 196,
which was over his face the moment he got smaller. It is `moundY - height - 12` now.

**A desktop crop shows less of the sky than a phone and that is the camera, not a
number to tune.** The plate camera covers, a 1440x900 arena binds on width, and the crop
cannot read below the world's bottom, so the top of a desktop's frame is world y 144
whatever the horizon is. At 172 the roofline was cut and the picture opened on half a
crowd; 184 puts the whole crowd band and the wall in a desktop frame and costs a phone
twelve logical pixels of grass. That is the whole reason for the last 12.

**The home circle was 210 across, which on a phone's 350 wide crop was the whole bottom
of the picture.** 170 now, and the keyhole is 52 wide at the mound and 184 at the plate
rather than 80 and 248, so the near infield stops being a dirt lot with a plate in it.

**The zone's thirds are gone and the frame is not.** `check-firstpitch` reads the zone's
edge at mid height and asks for 3:1 against the grass and 2.5 CSS px of line, so the
white band stays at `zoneLineMin()`. The corners are `#f4c25a` at twice its weight over
the dark halo everything here wears, and they are what makes the box read as a target
rather than a fence. The reticle already reads the spot the thirds were an aid for.

**A lawn has things growing in it.** Ninety two block tufts in a darker green down the
near two thirds, drawn wider as they come toward the camera, and sixteen pale flecks,
none in the snow park. They are the cheapest thing in this pass and about a quarter of
why the grass reads as a field now rather than a fill.

### A materials pass: the difference between drawn and plotted

The follow-up to the composition pass, asked for in five words: it is about the
quality of the graphics. Put beside Backyard Baseball as MATERIALS rather than as
a layout, every surface there is rich where ours was flat: their grass is a
textured lawn, their fence is planks, every ground seam is soft, and everything
sits on a shadow. Ours was flat wedges, a slab with confetti on it, and hard
vector edges. The fixes are all in the page's own pixel language, because soft
painterly is not available to a 3px block world and should not be imitated.

**`dirtSeam` is most of it: a dirt edge is TEETH, not a boundary.** Every dirt
shape in both cameras was a clean ellipse or trapezoid edge, which is a plotter's
line; hand-set pixel art breaks a ground seam. Two dashed strokes over the
shape's own path do it, teeth of the dirt jutting out and a dark bite the other
way, at 6 logical units so the teeth are 2 blocks and survive the low-res snap.
**The bite is a dark alpha and never the grass colour**, because the path crosses
OTHER dirt (the keyhole under the home circle, the mound on the keyhole) and
grass-coloured teeth would nick every overlap. At the snow park the same seam
reads as banked snow, which was looked at rather than assumed.

**The plate view's stands are the wide camera's recipe at strip size**: tiered
rows of seated fans with step shadows and aisles, a padded wall with seams, a
foot shadow and the home run line, in place of a slab with 300 random flecks
over it. **Dead centre is the batter's eye**, the dark hedge every real park
keeps behind the pitcher, and it earns its place twice: the pitch in this game
really does fly out of that band, and a white ball on a dark hedge is the most
legible thing the screen can offer. Clouds go in above the roofline, day parks
only. A figure sits on a two-step shadow now, a soft ring under the hard core.

#### The letterbox wore the plate camera's dirt, and the fix took three tries

The band under the wide picture came back TAN: a beach below a green field,
across forty percent of a portrait arena. `fieldBand` sampled ONE midline pixel,
and on a narrow plate crop the bottom row's midline is the home circle. The
plate view COVERS, so that sample is displayed by nobody, and it is then
inherited by the wide view because a play refuses resampling.

- **Modal colour buckets failed first**: the mow stripes split one lawn across
  two fine buckets and four samples of unified dirt outvoted five of grass.
- **A dominant-channel mean failed second, against the guard**: a light tower's
  pole crosses the sky row and shares its dominant channel, so the average was
  seven channels off the sky and `check-firstpitch` rightly refused a band that
  is no pixel of the row.
- **What ships is three rules that each do one job.** The plate camera never
  writes the band at all, because the band belongs to the camera that shows it.
  The midline pixel is the answer whenever it is typical of its own row, since
  the picture meets the band at the seam's centre and the guard compares there
  at a tolerance of 2. The majority-median steps in only when the midline is
  the row's minority, which no current crop produces and the next camera might.

#### The park is on the structure, and the ground says people play here

The follow-on the materials pass named: each park's identity lived only in its
sky (the landmark) while its wall and stands were the same building in a
different hue. Two additions, both cameras, both cheap:

- **Pennants in the crowd's own colours**, hung from the plate view's roofline
  and along the wide view's stands-top curve. At the snow park they read as
  garland, at the Iron Yard as steel and rust, with nobody writing a park a
  custom drawing. **Alternate wall panels take a whisper of the crowd's first
  colour** (0.08 alpha over the wall hue), so the fence has the rhythm of a
  real outfield wall's mixed boards. **Snow sits on what is flat**: the
  roofline and the top of the batter's eye, `theme.snow` only.
- **Ground wear, drawn under the chalk**: a worn patch in each batter's box
  where the feet dig in, scuff speckles around them, and the pitcher's landing
  scuff a stride in front of the rubber. The wide camera gets the same three,
  small at its distance. Paint sits over dirt, so the wear goes in before the
  chalk lines and the box outlines.

Nothing here touches a sampled row: the pennants sit at y 138-147 of the plate
scene and the wear at 263 and 613, away from the band's rows and the zone
contrast row, which is why the band and zone clauses were re-run rather than
re-derived.

#### The CRT comes off while a game is up

Asked as the graphics not having the smoothness and clarity of other games.
Two different things answer that: one is a stripe over the picture, and the
other is the picture.

**The scanlines were a .055 stripe across every third row of the one picture
three sharpening passes went into.** `body::after` is the arcade CRT and its
own comment calls it the cheapest thing that says arcade, which is true of a
menu and false of a ball somebody is timing. `body.ingame::after{content:none}`
takes it off during play and `ingame` is only ever the game screen, so the
clubhouse and every menu keep the wash. One rule, and the contrast guards can
only be helped by it, because the overlay is a DOM layer no canvas readback
ever saw: the pixel guards were blind to it in both directions.

**The rest of the gap is the ART STYLE**, and the answer is a second
renderer rather than a tuning pass.

### Smooth and Retro are one renderer with one branch

```
node mythiball/verify-rules.mjs       `one grid` now asks both modes
node mythiball/check-firstpitch.mjs   the sprite claim, once per mode
```

`PREFS.smooth` ships TRUE. The same `drawField` draws the same geometry in the
same logical units through the same camera; what differs is where it is
rasterized.

| | retro | smooth |
|---|---|---|
| the world | drawn into a 320x220 canvas, one block a pixel | drawn straight onto the display bitmap |
| the magnification | nearest neighbour, whole number | none: the shapes are rasterized at the size they are shown |
| the sprites | 64px art as hard squares | 64px art through two EPX passes, then a filtered reduction |
| `imageSmoothingEnabled` | false | true |
| `--pxr` | `pixelated` | `auto` |

**PIX STAYS 3 IN BOTH, AND THAT IS WHAT MAKES IT A BRANCH.** Every constant the
camera runs on is counted in BLOCKS (the crop, `PLATE_KEEP_Y`,
`deckCoverBlocks`, `zoneLineMin`, `snapB`) and all of them are about where a
thing is and how big, never about whether a block is visible as one. So the two
modes frame the identical crop at the identical scale, which `one grid` now
asserts by flipping the mode inside ONE page: two contexts could always blame
the window.

**THE OBVIOUS VERSION IS THE EXPENSIVE ONE, and it was built first.** Making the
world canvas fine (`PIX = 1`, a filtered blit) renders correctly and measured
**103ms a frame** on a throttled 390 phone against retro's 36ms, because it pays
for a nine times larger world AND a filtered magnification of it. It also
reframes every screen, since `PLATE_KEEP_Y` is written in blocks and blocks
stopped being 3 logical pixels. Taking the middle canvas out instead and drawing
once is the cheap version and the crisper one.

**THE RESOLUTION IS THE WHOLE COST, MEASURED RATHER THAN ARGUED**, interleaved
because this repo's own history records an A B A pass reading 9.5ms of nothing
but a page warming up. A 390 phone at ratio 3, 4x throttle:

| where the field is drawn | mean frame |
|---|---|
| device resolution | **148ms** |
| half device | 78ms |
| **CSS resolution (ships)** | **36.3ms** |
| retro, for comparison | **36.4ms** |

So `fieldDraw` returns the floor itself in smooth mode rather than the next whole
divisor above it: nothing is a block, so a fractional last step is a filtered
resize of an already filtered picture, and rounding up to a divisor is fill for
nothing.

**AND IT CEILS THE FLOOR RATHER THAN ROUNDING IT, WHICH IS A WHOLE MODE.**
Written `Math.round`, `scale / dpr` of 1.33 becomes a draw of 1, and the WIDE
camera on a 390 phone then drew a **292 pixel bitmap into a 389 pixel element**:
three quarters of CSS resolution, upscaled back by the browser, which is softer
than the glass can show. That is the one way this mode can look WORSE than the
one it replaces, and it is invisible in the source because the number it produces
is an ordinary number. **Found by dumping the bitmap beside the element it is
laid out in**, while chasing something else. The plate camera never showed it,
because `ceil(8/3)` and `round(8/3)` are both 3.

**The guard was as wrong as the code, in the same direction.** The assertion read
"within half a block either way", which PERMITS rounding down, so it would have
passed that for ever. It is one sided now: at or above CSS resolution, and less
than one step above it.

**THE TOGGLE EXISTS BECAUSE THE COST CANNOT BE MEASURED HERE.** This sandbox has
no GPU, so Canvas2D rasterizes in software and a large anti-aliased fill is
charged at a rate no real phone pays. Desktop unthrottled the two modes are 17.0
against 16.7ms; desktop at 4x throttle smooth is **2.9x** retro, because a dpr of
1 means CSS resolution IS device resolution and none of the saving above is
available. Every number here is a ceiling rather than a reading, and a player
whose device disagrees has one tap out of it.

**`--pxr` IS A CUSTOM PROPERTY BECAUSE A BODY CLASS LOSES.** Fifteen rules on the
page declare a rendering mode and four carry two classes (`.board .due canvas`,
`.atbat .avatar`, `.ph-hero .ph-cast`, `.meetbar .mug canvas`), so a
`body.smooth canvas` override at one class is beaten by all four: the field would
smooth and the avatar beside it would stay blocky, in the mode whose whole
argument is that a frame has one style in it. A property inherits instead. Same
shape as the hoops court's `--floor-tint`.

**THE MODE IS IN THE SPRITE CACHE KEY**, not cleared on the toggle. What is
cached is a DRAWING and the two modes draw different ones, so a key without it
hands a retro player the smoothed art for the rest of the session, on whichever
characters happened to be built first.

**EPX IS NOT AN ANTI-ALIASER AND MUST NOT BE READ AS ONE.** It invents no colour,
which is the property that matters on this roster: every output pixel is one of
the character's own palette entries, so nothing goes muddy at the edges. What it
removes is the single pixel jaggies and the hard corner. What it cannot remove is
the resolution: a diagonal is still a staircase of half the step, because the
source really does only know 64 rows. **Higher fidelity than that is commissioned
frames, in either mode.**

**The one-resolution rule survives and decided nothing here.** It says the field
and the sprites must be ONE style, never which style, so smooth field plus
smoothed sprites satisfies it exactly as pixel plus pixel does.

**Two guards were narrowed and neither was weakened.** `one grid` and `a
character lands on the grid` are sentences about a BLOCK, so they are asked of
retro, which still has to hold every claim it ever held. What smooth must hold
instead is asserted beside each: the identical crop, the screen's own resolution,
and the filter on at both places it has to be.

#### The sprite claim, and the half a guard that read like a whole one

The obvious smooth-mode sprite claim CANNOT FAIL. "The destination a sprite
covers is the size of the canvas it came from" is true by construction rather
than by correctness: the blit is `drawImage(hcv, x, y, dw, dh)` with `dw = hbl /
k`, so the destination in bitmap pixels is `dw * k`, which is `hbl`, which is the
source width, whatever `hbl` turns out to be. Written that way it PASSED the
mutation that builds the sprite at the wrong size. This repo has that trap
written down four times and it was walked into a fifth.

**What the claim is about is the ART, and the measurement is the share of a
built sprite's opaque pixels that are EXACTLY a palette colour.** EPX invents no
colour, which is its defining property: a flat interior comes through untouched
and only the edges are blended, by the near 1:1 resize at the end. Over six
characters at the size the plate camera asks for:

| the same frame, built three ways | left exactly palette |
|---|---|
| retro, `fillRect` on a 64 grid | **1.000** |
| smooth, EPX twice then the resize | 0.583 to 0.711 |
| a straight bilinear blowup of the 64px art | 0.153 to 0.358 |

**A BAND RATHER THAN A FLOOR, because both ends are real and opposite failures.**
At 1.0 smooth has fallen through to the hard squares. Under about 0.45 it is
smearing the whole figure rather than its edges, which is what a naive upscale
does: rendered side by side, the faces and the bat visibly lose definition. The
threshold sits in the widest gap available, between 0.358 and 0.583.

**A COLOUR COUNT WAS THE FIRST VERSION AND IT CAUGHT ONLY ONE END**, because
blurring everything also produces thousands of colours. It failed the mutation
that removes the smooth path and passed the one that removes EPX. Half a guard
reads exactly like a whole one.

**And mean gradient is the WRONG sharpness metric here**, measured before it was
believed: EPX against a naive blowup is 1.05 to 1.08, which is inside the noise,
because a blurry figure has more pixels carrying smaller differences and the
total edge mass is about the same. The difference is obvious to the eye and
nearly invisible to that number.

#### Two numbers in the label check, and one of them had been a coin flip

**The gold band filter was in BITMAP pixels** (`x1 - x0 > 40`, `n > 60`), which
was right for as long as the page always drew at or above CSS resolution. Smooth
draws at exactly it, so a nine character `CATCH IT!` loses width and nearly half
its pixel count and fell under both. The label was the same size on the glass the
whole time, and the cap height assertion beside it went on reporting so
correctly: the only symptom was one of two bands vanishing from a check that
could see the other. It is in CSS pixels now.

**AND THE `near` WINDOW WAS A SHARE OF THE CANVAS, WHICH PREDATES ALL OF THIS.**
The labels sit a fixed distance off the ring, so as a fraction of the canvas that
distance depends on how much world the crop holds: the upper one landed at 0.189
to 0.204 of the height against a window of 0.2, so whether this passed was
decided by **where the fly ball happened to come down**. It went red twice in
three runs on a page with nothing wrong with it, in BOTH renderers. Measured
across both screens, in CSS pixels off the ring:

| | phone | desktop |
|---|---|---|
| `CATCH IT!` | 56 | 107 to 142 |
| `SPACE / CLICK` | 26 | 38 to 48 |
| the straw hat at the plate | 139 to 145 | 429 to 452 |

So neither a share of the canvas NOR a CSS distance alone was ever going to do
it: 100 CSS pixels covers the phone and cuts the desktop's own upper label off.
250 has about a 1.7x margin on both sides at once, and the horizontal window does
the rest, since a label is centred on its ring to within 6 CSS pixels on every
screen measured and nothing else here is.

### And then the PAGE was the thing that did not match

The field is painted now and the page around it was still the 1980s cabinet
its own stylesheet header describes: a terminal monospace setting every name,
every quirk and every sentence in the game, a flat 2px navy line around 52
objects, 16 hard offset shadows, square corners, and tracking chosen for a
face whose letters were already a fixed width apart. **That is the one
resolution rule one layer out.** A reader does not see a renderer, they see a
screen, and half of this screen was drawn with a printing technique the other
half had stopped using.

**WHAT IS KEPT IS THE WARMTH AND THE WEIGHT, AND THAT IS THE WHOLE
JUDGEMENT.** The instinct on hearing "smooth" is a minimal dashboard, and it
is wrong here: the reference this game is measured against has a bold, warm,
playful interface, not a clean one. Scorecard cream, navy ink and arcade red
are also the FIELD's colours (the dirt, the shadow under a figure, the seam on
the ball), and a button that goes down when you hit it is real game feel. None
of that moved. What went is the woodcut.

**IT IS SIX STRINGS.** The page draws a border 52 times and a shadow 16 times
and does it in six spellings, so the cabinet look is a token swap rather than a
decision taken per component: `border:2px solid var(--line)` (30),
`border:3px solid var(--line)` (19), `border-radius:0` (21) and four hard
`Npx Npx 0` shadows. Swapping the strings moves every screen at once and
leaves each rule's own box model alone, which is what stops a redesign quietly
costing a margin on a screen nobody reshot.

**THE FACES ARE THE SYSTEM'S, DELIBERATELY.** This game is one self contained
file that asks the network for nothing, and a webfont would be both a new
dependency and unverifiable here, since Google Fonts does not resolve in the
sandbox and every screenshot would be of the fallback anyway. `ui-rounded` is
SF Pro Rounded on Apple, which is the friendly geometric face this wants, and
elsewhere the stack lands on the platform's own UI face. What matters most is
the thing being LEFT.

#### Two things the monospace was doing for free

Both broke the moment it went, and both were visible only by looking.

**THE BRAND ROW HELD TOGETHER BY ACCIDENT.** Every glyph was one width, so the
line happened to fit; in a proportional face the same words are wider and the
row wrapped, putting the wordmark on one line and MAIN MENU on another.
`min-width:0` is what lets a flex item shrink below its own text at all, and
the two straplines shrink while the controls do not.

**AND EVERY COLUMN OF DIGITS LOST ITS COLUMN.** Six ratings in three columns
only read as a table if the digits are one width. The answer is
`font-variant-numeric:tabular-nums`, which lines digits up in ANY face, and it
is the hoops game's own lesson: reaching for a typewriter to get a straight
column buys a whole voice nobody asked for. It is applied by ROLE (tables,
line scores, stat grids, meters, counts) rather than per component, because a
list of the places a number appears is a list somebody forgets to add to.

**A LABEL AND ITS VALUE ARE ONE THING.** Three stat cells share a card about
160px wide, so a cell is around 50: `POW 45` fits and `POW` over `45` is what
happens the moment it does not. The monospace hid this by being narrow, and
the fix is to say the pair may not break rather than to go back to a face that
could not.

#### A SMALL UPPERCASE LABEL KEEPS ITS TRACKING AND A BIG WORD DOES NOT

Sixty eight rules set a tracking value and the instinct is to sweep them all.
Most of them are right: wide tracking on nine and ten pixel caps is what makes
a sport screen's labels read as labels, and it is correct in any face. What
was wrong is the SAME value on display sized words, where a monospace's own
spacing was being added to rather than replaced: `.28em` on a sixteen pixel
button, `.16em` on a twenty six pixel shout, `.14em` on a twenty pixel name.
Those are the ones a reader takes in as a word rather than as a label, and
they are the ones that moved, along with the display face they should have
been set in.

#### What it cost, measured rather than assumed

The deck is the fragile surface here (its own section above records a short
phone already running past the bottom), so it was measured either side:

| | before | after |
|---|---|---|
| deck at 390x844 | 156px | **150px** |
| deck at 360x640 | 156px | 163px |
| deck sideways | 177px | **171px** |
| 320x568 overflow | 29px | **24px** |

So the type got bigger and the deck did not, and the one screen that already
ran past its window runs 5px less past it. **The 320 overflow is not fixed and
is not new**, which is what measuring the old build was for.

**RETRO IS A FIELD OPTION INSIDE THE NEW DESIGN, not a second skin.** Doubling
the interface for it would double every guard, and a classic graphics setting
in a real game does not revert your menus.

Found by walking the first two pitches again after the pass above. Before the
first pitch, and on every ball in play, the wide view is up, and on a portrait
phone it was a strip of ballgame floating in the arena's near black:

| | picture | arena | dead |
|---|---|---|---|
| 390x844 | 389x293 | 390x696 | **58%** of the arena |
| 360x740 | 360x330 | 360x592 | 44% |
| 320x568 | 320x220 | 320x420 | 48% |
| sideways, desktop | | | under 1% |

**THE WIDE VIEW CONTAINS**, because a ball in the right field corner is the
entire point of it, and the world is 320 by 220 blocks (an aspect of 1.45)
against a phone arena of about 0.56.

**No camera fixes it, and all three were worked out rather than tried:**

- Filling the HEIGHT means cropping to **117 of 320 blocks** across, which
  loses both foul lines.
- Filling the WIDTH still runs the world out vertically at any scale. The
  world is not tall enough for that shape.
- Shortening the arena to what the wide view can fill takes the plate view's
  strike zone from **78 CSS pixels to 41**, which is the floor, and the zone
  being findable is what this whole pass is for.

So the band stays and stops reading as a hole. The arena is painted with the
picture's OWN top and bottom rows, so the sky goes on being sky and the
outfield goes on being grass, and the seam is invisible because the two
colours are the same colour.

**IT IS READ, NEVER WRITTEN.** Thirteen parks paint thirteen skies, from a
cool blue through a sunset orange to a desert haze, and `drawField` shades
each one, so a hex typed into the stylesheet would be wrong in twelve of them
and wrong again the day somebody adds a park. `fieldBand` takes two pixels out
of `pixWorld`, which is the small CPU canvas rather than the display one, so
nothing is read back off the GPU.

**It samples on a camera change and never per frame.** The key is the crop, so
a cut between the two views takes one sample and holding either takes none.

**The split is at half and that is exact rather than lucky**: the canvas is
centred, so the band above is entirely in the top half and the band below
entirely in the bottom, whatever size the band comes out.

**The guard sweeps every park on two phones**, and asks the coverage question
first: a screen with nothing to fill proves nothing about the fill. **Its
"never the near black" clause passed green on the defect** until unset was
counted as the fallback, which is exactly what a missing custom property is.
Proved by removing the sampler: four failures, the colours reported as null.

##### THE COLOUR WAS RIGHT AND THE FLATNESS WAS THE FAULT

Everything above is about the band being the park's own colour, and it is. What
it never asked is what the band looks like once it is more than a seam. Measured
during a ball in play at 390x844: the picture is 293 CSS pixels of a 570 pixel
arena, so **48% of the wide view was two unchanging colours**, and at 320x568 it
is 35%. A sampled slab is still a slab.

**A sky deepens toward the top and near ground falls into shadow**, so the band
is shaded away from the picture and is exactly the sampled colour where it meets
it. That is the whole of the change: one overlay on the arena, nothing in the
canvas, no camera moved. Desktop and sideways have a band of one or two pixels,
so `--pic` reads about 49.9 there and the overlay collapses to nothing.

**`--pic` IS THE PICTURE'S OWN HALF HEIGHT AND NOT HALF THE ARENA.** Anchored at
50% the overlay is zero at the arena's midpoint rather than at the canvas's edge,
so there is a STEP where the band meets the picture, and the bigger the band the
bigger the step: the flatness this fixes, arriving by its own back door. It is
written in `fitFieldCanvas`, where the canvas height and the arena height are
both already in hand and the line runs only when the fit changes.

**Nothing else here could see it.** The colour claims above read `--sky` and
`--turf` rather than the glass, which is right on their own terms, and a step is
a perfectly valid gradient. So the guard reads `--pic` against the rectangles it
is supposed to describe, at a tenth of a percent, which on the tallest arena in
the sweep is under a pixel. Anchored back at 50% it names every park on both
phones: `--pic 50 against a real half of 20.80`.

#### The guard measures the glass, and it found two things the eye did not

`check-firstpitch.mjs`'s fourth section reads where the zone lands in CSS
pixels and where the deck starts, across five screens. On its first run it
reported the 1280x800 overlap above, which no screenshot of a 1512 window
would ever have shown.

**Its other report was the check being wrong, and the shape is familiar.** A
phone held sideways puts the deck in a COLUMN beside the field, and a column
that starts high up the window is not standing on anything. Read as a height
it failed on a screen with nothing wrong with it. The claim is about overlap,
so it is only asked where the two share a column.

### Nobody plays for both clubs

```
node mythiball/verify-rules.mjs    the section named "nobody plays for both clubs"
```

A roster is drafted out of the same sixty eight the opponents are built from,
and nothing stopped a player taking a man the club they are playing already
fields. The at bat card printed it out loud: **"The Great Ape at bat VS THE
GREAT APE PITCHING"**.

Measured over 6,800 matchups against all seventeen clubs:

| | before | after |
|---|---|---|
| a character on BOTH sides | **73.5%** of games | **0%** |
| the same man batting and pitching | 1.47% | 0% |

**Nothing could report it.** Both lineups were legal, every rating was read
correctly and the game played perfectly. Real baseball cannot field one man
twice and a game that does reads as broken inside one pitch.

**THE OPPONENT YIELDS, and it has to.** A season schedules clubs the player
has never seen at the moment they draft, so a rule on the DRAFT would be a
rule about a game that has not been arranged yet.

**The substitute is matched on RATINGS**, because an opponent's strength is
part of the balance every win rate in this game is measured against. Taking
whoever happens to be free would make the schedule easier by exactly how
often the player drafts well. Measured, the club's batting line moves **1.12
of about 150** over **1.16 substitutions a game**, so it is the same club.

**IT DRAWS NO RANDOM NUMBER.** The choice is a pure function of the man being
replaced and who is already spoken for, so a matchup gives the same nine every
time it is opened and no seeded stream anywhere moves. Their own card is
reserved as well, or the substitute would be somebody further down it and the
club would field one man twice by a different door.

**The guard sweeps every club rather than sampling one**, because the overlap
is a property of two hand written lists and the way it comes back is somebody
adding a character to one of them. **It asserts the overlap still EXISTS
first**: a sweep where nothing would have collided proves nothing, which is
`check-numbers`' coverage argument in a third place. Proved by making
`opposingNine` hand back the roster, which reports 2,515 of 3,400.

**IT BROKE A FIXTURE ON THE FIRST RUN, WHICH IS WHAT THE SUITE IS FOR.** The
development section asserted that your years belong to your side by handing
the opponent YOUR OWN NINE and looking one man up on each card. That is the
plainest way to ask it and it is no longer available, so the lookup found
undefined and the section threw. The claim is asked of whoever they actually
field now, which is stronger than the mirror was: **every man on their card is
the roster's own object and somebody on yours is not**. The mirror is kept as
an assertion of its own, that a club asked for your nine fields none of them.

### The first notes named hardware the reader does not have

The coach cards are the one screen a stranger cannot skip: a modal over the
field, before the first pitch. Every card was written once for every device,
so a phone was told the bat follows **"your mouse (or your finger, or the
arrow keys)"** and that **keys 1, 2 and 3** change the swing.

**And the one control a phone HAS was named as an arrow key.** Holding a side
of the picture is the phone's late break, written up in `drawField`'s own
note, and the card said "hold **left or right** to bend it".

That is the clubhouse rail's mistake arriving at the screen where it costs
most: the rail said "Point at something to see what it does" to a touch
screen. **A note that lists three ways to do a thing is a note a stranger has
to sort before they can follow it, and they are reading it with a pitch about
to be thrown.**

**`COARSE` is a POINTER query and not a width**, for the reason `ROOMFILL`'s
own note gives about tablets: a 768 wide tablet is past no phone breakpoint
and still has no mouse, and a narrow window on a desktop still has one. What
the sentence is about is the hardware, so that is what it asks. It is read
once at load, because a reader who plugs a mouse in mid at bat should not have
a modal re-render underneath them.

**THE LONG PAGE IS DELIBERATELY LEFT DEVICE NEUTRAL**, and that is the one
place this repo's two-surfaces rule does not mean two identical edits. It
already carries both halves of every control (`hold left or right (an arrow
key, or a side of the picture)`), because it is a reference somebody may read
on a laptop about a phone. The modal is read ON the device, once, at the worst
possible moment to be reading anything.

**The guard asks a WORD LIST, which is the one claim no measurement of the
glass can make.** A note that names a mouse to a finger is wrong however well
it is laid out. It also asserts the two devices are actually told apart and
are read two different sets, because a query that answered the same on both
would hand one set to everybody and the other arm would have nothing to catch.
Proved by pinning the branch false: four cards reported on a phone.

### A band a sample cannot resolve is measuring the sample, for the third time

`DISCIPLINE IS NOT SILENCE` asks that a strike down the middle draws the same
swings on every tier, and it went red at **easy 62.4 against hard 71.6** on a
build that had not touched the dugout.

**It is not a flake until it is measured, and "flake" is not a root cause.**
Repeated over 60 runs of that exact fixture, which draws a random club and a
random seated batter:

| | mean gap | sd | worst of 60 |
|---|---|---|---|
| 500 pitches a cell | **0.00** | 3.03 | 7.40 |
| 4,000 a cell | 0.07 | **0.93** | 2.22 |

So the property holds exactly and the threshold of 8 was **2.6 sigma** wide:
about one run in 120. Swept across all seventeen clubs at 1,200 pitches the
gap runs -2.3 to +3.9, and across the nine batters of one club it runs -1.7 to
+1.7, so neither the club nor the batter is what moved.

**THE SAMPLE IS WHAT MOVES, NEVER THE BAND.** Loosening the threshold to 12
would make the check unable to see the inversion it exists for. Two cells of
3,500 extra pitches cost about a second. This is the chase sweep's own lesson
one section below it, and the commish magic seed two games over.

### Difficulty is what the other dugout KNOWS

`DIFF` used to hold three columns and all three were about the player's half of
the duel: ball speed, sweet spot width, pitcher skill. Played from the MOUND,
every tier was the same opponent, so choosing hard bought a harder swing and
changed nothing about the game you pitched.

Two columns answer that, and both are measured through `calibrate.mjs --easy`
and `--hard` rather than read, because a dugout that stopped chasing altogether
renders perfectly and breaks nothing.

- **`chase` touches only pitches OUT of the zone.** A harder dugout is not a
  quieter one, it is a pickier one: measured at 500 pitches, chase runs 30.6 /
  24.8 / 11.6 across the tiers while the swing rate on a strike down the middle
  moves 73.8 to 76.0, which is noise. Discipline is not silence, and the guard
  asserts both halves.

  **THE GAP IS NOT THE SAME ON EVERY OPPONENT, and the guard used to measure
  whichever one it drew.** `swingProb` is clamped to a 0.05 floor, and `chase` is
  an offset on top of the batter's CON and the batting TEAM's patience, so a
  patient dugout pushes the base against that floor, the hard tier clamps, and
  the gap compresses. Measured over all seventeen it runs **8.4 to 23.0, mean
  16.8**, and the smallest belongs to the most patient team in the game (The Kids
  Table, patience 0.14). At 500 pitches the standard error on that gap is about
  1.8 points, so a threshold of 8 against that one team is a **coin toss**: it
  came up 6.8 and failed the suite on a build that had not touched the dugout at
  all. That is the magic seed lesson from the commish term fixture, in a
  different coat.

  So the sweep walks **every team style** now. `currentBattingTeamStyle()` reads
  `State.opponent` live, so swapping it needs no restart, and the batter is held
  fixed to isolate the term that actually moves: patience spans 0.22 across the
  league where the CON term spans about 0.05.

  **AND THAT FIX TRADED ONE FLAP FOR ANOTHER, which is worth reading before
  writing the next one.** Sweeping all seventeen teams meant dropping the per cell
  sample from 500 to 200 to keep the suite's runtime sane, and at 200 pitches a
  rate near 5 to 20 percent carries a standard error of 2 to 3 points. So easy
  against MEDIUM went inside the noise: The Marauders came back 19.0/20.5/8.0 and
  The Kids Table 14.0/4.5/5.5 on a build that had not touched the dugout. A strict
  three way order per team at that sample is measuring the sample.

  So ordering is asserted **on the pool** (the dial is `diff.chase`, global, and a
  team's patience is a constant offset on top of it) and per team only on **easy
  against HARD**, which is the full width of the dial and the one comparison that
  survives at this sample, so a team that genuinely inverted it is still caught.
  The **SIZE of the gap is on the mean**, because the clamp legitimately compresses
  it against the most patient dugout and demanding eight points there is a coin
  toss rather than a rule.

  **AND THEN THE SURVIVING PER TEAM CLAIM FLAKED TOO, WHICH IS THE THIRD TIME.**
  `easy > hard` went red on The Kids Table at **7.0 against 7.0**, on a build whose
  only change was a stylesheet. Re-measured through the guard's own sweep (lifted
  out of it rather than rewritten) at 6,000 pitches a cell, the true gap runs
  **6.5 to 18.9** across the seventeen and the smallest is that team, whose base
  sits against `swingProb`'s 0.05 floor so the hard tier clamps. At 200 that gap
  has a mean of 6.10 and **sd 2.20**, which puts a tie 2.8 sigma out: about one run
  in 360, which is rare enough to read as a real defect when it lands and common
  enough to land. The per team sample is **800** now, where the deviation halves
  and zero is 5.5 sigma out, for about nine seconds. Relaxing the claim to `>=`
  would make it blind to the inversion it exists for. **The range above was
  recorded as 8.4 to 23.0 and the BOTTOM of it is the whole argument**, so it is
  re-measured rather than carried forward.
- **`read` is memory.** `patternRead` keeps a ROLLING window of the last 20
  pitches the player CALLED and answers how hard the bat is sitting on this
  one. An arm nobody steers writes nothing, because there is no pattern in a
  random draw, which is also what keeps `calibrate.mjs`'s neutral arm out of it.
  The floor is half the window: a repertoire is three or four pitches, so an
  honest mix sits near .30 and punishing anything lower would punish honesty.

**A full read takes a hard bat's timing error from .082 to .024, and that is
the point rather than an overshoot.** It takes twenty straight fastballs to get
there. **Two ways out, and both are the real ones**: mix, which the log line
tells the caller to do once per hitter, or paint the edge, because the corner
penalty is +0.12 against a read worth at most 0.11. A read that could not be
pitched around would be a punishment rather than a hitter.

**It is said out loud, once per batter.** A difficulty that changes what the
opponent knows is invisible otherwise: the player just meets hard contact and
reads it as luck.

#### AND THE HUMAN HAD THE WHOLE READ FOR NOTHING, ON THE LOUDEST LINE OF THE DECK

Everything above is a dial that decides how much the other dugout KNOWS about
what is coming, earned over twenty pitches and worth a hard bat's timing error
from .082 to .024. A human batter was simply told. `pt-name` names the live
pitch, and measured through the real page it did so **about seven tenths of a
pitch duration BEFORE the ball left the hand**, on every pitch, from the first
of the game: `label first names it at t=-0.76 (during the windup)`.

**It lives in the PITCHER's own meter block**, where `meter-side` and
`meter-hint` beside it are already gated on which side is up, and it alone was
not. The at bat card three lines away in the same function already gates the
weak pitch tell on `!playerIsBatting()`. So the convention was in this
function twice and this line missed it, which is why nothing looked wrong: it
is a correct label for the side it was written for.

**IT IS A RECORD RATHER THAN A TELL NOW.** Pitching, you chose it, so it names
it at once, unchanged. Batting, it names the pitch once the ball has arrived
or been swung at, which is after the decision is made. That is what a
broadcast does, it teaches a repertoire over an at bat, and it costs no read.

**The waiting word is shorter than the longest pitch name, on purpose.** The
first draft read `HERE IT COMES`, four characters past `Curveball`, on the one
deck row a 320 by 568 phone was already fifty pixels over. `ON THE WAY` is ten
against nine, and measured rather than argued.

**No band moved, and that is worth stating.** `check-skill` and `calibrate`
drive the engine rather than the deck, so every rate in both is untouched. What
changed is what a PERSON knows, which no harness here measures and which is the
one thing the difficulty model was already built around.

**Guarded on both sides, because gating it on the pitch rather than on the side
loses the half that must stay.** `verify-rules` reads the deck while batting at
the moment a batter is deciding and again with the ball in the mitt, and reads
it while pitching, where it must name the pitch at once. Each was proved by
mutation. **The batting claim reads against whatever pitch is LIVE, never
against the one the fixture asked for**: the CPU is the one pitching there, so
its next throw can replace `g.pitch` between the two reads, and pinned to a
curveball the claim failed on a page doing the right thing, naming a knuckler
it had correctly just been handed.

### NOTHING HAD EVER MEASURED THE HALF A PERSON PLAYS

```
node mythiball/check-skill.mjs                    four rungs, three tiers, both swings
node mythiball/check-skill.mjs --pa 300           a faster read
node mythiball/check-skill.mjs --tier medium --mode contact --sweet 0.12 --bat HIT_Q=0.30
```

`calibrate.mjs` measures the OTHER dugout: its swing rate, its whiffs, its
chases. `check-bat.mjs` sweeps the swing's own curves and asserts worse never
helps. Neither of them answers the question a player is actually asking, which is
what somebody LIKE THEM ends up hitting, and the only written answer was a comment
over the home run gate claiming a perfect player hits about .67 and a careless one
about .30, "tuned against a simulation of full plate appearances (scratch
tune.mjs)". That file does not exist, so the claim was unverifiable, and it was
wrong about the end that matters.

**It is a model of a PERSON in the box, not of the game.** Four rungs, each a pair
of standard deviations: how far off the ball the bat is put (in zone units) and how
late or early the hands are (in milliseconds). It reads the pitch's own landing
spot and sweet moment out of `g.pitch`, adds its error to both, decides whether the
pitch looks like a strike (protecting with two strikes, which is what a person
does), and then calls the page's own `resolveSwing`.

**Measured through it, in the mode the game defaults to, the game was too easy at
every rung and had no chase in it:** somebody who had NEVER PLAYED hit .372, one
game in .453, a competent player .591, and the ceiling .667. So the whole distance
between having played once and being unbeatable was .45 to .67, and the mode a
player is in the moment they press Contact hit better than a real Hall of Famer.

**IT MEASURED A SWING MODE NOBODY CAN SELECT FOR THE FIRST TWO PASSES**, and that
is the finding to read before trusting any number here. The buttons are Contact,
Power and Bunt; `normal` is the word `resolveSwing` uses for the OTHER dugout, and
the harness set it. It is not a spelling difference: Contact widens the timing
window by a quarter and then takes 55 per cent of the home run chance away, Power
narrows it and pays 1.75 times. Read in `normal` a competent player showed 14.7 per
cent of plate appearances as home runs; in Contact it is 11.4 and in Power 16.9.
Same lesson as this repo's SQL fixture inventing a column, arriving at a game
state.

#### The window is the player's dial, and the other dugout keeps its own

`DIFF.sweetWidth` sits in the half of that table which is about BATTING, beside the
ball speed and the arm's accuracy, and the other dugout's difficulty is `chase`,
`read` and its own timing jitter. It reached the CPU anyway, because `swingGeometry`
is one function and read the table directly. **So the CPU's rates were a measurement
of the player's dial as well, and the player's dial could not be moved.**
`calibrate.mjs` holds that dugout to about 28 whiffs per hundred swings, solved per
tier against those exact widths, and the jitter clamps under it are absolute times,
so narrowing the window to make a person's timing matter would have raised the CPU's
whiff rate, broken that band, and on hard walked into the floor that has already
killed the pattern read once.

`CPU_SWEET` is that dugout's window and it holds the numbers the table shipped with,
so nothing about the other side moves when the player's column does. **That is what
made the rest of this a single-instrument job.**

#### THE CEILING IS NOT THE WINDOW, WHICH IS WHY THE FIRST SWEEP WENT NOWHERE

The window was the obvious dial and it was swept first, from 0.20 down to 0.07, a
cut of nearly two thirds. The top rung moved from **.667 to .682**. A 22 millisecond
error is inside any window this game could offer, so the best player is untouched;
what a narrow window does is take balls in play away from a BEGINNER, whose average
falls through STRIKEOUTS while a competent player's balls in play go on being hits.
On its own it made the game harder at the end that was already hard enough.

**The dominant term is the ladder's FLOOR.** `HIT_BASE` plus `CONTACT_HIT` plus the
speed term is what a ball in play is worth on the worst swing that still connects,
and at 0.13 and 0.09 that floor was .26, which is real baseball's average on every
ball in play. The ceiling was double it. Those eight coefficients are in `BAT` now
rather than loose in the middle of `resolveSwing`, and the checker can run any of
them, which is how the shipped ones were picked.

**What shipped**, in Contact mode at 700 plate appearances a rung:

| who | was | easy | medium | hard |
|---|---|---|---|---|
| never played | .372 | .291 | .266 | .220 |
| one game in | .453 | .337 | .335 | .297 |
| knows it | .591 | .449 | .430 | .410 |
| cannot lose | .667 | .573 | .585 | .556 |

The shared coefficients came down about a fifth, `CONTACT_HIT` went 0.09 to 0.03,
and `sweetWidth` went 0.26/0.20/0.16 to 0.20/0.15/0.12.

**WHAT IT COSTS THE OTHER DUGOUT IS REAL, and it is the one part of this that is not
free.** Six of the eight coefficients are shared, and the CPU sits at a contact
quality near 0.64 where a competent person reaches 1.0, so a cut is worth less to it
than to the player and is not worth nothing: its hits per ball in play come down
about a sixth. That is the direction the run environment wanted anyway, since
`check-runs.mjs` measured 6.2 a nine before the forced runner was fixed against a
real game's 4.5, and this file's own note says a backyard game should sit a LITTLE
over it rather than half again.

#### A tier claim written on the batting average is a coin toss

**The averages barely separate the tiers and the whiffs separate them cleanly**,
which is what the dial actually does. Easy to hard for a competent player is about
.03 of average against a standard error near .02 at 700 plate appearances, so it
inverted between medium and hard on a page with nothing wrong with it. Getting that
to three sigma needs five thousand appearances a rung, which is minutes a tier in CI
for a claim about a side effect. Whiffs per swing at medium run 25.6 for somebody who
has never played against 34.8 on hard, and nine points of a rate over four hundred
swings is four sigma. **The sample moves or the claim moves; the band does not.**

#### THE PROP BAT WAS A HAIRLINE ACROSS THE BATTER'S FACE

The handoff pack draws a real bat in the swing and batting stance strips, so the
page's own three rectangle bat is only drawn for a character whose art has none.
**That is 31 of the 68**, including whoever is at the plate about half the time.

**Its LENGTH is a share of the figure and its THICKNESS was five pixels**, so it
was the right bat on the field, where a runner is thirty pixels wide, and a
thirtieth as thick as it was long on the plate camera, where the batter is six
times that. Rendered and looked at, what a player sees is a twig floating beside
the hitter. That is the strike zone's own hairline one screen along: a length
written in the wrong unit, invisible in the source, and it is the frame a player
looks at longest. The floor is what the field always drew, so nothing under about
90 pixels wide moves at all.

**And it was drawn ACROSS HIS FACE.** A quarter turn anticlockwise from the chest
sweeps the barrel up over the head. Four placements were rendered at plate scale
and looked at: two read as a bat, and the one that ships is the only one that
touches nothing, which is a bat held up over the back shoulder.

#### THE PITCHING DECK COVERED THE STRIKE ZONE, AND ONLY THE BATTING ONE WAS SOLVED

`deckCoverBlocks` is honoured and then `sy` is clamped to the world's own bottom
edge, which is the one of the three clamps that cannot be argued with, so what the
deck cannot be paid for it simply COVERS. The batting deck was measured and the
camera's budget was solved against it. The pitching deck is a pitch name, a row of
types and the two action buttons as a COLUMN, which is 148 pixels against the
batting deck's 57, and nothing had ever measured it: 22 pixels of a 200 pixel zone
at 1440 by 900 and **47 of 160 at 1280 by 800**, which is the bottom third of the
box a pitcher is aiming into.

Walk him and Throw sit beside each other on a wide window now, which is the swing
row's own fix arriving at the other half, and the last few pixels come off the
spacing rather than the type, because Throw is what that deck is FOR. Six pixels
of the smallest desktop are still covered and that is the world running out rather
than a layout to tighten. `check-firstpitch` walks the pitching half now.

#### `calibrate.mjs` COLLECTS PAGE ERRORS AND ONE WAS REAL

`Cannot read properties of undefined (reading 'weakPitch')`, twice in 150 pitches.
`batterCtx` is built when a batter steps in and `scheduleCpuSwing` can be reached
before it is, so **two of the four reads in that one function tested it and two did
not**. A throw there aborts the swing being scheduled, so what a player sees is a
pitch nobody swings at and nothing on screen to say why. Every rate target was in
band either side of it, which is the point: the rates are what that file bands and
the page errors are what it happens to notice.

#### A fixture that suppresses timers has to book the at bat itself

Every timer is stubbed so a plate appearance costs nothing, and
`scheduleContactPlay` decides the ball and then BOOKS it on a timer. So the first
version counted hits itself off `g.play.kind` and then read the game's own
`g.stats` over the top of its own tally: every rate came back **.000 with the in
play column reading 88 to 100 per cent**, which is a batting line that cannot
happen. Two copies of one answer, and the one that was right was the one being
overwritten. It calls the mutation itself now, which is that function's own tail,
and that matters beyond the totals: whether a bunt or a fly ball is charged as an
at bat at all is a RULE and it lives in those functions.

#### Taking a ball was a mistake, and the count meant nothing

Measured through `check-skill.mjs` with a fifth batter: the "knows it" rung's
hands and aim, swinging at anything he can reach. **He out-hit the same batter
with an eye on easy and hard** (OPS 1.528 against 1.406 on easy). Two faults
made that true, and neither threw:

- **A ball off the plate came off the bat as hard as a strike.** If the barrel
  found it and the timing was right, `swingGeometry` gave full contact quality
  wherever the pitch was. It now multiplies by `1 - chase * CHASE_COST` (1.5 per
  zone unit past the edge, floored at 0.2), where `chase` is how far past the
  edge it landed. Both dugouts pay it, so a pitch the player paints just off the
  corner is a weapon too.
- **The CPU's chase pitch was a strike.** On 0-2 it aimed at a corner of the 3x3
  grid, which is 0.62 of the zone, inside it. `cpuCallPitch` reads the count now
  and returns an `aim` in zone units: behind (2-0, 3-0, 3-1) it throws its
  hardest pitch at the plate, full count near the plate, ahead with two strikes
  it throws off speed just off an edge about half the time, ahead otherwise it
  works the edges, and even counts keep the old mix. **Every caller passes the
  aim** (`nextPitch`, check-skill, check-frames, check-runs), because a caller
  that passes only the zone throws a random spot on every count but an even one.

After, at 900 plate appearances a rung, contact mode:

| | eye | chases |
|---|---|---|
| easy | OPS 1.339 | 1.070 |
| medium | 1.289 | 1.203 |
| hard | 1.077 | 0.993 |

`check-skill` asserts the eye wins by 0.06 of OPS POOLED across the tiers, and
the ladder bands all still hold. Pooled because one tier cannot resolve it: the
game's own pitches are not seeded, and two runs of one build put the medium gap
at .17 and .086. Against the page before this fix the pooled gap is negative. **Walks are still rare** (under 4% for a competent batter):
the reward for an eye is mostly the pitch he gets once he is ahead, not ball
four. The batting how-to and both sets of coach notes say so; the how-to also
lost "watch the target ring", which a batter has not been shown since the
target went pitcher-only.

#### A swing that misses half the time is not a backyard game

```
node mythiball/whiff.mjs 3000 medium      the tuning instrument
node mythiball/whiff.mjs 3000             all three tiers
node mythiball/calibrate.mjs              the tripwire
```

**IT LIVED IN A SCRATCH FILE AND THE SCRATCH FILE WENT.** This section pointed
at `scratchpad/whiff.mjs`, which is not in the repo and had not survived, so the
one instrument that can answer the question this section is about did not exist.
A later session lost the better part of an hour to a `calibrate` reading of
**14.0 against a band floor of 15**, ran seven of them, read the spread as a
regression, and built the file again from this paragraph. It is in `mythiball/`
now, beside the tripwire it is the micrometer for.

**AND THE REGRESSION WAS NOT THERE, which is the part worth copying.** Seven
`calibrate` runs on that build read 14.0, 25.3, 22.6, 21.2, 27.4, 20.9 and 19.3;
three on the build before it read 27.0, 25.3 and 26.9. Three against seven, means
of 26.4 and 21.5, reads as a five point drop at three standard errors and is
**entirely the sample**: the micrometer at 3000 swings a tier puts the two builds
at 22.3 / 24.5 / 25.0 against 23.0 / 26.1 / 24.4, inside 1.6 points everywhere.
The CPU's swing was **identical by construction** the whole time, because the
window split left `CPU_SWEET` holding the exact numbers `sweetWidth` used to
carry and nothing else the other dugout reads was touched.

**A CHEAP MEASUREMENT REPEATED IS NOT A BIG MEASUREMENT.** Seven readings of a
sample that cannot resolve the question average to a confident wrong answer, and
the temptation at the end of them is to go and tune a dial. Two runs of the right
instrument settled it.

The CPU whiffed on **about 47 swings in every hundred**, against MLB's 25, and
the note in `calibrate.mjs` called that "still arcade-hot". It is the wrong way
round: a backyard game is a CONTACT game. The ball is in play constantly and a
strikeout is a thing that occasionally happens, not the most common outcome of a
swing. It sits at **28** now, and balls in play per swing went from 27.9 to 40.8
at medium, which is nearly half again as many plays for the half of the game that
fields them.

**THE FIRST ATTEMPT MOVED THREE POINTS AND READ AS A SUCCESS.** `calibrate.mjs`
gets about 80 swings out of a 150 pitch run, so at a true rate near 40 one
standard error is **5.4 points**. Two runs came back 36.4 and 43.9 on builds one
dial apart: they are the same measurement. The dial was cut from .15 to .125 on
the strength of the difference between them. **A file that cannot resolve the
move is not the file to tune in**, and that is now written in its own header:
`calibrate.mjs` plays real innings through the real buttons, which is what makes
it a good tripwire and a bad micrometer.

The instrument that can answer stubs `setTimeout` into a queue, calls the game's
own `throwPitch` and `scheduleCpuSwing`, then drains the queue once. **Nothing
about the jitter model is copied**, which is the whole point: a second copy of
that arithmetic would measure itself. 3000 swings an arm, in seconds.

**AND THE SAMPLE IS WORSE THAN BINOMIAL, WHICH IS WHY 3000 IS THE NUMBER.** The
batter turns over every few pitches, so consecutive swings share one man's CON
and are correlated: the effective sample is smaller than the count. Measured on
one build, 600 swings read 28.7 and 1200 read 24.8, which is about 1.8 standard
errors apart on a binomial and ordinary here. Two arms compared at anything under
a couple of thousand is a reading of the batters.

**IT TAKES `MYTHIBALL_PAGE`, because a single column means nothing.** The whole
value of this file is the A/B, and the arms have to be two files on disk rather
than two runs either side of an edit.

**WHAT IT READS TODAY IS 22 TO 26 AND THIS SECTION SAYS 28.** That gap is on the
pre-session build too, so it is the rebuilt fixture rather than the game, and the
two are not the same measurement. Compare arms with each other, never a number
here against a number in this paragraph.

**WHIFF WAS ALREADY FLAT ACROSS THE TIERS AND THAT IS THE DESIGN, NOT AN
ACCIDENT.** 47.4 / 47.8 / 46.2 on easy, medium and hard. Those numbers were
cancelling `DIFF.sweetWidth` (.26 / .20 / .16), so a harder dugout was never one
that missed less. What a tier buys is CONTACT: balls in play ran 24.0 / 27.9 /
31.5.

**So the three are solved separately, and scaling them together inverts them.** A
uniform cut was tried first and gave easy 27.6 against hard 34.3, which is a hard
dugout making worse contact than an easy one. Nothing would have reported it.
Solved per tier, whiff is flat at about 28.3 and the tier spread in balls in play
nearly doubles:

| | jitter | whiff | in play |
|---|---|---|---|
| easy | .115 | 28.0 | 34.1 |
| medium | .068 | 28.4 | 40.8 |
| hard | .030 | 28.6 | 47.9 |

**Only the timing jitter moved.** The aim spread (`locJ`) also makes whiffs, by
putting the barrel out of reach, and cutting both at once would overshoot and
leave nobody knowing which did it.

**The player's own bat was not touched and did not need to be.** `check-bat.mjs`
puts an ordinary swing at 94% contact and a sharp one at 100: the player was
never the one missing. This dial is the CPU's half.

##### And cutting it killed the read, because one constant was doing two jobs

The retune above pushed hard's base jitter down to .030, near the `clamp(jitter,
0.03, 0.40)` floor, and the read is subtracted BEFORE that clamp. So there was
nothing left for it to remove: a hard dugout sitting on twenty straight
fastballs timed the ball **0.015 off against 0.014** for a dugout guessing.
**The whole mechanic was dead and the only symptom was that it stopped
mattering.** Caught by `verify-rules.mjs`, which is the reason that assertion
exists.

**IT CANNOT BE FIXED BY BACKING THE DIAL OFF, and that was measured rather than
assumed.** The obvious move is to take hard's whiff down through the aim spread
instead and leave the timing headroom alone. It does nothing: `locJ` from .8 to
.40 on hard moves whiff **36.3 to 36.4**. Whiff here is essentially ALL timing,
which is `check-bat`'s binary window arriving from the other side. The barrel is
rarely what misses, so there is no second lever to trade against.

**The other tempting fix is worse and is the one to refuse.** Leaving hard's
jitter high enough for the read puts hard's whiff at 36 against easy's 28, which
is the tier INVERSION rejected one section up, arriving by a different door.

So the two jobs are separated and the clamp is written twice on purpose:

```js
jitter = clamp(jitter, 0.03, 0.40);      /* the dugout's own limit */
jitter = Math.max(jitter - read, 0.012); /* what knowing the pitch buys */
```

The FLOOR is about the dugout on its own merits: nobody times a pitch perfectly
just by being good. The READ is the one term allowed to beat it, because knowing
what is coming is exactly what it is for, and it gets its own floor. Sharpness,
fatigue and the corner penalty are ordinary modifiers and still land above the
clamp.

**The counterplay is unchanged and is what makes this safe.** Mix, and the read
decays to nothing. Or paint the edge, because the corner penalty is added after
this. And the whiff target is untouched, because an unsteered arm writes no
pattern: re-measured after the fix at 27.2 / 28.1 / 27.8.

**A TUNING PASS CAN KILL A MECHANIC IN A FILE IT NEVER EDITED.** Nothing about
the read changed. Its own assertions on `patternRead` all still passed, because
the function was right the whole time; what broke was the headroom underneath it
somewhere else. That is worth assuming about the next dial that moves.

### The defence had no play to MAKE, only one to lose

Both fielding windows this game had (the grounder throw, the fly catch) fire only
on a ball ALREADY labelled an out, so the only thing either can do is downgrade
it. A hit was automatic and the fielding side watched it land. That is backwards
from the sport and from every baseball game there is: the thrill of fielding is
taking a hit AWAY from somebody, and there was no way to.

**What made it fixable is that the sim already knew.** `buildPlaySim` computes,
per fielder, the earliest moment he can be where the ball is, and then throws
that away on anything labelled a hit. It is recorded as `sim.robSlack` now: for
the man best placed, how much time to spare he has getting to where the ball
comes down. Positive is camped under it, negative is late by that much, and a
tenth of a second late is a dive.

**Measured over 900 balls in play, 96 of 219 hits (44%) land where a fielder
could already be standing.** That is NOT the game playing wrong: the hit rate on
balls in play is about right (roughly real BABIP). It is the GEOMETRY and the
OUTCOME disagreeing, because the trajectory decides the result at contact and the
fielders are animated on afterwards. That gap is the only place a robbery can
live, and it is why this is a fielding fix rather than a batting one.

**A miss costs NOTHING and that asymmetry is the whole design.** The play is
planned as the hit and stays the hit: no amendment, no apology, the normal apply
fires on its own clock and nobody watching would know a window had been open.
Green turns it into an out. The other two windows are the opposite on purpose,
and nobody presses a button they think can hurt them, which is why the coach
notes say so in as many words.

**The gate is physics the sim already computes, never a roll.** You cannot rob
what nobody could reach. `ROB_ARC` (120) is what keeps a bloop single honest:
measured, a single's arc runs 29 at the tenth percentile to 147 at the ninetieth,
so a ball that genuinely drops in front of somebody is well under it and a deep
fly that fell in is well over. **Out of reach is about TIME, not distance**, and
the first draft of the guard got that wrong: it aimed into the gap with a two
second hang time and the gate correctly said yes, because a fielder can jog to a
ball that stays up that long.

**It fires on 21% of hits, which is 1.9 chances a side per game**, across singles,
doubles and triples. That is an event rather than a coin flip bolted to the
batting model. Re-measure it with the probe if either constant moves: half of
every hit becoming a timing bar is not fielding.

**The green scales with how close he was**, from a full 0.177 half-width for a man
already standing there down to 0.086 for a dive, plus his own glove. Most
candidates saturate at the top, which is right: the routine-looking ones are the
ones you should catch.

**Three windows can open once the ball is hit and the notes named none of them**
for as long as they existed, so a player met a bar on screen with no idea what it
wanted. The pitching notes carry a fielding step now. The `ring` the batting
notes must never mention is still forbidden there and is the truth here, because
`drawCatchRing` is what draws it.

**And the LONG page still said "Two plays need you"**, so the robbery went
undocumented on the more thorough of the two how to play surfaces for as long as
it has existed. Same lesson as the arcade's twelve blocks: two surfaces say how to
play and both need the edit, every time.

#### DOING NOTHING WAS THE WORST OUTCOME BOTH WINDOWS HAD

Neither window distinguished a player who pressed at the wrong moment from one who
never pressed at all, and the second is most of the people who have never played
this before.

- **The grounder's timeout called `finish(-1)` and fell through the distance
  maths.** `ideal` sits near 0.55 and `yellowHalf` is 0.14, so `d` came out about
  1.55, past every band: an ignored ground ball was a **throwing error**, batter
  safe and every runner up an extra base. The comment on that very line said
  "fielder holds it: batter safe", which is the single below it. **The comment was
  right and the code was not**, which is the dangerous direction, because the next
  person fixes the code to match.
- **The fly window said `if (t < 0) outcome = 'miss'` outright**, and a miss there
  is the ball over his head for a **TRIPLE**.

So a player who did not yet know these controls existed conceded an error on most
ground balls and a triple on most fly balls, all game. That is not a guess about
how it felt: measured from the other side, a defence that pressed nothing gave up
**27 to 32 runs a nine against 5.5**, which is the whole of that gap.

**After the fix that same arm measures 15.8**, so ignoring the defence still costs
about three times what playing it costs. That is the shape it should have: a real
price rather than a catastrophe. The window is still worth playing, and a player
who has not found it yet is not being handed a different sport.

**THE RULE IS THAT NOT REACTING IS NEVER WORSE THAN REACTING BADLY.** Pressing at
the wrong moment stays the worst outcome, because you committed and got it wrong,
and that is what keeps the windows worth playing. Letting the bar run out is
passive: the fielder holds the ball, or never leaves his feet, so the batter
reaches and nobody else moves up. Both expiries are a **single** now.

**The guard DRIVES it rather than computing it**, because the arithmetic is what
was wrong in the first place. It opens each window for real, presses nothing, and
reads back what the game scored.

**And the notes can now tell the truth about all three**, which is what they are
for: let the bar run out and the batter reaches, nothing worse; miss the robbery
and nothing is lost at all. Nobody presses a button they think can hurt them, and
before this the fear was correct.

**A play keeps a finish timer that nulls `g.play` and moves the batter along**, so
a test that hits a second ball 700ms after the first is torn down by the first
one's clock and reports a window that never opened. Each case in the guard waits
the previous one out.

### A franchise remembered only its win column

A club here has a city, a nickname, a park with an effect on it, a record book and
a Retire the club button, and every one of those promises CONTINUITY. What
actually carried from one year to the next was W-L and nothing else: `perPlayer`
is per season and `seasonLine()` keeps the year, the record, the rank and whether
you won it. So you could draft Dracula in year one, watch him hit twelve,
re-draft him in year two, and the game had no memory that he had ever played for
you. That is what made redrafting read as a reset rather than a decision.

**The roster is NOT locked between years and that is right.** "Play Year N+1"
sends you back to the draft with everything you have unlocked on the board, which
is what makes the unlock ladder worth climbing. The gap was never the redraft, it
was that the club could not tell you which of these men were yours.

`S.careers` is that memory, and `foldCareers` builds it.

**Idempotence is the load-bearing property and it is not obvious why.** The draft
for year N+1 happens BEFORE `startSeason` folds anything, so numbers read while
picking would otherwise be a year out of date. `foldCareers` is pure over
(`careers`, `perPlayer`, `team`, `year`) and never touches its argument, so
drawing a screen with it and starting a year with it give the same answer. Get
that wrong and every re-signed player's record doubles, silently, on a screen
nobody would think to check.

**A year is counted off the ROSTER, not off the stat sheet.** A ninth man who
never got an at bat still spent the season on the club, and counting years from
`perPlayer` would quietly leave him off his own record. He gets `1 year here` and
no row of zeros pretending to be a career.

Two surfaces, and the first is the one that changes a decision: a green line on
the draft card for anybody who has worn the shirt, and a Club careers table on the
record book screen. **A first year franchise is unmarked and looks exactly as it
always did**, which the guard asserts from the other end.

### A franchise had memory and no arc

**Nothing in the game read `S.year`. Only the labels did.** A club had a record
book, a ladder of unlocks and (since the careers pass above) a memory of every man
who wore the shirt, and year ten still played exactly like year one: the same
board, the same league, the same numbers. `opponentSharpness()` ramps game one to
game seven and reads `results.length`, which resets every April, so even the one
existing arc was annual.

**Two halves fix that and NEITHER WORKS ALONE.** A man who has worn your shirt is
better at what he did in it, and the league sharpens with your tenure. Development
on its own is a club that wins by turning up. A rising league on its own is a
punishment for playing a fourth season. Together the redraft becomes the decision
the mode was missing: your veterans are now better than the board, and the new
unlock is not.

**The roster stays unlocked, which is the rule this must not break.** "Play Year
N+1" still opens the whole board, because that is what makes the ladder worth
climbing. What changed is that walking away from a four year man now costs
something a drafter can read on his card.

**It is DERIVED from the career record, never stored.** `devOf(k)` is a pure
function of what `careerOf(k)` already holds, which buys three things at once: it
cannot drift from a second copy (the commish era's rule), it is idempotent for
free so drawing the draft screen twice cannot double it (the trap `foldCareers` is
written around), and **every save that already exists gets its veterans developed
the day it ships** rather than starting everybody from scratch.

**It pays for what he DID, not for turning up.** A bat only develops off at bats
and an arm only off outs, so the ninth man who never played keeps his year on the
record and earns no rating for it.

**ONE SEAM, because a rating is read 139 times.** Those reads sit on a dozen
receivers (`ctx`, `batter`, `pitcher`, `runner`, `c`, `b`), so hooking them would
be the Full Team glow bug waiting to happen. The lineup is built in exactly one
place, `startGame`, so `developed()` is applied there and everything downstream
follows. **Only your side**: the opponent draws the roster's own numbers even when
their lineup names the same character, which the guard asserts against a mirror
lineup.

**The card shows what you would actually field.** A draft card printing the
roster's own figures would understate every man this club has kept, and the drafter
would be choosing on numbers the game does not use. The raised rating is marked in
the grid and the gain is named under it (`+4 CON`, not `+7`), because the named
stat says what kind of player he has become.

#### Three things it got wrong, and two needed a screenshot

- **A RATING MUST NEVER BUY YOU LESS, and this one did.** The 99 clamp is the
  whole of the diminishing return (a 96 has three points of room, a 60 has thirty
  nine) and part of this roster is written AT or ABOVE it. A flat
  `clamp(base + v, 1, 99)` handed the game's 100 power man **a point off** for his
  years of service. The probe reported him gaining -1. That is `sendOdds`' rule at
  a third door, after the send curve and the monotonicity sweep.
- **The card promised gains that never landed.** It printed the bump a man was
  OWED, so somebody at the ceiling was told "+4 POW" and gained nothing.
  `developed()` records what was actually APPLIED now, which is the commish state
  card's rule (decide on the printed value, not the raw one) arriving at a draft
  screen.
- **A raised PIT drew RED.** `.statgrid b.up` (0,2,1) loses to `.statgrid span.arm
  b` (0,2,2) two rules above it, and `--gold` in this palette is red, so the one
  number on the card meaning HE GOT BETTER was the only one printed in the colour
  that means trouble. Nothing threw and no assertion could see it. **Found by
  looking at the card**, which is the same shape as the football prompt card's
  `.pwc-marks` selector.

**And `developed()` guards its own output.** Nothing hands it an already developed
man today, because the lineup comes from `ROSTER_BY_KEY` and the card from
`ROSTER`, both raw. It returns early on `c.dev` anyway: it derives off the KEY, so
feeding it its own output would add the bump to a base that already carries it and
silently double every veteran on whichever screen somebody wired up second.

**The tenure ramp is deliberately smaller than the in season one.** Game one to
game seven is worth 0.75 of that dial; a whole career is worth **0.30**, plateauing
after six years. The shape of a season stays the loudest thing in it and tenure is
the bass note underneath. **Exhibition does not get it at all**: a one off is not a
franchise year and has to stay the fixed, knowable thing somebody reaches for when
they want a game rather than a career.

### The friendly button was the worst path

**Randomize is the first thing a new player touches**, because it is what somebody
presses who does not want to read sixty-eight cards. It shuffled the ORDER as well
as the nine, and the first pick starts on the mound, so the man it put there was a
coin toss.

Measured over 4000 draws: **52% of them opened with an arm under 55 PIT while the
same nine men held a median best of 74.** Ordering alone threw away 27 points of
PIT. Nothing could have caught it, because a random draft is a valid draft, and the
only symptom was a bad first game with nothing on screen to explain it.

**The nine are still random.** Only the order changes, which is the part the player
did not pick and the part the game says matters. Measured after: 0 of 60 below 55,
0 that started anyone but the best arm on the club.

**A hand draft is left alone and told what it is doing.** Somebody who chose their
own order made a choice. The rule lives behind the info dot, which is the right
place for a rule and the wrong place for a fact about THIS draft, so the footer
names the starter and his PIT and, in gold, the better arm already picked. It
never reorders.

### The picture disagreed with the book on one play in six

`buildPlaySim`'s own comment says a hit's throw "gets there just after he does:
that is what a hit looks like, and it is the whole difference between this and an
out." Nothing checked it, and it was false on **66 of 420 plays**. What a player
sees when it is wrong is a fielder standing on the bag holding the ball while the
runner jogs up and is called safe. Nothing throws.

Two faults, and **finding the first made the measurement worse before it got
better**, which is why the guard asserts a property and never a number.

**The horizon.** `simRunPath` reports `reached` as the moment a runner touches his
bag, and when the loop runs out first it reports the END OF THE SIM instead. Home
to third is 3.33 diamond units and the slowest man runs 0.342 a second, so he
needed about 9.9 and a nine second horizon reported 9.12 every time. Everything
downstream trusts that number: the throw is timed against it, the close play is
read off it, `deadAt` comes from it. `SIM_MAX_S` is 15 now, which covers first to
home at the slowest speed (13.49s) with room. It costs sample arrays, 900 entries
per runner instead of 540.

**The one sided guard.** `lateThrow` asked only that the fielder not HOLD the ball
too long, never that the throw not LAND too early, so when the runner was further
off than the hold allowed, the launch clamped to `ready` and the ball beat him to
the bag by whatever was left.

**There were THREE untimed throws in that branch and each fix uncovered the
next**: the `lateThrow` clamp, the last-resort `throwTo(from, 1, at + 1.0)`, and
the one inside the cutoff relay, `throwTo(cutoffUV, ..., ready2 + 1.2)`. The last
one put the ball on third five seconds before the runner. Measured after all
three: **0 of 357**. When nobody can be thrown out the ball now comes in BEHIND
the play, to a bag the lead runner has already touched, after he has touched it,
which is what an infield actually does.

### A strikeout had no frame, and a pose is one offset rather than 68 drawings

The batter reverted to his neutral stance and stood in it for the whole
`afterOut` beat, so the screen looked the same whether he had just been rung up
or was waiting on the next pitch. That is the most frequent thing that happens to
a hitter.

**The generator is parametric**, so `slump` is one entry in `ARM_OFF` plus a line
in `POSES` that all sixty eight characters inherit. It weighs about **61KB of
sprite table**, which is what one pose across this roster costs (0.96MB for
fifteen). Adding a pose is cheap; this section exists because judging it is not.

**The generator reproduces the in-page table byte for byte**, so splicing is safe
and that is worth checking before you splice. Adding a pose GROWS each
character's palette, which shifts every letter and changes every string, so a
string compare says everything changed. **Decode and compare pixels instead**:
1020 existing frames came back identical.

**Two things here were only findable by LOOKING, and a count of distinct frames
was happy through both.**

- At an eight pixel drop the arms hang PAST the shoes and cover them, so a
  slumping Zeus reads as a man with no feet standing on two white posts. Five
  clears the floor.
- A one pixel leg sink, tried so the quadrupeds would get something, clipped
  every biped's shoes off the bottom of the 50px box and moved exactly one of the
  seven. It is back at zero.

**Seven characters have no arms to drop** (the lion, the dog, the chupacabra, the
phoenix, the dragon, nessie, the cat), which is the same reason `raised_arms`
skips them. Their slump is their `back` frame. A dragon taking a called third
strike is a dragon standing there.

**The head cannot drop.** `cy` is per archetype and set after the body, so a
slumped skull means threading the pose through every archetype's head draw. The
arms carry it, and at the plate camera's 5.2x the batter is the biggest thing on
screen.

### How long a game actually takes, and Fast now reaches its target

**Normalise PER HALF INNING.** A game that ends early on the mercy rule flatters a
wall clock, and both samples here did: one stopped in the 4th, one in the 5th.

| Fast | per half inning | 5 innings | median pitch to pitch | gaps over 8s |
|---|---|---|---|---|
| beat 0.60 | 80.2s | **13.4 min** | 3.31s | 2 |
| beat 0.45 | 48.7s | **8.1 min** | 2.94s | 0 |

Same harness, before and after, and the second run reached the fifth inning where
the first reached the fourth: more baseball in less time. The target is five to
ten minutes, so Fast is inside it now and was never close before.

**NORMAL IS DELIBERATELY UNTOUCHED.** Its rhythm is the one a playtest asked for
in as many words ("slow down a lot", recorded in `BASE_BEAT`), and the setting
that exists to trade ceremony for pace is the one that should reach the target.
The default stays the playtested game.

#### More contact does NOT make the game faster, which was predicted and is wrong

The contact retune cuts whiffs from 47 per hundred swings to 28, so at bats end
sooner, so the game should be quicker. That was written down as an expected
free win before it was measured. It is not one. Driven through the real buttons
at Normal, the shipped build against the build one commit before it:

| | before | after |
|---|---|---|
| wall clock | 698.0s | 686.9s |
| pitches | 131 | 122 |
| balls in play | 47 | 49 |
| seconds per pitch | 5.33 | **5.63** |
| median pitch to pitch | 4.23s | **4.23s** |

**The per event rhythm does not move at all**, to two decimal places, and the
seconds per PITCH go UP. That is the mechanism: fewer pitches, but a larger
share of the ones left are balls in play, and a ball in play costs a play
animation plus `afterHit` where a whiff cost `afterWhiff`. It trades cheap
events for expensive ones at close to par.

**AND THE PER HALF INNING FIGURE SAYS THE OPPOSITE OF THE WALL CLOCK, because
neither sample is a controlled one.** 77.6s before against 114.5s after, which
would be a large regression, except the after game was a **0-28 mercy blowout
in 6 half innings** and the before game a 4-16 over 9. Scoring is what fills an
inning with play animations, and this pass RAISED scoring, so the two are not
separable at one game an arm. What is safe to say is the negative: the retune
buys no pace, and the direction of any residual effect is toward slower innings
in a high scoring game rather than faster ones.

**Do not tune a beat off this.** It is n=1 an arm on a measurement whose own
header says to normalise per half inning, and the two arms disagree about which
way to normalise. Settling it needs several games an arm, and nothing currently
depends on the answer.

#### And then the whole table went up by a third, which overturns the note above

Reported by the same playtester whose "slow down a lot" is what `BASE_BEAT`'s
own header records, after the thinking gap alone had already been raised from
2.1s to 3.2s: **the game moves a little too fast, it should be natural.**

**A playtested number is only playtested until the same person plays it again.**
That is the whole licence for moving `normal`, which this file twice says is
deliberately untouched.

**What was measured before anything moved**, because "too fast" has three
candidates and only one of them is this table:

| | |
|---|---|
| the pitch flight | **2.0s** for a fastball, **2.7s** for a curveball, at medium against an average arm |
| the thinking gap | `windup` + `betweenPitches`, **3.2s** |
| an out to the next pitch | `afterOut` + `intoAtBat` + `windup`, **3.4s** |

Real baseball is about 0.4s of flight, so **the ball was never the quick part**
and slowing it would have made the timing game easier rather than the pace
calmer. It is the dead time.

**Scaled UNIFORMLY by 1.3 rather than tuned beat by beat**, because the report
was about the game and not about one pause: the ratios the playtest settled all
survive and only the tempo moves. The thinking gap is **4.2s** and an out to the
next pitch is **4.4s**. Normal is now exactly what Relaxed was, which is the
cheapest way to say what changed; Relaxed goes slower again.

**FAST'S MULTIPLIER MOVED SO THAT FAST DID NOT**, and this is the half most
easily got wrong. Its 0.45 was solved against the old table for a five to ten
minute game and measured at 8.1 minutes. The table is 1.3x now, so leaving 0.45
alone would have taken Fast to about **10.5 minutes** and out of its own target
without anybody touching Fast. **0.346 x 1.3 is 0.45 of the old base**, so every
Fast beat lands on the same millisecond it was measured at.

**The METER is untouched on all three.** It scales the pitch sweep, which is how
hard the timing is, and the report was about pace. That is also why the default
was not simply moved to Relaxed, which is the one line version of this: it would
have handed everybody a 1.20 meter, making the game easier under a change named
for its pacing.

**Two ways this measurement went wrong before it went right**, both worth not
repeating:

- The harness pressed `#swing-btn`, which is the PHONE control and is not visible
  at desktop width, so it never swung once and timed a game of nothing but called
  strikeouts, reporting a clean 0-20 loss. `scratchpad/pacing.mjs` presses Space,
  which the coach notes name and which is always there.
- An attribution probe that FORCED each next pitch reported the ordinary ball or
  strike as 69% of the clock, and it was measuring the pitch FLIGHT: calling
  `throwPitch` directly skips the very beats it was trying to weigh. **Cutting the
  beat by a quarter moved its number from 1.41s to 1.39s, which is what gave it
  away.** Only the COUNT attribution survived (two thirds of transitions are
  ordinary pitches).

### It was worth being slower

`sendOdds` decides how often a runner waved round actually scores, and it was two
separate curves rather than one curve with a bonus on the end. Crossing the floor
RESTARTED the odds from a lower base:

| | slower | faster | cost of speed |
|---|---|---|---|
| second to home on a single | 74: **47.7%** | 75: **35.0%** | -12.7 pts |
| first to home on a double | 84: **54.3%** | 85: **30.0%** | **-24.3 pts** |

**Tom Sawyer is 84 and Huck Finn is 86**, so waving both round sent the faster man
home less often. Nothing could report it: every number involved is a valid
probability and the play resolves correctly against whichever one it is handed.
The only symptom is that the fast man you drafted for his legs keeps getting
thrown out.

One curve now, with the fast bonus ADDED to it. The guard asserts MONOTONICITY
over the whole scale rather than the two numbers that were wrong, because a cliff
can come back at any floor somebody tunes later.

#### And then the gate came down, because this is a backyard game

That fix left the ODDS honest and the PERMISSION untouched, and the permission
was the whole gap. A runner scored from second on a single **24% of the time**
against about 60% in the real game, and the note here said to measure the run
environment before touching it. Measured (`check-runs.mjs`, about 5.5 a nine):
scoring is not broken, so there is room.

**Only 35% of the roster cleared the old floor of 75.** Two thirds of the league
stopped at third on a base hit, so the play at the plate, which is the best thing
that happens in a game of backyard baseball, mostly did not happen. **Speed now
decides the ODDS rather than the PERMISSION**, which is the arcade shape:
everybody runs, the fast ones make it.

| | tries | scores | thrown out at the plate |
|---|---|---|---|
| second to home, was | 35% | 24% | 11% |
| second to home, now | 71% | **59%** | **12%** |
| first to home on a double, was | 22% | 14% | 8% |
| first to home on a double, now | 53% | **45%** | 8% |

**THE THIRD COLUMN IS WHY THE FLOOR COULD COME DOWN THIS FAR**, and it is the
thing to check before reading this as a difficulty cut. The runners who now score
are the ones who used to HOLD, not runners who used to be safe: outs at the plate
move 11% to 12%. A version of this that bought the scoring with outs would gut
the mode and would pass a check that only read the scoring rate, so the guard
asserts both.

**Two outs drops the floor another ten points**, and that is arithmetic rather
than feel. Holding at third is worth something only if somebody is coming up
behind him, and with two out there is one batter left. Ten points is where the
floor's own odds fall from about .61 to about .50, which is where the trade turns
over. It reads 63% scoring and 16% thrown out, and an out at the plate with two
away ends an inning that was ending anyway.

**The floor is still there.** A statue rounding third is a joke rather than a
decision, and `sendClears` is what the SEND and HOLD button overrides.

**IT MOVED TO MODULE SCOPE, AND THAT IS HALF THE FIX.** `sendOdds` was a local
const inside `applyHitMutation`, so `verify-rules.mjs` carried a hand-copied
duplicate of the arithmetic in order to sweep it, and the nine-curve sweep in the
section below could not reach it **at all**: the curve the whole sweep was
written for was the one curve not in it. The copy would have gone on passing on a
curve the game had stopped playing. One definition now, read by both, and the
sweep walks eleven curves.

### A rating must never buy you less, and the sweep that says so

`sendOdds` was an instance of a CLASS. Any function mapping a rating to a number
is meant to move one way, and a piecewise one can turn round at a seam with every
value it returns still a perfectly valid number. So the suite walks all nine of
them end to end, over 0 to 100, including the one that must go DOWN
(`pitchScatter`: more control, less scatter).

Writing it found one more thing, in the oldest idiom in the file. **`c.spd || 50`
reads a legitimate ZERO as average**, so the slowest man imaginable would run like
a median one. Nobody on the roster is 0 (Lady Liberty is 1), which is exactly what
makes it a trap rather than a fault: it goes off the year somebody writes a
statue. `ratingOr(v, d)` is `||` with the hole taken out, and every rating is read
through it.

### A timer fires into its OWN play or not at all

**Seen once, never reproduced, and real.** `Cannot read properties of null
(reading '0')` turned up in one probe run and then survived about eight hundred
forced pitches across three harness shapes without coming back. It was found by
READING instead.

A ground out schedules its throw window for `meetAt`, and the callback checked
that `g.play` existed, not that it was the SAME play. A play can be torn down
inside that window and a new one begun, and **if the new one is a HOME RUN its sim
has no `meetUV` at all**, because nobody meets a ball in the seats. That is why it
is so rare: it needs the replacement to be a homer, about one ball in play in
twenty.

The guard DRIVES the sequence rather than waiting for it, and pins the error text,
so the fix is tied to the symptom actually observed: reading a homer's `meetUV[0]`
produces exactly that string.

This is the swing timer's own lesson ("the first check is against the GAME, not
just the pitch") arriving at a **third** door, after `catchActive` and
`throwActive`. Three schedulers carry the identity check now: the throw window,
the catch window and the robbery.

#### And a scheduler is not a closer, which was three more of the same

**"Three schedulers carry the identity check" was true and was read as the whole
answer.** A scheduler decides whether to OPEN a window. The window then stands
open, and what it does when it CLOSES was a different question nobody had put.
`startCatchWindow`'s expiry, `startRobWindow`'s, and the ordinary apply timer all
asked whether there was **a** play and then resolved into it.

**Surfaced by a full `calibrate.mjs` run**, which reported one page error reading
`Cannot read properties of null (reading '0')`: the exact string the section above
exists for, at a door that fix did not reach. Every target was in band; the error
was the only thing wrong with the run.

**DRIVEN, never waited for**, which is that section's own rule. Open the window on
a fly ball, replace the play with a home run, let the 900ms expire. Measured, with
the guards removed:

| | what the stale window did |
|---|---|
| the catch window | marked the **home run** `applied`, so its own outcome never landed |
| the robbery, pressed | turned somebody else's **triple into a fly out** |
| the apply timer | resolved the home run **787ms early**, with the ball still in the air |

**THE CRASH IS THE RARE SYMPTOM AND THE QUIET ONE IS EVERY TIME.**
`resolveCatch` sets `applied` on its first line, so a stale window spoiled
whatever play it found, on every replacement. The throw is only null when the
replacement has no meeting point, which is a ball in the seats and about one in
twenty. That is why this went a year without a report: the crash needs a
coincidence and the corruption needs nothing.

**Returning costs nothing, which is what makes the guard safe.** Every play
schedules its own resolution, so a timer that declines to act on a stranger
leaves that stranger to its own clock a moment later. Nothing is dropped.

**The flag goes back on THIS play, not on whatever is there now.** Written
`if (g.play) g.play.catchActive = false` a stale window turns off a flag the new
play has just set, which is a second bug hiding inside the first one's line.

**The listeners come off BEFORE the identity check**, or a window that resolves
into a stranger leaks its keydown and click handlers for the rest of the game.

**THE APPLY ARM NEEDS A PAGE OF ITS OWN**, and it failed once for exactly the
reason the football boss battle's pacing walk needs one. Run after the two window
arms, their pending transition timers (`play = null` at `arriveMs + 500`) fire
inside its fixture, so the home run's OWN apply correctly declines and the arm
reads a play that is never applied at all. **That failure was the harness, not the
page**, and the first reading of it was spent deciding which. It carries an
assertion that the replacement was applied at all, so the next time that happens
it says so rather than looking like the defect.

### Smoothness, measured, and one honest null result

```
node mythiball/check-frames.mjs                              desktop, which proves nothing
node mythiball/check-frames.mjs 70 normal --phone --cpu=4    the run that matters
```

**It is a meter with bands, like `calibrate.mjs`, and the bands are generous on
purpose.** Frame timing is noisy: the same build measured 1.01%, 1.25% and 1.71%
of frames over 33ms in three consecutive runs. A band tight enough to catch a 10%
regression would flap on nothing, and a check people learn to ignore is worse than
no check. What it catches is the render doubling, a hitch appearing, or a leak.

**Input is not the problem and the header records why nobody should re-measure
it.** Press to the game ACTING is 0.20ms (p90 2.2ms); press to the next frame is
21.3ms against a 20ms floor at that throttle. The swing paints on the very next
frame, which is the best there is.

**The first attempt at that number said 50ms and was measuring the harness.** The
rAF watcher was armed only after the keypress had gone out through CDP and come
back, so it reported the round trip. It is armed before the press now and every
timestamp is taken in the page.

**A headless desktop is the easiest case there is**, and it says 60fps mean with
one frame over 33ms in 4203. The run that matters is a phone viewport with the CPU
throttled to a mid range handset.

| | mean | p95 | over 33ms | over 50ms |
|---|---|---|---|---|
| desktop | 16.7ms (60fps) | 18.5 | 0.02% | 0% |
| phone, 4x throttle | ~20ms (50fps) | ~28 | ~1.3% | ~0.1% |

**At 4x throttle the render simply costs most of the frame.** `drawField` runs at
2.48ms mean, which is about ten of a sixteen millisecond budget once throttled.
That is the honest capability, and further gain needs a cheaper `drawField`, not a
hitch hunt.

**WASTED WORK WAS FOUND AND REMOVED, AND IT DID NOT MAKE THE GAME SMOOTHER.** Both
halves of that sentence are measured.

- The log rebuilt all fourteen lines and forced a layout with `scrollHeight` on
  every `refreshHud`, which runs on every ball, strike, out and base change. It
  appends now, and `refreshHud` went from 7.96ms to 5.36ms on the throttled phone.
- `runnerCache` was keyed on the raw float SCALE while the canvas it built depends
  on the rounded pixel size, and the batter's walk up ramps that scale
  continuously: a fresh 1600 fillRect build every frame of the walk, every at bat,
  and an unbounded cache as well as a hitch.
- `spriteCanvas` had no cache at all, so `refreshAtBatCard` rebuilt the batter's
  48px avatar from scratch on every HUD refresh: the same four sprites came back
  nine, eight, eight and five times in forty five seconds.

One `spriteStore` now holds one built sprite per character, size and frame.
Sprite builds fell from **305 a minute to 118, with zero repeats** (all that is
left is first time warming). `spriteCanvas` hands back a COPY, because callers
append what they get to the DOM and a node can only live in one place.

**And the A/B says none of it moved the frame times.** Three runs each way:
frames over 33ms came out 1.25 / 1.71 / 1.01 after against 1.35 / 1.20 / 1.42
before, with p95 identical. **The 73% correlation between long frames and sprite
builds was real and I misread it**: a build lands in a long frame because both
cluster on the same events (a new batter means a new sprite AND a HUD rebuild AND
a play starting), not because 1.5ms of building makes a 33ms frame. Keep the
changes because they are strictly less work and they fix an unbounded cache; do
not keep them because they made it smooth.

#### The same null result, and the instrument fault that hid it twice

The display bitmap was a fixed **1440x990 on every screen**, 1.43M pixels a frame.
A 390px phone shows that canvas 358 CSS pixels wide, which at a device ratio of 3
is **1074 device pixels, 0.79M**. So the game wrote 81% more pixels than the screen
could show and the browser resampled the surplus away. That reads like an obvious
win and it is worth **0.3ms a frame**.

**The first A/B said 9.5ms and was measuring the warm up.** Three runs, A B A, came
out 35.6 / 6.2 / 16.3 percent of frames over 33ms, and the whole gap was read as the
fix when the series is simply a page getting faster as it runs. Interleaved and
repeated, three runs an arm, the arms are 23.3 and 23.0 with **3.4ms of spread
inside a single arm**. This is the sprite cache's lesson arriving a second time, from
the other side: there the correlation was real and the cause was not, here the
difference was real and the cause was the running order.

**AND `setCPUThrottlingRate` ONLY SLOWS THE MAIN THREAD.** It throttles script, not
rasterizing and not compositing, so a change that moves pixel COUNT rather than
javascript is close to invisible to `check-frames.mjs` however many times it is run.
A null result from that file is a null result **about the main thread** and never
proof that a real phone would not care. That is recorded in its header so the next
person does not re-run it expecting an answer it cannot give.

#### It has never had one block size, and that is the reason it changed anyway

Measured by reading a row of the stands back out of the bitmap and counting run
lengths: at 1440 the 320 pixel world is blown up **4.5x**, which is 160 blocks four
device pixels wide and 160 blocks five device pixels wide. The whole one-resolution
pass exists so the field's grid and the sprites' grid read as ONE grid, and it never
had a single block size to read. **Nothing failed and nothing could.** A ragged grid
renders, reads and sells perfectly well.

So `fieldBitmapWidth()` picked the smallest WHOLE multiple of the world that covers
what the screen can show, between two and four:

| screen | can show | bitmap | scale |
|---|---|---|---|
| 390 at ratio 3 | 1074 | 1280 | 4x |
| 360 at ratio 2 | 658 | 960 | 3x |
| 320 at ratio 2 | 640 | 640 | 2x |
| desktop 1280 | 924 | 960 | 3x |
| 1920 at ratio 2 | 2210 | 1280 | 4x (the ceiling) |

Every screen was at or under the 1440 it replaced, so it was **never more work than
before**, and every one had one block width.

**`FIELD_CAM` REPLACED THAT FUNCTION AND THE WHOLE TABLE ABOVE IS HISTORY.** It was
right about the bitmap and said nothing about what the browser did with the bitmap
afterwards, which is where the full bleed layout broke it. The live rule is in the
section above ("the window is the frame"): the canvas is the arena's own device
pixels and the crop is a source rectangle. The floor of 2 survives it.

**The floor is 2x and it is not decoration.** Below it the blit is DOWNscaling the
art, and the grid stops landing on whole pixels in the other direction.

**`FIELD_K` was 1.5 and is DELETED.** It was the old fixed blow-up, kept for a while
as a ceiling on the bitmap, and once the canvas became the arena's own device pixels
nothing read it at all. A constant nothing reads is a number the next person tunes
expecting something to happen. The crisp HUD pass replays queued type at
`FIELD_CAM.scale / PIX`, off the same camera the blit used, so the type and the
picture cannot come apart.

**The sizer is asked every frame and writes almost never.** Resizing a canvas clears
it, which is free in a loop that redraws every pixel every frame and ruinous if it
ran every frame. It has to be in the loop rather than on a resize listener, because
the canvas also changes size when the arena is first laid out and when a browser
moves between screens, and only one of those three fires a resize.

**`PIX` is read inside the function and not into a const beside it.** It is declared
below `FIELD_W`, so a const there is read before its own line and throws on load,
which takes the page rather than one number. Same TDZ as the football results screen.

**The guard asserts the PROPERTY, never a width**, over six viewports: the scale is a
whole number, the blit lands on the grid, and the bitmap is exactly the pixels the
arena occupies. (That last one replaced "never over 1440", which was a claim about
the bitmap and therefore blind to the browser upscaling it.) Pinning the numbers
would make it a test of whichever devices somebody thought of. It reads
the row **up in the stands**, where the field is flat colour, because a row through
the sprites or the chalk has real edges in it and the run lengths would be the art
rather than the grid.

**A ROW IS NEVER PURE BLOCKS, AND ASKING FOR THAT WAS THE BUG.** The crisp pass
replays queued type on the DISPLAY canvas at full resolution AFTER the blit, on
purpose, so any row crossing it carries single pixels that owe nothing to the grid.
The first draft demanded one run length and failed on five viewports of six,
reporting 182 blocks of four and 24 of one as a ragged grid. It was reading the type.
**A standalone version of the same scan passed, which is worse than failing**: its row
happened to miss the words, so the check was a coin toss on where they landed. That is
the third time an extractor in this repo has been wrong in silence.

So the claim is about the BLIT: the most common run is the scale, and what is not a
whole multiple of the scale is a sliver. Measured, off-grid pixels run **0% to 4.4%**
of the row across the six, against a threshold of 8%.

**What that still catches is the one thing only pixels can say**, which is
`imageSmoothingEnabled` coming back on. Proved rather than assumed, by forcing it back
on and re-reading: the modal run goes from 4 to **1** and the off-grid share to
**57.2%**. A check that can only pass is worth nothing.

### A comment is a claim, and most of them are checkable

Auditing what the code says about itself has found **three real bugs** in this
file: the throw meant to arrive "just after he does" that beat a safe runner by
five seconds, the coach notes teaching a removed control, and the send odds that
made speed a cost.

A sweep of the strong claims (`always`, `never`, `the only`, `one source`, and any
comment carrying a number) found **three more, and all three were the COMMENT
lying about correct code**, which is the dangerous direction: the next person
fixes the code to match.

| the comment said | the code does |
|---|---|
| `a pitcher under CON 70` | reads `pitcher.pit` |
| `windup for the first 65% of travel, release for the last 35%` | backwards on both halves: the windup is before the travel, the release is its first third |
| `Rabid Dog always swings` | 0.95, deliberately, so he can still take ball four |

The CON one matters most, and it is the exact confusion the bullpen note was
written to kill: **CON is a batting stat** that stood in for an arm nobody had
until every character got a pitching rating.

**What the guard asserts is the half that can drift silently.** A checker cannot
read English, but it can read a stat name out of the shipped source, and it can
test a structural claim: every character has a sprite with every pose (there is no
fallback path), and the higher seed hosts across thirty seeded brackets.

### The run environment is 4.5 runs a nine, and four harnesses said otherwise

```
node mythiball/check-runs.mjs         4 games an arm, about half an hour
node mythiball/check-runs.mjs 2 fast  a quicker read
```

**It is not broken and never was.** Measured through the real swing AI, with the
game's own line score: **about 5.5 runs a team over nine innings** against the real
game's 4.5. Six games, all going the distance: 3, 3, 5, 1, 6 and 4 in six innings
each, 22 runs in 36 innings.

**QUOTE THE POOL, NOT A RUN.** The first four games came out at exactly 4.5 and
that was written down as the answer, because a sample landing on the real world's
own number reads as confirmation. The next two came out at 7.5 on identical code.
Per game the spread is 1.5 to 9.0 a nine, so four games is not enough to call a
tenth of a run and this file should never carry one. What the sample IS good enough
for is the only question that was being asked: whether scoring is broken. It is
not.

It took five attempts and the first four were instrument faults, so the checker
exists to stop anybody spending a sixth.

**THE FAULT THAT HID IT IS WORTH READING BEFORE WRITING ANY HARNESS HERE.** A
fielding window nobody answers does NOT resolve as a neutral out. The grounder
window's timeout is `setTimeout(() => finish(-1), duration + 20)`, and `t = -1` is
further from ideal than `yellowHalf`, so it lands in the **error** branch: the
batter reaches and every runner moves up. The fly window expires as a **miss** the
same way. So a harness that presses nothing boots every routine ground ball and
drops every catchable fly, all game, every game.

Measured, that one omission WAS worth **27 to 32 runs a nine against 5.5**. It is
the whole of the difference. (Those two figures are the old game, kept as history:
once an ignored window became a single rather than the worst outcome it had, that
arm fell to **15.8**. Re-measure it after anything that touches an expiry, because
that is what it measures.) The samples that ended 0-18, 2-19 and 0-20 were not a bad
bat and not a broken run environment, which are the two answers this was stuck
between for months. They were **a defence with its hands tied**, which is a third
thing neither of those names.

**TWO HARNESSES AGREEING IS NOT EVIDENCE.** A tracker doing its own counting and
the game's own line score both reported the same wrong answer, because they shared
this defect rather than because it was true. What broke the tie was changing the
harness rather than adding another one.

**Only the CPU's runs count**, and the first draft of the report did not do that.
The player's side never swings in these harnesses, so it scores zero by
construction, and averaging a real team with a non-participant halves the answer:
it printed 1.5 for a defence that had conceded 3.6. The CPU is the AWAY side,
because `startGame` runs with `youHome` true.

The robbery is deliberately left unanswered, because a miss there costs nothing by
design and playing it would flatter the defence instead.

**What this does to the send gate.** A runner scores from second on a single 24% of
the time here against about 60% in the real game, and two thirds of that gap is the
`spd >= 75` gate deciding who even tries. That read like a number waiting to be
loosened, and the old note here said to measure the run environment before touching
it. Measured: scoring is **already at or a little above** the real game's figure.

**THAT GATE HAS SINCE BEEN LOOSENED ANYWAY, AND THE ARGUMENT IT OVERTURNS IS WORTH
KEEPING.** The note used to finish "sending more runners pushes it further up rather
than correcting anything", which is correct arithmetic and the wrong target: it is
measuring an arcade game against MLB and calling the distance an error. A backyard
game is a HIGH SCORING game, so a run environment a little over the real one is
where this wants to sit, and the send gate was the one place it was quietly under.
See the gate's own section above for what moved and what it cost. **The lesson is
not "ignore the real figure"**: it is that the real figure is a landmark and not the
target, and which side of it to sit on is a design call that has to be written down
rather than inferred from how close a number is to 4.5.

It needs more games than you think to see any of this: the per game spread is 1.5 to
9.0 a nine, so a tuning move worth half a run is invisible under about twenty, which
is what `--jobs` is for.

**Re-measured after the gate came down and the contact retune landed: 6.2 a nine**,
game by game 1.5 to 12.0 over eight games. Both changes push scoring up and both
were meant to, so up is the result rather than a surprise; what it confirms is that
neither ran away with it. Eight games cannot call a tenth of a run, so read that as
"a little over where it was" and nothing finer.

What `calibrate.mjs` independently says, and it agrees: the contact model is not
broken either, at roughly 9 or 10 hits per 27 balls in play at both tiers.

### Twenty games is the sample, so the harness runs them at once

```
node mythiball/check-runs.mjs 20 fast --jobs=4
```

A five inning game at Fast is about eight minutes of WALL CLOCK and **almost none of
it is work**: the cost is the game's own beats, which are `setTimeout` waits. So
twenty games serially is hours of a machine waiting, and the honest way to get the
sample is to run several pages at once rather than to hurry any one of them.

**A harness-only speed below Fast was the other option and is refused.** It would
change the very timings the measurement runs through, which is how four of the five
earlier attempts at this number went wrong. Four pages waiting on their own timers
are four identical games; one page waiting on a shorter timer is a different game.

**What has to be watched is the rAF watcher that plays the fielding windows.** It
fires on a `setTimeout` at an exact millisecond, so a starved page could miss windows
and quietly take the defence's hands away again, which is the exact defect this file
exists to prevent and which reads as a broken run environment rather than as a broken
harness. It is measured rather than assumed: **`windows played` is printed on every
run**, so a starved run is visible in the report itself.

**A serial and a parallel run must load the same build.** The pages read
`mythiball/index.html` off disk at `goto` time, so an edit landing between the two
arms compares two different games and reports it as a harness difference. An
in-flight comparison was thrown away for exactly this reason.

**Measured on four pages at once: 101 fielding windows played across 8 games**, so
the watcher is not being starved. That is the number to read before trusting any
run this file prints.

**A RESTART HAS TO WAIT ON THE GAME, NOT ON A CLOCK.** Every SECOND game on each
page came back `0 in 1` in the nobody-fields arm: a fresh game already over, at
inning one, with nobody having scored. It waited a fixed 900ms after restarting
and then read `over`, which in the window before the restart settles is still the
FINISHED game's flag. The loop broke instantly and the box was then read off the
new game, so a one inning nothing was filed as a real row, four times, inflating
that arm.

**It is the harness and not the game, and that was driven rather than assumed.**
The obvious reading is the bug class this file already carries (a timer firing
into a game that is not its own), and it is the wrong one: a probe that ends a
game by mercy, by an ordinary finish and not at all, then restarts, gets a live
game every time. Only the arm that MERCY-ends ever showed it, which is what made
the game look guilty. Worth remembering before the next "0 in 1" is read as a
mode that broke.

### The swing's own curves, and what skill actually buys

```
node mythiball/check-bat.mjs
```

`calibrate.mjs` measures the pitch duel as RATES: how often a swing whiffs, fouls or
puts the ball in play. What it cannot see is the SHAPE of the function underneath,
and `swingGeometry` is pure, so it can be swept directly the way `sendOdds` is.

It walks timing and aim across all three swing modes, asserts worse never helps,
asserts the mode ordering (contact widens the window, power narrows it) and that a
better CON both reaches further and makes better contact on the same imperfect
swing. Then it drives 400 real swings a row through `resolveSwing` and reports
against bands, with the error expressed **in units of the window** rather than in
meter units, which is the fix for its own first draft: measured against the meter,
three of four rows came back at 100% and the check certified nothing.

**What it found is a property worth knowing before tuning any of this.** The timing
window is close to BINARY: inside it you connect essentially always, outside it you
mostly do not. So skill does not live in whether you connect, it lives in contact
QUALITY, which falls 0.99 / 0.74 / 0.45 / 0.08 across perfect, sharp, ordinary and
blind swings. That is the backyard shape rather than a fault, and it is why the
whiff dial below moves contact quality very little.

**Its monotonicity check passed on everything until it was proved to have teeth.**
The first draft multiplied by a direction term in the wrong place and flagged every
healthy curve, which is the safe failure; the version that ships was checked by
reintroducing a seam.
