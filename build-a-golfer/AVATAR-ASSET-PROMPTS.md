# RunTheTour — Avatar & Accessory Image-Generation Prompts (CS183 Phase 2)

You'll paste these into your image AI. The goal is a **layered, dressable full-body golfer**: one base
body per gender, plus each accessory as its own transparent overlay that I position/scale in code. The
in-game shop + coins + boosts already ship (Phase 1); these assets are the visible layer.

## 0. Read first — the rules that make layers line up

Every image MUST follow these or the layers won't stack:

- **Transparent background** (PNG with alpha). No green backdrop, no scenery, no ground shadow.
- **Same canvas every time: 1024 × 1792 px, portrait.**
- **Same framing every time:** full body, front-facing (looking at camera), standing straight and relaxed,
  arms slightly away from the body, feet flat. Head near the top with a small margin; feet near the bottom.
  Character centered horizontally. **Do not zoom or crop differently between images** — the golfer must
  occupy the same footprint in every render so hats land on the head and shoes land on the feet.
- **Flat, even, neutral studio lighting.** No strong directional light, no dramatic shadows (those bake in
  and clash when layered).
- **Style:** semi-realistic, clean painted/illustrated look, matching the two reference figures I was given
  (the man in the purple polo + navy pants and the woman in the purple polo + navy skirt). Keep that exact
  art style, proportions, and rendering across everything.
- **Neutral expression, friendly.** No motion/swing pose — a calm standing pose.

Name files exactly as the **`file:`** line in each prompt so I can wire them straight in.

---

## 1. Base bodies (do these first — everything else sits on top)

### 1a. Male base — `file: base-male.png`
> Full-body front-facing illustration of a young male golfer standing relaxed, arms slightly away from the
> sides, looking at the camera. Semi-realistic clean painted style. He wears a **plain white golf polo,
> plain light-gray golf trousers, and plain white golf sneakers. Bare head (no hat), short brown hair, no
> sunglasses, no glove, no accessories.** Neutral friendly expression. Even flat studio lighting, no
> shadows. Transparent background. Centered, full body from head to feet, 1024×1792 portrait.

### 1b. Female base — `file: base-female.png`
> Same as above but a young female golfer: **plain white golf polo, plain light-gray golf skort/skirt,
> plain white golf sneakers, bare head, brown hair in a low ponytail, no sunglasses, no accessories.** Same
> style, framing, lighting, transparent background, 1024×1792 portrait. **Identical pose, scale, and camera
> to the male base** so both align to the same skeleton.

### 1c & 1d. Region masks (lets me recolor the kit + skin/hair in-game)
For EACH base, regenerate the *exact same silhouette/pose* as a flat color-coded map (no shading, no
detail — just solid fills):
> A flat color-map version of the SAME golfer figure in the SAME pose and position. Fill each region with
> one solid flat color, hard edges, no shading: **skin = solid red (#FF0000), hair = solid green (#00FF00),
> polo shirt = solid blue (#0000FF), trousers/skirt = solid yellow (#FFFF00), shoes = solid magenta
> (#FF00FF), everything else and the background = solid black (#000000).** No gradients, no anti-alias
> texture. Transparent or black background, 1024×1792, same framing as the base.
- `file: base-male-mask.png`
- `file: base-female-mask.png`

> Why: I recolor the polo/trousers/skirt/shoes and the skin/hair by reading these masks — same technique the
> current portrait uses. It means one base covers every skin tone, hair color, and kit color.

---

## 2. Headwear (slot: Headwear) — standalone transparent PNGs of JUST the hat

Each: **only the hat**, front view, on transparent background, sized and angled to sit on the base's head
(picture where the head is in the base image and draw the hat at that spot and scale). White/neutral color
so I can recolor it. 1024×1792 canvas with the hat placed where a head would be (rest transparent).

- `file: acc-head-cap.png` — > A plain white baseball-style golf cap, front view, curved brim, no logo.
- `file: acc-head-visor.png` — > A white golf sun visor (open top, no crown), front view, no logo.
- `file: acc-head-bucket.png` — > A white bucket hat, front view.
- `file: acc-head-champ.png` — > A premium white golf cap with a small gold crown emblem on the front (the "Champion's Cap").

## 3. Eyewear (slot: Eyewear) — standalone, placed at eye level

- `file: acc-eyes-sport.png` — > A pair of sporty wraparound sunglasses, front view, dark lenses, thin frame, transparent background, positioned where a face's eyes would be.
- `file: acc-eyes-aviator.png` — > Classic aviator sunglasses, front view, gold frame, dark lenses.
- `file: acc-eyes-shield.png` — > Modern single-lens shield sport sunglasses (the "Eagle-Eye Elites"), front view, mirrored lens.

## 4. Gloves (slot: Glove) — standalone, placed on the (left) hand

- `file: acc-glove-white.png` — > A single white golf glove worn on a hand, fingers down, front view, transparent background.
- `file: acc-glove-gold.png` — > A single premium gold-trimmed white golf glove (the "Golden-Grip Glove").

## 5. Shoes (slot: Shoes) — standalone pair, placed at the feet

- `file: acc-shoes-trainer.png` — > A pair of white spikeless golf sneakers, front view, side by side, transparent background, positioned where feet would be.
- `file: acc-shoes-boa.png` — > A pair of modern white-and-black BOA-dial golf shoes.
- `file: acc-shoes-carbon.png` — > A pair of futuristic white carbon-plate golf cleats with subtle gold accents.

## 6. Clubs / held gear (slots: Driver, Putter) — standalone, held in the right hand / resting at side

Draw the club so its grip is roughly where a lowered right hand would be, shaft down to the ground:

- `file: acc-driver-graphite.png` — > A modern golf driver (big club head down at the ground, shaft up to a grip), held vertically at the golfer's side, front view, transparent background.
- `file: acc-driver-titanium.png` — > A premium titanium golf driver, chrome head, held vertically at the side.
- `file: acc-driver-rocket.png` — > A futuristic high-tech golf driver with red accents (the "Rocket-Launcher Driver"), held vertically at the side.
- `file: acc-putter-blade.png` — > A classic blade putter held vertically at the golfer's side, front view, transparent background.
- `file: acc-putter-mallet.png` — > A modern mallet putter held vertically at the side.
- `file: acc-putter-wand.png` — > A sleek premium putter with a golden shaft (the "Magic Wand"), held vertically at the side.

## 7. Small props (slots: Ball, Charm) — small standalone items

These render small (a held ball, a bag tag, a hat pin). Front view, transparent:

- `file: acc-ball.png` — > A single white golf ball with dimples, close-up, transparent background.
- `file: acc-charm-clover.png` — > A small four-leaf-clover enamel pin/charm, gold-edged, transparent background.
- `file: acc-charm-marker.png` — > A round golf ball-marker coin, gold, transparent background.

---

## 8. Optional — a golf bag prop (nice-to-have, stands beside the golfer)
- `file: acc-bag.png` — > A golf stand-bag full of clubs, standing upright on the ground, front-3/4 view, transparent background, sized to stand next to a full-body golfer.

---

## Delivery
Send the PNGs back (keep the exact filenames). Priority order if you want to do it in waves:
1. **`base-male.png`, `base-female.png` + the two masks** (unlocks the recolorable full-body avatar).
2. Headwear + Eyewear + Shoes (the most visible gear).
3. Drivers/Putters + small props.

Once I have set 1, I'll swap the portrait for the full-body dressable avatar; each further set just makes
more shop items visibly appear on the player. I position/scale every overlay in code against the base, so
minor size differences are fine — just keep the **pose, framing, and canvas** consistent.
