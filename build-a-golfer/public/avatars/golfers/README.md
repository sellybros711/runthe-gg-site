# RunTheTour golfer avatars — layered canvas recolor

The Create-Your-Golfer avatar is **not** a set of pre-rendered PNGs anymore. Two
high-quality painted base portraits (male + female) are recolored live on a
`<canvas>` based on the player's choices, preserving the original painted shading.

## Base art (the only image files needed)

```
base/male-base.png
base/female-base.png
```

Square PNGs (≈512×512) with the dark-green circular badge and the teal cap baked
in. To refresh the art, replace these two files — nothing else changes.

## How it works

`build-a-golfer.html` contains the recolor engine (search `AV_COLORS` /
`paintAvatar`). For the selected gender it loads the matching base portrait, then
re-tints the detected **skin / hair / shirt** regions to the chosen colors while
keeping the painted highlights. The **teal cap is never recolored**. Results are
cached per gender·skin·hair·shirt combo, so swatch changes are instant.

- Gender → which base portrait (male / female)
- Skin / Hair / Shirt → live recolor (target colors in `AV_COLORS`)
- Cap → always teal (left untouched)

No per-combo files, no 420-image checker — the avatar is generated dynamically.
The customization tokens (skin-01-fair … shirt-07-charcoal) live on
`SKINS`/`HAIRS`/`POLOS` (`file:` field) and key into `AV_COLORS`.

Fallback: if a base image can't load (or the canvas is tainted, e.g. opened via
`file://`), the app draws its built-in vector bust so nothing breaks.
