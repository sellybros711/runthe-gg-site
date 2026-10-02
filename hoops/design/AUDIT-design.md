# Run The Floor Career mode: presentation-layer design inventory

Scope: `hoops/career-ui.js` (CU), `hoops/scenes.js` (SC), `hoops/baller.js` (BL, documented only),
the Career hero and shared chrome in `hoops/index.html` (IX). All citations are `file:line`.
Career CSS lives in two places: the injected sheet in CU:58-231 (`#cr-css`, inserted CU:232-238) and
the hero rules in IX:1735-1765 (static because it is first paint). Scenes inject their own sheet
SC:71-160 (`#sc-css`, inserted lazily on first `play()`, SC:157-160, SC:398).

Load order: `baller.js?v=2` IX:3416 (early), `scenes.js?v=3` IX:11942, `career-ui.js?v=7` IX:11943
(after `window.RTF_PAGE` is published at IX:11873). `#s-car` is an empty `<div class="screen">` at IX:3165.

---

## 1. Fonts

Loaded from Google Fonts, non-blocking (`media="print"` swap) IX:72-75: Anton, Archivo 400/600/700/800/900,
Press Start 2P. Tokens IX:78-115:

| token | stack | role |
|---|---|---|
| `--display` IX:82 | Anton, Impact, Arial Narrow | headings, big numbers (single weight 400) |
| `--body` IX:83 | Archivo, system-ui... | everything else (body IX:120) |
| `--pixel` IX:88 | Press Start 2P -> --display | brand wordmark only (IX:141, IX:2415). **Not used anywhere in Career.** |
| `--num` IX:114 | = `var(--body)` | inline figures + `tabular-nums` |

### Career usage (display face, Anton)
- `h2` global 20px, ls .02em, uppercase IX:155-157 (Career screen titles "New career", "Career", "Career over", "Ratings", "Season by season": CU:371, CU:601, CU:942, CU:526, CU:963)
- `.career-hero h2` 30px (38px >=920px) lh 1.02 IX:1744, IX:1761
- `.ch-cur .o b` 30px IX:1755
- `.cr-who b` 24px lh 1.05 ls .01em CU:102
- `.cr-ovr b` 40px lh .95 CU:105
- `.cr-card h3` 22px lh 1.1 CU:145
- `.cr-draft .tick` 15px ls .06em CU:159; `.pk` 64px CU:160; `.tm` 26px CU:161
- `.cr-final .v` 40px CU:189
- `.cr-tot b` 22px CU:194
- `.cr-sheet h3` 20px CU:200
- Jersey SVG fallback: inline `font-family="Anton, Impact, sans-serif"` size 24 CU:270 (hardcoded, not the token)
- Scenes (all `var(--display,Impact)`): `.sc-who b` 19px SC:92; `.sc-q h3` 21px SC:99; `.rm-arena .board` clamp(18px,4.4vw,34px) SC:116; `.rm-draft .screen` clamp(18px,4.6vw,38px) SC:129; `.rm-studio .logo` clamp(14px,3.4vw,22px) SC:137; `.rm-hall .plaque` clamp(14px,3.6vw,22px) SC:150

### Career usage (body face, Archivo) by size
- 9px: `.ch-cur .o span` IX:1756
- 9.5px: `.cr-ovr span` CU:106, `.cr-fact .k` CU:119, `.cr-tbl th` CU:179, `.cr-tot span` CU:195, `.cr-lrow .k` CU:222
- 10px: `.ch-path li` IX:1747, `.cr-m .t` CU:110, `.cr-epi .k` CU:90, `.cr-persona` CU:216, `.sc-ch .tone` SC:106
- 10.5px: `.ch-eye` IX:1742, `.cr-build .lab` CU:64, `.cr-result .y` CU:137, `.cr-card .eye` CU:144, `.sc-out` SC:84, `.sc-q .eye` SC:100
- 11px: `.cr-sub` CU:81, `.cr-fact small` CU:121, `.cr-final .eye` CU:188, `.sc-who span` SC:93, `.sc-tap` SC:97, `.sc-feed li small` SC:110
- 11.5px: `.cr-diffs span` CU:140, `.sc-when` SC:87
- 12px: `.cr-opt small` CU:76, `.cr-rt .r` CU:165, `.cr-tbl` CU:177, `.cr-aw span` CU:184, `.cr-actrow small` CU:205, `.cr-topbtns button` CU:218, `.cr-sw button` CU:224, `.cr-gear summary` CU:228, `.cr-m .t b` CU:111, `.sc-skip` SC:88, `.sc-feed li b` SC:109
- 12.5px: `.cr-top .cr-home` CU:62, `.cr-who span` CU:103, `.cr-place button` CU:85, `.cr-choice small` CU:149, `.cr-acts button` CU:156, `.cr-tabs button` CU:170, `.cr-actrow button` CU:206, `.ch-cur span` IX:1753, `.ch-best` IX:1757, inline `p.dim` 12.5px CU:385, `.sc-ch button small` SC:105
- 13px: `.cr-chips button` CU:71, `.cr-lifeline` CU:91, `.cr-rivalwho` CU:92, `.cr-log li` CU:173, `.cr-rt .r b` CU:166, `.cr-sheet .cash` CU:201
- 13.5px: `.cr-town` CU:80, `.cr-place` CU:83
- 14px: global `button` IX:204, `.cr-opt b` CU:75, `.cr-beats li` CU:125, `.cr-epi p` CU:87, `.cr-fact b` CU:120, `.cr-actrow b` CU:204, `.sc-feed li` SC:108
- 14.5px: `.ch-say` IX:1745, `.card p.dim` IX:199, `.cr-result p` CU:138, `.cr-card p.q` CU:146, `.sc-q p` SC:101
- 15px: `.cr-choice` CU:148, `.sc-ch button` SC:103
- 16px: `button.big` IX:212, `.cr-name input` CU:66, `.cr-final .nm` CU:190, `.ch-cur b` IX:1752
- 16.5px: `.sc-tx` SC:94 (typewriter body)

=> **~17 distinct body sizes** (9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 14.5, 15, 16, 16.5) plus 10 display sizes. Weights used: 400 (Anton), 500, 600, 700, 800, 900 (900 only in `.cr-persona` CU:216, `.sc-out` SC:84, `.sc-q .eye` SC:100, `.sc-ch .tone` SC:106).

### Eyebrow/label tracking drift
Same "small caps label" role uses letter-spacing .08em (IX:1747), .1em (CU:110, CU:179), .12em (CU:137, CU:195, SC:93), .13em (CU:119), .14em (CU:64, CU:81, CU:90, CU:216, CU:222, SC:84, SC:97, SC:106), .16em (IX:1742, CU:106, CU:144, SC:100), .18em (CU:188). Weights 800 vs 900 for the same role.

---

## 2. Colors

### Global tokens (IX:79-81)
`--bg #0d1117`, `--card #161b26`, `--cardb #242c3d`, `--ink #eef2f9`, `--mut #94a3b8`, `--dim #6b7a90`,
`--orange #f0782d`, `--orange-dk #c25916`, `--gold #f2c14e`, `--green #22c55e`, `--red #ef4444`, `--line rgba(255,255,255,.09)`.

### Career's own semantic colors, all inline literals (no tokens)
| role | values | where |
|---|---|---|
| good/health/up | `#3ddc97` + `rgba(61,220,151,.08/.1)` | CU:94, CU:114, CU:128, CU:134, CU:141, CU:168; SC:47 (pod outlet) |
| bad/down | `#ff6b6b`, `#ff8a8a`, `rgba(255,107,107,.08/.1)` | CU:129, CU:135, CU:142 |
| gold/fame | `#f2c14e` (= `--gold`, re-typed), `#ffe3a0` (light gold text), `rgba(242,193,78,.1/.12/.22/.25)` | CU:115, CU:130-131, CU:136, CU:151-152, CU:175, CU:182, CU:184, CU:186-188; IX:1743, IX:1751, IX:1758 |
| trust (coach) | `#6aa9ff` | CU:116; SC:45 (wire outlet) |
| orange washes | `rgba(240,120,45,.08/.1/.12/.14/.2/.28/.4)` | CU:77, CU:133, CU:150, CU:158, CU:171, CU:225; IX:1741, IX:1749 |
| ghost fills | `rgba(255,255,255,.03/.035/.04/.045/.05/.06/.07)` | CU:66, CU:71, CU:74, CU:109, CU:112, CU:118, CU:125, CU:140, CU:148, CU:170, CU:193, CU:224 |
| shades | `rgba(0,0,0,.18/.35)` | CU:78, CU:98, CU:216 |
| translucent white text | `rgba(255,255,255,.78/.7)` | CU:103, CU:106, IX:1753 |
| sheet scrim | `rgba(4,6,10,.62)` | CU:197 (vs `.sheet` `rgba(5,8,14,.72)` IX:1578) |

### Surface darks (near-duplicates, all literals)
`#0b0f17` (IX:1743), `#0b0f18` (SC:90, SC:106, SC:135), `#0e131c` (CU:97, CU:158, CU:227, IX:1749), `#10131b` (CU:187), `#10151f` (IX:153, IX:1741), `#111722` (CU:143), `#121826` (CU:199, SC:90), `#1a2130` (CU:143), `#1b2232` (IX:1741), `#1d2433` (CU:97, IX:1751 fallback), `#06080d` (SC:72 overlay bg), `#05070b`/`#05070f` (SC:116, SC:129). Eleven-plus distinct "dark navy" values; `#0b0f17` vs `#0b0f18` and `#10131b`/`#10151f`/`#111722` are effectively duplicates. `--card` itself is never used by `.cr-card` (CU:143 uses `#1a2130,#111722`).

### Golds (near-duplicates)
`#f2c14e` (--gold), `#e8b33c` (SC:149-150, SC:197, BL:46), `#ffd36b` (SC:116, SC:150), `#ffe3a0` (CU), `#e3a92f` (BL:295), `#ffae3d` (brand wordmark IX:144).

### Neutral fallbacks
`#2b3242` / `#c9ccd6` default club colors, repeated 5x: CU:243-244, CU:590, SC:449; BL:275. `#f1f3f8` overlay ink (SC:72) vs `--ink #eef2f9`.

### Scenes: outlet palette (SC:43-51)
night `#f0782d`, wire `#6aa9ff`, studio `#c06bff`, pod `#3ddc97`, prep `#f2c14e`, timeline `#9aa4b2`, team `#c9ccd6`. Live dot `#ff4b4b` (SC:85). Room literals: arena `#090c14,#141a28,#000`, floor `#c68b4d/#bd8244` (SC:112-117); press `#e7eaf0,#cfd4de,#1b2130,#10141d,#f4f4f1,#2a2e38,#3a3f4b,#555b68` (SC:121-125); draft `#030512,#0b1636,#05070f,#1a2445,#0a0f20,#2a3555,#151c33` + `rgba(80,120,255,.25)`, `rgba(160,190,255,...)` (SC:128-132); studio `#120a1f,#05060c,#232a3d,#0d111a` (SC:133-138); gym `#8d3b2c,#7f3426,#5a6070,#3a3f4b,#d9a463,#cf995a` (SC:139-143); locker `#1a1f2b,#0f131b,#0c0f16,#6b4a2b` (SC:144-147); hall `#2a2212,#3a2f18,#1d170c,#5a4a26,#e8b33c,#ffd36b` (SC:148-150).

### Runtime club colors
`--c1` set inline on `.cr-id` (CU:429), `.cr-draft` (CU:491, unused by its CSS), `.ch-cur` (CU:1029), rooms (SC:165); `--c2` rooms; `--oc` set on overlay per speaker (SC:460). Draft pick number colored with raw `k.secondary` inline (CU:493).

---

## 3. Spacing / radius / border / shadow

- Radii: 3 (SC:123, SC:147), 4 (CU:112-113, IX:1743, SC:132), 6 (SC:129, SC:135, SC:150), 7 (SC:125), 8 (CU:224, SC:116), 9 (button IX:205, CU:66, CU:125), 10 (CU:109, CU:118, CU:133, CU:193), 11 (CU:74, CU:148, SC:103, SC:108), 12 (`.card` IX:154, CU:78, CU:83, IX:1751), 14 (CU:96, CU:143, CU:158, SC:138), 16 (CU:186, CU:199, SC:155), 50% (CU:127, CU:226), 999 (CU:140, CU:184, CU:216, SC:84, SC:88, SC:106). **11 distinct radii**.
- Card padding: 16 (`.card`, `.cr-id`, `.cr-card`), 12 (`.cr-preview`, `.ch-cur`), 24/16 (`.cr-final`), 20/14 (`.cr-draft`), 18/16/16 (`.career-hero`), 8x9/8x10 (meter/fact tiles), 10x12 (`.cr-place`, `.cr-result`), 11x12 (`.cr-opt`), 12x14 (`.cr-choice`), 11x13 (`.sc-ch button`).
- Gaps: 5, 6, 7, 8, 10, 12, 14, 16 px.
- Section margin-bottom 12px everywhere in CU (vs `.card` 14px IX:154).
- Borders: 1px `var(--cardb)` (controls, cards), 1px `var(--line)` (tiles, table rows, log rows), 1px `#f2c14e` (`.cr-final` CU:186), 3px left accent (`.cr-result` CU:133), 2px top (`.sc-cap` SC:90), inset ring `0 0 0 1px var(--orange)` (`.cr-opt.on` CU:77), double ring `0 0 0 2px #0e131c,0 0 0 4px var(--orange)` (`.cr-sw .dot.on` CU:227).
- Shadows: drop-shadow on sprites `0 3px 6px rgba(0,0,0,.4)` (CU:211), `0 6px 10px rgba(0,0,0,.45)` (SC:78); `.board` glow `0 0 30px rgba(0,0,0,.6),0 0 22px var(--c1)` SC:116; Career cards themselves carry no elevation shadow (contrast with `.frg-panel` IX:1733).
- Gradients as surfaces: `.cr-id` 135deg club->`#0e131c` + bottom scrim (CU:97-98); `.cr-card` 180deg (CU:143); `.cr-card.clutch` radial gold (CU:151); `.cr-draft` radial orange (CU:158); `.cr-final` radial gold (CU:187); hero radial orange (IX:1741).

---

## 4. Component styles (selector -> file:line)

**Buttons**
- Base `button` orange gradient, 9px radius, 11x20 pad, 800/14px; hover brightness 1.08; disabled .38 IX:204-209. `button.ghost` IX:210-211. `button.big` full width, 15px pad, 16px uppercase IX:212. `.btnrow` IX:213-214.
- Career-specific ghost-ish variants (each re-declares bg/border/color): `.cr-top .cr-home` CU:62, `.cr-topbtns button` CU:218, `.cr-chips button` (+`.on` orange fill) CU:71-72, `.cr-opt` (+`.on` orange wash + inset ring) CU:74-77, `.cr-choice` (+hover) CU:148-150, `.cr-tabs button` (+`.on`) CU:170-171, `.cr-sw button` (+`.on`, `.dot`, `.dot.on`) CU:224-227, `.cr-acts button` CU:156, `.cr-place button` CU:85, `.cr-actrow button` CU:206, `.cr-name button` CU:69. Primary CTAs: `#cr-go` big (CU:386), `#cr-next` big (CU:505), `#b-career` big (IX:2566).
- Scenes: `.sc-skip` pill CU-free SC:88; `.sc-ch button` (+`.tone` pill, hover) SC:103-106.
**Inputs**: `.cr-name input` (+`:focus` orange outline) CU:66-68, `.cr-num` 72px CU:68.
**Cards**: `.card` IX:153; `.cr-id` identity CU:96-106; `.cr-card` decision (+`.clutch`, `.fa`) CU:143-153; `.cr-result` (+tones) CU:133-138; `.cr-draft` CU:158-161; `.cr-final` HOF CU:186-191; `.cr-epi` CU:87-90; `.cr-preview` CU:78; `.cr-place` CU:83-86; `.career-hero` IX:1740-1745; `.ch-cur` IX:1751-1756; `.cr-sheet .in` CU:197-206.
**Chips/pills**: `.cr-diffs span` (+up/down) CU:139-142; `.cr-aw span` award chips CU:183-184; `.cr-persona` CU:216; `.ch-eye i` "New" IX:1743; `.sc-out` live pill SC:84-85; `.sc-ch .tone` SC:106.
**Meters**: `.cr-meters` grid 2/4 cols CU:107-108; `.cr-m` tile CU:109-111; `.cr-bar` / `.cr-bar i` CU:112-116 (orange default, health green, fame gold, trust blue; morale default orange); ratings rows `.cr-rt .r` (86px label / bar / 26px value, `.hi` green) CU:163-168; `.ch-path` stepper IX:1746-1750.
**Stat tiles**: `.cr-facts`/`.cr-fact` 3-col CU:117-121; `.cr-tot` 4-col CU:192-195.
**Lists/log**: `.cr-beats` timeline bullets CU:124-131; `.cr-log` story log max-height 420 scroll CU:172-176; `.cr-actrow` CU:202-206; `.sc-feed` social posts SC:107-110.
**Tables**: `.cr-tbl` + `.cr-tblw` scroll wrapper CU:177-182; `.cr-vs` rival table CU:93-94.
**Tabs**: `.cr-tabs` CU:169-171.
**Look chooser**: `.cr-look` grid CU:219-220, `.cr-lrow` CU:221-222, `.cr-sw` CU:223-227, `.cr-gear` details CU:228, sticky preview CU:229.
**Sprite holders**: `img.rtf-baller` pixelated CU:210; `.cr-id` 96px CU:211; `.cr-preview` 128px CU:212; `.cr-final` 160px CU:213; `.cr-rivalpic` 64px CU:214-215; `.cr-look` 160px CU:220; `.ch-cur` 80px CU:230; `.sc-cast img` min(46vh,320px) SC:78. Fallback jersey SVG `.cr-jersey` CU:100, CU:264-272, IX:1752.

---

## 5. Motion

| name | props | duration/easing | used by | file:line |
|---|---|---|---|---|
| `crin` | opacity + translateY(6px) | .35s ease-out both (.3s on result) | `.cr-beats li` (stagger 90ms inline CU:481), `.cr-result`, `.cr-card` | CU:126, CU:132, CU:133, CU:143 |
| `.cr-bar i` width | width | .5s ease | meters/ratings | CU:113 |
| `screenin` | opacity + translateY(9px) | .28s ease-out | every `.screen.active` incl. `#s-car` | IX:1819-1820 |
| `scIn` | opacity + translateY(16px) | .45s ease-out (feed .35s) | `.sc-cast img.in`, `.sc-feed li` | SC:80-81, SC:108 |
| `.sc-room` opacity | opacity | .35s ease | `.sc-room.out` | SC:75-76 |
| `.sc-cast img` | opacity, transform | .3s | `.dim` | SC:78-79 |
| `scLive` | opacity .35 at 50% | 1.4s ease-in-out infinite; caret .8s steps(1) | live dot, typing caret | SC:85-86, SC:96 |
| `scCrowd` | translateY(-2px) + opacity | .5s steps(2) infinite | `.crowd.loud` | SC:114-115 |
| `scFlash` | opacity spike at 88% | 2.6s infinite, delays 0.43s*n | press flashes x6 | SC:126-127, SC:174 |
| `scFall` | translateY(120vh) rotate(540deg) | 2.2-4.3s linear infinite, negative delays | 46 confetti `<i>` | SC:152-153, SC:195-202 |
| `ht-chev` etc | | | not Career | |
| breath | img `src` swap | setInterval 720ms forever | all `img.rtf-baller[data-b0]` | BL:696-705 |
| typewriter | innerHTML every 18ms, 2 chars | setInterval | `.sc-tx` | SC:487-497 |
| draft count-up | textContent | setInterval 28-90ms (1400ms/pick) | `#cr-tick` | CU:753-773 |
| scroll | smooth scrollTo | | `scrollStage` | CU:737-750 |

Reduced motion: CU:207 (kills crin + bar transition), SC:154 (hides confetti/flash, kills scIn/crowd), BL:699 (no breath timer), CU:29/SC:36 (`REDUCED` read once at load: skips typewriter SC:477, confetti SC:196, flashes SC:174, draft count-up CU:755, stagger delay CU:481, smooth scroll CU:748), plus global nuke IX:1826-1829.

---

## 6. Screens / views / states and renderers

| view/state | renderer | notes |
|---|---|---|
| Front-page hero, no career | static IX:2560-2568 + `renderHero()` CU:1017-1047 | eyebrow + "New" chip, h2, `.ch-say`, `.ch-path` stepper, `#b-career` "Start your career", `.ch-best` once careers exist (CU:1040-1044). Dock carries `#b-career` on phones (IX:3710). |
| Front-page hero, career running | `renderHero()` CU:1021-1033 | `.ch-cur` (sprite scale 2, name, where, age/season, OVR); button "Continue your career". |
| Builder (creation) | `buildView()` CU:355-388, `wireBuild()` CU:389-412 | name/number/dice, position chips, look chooser (`lookRows` CU:304-329), archetype opts, start (HS vs Draft), road/background opts or HS town line, preview (OVR + ratings bars), scout grade, CTA. Every press calls full `render()`. |
| Life hub | `lifeView()` CU:599-607, `wireLife()` CU:609-636 | top bar (Look / Scenes on|off / Home), `idCard` CU:421-437, `meters` CU:438-443, `stageHtml` CU:497-515, `facts` CU:444-467, `ratingsHtml` CU:521-527, `tabsHtml` CU:528-537, Retire now. |
| Stage: decision card | `cardHtml()` CU:469-477 | variants `.clutch` (Game 7 / amclutch), `.fa`. |
| Stage: result | `resultHtml()` CU:484-487 + `diffsHtml` CU:283-289 | tone good/bad/gold. |
| Stage: beats | `beatsHtml()` CU:478-483 | |
| Stage: draft night | `draftHtml()` CU:488-495 + `animateDraft()` CU:753-773 | |
| Stage: idle | `#cr-next` (label from `C.nextLabel`) + `.cr-acts` (coach, trade, Off the court) CU:503-513 |
| Tab: Story log | CU:530-532 | newest 160 entries. |
| Tab: Seasons | `seasonsTable()` CU:538-548, `amTable()` CU:550-560 | NBA table + "Before the league". |
| Tab: Trophy case | `trophies()` CU:568-581, `awardCounts` CU:561-567, `rivalHtml` CU:583-597 | totals tiles, award chips, rival vs table, life line. |
| Off the court sheet | `openOff()` CU:777-792 | `#cr-sheet`, action rows. |
| Look sheet | `openLook()` CU:708-725 | same sheet, Save/Cancel. |
| Retire confirm | native `confirm()` CU:627 | |
| Hall of Fame card | `finalView()` CU:936-964, `wireFinal()` CU:974-979 | `.cr-final` (sprite trophy/suit pose), verdict, totals, awards, `.cr-epi` epilogue, `.cr-place` board line `paintPlace()` CU:883-906, Share / New career, season table. |
| End ceremony | `ceremony()` CU:844-857 | plays `SCENES.hall` (score>=55) or one studio beat. |
| Scene overlay | `play()` SC:396-570 | rooms below. |
| Career board (leaderboard tab) | IX:8984, IX:9102-9374 (`boardCareerBits`) | shared board screen, not CU. |
| Top-bar chip | `P.bar(lastName · OVR)` CU:1001, IX:11910 | |

Scenes by id (SC:234-315): `draft` (draft room, 3 beats), `undrafted` (locker, studio), `debut` (arena), `title` (arena, confetti, loud), `ring2`, `finals_loss`, `g7_make`, `g7_miss` (arena then locker), `mvp` (studio), `allstar`, `ncaa` (arena), `state` (gym), `trade`, `milestone`, `retire` (press, studio), `hall` (hall), `rival_mvp`. Card intros (SC:317-329): `presser` (press), `clutch` (arena), `amclutch` (gym/arena), `offers`, `commit`, `signing` (gym), `declare` (studio), `after` (press). Rooms (SC:164-193): arena, press, draft, studio, gym, locker, hall, default=bare studio.

---

## 7. Scene system architecture

- **Trigger**: CU `doStep()`/`doChoose()` (CU:638-660) run the engine, save, `render()` the hub first, then call `scene(res)` CU:669-705; if no scene, `scrollStage()`.
- **Selection**: `chain(L, res, seen)` SC:603-610 = `pickScene()` SC:353-385 (priority: Game 7 result -> champ -> draft -> MVP -> finals loss -> first All-Star -> trade -> retire -> milestone -> rival MVP -> debut; debut mutates `L.flags.debutSeen` SC:383) plus the pending card if its id is in `PRESENTABLE` (= keys of `CARD_INTROS`, SC:330) and not yet in `seenCard` (CU:668, memory only).
- **Build**: `build(L, pick, card)` SC:581-599: `ctxOf()` SC:207-222 (name, colors, team, school, level, coach/commish via career.js), `when` string, concatenates `pre` scene + scene + card intro + a `{choice:true}` beat, resolves every `tx`/`board` function against this ctx (`T()` SC:223), seeds `vseed` (hash) for `vary()` SC:225.
- **Player**: `play(beats, ctx, opts)` SC:396-570 creates one persistent `.scov` overlay (SC:400-407), locks page scroll via `documentElement.style.overflow` (SC:409). Per beat `paint()` SC:465-499 -> `setRoom` (rebuild room innerHTML only when room/board/loud/outlet key changes; confetti re-rendered every beat) SC:424-435, `setCast` (sprites at scale 6, re-rendered on pic/pose change) SC:436-456, `plate` (speaker name/role/outlet, sets `--oc`) SC:457-464, then typewriter or instant text. Choice beats: `paintChoice` SC:500-525 reads the engine's card via `opts.card()`, buttons call `opts.choose(n)` (CU re-renders the hub underneath, CU:682-690), then splices `aftermath()` SC:526-541 (presser: your quote, analyst reaction, fan feed `feedFor` SC:339-348, persona change) and `opts.follow(res)` (chained next scene) into the list.
- **Advance/skip**: tap anywhere on stage/caption = `advance()` (first completes typing, then next) SC:542-555, SC:563-564. Skip `skip()` SC:557-562 jumps to the next choice beat or exits; hidden while choosing. Keys SC:571-576: Esc = skip, Space/Enter = advance (ignored when focus is inside `.sc-ch`).
- **Off switch**: `rtf.scenes.v1` in localStorage (SC:35-39), toggled from hub button CU:603, CU:615. Off -> `scene()` returns false and the plain card remains.
- **Exit**: `finish()` SC:415-423 hides overlay, clears DOM layers, calls `opts.done` (CU re-renders + scrolls, or `finish()` career if retired CU:696-701).
- **Reduced motion**: see §5; typewriter skipped, confetti/flash not emitted, CSS animations stripped.
- **Safety**: every SC call from CU is wrapped in try/catch and falls back to the plain card (CU:673, CU:676-703, CU:847-856).

---

## 8. Problems found (from code)

### Visual consistency
1. Two separate stylesheets with no shared Career tokens; semantic colors (`#3ddc97`, `#ff6b6b`/`#ff8a8a`, `#ffe3a0`, `#6aa9ff`) are literals and differ from global `--green #22c55e` / `--red #ef4444` (CU:94/114/128 vs IX:81). `#f2c14e` is re-typed instead of `var(--gold)` ~12 times.
2. ~11 distinct near-black surface hexes (§2) and 6 golds; `.cr-card` doesn't use `--card`.
3. ~12 hand-rolled "ghost" button variants with slightly different fills (.035/.04/.045/.05), paddings and radii (8/9/11) (§4) instead of `button.ghost`.
4. 17 body font sizes and 7 letter-spacing values for the same eyebrow role (§1); weight 800 vs 900 for the same role.
5. Two sheet implementations: `.cr-sheet` (CU:197-206, scrim .62, no blur, no animation, max-height 82vh, bottom-only on desktop) vs global `.sheet` (IX:1578-1588, blur, `sheetup`, centered >=640px).
6. Number faces mixed: OVR in Anton (CU:105), facts in Archivo 800 (CU:120), totals in Anton (CU:194), ratings in Archivo (CU:166).
7. Hub top bar crowds: `h2` + up to 3 small buttons (Look, "Scenes on/off", Home) at 12-12.5px (CU:601-604) using two differently-styled classes (`.cr-topbtns button` vs `.cr-home`).
8. Inline styles in markup: CU:372, CU:385, CU:573, CU:578, CU:606, CU:787, CU:939, CU:962 (spacing/size literals bypass CSS).
9. `.cr-draft` sets `--c1` (CU:491) but its CSS never reads it; the room is always orange.
10. Dead CSS: `.sc-room.out` (SC:76) never applied, so rooms hard-cut (no crossfade); `.sc-cast img.dim` (SC:79) only fires for `pic:'both'`, which no scene uses; `.cr-bar i` width transition (CU:113) never plays because every render replaces the element; `.cr-coach` class (CU:433) has no rule.
11. `.cr-look > div:first-child{position:sticky;top:64px}` (CU:229) assumes a 64px header (appbar is 50px, IX:2391) and also applies inside the scrolling `.cr-sheet .in`, where 64px is wrong.
12. Confetti is re-generated on every beat (SC:434), so the two-beat `title` scene restarts the shower mid-scene.
13. Hub is one long single column: id card, meters, stage, facts, ratings, tabs all stacked; on desktop (`.wrap` 660px IX:131) no layout change except meters 4-col >=560px (CU:108).

### Contrast (WCAG, computed with baller.js `contrast()`)
14. White on base orange button gradient top `#f0782d`: **2.83:1** (bottom `#c25916` 4.44). Affects `#cr-go`, `#cr-next`, `#b-career`, `.cr-chips .on`.
15. `--dim #6b7a90` on `.cr-card` `#1a2130`: **3.69:1**, on `--card`: 3.95, used for 9.5-11px labels (`.cr-fact .k`, `.cr-tbl th`, `.cr-m .t`, `.cr-log .yr`), tiny text below 4.5.
16. `.sc-tap` `rgba(255,255,255,.4)` on `#121826`: ~3.3-3.9:1 at 11px.
17. Club-colour risks (raw primary, not the floored wheel colours): `.cr-id`/`.ch-cur` text `rgba(255,255,255,.78)` on a light `--c1` (CU:97, CU:103, IX:1751); draft pick `#N` in raw `k.secondary` on `#0e131c` (CU:493) is unreadable for dark secondaries; scene speaker name uses `--oc = ctx.c2` when you speak (SC:460, SC:92) on `#121826`.
18. Press room is a light background (SC:121) while HUD text is white, covered only by a top gradient (SC:83).

### Accessibility
19. No `:focus-visible` styling anywhere in IX or CU except the name input (CU:67); custom buttons rely on UA rings over dark gradients.
20. Every interaction calls `render()` which replaces `#cr-body` innerHTML (CU:995-997), so keyboard focus is dropped to `<body>` after every choice, chip, tab or look change.
21. Scene overlay: no `role="dialog"`/`aria-modal`, no focus move into it, no focus trap; background controls stay tabbable (SC:400-407). Typed text has no `aria-live`; screen readers hear nothing. `user-select:none` on the whole overlay (SC:72). "Tap to continue" shown to keyboard/desktop users (SC:405).
22. `.cr-sheet`: no dialog role, no Esc to close, no focus management (CU:708-725, CU:777-792). Retire uses native `confirm()` (CU:627).
23. Toggle groups (`.cr-chips`, `.cr-opt`, `.cr-sw`, `.cr-tabs`) convey selection by class only; no `aria-pressed`/`aria-selected`/`role=tab` (CU:358-365, CU:309-316, CU:535). Only Scenes toggle has `aria-pressed` (CU:603).
24. `.cr-meters` bars have no accessible value beyond the adjacent number; `.ch-path` is `aria-hidden` (fine).
25. Sprites `alt=""` everywhere (BL:694), including the hero/final card where the picture is the subject.
26. Tap targets: `.cr-sw button` 6x9 pad ~26px, `.cr-sw .dot` 26px (CU:224-226), `.cr-topbtns` ~30px: under 44px.
27. `REDUCED` is read once at load in both CU:29 and SC:36 (not reactive to OS change).

### Performance
28. Full screen rebuild per press (CU:983-1002): builder re-runs `C.newLife()` preview and re-renders look chooser on every chip tap (CU:355-357, CU:318); life view rebuilds tables (up to 160 log rows) on every step and tab switch.
29. Entrance animations replay on every render, e.g. switching a tab re-animates the decision card and beats (CU:126, CU:143).
30. Baller breath: one global `setInterval(720ms)` runs forever from load (BL:696-705, BL:714) and swaps `src` of every `img.rtf-baller` including ones on hidden screens; each src swap is a data-URL image decode.
31. Each new look/pose/scale combo paints a 44x64 grid with per-cell shape tests and `toDataURL` twice (frames 0 and 1) (BL:654-684); in the look chooser that is one combination per tap; LRU cap 80 (BL:682).
32. Typewriter rewrites `innerHTML` every 18ms (SC:496): cheap but continuous layout of the caption.
33. Draft count-up is a `setInterval` that only self-cancels if the node leaves the DOM (CU:762), so a re-render mid-count leaves the old interval until its next tick.
34. Fixed-position overlay + `backdrop-filter` elsewhere; scenes' `.board` glow box-shadow and large radial backgrounds are static (fine); crowd/flash/confetti animate transform/opacity only (compositor-friendly). Confetti = 46 animated nodes.
35. `--dock` is empty on `#s-car` (no `DOCK_FOR['s-car']`, IX:3700+), so the primary action `#cr-next` scrolls with content on a phone instead of sitting where the thumb is, unlike the home page.

### Pixel-scale inconsistency (sprite crispness)
36. Display heights vs the 64-row grid: `.cr-id` 96px = 1.5 css px/cell (CU:211), `.ch-cur` 80px = 1.25 (CU:230), `.cr-final` 160 = 2.5 (CU:213), `.sc-cast` `min(46vh,320px)` = arbitrary (SC:78). Non-integer device scales under `pixelated` produce uneven pixel widths, contradicting the "multiple of half a cell" note (CU:208-209). Intrinsic canvas scale also varies (2, 3, 4, 6: CU:260, CU:318, CU:590, CU:943, CU:1027, SC:446).

---

## 9. baller.js art-style spec (documentation only; do not change)

- **Grid**: 44 x 64 cells (BL:28); centre line `CX=22` between columns 21/22 (BL:189). Figure a little over four heads tall (BL:179-180). Head rows 4-17 (BL:380-383), neck 16-20, torso 18-36, shorts 35-47, legs to 56, shoes 56-62, sole row 62, ground shadow ellipse at row 63.1 (BL:662).
- **Rendering**: one `fillRect` per cell at integer `scale` (default 4, `Math.round`, min 1) to a canvas, exported as PNG data URL and LRU-cached (80) (BL:651-684). Optional soft ground shadow `rgba(0,0,0,.28)` ellipse 11x1.3 cells (BL:660-663). Output `<img class="rtf-baller" width=44*s height=64*s alt="">` (BL:687-695); CSS `image-rendering:pixelated` (CU:210, SC:78).
- **Palette approach**: every material gets a **5-step ramp** (deep shadow, shadow, base, light, highlight) built in HSL (BL:132-164): shadows shift hue toward a cool target (default 238deg, up to 28deg) and keep/raise chroma (lightness x0.46 / x0.72), highlights shift toward warm 52deg (lightness +20% / +46% of remaining). Near-black is lifted to l>=0.15 and greys get a borrowed blue hue so folds read (BL:142-143). Skin uses a `soft` ramp: cool target 355 (red), max 10deg shift, chroma reduced in shadow to avoid "sunburn" (BL:145-155, BL:280). Hair/beard cool target 250 (BL:283, BL:288). Fixed inputs: 8 skins BL:32, 8 hair colours BL:33-36, accessory colours white `#f2f2f0`, black `#1d1f24`, red `#d13a32`, gold `#e8b33c` (BL:46), sock/sole `#ecebe6`, suit trouser `#2a2e38`, shirt `#f1f1ec`, trophy `#e3a92f`, ball `#e2762a` (BL:290-295). Jacket = club c1 mixed 66% toward `#14161c` (BL:294). Jersey c1/c2 with auto-fix if c2 contrast <1.4 (BL:276); number ink via `inkOn` (>=2.6:1 else white/black) (BL:106-109).
- **Shading**: light vector (-0.52,-0.6,0.6) normalised = upper-left-front (BL:190). Each part is an analytic shape returning a surface normal: `tube()` for limbs (BL:197-209), `ellipse()` for hands/ears/ball (BL:210-215), `rows()` row-table barrels for head/torso/shoes (BL:219-228, flatness param). Dot product quantised to ramp levels at thresholds 0.9 / 0.66 / 0.22 / -0.16 (BL:252). Cloth gets `lift:-0.12` and low vertical flatness so it shades across, not diagonally (BL:348, BL:359, BL:370). Ambient occlusion `ao` on the neck (BL:340).
- **Line / outline rules**: (a) interior contact line: where a part in front meets a different-group part behind (part id order = draw order), the BEHIND cell takes its own ramp[0] (left/up) or ramp[1] (right/down) (BL:613-631); same-group parts and `line:false` parts (hair, jersey, neck, torso, beard, band, ears, cuffs, sole) don't trigger lines. (b) Selective outer outline: each empty cell 4-adjacent to the figure becomes the neighbour's ramp[0] mixed toward `INK #0d1019`: by 0.5 when the neighbour was found probing +x/+y (the figure lies right of or below the empty cell, i.e. the outline's top/left, lit side), by 0.76 otherwise (darker on the shadow side) (BL:633-645). Never a flat black ring (BL:177-178). Outline lives outside the 44x64 silhouette but inside the grid, so parts must not touch the grid edge.
- **Detail pass over shading** (BL:471-599): jersey piping in c2 where jersey meets skin; 4x6 pixel-font number (`DIGITS` BL:181-187) at row 24 with one-cell drop shade in J1[0]; shorts waistband, side stripes, hem, leg folds; sock stripes (c1/c2), shoe collar, laces, side panel; suit lapels, collar, tie (c1 or c2), two buttons, pocket square; face: brows, eyes (white+dark pupil pixels), nose highlight/shadow, mouth, cheek; stubble checker; bald highlight; hair texture by style via hashed/ patterned ramp-level nudges; hairline/brim shadow on the skin row below; cap logo; ball seams + highlight; trophy net checker and shine; knuckle line on hanging hands.
- **Customisation** (BL:30-63): skin x8, hair x10 (fade, buzz, afro, twists, braids, flattop, curly, bun, long, bald), hair colour x8, beard x4, headband x5, arm sleeve x4 (right arm only), shoes x5, build x3 (lean/standard/strong change shoulder width `bw` and limb thickness `am`, BL:296-297). Age >=33 greys hair/beard (BL:282, BL:287). `normal()` falls back per key (BL:52-63). `lookFor(seed)` FNV hash look, natural hair weighted (BL:74-87).
- **Poses** (BL:271-274, BL:303-312): `stand` (arms hanging), `ball` (right hand holding a ball at hip, BL:400-403), `up` (both arms raised), `trophy` (gold trophy held at chest, number hidden, still image), `suit` (jacket/shirt/tie/trousers/black shoes), `cap` (suit + team cap; hair reduced to buzz unless afro/long/twists/braids). Back hair layers drawn first (long, afro, afrocap, twists).
- **Animation**: two frames; frame 1 shifts everything above the knee (row 45, or 42 in suit) down one cell = the breath (BL:601-606). `img()` emits `data-b0/b1`, a single page-wide 720ms interval flips them (BL:696-705); `trophy` pose and `still:true` are single-frame; reduced motion = no timer.
- **Display sizes in use**: canvas scale 2 (hero `.ch-cur` shown at 80px; rival shown at 64px), 3 (`.cr-id` shown at 96px), 4 (builder/look sheet shown 160px, preview 128px, final card 160px), 6 (scenes, shown at `min(46vh,320px)`). See §8 item 36.
- **Debug hook**: `opts.parts` returns part-name grid for check-career (BL:608-611).
