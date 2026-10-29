# Run The Ropes: design system

The living version of this document is the style guide at `wrestling/style/` (open
`index.html` from the site, or the published preview). Every token and component named here
is rendered there, in all three candidate directions. The wrestler sample sheet is
`wrestling/style/sheet.html`, drawn by `wrestling/pxwrestler.js`.

Status: **a proposal awaiting a decision on direction and on the wrestler sheet.** Nothing in
the career game uses any of this yet.

---

## 1. Concept

**A pay-per-view in pixels.** The game should feel like a premium 16 bit wrestling game that
somebody gave a modern broadcast truck: a dark arena, hard spotlights cut in stepped pixels,
canvas and steel, a crowd that is a field of coloured pixels, and loud poster type for the
moments that matter. Restraint everywhere except the big moments. The bell, the finisher, the
title change and the turn get real hits (an impact frame, a shake, a flash kept under the safe
limit). Everything else is calm, legible and fast, because a career is mostly reading and
deciding.

Three directions were rendered as the same phone screen (`docs/shots/directions.png`):

| | A · Main Event (recommended) | B · Territory Tape | C · Fight Card |
|---|---|---|---|
| reference | a modern PPV broadcast | a 1980s regional TV studio on VHS | a screen printed event poster |
| ground | near black violet `#0c0a11` | warm brown black `#140d0b` | newsprint `#efe4cc` |
| accents | hot red `#ea4a36`, gold `#f2c14e` | orange `#ff8a1f`, cyan `#4fd1e8` | ink `#16130f`, one spot red |
| display face | Jersey 10 (condensed pixel, sports lettering) | Press Start 2P (the hoops name face) | Jersey 10, very large |
| body | Barlow Semi Condensed | Pixelify Sans | Barlow Semi Condensed |
| texture | faint 2px scan | heavy scanlines, warm cast | halftone dots |
| strength | scales from a bingo hall to a stadium | the most nostalgic, most "wrestling" | the most distinctive, the best share cards |
| weakness | the most familiar of the three | Press Start is slow to read in volume | a light UI fights the dark arena art |

**Recommendation: A**, with B and C kept as **stage looks** rather than thrown away. The
bottom of the business can wear C (a xeroxed indie flyer), the territory years can wear B (a
TV studio on tape), and national TV and the stadium wear A. That gives a career a visible arc
of production values inside one system, which is exactly the "leveling up visually" the brief
asks for. The switch at the top of the style guide re-themes every component, so the choice
can be made by looking.

## 2. The wrestlers

### Family rules (shared with Run The Floor and Run The Tour)

| rule | value |
|---|---|
| cell | one art pixel; the head is 14 cells tall, identical to hoops |
| canvas | 56 by 72 cells (hoops is 44 by 64; the extra room is for giants, capes and arms over the head, never for bigger pixels) |
| centre | column 28; soles on row 68; ground shadow ellipse on rows 69 to 70 |
| light | upper left, `[-0.52, -0.6, 0.6]`, the hoops vector exactly |
| ramps | five steps (deep, shadow, base, light, highlight); shadows turn toward hue 238 and hold chroma, lights turn toward hue 52; near black lifted first; skin on its own soft ramp |
| shading | every part is a shape with a surface normal (tubes, row tables, ellipses); level thresholds 0.9, 0.66, 0.22, minus 0.16 |
| contact line | where a part in front meets a part behind, the part behind takes its own dark step |
| outline | one ring outside the silhouette, a mix of the bordering part's darkest step with `#0d1019`, 0.5 on the lit side and 0.76 on the shadow side; never flat black |
| breath | frame 1 drops everything above the knee one cell; one page timer at 720ms; reduced motion shows frame 0 only |
| scale | whole numbers only (2x on cards, 3x on the hub, 4x to 6x in scenes); `image-rendering: pixelated`; no rotation, no sub pixel positions, no CSS scaling of a sprite to a fractional size |
| pipeline | `paint(look, opts)` returns a grid, pure and node testable; `canvas`, `url` (cached), `img` (two frame) as in hoops; `opts.parts` returns part names for the guards |

The prototype copies these functions rather than importing hoops, so neither sister game is
touched.

### Builds

| build | head top row | shoulder half width | arm radius | notes |
|---|---|---|---|---|
| Cruiserweight | 15 | 8.6 | 1.95 | room for both arms overhead |
| Athletic | 12 | 10.3 | 2.4 | the default |
| Heavyweight | 11 | 11.5 | 2.85 | a little belly |
| Super Heavyweight | 12 | 11.9 | 3.05 | wider not taller, a real belly |
| Giant | 4 | 11.8 | 2.9 | more rows of torso and leg |

Two frames, A and B (B: narrower shoulders and waist, wider hip, softer jaw, lashes, a sports
top by default). The names are neutral on purpose: a player picks a body, the game never
assumes. Age greys hair from 36 and softens the build from 40. Expression (neutral, scowl,
grin) defaults from alignment and can be overridden.

### The layer stack, back to front

cape and hanging hair · legs · tights or pants · boots, foot, sole · kick pads · knee pads ·
neck and torso · trunks or singlet bottom · top (tank, sports top, tee, rash guard) · title
belt on the waist or over the shoulder · robe, jacket or vest · head and ears · arms (delt,
upper, fore) · sleeves · elbow pads · wrist tape, bands or gloves · fists · a belt held
overhead · hair · facial hair · mask · trim detail · face paint · face · hair texture.

Prototype options (all in `pxwrestler.js`): 5 builds, 2 frames, 10 skins, 11 hair colours,
12 hair styles, 6 facial hair, 5 bottoms, 5 tops, 5 boots, 3 knee, 3 elbow, 4 wrist, 3 masks,
5 paints, 5 entrance pieces, 4 tattoos, 3 belt positions, shades, 3 moods, and free gear,
trim and boot colours. **Phase A expands every slot to cover the full migration table
below**, so no existing look or owned cosmetic is lost.

### Frames

| animation | frames | rate | notes |
|---|---|---|---|
| idle | 2 | breath, 720ms | prototype has it |
| walk | 4 | 8 fps | entrance and ring walk |
| entrance pose | 2 | held, then 2 fps | per build; the flex and point prototypes are the base |
| taunt | 3 | 6 fps | per alignment: face plays to the crowd, heel jaws at it |
| strike | 3 | 12 fps | wind, contact (impact frame), recover |
| grapple | 2 | 8 fps | collar and elbow tie up |
| slam | 4 | 10 fps | lift, peak, impact frame, settle |
| top rope | 4 | 10 fps | climb, perch, flight, impact |
| selling | 2 | 6 fps | stagger, hold the body part that is hurt |
| pin | 2 | count beats | the cover, with the referee's hand on the 1, 2, 3 |
| kickout | 2 | 12 fps | shoulder up, the crowd pops |
| submission | 2 | 4 fps | hold, strain |
| celebrate | 2 | 4 fps | arms up, the belt if held (the prototype "raise") |
| defeated | 1 | held | flat on the canvas |

Seven of these are done by moving the existing rig's joints (as the prototype's five poses
are); the action frames are joint sets plus one hand set impact frame each. The guards will
assert every frame for every build has a head, hands and feet, no part touches the canvas
edge, and at least 24 colours.

### Likeness

No sample copies a real performer's gear, paint or mask. The cosmetics flagged in the audit
are handled in the migration table: renamed, redrawn generic, or both.

## 3. Pixel rules

1. One art pixel is the unit. UI borders, gaps and shadows are multiples of `--px` (2 CSS
   pixels at the default scale).
2. Integer scale only. A sprite is drawn at 1x into a canvas and blown up by a whole number.
3. `image-rendering: pixelated` on every sprite, icon and stage.
4. No rotation, no blur, no sub pixel transforms on art. UI motion moves in steps.
5. Outlines follow the sprite rule: a dark shade of what they border, never pure black.
6. Light from the upper left everywhere, including icons and stage lights.
7. Dithering only as a checker of two adjacent ramp steps, used for light pools, spotlight
   cones and crowd density, never as decoration.
8. No smooth gradients on art. The UI may use a flat two stop band (the wrestler card's
   promotion stripe) but no soft vignettes.
9. No emoji, no system glyphs as icons, no stock art, no vector illustration.

## 4. Tokens

All in CSS custom properties on `:root`, swapped whole by `data-dir` (and later by stage).

| group | tokens (direction A values) |
|---|---|
| unit | `--px: 2px` |
| space | `--s1 4` `--s2 8` `--s3 12` `--s4 16` `--s5 24` `--s6 32` `--s7 48` `--s8 64` (px) |
| ground | `--bg #0c0a11` `--bg2 #121019` `--panel #18151f` `--panel2 #211d2a` |
| steel | `--steel #3a3546` `--steel2 #5a546a` |
| ink | `--ink #f4ecdf` `--ink2 #c9bfae` `--ink3 #9a9080` `--onaccent #0e0b08` |
| accent | `--hot #ea4a36` `--hot2 #ff6a4a` `--gold #f2c14e` `--gold2 #ffe08a` |
| semantic | `--good #4fd18b` `--bad #ff6b5e` `--warn #f2c14e` |
| alignment | `--face #58b8ff` `--heel #ff5a4e` `--tweener #c79bff` |
| promotion | `--promo` and `--promo-ink`, set on signing |
| type | `--display` `--label` `--body` |
| elevation | `--shadow`: a hard 6px drop, no blur |
| texture | `--tex`: one restrained pattern per direction |

**Promotion theming.** Each company carries one brand colour. `--promo-ink` is never typed by
hand: it is `inkOn(promo)` (the hoops function), white or near black by measured contrast, so
every company clears 4.5:1 on its own colour. Promotion colour is used for chips, the lower
third key, the wrestler card stripe and the apron, never for body text.

**Contrast.** `--ink3` on `--panel` is 5.7:1, dark label text on `--hot` is 5.2:1; the smallest label is 8px Silkscreen at full
ink, never dimmed with opacity. Alignment colours clear 4.5:1 on `--bg`.

## 5. Typography

| role | face | sizes | use |
|---|---|---|---|
| display | Jersey 10 | 64, 44, 30, 22 (multiples of its 10 unit grid where it matters) | names, headlines, big numbers, title cards |
| label | Silkscreen | 8, 16 only | caps labels, chips, tabs, buttons |
| body | Barlow Semi Condensed 400, 600, 700 | 15, 17, 19 | events, promos, tables |

All self hosted in `wrestling/fonts/` (SIL OFL, 140KB total for every face in the guide;
direction A alone needs about 95KB). Numbers use `tabular-nums`. Anton, Cinzel and the
system monospace are retired.

## 6. Motion

| name | duration | steps | use |
|---|---|---|---|
| tick | 60ms | 1 | button press, toggle |
| wipe | 220ms | 6 | panels, screens, lower thirds |
| count | 640ms | 4 to 8 | stat count ups, meters filling a segment at a time |
| hit | 300ms | 3 | impact: a 4px shake and an impact frame |
| beat | 480ms | 3 | a meter pulse after a change |
| flash | 120ms | 1 | finishers and title changes only, at most 0.35 opacity, never more than twice a second |

Sprites animate at the fixed rates in section 2. UI motion is `steps()`, never ease curves,
so it reads as part of the pixel world. Under `prefers-reduced-motion` every animation stops,
flashes and shakes become a held frame, and the sprite breath freezes. A separate in game
**Scenes off** switch skips every cutscene.

## 7. Components

Rendered in all states (default, hover, pressed, focus, disabled) in the style guide:
buttons (primary, gold, ghost, danger), tabs, meters (segmented, with deltas), the wrestler
card, chips (alignment, title, promotion), stat table, decision card (with a kayfabe or real
tag on each option), promo dialogue with a portrait and live crowd meter, the "what changed
and why" receipt, tale of the tape, lower third, name plate, championship display with
lineage, dirt sheet item, social post, toast, badges, modal, empty state, loading state.

Rules: every pressable thing is a `button` with a visible 2px gold focus ring; minimum target
44 by 44; decision cards are a radio group to a screen reader; nothing conveys state by
colour alone (meters carry numbers, alignment chips carry words).

## 8. Environments and icons

Icons are 12 by 12 cell maps (`style/kit.js`), drawn at 2x to 4x, outlined in a dark shade of
the colour they sit on. Twelve so far: belt, mic, boot, fist, star, chair, ladder, heart,
flame, contract, crowd, bell. Phase A replaces all 34 `PICO` ids and every emoji.

Stages are 160 by 90 cell scenes, seeded per building so a venue never changes.

| stage | crowd | light | production |
|---|---|---|---|
| The school | none | one warm work light | brick, a hand painted banner |
| Bingo hall indie | 3 thin rows | two warm cans | a cloth banner |
| Territory TV studio | 4 rows | three cool cans | studio flats, a station banner |
| Overseas tour | 6 full rows | four beams | a hanging banner, white canvas |
| Developmental brand | 5 rows | four beams | a first video screen |
| National weekly TV | 9 rows | six beams | a wide screen |
| Stadium supershow | 14 rows | eight beams | the biggest screen, pyro |

## 9. Voice

Write like somebody who has sat in a locker room and still loves the business.

1. **Short sentences.** The player is on a phone between matches. (This repo's rule: no dashes,
   and a comma joining two sentences becomes a full stop.)
2. **Use the language, explain it once.** Heat, pop, babyface, go home, blow off, put over,
   cut a promo, dark match. The glossary terms stay clickable.
3. **Name people.** "Sal Fontaine counts out forty," never "the promoter pays you less."
4. **Two layers, always labelled.** A choice that fans will see is kayfabe; a choice the boys
   will hear about is real. The tags say which.
5. **Swagger is earned.** Hype is for title changes and main events. Week 3 at a bingo hall
   is funny, cold, and a little sad.
6. **Never mock the fans, never punch down.** No storylines on race, religion, sexuality or
   disability. The toll of the road is real and is written with respect.
7. **Real wrestlers only appear wrestling.** Every scandal and every piece of backstage drama
   belongs to an invented character.

## 10. Cosmetic migration table

Every saved value and every owned id maps to the new layer system. "Kept" means the same id
and a redrawn pixel version; "renamed" changes the display name only (the id stays, so
ownership survives); "redrawn generic" changes the design to remove a real performer
association.

| old slot · values | new layer · values |
|---|---|
| hair: short, bald, buzz, long, pony, mullet, spiky, afro, mohawk, topknot, dreads, slick | hair: same ids (in the prototype now) |
| hair: undercut, wild, bun, curls, fauxhawk, braids, halfshave, frosted, waist, widow, flames, hornhair, swoop | hair: same ids, Phase A adds each (swoop maps to slick) |
| face: none, beard, stache, goatee | facial: none, beard, stache, goatee |
| face: fullbeard, mutton, handlebar, soul | facial: longbeard, mutton, handlebar, soul (Phase A adds the last three) |
| face: warrior, skull, tribal, halfpaint, crossface, visorpaint, venom, eyeblack, scar, bloodied, mist | paint: bars (warrior, eyeblack), skull, split (halfpaint), star, plus Phase A adds tribal, cross, visor, venom, scar, crimson; **mist renamed "Mist Spray" and redrawn as a generic aura** |
| mask: none, lucha, half | mask: none, lucha, half |
| mask: hood, demon, skullmask, phantom, jaguar, wolf, insect, bull, crow, dragon, samurai | mask: Phase A adds each as a lucha base with a crest map; **tiger renamed "Striped Cat Mask" and redrawn generic; demon and crow redrawn so neither echoes a real performer's look** |
| attire: trunks, tights, singlet, shorts, tank, crop | bottom: trunks, tights, singlet, shorts; top: tank, crop |
| attire: jacket, duster, robe, vest | entrance: jacket, robe (duster maps to robe with a long cut), vest |
| attire: bodysuit, armor, sash, harness, hoodie, gi, chaps | Phase A adds bodysuit, armor, sash, harness, hoodie, gi, chaps (chaps over pants) |
| boots: tall, short, pads, wraps, barefoot, sneak, hightop | boots: tall, low (short), kick (pads), wraps (wraps and barefoot), sneaks (sneak and hightop) |
| boots: platform, goldboot, combat, cowboy, steel, spiked | Phase A adds each as a boot variant |
| extras: wrist, elbow, knee, gloves, shades, cape, belt | wrists tape, elbows pad, knees pads, wrists gloves, shades, entrance cape, belt waist |
| extras: chain, bandana, scarf, wings, armband, necklace, towel, tassels, visor, facemask, armorpad, spikes, feather, crown | Phase A adds an accessories layer for each (feather headdress **renamed "Plume Crest" and redrawn**) |
| pattern: all 17 | a pattern pass over gear cells in the trim colour, Phase A |
| tattoo: sleeve, chest | tattoo: sleeve, chest; Phase A adds full, tribalink, neck, barbwire, leg, back, kanji |
| aura: all 11 | an entrance effect layer drawn in the scene, not on the sprite, Phase A |
| build: lean, athletic, heavy | build: cruiser, athletic, heavy (a saved heavy with the Brawler or Powerhouse archetype may choose super at no cost) |
| belt carry: waist, shoulder, hand | belt: waist, shoulder, and hand becomes the raise pose in celebrations |

Packs (`p_base`, `p_elite`, `p_legend`), shards and Pass progress are unchanged. Prices and
entitlements are not touched.
