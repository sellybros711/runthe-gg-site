# College Football: Perfect Season, the mark

The RunThe.GG puzzle helmet in this game's colorway. Four interlocking quarters and a
facemask, the same drawing the NFL game uses, so the two read as one studio and nobody
has to learn a second logo to recognise the second game.

**Green and gold, not four unrelated hues.** The NFL mark runs red, blue, green, orange
because those are its five position colors. A school does not look like that. This one
runs emerald, gold, amber, deep green: a school colorway that still leaves four quarters
you can tell apart at 32px rather than one flat disc.

**No type in the mark.** It draws at 16px in a browser tab with no font loaded.

## The files

| File | Use |
|---|---|
| `mark.svg` | The bare mark, cropped to its own ink. Use wherever there is already a surface behind it. This is what the header draws. |
| `icon.svg` | The mark on the game's own `#111827` panel, for anything that wants a square: favicon, tab, bookmark, home screen. |
| `icon-maskable.svg` | Android launcher icons only. **A different drawing, not `icon.svg` scaled.** |

`icon-maskable.svg` exists because Android crops a maskable icon to whatever shape the
launcher likes and only guarantees the middle 80%, a circle of radius 0.4 of the width.
So its plate runs full bleed with no corners of its own, since the launcher supplies
them, and the mark is pulled in to sit inside that circle. Handing a launcher `icon.svg`
would crop its rounded corners and the outer edge of the facemask, and the facemask is
the part that has to survive.

`mark.svg` carries a tight `viewBox` rather than the square one the other two use, so it
arrives at the header's own aspect instead of in a square box with air down both sides.

## Generated, not hand-authored

All three SVGs come out of `cfb/build/06-mark.mjs`. **Edit that, not these.**

The reason is the knobs. Each quarter is traced centre to rim, around the arc, and back,
and every knob is a semicircular arc whose sweep flag depends on which direction that
particular seam is being travelled. Get one wrong and the knob turns inside out, which is
invisible in the path data and obvious only once it renders. The generator derives all
sixteen from `CX`, `CY`, `R` and the knob size, so moving the shell cannot desynchronise
them.

`cfb/build/07-icons.mjs` rasterises the SVGs to the PNG sizes browsers, iOS and Android want.
Chromium does the rasterising, which is the same engine that would draw the SVG live.

## The one real cost

One picture at every size, including 16, where the facemask goes to a handful of grey
pixels and reads as texture rather than as a cage. At 32, which is what a retina tab
actually draws, it reads properly. What that buys is one mark instead of two.
