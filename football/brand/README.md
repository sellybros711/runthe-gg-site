# The Perfect Season: the mark

Two things, both taken off the screen rather than invented for a logo.

**The zero** is what the game is for. A perfect season is 20 and 0, and the zero is the
half worth drawing: nothing got through. It is set as a rounded **rectangle**, not a
circle, for two reasons. It matches Big Shoulders Display, the squared-off condensed
face the game sets every record and every reel in. And a ring with a bar across it is
the London Underground roundel, which an earlier version of this mark was, exactly.

**The band** is the wheel: the lit strip that holds whichever year or team the reel
stopped on, drawn the way the draft screen draws it, an outer bar with a bright face
inside. It crosses the zero rather than striking it out, which is why it runs past
both edges.

Blue zero, red band, because those are the two colors the whole game runs on. `--wr`
`#0f93ff` and `--qb` `#ff0a3b`, the same variables the position chips use.

There is **no type in the mark**, so it renders at 16px in a browser tab and needs no
font loaded to draw at all.

## The files

| File | Use |
|---|---|
| `mark.svg` | The bare mark. Use this wherever there is already a surface behind it. |
| `icon.svg` | The mark on the reel box's own navy, for anything that wants a square: favicon, tab, bookmark, home screen. |
| `icon-maskable.svg` | Android launcher icons only. **A different drawing, not this one scaled.** |
| `logo.svg` | The horizontal lockup, mark plus wordmark, for web use where the font is loaded. |

`icon-maskable.svg` exists because Android crops a maskable icon to whatever shape the
launcher likes and only guarantees the middle 80%, a circle of radius 0.4 of the width.
So its background runs full bleed with no corners of its own, since the launcher
supplies them, and the mark is pulled in to sit inside that circle. Measured: its ink
reaches 0.308 of the width, while `icon.svg` reaches 0.573. Handing a launcher
`icon.svg` would crop off its border and both ends of the band, and the band is the
part that has to survive.

## The lockup

`logo.svg` sets the wordmark as **text, not outlines**, so it needs Big Shoulders
Display loaded by the page around it. That is fine on this site, which already loads it
for every record and every reel, and it keeps the file editable and tiny. It is not
fine anywhere the font is absent, which is what `mark.svg` and `icon.svg` are for:
neither carries a glyph.

Clear space is the height of the band on every side. The mark and the wordmark are
locked: do not respace them, do not restack them, and do not set the wordmark in
anything but Big Shoulders Display at 900.

## Where it appears

In the header, at 24px, left of the site name, on every screen.

It went on the landing screen first at 56px above the title, and came off again because
it cost the last button its place on the first screen: measured, the Leaderboard button
ended at 847px against an 844px viewport, and at 780px once the mark came out. The
landing screen already opens with the game itself animating and the title set in the
same face, so a third piece of identity there was paying for something it already had.

The inline copy in `index.html` is the same geometry as `mark.svg`, and `v42.mjs`
compares the path and every rect between the two on each run, because a logo that
drifts from its own source file is worse than no source file.

## What this replaced

A stock football on a green tile, in the favicon and in both manifest icons. The green
was `#0f3d2e`, which is not a color anywhere in this game.
