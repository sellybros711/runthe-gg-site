# Shut The Door: three directions

Mockups for the owner to pick one. Nothing here is loaded by the live game, and no game file was
changed. Every page is noindexed. Open `design/index.html`, or a direction's `index.html?s=<screen>`
(`brand`, `home`, `menu`, `mound`, `pitch1`, `pitch2`, `pitch3`, `end`, `coach`). Serve the repo root
first (the pages load sibling files, so `file://` will not work).

All three follow the owner's rulings from v1:

- **No grades during play.** The mound and the pitch frames show the game and nothing else: no grade
  card, no strip filling in, no tip. The outcome, the grade strip, the percentile and the score are
  revealed together at the end.
- **The coach is behind a button.** "Talk to pitching coach" on the end screen opens a conversation
  with a pitching coach character. It never opens by itself.
- **Its own identity.** None of the three uses the site shell, the Arcade or v1's look.
- **The pitcher's view.** The grid is placed in 3D at the front of the plate in catcher's view
  (contract section 2) and projected through the camera, so the pitcher's view mirror falls out of the
  projection. A lefty stands on the screen's left, and his "away" is the screen's right.

## The content is real

| what | where it comes from |
|---|---|
| the spot, arsenal, lines, zones, heat map | `data/packs/std-2025-ws7-yamamoto.json` |
| the end screen: door shut, 12 pitches, 0 runs, score 764, 75th percentile, pitched like Corey Knebel, matched the real 14 pitch door shut | `engine.js` run on that pack (practice seed 115) |
| the strip: green yellow green yellow green yellow green orange green red green red | the same run |
| the score histogram (C) | the pack's `pool.scores`, 20 point bins |
| the coach: 0-2 to Varsho, splitter middle 87.5% against cutter up and away 93.2%, .412 xwOBA, 12% against 1%, "next time ahead 0-2, keep it up and away, out of the zone" | `grade.js` and `lesson.js` on that pack |
| the pro example: Chapman to Pence, 2016-10-10, NLDS at SF, 2-2, two on, nobody out, four-seam up and away, swinging strike three | the pack's `pros` (id 487609:67:6) |

**Sample, and labelled so:** the game state at the mound (Varsho up, 0-1, pitch 8) and the curveball in
the pitch frames (Yamamoto's real average velocity and movement, but a drawn sample, aimed at cell 21,
landing at cell 16). The coach's spot (Varsho, 0-2, nobody on, nobody out, up one) is graded by the real
engine on the real pack, but Varsho bats fifth, so that exact state cannot follow the real start. The
coach's name, "Coach Hank", is a placeholder for the owner to change.

## A. Under The Lights (`under-the-lights/`)

A night game telecast.

1. The ninth inning is a TV moment. The score bug, the lower thirds and the lit park make every
   pitch feel like the broadcast of a big out.
2. The render is the most realistic of the three: soft shadows, stadium rim light, a blurred crowd
   behind the plate, bloom and grain.
3. The coach is the voice after the broadcast: calm, in conversation, with the call drawn on a grid.

- Brand: a door lockup with tower light spilling through the gap, "SHUT THE DOOR" in Oswald caps,
  amber on midnight. Line: "Three outs. Your call."
- Menus: a full screen program guide (on now, learn, you), each row with its live detail.
- Pitch: a lit tracer ribbon, the spin-free path as a faint dashed ghost, aimed and went markers.

## B. Scorecard (`scorecard/`)

An old ballpark on a summer afternoon, drawn as pixel art.

1. The closest to Putt Putt's look, but from a properly proportioned, lit 3D model: five step colour
   ramps, ordered dither, and outlines in each material's shadow colour.
2. The whole game is a program you hold: a hand-hung scoreboard, a scorebook with pencil, a ticket to
   take the mound, a contents page for the menus.
3. The coach sits in the dugout and talks on a notepad, in plain words, a little dry.

- Brand: scoreboard tiles spelling SHUT THE DOOR, a pennant, Alfa Slab One with Courier Prime for
  stats and a pencil hand (Caveat) for notes. Line: "Three outs. Your arm."
- Menus: a table of contents with dotted leaders and live details.
- Pitch: chalk dot trail, a pencil X where you aimed, a red circle where it went. Overlays are drawn at
  the render's own pixel size, so they are pixel art too.

## C. Pitch Lab (`pitch-lab/`)

A modern sports app where the data is the hero.

1. Clean white cards, Space Grotesk numbers, a signal orange, and a cel shaded park with ink outlines.
2. The pitch is drawn like tracking data: one dot per moment of flight, the spin-free path in blue,
   and the pitch's real season movement printed under it.
3. The end screen puts you on the real distribution of every closer outing in this spot.

- Brand: lowercase "shut the door." with a mark that is the strike zone, its last column swung shut.
  Line: "one inning. your calls."
- Menus: a five tab bar (today, stats, past, learn, settings) and a "you" sheet.
- Home: the arsenal as a break chart from the pitcher's view, sized by usage.

## What I would build

**B, Scorecard.** It is the most distinct identity of the three. It answers the owner's reference
directly (Putt Putt, more realistic): the figures are modelled and lit, and only the finish is pixel
art. The pixel finish also forgives a simple model. A smooth render (A, C) shows every seam of a body
built from primitives, so A would need much more modelling to avoid a mannequin look. It is also the
cheapest to run on a phone: a frame is about 160 by 250 cells. If the owner wants the most realistic
look instead, A is the one, at the cost of a modelling pass.

The pitch is watched from the pitcher's own eye in all three, the same view you aim from. A center
field camera, tried first, squeezes the 56 foot flight into about 70 px on a phone, and the break
disappears. The center field shot is kept for the home hero and the end screen.

## What the rendering would take to build for real

The mockups ray march every pixel in `shared/std3d.js`. That is fine for a mockup (1 to 10 s a frame
in headless Chromium here) and wrong for a game. The build should not ship it.

- **Figures as cached sprites, the `golfer3d.js` way.** That file already models a posed figure from
  primitives and hands each cell to PXHD's paint step (ramps, contact shadows, outline). The batter,
  catcher, umpire, pitcher and coach would be new models in that pipeline. Each pose is drawn once and
  cached (golfer3d measures 20 ms a sprite on a desktop and 60 to 100 ms on a throttled phone). The
  sets: batter stance, load, stride, swing, take; catcher set and receive at a few heights, with the
  mitt as its own sprite placed on the target; umpire; a 6 to 8 frame delivery; the coach bust.
- **The park drawn once per daily.** A static background like `hole3d.js`, built in `slices()` while
  the page is idle. The bloom, depth of field and grain of A are baked into that picture.
- **The pitch is 2D every frame.** The ball and tracer are projected through the same camera as the
  background (as `tracer3d.js` does for the golf ball), so 60 fps on a phone is easy. The flight in
  the mockups is real physics: gravity plus the pitch's own pfx movement.
- **A phone budget.** About 15 sprites at 30 to 100 ms each is 0.5 to 1.5 s of work, spread over idle
  time before the first pitch, behind a short "warming up" state. The animation itself costs almost
  nothing.
- **Not WebGL first.** A three.js build would look smoother but adds a large download and a second
  rendering style to the site. The sprite route matches Putt Putt and Run The Tour.

## Files

```
design/index.html            the index of the three
design/<direction>/index.html  every screen of one direction (?s=<screen>)
design/shared/std3d.js       the mockup renderer (SDF figures, the park, three finishes)
design/shared/std-figures.js the posed figures (IK rig, kits, poses)
design/shared/std-scene.js   kits, the three looks, cameras, the frames
design/shared/std-overlay.js the grid, heat map, tracer, ball, glyphs, mini grids
design/shared/std-sample.js  the sample content and where each fact comes from
design/shared/std-page.js    the screen switcher
design/shared/fonts/         OFL fonts (Oswald, Alfa Slab One, Zilla Slab, Courier Prime, Caveat, Space Grotesk)
```
