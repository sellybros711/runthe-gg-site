# Run The Floor: Career design system

Status: **DRAFT, waiting on a direction pick.** Sections 1 and 2 are decided by
the pick. Sections 3 to 10 are written for the recommended direction (B with
A's broadcast package) and hold for either of the other two with the values
swapped. Nothing here is built yet. The rendered comparison is
`hoops/design/directions.html` (noindexed, linked from nowhere).

---

## 1. Three directions

All three are rendered on the same screen with the same content: the career
hub on a phone, mid-season, with a trade rumor on the table. The player is the
real `baller.js` sprite at a whole-number scale and is not altered.

### A. Prime Time

A national TV broadcast. Near-black ground, hard edges, no rounded corners
on anything bigger than a chip. The team color runs down the left edge of every
card like a network bar. Broadcast gold marks what matters (the decision, an
award, a record). Headlines are condensed and loud. Numbers are huge.

- Strengths: calm, scales to dense tables (season by season, box scores, the
  GOAT ladder), and the broadcast package (score bug, lower thirds, chyron)
  is native to it.
- Risk: the pixel sprite is the only pixel thing on the screen, so the art
  reads as a guest rather than the house style.

### B. Arena Arcade (recommended base)

A sports video game menu built around the sprite. A spotlit pixel crowd above,
pixel hardwood below, the player standing on the floor. Panels are stepped
pixel frames, labels and numbers in the pixel face, body copy in Archivo. The
team color is the ring around the frame and the shadow behind the numbers.

- Strengths: the closest match to the characters. Every new piece of art
  (crowds, trophies, icons, arenas) can be drawn on the same grid with the same
  lighting, which is what the brief asks for.
- Risk: pixel type is hard to read small. Rule: the pixel face is never
  under 8px and never carries a sentence.

### C. Back of the Card

A trading card and a magazine feature. Dark room, cream card stock, the player
printed inside a team-color window with a diagonal stripe, decisions as a
newspaper clipping with a slight rotation.

- Strengths: the most distinctive, the warmest, and the share cards nearly
  design themselves.
- Risk: cream surfaces fight a dark arena mood in the scenes, dense tables on
  paper stock get heavy, and a light surface against team colors needs more
  contrast work than the other two.

### Recommendation

**B as the house style, with A's broadcast package for anything that happens
during a game** (score bug, lower thirds, tale of the tape, the ticker). The
menus and the hub are a video game; the games themselves are on TV. That is
also exactly the brief's "premium national TV broadcast crossed with a modern
sports video game menu", and it puts the sprite at the center of the art
direction instead of beside it. C's trading card survives as one component:
the share card and the "back of the card" stat page.

---

## 2. Concept (for the recommended direction)

The arena is dark and the light is earned. Everything sits on a near-black
navy floor under a single warm spotlight, and the player stands in that light
on real hardwood. The UI is a video game menu: stepped pixel frames, a pixel
face for the numbers that matter, plain readable Archivo for everything you
read. When a game is on, the screen changes channel: the broadcast package takes
over with a score bug, lower thirds and hard wipes. Each stage of a career
earns a richer room: a high school gym with folded bleachers and a buzzing
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

Used during games and ceremonies only: score bug (top left, team chips,
quarter, clock), lower third (name plate in team color with a gold rule),
tale of the tape (two players, five rows), ticker (around the league), wipe
(a team-color bar crossing the screen). The house frames step aside while it
is up.

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
