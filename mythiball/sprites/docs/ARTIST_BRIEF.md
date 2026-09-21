# The brief to hand an image model

Paste the block below into a fresh chat and attach `STYLE_REF.png` from this
folder. It is written for a generator that draws pictures rather than writing
pixel data, so it asks for a magenta key rather than transparency and for a
grid rather than a strip: `tools/ingest.py` is what turns the answer back into
64x64 frames, and it refuses anything that misses the spec rather than
quietly accepting it.

Do the calibration character first and look at what comes back. Nothing here
is worth running sixty-eight times before one has been through the whole
pipeline and onto the field.

---

You are drawing sprites for MythiBall, a browser arcade baseball game. Sixty
eight public domain characters play it. I will ask for one character at a
time and I need every sprite to drop into an existing sheet without being
redrawn, so the spec below is a contract rather than a style note.

I have attached a reference sheet of three characters whose art is already
finished. MATCH IT. It is the single most important input here.

## The format

- Every sprite is **64x64 pixels**. Nothing is any other size.
- Draw at **16x scale**, so one sprite pixel is a 16x16 block of identical
  colour and one cell is 1024x1024. Keep the blocks square and aligned to a
  strict grid. Do not soften, blur or anti-alias the block edges.
- **Background is solid magenta `#FF00FF`**, everywhere, including gaps
  between the legs and under the arms. No transparency, no gradient, no
  drop shadow, no ground shadow, no vignette. I key the magenta out.
- **Never use magenta anywhere in the character.**
- Cells are laid out on a grid I name per request, left to right, top to
  bottom. **No art may cross a cell boundary.** A bat, a wing or a tail that
  runs out of its own cell is the most common way this gets thrown away.
- **No labels, captions, numbers, frame borders or grid lines** in the image.
  Cells butt directly against each other.

## What the drawing has to be

- **Hard edges and flat colour.** No anti-aliasing, no gradients, no soft
  shading, no outer glow. Shading is done with a small number of flat tones.
- **20 to 24 working colours for the whole character**, and the SAME palette
  in every pose. List the palette as hex at the end of each reply so I can
  hold you to it.
- The figure stands **55 to 64 sprite pixels tall** in the 64 box, feet on the
  bottom row, and leaves **at least 2 sprite pixels clear of the left and
  right edges**. A character that fills the box side to side gets rejected.
- Read at a glance at real size: this is drawn at 16x but it is SEEN about
  45 pixels tall. Big silhouette, few details, strong colour blocking. One
  eye of two flat pixels reads; a drawn iris does not.
- **Every action pose faces RIGHT.** The front still faces the camera. There
  is no left-facing art: the game mirrors the right-facing frames itself, so
  drawing one wastes your time and mine.

## The source

Each character comes from a **public domain** original: the text, the original
illustrator, classical art, folklore, or a pre-1930 film. Screen designs that
are still owned are not usable, so a redraw must avoid them. I will name the
source and what to avoid with each request. If what I give you is thin, ask
rather than reaching for the version you know best.

## The pose set

Four groups. I will ask for them in this order and attach the previous
group's image to each request, so the character stays the same person.

**A. Stills, 4 cells in a row (4096x1024)**

| cell | what it is |
|---|---|
| 1 | standing, right profile, neutral, holding whatever he carries |
| 2 | standing, facing the camera, same pose |
| 3 | standing, seen from BEHIND, back of the head and shoulders |
| 4 | walking away from the camera, head down, shoulders dropped, dejected |

**B. The bat, 5 cells in a row (5120x1024)**

| cell | what it is |
|---|---|
| 1 | batting stance: side on, bat up over the back shoulder, waiting |
| 2 | load: weight back, bat cocked, the instant before the swing |
| 3 | early swing: bat coming forward, hips open |
| 4 | contact: bat out level in front, a white ball at its tip |
| 5 | follow through: bat wrapped over the front shoulder |

**C. Pitch and run, 2 rows of 4 (4096x2048)**

Row 1, the pitch: 1 set with the ball in the glove; 2 leg kick, hands high;
3 release, arm forward, ball leaving the hand; 4 follow through, arm across.

Row 2, the run: four frames of a running cycle in right profile, legs at
contact, passing, extension and passing again, so 1 to 4 loops cleanly.

**D. Fielding and celebration, 2 rows of 3 (3072x2048)**

Row 1: 1 catching, both arms up, glove overhead; 2 throwing, arm cocked back
with the ball; 3 celebrating, arms raised, delighted.

Row 2: 1 celebrating, second frame, a different beat of the same action;
2 and 3, running AWAY from the camera, two frames of the cycle seen from
behind, to pair with the rear still in group A.

## What I do with it

I snap your image back to 64x64 a cell, key out the magenta, quantise the
palette and run it against the game's own checks: every frame has to hold most
of the character, nothing may be sliced by the side of its cell, and no two
poses may come out as the same drawing. If a cell fails I will tell you which
one and why, and I need that one cell redrawn rather than a fresh sheet.

## Start here

Draw **group A only**, for the calibration character I name next. Do not draw
the other groups yet. When you have, list the palette as hex.
