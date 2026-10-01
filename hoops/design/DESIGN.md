# Run The Floor: Career design system

Status: **DECIDED, 2026-10-01: Arena Arcade.** Directions A and C are kept in
`hoops/design/directions.html` as the record of what was considered. Arena
Arcade is the whole system, including the in-game broadcast package, which is
drawn in the same pixel language rather than borrowed from direction A.

---

## 1. The pick

**Arena Arcade.** A sports video game menu built around the sprite. A spotlit
pixel crowd above, pixel hardwood below, the player standing in the light.
Panels are stepped pixel frames. The pixel face carries the numbers that matter
and the eyebrows. Archivo carries everything you read. The team color is the
ring around the frame and the shadow behind the big numbers.

What was rejected, and why: A (Prime Time) left the sprite as the only pixel
thing on screen; C (Back of the Card) put cream stock against a dark arena and
made dense tables heavy. C's trading card idea survives as the share card.

Owner decisions recorded with the pick:

| question | answer |
|---|---|
| fonts | self-hosted in `hoops/fonts/` (done: 66KB, OFL texts beside them) |
| sound | yes, **only together with real animated cutscenes** (section 11) |
| new pixel art | drawn in code on the sprite's grid and cached, no image sheets |
| database migrations | all of them at the very end of the project |

---

## 2. Concept

The arena is dark and the light is earned. Everything sits on a near-black
navy floor under one warm spotlight, and the player stands in that light on
real hardwood. The UI is a video game menu: stepped pixel frames, a pixel face
for the numbers that matter, plain readable Archivo for everything you read.
When a game is on, the screen changes channel to a pixel broadcast: a score bug,
lower thirds and hard wipes, all on the same grid. Each stage of a career earns
a richer room: a high school gym with folded bleachers and a buzzing
scoreboard, a college arena with a student section, the NBA under full lights.
Color is restraint everywhere except the team color, which is the one loud
thing on every screen and changes the moment you are traded.

---

## 3. Tokens

All tokens live on `:root` in one Career stylesheet (`hoops/career-ui.js`
injects it today; it moves to `hoops/career.css` with a `?v=` and a
`check-cachebust` record). Nothing outside the tokens is allowed in a rule.

### Color

| token | value | use |
|---|---|---|
| `--c-floor` | `#0a0d18` | page ground |
| `--c-panel` | `#111629` | panels |
| `--c-panel-2` | `#18203a` | raised rows, options |
| `--c-frame` | `#2d3a66` | pixel frame ring |
| `--c-ink` | `#eef2f9` | text |
| `--c-ink-2` | `#b8c3e6` | secondary text (7.9:1 on panel) |
| `--c-ink-3` | `#8fa0d6` | labels, 8px and up only (5.1:1 on panel) |
| `--c-accent` | `#ff7a1a` | the one action on a screen |
| `--c-accent-ink` | `#160b02` | text on accent (9.6:1) |
| `--c-gold` | `#ffd166` | awards, records, the decision eyebrow |
| `--c-good` | `#3ecf8e` | up, healthy, made |
| `--c-bad` | `#ff6b6b` | down, hurt, missed |
| `--c-warn` | `#ffb347` | at risk |
| `--c-trust` | `#7fb2ff` | coach's trust |
| `--c-live` | `#e5322d` | the broadcast live dot only |
| `--team-1`, `--team-2` | set per career | see 3.1 |

Replaces: 11 surface darks, 6 golds, 4 literal semantic colors and the
two-greens problem listed in AUDIT.md section 6.

#### 3.1 Team color slot

`--team-1` and `--team-2` are written by one function off `C.colorsOf(L)` and
are never used raw for text. Two derived tokens are computed in script and
checked against `--c-panel` with the contrast function `baller.js` already
exports: `--team-ink` (the team color lifted or lowered until it clears 4.5:1
for text) and `--team-on` (white or near black, whichever reads on a solid
`--team-1` fill). This is the same answer `wheelColors()` gives the reels, so a
dark club (Spurs black, Nets black) and a light one (Pacers gold) both work.
A trade re-themes the whole mode in one write.

### Type

Three families, all already loaded by the game. Proposed change: self-host
them as woff2 subsets (Latin) instead of Google Fonts. Needs your approval
because it adds about 120KB of font files to the repo.

| token | family | role |
|---|---|---|
| `--f-display` | Anton | headlines, names |
| `--f-pixel` | Press Start 2P | numbers that matter, eyebrows, the HUD |
| `--f-text` | Archivo | everything you read |

Scale (eight steps, replaces the seventeen sizes in use):

| token | size / line | family |
|---|---|---|
| `--t-hero` | 44 / 0.92 | display |
| `--t-h1` | 32 / 1.0 | display |
| `--t-h2` | 24 / 1.05 | display |
| `--t-num` | 24 / 1 | pixel |
| `--t-body` | 15 / 1.5 | text |
| `--t-small` | 13 / 1.45 | text |
| `--t-label` | 11 / 1.3, 800, tracking .14em, caps | text |
| `--t-pix` | 8 / 1.6 | pixel, never under 8px, never a sentence |

### Space, radius, border, elevation

- Space: 4, 8, 12, 16, 24, 32, 48 (`--s-1` to `--s-7`).
- Radius: none. Panels use the stepped pixel corner (`--px-corner: 6px` clip
  path). Pills and chips use the same step at 3px. This retires all eleven radii.
- Borders: 3px inset `--c-frame` ring on panels; 2px on rows; 1px hairline
  `rgba(255,255,255,.08)` between table rows.
- Elevation: hard offset shadows only, never blur: `--e-1: 0 3px 0 #05070d`,
  `--e-2: 0 6px 0 #05070d`. A pressed control drops to `--e-0` and moves down
  3px. This is the arcade press.

### Texture

All texture is pixel art drawn at runtime on the sprite's grid (no image
files): crowd strip, hardwood planks with seams and grain, gym brick,
spotlight cones as stepped gradients, film grain for scenes. One texture module
(`hoops/pixart.js`) draws and caches them as data URLs exactly the way
`baller.js` caches the player.

---

## 4. Motion

| token | ms | easing | use |
|---|---|---|---|
| `--m-snap` | 120 | `steps(2)` | button press, pixel cursor |
| `--m-quick` | 180 | `cubic-bezier(.2,.8,.2,1)` | chips, tabs, toasts in |
| `--m-move` | 320 | `cubic-bezier(.16,1,.3,1)` | cards in, sheets up |
| `--m-wipe` | 420 | `cubic-bezier(.7,0,.2,1)` | broadcast wipes, scene changes |
| `--m-count` | 900 | `cubic-bezier(.2,.8,.2,1)` | stat count-ups |

Rules:
- Only `transform` and `opacity` animate. Bars fill with `scaleX`, never width.
- Things enter once. A re-render never replays an entrance (today every
  tab switch re-animates the card; that ends).
- Weight, not bounce: no overshoot easing anywhere. A wipe covers in
  `--m-wipe`, holds 80ms, reveals.
- Sprite animation is frame by frame (the existing two-frame breath, plus
  new frames for the playable moments) and never tweened.
- `prefers-reduced-motion`: every duration becomes 0, wipes become cuts,
  count-ups land on the final number, the breath stays on frame 0.

---

## 5. Components

Every component is drawn in the style guide (`hoops/design/style-guide.html`,
built after the pick) in default, hover, pressed, disabled and focus states.
Focus is one rule everywhere: a 2px `--c-gold` outline offset 2px, shown on
`:focus-visible` only.

Buttons (primary, secondary, quiet, icon), panel, player card, meter (with
tooltip), rating row with delta, stat table, tabs, modal and bottom sheet,
decision card (with option rows and the consequence preview), the receipt
("what changed and why"), headline item, social feed item, score bug, lower
third, tale of the tape, ticker, toast, badge, award chip, trophy shelf,
empty state, loading state, error state, ad slot.

---

## 6. Illustration and icons

Pixel art only, matching `baller.js`:
- the same scale as the player on that screen (if the player is at 3x, every
  crowd pixel is 3 CSS pixels);
- lit from the upper left, five-step ramps that cool in shadow and warm in
  highlight, outlines in a dark shade of the neighbouring color, never black;
- a shared palette: the token colors above plus the hardwood, brick and
  crowd ramps defined in `pixart.js`;
- icons on a 7x7 or 9x9 grid, two tones plus a highlight;
- animation is frame by frame.

No vector illustration, no emoji, no icon font.

---

## 7. Stage looks

One system, five rooms. Each stage changes the ground texture, the light and
one accent, and nothing else.

| stage | ground | light | accent | crowd |
|---|---|---|---|---|
| High school | gym brick, pull-out bleachers | fluorescent, flat, slightly green | school color | parents, sparse |
| College | painted floor, student section | warmer, two spots | school color | packed, waving |
| Overseas | older arena, ad boards | cool, smoky | club color | flags, drums |
| G League | small arena, curtained upper deck | flat | affiliate color | half full |
| NBA | hardwood, dark upper deck | one hot spotlight | team color | full, flashes |

---

## 8. Broadcast package

Used during games and ceremonies only, in the house pixel language: score bug
(top left, team chips in stepped frames, quarter and clock in the pixel face),
lower third (name plate on `--team-1` with a `--c-gold` pixel rule and the
speaker's sprite bust), tale of the tape (two busts, five rating rows with
pixel pips), ticker (around the league, scrolling on a 1px grid), wipe (a
stepped team-color bar crossing the screen in `--m-wipe`). The house frames step
aside while it is up.

---

## 9. Voice

- A sharp NBA writer: short, specific, a little funny, never cute.
- Present tense for what is happening, past tense in the receipt.
- Numbers as numbers (`32 points`, not `thirty-two`).
- Name people. Never "your coach" when the career knows his name.
- No dashes (repo rule); a colon or a full stop instead.
- Humor punches up or sideways (agents, owners, the media, yourself), never
  at real people. Real players and coaches appear only in basketball contexts.

---

## 10. Ads

Ad slots are designed as panels with a `Sponsored` label in `--t-label`, placed
between sections, never inside a decision card, never in the broadcast package,
never fixed over a control. Career pages carry no ad tag today (hoops is
noindexed); the slots are layout only until the game launches.

---

## 11. Cutscenes and sound

The owner's condition for sound: real animated cutscenes, not a player standing
and breathing. So a cutscene is a short **sequence of sprite frames moving
through a pixel set**, played by a timeline, and sound is cued off the same
timeline.

### Frames, and the rule that keeps the characters final

New moving poses are drawn by the **existing rig** in `baller.js` (the same
parts, ramps, lighting, outlines and look options), so a player in motion is the
same player. Nothing about the existing six poses may change: a guard hashes
`paint()` for 40 looks across every existing pose and fails on any byte that
moves. New poses (each two to six frames):

| set | frames | used in |
|---|---|---|
| walk | 4 | entrances, tunnel walk, draft stage walk, podium |
| dribble | 4 | intros, playable moments |
| jumpshot | 5 (gather, rise, release, follow, land) | last shot, buzzer beater, free throws |
| layup and dunk | 5 | poster, and-one, dunk contest |
| block | 4 | chase-down block, final stop |
| celebrate | 4 (fist, scream, point, flex) | wins, awards |
| dejected | 3 | losses, injuries |
| handshake and hug | 3 | draft night, trade, retirement |
| wave | 3 | ring night, farewell, jersey retirement |

### The cutscene player

`scenes.js` keeps its beats, plates, typewriter, skip and off switch. Each
beat can carry a **shot**: a list of tracks (actor sprite, frame set, path in
set coordinates, timing in steps of 1/12 second) plus props (ball with arc,
rim and net with a three-frame snap, confetti, camera flashes, scoreboard). The
camera is a whole-pixel pan and a 1x/2x cut, never a smooth zoom, so the grid
never smears. Reduced motion shows the key frame of each shot as a still.

### Sound

- Off by default; one mute toggle next to the scenes switch, remembered.
- Short cues only: crowd bed (three loudness levels), buzzer, net swish, rim
  clank, sneaker squeak, whistle, camera flash, draft podium chime, organ hit.
- Synthesized with WebAudio at runtime (noise and oscillators, about 3KB of
  code), so there are no audio files to load. If a cue sounds poor synthesized,
  it can be replaced by a small recorded file later.
- Sound plays only inside cutscenes and playable moments, never in menus.

---

## 12. Database migrations

Deferred to the end of the project by owner decision. Everything until then
saves to the existing account slot (`rtf.life.v1` through `cloud.js`), which
needs no migration. Leaderboards by challenge and by Vault completion are built
last, with their SQL file, a preflight row and hand deployment.
