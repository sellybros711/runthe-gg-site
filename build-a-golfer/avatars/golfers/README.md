# RunTheTour golfer avatars

The Create-Your-Golfer preview loads a raster portrait from this folder based on
the selected **gender · skin · hair · shirt**. Every golfer has a teal cap (the
cap option was removed), so the cap is baked into the art and is **not** part of
the filename.

## Filename pattern

```
{gender}_{skin}_{hair}_{shirt}.png
```

Example: `male_skin-02-light_hair-02-dark-brown_shirt-01-teal.png`

- **2 genders × 5 skins × 6 hairs × 7 shirts = 420 files.**
- Square PNG, the dark-green circular badge baked in (see the seeded samples).
  Recommended export **512×512** (or larger square); the app clips to a circle.

### Tokens

| gender | skin | hair | shirt |
|---|---|---|---|
| `male` | `skin-01-fair` | `hair-01-black` | `shirt-01-teal` |
| `female` | `skin-02-light` | `hair-02-dark-brown` | `shirt-02-blue` |
| | `skin-03-tan` | `hair-03-brown` | `shirt-03-red` |
| | `skin-04-medium` | `hair-04-blonde` | `shirt-04-gold` |
| | `skin-05-deep` | `hair-05-auburn` | `shirt-05-cream` |
| | | `hair-06-gray` | `shirt-06-purple` |
| | | | `shirt-07-charcoal` |

## Fallbacks

If a specific combo file is missing, the app falls back to the per-gender
placeholder, then to the built-in vector bust — so it never breaks while the full
set is still being produced.

- `_fallback_male.png`
- `_fallback_female.png`

## Seeded samples (placeholders — replace with final art)

These few high-quality samples are in place now so the system is demonstrable.
Drop the full 420 in alongside them using the pattern above (overwriting these):

- `male_skin-02-light_hair-03-brown_shirt-01-teal.png`
- `female_skin-02-light_hair-03-brown_shirt-01-teal.png`
- `male_skin-05-deep_hair-01-black_shirt-05-cream.png`
- `female_skin-01-fair_hair-05-auburn_shirt-01-teal.png`

> Note: the in-app swatch **ids** (light/tan/medium/brown/deep, etc.) map to these
> tokens by lightness/colour order — see `SKINS`/`HAIRS`/`POLOS` (`file:` field) in
> `build-a-golfer.html`. Keep the tokens above as the canonical filenames.
