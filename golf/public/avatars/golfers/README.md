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

`build-a-golfer.html` contains the recolor engine (search `avClassify` /
`paintAvatar`). For the selected gender it loads the matching base portrait, then
re-tints the detected **skin / hair / shirt / cap** regions to the chosen colors
while keeping the painted highlights. Results are cached per
gender·skin·hair·shirt combo, so swatch changes are instant.

- Gender → which base portrait (male / female)
- Skin / Hair / Shirt → live recolor to the exact wheel-swatch colours
- Cap → recolored to match the shirt colour

Target colours are the picker swatches themselves — the `m` field of
`SKINS`/`HAIRS`/`POLOS`. No per-combo files, no 420-image checker — the avatar is
generated dynamically.

Fallback: if a base image can't load (or the canvas is tainted, e.g. opened via
`file://`), the app draws its built-in vector bust so nothing breaks.
