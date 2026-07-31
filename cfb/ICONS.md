# The mark

**Same helmet as the NFL game, on purpose.** The two games are the same game in two
sports and they share a logo, so nobody has to learn a second mark to recognise the
second game. There is no college colorway and there should not be one.

These files are byte-for-byte copies of the ones in `/football/`:

| File | Use |
|---|---|
| `mark.png` | 90x81, transparent. The header lockup. |
| `logo.png` | 512x512, transparent. The plate-free mark, used by `og-source.html`. |
| `favicon-16.png`, `favicon-32.png`, `favicon-48.png` | Browser tabs and bookmarks. |
| `apple-touch-icon.png` | 180x180. The iOS home screen. |
| `icon-192.png`, `icon-512.png` | The manifest, and the crest on the site's home page. |
| `icon-maskable-512.png` | Android launchers only. A different drawing, not `icon-512.png` scaled. |
| `wordmark.png` | The RunThe.GG wordmark on the field. Shared site asset. |

**Copies rather than links to `/football/`** so a restructure over there cannot break the
manifest or the tab icon here, and so the manifest's icon paths stay relative to `/cfb/`.
The cost is that changing the mark means changing both directories. That is the intended
cost: the mark is not supposed to change for one game and not the other.

To resync after a change on the NFL side, from the repo root:

```
for f in favicon-16 favicon-32 favicon-48 apple-touch-icon \
         icon-192 icon-512 icon-maskable-512 mark logo wordmark; do
  cp football/$f.png cfb/$f.png
done
node cfb/build/06-og.mjs   # the share card embeds logo.png
```

`icon-maskable-512.png` is a separate drawing because Android crops a maskable icon to
whatever shape the launcher likes and only guarantees the middle 80%, a circle of radius
0.4 of the width. Its plate runs full bleed with no corners of its own, since the launcher
supplies them, and the mark is pulled in to sit inside that circle.

## The one real cost of one picture at every size

At 16px the facemask is a handful of grey pixels and reads as texture rather than as a
cage. At 32, which is what a retina tab actually draws, it reads properly. What that buys
is one mark instead of two.
